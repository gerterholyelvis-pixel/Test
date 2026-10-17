// vbx5.js: VAULTBREAKER DEPTH (docs/reports/vaultbreaker-depth.md). Four more stations in every vaultbreaker room beside the main heist of vb5.js,
// one set per type on the shared anchors S1..S4 (the Keystone's ritual circle also uses the floor plates G1..G4), plus one room-local event per type.
// Pure logic on activity.js primitives: no I/O, no clocks, no Math.random (ctx.now / ctx.rng from the glue). vb5.js routes the S / G anchors here
// (VB5.verb / tick / hurt / leave / view / me / roundBoundary / botHint) and asks this module for the few numbers that change the main heist:
// the strike multiplier, the winch window, the pin window, the noise multiplier, the lighting time and the stocked planks.
// Channels run in the type's own vb5 state (st.ch, flagged ext:1; one channel per goblin across the room), timing attempts in st._tx (vb5 keeps st._tm).
// State: H.x = { st: {ram, locksmith, counting, keystone} (per TYPE: it moves with the type and its machines reset at the re-key),
//               me: {pid: {steady, attuned}} (this round), debts: [] (IOUs follow the goblin across rounds), log: {bribes, writs, reads} (this round) }.
(function (root) {
  const ACT = (typeof module !== 'undefined' && module.exports) ? require('./activity.js') : root.ACT;
  const ANCH = ['S1', 'S2', 'S3', 'S4', 'G1', 'G2', 'G3', 'G4'];
  const K = {
    KNOW_ROUND: 12,                                    // knowledge per goblin per round from all the vaultbreaker stations together (exempt from the tree cap)
    // ---- Battering Ram: S1 smithy, S2 siege tower, S3 barricade workshop, S4 war drum; event: the supply crate
    FORGE_MS: 3500, FORGE_COST: { metal: 3 }, HEAD_MAX: 2, HEAD_BONUS: 0.2,            // a forged ram head: +20% strike power, it dulls one level per strike
    REPAIR_MS: 2500, REPAIR_COST: { metal: 1 }, WEAR_MAX: 3, WEAR_WIN: 0.04, WIN_MIN: 0.15,   // every strike wears the winch: its timing window shrinks 0.04 per wear
    CLIMB_MS: 3000, CLIMB_ROUND: 1, CLIMB_MATCH: 3, CLIMB_KNOW: 1, CLIMB_PULSE: 6000,    // the tower: see every goblin for 6 s and a report on the vault; the vault hears about the spy
    SAW_MS: 3000, SAW_COST: { wood: 2 }, PLANK_MAX: 3, PLACE_MS: 1000, REINFORCE: 30, BAR_MAX_HP: 90, SMASH_MS: 2000,   // a stocked plank sets a barricade for nothing more (vs 2 metal or 10 elixir)
    CRATE_FIRST: 30000, CRATE_EVERY: 45000, CRATE: { wood: 1, metal: 1 }, CRATE_ROUND: 2,
    DRUM_PER: [600, 760], DRUM_WIN: 0.25, CHANT_MAX: 5, CHANT_BONUS: 0.05, CHANT_DECAY_MS: 5000, CHANT_MISS: 2,
    MUL_CAP: 1.5,                                      // head + chant together add at most +50% to a strike (a Rune Charge still doubles it)
    // ---- Locksmith: S1 key bench, S2 practice board, S3 felt table, S4 master safe; event: the shift change
    BENCH_PER: [800, 1000], BENCH_WIN: 0.14, BENCH_HITS: 3, BENCH_NOISE: 10,             // three precise cuts turn a Key Blank into a Skeleton Key
    PRAC_PER: [900, 1200], PRAC_WIN: 0.18, PRAC_HITS: 5, STEADY: 1.35, PRAC_KNOW: 1,     // five in a row: Steady Hands, the pin and bench windows are 35% wider this round
    FELT_MS: 2500, FELT_COST: { cloth: 1 }, FELT_FOR: 40000, FELT_MUL: 0.5, STRIP_MS: 2000,
    SAFE_DIALS: 3, SAFE_POS: 6, SAFE_CD: 450, SAFE_NOISE: 4, SAFE_GOLD: 30, SAFE_KNOW: 2, SAFE_ROUND: 2,
    SHIFT_FIRST: 40000, SHIFT_EVERY: 60000, SHIFT_MS: 10000, SHIFT_NOISE: 2, SHIFT_GOLD: 2,
    // ---- Counting House: S1 coin belt, S2 auction block, S3 ledger, S4 IOU vault; event: the rush
    BELT_PER: [700, 900], BELT_WIN: 0.3, BELT_N: 5, WAGE: 4, WAGE_CAP: 40, HOUSE_CUT: 1,
    RUSH_FIRST: 35000, RUSH_EVERY: 60000, RUSH_MS: 12000,
    LOT_MS: 30000, LOT_SNIPE: 8000, BID_STEP: 10, BID_MAX: 400, LOT_FEE: 0.1, LOT_MIN: 10, LOT_START: 0.4,
    LEDGER_MS: 2000, LEDGER_FEE: 5, LEDGER_ROUND: 3,
    LOAN: 40, DEBT: 50, LOAN_MATCH: 2, LOAN_LAST: 5, NOTE: 40, DEBT_ROLL: 1.2, DEBT_CAP: 100,
    // ---- Keystone: S1 carving altar, S2 + G1..G4 ritual circle, S3 offering bowl, S4 ley node; event: the ley surge
    CARVE_PER: [800, 1000], CARVE_WIN: 0.22, CARVE_HITS: 4, CARVE_COST: { metal: 1, bone: 1 }, CARVE_RES: 6, CARVE_ROUND: 1, CARVE_MATCH: 3,
    RITE_SHOW: 3000, RITE_CHAIN: 3000, RITE_BACKLASH: 5, RITE_RES: 5, RITE_KNOW: 2, ATTUNE_LIGHT: 1200, ATTUNE_FEED: 600,
    OFFER_MS: 1500, OFFER_ROUND: 2, OFFER_MATCH: 5, OFFER_KNOW: [2, 3, 4, 5, 5, 5], VISION_KNOW: 1,
    NODE_R: 2.0, NODE_EVERY: 8000, NODE_UNHURT: 1000, NODE_AFK: 12000, NODE_BURN: 6000, NODE_BURN_MAX: 45000, NODE_RES: 5, NODE_KNOW: 4,
    SURGE_FIRST: 25000, SURGE_EVERY: 45000, SURGE_MS: 12000,
  };
  let VK = { WINCH_WIN: 0.3, PIN_PER: [900, 1200], PIN_WIN: 0.18, BOX_CAP: 300, STONE_BURN: 35000 };   // vb5.js binds its own K here (bind)

  // ---------- small helpers
  const noop = () => {};
  const fx = (ctx, k, d, scope) => (ctx.fx || noop)(k, d || {}, scope || 'room');
  const fxTo = (ctx, p, k, d) => (ctx.fxTo ? ctx.fxTo(p, k, d || {}) : fx(ctx, k, Object.assign({ id: p.id }, d || {})));
  const say = (ctx, p, text) => (ctx.toast || noop)(p, text);
  const player = (ctx, id) => (ctx.player ? ctx.player(id) : null);
  const hasItem = (ctx, p, k) => !!(ctx.hasItem && ctx.hasItem(p, k));
  const canPay = (ctx, p, c) => !ctx.spend || ctx.spend(p, c, true);
  const pay = (ctx, p, c) => !ctx.spend || ctx.spend(p, c);
  const lim = (H, p, k, r, m) => ACT.limit.ok(H.limits, p, k, r, m);
  const used = (H, p, k) => ACT.limit.used(H.limits, p, k).round;
  const limUse = (H, p, k, n) => ACT.limit.use(H.limits, p, k, n);
  const nameOf = p => (p && p.name) || 'A goblin';
  const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const meOf = (H, id) => H.x.me[id] || (H.x.me[id] = {});
  const box = (H, n) => { const c = H.st.counting; c._box = Math.max(0, Math.min(VK.BOX_CAP, (c._box || 0) + n)); };
  // knowledge from a station: the shared vaultbreaker cap (KNOW_ROUND), then the reward path of the glue (exempt from the tree caps)
  function know(H, ctx, p, n, src) {
    const k = Math.max(0, Math.min(n, K.KNOW_ROUND - used(H, p, 'vbk'))); if (k <= 0) return 0;
    limUse(H, p, 'vbk', k); const r = ctx.award ? ctx.award(p, { know: k, exempt: true }, src) : null; return r && r.know != null ? r.know : k;
  }
  const gold = (ctx, p, n, src) => { if (n > 0 && ctx.award) ctx.award(p, { gold: n }, src); else if (n > 0 && ctx.pay) ctx.pay(p, n); };

  // ---------- channels (in the vb5 type state, so the HUD arc, `stop`, hits and leaving already handle them) and timing attempts (st._tx)
  function chStart(st, ctx, p, kind, ms, anchor, arg) {
    const mine = st.ch.find(c => c.pid === p.id);
    if (mine) return mine.k === kind && mine.anchor === anchor ? null : 'busy';
    if (st.ch.some(c => c.anchor === anchor)) return 'busy';                          // one goblin per station
    const c = ACT.channel.make(), e = ACT.channel.start(c, p, ctx.now, ms, { anchor }); if (e) return e;
    c.k = kind; c.arg = arg == null ? 0 : arg; c.pid = p.id; c.at = anchor; c.ext = 1; st.ch.push(c); return null;
  }
  function chRun(H, t, st, ctx) {
    for (const c of st.ch.slice()) {
      if (!c.ext) continue;
      const p = player(ctx, c.pid), r = ACT.channel.update(c, p, ctx.now);
      if (r === 'run') continue;
      st.ch.splice(st.ch.indexOf(c), 1);
      if (r === 'done' && p && DONE[t][c.k]) DONE[t][c.k](H, st, H.x.st[t], p, c, ctx);
    }
  }
  function txOpen(st, ctx, p, anchor, o) { (st._tx || (st._tx = {}))[p.id] = { anchor, o, tm: ACT.timing.open(ctx.rng, ctx.now, Object.assign({ ttl: 3000, by: p.id }, o)) }; }
  function txTap(st, ctx, p, anchor) {   // -> 'hit' | 'miss' | null; opens the next attempt at once (a new period and window every time)
    const e = st._tx && st._tx[p.id]; if (!e || e.anchor !== anchor) return null;
    const res = p.bot ? (ctx.rng() < 0.45 + 0.3 * (p.skill || 0) ? 'hit' : 'miss') : p._dbgHit ? 'hit' : ACT.timing.judge(e.tm, ctx.now, { lat: p.lat || 0 });
    txOpen(st, ctx, p, anchor, e.o); if (ctx.H) ctx.H._tap = res; return res;
  }
  const txClose = (st, id) => { if (st._tx) delete st._tx[id]; };

  // =================================================================================================
  // BATTERING RAM
  // =================================================================================================
  const ramX = now => ({ head: 0, wear: 0, planks: 0, crate: 0, crateAt: now + K.CRATE_FIRST, chant: 0, chantAt: 0, loud: 0 });
  function chantSettle(x, now) { while (x.chant > 0 && now - x.chantAt >= K.CHANT_DECAY_MS) { x.chant--; x.chantAt += K.CHANT_DECAY_MS; } }
  function ramVerb(H, st, x, p, v, a, arg, ctx) {
    if (a === 'S1') {   // the smithy: forge a ram head (x 0) or repair the winch (x 1)
      if (v !== 'use') return 'state';
      if (arg === 1) { if (x.wear < 1) return 'state'; if (!canPay(ctx, p, K.REPAIR_COST)) return 'cost'; return chStart(st, ctx, p, 'repair', K.REPAIR_MS, a); }
      if (x.head >= K.HEAD_MAX) return 'cap'; if (!canPay(ctx, p, K.FORGE_COST)) return 'cost';
      return chStart(st, ctx, p, 'forge', K.FORGE_MS, a);
    }
    if (a === 'S2') {   // the siege tower
      if (v !== 'use') return 'state'; if (!lim(H, p, 'climb', K.CLIMB_ROUND, K.CLIMB_MATCH)) return 'cap';
      return chStart(st, ctx, p, 'climb', K.CLIMB_MS, a);
    }
    if (a === 'S3') {   // the barricade workshop: saw planks (use 0), reinforce the barricade (use 1), smash a plank (choose 9), the supply crate (pick)
      if (v === 'pick') {
        if (!x.crate) return 'state'; if (!lim(H, p, 'crate', K.CRATE_ROUND, null)) return 'cap';
        x.crate = 0; x.crateAt = ctx.now + K.CRATE_EVERY; limUse(H, p, 'crate'); if (ctx.parts) ctx.parts(p, K.CRATE); fx(ctx, 'crate', {}); return null;
      }
      if (v === 'choose') { if (arg !== 9 || x.planks < 1) return 'state'; return chStart(st, ctx, p, 'smash', K.SMASH_MS, a); }
      if (v !== 'use') return 'state';
      if (arg === 1) { if (!st.bar || x.planks < 1) return 'state'; if (st.bar.hp >= K.BAR_MAX_HP) return 'cap'; return chStart(st, ctx, p, 'reinforce', K.PLACE_MS, a); }
      if (x.planks >= K.PLANK_MAX) return 'cap'; if (!canPay(ctx, p, K.SAW_COST)) return 'cost';
      return chStart(st, ctx, p, 'saw', K.SAW_MS, a);
    }
    if (a === 'S4') {   // the war drum: a rhythm of timing presses builds the chant
      if (v === 'use') { txOpen(st, ctx, p, a, { per: K.DRUM_PER, win: K.DRUM_WIN }); return null; }
      if (v !== 'tap') return 'state';
      chantSettle(x, ctx.now); const r = txTap(st, ctx, p, a); if (!r) return 'state';
      if (r === 'hit') {
        x.chant = Math.min(K.CHANT_MAX, x.chant + 1);
        if (x.chant >= K.CHANT_MAX && !x.loud) { x.loud = 1; (ctx.toastAll || noop)('War drums thunder in the Battering Ram room'); }   // publicity
      } else x.chant = Math.max(0, x.chant - K.CHANT_MISS);
      x.chantAt = ctx.now; fx(ctx, 'drum', { chant: x.chant }); return null;
    }
    return 'state';
  }
  const ramDone = {
    forge(H, st, x, p, c, ctx) { if (x.head >= K.HEAD_MAX || !pay(ctx, p, K.FORGE_COST)) return; x.head++; fx(ctx, 'forged', { head: x.head }); },
    repair(H, st, x, p, c, ctx) { if (x.wear < 1 || !pay(ctx, p, K.REPAIR_COST)) return; x.wear = 0; fx(ctx, 'repaired', {}); },
    climb(H, st, x, p, c, ctx) {
      if (!lim(H, p, 'climb', K.CLIMB_ROUND, K.CLIMB_MATCH)) return; limUse(H, p, 'climb');
      if (ctx.award) ctx.award(p, { pulse: { ms: K.CLIMB_PULSE } }, 'vbx:tower');
      const rep = ctx.intel ? ctx.intel('vault', p) : null; if (rep) say(ctx, p, rep);
      know(H, ctx, p, K.CLIMB_KNOW, 'vbx:tower');
      if (ctx.toastVault) ctx.toastVault('Someone is watching the vault from the siege tower');
      fx(ctx, 'tower', {});
    },
    saw(H, st, x, p, c, ctx) { if (x.planks >= K.PLANK_MAX || !pay(ctx, p, K.SAW_COST)) return; x.planks++; fx(ctx, 'sawn', { planks: x.planks }); },
    reinforce(H, st, x, p, c, ctx) { if (!st.bar || x.planks < 1) return; x.planks--; st.bar.hp = Math.min(K.BAR_MAX_HP, st.bar.hp + K.REINFORCE); st.bar.max = Math.max(st.bar.max || 0, st.bar.hp); fx(ctx, 'barplace', {}); },
    smash(H, st, x, p, c, ctx) { if (x.planks < 1) return; x.planks--; fx(ctx, 'smashed', { planks: x.planks }); },
  };
  function ramTick(H, st, x, ctx) {
    chantSettle(x, ctx.now);
    if (!x.crate && ctx.now >= x.crateAt) { x.crate = 1; fx(ctx, 'crateland', {}); }   // room event: a supply crate lands on the workshop bench
  }

  // =================================================================================================
  // LOCKSMITH
  // =================================================================================================
  function newSafe(rng) { const t = [], v = []; for (let i = 0; i < K.SAFE_DIALS; i++) { t.push(Math.floor(rng() * K.SAFE_POS)); v.push(Math.floor(rng() * K.SAFE_POS)); } if (v.every((q, i) => q === t[i])) v[0] = (v[0] + 1) % K.SAFE_POS; return ACT.sequence.dials(t, K.SAFE_POS, v); }
  const lsX = (rng, now) => ({ felt: 0, safe: newSafe(rng), opened: 0, shiftAt: now + K.SHIFT_FIRST, shiftUntil: 0, prog: {}, streak: {}, cd: {}, known: {} });
  const noiseMul = (H, now) => { const x = H.x && H.x.st.locksmith; if (!x) return 1; return (x.felt > now ? K.FELT_MUL : 1) * (x.shiftUntil > now ? K.SHIFT_NOISE : 1); };
  const pinMul = (H, p) => (H.x && p && H.x.me[p.id] && H.x.me[p.id].steady === H.round ? K.STEADY : 1);
  const noise = (H, ctx, n) => { const s = H.st.locksmith; ACT.heat.add(s.heat, n * noiseMul(H, ctx.now), ctx.now); };   // vb5's tick fires the thresholds (loud, alarm)
  function lsVerb(H, st, x, p, v, a, arg, ctx) {
    if (a === 'S1') {   // the key-cutting bench: a Key Blank becomes a Skeleton Key after three precise cuts
      if (v === 'use') {
        if (!hasItem(ctx, p, 'x:blank')) return 'item'; if (!lim(H, p, 'sk', 1, null)) return 'cap'; if (hasItem(ctx, p, 'x:skeleton')) return 'item';
        txOpen(st, ctx, p, a, { per: K.BENCH_PER, win: Math.min(0.5, K.BENCH_WIN * pinMul(H, p)) }); return null;
      }
      if (v !== 'tap') return 'state';
      const r = txTap(st, ctx, p, a); if (!r) return 'state';
      if (r === 'miss') { x.prog[p.id] = 0; noise(H, ctx, K.BENCH_NOISE); fx(ctx, 'scrape', {}); return null; }
      x.prog[p.id] = (x.prog[p.id] || 0) + 1;
      if (x.prog[p.id] >= K.BENCH_HITS) {
        x.prog[p.id] = 0; txClose(st, p.id);
        if (!lim(H, p, 'sk', 1, null) || !(ctx.takeItem && ctx.takeItem(p, 'x:blank'))) return null;
        if (ctx.giveItem && ctx.giveItem(p, 'x:skeleton')) { limUse(H, p, 'sk'); fx(ctx, 'keycut', {}); } else if (ctx.giveItem) ctx.giveItem(p, 'x:blank');
      }
      return null;
    }
    if (a === 'S2') {   // the practice board: five pins in a row, no noise: Steady Hands for this round
      if (v === 'use') { if (meOf(H, p.id).steady === H.round) return 'state'; if (!lim(H, p, 'prac', 1, null)) return 'cap'; txOpen(st, ctx, p, a, { per: K.PRAC_PER, win: K.PRAC_WIN }); return null; }
      if (v !== 'tap') return 'state';
      const r = txTap(st, ctx, p, a); if (!r) return 'state';
      if (r === 'miss') { x.streak[p.id] = 0; return null; }
      x.streak[p.id] = (x.streak[p.id] || 0) + 1;
      if (x.streak[p.id] >= K.PRAC_HITS && lim(H, p, 'prac', 1, null)) { x.streak[p.id] = 0; txClose(st, p.id); limUse(H, p, 'prac'); meOf(H, p.id).steady = H.round; know(H, ctx, p, K.PRAC_KNOW, 'vbx:practice'); fxTo(ctx, p, 'steady', {}); }
      return null;
    }
    if (a === 'S3') {   // the felt table: wrap the tools (1 cloth, 40 s of half noise for the whole room); strip it (choose 9)
      if (v === 'choose') { if (arg !== 9 || !(x.felt > ctx.now)) return 'state'; return chStart(st, ctx, p, 'strip', K.STRIP_MS, a); }
      if (v !== 'use') return 'state'; if (x.felt > ctx.now) return 'state'; if (!canPay(ctx, p, K.FELT_COST)) return 'cost';
      return chStart(st, ctx, p, 'felt', K.FELT_MS, a);
    }
    if (a === 'S4') {   // the master safe: turn a dial (x 0..2); a click tells only the goblin who turned it that the dial sits right
      if (v !== 'use') return 'state';
      if (!(arg >= 0 && arg < K.SAFE_DIALS)) return 'state'; if (x.opened >= K.SAFE_ROUND) return 'state'; if (!lim(H, p, 'safe', 1, null)) return 'cap';
      if (ctx.now < (x.cd[p.id] || 0)) return 'cool'; x.cd[p.id] = ctx.now + K.SAFE_CD;
      ACT.sequence.turn(x.safe, arg); noise(H, ctx, K.SAFE_NOISE);
      const kn = x.known[p.id] || (x.known[p.id] = {});
      if (x.safe.v[arg] === x.safe.target[arg]) { kn[arg] = x.safe.v[arg]; fxTo(ctx, p, 'click', { d: arg }); }
      if (ACT.sequence.solved(x.safe)) {
        const shift = x.shiftUntil > ctx.now; limUse(H, p, 'safe'); x.opened++;
        gold(ctx, p, K.SAFE_GOLD * (shift ? K.SHIFT_GOLD : 1), 'vbx:safe'); know(H, ctx, p, K.SAFE_KNOW, 'vbx:safe');
        if (!hasItem(ctx, p, 'x:blank') && ctx.giveItem) ctx.giveItem(p, 'x:blank');
        x.safe = newSafe(ctx.rng); x.known = {}; fx(ctx, 'safeopen', { by: p.id });
      }
      return null;
    }
    return 'state';
  }
  const lsDone = {
    felt(H, st, x, p, c, ctx) { if (x.felt > ctx.now || !pay(ctx, p, K.FELT_COST)) return; x.felt = ctx.now + K.FELT_FOR; fx(ctx, 'felt', { until: x.felt }); },
    strip(H, st, x, p, c, ctx) { if (!(x.felt > ctx.now)) return; x.felt = 0; fx(ctx, 'strip', {}); },
  };
  function lsTick(H, st, x, ctx) {
    if (ctx.now >= x.shiftAt) { x.shiftUntil = ctx.now + K.SHIFT_MS; x.shiftAt = ctx.now + K.SHIFT_EVERY; fx(ctx, 'shift', { until: x.shiftUntil }); }   // room event: the shift change
  }

  // =================================================================================================
  // COUNTING HOUSE
  // =================================================================================================
  const coX = now => ({ lot: null, rushAt: now + K.RUSH_FIRST, rushUntil: 0, sorted: {} });
  const debtOf = (H, id) => H.x.debts.find(d => d.by === id) || null;
  const offerable = (ctx, k) => { const it = k && ctx.items ? ctx.items[k] : null; return !!it && it.price > 0 && !it.act5 && !/^x:(blank|skeleton|goldleaf|runecharge|ironwedge|crownseal|huskbrain|scion)$/.test(k); };
  function settleNote(H, ctx, d, n) {   // n gold reached the note's owner: a goblin, or the house (the strongbox)
    const o = d.owner != null ? player(ctx, d.owner) : null;
    if (o && ctx.pay) ctx.pay(o, n); else box(H, n);
  }
  function lotResolve(H, ctx) {
    const x = H.x.st.counting, L = x.lot; if (!L) return; x.lot = null;
    const seller = player(ctx, L.seller), give = (q, k) => (ctx.give ? ctx.give(q, k) : ctx.giveItem && ctx.giveItem(q, k));
    if (L.by != null) {
      const w = player(ctx, L.by);
      if (w && w.alive !== false) {
        give(w, L.key); const fee = Math.ceil(L.bid * K.LOT_FEE); box(H, fee);
        if (seller && ctx.pay) ctx.pay(seller, L.bid - fee); else box(H, L.bid - fee);
        fx(ctx, 'sold', { key: L.key, bid: L.bid, by: L.by }); if (w.name) (ctx.toastRoom || noop)(nameOf(w) + ' won the ' + (L.name || 'lot') + ' for ' + L.bid + ' gold');
        return;
      }
      box(H, L.bid);   // the winner is gone: his escrow stays with the house, the lot goes back
    }
    if (seller) give(seller, L.key); fx(ctx, 'unsold', { key: L.key });
  }
  function ledgerLines(H, ctx) {
    const sum = list => { const o = {}; for (const e of list) o[e.name] = (o[e.name] || 0) + e.n; return Object.keys(o).map(k => k + ' ' + o[k]).join(', '); };
    const L = H.x.log, br = L.bribes, wr = L.writs.filter(w => w.k === 0), cw = L.writs.filter(w => w.k === 1);
    const out = ['Bribes: ' + (br.length ? sum(br.map(b => ({ name: b.name + (b.where ? ' (' + b.where + ')' : ''), n: b.n }))) + ' gold' : 'none this round')];
    out.push('Writs: ' + (wr.length ? sum(wr.map(w => ({ name: w.name, n: 1 }))) : 'none') + (cw.length ? '; counter-writs: ' + sum(cw.map(w => ({ name: w.name, n: 1 }))) : ''));
    out.push('IOUs: ' + (H.x.debts.length ? H.x.debts.map(d => d.name + ' owes ' + d.amt + ' to ' + (d.owner == null ? 'the house' : d.ownerName)).join(', ') : 'none'));
    if (L.reads.length) out.push('Read by: ' + L.reads.slice(-3).join(', '));
    return out;
  }
  function coVerb(H, st, x, p, v, a, arg, ctx) {
    if (a === 'S1') {   // the coin-sorting belt: timing presses; every 5 sorted coins pay a wage (40 gold a round at most)
      if (v === 'use') { if (used(H, p, 'wage') >= K.WAGE_CAP) return 'cap'; txOpen(st, ctx, p, a, { per: K.BELT_PER, win: K.BELT_WIN }); return null; }
      if (v !== 'tap') return 'state';
      const r = txTap(st, ctx, p, a); if (!r) return 'state'; if (r === 'miss') return null;
      x.sorted[p.id] = (x.sorted[p.id] || 0) + 1; fx(ctx, 'sort', {});
      if (x.sorted[p.id] >= K.BELT_N) {
        x.sorted[p.id] = 0;
        const n = Math.min(K.WAGE * (x.rushUntil > ctx.now ? 2 : 1), K.WAGE_CAP - used(H, p, 'wage'));
        if (n > 0) { limUse(H, p, 'wage', n); gold(ctx, p, n, 'vbx:belt'); box(H, K.HOUSE_CUT); }
        if (used(H, p, 'wage') >= K.WAGE_CAP) txClose(st, p.id);
      }
      return null;
    }
    if (a === 'S2') {   // the auction block: consign an item (use x = slot), bid (buy), withdraw an unbid lot (choose 9)
      const L = x.lot;
      if (v === 'use') {
        if (L) return 'busy'; if (!Number.isInteger(arg) || arg < 0 || arg > 11) return 'state';
        const k = ctx.peek ? ctx.peek(p, arg) : null; if (!k || !offerable(ctx, k)) return 'item';
        if (!(ctx.take && ctx.take(p, arg))) return 'item';
        const it = ctx.items[k]; x.lot = { key: k, name: it.name, price: it.price, seller: p.id, sname: nameOf(p), min: Math.max(K.LOT_MIN, Math.round(it.price * K.LOT_START / 5) * 5), bid: 0, by: null, bname: null, until: ctx.now + K.LOT_MS };
        fx(ctx, 'lot', { key: k }); return null;
      }
      if (v === 'buy') {
        if (!L || ctx.now >= L.until) return 'state'; if (L.seller === p.id || L.by === p.id) return 'state';
        const amt = L.by != null ? L.bid + K.BID_STEP : L.min; if (amt > K.BID_MAX) return 'cap';
        if (!pay(ctx, p, { gold: amt })) return 'cost';
        if (L.by != null) { const prev = player(ctx, L.by); if (prev && ctx.pay) ctx.pay(prev, L.bid); else box(H, L.bid); }
        L.bid = amt; L.by = p.id; L.bname = nameOf(p); L.until = Math.max(L.until, ctx.now + K.LOT_SNIPE); fx(ctx, 'bid', { bid: amt }); return null;
      }
      if (v === 'choose') { if (arg !== 9 || !L || L.seller !== p.id || L.by != null) return 'state'; x.lot = null; if (ctx.give) ctx.give(p, L.key); else if (ctx.giveItem) ctx.giveItem(p, L.key); return null; }
      return 'state';
    }
    if (a === 'S3') {   // the ledger: who bribed what this round, the writs, the IOUs (5 gold to the clerk)
      if (v !== 'use') return 'state'; if (!lim(H, p, 'ledger', K.LEDGER_ROUND, null)) return 'cap'; if (!canPay(ctx, p, { gold: K.LEDGER_FEE })) return 'cost';
      return chStart(st, ctx, p, 'ledger', K.LEDGER_MS, a);
    }
    if (a === 'S4') {   // the vault of IOUs: borrow (use 0), buy a house note (buy), repay early (choose 0)
      const d = debtOf(H, p.id);
      if (v === 'use') {
        if (ctx.sudden || H.round > K.LOAN_LAST) return 'state'; if (d) return 'state'; if (!lim(H, p, 'loan', null, K.LOAN_MATCH)) return 'cap';
        if ((H.st.counting._box || 0) < K.LOAN) return 'state';   // the house lends from the strongbox
        box(H, -K.LOAN); limUse(H, p, 'loan'); gold(ctx, p, K.LOAN, 'vbx:loan');
        H.x.debts.push({ id: ++H.x.seq, by: p.id, name: nameOf(p), owner: null, ownerName: null, amt: K.DEBT, due: H.round + 1 }); fx(ctx, 'loan', {}); return null;
      }
      if (v === 'buy') {
        const n = H.x.debts.find(q => q.owner == null && q.by !== p.id); if (!n) return 'state';
        if (!pay(ctx, p, { gold: K.NOTE })) return 'cost'; box(H, K.NOTE); n.owner = p.id; n.ownerName = nameOf(p); fx(ctx, 'note', {}); return null;
      }
      if (v === 'choose') {
        if (!d) return 'state'; if (!pay(ctx, p, { gold: d.amt })) return 'cost';
        settleNote(H, ctx, d, d.amt); H.x.debts.splice(H.x.debts.indexOf(d), 1); fx(ctx, 'repaid', {}); return null;
      }
      return 'state';
    }
    return 'state';
  }
  const coDone = {
    ledger(H, st, x, p, c, ctx) {
      if (!lim(H, p, 'ledger', K.LEDGER_ROUND, null) || !pay(ctx, p, { gold: K.LEDGER_FEE })) return;
      limUse(H, p, 'ledger'); box(H, K.LEDGER_FEE);
      fxTo(ctx, p, 'ledger', { lines: ledgerLines(H, ctx) }); H.x.log.reads.push(nameOf(p));
      if (lim(H, p, 'ledk', 1, null)) { limUse(H, p, 'ledk'); know(H, ctx, p, 1, 'vbx:ledger'); }
    },
  };
  function coTick(H, st, x, ctx) {
    if (x.lot && ctx.now >= x.lot.until) lotResolve(H, ctx);
    if (ctx.now >= x.rushAt) { x.rushUntil = ctx.now + K.RUSH_MS; x.rushAt = ctx.now + K.RUSH_EVERY; fx(ctx, 'rush', { until: x.rushUntil }); }   // room event: the rush (double wages)
  }
  // the round end: due IOUs are collected from whatever the debtor carries; the rest rolls over with 20% added
  function collect(H, ctx) {
    for (const d of H.x.debts.slice()) {
      if (H.round < d.due) continue;
      const q = player(ctx, d.by); if (!q) { H.x.debts.splice(H.x.debts.indexOf(d), 1); continue; }   // left the match: the note is void
      const n = Math.min(Math.max(0, Math.floor(q.gold || 0)), d.amt);
      if (n > 0 && pay(ctx, q, { gold: n })) settleNote(H, ctx, d, n);
      const rest = d.amt - (n > 0 ? n : 0);
      if (rest <= 0) { H.x.debts.splice(H.x.debts.indexOf(d), 1); say(ctx, q, 'The Counting House collected your IOU (' + d.amt + ' gold)'); }
      else { d.amt = Math.min(K.DEBT_CAP, Math.ceil(rest * K.DEBT_ROLL)); d.due = H.round + 1; say(ctx, q, 'You still owe ' + d.amt + ' gold to ' + (d.owner == null ? 'the Counting House' : d.ownerName)); }
    }
  }

  // =================================================================================================
  // KEYSTONE
  // =================================================================================================
  const ksX = now => ({ rite: null, node: ACT.capture.make(), act: {}, surgeAt: now + K.SURGE_FIRST, surgeUntil: 0, carve: {} });
  const attuned = (H, p) => !!(H.x && p && H.x.me[p.id] && H.x.me[p.id].attuned === H.round);
  const resonance = (H, n, now) => { const h = H.st.keystone.heat; ACT.heat.level(h, now); h.v = Math.max(0, h.v + n); };
  function ksVerb(H, st, x, p, v, a, arg, ctx) {
    if (a === 'S1') {   // the carving altar: four strokes carve a Rune Charge (1 metal, 1 bone, paid when a carving starts)
      if (v === 'use') {
        if (hasItem(ctx, p, 'x:runecharge')) return 'item'; if (!lim(H, p, 'carve', K.CARVE_ROUND, K.CARVE_MATCH)) return 'cap';
        if (!x.carve[p.id]) { if (!pay(ctx, p, K.CARVE_COST)) return 'cost'; x.carve[p.id] = { n: 0 }; }
        txOpen(st, ctx, p, a, { per: K.CARVE_PER, win: K.CARVE_WIN }); return null;
      }
      if (v !== 'tap') return 'state';
      const c = x.carve[p.id], r = txTap(st, ctx, p, a); if (!r || !c) return 'state';
      if (r === 'miss') { c.n = Math.max(0, c.n - 1); resonance(H, K.CARVE_RES, ctx.now); fx(ctx, 'chip', {}); return null; }
      c.n++; fx(ctx, 'stroke', { n: c.n });
      if (c.n >= K.CARVE_HITS) {
        txClose(st, p.id);
        if (ctx.giveItem && ctx.giveItem(p, 'x:runecharge')) { delete x.carve[p.id]; limUse(H, p, 'carve'); fx(ctx, 'carved', {}); } else c.n = K.CARVE_HITS - 1;
      }
      return null;
    }
    if (a === 'S2') {   // the ritual circle: show the order on the four plates for 3 s, then step on them in that order (G1..G4)
      if (v !== 'use') return 'state';
      if (attuned(H, p)) return 'state'; if (!lim(H, p, 'rite', 1, null)) return 'cap';
      if (x.rite && x.rite.by !== p.id && ctx.now < x.rite.end) return 'busy';
      const target = shuffle([0, 1, 2, 3], ctx.rng);
      x.rite = { target, seq: ACT.sequence.make(target, K.RITE_CHAIN), show: ctx.now + K.RITE_SHOW, end: ctx.now + K.RITE_SHOW + K.RITE_CHAIN, by: p.id };
      fx(ctx, 'rite', {}); return null;
    }
    if (a[0] === 'G') {
      if (v !== 'use') return 'state'; const R = x.rite; if (!R) return 'state'; if (ctx.now < R.show) return 'cool';
      const i = +a[1] - 1, res = p.id !== R.by ? 'fail' : ACT.sequence.press(R.seq, i, ctx.now, p.id);   // touching another goblin's rite breaks it
      if (res === 'ok') { R.end = ctx.now + K.RITE_CHAIN; fx(ctx, 'glyph', { i }); return null; }
      x.rite = null;
      if (res === 'done') { meOf(H, R.by).attuned = H.round; limUse(H, p, 'rite'); know(H, ctx, p, K.RITE_KNOW, 'vbx:rite'); fx(ctx, 'attuned', { by: p.id }); return null; }
      if (ctx.dmg) ctx.dmg(p, K.RITE_BACKLASH, 'backlash'); resonance(H, K.RITE_RES, ctx.now); fx(ctx, 'backlash', {}); return null;
    }
    if (a === 'S3') {   // the offering bowl: gear for knowledge by tier; a Rune Charge or Gold Leaf buys a vision of the next re-key
      if (v !== 'use') return 'state'; if (!Number.isInteger(arg) || arg < 0 || arg > 11) return 'state'; if (!lim(H, p, 'offer', K.OFFER_ROUND, K.OFFER_MATCH)) return 'cap';
      const k = ctx.peek ? ctx.peek(p, arg) : null, it = k && ctx.items ? ctx.items[k] : null;
      const ok = k === 'x:runecharge' || k === 'x:goldleaf' || (it && (it.type === 'weapon' || it.type === 'armor' || it.type === 'charm') && it.price > 0);
      if (!ok) return 'item';
      const e = chStart(st, ctx, p, 'offer', K.OFFER_MS, a, arg); if (e) return e; const c = st.ch.find(q => q.pid === p.id && q.ext); if (c) { c.key = k; c.arg = arg; } return null;
    }
    if (a === 'S4') { if (v !== 'use') return 'state'; x.act[p.id] = ctx.now; return null; }   // attune to the ley node: stand on it and touch it now and then (afk guard)
    return 'state';
  }
  const ksDone = {
    offer(H, st, x, p, c, ctx) {
      const k = ctx.peek ? ctx.peek(p, c.arg) : null; if (!k || k !== c.key || !lim(H, p, 'offer', K.OFFER_ROUND, K.OFFER_MATCH)) return;
      if (!(ctx.take && ctx.take(p, c.arg))) return; limUse(H, p, 'offer');
      if (k === 'x:runecharge' || k === 'x:goldleaf') { if (ctx.award) ctx.award(p, { pulse: { vbNext: 1 } }, 'vbx:offer'); know(H, ctx, p, K.VISION_KNOW, 'vbx:offer'); fx(ctx, 'vision', {}); return; }
      const it = ctx.items[k]; know(H, ctx, p, K.OFFER_KNOW[Math.max(0, Math.min(5, it.tierN | 0))], 'vbx:offer'); fx(ctx, 'offered', {});
    },
  };
  function ksTick(H, st, x, ctx, dt) {
    const now = ctx.now;
    if (x.rite && now > x.rite.end) { x.rite = null; fx(ctx, 'ritefade', {}); }
    if (now >= x.surgeAt) { x.surgeUntil = now + K.SURGE_MS; x.surgeAt = now + K.SURGE_EVERY; fx(ctx, 'surge', { until: x.surgeUntil }); }   // room event: the ley surge (double)
    const an = ctx.anchor ? ctx.anchor('S4') : null; if (!an) return;
    const occ = (ctx.occupants ? ctx.occupants() : []).filter(q => q.alive !== false && Math.hypot(q.x - an.x, q.z - an.z) <= K.NODE_R)
      .map(q => ({ id: q.id, hurtAt: q.hurtAt, activeAt: q.bot ? now : x.act[q.id], alive: true }));
    const r = ACT.capture.step(x.node, occ, dt || 100, { now, every: K.NODE_EVERY, unhurtMs: K.NODE_UNHURT, afkMs: K.NODE_AFK });
    for (let i = 0; i < r.paid; i++) {
      const q = player(ctx, r.holder); if (!q) break;
      const surge = x.surgeUntil > now, ks = H.st.keystone, cap = now + K.NODE_BURN_MAX;
      for (let s = 0; s < 4; s++) if (ks.lit[s] > now) ks.lit[s] = Math.min(cap, ks.lit[s] + K.NODE_BURN * (surge ? 2 : 1));   // the ley line feeds every burning stone
      resonance(H, -K.NODE_RES, now);
      const k = Math.min(surge ? 2 : 1, K.NODE_KNOW - used(H, q, 'node')); if (k > 0) { limUse(H, q, 'node', k); know(H, ctx, q, k, 'vbx:ley'); }
      fx(ctx, 'ley', { by: q.id });
    }
  }
  const lightMs = (H, p, base) => (attuned(H, p) ? K.ATTUNE_LIGHT : base);
  const feedMs = (H, p, base) => (attuned(H, p) ? K.ATTUNE_FEED : base);

  // =================================================================================================
  // dispatch, lifecycle, views
  // =================================================================================================
  const VERB = { ram: ramVerb, locksmith: lsVerb, counting: coVerb, keystone: ksVerb };
  const DONE = { ram: ramDone, locksmith: lsDone, counting: coDone, keystone: ksDone };
  const TICK = { ram: ramTick, locksmith: lsTick, counting: coTick, keystone: ksTick };
  const INIT = { ram: (rng, now) => ramX(now), locksmith: (rng, now) => lsX(rng, now), counting: (rng, now) => coX(now), keystone: (rng, now) => ksX(now) };
  function attach(H, rng, now) {
    H.x = { st: {}, me: {}, debts: [], seq: 0, log: { bribes: [], writs: [], reads: [] } };
    for (const t of Object.keys(INIT)) H.x.st[t] = INIT[t](rng, now);
    return H.x;
  }
  const owns = a => ANCH.includes(a);
  function verb(H, t, p, v, arg, ctx) {
    if (!H.x || !VERB[t]) return 'state';
    const st = H.st[t]; if (!st.ch) st.ch = [];
    if (v === 'stop') { for (const c of st.ch.slice()) if (c.pid === p.id) { ACT.channel.cancel(c); st.ch.splice(st.ch.indexOf(c), 1); } txClose(st, p.id); return null; }
    return VERB[t](H, st, H.x.st[t], p, v, ctx.a, arg, ctx);
  }
  function tick(H, t, ctx, dt) { if (!H.x || !TICK[t]) return; const st = H.st[t]; chRun(H, t, st, ctx); TICK[t](H, st, H.x.st[t], ctx, dt); }
  function leave(H, t, p) { if (!H.x) return; const st = H.st[t]; txClose(st, p.id); if (t === 'keystone') { const R = H.x.st.keystone.rite; if (R && R.by === p.id) H.x.st.keystone.rite = null; } }
  function hurt(H, t, p) { if (!H.x) return; txClose(H.st[t], p.id); }
  // the round end, BEFORE the types move: auctions resolve, due IOUs are collected, the machines of every type reset (persistence rule: pockets and doors keep, machines reset)
  function roundEnd(H, ctxOf) {
    if (!H.x) return;
    try { lotResolve(H, ctxOf('counting')); } catch (e) { H.x.st.counting.lot = null; }
    collect(H, ctxOf('counting'));
  }
  function rekey(H, t, ctx) { if (!H.x) return; H.x.st[t] = INIT[t](ctx.rng || H.rng, ctx.now || 0); if (H.st[t]) H.st[t]._tx = {}; }
  function newRound(H) { if (!H.x) return; H.x.me = {}; H.x.log = { bribes: [], writs: [], reads: [] }; }
  const left = (until, now) => (until > now ? until : 0);
  function view(H, t, now) {
    const x = H.x && H.x.st[t]; if (!x) return null;
    const st = H.st[t], run = (st && st.ch ? st.ch.filter(c => c.ext).map(c => c.anchor) : []);   // stations with a running channel (the props animate)
    if (t === 'ram') { chantSettle(x, now); return { head: x.head, wear: x.wear, planks: x.planks, crate: x.crate, chant: x.chant, run }; }
    if (t === 'locksmith') return { felt: left(x.felt, now), safe: x.safe.v.slice(), opened: x.opened, jam: x.opened >= K.SAFE_ROUND ? 1 : 0, shift: left(x.shiftUntil, now), run };
    if (t === 'counting') {
      const L = x.lot;
      return { lot: L ? { key: L.key, name: L.name, seller: L.sname, sid: L.seller, bid: L.bid, next: L.by != null ? L.bid + K.BID_STEP : L.min, by: L.bname, bid0: L.by, until: L.until } : null,
        rush: left(x.rushUntil, now), notes: H.x.debts.filter(d => d.owner == null).length, debts: H.x.debts.length, run };
    }
    const R = x.rite;
    return { rite: R ? { by: R.by, show: R.show > now ? R.target.slice() : null, showUntil: R.show, pos: R.seq.pos } : null,
      node: { holder: x.node.holder, contested: !!x.node.contested }, surge: left(x.surgeUntil, now), run };
  }
  // my own part: the station progress, my round bonuses, my IOU
  function meX(H, t, id) {
    if (!H.x) return null;
    const me = H.x.me[id] || {}, x = H.x.st[t], d = debtOf(H, id), o = {};
    if (me.steady === H.round) o.steady = 1; if (me.attuned === H.round) o.attuned = 1;
    if (d) o.debt = d.amt; const own = H.x.debts.filter(q => q.owner === id).length; if (own) o.notes = own;
    if (t === 'locksmith' && x.prog[id]) o.cut = x.prog[id]; if (t === 'locksmith' && x.streak[id]) o.streak = x.streak[id];
    if (t === 'counting' && x.sorted[id]) o.sorted = x.sorted[id];
    if (t === 'keystone' && x.carve[id]) o.carve = x.carve[id].n;
    if (t === 'ram' && !ACT.limit.ok(H.limits, id, 'climb', K.CLIMB_ROUND, K.CLIMB_MATCH)) o.climbed = 1;
    if (t === 'locksmith' && x.known[id]) o.known = Object.keys(x.known[id]).map(Number);
    return Object.keys(o).length ? o : null;
  }
  function meTiming(H, t, id) { const st = H.st[t], e = st && st._tx && st._tx[id]; return e ? { a: e.anchor, t0: e.tm.t0, per: e.tm.per, wa: e.tm.a % 1, wb: (e.tm.a + e.tm.win) % 1 } : null; }

  // ---- what the main heist asks
  function strikeMul(H, now) {   // at the release: the ram head and the chant, consumed by this strike
    const x = H.x && H.x.st.ram; if (!x) return 1; chantSettle(x, now);
    const m = Math.min(K.MUL_CAP, 1 + x.head * K.HEAD_BONUS + x.chant * K.CHANT_BONUS);
    x.head = Math.max(0, x.head - 1); x.chant = 0; x.loud = 0; return m;
  }
  const onStrike = H => { const x = H.x && H.x.st.ram; if (x) x.wear = Math.min(K.WEAR_MAX, x.wear + 1); };
  const winchWin = (H, base) => { const x = H.x && H.x.st.ram; return x ? Math.max(K.WIN_MIN, base - x.wear * K.WEAR_WIN) : base; };
  const planks = H => (H.x ? H.x.st.ram.planks : 0);
  const takePlank = H => { const x = H.x && H.x.st.ram; if (!x || x.planks < 1) return false; x.planks--; return true; };
  // the ledger's log
  const onBribe = (H, who, n) => { if (H.x && who) H.x.log.bribes.push({ id: who.id, name: nameOf(who), where: who.where || '', n }); };
  const onWrit = (H, p, k) => { if (H.x && p && (k === 0 || k === 1)) H.x.log.writs.push({ id: p.id, name: nameOf(p), k }); };

  // ---- bot hints: called after vb5's own hint; may replace out.next with a station action. info as VB5.botHint (+ p.parts read directly)
  const gate = (p, H, salt) => { const s = String(p.id) + ':' + H.round + ':' + salt; let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; };
  const partsOf = (p, k) => (p.parts && p.parts[k]) || 0;
  const tapOr = (st, p, a) => (st._tx && st._tx[p.id] && st._tx[p.id].anchor === a ? { verb: 'tap', a } : { verb: 'use', a });
  function botHint(H, cell, t, p, info, out) {
    if (!H.x) return out;
    const st = H.st[t], x = H.x.st[t], now = info.now || 0, nx = out.next, mine = st._tx && st._tx[p.id];
    const open = mine && ANCH.includes(mine.anchor) && !(mine.anchor === 'S4' && t === 'ram' && x.chant >= K.CHANT_MAX) && !(mine.anchor === 'S1' && t === 'counting' && used(H, p, 'wage') >= K.WAGE_CAP);
    if (open && (!nx || nx.verb !== 'tap')) { out.next = { verb: 'tap', a: mine.anchor }; return out; }   // finish the rhythm I started
    if (t === 'ram') {
      if (x.crate && lim(H, p, 'crate', K.CRATE_ROUND, null)) { out.next = { verb: 'pick', a: 'S3' }; return out; }
      if (nx && nx.verb === 'buy' && nx.a === 'F' && x.planks > 0) { out.next = { verb: 'buy', a: 'F', x: 2 }; return out; }
      if (info.defend && !st.bar && x.planks < 1 && partsOf(p, 'wood') >= 2) { out.next = { verb: 'use', a: 'S3', x: 0 }; return out; }
      if (x.wear >= 2 && partsOf(p, 'metal') >= 1 && !info.defend) { out.next = { verb: 'use', a: 'S1', x: 1 }; return out; }
      const winching = nx && nx.a === 'B' && (nx.verb === 'use' || nx.verb === 'tap');
      if (winching && st.notches === 0 && x.head < K.HEAD_MAX && partsOf(p, 'metal') >= 3 && gate(p, H, 1) < 50) { out.next = { verb: 'use', a: 'S1', x: 0 }; return out; }
      if (winching && st.handles.every(h => h != null && h !== p.id)) { out.next = tapOr(st, p, 'S4'); return out; }   // both handles taken: drum for them
      if ((!nx || info.round >= 2) && lim(H, p, 'climb', K.CLIMB_ROUND, K.CLIMB_MATCH) && gate(p, H, 2) < 30) { out.next = { verb: 'use', a: 'S2' }; return out; }
      return out;
    }
    if (t === 'locksmith') {
      const me = H.x.me[p.id] || {}, has = info.has || (() => false);
      if (ACT.heat.level(st.heat, now) > 35 && !(x.felt > now) && partsOf(p, 'cloth') >= 1) { out.next = { verb: 'use', a: 'S3' }; return out; }
      if (nx && nx.a === 'B' && st.pins === 0 && me.steady !== H.round && lim(H, p, 'prac', 1, null) && (p.skill || 0) >= 0.5 && gate(p, H, 4) < 60) { out.next = { verb: 'use', a: 'S2' }; return out; }
      if (has('x:blank') && lim(H, p, 'sk', 1, null) && !has('x:skeleton') && !ACT.limit.ok(H.limits, p, 'lp', 1, 2)) { out.next = { verb: 'use', a: 'S1' }; return out; }
      if (!nx && x.opened < K.SAFE_ROUND && lim(H, p, 'safe', 1, null) && ACT.heat.level(st.heat, now) < 60) {
        const kn = x.known[p.id] || {}, cyc = gate(p, H, 3) % K.SAFE_DIALS;
        for (let k = 0; k < K.SAFE_DIALS; k++) { const i = (cyc + k) % K.SAFE_DIALS; if (kn[i] == null || x.safe.v[i] !== kn[i]) { out.next = { verb: 'use', a: 'S4', x: i }; out.score = Math.max(out.score, 2); return out; } }
      }
      return out;
    }
    if (t === 'counting') {
      const d = debtOf(H, p.id), g = info.gold || 0;
      if (d && g >= d.amt + 30) { out.next = { verb: 'choose', a: 'S4', x: 0 }; return out; }
      if (!d && info.wantVault && g < 30 && !ctxSudden(info) && H.round <= K.LOAN_LAST && lim(H, p, 'loan', null, K.LOAN_MATCH) && (H.st.counting._box || 0) >= K.LOAN) { out.next = { verb: 'use', a: 'S4', x: 0 }; return out; }
      if (g >= 90 && (info.greed || 0) > 0.5 && H.x.debts.some(q => q.owner == null && q.by !== p.id)) { out.next = { verb: 'buy', a: 'S4', x: 0 }; return out; }
      const L = x.lot; if (L && L.seller !== p.id && L.by !== p.id) { const nxt = L.by != null ? L.bid + K.BID_STEP : L.min; if (nxt <= 0.7 * L.price && g >= nxt + 30) { out.next = { verb: 'buy', a: 'S2', x: 0 }; return out; } }
      if (!nx && used(H, p, 'wage') < K.WAGE_CAP) { out.next = { verb: 'use', a: 'S1' }; out.score = Math.max(out.score, 2); return out; }
      return out;
    }
    // keystone
    const R = x.rite;
    if (R && R.by === p.id && now >= R.show) { out.next = { verb: 'use', a: 'G' + (R.target[R.seq.pos] + 1) }; return out; }
    if (R && R.by === p.id) { out.next = { go: 'S2' }; return out; }
    const ks = st, has = info.has || (() => false);
    if (!nx && !attuned(H, p) && lim(H, p, 'rite', 1, null) && (!R || now > R.end)) { out.next = { verb: 'use', a: 'S2' }; return out; }
    if (!nx && !has('x:runecharge') && lim(H, p, 'carve', K.CARVE_ROUND, K.CARVE_MATCH) && (x.carve[p.id] || (partsOf(p, 'metal') >= 1 && partsOf(p, 'bone') >= 1))) { out.next = { verb: 'use', a: 'S1' }; return out; }
    if ((!nx || ks.armed) && ks.lit.some(v => v > now) && !info.wantNoVault) { out.next = { stay: 'S4' }; return out; }
    return out;
  }
  const ctxSudden = info => !!info.sudden;
  // BOTUSE-BEGIN (docs/reports/bots-use.md): a bot with nothing else to do in a heist room tries the stations it can afford, each once a round. The pick is kept 6 s so
  // a walking bot does not change its mind every tick. info.tourP (0..1, the level) is the share of bots that look around; info.junkSlot is a slot with a junk item (-1 none).
  const TOUR_GATED = { ram: ['S1', 'S3'], locksmith: ['S1', 'S3'], counting: ['S2'], keystone: ['S1', 'S3'] };
  function tourHint(H, cell, t, p, info, out) {
    const nx = out.next; if (!H.x || !p.brain || !(info.tourP > 0)) return out;
    const b = p.brain, tr = b.tr5 || (b.tr5 = { u: {}, cur: null, lk: {}, s: {} }), now = info.now || 0, c = tr.cur, s0 = H.st[t], mine = s0._tx && s0._tx[p.id];
    if (mine && ANCH.includes(mine.anchor)) return out;   // a rhythm is open: finish it
    if (nx && !nx.idle && !(nx.a && ANCH.includes(nx.a)) && ((tr.lk[H.round + ':' + t] | 0) >= 2 || (s0._tm && s0._tm[p.id]) || (s0.ch || []).some(q => q.pid === p.id))) return out;   // the main heist keeps its turn (two looks around a round, never in the middle of an attempt)
    if (c && c.t === t && c.round === H.round && now - c.at < 6000) { out.next = c.next; return out; }
    if (gate(p, H, 9) >= info.tourP * 100 || info.sudden) return out;
    const st = H.st[t], x = H.x.st[t], js = info.junkSlot | 0, has = info.has || (() => false), o = [];
    if (t === 'ram') {
      if (x.head < K.HEAD_MAX && partsOf(p, 'metal') >= K.FORGE_COST.metal) o.push(['S1', { verb: 'use', a: 'S1', x: 0 }]);
      if (lim(H, p, 'climb', K.CLIMB_ROUND, K.CLIMB_MATCH)) o.push(['S2', { verb: 'use', a: 'S2' }]);
      if (x.planks < K.PLANK_MAX && partsOf(p, 'wood') >= K.SAW_COST.wood) o.push(['S3', { verb: 'use', a: 'S3', x: 0 }]);
      if (x.chant < K.CHANT_MAX) o.push(['S4', { verb: 'use', a: 'S4' }]);
    } else if (t === 'locksmith') {
      if (lim(H, p, 'prac', 1, null)) o.push(['S2', { verb: 'use', a: 'S2' }]);
      if (partsOf(p, 'cloth') >= K.FELT_COST.cloth && !(x.felt > now)) o.push(['S3', { verb: 'use', a: 'S3' }]);
      if (x.opened < K.SAFE_ROUND && lim(H, p, 'safe', 1, null)) o.push(['S4', { verb: 'use', a: 'S4', x: gate(p, H, 3) % K.SAFE_DIALS }]);
      if (has('x:blank') && !has('x:skeleton') && lim(H, p, 'sk', 1, null)) o.push(['S1', { verb: 'use', a: 'S1' }]);
    } else if (t === 'counting') {
      if (used(H, p, 'wage') < K.WAGE_CAP) o.push(['S1', { verb: 'use', a: 'S1' }]);
      if (!x.lot && js >= 0 && info.junkSlot != null) o.push(['S2', { verb: 'use', a: 'S2', x: js }]);
      if ((info.gold || 0) >= K.LEDGER_FEE + 25 && lim(H, p, 'ledger', K.LEDGER_ROUND, null)) o.push(['S3', { verb: 'use', a: 'S3' }]);
      if ((info.gold || 0) < 100 && info.round <= K.LOAN_LAST && !debtOf(H, p.id) && lim(H, p, 'loan', null, K.LOAN_MATCH) && (st._box || 0) >= K.LOAN) o.push(['S4', { verb: 'use', a: 'S4', x: 0 }]);
    } else {
      if (!has('x:runecharge') && partsOf(p, 'metal') >= 1 && partsOf(p, 'bone') >= 1 && lim(H, p, 'carve', K.CARVE_ROUND, K.CARVE_MATCH)) o.push(['S1', { verb: 'use', a: 'S1' }]);
      if (!attuned(H, p) && lim(H, p, 'rite', 1, null) && !(x.rite && now < x.rite.end)) o.push(['S2', { verb: 'use', a: 'S2' }]);
      if (info.junkSlot != null && js >= 0 && lim(H, p, 'offer', K.OFFER_ROUND, K.OFFER_MATCH)) o.push(['S3', { verb: 'use', a: 'S3', x: js }]);
      if (x.node.holder == null) o.push(['S4', { verb: 'use', a: 'S4' }]);
    }
    const free = o.filter(e => tr.u[t + ':' + e[0]] !== H.round); if (!free.length) return out;
    const fresh = free.filter(e => !tr.s[t + ':' + e[0]]), pool0 = fresh.length ? fresh : free;   // a station it has never tried first
    const gated = pool0.filter(e => (TOUR_GATED[t] || []).includes(e[0])), pool = gated.length ? gated : pool0;   // one it can only do because it carries the means (parts, a blank, a spare item) before the free ones
    const e = pool[gate(p, H, 10) % pool.length]; tr.u[t + ':' + e[0]] = H.round; tr.s[t + ':' + e[0]] = 1; tr.cur = { t, round: H.round, at: now, next: e[1] }; tr.lk[H.round + ':' + t] = (tr.lk[H.round + ':' + t] | 0) + 1; out.next = e[1]; return out;
  }
  // BOTUSE-END

  // ---- the codex rows (tools/gameinfo.js): station, room, what it does, reward, risk
  const CODEX = [
    ['ram', 'Smithy', `Forge a ram head (${K.FORGE_COST.metal} metal, ${K.FORGE_MS / 1000} s): the next strike hits ${Math.round(K.HEAD_BONUS * 100)}% harder (2 at most, one dulls per strike). Repair the winch (${K.REPAIR_COST.metal} metal): every strike wears it and narrows the winch window.`, 'stronger strikes', 'metal'],
    ['ram', 'Siege tower', `Climb it (${K.CLIMB_MS / 1000} s): every goblin shows on your map for ${K.CLIMB_PULSE / 1000} s and you learn who holds the vault.`, 'intel, +' + K.CLIMB_KNOW + ' knowledge', 'the vault is told it is watched'],
    ['ram', 'Barricade workshop', `Saw planks (${K.SAW_COST.wood} wood, up to ${K.PLANK_MAX} stocked): a plank sets a barricade at the lane for nothing more, or adds ${K.REINFORCE} HP to one (${K.BAR_MAX_HP} at most). Anyone can smash the stock. A supply crate lands here now and then.`, 'cheap defence, parts', 'sabotage'],
    ['ram', 'War drum', `Drum in rhythm (timing presses): each hit adds ${Math.round(K.CHANT_BONUS * 100)}% to the next strike (up to ${K.CHANT_MAX}); a miss loses ${K.CHANT_MISS}. Head and drum add ${Math.round((K.MUL_CAP - 1) * 100)}% at most.`, 'stronger strikes', 'a full chant is announced to everyone'],
    ['locksmith', 'Key bench', `Three precise cuts turn a Key Blank into a Skeleton Key (1 a round, shared with the lock).`, 'Skeleton Key', `a slip is +${K.BENCH_NOISE} noise`],
    ['locksmith', 'Practice board', `Set ${K.PRAC_HITS} pins in a row, silently: Steady Hands, the pin windows are ${Math.round((K.STEADY - 1) * 100)}% wider for the round.`, 'easier picks, +' + K.PRAC_KNOW + ' knowledge', 'time'],
    ['locksmith', 'Felt table', `Wrap the tools (${K.FELT_COST.cloth} cloth): all noise in the room is halved for ${K.FELT_FOR / 1000} s. Anyone can strip it.`, 'quiet', 'sabotage'],
    ['locksmith', 'Master safe', `Turn ${K.SAFE_DIALS} dials of ${K.SAFE_POS}; a click tells only you a dial is right. Open: ${K.SAFE_GOLD} gold, ${K.SAFE_KNOW} knowledge and a Key Blank (1 a goblin, ${K.SAFE_ROUND} a round). During the shift change noise and gold double.`, 'gold, knowledge, a blank', `+${K.SAFE_NOISE} noise a turn`],
    ['counting', 'Coin belt', `Sort coins with timing presses: every ${K.BELT_N} pay ${K.WAGE} gold (${K.WAGE_CAP} a round). The rush doubles wages for ${K.RUSH_MS / 1000} s.`, 'steady gold', 'time'],
    ['counting', 'Auction block', `Put an item up; others bid in steps of ${K.BID_STEP}. ${K.LOT_MS / 1000} s, a late bid extends it. The house takes ${Math.round(K.LOT_FEE * 100)}%.`, 'trade between goblins', 'outbid'],
    ['counting', 'Ledger', `Read it (${K.LEDGER_FEE} gold): who bribed, who bought writs, who owes whom this round, and who read it before you.`, 'intel, +1 knowledge', 'your name goes in it'],
    ['counting', 'Vault of IOUs', `Borrow ${K.LOAN} gold from the strongbox, repay ${K.DEBT} by the end of the next round or it is taken (and grows ${Math.round((K.DEBT_ROLL - 1) * 100)}%). Buy a house note for ${K.NOTE}: you collect it.`, 'gold now, or profit', 'debt'],
    ['keystone', 'Carving altar', `Carve a Rune Charge in ${K.CARVE_HITS} strokes (${K.CARVE_COST.metal} metal, ${K.CARVE_COST.bone} bone); 1 a round.`, 'Rune Charge', `a slip is +${K.CARVE_RES} resonance`],
    ['keystone', 'Ritual circle', `The plates show an order for ${K.RITE_SHOW / 1000} s; step on them in that order. Attuned: lighting takes ${K.ATTUNE_LIGHT / 1000} s and feeding ${K.ATTUNE_FEED / 1000} s this round.`, 'faster circuits, +' + K.RITE_KNOW + ' knowledge', `a wrong step is ${K.RITE_BACKLASH} damage`],
    ['keystone', 'Offering bowl', `Offer gear for knowledge by tier (${K.OFFER_KNOW.slice(0, 4).join(' / ')}), ${K.OFFER_ROUND} a round; a Rune Charge or Gold Leaf buys a vision of the next re-key.`, 'knowledge, intel', 'the item'],
    ['keystone', 'Ley node', `Hold it alone: every ${K.NODE_EVERY / 1000} s every burning stone gains ${K.NODE_BURN / 1000} s and resonance calms. The surge doubles it.`, 'longer flames, knowledge', 'standing in the open'],
  ].map(([type, name, what, reward, risk]) => ({ type, name, what, reward, risk }));

  const bind = k => { VK = Object.assign({}, VK, k); };
  const botHintX = (H, cell, t, p, info, out) => tourHint(H, cell, t, p, info, botHint(H, cell, t, p, info, out));   // BOTUSE: the station tour after the usual hint
  const VBX = { K, ANCH, CODEX, bind, attach, owns, verb, tick, leave, hurt, roundEnd, rekey, newRound, view, meX, meTiming, strikeMul, onStrike, winchWin, planks, takePlank,
    noiseMul, pinMul, lightMs, feedMs, onBribe, onWrit, botHint: botHintX, tourHint, ledgerLines };
  root.VBX = VBX;
  if (typeof module !== 'undefined' && module.exports) module.exports = VBX;
})(typeof window !== 'undefined' ? window : globalThis);

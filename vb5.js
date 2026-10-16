// vb5.js: the 4 VAULTBREAKER heists (PLAN-5x5-rooms section 4) as pure logic on top of activity.js. UMD: window.VB5 / require('./vb5.js').
// No I/O, no timers, no Date.now()/Math.random(): the server glue passes `ctx.now` and `ctx.rng`. All state is plain JSON (private keys start with "_").
// Types: ram, locksmith, counting, keystone. State lives PER TYPE (H.st[type]); a type moves between cells at the round boundary (derangement).
//   what survives a re-key: breach on the doors (H.breach), the strongbox balance (it is Counting House state), items in pockets.
//   what resets: winch/lane/barricade, pins/noise, writs, circuit stones. See spec.rekey of each type.
// Glue contract (ctx) is documented in docs/reports/vb5.md. Anchor id of a message arrives as ctx.a, the small argument as `arg`.
(function (root) {
  const ACT = (typeof module !== 'undefined' && module.exports) ? require('./activity.js') : root.ACT;
  const TYPES = ['ram', 'locksmith', 'counting', 'keystone'];
  const K = {
    HEIST_ACT_R: 1.6, ANNOUNCE_MS: 15000, BREACH_DECAY: 20, CRACKED: 50, BROKEN: 100,
    // ram
    NOTCH_MAX: 6, WINCH_PER: [700, 900], WINCH_WIN: 0.3, SWING_MS: 1200, PER_NOTCH: 3, STRIKE_POWER: 8, LANE_DMG: 25, SLACK_MS: 1500, HANDLE_IDLE: 6000,
    BAR_HP: 60, BAR_MS: 1500, BAR_CD: 20000, BAR_METAL: 2, BAR_ELIXIR: 10, CHOP: 10, CHOP_CD: 700, QUAKE_CD: 15000, QUAKE_FREEZE: 3000,
    // locksmith
    PINS: 5, PIN_PER: [900, 1200], PIN_WIN: 0.18, NOISE_MISS: 18, NOISE_JIGGLE: 25, NOISE_DECAY: 3, GRIND_MS: 3000, CUT_MS: 3000, JIGGLE_CD: 1500, LOUD_ON: 50, LOUD_OFF: 40, ALARM: 100, WARDEN_MAX: 4,
    // counting
    WRIT: [20, 30, 40], SACK: 40, SACKS_MAX: 4, ROB_MS: 6000, ROB_KEY_MS: 1500, LOUD_MS: 15000, INTEREST: 3, INTEREST_MS: 5000, BOX_CAP: 300, BRIBE_SHARE: 0.5, BOUNTY: 30, BOUNTY_STEP: 15, GOLDLEAF_MIN: 40,
    // keystone
    STONE_BURN: 35000, STONE_CHAIN: 8000, LIGHT_MS: 2000, FEED_MS: 1000, SNUFF_MS: 1500, OFFER_MS: 1000, BACKLASH: 8, WISP_SNUFF_MS: 2000, RES_THR: [30, 60, 90], WISP_MAX: 3,
  };
  const NPC = {
    warden: { hp: 90, dmg: 14, cd: 1000, speed: 3.4, react: 500, loot: [1, 1], name: 'Vault Warden' },
    wisp: { hp: 15, dmg: 0, cd: 1000, speed: 4.5, react: 300, loot: [0, 0], name: 'Wisp', goal: true },
  };
  // items the heists create (the merger adds them to items.js). Tokens: one slot, max 1 carried, never sold.
  const TOKENS = { 'x:wedge': 'Iron Wedge', 'x:skeleton': 'Skeleton Key', 'x:goldleaf': 'Gold Leaf', 'x:runecharge': 'Rune Charge', 'x:blank': 'Key Blank', 'x:crownseal': 'Crown Seal' };
  const RING = { ram: 'x:wedge', locksmith: 'x:skeleton', counting: 'x:goldleaf', keystone: 'x:runecharge' };   // type -> the token it produces (ring, 4.6)
  const STONES = ['L', 'R', 'FL', 'FR'];

  // ---------- small helpers
  const noop = () => {};
  const fx = (ctx, k, d, scope) => (ctx.fx || noop)(k, d || {}, scope || 'room');
  const toast = (ctx, text) => (ctx.toastAll || noop)(text);
  const player = (ctx, id) => (ctx.player ? ctx.player(id) : null);
  const hasItem = (ctx, p, key) => !!(ctx.hasItem && ctx.hasItem(p, key));
  const giveItem = (ctx, p, key) => !!(ctx.giveItem && ctx.giveItem(p, key));
  const award = (ctx, p, what, src) => (ctx.award ? ctx.award(p, what, src) : null);
  const lim = (ctx, p, k, perRound, perMatch) => ACT.limit.ok(ctx.H.limits, p, k, perRound, perMatch);
  const limUse = (ctx, p, k) => ACT.limit.use(ctx.H.limits, p, k);
  const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- per-player channels kept in st.ch (JSON). One channel per goblin; `busyAt` enforces one user per prop.
  function chStart(st, ctx, p, kind, ms, anchor, arg) {
    const mine = st.ch.find(c => c.by === p.id);
    if (mine) return mine.k === kind && mine.anchor === anchor ? null : 'busy';
    const c = ACT.channel.make(); const e = ACT.channel.start(c, p, ctx.now, ms, { anchor }); if (e) return e;
    c.k = kind; c.arg = arg == null ? 0 : arg; c.pid = p.id; c.at = anchor; st.ch.push(c); return null;
  }
  const chBusy = (st, anchor, kind) => st.ch.some(c => c.anchor === anchor && (kind == null || c.k === kind));
  function chRun(st, ctx, done) {
    for (const c of st.ch.slice()) {
      const p = player(ctx, c.pid), r = ACT.channel.update(c, p, ctx.now);
      if (r === 'run') continue;
      st.ch.splice(st.ch.indexOf(c), 1);
      if (r === 'done' && done[c.k]) done[c.k](st, p, c, ctx);
    }
  }
  const chCancel = (st, id) => { for (const c of st.ch.slice()) if (c.pid === id) { ACT.channel.cancel(c); st.ch.splice(st.ch.indexOf(c), 1); } };
  const chHurt = (st, p) => { for (const c of st.ch) ACT.channel.hurt(c, p.id); };

  // ---------- timing attempts kept in st._tm[pid] = {anchor, tm}. The server rolls period AND window for every attempt.
  function tmOpen(st, ctx, p, anchor, o) { st._tm[p.id] = { anchor, o, tm: ACT.timing.open(ctx.rng, ctx.now, Object.assign({ ttl: 3000, by: p.id }, o)) }; }
  // -> 'hit' | 'miss' | null (no open attempt here). Bots: the glue-free roll 0.45 + 0.3 * skill. Opens the next attempt at once.
  function tmTap(st, ctx, p, anchor) {
    const e = st._tm[p.id]; if (!e || e.anchor !== anchor) return null;
    const res = p.bot ? (ctx.rng() < 0.45 + 0.3 * (p.skill || 0) ? 'hit' : 'miss') : ACT.timing.judge(e.tm, ctx.now, { lat: p.lat || 0 });
    tmOpen(st, ctx, p, anchor, e.o); return res;
  }
  const tmClose = (st, id) => { delete st._tm[id]; };
  const meTiming = (st, id) => { const e = st._tm[id]; return e ? { a: e.anchor, t0: e.tm.t0, per: e.tm.per, wa: e.tm.a % 1, wb: (e.tm.a + e.tm.win) % 1 } : null; };

  // =================================================================================================
  // RAM: siege. Anchors B (winch: x 0/1 = handle, 2 = slack the pawl), F (lane: buy = barricade, tap = chop it), FL (lever; x 1 = with Rune Charge), FR (wedge rack: pick)
  // =================================================================================================
  function ramPower(st) { return st.swing.n * K.STRIKE_POWER * (st.swing.charge ? 2 : 1); }
  function addBreach(ctx, st, door, amt) {
    const H = ctx.H, before = H.breach[door] || 0, after = Math.min(K.BROKEN, before + amt);
    H.breach[door] = after;
    const label = ctx.doorLabel ? ctx.doorLabel(door) : door;
    if (!H.struck[door]) { H.struck[door] = 1; toast(ctx, 'The Ram is pounding the ' + label + ' vault door'); }
    for (const thr of [K.CRACKED, K.BROKEN]) if (before < thr && after >= thr) {
      toast(ctx, 'The ' + label + ' vault door is ' + (thr === K.CRACKED ? 'cracked' : 'broken'));
      const w = H.wedgeAt[door] || (H.wedgeAt[door] = {});
      if (w[thr] !== H.round) { w[thr] = H.round; st.rack = Math.min(2, st.rack + 1); }   // an Iron Wedge per door per threshold per round
    }
    return after;
  }
  function ramStrike(st, ctx) {
    const sw = st.swing; st.swing = null; st.strikes++;
    for (const q of ctx.occupants ? ctx.occupants() : []) if (ctx.at && ctx.at(q, 'F')) { if (ctx.dmg) ctx.dmg(q, K.LANE_DMG, 'ram'); if (ctx.push) ctx.push(q, 0, 2); }   // the lane is a hazard, not a defence
    if (ctx.sudden) {   // Quake: a full strike shakes the vault
      if (sw.n >= K.NOTCH_MAX && ctx.now >= st.quakeCd) { st.quakeCd = ctx.now + K.QUAKE_CD; ctx.H.quakeUntil = ctx.now + K.QUAKE_FREEZE; fx(ctx, 'quake', {}, 'all'); }
      return;
    }
    let power = sw.n * K.STRIKE_POWER * (sw.charge ? 2 : 1);
    if (st.bar) {   // the barricade takes the blow first; only the overflow reaches the door
      const absorbed = Math.min(st.bar.hp, power); st.bar.hp -= absorbed; power -= absorbed;
      fx(ctx, 'barhit', { hp: st.bar.hp }); if (st.bar.hp <= 0) { st.bar = null; fx(ctx, 'barbreak', {}); }
    }
    if (power > 0) { addBreach(ctx, st, ctx.door, Math.floor(power * K.PER_NOTCH / K.STRIKE_POWER)); fx(ctx, 'ramhit', { breach: ctx.H.breach[ctx.door] }, 'near'); }
  }
  const ramState = () => ({ notches: 0, handles: [null, null], _hAt: [0, 0], swing: null, bar: null, barCd: 0, rack: 0, strikes: 0, quakeCd: 0, ch: [], _tm: {}, _chop: {} });
  ACT.def('ram', {
    kind: 'vb', state0: ramState,
    verbs: {
      use(st, p, x, ctx) {
        switch (ctx.a) {
          case 'B': {
            if (x === 2) return st.swing ? 'busy' : chStart(st, ctx, p, 'slack', K.SLACK_MS, 'B');
            const h = x === 1 ? 1 : 0, cur = st.handles[h];
            if (st.swing) return 'busy';
            if (cur != null && cur !== p.id) return 'busy';
            const other = st.handles[1 - h]; if (other === p.id) st.handles[1 - h] = null;   // one handle per goblin
            st.handles[h] = p.id; st._hAt[h] = ctx.now; tmOpen(st, ctx, p, 'B', { per: K.WINCH_PER, win: K.WINCH_WIN }); return null;
          }
          case 'FL': {
            if (st.swing) return 'busy'; if (st.notches < 2) return 'state';
            let charge = false; if (x === 1) { if (!(ctx.takeItem && ctx.takeItem(p, 'x:runecharge'))) return 'item'; charge = true; }
            st.swing = { t0: ctx.now, n: st.notches, charge, by: p.id }; st.notches = 0; st.handles = [null, null]; st._tm = {};
            fx(ctx, 'ramdraw', { n: st.swing.n, charge }, 'near'); return null;
          }
          default: return 'state';
        }
      },
      tap(st, p, x, ctx) {
        if (ctx.a === 'F') {   // chop the barricade
          if (!st.bar) return 'state'; if (ctx.now < (st._chop[p.id] || 0)) return 'cool';
          st._chop[p.id] = ctx.now + K.CHOP_CD; ramHitBarricade(st, K.CHOP, ctx); return null;
        }
        if (ctx.a !== 'B') return 'state';
        const r = tmTap(st, ctx, p, 'B'); if (!r) return 'state';
        const h = st.handles.indexOf(p.id); if (h < 0) return 'state';
        st._hAt[h] = ctx.now; st.notches = r === 'hit' ? Math.min(K.NOTCH_MAX, st.notches + 1) : Math.max(0, st.notches - 1);
        return null;
      },
      buy(st, p, x, ctx) {   // place the barricade in the lane: x 0 = 2 metal, 1 = 10 elixir
        if (ctx.a !== 'F') return 'state'; if (ctx.sudden) return 'state';
        if (st.bar) return 'busy'; if (st.swing) return 'busy'; if (ctx.now < st.barCd) return 'cool';
        if (chBusy(st, 'F', 'bar')) return 'busy';
        if (ctx.spend && !ctx.spend(p, x === 1 ? { elixir: K.BAR_ELIXIR } : { metal: K.BAR_METAL }, true)) return 'cost';   // true = dry run
        return chStart(st, ctx, p, 'bar', K.BAR_MS, 'F', x === 1 ? 1 : 0);
      },
      pick(st, p, x, ctx) {   // take an Iron Wedge from the rack
        if (ctx.a !== 'FR' || st.rack < 1) return 'state';
        if (!giveItem(ctx, p, 'x:wedge')) return 'item'; st.rack--; return null;
      },
      stop(st, p) { chCancel(st, p.id); tmClose(st, p.id); st.handles = st.handles.map(h => h === p.id ? null : h); return null; },
    },
    tick(st, ctx) {
      chRun(st, ctx, {
        slack(s, p, c, cx) { s.notches = 0; fx(cx, 'slack', {}); },
        bar(s, p, c, cx) {
          if (s.bar || s.swing || !p) return;
          if (cx.spend && !cx.spend(p, c.arg === 1 ? { elixir: K.BAR_ELIXIR } : { metal: K.BAR_METAL })) return;
          s.bar = { hp: K.BAR_HP, max: K.BAR_HP, by: p.id }; s.barCd = cx.now + K.BAR_CD; fx(cx, 'barplace', {});
        },
      });
      for (let h = 0; h < 2; h++) if (st.handles[h] != null) {   // free a handle when its goblin leaves, dies or idles
        const q = player(ctx, st.handles[h]);
        if (!q || q.alive === false || q.room !== ctx.cell || ctx.now - st._hAt[h] > K.HANDLE_IDLE) { tmClose(st, st.handles[h]); st.handles[h] = null; }
      }
      if (st.swing && ctx.now >= st.swing.t0 + K.SWING_MS) ramStrike(st, ctx);
    },
    onHurt(st, p) { chHurt(st, p); },
    onLeave(st, p) { chCancel(st, p.id); tmClose(st, p.id); st.handles = st.handles.map(h => h === p.id ? null : h); },
    rekey(st) { Object.assign(st, { notches: 0, handles: [null, null], _hAt: [0, 0], swing: null, bar: null, barCd: 0, rack: 0, strikes: 0, ch: [], _tm: {}, _chop: {} }); },
    view: st => ({ notches: st.notches, handles: st.handles.map(h => h != null), swing: st.swing ? { n: st.swing.n, t0: st.swing.t0 } : null, bar: st.bar ? { hp: st.bar.hp, max: st.bar.max } : null, rack: st.rack, strikes: st.strikes }),
  });
  function ramHitBarricade(st, dmg, ctx) { if (!st.bar) return false; st.bar.hp -= dmg; fx(ctx, 'barhit', { hp: st.bar.hp }); if (st.bar.hp <= 0) { st.bar = null; fx(ctx, 'barbreak', {}); } return true; }

  // =================================================================================================
  // LOCKSMITH: stealth. Anchors B (lock face: use = set pins, choose x 0/1/2 = cut, x 9 = jiggle), L (grindstone: use, x 1 = with a wedge), R (bell), FL/FR (grilles)
  // =================================================================================================
  const lsState = () => ({ pins: 0, heat: ACT.heat.make(K.NOISE_DECAY, [K.LOUD_ON, K.ALARM]), loud: false, wardens: [], ch: [], _tm: {}, _wedged: {}, _jig: {} });
  function lsCheck(st, ctx) {
    for (const t of ACT.heat.crossed(st.heat, ctx.now)) {
      if (t === K.LOUD_ON) st.loud = true;
      if (t === K.ALARM) {
        st.pins = 0; st._tm = {}; ACT.heat.reset(st.heat, ctx.now); ACT.heat.add(st.heat, 20, ctx.now);
        for (let i = 0; i < 2 && st.wardens.length < K.WARDEN_MAX; i++) { const id = ctx.spawn ? ctx.spawn('warden', i ? 'FR' : 'FL', {}) : null; if (id != null) st.wardens.push(id); }
        fx(ctx, 'lockalarm', {}, 'near');
      }
    }
    const v = ACT.heat.level(st.heat, ctx.now); if (v < K.LOUD_OFF) st.loud = false;
  }
  const noise = (st, ctx, n) => { ACT.heat.add(st.heat, n, ctx.now); lsCheck(st, ctx); };
  const CUTS = ['x:lockpick', 'x:skeleton'];
  ACT.def('locksmith', {
    kind: 'vb', state0: lsState,
    verbs: {
      use(st, p, x, ctx) {
        if (ctx.a === 'L') {
          if (hasItem(ctx, p, 'x:blank')) return 'cap';
          if (x === 1 ? !hasItem(ctx, p, 'x:wedge') : (ctx.spend && !ctx.spend(p, { metal: 2 }, true))) return x === 1 ? 'item' : 'cost';
          return chStart(st, ctx, p, 'grind', K.GRIND_MS, 'L', x === 1 ? 1 : 0);
        }
        if (ctx.a === 'B') {
          if (st.pins >= K.PINS) return 'state';
          if (st.pins === 0 && st._wedged[p.id]) { delete st._wedged[p.id]; st.pins = 1; }
          tmOpen(st, ctx, p, 'B', { per: K.PIN_PER, win: K.PIN_WIN }); return null;
        }
        return 'state';
      },
      tap(st, p, x, ctx) {
        if (ctx.a !== 'B' || st.pins >= K.PINS) return 'state';
        const r = tmTap(st, ctx, p, 'B'); if (!r) return 'state';
        if (r === 'hit') { st.pins++; if (st.pins >= K.PINS) st._tm = {}; } else { st.pins = Math.max(0, st.pins - 1); noise(st, ctx, K.NOISE_MISS); }
        return null;
      },
      choose(st, p, x, ctx) {
        if (ctx.a !== 'B') return 'state';
        if (x === 9) {   // jiggle: sabotage the picker
          if (st.pins < 1) return 'state'; if (ctx.now < (st._jig[p.id] || 0)) return 'cool';
          st._jig[p.id] = ctx.now + K.JIGGLE_CD; st.pins--; noise(st, ctx, K.NOISE_JIGGLE); return null;
        }
        if (![0, 1, 2].includes(x)) return 'state';
        if (st.pins < K.PINS) return 'state'; if (!hasItem(ctx, p, 'x:blank')) return 'item';
        if (ctx.sudden && x === 1) return 'state';
        const L = cutRule(ctx, x); if (!lim(ctx, p, L.key, L.round, L.match)) return 'cap';
        return chStart(st, ctx, p, 'cut', K.CUT_MS, 'B', x);
      },
      stop(st, p) { chCancel(st, p.id); tmClose(st, p.id); return null; },
    },
    tick(st, ctx) {
      lsCheck(st, ctx);
      chRun(st, ctx, {
        grind(s, p, c, cx) {
          if (!p || hasItem(cx, p, 'x:blank')) return;
          if (c.arg === 1) { if (!(cx.takeItem && cx.takeItem(p, 'x:wedge'))) return; s._wedged[p.id] = true; }
          else if (cx.spend && !cx.spend(p, { metal: 2 })) return;
          if (!giveItem(cx, p, 'x:blank')) return;
          fx(cx, 'blank', {});
        },
        cut(s, p, c, cx) {
          if (!p || s.pins < K.PINS || !(cx.takeItem && cx.takeItem(p, 'x:blank'))) return;
          const x = c.arg, L = cutRule(cx, x); if (!lim(cx, p, L.key, L.round, L.match)) return;
          limUse(cx, p, L.key); s.pins = 0; s._tm = {};
          if (x === 2) { if (cx.pay) cx.pay(p, 20); award(cx, p, { know: 3, exempt: true }, 'locksmith'); }
          else giveItem(cx, p, cx.sudden ? 'x:crownseal' : CUTS[x]);
          fx(cx, 'cut', { x });
        },
      });
    },
    onHurt(st, p) { chHurt(st, p); },
    onLeave(st, p) { chCancel(st, p.id); tmClose(st, p.id); },
    rekey(st, ctx) { Object.assign(st, lsState()); },
    view: (st, o) => ({ pins: st.pins, loud: st.loud, noise: Math.round(ACT.heat.level(st.heat, (o && o.now) || st.heat.t)), wardens: st.wardens.length }),
  });
  function cutRule(ctx, x) {
    if (x === 2) return { key: 'fence', round: 3, match: null };
    if (ctx.sudden) return { key: 'seal', round: null, match: 2 };
    return x === 0 ? { key: 'lp', round: 1, match: 2 } : { key: 'sk', round: 1, match: null };
  }

  // =================================================================================================
  // COUNTING HOUSE: economy. Anchors B (desk: buy x 0 writ, 1 counter-writ, 2 bounty in sudden death), R (strongbox: use, x 1 = with Skeleton Key),
  // floor sacks: pick x = sack id (any anchor). The strongbox balance is type state, so it survives the shuffle.
  // =================================================================================================
  const coState = now => ({ _box: 0, _int: now || 0, writs: 0, counters: 0, alarmUntil: 0, floor: [], seq: 0, bounties: {}, nBounty: 0, ch: [], _tm: {} });
  function coSettle(st, now) {
    if (!st._int) st._int = now;
    const k = Math.floor((now - st._int) / K.INTEREST_MS);
    if (k > 0) { st._box = Math.min(K.BOX_CAP, st._box + K.INTEREST * k); st._int += k * K.INTEREST_MS; }
  }
  const writPrice = st => K.WRIT[Math.min(st.writs, K.WRIT.length - 1)];
  const boxStage = box => box >= 100 ? 2 : box >= 40 ? 1 : 0;
  function dropSack(st, p, ctx, c) { if (c && c.tok === 'sack' && c.n > 0) st.floor.push({ id: ++st.seq, gold: c.n, x: p.x, z: p.z, t: ctx.now + 500 }); }
  ACT.def('counting', {
    kind: 'vb', state0: (rng, now) => coState(now),
    verbs: {
      buy(st, p, x, ctx) {
        if (ctx.a !== 'B') return 'state'; coSettle(st, ctx.now);
        if (x === 2) {   // sudden death: a bounty on the top crown claimant
          if (!ctx.sudden) return 'state'; const t = ctx.topClaimant ? ctx.topClaimant() : null; if (t == null || t === p.id) return 'state';
          const price = K.BOUNTY + K.BOUNTY_STEP * st.nBounty; if (ctx.spend && !ctx.spend(p, { gold: price })) return 'cost';
          st.bounties[t] = (st.bounties[t] || 0) + price; st.nBounty++; st._box += 0; fx(ctx, 'bounty', { target: t, pot: st.bounties[t] }, 'all'); return null;
        }
        if (ctx.sudden) return 'state';   // every door is open: the market is closed
        if (x === 1) {   // counter-writ: 1.5x the current writ price, cancels one writ, never the room's base vote
          if (st.counters >= st.writs) return 'state';
          const price = Math.ceil(1.5 * writPrice(st)); if (ctx.spend && !ctx.spend(p, { gold: price })) return 'cost';
          st.counters++; st._box = Math.min(K.BOX_CAP, st._box + price); return null;
        }
        if (st.writs >= K.WRIT.length) return 'cap';
        const price = writPrice(st); if (ctx.spend && !ctx.spend(p, { gold: price })) return 'cost';
        st.writs++; st._box = Math.min(K.BOX_CAP, st._box + price); return null;
      },
      use(st, p, x, ctx) {
        if (ctx.a !== 'R') return 'state'; coSettle(st, ctx.now);
        if (p.carry) return 'carry'; if (st._box < 1) return 'state'; if (chBusy(st, 'R')) return 'busy';
        const key = x === 1; if (key && !hasItem(ctx, p, 'x:skeleton')) return 'item';
        const e = chStart(st, ctx, p, 'rob', key ? K.ROB_KEY_MS : K.ROB_MS, 'R', key ? 1 : 0); if (e) return e;
        if (!key) { st.alarmUntil = ctx.now + K.LOUD_MS; toast(ctx, 'The Counting House is being robbed!'); fx(ctx, 'robalarm', {}, 'near'); }
        return null;
      },
      pick(st, p, x, ctx) {   // pick up a dropped sack lying within 1.8 m
        const i = st.floor.findIndex(s => s.id === x); if (i < 0) return 'state'; const s = st.floor[i];
        if (ctx.now < s.t || Math.hypot(p.x - s.x, p.z - s.z) > 1.8) return 'far';
        const e = ACT.carry.pick(p, 'sack', { heavy: true, from: ctx.cell }); if (e) return e;
        p.carry.n = s.gold; st.floor.splice(i, 1); return null;
      },
      stop(st, p) { chCancel(st, p.id); return null; },
    },
    tick(st, ctx) {
      coSettle(st, ctx.now);
      chRun(st, ctx, {
        rob(s, p, c, cx) {
          if (!p || p.carry) return;
          if (c.arg === 1 && !(cx.takeItem && cx.takeItem(p, 'x:skeleton'))) return;
          coSettle(s, cx.now); const had = s._box, n = Math.min(had, K.SACK * K.SACKS_MAX); if (n < 1) return;
          if (ACT.carry.pick(p, 'sack', { heavy: true, from: cx.cell })) return;
          p.carry.n = n; s._box -= n; if (had >= K.GOLDLEAF_MIN) giveItem(cx, p, 'x:goldleaf'); fx(cx, 'robbed', { n });
        },
      });
    },
    onHurt(st, p, ctx) { chHurt(st, p); if (p.carry && p.carry.tok === 'sack') { const r = ACT.carry.hurt(p); if (r && r.dropped) dropSack(st, p, ctx, r.dropped); } },
    onKill(st, killer, victim, ctx) { if (victim && victim.carry && victim.carry.tok === 'sack') dropSack(st, victim, ctx, ACT.carry.death(victim)); },
    onLeave(st, p, ctx) { chCancel(st, p.id); if (p.carry && p.carry.tok === 'sack') { const c = ACT.carry.drop(p); if (ctx.pay) ctx.pay(p, c.n); fx(ctx, 'coins', { n: c.n }); } },   // out of the door: the sack is gold
    rekey(st, ctx) {   // the box moves with the type; writs reset; sacks convert; floor sacks go back in the box
      coSettle(st, ctx.now);
      for (const q of ctx.occupants ? ctx.occupants() : []) if (q.carry && q.carry.tok === 'sack') { const c = ACT.carry.drop(q); if (ctx.pay) ctx.pay(q, c.n); }
      for (const s of st.floor) st._box = Math.min(K.BOX_CAP, st._box + s.gold);
      st.floor = []; st.writs = 0; st.counters = 0; st.alarmUntil = 0; st.ch = []; st._tm = {};
    },
    view: (st, o) => ({ writs: st.writs, counters: st.counters, price: writPrice(st), boxStage: boxStage(st._box), alarm: !!(o && o.now && st.alarmUntil > o.now), sacks: st.floor.map(s => ({ id: s.id, x: s.x, z: s.z, gold: s.gold })), bounties: Object.keys(st.bounties).length }),
  });

  // =================================================================================================
  // KEYSTONE: ritual. Anchors L R FL FR (rune stones: use = light or feed, choose x 1 = snuff), B (altar: use = offer Gold Leaf), F (socket)
  // =================================================================================================
  const ksState = (rng) => ({ order: shuffle(STONES.slice(), rng || Math.random), pos: 0, lit: [0, 0, 0, 0], lastLit: 0, complete: false, armed: false, wasArmed: false, heat: ACT.heat.make(1, K.RES_THR), wisps: [], part: [], circuits: 0, ch: [], _tm: {} });
  function ksDark(st, ctx) { st.lit = [0, 0, 0, 0]; st.pos = 0; st.complete = false; st.armed = false; st.part = []; st.order = shuffle(STONES.slice(), ctx.rng); }
  function ksSettle(st, ctx) {
    const now = ctx.now;
    if (!st.complete && st.pos > 0 && now > st.lastLit + K.STONE_CHAIN) ksDark(st, ctx);   // the chain fizzled
    for (let i = 0; i < 4; i++) if (st.lit[i] && now >= st.lit[i]) st.lit[i] = 0;
    if (st.lit.every(t => !t)) { if (st.complete || st.pos > 0) ksDark(st, ctx); }
    st.armed = st.complete && st.lit.every(t => t > 0);
  }
  function ksComplete(st, ctx, lighter) {
    st.complete = true; st.circuits++; const seen = {};
    for (const id of st.part) { if (seen[id]) continue; seen[id] = 1; const q = player(ctx, id); if (q && lim(ctx, q, 'ksc', 2, null)) { limUse(ctx, q, 'ksc'); award(ctx, q, { know: 3, exempt: true }, 'keystone'); } }
    st.part = [];
    if (lighter && lim(ctx, lighter, 'ksr', 1, null) && giveItem(ctx, lighter, 'x:runecharge')) limUse(ctx, lighter, 'ksr');
  }
  function ksLight(st, ctx, p, idx) {   // light one stone (ordered while the circuit is incomplete). -> 'ok' | 'backlash'
    const id = STONES[idx];
    if (!st.complete) {
      if (st.order[st.pos] !== id) { if (ctx.dmg) ctx.dmg(p, K.BACKLASH, 'backlash'); ksDark(st, ctx); fx(ctx, 'backlash', {}); return 'backlash'; }
      st.lit[idx] = ctx.now + K.STONE_BURN; st.pos++; st.lastLit = ctx.now; st.part.push(p.id); ACT.heat.add(st.heat, 10, ctx.now);
      if (st.pos >= 4) ksComplete(st, ctx, p);
    } else { st.lit[idx] = ctx.now + K.STONE_BURN; ACT.heat.add(st.heat, 10, ctx.now); }
    st.armed = st.complete && st.lit.every(t => t > 0); return 'ok';
  }
  ACT.def('keystone', {
    kind: 'vb', state0: rng => ksState(rng),
    verbs: {
      use(st, p, x, ctx) {
        ksSettle(st, ctx);
        if (ctx.a === 'B') {   // altar: Gold Leaf lights the next 2 stones
          if (!hasItem(ctx, p, 'x:goldleaf')) return 'item'; if (st.armed) return 'state';
          return chStart(st, ctx, p, 'offer', K.OFFER_MS, 'B');
        }
        const idx = STONES.indexOf(ctx.a); if (idx < 0) return 'state';
        if (chBusy(st, ctx.a)) { return st.ch.some(c => c.pid === p.id && c.anchor === ctx.a) ? null : 'busy'; }
        return st.lit[idx] ? chStart(st, ctx, p, 'feed', K.FEED_MS, ctx.a) : chStart(st, ctx, p, 'light', K.LIGHT_MS, ctx.a);
      },
      choose(st, p, x, ctx) {   // snuff a lit stone
        ksSettle(st, ctx); const idx = STONES.indexOf(ctx.a); if (idx < 0 || x !== 1 || !st.lit[idx]) return 'state';
        if (chBusy(st, ctx.a)) return 'busy'; return chStart(st, ctx, p, 'snuff', K.SNUFF_MS, ctx.a);
      },
      stop(st, p) { chCancel(st, p.id); return null; },
    },
    tick(st, ctx) {
      ksSettle(st, ctx);
      chRun(st, ctx, {
        light(s, p, c, cx) { ksSettle(s, cx); const i = STONES.indexOf(c.at); if (!p || s.lit[i]) return; if (ksLight(s, cx, p, i) === 'ok') fx(cx, 'lit', { stone: c.at }); },
        feed(s, p, c, cx) { ksSettle(s, cx); const i = STONES.indexOf(c.at); if (!p || !s.lit[i]) return; s.lit[i] = cx.now + K.STONE_BURN; ACT.heat.add(s.heat, 5, cx.now); },
        snuff(s, p, c, cx) { ksSnuff(s, cx, STONES.indexOf(c.at)); },
        offer(s, p, c, cx) {
          ksSettle(s, cx); if (!p || s.armed || !(cx.takeItem && cx.takeItem(p, 'x:goldleaf'))) return;
          for (let n = 0; n < 2; n++) {
            if (!s.complete) { if (s.pos >= 4) break; s.part.push(p.id); ksLight(s, cx, p, STONES.indexOf(s.order[s.pos])); }
            else { const i = s.lit.findIndex(t => !t); if (i < 0) break; ksLight(s, cx, p, i); }
          }
        },
      });
      ksSettle(st, ctx);
      for (const t of ACT.heat.crossed(st.heat, ctx.now)) {
        const want = K.RES_THR.indexOf(t) + 1;
        while (st.wisps.length < Math.min(K.WISP_MAX, want)) { const id = ctx.spawn ? ctx.spawn('wisp', 'F', { goal: ksWispGoal(st, ctx) }) : null; if (id == null) break; st.wisps.push(id); }
      }
      if (st.armed !== st.wasArmed) { st.wasArmed = st.armed; toast(ctx, st.armed ? 'KEYSTONE ARMED' : 'The keystone has gone out'); }
    },
    onHurt(st, p) { chHurt(st, p); },
    onLeave(st, p) { chCancel(st, p.id); },
    rekey(st, ctx) { Object.assign(st, ksState(ctx.rng)); },
    view: (st, o) => { const now = (o && o.now) || 0; return { order: st.order, pos: st.pos, complete: st.complete, armed: st.armed, lit: st.lit.map(t => t > now ? t - now : 0), res: Math.round(ACT.heat.level(st.heat, now || st.heat.t)), wisps: st.wisps.length }; },
  });
  function ksSnuff(st, ctx, idx) {
    if (idx < 0 || !st.lit[idx]) return false;
    st.lit[idx] = 0;
    if (!st.complete) ksDark(st, ctx);   // mid-circuit: the whole circuit goes dark
    st.armed = st.complete && st.lit.every(t => t > 0); return true;
  }
  // a wisp that stood next to a lit stone for WISP_SNUFF_MS: the NPC glue calls this
  function ksWispGoal(st, ctx) { const i = st.complete ? st.lit.findIndex(t => t > 0) : (st.pos > 0 ? STONES.indexOf(st.order[st.pos - 1]) : -1); return i >= 0 ? STONES[i] : null; }

  // =================================================================================================
  // THE MANAGER: layout shuffle, persistent door breach, limits, tally. One H per match.
  // =================================================================================================
  function derange(cur, rng) {
    const n = cur.length;
    for (let t = 0; t < 400; t++) { const a = shuffle(cur.slice(), rng); if (a.every((v, i) => v !== cur[i])) return a; }
    return cur.map((_, i) => cur[(i + 1) % n]);
  }
  // o: {cells:[roomKey x4], doors:{cell: vaultDoorId}, rng, now, order?}
  function create(o) {
    const rng = o.rng || ACT.rng(1), cells = o.cells.slice(), order = o.order ? o.order.slice() : shuffle(TYPES.slice(), rng);
    const H = { cells, doors: Object.assign({}, o.doors), rng, round: 1, sudden: false, order, nextOrder: derange(order, rng), revealed: false, st: {}, breach: {}, limits: ACT.limit.make(), quakeUntil: 0, wedgeAt: {}, struck: {} };
    for (const t of TYPES) H.st[t] = ACT.init(t, rng, o.now || 0);
    for (const d of Object.values(H.doors)) H.breach[d] = 0;
    return H;
  }
  const typeAt = (H, cell) => H.order[H.cells.indexOf(cell)] || null;
  const cellOf = (H, type) => H.cells[H.order.indexOf(type)] || null;
  const stOf = (H, cell) => { const t = typeAt(H, cell); return t ? H.st[t] : null; };
  const wrap = (H, cell, ctx) => Object.assign({}, ctx, { H, cell, door: H.doors[cell], round: ctx.round == null ? H.round : ctx.round, sudden: ctx.sudden == null ? H.sudden : ctx.sudden, rng: ctx.rng || H.rng });
  // ctx.a (anchor id) must be set by the caller for verbs
  function verb(H, cell, p, v, arg, ctx) { const t = typeAt(H, cell); if (!t) return 'state'; return ACT.verb(H.st[t], t, p, v, arg, wrap(H, cell, ctx)); }
  function tick(H, cell, ctx, dt) { const t = typeAt(H, cell); if (t) ACT.tick(H.st[t], t, wrap(H, cell, ctx), dt); }
  function hurt(H, cell, p, ctx) { const t = typeAt(H, cell); if (t) ACT.hurt(H.st[t], t, p, wrap(H, cell, ctx)); }
  function leave(H, cell, p, ctx) { const t = typeAt(H, cell); if (t) ACT.leave(H.st[t], t, p, wrap(H, cell, ctx)); }
  function died(H, cell, victim, killer, ctx) { const t = typeAt(H, cell); if (t) ACT.kill(H.st[t], t, killer, victim, wrap(H, cell, ctx)); }
  const view = (H, cell, now) => { const t = typeAt(H, cell); if (!t) return null; const s = H.st[t]; if (t === 'keystone') ksSettle(s, { now, rng: H.rng }); if (t === 'counting') coSettle(s, now); return { type: t, st: (ACT.get(t).view)(s, { now }) }; };
  const me = (H, cell, id) => { const s = stOf(H, cell); return s ? meTiming(s, id) : null; };
  // sudden death: all doors open, the heists turn into anti-claimant tools (Quake, Crown Seal, Bounty, Ward)
  const setSudden = (H, on) => { H.sudden = !!on; };
  // Ward (keystone armed in sudden death): the top claimant gains claim at half speed. Quake: claims frozen
  const wardActive = (H, now) => { const s = H.st.keystone; if (!H.sudden) return false; ksSettle(s, { now, rng: H.rng }); return s.armed; };
  const quakeActive = (H, now) => now < H.quakeUntil;
  // a panel bribe was paid anywhere: half goes into the strongbox
  const onBribe = (H, amount, now) => { const s = H.st.counting; coSettle(s, now); s._box = Math.min(K.BOX_CAP, s._box + Math.floor(amount * K.BRIBE_SHARE)); };
  // any kill: pay out a bounty on the victim
  const killed = (H, killer, victim, ctx) => { const s = H.st.counting; if (!killer || !victim || killer.id === victim.id || !s.bounties[victim.id]) return 0; const n = s.bounties[victim.id]; delete s.bounties[victim.id]; if (ctx.pay) ctx.pay(killer, n); return n; };
  // the claimant is gone: bounty stays (it is on the goblin; paid to whoever kills him)
  function npcGone(H, id) { for (const s of Object.values(H.st)) { if (s.wardens) s.wardens = s.wardens.filter(x => x !== id); if (s.wisps) s.wisps = s.wisps.filter(x => x !== id); } }
  const wispSnuff = (H, stoneId, ctx) => { const c = wrap(H, cellOf(H, 'keystone'), ctx); ksSettle(H.st.keystone, c); return ksSnuff(H.st.keystone, c, STONES.indexOf(stoneId)); };
  const hitBarricade = (H, dmg, ctx) => ramHitBarricade(H.st.ram, dmg, wrap(H, cellOf(H, 'ram'), ctx));

  // layout announced 15 s before the round end (or early through the Seer); never changes mid-round
  const layoutView = (H, msLeft) => {
    const cur = {}, nxt = {}; H.cells.forEach((c, i) => { cur[c] = H.order[i]; nxt[c] = H.nextOrder[i]; });
    return { vb: cur, vbNext: H.revealed || (msLeft != null && msLeft <= K.ANNOUNCE_MS) ? nxt : null };
  };
  const reveal = H => { H.revealed = true; return layoutView(H, 0).vbNext; };
  // the round boundary: call AFTER the tally. ctxFor(cell) -> the glue ctx for that cell (occupants of the OLD type are converted/reset first)
  function roundBoundary(H, ctxFor) {
    H.cells.forEach((c, i) => { const t = H.order[i]; ACT.rekey(H.st[t], t, wrap(H, c, ctxFor(c))); });
    for (const d of Object.keys(H.breach)) H.breach[d] = Math.max(0, H.breach[d] - K.BREACH_DECAY);
    ACT.limit.newRound(H.limits); H.struck = {}; H.round++;
    H.order = H.nextOrder; H.nextOrder = derange(H.order, H.rng); H.revealed = false;
    H.cells.forEach((c, i) => { const cx = ctxFor(c); (cx.fx || noop)('rekey', { cell: c, type: H.order[i] }, 'room'); });
    return layoutView(H, null);
  }
  // ---- the vault tally (4.7). m: {sel:{roomKey: doorId}, picked:{roomKey:1}, bribes:{roomKey:n}, bribeRule, vaultDoors:[ids], prevOpen:[ids], barred:{doorId:1}, alarm, sudden, now}
  function heistVotes(H, m) {
    const now = m.now || 0, sel = m.sel || {}, vault = m.vaultDoors || Object.values(H.doors), picked = m.picked || {}, bribes = m.bribes || {};
    const ks = H.st.keystone, co = H.st.counting; ksSettle(ks, { now, rng: H.rng });
    const weights = {}, extra = {}, rooms = []; let total = 0;
    for (const k of Object.keys(sel)) {
      const d = sel[k]; if (!vault.includes(d)) continue; rooms.push(k);
      const base = 1 + (picked[k] ? 1 : 0) + (m.bribeRule ? (bribes[k] || 0) : 0), t = H.cells.includes(k) ? typeAt(H, k) : null;
      let ex = 0;
      if (t === 'keystone' && ks.armed) ex += 1;
      if (t === 'counting') ex += Math.max(0, co.writs - co.counters);
      if ((H.breach[d] || 0) >= K.CRACKED) ex += 1;
      weights[k] = base + ex; extra[k] = ex; total += base + ex;
    }
    const voted = total >= 2 ? [...new Set(rooms.map(k => sel[k]))] : [], fizzled = total >= 2 ? [] : [...new Set(rooms.map(k => sel[k]))];
    const broken = vault.filter(d => (H.breach[d] || 0) >= K.BROKEN);
    let open;
    if (m.sudden || m.alarm) open = vault.slice();
    else {
      const barred = m.barred || {}, keep = (m.prevOpen || []).filter(d => !barred[d] || broken.includes(d));
      open = [...new Set([...voted, ...broken, ...keep])];
    }
    return { weights, extra, total, voted, fizzled, broken, open };
  }
  // ---- fields for roundState: vb, vbNext, breach, armed, writs
  function roundFields(H, now, msLeft) {
    const L = layoutView(H, msLeft), armed = [], writs = {};
    ksSettle(H.st.keystone, { now, rng: H.rng }); if (H.st.keystone.armed) armed.push(cellOf(H, 'keystone'));
    writs[cellOf(H, 'counting')] = Math.max(0, H.st.counting.writs - H.st.counting.counters);
    return { vb: L.vb, vbNext: L.vbNext, breach: Object.assign({}, H.breach), armed, writs };
  }
  // ---- risk meters (publicity / noise / alarm / resonance)
  function risk(H, cell, now) {
    const t = typeAt(H, cell), s = H.st[t];
    if (t === 'ram') return { kind: 'publicity', v: s.strikes, max: 3 };
    if (t === 'locksmith') return { kind: 'noise', v: Math.round(ACT.heat.level(s.heat, now)), max: K.ALARM };
    if (t === 'counting') return { kind: 'alarm', v: s.alarmUntil > now ? 1 : 0, max: 1 };
    return { kind: 'resonance', v: Math.round(ACT.heat.level(s.heat, now)), max: 90 };
  }

  // ---------- bot goal hints. info: {now, round, sudden, gold, metal, has:(key)=>bool, aggression, greed, defend, wantVault, wantNoVault, rivalArmed}
  // -> {score, next} where next is {go:anchorId} | {verb, a, x} | null (leave). Bots take the same ACT.verb path; maxStay 45 s.
  function botHint(H, cell, p, info) {
    const t = typeAt(H, cell), s = H.st[t], now = info.now || 0, has = info.has || (() => false);
    const out = { score: 0, next: null, maxStay: 45000 };
    if (t === 'keystone') {
      ksSettle(s, { now, rng: H.rng }); out.score = info.round > 2 ? 6 : 2;
      if (info.wantNoVault && info.rivalArmed) { const i = s.lit.findIndex(x => x > 0); if (i >= 0) out.next = { verb: 'choose', a: STONES[i], x: 1 }; return out; }
      if (!s.complete) { out.next = s.pos < 4 ? { verb: 'use', a: s.order[s.pos] } : null; return out; }
      const dark = s.lit.findIndex(x => !x); if (dark >= 0) { out.next = { verb: 'use', a: STONES[dark] }; return out; }
      const low = s.lit.findIndex(x => x - now < 10000); out.next = low >= 0 ? { verb: 'use', a: STONES[low] } : null; return out;
    }
    if (t === 'counting') {
      coSettle(s, now); out.score = info.gold >= 50 ? 5 : 0;
      if (p.carry) { out.next = { go: 'exit' }; return out; }
      if (s._box >= 80 && info.greed > 0.6) { out.score += 2; out.next = { verb: 'use', a: 'R', x: has('x:skeleton') ? 1 : 0 }; return out; }
      if (info.wantVault && s.writs < K.WRIT.length && info.gold >= writPrice(s)) { out.next = { verb: 'buy', a: 'B', x: 0 }; return out; }
      if (info.wantNoVault && s.writs > s.counters && info.gold >= Math.ceil(1.5 * writPrice(s))) { out.next = { verb: 'buy', a: 'B', x: 1 }; return out; }
      return out;
    }
    if (t === 'locksmith') {
      out.score = info.metal >= 2 || has('x:blank') ? 3 : 0;
      if (ACT.heat.level(s.heat, now) > 60) return out;   // cautious: leave
      if (!has('x:blank')) { out.next = info.metal >= 2 ? { verb: 'use', a: 'L', x: 0 } : (has('x:wedge') ? { verb: 'use', a: 'L', x: 1 } : null); return out; }
      if (s.pins < K.PINS) { out.next = s._tm[p.id] ? { verb: 'tap', a: 'B' } : { verb: 'use', a: 'B' }; return out; }
      out.next = { verb: 'choose', a: 'B', x: ACT.limit.ok(H.limits, p, 'lp', 1, 2) ? 0 : 2 }; return out;
    }
    // ram
    out.score = info.aggression > 0.6 && info.round >= 3 ? 4 : 0;
    if (info.defend && !s.bar) { out.next = { verb: 'buy', a: 'F', x: info.metal >= K.BAR_METAL ? 0 : 1 }; return out; }
    if (s.notches >= 4 || (s.notches >= 2 && s.handles.every(h => h == null) && s.strikes > 0)) { out.next = { verb: 'use', a: 'FL', x: has('x:runecharge') ? 1 : 0 }; return out; }
    out.next = s._tm[p.id] ? { verb: 'tap', a: 'B' } : { verb: 'use', a: 'B', x: s.handles[0] != null && s.handles[0] !== p.id ? 1 : 0 }; return out;
  }

  const VB5 = { TYPES, K, NPC, TOKENS, RING, STONES, create, derange, typeAt, cellOf, stOf, verb, tick, hurt, leave, died, view, me, setSudden, wardActive, quakeActive, onBribe, killed, npcGone, wispSnuff, hitBarricade, layoutView, reveal, roundBoundary, heistVotes, roundFields, risk, botHint, ksWispGoal: (H, ctx) => ksWispGoal(H.st.keystone, ctx) };
  root.VB5 = VB5;
  if (typeof module !== 'undefined' && module.exports) module.exports = VB5;
})(typeof window !== 'undefined' ? window : globalThis);

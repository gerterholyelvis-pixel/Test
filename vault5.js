// THE VAULT (PLAN-5x5-rooms section 5 + owner decisions): pure logic, no I/O, no timers, no Date.now()/Math.random().
// Treasury, relic restock, the cumulative Crown Claim (decides the match ONLY at the time limit; there is no instant win),
// vault alarm + Vault Wardens, gold coffers, door bars, sudden-death venting. Registers itself as ACT room type 'vault'.
// Times in ms, dt in ms, positions in metres. A player p is {id, name?, x, z, room, alive, hp?, kills?, hurtAt?}.
(function (root, factory) {
  const ACT = (typeof module !== 'undefined' && module.exports) ? require('./activity.js') : root.ACT;
  const api = factory(ACT);
  root.VAULT5 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (ACT) {
  const K = {
    SUDDEN_ROUND: 5, MAX_ROUND: 7,                 // sudden death starts AFTER round 5; the match is decided at the end of round 7
    DAIS_R: 2.2, CLAIM_UNHURT_MS: 1000, CLAIM_MIN: 5000, SUDDEN_CLAIM_MUL: 1.5, WARD_MUL: 0.5,
    ALARM_AFTER_MS: 10000,                         // the vault doors stay forced open this long after the last gain
    WARDEN_EVERY: 20000, WARDEN_MAX: 2,
    COFFER_HANDFULS: 3, COFFER_REFILL: 15000, COFFER_REFILL_SUDDEN: 7500, SCOOP_MS: 2000, SCOOP_GOLD: 12, SCOOP_PER_ROUND: 6,
    BAR_MS: 5000, BAR_PERSONAL_CD: 10000,          // 5 s channel; a goblin who just barred a door waits 10 s before barring another
    TREASURY_GOLD: 20, TREASURY_KNOW: 4,
    RELIC_ROUNDS: [3, 5],                          // the relic restocks at the START of these rounds if it was taken
    VENT_MS: 3000, VENT_DMG: 1, VENT_KINDS: ['outer', 'home', 'loot'],
    COFFERS: ['K1', 'K2', 'K3', 'K4'], BAR_RACKS: { D_N: 'N', D_E: 'E', D_S: 'S', D_W: 'W' }, DIRS: ['N', 'E', 'S', 'W'],
  };
  // Vault Warden NPC kind (the Locksmith plan gives the numbers); the server merges this into its NPC table.
  const NPC = { warden: { hp: 90, dmg: 14, cd: 1000, speed: 3.4, react: 400, loot: [1, 1], name: 'Vault Warden' } };

  // Default room classifier from the PLAN-5x5 numbering. The server may pass ctx.roomKind(key) instead.
  function kindOf(key) {
    key = String(key);
    if (key[0] === 'c') { const n = +key.slice(1) % 5; return n === 1 || n === 3 ? 'home' : 'loot'; }   // 20 attached rooms, 5 per side: positions 2 and 4 are homes
    const i = +key; if (!(i >= 0 && i < 25)) return 'none';
    if (i === 12) return 'vault';
    if ([7, 11, 13, 17].includes(i)) return 'vb';
    if ([6, 8, 16, 18].includes(i)) return 'tree';
    return 'outer';
  }
  const isSudden = round => round > K.SUDDEN_ROUND;
  const matchOver = round => round >= K.MAX_ROUND;

  function state0(rng, now) {
    const pools = {}; for (const k of K.COFFERS) pools[k] = ACT.pool.make(K.COFFER_HANDFULS, K.COFFER_REFILL);
    const ch = {}; for (const k of K.COFFERS) ch[k] = ACT.channel.make();
    for (const k of Object.keys(K.BAR_RACKS)) ch[k] = ACT.channel.make();
    return {
      cap: ACT.capture.make(),                     // cap.acc[id] = cumulative claim ms, kept across rounds, deleted on death
      names: {}, hurtAt: {},
      gaining: null, alarmUntil: 0, freezeUntil: 0, ward: false, sudden: false,
      pools, ch, wardens: ACT.waves.make(K.WARDEN_EVERY, K.WARDEN_MAX, 1e15),
      barred: {}, barPend: {}, barLast: {},         // barred[dir] = used this round; barPend[dir] = closes at the round end; barLast[id] = ms of the last bar
      L: ACT.limit.make(), vent: {}, ventWarned: false, relicTaken: false, stats: { treasury: 0, scoops: 0, bars: 0 },
    };
  }

  // ---- helpers
  const anchorOf = (ctx, a) => ctx.anchor && ctx.anchor(a);
  const now_ = ctx => ctx.now;
  const byId = (ctx, id) => (ctx.occupants() || []).find(p => p.id === id) || null;
  const alarmOn = (st, now) => st.gaining != null || now < st.alarmUntil;
  const top = st => { const r = ACT.capture.ranking(st.cap); return r.length ? r[0] : null; };
  function remember(st, p) { if (p && p.name) st.names[p.id] = p.name; }
  function award(ctx, p, what, src) {
    if (ctx.award) return ctx.award(p, Object.assign({ exempt: true }, what), src);
    return what;
  }

  // ---- verbs. arg is an anchor id string, or {a, x} as the server passes it.
  const argA = arg => (arg && typeof arg === 'object') ? arg.a : arg;
  const verbs = {
    use(st, p, arg, ctx) {
      const a = argA(arg), now = now_(ctx);
      if (!p || p.alive === false) return 'state';
      remember(st, p);
      if (K.COFFERS.includes(a)) {
        if (ctx.carryBlocks && ctx.carryBlocks(p)) return 'carry';
        if (!ACT.limit.ok(st.L, p, 'scoop', K.SCOOP_PER_ROUND)) return 'cap';
        if (ACT.pool.level(st.pools[a], now) < 1) return 'state';
        if (!ACT.reach(p, anchorOf(ctx, a))) return 'far';
        return ACT.channel.start(st.ch[a], p, now, K.SCOOP_MS, { anchor: a });
      }
      if (K.BAR_RACKS[a]) {
        const dir = K.BAR_RACKS[a];
        if (ctx.sudden || st.sudden) return 'state';
        if (alarmOn(st, now)) return 'state';                       // nothing can be barred while the crown alarm is on
        if (ctx.doorBroken && ctx.doorBroken(dir)) return 'state';  // a Broken door cannot be barred
        if (ctx.doorOpen && !ctx.doorOpen(dir)) return 'state';     // only an OPEN door needs a bar
        if (st.barred[dir]) return 'cool';                          // once per door per round
        if (st.barLast[p.id] != null && now - st.barLast[p.id] < K.BAR_PERSONAL_CD) return 'cool';
        if (!ACT.reach(p, anchorOf(ctx, a))) return 'far';
        return ACT.channel.start(st.ch[a], p, now, K.BAR_MS, { anchor: a });
      }
      return 'state';
    },
    stop(st, p, arg) {
      const a = argA(arg);
      if (a && st.ch[a]) { if (st.ch[a].by === p.id) ACT.channel.cancel(st.ch[a]); return null; }
      for (const k of Object.keys(st.ch)) if (st.ch[k].by === p.id) ACT.channel.cancel(st.ch[k]);
      return null;
    },
  };

  // ---- tick: the claim, alarm, wardens, coffer and bar channels
  function tick(st, ctx, dt) {
    const now = now_(ctx), sudden = !!(ctx.sudden || st.sudden), occ = ctx.occupants() || [];
    if (sudden && !st.sudden) suddenStart(st, ctx);
    for (const p of occ) remember(st, p);
    // 1. channels (coffers, bars)
    for (const k of Object.keys(st.ch)) {
      const ch = st.ch[k]; if (ch.by == null) continue;
      const p = occ.find(x => x.id === ch.by) || null, r = ACT.channel.update(ch, p, now);
      if (r === 'done') finishChannel(st, ctx, k, p, now);
    }
    // 2. the crown claim: sole occupant of the dais, unhurt for 1 s, gains; 2+ freeze; quake freezes everybody
    const dais = anchorOf(ctx, 'dais') || { x: 0, z: 0 };
    const onDais = occ.filter(p => p.alive !== false && Math.hypot(p.x - dais.x, p.z - dais.z) <= K.DAIS_R)
      .map(p => ({ id: p.id, alive: true, hurtAt: Math.max(p.hurtAt || -1e12, st.hurtAt[p.id] != null ? st.hurtAt[p.id] : -1e12) }));
    let gaining = null;
    if (now < st.freezeUntil) { /* quake: nobody gains, claims are kept */ }
    else {
      let mul = sudden ? K.SUDDEN_CLAIM_MUL : 1;
      const t = top(st);
      if (st.ward && onDais.length === 1 && t && t.id === onDais[0].id) mul *= K.WARD_MUL;   // Keystone ward in sudden death
      const r = ACT.capture.step(st.cap, onDais, dt * mul, { now, unhurtMs: K.CLAIM_UNHURT_MS, cumulative: true });
      if (r.holder != null && !r.blocked) gaining = r.holder;
    }
    const was = st.gaining;
    st.gaining = gaining;
    if (gaining != null) st.alarmUntil = now + K.ALARM_AFTER_MS;
    if (gaining != null && (was == null || was !== gaining)) {
      if (was == null) ACT.waves.arm(st.wardens, now);                    // first warden 20 s after the claim starts
      if (ctx.toastAll) ctx.toastAll((st.names[gaining] || 'A goblin') + ' is claiming the crown!');
      if (ctx.fx) ctx.fx('alarm', { on: 1, id: gaining }, 'all');
    } else if (was != null && gaining == null && ctx.fx) ctx.fx('alarm', { on: 0 }, 'room');
    // 3. Vault Wardens: only while someone gains, hunting the claimant
    if (gaining != null && ctx.spawn) {
      const w = st.wardens;
      if (ctx.npcAlive) for (const id of w.alive.slice()) if (!ctx.npcAlive(id)) ACT.waves.gone(w, id);
      if (ACT.waves.due(w, now)) {
        const id = ctx.spawn('warden', 'grate', { target: gaining });
        if (id != null) ACT.waves.spawned(w, id, now); else ACT.waves.skip(w, now);
      }
    }
    return { gaining, alarm: alarmOn(st, now) };
  }

  function finishChannel(st, ctx, k, p, now) {
    if (K.COFFERS.includes(k)) {
      if (!ACT.pool.take(st.pools[k], now, 1)) return;
      if (!ACT.limit.ok(st.L, p, 'scoop', K.SCOOP_PER_ROUND)) return;
      ACT.limit.use(st.L, p, 'scoop'); st.stats.scoops++;
      award(ctx, p, { gold: K.SCOOP_GOLD }, 'vault:coffer');
      if (ctx.fx) ctx.fx('scoop', { a: k }, 'room');
    } else if (K.BAR_RACKS[k]) {
      const dir = K.BAR_RACKS[k];
      if (st.barred[dir] || alarmOn(st, now) || st.sudden || (ctx.doorBroken && ctx.doorBroken(dir))) return;
      st.barred[dir] = true; st.barPend[dir] = true; st.barLast[p.id] = now; st.stats.bars++;
      if (ctx.fx) ctx.fx('bar', { dir }, 'room');
    }
  }

  // ---- hooks
  function hurt(st, p, ctx) {
    st.hurtAt[p.id] = ctx && ctx.now != null ? ctx.now : 0;
    for (const k of Object.keys(st.ch)) ACT.channel.hurt(st.ch[k], p.id);
  }
  function leave(st, p) { for (const k of Object.keys(st.ch)) if (st.ch[k].by === p.id) ACT.channel.cancel(st.ch[k]); }
  // death (or disconnect): the claim is lost, channels stop. Death loses everything.
  function death(st, p) {
    const id = p && typeof p === 'object' ? p.id : p;
    ACT.capture.reset(st.cap, id); leave(st, { id }); delete st.hurtAt[id]; delete st.vent[id];
    if (st.gaining === id) st.gaining = null;
  }

  // ---- sudden-death hooks from the vaultbreakers (heists5.js calls these)
  const setWard = (st, on) => { st.ward = !!on; };
  const quake = (st, now, ms = 3000) => { st.freezeUntil = Math.max(st.freezeUntil, now + ms); };
  // Crown Seal token: +5 s of claim on the dais. Returns false unless p is alive and on the dais.
  function sealClaim(st, p, ctx, ms = 5000) {
    const dais = anchorOf(ctx, 'dais') || { x: 0, z: 0 };
    if (!p || p.alive === false || Math.hypot(p.x - dais.x, p.z - dais.z) > K.DAIS_R + 0.5) return false;
    st.cap.acc[p.id] = (st.cap.acc[p.id] || 0) + ms; return true;
  }
  const topClaimant = st => { const t = top(st); return t && t.ms > 0 ? t.id : null; };   // for the Counting House bounty

  // ---- venting (sudden death): outer ring, homes and loot rooms hurt, 1 HP per 3 s. players = [{id, room, alive}]
  function ventTick(st, players, ctx) {
    const now = now_(ctx), kindFn = ctx.roomKind || kindOf, hits = [];
    if (!(ctx.sudden || st.sudden)) return hits;
    for (const p of players) {
      if (p.alive === false) { delete st.vent[p.id]; continue; }
      if (!K.VENT_KINDS.includes(kindFn(p.room))) { delete st.vent[p.id]; continue; }
      if (st.vent[p.id] == null) { st.vent[p.id] = now; continue; }
      while (now - st.vent[p.id] >= K.VENT_MS) {
        st.vent[p.id] += K.VENT_MS; hits.push(p.id);
        if (ctx.dmg) ctx.dmg(p, K.VENT_DMG, 'vent');
        if (p.alive === false) break;
      }
    }
    return hits;
  }
  // the one-time hazard warning when sudden death starts
  function suddenStart(st, ctx) {
    st.sudden = true;
    for (const k of K.COFFERS) { ACT.pool.level(st.pools[k], now_(ctx)); st.pools[k].refillMs = K.COFFER_REFILL_SUDDEN; }   // coffers refill twice as fast
    if (!st.ventWarned) { st.ventWarned = true; if (ctx.toastAll) ctx.toastAll('SUDDEN DEATH: the outer rooms are venting. Get to the vault!'); }
  }

  // ---- rounds
  // Call at the start of round `round` (1-based). -> {restock: bool}: the server rerolls the relic when true.
  function roundStart(st, ctx, round) {
    st.relicTaken = !!(ctx.relicTaken && ctx.relicTaken());
    const restock = K.RELIC_ROUNDS.includes(round) && st.relicTaken;
    if (restock && ctx.toastAll) ctx.toastAll('The relic pedestal glitters again.');
    if (round > K.SUDDEN_ROUND) suddenStart(st, ctx);
    return { restock };
  }
  // Call at the round boundary for the round that is ending (ctx.round). Pays the treasury, applies bars, rolls limits over.
  // -> {treasury:[{id,gold,know}], close:[dirs the vault must re-seal], over: bool (this was the last round), decision: decide() result or null}
  function roundEnd(st, ctx) {
    const now = now_(ctx), occ = (ctx.occupants() || []).filter(p => p.alive !== false), treasury = [];
    for (const p of occ) {
      award(ctx, p, { gold: K.TREASURY_GOLD, know: K.TREASURY_KNOW }, 'vault:treasury');
      treasury.push({ id: p.id, gold: K.TREASURY_GOLD, know: K.TREASURY_KNOW }); st.stats.treasury++;
    }
    const sudden = !!(ctx.sudden || st.sudden) || ctx.round > K.SUDDEN_ROUND, close = [];
    for (const dir of K.DIRS) {
      if (!st.barPend[dir]) continue;
      const broken = ctx.doorBroken && ctx.doorBroken(dir);
      if (!sudden && !alarmOn(st, now) && !broken) close.push(dir);
    }
    st.barPend = {}; st.barred = {};
    for (const k of Object.keys(st.ch)) ACT.channel.cancel(st.ch[k]);
    ACT.limit.newRound(st.L);
    const over = matchOver(ctx.round || 0);
    return { treasury, close, over, decision: over ? decide(st, ctx.players ? ctx.players() : occ) : null };
  }

  // ---- THE END OF THE MATCH. Only called at the time limit. Highest cumulative claim (at least CLAIM_MIN) among the living,
  // then most kills, then most HP, then the lowest id (deterministic). players = [{id, name?, alive, hp, kills}].
  function ranking(st, players) {
    const live = (players || []).filter(p => p && p.alive !== false);
    return live.map(p => ({ id: p.id, name: p.name, claim: ACT.capture.total(st.cap, p.id), kills: p.kills || 0, hp: p.hp || 0 }))
      .sort((a, b) => {
        const ca = a.claim >= K.CLAIM_MIN ? a.claim : 0, cb = b.claim >= K.CLAIM_MIN ? b.claim : 0;
        return (cb - ca) || (b.kills - a.kills) || (b.hp - a.hp) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
  }
  function decide(st, players) {
    const r = ranking(st, players);
    if (!r.length) return { winner: null, reason: 'none', ranking: r };
    const w = r[0], n = r[1], c = x => x.claim >= K.CLAIM_MIN ? x.claim : 0;
    let reason = 'claim';
    if (!c(w)) reason = (!n || w.kills !== n.kills) ? 'kills' : (w.hp !== n.hp ? 'hp' : 'tiebreak');
    else if (n && c(n) === c(w)) reason = w.kills !== n.kills ? 'claim-kills' : (w.hp !== n.hp ? 'claim-hp' : 'tiebreak');
    return { winner: w.id, name: w.name, reason, claim: w.claim, ranking: r };
  }

  // ---- public view for `crown` / roundState / actS. Top 3 claims (seconds), alarm, coffers and bars.
  function view(st, ctx) {
    const now = ctx && ctx.now != null ? ctx.now : 0;
    const claims = ACT.capture.ranking(st.cap).filter(x => x.ms > 0).slice(0, 3).map(x => ({ id: x.id, name: st.names[x.id] || null, s: Math.floor(x.ms / 100) / 10 }));
    const cof = {}; for (const k of K.COFFERS) cof[k] = ctx && ctx.now != null ? ACT.pool.level(st.pools[k], now) : st.pools[k].n;
    const bars = []; for (const d of K.DIRS) if (st.barred[d]) bars.push(d);
    return { claims, gaining: st.gaining, alarm: alarmOn(st, now), cof, bars, ward: !!st.ward, sudden: !!st.sudden, min: K.CLAIM_MIN / 1000 };
  }
  // the player's own claim in seconds (for actMe)
  const claimOf = (st, id) => Math.floor(ACT.capture.total(st.cap, id) / 100) / 10;

  const spec = {
    kind: 'vault', anchors: { dais: 'C', coffers: ['K1', 'K2', 'K3', 'K4'], racks: ['D_N', 'D_E', 'D_S', 'D_W'], grate: 'grate', relic: 'relic' },
    state0, verbs, tick: (st, ctx, dt) => { tick(st, ctx, dt); }, onHurt: hurt, onLeave: leave, sudden: (st, ctx) => suddenStart(st, ctx),
    view: st => view(st, null),
    npc: NPC,
    bot: { score: () => 0, next: () => null, maxStay: 60000 },
    yield: { goldPerMin: 50, notes: 'coffers: 12 gold per 2 s scoop, 3 handfuls per coffer refilling 1 per 15 s, max 6 scoops per goblin per round; treasury 20 gold + 4 knowledge per round' },
  };
  if (ACT && !ACT.get('vault')) ACT.def('vault', spec);

  return { K, NPC, spec, kindOf, isSudden, matchOver, state0, verbs, tick, hurt, leave, death, setWard, quake, sealClaim, topClaimant,
    ventTick, suddenStart, roundStart, roundEnd, ranking, decide, view, claimOf, alarmOn };
});

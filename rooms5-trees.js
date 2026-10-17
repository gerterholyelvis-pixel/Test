// rooms5-trees.js: the 10 TREE ROOMS as activity specs (PLAN-5x5-rooms section 3). Pure logic on top of activity.js:
// no I/O, no timers, no Date.now()/Math.random(). Everything takes ctx.now / ctx.rng, so tests run on a fake clock.
// UMD: require('./rooms5-trees.js') on the server and in tests, window.TREES5 in the browser (the client only needs TYPES/WEIGHTS/BLESS/NAMES).
// The server glue contract (ctx, verb arguments, extra ctx functions) is documented in docs/reports/rooms5-trees.md.
(function (root) {
  const ACT = (typeof module !== 'undefined' && module.exports) ? require('./activity.js') : root.ACT;
  const { channel, pool, timing, station, waves, carry, sequence, capture, limit: lim } = ACT;

  const TYPES = ['well', 'press', 'spring', 'seer', 'graft', 'thorn', 'gambler', 'memory', 'oak', 'elder'];
  const WEIGHTS = { well: 22, press: 16, spring: 14, seer: 12, graft: 10, thorn: 8, gambler: 7, memory: 5, oak: 4, elder: 2 };   // plan 3.1
  const NAMES = { well: 'Sapling Well', press: 'Brain Press', spring: 'Healing Spring', seer: "Seer's Tree", graft: 'Grafting Bench', thorn: 'Thorn Shrine', gambler: "Gambler's Root", memory: 'Memory Tree', oak: 'Hollow Oak', elder: 'Elder Tree' };
  const BLESS = { fury: [0.05, 0.10, 0.15], bark: [0.08, 0.15, 0.22], thorns: [0.10, 0.20, 0.30] };   // attack %, max HP %, melee reflect %, by tier I..III
  const BLESS_KEYS = ['fury', 'bark', 'thorns'];
  const K = {   // balance numbers in one place
    wellPool: 4, wellRefill: 12000, wellHits: 3, wellDrinks: 4, drinkKnow: 3, fruitKnow: 12, fruitMs: 1500, pourMs: 1000, stages: 4, crankIdle: 6000, tapCd: 400, readyHold: 15000,
    huskEvery: 25000, huskMax: 3, huskFirst: 10000, pressMs: 3000, pressCap: 6, huskKnow: 4, rouseElixir: 6, rouseCd: 10000,
    springRefill: 25000, bottleMs: 2000, bottleCap: 3, bottleCarry: 2, blessElixir: 6, healPerSec: 2, springUnhurt: 1500,
    seerK: 6, seerCd: 500, seerCap: 3, seerKnow: 3,
    branchRefill: 30000, cutMs: 2000, viseMs: 6000, viseOwner: 4000, graftCap: 2, scionCarry: 2,
    gripDps: 4, tierMs: [3000, 6000, 9000], gripCap: 2, bowlMax: 3, bowlMs: 1000, bowlKnow: 5,
    feedCap: 4, chewMs: 1500, odds: [0.70, 0.55, 0.40, 0.25, 0.15], boostOdds: 0.10, boostElixir: 10, hoardMax: 5, stumpOwner: 8000,
    memPer: 700, memInput: 12000, memCd: 6000, memCap: 3, memKnow: 5, memMax: 7, memRemember: 10,
    oakHold: 3000, oakWhisper: 8000, oakKnow: 2, oakCap: 6, oakR: 0.9, oakLook: 30, oakAmbush: 1.5,
    stoneMs: [20000, 30000, 30000], seedMs: 2000, rumbleMs: 5000, rootEvery: 20000, rootMax: 2, elderKnow: [25, 12, 6], elderTier: [3, 2, 1], elderWakes: 3,
  };

  // ---------------------------------------------------------------- the roll
  // 4 distinct tree types for the 4 inner corners (cells 6, 8, 16, 18 in that order): weighted, without replacement. rng: () => [0,1)
  function rollTrees(rng, n) {
    const left = TYPES.map(t => [t, WEIGHTS[t]]), out = [];
    for (let i = 0, cnt = n == null ? 4 : n; i < cnt && left.length; i++) {
      let tot = 0; for (const e of left) tot += e[1];
      let r = rng() * tot, j = 0; for (; j < left.length - 1; j++) { r -= left[j][1]; if (r < 0) break; }
      out.push(left[j][0]); left.splice(j, 1);
    }
    return out;
  }

  // ---------------------------------------------------------------- helpers
  const A = arg => typeof arg === 'string' ? { a: arg } : (arg && typeof arg === 'object' ? arg : {});
  const num = v => typeof v === 'number' && isFinite(v);
  const byId = (ctx, id) => ctx.player ? ctx.player(id) : (ctx.occupants() || []).find(x => x.id === id) || null;
  const knowLeft = (ctx, p) => ctx.knowLeft ? ctx.knowLeft(p) : Infinity;
  const usedR = (st, p, k) => lim.used(st._L, p, k).round;
  const usedM = (st, p, k) => lim.used(st._L, p, k).match;
  const count = (ctx, p, k) => ctx.count ? ctx.count(p, k) : (ctx.item && ctx.item(p, k) ? 1 : 0);
  const itemsOf = ctx => (ctx && ctx.items) || (root.GKITEMS && root.GKITEMS.ITEMS) || (typeof require === 'function' ? (() => { try { return require('./items.js').ITEMS; } catch (e) { return {}; } })() : {});
  // pay through the single reward function; tell the room when the knowledge cap bit ("The trees have taught you enough for now")
  const pay = (ctx, p, what, src) => { const o = ctx.award(p, what, src); if (o && o.capped && ctx.fx) ctx.fx('capped', { id: p.id }, 'room'); return o; };
  const fx = (ctx, k, d, scope) => { if (ctx.fx) ctx.fx(k, d || {}, scope || 'room'); };
  const near = (b, p, id, pad) => { const an = b.anchor && b.anchor(id); return !an || Math.hypot(p.x - an.x, p.z - an.z) <= (an.r || 0) + (pad == null ? 1.0 : pad); };
  const distTo = (ctx, p, id) => { const an = ctx.anchor(id); return an ? Math.hypot(p.x - an.x, p.z - an.z) : Infinity; };
  const inZone = (ctx, p, id, r) => { const an = ctx.anchor(id); return !!an && Math.hypot(p.x - an.x, p.z - an.z) <= (r || an.r || 1); };

  // weighted item roll by drop chance. o: {type, tier} exact tier, or {type, min} at least that tier. Reforged twins (`up`) and start-only items never roll.
  function rollItem(items, rng, o) {
    const c = []; let tot = 0;
    for (const k of Object.keys(items)) {
      const it = items[k]; if (!it || it.up || !(it.chance > 0 || (it.rare && it.rw > 0))) continue;   // RARE: the rare items (chance 0) weigh their rw
      if (o.type && it.type !== o.type) continue;
      const t = it.tierN | 0; if (o.tier != null ? t !== o.tier : t < (o.min || 0)) continue;
      const w = it.chance > 0 ? it.chance : it.rw; c.push([k, w]); tot += w;
    }
    if (!c.length) return null;
    let r = rng() * tot; for (const e of c) { r -= e[1]; if (r < 0) return e[0]; }
    return c[c.length - 1][0];
  }
  // one tier up, same type (falls through to higher tiers if the next one is empty); null if there is none
  function rollUp(items, rng, key, minTier) {
    const it = items[key]; if (!it) return null;
    for (let t = Math.max((it.tierN | 0) + 1, minTier || 0); t <= 5; t++) { const k = rollItem(items, rng, { type: it.type, tier: t }); if (k) return k; }
    return null;
  }
  const gear = it => !!it && (it.type === 'weapon' || it.type === 'armor');

  // ---------------------------------------------------------------- shared channel plumbing (one channel object per named action)
  function ch(st, name) { return st.chs[name] || (st.chs[name] = channel.make()); }
  function chStart(st, p, ctx, name, anchor, ms, o) {
    for (const k of Object.keys(st.chs)) if (st.chs[k].by === p.id && k !== name) return 'busy';
    const c = ch(st, name), r = channel.start(c, p, ctx.now, ms, { anchor });
    if (r) return r;
    if (c.t0 === ctx.now) c.o = o || null;   // fresh start (a key repeat keeps the old clock and options)
    return null;
  }
  const chView = st => Object.keys(st.chs).filter(k => st.chs[k].by != null).map(k => { const c = st.chs[k]; return { n: k, a: c.anchor, by: c.by, t0: c.t0, ms: c.ms }; });
  function chanTick(spec, st, ctx, dt) {
    for (const name of Object.keys(st.chs)) {
      const c = st.chs[name]; if (c.by == null) continue;
      const p = byId(ctx, c.by), snap = { anchor: c.anchor, o: c.o, t0: c.t0, ms: c.ms, id: c.by };
      const r = channel.update(c, p, ctx.now);
      if (r === 'done' && spec.fin && spec.fin[name]) spec.fin[name](st, p, ctx, snap);
      else if (r === 'broken' && spec.brk && spec.brk[name]) spec.brk[name](st, snap.id, ctx, snap);
      else if (r === 'run' && spec.run && spec.run[name]) spec.run[name](st, p, ctx, dt, snap);
    }
  }
  // E up: complete a channel that has just run its full length (the tick may not have seen it yet), otherwise cancel it
  function stopV(spec) {
    return (st, p, arg, ctx) => {
      for (const name of Object.keys(st.chs)) {
        const c = st.chs[name]; if (c.by !== p.id) continue;
        const snap = { anchor: c.anchor, o: c.o, t0: c.t0, ms: c.ms, id: c.by }, r = channel.update(c, p, ctx.now);
        if (r === 'done' && spec.fin && spec.fin[name]) spec.fin[name](st, p, ctx, snap);
        else if (r === 'run' || r === 'idle') channel.cancel(c);
      }
      if (spec.stop) spec.stop(st, p, arg, ctx);
      return null;
    };
  }
  const roundRoll = (st, ctx) => { const r = ctx.round == null ? 0 : ctx.round; if (st._lr !== r) { lim.newRound(st._L); st._lr = r; } };
  const base = () => ({ chs: {}, _L: lim.make(), _lr: null });

  // register: wraps every verb (round rollover of the per-round limits, argument normalisation), adds `stop`, the channel tick and the hurt/leave hooks
  function def(type, spec) {
    spec.kind = 'tree'; spec.type = type;
    const verbs = {};
    for (const v of Object.keys(spec.verbs)) { const f = spec.verbs[v]; verbs[v] = (st, p, arg, ctx) => { roundRoll(st, ctx); return f(st, p, A(arg), ctx); }; }
    if (!verbs.stop) { const f = stopV(spec); verbs.stop = (st, p, arg, ctx) => { roundRoll(st, ctx); return f(st, p, A(arg), ctx); }; }
    spec.verbs = verbs;
    const tick = spec.tick, hurt = spec.onHurt, leave = spec.onLeave;
    spec.tick = (st, ctx, dt) => { roundRoll(st, ctx); chanTick(spec, st, ctx, dt); if (tick) tick(st, ctx, dt); };
    spec.onHurt = (st, p, ctx) => { for (const k of Object.keys(st.chs)) channel.hurt(st.chs[k], p.id); if (hurt) hurt(st, p, ctx); };
    spec.onLeave = (st, p, ctx) => { for (const k of Object.keys(st.chs)) if (st.chs[k].by === p.id) channel.cancel(st.chs[k]); if (leave) leave(st, p, ctx); };
    spec.bot = spec.bot || {}; spec.bot.maxStay = spec.bot.maxStay || 45000;
    ACT.def(type, spec); return spec;
  }

  // a timing press for a held crank / attempt. Returns 'hit' | 'miss' | null (no open attempt for this goblin). Bots pass arg.bot with arg.hit (the glue rolls their skill).
  function judgeTap(tm, p, arg, ctx) {
    if (!tm || tm.by !== p.id) return null;
    if (arg.bot) { tm.done = true; return arg.hit ? 'hit' : 'miss'; }
    return timing.judge(tm, num(ctx.recv) ? ctx.recv : ctx.now, { lat: p.lat });
  }
  const tmMe = (tm, p) => tm && tm.by === p.id ? { a: tm.a, wa: tm.a, wb: tm.b, per: tm.per, t0: tm.t0 } : null;

  // ================================================================ 1. Sapling Well (NE well, C sapling)
  def('well', {
    anchors: { well: 'NE', trunk: 'C' },
    yield: { knowPerMin: 15, goldPerMin: 0, notes: '4 drinks per round at 3 knowledge; the pool refills 1 per 12 s; fruit +12 shared' },
    state0: (rng, now) => Object.assign(base(), { pool: pool.make(K.wellPool, K.wellRefill), notch: 0, crank: null, ready: null, stage: 0, ripe: false, _tm: null, _tapAt: 0 }),
    verbs: {
      use(st, p, arg, ctx) {
        const now = ctx.now;
        if (arg.a === 'NE') {
          if (p.carry) return 'carry';
          if (st.ready) return st.ready.by === p.id ? null : 'busy';
          if (st.crank && st.crank.by !== p.id) return 'busy';
          if (pool.level(st.pool, now) < 1) return 'cool';
          if (!st.crank) { st.crank = { by: p.id, last: now }; st.notch = 0; }
          if (!st._tm || st._tm.by !== p.id) st._tm = timing.open(ctx.rng, now, { per: [800, 1100], win: 0.3, by: p.id });
          st.crank.last = now; return null;
        }
        if (arg.a === 'C') {
          if (st.ripe) { if (knowLeft(ctx, p) <= 0) return 'cap'; return chStart(st, p, ctx, 'fruit', 'C', K.fruitMs); }
          if (p.carry && p.carry.tok === 'bucket') return chStart(st, p, ctx, 'pour', 'C', K.pourMs);
          return p.carry ? 'carry' : 'state';
        }
        return 'state';
      },
      tap(st, p, arg, ctx) {
        if (arg.a !== 'NE' || !st.crank || st.crank.by !== p.id) return 'state';
        if (ctx.now < st._tapAt) return 'cool';   // the needle must travel between attempts: no faster than one press per 400 ms
        const r = judgeTap(st._tm, p, arg, ctx); if (!r) return 'state';
        st._tapAt = ctx.now + K.tapCd; st.crank.last = ctx.now;
        if (r === 'hit') st.notch++; else { st.notch = Math.max(0, st.notch - 1); fx(ctx, 'slosh', { a: 'NE' }); }
        if (st.notch >= K.wellHits) {
          st.crank = null; st._tm = null; st.notch = 0;
          if (!pool.take(st.pool, ctx.now)) return 'cool';
          st.ready = { by: p.id, t: ctx.now }; fx(ctx, 'full', { a: 'NE' });
        } else timing.reroll(st._tm, ctx.rng, ctx.now);   // a new period and window for every attempt
        return null;
      },
      choose(st, p, arg, ctx) {
        if (arg.a !== 'NE' || !st.ready || st.ready.by !== p.id) return 'state';
        if (arg.x === 0) {   // drink
          if (usedR(st, p, 'drink') >= K.wellDrinks || knowLeft(ctx, p) <= 0) return 'cap';
          lim.use(st._L, p, 'drink'); st.ready = null; pay(ctx, p, { know: K.drinkKnow }, 'well:drink'); return null;
        }
        if (arg.x === 1) { const r = carry.pick(p, 'bucket', { from: 'well' }); if (r) return r; st.ready = null; return null; }
        return 'state';
      },
      drop(st, p) { if (p.carry && p.carry.tok === 'bucket') carry.drop(p); return null; },   // poured out on the floor
    },
    fin: {
      pour(st, p, ctx) {
        if (!p || !p.carry || p.carry.tok !== 'bucket' || st.ripe) return;
        carry.drop(p); st.stage = Math.min(K.stages, st.stage + 1); if (st.stage >= K.stages) st.ripe = true; fx(ctx, 'grow', { stage: st.stage });
      },
      fruit(st, p, ctx) {
        if (!p || !st.ripe) return;
        st.ripe = false; st.stage = 0; pay(ctx, p, { know: K.fruitKnow }, 'well:fruit'); fx(ctx, 'fruit', { id: p.id });
      },
    },
    tick(st, ctx) {
      if (st.crank && ctx.now - st.crank.last > K.crankIdle) { st.crank = null; st._tm = null; st.notch = 0; }
      if (st.ready && ctx.now - st.ready.t > K.readyHold) st.ready = null;
    },
    onHurt(st, p, ctx) { if (p.carry && p.carry.tok === 'bucket') { carry.hurt(p); fx(ctx, 'spill', { id: p.id }); } },
    onLeave(st, p) {
      if (p.carry && p.carry.tok === 'bucket') carry.drop(p);
      if (st.crank && st.crank.by === p.id) { st.crank = null; st._tm = null; st.notch = 0; }
      if (st.ready && st.ready.by === p.id) st.ready = null;
    },
    view: st => ({ stage: st.stage, ripe: st.ripe, notch: st.notch, water: st.pool.n, max: st.pool.max, crank: st.crank ? st.crank.by : null, ready: st.ready ? st.ready.by : null, ch: chView(st) }),
    me: (st, p) => ({ tm: tmMe(st._tm, p), ready: !!(st.ready && st.ready.by === p.id) }),
    bot: {
      score(b, p, st) {
        if (st.ripe && b.knowLeft > 0) return 5;
        if (p.carry && p.carry.tok === 'bucket') return st.stage < K.stages ? 3 : 0;
        if (b.knowLeft > 0 && usedR(st, p, 'drink') < K.wellDrinks && st.pool.n >= 1) return 3;
        if (st.stage >= 2 && st.stage < K.stages && st.pool.n >= 1) return 1.5;
        return 0;
      },
      next(b, p, st) {
        if (st.ripe && b.knowLeft > 0) return near(b, p, 'C') ? { verb: 'use', a: 'C' } : { go: 'C' };
        if (p.carry && p.carry.tok === 'bucket') return near(b, p, 'C') ? { verb: 'use', a: 'C' } : { go: 'C' };
        if (st.ready && st.ready.by === p.id) return b.knowLeft > 0 && usedR(st, p, 'drink') < K.wellDrinks && !(st.stage >= 2 && b.greed < 0.5) ? { verb: 'choose', a: 'NE', x: 0 } : { verb: 'choose', a: 'NE', x: 1 };
        if (b.knowLeft <= 0 && st.stage < 2) return null;
        if (usedR(st, p, 'drink') >= K.wellDrinks && st.stage < 2) return null;
        if (!near(b, p, 'NE')) return { go: 'NE' };
        if (st.pool.n < 1 && !st.crank) return null;
        return st.crank && st.crank.by === p.id ? { verb: 'tap', a: 'NE', bot: true } : { verb: 'use', a: 'NE' };
      },
    },
  });

  // ================================================================ 2. Brain Press (vats NE NW SW, press on C)
  const VATS = ['NE', 'NW', 'SW'];
  def('press', {
    anchors: { vats: VATS, press: 'C' },
    npc: { husk: { hp: 30, dmg: 6, cd: 900, speed: 3.0, react: [400, 650], loot: ['x:huskbrain'], look: 1, name: 'Husk' } },
    yield: { knowPerMin: 10, goldPerMin: 0, notes: 'about 2.5 husks a minute, 4 knowledge per pressed husk brain; goblin brains exempt' },
    state0: (rng, now) => Object.assign(base(), { w: Object.assign(waves.make(K.huskEvery, K.huskMax), { next: now + K.huskEvery }), started: false, rouseAt: 0 }),
    verbs: {
      use(st, p, arg, ctx) {
        if (arg.a !== 'C') return 'state';
        const kind = ctx.brainOf ? ctx.brainOf(p) : null;
        if (!kind) return 'item';
        if (kind === 'husk' && (usedR(st, p, 'press') >= K.pressCap || knowLeft(ctx, p) <= 0)) return 'cap';
        return chStart(st, p, ctx, 'press', 'C', K.pressMs);
      },
      buy(st, p, arg, ctx) {   // rouse a husk now: pour 6 elixir into a vat
        if (VATS.indexOf(arg.a) < 0) return 'state';
        if (ctx.now < st.rouseAt) return 'cool';
        if (st.w.alive.length >= st.w.max) return 'busy';
        if (!ctx.elixir || !ctx.elixir(p, K.rouseElixir)) return 'cost';
        st.rouseAt = ctx.now + K.rouseCd;
        const id = ctx.spawn('husk', arg.a, {}); if (id != null) st.w.alive.push(id);   // the natural timer keeps running
        return null;
      },
    },
    fin: {
      press(st, p, ctx) {
        if (!p) return;
        const kind = ctx.brainOf ? ctx.brainOf(p) : null; if (!kind) return;
        if (kind === 'goblin') { if (ctx.takeBrain(p, 'goblin')) { ctx.eatBrain && ctx.eatBrain(p, { pct: 0.10, pressed: true }); fx(ctx, 'press', { id: p.id, k: 'goblin' }); } return; }
        if (usedR(st, p, 'press') >= K.pressCap) return;
        if (!ctx.takeBrain(p, 'husk')) return;
        lim.use(st._L, p, 'press'); pay(ctx, p, { know: K.huskKnow }, 'press:husk'); fx(ctx, 'press', { id: p.id, k: 'husk' });
      },
    },
    tick(st, ctx, dt) {
      const w = st.w, occ = ctx.occupants().length;
      if (ctx.npcAlive) for (const id of w.alive.slice()) if (!ctx.npcAlive(id)) waves.gone(w, id);
      if (occ === 0) { w.next += dt; return; }   // an empty room brews nothing
      if (!st.started) { st.started = true; waves.arm(w, ctx.now, K.huskFirst); return; }
      if (waves.due(w, ctx.now)) {
        const v = VATS[Math.floor(ctx.rng() * VATS.length)], id = ctx.spawn('husk', v, {});
        if (id != null) waves.spawned(w, id, ctx.now); else waves.skip(w, ctx.now);
      }
    },
    onKill(st, killer, victim) { if (victim && victim.npc) waves.gone(st.w, victim.id); },
    view: st => ({ husks: st.w.alive.length, next: Math.max(0, st.w.next), ch: chView(st) }),
    bot: {
      score(b, p, st) { return b.brainOf === 'goblin' ? 4 : b.brainOf === 'husk' ? (b.knowLeft > 0 && usedR(st, p, 'press') < K.pressCap ? 3 : 0) : (b.hpFrac > 0.7 && usedR(st, p, 'press') < K.pressCap && b.knowLeft > 0 ? 1 : 0); },
      next(b, p, st) {
        if (b.brainOf) return near(b, p, 'C') ? { verb: 'use', a: 'C' } : { go: 'C' };
        if (b.hpFrac < 0.6) return null;
        if (st.w.alive.length === 0) {   // BOTUSE: no husk yet: pour elixir into a vat to rouse one (a player's path), else wait for the vats to brew
          if ((b.elixir | 0) >= K.rouseElixir + 4 && b.knowLeft > 0) return near(b, p, VATS[0]) ? { verb: 'buy', a: VATS[0] } : { go: VATS[0] };
          return b.knowLeft > 0 ? { idle: true } : null;
        }
        return { fight: true };   // wait near the vats; the glue's combat code attacks the husks
      },
    },
  });

  // ================================================================ 3. Healing Spring (pool ring, basins NE SE SW)
  const BASINS = ['NE', 'SE', 'SW'];
  def('spring', {
    anchors: { pool: 'ring', basins: BASINS },
    yield: { knowPerMin: 0, goldPerMin: 0, notes: 'heal 2 HP/s for a lone, unhurt goblin; 3 bottles per goblin per round' },
    state0: () => Object.assign(base(), { cap: capture.make(), basins: { NE: pool.make(1, K.springRefill), SE: pool.make(1, K.springRefill), SW: pool.make(1, K.springRefill) }, healing: false }),
    verbs: {
      use(st, p, arg, ctx) { return bottle(st, p, arg, ctx, false); },
      buy(st, p, arg, ctx) { return bottle(st, p, arg, ctx, true); },
    },
    fin: {
      bottle(st, p, ctx, snap) {
        if (!p || ctx.sudden || usedR(st, p, 'bottle') >= K.bottleCap) return;
        if (!pool.take(st.basins[snap.anchor], ctx.now)) return;
        let blessed = !!(snap.o && snap.o.blessed);
        if (blessed && !(ctx.elixir && ctx.elixir(p, K.blessElixir))) blessed = false;   // could not pay at the end: plain water
        lim.use(st._L, p, 'bottle'); pay(ctx, p, { item: blessed ? 'x:blessedwater' : 'x:springwater' }, 'spring:bottle');
      },
    },
    tick(st, ctx, dt) {
      if (ctx.sudden) { st.healing = false; return; }   // only the vault regenerates in sudden death
      const occ = ctx.occupants().filter(p => p.alive !== false && inZone(ctx, p, 'ring'));
      const r = capture.step(st.cap, occ.map(p => ({ id: p.id, hurtAt: p.hurtAt, alive: p.alive })), dt, { now: ctx.now, every: 1000, unhurtMs: K.springUnhurt });
      st.healing = !!(r.holder != null && !r.blocked);
      if (r.paid > 0 && r.holder != null) { const p = byId(ctx, r.holder); if (p && p.hp < p.maxHp) pay(ctx, p, { heal: K.healPerSec * r.paid }, 'spring:pool'); }
    },
    view: st => ({ basins: { NE: st.basins.NE.n, SE: st.basins.SE.n, SW: st.basins.SW.n }, healing: st.healing, holder: st.cap.holder, contested: st.cap.contested, ch: chView(st) }),
    bot: {
      score(b, p, st) {
        if (b.sudden) return 0;
        if (b.hpFrac < 0.6) return 4;
        if (b.healItems === 0 && usedR(st, p, 'bottle') < K.bottleCap && BASINS.some(k => st.basins[k].n >= 1)) return 1.5;
        return 0;
      },
      next(b, p, st) {
        if (b.sudden) return null;
        if (b.hpFrac < 0.6 && !st.cap.contested) return near(b, p, 'ring', 0) ? { stay: 'ring' } : { go: 'ring' };
        if (usedR(st, p, 'bottle') >= K.bottleCap || b.healItems > 0) return null;
        const k = BASINS.find(x => st.basins[x].n >= 1); if (!k) return null;
        return near(b, p, k) ? { verb: 'use', a: k } : { go: k };
      },
    },
  });
  function bottle(st, p, arg, ctx, blessed) {
    if (BASINS.indexOf(arg.a) < 0 || ctx.sudden) return 'state';
    if (pool.level(st.basins[arg.a], ctx.now) < 1) return 'cool';
    if (usedR(st, p, 'bottle') >= K.bottleCap) return 'cap';
    if (count(ctx, p, 'x:springwater') + count(ctx, p, 'x:blessedwater') >= K.bottleCarry) return 'carry';
    return chStart(st, p, ctx, 'bottle', arg.a, K.bottleMs, { blessed });
  }

  // ================================================================ 4. Seer's Tree (stones NE NW SE, eye on C)
  const STONES = ['NE', 'NW', 'SE'];
  const newTarget = (rng, v) => v.map(x => { let t; do t = Math.floor(rng() * K.seerK); while (t === x); return t; });
  def('seer', {
    anchors: { stones: STONES, eye: 'C' },
    yield: { knowPerMin: 6, goldPerMin: 0, notes: '3 solves per goblin per round; 2 pay +3 knowledge; the rest is intel' },
    state0(rng) { const v = STONES.map(() => Math.floor(rng() * K.seerK)); return Object.assign(base(), { d: sequence.dials(newTarget(rng, v), K.seerK, v), solves: 0, _turn: {}, _cd: {} }); },
    verbs: {
      use(st, p, arg, ctx) {
        const i = STONES.indexOf(arg.a); if (i < 0) return 'state';
        if ((st._cd[p.id] || 0) > ctx.now) return 'cool';
        st._cd[p.id] = ctx.now + K.seerCd; sequence.turn(st.d, i); st._turn[p.id] = (st._turn[p.id] || 0) + 1;
        fx(ctx, 'turn', { i });
        if (sequence.solved(st.d)) solve(st, p, ctx);
        return null;
      },
    },
    view: st => ({ target: st.d.target, v: st.d.v, k: st.d.k, solves: st.solves }),
    bot: {
      score(b, p, st) { return usedR(st, p, 'seer') < K.seerCap ? 2 : 0; },
      next(b, p, st) {   // solve once per round, never sabotage; turn the first wrong ring
        if (usedR(st, p, 'seer') >= 1) return null;
        const i = st.d.v.findIndex((x, j) => x !== st.d.target[j]); if (i < 0) return null;
        return near(b, p, STONES[i]) ? { verb: 'use', a: STONES[i] } : { go: STONES[i] };
      },
    },
  });
  function solve(st, solver, ctx) {
    st.solves++;
    for (const id of Object.keys(st._turn)) {
      const p = byId(ctx, isNaN(id) ? id : +id); if (!p || p.alive === false) continue;
      const n = usedR(st, p, 'seer'); if (n >= K.seerCap) continue;
      lim.use(st._L, p, 'seer');
      if (n === 0) pay(ctx, p, { pulse: { ms: 8000, picks: true, hp: false }, know: K.seerKnow }, 'seer:1');
      else if (n === 1) pay(ctx, p, { pulse: { vbNext: true }, know: K.seerKnow }, 'seer:2');
      else pay(ctx, p, { pulse: { ms: 8000, picks: true, hp: true } }, 'seer:3');
    }
    if (ctx.toastAll) ctx.toastAll((solver.name || 'A goblin') + ' consulted the Seer');
    st._turn = {}; st.d.target = newTarget(ctx.rng, st.d.v);
  }

  // ================================================================ 5. Grafting Bench (branches on C, vise at NE)
  def('graft', {
    anchors: { branches: 'C', bench: 'NE' },
    yield: { knowPerMin: 0, goldPerMin: 0, notes: 'up to 2 grafts per goblin per round; a reforged twin of a weapon or armour' },
    state0: () => Object.assign(base(), { br: [0, 1, 2, 3].map(() => pool.make(1, K.branchRefill)), vise: station.make() }),
    verbs: {
      use(st, p, arg, ctx) {
        if (arg.a === 'C') {   // cut a scion
          if (!st.br.some(b => pool.level(b, ctx.now) >= 1)) return 'cool';
          if (count(ctx, p, 'x:scion') >= K.scionCarry) return 'cap';
          return chStart(st, p, ctx, 'cut', 'C', K.cutMs);
        }
        if (arg.a === 'NE') {   // take what is in the vise (the owner, or anyone after the owner window)
          const r = station.claim(st.vise, p, ctx.now);
          if (typeof r === 'string') return r;
          pay(ctx, p, { item: r.out }, 'graft:take'); if (r.stolen) fx(ctx, 'stolen', { owner: r.owner, id: p.id });
          return null;
        }
        return 'state';
      },
      choose(st, p, arg, ctx) {   // graft: x = the inventory slot of the weapon or armour
        if (arg.a !== 'NE') return 'state';
        if (st.vise.by != null) return 'busy';
        if (usedR(st, p, 'graft') >= K.graftCap) return 'cap';
        if (!ctx.item || !ctx.item(p, 'x:scion')) return 'item';
        const key = ctx.peek ? ctx.peek(p, arg.x) : null, items = itemsOf(ctx), it = key && items[key];
        if (!gear(it) || it.up || !items[key + '+']) return 'item';   // already reforged items cannot be grafted again
        if (ctx.take(p, arg.x) == null) return 'item';   // the slot first: taking the scion would shift the slot numbers
        if (!ctx.take(p, 'x:scion')) { ctx.award(p, { item: key }, 'graft:refund'); return 'item'; }
        lim.use(st._L, p, 'graft'); station.start(st.vise, p, ctx.now, { item: key, ms: K.viseMs, out: key + '+', ownerMs: K.viseOwner }); return null;
      },
    },
    fin: {
      cut(st, p, ctx) {
        if (!p) return;
        const b = st.br.find(x => pool.level(x, ctx.now) >= 1); if (!b || count(ctx, p, 'x:scion') >= K.scionCarry) return;
        pool.take(b, ctx.now); pay(ctx, p, { item: 'x:scion' }, 'graft:cut');
      },
    },
    view: (st, now) => ({ branches: st.br.map(b => b.n), vise: { state: station.state(st.vise, now == null ? Date.now() : now), item: st.vise.item, by: st.vise.by }, ch: chView(st) }),
    bot: {
      score(b, p, st) { return b.scions > 0 && usedR(st, p, 'graft') < K.graftCap && st.vise.by == null ? 3 : (b.scions === 0 && st.br.some(x => x.n >= 1) && b.hasGear ? 1.5 : 0); },
      next(b, p, st) {
        if (st.vise.by === p.id && station.state(st.vise, b.now) === 'ready') return near(b, p, 'NE') ? { verb: 'use', a: 'NE' } : { go: 'NE' };
        if (b.scions > 0 && usedR(st, p, 'graft') < K.graftCap && st.vise.by == null) return near(b, p, 'NE') ? { verb: 'choose', a: 'NE', x: -1 } : { go: 'NE' };   // x -1: the equipped weapon
        if (b.scions === 0 && st.br.some(x => x.n >= 1)) return near(b, p, 'C') ? { verb: 'use', a: 'C' } : { go: 'C' };
        return null;
      },
    },
  });

  // ================================================================ 6. Thorn Shrine (thorns on C, blood bowl SE)
  def('thorn', {
    anchors: { thorns: 'C', bowl: 'SE' },
    yield: { knowPerMin: 15, goldPerMin: 0, notes: '5 knowledge per drop in the bowl (max 3), blessings for HP' },
    state0: () => Object.assign(base(), { bowl: 0, grip: null, _pick: {}, _self: false }),
    verbs: {
      choose(st, p, arg, ctx) {   // which blessing this round: 0 fury, 1 bark, 2 thorns
        if (arg.a !== 'C' || !(arg.x >= 0 && arg.x < 3)) return 'state';
        st._pick[p.id] = { k: BLESS_KEYS[arg.x], round: ctx.round }; return null;
      },
      use(st, p, arg, ctx) {
        if (arg.a === 'SE') {
          if (st.bowl <= 0) return 'state';
          if (knowLeft(ctx, p) <= 0) return 'cap';
          return chStart(st, p, ctx, 'bowl', 'SE', K.bowlMs);
        }
        if (arg.a !== 'C') return 'state';
        if (st.grip) return st.grip.by === p.id ? null : 'busy';
        const pk = st._pick[p.id]; if (!pk || pk.round !== ctx.round) return 'state';   // the prompt asks first
        if (usedR(st, p, 'grip') >= K.gripCap) return 'cap';
        if (p.hp <= K.gripDps + 1) return 'state';
        for (const k of Object.keys(st.chs)) if (st.chs[k].by === p.id) return 'busy';
        lim.use(st._L, p, 'grip'); st.grip = { by: p.id, t0: ctx.now, k: pk.k, frac: 0, x: p.x, z: p.z }; return null;
      },
    },
    stop(st, p, arg, ctx) { if (st.grip && st.grip.by === p.id) bank(st, p, ctx); },
    fin: {
      bowl(st, p, ctx) { if (!p || st.bowl <= 0) return; const n = st.bowl; st.bowl = 0; pay(ctx, p, { know: K.bowlKnow * n }, 'thorn:bowl'); },
    },
    tick(st, ctx, dt) {
      const g = st.grip; if (!g) return;
      const p = byId(ctx, g.by);
      if (!p || p.alive === false || Math.hypot(p.x - g.x, p.z - g.z) > ACT.C.CHANNEL_MOVE) { if (p && p.alive !== false) bank(st, p, ctx); else st.grip = null; return; }
      g.frac += K.gripDps * dt / 1000;
      const whole = Math.floor(g.frac);
      if (whole > 0) {
        g.frac -= whole;
        const d = Math.min(whole, Math.max(0, p.hp - 1));
        if (d > 0) { st._self = true; try { ctx.dmg(p, d, 'thorn', { pierce: true }); } finally { st._self = false; } }
      }
      if (p.hp <= 1 || ctx.now - g.t0 >= K.tierMs[2]) bank(st, p, ctx);   // never kills: at 1 HP it lets go on its own; tier III is the top
    },
    onHurt(st, p) { if (!st._self && st.grip && st.grip.by === p.id) st.grip = null; },   // a hit from someone else breaks the grip and banks nothing
    onLeave(st, p, ctx) { if (st.grip && st.grip.by === p.id) bank(st, p, ctx); },
    onKill(st, killer, victim) { if (killer && victim && killer.id !== victim.id) st.bowl = Math.min(K.bowlMax, st.bowl + 1); },
    view: st => ({ bowl: st.bowl, grip: st.grip ? { by: st.grip.by, k: st.grip.k, t0: st.grip.t0 } : null, ch: chView(st) }),
    me: (st, p, ctx) => { const pk = st._pick[p.id]; return { needChoice: !pk || pk.round !== (ctx && ctx.round), pick: pk && pk.k, bless: p.bless || null }; },
    bot: {
      score(b, p, st) { return b.hpFrac > 0.8 && b.others === 0 && usedR(st, p, 'grip') < K.gripCap ? 2 : (st.bowl > 0 && b.knowLeft > 0 ? 2.5 : 0); },
      next(b, p, st) {
        if (st.grip && st.grip.by === p.id) return b.now - st.grip.t0 >= K.tierMs[1] ? { verb: 'stop', a: 'C' } : { stay: 'C' };   // tier II, then let go
        if (st.bowl > 0 && b.knowLeft > 0) return near(b, p, 'SE') ? { verb: 'use', a: 'SE' } : { go: 'SE' };
        if (b.hpFrac <= 0.8 || b.others > 0 || usedR(st, p, 'grip') >= K.gripCap) return null;
        if (!near(b, p, 'C')) return { go: 'C' };
        const pk = st._pick[p.id]; if (!pk || pk.round !== b.round) return { verb: 'choose', a: 'C', x: 0 };
        return { verb: 'use', a: 'C' };
      },
    },
  });
  // release the grip: bank a blessing by how long it was held
  function bank(st, p, ctx) {
    const g = st.grip; st.grip = null; if (!g) return;
    const held = ctx.now - g.t0; let tier = 0; for (let i = 0; i < 3; i++) if (held >= K.tierMs[i]) tier = i + 1;
    if (tier < 1) return;
    const old = p.bless, active = old && old.until >= ctx.round, until = ctx.round + 1;   // lasts until the end of the NEXT round
    if (active && old.tier > tier) p.bless = { k: old.k, tier: old.tier, until };   // a weaker grip only refreshes a stronger blessing
    else p.bless = { k: g.k, tier, until };
    if (ctx.recalc) ctx.recalc(p);
    fx(ctx, 'bless', { id: p.id, k: p.bless.k, tier: p.bless.tier });
  }
  const blessing = (p, round) => { const b = p && p.bless; if (!b || b.until < round) return null; const t = BLESS[b.k]; return t ? { k: b.k, tier: b.tier, v: t[b.tier - 1] } : null; };

  // ================================================================ 7. Gambler's Root (hollow on C)
  def('gambler', {
    anchors: { hollow: 'C' },
    yield: { knowPerMin: 0, goldPerMin: 0, notes: 'item tier +1 at 70/55/40/25/15 percent; 4 feeds per goblin per round; the hoard pays a guaranteed tier 3+' },
    state0: () => Object.assign(base(), { hollow: station.make(), stump: null, hoard: 0, _hoardBy: null }),
    verbs: {
      choose: (st, p, arg, ctx) => feed(st, p, arg, ctx, false),
      buy(st, p, arg, ctx) { return arg.x == null ? ride(st, p, arg, ctx, true) : feed(st, p, arg, ctx, true); },   // pour 10 elixir for +10%
      use(st, p, arg, ctx) { return arg.a === 'C' ? ride(st, p, arg, ctx, false) : 'state'; },
      pick(st, p, arg, ctx) {
        const s = st.stump; if (arg.a !== 'C' || !s) return 'state';
        if (s.by !== p.id && ctx.now < s.until) return 'cool';
        st.stump = null; pay(ctx, p, { item: s.key }, 'gambler:take'); return null;
      },
    },
    tick(st, ctx) {
      const h = st.hollow; if (h.by == null || ctx.now < h.doneAt) return;
      const o = h.out, owner = h.by; station.claim(h, { id: owner }, ctx.now);
      if (o && o.key) { st.stump = { key: o.key, step: o.step, by: owner, until: ctx.now + K.stumpOwner, prize: !!o.prize }; fx(ctx, 'spit', { key: o.key, step: o.step }); }
      else { const before = st.hoard; st.hoard = Math.min(K.hoardMax, st.hoard + 1); if (st.hoard >= K.hoardMax && before < K.hoardMax) st._hoardBy = owner; fx(ctx, 'swallow', { hoard: st.hoard }); }
    },
    view: st => ({ hoard: st.hoard, chew: st.hollow.by != null, stump: st.stump ? { key: st.stump.key, step: st.stump.step, by: st.stump.by, until: st.stump.until } : null }),
    bot: {
      score(b, p, st) {
        if (st.stump && st.stump.by === p.id) return 3;
        if (usedR(st, p, 'feed') >= K.feedCap || !b.junk) return 0;
        return st.hoard >= K.hoardMax ? 3 : (b.greed > 0.5 ? 1.5 : 0);
      },
      next(b, p, st) {
        if (st.stump && st.stump.by === p.id) {
          const again = b.greed > 0.8 && st.stump.step < 4 && usedR(st, p, 'feed') < K.feedCap;
          if (!near(b, p, 'C')) return { go: 'C' };
          return again ? { verb: 'use', a: 'C' } : { verb: 'pick', a: 'C' };
        }
        if (st.hollow.by != null || st.stump || usedR(st, p, 'feed') >= K.feedCap || !b.junk) return null;
        if (b.greed <= 0.5 && st.hoard < K.hoardMax) return null;
        return near(b, p, 'C') ? { verb: 'choose', a: 'C', x: b.junkSlot } : { go: 'C' };
      },
    },
  });
  function chew(st, p, ctx, key, step, boost, prize) {
    const items = itemsOf(ctx), it = items[key];
    let out;
    if (prize) { const k = rollUp(items, ctx.rng, key, 3); out = { key: k, step, prize: true }; }
    else if (ctx.rng() < K.odds[Math.min(step - 1, K.odds.length - 1)] + (boost ? K.boostOdds : 0)) out = { key: rollUp(items, ctx.rng, key, 0), step };
    else out = { key: null, step };
    station.start(st.hollow, p, ctx.now, { item: key, ms: K.chewMs, out, ownerMs: 0 });
    return null;
  }
  function feed(st, p, arg, ctx, boost) {
    if (arg.a !== 'C') return 'state';
    if (st.hollow.by != null || st.stump) return 'busy';
    if (usedR(st, p, 'feed') >= K.feedCap) return 'cap';
    const key = ctx.peek ? ctx.peek(p, arg.x) : null, items = itemsOf(ctx), it = key && items[key];
    if (!gear(it) || (it.tierN | 0) >= 5) return 'item';
    if (boost && !(ctx.elixir && ctx.elixir(p, K.boostElixir))) return 'cost';
    if (ctx.take(p, arg.x) == null) return 'item';
    const prior = usedR(st, p, 'feed'); lim.use(st._L, p, 'feed');
    // the hoard prize: only for a goblin who already fed this round, and never for the one who filled the last gourd
    const prize = st.hoard >= K.hoardMax && prior >= 1 && st._hoardBy !== p.id;
    if (prize) { st.hoard = 0; st._hoardBy = null; if (ctx.toastAll) ctx.toastAll((p.name || 'A goblin') + ' won the Root\'s hoard'); }
    return chew(st, p, ctx, key, 1, boost, prize);
  }
  function ride(st, p, ctx0, ctx, boost) {
    const s = st.stump; if (!s || s.by !== p.id) return 'state';
    if (st.hollow.by != null) return 'busy';
    if (s.step >= K.odds.length || (itemsOf(ctx)[s.key].tierN | 0) >= 5) return 'item';
    if (usedR(st, p, 'feed') >= K.feedCap) return 'cap';
    if (boost && !(ctx.elixir && ctx.elixir(p, K.boostElixir))) return 'cost';
    lim.use(st._L, p, 'feed'); st.stump = null;
    return chew(st, p, ctx, s.key, s.step + 1, boost, false);
  }

  // ================================================================ 8. Memory Tree (trunk C, lanterns NE NW SE SW)
  const LANTERNS = ['NE', 'NW', 'SE', 'SW'];
  def('memory', {
    anchors: { trunk: 'C', lanterns: LANTERNS },
    yield: { knowPerMin: 15, goldPerMin: 0, notes: '5 knowledge (+1 per step above 3) per success, 3 successes per goblin per round; Remembrance once per match' },
    state0: () => Object.assign(base(), { phase: 'idle', run: null, cdUntil: 0, _seq: null, show: null }),
    verbs: {
      use(st, p, arg, ctx) {
        if (arg.a === 'C') {
          if (st.run) return 'busy';
          if (ctx.now < st.cdUntil) return 'cool';
          if (usedR(st, p, 'mem') >= K.memCap || knowLeft(ctx, p) <= 0) return 'cap';
          const len = Math.min(K.memMax, 3 + usedM(st, p, 'memwin')), seq = [];
          for (let i = 0; i < len; i++) seq.push(LANTERNS[Math.floor(ctx.rng() * 4)]);
          st.run = { by: p.id, len, t0: ctx.now, inputAt: ctx.now + len * K.memPer, deadline: ctx.now + len * K.memPer + K.memInput };
          st._seq = sequence.make(seq, 0); st.show = seq.slice(); st.phase = 'show'; fx(ctx, 'show', { len }); return null;
        }
        if (LANTERNS.indexOf(arg.a) < 0 || !st.run) return 'state';
        if (p.id !== st.run.by || ctx.now < st.run.inputAt) { fail(st, ctx, 'sabotage'); return null; }   // anyone touching a lantern during the sequence (or touching early) breaks it
        const r = sequence.press(st._seq, arg.a, ctx.now, p.id);
        if (r === 'fail') { fail(st, ctx, 'wrong'); return null; }
        fx(ctx, 'lit', { a: arg.a });
        if (r === 'done') {
          const len = st.run.len; st.run = null; st._seq = null; st.show = null; st.phase = 'idle'; st.cdUntil = ctx.now + K.memCd;
          lim.use(st._L, p, 'mem'); lim.use(st._L, p, 'memwin');
          pay(ctx, p, { know: K.memKnow + (len - 3) }, 'memory');
          if (usedM(st, p, 'memwin') === 3) {   // Remembrance, once per match, on the third success
            const ok = ctx.remember ? ctx.remember(p) : false;
            if (ok) fx(ctx, 'remembrance', { id: p.id }, 'near'); else pay(ctx, p, { know: K.memRemember }, 'memory:remember');
          }
        }
        return null;
      },
    },
    tick(st, ctx) {
      if (!st.run) return;
      if (st.phase === 'show' && ctx.now >= st.run.inputAt) { st.phase = 'input'; st.show = null; }
      if (ctx.now > st.run.deadline) fail(st, ctx, 'time');
    },
    onLeave(st, p, ctx) { if (st.run && st.run.by === p.id) fail(st, ctx, 'left'); },
    view: st => ({ phase: st.phase, by: st.run ? st.run.by : null, len: st.run ? st.run.len : 0, show: st.phase === 'show' ? st.show : null, t0: st.run ? st.run.t0 : 0, per: K.memPer, pos: st._seq ? st._seq.pos : 0 }),
    me: (st, p) => ({ input: !!(st.run && st.run.by === p.id && st.phase === 'input'), deadline: st.run && st.run.by === p.id ? st.run.deadline : 0 }),
    bot: {
      maxStay: 40000,
      score(b, p, st) { return usedR(st, p, 'mem') < 1 && b.knowLeft > 0 ? 2 : 0; },
      next(b, p, st) {   // 55% success per step: the glue rolls it from the skill; here the bot only starts a run and then touches what the glue gives it
        if (st.run && st.run.by === p.id) return st.phase === 'input' ? { memory: true, seq: st._seq ? st._seq.target : null, pos: st._seq ? st._seq.pos : 0 } : { stay: 'C' };
        if (usedR(st, p, 'mem') >= 1 || b.knowLeft <= 0 || st.run) return null;
        return near(b, p, 'C') ? { verb: 'use', a: 'C' } : { go: 'C' };
      },
    },
  });
  function fail(st, ctx, why) { st.run = null; st._seq = null; st.show = null; st.phase = 'idle'; st.cdUntil = ctx.now + K.memCd; fx(ctx, 'memfail', { why }); }

  // ================================================================ 9. Hollow Oak (the nook)
  const WHISPERS = ['goblin', 'breach', 'strongbox', 'circuit', 'vbNext'];
  const angdiff = (a, b) => { let d = Math.abs(a - b) % (Math.PI * 2); return d > Math.PI ? Math.PI * 2 - d : d; };
  const nookId = ctx => ctx.anchor('nook') ? 'nook' : 'ring';
  def('oak', {
    anchors: { nook: 'nook' },
    yield: { knowPerMin: 12, goldPerMin: 0, notes: '2 knowledge per whisper every 8 s, 6 per round, only while looking around' },
    state0: () => Object.assign(base(), { cap: capture.make(), warden: null, since: 0, _next: 0, _kind: 0, _yaw: [], _in: {}, nookHeld: false }),
    verbs: {},
    tick(st, ctx, dt) {
      const occ = ctx.occupants().filter(p => p.alive !== false), seen = {};
      for (const p of occ) { seen[p.id] = 1; if (st._in[p.id] == null) st._in[p.id] = ctx.now; }
      for (const id of Object.keys(st._in)) if (!seen[id]) delete st._in[id];
      const nid = nookId(ctx), inNook = occ.filter(p => inZone(ctx, p, nid, nid === 'nook' ? Math.max(ctx.anchor(nid).r || 0, K.oakR) : K.oakR));
      const r = capture.step(st.cap, inNook.map(p => ({ id: p.id, hurtAt: p.hurtAt, alive: p.alive })), dt, { now: ctx.now, unhurtMs: K.oakHold });
      if (st.warden != null && st.warden !== r.holder) clearWarden(st);
      if (st.warden == null && r.holder != null && r.prog >= K.oakHold) {
        st.warden = r.holder; st.since = ctx.now; st._next = ctx.now + K.oakWhisper; st._yaw = []; fx(ctx, 'warden', { id: r.holder });
      }
      st.nookHeld = st.warden != null;
      if (st.warden == null) return;
      const w = byId(ctx, st.warden); if (!w) { clearWarden(st); return; }
      if (num(w.yaw) && (!st._yaw.length || ctx.now - st._yaw[st._yaw.length - 1].t >= 250)) { st._yaw.push({ t: ctx.now, yaw: w.yaw }); while (st._yaw.length && ctx.now - st._yaw[0].t > 10000) st._yaw.shift(); }
      if (ctx.now < st._next) return;
      st._next = ctx.now + K.oakWhisper;
      let text = null;
      for (let i = 0; i < WHISPERS.length && !text; i++) { const kind = WHISPERS[(st._kind++) % WHISPERS.length]; text = ctx.intel ? ctx.intel(kind, w) : null; }
      if (text && ctx.toast) ctx.toast(w, text);
      let moved = false; for (const a of st._yaw) for (const b of st._yaw) if (angdiff(a.yaw, b.yaw) * 180 / Math.PI > K.oakLook) moved = true;
      if (moved && usedR(st, w, 'whisper') < K.oakCap && knowLeft(ctx, w) > 0) { lim.use(st._L, w, 'whisper'); pay(ctx, w, { know: K.oakKnow }, 'oak:whisper'); }
    },
    onHurt(st, p, ctx) {
      if (st.warden === p.id) { clearWarden(st); capture.reset(st.cap, p.id); const an = ctx.anchor(nookId(ctx)), c = ctx.anchor('C'); if (ctx.push && an && c) { const dx = c.x - an.x, dz = c.z - an.z, l = Math.hypot(dx, dz) || 1; ctx.push(p, dx / l, dz / l); } }
    },
    onLeave(st, p) { if (st.warden === p.id) { clearWarden(st); capture.reset(st.cap, p.id); } },
    // glue: called by hitTarget; returns the damage multiplier (+50% on the Warden's first hit on a goblin who came in after him, once per goblin per round)
    ambushMul(st, attacker, victim, ctx) {
      if (st.warden !== attacker.id || !victim || victim.id === attacker.id) return 1;
      if ((st._in[victim.id] == null) || st._in[victim.id] <= st.since) return 1;
      roundRoll(st, ctx); const k = 'amb' + victim.id;
      if (!lim.ok(st._L, attacker, k, 1, null)) return 1;
      lim.use(st._L, attacker, k); return K.oakAmbush;
    },
    view: st => ({ held: st.warden != null, contested: st.cap.contested }),   // the Warden's identity is secret; map and pulse hiding read `held`
    me: (st, p) => ({ warden: st.warden === p.id }),
    bot: {
      maxStay: 40000,
      score(b, p, st) { return st.warden == null && ((b.hpFrac < 0.5 && b.cautious) || b.aggr > 0.6) ? 2 : (st.warden === p.id ? 3 : 0); },
      next(b, p, st) { if (st.warden != null && st.warden !== p.id) return null; return near(b, p, 'nook', 0.3) ? { stay: 'nook', look: true } : { go: 'nook' }; },
    },
  });
  function clearWarden(st) { st.warden = null; st.nookHeld = false; }

  // ================================================================ 10. Elder Tree (root-stones NE NW SE, seed on C)
  def('elder', {
    anchors: { stones: STONES, seed: 'C' },
    npc: { rootling: { hp: 40, dmg: 8, cd: 1000, speed: 3.4, react: [400, 650], loot: [], look: 2, name: 'Rootling' } },
    yield: { knowPerMin: 0, goldPerMin: 0, notes: 'a waking pays 25 / 12 / 6 knowledge (exempt from the tree cap) plus an item to the first goblin at the seed; 3 wakings per match' },
    state0: (rng, now) => Object.assign(base(), { stones: STONES.map(() => ({ prog: 0, lit: false })), wakes: 0, phase: 'stones', t: 0, w: Object.assign(waves.make(K.rootEvery, K.rootMax), { next: now + K.rootEvery }), _wither: -1, become: null }),
    verbs: {
      use(st, p, arg, ctx) {
        const i = STONES.indexOf(arg.a);
        if (i >= 0) {
          if (st.phase !== 'stones' || st.stones[i].lit) return 'state';
          return chStart(st, p, ctx, 'stone' + i, arg.a, Math.max(1, K.stoneMs[st.wakes] - st.stones[i].prog), { i });
        }
        if (arg.a === 'C' && st.phase === 'seed') return chStart(st, p, ctx, 'seed', 'C', K.seedMs);
        return 'state';
      },
    },
    run: { stone0: stoneRun, stone1: stoneRun, stone2: stoneRun },
    fin: {
      stone0: stoneFin, stone1: stoneFin, stone2: stoneFin,
      seed(st, p, ctx) {
        if (!p || st.phase !== 'seed') return;
        const n = st.wakes, items = itemsOf(ctx), type = ctx.rng() < 0.5 ? 'weapon' : 'armor';
        const key = rollItem(items, ctx.rng, { type, min: K.elderTier[n] });
        pay(ctx, p, { know: K.elderKnow[n], item: key, exempt: true }, 'elder:' + (n + 1));
        if (ctx.toastAll) ctx.toastAll((p.name || 'A goblin') + ' took the Elder Seed');
        st.wakes++; fx(ctx, 'seed', { id: p.id, n: st.wakes }, 'near');
        if (st.wakes >= K.elderWakes) { st.phase = 'withered'; st._wither = ctx.round == null ? 0 : ctx.round; }
        else { st.phase = 'stones'; for (const s of st.stones) { s.prog = 0; s.lit = false; } }
      },
    },
    tick(st, ctx, dt) {
      if (ctx.npcAlive) for (const id of st.w.alive.slice()) if (!ctx.npcAlive(id)) waves.gone(st.w, id);
      if (st.phase === 'stones') {
        const active = STONES.filter((a, i) => st.chs['stone' + i] && st.chs['stone' + i].by != null);
        if (!active.length) st.w.next += dt;   // rootlings climb out only while a stone is being channelled
        else if (waves.due(st.w, ctx.now)) {
          const id = ctx.spawn('rootling', active[Math.floor(ctx.rng() * active.length)], {});
          if (id != null) waves.spawned(st.w, id, ctx.now); else waves.skip(st.w, ctx.now);
        }
      } else if (st.phase === 'waking') {
        st.t -= dt; if (st.t <= 0) { st.phase = 'seed'; fx(ctx, 'seedDrop', {}, 'near'); }
      } else if (st.phase === 'withered' && !st.become && (ctx.round == null ? 0 : ctx.round) > st._wither) st.become = 'well';   // the glue swaps the room to a Sapling Well
    },
    onKill(st, killer, victim) { if (victim && victim.npc) waves.gone(st.w, victim.id); },
    view: st => ({ phase: st.phase, wakes: st.wakes, need: K.stoneMs[Math.min(2, st.wakes)], stones: st.stones.map(s => ({ prog: Math.round(s.prog), lit: s.lit })), t: Math.max(0, st.t), become: st.become, ch: chView(st) }),
    bot: {
      maxStay: 60000,
      score(b, p, st) { return st.phase === 'seed' ? 6 : st.phase === 'stones' ? (b.coop || b.aggr > 0.5 ? 2.5 : 1) : 0; },
      next(b, p, st) {
        if (st.phase === 'seed') return near(b, p, 'C') ? { verb: 'use', a: 'C' } : { go: 'C' };
        if (st.phase !== 'stones') return null;
        const active = STONES.filter((a, i) => st.chs['stone' + i] && st.chs['stone' + i].by != null && st.chs['stone' + i].by !== p.id);
        if (!active.length && !b.coop) return null;   // like to join, not to start
        const i = STONES.findIndex((a, j) => !st.stones[j].lit && !(st.chs['stone' + j] && st.chs['stone' + j].by != null)); if (i < 0) return null;
        return near(b, p, STONES[i]) ? { verb: 'use', a: STONES[i] } : { go: STONES[i] };
      },
    },
  });
  function stoneRun(st, p, ctx, dt, snap) {
    const i = snap.o && snap.o.i, s = st.stones[i]; if (!s || s.lit) return;
    s.prog += dt;
    if (s.prog >= K.stoneMs[st.wakes]) light(st, i, ctx);
  }
  function stoneFin(st, p, ctx, snap) { const i = snap.o && snap.o.i; if (st.stones[i] && !st.stones[i].lit) light(st, i, ctx); }
  function light(st, i, ctx) {
    const s = st.stones[i]; s.lit = true; s.prog = K.stoneMs[st.wakes]; channel.cancel(st.chs['stone' + i]); fx(ctx, 'lit', { i });
    if (st.phase === 'stones' && st.stones.every(x => x.lit)) {
      st.phase = 'waking'; st.t = K.rumbleMs;
      if (ctx.toastAll) ctx.toastAll('The Elder Tree is waking'); fx(ctx, 'rumble', {}, 'near');
    }
  }

  const API = { TYPES, WEIGHTS, NAMES, BLESS, BLESS_KEYS, K, rollTrees, blessing, rollItem, rollUp, specs: () => TYPES.map(t => ACT.get(t)) };
  root.TREES5 = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);

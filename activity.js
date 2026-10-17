// Activity framework (PLAN-5x5-rooms section 1): pure, dependency-free building blocks for the room activities.
// Works in the browser (window.ACT) and in Node (require('./activity.js')). No I/O, no timers, no Date.now(), no Math.random():
// every function takes `now` (ms) and, where it rolls dice, an `rng` (() => [0,1)), so tests run on a fake clock.
// Time is in ms everywhere, positions in metres, `dt` in ms. A "player" p is any object {id, x, z, room, alive}.
(function (root) {
  const C = {
    TREE_KNOW_ROUND: 24, TREE_KNOW_MATCH: 80,   // per goblin, across all tree rooms (section 3.1)
    TIMING_GRACE: 40, LAT_CLAMP: 120,           // timing judge: grace on each side of the window, max latency compensation (ms)
    CHANNEL_MOVE: 0.6, REACH_PAD: 1.4,          // a channel breaks after moving this far; an anchor can be used within r + REACH_PAD
    ACT_RATE: 8,                                // act messages per second per player
    HEAVY_SPEED: 0.7,                           // walking multiplier while carrying a heavy object
    VERBS: ['use', 'tap', 'stop', 'pick', 'drop', 'buy', 'choose'],
    FAILS: ['room', 'far', 'busy', 'cap', 'cost', 'item', 'state', 'cool', 'carry'],
    KINDS: ['tree', 'vb', 'vault'],
  };
  const num = v => typeof v === 'number' && isFinite(v);
  const pid = p => (p && typeof p === 'object') ? p.id : p;
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

  // ---- seeded RNG (mulberry32), for tests and for server rolls that must be reproducible
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const between = (r, lo, hi) => lo + (hi - lo) * r();

  // ---- channel: hold E at a prop. One user per channel object (use several + channel.busy for maxUsers > 1)
  const channel = {
    make: () => ({ by: null, anchor: null, room: null, t0: 0, ms: 0, x: 0, z: 0, hurt: false }),
    start(ch, p, now, ms, o = {}) {
      if (!p || p.alive === false || !num(ms) || ms <= 0) return 'state';
      if (ch.by != null && ch.by !== p.id) return 'busy';
      if (ch.by === p.id && ch.anchor === (o.anchor == null ? ch.anchor : o.anchor)) return null;   // already running: do not reset on key repeat
      ch.by = p.id; ch.anchor = o.anchor == null ? null : o.anchor; ch.room = p.room == null ? null : p.room;
      ch.t0 = now; ch.ms = ms; ch.x = p.x || 0; ch.z = p.z || 0; ch.hurt = false;
      return null;
    },
    // -> 'idle' | 'run' | 'done' | 'broken'. done and broken free the channel.
    update(ch, p, now) {
      if (ch.by == null) return 'idle';
      const bad = !p || p.id !== ch.by || p.alive === false || ch.hurt || (ch.room != null && p.room !== ch.room) || Math.hypot((p.x || 0) - ch.x, (p.z || 0) - ch.z) > C.CHANNEL_MOVE;
      if (bad) { channel.cancel(ch); return 'broken'; }
      if (now - ch.t0 >= ch.ms) { channel.cancel(ch); return 'done'; }
      return 'run';
    },
    hurt(ch, id) { if (ch.by != null && (id == null || ch.by === id)) ch.hurt = true; },   // the glue calls this from onHurt
    cancel(ch) { ch.by = null; ch.anchor = null; ch.hurt = false; },
    progress: (ch, now) => ch.by == null ? 0 : clamp((now - ch.t0) / ch.ms, 0, 1),
    // how many of `list` currently run at `anchor` (for maxUsers)
    busy: (list, anchor) => list.filter(c => c.by != null && c.anchor === anchor).length,
  };

  // ---- capture: a zone that pays its single occupant. occupants = [{id, hurtAt?, activeAt?, alive?}]
  // opts: {every, unhurtMs, afkMs, cumulative}. every: pay once per `every` ms of progress. unhurtMs: no progress within that long of a hit.
  // afkMs: no progress unless occ.activeAt is within afkMs of now. cumulative: cap.acc[id] never resets except capture.reset.
  const capture = {
    make: () => ({ holder: null, last: null, since: 0, prog: 0, contested: false, acc: {} }),
    step(cap, occupants, dt, o = {}) {
      const now = o.now || 0, occ = (occupants || []).filter(x => x && x.alive !== false);
      let paid = 0, blocked = null;
      if (occ.length === 0) { cap.holder = null; cap.contested = false; cap.last = null; cap.prog = 0; }   // leaving forfeits the partial payout (not the cumulative claim)
      else if (occ.length >= 2) { cap.holder = null; cap.contested = true; blocked = 'contested'; }       // freeze: nobody progresses; the old progress waits
      else {
        const x = occ[0]; cap.contested = false;
        if (cap.last !== x.id) { cap.prog = 0; cap.last = x.id; cap.since = now; }
        cap.holder = x.id;
        if (o.unhurtMs && num(x.hurtAt) && now - x.hurtAt < o.unhurtMs) blocked = 'hurt';
        else if (o.afkMs != null && !(num(x.activeAt) && now - x.activeAt <= o.afkMs)) blocked = 'afk';
        else {
          cap.prog += dt;
          if (o.cumulative) cap.acc[x.id] = (cap.acc[x.id] || 0) + dt;
          if (o.every > 0) { paid = Math.floor(cap.prog / o.every); cap.prog -= paid * o.every; }
        }
      }
      return { holder: cap.holder, contested: cap.contested, paid, prog: cap.prog, blocked };
    },
    reset(cap, id) { delete cap.acc[id]; if (cap.last === id) { cap.prog = 0; cap.last = null; cap.holder = null; } },   // e.g. the claimant died
    total: (cap, id) => cap.acc[id] || 0,
    ranking: cap => Object.keys(cap.acc).map(k => ({ id: isNaN(k) ? k : +k, ms: cap.acc[k] })).sort((a, b) => b.ms - a.ms),
    leaders(cap) { const r = capture.ranking(cap); return r.length ? r.filter(x => x.ms === r[0].ms) : []; },   // several entries = a tie (decided by the caller)
  };

  // ---- timing: a skill press on a moving prop. The needle position is ((t - t0) mod per) / per in [0,1); the window is [a,b] inside it.
  // The server rolls the period and the window for every attempt, so a fixed-delay macro only hits by chance.
  const timing = {
    open(rng_, now, o = {}) {
      const per = o.per || [800, 1100], win = o.win == null ? 0.3 : o.win, tm = { by: o.by == null ? null : o.by, t0: now, per: 0, a: 0, b: 0, win, n: o.n || 0, step: o.step || 0, done: false, ttl: o.ttl || 0 };
      timing.reroll(tm, rng_, now, per); return tm;
    },
    reroll(tm, rng_, now, per) {
      const pr = per || tm.perRange || [800, 1100]; tm.perRange = pr;
      tm.per = Math.round(between(rng_, pr[0], pr[1]));
      // window start uniform over the whole cycle (b may pass 1 and wrap), so a fixed-phase press hits with probability = width
      tm.a = rng_(); tm.b = tm.a + tm.win; tm.t0 = now; tm.done = false;
      return tm;
    },
    phase: (tm, t) => (((t - tm.t0) % tm.per) + tm.per) % tm.per / tm.per,
    // tPress is the server receive time. -> 'hit' | 'miss'. One judgement per attempt; a second press on the same attempt is a 'miss'.
    judge(tm, tPress, o = {}) {
      if (tm.done) return 'miss';
      tm.done = true;
      const lat = clamp(num(o.lat) ? o.lat : 0, 0, C.LAT_CLAMP), grace = o.grace == null ? C.TIMING_GRACE : o.grace, t = tPress - lat;
      if (t < tm.t0 - grace || (tm.ttl && t > tm.t0 + tm.ttl + grace)) return 'miss';
      const g = grace / tm.per, ph = timing.phase(tm, Math.max(t, tm.t0));
      const d = ((ph - tm.a) % 1 + 1) % 1;   // distance past the window start, wrapping
      return d <= tm.win + g || d >= 1 - g ? 'hit' : 'miss';
    },
    width: (tm, grace = C.TIMING_GRACE) => tm.win + 2 * grace / tm.per,   // effective hit share, for tests and balance
  };

  // ---- pool: a shared refilling resource with lazy refill (like the elixir tank). The anti-camping valve.
  const pool = {
    make: (max, refillMs, n) => ({ n: n == null ? max : n, max, refillMs, t: 0 }),
    level(pl, now) {
      if (pl.n >= pl.max) { pl.n = pl.max; pl.t = now; return pl.n; }
      const add = Math.floor((now - pl.t) / pl.refillMs);
      if (add > 0) { pl.n = Math.min(pl.max, pl.n + add); pl.t += add * pl.refillMs; if (pl.n >= pl.max) pl.t = now; }
      return pl.n;
    },
    take(pl, now, k = 1) {
      if (pool.level(pl, now) < k) return false;
      if (pl.n >= pl.max) pl.t = now;   // the refill clock starts when a full pool is first drawn from
      pl.n -= k; return true;
    },
    // ms until the next unit (0 when full)
    eta(pl, now) { pool.level(pl, now); return pl.n >= pl.max ? 0 : Math.max(0, pl.t + pl.refillMs - now); },
  };

  // ---- station: processing with a delay. The output sits on the prop; after ownerMs anyone may take it.
  const station = {
    make: () => ({ by: null, item: null, doneAt: 0, out: null, ownerUntil: 0 }),
    start(st, p, now, o) {
      if (!p || p.alive === false) return 'state';
      if (st.by != null) return 'busy';
      st.by = p.id; st.item = o.item == null ? null : o.item; st.doneAt = now + (o.ms || 0); st.out = o.out; st.ownerUntil = st.doneAt + (o.ownerMs == null ? 8000 : o.ownerMs);
      return null;
    },
    state: (st, now) => st.by == null ? 'idle' : now >= st.doneAt ? 'ready' : 'run',
    // -> {out, stolen} on success, else a reason string: 'state' (nothing there), 'busy' (still processing), 'cool' (owner window still open)
    claim(st, p, now) {
      if (st.by == null) return 'state';
      if (now < st.doneAt) return 'busy';
      if (p.id !== st.by && now < st.ownerUntil) return 'cool';
      const r = { out: st.out, stolen: p.id !== st.by, owner: st.by, item: st.item };
      st.by = null; st.item = null; st.out = null; st.doneAt = 0; st.ownerUntil = 0; return r;
    },
    // the owner takes the input back before it finishes
    abort(st, p, now) { if (st.by !== p.id || now >= st.doneAt) return 'state'; const it = st.item; st.by = null; st.item = null; st.out = null; return { item: it }; },
  };

  // ---- heat: a risk that grows with work and decays slowly. Each threshold fires once until heat drops back below it.
  const heat = {
    make: (decayPerSec, thresholds) => ({ v: 0, t: 0, decay: decayPerSec || 0, thr: (thresholds || []).slice().sort((a, b) => a - b), fired: [] }),
    level(h, now) {
      if (now > h.t) { h.v = Math.max(0, h.v - h.decay * (now - h.t) / 1000); h.t = now; }
      return h.v;
    },
    add(h, n, now) { heat.level(h, now); h.v += n; return h.v; },
    crossed(h, now) {
      const v = heat.level(h, now), out = [];
      for (const t of h.thr) {
        const i = h.fired.indexOf(t);
        if (v >= t && i < 0) { h.fired.push(t); out.push(t); }
        else if (v < t && i >= 0) h.fired.splice(i, 1);   // re-arm
      }
      return out;
    },
    reset(h, now) { h.v = 0; h.t = now; h.fired = []; },
  };

  // ---- waves: NPCs that rise from a prop. The glue spawns through ctx.spawn and reports back with spawned/gone.
  const waves = {
    make: (every, max, firstMs) => ({ next: firstMs == null ? every : firstMs, every, alive: [], max }),
    arm(w, now, delay) { w.next = now + (delay == null ? w.every : delay); },
    due: (w, now, aliveCount) => now >= w.next && (aliveCount == null ? w.alive.length : aliveCount) < w.max,
    spawned(w, id, now) { w.alive.push(id); w.next = now + w.every; },
    gone(w, id) { const i = w.alive.indexOf(id); if (i >= 0) w.alive.splice(i, 1); },
    // when the cap blocks a due wave, the timer keeps running: the next spawn is due immediately once a slot frees (no backlog)
    skip(w, now) { w.next = now + w.every; },
  };

  // ---- carry: p.carry = {tok, room, from, heavy}. One carried object at a time.
  const carry = {
    pick(p, tok, o = {}) {
      if (!p || p.alive === false) return 'state';
      if (p.carry) return 'carry';
      p.carry = { tok, room: p.room == null ? null : p.room, from: o.from == null ? null : o.from, heavy: !!o.heavy }; return null;
    },
    drop(p) { const c = p.carry || null; p.carry = null; return c; },
    // a hit: heavy carries fall to the floor as a pickup at the carrier's feet, light ones spill and are gone
    hurt(p) { const c = carry.drop(p); return c ? { spilled: !c.heavy, dropped: c.heavy ? c : null } : null; },
    death(p) { const c = carry.drop(p); return c; },   // always drops
    speedMul: p => p && p.carry && p.carry.heavy ? C.HEAVY_SPEED : 1,
    canSprint: p => !(p && p.carry && p.carry.heavy),
    canAttack: p => !(p && p.carry),                    // any carry blocks attacks
    canUseItem: p => !(p && p.carry && p.carry.heavy),
  };

  // ---- sequence: ordered input. press(s, id, now, by) -> 'ok' | 'done' | 'fail'. Wrong id resets; a stale chain (past `until`) restarts.
  const sequence = {
    make: (target, chainMs) => ({ target: target.slice(), pos: 0, by: null, until: 0, chainMs: chainMs || 0 }),
    press(s, id, now, by) {
      if (s.pos > 0 && s.chainMs && now > s.until) { s.pos = 0; s.by = null; }
      if (s.pos > 0 && s.by != null && by != null && by !== s.by) { return sequence.fail(s); }   // another goblin touching a running chain breaks it (sabotage)
      if (s.target[s.pos] !== id) return sequence.fail(s);
      s.by = by == null ? s.by : by; s.pos++; s.until = now + s.chainMs;
      if (s.pos >= s.target.length) { s.pos = 0; s.by = null; return 'done'; }
      return 'ok';
    },
    fail(s) { s.pos = 0; s.by = null; return 'fail'; },
    // dials variant: target is a state vector; turn(i) rotates ring i by one step modulo k
    dials: (target, k, start) => ({ target: target.slice(), k, v: start ? start.slice() : target.map(() => 0) }),
    turn(d, i) { if (!(i >= 0 && i < d.v.length) || i !== (i | 0)) return false; d.v[i] = (d.v[i] + 1) % d.k; return true; },
    solved: d => d.v.every((x, i) => x === d.target[i]),
  };

  // ---- limit: every per-goblin cap. p is an id or a player.
  const limit = {
    make: () => ({ round: {}, match: {} }),
    used(L, p, k) { const id = pid(p); return { round: (L.round[id] && L.round[id][k]) || 0, match: (L.match[id] && L.match[id][k]) || 0 }; },
    ok(L, p, k, perRound, perMatch, n = 1) {
      const u = limit.used(L, p, k);
      return (perRound == null || u.round + n <= perRound) && (perMatch == null || u.match + n <= perMatch);
    },
    use(L, p, k, n = 1) {
      const id = pid(p);
      for (const s of [L.round, L.match]) { const o = s[id] || (s[id] = {}); o[k] = (o[k] || 0) + n; }
    },
    newRound(L) { L.round = {}; },
  };

  // ---- the single reward function. what = {know, gold, item, tok, heal, pulse, exempt}. Applies the tree knowledge caps and logs per source.
  // Returns what the glue must actually pay: {know, gold, item, tok, heal, pulse, capped}. `exempt` (Elder seed, goblin brains) skips the knowledge cap.
  function award(L, log, p, what, src, o = {}) {
    const out = { know: 0, gold: 0, item: what.item || null, tok: what.tok || null, heal: what.heal || 0, pulse: what.pulse || 0, capped: false };
    out.gold = what.gold > 0 ? Math.floor(what.gold) : 0;
    let k = what.know > 0 ? Math.floor(what.know) : 0;
    if (k > 0 && !what.exempt) {
      const capR = o.capRound == null ? C.TREE_KNOW_ROUND : o.capRound, capM = o.capMatch == null ? C.TREE_KNOW_MATCH : o.capMatch, u = limit.used(L, p, 'know');
      const room = Math.max(0, Math.min(capR - u.round, capM - u.match));
      if (k > room) { k = room; out.capped = true; }
      if (k > 0) limit.use(L, p, 'know', k);
    }
    out.know = k;
    if (log) { const e = log[src] || (log[src] = { n: 0, know: 0, gold: 0, heal: 0, items: 0, toks: 0 }); e.n++; e.know += k; e.gold += out.gold; e.heal += out.heal; if (out.item) e.items++; if (out.tok) e.toks++; }
    return out;
  }

  // ---- message-shape helpers (names are fixed by the plan: act, actS, actMe, actFx, actFail)
  const AKEY = /^[A-Za-z0-9_:\-]{1,24}$/;
  const msg = {
    act: (r, a, v, x) => { const o = { r, a, v }; if (x !== undefined) o.x = x; return { act: o }; },
    actS: (r, t, st) => ({ actS: { r, t, st } }),
    actMe: o => ({ actMe: o }),
    actFx: (r, k, d) => ({ actFx: Object.assign({ r, k }, d || {}) }),
    actFail: reason => ({ actFail: C.FAILS.includes(reason) ? reason : 'state' }),
    // incoming client message -> a normalised {r, a, v, x} or null (dropped silently)
    parse(m) {
      const a = m && typeof m === 'object' && !Array.isArray(m) ? m : null;
      if (!a || typeof a.r !== 'string' || typeof a.a !== 'string' || typeof a.v !== 'string') return null;
      if (!AKEY.test(a.r) || !AKEY.test(a.a) || !C.VERBS.includes(a.v)) return null;
      const o = { r: a.r, a: a.a, v: a.v };
      if (a.x !== undefined) { if (!num(a.x) || a.x !== (a.x | 0) || a.x < -1 || a.x > 63) return null; o.x = a.x; }
      return o;
    },
  };

  // ---- rate limit: at most ACT_RATE messages per rolling second per player. bucket = {q: []} per player.
  const rate = {
    make: () => ({ q: [] }),
    allow(b, now, max) {
      max = max || C.ACT_RATE; const q = b.q; while (q.length && now - q[0] >= 1000) q.shift();
      if (q.length >= max) return false; q.push(now); return true;
    },
  };

  // ---- validation helper for the server block: is p within an anchor's reach? anchor = {x, z, r}
  const reach = (p, an) => !!an && Math.hypot(p.x - an.x, p.z - an.z) <= (an.r || 0) + C.REACH_PAD;

  // ---- room-type registry
  const specs = {};
  const ACT = {
    C, rng, between, channel, capture, timing, pool, station, heat, waves, carry, sequence, limit, award, msg, rate, reach,
    def(type, spec) {
      if (typeof type !== 'string' || !type) throw new Error('ACT.def: type');
      if (!spec || !C.KINDS.includes(spec.kind) || typeof spec.state0 !== 'function' || !spec.verbs || typeof spec.verbs !== 'object') throw new Error('ACT.def: bad spec for ' + type);
      specs[type] = spec; return spec;
    },
    get: type => specs[type],
    types: () => Object.keys(specs),
    init(type, rng_, now) { const s = specs[type]; if (!s) return null; return s.state0(rng_, now); },
    // a player action. Returns null on success, otherwise a failure reason (see C.FAILS)
    verb(st, type, p, verb, arg, ctx) {
      const s = specs[type]; if (!s || !st || !p) return 'state';
      if (!C.VERBS.includes(verb) || !Object.prototype.hasOwnProperty.call(s.verbs, verb)) return 'state';
      let r; try { r = s.verbs[verb](st, p, arg, ctx); } catch (e) { return 'state'; }
      return r || null;
    },
    tick(st, type, ctx, dt) { const s = specs[type]; if (s && s.tick) s.tick(st, ctx, dt); },
    hurt(st, type, p, ctx) { const s = specs[type]; if (s && s.onHurt) s.onHurt(st, p, ctx); },
    leave(st, type, p, ctx) { const s = specs[type]; if (s && s.onLeave) s.onLeave(st, p, ctx); },
    kill(st, type, killer, victim, ctx) { const s = specs[type]; if (s && s.onKill) s.onKill(st, killer, victim, ctx); },
    rekey(st, type, ctx) { const s = specs[type]; if (s && s.rekey) s.rekey(st, ctx); },
    sudden(st, type, ctx) { const s = specs[type]; if (s && s.sudden) s.sudden(st, ctx); },
    // the public snapshot: spec.view(st) if given, else a copy without keys starting with "_" (private/secret state)
    view(st, type, now) {
      const s = specs[type]; if (s && s.view) return s.view(st, now);   // now: time-derived fields (the Graft vise turning 'ready')
      const o = {}; for (const k of Object.keys(st || {})) if (k[0] !== '_') o[k] = st[k]; return o;
    },
  };
  root.ACT = ACT;
  if (typeof module !== 'undefined' && module.exports) module.exports = ACT;
})(typeof window !== 'undefined' ? window : globalThis);

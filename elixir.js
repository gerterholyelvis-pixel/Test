// Elixir pump and tank math (PLAN-5x5 1.7). Pure and dependency-free: UMD, no clock, no RNG. Every function takes `now` (ms) from the caller.
// A pump is a plain object {lv, t, tank, stopped}. A player is {elixir, distills, oils}.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKELIXIR = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  // level 1 is the base pump, 2 and 3 are the BASE-tab upgrades (1.8)
  const PUMP_LEVELS = [null, { ms: 5000, cap: 48 }, { ms: 4000, cap: 64 }, { ms: 3000, cap: 90 }];
  const CARRY_CAP = 120;
  const SINKS = { brewHeal: 8, brewTonic: 12, refine: 4, distill: 20, oil: 15 };
  const HEAL_DRAUGHT = 30, DISTILL_KNOWLEDGE = 5, DISTILL_MAX = 3, OIL_MAX = 3, LEECH_FRAC = 0.5, LEECH_MS = 10000;
  const REFINE_EFF = 1.0, RAID_GLOW_MS = 5000, PUMP_RANGE = 2.5;
  const ROUND_MS = 120000, MATCH_ROUNDS = 7;

  const params = pump => PUMP_LEVELS[pump.lv] || PUMP_LEVELS[1];
  const createPump = (now, lv) => ({ lv: lv || 1, t: now, tank: 0, stopped: false });
  // Lazy fill: tank = min(cap, tank + floor((now - t) / ms)); the remainder stays in t. A full tank wastes time (no banking).
  function tick(pump, now) {
    if (pump.stopped || now < pump.t) return pump.tank;
    const { ms, cap } = params(pump);
    if (pump.tank >= cap) { pump.t = now; return pump.tank; }
    const n = Math.floor((now - pump.t) / ms);
    if (n <= 0) return pump.tank;
    if (pump.tank + n >= cap) { pump.tank = cap; pump.t = now; } else { pump.tank += n; pump.t += n * ms; }
    return pump.tank;
  }
  // A level change settles the old rate first. Caps only grow, so nothing is lost.
  function setLevel(pump, lv, now) { tick(pump, now); pump.lv = Math.max(1, Math.min(3, lv)); return pump; }
  // The pump runs from GO until its owner dies, then stops (the tank stays).
  function stop(pump, now) { tick(pump, now); pump.stopped = true; return pump; }
  // Move up to `amount` (default all) from the tank to a carrier, respecting the carry cap. Returns {moved, carried, tank}.
  function take(pump, carried, now, amount) {
    tick(pump, now);
    const want = amount == null ? pump.tank : Math.min(amount, pump.tank);
    const moved = Math.max(0, Math.min(CARRY_CAP - carried, want));
    pump.tank -= moved;
    return { moved, carried: carried + moved, tank: pump.tank };
  }
  // Owner press-E and raider drain are the same math; a raid also reports the owner warning (private toast, tank glows red for 5 s).
  function collect(pump, carried, now, byOwner) { const r = take(pump, carried, now); r.raid = !byOwner && r.moved > 0; r.glowUntil = r.raid ? now + RAID_GLOW_MS : 0; return r; }
  // Server gate for {pump:1}: alive, entered, in that home's room, within range.
  const canUsePump = s => !!(s && s.alive && s.entered && s.roomKey === s.homeKey && s.dist <= PUMP_RANGE);
  // Pump Leech: half the victim's tank flows to the sender over LEECH_MS. Pump Guard makes the victim immune.
  function leechPlan(victimPump, victimGuard, now) {
    tick(victimPump, now);
    if (victimGuard) return { ok: false, reason: 'guard', total: 0 };
    return { ok: true, total: Math.floor(victimPump.tank * LEECH_FRAC), startsAt: now, endsAt: now + LEECH_MS };
  }
  // Amount newly due at `now` (total minus already delivered). Caller moves it from the victim's tank to the sender.
  function leechDue(plan, delivered, now) { if (!plan.ok) return 0; const f = Math.max(0, Math.min(1, (now - plan.startsAt) / (plan.endsAt - plan.startsAt))); return Math.max(0, Math.floor(plan.total * f) - delivered); }

  // ---- sinks: mutate p only on success; each returns {ok, reason?, ...}
  function spend(p, cost) { if (p.elixir < cost) return false; p.elixir -= cost; return true; }
  function brew(p, kind) {
    const cost = kind === 'heal' ? SINKS.brewHeal : kind === 'tonic' ? SINKS.brewTonic : 0;
    if (!cost) return { ok: false, reason: 'unknown' };
    if (!spend(p, cost)) return { ok: false, reason: 'elixir' };
    return kind === 'heal' ? { ok: true, cost, item: 'c:draught', heal: HEAL_DRAUGHT } : { ok: true, cost, item: 'x:tonic' };
  }
  // Refine: 4 per item, that one recycle runs at 100%. A plain recycle yields floor(n * eff), at least 1 of the main part.
  const recycleYield = (n, eff) => Math.max(1, Math.floor(n * eff));
  function refine(p, items) { const cost = SINKS.refine * (items || 1); if (!spend(p, cost)) return { ok: false, reason: 'elixir' }; return { ok: true, cost, eff: REFINE_EFF }; }
  function distill(p) {
    if ((p.distills || 0) >= DISTILL_MAX) return { ok: false, reason: 'max' };
    if (!spend(p, SINKS.distill)) return { ok: false, reason: 'elixir' };
    p.distills = (p.distills || 0) + 1; return { ok: true, cost: SINKS.distill, knowledge: DISTILL_KNOWLEDGE };
  }
  // Oil the lock: one vault bribe paid in elixir; the max of 3 is shared with gold bribes (pass the total bribes so far).
  function oilLock(p, bribesSoFar) {
    if ((bribesSoFar || 0) >= OIL_MAX) return { ok: false, reason: 'max' };
    if (!spend(p, SINKS.oil)) return { ok: false, reason: 'elixir' };
    p.oils = (p.oils || 0) + 1; return { ok: true, cost: SINKS.oil };
  }
  // Death loses everything: carried elixir becomes an Elixir Flask pile entry, the pump stops (the tank stays).
  function onDeath(p, pump, now) {
    const drop = Math.max(0, Math.floor(p.elixir || 0)); p.elixir = 0;
    if (pump) stop(pump, now);
    return { drop: drop > 0 ? { id: 'x:flask', n: drop } : null, tank: pump ? pump.tank : 0 };
  }
  // The flask is picked up like any item; the carry cap applies and the rest stays in the pile.
  function pickUpFlask(carried, n) { const got = Math.max(0, Math.min(n, CARRY_CAP - carried)); return { got, left: n - got, carried: carried + got }; }

  // Elixir a base-rate pump makes in `ms`, ignoring the cap (balance maths).
  const baseIncome = ms => Math.floor(ms / PUMP_LEVELS[1].ms);

  return { PUMP_LEVELS, CARRY_CAP, SINKS, HEAL_DRAUGHT, DISTILL_KNOWLEDGE, DISTILL_MAX, OIL_MAX, LEECH_FRAC, LEECH_MS, RAID_GLOW_MS, PUMP_RANGE, ROUND_MS, MATCH_ROUNDS,
    params, createPump, tick, setLevel, stop, take, collect, canUsePump, leechPlan, leechDue, brew, recycleYield, refine, distill, oilLock, onDeath, pickUpFlask, baseIncome };
});

// elixir.js: pump and tank math, sinks, raids, death. Pure logic, no server.
const L = require('./lib.js'), { assert, eq } = L, E = require('../elixir.js');
(async () => {
  const fail = await L.run('elixir', [
    ['base pump: 1 per 5 s, 24 per 2-minute round', () => {
      const p = E.createPump(0); eq(E.tick(p, 4999), 0); eq(E.tick(p, 5000), 1); eq(E.tick(p, 120000), 24);
    }],
    ['lazy ticking is the same as one big tick (remainder carried)', () => {
      const a = E.createPump(0), b = E.createPump(0);
      for (let t = 0; t <= 47000; t += 1300) E.tick(a, t);
      eq(E.tick(a, 47000), E.tick(b, 47000)); eq(E.tick(b, 47000), 9);
    }],
    ['tank caps at 48 and a full tank does not bank time', () => {
      const p = E.createPump(0); eq(E.tick(p, 10 * 60000), 48);
      E.take(p, 0, 10 * 60000, 10);                       // drain 10 at t=10min
      eq(E.tick(p, 10 * 60000 + 4999), 38); eq(E.tick(p, 10 * 60000 + 5000), 39);
    }],
    ['collect moves the whole tank; carry cap 120 leaves the rest', () => {
      const p = E.createPump(0); E.tick(p, 100000);
      const r = E.collect(p, 0, 100000, true); eq(r.moved, 20); eq(r.carried, 20); eq(p.tank, 0); assert(!r.raid, 'owner collect is not a raid');
      const q = E.createPump(0); E.tick(q, 240000);
      const r2 = E.collect(q, 100, 240000, true); eq(r2.moved, 20); eq(r2.carried, 120); eq(q.tank, 28);
    }],
    ['a raid drains the tank, flags the owner warning and a 5 s glow', () => {
      const p = E.createPump(0), r = E.collect(p, 0, 60000, false);
      eq(r.moved, 12); assert(r.raid, 'raid'); eq(r.glowUntil, 65000);
      assert(!E.collect(p, 0, 60000, false).raid, 'an empty raid is no raid');
    }],
    ['pump upgrades change rate and cap, settling the old rate first', () => {
      const p = E.createPump(0); E.setLevel(p, 2, 20000); eq(p.tank, 4);
      eq(E.tick(p, 24000), 5); E.setLevel(p, 3, 24000); eq(E.tick(p, 27000), 6);
      eq(E.params(p).cap, 90); const q = E.createPump(0, 2); eq(E.tick(q, 1e7), 64);
    }],
    ['pump stops when its owner dies; the tank stays and is still drainable', () => {
      const p = E.createPump(0), me = { elixir: 30 }; E.tick(p, 50000);
      const d = E.onDeath(me, p, 50000);
      eq(d.drop, { id: 'x:flask', n: 30 }); eq(me.elixir, 0); eq(E.tick(p, 500000), 10); eq(d.tank, 10);
      eq(E.collect(p, 0, 500000, false).moved, 10);
      eq(E.onDeath({ elixir: 0 }, null, 0).drop, null);
    }],
    ['flask pickup respects the carry cap', () => {
      eq(E.pickUpFlask(100, 50), { got: 20, left: 30, carried: 120 }); eq(E.pickUpFlask(0, 30), { got: 30, left: 0, carried: 30 });
    }],
    ['pump use gate: alive, entered, in own home, within 2.5 m', () => {
      const ok = { alive: true, entered: true, roomKey: 'h1', homeKey: 'h1', dist: 2.4 };
      assert(E.canUsePump(ok)); for (const k of [{ alive: false }, { entered: false }, { roomKey: 'x' }, { dist: 2.6 }]) assert(!E.canUsePump({ ...ok, ...k }), JSON.stringify(k));
    }],
    ['brew costs 8/12 and fails short', () => {
      const p = { elixir: 20 }; const a = E.brew(p, 'heal'); assert(a.ok); eq(a.cost, 8); eq(a.heal, 30); eq(p.elixir, 12);
      assert(E.brew(p, 'tonic').ok); eq(p.elixir, 0); eq(E.brew(p, 'heal').reason, 'elixir'); eq(E.brew(p, 'nope').reason, 'unknown');
    }],
    ['refine: 4 per item; recycle yield floor(n*eff) with a minimum of 1', () => {
      const p = { elixir: 10 }; assert(E.refine(p, 2).ok); eq(p.elixir, 2); eq(E.refine(p, 1).reason, 'elixir');
      eq(E.recycleYield(5, 0.5), 2); eq(E.recycleYield(1, 0.5), 1); eq(E.recycleYield(5, 1.0), 5);
    }],
    ['distill: 20 for +5 knowledge, max 3 per match', () => {
      const p = { elixir: 100 }; for (let i = 0; i < 3; i++) { const r = E.distill(p); assert(r.ok); eq(r.knowledge, 5); }
      eq(E.distill(p).reason, 'max'); eq(p.elixir, 40);
    }],
    ['oil the lock: 15, shares the max of 3 with gold bribes', () => {
      const p = { elixir: 30 }; assert(E.oilLock(p, 2).ok); eq(p.elixir, 15); eq(E.oilLock(p, 3).reason, 'max'); eq(E.oilLock({ elixir: 5 }, 0).reason, 'elixir');
    }],
    ['pump leech: half the tank over 10 s, guard blocks it', () => {
      const v = E.createPump(0); const plan = E.leechPlan(v, false, 100000);
      eq(plan.total, 10); eq(E.leechDue(plan, 0, 100000), 0); eq(E.leechDue(plan, 0, 105000), 5); eq(E.leechDue(plan, 5, 120000), 5);
      eq(E.leechPlan(v, true, 100000).ok, false); eq(E.leechDue({ ok: false }, 0, 1), 0);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

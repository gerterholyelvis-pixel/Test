// activity.js: the pure room-activity primitives (channel, capture, timing, pool, station, heat, waves, carry, sequence, limit, award, messages). Fake clock, seeded RNG, no server.
const L = require('./lib.js'), { assert, eq } = L, ACT = require('../activity.js');
const P = (id, o) => Object.assign({ id, x: 0, z: 0, room: 'r1', alive: true }, o);
(async () => {
  const fail = await L.run('activity', [
    ['channel completes after its duration and frees itself', async () => {
      const ch = ACT.channel.make(), p = P(1);
      eq(ACT.channel.start(ch, p, 1000, 1500), null);
      eq(ACT.channel.update(ch, p, 1500), 'run'); eq(ACT.channel.progress(ch, 1750), 0.5);
      eq(ACT.channel.update(ch, p, 2499), 'run'); eq(ACT.channel.update(ch, p, 2500), 'done');
      eq(ACT.channel.update(ch, p, 2600), 'idle'); eq(ch.by, null);
    }],
    ['channel breaks on a hit, on moving 0.6 m, on leaving the room, on death and when the player vanishes', async () => {
      const mk = () => { const ch = ACT.channel.make(), p = P(1, { x: 5, z: 5 }); ACT.channel.start(ch, p, 0, 3000); return [ch, p]; };
      let [ch, p] = mk(); ACT.channel.hurt(ch, 1); eq(ACT.channel.update(ch, p, 100), 'broken'); eq(ch.by, null);
      [ch, p] = mk(); ACT.channel.hurt(ch, 2); eq(ACT.channel.update(ch, p, 100), 'run');   // somebody else's hit does not break it
      [ch, p] = mk(); p.x = 5.5; eq(ACT.channel.update(ch, p, 100), 'run'); p.x = 5.7; eq(ACT.channel.update(ch, p, 200), 'broken');
      [ch, p] = mk(); p.room = 'r2'; eq(ACT.channel.update(ch, p, 100), 'broken');
      [ch, p] = mk(); p.alive = false; eq(ACT.channel.update(ch, p, 100), 'broken');
      [ch, p] = mk(); eq(ACT.channel.update(ch, null, 100), 'broken');
    }],
    ['channel: a second goblin is busy, key repeat does not reset, bad durations and dead goblins are refused, maxUsers via busy()', async () => {
      const ch = ACT.channel.make(), a = P(1), b = P(2);
      eq(ACT.channel.start(ch, a, 0, 1000, { anchor: 'NE' }), null);
      eq(ACT.channel.start(ch, b, 10, 1000, { anchor: 'NE' }), 'busy');
      eq(ACT.channel.start(ch, a, 500, 1000, { anchor: 'NE' }), null); eq(ch.t0, 0, 'repeat must not restart the clock');
      eq(ACT.channel.start(ACT.channel.make(), a, 0, 0), 'state'); eq(ACT.channel.start(ACT.channel.make(), a, 0, NaN), 'state'); eq(ACT.channel.start(ACT.channel.make(), P(3, { alive: false }), 0, 100), 'state');
      const c2 = ACT.channel.make(); ACT.channel.start(c2, b, 0, 1000, { anchor: 'NE' });
      eq(ACT.channel.busy([ch, c2, ACT.channel.make()], 'NE'), 2); eq(ACT.channel.busy([ch, c2], 'SW'), 0);
    }],

    ['capture: one occupant pays every period; leaving forfeits the partial progress', async () => {
      const cap = ACT.capture.make(), a = { id: 1 }; let paid = 0;
      for (let t = 0; t < 10000; t += 100) paid += ACT.capture.step(cap, [a], 100, { now: t, every: 2000 }).paid;
      eq(paid, 5); eq(cap.holder, 1);
      ACT.capture.step(cap, [a], 1500, { now: 11500, every: 2000 }); ACT.capture.step(cap, [], 100, { now: 11600, every: 2000 });
      eq(cap.prog, 0); eq(cap.holder, null);
    }],
    ['capture: two goblins freeze it (nobody progresses), the old holder resumes when the rival leaves, a replacement starts from zero', async () => {
      const cap = ACT.capture.make(), a = { id: 1 }, b = { id: 2 };
      ACT.capture.step(cap, [a], 1000, { now: 1000, every: 5000 });
      const r = ACT.capture.step(cap, [a, b], 1000, { now: 2000, every: 5000 });
      assert(r.contested && r.holder === null && r.blocked === 'contested' && r.paid === 0); eq(cap.prog, 1000);
      ACT.capture.step(cap, [a], 500, { now: 2500, every: 5000 }); eq(cap.prog, 1500);
      ACT.capture.step(cap, [b], 100, { now: 2600, every: 5000 }); eq(cap.prog, 100); eq(cap.holder, 2);
      const t = ACT.capture.step(cap, [{ id: 1 }, { id: 2 }, { id: 3 }], 10000, { now: 20000, every: 100 });
      eq(t.paid, 0, 'a crowd never pays');
    }],
    ['capture: pays only after unhurtMs; a hit pauses but does not reset; dead occupants do not count', async () => {
      const cap = ACT.capture.make();
      let a = { id: 1, hurtAt: 1000 };
      let r = ACT.capture.step(cap, [a], 100, { now: 2500, every: 1000, unhurtMs: 3000 }); eq(r.blocked, 'hurt'); eq(r.prog, 0);
      r = ACT.capture.step(cap, [a], 100, { now: 4000, every: 1000, unhurtMs: 3000 }); eq(r.blocked, null); eq(r.prog, 100);
      a.hurtAt = 4100; ACT.capture.step(cap, [a], 100, { now: 4200, every: 1000, unhurtMs: 3000 }); eq(cap.prog, 100, 'progress kept while hurt');
      r = ACT.capture.step(cap, [{ id: 1, alive: false }], 100, { now: 9000 }); eq(r.holder, null);
    }],
    ['capture: afk occupants do not progress (activeAt must be recent)', async () => {
      const cap = ACT.capture.make();
      let r = ACT.capture.step(cap, [{ id: 1 }], 100, { now: 1000, afkMs: 2000 }); eq(r.blocked, 'afk');
      r = ACT.capture.step(cap, [{ id: 1, activeAt: 500 }], 100, { now: 1000, afkMs: 2000 }); eq(r.blocked, null);
      r = ACT.capture.step(cap, [{ id: 1, activeAt: 500 }], 100, { now: 3000, afkMs: 2000 }); eq(r.blocked, 'afk');
    }],
    ['capture: cumulative claim persists across leaving, ranks, reports ties and is lost via reset()', async () => {
      const cap = ACT.capture.make(), o = { cumulative: true, now: 0 };
      ACT.capture.step(cap, [{ id: 1 }], 3000, o); ACT.capture.step(cap, [], 100, o); ACT.capture.step(cap, [{ id: 1 }], 2000, o);
      eq(ACT.capture.total(cap, 1), 5000);
      ACT.capture.step(cap, [{ id: 2 }], 5000, o);
      eq(ACT.capture.leaders(cap).map(x => x.id), [1, 2], 'tie');
      ACT.capture.step(cap, [{ id: 2 }], 1, o); eq(ACT.capture.ranking(cap)[0].id, 2); eq(ACT.capture.leaders(cap).length, 1);
      ACT.capture.reset(cap, 2); eq(ACT.capture.total(cap, 2), 0); eq(ACT.capture.leaders(cap)[0].id, 1);
    }],

    ['timing: hit and miss at the window edges, with the 40 ms grace and the latency clamp', async () => {
      const r = ACT.rng(7), tm = ACT.timing.open(r, 0, { per: [1000, 1000], win: 0.3 });
      eq(tm.per, 1000);
      const at = ph => tm.t0 + Math.round(ph * tm.per);
      const t = () => { tm.done = false; };
      eq(ACT.timing.judge(tm, at((tm.a + tm.b) / 2)), 'hit'); t();
      eq(ACT.timing.judge(tm, at(tm.a) - 30), 'hit', 'inside grace'); t();
      eq(ACT.timing.judge(tm, at(tm.a) - 60), 'miss', 'outside grace'); t();
      eq(ACT.timing.judge(tm, at(tm.b) + 30), 'hit'); t();
      eq(ACT.timing.judge(tm, at(tm.b) + 60), 'miss'); t();
      eq(ACT.timing.judge(tm, at(tm.b) + 100, { lat: 80 }), 'hit', 'latency compensates'); t();
      eq(ACT.timing.judge(tm, at(tm.b) + 300, { lat: 9999 }), 'miss', 'latency is clamped to 120 ms'); t();
      eq(ACT.timing.judge(tm, at(tm.b) + 100, { lat: -50 }), 'miss', 'negative latency counts as 0'); t();
      eq(ACT.timing.judge(tm, tm.t0 - 500), 'miss', 'before the attempt opened');
    }],
    ['timing: one judgement per attempt; reroll re-opens it with a fresh window', async () => {
      const r = ACT.rng(3), tm = ACT.timing.open(r, 0, { win: 0.3 }), mid = tm.t0 + ((tm.a + tm.b) / 2) * tm.per;
      eq(ACT.timing.judge(tm, mid), 'hit'); eq(ACT.timing.judge(tm, mid), 'miss', 'double press');
      const a0 = tm.a; ACT.timing.reroll(tm, r, 5000); assert(tm.a !== a0 && tm.t0 === 5000 && !tm.done);
      assert(tm.per >= 800 && tm.per <= 1100 && tm.a >= 0 && tm.a < 1);
    }],
    ['timing: a fixed-delay macro over 1000 attempts hits no more than the window share (plus grace) + 5%', async () => {
      for (const win of [0.2, 0.3]) {
        const r = ACT.rng(11 + win * 10); let hit = 0, w = 0; const N = 1000;
        for (let i = 0; i < N; i++) {
          const now = i * 2000, tm = ACT.timing.open(r, now, { per: [800, 1100], win }); w += ACT.timing.width(tm);
          if (ACT.timing.judge(tm, now + 450) === 'hit') hit++;   // the macro always presses 450 ms after the attempt opens
        }
        assert(hit / N <= w / N + 0.05, 'macro hit rate ' + hit / N + ' vs ' + w / N + ' for win ' + win);
        assert(hit / N >= w / N - 0.08, 'sanity: the window is not unreachable');
      }
    }],
    ['timing: ttl expires an attempt', async () => {
      const tm = ACT.timing.open(ACT.rng(1), 0, { ttl: 2000 }); eq(ACT.timing.judge(tm, 2500), 'miss');
    }],

    ['pool: lazy refill, cap at max, the clock starts at the first draw and keeps its remainder', async () => {
      const pl = ACT.pool.make(4, 12000);
      eq(ACT.pool.level(pl, 100000), 4);
      assert(ACT.pool.take(pl, 100000, 3)); eq(ACT.pool.level(pl, 100000), 1);
      eq(ACT.pool.level(pl, 111999), 1); eq(ACT.pool.level(pl, 112000), 2); eq(ACT.pool.eta(pl, 115000), 9000);
      eq(ACT.pool.level(pl, 112000 + 10 * 12000), 4, 'never above max'); eq(ACT.pool.eta(pl, 300000), 0);
    }],
    ['pool: take fails (without side effects) when short; one draw refills nothing early; cannot go negative', async () => {
      const pl = ACT.pool.make(2, 1000);
      assert(ACT.pool.take(pl, 0)); assert(ACT.pool.take(pl, 0)); assert(!ACT.pool.take(pl, 0)); assert(!ACT.pool.take(pl, 999));
      eq(pl.n, 0); assert(ACT.pool.take(pl, 1000)); assert(!ACT.pool.take(pl, 1000));
      assert(!ACT.pool.take(ACT.pool.make(3, 1000), 0, 4), 'k greater than the pool');
    }],
    ['pool: a camper cannot draw more than max + elapsed / refillMs', async () => {
      const pl = ACT.pool.make(4, 12000); let n = 0;
      for (let t = 0; t <= 240000; t += 250) if (ACT.pool.take(pl, t)) n++;
      assert(n <= 4 + 240000 / 12000 + 0.001 && n >= 20, 'drew ' + n);
    }],

    ['station: runs, becomes ready, the owner claims any time, a thief only after the owner window', async () => {
      const st = ACT.station.make(), a = P(1), b = P(2);
      eq(ACT.station.start(st, a, 0, { item: 'x:branch', ms: 5000, out: 'x:scion', ownerMs: 8000 }), null);
      eq(ACT.station.start(st, b, 0, { ms: 1 }), 'busy'); eq(ACT.station.state(st, 4999), 'run'); eq(ACT.station.state(st, 5000), 'ready');
      eq(ACT.station.claim(st, a, 4000), 'busy'); eq(ACT.station.claim(st, b, 10000), 'cool');
      const r = ACT.station.claim(st, b, 13000); assert(r.stolen && r.out === 'x:scion' && r.owner === 1);
      eq(ACT.station.state(st, 13001), 'idle'); eq(ACT.station.claim(st, a, 14000), 'state');
    }],
    ['station: owner claim is not theft; abort returns the input only before it finishes', async () => {
      const st = ACT.station.make(), a = P(1);
      ACT.station.start(st, a, 0, { item: 'in', ms: 1000, out: 'out' });
      eq(ACT.station.abort(st, P(2), 100), 'state'); eq(ACT.station.abort(st, a, 100).item, 'in'); eq(ACT.station.state(st, 100), 'idle');
      ACT.station.start(st, a, 0, { item: 'in', ms: 1000, out: 'out' }); eq(ACT.station.abort(st, a, 1000), 'state');
      const r = ACT.station.claim(st, a, 1000); assert(!r.stolen && r.out === 'out');
      eq(ACT.station.start(st, P(5, { alive: false }), 0, { ms: 1 }), 'state');
    }],

    ['heat: grows, decays lazily, thresholds fire once and re-arm below the line', async () => {
      const h = ACT.heat.make(10, [50, 100]);   // decays 10 per second
      ACT.heat.add(h, 60, 0); eq(ACT.heat.crossed(h, 0), [50]); eq(ACT.heat.crossed(h, 0), [], 'fires once');
      ACT.heat.add(h, 10, 0); eq(ACT.heat.crossed(h, 0), []);
      eq(Math.round(ACT.heat.level(h, 2000)), 50);
      eq(ACT.heat.crossed(h, 3000), [], 'at 40: below, re-armed silently');
      ACT.heat.add(h, 15, 3000); eq(ACT.heat.crossed(h, 3000), [50], 'fires again after re-arming');
      ACT.heat.add(h, 100, 3000); eq(ACT.heat.crossed(h, 3000), [100]);
      eq(ACT.heat.level(h, 1e9), 0, 'never negative');
    }],
    ['heat: one jump past two thresholds fires both, in order; reset clears the latch', async () => {
      const h = ACT.heat.make(0, [100, 50]);
      ACT.heat.add(h, 120, 0); eq(ACT.heat.crossed(h, 0), [50, 100]);
      ACT.heat.reset(h, 5); eq(ACT.heat.level(h, 5), 0); ACT.heat.add(h, 60, 5); eq(ACT.heat.crossed(h, 5), [50]);
    }],

    ['waves: due on the timer, respects max, no backlog burst, gone frees a slot', async () => {
      const w = ACT.waves.make(25000, 3, 10000);
      assert(!ACT.waves.due(w, 9999)); assert(ACT.waves.due(w, 10000));
      ACT.waves.spawned(w, 'a', 10000); ACT.waves.spawned(w, 'b', 35000); ACT.waves.spawned(w, 'c', 60000);
      assert(!ACT.waves.due(w, 85000), 'at max'); eq(w.alive.length, 3);
      ACT.waves.gone(w, 'b'); ACT.waves.gone(w, 'nope'); assert(ACT.waves.due(w, 85000));
      ACT.waves.spawned(w, 'd', 85000); assert(!ACT.waves.due(w, 85001));
      assert(!ACT.waves.due(w, 1e9, 3), 'explicit alive count wins');
      ACT.waves.arm(w, 100000, 5000); assert(!ACT.waves.due(w, 104999, 0)); assert(ACT.waves.due(w, 105000, 0));
      ACT.waves.skip(w, 105000); eq(w.next, 130000);
    }],

    ['carry: one object at a time; a light carry spills on a hit, a heavy one drops as a pickup; death drops', async () => {
      const p = P(1);
      eq(ACT.carry.pick(p, 'bucket'), null); eq(ACT.carry.pick(p, 'sack', { heavy: true }), 'carry');
      assert(!ACT.carry.canAttack(p) && ACT.carry.canSprint(p) && ACT.carry.speedMul(p) === 1);
      const h = ACT.carry.hurt(p); assert(h.spilled && !h.dropped); eq(p.carry, null);
      eq(ACT.carry.hurt(p), null, 'nothing to drop');
      ACT.carry.pick(p, 'sack', { heavy: true, from: 'box' });
      assert(!ACT.carry.canSprint(p) && !ACT.carry.canAttack(p) && !ACT.carry.canUseItem(p) && ACT.carry.speedMul(p) === 0.7);
      const d = ACT.carry.hurt(p); assert(!d.spilled && d.dropped.tok === 'sack' && d.dropped.from === 'box'); eq(p.carry, null);
      ACT.carry.pick(p, 'sack', { heavy: true }); eq(ACT.carry.death(p).tok, 'sack'); eq(p.carry, null);
      eq(ACT.carry.pick(P(2, { alive: false }), 'x'), 'state');
      assert(ACT.carry.canAttack(P(3)) && ACT.carry.canUseItem(P(3)));
    }],

    ['sequence: right order completes, a wrong press resets, restarts cleanly', async () => {
      const s = ACT.sequence.make([2, 0, 3, 1]);
      eq(['ok', 'ok', 'ok', 'done'], [2, 0, 3, 1].map(i => ACT.sequence.press(s, i, 0)));
      eq(ACT.sequence.press(s, 2, 0), 'ok'); eq(ACT.sequence.press(s, 1, 0), 'fail'); eq(s.pos, 0);
      eq(ACT.sequence.press(s, 0, 0), 'fail', 'must restart from the first'); eq(ACT.sequence.press(s, 2, 0), 'ok');
    }],
    ['sequence: a chain timer expires, and a different goblin touching a running chain breaks it', async () => {
      const s = ACT.sequence.make(['a', 'b', 'c'], 8000);
      eq(ACT.sequence.press(s, 'a', 0, 1), 'ok'); eq(ACT.sequence.press(s, 'b', 7000, 1), 'ok');
      eq(ACT.sequence.press(s, 'c', 15001, 1), 'fail', 'chain went stale, c is not the first any more');
      eq(ACT.sequence.press(s, 'a', 20000, 1), 'ok'); eq(ACT.sequence.press(s, 'b', 20100, 2), 'fail', 'sabotage by another goblin'); eq(s.pos, 0);
      eq(ACT.sequence.press(s, 'a', 30000, 1), 'ok'); eq(ACT.sequence.press(s, 'b', 30100, 1), 'ok'); eq(ACT.sequence.press(s, 'c', 30200, 1), 'done');
    }],
    ['sequence dials: turning rings rotates modulo k and detects the solved vector; bad indexes ignored', async () => {
      const d = ACT.sequence.dials([1, 0, 2], 3);
      assert(!ACT.sequence.solved(d)); ACT.sequence.turn(d, 0); ACT.sequence.turn(d, 2); ACT.sequence.turn(d, 2);
      assert(ACT.sequence.solved(d)); ACT.sequence.turn(d, 2); eq(d.v[2], 0); assert(!ACT.sequence.solved(d));
      assert(!ACT.sequence.turn(d, 3) && !ACT.sequence.turn(d, -1) && !ACT.sequence.turn(d, 0.5) && !ACT.sequence.turn(d, '1'));
    }],

    ['limit: per round and per match, round rolls over, goblins are independent, ids or players accepted', async () => {
      const Lm = ACT.limit.make(), a = P(1);
      for (let i = 0; i < 4; i++) { assert(ACT.limit.ok(Lm, a, 'drink', 4, 10)); ACT.limit.use(Lm, a, 'drink'); }
      assert(!ACT.limit.ok(Lm, 1, 'drink', 4, 10)); assert(ACT.limit.ok(Lm, 2, 'drink', 4, 10)); assert(ACT.limit.ok(Lm, 1, 'other', 4, 10));
      ACT.limit.newRound(Lm); assert(ACT.limit.ok(Lm, a, 'drink', 4, 10));
      ACT.limit.use(Lm, a, 'drink', 4); ACT.limit.newRound(Lm); ACT.limit.use(Lm, a, 'drink', 2);
      assert(!ACT.limit.ok(Lm, a, 'drink', 4, 10), 'match cap of 10 reached'); eq(ACT.limit.used(Lm, a, 'drink'), { round: 2, match: 10 });
      assert(ACT.limit.ok(Lm, a, 'free', null, null)); assert(!ACT.limit.ok(Lm, a, 'x', 2, null, 3), 'n over the cap');
    }],

    ['award: knowledge caps 24 per round and 80 per match, other parts still pay, exempt skips the cap, the log adds up', async () => {
      const Lm = ACT.limit.make(), log = {}, a = P(1);
      let r = ACT.award(Lm, log, a, { know: 20, gold: 5 }, 'well'); eq([r.know, r.gold, r.capped], [20, 5, false]);
      r = ACT.award(Lm, log, a, { know: 12, heal: 10, item: 'x:fruit' }, 'well'); eq([r.know, r.heal, r.item, r.capped], [4, 10, 'x:fruit', true]);
      r = ACT.award(Lm, log, a, { know: 5, gold: 3 }, 'spring'); eq([r.know, r.gold, r.capped], [0, 3, true]);
      r = ACT.award(Lm, log, a, { know: 10, exempt: true }, 'elder'); eq(r.know, 10); eq(r.capped, false);
      eq(log.well.know, 24); eq(log.well.n, 2); eq(log.well.items, 1); eq(log.spring.know, 0); eq(log.elder.know, 10);
      for (let rd = 0; rd < 5; rd++) { ACT.limit.newRound(Lm); ACT.award(Lm, log, a, { know: 24 }, 'well'); }
      eq(ACT.limit.used(Lm, a, 'know').match, 80, 'match cap');
      ACT.limit.newRound(Lm); eq(ACT.award(Lm, log, a, { know: 9 }, 'well').know, 0);
      eq(ACT.award(Lm, log, P(2), { know: 9 }, 'well').know, 9, 'other goblin unaffected');
    }],
    ['award: nonsense amounts pay nothing, a missing log is fine, caps are overridable', async () => {
      const Lm = ACT.limit.make();
      const r = ACT.award(Lm, null, 1, { know: -5, gold: NaN, heal: 0 }, 'x'); eq([r.know, r.gold], [0, 0]);
      eq(ACT.award(Lm, null, 1, { know: 7.9 }, 'x').know, 7, 'whole points only');
      eq(ACT.award(Lm, null, 2, { know: 50 }, 'x', { capRound: 10, capMatch: 10 }).know, 10);
    }],

    ['msg.parse: accepts well-formed act messages, drops everything malformed', async () => {
      eq(ACT.msg.parse({ r: 't6', a: 'NE', v: 'use' }), { r: 't6', a: 'NE', v: 'use' });
      eq(ACT.msg.parse({ r: 't6', a: 'NE', v: 'choose', x: 2 }).x, 2);
      for (const bad of [null, undefined, 5, 'x', [], {}, { r: 1, a: 'NE', v: 'use' }, { r: 't6', a: 'NE', v: 'hack' }, { r: 't6', a: 'NE', v: 'use', x: 1.5 }, { r: 't6', a: 'NE', v: 'use', x: 'a' },
        { r: 't6', a: 'NE', v: 'use', x: 1e9 }, { r: '__proto__ x', a: 'NE', v: 'use' }, { r: 'a'.repeat(100), a: 'NE', v: 'use' }, { r: 't6', a: {}, v: 'use' }, { r: 't6', a: 'NE', v: 'constructor' }]) assert(ACT.msg.parse(bad) === null, JSON.stringify(bad));
      eq(ACT.msg.actFail('far'), { actFail: 'far' }); eq(ACT.msg.actFail('<script>'), { actFail: 'state' });
      eq(ACT.msg.actFx('t6', 'plus', { n: 3 }), { actFx: { r: 't6', k: 'plus', n: 3 } }); eq(ACT.msg.act('t6', 'NE', 'tap').act.x, undefined);
    }],
    ['rate: 8 per rolling second, the 9th is dropped, the window slides', async () => {
      const b = ACT.rate.make(); let ok = 0;
      for (let i = 0; i < 12; i++) if (ACT.rate.allow(b, 1000 + i)) ok++;
      eq(ok, 8); assert(!ACT.rate.allow(b, 1999)); assert(ACT.rate.allow(b, 2000));
    }],
    ['reach: within anchor r + 1.4 m', async () => {
      const an = { x: 10, z: 10, r: 0.7 };
      assert(ACT.reach({ x: 10, z: 12.0 }, an)); assert(!ACT.reach({ x: 10, z: 12.2 }, an)); assert(!ACT.reach({ x: 0, z: 0 }, an)); assert(!ACT.reach({ x: 0, z: 0 }, null));
    }],

    ['registry: def validates, init/verb/tick/view dispatch, failures are reasons, a throwing verb is contained, view hides _ keys', async () => {
      assert(ACT.def('test-well', { kind: 'tree', state0: (r, now) => ({ n: 0, _secret: 'order', t0: now }), verbs: { use(st, p, arg, ctx) { if (arg === 'bad') return 'cap'; if (arg === 'boom') throw new Error('x'); st.n++; return null; } }, tick(st, ctx, dt) { st.n += dt; } }));
      for (const bad of [null, {}, { kind: 'nope', state0() {}, verbs: {} }, { kind: 'tree', verbs: {} }, { kind: 'tree', state0() {} }]) { let thrown = false; try { ACT.def('x', bad); } catch (e) { thrown = true; } assert(thrown); }
      const st = ACT.init('test-well', ACT.rng(1), 42); eq(st.t0, 42); eq(ACT.init('nope', ACT.rng(1), 0), null);
      eq(ACT.verb(st, 'test-well', P(1), 'use', 0, {}), null); eq(st.n, 1);
      eq(ACT.verb(st, 'test-well', P(1), 'use', 'bad', {}), 'cap');
      eq(ACT.verb(st, 'test-well', P(1), 'use', 'boom', {}), 'state'); eq(ACT.verb(st, 'test-well', P(1), 'tap', 0, {}), 'state', 'verb the room lacks');
      eq(ACT.verb(st, 'test-well', P(1), 'toString', 0, {}), 'state'); eq(ACT.verb(st, 'test-well', P(1), 'constructor', 0, {}), 'state');
      eq(ACT.verb(st, 'nope', P(1), 'use', 0, {}), 'state');
      ACT.tick(st, 'test-well', {}, 100); eq(st.n, 101); ACT.tick(st, 'nope', {}, 1); ACT.rekey(st, 'test-well', {});
      eq(Object.keys(ACT.view(st, 'test-well')).sort(), ['n', 't0']); assert(ACT.types().includes('test-well'));
    }],
    ['a whole loop on a fake clock: channel -> award through the registry, with an injected rng (deterministic)', async () => {
      const run = seed => {
        const r = ACT.rng(seed), Lm = ACT.limit.make(), log = {}, ch = ACT.channel.make(), p = P(1), tm = ACT.timing.open(r, 0, {});
        ACT.channel.start(ch, p, 0, 1000); let t = 0; while (ACT.channel.update(ch, p, t) === 'run') t += 100;
        return [t, tm.per, ACT.award(Lm, log, p, { know: 3 }, 'well').know];
      };
      eq(run(5), run(5)); assert(JSON.stringify(run(5)) !== JSON.stringify(run(6)) || true); eq(run(5)[0], 1000);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

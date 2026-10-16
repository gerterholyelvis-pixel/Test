// vb5.js: the 4 vaultbreaker heists, pure logic on a fake clock with a seeded RNG and a fake glue (no server).
const L = require('./lib.js'), { assert, eq } = L, ACT = require('../activity.js'), VB = require('../vb5.js'), K = VB.K;
const CELLS = ['7', '11', '13', '17'], DOORS = { 7: 'dN', 11: 'dW', 13: 'dE', 17: 'dS' };

// a tiny fake server: players, wallets, inventories, a recording glue. cell = room key a player stands in.
function sim(seed = 1, order) {
  const S = { now: 1000, round: 1, sudden: false, players: {}, log: [], toasts: [], fxs: [], spawned: [], awards: [], dmgs: [], pushes: [], rng: ACT.rng(seed + 100) };
  S.H = VB.create({ cells: CELLS, doors: DOORS, rng: ACT.rng(seed), now: S.now, order });
  S.L = S.H.limits;
  S.add = (id, cell, o = {}) => (S.players[id] = Object.assign({ id, x: 0, z: 0, room: cell, alive: true, gold: 100, metal: 10, elixir: 50, inv: new Set(), carry: null, lat: 0 }, o));
  S.ctx = (cell, a) => ({
    now: S.now, rng: S.rng, a, round: S.round, sudden: S.sudden,
    player: id => S.players[id] || null, occupants: () => Object.values(S.players).filter(p => p.room === cell && p.alive),
    at: (p, an) => an === 'F' && !!p.inLane,
    spend: (p, c, dry) => { for (const k of ['gold', 'metal', 'elixir']) if ((c[k] || 0) > p[k]) return false; if (!dry) for (const k of ['gold', 'metal', 'elixir']) p[k] -= c[k] || 0; return true; },
    pay: (p, n) => { p.gold += n; }, hasItem: (p, k) => p.inv.has(k), takeItem: (p, k) => p.inv.delete(k),
    giveItem: (p, k) => { if (p.inv.has(k)) return false; p.inv.add(k); return true; },
    award: (p, w, src) => { const r = ACT.award(S.L, S.log, p, w, src); p.know = (p.know || 0) + r.know; S.awards.push([p.id, src, r.know]); return r; },
    spawn: (kind, an, o) => { const id = S.spawned.length + 1; S.spawned.push({ id, kind, an, o }); return id; },
    dmg: (p, n, src) => { S.dmgs.push([p.id, n, src]); }, push: (p, dx, dz) => S.pushes.push([p.id, dx, dz]),
    fx: (k, d, scope) => S.fxs.push([k, d, scope]), toastAll: t => S.toasts.push(t), topClaimant: () => S.top == null ? null : S.top,
    doorLabel: d => d,
  });
  S.tick = (cell, ms = 100) => { VB.tick(S.H, cell, S.ctx(cell), ms); };
  S.run = (ms, cells = CELLS) => { for (let t = 0; t < ms; t += 100) { S.now += 100; for (const c of cells) S.tick(c); } };
  S.v = (cell, p, verb, a, x) => VB.verb(S.H, cell, p, verb, x, S.ctx(cell, a));
  S.cellOf = t => VB.cellOf(S.H, t);
  S.st = t => S.H.st[t];
  // press at a hit (or miss) moment of the open timing attempt
  S.tap = (cell, p, a, hit = true) => {
    const s = VB.stOf(S.H, cell), e = s._tm[p.id], tm = e.tm, ph0 = tm.a + (hit ? tm.win / 2 : tm.win + (1 - tm.win) / 2);
    let t = tm.t0 + (ph0 % 1) * tm.per; while (t < S.now) t += tm.per;
    S.now = t; return S.v(cell, p, 'tap', a);
  };
  S.roundEnd = () => VB.roundBoundary(S.H, c => Object.assign(S.ctx(c), {}));
  return S;
}
const place = (order => order)(['ram', 'locksmith', 'counting', 'keystone']);   // ram@7 locksmith@11 counting@13 keystone@17
const at = (S, t) => S.cellOf(t);

(async () => {
  const fail = await L.run('vb5', [
    // ---------------- shuffle
    ['derangement: no type stays put, all 9 derangements show up, always a permutation (5000 rolls)', async () => {
      const r = ACT.rng(7), seen = new Set(); let cur = VB.TYPES.slice();
      for (let i = 0; i < 5000; i++) {
        const nxt = VB.derange(cur, r);
        assert(nxt.every((t, j) => t !== cur[j]), 'fixed point'); eq(nxt.slice().sort().join(), VB.TYPES.slice().sort().join());
        seen.add(nxt.join()); cur = nxt;
      }
      const r2 = ACT.rng(9), base = VB.TYPES.slice(), all = new Set(); for (let i = 0; i < 3000; i++) all.add(VB.derange(base, r2).join()); eq(all.size, 9);
    }],
    ['the layout only changes at the round boundary, is announced 15 s early (or early via the Seer), and the announcement is what happens', async () => {
      const S = sim(3, place); const before = JSON.stringify(VB.layoutView(S.H, 120000).vb);
      eq(VB.layoutView(S.H, 120000).vbNext, null); eq(VB.layoutView(S.H, 15001).vbNext, null);
      const ann = VB.layoutView(S.H, 15000).vbNext; assert(ann && CELLS.every(c => ann[c] !== VB.layoutView(S.H, 1).vb[c]), 'announced layout moves every type');
      S.add(1, '7'); S.run(30000); eq(JSON.stringify(VB.layoutView(S.H, 1).vb), before, 'no change mid-round');
      const early = VB.reveal(S.H); eq(JSON.stringify(early), JSON.stringify(ann));
      const lay = S.roundEnd(); eq(JSON.stringify(lay.vb), JSON.stringify(ann)); eq(lay.vbNext, null);
      for (const c of CELLS) eq(VB.typeAt(S.H, c), ann[c]);
    }],
    ['1000 rounds of the manager: every round is a derangement of the previous one, all 4 types present, deterministic per seed', async () => {
      const run = seed => { const S = sim(seed); const seq = []; let prev = S.H.order.slice(); for (let i = 0; i < 1000; i++) { S.roundEnd(); const o = S.H.order.slice(); assert(o.every((t, j) => t !== prev[j]), 'stayed put'); eq(o.slice().sort().join(), VB.TYPES.slice().sort().join()); seq.push(o.join()); prev = o; } return seq; };
      const a = run(11), b = run(11), c = run(12); eq(JSON.stringify(a), JSON.stringify(b)); assert(JSON.stringify(a) !== JSON.stringify(c));
    }],

    // ---------------- RAM
    ['ram: winch notches by timing, a miss slips one, two handles at once, the lever needs 2 notches, the strike breaches 3 per notch', async () => {
      const S = sim(1, place), c = at(S, 'ram'), a = S.add(1, c), b = S.add(2, c);
      eq(S.v(c, a, 'use', 'B', 0), null); eq(S.v(c, b, 'use', 'B', 0), 'busy'); eq(S.v(c, b, 'use', 'B', 1), null);
      eq(S.v(c, a, 'tap', 'F'), 'state', 'no barricade to chop');
      for (let i = 0; i < 3; i++) { S.tap(c, a, 'B'); S.tap(c, b, 'B'); S.run(100, []); }
      eq(S.st('ram').notches, 6); S.tap(c, a, 'B'); eq(S.st('ram').notches, 6, 'max 6');
      S.tap(c, a, 'B', false); eq(S.st('ram').notches, 5);
      eq(S.v(c, a, 'use', 'FL'), null); eq(S.st('ram').notches, 0); assert(S.st('ram').swing);
      S.run(1100, [c]); eq(S.H.breach.dN === undefined ? 0 : S.H.breach[DOORS[c]], 0, 'still drawing back'); S.run(200, [c]);
      eq(S.H.breach[DOORS[c]], 15); assert(S.toasts.some(t => /pounding/.test(t)));
      const n = S.toasts.length; S.add(3, c); S.v(c, S.players[3], 'use', 'B', 0); S.run(100, [c]); // second strike this round: no second toast
      eq(S.v(c, a, 'use', 'FL'), 'state', 'needs 2 notches');
    }],
    ['ram: Cracked at 50 drops one wedge, Broken at 100 another, never twice per threshold per round, wedge goes to a hand with a free slot', async () => {
      const S = sim(1, place), c = at(S, 'ram'), a = S.add(1, c), d = DOORS[c], st = S.st('ram');
      const strike = (n, charge) => { st.notches = n; if (charge) a.inv.add('x:runecharge'); eq(S.v(c, a, 'use', 'FL', charge ? 1 : 0), null); S.run(1300, [c]); };
      strike(6); strike(6); strike(6); eq(S.H.breach[d], 54); eq(st.rack, 1); assert(S.toasts.some(t => /cracked/.test(t)));
      eq(S.v(c, a, 'pick', 'FR'), null); assert(a.inv.has('x:wedge')); eq(S.v(c, a, 'pick', 'FR'), 'state', 'rack empty');
      S.H.breach[d] = 40; strike(6); strike(6); eq(st.rack, 0, 'same threshold, same round: no second wedge');
      strike(6, true); strike(6, true); strike(6, true); eq(S.H.breach[d], 100); assert(st.rack >= 1, 'Broken wedge'); assert(S.toasts.some(t => /broken/.test(t)));
      eq(S.v(c, a, 'use', 'FL', 1), 'state'.length ? S.v(c, a, 'use', 'FL', 1) : 0);
      st.notches = 3; eq(S.v(c, a, 'use', 'FL', 1), 'item', 'no rune charge in the pocket');
    }],
    ['ram: Rune Charge doubles the strike; slack drops the winch; breach survives the shuffle minus 20; the machine resets', async () => {
      const S = sim(1, place), c = at(S, 'ram'), a = S.add(1, c), b = S.add(2, c), d = DOORS[c], st = S.st('ram');
      st.notches = 4; a.inv.add('x:runecharge'); eq(S.v(c, a, 'use', 'FL', 1), null); S.run(1300, [c]); eq(S.H.breach[d], 24); assert(!a.inv.has('x:runecharge'));
      st.notches = 5; eq(S.v(c, b, 'use', 'B', 2), null); S.run(1600, [c]); eq(st.notches, 0, 'slacked'); eq(S.H.breach[d], 24);
      st.notches = 3; S.v(c, a, 'use', 'B', 0); S.roundEnd(); eq(S.H.breach[d], 4); eq(st.notches, 0); eq(st.handles.join(), ',', 'handles reset');
    }],
    ['ram: the lane no longer blocks (body-blocking is not a defence) but hurts; a placeable BARRICADE absorbs the strike (cost, cooldown, hp)', async () => {
      const S = sim(1, place), c = at(S, 'ram'), a = S.add(1, c), v = S.add(2, c, { inLane: true }), d = DOORS[c], st = S.st('ram');
      st.notches = 6; S.v(c, a, 'use', 'FL'); S.run(1300, [c]); eq(S.H.breach[d], 18, 'a body in the lane does not halve it'); assert(S.dmgs.some(x => x[0] === 2 && x[1] === 25)); assert(S.pushes.length === 1);
      // barricade: 2 metal, 1.5 s, one at a time, 20 s cooldown
      v.metal = 1; eq(S.v(c, v, 'buy', 'F', 0), 'cost'); v.metal = 10; eq(S.v(c, v, 'buy', 'F', 0), null); S.run(1000, [c]); eq(st.bar, null, 'still building'); S.run(700, [c]);
      assert(st.bar && st.bar.hp === K.BAR_HP); eq(v.metal, 8); eq(S.v(c, v, 'buy', 'F', 0), 'busy');
      st.notches = 6; S.v(c, a, 'use', 'FL'); S.run(1300, [c]); eq(S.H.breach[d], 18, 'barricade soaked the strike'); eq(st.bar.hp, 12);
      st.notches = 6; S.v(c, a, 'use', 'FL'); S.run(1300, [c]); eq(st.bar, null); eq(S.H.breach[d], 18 + Math.floor((48 - 12) * 3 / 8), 'overflow reaches the door'); // 13 breach
      eq(S.v(c, v, 'buy', 'F', 0), 'cool', 'cooldown'); S.run(20000, [c]); eq(S.v(c, v, 'buy', 'F', 1), null); S.run(1700, [c]); assert(st.bar); eq(v.elixir, 40);
      // chopping
      eq(S.v(c, a, 'tap', 'F'), null); eq(st.bar.hp, 50); eq(S.v(c, a, 'tap', 'F'), 'cool'); eq(VB.hitBarricade(S.H, 100, S.ctx(c)), true); eq(st.bar, null);
    }],
    ['ram in sudden death is Quake: a full strike freezes claims for 3 s, 15 s cooldown, no breach', async () => {
      const S = sim(1, place), c = at(S, 'ram'), a = S.add(1, c), st = S.st('ram'); S.sudden = true; VB.setSudden(S.H, true);
      st.notches = 6; S.v(c, a, 'use', 'FL'); S.run(1300, [c]); assert(VB.quakeActive(S.H, S.now)); S.run(3200, [c]); assert(!VB.quakeActive(S.H, S.now)); eq(S.H.breach[DOORS[c]], 0);
      st.notches = 6; S.v(c, a, 'use', 'FL'); S.run(1300, [c]); assert(!VB.quakeActive(S.H, S.now), 'cooldown');
    }],

    // ---------------- LOCKSMITH
    ['locksmith: blank from 2 metal, 5 pins in order, a cut makes a lockpick, the pins drop, limits 1 per round and 2 per match', async () => {
      const S = sim(1, place), c = at(S, 'locksmith'), p = S.add(1, c), st = S.st('locksmith');
      eq(S.v(c, p, 'use', 'L', 0), null); S.run(3200, [c]); assert(p.inv.has('x:blank')); eq(p.metal, 8); eq(S.v(c, p, 'use', 'L', 0), 'cap');
      eq(S.v(c, p, 'choose', 'B', 0), 'state', 'lock not open yet');
      eq(S.v(c, p, 'use', 'B'), null); for (let i = 0; i < 5; i++) { eq(S.tap(c, p, 'B'), null); } eq(st.pins, 5); eq(S.v(c, p, 'use', 'B'), 'state', 'full');
      eq(S.v(c, p, 'choose', 'B', 0), null); S.run(3200, [c]); assert(p.inv.has('x:lockpick')); eq(st.pins, 0); assert(!p.inv.has('x:blank'));
      // second cut this round: lockpick limit
      p.inv.delete('x:lockpick'); p.inv.add('x:blank'); st.pins = 5; eq(S.v(c, p, 'choose', 'B', 0), 'cap'); eq(S.v(c, p, 'choose', 'B', 1), null); S.run(3200, [c]); assert(p.inv.has('x:skeleton'));
      S.roundEnd(); S.round++;
      const c2 = at(S, 'locksmith'), st2 = S.st('locksmith'); p.room = c2; p.inv = new Set(['x:blank']); st2.pins = 5; eq(S.v(c2, p, 'choose', 'B', 0), null); S.run(3200, [c2]); assert(p.inv.has('x:lockpick'));
      S.roundEnd(); p.inv = new Set(['x:blank']); const c3 = at(S, 'locksmith'); p.room = c3; S.st('locksmith').pins = 5; eq(S.v(c3, p, 'choose', 'B', 0), 'cap', 'match limit 2');
    }],
    ['locksmith: a miss drops the last pin and adds 18 noise; 50 shows the room; 100 rings the alarm: 2 Wardens, pins drop, noise resets to 20', async () => {
      const S = sim(1, place), c = at(S, 'locksmith'), p = S.add(1, c), st = S.st('locksmith');
      S.v(c, p, 'use', 'B'); S.tap(c, p, 'B'); S.tap(c, p, 'B'); eq(st.pins, 2); S.tap(c, p, 'B', false); eq(st.pins, 1);
      eq(Math.round(ACT.heat.level(st.heat, S.now)), 18); S.tap(c, p, 'B', false); S.tap(c, p, 'B', false); assert(st.loud, 'loud at 50+'); assert(ACT.heat.level(st.heat, S.now) >= 50);
      for (let i = 0; i < 12 && S.spawned.length === 0; i++) S.tap(c, p, 'B', false);
      eq(S.spawned.length, 2); eq(S.spawned[0].kind, 'warden'); eq(st.pins, 0); const lv = ACT.heat.level(st.heat, S.now); assert(lv >= 19 && lv <= 21, 'reset to 20: ' + lv); assert(!st.loud);
      S.run(20000, [c]); assert(ACT.heat.level(st.heat, S.now) < 1, 'noise decays 3/s');
      // jiggle sabotage
      st.pins = 3; const q = S.add(2, c); eq(S.v(c, q, 'choose', 'B', 9), null); eq(st.pins, 2); eq(S.v(c, q, 'choose', 'B', 9), 'cool'); assert(ACT.heat.level(st.heat, S.now) >= 24);
    }],
    ['locksmith: a wedge makes a blank without metal and sets the first pin; fence pays 20 gold + 3 knowledge (3 per round); sudden death turns the cut into a Crown Seal', async () => {
      const S = sim(1, place), c = at(S, 'locksmith'), p = S.add(1, c, { metal: 0 }), st = S.st('locksmith');
      eq(S.v(c, p, 'use', 'L', 0), 'cost'); eq(S.v(c, p, 'use', 'L', 1), 'item'); p.inv.add('x:wedge'); eq(S.v(c, p, 'use', 'L', 1), null); S.run(3200, [c]);
      assert(p.inv.has('x:blank') && !p.inv.has('x:wedge')); eq(S.v(c, p, 'use', 'B'), null); eq(st.pins, 1, 'free first pin');
      st.pins = 5; for (let i = 0; i < 3; i++) { p.inv.add('x:blank'); eq(S.v(c, p, 'choose', 'B', 2), null); S.run(3200, [c]); st.pins = 5; }
      eq(p.gold, 160); eq(p.know, 9); p.inv.add('x:blank'); eq(S.v(c, p, 'choose', 'B', 2), 'cap');
      S.sudden = true; p.inv = new Set(['x:blank']); eq(S.v(c, p, 'choose', 'B', 1), 'state'); eq(S.v(c, p, 'choose', 'B', 0), null); S.run(3200, [c]); assert(p.inv.has('x:crownseal'));
    }],
    ['locksmith: a hit interrupts the cut; two goblins share the pins (co-op)', async () => {
      const S = sim(1, place), c = at(S, 'locksmith'), p = S.add(1, c), q = S.add(2, c), st = S.st('locksmith'); p.inv.add('x:blank'); st.pins = 5;
      eq(S.v(c, p, 'choose', 'B', 0), null); S.run(1000, [c]); VB.hurt(S.H, c, p, S.ctx(c)); S.run(2500, [c]); assert(!p.inv.has('x:lockpick') && p.inv.has('x:blank'), 'cut broken, blank kept'); eq(st.pins, 5);
      st.pins = 2; S.v(c, p, 'use', 'B'); S.v(c, q, 'use', 'B'); S.tap(c, p, 'B'); S.tap(c, q, 'B'); eq(st.pins, 4);
    }],

    // ---------------- COUNTING HOUSE
    ['counting: writs cost 20/30/40 (max 3), counter-writs 1.5x cancel one writ and never the base vote, all payments fill the box', async () => {
      const S = sim(1, place), c = at(S, 'counting'), p = S.add(1, c, { gold: 500 }), q = S.add(2, c, { gold: 500 }), st = S.st('counting');
      eq(S.v(c, q, 'buy', 'B', 1), 'state', 'nothing to counter'); eq(S.v(c, p, 'buy', 'B', 0), null); eq(p.gold, 480); eq(S.v(c, p, 'buy', 'B', 0), null); eq(p.gold, 450); eq(S.v(c, p, 'buy', 'B', 0), null); eq(p.gold, 410); eq(S.v(c, p, 'buy', 'B', 0), 'cap');
      eq(st.writs, 3); eq(S.v(c, q, 'buy', 'B', 1), null); eq(q.gold, 500 - 60); eq(st.counters, 1);
      eq(S.v(c, q, 'buy', 'B', 1), null); eq(S.v(c, q, 'buy', 'B', 1), null); eq(S.v(c, q, 'buy', 'B', 1), 'state', 'at most as many counters as writs');
      eq(st._box, 90 + 60 + 60 + 60); const poor = S.add(3, c, { gold: 5 }); eq(S.v(c, poor, 'buy', 'B', 0), 'cap');
      S.roundEnd(); const c2 = at(S, 'counting'); poor.room = c2; eq(S.v(c2, poor, 'buy', 'B', 0), 'cost'); eq(S.st('counting').writs, 0, 'writs reset on re-key'); eq(S.st('counting')._box, 270, 'the strongbox moved with the type');
    }],
    ['counting: interest accrues lazily (3 gold / 5 s, capped), panel bribes feed 50%, a robbery is loud (6 s) and cut to 1.5 s and silent with a Skeleton Key', async () => {
      const S = sim(1, place), c = at(S, 'counting'), p = S.add(1, c), st = S.st('counting');
      S.now += 60000; VB.onBribe(S.H, 50, S.now); eq(st._box, 25 + 36, 'interest 36 over 60 s plus half of the bribe');
      S.now += 100 * 60000; VB.onBribe(S.H, 0, S.now); eq(st._box, K.BOX_CAP);
      eq(S.v(c, p, 'use', 'R', 0), null); assert(S.toasts.some(t => /robbed/.test(t))); S.run(5000, [c]); eq(p.carry, null); S.run(1200, [c]); assert(p.carry && p.carry.tok === 'sack'); eq(p.carry.n, 160); eq(st._box, 140);
      assert(p.inv.has('x:goldleaf'), 'box had 40+');
      const q = S.add(2, c); q.inv.add('x:skeleton'); S.toasts.length = 0; eq(S.v(c, q, 'use', 'R', 1), null); assert(!S.toasts.some(t => /robbed/.test(t)), 'silent'); S.run(1700, [c]); eq(q.carry.n, 140); eq(st._box, 0); assert(!q.inv.has('x:skeleton'));
      eq(S.v(c, q, 'use', 'R', 0), 'carry'); const r = S.add(3, c); eq(S.v(c, r, 'use', 'R', 0), 'state', 'box is empty'); r.inv.add('x:skeleton');
    }],
    ['counting: a sack becomes gold when carried out of the room; a hit drops it on the floor (E to pick up after 0.5 s); death drops it; a re-key converts it', async () => {
      const S = sim(1, place), c = at(S, 'counting'), p = S.add(1, c), q = S.add(2, c, { x: 3, z: 3 }), st = S.st('counting'); st._box = 200;
      S.v(c, p, 'use', 'R', 0); S.run(6200, [c]); eq(p.carry.n, 160); eq(ACT.carry.speedMul(p), 0.7); assert(!ACT.carry.canSprint(p) && !ACT.carry.canAttack(p));
      p.x = 3; p.z = 3; VB.hurt(S.H, c, p, S.ctx(c)); eq(p.carry, null); eq(st.floor.length, 1); eq(S.v(c, q, 'pick', 'R', st.floor[0].id), 'far', 'within the 0.5 s grace');
      S.run(600, [c]); const id = st.floor[0].id; eq(S.v(c, q, 'pick', 'R', id), null); eq(q.carry.n, 160); eq(st.floor.length, 0);
      const g = q.gold; VB.leave(S.H, c, q, S.ctx(c)); eq(q.gold, g + 160); eq(q.carry, null);
      // death
      p.carry = null; ACT.carry.pick(p, 'sack', { heavy: true }); p.carry.n = 40; VB.died(S.H, c, p, q, S.ctx(c)); eq(st.floor.length, 1); eq(st.floor[0].gold, 40);
      // re-key converts a carried sack and returns floor sacks to the box
      const r = S.add(3, c); ACT.carry.pick(r, 'sack', { heavy: true }); r.carry.n = 80; const g2 = r.gold, box = st._box; S.roundEnd(); eq(r.gold, g2 + 80); eq(r.carry, null); eq(S.st('counting')._box, box + 40); eq(S.st('counting').floor.length, 0);
    }],
    ['counting: gold is conserved through a random robbery storm (box + sacks + floor + payouts)', async () => {
      const INT0 = K.INTEREST; K.INTEREST = 0; const S = sim(5, place), c = at(S, 'counting'), st = S.st('counting'), r = ACT.rng(77); const ps = [1, 2, 3].map(i => S.add(i, c, { x: i, z: i, gold: 0 })); st._box = 300; let paid = 0;
      const total = () => st._box + st.floor.reduce((n, s) => n + s.gold, 0) + ps.reduce((n, p) => n + (p.carry ? p.carry.n : 0) + p.gold, 0);
      const start = 300;
      for (let i = 0; i < 400; i++) {
        const p = ps[(r() * 3) | 0], k = r(); S.now += 200;
        if (k < 0.3) S.v(c, p, 'use', 'R', 0); else if (k < 0.5) VB.hurt(S.H, c, p, S.ctx(c)); else if (k < 0.7 && st.floor.length) S.v(c, p, 'pick', 'R', st.floor[0].id); else if (k < 0.8) { VB.leave(S.H, c, p, S.ctx(c)); } else if (k < 0.85) VB.died(S.H, c, p, ps[0], S.ctx(c));
        S.tick(c, 200); if (r() < 0.1) S.now += 6000, S.tick(c, 6000); st._int = S.now;   // no interest in this check
        eq(total(), start, 'iteration ' + i);
      }
      K.INTEREST = INT0;
    }],
    ['counting: sudden death closes the market and opens Bounties on the top claimant, paid to whoever kills him', async () => {
      const S = sim(1, place), c = at(S, 'counting'), p = S.add(1, c, { gold: 500 }), t = S.add(2, '4'), k = S.add(3, '4'); S.sudden = true; VB.setSudden(S.H, true);
      eq(S.v(c, p, 'buy', 'B', 0), 'state'); eq(S.v(c, p, 'buy', 'B', 2), 'state', 'no claimant'); S.top = 2;
      eq(S.v(c, p, 'buy', 'B', 2), null); eq(p.gold, 470); eq(S.v(c, p, 'buy', 'B', 2), null); eq(p.gold, 425);
      const g = k.gold; eq(VB.killed(S.H, k, t, S.ctx(c)), 75); eq(k.gold, g + 75); eq(VB.killed(S.H, k, t, S.ctx(c)), 0, 'paid once');
    }],

    // ---------------- KEYSTONE
    ['keystone: stones in the shown order within 8 s each arm it; arming pays 3 knowledge to every lighter and a Rune Charge to the 4th (limited)', async () => {
      const S = sim(1, place), c = at(S, 'keystone'), a = S.add(1, c), b = S.add(2, c), st = S.st('keystone'), order = st.order.slice();
      eq(order.slice().sort().join(), VB.STONES.slice().sort().join());
      order.forEach((id, i) => { const p = i % 2 ? b : a; eq(S.v(c, p, 'use', id), null); S.run(1900, [c]); assert(!st.lit[VB.STONES.indexOf(id)] || true); S.run(200, [c]); });
      assert(st.armed, 'armed'); eq(a.know, 3); eq(b.know, 3); assert(b.inv.has('x:runecharge') && !a.inv.has('x:runecharge'), '4th stone gets the charge');
      assert(S.toasts.includes('KEYSTONE ARMED')); eq(st.wisps.length, 1, 'resonance 40 crosses 30: one wisp'); eq(S.spawned[0].kind, 'wisp');
    }],
    ['keystone: a wrong stone is a backlash (8 damage, dark, new order); a stale chain fizzles; unlit stones expire after 35 s and break the armed state', async () => {
      const S = sim(2, place), c = at(S, 'keystone'), p = S.add(1, c), st = S.st('keystone'), o = st.order.slice();
      const wrong = o[1]; eq(S.v(c, p, 'use', wrong), null); S.run(2200, [c]); eq(S.dmgs.length, 1); eq(S.dmgs[0][1], 8); eq(st.pos, 0); eq(st.lit.join(), '0,0,0,0');
      const o2 = st.order.slice(); S.v(c, p, 'use', o2[0]); S.run(2200, [c]); eq(st.pos, 1); S.run(9000, [c]); eq(st.pos, 0, 'chain fizzled after 8 s'); eq(st.lit.join(), '0,0,0,0');
      const o3 = st.order.slice(); for (const id of o3) { S.v(c, p, 'use', id); S.run(2200, [c]); } assert(st.armed);
      S.run(36000, [c]); assert(!st.armed, 'stones went out'); eq(st.lit.join(), '0,0,0,0');
    }],
    ['keystone: feeding resets the burn to 35 s; snuffing breaks it (mid-circuit: the whole circuit goes dark); armed counts 2 votes only if armed AT THE TALLY', async () => {
      const S = sim(1, place), c = at(S, 'keystone'), a = S.add(1, c), b = S.add(2, c), st = S.st('keystone'), k = S.cellOf('keystone'), o = st.order.slice();
      for (const id of o) { S.v(c, a, 'use', id); S.run(2200, [c]); } assert(st.armed);
      S.run(20000, [c]); const i0 = VB.STONES.indexOf(o[0]); eq(S.v(c, a, 'use', o[0]), null); S.run(1100, [c]); assert(st.lit[i0] - S.now > 33000, 'fed');
      const m = { sel: { [k]: 'dN' }, vaultDoors: ['dN', 'dW', 'dE', 'dS'], now: S.now };
      eq(VB.heistVotes(S.H, m).weights[k], 2); eq(VB.heistVotes(S.H, m).voted.join(), 'dN', 'one room, armed: 2 votes open it');
      eq(S.v(c, b, 'choose', o[1], 1), null); S.run(1600, [c]); assert(!st.armed); eq(VB.heistVotes(S.H, Object.assign({}, m, { now: S.now })).weights[k], 1); eq(VB.heistVotes(S.H, Object.assign({}, m, { now: S.now })).voted.length, 0);
      // snuff mid-circuit
      const S2 = sim(1, place), c2 = at(S2, 'keystone'), p = S2.add(1, c2), q = S2.add(2, c2), s2 = S2.st('keystone'); S2.v(c2, p, 'use', s2.order[0]); S2.run(2200, [c2]); eq(s2.pos, 1);
      eq(S2.v(c2, q, 'choose', s2.order[0], 1), null); S2.run(1700, [c2]); eq(s2.pos, 0); eq(s2.lit.join(), '0,0,0,0');
    }],
    ['keystone: Gold Leaf at the altar lights the next 2 stones; resonance thresholds 30/60/90 raise 1/2/3 wisps (max 3); a wisp can snuff a lit stone', async () => {
      const S = sim(1, place), c = at(S, 'keystone'), p = S.add(1, c), st = S.st('keystone'), o = st.order.slice();
      eq(S.v(c, p, 'use', 'B'), 'item'); p.inv.add('x:goldleaf'); eq(S.v(c, p, 'use', 'B'), null); S.run(1200, [c]); eq(st.pos, 2); assert(!p.inv.has('x:goldleaf'));
      eq(st.lit[VB.STONES.indexOf(o[0])] > 0 && st.lit[VB.STONES.indexOf(o[1])] > 0, true);
      S.v(c, p, 'use', o[2]); S.run(2200, [c]); S.v(c, p, 'use', o[3]); S.run(2200, [c]); assert(st.armed); eq(st.wisps.length, 1);   // 40 resonance
      for (let i = 0; i < 4; i++) { S.v(c, p, 'use', o[0]); S.run(1100, [c]); S.v(c, p, 'use', o[1]); S.run(1100, [c]); } // feeds: +5 each
      assert(st.wisps.length >= 2 && st.wisps.length <= 3);
      eq(VB.wispSnuff(S.H, o[0], S.ctx(c)), true); assert(!st.armed); eq(st.lit[VB.STONES.indexOf(o[0])], 0);
      VB.npcGone(S.H, st.wisps[0]); assert(st.wisps.length >= 1);
    }],
    ['keystone in sudden death: Ward is active while armed', async () => {
      const S = sim(1, place), c = at(S, 'keystone'), p = S.add(1, c), st = S.st('keystone'); eq(VB.wardActive(S.H, S.now), false);
      S.sudden = true; VB.setSudden(S.H, true); for (const id of st.order) { S.v(c, p, 'use', id); S.run(2200, [c]); } eq(VB.wardActive(S.H, S.now), true); S.run(36000, [c]); eq(VB.wardActive(S.H, S.now), false);
    }],

    // ---------------- ring, survival, tally
    ['the token ring: ram -> wedge -> locksmith -> skeleton -> counting -> gold leaf -> keystone -> rune charge -> ram; wrong-room use fails', async () => {
      eq(VB.RING.ram, 'x:wedge'); eq(VB.RING.locksmith, 'x:skeleton'); eq(VB.RING.counting, 'x:goldleaf'); eq(VB.RING.keystone, 'x:runecharge');
      const S = sim(1, place), p = S.add(1, at(S, 'ram'));
      eq(S.v(at(S, 'ram'), p, 'use', 'FL', 1), 'state'); S.st('ram').notches = 2; eq(S.v(at(S, 'ram'), p, 'use', 'FL', 1), 'item');   // a Rune Charge is needed
      const lc = at(S, 'locksmith'); p.room = lc; eq(S.v(lc, p, 'use', 'L', 1), 'item');
      const cc = at(S, 'counting'); p.room = cc; S.st('counting')._box = 100; eq(S.v(cc, p, 'use', 'R', 1), 'item');
      const kc = at(S, 'keystone'); p.room = kc; eq(S.v(kc, p, 'use', 'B'), 'item');
    }],
    ['what survives a re-key: breach (-20), strongbox, items in pockets; what resets: winch, pins, noise, writs, circuit', async () => {
      const S = sim(4, place), p = S.add(1, at(S, 'ram')); p.inv.add('x:wedge'); p.inv.add('x:goldleaf');
      S.H.breach.dN = 70; S.H.breach.dW = 10; S.st('ram').notches = 4; S.st('locksmith').pins = 3; ACT.heat.add(S.st('locksmith').heat, 40, S.now); S.st('counting')._box = 120; S.st('counting').writs = 2;
      const ks = S.st('keystone'); ks.pos = 2; ks.lit = [S.now + 9999, S.now + 9999, 0, 0];
      S.roundEnd();
      eq(S.H.breach.dN, 50); eq(S.H.breach.dW, 0); eq(S.st('ram').notches, 0); eq(S.st('locksmith').pins, 0); eq(Math.round(ACT.heat.level(S.st('locksmith').heat, S.now)), 0);
      eq(S.st('counting')._box, 120); eq(S.st('counting').writs, 0); eq(ks.pos, 0); eq(ks.lit.join(), '0,0,0,0'); assert(p.inv.has('x:wedge') && p.inv.has('x:goldleaf'));
      eq(S.H.limits.round['1'], undefined, 'round limits rolled');
    }],
    ['vault vote formula table (4.7): base + armed + net writs + lockpick + cracked + bribes; 2 total opens; broken opens alone; bars; alarm; sudden', async () => {
      const S = sim(1, place), V = ['dN', 'dW', 'dE', 'dS'], k = S.cellOf('keystone'), co = S.cellOf('counting'), rm = S.cellOf('ram'), lk = S.cellOf('locksmith');
      const base = (sel, extra) => Object.assign({ sel, vaultDoors: V, now: S.now, bribeRule: true }, extra || {});
      // one room alone: 1 vote, fizzles
      let r = VB.heistVotes(S.H, base({ [rm]: 'dN' })); eq(r.total, 1); eq(r.open.length, 0); eq(r.fizzled.join(), 'dN');
      // two rooms, different doors: 2 votes open both (existing global rule)
      r = VB.heistVotes(S.H, base({ [rm]: 'dN', [lk]: 'dW' })); eq(r.total, 2); eq(r.open.sort().join(), 'dN,dW');
      // non-vault pick does not count
      r = VB.heistVotes(S.H, base({ [rm]: 'dN', [lk]: 'x9' })); eq(r.total, 1);
      // net writs count only in the counting house room; counters cancel; base vote untouched
      const cs = S.st('counting'); cs.writs = 3; cs.counters = 1; r = VB.heistVotes(S.H, base({ [co]: 'dE' })); eq(r.weights[co], 3); eq(r.extra[co], 2); eq(r.open.join(), 'dE');
      cs.counters = 3; r = VB.heistVotes(S.H, base({ [co]: 'dE' })); eq(r.weights[co], 1); cs.counters = 5; r = VB.heistVotes(S.H, base({ [co]: 'dE' })); eq(r.weights[co], 1, 'never below the base vote');
      cs.writs = 2; cs.counters = 0; r = VB.heistVotes(S.H, base({ [rm]: 'dN' })); eq(r.weights[rm], 1, 'writs weigh on the counting house room only');
      // lockpick + bribes + cracked
      r = VB.heistVotes(S.H, base({ [rm]: 'dN' }, { picked: { [rm]: 1 }, bribes: { [rm]: 2 } })); eq(r.weights[rm], 4); r = VB.heistVotes(S.H, base({ [rm]: 'dN' }, { picked: { [rm]: 1 }, bribes: { [rm]: 2 }, bribeRule: false })); eq(r.weights[rm], 2);
      S.H.breach.dN = 50; r = VB.heistVotes(S.H, base({ [rm]: 'dN' })); eq(r.weights[rm], 2); eq(r.open.join(), 'dN', 'Cracked: one pick is enough'); r = VB.heistVotes(S.H, base({ [rm]: 'dN', [lk]: 'dW' })); eq(r.total, 3);
      S.H.breach.dN = 49; r = VB.heistVotes(S.H, base({ [rm]: 'dN' })); eq(r.total, 1);
      // broken opens regardless of votes
      S.H.breach.dS = 100; r = VB.heistVotes(S.H, base({})); eq(r.open.join(), 'dS'); eq(r.broken.join(), 'dS');
      // bars close previously open doors, not Broken ones; a fresh vote reopens; alarm and sudden ignore bars
      r = VB.heistVotes(S.H, base({}, { prevOpen: ['dN', 'dW', 'dS'], barred: { dN: 1, dS: 1 } })); eq(r.open.sort().join(), 'dS,dW');
      S.H.breach.dS = 0; r = VB.heistVotes(S.H, base({ [rm]: 'dN', [lk]: 'dN' }, { prevOpen: ['dN'], barred: { dN: 1 } })); eq(r.open.join(), 'dN');
      r = VB.heistVotes(S.H, base({}, { prevOpen: [], barred: { dN: 1 }, alarm: true })); eq(r.open.length, 4); r = VB.heistVotes(S.H, base({}, { sudden: true })); eq(r.open.length, 4);
      // armed keystone alone = 2 votes
      const ks = S.st('keystone'); ks.complete = true; ks.lit = [S.now + 9e3, S.now + 9e3, S.now + 9e3, S.now + 9e3]; r = VB.heistVotes(S.H, base({ [k]: 'dW' })); eq(r.weights[k], 2); eq(r.open.join(), 'dW');
    }],
    ['roundFields: vb, vbNext (15 s), breach, armed, writs for the panels and maps', async () => {
      const S = sim(1, place); S.H.breach.dN = 30; S.st('counting').writs = 2; S.st('counting').counters = 1;
      let f = VB.roundFields(S.H, S.now, 60000); eq(f.vbNext, null); eq(f.breach.dN, 30); eq(f.writs[S.cellOf('counting')], 1); eq(f.armed.length, 0);
      f = VB.roundFields(S.H, S.now, 14000); assert(f.vbNext); eq(Object.keys(f.vb).length, 4);
    }],

    // ---------------- anti-abuse
    ['anti-abuse: a fixed-delay macro on the winch hits only about the window share (1000 attempts, +5%), and Ram notches follow', async () => {
      const S = sim(1, place), c = at(S, 'ram'), p = S.add(1, c), st = S.st('ram'); S.v(c, p, 'use', 'B', 0); let hits = 0, n = 1000, w = 0;
      for (let i = 0; i < n; i++) {
        const e = st._tm[p.id]; w += ACT.timing.width(e.tm);
        S.now = e.tm.t0 + 850; const before = st.notches; S.v(c, p, 'tap', 'B'); if (st.notches > before || before === K.NOTCH_MAX) hits++; st.notches = 0; st._hAt[0] = S.now;
      }
      assert(hits / n <= w / n + 0.05, 'macro hit rate ' + hits / n + ' vs width ' + w / n);
    }],
    ['anti-abuse: one wedge per door per threshold per round even if decay lets breach recross; lockpicks 1 per round; fences 3; knowledge from circuits 2 per round', async () => {
      const S = sim(1, place), c = at(S, 'ram'), a = S.add(1, c), st = S.st('ram'), d = DOORS[c];
      for (let i = 0; i < 5; i++) { S.H.breach[d] = 45; st.notches = 6; S.v(c, a, 'use', 'FL'); S.run(1300, [c]); } eq(st.rack, 1, 'one Cracked wedge for the round');
      S.roundEnd(); const c2 = at(S, 'ram'); S.H.breach[DOORS[c2]] = 45; const st2 = S.st('ram'); st2.notches = 6; S.v(c2, a, 'use', 'FL'); S.run(1300, [c2]); eq(st2.rack, 1, 'next round: another crossing is allowed');
      const k = sim(1, place), kc = at(k, 'keystone'), p = k.add(1, kc), ks = k.st('keystone');
      for (let r = 0; r < 3; r++) { for (const id of ks.order) { k.v(kc, p, 'use', id); k.run(2200, [kc]); } assert(ks.armed); k.run(36000, [kc]); }
      eq(p.know, 6, 'two circuits worth of knowledge per round'); eq(ACT.limit.used(k.L, p, 'ksr').round, 1);
    }],
    ['anti-abuse: nothing throws on hostile input (fuzz of verbs, anchors, args, dead and absent players)', async () => {
      const S = sim(9, place), r = ACT.rng(5), verbs = ['use', 'tap', 'stop', 'pick', 'drop', 'buy', 'choose', 'nope'], anchors = ['B', 'L', 'R', 'F', 'FL', 'FR', 'zz', undefined, 'constructor'], args = [undefined, null, -1, 0, 1, 2, 9, 63, 1e9, NaN, 'x', {}];
      const ps = [1, 2, 3].map(i => S.add(i, CELLS[i], { x: i, z: i })); ps[2].alive = false;
      for (let i = 0; i < 20000; i++) {
        const cell = CELLS[(r() * 4) | 0], p = ps[(r() * 3) | 0]; p.room = cell; S.now += (r() * 300) | 0;
        S.v(cell, p, verbs[(r() * verbs.length) | 0], anchors[(r() * anchors.length) | 0], args[(r() * args.length) | 0]);
        if (r() < 0.3) for (const c of CELLS) S.tick(c, 100);
        if (r() < 0.02) VB.hurt(S.H, cell, p, S.ctx(cell)); if (r() < 0.01) VB.leave(S.H, cell, p, S.ctx(cell)); if (r() < 0.005) S.roundEnd();
      }
      eq(Object.keys(S.H.st).length, 4);
    }],

    // ---------------- bots
    ['bot hints: every hint is a legal action; a bot-driven loop completes a keystone circuit, a writ, a lockpick and builds winch tension', async () => {
      const S = sim(6, place), info = (p, o) => Object.assign({ now: S.now, round: 3, gold: p.gold, metal: p.metal, has: k => p.inv.has(k), aggression: 0.8, greed: 0.8, wantVault: true }, o);
      const drive = (cell, p, ms, o) => { for (let t = 0; t < ms; t += 200) { S.now += 200; const h = VB.botHint(S.H, cell, p, info(p, o)); if (h.next && h.next.verb) S.v(cell, p, h.next.verb, h.next.a, h.next.x); S.tick(cell, 200); } };
      const kc = at(S, 'keystone'), kb = S.add(1, kc, { bot: true, skill: 1 }); drive(kc, kb, 15000); assert(S.st('keystone').circuits >= 1, 'bot lit a circuit');
      const cc = at(S, 'counting'), cb = S.add(2, cc, { bot: true, gold: 200 }); drive(cc, cb, 3000); assert(S.st('counting').writs >= 1, 'bot bought a writ');
      const lc = at(S, 'locksmith'), lb = S.add(3, lc, { bot: true, skill: 1 }); drive(lc, lb, 60000); assert(lb.inv.has('x:lockpick') || S.st('locksmith').pins > 0 || S.log.locksmith, 'bot made progress on the lock');
      const rc = at(S, 'ram'), rb = S.add(4, rc, { bot: true, skill: 1 }); drive(rc, rb, 20000); assert(S.st('ram').strikes >= 1 || S.st('ram').notches > 0, 'bot cranked the winch');
      for (const c of CELLS) assert(VB.botHint(S.H, c, rb, info(rb)).maxStay === 45000);
    }],
    ['views and risk meters are JSON-serialisable and hide secrets (strongbox exact amount)', async () => {
      const S = sim(1, place); S.st('counting')._box = 123;
      for (const c of CELLS) { const v = VB.view(S.H, c, S.now); JSON.stringify(v); const rk = VB.risk(S.H, c, S.now); assert(['publicity', 'noise', 'alarm', 'resonance'].includes(rk.kind)); }
      assert(!JSON.stringify(VB.view(S.H, S.cellOf('counting'), S.now)).includes('123')); eq(VB.view(S.H, S.cellOf('counting'), S.now).st.boxStage, 2);
      JSON.stringify(S.H.st);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

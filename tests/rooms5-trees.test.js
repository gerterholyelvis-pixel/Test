// rooms5-trees.js: the 10 tree rooms on activity.js. Pure: fake clock, seeded RNG, a fake glue (ctx) with a player table. No server.
const L = require('./lib.js'), { assert, eq } = L, ACT = require('../activity.js'), T = require('../rooms5-trees.js'), K = T.K;

// ---- fake items: tiers 0..5 of weapons and armour with drop chances, plus reforged twins
const ITEMS = {};
for (let t = 0; t <= 5; t++) for (const [pre, type] of [['w', 'weapon'], ['a', 'armor']]) for (const s of ['x', 'y']) {
  ITEMS[`${pre}:t${t}${s}`] = { key: `${pre}:t${t}${s}`, type, tierN: t, chance: 5 };
  ITEMS[`${pre}:t${t}${s}+`] = { key: `${pre}:t${t}${s}+`, type, tierN: t, chance: 0, up: 1 };
}

// ---- the fake glue
function world(seed) {
  const w = { now: 100000, round: 1, sudden: false, L: ACT.limit.make(), log: {}, players: [], npcs: {}, nextNpc: 1, fx: [], toasts: [], private: [], pushes: [], spawns: [], eaten: [], dmgHurts: false, remembered: [], st: null, type: null };
  w.rng = ACT.rng(seed || 7);
  const AN = { C: { x: 0, z: 0, r: 1.1 }, NE: { x: 4.2, z: 4.2, r: 0.7 }, NW: { x: -4.2, z: 4.2, r: 0.7 }, SE: { x: 4.2, z: -4.2, r: 0.7 }, SW: { x: -4.2, z: -4.2, r: 0.7 }, ring: { x: 0, z: 0, r: 3.0 }, nook: { x: 6, z: 0, r: 0.9 } };
  const slotKey = (p, x) => x === -1 ? p.weapon : p.inv[x];
  w.ctx = {
    get now() { return w.now; }, get round() { return w.round; }, get sudden() { return w.sudden; }, rng: () => w.rng(), items: ITEMS,
    occupants: () => w.players.filter(p => p.alive),
    player: id => w.players.find(p => p.id === id) || null,
    anchor: id => AN[id] || null,
    award(p, what, src) {
      const o = ACT.award(w.L, w.log, p, what, src);
      p.know += o.know; p.gold += o.gold; if (o.item) p.inv.push(o.item); if (o.heal) p.hp = Math.min(p.maxHp, p.hp + o.heal); if (o.pulse) p.pulses.push(o.pulse);
      return o;
    },
    knowLeft: p => { const u = ACT.limit.used(w.L, p, 'know'); return Math.max(0, Math.min(24 - u.round, 80 - u.match)); },
    fx: (k, d, scope) => w.fx.push({ k, d, scope }), toastAll: t => w.toasts.push(t), toast: (p, t) => w.private.push({ id: p.id, t }),
    spawn: (kind, anchor) => { const id = w.nextNpc++; w.npcs[id] = { kind, anchor }; w.spawns.push({ kind, anchor, id }); return id; },
    npcAlive: id => !!w.npcs[id],
    dmg: (p, n, src, o) => { p.hp -= n; if (w.dmgHurts) { w.p_hurt && w.p_hurt(p); } },
    push: (p, dx, dz) => w.pushes.push({ id: p.id, dx, dz }),
    item: (p, k) => p.inv.includes(k), count: (p, k) => p.inv.filter(x => x === k).length,
    peek: (p, x) => typeof x === 'string' ? (p.inv.includes(x) ? x : null) : (slotKey(p, x) || null),
    take(p, x) {
      if (typeof x === 'string') { const i = p.inv.indexOf(x); if (i < 0) return null; p.inv.splice(i, 1); return x; }
      if (x === -1) { const k = p.weapon; p.weapon = null; return k || null; }
      if (x == null || x < 0 || x >= p.inv.length) return null; return p.inv.splice(x, 1)[0];
    },
    elixir: (p, n) => { if (p.elixir < n) return false; p.elixir -= n; return true; },
    brainOf: p => p.inv.includes('brain:goblin') ? 'goblin' : p.inv.includes('x:huskbrain') ? 'husk' : null,
    takeBrain: (p, kind) => { const k = kind === 'goblin' ? 'brain:goblin' : 'x:huskbrain', i = p.inv.indexOf(k); if (i < 0) return false; p.inv.splice(i, 1); return true; },
    eatBrain: (p, o) => w.eaten.push({ id: p.id, o }),
    remember: p => { w.remembered.push(p.id); return true; },
    intel: kind => 'secret:' + kind, recalc: () => {},
  };
  w.add = (id, at, o) => { const a = AN[at] || { x: 0, z: 0 }; const p = Object.assign({ id, name: 'G' + id, x: a.x, z: a.z, room: 'r', alive: true, hp: 100, maxHp: 100, know: 0, gold: 0, inv: [], weapon: null, elixir: 50, carry: null, yaw: 0, pulses: [], hurtAt: -1e9, lat: 0 }, o); w.players.push(p); return p; };
  w.at = (p, a) => { p.x = AN[a].x; p.z = AN[a].z; };
  w.open = type => { w.type = type; w.st = ACT.init(type, w.ctx.rng, w.now); return w.st; };
  w.v = (p, verb, a, x) => ACT.verb(w.st, w.type, p, verb, { a, x }, w.ctx);
  w.bot = (p, a, hit) => ACT.verb(w.st, w.type, p, 'tap', { a, bot: true, hit }, w.ctx);
  w.run = (ms, each) => { for (let t = 0; t < ms; t += 100) { w.now += 100; ACT.tick(w.st, w.type, w.ctx, 100); if (each) each(); } };
  w.hurt = p => { p.hurtAt = w.now; ACT.hurt(w.st, w.type, p, w.ctx); };
  w.newRound = () => { w.round++; ACT.limit.newRound(w.L); };
  return w;
}

(async () => {
  const fail = await L.run('rooms5-trees', [
    // ------------------------------------------------------------ the roll
    ['all ten types are registered with a tree spec, anchors, yield and a bot hint', async () => {
      eq(T.TYPES.length, 10); eq(Object.values(T.WEIGHTS).reduce((a, b) => a + b, 0), 100);
      for (const t of T.TYPES) { const s = ACT.get(t); assert(s && s.kind === 'tree', t); assert(s.anchors && s.yield && typeof s.state0 === 'function' && typeof s.bot.score === 'function' && typeof s.bot.next === 'function' && s.bot.maxStay > 0, t + ' spec incomplete'); assert(typeof ACT.init(t, ACT.rng(1), 0) === 'object'); assert(typeof JSON.stringify(ACT.init(t, ACT.rng(1), 0)) === 'string'); }
    }],
    ['roll: 4 distinct types, deterministic with the same rng, the first slot follows the weights (chi-square), inclusion follows the weights', async () => {
      const r = ACT.rng(12345), N = 40000, first = {}, incl = {};
      for (let i = 0; i < N; i++) { const o = T.rollTrees(r); eq(o.length, 4); eq(new Set(o).size, 4, 'duplicate in ' + o); for (const t of o) assert(T.TYPES.includes(t)); first[o[0]] = (first[o[0]] || 0) + 1; for (const t of o) incl[t] = (incl[t] || 0) + 1; }
      let chi = 0; for (const t of T.TYPES) { const e = N * T.WEIGHTS[t] / 100; chi += (((first[t] || 0) - e) ** 2) / e; }
      assert(chi < 27.88, 'chi-square ' + chi.toFixed(1) + ' (df 9, p .001)');
      const order = T.TYPES.slice().sort((a, b) => incl[b] - incl[a]);
      assert(incl.well > incl.press && incl.press > incl.spring && incl.spring > incl.seer && incl.seer > incl.graft && incl.graft > incl.thorn && incl.thorn > incl.gambler && incl.gambler > incl.memory && incl.memory > incl.oak && incl.oak > incl.elder, 'inclusion order ' + order);
      assert(incl.elder / N > 0.03 && incl.elder / N < 0.12, 'elder inclusion ' + incl.elder / N);   // 2% weight, 4 draws without replacement
      eq(T.rollTrees(ACT.rng(9)), T.rollTrees(ACT.rng(9))); eq(new Set(T.rollTrees(ACT.rng(3), 10)).size, 10);
    }],

    // ------------------------------------------------------------ 1. Well
    ['well: crank 3 hits, drink for 3 knowledge, 4 drinks per round, the pool refills, a new round resets', async () => {
      const w = world(), a = w.add(1, 'NE'), st = w.open('well');
      eq(w.v(a, 'use', 'NE'), null); assert(st._tm && st._tm.by === 1);
      for (let i = 0; i < 3; i++) { w.now += 500; eq(w.bot(a, 'NE', true), null); }
      assert(st.ready && st.ready.by === 1);
      eq(w.v(a, 'choose', 'NE', 0), null); eq(a.know, 3);
      for (let d = 1; d < 4; d++) { w.v(a, 'use', 'NE'); for (let i = 0; i < 3; i++) { w.now += 500; w.bot(a, 'NE', true); } eq(w.v(a, 'choose', 'NE', 0), null); }
      eq(a.know, 12);
      eq(w.v(a, 'use', 'NE'), 'cool', 'pool of 4 is empty');
      w.run(13000); w.newRound(); eq(w.v(a, 'use', 'NE'), null);   // one bucket refilled, new round limit
      for (let i = 0; i < 3; i++) { w.now += 500; w.bot(a, 'NE', true); } eq(w.v(a, 'choose', 'NE', 0), null); eq(a.know, 15);
    }],
    ['well: a real skill press judged by the server (window centre hits, the opposite phase misses), a miss sloshes a notch back', async () => {
      const w = world(), a = w.add(1, 'NE'), st = w.open('well'); w.v(a, 'use', 'NE');
      const hitAt = tm => { let t = tm.t0 + ((tm.a + tm.win / 2) % 1) * tm.per; while (t < w.now + 450) t += tm.per; return t; };
      w.now = hitAt(st._tm); eq(w.v(a, 'tap', 'NE'), null); eq(st.notch, 1);
      const tm = st._tm; let t = tm.t0 + ((tm.a + 0.5) % 1) * tm.per; while (t < w.now + 450) t += tm.per; w.now = t;   // half a cycle from the window start: well outside the 30% window
      eq(w.v(a, 'tap', 'NE'), null); eq(st.notch, 0, 'miss sloshes one notch back');
    }],
    ['well: presses closer than 400 ms are refused (no spam), and only the crank holder can tap', async () => {
      const w = world(), a = w.add(1, 'NE'), b = w.add(2, 'NE'), st = w.open('well'); w.v(a, 'use', 'NE');
      w.now += 500; eq(w.bot(a, 'NE', true), null); w.now += 100; eq(w.bot(a, 'NE', true), 'cool'); eq(w.bot(b, 'NE', true), 'state'); eq(w.v(b, 'use', 'NE'), 'busy');
    }],
    ['well: carry a bucket, pour four times, the fruit ripens, a rival steals it (+12), the sapling resets; a hit spills the bucket', async () => {
      const w = world(), a = w.add(1, 'NE'), b = w.add(2, 'C'), st = w.open('well');
      for (let n = 0; n < 4; n++) {
        w.at(a, 'NE'); if (n === 2) { w.round++; ACT.limit.newRound(w.L); }
        w.v(a, 'use', 'NE'); for (let i = 0; i < 3; i++) { w.now += 500; w.bot(a, 'NE', true); }
        eq(w.v(a, 'choose', 'NE', 1), null); assert(a.carry && a.carry.tok === 'bucket'); eq(w.v(a, 'use', 'NE'), 'carry');
        w.at(a, 'C'); eq(w.v(a, 'use', 'C'), null); w.run(1200); eq(a.carry, null); eq(st.stage, n + 1);
        if (n < 3) w.run(12000);
      }
      assert(st.ripe, 'fruit ripe at stage 4'); eq(a.know, 0, 'watering pays nothing itself');
      w.at(a, 'NE'); w.run(0);
      eq(w.v(b, 'use', 'C'), null); w.run(1600); eq(b.know, 12); assert(!st.ripe); eq(st.stage, 0);
      // spill
      w.at(a, 'NE'); w.run(12000); w.v(a, 'use', 'NE'); for (let i = 0; i < 3; i++) { w.now += 500; w.bot(a, 'NE', true); }
      w.v(a, 'choose', 'NE', 1); assert(a.carry); w.hurt(a); eq(a.carry, null, 'a hit spills the bucket (light carry: gone)');
    }],
    ['well: a hit breaks the fruit channel, leaving the room spills and releases; an idle crank is released after 6 s', async () => {
      const w = world(), a = w.add(1, 'C'), b = w.add(2, 'NE'), st = w.open('well'); st.ripe = true; st.stage = 4;
      eq(w.v(a, 'use', 'C'), null); w.run(500); w.hurt(a); w.run(1500); eq(a.know, 0); assert(st.ripe);
      w.v(b, 'use', 'NE'); assert(st.crank); w.run(6200); eq(st.crank, null);
      st.ready = { by: 2, t: w.now }; ACT.leave(st, 'well', b, w.ctx); eq(st.ready, null);
      b.carry = { tok: 'bucket', heavy: false }; ACT.leave(st, 'well', b, w.ctx); eq(b.carry, null);
    }],

    // ------------------------------------------------------------ 2. Press
    ['press: a goblin brain pressed in 3 s eats at 10% (exempt), a husk brain pays +4 knowledge, 6 husk presses per round', async () => {
      const w = world(), a = w.add(1, 'C'), st = w.open('press');
      a.inv.push('brain:goblin'); eq(w.v(a, 'use', 'C'), null); w.run(2800); eq(w.eaten.length, 0); w.run(400);
      eq(w.eaten.length, 1); eq(w.eaten[0].o.pct, 0.10); eq(a.inv.includes('brain:goblin'), false);
      eq(w.v(a, 'use', 'C'), 'item');
      for (let i = 0; i < 7; i++) a.inv.push('x:huskbrain');
      for (let i = 0; i < 6; i++) { eq(w.v(a, 'use', 'C'), null, 'press ' + i); w.run(3200); }
      eq(a.know, 24, '6 pressed husk brains at 4 = exactly the round cap'); eq(w.v(a, 'use', 'C'), 'cap');
      w.newRound(); a.inv = ['x:huskbrain']; eq(w.v(a, 'use', 'C'), null, 'a new round: limit and cap are back');
    }],
    ['press: husks climb out every 25 s (first 10 s after entry), at most 3 alive, only while someone is in the room; kills free a slot', async () => {
      const w = world(), st = w.open('press'); w.run(60000); eq(w.spawns.length, 0, 'empty room brews nothing');
      const a = w.add(1, 'C'); w.run(9800); eq(w.spawns.length, 0); w.run(400); eq(w.spawns.length, 1); w.run(25000); eq(w.spawns.length, 2); w.run(25000); eq(w.spawns.length, 3);
      w.run(60000); eq(w.spawns.length, 3, 'max 3 alive'); assert(w.spawns.every(s => s.kind === 'husk' && ['NE', 'NW', 'SW'].includes(s.anchor)));
      ACT.kill(st, 'press', a, { npc: true, id: w.spawns[0].id }, w.ctx); delete w.npcs[w.spawns[0].id]; w.run(200); eq(w.spawns.length, 4, 'a freed slot refills at once (no backlog beyond one)');
      assert(ACT.get('press').npc.husk.loot[0] === 'x:huskbrain');
    }],
    ['press: rousing a husk costs 6 elixir, has a 10 s cooldown and respects the cap', async () => {
      const w = world(), a = w.add(1, 'NE'), st = w.open('press'); w.run(200);
      eq(w.v(a, 'buy', 'NE'), null); eq(a.elixir, 44); eq(w.v(a, 'buy', 'NW'), 'cool'); w.run(10100); eq(w.v(a, 'buy', 'NW'), null); w.run(10100); w.run(10100);
      w.st.w.alive.push(98, 99); eq(w.v(a, 'buy', 'NE'), 'busy', '3 alive'); a.elixir = 0; eq(w.v(a, 'buy', 'C'), 'state');
    }],

    // ------------------------------------------------------------ 3. Spring
    ['spring: a lone unhurt goblin heals 2 HP/s, two goblins in the pool freeze it, a hit pauses it for 1.5 s, full health gains nothing', async () => {
      const w = world(), a = w.add(1, 'ring', { hp: 40 }), st = w.open('spring'); w.at(a, 'ring'); a.x = 1;
      w.run(10000); assert(a.hp >= 56 && a.hp <= 60, 'hp ' + a.hp);
      const b = w.add(2, 'ring'); b.x = -1; b.hp = 40; const h = a.hp; w.run(5000); eq(a.hp, h, 'contested'); eq(b.hp, 40); assert(st.cap.contested);
      b.alive = false; w.run(500); a.hp = 50; w.hurt(a); w.run(1000); eq(a.hp, 50, 'hit pause'); w.run(2500); assert(a.hp > 50);
      a.hp = a.maxHp; w.run(5000); eq(a.hp, 100); eq(w.log['spring:pool'].heal > 0, true);
    }],
    ['spring: basins bottle water (2 s), 3 per round, 2 carried, 25 s refill, blessed water costs 6 elixir, off in sudden death', async () => {
      const w = world(), a = w.add(1, 'NE'), st = w.open('spring');
      eq(w.v(a, 'use', 'NE'), null); w.run(1900); eq(a.inv.length, 0); w.run(200); eq(a.inv, ['x:springwater']);
      eq(w.v(a, 'use', 'NE'), 'cool', 'basin empty'); w.at(a, 'SE'); eq(w.v(a, 'buy', 'SE'), null); w.run(2200); eq(a.inv, ['x:springwater', 'x:blessedwater']); eq(a.elixir, 44);
      w.at(a, 'SW'); eq(w.v(a, 'use', 'SW'), 'carry'); a.inv.length = 0; eq(w.v(a, 'use', 'SW'), null); w.run(2200);
      w.at(a, 'NE'); w.run(25000); eq(w.v(a, 'use', 'NE'), 'cap', '3 per round'); w.newRound(); a.inv.length = 0; eq(w.v(a, 'use', 'NE'), null);
      w.sudden = true; eq(w.v(a, 'use', 'NE'), 'state');
      const b = w.add(2, 'ring', { hp: 30 }); b.x = 1; w.run(5000); eq(b.hp, 30, 'no healing in sudden death');
    }],

    // ------------------------------------------------------------ 4. Seer
    ['seer: three rings solve to the eye, only the ring-turners are paid, per-goblin 3 per round with the 3 tiers, never the bystander', async () => {
      const w = world(), a = w.add(1, 'NE'), b = w.add(2, 'NW'), c = w.add(3, 'SE'), st = w.open('seer'), solveWith = who => {
        let guard = 0; const target = st.d.target.slice();
        while (guard++ < 40) {
          const i = st.d.v.findIndex((x, j) => x !== st.d.target[j]); if (i < 0) break;
          const at = ['NE', 'NW', 'SE'][i]; w.now += 600; const p = who(i); w.at(p, at); eq(w.v(p, 'use', at), null);
          if (st.d.target.some((t, j) => t !== target[j])) break;
        }
        return target;
      };
      solveWith(i => i === 0 ? a : b);
      eq(a.know, 3); eq(b.know, 3); eq(c.know, 0); eq(a.pulses[0].picks, true); assert(w.toasts.some(t => /consulted the Seer/.test(t)));
      assert(st.d.target.every((t, j) => t !== st.d.v[j]), 'new targets all differ from the rings');
      solveWith(() => a); eq(a.know, 6); assert(a.pulses[1].vbNext); eq(b.know, 3, 'b did not turn in solve 2');
      solveWith(() => a); eq(a.know, 6); eq(a.pulses[2].hp, true, 'third solve: pulse with HP, no knowledge');
      solveWith(() => a); eq(a.pulses.length, 3, 'fourth solve pays nothing'); eq(st.solves, 4);
      w.newRound(); solveWith(() => a); eq(a.pulses.length, 4, 'the limit rolls over'); eq(a.know, 9);
    }],
    ['seer: a goblin can turn at most once per 500 ms; the targets stay out of the way of the viewer only through `_` keys (none leaked here)', async () => {
      const w = world(), a = w.add(1, 'NE'), st = w.open('seer'); eq(w.v(a, 'use', 'NE'), null); eq(w.v(a, 'use', 'NE'), 'cool'); w.now += 500; eq(w.v(a, 'use', 'NE'), null);
      eq(w.v(a, 'use', 'C'), 'state'); eq(w.v(a, 'tap', 'NE'), 'state'); const v = ACT.view(st, 'seer'); assert(v.target && !('_turn' in v) && !('_cd' in v));
    }],

    // ------------------------------------------------------------ 5. Graft
    ['graft: cut scions (2 s, max 2 carried), graft a weapon into its + twin in 6 s, 2 grafts per round, a reforged item is refused', async () => {
      const w = world(), a = w.add(1, 'C'), st = w.open('graft'); a.inv.push('w:t2x', 'a:t1y');
      eq(w.v(a, 'use', 'C'), null); w.run(1900); eq(a.inv.filter(x => x === 'x:scion').length, 0); w.run(300); eq(a.inv.filter(x => x === 'x:scion').length, 1);
      eq(w.v(a, 'use', 'C'), null); w.run(2200); eq(w.v(a, 'use', 'C'), 'cap', 'two carried');
      w.at(a, 'NE'); eq(w.v(a, 'choose', 'NE', 0), null); eq(a.inv.includes('w:t2x'), false); eq(a.inv.filter(x => x === 'x:scion').length, 1);
      eq(w.v(a, 'use', 'NE'), 'busy'); eq(w.v(a, 'choose', 'NE', 0), 'busy');
      w.run(6100); eq(w.v(a, 'use', 'NE'), null); assert(a.inv.includes('w:t2x+'));
      const plus = a.inv.indexOf('w:t2x+'); a.inv.push('x:scion'); eq(w.v(a, 'choose', 'NE', plus), 'item', 'no stacking'); eq(w.v(a, 'choose', 'NE', 99), 'item');
      a.inv.splice(plus, 1); const slot = a.inv.indexOf('a:t1y'); eq(w.v(a, 'choose', 'NE', slot), null); w.run(6100); eq(w.v(a, 'use', 'NE'), null); assert(a.inv.includes('a:t1y+'));
      a.inv.push('x:scion', 'w:t0x'); eq(w.v(a, 'choose', 'NE', a.inv.indexOf('w:t0x')), 'cap', '2 per round'); w.newRound(); eq(w.v(a, 'choose', 'NE', a.inv.indexOf('w:t0x')), null);
    }],
    ['graft: the vise holds the result on the prop; a thief waits out the 4 s owner window; branches regrow in 30 s', async () => {
      const w = world(), a = w.add(1, 'NE'), t = w.add(2, 'NE'), st = w.open('graft'); a.inv.push('w:t3x', 'x:scion'); eq(w.v(a, 'choose', 'NE', 0), null);
      assert(ACT.view(st, 'graft').vise.item === 'w:t3x'); eq(w.v(t, 'use', 'NE'), 'busy'); w.run(6100); eq(w.v(t, 'use', 'NE'), 'cool'); w.run(4000); eq(w.v(t, 'use', 'NE'), null); eq(t.inv, ['w:t3x+']);
      w.at(a, 'C'); const cut = () => { eq(w.v(a, 'use', 'C'), null); w.run(2200); a.inv = a.inv.filter(x => x !== 'x:scion'); };
      for (let i = 0; i < 4; i++) cut(); eq(w.v(a, 'use', 'C'), 'cool', 'all four branches cut'); w.run(30100); eq(w.v(a, 'use', 'C'), null);
    }],

    // ------------------------------------------------------------ 6. Thorn
    ['thorn: choose a blessing, grip 4 HP/s, tiers at 3/6/9 s, release banks it until the end of next round, a short grip banks nothing', async () => {
      const w = world(), a = w.add(1, 'C'), st = w.open('thorn');
      eq(w.v(a, 'use', 'C'), 'state', 'the first grip asks which blessing'); assert(ACT.get('thorn').me(st, a, w.ctx).needChoice);
      eq(w.v(a, 'choose', 'C', 5), 'state'); eq(w.v(a, 'choose', 'C', 1), null);
      eq(w.v(a, 'use', 'C'), null); w.run(2500); w.v(a, 'stop', 'C'); eq(a.bless, undefined, 'under 3 s banks nothing'); assert(a.hp < 100);
      w.run(200); eq(w.v(a, 'use', 'C'), null); w.run(6200); w.v(a, 'stop', 'C'); eq(a.bless.k, 'bark'); eq(a.bless.tier, 2); eq(a.bless.until, 2);
      eq(T.blessing(a, 2).v, 0.15); eq(T.blessing(a, 3), null, 'expired after the next round'); eq(w.v(a, 'use', 'C'), 'cap', '2 grips per round');
      w.newRound(); eq(w.v(a, 'use', 'C'), 'state', 'a new round asks again'); w.v(a, 'choose', 'C', 2); a.hp = 100; w.v(a, 'use', 'C'); w.run(12000); eq(a.bless.k, 'thorns'); eq(a.bless.tier, 3); eq(st.grip, null, 'auto-release at tier III'); eq(a.hp, 100 - 36, '9 s at 4 HP/s');
    }],
    ['thorn: a grip never kills (releases at 1 HP), a hit from someone else breaks it with nothing banked, the grip\'s own damage does not', async () => {
      const w = world(), a = w.add(1, 'C', { hp: 10 }), st = w.open('thorn'); w.v(a, 'choose', 'C', 0); w.p_hurt = p => ACT.hurt(st, 'thorn', p, w.ctx); w.dmgHurts = true;
      w.v(a, 'use', 'C'); w.run(8000); assert(a.hp >= 1 && a.alive); eq(a.hp, 1); eq(st.grip, null); eq(a.bless, undefined, 'under tier I, nothing');
      const b = w.add(2, 'C'); w.v(b, 'choose', 'C', 0); w.v(b, 'use', 'C'); w.run(3500); assert(st.grip && st.grip.by === 2, 'own damage did not break the grip'); w.hurt(b); eq(st.grip, null); eq(b.bless, undefined);
      w.round = 2; w.v(b, 'choose', 'C', 0); w.v(b, 'use', 'C'); w.run(4000); b.alive = false; w.run(200); eq(st.grip, null);
    }],
    ['thorn: kills in the room fill the blood bowl (max 3), drinking pays 5 knowledge per drop under the cap, not for the killer\'s own death', async () => {
      const w = world(), a = w.add(1, 'SE'), st = w.open('thorn'); eq(w.v(a, 'use', 'SE'), 'state');
      for (let i = 0; i < 5; i++) ACT.kill(st, 'thorn', { id: 9 }, { id: 10 + i, npc: true }, w.ctx); ACT.kill(st, 'thorn', { id: 9 }, { id: 9 }, w.ctx); eq(st.bowl, 3);
      eq(w.v(a, 'use', 'SE'), null); w.run(1200); eq(a.know, 15); eq(st.bowl, 0);
    }],

    // ------------------------------------------------------------ 7. Gambler
    ['gambler: a feed chews 1.5 s then spits a random item one tier up (success) onto the stump; the owner picks it up; riding goes up the odds ladder', async () => {
      const w = world(), a = w.add(1, 'C'), st = w.open('gambler'); a.inv.push('w:t1x'); w.rng = () => 0.0;   // every roll succeeds
      eq(w.v(a, 'choose', 'C', 0), null); eq(a.inv, []); w.run(1400); eq(st.stump, null); w.run(200); assert(st.stump && ITEMS[st.stump.key].tierN === 2 && ITEMS[st.stump.key].type === 'weapon' && !ITEMS[st.stump.key].up);
      eq(w.v(a, 'use', 'C'), null); w.run(1700); eq(ITEMS[st.stump.key].tierN, 3); eq(st.stump.step, 2);
      w.rng = () => 0.99; eq(w.v(a, 'use', 'C'), null); w.run(1700); eq(st.stump, null); eq(st.hoard, 1, 'swallowed into a gourd'); eq(a.inv, [], 'the item is gone');
    }],
    ['gambler: take the stump at once; a stranger waits out the 8 s owner window; 4 feeds per goblin per round; non-gear and tier 5 refused; elixir boost', async () => {
      const w = world(), a = w.add(1, 'C'), t = w.add(2, 'C'), st = w.open('gambler'); w.rng = () => 0.0; a.inv.push('x:potion', 'a:t5x', 'w:t0x');
      eq(w.v(a, 'choose', 'C', 0), 'item'); eq(w.v(a, 'choose', 'C', 1), 'item'); eq(w.v(a, 'choose', 'C', 99), 'item');
      eq(w.v(a, 'choose', 'C', 2), null); eq(w.v(t, 'choose', 'C', 0), 'busy'); w.run(1700);
      eq(w.v(t, 'pick', 'C'), 'cool'); eq(w.v(t, 'use', 'C'), 'state', 'only the owner rides'); w.run(8000); eq(w.v(t, 'pick', 'C'), null); assert(t.inv.length === 1);
      a.inv = ['w:t0x', 'w:t0y', 'w:t1x', 'w:t1y', 'w:t0x'];
      for (let i = 0; i < 3; i++) { eq(w.v(a, 'choose', 'C', 0), null); w.run(1700); eq(w.v(a, 'pick', 'C'), null); a.inv.shift(); a.inv.unshift('w:t0x'); }
      eq(w.v(a, 'choose', 'C', 0), 'cap'); w.newRound(); a.elixir = 5; eq(w.v(a, 'buy', 'C', 0), 'cost'); a.elixir = 20; eq(w.v(a, 'buy', 'C', 0), null); eq(a.elixir, 10);
    }],
    ['gambler: the hoard fills one gourd per swallowed item; the prize (tier 3+) goes to the next goblin who already fed this round, never to the one who filled the last gourd', async () => {
      const w = world(), a = w.add(1, 'C'), b = w.add(2, 'C'), st = w.open('gambler'); w.rng = () => 0.99;
      for (let r = 0; r < 2; r++) { for (let i = 0; i < (r ? 1 : 4); i++) { a.inv = ['w:t1x']; eq(w.v(a, 'choose', 'C', 0), null); w.run(1700); } w.newRound(); }
      eq(st.hoard, 5); eq(st._hoardBy, 1);
      a.inv = ['w:t0x']; eq(w.v(a, 'choose', 'C', 0), null); w.run(1700); eq(st.hoard, 5, 'the filler gets no prize (and her swallow is capped at 5)'); w.rng = () => 0.99;
      b.inv = ['w:t0x', 'w:t0y']; eq(w.v(b, 'choose', 'C', 0), null); w.run(1700); eq(st.hoard, 5, 'b fed for the first time this round: no prize yet'); if (st.stump) w.v(b, 'pick', 'C');
      eq(w.v(b, 'choose', 'C', 0), null); w.run(1700); eq(st.hoard, 0, 'prize'); assert(st.stump && st.stump.prize && ITEMS[st.stump.key].tierN >= 3);
      assert(w.toasts.some(t => /hoard/.test(t)));
    }],

    // ------------------------------------------------------------ 8. Memory
    ['memory: the tree shows 3 flashes, you repeat them (+5), the length grows with your successes, 3 successes per round, 6 s room cooldown', async () => {
      const w = world(), a = w.add(1, 'C'), st = w.open('memory'), play = () => {
        eq(w.v(a, 'use', 'C'), null); const seq = st.show.slice(); eq(st.phase, 'show'); eq(ACT.view(st, 'memory').show, seq);
        w.run(seq.length * 700 + 100); eq(st.phase, 'input'); eq(ACT.view(st, 'memory').show, null, 'hidden while you play');
        for (const x of seq) { w.at(a, x); eq(w.v(a, 'use', x), null); } w.at(a, 'C'); return seq.length;
      };
      eq(play(), 3); eq(a.know, 5); eq(w.v(a, 'use', 'C'), 'cool'); w.run(6100);
      eq(play(), 4); eq(a.know, 11); w.run(6100);
      eq(play(), 5); eq(a.know, 18, 'the third success: Remembrance grants a perk (stub), so no +10'); eq(w.remembered, [1]); w.run(6100);
    }],
    ['memory: Remembrance once per match on the 3rd success (perk, or +10 knowledge if refused); 3 successes per round', async () => {
      const w = world(), a = w.add(1, 'C'), st = w.open('memory'); w.ctx.remember = () => false;
      const play = () => { eq(w.v(a, 'use', 'C'), null); const seq = st.show.slice(); w.run(seq.length * 700 + 100); for (const x of seq) { w.at(a, x); w.v(a, 'use', x); } w.at(a, 'C'); w.run(6100); return seq.length; };
      play(); play(); const k = a.know; play(); eq(a.know - k, 7 + 6, 'length 5 pays 7; Remembrance falls back to +10 but only 6 are left under the round cap (24)');
      eq(w.v(a, 'use', 'C'), 'cap'); w.newRound(); const k2 = a.know; w.round = 2; play(); assert(a.know - k2 > 0 && a.know - k2 <= 9, 'new round, length 6, no second Remembrance');
    }],
    ['memory: a wrong lantern, a touch during the show, another goblin touching a lantern, the 12 s deadline and leaving all break the run', async () => {
      const w = world(), a = w.add(1, 'C'), b = w.add(2, 'NE'), st = w.open('memory');
      const start = () => { w.run(6100); eq(w.v(a, 'use', 'C'), null); return st.show.slice(); };
      let seq = start(); eq(w.v(a, 'use', 'NE'), null); eq(st.run, null, 'a touch during the show breaks it');
      seq = start(); w.run(seq.length * 700 + 100); const wrong = ['NE', 'NW', 'SE', 'SW'].find(x => x !== seq[0]); eq(w.v(a, 'use', wrong), null); eq(st.run, null); eq(a.know, 0);
      seq = start(); w.run(seq.length * 700 + 100); eq(w.v(a, 'use', seq[0]), null); eq(w.v(b, 'use', 'NE'), null); eq(st.run, null, 'sabotage'); eq(w.v(b, 'use', 'NE'), 'state');
      seq = start(); w.run(seq.length * 700 + 12100); eq(st.run, null, 'deadline');
      seq = start(); ACT.leave(st, 'memory', a, w.ctx); eq(st.run, null); eq(a.know, 0);
    }],

    // ------------------------------------------------------------ 9. Oak
    ['oak: 3 s alone and unhurt in the nook makes you Warden; a second goblin or a hit removes it; the identity stays secret', async () => {
      const w = world(), a = w.add(1, 'nook'), st = w.open('oak'); a.x = 6; a.z = 0;
      w.run(2800); eq(st.warden, null); w.run(400); eq(st.warden, 1); eq(ACT.view(st, 'oak'), { held: true, contested: false }); assert(ACT.get('oak').me(st, a).warden);
      w.hurt(a); eq(st.warden, null); eq(w.pushes.length, 1); w.run(2000); eq(st.warden, null, 'a hit blocks 3 s'); w.run(1500); eq(st.warden, null); w.run(3000); eq(st.warden, 1);
      const b = w.add(2, 'nook'); b.x = 6.3; w.run(200); eq(st.warden, null, 'two in the nook'); b.alive = false; w.run(3500); eq(st.warden, 1);
      a.x = 0; w.run(200); eq(st.warden, null);
    }],
    ['oak: whispers every 8 s pay +2 only while looking around (30 degrees in 10 s), 6 per round; a stare pays nothing', async () => {
      const w = world(), a = w.add(1, 'nook'), st = w.open('oak'); a.x = 6; a.z = 0;
      w.run(3200); eq(st.warden, 1); w.run(8200); assert(w.private.length >= 1 && /^secret:/.test(w.private[0].t)); eq(a.know, 0, 'yaw never changed: AFK');
      let i = 0; const spin = () => { a.yaw = (i++ % 30) * 0.03; };
      w.run(8000, spin); eq(a.know, 2); w.run(8000, spin); eq(a.know, 4);
      for (let n = 0; n < 8; n++) w.run(8000, spin); eq(a.know, 12, '6 per round'); w.newRound(); w.run(8000, spin); eq(a.know, 14);
      assert(new Set(w.private.map(x => x.t)).size > 3, 'whispers rotate through the kinds');
    }],
    ['oak: the ambush bonus (+50%) once per goblin per round, only against goblins who entered after the Warden', async () => {
      const w = world(), a = w.add(1, 'nook'), early = w.add(2, 'C'), st = w.open('oak'); a.x = 6; a.z = 0; w.run(3400);
      const late = w.add(3, 'C'); w.run(200); const oak = ACT.get('oak');
      eq(oak.ambushMul(st, a, early, w.ctx), 1, 'was there first'); eq(oak.ambushMul(st, a, late, w.ctx), 1.5); eq(oak.ambushMul(st, a, late, w.ctx), 1); eq(oak.ambushMul(st, late, a, w.ctx), 1);
      w.newRound(); w.round = 2; eq(oak.ambushMul(st, a, late, w.ctx), 1.5);
    }],

    // ------------------------------------------------------------ 10. Elder
    ['elder: three goblins light three stones in 20 s, the Elder wakes (5 s, announced), the first at the seed gets 25 knowledge and a tier 3+ item exempt from the cap', async () => {
      const w = world(), g = ['NE', 'NW', 'SE'].map((s, i) => w.add(i + 1, s)), st = w.open('elder'); w.ctx.knowLeft = () => 0;
      g.forEach((p, i) => eq(w.v(p, 'use', ['NE', 'NW', 'SE'][i]), null));
      w.run(19500); eq(st.phase, 'stones'); w.run(1000); eq(st.phase, 'waking'); assert(w.toasts.includes('The Elder Tree is waking'));
      w.run(4000); eq(st.phase, 'waking'); w.run(1500); eq(st.phase, 'seed');
      w.at(g[0], 'C'); w.at(g[1], 'C'); eq(w.v(g[0], 'use', 'C'), null); eq(w.v(g[1], 'use', 'C'), 'busy'); w.run(2200);
      eq(g[0].know, 25, 'exempt from the knowledge cap'); assert(ITEMS[g[0].inv[0]].tierN >= 3); eq(g[1].know, 0); eq(st.phase, 'stones'); eq(st.wakes, 1);
      assert(st.stones.every(s => !s.lit && s.prog === 0));
    }],
    ['elder: waking 2 and 3 need 30 s per stone and pay 12 / 6; after the third the tree withers and becomes a Sapling Well next round', async () => {
      const w = world(), g = ['NE', 'NW', 'SE'].map((s, i) => w.add(i + 1, s)), st = w.open('elder'), pa = ['NE', 'NW', 'SE'];
      const wake = (n, ms, prize) => { g.forEach((p, i) => { w.at(p, pa[i]); eq(w.v(p, 'use', pa[i]), null); }); w.run(ms - 500); eq(st.phase, 'stones', 'wake ' + n); w.run(1000); eq(st.phase, 'waking'); w.run(5600); eq(st.phase, 'seed'); w.at(g[0], 'C'); w.v(g[0], 'use', 'C'); w.run(2200); };
      wake(1, 20000); wake(2, 30000); eq(g[0].know, 25 + 12); wake(3, 30000); eq(g[0].know, 25 + 12 + 6); eq(st.phase, 'withered'); eq(st.become, null); w.run(500);
      w.round = 2; w.run(200); eq(st.become, 'well'); eq(w.v(g[0], 'use', 'NE'), 'state');
      assert(ITEMS[g[0].inv[2]].tierN >= 1);
    }],
    ['elder: stone progress survives a broken channel, rootlings climb out every 20 s of channelling (max 2), none while idle', async () => {
      const w = world(), a = w.add(1, 'NE'), st = w.open('elder'); eq(w.v(a, 'use', 'NE'), null);
      w.run(10000); w.hurt(a); w.run(300); eq(st.chs.stone0.by, null); assert(st.stones[0].prog >= 9800 && st.stones[0].prog <= 10100, 'prog ' + st.stones[0].prog);
      w.run(60000); eq(w.spawns.length, 0, 'idle: no rootlings'); eq(w.v(a, 'use', 'NE'), null); w.run(10300); eq(st.stones[0].lit, true); eq(w.spawns.length, 0, 'under 20 s of channelling in a row');
      eq(w.v(a, 'use', 'NW'), null); w.at(a, 'NW'); w.run(1); const b = w.add(2, 'SE'); eq(w.v(b, 'use', 'SE'), null); w.run(20500); eq(w.spawns.length, 1); eq(w.spawns[0].kind, 'rootling'); assert(['NW', 'SE'].includes(w.spawns[0].anchor));
      w.run(20100); w.run(0);
      assert(w.spawns.length <= 2); assert(ACT.get('elder').npc.rootling.hp === 40);
    }],

    // ------------------------------------------------------------ the caps and the economy
    ['knowledge caps: 24 per round and 80 per match across rooms and sources; the Elder and goblin brains are exempt; a capped goblin is told', async () => {
      const w = world(), a = w.add(1, 'NE'), wl = [], mem = [];
      let total = 0;
      for (let r = 1; r <= 7; r++) {
        const before = a.know;
        for (const o of [w.ctx.award(a, { know: 20 }, 'x:a'), w.ctx.award(a, { know: 20 }, 'x:b')]) assert(o.know >= 0);
        const gain = a.know - before; assert(gain <= 24, 'round ' + r + ' gain ' + gain); total = a.know; w.newRound();
      }
      eq(total, 80, '80 per match'); assert(w.log['x:b'].know < w.log['x:a'].know + 1);
      const o = w.ctx.award(a, { know: 25, exempt: true }, 'elder:1'); eq(o.know, 25); eq(a.know, 105);
      // the rooms report the cap: drinking at the well with no allowance left
      const w2 = world(), p = w2.add(1, 'NE'), st2 = w2.open('well'); w2.ctx.award(p, { know: 24 }, 'x'); w2.v(p, 'use', 'NE'); for (let i = 0; i < 3; i++) { w2.now += 500; w2.bot(p, 'NE', true); }
      eq(w2.v(p, 'choose', 'NE', 0), 'cap', 'capped goblin cannot drink, the bucket stays'); assert(st2.ready);
      // partial pay: 1 left, the fruit pays 1 and the room hears "capped"
      const w3 = world(), q = w3.add(1, 'C'), st3 = w3.open('well'); st3.ripe = true; w3.ctx.award(q, { know: 23 }, 'x'); w3.v(q, 'use', 'C'); w3.run(1700); eq(q.know, 24); assert(w3.fx.some(f => f.k === 'capped'));
    }],
    ['economy: a perfect goblin spending a whole 120 s round in any one room stays inside the declared yield and the 24 knowledge round cap', async () => {
      // well: crank + drink every time the pool allows
      let w = world(), a = w.add(1, 'NE'); w.open('well');
      const crank = () => { if (w.v(a, 'use', 'NE')) return false; for (let i = 0; i < 3; i++) { w.now += 450; w.bot(a, 'NE', true); } return true; };
      for (let s = 0; s < 120; s += 3) { if (crank()) w.v(a, 'choose', 'NE', 0); w.run(3000 - 1350); }
      assert(a.know <= 12, 'well know ' + a.know + ' in a round');
      // memory: 3 successes max (5+6+7 = 18 + Remembrance perk), then capped
      w = world(); a = w.add(1, 'C'); const st = w.open('memory');
      for (let k = 0; k < 6; k++) { w.run(6100); if (w.v(a, 'use', 'C')) continue; const seq = st.show.slice(); w.run(seq.length * 700 + 100); for (const x of seq) { w.at(a, x); w.v(a, 'use', x); } w.at(a, 'C'); }
      eq(a.know, 18, '3 successes per round'); eq(w.remembered.length, 1);
      // oak: 6 whispers = 12
      w = world(); a = w.add(1, 'nook'); a.x = 6; a.z = 0; w.open('oak'); let i = 0; w.run(120000, () => { a.yaw = (i++ % 30) * 0.03; }); assert(a.know <= 12 && a.know >= 10, 'oak know ' + a.know);
      // thorn: bowl 3 drops = 15 per fill
      w = world(); a = w.add(1, 'SE'); w.open('thorn'); for (let n = 0; n < 6; n++) { for (let k = 0; k < 3; k++) ACT.kill(w.st, 'thorn', { id: 9 }, { id: 10 + k, npc: true }, w.ctx); w.v(a, 'use', 'SE'); w.run(1200); }
      eq(a.know, 24, 'bowl refills are bounded by the round cap');
      // spring heal is bounded by max HP: no knowledge, nothing else to farm
      w = world(); a = w.add(1, 'ring', { hp: 1 }); w.open('spring'); a.x = 1; w.run(120000); eq(a.hp, 100); eq(a.know, 0);
    }],
    ['anti-abuse: unknown verbs, wrong anchors, dead goblins and garbage arguments are refused without throwing, state stays JSON-clean', async () => {
      for (const t of T.TYPES) {
        const w = world(3), a = w.add(1, 'C'), st = w.open(t), dead = w.add(2, 'C', { alive: false });
        for (const v of ['use', 'tap', 'stop', 'pick', 'drop', 'buy', 'choose', 'nope'])
          for (const arg of [undefined, null, 'C', 'XX', { a: 'C', x: 9999 }, { a: {}, x: 'z' }, { a: 'NE', x: -5 }, 42, []]) {
            let r; try { r = ACT.verb(st, t, a, v, arg, w.ctx); } catch (e) { throw new Error(t + '/' + v + ' threw ' + e.message); }
            assert(r === null || typeof r === 'string', t + '/' + v);
            w.now += 50; if (Math.random() < 0.0) w.run(100);
          }
        for (const v of ['use', 'choose', 'buy', 'tap']) { const r = ACT.verb(st, t, dead, v, { a: 'C', x: 0 }, w.ctx); assert(r === null || typeof r === 'string'); }
        w.run(2000); JSON.stringify(ACT.view(st, t)); JSON.stringify(st);
      }
    }],
    ['bot hints: every type scores and proposes something sensible for a healthy goblin, and returns null or a go/verb object', async () => {
      for (const t of T.TYPES) {
        const w = world(4), a = w.add(1, 'NE'), st = w.open(t), spec = ACT.get(t);
        const b = { now: w.now, round: 1, sudden: false, anchor: id => w.ctx.anchor(id), knowLeft: 24, hpFrac: 1, aggr: 0.7, greed: 0.9, others: 0, brainOf: null, hasGear: true, scions: 0, junk: true, junkSlot: 0, healItems: 0, coop: true, cautious: false };
        const s = spec.bot.score(b, a, st); assert(typeof s === 'number' && s >= 0, t + ' score');
        const n = spec.bot.next(b, a, st); assert(n === null || typeof n === 'object', t + ' next');
      }
      // a concrete one: a bot at the well with water wants to drink
      const w = world(), a = w.add(1, 'NE'), st = w.open('well'), spec = ACT.get('well'), b = { now: w.now, anchor: id => w.ctx.anchor(id), knowLeft: 24, greed: 0.2, hpFrac: 1 };
      eq(spec.bot.next(b, a, st), { verb: 'use', a: 'NE' }); w.v(a, 'use', 'NE'); eq(spec.bot.next(b, a, st), { verb: 'tap', a: 'NE', bot: true });
      const far = w.add(2, 'SW'); eq(spec.bot.next(b, far, st), { go: 'NE' });
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

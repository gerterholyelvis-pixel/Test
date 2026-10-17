// MORE MYSTERY ENEMIES (npcx.js): unit tests with a fake server context, then a server run that puts a real thief in a room.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, NPCX = require('../npcx.js'), W = require('../world.js'), G = require('../items.js'), fs = require('fs');
const fake = () => {
  const log = { bcast: [], gold: [], steps: [], sent: [] }; let id = 100;
  const c = { NPC: { ...NPCX.KINDS }, WORLD: { randomPoint: () => [Math.random() * 4, Math.random() * 4] },
    equip: p => { p.inv = {}; }, recalc: p => { p.stats = {}; }, place: (p, x, z) => { p.x = x; p.z = z; p.room = 'c1'; }, newBrain: () => ({}), newId: () => ++id,
    bcast: (m, o) => log.bcast.push(o), sendTo: (ws, o) => log.sent.push(o), sendGold: p => log.gold.push(p.id), stepTo: (m, p, x, z) => log.steps.push([x, z]), clampIn: (r, x, z) => [x, z], face: () => {} };
  return { c, log, NX: NPCX(c), m: { players: new Map(), bombs: [] } };
};
(async () => {
  const fail = await L.run('npcx', [
    ['table: four new kinds plus imps, sane numbers, distinct, loot tables use existing pools', async () => {
      const K = NPCX.KINDS; eq(Object.keys(K).sort().join(), 'bomber,imp,shield,summoner,thief');
      for (const k in K) { const s = K[k]; assert(s.hp > 0 && s.hp <= 160 && s.dmg > 0 && s.speed >= 2 && s.speed <= 7 && s.cd >= 300 && s.name && G.ITEMS[s.weapon] && s.loot[1] <= 2, k); }
      assert(K.shield.hp > K.regular_hp || K.shield.hp >= 90); assert(K.thief.speed > K.bomber.speed && K.imp.loot[0] === 0);
      const src = fs.readFileSync(__dirname + '/../items.js', 'utf8'); for (const [k, w] of NPCX.WEIGHTS) assert(src.includes("['" + k + "', " + w + "]"), 'items.js weight for ' + k);
      const kinds = new Set(); for (let i = 0; i < 3000; i++) { const x = G.randomMystery(); if (x.kind === 'enemy') kinds.add(x.enemy); } for (const [k] of NPCX.WEIGHTS) assert(kinds.has(k), k + ' is rolled');
    }],
    ['shieldbearer: 70% less from the front, full from behind', async () => {
      const { NX } = fake(), t = { npc: 'shield', x: 0, z: 0, yaw: 0 };   // yaw 0 faces -z
      eq(NX.hit(null, { x: 0, z: -2 }, t, 20), 6, 'front'); eq(NX.hit(null, { x: 0, z: 2 }, t, 20), 20, 'behind'); eq(NX.hit(null, { x: 2, z: 0 }, t, 20), 20, 'side'); eq(NX.hit(null, { x: 0, z: -2 }, { npc: 'regular', x: 0, z: 0, yaw: 0 }, 20), 20);
      assert(NX.hit(null, { x: 0, z: -2 }, t, 1) >= 1, 'never zero');
    }],
    ['bomber: arms a goblins-only bomb with a fuse and a ring when it dies', async () => {
      const { NX, log, m } = fake(), p = NX.mk(m, 'bomber', 1, 1); NX.died(m, p, 1000);
      eq(m.bombs.length, 1); const b = m.bombs[0]; eq(b.at, 1000 + NPCX.P.bomberFuse); eq(b.n, 22); assert(b.goblinsOnly && b.r > 2 && b.by === p); assert(log.bcast.some(o => o.npcRing && o.npcRing.r === b.r), 'ring telegraph');
    }],
    ['thief: steals a quarter (10-60), runs, escapes after 7 s with nothing dropped, or pays the killer back', async () => {
      const { NX, log, m } = fake(), thief = NX.mk(m, 'thief', 1, 1), v = { id: 5, x: 1, z: 1.5, room: 'c1', gold: 100, ws: {} };
      thief.brain.tgt = v; assert(NX.think(m, thief, 1000, 0.1), 'steals'); eq(v.gold, 75); eq(thief.th.loot, 25); assert(log.sent.some(o => /stole 25/.test(o.npcNote)));
      thief.brain.tgt = null; assert(NX.think(m, thief, 2000, 0.1) && log.steps.length === 1, 'runs'); eq(thief.brain.speed, NPCX.P.fleeSpeed);
      const poor = { id: 6, x: 1, z: 1.2, room: 'c1', gold: 0, ws: {} }, t2 = NX.mk(m, 'thief', 1, 1); t2.brain.tgt = poor; eq(NX.think(m, t2, 1000, 0.1), false); eq(poor.gold, 0, 'nothing to steal');
      const rich = { id: 7, x: 1, z: 1.2, room: 'c1', gold: 1000, ws: {} }, t3 = NX.mk(m, 'thief', 1, 1); t3.brain.tgt = rich; NX.think(m, t3, 1000, 0.1); eq(rich.gold, 940, 'capped at 60');
      NX.think(m, thief, 1000 + NPCX.P.fleeMs + 1, 0.1); assert(thief.dead && !m.players.has(thief.key), 'escaped'); assert(log.bcast.some(o => /got away with 25/.test(o.npcNote)));
      const killer = { id: 9, gold: 0, ws: {} }; m.players.set({ k: 1 }, killer); t3.killedBy = 9; NX.died(m, t3, 5000); eq(killer.gold, 60, 'gold back to the killer');
    }],
    ['summoner: calls imps only with a target, at most two at a time, and keeps its distance', async () => {
      const { NX, log, m } = fake(), s = NX.mk(m, 'summoner', 0, 0), v = { id: 5, x: 3, z: 0, room: 'c1', dead: false };
      NX.think(m, s, 1000, 0.1); eq([...m.players.values()].length, 1, 'no imps without a target'); s.brain.tgt = v;
      NX.think(m, s, 1000, 0.1); eq([...m.players.values()].filter(q => q.npc === 'imp').length, 1); NX.think(m, s, 1100, 0.1); eq([...m.players.values()].filter(q => q.npc === 'imp').length, 1, 'not before the delay');
      NX.think(m, s, 7000, 0.1); NX.think(m, s, 13000, 0.1); eq([...m.players.values()].filter(q => q.npc === 'imp').length, 2, 'capped at two'); assert([...m.players.values()].every(q => q.npc !== 'imp' || q.master === s.id));
      assert(log.bcast.filter(o => o.npcRing).length === 2);
      eq(NX.fight(m, s, v, 1, 0.1), true, 'stays away at 3 m'); assert(log.steps.length === 1 && log.steps[0][0] < 0, 'steps back'); eq(NX.fight(m, s, { x: 1, z: 0 }, 1, 0.1), false, 'bites when cornered');
    }],
    ['server: a real thief steals gold in round 2 and tells the victim', async () => {
      const srv = await L.startServer({ GK_ENEMY: 'thief', GK_ROUND_MS: '1500', GK_BOT_NOTICE_MS: '0', GK_BOT_GRACE_MS: '0', GK_NPC_AGGRO_MS: '0' }); try {
        const c = await connectWith2(srv.port), id = c.state.layout.findIndex((x, i) => x === 'mystery' && c.state.mystery[i].kind === 'enemy'), ch = W.CHEST[id];
        c.send({ gold: 500 }); await c.until(x => x.state.gold === 500, 2000, 'gold');
        await c.until(x => { c.send({ tp: [ch.cx, ch.cz + 1.5] }); return x.msgs.some(m => m.npcNote && /stole/.test(m.npcNote)); }, 15000, 'theft note');
        assert(c.state.gold < 500 && c.state.gold >= 440, 'gold ' + c.state.gold); await c.close();
      } finally { srv.stop(); }
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();
async function connectWith2(port) { for (let i = 0; i < 30; i++) { const c = await connect(port); if (c.state.layout.some((x, j) => x === 'mystery' && c.state.mystery[j].kind === 'enemy')) return c; await c.close(); await sleep(150); } throw new Error('no mystery enemy room'); }

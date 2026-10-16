// balance + bot fairness (docs/reports/balance.md): class speed table, default rules, bot gang cap / notice delay / deliberate misses, vault-only regeneration in sudden death
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
function track(c) { const pos = {}; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.s) for (let i = 1; i + 5 < d.s.length; i += 6) pos[d.s[i]] = [d.s[i + 1], d.s[i + 2]]; }); return pos; }
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
const me = c => c.state.players && c.state.players.find(p => p.id === c.state.you);
const BOTS = { GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0', GK_READY_MS: '300', GK_BOT_NOTICE_MS: '1500' };
(async () => {
  const bots = await L.startServer(BOTS), four = await L.startServer({ ...BOTS, GK_MATCH_SIZE: '4', GK_BOT_NOTICE_MS: '0' });
  const sudden = await L.startServer({ GK_MATCH_SIZE: '2', GK_SUDDEN_ROUND: '1', GK_ROUND_MS: '700', GK_NEXT_ROUND_MS: '60000', GK_REGEN_SCALE: '0.05' });
  const minus = await L.startServer({ GK_RULES: '-bribe,crown' }); let fail = 1;
  try {
    fail = await L.run('balance', [
      ['speed table: small goblins are the fastest, big the slowest, and the server budget covers the fastest class', async () => {
        eq(G.SPEED.length, 5); assert(G.SPEED[0] > G.SPEED[1] && G.SPEED[1] > G.SPEED[2], 'small > medium > big: ' + G.SPEED); assert(Math.max(...G.SPEED) === G.SPEED[0]);
        const c = await connect(bots.port, 'goblin=0&wins=0'); await sleep(150);   // a small goblin sprinting at 7.5 x 1.12 across its own room must not be corrected
        const [cx, cz] = W.rc(c.state.matchStart.spawn.box); let x = cx - 3, z = cz; c.send({ tp: [x, z] }); await sleep(100); const fixes = () => c.msgs.filter(m => m.fix).length, f0 = fixes();
        for (let i = 0; i < 10; i++) { x += 7.5 * G.SPEED[0] * 0.066; c.send({ m: [+x.toFixed(2), z, 0] }); await sleep(66); }
        await sleep(150); eq(fixes() - f0, 0, 'a legit small-goblin sprint was corrected'); await c.close();
      }],
      ['rules: staffbolt and bribe are on by default, GK_RULES can switch any of them off or others on', async () => {
        const a = await connect(bots.port, 'wins=1'); eq(a.state.rules, ['staffbolt', 'bribe']); await a.close();
        const b = await connect(minus.port); eq(b.state.rules, ['staffbolt', 'crown']); await b.close();
      }],
      ['gang cap: three bots on one goblin, only two swing, the third holds back at ~3.6 m', async () => {
        const c = await connect(four.port, 'wins=2'), pos = track(c), ids = c.state.matchStart.players.filter(p => p.bot).map(p => p.id); eq(ids.length, 3);
        await give(c, 'a:aegis', 'armor'); await c.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        const [cx, cz] = W.rc(c.state.matchStart.spawn.box); c.send({ tp: [cx, cz] }); c.send({ m: [cx, cz, 0] });
        c.send({ botlab: { near: [cx, cz], ring: 4 } }); await c.until(x => x.msgs.some(m => m.botlab), 2000, 'botlab');   // 4 m away from me, 6.9 m from each other: I am the only target in range
        const from = new Set(), n0 = c.msgs.length; await sleep(3000);
        for (const m of c.msgs.slice(n0)) if (m.hit && m.hit.to === c.state.you && ids.includes(m.hit.from)) from.add(m.hit.from);
        assert(from.size >= 1, 'nobody attacked'); assert(from.size <= 2, 'more than two bots hit me: ' + [...from]);
        const far = ids.filter(id => pos[id] && Math.hypot(pos[id][0] - cx, pos[id][1] - cz) > 2.8), near = ids.filter(id => pos[id] && Math.hypot(pos[id][0] - cx, pos[id][1] - cz) <= 2.8);
        assert(far.length >= 1, 'no bot held back: ' + ids.map(id => pos[id] && Math.hypot(pos[id][0] - cx, pos[id][1] - cz).toFixed(1))); assert(near.length <= 2, 'three bots at melee range');
        await c.close();
      }],
      ['notice delay: a goblin who just walked up to a bot is not attacked for GK_BOT_NOTICE_MS', async () => {
        const c = await connect(bots.port, 'wins=3'), pos = track(c), bot = c.state.matchStart.players.find(p => p.bot);
        await give(c, 'a:aegis', 'armor'); await c.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        const p = pos[bot.id] || [bot.x, bot.z], r = W.roomKeyOf(p[0], p[1]); let [x, z] = [p[0] + 1.0, p[1]]; if (W.roomKeyOf(x, z) !== r) [x, z] = [p[0] - 1.0, p[1]];
        const t0 = Date.now(); c.send({ tp: [x, z] }); c.send({ m: [x, z, 0] });
        let first = 0; for (let i = 0; i < 60 && !first; i++) {   // stay glued to that bot, inside its room, without ever leaving the room (the arrival time must stand)
          await sleep(100); const q = pos[bot.id] || p; let [nx, nz] = [q[0] + 1.0, q[1]]; if (W.roomKeyOf(nx, nz) !== r) [nx, nz] = [q[0] - 1.0, q[1]]; if (W.roomKeyOf(nx, nz) === r) { c.send({ tp: [nx, nz] }); c.send({ m: [nx, nz, 0] }); }
          const h = c.msgs.find(m => m.hit && m.hit.to === c.state.you && m.hit.from === bot.id); if (h) first = Date.now() - t0;
        }
        if (first) assert(first >= 1300, 'the bot attacked ' + first + ' ms after I arrived, before the 1.5 s notice delay'); else console.log('         (no attack within 6 s, notice delay not measurable this time)');
        await c.close();
      }],
      ['deliberate misses: next to a bot some of its swings hit nothing (pooled over fresh matches: a strong bot can kill a weak human in three swings)', async () => {
        let swings = 0, hits = 0;
        for (let k = 0; k < 6 && swings < 12; k++) {
          const c = await connect(bots.port, 'wins=4'), pos = track(c), bot = c.state.matchStart.players.find(p => p.bot);
          await give(c, 'a:aegis', 'armor'); await c.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
          const n0 = c.msgs.length, t0 = Date.now();
          while (Date.now() - t0 < 6000 && !c.state.died) { const q = pos[bot.id] || [bot.x, bot.z], r = W.roomKeyOf(q[0], q[1]); let [x, z] = [q[0] + 1.0, q[1]]; if (W.roomKeyOf(x, z) !== r) [x, z] = [q[0] - 1.0, q[1]]; c.send({ tp: [x, z] }); c.send({ m: [x, z, 0] }); await sleep(120); }
          const ms = c.msgs.slice(n0); swings += ms.filter(m => m.swing === bot.id).length; hits += ms.filter(m => m.hit && m.hit.from === bot.id).length; await c.close();
        }
        assert(swings >= 6, 'the bot barely swung: ' + swings); assert(hits < swings, 'every one of ' + swings + ' swings hit: bots should miss sometimes');
      }],
      ['sudden death: no healing outside the vault, healing inside it', async () => {
        const [a, b] = await Promise.all([connect(sudden.port, 'goblin=2&wins=0'), connect(sudden.port, 'goblin=0&wins=0')]);
        await a.until(x => x.state.round && x.state.round.n >= 2 && x.state.sudden, 4000, 'sudden death');
        const [cx, cz] = W.rc(0); a.send({ tp: [cx, cz] }); a.send({ m: [cx, cz, -Math.PI / 2] }); b.send({ tp: [cx + 1.3, cz] }); b.send({ m: [cx + 1.3, cz, 0] }); await sleep(150);
        a.send({ atk: 1 }); await b.until(x => x.msgs.some(m => m.hit && m.hit.to === x.state.you), 2000, 'hit'); const hp = b.msgs.find(m => m.hit && m.hit.to === b.state.you).hit.hp; assert(hp > 0 && hp < 40, 'hp ' + hp);
        await sleep(1500); const out = me(b).stats.health; eq(out, hp, 'healed outside the vault in sudden death');
        b.send({ tp: [0, 0] }); await b.until(x => me(x) && me(x).stats.health > hp, 3000, 'healing inside the vault'); await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  balance setup: ' + (e.stack || e)); }
  bots.stop(); four.stop(); sudden.stop(); minus.stop(); process.exit(fail ? 1 : 0);
})();

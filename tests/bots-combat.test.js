// bots (part 2): bots fight and kill, the human can win against a bot, mystery enemies spawn / fight back / drop loot / do not count
const L = require('./lib.js'), { connect, connectWith, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');

// latest known positions of everyone else, from the snapshots
function track(c) { const pos = {}; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.s) for (let i = 1; i + 5 < d.s.length; i += 6) pos[d.s[i]] = [d.s[i + 1], d.s[i + 2]]; }); return pos; }
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
const botOf = c => c.state.matchStart.players.find(p => p.bot);

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_BOT_GRACE_MS: '0', GK_READY_MS: '300' }), srv1 = await L.startServer({ GK_MATCH_SIZE: '1', GK_ROUND_MS: '600' }); let fail = 1;
  // srv: a human + 1 bot (size 2); srv1: a lone human, no bots (mystery enemies)
  try {
    fail = await L.run('bots-combat', [
      ['a bot hunts and kills a weak human in the same room', async () => {
        const c = await connect(srv.port, 'wins=0'), pos = track(c), bot = botOf(c);
        await c.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        c.send({ drop: 'armor' }); await c.until(x => x.state.inv.armor === null, 2000, 'armour dropped');   // 10 HP
        let me = []; for (let i = 0; i < 40 && !c.state.died; i++) {   // stand in the bot's room, 4 m from it, and do nothing
          const p = pos[bot.id] || [bot.x, bot.z], r = W.roomKeyOf(p[0], p[1]); let [x, z] = [p[0] + 4, p[1]]; if (W.roomKeyOf(x, z) !== r) [x, z] = [p[0] - 4, p[1]];
          if (me[0] === undefined || W.roomKeyOf(me[0], me[1]) !== r) { me = [x, z]; c.send({ tp: [x, z] }); c.send({ m: [x, z, 0] }); }
          await sleep(250);
        }
        assert(c.state.died, 'the bot never killed the human'); eq(c.state.died.by, bot.id, 'killer');
      }],
      ['the human can win: kill the last bot -> won', async () => {
        const c = await connect(srv.port, 'wins=50'), pos = track(c), bot = botOf(c);
        await give(c, 'w:slayer', 'weapon'); await give(c, 'a:aegis', 'armor');
        await c.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        for (let i = 0; i < 80 && !c.state.won && !c.state.died; i++) {
          const p = pos[bot.id] || [bot.x, bot.z], r = W.roomKeyOf(p[0], p[1]); let [x, z] = [p[0] + 1.3, p[1]]; if (W.roomKeyOf(x, z) !== r) [x, z] = [p[0] - 1.3, p[1]];
          c.send({ tp: [x, z] }); c.send({ m: [x, z, Math.atan2(-(p[0] - x), -(p[1] - z))] }); await sleep(40); c.send({ atk: 1 }); await sleep(110);
        }
        assert(c.state.won, 'no victory' + (c.state.died ? ' (died)' : '')); assert(c.state.kills >= 1, 'kill counted');
      }],
      ['a mystery enemy spawns at GO, fights back, drops loot when killed and does not count for goblins left or the win', async () => {
        const c = await connectWith(srv1.port, s => (s.mystery || []).some(m => m && m.kind === 'enemy') && s.layout.some((x, i) => x === 'mystery' && s.mystery[i].kind === 'enemy'));
        const id = c.state.mystery.findIndex(m => m && m.kind === 'enemy'), kind = c.state.mystery[id].enemy, ch = W.CHEST[id];
        await sleep(400); eq((c.state.players || []).some(p => p.npc), false, 'no enemy before anyone entered its room');   // spawns on first entry now, not at GO
        for (let i = 0; i < 30 && !(c.state.players || []).some(p => p.npc); i++) { c.send({ tp: [ch.cx, ch.cz + 2] }); await sleep(100); }
        await c.until(x => x.state.players && x.state.players.some(p => p.npc), 2000, 'npc in the players list');
        const npc = c.state.players.find(p => p.npc); eq(npc.npc, kind); assert(npc.name && npc.stats.health > 0, 'npc stats'); eq(W.roomKeyOf(npc.x, npc.z), 'c' + id);
        eq(c.state.match.size, 1); eq(c.state.match.alive, 1);
        await give(c, 'a:aegis', 'armor');   // 300 HP so even the troll cannot kill the test before the loot check
        const drops0 = (c.state.drops || []).length, pos = track(c);
        let hitBack = false, dead = false;
        for (let i = 0; i < 90 && !dead; i++) {
          const p = pos[npc.id] || [npc.x, npc.z], x = ch.cx + (p[0] > ch.cx ? -1.2 : 1.2) + (p[0] - ch.cx) * 0.5, z = p[1]; let [px, pz] = [Math.max(ch.cx - 3.3, Math.min(ch.cx + 3.3, x)), Math.max(ch.cz - 3.3, Math.min(ch.cz + 3.3, z))];
          c.send({ tp: [px, pz] }); c.send({ m: [px, pz, Math.atan2(-(p[0] - px), -(p[1] - pz))] }); await sleep(40);
          if (i > 6) c.send({ atk: 1 }); else if (i === 0) await give(c, 'w:slayer', 'weapon');
          await sleep(110);
          hitBack = hitBack || c.msgs.some(m => m.hit && m.hit.from === npc.id && m.hit.to === c.state.you); dead = c.msgs.some(m => m.hit && m.hit.to === npc.id && m.hit.dead);
        }
        assert(hitBack, 'the ' + kind + ' never hit back'); assert(dead, 'the ' + kind + ' did not die');
        await c.until(x => x.state.players && !x.state.players.some(p => p.npc === kind && p.id === npc.id), 2000, 'npc removed');
        await c.until(x => (x.state.drops || []).length > drops0, 2000, 'loot drop'); assert(c.state.kills >= 1, 'kill counted'); assert(!c.state.won && !c.state.died, 'killing an enemy must not end the match'); eq(c.state.match.alive, 1);
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); srv1.stop(); process.exit(fail ? 1 : 0);
})();

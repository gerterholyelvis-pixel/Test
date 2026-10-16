// fun: goblin names, kill feed, scoreboard data, spectating after death (snapshots keep coming), match summary (matchEnd), solo + bot match end
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
const startOf = (c, id) => c.state.matchStart.players.find(p => p.id === id);
async function hunt(a, victim) {   // stand 1.3 m from the (still) victim and swing until he is dead
  const v = startOf(a, victim.state.you);
  for (let i = 0; i < 60 && !victim.state.died; i++) {
    a.send({ tp: [v.x + 1.3, v.z] }); a.send({ m: [v.x + 1.3, v.z, Math.PI / 2] }); await sleep(40); a.send({ atk: 1 }); await sleep(120);
  }
  assert(victim.state.died, 'the victim never died');
}
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_READY_MS: '300' }), srv2 = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_READY_MS: '300', GK_BOT_GRACE_MS: '0' });
  let fail = 1;
  try {
    fail = await L.run('fun', [
      ['names from the join query (unique, sanitized) or generated; feed, board, spectator snapshots and matchEnd', async () => {
        const [a, b, c] = await Promise.all([connect(srv.port, 'name=Thok&goblin=2&wins=0'), connect(srv.port, 'name=Mizzle&goblin=2&wins=0'), connect(srv.port, 'name=Thok%3Cb%3E&goblin=2&wins=0')]);
        const ps = a.state.matchStart.players; eq(ps.length, 3);
        const names = ps.map(p => p.name); assert(names.every(n => typeof n === 'string' && n.length > 0 && n.length <= 14 && !/[<>]/.test(n)), 'names ' + names); eq(new Set(names.map(n => n.toLowerCase())).size, 3, 'names unique: ' + names);
        eq(startOf(a, a.state.you).name, 'Thok'); eq(startOf(b, b.state.you).name, 'Mizzle');
        // board at GO: three rows, all alive
        await a.until(x => x.state.board, 2000, 'board'); eq(a.state.board.left, 3); eq(a.state.board.rows.length, 3); assert(a.state.board.rows.every(r => r[4] === 1 && r[3] === 0 && r[6] === 0));
        await give(a, 'w:slayer', 'weapon'); await give(a, 'a:aegis', 'armor');
        await hunt(a, b);
        // the feed reaches the victim, the killer and the bystander
        for (const x of [a, b, c]) { await x.until(y => y.msgs.some(m => m.feed), 2000, 'feed'); }
        const f = a.msgs.find(m => m.feed).feed; eq(f.k, 'Thok'); eq(f.v, 'Mizzle'); eq(f.w, 'Goblin Slayer'); eq(f.f, 'sword');
        await a.until(x => x.state.board && x.state.board.left === 2, 2000, 'board after the kill'); const row = a.state.board.rows.find(r => r[0] === a.state.you); eq(row[3], 1, 'killer has 1 kill'); eq(a.state.board.rows.find(r => r[0] === b.state.you)[4], 0, 'victim is marked dead');
        eq(b.state.died.by, a.state.you);
        // the dead goblin stays subscribed: snapshots of the others keep coming and the socket stays open
        const n0 = b.msgs.filter(m => m.s && m.s.includes(a.state.you)).length;
        const ap = startOf(a, a.state.you); for (let i = 0; i < 6; i++) { a.send({ m: [ap.x + 0.2 * (i + 1), ap.z, 0] }); await sleep(70); }   // inside a's own room
        await sleep(200);
        assert(b.msgs.filter(m => m.s && m.s.includes(a.state.you)).length > n0, 'the spectator got no snapshots of the living goblin'); assert(!b.closed, 'spectator socket must stay open');
        // kill the third goblin -> win, matchEnd for the winner, the spectators (b: dead earlier, c: dead now)
        await hunt(a, c);
        await a.until(x => x.state.won, 2000, 'won');
        for (const x of [a, b, c]) await x.until(y => y.state.matchEnd, 2000, 'matchEnd');
        const e = a.state.matchEnd; eq(e.winner.name, 'Thok'); eq(e.size, 3); eq(e.top.name, 'Thok'); eq(e.top.kills, 2); eq(e.places.length, 3);
        eq(e.places.map(p => p.place), [1, 2, 3]); eq(e.places[0].id, a.state.you); eq(e.places[1].id, c.state.you, 'last to die is #2'); eq(e.places[2].id, b.state.you); assert(e.longest && e.longest.id === c.state.you, 'longest survivor is the runner-up');
        eq(b.state.matchEnd, e, 'every spectator sees the same summary'); eq(c.state.matchEnd, e);
        for (const x of [a, b, c]) await x.close();
      }],
      ['a solo human with a bot: dies, stays a spectator, the last bot decides the match (matchEnd with a bot winner)', async () => {
        const a = await connect(srv2.port, 'name=Snik'); const bot = a.state.matchStart.players.find(p => p.bot); assert(bot && bot.name, 'bot has a name');
        await sleep(200); a.send({ kill: 1 }); await a.until(x => x.state.died, 2000, 'died');
        await a.until(x => x.state.matchEnd, 3000, 'matchEnd'); const e = a.state.matchEnd; eq(e.winner.bot, 1); eq(e.winner.id, bot.id); eq(e.size, 2); eq(e.places[1].id, a.state.you); assert(!a.closed, 'socket stays open for the summary');
        await a.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); srv2.stop(); process.exit(fail ? 1 : 0);
})();

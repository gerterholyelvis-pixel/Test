// match time limit: after round SUDDEN_ROUND every door is open and regeneration stops; after round MAX_ROUND the goblin with the most kills (then the most HP) wins.
// Debug overrides keep it fast: GK_ROUND_MS / GK_NEXT_ROUND_MS (round length), GK_SUDDEN_ROUND, GK_MAX_ROUND.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const startOf = (c, id) => c.state.matchStart.players.find(p => p.id === id);
(async () => {
  const env = { GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '400', GK_NEXT_ROUND_MS: '400', GK_READY_MS: '300', GK_SUDDEN_ROUND: '2', GK_MAX_ROUND: '4', GK_BOT_GRACE_MS: '60000' };
  const srv = await L.startServer(env);
  let fail = 1;
  try {
    fail = await L.run('sudden', [
      ['sudden death after round 2: sudden flag, every door open; nothing before it', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'name=Thok&goblin=2&wins=0'), connect(srv.port, 'name=Mizzle&goblin=2&wins=0')]);
        a.send({ enter: 1 }); b.send({ enter: 1 });
        await a.until(x => x.state.round && x.state.round.n >= 1, 2000, 'round 1');
        assert(!a.msgs.some(m => m.round && m.round.n <= 2 && m.sudden), 'sudden death must not start in rounds 1 and 2');
        await a.until(x => x.state.round.n === 3 && x.state.sudden === 1, 3000, 'round 3 is sudden death');
        eq(a.state.open.length, L.doors().length, 'every door is open'); eq(a.state.fizzled, []);
        for (const x of [a, b]) await x.close();
      }],
      ['after round 4 the match is decided: more HP wins a kill tie, the loser becomes a spectator, matchEnd.timeLimit', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'name=Thok&goblin=2&wins=0'), connect(srv.port, 'name=Mizzle&goblin=2&wins=0')]);
        a.send({ enter: 1 }); b.send({ enter: 1 });
        const v = startOf(a, b.state.you);
        for (let i = 0; i < 6 && !b.msgs.some(m => m.hit); i++) { a.send({ tp: [v.x + 1.3, v.z] }); a.send({ m: [v.x + 1.3, v.z, Math.PI / 2] }); await sleep(40); a.send({ atk: 1 }); await sleep(200); }   // one fist hit: b has less HP, nobody dies
        assert(b.msgs.some(m => m.hit), 'the hit never landed');
        await a.until(x => x.state.won, 5000, 'a wins on HP at the time limit');
        await b.until(x => x.state.died, 3000, 'b is out');
        await b.until(x => x.state.matchEnd, 3000, 'matchEnd'); const e = b.state.matchEnd;
        eq(e.timeLimit, 1); eq(e.winner.id, a.state.you); eq(e.places[0].id, a.state.you); eq(e.places[1].id, b.state.you);
        assert(a.state.round.n >= 4 && a.state.round.n <= 4, 'decided only once round 4 ran out (last round seen: ' + a.state.round.n + ')');
        for (const x of [a, b]) await x.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

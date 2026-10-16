// Two rooms pick vault doors in round 1 -> they open at the end of the round.
const L = require('./lib.js'), { connect, eq } = L, W = require('../world.js');
(async () => {
  const srv = await L.startServer({ GK_ROUND_MS: '2500' }); let fail = 1;
  try {
    fail = await L.run('vault-open', [['two rooms pick vault doors: they open at the end of round 1', async () => {
      const D = L.doors(); eq(D.filter(d => d.a === '4' || d.b === '4').length, 4);
      const doorOf = room => D.find(d => (d.a === room && d.b === '4') || (d.b === room && d.a === '4')).id;
      const a = await connect(srv.port, 'goblin=0'), b = await connect(srv.port, 'goblin=1');
      a.send({ tp: W.rc(1) }); b.send({ tp: W.rc(3) }); a.send({ enter: 1 });
      await a.until(c => c.state.round.left < 2300, 4000, 'timer');
      a.send({ sel: doorOf('1') }); b.send({ sel: doorOf('3') });
      await a.until(c => c.state.vaultVotes === 2, 3000, 'two vault votes');
      await a.until(c => c.state.round.n === 2, 8000, 'round 2');
      eq(a.state.open.slice().sort((x, y) => x - y), [doorOf('1'), doorOf('3')].sort((x, y) => x - y)); eq(a.state.fizzled, []);
      await a.close(); await b.close();
    }]]);
  } catch (e) { console.log('  FAIL  vault-open setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// Two rooms pick vault doors in round 1 -> they open at the end of the round.
const L = require('./lib.js'), { connect, eq } = L, W = require('../world.js');
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '2500' }); let fail = 1;
  try {
    fail = await L.run('vault-open', [['two rooms pick vault doors: they open at the end of round 1', async () => {
      const D = L.doors(), VK = W.VAULT_KEY; eq(D.filter(d => d.a === VK || d.b === VK).length, 4);
      const [n1, n2] = L.vaultNeighbours(), doorOf = room => L.doorBetween(room, VK);   // two of the 4 rooms that touch the vault
      const [a, b] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1')]);
      a.send({ tp: L.centre(n1) }); b.send({ tp: L.centre(n2) });
      await a.until(c => c.state.round.left < 2300, 4000, 'timer');
      a.send({ sel: doorOf(n1) }); b.send({ sel: doorOf(n2) });
      await a.until(c => c.state.vaultVotes === 2, 3000, 'two vault votes');
      await a.until(c => c.state.round.n === 2, 8000, 'round 2');
      eq(a.state.open.slice().sort((x, y) => x - y), [doorOf(n1), doorOf(n2)].sort((x, y) => x - y)); eq(a.state.fizzled, []);
      await a.close(); await b.close();
    }]]);
  } catch (e) { console.log('  FAIL  vault-open setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

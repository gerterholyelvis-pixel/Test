// Two rooms pick vault doors in a round -> they open at the end of the round. Round 1 is the home phase (nobody can reach a panel), so the votes happen in round 2.
const L = require('./lib.js'), { connect, eq } = L, W = require('../world.js');
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '1500', GK_NEXT_ROUND_MS: '3500' }); let fail = 1;
  try {
    fail = await L.run('vault-open', [['two rooms pick vault doors in round 2: they open at the end of the round', async () => {
      const D = L.doors(), VK = W.VAULT_KEY; eq(D.filter(d => d.a === VK || d.b === VK).length, 4);
      const [n1, n2] = L.vaultNeighbours(), doorOf = room => L.doorBetween(room, VK);   // two of the 4 rooms that touch the vault
      const [a, b] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1')]);
      await a.until(c => c.state.round && c.state.round.n === 2, 5000, 'round 2 (the arena opens)');
      a.send({ tp: L.centre(n1) }); b.send({ tp: L.centre(n2) });
      await a.until(c => c.state.round.left < 3300, 4000, 'timer');
      a.send({ sel: doorOf(n1) }); b.send({ sel: doorOf(n2) });
      await a.until(c => c.state.vaultVotes === 2, 3000, 'two vault votes');
      await a.until(c => c.state.round.n === 3, 8000, 'round 3');
      eq(a.state.open.slice().sort((x, y) => x - y), [doorOf(n1), doorOf(n2)].sort((x, y) => x - y)); eq(a.state.fizzled, []);
      await a.close(); await b.close();
    }]]);
  } catch (e) { console.log('  FAIL  vault-open setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// One room alone picks a vault door -> nothing opens for it and it is reported fizzled; a plain door picked by another room still opens. Also door-selection validation.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500' }); let fail = 1;
  try {
    fail = await L.run('vault-fizzle', [['one vault vote fizzles, other doors open, bad selections ignored', async () => {
      const VK = W.VAULT_KEY, [n1] = L.vaultNeighbours(), vaultDoor = L.doorBetween(n1, VK), plain = L.plainDoors(n1)[0];   // a stands in a room next to the vault; b in the neighbour across a plain door of it
      const nb = W.DOORS[plain].a === n1 ? W.DOORS[plain].b : W.DOORS[plain].a, notMine = L.doorBetween('0', '1');   // notMine: a door far away from a
      const [a, b] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1')]);
      await a.until(c => c.state.round.n === 2, 8000, 'round 2');   // DOORS-PERSIST: round 1 (at home) opens nothing, the votes happen in round 2
      a.send({ tp: L.centre(n1) }); b.send({ tp: L.centre(nb) });
      await a.until(c => c.state.round.left < 2300, 4000, 'timer');
      for (const bad of [notMine, 999, -1, 1.5, 'x']) a.send({ sel: bad });
      await sleep(250); eq(a.state.sel, {}, 'a door that is not on my room walls was accepted');
      a.send({ sel: vaultDoor }); b.send({ sel: plain });
      await a.until(c => c.state.vaultVotes === 1 && Object.keys(c.state.sel).length === 2, 3000, 'two selections');
      await a.until(c => c.state.round.n === 3, 8000, 'round 3');
      eq(a.state.open, [plain], 'only the plain door opens'); eq(a.state.fizzled, [vaultDoor], 'the lone vault door fizzles'); eq(a.state.sel, {});
      await a.close(); await b.close();
    }]]);
  } catch (e) { console.log('  FAIL  vault-fizzle setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

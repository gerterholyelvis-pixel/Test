// Panel politics + door intel: the round state names who made each room's current pick (selBy), the last pick wins, and last round's picks arrive as lastSel.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '2500' }); let fail = 1;
  try {
    fail = await L.run('panel-selby', [['selBy follows the last goblin to change the pick, resets and becomes lastSel next round', async () => {
      const D = L.doors(), d1 = D.find(d => d.a === '0' && d.b === '1').id, d2 = D.find(d => d.a === '0' && d.b === '5').id;
      const [a, b] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1')]);
      a.send({ tp: W.rc(0) }); b.send({ tp: W.rc(0) });
      await a.until(c => c.state.round.left < 2300, 4000, 'timer');
      const idA = a.state.you, idB = b.state.you; assert(idA !== idB, 'two ids');
      a.send({ sel: d1 }); await a.until(c => c.state.sel['0'] === d1, 2000, 'a picks');
      eq(a.state.selBy['0'], idA, 'first picker');
      b.send({ sel: d2 }); await a.until(c => c.state.sel['0'] === d2, 2000, 'b changes the pick');
      eq(a.state.selBy['0'], idB, 'the second goblin took the panel'); eq(b.state.selBy['0'], idB);
      await a.until(c => c.state.round.n === 2, 8000, 'round 2');
      eq(a.state.selBy, {}, 'selBy resets with the round'); eq(a.state.lastSel, { 0: d2 }, 'last round picks are door intel');
      await a.close(); await b.close();
    }]]);
  } catch (e) { console.log('  FAIL  panel-selby setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

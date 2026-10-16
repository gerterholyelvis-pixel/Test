// One room alone picks a vault door -> nothing opens for it and it is reported fizzled; a plain door picked by another room still opens. Also door-selection validation.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
(async () => {
  const srv = await L.startServer({ GK_ROUND_MS: '2500' }); let fail = 1;
  try {
    fail = await L.run('vault-fizzle', [['one vault vote fizzles, other doors open, bad selections ignored', async () => {
      const D = L.doors(), vaultDoor = D.find(d => d.a === '1' && d.b === '4').id, plain = D.find(d => d.a === '0' && d.b === '1').id, notMine = D.find(d => d.a === '8' && d.b === 'c11').id;
      const a = await connect(srv.port, 'goblin=0'), b = await connect(srv.port, 'goblin=1');
      a.send({ tp: W.rc(1) }); b.send({ tp: W.rc(0) }); a.send({ enter: 1 });
      await a.until(c => c.state.round.left < 2300, 4000, 'timer');
      for (const bad of [notMine, 999, -1, 1.5, 'x']) a.send({ sel: bad });
      await sleep(250); eq(a.state.sel, {}, 'a door that is not on my room walls was accepted');
      a.send({ sel: vaultDoor }); b.send({ sel: plain });
      await a.until(c => c.state.vaultVotes === 1 && Object.keys(c.state.sel).length === 2, 3000, 'two selections');
      await a.until(c => c.state.round.n === 2, 8000, 'round 2');
      eq(a.state.open, [plain], 'only the plain door opens'); eq(a.state.fizzled, [vaultDoor], 'the lone vault door fizzles'); eq(a.state.sel, {}); assert(a.state.round.dur === 45000, 'round 2 lasts 45 s');
      await a.close(); await b.close();
    }]]);
  } catch (e) { console.log('  FAIL  vault-fizzle setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// one goblin, one name: a new saved character keeps the name the server gave it in the match; an existing one keeps its own and the server uses it
const L = require('./lib.js'), { connect, assert, eq } = L;
(async () => {
  global.window = global; global.GKITEMS = require('../items.js'); require('../save.js');
  const srv = await L.startServer({ GK_MATCH_SIZE: '2' }); let fail = 1;
  try {
    fail = await L.run('names', [
      ['a new character keeps the in-match name (cleaned), a taken name falls back to the pool', async () => {
        GKSAVE.clearAll();
        const a = GKSAVE.recordWin({ goblin: 2, items: ['w:club'], name: 'Narg' }); eq(a.name, 'Narg'); eq(a.wins, 1);
        const b = GKSAVE.recordWin({ goblin: 2, items: [], name: 'Narg' }); assert(b.name !== 'Narg' && b.name.length > 0, 'a second new character must not reuse a taken name: ' + b.name);
        const c = GKSAVE.recordWin({ goblin: 1, items: [], name: '<b>Zog</b>!!' }); eq(c.name, 'bZogb', 'unsafe characters are stripped');
        const again = GKSAVE.recordWin({ charId: a.id, goblin: 2, items: [], name: 'Somebody Else' }); eq(again.name, 'Narg', 'an existing character keeps its name'); eq(again.wins, 2);
        const d = GKSAVE.recordWin({ goblin: 0, items: [] }); assert(d.name, 'no name given: the pool name');
      }],
      ['the server uses the name from the join query for the goblin in the match', async () => {
        const [x, y] = await Promise.all([connect(srv.port, 'goblin=1&name=' + encodeURIComponent('Narg')), connect(srv.port, 'goblin=1&name=Narg')]);
        await x.until(c => c.state.matchStart || (c.state.players || []).length, 3000, 'players');
        const pl = (x.state.matchStart && x.state.matchStart.players) || x.state.players, names = pl.map(p => p.name);
        assert(names.includes('Narg'), 'the saved name should appear in the match: ' + names); eq(new Set(names).size, names.length, 'names inside a match stay unique');
        await x.close(); await y.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

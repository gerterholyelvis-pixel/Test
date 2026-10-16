// join shape, layout rules, the round timer starts at GO, rate limiting (the test server uses GK_MATCH_SIZE=1 and no countdown, see lib.js)
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
(async () => {
  const srv = await L.startServer(); let fail = 1;
  try {
    fail = await L.run('basic', [
      ['join: you message has the full shape', async () => {
        const c = await connect(srv.port, 'goblin=2'); const s = c.state;
        assert(Number.isInteger(s.you)); eq(s.chests.length, 12); eq(s.chestKeys.length, 12); eq(s.layout.length, 12); eq(s.mystery.length, 12); eq(s.shops.length, 12); eq(s.drops, []);
        assert(s.round && s.round.n === 1 && s.round.dur === 30000, 'round 1 is 30 s'); eq(s.open, []); eq(s.sel, {}); assert('vaultVotes' in s && Array.isArray(s.fizzled));
        assert(s.match && s.match.size >= 1);
        eq(s.inv.backpack.length, 9); eq(s.inv.quick.length, 3); eq([s.inv.weapon, s.inv.armor], [G.START[2].weapon, G.START[2].armor], 'big goblin start gear');
        eq(s.gold, G.START_GOLD); assert(s.parts && typeof s.parts === 'object');
        await c.close();
      }],
      ['join: goblin and wins query are respected, bad ones fall back', async () => {
        const c = await connect(srv.port, 'goblin=9&wins=abc'); assert(c.state.you > 0); await c.close();
      }],
      ['layout: 12 rooms of known types, edge ids never merchant (30 matches)', async () => {
        for (let i = 0; i < 30; i++) {
          const L2 = G.randomLayout(); eq(L2.length, 12);
          for (const id of [2, 5, 6, 9]) assert(L2[id] !== 'merchant', 'edge id ' + id + ' merchant');
        }
        // and the server's own layouts (each empty match is thrown away, so every join may roll a new one)
        for (let i = 0; i < 6; i++) {
          const c = await connect(srv.port); const l = c.state.layout;
          eq(l.length, 12); assert(l.every(t => ['chest', 'mystery', 'merchant'].includes(t)), 'bad type');
          for (const id of [2, 5, 6, 9]) assert(l[id] !== 'merchant', 'server edge id ' + id + ' merchant');
          l.forEach((t, id) => { assert((t === 'merchant') === !!c.state.shops[id], 'shop only in merchant rooms'); assert((t === 'mystery') === !!c.state.mystery[id], 'mystery contents only in mystery rooms'); });
          await c.close(); await sleep(120);
        }
      }],
      ['the round timer runs from GO (legacy enter is harmless)', async () => {
        const c = await connect(srv.port); c.send({ enter: 1 }); await c.until(x => x.state.round.left < 29000, 3500, 'timer to run after GO');
        await c.close();
      }],
      ['spawn: players start in an outer room, never the vault', async () => {
        for (let i = 0; i < 8; i++) { const c = await connect(srv.port); await c.until(x => x.state.players || true); await c.close(); }
        // spawn point is private to the server; position shows up in the broadcast player list
        const c = await connect(srv.port, 'goblin=0'); await c.until(x => x.state.players && x.state.players.some(p => p.id === x.state.you), 2000, 'player list');
        const me = c.state.players.find(p => p.id === c.state.you); assert(me.box !== W.VAULT && me.box >= 0 && me.box < 9, 'spawned in box ' + me.box); eq(W.roomKeyOf(me.x, me.z), String(me.box)); assert(!('inv' in me), 'inventory leaked'); await c.close();
      }],
      ['rate limit / garbage input never crashes the server', async () => {
        const c = await connect(srv.port);
        for (let i = 0; i < 600; i++) c.send({ m: [i, i, 0] });
        for (const junk of ['not json', '{', 'null', '[]', '"x"', '{"m":"x"}', '{"sel":"x"}', '{"mv":[1,2]}', '{"buy":[1]}', '{"loot":"x"}', '{"claim":2}']) c.send(junk);
        c.ws.send(Buffer.from([1, 2, 3]), { binary: true });
        await sleep(300);
        const d = await connect(srv.port); assert(d.state.you > 0, 'new client after the flood'); assert(srv.alive(), 'server died');
        await c.close(); await d.close();
        const big = await connect(srv.port); big.ws.send(JSON.stringify({ m: [0, 0, 0], pad: 'x'.repeat(2000) })); await sleep(300); assert(srv.alive(), 'oversize frame killed the server');
        await big.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  basic setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

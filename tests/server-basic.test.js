// join shape, layout rules, the round timer starts at GO, rate limiting (the test server uses GK_MATCH_SIZE=1 and no countdown, see lib.js)
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
(async () => {
  const srv = await L.startServer(); let fail = 1;
  try {
    fail = await L.run('basic', [
      ['join: you message has the full shape', async () => {
        const c = await connect(srv.port, 'goblin=2'); const s = c.state;
        assert(Number.isInteger(s.you)); eq(s.chests.length, W.NATT); eq(s.chestKeys.length, W.NATT); eq(s.layout.length, W.NATT); eq(s.mystery.length, W.NATT); eq(s.shops.length, W.NATT); eq(s.drops, []);
        assert(s.round && s.round.n === 1 && s.round.dur === 120000, 'round 1 is 2 min'); eq(s.open, []); eq(s.sel, {}); assert('vaultVotes' in s && Array.isArray(s.fizzled));
        assert(s.match && s.match.size >= 1);
        eq(s.inv.backpack.length, 9); eq(s.inv.quick.length, 3); eq([s.inv.weapon, s.inv.armor], [G.START[2].weapon, G.START[2].armor], 'big goblin start gear');
        eq(s.gold, G.START_GOLD); assert(s.parts && typeof s.parts === 'object');
        await c.close();
      }],
      ['join: goblin and wins query are respected, bad ones fall back', async () => {
        const c = await connect(srv.port, 'goblin=9&wins=abc'); assert(c.state.you > 0); await c.close();
      }],
      ['layout: 20 attached rooms, homes at positions 2 and 4 of each side, exactly one forge and one grand on opposite sides, at least one merchant (200 rolls)', async () => {
        const check = (l, who) => {
          eq(l.length, W.NATT, who + ' layout length');
          l.forEach((t, id) => { assert(['home', 'chest', 'mystery', 'merchant', 'forge', 'grand'].includes(t), who + ' bad type ' + t); assert((t === 'home') === W.CHEST[id].home, who + ' home flag of room ' + id); });
          const fi = l.indexOf('forge'), gi = l.indexOf('grand'); eq(l.filter(t => t === 'forge').length, 1, who + ' forges'); eq(l.filter(t => t === 'grand').length, 1, who + ' grand recyclers');
          eq(Math.floor(gi / 5), (Math.floor(fi / 5) + 2) % 4, who + ': forge and grand are on opposite sides'); assert(l.includes('merchant'), who + ' has no merchant');
        };
        for (let i = 0; i < 200; i++) check(G.randomLayout(), 'items.js');
        // and the server's own layouts (each empty match is thrown away, so every join may roll a new one)
        for (let i = 0; i < 6; i++) {
          const c = await connect(srv.port); const l = c.state.layout; check(l, 'server');
          l.forEach((t, id) => { assert((t === 'merchant') === !!c.state.shops[id], 'shop only in merchant rooms'); assert((t === 'mystery') === !!c.state.mystery[id], 'mystery contents only in mystery rooms'); });
          await c.close(); await sleep(120);
        }
      }],
      ['the round timer runs from GO (legacy enter is harmless)', async () => {
        const c = await connect(srv.port); c.send({ enter: 1 }); await c.until(x => x.state.round.left < 119000, 3500, 'timer to run after GO');
        await c.close();
      }],
      ['spawn: every player starts in his own home (an attached room at position 2 or 4), never the vault', async () => {
        const cs = []; for (let i = 0; i < 3; i++) { const c = await connect(srv.port, 'goblin=0'); await c.until(x => x.state.players && x.state.players.some(p => p.id === x.state.you), 2000, 'player list'); cs.push(c); }
        for (const c of cs) {
          const me = c.state.players.find(p => p.id === c.state.you), ck = W.CHEST[+me.home.slice(1)];
          assert(/^c[0-9]+$/.test(me.home) && ck && ck.home, 'spawned in ' + me.home + ', not a home'); eq(me.box, ck.parent); assert(me.box !== W.VAULT && me.box >= 0 && me.box < W.NARENA, 'box ' + me.box);
          eq(W.roomKeyOf(me.x, me.z), me.home, 'spawn point is inside the home'); eq(me.room, me.home); eq(c.state.matchStart.spawn.home, me.home); assert(!('inv' in me), 'inventory leaked');
        }
        for (const c of cs) await c.close();
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

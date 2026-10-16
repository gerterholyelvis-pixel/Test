// claim, merchant buy failures, inventory mv/drop, death drops, eating a brain, bogus atk
const L = require('./lib.js'), { connect, connectWith, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js'), fs = require('fs');
const WEAPON = Object.keys(G.ITEMS).find(k => G.ITEMS[k].type === 'weapon' && G.ITEMS[k].chance > 0), ARMOR = Object.keys(G.ITEMS).find(k => G.ITEMS[k].type === 'armor' && G.ITEMS[k].chance > 0);
const at = id => [W.CHEST[id].cx, W.CHEST[id].cz];
(async () => {
  const srv = await L.startServer(); let fail = 1;
  try {
    fail = await L.run('items', [
      ['claim: chest gives its item once, second claim is taken, outside a room fails', async () => {
        const c = await connectWith(srv.port, s => s.layout.includes('chest')), id = c.state.layout.indexOf('chest');
        c.send({ tp: [0, 0] }); c.send({ claim: 1 }); await c.until(x => x.state.claimFail, 2000, 'claimFail in the vault'); eq(c.state.claimFail, 'room'); delete c.state.claimFail;
        c.send({ tp: at(id) }); c.send({ claim: 1 });
        await c.until(x => x.state.claimed, 2000, 'claimed'); eq(c.state.claimed.room, id); eq(c.state.claimed.key, c.state.chestKeys[id]);
        await c.until(x => x.state.inv.backpack.includes(c.state.chestKeys[id]), 2000, 'item in backpack');
        c.send({ claim: 1 }); await c.until(x => x.state.claimFail, 2000, 'claimFail again'); eq(c.state.claimFail, 'taken');
        await c.close();
      }],
      ['merchant: buy fails outside the room, for bad args, no gold, no space; works once then sold', async () => {
        const c = await connectWith(srv.port, s => s.layout.includes('merchant')), id = c.state.layout.indexOf('merchant'), shop = c.state.shops[id];
        const failWith = async (msg, why) => { delete c.state.buyFail; c.send({ buy: msg }); await c.until(x => x.state.buyFail, 2000, 'buyFail ' + why); eq(c.state.buyFail, why, JSON.stringify(msg)); };
        c.send({ tp: [0, 0] }); await sleep(100); await failWith([id, 0], 'room');   // not in the merchant room yet
        c.send({ tp: at(id) }); await sleep(100);
        for (const bad of [[id, 99], [id, -1], [id, 1.5], [-1, 0], [id === 11 ? 0 : id + 1, 0], ['x', 0]]) await failWith(bad, 'room');
        c.send({ gold: 0 }); await c.until(x => x.state.gold === 0, 2000, 'gold 0'); await failWith([id, 0], 'gold');
        c.send({ gold: 999999 }); await c.until(x => x.state.gold === 999999, 2000, 'rich');
        c.send({ buy: [id, 0] }); await c.until(x => x.state.gold === 999999 - shop[0].price, 2000, 'paid'); await c.until(x => x.state.inv.backpack.includes(shop[0].key), 2000, 'bought item'); await failWith([id, 0], 'sold');
        for (let i = 0; i < 9; i++) c.send({ give: WEAPON });   // fill the backpack
        await c.until(x => x.state.inv.backpack.every(Boolean), 2000, 'full backpack'); await failWith([id, 1], 'space');
        await c.close();
      }],
      ['inventory: mv swaps/moves, rejects bad slots and wrong types; drop validates', async () => {
        const c = await connect(srv.port, 'goblin=0'); const start = c.state.inv.weapon;
        c.send({ give: WEAPON }); c.send({ give: ARMOR }); await c.until(x => x.state.inv.backpack[1], 2000, 'two items');
        const same = JSON.stringify(c.state.inv), n = c.msgs.length;
        for (const bad of [['b0', 'b0'], ['x', 'b1'], ['b1', 'x'], ['b8', 'b7'], ['b0', 'armor'], ['b1', 'weapon'], [1, 2], ['b0'], ['weapon', 'q9'], [null, null]]) c.send({ mv: bad });
        c.send({ drop: 'b8' }); c.send({ drop: 'zz' }); c.send({ drop: 5 }); await sleep(300);
        eq(c.msgs.slice(n).filter(m => m.inv || m.drops), [], 'invalid mv/drop caused updates'); eq(JSON.stringify(c.state.inv), same);
        c.send({ mv: ['b0', 'weapon'] }); await c.until(x => x.state.inv.weapon === WEAPON && x.state.inv.backpack[0] === start, 2000, 'swap into weapon slot');
        c.send({ mv: ['b1', 'armor'] }); await c.until(x => x.state.inv.armor === ARMOR, 2000, 'armor equip');
        c.send({ mv: ['b0', 'q2'] }); await c.until(x => x.state.inv.quick[2] === start && x.state.inv.backpack[0] === null, 2000, 'to quick slot');
        c.send({ drop: 'q2' }); await c.until(x => x.state.inv.quick[2] === null, 2000, 'dropped'); await c.close();
      }],
      ['debug kill: the dead goblin drops its items and a brain, others see the pile; the brain can be eaten', async () => {
        const srv2 = await L.startServer({ GK_MATCH_SIZE: '3' });   // three players in one match (with only two left, the survivor would win and leave)
        const [a, b, c3] = await Promise.all([connect(srv2.port, 'goblin=0'), connect(srv2.port, 'goblin=0'), connect(srv2.port, 'goblin=0')]);
        a.send({ give: WEAPON }); await a.until(x => x.state.inv.backpack[0], 2000, 'item');
        b.send({ tp: [3, 3] }); a.send({ tp: [3, 3] }); await sleep(100);
        a.send({ kill: 1 }); await a.until(x => x.state.died, 2000, 'died message'); assert(a.state.died.brain.startsWith('m:brain:'), 'brain key'); assert(a.state.died.items.includes(WEAPON));
        await b.until(x => x.state.drops && x.state.drops.length, 2000, 'drop pile');
        const pile = b.state.drops[0]; assert(pile.items.some(k => k.startsWith('m:brain:')) && pile.items.includes(WEAPON), 'pile contents ' + pile.items);
        const bi = pile.items.findIndex(k => k.startsWith('m:brain:'));
        b.send({ loot: [pile.id, bi, 'eat', pile.items[bi]] }); await b.until(x => x.state.ate, 2000, 'ate');
        eq(b.state.ate.gain, G.brainGain(pile.items[bi])); eq(b.state.ate.knowledge, Math.round((G.KNOWLEDGE[0] + b.state.ate.gain) * 100) / 100);
        b.send({ loot: [pile.id, 99, 'take'] }); await b.until(x => x.state.lootFail, 2000, 'lootFail'); eq(b.state.lootFail, 'item');
        await a.close(); await b.close(); await c3.close(); srv2.stop();
      }],
      ['atk: bogus attack messages do not crash anything (real combat checks: combat.test.js)', async () => {
        const a = await connect(srv.port); a.send({ atk: 99999 }); a.send({ atk: 'x' }); a.send({ atk: null }); await sleep(200); assert(srv.alive()); await a.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  items setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

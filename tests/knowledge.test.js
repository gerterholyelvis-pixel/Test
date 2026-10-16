// knowledge tree + workbench (docs/KNOWLEDGE.md): points, perk order, no craft/recycle loops, reforged twins, and the server's learn / craft / reforge / Second Wind
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const ALL = G.PERKS.map(p => p.id), at = id => [W.CHEST[id].cx, W.CHEST[id].cz];
async function inMerchant(port, n, q) {   // n clients in one match whose layout has a merchant room; returns [clients, merchant id]
  for (let t = 0; t < 15; t++) {
    const cs = await Promise.all(Array.from({ length: n }, (_, i) => connect(port, q[i] || '')));
    const id = cs[0].state.layout.indexOf('merchant'); if (id >= 0) return [cs, id];
    for (const c of cs) await c.close(); await sleep(150);
  }
  throw new Error('no merchant layout');
}
const why = async (c, key, msg) => { delete c.state[key]; c.send(msg); await c.until(x => x.state[key], 2000, key); return c.state[key]; };
(async () => {
  const srv = await L.startServer(), duo = await L.startServer({ GK_MATCH_SIZE: '2' }); let fail = 1;
  try {
    fail = await L.run('knowledge', [
      ['points: 1 per 20 knowledge + 1 per brain; every class starts with a perk, none can buy the whole tree', async () => {
        const start = G.KNOWLEDGE.map(k => G.knowPoints(k, 0, []));
        eq(start, [3, 2, 1, 4, 2]); const total = G.PERKS.reduce((s, p) => s + p.cost, 0);
        assert(Math.min(...start) >= 1 && Math.max(...start) < total / 3, 'start points ' + start + ' vs tree ' + total);
        eq(G.knowPoints(30, 2, ['medic']), 2); eq(G.knowPoints(40, 0, ['medic', 'gourmet']), 0, 'never negative');
        for (const b of G.BRANCHES) eq(G.PERKS.filter(p => p.branch === b.id).map(p => p.rank + ':' + p.cost), ['1:1', '2:2', '3:3'], b.id);
      }],
      ['learnFail: order inside a branch, points, duplicates, unknown ids', async () => {
        eq(G.learnFail('scrapper', 200, 0, []), 'order'); eq(G.learnFail('thrifty', 200, 0, ['thrifty']), 'have'); eq(G.learnFail('x', 200, 0, []), 'perk'); eq(G.learnFail('__proto__', 200, 0, []), 'perk');
        eq(G.learnFail('gourmet', 40, 0, ['medic']), 'points'); eq(G.learnFail('gourmet', 40, 1, ['medic']), null);
      }],
      ['no craft/recycle loop: recycling anything a recipe makes never returns more than the recipe costs, with or without perks', async () => {
        for (const perks of [[], ALL]) for (const r of G.RECIPES) for (const k of [r.out, r.out + '+']) {
          const y = G.recycleFor(k, perks), c = G.recipeCost(r, perks); if (!y) continue;
          for (const p in y) assert(y[p] <= (c[p] || 0), k + ' recycles to ' + p + ' ' + y[p] + ' > cost ' + (c[p] || 0) + ' (perks ' + perks.length + ')');
        }
        const sword = G.recycleYield('w:sword'), more = G.recycleFor('w:sword', ['scrapper']); for (const p in sword) eq(more[p], sword[p] + 1, 'Scrapper +1 ' + p);
        eq(G.recipeCost({ cost: { wood: 3, bone: 1 } }, ['thrifty']), { wood: 2, bone: 1 });
      }],
      ['reforged twins: every pool weapon and armour has one, stronger, never dropped, same feel', async () => {
        const gear = Object.keys(G.ITEMS).filter(k => (G.ITEMS[k].type === 'weapon' || G.ITEMS[k].type === 'armor') && !G.ITEMS[k].up);
        for (const k of gear) { const a = G.ITEMS[k], b = G.ITEMS[k + '+'], s = a.type === 'weapon' ? 'attack' : 'health'; assert(b && b.up && b.base === k && b.chance === 0 && b[s] >= a[s] + 2 && b.family === a.family && b.tierN === a.tierN, k); eq(G.reforgeCost(k + '+'), null); assert(G.reforgeCost(k), k + ' cost'); }
        for (let i = 0; i < 300; i++) { assert(!G.ITEMS[G.randomWeaponKey()].up && !G.ITEMS[G.randomArmorKey()].up, 'reforged item dropped'); }
        const t = G.combat('w:pike'), u = G.combat('w:pike+'); eq([u.range, u.cd, u.ranged], [t.range, t.cd, t.ranged]); assert(u.dmg > t.dmg);
      }],
      ['recipe tiers: every tier 0..5 has recipes, gated by KNOWLEDGE_TIERS', async () => {
        for (let t = 0; t <= 5; t++) assert(G.RECIPES.some(r => r.tier === t), 'tier ' + t);
        for (const r of G.RECIPES) { eq(r.needs, r.tier ? G.KNOWLEDGE_TIERS[r.tier - 1] : 0, r.id); assert(G.ITEMS[r.out], r.out); }
      }],
      ['server: learn only at a bench, in branch order, with points; Thrifty Hands makes crafting cheaper', async () => {
        const [[c], id] = await inMerchant(srv.port, 1, ['goblin=0']);   // small goblin: 60 knowledge = 3 points
        c.send({ tp: [0, 0] }); await sleep(80); eq(await why(c, 'learnFail', { learn: 'thrifty' }), 'room');
        c.send({ tp: at(id) }); await sleep(80);
        eq(await why(c, 'learnFail', { learn: 'scrapper' }), 'order'); eq(await why(c, 'learnFail', { learn: 'nope' }), 'perk');
        c.send({ learn: 'thrifty' }); await c.until(x => x.state.learned === 'thrifty', 2000, 'learned'); eq(c.state.perks, ['thrifty']);
        c.send({ learn: 'scrapper' }); await c.until(x => x.state.perks.length === 2, 2000, 'scrapper'); eq(await why(c, 'learnFail', { learn: 'reforge' }), 'points');
        c.send({ give: 'w:club' }); await c.until(x => x.state.inv.backpack.includes('w:club'), 2000, 'club');
        c.send({ recycle: 'b' + c.state.inv.backpack.indexOf('w:club') }); await c.until(x => x.state.recycled, 2000, 'recycled');
        eq(c.state.recycled.parts, G.recycleFor('w:club', ['scrapper'])); const wood = c.state.parts.wood;   // club: wood 3 + 1, bone 1 + 1
        c.send({ craft: 'r:w:sharpstick' }); await c.until(x => x.state.crafted, 2000, 'crafted'); await c.until(x => x.state.parts.wood === wood - 1, 2000, 'Thrifty: the stick cost 1 wood, not 2');
        await c.close();
      }],
      ['server: Reforge turns the equipped weapon into its + twin and raises attack', async () => {
        const [[c], id] = await inMerchant(srv.port, 1, ['goblin=1']);
        c.send({ tp: at(id) }); c.send({ know: 120 }); await sleep(100);   // 6 points
        eq(await why(c, 'reforgeFail', { reforge: 'weapon' }), 'perk');
        for (const p of ['thrifty', 'scrapper', 'reforge']) c.send({ learn: p }); await c.until(x => x.state.perks && x.state.perks.length === 3, 2000, 'three perks');
        eq(await why(c, 'reforgeFail', { reforge: 'weapon' }), 'parts'); eq(await why(c, 'reforgeFail', { reforge: 'zz' }), 'item');
        for (let i = 0; i < 3; i++) c.send({ give: 'w:ironsword' }); await c.until(x => x.state.inv.backpack.filter(k => k === 'w:ironsword').length === 3, 2000, 'swords');
        for (let i = 0; i < 3; i++) c.send({ recycle: 'b' + i }); await c.until(x => x.state.parts.metal >= G.reforgeCost(x.state.inv.weapon).metal, 2000, 'metal');
        const w = c.state.inv.weapon; c.send({ reforge: 'weapon' }); await c.until(x => x.state.reforged, 2000, 'reforged');
        eq(c.state.inv.weapon, w + '+'); await c.until(x => x.state.players.find(p => p.id === x.state.you).stats.attack === G.ITEMS[w + '+'].attack, 2000, 'attack up');
        eq(await why(c, 'reforgeFail', { reforge: 'weapon' }), 'item', 'only once'); await c.close();
      }],
      ['server: Second Wind saves a goblin from one killing blow per match', async () => {
        const [[a, b], id] = await inMerchant(duo.port, 2, ['goblin=2', 'goblin=0']);
        b.send({ tp: at(id) }); b.send({ know: 120 }); await sleep(100);
        for (const p of ['medic', 'gourmet', 'secondwind']) b.send({ learn: p }); await b.until(x => x.state.perks && x.state.perks.length === 3, 2000, 'guts perks');
        await a.until(x => x.state.round && x.state.round.n >= 1, 2000);
        const [cx, cz] = W.rc(0); a.send({ tp: [cx, cz] }); a.send({ m: [cx, cz, -Math.PI / 2] }); b.send({ tp: [cx + 1.3, cz] }); b.send({ m: [cx + 1.3, cz, 0] }); b.send({ hp: 1 }); await sleep(200);
        a.send({ atk: 1 }); await b.until(x => x.state.secondWind, 2000, 'second wind'); assert(!b.state.died, 'died anyway');
        const h = b.msgs.filter(m => m.hit && m.hit.to === b.state.you).pop().hit; eq([h.hp, h.dead], [1, false]);
        await sleep(1100); a.send({ atk: 1 }); await b.until(x => x.state.died, 2000, 'the second killing blow kills');
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  knowledge setup: ' + (e.stack || e)); }
  srv.stop(); duo.stop(); process.exit(fail ? 1 : 0);
})();

// weapons 3: fourteen more weapons (whip / sling / wand families), per-weapon twists (bleed, magic bolt damage, reach) and balance against the old roster
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const NEW = ['shiv', 'pan', 'sling', 'knives', 'bullwhip', 'trident', 'emberwand', 'glaive', 'ballchain', 'barbedlash', 'stormstaff', 'archstaff', 'gildedlash', 'sunstaff'].map(k => 'w:' + k);
const RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3, legendary: 4, transcendent: 5 };
const dps = k => { const c = G.combat(k); return G.ITEMS[k].attack / c.cd * 1000; };
const eff = k => { const c = G.combat(k); return (c.bolt || G.ITEMS[k].attack) / c.cd * 1000 + (c.bleed ? c.bleed[0] * c.bleed[1] : 0) * 1000 / c.cd; };   // damage per second counting a full bleed
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '700', GK_NEXT_ROUND_MS: '60000', GK_REGEN_SCALE: '0.05', GK_BLEED_MS: '150' }); let fail = 1;
  try {
    fail = await L.run('weapons3', [
      ['roster: fourteen new weapons, unique names, droppable, priced, every tier from uncommon up, the new families have sounds', async () => {
        const items = Object.values(G.ITEMS).filter(i => i.type === 'weapon'); eq(new Set(items.map(i => i.name)).size, items.length, 'duplicate weapon names');
        for (const k of NEW) { const i = G.ITEMS[k]; assert(i && i.chance > 0 && i.price > 0 && i.attack > 0, k); }
        const tiers = new Set(NEW.map(k => G.ITEMS[k].tier)); for (const t of ['uncommon', 'rare', 'mythic', 'legendary', 'transcendent']) assert(tiers.has(t), 'no ' + t + ' weapon');
        const seen = new Set(); for (let i = 0; i < 12000; i++) seen.add(G.randomWeaponKey()); assert(NEW.filter(k => seen.has(k)).length >= 12, 'new weapons rarely drop');
      }],
      ['twists: whips reach far, the sling and knives are ranged, wands and staves throw bolts with their own damage, bleeders bleed', async () => {
        for (const k of ['w:bullwhip', 'w:barbedlash', 'w:gildedlash']) assert(G.combat(k).range >= 3.4 && !G.combat(k).ranged, k);
        assert(G.combat('w:gildedlash').range > G.combat('w:bullwhip').range, 'ladder of reach');
        for (const k of ['w:sling', 'w:knives']) assert(G.combat(k).ranged && G.combat(k).range >= 8, k);
        for (const k of ['w:emberwand', 'w:stormstaff', 'w:archstaff', 'w:sunstaff']) assert(G.combat(k).bolt > 9, k + ' bolt');
        assert(G.combat('w:sunstaff').bolt > G.combat('w:archstaff').bolt && G.combat('w:archstaff').bolt > G.combat('w:stormstaff').bolt && G.combat('w:stormstaff').bolt > G.combat('w:emberwand').bolt, 'bolt ladder');
        for (const k of ['w:trident', 'w:barbedlash', 'w:gildedlash']) assert(G.combat(k).bleed && G.combat(k).bleed[0] > 0, k + ' bleed');
        eq(G.combat('w:staff').bolt, undefined); eq(G.combat('w:sword').range, 2.2); assert(G.combat('w:glaive').range > G.combat('w:halberd').range, 'glaive outreaches the halberd');
        assert(G.combat('w:ballchain').cd > G.combat('w:flail').cd && G.ITEMS['w:ballchain'].attack > G.ITEMS['w:flail'].attack, 'ball and chain slower and heavier');
      }],
      ['balance: damage per second (bleed and bolts counted) fits the tier, a new weapon never beats the best of its tier by more than 15%', async () => {
        const all = Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'weapon' && G.ITEMS[k].chance > 0), table = [];
        for (const k of NEW) {
          const t = RANK[G.ITEMS[k].tier], peers = all.filter(o => !NEW.includes(o) && RANK[G.ITEMS[o].tier] === t).map(eff);
          table.push(G.ITEMS[k].name + ' ' + G.ITEMS[k].tier + ' ' + eff(k).toFixed(0));
          if (peers.length) assert(eff(k) <= Math.max(...peers) * 1.15, k + ' ' + eff(k).toFixed(1) + ' beats its tier peers ' + Math.max(...peers).toFixed(1));
          const lower = all.filter(o => RANK[G.ITEMS[o].tier] < t - 1).map(eff); assert(eff(k) >= Math.max(...lower, 0) * 0.45, k + ' too weak for ' + G.ITEMS[k].tier);
          assert(eff(k) > dps('w:stick'), k + ' worse than the stick');
        }
        console.log('  dps: ' + table.join('; '));
      }],
      ['loot: recycler yields for the new families, workbench recipes for four of them', async () => {
        for (const k of NEW) { const y = G.recycleYield(k); assert(y && Object.keys(y).length, k + ' cannot be recycled'); }
        for (const k of ['w:sling', 'w:bullwhip', 'w:trident', 'w:emberwand']) assert(G.RECIPES.some(r => r.out === k), k + ' has no recipe');
      }],
      ['server: a barbed lash hits at 3.5 m where a sword does not, and the victim bleeds on after the hit', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'goblin=2&wins=0'), connect(srv.port, 'goblin=0&wins=0')]);
        await a.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        const [cx, cz] = W.rc(0), mine = () => b.msgs.filter(m => m.hit && m.hit.to === b.state.you);
        a.send({ tp: [cx, cz] }); a.send({ m: [cx, cz, -Math.PI / 2] }); b.send({ tp: [cx + 3.4, cz] }); b.send({ m: [cx + 3.4, cz, 0] }); await sleep(250);
        await give(a, 'w:sword', 'weapon'); a.send({ atk: 1 }); await sleep(400); eq(mine().length, 0, 'a sword reached 3.4 m');
        await give(a, 'w:barbedlash', 'weapon'); await sleep(700); a.send({ atk: 1 });
        await b.until(x => mine().length >= 4, 3000, 'hit plus three bleed ticks');
        const hits = mine(); eq(hits[0].hit.dmg, 20); assert(!hits[0].hit.bleed, 'first hit is not a bleed'); assert(hits.slice(1, 4).every(h => h.hit.bleed === 1 && h.hit.dmg === 3), 'bleed ticks'); await sleep(600); eq(mine().length, 4, 'bleed ran longer than three ticks');
        await a.close(); await b.close();
      }],
      ['server: a stormstaff bolt does its own damage (36), not the default 9', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'goblin=2&wins=0'), connect(srv.port, 'goblin=0&wins=0')]);
        await a.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        const [cx, cz] = W.rc(0), mine = () => b.msgs.filter(m => m.hit && m.hit.to === b.state.you);
        await give(a, 'w:stormstaff', 'weapon'); a.send({ tp: [cx, cz] }); a.send({ m: [cx, cz, -Math.PI / 2] }); b.send({ tp: [cx + 4, cz] }); b.send({ m: [cx + 4, cz, 0] }); await sleep(900);
        a.send({ atk: 1 }); await b.until(x => mine().length > 0, 3000, 'bolt hit'); eq(mine()[0].hit.dmg, 36);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  weapons3 setup: ' + (e.stack || e)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

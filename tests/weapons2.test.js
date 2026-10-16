// weapons 2: nine new weapons are in the loot tables, have distinct stats, stay balanced against the old roster, and the server honours per-weapon reach
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const NEW = ['scrapcleaver', 'handxbow', 'twinfangs', 'throwaxe', 'pike', 'ogreclub', 'maul', 'arbalest', 'crownsplitter'].map(k => 'w:' + k);
const dps = k => G.ITEMS[k].attack / G.combat(k).cd * 1000, RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3, legendary: 4, transcendent: 5 };
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '700', GK_NEXT_ROUND_MS: '60000', GK_REGEN_SCALE: '0.05' }); let fail = 1;
  try {
    fail = await L.run('weapons2', [
      ['roster: nine new weapons, all droppable, priced, unique names, a valid family with a swing clip and an icon', async () => {
        const names = new Set(Object.values(G.ITEMS).filter(i => i.type === 'weapon').map(i => i.name));
        eq(names.size, Object.values(G.ITEMS).filter(i => i.type === 'weapon').length, 'duplicate weapon names');
        for (const k of NEW) { const i = G.ITEMS[k]; assert(i && i.chance > 0 && i.price > 0 && i.attack > 0, k); assert(G.randomShop && G.WEAPONS[k.slice(2)], k + ' missing from WEAPONS'); assert(['sword', 'dagger', 'axe', 'spear', 'club', 'hammer', 'crossbow'].includes(i.family), k + ' family ' + i.family); }
        const seen = new Set(); for (let i = 0; i < 4000; i++) seen.add(G.randomWeaponKey()); assert(NEW.filter(k => seen.has(k)).length >= 8, 'new weapons rarely drop');
      }],
      ['stats: reach, speed and weight differ in the intended direction', async () => {
        assert(G.combat('w:pike').range > 3 && G.combat('w:pike').range > G.combat('w:spear').range, 'pike reach');
        assert(G.combat('w:twinfangs').cd < G.combat('w:dagger').cd, 'twin fangs faster than the dagger');
        assert(G.combat('w:maul').cd > G.combat('w:warhammer').cd && G.ITEMS['w:maul'].attack > G.ITEMS['w:warhammer'].attack, 'maul slower and heavier than the warhammer');
        for (const k of ['w:handxbow', 'w:throwaxe', 'w:arbalest']) assert(G.combat(k).ranged && G.combat(k).range >= 8, k + ' ranged');
        assert(G.combat('w:arbalest').range > G.combat('w:crossbow').range && G.combat('w:arbalest').cd > G.combat('w:crossbow').cd, 'arbalest outranges but is slower');
        eq(G.combat('w:sword').range, 2.2); eq(G.combat('w:bow').ranged, true);   // old weapons unchanged
      }],
      ['balance: damage per second rises with tier, a new weapon never beats the old best of a higher tier, nothing is below the stick', async () => {
        const all = Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'weapon' && G.ITEMS[k].chance > 0);
        for (const k of NEW) { const t = RANK[G.ITEMS[k].tier]; const peers = all.filter(o => !NEW.includes(o) && RANK[G.ITEMS[o].tier] === t).map(dps);
          if (peers.length) assert(dps(k) <= Math.max(...peers) * 1.15, k + ' dps ' + dps(k).toFixed(1) + ' beats its tier peers (' + Math.max(...peers).toFixed(1) + ')');
          const lower = all.filter(o => RANK[G.ITEMS[o].tier] < t - 1).map(dps); assert(dps(k) >= Math.max(...lower, 0) * 0.5, k + ' dps ' + dps(k).toFixed(1) + ' is too weak for tier ' + G.ITEMS[k].tier);
          assert(dps(k) > dps('w:stick')); }
        const rare = all.filter(k => G.ITEMS[k].chance < 1); assert(rare.every(k => dps(k) >= 100 || dps('w:slayer') > 0), 'sanity');
      }],
      ['server: the heavy pike hits at 3 m where a sword does not', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'goblin=2&wins=0'), connect(srv.port, 'goblin=0&wins=0')]);
        await a.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
        const [cx, cz] = W.rc(0), hits = () => b.msgs.filter(m => m.hit && m.hit.to === b.state.you).length;
        await give(a, 'w:sword', 'weapon'); a.send({ tp: [cx, cz] }); a.send({ m: [cx, cz, -Math.PI / 2] }); b.send({ tp: [cx + 3.0, cz] }); b.send({ m: [cx + 3.0, cz, 0] }); await sleep(250);
        a.send({ atk: 1 }); await sleep(400); eq(hits(), 0, 'a sword reached 3 m');
        await give(a, 'w:pike', 'weapon'); await sleep(900); a.send({ atk: 1 }); await b.until(x => hits() > 0, 2000, 'pike hit at 3 m');
        const h = b.msgs.find(m => m.hit && m.hit.to === b.state.you).hit; eq(h.dmg, G.ITEMS['w:pike'].attack);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  weapons2 setup: ' + (e.stack || e)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

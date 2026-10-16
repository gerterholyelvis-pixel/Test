// ARMOUR-3: ten more armours, thorns, armour recycling, speed-aware bot choice, itemart/overlay coverage.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, G = require('../items.js'), fs = require('fs'), path = require('path');
const NEW = ['cloak', 'tabard', 'carapace', 'thornhide', 'runed', 'ironbark', 'cairn', 'quillhide', 'shroud', 'emberforge'].map(k => 'a:' + k);
const FACE_E = -Math.PI / 2;
const put = async (c, x, z, yaw) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2' }); let fail = 1;
  try {
    fail = await L.run('armour3', [
      ['ten new armours: unique names and families, below the Aegis, tradeoffs are real', async () => {
        for (const k of NEW) { const it = G.ITEMS[k]; assert(it && it.type === 'armor' && it.chance > 0 && it.health > 0 && it.health < G.ITEMS['a:aegis'].health, k); }
        const fams = NEW.map(k => G.ITEMS[k].family); eq(new Set(fams).size, fams.length, 'one family each');
        const old = new Set(Object.values(G.ITEMS).filter(i => i.type === 'armor' && !i.up && !NEW.includes(i.key)).map(i => i.family)); for (const f of fams) assert(!old.has(f), f + ' is a new family');
        const names = Object.values(G.ITEMS).filter(i => i.type === 'armor').map(i => i.name); eq(new Set(names).size, names.length);
        assert(G.ITEMS['a:cloak'].speed > 1 && G.ITEMS['a:cloak'].health < 50 && G.ITEMS['a:cairn'].speed < 1 && G.ITEMS['a:cairn'].health > G.ITEMS['a:tower'].health);
        for (const k of NEW) { const it = G.ITEMS[k]; if (it.thorns) { assert(it.thorns <= 10, k + ' thorns small'); assert(it.speed >= 0.9 || it.thorns < 7); } assert(!it.speed || (it.speed >= 0.85 && it.speed <= 1.15), k + ' speed'); }
        eq(G.armorThorns('a:quillhide'), 6); eq(G.armorThorns('a:chain'), 0); eq(G.armorThorns(null), 0);
      }],
      ['bots weigh speed and thorns: Tower Plate loses to Dwarven Plate, thorns count for something', async () => {
        assert(G.armorScore('a:tower') < G.armorScore('a:dwarven'), 'slow plate is not simply better');
        assert(G.armorScore('a:swiftwrap') > G.ITEMS['a:swiftwrap'].health, 'speed adds value');
        assert(G.armorScore('a:quillhide') > G.ITEMS['a:quillhide'].health * 0.97, 'thorns add value'); eq(G.armorScore('w:sword'), 0);
      }],
      ['armour recycles into parts, but never more than the recipe cost, and common bench armour not at all', async () => {
        const y = G.recycleYield('a:chain'); assert(y && Object.keys(y).length && y.metal > 0, 'chain recycles to metal');
        eq(G.recycleYield('a:robe'), null); eq(G.recycleYield('a:royal'), null); eq(G.recycleYield('a:leafwrap'), null);
        const parts = new Set(G.PARTS.map(p => p.key)); for (const k of Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'armor' && G.ITEMS[k].chance > 0)) { const r = G.recycleYield(k); assert(r && Object.keys(r).length, k + ' recycles'); for (const p in r) assert(parts.has(p), k + ' part ' + p); }
        const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
        for (const r of G.RECIPES) if (G.ITEMS[r.out].type === 'armor') assert(sum(G.recycleYield(r.out) || {}) < sum(r.cost), r.out + ' recycle must stay below its recipe cost');
      }],
      ['new recipes are valid and use knowledge-tier thresholds', async () => {
        const parts = new Set(G.PARTS.map(p => p.key)), rs = G.RECIPES.filter(r => NEW.includes(r.out)); assert(rs.length >= 5);
        for (const r of rs) { eq(r.needs, G.KNOWLEDGE_TIERS[r.tier - 1]); for (const p in r.cost) assert(parts.has(p)); }
      }],
      ['every new family has a goblin overlay and a baked icon model', async () => {
        const game = src('game.js'), m = game.match(/const ARMOUR3_FAMS = \{([^}]*)\}/); assert(m, 'ARMOUR3_FAMS missing'); const have = m[1].split(',').map(s => s.split(':')[0].trim());
        const art = src('itemart.js');
        for (const k of NEW) { const f = G.ITEMS[k].family; assert(have.includes(f), k + ' overlay'); assert(art.includes("'" + k + "': ['" + f + "'"), k + ' itemart entry'); assert(new RegExp('\\n\\s{4}' + f + '\\(b, c, p\\)').test(art), f + ' itemart builder'); }
        for (const k of ['swiftwrap', 'bonemail', 'furmantle', 'scrapplate', 'reaver', 'lamellar', 'tower', 'vaultbrig', 'gilded']) { const f = G.ITEMS['a:' + k].family; assert(art.includes("'a:" + k + "': ['" + f + "'"), k + ' itemart entry'); assert(new RegExp('\\n\\s{4}' + f + '\\(b, c, p\\)').test(art), f + ' itemart builder'); }
      }],
      ['thorns: a melee hit on Thornhide hurts the attacker (never lethal), a bare-armour target does not', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'goblin=2&wins=901'), connect(srv.port, 'goblin=0&wins=901')]);
        await a.until(x => x.state.players && x.state.players.some(p => p.id === b.state.you), 1500, 'same match'); await a.until(x => x.state.match && x.state.match.alive === 2, 2000, 'entered');
        b.send({ give: 'a:thornhide' }); await b.until(x => x.state.inv.backpack.includes('a:thornhide'), 2000, 'armour'); b.send({ mv: ['b' + b.state.inv.backpack.indexOf('a:thornhide'), 'armor'] }); await b.until(x => x.state.inv.armor === 'a:thornhide', 2000, 'worn');
        await put(a, -15, -15, FACE_E); await put(b, -14, -15, 0);
        const n = a.msgs.length; a.send({ atk: 1 }); await sleep(200);
        const hs = a.msgs.slice(n).filter(m => m.hit).map(m => m.hit), thorn = hs.find(h => h.thorns);
        assert(thorn && thorn.to === a.state.you && thorn.from === b.state.you && thorn.dmg === 3, 'thorns hit back: ' + JSON.stringify(hs)); assert(thorn.hp >= 1 && !thorn.dead);
        await a.close(); await b.close();
      }],
    ]);
  } finally { await srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

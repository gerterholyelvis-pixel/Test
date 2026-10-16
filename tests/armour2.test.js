// ARMOUR-2: the nine new armours (data, balance, recipes, speed tradeoff, overlay coverage). Pure logic, no server.
const L = require('./lib.js'), { assert, eq } = L, G = require('../items.js'), fs = require('fs'), path = require('path');
const NEW = ['swiftwrap', 'bonemail', 'furmantle', 'scrapplate', 'reaver', 'lamellar', 'tower', 'vaultbrig', 'gilded'].map(k => 'a:' + k);
(async () => {
  const fail = await L.run('armour2', [
    ['new armours exist, are armour, drop-eligible and have unique names', async () => {
      for (const k of NEW) { const it = G.ITEMS[k]; assert(it && it.type === 'armor' && it.chance > 0 && it.health > 0, k); }
      const names = Object.values(G.ITEMS).filter(i => i.type === 'armor').map(i => i.name); eq(new Set(names).size, names.length, 'armour names must be unique');
    }],
    ['balance: nothing outclasses the Titan\'s Aegis, vault pieces are legendary or better, speed is a real tradeoff', async () => {
      const top = G.ITEMS['a:aegis'].health;
      for (const k of NEW) assert(G.ITEMS[k].health < top, k + ' must stay below the Aegis');
      for (const k of ['a:vaultbrig', 'a:gilded']) assert(G.ITEMS[k].tierN >= 4, k + ' is vault tier');
      assert(G.ITEMS['a:swiftwrap'].speed > 1 && G.ITEMS['a:swiftwrap'].health < G.ITEMS['a:sack'].health + 10, 'Swiftwrap: fast but frail');
      assert(G.ITEMS['a:tower'].speed < 1 && G.ITEMS['a:tower'].health > G.ITEMS['a:dwarven'].health, 'Tower Plate: slow but tough');
      assert(G.MAX_ARMOR_SPEED >= 1.12 && G.armorSpeed('a:tower') === 0.92 && G.armorSpeed('a:chain') === 1 && G.armorSpeed(null) === 1);
      for (const it of Object.values(G.ITEMS)) if (it.speed) assert(it.speed >= 0.85 && it.speed <= 1.15, it.key + ' speed within +-15%');
    }],
    ['workbench recipes: valid outputs, tier knowledge matches the tree, parts exist', async () => {
      const parts = new Set(G.PARTS.map(p => p.key)), rs = G.RECIPES.filter(r => NEW.includes(r.out));
      for (const r of rs) { eq(r.needs, G.KNOWLEDGE_TIERS[r.tier - 1]); for (const p in r.cost) assert(parts.has(p), r.id + ' part ' + p); }
      assert(rs.length >= 4);
    }],
    ['every new armour family has a goblin overlay', async () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8'), m = src.match(/const ARMOUR2_FAMS = \{([^}]*)\}/); assert(m, 'ARMOUR2_FAMS missing');
      const have = m[1].split(',').map(s => s.split(':')[0].trim());
      for (const k of NEW) assert(have.includes(G.ITEMS[k].family), k + ' family ' + G.ITEMS[k].family + ' has no overlay');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

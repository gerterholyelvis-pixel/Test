// ITEM AFFIXES (affix.js + items.js AFFIX block): keys, deterministic rolls, power cap sim, combat numbers, recycle / reforge.
const L = require('./lib.js'), { assert, eq } = L, G = require('../items.js'), A = require('../affix.js');
const gear = Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'weapon' || G.ITEMS[k].type === 'armor');   // includes the '+' twins
(async () => {
  const fail = await L.run('affix', [
    ['keys parse, round-trip and reject junk', async () => {
      eq(JSON.stringify(A.parse('w:sword@keen,heavy')), JSON.stringify({ root: 'w:sword', ids: ['keen', 'heavy'] }));
      eq(A.parse('w:sword@keen+').root, 'w:sword+'); eq(A.keyOf('w:sword+', ['keen']), 'w:sword@keen+');
      for (const bad of ['w:sword', 'w:sword@', 'w:sword@nope', 'w:sword@keen,keen', 'w:sword@keen,heavy,swift', 'w:sword@__proto__', '@keen']) eq(A.parse(bad), null, bad);
      assert(!G.ITEMS['w:sword@sturdy'], 'armour affix on a weapon is refused'); assert(!G.ITEMS['a:chain@keen'], 'weapon affix on armour is refused'); assert(!G.ITEMS['x:bomb@keen'] && !G.info('w:sword@zzz'));
      assert(G.info('w:sword@keen,heavy').aff.length === 2 && 'w:sword@keen,heavy' in G.ITEMS);
      assert(Object.keys(G.ITEMS).every(k => k.indexOf('@') < 0), 'minted items never leak into the plain item list');
    }],
    ['roll is deterministic per seed, varied across seeds, never on starter / bench / class gear', async () => {
      const it = G.ITEMS['w:axe'];
      for (let s = 1; s < 200; s++) eq(JSON.stringify(A.roll(it, s)), JSON.stringify(A.roll(it, s)));
      const seen = new Set(); for (let s = 0; s < 3000; s++) seen.add(A.roll(it, s).join(','));
      assert(seen.size >= 10, 'variety: ' + seen.size);
      for (const k of ['w:dagger+', 'w:sharpstick', 'a:leafwrap', 'w:staff', 'w:scepter', 'a:royal', 'a:robe']) for (let s = 0; s < 300; s++) assert(A.roll(G.ITEMS[k], s).length === 0 || G.ITEMS[k].chance > 0, k);
      for (const k of ['w:sharpstick', 'a:leafwrap', 'w:staff', 'a:royal']) for (let s = 0; s < 300; s++) eq(A.roll(G.ITEMS[k], s).length, 0, k);
      eq(G.foundKey('x:bomb'), 'x:bomb'); eq(G.foundKey('w:sharpstick', () => 0.3), 'w:sharpstick'); eq(G.foundKey('w:sword@keen'), 'w:sword@keen');
    }],
    ['rarity scales the chance; overall about one found item in four', async () => {
      const rate = k => { let n = 0; for (let s = 0; s < 4000; s++) if (A.roll(G.ITEMS[k], s * 7919 + 13).length) n++; return n / 4000; };
      assert(rate('w:ironsword') > rate('w:dagger') && rate('a:aegis') > rate('a:vest'), 'rarer = more often');
      let aff = 0, n = 3000, r = A.rng(5); for (let i = 0; i < n; i++) { const k = G.foundKey(G.randomWeaponKey(), r); if (k.includes('@')) aff++; }
      assert(aff / n > 0.1 && aff / n < 0.4, 'share ' + aff / n);
    }],
    ['power cap sim: every item with every one or two affixes stays within the cap, and never beats a clearly better item', async () => {
      const power = k => A.power(G.ITEMS[k], null), ids = A.IDS; let combos = 0, over = 0;
      for (const k of gear) { const it = G.ITEMS[k]; if (it.chance < 0) continue;
        const ok = ids.filter(i => A.AFFIXES[i].type === it.type);
        for (const sets of [ok.map(i => [i]), ok.flatMap((a, x) => ok.slice(x + 1).map(b => [a, b]))]) for (const set of sets) {
          if (!A.withinCap(it, set)) continue;   // the roll never picks an over-cap set
          combos++; const p = A.power(it, A.effect(it, set)), base = A.power(it); if (p > Math.max(base * A.CAP, base + 1) + 1e-6) over++;
        } }
      eq(over, 0); assert(combos > 1500, 'combos ' + combos);
      // a rolled item (any seed) is never worth more than the cap, and stays below any item that is >= 30% better in its own right
      for (const k of gear.filter(k => G.ITEMS[k].chance > 0)) for (let s = 0; s < 40; s++) {
        const ids = A.roll(G.ITEMS[k], s); if (!ids.length) continue; const fk = A.keyOf(k, ids), p = power(fk);
        assert(p <= Math.max(power(k) * A.CAP, power(k) + 1) + 1e-6, fk);
        for (const b of gear) if (G.ITEMS[b].type === G.ITEMS[k].type && G.ITEMS[b].tierN > G.ITEMS[k].tierN && power(b) >= power(k) * 1.3 + 1) assert(p < power(b), fk + ' vs ' + b);
      }
      for (const k of gear) { const it = G.ITEMS[k]; if (it.type === 'armor' && it.chance > 0) for (const i of ids.filter(i => A.AFFIXES[i].type === 'armor')) { const f = G.ITEMS[k + '@' + i]; if (f && f.speed) assert(f.speed <= G.MAX_ARMOR_SPEED + 1e-9, 'speed cap ' + k); } }
    }],
    ['stats: names, attack, swing speed, reach, bleed chance, leech, health, speed, thorns', async () => {
      const keen = G.ITEMS['w:sword@keen'], sw = G.ITEMS['w:sword'];
      eq(keen.name, 'Keen Rusty Sword'); assert(keen.attack > sw.attack && keen.attack <= sw.attack * 1.15 + 1); eq(G.ITEMS['w:dagger@embers'].name, 'Dagger of Embers'); eq(G.ITEMS['w:sword@keen,embers'].name, 'Keen Rusty Sword of Embers');
      assert(G.combat('w:sword@swift').cd < G.combat('w:sword').cd && G.combat('w:sword@heavy').cd > G.combat('w:sword').cd && G.combat('w:sword@long').range > G.combat('w:sword').range);
      assert(G.combat('w:sword@jagged').bleedAff.chance > 0 && G.combat('w:sword@jagged').bleedAff.dmg >= 1 && G.combat('w:sword@vamp').leech > 0 && !G.combat('w:sword').leech);
      eq(G.combat('w:trident@keen').bleed.join(), '2,3', 'family tune survives'); assert(G.combat('w:bow@swift').ranged);
      assert(G.ITEMS['a:chain@sturdy'].health > G.ITEMS['a:chain'].health && G.ITEMS['a:chain@fleet'].speed > 1 && G.armorSpeed('a:chain@fleet') > 1 && G.armorThorns('a:chain@thorny') === 1 && G.armorThorns('a:quillhide@thorny') === 7);
      assert(G.ITEMS['a:chain@lithe'].health < G.ITEMS['a:chain'].health);
      assert(G.ITEMS['a:chain@sturdy'].price > G.ITEMS['a:chain'].price && G.ITEMS['a:chain@sturdy'].desc.includes('health'));
    }],
    ['recycle, reforge and crafting interactions', async () => {
      eq(JSON.stringify(G.recycleYield('w:axe@keen')), JSON.stringify(G.recycleYield('w:axe')), 'recycles as its plain item');
      eq(JSON.stringify(G.recycleYield('a:chain@sturdy')), JSON.stringify(G.recycleYield('a:chain')));
      assert(G.recycleFor('w:ironsword@keen', []), 'recycleFor works'); assert(G.reforgeCost('w:axe@keen'), 'affixed gear can be reforged'); eq(G.reforgeCost('w:axe@keen+'), null);
      const up = G.ITEMS['w:axe@keen+']; assert(up && up.attack > G.ITEMS['w:axe@keen'].attack && up.aff[0] === 'keen' && up.up, 'reforge keeps the affix');
      assert(!G.RECIPES.some(r => r.out.includes('@')), 'crafting only makes plain gear');
      assert(G.info('w:crownsplitter@balanced,vamp+').key.length < 40, 'key stays under the server limit');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

// Shared item data. Works in the browser (window.GKITEMS) and in Node (require('./items.js')).
(function (root) {
  // ---- 20 base weapons and 20 base armours: every one has its own drop chance (percent, each list adds up to 100)
  // and the rarer it is the stronger it is. `family` says which model/icon shape it uses, `tier` is derived from the chance.
  // Two class items are not in the drop pool: the wizard's Gnarled Staff and Starry Robe, and the king's Royal Scepter and Royal Mantle (start-only, pool: false).
  const W = [   // [key, name, family, chance %, attack]
    ['stick', 'Wooden Stick', 'club', 10.5, 6], ['dagger', 'Dagger', 'dagger', 10, 10], ['sword', 'Rusty Sword', 'sword', 9.5, 12], ['bow', 'Short Bow', 'bow', 8.5, 14],
    ['club', 'Nailed Club', 'club', 8, 15], ['handaxe', 'Hand Axe', 'axe', 7.5, 16], ['spear', 'War Spear', 'spear', 6.5, 18], ['mace', 'Spiked Mace', 'mace', 6, 20],
    ['ironsword', 'Iron Sword', 'sword', 5.5, 24], ['crossbow', 'Crossbow', 'crossbow', 5, 27], ['axe', 'Battle Axe', 'axe', 4.5, 30], ['flail', 'Spiked Flail', 'flail', 4, 34],
    ['longbow', 'Longbow', 'bow', 3.5, 38], ['halberd', 'Halberd', 'halberd', 3, 43], ['warhammer', 'Warhammer', 'hammer', 2.5, 49], ['claymore', 'Claymore', 'sword', 2, 56],
    ['wyrmspear', 'Wyrmfang Spear', 'spear', 1.5, 64], ['executioner', "Executioner's Axe", 'axe', 1, 75], ['shadowfang', 'Shadowfang Dagger', 'dagger', 0.6, 90], ['slayer', 'Goblin Slayer', 'sword', 0.4, 110],
  ];
  // WEAPONS 2: nine more weapons with their own feel (per-item reach / swing time in WEAPON_TUNE below). They reuse existing families so models, icons and swing clips work; chances are relative weights (the pool no longer sums to exactly 100).
  W.push(['scrapcleaver', 'Scrap Cleaver', 'sword', 7.2, 14], ['handxbow', 'Hand Crossbow', 'crossbow', 5, 14], ['twinfangs', 'Twin Fangs', 'dagger', 4.6, 9], ['throwaxe', 'Throwing Axe', 'axe', 4.6, 21],
    ['pike', 'Heavy Pike', 'spear', 3, 30], ['ogreclub', 'Ogre Club', 'club', 2.6, 40], ['maul', 'Siege Maul', 'hammer', 1.1, 72], ['arbalest', 'Arbalest', 'crossbow', 1, 66], ['crownsplitter', 'Crownsplitter', 'axe', 0.3, 120]);
  const A = [   // [key, name, family, chance %, health]
    ['sack', 'Burlap Sack', 'cloth', 10.5, 20], ['cloth', 'Patched Cloth', 'cloth', 10, 30], ['rags', 'Ragged Tunic', 'cloth', 9.5, 40], ['scraps', 'Leather Scraps', 'leather', 8.5, 45],
    ['vest', 'Studded Vest', 'leather', 8, 50], ['jerkin', 'Hide Jerkin', 'leather', 7.5, 56], ['gambeson', 'Padded Gambeson', 'cloth', 6.5, 62], ['boiled', 'Boiled Leather', 'leather', 6, 70],
    ['chain', 'Chainmail Shirt', 'mail', 5.5, 76], ['harness', 'Warlord Harness', 'harness', 5, 80], ['scale', 'Scale Mail', 'mail', 4.5, 90], ['brigandine', 'Brigandine', 'mail', 4, 100],
    ['cuirass', 'Iron Cuirass', 'plate', 3.5, 112], ['banded', 'Banded Mail', 'plate', 3, 125], ['knight', "Knight's Plate", 'plate', 2.5, 140], ['dwarven', 'Dwarven Plate', 'plate', 2, 160],
    ['obsidian', 'Obsidian Armour', 'plate', 1.5, 185], ['dragon', 'Dragonscale Mail', 'mail', 1, 215], ['mythril', 'Mythril Hauberk', 'mail', 0.6, 250], ['aegis', "Titan's Aegis", 'plate', 0.4, 300],
    // ARMOUR-2: nine more pieces with their own look (families light, bone, fur, scrap, spiked, lamellar, bulwark, gilded). The optional 6th value is a movement multiplier:
    // Swiftwrap trades health for speed, Tower Plate trades speed for health. Their chances come on top of the 100 above (drops are weighted, so the lists are relative).
    ['swiftwrap', 'Swiftwrap', 'light', 8, 26, 1.12], ['bonemail', 'Bone Plate', 'bone', 7, 52], ['furmantle', 'Fur Mantle', 'fur', 6, 60], ['scrapplate', 'Scrap Plate', 'scrap', 5, 70],
    ['reaver', 'Reaver Harness', 'spiked', 4.2, 88], ['lamellar', 'Lamellar Vest', 'lamellar', 3.4, 108], ['tower', 'Tower Plate', 'bulwark', 1.8, 175, 0.92],
    ['vaultbrig', 'Vaultguard Brigandine', 'gilded', 1.2, 205], ['gilded', 'Gilded Plate', 'gilded', 0.7, 235],
  ];
  // Tiers 0-5 are named: 0 common, 1 uncommon, 2 rare, 3 mythic, 4 legendary, 5 transcendent. Dropped items are tiers 1-5 (by drop chance); tier 0 is the base items the crafting bench can make.
  const TIER_NAMES = ['common', 'uncommon', 'rare', 'mythic', 'legendary', 'transcendent'];
  const tierOf = c => c >= 7 ? 'uncommon' : c >= 4.5 ? 'rare' : c >= 2.5 ? 'mythic' : c >= 1 ? 'legendary' : 'transcendent';
  // `tierN` (0-5) is shown next to the stats; `tier` is its name and is used for colours.
  const TIER_N = { common: 0, uncommon: 1, rare: 2, mythic: 3, legendary: 4, transcendent: 5 };
  const WEAPONS = {}, ARMOR = {}, ITEMS = {};
  for (const [k, name, family, chance, attack] of W) {
    WEAPONS[k] = { name, attack, family, chance, tier: tierOf(chance) };
    ITEMS['w:' + k] = { key: 'w:' + k, type: 'weapon', name, attack, family, chance, tier: tierOf(chance), tierN: TIER_N[tierOf(chance)], price: Math.round((attack * 3 + 20) / 5) * 5 };
  }
  for (const [k, name, family, chance, health, speed] of A) {
    ARMOR[k] = { name, health, family, chance, tier: tierOf(chance) };
    ITEMS['a:' + k] = { key: 'a:' + k, type: 'armor', name, health, family, chance, tier: tierOf(chance), tierN: TIER_N[tierOf(chance)], price: Math.round((health * 1.4 + 10) / 5) * 5 };
    if (speed) ARMOR[k].speed = ITEMS['a:' + k].speed = speed;   // ARMOUR-2: movement multiplier while worn (missing = 1)
  }
  // ---- TIER 0 base items: what the crafting bench can make for everyone without unlocking anything from the knowledge tree. Never dropped (chance 0).
  const BASE = [   // [key, type, name, family, stat, cost in parts]
    ['w:sharpstick', 'weapon', 'Sharpened Stick', 'spear', 3, { wood: 2 }], ['w:stoneknife', 'weapon', 'Stone Knife', 'dagger', 5, { wood: 1, bone: 1 }], ['w:roughclub', 'weapon', 'Rough Club', 'club', 7, { wood: 3, bone: 1 }],
    ['a:leafwrap', 'armor', 'Leaf Wrap', 'cloth', 10, { cloth: 2 }], ['a:ragwrap', 'armor', 'Rag Wrap', 'cloth', 15, { cloth: 3, string: 1 }], ['a:barkvest', 'armor', 'Bark Vest', 'leather', 22, { wood: 2, leather: 1, string: 1 }],
  ];
  const RECIPES = [];   // { id, out, tier, cost: {part: n}, needs: knowledge required (0 for tier 0) }
  for (const [key, type, name, family, stat, cost] of BASE) {
    ITEMS[key] = type === 'weapon' ? { key, type, name, attack: stat, family, chance: 0, tier: 'common', tierN: 0, price: 10 + stat * 3 } : { key, type, name, health: stat, family, chance: 0, tier: 'common', tierN: 0, price: 10 + Math.round(stat * 1.2) };
    (type === 'weapon' ? WEAPONS : ARMOR)[key.slice(2)] = { name, [type === 'weapon' ? 'attack' : 'health']: stat, family, chance: 0, tier: 'common' };
    RECIPES.push({ id: 'r:' + key, out: key, tier: 0, cost, needs: 0 });
  }
  // Higher-tier recipes unlock through the knowledge tree (tier N needs KNOWLEDGE_TIERS[N-1] knowledge).
  // ARMOUR-2: some of the new armours can be built at the workbench (the rest are loot, merchant stock and the vault relic).
  for (const [key, tier, cost] of [['a:swiftwrap', 1, { cloth: 3, string: 2 }], ['a:bonemail', 1, { bone: 5, string: 2 }], ['a:furmantle', 1, { leather: 3, cloth: 2, string: 1 }], ['a:scrapplate', 2, { metal: 4, leather: 2, string: 1 }], ['a:lamellar', 3, { metal: 5, leather: 3, string: 2 }]])
    RECIPES.push({ id: 'r:' + key, out: key, tier, cost, needs: [20, 40, 60, 80, 100][tier - 1] });   // the values of KNOWLEDGE_TIERS below
  // class items (start-only, never dropped)
  WEAPONS.staff = { name: 'Gnarled Staff', attack: 0, family: 'staff', chance: 0, tier: 'rare' };
  WEAPONS.scepter = { name: 'Royal Scepter', attack: 20, family: 'scepter', chance: 0, tier: 'rare' };
  ARMOR.robe = { name: 'Starry Robe', health: 60, family: 'robe', chance: 0, tier: 'rare' };
  ARMOR.royal = { name: 'Royal Mantle', health: 100, family: 'royal', chance: 0, tier: 'mythic' };
  ITEMS['w:staff'] = { key: 'w:staff', type: 'weapon', name: 'Gnarled Staff', attack: 0, family: 'staff', chance: 0, tier: 'rare', tierN: 2, price: 70 };
  ITEMS['w:scepter'] = { key: 'w:scepter', type: 'weapon', name: 'Royal Scepter', attack: 20, family: 'scepter', chance: 0, tier: 'rare', tierN: 2, price: 150 };
  ITEMS['a:robe'] = { key: 'a:robe', type: 'armor', name: 'Starry Robe', health: 60, family: 'robe', chance: 0, tier: 'rare', tierN: 2, price: 90 };
  ITEMS['a:royal'] = { key: 'a:royal', type: 'armor', name: 'Royal Mantle', health: 100, family: 'royal', chance: 0, tier: 'mythic', tierN: 3, price: 180 };

  // LOOT: the mystery-room goblin plushie is a one-use throwable (quick slot key = throw). Never dropped by chance, only found in plushie mystery rooms. The server decides where it lands; bots and mystery enemies within 8 m run to it for 3 s.
  ITEMS['x:plushie'] = { key: 'x:plushie', type: 'consumable', name: 'Goblin Plushie', family: 'plushie', chance: 0, tier: 'common', tierN: 0, price: 15, desc: 'Press its quick key to throw it. It squeaks, and bots within 8 m run to it for 3 s. One use.' };
  // UTILITY ITEMS (docs/reports/utility-items.md): eight one-use consumables. Press the quick-slot key to use one (server: useItem() in server.js). `use` names the effect; n/ms/r are its numbers.
  // `shop` is the merchant weight, `scrap` is what the recycler returns, `craft` = [tier, cost] puts it on the crafting bench (tier N needs 20 * N knowledge, the same numbers as KNOWLEDGE_TIERS).
  const UTIL = [
    ['bandage', 'Bandage', 'bandage', 'common', 20, 'heal', { n: 12 }, 'Heals 12 HP at once. Useless in sudden death.', 4, { cloth: 1 }, [0, { cloth: 2 }]],
    ['mushroom', 'Healing Mushroom', 'mushroom', 'common', 25, 'regen', { n: 2, ms: 8000 }, 'Heals 2 HP a second for 8 s. A hit ends it. Useless in sudden death.', 4, { wood: 1 }, [0, { wood: 1, cloth: 1 }]],
    ['tonic', 'Speed Tonic', 'tonic', 'uncommon', 35, 'speed', { n: 1.25, ms: 8000 }, '25% faster for 8 s.', 3, { bone: 1 }, [1, { bone: 1, string: 1, crystal: 1 }]],
    ['smoke', 'Smoke Bomb', 'smoke', 'uncommon', 30, 'smoke', { r: 3, ms: 6000 }, 'Thrown. For 6 s nobody can see or shoot into the cloud from beyond 2.5 m.', 3, { cloth: 1, bone: 1 }, [1, { cloth: 2, bone: 1 }]],
    ['bomb', 'Powder Bomb', 'bomb', 'rare', 55, 'bomb', { n: 22, r: 2.5 }, 'Thrown. Blows up after 1 s: 22 damage close, half at the edge of 2.5 m. Spares the thrower.', 2, { metal: 1, bone: 1 }, [2, { metal: 2, bone: 1, string: 1 }]],
    ['wedge', 'Door Wedge', 'wedge', 'uncommon', 30, 'wedge', { r: 4 }, 'Use beside an open door (not the Vault): it stays open one more round.', 3, { wood: 2 }, [1, { wood: 3, metal: 1 }]],
    ['wax', 'Sealing Wax', 'wax', 'common', 20, 'seal', {}, "Use at your room's panel: its pick is sealed for the rest of the round.", 3, { string: 1 }, [0, { string: 1, bone: 1 }]],
    ['lockpick', 'Vault Lockpick', 'lockpick', 'mythic', 90, 'pick', {}, 'Use in a room whose pick is a Vault door: it counts as a second vote this round.', 1, { metal: 2, gem: 1 }, [3, { metal: 3, gem: 2, string: 1 }]],
  ];
  const UTIL_KEYS = [];
  for (const [k, name, family, tier, price, use, num, desc, shop, scrap, craft] of UTIL) {
    const key = 'x:' + k; UTIL_KEYS.push(key);
    ITEMS[key] = { key, type: 'consumable', name, family, chance: 0, tier, tierN: TIER_N[tier], price, use, ...num, desc, shop, scrap };
    RECIPES.push({ id: 'r:' + key, out: key, tier: craft[0], cost: craft[1], needs: craft[0] * 20 });
  }
  const pickUtil = () => { let r = Math.random() * UTIL_KEYS.reduce((a, k) => a + ITEMS[k].shop, 0); for (const k of UTIL_KEYS) { if ((r -= ITEMS[k].shop) < 0) return k; } return UTIL_KEYS[0]; };   // weighted by `shop`
  const START = [   // starting gear per goblin type: 0 small, 1 medium, 2 big, 3 wizard, 4 king
    { weapon: 'w:dagger', armor: 'a:rags' }, { weapon: 'w:club', armor: 'a:vest' }, { weapon: 'w:mace', armor: 'a:harness' },
    { weapon: 'w:staff', armor: 'a:robe' }, { weapon: 'w:scepter', armor: 'a:royal' },
  ];
  const KNOWLEDGE = [60, 40, 30, 80, 40];   // innate stat per goblin type
  const SPEED = [1.12, 1.0, 0.9, 1.0, 0.95];   // BALANCE: movement multiplier per goblin type (walk 4.6, sprint 7.5 m/s times this). Small goblins are the fastest, big the slowest: before this the biggest goblin was also the fastest, the strongest and the toughest.
  const SLOTS = { backpack: 9, quick: 3 };
  const KNOWLEDGE_TIERS = [20, 40, 60, 80, 100];   // the knowledge tree has 5 tiers; tier N needs this much knowledge
  const START_GOLD = 100;   // placeholder starting gold so the merchant can be tried out

  // ---- GOBLIN BRAIN: a dead goblin drops its brain. Eating it gives 5% of the knowledge that goblin had.
  // A brain is an item key 'm:brain:<knowledge of the dead goblin>' (e.g. 'm:brain:60'); use info(key) to read any item key including brains.
  const brainKey = knowledge => 'm:brain:' + Math.round(knowledge * 10) / 10;
  const isBrain = key => typeof key === 'string' && key.startsWith('m:brain:');
  const brainKnowledge = key => isBrain(key) ? Math.max(0, parseFloat(key.slice(8)) || 0) : 0;
  const brainGain = key => Math.round(brainKnowledge(key) * 0.05 * 100) / 100;   // knowledge you gain by eating it
  function info(key) {
    if (isBrain(key)) { const k = brainKnowledge(key); return { key, type: 'consumable', name: 'Goblin Brain', family: 'brain', tier: 'uncommon', chance: 0, knowledge: k, gain: brainGain(key), desc: 'Eat for +' + brainGain(key) + ' knowledge (5% of ' + k + ')' }; }
    return ITEMS[key] || null;
  }
  // ---- RECYCLER: weapons break down into parts (everyone can use a recycler). Yield depends on the weapon family and scales with its tier.
  const PARTS = [['wood', 'Wood'], ['metal', 'Metal'], ['leather', 'Leather'], ['cloth', 'Cloth'], ['gold', 'Gold'], ['bone', 'Bone'], ['gem', 'Gems'], ['string', 'String'], ['crystal', 'Crystal']].map(([key, name]) => ({ key, name }));
  const FAMILY_PARTS = { club: { wood: 3, bone: 1 }, dagger: { metal: 2, leather: 1 }, sword: { metal: 4, leather: 1 }, bow: { wood: 3, string: 2 }, axe: { metal: 3, wood: 2 }, spear: { wood: 3, metal: 2 }, mace: { metal: 3, wood: 2, bone: 1 },
    crossbow: { wood: 3, metal: 2, string: 2 }, flail: { metal: 3, wood: 2, leather: 1 }, halberd: { wood: 3, metal: 3, cloth: 1 }, hammer: { metal: 4, wood: 2 }, staff: { wood: 3, crystal: 1, cloth: 1 }, scepter: { gold: 3, gem: 1 } };
  const TIER_MULT = { common: 0.5, uncommon: 1, rare: 1.5, mythic: 2, legendary: 3, transcendent: 5 };
  function recycleYield(key) {   // -> { part: amount } for a weapon key, or null if the item cannot be recycled (armour is not recyclable yet)
    const it = ITEMS[key]; if (it && it.scrap) return { ...it.scrap };   // UTILITY: utility items break down into one or two parts
    if (!it || it.type !== 'weapon') return null;
    const base = FAMILY_PARTS[it.family] || { metal: 2 }, m = TIER_MULT[it.tier] || 1, out = {};
    for (const k in base) out[k] = Math.max(1, Math.round(base[k] * m));
    if (it.tier === 'mythic') out.gold = (out.gold || 0) + 1;
    if (it.tier === 'legendary') { out.gold = (out.gold || 0) + 2; out.gem = (out.gem || 0) + 1; }
    if (it.tier === 'transcendent') { out.gold = (out.gold || 0) + 5; out.gem = (out.gem || 0) + 3; out.crystal = (out.crystal || 0) + 2; }
    return out;
  }
  // ---- weighted random picks by drop chance (class items are never picked)
  const weaponKeys = Object.keys(ITEMS).filter(k => ITEMS[k].type === 'weapon' && ITEMS[k].chance > 0);
  const armorKeys = Object.keys(ITEMS).filter(k => ITEMS[k].type === 'armor' && ITEMS[k].chance > 0);
  const pickWeighted = keys => { let r = Math.random() * keys.reduce((s, k) => s + ITEMS[k].chance, 0); for (const k of keys) { if ((r -= ITEMS[k].chance) < 0) return k; } return keys[0]; };
  const randomWeaponKey = () => pickWeighted(weaponKeys);   // e.g. 'w:axe'
  const randomArmorKey = () => pickWeighted(armorKeys);     // e.g. 'a:chain'

  // A merchant's stock for one match: 5 different random items (weapons or armour, rarer ones less often), each with a gold price (base price +-20%, rounded to 5).
  function randomShop() {
    const pool = weaponKeys.concat(armorKeys), out = [];
    while (out.length < 5) { const k = pickWeighted(pool); if (!out.some(o => o.key === k)) out.push({ key: k, price: Math.max(5, Math.round(ITEMS[k].price * (0.8 + Math.random() * 0.4) / 5) * 5) }); }
    if (Math.random() < 0.75) { const k = pickUtil(); out[Math.floor(Math.random() * 5)] = { key: k, price: Math.max(5, Math.round(ITEMS[k].price * (0.8 + Math.random() * 0.4) / 5) * 5) }; }   // UTILITY: most shops stock one utility item in place of a gear slot
    return out;
  }
  // Random room layout for one match: the types of the 12 rooms behind the outer doors, in CHEST_ROOMS order (game.js).
  // Edge rooms 1,3,5,7 have a single outer room (ids 2,5,6,9): chest or mystery, never a merchant.
  // Corner rooms 0,2,6,8 have two outer rooms (ids 0/1, 3/4, 7/8, 10/11): each chest, mystery or merchant.
  function randomLayout() {
    const pick = table => { let r = Math.random() * table.reduce((a, b) => a + b[1], 0); for (const [t, w] of table) { if ((r -= w) < 0) return t; } return table[0][0]; };
    const EDGE = [['chest', 60], ['mystery', 40]], CORNER = [['chest', 50], ['mystery', 25], ['merchant', 25]], edgeIds = [2, 5, 6, 9];
    return Array.from({ length: 12 }, (_, id) => pick(edgeIds.includes(id) ? EDGE : CORNER));
  }
  // What is inside one MYSTERY room (rolled by the server per match, or locally in the offline demo), all six equally likely:
  //   { kind: 'weapon', key: 'w:axe' } | { kind: 'armor', key: 'a:vest' } | { kind: 'enemy', enemy: 'troll'|'archer'|'speedy'|'dumb'|'regular' }
  //   | { kind: 'stations', stations: [two different of 'recycler','knowledge','workbench'] } | { kind: 'gold', amount: 50..500 } | { kind: 'plushie' }
  function randomMystery() {
    const kind = ['weapon', 'armor', 'enemy', 'stations', 'gold', 'plushie'][Math.floor(Math.random() * 6)];
    if (kind === 'weapon') return { kind, key: randomWeaponKey() };
    if (kind === 'armor') return { kind, key: randomArmorKey() };
    if (kind === 'enemy') {   // enemy goblins: troll 2, archer 8, speedy 20, dumb 30, regular 50 (these add up to 110, so they are used as relative weights)
      let x = Math.random() * 110, enemy = 'regular';
      for (const [e, w] of [['troll', 2], ['archer', 8], ['speedy', 20], ['dumb', 30], ['regular', 50]]) { if ((x -= w) < 0) { enemy = e; break; } }
      return { kind, enemy };
    }
    if (kind === 'stations') { const st = ['recycler', 'knowledge', 'workbench']; st.splice(Math.floor(Math.random() * 3), 1); return { kind, stations: st }; }
    if (kind === 'gold') return { kind, amount: 50 + 10 * Math.floor(Math.random() * 46) };
    return { kind: 'plushie' };
  }
  const CHEST_WEAPONS = ['w:sword', 'w:axe', 'w:spear', 'w:mace', 'w:bow', 'w:dagger'];   // legacy: old 6-entry chest list (indices), kept until the client reads chestKeys
  // ---- COMBAT rules shared by server and client (server is authoritative). weaponKey may be null (unarmed).
  const COMBAT = { melee: 2.2, ranged: 12, cone: 70 * Math.PI / 180, slack: 0.3, unarmed: 1, regenIdle: 6000, regenEvery: 4000, regenAmt: 1 };
  const SWING_CD = { dagger: 450, sword: 600, club: 600, mace: 650, spear: 650, axe: 750, flail: 750, hammer: 900, halberd: 850, bow: 700, crossbow: 1000, staff: 600, scepter: 600 };   // ms between swings per weapon family, default 600
  // per-weapon overrides of the family defaults: range (m), cd (ms between swings), ranged (hits from afar, like a bow). Reach / speed / weight is what tells the new weapons apart.
  const WEAPON_TUNE = { 'w:scrapcleaver': { range: 1.9, cd: 560 }, 'w:twinfangs': { range: 1.9, cd: 300 }, 'w:handxbow': { range: 10, cd: 650, ranged: true }, 'w:throwaxe': { range: 8, cd: 900, ranged: true },
    'w:pike': { range: 3.1, cd: 850 }, 'w:ogreclub': { cd: 1000 }, 'w:maul': { cd: 1300 }, 'w:arbalest': { range: 16, cd: 1700, ranged: true }, 'w:crownsplitter': { range: 2.4, cd: 800 } };
  function combat(weaponKey) {   // { dmg, range, cd } for the equipped weapon; damage is the attack stat, at least 1 (a staff with attack 0 still bonks for 1)
    const w = weaponKey && ITEMS[weaponKey], fam = w ? w.family : null, ranged = fam === 'bow' || fam === 'crossbow';
    const t = (w && (WEAPON_TUNE[weaponKey] || (w.base && WEAPON_TUNE[w.base]))) || {}, isR = t.ranged != null ? t.ranged : ranged;
    return { dmg: w ? Math.max(1, w.attack) : COMBAT.unarmed, range: t.range || (isR ? COMBAT.ranged : COMBAT.melee), cd: t.cd || (w ? (SWING_CD[fam] || 600) : 500), ranged: isR };
  }
  const armorSpeed = key => { const it = key && ITEMS[key]; return (it && it.speed) || 1; };   // ARMOUR-2: movement multiplier of the worn armour
  const MAX_ARMOR_SPEED = Math.max(1, ...Object.values(ITEMS).map(i => i.speed || 1));
  // KNOWLEDGE-BEGIN (docs/KNOWLEDGE.md): the knowledge tree is the workbench. Knowledge (innate + brains) unlocks recipe tiers; knowledge points buy perks.
  // Points: 1 per KNOW.step knowledge, +1 per brain eaten, minus what the learned perks cost. Perks last until death (death loses them, like everything else).
  // Perks are keyed off generic item fields (type, use, tierN, family), never item ids, so new items work with them automatically.
  const KNOW = { step: 20, medic: 1.5, gourmet: 25, up: 1.2 };
  const BRANCHES = [{ id: 'craft', name: 'Craft' }, { id: 'lore', name: 'Lore' }, { id: 'guts', name: 'Guts' }];
  const PERKS = [   // learned top to bottom inside a branch: rank 2 needs rank 1 of the same branch
    { id: 'thrifty', branch: 'craft', rank: 1, cost: 1, name: 'Thrifty Hands', desc: 'Recipes cost 1 less of every material they need 2 or more of.' },
    { id: 'scrapper', branch: 'craft', rank: 2, cost: 2, name: 'Scrapper', desc: 'The recycler gives you +1 of every material.' },
    { id: 'reforge', branch: 'craft', rank: 3, cost: 3, name: 'Reforge', desc: 'At the bench, reforge a weapon or armour once: +20% attack or health.' },
    { id: 'appraiser', branch: 'lore', rank: 1, cost: 1, name: 'Appraiser', desc: 'Facility maps show what waits in every outer room.' },
    { id: 'eavesdrop', branch: 'lore', rank: 2, cost: 2, name: 'Eavesdropper', desc: 'Facility maps show the doors every room is picking right now.' },
    { id: 'headcount', branch: 'lore', rank: 3, cost: 3, name: 'Head Count', desc: 'Facility maps count the goblins in every room and name the Vault relic.' },
    { id: 'medic', branch: 'guts', rank: 1, cost: 1, name: 'Field Medic', desc: 'Healing items heal 50% more.' },
    { id: 'gourmet', branch: 'guts', rank: 2, cost: 2, name: 'Brain Gourmet', desc: 'Eating a brain also heals 25 HP (not in sudden death).' },
    { id: 'secondwind', branch: 'guts', rank: 3, cost: 3, name: 'Second Wind', desc: 'Once per match, a killing blow leaves you at 1 HP instead.' },
  ];
  const PERK = Object.create(null); for (const p of PERKS) PERK[p.id] = p;   // no prototype: ids come from the network
  const hasPerk = (perks, id) => Array.isArray(perks) && perks.includes(id);
  const perkSpent = perks => (Array.isArray(perks) ? perks : []).reduce((s, id) => s + (PERK[id] ? PERK[id].cost : 0), 0);
  const knowPoints = (knowledge, brains, perks) => Math.max(0, Math.floor((+knowledge || 0) / KNOW.step + 1e-9) + (brains | 0) - perkSpent(perks));
  const knowTier = knowledge => KNOWLEDGE_TIERS.filter(t => (+knowledge || 0) >= t).length;   // 0..5: highest recipe tier unlocked
  function learnFail(id, knowledge, brains, perks) {   // null when the perk can be learned, else 'perk' | 'have' | 'order' | 'points'
    const pk = typeof id === 'string' && PERK[id]; if (!pk) return 'perk';
    if (hasPerk(perks, id)) return 'have';
    if (pk.rank > 1 && !PERKS.some(q => q.branch === pk.branch && q.rank === pk.rank - 1 && hasPerk(perks, q.id))) return 'order';
    return knowPoints(knowledge, brains, perks) < pk.cost ? 'points' : null;
  }
  function recipeCost(r, perks) { const c = { ...r.cost }; if (hasPerk(perks, 'thrifty')) for (const k in c) if (c[k] >= 2) c[k]--; return c; }   // Thrifty Hands
  function recycleFor(key, perks) {   // what the recycler really gives this goblin: Scrapper adds 1 per part on found gear (chance > 0); anything a recipe makes never returns more than that recipe costs (no craft/recycle loops)
    const y = recycleYield(key), it = ITEMS[key]; if (!y || !it) return y;
    if (hasPerk(perks, 'scrapper') && it.chance > 0) for (const k in y) y[k]++;
    const r = RECIPES.find(q => q.out === key || (it.base && q.out === it.base));
    if (r) { const c = recipeCost(r, perks); for (const k in y) { y[k] = Math.min(y[k], c[k] || 0); if (!y[k]) delete y[k]; } }
    return Object.keys(y).length ? y : null;
  }
  const healMult = perks => hasPerk(perks, 'medic') ? KNOW.medic : 1;   // Field Medic: items with use 'heal' or 'regen'
  // Reforge: every weapon and armour has a reforged twin '<key>+' (+20% stat, at least +2), never dropped or sold; it keeps family, tier and feel (combat() reads the base's tune).
  for (const k of Object.keys(ITEMS)) {
    const it = ITEMS[k]; if ((it.type !== 'weapon' && it.type !== 'armor') || it.up || ITEMS[k + '+']) continue;
    const s = it.type === 'weapon' ? 'attack' : 'health';
    ITEMS[k + '+'] = { ...it, key: k + '+', name: it.name + ' +', [s]: Math.max(it[s] + 2, Math.round(it[s] * KNOW.up)), chance: 0, price: Math.round(it.price * 1.3 / 5) * 5, up: 1, base: k };
  }
  function reforgeCost(key) {   // parts to reforge this item, or null if it cannot be reforged (not gear, or already reforged)
    const it = typeof key === 'string' && ITEMS[key]; if (!it || it.up || !ITEMS[key + '+']) return null;
    const t = it.tierN | 0; return it.type === 'weapon' ? { metal: 2 + t } : { metal: 1 + t, leather: 1 };
  }
  // Higher tiers get real gear to craft (tier N = the item's tier, needs KNOWLEDGE_TIERS[N-1] knowledge). Costs beat one same-tier recycle so crafting is an upgrade path, not a swap.
  for (const [key, tier, cost] of [['w:ironsword', 2, { metal: 8, leather: 3, string: 1 }], ['a:chain', 2, { metal: 8, leather: 2, string: 1 }],
    ['w:halberd', 3, { metal: 10, wood: 6, cloth: 2 }], ['a:cuirass', 3, { metal: 12, leather: 4 }],
    ['w:claymore', 4, { metal: 14, leather: 4, gold: 3, gem: 1 }], ['a:dwarven', 4, { metal: 16, leather: 4, gold: 3, gem: 1 }],
    ['w:slayer', 5, { metal: 18, gold: 8, gem: 4, crystal: 3 }], ['a:aegis', 5, { metal: 20, gold: 8, gem: 4, crystal: 3 }]])
    if (ITEMS[key] && !RECIPES.some(r => r.out === key)) RECIPES.push({ id: 'r:' + key, out: key, tier, cost, needs: KNOWLEDGE_TIERS[tier - 1] });
  // KNOWLEDGE-END
  root.GKITEMS = { KNOW, BRANCHES, PERKS, PERK, hasPerk, perkSpent, knowPoints, knowTier, learnFail, recipeCost, recycleFor, healMult, reforgeCost, UTIL_KEYS, pickUtil, armorSpeed, MAX_ARMOR_SPEED, randomShop, START_GOLD, randomMystery, randomLayout, randomWeaponKey, randomArmorKey, WEAPONS, ARMOR, ITEMS, WEAPON_TUNE, START, KNOWLEDGE, SPEED, KNOWLEDGE_TIERS, RECIPES, CHEST_WEAPONS, SLOTS, tierOf, TIER_N, TIER_NAMES, PARTS, recycleYield, COMBAT, combat, brainKey, isBrain, brainKnowledge, brainGain, info };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GKITEMS;
})(typeof window !== 'undefined' ? window : globalThis);

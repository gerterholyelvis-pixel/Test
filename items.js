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
  // UTIL2-BEGIN (docs/reports/more-items.md): twelve more one-use items that lean on doors, panels, the vault and knowledge, plus six charms for the new passive slot (inv.charm). Same table layout as UTIL above; the numbers live here and server.js USE2 reads them.
  const UTIL2 = [
    ['trap', 'Bear Trap', 'trap', 'uncommon', 40, 'trap', { n: 14, ms: 2500, arm: 1500, life: 90000 }, 'Set it down. After 1.5 s the first other goblin to step on it takes 14 damage and is slowed for 2.5 s. Two at a time.', 3, { metal: 2 }, [1, { metal: 2, wood: 1, string: 1 }]],
    ['flare', 'Signal Flare', 'flare', 'uncommon', 30, 'flare', { ms: 8000 }, 'Burns for 8 s. Every goblin in the match shows on your minimap while it does.', 3, { cloth: 1, crystal: 1 }, [1, { cloth: 1, crystal: 1, bone: 1 }]],
    ['lens', 'Panel Lens', 'lens', 'rare', 50, 'lens', { ms: 12000 }, 'For 12 s your minimap shows the door every room has picked right now.', 2, { crystal: 1, metal: 1 }, [2, { crystal: 2, metal: 1, string: 1 }]],
    ['pry', 'Crowbar', 'pry', 'rare', 55, 'pry', { r: 4, ms: 10000 }, 'Use beside a closed door (not the Vault): it is pried open for 10 s.', 2, { metal: 2 }, [2, { metal: 3, wood: 1 }]],
    ['ward', 'Ward Rune', 'ward', 'rare', 60, 'ward', { ms: 30000 }, 'Soaks up the next hit you take, whatever it is. Fades after 30 s.', 2, { gem: 1, bone: 1 }, [2, { gem: 1, bone: 2, string: 1 }]],
    ['jar', 'Brain Jar', 'jar', 'rare', 80, 'know', { n: 4 }, 'A pickled brain. Eat it for +4 knowledge.', 1, { bone: 1, gem: 1 }, [3, { bone: 2, gem: 1, crystal: 1 }]],
    ['bait', 'Mimic Bait', 'bait', 'uncommon', 35, 'bait', { n: 16 }, 'Leaves a fake loot pile at your feet. The first other goblin to take from it is bitten for 16 damage.', 2, { leather: 1, bone: 1 }, [1, { leather: 2, bone: 1 }]],
    ['dazzle', 'Dazzle Powder', 'dazzle', 'uncommon', 30, 'dazzle', { r: 4.5, ms: 2200 }, 'A flash of light: goblins within 4.5 m cannot attack for 2 s, and bots there cannot see.', 3, { cloth: 1, crystal: 1 }, [1, { cloth: 1, crystal: 1, metal: 1 }]],
    ['haggle', "Haggler's Tag", 'haggle', 'uncommon', 25, 'haggle', {}, 'Your next purchase from a merchant costs half.', 2, { string: 1 }, [1, { string: 1, leather: 1, bone: 1 }]],
    ['rage', 'Rage Brew', 'rage', 'rare', 45, 'rage', { n: 1.3, ms: 10000 }, 'You hit 30% harder for 10 s (damage bonuses never stack past +50%).', 2, { bone: 1, cloth: 1 }, [2, { bone: 2, cloth: 1, string: 1 }]],
    ['feather', 'Homing Feather', 'feather', 'uncommon', 40, 'recall', { ms: 2500 }, 'After 2.5 s you are back in the room you started in. Any hit breaks the spell.', 2, { string: 1, cloth: 1 }, [1, { string: 2, cloth: 1, bone: 1 }]],
    ['bell', 'Alarm Bell', 'bell', 'uncommon', 30, 'bell', { r: 3, ms: 90000, reveal: 5000 }, 'Set it down. When another goblin comes within 3 m you hear it, wherever you are, and see them on your minimap for 5 s. Two at a time.', 2, { metal: 1, string: 1 }, [1, { metal: 2, string: 1 }]],
  ];
  for (const [k, name, family, tier, price, use, num, desc, shop, scrap, craft] of UTIL2) {
    const key = 'x:' + k; UTIL_KEYS.push(key);
    ITEMS[key] = { key, type: 'consumable', name, family, chance: 0, tier, tierN: TIER_N[tier], price, use, ...num, desc, shop, scrap };
    RECIPES.push({ id: 'r:' + key, out: key, tier: craft[0], cost: craft[1], needs: craft[0] * 20 });
  }
  // charms: one passive slot (inv.charm). `eff` holds the numbers; server.js charmEff(p, 'x') reads them, game.js shows the text.
  const CHARMS = [
    ['heart', 'Heart Charm', 'uncommon', 45, { hp: 10 }, 'Wear it: +10 maximum health.', 3, { gem: 1, cloth: 1 }, [2, { gem: 1, cloth: 2, leather: 1 }]],
    ['swift', 'Swift Idol', 'uncommon', 50, { spd: 1.06 }, 'Wear it: you move 6% faster.', 3, { bone: 1, string: 1 }, [2, { bone: 2, string: 2, gem: 1 }]],
    ['magnet', 'Gold Magnet', 'rare', 55, { gold: 1.25 }, 'Wear it: bounties, round income and gold prizes pay 25% more.', 2, { metal: 1, gold: 1 }, [2, { metal: 2, gold: 1, string: 1 }]],
    ['scholar', "Scholar's Charm", 'rare', 60, { know: 1.5 }, 'Wear it: brains and Brain Jars give 50% more knowledge.', 2, { bone: 1, crystal: 1 }, [3, { bone: 2, crystal: 2, string: 1 }]],
    ['tongue', 'Silver Tongue', 'rare', 50, { bribe: 0.7 }, 'Wear it: bribes at a door panel cost 30% less.', 2, { gold: 1, string: 1 }, [2, { gold: 1, string: 2, leather: 1 }]],
    ['fang', 'Wolf Fang', 'uncommon', 45, { dmg: 1.08 }, 'Wear it: you hit 8% harder.', 3, { bone: 2 }, [2, { bone: 3, leather: 1, string: 1 }]],
  ];
  const CHARM_KEYS = [];
  for (const [k, name, tier, price, eff, desc, shop, scrap, craft] of CHARMS) {
    const key = 'c:' + k; CHARM_KEYS.push(key);
    ITEMS[key] = { key, type: 'charm', name, family: k, chance: 0, tier, tierN: TIER_N[tier], price, eff, desc, shop, scrap };
    RECIPES.push({ id: 'r:' + key, out: key, tier: craft[0], cost: craft[1], needs: craft[0] * 20 });
  }
  const pickCharm = () => { let r = Math.random() * CHARM_KEYS.reduce((a, k) => a + ITEMS[k].shop, 0); for (const k of CHARM_KEYS) { if ((r -= ITEMS[k].shop) < 0) return k; } return CHARM_KEYS[0]; };
  const charmEff = (key, field) => { const it = key && ITEMS[key]; return it && it.eff && it.eff[field] != null ? it.eff[field] : undefined; };
  // UTIL2-END
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
    if (Math.random() < 0.3) { const idx = [0, 1, 2, 3, 4].filter(i => !/^[xc]:/.test(out[i].key)), k = pickCharm(), at = idx[Math.floor(Math.random() * idx.length)]; if (at !== undefined) out[at] = { key: k, price: Math.max(5, Math.round(ITEMS[k].price * (0.8 + Math.random() * 0.4) / 5) * 5) }; }   // UTIL2: some shops also stock a charm in place of another gear slot
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
    const t = (w && WEAPON_TUNE[weaponKey]) || {}, isR = t.ranged != null ? t.ranged : ranged;
    return { dmg: w ? Math.max(1, w.attack) : COMBAT.unarmed, range: t.range || (isR ? COMBAT.ranged : COMBAT.melee), cd: t.cd || (w ? (SWING_CD[fam] || 600) : 500), ranged: isR };
  }
  const armorSpeed = key => { const it = key && ITEMS[key]; return (it && it.speed) || 1; };   // ARMOUR-2: movement multiplier of the worn armour
  const MAX_ARMOR_SPEED = Math.max(1, ...Object.values(ITEMS).map(i => i.speed || 1));
  root.GKITEMS = { UTIL_KEYS, pickUtil, CHARM_KEYS, pickCharm, charmEff, armorSpeed, MAX_ARMOR_SPEED, randomShop, START_GOLD, randomMystery, randomLayout, randomWeaponKey, randomArmorKey, WEAPONS, ARMOR, ITEMS, WEAPON_TUNE, START, KNOWLEDGE, SPEED, KNOWLEDGE_TIERS, RECIPES, CHEST_WEAPONS, SLOTS, tierOf, TIER_N, TIER_NAMES, PARTS, recycleYield, COMBAT, combat, brainKey, isBrain, brainKnowledge, brainGain, info };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GKITEMS;
})(typeof window !== 'undefined' ? window : globalThis);

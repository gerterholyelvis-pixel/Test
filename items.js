// Shared item data. Works in the browser (window.GKITEMS) and in Node (require('./items.js')).
(function (root) {
  const AFF = root.GKAFFIX || require('./affix.js'), MINTED = Object.create(null);   // AFFIX (affix.js must load first in the browser)
  // ---- 20 base weapons and 20 base armours: every one has its own drop chance (percent, each list adds up to 100)
  // and the rarer it is the stronger it is. `family` says which model/icon shape it uses, `tier` is derived from the chance.
  // Two class items are not in the drop pool: the wizard's Gnarled Staff and Starry Robe, and the king's Royal Scepter and Royal Mantle (start-only, pool: false).
  const W = [   // [key, name, family, chance %, attack]
    ['stick', 'Wooden Stick', 'club', 10.5, 6], ['dagger', 'Dagger', 'dagger', 10, 10], ['sword', 'Rusty Sword', 'sword', 9.5, 12], ['bow', 'Short Bow', 'bow', 8.5, 14],
    ['club', 'Nailed Club', 'club', 8, 15], ['handaxe', 'Hand Axe', 'axe', 7.5, 16], ['spear', 'War Spear', 'spear', 6.5, 18], ['mace', 'Spiked Mace', 'mace', 6, 20],
    ['ironsword', 'Iron Sword', 'sword', 5.5, 17], ['crossbow', 'Crossbow', 'crossbow', 5, 27], ['axe', 'Battle Axe', 'axe', 4.5, 25], ['flail', 'Spiked Flail', 'flail', 4, 34],
    ['longbow', 'Longbow', 'bow', 3.5, 38], ['halberd', 'Halberd', 'halberd', 3, 43], ['warhammer', 'Warhammer', 'hammer', 2.5, 49], ['claymore', 'Claymore', 'sword', 2, 48],
    ['wyrmspear', 'Wyrmfang Spear', 'spear', 1.5, 58], ['executioner', "Executioner's Axe", 'axe', 1, 66], ['shadowfang', 'Shadowfang Dagger', 'dagger', 0.6, 80], ['slayer', 'Goblin Slayer', 'sword', 0.4, 80],
  ];
  // WEAPONS 2: nine more weapons with their own feel (per-item reach / swing time in WEAPON_TUNE below). They reuse existing families so models, icons and swing clips work; chances are relative weights (the pool no longer sums to exactly 100).
  W.push(['scrapcleaver', 'Scrap Cleaver', 'sword', 7.2, 13], ['handxbow', 'Hand Crossbow', 'crossbow', 5, 16], ['twinfangs', 'Twin Fangs', 'dagger', 4.6, 9], ['throwaxe', 'Throwing Axe', 'axe', 4.6, 21],
    ['pike', 'Heavy Pike', 'spear', 3, 30], ['ogreclub', 'Ogre Club', 'club', 2.6, 44], ['maul', 'Siege Maul', 'hammer', 1.1, 80], ['arbalest', 'Arbalest', 'crossbow', 1, 84], ['crownsplitter', 'Crownsplitter', 'axe', 0.3, 120]);
  // WEAPONS 3: fourteen more, with new families whip / sling / wand and per-weapon twists in WEAPON_TUNE (reach, swing time, ranged, bleed, magic bolt damage). Relative weights again.
  W.push(['shiv', 'Bone Shiv', 'dagger', 7.4, 8], ['pan', 'Frying Pan', 'club', 7, 15], ['sling', 'Goblin Sling', 'sling', 7, 10], ['knives', 'Throwing Knives', 'dagger', 4.8, 11], ['bullwhip', 'Bullwhip', 'whip', 4.7, 11],
    ['trident', 'Trident', 'spear', 4.6, 18], ['emberwand', 'Ember Wand', 'wand', 4.6, 12], ['glaive', 'Reaper Glaive', 'halberd', 2.9, 35], ['ballchain', 'Ball and Chain', 'flail', 3, 52], ['barbedlash', 'Barbed Lash', 'whip', 2.7, 20],
    ['stormstaff', 'Stormstaff', 'staff', 2.6, 36], ['archstaff', 'Archmage Staff', 'staff', 1.3, 62], ['gildedlash', 'Gilded Lash', 'whip', 0.4, 50], ['sunstaff', 'Sunspire Staff', 'staff', 0.3, 95]);
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
    // ARMOUR-3: ten more families. 6th value = speed multiplier, 7th = thorns (flat damage a melee attacker takes back, never lethal; see hitTarget in server.js). Light pieces trade health for speed, heavy ones the reverse.
    ['cloak', "Hunter's Cloak", 'cloak', 7.5, 36, 1.08], ['tabard', 'Sentry Tabard', 'tabard', 6, 68], ['carapace', 'Carapace', 'shell', 5.2, 84, 0.97], ['thornhide', 'Thornhide', 'thorn', 4.6, 80, 1, 3],
    ['runed', 'Runed Vestments', 'runic', 3.6, 86, 1.06], ['ironbark', 'Ironbark Plate', 'timber', 3.2, 128, 0.95], ['cairn', 'Cairn Plate', 'stone', 2.2, 182, 0.9], ['quillhide', 'Quillhide Mail', 'quill', 2, 135, 0.97, 6],
    ['shroud', 'Gravewalker Shroud', 'shroud', 1.6, 125, 1.1], ['emberforge', 'Emberforge Plate', 'ember', 0.5, 265, 0.95, 8],
  ];
  // Tiers 0-5 are named: 0 common, 1 uncommon, 2 rare, 3 mythic, 4 legendary, 5 transcendent. Dropped items are tiers 1-5 (by drop chance); tier 0 is the base items the crafting bench can make.
  const TIER_NAMES = ['common', 'uncommon', 'rare', 'mythic', 'legendary', 'transcendent'];
  const tierOf = c => c >= 7 ? 'uncommon' : c >= 4.5 ? 'rare' : c >= 2.5 ? 'mythic' : c >= 1 ? 'legendary' : 'transcendent';
  // `tierN` (0-5) is shown next to the stats; `tier` is its name and is used for colours.
  const TIER_N = { common: 0, uncommon: 1, rare: 2, mythic: 3, legendary: 4, transcendent: 5 };
  const WEAPONS = {}, ARMOR = {}, ITEMS = new Proxy({}, { get: (t, k) => t[k] !== undefined || typeof k !== 'string' || k.indexOf('@') < 0 ? t[k] : mintAffixed(k), has: (t, k) => k in t || (typeof k === 'string' && k.indexOf('@') > 0 && !!mintAffixed(k)) });   // AFFIX: ITEMS['w:sword@keen'] is minted on first lookup (AFFIX block below); Object.keys(ITEMS) only lists the plain items
  for (const [k, name, family, chance, attack] of W) {
    WEAPONS[k] = { name, attack, family, chance, tier: tierOf(chance) };
    ITEMS['w:' + k] = { key: 'w:' + k, type: 'weapon', name, attack, family, chance, tier: tierOf(chance), tierN: TIER_N[tierOf(chance)], price: Math.round((attack * 3 + 20) / 5) * 5 };
  }
  for (const [k, name, family, chance, health, speed, thorns] of A) {
    ARMOR[k] = { name, health, family, chance, tier: tierOf(chance) };
    ITEMS['a:' + k] = { key: 'a:' + k, type: 'armor', name, health, family, chance, tier: tierOf(chance), tierN: TIER_N[tierOf(chance)], price: Math.round((health * 1.4 + 10) / 5) * 5 };
    if (thorns) ARMOR[k].thorns = ITEMS['a:' + k].thorns = thorns;   // ARMOUR-3
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
  for (const [key, tier, cost] of [['a:swiftwrap', 1, { cloth: 3, string: 2 }], ['a:bonemail', 1, { bone: 5, string: 2 }], ['a:furmantle', 1, { leather: 3, cloth: 2, string: 1 }], ['a:scrapplate', 2, { metal: 4, leather: 2, string: 1 }], ['a:lamellar', 3, { metal: 5, leather: 3, string: 2 }],
    ['w:sling', 1, { wood: 3, string: 2 }], ['w:bullwhip', 1, { leather: 3, string: 1 }], ['w:trident', 2, { wood: 3, metal: 3 }], ['w:emberwand', 2, { wood: 2, crystal: 1, gem: 1 }], ['a:cloak', 1, { leather: 3, cloth: 2, string: 1 }], ['a:tabard', 2, { cloth: 3, metal: 3, string: 1 }], ['a:carapace', 2, { bone: 5, leather: 2, string: 2 }], ['a:thornhide', 2, { wood: 4, leather: 2, string: 2 }], ['a:runed', 3, { cloth: 4, crystal: 1, string: 2 }], ['a:ironbark', 3, { wood: 6, metal: 3, leather: 2 }]])   // WEAPONS 3: four of the new weapons can be crafted
    RECIPES.push({ id: 'r:' + key, out: key, tier, cost, needs: [20, 40, 60, 80, 100][tier - 1] });   // the values of KNOWLEDGE_TIERS below
  // class items (start-only, never dropped)
  WEAPONS.staff = { name: 'Gnarled Staff', attack: 0, family: 'staff', chance: 0, tier: 'rare' };
  WEAPONS.scepter = { name: 'Royal Scepter', attack: 20, family: 'scepter', chance: 0, tier: 'rare' };
  ARMOR.robe = { name: 'Starry Robe', health: 60, family: 'robe', chance: 0, tier: 'rare' };
  ARMOR.royal = { name: 'Royal Mantle', health: 63, family: 'royal', chance: 0, tier: 'mythic' };
  ITEMS['w:staff'] = { key: 'w:staff', type: 'weapon', name: 'Gnarled Staff', attack: 0, family: 'staff', chance: 0, tier: 'rare', tierN: 2, price: 70 };
  ITEMS['w:scepter'] = { key: 'w:scepter', type: 'weapon', name: 'Royal Scepter', attack: 20, family: 'scepter', chance: 0, tier: 'rare', tierN: 2, price: 150 };
  ITEMS['a:robe'] = { key: 'a:robe', type: 'armor', name: 'Starry Robe', health: 60, family: 'robe', chance: 0, tier: 'rare', tierN: 2, price: 90 };
  ITEMS['a:royal'] = { key: 'a:royal', type: 'armor', name: 'Royal Mantle', health: 63, family: 'royal', chance: 0, tier: 'mythic', tierN: 3, price: 180 };

  // LOOT: the mystery-room goblin plushie is a one-use throwable (quick slot key = throw). Never dropped by chance, only found in plushie mystery rooms. The server decides where it lands; bots and mystery enemies within 8 m run to it for 3 s.
  ITEMS['x:plushie'] = { key: 'x:plushie', type: 'consumable', name: 'Goblin Plushie', family: 'plushie', chance: 0, tier: 'common', tierN: 0, price: 15, desc: 'Press its quick key to throw it. It squeaks, and bots within 8 m run to it for 3 s. One use.' };
  // ELIXIR: the Healing Draught is brewed from elixir at a workbench (8 elixir, never dropped, not sold); it uses the normal 'heal' path. The Elixir Flask 'x:flask:<n>' is the pile a dead goblin leaves: taking it adds n to the carried elixir (server loot()), it never sits in a bag.
  ITEMS['x:draught'] = { key: 'x:draught', type: 'consumable', name: 'Healing Draught', family: 'draught', chance: 0, tier: 'uncommon', tierN: 1, price: 30, use: 'heal', n: 30, desc: 'Brewed from elixir. Heals 30 HP at once. Useless in sudden death.', scrap: { cloth: 1, bone: 1 } };
  // UTILITY ITEMS (docs/reports/utility-items.md): eight one-use consumables. Press the quick-slot key to use one (server: useItem() in server.js). `use` names the effect; n/ms/r are its numbers.
  // `shop` is the merchant weight, `scrap` is what the recycler returns, `craft` = [tier, cost] puts it on the crafting bench (tier N needs 20 * N knowledge, the same numbers as KNOWLEDGE_TIERS).
  const UTIL = [
    ['bandage', 'Bandage', 'bandage', 'common', 20, 'heal', { n: 12 }, 'Heals 12 HP at once. Useless in sudden death.', 4, { cloth: 1 }, [0, { cloth: 2 }]],
    ['mushroom', 'Healing Mushroom', 'mushroom', 'common', 25, 'regen', { n: 2, ms: 8000 }, 'Heals 2 HP a second for 8 s. A hit ends it. Useless in sudden death.', 4, { wood: 1 }, [0, { wood: 1, cloth: 1 }]],
    ['tonic', 'Speed Tonic', 'tonic', 'uncommon', 35, 'speed', { n: 1.25, ms: 8000 }, '25% faster for 8 s.', 3, { bone: 1 }, [1, { bone: 1, string: 1, crystal: 1 }]],
    ['smoke', 'Smoke Bomb', 'smoke', 'uncommon', 30, 'smoke', { r: 3, ms: 6000 }, 'Thrown. For 6 s nobody can see or shoot into the cloud from beyond 2.5 m.', 3, { cloth: 1, bone: 1 }, [1, { cloth: 2, bone: 1 }]],
    ['bomb', 'Powder Bomb', 'bomb', 'rare', 55, 'bomb', { n: 22, r: 2.5 }, 'Thrown. Blows up after 1 s: 22 damage close, half at the edge of 2.5 m. Spares the thrower.', 2, { metal: 1, bone: 1 }, [2, { metal: 2, bone: 1, string: 1 }]],
    ['wedge', 'Door Wedge', 'wedge', 'uncommon', 30, 'wedge', { r: 4 }, 'Use beside a closed door (not the Vault): it opens for good when the round ends.', 3, { wood: 2 }, [1, { wood: 3, metal: 1 }]],
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
    ['pry', 'Crowbar', 'pry', 'rare', 55, 'pry', { r: 4, ms: 10000 }, 'Use beside a closed door (not the Vault): it is pried open for good, at once.', 2, { metal: 2 }, [2, { metal: 3, wood: 1 }]],
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
  // ACT5-ITEMS-BEGIN (docs/PLAN-5x5-rooms.md 3 and 4.6, docs/reports/special-rooms-server.md): what the tree rooms and the vaultbreaker heists make. Never sold, never dropped by chance
  // (chance 0, no `shop`), not in UTIL_KEYS. `family` picks an existing icon until they get their own art. Heist tokens: one of each at a time (act5.js enforces it).
  // The Iron Wedge is 'x:ironwedge' because 'x:wedge' is the older Door Wedge; act5.js maps vb5.js's 'x:wedge' onto it.
  for (const [k, name, family, tier, desc, extra] of [
    ['ironwedge', 'Iron Wedge', 'wedge', 'rare', 'Falls from the Ram when a vault door cracks. At the Locksmith grindstone it makes a free Key Blank and sets the first pin.'],
    ['skeleton', 'Skeleton Key', 'lockpick', 'rare', 'Cut at the Locksmith. Robs the Counting House strongbox in 1.5 s, silently.'],
    ['goldleaf', 'Gold Leaf', 'haggle', 'rare', 'From a Counting House robbery. Offered at the Keystone altar it lights the next 2 stones of the circuit.'],
    ['runecharge', 'Rune Charge', 'ward', 'rare', 'From a full Keystone circuit. Spent at the Ram lever, the next strike does double breach.'],
    ['blank', 'Key Blank', 'lockpick', 'uncommon', 'Ground at the Locksmith. Cut it at the lock face once all 5 pins are set.'],
    ['crownseal', 'Crown Seal', 'wax', 'mythic', 'Sudden death only. Use it standing on the vault dais: +5 s of crown claim.', { use: 'crownseal' }],
    ['huskbrain', 'Husk Brain', 'brain', 'common', 'Press it at the Brain Press for +4 knowledge, or eat it anywhere for +2.', { use: 'know', n: 2 }],
    ['springwater', 'Spring Water', 'tonic', 'common', 'Bottled at the Healing Spring. Heals 20 HP. Useless in sudden death.', { use: 'heal', n: 20, heal: 20 }],
    ['blessedwater', 'Blessed Water', 'tonic', 'uncommon', 'Bottled at the Healing Spring with elixir. Heals 40 HP. Useless in sudden death.', { use: 'heal', n: 40, heal: 40 }],
    ['scion', 'Scion', 'mushroom', 'uncommon', 'Cut from the Grafting Bench tree. Graft it onto a weapon or armour in the vise for its reforged twin.'],
  ]) ITEMS['x:' + k] = { key: 'x:' + k, type: 'consumable', name, family, chance: 0, tier, tierN: TIER_N[tier], price: 0, desc, act5: 1, ...(extra || {}) };
  // ACT5-ITEMS-END
  const pickUtil = () => { let r = Math.random() * UTIL_KEYS.reduce((a, k) => a + ITEMS[k].shop, 0); for (const k of UTIL_KEYS) { if ((r -= ITEMS[k].shop) < 0) return k; } return UTIL_KEYS[0]; };   // weighted by `shop`
  const START = [   // starting gear per goblin type: 0 small, 1 medium, 2 big, 3 wizard, 4 king
    { weapon: 'w:dagger', armor: 'a:jerkin' }, { weapon: 'w:club', armor: 'a:vest' }, { weapon: 'w:mace', armor: 'a:scraps' },   // BALANCE-3: small rags -> jerkin, big harness -> scraps (duels at start were 31% / 96%)
    { weapon: 'w:staff', armor: 'a:robe' }, { weapon: 'w:scepter', armor: 'a:royal' },
  ];
  const KNOWLEDGE = [60, 40, 30, 80, 40];   // innate stat per goblin type
  const SPEED = [1.12, 1.0, 0.9, 1.0, 0.95];   // BALANCE: movement multiplier per goblin type (walk 4.6, sprint 7.5 m/s times this). Small goblins are the fastest, big the slowest: before this the biggest goblin was also the fastest, the strongest and the toughest.
  const SLOTS = { backpack: 9, quick: 3 };
  const KNOWLEDGE_TIERS = [20, 40, 60, 80, 100];   // the knowledge tree has 5 tiers; tier N needs this much knowledge
  const START_GOLD = 100;   // placeholder starting gold so the merchant can be tried out
  // GOBTYPES-BEGIN (12 starting goblins; docs/reports/goblin-types.md). Type ids 0-4 never change (saved-character tokens store them), the newer ones are 5-11.
  // odds: percent the server rolls (the common three 20 each = 60, the other nine taper off geometrically (x0.74) to 40, the King rarest at 1).
  // size: model scale (game.js SCALE) and hit-box size; hp: added to the armour's health; reach: extra melee reach in metres; perk: what the server applies (see goblinHit / goblinRegen / equip).
  const GOBLINS = [
    { key: 'small', name: 'Small Goblin', odds: 20, size: 0.75, hp: 0, reach: 0, perk: null, perkName: 'Quick', perkText: 'The fastest of the common goblins.', desc: 'Tiny, twitchy and easy to overlook. Stay low, stay quick.' },
    { key: 'medium', name: 'Goblin', odds: 20, size: 1, hp: 0, reach: 0, perk: null, perkName: 'Steady', perkText: 'No weakness, no tricks: a club and a vest.', desc: 'A sturdy brawler of the horde. Dependable and mean.' },
    { key: 'big', name: 'Big Goblin', odds: 20, size: 1.3, hp: 0, reach: 0, perk: null, perkName: 'Heavy', perkText: 'Starts with a spiked mace. Slow, and a big target.', desc: 'Hulking, loud and hard to ignore. Everyone gets out of your way.' },
    { key: 'wizard', name: 'Goblin Wizard', odds: 4.5, size: 1.1, hp: 0, reach: 0, perk: null, perkName: 'Staff bolt', perkText: 'Starts with a staff that throws bolts. The most knowledge.', desc: 'Robed and rare. The horde whispers of your spells.' },
    { key: 'king', name: 'GOBLIN KING', odds: 1, size: 1.2, hp: 0, reach: 0, perk: null, perkName: 'Royal', perkText: 'Royal gear, but rivals see your crown through the walls.', desc: 'One in a hundred. Every goblin in the cave kneels to you.' },
    { key: 'scout', name: 'Goblin Scout', odds: 11.2, size: 0.9, hp: 0, reach: 0, perk: 'nimble', perkName: 'Nimble', perkText: '1 in 12 melee blows against you miss.', desc: 'Long ears and light feet. Hears you coming, gets there first.' },
    { key: 'sneak', name: 'Goblin Sneak', odds: 8.2, size: 0.88, hp: -10, reach: 0, perk: 'backstab', perkName: 'Backstab', perkText: '+50% damage when you hit a goblin from behind.', desc: 'Hooded, crouched and never where you look.' },
    { key: 'miner', name: 'Goblin Miner', odds: 6.1, size: 0.92, hp: -4, reach: 0, perk: 'prospector', perkName: 'Prospector', perkText: 'Starts with 40 more gold and a pouch of metal, wood and a gem.', desc: 'Short, stocky and covered in grit. Smells gold through rock.' },
    { key: 'shaman', name: 'Goblin Shaman', odds: 3.3, size: 1, hp: -4, reach: 0, perk: 'mending', perkName: 'Mending', perkText: 'Heals twice as often, and starts healing sooner after a hit.', desc: 'Bone mask, horns and old charms. The wounds close by themselves.' },
    { key: 'berserker', name: 'Goblin Berserker', odds: 2.5, size: 1.15, hp: -7, reach: 0, perk: 'rage', perkName: 'Rage', perkText: '+30% damage while below half health.', desc: 'Painted red and screaming. Hurting it only makes it worse.' },
    { key: 'bog', name: 'Bog Goblin', odds: 1.8, size: 0.95, hp: -2, reach: 0, perk: 'thickhide', perkName: 'Thick hide', perkText: 'Takes 10% less damage from everything.', desc: 'A wide-mouthed swamp goblin with a tail. Slimy, slow and hard to hurt.' },
    { key: 'hob', name: 'Hobgoblin', odds: 1.4, size: 1.3, hp: 0, reach: 0.4, perk: 'longarms', perkName: 'Long arms', perkText: 'Melee reach +0.4 m. Tall, so easy to hit.', desc: 'A tall, rust-skinned cousin from the deep. Keeps you at spear length.' },
  ];
  START.push({ weapon: 'w:scrapcleaver', armor: 'a:bonemail' }, { weapon: 'w:twinfangs', armor: 'a:scraps' }, { weapon: 'w:handaxe', armor: 'a:furmantle' },   // BALANCE-3: scout, miner, shaman, berserker and hob kits retuned (tools/balsim.js)
    { weapon: 'w:club', armor: 'a:jerkin' }, { weapon: 'w:club', armor: 'a:bonemail' }, { weapon: 'w:spear', armor: 'a:rags' }, { weapon: 'w:spear', armor: 'a:rags' });
  KNOWLEDGE.push(50, 55, 45, 70, 25, 45, 50);
  SPEED.push(1.04, 1.06, 0.94, 1.0, 1.03, 0.96, 1.0);
  const GOB_PERKS = { nimble: { dodge: 0.08 }, backstab: { mult: 1.5 }, prospector: { gold: 40, parts: { metal: 3, wood: 2, gem: 1 } }, mending: { idle: 0.5, every: 0.5 }, rage: { below: 0.5, mult: 1.3 }, thickhide: { taken: 0.9 }, longarms: {} };
  const HIT_R = 0.35;   // hit-box radius of a size-1 goblin (m): bigger goblins are a little easier to reach, smaller ones a little harder
  const gob = g => GOBLINS[g | 0] || GOBLINS[1];
  function rollGoblin(r) {   // weighted roll -> type id; r in [0, 1) (default Math.random())
    let x = (r == null ? Math.random() : r) * 100;
    for (let i = 0; i < GOBLINS.length; i++) if ((x -= GOBLINS[i].odds) < 0) return i;
    return 1;
  }
  const goblinHp = (g, armorHp) => Math.max(1, armorHp + gob(g).hp);   // max health: armour + the type's bonus
  const hitRadius = g => HIT_R * gob(g).size;
  const goblinReach = g => gob(g).reach;
  function goblinHit(att, tgt, dmg, ctx = {}) {   // att / tgt: { goblin, hp, max, npc }; ctx: { melee, behind, rnd }. -> { dmg, dodged }. NPCs have no perks.
    const pa = att && !att.npc ? gob(att.goblin).perk : null, pt = tgt && !tgt.npc ? gob(tgt.goblin).perk : null, rnd = ctx.rnd == null ? Math.random() : ctx.rnd;
    if (pt === 'nimble' && ctx.melee && rnd < GOB_PERKS.nimble.dodge) return { dmg: 0, dodged: true };
    let d = dmg; const cue = {};   // BALANCE-3: cue says which perk fired, so the client can show it (backstab / rage)
    if (pa === 'backstab' && ctx.behind) { d *= GOB_PERKS.backstab.mult; cue.backstab = 1; }
    if (pa === 'rage' && att.max > 0 && att.hp < att.max * GOB_PERKS.rage.below) { d *= GOB_PERKS.rage.mult; cue.rage = 1; }
    if (pt === 'thickhide') d *= GOB_PERKS.thickhide.taken;
    return { dmg: Math.max(1, Math.round(d)), dodged: false, ...cue };
  }
  const goblinRegen = g => gob(g).perk === 'mending' ? GOB_PERKS.mending : { idle: 1, every: 1 };   // multipliers on COMBAT.regenIdle / regenEvery
  const goblinStart = g => gob(g).perk === 'prospector' ? GOB_PERKS.prospector : null;   // extra gold and parts at the start
  // GOBTYPES-END

  // ---- GOBLIN BRAIN: a dead goblin drops its brain. Eating it gives 5% of the knowledge that goblin had.
  // A brain is an item key 'm:brain:<knowledge of the dead goblin>' (e.g. 'm:brain:60'); use info(key) to read any item key including brains.
  const brainKey = knowledge => 'm:brain:' + Math.round(knowledge * 10) / 10;
  const isBrain = key => typeof key === 'string' && key.startsWith('m:brain:');
  const brainKnowledge = key => isBrain(key) ? Math.max(0, parseFloat(key.slice(8)) || 0) : 0;
  const brainGain = key => Math.round(brainKnowledge(key) * 0.05 * 100) / 100;   // knowledge you gain by eating it
  const isFlask = key => typeof key === 'string' && /^x:flask:\d{1,3}$/.test(key), flaskN = key => isFlask(key) ? +key.slice(8) : 0;
  function info(key) {
    if (isFlask(key)) return { key, type: 'consumable', name: 'Elixir Flask (' + flaskN(key) + ')', family: 'flask', tier: 'rare', tierN: 2, chance: 0, n: flaskN(key), desc: 'Elixir from a fallen goblin. Take it to add ' + flaskN(key) + ' to what you carry.' };
    if (isBrain(key)) { const k = brainKnowledge(key); return { key, type: 'consumable', name: 'Goblin Brain', family: 'brain', tier: 'uncommon', chance: 0, knowledge: k, gain: brainGain(key), desc: 'Eat for +' + brainGain(key) + ' knowledge (5% of ' + k + ')' }; }
    return ITEMS[key] || null;
  }
  // ---- RECYCLER: weapons break down into parts (everyone can use a recycler). Yield depends on the weapon family and scales with its tier.
  const PARTS = [['wood', 'Wood'], ['metal', 'Metal'], ['leather', 'Leather'], ['cloth', 'Cloth'], ['gold', 'Gold'], ['bone', 'Bone'], ['gem', 'Gems'], ['string', 'String'], ['crystal', 'Crystal']].map(([key, name]) => ({ key, name }));
  const FAMILY_PARTS = { club: { wood: 3, bone: 1 }, dagger: { metal: 2, leather: 1 }, sword: { metal: 4, leather: 1 }, bow: { wood: 3, string: 2 }, axe: { metal: 3, wood: 2 }, spear: { wood: 3, metal: 2 }, mace: { metal: 3, wood: 2, bone: 1 },
    crossbow: { wood: 3, metal: 2, string: 2 }, flail: { metal: 3, wood: 2, leather: 1 }, halberd: { wood: 3, metal: 3, cloth: 1 }, hammer: { metal: 4, wood: 2 }, staff: { wood: 3, crystal: 1, cloth: 1 }, scepter: { gold: 3, gem: 1 }, whip: { leather: 3, string: 2 }, sling: { wood: 2, leather: 1, string: 2 }, wand: { wood: 2, crystal: 1, gem: 1 } };
  const TIER_MULT = { common: 0.5, uncommon: 1, rare: 1.5, mythic: 2, legendary: 3, transcendent: 5 };
  // ARMOUR-3: what each armour family breaks into; the tier multiplier and the gold/gem/crystal bonuses are the weapons' (same tail).
  const ARMOR_PARTS = { cloth: { cloth: 3, string: 1 }, leather: { leather: 3, string: 1 }, mail: { metal: 4, leather: 1 }, harness: { leather: 3, metal: 2 }, plate: { metal: 5, leather: 1 },
    light: { cloth: 2, string: 2 }, bone: { bone: 4, string: 1 }, fur: { leather: 2, cloth: 2, bone: 1 }, scrap: { metal: 3, leather: 1 }, spiked: { metal: 3, leather: 2 }, lamellar: { leather: 3, metal: 3 }, bulwark: { metal: 6 }, gilded: { metal: 4, gold: 2 },
    cloak: { cloth: 2, leather: 1 }, tabard: { cloth: 2, metal: 2 }, shell: { bone: 4, leather: 1 }, thorn: { wood: 3, leather: 1, string: 1 }, runic: { cloth: 3, crystal: 1 }, timber: { wood: 5, leather: 1 }, stone: { metal: 3, bone: 2 },
    quill: { leather: 2, bone: 3 }, shroud: { cloth: 3, bone: 1, crystal: 1 }, ember: { metal: 4, crystal: 1, gold: 1 } };
  function armorYield(it) {
    const base = ARMOR_PARTS[it.family]; if (!base || it.tier === 'common') return null;   // bench-craftable common armour never recycles (no craft loops)
    const m = (TIER_MULT[it.tier] || 1) * 0.5, out = {};   // armour returns half what a weapon of its tier does, so a recycle never beats the recipe
    for (const k in base) out[k] = Math.max(1, Math.round(base[k] * m));
    if (it.tier === 'mythic') out.gold = (out.gold || 0) + 1;
    if (it.tier === 'legendary') { out.gold = (out.gold || 0) + 2; out.gem = (out.gem || 0) + 1; }
    if (it.tier === 'transcendent') { out.gold = (out.gold || 0) + 5; out.gem = (out.gem || 0) + 3; out.crystal = (out.crystal || 0) + 2; }
    return out;
  }
  function recycleYield(key) {   // -> { part: amount } for a weapon key, or null if the item cannot be recycled (armour is not recyclable yet)
    const it = ITEMS[key]; if (it && it.scrap) return { ...it.scrap };   // UTILITY: utility items break down into one or two parts
    if (it && it.type === 'armor') return armorYield(it);   // ARMOUR-3: armour breaks down too (class robes are not recyclable)
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
  // Random room layout for one match (docs/PLAN-5x5.md 1.5): the types of the 20 attached rooms 'c0'..'c19' (world.js CHEST order: side s = N E S W holds ids 5s..5s+4, positions 1..5).
  // Positions 2 and 4 (id % 5 = 1 or 3) are homes. Of the 12 loot rooms (positions 1, 3, 5) one is the Master Forge and one the Grand Recycler, on opposite sides (side k and k+2) at a random position;
  // the other 10 roll chest 45 / mystery 35 / merchant 20, with at least one merchant (a random chest is converted when the roll has none).
  const LOOT_ROLL = [['chest', 45], ['mystery', 35], ['merchant', 20]], NATT = 20, isHomeId = id => id % 5 === 1 || id % 5 === 3;
  function randomLayout(rnd = Math.random) {
    const pick = table => { let r = rnd() * table.reduce((a, b) => a + b[1], 0); for (const [t, w] of table) { if ((r -= w) < 0) return t; } return table[0][0]; };
    const out = Array.from({ length: NATT }, (_, id) => isHomeId(id) ? 'home' : null);
    const k = Math.floor(rnd() * 4), slot = s => 5 * s + [0, 2, 4][Math.floor(rnd() * 3)];   // the three loot ids of side s are 5s, 5s+2, 5s+4
    out[slot(k)] = 'forge'; out[slot((k + 2) % 4)] = 'grand';
    const rest = []; for (let id = 0; id < NATT; id++) if (!out[id]) { out[id] = pick(LOOT_ROLL); rest.push(id); }
    if (!rest.some(id => out[id] === 'merchant')) { const ch = rest.filter(id => out[id] === 'chest'), pool = ch.length ? ch : rest; out[pool[Math.floor(rnd() * pool.length)]] = 'merchant'; }
    return out;
  }
  // STATIONS-BEGIN (docs/PLAN-5x5.md 1.6; task E wires bench tiers, craft time and bonusTier): workbench and recycler types are parameters, not code paths.
  // server.js stationAt(m, p, kind) returns { kind, type } and craft() / recycle() read the type from STATIONS. F0 applies the recycler efficiency only.
  const STATIONS = {
    bench: { normal: { maxTier: 2, costMul: 1.0, craftMs: 2500 }, master: { maxTier: 5, costMul: 0.75, craftMs: 800, bonusTier: 1 } },
    recycler: { home: { eff: 0.5 }, full: { eff: 1.0 } },
  };
  function recycleEff(y, eff) {   // a recycler yield at efficiency eff: floor(n * eff) per part, at least 1 of the item's main (largest) part
    if (!y || eff == null || eff >= 1) return y;
    let main = null; for (const k in y) if (main == null || y[k] > y[main]) main = k;
    const out = {}; for (const k in y) { const n = Math.floor(y[k] * eff); if (n > 0) out[k] = n; }
    if (main != null && !out[main]) out[main] = 1;
    return out;
  }
  // knowledge adapters (task E rewires them when the knowledge plan grows; today's behaviour is the default)
  const canCraft = (p, r) => ((p && p.stats && p.stats.knowledge) || 0) >= ((r && r.needs) || 0);
  const addKnowledge = (p, n) => { if (!p || !p.stats || !Number.isFinite(n)) return 0; p.stats.knowledge = Math.round((p.stats.knowledge + n) * 100) / 100; return n; };
  // Bench rules (task E). A recipe is craftable when the knowledge adapter allows it and recipe.tier <= bench.maxTier. Part cost is ceil(cost * costMul) per part (min 1).
  // A bench with bonusTier lets you craft that many tiers above what your knowledge unlocks, at full cost (no discount). craftMs is how long the craft takes.
  const benchSpec = type => STATIONS.bench[type] || STATIONS.bench.normal;
  const partCost = (c, mul) => { const o = {}; for (const k in c) o[k] = c[k] > 0 ? Math.max(1, Math.ceil(c[k] * mul - 1e-9)) : 0; return o; };
  function benchCraft(p, r, type, perks) {   // -> { why: 'knowledge' | 'bench' } or { cost, ms, bonus }
    const sp = benchSpec(type), know = (p && p.stats && p.stats.knowledge) || 0, base = recipeCost(r, perks); let bonus = false;
    if (!canCraft(p, r)) { if (sp.bonusTier && (r.tier | 0) <= knowTier(know) + sp.bonusTier) bonus = true; else return { why: 'knowledge' }; }
    if ((r.tier | 0) > sp.maxTier) return { why: 'bench' };
    return { cost: bonus ? base : partCost(base, sp.costMul), ms: sp.craftMs, bonus };
  }
  // STATIONS-END
  // What is inside one MYSTERY room (rolled by the server per match, or locally in the offline demo), all six equally likely:
  //   { kind: 'weapon', key: 'w:axe' } | { kind: 'armor', key: 'a:vest' } | { kind: 'enemy', enemy: 'troll'|'archer'|'speedy'|'dumb'|'regular' }
  //   | { kind: 'stations', stations: [two different of 'recycler','knowledge','workbench'] } | { kind: 'gold', amount: 50..500 } | { kind: 'plushie' }
  function randomMystery() {
    const kind = ['weapon', 'armor', 'enemy', 'stations', 'gold', 'plushie'][Math.floor(Math.random() * 6)];
    if (kind === 'weapon') return { kind, key: foundKey(randomWeaponKey()) };
    if (kind === 'armor') return { kind, key: foundKey(randomArmorKey()) };
    if (kind === 'enemy') {   // enemy goblins as relative weights (npcx.js WEIGHTS must match): troll 2, archer 8, speedy 20, dumb 30, regular 50, bomber 14, summoner 8, shield 8, thief 10
      let x = Math.random() * 150, enemy = 'regular';
      for (const [e, w] of [['troll', 2], ['archer', 8], ['speedy', 20], ['dumb', 30], ['regular', 50], ['bomber', 14], ['summoner', 8], ['shield', 8], ['thief', 10]]) { if ((x -= w) < 0) { enemy = e; break; } }
      return { kind, enemy };
    }
    if (kind === 'stations') { const st = ['recycler', 'knowledge', 'workbench']; st.splice(Math.floor(Math.random() * 3), 1); return { kind, stations: st }; }
    if (kind === 'gold') return { kind, amount: 50 + 10 * Math.floor(Math.random() * 46) };
    return { kind: 'plushie' };
  }
  const CHEST_WEAPONS = ['w:sword', 'w:axe', 'w:spear', 'w:mace', 'w:bow', 'w:dagger'];   // legacy: old 6-entry chest list (indices), kept until the client reads chestKeys
  // ---- COMBAT rules shared by server and client (server is authoritative). weaponKey may be null (unarmed).
  const COMBAT = { melee: 2.2, ranged: 12, cone: 70 * Math.PI / 180, slack: 0.3, unarmed: 1, regenIdle: 6000, regenEvery: 4000, regenAmt: 1 };
  const SWING_CD = { dagger: 500, sword: 600, club: 600, mace: 650, spear: 650, axe: 750, flail: 750, hammer: 900, halberd: 850, bow: 700, crossbow: 1000, staff: 600, scepter: 600, whip: 520, sling: 520, wand: 650 };   // ms between swings per weapon family, default 600
  // per-weapon overrides of the family defaults: range (m), cd (ms between swings), ranged (hits from afar, like a bow). Reach / speed / weight is what tells the new weapons apart.
  const WEAPON_TUNE = { 'w:scrapcleaver': { range: 1.9, cd: 560 }, 'w:twinfangs': { range: 1.9, cd: 300 }, 'w:handxbow': { range: 10, cd: 650, ranged: true }, 'w:throwaxe': { range: 8, cd: 900, ranged: true },
    'w:pike': { range: 3.1, cd: 850 }, 'w:ogreclub': { cd: 950 }, 'w:maul': { cd: 1200 }, 'w:arbalest': { range: 16, cd: 1050, ranged: true }, 'w:longbow': { cd: 950 }, 'w:crownsplitter': { range: 2.4, cd: 800 },
    // WEAPONS 3. bleed: [damage per tick, ticks] (one tick a second, a new bleed replaces the old). bolt: damage of the slow magic bolt this staff/wand throws instead of swinging (the old staff and scepter keep 9).
    'w:shiv': { range: 1.9, cd: 380 }, 'w:pan': { range: 1.9, cd: 640 }, 'w:sling': { range: 9, cd: 520, ranged: true }, 'w:knives': { range: 8, cd: 430, ranged: true }, 'w:bullwhip': { range: 3.4, cd: 520 },
    'w:trident': { range: 2.6, cd: 640, bleed: [2, 3] }, 'w:emberwand': { cd: 650, bolt: 16 }, 'w:glaive': { range: 3.0, cd: 800 }, 'w:ballchain': { range: 2.4, cd: 1050 }, 'w:barbedlash': { range: 3.6, cd: 540, bleed: [3, 3] },
    'w:stormstaff': { cd: 1000, bolt: 42 }, 'w:archstaff': { cd: 1200, bolt: 62 }, 'w:gildedlash': { range: 4.2, cd: 500, bleed: [5, 3] }, 'w:sunstaff': { cd: 900, bolt: 115 } };
  function combat(weaponKey) {   // { dmg, range, cd } for the equipped weapon; damage is the attack stat, at least 1 (a staff with attack 0 still bonks for 1)
    const w = weaponKey && ITEMS[weaponKey], fam = w ? w.family : null, ranged = fam === 'bow' || fam === 'crossbow';
    const t = (w && (WEAPON_TUNE[weaponKey] || (w.base && WEAPON_TUNE[w.base]))) || {}, isR = t.ranged != null ? t.ranged : ranged;
    return { dmg: w ? Math.max(1, w.attack) : COMBAT.unarmed, range: (t.range || (isR ? COMBAT.ranged : COMBAT.melee)) * (w && w.rngMul || 1), cd: Math.round((t.cd || (w ? (SWING_CD[fam] || 600) : 500)) * (w && w.cdMul || 1)), ranged: isR, ...(t.bleed ? { bleed: t.bleed } : null), ...(t.bolt ? { bolt: t.bolt } : null), ...(w && w.bleedAff ? { bleedAff: w.bleedAff } : null), ...(w && w.leech ? { leech: w.leech } : null) };   // AFFIX: bleedAff {chance,ticks,dmg}, leech
  }
  const armorSpeed = key => { const it = key && ITEMS[key]; return (it && it.speed) || 1; };   // ARMOUR-2: movement multiplier of the worn armour
  const armorThorns = key => { const it = key && ITEMS[key]; return (it && it.thorns) || 0; };   // ARMOUR-3: damage a melee attacker takes back
  // ARMOUR-3: one number for 'which armour is better' that bots use: health, adjusted for speed (1% speed ~ 2% health) and thorns (1 point ~ 6 health).
  const armorScore = key => { const it = key && ITEMS[key]; return it && it.type === 'armor' ? it.health * (1 + 2 * ((it.speed || 1) - 1)) + (it.thorns || 0) * 6 : 0; };
  const MAX_ARMOR_SPEED = Math.max(1, ...Object.values(ITEMS).map(i => i.speed || 1)) * AFF.MAX_SPEED_MUL;   // AFFIX: Fleet / Lithe add up to 6% more
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
    if (r) { const c = partCost(recipeCost(r, perks), STATIONS.bench.master.costMul); for (const k in y) { y[k] = Math.min(y[k], c[k] || 0); if (!y[k]) delete y[k]; } }
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
  // AFFIX-BEGIN (affix.js, docs/reports/variety.md): found gear can carry 0-2 affixes in its key ('w:sword@keen,heavy'). Minted lazily by the ITEMS proxy; foundKey() is what loot sources call.
  function mintAffixed(key) {
    if (MINTED[key] !== undefined) return MINTED[key];
    const pk = AFF.parse(key), plain = pk && ITEMS[pk.root]; let out = null;
    if (plain && (plain.type === 'weapon' || plain.type === 'armor') && plain.chance >= 0 && !plain.root && pk.ids.every(id => AFF.AFFIXES[id].type === plain.type)) {
      const fx = AFF.effect(plain, pk.ids);
      out = { ...plain, ...fx, key, name: AFF.nameOf(plain.name, pk.ids), aff: pk.ids, root: pk.root, base: plain.base || pk.root, price: Math.round(plain.price * (1 + 0.15 * pk.ids.length) / 5) * 5, desc: AFF.textOf(pk.ids).join('; ') };
    }
    if (Object.keys(MINTED).length < 20000) MINTED[key] = out;
    return out;
  }
  const foundKey = (key, rnd) => { const it = key && ITEMS[key]; if (!it || it.root) return key; const ids = AFF.roll(it, Math.floor((rnd || Math.random)() * 4294967296)); return ids.length ? AFF.keyOf(key, ids) : key; };   // a found weapon / armour key, possibly with affixes
  // AFFIX-END
  root.GKITEMS = { foundKey, AFFIX: AFF, KNOW, BRANCHES, PERKS, PERK, hasPerk, perkSpent, knowPoints, knowTier, learnFail, recipeCost, recycleFor, healMult, reforgeCost, UTIL_KEYS, pickUtil, armorSpeed, MAX_ARMOR_SPEED, randomShop, START_GOLD, randomMystery, randomLayout, STATIONS, recycleEff, canCraft, benchSpec, benchCraft, partCost, addKnowledge, randomWeaponKey, randomArmorKey, WEAPONS, ARMOR, ITEMS, WEAPON_TUNE, START, KNOWLEDGE, SPEED, KNOWLEDGE_TIERS, RECIPES, CHEST_WEAPONS, SLOTS, tierOf, TIER_N, TIER_NAMES, PARTS, recycleYield, COMBAT, combat, brainKey, isBrain, brainKnowledge, brainGain, info, armorThorns, armorScore, GOBLINS, GOB_PERKS, HIT_R, rollGoblin, goblinHp, hitRadius, goblinReach, goblinHit, goblinRegen, goblinStart, CHARM_KEYS, pickCharm, charmEff, isFlask, flaskN };
  // BALANCE3-BEGIN (docs/reports/balance-3.md; tools/balsim.js measures every number here). The damage cap, the staff bolt and the two abilities, shared by server, client, bots and the Codex.
  // DMG_CAP: one blow never carries more than x1.75 of its weapon's damage, whatever stacks on it (Wolf Fang, Rage Brew, backstab, berserker rage, Fury, the Oak ambush, the heavy blow).
  // The defender's own reduction (thick hide) still applies after the cap.
  const DMG_CAP = 1.75, STAFF_BOLT = { dmg: 16, cd: 900 }, POINT_BLANK = { r: 2, mul: 0.7 };   // POINT_BLANK: bows, crossbows, slings and thrown weapons hit for 70% inside 2 m (not bolts)
  const goblinTaken = t => t && !t.npc && gob(t.goblin).perk === 'thickhide' ? GOB_PERKS.thickhide.taken : 1;
  const capHit = (base, dmg, tgt) => base > 0 ? Math.min(dmg, Math.max(1, Math.round(base * DMG_CAP * goblinTaken(tgt)))) : dmg;
  // ABILITY: everyone has a DASH (double-tap a direction, or C): a quick 3 m burst with a short window in which blows miss, on a cooldown. Heavy weapons (hammer, axe, mace,
  // club, flail) also have a HEAVY BLOW (hold the right mouse button): a visible wind-up, then a hit for `mult` x damage that staggers the target (it cannot attack for
  // staggerMs). The counterplay to a wind-up is the dash, the counterplay to the dash is to wait it out (cooldown).
  const ABIL = {
    DASH: { dist: 3.2, ms: 200, iframeMs: 250, cd: 3000 },
    HEAVY: { fams: { hammer: 1.6, axe: 1.5, mace: 1.5, club: 1.45, flail: 1.5 }, chargeMs: 550, cdMul: 0.5, staggerMs: 400, moveMul: 0.6 },
    heavyFor: key => { const w = key && ITEMS[key], m = w && w.type === 'weapon' && ABIL.HEAVY.fams[w.family]; return m ? { mult: m } : null; },
    TEXT: [   // what the Codex and the how-to show
      ['Dash', 'Double-tap a direction (or press C): a quick 3 m dash. Blows that land in its first quarter second miss. 3 s cooldown.'],
      ['Heavy blow', 'Hammers, axes, maces, clubs and flails: hold the right mouse button to wind up (0.55 s, you move slower), release to strike for x1.45-1.6 damage. A heavy hit staggers: the target cannot attack for 0.4 s. A dash dodges it.'],
      ['Damage cap', 'One blow never carries more than x1.75 of its weapon damage, whatever stacks on it (charms, Rage Brew, backstab, berserker rage, blessings, the heavy blow).'],
    ],
  };
  Object.assign(root.GKITEMS, { DMG_CAP, STAFF_BOLT, POINT_BLANK, goblinTaken, capHit, ABIL });
  // BALANCE3-END
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GKITEMS;
})(typeof window !== 'undefined' ? window : globalThis);

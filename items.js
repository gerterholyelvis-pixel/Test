// Shared item data. Works in the browser (window.GKITEMS) and in Node (require('./items.js')).
(function (root) {
  const WEAPONS = {
    dagger: { name: 'Dagger', attack: 10 }, club: { name: 'Nailed Club', attack: 15 }, mace: { name: 'Spiked Mace', attack: 20 },
    staff: { name: 'Gnarled Staff', attack: 0 }, scepter: { name: 'Royal Scepter', attack: 20 },
    sword: { name: 'Rusty Sword', attack: 12 }, axe: { name: 'Battle Axe', attack: 22 }, spear: { name: 'War Spear', attack: 18 }, bow: { name: 'Short Bow', attack: 14 },
  };
  const ARMOR = {
    rags: { name: 'Ragged Tunic', health: 40 }, vest: { name: 'Studded Vest', health: 50 }, harness: { name: 'Warlord Harness', health: 80 },
    robe: { name: 'Starry Robe', health: 60 }, royal: { name: 'Royal Mantle', health: 100 },
  };
  const ITEMS = {};   // key -> { key, type: 'weapon' | 'armor', name, attack | health }
  for (const k in WEAPONS) ITEMS['w:' + k] = { key: 'w:' + k, type: 'weapon', name: WEAPONS[k].name, attack: WEAPONS[k].attack };
  for (const k in ARMOR) ITEMS['a:' + k] = { key: 'a:' + k, type: 'armor', name: ARMOR[k].name, health: ARMOR[k].health };
  const START = [   // starting gear per goblin type: 0 small, 1 medium, 2 big, 3 wizard, 4 king
    { weapon: 'w:dagger', armor: 'a:rags' }, { weapon: 'w:club', armor: 'a:vest' }, { weapon: 'w:mace', armor: 'a:harness' },
    { weapon: 'w:staff', armor: 'a:robe' }, { weapon: 'w:scepter', armor: 'a:royal' },
  ];
  const KNOWLEDGE = [60, 40, 30, 80, 40];   // innate stat per goblin type
  const CHEST_WEAPONS = ['w:sword', 'w:axe', 'w:spear', 'w:mace', 'w:bow', 'w:dagger'];   // same order as WEAPONS in game.js (chest room contents)
  const SLOTS = { backpack: 9, quick: 3 };
  // Random room layout for one match: the types of the 12 rooms behind the outer doors, in CHEST_ROOMS order (game.js).
  // Edge rooms 1,3,5,7 have a single outer room (ids 2,5,6,9): chest or mystery, never a merchant.
  // Corner rooms 0,2,6,8 have two outer rooms (ids 0/1, 3/4, 7/8, 10/11): each chest, mystery or merchant.
  function randomLayout() {
    const pick = table => { let r = Math.random() * table.reduce((a, b) => a + b[1], 0); for (const [t, w] of table) { if ((r -= w) < 0) return t; } return table[0][0]; };
    const EDGE = [['chest', 60], ['mystery', 40]], CORNER = [['chest', 50], ['mystery', 25], ['merchant', 25]], edgeIds = [2, 5, 6, 9];
    return Array.from({ length: 12 }, (_, id) => pick(edgeIds.includes(id) ? EDGE : CORNER));
  }
  root.GKITEMS = { randomLayout, WEAPONS, ARMOR, ITEMS, START, KNOWLEDGE, CHEST_WEAPONS, SLOTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GKITEMS;
})(typeof window !== 'undefined' ? window : globalThis);

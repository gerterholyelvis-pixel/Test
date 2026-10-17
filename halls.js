// halls.js: the pure rules of the plain halls (docs/reports/halls-fill.md): what a search can yield, the caps, the per-match events. No I/O, no clock, no Math.random() of its own:
// every function takes `rnd` (() => [0,1)) so the tests run on a seeded rng. UMD: window.GKHALLS in the browser, require() in Node. Positions come from world.js (WORLD.hallSpots).
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKHALLS = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = {
    SEARCH_MS: 2600, CACHE_MS: 1600, STATION_MS: 1800,   // hold E this long (the starter cache is quicker); moving more than MOVE_BREAK or being hit cancels
    MOVE_BREAK: 0.6, REACH_PAD: 1.4, RATE_MS: 150,
    RESTOCK_MS: 100000,                                  // a searched container is empty this long for everybody
    PER_ROUND: 3,                                        // container searches per goblin per round
    GOLD_MATCH: 160, PARTS_MATCH: 36, ITEMS_MATCH: 5,    // per goblin per match, from halls (a mystery room alone can give 50-500 gold)
    FONT_HEAL: 22, STATION_CD: { font: 30000, stew: 30000 },   // a heal font / stew pot: shared recharge
    WHET_MS: 20000, WHET_MUL: 1.12, WHET_CD: 60000,      // whetstone: +12% weapon damage for 20 s, once a minute per goblin
    GUARDS: 3, GUARD_KINDS: ['dumb', 'regular'], DRY_P: 0.2, DRY_MS: [30000, 80000],   // events: guarded halls (weak enemy), containers that start empty
  };
  const CONT_PROFILE = { cache: 'cache', locker: 'general', rack: 'arms', larder: 'util', tomes: 'gold', cashbox: 'gold', parts: 'parts', sunk: 'general', offering: 'gold' };
  const BASIC = ['wood', 'metal', 'leather', 'cloth', 'bone', 'string'];   // what a search finds (the rare parts stay with the tree rooms and the vault)
  const rangeOf = (r, [lo, hi]) => lo + Math.floor(r() * (hi - lo + 1));
  const PROFILES = {   // weighted outcomes: gold [lo, hi], parts [lo, hi] units, util n items, weapon / armor tierMin
    general: [{ w: 55, gold: [8, 16] }, { w: 25, parts: [2, 4], gold: [0, 4] }, { w: 15, util: 1 }, { w: 5, weapon: 1 }],
    arms: [{ w: 30, parts: [3, 5] }, { w: 30, gold: [10, 20] }, { w: 20, util: 1 }, { w: 12, weapon: 2 }, { w: 8, armor: 2 }],
    gold: [{ w: 75, gold: [12, 26] }, { w: 25, gold: [6, 10], parts: [1, 2] }],
    parts: [{ w: 70, parts: [3, 6] }, { w: 30, gold: [6, 12], parts: [1, 2] }],
    util: [{ w: 55, util: 1 }, { w: 30, gold: [6, 12] }, { w: 15, parts: [2, 3] }],
    cache: [{ w: 1, gold: [20, 30], parts: [3, 3], util: 1 }],   // the starter cache of the hall behind a home: always the same kind of reward
  };
  const profileOf = kind => CONT_PROFILE[kind] || 'general';
  function tierPick(G, rnd, fn, tierMin) { let k = null; for (let t = 0; t < 40; t++) { k = fn(); if (k && G.ITEMS[k] && (G.ITEMS[k].tierN | 0) >= tierMin) return k; } return k; }
  // one search: { gold, parts: {key: n}, items: [keys] }. G: GKITEMS (pickUtil, randomWeaponKey, randomArmorKey, ITEMS)
  function rollLoot(kind, rnd, G, rc) {   // RARE: rc = { rare (the match's transcendent record), luck } for the 'hall' ladder
    const table = PROFILES[profileOf(kind)] || PROFILES.general; let x = rnd() * table.reduce((a, o) => a + o.w, 0), o = table[table.length - 1];
    for (const e of table) { if ((x -= e.w) < 0) { o = e; break; } }
    const out = { gold: o.gold ? rangeOf(rnd, o.gold) : 0, parts: {}, items: [] };
    if (o.parts) { const n = rangeOf(rnd, o.parts); for (let i = 0; i < n; i++) { const k = BASIC[Math.floor(rnd() * BASIC.length)]; out.parts[k] = (out.parts[k] || 0) + 1; } }
    if (G) {
      const lk = rc && rc.luck || 0, ctx = rc && rc.rare;
      if (o.util) for (let i = 0; i < o.util; i++) out.items.push(G.pickUtil('hall', ctx, { rnd, luck: lk }));
      if (o.weapon) out.items.push(G.randomWeaponKey('hall', o.weapon, ctx, lk, rnd));
      if (o.armor) out.items.push(G.randomArmorKey('hall', o.armor, ctx, lk, rnd));
    }
    out.items = out.items.filter(Boolean);
    return out;
  }
  const partsN = parts => { let n = 0; for (const k in parts) n += parts[k]; return n; };
  // the per-goblin ledger { round, searches, gold, parts, items }; fresh when the round changed
  function ledger(L, round) { if (!L) L = { round, searches: 0, gold: 0, parts: 0, items: 0 }; if (L.round !== round) { L.round = round; L.searches = 0; } return L; }
  const canSearch = (L, round) => { const l = ledger(L, round); return l.searches < CFG.PER_ROUND && (l.gold < CFG.GOLD_MATCH || l.parts < CFG.PARTS_MATCH || l.items < CFG.ITEMS_MATCH); };
  // trim a roll to the match caps that are left and record it; returns the trimmed loot (may be empty)
  function applyCaps(L, round, loot) {
    ledger(L, round); const out = { gold: Math.max(0, Math.min(loot.gold, CFG.GOLD_MATCH - L.gold)), parts: {}, items: [] };
    let room = CFG.PARTS_MATCH - L.parts; for (const k in loot.parts) { const n = Math.max(0, Math.min(loot.parts[k], room)); if (n) { out.parts[k] = n; room -= n; } }
    for (const k of loot.items) if (L.items + out.items.length < CFG.ITEMS_MATCH) out.items.push(k);
    L.searches++; L.gold += out.gold; L.parts += partsN(out.parts); L.items += out.items.length; return out;
  }
  // per-match events from the match rng: which fighting halls are guarded and which containers start empty. `fight`: the cells that are not next to a home; `spots`: WORLD.allHallSpots().
  function rollEvents(rnd, fight, spots) {
    const cells = fight.slice(), guard = {};
    for (let i = cells.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    for (const c of cells.slice(0, CFG.GUARDS)) guard[c] = CFG.GUARD_KINDS[Math.floor(rnd() * CFG.GUARD_KINDS.length)];
    const dry = {}; for (const s of spots) if (s.role === 'cont' && s.kind !== 'cache' && rnd() < CFG.DRY_P) dry[s.id] = CFG.DRY_MS[0] + Math.floor(rnd() * (CFG.DRY_MS[1] - CFG.DRY_MS[0]));
    return { guard, dry };
  }
  const LABEL = {   // the E prompt and the toast words
    cache: 'Open the starter cache', locker: 'Search the footlocker', rack: 'Search the weapon rack', larder: 'Search the larder', tomes: 'Search the old chest', cashbox: 'Search the cash box', parts: 'Rummage through the parts bin', sunk: 'Fish out the sunken crate', offering: 'Search the offering bowl',
    font: 'Drink from the font', stew: 'Ladle some stew', whet: 'Sharpen your weapon', board: 'Read the notice board',
  };
  return { CFG, PROFILES, CONT_PROFILE, BASIC, profileOf, rollLoot, partsN, ledger, canSearch, applyCaps, rollEvents, LABEL };
});

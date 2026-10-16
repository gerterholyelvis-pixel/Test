# Weapons 2

Nine new weapons in `items.js` (W.push block), distinct by per-item reach and swing time (`WEAPON_TUNE`, applied inside `combat()`; the server and the offline sim already use `combat()`, so reach/cooldown/ranged work everywhere). They reuse existing families, so viewmodel clips, icons, recycler yields, kill-feed verbs and loot/merchant/chest/mystery pools work unchanged.

| weapon | family | tier | dmg | cd ms | range | dps |
|---|---|---|---|---|---|---|
| Scrap Cleaver (junk) | sword | uncommon | 14 | 560 | 1.9 | 25 |
| Hand Crossbow | crossbow | rare | 14 | 650 | 10 ranged | 21 |
| Twin Fangs (fastest) | dagger | rare | 9 | 300 | 1.9 | 30 |
| Throwing Axe | axe | rare | 21 | 900 | 8 ranged | 23 |
| Heavy Pike (reach) | spear | mythic | 30 | 850 | 3.1 | 35 |
| Ogre Club | club | mythic | 40 | 1000 | 2.2 | 40 |
| Siege Maul (slowest, biggest hit) | hammer | legendary | 72 | 1300 | 2.2 | 55 |
| Arbalest (sniper) | crossbow | legendary | 66 | 1700 | 16 ranged | 39 |
| Crownsplitter (vault tier) | axe | transcendent | 120 | 800 | 2.4 | 150 |

Drop chances are relative weights (the weapon pool now sums to about 129, not 100; tiers of old weapons are unchanged). No sling (needs a new viewmodel family); the throwing axe is a hitscan ranged weapon using the axe smash clip.

itemart.js: new `registerWeapons2()` (placeholder parameters for the existing family builders) just above `const AS`. Models verified to build in the browser (3-6 draw calls each), not visually polished. Test: `tests/weapons2.test.js` (roster, stats, dps balance vs tier peers, server pike reach at 3 m).

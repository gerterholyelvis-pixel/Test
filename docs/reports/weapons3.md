# Weapons 3

Fourteen more weapons (`W.push` block in items.js), three new families (whip, sling, wand), twists in `WEAPON_TUNE`: reach, swing time, ranged, `bleed: [dmg per tick, ticks]` (server tick once a second, new bleed replaces the old, `hit.bleed:1` so the client shows only a number) and `bolt: dmg` (wands and staves throw the slow staffbolt with their own damage and cooldown, even if the staffbolt rule is off). Server: `WEAPONS3` block (`weapons3Tick`), `hitTarget(..., wname, opts)` with `opts.bleed`. All tune reads go through `G.combat()`.

| weapon | family | tier | hit | cd ms | reach | twist | dps (bleed counted) |
|---|---|---|---|---|---|---|---|
| Bone Shiv | dagger | uncommon | 8 | 380 | 1.9 | junk, quick | 21 |
| Frying Pan | club | uncommon | 15 | 640 | 1.9 | junk | 23 |
| Goblin Sling | sling | uncommon | 10 | 520 | 9 ranged | slingshot | 19 |
| Throwing Knives | dagger | rare | 8 | 430 | 8 ranged | thrown | 19 |
| Bullwhip | whip | rare | 11 | 520 | 3.4 | reach | 21 |
| Trident | spear | rare | 21 | 640 | 2.6 | bleed 2x3 | 42 |
| Ember Wand | wand | rare | 12 bolt | 650 | bolt | magic | 18 |
| Reaper Glaive | halberd | mythic | 38 | 800 | 3.0 | reach | 48 |
| Ball and Chain | flail | mythic | 52 | 1150 | 2.4 | heavy | 45 |
| Barbed Lash | whip | mythic | 20 | 540 | 3.6 | bleed 3x3 | 54 |
| Stormstaff | staff | mythic | 36 bolt | 1100 | bolt | magic | 33 |
| Archmage Staff | staff | legendary | 62 bolt | 1200 | bolt | magic | 52 |
| Gilded Lash (vault) | whip | transcendent | 62 | 450 | 4.2 | bleed 6x3 | 178 |
| Sunspire Staff (vault) | staff | transcendent | 95 bolt | 1000 | bolt | magic | 95 |

Integration: loot, merchant, chest and mystery pools are weighted by chance (new weights add about 53 to the pool). Recycler yields for whip/sling/wand; workbench recipes for sling, bullwhip (tier 1), trident, ember wand (tier 2). Audio: `whip` (lash and crack) and `sling` (spin and snap) classes keyed by family in audio.js. Viewmodel tables got whip (slash clip), sling (slash), wand (cast); kill feed verbs added.

Art: itemart.js "WEAPONS 3" block with new builders (whip, sling, wand, knives, trident, glaive, pan, staff2) plus reuse of sword and flail; baked icons checked in the browser (3-7 draw calls each) and in first person for whip, sling, wand, staff, knives, pan.

Tests: `tests/weapons3.test.js` (roster, twists, dps balance, recycle/craft, server bleed ticks and reach, bolt damage); audio test extended.

Notes for the merger: not done in the offline demo sim (bleed, bolts); no boomerang (needs a flight path); no knockback (positions are client-authoritative). `bots.test.js` tick-cost check can fail under full parallel load but passes alone. Worktree needed a `node_modules` junction for the browser check (untracked).

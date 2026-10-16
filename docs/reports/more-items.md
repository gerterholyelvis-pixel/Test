# More items: twelve utility items and a charm slot

## Verified from the previous wave (real browser, real server)
Icons, throw arcs, smoke cloud, bomb and heal all work. Found and fixed:
- Inventory could not use items: double-click and the EAT button only handled brains. They now use a utility item (or wear a charm). Quick-slot keys 1-3 already worked.
- The offline demo could not use items at all (the sim ignored `{use}`). It now has a reduced copy of `useItem` and starts with a kit of items (`demoKit`).
- Utility items had no 3D model (itemart returned null, so icons were flat 2D). All 26 utility items and charms now have small models in `itemart.js` (`UTILB` block); the baked icons use them.

## New one-use items (items.js `UTIL2`, server.js `USE2` block)
| Item | Tier / price | Effect |
|---|---|---|
| Bear Trap | uncommon / 40 | placed at your feet, armed after 1.5 s, 90 s life, two per owner: first other goblin takes 14 and is slowed to 35% for 2.5 s (bots too) |
| Signal Flare | uncommon / 30 | 8 s: every goblin shows on your minimap (fog of war off); a glow hangs in the room |
| Panel Lens | rare / 50 | 12 s: minimap draws every room's current pick |
| Crowbar | rare / 55 | nearest closed non-Vault door within 4 m is pried open for 10 s, then slams shut |
| Ward Rune | rare / 60 | soaks the next hit of any kind (melee, bolt, bomb, trap), 30 s |
| Brain Jar | rare / 80 | +4 knowledge (craft tier 3) |
| Mimic Bait | uncommon / 35 | fake loot pile that looks like a real weapon drop; first other goblin to take from it is bitten for 16 (owner gets the bait back). Bots fall for it |
| Dazzle Powder | uncommon / 30 | goblins within 4.5 m cannot attack for 2.2 s, bots there see nothing; humans get a white flash |
| Haggler's Tag | uncommon / 25 | next merchant purchase costs half (rounded up to 5) |
| Rage Brew | rare / 45 | +30% damage for 10 s |
| Homing Feather | uncommon / 40 | after 2.5 s you are back in your starting room; any hit breaks it; refused in sudden death |
| Alarm Bell | uncommon / 30 | placed (owner only sees it); when another goblin comes within 3 m the owner is told and sees them on the minimap for 5 s |

Damage bonuses (Wolf Fang x Rage Brew) are capped at +50% in `dmgMul`. A pried door and recall are refused in sudden death.

## Charm slot (`inv.charm`, slot id `charm`)
One passive slot under Armour. Only items of type `charm` (keys `c:...`) fit. Server: `SLOT_IDS`, `getSlot/setSlot/fits`, `allItems` (so a death drops it and a win keeps it), `equip`, `recalc`. Client: `emptyInv`, `SLOT_RE`, `invGet/invSet`, `slotAccepts`, `setInv`, `invAll`, `invStats`, inventory UI.
Six charms: Heart (+10 max HP), Swift Idol (+6% speed), Gold Magnet (+25% bounty / income / gold prizes), Scholar's (+50% brain and jar knowledge), Silver Tongue (bribes cost 30% less), Wolf Fang (+8% damage).
The speed-hack cap `MAXV` now includes the best charm speed (supervisor note), and `tests/useplus.test.js` checks the source for it.

## Integration
- Merchants: utility items use the existing weighted swap (all 20 are in `UTIL_KEYS`); 30% of shops also swap one more slot for a charm.
- Mystery-room enemies: 40% utility item (unchanged), 15% charm.
- Crafting: every item has a recipe (`needs = tier * 20` knowledge). Recycler: every item breaks into 1-2 parts.
- Chests still hold weapons only (not done).
- Bots: use Brain Jar at once, Ward Rune and Dazzle when hit, Rage Brew when a target is within 4 m, Bear Trap when hurt below 60%; pick up and wear charms (`equipBest`, `lootNearby`). They still never buy or craft these.
- Sounds: new entries in `audio.js` (`snap flare glassUp crowbar ward wardBreak jar zap rage feather bell`); `itemSound` maps item families to them and `GKUSE2` calls `GK.feel.itemUsed`.
- Client: `ITEMS2` block in game.js (`GKUSE2`), minimap hooks (`actorDot` reveal, lens arrows), `GKUSE.note` shared for floating notes. No lights, no per-frame allocation beyond the flare glow sprite.

## Tests
`tests/useplus.test.js`: data and shop stock, MAXV, charm slot rules and death drop, jar with and without the charm, flare/lens/ward, crowbar (10 s close, Vault refused), feather, haggle, trap (damage, snare, owner safe), ward, dazzle, rage + fang cap, mimic bait (bite, no leak, owner refund), bell, bot wears a charm and drinks a jar. `tests/utility.test.js` now expects 20 utility items. New botlab fields: `charm`, `know`, `pack`.

## Not done / notes
- Chests and mystery-room prizes do not hand out the new items; traps and bells are not re-sent to a reconnecting client.
- `bots.test.js`, `bots-ai.test.js` are flaky on the base commit too (4 of 6 runs failed in a clean `git archive` of HEAD).
- Flare glow and whiteout were checked by reading code and one real-server run, not by screenshot (the glow hangs above the player).

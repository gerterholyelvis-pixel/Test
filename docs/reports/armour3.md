# Armour 3

Done
- Icons/models: itemart.js `registerArmour3()` (ARMOUR3 block) gives all 9 armour-2 pieces and the 10 new ones their own 3D model (AF builder per family + AS entry); baked icons come from the existing pipeline. Checked in the contact sheet.
- 10 new armours (items.js, ARMOUR-3): Hunter's Cloak (36 HP, +8% speed), Sentry Tabard, Carapace, Thornhide (thorns 3), Runed Vestments (+6% speed), Ironbark Plate (-5%), Cairn Plate (182 HP, -10%), Quillhide Mail (thorns 6), Gravewalker Shroud (+10%), Emberforge Plate (265 HP, thorns 8). Drops, merchant, chests, vault relic pick them up through the weighted pools; 6 are craftable at the bench.
- Thorns: optional 7th value. `hitTarget(..., opts)` with `{melee:true}` makes a melee attacker take `thorns` damage back (never lethal, broadcast as a normal `hit` with `thorns:1`). Tooltip shows "Thorns N". No knockback exists in the server, so no knockback resistance.
- Goblin overlays: `gaArmor3` + `ARMOUR3_FAMS` (game.js ARMOUR3 block), scaled by body width `b` only. Verified visually on small/medium/big goblins (all 18 families); fixed Cairn Plate size.
- Bots: `armorScore` (health adjusted for speed and thorns) used by equipBest, shop choice and betterA. Spare armour that is no upgrade is junk and gets recycled.
- Recycler: armour recycles by family at half the weapon yield; common (bench) armour and class robes do not recycle; test guarantees recycle < recipe cost.
- Tests: tests/armour3.test.js (data, score, recycle, recipes, overlay/itemart coverage, server thorns). `npm test` passes (bots.test.js "refused bot moves" is flaky under load, unrelated).

Notes for merger
- Browser harness note: metals render black in a bare scene (existing plate does too); in-game lighting is fine.
- The server caches static files at boot: restart after editing client files.
- Not done: no knockback resistance; the armour-2 overlays were looked at but not tuned further.

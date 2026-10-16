# Armour 2: nine new armours

Added to items.js (`A` list, marked ARMOUR-2): Swiftwrap (light, 26 HP, +12% speed), Bone Plate (52), Fur Mantle (60), Scrap Plate (70), Reaver Harness (88), Lamellar Vest (108), Tower Plate (175 HP, -8% speed), Vaultguard Brigandine (205), Gilded Plate (235). Each has its own `family`. Armour has one slot and only a health stat, so there is no shield item; Tower Plate carries a front slab and a huge pauldron instead.

- Speed: optional `speed` multiplier on an armour item. `G.armorSpeed(key)` / `G.MAX_ARMOR_SPEED` are used by server.js (`sprintOf`/`walkOf` for bots, `MAXV` anti-cheat budget, now 12% looser for everyone) and by the game.js move speed (`sp`). Tooltip shows "Speed +12%" / "Speed -8%".
- Loot: new chances are weighted on top of the old list (relative weights), so drops, mystery rooms, merchant stock and the vault relic (mythic or better) pick them automatically. Tiers come from `tierOf(chance)`: Gilded Plate is transcendent, Vaultguard legendary, none above the Aegis (300 HP).
- Crafting: 5 workbench recipes (swiftwrap, bonemail, furmantle: tier 1; scrapplate: tier 2; lamellar: tier 3), using the knowledge-tier thresholds.
- Overlays: `gaArmor2` + `ARMOUR2_FAMS` in game.js (ARMOUR2-BEGIN/END block before `buildGoblin`), hooked in `u.setArmor`, wrapped in try/catch.
- Test: tests/armour2.test.js (data, balance, recipes, overlay coverage).

Not done / merger notes
- Could not open the game in the Browser pane (localhost navigation denied), so the overlays are syntax-checked but NOT visually verified. Check each family on a goblin (e.g. give yourself `a:scrapplate`).
- Inventory/shop/chest icons: itemart.js `AB[family]` has no entries for the new families, so they fall back to the cloth icon until the item-art agent adds light/bone/fur/scrap/spiked/lamellar/bulwark/gilded.
- Bots ignore speed when picking armour (health only), recycler does not recycle armour (unchanged).
- Pre-existing failure: security "legit sprinter at 7.8 m/s" fails with and without my changes; balance "gang cap" is flaky under parallel load. A worktree needs a node_modules junction for the static security tests.

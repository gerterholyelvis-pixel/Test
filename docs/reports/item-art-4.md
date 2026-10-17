# Item art 4: icon frame system, consumable/charm models, world drops

## Done
- **Tier frame (icons.js, drawn at paint time, so crisp at 40 px and 160 px, no bake cost).** Escalating materials: common bone, uncommon iron, rare silver, mythic gold, legendary violet, transcendent prismatic (conic rainbow). Plate tint, backlight and the socket gem in the top edge carry the ART.md accent (blue / purple / orange / cyan). Same top-left key light in every frame. The old radial blob glow is gone (baked halo cut to a faint rim). `GKICONS.frame(ctx, tier, x, y, size)` and `GKICONS.FRAMES` are exported; `draw`/`canvas` take `opts` (`{frame:false}` for bare art).
- **Badges:** reforged plus (top right, gradient), stack count `opts.count` (bottom left pill), charge bar `opts.charge` 0..1 (bottom edge), risk/cursed hazard triangle (top left) for items with `risk`/`cursed` or in the `RISK` set (`x:bait`). Nothing in items.js stacks or has charges yet, so those two are API only.
- **Armour icons** no longer show the mannequin stand (own flagged material, stripped in bake); a dark lining closes the neck hole. Iron plates share one warm grey (0x948f88 family), steel stays blue-grey, mythril cyan.
- **Consumables:** potions are smoked glass with a bright liquid body, cork and wire band (tonic, rage brew, draught, flask, spring/blessed water). Charms are jewellery on chains (heart is a real extruded heart, magnet fixed, scholar scroll fixed). New 3D models for everything that had only flat icons: plushie, draught, flask, spring/blessed water, iron wedge, skeleton key, key blank, gold leaf, rune charge, crown seal, husk brain, scion. Sealing wax and dazzle powder reworked. `x:flask:<n>` maps to one model.
- **World drops:** `GKART.dropLook` (called once from `applyDrops` in game.js): piles with anything above common get a tier-coloured translucent beam (2.6 m uncommon up to 5.8 m transcendent, one draw call, shared geometry/material, normal blending so it reads on the white rooms) and the best item floats over the bag; the glow sprite takes the tier colour.
- Dev tools: `tools/icon-sheet.js` + `tools/icon-lab.html` bake only the wanted keys (88 armours in about 10 s) and write a contact sheet; `DROPS=key,key` renders a row of piles. Usage in the file header.
- Screens: docs/screens/items-art-before-armor.png, items-art-after-armor.jpg, items-art-after-consumables.jpg (each with a 40 px strip), items-art-after-drops.jpg.

## Not done / notes
- Armour silhouettes of the cloth and leather tiers are still similar (same torso family); only the stand, lining and tint changed. Weapons untouched.
- The frame sits inside the existing UI slot border (`.gks`, `.islot`), so slots show a double border; UI owners may want to drop their own tier border.
- Drop beams do not animate; the floating item is static. Lab lighting makes metals dark in the drops sheet (in game lighting is fine).
- Frame order follows the brief (mythic gold, legendary violet); the gem colours keep the older purple/orange tier language.
- Icon IndexedDB cache invalidates itself (hash of itemart.js/icons worker), so first load rebakes.
- Tests: tests/iconframe.test.js (static).

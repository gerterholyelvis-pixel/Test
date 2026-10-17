# Arena polish

Found by touring the arena (tools/arenatour.js, new): only 8 of the 24 non-vault cells had a paint colour and "ROOM n" stencil (left over from the old 3x3 layout); the rest were bare white.
- **ARENAHUE** (hud5.js `cellSide/cellHue`, tested in tests/hud5.test.js): every cell's colour is its compass side of the vault (N blue, NE violet, E rose, SE orange, S gold, SW olive, W green, NW teal; inner ring = its direction). Used by wainscot/pipe collars/stencils (ROOMART, atlas 2048 -> 2304 px for 24 stencils), a floor inlay frame 1.5 m inside the walls (broken at doorways), the minimap cell tint, a 16 % tint of the room's pooled PointLight colour (no new light), a hall banner on entry ("ROOM 4 - BARRACKS / North-east hall"), and the room hum pitch (audio.js `ambient(zone, side)`, feel.js). Floor material 8 % darker (was blinding white).
- **ARENAFX** (game.js, one Points draw call, vertex-shader animation, no CPU per frame): embers over cold fires, steam over stew pots, mist over cistern pools, sparkles over fonts, gold sparks round the relic; cold-fire embers flicker and vault gold pulses (2 uniforms). Low draws the 75 essential of 164 particles; `settings.ambfx=false` or `?ambfx=0` turns it off.
- Audit: no solid prop within 0.9 m + radius of any door (world.solidsOf vs DOORS): clean.

Perf (npm run test:browser style, vault view, same machine, main vs branch, 2 runs): Low calls 231 vs 232, tris 337k vs 343k, CPU 9.0-9.6 vs 9.2-10.0 ms (noise). High 334 calls before. Console clean on Low, Medium, Ultra.
Tested: `npm run check`, `npm run test:affected` (17 files pass), hud5 test.
Screens: docs/screens/arena/before-a.jpg (before), after-a.jpg (after), fx-a.jpg (Medium).
Not done: walking every room edge for clipping (no collision-vs-visual diff run), door-open dust puffs (existing burst particles untouched), no settings-menu checkbox for ambfx (menu out of scope), torch flicker only on cold-fire embers (chest-room torches already flicker). Ultra tour shots could not be taken with the driver (position reset to home); perfbench ultra shot looked fine.
Merger notes: game.js edits in ROOMART (ROOM_ACC, CELLS, 4b), LAMPS (colour lerp), HUD5 interval, new ARENAFX block; hud5.js ARENAHUE block.

## Follow-up (concrete pass)
- tests/arena-solid.test.js (pure, world.js): over every arena, hall, tree (10 types), vaultbreaker, loot (6 types) room: no NaN, no prop through a wall, nothing in the first 4.5 m door lane, finite groundY, every hall piece has collision and every hall solid a piece, hall pieces do not overlap. All pass; no placement fixes were needed.
- Headless walk (real W+Shift input, doors open) from 6 corners/edges of rooms 1, 6, 7, 10, 12, 13, 17, 22: always stopped inside the room, never outside.
- Door-open dust puffs and sparks already existed (doorBurst); added a vault glow pulse (gold emissive +1.6 fading over 1.6 s when a vault door opens).
- Settings > Graphics: "Ambient effects" checkbox (ambfx; uiorg.js row, menu.js default) turns off the Points effects and the pulse.
- Low vault view: 232 calls, 7.0 ms CPU, --budget within budget.

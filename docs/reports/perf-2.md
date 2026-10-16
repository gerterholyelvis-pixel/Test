# Client performance pass 2 (low-end computers)

Everything is in `game.js`, marked `PERF2-BEGIN/END` or `// PERF2:`. No server, items, world or test change. No light added (9 PointLight + 1 HemisphereLight, measured), no new dependency, no shadows anywhere (`renderer.shadowMap.enabled` is false, nothing casts). The whole pass can be switched off with `?perf2=0` on the page URL, which is how the before numbers below were taken (same code base, same match layout).

## Method
Offline match (`?offline=1`, bots), muted, layout fixed with `GK.applyLayout(...)` so the side rooms are identical, doors held closed, the local player's position hidden from the bot simulation and bots pinned to chosen spots (so they cannot kill the player). Three views: **spawn** = (-13, 12.8) looking north-west, **vault** = (0, 8) looking north, **vault+bots** = same with every living bot placed 5 to 19 m away. Per view: draw calls and triangles summed over every `renderer.render` call of a frame (composer passes included), JS time inside `frame()`, heap growth. The browser pane here renders with software GL and is throttled to about 1 fps when it is not in view, so **fps is not usable**; draw calls and triangles are exact, JS ms moves by 20 to 30 % between runs of the same build (ranges below). Bot count falls during a session (bots die), so the vault+bots rows have 3 to 6 bots; the per-goblin table is the clean comparison.

## What the profile said
- JS time per frame is 90 % or more inside `renderer.render` (three's per-draw-call work). Everything the game itself does in `frame()` (doors, goblin animation, combat, viewmodel, panels, hover) was 1 to 1.5 ms together. So draw calls are the lever, not game logic.
- A goblin was **not** about 100 calls any more (the earlier goblin-art pass merged them): 10 baked body parts sharing one material per type, 3 to 4 weapon meshes, 2 transparent helper meshes (eye glow, ground blob) and 2 sprites (name, health bar) = **17 to 18 draw calls**, already under the 25 target. Its cost is triangles (about 46 k per goblin at one pass, 60 k for the king).
- The expensive thing in view is the **doors**. A vault door was 130 to 145 draw calls (32 laser boxes, 24 bolts, keypad, bio-panel and beacon parts spread over nested groups), and the vault has four of them in view. The vault view was 560 to 940 calls, of which about 75 % was door parts.

## Changes
1. **Door merge** (`perf2MergeDoors`, once at startup). Each door is split into rigid frames: the wall group, and every node the door code moves (leaf / hinge, wheels, rings, beacon rotors, scanner bars). Static meshes of one frame with one material become one mesh (`perf2Bake`, indexed, mirrored transforms re-wound). The 32 lasers become one mesh (the frame loop still toggles `d.lasers[i].visible`). The 24 bolts become one mesh per slide direction (the loop sets `position.x = userData.x0 + sx * 0.38 * (1 - bolt)`; `x0` is baked into the geometry, so it is 0). Door art, merchant plates and scanner bars are left alone. Look-alike per-mesh materials (keypad buttons, signs, bio-panel hands and pupils, plaques) get one shared clone so they merge; materials the door code mutates (`d.light`, `d.ledM`, `d.leafMat`, pulsing keypad screens...) are excluded by identity. Side effect: this fixes the old startup pass that looked for button colour 0x222222 while the keypad builder writes 0x000222 (it never matched).
2. **First-person hand**: 12 meshes per hand merged into 3 (skin, knuckles, claws). Viewmodel draw calls 18 to 9. It is built once, not per frame (checked: `vmSetWeapon` only runs when the weapon key changes).
3. **Goblin level of detail** (`perf2Simplify`, `perf2LodStep`). The baked parts are shared per type; beyond a per-preset distance they swap to vertex-clustered copies (cells 3 cm and 6 cm, attributes averaged, so colour, material and UVs survive). Copies are built one per idle slot after the first goblin of a type exists, shared by all goblins of the type; until a copy exists the full geometry stays. 10 % hysteresis. Thresholds (level 1 / level 2): Low 5 / 10 m, Medium 8 / 16 m, High 12 / 24 m, Ultra 14 / 28 m.
4. **Far-goblin update rate** (`perf2Skip`). Other goblins farther than 14 m refresh pose, glow, bubble and emote every 2nd frame, beyond 26 m every 3rd, and a goblin outside the view frustum and farther than 6 m every 3rd. The skipped `dt` is carried over. The local goblin, anything within 6 m, and any goblin that is swinging or flinching always run. (Measured gain is small, 0.1 to 0.2 ms; kept because it costs nothing and scales with bot count.)
5. **Culling**: the 12 chest-room control-panel wrapper groups had `matrixAutoUpdate` on, so the room classifier treated them as "always draw" and every view drew them (7 calls each, about 28 in the vault). They are frozen (they never move) and now cull with their room. Merged meshes get their bounding sphere at startup instead of in the first frame that tests them. Frustum culling is on for every merged room mesh and goblin part (only the viewmodel, dust, shafts and blob shadows are off, by design).
6. **Presets**: on Low the small additive halos round the door lamps and keypads are hidden (up to 8 draw calls per vault door); on Low and Medium the instanced door chains and rivets use a coarser mesh (168 to 64 and 80 to 36 triangles each, about 30 k triangles in the vault view); Medium's HDR composer targets use 2x MSAA instead of 4x (half the multisample memory and bandwidth; bloom already runs at half resolution and GTAO at half resolution on High). High and Ultra keep every one of these at full detail.
7. **Per-frame JS**: `merchantHoverTick` no longer rebuilds its target list (spread plus closure) every frame and skips the 7 m raycast while no merchant, recycler or workbench is within 20 m; `panelTick` has no `find` closure; the loot prompt writes its style only when it changes. The minimap (10 Hz, signature gated), kill feed, `netSnap`, health bars (texture only on change) and price boards (signature gated) were already fine. No `needsUpdate` on a texture per frame exists (only on change; the wizard's 26 sparkle points update a position buffer).

## Results
Draw calls and triangles are summed over all passes of one frame (High has a GTAO normal pass, so its goblins and rooms count twice). JS ms is the range over repeated runs.

| Preset | View | Before: calls / k tris / JS ms | After: calls / k tris / JS ms |
|---|---|---|---|
| Low | spawn | 117 to 136 / 40 to 43 / 5.3 to 10.7 | 83 to 97 / 34 / 4.0 to 5.2 |
| Low | vault | 506 to 566 / 143 to 158 / 7.8 to 9.2 | 192 to 250 / 117 to 131 / 5.4 to 7.5 |
| Low | vault + 3 to 6 bots | 574 to 618 / 307 to 330 / 8.9 to 9.4 | 297 to 302 / 152 to 170 / 6.5 to 8.8 |
| Medium | spawn | 132 to 151 / 40 to 43 / 6.1 to 8.5 | 110 to 124 / 33 to 34 / 4.9 to 5.3 |
| Medium | vault | 521 to 581 / 143 to 158 / 8.3 to 9.8 | 246 to 306 / 120 to 129 / 7.7 to 8.4 |
| Medium | vault + 3 to 6 bots | 606 to 624 / 276 to 374 / 9.1 to 9.4 | 231 to 356 / 172 to 204 / 7.2 to 8.2 |
| High | spawn | 220 to 254 / 79 to 85 / 8.8 to 9.1 | 171 to 204 / 88 to 91 / 7.7 to 10.3 |
| High | vault | 835 to 940 / 285 to 315 / 14.4 to 14.9 | 398 to 514 / 282 to 315 / 9.6 to 12.1 |
| High | vault + 4 to 6 bots | 985 to 1001 / 519 to 746 / 13.2 to 16.6 | 549 to 664 / 572 to 607 / 11.7 to 12.4 |

(The after spawn row on High shows slightly more triangles than before in one run; a bot was in view. Room geometry is unchanged on High.)

One goblin, vault view, Low, bot at a chosen distance (difference to the same view without it):

| Distance | Before: calls / k tris | After: calls / k tris | Level |
|---|---|---|---|
| 4 m | 17 / 46.3 | 17 / 46.1 | 0 |
| 9 m | 17 / 46 (never simplified) | 17 / 17.7 | 1 |
| 15 m | 17 / 46 | 17 / 8.5 | 2 |

High: 30 calls and 92 k triangles for one goblin over the two passes at 4 to 13 m (unchanged), 29 calls and 36 k at 16 m (level 1).

Heap growth per frame (sum of positive `usedJSHeapSize` deltas) was 50 to 340 KB in both builds and the noise is larger than any difference; I am not claiming an allocation change. Nothing I added allocates per frame (`perf2Skip`, `perf2LodStep`, `perf2ViewBegin` reuse module-level objects; the hover list is cached).

## Checked
- `npm test`: 19 files green.
- Offline match, High: full match played to a win (killed all bots), no console errors or page errors. Low: played through several rounds, kills and a death screen, no errors. Medium: composer renders with 2x MSAA, no errors.
- Goblins animate (leg and arm angles change on moving bots; a bot 33 m away updates every 3rd frame, a near one every frame), emote 5 shows its bubble, Space jumps (0.3 m), name tags and health bars show, the viewmodel (hand, weapon, swing) works, doors: bolts retract, lasers hide, the leaf swings, wheels spin (checked with the door progress forced to 0.2 and 0.6).
- Lights: 9 PointLight + 1 HemisphereLight. Shadow map off.

## Not verified
- Real GPU frame times. The pane is software GL and throttled; no fps comparison is claimed.
- Ultra preset, online play against the real server, other goblin types' LOD appearance close up (triangle counts measured for all five, one visual check on the big goblin at about 10 m on Low), a long shift-by-shift look at pop between levels at the High thresholds.
- Medium 2x MSAA "without visible loss": looked fine in a screenshot on software GL, not compared edge by edge.
- Allocation per frame (see above).

## Left alone
Goblin material cost (physical uber shader with sheen and clearcoat under 9 point lights) and the 9 point lights themselves (count is fixed by the house rules); `roomartGold` is one 44 k triangle mesh that is always drawn in the vault (merged by another pass); door and vault halos on Medium and High; the single remaining 3 to 4 weapon meshes per goblin (different materials, nothing to merge).

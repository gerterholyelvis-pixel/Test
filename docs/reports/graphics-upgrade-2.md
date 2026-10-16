# Graphics upgrade 2 report

Follow-up to `graphics-upgrade.md`. Goal: clearly higher visual quality at a reasonable cost. Lights, gameplay, networking and the server are unchanged.

## What changed (all in game.js unless noted)
Almost everything is inside the `FX-BEGIN/FX-END` block. Small edits outside it:
- line 18: `gfx: 'high'` added to the GK.settings defaults.
- after the static-world freeze (`// static world never moves`): one line, `const worldStatic = new Set(scene.children)`. It records the rooms, walls/doors and THE VAULT decor so the merge step knows what it may touch.
- `buildGoblin`: the skin, belly, skinDeep, cloth and rag materials now come from `fxSkin()` / `fxCloth()` instead of `M()`. Five material lines; no other goblin code changed.
- `GK.applySettings`: pixel ratio from `fxPixelRatio()` (preset cap), then `fxApplyQuality()`.
- index.html: one settings row (`s-gfx` select) and three CSS lines for `.row select`. menu.js: `gfx: 'high'` in DEFAULTS, sync and onchange for the select.

Features:
1. **Image-based lighting.** A PMREM of three's `RoomEnvironment` becomes `scene.environment` once the addon has loaded (the old studio box stays as a fallback). `scene.environmentIntensity = 0.6`. Metals now pick up real reflections: the gold medallion, vault doors, pillars, brass and rivets read as metal.
2. **Ambient occlusion.** `GTAOPass` sits in the composer after the RenderPass: radius 1.1, scale 1.9, Poisson denoise. High runs it at half resolution with 12 samples, Ultra at full resolution with 16. Sprites, points, lines and see-through decals (transparent with depthWrite off, or additive) stay out of its normal/depth pass. The pass also draws only the camera's room plus rooms directly behind open doors. With GTAO on, the baked corner-AO decals drop to 55 % opacity so corners are not darkened twice.
3. **Antialiasing.** I kept MSAA: 4x on the HalfFloat composer target, and the context MSAA on Low. It resolves geometry edges in HDR before tone mapping. SMAA would soften the small sign and map text. I did not add SMAA.
4. **Anisotropic filtering.** Every texture used by a scene material gets the preset's anisotropy, capped by `renderer.capabilities.getMaxAnisotropy()`: Low 2, Medium 4, High 8, Ultra 16. This is re-applied when the match layout builds the side rooms.
5. **Contact shadows.** One `InstancedMesh` (a single draw call) of soft radial blobs under floor-standing props, rebuilt on every layout. Props qualify when their bottom is within 8 cm of the floor, they are at least 0.3 m tall, and their footprint is 0.2 to 3.2 m. Footprints that overlap are combined into one blob, up to 4 m. The vault pillars are added explicitly. In the test match this gave 31 to 50 blobs. Goblins keep their existing blob shadows.
6. **Material polish.**
   - Plaster: new linear roughness map (soft trowel patches), and bump scale lowered from 0.9 to 0.35 so it no longer reads as stucco.
   - Steel, vault steel, gunmetal, light steel and dark steel: brushed roughness map (horizontal streaks).
   - Floor reflections: env intensity 0.8. Gold: roughness 0.24, env 1.5.
   - Goblin skin is `MeshPhysicalMaterial` with a light sheen and clearcoat 0.12. Cloth and rags use sheen.
7. **Tone and exposure.** The game view uses `NeutralToneMapping` at exposure 0.88 instead of ACES at 1.15. Colours stay saturated: gold reads as gold, and whites are less clipped. The title menu still renders with ACES (`renderWorld` sets the tone mapping and restores it). The HemisphereLight intensity went from 2.1 to 0.9 because the environment map now supplies most of the fill light. This changes intensity only; it is the same light.
8. **Graphics quality preset** (Settings > Graphics quality, `GK.settings.gfx`, saved in localStorage `gk.settings` like the other settings):

| Preset | Composer | GTAO | Pixel-ratio cap | Anisotropy |
|---|---|---|---|---|
| Low | off (plain render, context MSAA) | off | 1 | 2 |
| Medium | MSAA 4x HDR, bloom, vignette/grain | off | 1.5 | 4 |
| High (default) | as Medium | half resolution | 2 | 8 |
| Ultra | as Medium | full resolution, more samples | 2 | 16 |

   Choosing a preset also sets the existing "Post effects" checkbox: off for Low, on for the others. The checkbox still works on its own. The Resolution slider still multiplies the pixel ratio.
9. **Fewer draw calls.**
   - *Static merging.* Sibling meshes that share a material are merged into one indexed mesh under the same parent; mirrored transforms have their winding fixed.
     - Door frames and leaves: 976 meshes removed. Door art (`d.art`), vault bolts, lasers, scanner bars and merchant plates are skipped, so type switching and animation still work. The keypad buttons, which had one identical material each, now share one material.
     - Room shells and THE VAULT decor directly under the scene: merged per room, 223 meshes removed.
     - Goblins: merged lazily the first time they are drawn, about 100 to 135 meshes removed per goblin. Each limb, head, torso and cape group keeps its own merged meshes, so the animation code is untouched. The runes, glows and name tag are skipped.
   - *Room culling.* Each static top-level object gets the room key(s) it belongs to, using `WORLD.roomKeyOf` (two keys for a wall between rooms). When the camera is inside the facility, only these are drawn: the camera's room, every room reachable through open or moving doors, and the goblins standing in those rooms. Objects are hidden only for the duration of the render and restored afterwards, so other code that sets `.visible` keeps working. Objects that animate from `onBeforeRender`, dynamic objects (loot, actors' own transforms) and anything that spans more than two rooms are always drawn. The overview, death and win cameras see everything.

Debug hook: `GK.gfx` (`fx`, `cull`, `merge` stats, `blob`, `quality()`).

## Light count
Measured by traversing the scene for `isLight`. Before: 9 PointLight + 1 HemisphereLight. After: 9 PointLight + 1 HemisphereLight, measured in every preset run. No lights were added or removed. The hemisphere's intensity changed (2.1 to 0.9); the point lights are untouched.

## Draw calls and frame time
Setup: headless Chrome on an AMD Radeon integrated GPU (ANGLE D3D11), 1264x625, pixel ratio 1, `?offline=1`, 20-frame averages of `renderer.info` with autoReset off, so all composer passes are counted. Four offline bots wander around, so the numbers move by about ±30 % between runs depending on how many goblins are in view. A goblin costs about 100 calls after merging, about 200 before, and twice that with the AO pass.

Views: spawn = room 0 looking north; spawnBack = room 0 looking south across the map (rooms 3 and 6 behind closed walls are in the frustum); vault = vault centre looking north; chest = inside a treasure room.

| View (doors closed) | Before (old code, bloom on) | After Low | After Medium | After High (incl. GTAO normal pass) | After Ultra |
|---|---|---|---|---|---|
| spawn | 1053 to 1330 | 273 to 497 | 288 to 512 | 494 to 1136 | 494 to 1136 |
| spawnBack | 4204 to 4582 (28 to 31 ms) | 243 to 708 | 258 to 763 | 420 to 1501 | 420 to 1501 |
| vault | 3818 to 4322 (26 to 38 ms) | 588 to 812 | 601 to 980 (17 to 21 ms) | 964 to 1676 (16 to 18 ms) | 964 to 1583 (22 ms) |
| chest room | 192 to 226 | 158 to 160 | 173 to 175 | 312 to 319 | 312 to 319 |

Worst case, with every door in the map open so the whole facility is visible through door chains:

| View (all doors open) | Before | Low | Medium | High | Ultra |
|---|---|---|---|---|---|
| room 0 looking east | 4676 (27 ms) | 3350 (24 ms) | 3365 (27 ms) | 4207 (31 ms) | 4124 (30 ms) |
| room 1 looking into the vault | 4764 (30 ms) | 3436 (22 ms) | 3368 (25 ms) | 4150 (32 ms) | 4150 (31 ms) |

After the change, every closed-door view runs at vsync (16.7 ms) except the vault on Medium, High and Ultra (17 to 22 ms). Before, the cross-map and vault views took 26 to 38 ms.

## Screenshots (docs/screens)
- Before: `gfx2-before-spawn.jpg`, `gfx2-before-vault.jpg`, `gfx2-before-chest.jpg`
- After, per preset: `gfx2-after-{low,medium,high,ultra}-{spawn,vault,chest}.jpg`
- Settings panel: `gfx2-settings.jpg`

The side rooms are random per match, so the spawn-room door art differs between shots. The chest view always picks a treasure room.

## Tested
- `node --check` on game.js and menu.js.
- No console errors in offline mode or against the real server (`PORT=3101 GK_DEBUG=1`). The only warning is a D3D shader-precision note from the existing bloom shader, which the old code produces too.
- Doors opening and closing with merged frames and leaves: sliding leaves retract, vault doors swing, bolts and lasers animate. Rooms behind open doors render. Preset switching, persistence and Reset defaults work.

## Risks / not checked
- **Merging assumes some meshes are never touched one at a time.** This covers the wall, room and vault meshes (built by code I read in full) and goblin limb parts. If new code changes one door-frame mesh or one goblin body part individually (its own visibility, scale or material swap), it needs to go into the skip set in `FX-BEGIN` (door art and bolts already are) or be built after the merge. Changing a shared material, for example a hit flash that tints all goblin materials, still works.
- **Room culling hides goblins in rooms you cannot see.** That is correct behind walls, but an overlay meant to show through walls (for example an HP bar with depthTest off) would be hidden as well.
- New static top-level objects are classified the first time they are drawn, and the cache is cleared on each layout. A static group that later moves to another room would need `GK.gfx.cull.cls = new WeakMap()`.
- **GTAO** is screen-space: small halos at depth edges, and on High a little dotting along edges from the half-resolution pass. Its cost on weak GPUs was not measured (only this integrated AMD GPU); Medium and Low exist for that.
- **Warmer whites.** With Neutral tone mapping the warm point lights tint the white rooms slightly cream instead of ACES's desaturated white. If the owner wants pure white, lower the lamp warmth or switch `FX_TONE` back to ACES.
- The merchant, chest and mystery room interiors (about 470 calls per merchant room) are not merged, because other agents own that code. That would be the next step for the all-doors-open worst case.
- `menu.js` builds its title-screen goblins with `GK.build`, so they now use the physical skin too, still with ACES tone mapping. It looked fine in the settings screenshot.

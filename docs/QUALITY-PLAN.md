# Goblin King: quality plan (performance, art, effects, code health)

Owner request: *"Make sure performance is optimized, artwork looks modern and high quality, effects are cool, and overall code is functional."*

This document is an audit and a plan. No game code was changed. It was written while the 5x5 Foundation rewrite (41 rooms) was in progress on another branch. Every number below comes from the current 3x3 build (main at `f0e6e1b`) running for real. Section 5 explains how to hand the work out once the 5x5 lands.

## How it was measured
- **Setup.** Own server: `PORT=4791 node server.js`. Headless Chrome 155 / Edge with `--enable-gpu`, driven over CDP by a small script.
- **GPU: a real one, not software GL.** `ANGLE (AMD Radeon(TM) Graphics, D3D11)`, an integrated Ryzen GPU, at 1600x900 with DPR 1. That is a good stand-in for the "low-end laptop" player. The display is vsync-capped at 60 fps, so 16.7 ms means "at least 60".
- **Game state.** Offline match (`?offline=1`), real bots moving and fighting. The camera was teleported to fixed views by writing `GK.P`.
- **Views:**
  - **spawn:** (-13, 12.8), facing NW
  - **vault:** (0, 8), facing N, the worst case
  - **corner:** (-19, -19)
  - **chest:** inside a chest-room doorway
- **Per frame**, averaged over 150 frames:
  - frame interval (mean / p95 / max)
  - draw calls and triangles summed over every `renderer.render` call (composer passes included)
  - CPU time spent inside `renderer.render`
  - number of render passes
  - positive JS heap growth
- **Also captured:**
  - draw-call attribution (wrapping `renderer.renderBufferDirect` and walking each object to its top-level scene child)
  - a 4 s CPU profile and a 4 s allocation sample (CDP `Profiler`, `HeapProfiler.startSampling` including GC'd objects), both in the vault on High
  - long tasks via `PerformanceObserver`
- **Server:** `node tests/tickbench.js 3 15 {1,4}`.
- **Caveat.** Bots move and die, so views are not perfectly identical between runs (±10 %).

---

# 1. Performance

## 1.1 Measured now (3x3 map, AMD iGPU, 1600x900)

Each cell is: frame ms (mean / p95) · draw calls · k triangles · CPU ms in `renderer.render`.

| Preset | spawn | vault (worst) | corner | chest door |
|---|---|---|---|---|
| **Low** | 16.8 / 20.2 · 320 · 58 k · 5.9 | 16.9 / 21.5 · **508** · 189 k · 8.3 | 16.7 / 17.8 · 82 · 24 k · 3.4 | 16.7 / 18.0 · 251 · 30 k · 4.9 |
| **Medium** | 16.7 / 19.5 · 341 · 58 k · 8.2 | 16.7 / 20.0 · 531 · 176 k · 12.6 | 16.8 / 21.1 · 97 · 24 k · 5.8 | 16.6 / 19.6 · 265 · 30 k · 9.2 |
| **High** | 19.9 / 27.8 · 596 · 130 k · 16.7 | 23.3 / 33.1 · **885** · 368 k · 20.1 | 19.2 / 32.1 · 162 · 55 k · 14.7 | 20.5 / 27.3 · 466 · 66 k · 17.7 |
| **Ultra** | 25.7 / 37.8 · 595 · 130 k · 18.0 | 30.7 / 40.8 · 884 · 368 k · 25.9 | 24.4 / 30.8 · 159 · 55 k · 12.0 | 24.0 / 32.2 · 463 · 66 k · 16.1 |

**Render passes per frame:** Low 1 · Medium 16 (UnrealBloom mip chain + output + grain) · High/Ultra 21 (+ GTAO).

**Other measurements:**
- **Menu:** 225 calls, **767 k triangles**, 17.6 ms mean, p95 45 ms, 1.4 MB/frame heap growth (portrait goblins at full detail while icons bake).
- **Scene at play:**
  - 4 889 objects, 3 627 meshes, 518 sprites, 90 instanced meshes
  - **954 materials, of which only 569 are unique** (by type, colour, map, roughness, metalness, emissive and opacity)
  - 188 textures (est. **184 MB** with mips if all are uploaded), 70 shader programs, 26 MB of geometry
  - **1 524 objects with `matrixAutoUpdate` on**
  - **JS heap 329 MB** (270 MB at the menu)
- **Lights:** 9 PointLight + 1 Hemisphere (owner rule respected). Shadow maps are off.
- **Long tasks:**

  | When | Length | What |
  |---|---|---|
  | page load | 1 016 ms | world build |
  | match start | 671 ms | shader compiles: 27 programs at the menu, 70 in play |
  | preset switch | 526 and 658 ms | every texture is re-uploaded for the new anisotropy |
  | whole session | 6.8 s | 45 long tasks in total |

- **Icon bake:** 78 icons in **6.7 s** wall time. Each icon does 2 synchronous `readRenderTargetPixels`, so each is a GPU pipeline stall.
- **Server tick:** 0.58 ms average per tick with 1 match, and 2.1 ms with 4 matches. The maximum is **42–45 ms** (bot planning spikes); one tick in 228 went over 25 ms.
  - Ticks ran at **15.5 Hz instead of 20 Hz**: `setInterval(50)` drifts on Windows timer granularity.
  - Bandwidth is 1.6 KB/s per client.

**Verdict.** Low and Medium hold 60 fps on an iGPU today, but at the vault Low already draws 508 calls. That is twice what perf-2 reported (192–250), so content added since then has regressed it.

High is CPU-bound: about 20 ms inside `renderer.render` at 885 calls, plus a full second scene pass for GTAO normals (429 of the 1 008 attributed calls are `MeshNormalMaterial`).

The 5x5 map roughly doubles the object count. Without the fixes below, High will drop to about 30 fps and Low will lose 60 fps in big rooms.

## 1.2 Budgets (the 41-room 5x5 map, worst view, all passes summed)

| Preset | Target | Draw calls | Triangles | CPU in render | Texture memory (resident) | Post |
|---|---|---|---|---|---|---|
| **Low** | 60 fps on an iGPU at 1080p | ≤ 220 | ≤ 150 k | ≤ 4 ms | ≤ 96 MB | none; FXAA optional |
| **Medium** | 60 fps on an iGPU at 900p | ≤ 300 scene + post | ≤ 250 k | ≤ 6 ms | ≤ 128 MB | bloom (3 mips), vignette, grain |
| **High** | 60 fps on a GTX 1060-class GPU, ≥ 45 on an iGPU | ≤ 450 including the AO pass | ≤ 500 k | ≤ 9 ms | ≤ 192 MB | + AO (half res, no second scene pass) |
| **Ultra** | 60 fps on an RTX 3060-class GPU | ≤ 600 | ≤ 900 k | ≤ 12 ms | ≤ 256 MB | + full-res AO, SMAA, more bloom mips |

Global budgets for every preset:
- ≤ 5 ms of game JS per frame
- ≤ 50 KB/frame heap growth in play
- no long task over 100 ms after GO
- startup to an interactive menu ≤ 1.5 s
- match start (wheel to GO) has no hitch over 150 ms
- server tick p99 ≤ 8 ms per match, with 8 matches per process

**Make these budgets enforceable.** Add `GK.perfProbe()`, which returns `{calls, tris, passes, renderMs, heapKB}` for the next N frames (the instrumentation used here, in about 30 lines). Then add a headless CI smoke test that fails above budget on Low at the vault view (Section 4.6).

## 1.3 Top 10 hotspots (with evidence) and fixes

Sizes: **S** = under half a day, **M** = 1–2 days, **L** = 3+ days.

1. **Scene-graph matrix updates are a quarter of all CPU** (High, vault).
   - Evidence: in the profile, `updateMatrixWorld` takes 12.3 % and `multiplyMatrices` 12.4 % of all samples (including idle), which is more than all of three's draw submission together. 1 524 objects still have `matrixAutoUpdate` on. Every `renderer.render` call walks all 4 889 objects; with GTAO, the normal pass walks them again.
   - This cost grows with total objects, not visible ones, so the 5x5 roughly doubles it.
   - **Fix (S):**
     - After the world build, set `matrixAutoUpdate = false` and `matrixWorldAutoUpdate = false` on everything static and call `updateMatrixWorld(true)` once.
     - Animated nodes (doors, tickers, goblins, viewmodel) opt back in through a registry.
     - Set `scene.matrixWorldAutoUpdate = false` and call `scene.updateMatrixWorld()` once per frame yourself, before the composer, so composer passes don't repeat it.
     - Expect about −20 % CPU on High.

2. **Mystery/chest interiors are never room-culled.**
   - Evidence: `mysteryContents` costs 89 draw calls on Low and 177 on High when viewed from the vault and the spawn room, through closed doors.
   - Cause: `fxClassify` (game.js ~5362) returns "always draw" for any top-level object whose subtree has an `onBeforeRender` hook. In total 37 top-level objects holding **590 meshes** are always drawn, 6 of them hook groups holding 423 meshes (the interiors use the hook to drive their animation).
   - **Fix (S):**
     - Builders tag each top-level object with `userData.room = '<roomKey>'`. The culler trusts the tag and stops inferring rooms from bounding boxes.
     - Drive interior animation from `GK.tickers` (gated by `fxCull.vis.has(room)`) instead of `onBeforeRender`.
     - Expect Low vault 508 → about 330 calls.
     - The tag is mandatory in the 5x5 builder.

3. **High/Ultra render the scene twice for GTAO normals.**
   - Evidence: 429 `MeshNormalMaterial` calls out of 1 008 on High at the vault; 21 passes per frame.
   - **Fix (M), choose one:**
     - (a) Give `GTAOPass` the composer's depth texture and reconstruct normals from depth (GTAO shader `NORMAL_VECTOR_TYPE 0`), so no second scene pass. About −40 % calls on High.
     - (b) Bake AO into vertex colours / an AO channel for static room geometry at build time (Section 2), and keep GTAO only on Ultra.
   - Do (a) now and (b) with the art pass.

4. **Draw-call count from unmerged static props and per-object materials.**
   - Evidence: 954 materials but 569 unique. Unnamed top-level groups alone cost 131–173 calls on Low (vault, doors, kits).
   - **Fix (M):**
     - A material registry: `getMat(kind, params)` keyed by signature, so every builder shares materials.
     - Then a per-room static merge: for each room, call `mergeGeometries` per material over all frozen meshes (perf-2 already has `perf2Bake`; generalise it to rooms).
     - Repeated props (barrels, coins, bones, crates, chains, rivets, keypads, lamps) become **InstancedMesh per prop type per room**.
     - Target: ≤ 60 calls per room on Low.

5. **Sprites: 518 in the scene, 65–92 sprite calls in view.**
   - Name tags and health bars are 2 sprites per goblin, plus door halos, glints and mist.
   - The 512x96 name-tag textures (57 of them, about 13 MB) also render huge and blurry in the centre of the screen at close range (see the goblin close-up below).
   - **Fix (M):**
     - One instanced billboard mesh for all health bars (a shader draws the fill from an instance attribute) and one atlas texture for all name tags (a 2048x512 canvas, a row per player).
     - Halos and glints become one `Points` per room.
     - Expect −40 to −70 calls.

6. **Startup and match-start long tasks** (1 016 ms at load, 671 ms at match start, 526–658 ms per preset switch).
   - **Fix (M):**
     - Build only the menu scene first, and build the world in idle slices (`requestIdleCallback`, one room per slice) while the wheel spins.
     - Call `renderer.compileAsync(scene, cam)` during the wheel (KHR_parallel_shader_compile), so GO never compiles a shader.
     - On a preset change, stop calling `needsUpdate` on every texture in one frame (three only applies anisotropy on upload). Either re-upload in idle slices (a few textures per frame), or apply the new anisotropy only on the next match load.
     - Fewer programs come for free from #4: material sharing alone should cut 70 programs to about 30.

7. **Item icon bake: 6.7 s and 156 synchronous GPU readbacks.**
   - Evidence: `readRenderTargetPixels` twice per icon (itemart.js ~755–758), plus a CPU un-premultiply loop.
   - **Fix (M):**
     - Move the bake to a **Worker with an OffscreenCanvas WebGL context**. The worker imports three plus the itemart builders, which are pure geometry and canvas code, and posts back `ImageBitmap`s.
     - Fallback: `renderer.readRenderTargetPixelsAsync` (WebGL2 PBO + fence), and render colour and mask in one pass with MRT or an alpha-preserving material.
     - Also cache the baked sheet in IndexedDB, keyed by an itemart hash, so returning players bake nothing.
     - The main-thread cost goes to about 0.

8. **Per-frame garbage: 100–290 KB/frame in play, 1.4 MB/frame in the menu.**
   - Evidence: GC spikes appear as frame max 54–118 ms. Sampled allocators are mostly inside three (uniform upload `setValueM4/M3`, render-list sort), driven by object count, which #1 and #4 shrink.
   - Game-side allocators:
     - `fxCullBegin` (`[...keys]` and `hidden` arrays)
     - the interiors `animate` (game.js 1564)
     - feel.js `tick`, `combatTick`, `vmUpdate`, the GTAO `_overrideVisibility` closure
     - `vmTracer` (2 materials + Sprite + Vector3 per shot)
     - smoke puffs (5 SpriteMaterials each)
   - **Fix (S):** pool these, and reuse arrays in the culler.
   - **Fix (S):** in the menu, use goblin LOD level 1 for the podium (it renders 767 k triangles; 150 k is plenty at that size).

9. **Texture memory (est. 184 MB) and a 329 MB JS heap.**
   - Large textures: 8 wall maps at 1024x740, 6 at 1024x1024, 12 at 608x576, 9 at 800x576, one 1024x2048, and 57 name tags at 512x96. None are compressed, and many have non-power-of-two sizes, which skip mipmaps or get padded.
   - **Fix (M):**
     - (a) A texture atlas per room theme: one 2048² colour + one ORM (occlusion/roughness/metalness) atlas shared by the props of a theme.
     - (b) Cap at 512 on Low and 1024 on High (the ART.md budget already says ≤ 512 for items).
     - (c) Power-of-two sizes.
     - (d) Free the CPU-side canvases after upload (`texture.image = null` after `onUpdate`) and the geometry arrays of merged static meshes (`geometry.attributes.*.array` can be dropped after upload, if nothing raycasts or merges against them later). This should take a large share of the 329 MB heap.
   - First step: one heap snapshot to confirm what holds the 329 MB (not done in this audit).

10. **Server tick spikes (42–45 ms max) and the tick rate.**
    - Bot planning (bfs/route, `botThink`) runs in bursts; with 41 rooms the bfs graph grows 2x and more bots path at once.
    - **Fix (S/M):**
      - (a) Amortise: re-plan at most 2 bots per tick, round-robin.
      - (b) Precompute the all-pairs next-hop table over the door graph once per round (doors change only at round boundaries): 41² entries, so lookups are O(1).
      - (c) Drift-free tick: a `setTimeout` loop that schedules from the ideal time, or a `performance.now()` accumulator, so the tick really runs at 20 Hz.
      - (d) Optionally, a delta snapshot when nothing changed.

## 1.4 What the 41-room 5x5 map specifically needs

Build these into the Foundation's world builder from day one; they are cheaper there than retrofitted later.

| Need | What | Size |
|---|---|---|
| **Room-tagged scene** | Every object built for a room lives under `roomRoot[key]` (a Group with `userData.room`). Shared walls belong to both rooms (the culler checks the list). Doors are their own roots, culled when neither side is visible. | S (in the builder) |
| **Portal culling** | Keep the FEEL2 BFS through open doors, plus a per-door frustum test: a neighbour is visible only if the camera frustum intersects that doorway's rectangle. That cuts sudden-death all-doors-open from about 41 rooms to about 4–6. | M |
| **Merged static geometry per room** | One mesh per (room, material) for shells, trims and static props after the build (`mergeGeometries`, groups dropped). Target ≤ 25 calls per room shell. | M |
| **Instancing** | `InstancedMesh` per prop type, per room or global with per-room ranges. Covers coins, bones, barrels, crates, rivets, bolts, chains, keypads, lamps, graffiti decals and pillars. Note: a global InstancedMesh defeats room culling unless its instances are sorted by room and `count`/draw ranges are set per frame (use `BatchedMesh`, three r159+, which supports per-instance visibility). | M |
| **Texture atlasing** | A theme atlas (white facility, vault, mystery, merchant, chest) with ORM + normal. Signs, maps and door art go into a per-theme canvas atlas, so text sprites stop each needing a texture. | M |
| **Light pooling** | Still 9 PointLight + 1 Hemi (owner rule), but 41 rooms need them **assigned to the nearest visible rooms each frame**. Move the lights, never add any. Keep `lights.state.version` stable: move, don't toggle visibility, or every material recompiles. A light's intensity fades over 0.3 s when it is reassigned. Rooms beyond the pool get emissive and IBL only (rooms are white and IBL-lit, so this reads fine). | M |
| **LOD** | Goblin LOD exists (perf-2). Add: props at 2 levels (full, and a merged box proxy beyond 14 m); room art decals and graffiti hidden beyond 2 door hops; name tags hidden beyond 18 m. | S–M |
| **Shader/material sharing** | Material registry (hotspot 4). Ban `new THREE.Mesh*Material` inside per-instance builders (lint rule, Section 4.6). | M |
| **Matrix freezing** | Hotspot 1, applied at build. | S |
| **Worker offload** | The icon bake (hotspot 7). The minimap and wall-map canvas drawing can also move to an OffscreenCanvas worker (10 Hz today, small win). | M |
| **Streaming build** | Build rooms in idle slices during the wheel (hotspot 6); a far room can be half-built for the first second. | M |
| **Server** | Precomputed next-hop table, bot re-plan amortisation, drift-free tick (hotspot 10). `world.js` gains `doors()` as the single door-graph source (today there are 3 copies: game.js, server.js, tests/lib.js). | S–M |

---

# 2. Art: critical review and a modern direction

Screenshots (High unless noted): `docs/screens/quality-*.jpg`.

| Shot | File |
|---|---|
| Title | `quality-art-title.jpg` |
| Item icon sheet | `quality-art-icons.jpg` |
| Goblin close-up | `quality-art-goblin-close.jpg` |
| Corner room | `quality-art-corner.jpg` |
| Merchant | `quality-art-merchant.jpg` |
| Mystery room | `quality-art-mystery.jpg` |
| Spawn door (Low) | `quality-art-spawn-door.jpg` |
| Vault, Low | `quality-perf-low-vault.jpg` |
| Vault, High | `quality-perf-high-vault.jpg` |

## 2.1 What looks dated or low quality

**Overall: the game reads as "mobile toy", not "stylised premium".** Most surfaces have one flat, saturated albedo with uniform roughness, the lighting is flat, and nothing grounds objects. The best pieces show the target is reachable: the title screen, the vault, and the mystery room's colour mood.

**Goblins** (`quality-art-goblin-close.jpg`, title)
- The skin is a single saturated green (#3fae3a-ish) with the same roughness everywhere. It looks like vinyl plastic, with no colour variation (knuckles, ears, nose and belly should go warmer and redder), no cavity darkening, and no rim.
- The Big goblin's pauldrons are perfect black spheres with cone spikes. That is the "primitive" look the art bible forbids.
- The ear inner colour is a pink/green gradient that turns rainbow on the wizard (title). It reads as a texture bug.
- Name tag: a 512x96 sprite ("Goblin") renders larger than the head, blurred by bloom, in the screen centre at 2.6 m. The health bar is a flat green slab across the view.
- The first-person hand is a flat green rubber glove with a flat brown sleeve, no knuckle or nail detail. The weapon passes through the fingers instead of sitting in the grip.

**Rooms** (`quality-art-corner.jpg`, `quality-art-spawn-door.jpg`)
- **No grounding.** Barrels, crates, coins and bones have no contact shadow or AO, so they float. There are blob shadows under goblins only.
- **Flat white walls.** Panel seams are faint, there is no roughness variation and no edge wear; at distance the walls read as untextured.
- The marble floor's veins are very high contrast and alias on Low (`quality-perf-low-vault.jpg`: moiré in the floor).
- Door art (skull, money bag, question mark) is excellent graphic design, but it is a flat print on a glossy black slab. It needs a frame bevel, emboss and wear, and it shows bloom-smeared edges up close.
- Overhead signs ("MYSTERY", "TREASURY") are clipped at the top of the view at eye height and are easy to miss.

**Merchant** (`quality-art-merchant.jpg`)
- The knowledge-tree leaves are flat, unlit-looking low-poly planes in saturated blue and teal. This is the most dated asset in the game.
- The "TIER I · 20 KNOWLEDGE" labels float through geometry (depth test off) and overlap the shop.
- The counter, shelves and signage are good, but the scene has about 8 competing text elements.

**Mystery room** (`quality-art-mystery.jpg`)
- The mood works. The chest is a plain box with untextured wood.
- Loose gold "cubes" on the floor look like placeholder boxes.
- The "360 gold" world text collides with the round HUD.

**Items** (`quality-art-icons.jpg`)
- Solid modelling. But every weapon uses the same diagonal at the same scale, so thin weapons (spears, pikes, bows) read as lines at 64 px.
- The backglow is a soft radial blob that looks like a smudge; it should be a crisp tier frame or rim.
- Armour sits on a mannequin stand that takes about 30 % of the icon area.
- Metals look chrome-like (high metalness with a smooth RoomEnvironment). There is no edge wear or tint variation between iron, steel and mythril.

**UI**
- Four panel languages on one screen:
  - the gold-bordered stat box (left)
  - the blue-outlined round pill (top)
  - the gold minimap frame
  - a yellow rounded "New goblin" pill (top right)
- The tip box and the key-hint bar overlap the hotbar region.
- Typography mixes Barlow Condensed, Cinzel and system-ui (in feel.js and the round HUD).

**Menus** (`quality-art-title.jpg`)
- The strongest screen. Two problems: a magenta/teal lens-flare streak crosses the bottom centre, and the podium goblins are lit flat compared with the spotlight.

## 2.2 Direction: "Gilded grime, painted miniature"

The goal is for every frame to look like a lit, painted tabletop miniature. That means fewer and bigger value changes, warm/cool light contrast, grounded contact, crisp silhouettes, and only gold and loot saturated. Everything is procedural, no downloads, within the 9+1 light rule.

**Ranking: priority 1 has the most visible impact for the effort.**

| # | Item | Technique in this pipeline | Size | Prio |
|---|---|---|---|---|
| A1 | **Colour grading + exposure per room theme** | Replace the grain ShaderPass with a "grade" pass: a 3D LUT built procedurally (lift/gamma/gain + saturation curve: gold and red keep saturation, greens and whites desaturate 15 %), a slight warm highlight / cool shadow split, and a per-theme exposure lerp when the room changes. Medium and above; on Low, bake the grade into material colours. | M | 1 |
| A2 | **Grounding: baked AO + contact shadows** | (a) Per-vertex AO baked at build time for static room geometry: ray-cast hemisphere samples against the merged room mesh in a worker, stored as a vertex attribute, and multiplied in via `onBeforeCompile` (all presets, ~0 runtime cost). (b) Soft blob/contact decals under every prop (one instanced quad per prop, multiply blend). This replaces GTAO on High (perf hotspot 3). | M | 1 |
| A3 | **Material variety from procedural textures** | A shared `procTex.js`: tileable 512² noise sets (cellular, fbm, scratches, grime streaks) giving **roughness and normal maps** per material family: painted metal (edge wear from curvature), plastered wall (soft noise plus panel seam lines), floor tile (grout AO, slight per-tile tint), wood (grain), cloth (weave), skin (pores and wart bumps). Feed them through `ORM` maps so one texture fetch serves 3 channels. Keep 4–6 families and share them: never one texture per object. | L | 1 |
| A4 | **Curvature/edge detail on goblins and items** | At bake time compute per-vertex curvature (normal deviation across neighbours after `mergeVertices`). Use it to (1) lighten convex edges (worn paint, highlights on metal) and (2) darken cavities (dirt in skin folds). Store it in vertex colour alpha and apply it in a shared `onBeforeCompile` chunk. This is the cheapest way to get the "hand-painted figurine" look. | M | 1 |
| A5 | **Goblin skin shader** | One shared skin material: a warm→cool hue shift by height (redder extremities from a vertex attribute), a fresnel **rim light** (warm in rooms, gold in the vault) through `onBeforeCompile`, fake subsurface on the ears (emissive red × backlight term), and roughness 0.55 with a wart/pore normal from A3. Fix the ear gradient. | M | 1 |
| A6 | **Rebuild the dated assets** | Replace sphere pauldrons with extruded, bevelled plates (Lathe + spikes along a curve). Replace the knowledge-tree leaf planes with clustered, displaced icosphere canopies with a vertex-colour gradient and gentle wind sway in the vertex shader. Replace the mystery chest box and the loose gold cubes with a bevelled chest (iron bands, plank seams) and instanced coin stacks. | M each | 2 |
| A7 | **Stylised outline / silhouette** | An inverted-hull outline (backface, scaled along the normal, dark ink colour) on goblins and items only: 1 extra draw per goblin part group, nothing on room geometry. Medium and above. This gives instant readability against the white rooms and matches "silhouette first". | S | 2 |
| A8 | **Lighting layout** | Keep 9 point lights but place them as key lights for the rooms near the player (light pooling, Section 1.4), with warm 3200 K colour in normal rooms. The hemisphere becomes cool sky / warm floor bounce. Add emissive ceiling panels that bloom slightly. Doorways get a coloured spill (an emissive floor decal) from the room behind: purple, teal or gold. | M | 2 |
| A9 | **Fog and depth** | Subtle exponential height fog (FogExp2 with a custom height term in `onBeforeCompile`), only through open doors, to separate rooms and hide LOD pops. Cheap. | S | 2 |
| A10 | **Decals** | One decal atlas (grime streaks under vents, scuffs at door thresholds, scorch marks, goblin graffiti, blood drips) as instanced `DecalGeometry`-like quads with polygonOffset. A dozen per room, placed by rule (thresholds, corners, under props). | M | 2 |
| A11 | **Item icon presentation** | Per-family framing: long weapons on a steeper diagonal and cropped to the head, armour with no stand, 3/4 view. Replace the radial blob with a crisp tier frame (a thin inner bevel plus a corner gem in the tier colour) and a soft rim light in the tier colour baked in the icon scene. Metal tint per material (iron warm-grey, steel blue-grey, mythril cyan) plus edge wear from A4. | M | 2 |
| A12 | **Name tags and health bars** | A small atlas text (Barlow Condensed, 28 px cap height), screen-size clamped (min and max pixel size), no bloom (render after the composer, or tone-mapped out of the bloom threshold), and fade when closer than 3 m. Health bar: a thin pill under the name, team-neutral colours, hidden at full health. | S | 1 |
| A13 | **Viewmodel hand** | A skin material from A5, a knuckle and nail normal map, a sleeve cloth texture from A3, and a proper grip pose per weapon family (fingers wrap the handle, `VM_GRIP` table). | M | 2 |
| A14 | **UI unification** | One panel style (dark glass `rgba(10,8,8,.82)`, 1 px gold-alpha border, 2 px radius, the same as the menu `.sheet`), one type pair (Cinzel for headings and numbers, Barlow Condensed for the rest; drop system-ui from feel.js and the HUD), and the "New goblin" button restyled as `.mbtn.small`. Fix the tip / hint / hotbar overlap with a bottom safe-area layout. | M | 1 |
| A15 | **Palette lock** | Encode ART.md's palette as `palette.js` constants (both client and itemart import it). Lint against raw hex colours in new code. Rooms off-white #eeeae2, never pure white (the walls currently clip to #fff under bloom). | S | 2 |
| A16 | **Floor aliasing** | Reduce marble vein contrast by 40 %, generate mipmaps with a pre-blur, and set anisotropy to at least 4 even on Low (the cost is negligible on any iGPU). | S | 1 |

---

# 3. Effects: 15 ranked by impact per cost

All effects must stay small and readable (house rule: not cluttered), add no lights, and use pooled objects. The cost is per active effect on an iGPU.

| Rank | Effect | Implementation notes | Perf cost | Size |
|---|---|---|---|---|
| 1 | **Hit sparks + impact flash on the victim** | Reuse the `dfxPool` Points pool (game.js 324–366): 12–16 sparks along the swing direction, coloured by armour (metal: white-yellow, cloth: dust, flesh: green-red drops), plus a 60 ms emissive flash on the victim's material (a shared uniform `uHit` per goblin, no material clone). Trigger from the `hits` message the client already receives. | 1 Points draw, pooled: about 0 | S |
| 2 | **Hit-stop + directional camera kick** | Freeze the attacker and victim poses for 50–70 ms on a confirmed hit, plus a 0.6° camera kick away from the hit direction (feel.js `camera()` hook). The biggest feel gain per line of code. | 0 | S |
| 3 | **Weapon swing trails** | A ribbon mesh (16 segments) sampling the weapon tip and base each frame during the swing window; additive, tier-coloured, fades in 120 ms. One pooled ribbon per goblin and one for the viewmodel. Only for melee families. | 1 draw while swinging | M |
| 4 | **Post tuning** | Bloom threshold 2.8 → about 1.6 on emissives only (gold, gems, screens), strength 0.22 → 0.3 with 3 mips (not 5) on Medium. Chromatic aberration: keep it at the edges only, cap 0.003, and turn it off on Medium. Vignette 0.34 → 0.25 in play and stronger when hurt (already wired in combatHurtFx). Remove grain on Medium (it costs a pass); fold grain and vignette into the A1 grade pass. Fix the title lens-flare streak. | Medium gets *cheaper* (−2 passes) | S |
| 5 | **Death dissolve** | On death the body slumps (it already exists), then a noise-threshold dissolve over 0.8 s with a glowing edge in the goblin's tier/accent colour, leaving the loot pile. Implemented as a shared `onBeforeCompile` chunk with a per-goblin `uDissolve` uniform, so no clones. Ends as gold-dust motes into the pile. | Shader branch on goblin materials only | M |
| 6 | **Footstep dust puffs** | On each step (the walk cycle already knows the foot plant), emit 3–4 soft sprites from the pool, coloured by floor theme (white dust, gold glitter in the vault, purple motes in mystery rooms). Skip on Low and beyond 12 m. | Pooled Points: about 0 | S |
| 7 | **Wizard staff bolt VFX** | Today the bolt is one moving sprite (game.js 2511). Make it a core (an emissive icosphere) plus a 10-point trail (Points with age-fade) plus an impact burst (pool) plus a bloom-catching flash. Add a 150 ms charge glow on the staff tip. | 2 draws per bolt | S |
| 8 | **Door open FX** | `doorBurst` exists (steam and sparks). Add a light sweep: the doorway's emissive floor decal (A8) pulses as the door opens, a dust fall from the lintel (pool), and a short screen-shake under 0.3° only when the camera is within 6 m. | ≈ 0 | S |
| 9 | **Vault and elixir glow** | The vault medallion gets a slowly rotating additive god-ray quad (already partly there as light shafts) plus a gold "glint" sweep shader on the coin piles: a world-space diagonal band moving across the piles' specular term, 1 uniform. Elixir/potion items get an inner-glow fresnel and rising bubble points. | 1 draw | S |
| 10 | **Ambient particles per room theme** | One `Points` per **visible** room (culled with the room): dust in facility rooms, gold motes in the vault, purple wisps in mystery rooms (it already has mist sprites, convert them to Points), teal fireflies in merchant rooms. The motion is vertex-shader only, as the dust motes already do. Hide on Low. | 1 draw per visible room | S |
| 11 | **Pickup / loot "vacuum"** | Coins and items lerp along an arc into the camera with a sparkle and a sound pitch-up per coin (audio.js), with a gold HUD counter tick. | ≈ 0 | S |
| 12 | **Damage-taken screen polish** | The existing red vignette plus a short desaturation and 0.4 % radial chromatic pulse in the grade pass (A1). At low HP, a heartbeat edge pulse. | 0 (uniforms in an existing pass) | S |
| 13 | **Critical / kill confirm** | On a kill: a gold ring shockwave decal on the floor (a scaled additive ring), the kill-feed entry flashes, and a 1-frame white rim on the victim. | 1 draw for 0.4 s | S |
| 14 | **Bribe/vote panel FX** | A coin flip arc from the player to the panel and a stamp effect on the vote slot (bribe is ON by default, so it happens often). | ≈ 0 | S |
| 15 | **Sudden-death atmosphere** | All doors open: a global grade shift (redder, more contrast), an alarm strobe on the existing door beacon materials (emissive only), and ember Points in the vault. Signals the phase change without HUD text. | 0–1 draw | S |

Rule for all of them: one shared `vfx.js` with pools (`spawnSparks`, `spawnPuff`, `ribbon`, `flash(goblin)`), a per-preset quality scale (Low gets at most a third of the particles and no trails), and a hard global cap of 600 live particles.

---

# 4. Code health

This section comes from a read-only grep audit of the whole repo. Key facts:
- game.js has 7 201 lines (742 KB) inside one IIFE, already loaded as an ES module (`await import('/game.js')` in index.html).
- It has 264 top-level consts, 204 functions and **93 `GK.*` properties**.
- server.js has 1 343 lines; most of its functions take `(m, p, now)` explicitly, so it is much easier to split.

## 4.1 Target modules

**Client** (ES modules under `client/`, sharing one `ctx` object):

| Module | Comes from (game.js lines, current main) |
|---|---|
| `client/ctx.js` | new: `{ THREE, scene, renderer, cam, P, actors, net, RS, settings, hooks: { layout, tick, frame } }` |
| `client/textures.js` | 40–175 (`canvasTex`, `textTex`, glow), merchant logo |
| `client/materials.js` | new registry (perf #4, art A3/A5) |
| `client/inv-rules.js` | 3557–3587. **Move it to items.js** so the server shares it (it duplicates server.js 213–217) |
| `client/offline-sim.js` | 3588–3788 (offline server simulation) |
| `client/ui/{tips,minimap,fun,result,inventory,shop,stations}.js` | 4030–4853, 6922–7201 (DOM only) |
| `client/goblin.js` | GKKIT + GOBLINART + ARMOUR2, 2617–3445 |
| `client/unique.js` | 3446–3554 |
| `client/world/{shell,doors,vault,chest,mystery,stations,maps,panels}.js` | 176–2615. **This is the area the Foundation 5x5 rewrites.** |
| `client/roomart.js` | 5447–6136 |
| `client/fx/{post,cull,merge,lod}.js` | 4909–5446 (FX, GFX2, PERF2) |
| `client/vfx.js` | new (Section 3) |
| `client/combat.js`, `viewmodel.js`, `social.js`, `jump.js` | 6142–6690 |
| `client/net.js` | 3789–3952 + `makeNet` |
| `client/match.js` | 6805–6912 |
| `client/loop.js` | `frame()` 6691–6799, the last to move |

**Server** (CommonJS under `server/`; `server.js` stays the entry point because tests spawn it):
- `http.js`: security, static files, CSP, tokens
- `inventory.js`
- `combat.js`
- `net.js`: applyMove, pathOk, snapshots
- `bots.js`: BOTS + FAIR + AI
- `use.js`
- `loot.js`
- `social.js`
- `match.js`: tick, rounds, doors, pace, sudden

## 4.2 Order and technique (no behaviour change)

**Approach.** Use real ES modules, not more classic scripts. The page already uses a module script and an importmap for three, and the CSP allows `'self'`. Keep world.js, items.js and botnav.js as UMD classic files, because the server `require`s them.

**Prerequisites** (one small PR, before any move):
1. server.js:52–53 serves only `^/([a-z]+)\.js$` from the `CLIENT_JS` whitelist. Add `/client/**.js` (same traversal guard as `/three/addons/`) and update the expected 200/404 lists in `tests/security.test.js:59–60`.
2. `tests/armour2.test.js:25` regex-reads `ARMOUR2_FAMS` from game.js, and `tests/qa-ui-static.test.js` greps game.js source. Change both to read `game.js + client/**/*.js` concatenated.
3. Add `client/ctx.js`. In game.js, replace the top-level definitions of the shared names with `ctx.x = ...` plus `const { x } = ctx` aliases, so untouched code is unaffected. `let` variables that are reassigned (`me`, `spawned`, `inside`, `myGold`, `invOpen`, ...) become `ctx.state.*` with getters, done in one mechanical commit per block.
4. Add a block-tag guard test (every `X-BEGIN` has an `X-END`).

**Move order** (leaf-first, least shared state):
1. textures
2. inv-rules (into items.js, with a parity test)
3. offline-sim
4. ui/*
5. goblin
6. unique, roomart, mystery (they hook in only through `layoutHooks`)
7. viewmodel, combat, social, jump
8. world/* and fx/* (after the Foundation merge; FX/PERF2 traverse the whole scene)
9. net
10. loop

**Server order:** http → inventory → use/loot → bots → net/combat → match.

**Safety rules for moving with many agents active:**
- **One block per PR.** "Move only": cut and paste plus an export/import line, no edits inside the block, BEGIN/END tags kept. The diff should show a pure move (`git diff --color-moved` is clean).
- **Freeze a block before moving it.** The parent announces "block X is being moved, do not edit it for 1 hour"; the mover rebases immediately before the move.
- **Gate:** `npm test` green, plus the headless smoke test (4.6) with zero console errors, plus a screenshot diff of the 4 standard views at Low (same draw-call count ±0).
- Keep every `window.GK*` global and `GK.*` hook: they are the test and debug API.

## 4.3 Dead code (each verified by grep)
- game.js:930–931 `labelMats` / `getLabel`: never called. That also leaves `WEAPONS` (24), `GK.WEAPONS` (38) and `RARITY` (923) dead.
- game.js:1919 `swayRot`: a no-op stub. game.js:1642 `poolM`: unused.
- **Three weapon-model implementations:** itemart.js `GKART.model` (live); game.js 860–1034 (fallback); MYSTERY `WB` 1676–1761 (fallback of the fallback). The two fallbacks run only if itemart.js fails to import. Delete both, and show an error banner instead.
- Legacy chest indices: `chests: m.chests` (server.js 144, 1209–1210, 1256) and `LEGACY_KEYS` (game.js 979, 1020, 1029, 1088, 1581). Update tests `server-basic.test.js:9` and `social.test.js:20,28` to `chestKeys` first.
- The `PERF2_ON` (`?perf2=0`) off path: 33 references that duplicate code. Remove it now that perf-2 is accepted.
- `STATS` (game.js:9) duplicates items.js. The speed fallback at game.js:6703 is unreachable.

## 4.4 Duplicated logic
- **Door graph:** three copies (game.js 2363–2373, server.js 108–115, tests/lib.js 55–61). Use `WORLD.doors()`. **The Foundation must do this**, because the 5x5 changes the graph.
- **Inventory rules:** client vs server. Move to items.js.
- **Goblin roll odds:** three copies (game.js 3610, server.js 306–308, menu.js:9). Move to items.js.
- **Walk/sprint speeds 4.6/7.5:** in game.js 6703, server.js 534 and server.js 740. Make them items.js constants.
- **Offline sim:** re-implements combat (`inCone` at 3645 vs server `attack` 394) and claim. Either share a pure `rules.js` with the server, or run the real server logic in a Worker for offline mode (bigger, but it removes about 200 lines of drift).
- **Within game.js:**
  - 22 `createElement('canvas')` sites, although the `canvasTex` helper exists
  - 50 `new MeshStandardMaterial`, 54 `MeshBasicMaterial`, 35 `SpriteMaterial`
  - 4 local box/mesh helper sets (`bx` 165, `mkm`/`box`/`sph` 1045, `MY.mk` 1599)

  Fold them into textures.js and materials.js.

## 4.5 Risky patterns
- **Extra rAF loops that ignore `GK.mode`:** PANEL 2514, vault glints 5989 (runs in the menu forever), LOOT 6982, UTILITY 7046. Drive them all from `ctx.hooks.tick` inside `frame()`.
- **Animation driven from `onBeforeRender`** (the interiors' `hook` mesh at game.js 1576): it couples animation to rendering and breaks culling (perf hotspot 2).
- **Material-signature matching:** `fxScreens` finds materials by `color === 0x103020 && emissiveIntensity === 1.4`, and perf-2 found a button colour that never matched. Tag materials explicitly (`userData.fx = 'screen'`).
- **Every match exit calls `location.reload()`.** There is no leak, but it blocks rematch-in-page and repeats the 1 s world build and the 6.7 s icon bake. The IndexedDB icon cache (perf #7) softens this.
- **Error handling:** 31 / 11 / 10 empty `catch (e) {}` in game.js, menu.js and server.js. At least `console.warn` once per site under `GK_DEBUG`.
- **innerHTML:** 41 uses. Player names are whitelisted on the server, so the risk is low. But the `esc` at game.js:4544 escapes only `<`; use the FUN block's `esc` everywhere.
- **Server:**
  - 43 unseeded `Math.random` calls; tests tolerate randomness (commit f0e6e1b). Add an injectable RNG behind `GK_DEBUG` + `GK_SEED`.
  - `m.dead` keeps whole player objects, `ws` included, until the match ends.
  - The tick drifts to 15.5 Hz on Windows (perf #10).
  - The static cache stores negative entries forever: a file requested before `npm install` finished stays 404 until restart. Also, agents' servers collide on fixed ports: 3917 was taken by another worktree's server with no `node_modules`, so three.js returned 404 and the page hung silently with no error. Always pick a random free port.

## 4.6 Test gaps, lint and CI
**Gaps.** Client code (game.js, menu.js, feel.js, itemart.js, icons.js) has no execution tests. Only regex and grep checks exist.

**Add:**
1. **`tests/smoke.browser.js`**, a separate npm script `test:browser`, not in `npm test`, so headless Chrome stays optional on agents. It does the following:
   - starts the server and launches Chrome with `--headless=new` via CDP (no puppeteer dependency needed: about 60 lines, like the script used for this audit)
   - loads `/?offline=1`, starts a match, waits for GO
   - asserts zero console errors and zero page exceptions
   - teleports to the vault on Low and asserts calls ≤ budget, plus a 9+1 light count
   - presses K (die) and checks the death screen
2. **Parity tests:** client and server inventory rules, door graph and goblin odds, each run against one shared source.
3. **A guards test:** balanced BEGIN/END tags, every `/x.js` in index.html is served, and no new `Mesh*Material` in per-instance builders (a grep heuristic).
4. **Server:** `m.dead` cleanup, and a heap-over-matches test (tickbench already reports heap).

**Lint:** `eslint.config.js` (flat config, no build step):
- server, botnav, world, items: CommonJS with node globals
- game, menu, itemart, client/**: module with browser globals, plus `THREE`, `GK`, `GKITEMS`, `GKWORLD`, `GKART`, `GKSAVE`, `GKICONS`, `GKAUDIO`
- Rules: `no-undef`, `no-unused-vars` (ignore `^GK`), `no-empty` (warn), `eslint-plugin-no-unsanitized` for innerHTML. No style rules: long lines are house style.
- `npm run check` = `node --check` on the CJS files plus `node --input-type=module --check < game.js` (and itemart.js).

**CI:** `.github/workflows/ci.yml`:
- Node 18/20 matrix: `npm ci && npm run check && npx eslint . && GK_TEST_JOBS=2 npm test`
- a second job for `test:browser`, on ubuntu with chrome-stable (software GL is fine for errors and draw-call counts)

There is no `.github/` today.

---

# 5. Task breakdown for parallel implementers

Launch these as soon as the 5x5 Foundation merges. Each row owns its files; new code goes into new files where possible. "Waits" means it must wait for the Foundation merge, because it touches the world, door or room builders being rewritten. Model split: Sonnet implements, Opus reviews.

| # | Task | Owns (files / blocks) | Waits for Foundation? | Depends on | Size |
|---|---|---|---|---|---|
| T0 | **Prereqs for modules**: `/client/` static route + security test, tests read `game.js + client/**`, `ctx.js`, block-tag guard, eslint + `npm run check` + CI workflow, `test:browser` smoke + `GK.perfProbe()` | server.js static section, tests/security, tests/armour2, tests/qa-ui-static, new `client/ctx.js`, `eslint.config.js`, `.github/`, `tests/smoke.browser.js` | No (can start now) | none | M |
| T1 | **Shared rules to items.js / world.js**: inventory rules, goblin odds, speeds, `WORLD.doors()` (if the Foundation hasn't already), parity tests | items.js, world.js, small call-site edits in server.js and game.js | Yes (world.js) | none | S |
| T2 | **Perf core**: matrix freeze registry, manual `scene.updateMatrixWorld`, room tags (`userData.room`) and culler trusting tags, interiors ticking via `GK.tickers`, portal frustum test, preset anisotropy without re-upload, culler allocation fixes | FX / GFX2 / PERF2 blocks (game.js 4909–5446) → `client/fx/cull.js`; one-line tags in builders | Yes | T0 | M |
| T3 | **Static merge + instancing + material registry** per room (BatchedMesh for props), theme atlases | new `client/materials.js`, `client/fx/merge.js`; builders switch to `getMat` | Yes | T2 | L |
| T4 | **Light pool** (9 point lights reassigned to the nearest visible rooms, fade, stable light-state version) | new `client/lights.js`; removes per-room light placement in the world builder | Yes | T2 | M |
| T5 | **GTAO without a second scene pass**, bloom 3 mips on Medium, grain + vignette + grade folded into one pass, title flare fix | FX post section → `client/fx/post.js` | No (post only) | none | M |
| T6 | **Startup**: idle-sliced world build during the wheel, `compileAsync` before GO, menu podium LOD | MATCH block + world build entry point + menu podium | Yes | T2 | M |
| T7 | **Icon bake worker + IndexedDB cache** | itemart.js, new `client/iconworker.js` | No | none | M |
| T8 | **Server perf**: next-hop table, bot re-plan amortisation, drift-free 20 Hz tick, negative-cache fix, `m.dead` slimming, seeded RNG under `GK_SEED` | server.js BOTS/AI, tick loop, static cache; botnav.js | Yes (door graph) | T1 | M |
| T9 | **Art: procedural texture library + ORM + curvature/AO bake** (A2a, A3, A4) | new `client/proctex.js`, `client/bake-ao.worker.js`; apply in materials.js | Yes | T3 | L |
| T10 | **Art: goblin skin shader, rim, outline, pauldrons, ear fix, viewmodel hand** (A5, A6 pauldrons, A7, A13) | GOBLINART / ARMOUR2 / VIEWMODEL blocks → `client/goblin.js`, `client/viewmodel.js` | No | T9 (texture library) for normals; can start with the shader | M |
| T11 | **Art: rebuild dated props** (knowledge tree, mystery chest, gold cubes), decals, contact shadows (A2b, A6, A10) | CHEST / MYSTERY / stations blocks, ROOMART | Yes | T3 | M |
| T12 | **Art: grade/LUT, fog, lighting layout, floor aliasing** (A1, A8, A9, A16) | `client/fx/post.js` (after T5), room materials | Yes for A8 | T4, T5 | M |
| T13 | **Items: icon framing, tier frame, metal tints** (A11) | itemart.js (after T7) | No | T7 | S |
| T14 | **UI unification + name tags / health-bar atlas** (A12, A14, perf #5) | index.html CSS, feel.js CSS, HUD sections of game.js, new `client/ui/tags.js` | No | none | M |
| T15 | **VFX pack** (Section 3, effects 1–15) | new `client/vfx.js`; small hooks in COMBAT, JUMP (footsteps), rules bolt, doors, death | No (effects 8 and 10 wait) | T5 for 4 and 12 | M–L |
| T16 | **Code split moves** (Section 4.2 order), one block per PR, after T0 | per block, frozen while moving | Ordered: UI, goblin, offline-sim can go now; world/fx/loop after T2–T4 settle | T0 | L (incremental) |
| T17 | **Dead-code removal** (Section 4.3) | game.js fallbacks, `PERF2_ON` path, legacy chests + tests | Partly (world builders) | T16 for the fallbacks | S |

**Suggested waves:**
- **Now (before the 5x5 lands):** T0, T5, T7, T14, T10 (shader part), T15 (effects 1–7, 9, 11–14).
- **Wave 1 after the merge:** T1, T2, T8, then T4 and T6 after T2.
- **Wave 2:** T3, then T9 and T11, then T12 and T13.
- **Continuous:** T16 and T17, one block at a time, never concurrently with the block's owner.

Re-measure after each wave with `GK.perfProbe()` against the budgets in Section 1.2 (vault, Low and High).

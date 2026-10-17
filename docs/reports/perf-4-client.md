# Client performance pass 4 (PERF4)

All game code is in `game.js`, in the `PERF4-BEGIN/END` block at the end of the FX section. There are a few tagged one-line hooks: `renderWorld`, `frame()`, `wall()` (`d.wallL`), the hover raycaster's layers, and the `fxBuildBlobs` skip.
- `?perf4=0` turns the whole pass off.
- `?batch=0` turns off only the batching.

No lights were added (still 9 PointLights + 1 Hemisphere). There are no server changes.

## What changed
1. **Matrix freeze.**
   - The Scene no longer recomposes its own matrix. Before, this forced a world-matrix multiply on all ~9000 objects every frame.
   - About 2600 auto-updating nodes inside frozen rooms are now "watched": a node's matrix is recomposed only on a frame where its transform actually changed. A rolling scan picks up rooms that are built later.
2. **Static batching (`P4B`).**
   - Requires `WEBGL_multi_draw` (Chrome and Edge).
   - Every opaque or additive mesh that uses a built-in material inside a room-tagged frozen object is mirrored into one `BatchedMesh` per material. This covers room shells, kits, door parts, rivets and chains, and room art.
   - Each frame, just before drawing, every instance copies its original's culler visibility, visible flags and world matrix. A moved, re-materialled or detached original drops its mirror and draws itself again.
   - The originals stay in the scene on hidden layer 30, so raycasts and game logic still work. The hover ray uses `layers.enableAll()`.
   - Each batch compiles with `compileAsync` before it replaces anything, so batching never stalls a frame on a shader compile.
   - Materials used by only one mesh are left alone.
3. **Fallback when multi-draw is missing (Firefox, for example).**
   - **Door rest bake:** a door that is fully open or fully closed is baked into one mesh per material.
   - **Room interior merge:** stable room interiors are merged per material after 1.5 s of observation. The merge is checked every frame and undone if anything in it changes.
4. **Always on:**
   - A fully open sliding leaf hidden inside its wall pocket is not drawn.
   - Beacon beams that have faded to zero are not drawn.
5. **Tools:**
   - `GK.perfProbe(n)` (only with `?debug=1` or `?perf=1`).
   - `tools/perfbench.js`: a real-GPU headless Edge benchmark over CDP. It uses random ports, a seeded `Math.random`, passive bots, every door open, and high process priority. It has these options: `--profile`, `--attrib`, `--shots`, `--diff`, `--soak` and `--budget`.
   - `npm run test:browser` checks that the vault view stays within Low ≤ 300 calls, High ≤ 600 calls and Low CPU ≤ 8 ms. It is not part of `npm test`.

## Results
- **Setup:** headless Edge, ANGLE D3D11, 1600x900. **Every door is open (sudden death)**, with the current room's natural round doors as the "closed" view.
- **Load:** the machine was shared and at 100 % CPU, so treat CPU ms as ±20 %. Draw calls are exact.
- **Frame time:** vsync-capped at 16.7 ms.

| Low | vault | tree 6 | home c0 | corridor (row 2) | vault, doors closed |
|---|---|---|---|---|---|
| draw calls, before | 514 to 554 | 532 to 891 | 168 to 175 | 489 to 503 | 243 |
| draw calls, after | **227** | **140** | **92** | **180** | **122** |
| frame CPU ms, before | 13.8 to 15.5 | 11.8 | 8.8 to 10.3 | 11.6 to 12.0 | 8.9 to 10.6 |
| frame CPU ms, after | 10.0 | 8.6 | 7.7 | 10.5 | 7.9 |

**High after:** vault 372 calls, tree 265, home 142, corridor 269, closed 159.
- The High rows include 16 post passes.
- Before PERF4, High in the vault was about 800 calls (Foundation report). I did not measure the before build on High on the same day.
- High frame times were 16.9 to 21.7 ms, which is GPU bound by post-processing.

**Profile, Low vault:** `updateMatrixWorld` + `multiplyMatrices` fell from 25.5 % of all samples to 13 %, and multiply alone fell from 10.9 % to 1.7 %.

**Visual A/B:** `docs/screens/perf4-low-*.jpg` shows before | after | difference x8, with goblins, viewmodel and HUD hidden.
- Mean absolute difference is 0.08 to 0.8 out of 255.
- The differing pixels are only time-animated parts: rotating beacons, laser flicker, glints and falling leaves. Static geometry is identical.

## Not done / for the merger
- **Not done:**
  - the 60 s heap soak (`--soak 60` exists but was not run)
  - Medium and Ultra after batching
  - goblin outline / LOD work
  - menu podium LOD
  - `compileAsync` before GO
  - idle-sliced world build
  - culler allocation fixes (`fxInPortal` and `fxDoorRect` still allocate small arrays)
  - a skip of fully static subtrees in the matrix walk (drafted, not applied)
- **Low CPU is still about 10 ms in the vault on this loaded machine,** over the 8 ms budget, so `npm run test:browser` may fail there. The call budgets pass.
- **Batching adds about 35 shader programs** (batching variants). They are compiled in the background.
- **Texture count grows** by the batches' small data textures.
- **Tests:** `npm test` (GK_TEST_JOBS=3) passed except `bots5`, a timing test under load, which passes when run alone.

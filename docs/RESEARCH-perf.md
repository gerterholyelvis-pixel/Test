# Research: less lag, higher fps

Owner request: *"work on more research towards making there less lag and higher fps for this game"*.

This is a research document. No game file was changed. The new experiment scripts live in `tools/research/` and only read the running game:

| Script | What it does |
|---|---|
| `perf-ab.js` | Runtime A/B patches over CDP |
| `load-profile.js` | Profiles startup and match start |
| `snapcodec.js` | Compares JSON and binary snapshot sizes |

It builds on `docs/QUALITY-PLAN.md` §1 and the reports `perf-2`, `perf-3-client`, `perf-4-client`, `perf-4-server`, `t5-post`, `t7-icons` and `t15-vfx`, and does not repeat what they already fixed.

**Setup.** Measured on main at `c3e2475`:
- Headless Edge, ANGLE D3D11, AMD Radeon integrated GPU, 1600x900 at DPR 1.
- Offline match with passive bots and every door open (perfbench's worst case).

**Caveat.** Other agents kept the machine at about 90 % CPU the whole time.
- Absolute CPU numbers move by ±20-50 % between runs.
- The A/B scripts therefore take a fresh base run right before each variant and report pairs. Read the deltas, not the absolutes.
- Draw calls and object counts are exact.

---

## 0. The short version

1. **Low is CPU-bound, and not by draw calls.**
   - Halving the resolution changes nothing (22.1 → 23.0 ms).
   - The vault draws only 226 calls, yet `renderer.render` takes 15-20 ms.
   - The time goes to three's scene walk over about 10 500 nodes, including about 6 000 batched originals that are never drawn. Then comes per-draw uniform work (9 point lights), then PERF4's own per-frame bookkeeping.
2. **High is GPU-bound in post-processing.**
   - Disabling bloom saves 8.8 ms per frame.
   - Bypassing all post saves 10 ms.
   - Half resolution saves 10 ms.
   - AO costs almost nothing (it is already half resolution).
3. **Hitches come from shader linking and lazy builds.**
   - First-use program linking blocks the main thread: 5.1 s before the menu and about 14 s across a session (`getProgramInfoLog`).
   - Lazy room-art builds after GO cause 100-800 ms long tasks.
4. **Network "lag" on screen is mostly an under-filled interpolation buffer.**
   - Even on LAN, the observer has no snapshot newer than its render time in 69 % of frames, and sees 39 pops per minute.
   - The biggest downstream message is not the snapshot. It is the full `players` roster: about 2.25 KB, about 1.1 times per second, about 2.5 KB/s per client, roughly 65 % of all downstream.
5. **Server capacity is roughly 20-30 matches per core today.** Bots are 32 % of a tick. At 50 matches on this loaded box the tick collapses to 4.5 Hz.
6. **Do not migrate to WebGPU, WebTransport or WASM now.** Section 4 explains why.

---

## 1. Measured hotspots right now (top 10, with traces)

### 1.1 Client baseline (perfbench, `--profile --attrib --soak 30`)

| Preset | View | Calls | k triangles | Frame CPU ms | CPU in render ms | Frame interval ms (mean / p95) | Heap MB |
|---|---|---|---|---|---|---|---|
| Low | vault | 226 | 316 | 19.3 | 17.1 | 20.3 / 33.5 | 644 |
| Low | tree | 234 | 284 | 19.8 | 17.8 | 20.7 / 33.4 | 670 |
| Low | home | 161 | 77 | 21.0 | 16.5 | 22.0 / 33.4 | 663 |
| Low | corridor | 180 | 320 | 20.1 | 15.7 | 20.9 / 33.4 | 652 |
| Low | closed | 125 | 166 | 16.3 | 14.6 | 17.4 / 17.5 | 663 |
| High | vault | 328 | 380 | 20.6 | 18.7 | 21.7 / 33.4 | 713 |
| High | closed | 160 | 181 | 21.3 | 19.2 | 24.3 / 33.5 | 628 |

Other numbers from the same runs:
- **Scene size:** 10 515 objects, 7 630 meshes, 104-131 shader programs, 284-492 textures.
- **Soak (Low, 30 s):** heap flat at 657-672 MB, with a maximum frame of **350 ms**.
- **Load (Low):** a **7.6 s** long task at match start, plus about 100 further long tasks of 50-1 400 ms before the icon bake finished.
- **Load (High):** a 6.2 s long task.

### 1.2 The top 10

| # | Hotspot | Evidence | Where |
|---|---|---|---|
| 1 | **Shader link stalls.** 104-131 programs, each linked on first use, synchronously. | Load profile, self time: `onFirstUse` 5 127 ms before the menu. After Start, `getProgramInfoLog` 14 386 ms self and `WebGLProgram.getUniforms` 14 466 ms inclusive. The 7.6 s / 6.2 s match-start long tasks. `getMaxAnisotropy` 1 193 ms self is a GPU sync point waiting on the same compiles. | three `setProgram`, reached from `menu.js titleRender`, `frame()`, and `fxApplyQuality` (game.js ~5723) |
| 2 | **Scene matrix walk.** | Low vault profile: `updateMatrixWorld` 18.4 % self and `multiplyMatrices` 3.5 % of all samples. Micro benchmark (`perf-ab --exp micro`, 4 reps): three's walk is 4.0-8.4 ms per frame, and **1.7-2.1 ms with the 5 993 layer-30 leaf originals detached**. Visible-tree walk: 6 860 nodes, 4 004 of them layer-30 originals that are never drawn. | three `Object3D.updateMatrixWorld`, reached from the PERF4 `scene.updateMatrixWorld` patch (game.js 6359) |
| 3 | **PERF4 per-frame bookkeeping.** | `perf4Tick` 6.1 % self (compares about 2 600 watched transforms every frame). `p4bSync` 2.9 % self (walks every source's parent chain and compares 12 matrix elements). `p4bFind` rescans subtrees forever and allocates about 2 MB per 4 s. | game.js 6338, 6642, 6618 |
| 4 | **Per-draw CPU cost.** About 50-80 µs per call. | Render with the walk skipped is still 9-20 ms for 226 calls (micro). The profile shows `setProgram`, `refreshUniformsCommon`, `setValueV3f` (5.9 MB of the 4 s allocation sample), `getTextureCacheKey`, `bindTexture` and `bindVertexArray`. 9 point lights in each lit program mean light uniforms are refreshed on every program switch. | three render loop |
| 5 | **High post-processing is GPU-bound.** | `perf-ab --preset high`, uncapped, deltas against a fresh base: bloom off 36.8 → **28.0 ms**; whole post off 31.4 → **21.1 ms**; half resolution 32.5 → **22.4 ms**; AO off 32.5 → 32.5 ms (no change). | `FX-BEGIN` composer (game.js 5704-5830) |
| 6 | **Lazy builds during play.** | After GO, R5 room-art `make` costs 6.5 s inclusive and `mergeVertices` 1.7 s self. These are the 100-800 ms long tasks after GO. Soak maximum frame: 350 ms. | `ROOMS5ART` `make()` (game.js 7461), `ROOMART.near` |
| 7 | **Station hover raycast every frame.** | `merchantHoverTick` 9 254 ms inclusive out of 133 s, about 7 % of the main thread: a recursive `intersectObjects` over full station models (8.7 s). It runs whenever a station is within 20 m, which is the whole home phase. | game.js 5246 |
| 8 | **Material cache key PNG-encodes canvases.** | `getDataURL` 901 ms self before the menu. `MM(c, o)` keys on `JSON.stringify(o)`, and `o.map` is a CanvasTexture, so `Texture.toJSON` turns the canvas into a PNG data URL on every call. `itemart.js:130` has the same pattern. | game.js 1699 (MYSTERY), itemart.js 130 |
| 9 | **Heap and per-frame garbage.** | The JS heap is **640-720 MB** in play; QUALITY-PLAN measured 329 MB on the 3x3 map. Allocation sample: 31.6 MB in 4 s, about 130 KB per frame. Game-side allocators: `p4bFind` 2.0 MB, `fxCullBegin` 1.8, `fxInPortal` 1.8, `fxDoorRect` 0.35, `A.anim` 0.9, `animate` (interiors) 0.5. | game.js 6239, 6212, 6199, 3835, 1660 |
| 10 | **Download.** | 4 374 KB transferred per visit (51 responses). Every game file is served `no-cache` **with no ETag or Last-Modified**, so a repeat visit downloads all of it again and V8 loses its code cache. Nothing is compressed. `itemart.js` is fetched twice. `index.html` awaits each module import in turn, which is a waterfall. Brotli q11 would bring the 4.03 MB of JS and HTML down to **0.80 MB (−80 %)**; gzip-6 to 1.0 MB. | server.js `staticFor` (64-79), index.html 678-690 |

### 1.3 Server and network hotspots

**`players` roster.**
- Measured with `tests/tickbench.js 1 15 {10,25,50}`: the roster message is 2.47 / 2.67 / 1.96 KB/s per client, against 0.34 / 0.49 / 0.19 KB/s for snapshots `s`.
- The message is a full `{players:[...all pub(p)]}` sent whenever `m.dirty` is set (server.js 221). That covers gold, HP, gear, kills and so on.

**Server tick profile.** 10 matches, `PROF=` CPU profile, 3.1 s busy out of 27 s:

| Share of busy time | What |
|---|---|
| 32 % | bots (`botThink`); `b5Think → station5` alone is 22 % |
| 15 % | act5 `tick` |
| 7.3 % self | vb5.js 429 `wrap`, which does `Object.assign({}, ctx, ...)` per cell per tick |
| 14 % | `mv` / `applyMove` / `pathOk` for bots |
| 9.3 % | socket sends |
| 6.5 % | `snapshots` |

**Scale.** At 10 / 25 / 50 matches the tick ran at 14-19 / 18.9 / **4.5 Hz**, with a maximum tick of 0.25-2.3 s. The box was loaded, so the 10-match rows varied between 4.4 and 27 ms average tick. In the 50-match run, humans were kicked for "16 movement corrections" (stalls cause refused moves).

**Interpolation starvation** (`tools/netsim.js`, 8 clients):

| Scenario | Picture lag p50 / p95 ms | Starved frames | Pops per minute | Corrections per minute |
|---|---|---|---|---|
| lan | 60 / 90 | **69 %** | 39 | 0 |
| 100 ±30 ms, 2 % loss | 195 / 340 | 48 % | 89 | 10.6 |
| 200 ±60 ms | 290 / 340 | 45 % | 141 | 0 |

The adaptive delay (p90 of snapshot age) settles below one snapshot interval plus tick jitter. The tick interval sd is 21-36 ms on this box, so the client extrapolates or holds most of the time.

---

## 2. Ranked techniques (28)

Ranking is gain for this game divided by cost and risk, with Low on an iGPU first and lag second. **Measured** means a number from this machine. **Est.** means an estimate from the profile shares.

### 2.1 Summary

| Rank | Technique | Expected gain | Cost / risk | Owner (§3) |
|---|---|---|---|---|
| 1 | Keep never-drawn batched originals out of the scene walk | Low −3 to −6 ms per frame (measured walk 4-8 → 1.7-2.1 ms) | M / medium (raycast, PERF4 invariants) | perf-5 |
| 2 | Precompile every program before GO (`compileAsync`) and turn `checkShaderErrors` off in production | Removes the 6-8 s match-start stall and most of the 14 s of in-play link stalls | S-M / low | perf-5 |
| 3 | Cheaper bloom on High (quarter-res start, dual-filter / Kawase, or 3 mips) | High −4 to −8 ms (measured: bloom costs 8.8 ms) | S-M / low (look) | perf-5 |
| 4 | Dynamic resolution on High/Ultra (`GK.settings.scale` driven by frame time) | High −10 ms at 0.5x, measured; 0.75x est. −5 ms | S / low | perf-5 |
| 5 | Interpolation delay floor (≥ 1 tick + 2σ jitter) and time-stretch instead of extrapolate | Starved frames 69 % → under 10 %, pops 39 → under 10 per minute (est.); costs +20-40 ms remote latency | S / low | net (after combat/climb) |
| 6 | Delta roster (send changed `pub` fields only) | Downstream −50 to −65 % (measured share) | S-M / low | server |
| 7 | HTTP: Brotli precompress, ETag / 304, hashed immutable URLs, parallel imports | First visit 4.4 → about 0.8 MB; repeat visit about 0 bytes plus a warm V8 code cache | S / low | load |
| 8 | Fix the `MM` / itemart material key (use `texture.uuid`, not `JSON.stringify`) | −0.9 s at load, measured | XS / none | load |
| 9 | Slice lazy room-art builds (`scheduler.yield`, 8 ms budget) or build them during the wheel | 100-800 ms hitches → under 50 ms | M / low | perf-5 or room-art |
| 10 | Station hover: proxy boxes and 10 Hz, or three-mesh-bvh | −7 % main thread at home (measured) | S / low | ui |
| 11 | PERF4 bookkeeping: event-driven watch list, dirty flags in `p4bSync`, stop `p4bFind` after the build settles | −1.5 to −3 ms per frame (9 % of samples) | M / medium | perf-5 |
| 12 | Batch culling: `perObjectFrustumCulled = false` where the room culler already hides whole roots | −1.4 ms CPU (measured, one rep pair) | XS / low | perf-5 |
| 13 | Fewer programs (material registry, fewer batching variants) | Fewer stalls and fewer `setProgram` switches; est. −10-20 % per-draw cost | M / medium | perf-5 |
| 14 | Goblin rigid skinning: one mesh per goblin per LOD, with a part-index attribute and a matrix uniform array | 17-18 → 3-4 calls per goblin; 8 goblins in view ≈ −110 calls (est.) | M / medium (goblin art) | goblin art |
| 15 | Culler and anim allocation fixes (`fxDoorRect`, `fxInPortal`, `fxCullBegin`, `A.anim`) | −5 MB per 4 s of garbage; fewer GC spikes (soak maximum 350 ms) | S / none | perf-5 |
| 16 | Heap diet: drop CPU arrays of merged/batched originals that are never raycast; heap snapshot first | 640-720 MB → est. 350-450 MB; less GC and less swapping on 8 GB laptops | M / medium | perf-5 |
| 17 | Server: reuse the vb5 `wrap` context, amortise `station5`, cheap path for bot `applyMove` | −20-30 % tick CPU (est. from shares) | S-M / low | server |
| 18 | Server: one match group per worker (`worker_threads` or cluster per core) plus event-loop lag monitor | Linear scaling to cores; 50+ matches stable | M / medium | server |
| 19 | Load test harness for 50-200 matches (separate load-generator process, p99 loop lag, kicks) | Makes 17-18 verifiable | S / none | server |
| 20 | MSAA 4x → 0 plus SMAA/FXAA in the final pass on High (HalfFloat MSAA is bandwidth-heavy on iGPU) | Est. −1 to −3 ms GPU on High | S / look | perf-5 |
| 21 | Binary snapshots (u8 id, i16 cm x/z, u16 yaw: 9 B per mover) | Snapshot payload −71 % (measured 4.6 → 1.33 KB/s, 8 near) | M / medium (protocol) | net (later) |
| 22 | Long Animation Frames (LoAF) telemetry in debug builds | Finds the remaining hitches by script | XS / none | perf-5 |
| 23 | Cap the frame rate on battery / Compute Pressure (Chromium) | Thermal headroom on laptops, less throttling | S / low | settings |
| 24 | Sprites: atlas tags exist (`client/ui/tags.js`); hide tags beyond 18 m | −33 calls (measured with all sprites off); CPU change within noise | S / none | ui |
| 25 | Serialise once per room tier and reuse the Buffer for every receiver | −half of `snapshots` (6.5 %) | S / low | server |
| 26 | Multi-region hosting (Render: Oregon, Ohio, Virginia, Frankfurt, Singapore) with ping-pick | −50-150 ms RTT for far players | M / ops | ops |
| 27 | OffscreenCanvas worker for the minimap and maps | Small (10 Hz already); isolates 2D drawing | M / low | later |
| 28 | Renderer in a worker (OffscreenCanvas + input proxy) | Jank isolation only; total CPU unchanged | L / high | not now |

### 2.2 Details

#### 1. Keep never-drawn originals out of the walk (GPU-side CPU, the biggest Low lever)

**What.** PERF4 mirrors static meshes into BatchedMeshes and moves the originals to layer 30. They stay in the scene so raycasts and logic still work. That leaves 5 600-6 200 leaf nodes that three walks twice per frame:
- once in `updateMatrixWorld`, which recurses into every child unconditionally (r186 three.core.js ~13067-13100), and
- once in `projectObject`, which recurses until `visible === false`, not until a layer test fails.

**Measured.** With the leaves detached, three's walk fell from 4.0-8.4 ms to 1.7-2.1 ms (4 reps). Whole frames at Low are 16-21 ms.

**Options:**
- (a) Move the originals under one non-rendered holder Group outside `scene`. Keep their world matrices frozen and copy them once. Run raycasts against that holder.
- (b) Give frozen roots an `updateMatrixWorld` that returns unless a dirty flag is set. The flag would be set by the PERF4 watch, which knows when something moved.
  - The `skipStatic` experiment applied (b) to 702 roots / 1 307 nodes, the only roots with no watched node inside. It gained −3 ms in one noisy pair.
  - Most roots contain one animated node, so (b) needs a per-node dirty propagation, not a per-root check.

**Risk.** Hover and other raycasts, `p4bSync`'s parent-chain check, and code that reparents originals.

**Verify.** `node tools/research/perf-ab.js --preset low --exp micro --reps 4`. Then perfbench `--views vault,closed` before and after: Low frame CPU should drop by 3 ms or more.

**Sources:**
- three `Object3D.updateMatrixWorld` / `matrixWorldAutoUpdate`: https://threejs.org/docs/#api/en/core/Object3D.matrixWorldAutoUpdate
- r186 source: `node_modules/three/build/three.core.js` and `three.module.js` (`projectObject`)

#### 2. Precompile programs; production `checkShaderErrors = false`

**What.** On ANGLE/D3D11 the HLSL compile happens at link. three asks for link status, the info log and uniforms on first use (`onFirstUse`), which blocks until the driver finishes.
- `KHR_parallel_shader_compile` only helps if you ask late: compile everything, then poll `COMPLETION_STATUS`.
- `renderer.compileAsync(scene, cam)` does exactly that. PERF4 already uses it for batches.

**Measured.** 5.1 s of `onFirstUse` before the menu, 14.4 s of `getProgramInfoLog` after Start, and a 6-8 s match-start long task.

**How:**
- During the wheel, call `compileAsync` over a staging scene holding every material variant: batched and unbatched, LOD levels, goblin types, the composer passes and `fxApplyQuality` presets.
- Set `renderer.debug.checkShaderErrors = false` unless `?debug=1`. This skips the info-log fetch; the link wait remains, but off the critical path once precompiled.

**Gain.** Est. 6-8 s → under 1 s blocking at match start; most of the 14 s in-play stalls go away.

**Verify.** `node tools/research/load-profile.js --preset low`: `onFirstUse` and `getProgramInfoLog` self time, plus the long-task list.

**Sources:**
- three `WebGLRenderer.compileAsync` and `debug.checkShaderErrors`: https://threejs.org/docs/#api/en/renderers/WebGLRenderer
- KHR_parallel_shader_compile: https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/
- three PR #19752 (2020, parallel compile): https://github.com/mrdoob/three.js/pull/19752
- Khronos list on ANGLE link-time compile (2019): https://www.khronos.org/webgl/public-mailing-list/public_webgl/1904/msg00022.php

#### 3. Cheaper bloom on High

**What.** `UnrealBloomPass` with 4 mips costs 8.8 ms on this iGPU at 900p. That is the single biggest High cost.

**Options:**
- (a) Start the chain at quarter resolution.
- (b) Use a dual-filter / Kawase downsample-upsample of about 2 taps per level instead of a separable Gaussian per mip. This is what pmndrs `postprocessing`'s mipmap-blur bloom does.
- (c) Use 3 mips on High, as Medium already does (T5's `makeBloom(n)`).
- (d) Fold the luminance threshold into the scene pass.

AO costs about 0 because it is half resolution already, so leave it.

**Gain.** Est. −4 to −8 ms on High.

**Verify.** `perf-ab --preset high --exp noBloom,half` (UNCAPPED=1) before and after, plus perfbench `--shots` A/B for the look.

**Sources:**
- pmndrs postprocessing (EffectPass merges effects; MipmapBlur bloom): https://github.com/pmndrs/postprocessing
- three UnrealBloomPass: https://threejs.org/docs/#examples/en/postprocessing/UnrealBloomPass

#### 4. Dynamic resolution on High/Ultra

**What.** High is fill-bound: 0.5x resolution saved 10 ms. `GK.settings.scale` already exists (`fxPixelRatio`).
- Add a controller that keeps the frame at 16.7 ms by stepping the scale between 0.7 and 1.0 in 0.05 steps.
- Use hysteresis of about 1 s and only resize the composer targets when the step changes.

Do not use it on Low, which is CPU-bound and showed no change.

**Gain.** Est. 60 fps on High on this iGPU with about 0.8x; −5 ms at 0.75x.

**Verify.** `UNCAPPED=1 perf-ab --preset high --exp half`, then a soak with the controller on.

**Source.** `setPixelRatio` and adaptive DPR pattern (drei PerformanceMonitor / AdaptiveDpr): https://github.com/pmndrs/drei#performancemonitor

#### 5. Interpolation delay floor and time-stretch

**What.**
- Render remote goblins at `serverNow - delay`, with `delay ≥ tickInterval + 2·σ(arrival jitter)`. Today the floor is p90 of age, which comes out at about 50 ms on LAN.
- When starving, slow playback by up to 10 % instead of extrapolating. When far behind, speed up by up to 10 %. This is the Overwatch / Rocket League approach to buffer health.

Valve's default is 2 snapshots of interpolation (100 ms, `cl_interp 0.1`). Gambetta and Fiedler describe the same buffer.

**Measured.** 69 % starved frames on LAN and 39 pops per minute.

**Gain.** Smoothness, at a cost of +20-40 ms remote latency. Melee hits stay correct because the server rewinds them.

**Verify.** `node tools/netsim.js --scen lan,100j30,100j30l2,200j60`: `starvePct`, `popsPerMin` and `visualP50`. The seeded `sim.model()` gives a noise-free comparison.

**Sources:**
- Gambetta, Entity Interpolation (2014): https://www.gabrielgambetta.com/entity-interpolation.html
- Fiedler, Snapshot Interpolation (2014): https://gafferongames.com/post/snapshot_interpolation/
- Valve, Source Multiplayer Networking: https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking
- Ford, Overwatch Gameplay Architecture and Netcode (GDC 2017): https://www.gdcvault.com/play/1024001/
- Cone, It IS Rocket Science (GDC 2018): https://www.gdcvault.com/play/1024972/

#### 6. Delta roster

**What.** Today one gold change re-sends every player's public record, 2.25 KB. Send `{pd:[[id, field, value], ...]}` for changed fields only, and send the full roster on join and resume.

**Measured share.** The roster is 2.5 of 3.4-4.3 KB/s per client.

**Gain.** Downstream about −55 % (est.). Fewer bytes also mean less TCP head-of-line exposure.

**Verify.** `node tests/tickbench.js 1 15 10`: the per-type KB/s line.

**Source.** Fiedler, State Synchronization (2015, priority and delta): https://gafferongames.com/post/state_synchronization/

#### 7. HTTP: compression, validators, parallel imports

**What:**
- Precompress Brotli q11 at startup (game.js takes 3.3 s at q11, so do it once and cache it, or use q5 on the fly).
- Serve `content-encoding: br` / `gzip` by `Accept-Encoding`.
- Add an `ETag` (content hash) so `no-cache` revalidates with a 304. A 304 also keeps V8's code cache; a 200 throws it away.
- In `index.html`, start all `import()` calls together (`Promise.all`, or `<link rel=modulepreload>`) instead of awaiting each in turn.

Render's edge may already compress. A Render forum answer says it does by default, but this was not confirmed in the official docs. Check the production response headers before building it.

**Measured.** 4.37 MB per visit, Brotli 0.80 MB, gzip 1.0 MB.

**Gain.** Faster first load on slow links. The repeat visit costs only revalidation round trips.

**Verify.** `load-profile.js` "transferred KB", then a real production check: `curl -sI -H 'accept-encoding: br' https://<host>/game.js`.

**Sources:**
- V8 code caching (a 200 clears the cache, a 304 keeps it): https://v8.dev/blog/code-caching-for-devs
- Render forum on compression: https://render.discourse.group/t/do-you-automatically-compress-json-responses-with-brotli/5477
- web.dev HTTP cache: https://web.dev/articles/http-cache

#### 8. Material key without PNG encoding

`MM(c, o)` (game.js 1699) and itemart.js 130 key with `JSON.stringify(o)`. When `o.map` is a texture, `Texture.toJSON` → `ImageUtils.getDataURL` encodes the canvas as a PNG.
- Use a replacer that maps textures to their `uuid`.
- **Measured:** 901 ms self at load.
- **Verify:** with `load-profile.js`, `getDataURL` should disappear.

#### 9. Slice lazy builds

R5 `make()` and ROOMART `near` build whole room art in one task, 100-800 ms each, after GO.
- Make the builders generators.
- Run them with `await scheduler.yield()` every 8 ms. It is in Chrome/Edge 129+ and Firefox 142; Safari falls back to `setTimeout`.
- Better still, prebuild the camera's first rooms during the wheel.

**Verify.** `load-profile.js` long tasks after GO, and the perfbench soak maximum frame (350 ms today).

**Sources:**
- web.dev, Optimize long tasks: https://web.dev/articles/optimize-long-tasks
- MDN `scheduler.yield`: https://developer.mozilla.org/en-US/docs/Web/API/Scheduler/yield

#### 10. Station hover raycast

`ray.intersectObjects(T, true)` over full station meshes every frame within 20 m.
- Raycast against one `Box3` / low-poly proxy per station, at 10-15 Hz, and only when the camera moved or turned by more than 1°.
- **Measured:** 7 % of main-thread time.
- **Source:** three-mesh-bvh, if exact hits are needed: https://github.com/gkjohnson/three-mesh-bvh

#### 11. PERF4 bookkeeping

- `perf4Tick` compares about 2 600 transforms per frame. Instead, register an animated node when its owner moves it, or split hot and cold lists and check the cold list every 30th frame.
- `p4bSync` re-walks parent chains and compares 12 floats per source per frame. Compare `matrixWorld` version counters or a per-root dirty flag instead.
- `p4bFind` rescans forever. Stop after 2 clean sweeps, and rescan only on a `ROOMART` / R5 build event.

**Gain.** Est. −1.5 to −3 ms.

**Verify.** perfbench `--profile`: the self share of the three functions.

#### 12. Batch per-instance culling off

The room culler already hides whole roots, and `p4bShow` then hides instances. The per-instance sphere test inside BatchedMesh costs JS per instance per frame.

**Measured.** −1.4 ms CPU with `perObjectFrustumCulled = false` on all 261 batches (`perf-ab --exp noBatchCull`). GPU cost rose by 0.2 ms in frame interval, which is noise.

**Source.** BatchedMesh `perObjectFrustumCulled` / `sortObjects` (r184 source, defaults true): https://threejs.org/docs/#api/en/objects/BatchedMesh

#### 13. Fewer programs

104-131 programs exist, and perf-4 says batching added about 35. Every distinct program is a D3D link (hotspot 1) and a `setProgram` switch with a full light-uniform refresh (hotspot 4).
- Build a material registry keyed by signature (QUALITY-PLAN 1.3 #4).
- Normalise look-alike parameters, because tiny `roughness` differences do not split programs, but `defines` and maps do.
- Avoid `MeshPhysicalMaterial` features where unused: 20-30 physical meshes are visible in a frame.

**Verify.** `renderer.info.programs.length` and the perfbench "programs" column.

**Source.** three program cache key: https://threejs.org/docs/#api/en/renderers/WebGLRenderer.info

#### 14. Goblin rigid skinning

A goblin is 17-18 draw calls, mostly baked parts that share one material per type. Merge the parts into one geometry with a `partIndex` attribute, and drive it with a small `mat4` uniform array (rigid skinning; or `SkinnedMesh` with one bone per part, weight 1).
- About 3-4 calls per goblin.
- No GPU vertex skinning cost beyond one matrix fetch.
- LOD copies keep the attribute.

**Gain.** About −110 calls with 8 goblins in view (est.).

**Verify.** `--attrib` in perfbench with bots placed in view.

**Sources:**
- three SkinnedMesh: https://threejs.org/docs/#api/en/objects/SkinnedMesh
- one-draw crowd write-up (2025): https://discourse.threejs.org/t/one-draw-call-massive-crowd-performance-engineering-in-three-js/89928

#### 15. Allocation fixes

- `fxDoorRect`: `for…of [-1, 1]` arrays and a returned array.
- `fxInPortal`: a `[x0, y0, x1, y1]` array per test.
- `fxCullBegin`: `next` and `front` arrays.
- `p4bFind`: the `st` stack.
- `A.anim` and the interiors' `animate`.

Reuse module-level scratch arrays. V8's scavenger is cheap for short-lived garbage, but about 130 KB per frame still produces the 50-350 ms spikes seen in the soak.

**Source.** V8 Orinoco (young-generation cost scales with survivors): https://v8.dev/blog/orinoco-parallel-scavenger

#### 16. Heap diet

The heap went from 329 to 640-720 MB.
- Take 3 heap snapshots first (DevTools Memory, menu → play → after 2 min) to find the holders.
- Likely candidates:
  - CPU-side `geometry.attributes.*.array` of batched originals (duplicated into the batches)
  - canvas texture sources
  - perf2 LOD copies

Release what is never raycast or rebuilt.

**Source.** `performance.measureUserAgentSpecificMemory` (needs cross-origin isolation): https://web.dev/articles/monitor-total-page-memory-usage

#### 17-19. Server CPU, scaling, load test

**Per-tick fixes (17):**
- `vb5.wrap` allocates an object per cell per tick. Keep one context per `(H, cell)` and refresh its fields.
- `station5` is 22 % of the tick. Re-plan home bots at 2-5 Hz, not 10 Hz.
- Bots go through `applyMove` / `pathOk` with 0.2 m steps. They already follow a nav graph, so a cheaper check of door crossings only is enough.

**Scaling (18):**
- Run N match groups per process, one process or worker per core.
- Route by match id; the queue lives in the parent.
- Watch `perf_hooks.monitorEventLoopDelay` (p99 above 10 ms = overloaded).

**Load test (19).** `tests/tickbench.js` already joins N matches. Run the generator in a separate process and machine, ramp 10 → 200 matches, and record:
- Hz
- p99 loop delay
- kicks
- RSS

**Sources:**
- Node `perf_hooks.monitorEventLoopDelay`: https://nodejs.org/api/perf_hooks.html
- Node `worker_threads`: https://nodejs.org/api/worker_threads.html
- uWebSockets.js (only if sends dominate; native dependency): https://github.com/uNetworking/uWebSockets.js

#### 20. MSAA on High

The composer renders a HalfFloat 4x MSAA target with depth. On an iGPU, multisample resolve and bandwidth are costly. Try samples 0 plus SMAA (or FXAA) folded into the final pass.

**Verify.** UNCAPPED perfbench High, and `--shots --diff` for the look.

**Source.** three SMAAPass: https://threejs.org/docs/#examples/en/postprocessing/SMAAPass

#### 21. Binary snapshots

`node tools/research/snapcodec.js`, 8 movers and 8 receivers at 20 Hz:

| Format | Payload KB/s per client | On the wire (with ws + TCP headers) | Encode per tick |
|---|---|---|---|
| JSON | 4.6 | 5.66 | 15.7 µs |
| Binary | 1.33 | 2.38 | 6.0 µs |

Decode is microseconds either way. The JSON numbers match netsim's measured 3.8-4.8 KB/s.

Worth doing only after #6: the roster is the bigger message. Over TCP the previous message is always the baseline, so delta encoding against the last snapshot needs no acks.

**Sources:**
- Fiedler, Snapshot Compression (2015-01-04; 901 cubes at 60 Hz, 17.37 Mbit/s → about 15 kbit/s when at rest with delta): https://gafferongames.com/post/snapshot_compression/
- Quake 3 network model (Fiedler, 2015): https://gafferongames.com/post/state_synchronization/

#### 22-28. Briefly

- **22. LoAF.** Watch `PerformanceObserver({type: 'long-animation-frame'})` under `?debug=1`. It names the script and shows `forcedStyleAndLayoutDuration`. The minimap's 10 Hz `offsetTop` read after drawing (game.js 4707) is the only per-tick forced layout found, and it is small. Chrome/Edge 123+. Source: https://developer.chrome.com/docs/web-platform/long-animation-frames
- **23. Battery / thermal.** A 30 fps cap option, plus `PressureObserver` (Chromium, experimental) stepping quality down on "serious". Source: https://developer.mozilla.org/en-US/docs/Web/API/Compute_Pressure_API
- **24. Sprites.** Hiding all 918 sprites cut 33 calls, but CPU did not move measurably. Low priority.
- **25. Serialise once per room tier.** `snapshots()` already formats each mover once. The remaining cost is per-receiver string joins and `ws.send`. Build one Buffer per near-set and reuse it.
- **26. Regions.**
  - Render has 5 regions; a service cannot move between them, and cross-region traffic uses the public internet.
  - Deploy one service per region, ping each from the client, and queue within the region.
  - Source: https://render.com/docs/regions
- **27-28. Workers for 2D maps and for the renderer.** The minimap is already 10 Hz and signature-gated. Moving three into a worker only isolates jank, because the cost is three's own walk, which would move with it. Source: https://web.dev/articles/offscreen-canvas

### 2.3 Checked and already fine (no action)

- **Nagle.** `ws` calls `socket.setNoDelay()` on every socket (verified in ws `lib/websocket.js`, master, Oct 2026).
- **permessage-deflate.** Off (perf-4). The ws README warns about its CPU and memory cost.
- **Clock sync.** It is Cristian-style with a min-RTT filter (game.js `netPong`), the standard method.
- **Lag compensation.** The 200 ms rewind cap is consistent with practice. Valve allows up to 1 s with `sv_maxunlag`, but most games cap far lower.
- **Audio.** Voices are already capped at 60 (28 for low-priority sounds) in `audio.js` 493. Panning is not HRTF. Sound is synthesised from oscillators and noise, so there is nothing for an AudioWorklet to do here (AudioWorklet: https://developer.chrome.com/blog/audio-worklet).
- **Shadows.** None, and none planned. Shadows would be the most expensive thing one could add.
- **HUD DOM.** Writes are gated on change (perf-2/3); no per-frame layout thrash was found.

---

## 3. Experiment plan and roadmap

### 3.1 Experiments (all standalone; none edits a game file)

| ID | Command | Decides |
|---|---|---|
| E1 | `node tools/research/perf-ab.js --preset low --exp micro --reps 4` | Walk vs submit vs GPU split; the gain of detaching layer-30 originals (#1) |
| E2 | `UNCAPPED=1 node tools/research/perf-ab.js --preset high --exp noAO,noBloom,noPost,half` | Post budget per pass (#3, #4, #20) |
| E3 | `node tools/research/perf-ab.js --preset low --exp skipStatic,noBatchCull,noSort,noSprites,half` | Small CPU levers (#11, #12, #24) |
| E4 | `node tools/research/load-profile.js --preset low` | Shader stalls, `getDataURL`, transferred bytes, long tasks (#2, #7, #8, #9) |
| E5 | `node tools/research/snapcodec.js --movers 8` | Binary snapshot savings (#21) |
| E6 | `node tools/netsim.js --scen lan,100j30,100j30l2,200j60` | Interpolation buffer (#5) |
| E7 | `node tests/tickbench.js 1 15 {10,25,50}` (+ `PROF=<dir>`) | Server capacity and hot functions (#6, #17, #18) |
| E8 | DevTools heap snapshots: menu, play, +2 min | What holds 650 MB (#16) |
| E9 | `curl -sI -H 'accept-encoding: br' https://<render host>/game.js` | Whether Render already compresses (#7) |

Run every A/B on a quiet machine if possible. The numbers above are ±20-50 % because of other agents' load. Keep the pairing (base right before variant).

### 3.2 Roadmap

The perf-5 agent owns the client render path (FX, PERF2, PERF4 blocks, `renderWorld`). The combat and climb agents are changing server and client movement: server.js `applyMove`, NET, combat, and the client NET / JUMP blocks. Nothing below touches their code until they have merged.

| Wave | Task | Files / blocks | Owner | Conflicts |
|---|---|---|---|---|
| A (now) | #2 precompile before GO plus `checkShaderErrors` off in production | game.js MATCH-BEGIN (wheel), PERF4 block, renderer setup line ~45 | perf-5 | none outside the render path |
| A | #1 originals out of the walk; then #11, #12, #15 | game.js PERF4-BEGIN, FX culler (6195-6280) | perf-5 | the hover raycast (#10) must use the new holder; coordinate with task #10 |
| A | #3 bloom, #4 dynamic resolution, #20 MSAA | game.js FX-BEGIN | perf-5 | none |
| A (parallel) | #7 compression, ETag, parallel imports; #8 material key | server.js `staticFor` / `srv` (SECURITY block); index.html module script; game.js 1699; itemart.js 130 | new "load" agent | server.js static block only, not NET; touch `buildCsp` hashes if the inline script changes |
| A (parallel) | #10 station hover proxies | game.js `merchantHoverTick` (5246) and STATIONS-UI | UI agent | none |
| B | #9 sliced room-art builds | game.js ROOMS5ART (7379+), ROOMART | room-art owner or perf-5 | none |
| B | #6 delta roster | server.js `tickAll` line 221 + `pub`; client `players` handler | server agent | waits for combat (it changes `pub` fields) |
| B | #17 server per-tick fixes, #19 load test | vb5.js, server.js BOTS5 (`station5`, `b5Think`), new `tools/research/loadtest.js` | server agent | bots' `mv`/`applyMove` path waits for climb (movement rules) |
| C | #5 delay floor and time-stretch | game.js NET-BEGIN (`netRenderT`) | net agent | after combat and climb merge (both touch client movement / NET) |
| C | #13 program reduction, #16 heap diet | material builders (many blocks), PERF4 | perf-5 plus art owners | wide: do after A/B land |
| C | #14 goblin rigid skinning | GOBLINART block | goblin-art owner | goblin art in progress; schedule after it lands |
| D | #18 worker or cluster per core, #26 regions, #21 binary snapshots | server.js entry and matchmaking, `render.yaml`, NET on both sides | server, ops | protocol change: last, behind a version flag |

**Budgets to hold** (from QUALITY-PLAN 1.2, still valid):
- Low vault: ≤ 8 ms frame CPU
- High: 60 fps with post on an iGPU at 900p
- No long task over 100 ms after GO
- Server tick p99 ≤ 8 ms per match with 8 matches per process

Add a starvation budget: under 10 % starved frames at 100 ±30 ms in netsim.

---

## 4. What not to do (myths and premature work)

| Idea | Why not (here, now) |
|---|---|
| **Migrate to WebGPURenderer for speed** | A many-mesh benchmark on r183 measured WebGPURenderer at about 2x the CPU per frame of WebGLRenderer, and 5-10x slower on the first frame (both backends). Our EffectComposer passes, `onBeforeCompile` and ShaderMaterials would all need rewriting in TSL. Maintainers advise staying on WebGL without a WebGPU-only need. Sources: https://discourse.threejs.org/t/webgpurenderer-2x-slower-cpu-and-5-10x-slower-first-frame-than-webglrenderer-on-many-mesh-scenes-r183-same-on-both-backends/91904 and https://github.com/mrdoob/three.js/wiki/Migration-Guide |
| **WebTransport / WebRTC datagrams now** | Browser support is complete: Chrome 97, Firefox 114, Safari 26.4 (March 2026), about 92 % global (https://caniuse.com/webtransport). But Render documents only HTTP/WebSocket and no public UDP (https://render.com/docs/web-services), and Node's QUIC is still experimental behind `--experimental-quic` (https://nodejs.org/api/quic.html). The gain is only under packet loss; fix the buffer (#5) and the bytes (#6) first. |
| **Input redundancy over TCP** | TCP already retransmits; extra copies only add bytes. Perf-4 skipped it correctly. |
| **Raising the tick to 30-60 Hz** | It doubles or triples server CPU and bandwidth while the client starves at 20 Hz anyway. Lower the visible lag with #5. Melee wind-ups of 200 ms or more hide 50 ms ticks. |
| **More draw-call merging on Low** | Low is at 125-234 calls. CPU goes to the scene walk and per-call uniforms, not the call count, and halving resolution changes nothing. Merge only where it also removes nodes. |
| **KTX2 / Basis for textures** | The textures are procedural canvases made at runtime. Basis encoding is an offline tool, and runtime encoding would cost more than it saves. Shrink, atlas or cap sizes instead (QUALITY-PLAN 1.3 #9). |
| **Hardware occlusion queries** | Results arrive frames late (popping), and the portal culler already reduces the view to the rooms in line of sight. MDN `beginQuery`: https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/beginQuery |
| **WASM for hot loops** | No numeric hot loop exists on the client. The hot code is three's scene walk and WebGL calls, and crossing the boundary would erase the gain. |
| **Object pooling everywhere** | V8's scavenger is cheap for short-lived garbage. Pool only the measured per-frame allocators (#15); pooling long-lived objects promotes them and makes old-generation GC worse. |
| **Moving the renderer into a worker** | Large refactor (input, DOM textures, resize). It gives jank isolation, not more fps, because the expensive part moves with it. |
| **Adding lights or shadows to "fix" the look** | Owner rule (9 PointLight + 1 Hemi), and every lit program would get more expensive per fragment and per uniform refresh (hotspot 4). |
| **Trusting fps from this shared machine or the browser pane** | Use draw calls, the paired A/B deltas and profiles. Absolute ms here are ±20-50 %. |

---

## Appendix: raw numbers

**`perf-ab` low vault, uncapped, base → variant** (ms):

| Variant | Frame CPU | Frame interval |
|---|---|---|
| skipStatic (702 roots) | 22.8 → 19.7 | 30.0 → 21.3 |
| noBatchCull | 16.8 → 15.4 | 17.7 → 17.9 |
| noSort | 17.0 → 18.5 | 18.5 → 19.5 |
| noSprites (calls 226 → 193) | 15.6 → 16.5 | 24.2 → 17.5 |
| half resolution | 20.4 → 25.0 | 22.1 → 23.0 |

**`perf-ab` low vault, micro** (4 reps, ms per render):

| Measure | ms |
|---|---|
| Full render | 19-28 |
| Game walk (perf4Tick + walk + p4bSync) | 3.7-10.3 |
| three walk alone | 4.0-8.4 |
| three walk without layer-30 leaves | 1.7-2.1 |
| Render without the walk | 11.5-20.1 |

The same micro on High vault: full render 15.8-19.8, three walk 3.8-4.0 → 1.6-2.0 without the leaves.

**`perf-ab` high vault, uncapped, frame interval** (ms):

| Variant | ms |
|---|---|
| noAO | 32.5 → 32.5 |
| noBloom | 36.8 → 28.0 |
| noPost | 31.4 → 21.1 |
| half resolution | 32.5 → 22.4 |

**`tickbench` 1 human per match** (avg tick ms / Hz / bot ms / KB/s per client):

| Matches | Avg tick ms | Hz | Bot ms | KB/s per client |
|---|---|---|---|---|
| 10 | 4.4-27.0 | 14.3-19.1 | 1.5-8.9 | 3.4-4.3 |
| 25 | 13.2 | 18.9 | 4.5 | 3.8 |
| 50 | 170.9 | 4.5 | 77.6 | 2.8 |

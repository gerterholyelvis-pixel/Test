# Client performance pass 5 (PERF5)

Code: `game.js` `PERF5-BEGIN/END` block (end of the FX section) plus one-line hooks tagged PERF5. `?perf5=0` turns the pass off for A/B runs. No lights added, no server changes.

## What was wrong (measured, headless Edge, ANGLE D3D11 iGPU, 1600x900)
- **Shader linking at first draw was the biggest stutter.** On this GPU one program link blocks for 50 to 200 ms.
  - The first world frame after the match started froze for **8.8 to 9.8 s**.
  - Every lazily built room froze again for 0.5 to 2.9 s.
  - PERF4's batches were compiled in the menu's ACES tone-mapping state, so each one compiled a second time, synchronously, when first drawn.
- **Lazy room builds happened during play.** The ROOMS5ART rooms (17 of them) cost about 140 ms each, roughly 2.4 s in total, and ROOMART added its own.
- **The icon bake stepped during play** (first run only), at 50 to 300 ms per step.
- **Batch growth by doubling** copied and re-uploaded whole vertex buffers, at up to 400 ms per frame.
- **Mystery plushie bug:** `MY.MM` called `JSON.stringify` on a texture to build a cache key. That serialised the canvas to a data URL, about 170 ms per call.
- **Steady CPU:** three walked all ~9000 scene nodes every frame (about 2.5 ms on Low). The hover raycast cost 2 to 4 ms per frame next to the home stations.
- **Console spam:** D3D X4122 "Program Info Log" warnings.

## Fixes
1. **Matrix walk.** A frozen top-level object is walked only when something inside it changed. `Object3D.updateMatrix` and `add` mark the object dirty, and a rolling safety walk covers anything that bypasses both. Culled rooms catch up every 4th frame and on the frame they become visible again. The PERF4 watcher skips culled rooms.
2. **Loading step between match start and the 3-2-1 countdown** (`PERF5.prep`). The ready signal waits for it, capped at 6.5 s, so it stays within the server's 8 s.
   - Every program in the scene is compiled async (`compileAsync` with `KHR_parallel_shader_compile`) through one stand-in object per material and layout, in the game view's state (Neutral tone mapping; on Medium and above, the composer's HDR target). The post-pass materials are compiled the same way.
   - All rooms are then built, nearest to the player's home first, one per slice, and each one's programs are compiled.
   - Then: room classification, PERF4 batching with batches presized from a count of everything they will hold, and texture uploads in slices.
   - A room rebuilt during play stays hidden until its programs are ready (at most 2.5 s).
3. **Other fixes:**
   - New batches compile together in the correct state.
   - Non-priority icons are held while playing.
   - The hover ray runs every 3rd frame, and only every 20th frame while the view is still.
   - Fixed the `MM` cache key.
   - Rounded boxes in the home art are cached.
   - `checkShaderErrors` is off; `?shadercheck=1` turns it back on.
4. **Dynamic resolution** (Settings > Graphics, on by default).
   - When the frame time stays above 19 ms for 1.5 s, the render scale drops one 10 % step, down to a minimum of 60 % of the Resolution slider.
   - After 5 s of smooth frames it climbs back one step.
   - A climb followed by a drop within 4 s blocks climbing for 30 s.
   - Verified on Ultra: the scale went 1.0 → 0.6 with one bounce.
5. **Goblin LOD and outlines needed no change.** All 12 types have 3 LOD levels, and the hull outline is already limited: off on Low, within 6.5 m only, and only at LOD 0. Every goblin in the vault view was at LOD 2.

## Results (the machine was shared at 25 to 100 % CPU, so treat CPU ms as ±20 %; draw calls are exact)
**Start of a match (Low).** These are the longest frames from the Start click to GO+12 s.

| | before | after |
|---|---|---|
| first world frame | 8 790 ms | 340 to 850 ms, during the locked countdown |
| frames over 25 ms after GO | room-build and compile stalls of 0.5 to 2.9 s | at most one frame of 1 to 1.3 s just after GO in 2 of 4 runs; otherwise only 33 to 83 ms frames (cause not identified) |
| load long-task max | 4.8 to 10.7 s | 1.9 to 2.4 s (now during the wheel) |

**Same-session A/B (`--q &perf5=0` vs on), Low, frame CPU in ms:**

| view | before | after |
|---|---|---|
| vault | 13.9 | 11.7 |
| corridor | 13.9 | 10.8 |

Quiet machine, after: vault 8.8 ms, home 5.0 ms.

**Full run, every door open, before → after:**

| Preset | Metric | vault | tree | corridor | closed |
|---|---|---|---|---|---|
| Low | calls | 226 → 226 | 181 → 173 | 180 → 180 | 125 → 125 |
| Low | CPU ms | 17.2 → 12.9 | 15.4 → 11.4 | 12.5 → 14.2 (noise) | 11.6 → 11.2 |
| Low | frames > 25 ms | 14 → 1 | 3 → 1 | 0 → 2 | 0 → 2 |
| Medium | CPU ms | 17.4 → 12.5 | 16.2 → 16.8 | 15.4 → 9.9 | 19.2 → 11.6 |
| Medium | frames > 25 ms | 25 → 0 (quiet rerun) | 9 → 48 (GPU, noisy run) | 9 → 0 | 35 → 6 |
| High | CPU ms | 26.7 → 18.6 | 17.0 → 17.9 | 26.4 → 16.4 | 16.5 → 11.3 |
| High | mean frame ms | 28.5 → 23.8 | — | 28.0 → 19.7 | — |
| Ultra | CPU ms | 20.7 → 17.2 | — | — | — |

- **Ultra:** the frame is GPU bound (full-resolution AO) at 27 to 34 ms before and after. Dynamic resolution handles it in play.
- **Draw calls** are unchanged everywhere. The home view's room content is random per run, so it is not comparable.

**5-minute soak** (Low, 8-goblin offline match, camera looping the vault):
- 17 982 frames, mean 16.68 ms, frame CPU 8.3 ms.
- 7 frames over 25 ms, the longest 200 ms.
- Heap went 644 → 604 MB (maximum 667) across 106 GC drops: **no growth**.
- Medium, 60 s soak: 0 long frames.

**Visuals:** `docs/screens/perf5-ab-*.jpg` (before | after | difference x8).
- Mean difference is 0.02 to 2.4 out of 255, from animated parts only.
- The `*-home` pairs differ because the room's content is randomised per run, not because of this change.

## Guard
`npm run test:browser` (opt-in) checks the vault view against these budgets:
- **Low:** at most 300 calls, frame CPU at most 9.5 ms (the target is 8), longest frame at most 150 ms, at most 6 frames over 25 ms.
- **High:** at most 600 calls, longest frame at most 250 ms.
- No console errors.

It passed calls and frame times; on a shared machine Low CPU measured 8.8 ms.

`tools/perfbench.js` now also lists long frames with their causes: new programs, texture or geometry uploads, GC drops, and game marks (`roomart`, `r5room`, `goblin`, `icon`, `batch`).

## Notes for the merger
- `npm test` (GK_TEST_JOBS=3) shows `act5-crown` and `bots` failing under load; both pass alone. `tests/iconbake.test.js` was adjusted because the bake options now include `hold`.
- **Edits outside game.js:**
  - `itemart.js`: the `hold` option and the step mark
  - `rooms5art-home.js`: the rounded-box cache
  - `index.html` and `menu.js`: the Dynamic resolution checkbox and its default
- **Not done:**
  - culler allocation fixes
  - the menu podium LOD
  - a text-sprite atlas
  - texture compression
  - The JS heap is still about 620 MB, but stable. Prep uploads every texture, so roughly 480 to 550 textures are resident against 280 to 380 before.

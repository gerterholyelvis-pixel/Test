# Performance pass (phase 2) and fun fixes

## Measured setup
Headless Chrome 1264x625, pixel ratio 1, `?offline=1` (7 simulated bots), High preset, Math.random seeded so layouts match between runs, 14 s warm-up, then 6 s per view. The same two camera views before and after: **spawn** = room 0 at (-15, -9) looking north, **vault** = (0, 8) looking north. Before = commit 3fc2049 served on another port, after = this branch; runs alternated. JS ms = time spent inside `frame()` (includes three's CPU render work); draw calls = `renderer.info.render.calls` summed over all composer passes; alloc = JS heap growth per frame (a lower bound, GC hides part of it). Probe code: a `requestAnimationFrame` wrapper plus `performance.memory`.

| View | | FPS / ms per frame | JS ms / frame | draw calls | heap alloc / frame |
|---|---|---|---|---|
| GPU (AMD Radeon, ANGLE D3D11, uncapped vsync) spawn | before | 180 to 300 fps / 3.3 to 5.5 ms | 3.2 to 4.7 | 37 to 39 | 26 to 31 KB |
| | after | 168 to 293 fps / 3.4 to 5.9 ms | 3.3 to 5.4 | 36 to 38 | 15 to 17 KB |
| GPU vault | before | 126 to 170 fps / 5.9 to 7.9 ms | 5.7 to 7.5 | 266 to 281 | 112 to 122 KB |
| | after | 114 to 190 fps / 5.3 to 8.7 ms | 5.2 to 8.4 | 256 to 267 | 50 to 54 KB |
| SwiftShader (software GL) spawn | before | 5.8 to 7.2 fps / 140 to 172 ms | 4.4 to 5.9 | 37 to 49 | 279 to 465 KB |
| | after | 5.2 to 7.0 fps / 143 to 194 ms | 3.8 to 13 | 36 to 51 | 124 to 166 KB |
| SwiftShader vault | before | 2.5 to 2.6 fps / 389 to 405 ms | 11.7 to 31 | 261 to 319 | 208 to 456 KB |
| | after | 2.2 to 2.6 fps / 382 to 465 ms | 10 to 19 | 256 to 352 | 179 to 661 KB |

Machine load moved the absolute GPU numbers by about 40 % between runs (3.3 vs 4.5 ms for the same code), so compare only within an alternated before/after pair. Honest summary: **frame time, JS ms and draw calls did not change measurably** (inside the noise); **heap allocation per frame in the vault halved** (about 115 to 52 KB), and the shader-program churn below is gone. A bot in view adds about 100 draw calls (runs where one wandered in show 99 to 136 calls). On software GL the frame is GPU-bound (GTAO alone is about half of High's time), which is what the new automatic preset is for.

## What changed
- **Two-pass transparent materials (the main finding).** An allocation sampling profile showed `getParameters` / `getProgramCacheKey` building about 30 MB of strings in 6 s. Cause: three renders a transparent double-sided material in two passes and sets `needsUpdate` before each, so every door beam, halo and similar object re-hashed its shader program key twice per frame (material `version` climbed by about 500 per second). `Material.prototype.forceSinglePass` now returns `depthWrite === false`, which keeps three's two-pass sorting only for materials that write depth. Material version churn: 8 materials bumped every frame, now 0. Visual difference: none visible (glow, beam and shaft materials do not write depth).
- **Stats card** (`showStats`): built once; each refresh sets `textContent` only on fields whose string changed (cached per element). Scoreboard and spectator "who" line repaint only when their HTML changed. The combat card, round HUD and feel prompt already compared their values before touching the DOM.
- **Per-frame allocations** removed from `frame()` (door loops, ceilings) and from the room-culling code (`some(closure)` per scene object, array destructuring per door). Left alone: the room-art tick closures (other agent's block).
- **Automatic quality preset** (PERF block in game.js, `gfxAutoProbe`): on the first match only, 0.6 s after GO it counts frames for 2 s. Under 40 fps it drops one preset and shows a toast; over 100 fps on High it shows a toast pointing at Ultra. The verdict is stored in `localStorage` `gk.gfxAuto` (`auto` or `user`); changing the preset in Settings writes `user`, and an already saved non-High preset counts as chosen, so the player's choice is never overridden. A hidden tab (throttled rAF) gives no verdict. Verified on SwiftShader: 0.65 fps -> High dropped to Medium, setting saved.
- Other costs looked at: textures are 64 to 1024 px canvases (fine); GTAO already runs at half resolution on High; the biggest remaining GPU costs are GTAO and the 4x MSAA HDR target (software GL only). Not changed. Possible later lever: cap the High pixel ratio at 1.5 on high-DPI screens.

## Fun fixes (docs/reports/fun.md)
- **Spectator camera** stays inside the walls of the followed goblin's room (`roomClamp` in the FUN block, 0.7 m margin, grid rooms and chest rooms). Checked in a browser match: camera at (14.0, 8.3) for a target in the east room, inside the 0.7 m margin.
- **Match time limit** (server.js SUDDEN block, default awaiting the owner's decision, noted in FEATURES.md): after round 8 `sudden:1` is sent with every round update, all doors open and stay open, regeneration stops, and the client shows a "SUDDEN DEATH" banner and a small tag. When round 10 runs out, the living goblin with the most kills wins, then the most HP (then lowest id); beaten humans become spectators; `matchEnd.timeLimit` is set and the summary card says so. A bot can win. Debug overrides (GK_DEBUG only): `GK_SUDDEN_ROUND`, `GK_MAX_ROUND`, `GK_NEXT_ROUND_MS` (length of rounds 2+; `GK_ROUND_MS` is round 1).
- Test: `tests/sudden.test.js` (sudden flag and all doors open after round 2; nothing before; decision after round 4 by HP with kills tied, loser gets `died`, `matchEnd.timeLimit`). `npm test`: 12 files green.
- Browser solo match with bots (PORT=3150, GK_DEBUG=1, GK_QUEUE_MS=2000): no console errors; stats card, auto-preset probe, sudden banner (injected message) and spectate verified.

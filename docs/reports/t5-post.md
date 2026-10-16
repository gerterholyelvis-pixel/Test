# T5: post-processing performance and look

Scope: the FX post section of `game.js` (`FX-BEGIN` block: composer set-up, `fxApplyQuality`, `renderWorld`) and one material in `menu.js`. No light added, Low preset untouched (it has no composer).

## Changes
1. **GTAO without a second scene pass.** The composer's MSAA HDR target now carries a `DepthTexture`. The GTAO pass reads the scene pass's own depth (`NORMAL_VECTOR_TYPE 0`, normals rebuilt from depth) instead of re-rendering the whole scene with `MeshNormalMaterial`. The old `_overrideVisibility` hack is gone. The AO term is multiplied into the scene buffer in place (no copy pass, `needsSwap = false`).
2. **Bloom mips per preset:** Medium 3, High 4, Ultra 5 (was 5 everywhere). `UnrealBloomPass` hard-codes 5 mips, so `makeBloom(n)` trims it and swaps in an n-mip composite shader; one pass per mip count is built on demand and swapped on preset change. Strength 0.27 / 0.24 / 0.22 compensates for the lost wide halo.
3. **One final pass** replaces `OutputPass` + the grain pass: Neutral tone mapping, sRGB, edge chromatic aberration (High and Ultra only, off on Medium), a very light grade (+5 % colour, warm highlights, cool shadows, about 1 %), vignette and film grain. Same vignette and grain constants as before.
4. **Title flare:** the magenta/teal streak across the bottom of the title screen was the specular lobe of the red and violet rim lights on the glossy menu floor (`metalness 0.65 / roughness 0.28`). The mirror reflection of the goblins is a mirrored mesh copy, so it does not depend on the floor gloss. Floor is now `metalness 0.2 / roughness 0.7`: the streak is gone, soft coloured pools remain.

## Method
Headless Edge over CDP, random ports, real GPU (`AMD Radeon(TM) Graphics`, D3D11), 1600x900 at DPR 1, offline match with `GK_BOTS_PASSIVE`, views spawn / vault / corner, 150 frames each, two reps per cell (best kept). Draw calls and triangles are summed over every `renderer.render` call (composer passes included); CPU is the time spent inside those calls. Before = `HEAD` (f0e6e1b) unpacked in a separate tree. Frame time is vsync-capped at 16.7 ms, so a frame-time gain only shows where the before build was over budget. Bots wander and rounds progress, so absolute counts move +-10 %; the clean signal is the **calls above Low in the same run**. Two full run pairs were taken; the pair below was the quiet one (the first pair had other agents loading the GPU and is not used).

### Render passes per frame
| Preset | before | after |
|---|---|---|
| Medium | 16 | 11 |
| High | 21 | 16 |
| Ultra | 21 | 18 |

### Draw calls (calls above Low in the same run in brackets), rep 0 / rep 1
| Preset | spawn before | spawn after | vault before | vault after | corner before | corner after |
|---|---|---|---|---|---|---|
| Low | 128 / 129 | 101 / 94 | 279 / 294 | 357 / 309 | 75 / 82 | 74 / 80 |
| Medium | 154 / 156 (+26) | 116 / 116 (+15) | 301 / 322 (+22) | 382 / 343 (+25) | 97 / 106 (+22) | 92 / 97 (+18) |
| High | 263 / 263 (+135) | 121 / 121 (+20) | 501 / 534 (+222) | 388 / 348 (+31) | 160 / 166 (+85) | 101 / 101 (+27) |
| Ultra | 262 / 261 | 123 / 124 | 565 / 529 | 390 / 367 | 163 / 165 | 103 / 103 |

High's post cost above Low drops from about 85-220 calls to 20-35: the 429-call normal pass is gone.

### CPU ms inside `renderer.render` (best of two reps)
| Preset | spawn before / after | vault before / after | corner before / after |
|---|---|---|---|
| Low | 4.7 / 4.7 | 6.3 / 7.6 | 4.0 / 4.2 |
| Medium | 9.7 / 7.1 | 10.6 / 11.3 | 7.5 / 5.5 |
| High | 16.1 / 6.8 | 19.0 / 13.7 | 13.7 / 7.1 |
| Ultra | 11.7-17.9 / 7.1 | 21.5 / 13.0 | 14.7 / 7.3 |

(The vault "after" runs had more doors open than "before", so the scene itself was heavier: Low went 279 to 309-357 calls.)

### Frame time (median / mean ms, vsync 16.7)
Before: High mean 19.5-23.4 ms (spawn, vault, corner), Ultra 17.5-27 ms. After: High 16.6-18.0 ms, Ultra 17-29 ms (vault; the vault GPU cost on Ultra is full-res AO). Medium and Low sit at 16.7 in both.

## Visuals
Screenshots in `docs/screens/`: `t5-{before,after}-title.jpg`, `t5-{before,after}-{medium,high}-{spawn,vault}.jpg`. Bots and rounds differ between the two runs, so the scenes are not pixel-identical. The harness leaves the menu overlay on top of the game view (it skips the menu click); that is not a game bug. AO is visibly present on High; the grade is subtle; goblin silhouettes show a slight AO halo where depth jumps (inherent to depth-reconstructed normals; `thickness` could be tuned later).

## Not done / notes for the merger
- Plan item "bloom threshold 2.8 to 1.6" left alone: it needs a look pass with the bigger grade work (T12).
- Ultra still pays the full-resolution AO and 5 bloom mips on purpose.
- `fx.grain` still exists as an alias of `fx.final` (the single final pass); `fx.bloom` points at the active bloom pass.
- `tests/bots.test.js` failed once in a full run and passed on rerun (server only, not related to this change).
- The 5x5 agent edits other regions of `game.js`; this diff is confined to the FX block (`fxApplyQuality`, the composer `async` block, one line of `renderWorld`) and `menu.js` line 249.

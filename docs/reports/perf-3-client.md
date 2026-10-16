# Client runtime performance (perf 3)

Scope: profile the game.js client for hot spots after perf 2. Only one change was justified by measurement.

## Findings
- frame() path (doors, goblin loop, combatTick, vmUpdate, SOC, UNIQUE, culling, merchantHoverTick, panelTick): grepped for per-frame closures, spreads, filter/map, `new THREE.Vector3/Color/Euler/Quaternion`, innerHTML and style writes. Nothing per-frame is left; perf 2 already removed them. No change made.
- Scene: about 4800 objects, 824 materials, 4 shader programs at the menu. Texture memory estimate 153 MB (mipmapped): 8 wall maps 1024x740 (31 MB), 5 x 1024x1024 (27 MB), 12 x 608x576 and 9 x 800x576 (about 42 MB, room art), 52 x 512x96 text sprites (13 MB). GPU upload only happens when drawn (room culling), so I left them; shrinking them would change visuals.
- Icon bake (itemart.js): 61 icons, 10 ms budget per step with 40 ms gaps. The pixel loop (3 Math.pow tone/sRGB encodes per pixel, 320x320) cost about 10 ms of main thread per icon, so every bake step was a 10+ ms hitch after the first frame.

## Change
`itemart.js`: tone-map + sRGB encode replaced by a 6144-entry lookup table with linear interpolation (`PERF3` tags). Max difference to the exact curve is 0.05 of one 8-bit level, so icons are identical. Loop time for 3 channels x 102k pixels: 20.0 ms to 3.2 ms (micro-benchmark, contended machine). Full bake in the pane: 21.8 s wall (unfronted, throttled) to 7.2 s wall (fronted), 60 icons both times; not a clean comparison, trust the micro-benchmark.

## Not measured
The browser pane is software GL and shared by many agents (0.5 fps), so fps, frame time and per-frame heap churn could not be measured. `npm test`: balance, bots*, combat, fun, loot, matchmaking and netcode timing tests failed under machine load (bot sweep 15 ms vs a 2 ms limit); they are server-only and untouched by this change. Rerun on a quiet machine.

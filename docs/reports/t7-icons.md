# T7: icon bake worker + IndexedDB cache

## What changed
- `iconworker.js` (new, served via `CLIENT_JS`): classic worker. Takes the two raw render-target read-backs (float colour, 8-bit mask), does the tone map / sRGB encode, tier glow and downscale on an OffscreenCanvas, returns an ImageBitmap plus a PNG blob. The 2 MB pixel buffers are handed back and reused (at most 3 pairs ever alive, none per icon).
- `itemart.js` `bake()`:
  - IndexedDB cache `gk-icons` (key = item key, value = `{ver, blob}`). `ver` = SHA-1 of itemart.js + items.js + iconworker.js, plus three revision, icon px and `tune`. Rows from other versions are deleted on load. When every icon is cached, no scene, render target or PMREM is created.
  - Priority: `opts.priority()` (game.js passes equipped, hotbar, backpack, then all starting gear) bakes first on short timers; the rest uses `requestIdleCallback` (1.5 s timeout) with a 4 to 10 ms budget.
  - Fallbacks: no Worker/OffscreenCanvas/createImageBitmap, worker error, blocked IndexedDB or failed fetch all fall through to the previous main-thread path (`opts.noWorker`, `opts.noCache` force them). Cleanup releases render targets, env map, worker, pools.
  - `GKART.stats()` reports cached/baked/viaWorker/step time of the last bake.
- `server.js`: `'iconworker'` added to `CLIENT_JS`. CSP unchanged (worker falls under `script-src 'self'`, blobs are not used for scripts). `game.js`: one-line priority hook. Tests: `tests/iconbake.test.js`, `/itemart.js` and `/iconworker.js` added to the security static list.

## Measurements
Headless Chrome with the real GPU (D3D11), `?offline=1`, 87 keys (78 baked, `x:` keys are drawn by icons.js), on a heavily shared machine, so treat as indicative. "Step ms" = main-thread time inside bake steps.

| run | wall bake | step ms (max step) | icons baked |
|---|---|---|---|
| before | 8.0 s / 7.2 s | 4095 (470) / 3528 (111) | 78 |
| after, first run, worker | 6.9 s | 4840 (722) | 78 via worker |
| after, first run, no worker (fallback) | 8.5 s | 5878 (815) | 78 on main |
| after, second run (cache) | 0.59 s | 52 (52) | 0 |

- Second run: bake goes from about 7 to 8 s wall and about 3.5 to 4 s of main-thread work to 0.6 s wall (almost all of it async blob decode) and 52 ms main thread, nothing rendered.
- First run: the worker moves the per-pixel loop, putImageData, glow, downscale and PNG encode off-thread, but that was already only about 3 ms of about 50 ms per icon after PERF3. The remaining cost is model building, the two GL renders and the synchronous float `readPixels`, which have to stay on the main thread (the WebGL context lives there; `readRenderTargetPixelsAsync` does not support float targets). So first-run blocking is about the same; the win is the cache plus priority order plus idle slicing. Do not expect more than that from the worker alone.
- Icon pixels: hashes of 8 sampled icons are identical across main path, worker path and cache path.
- Memory: 160 px icons (about 100 KB each), PNG blobs about 10 KB each in IndexedDB (about 2 MB for 210 icons). Render targets, env map and worker are disposed at the end; with a full cache they are never created.

## Not done / notes
- Next step to cut first-run blocking would be an OffscreenCanvas-hosted renderer for the whole bake (model build included), which means building item models in the worker; out of scope here.
- Cache invalidates on any edit to itemart.js or items.js (one rebake per deploy).

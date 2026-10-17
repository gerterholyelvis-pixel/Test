# Research: performance and lag (report)

I added `docs/RESEARCH-perf.md` and three standalone experiment scripts in `tools/research/`:
- `perf-ab.js`: runtime A/B patches over CDP.
- `load-profile.js`: startup and match-start profile.
- `snapcodec.js`: JSON vs binary snapshot sizes.

No game file changed.

I profiled the game with headless Edge on the real iGPU. Other agents kept the machine at about 90 % CPU, so I read the paired deltas, not the absolute numbers. I also ran tickbench at 10, 25 and 50 matches, and netsim.

## Main findings
- **Low is CPU-bound, and draw calls are not the cause.** Half resolution changes nothing.
  - three's scene walk costs 4-8 ms per frame.
  - Most of that walk is about 6 000 batched originals that are never drawn. Without them it is 1.7-2.1 ms.
- **High is bound by post-processing.**
  - Bloom costs 8.8 ms per frame.
  - Turning all post off saves 10 ms.
  - AO costs about 0.
- **Shader links stall the main thread when a shader is first used:**
  - 5.1 s before the menu.
  - About 14 s over a session.
  - A 6-8 s long task at match start.
- **Station hover raycast:** about 7 % of the main thread at home.
- **Material cache key:** PNG-encoding canvases for the key costs 0.9 s at load.
- **Download:** 4.4 MB per visit, uncompressed, with no ETag. Brotli would make it 0.8 MB.
- **Interpolation buffer:**
  - The client has no newer snapshot in 69 % of frames, even on LAN.
  - The full `players` roster is about 65 % of downstream traffic.
- **Server:**
  - Bots are 32 % of each tick.
  - At 50 matches the tick drops to 4.5 Hz on this box.

The doc ranks 28 techniques with sources. It also has an experiment plan (E1-E9), a roadmap in waves that lists file owners (perf-5 owns the render path; net and server items wait for the combat and climb agents), and a list of things not to do: WebGPU, WebTransport on Render, WASM, input redundancy over TCP, KTX2, and occlusion queries.

## Not done
- No heap snapshot yet (E8).
- Render production compression not checked (E9).
- `npm test` not run, because no game or test code changed.

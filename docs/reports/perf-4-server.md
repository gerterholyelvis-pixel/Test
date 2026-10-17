# perf-4: server tick and netcode

Measured on a Windows box that stayed at 90-100 % CPU from other agents the whole time, so absolute numbers are noisy; before/after were run back to back from the same harness (before = untouched HEAD checkout, `--root`).

## Server
- **Drift-free 20 Hz** (`TICK` block in server.js): self-correcting `setTimeout` on an ideal grid; stalls over 2 ticks resync instead of bursting. 10 matches (30 humans + 50 bots), tickbench: **16.3 Hz -> 20.07 Hz**, interval sd 1-9 ms (depends on the OS timer state; the mean is exact). `botstat.tick` now has `dn/dsum/dsq/dmax/late/skip/hist` and `cpu`.
- **Bot work staggered**: bots still think at 10 Hz but odd/even ids on alternate ticks. tests/bots.test "bot sweep" mean 4.8 ms -> 1.7 ms; bots5-sim act feature 2.97 -> 0.55 ms per sweep. (Profile: bot AI was never more than ~10 % of a tick; socket writes were 40 %.)
- act5 `broadcast`: the 200 ms spacing and "anyone near?" checks run before building and stringifying the view of each of the 41 rooms.
- **Interest management**: snapshot movers in my room or a door-neighbour room go out at 20 Hz, others batched every 4th tick (5 Hz, nothing lost: `sdFar`). Same `{s:[...]}` message. Backpressure: a client with more than 32 KB queued is skipped, then gets one full snapshot.
- **Movement bank 1.0 -> 2.0 m (`BURST`) plus stall credit.** Found by the harness: a TCP retransmit (2 % loss) or event-loop stall delivers ~5 moves at once; the old 1.0 m cap refused them, the client rubber-banded, and 15 corrections in 10 s **kicked** the player (original server: 7 of 8 clients kicked at 2 % loss, 25-35 corrections/min even at 100 ms +-30). Average speed limit unchanged; walls/doors still checked per 0.2 m. Cost: a still player can blink 2 m once. Event-loop stalls over 100 ms additionally raise the cap for 700 ms. tests/netcode "speed hack" walk lengthened to match.
- Static cache: a miss is remembered 5 s, not forever (negative-cache bug). perMessageDeflate explicitly off (ws already sets TCP_NODELAY).
- Not done (measured not worth it): next-hop door table (BFS over 41 rooms is <1 % of a tick), `m.dead` slimming (identity compared in endMatch; heap flat at 13-18 MB), message batching/cork (earlier report: no gain).

## Client (game.js NET block)
- Render delay = p90 of recent snapshot ages (was 66 + 2 x jitter), asymmetric smoothing. Catch-up offset in `netSample`: after a stall the picture slides to the new position over ~0.3 s instead of popping. Move send rate 15 -> 20 Hz.
- `GK.net.stats()`, `GK.net.overlay(0|1|2)`; the ping readout is hidden unless `?debug=1`, `?net=1`, a GK_DEBUG server, or `GK.settings.ping`.
- Prop radius check: tests/netperf walks the client's own `WORLD.slide` (0.45) into crates/barrels; the server (0.33) never refuses it.
- Input redundancy skipped on purpose: WebSocket is TCP, loss shows up as delay, which the burst bank and delay now absorb. Lag-comp window unchanged (200 ms; delay 100-150 ms + half RTT fits at 100 ms RTT).

## Harness: `tools/netsim.js`
`node tools/netsim.js [--root dir] [--n 8] [--scen lan,100j30,100j30l2,200j60]` (real server, injected latency/jitter/loss) and `sim.model()` (seeded, no server, runs the real NET block in a vm). 8 clients, 14 s, before -> after:

| scenario | input->observer p50/p95 ms | fixes/min/client | pops/min | freeze % |
|---|---|---|---|---|
| lan | 62/98 -> 53/85 | 0 -> 0 | 37 -> 11 | 0.8 -> 0.5 |
| 100 +-30 | 148/215 -> 149/259 | 0 -> 0 (15 total before in a prior run) | 370 -> 224 | 6.7 -> 12 (load noise, rerun differs) |
| 100 +-30, 2 % loss | 156/431 -> 138/319 | 34 -> 7 | 372 -> 67 | 29 -> 10 |
| 200 +-60 | 270/539 -> 241/339 | 25 -> 0 | 1069 -> 152 | 45 -> 9 |

Seeded model (no machine noise), picture lag p50: lan 70 -> 50 ms; 100 +-30 155 -> 150 with pops 3.6 -> 1.2/min; 2 % loss pops 110 -> 8/min; 200 +-60 pops 210 -> 33/min.
Bandwidth per client (tickbench, 10 matches): 2.0-2.3 -> 1.4-1.6 KB/s down; in the 8-in-one-room sim it rises 3.7 -> 3.9-4.6 KB/s because the tick is now really 20 Hz and everyone is near everyone. Upstream 0.42 -> 0.5 KB/s (20 Hz).

## Tests
`tests/netperf.test.js` (5): tick Hz and cost (best of 3 windows), far/near snapshot rates and no lost final position, 4 walkers at 100 +-30 get <= 2 corrections and no kick, seeded interpolation guards, prop sliding. `npm test` (jobs 3): green except load flakes that pass alone (act5-crown, balance gang cap, security sprinter, bots tick cost; security sprinter also fails on untouched HEAD under load).

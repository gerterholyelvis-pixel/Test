# Server tick performance and robustness

Tool: `node tests/tickbench.js [humans] [seconds] [matches]` starts a GK_DEBUG server, joins N humans per match (bots fill to 8), walks them in circles and prints tick time (new `tick` field in the GK_DEBUG `{botstat:1}` reply), bandwidth, heap. `PROF=<dir>` writes a `--cpu-prof` profile.

## Numbers (Windows dev box, other agents running, so noisy)
- Tick (50 ms budget): 1 match 0.1-0.4 ms, 5 matches ~0.45 ms, 10 matches (30 humans + 50 bots) 1.0-1.9 ms avg, max 3-48 ms (GC / box load). The CPU profile of 10 matches over 20 s: 97 % idle; the biggest items are socket `writev` and `onMessage`, bot AI is ~0.2 ms per match.
- Bandwidth: ~1.9 KB/s and ~18 msgs/s per client (snapshots 1.6 KB/s, round 0.2 KB/s). Nothing worth cutting.
- Tried `socket.cork()` around the tick: write calls 302/s -> 277/s only (each client already gets about one message per tick). Dropped, not worth the risk.
- `snapshots()` rewritten (each mover formatted once, receivers join strings, spectator packet only built when spectators exist), identical JSON: 8.5 / 5.9 us -> 3.6 / 3.9 us per call (8 players, 8 movers, micro benchmark).
- Heap stays 7-11 MB; no growth over repeated joins/leaves (robust.test.js checks matches, tokens and IP slots return to baseline).

## Robustness fixes (server.js, all small and local)
- Tick: each match runs in try/catch. Before, one throwing match aborted the loop every tick and starved all matches after it. Now it is logged (first 3 times) and closed after 40 consecutive failed ticks.
- `leave()` drops the player's resume token at once; closed matches (lifetime cap, repeated errors) also drop their tokens, and `socResume` / the 60 s sweep ignore matches no longer in `matches` (before, those tokens stayed forever and could resume into a dead match).
- Heartbeat also terminates a socket with more than 256 KB queued (a client that stops reading).
- GK_DEBUG only: `{boom:1}` makes a match's tick throw (test hook), `{quit:1}` exits (flushes profiles), `tick/heap/matches/tokens/ips` added to the botstat reply.

## Checked, no change needed
Message validation (types, ranges, slot names, array lengths), 30 msg/s token bucket, 512 byte frame cap, per-IP and match caps, origin check: covered by security.test.js and the new tests/robust.test.js (flood, junk, binary, oversize, prototype keys).

## Tests
`tests/robust.test.js` (5 tests). Pre-existing failures in this checkout, independent of these changes: security.test.js static tests (no `three` under node_modules in the worktree), bots.test.js "bot tick cost" and the sprinter test fail under machine load (same on the untouched server.js).

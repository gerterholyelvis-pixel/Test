# Netcode, Phase 1 (steps 1 to 6 of docs/PLAN-netcode-perf-fun.md)

Code: `server.js` block `NET-BEGIN/END` (validation, snapshots, history) plus small hooks in `attack()`, the `m`/`ping`/`tp` handlers and the 50 ms timer; `game.js` block `NET-BEGIN/END` before `netReal` (interpolation, clock, ping HUD, fix blending), the real-socket part and the offline mock inside `makeNet`, the top of `handleMsg`, the players-list actor creation, and the remote-actor loop in `frame()`. No lights, no rendering changes.

## Protocol
| Message | Direction | Meaning |
|---|---|---|
| `{s:[t, id,x,z,yaw,v,age, id,...]}` | server to client, 20 Hz, only when someone moved | Snapshot. `t` = server clock ms (since server start). Per mover: x, z rounded to cm, yaw to mrad, `v` speed in m/s (0 = stopped), `age` = ms since the server received that position. Never contains the receiver. |
| `{players:[...]}` | server to client | Slow state (goblin, stats, gear, wins, box, positions at that moment). Only sent when something other than movement changed (join, leave, gear, health, kills). Movement no longer triggers it. |
| `{ping:clientMs}` / `{pong:clientMs, t:serverMs}` | client every 2 s / server | RTT and clock offset. |
| `{fix:[x,z]}` | server to client | A move was refused; this is the last accepted position (at most one per 150 ms). |
| `{atk:1, rt}` | client to server | `rt` = the server time the attacker was looking at (his clock minus the interpolation delay). |
| `{m:[x,z,yaw]}` | client to server | Unchanged, but the client now skips it when identical to the last one sent (1 s keepalive). |

## Server
- **Movement validation** (`applyMove`): speed budget = fastest sprint (7.5 m/s x 1.3 size factor) x 1.25 = 9.75 m/s of real elapsed time, banked up to 1.2 m, plus 0.3 m slack. A move is then walked in 0.2 m steps (`pathOk`): every position must be inside a grid room or a chest room (not the void between chest rooms), and every room change must go through the door between those two rooms, that door must be in the match's open list, and the crossing must be inside the opening (centre of the wall segment, 4 m / 4.9 m vault, +0.2 m). Refused move: position unchanged, yaw still taken, `{fix}` sent. Door ids and centres are built next to `ROOM_DOORS`.
- **Lag compensation**: every accepted move is kept in a 1 s history per player (a hold entry is inserted when he was still for 150 ms, so rewinding never makes him slide). `attack()` rewinds the targets to `rt`, limited to the last 200 ms (`REWIND_MAX`), and checks room, range and cone with the rewound position. No `rt` means no rewind. Plan said RTT/2 + interpolation delay computed by the server; the client sends the resulting render time instead, which is the same quantity measured where it is known, and the cap keeps it honest.
- **Debug only (`GK_DEBUG=1`)**: `GK_ROUND_MS` (round 1 length), `GK_REGEN_SCALE` (multiplies the regen timers, 0.1 = 10x faster). `{tp}` resets history and budget.

## Client
- Per remote goblin a buffer of `{t,x,z,yaw,v}` (t = snapshot time minus age). Drawn at `server clock - delay`. The delay adapts: `clamp(66 + 2 x jitter, 70, 150)` ms, smoothed; jitter is the RFC 3550 style arrival jitter of the snapshots. Interpolation between the two surrounding entries (yaw by shortest arc), extrapolation at most 100 ms along the last direction at speed `v`; a goblin that stopped has `v = 0` and is held. The render time never runs backwards.
- Clock: first snapshot gives a rough offset, the first pong replaces it, later pongs are smoothed (0.2) and pongs with a long RTT are ignored. RTT is an EMA.
- HUD: bottom right "Ping N ms", green below 80 ms, yellow below 150, red above. Hidden offline and outside play mode.
- `{fix}`: my position blends back at 14 per second (snaps if more than 4 m away). My own movement is still instant (prediction).
- The server sends a final `v = 0` entry about 150 ms after a goblin stops sending changes, because the client no longer sends identical positions.
- Offline mock (`?offline=1`): replies to `ping`, sends `{s:[...]}` snapshots of the bots every 50 ms and `{players}` only when the bot roster changes. No validation or `fix` offline.

## Numbers
Script: scratchpad `netcode/bw.js` (spawns server.js, 4 ws clients in one match, all moving in circles of r = 2 m at about 4 m/s, sending `{m}` every 66 ms for 10 s, counts payload bytes received per client; header overhead not counted).

| | before (main, dec691c) | after |
|---|---|---|
| server to client, bytes/s per client | 11,377 | 1,315 (about 8.6x smaller, -88 %) |
| server to client, messages/s | 15 | 16 |
| of which positions | 11,331 (whole players list) | 1,178 (snapshots) |
| round + match messages | 111 | 111 |
| client to server, bytes/s | 329 | 331 (the script never idles; a real idle client now sends 1 message/s instead of 15) |

Browser check (software GL, about 7 fps, Browser pane): server mode with a ws goblin circling at 3.5 m/s: the remote goblin's rendered path stayed on radius 1.99 to 2.02 m (true 2.0), mean speed 3.46 m/s (true 3.5), sd 0.36 m/s; the ping readout showed "Ping 8 ms"; a forced 10 m jump into a wall (`__gk.setView`) was answered by `{fix}` and snapped back within about 1 s (slow because frames are slow); no console errors. Offline: 4 bots moving at about 3 m/s, no console errors, no ping readout.

## Tests
`tests/netcode.test.js` (ping/pong, snapshot shape/rounding/self-exclusion/no `players` resend while moving/silence when still, legal sprint accepted, 4 m jump and a 20 m/s speed hack get `{fix}` at the last good spot with bounded spam, wall and closed door refused, outer wall refused, doorway beside the door refused, open door accepted and seen by an observer, lag-compensated hit / no hit without `rt` / no hit when `rt` is older than 200 ms) and `tests/combat.test.js` (Part A). `npm test`: 7 files, all pass, about 7.5 s on this machine (was about 6 s before the new files; the vault tests dropped from 33 s to 3 s with `GK_ROUND_MS`).

## Not done or not tested
- No real high-latency or packet-loss test (all local, RTT about 1 ms). Adaptive delay and the 200 ms cap were exercised only with simulated timestamps.
- The server does not know furniture (pillars, merchant glass, stations); only walls, doors, room bounds and speed. The client still blocks those.
- Door open state: the server treats a door as open the moment it is in the open list; the client's door animation takes 0.8 s (2.4 s vault) before it lets you through, so you are slightly stricter than the server.
- A speed-hacker who stays below 9.75 m/s plus the 1.2 m bank is not caught. Fast `fix` chains right after a real teleport are only throttled, not logged.
- Reconnect grace (plan, "if cheap") was not started.

## Jump (Space)
Code: JUMP-BEGIN/END in game.js (before frame) and server.js (next to the NET block), plus hooks in the key handler, frame, camera, viewmodel and netSnap/netSample. Cosmetic only: 0.9 m apex, 0.55 s airtime, 80 ms coyote, 100 ms buffer, no double jump. The client adds a 4th element to {m} (height in cm, only while airborne); the server clamps it to 0..100 and sends it in the snapshot speed slot as v = speed + 100 * cm, so stride and message count are unchanged. Collision, doors and attack range stay 2D: jumping does not dodge attacks. Test: tests/netcode.test.js, "jump".

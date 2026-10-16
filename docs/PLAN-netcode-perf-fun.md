# Plan: netcode, performance, multiplayer fun

Written by the Opus parent on 2026-10-15 from an audit of main at 22b1cf3. Sonnet agents implement it, in this order, **after** the combat, graphics, audio/feel and item-art branches are merged (they touch the same code).

## Audit findings
**Network**
- The client sends its position as JSON `{m:[x,z,yaw]}` every 66 ms (15 Hz).
- The server rebroadcasts the **whole players list**, including stats, gear, wins and box, as JSON every 50 ms whenever anything moved (server.js main loop). For 8 players that is about 8 full objects × 20 Hz to each of 8 sockets. Static fields are resent every tick.
- The server **trusts client positions**. It only clamps to ±LIM. Nothing checks speed, walls or closed doors, so you can walk through closed doors or teleport. In a competitive last-goblin-standing game this is the biggest fairness hole.
- Remote goblins use exponential smoothing toward the latest packet (`k = dt*10`, game.js ~4054). It always trails, rubber-bands with jitter, and has no notion of packet timing.
- There's no ping measurement, no clock sync, and no lag compensation for melee hits (combat arrives with its own branch).
- `perMessageDeflate` is off, which is good for latency. ws sets TCP_NODELAY by default.

**Client performance**
- `showStats()` rebuilds the stats panel with `innerHTML` on **every** players message (20 Hz), and `$('me')`/`$('cnt')` text is rewritten each time too. That's constant layout and style churn.
- Draw calls are 3000+ in the spawn rooms (graphics report). The graphics agent is working on this; check what's left after the merge.
- Look for per-frame allocations (new Vector3/Color, closures, array spreads in `frame()`) and repeated `getElementById` in hot paths.

## Phase 1: netcode (Sonnet, after the merges)
1. **Split the messages.**
   - Fast snapshots: `{s:[t, id,x,z,yaw,anim, id,x,z,yaw,anim, ...]}`, a flat array rounded to cm / mrad, server time `t` in ms, sent at 20 Hz. Include only players that moved.
   - Slow state: `{players:[...]}` with goblin, stats, gear and wins, sent only when something changes (join, leave, gear, health).
   - Keep the JSON transport. It's simple, and the payloads become tiny.
2. **Snapshot interpolation.** Buffer remote snapshots and render them 100 ms behind the server clock (adaptive: 2× the measured jitter, clamped between 60 and 150 ms). Interpolate between the two surrounding snapshots, and extrapolate at most 100 ms when packets are late. Yaw uses shortest-arc lerp.
3. **Clock sync and ping.**
   - `{ping:clientT}` every 2 s, answered with `{pong:clientT, t:serverT}`.
   - Keep an EMA of RTT and of the server clock offset.
   - Show a small ping readout in the HUD, coloured green below 80 ms, yellow below 150, red above.
4. **Server-authoritative movement checks, kept light.** Reject or clamp moves faster than max speed × 1.25 plus a small slack per tick. Reject moves through walls and closed doors using world.js geometry plus the current open doors. When a move is rejected, send `{fix:[x,z]}` and the client snaps or blends back. The local player keeps instant client-side movement, because prediction is already effectively there.
5. **Lag-compensated melee.** The server keeps a 1 s position history per player and checks hits against target positions rewound by (attacker RTT/2 + interp delay), capped at 200 ms.
6. **Tests.** Extend `npm test`: moving too fast gets corrected, walking through a closed door is rejected, a snapshot has the expected shape, and ping/pong works. Add a GK_DEBUG-only `GK_ROUND_MS` override so the suite runs in a few seconds.

## Phase 2: client performance (Sonnet)
- Update the stats panel DOM only when its values change: cache the last rendered string per field, and set textContent or style width directly.
- Remove per-frame allocations in `frame()` by reusing scratch vectors.
- Whatever draw-call reduction the graphics agent didn't finish: merge static room geometry per room, InstancedMesh for repeated props (panels, bolts, coffers), frustum-cull chest rooms that can't be seen.
- Pick a quality preset automatically on first run from a short FPS probe. Keep the user's choice once they set one.
- Measure before and after: FPS in the spawn room and in the vault, draw calls, JS ms per frame. Write it up in docs/reports/perf.md.

## Phase 3: multiplayer fun (Sonnet builds, Opus reviews; nothing here contradicts the owner's rules in FEATURES.md)
- **Kill feed:** top right, e.g. "Thok smashed Mizzle with a Nailed Club".
- **Spectate after death:** the death screen gets a "Spectate" button that follows a living goblin. Left and right switch between goblins. Requeue and Main menu stay available.
- **Scoreboard:** hold `` ` `` (Tab is the inventory). It shows goblins left, kills, and each player's goblin type and victories.
- **Match end summary for everyone,** not only the winner: who won, top killer, and the longest survivor.
- **Quick emotes / taunts** (keys 4-7): an animation plus a small speech-bubble icon over the goblin. Fun, cheap on bandwidth.
- **Footstep audio** from other players (audio agent) so goblins can hear each other through walls, which adds tension.
- **Round tension:** in the last 5 s of a round the door control panels flash and the timer pulses (the audio agent adds the tick).
- **Reconnect grace (in Phase 1 if it's cheap):** a dropped socket keeps the goblin in the match for 15 s, and a reconnect with the same token resumes it.

## Owner questions this plan does not answer
The win condition: last goblin standing is the default, set in the combat branch, awaiting the owner's decision. Also starting gold, stash-to-run, and recipes for tiers 1-5.

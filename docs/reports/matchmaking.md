# Matchmaking (queue, synchronized load-in, countdown)

## Flow
Start -> wheel spins; the client connects and joins the queue at once (the wheel screen is the queue: "Finding goblins N/8", elapsed time, Cancel = back to the title, implemented as a reload after `{cancel:1}`). The match forming moves everyone into the rooms; there is no Enter button any more (`GK.enter` still exists but nothing calls it).

## Server (server.js, MATCH-BEGIN blocks)
- A queue is a normal match object with `phase:'queue'`; `findMatch` (victory brackets, `tolerance`) only returns queue-phase matches, so closed matches take no late joiners.
- Starts at `CAP` = 8 players, or when the oldest waited `GK_QUEUE_MS` (default 30000) with >= 2 players. `GK_MATCH_SIZE` (1..8) works only with `GK_DEBUG=1`. Debug-only test knobs: `GK_READY_MS` (8000), `GK_COUNTDOWN_MS` (3000).
- Messages: on join `{queue:{n,size,since}, goblin}` (re-broadcast on join/leave and every second); `startMatch` sends each player the old welcome fields plus `players` plus `matchStart:{you,players,layout,chests,chestKeys,mystery,shops,spawn,size}`; clients answer `{ready:1}`; when all are ready or after 8 s the server sends `{countdown:{at,now}}` (`at` = server ms of GO, `now` = server clock for skew correction). At GO the phase becomes `play`, round 1 starts, everyone is `entered`.
- Spawns: shuffled outer rooms 0,1,2,3,5,6,7,8, one per player, `WORLD.randomPoint`. `fillWithBots(m)` is the (empty) hook for server bots, called after real players are placed.
- Before GO the server ignores `m`, `atk`, `claim`, `sel`. `enter` is accepted and ignored. `cancel` in the queue removes the player and closes the socket.
- Because everyone is `entered` at GO, last-goblin-standing now really fires in matches with 2+ players (it never could in tests before).

## Client
- menu.js: queue box (`#qbox`) beside the wheel; `GK.menu.queue/queueDone/whenRevealed/hideWheel`.
- game.js MATCH block: `GK.start` joins the queue and resolves with the wheel goblin; `GK.matchOnMsg` hooks after `handleMsg`; on matchStart it waits for the wheel reveal (max 6 s), enters the world, sends ready; countdown overlay 3-2-1-GO (gold, `GKAUDIO` tick / gong); `GK.locked` blocks movement, swing, E and the locked net messages until GO.
- Offline (?offline=1): sim messages are held, a fake queue fills 1/8..8/8 in ~2 s, the world is flushed in, then the local countdown runs (it starts after the wheel reveal, about 9 s from Start) and GO sends `enter` to the sim to start round 1.
- Requeue from the death/victory screens reloads and goes through the same queue (offline death still rerolls in place).

## Tests
`tests/matchmaking.test.js` (8 clients, same countdown, 8 rooms, movement locked, size 2, queue timeout, cancel). tests/lib.js servers default to `GK_MATCH_SIZE=1`, `GK_COUNTDOWN_MS=0`; `connect` readies up and waits for GO; `connectRaw` does not. Existing tests needing several players start their own server with a larger size.
Browser: server mode with GK_MATCH_SIZE=2 in two tabs and offline mode both went queue -> world -> countdown -> GO, movement locked until GO, no console errors. Screens: docs/screens/match-queue.jpg, match-countdown.jpg.

## Not verified
A real 8-browser run; audio actually heard; pointer lock after the countdown (no user gesture, falls back to the existing click-to-capture); a wheel slower than the 6 s ready cap (it is then cut at the countdown); `fillWithBots` is a stub, so a timeout match with few players has no bots yet.

# Release 2: ready for real players

Status per item and the owner decisions: docs/RELEASE.md (sections 3 and 6).

- **Safety**: `safety.js` (new, tested): `GK_TRUST_PROXY=N` last-hop client IP, join-flood limiter, stronger name filter, report book, error counters. Quick chat (8 fixed phrases) replaces free text; key H = chat, mute, report (4 reasons, rate limited, logged + `/healthz`).
- **Lobby**: private room codes (`?room=`, footer "Play with friends"), host Start, queue line (starts in N s, N seats become bots, marked as bots), bots listed at match start.
- **Reliability**: reload prompt on a new version, "server restarting" notice (`{bye}` + 1012), 30 s reconnect window (server and client), crash counters and heap / tick in `/healthz`.
- **First time**: `client/onboard.js` skippable 6-step round-1 walkthrough (input only, no practice dummy yet), device-based first-run preset. The round-1 How to Play panel already existed.
- **Accessibility**: `client/access.js` section in Settings (interface size, calm mode, less flashing, clear text). Not done: key remapping, colour-blind modes (audit in RELEASE.md).
- **Legal**: `/credits`, privacy text extended, licence audit (MIT x3, OFL fonts, no downloaded assets), `tools/fonts.js` for self-hosting (not run, owner decision 4).
- **Soak** (`npm run soak`): 20 matches / 160 goblins, 2 min: tick mean 3.7 ms, heap 20-30 MB flat, RSS 97 MB, matches freed 30 s after the last player.
- **Files**: safety.js, client/{live,access,onboard}.js, tools/{soak,fonts}.js, pages/credits.html, tests/safety.test.js; small hooks in server.js (SAFETY blocks), game.js (`GKR2.*` 5 lines, calm/flash 2 lines), release.js, index.html (one script line).
- **Tested**: safety.test.js (8), release.test.js (+2), security/social/names, `npm run check`, smoke source + `--dist` (pass), browser: rooms, host start, H panel, tutorial card, Accessibility section.
- **Not tested**: a real proxy / Render deploy, SIGTERM on Linux, phones, screen readers, `tools/fonts.js`; the Accessibility rows were checked in the DOM, not visually.
- **Merger notes**: game.js and server.js edits are one-liners marked RELEASE2 / SAFETY; the GRACE_MS default is now 30000.

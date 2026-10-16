# Security hardening (playtest readiness, phase 1)

Code: `server.js` blocks `SEC-BEGIN/END` (HTTP + admission), `PROFILE-BEGIN/END` (signed characters), small `SEC:` lines in the tick loop, `applyMove`, `findMatch`, `win`. Tests: `tests/security.test.js` (9 cases), `tests/lib.js` sets a fixed `GK_SECRET` and loose per-IP limits for the test servers.

## Signed character profiles (fixes "clients choose their goblin and victories")
- The **server rolls every new goblin** and **counts victories**. `?goblin=` and `?wins=` only work with `GK_DEBUG=1` (tests).
- A won run returns `{won:{..., wins, profile}}`. `profile` is `base64url({g, w, c, n}) + '.' + HMAC-SHA256(secret)` (goblin, victories, a random character id, the match name). `save.js` stores it on the character (`c.profile`, `c.wins` from the server); the menu's Play / Requeue send `?p=<profile>` (game.js `makeNet`).
- Bad or foreign tokens get `{profileFail:1}` and a fresh roll, never a chosen goblin.
- Secret: `GK_SECRET`, else a random one written to `.gk-secret` (gitignored, mode 600) so profiles survive restarts. Set `GK_SECRET` on Render so a redeploy keeps everyone's characters.
- Characters saved before this change have no profile: they still show in the Characters tab but play as a server-rolled goblin with 0 victories. There was no public playtest yet, so nothing real is lost.
- Replay: an old token only ever carries fewer victories, so replaying it hurts nobody but the replayer.

## Connection limits
- WebSocket upgrades go through `srv.on('upgrade')`: **Origin** must be this host (or in `GK_ORIGINS`), no Origin (tools, tests) is allowed; **8 sockets per IP** (`GK_MAX_PER_IP`), **20 new sockets per IP per 10 s** (`GK_CONN_RATE`), **400 sockets total** (`GK_MAX_CONN`), **60 matches** (`GK_MAX_MATCHES`, a joiner who fits no open match gets `{full:1}` and the "Server full" overlay).
- Behind Render (`RENDER` env) or with `GK_TRUST_PROXY=1` the IP is the first `X-Forwarded-For` entry.
- Heartbeat: a socket that answers no ping for 30 s is terminated (frees its per-IP slot, starts the reconnect grace).
- Decided matches close their sockets after 60 s (`GK_END_LINGER_MS`), so bot-only matches with a parked spectator no longer live forever; a hard 20 min lifetime (`GK_MATCH_MAX_MS`) ends anything else by the time-limit rule.

## HTTP
- Only `/`, `/index.html`, the nine client scripts, `/three/three.{module,core}.js`, `/three/addons/*.js` and `/healthz` exist; everything else is 404, other methods 405, URLs over 2 KB 414, null bytes 400.
- Files are cached in memory and re-read only when their mtime/size changes (one `stat` per request instead of a 1 MB read). HEAD works, `content-length` is set.
- Headers: `Content-Security-Policy` on the page (self + inline scripts/styles, Google Fonts, data/blob images, ws/wss), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. Verified in the browser: title, queue, match and bots run with no CSP reports.
- The request handler, the upgrade handler, every message and every close are wrapped; `uncaughtException` / `unhandledRejection` are logged instead of killing every match. A port clash still exits.

## Movement
- The speed budget accrues at 1.12x the fastest sprint (was 1.25x, so a 20 % speed hack passed).
- 30 speed rejections inside 10 s close the socket with code 4001 (`SPEED_KICK`). Wall and closed-door rejections do not count, so a desync at a doorway never kicks anyone.

## Names
- `cleanName()`: letters, digits, space, quote, hyphen, max 14; a small profanity list swaps the name for a goblin name.

## Not done / later
- Accounts with a database (the real fix for everything client-held); the signed profile is the bridge until then.
- The `tests/rules.test.js` bribe case assumes the server flips to play within 150 ms of GO; under heavy parallel load it can miss (seen once in a full run, never in isolation).

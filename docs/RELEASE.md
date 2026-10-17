# Release readiness

Owner request: *"a more polished game that is cleaner and ready to be released."* This is the checklist. Status: **done** (on the branch, tested), **partial**, **todo** (safe, not done yet), **owner** (needs your decision). Items are in priority order within each section; the decisions you need to make come first.

## Owner decisions (in priority order)

1. **Hosting plan.** `render.yaml` uses Render's free plan: it sleeps after 15 min idle (the first visitor waits about a minute) and has 512 MB. For a public launch use an always-on plan (about 7 USD a month). See PLAN-improvements-2 item 1.
2. **Licence.** `LICENSE` is a placeholder ("all rights reserved"). Choose MIT, a source-available licence, or proprietary. `package.json` says `UNLICENSED` until then.
3. **Privacy and terms page** (`/privacy`, `pages/privacy.html`). Draft written from what the code actually stores. Add the operator's name, a contact address and the host's privacy link (marked `OWNER` in the file). Have it read by someone who knows your local law if you launch in the EU.
4. **Google Fonts.** The page loads its fonts from Google, which sees each player's IP. Self-hosting the four OFL fonts removes that and one third-party dependency (about 150 KB of woff2). Allowed? (OFL, not CC0, so it needs your yes.)
5. **Version number.** `package.json` is now `0.9.0` (release candidate). Bump to `1.0.0` on launch day (see "Tagging a release").
6. **Git history size.** `.git` is about 69 MB, mostly screenshots. 309 unused screenshots were moved to `docs/archive/screens/` (still in the tree, no data lost). Shrinking the clone needs `git filter-repo` plus a force push, which rewrites every branch and breaks open worktrees. Recommended only after all agent branches are merged, if at all. Cheaper alternative: `git rm -r docs/archive/screens` (history keeps them).
7. **Telemetry** (PLAN-fun 14, PLAN-improvements-2 item 4): the privacy page promises anonymous stats with a Settings opt-out. Confirm before that work starts.
8. **Moderation routine.** There is a name filter but no report or mute button yet (see section 3). Who reads reports, and how often?

## 1. Repo hygiene

| Item | Status | Notes |
|---|---|---|
| README rewrite (what, screenshots, play, run, deploy, controls, env vars, Codex) | done | `README.md`, shots in `docs/screens/release/` |
| Docs index | done | `docs/README.md` |
| Unused screenshots out of `docs/screens/` | done | 309 files (41 MB) that no doc links moved to `docs/archive/screens/`; 81 linked ones stay. Stray `i_wheel.png` (root) archived too |
| `.gitignore` | done | adds `dist/`, logs, `.env*`, profiles, OS junk |
| Line endings | done | Every text file in the index is already LF. `.gitattributes` sets `* text=auto` (no renormalisation, so no file changes), LF for `*.sh`, binary for images, fonts, audio. Do not add a global `eol=lf` while branches are open |
| LICENSE | owner | placeholder, decision 2 |
| THIRD-PARTY-NOTICES, assets/CREDITS.md | done | three.js MIT, ws MIT, esbuild MIT (build only), 4 OFL Google fonts; no downloaded assets |
| Secrets | done | `.gk-secret` is git-ignored and never served; `npm run check` scans every tracked file for keys and tokens (clean) |
| `package.json` | done | name `goblin-king`, `private: true`, version 0.9.0, Node `>=20`, `.node-version` 24 |
| `docs/game-info.html` churn | todo | the server regenerates the tracked Codex when any game file changes, so it shows up modified in every checkout. Suggest: stop tracking it and build it at start (it already does) |
| Stray tools | partial | `tools/preview-*.html`, `icon-lab.html` are dev pages, kept (documented in their reports). Nothing else dead found |

## 2. Build and ship

| Item | Status | Notes |
|---|---|---|
| Production build | done | `npm run build` (`tools/build.js`, esbuild per file, no bundling): 25 scripts 1.77 MB -> 1.10 MB minified -> 0.39 MB Brotli; three.js minified into `/vendor/three-<ver>/`. Content-hashed copies; the page's import map points `/game.js` etc. at them, so the game code is untouched |
| Cache headers | done | hashed files `max-age=31536000, immutable`; page and plain names `no-cache` |
| Compression | done | Brotli/gzip by `Accept-Encoding` in production (precompressed for dist, compressed once and kept in memory for three.js addons and the Codex) |
| Source maps | done | `dist/maps/`, not served, not referenced |
| Stale build protection | done | the server checks the SHA-256 of every source against `dist/manifest.json` and falls back to the plain files (logged) if anything changed |
| Dev mode untouched | done | `npm start` without `NODE_ENV` never reads `dist/` and never compresses; CLIENT_JS allow-list unchanged |
| `npm start` in production | done | `NODE_ENV=production npm start` or `npm run start:prod` |
| Node pin | done | `.node-version` 24, `engines >=20`, `NODE_VERSION` in render.yaml |
| Graceful shutdown | partial | SIGTERM/SIGINT: `/healthz` turns 503, no new connections, players get `{bye:"restart"}` then close code 1012 (the client says "restarting for an update", RELEASE2), exit after `GK_DRAIN_MS` (2 s). Matches live in memory and still end on deploy: honest and unchanged. The full "finish the match, 5-minute banner" drain is PLAN-improvements-2 item 2 (owner decision: is a deploy during play acceptable at launch size?) |
| Health endpoint | done | `/healthz`: ok, uptime, matches, sockets, dist |
| Version | done | `/version` (version, commit, build time, node); menu footer shows `v0.9.0` |
| Client/server version check | done (RELEASE2) | `client/live.js` compares `/version` (version + commit) on a closed socket, when the tab returns and every 10 min: a "New version, Reload / Later" pill (softer wording inside a match) |
| Structured logging | done | `GK_LOG=json`: one JSON object per line (set in render.yaml) |
| Env vars documented | done | README table |
| render.yaml | done | `npm ci --include=dev && npm run build`, `/healthz`, `NODE_ENV`, generated `GK_SECRET`, `GK_TRUST_PROXY=1`, JSON logs. **Verify after the first deploy** that two players on different networks get different IPs (`GK_TRUST_PROXY` reads the last `X-Forwarded-For` hop) |
| CHANGELOG | done | `CHANGELOG.md` |
| Tagging | done | see below |

### Tagging a release
1. `git checkout main && git pull`, make sure no agent branch is half-merged.
2. `npm run release:check` (check + tests + production smoke). On a busy machine use `GK_TEST_JOBS=3` and rerun a timing flake alone.
3. Move the `[Unreleased]` notes in `CHANGELOG.md` under a new version heading; set the same version in `package.json` (`npm version 1.0.0 --no-git-tag-version`).
4. Commit `Release 1.0.0`, then `git tag -a v1.0.0 -m "Goblin King 1.0.0"` and `git push origin main --tags`.
5. Render deploys main; check `/version` shows the new version and commit, and `/healthz` says ok.
6. Rollback: Render dashboard > the previous deploy > Redeploy, or `git revert` and push.

## 3. Robustness and player-facing safety

| Item | Status | Notes |
|---|---|---|
| Unsupported browser / no WebGL2 | done | `client/boot.js` (first script): clear message with what to do, "Try anyway" |
| Phones and tablets | done | "Desktop browser required" note, dismissible for the session |
| Loading screen | done | progress bar from the scripts actually fetched, a rotating tip, "Lighting the hall" when the renderer is up; gone with the title curtain |
| Load failure | done | after 45 s without the title: "did not load" with Reload / Keep waiting |
| Offline | done | slim "You are offline" banner; the match reconnect dialog already existed (15 s grace) |
| Server full | done (existed) | `{busy}` -> "Servers are full, retrying" toast; per-IP 429 shows the reconnect dialog (could say why: todo) |
| Shutdown message | done (RELEASE2) | `{bye}` and close code 1012 show "The server is restarting for an update" with a Reload button |
| Reconnect to the same match | done (RELEASE2) | the existing token resume now lasts 30 s on both sides (`GRACE_MS`, client `FRESH_MS` and the reconnect dialog); a dropped goblin stays in its match, afterwards it dies normally. Tested by tests/social.test.js and the soak (matches are released 30 s after the last socket) |
| Crash guard | done (RELEASE2) | uncaught errors, unhandled rejections and message-handler errors are logged and counted; `/healthz` shows `errors`, `lastError`, `heapMb`, `rssMb`, `tickMs`, `tickMaxMs`, `humans`, `reports`, `refusedConnections`. A tick exception is already caught per match (ROBUST). A process that dies is restarted by the host |
| Favicon, manifest, share card, title, description | done | `pages/`; `og:image` becomes absolute when the build has `GK_PUBLIC_URL` |
| 404 page | done | HTML for browsers, plain text otherwise; 500 stays a bare status (no stack leaks) |
| Privacy and terms | owner | `/privacy` (and `/terms`), linked from the menu footer; no cookies are used, so no banner (storage is strictly necessary) |
| Low-end auto quality | done (existed) | first-run preset probe plus a mid-match downgrade toast |
| Input validation and rate limits | done (existed, re-checked) | 512-byte frames, 30 msg/s token bucket, type checks per message, test hooks only under `GK_DEBUG`; `tests/security.test.js`, `tests/fuzz.test.js` pass |
| CSP | done | no `unsafe-inline` for scripts (hashes, also for the rewritten dist page); still `style-src 'unsafe-inline'` because game.js writes inline styles. Tightening that is a large refactor: not recommended now |
| Name filter | done (existed) | `cleanName` + word list in server.js |
| Name filter | done (RELEASE2) | `safety.js cleanName`: also catches digits as letters (sh1t), spaces (f u c k), repeats, links and staff-like names (admin, moderator); refused names become goblin names. The word list is English only: owner decision for other languages |
| Chat | done (RELEASE2) | there is no free text anywhere. Quick chat = 8 fixed phrases (key H or digits), rate limited (1 per 1.5 s, 40 per match), relayed to the match only |
| Report / mute | done (RELEASE2) | key H panel: Mute (hides that goblin's quick chat and emotes for you), Report with 4 reasons (3 per match, one per goblin, 4 s apart; bots cannot be reported). Reports are one log line (names, reason, match) plus a counter in `/healthz`; nothing acts on them automatically. Owner decision 8 stays: who reads them |
| Abuse limits review | done (RELEASE2) | frames 512 B, 30 msg/s bucket, type checks, per-IP sockets 8, per-match cap 200 (existing); new: join-flood bucket per address (burst 12, one per 2.5 s, `GK_CONN_BURST` / `GK_CONN_EVERY_MS`), `GK_TRUST_PROXY=N` takes the Nth `X-Forwarded-For` entry from the right (a forged first entry changes nothing; header ignored when unset), invalid / missing header falls back to the socket. Tests: tests/safety.test.js. **Still verify on Render** that players on different networks get different addresses: if every player shares one, the per-IP cap blocks everybody (set `GK_MAX_PER_IP` high as a stop-gap) |
| Capacity | done (RELEASE2, local) | `npm run soak`: 20 simultaneous matches (160 goblins, 20 humans) for 2 min on this dev machine: mean tick 3.7 ms of a 50 ms budget, worst tick 174 ms once at the simultaneous start (12 ms later), heap 20-30 MB flat (growth 2 MB), RSS 97 MB, 0 errors, all 20 matches released 30 s after the last player left. A 512 MB host is nowhere near its limit on memory; the real network cost still needs the host test (PLAN-improvements-2 item 10) |

## 4. Polish sweep (screenshots at 1366x768, 1920x1080, 2560x1440)

| Finding | Status |
|---|---|
| Menu footer overlapped the Codex button at 1080p (8 menu buttons) | fixed: footer moved bottom-right, shows version and Privacy |
| Controls screen missed Attack, Q/R, scoreboard | fixed on main meanwhile (B bribe too) |
| Toast said "Settings > Graphics quality", the setting is "Quality preset" | fixed |
| How to play has no panel for round 1 in the home (5x5) | done (QA-FULL rewrote `PANELS`: "Round 1: your home" is panel 1) |
| The "pick a door" tip shows during round 1 in the home, where doors do not matter yet | todo (game.js tips) |
| 720p: the "Round 1 - Prepare" banner runs under the minimap; hint bar wraps to 2 lines at 1280 px | todo (CSS) |
| 1440p: menus are scaled by viewport height and look small | todo (consider a max scale) |
| No mute: only the master volume slider | todo (a Mute row in Settings > Audio) |
| No credits screen | done (RELEASE2): `/credits`, linked from the title footer; owner placeholders for the name and licence |
| "New goblin" button | ok: styled, hidden in menus |
| Debug leftovers | clean: no console.log in client code; "Skip to 0:10" only with `GK_DEBUG` |
| Volume defaults | ok: master 80 %, effects 90 %, ambient 50 %; settings persist in localStorage |

## 5. Quality gates

| Gate | Status | Notes |
|---|---|---|
| `npm run check` | done | ~2 s: syntax of all JS, conflict markers, secrets, page scripts vs CLIENT_JS, doc links, npm scripts, debug leftovers |
| `npm test` | done | includes `tests/release.test.js` (build, dist serving, compression, CSP, stale fallback, endpoints, 404s) |
| Tiered test commands | n/a | no dev-efficiency report exists yet |
| `npm run smoke` | done | `tools/smoke.js`: own server, headless Edge/Chrome, Start, real match with bots, walks and fights for 60 s; fails on page errors, server errors, fps < 20, mean tick > 12 ms. `--dist` tests the production build. On a loaded machine pass `--min-fps 5` |
| `npm run release:check` | done | check + tests + `smoke --dist` |

## 6. Release 2: first-time players, lobby, accessibility, legal (docs/reports/release-2.md)

| Item | Status | Notes |
|---|---|---|
| Round-1 tutorial | done, partial | `client/onboard.js`: six skippable steps in the first 3 matches (move, look, jump, use workbench / pump / screen with E, swing, what the crown is), ticking off by itself from input only; "Replay tutorial" in Settings > Accessibility. **No practice dummy** (it needs a new world entity in the home, which other agents are editing): the fight step asks for two swings in the air. todo: a dummy once the home art settles |
| Device-based default graphics | done | `client/access.js` picks Low / Medium on the first run from cores, memory and GPU name (software or integrated); the existing post-GO 2 s fps probe still steps one preset down. Not a benchmark: no frames are drawn before the title |
| Lobby | done | the wheel screen now says when the match starts, how many seats become bots, and that bots are marked. Bots are flagged `bot:1`, listed with a BOT tag in the H panel, and announced at match start ("3 of the goblins are bots: ..."). They still wear human-like names by design |
| Private rooms | done | footer "Play with friends": a 3-6 character code, same code = same match, the first player is the host and can press Start now, the room waits 90 s (`GK_PRIVATE_MS` only under `GK_DEBUG`), empty seats are bots. Public players never land in a room. Rooms are not listed anywhere (the code is the secret). todo: friend invites by link (`/?room=ABCD`) |
| Accessibility | partial | Settings > Accessibility (injected by `client/access.js`, the settings menu itself is the UI agent's): interface size 80-160 %, calm mode (no camera shake or CSS animation, starts on when the OS asks for reduced motion), less flashing (hit vignette cut to 30 %), clear text. **Not done:** remappable keys (the game reads `e.code` in ~40 places, not cheap), colour-blind modes (no colour-only cue was found to fix without redesigning the HUD: health is a bar plus a number, names carry text; the red hit vignette and the green/red damage numbers are colour cues: owner / UI-agent decision), subtitles for sound cues |
| Credits and notices | done | `/credits`, THIRD-PARTY-NOTICES.md, assets/CREDITS.md (no downloaded assets). Licence audit: three 0.186 MIT, ws 8 MIT, esbuild MIT (build only), four OFL fonts; no other runtime dependency; no analytics or other external request except Google Fonts |
| Self-hosted fonts | owner | `tools/fonts.js` (not run: it downloads files, and is untested against Google's live CSS) writes `pages/fonts/` and `pages/fonts.css`; the header comment lists the five manual edits. Decision 4 |
| Privacy text | done, owner | covers storage keys, IP, quick chat, room codes, reports, bots, the 30 s reconnect ticket; `OWNER` placeholders remain for the operator, contact, host link and report handling. Not legal advice |
| Soak and gates | done | `npm run soak` (see Capacity), `tests/safety.test.js` (proxy IP, limiter, names, rooms, host start, quick chat, reports, join flood), two more cases in `tests/release.test.js`, smoke passes in source and `--dist` modes |

### Owner decisions that remain after Release 2
1. Hosting plan, licence, operator name and contact on `/privacy` and `/credits`, fonts (decisions 1-4 above), version number, git history size (5-6).
2. Moderation (decision 8): reports only reach the log. Decide who reads them, how long logs are kept, and the consequence (a ban list by name is not possible: there are no accounts).
3. Name filter languages (English only) and whether to show bots with a visible BOT tag on the in-world name tags too (today: honest in the queue, the match start and the H panel; the tags look like players on purpose).
4. Deploy during play: matches end on a restart. Acceptable until the first regular evening crowd; then PLAN-improvements-2 item 2.
5. Real network test on the host (per-IP check behind the proxy, bandwidth per player).

# Goblin King: agent quick reference

Multiplayer three.js game. `server.js` (Node, `ws`) is authoritative; `game.js` is the client (one big IIFE). Many agents work in
parallel in git worktrees. **Find code with `docs/MAP.md` + Grep, never by reading whole files** (game.js is ~870 KB, server.js ~200 KB).

## Run
- `npm start` serves http://localhost:3000. In a worktree **always pick a free port**: `node tools/wt.js --port`, then
  `$env:PORT=<port>; npm start` (PowerShell) or `PORT=<port> npm start`. Fixed ports collide with other agents' servers.
- `?offline=1` = demo mode with simulated players (no server match needed).
- Debug knobs need `GK_DEBUG=1`: `GK_MATCH_SIZE GK_QUEUE_MS GK_ROUND_MS GK_NEXT_ROUND_MS GK_COUNTDOWN_MS GK_READY_MS GK_GRACE_MS GK_BOT_GRACE_MS GK_TRAP_MS GK_SUDDEN_ROUND GK_MAX_ROUND GK_CRAFT_SCALE GK_REGEN_SCALE GK_RULES`.
- **The server caches every static file (and the CSP hash of index.html's inline scripts) at first request / startup. Restart it after editing any client file**, or you test stale code. A file requested before it existed stays 404 until restart.

## Worktrees
- New worktree: `node tools/wt.js <name> [base]` (adds `.claude/worktrees/<name>`, links node_modules, prints a free port).
- Existing worktree without node_modules: `node tools/wt.js --link` (a junction to the main checkout's node_modules). Without it the
  security static tests fail (three.js 404) and `ws` is missing.

## Test
| command | what | time (16 cores, busy machine) |
|---|---|---|
| `npm run test:fast` | 14 pure/unit files, no server | ~7 s |
| `npm run test:changed` | only files affected by your diff vs main (+ uncommitted) | depends |
| `npm run test:server` | server integration + slow sims | ~90-120 s |
| `npm test` | everything (unchanged default) | ~90-120 s |
| `node tests/run.js bots vault` | files whose name contains a word | |
| `npm run check` | `node --check` every .js + balanced block tags | ~3 s |
- `-q` prints only failures. `--list` shows each file's tier and tags. `--changed --dry` shows the pick without running.
- `@timing` files (bot tick cost, sprinter speed, regen, gang cap ...) are retried once, one at a time; the summary says `FLAKY` if
  the retry passed. A file that fails twice is a real failure. Tag new wall-clock-sensitive tests `// @timing` in the first 5 lines.
- New test file: `tests/<area>.test.js`, use `tests/lib.js` (`startServer`, `connect`, `run`, `assert`, `eq`); it is picked up automatically.
  Prefer pure tests of a pure module (fast tier) over a server test. Never hard-code a port.

## Conventions
- **Tagged blocks**: code lives inside `// NAME-BEGIN (what, see docs/reports/x.md)` ... `// NAME-END`. Add your work as a new tagged
  block or a new file; do not reformat, rename or move code outside your block. `npm run check` fails on an unbalanced tag.
- Pure logic goes in its own UMD file (`root.GKX = ...; module.exports = ...`) shared by client and server (world.js, items.js, activity.js ...).
- A new client file must be added to `CLIENT_JS` in server.js (root files, e.g. `foo.js`) or live under `client/**.js` (served
  automatically), and to the 200/404 lists in `tests/security.test.js` if you add a new kind of path.
- Owner rules: exactly 9 PointLight + 1 Hemisphere (never add lights); do not hurt the Low preset; no clutter.
- **Line endings**: the repo stores LF; Windows checkouts have CRLF (`core.autocrlf=true`). Edit with the Edit tool; never rewrite a whole
  file with a different EOL (the diff becomes the whole file and conflicts with every other agent).

## Git
- Commit often on your own branch; `git add <files>` only, **never `git add -A`** (worktrees and the main checkout are shared).
- Never use bare `git stash` (the stash stack is shared): use a WIP commit.
- Before handing off: merge main into your branch, `node tools/merge-check.js main` (dry-run conflicts, syntax, tags, fast tests), then `npm test`.
- Mergers: `node tools/merge-check.js <branch>` before `git merge --no-ff <branch>`; then `npm test`, browser smoke test, `npm run map`.
  docs/MAP.md conflicts: take either side and rerun `npm run map`. Never rebase merge commits.

## Busy areas (other agents edit these now: do not move or reformat)
server.js doors/rounds (MATCH, GUARD, PACE), BOTS / AI / BOTS5, act5.js / vb5.js / ACT5 / ACT5UI, the KNOWLEDGE workbench panel,
balance numbers in items.js, JUMP / climb movement, PERF / PERF2 / PERF4 blocks in game.js, TIPS (booked by docs/PLAN-fun.md wave 1).

## Reports
`docs/reports/<area>.md`, under 250 words: what changed, files, what was tested, what was not, merger notes. Screenshots: few, JPG,
<= 1280 px wide, in `docs/screens/`. More in `docs/AGENTS.md`.

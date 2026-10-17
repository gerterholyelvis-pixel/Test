# Plan: faster, cheaper agent development

Owner request: *"make a plan for this to optimize speed and token usage."* The game is built by ~14 parallel AI agents. Cost and
wall time come from five places; each section below gives the measured problem, what is **done in this branch**, and what is next,
in priority order. Numbers were measured on 2026-10-16 on the owner's 16-thread machine while other agents were running
(CPU 33-100 % busy before each run), so absolute times are noisy; the comparisons were run back to back.

## 0. Priorities at a glance

| # | action | saves | cost | status |
|---|---|---|---|---|
| 1 | `CLAUDE.md` + `docs/MAP.md` + `tools/mapgen.js`: agents Grep a tag instead of reading game.js | the single biggest token sink | done | **done** |
| 2 | `npm run test:fast` / `test:changed` while iterating, full `npm test` once before hand-off | 1.5-3 min per test cycle | done | **done** |
| 3 | `@timing` retry + `FLAKY` report; known flaky files tagged | re-runs and "is this my fault?" investigations | done | **done** |
| 4 | `tools/merge-check.js` (dry-run merge, syntax, tags, fast tests) and `tools/wt.js` (worktree + node_modules + free port) | merger time, broken worktrees | done | **done** |
| 5 | Short reports, small JPG screenshots, brief template (`docs/AGENTS.md`) | output tokens and re-reads | rules only | **done** |
| 6 | Move rarely edited, self-contained blocks out of game.js / server.js | merge conflicts | one PR per block | order in section 3; none moved yet (the one mechanical candidate is booked by PLAN-fun wave 1) |
| 7 | Time-scale knob for the slowest server tests (`GK_TIME_SCALE`) | ~40 % of suite time | touches server.js timers | proposed |
| 8 | CI (GitHub Actions) running `npm run check` + `npm test` on every push | catches breakage before a merge | small | proposed |

## 1. Agents reading huge files (tokens)

**Measured.** game.js is 8 522 lines / 869 KB (roughly 220 k tokens: it cannot even be read whole), server.js 2 192 lines / 197 KB
(about 50 k tokens). Briefs said "Grep, not full reads", but there was no index of what lives where, so agents opened 300-2 000 line
windows to orient. Every report re-derives conventions (node_modules junction, ports, CLIENT_JS, CRLF): 20+ reports repeat the
"security tests fail without node_modules" note alone.

**Done.**
- `CLAUDE.md` (4.5 KB, read automatically by Claude Code): run, ports, worktrees, test commands, tags, CRLF, git rules, busy areas.
- `docs/MAP.md` (~22 KB): who loads what, an area -> block -> test table, and a **generated** file index (lines, KB, EOL, globals,
  exports, header) and tagged-block index (107 blocks with file, line range, size, one-line description).
- `tools/mapgen.js`: `npm run map` rewrites the generated part; `--print PANEL` prints fresh numbers for one tag; `--check` fails on an
  unbalanced BEGIN/END (wired into `npm run check` and merge-check). It ignores prose like "see the ACT5-BEGIN block".

**Rule for agents.** Read CLAUDE.md, then the MAP row for your area, then `Grep "<TAG>-BEGIN"` and Read only that range. A typical
orientation drops from 3-6 large reads (20-60 k tokens) to one 22 KB map plus targeted 100-300 line reads.

**Next.** Keep the generated index fresh after merges (merger runs `npm run map`). Line numbers drift, so the map tells agents to
Grep the tag; generated-part conflicts are resolved by regenerating, never by hand.

## 2. Test suite: speed and reliability

**Measured (before).** 58 test files, 14 of them pure. The old runner ran everything with half the cores (8) in parallel, in
alphabetical order, printed every line of every file, and had no notion of flaky tests.
- Per-file times (alone): elixir-sends 35.6 s, useplus 34.8 s, bots5-sim 31.3 s, bots-ai 26 s; most of it is real game timers
  (rounds, item durations, craft times, bot reactions), not CPU. Server start is only ~110 ms and a client join ~40 ms, so shared
  server instances would save little; the time is in the waits.
- Full runs: 91.9 s with 2 failures (moderate load); 114.2 s with 6 failures and 121.9 s with 11 failures (CPU 97-100 % busy).
  The failing files are always the wall-clock ones: bots (tick cost, refused moves), bots5-sim (per-sweep CPU budget), security
  (sprinter), utility, combat (regen), balance (gang cap), elixir-home, bots-ai (emote after a kill). Each passes alone.
- Reports confirm it: 20 of 83 reports mention a timing flake, and agents spent re-runs proving the failure was not theirs.

**Done (tests/run.js, `npm test` still runs every file and exits non-zero on any failure).**
- Tiers, inferred (a file that calls `startServer(` / `spawn(` is `server`) or tagged `// @tier`:
  `npm run test:fast` = 14 pure files in **6.5 s** (CPU 100 % busy); `npm run test:server` = server + slow; `npm test` = all.
- `npm run test:changed`: maps the diff vs main (plus uncommitted files) to tests: a test is picked when it names the changed module
  or a module that require()s it; server.js / world.js / items.js pick every server test; docs pick nothing. Examples: hud5.js -> 2
  files, vault5.js -> 6, game.js -> 9 static-check files, activity.js -> 10. `--dry` shows the pick.
- `@timing` tag (in-file, or the central `TAGS` table in run.js for files owned by busy agents): such a file is retried once in the
  next free slot; the summary prints `FLAKY <file>: failed first, passed on retry` with the first failure's lines, or says it
  failed twice. `--no-retry` / `GK_TEST_RETRY=0` turns it off, `--retry-all` retries any failure.
- Longest-first scheduling from the last run's times (`tests/.timings.json`, git-ignored) so a 35 s file never starts last.
- Load-aware slots: the CPU is sampled for 400 ms before start; an idle machine gets up to 3/4 of the cores (max 12), a busy one
  keeps half. **Measured lesson:** lowering parallelism on a busy machine made things worse (6 slots + a 2-file @timing cap: 212 s
  vs 114 s for 8 plain slots), because most files wait on game timers; so the runner no longer lowers below the default.
- Per-file timeout (default 60 s, `// @timeout N`, `GK_TEST_TIMEOUT`), `-q` (failures + summary only), `--list`, name filters
  (`node tests/run.js bots vault`), and a "slowest files" line.
- See `docs/reports/dev-efficiency.md` for before/after runs.

**Next (proposed, needs the server owners).**
1. `GK_TIME_SCALE` (GK_DEBUG only): one factor applied to item durations, craft times, telegraphs and grace timers in server.js,
   so elixir-sends, useplus, utility, stations and act5-* can run at 0.3x. Their assertions are written in those same constants, so
   semantics stay; estimated -40 % suite time. This edits USE / USE2 / ELIXIR / CRAFT code, so do it when those areas are quiet.
2. Split the three-phase files (useplus: solo / duel / bots; utility) into one file per phase: they then run in parallel
   (35 s -> ~12 s critical path). Pure move of test code, but those files are edited by item agents; schedule it.
3. Make CPU-budget assertions (bots tick cost, bots5-sim per-sweep) relative: measure a fixed reference loop at the start of the
   file and compare the ratio, so they pass on a loaded machine and still catch a 2x regression.
4. A seeded RNG behind `GK_SEED` (QUALITY-PLAN 4.5) to make the bot tests deterministic.
5. CI on GitHub Actions: `npm ci && npm run check && npm test` on Node 20 (QUALITY-PLAN 4.6).

## 3. Merge conflicts in game.js / server.js

**Measured.** game.js has 107 tagged blocks in 8 522 lines; the blocks with the most churn are PANEL, MATCH, BOTS*, ACT5*, KNOWLEDGE,
PERF2, JUMP. client/** is already served (`/client/**.js`, traversal-safe, covered by security.test.js), so prerequisite 1 of
QUALITY-PLAN 4.2 is done.

**Checked, deliberately not moved now.** The only game.js block that is truly mechanical to move today is `TIPS` (122 lines, the
one block outside the main IIFE; it talks only through `window.GK`, `GKWORLD`, `GKAUDIO` and the DOM). It would move verbatim to
`client/ui/tips.js`, imported by index.html right after `game.js` (same evaluation order). But `docs/PLAN-fun.md` wave 1 (W1-A
clarity, W1-B codex) assigns exactly that block to two agents, so moving it now would hand both of them a conflict. Every other
block lives inside the main IIFE and reads closure state (`RS`, `P`, `actors`, `myInv` ...), so it is not a cut-and-paste move
until `client/ctx.js` exists (QUALITY-PLAN 4.2 step 3). Recommendation: do the TIPS move as the first commit of W1-A (it is
their block), and add `ctx.js` in a quiet window.

**Next moves, in order** (one block per PR, move only, BEGIN/END kept, freeze announced; QUALITY-PLAN 4.2 safety rules):
0. `TIPS` -> `client/ui/tips.js` (with W1-A, see above).
1. Add `client/ctx.js` (shared names as `ctx.x`, QUALITY-PLAN 4.2 step 3). Then the blocks that already publish a `window.GK*` API:
   `LOOT` (GKLOOT), `UTILITY` (GKUSE), `ITEMS2` (GKUSE2), `HOME` (GKHOMEW) -> `client/items/*.js`, `client/ui/home.js`. Check each
   block's free identifiers first (`node tools/mapgen.js --print LOOT`, then Grep them).
2. `MINIMAP`, `FUN`, `UI` (DOM only, inside the IIFE): need a `ctx` object (QUALITY-PLAN 4.2 step 3) for `RS`, `actors`, `P`.
3. `GOBLINART` + `ARMOUR2/3` + `GOBTYPES` + `GKKIT` (1 033 lines, art only) -> `client/goblin.js`.
4. `ROOMART`, `ROOMS5ART`, `MYSTERY`, `CHEST`, `MAP` (art, hooks via layout).
5. Server, CommonJS: `SECURITY` (static/http) -> `server/http.js`, then `USE` / `USE2` / `LOOT`, then `BOTS` / `AI` / `BOTS5`.

**Do not move now** (other agents are editing them): server.js doors / rounds (MATCH, GUARD, PACE, SUDDEN), BOTS / AI / BOTS5,
act5 / vb5 / ACT5 / ACT5UI, the KNOWLEDGE workbench panel, items.js balance numbers, JUMP / climb, PERF / PERF2 in game.js.

**Conflict hygiene that costs nothing.** New features go in a new file (`client/...` or a UMD root file) with a 3-line hook in
game.js; never reformat; never flip a file's line endings (the repo stores LF, Windows checkouts are CRLF); merge main into your
branch before hand-off and run `node tools/merge-check.js main`.

## 4. Agent workflow (tokens per task)

**Measured.** 83 reports average **678 words** (max 1 873) against a 250-word brief; the parent re-reads them at merge. 334
screenshots in docs/screens weigh 43 MB; the 28 PNGs average 408 KB vs 107 KB for JPGs, and a full-resolution screenshot costs
roughly 1.5 k image tokens each time it is viewed.

**Done.** `docs/AGENTS.md`: a trimmed brief template, report rules, screenshot policy, when to use a read-only Explore agent, the
model split, merge checklist. Tools: `tools/wt.js` (new worktree, node_modules junction, free port), `tools/merge-check.js`.

**Model split** (memory: Opus for design / merge / review, Sonnet for implementation and tests). Typical task shapes:
- Sonnet implementer, one block, with map + fast tests: aim for < 150 k input tokens; a run that opens game.js windows without the
  map was typically 2-4x that.
- Opus parent: brief (short), merge-check, merge, full `npm test`, a 3-shot browser smoke test. Do not re-read whole reports: read
  the "merger notes" lines.
- Explore (read-only, cheap) for "where is X / who calls Y" across many files; never for code changes or reviews.

## 5. Game runtime speed (cross-references, no change here)

The runtime work is planned and measured elsewhere; this plan does not change game behaviour.
- QUALITY-PLAN section 1 (budgets and the top 10 hotspots), `docs/reports/perf.md`, `perf-2.md` (vault view on Low 530 -> 220
  draw calls, goblin LOD), `perf-3-client.md` (icon bake LUT 20 -> 3.2 ms per icon; 153 MB texture estimate),
  `server-tick.md` (tick 1-2 ms for 10 matches, 97 % idle; ~1.9 KB/s per client).
- Open items from those reports: real-GPU fps is still unmeasured (the pane is software GL); the 6.7 s icon bake on every reload
  (IndexedDB cache exists); `location.reload()` on every match exit; extra rAF loops that ignore `GK.mode` (QUALITY-PLAN 4.5); the
  `?perf2=0` off path (33 references) can be deleted.
- Dev-speed link: `npm run test:browser` (tools/perfbench.js, PERF4, just merged to main) measures draw calls, CPU ms and heap per
  view over CDP. Agents should quote its numbers instead of attaching screenshots for perf claims. It is opt-in (needs Edge/Chrome),
  so it stays out of `npm test`.

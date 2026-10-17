# Dev efficiency (speed and token usage)

**Changed.** `CLAUDE.md` (agent quick reference), `docs/MAP.md` (area table + generated file and 132-block index),
`tools/mapgen.js` (`npm run map`, `--print TAG`, `--check`), `tests/run.js` (tiers, `--changed`, load-aware slots,
longest-first, `@timing` retry + FLAKY report, per-file timeouts, `-q`; keeps main's "printed FAIL counts" rule),
`tests/tags.test.js`, `tools/merge-check.js`, `tools/wt.js`, `docs/AGENTS.md`, `docs/PLAN-dev-efficiency.md`, npm scripts
(`test:fast`, `test:server`, `test:all`, `test:changed`, `map`, `check`, `merge-check`, `wt`). No game code changed.

**Measured** (16 threads, other agents running):
| run | CPU busy | wall | failed files | output |
|---|---|---|---|---|
| old runner | 96 % | 146 s | 10 | 64 KB |
| new runner | 100 % | 154 s | 3 (+1 FLAKY recovered) | 4.3 KB |
| new runner | 21 % (12 slots) | 57 s | 2 | 2.2 KB |
| new, after merging main, GK_TEST_JOBS=3 | 31-77 % | 248 s | 0 of 68 | |
| `npm run test:fast` (19 files) | busy | 6.5-8.6 s | 0 | |
Lowering parallelism on a busy CPU was slower (212 s vs 114 s): the tests wait on game timers, so the runner keeps half the cores.

**Not done.** No block moved out of game.js: the only mechanical candidate (TIPS) is booked by PLAN-fun wave 1; the rest needs
`client/ctx.js`. `GK_TIME_SCALE`, test-file splits and relative CPU budgets are proposed (plan section 2).

**Merger notes.** `npm test` still runs every file. Conflicts on `docs/MAP.md`: take either side, rerun `npm run map`.
`tests/.timings.json` is git-ignored.

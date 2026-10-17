# Working as (or with) a Goblin King agent

CLAUDE.md has the commands. This page is for the parent that briefs and merges, and for agents that want the why.

## Brief template (copy, fill the brackets, keep it under ~25 lines)
```
Area: [one area, e.g. "tree room 6 activity"]. Branch/worktree: your own (node tools/wt.js <name> if you need a new one).
Goal: [2-4 sentences: the player-facing result, and what "done" looks like].
Read: CLAUDE.md, docs/MAP.md row "[area]", then [1-3 specific docs/sections]. Grep tags, do not read game.js / server.js whole.
Own: [blocks / files you may edit]. Do not touch: [busy areas from CLAUDE.md that are near yours].
Rules: small local diff in a new tagged block or new file; no new lights; Low preset must not get slower; no clutter.
Tests: add [pure test in tests/<area>.test.js | server test]; iterate with npm run test:changed; npm test once at the end.
Verify: [browser check if visible: free port, ?offline=1, console clean, at most 2 JPG screenshots].
Finish: merge main into your branch, node tools/merge-check.js main, commit (git add <files>), report in
docs/reports/<area>.md (<= 250 words). Do not merge into main, do not push.
```

## Reports (the parent reads dozens of them)
- **At most 250 words.** Measured: the 83 existing reports average 678 words; the extra words are mostly re-explained conventions.
- Fixed sections, in this order, one line each where possible: **Changed** (files + tags), **Tested** (commands + result),
  **Not tested**, **Merger notes** (conflicts, flags, follow-ups). No narrative, no restating the brief, no code dumps.
- Do not repeat known environment facts (node_modules junction, timing flakes, port collisions): they are in CLAUDE.md. If the runner
  printed `FLAKY`, write "flaky: <file>" and nothing more.
- Numbers beat adjectives: draw calls, ms, KB, test counts.

## Screenshots
- Only when the change is visible, and at most 2-3 per task. JPG, quality ~80, <= 1280 px wide (a full-size PNG averages 408 KB
  here vs 107 KB for a JPG, and costs about 1.5 k tokens every time someone views it).
- Name them `docs/screens/<area>-<what>.jpg`. Never commit a screenshot series; keep one before / after pair at most.
- Prefer numbers from the page (`renderer.info`, `npm run test:browser`, console) over a picture when the claim is about performance.

## Explore agent vs writing code
- Use a read-only **Explore** agent (cheap, fast) for "where is X / who calls Y / which files mention Z" across many files when you
  only need the answer. Give it the breadth ("quick" / "thorough") and ask for file:line results, not summaries of code.
- Do not use it to review or design: it reads excerpts. Do not use it for a single known file: Grep yourself.
- Write code yourself (or in an implementation agent) once you know the block and the test.

## Model split (memory: model-split-for-agents)
| role | model | typical size |
|---|---|---|
| parent: plan, brief, merge, review, owner-facing docs | Opus | short briefs; reads merger notes, not whole reports |
| implementer: one block or file, plus its tests | Sonnet | aim < 150 k input tokens with MAP + fast tests; 2-4x that without |
| search: where is X | Explore (read-only) | a few k tokens of answer |
Costs grow with context, so the cheapest lever is reading less: MAP + Grep + offset/limit reads, `-q` test output, no full-file reads.

## Merge checklist (parent)
1. `node tools/merge-check.js <branch>`: dry-run merge (conflicted files and hunk counts), syntax of every .js, balanced tags, fast tests.
2. `git merge --no-ff <branch>`; resolve conflicts by keeping both blocks (they are tagged); `docs/MAP.md` and `package.json` script
   lists: keep both sides, then `npm run map`.
3. `npm test` (retry output says `FLAKY` for load-sensitive files; a file that fails twice blocks the merge).
4. If client code changed: browser smoke test on a free port (`?offline=1`), console clean; `npm run test:browser` for perf work.
5. `npm run map`, commit, push. Never rebase merge commits; never `git add -A`.

## Writing tests that stay fast and stable
- Pure logic -> a pure module + a fast-tier test (no server). Most bugs are cheaper to catch there.
- Server tests: shorten timers with the existing `GK_*` knobs instead of sleeping; poll with `c.until(...)` instead of `sleep()`.
- Anything that asserts wall-clock time or CPU budget: tag `// @timing` in the first 5 lines, and prefer ratios to a reference loop
  over absolute ms (a busy machine is normal here).
- Never hard-code ports; never depend on another test file's state.

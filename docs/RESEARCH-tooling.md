# Research: tooling for faster builds and fewer tokens

Scope: what Claude agents (an Opus coordinator plus Sonnet subagents in git worktrees) can install or configure to build Goblin King faster and spend fewer tokens. This builds on the dev-efficiency work (`tools/mapgen.js` and `docs/MAP.md`, a tagged-block index, still in another worktree when this was written) and does not repeat it.

How the trials were run, 2026-10-16:
- Every candidate was installed with `npm i --ignore-scripts`, each in its own empty scratch folder outside the repo. Each was run against this worktree and measured.
- Nothing heavy is committed.
- **Timings were taken with the machine at 100% CPU** (about 32 node processes from parallel agents, 16 logical cores). Absolute seconds are therefore pessimistic. Ratios and token counts are not affected.
- Token counts below use chars / 4. repomix's o200k tokenizer counted the JS at **1.6 times that** (about 2.5 chars per token on these dense long lines), so treat every token figure here as a lower bound.

## The two facts that drive everything

1. **`game.js` is 922 KB: 9,012 lines with an average of 105 characters and a longest line of 1,028.** That is about 234k tokens by chars/4, or about 370k by the o200k count.
   - One default Read page (2,000 lines) costs about 52k tokens. `server.js` costs about 47k.
   - The root `.js` files together are 544k to 865k tokens. No agent can ever "read the code", so every saving comes from *locating before reading*.
2. **Screenshots are the other big sink.** `docs/screens` holds 389 images (57 MB, all in git).
   - At current vision pricing (ceil(w/28) x ceil(h/28)), the median JPG costs **about 1,200 tokens** and the 90th percentile about 1,900.
   - An image stays in context, so it is paid again (at cache-read rate) on every later turn.
   - A numeric check (pixel-diff %, `renderer.info`, a DOM query) costs **about 30 tokens**.

## Ranked list: saving divided by effort

| # | Tool / change | Measured on this repo | Effort | Verdict |
|---|---|---|---|---|
| 1 | **Locate-then-read discipline**: Grep `-n` (content mode), then Read with `offset/limit` of about 80 lines | "Where is X" by Grep content costs **0.2k to 1k tokens** (wrapPi 191, recycleFor 463, minimap 1,059). A 2,000-line Read of game.js costs **52k**. Grep `-C2` costs about 4 times plain content (1.0k to 3.7k). Broad terms are expensive: `sudden` returns 153 hits and 5.4k tokens. | Brief text only | **Adopt now** (already partly in BRIEF.md) |
| 2 | **`tools/symbols.js`** (new, zero deps): "where is X defined" | `npm run -s symbols -- wrapPi` prints `game.js:7544 wrapPi`, about **10 tokens**, in 0.5 s. It found 807 definitions in game.js, identical to ast-grep's 805 (0 missed). `--outline game.js` is about 2.6k tokens for every function in the file. `--big 60 game.js` lists the 15 functions of 60+ lines in about 70 tokens. | Done in this branch | **Adopt now** |
| 3 | **docs/MAP.md + tools/mapgen.js** (the dev-efficiency agent's work): an index of tagged blocks | 88 `*-BEGIN` blocks across game.js and server.js. One Grep of a tag lands on the right block. | Theirs | **Adopt now**. Fold `symbols.js --big` output into MAP if wanted. |
| 4 | **No-screenshot verification**: DOM and `renderer.info` asserts, a pixelmatch diff %, or one small JPG of 800 px wide or less only when a human-style look is the point | pixelmatch: 900x560 in 205 ms, 1000x640 in 644 ms (under load). Output is `{"diffPct":20.86}`, about 30 tokens, against about 1.2k for viewing the image. | Small | **Adopt now** for checks. Add pixelmatch as a devDependency only when a baseline test exists (see "later"). |
| 5 | **Read guard hook**, `tools/hooks/read-guard.js` (new, inactive) | Blocks a Read of `docs/screens/*` and a whole-file Read of any file over 150 KB without offset/limit. Tested: game.js gives exit 2 with advice; offset/limit or small files give exit 0; bad JSON gives exit 0. It prevents the single most expensive mistake (52k tokens) for about 0 cost. | The owner adds 6 lines of settings | **Adopt now** (owner's call, since it is persistent config) |
| 6 | **`tools/affected.js` / `npm run test:affected`** (new): test impact analysis | Replayed over the last 200 non-merge commits: **28 of 64 test files on average** (56% less work). 77 commits needed the full suite (anything in the server require graph). 38 were docs-only (0 tests). Client-only changes pick few files: `game.js` 11, `itemart.js` 4, `hud5.js` 3, a rooms5art file 1. Under load, 5 client test files took 31 s against 104 to 124 s for the full suite. | Done in this branch | **Adopt now** for iteration. `npm test` stays the finish gate. |
| 7 | **`tools/check.js` / `npm run check`** (new): conflict markers, parallel `node --check`, and JSON parse | Changed files in 0.1 to 0.2 s, the whole repo (111 js) in 1.5 s. Catches a leftover `<<<<<<<` or a duplicate `const` from a merge before a 100 s test run. | Done in this branch | **Adopt now**. Run it after every merge. Also a good pre-commit hook. |
| 8 | **Worktree `node_modules` junction** | A worktree has no `node_modules`, so the server cannot serve `/three/...`. `security.test.js` then fails with "/three/three.module.js: got 404". perfbench notes the same. One junction fixes it with no download. | 1 command per worktree | **Adopt now**: `cmd /c mklink /J node_modules ..\..\..\node_modules` from the worktree root |
| 9 | **Load-tolerant perf tests** | Under parallel-agent load, `netperf` (9.8 Hz against the required 20), `bots`/`bots5-sim` (2.9 ms sweep against the 2 ms limit) and several timing-based server tests fail. Agents then spend turns "fixing" non-bugs. | Small test change, owned by the test or perf area | **Adopt soon**. Run the suite with `GK_TEST_JOBS=4` when the box is busy. Long term, scale the budget asserts by a calibration loop, or make them opt-in under `GK_PERF_STRICT=1`. |
| 10 | **ESLint, minimal bug-only flat config** (config below) | 14 MB and 63 packages, plus `globals`. A full-repo run took 27 to 30 s under load (game.js alone 14 s). Findings: **1 real merge artefact** (`server.js:255`, a duplicated `id === 'charm'` branch: `no-dupe-else-if`, harmless), 2 globals guarded by `window.X ?` checks (false positives), 6 harmless `no-redeclare` hits of Node globals, and 203 unused-var warnings. | Medium (deps + config) | **Later**: low yield today, because node --check plus the tests catch most of it. Worth it once the refactor agent splits game.js. |
| 11 | **TypeScript `checkJs`** (TS 7.0.2, the native Go compiler, 31 MB) | Raw: game.js 4,750 errors in 19.5 s, server.js 1,085. With `--strict false` and a 2-line `globals.d.ts`: **52 errors in 10.7 s, none a real bug** (43 are DOM `Element.style`-type noise; 1 TDZ that is safe at runtime). Syntax-only over 5 files took 5.5 s, against 1.5 s for `check.js`. | Medium, and noisy | **Skip** for now. Revisit per new module with `// @ts-check` in small files only. |
| 12 | **ast-grep** (`@ast-grep/cli` 0.51, 104 MB, 2.3M downloads a week) | Structural search over game.js in about 0.9 s. Identical symbol set to `symbols.js`. | Big install | **Skip** as a dependency. A good one-off for codemods (for example renaming an API across files) through `npx @ast-grep/cli`. |
| 13 | universal-ctags | Not trialled: it is a native exe download from GitHub. symbols.js and ast-grep cover the same need. | Binary download | **Skip** |
| 14 | **repomix** and code packers (102 MB, 161 packages) | Root .js packed is **865k tokens**. `--compress` (signatures only) is **195k tokens**, and took 37 to 61 s. Either is larger than a subagent's whole working budget, and a repack invalidates the prompt cache. | Medium | **Skip**. Packers help on small repos or for one-shot web-chat questions, not for agentic Grep and Read on a 922 KB file. |
| 15 | **madge** (circular deps) | 15 files in 68 s: "No circular dependency". The client uses script-tag globals, so there is no graph to analyse. | — | **Skip** |
| 16 | **jscpd** (duplicates) | 0.04% duplicated lines (1 clone). Long packed lines also defeat line-based detection. | — | **Skip** |
| 17 | **knip** (dead code and deps) | All noise: every test and tool is reported as an "unused file" and `three` as an "unused dependency", because of globals and dynamically spawned tests. | — | **Skip** |
| 18 | esbuild as a syntax checker | All root JS in 0.6 to 1.3 s (12 MB install). It is a little faster than check.js, but node --check needs no install. | — | **Skip** (until there is a build step) |
| 19 | Semantic search MCP (claude-context, code-index-mcp, serena) | Not installed. claude-context needs an embedding API key plus Milvus. Serena needs Python/uv and LSP setup. Published savings (40%, "70%") are vendor-only claims. Here, symbols.js plus MAP tags already turn "where is X" into a 10 to 1,000 token answer. | High | **Skip**. Re-test only if a pilot `/usage` comparison shows Grep misses. |
| 20 | Playwright MCP / Chrome DevTools MCP / GitHub MCP | The repo already has raw-CDP harnesses (`tools/perfbench.js`, `tools/fullscreen-cdp.js`, `tools/r5shot.js`) that need nothing but `ws`. MCP tools are deferred by default, so the idle cost is small, but every snapshot or screenshot call is large. `gh` beats the GitHub MCP. | Medium | **Later**: Chrome DevTools MCP `--slim` only for a perf-trace deep dive. **Skip** the rest. |

### Build and test speed, other findings
- **No bundler is needed.** There is no build step: esbuild, vite and swc solve a problem this repo does not have.
- **Test runner.** `tests/run.js` already runs files in parallel (CPU/2 jobs). The cost is server boots (64 files, 847 s of total CPU in 124 s wall time under load) and a few slow files (`netperf` 48 s, `doorguard` 44 s, `elixir-sends` 39 s). vitest or node:test sharding would not help; impact analysis (#6) does. A hash cache ("skip if inputs unchanged") is the same idea as #6 with more state, so skip it.
- **Watch mode.** `node --watch server.js` is free and built in. For agents it is not useful: they run a command and read the output once.

## Headless browser harness
- **Keep raw CDP over `ws`.** It is already written, has zero extra install, and handles the real GPU via `--use-angle=d3d11`.
- If a new harness is ever needed, use **playwright-core** (13.7 MB, no browser download) with `channel: 'msedge'`. Edge is preinstalled, and you get auto-waiting, which means less flake. puppeteer-core works too.
- Never rely on SwiftShader. It is deprecated, and timings from it are useless.
- **Visual regression:** pixelmatch (37 KB plus pngjs, ISC, 10.8M downloads a week) for a few seeded fixed-camera PNGs per scene. odiff-bin is 5 to 6 times faster but uses native per-platform binaries, so it is only worth it for many full-size shots.

## three.js and game-specific tools
- **`renderer.info`** (in core) plus CDP `Performance.getMetrics` is the cheapest numeric perf check. perfbench already does this. Prefer it to screenshots.
- **stats-gl** (MIT, 4.5M downloads a week) is a CPU and GPU-time overlay. If added, load it only behind `?stats=1`. **Later.**
- **Spector.js** has a library API (`captureCanvas` gives JSON of draw calls) and can be scripted over CDP. It is useful for a draw-call deep dive. **Later**, as a one-off and not committed.
- **webgl-lint** is a single script tag that flags GL errors and unset uniforms. **Later**, debug flag only.
- **three-mesh-bvh** (peer `three >= 0.159`) only pays off for high-poly raycasts. **Skip**, since the meshes are low-poly.
- **BatchedMesh / InstancedMesh** are in core, so no helper is needed.
- **gltf-transform / meshoptimizer / KTX2 (toktx)**: **Skip** while the art is procedural. If a GLB ever lands, use `npx @gltf-transform/cli optimize in.glb out.glb --texture-compress webp`.
- **Netcode:** `tools/netsim.js` already injects latency, jitter and loss in-process. That is better than clumsy (a GUI, system-wide, needs admin) or toxiproxy (a 12 MB exe). **Skip** both.
- **Load testing:** a ws bot script beats k6 (31 MB, AGPL) and artillery (93 dependencies). `netsim --n 8` already covers it. Raise `--n` for a soak test.

## Assets
Stay procedural. It is smaller, it matches the style, and it is licence-clean. If a download clearly beats procedural work:
- Kenney, Quaternius, Poly Haven and ambientCG are CC0.
- OpenGameArt and freesound are only usable with a per-item CC0 check.
- Avoid the Sonniss GDC bundle: it is royalty-free, not CC0, and it forbids AI/ML use.

Poly Haven and ambientCG PBR files are heavy and the wrong look. For audio, ZzFX (MIT, under 1 KB) or jsfxr presets, encoded as parameters in code, fit better than sample files. Tone.js (5 MB) is too big.

## Claude Code configuration that cuts cost (from the current docs)
- **Prompt cache.**
  - It works by exact prefix: system prompt and tools, then CLAUDE.md and memory, then the conversation.
  - Each **worktree is a separate cache**, so every subagent pays its own cache write for the system prompt and brief.
  - These break the cache: switching model or `/model`, adding or removing tool definitions, a skill with a `model:` field, and opusplan toggles.
  - These keep it: editing CLAUDE.md mid-session (the edit only applies after `/clear` or `/compact`) and editing files.
  - Subagent caches live for 5 minutes, so a subagent that waits more than 5 minutes between turns (for example during a long `npm test`) pays a full re-read. Long jobs should use `run_in_background` plus a notification.
- **Prices per MTok (input / output / cache read):** Opus 5.5 4 / 20 / 0.20; Sonnet 5.5 2 / 10 / 0.10; Haiku 5.5 0.10 / 0.50 / 0.01, which reprices five times higher above 100k-token prompts. **Sonnet does implementation at half the price of Opus.** Haiku only fits small, mechanical lookups that never load big files.
- **CLAUDE.md:** keep it under 200 lines. `@imports` do not save tokens. Path-scoped `.claude/rules/*.md` load only when matching files are touched; this is a good home for "art rules" and "server rules".
- **Skills:** only the description is in context until a skill is used. Turn repeated procedures (merge-and-test, browser check, report writing) into skills instead of re-explaining them in every brief.
- **Subagents:** `.claude/agents/*.md` with `model:`, `tools:` and `effort:` frontmatter pin the routing. Explore and Plan start without CLAUDE.md, which makes them cheap.
- **Read limits:** a single Read is capped at about 25k tokens and files over 256 KB are refused whole. Paging through game.js therefore still costs about 25k per page, and the guard hook stops agents from trying.
- **Deny rules:** `Read(./docs/screens/**)` in `permissions.deny` blocks image reads as well, but not `cat` via Bash. The hook covers the Read tool, with an override.

## Agent workflow

### Brief template (about 300 tokens, replacing "read HANDOFF + FEATURES + ART + DESIGN"; those 4 docs are about 7k tokens and QUALITY-PLAN alone is 12k)
```
Area: <one line>. Files you own: <list>. Do not touch: <list>.
Find code with: Grep -n <terms> | npm run -s symbols -- <name> | docs/MAP.md tag <TAG>. Read with offset/limit (~80 lines), never whole game.js/server.js.
Done = <observable result>. Verify with: npm run check; npm run test:affected; npm test once at the end.
No screenshots unless the task is visual; then one JPG <= 800 px wide. Report <= 200 words to docs/reports/<area>.md.
```

### Rules that avoid re-reading and re-work
- **Read docs only on need.** Point to a section ("ART.md §Palette") rather than a whole document.
- **Report size.** The 94 reports average 4.2 KB, and the coordinator reads every one, so keep them to 200 words or less. Detail stays in git.
- **Explore agents.** Use them for multi-file "where/how" questions. They return conclusions instead of file dumps.
- **Batching.** Send independent tool calls in one message. Keep `npm test` in the background while writing the report.
- **Merges.**
  - Agents merge `main` into their branch first and last, then run `npm run check` (1.5 s) before `npm test`.
  - Keep new code in new files or new tagged blocks. That is the main reason merges have been mostly clean: 107 merges in 341 commits, with conflicts being rare.
  - Stagger agents that touch the same tagged block.

## Token budget per task type (proposal)
These are estimates. There are no per-agent usage logs in the repo, so they are anchored to the following:
- File sizes above.
- The two web-research subagents of this task, which used 94k and 163k tokens.
- About 100 agents and 94 reports so far.

The fixed cost per subagent (system prompt, tools, brief and first reads) is about 25 to 35k.

| Task | Typical shape | Budget (subagent, total tokens incl. cache reads) | Main waste to avoid |
|---|---|---|---|
| Bugfix (1 to 2 files) | Locate, 2 to 4 Reads of 80 lines, edit, check, affected tests | **60 to 120k**, Sonnet | Whole-file reads, a full suite per iteration |
| Feature (server + client + test) | 6 to 12 targeted Reads, new block or file, test file | **150 to 300k**, Sonnet; Opus only for design | Re-reading docs, flaky perf tests |
| Art pass (procedural meshes) | New module plus a preview page, 2 to 4 small JPG checks | **150 to 250k**, Sonnet | Screenshot loops: cap at 6 images (about 7k), prefer numeric checks |
| Perf pass | perfbench numbers before and after, a few Reads | **120 to 250k**, Sonnet or Opus | Screenshots of the frame; use `--out res.json` |
| Research / review | Web plus measurement | **150 to 300k**, Opus coordinator, Sonnet for fan-out | Pasting long outputs; run tools with `--quiet` or json output to a file |
| Coordinator per wave (14 agents) | Briefs plus reports plus merges | **about 300k** with 200-word reports and MAP | Reading full reports and diffs |

Coordinator rule: if a subagent passes about 1.5 times its budget, stop it and re-brief with the exact spot (file:line). Do not let it keep exploring.

## Adoption plan

**Week 1 (all low-risk, mostly already in this branch):**
1. Merge this branch. It adds `npm run check`, `npm run test:affected` and `npm run symbols`, and `tests/run.js` now accepts an optional file list. The defaults of `npm test` and `npm start` are unchanged.
2. Add these to BRIEF.md: the brief template above, "check, then test:affected while iterating, then npm test once at the end", and the no-screenshot rule.
3. Owner: enable the read guard and the deny rule in `.claude/settings.json` (project, committed):
   ```json
   {
     "permissions": { "deny": ["Read(./docs/screens/**)"] },
     "hooks": { "PreToolUse": [ { "matcher": "Read", "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/tools/hooks/read-guard.js\"", "timeout": 10 } ] } ] }
   }
   ```
4. Each new worktree: `cmd /c mklink /J node_modules ..\..\..\node_modules`, which fixes the security.test.js 404s.
5. Add `.claude/agents/implementer.md` (`model: sonnet`, `effort: medium`) and `.claude/agents/designer.md` (`model: opus`) so the routing is fixed rather than re-decided each time.
6. Pre-commit (optional, no dependency): `git config core.hooksPath .githooks`, with `.githooks/pre-commit` containing `node tools/check.js || exit 1`. lefthook and husky add nothing a 1-line hook does not.

**Later:**
- Make perf asserts load-tolerant (`GK_PERF_STRICT`).
- pixelmatch baselines for 3 to 5 seeded perfbench views (devDependency `pixelmatch@8`, `npm run test:visual`, opt-in).
- ESLint with the config below once game.js is split.
- stats-gl and webgl-lint behind `?stats=1` / `?gldebug=1`.
- Chrome DevTools MCP `--slim` for trace deep dives.
- Path-scoped `.claude/rules/` for art and server conventions.

**Skip:** repomix, madge, jscpd, knip, TypeScript checkJs (for now), ctags, embedding MCPs, filesystem/ripgrep/GitHub MCP, bundlers, k6/artillery/clumsy/toxiproxy, gltf/KTX tooling, and Tone.js.

### ESLint config, for when it is adopted (`eslint.config.mjs`, devDependencies `eslint@10`, `globals`)
```js
import globals from 'globals';
const gk = Object.fromEntries('GK GKAUDIO GKVFX GKITEMS GKHOMEW GKACT5 GKART HUD5 GKHUD5 GKRULES GKLOOT GKSAVE GKSTATS GKSTATSUI GKHOMEUI GKUSE GKUSE2 GKICONS GKHEAD GKFS GK_OFFLINE THREE'.split(' ').map(k => [k, 'writable']));
const rules = { 'no-undef': 'error', 'no-redeclare': ['error', { builtinGlobals: false }], 'no-dupe-keys': 'error', 'no-duplicate-case': 'error', 'no-dupe-else-if': 'error',
  'no-unreachable': 'error', 'no-self-assign': 'error', 'no-const-assign': 'error', 'no-func-assign': 'error', 'use-isnan': 'error', 'valid-typeof': 'error', 'no-self-compare': 'error' };
export default [
  { ignores: ['node_modules/**', 'docs/**', '.claude/**'] },
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser, ...globals.node, ...gk } }, rules },
  { files: ['itemart.js', 'rooms5art-*.js', 'client/**/*.js'], languageOptions: { sourceType: 'module' } },
];
```
Script: `"lint": "eslint --cache --quiet ."`.

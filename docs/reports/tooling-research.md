# Report: tooling and token-efficiency research

The full findings are in docs/RESEARCH-tooling.md, which ranks about 20 tools by measured saving divided by effort.

**Added to this branch** (no new dependencies; the defaults of `npm test` and `npm start` are unchanged):
- `tools/affected.js` and `npm run test:affected`: test impact analysis. Replayed over 200 commits, it picks 28 of 64 test files on average. Client-only changes pick 1 to 11 files.
- `tests/run.js` accepts an optional list of test files.
- `tools/check.js` and `npm run check`: finds conflict markers, runs `node --check` in parallel and parses JSON. The whole repo takes 1.5 s.
- `tools/symbols.js` and `npm run symbols -- NAME`: answers "where is X defined" in about 10 tokens. On game.js it matched ast-grep's symbols exactly.
- `tools/hooks/read-guard.js`: a PreToolUse hook that blocks screenshot reads and whole-file reads of files over 150 KB. It is **inactive**; the owner turns it on with the settings snippet in the research doc.

**Key numbers:**
- game.js is about 234k to 370k tokens. One 2,000-line Read of it is about 52k tokens.
- A median screenshot costs about 1.2k tokens; a numeric diff costs about 30.
- repomix output is 865k tokens, or 195k compressed. Skip it.
- TypeScript checkJs: 52 errors, none real. ESLint: 1 harmless merge artefact (a duplicated `charm` branch at `server.js:255`).

**For the merger:**
- Under parallel-agent load these perf and timing tests fail: netperf, bots, bots5-sim, useplus, utility, elixir-home and netcode.
- `security.test.js` fails in any worktree without `node_modules`. A junction fixes it.
- I did not activate any Claude Code configuration.

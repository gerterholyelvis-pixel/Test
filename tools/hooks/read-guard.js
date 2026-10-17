// tools/hooks/read-guard.js: Claude Code PreToolUse hook (NOT active until the owner adds it to .claude/settings.json, see
// docs/RESEARCH-tooling.md). Blocks the two reads that waste the most tokens in this repo:
//   1. an image under docs/screens/ (each costs ~1.2k tokens and stays in context; use the report text or a numeric check instead)
//   2. a whole-file Read of a big source file (game.js is ~940 KB: one 2000-line page is ~50k tokens) without offset/limit
// Exit 2 + stderr = block, and the reason is shown to the model. Anything unexpected -> exit 0 (never break a session).
let raw = '';
process.stdin.on('data', d => raw += d).on('end', () => {
  try {
    const j = JSON.parse(raw), t = j.tool_input || {}, f = String(t.file_path || '').replace(/\\/g, '/');
    if (j.tool_name !== 'Read' || !f) process.exit(0);
    if (process.env.GK_READ_GUARD === 'off') process.exit(0);
    if (/\/docs\/screens\/[^/]+\.(png|jpe?g|webp)$/i.test(f)) {
      process.stderr.write('read-guard: screenshots cost ~1.2k tokens each and stay in context. Read the matching docs/reports/*.md text, or check numbers (renderer.info, DOM) instead. Set GK_READ_GUARD=off to override.\n');
      process.exit(2);
    }
    const size = require('fs').statSync(f).size;
    if (size > 150000 && t.limit == null && t.offset == null) {
      process.stderr.write(`read-guard: ${f.split('/').pop()} is ${Math.round(size / 1024)} KB. Find the spot first (Grep -n, node tools/symbols.js NAME, docs/MAP.md tags), then Read with offset/limit (about 80 lines).\n`);
      process.exit(2);
    }
  } catch (e) { /* fall through */ }
  process.exit(0);
});

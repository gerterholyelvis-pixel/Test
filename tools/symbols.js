// tools/symbols.js: zero-dependency symbol finder for the big files. Answers "where is X defined" in ~50 tokens instead of a Grep that
// returns whole 1000-char lines, or a 2000-line Read (~50k tokens of game.js). Regex based (function / const|let|var = arrow|function),
// it finds definitions packed several to a line too. Complements docs/MAP.md (tagged blocks); this is the per-function level.
//   node tools/symbols.js wrapPi              definitions whose name matches /wrapPi/i in every root .js + client/**  -> file:line name
//   node tools/symbols.js '^build' game.js    restrict to files
//   node tools/symbols.js --outline game.js   every definition of a file, one line per source line (name:line, compact)
//   node tools/symbols.js --big 40 game.js    only functions of 40+ lines, with their length (a map of where the bulk is)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const DEF = /(?:^|[^\w$.])(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^()]*(?:\([^()]*\)[^()]*)*\)\s*=>|[A-Za-z_$][\w$]*\s*=>))/g;

function srcFiles() {
  const out = fs.readdirSync(ROOT).filter(f => f.endsWith('.js'));
  const walk = d => { if (!fs.existsSync(path.join(ROOT, d))) return; for (const f of fs.readdirSync(path.join(ROOT, d))) { const r = d + '/' + f; if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r); else if (f.endsWith('.js')) out.push(r); } };
  walk('client');
  return out.sort();
}
// rough body length: from the definition line, track brace depth until it returns to the starting depth (strings/regex not parsed: a hint only)
function bodyLen(lines, i, col) {
  let depth = 0, seen = false;
  for (let k = i; k < lines.length && k < i + 4000; k++) {
    const s = k === i ? lines[k].slice(col) : lines[k];
    for (const ch of s) { if (ch === '{') { depth++; seen = true; } else if (ch === '}') { depth--; if (seen && depth <= 0) return k - i + 1; } }
    if (!seen && k > i) return 1;
  }
  return 1;
}
function symbols(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/), res = [];
  lines.forEach((ln, i) => { for (const m of ln.matchAll(DEF)) res.push({ file, line: i + 1, name: m[1] || m[2], col: m.index }); });
  return { res, lines };
}

if (require.main === module) {
  const a = process.argv.slice(2), flag = k => { const i = a.indexOf('--' + k); if (i < 0) return null; const v = a[i + 1]; a.splice(i, /^\d+$/.test(v || '') ? 2 : 1); return /^\d+$/.test(v || '') ? +v : true; };
  const outline = flag('outline'), big = flag('big');
  const files = a.filter(x => x.endsWith('.js')), pat = a.find(x => !x.endsWith('.js'));
  const list = files.length ? files : srcFiles();
  const re = pat ? new RegExp(pat, 'i') : null;
  for (const f of list) {
    const { res, lines } = symbols(f);
    if (outline) { const by = {}; for (const s of res) (by[s.line] = by[s.line] || []).push(s.name); console.log(f + ': ' + Object.entries(by).map(([l, n]) => n.join(',') + ':' + l).join(' ')); continue; }
    if (big) { console.log(f + ': ' + res.map(s => [s, bodyLen(lines, s.line - 1, s.col)]).filter(([, n]) => n >= big).map(([s, n]) => s.name + ':' + s.line + '+' + n).join(' ')); continue; }
    for (const s of res) if (!re || re.test(s.name)) console.log(f + ':' + s.line + ' ' + s.name);
  }
}
module.exports = { symbols, srcFiles };

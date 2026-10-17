// tools/check.js: a seconds-long gate to run before a commit or after a merge (zero deps): 1) no git conflict markers left in text files,
// 2) every .js parses (node --check, in parallel), 3) JSON parses. Catches the merge breakages that otherwise cost a full `npm test` run
// (about 30-100 s) or a browser session to find. `npm test` is still the real gate.
//   node tools/check.js          files changed since the merge base with main + uncommitted + untracked
//   node tools/check.js --all    every tracked .js/.html/.md/.json file
// Exit 1 with file:line for each problem. Suitable for a pre-commit hook: `node tools/check.js || exit 1`.
const fs = require('fs'), path = require('path'), { execFileSync, spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } };
const all = process.argv.includes('--all');
let files;
if (all) files = git('ls-files');
else { const base = git('merge-base', 'HEAD', 'main').trim() || 'HEAD'; files = git('diff', '--name-only', base) + git('ls-files', '--others', '--exclude-standard'); }
files = [...new Set(files.split(/\r?\n/).filter(f => /\.(js|mjs|cjs|html|md|json|css)$/.test(f) && !f.startsWith('node_modules/') && fs.existsSync(path.join(ROOT, f))))];
const bad = [], t0 = Date.now();
const MARK = /^(<{7}|={7}|>{7}|\|{7})(?: |$)/;
for (const f of files) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  text.split(/\r?\n/).forEach((l, i) => { if (MARK.test(l)) bad.push(f + ':' + (i + 1) + ' conflict marker ' + l.slice(0, 12)); });
  if (f.endsWith('.json')) try { JSON.parse(text); } catch (e) { bad.push(f + ' invalid JSON: ' + e.message.slice(0, 80)); }
}
const js = files.filter(f => /\.(js|mjs|cjs)$/.test(f));
const LIMIT = Math.max(2, require('os').cpus().length >> 1); let next = 0;
const one = f => new Promise(res => { let err = ''; const p = spawn(process.execPath, ['--check', path.join(ROOT, f)], { stdio: ['ignore', 'ignore', 'pipe'] });
  p.stderr.on('data', d => err += d); p.on('exit', c => { if (c) { const m = err.match(/:(\d+)\r?\n[\s\S]*?\n(\w*Error: .*)/); bad.push(f + (m ? ':' + m[1] + ' ' + m[2] : ' does not parse: ' + err.split('\n').slice(0, 2).join(' '))); } res(); }); });
const worker = async () => { while (next < js.length) await one(js[next++]); };
Promise.all(Array.from({ length: LIMIT }, worker)).then(() => {
  for (const b of bad) console.log('  FAIL  ' + b);
  console.log((bad.length ? bad.length + ' problem(s)' : 'check ok') + ': ' + files.length + ' files (' + js.length + ' js) in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(bad.length ? 1 : 0);
});

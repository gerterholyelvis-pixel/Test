// tools/affected.js: test impact analysis. Picks the tests/*.test.js files a change can break, so an agent iterating on a client-only
// change (art, HUD, menus) runs a handful of test files instead of the whole suite. `npm test` stays the gate before you finish.
//   node tools/affected.js                 list affected test files for: changes since the merge base with main + uncommitted changes
//   node tools/affected.js --base HEAD~3   compare against another ref
//   node tools/affected.js --run           run them through tests/run.js (same parallel runner, same output)
//   node tools/affected.js --why           also print why each test was picked
// Rules (zero deps, no cache): a change to server.js or anything it require()s (transitive), tests/lib.js, tests/run.js or package*.json
// means ALL tests (every server test boots server.js). Otherwise a test is picked when it names a changed file (e.g. read('game.js'),
// require('../hud5.js'), '/index.html'), and a changed test file always runs. Docs, images and tools/ outside the server graph pick nothing.
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), TESTS = path.join(ROOT, 'tests');
const arg = k => process.argv.indexOf('--' + k), has = k => arg(k) >= 0;
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } };
const rel = f => path.relative(ROOT, f).replace(/\\/g, '/');

function changedFiles() {
  const base = has('base') ? process.argv[arg('base') + 1] : (git('merge-base', 'HEAD', 'main').trim() || 'HEAD');
  const out = git('diff', '--name-only', base) + git('ls-files', '--others', '--exclude-standard');
  return [...new Set(out.split(/\r?\n/).filter(Boolean))];
}
const cache = {}, read = f => cache[f] != null ? cache[f] : (cache[f] = fs.readFileSync(f, 'utf8'));
// require() closure of an entry file (relative requires only)
function closure(entry, seen = new Set()) {
  const f = path.join(ROOT, entry); if (seen.has(rel(f)) || !fs.existsSync(f)) return seen; seen.add(rel(f));
  const src = read(f);
  for (const m of src.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    let r = path.join(path.dirname(f), m[1]); if (!r.endsWith('.js') && !r.endsWith('.json')) r += '.js';
    closure(rel(r), seen);
  }
  return seen;
}
function affected(changed) {
  const tests = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js')).sort();
  const all = new Set([...closure('server.js'), 'tests/lib.js', 'tests/run.js', 'package.json', 'package-lock.json']);
  const why = {};
  const hitAll = changed.filter(f => all.has(f));
  if (hitAll.length) { for (const t of tests) why[t] = 'server graph: ' + hitAll.slice(0, 3).join(', '); return why; }
  // a test's text = its own source + the tools/ helpers it requires (tests/netperf.test.js -> tools/netsim.js reads game.js)
  const src = Object.fromEntries(tests.map(t => [t, [...closure('tests/' + t)].filter(f => !all.has(f)).map(f => read(path.join(ROOT, f))).join('\n')]));
  for (const c of changed) {
    if (c.startsWith('tests/') && c.endsWith('.test.js') && src[path.basename(c)] != null) { why[path.basename(c)] = 'test changed'; continue; }
    if (!/\.(js|html|css|json)$/.test(c) || c.startsWith('docs/')) continue;
    const base = path.basename(c), re = new RegExp('[\'"`/]' + base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\'"`]');
    for (const t of tests) if (re.test(src[t])) why[t] = why[t] || 'names ' + c;
  }
  return why;
}

if (require.main === module) {
  const changed = changedFiles(), why = affected(changed), list = Object.keys(why).sort();
  const total = fs.readdirSync(TESTS).filter(f => f.endsWith('.test.js')).length;
  console.log(`${changed.length} changed file(s) -> ${list.length} of ${total} test files`);
  if (has('why')) for (const t of list) console.log('  ' + t + '  (' + why[t] + ')'); else if (list.length) console.log('  ' + list.join(' '));
  if (has('run') && list.length) process.exit(spawnSync(process.execPath, [path.join(TESTS, 'run.js'), ...list], { stdio: 'inherit' }).status);
}
module.exports = { affected, closure };

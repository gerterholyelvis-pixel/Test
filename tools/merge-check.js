// tools/merge-check.js: the cheap gate before (and after) a merge. Read-only: it never changes the working tree or any branch.
//   node tools/merge-check.js                 syntax of every .js + balanced block tags + the fast test tier
//   node tools/merge-check.js BRANCH          also a dry-run merge of BRANCH into HEAD (git merge-tree): conflicted files, by hunk count
//   node tools/merge-check.js BRANCH --full   ... and the full test suite instead of the fast tier
//   node tools/merge-check.js --syntax        syntax + tags only (npm run check)
//   --changed                                 run the tests affected by HEAD vs main (tests/run.js --changed) instead of the fast tier
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), args = process.argv.slice(2), has = f => args.includes(f), branch = args.find(a => !a.startsWith('-'));
let bad = 0; const say = (ok, msg) => { console.log((ok ? '  ok    ' : '  FAIL  ') + msg); if (!ok) bad++; };
const git = a => { const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' }); return { code: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };

// 1. syntax: CommonJS / classic files with node --check; files that use import/export (game.js and client/**) as ES modules
const list = [...fs.readdirSync(ROOT).filter(f => f.endsWith('.js')), ...fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.js')).map(f => 'tests/' + f), ...fs.readdirSync(path.join(ROOT, 'tools')).filter(f => f.endsWith('.js')).map(f => 'tools/' + f)];
const walk = d => { if (fs.existsSync(path.join(ROOT, d))) for (const f of fs.readdirSync(path.join(ROOT, d))) { const r = d + '/' + f; if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r); else if (f.endsWith('.js')) list.push(r); } };
walk('client');
const syntaxBad = [];
for (const f of list) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8'), esm = /^\s*(import|export)\s/m.test(src);
  const r = esm ? spawnSync(process.execPath, ['--input-type=module', '--check'], { input: src, encoding: 'utf8' }) : spawnSync(process.execPath, ['--check', path.join(ROOT, f)], { encoding: 'utf8' });
  if (r.status !== 0) syntaxBad.push(f + (esm ? ' (module)' : '') + ': ' + (r.stderr || '').split('\n').filter(Boolean).slice(0, 4).join(' / '));
}
say(!syntaxBad.length, 'syntax of ' + list.length + ' .js files' + (syntaxBad.length ? '\n         ' + syntaxBad.join('\n         ') : ''));

// 2. block tags: every X-BEGIN has its X-END
const tags = spawnSync(process.execPath, [path.join(__dirname, 'mapgen.js'), '--check'], { encoding: 'utf8' });
say(tags.status === 0, (tags.stdout || '').trim().split('\n').join('\n         '));

// 3. dry-run merge (nothing is written: merge-tree computes the result in the object store only)
if (branch) {
  const mt = git(['merge-tree', '--write-tree', '--name-only', '--no-messages', 'HEAD', branch]);
  if (mt.code === 0) say(true, 'merge of ' + branch + ' into HEAD is clean');
  else if (mt.code === 1) {
    const files = mt.out.split('\n').slice(1).filter(Boolean), uniq = [...new Set(files)];
    const tree = mt.out.split('\n')[0], hunks = uniq.map(f => { const t = git(['show', tree + ':' + f]); return f + ' (' + ((t.out.match(/^<{7} /gm) || []).length) + ' conflict hunks)'; });
    say(false, 'merge of ' + branch + ' conflicts in ' + uniq.length + ' file(s):\n         ' + hunks.join('\n         ') + '\n         docs/MAP.md conflicts: take either side, then `node tools/mapgen.js`. CRLF: the repo stores LF; never commit a whole-file EOL flip.');
  } else say(false, 'git merge-tree failed: ' + (mt.err || mt.out));
  const ahead = git(['rev-list', '--count', 'HEAD..' + branch]).out, stat = git(['diff', '--shortstat', 'HEAD...' + branch]).out;
  console.log('         ' + branch + ': ' + ahead + ' commit(s) not in HEAD; ' + stat);
}

// 4. tests
if (!has('--syntax')) {
  const targs = has('--full') ? [] : has('--changed') ? ['--changed', '-q'] : ['--tier', 'fast', '-q'];
  console.log('\nnode tests/run.js ' + targs.join(' '));
  const t = spawnSync(process.execPath, [path.join(ROOT, 'tests', 'run.js'), ...targs], { stdio: 'inherit' });
  say(t.status === 0, 'tests (' + (targs.join(' ') || 'full suite') + ')');
}
console.log(bad ? '\nmerge-check: ' + bad + ' problem(s)' : '\nmerge-check: all good');
process.exit(bad ? 1 : 0);

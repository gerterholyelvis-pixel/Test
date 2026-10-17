// npm test: runs every tests/*.test.js in parallel (each starts its own server on a free port); exits non-zero if any fails.
// Options (all optional; `npm test` with none runs everything, exactly like before):
//   --tier fast|server|slow|all  fast = pure/unit files (no server), server = files that spawn server.js, slow = long simulations;
//                            a comma list works (--tier server,slow); default all
//   --changed[=REF]          only the files affected by what changed since REF (default: merge-base with main) plus uncommitted edits;
//                            --dry prints the picked files without running them
//   --jobs N                 parallel files (also GK_TEST_JOBS); default: half the cores, up to 3/4 (max 12) when the CPU is idle.
//                            GK_TEST_TIMING_JOBS=N caps how many @timing files run at once (default: no cap)
//   -q / --quiet             print only failures, flaky retries and the summary (also GK_TEST_QUIET=1)
//   --no-retry               do not retry @timing files (also GK_TEST_RETRY=0); --retry-all retries every failed file once
//   --list                   print each file's tier / tags / last time and exit
//   NAME ...                 only files whose name contains NAME (e.g. `node tests/run.js bots vault`)
// Tags, in the first 5 lines of a test file (or in TAGS below for files owned by busy agents):
//   // @tier fast|server|slow   override the inferred tier (a file that calls startServer( or spawn( is `server`)
//   // @timing             asserts wall-clock timing / load-sensitive behaviour: retried once (in the next free slot) if it fails
//   // @timeout 120        per-file timeout in seconds (default 60, or GK_TEST_TIMEOUT)
const { spawn, execFileSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..'), TIMES = path.join(__dirname, '.timings.json');
// Known load-sensitive files (docs/reports: bot tick cost, refused moves, sprinter speed check, regen timing, gang cap, hunt timing).
const TAGS = { 'bots.test.js': '@timing', 'bots-ai.test.js': '@timing', 'bots-combat.test.js': '@timing', 'security.test.js': '@timing', 'combat.test.js': '@timing',
  'netcode.test.js': '@timing', 'balance.test.js': '@timing', 'utility.test.js': '@timing', 'armour3.test.js': '@timing', 'fun.test.js': '@timing', 'elixir-home.test.js': '@timing',
  'bots5-sim.test.js': '@timing @tier slow' };   // 30 s of simulated matches plus a per-sweep CPU budget: not a unit test

const argv = process.argv.slice(2), has = f => argv.includes(f), val = (f, d) => { const a = argv.find(x => x === f || x.startsWith(f + '=')); if (!a) return d; if (a.includes('=')) return a.split('=').slice(1).join('='); const v = argv[argv.indexOf(a) + 1]; return v && !v.startsWith('-') ? v : d; };
const tier = val('--tier', 'all'), quiet = has('-q') || has('--quiet') || process.env.GK_TEST_QUIET === '1';
const retryMode = has('--no-retry') || process.env.GK_TEST_RETRY === '0' ? 'none' : has('--retry-all') ? 'all' : 'timing';
const valued = new Set(['--tier', '--jobs']); const names = argv.filter((a, i) => !a.startsWith('-') && !valued.has(argv[i - 1]));

function meta(f) {
  const src = fs.readFileSync(path.join(__dirname, f), 'utf8'), head = src.split('\n').slice(0, 5).join('\n') + ' ' + (TAGS[f] || '');
  const t = head.match(/@tier\s+(fast|server|slow)/), to = head.match(/@timeout\s+(\d+)/);
  return { f, src, tier: t ? t[1] : /\b(startServer|spawn)\(/.test(src) ? 'server' : 'fast', timing: /@timing\b/.test(head), timeout: (to ? +to[1] : +process.env.GK_TEST_TIMEOUT || 60) * 1000 };
}
let files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(meta);
let last = {}; try { last = JSON.parse(fs.readFileSync(TIMES, 'utf8')); } catch (e) {}

if (has('--list')) { for (const m of files) console.log(m.f.padEnd(28), m.tier.padEnd(7), (m.timing ? '@timing' : '').padEnd(8), last[m.f] ? (last[m.f] / 1000).toFixed(1) + ' s' : ''); process.exit(0); }
if (tier !== 'all') { const want = tier.split(','); files = files.filter(m => want.includes(m.tier)); }
if (names.length) files = files.filter(m => names.some(n => m.f.includes(n)));

// --changed: map changed paths to the test files they can affect
if (argv.some(a => a === '--changed' || a.startsWith('--changed='))) {
  const git = a => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; } };
  const cv = argv.find(a => a.startsWith('--changed=')), ref = (cv && cv.slice(10)) || git(['merge-base', 'HEAD', 'main']) || 'HEAD';
  const changed = new Set([...git(['diff', '--name-only', ref]).split('\n'), ...git(['ls-files', '--others', '--exclude-standard']).split('\n')].filter(Boolean).map(s => s.replace(/\\/g, '/')));
  // A test is picked when it names the changed module, or names a root module that require()s it (transitively, server.js excluded).
  // CORE files (server.js and the shared world / item tables) pick every server-tier test. The full suite at merge time is the safety net.
  const CORE = new Set(['server.js', 'world.js', 'items.js']), roots = fs.readdirSync(ROOT).filter(f => f.endsWith('.js') && f !== 'server.js');
  const reqs = {}; for (const f of roots) reqs[f] = [...fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/require\(\s*['"]\.\/([\w./-]+?)(?:\.js)?['"]\s*\)/g)].map(m => m[1] + '.js');
  const users = mod => { const out = new Set([mod]); let grew = true; while (grew) { grew = false; for (const f of roots) if (!out.has(f) && reqs[f].some(r => out.has(r))) { out.add(f); grew = true; } } return out; };
  const mentions = (src, base) => new RegExp('(\\.\\./|/)' + base.replace(/\.js$/, '').replace(/[-.]/g, '\\$&') + "(\\.js)?['\"`]|\\b" + base.replace(/[-.]/g, '\\$&') + '\\b').test(src);
  const pick = new Map(), add = (m, why) => { if (!pick.has(m.f)) pick.set(m.f, why); };
  for (const c of changed) {
    const base = path.basename(c);
    if (c.startsWith('tests/') && base.endsWith('.test.js')) { const m = files.find(x => x.f === base); if (m) add(m, 'edited'); continue; }
    if (c === 'tests/lib.js' || c === 'tests/run.js' || c === 'package.json' || c === 'package-lock.json') { files.forEach(m => add(m, c)); continue; }
    if (c.startsWith('docs/') || c.startsWith('tools/') && !files.some(m => m.src.includes(c))) continue;
    if (CORE.has(c)) for (const m of files) if (m.tier !== 'fast') add(m, base + ' (core)');
    for (const u of c.includes('/') ? [c] : users(base)) for (const m of files) if (mentions(m.src, path.basename(u))) add(m, u === base ? 'mentions ' + base : 'via ' + u);
  }
  files = files.filter(m => pick.has(m.f));
  console.log('changed since ' + ref.slice(0, 10) + ': ' + (changed.size ? [...changed].slice(0, 12).join(', ') + (changed.size > 12 ? ' (+' + (changed.size - 12) + ')' : '') : 'nothing') + '\n' + (files.length ? files.length + ' test files: ' + files.map(m => m.f.replace('.test.js', '') + ' (' + pick.get(m.f) + ')').join(', ') : 'no test file is affected'));
  if (!files.length || has('--dry')) process.exit(0);
}

// Load-aware parallelism: sample how busy the CPU already is (other agents' servers and suites) and leave it room.
function cpuBusy(ms) { const snap = () => os.cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.all += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, all: 0 }); const a = snap(); return new Promise(r => setTimeout(() => { const b = snap(), all = b.all - a.all; r(all > 0 ? 1 - (b.idle - a.idle) / all : 0); }, ms)); }

const runOne = (m, attempt) => new Promise(res => {
  let out = ''; const t0 = Date.now(), p = spawn(process.execPath, [path.join(__dirname, m.f)], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GK_TEST_ATTEMPT: String(attempt) } });
  const kill = setTimeout(() => { out += '  FAIL  ' + m.f + ': timed out after ' + m.timeout / 1000 + ' s\n'; p.kill(); }, m.timeout);
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('exit', code => { clearTimeout(kill); res({ ...m, code: code === 0 ? 0 : 1, out, ms: Date.now() - t0 }); });
});
// At most `jobs` files at once (optionally at most `tcap` @timing files at once). A failed @timing file is retried once, straight away
// in a free slot, so the retry overlaps the tail of the run instead of adding to it.
function pool(list, jobs, tcap, canRetry) {
  const todo = list.map(m => [m, 1]), rs = [], firstFail = {}; let run = 0, trun = 0;
  return new Promise(done => {
    const pump = () => {
      while (run < jobs && todo.length) {
        const i = todo.findIndex(([m]) => !m.timing || trun < tcap); if (i < 0) break;
        const [m, attempt] = todo.splice(i, 1)[0]; run++; if (m.timing) trun++;
        runOne(m, attempt).then(r => {
          run--; if (m.timing) trun--;
          if (r.code && attempt === 1 && canRetry(m)) { firstFail[m.f] = r; todo.unshift([m, 2]); if (!quiet) console.log('  retry ' + m.f + ' (failed after ' + (r.ms / 1000).toFixed(1) + ' s)'); }
          else rs.push(r);
          pump();
        });
      }
      if (!run && !todo.length) done({ rs, firstFail });
    };
    pump();
  });
}
const failLines = out => out.split('\n').filter(l => /^\s*FAIL\b/.test(l) || /^\s{6,}\S/.test(l) && !/^\s*ok\b/.test(l)).slice(0, 8).join('\n');

(async () => {
  const t0 = Date.now(), cores = os.cpus().length, dflt = Math.max(2, Math.floor(cores / 2));
  // Load-aware: most server tests wait on game timers, so fewer slots only stretch the run (measured: 6 slots + a 2-file @timing cap
  // took 212 s on a 100%-busy machine where 8 plain slots took 114 s). On an idle machine use more slots; on a busy one keep the default.
  const busy = await cpuBusy(400);
  let jobs = +val('--jobs', 0) || +process.env.GK_TEST_JOBS || 0;
  if (!jobs) jobs = busy < 0.3 ? Math.max(dflt, Math.min(12, Math.floor(cores * 0.75))) : dflt;
  const tcap = Math.min(jobs, +process.env.GK_TEST_TIMING_JOBS || jobs);
  console.log('running ' + files.length + ' test files, ' + jobs + ' in parallel' + (tcap < jobs ? ', at most ' + tcap + ' @timing at once' : '') + ' (CPU ' + Math.round(busy * 100) + '% busy before start)');
  // longest first (times from the last run), so one slow file does not start last and set the wall time
  const order = files.slice().sort((a, b) => (last[b.f] || (b.tier === 'server' ? 5000 : 500)) - (last[a.f] || (a.tier === 'server' ? 5000 : 500)));
  const { rs: all, firstFail } = await pool(order, jobs, tcap, m => retryMode === 'all' || retryMode === 'timing' && m.timing);
  const rs = all.sort((a, b) => a.f < b.f ? -1 : 1), flaky = rs.filter(r => !r.code && firstFail[r.f]);
  for (const r of rs) if (!quiet || r.code) process.stdout.write(r.out);
  for (const r of rs) if (r.code && firstFail[r.f]) console.log('  (' + r.f + ' failed twice: a real failure, or the machine is far too busy for its timing budget)');
  for (const fl of flaky) console.log('\n  FLAKY ' + fl.f + ': failed on the first run (' + (firstFail[fl.f].ms / 1000).toFixed(1) + ' s), passed on the retry. First failure:\n' + failLines(firstFail[fl.f].out));
  try { const t = { ...last }; for (const r of rs) t[r.f] = (firstFail[r.f] || r).ms; fs.writeFileSync(TIMES, JSON.stringify(t, null, 0)); } catch (e) {}
  const slow = rs.slice().sort((a, b) => b.ms - a.ms).slice(0, 8).map(r => r.f.replace('.test.js', '') + ' ' + (r.ms / 1000).toFixed(1));
  const bad = rs.filter(r => r.code);
  console.log('\nslowest (s): ' + slow.join(', '));
  console.log((bad.length ? 'FAILED: ' + bad.map(r => r.f).join(', ') : 'all ' + rs.length + ' test files passed') + (flaky.length ? ' (' + flaky.length + ' flaky, passed on retry: ' + flaky.map(x => x.f).join(', ') + ')' : '') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(bad.length ? 1 : 0);
})();

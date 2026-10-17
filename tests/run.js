// npm test: runs every tests/*.test.js in parallel (each starts its own server on a free port); exits non-zero if any fails.
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort(), t0 = Date.now();
const LIMIT = Math.max(2, +process.env.GK_TEST_JOBS || Math.floor(require('os').cpus().length / 2)); let next = 0;   // cap parallel files (override with GK_TEST_JOBS)
const runOne = f => new Promise(res => {
  let out = ''; const p = spawn(process.execPath, [path.join(__dirname, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const kill = setTimeout(() => { out += '  FAIL  ' + f + ': timed out after 60 s\n'; p.kill(); }, 60000);
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('exit', code => { clearTimeout(kill); res({ f, code: code === 0 && !/^\s*FAIL\s/m.test(out) ? 0 : 1, out }); });   // QA-FULL: a printed FAIL counts even when the file forgot to exit non-zero (fskeep, hud5 did)
});
const worker = async out => { while (next < files.length) out.push(await runOne(files[next++])); };
Promise.all(Array.from({ length: LIMIT }, () => { const o = []; return worker(o).then(() => o); })).then(parts => {
  const rs = [].concat(...parts).sort((a, b) => a.f < b.f ? -1 : 1);
  for (const r of rs) process.stdout.write(r.out);
  const bad = rs.filter(r => r.code);
  console.log('\n' + (bad.length ? 'FAILED: ' + bad.map(r => r.f).join(', ') : 'all ' + rs.length + ' test files passed') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(bad.length ? 1 : 0);
});

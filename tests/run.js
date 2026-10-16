// npm test: runs every tests/*.test.js in parallel (each starts its own server on a free port); exits non-zero if any fails.
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort(), t0 = Date.now();
Promise.all(files.map(f => new Promise(res => {
  let out = ''; const p = spawn(process.execPath, [path.join(__dirname, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const kill = setTimeout(() => { out += '  FAIL  ' + f + ': timed out after 60 s\n'; p.kill(); }, 60000);
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => out += d);
  p.on('exit', code => { clearTimeout(kill); res({ f, code: code === 0 ? 0 : 1, out }); });
}))).then(rs => {
  for (const r of rs) process.stdout.write(r.out);
  const bad = rs.filter(r => r.code);
  console.log('\n' + (bad.length ? 'FAILED: ' + bad.map(r => r.f).join(', ') : 'all ' + rs.length + ' test files passed') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  process.exit(bad.length ? 1 : 0);
});

#!/usr/bin/env node
// SOAK (docs/reports/release-2.md): many simultaneous matches on one server, reporting tick time and memory over time. No browser: each match is one scripted human alone in its own private room (the other seven seats are the
// server's bots) that readies up, then wanders in place and sends the odd emote / quick chat. The numbers come from /healthz (tickMs = mean tick work since start, tickMaxMs, heapMb, rssMb).
//   node tools/soak.js [--matches 20] [--secs 120] [--sample 10] [--max-tick 25] [--max-heap-growth 120] [--port N]
// Exit 1 when the mean tick exceeds --max-tick ms (the budget is 50 ms at 20 Hz) or the heap grew more than --max-heap-growth MB between the first and last quarter (a leak signal;
// V8 heap is noisy, so read the printed series, not just the verdict). Uses GK_DEBUG=1 on a private server (per-IP caps off); it never touches a running server.
const path = require('path'), http = require('http'), net = require('net'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), WS = require(require.resolve('ws', { paths: [ROOT] }));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const N = +arg('matches', 20), SECS = +arg('secs', 120), SAMPLE = +arg('sample', 10), MAXTICK = +arg('max-tick', 25), MAXHEAP = +arg('max-heap-growth', 120);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const health = port => new Promise(res => http.get({ host: '127.0.0.1', port, path: '/healthz' }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(null); } }); }).on('error', () => res(null)));

(async () => {
  const port = +arg('port', 0) || await freePort();
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), GK_DEBUG: '1', GK_MATCH_SIZE: '8', GK_QUEUE_MS: '400', GK_PRIVATE_MS: '400', GK_COUNTDOWN_MS: '500', GK_READY_MS: '1500', GK_MAX_MATCHES: String(N + 5) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  for (let i = 0; i < 100 && !out.includes('Goblin King on'); i++) await sleep(100);
  if (!out.includes('Goblin King on')) { console.error('server did not start:\n' + out); process.exit(2); }
  const clients = [];
  for (let i = 0; i < N; i++) {
    const ws = new WS('ws://127.0.0.1:' + port + '/?name=Soak' + i + '&room=S' + String(i).padStart(3, '0')), c = { ws, x: 0, z: 0, yaw: 0, started: false };
    ws.on('message', raw => { let d; try { d = JSON.parse(raw.toString()); } catch (e) { return; } if (d.matchStart) { ws.send(JSON.stringify({ ready: 1 })); c.x = d.matchStart.spawn.x; c.z = d.matchStart.spawn.z; c.yaw = d.matchStart.spawn.yaw; c.started = true; } if (d.fix) { c.x = d.fix[0]; c.z = d.fix[1]; } });
    ws.on('error', () => {}); clients.push(c); await sleep(40);
  }
  const t0 = Date.now(), series = [];
  const tickers = setInterval(() => { for (const c of clients) if (c.started && c.ws.readyState === 1) { c.yaw += 0.3; c.ws.send(JSON.stringify({ m: [+c.x.toFixed(2), +c.z.toFixed(2), +c.yaw.toFixed(2)] })); if (Math.random() < 0.01) c.ws.send(JSON.stringify({ say: Math.floor(Math.random() * 8) })); } }, 200);
  while (Date.now() - t0 < SECS * 1000) {
    await sleep(SAMPLE * 1000); const h = await health(port); if (!h) { console.error('server stopped answering'); process.exit(1); }
    series.push({ t: Math.round((Date.now() - t0) / 1000), matches: h.matches, humans: h.humans, tickMs: h.tickMs, tickMaxMs: h.tickMaxMs, heapMb: h.heapMb, rssMb: h.rssMb, errors: h.errors });
    console.log('  t=' + String(series[series.length - 1].t).padStart(4) + 's matches ' + h.matches + ' humans ' + h.humans + '  tick mean ' + h.tickMs + ' ms (max ' + h.tickMaxMs + ')  heap ' + h.heapMb + ' MB  rss ' + h.rssMb + ' MB  errors ' + h.errors);
  }
  clearInterval(tickers); for (const c of clients) try { c.ws.terminate(); } catch (e) {}
  let after = await health(port), drained = -1; const d0 = Date.now(); while (Date.now() - d0 < 50000) { after = await health(port); if (after && after.matches === 0) { drained = Math.round((Date.now() - d0) / 1000); break; } await sleep(2000); }   // every socket is gone: the matches must be released (the reconnect grace holds them ~30 s first)
proc.kill();
  const q = Math.max(1, Math.floor(series.length / 4)), avg = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const first = avg(series.slice(0, q).map(s => s.heapMb)), last = avg(series.slice(-q).map(s => s.heapMb)), last3 = series.slice(-3), tick = avg(last3.map(s => s.tickMs));
  const res = { matches: N, secs: SECS, tickMeanMs: +tick.toFixed(2), tickMaxMs: series.length ? series[series.length - 1].tickMaxMs : 0, heapFirstQuarterMb: Math.round(first), heapLastQuarterMb: Math.round(last), heapGrowthMb: Math.round(last - first), rssMb: series.length ? series[series.length - 1].rssMb : 0, serverErrors: series.length ? series[series.length - 1].errors : 0, afterCloseMatches: after && after.matches, matchesReleasedAfterSecs: drained, heapAfterMb: after && after.heapMb };
  console.log('SOAK ' + JSON.stringify(res));
  const bad = []; if (tick > MAXTICK) bad.push('mean tick ' + tick.toFixed(1) + ' ms > ' + MAXTICK); if (last - first > MAXHEAP) bad.push('heap grew ' + Math.round(last - first) + ' MB'); if (drained < 0) bad.push('matches were not released after every player left'); if (res.serverErrors) bad.push(res.serverErrors + ' server errors'); if (/uncaught|TypeError|ReferenceError/.test(out)) bad.push('errors in the server log');
  if (bad.length) { console.error('SOAK FAIL: ' + bad.join('; ')); process.exit(1); }
  console.log('SOAK ok'); process.exit(0);
})();

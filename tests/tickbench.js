// Tick benchmark (not a test): node tests/tickbench.js [humans=3] [seconds=20] [matches=1]
// Starts a GK_DEBUG server, joins N humans per match (walking, attacking), bots fill each match to 8, then reports server tick time, bytes/s per client and heap.
const { startServer, connect, connectRaw, sleep } = require('./lib.js');
const humans = +process.argv[2] || 3, secs = +process.argv[3] || 20, nm = +process.argv[4] || 1;
(async () => {
  const S = await startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '400', GK_BOT_GRACE_MS: '0', GK_COUNTDOWN_MS: '0', GK_ROUND_MS: '60000', GK_READY_MS: '500', ...(process.env.PROF ? { NODE_OPTIONS: '--cpu-prof --cpu-prof-dir=' + process.env.PROF } : process.env.NOPTS ? { NODE_OPTIONS: process.env.NOPTS } : null) });
  const cs = [];
  for (let k = 0; k < nm; k++) { cs.push(...await Promise.all(Array.from({ length: humans }, (_, i) => connect(S.port, 'goblin=2&name=H' + k + i, { wait: 15000 })))); await sleep(600); }
  let bytes = 0, msgs = 0; const by = {}; for (const c of cs) c.ws.on('message', r => { bytes += r.length; msgs++; try { const k = Object.keys(JSON.parse(r.toString()))[0]; const e = by[k] || (by[k] = [0, 0]); e[0]++; e[1] += r.length; } catch (e) {} });
  const st = async () => { const c = await connectRaw(S.port); const r = await new Promise(r => { const n = 0; c.send({ botstat: 1 }); const t = setInterval(() => { const m = c.msgs.slice(n).find(x => x.botstat); if (m) { clearInterval(t); r(m.botstat); } }, 10); }); c.ws.close(); return r; };
  console.error('joined', cs.length); const a = await st(); console.error('stat ok');
  const timers = cs.map(c => { const sx = c.state.matchStart.spawn.x, sz = c.state.matchStart.spawn.z; let x = sx, z = sz, yaw = 0, ph = 0;
    return setInterval(() => { if (c.closed) return; ph += 0.05; x = sx + Math.sin(ph) * 1.2; z = sz + (Math.cos(ph) - 1) * 1.2; yaw = ph; c.send({ m: [+x.toFixed(2), +z.toFixed(2), +yaw.toFixed(2)] }); if (Math.random() < 0.02) c.send({ atk: 1 }); }, 50); });
  await sleep(secs * 1000);
  const b = await st(); timers.forEach(clearInterval);
  const n = b.tick.n - a.tick.n;
  console.log(JSON.stringify({ humans, matches: nm, secs, ticks: n, tickAvgMs: +((b.tick.sum - a.tick.sum) / n).toFixed(3), hz: +(n / secs).toFixed(2), ...(b.cpu ? { cpuPct: +(((b.cpu.user + b.cpu.system) - (a.cpu.user + a.cpu.system)) / 1e4 / secs).toFixed(2), cpuMsPerTick: +(((b.cpu.user + b.cpu.system) - (a.cpu.user + a.cpu.system)) / 1e3 / n).toFixed(3) } : null), ...(b.tick.dn ? { dtMeanMs: +((b.tick.dsum - a.tick.dsum) / (b.tick.dn - a.tick.dn)).toFixed(1), dtSdMs: +Math.sqrt(Math.max(0, (b.tick.dsq - a.tick.dsq) / (b.tick.dn - a.tick.dn) - ((b.tick.dsum - a.tick.dsum) / (b.tick.dn - a.tick.dn)) ** 2)).toFixed(1), dtMaxMs: +b.tick.dmax.toFixed(0), late75: b.tick.late - a.tick.late } : null), tickMaxMs: +b.tick.max.toFixed(2), over25: b.tick.over - a.tick.over, botAvgMs: +((b.sum - a.sum) / Math.max(1, b.n - a.n)).toFixed(3), botMaxMs: +b.max.toFixed(2), kbPerSecPerClient: +(bytes / 1024 / secs / cs.length).toFixed(2), msgsPerSecPerClient: +(msgs / secs / cs.length).toFixed(1), heapMB: +(b.heap / 1048576).toFixed(1), matchesLive: b.matches }));
  console.log('closed clients', cs.filter(c => c.closed).length + '/' + cs.length, 'matchEnd seen', cs.filter(c => c.msgs.some(m => m.matchEnd)).length, 'LINES', S.out().split('\n').filter(l => (process.env.SHOW ? new RegExp(process.env.SHOW) : /kick|uncaught|Error|SOCKET_WRITE/).test(l)).slice(0, process.env.SHOW ? 40 : 3).join(' / '));
  console.log(Object.entries(by).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8).map(([k, v]) => k + ' ' + (v[0] / secs / cs.length).toFixed(1) + '/s ' + (v[1] / secs / cs.length / 1024).toFixed(2) + 'KB/s').join(' | '));
  if (process.env.PROF || process.env.NOPTS) { const c = await connectRaw(S.port); c.send({ quit: 1 }); await sleep(2000); const w = /SOCKET_WRITE_CALLS (\d+)/.exec(S.out()); if (w) console.log('socket write calls', w[1], '= ' + (w[1] / secs).toFixed(0) + '/s'); }
  S.stop(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

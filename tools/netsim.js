#!/usr/bin/env node
// Netcode simulator (PERF4): N real ws clients in ONE match, each walking a circle, with injected latency / jitter / loss on both directions.
//   node tools/netsim.js [--root <repo dir>] [--n 8] [--secs 15] [--sendms 50] [--scen lan,100j30,100j30l2,200j60] [--json]
// --root points at another checkout (server.js + game.js), so before / after runs use the same harness.
// What it measures (per scenario):
//   up->obs   input-to-snapshot delay: the time from the moment a client SENDS a position to the moment another client RECEIVES it in a snapshot (p50 / p95, ms)
//   visual    how old the picture is: for 60 fps frames of the observer, how long ago the walker really was where the observer draws him (the real client interpolation code from game.js, run in a vm)
//   starve    share of frames where the observer had to extrapolate / hold (no snapshot newer than the render time)
//   pops      frames where a goblin moved more than 0.3 m in one frame (a jump on screen)
//   fixes     {fix} corrections the server sent to the walkers (a refused move = a rubber-band pop)
//   kbps      bytes per second per client (down + up), messages per second
//   tick      server tick Hz and interval sd (GK_DEBUG botstat)
// Link model (per direction, ordered like TCP): delay = rtt/2 + uniform(-jitter, +jitter); with probability `loss` a message is retransmitted: +rto (250 ms) and it blocks the ones behind it.
// Downstream delays are applied to the recorded arrival times (virtual time), upstream delays really delay the sends.
const path = require('path'), fs = require('fs'), vm = require('vm'), { spawn } = require('child_process'), net = require('net');
const DEFAULT_ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SCEN = { lan: { rtt: 0, jit: 0, loss: 0 }, '60j10': { rtt: 60, jit: 10, loss: 0 }, '100j30': { rtt: 100, jit: 30, loss: 0 }, '100j30l2': { rtt: 100, jit: 30, loss: 0.02 }, '200j60': { rtt: 200, jit: 60, loss: 0 } };
const RTO = 250;

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function startServer(root, env) {
  const port = await freePort();
  const proc = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, GK_DEBUG: '1', PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start: ' + out)), 10000); proc.stdout.on('data', () => { if (out.includes('Goblin King on')) { clearTimeout(t); res(); } }); proc.on('exit', c => { clearTimeout(t); rej(new Error('server exited (' + c + '): ' + out)); }); });
  return { port, proc, out: () => out, stop: () => { try { proc.kill(); } catch (e) {} } };
}

// The client's real net code (the NET-BEGIN .. NET-END block of game.js) in a vm with stubs, so the simulator exercises what ships.
function loadClientNet(root) {
  const src = fs.readFileSync(path.join(root, 'game.js'), 'utf8'), a = src.indexOf('// NET-BEGIN'), b = src.indexOf('// NET-END', a);
  if (a < 0 || b < 0) throw new Error('NET block not found in game.js');
  const box = { __now: 0, actors: new Map(), P: { x: 0, z: 0 }, GK: { mode: 'play' }, me: 0, performance: null, document: { createElement: () => ({ style: {}, set textContent(v) {} }), body: { appendChild() {} } }, window: { GK_OFFLINE: false }, setInterval: () => 0, Math };
  box.performance = { now: () => box.__now };
  const pre = 'const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); const wrapPi = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };\n';
  const names = ['NETC', 'netSnap', 'netSample', 'netRenderT', 'netPong', 'netFixStep', 'srvNow'];
  const code = pre + src.slice(a, b) + '\n;({ ' + names.join(', ') + ' })';
  const api = vm.runInContext ? vm.runInNewContext(code, box, { filename: 'game.js(NET)' }) : null;
  return { ...api, box };
}

// a walker's path: a circle of radius R around (cx, cz), speed v m/s, phase ph. Returns [x, z, yaw] at time tau seconds.
const pathAt = (w, tau) => { const th = w.ph + tau * w.v / w.R, x = w.cx + w.R * Math.cos(th) + 0.35 * Math.sin(0.31 * tau), z = w.cz + w.R * Math.sin(th) + 0.35 * Math.cos(0.23 * tau); return [x, z, -(th + Math.PI / 2) + Math.PI]; };   // a circle plus a slow drift, so no position repeats within a run
const pct = (arr, p) => { if (!arr.length) return NaN; const s = arr.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function simulate(o = {}) {
  const root = o.root || DEFAULT_ROOT, n = o.n || 8, secs = o.secs || 15, sendMs = o.sendMs || 50, sc = typeof o.scen === 'string' ? SCEN[o.scen] : o.scen, label = typeof o.scen === 'string' ? o.scen : JSON.stringify(o.scen);
  const lib = require(path.join(root, 'tests', 'lib.js')), W = require(path.join(root, 'world.js'));
  const S = await startServer(root, { GK_MATCH_SIZE: String(n), GK_QUEUE_MS: '400', GK_BOT_GRACE_MS: '0', GK_COUNTDOWN_MS: '0', GK_ROUND_MS: '600000', GK_READY_MS: '500', ...(o.env || null) });
  try {
    const cs = await Promise.all(Array.from({ length: n }, (_, i) => lib.connect(S.port, 'goblin=2&name=N' + i, { wait: 20000 })));
    await cs[0].until(x => x.state.match && x.state.match.alive >= n, 5000, 'all entered').catch(() => {});
    // walkers: circles inside room 0, each checked against the match's props (client radius 0.45)
    const [rx, rz] = W.rc(0), layout = cs[0].state.layout, rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    const free = (w) => { for (let k = 0; k < 64; k++) { const [x, z] = pathAt(w, k * w.R * 2 * Math.PI / w.v / 64); if (W.inProp(x, z, 0.6, layout, true)) return false; } return true; };
    const walkers = cs.map((c, i) => { let w; for (let t = 0; t < 200; t++) { w = { c, id: c.state.you, R: 1.2 + rnd() * 1.6, v: 4.2 + rnd() * 0.8, ph: rnd() * 6.28, cx: rx + (rnd() - 0.5) * 4, cz: rz + (rnd() - 0.5) * 4 }; if (free(w)) break; } return w; });
    
    // link layer
    const link = (dir) => { let last = 0; return () => { const now = performance.now(); let d = sc.rtt / 2 + (Math.random() * 2 - 1) * sc.jit; if (d < 0) d = 0; if (Math.random() < sc.loss) d += RTO; const t = Math.max(last, now + d); last = t; return t - now; }; };
    for (const w of walkers) {
      w.up = link(); w.rec = []; w.sent = new Map(); w.fixes = 0; w.tx = 0; w.txN = 0; w.rx = 0; w.rxN = 0; w.pings = new Map(); w.downLast = 0;
      const down = () => { const now = performance.now(); let d = sc.rtt / 2 + (Math.random() * 2 - 1) * sc.jit; if (d < 0) d = 0; if (Math.random() < sc.loss) d += RTO; const t = Math.max(w.downLast, now + d); w.downLast = t; return t; };
      w.c.ws.on('message', raw => { const tr = performance.now(), len = raw.length; let d; try { d = JSON.parse(raw.toString()); } catch (e) { return; } w.rx += len; w.rxN++; if (d.fix) w.fixes++; if (d.s || d.pong != null) w.rec.push({ v: down(), tr, d }); });
      w.sendReal = (m) => { const s = JSON.stringify(m), dly = w.up(); w.tx += s.length; w.txN++; setTimeout(() => { if (!w.c.closed) w.c.ws.send(s); }, dly); };
    }
    for (const w of walkers) { w.rx = 0; w.rxN = 0; w.tx = 0; w.txN = 0; w.fixes = 0; w.rec.length = 0; }
    const stat0 = await botstat(S.port, lib);
    // drive
    for (const w of walkers) { const [x, z] = pathAt(w, 0); w.c.send({ tp: [x, z] }); }
    const t0 = performance.now(), end = t0 + secs * 1000; let lastPing = -1e9;
    for (const w of walkers) { w.t0 = t0; w.nextSend = t0 + Math.random() * sendMs; }
    while (performance.now() < end) {
      const now = performance.now();
      for (const w of walkers) {
        if (now >= w.nextSend) {
          w.nextSend += sendMs; if (w.nextSend < now) w.nextSend = now + sendMs;
          const [x, z, yaw] = pathAt(w, (now - t0) / 1000), xr = +x.toFixed(2), zr = +z.toFixed(2);
          (w.sent.get(xr + ',' + zr) || w.sent.set(xr + ',' + zr, []).get(xr + ',' + zr)).push(now); w.sendReal({ m: [xr, zr, +yaw.toFixed(3)] });
          if (now - (w.lastPing || -1e9) > 2000) { w.lastPing = now; w.sendReal({ ping: now }); }
        }
      }
      await sleep(4);
    }
    await sleep(sc.rtt + sc.jit + RTO + 200);
    const stat1 = await botstat(S.port, lib);
    // ---- analysis
    const upObs = [], visual = [], jerk = []; let frames = 0, starve = 0, freeze = 0, pops = 0, fixes = 0;
    for (const w of walkers) fixes += w.fixes;
    // input -> observer snapshot (virtual arrival at the observer minus the real send time)
    for (const ob of walkers) for (const ev of ob.rec) if (ev.d.s) { const s = ev.d.s; for (let i = 1; i + 5 < s.length; i += 6) { const w = walkers.find(q => q.id === s[i]); if (!w || w === ob) continue; const L = w.sent.get(s[i + 1] + ',' + s[i + 2]); if (!L) continue; let sent = null; for (const q of L) if (q <= ev.v) sent = q; if (sent != null && ev.v - sent < 1500) upObs.push(ev.v - sent); } }
    // render replay for the first few observers
    const obs = walkers.slice(0, Math.min(3, n)), M = { visual, frames: 0, starve: 0, freeze: 0, pops: 0 };
    for (const ob of obs) replay(root, walkers, ob, ob.rec, t0, end, o, M);
    frames = M.frames; starve = M.starve; freeze = M.freeze; pops = M.pops;
    const dur = secs, dn = stat1.tick.dn - stat0.tick.dn, ticks = stat1.tick.n - stat0.tick.n;
    const meanDt = (stat1.tick.dsum - stat0.tick.dsum) / Math.max(1, dn), sdDt = Math.sqrt(Math.max(0, (stat1.tick.dsq - stat0.tick.dsq) / Math.max(1, dn) - meanDt * meanDt));
    const res = {
      scen: label, n, secs, sendMs,
      upObsP50: +pct(upObs, 0.5).toFixed(0), upObsP95: +pct(upObs, 0.95).toFixed(0),
      visualP50: +pct(visual, 0.5).toFixed(0), visualP95: +pct(visual, 0.95).toFixed(0),
      starvePct: +(100 * starve / Math.max(1, frames)).toFixed(2), freezePct: +(100 * freeze / Math.max(1, frames)).toFixed(2), pops, popsPerMin: +(pops / Math.max(1e-9, obs.length * (secs - 3.2) / 60)).toFixed(2),
      fixes, fixesPerMin: +(fixes / n / secs * 60).toFixed(2),
      kbpsDown: +(walkers.reduce((a, w) => a + w.rx, 0) / n / 1024 / dur).toFixed(2), kbpsUp: +(walkers.reduce((a, w) => a + w.tx, 0) / n / 1024 / dur).toFixed(2),
      msgsDown: +(walkers.reduce((a, w) => a + w.rxN, 0) / n / dur).toFixed(1), msgsUp: +(walkers.reduce((a, w) => a + w.txN, 0) / n / dur).toFixed(1),
      closed: cs.filter(c => c.closed).length,
      tickHz: dn ? +(1000 / meanDt).toFixed(2) : +(ticks / dur).toFixed(2), tickSd: dn ? +sdDt.toFixed(1) : null, tickCpuPct: stat1.cpu ? +(((stat1.cpu.user + stat1.cpu.system) - (stat0.cpu.user + stat0.cpu.system)) / 1e4 / dur).toFixed(2) : null,
    };
    for (const c of cs) c.ws.close();
    return res;
  } finally { S.stop(); }
}

// Run the real client net code over one observer's received events (sorted by virtual arrival time) at 60 fps and collect the render metrics into M.
function replay(root, walkers, ob, rec, t0, end, o, M) {
  const C = loadClientNet(root), box = C.box, custom = o.renderDelay;
  box.me = ob.id; for (const w of walkers) box.actors.set(w.id, { id: w.id, x: 0, z: 0, yaw: 0 });
  const evs = rec.slice().sort((a, b) => a.v - b.v); let ei = 0, lastT = null; const prev = new Map();
  for (let T = t0 + 3000; T < end - 200; T += 1000 / 60) {
    while (ei < evs.length && evs[ei].v <= T) { const ev = evs[ei++]; box.__now = ev.v; if (ev.d.s) C.netSnap(ev.d.s); else C.netPong(ev.d); }
    box.__now = T; const dt = lastT == null ? 1 / 60 : (T - lastT) / 1000; lastT = T;
    const rt = custom ? C.srvNow() - custom(C.NETC) : C.netRenderT(dt);
    for (const w of walkers) if (w !== ob) {
      const a = box.actors.get(w.id), s = C.netSample(a, rt); if (!s) continue;
      const L = a.buf[a.buf.length - 1]; M.frames++; if (rt > L.t) M.starve++; if (rt - L.t > 100) M.freeze++;
      const pv = prev.get(w.id); if (pv && Math.hypot(s.x - pv[0], s.z - pv[1]) > 0.3) M.pops++; prev.set(w.id, [s.x, s.z]);
      let best = 1e9, bt = 0; for (let k = 0; k <= 200; k++) { const tau = (T - 1000 + k * 5 - t0) / 1000, [px, pz] = pathAt(w, tau), dd = Math.hypot(px - s.x, pz - s.z); if (dd < best) { best = dd; bt = T - 1000 + k * 5; } }
      M.visual.push(T - bt);
    }
  }
  return C;
}
// Deterministic model of the whole chain (seeded, no server): walkers send every sendMs, the server ticks every 50 ms (+- tickJit), snapshots are built like server.js does (entries stamped with age), the link is the same model as above. Used to tune and guard the client's interpolation without machine noise.
function model(o = {}) {
  const root = o.root || DEFAULT_ROOT, n = o.n || 4, secs = o.secs || 20, sendMs = o.sendMs || 50, sc = typeof o.scen === 'string' ? SCEN[o.scen] : o.scen, tickJit = o.tickJit == null ? 3 : o.tickJit;
  let seed = o.seed || 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const link = () => { let last = 0; return t => { let d = sc.rtt / 2 + (rnd() * 2 - 1) * sc.jit; if (d < 0) d = 0; if (rnd() < sc.loss) d += RTO; const x = Math.max(last, t + d); last = x; return x; }; };
  const SO = 5000, t0 = 1000, end = t0 + secs * 1000;   // server clock = real + SO
  const walkers = Array.from({ length: n }, (_, i) => ({ id: i + 1, R: 1.2 + rnd() * 1.6, v: 4.2 + rnd() * 0.8, ph: rnd() * 6.28, cx: 0, cz: 0, up: link(), down: link(), rec: [], sent: [] }));
  const arrivals = [];   // moves reaching the server: { at, w, x, z, yaw }
  for (const w of walkers) { for (let t = t0 + rnd() * sendMs; t < end; t += sendMs) { const [x, z, yaw] = pathAt(w, (t - t0) / 1000); const at = w.up(t); arrivals.push({ at, w, x: +x.toFixed(2), z: +z.toFixed(2), yaw: +yaw.toFixed(3), sent: t }); } for (let t = t0 + 500; t < end; t += 2000) { const at = w.up(t); arrivals.push({ at, w, ping: t }); } }
  arrivals.sort((a, b) => a.at - b.at);
  let ai = 0; const upObs = [];
  for (let tk = t0 - 500; tk < end + 600; tk += 50) {
    const T = tk + (rnd() * 2 - 1) * tickJit;
    const moved = new Map();
    while (ai < arrivals.length && arrivals[ai].at <= T) { const a = arrivals[ai++]; if (a.ping != null) { a.w.rec.push({ v: a.w.down(a.at), d: { pong: a.ping, t: Math.round(a.at + SO) } }); continue; } moved.set(a.w, a); }
    if (!moved.size) continue;
    for (const ob of walkers) {
      const s = [Math.round(T + SO)]; for (const [w, a] of moved) if (w !== ob) s.push(w.id, a.x, a.z, a.yaw, Math.round(w.v * 10) / 10, Math.min(255, Math.max(0, Math.round(T - a.at))));
      if (s.length > 1) { const v = ob.down(T); ob.rec.push({ v, d: { s } }); for (const [w, a] of moved) if (w !== ob) upObs.push(v - a.sent); }
    }
  }
  const M = { visual: [], frames: 0, starve: 0, freeze: 0, pops: 0 }, obs = walkers.slice(0, Math.min(3, n));
  for (const ob of obs) replay(root, walkers, ob, ob.rec, t0, end, o, M);
  return { scen: typeof o.scen === 'string' ? o.scen : JSON.stringify(o.scen), upObsP50: +pct(upObs, 0.5).toFixed(0), upObsP95: +pct(upObs, 0.95).toFixed(0), visualP50: +pct(M.visual, 0.5).toFixed(0), visualP95: +pct(M.visual, 0.95).toFixed(0), starvePct: +(100 * M.starve / Math.max(1, M.frames)).toFixed(2), freezePct: +(100 * M.freeze / Math.max(1, M.frames)).toFixed(2), popsPerMin: +(M.pops / (obs.length * (secs - 3.2) / 60)).toFixed(2) };
}
async function botstat(port, lib) { const c = await lib.connectRaw(port); const r = await new Promise(res => { c.send({ botstat: 1 }); const t = setInterval(() => { const m = c.msgs.find(x => x.botstat); if (m) { clearInterval(t); res(m.botstat); } }, 10); }); c.ws.close(); return r; }

module.exports = { simulate, model, replay, loadClientNet, SCEN, pathAt };
if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  (async () => {
    const root = path.resolve(arg('root', DEFAULT_ROOT)), n = +arg('n', 8), secs = +arg('secs', 15), sendMs = +arg('sendms', 50), scens = arg('scen', 'lan,100j30,100j30l2,200j60').split(',');
    const rows = []; for (const s of scens) { const r = await simulate({ root, n, secs, sendMs, scen: s }); rows.push(r); console.error(JSON.stringify(r)); }
    if (process.argv.includes('--json')) console.log(JSON.stringify(rows));
    else { const cols = ['scen', 'upObsP50', 'upObsP95', 'visualP50', 'visualP95', 'starvePct', 'freezePct', 'popsPerMin', 'fixesPerMin', 'kbpsDown', 'kbpsUp', 'msgsDown', 'msgsUp', 'tickHz', 'tickSd', 'tickCpuPct']; console.log(cols.join('\t')); for (const r of rows) console.log(cols.map(c => r[c]).join('\t')); }
    process.exit(0);
  })().catch(e => { console.error(e); process.exit(1); });
}

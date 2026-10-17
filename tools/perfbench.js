// PERF4 dev tool: real-GPU frame benchmark over CDP (headless Edge / Chrome, no puppeteer). Starts its own server on a random port, plays the offline demo
// (seeded Math.random, passive bots), opens every door (sudden death, the worst case) and measures fixed views per preset.
//   node tools/perfbench.js [--presets low,high] [--views vault,tree,home,corridor,closed] [--frames 150] [--soak 60] [--shots docs/screens/perf4-after] [--out res.json] [--root <server dir>] [--budget]
// Per view: draw calls and triangles summed over every renderer.render of a frame (composer passes included), render passes, CPU ms of all rAF callbacks of
// a frame (the game loop, render submission included), CPU ms inside renderer.render, frame interval (mean / p95 / max), positive JS heap growth per frame.
// --soak N: N seconds of a running match (8 goblins) on the first preset: heap start / end / max, GC-visible drops, long frames.
// --budget: exit code 1 when the vault view is over budget (Low <= 300 calls, High <= 600 calls, Low frame CPU <= 8 ms).
// Pitfalls (docs/QUALITY-PLAN.md): random ports only (fixed ports collide with other worktrees' servers), the server needs node_modules next to it,
// the real GPU needs --use-angle=d3d11 (swiftshader numbers are useless for timing); the gfx auto probe is disabled so the preset stays put.
const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const WS = require(require.resolve('ws', { paths: [process.cwd(), path.join(__dirname, '..')] }));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const ROOT = path.resolve(arg('root', path.join(__dirname, '..'))), PRESETS = String(arg('presets', 'low,medium,high,ultra')).split(','), VIEWS = String(arg('views', 'vault,tree,home,corridor,closed')).split(',');
const FRAMES = +arg('frames', 150), SOAK = +arg('soak', 0), SHOTS = arg('shots', ''), OUT = arg('out', ''), BUDGET = !!arg('budget', false), W = +arg('w', 1600), H = +arg('h', 900);
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'];
const BROWSER = process.env.CHROME || EDGE.find(p => fs.existsSync(p));
const PROFILE = !!arg('profile', false), ATTRIB = !!arg('attrib', false);
const BUDGETS = { low: { calls: 300, cpu: 8 }, high: { calls: 600 } };
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

// injected before any page script: seeded Math.random, passive bots, a per-frame probe that wraps requestAnimationFrame and (once it exists) renderer.render
const PROBE = `(() => {
  let s = 0x9e3779b9; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.GK_BOTS_PASSIVE = true;
  try { localStorage.setItem('gk.gfxAuto', 'user'); localStorage.setItem('gk.tips', JSON.stringify({ off: true })); } catch (e) {}
  const pf = window.__pf = { on: false, rows: [], cur: null, ts: -1, wrapped: false, hideActors: false, baked: 0 };
  addEventListener('gkart-baked', () => { pf.baked = performance.now(); });
  const raf = window.requestAnimationFrame.bind(window), now = () => performance.now();
  const close = () => { if (pf.cur) pf.rows.push(pf.cur); pf.cur = null; };
  window.requestAnimationFrame = cb => raf(ts => {
    if (ts !== pf.ts) {   // first callback of a new frame
      if (pf.on) { close(); const r = window.GK && GK.renderer; pf.cur = { ts, cpu: 0, rcpu: 0, calls: 0, tris: 0, passes: 0, heap: performance.memory ? performance.memory.usedJSHeapSize : 0 }; }
      pf.ts = ts; pf.wrap();
    }
    const t0 = now(); try { cb(ts); } finally { if (pf.cur) pf.cur.cpu += now() - t0; }
  });
  pf.wrap = () => {
    const r = window.GK && GK.renderer; if (!r || pf.wrapped) return; pf.wrapped = true;
    const orig = r.render.bind(r); r.info.autoReset = false;
    r.render = (sc, cm) => {
      const c0 = r.info.render.calls, t0 = r.info.render.triangles, a = now();
      let hid = null; if (pf.hideActors && GK.actors) { hid = []; for (const x of GK.actors.values()) if (x.group && x.group.visible) { x.group.visible = false; hid.push(x.group); } }
      try { orig(sc, cm); } finally { if (hid) for (const g of hid) g.visible = true; }
      if (pf.cur) { pf.cur.rcpu += now() - a; pf.cur.calls += r.info.render.calls - c0; pf.cur.tris += r.info.render.triangles - t0; pf.cur.passes++; }
      if (r.info.render.calls > 1e7) r.info.reset();
    };
  };
  pf.attribute = n => new Promise(res => {   // draw calls of the next n frames by top-level scene child (label: name, room tag, or type + size)
    const r = GK.renderer, orig = r.renderBufferDirect, m = new Map(), lab = o => { let t = o; const path = []; while (t.parent && t.parent.type !== 'Scene') { t = t.parent; } const u = t.userData || {}; return (t.name || '') + (u.room !== undefined ? ' room=' + u.room : '') + (u.r5 ? ' r5' : '') + ' <' + t.type + ':' + (t.children.length) + '> ' + (o.name || o.type) + (o.material && o.material.type ? ' ' + o.material.type : ''); };
    r.renderBufferDirect = function (c, s, g, mat, o, gr) { const k = lab(o); m.set(k, (m.get(k) || 0) + 1); return orig.apply(this, arguments); };
    let k = 0; const f = () => { if (++k < n) return requestAnimationFrame(f); r.renderBufferDirect = orig; res([...m].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([a, b]) => (b / n).toFixed(1) + '  ' + a)); }; requestAnimationFrame(f);
  });
  pf.start = () => { pf.rows = []; pf.cur = null; pf.on = true; };
  pf.stop = () => { pf.on = false; close(); const R = pf.rows.slice(1); pf.rows = [];
    const m = k => R.reduce((s, r) => s + r[k], 0) / Math.max(1, R.length), iv = [];
    for (let i = 1; i < R.length; i++) iv.push(R[i].ts - R[i - 1].ts);
    iv.sort((a, b) => a - b); const cpu = R.map(r => r.cpu).sort((a, b) => a - b);
    let grow = 0; for (let i = 1; i < R.length; i++) { const d = R[i].heap - R[i - 1].heap; if (d > 0) grow += d; }
    return { n: R.length, calls: Math.round(m('calls')), tris: Math.round(m('tris')), passes: +m('passes').toFixed(1), cpu: +m('cpu').toFixed(2), cpuP95: +(cpu[Math.floor(cpu.length * 0.95)] || 0).toFixed(2), rcpu: +m('rcpu').toFixed(2),
      ms: +(iv.reduce((s, v) => s + v, 0) / Math.max(1, iv.length)).toFixed(2), p95: +(iv[Math.floor(iv.length * 0.95)] || 0).toFixed(1), max: +(iv[iv.length - 1] || 0).toFixed(1), heapKB: +(grow / Math.max(1, R.length - 1) / 1024).toFixed(1) };
  };
})();`;

async function profile(send, ev) {   // 4 s CPU profile (self time by function) and allocation sampling (bytes by function) in the current view
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('HeapProfiler.enable');
  await send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  await send('Profiler.start'); await sleep(4000); const p = (await send('Profiler.stop')).result.profile; const hp = (await send('HeapProfiler.stopSampling')).result.profile;
  const key = f => (f.functionName || '(anon)') + ' ' + (f.url || '').split('/').pop() + ':' + (f.lineNumber + 1);
  const self = new Map(), byId = new Map(), cnt = new Map(); let total = 0;
  for (const n of p.nodes) byId.set(n.id, n);
  for (let i = 0; i < p.samples.length; i++) cnt.set(p.samples[i], (cnt.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
  for (const [nid, us] of cnt) { const k = key(byId.get(nid).callFrame); self.set(k, (self.get(k) || 0) + us); total += us; }
  console.log('  CPU self time (4 s, % of all samples incl. idle):');
  for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log('    ' + (100 * us / total).toFixed(1).padStart(5) + '%  ' + k);
  const al = new Map(); let at = 0; const walk = n => { if (n.selfSize) { const k = key(n.callFrame); al.set(k, (al.get(k) || 0) + n.selfSize); at += n.selfSize; } for (const c of n.children || []) walk(c); };
  walk(hp.head);
  console.log('  allocations (4 s, ' + (at / 1048576).toFixed(1) + ' MB sampled):');
  for (const [k, b] of [...al].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log('    ' + (b / 1024).toFixed(0).padStart(7) + ' KB  ' + k);
}
async function main() {
  if (!BROWSER) throw new Error('no Edge / Chrome found (set CHROME)');
  if (!fs.existsSync(path.join(ROOT, 'node_modules', 'three'))) throw new Error('no node_modules/three next to ' + ROOT + ' (the server would 404 three.js)');
  const port = await freePort(), dport = await freePort(), base = 'http://127.0.0.1:' + port;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), GK_DEBUG: '1' }), stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await get(base + '/'); break; } catch (e) { await sleep(150); } }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gkbench-'));
  const flags = ['--headless=new', '--remote-debugging-port=' + dport, '--user-data-dir=' + dir, '--window-size=' + W + ',' + H, '--hide-scrollbars', '--mute-audio', '--no-first-run', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=' + (process.env.ANGLE || 'd3d11'), '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'];
  if (process.env.UNCAPPED === '1') flags.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const ch = spawn(BROWSER, flags.concat('about:blank'), { stdio: 'ignore' });
  const cleanup = () => { try { ch.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', cleanup);
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + dport + '/json')); if (tabs.some(t => t.type === 'page')) break; } catch (e) {} await sleep(200); }
  if (process.platform === 'win32' && process.env.PRIO !== '0') {   // the machine is shared: run this browser (all its processes) at high priority so other load inflates the numbers less
    const ps = "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*" + path.basename(dir) + "*' } | ForEach-Object { try { (Get-Process -Id $_.ProcessId).PriorityClass = 'High' } catch {} }";
    setTimeout(() => { try { spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' }); } catch (e) {} }, 6000);
  }
  const ws = new WS(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(), logs = [];
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('error: ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300)); else if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + String(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).slice(0, 400)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || JSON.stringify(r.result.exceptionDetails)).slice(0, 400)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  const results = { browser: path.basename(BROWSER), root: ROOT, w: W, h: H, gpu: null, load: null, views: {}, soak: null, errors: logs };
  const startMatch = async gfx => {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('gk.settings', JSON.stringify({ gfx: '" + gfx + "', fx: " + (gfx !== 'low') + ", tags: true }))}catch(e){}" });
    const t0 = Date.now(); await send('Page.navigate', { url: base + '/?offline=1&debug=1' });
    for (let i = 0; i < 100; i++) { if (await ev('!!(window.GK && GK.renderer && GK.menu)').catch(() => false)) break; await sleep(100); }
    const menuMs = Date.now() - t0;
    if (!results.gpu) results.gpu = await ev(`(()=>{const g=GK.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`);
    await sleep(1200);
    const lt = await ev(`(()=>{ window.__lt = []; try { new PerformanceObserver(l => { for (const e of l.getEntries()) __lt.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) {} return 1 })()`);
    const clickStart = "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^(start|play)/i.test(x.textContent.trim())&&x.offsetParent); b&&b.click(); return !!b})()";
    await ev(clickStart); const t1 = Date.now(); let goMs = 0;
    for (let i = 0; i < 240; i++) {
      const s = await ev('JSON.stringify({m: GK.mode, l: GK.locked, p: GK.r5 && GK.r5.pending ? GK.r5.pending().length : 0})').catch(() => '{}');
      if (/"m":"menu"/.test(s) && i % 8 === 4) await ev(clickStart);
      if (/"m":"play"/.test(s) && /"l":false/.test(s)) { if (!goMs) goMs = Date.now() - t1; if (/"p":0/.test(s)) break; }
      await sleep(250);
    }
    const goAt = Date.now(); let bakeWait = 0; for (let i = 0; i < 160; i++) { if (await ev('__pf.baked > 0')) break; await sleep(250); bakeWait = Date.now() - goAt; }   // the item icon bake runs after GO (main thread): measure after it
    await sleep(1500);
    const longs = await ev('__lt.slice()');
    return { menuMs, goMs, bakeWait, longTasks: longs.filter(x => x > 50), longMax: Math.max(0, ...longs) };
  };
  const allOpen = async on => ev(`(()=>{ if (!window.__sdo) { window.__sdo = GK.setDoorsOpen; } GK.setDoorsOpen = ${on === 'restore' ? '__sdo' : on ? 'ids => __sdo(GK.doors.map(d => d.id))' : 'ids => __sdo([])'}; if (${on !== 'restore'}) GK.setDoorsOpen([]); return GK.doors.filter(d=>d.open).length })()`);
  const views = await (async () => ({}))();
  for (let pi = 0; pi < PRESETS.length; pi++) {
    const gfx = PRESETS[pi]; console.log('preset', gfx);
    const load = await startMatch(gfx); if (!results.load) results.load = {}; results.load[gfx] = load; console.log('  load', JSON.stringify(load));
    const rr = await ev(`JSON.stringify(Object.fromEntries(['12','6','c0','10','11'].map(k=>[k,GKWORLD.roomRect(k)])))`).then(JSON.parse);
    const PI = Math.PI;
    const V = {
      vault: { open: true, at: [0, rr['12'].hd - 3, 0, -0.05] },                       // the vault from its south side looking north, every door open
      tree: { open: true, at: [rr['6'].cx, rr['6'].cz + rr['6'].hd - 1.5, 0, 0.0] },    // tree room 6 looking north through the open doors
      home: { open: true, at: [rr['c0'].cx, rr['c0'].cz - rr['c0'].hd + 2.2, PI, 0] }, // inside home c0 looking out through the hatch
      corridor: { open: true, at: [rr['10'].cx - rr['10'].hw + 1.2, rr['10'].cz, -PI / 2, 0] },   // west edge of row 2 looking east along the whole row
      closed: { open: false, at: [0, rr['12'].hd - 3, 0, -0.05] },                   // the vault with the round's own doors (mostly closed)
    };
    for (const vk of VIEWS) {
      const v = V[vk]; if (!v) continue;
      await allOpen(v.open);
      const [x, z, yaw, pitch] = v.at;
      await ev(`(GK.P.x=${x},GK.P.z=${z},GK.P.yaw=${yaw},GK.P.pitch=${pitch},1)`);
      await sleep(v.open ? 3200 : 2600);   // doors finish moving (the vault doors take 2.4 s), lamps settle, lazy room art builds
      await ev(`(GK.P.x=${x},GK.P.z=${z},GK.P.yaw=${yaw},GK.P.pitch=${pitch},1)`);
      await ev('(__pf.start(),1)'); await sleep(FRAMES * 17 + 200); const r = await ev('__pf.stop()');
      const sc = await ev(`(()=>{let o=0,m=0,au=0;GK.scene.traverse(n=>{o++;if(n.isMesh)m++;if(n.matrixAutoUpdate)au++;});const i=GK.renderer.info;return {objects:o,meshes:m,autoUpd:au,programs:i.programs?i.programs.length:0,textures:i.memory.textures,geometries:i.memory.geometries,heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576):0}})()`);
      Object.assign(r, sc);
      (results.views[gfx] = results.views[gfx] || {})[vk] = r;
      console.log('  ' + vk.padEnd(9), JSON.stringify(r));
      if (PROFILE && pi === 0 && vk === VIEWS[0]) await profile(send, ev);
      if (ATTRIB) console.log('    ' + (await ev('__pf.attribute(10)')).join('\n    '));
      if (SHOTS) {
        await ev('(__pf.hideActors=true,1)'); await sleep(120);
        const s = await send('Page.captureScreenshot', { format: 'png' }); await ev('(__pf.hideActors=false,1)');
        const f = SHOTS + '-' + gfx + '-' + vk + '.png'; fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true }); fs.writeFileSync(f, Buffer.from(s.result.data, 'base64'));
      }
    }
    await allOpen('restore');
    if (pi === 0 && SOAK > 0) {   // a running match on this preset: heap over SOAK seconds, camera walking a loop through the rooms
      console.log('  soak', SOAK, 's');
      await ev(`(()=>{ window.__soak = { h: [], t0: performance.now(), long: 0, frames: 0, last: 0 }; const S = __soak; const r = GKWORLD.roomRect('12');
        const step = () => { if (!S.on) return; const t = (performance.now() - S.t0) / 1000; GK.P.x = Math.sin(t * 0.15) * (r.hw - 3); GK.P.z = Math.cos(t * 0.15) * (r.hd - 3); GK.P.yaw = t * 0.15 + Math.PI / 2; requestAnimationFrame(step); };
        S.on = true; requestAnimationFrame(step); S.iv = setInterval(() => S.h.push(performance.memory ? performance.memory.usedJSHeapSize : 0), 500); return 1 })()`);
      await ev('(__pf.start(),1)'); await sleep(SOAK * 1000); const r = await ev('__pf.stop()');
      const h = await ev('(()=>{ clearInterval(__soak.iv); __soak.on = false; return __soak.h })()');
      let drops = 0; for (let i = 1; i < h.length; i++) if (h[i] < h[i - 1] - 512 * 1024) drops++;
      results.soak = Object.assign(r, { preset: gfx, seconds: SOAK, goblins: await ev('GK.actors.size'), heapStartMB: +(h[0] / 1048576).toFixed(1), heapEndMB: +(h[h.length - 1] / 1048576).toFixed(1), heapMaxMB: +(Math.max(...h) / 1048576).toFixed(1), gcDrops: drops, growthKBs: +((h[h.length - 1] - h[0]) / 1024 / SOAK).toFixed(1) });
      console.log('  soak', JSON.stringify(results.soak));
    }
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
  if (logs.length) console.log('console:\n' + logs.slice(0, 20).join('\n'));
  let bad = [];
  if (BUDGET) {
    for (const [p, b] of Object.entries(BUDGETS)) { const v = results.views[p] && results.views[p].vault; if (!v) continue; if (b.calls && v.calls > b.calls) bad.push(p + ' vault calls ' + v.calls + ' > ' + b.calls); if (b.cpu && v.cpu > b.cpu) bad.push(p + ' vault frame CPU ' + v.cpu + ' ms > ' + b.cpu); }
    const errs = logs.filter(l => !/favicon/.test(l)); if (errs.length) bad.push(errs.length + ' console errors');
    console.log(bad.length ? 'OVER BUDGET: ' + bad.join('; ') : 'within budget');
  }
  ws.close(); cleanup(); setTimeout(() => process.exit(bad.length ? 1 : 0), 300);
}
module.exports = { PROBE };
if (require.main === module) main().catch(e => { console.error(e); process.exit(2); });

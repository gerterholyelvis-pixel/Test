#!/usr/bin/env node
// RESEARCH (docs/RESEARCH-perf.md): runtime A/B experiments for the client render path. Touches NO game file: every experiment is a patch evaluated
// into the running page over CDP, measured, then undone. Reuses tools/perfbench.js's frame probe (PROBE: draw calls, CPU of the rAF callbacks,
// CPU inside renderer.render, frame interval).
//   node tools/research/perf-ab.js [--preset low|high] [--view vault|closed] [--frames 150] [--reps 2] [--exp base,skipStatic,...]
//   UNCAPPED=1 adds --disable-gpu-vsync --disable-frame-rate-limit so GPU-side gains show up in the frame interval (vsync hides them otherwise).
// Experiments (each one is measured against a fresh "base" run taken right before it, so machine load drifts cancel out):
//   walk        no change; reports the size of the scene walk: nodes, visible nodes, nodes three's projectObject visits, layer-30 originals inside them
//   skipStatic  frozen top-level objects (matrixAutoUpdate false) with no watched / auto-updating node inside get an updateMatrixWorld that returns
//               unless the root itself is dirty, i.e. three no longer recurses through ~10k static nodes every frame (what a "static subtree skip" would buy)
//   noBatchCull every PERF4 BatchedMesh: perObjectFrustumCulled = false (no per-instance sphere test in JS; the GPU draws hidden-room instances)
//   noSort      renderer.sortObjects = false (no render-list sort; opaque order becomes scene order)
//   noSprites   every Sprite hidden (name tags, health bars, halos): what the 2-sprites-per-goblin and halo design costs
//   half        pixel ratio x0.5 (fill-rate / GPU bound test; on Low the frame should not change if it is CPU bound)
//   noAO, noBloom  (High) the GTAO / bloom pass disabled
//   noPost      (High) composer bypassed: plain renderer.render
//   micro       synchronous in-page micro benchmark of one view (see MICRO below): render cost split into matrix walk, draw submission, GPU
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net'), http = require('http'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const WS = require(require.resolve('ws', { paths: [ROOT] }));
const { PROBE } = require(path.join(ROOT, 'tools', 'perfbench.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const PRESET = arg('preset', 'low'), VIEW = arg('view', 'vault'), FRAMES = +arg('frames', 150), REPS = +arg('reps', 2);
const EXPS = String(arg('exp', PRESET === 'low' ? 'walk,skipStatic,noBatchCull,noSort,noSprites,half' : 'walk,skipStatic,noAO,noBloom,noPost,half')).split(',');
const BROWSER = process.env.CHROME || ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

// each experiment: [apply, undo] as page-side expressions. State lives on window.__ab.
const EXP = {
  walk: ['1', '1'], micro: ['1', '1'],
  skipStatic: [`(()=>{ const A = window.__ab = window.__ab || {}; A.skipped = []; let nodes = 0; const proto = THREE.Object3D.prototype.updateMatrixWorld;
      for (const r of GK.scene.children) { if (r.matrixAutoUpdate !== false || r.isLight || r.isCamera) continue; let live = false, n = 0;
        r.traverse(o => { n++; if (o !== r && (o.matrixAutoUpdate || o._p4w || o.isBatchedMesh || o.isInstancedMesh)) live = true; });
        if (live) continue; const own = Object.prototype.hasOwnProperty.call(r, 'updateMatrixWorld') ? r.updateMatrixWorld : null;
        A.skipped.push([r, own]); nodes += n; r.updateMatrixWorld = function (force) { if (this.matrixWorldNeedsUpdate || force) (own || proto).call(this, force); }; }
      return { roots: A.skipped.length, nodes }; })()`,
    `(()=>{ for (const [r, own] of window.__ab.skipped) { if (own) r.updateMatrixWorld = own; else delete r.updateMatrixWorld; } return 1 })()`],
  noBatchCull: [`(()=>{ let n = 0; GK.scene.traverse(o => { if (o.isBatchedMesh && o.perObjectFrustumCulled) { o.perObjectFrustumCulled = false; o.__abc = 1; n++; } }); return n })()`,
    `(()=>{ GK.scene.traverse(o => { if (o.__abc) { o.perObjectFrustumCulled = true; delete o.__abc; } }); return 1 })()`],
  noSort: ['(GK.renderer.sortObjects = false, 1)', '(GK.renderer.sortObjects = true, 1)'],
  noSprites: [`(()=>{ const A = window.__ab = window.__ab || {}; A.sp = []; GK.scene.traverse(o => { if (o.isSprite && o.visible) { o.visible = false; A.sp.push(o); } }); return A.sp.length })()`,
    `(()=>{ for (const o of window.__ab.sp) o.visible = true; return 1 })()`],
  half: ['(window.__abpr = GK.renderer.getPixelRatio(), GK.renderer.setPixelRatio(__abpr * 0.5), dispatchEvent(new Event("resize")), GK.renderer.getPixelRatio())',
    '(GK.renderer.setPixelRatio(__abpr), dispatchEvent(new Event("resize")), 1)'],
  noAO: ['(()=>{ const f = GK.fxDebug.fx; if (!f || !f.gtao) return "no gtao"; window.__abao = f.gtao.enabled; f.gtao.enabled = false; return window.__abao })()', '(GK.fxDebug.fx.gtao.enabled = window.__abao, 1)'],
  noBloom: ['(()=>{ const f = GK.fxDebug.fx; if (!f || !f.bloom) return "no bloom"; window.__abbl = f.bloom.enabled; f.bloom.enabled = false; return 1 })()', '(GK.fxDebug.fx.bloom.enabled = window.__abbl, 1)'],
  noPost: ['(window.__abfx = GK.settings.fx, GK.settings.fx = false, 1)', '(GK.settings.fx = window.__abfx, 1)'],
};
// micro: inside ONE synchronous evaluate (no game frame runs in between, so machine noise between runs mostly cancels), render the current view N times per
// variant and report ms per render: full / full + gl.finish (CPU + GPU) / matrix walk only / render with the world-matrix walk skipped / render with the
// batched originals (leaf meshes on layer 30, never drawn) temporarily detached, so three's projectObject no longer recurses into them. Everything is restored.
// The game's room culler hides rooms only for the duration of its own render call (fxCullBegin / fxCullEnd), so the culled set of a real frame is captured first
// (scene.onBeforeRender runs inside that window) and re-applied around the loop; otherwise the micro benchmark would draw the whole, unculled world.
const MICRO = `(async()=>{ const r = GK.renderer, s = GK.scene, c = GK.cam, gl = r.getContext(), N = 30, now = () => performance.now();
  const hiddenIn = await new Promise(res => { const prev = s.onBeforeRender; s.onBeforeRender = function () { s.onBeforeRender = prev; const h = []; s.traverse(o => { if (!o.visible) h.push(o); }); res(h); }; });
  await new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
  const culled = hiddenIn.filter(o => o.visible); for (const o of culled) o.visible = false;
  try {
  const t = (f) => { f(); const a = now(); for (let i = 0; i < N; i++) f(); return +((now() - a) / N).toFixed(2); };
  const full = t(() => r.render(s, c)), finish = t(() => { r.render(s, c); gl.finish(); });
  const proto = THREE.Object3D.prototype.updateMatrixWorld;
  const walk = t(() => s.updateMatrixWorld());          // the game's patched walk: perf4Tick + three's walk + p4bSync
  const walkPlain = t(() => proto.call(s));             // three's walk alone
  const mwa = s.matrixWorldAutoUpdate; s.matrixWorldAutoUpdate = false;   // from here on the renderer does not call scene.updateMatrixWorld (so p4bSync never sees the detach below)
  const noWalk = t(() => r.render(s, c));
  const L = 1 << 30, det = []; s.traverse(o => { if (o.layers.mask === L && !o.children.length && o.parent) det.push(o); });
  const saved = det.map(o => [o, o.parent, o.parent.children.indexOf(o)]);
  for (const [o, p] of saved) { const i = p.children.indexOf(o); p.children.splice(i, 1); }
  const noL30 = t(() => r.render(s, c)), walkNoL30 = t(() => proto.call(s));
  const cA = r.info.render.calls; r.render(s, c); const callsNoL30 = r.info.render.calls - cA;
  for (let k = saved.length - 1; k >= 0; k--) { const [o, p, i] = saved[k]; p.children.splice(i, 0, o); }
  s.matrixWorldAutoUpdate = mwa;
  let n = 0; s.traverse(() => n++);
  const c0 = r.info.render.calls; r.render(s, c); const calls = r.info.render.calls - c0;
  return { msPerRender: full, withFinish: finish, walkGame: walk, walkThree: walkPlain, renderNoWalk: noWalk, renderNoWalkNoL30: noL30, walkThreeNoL30: walkNoL30, detached: det.length, callsNoL30, culledRoots: culled.length, nodesAfterRestore: n, callsPerRender: calls };
  } finally { for (const o of culled) o.visible = true; }
})()`;
const WALK = `(()=>{ let all = 0, vis = 0, proj = 0, l30 = 0, sprites = 0, physical = 0; const cl = GK.cam.layers;
  GK.scene.traverse(o => { all++; }); GK.scene.traverseVisible(o => { vis++; if (o.layers.mask === (1 << 30)) l30++; if (o.isSprite) sprites++; if (o.material && o.material.isMeshPhysicalMaterial) physical++; });
  return { all, visible: vis, layer30InVisible: l30, visibleSprites: sprites, visiblePhysicalMeshes: physical, programs: GK.renderer.info.programs.length } })()`;

async function main() {
  const port = await freePort(), base = 'http://127.0.0.1:' + port;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), GK_DEBUG: '1' }), stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await get(base + '/'); break; } catch (e) { await sleep(150); } }
  const dport = await freePort(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gkab-'));
  const flags = ['--headless=new', '--remote-debugging-port=' + dport, '--user-data-dir=' + dir, '--window-size=1600,900', '--mute-audio', '--no-first-run', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--enable-precise-memory-info', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'];
  if (process.env.UNCAPPED === '1') flags.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  const ch = spawn(BROWSER, flags.concat('about:blank'), { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + dport + '/json')); if (tabs.some(t => t.type === 'page')) break; } catch (e) {} await sleep(200); }
  const ws = new WS(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(); ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  const done = () => { try { ws.close(); } catch (e) {} try { ch.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', done);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('gk.settings', JSON.stringify({ gfx: '" + PRESET + "', fx: " + (PRESET !== 'low') + ", tags: true }))}catch(e){}" });
  await send('Page.navigate', { url: base + '/?offline=1&debug=1' });
  for (let i = 0; i < 200; i++) { if (await ev('!!(window.GK && GK.renderer && GK.menu)').catch(() => false)) break; await sleep(100); }
  const clickStart = "(()=>{__reseed();const b=[...document.querySelectorAll('button')].find(x=>/^(start|play)/i.test(x.textContent.trim())&&x.offsetParent); b&&b.click(); return !!b})()";
  await sleep(1200); await ev(clickStart);
  for (let i = 0; i < 300; i++) { const s = await ev('JSON.stringify({m: GK.mode, l: GK.locked})').catch(() => '{}'); if (/"m":"menu"/.test(s) && i % 8 === 4) await ev(clickStart); if (/"m":"play"/.test(s) && /"l":false/.test(s)) break; await sleep(250); }
  for (let i = 0; i < 200; i++) { if (await ev('__pf.baked > 0')) break; await sleep(250); }
  await sleep(1500);
  const rr = await ev("GKWORLD.roomRect('12')");
  const open = VIEW !== 'closed';
  await ev(`(()=>{ window.__sdo = GK.setDoorsOpen; GK.setDoorsOpen = ${open ? 'ids => __sdo(GK.doors.map(d => d.id))' : 'ids => __sdo([])'}; GK.setDoorsOpen([]); return 1 })()`);
  const place = `(GK.P.x=0,GK.P.z=${rr.hd - 3},GK.P.yaw=0,GK.P.pitch=-0.05,1)`;
  await ev(place); await sleep(3500); await ev(place);
  const measure = async () => { await ev(place); await ev('(__pf.start(),1)'); await sleep(FRAMES * 17 + 300); return ev('__pf.stop()'); };
  const pick = r => ({ calls: r.calls, cpu: r.cpu, rcpu: r.rcpu, ms: r.ms, p95: r.p95 });
  console.log('preset', PRESET, 'view', VIEW, 'uncapped', process.env.UNCAPPED === '1', 'gpu', await ev(`(()=>{const g=GK.renderer.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'?'})()`));
  const out = [];
  for (const k of EXPS) {
    const e = EXP[k]; if (!e) { console.log('unknown', k); continue; }
    if (k === 'walk') { const w = await ev(WALK); console.log('walk', JSON.stringify(w)); out.push({ k, walk: w }); continue; }
    if (k === 'micro') { for (let rep = 0; rep < REPS; rep++) { await ev(place); const w = await ev(MICRO); console.log('micro', JSON.stringify(w)); out.push({ k, micro: w }); await sleep(500); } continue; }
    const rows = [];
    for (let rep = 0; rep < REPS; rep++) {
      const a = await measure(); const info = await ev(e[0]); await sleep(400); const b = await measure(); await ev(e[1]); await sleep(400);
      rows.push({ base: pick(a), exp: pick(b), info });
    }
    const avg = (s, f) => +(rows.reduce((t, r) => t + r[s][f], 0) / rows.length).toFixed(2);
    const res = { k, info: rows[0].info, base: { calls: avg('base', 'calls'), cpu: avg('base', 'cpu'), rcpu: avg('base', 'rcpu'), ms: avg('base', 'ms'), p95: avg('base', 'p95') }, exp: { calls: avg('exp', 'calls'), cpu: avg('exp', 'cpu'), rcpu: avg('exp', 'rcpu'), ms: avg('exp', 'ms'), p95: avg('exp', 'p95') } };
    console.log(k.padEnd(12), JSON.stringify(res.info), 'base', JSON.stringify(res.base), '-> exp', JSON.stringify(res.exp)); out.push(res);
  }
  const o = arg('out', ''); if (o) fs.writeFileSync(o, JSON.stringify(out, null, 1));
  done(); setTimeout(() => process.exit(0), 300);
}
main().catch(e => { console.error(e); process.exit(2); });

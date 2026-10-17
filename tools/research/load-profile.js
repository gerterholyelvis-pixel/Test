#!/usr/bin/env node
// RESEARCH (docs/RESEARCH-perf.md): where the startup and match-start long tasks go. Touches no game file.
// Records a CDP CPU profile from navigation to "menu ready" and a second one from the Start click to "GO + icon bake done", then prints
// self time and total (inclusive) time by function, the long tasks seen, and bytes transferred per resource (no compression is served today).
//   node tools/research/load-profile.js [--preset low] [--top 30]
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net'), http = require('http'), { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const WS = require(require.resolve('ws', { paths: [ROOT] }));
const { PROBE } = require(path.join(ROOT, 'tools', 'perfbench.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const PRESET = arg('preset', 'low'), TOP = +arg('top', 30);
const BROWSER = process.env.CHROME || ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

function report(title, p) {   // self and inclusive time by function (inclusive counted once per sample even for recursion)
  const byId = new Map(); for (const n of p.nodes) byId.set(n.id, n);
  const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const key = f => (f.functionName || '(anon)') + ' ' + (f.url || '').split('/').pop() + ':' + (f.lineNumber + 1);
  const self = new Map(), incl = new Map(); let total = 0;
  for (let i = 0; i < p.samples.length; i++) {
    const us = p.timeDeltas[i] || 0; let id = p.samples[i]; total += us;
    const k0 = key(byId.get(id).callFrame); self.set(k0, (self.get(k0) || 0) + us);
    const seen = new Set(); while (id !== undefined) { const k = key(byId.get(id).callFrame); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + us); } id = parent.get(id); }
  }
  const idle = (self.get('(idle) :0') || 0) + (self.get('(program) :0') || 0);
  console.log('\n== ' + title + ': ' + (total / 1000).toFixed(0) + ' ms profiled, (idle)+(program) ' + (idle / 1000).toFixed(0) + ' ms');
  console.log('  self ms:'); for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log('   ' + (us / 1000).toFixed(0).padStart(6) + '  ' + k);
  console.log('  inclusive ms (game files and three only):');
  for (const [k, us] of [...incl].filter(([k]) => /\.js:/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, TOP)) console.log('   ' + (us / 1000).toFixed(0).padStart(6) + '  ' + k);
}
async function main() {
  const port = await freePort(), base = 'http://127.0.0.1:' + port;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), GK_DEBUG: '1' }), stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { try { await get(base + '/'); break; } catch (e) { await sleep(150); } }
  const dport = await freePort(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gklp-'));
  const ch = spawn(BROWSER, ['--headless=new', '--remote-debugging-port=' + dport, '--user-data-dir=' + dir, '--window-size=1600,900', '--mute-audio', '--no-first-run', '--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'], { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + dport + '/json')); if (tabs.some(t => t.type === 'page')) break; } catch (e) {} await sleep(200); }
  const ws = new WS(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(), resp = new Map();
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Network.responseReceived') resp.set(d.params.requestId, d.params.response.url); else if (d.method === 'Network.loadingFinished') { const u = resp.get(d.params.requestId); if (u) resp.set(d.params.requestId, [u, d.params.encodedDataLength]); } });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };
  const done = () => { try { ws.close(); } catch (e) {} try { ch.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} };
  process.on('exit', done);
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE + `;window.__lt=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:'longtask',buffered:true})}catch(e){}` });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('gk.settings', JSON.stringify({ gfx: '" + PRESET + "', fx: " + (PRESET !== 'low') + ", tags: true }))}catch(e){}" });
  await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 500 }); await send('Profiler.start');
  const t0 = Date.now(); await send('Page.navigate', { url: base + '/?offline=1&debug=1' });
  for (let i = 0; i < 400; i++) { if (await ev('!!(window.GK && GK.renderer && GK.menu)').catch(() => false)) break; await sleep(100); }
  const menuMs = Date.now() - t0; await sleep(1500);
  const p1 = (await send('Profiler.stop')).result.profile;
  const lt1 = await ev('__lt.slice()'); const mem1 = await ev('performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0');
  const bytes = [...resp.values()].filter(Array.isArray); let tot = 0; for (const [, b] of bytes) tot += b;
  console.log('menu ready', menuMs, 'ms; heap', mem1, 'MB; transferred', (tot / 1024).toFixed(0), 'KB in', bytes.length, 'responses (cache disabled)');
  for (const [u, b] of bytes.sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log('   ' + (b / 1024).toFixed(0).padStart(6) + ' KB  ' + u.replace(base, ''));
  console.log('long tasks to menu [start ms, duration ms]:', JSON.stringify(lt1.filter(x => x[1] > 100)));
  report('page load to menu', p1);
  await send('Profiler.start');
  const clickStart = "(()=>{__reseed();const b=[...document.querySelectorAll('button')].find(x=>/^(start|play)/i.test(x.textContent.trim())&&x.offsetParent); b&&b.click(); return !!b})()";
  const lt0 = lt1.length; const t1 = Date.now(); await ev(clickStart); let go = 0;
  for (let i = 0; i < 400; i++) { const s = await ev('JSON.stringify({m: GK.mode, l: GK.locked})').catch(() => '{}'); if (/"m":"menu"/.test(s) && i % 8 === 4) await ev(clickStart); if (/"m":"play"/.test(s) && /"l":false/.test(s)) { go = Date.now() - t1; break; } await sleep(200); }
  for (let i = 0; i < 300; i++) { if (await ev('__pf.baked > 0')) break; await sleep(200); }
  const bake = Date.now() - t1; await sleep(1000);
  const p2 = (await send('Profiler.stop')).result.profile; const lt2 = (await ev('__lt.slice()')).slice(lt0);
  console.log('\nStart click to GO', go, 'ms; to icon bake done', bake, 'ms; heap', await ev('Math.round(performance.memory.usedJSHeapSize / 1048576)'), 'MB; programs', await ev('GK.renderer.info.programs.length'));
  console.log('long tasks after Start [start ms, duration ms]:', JSON.stringify(lt2.filter(x => x[1] > 100)));
  report('Start click to bake done', p2);
  done(); setTimeout(() => process.exit(0), 300);
}
main().catch(e => { console.error(e); process.exit(2); });

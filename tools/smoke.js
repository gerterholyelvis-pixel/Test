// RELEASE: pre-release smoke test (npm run smoke). Boots its own server, opens the game in headless Edge / Chrome, presses Start, joins a real match
// (the queue fills with server bots), walks and fights for --secs seconds, then checks:
//   no console errors or uncaught exceptions on the page, the server stayed up and logged no errors, the page ran at >= --min-fps,
//   and the server tick stayed sane (mean <= --max-tick ms, read with the GK_DEBUG {botstat:1} hook from a second client in its own match).
//   node tools/smoke.js [--secs 60] [--dist] [--min-fps 20] [--max-tick 12] [--shot docs/screens/release/smoke.jpg] [--headed]
// --dist runs `npm run build` first and serves dist/ (GK_DIST=1), so the minified, hashed production files are what gets played.
// Exit code 0 = pass, 1 = a check failed (the reasons are printed), 2 = could not run (no browser).
const { spawn, execFileSync } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const WS = require('ws');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const SECS = +arg('secs', 60), DIST = !!arg('dist', false), MIN_FPS = +arg('min-fps', 20), MAX_TICK = +arg('max-tick', 12), SHOT = arg('shot', ''), HEADED = !!arg('headed', false), W = 1600, H = 900;
const CANDIDATES = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const BROWSER = process.env.CHROME || CANDIDATES.find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, body: b })); }).on('error', rej));
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const fails = [], note = s => console.log('smoke: ' + s);

async function main() {
  if (!BROWSER) { console.error('smoke: no Edge / Chrome found (set CHROME=path)'); process.exit(2); }
  if (DIST) { note('building dist/'); execFileSync(process.execPath, [path.join(ROOT, 'tools/build.js'), '--fast'], { stdio: 'inherit' }); }
  const port = await freePort(), base = 'http://127.0.0.1:' + port;
  let srvOut = '';
  const env = { ...process.env, PORT: String(port), GK_DEBUG: '1', GK_QUEUE_MS: '2500', GK_READY_MS: '4000', GK_COUNTDOWN_MS: '1500', ...(DIST ? { GK_DIST: '1' } : { GK_DIST: '0' }) };
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => srvOut += d); srv.stderr.on('data', d => srvOut += d);
  for (let i = 0; i < 80 && !/Goblin King on/.test(srvOut); i++) await sleep(100);
  if (DIST && !/\(dist/.test(srvOut) && !/dist: not used/.test(srvOut)) { /* GK_DEBUG prints no production suffix; check /version instead */ }
  const ver = JSON.parse((await get(base + '/version')).body); note('server ' + ver.version + ' ' + (ver.commit || '') + (ver.dist ? ' (dist)' : ' (source files)'));
  if (DIST && !ver.dist) fails.push('--dist given but the server is not serving dist/ (' + srvOut.split('\n').filter(l => /dist/.test(l)).join(' ') + ')');

  // browser
  const dport = await freePort(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gksmoke-'));
  const flags = [...(HEADED ? [] : ['--headless=new']), '--remote-debugging-port=' + dport, '--user-data-dir=' + dir, '--window-size=' + W + ',' + H, '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-gpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'];
  if (process.platform === 'win32') flags.push('--use-angle=' + (process.env.ANGLE || 'd3d11'));
  const ch = spawn(BROWSER, flags.concat('about:blank'), { stdio: 'ignore' });
  let ws = null;
  const cleanup = () => { try { ws && ws.close(); } catch (e) {} try { ch.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} };
  process.on('exit', cleanup);
  let tabs = []; for (let i = 0; i < 80; i++) { try { tabs = JSON.parse((await get('http://127.0.0.1:' + dport + '/json')).body); if (tabs.some(t => t.type === 'page')) break; } catch (e) {} await sleep(200); }
  ws = new WS(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(), logs = [];
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('console.error: ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
    else if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + String(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).slice(0, 400));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error' && !/favicon/.test(d.params.entry.url || '')) logs.push('log: ' + d.params.entry.text.slice(0, 200) + ' ' + (d.params.entry.url || '')); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(String(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || JSON.stringify(r.result.exceptionDetails)).slice(0, 300)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{localStorage.setItem('gk.tips.v1', JSON.stringify({ on: false, seen: {} }))}catch(e){} window.__fr = 0; (function f(){ window.__fr++; requestAnimationFrame(f); })();" });

  // load the page, wait for the title screen
  const t0 = Date.now(); await send('Page.navigate', { url: base + '/' });
  let up = false; for (let i = 0; i < 300; i++) { if (await ev("!!(window.GK && GK.renderer && document.body.classList.contains('tready'))").catch(() => false)) { up = true; break; } await sleep(100); }
  if (!up) fails.push('the title screen never came up in 30 s');
  note('title screen in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  const boot = await ev("JSON.stringify({ver: (document.querySelector('#menu .foot .gkVer')||{}).textContent || '', bootFail: !!document.getElementById('gkBootFail'), unsupported: !!document.getElementById('gkUnsupported')})").catch(() => '{}');
  note('boot ' + boot); if (/"bootFail":true|"unsupported":true/.test(boot)) fails.push('boot screen shown: ' + boot);

  // Start -> queue -> match with bots -> GO
  const clickStart = "(()=>{const b=document.getElementById('b-start'); if(b&&b.offsetParent){b.click(); return true} return false})()";
  await ev(clickStart).catch(() => false);
  let go = false; const tq = Date.now();
  for (let i = 0; i < 160; i++) { const s = await ev("JSON.stringify({m: window.GK && GK.mode, l: window.GK && GK.locked})").catch(() => '{}'); if (/"m":"play"/.test(s) && !/"l":true/.test(s)) { go = true; break; } if (/"m":"menu"/.test(s) && i % 10 === 5) await ev(clickStart).catch(() => false); await sleep(250); }
  if (!go) fails.push('never reached GO in a match (40 s)'); else note('in the match after ' + ((Date.now() - tq) / 1000).toFixed(1) + ' s');

  // a second client in its own match (high victory count) only to read the server tick timing
  let tick = null;
  const probe = new WS('ws://127.0.0.1:' + port + '/?wins=9999&name=Probe');
  probe.on('message', raw => { try { const d = JSON.parse(raw); if (d.botstat) tick = d.botstat.tick; if (d.matchStart) probe.send(JSON.stringify({ ready: 1 })); } catch (e) {} });

  // play: walk around, turn, attack, interact
  const key = async (code, type) => send('Input.dispatchKeyEvent', { type, code, key: code.replace(/^Key/, '').toLowerCase(), windowsVirtualKeyCode: { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, KeyE: 69, ShiftLeft: 16 }[code] || 0 });
  const fr0 = await ev('window.__fr').catch(() => 0), tp = Date.now(); let n = 0;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W / 2, y: H / 2, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W / 2, y: H / 2, button: 'left', clickCount: 1 });
  while (Date.now() - tp < SECS * 1000) {
    const dirs = ['KeyW', 'KeyW', 'KeyA', 'KeyD', 'KeyS'], d = dirs[n % dirs.length];
    await key(d, 'keyDown'); if (n % 3 === 0) await key('ShiftLeft', 'keyDown');
    for (let k = 0; k < 6; k++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: W / 2 + Math.sin(n + k) * 300, y: H / 2 }); await sleep(150); }
    await key(d, 'keyUp'); await key('ShiftLeft', 'keyUp');
    if (n % 2 === 0) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: W / 2, y: H / 2, button: 'left', clickCount: 1 }); await sleep(60); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: W / 2, y: H / 2, button: 'left', clickCount: 1 }); }
    if (n % 4 === 1) { await key('KeyE', 'keyDown'); await sleep(80); await key('KeyE', 'keyUp'); }
    if (probe.readyState === 1) probe.send(JSON.stringify({ botstat: 1 }));
    n++;
  }
  const secs = (Date.now() - tp) / 1000, fps = ((await ev('window.__fr').catch(() => fr0)) - fr0) / secs;
  if (SHOT) { try { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); fs.mkdirSync(path.dirname(path.resolve(ROOT, SHOT)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, SHOT), Buffer.from(s.result.data, 'base64')); note('screenshot ' + SHOT); } catch (e) { note('screenshot failed ' + e.message); } }
  const state = await ev("JSON.stringify({mode: GK.mode, lost: !!document.getElementById('gkLost')})").catch(e => 'eval failed: ' + e.message);
  note('played ' + secs.toFixed(0) + ' s, ' + fps.toFixed(1) + ' fps, page ' + state + (tick ? ', server tick mean ' + (tick.sum / Math.max(1, tick.n)).toFixed(2) + ' ms, max ' + tick.max.toFixed(1) + ' ms over ' + tick.n + ' ticks' : ''));
  if (fps < MIN_FPS) fails.push('fps ' + fps.toFixed(1) + ' < ' + MIN_FPS);
  if (tick && tick.n && tick.sum / tick.n > MAX_TICK) fails.push('server tick mean ' + (tick.sum / tick.n).toFixed(2) + ' ms > ' + MAX_TICK);
  if (/"lost":true/.test(state)) fails.push('the connection-lost dialog is showing');
  if (srv.exitCode !== null) fails.push('the server exited');
  const srvErr = srvOut.split('\n').filter(l => /\b(uncaught|unhandled|TypeError|ReferenceError|RangeError)\b|^message id=|^close id=|tick failed/i.test(l));
  if (srvErr.length) fails.push('server errors:\n    ' + srvErr.slice(0, 8).join('\n    '));
  if (logs.length) fails.push('page errors:\n    ' + [...new Set(logs)].slice(0, 12).join('\n    '));
  try { probe.close(); } catch (e) {}
  console.log(fails.length ? '\nSMOKE FAILED\n  - ' + fails.join('\n  - ') : '\nSMOKE PASSED');
  cleanup(); process.exit(fails.length ? 1 : 0);
}
main().catch(e => { console.error('smoke: crashed', e); process.exit(1); });

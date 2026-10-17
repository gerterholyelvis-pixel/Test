// QA playtest driver (docs/PLAYTEST.md, docs/reports/qa-full.md): starts the game server on a random port (env passes through: GK_DEBUG,
// GK_MATCH_SIZE, GK_ROUND_MS...) and a headless Edge on the real GPU (ANGLE d3d11; ANGLE=swiftshader for software GL), and listens on an
// HTTP control port (CTRL, default 9339). Input goes in as trusted CDP events. Drive it with tools/qa/q.js (one command per call) or the
// helpers next to it (go.js: Start + wait for GO, walk.js: walk through open doors, near.js / timing.js / fight.js: activities and combat).
// POST {op, ...}: eval {js}, key {code, ms}, down / up {code}, hold {codes, ms}, click {x,y} | {sel}, mdown / mup, move {dx,dy}, shot {name},
// log (browser console errors / warnings), srvlog {tail}, nav {url}, port, quit.   Env: W, H (viewport), PRESET (low/medium/high/ultra), OUT (screens).
const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const ROOT = process.env.GK_ROOT || path.join(__dirname, '..', '..');
const WS = require(path.join(ROOT, 'node_modules/ws'));
const CHROME = process.env.CHROME || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CTRL = +process.env.CTRL || 9339, W = +process.env.W || 1280, H = +process.env.H || 720, OUT = process.env.OUT || path.join(ROOT, 'docs/screens');
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const KEYS = { Tab: ['Tab', 9], Escape: ['Escape', 27], Enter: ['Enter', 13], Space: [' ', 32], ShiftLeft: ['Shift', 16], Backquote: ['`', 192], ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40] };
for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') KEYS['Key' + c] = [c.toLowerCase(), c.charCodeAt(0)];
for (let i = 0; i <= 9; i++) KEYS['Digit' + i] = [String(i), 48 + i];
(async () => {
  const port = +process.env.PORT_GAME || await freePort(), dport = await freePort();
  let srvLog = '';
  const env = Object.assign({}, process.env, { PORT: String(port) }); delete env.CTRL;
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stdout.on('data', d => srvLog += d); srv.stderr.on('data', d => srvLog += d);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gkqa-'));
  const args = ['--headless=new', '--remote-debugging-port=' + dport, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--window-size=' + W + ',' + H, '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--use-angle=' + (process.env.ANGLE || 'd3d11'), '--autoplay-policy=no-user-gesture-required', 'about:blank'];
  const ch = spawn(CHROME, args, { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 80; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + dport + '/json')); if (tabs.find(t => t.type === 'page')) break; } catch (e) {} await sleep(250); }
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WS(tab.webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(), logs = [];
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    else if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) logs.push(d.params.type + ': ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 400));
    else if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + String(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).slice(0, 600));
    else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') logs.push('log: ' + d.params.entry.text.slice(0, 300) + ' ' + (d.params.entry.url || ''));
    else if (d.method === 'Target.targetCreated') logs.push('target: ' + d.params.targetInfo.type + ' ' + d.params.targetInfo.url);
  });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; const t = setTimeout(() => { if (pend.has(i)) { pend.delete(i); r({ error: 'cdp timeout ' + method }); } }, 60000); pend.set(i, d => { clearTimeout(t); r(d); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>{ return (' + expr + '); })()', awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return { err: (r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails.text).slice(0, 500) }; return r.result && r.result.result ? r.result.result.value : r; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Target.setDiscoverTargets', { discover: true });
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  if (process.env.PRESET) await send('Page.addScriptToEvaluateOnNewDocument', { source: "if(!localStorage.getItem('gk.settings'))localStorage.setItem('gk.settings', JSON.stringify({ gfx: '" + process.env.PRESET + "' }));" });
  const kd = (code, type) => { const [k, vk] = KEYS[code] || [code, 0]; return send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: type === 'keyDown' && k.length === 1 ? k : undefined }); };
  const click = async (x, y, btn = 'left') => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: btn, clickCount: 1 }); await sleep(40); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: btn, clickCount: 1 }); };
  let mx = W / 2, my = H / 2;
  const ops = {
    eval: async c => ev(c.js),
    key: async c => { await kd(c.code, 'keyDown'); await sleep(c.ms || 40); await kd(c.code, 'keyUp'); return 'ok'; },
    down: async c => { await kd(c.code, 'keyDown'); return 'ok'; },
    up: async c => { await kd(c.code, 'keyUp'); return 'ok'; },
    hold: async c => { for (const k of c.codes) await kd(k, 'keyDown'); await sleep(c.ms || 500); for (const k of c.codes) await kd(k, 'keyUp'); return 'ok'; },
    click: async c => { if (c.sel) { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(c.sel)}); if(!e) return null; const q=e.getBoundingClientRect(); return {x:q.x+q.width/2,y:q.y+q.height/2,vis:!!e.offsetParent}})()`); if (!r) return 'no element'; await click(r.x, r.y, c.btn); return r; } await click(c.x, c.y, c.btn); return 'ok'; },
    mdown: async c => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mx, y: my, button: c.btn || 'left', clickCount: 1 }); return 'ok'; },
    mup: async c => { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mx, y: my, button: c.btn || 'left', clickCount: 1 }); return 'ok'; },
    move: async c => { const n = c.n || 5; for (let i = 0; i < n; i++) { mx += c.dx / n; my += (c.dy || 0) / n; await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(mx), y: Math.round(my) }); await sleep(16); } mx = W / 2; my = H / 2; return 'ok'; },
    shot: async c => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: c.q || 70 }); if (!r.result) return r; const f = path.join(OUT, c.name + '.jpg'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f; },
    log: async c => { const l = logs.slice(); if (c.clear !== false) logs.length = 0; return l; },
    srvlog: async c => { const t = srvLog; if (c.clear) srvLog = ''; return c.tail ? t.slice(-c.tail) : t; },
    nav: async c => { await ev('(location.href=' + JSON.stringify(c.url.startsWith('http') ? c.url : 'http://localhost:' + port + c.url) + ',1)'); return 'ok'; },
    port: async () => port,
    quit: async () => { setTimeout(() => { try { ch.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} process.exit(0); }, 100); return 'bye'; },
  };
  http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', async () => { let out; try { const c = JSON.parse(b || '{}'); out = await (ops[c.op] || (async () => 'unknown op'))(c); } catch (e) { out = { err: String(e.stack || e) }; } res.end(JSON.stringify(out)); }); }).listen(CTRL, () => console.log('ctrl on ' + CTRL + ' game on ' + port));
  srv.on('exit', c => { console.log('SERVER EXITED ' + c); srvLog += '\nSERVER EXITED ' + c; });
})();

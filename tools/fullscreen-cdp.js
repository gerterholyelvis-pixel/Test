// Dev tool: does opening / closing a panel with E keep the page in fullscreen and the player able to move and look?
// Drives a real Chrome / Edge over CDP with trusted input (Input.dispatchKeyEvent / dispatchMouseEvent count as user gestures).
//   node tools/fullscreen-cdp.js                      starts its own server on a random port, headful Chrome
//   HEADLESS=1 node tools/fullscreen-cdp.js           headless (new) instead
//   CHROME="C:\...\msedge.exe" node tools/fullscreen-cdp.js
//   GK_ROOT=<other checkout> node tools/fullscreen-cdp.js   serve that checkout instead (before / after comparisons)
//   MODE=f11 node tools/fullscreen-cdp.js             browser (F11-style) fullscreen via Browser.setWindowBounds instead of the game's F key
// For every panel (inventory, merchant, recycler, workbench, knowledge tree, Elixir Screen, loot) it opens it with E (Tab for the
// inventory), closes it with E (and once with the close button, once with a click outside), and after each step logs
// document.fullscreenElement, document.pointerLockElement, the window state, and whether W moves the player and the mouse turns him.
// Exit code 1 if fullscreen was ever lost or the player could not move / look after a panel closed.
const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), net = require('net');
const WS = require('ws');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HEADLESS = process.env.HEADLESS === '1', MODE = process.env.MODE || 'f';
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const KEYS = { KeyE: ['e', 69], KeyF: ['f', 70], KeyW: ['w', 87], KeyI: ['i', 73], KeyT: ['t', 84], Tab: ['Tab', 9], Escape: ['Escape', 27] };
async function main() {
  const root = process.env.GK_ROOT || path.join(__dirname, '..'),   // GK_ROOT: run against another checkout (e.g. the code before the fix)
    port = await freePort(), dport = await freePort();
  const srv = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env: Object.assign({}, process.env, { PORT: String(port) }), stdio: 'ignore' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gkfs-'));
  const args = ['--remote-debugging-port=' + dport, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', '--mute-audio', 'about:blank'];
  if (HEADLESS) args.unshift('--headless=new', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader');   // headful uses the real GPU, like the owner's Chrome
  const ch = spawn(CHROME, args, { stdio: 'ignore' });
  const bye = code => { try { ch.kill(); } catch (e) {} try { srv.kill(); } catch (e) {} setTimeout(() => process.exit(code), 400); };
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + dport + '/json')); if (tabs.find(t => t.type === 'page')) break; } catch (e) {} await sleep(250); }
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WS(tab.webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(), logs = [];
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('error: ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 200)); else if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + String(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).slice(0, 300)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; const t = setTimeout(() => { if (pend.has(i)) { pend.delete(i); console.log('  (cdp timeout: ' + method + ')'); r({}); } }, 30000); pend.set(i, d => { clearTimeout(t); r(d); }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result && r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Page.bringToFront');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('gk.settings', JSON.stringify({ gfx: 'low', fx: false }));" + (process.env.FSWISH ? "localStorage.setItem('gk.fsWish','1');" : '') + "window.__k=[];window.__kl='none';try{const K=navigator.keyboard,L=K.lock.bind(K);K.lock=function(a){window.__kl='asked';return L(a).then(v=>{window.__kl='ok';return v},e=>{window.__kl='err '+e.name;throw e})}}catch(e){};addEventListener('keydown',e=>__k.push('d'+e.code+(e.isTrusted?'':'!')),true);addEventListener('keyup',e=>__k.push('u'+e.code),true);addEventListener('blur',()=>__k.push('blur'));" });
  const win = (await send('Browser.getWindowForTarget', {})).result; const winId = win && win.windowId;
  const winState = async () => { try { return (await send('Browser.getWindowBounds', { windowId: winId })).result.bounds.windowState; } catch (e) { return '?'; } };
  const key = async (code, holdMs = 30) => { const [k, vk] = KEYS[code]; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text: k.length === 1 ? k : undefined }); await sleep(holdMs); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }); };
  const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(30); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); };
  const state = async tag => { const s = await ev(`({fs: !!document.fullscreenElement, fsEl: document.fullscreenElement ? document.fullscreenElement.tagName : null, lock: !!document.pointerLockElement, panel: GK.panelOpen ? GK.panelOpen() : !![...document.querySelectorAll('#gkInv,#gkShop,#gkRec,#gkCraft,#gkLoot')].find(e => e.style.display === 'flex'), mode: GK.mode, pseudo: document.documentElement.classList.contains('gk-pseudofs'), kl: window.__kl, w: innerWidth, h: innerHeight})`); s.win = await winState(); s.tag = tag; console.log(JSON.stringify(s)); return s; };
  const canMove = async () => {   // hold W for 1 s, then nudge the mouse: did the player move / turn?
    const a = await ev('({x: GK.P.x, z: GK.P.z, yaw: GK.P.yaw})');
    const [k, vk] = KEYS.KeyW; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: 'KeyW', windowsVirtualKeyCode: vk, text: 'w' }); await sleep(1000); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: 'KeyW', windowsVirtualKeyCode: vk });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640, y: 400 }); await sleep(60);
    const b = await ev('({x: GK.P.x, z: GK.P.z, yaw: GK.P.yaw})');
    for (let i = 0; i < 6; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 640 + 20 * (i + 1), y: 400 }); await sleep(16); }
    const c = await ev('({yaw: GK.P.yaw})');
    await ev(`(GK.P.x=${a.x},GK.P.z=${a.z},GK.P.yaw=${a.yaw},1)`);   // put him back so the next station is still in reach
    return { moved: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), turned: +Math.abs(c.yaw - b.yaw).toFixed(3) };
  };
  const fails = [];
  await send('Page.navigate', { url: 'http://localhost:' + port + '/?offline=1' }); await sleep(3000);
  for (let i = 0; i < 80; i++) {
    const r = await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^start/i.test(x.textContent.trim())&&x.offsetParent); if(!b) return null; const q=b.getBoundingClientRect(); return {x:q.x+q.width/2,y:q.y+q.height/2, m: GK.mode}})()`).catch(() => null);
    const m = await ev('GK.mode').catch(() => '');
    if (m === 'play' && await ev('!!(GK.P && GK.actors && GK.actors.size) && (!GK.r5 || GK.r5.pending().length === 0)').catch(() => false)) break;
    if (r && i % 4 === 0) await click(r.x, r.y);
    await sleep(500);
  }
  await sleep(1500);
  if (MODE === 'f11') { await send('Browser.setWindowBounds', { windowId: winId, bounds: { windowState: 'fullscreen' } }); await sleep(800); await click(640, 400); }
  else { await click(640, 400); await sleep(300); await key('KeyF'); }
  await sleep(1200); await click(640, 400); await sleep(500);
  const s0 = await state('start'); console.log('  move at start', JSON.stringify(await canMove()), await ev('JSON.stringify({locked: GK.locked, keys: __k.slice(-12)})')); const want = MODE === 'f11' ? 'win' : 'fs';
  const lost = s => MODE === 'f11' ? s.win !== 'fullscreen' : !s.fs;
  if (lost(s0)) fails.push('could not enter fullscreen at all');
  async function dropTests() {   // the browser drops fullscreen while a panel is open (what Esc does without keyboard lock): the closing key must bring back fullscreen, the lock and movement
    await ev('(GK.P.x=0,GK.P.z=3,GK.P.yaw=0,GK.P.pitch=0,1)'); await sleep(300);   // open floor in the start room
    await key('Tab'); await sleep(400); await ev('document.exitFullscreen().then(()=>1,()=>0)'); await sleep(700);
    const d = await state('dropped while the bag is open');
    await key('KeyE'); await sleep(900);
    const r = await state('bag closed with E after the drop');
    if (!r.fs) fails.push('drop: fullscreen not retaken by the closing key'); if (r.panel) fails.push('drop: E did not close the bag');
    const mv = await canMove(); console.log('  move after drop', JSON.stringify(mv)); if (mv.moved < 0.1) fails.push('drop: cannot move'); if (mv.turned < 0.01) fails.push('drop: cannot look');
    void d;
    // a real Esc keypress through the browser with keyboard lock unavailable (as on an http:// LAN address): Chromium leaves fullscreen; the next W must fix it
    await ev('(navigator.keyboard && navigator.keyboard.unlock(), 1)'); await key('Tab'); await sleep(400); await key('Escape'); await sleep(900);
    const e1 = await state('bag closed with Esc, no keyboard lock'); if (e1.panel) fails.push('esc: the bag stayed open after the browser kept Esc');
    await key('KeyW'); await sleep(900);
    const e2 = await state('after one W'); if (!e2.fs) fails.push('esc: W did not retake fullscreen'); if (e1.fs) console.log('  (Esc did not leave fullscreen here)');
    const mv2 = await canMove(); console.log('  move after Esc', JSON.stringify(mv2)); if (mv2.moved < 0.1) fails.push('esc: cannot move'); if (mv2.turned < 0.01) fails.push('esc: cannot look');
  }
  if (MODE !== 'f11') await dropTests();
  const targets = await ev(`(()=>{const out={}; for (const o of GK.stationTargets||[]) { const k=o.userData.station; if (!['recycler','workbench','knowledge','screen'].includes(k)||out[k]) continue; o.updateMatrixWorld(true); const p=new GK.cam.position.constructor(); o.getWorldPosition(p); out[k]={x:p.x,y:p.y,z:p.z}; } for (const o of GK.merchantTargets||[]) { if (out.merchant) break; const p=new GK.cam.position.constructor(); o.getWorldPosition(p); out.merchant={x:p.x,y:p.y+1,z:p.z}; } return out})()`);
  async function aimAt(t) {   // stand 1.8 m away, try 12 headings until the crosshair ray finds the station
    for (let a = 0; a < 12; a++) {
      const yaw = a * Math.PI / 6;
      await ev(`(GK.P.x=${t.x}+Math.sin(${yaw})*1.8, GK.P.z=${t.z}+Math.cos(${yaw})*1.8, GK.P.yaw=${yaw}, GK.P.pitch=Math.atan2(${t.y}-1.4,1.8)*0.6, 1)`); await sleep(160);
      const h = await ev('GK.hover()'); if (h && h.room >= 0) return h;
    }
    return null;
  }
  const panels = [['inventory', null], ['inventory-esc', null], ...Object.entries(targets)];
  let n = 0;
  for (const [name, t] of panels) {
    const how = ['E', 'button', 'outside'][n++ % 3];
    if (await ev('GK.mode') !== 'play') { fails.push('the demo player died before ' + name + ' (bots): rerun'); break; }
    if (t) { const h = await aimAt(t); if (!h) { console.log('skip ' + name + ': could not aim'); continue; } }
    const b = await state(name + ' before');
    await key(t ? 'KeyE' : 'Tab'); await sleep(500);
    const o = await state(name + ' open');
    if (!o.panel) { console.log('  (' + name + ' did not open a panel here, e.g. not my home / no merchant stock in the offline demo: skipped)'); continue; }
    if (lost(o)) fails.push(name + ': fullscreen lost on open');
    if (o.panel) {
      if (name === 'inventory-esc') await key('Escape');
      else if (how === 'E' || !t) await key(t ? 'KeyE' : 'Tab');
      else if (how === 'button') { const r = await ev(`(()=>{const e=[...document.querySelectorAll('button')].find(x=>x.offsetParent&&/close/i.test(x.textContent+' '+(x.getAttribute('aria-label')||''))); if(!e) return null; const q=e.getBoundingClientRect(); return {x:q.x+q.width/2,y:q.y+q.height/2}})()`); if (r) await click(r.x, r.y); else await key('KeyE'); }
      else await click(8, 8);
      await sleep(400);
    }
    const c = await state(name + ' closed (' + (name === 'inventory-esc' ? 'Esc' : t ? how : 'Tab') + ')');
    if (lost(c)) fails.push(name + ': fullscreen lost on close');
    if (c.panel) fails.push(name + ': panel did not close by ' + how);
    const mv = await canMove(); console.log('  move after close', JSON.stringify(mv));
    if (mv.moved < 0.1) fails.push(name + ': cannot move after close'); if (mv.turned < 0.01) fails.push(name + ': cannot look after close');
    void b;
  }
  if (logs.length) console.log('console:\n' + logs.slice(0, 20).join('\n'));
  console.log(fails.length ? 'FAIL\n- ' + fails.join('\n- ') : 'PASS: fullscreen kept, moving and looking after every panel');
  ws.close(); bye(fails.length ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });

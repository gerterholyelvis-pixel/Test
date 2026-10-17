// Dev tool: drive a real (headless) Chrome over CDP against a running dev server, start the offline demo, move the camera and save screenshots / draw-call numbers.
//   node server.js (PORT=3111)  then  node tools/r5shot.js http://localhost:3111 scenario.js
// The scenario module exports async (ctx) => {}; ctx has: ev(expr) -> value, shot(file), tp(x, z, yaw, pitch), wait(ms), info() -> renderer.info numbers.
const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const WS = require('ws');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const base = process.argv[2] || 'http://localhost:3111', scn = require(path.resolve(process.argv[3])), port = 9300 + (process.pid % 500), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r5shot-'));
  const W = +process.env.W || 1280, Hh = +process.env.H || 720;
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--window-size=' + W + ',' + Hh, '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=' + (process.env.ANGLE || 'swiftshader'), 'about:blank'], { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 50; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + port + '/json')); if (tabs.length) break; } catch (e) {} await sleep(200); }
  const ws = new WS(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ': ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300)); else if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).slice(0, 400)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Emulation.setDeviceMetricsOverride', { width: W, height: Hh, deviceScaleFactor: 1, mobile: false });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || r.result.exceptionDetails)); return r.result.result.value; };
  const ctx = {
    ev, wait: sleep, logs,
    shot: async file => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 }); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    tp: async (x, z, yaw, pitch = 0) => { await ev(`(GK.P.x=${x},GK.P.z=${z},GK.P.yaw=${yaw},GK.P.pitch=${pitch},1)`); await sleep(350); },
    info: () => ev(`(async()=>{const r=GK.renderer,i=r.info;i.autoReset=false;i.reset();let n=0;await new Promise(res=>{const f=()=>{if(++n>=12)res();else requestAnimationFrame(f)};requestAnimationFrame(f)});const o={calls:Math.round(i.render.calls/n),tris:Math.round(i.render.triangles/n),geo:i.memory.geometries,tex:i.memory.textures,prog:i.programs&&i.programs.length};i.autoReset=true;return o})()`),
  };
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "localStorage.setItem('gk.settings', JSON.stringify({ gfx: '" + (process.env.GFX || 'low') + "', fx: " + (process.env.FX === '1') + " }))" }); console.log('navigating'); await send('Page.navigate', { url: base + (process.env.Q || '/?offline=1&debug=1') }); await sleep(2500);   // Q=/ : online against the real server
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^start/i.test(x.textContent.trim())); b&&b.click(); return !!b})()`);
  for (let i = 0; i < (process.env.WAIT === undefined ? 120 : +process.env.WAIT); i++) { const s = await ev('JSON.stringify({m: GK.mode, p: GK.r5 && GK.r5.pending().length, e: GK.r5 && GK.r5.entries.size})').catch(e => 'err ' + e.message.slice(0, 80)); if (i % 6 === 0) console.log(i, s); if (/"m":"menu"/.test(s) && i % 4 === 1) await ev("(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^start/i.test(x.textContent.trim())); b&&b.click(); return !!b})()"); if (/"m":"play"/.test(s) && /"p":0/.test(s)) break; await sleep(500); }
  console.log('playing'); await sleep(800);
  try { await scn(ctx); } catch (e) { console.log('scenario error', e.stack || e); }
  if (logs.length) console.log('console:\n' + logs.slice(0, 30).join('\n'));
  ws.close(); ch.kill(); setTimeout(() => process.exit(0), 300);
}
main();

// Dev tool: contact sheets of baked item icons. Serves the repo statically on a random port, opens tools/icon-lab.html in headless Edge/Chrome over CDP
// (random debug port), bakes only the wanted keys and saves the sheet.
//   node tools/icon-sheet.js out.png [filter] [px] [cell] [cols] [small]
//   filter: armor | util | charm | part | weapon | all | comma list of keys. px = bake size (window.GK_ICON_PX), cell = sheet cell px, small=1 adds a 40 px strip.
const { spawn } = require('child_process'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const WS = require('ws');
const BROWSER = process.env.CHROME || ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'].find(p => fs.existsSync(p));
const ROOT = path.join(__dirname, '..'), TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = url => new Promise((res, rej) => http.get(url, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(b)); }).on('error', rej));
(async () => {
  const [out, filter = 'all', px = '160', cell = '160', cols = '8', small = '0'] = process.argv.slice(2);
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]), f;
    if (p.startsWith('/three/addons/')) f = path.join(ROOT, 'node_modules/three/examples/jsm', p.slice(14)); else if (p.startsWith('/three/')) f = path.join(ROOT, 'node_modules/three/build', p.slice(7)); else f = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port;
  const port = 20000 + Math.floor(Math.random() * 20000), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'icsheet-'));
  const ch = spawn(BROWSER, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + dir, '--window-size=1000,800', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' });
  let tabs; for (let i = 0; i < 60; i++) { try { tabs = JSON.parse(await get('http://127.0.0.1:' + port + '/json')); if (tabs.length) break; } catch (e) {} await sleep(250); }
  const ws = new WS(tabs.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(), logs = [];
  ws.on('message', m => { const d = JSON.parse(m); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) logs.push(d.params.type + ' ' + d.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300)); else if (d.method === 'Runtime.exceptionThrown') logs.push('exception ' + JSON.stringify(d.params.exceptionDetails.exception && d.params.exceptionDetails.exception.description || d.params.exceptionDetails.text).slice(0, 400)); });
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => { const r = await send('Runtime.evaluate', { expression: '(async()=>(' + expr + '))()', awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500)); return r.result.result.value; };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: base + '/tools/icon-lab.html?' + new URLSearchParams({ filter, px, cell, cols, small, ...(process.env.DROPS ? { drops: process.env.DROPS } : {}) }) });
  let st = null; for (let i = 0; i < 1200; i++) { await sleep(500); try { st = await ev('window.__sheet ? {n: __sheet.n, ms: __sheet.bakeMs} : null'); } catch (e) {} if (st) break; if (i % 40 === 39) console.log('waiting', i / 2, 's', logs.slice(-2)); }
  if (!st) { console.log('no sheet', logs.slice(0, 8)); ch.kill(); srv.close(); process.exit(1); }
  const url = await ev(/.jpe?g$/.test(out) ? '__sheet.jpg' : '__sheet.url'); fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  console.log('wrote', out, st.n, 'icons, bake', st.ms, 'ms', logs.length ? 'LOGS: ' + logs.slice(0, 8).join(' | ') : '');
  ws.close(); ch.kill(); srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} process.exit(0);
})();

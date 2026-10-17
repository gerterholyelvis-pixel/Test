// tools/qa helper: open the page, press Start, wait for GO; optional: skip round 1 (debug button)
const http = require('http'), CTRL = +process.env.CTRL || 9339;
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js }), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const port = await rpc({ op: 'port' });
  if (process.argv[2] !== 'nonav') { await ev(`(location.href='http://localhost:${port}/',1)`); await sleep(6000); }
  await rpc({ op: 'click', sel: '#b-start' });
  for (let i = 0; i < 80; i++) { const s = await ev('JSON.stringify({m:GK.mode,l:GK.locked})').catch(() => null); if (s && /"m":"play","l":false/.test(s)) break; await sleep(500); }
  console.log(await ev('JSON.stringify({mode:GK.mode, home:GK.myHome, n:GK.roundInfo().n, trees: GK.r5 && GK.r5.treeMap && GK.r5.treeMap(), layout: GK.layout})'));
  if (process.argv.includes('skip')) { await rpc({ op: 'click', sel: '.gk5-sk' }); for (let i = 0; i < 40; i++) { if (await ev('GK.roundInfo().n') >= 2) break; await sleep(500); } console.log('round', await ev('GK.roundInfo().n')); }
})();

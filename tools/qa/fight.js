// tools/qa helper: face the nearest living goblin / NPC in my room and hold the mouse button (hold-to-attack) for N seconds, re-aiming every 100 ms
const http = require('http'), CTRL = +process.env.CTRL || 9339;
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js }), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const secs = +process.argv[2] || 6, chase = process.argv[3] !== '0', t0 = Date.now();
  await rpc({ op: 'mdown' });
  let last = null;
  while (Date.now() - t0 < secs * 1000) {
    const s = await ev(`(()=>{const P=GK.P;let best=null,bd=1e9;const me=GK.tipEnv().mine;for(const a of GK.actors.values()){if(a===me||a.dead||a.hp<=0)continue;const d=Math.hypot(a.x-P.x,a.z-P.z);if(d<bd&&GK.roomKeyAt(a.x,a.z)===GK.roomKeyAt(P.x,P.z)){bd=d;best=a}}if(!best)return {mode:GK.mode};P.yaw=Math.atan2(-(best.x-P.x),-(best.z-P.z));P.pitch=-0.05;return {n:best.name,d:+bd.toFixed(1),hp:best.hp,mode:GK.mode}})()`);
    last = s;
    if (!s || s.mode !== 'play' || !s.n) break;
    if (chase && s.d > 1.8) await rpc({ op: 'down', code: 'KeyW' }); else await rpc({ op: 'up', code: 'KeyW' });
    await sleep(100);
  }
  await rpc({ op: 'mup' }); await rpc({ op: 'up', code: 'KeyW' });
  console.log('last target', JSON.stringify(last));
})();

// tools/qa helper: wait for the needle to sit in the middle of the window, then press E (like a player watching the arc); repeat n times
const http = require('http'), CTRL = +process.env.CTRL || 9339;
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js }), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const n = +process.argv[2] || 3, key = process.argv[3] || 'KeyE';
  for (let i = 0; i < n; i++) {
    const w = await ev(`(async()=>{for(let k=0;k<200;k++){const t=GKACT5.A.me&&GKACT5.A.me.timing;if(!t)return 'no timing';const ph=(((GK.srvNow()-t.t0)%t.per)+t.per)%t.per/t.per,mid=((t.wa+t.wb)/2)%1;let d=ph-mid;if(d<-0.5)d+=1;if(d>0.5)d-=1;if(d>-0.08&&d<-0.02)return 'ph '+ph.toFixed(2)+' win '+t.wa.toFixed(2)+'-'+t.wb.toFixed(2);await new Promise(r=>setTimeout(r,8))}return 'gave up'})()`);
    await rpc({ op: 'key', code: key, ms: 30 });
    await sleep(700);
    console.log(i, w, await ev('JSON.stringify(GKACT5.A.me)'));
  }
})();

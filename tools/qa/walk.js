// tools/qa helper: walk like a player to a room key or x,z: route through open doors, face the next waypoint (mouse), hold W (+Shift) via CDP.
// node walk.js <roomKey | x,z> [sprint=1] [maxSec=40]
const http = require('http'), CTRL = +process.env.CTRL || 9339;
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const [target, sprintArg, maxArg] = process.argv.slice(2), sprint = sprintArg !== '0', maxSec = +maxArg || 40;
const ROUTE = `(()=>{const W=GKWORLD,P=GK.P,ri=GK.roundInfo(),open=new Set(ri.open||[]);
 const here=W.roomKeyAt?W.roomKeyAt(P.x,P.z):null;
 const keyAt=(x,z)=>{for(const r of W.ROOMS){const q=W.roomRect(r.key||r);if(Math.abs(x-q.cx)<=q.hw&&Math.abs(z-q.cz)<=q.hd)return q.key}return null};
 const T=${JSON.stringify(target)}; let tx,tz,tk; if(T.includes(',')){[tx,tz]=T.split(',').map(Number);tk=keyAt(tx,tz)}else{tk=T;const q=W.roomRect(T);tx=q.cx;tz=q.cz}
 const cur=keyAt(P.x,P.z); const isOpen=d=>d.kind==='hatch'?!GK.homeLocked():open.has(d.id);
 const prev={[cur]:null},q=[cur];while(q.length){const k=q.shift();if(k===tk)break;for(const id of W.ROOM_DOORS[k]||[]){const d=W.DOORS[id];if(!isOpen(d))continue;const o=d.a===k?d.b:d.a;if(o in prev)continue;prev[o]=[k,id];q.push(o)}}
 if(!(tk in prev))return {err:'no route',cur,tk,open:[...open]};
 const path=[];for(let k=tk;prev[k];k=prev[k][0])path.unshift(prev[k][1]);
 const wp=[];for(const id of path){const d=W.DOORS[id],dx=d.axis==='z'?d.wall.x:d.c,dz=d.axis==='z'?d.c:d.wall.z,nx=d.axis==='z'?1:0,nz=d.axis==='z'?0:1;const pa=wp.length?wp[wp.length-1]:[P.x,P.z];const s=Math.sign((dx-pa[0])*nx+(dz-pa[1])*nz)||1;wp.push([dx-nx*s*1.3,dz-nz*s*1.3],[dx+nx*s*1.3,dz+nz*s*1.3])}
 wp.push([tx,tz]);return {cur,tk,path,wp}})()`;
(async () => {
  const r = await ev(ROUTE); if (!r || r.err) { console.log('route', JSON.stringify(r)); return; }
  console.log('route', r.cur, '->', r.tk, 'doors', r.path.join(','));
  const t0 = Date.now(); let i = 0, stuck = 0, last = null;
  await rpc({ op: 'down', code: 'KeyW' }); if (sprint) await rpc({ op: 'down', code: 'ShiftLeft' });
  try {
    while (i < r.wp.length && Date.now() - t0 < maxSec * 1000) {
      const [wx, wz] = r.wp[i];
      const s = await ev(`(()=>{const P=GK.P;const dx=${wx}-P.x,dz=${wz}-P.z,d=Math.hypot(dx,dz);P.yaw=Math.atan2(-dx,-dz);P.pitch=0;return {d,x:P.x,z:P.z,dead:GK.mode}})()`);
      if (s.dead !== 'play') { console.log('mode', s.dead); break; }
      if (s.d < (i === r.wp.length - 1 ? 0.8 : 0.6)) { i++; continue; }
      if (last && Math.hypot(s.x - last[0], s.z - last[1]) < 0.02) { if (++stuck > 25) { console.log('STUCK at', s.x.toFixed(2), s.z.toFixed(2), 'wp', i, r.wp[i]); break; } } else stuck = 0;
      last = [s.x, s.z]; await sleep(40);
    }
  } finally { await rpc({ op: 'up', code: 'KeyW' }); await rpc({ op: 'up', code: 'ShiftLeft' }); }
  const e = await ev('({x:GK.P.x.toFixed(2),z:GK.P.z.toFixed(2)})'); console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's at', JSON.stringify(e), 'wp', i + '/' + r.wp.length);
})();

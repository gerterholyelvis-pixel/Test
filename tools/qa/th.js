// tools/qa helper lib for playing the tree rooms with the driver (drv.js, CTRL port): require('./th'). See docs/reports/tree-rooms-fix.md.
const http = require('http'), CTRL = +process.env.CTRL || 9441;
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js }), sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (code, ms) => rpc({ op: 'key', code, ms: ms || 60 });
const down = code => rpc({ op: 'down', code }), up = code => rpc({ op: 'up', code });
const shot = n => rpc({ op: 'shot', name: n });
const dbg = o => ev(`GK.net.send({actDbg:${JSON.stringify(o)}})`);
const setTree = async (cell, type) => { await dbg({ tree: [String(cell), type] }); for (let i = 0; i < 30; i++) { await sleep(200); if (await ev(`GK.r5.treeMap()[${cell}]`) === type) return true; } return false; };
const tpAnchor = async (room, an, gap = 0.9, ang = null) => {
  const r = await ev(`(()=>{const a=GKWORLD.actAnchors(${JSON.stringify(String(room))})[${JSON.stringify(an)}],R=GKWORLD.roomRect(${JSON.stringify(String(room))});let dx=R.cx-a.x,dz=R.cz-a.z;const l0=Math.hypot(dx,dz),l=l0||1;dx/=l;dz/=l;if(l0<0.01){dx=0;dz=1}${ang != null ? `dx=Math.sin(${ang});dz=Math.cos(${ang});` : ''}const x=a.x+dx*(a.r+${gap}),z=a.z+dz*(a.r+${gap});GK.net.send({tp:[x,z]});return {a,x,z}})()`);
  await sleep(500);
  await ev(`(()=>{const a=${JSON.stringify(r.a)},P=GK.P;P.yaw=Math.atan2(-(a.x-P.x),-(a.z-P.z));P.pitch=-0.2;})()`);
  await sleep(350); return r;
};
const cur = () => ev(`(()=>{const c=GKACT5.cur();return c&&{a:c.a,busy:!!c.busy,acts:c.acts.map(q=>q.k+':'+q.label+(q.hold?'(h)':''))}})()`);
const st = room => ev(`JSON.stringify({st:GKACT5.rooms[${JSON.stringify(String(room))}]&&GKACT5.rooms[${JSON.stringify(String(room))}].st,me:GKACT5.A.me})`);
const pos = () => ev(`JSON.stringify([+GK.P.x.toFixed(2),+GK.P.z.toFixed(2)])`);
const log = () => rpc({ op: 'log' });
const srv = n => rpc({ op: 'srvlog', tail: n || 1500, clear: true });
// toasts seen since install (polls the centre toast element), my inventory and stats
const installToasts = () => ev(`(()=>{ if(window.__tw) return 1; window.__toasts=[]; let last=''; window.__tw=setInterval(()=>{const e=[...document.querySelectorAll('div')].find(d=>d.style.top==='38%'&&d.style.zIndex==='50'); if(e&&e.style.opacity==='1'&&e.textContent!==last){last=e.textContent;window.__toasts.push(e.textContent);} else if(e&&e.style.opacity!=='1')last='';},40); return 1;})()`);
const toasts = (clear = true) => ev(`(()=>{const t=window.__toasts||[]; ${clear ? 'window.__toasts=[];' : ''} return t;})()`);
const inv = () => ev(`JSON.stringify(GK.getInv())`);
const stats = () => ev(`JSON.stringify(GK.myStats)`);
// every actS / actMe / actFx / actFail / toast message seen since install (window.__msgs)
const hook = () => ev(`(()=>{ if(window.__hk) return 1; window.__hk=1; window.__msgs=[]; const o=GKACT5.onMsg; GKACT5.onMsg=d=>{ const k=['actFail','actFx','toast','actMe','trees'].filter(x=>d[x]!==undefined); if(k.length) window.__msgs.push(JSON.stringify(Object.fromEntries(k.map(x=>[x,d[x]])))); return o(d); }; return 1;})()`);
const msgs = (clear = true) => ev(`(()=>{const t=window.__msgs||[]; ${clear ? 'window.__msgs=[];' : ''} return t;})()`);
module.exports = { hook, msgs, rpc, ev, sleep, key, down, up, shot, dbg, setTree, tpAnchor, cur, st, pos, log, srv, installToasts, toasts, inv, stats };

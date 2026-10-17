// tools/qa helper: debug-teleport next to an act anchor of a room (toward the room centre), face it, print the prompt
// node near.js <roomKey> <anchorId> [gap=0.9]
const http = require('http'), CTRL = +process.env.CTRL || 9339;
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js }), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const [room, an, gapA] = process.argv.slice(2), gap = +gapA || 0.9;
  const r = await ev(`(()=>{const a=GKWORLD.actAnchors(${JSON.stringify(room)})[${JSON.stringify(an)}],R=GKWORLD.roomRect(${JSON.stringify(room)});if(!a)return null;let dx=R.cx-a.x,dz=R.cz-a.z;const l=Math.hypot(dx,dz)||1;dx/=l;dz/=l;if(l<0.01){dx=0;dz=1}const x=a.x+dx*(a.r+${gap}),z=a.z+dz*(a.r+${gap});GK.net.send({tp:[x,z]});return {a,x,z}})()`);
  if (!r || !r.a) { console.log('no anchor', JSON.stringify(r)); return; }
  await sleep(700);
  console.log(await ev(`(async()=>{const a=${JSON.stringify(r.a)},P=GK.P;P.yaw=Math.atan2(-(a.x-P.x),-(a.z-P.z));P.pitch=-0.25;await new Promise(r=>setTimeout(r,350));const c=GKACT5.cur();return JSON.stringify({at:[+P.x.toFixed(2),+P.z.toFixed(2)],acts:c&&c.acts.map(q=>q.k+':'+q.label+(q.hold?' (hold)':''))})})()`));
})();

// ARENATOUR dev tool (docs/reports/arena-polish.md): tour arena rooms through the QA driver (tools/qa/drv.js must be running, CTRL port env),
// teleport the camera, take one jpg per view and tile them into a contact sheet (the tiling happens in the page, no image library needed).
//   CTRL=9411 node tools/arenatour.js <sheetName> <view> [<view> ...]          view = <roomKey>[:<S|N|E|W|C|NE|NW|SE|SW>][:<height>]
//   S = stand at the south wall looking north (default), C = centre looking north, NE... = corner looking at the room centre
// Needs the offline demo (?offline=1&debug=1) already in play mode (tools/qa/go.js nonav). Opens every door so the camera can see through them.
const http = require('http'), fs = require('fs'), path = require('path');
const CTRL = +process.env.CTRL || 9339, OUT = process.env.OUT || path.join(__dirname, '..', 'docs', 'screens', 'arena');
const rpc = c => new Promise(res => { const r = http.request({ host: '127.0.0.1', port: CTRL, method: 'POST', path: '/' }, s => { let b = ''; s.on('data', d => b += d); s.on('end', () => { try { res(JSON.parse(b)); } catch (e) { res(b); } }); }); r.end(JSON.stringify(c)); });
const ev = js => rpc({ op: 'eval', js }), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const [name, ...views] = process.argv.slice(2), cols = +process.env.COLS || 2, tw = +process.env.TW || 640;
  await ev(`(()=>{ if (!window.__sdo) window.__sdo = GK.setDoorsOpen; GK.setDoorsOpen = ids => __sdo(GK.doors.map(d => d.id)); GK.setDoorsOpen([]); return 1 })()`);
  const files = [];
  await ev("(document.getElementById('tourhide') || document.head.insertAdjacentHTML('beforeend', '<style id=tourhide>body>*:not(canvas){visibility:hidden!important}</style>'), 1)");   // HUD off
  for (const v of views) {
    const [k, pos = 'S', hh] = v.split(':');
    const r = await ev(`JSON.stringify(GKWORLD.roomRect(${JSON.stringify(k)}))`).then(JSON.parse);
    const m = 2, PI = Math.PI;
    const P = { S: [r.cx, r.cz + r.hd - m, 0], N: [r.cx, r.cz - r.hd + m, PI], E: [r.cx + r.hw - m, r.cz, PI / 2], W: [r.cx - r.hw + m, r.cz, -PI / 2], C: [r.cx, r.cz, 0],
      NE: [r.cx + r.hw - 1.2, r.cz - r.hd + 1.2, PI * 0.75], NW: [r.cx - r.hw + 1.2, r.cz - r.hd + 1.2, -PI * 0.75], SE: [r.cx + r.hw - 1.2, r.cz + r.hd - 1.2, PI * 0.25], SW: [r.cx - r.hw + 1.2, r.cz + r.hd - 1.2, -PI * 0.25] }[pos];
    const set = `(GK.P.x=${P[0]},GK.P.z=${P[1]},GK.P.yaw=${P[2]},GK.P.pitch=${hh ? -0.15 : -0.04},1)`;
    await ev(set); await sleep(1800); await ev(set); await sleep(500);
    const f = await rpc({ op: 'shot', name: 'tmp-' + name + '-' + files.length, q: 62 });
    files.push({ f, label: k + ' ' + pos });
  }
  const imgs = files.map(x => fs.readFileSync(x.f).toString('base64'));
  const rows = Math.ceil(files.length / cols);
  let sheet = '';
  for (let i = 0; i < imgs.length; i += 2) {   // draw in chunks so each call stays small
    const js = `new Promise(async res => { window.__cv = window.__cv || Object.assign(document.createElement('canvas'), { width: ${cols * tw}, height: ${rows * Math.round(tw * 9 / 16)} }); const g = __cv.getContext('2d'); const L = ${JSON.stringify(imgs.slice(i, i + 2))}; const LB = ${JSON.stringify(files.slice(i, i + 2).map(x => x.label))};
      for (let j = 0; j < L.length; j++) { const im = new Image(); await new Promise(r => { im.onload = r; im.src = 'data:image/jpeg;base64,' + L[j]; }); const n = ${i} + j, x = (n % ${cols}) * ${tw}, y = Math.floor(n / ${cols}) * ${Math.round(tw * 9 / 16)}; g.drawImage(im, x, y, ${tw}, ${Math.round(tw * 9 / 16)}); g.fillStyle = '#000a'; g.fillRect(x, y, 70, 16); g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(LB[j], x + 4, y + 12); }
      res(${i + 2 >= imgs.length} ? __cv.toDataURL('image/jpeg', 0.7).slice(23) : 'ok'); })`;
    sheet = await ev(js);
  }
  const out = path.join(OUT, name + '.jpg'); fs.writeFileSync(out, Buffer.from(sheet, 'base64'));
  await ev('(window.__cv = null, 1)'); for (const x of files) try { fs.unlinkSync(x.f); } catch (e) {}
  console.log(out);
})();

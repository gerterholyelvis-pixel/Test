// Scenario for tools/r5shot.js: one screenshot per hall theme (docs/screens/halls-*.jpg), then the prompt and the search bar at a container.
//   PORT=3199 node server.js &  W=960 H=540 node tools/r5shot.js http://localhost:3199 tools/hallshot-views.js
const S = 'docs/screens/';
const REP = { armoury: 0, barracks: 4, den: 2, cistern: 10, kitchen: 1, library: 3, shrine: 9, workshop: 19 };
module.exports = async c => {
  const info = await c.ev(`JSON.stringify(Object.fromEntries(Object.entries(${JSON.stringify(REP)}).map(([t, i]) => { const pcs = GKWORLD.hallPieces(i), r = GKWORLD.roomRect(String(i)); let sx = 0, sz = 0; for (const p of pcs) { sx += p.x; sz += p.z; } return [t, { cx: r.cx, cz: r.cz, mx: sx / pcs.length, mz: sz / pcs.length, n: pcs.length }]; })))`).then(JSON.parse);
  for (const [t, v] of Object.entries(info)) {
    let dx = v.mx - v.cx, dz = v.mz - v.cz; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    let ax = v.cx - dx * 6.0, az = v.cz - dz * 6.0;
    for (const [dd, o] of [[6.0, 1], [6.0, -1], [5.2, 2], [5.2, -2], [4.2, 3], [4.2, -3]]) { const x = v.cx - dx * dd + dz * o, z = v.cz - dz * dd - dx * o; if (await c.ev(`!GKWORLD.inProp(${x}, ${z}, 0.5, null) && Math.abs(${x} - ${v.cx}) < 6.4 && Math.abs(${z} - ${v.cz}) < 6.4`)) { ax = x; az = z; break; } }
    const yaw = Math.atan2(-(v.mx - ax), -(v.mz - az));
    await c.tp(ax, az, yaw, -0.14); await c.wait(500); await c.shot(S + 'halls-' + t + '.jpg');
    console.log(t, 'pieces', v.n, JSON.stringify(await c.info()));
  }
  // the prompt and the search bar at the cache of the hall behind my home
  const sp = JSON.parse(await c.ev(`JSON.stringify(GKWORLD.hallSpots(1).find(s => s.kind === 'stew'))`));
  const yaw = Math.atan2(-(sp.x - sp.sx), -(sp.z - sp.sz));
  await c.tp(sp.sx, sp.sz, yaw, -0.2); await c.wait(500); await c.shot(S + 'halls-prompt.jpg');
  console.log('prompt:', await c.ev(`GKHALL.prompt()`), 'spots in reach:', await c.ev(`!!GKHALL.cur()`));
};

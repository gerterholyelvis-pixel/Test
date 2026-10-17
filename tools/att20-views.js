// r5shot scenario for the 20 attached rooms (docs/reports/attached-20.md): spawn in a home, walk out, the attached rooms along each side, a corner cell with its two loot rooms.
//   PORT=3111 GK_DEBUG=1 node server.js   then   Q=/ node tools/r5shot.js http://localhost:3111 tools/att20-views.js   (Q=/ plays online against the real server; default offline demo)
const S = 'docs/screens/att20-';
module.exports = async c => {
  const PI = Math.PI, J = v => JSON.stringify(v);
  const R = k => c.ev(`JSON.stringify(GKWORLD.roomRect(${J(k)}))`).then(JSON.parse), CH = id => c.ev(`JSON.stringify(GKWORLD.CHEST[${id}])`).then(JSON.parse);
  const calls = {}, info = async name => { const i = await c.info(); calls[name] = i.calls; console.log(name, J(i)); };
  // 1. spawned in my home: where am I, looking at the doorway
  const st = JSON.parse(await c.ev(`JSON.stringify({ home: GK.myHome, x: GK.P.x, z: GK.P.z, yaw: GK.P.yaw, room: GKWORLD.roomKeyOf(GK.P.x, GK.P.z), side: GKWORLD.attachedSide(GK.myHome), pos: GKWORLD.attachedPos(GK.myHome) })`));
  console.log('spawn', J(st));
  await c.wait(600); await c.shot(S + 'home-spawn.jpg'); await info('home-spawn');
  // 2. walk out: hold W for a while (real movement, collision and the hatch), report where we got
  const hc = await CH(+st.home.slice(1));
  await c.ev(`(GK.P.yaw = Math.atan2(-${-hc.dx}, -${-hc.dz}), GK.P.pitch = 0, 1)`);
  await c.ev(`(dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' })), 1)`);
  for (let i = 0; i < 40; i++) { await c.wait(250); const k = await c.ev('GKWORLD.roomKeyOf(GK.P.x, GK.P.z)'); if (k[0] !== 'c') { await c.wait(700); break; } }
  await c.ev(`(dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' })), 1)`);
  const out = JSON.parse(await c.ev(`JSON.stringify({ x: GK.P.x, z: GK.P.z, room: GKWORLD.roomKeyOf(GK.P.x, GK.P.z) })`)); console.log('walked out to', J(out));
  await c.wait(400); await c.shot(S + 'walked-out.jpg');
  await c.ev(`(GK.P.yaw += Math.PI, 1)`); await c.wait(500); await c.shot(S + 'walked-out-hatch.jpg');
  // 3. a corner cell (0, NW) with its two loot rooms: the N door (c0) and the W door (c19), seen from inside the cell
  const r0 = await R('0');
  await c.tp(r0.cx + 3.5, r0.cz + 3.5, PI / 4, 0.05); await c.wait(500); await c.shot(S + 'corner-0-two-doors.jpg'); await info('corner-0');
  // 4. inside loot rooms: c0 (N position 1, the corner) looking back at its door, and c2 (N position 3, middle)
  for (const id of [0, 2, 19]) {
    const a = await CH(id); await c.tp(a.cx + a.dx * 2.2, a.cz + a.dz * 2.2, Math.atan2(a.dx, a.dz), 0); await c.wait(600);
    await c.shot(S + 'loot-c' + id + '-door.jpg'); await info('loot-c' + id);
  }
  // 5. bird's-eye views: the camera above the map with everything above the walls clipped, so the attached rooms along each side show
  await c.ev(`(() => { const T = window.THREE; GK.renderer.localClippingEnabled = true; GK.renderer.clippingPlanes = [new T.Plane(new T.Vector3(0, -1, 0), 6.0)]; GK.__cam = null;
    const f = GK.fun || (GK.fun = {}); f.__cam0 = f.camera; f.camera = (cam) => { const v = GK.__cam; if (!v) return f.__cam0 ? f.__cam0(cam) : false; cam.fov = v[6] || 50; cam.position.set(v[0], v[1], v[2]); cam.lookAt(v[3], v[4], v[5]); return true; }; return 1; })()`);
  const view = async (file, v) => { await c.ev(`(GK.__cam = ${J(v)}, 1)`); await c.wait(1500); await c.shot(S + file); };
  await view('overview-north.jpg', [0, 70, -10, 0, 0, -44, 55]);
  await view('overview-corner-nw.jpg', [-22, 34, -22, -38, 0, -38, 55]);
  await view('overview-east.jpg', [10, 70, 0, 44, 0, 0, 55]);
  await view('overview-all.jpg', [0, 120, 0.1, 0, 0, 0, 55]);
  await c.ev(`(GK.__cam = null, GK.renderer.clippingPlanes = [], 1)`);
  // 6. the M map
  await c.ev(`(dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm' })), 1)`); await c.wait(800); await c.shot(S + 'map.jpg');
  await c.ev(`(dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', key: 'm' })), 1)`);
  console.log('calls', J(calls));
};

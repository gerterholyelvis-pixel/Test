// Camera Terminal (camterm.js + the CAMTERM block of server.js; docs/reports/camera-terminal.md): pure rules first, then the real server with three goblins.
// GK_DEBUG hooks: {tp}, {dbgElixir:{n, lv}}; GK_CAM_METER_MS shortens the elixir meter.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), CT = require('../camterm.js'), HB = require('../homebase.js');
const at = (home, kind, dx = 0, dz = 0) => { const c = W.CHEST[+home.slice(1)], a = W.HOME_LAYOUT[kind], [x, z] = W.attLocal(c, a[0], a[1]); return [x + dx, z + dz]; };
const homeOf = c => c.state.matchStart.spawn.home;
const mark = c => c.msgs.length;
const since = (c, i, key) => c.msgs.slice(i).map(m => m[key]).filter(v => v !== undefined);
const dbg = (c, o) => c.send({ dbgElixir: o });
const ok = { lv: 1, round: 2, sudden: false, showdown: false, alive: true, entered: true, homeDead: false, atTerminal: true };
let spare = null;
async function trio(srv) {
  if (spare) { await spare.close(); spare = null; }
  const [a, b, c3] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1'), connect(srv.port, 'goblin=2')]); spare = c3;
  await a.until(c => c.state.round && c.state.round.n >= 1 && c.state.elixir === 0, 4000, 'elixir 0 at GO'); return [a, b];
}
(async () => {
  let fail = await L.run('camterm', [
    ['rules: price table, gate, viewable, meter and session length', () => {
      eq(HB.UPGRADES.camera.levels.map(l => l.cost), [25, 40]); eq(HB.UPGRADES.camera.tab, 'BASE');
      eq(CT.gate(ok), null); eq(CT.gate({ ...ok, lv: 0 }), 'Buy the Camera Terminal first'); eq(CT.gate({ ...ok, round: 1 }), 'Cameras go live in round 2');
      assert(CT.gate({ ...ok, sudden: true }) && CT.gate({ ...ok, showdown: true }), 'dead in sudden death and the showdown');
      assert(CT.gate({ ...ok, atTerminal: false }) && CT.gate({ ...ok, homeDead: true }), 'range and dead home'); eq(CT.gate({ ...ok, alive: false }), 'state');
      const arena = k => /^\d{1,2}$/.test(k) && +k < 25;
      eq(CT.viewable(1, '7', arena, '12'), null); assert(CT.viewable(1, '12', arena, '12'), 'vault needs tier II'); eq(CT.viewable(2, '12', arena, '12'), null);
      for (const bad of ['c3', '25', '-1', '', 7, null, {}, '1234']) assert(CT.viewable(2, bad, arena, '12'), 'refuses ' + JSON.stringify(bad));
      const s = CT.newSession(1000, 1, '7'); eq(CT.step(s, 1100, 5), { charge: 0, send: false || 1100 - s.sentAt >= CT.GAP_MS });
      eq(CT.step(s, 1000 + 15000, 5).charge, 1); eq(CT.step(s, 1000 + 15000, 5).charge, 0, 'the meter moved on'); eq(CT.step(s, 1000 + 30000, 0).end, 'Out of elixir'); eq(CT.step(s, 1000 + 120000, 9).end, 'The feed timed out');
      const s2 = CT.newSession(0, 2, '12'); assert(CT.step(s2, 200000, 9).end === undefined && CT.step(s2, 300000, 9).end, 'tier II feed lasts 5 minutes');
    }],
    ['frame: only public fields, caps, rounding, a hidden room shows nobody', () => {
      const s = CT.newSession(0, 1, '7'), many = n => Array.from({ length: n }, (_, i) => ({ id: i, name: 'G'.repeat(30), x: 1.234, z: -2.678, hp: 0.5123, inv: ['w:sword'], gold: 99 }));
      const f = CT.frame({ room: '7', name: 'ROOM 3.2', w: 20, d: 20, goblins: many(40), foes: many(40), drops: Array.from({ length: 40 }, () => ({ x: 1, z: 1, n: 3, items: ['x'] })), doors: [{ side: 'N', off: 1.04, open: true }], crown: 'Zed', hidden: false }, s, 500);
      eq(f.g.length, 16); eq(f.f.length, 12); eq(f.i.length, 12); eq(f.g[0], [0, 'GGGGGGGGGGGGGGGG', 1.2, -2.7, 50]); eq(f.doors, [['N', 1, 1]]); eq(f.left, 119500);
      eq(Object.keys(f).sort(), ['crown', 'd', 'doors', 'f', 'g', 'i', 'left', 'lv', 'name', 'room', 'w']); assert(!JSON.stringify(f).includes('sword') && !JSON.stringify(f).includes('99'), 'no items or gold');
      const h = CT.frame({ room: '6', name: 'TREE', w: 20, d: 20, goblins: many(3), doors: [], hidden: true }, s, 0); eq(h.g, []); eq(h.hid, 1); eq(h.f, []);
      const t = { last: '', sentAt: 0 }; assert(CT.shouldSend(t, 'a', 0)); assert(!CT.shouldSend(t, 'a', 500), 'identical frame inside the heartbeat is skipped'); assert(CT.shouldSend(t, 'a', 1200), 'heartbeat'); assert(CT.shouldSend(t, 'b', 1300), 'changed');
    }],
  ]);
  try {   // the art: the terminal prop shows only with the upgrade, stands inside the room at HOME_LAYOUT.cam (skipped when three is missing)
    const path = require('path'), { pathToFileURL } = require('url');
    const noop = new Proxy(function () {}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : noop, apply: () => noop, set: () => true });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop, style: {} }) };
    const THREE = await import(pathToFileURL(path.join(path.dirname(require.resolve('three')), 'three.module.js')).href), art = await import(pathToFileURL(path.join(L.ROOT, 'rooms5art-home.js')).href);
    fail += await L.run('camterm-art', [['the Camera Terminal prop is hidden until level 1 and stands at HOME_LAYOUT.cam', () => {
      const home = art.buildHomeRoom(THREE, {}, { doorSide: 'S', seed: 3, owner: 'Grimble' }), vis = () => home.group.children.filter(o => o.isGroup && o.visible);
      const n0 = vis().length; eq(home.setUpgrade('camera', 1), true); const on = vis().filter(o => o.children.length); eq(vis().length, n0 + 1, 'one more visible group');
      const box = new THREE.Box3(); for (const o of home.group.children) if (o.isGroup && o.visible) { const b = new THREE.Box3().setFromObject(o); if (b.min.z < -3.9 && b.min.x > 2.5 && b.max.x < 4.2) box.union(b); }
      assert(!box.isEmpty(), 'prop found at the back wall'); const K = W.HOME_K; assert(Math.abs((box.min.x + box.max.x) / 2 - W.HOME_LAYOUT.cam[0] / K) < 0.15 && box.max.z <= 4.98, 'at HOME_LAYOUT.cam: ' + box.min.x + ' ' + box.max.x);
      eq(home.setUpgrade('camera', 0), true); eq(vis().length, n0, 'hidden again');
    }]]);
  } catch (e) { console.log('  note: art not buildable here (' + String(e.message).slice(0, 80) + '), art check skipped'); }
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_ROUND_MS: '4000', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0', GK_CAM_METER_MS: '600' });
  try {
    fail += await L.run('camterm-live', [
      ['buy at the screen, no feed before it is owned, round 1 and non-owners refused, then the live feed: privacy, junk, rate limit, tier II vault, leaving the terminal', async () => {
        const [a, b] = await trio(srv), ha = homeOf(a), cell = '7', r = W.roomRect(cell);
        // the terminal asks for the screen purchase; opening it before owning it is refused
        dbg(a, { n: 100 }); a.send({ tp: at(ha, 'cam', 0, 1.2) }); await sleep(120); let i = mark(a);
        a.send({ cam: { open: 1 } }); await a.until(c => since(c, i, 'camRes').length, 1500, 'refused'); eq(since(a, i, 'camRes')[0].reason, 'Buy the Camera Terminal first'); eq(a.state.elixir, 100);
        a.send({ tp: at(ha, 'screen', 1, 0) }); await sleep(120); a.send({ base: { buy: 'camera' } });
        await a.until(c => c.state.home && c.state.home.lv.camera === 1 && c.state.elixir === 75, 2000, 'bought for 25');
        // round 1: the home is locked, cameras go live in round 2
        a.send({ tp: at(ha, 'cam', 0, 1.2) }); await sleep(120); i = mark(a); a.send({ cam: { open: 1 } });
        await a.until(c => since(c, i, 'camRes').length, 1500, 'round 1 refused'); assert(/round 2/.test(since(a, i, 'camRes')[0].reason), since(a, i, 'camRes')[0].reason); eq(a.state.elixir, 75, 'nothing charged'); eq(since(a, i, 'cam').length, 0);
        await a.until(c => c.state.round.n >= 2, 8000, 'round 2');
        // B does not own a camera and stands at A's terminal: nothing reaches him, nothing happens
        const j = mark(b); b.send({ tp: at(ha, 'cam', 0, 1.2) }); await sleep(120); b.send({ cam: { open: 1 } }); b.send({ cam: { room: cell } }); await sleep(700); eq(since(b, j, 'cam').length, 0, 'no frame for B');
        // A opens: 2 elixir, a room is chosen, frames arrive at 4 Hz at most
        a.send({ tp: at(ha, 'cam', 0, 1.2) }); await sleep(120); i = mark(a); a.send({ cam: { open: 1 } }); await a.until(c => c.state.elixir === 73, 1500, 'open costs 2');
        eq(since(a, i, 'cam').length, 0, 'no frame before a room is chosen'); a.send({ cam: { room: cell } });
        await a.until(c => c.state.cam && c.state.cam.room === cell, 1500, 'first frame'); eq(a.state.cam.name, 'ROOM 3.2'); assert(a.state.cam.doors.length >= 2, 'doors listed'); assert(a.state.cam.doors.every(d => d.length === 3 && ['N', 'E', 'S', 'W'].includes(d[0])));
        // B walks into the room: shows with name, rounded position and health, no inventory fields
        b.send({ tp: [r.cx + 3, r.cz - 2] }); await a.until(c => c.state.cam.g.some(g => g[0] === b.state.you), 2500, 'B on the feed');
        const g = a.state.cam.g.find(x => x[0] === b.state.you); eq(g.length, 5); assert(Math.abs(g[2] - 3) < 1.5 && Math.abs(g[3] + 2) < 1.5, 'position ' + g); assert(g[4] > 0 && g[4] <= 100);
        const k = mark(a); await sleep(1500); const n = since(a, k, 'cam').length; assert(n >= 1 && n <= 7, 'frames in 1.5 s: ' + n);
        // junk is ignored; a flood of room switches cannot raise the frame rate
        const e0 = a.state.elixir; for (const junk of [5, 'x', [], null, { room: {} }, { room: 99 }, { room: 'c3' }, { room: '-1' }, { room: '25' }, { open: 'yes' }, { close: 0 }, { room: '7'.repeat(40) }]) a.send({ cam: junk }); await sleep(300);
        assert(a.state.cam && a.state.cam.room === cell, 'still watching'); assert(a.state.elixir >= e0 - 1, 'junk cost nothing');
        const k2 = mark(a); for (let q = 0; q < 40; q++) a.send({ cam: { room: String(q % 2 ? 8 : 9) } }); await sleep(1000); const n2 = since(a, k2, 'cam').length; assert(n2 <= 6, 'flood gives ' + n2 + ' frames in 1 s'); assert(srv.alive(), 'server alive');
        // the Vault needs tier II
        await sleep(600); i = mark(a); a.send({ cam: { room: W.VAULT_KEY } }); await a.until(c => since(c, i, 'camRes').length, 1500, 'vault refusal'); assert(/tier II/.test(since(a, i, 'camRes')[0].reason));
        dbg(a, { lv: { camera: 2 } }); await sleep(150); a.send({ cam: { room: W.VAULT_KEY } }); await a.until(c => c.state.cam && c.state.cam.room === W.VAULT_KEY && c.state.cam.name === 'THE VAULT', 2000, 'tier II vault feed');
        // a home is never a camera target
        i = mark(a); a.send({ cam: { room: 'c' + (+ha.slice(1) ^ 1) } }); await sleep(200); assert(since(a, i, 'camRes').length >= 1, 'homes refused');
        // walking away from the terminal ends the session
        i = mark(a); a.send({ tp: L.centre(ha) }); await a.until(c => since(c, i, 'cam').includes(null), 2500, 'session ended'); eq(a.state.camRes.reason, 'Too far from the terminal');
        const m = mark(a); await sleep(700); eq(since(a, m, 'cam').length, 0, 'no frames after the session');
        await a.close(); await b.close();
      }],
      ['the meter charges and ends the feed when the elixir runs out; occupants with an Alarm are told, nameless', async () => {
        const [a, b] = await trio(srv), ha = homeOf(a), hb = homeOf(b), cell = '11', r = W.roomRect(cell);
        dbg(a, { n: 5, lv: { camera: 1 } }); dbg(b, { lv: { alarm: 1 } }); await a.until(c => c.state.round.n >= 2, 8000, 'round 2');
        b.send({ tp: [r.cx, r.cz + 1] }); await sleep(150); a.send({ tp: at(ha, 'cam', 0, 1.2) }); await sleep(150);
        const i = mark(a), j = mark(b); a.send({ cam: { open: 1 } }); a.send({ cam: { room: cell } }); await a.until(c => c.state.cam && c.state.cam.room === cell, 1500, 'feed');
        await b.until(c => since(c, j, 'homeToast').some(t => /camera is watching/.test(t.text)), 1500, 'camera spotted');
        await a.until(c => since(c, i, 'cam').includes(null), 4000, 'ended when out of elixir'); eq(a.state.camRes.reason, 'Out of elixir'); eq(a.state.elixir, 0, 'spent 2 to open and 3 on the meter');
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  camterm setup: ' + e.message); fail++; }
  if (spare) await spare.close().catch(() => {});
  srv.stop(); process.exit(fail ? 1 : 0);
})();

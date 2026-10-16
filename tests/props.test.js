// Solid props: world.js footprints (layout, clearances, reachability, sliding) and the server's movement validation / bolts / melee against them
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
const RAD = 0.45, ALL_MYSTERY = Array(W.NATT).fill('mystery'), NONE = Array(W.NATT).fill('chest');
const gridHalf = i => [W.roomW(i) / 2 - W.T / 2, W.roomD(i) / 2 - W.T / 2];

// flood fill a room's floor (0.2 m cells, walker radius RAD, walls inset by RAD): returns { free(x,z), seen(x,z) } for world coordinates
function flood(key, types, startXZ) {
  let cx, cz, hx, hz;
  if (key[0] === 'c') { const c = W.CHEST[+key.slice(1)]; cx = c.cx; cz = c.cz; hx = hz = c.size / 2 - W.T / 2; }
  else { const i = +key; [cx, cz] = W.rc(i); [hx, hz] = gridHalf(i); }
  const S = 0.2, nx = Math.floor((hx - RAD) / S), nz = Math.floor((hz - RAD) / S), seen = new Set(), k = (a, b) => a + ',' + b;
  const ok = (a, b) => Math.abs(a) <= nx && Math.abs(b) <= nz && !W.inProp(cx + a * S, cz + b * S, RAD, types, true);
  const sa = Math.round((startXZ[0] - cx) / S), sb = Math.round((startXZ[1] - cz) / S), q = [[sa, sb]];
  if (ok(sa, sb)) seen.add(k(sa, sb));
  while (q.length) { const [a, b] = q.pop(); for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = a + da, b2 = b + db; if (ok(a2, b2) && !seen.has(k(a2, b2))) { seen.add(k(a2, b2)); q.push([a2, b2]); } } }
  const cell = (x, z) => k(Math.round((x - cx) / S), Math.round((z - cz) / S));
  return { free: (x, z) => !W.inProp(x, z, RAD, types, true), seen: (x, z) => seen.has(cell(x, z)), size: seen.size, cx, cz, hx, hz };
}

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '1' }); let fail = 1;
  try {
    fail = await L.run('props', [
      ['footprints: circles inside their own room, clear of the walls, and every prop belongs to the room it is listed for', () => {
        const all = W.allProps(ALL_MYSTERY); assert(all.length >= 40, 'props exist: ' + all.length);
        for (let i = 0; i < W.NARENA; i++) for (const p of W.solidsOf(String(i), '')) {
          eq(W.roomKeyOf(p.x, p.z), String(i), 'prop ' + p.k + ' of room ' + i); const [cx, cz] = W.rc(i), [hx, hz] = gridHalf(i);
          assert(Math.abs(p.x - cx) + p.r <= hx + 0.2 && Math.abs(p.z - cz) + p.r <= hz + 0.2, 'room ' + i + ' ' + p.k + ' pokes out of the walls');
        }
        for (const c of W.CHEST) for (const p of W.solidsOf('c' + c.id, 'mystery')) {
          eq(W.roomKeyOf(p.x, p.z), 'c' + c.id, 'prop of c' + c.id);
          assert(Math.abs(p.x - c.cx) + p.r <= c.size / 2 - W.T / 2 + 0.2 && Math.abs(p.z - c.cz) + p.r <= c.size / 2 - W.T / 2 + 0.2, 'c' + c.id + ' ' + p.k + ' pokes out of the walls');
        }
        // loot rooms: only mystery rooms (clutter) and the two stations have props; chest and merchant rooms are bare. Homes always have their furniture (2 bench halves, the recycler, a crate), whatever type is passed.
        const loot = W.LOOT_IDS[0], home = W.HOME_IDS[0];
        eq(W.solidsOf('c' + loot, 'chest').length, 0, 'only mystery rooms and stations have props'); eq(W.solidsOf('c' + loot, 'merchant').length, 0); assert(W.solidsOf('c' + loot, 'mystery').length >= 4, 'mystery clutter');
        eq(W.solidsOf('c' + loot, 'forge').map(p => p.k), ['bench', 'bench'], 'the Master Forge footprint'); eq(W.solidsOf('c' + loot, 'grand').map(p => p.k), ['recycler'], 'the Grand Recycler footprint');
        eq(W.solidsOf('c' + home, 'home').map(p => p.k).sort(), ['bench', 'bench', 'hbox', 'hcrate', 'hpump', 'hscreen', 'recycler'], 'home furniture'); eq(W.solidsOf('c' + home, 'chest').length, 4);
      }],
      ['layout is deterministic and the types argument may be strings or CHEST_ROOMS-like objects', () => {
        const a = JSON.stringify(W.allProps(ALL_MYSTERY)), b = JSON.stringify(W.allProps(ALL_MYSTERY.map(t => ({ type: t }))));
        eq(a, b); assert(W.allProps(NONE).length < W.allProps(ALL_MYSTERY).length);
        eq(W.propsAt(W.RELIC.x, W.RELIC.z, NONE).filter(p => p.k === 'ped').length, 1, 'the relic pedestal is a footprint at RELIC');
      }],
      ['nothing blocks doors, panels, spawns or stations: door fronts, panel spots and the whole spawn range are free and reachable in every arena room', () => {
        for (let i = 0; i < W.NARENA; i++) {
          const [cx, cz] = W.rc(i), [hx, hz] = gridHalf(i), f = flood(String(i), NONE, [cx, cz - 0.01 + (i === W.VAULT ? 4 : 0)]);
          assert(f.size > 400, 'room ' + i + ' has a floor');
          const spots = [[0, hz - 1.4], [0, -hz + 1.4], [hx - 1.4, 0], [-hx + 1.4, 0], [0, hz - 3], [0, -hz + 3], [-W.panelDX(i), -hz + 1.3], [W.panelDX(i), -hz + 1.3]];
          for (const [a, b] of spots) assert(f.free(cx + a, cz + b) && f.seen(cx + a, cz + b), 'room ' + i + ' spot ' + a + ',' + b + ' blocked or cut off');
          for (let k = 0; i !== W.VAULT && k < 600; k++) { const [x, z] = W.randomPoint(i); assert(f.free(x, z) && f.seen(x, z), 'room ' + i + ' spawn range hit a prop at ' + x.toFixed(1) + ',' + z.toFixed(1)); }
          // the straight lines from every door front to the room centre stay open
          for (const [a, b] of spots.slice(0, 4)) for (let t = 0; i !== W.VAULT && t <= 1; t += 0.05) assert(f.free(cx + a * (1 - t), cz + b * (1 - t)), 'room ' + i + ' door line blocked');
        }
        const rv = W.RELIC; const f4 = flood(W.VAULT_KEY, NONE, [0, 4]); assert(f4.seen(rv.x - 1.6, rv.z) && f4.seen(rv.x + 1.6, rv.z) && f4.seen(rv.x, rv.z + 1.6) && f4.seen(rv.x, rv.z - 1.6), 'the pedestal can be reached from all four sides');
      }],
      ['mystery rooms and homes: centre, door and the middle of the room stay free and connected; the back wall / corners are the only blocked parts', () => {
        for (const c of W.CHEST) {
          const f = flood('c' + c.id, ALL_MYSTERY, [c.cx, c.cz]); const ry = Math.atan2(-c.dx, -c.dz), cs = Math.cos(ry), sn = Math.sin(ry);
          const wd = (lx, lz) => [c.cx + lx * cs + lz * sn, c.cz - lx * sn + lz * cs];
          for (let lx = -1.6; lx <= 1.6; lx += 0.4) for (let lz = -2.4; lz <= 3.0; lz += 0.4) { const [x, z] = wd(lx, lz); assert(f.free(x, z) && f.seen(x, z), 'c' + c.id + ' local ' + lx.toFixed(1) + ',' + lz.toFixed(1) + ' blocked'); }
          const [x, z] = wd(0, 0); eq(W.inProp(x, z, RAD, ALL_MYSTERY, true), false, 'enemy spawn point (room centre) is free');
        }
      }],
      ['sliding: walking into a prop from any direction ends outside it, never sticks, and keeps most of the sideways speed on a glancing approach', () => {
        const p = W.solidsOf('0', '')[0], R = p.r + RAD;
        for (let a = 0; a < 360; a += 7) {   // walk at the centre from a ring around it; head-on cases need to find a way round
          const sx = p.x + Math.cos(a * Math.PI / 180) * (R + 1.5), sz = p.z + Math.sin(a * Math.PI / 180) * (R + 1.5); if (W.roomKeyOf(sx, sz) !== '0' || W.inProp(sx, sz, RAD, NONE, true)) continue;
          let x = sx, z = sz, tx = 2 * p.x - sx, tz = 2 * p.z - sz, moved = 0;   // aim at the mirror point behind the prop
          for (let n = 0; n < 400; n++) { const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz); if (d < 0.1) break; const st = Math.min(d, 4.6 / 60), [qx, qz] = W.slide(x, z, x + dx / d * st, z + dz / d * st, RAD, NONE, true); moved += Math.hypot(qx - x, qz - z); x = qx; z = qz; assert(!W.inProp(x, z, RAD - 1e-6, NONE, true), 'ended inside the prop'); }
          assert(Math.hypot(tx - x, tz - z) < 0.3 || W.roomKeyOf(tx, tz) !== '0' || W.inProp(tx, tz, RAD, NONE, true), 'angle ' + a + ' got stuck at ' + x.toFixed(2) + ',' + z.toFixed(2));
        }
        // glancing: heading +x just beside a barrel-like footprint
        const q = { x: 0, z: 0 }, W2 = W.slide, x0 = p.x - 2, z0 = p.z + R * 0.5; let x = x0, z = z0, v = 0;
        for (let n = 0; n < 60; n++) { const [qx, qz] = W2(x, z, x + 4.6 / 60, z, RAD, NONE, true); v += Math.hypot(qx - x, qz - z); x = qx; z = qz; }
        assert(v > 4.6 * 0.8, 'a graze should keep most of its speed, got ' + v.toFixed(2) + ' of 4.6'); void q;
      }],
      ['segBlocked: a prop in the way shields, a clear line does not', () => {
        const p = W.solidsOf('0', '')[0];
        eq(W.segBlocked(p.x + 2.5, p.z, p.x - 0.3, p.z, NONE), true); eq(W.segBlocked(p.x + 2.5, p.z - 2.5, p.x - 0.3, p.z - 2.5, NONE), false); eq(W.segBlocked(p.x + 1.5, p.z - 2.5, p.x + 3, p.z - 2.5, NONE), false);
      }],
      ['server: stepping into a prop is corrected, walking its edge is not, and nothing else changed', async () => {
        const c = await connect(srv.port, 'goblin=0'); const p = W.solidsOf('0', '')[0], L2 = ALL_MYSTERY;
        const put = async (x, z) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, 0] }); await sleep(80); };
        await put(p.x + p.r + 1.2, p.z); const n0 = c.msgs.length;
        // 1. walk straight at it: the server lets us arrive at the surface (0.33), then answers a fix for going deeper
        for (let d = p.r + 1.2; d > p.r + RAD; d -= 0.15) { c.send({ m: [+(p.x + d).toFixed(2), +p.z.toFixed(2), 0] }); await sleep(30); }
        await sleep(100); assert(!c.msgs.slice(n0).some(m => m.fix), 'approaching up to the client collision radius is fine');
        c.send({ m: [+(p.x + p.r + 0.1).toFixed(2), +p.z.toFixed(2), 0] }); await c.until(x => x.msgs.slice(n0).some(m => m.fix), 1500, 'fix when inside the prop');
        // 2. walk around the edge at the client's radius: no fix at all
        await put(p.x + p.r + RAD, p.z); const n1 = c.msgs.length;
        for (let a = 0; a < Math.PI; a += 0.12) { const x = p.x + Math.cos(a) * (p.r + RAD + 0.01), z = p.z + Math.sin(a) * (p.r + RAD + 0.01); if (W.roomKeyOf(x, z) === '0') c.send({ m: [+x.toFixed(2), +z.toFixed(2), 0] }); await sleep(66); }
        await sleep(120); assert(!c.msgs.slice(n1).some(m => m.fix), 'sliding around the prop must not be corrected: ' + JSON.stringify(c.msgs.slice(n1).filter(m => m.fix).slice(0, 2)));
        void L2; await c.close();
      }],
    ]);
  } finally { srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

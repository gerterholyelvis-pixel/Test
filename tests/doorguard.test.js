// door guard: nobody stays locked in an outer room or a chest / mystery / merchant room, and no prop blocks a spawn, door front or panel.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const W = require('../world.js'), GUARD = require('../doorguard.js');
const R = 0.5;   // walker radius used for the static checks (the client uses 0.45)
const rnd = (seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; })(12345);

// door tables from the shared helper: door id -> {a, b}
const DOORS = L.doors(), ROOM_DOORS = {}; for (const d of DOORS) for (const k of [d.a, d.b]) (ROOM_DOORS[k] = ROOM_DOORS[k] || []).push(d.id);
const VAULT = ROOM_DOORS['4'];

// every free cell of a room that can be reached from (sx, sz) with 0.4 m steps
function reach(inRoom, free, sx, sz) {
  const sn = v => Math.round(v / 0.4), key = (x, z) => sn(x) + ',' + sn(z); sx = sn(sx) * 0.4; sz = sn(sz) * 0.4; const seen = new Set([key(sx, sz)]), q = [[sx, sz]];
  for (let h = 0; h < q.length; h++) for (const [dx, dz] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
    const x = sn(q[h][0]) * 0.4 + dx, z = sn(q[h][1]) * 0.4 + dz, k = key(x, z); if (seen.has(k) || !inRoom(x, z) || !free(x, z)) continue; seen.add(k); q.push([x, z]);
  }
  return p => seen.has(key(p[0] + 0.001, p[1] + 0.001));
}

(async () => {
  const fail = await L.run('doorguard', [
    ['no prop blocks a spawn point, a door front or a control panel in any grid room', () => {
      for (let i = 0; i < 9; i++) {
        const [cx, cz] = W.rc(i), hx = W.roomW(i) / 2, hz = W.roomD(i) / 2;
        if (i !== W.VAULT) for (let k = 0; k < 1500; k++) { const [x, z] = W.randomPoint(i, rnd); assert(!W.inProp(x, z, R, null, true), 'spawn inside a prop in room ' + i + ' at ' + x.toFixed(2) + ',' + z.toFixed(2)); }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = -1.8; t <= 1.8; t += 0.6) for (const dep of [0.8, 1.5, 2.5, 3.5]) {
          const x = cx + dx * ((dx ? hx : 0) - dep) + (dx ? 0 : t), z = cz + dz * ((dz ? hz : 0) - dep) + (dz ? t : 0);
          assert(!W.inProp(x, z, R, null, true), 'door front blocked, room ' + i + ' side ' + dx + ',' + dz + ' at ' + x.toFixed(1) + ',' + z.toFixed(1));
        }
        for (const sx of [-1, 1]) { const x = cx + sx * W.panelDX(i), z = cz - hz + 1.2; assert(!W.inProp(x, z, R, null, true), 'panel blocked in room ' + i); }
      }
    }],
    ['every door front and panel is reachable on foot inside its room (no walled-off pockets), all room types', () => {
      const bounds = (cx, cz, hw, hd) => (x, z) => Math.abs(x - cx) <= hw - 0.7 && Math.abs(z - cz) <= hd - 0.7;
      for (let i = 0; i < 9; i++) {
        const [cx, cz] = W.rc(i), hw = W.roomW(i) / 2, hd = W.roomD(i) / 2, free = (x, z) => !W.inProp(x, z, R, null, true);
        const can = reach(bounds(cx, cz, hw, hd), free, cx, cz + (i === W.VAULT ? 0.5 : 0));
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert(can([cx + dx * (hw - 1.6), cz + dz * (hd - 1.6)]), 'door front unreachable, room ' + i + ' side ' + dx + ',' + dz);
        if (i !== W.VAULT) for (const sx of [-1, 1]) assert(can([cx + sx * W.panelDX(i), cz - hd + 1.6]), 'panel unreachable, room ' + i);
      }
      for (const c of W.CHEST) for (const type of ['chest', 'mystery', 'merchant']) {
        const types = { [c.id]: type }, free = (x, z) => !W.propsAt(x, z, types).some(p => Math.hypot(p.x - x, p.z - z) < p.r + R);
        const fx = c.cx - c.dx * (W.CS / 2 - 1.5), fz = c.cz - c.dz * (W.CS / 2 - 1.5);
        assert(free(fx, fz), 'chest room ' + c.id + ' (' + type + ') door front blocked');
        const can = reach(bounds(c.cx, c.cz, W.CS / 2, W.CS / 2), free, fx, fz);
        assert(can([c.cx, c.cz]) || !free(c.cx, c.cz), 'chest room ' + c.id + ' (' + type + ') centre unreachable from the door');
      }
    }],
    ['simulation: 3000 rounds of random votes and occupants, a room is never without an exit longer than TRAP_MS', () => {
      let worst = 0, unlocks = 0, trappedRounds = 0;
      for (let r = 0; r < 3000; r++) {
        const rooms = Object.keys(ROOM_DOORS), occ = rooms.filter(() => rnd() < 0.5), sel = {};
        for (const k of occ) if (k !== '4' && rnd() < 0.8) sel[k] = ROOM_DOORS[k][Math.floor(rnd() * ROOM_DOORS[k].length)];
        const picked = [...new Set(Object.values(sel))], vv = Object.values(sel).filter(d => VAULT.includes(d)).length;
        let open = picked.filter(d => vv >= 2 || !VAULT.includes(d));
        if (rnd() < 0.2) open = [];   // an empty round
        // 200 ms ticks like guardTick; the clock starts when the round starts
        const since = {}; let t = 0; const last = {};
        for (; t <= GUARD.TRAP_MS + 400; t += 200) {
          for (const k of occ) {
            if (!GUARD.trapped(k, open, ROOM_DOORS, VAULT)) { delete since[k]; continue; }
            if (since[k] == null) { since[k] = t; trappedRounds++; }
            else if (t - since[k] >= GUARD.TRAP_MS) { const d = GUARD.pickExit(k, sel, ROOM_DOORS, VAULT, rnd); assert(d >= 0 && !VAULT.includes(d) && ROOM_DOORS[k].includes(d), 'bad exit ' + d + ' for room ' + k); open = open.concat(d); unlocks++; delete since[k]; }
          }
        }
        for (const k of occ) { assert(!GUARD.trapped(k, open, ROOM_DOORS, VAULT), 'room ' + k + ' still locked in after the grace time (round ' + r + ')'); }
      }
      assert(trappedRounds > 500 && unlocks > 500, 'the simulation never trapped anyone: ' + trappedRounds);
    }],
    ['a chest room has exactly one door, and it is a non-vault exit; every outer room has a non-vault door', () => {
      for (const k of Object.keys(ROOM_DOORS)) {
        if (k === '4') continue;
        const ex = ROOM_DOORS[k].filter(d => !VAULT.includes(d)); assert(ex.length >= 1, 'room ' + k + ' has no non-vault door');
        if (k[0] === 'c') eq(ROOM_DOORS[k].length, 1, 'chest room ' + k + ' doors');
      }
    }],
  ]);
  if (fail) process.exit(1);
  // ---- live server: a human teleported into a chest room / outer room is never locked in longer than TRAP_MS (+ slack) ----
  const TRAP = 1500, srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500', GK_READY_MS: '300', GK_TRAP_MS: String(TRAP), GK_BOT_GRACE_MS: '60000', GK_SUDDEN_ROUND: '99', GK_MAX_ROUND: '99' });
  let bad = 1;
  try {
    bad = await L.run('doorguard', [
      ['live: occupied rooms (chest rooms and outer rooms) always regain an exit within the grace time, with a hint first', async () => {
        const c = await connect(srv.port, 'name=Locked&goblin=2&wins=0'); c.send({ enter: 1 });
        await c.until(x => x.state.round && x.state.round.n >= 1, 3000, 'round');
        let hint = 0, unlocked = 0; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.exitHint) hint++; if (d.exitOpen != null) unlocked++; });
        const spots = W.CHEST.map(q => [q.cx, q.cz]).concat([[W.rc(0)[0], W.rc(0)[1]], [W.rc(8)[0], W.rc(8)[1]]]);
        const t0 = Date.now();
        for (let i = 0; Date.now() - t0 < 16000; i++) {
          if (i % 40 === 0) { const s = spots[(i / 40) % spots.length]; c.send({ tp: [s[0], s[1]] }); await sleep(120); }
          await sleep(50);
        }
        assert(hint >= 1, 'no exitHint was ever sent'); assert(unlocked >= 1, 'no door ever unlocked for the trapped goblin');
        await c.close();
      }],
      ['live: after the grace time the teleported human stands in a room with an open non-vault door', async () => {
        const c = await connect(srv.port, 'name=Locked2&goblin=2&wins=0'); c.send({ enter: 1 });
        const ck = W.CHEST[3], doorOf = ROOM_DOORS['c' + ck.id][0];
        // wait for a round where the chest door is closed, then step in and measure the time to an open door
        let worst = 0;
        for (let r = 0; r < 4; r++) {
          await c.until(x => x.state.open && !x.state.open.includes(doorOf), 8000, 'a round with the chest door shut');
          c.send({ tp: [ck.cx, ck.cz] }); const t0 = Date.now();
          await c.until(x => x.state.open.includes(doorOf), TRAP + 2500, 'the trapped chest room gets an exit');
          worst = Math.max(worst, Date.now() - t0);
        }
        assert(worst <= TRAP + 1200, 'locked in for ' + worst + ' ms (grace ' + TRAP + ')');
        await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); process.exit(bad ? 1 : 0);
})();

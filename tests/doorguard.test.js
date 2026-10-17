// door guard (5x5): nobody stays locked in an arena room or a loot room; a home is never "trapped" (its hatch is always open, the arena cell outside counts instead);
// a hatch never counts as an exit; and no prop blocks a spawn, door front or panel.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const W = require('../world.js'), GUARD = require('../doorguard.js');
const R = 0.5;   // walker radius used for the static checks (the client uses 0.45)
const rnd = (seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; })(12345);

// door tables from the shared world (never hard-coded): door id -> {a, b}; room key -> door ids sorted N E S W
const DOORS = L.doors(), ROOM_DOORS = W.ROOM_DOORS, VK = W.VAULT_KEY;
const VAULT = ROOM_DOORS[VK], HATCH = W.HATCHES;
const isHome = k => k[0] === 'c' && W.CHEST[+k.slice(1)].home;
const ALL_ROOMS = Object.keys(ROOM_DOORS);

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
    ['no prop blocks a spawn point, a door front or a control panel in any arena room; home spawn points are clear too', () => {
      for (let i = 0; i < W.NARENA; i++) {
        const [cx, cz] = W.rc(i), hx = W.roomW(i) / 2, hz = W.roomD(i) / 2;
        if (W.kindOf(i) === 'arena') for (let k = 0; k < 500; k++) { const [x, z] = W.randomPoint(i, rnd); assert(!W.inProp(x, z, R, null, true), 'spawn inside a prop in room ' + i + ' at ' + x.toFixed(2) + ',' + z.toFixed(2)); }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let t = -1.8; t <= 1.8; t += 0.6) for (const dep of [0.8, 1.5, 2.5, 3.5]) {
          const x = cx + dx * ((dx ? hx : 0) - dep) + (dx ? 0 : t), z = cz + dz * ((dz ? hz : 0) - dep) + (dz ? t : 0);
          assert(!W.inProp(x, z, R, null, true), 'door front blocked, room ' + i + ' side ' + dx + ',' + dz + ' at ' + x.toFixed(1) + ',' + z.toFixed(1));
        }
        for (const sx of [-1, 1]) {
          const x = cx + sx * W.panelDX(i), z = cz - hz + 1.2;
          assert(!W.inProp(x, z, R, null, true), 'panel blocked in room ' + i);
        }
      }
      for (const id of W.HOME_IDS) for (let k = 0; k < 500; k++) { const [x, z] = W.randomPoint('c' + id, rnd); assert(!W.inProp(x, z, R, { [id]: 'home' }, true), 'home spawn inside a prop in c' + id); }
    }],
    ['every door front and panel is reachable on foot inside its room (no walled-off pockets), all room types', () => {
      const bounds = (cx, cz, hw, hd) => (x, z) => Math.abs(x - cx) <= hw - 0.7 && Math.abs(z - cz) <= hd - 0.7;
      for (let i = 0; i < W.NARENA; i++) {
        const [cx, cz] = W.rc(i), hw = W.roomW(i) / 2, hd = W.roomD(i) / 2, free = (x, z) => !W.inProp(x, z, R, null, true);
        const [sx0, sz0] = [[0, i === W.VAULT ? 0.5 : 0], [2.5, 2.5], [-2.5, 2.5], [2.5, -2.5], [-2.5, -2.5]].map(([a, b]) => [cx + a, cz + b]).find(([x, z]) => free(x, z));   // ROOMS5ART: a tree room has its trunk in the middle, so walk from the first free spot near it
        const can = reach(bounds(cx, cz, hw, hd), free, sx0, sz0);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert(can([cx + dx * (hw - 1.6), cz + dz * (hd - 1.6)]), 'door front unreachable, room ' + i + ' side ' + dx + ',' + dz);
        if (i !== W.VAULT) for (const sx of [-1, 1]) assert(can([cx + sx * W.panelDX(i), cz - hd + 1.6]), 'panel unreachable, room ' + i);
      }
      for (const c of W.CHEST) for (const type of c.home ? ['home'] : ['chest', 'mystery', 'merchant', 'forge', 'grand']) {
        const types = { [c.id]: type }, free = (x, z) => !W.propsAt(x, z, types).some(p => Math.hypot(p.x - x, p.z - z) < p.r + R);
        const fx = c.cx - c.dx * (c.size / 2 - 1.5), fz = c.cz - c.dz * (c.size / 2 - 1.5);
        assert(free(fx, fz), 'attached room ' + c.id + ' (' + type + ') door front blocked');
        const can = reach(bounds(c.cx, c.cz, c.size / 2, c.size / 2), free, fx, fz);
        assert(can([c.cx, c.cz]) || !free(c.cx, c.cz), 'attached room ' + c.id + ' (' + type + ') centre unreachable from the door');
        if (c.home) for (const [lx, lz] of [[0, 0], [-1.5, 0], [1.5, 0], [0, 1.5]]) { const [x, z] = W.attLocal(c, lx, lz); assert(can([x, z]), 'home ' + c.id + ' floor at local ' + lx + ',' + lz + ' unreachable'); }
      }
    }],
    ['simulation: 3000 rounds of random votes and occupants (a goblin at home occupies his arena cell): no occupied non-vault room stays locked in after TRAP_MS', () => {
      let worst = 0, unlocks = 0, trappedRounds = 0, hatchOnly = 0;
      for (let r = 0; r < 3000; r++) {
        const rooms = ALL_ROOMS, occ = [...new Set(rooms.filter(() => rnd() < 0.5).map(L.cellOf))], sel = {};
        for (const k of occ) if (k !== VK && rnd() < 0.8) { const votable = ROOM_DOORS[k].filter(d => !HATCH.includes(d)); sel[k] = votable[Math.floor(rnd() * votable.length)]; }
        const picked = [...new Set(Object.values(sel))], vv = Object.values(sel).filter(d => VAULT.includes(d)).length;
        let open = picked.filter(d => vv >= 2 || !VAULT.includes(d));
        if (rnd() < 0.2) open = [];   // an empty round
        const isOpen = d => W.alwaysOpen(d) || open.includes(d);   // a hatch is always open
        // 200 ms ticks like guardTick; the clock starts when the round starts
        const since = {}; let t = 0;
        for (; t <= GUARD.TRAP_MS + 400; t += 200) {
          for (const k of occ) {
            if (!GUARD.trapped(k, isOpen, ROOM_DOORS, VAULT)) { delete since[k]; continue; }
            if (k === VK) throw new Error('the vault was reported trapped');
            if (since[k] == null) { since[k] = t; trappedRounds++; if (ROOM_DOORS[k].some(d => HATCH.includes(d) && isOpen(d))) hatchOnly++; }
            else if (t - since[k] >= GUARD.TRAP_MS) { const d = GUARD.pickExit(k, sel, ROOM_DOORS, VAULT, rnd); assert(d >= 0 && !VAULT.includes(d) && !HATCH.includes(d) && ROOM_DOORS[k].includes(d), 'bad exit ' + d + ' for room ' + k); open = open.concat(d); unlocks++; delete since[k]; }
          }
        }
        for (const k of occ) { assert(!GUARD.trapped(k, isOpen, ROOM_DOORS, VAULT), 'room ' + k + ' still locked in after the grace time (round ' + r + ')'); }
      }
      assert(trappedRounds > 500 && unlocks > 500, 'the simulation never trapped anyone: ' + trappedRounds);
      assert(hatchOnly > 50, 'the simulation never had a hall whose only open way was the hatch: ' + hatchOnly);
    }],
    ['a hatch never counts as an exit: a hall whose only open way is the hatch home is trapped; pickExit never picks a hatch', () => {
      for (const h of HATCH) {
        const d = W.DOORS[h], cell = d.a; assert(!GUARD.isExit(h, VAULT), 'hatch ' + h + ' counts as an exit');
        eq(GUARD.trapped(cell, id => id === h, ROOM_DOORS, VAULT), true, 'cell ' + cell + ' with only its hatch open must be trapped');
        const other = ROOM_DOORS[cell].find(x => x !== h && !VAULT.includes(x)); eq(GUARD.trapped(cell, id => id === h || id === other, ROOM_DOORS, VAULT), false, 'cell ' + cell + ' with a normal door open');
        for (let k = 0; k < 200; k++) { const p = GUARD.pickExit(cell, { [cell]: h }, ROOM_DOORS, VAULT, rnd); assert(p >= 0 && p !== h && !VAULT.includes(p), 'pickExit picked ' + p + ' in ' + cell); }
        eq(GUARD.pickExit(cell, { [cell]: h }, ROOM_DOORS, VAULT, () => 0) !== h, true);
      }
      for (const id of W.LOOT_IDS) { const k = 'c' + id; eq(GUARD.trapped(k, [], ROOM_DOORS, VAULT), true, 'closed loot room ' + k); eq(GUARD.trapped(k, ROOM_DOORS[k], ROOM_DOORS, VAULT), false, 'open loot room ' + k); }
    }],
    ['a home is never "trapped" (even with every door shut), neither is the vault; the guard skips them', () => {
      for (const k of ALL_ROOMS.filter(isHome)) { eq(GUARD.trapped(k, [], ROOM_DOORS, VAULT), false, 'home ' + k); eq(GUARD.trapped(k, () => false, ROOM_DOORS, VAULT), false, 'home ' + k + ' (fn)'); }
      eq(GUARD.trapped(VK, [], ROOM_DOORS, VAULT), false, 'vault');
      // an explicit skip set replaces the default
      eq(GUARD.trapped('0', [], ROOM_DOORS, VAULT, { skip: new Set(['0']) }), false); eq(GUARD.trapped('0', [], ROOM_DOORS, VAULT), true);
    }],
    ['room door counts: a loot room has exactly one door (a non-vault exit), a home exactly one hatch, the vault 4 vault doors; every arena room has a non-vault, non-hatch exit', () => {
      for (const k of ALL_ROOMS) {
        if (k === VK) { eq(ROOM_DOORS[k].length, 4); continue; }
        const ex = ROOM_DOORS[k].filter(d => !VAULT.includes(d) && !HATCH.includes(d));
        if (k[0] === 'c') {
          eq(ROOM_DOORS[k].length, 1, 'attached room ' + k + ' doors');
          if (isHome(k)) { eq(ex.length, 0, 'home ' + k + ' has an exit that is not its hatch'); eq(ROOM_DOORS[k].filter(d => HATCH.includes(d)).length, 1); }
          else eq(ex.length, 1, 'loot room ' + k + ' door must be a normal exit');
        } else assert(ex.length >= 1, 'room ' + k + ' has no non-vault, non-hatch door');
      }
    }],
    ['a loot door is no way out of an arena cell (the loot room is a dead end): a corner cell with only its two loot doors open is trapped and pickExit opens an arena door', () => {
      const LOOT = W.DOORS.filter(d => d.kind === 'loot').map(d => d.id);
      for (const i of [0, 4, 20, 24]) {
        const k = String(i), lootDs = ROOM_DOORS[k].filter(d => LOOT.includes(d)); eq(lootDs.length, 2, 'corner ' + k + ' has two loot doors');
        eq(GUARD.trapped(k, lootDs, ROOM_DOORS, VAULT), true, 'corner ' + k + ' with only loot doors open');
        for (let n = 0; n < 100; n++) { const d = GUARD.pickExit(k, { [k]: lootDs[0] }, ROOM_DOORS, VAULT, rnd); assert(d >= 0 && !LOOT.includes(d) && W.DOORS[d].kind === 'arena', 'pickExit picked ' + d + ' for corner ' + k); }
      }
      for (const id of W.LOOT_IDS) { const k = 'c' + id, d = ROOM_DOORS[k][0]; eq(GUARD.isExit(d, VAULT, undefined, k), true, 'the loot door is the exit of ' + k); eq(GUARD.pickExit(k, {}, ROOM_DOORS, VAULT, rnd), d); }
    }],
  ]);
  if (fail) process.exit(1);
  // ---- live server: a human teleported into a loot room / arena room is never locked in longer than TRAP_MS (+ slack) ----
  const TRAP = 1500, srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500', GK_READY_MS: '300', GK_TRAP_MS: String(TRAP), GK_BOT_GRACE_MS: '60000', GK_SUDDEN_ROUND: '99', GK_MAX_ROUND: '99' });
  const srv5 = await L.startServer({ GK_ROUND_MS: '9000' });   // the default 5 s guard; round 1 (the home phase) lasts 9 s
  let bad = 1;
  try {
    bad = await L.run('doorguard', [
      ['live: home phase: in round 1 the guard leaves a goblin at home alone (no hint, no door, his hatch is shut); round 2 (the hall round) opens his hatch and nothing else, and the guard leaves home + hall alone for that round', async () => {
        const c = await connect(srv5.port, 'name=Homebody&goblin=2&wins=0'); const home = c.state.matchStart.spawn.home, cell = L.cellOf(home);
        eq(c.state.open, [], 'no door open at GO'); eq(c.state.homeLock, 1, 'round 1 says the homes are shut');
        await sleep(6500);
        eq(c.state.open, [], 'the guard opened nothing in the home phase'); assert(!c.msgs.some(m => m.exitHint || m.exitOpen != null), 'no exit hint in the home phase');
        await c.until(x => x.state.round.n === 2, 6000, 'round 2');
        assert(!c.msgs.slice().reverse().find(m => m.round).homeLock, 'round 2 has no home lock');
        eq(c.state.open, [], 'DOORS-PERSIST: round 2 opens no door of cell ' + cell + ' (only the hatch)');
        const n0 = c.msgs.length; await sleep(6500);   // longer than the default 5 s grace
        eq(c.state.open, [], 'the guard opened nothing in the hall round'); assert(!c.msgs.slice(n0).some(m => m.exitHint || m.exitOpen != null), 'no exit hint in the hall round');
        await c.close();
      }],
      ['live: occupied rooms (loot rooms, homes and arena rooms) always regain an exit within the grace time, with a hint first', async () => {
        const c = await connect(srv.port, 'name=Locked&goblin=2&wins=0'); c.send({ enter: 1 });
        await c.until(x => x.state.round && x.state.round.n >= 1, 3000, 'round');
        let hint = 0, unlocked = 0; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.exitHint) hint++; if (d.exitOpen != null) unlocked++; });
        const spots = W.CHEST.map(q => [q.cx, q.cz]).concat([W.rc(0), W.rc(W.NARENA - 1)]);
        const t0 = Date.now();
        for (let i = 0; Date.now() - t0 < 16000; i++) {
          if (i % 40 === 0) { const s = spots[(i / 40) % spots.length]; c.send({ tp: [s[0], s[1]] }); await sleep(120); }
          await sleep(50);
        }
        assert(hint >= 1, 'no exitHint was ever sent'); assert(unlocked >= 1, 'no door ever unlocked for the trapped goblin');
        await c.close();
      }],
      ['live: after the grace time the teleported human stands in a loot room with an open door', async () => {
        const c = await connect(srv.port, 'name=Locked2&goblin=2&wins=0'); c.send({ enter: 1 });
        // DOORS-PERSIST: an opened door stays open, so each try takes a loot room whose door is still shut, steps in and measures the time to an open door
        let worst = 0;
        for (let r = 0; r < 4; r++) {
          const rn = c.state.round.n; await c.until(x => x.state.round.n > rn, 8000, 'a fresh round');   // the guard's timers restart with each round: step in at its start
          await c.until(x => x.state.open && W.LOOT_IDS.some(id => !x.state.open.includes(ROOM_DOORS['c' + id][0])), 8000, 'a loot room with its door shut');
          const id = W.LOOT_IDS.find(i => !c.state.open.includes(ROOM_DOORS['c' + i][0])), ck = W.CHEST[id], doorOf = ROOM_DOORS['c' + id][0];
          c.send({ tp: [ck.cx, ck.cz] }); const t0 = Date.now();
          await c.until(x => x.state.open.includes(doorOf), TRAP + 2500, 'the trapped loot room gets an exit');
          worst = Math.max(worst, Date.now() - t0);
        }
        assert(worst <= TRAP + 1200, 'locked in for ' + worst + ' ms (grace ' + TRAP + ')');
        await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); srv5.stop(); process.exit(bad ? 1 : 0);
})();

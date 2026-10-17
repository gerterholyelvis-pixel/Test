// DOORS-PERSIST (docs/reports/doors-persist.md): a door that opened stays open for the rest of the match; votes only add doors; round 2 (the hall round) opens the hatches
// and nothing else, and the guard leaves home + hall alone for that round; a vault bar shuts an open vault door at once and it reopens when the round ends.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), GUARD = require('../doorguard.js');
const ROOM_DOORS = W.ROOM_DOORS, VK = W.VAULT_KEY, VAULT = ROOM_DOORS[VK], HATCH = W.HATCHES;
const HOME_CELLS = new Set(W.HOME_IDS.map(id => String(W.CHEST[id].parent)));
const rnd = (seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; })(777);
const other = (d, k) => W.DOORS[d].a === k ? W.DOORS[d].b : W.DOORS[d].a;

(async () => {
  let fail = await L.run('doors-persist', [
    ['map: every home leads into its own hall; every loot room hangs off one arena cell and its door is on that cell\'s panel; every room can be reached from every home by votable doors', () => {
      eq(HOME_CELLS.size, W.HOME_IDS.length, 'one home per hall');
      for (const id of W.HOME_IDS) { const k = 'c' + id; eq(ROOM_DOORS[k].length, 1); assert(HATCH.includes(ROOM_DOORS[k][0]), 'a home has one hatch'); eq(other(ROOM_DOORS[k][0], k), String(W.CHEST[id].parent)); }
      for (const id of W.LOOT_IDS) { const k = 'c' + id, d = ROOM_DOORS[k][0], cell = other(d, k); assert(/^\d+$/.test(cell) && ROOM_DOORS[cell].includes(d) && !HATCH.includes(d), 'loot room ' + k + ' door ' + d + ' is votable from cell ' + cell); }
      const isHomeKey = k => k[0] === 'c' && W.CHEST[+k.slice(1)].home;
      for (const id of W.HOME_IDS) {   // flood from a home: out through its hatch, then over votable doors only (never into another home)
        const seen = new Set(['c' + id]), q = ['c' + id];
        while (q.length) { const k = q.shift(); for (const d of ROOM_DOORS[k]) { const o = other(d, k); if (seen.has(o) || isHomeKey(o)) continue; seen.add(o); q.push(o); } }
        for (const k of Object.keys(ROOM_DOORS)) if (!isHomeKey(k)) assert(seen.has(k), 'room ' + k + ' unreachable from home c' + id);
      }
    }],
    ['simulation: 2000 matches of 7 rounds with persistent doors: the open set only grows, the guard never touches a hall in round 2, and nobody stays locked in after round 2', () => {
      let grew = 0, hallSkips = 0, unlocks = 0;
      for (let g = 0; g < 2000; g++) {
        let open = []; const opens = d => W.alwaysOpen(d) || open.includes(d);
        for (let round = 2; round <= 7; round++) {
          const before = open.slice();
          // occupants: in round 2 everyone is at home or in his hall (only the hatches are open); later anywhere reachable is fine for the guard check
          const occ = round === 2 ? [...HOME_CELLS].filter(() => rnd() < 0.8) : [...new Set(Object.keys(ROOM_DOORS).filter(() => rnd() < 0.3).map(L.cellOf))];
          const skip = round === 2 ? k => (k[0] === 'c' && W.CHEST[+k.slice(1)].home) || HOME_CELLS.has(k) : undefined;
          for (const k of occ) {
            const t = GUARD.trapped(k, opens, ROOM_DOORS, VAULT, skip ? { skip } : undefined);
            if (round === 2) { assert(!t, 'the guard would open a door of hall ' + k + ' in round 2'); hallSkips++; continue; }
            if (t) { const d = GUARD.pickExit(k, {}, ROOM_DOORS, VAULT, rnd); assert(d >= 0 && W.DOORS[d].kind === 'arena', 'the guard picked ' + d + ' for ' + k); open = open.concat(d); unlocks++; }
            assert(!GUARD.trapped(k, opens, ROOM_DOORS, VAULT), 'room ' + k + ' still trapped in round ' + round);
          }
          // the vote: each occupied room picks one of its shut, votable doors; the vault needs 2 rooms
          const sel = {}; for (const k of occ) { const ds = ROOM_DOORS[k].filter(d => !HATCH.includes(d) && !open.includes(d)); if (ds.length && rnd() < 0.85) sel[k] = ds[Math.floor(rnd() * ds.length)]; }
          const picked = [...new Set(Object.values(sel))], ok = Object.values(sel).filter(d => VAULT.includes(d)).length >= 2;
          open = [...new Set([...open, ...picked.filter(d => ok || !VAULT.includes(d))])];
          for (const d of before) assert(open.includes(d), 'door ' + d + ' closed again in round ' + round);
          if (open.length > before.length) grew++;
        }
      }
      assert(grew > 5000 && hallSkips > 5000 && unlocks > 100, 'the simulation exercised the rules: ' + [grew, hallSkips, unlocks]);
    }],
  ]);
  if (fail) process.exit(1);
  const srv = await L.startServer({ GK_MATCH_SIZE: '1', GK_ROUND_MS: '1500', GK_NEXT_ROUND_MS: '2600', GK_TRAP_MS: '1200', GK_SUDDEN_ROUND: '99', GK_MAX_ROUND: '99' });
  const srvBar = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '1500', GK_NEXT_ROUND_MS: '9000', GK_SUDDEN_ROUND: '99', GK_MAX_ROUND: '99' });
  try {
    fail = await L.run('doors-persist', [
      ['live: round 2 opens the hatch and nothing else (no PACE door, no guard door, no hint, even after the grace time); a hall vote opens at the round end', async () => {
        const c = await connect(srv.port, 'goblin=2'), home = c.state.matchStart.spawn.home, cell = L.cellOf(home);
        await c.until(x => x.state.round.n === 2, 4000, 'round 2'); eq(c.state.open, [], 'round 2 starts with only the hatches open');
        const n0 = c.msgs.length; c.send({ tp: L.centre(cell) }); await sleep(1700);   // longer than GK_TRAP_MS: the guard would have fired in any other room
        eq(c.state.open, [], 'the guard opened nothing in the hall round'); assert(!c.msgs.slice(n0).some(m => m.exitHint || m.exitOpen != null), 'no exit hint in the hall round');
        const d = ROOM_DOORS[cell].find(x => W.DOORS[x].kind === 'arena'); c.send({ sel: d }); await c.until(x => x.state.sel[cell] === d, 1500, 'hall pick');
        await c.until(x => x.state.round.n === 3, 4000, 'round 3'); assert(c.state.open.includes(d), 'the hall pick opened: ' + c.state.open);
        await c.close();
      }],
      ['live: 7 rounds of votes: every opened door stays open (the set only grows), a vote on an open door is ignored', async () => {
        const c = await connect(srv.port, 'goblin=2'); await c.until(x => x.state.round.n === 2, 4000, 'round 2');
        let room = L.cellOf(c.state.matchStart.spawn.home); const mine = []; let prev = [];
        for (let r = 2; r <= 8; r++) {
          await c.until(x => x.state.round.n === r, 5000, 'round ' + r);
          for (const d of prev) assert(c.state.open.includes(d), 'door ' + d + ' closed again in round ' + r + ': ' + c.state.open);
          for (const d of mine) assert(c.state.open.includes(d), 'my pick ' + d + ' is not open in round ' + r);
          prev = c.state.open.slice();
          if (mine.length) { const od = mine[mine.length - 1]; room = other(od, room); }   // walk on through the door I opened last
          c.send({ tp: L.centre(room) }); await sleep(150);
          const shut = ROOM_DOORS[room].find(x => W.DOORS[x].kind === 'arena' && !c.state.open.includes(x)), open1 = ROOM_DOORS[room].find(x => c.state.open.includes(x));
          if (open1 != null) { c.send({ sel: open1 }); await sleep(200); eq(c.state.sel[room], undefined, 'a vote on an open door is ignored'); }
          if (shut == null || r === 8) continue;
          c.send({ sel: shut }); await c.until(x => x.state.sel[room] === shut, 1500, 'pick in round ' + r); mine.push(shut);
        }
        assert(mine.length >= 5, 'votes over the rounds: ' + mine); await c.close();
      }],
      ['live: a vault bar shuts an open vault door at once (round state "shut"), it reopens for good when the round ends', async () => {
        const [a, b] = await Promise.all([connect(srvBar.port, 'goblin=0'), connect(srvBar.port, 'goblin=1')]);
        const [n1, n2] = L.vaultNeighbours(), dN = L.doorBetween(n1, VK), d2 = L.doorBetween(n2, VK);   // n1 is the cell north of the vault (its door is the N door)
        await a.until(x => x.state.round.n === 2, 5000, 'round 2');
        a.send({ tp: L.centre(n1) }); b.send({ tp: L.centre(n2) }); await sleep(150);
        a.send({ sel: dN }); b.send({ sel: d2 }); await a.until(x => x.state.vaultVotes === 2, 3000, 'two vault votes');
        await a.until(x => x.state.round.n === 3, 12000, 'round 3'); assert(a.state.open.includes(dN) && a.state.open.includes(d2), 'both vault doors open: ' + a.state.open);
        const [vx, vz] = L.centre(VK);   // the N bar rack stands at (+5.7, -10.85) from the vault centre (world.js vault anchors D_N)
        a.send({ tp: [vx + 5.7, vz - 10.85 + 1.3] }); await sleep(250); a.send({ act: { r: VK, a: 'D_N', v: 'use' } });
        await a.until(x => !x.state.open.includes(dN) && (x.state.shut || []).includes(dN), 8000, 'the barred N door shuts at once');
        assert(a.state.open.includes(d2), 'the other vault door stays open'); eq(a.state.round.n, 3, 'still round 3');
        await a.until(x => x.state.round.n === 4, 12000, 'round 4'); const last = a.msgs.slice().reverse().find(m => m.round);   // (c.state keeps old keys: read the latest round message for 'shut')
        assert(a.state.open.includes(dN) && !(last.shut || []).includes(dN), 'the barred door reopened at the round end: ' + a.state.open);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { fail = 1; console.log('  FAIL  doors-persist setup: ' + (e.stack || e)); }
  srv.stop(); srvBar.stop(); process.exit(fail ? 1 : 0);
})();

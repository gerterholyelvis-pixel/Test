// Pure geometry checks on world.js v2 (5x5 arena + 20 attached rooms, no server). See docs/PLAN-5x5.md sections 1, 6 and 9.
const W = require('../world.js'), { run, assert, eq } = require('./lib.js');
const STEP = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] };
const rects = () => W.ROOMS.map(r => ({ key: r.key, x0: r.cx - r.hw, x1: r.cx + r.hw, z0: r.cz - r.hd, z1: r.cz + r.hd }));
const propTypes = id => W.CHEST[id].home ? 'home' : id % 3 === 0 ? 'mystery' : id % 3 === 1 ? 'forge' : 'grand';   // a mix of loot room types for the prop checks
run('world', [
  ['25 arena rooms + 20 attached rooms (8 homes, 12 loot rooms), kinds: 1 vault, 4 tree rooms, 4 vaultbreaker rooms', () => {
    eq(W.ROOMS.length, 45); eq(W.NARENA, 25); eq(W.NATT, 20); eq(W.CHEST.length, 20); eq(W.N, 5);
    eq(W.ROOMS.filter(r => r.key[0] !== 'c').length, 25); eq(W.ROOMS.filter(r => r.kind === 'home').length, 8); eq(W.ROOMS.filter(r => r.kind === 'loot').length, 12);
    eq(W.ROOMS.filter(r => r.kind === 'vault').map(r => r.key), ['12']); eq(W.VAULT, 12); eq(W.VAULT_KEY, '12'); eq(W.rc(12), [0, 0]);
    eq(W.ROOMS.filter(r => r.kind === 'tree').map(r => r.i), [6, 8, 16, 18]); eq(W.ROOMS.filter(r => r.kind === 'vb').map(r => r.i), [7, 11, 13, 17]);
    eq(new Set(W.ROOMS.map(r => r.key)).size, 45, 'duplicate room keys');
  }],
  ['no two rooms overlap (they may touch)', () => {
    const R = rects();
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
      const p = R[a], q = R[b], ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), oz = Math.min(p.z1, q.z1) - Math.max(p.z0, q.z0);
      assert(!(ox > 1e-9 && oz > 1e-9), 'rooms ' + p.key + ' and ' + q.key + ' overlap');
    }
    // the 25 arena rooms tile the grid exactly
    const area = R.filter(r => r.key[0] !== 'c').reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0); assert(Math.abs(area - (2 * W.HALF) ** 2) < 1e-6, 'arena rooms do not tile the grid: ' + area);
  }],
  ['roomKeyOf round-trips every room centre', () => {
    for (const r of W.ROOMS) eq(W.roomKeyOf(r.cx, r.cz), r.key, 'centre of ' + r.key);
    for (let i = 0; i < 25; i++) { const [x, z] = W.rc(i); eq(W.roomAt(x, z), i); }
  }],
  ['randomPoint stays inside its own room and round-trips through roomKeyOf (2000 samples per room, all 45 rooms)', () => {
    for (const r of W.ROOMS) for (let k = 0; k < 2000; k++) {
      const [x, z] = W.randomPoint(r.key); if (W.roomKeyOf(x, z) !== r.key) throw new Error('room ' + r.key + ' got ' + x + ',' + z);
      assert(Math.abs(x - r.cx) <= r.hw - 3 + 1e-9 && Math.abs(z - r.cz) <= r.hd - 3 + 1e-9, 'randomPoint breaks the 3 m margin in ' + r.key);
    }
    for (let i = 0; i < 25; i++) for (let k = 0; k < 200; k++) { const [x, z] = W.randomPoint(i); eq(W.roomKeyOf(x, z), String(i)); }   // an arena index works too
  }],
  ['room sizes: corners 15x15, vault row / column 22.5x15 / 15x22.5, vault 22.5x22.5, homes 10x10, loot rooms 8x8', () => {
    eq(W.SCALE, 1.25); eq([W.W, W.V, W.CS, W.HS], [15, 22.5, 8, 10]);
    for (const i of [0, 4, 20, 24]) eq([W.roomW(i), W.roomD(i)], [15, 15], 'corner ' + i);
    for (let i = 0; i < 25; i++) { const col = i % 5, row = Math.floor(i / 5); eq([W.roomW(i), W.roomD(i)], [col === 2 ? 22.5 : 15, row === 2 ? 22.5 : 15], 'room ' + i); }
    for (const i of [10, 11, 13, 14]) eq([W.roomW(i), W.roomD(i)], [15, 22.5]);   // the vault row: 15 wide, 22.5 deep
    for (const i of [2, 7, 17, 22]) eq([W.roomW(i), W.roomD(i)], [22.5, 15]);     // the vault column: 22.5 wide, 15 deep
    eq([W.roomW(12), W.roomD(12)], [22.5, 22.5]);
    for (const r of W.ROOMS) if (r.kind === 'home') eq([2 * r.hw, 2 * r.hd], [10, 10], r.key); else if (r.kind === 'loot') eq([2 * r.hw, 2 * r.hd], [8, 8], r.key);
    eq([W.HALF, W.LIM], [41.25, 51.25]); eq(W.rc(0), [-33.75, -33.75]);
  }],
  ['attached rooms: ids c0..c19, 5 per side (N E S W), positions 1..5 clockwise along the side; homes at positions 2 and 4, loot at 1, 3, 5; each behind its own outer wall segment', () => {
    W.CHEST.forEach((c, i) => {
      const pos = i % 5 + 1, home = pos === 2 || pos === 4;
      eq(c.id, i); eq(c.side, 'NESW'[Math.floor(i / 5)], 'side of ' + i); eq(c.pos, pos, 'position of ' + i); eq(c.home, home, 'home flag of ' + i); eq(c.size, home ? 10 : 8);
      eq(W.attachedSide(i), c.side); eq(W.attachedSide('c' + i), c.side); eq(W.attachedPos(i), pos); eq(W.attachedPos('c' + i), pos); eq(W.attachedId(c.side, pos), i);
      assert(!W.inGrid(c.cx, c.cz), 'attached room ' + i + ' inside the grid');
      assert(Math.abs(c.cx - c.wallX) + Math.abs(c.cz - c.wallZ) === c.size / 2, 'attached room ' + i + ' not adjacent to its wall');
      assert(Math.abs(c.wallX) === W.HALF || Math.abs(c.wallZ) === W.HALF, 'attached room ' + i + ' wall is not an outer wall');
      assert(Math.abs(c.cx) <= W.LIM && Math.abs(c.cz) <= W.LIM, 'attached room ' + i + ' beyond LIM');
      const col = W.colOf(c.parent), row = W.rowOf(c.parent); assert(col === 0 || col === 4 || row === 0 || row === 4, 'parent ' + c.parent + ' is not a perimeter cell');
      eq(c.parent, W.SIDE_CELLS[c.side][pos - 1]); assert(W.attachedOf(c.parent).includes(c), 'attachedOf ' + c.parent);
      eq(W.chestKey(c.parent, c.side), 'c' + i); eq(W.attachedAt(c.cx, c.cz), i); eq(W.isHomeKey('c' + i), home);
      // centred on its cell's outer wall segment and narrower than it, so neighbours along a side never overlap
      if (c.dz) { eq(c.cx, W.rc(c.parent)[0]); assert(c.size < W.roomW(c.parent), 'wider than its segment'); } else { eq(c.cz, W.rc(c.parent)[1]); assert(c.size < W.roomD(c.parent), 'deeper than its segment'); }
    });
    eq(W.HOME_IDS, [1, 3, 6, 8, 11, 13, 16, 18]); eq(W.LOOT_IDS, [0, 2, 4, 5, 7, 9, 10, 12, 14, 15, 17, 19]);
    for (let s = 0; s < 8; s++) eq(W.homeOf(s), 'c' + W.HOME_IDS[s]);
    // corner cells have two attached rooms (one per outward side, both loot rooms), the other perimeter cells one, inner cells none
    for (let i = 0; i < 25; i++) {
      const c = W.colOf(i), r = W.rowOf(i), n = (r === 0) + (r === 4) + (c === 0) + (c === 4);
      eq(W.CHEST.filter(a => a.parent === i).length, n, 'attached rooms of cell ' + i); eq(W.attachedOf(i).length, n);
      if (n === 2) for (const a of W.attachedOf(i)) assert(!a.home && (a.pos === 1 || a.pos === 5), 'corner room ' + a.id + ' must be a loot room at position 1 or 5');
    }
    eq(W.CHEST.map(c => c.side).join(''), 'NNNNNEEEEESSSSSWWWWW');
    for (const id of W.HOME_IDS) assert([2, 4].includes(W.attachedPos(id)), 'home position');
    // the two rooms of a corner do not touch: the gap across the diagonal is at least 3 m
    for (const i of [0, 4, 20, 24]) { const [p, q] = W.attachedOf(i); assert(Math.abs(p.cx - q.cx) - (p.size + q.size) / 2 >= 3 || Math.abs(p.cz - q.cz) - (p.size + q.size) / 2 >= 3, 'corner rooms of ' + i + ' too close'); }
    // the diagonal square beyond a corner is void
    for (const [x, z] of [[-46, -46], [46, -46], [46, 46], [-46, 46]]) eq(W.roomKeyOf(x, z), 'c-1');
  }],
  ['60 doors in canonical order: for i = 0..24 its E door, its S door, then its attached door(s) (N E S W); ids are 0..59', () => {
    eq(W.DOORS.length, 60); W.DOORS.forEach((d, i) => eq(d.id, i, 'door id'));
    const want = [];
    for (let i = 0; i < 25; i++) {
      if (W.colOf(i) < 4) want.push([String(i), String(i + 1)]);
      if (W.rowOf(i) < 4) want.push([String(i), String(i + 5)]);
      for (const side of 'NESW') { const a = W.CHEST.find(c => c.parent === i && c.side === side); if (a) want.push([String(i), 'c' + a.id]); }
    }
    eq(want.length, 60); eq(W.DOORS.map(d => [d.a, d.b]), want);
  }],
  ['door kinds: 40 grid doors (36 plain + 4 vault), 8 hatches (homes), 12 loot doors; the vault has exactly 4 doors', () => {
    const by = k => W.DOORS.filter(d => d.kind === k);
    eq(by('vault').length, 4); eq(by('arena').length, 36); eq(by('hatch').length, 8); eq(by('loot').length, 12);
    eq(W.ROOM_DOORS['12'].length, 4); for (const id of W.ROOM_DOORS['12']) eq(W.DOORS[id].kind, 'vault');
    eq(W.HATCHES.length, 8); eq(W.HATCHES, by('hatch').map(d => d.id));
    for (const d of W.DOORS) {
      eq(W.alwaysOpen(d.id), d.kind === 'hatch', 'alwaysOpen ' + d.id);
      if (d.kind === 'hatch') { assert(d.b[0] === 'c' && W.CHEST[+d.b.slice(1)].home, 'a hatch leads to a home'); eq(W.ROOM_DOORS[d.b].length, 1, 'a home has one doorway'); }
      if (d.kind === 'loot') { assert(d.b[0] === 'c' && !W.CHEST[+d.b.slice(1)].home, 'a loot door leads to a loot room'); eq(W.ROOM_DOORS[d.b].length, 1, 'a loot room has one door'); }
    }
    eq(W.alwaysOpen(-1), false); eq(W.alwaysOpen(999), false);
    // every room lists its doors sorted N E S W
    const order = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    for (const k in W.ROOM_DOORS) { const sides = W.ROOM_DOORS[k].map(id => { const d = W.DOORS[id]; return order.indexOf(d.a === k ? d.da : d.db); }); eq(sides, sides.slice().sort((p, q) => p - q), 'door order of ' + k); }
  }],
  ['doors connect adjacent rooms: stepping through the wall midpoint changes room by one step', () => {
    for (const d of W.DOORS) {
      const [dx, dz] = STEP[d.da], { x, z } = d.wall;   // da = the side of room a that faces b
      eq([W.roomKeyOf(x - dx, z - dz), W.roomKeyOf(x + dx, z + dz)], [d.a, d.b], 'door ' + d.id + ' ' + d.a + '|' + d.b);
      eq(STEP[d.db], [-dx, -dz], 'door ' + d.id + ' sides face each other');
      if (d.kind !== 'hatch' && d.kind !== 'loot') { const step = Math.abs(+d.b - +d.a); assert(step === 1 || step === 5, 'door ' + d.id + ' is not a one-step neighbour'); eq(step, dx ? 1 : 5); }
      // the doorway sits on the wall between two rooms: its centre lies along the shared edge of both rooms
      const ra = W.roomRect(d.a), rb = W.roomRect(d.b); assert(Math.abs(d.c - (d.axis === 'x' ? x : z)) < 1e-9, 'door ' + d.id + ' centre');
      assert(Math.abs(d.c - (d.axis === 'x' ? ra.cx : ra.cz)) < 1e-9 || Math.abs(d.c - (d.axis === 'x' ? rb.cx : rb.cz)) < 1e-9, 'door ' + d.id + ' is not centred on a room');
    }
  }],
  ['rotational symmetry: rotating the world 90 degrees about the origin maps homes to homes, loot rooms to loot rooms, arena kinds to the same kinds', () => {
    for (const rot of [([x, z]) => [-z, x], ([x, z]) => [z, -x]]) {
      let okAll = true; const errs = [];
      for (const r of W.ROOMS) {
        const [x, z] = rot([r.cx, r.cz]), k = W.roomKeyOf(x, z), q = W.roomRect(k);
        if (!q || q.kind !== r.kind || Math.abs(q.cx - x) > 1e-9 || Math.abs(q.cz - z) > 1e-9 || Math.abs(q.hw - r.hd) > 1e-9 || Math.abs(q.hd - r.hw) > 1e-9) { okAll = false; errs.push(r.key + '->' + k); }
      }
      if (rot([1, 0])[0] === 0 && rot([1, 0])[1] === 1) assert(okAll, 'rotation by +90 is not a symmetry: ' + errs.join(' '));   // (x, z) -> (-z, x)
      if (rot([1, 0])[1] === -1) assert(okAll, 'rotation by -90 is not a symmetry: ' + errs.join(' '));
    }
    // consecutive sides are exactly 5 ids apart: rotating side s position p gives side s+1 position p
    const rot = ([x, z]) => [-z, x];
    for (const c of W.CHEST) { const [x, z] = rot([c.cx, c.cz]), k = W.roomKeyOf(x, z); eq(k, 'c' + (c.id + 5) % 20, 'rotating c' + c.id); }
    // doors map to doors (same kind)
    for (const d of W.DOORS) { const [x, z] = rot([d.wall.x, d.wall.z]), found = W.DOORS.find(e => Math.abs(e.wall.x - x) < 1e-9 && Math.abs(e.wall.z - z) < 1e-9); assert(found && found.kind === d.kind, 'door ' + d.id + ' has no rotated twin'); }
  }],
  ['ceiling panels: 2x2 in a W x W room, 3x2 / 2x3 next to the vault, 3x3 in the vault, all under the ceiling', () => {
    for (let i = 0; i < 25; i++) {
      const n = W.panelOffsets(i).length, nx = W.roomW(i) > W.W ? 3 : 2, nz = W.roomD(i) > W.W ? 3 : 2; eq(n, nx * nz, 'panels of room ' + i);
      eq(n, i === 12 ? 9 : [2, 7, 10, 11, 13, 14, 17, 22].includes(i) ? 6 : 4, 'panel count by kind, room ' + i);
      for (const [x, z] of W.panelOffsets(i)) assert(Math.abs(x) + 1.7 < W.roomW(i) / 2 && Math.abs(z) + 0.9 < W.roomD(i) / 2, 'panel off the ceiling in room ' + i);
    }
  }],
  ['panelOffsets / panelDX are sane and the wall map / control panel clear the door keypads', () => {
    for (let i = 0; i < 25; i++) {
      assert(W.panelOffsets(i).length >= 4); const dx = W.panelDX(i); assert(dx > 0 && dx < W.roomW(i) / 2, 'panelDX in room ' + i);
      assert(dx + 1.7 < W.roomW(i) / 2 - W.T / 2, 'panel runs into the corner of room ' + i);
      // the north wall's door (if any) is centred at the room's x: its opening (hw, vault doors wider) plus a keypad strip must stay clear of both panels
      for (const id of W.ROOM_DOORS[String(i)] || []) { const d = W.DOORS[id]; if (d.axis === 'x' && (d.a === String(i) ? d.da : d.db) === 'NORTH') assert(dx - 1.7 > d.hw, 'north door ' + id + ' of room ' + i + ' collides with a wall panel'); }
      assert(dx - 1.7 > 2.2, 'panel clears a standard doorway in room ' + i); if (W.roomW(i) > W.W) assert(dx - 1.7 > 2.65, 'panel clears a vault doorway in room ' + i);
    }
  }],
  ['vault pillars: inside the vault, clear of the dais, the relic and the doorways', () => {
    eq(W.PILLARS.length, 4);
    for (const [x0, z0, x1, z1] of W.PILLARS) {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      assert(Math.abs(x1) < W.V / 2 - 1.5 && Math.abs(z1) < W.V / 2 - 1.5, 'pillar against the wall');
      assert(Math.hypot(cx, cz) > 3.35 + 2, 'pillar on the dais'); assert(Math.hypot(cx - W.RELIC.x, cz - W.RELIC.z) > 2, 'pillar on the relic');
      assert(Math.min(Math.abs(x0), Math.abs(x1)) > 4.9 / 2 + 1 && Math.min(Math.abs(z0), Math.abs(z1)) > 4.9 / 2 + 1, 'pillar in front of a vault door');
    }
  }],
  ['props stay inside their rooms (arena and attached), never in a doorway strip', () => {
    for (let i = 0; i < 25; i++) for (const p of W.solidsOf(String(i), '')) {
      eq(W.roomKeyOf(p.x, p.z), String(i), p.k + ' leaks out of room ' + i);
      const [cx, cz] = W.rc(i), lx = p.x - cx, lz = p.z - cz;
      assert(Math.abs(lx) < W.roomW(i) / 2 - W.T / 2 && Math.abs(lz) < W.roomD(i) / 2 - W.T / 2, p.k + ' centred in the wall of room ' + i);   // story barrels may lean on the wall (r reaches it)
      assert(!(Math.abs(lx) < 2.4 + p.r && W.roomD(i) / 2 - Math.abs(lz) < 1.5 + p.r) && !(Math.abs(lz) < 2.4 + p.r && W.roomW(i) / 2 - Math.abs(lx) < 1.5 + p.r), p.k + ' blocks a doorway of room ' + i);
    }
    for (const c of W.CHEST) for (const p of W.solidsOf('c' + c.id, propTypes(c.id))) {
      eq(W.roomKeyOf(p.x, p.z), 'c' + c.id, p.k + ' leaks out of attached room ' + c.id);
      assert(Math.abs(p.x - c.cx) < c.size / 2 - W.T / 2 && Math.abs(p.z - c.cz) < c.size / 2 - W.T / 2, p.k + ' in the wall of attached room ' + c.id);
    }
  }],
  ['spawn points: every home\'s random points (3 m off the walls) are clear of props, the doorway and the furniture', () => {
    for (let s = 0; s < 8; s++) {
      const key = W.homeOf(s), c = W.CHEST[+key.slice(1)];
      for (let k = 0; k < 2000; k++) {
        const [x, z] = W.randomPoint(key); eq(W.roomKeyOf(x, z), key);
        assert(!W.inProp(x, z, 0.5, { [c.id]: 'home' }, true), 'spawn point in a prop of ' + key + ' at ' + x + ',' + z);
        const sl = W.slide(x, z, x, z, 0.5, { [c.id]: 'home' }, true); assert(Math.abs(sl[0] - x) < 1e-9 && Math.abs(sl[1] - z) < 1e-9, 'a spawn point would be pushed out in ' + key);
      }
    }
  }],
]).then(f => process.exit(f ? 1 : 0));

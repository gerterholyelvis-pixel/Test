// Pure geometry checks on world.js (no server)
const W = require('../world.js'), { run, assert, eq } = require('./lib.js');
const bad = [];
run('world', [
  ['9 grid rooms: centres map back to their own room key', () => { for (let i = 0; i < 9; i++) { const [x, z] = W.rc(i); eq(W.roomKeyOf(x, z), String(i), 'room ' + i); eq(W.roomAt(x, z), i); } }],
  ['room sizes: corners 15x15, edges 22.5x15 / 15x22.5, vault 22.5x22.5 (1.25x the original 12 / 18 m)', () => {
    eq(W.SCALE, 1.25); eq([W.W, W.V, W.CS], [15, 22.5, 8]);
    for (const i of [0, 2, 6, 8]) eq([W.roomW(i), W.roomD(i)], [15, 15]);
    for (const i of [1, 7]) eq([W.roomW(i), W.roomD(i)], [22.5, 15]);
    for (const i of [3, 5]) eq([W.roomW(i), W.roomD(i)], [15, 22.5]);
    eq([W.roomW(4), W.roomD(4)], [22.5, 22.5]); eq(W.VAULT, 4);
    eq([W.HALF, W.LIM], [26.25, 34.25]); eq(W.rc(0), [-18.75, -18.75]);
  }],
  ['ceiling panels: 2x2 in a corner room, 3x2 in an edge room, 3x3 in the vault, all under the ceiling', () => {
    for (let i = 0; i < 9; i++) {
      const n = W.panelOffsets(i).length; eq(n, i === 4 ? 9 : i % 2 ? 6 : 4, 'panels of room ' + i);
      for (const [x, z] of W.panelOffsets(i)) assert(Math.abs(x) + 1.7 < W.roomW(i) / 2 && Math.abs(z) + 0.9 < W.roomD(i) / 2, 'panel off the ceiling in room ' + i);
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
  ['props stay inside their rooms, never in a doorway strip', () => {
    for (let i = 0; i < 9; i++) for (const p of W.solidsOf(String(i), '')) {
      eq(W.roomKeyOf(p.x, p.z), String(i), p.k + ' leaks out of room ' + i);
      const [cx, cz] = W.rc(i), lx = p.x - cx, lz = p.z - cz;
      assert(Math.abs(lx) < W.roomW(i) / 2 - W.T / 2 && Math.abs(lz) < W.roomD(i) / 2 - W.T / 2, p.k + ' centred in the wall of room ' + i);   // story barrels may lean on the wall (r reaches it)
      assert(!(Math.abs(lx) < 2.4 + p.r && W.roomD(i) / 2 - Math.abs(lz) < 1.5 + p.r) && !(Math.abs(lz) < 2.4 + p.r && W.roomW(i) / 2 - Math.abs(lx) < 1.5 + p.r), p.k + ' blocks a doorway of room ' + i);
    }
  }],
  ['12 chest rooms, centres round-trip to c0..c11, 8x8, behind outer walls', () => {
    eq(W.CHEST.length, 12);
    W.CHEST.forEach((c, i) => {
      eq(c.id, i); eq(W.roomKeyOf(c.cx, c.cz), 'c' + i, 'chest centre ' + i); assert(!W.inGrid(c.cx, c.cz), 'chest ' + i + ' inside the grid');
      const [rx, rz] = W.rc(c.parent); // the chest room touches the parent room's outer wall and does not overlap the grid
      assert(Math.abs(c.cx - c.wallX) + Math.abs(c.cz - c.wallZ) === W.CS / 2, 'chest ' + i + ' not adjacent to its wall');
      assert(Math.abs(c.wallX) === W.HALF || Math.abs(c.wallZ) === W.HALF, 'chest ' + i + ' wall is not an outer wall');
      assert(Math.abs(c.cx) <= W.LIM && Math.abs(c.cz) <= W.LIM);
      eq(W.chestKey(c.parent, c.side), 'c' + i);
    });
    // 4 edge rooms have one chest room, 4 corner rooms two
    for (let i = 0; i < 9; i++) { const n = W.CHEST.filter(c => c.parent === i).length; eq(n, i === 4 ? 0 : [0, 2, 6, 8].includes(i) ? 2 : 1, 'chest rooms of room ' + i); }
  }],
  ['randomPoint stays inside its own room (2000 samples per room)', () => { for (let i = 0; i < 9; i++) for (let k = 0; k < 2000; k++) { const [x, z] = W.randomPoint(i); if (W.roomKeyOf(x, z) !== String(i)) throw new Error('room ' + i + ' got ' + x + ',' + z); } }],
  ['doors connect adjacent rooms: stepping through the wall midpoint changes room by one step', () => {
    for (let i = 0; i < 9; i++) {
      const col = W.colOf(i), row = W.rowOf(i), [x, z] = W.rc(i);
      if (col < 2) { const wx = x + W.roomW(i) / 2; eq([W.roomKeyOf(wx - 1, z), W.roomKeyOf(wx + 1, z)], [String(i), String(i + 1)], 'E door of ' + i); }
      if (row < 2) { const wz = z + W.roomD(i) / 2; eq([W.roomKeyOf(x, wz - 1), W.roomKeyOf(x, wz + 1)], [String(i), String(i + 3)], 'S door of ' + i); }
      for (const [side, dx, dz] of [['N', 0, -1], ['W', -1, 0], ['E', 1, 0], ['S', 0, 1]]) {
        const outer = (side === 'N' && row === 0) || (side === 'S' && row === 2) || (side === 'W' && col === 0) || (side === 'E' && col === 2);
        if (!outer) continue;
        const wx = x + dx * W.roomW(i) / 2, wz = z + dz * W.roomD(i) / 2;
        eq([W.roomKeyOf(wx - dx, wz - dz), W.roomKeyOf(wx + dx, wz + dz)], [String(i), W.chestKey(i, side)], 'outer door ' + side + ' of ' + i);
      }
    }
  }],
  ['panelOffsets / panelDX are sane', () => { for (let i = 0; i < 9; i++) { assert(W.panelOffsets(i).length >= 4); assert(W.panelDX(i) > 0 && W.panelDX(i) < W.roomW(i) / 2); } }],
]).then(f => process.exit(f ? 1 : 0));

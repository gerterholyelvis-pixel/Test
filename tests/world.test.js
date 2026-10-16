// Pure geometry checks on world.js (no server)
const W = require('../world.js'), { run, assert, eq } = require('./lib.js');
const bad = [];
run('world', [
  ['9 grid rooms: centres map back to their own room key', () => { for (let i = 0; i < 9; i++) { const [x, z] = W.rc(i); eq(W.roomKeyOf(x, z), String(i), 'room ' + i); eq(W.roomAt(x, z), i); } }],
  ['room sizes: corners 12x12, edges 18x12 / 12x18, vault 18x18', () => {
    for (const i of [0, 2, 6, 8]) eq([W.roomW(i), W.roomD(i)], [12, 12]);
    for (const i of [1, 7]) eq([W.roomW(i), W.roomD(i)], [18, 12]);
    for (const i of [3, 5]) eq([W.roomW(i), W.roomD(i)], [12, 18]);
    eq([W.roomW(4), W.roomD(4)], [18, 18]); eq(W.VAULT, 4);
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

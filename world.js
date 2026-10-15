// Shared world geometry: ONE source of truth for the client (window.GKWORLD) and the server (require('./world.js')).
// 3x3 grid with a non-uniform layout: column widths [W, V, W] and row depths [W, V, W], so the middle room (room 4) is THE VAULT (V x V),
// the rooms above/below it are V wide x W deep, the rooms left/right of it are W wide x V deep, the corner rooms are W x W.
// Rooms are numbered 0..8 (index = col + 3 * row). 12 chest/mystery/merchant rooms (CS x CS) sit centred behind the 12 outer walls.
(function (root) {
  const W = 12;            // normal room size (m)
  const V = 18;            // THE VAULT size (m), change this one number to resize the middle room
  const H = 6.5;           // ceiling height
  const T = 0.6;           // wall thickness
  const CS = 8;            // chest room size
  const COLW = [W, V, W], ROWD = [W, V, W];
  const HALF = V / 2 + W;                       // half extent of the room grid (21)
  const LIM = HALF + CS;                        // half extent including the chest rooms (29)
  const COLX = [-(V / 2 + W / 2), 0, V / 2 + W / 2], ROWZ = COLX;   // column / row centres
  const colOf = i => i % 3, rowOf = i => Math.floor(i / 3);
  const roomW = i => COLW[colOf(i)], roomD = i => ROWD[rowOf(i)];
  const rc = i => [COLX[colOf(i)], ROWZ[rowOf(i)]];
  const VAULT = 4;
  // grid index 0..2 of a coordinate: the boundaries sit at +-V/2
  const gi = v => v < -V / 2 ? 0 : v > V / 2 ? 2 : 1;
  const roomAt = (x, z) => gi(x) + 3 * gi(z);
  const inGrid = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;
  // chest rooms, in creation order (ids 0..11, the same order as the door ids' outer doors): N, W, E, S sides of every outer room
  const CHEST = [];
  for (let i = 0; i < 9; i++) {
    if (i === VAULT) continue;
    const col = colOf(i), row = rowOf(i), [x0, z0] = rc(i), sides = [];
    if (row === 0) sides.push(['N', 0, -1]); if (col === 0) sides.push(['W', -1, 0]); if (col === 2) sides.push(['E', 1, 0]); if (row === 2) sides.push(['S', 0, 1]);
    for (const [side, dx, dz] of sides) {
      const hw = dx ? roomW(i) / 2 : 0, hd = dz ? roomD(i) / 2 : 0;   // distance from the room centre to its outer wall in that direction
      const off = dx ? hw : hd;
      CHEST.push({ id: CHEST.length, parent: i, side, dx, dz, cx: x0 + dx * (off + CS / 2), cz: z0 + dz * (off + CS / 2), wallX: x0 + dx * off, wallZ: z0 + dz * off });
    }
  }
  const chestKey = (i, side) => 'c' + CHEST.findIndex(c => c.parent === i && c.side === side);
  // position -> room key ('0'..'8' grid rooms, 'c0'..'c11' chest rooms)
  const roomKeyOf = (x, z) => {
    if (Math.abs(z) > HALF) return chestKey(gi(x) + (z < 0 ? 0 : 6), z < 0 ? 'N' : 'S');
    if (Math.abs(x) > HALF) return chestKey(gi(z) * 3 + (x < 0 ? 0 : 2), x < 0 ? 'W' : 'E');
    return String(roomAt(x, z));
  };
  // ceiling light panel centres of a room (offsets from the room centre): a grid of ~5.6 m spacing, scales with the room size
  const PANEL_STEP = 5.6;
  const panelOffsets = i => {
    const nx = Math.round(roomW(i) / 6), nz = Math.round(roomD(i) / 6), out = [];
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) out.push([(a - (nx - 1) / 2) * PANEL_STEP, (b - (nz - 1) / 2) * PANEL_STEP]);
    return out;
  };
  // a random spawn point inside room i (its own width/depth), keeping a 3 m margin to the walls
  const randomPoint = (i, rnd = Math.random) => { const [cx, cz] = rc(i); return [cx + (rnd() - 0.5) * (roomW(i) - 6), cz + (rnd() - 0.5) * (roomD(i) - 6)]; };
  const api = { W, V, H, T, CS, COLW, ROWD, COLX, ROWZ, HALF, LIM, VAULT, colOf, rowOf, roomW, roomD, rc, gi, roomAt, inGrid, CHEST, chestKey, roomKeyOf, panelOffsets, randomPoint };
  root.GKWORLD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

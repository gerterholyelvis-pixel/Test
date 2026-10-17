// Shared world geometry: ONE source of truth for the client (window.GKWORLD) and the server (require('./world.js')).
// world.js v2 (docs/PLAN-5x5.md section 6): a 5x5 grid with column widths COLW = [W, W, V, W, W] and row depths ROWD = COLW, so the middle room (room 12) is THE VAULT (V x V),
// the rooms of the vault row / column are V x W (or W x V), every other room is W x W. Arena rooms are numbered 0..24 (index = col + 5 * row).
// 20 attached rooms ('c0'..'c19') sit behind the 20 outward wall segments (5 per side; a corner cell has two, one on each outward side). Side s (N 0, E 1, S 2, W 3) holds ids 5s..5s+4 = positions 1..5,
// numbered clockwise along the side (N west to east, E north to south, S east to west, W south to north). Positions 2 and 4 are 10x10 HOMES (8), positions 1, 3, 5 are 8x8 loot rooms (12).
// Every door of the world is in WORLD.DOORS (one canonical id order, server and client both derive from it). WORLD.WALLS lists every wall segment.
(function (root) {
  const SCALE = 1.25;      // room scale vs the original 12 / 18 m layout (rooms grew 25% per side; doors, props and the loot rooms keep their size)
  const W = 12 * SCALE;    // normal room size (m): 15
  const V = 18 * SCALE;    // THE VAULT size (m): 22.5, keep V / W = 1.5
  const H = 6.5;           // ceiling height
  const T = 0.6;           // wall thickness
  const CS = 8;            // loot room size (merchant, mystery and chest art is authored for 8 m)
  const HS = 10;           // home room size
  const N = 5, NARENA = N * N, NSIDE = N, NATT = 4 * NSIDE;   // 20 attached rooms, 5 per side
  const COLW = [W, W, V, W, W], ROWD = COLW;
  const HALF = V / 2 + 2 * W;                   // half extent of the room grid (41.25)
  const LIM = HALF + HS;                        // half extent including the attached rooms (51.25)
  const COLX = [-(V / 2 + 1.5 * W), -(V / 2 + W / 2), 0, V / 2 + W / 2, V / 2 + 1.5 * W], ROWZ = COLX;   // column / row centres
  const EDGE = [-HALF, -(V / 2 + W), -V / 2, V / 2, V / 2 + W, HALF];   // column / row boundaries
  const colOf = i => i % N, rowOf = i => Math.floor(i / N);
  const roomW = i => COLW[colOf(i)], roomD = i => ROWD[rowOf(i)];
  const rc = i => [COLX[colOf(i)], ROWZ[rowOf(i)]];
  const VAULT = 12, VAULT_KEY = '12';
  const TREE_CELLS = [6, 8, 16, 18];            // the inner 3x3 corners (task B/C: tree rooms; F0 renders them as plain halls)
  const VB_CELLS = { N: 7, W: 11, E: 13, S: 17 };   // the 4 rooms with a vault door (task B/C: vaultbreakers; F0 renders them as plain halls)
  const VB_LIST = [7, 11, 13, 17];
  // grid index 0..4 of a coordinate (a lookup over the column edges)
  const gi = v => v < EDGE[1] ? 0 : v < EDGE[2] ? 1 : v <= EDGE[3] ? 2 : v <= EDGE[4] ? 3 : 4;
  const roomAt = (x, z) => gi(x) + N * gi(z);
  const inGrid = (x, z) => Math.abs(x) <= HALF && Math.abs(z) <= HALF;
  const kindOf = i => i === VAULT ? 'vault' : TREE_CELLS.includes(i) ? 'tree' : VB_LIST.includes(i) ? 'vb' : 'arena';
  // ---- attached rooms: 5 per side (positions 1..5 clockwise along the side), homes at positions 2 and 4, loot rooms at 1, 3, 5.
  // Rotating the map by 90 degrees maps side s position p onto side s+1 position p, so the 8 homes are equivalent (each is 1 cell from a corner; positions 2 and 4 mirror each other).
  const SIDES = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }, OPP = { N: 'S', S: 'N', E: 'W', W: 'E' }, DIRNAME = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };
  const SIDE_ORDER = ['N', 'E', 'S', 'W'];
  const SIDE_CELLS = { N: [0, 1, 2, 3, 4], E: [4, 9, 14, 19, 24], S: [24, 23, 22, 21, 20], W: [20, 15, 10, 5, 0] };   // the arena cells of each side in position 1..5 order
  const HOME_POS = [2, 4];
  const HOME_IDS = [], LOOT_IDS = [];
  const CHEST = [];   // attached rooms in id order: { id, parent, side, pos, dx, dz, cx, cz, wallX, wallZ, size, home }
  const ATT = Array.from({ length: NARENA }, () => []);   // arena index -> its attached room entries (a corner has 2, in N E S W order)
  for (const side of SIDE_ORDER) SIDE_CELLS[side].forEach((i, k) => {
    const id = CHEST.length, pos = k + 1, home = HOME_POS.includes(pos), size = home ? HS : CS, [dx, dz] = SIDES[side], [x0, z0] = rc(i), off = dx ? roomW(i) / 2 : roomD(i) / 2;
    const c = { id, parent: i, side, pos, dx, dz, cx: x0 + dx * (off + size / 2), cz: z0 + dz * (off + size / 2), wallX: x0 + dx * off, wallZ: z0 + dz * off, size, home };
    CHEST.push(c); (home ? HOME_IDS : LOOT_IDS).push(id);
  });
  for (const side of SIDE_ORDER) for (const c of CHEST) if (c.side === side) ATT[c.parent].push(c);
  const attIdx = id => typeof id === 'string' ? +id.replace(/^c/, '') : id;
  const attachedSide = id => { const c = CHEST[attIdx(id)]; return c ? c.side : null; };   // 'N' | 'E' | 'S' | 'W' (id 0..19 or key 'c0'..'c19')
  const attachedPos = id => { const c = CHEST[attIdx(id)]; return c ? c.pos : 0; };        // 1..5 along its side
  const attachedId = (side, pos) => SIDE_ORDER.indexOf(side) * NSIDE + pos - 1;            // inverse of the two above
  const attachedOf = i => ATT[+i] || [];                                                   // the attached rooms of arena cell i (0, 1 or 2)
  const attOn = (i, side) => { for (const a of ATT[i]) if (a.side === side) return a; return null; };
  const isHomeKey = k => typeof k === 'string' && k[0] === 'c' && !!CHEST[+k.slice(1)] && CHEST[+k.slice(1)].home;
  const chestKey = (i, side) => 'c' + CHEST.findIndex(c => c.parent === i && c.side === side);
  const homeOf = slot => 'c' + HOME_IDS[slot];   // spawn slot 0..7 -> home room key
  const attachedAt = (x, z, pad = 0) => { for (const c of CHEST) if (Math.abs(x - c.cx) <= c.size / 2 + pad && Math.abs(z - c.cz) <= c.size / 2 + pad) return c.id; return -1; };
  // position -> room key ('0'..'24' arena rooms, 'c0'..'c19' attached rooms, 'c-1' for the void outside the grid that belongs to no attached room).
  // Outside the grid the key follows the wall region (the strip beyond a perimeter cell's wall belongs to that cell's attached room on that side); the diagonal squares beyond a corner are void.
  const roomKeyOf = (x, z) => {
    const ox = Math.abs(x) > HALF, oz = Math.abs(z) > HALF;
    if (ox && oz) return 'c-1';
    if (oz) { const a = attOn(gi(x) + (z < 0 ? 0 : N * (N - 1)), z < 0 ? 'N' : 'S'); return a ? 'c' + a.id : 'c-1'; }
    if (ox) { const a = attOn(gi(z) * N + (x < 0 ? 0 : N - 1), x < 0 ? 'W' : 'E'); return a ? 'c' + a.id : 'c-1'; }
    return String(roomAt(x, z));
  };
  // ---- ROOMS: 25 arena rooms + 20 attached rooms
  const ROOMS = [], ROOM = {};
  for (let i = 0; i < NARENA; i++) { const [cx, cz] = rc(i); ROOMS.push({ key: String(i), i, kind: kindOf(i), cx, cz, hw: roomW(i) / 2, hd: roomD(i) / 2 }); }
  for (const c of CHEST) ROOMS.push({ key: 'c' + c.id, id: c.id, kind: c.home ? 'home' : 'loot', cx: c.cx, cz: c.cz, hw: c.size / 2, hd: c.size / 2 });
  for (const r of ROOMS) ROOM[r.key] = r;
  const roomRect = k => ROOM[typeof k === 'number' ? String(k) : k] || null;
  // ---- DOORS (canonical order: for i = 0..24 its E door, its S door, then its attached door(s) in N E S W order; 40 arena + 20 attached = 60) and WALLS
  const DOORS = [], WALLS = [], ROOM_DOORS = {};
  const addDoor = (a, b, da, db, kind, axis, c, x, z, rot, len) => {
    const id = DOORS.length, d = { id, a, b, da, db, kind, axis, c, hw: (kind === 'vault' ? 4.9 : 4) / 2 + 0.2, wall: { x, z, rot, len } };
    DOORS.push(d); WALLS.push({ x, z, rot, len, door: id, kind }); (ROOM_DOORS[a] = ROOM_DOORS[a] || []).push(id); (ROOM_DOORS[b] = ROOM_DOORS[b] || []).push(id);
  };
  for (let i = 0; i < NARENA; i++) {
    const col = colOf(i), row = rowOf(i), [cx, cz] = rc(i), rw = roomW(i), rd = roomD(i), s = String(i);
    if (col < N - 1) addDoor(s, String(i + 1), 'EAST', 'WEST', i === VAULT || i + 1 === VAULT ? 'vault' : 'arena', 'z', cz, cx + rw / 2, cz, Math.PI / 2, rd);
    if (row < N - 1) addDoor(s, String(i + N), 'SOUTH', 'NORTH', i === VAULT || i + N === VAULT ? 'vault' : 'arena', 'x', cx, cx, cz + rd / 2, 0, rw);
    for (const a of ATT[i]) { const ns = a.dz !== 0; addDoor(s, 'c' + a.id, DIRNAME[a.side], DIRNAME[OPP[a.side]], a.home ? 'hatch' : 'loot', ns ? 'x' : 'z', ns ? cx : cz, a.wallX, a.wallZ, ns ? 0 : Math.PI / 2, ns ? rw : rd); }   // a corner: N / S door first
  }
  // bare outer walls (an outward side of a corner cell without an attached room: none since every outward segment has one), then each attached room's own 3 walls (back + 2 sides; their meshes are the room shell)
  for (const i of [0, N - 1, NARENA - 1, NARENA - N]) {
    const col = colOf(i), row = rowOf(i), [cx, cz] = rc(i);
    for (const side of [row === 0 ? 'N' : 'S', col === 0 ? 'W' : 'E']) {
      if (attOn(i, side)) continue; const [dx, dz] = SIDES[side];
      WALLS.push(dz ? { x: cx, z: cz + dz * roomD(i) / 2, rot: 0, len: roomW(i), door: null } : { x: cx + dx * roomW(i) / 2, z: cz, rot: Math.PI / 2, len: roomD(i), door: null });
    }
  }
  for (const c of CHEST) {
    const s = c.size, ns = c.dz !== 0;
    WALLS.push({ x: c.cx + c.dx * s / 2, z: c.cz + c.dz * s / 2, rot: ns ? 0 : Math.PI / 2, len: s + T, door: null, att: c.id });   // back wall
    for (const q of [-1, 1]) WALLS.push(ns ? { x: c.cx + q * s / 2, z: c.cz + c.dz * T / 4, rot: Math.PI / 2, len: s + T / 2, door: null, att: c.id } : { x: c.cx + c.dx * T / 4, z: c.cz + q * s / 2, rot: 0, len: s + T / 2, door: null, att: c.id });
  }
  const DIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  for (const k in ROOM_DOORS) ROOM_DOORS[k].sort((p, q) => DIRS.indexOf(DOORS[p].a === k ? DOORS[p].da : DOORS[p].db) - DIRS.indexOf(DOORS[q].a === k ? DOORS[q].da : DOORS[q].db));
  const HATCHES = DOORS.filter(d => d.kind === 'hatch').map(d => d.id);
  const alwaysOpen = id => !!DOORS[id] && DOORS[id].kind === 'hatch';   // the home doorway is an open archway: every rule treats it as open
  // ceiling light panel centres of a room (offsets from the room centre): 2 per W side, 3 per V side; the spacing grows with SCALE
  const PANEL_STEP = 5.6 * SCALE;
  const panelOffsets = i => {
    const nx = Math.round(roomW(i) / (6 * SCALE)), nz = Math.round(roomD(i) / (6 * SCALE)), out = [];
    for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) out.push([(a - (nx - 1) / 2) * PANEL_STEP, (b - (nz - 1) / 2) * PANEL_STEP]);
    return out;
  };
  // x offset of the wall map (-dx) and the door control panel (+dx) on an arena room's north wall: 5.3 m, 7.9 m in the vault-wide rooms (they clear the door keypads and the vault door's panels)
  const panelDX = i => roomW(i) > W ? 7.9 : 5.3;
  // a random spawn point inside a room (arena index or any room key), keeping a 3 m margin to the walls
  const randomPoint = (k, rnd = Math.random) => { const r = roomRect(k) || ROOMS[0]; return [r.cx + (rnd() - 0.5) * (2 * r.hw - 6), r.cz + (rnd() - 0.5) * (2 * r.hd - 6)]; };
  // attached room local frame (+z toward its doorway, origin = room centre) -> world
  const attLocal = (c, lx, lz) => { const ry = Math.atan2(-c.dx, -c.dz), cs = Math.cos(ry), sn = Math.sin(ry); return [c.cx + lx * cs + lz * sn, c.cz - lx * sn + lz * cs]; };
  // HOME_LAYOUT: where the home furniture stands in the home's local frame (game.js builds the station hit-kits there; rooms5art-home.js draws its bench and recycler at the same spots). [x, z, rotY]
  // The art authored its home walls at +-4.98 m; the real wall faces are at HS / 2 - T / 2 = 4.7, so the art group is scaled by HOME_K in x and z (game.js) and every art number below is multiplied by it here.
  const HOME_K = (HS - T) / (HS - 0.04);
  const HOME_LAYOUT = { bench: [-2.6 * HOME_K, -4.3 * HOME_K, 0], recycler: [0.95 * HOME_K, -4.0 * HOME_K, 0], crate: [-3.85 * HOME_K, 3.0 * HOME_K],
    pump: [4.25 * HOME_K, -1.9 * HOME_K], screen: [4.8 * HOME_K, 0.6 * HOME_K], box: [4.2 * HOME_K, 3.5 * HOME_K], sentry: [-0.7 * HOME_K, -4.75 * HOME_K] };   // ELIXIR: pump, Elixir Screen, lockbox and sentry mount = the art props of rooms5art-home.js (PX/PZ, SX/SZ, LBX/LBZ, SENX/SENZ) times HOME_K; tests/rooms5art-wiring.test.js keeps them in step
  // ROOMS5ART: the footprints of rooms5art-home.js (rects: kind, x, z, hx, hz in the home's local frame, +z toward the doorway) turned into inscribed circles by rectCircles.
  // tests/rooms5art-wiring.test.js keeps these tables in step with the art modules.
  const HOME_SOLIDS = [['bench', -2.6, -4.3, 1.3, 0.6], ['recycler', 0.95, -4.0, 0.85, 0.75], ['hprop', 4.25, -1.9, 0.55, 0.7], ['hprop', 4.8, 0.6, 0.3, 0.65], ['hprop', 4.2, 3.5, 0.45, 0.55],
    ['hprop', -4.65, -1.2, 0.3, 1.65], ['hcrate', -3.85, 3.0, 0.55, 1.05], ['hprop', 3.65, 4.3, 0.7, 0.4], ['hprop', -4.25, -4.25, 0.55, 0.55]];
  const rectCircles = (k, x, z, hx, hz) => {   // the circles that fit inside a footprint rect, spaced along its long axis so they overlap
    const s = Math.min(hx, hz), L = Math.max(hx, hz), n = L - s < 1e-6 ? 1 : Math.ceil((L - s) / (s * 0.9)) + 1, out = [];
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : -(L - s) + 2 * (L - s) * i / (n - 1); out.push(hx >= hz ? { k, x: x + t, z, r: s } : { k, x, z: z + t, r: s }); }
    return out;
  };
  // ROOMS5ART tree rooms: server tree type -> circles [x, z, r] in the cell-local frame (north = -z), the trunk first. The Well's trunk is wider (the old stump the sapling grows from; r 1.7 still lets a goblin reach the sapling anchor, r 1.1 + REACH_PAD 1.4).
  // 'oak' is the Hollow Oak (art type 'hollow'); its last 6 circles are the arch walls of the walk-in nook. The corner posts of the art stand at +-4.2.
  const P4 = 4.2, POSTS = [[P4, -P4], [-P4, -P4], [P4, P4], [-P4, P4]].map(([x, z]) => [x, z, 0.7]);
  const TREE_SOLIDS = {
    well: [[0, 0, 1.7], [P4, -P4, 0.75]], press: [[0, 0, 1.1], [P4, -P4, 0.7], [-P4, -P4, 0.7], [-P4, P4, 0.7]], spring: [[0, 0, 1.1], [P4, -P4, 0.7], [P4, P4, 0.7], [-P4, P4, 0.7]],
    seer: [[0, 0, 1.1], [P4, -P4, 0.6], [-P4, -P4, 0.6], [P4, P4, 0.6]], graft: [[0, 0, 1.1], [P4, -P4, 0.75]],
    thorn: [[0, 0, 1.1], ...POSTS], gambler: [[0, 0, 1.1], ...POSTS], memory: [[0, 0, 1.1], ...POSTS], elder: [[0, 0, 1.1], ...POSTS],
    oak: [[0, 0, 1.1], ...POSTS, ...[1.2, 1.9, 2.6].flatMap(z => [[-1.15, z, 0.4], [1.15, z, 0.4]])],
  };
  const TREE_ALIAS = { hollow: 'oak', hollow_oak: 'oak', hollowoak: 'oak' };
  const treeKind = t => { const k = String(t && t.type ? t.type : t || '').toLowerCase().replace(/[^a-z_]/g, ''); return TREE_SOLIDS[k] ? k : TREE_ALIAS[k] || ''; };
  // the tree type of a tree cell from anything that carries `.trees` (the match, or the layout array): an array in TREE_CELLS order or a { cell: type } map; '' when unknown
  const treeTypeOf = (src, key) => { const t = src && src.trees; if (!t) return ''; return treeKind(Array.isArray(t) ? t[TREE_CELLS.indexOf(+key)] : t[key]); };
  // ROOMS5ART vaultbreaker rooms (rooms5art-vault.js, 22.5 x 15 local frame, the vault door in the local north wall z = -7.5): the B / L / R / FL / FR station footprints, the same for all 4 skins; [x, z, r]
  // The art room is 22.5 x 15 with its walls at the cell boundary; the real interior is T smaller, so game.js scales the art group by VB_SCALE (local x, z) and the circles are scaled the same way.
  const VB_SCALE = [(V - T) / V, (W - T) / W];
  const VB_SOLIDS = [[3.9, 7, 0.58], [4.7, 7, 0.58], [5.5, 7, 0.58], [-10.65, 3.9, 0.72], [10.65, -3.9, 0.72], [-3, -5.5, 0.6], [3, -5.5, 0.6],
    [-6.4, -4.8, 0.65], [6.4, -4.8, 0.65], [-6.4, 3.8, 0.65], [6.8, 3.4, 0.65]];   // VBX: the four extra stations S1..S4 (vbx5.js, rooms5art-vault.js EXTRAS), the same footprint for every skin
  // the four vault coffers (two circles each, turned toward the dais), vault-centred; the art dressing is built with half = V / 2 - T / 2 (the real wall faces)
  const COFFERS = [[-8.162, -7.738], [-7.738, -8.162], [7.738, -8.162], [8.162, -7.738], [8.162, 7.738], [7.738, 8.162], [-7.738, 8.162], [-8.162, 7.738]];
  // ACT ANCHORS (shared by act5.js on the server and the activity prompts in game.js): the interaction points of the tree rooms, vaultbreakers and the vault as { id: [x, z, r] } in the room-local frame
  // (x east, z south, from the room centre; rooms5art-trees-a/b.js, rooms5art-vault.js). The B / L / R stations stand beside their doors (rooms5art-vault.js LAYOUT: +4.7 / +3.9 / -3.9 along the wall, the same as VB_SOLIDS). A vaultbreaker is turned so its local -z (the vault door) faces the vault. The server accepts an act within r + 1.4 m.
  const ACT_LOCAL = {
    tree: { C: [0, 0, 1.1], NE: [P4, -P4, 0.7], NW: [-P4, -P4, 0.7], SE: [P4, P4, 0.7], SW: [-P4, P4, 0.7], ring: [0, 0, 3.0], nook: [0, 1.95, 0.9] },
    vb: { B: [4.7, 7.0, 1.2], L: [-10.65, 3.9, 0.8], R: [10.65, -3.9, 0.8], FL: [-3, -5.5, 0.6], FR: [3, -5.5, 0.6], F: [0, -5.0, 1.0],
      S1: [-6.4, -4.8, 0.8], S2: [6.4, -4.8, 0.8], S3: [-6.4, 3.8, 0.8], S4: [6.8, 3.4, 0.8], G1: [6.4, -6.5, 0.4], G2: [8.1, -4.8, 0.4], G3: [6.4, -3.1, 0.4], G4: [4.7, -4.8, 0.4] },   // VBX: the extra stations; G1..G4 are the Keystone's ritual plates around S2 (floor, not solid)
    vault: { dais: [0, 0, 2.2], K1: [-8.25, -8.25, 0.9], K2: [8.25, -8.25, 0.9], K3: [8.25, 8.25, 0.9], K4: [-8.25, 8.25, 0.9], D_N: [5.7, -10.85, 0.8], D_E: [10.85, 5.7, 0.8], D_S: [-5.7, 10.85, 0.8], D_W: [-10.85, -5.7, 0.8], grate: [0, 7.25, 1.4] },
  };
  const vbRot = cell => { const [cx, cz] = rc(+cell), [vx, vz] = rc(VAULT); return Math.atan2(-Math.sign(vx - cx), -Math.sign(vz - cz)); };
  const actToWorld = (key, lx, lz) => { const r = roomRect(key), ry = Object.values(VB_CELLS).includes(+key) ? vbRot(key) : 0, c = Math.cos(ry), s = Math.sin(ry); return [r.cx + lx * c + lz * s, r.cz - lx * s + lz * c]; };
  const actKind = k => k === VAULT_KEY ? 'vault' : !/^\d+$/.test(k) ? null : TREE_CELLS.includes(+k) ? 'tree' : Object.values(VB_CELLS).includes(+k) ? 'vb' : null;
  const actAnchors = key => { const kd = actKind(String(key)), tbl = kd && ACT_LOCAL[kd], out = {}; if (!tbl) return out; for (const id of Object.keys(tbl)) { const [lx, lz, r] = tbl[id], [x, z] = actToWorld(String(key), lx, lz); out[id] = { x: +x.toFixed(3), z: +z.toFixed(3), r }; } return out; };
  const LOOT_LAYOUT = { forge: [0, -(CS / 2 - T / 2) + 0.75, 0], grand: [0, -(CS / 2 - T / 2) + 0.85, 0] };   // Master Forge bench / Grand Recycler (placeholders until task C/E)
  // ===== SOLID PROPS: crates, barrels, urns and the relic pedestal are obstacles for walking (client prediction AND server validation), bolts and melee line of sight.
  // Every footprint is a circle {k, x, z, r} in world metres (r is the prop's own radius; a walker adds his radius). The layout depends only on the room key, so client and server agree;
  // attached-room props depend on the room type (types[id] is a string, or an object with .type such as game.js CHEST_ROOMS). Vault pillars are rects (the client already blocks them as wall rects).
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mul = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };   // same generator as game.js ROOMART
  const halfX = i => roomW(i) / 2 - T / 2, halfZ = i => roomD(i) / 2 - T / 2;   // interior half extents of arena room i
  const RELIC = { x: rc(VAULT)[0] + 2.4, z: rc(VAULT)[1] };                    // the vault pedestal (server RELIC_POS, game.js LOOT)
  // The "story corner" of a plain hall (game.js ROOMART step 5b): theme 0 camp, 1 hoard, 2 gaol; theme and corner come from the first five draws of the room's own stream.
  // Tree rooms and vaultbreaker rooms have no story corner (their middle / station wall stays clear).
  const storyOf = i => {
    if (kindOf(i) !== 'arena') return null;
    const r2 = mul(hashStr('roomart2:' + i)), hx = halfX(i), hz = halfZ(i), theme = (r2() * 3) | 0, sx = r2() < 0.5 ? -1 : 1, sz = r2() < 0.5 ? -1 : 1;
    return { theme, sx, sz, x: sx * (hx - 1.7 - r2() * 0.3), z: sz * (hz - 1.7 - r2() * 0.3) };   // room-local, same draw order as spot() in game.js
  };
  // keep-clear zones of an arena room (room-local x, z; r = prop radius): the four door strips with their keypads, and the north wall's map / control panel
  const clearOK = (i, x, z, r) => {
    const hx = halfX(i), hz = halfZ(i);
    if (Math.abs(x) < 3.4 + r && hz - Math.abs(z) < 3.2 + r) return false;          // N / S door strip
    if (Math.abs(z) < 3.4 + r && hx - Math.abs(x) < 3.2 + r) return false;          // E / W door strip
    if (z < 0 && hz + z < 3.4 + r && Math.abs(Math.abs(x) - panelDX(i)) < 1.7 + r) return false;   // north wall panels
    return true;
  };
  const cache = new Map();
  // one big crate in a corner (sz = +1: a south corner, as in v1; -1: a north corner), sometimes a small one beside it along that wall (the footprints stay circles)
  const cornerStack = (key, i, sx, out, tag, sz = 1, swap = false) => {
    const rng = mul(hashStr('solid:' + key + tag)), hx = swap ? halfZ(i) : halfX(i), hz = swap ? halfX(i) : halfZ(i), s1 = 0.8 + rng() * 0.2, s2 = 0.5 + rng() * 0.12;
    const x1 = sx * (hx - 0.4 - s1 / 2 - rng() * 0.15), z1 = hz - 0.4 - s1 / 2 - rng() * 0.15, y1 = rng() * 0.6 - 0.3;
    const x2 = x1 - sx * (s1 / 2 + s2 / 2 + 0.14 + rng() * 0.1), z2 = hz - 0.35 - s2 / 2 - rng() * 0.1, y2 = rng() * 0.8 - 0.4, two = rng() < 0.5;
    const P = (x, z) => swap ? [z * sz, x] : [x, z * sz];   // swap: the stack runs along an east / west wall (sz then picks the wall side)
    { const [a, b] = P(x1, z1); out.push({ k: 'crate', x: a, z: b, r: s1 * 0.6, s: s1, yaw: y1, art: true }); }
    if (two) { const [a, b] = P(x2, z2); out.push({ k: 'crate', x: a, z: b, r: s2 * 0.6, s: s2, yaw: y2, art: true }); }
  };
  const solidsOf = (key, type) => {
    const ck = key + '|' + (key[0] === 'c' || kindOf(+key) === 'tree' ? type : ''); let out = cache.get(ck); if (out) return out; out = [];
    if (key[0] !== 'c') {
      const i = +key, [cx, cz] = rc(i), loc = [], kd = kindOf(i);
      if (kd === 'vault') {
        loc.push({ k: 'ped', x: RELIC.x - cx, z: RELIC.z - cz, r: 0.68 });
        for (const sx of [-1, 1]) cornerStack(key, i, sx, loc, 'v' + sx);
        for (const [x, z] of COFFERS) loc.push({ k: 'coffer', x, z, r: 0.5, art: true });
      } else if (kd === 'vb') {   // crates in the 2 corners away from the vault door (the station wall opposite the vault door stays clear for task B/C)
        const [vx, vz] = rc(VAULT), ux = Math.sign(vx - cx), uz = Math.sign(vz - cz);
        for (const q of [-1, 1]) cornerStack(key, i, q, loc, 'b' + q, uz ? -uz : -ux, !uz);
        for (const p of loc) p.art = false;   // these corners can meet the north wall's map / control panel: keep-clear zones apply (game.js still draws every listed crate)
        const ry = Math.atan2(-Math.sign(vx - cx), -Math.sign(vz - cz)), c = Math.cos(ry), s = Math.sin(ry);   // ROOMS5ART: the art's local north (the vault door wall) turned to face the vault
        VB_SOLIDS.forEach(([x, z, r], j) => loc.push({ k: j < 7 ? 'vbprop' : 'vbx', x: (x * VB_SCALE[0]) * c + (z * VB_SCALE[1]) * s, z: -(x * VB_SCALE[0]) * s + (z * VB_SCALE[1]) * c, r, art: true }));
      } else if (kd === 'tree') {   // no story corner; the trunk and the type's props (TREE_SOLIDS) once the type is known, else only a trunk
        cornerStack(key, i, hashStr('solid:' + key) & 1 ? 1 : -1, loc, '');
        for (const [x, z, r] of TREE_SOLIDS[type] || [[0, 0, 1.1]]) loc.push({ k: x === 0 && z === 0 ? 'trunk' : 'tprop', x, z, r, art: true });
      } else {
        const st = storyOf(i);
        cornerStack(key, i, st && st.sz > 0 ? -st.sx : (hashStr('solid:' + key) & 1 ? 1 : -1), loc, '');
        if (st && st.theme === 0) { for (const [dx, dz, r] of [[1.15, -0.95, 0.4], [1.15, -1.55, 0.35]]) loc.push({ k: 'scrate', x: st.x + st.sx * dx, z: st.z + st.sz * dz, r }); }
        if (st && st.theme === 1) {
          for (const [dx, dz] of [[1.0, 1.35], [1.55, 0.85]]) loc.push({ k: 'sbarrel', x: st.x + st.sx * dx, z: st.z + st.sz * dz, r: 0.38 });
          for (const q of [-1, 1]) loc.push({ k: 'tbarrel', x: st.x - st.sx * q * 0.16, z: st.z - st.sz * q * 0.16, r: 0.36 });   // the tipped barrel lies along the diagonal toward the room centre
        }
      }
      for (const p of loc) if (p.art || p.k === 'ped' || clearOK(i, p.x, p.z, p.r)) out.push({ ...p, x: p.x + cx, z: p.z + cz });
    } else {
      const c = CHEST[+key.slice(1)];
      if (c && type === 'mystery' && !c.home) {   // the back-corner clutter of the "?" room, authored in the room's own frame (+z toward the door, game.js buildMystery)
        for (const [k, lx, lz, r] of [['mcrate', -2.8, -2.85, 0.62], ['mcrate', -1.95, -3.2, 0.3], ['urn', 2.9, -2.9, 0.5], ['urn', 2.0, -3.15, 0.36], ['urn', 3.2, -1.7, 0.34]]) { const [x, z] = attLocal(c, lx, lz); out.push({ k, x, z, r }); }
      } else if (c && c.home) {   // the home furniture (rooms5art-home.js footprints): workbench, recycler, pump, screen, lockbox, shelves, crates
        for (const [k, x0, z0, hx, hz] of HOME_SOLIDS) for (const q of rectCircles(k, x0 * HOME_K, z0 * HOME_K, hx * HOME_K, hz * HOME_K)) { const [x, z] = attLocal(c, q.x, q.z); out.push(HOME_TOP[x0] != null ? { k, x, z, r: q.r, top: HOME_TOP[x0] } : { k, x, z, r: q.r }); }   // CLIMB: home tops
      } else if (c && (type === 'forge' || type === 'grand')) {   // the station footprint
        const S = LOOT_LAYOUT[type];
        if (type === 'forge') for (const ox of [-0.58, 0.58]) { const [x, z] = attLocal(c, S[0] + ox, S[1]); out.push({ k: 'bench', x, z, r: 0.62 }); }
        else { const [x, z] = attLocal(c, S[0], S[1]); out.push({ k: 'recycler', x, z, r: 0.82 }); }
      }
    }
    climbTag(out);   // CLIMB: every circle gets its top height h and whether it can be stood on
    cache.set(ck, out); return out;
  };
  const typeOf = (types, id) => { const t = types && types[id]; return t && t.type ? t.type : t; };
  const propsAt = (x, z, types) => {   // the circles of the room that contains (x, z)
    if (!(Math.abs(x) <= LIM && Math.abs(z) <= LIM)) return [];
    const key = roomKeyOf(x, z); if (key === 'c-1') return [];
    return solidsOf(key, key[0] === 'c' ? typeOf(types, +key.slice(1)) : treeTypeOf(types, key));   // tree cells: types.trees (set on the layout by the server) names the type
  };
  const PILLAR_D = V * 0.3;   // the four vault pillars stand at (+-PILLAR_D, +-PILLAR_D) from the vault centre (game.js VAULT block and blob shadows use it too)
  const PILLARS = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) PILLARS.push([sx * PILLAR_D - 0.6, sz * PILLAR_D - 0.6, sx * PILLAR_D + 0.6, sz * PILLAR_D + 0.6]);   // vault pillars (game.js rects); the vault centre is the origin
  const rectsAt = (x, z) => Math.abs(x) < V / 2 && Math.abs(z) < V / 2 ? PILLARS : [];
  // CLIMB-BEGIN (docs/reports/climb.md): real vertical movement. Every prop circle carries h (its top height, m) and climb (a goblin can stand on it).
  // A climbable prop is a wall only while the feet are more than STEP below its top; above that he walks over it, and groundY() is its top while his centre is within r + SUP.
  // ONE vertical model (vstep) for client prediction and server bots; the server validates reported heights with the same constants (server.js CLIMB block).
  const CLIMB = (() => { const APEX = 1.2, AIR = 0.6, G = 8 * APEX / (AIR * AIR), V0 = 4 * APEX / AIR, MAXTOP = 1.25;   // a normal jump peaks at 1.2 m after 0.3 s
    return { APEX, AIR, G, V0, STEP: 0.35, SUP: 0.15, COYOTE: 0.1, BUF: 0.12, MAXTOP, MAXY: MAXTOP + APEX + 0.1, PUSHV: 5, EDGEV: 2.5, AIRMAX: 3 }; })();
  const COVER = 0.12;   // a line of sight must pass this far above a climbable top
  // top heights from the art (game.js crate / barrels / mystery clutter, rooms5art-*): only flat, low, sturdy tops are climbable
  const TOPH = { crate: p => 1.012 * p.s, scrate: p => p.r > 0.37 ? 0.63 : 0.56, sbarrel: () => 0.95, tbarrel: () => 0.66, mcrate: p => p.r < 0.4 ? 0.5 : 1.57, urn: p => p.r > 0.4 ? 1.16 : 0.8, ped: () => 1.11, coffer: () => 0.8 };
  const CLIMBK = { crate: 1, scrate: 1, sbarrel: 1, tbarrel: 1 };   // + the small mystery crate and the home tops (p.top); urns (narrow lids), the relic pedestal, coffers, stations, trees and pillars stay walls
  const HOME_TOP = { '3.65': 0.82, '-4.25': 1.2, '-3.85': 0.3 };   // rooms5art-home.js: the two barrels, the stacked crates, the bedroll pallet (a step)
  const TERRAIN = [{ k: 'dais', x: rc(VAULT)[0], z: rc(VAULT)[1], r: 3.35, h: 0.16 }];   // walk-on surfaces that never block (game.js VAULT dais cylinder)
  function climbTag(out) { for (const p of out) { if (p.h != null) continue; const h = p.top != null ? p.top : TOPH[p.k] ? TOPH[p.k](p) : H; p.h = Math.round(h * 1000) / 1000; p.climb = (p.top != null || !!CLIMBK[p.k] || (p.k === 'mcrate' && p.r < 0.4)) && h <= CLIMB.MAXTOP; } }
  function blocksAt(p, y) { return !p.climb || y < p.h - CLIMB.STEP; }
  // the walkable surface height under (x, z): the floor (0), the dais, or the top of a climbable prop he is over. With y: only tops he can reach from there (at most a step up).
  const groundY = (x, z, types, y, sup) => {   // sup: the support pad around a top (default SUP; the server is a little wider)
    let g = 0; const lim = y == null ? Infinity : y + CLIMB.STEP + 1e-3, S = sup == null ? CLIMB.SUP : sup;
    for (const t of TERRAIN) if (t.h > g && t.h <= lim && (x - t.x) * (x - t.x) + (z - t.z) * (z - t.z) < t.r * t.r) g = t.h;
    for (const p of propsAt(x, z, types)) if (p.climb && p.h > g && p.h <= lim && (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < (p.r + S) * (p.r + S)) g = p.h;
    return g;
  };
  const topAt = (x, z, types, y) => { let best = null; for (const p of propsAt(x, z, types)) if (p.climb && Math.abs(p.h - y) < 0.03 && Math.hypot(x - p.x, z - p.z) < p.r + CLIMB.SUP) best = p; return best; };   // the prop he stands on (footstep sound, bots)
  // one frame of the vertical model. s = { y, vy, air, coy, buf } (buf: set to CLIMB.BUF on a jump press); gy = groundY under the feet; on = input allowed. Returns '' | 'jump' | 'land' | 'step'.
  const vstep = (s, dt, gy, on = true) => {
    const C = CLIMB; let ev = '';
    s.buf = on ? Math.max(0, (s.buf || 0) - dt) : 0; s.vy = s.vy || 0; s.y = s.y || 0;
    if (!s.air) {
      if (s.y - gy > C.STEP + 1e-3) { s.air = true; s.vy = 0; s.coy = C.COYOTE; }   // walked off a ledge: fall, a jump still counts for COYOTE
      else { if (Math.abs(gy - s.y) > 0.02) ev = 'step'; s.y = gy; s.coy = C.COYOTE; }   // auto step up / down (<= STEP)
    } else s.coy = Math.max(0, (s.coy || 0) - dt);
    if (on && s.buf > 0 && (!s.air || s.coy > 0)) { s.air = true; s.vy = C.V0; s.coy = 0; s.buf = 0; ev = 'jump'; }
    if (s.air) {
      s.y += s.vy * dt - 0.5 * C.G * dt * dt; s.vy -= C.G * dt;
      if (s.vy <= 0 && s.y <= gy) { s.fall = -s.vy; s.y = gy; s.vy = 0; s.air = false; s.coy = C.COYOTE; ev = 'land'; }   // landing (a ledge within a step under the feet catches him: mantle)
    }
    return ev;
  };
  // stability: depenetrate from a prop that blocks at height y (smoothly, PUSHV m/s), and slide him off an edge he is no longer supported by (EDGEV), so nobody perches on a rim or sticks inside
  const climbPush = (x, z, y, rad, types, dt) => {
    let ox = x, oz = z; const C = CLIMB;
    for (const p of propsAt(x, z, types)) {
      const dx = ox - p.x, dz = oz - p.z, d = Math.hypot(dx, dz), ux = d > 1e-6 ? dx / d : 1, uz = d > 1e-6 ? dz / d : 0; let a = 0;
      if (blocksAt(p, y)) { if (d < p.r + rad) a = Math.min(p.r + rad - d, C.PUSHV * dt); }
      else if (y < p.h - 0.01 && d >= p.r + C.SUP && d < p.r + rad) a = Math.min(p.r + rad - d, C.EDGEV * dt);
      if (a > 0) { ox += ux * a; oz += uz * a; }
    }
    return [ox, oz];
  };
  // after the horizontal move (slide with y): stability push, then the vertical step. Returns [x, z, event]; game.js checks the walls for the push, the tests run exactly this.
  const climbFrame = (s, x, z, rad, types, dt, on) => { const [px, pz] = climbPush(x, z, s.y || 0, rad, types, dt); return [px, pz, vstep(s, dt, groundY(px, pz, types, s.y || 0), on)]; };
  // CLIMB-END
  // Push a walker of radius rad out of every footprint. (x0, z0) is where he came from. A head-on move (no progress after the push) gets turned along the surface so nobody sticks to a barrel.
  const slide = (x0, z0, x1, z1, rad, types, withRects, y) => {   // CLIMB: with a feet height y, a climbable prop whose top is within a step of y is not a wall
    const ps = propsAt(x1, z1, types), rs = withRects ? rectsAt(x1, z1) : null;
    if (!ps.length && !(rs && rs.length)) return [x1, z1];
    let x = x1, z = z1, nx = 0, nz = 0, hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const p of ps) {
        if (y != null && !blocksAt(p, y)) continue;   // CLIMB
        const dx = x - p.x, dz = z - p.z, R = p.r + rad, d2 = dx * dx + dz * dz;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2); let ux, uz; if (d > 1e-6) { ux = dx / d; uz = dz / d; } else { const e = Math.hypot(x0 - p.x, z0 - p.z) || 1; ux = (x0 - p.x) / e; uz = (z0 - p.z) / e; }
        x = p.x + ux * R; z = p.z + uz * R; nx = ux; nz = uz; hit = moved = true;
      }
      if (rs) for (const q of rs) {
        const cx = Math.max(q[0], Math.min(x, q[2])), cz = Math.max(q[1], Math.min(z, q[3])), dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + dx / d * rad; z = cz + dz / d * rad; nx = dx / d; nz = dz / d; }
        else { const l = x - q[0], r = q[2] - x, t = z - q[1], b = q[3] - z, m = Math.min(l, r, t, b); if (m === l) { x = q[0] - rad; nx = -1; nz = 0; } else if (m === r) { x = q[2] + rad; nx = 1; nz = 0; } else if (m === t) { z = q[1] - rad; nx = 0; nz = -1; } else { z = q[3] + rad; nx = 0; nz = 1; } }
        hit = moved = true;
      }
      if (!moved) break;
    }
    if (hit) {
      const st = Math.hypot(x1 - x0, z1 - z0);
      if (st > 1e-4 && Math.hypot(x - x0, z - z0) < st * 0.3) {   // stalled head-on
        let tx = -nz, tz = nx; if (tx * (x1 - x0) + tz * (z1 - z0) < 0) { tx = -tx; tz = -tz; }
        const qx = x0 + tx * st, qz = z0 + tz * st;
        if (!inProp(qx, qz, rad - 1e-6, types, withRects, y)) { x = qx; z = qz; }
      }
    }
    return [x, z];
  };
  function inProp(x, z, rad, types, withRects, y) {   // CLIMB: a feet height y skips the climbable props he stands on or above
    for (const p of propsAt(x, z, types)) if ((y == null || blocksAt(p, y)) &&(x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < (p.r + rad) * (p.r + rad)) return true;
    if (withRects) for (const q of rectsAt(x, z)) { const cx = Math.max(q[0], Math.min(x, q[2])), cz = Math.max(q[1], Math.min(z, q[3])); if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < rad * rad) return true; }
    return false;
  }
  const segBlocked = (x0, z0, x1, z1, types, pad = 0, y0, y1) => {   // does the segment cross a footprint (bolts, melee line of sight)? Only the props of the start point's room count. CLIMB: y0 / y1 = the line's heights at both ends (absent: 2D, every prop shields)
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    for (const p of propsAt(x0, z0, types)) {
      const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.z - z0) * dz) / L2)) : 0, qx = x0 + dx * t - p.x, qz = z0 + dz * t - p.z, R = p.r * 0.85 + pad;
      if (qx * qx + qz * qz < R * R && (y0 == null || !p.climb || y0 + ((y1 == null ? y0 : y1) - y0) * t < p.h + COVER)) return true;   // CLIMB: a line above a low top passes (high ground sees over crates)
    }
    return false;
  };
  const allProps = types => { const out = []; for (let i = 0; i < NARENA; i++) out.push(...solidsOf(String(i), treeTypeOf(types, i))); for (const c of CHEST) out.push(...solidsOf('c' + c.id, typeOf(types, c.id))); return out; };
  const obstaclesIn = (key, m) => solidsOf(key, key[0] === 'c' ? typeOf(m && m.layout, +key.slice(1)) : treeTypeOf(m, key) || treeTypeOf(m && m.layout, key));   // bot steering: the room's prop circles {x,z,r}
  const api = { CLIMB, groundY, vstep, climbPush, climbFrame, blocksAt, topAt, TERRAIN, obstaclesIn, solidsOf, storyOf, slide, inProp, segBlocked, allProps, propsAt, rectsAt, PILLARS, PILLAR_D, RELIC, SCALE, W, V, H, T, CS, HS, N, NARENA, NATT, COLW, ROWD, COLX, ROWZ, EDGE, HALF, LIM,
    VAULT, VAULT_KEY, TREE_CELLS, VB_CELLS, HOME_IDS, LOOT_IDS, NSIDE, SIDE_ORDER, SIDE_CELLS, HOME_POS, attachedSide, attachedPos, attachedId, attachedOf, isHomeKey, colOf, rowOf, roomW, roomD, rc, gi, roomAt, inGrid, kindOf, CHEST, chestKey, roomKeyOf, panelOffsets, panelDX, randomPoint,
    ROOMS, roomRect, DOORS, WALLS, ROOM_DOORS, HATCHES, alwaysOpen, attachedAt, homeOf, attLocal, HOME_LAYOUT, LOOT_LAYOUT, HOME_SOLIDS, HOME_K, TREE_SOLIDS, VB_SOLIDS, VB_SCALE, COFFERS, rectCircles, treeKind, treeTypeOf, ACT_LOCAL, vbRot, actAnchors, actKind };
  root.GKWORLD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

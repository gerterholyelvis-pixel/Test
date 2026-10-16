// Shared world geometry: ONE source of truth for the client (window.GKWORLD) and the server (require('./world.js')).
// world.js v2 (docs/PLAN-5x5.md section 6): a 5x5 grid with column widths COLW = [W, W, V, W, W] and row depths ROWD = COLW, so the middle room (room 12) is THE VAULT (V x V),
// the rooms of the vault row / column are V x W (or W x V), every other room is W x W. Arena rooms are numbered 0..24 (index = col + 5 * row).
// 16 attached rooms ('c0'..'c15') sit behind the 16 perimeter cells in a pinwheel, clockwise from the NW corner: even ids are 10x10 HOMES, odd ids are 8x8 loot rooms.
// Every door of the world is in WORLD.DOORS (one canonical id order, server and client both derive from it). WORLD.WALLS lists every wall segment.
(function (root) {
  const SCALE = 1.25;      // room scale vs the original 12 / 18 m layout (rooms grew 25% per side; doors, props and the loot rooms keep their size)
  const W = 12 * SCALE;    // normal room size (m): 15
  const V = 18 * SCALE;    // THE VAULT size (m): 22.5, keep V / W = 1.5
  const H = 6.5;           // ceiling height
  const T = 0.6;           // wall thickness
  const CS = 8;            // loot room size (merchant, mystery and chest art is authored for 8 m)
  const HS = 10;           // home room size
  const N = 5, NARENA = N * N, NATT = 16;
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
  // ---- attached rooms (pinwheel: NW goes N, NE goes E, SE goes S, SW goes W; each side is [corner home, loot, middle home, loot])
  const SIDES = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] }, OPP = { N: 'S', S: 'N', E: 'W', W: 'E' }, DIRNAME = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };
  const ATT_CELLS = [[0, 'N'], [1, 'N'], [2, 'N'], [3, 'N'], [4, 'E'], [9, 'E'], [14, 'E'], [19, 'E'], [24, 'S'], [23, 'S'], [22, 'S'], [21, 'S'], [20, 'W'], [15, 'W'], [10, 'W'], [5, 'W']];
  const HOME_IDS = [], LOOT_IDS = [];
  const CHEST = [];   // attached rooms in id order: { id, parent, side, dx, dz, cx, cz, wallX, wallZ, size, home }
  const ATT = new Array(NARENA).fill(null);   // arena index -> its attached room entry (or null)
  for (const [i, side] of ATT_CELLS) {
    const id = CHEST.length, home = id % 2 === 0, size = home ? HS : CS, [dx, dz] = SIDES[side], [x0, z0] = rc(i), off = dx ? roomW(i) / 2 : roomD(i) / 2;
    const c = { id, parent: i, side, dx, dz, cx: x0 + dx * (off + size / 2), cz: z0 + dz * (off + size / 2), wallX: x0 + dx * off, wallZ: z0 + dz * off, size, home };
    CHEST.push(c); ATT[i] = c; (home ? HOME_IDS : LOOT_IDS).push(id);
  }
  const chestKey = (i, side) => 'c' + CHEST.findIndex(c => c.parent === i && c.side === side);
  const homeOf = slot => 'c' + 2 * slot;   // spawn slot 0..7 -> home room key
  const attachedAt = (x, z, pad = 0) => { for (const c of CHEST) if (Math.abs(x - c.cx) <= c.size / 2 + pad && Math.abs(z - c.cz) <= c.size / 2 + pad) return c.id; return -1; };
  // position -> room key ('0'..'24' arena rooms, 'c0'..'c15' attached rooms, 'c-1' for the void outside the grid that belongs to no attached room).
  // Outside the grid the key follows the wall region (the strip beyond a perimeter cell's wall belongs to that cell's attached room), as in v1; inBounds() decides what is walkable.
  const roomKeyOf = (x, z) => {
    if (Math.abs(z) > HALF) { const a = ATT[gi(x) + (z < 0 ? 0 : N * (N - 1))]; if (a && a.side === (z < 0 ? 'N' : 'S')) return 'c' + a.id; }
    if (Math.abs(x) > HALF) { const a = ATT[gi(z) * N + (x < 0 ? 0 : N - 1)]; if (a && a.side === (x < 0 ? 'W' : 'E')) return 'c' + a.id; }
    if (Math.abs(x) > HALF || Math.abs(z) > HALF) return 'c-1';
    return String(roomAt(x, z));
  };
  // ---- ROOMS: 25 arena rooms + 16 attached rooms
  const ROOMS = [], ROOM = {};
  for (let i = 0; i < NARENA; i++) { const [cx, cz] = rc(i); ROOMS.push({ key: String(i), i, kind: kindOf(i), cx, cz, hw: roomW(i) / 2, hd: roomD(i) / 2 }); }
  for (const c of CHEST) ROOMS.push({ key: 'c' + c.id, id: c.id, kind: c.home ? 'home' : 'loot', cx: c.cx, cz: c.cz, hw: c.size / 2, hd: c.size / 2 });
  for (const r of ROOMS) ROOM[r.key] = r;
  const roomRect = k => ROOM[typeof k === 'number' ? String(k) : k] || null;
  // ---- DOORS (canonical order: for i = 0..24 its E door, its S door, then its attached door) and WALLS
  const DOORS = [], WALLS = [], ROOM_DOORS = {};
  const addDoor = (a, b, da, db, kind, axis, c, x, z, rot, len) => {
    const id = DOORS.length, d = { id, a, b, da, db, kind, axis, c, hw: (kind === 'vault' ? 4.9 : 4) / 2 + 0.2, wall: { x, z, rot, len } };
    DOORS.push(d); WALLS.push({ x, z, rot, len, door: id, kind }); (ROOM_DOORS[a] = ROOM_DOORS[a] || []).push(id); (ROOM_DOORS[b] = ROOM_DOORS[b] || []).push(id);
  };
  for (let i = 0; i < NARENA; i++) {
    const col = colOf(i), row = rowOf(i), [cx, cz] = rc(i), rw = roomW(i), rd = roomD(i), s = String(i);
    if (col < N - 1) addDoor(s, String(i + 1), 'EAST', 'WEST', i === VAULT || i + 1 === VAULT ? 'vault' : 'arena', 'z', cz, cx + rw / 2, cz, Math.PI / 2, rd);
    if (row < N - 1) addDoor(s, String(i + N), 'SOUTH', 'NORTH', i === VAULT || i + N === VAULT ? 'vault' : 'arena', 'x', cx, cx, cz + rd / 2, 0, rw);
    const a = ATT[i];
    if (a) { const ns = a.dz !== 0; addDoor(s, 'c' + a.id, DIRNAME[a.side], DIRNAME[OPP[a.side]], a.home ? 'hatch' : 'loot', ns ? 'x' : 'z', ns ? cx : cz, a.wallX, a.wallZ, ns ? 0 : Math.PI / 2, ns ? rw : rd); }
  }
  // the 4 bare outer walls (each corner cell's side that has no attached room), then each attached room's own 3 walls (back + 2 sides; their meshes are the room shell)
  for (const i of [0, N - 1, NARENA - 1, NARENA - N]) {
    const col = colOf(i), row = rowOf(i), [cx, cz] = rc(i), a = ATT[i];
    for (const side of [row === 0 ? 'N' : 'S', col === 0 ? 'W' : 'E']) {
      if (a && a.side === side) continue; const [dx, dz] = SIDES[side];
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
  // HOME_LAYOUT: where the home furniture stands in the home's local frame (game.js builds the placeholder workbench / recycler there; task C replaces the art). [x, z, rotY]
  const HOME_LAYOUT = { bench: [-2.25, -(HS / 2 - T / 2) + 0.75, 0], recycler: [2.35, -(HS / 2 - T / 2) + 0.85, 0], crate: [-(HS / 2 - T / 2) + 0.75, HS / 2 - T / 2 - 1.4] };
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
    const ck = key + '|' + (key[0] === 'c' ? type : ''); let out = cache.get(ck); if (out) return out; out = [];
    if (key[0] !== 'c') {
      const i = +key, [cx, cz] = rc(i), loc = [], kd = kindOf(i);
      if (kd === 'vault') {
        loc.push({ k: 'ped', x: RELIC.x - cx, z: RELIC.z - cz, r: 0.68 });
        for (const sx of [-1, 1]) cornerStack(key, i, sx, loc, 'v' + sx);
      } else if (kd === 'vb') {   // crates in the 2 corners away from the vault door (the station wall opposite the vault door stays clear for task B/C)
        const [vx, vz] = rc(VAULT), ux = Math.sign(vx - cx), uz = Math.sign(vz - cz);
        for (const q of [-1, 1]) cornerStack(key, i, q, loc, 'b' + q, uz ? -uz : -ux, !uz);
      } else if (kd === 'tree') {   // no story corner; task B/C adds the trunk circle (r 1.1 at the centre) together with its art
        cornerStack(key, i, hashStr('solid:' + key) & 1 ? 1 : -1, loc, '');
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
      if (c && type === 'mystery') {   // the back-corner clutter of the "?" room, authored in the room's own frame (+z toward the door, game.js buildMystery)
        for (const [k, lx, lz, r] of [['mcrate', -2.8, -2.85, 0.62], ['mcrate', -1.95, -3.2, 0.3], ['urn', 2.9, -2.9, 0.5], ['urn', 2.0, -3.15, 0.36], ['urn', 3.2, -1.7, 0.34]]) { const [x, z] = attLocal(c, lx, lz); out.push({ k, x, z, r }); }
      } else if (c && c.home) {   // the home furniture: workbench, recycler, one crate stack by the doorway
        const B = HOME_LAYOUT.bench, R = HOME_LAYOUT.recycler, K = HOME_LAYOUT.crate;
        for (const ox of [-0.58, 0.58]) { const [x, z] = attLocal(c, B[0] + ox, B[1]); out.push({ k: 'bench', x, z, r: 0.62 }); }
        { const [x, z] = attLocal(c, R[0], R[1]); out.push({ k: 'recycler', x, z, r: 0.82 }); }
        { const [x, z] = attLocal(c, K[0], K[1]); out.push({ k: 'hcrate', x, z, r: 0.5 }); }
      } else if (c && (type === 'forge' || type === 'grand')) {   // the station footprint
        const S = LOOT_LAYOUT[type];
        if (type === 'forge') for (const ox of [-0.58, 0.58]) { const [x, z] = attLocal(c, S[0] + ox, S[1]); out.push({ k: 'bench', x, z, r: 0.62 }); }
        else { const [x, z] = attLocal(c, S[0], S[1]); out.push({ k: 'recycler', x, z, r: 0.82 }); }
      }
    }
    cache.set(ck, out); return out;
  };
  const typeOf = (types, id) => { const t = types && types[id]; return t && t.type ? t.type : t; };
  const propsAt = (x, z, types) => {   // the circles of the room that contains (x, z)
    if (!(Math.abs(x) <= LIM && Math.abs(z) <= LIM)) return [];
    const key = roomKeyOf(x, z); if (key === 'c-1') return [];
    return solidsOf(key, key[0] === 'c' ? typeOf(types, +key.slice(1)) : '');
  };
  const PILLAR_D = V * 0.3;   // the four vault pillars stand at (+-PILLAR_D, +-PILLAR_D) from the vault centre (game.js VAULT block and blob shadows use it too)
  const PILLARS = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) PILLARS.push([sx * PILLAR_D - 0.6, sz * PILLAR_D - 0.6, sx * PILLAR_D + 0.6, sz * PILLAR_D + 0.6]);   // vault pillars (game.js rects); the vault centre is the origin
  const rectsAt = (x, z) => Math.abs(x) < V / 2 && Math.abs(z) < V / 2 ? PILLARS : [];
  // Push a walker of radius rad out of every footprint. (x0, z0) is where he came from. A head-on move (no progress after the push) gets turned along the surface so nobody sticks to a barrel.
  const slide = (x0, z0, x1, z1, rad, types, withRects) => {
    const ps = propsAt(x1, z1, types), rs = withRects ? rectsAt(x1, z1) : null;
    if (!ps.length && !(rs && rs.length)) return [x1, z1];
    let x = x1, z = z1, nx = 0, nz = 0, hit = false;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const p of ps) {
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
        if (!inProp(qx, qz, rad - 1e-6, types, withRects)) { x = qx; z = qz; }
      }
    }
    return [x, z];
  };
  function inProp(x, z, rad, types, withRects) {
    for (const p of propsAt(x, z, types)) if ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z) < (p.r + rad) * (p.r + rad)) return true;
    if (withRects) for (const q of rectsAt(x, z)) { const cx = Math.max(q[0], Math.min(x, q[2])), cz = Math.max(q[1], Math.min(z, q[3])); if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < rad * rad) return true; }
    return false;
  }
  const segBlocked = (x0, z0, x1, z1, types, pad = 0) => {   // does the segment cross a footprint (bolts, melee line of sight)? Only the props of the start point's room count.
    const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    for (const p of propsAt(x0, z0, types)) {
      const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.z - z0) * dz) / L2)) : 0, qx = x0 + dx * t - p.x, qz = z0 + dz * t - p.z, R = p.r * 0.85 + pad;
      if (qx * qx + qz * qz < R * R) return true;
    }
    return false;
  };
  const allProps = types => { const out = []; for (let i = 0; i < NARENA; i++) out.push(...solidsOf(String(i), '')); for (const c of CHEST) out.push(...solidsOf('c' + c.id, typeOf(types, c.id))); return out; };
  const obstaclesIn = (key, m) => solidsOf(key, key[0] === 'c' ? typeOf(m && m.layout, +key.slice(1)) : '');   // bot steering: the room's prop circles {x,z,r}
  const api = { obstaclesIn, solidsOf, storyOf, slide, inProp, segBlocked, allProps, propsAt, rectsAt, PILLARS, PILLAR_D, RELIC, SCALE, W, V, H, T, CS, HS, N, NARENA, NATT, COLW, ROWD, COLX, ROWZ, EDGE, HALF, LIM,
    VAULT, VAULT_KEY, TREE_CELLS, VB_CELLS, HOME_IDS, LOOT_IDS, colOf, rowOf, roomW, roomD, rc, gi, roomAt, inGrid, kindOf, CHEST, chestKey, roomKeyOf, panelOffsets, panelDX, randomPoint,
    ROOMS, roomRect, DOORS, WALLS, ROOM_DOORS, HATCHES, alwaysOpen, attachedAt, homeOf, attLocal, HOME_LAYOUT, LOOT_LAYOUT };
  root.GKWORLD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

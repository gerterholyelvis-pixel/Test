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
  // x offset of the wall map (-dx) and the door control panel (+dx) on a room's north wall: 4.5 m, 6.5 m in the 18 m wide rooms (they clear the vault door's keypads)
  const panelDX = i => roomW(i) > W ? 6.5 : 4.5;
  // a random spawn point inside room i (its own width/depth), keeping a 3 m margin to the walls
  const randomPoint = (i, rnd = Math.random) => { const [cx, cz] = rc(i); return [cx + (rnd() - 0.5) * (roomW(i) - 6), cz + (rnd() - 0.5) * (roomD(i) - 6)]; };
  // ===== SOLID PROPS: crates, barrels, urns and the relic pedestal are obstacles for walking (client prediction AND server validation), bolts and melee line of sight.
  // Every footprint is a circle {k, x, z, r} in world metres (r is the prop's own radius; a walker adds his radius). The layout depends only on the room key, so client and server agree;
  // mystery-room props depend on the room type (types[id] is a string, or an object with .type such as game.js CHEST_ROOMS). Vault pillars are rects (the client already blocks them as wall rects).
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mul = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };   // same generator as game.js ROOMART
  const halfX = i => roomW(i) / 2 - T / 2, halfZ = i => roomD(i) / 2 - T / 2;   // interior half extents of grid room i
  const RELIC = { x: rc(VAULT)[0] + 2.4, z: rc(VAULT)[1] };                    // the vault pedestal (server RELIC_POS, game.js LOOT)
  // The "story corner" of grid room i (game.js ROOMART step 5b): theme 0 camp, 1 hoard, 2 gaol; theme and corner come from the first five draws of the room's own stream
  const storyOf = i => {
    if (i === VAULT) return null;
    const r2 = mul(hashStr('roomart2:' + i)), hx = halfX(i), hz = halfZ(i), theme = (r2() * 3) | 0, sx = r2() < 0.5 ? -1 : 1, sz = r2() < 0.5 ? -1 : 1;
    return { theme, sx, sz, x: sx * (hx - 1.7 - r2() * 0.3), z: sz * (hz - 1.7 - r2() * 0.3) };   // room-local, same draw order as spot() in game.js
  };
  // keep-clear zones of a grid room (room-local x, z; r = prop radius): the four door strips with their keypads, and the north wall's map / control panel
  const clearOK = (i, x, z, r) => {
    const hx = halfX(i), hz = halfZ(i);
    if (Math.abs(x) < 3.4 + r && hz - Math.abs(z) < 3.2 + r) return false;          // N / S door strip
    if (Math.abs(z) < 3.4 + r && hx - Math.abs(x) < 3.2 + r) return false;          // E / W door strip
    if (z < 0 && hz + z < 3.4 + r && Math.abs(Math.abs(x) - panelDX(i)) < 1.7 + r) return false;   // north wall panels
    return true;
  };
  const cache = new Map();
  const cornerStack = (key, i, sx, out, tag) => {   // one big crate in a south corner, sometimes a small one beside it along the wall (the footprints stay circles)
    const rng = mul(hashStr('solid:' + key + tag)), hx = halfX(i), hz = halfZ(i), s1 = 0.8 + rng() * 0.2, s2 = 0.5 + rng() * 0.12;
    const x1 = sx * (hx - 0.4 - s1 / 2 - rng() * 0.15), z1 = hz - 0.4 - s1 / 2 - rng() * 0.15, y1 = rng() * 0.6 - 0.3;
    const x2 = x1 - sx * (s1 / 2 + s2 / 2 + 0.14 + rng() * 0.1), z2 = hz - 0.35 - s2 / 2 - rng() * 0.1, y2 = rng() * 0.8 - 0.4, two = rng() < 0.5;
    out.push({ k: 'crate', x: x1, z: z1, r: s1 * 0.6, s: s1, yaw: y1, art: true }); if (two) out.push({ k: 'crate', x: x2, z: z2, r: s2 * 0.6, s: s2, yaw: y2, art: true });
  };
  const solidsOf = (key, type) => {
    const ck = key + '|' + (key[0] === 'c' ? type : ''); let out = cache.get(ck); if (out) return out; out = [];
    if (key[0] !== 'c') {
      const i = +key, [cx, cz] = rc(i), loc = [];
      if (i === VAULT) {
        loc.push({ k: 'ped', x: RELIC.x - cx, z: RELIC.z - cz, r: 0.68 });
        for (const sx of [-1, 1]) cornerStack(key, i, sx, loc, 'v' + sx);
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
    } else if (type === 'mystery') {   // the back-corner clutter of the "?" room, authored in the room's own frame (+z toward the door, game.js buildMystery)
      const c = CHEST[+key.slice(1)];
      if (c) {
        const ry = Math.atan2(-c.dx, -c.dz), cs = Math.cos(ry), sn = Math.sin(ry);
        for (const [k, lx, lz, r] of [['mcrate', -2.8, -2.85, 0.62], ['mcrate', -1.95, -3.2, 0.3], ['urn', 2.9, -2.9, 0.5], ['urn', 2.0, -3.15, 0.36], ['urn', 3.2, -1.7, 0.34]])
          out.push({ k, x: c.cx + lx * cs + lz * sn, z: c.cz - lx * sn + lz * cs, r });
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
  const PILLARS = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) PILLARS.push([sx * 5.4 - 0.6, sz * 5.4 - 0.6, sx * 5.4 + 0.6, sz * 5.4 + 0.6]);   // vault pillars (game.js rects); the vault centre is the origin
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
  const allProps = types => { const out = []; for (let i = 0; i < 9; i++) out.push(...solidsOf(String(i), '')); for (const c of CHEST) out.push(...solidsOf('c' + c.id, typeOf(types, c.id))); return out; };
  const api = { solidsOf, storyOf, slide, inProp, segBlocked, allProps, propsAt, rectsAt, PILLARS, RELIC, W, V, H, T, CS, COLW, ROWD, COLX, ROWZ, HALF, LIM, VAULT, colOf, rowOf, roomW, roomD, rc, gi, roomAt, inGrid, CHEST, chestKey, roomKeyOf, panelOffsets, panelDX, randomPoint };
  root.GKWORLD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

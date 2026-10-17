// Goblin King: art for the player HOME room (5x5 plan, sections 1.5 to 1.8). Procedural, no assets, no lights.
//   import { buildHomeRoom } from './rooms5art-home.js';
//   const home = buildHomeRoom(THREE, {}, { doorSide: 'S', seed: 3, owner: 'Grimble' });
//   home.group  -> THREE.Group, origin = room centre, floor y = 0, door on the side named by opts.doorSide ('S' = +z, 'N' = -z, 'E' = +x, 'W' = -x)
//   home.anchors-> { bench, recycler, pump, screen, lockbox, spawn, door, lamp, map }  (THREE.Vector3 relative to room centre, already rotated; each has .yaw = facing of the prop front)
//   home.solids -> [{ x, z, hx, hz }] footprint boxes of the big props, room-relative (for collision / bot nav)
//   home.setOwner(name, colour?) : colour is a hex number or css string for the nameplate text (the owner's colour)
//   home.setPumpLevel(0..1), home.setPumpAlert(bool), home.setUpgrade(name, level), home.setScreenPower(bool), home.setOwner(name), home.ringAlarm(), home.setSentryTarget(x, z | null)
//   home.update(timeSeconds) call once per frame while the room is visible (bubbles, smoke, flicker, bell swing)
//   home.dispose()
// Upgrade names: 'lock' (door bars, level 1 / 2), 'alarm' (bell), 'sentry' (crossbow mount), 'lockbox' (reinforced straps). Unknown names return false.
// Static art is merged into 7 meshes (one per material); the animated bits add about 14 more draw calls. Only emissive materials and sprites, never a light.
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const PI = Math.PI;
const RBOX = new Map(), rbox = (w, h, d, r) => { const k = w + ',' + h + ',' + d + ',' + r; let g = RBOX.get(k); if (!g) { if (RBOX.size > 600) RBOX.clear(); RBOX.set(k, g = new RoundedBoxGeometry(w, h, d, 2, r)); } return g.clone(); };   // PERF5: a rounded box is built once per size and cloned (the 8 homes repeat their furniture: most of a home's build time was RoundedBoxGeometry)
const ELIXIR = 0x39f2c4, ELIXIR_RED = 0xff4a3a;
const rngOf = seed => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const mergeBag = list => mergeGeometries(list.map(g => (g.index ? g.toNonIndexed() : g)), false);   // some primitives are indexed and some are not: normalise
const sstep =(a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- shared textures and materials (one set for all homes; per-home animated materials are made inside buildHomeRoom) ----------
const SHARED = new WeakMap();   // THREE namespace -> { tex, mats }
function shared(THREE) {
  let S = SHARED.get(THREE); if (S) return S;
  const tex = {}, mk = (name, size, draw, rep) => {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size, rngOf(name.length * 7919 + size));
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (rep) t.repeat.set(rep, rep); return t;
  };
  tex.wood = mk('wood', 512, (g, s, r) => {   // four planks, vertical grain, knots, nail heads, grime
    g.fillStyle = '#d2b48a'; g.fillRect(0, 0, s, s);
    for (let p = 0; p < 4; p++) {
      const x0 = p * s / 4, w = s / 4, sh = 0.82 + r() * 0.18;
      g.fillStyle = `rgba(${(90 * sh) | 0},${(60 * sh) | 0},${(30 * sh) | 0},${0.12 + r() * 0.12})`; g.fillRect(x0, 0, w, s);
      for (let i = 0; i < 38; i++) { const x = x0 + 3 + r() * (w - 6), ph = r() * 6, am = 1 + r() * 3; g.strokeStyle = r() < 0.75 ? `rgba(60,36,14,${0.08 + r() * 0.2})` : `rgba(255,236,200,${0.05 + r() * 0.1})`; g.lineWidth = 0.5 + r() * 1.8; g.beginPath(); for (let y = 0; y <= s; y += 16) { const xx = x + Math.sin(y * 0.02 + ph) * am; y ? g.lineTo(xx, y) : g.moveTo(xx, y); } g.stroke(); }
      if (r() < 0.8) { const kx = x0 + w * (0.3 + r() * 0.4), ky = r() * s; for (let q = 5; q > 0; q--) { g.strokeStyle = `rgba(50,28,10,${0.1 + q * 0.05})`; g.lineWidth = 1.2; g.beginPath(); g.ellipse(kx, ky, 3 + q * 2.2, 7 + q * 4.5, 0, 0, PI * 2); g.stroke(); } }
      g.fillStyle = 'rgba(25,14,6,0.7)'; g.fillRect(x0, 0, 2.5, s); g.fillStyle = 'rgba(255,230,190,0.12)'; g.fillRect(x0 + 2.5, 0, 1.5, s);
      for (const ny of [14, s - 14]) { g.fillStyle = 'rgba(30,22,16,0.8)'; g.fillRect(x0 + 10, ny, 3, 3); g.fillRect(x0 + w - 13, ny, 3, 3); }
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(20,12,6,${r() * 0.22})`; g.beginPath(); g.ellipse(r() * s, r() * s, 6 + r() * 30, 3 + r() * 14, r() * 3, 0, PI * 2); g.fill(); }
  });
  tex.plaster = mk('plaster', 512, (g, s, r) => {   // warm lime plaster: blotches, damp stains from above, cracks
    g.fillStyle = '#e4d9c6'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {   // soft wrapped blotches (no hard edges, no visible repeat seam)
      const x = r() * s, y = r() * s, rad = 30 + r() * 80, dark = r() < 0.55, a = 0.05 + r() * 0.06;
      for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad); gr.addColorStop(0, dark ? `rgba(110,85,55,${a})` : `rgba(255,248,230,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2); }
    }
    for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(50,38,26,0.22)'; g.lineWidth = 0.8; g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (r() - 0.5) * 26; y += 9 + r() * 14; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 2500; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.1})` : `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); }
  });
  tex.metal = mk('metal', 512, (g, s, r) => {   // dark scratched iron with rust bloom and bright worn patches
    g.fillStyle = '#a3a8ad'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${150 + r() * 40 | 0},${70 + r() * 30 | 0},30,${0.06 + r() * 0.16})`; g.beginPath(); g.ellipse(r() * s, r() * s, 8 + r() * 50, 6 + r() * 34, r() * 3, 0, PI * 2); g.fill(); }
    for (let i = 0; i < 500; i++) { const x = r() * s, y = r() * s; g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.08})` : `rgba(10,14,20,${r() * 0.09})`; g.fillRect(x, y, 20 + r() * 120, 1 + r() * 1.5); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.3)' : 'rgba(10,12,16,0.3)'; g.lineWidth = 0.7; const x = r() * s, y = r() * s, a = r() * 6.28, l = 8 + r() * 40; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  });
  tex.cloth = mk('cloth', 256, (g, s, r) => {   // coarse weave, stitched, speckled with fibre
    g.fillStyle = '#d8d2c6'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 4) { g.fillStyle = `rgba(0,0,0,${0.07 + r() * 0.05})`; g.fillRect(i, 0, 1.4, s); g.fillRect(0, i, s, 1.4); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(i + 2, 0, 1, s); }
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; g.fillRect(r() * s, r() * s, 1 + r() * 4, 1); }
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(60,40,20,${r() * 0.14})`; g.beginPath(); g.ellipse(r() * s, r() * s, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, PI * 2); g.fill(); }
  });
  tex.stone = mk('stone', 256, (g, s, r) => {
    g.fillStyle = '#c4c0b6'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.12})` : `rgba(0,0,0,${r() * 0.12})`; g.fillRect(r() * s, r() * s, 1 + r() * 4, 1 + r() * 4); }
    for (let i = 0; i < 5; i++) { g.strokeStyle = 'rgba(30,28,24,0.4)'; g.lineWidth = 1; g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  });
  tex.ceramic = mk('ceramic', 128, (g, s, r) => { g.fillStyle = '#eee8dc'; g.fillRect(0, 0, s, s); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3); } });
  tex.glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  tex.smoke = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = rngOf(55); for (let i = 0; i < 9; i++) { const x = 64 + (r() - 0.5) * 40, y = 64 + (r() - 0.5) * 40, rad = 22 + r() * 22, gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  tex.rug = mk('rug', 256, (g, s, r) => {   // threadbare rug: ochre ground, red diamonds, border stripes, wear
    g.fillStyle = '#7a3a2c'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#c79a52'; for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const cx = 26 + x * 51, cy = 26 + y * 51; g.beginPath(); g.moveTo(cx, cy - 20); g.lineTo(cx + 20, cy); g.lineTo(cx, cy + 20); g.lineTo(cx - 20, cy); g.closePath(); g.fill(); g.fillStyle = '#3f2a24'; g.fillRect(cx - 4, cy - 4, 8, 8); g.fillStyle = '#c79a52'; }
    g.strokeStyle = '#2b1d1a'; g.lineWidth = 7; g.strokeRect(5, 5, s - 10, s - 10); g.strokeStyle = '#c79a52'; g.lineWidth = 3; g.strokeRect(13, 13, s - 26, s - 26);
    for (let i = 0; i < 2200; i++) { g.fillStyle = r() < 0.5 ? `rgba(255,240,210,${r() * 0.18})` : `rgba(0,0,0,${r() * 0.2})`; g.fillRect(r() * s, r() * s, 1 + r() * 5, 1 + r() * 1.5); }
    for (let i = 0; i < 10; i++) { g.fillStyle = `rgba(30,20,14,${0.1 + r() * 0.2})`; g.beginPath(); g.ellipse(r() * s, r() * s, 10 + r() * 30, 6 + r() * 20, r() * 3, 0, PI * 2); g.fill(); }
  });
  const M = {};
  const std = (map, o) => new THREE.MeshStandardMaterial(Object.assign({ map, vertexColors: true }, o));
  M.wood = std(tex.wood, { roughness: 0.86, metalness: 0 });
  M.plaster = std(tex.plaster, { roughness: 1, metalness: 0 });
  M.metal = std(tex.metal, { roughness: 0.52, metalness: 0.55, side: THREE.DoubleSide });
  M.brass = std(tex.metal, { roughness: 0.32, metalness: 0.75, side: THREE.DoubleSide });
  M.cloth = std(tex.cloth, { roughness: 1, metalness: 0, side: THREE.DoubleSide });
  M.stone = std(tex.stone, { roughness: 0.95, metalness: 0 });
  M.ceramic = std(tex.ceramic, { roughness: 0.5, metalness: 0.05 });
  const TILE = { wood: 1.2, plaster: 2.4, metal: 1.0, brass: 1.0, cloth: 0.6, stone: 1.0, ceramic: 0.5 };
  S = { tex, M, TILE }; SHARED.set(THREE, S); return S;
}

export function buildHomeRoom(THREE, helpers = {}, opts = {}) {
  const { tex, M, TILE } = shared(THREE);
  const rnd = rngOf((opts.seed | 0) * 2654435761 + 12345);
  const CEIL = opts.ceilingY || 3.8, DW = opts.doorW || 2.4, DH = opts.doorH || 2.7, HALF = (opts.size || 10) / 2, WALL = HALF - 0.02;
  const doorSide = opts.doorSide || 'S', ROT = { S: 0, E: PI / 2, N: PI, W: -PI / 2 }[doorSide] || 0;
  const group = new THREE.Group(); group.name = 'homeRoom'; group.rotation.y = ROT;

  // ---------- merge bags ----------
  const bags = { wood: [], plaster: [], metal: [], brass: [], cloth: [], stone: [], ceramic: [], glow: [] };
  const _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(), _S = new THREE.Vector3(), _M = new THREE.Matrix4(), _C = new THREE.Color();
  let cur = new THREE.Matrix4(); const stack = [];
  const at = (x, y, z, ry, fn) => { stack.push(cur); cur = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry || 0, 0)), new THREE.Vector3(1, 1, 1)).premultiply(stack[stack.length - 1]); fn(); cur = stack.pop(); };
  function put(bag, geo, c, o = {}) {
    _M.compose(_P.set(...(o.p || [0, 0, 0])), _Q.setFromEuler(_E.set(...(o.r || [0, 0, 0]), 'YXZ')), _S.set(...(o.s || [1, 1, 1]))).premultiply(cur);
    geo.applyMatrix4(_M);
    const pos = geo.attributes.position, nor = geo.attributes.normal, n = pos.count, uv = new Float32Array(n * 2), col = new Float32Array(n * 3), tile = TILE[bag] || 1;
    _C.setHex(c); const j = 1 + (rnd() - 0.5) * 0.16, br = _C.r * j, bg = _C.g * j, bb = _C.b * j;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
      uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
      const gr = (bag === 'glow' ? 1 : 0.58 + 0.42 * sstep(0, 0.85, y)) * (0.94 + rnd() * 0.06);   // floor grime + tiny per-vertex noise
      col[i * 3] = br * gr; col[i * 3 + 1] = bg * gr; col[i * 3 + 2] = bb * gr;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', pos); g.setAttribute('normal', nor); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(geo.index);
    bags[bag].push(g);
  }
  const box = (bag, w, h, d, x, y, z, c, o = {}) => put(bag, rbox(w, h, d, o.rad || Math.min(0.022, Math.min(w, h, d) / 2.3)), c, Object.assign({ p: [x, y, z] }, o));
  const cyl = (bag, rt, rb, h, x, y, z, c, o = {}) => put(bag, new THREE.CylinderGeometry(rt, rb, h, o.seg || 14, 1, !!o.open), c, Object.assign({ p: [x, y, z] }, o));
  const sph = (bag, r, x, y, z, c, o = {}) => put(bag, new THREE.SphereGeometry(r, o.seg || 12, o.segH || 8), c, Object.assign({ p: [x, y, z] }, o));
  const tor = (bag, R, r, x, y, z, c, o = {}) => put(bag, new THREE.TorusGeometry(R, r, 6, o.seg || 16), c, Object.assign({ p: [x, y, z] }, o));
  const lathe = (bag, pts, x, y, z, c, o = {}) => put(bag, new THREE.LatheGeometry(pts.map(q => new THREE.Vector2(q[0], q[1])), o.seg || 16), c, Object.assign({ p: [x, y, z] }, o));
  const tube = (bag, pts, r, c, o = {}) => put(bag, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new THREE.Vector3(...q))), o.segs || 24, r, 6, false), c, o);

  const solids = [], solid = (x, z, hx, hz) => solids.push({ x, z, hx, hz });
  const anchors = {};
  const anchor = (name, x, y, z, yaw) => { const v = new THREE.Vector3(x, y, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), ROT); v.yaw = (yaw || 0) + ROT; anchors[name] = v; };

  // ---------- palette ----------
  const WOODL = 0x9a7142, WOOD = 0x7d5733, WOODD = 0x4e3520, IRON = 0x6a6e73, IRONL = 0x9aa0a6, IRONR = 0x7a5a45, BRASS = 0xd2a64e, CLOTH = 0xb0a088, STONE = 0x8a867c;

  // ---------- SHELL: plank floor, lowered ceiling, wainscot, plaster, beams (cosy and dark; arena rooms stay white) ----------
  const buildShell = () => {
    box('wood', HALF * 2 - 0.1, 0.02, HALF * 2 - 0.1, 0, 0.012, 0, 0x6e4c2d, { rad: 0.005 });
    for (let i = -4; i <= 4; i++) box('wood', 0.012, 0.004, HALF * 2 - 0.2, i * 1.1 + 0.2, 0.024, 0, 0x2c1c10, { rad: 0.002 });   // plank seams read as darker lines
    box('wood', HALF * 2, 0.16, HALF * 2, 0, CEIL + 0.08, 0, 0x4a3320, { rad: 0.01 });   // ceiling slab (underside shows)
    for (const z of [-3.6, -1.2, 1.2, 3.6]) box('wood', HALF * 2 - 0.3, 0.3, 0.3, 0, CEIL - 0.15, z, 0x5a3f26, { rad: 0.03 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('wood', 0.34, CEIL, 0.34, sx * (HALF - 0.17), CEIL / 2, sz * (HALF - 0.17), 0x6a4a2c, { rad: 0.03 });
    const wall = (len, cx, cz, ry, gapX) => at(cx, 0, cz, ry, () => {   // one wall seen from inside, local +z points into the room; gap = {x0,x1} for the doorway
      const seg = (x0, x1, y0, y1) => { const w = x1 - x0; if (w < 0.02 || y1 - y0 < 0.02) return; box('plaster', w, y1 - y0, 0.04, (x0 + x1) / 2, (y0 + y1) / 2, 0.02, 0x8a7860, { rad: 0.005 }); };
      const wain = (x0, x1) => { const w = x1 - x0; if (w < 0.02) return; box('wood', w, 1.1, 0.06, (x0 + x1) / 2, 0.58, 0.05, WOOD, { rad: 0.012 }); box('wood', w, 0.08, 0.1, (x0 + x1) / 2, 1.14, 0.06, WOODL, { rad: 0.02 }); box('wood', w, 0.13, 0.08, (x0 + x1) / 2, 0.07, 0.055, WOODD, { rad: 0.015 }); };
      const h = len / 2;
      if (gapX) { seg(-h, gapX[0], 1.1, CEIL); seg(gapX[1], h, 1.1, CEIL); seg(gapX[0], gapX[1], DH + 0.3, CEIL); wain(-h, gapX[0]); wain(gapX[1], h); }
      else { seg(-h, h, 1.1, CEIL); wain(-h, h); }
    });
    // walls: local +z = into the room. S wall (z=+HALF) faces -z (ry = PI).
    wall(HALF * 2, 0, -WALL, 0, null); wall(HALF * 2, 0, WALL, PI, [-DW / 2 - 0.3, DW / 2 + 0.3]); wall(HALF * 2, -WALL, 0, PI / 2, null); wall(HALF * 2, WALL, 0, -PI / 2, null);
  };
  if (opts.shell !== false) buildShell();

  // ---------- DOOR hatch frame (opening on the +z wall) and security upgrade hooks ----------
  const doorZ = HALF - 0.12;
  box('wood', 0.34, DH + 0.42, 0.46, -DW / 2 - 0.17, (DH + 0.42) / 2, doorZ, WOODD, { rad: 0.04 }); box('wood', 0.34, DH + 0.42, 0.46, DW / 2 + 0.17, (DH + 0.42) / 2, doorZ, WOODD, { rad: 0.04 });
  box('wood', DW + 0.9, 0.38, 0.46, 0, DH + 0.2, doorZ, WOOD, { rad: 0.04 });
  box('stone', DW + 0.5, 0.07, 0.78, 0, 0.035, doorZ - 0.08, STONE, { rad: 0.02 });   // worn threshold slab
  for (const sx of [-1, 1]) for (const y of [0.5, 1.3, 2.1]) { box('metal', 0.1, 0.34, 0.5, sx * (DW / 2 + 0.17), y, doorZ, IRON, { rad: 0.012 }); for (const dy of [-0.11, 0.11]) sph('metal', 0.03, sx * (DW / 2 + 0.17) - sx * 0.06, y + dy, doorZ + 0.25, IRONL, { seg: 6, segH: 4 }); }
  for (const sx of [-1, 1]) { box('metal', 0.5, 0.1, 0.5, sx * (DW / 2 + 0.33), DH + 0.2, doorZ, IRON, { rad: 0.012 }); for (const dx of [-0.16, 0.16]) sph('metal', 0.03, sx * (DW / 2 + 0.33) + dx, DH + 0.2, doorZ + 0.25, IRONL, { seg: 6, segH: 4 }); }
  box('wood', DW + 0.2, 0.26, 0.12, 0, DH + 0.5, doorZ + 0.02, WOODL, { rad: 0.03 });   // nameplate board
  anchor('door', 0, 0, HALF - 0.35, PI); anchor('spawn', 0, 0, HALF - 2.2, PI);

  // nameplate (canvas) kept dynamic so the owner's name can change
  const nameCv = document.createElement('canvas'); nameCv.width = 512; nameCv.height = 64; const nameTex = new THREE.CanvasTexture(nameCv); nameTex.colorSpace = THREE.SRGBColorSpace; nameTex.anisotropy = 4;
  const setOwner = (name, colour) => { const g = nameCv.getContext('2d'); g.clearRect(0, 0, 512, 64); g.fillStyle = colour == null ? '#d8c9a4' : typeof colour === 'number' ? '#' + colour.toString(16).padStart(6, '0') : colour;   // optional owner colour (hex number or css string)
    g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 3; g.fillText(String(name || 'HOME').toUpperCase().slice(0, 18) + "'S", 256, 34); nameTex.needsUpdate = true; };
  setOwner(opts.owner, opts.colour);
  let outside = null; const nameMat = new THREE.MeshStandardMaterial({ map: nameTex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const nameMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.225), nameMat); nameMesh.position.set(0, DH + 0.5, doorZ - 0.045); nameMesh.rotation.y = PI; group.add(nameMesh);
  // the same nameplate on a timber board on the outside of the doorway wall (seen from the cell): opts.outZ = z of the wall's outer face, opts.outY = board height
  if (opts.outside !== false) {
    const oz = opts.outZ == null ? HALF + 0.33 : opts.outZ, oy = opts.outY == null ? DH + 1.3 : opts.outY;
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.52, 0.1), new THREE.MeshStandardMaterial({ color: 0x4e3520, roughness: 0.9 })); board.position.set(0, oy, oz + 0.05); group.add(board);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.4125), nameMat); sign.position.set(0, oy, oz + 0.105); group.add(sign);
    outside = { board, sign };
  }

  // door bars (Door Lock L1 / L2): timber bar, then iron bars, braces and a big padlock
  const barsMetal = [], barsWood = [], upg = { lock: new THREE.Group(), alarm: new THREE.Group(), sentry: new THREE.Group(), lockbox: new THREE.Group() };
  const sub = (name, fn, groupName) => {   // build a small separate merged mesh pair for a hidden upgrade; fn adds into temp bags
    const keep = {}; for (const k in bags) { keep[k] = bags[k]; bags[k] = []; }
    fn(); const out = new THREE.Group();
    for (const k in bags) { if (!bags[k].length) continue; const m = new THREE.Mesh(mergeBag(bags[k]), k === 'glow' ? glowMat : M[k]); out.add(m); }
    for (const k in keep) bags[k] = keep[k]; return out;
  };
  // (glowMat is defined with the dynamic materials just below; the sub-builder is only called after it exists)
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });   // candles, furnace slot, lamp bulb (emissive only)

  // ---------- LAMP, light pool, clutter, props ----------
  // hanging lantern in the room centre-back
  const LX = 0.4, LZ = -0.6, LY = CEIL - 1.05;
  at(LX, 0, LZ, 0, () => {
    for (let i = 0; i < 5; i++) tor('metal', 0.05, 0.012, 0, CEIL - 0.1 - i * 0.1, 0, IRON, { r: [0, i % 2 ? PI / 2 : 0, 0], seg: 10 });
    box('metal', 0.08, 0.05, 0.08, 0, CEIL - 0.02, 0, IRON);
    lathe('metal', [[0.001, 0], [0.12, 0], [0.2, 0.1], [0.28, 0.22], [0.26, 0.24], [0.04, 0.12], [0.001, 0.12]], 0, LY + 0.1, 0, 0x6b4a2e, { seg: 12 });   // cone shade
    lathe('metal', [[0.001, 0], [0.16, 0], [0.18, 0.04], [0.001, 0.06]], 0, LY - 0.38, 0, 0x33363b, { seg: 10 });
    for (let i = 0; i < 4; i++) cyl('metal', 0.011, 0.011, 0.5, Math.cos(i * PI / 2) * 0.15, LY - 0.14, Math.sin(i * PI / 2) * 0.15, IRON, { seg: 5 });
    sph('glow', 0.1, 0, LY - 0.16, 0, 0xffd08a, { seg: 10, segH: 7 });
  });
  anchor('lamp', LX, LY - 0.15, LZ, 0);

  // ===== WORKBENCH (normal) =====
  at(-2.6, 0, -4.3, 0, () => {
    box('wood', 2.5, 0.14, 1.04, 0, 0.93, 0, WOODL, { rad: 0.03 });
    for (const z of [-0.26, 0.03, 0.3]) box('wood', 2.46, 0.01, 0.012, 0, 1.002, z, 0x2e1d10, { rad: 0.002 });
    box('wood', 0.5, 0.012, 0.4, 0.5, 1.003, 0.1, 0x2a1a10, { r: [0, 0.3, 0], rad: 0.003 });   // scorch mark
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('wood', 0.15, 0.88, 0.15, sx * 1.12, 0.44, sz * 0.4, WOOD, { rad: 0.03 });
    for (const sz of [-1, 1]) box('wood', 2.2, 0.09, 0.07, 0, 0.3, sz * 0.4, WOODD, { rad: 0.015 });
    for (const sx of [-1, 1]) box('wood', 0.07, 0.09, 0.8, sx * 1.12, 0.3, 0, WOODD, { rad: 0.015 });
    box('wood', 2.2, 0.06, 0.84, 0, 0.36, 0, WOOD, { rad: 0.015 });
    // under-shelf junk
    cyl('wood', 0.2, 0.22, 0.34, -0.7, 0.56, 0.05, WOODD, { seg: 12 }); tor('metal', 0.215, 0.015, -0.7, 0.66, 0.05, IRON, { r: [PI / 2, 0, 0], seg: 12 }); box('wood', 0.55, 0.3, 0.4, 0.4, 0.54, 0.0, WOOD, { r: [0, 0.1, 0] });
    sph('cloth', 0.22, 0.95, 0.5, 0.08, 0xa0865a, { s: [1, 0.85, 1], seg: 10 });
    // pegboard + tools
    box('wood', 2.5, 1.0, 0.05, 0, 1.78, -0.49, 0x5e4228, { rad: 0.012 });
    for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) if (rnd() < 0.5) cyl('wood', 0.012, 0.012, 0.01, -1.05 + i * 0.26, 1.45 + j * 0.25, -0.46, 0x1d130a, { r: [PI / 2, 0, 0], seg: 5 });
    const hang = (x, y) => { cyl('metal', 0.012, 0.012, 0.07, x, y, -0.44, IRONL, { r: [PI / 2, 0, 0], seg: 5 }); };
    hang(-0.95, 2.05); box('wood', 0.045, 0.5, 0.045, -0.95, 1.8, -0.44, WOODL); box('metal', 0.22, 0.1, 0.07, -0.95, 2.06, -0.44, IRON, { rad: 0.02 }); box('metal', 0.07, 0.1, 0.06, -0.82, 2.06, -0.44, IRONL);   // hammer
    hang(-0.4, 2.1); box('metal', 0.5, 0.1, 0.012, -0.4, 1.86, -0.45, IRONL, { r: [0, 0, 0.05], rad: 0.004 }); box('wood', 0.14, 0.08, 0.04, -0.62, 2.08, -0.44, WOOD); for (let i = 0; i < 10; i++) box('metal', 0.02, 0.025, 0.012, -0.2 - i * 0.045, 1.8, -0.45, IRONL, { r: [0, 0, 0.8], rad: 0.002 });   // saw
    hang(0.15, 2.05); box('metal', 0.04, 0.55, 0.03, 0.12, 1.78, -0.44, IRON, { r: [0, 0, 0.12] }); box('metal', 0.04, 0.55, 0.03, 0.2, 1.78, -0.44, IRON, { r: [0, 0, -0.12] });   // tongs
    hang(0.7, 2.0); tor('cloth', 0.15, 0.025, 0.7, 1.8, -0.44, 0xb89a62, { seg: 14 }); tor('cloth', 0.15, 0.025, 0.7, 1.8, -0.41, 0xa88a52, { seg: 14 }); tor('cloth', 0.15, 0.025, 0.7, 1.8, -0.38, 0xb89a62, { seg: 14 });   // rope coil
    hang(1.1, 2.0); box('wood', 0.06, 0.4, 0.03, 1.1, 1.78, -0.44, WOODL); box('wood', 0.2, 0.14, 0.14, 1.1, 2.0, -0.4, WOOD, { rad: 0.03 });   // mallet
    box('cloth', 0.34, 0.24, 0.01, 0.4, 1.35, -0.455, 0xd8c8a0, { r: [0, 0, 0.06], rad: 0.002 }); box('cloth', 0.26, 0.2, 0.01, -1.1, 1.38, -0.455, 0xcdbb94, { r: [0, 0, -0.1], rad: 0.002 });   // pinned plans
    cyl('metal', 0.012, 0.012, 0.03, 0.4, 1.46, -0.445, 0xd05030, { r: [PI / 2, 0, 0], seg: 5 });
    // vise on the right end
    box('metal', 0.26, 0.2, 0.2, 1.05, 1.1, 0.34, IRON, { rad: 0.025 }); box('metal', 0.1, 0.2, 0.1, 1.05, 1.12, 0.52, IRONL, { rad: 0.02 }); cyl('metal', 0.018, 0.018, 0.3, 1.05, 1.12, 0.66, IRONL, { r: [PI / 2, 0, 0], seg: 8 }); cyl('metal', 0.012, 0.012, 0.22, 1.05, 1.12, 0.8, IRONL, { r: [0, 0, PI / 2], seg: 6 });
    // small anvil on the left end
    box('metal', 0.34, 0.1, 0.22, -0.95, 1.06, 0.1, IRON, { rad: 0.03 }); box('metal', 0.14, 0.14, 0.14, -0.95, 1.15, 0.1, IRON, { rad: 0.02 }); box('metal', 0.5, 0.1, 0.24, -0.95, 1.27, 0.1, IRONL, { rad: 0.03 }); cyl('metal', 0.0, 0.06, 0.2, -1.28, 1.27, 0.1, IRONL, { r: [0, 0, PI / 2], seg: 8 });
    // clutter: gears, screws, a mug, a candle stub with a flame, a half-built thing
    for (const [x, z, s] of [[-0.2, 0.2, 1], [-0.05, 0.28, 0.7]]) { cyl('brass', 0.1 * s, 0.1 * s, 0.03, x, 1.025, z, 0xb8893e, { seg: 10 }); for (let k = 0; k < 8; k++) box('brass', 0.035 * s, 0.03, 0.03 * s, x + Math.cos(k * PI / 4) * 0.11 * s, 1.025, z + Math.sin(k * PI / 4) * 0.11 * s, 0xb8893e, { r: [0, -k * PI / 4, 0], rad: 0.004 }); }
    for (let i = 0; i < 7; i++) cyl('metal', 0.008, 0.008, 0.05, 0.1 + rnd() * 0.5, 1.012, 0.3 + rnd() * 0.15, IRONL, { r: [PI / 2, rnd() * 3, 0], seg: 5 });
    lathe('ceramic', [[0.001, 0], [0.05, 0], [0.06, 0.02], [0.065, 0.11], [0.058, 0.11], [0.05, 0.02], [0.001, 0.02]], 0.72, 1.003, -0.2, 0x8a6a4a, { seg: 10 }); tor('ceramic', 0.03, 0.01, 0.78, 1.06, -0.2, 0x8a6a4a, { seg: 8 });
    cyl('cloth', 0.035, 0.04, 0.12, 0.35, 1.07, -0.28, 0xe2d6b4, { seg: 8 }); sph('glow', 0.02, 0.35, 1.15, -0.28, 0xffc060, { s: [1, 1.7, 1], seg: 6, segH: 4 });
    box('wood', 0.5, 0.05, 0.3, -0.1, 1.02, -0.18, WOODD, { r: [0, 0.2, 0] }); box('metal', 0.34, 0.04, 0.2, -0.1, 1.07, -0.18, IRONL, { r: [0, 0.2, 0], rad: 0.01 }); box('metal', 0.12, 0.1, 0.12, -0.1, 1.13, -0.18, IRON, { r: [0, 0.2, 0] });   // half-made thing on a board
    // brass scales hanging off the front edge are skipped on purpose (fewer, better things)
  });
  solid(-2.6, -4.3, 1.3, 0.6); anchor('bench', -2.6, 1.0, -3.35, 0);

  // ===== RECYCLER (50% home type: crude, patched, smoking vent) =====
  const RX = 0.95, RZ = -4.0;
  const smokeOrigin = new THREE.Vector3();
  at(RX, 0, RZ, 0, () => {
    box('stone', 1.6, 0.2, 1.4, 0, 0.1, 0, STONE, { rad: 0.04 });
    lathe('metal', [[0.001, 0.2], [0.6, 0.2], [0.7, 0.32], [0.74, 0.8], [0.7, 1.25], [0.58, 1.5], [0.46, 1.58], [0.001, 1.58]], 0, 0, 0, IRONR, { seg: 20 });   // squat riveted drum
    for (const y of [0.42, 0.9, 1.3]) tor('metal', y < 1.1 ? 0.72 : 0.62, 0.025, 0, y, 0, y > 1 ? 0x545a60 : 0x4a4f55, { r: [PI / 2, 0, 0], seg: 22 });
    for (let k = 0; k < 20; k++) { const a = k * PI / 10 + 0.1; for (const y of [0.42, 0.9]) sph('metal', 0.022, Math.cos(a) * 0.735, y + 0.03, Math.sin(a) * 0.735, IRONL, { seg: 5, segH: 4 }); }
    // mismatched patch plates
    for (const [a, y, w, h, c] of [[0.9, 0.62, 0.42, 0.3, 0x8c6a3c], [2.2, 0.95, 0.34, 0.4, 0x55606a], [3.6, 0.55, 0.4, 0.28, 0x7a4a36], [5.3, 1.05, 0.46, 0.3, 0x6c7a62], [4.5, 0.85, 0.3, 0.3, 0x90805a]]) {
      const rr = 0.74 - (y - 0.8) * 0.06; at(Math.cos(a) * rr, y, Math.sin(a) * rr, -a + PI / 2, () => { box('metal', w, h, 0.04, 0, 0, 0.0, c, { r: [0, 0, (rnd() - 0.5) * 0.2], rad: 0.01 }); for (const sx of [-1, 1]) for (const sy of [-1, 1]) sph('metal', 0.018, sx * (w / 2 - 0.04), sy * (h / 2 - 0.04), 0.03, IRONL, { seg: 5, segH: 4 }); });
    }
    // hopper on top
    lathe('metal', [[0.18, 1.55], [0.3, 1.7], [0.58, 2.05], [0.62, 2.1], [0.58, 2.1], [0.26, 1.7], [0.15, 1.55]], 0, 0, 0, 0x5c6168, { seg: 16 });
    for (let k = 0; k < 4; k++) box('metal', 0.04, 0.5, 0.04, Math.cos(k * PI / 2 + 0.8) * 0.45, 1.78, Math.sin(k * PI / 2 + 0.8) * 0.45, 0x4a4f55, { r: [Math.sin(k * PI / 2 + 0.8) * 0.5, 0, -Math.cos(k * PI / 2 + 0.8) * 0.5] });
    // furnace mouth on the front, door ajar, glowing slot
    box('metal', 0.62, 0.5, 0.1, 0, 0.55, 0.72, 0x3c4046, { rad: 0.03 }); box('glow', 0.44, 0.14, 0.02, 0, 0.5, 0.78, 0xff7a24, { rad: 0.004 }); box('metal', 0.6, 0.5, 0.05, 0.42, 0.55, 0.9, 0x5a4a3c, { r: [0, 0.9, 0], rad: 0.015 });
    box('metal', 0.5, 0.04, 0.5, 0, 0.26, 0.98, IRON, { r: [0.25, 0, 0], rad: 0.01 });   // output tray
    // side gear + crank
    cyl('metal', 0.22, 0.22, 0.06, 0.82, 1.1, 0.1, 0x6f7479, { r: [0, 0, PI / 2], seg: 12 }); for (let k = 0; k < 10; k++) box('metal', 0.05, 0.07, 0.05, 0.84, 1.1 + Math.cos(k * PI / 5) * 0.24, 0.1 + Math.sin(k * PI / 5) * 0.24, 0x6f7479, { r: [-k * PI / 5, 0, 0], rad: 0.005 });
    cyl('metal', 0.02, 0.02, 0.2, 0.9, 1.1, 0.1, IRONL, { r: [0, 0, PI / 2], seg: 6 }); box('metal', 0.03, 0.03, 0.24, 1.0, 1.1, 0.2, IRONL, { r: [0.3, 0, 0] }); cyl('wood', 0.025, 0.025, 0.1, 1.0, 1.04, 0.31, WOOD, { seg: 6 });
    // crooked vent pipe at the back with a tape patch, the smoke source
    cyl('metal', 0.1, 0.1, 0.7, -0.3, 1.9, -0.45, 0x585d63, { seg: 10 }); cyl('metal', 0.1, 0.1, 0.6, -0.12, 2.45, -0.45, 0x5a5e64, { r: [0, 0, -0.45], seg: 10 }); sph('metal', 0.1, -0.3, 2.22, -0.45, 0x585d63, { seg: 8, segH: 6 });
    cyl('metal', 0.13, 0.1, 0.1, 0.06, 2.72, -0.45, 0x4a4f55, { seg: 10 }); cyl('cloth', 0.108, 0.108, 0.14, -0.3, 1.75, -0.45, 0x8a8f78, { seg: 10 });
    cyl('metal', 0.07, 0.1, 0.5, -0.3, 1.3, -0.52, 0x585d63, { seg: 8 });
    smokeOrigin.set(RX + 0.06, 2.82, RZ - 0.45);
    // plaque: "RECYCLER 50%"
    box('wood', 0.5, 0.2, 0.03, -0.45, 0.88, 0.7, WOODL, { r: [0, 0.25, 0.05], rad: 0.008 });
  });
  { const c = document.createElement('canvas'); c.width = 256; c.height = 100; const g = c.getContext('2d'); g.fillStyle = '#2a1a0c'; g.font = 'bold 30px Georgia,serif'; g.textAlign = 'center'; g.fillText('RECYCLER', 128, 42); g.font = 'bold 36px Georgia,serif'; g.fillStyle = '#7a1c14'; g.fillText('50%', 128, 84);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.18), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 })); m.name = 'recyclerPlaque';
    m.position.set(RX - 0.45 + 0.0, 0.88, RZ + 0.7 + 0.03); m.rotation.set(0.0, 0.25, 0.05); m.translateZ(0.02); group.add(m); }
  solid(RX, RZ, 0.85, 0.75); anchor('recycler', RX, 1.0, RZ + 1.15, 0);

  // ===== ELIXIR PUMP (east wall, front faces -x) =====
  const PX = HALF - 0.75, PZ = -1.9, TANK_H = 1.5, TANK_R = 0.36, TANK_Y = 0.55;
  at(PX, 0, PZ, -PI / 2, () => {
    box('stone', 1.4, 0.22, 1.1, 0, 0.11, 0, STONE, { rad: 0.05 }); box('stone', 1.1, 0.12, 0.8, 0, 0.28, 0, 0x7d796f, { rad: 0.04 });
    lathe('brass', [[0.001, 0.34], [0.46, 0.34], [0.46, 0.44], [0.4, 0.5], [0.001, 0.5]], 0, 0, 0, 0xb98d40, { seg: 20 });   // bottom flange
    lathe('brass', [[0.001, TANK_Y + TANK_H], [0.4, TANK_Y + TANK_H], [0.46, TANK_Y + TANK_H + 0.08], [0.46, TANK_Y + TANK_H + 0.18], [0.3, TANK_Y + TANK_H + 0.26], [0.001, TANK_Y + TANK_H + 0.26]], 0, 0, 0, 0xc29646, { seg: 20 });   // top cap
    for (let k = 0; k < 4; k++) { const a = k * PI / 2 + PI / 4; cyl('brass', 0.022, 0.022, TANK_H + 0.1, Math.cos(a) * 0.43, TANK_Y + TANK_H / 2 + 0.02, Math.sin(a) * 0.43, 0xa57a35, { seg: 6 }); sph('brass', 0.04, Math.cos(a) * 0.43, TANK_Y + TANK_H + 0.12, Math.sin(a) * 0.43, 0xd8ae58, { seg: 6, segH: 4 }); }
    // graduated plate on the front with ticks
    box('brass', 0.03, TANK_H - 0.1, 0.14, 0.47, TANK_Y + TANK_H / 2, 0, 0x8a6a34, { rad: 0.008 });
    for (let i = 0; i <= 10; i++) box('metal', 0.01, 0.012, i % 5 ? 0.06 : 0.1, 0.49, TANK_Y + 0.08 + i * (TANK_H - 0.26) / 10, 0, 0x1c140c, { rad: 0.002 });
    // top pipe to the wall + valve wheel, plus lower feed
    cyl('brass', 0.07, 0.07, 1.0, 0, TANK_Y + TANK_H + 0.42, -0.35, 0xb08a42, { r: [PI / 2, 0, 0], seg: 10 }); cyl('brass', 0.07, 0.07, 0.34, 0, TANK_Y + TANK_H + 0.3, -0.12, 0xb08a42, { seg: 10 }); sph('brass', 0.09, 0, TANK_Y + TANK_H + 0.42, -0.12, 0xc29646, { seg: 8, segH: 6 });
    tor('metal', 0.1, 0.014, 0, TANK_Y + TANK_H + 0.65, -0.25, 0xa22a20, { r: [PI / 2, 0, 0], seg: 12 }); cyl('metal', 0.012, 0.012, 0.22, 0, TANK_Y + TANK_H + 0.55, -0.25, IRON, { seg: 5 });
    cyl('brass', 0.06, 0.06, 0.7, 0.2, 0.7, -0.4, 0xb08a42, { r: [0, 0, 0.3], seg: 8 }); tor('brass', 0.07, 0.025, 0.5, 0.36, -0.4, 0xb08a42, { r: [PI / 2, 0, 0], seg: 10 });
    // hand pump on the right: post, rocking lever with a wooden grip, spout over a bucket
    box('metal', 0.1, 0.8, 0.1, 0.62, 0.7, 0.0, IRON, { rad: 0.02 }); cyl('metal', 0.04, 0.04, 0.18, 0.62, 1.1, 0.0, IRONL, { r: [0, 0, PI / 2], seg: 8 });
    box('metal', 0.07, 0.07, 0.8, 0.62, 1.12, 0.1, IRON, { r: [0.15, 0, 0], rad: 0.015 }); cyl('wood', 0.035, 0.035, 0.22, 0.62, 1.04, 0.5, WOOD, { seg: 8 });
    tube('brass', [[0.62, 0.6, 0.02], [0.62, 0.5, 0.2], [0.62, 0.4, 0.38], [0.62, 0.3, 0.46]], 0.04, 0xb08a42);
    lathe('metal', [[0.001, 0], [0.13, 0], [0.17, 0.26], [0.16, 0.26], [0.12, 0.02], [0.001, 0.02]], 0.62, 0.0, 0.55, 0x6a6e73, { seg: 12 }); tor('metal', 0.16, 0.012, 0.62, 0.26, 0.55, 0x8a8f94, { r: [PI / 2, 0, 0], seg: 12 });
    // pressure dial on the plinth front
    cyl('ceramic', 0.1, 0.1, 0.03, -0.42, 0.4, 0.43, 0xeee8d8, { r: [PI / 2, 0, 0], seg: 14 }); tor('brass', 0.1, 0.014, -0.42, 0.4, 0.45, 0xb08a42, { seg: 14 }); box('metal', 0.012, 0.07, 0.005, -0.42, 0.42, 0.455, 0xa22a20, { r: [0, 0, -0.7] });
  });
  // dynamic pump parts
  const pumpG = new THREE.Group(); pumpG.position.set(PX, 0, PZ); pumpG.rotation.y = -PI / 2; group.add(pumpG);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfeee8, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  const liqMat = new THREE.MeshStandardMaterial({ color: 0x168a70, emissive: 0x14d6a8, emissiveIntensity: 0.75, roughness: 0.25, transparent: true, opacity: 0.88 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R, TANK_R, TANK_H, 22, 1, true), glassMat); glass.position.y = TANK_Y + TANK_H / 2; glass.renderOrder = 3; pumpG.add(glass);
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(TANK_R - 0.015, TANK_R - 0.015, 1, 22), liqMat); pumpG.add(liq);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.1), new THREE.MeshBasicMaterial({ color: 0xff5a40 })); needle.position.set(0.5, TANK_Y, 0); pumpG.add(needle);
  const BUB = 12, bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xc8fff0, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }), BUB); bubbles.frustumCulled = false; pumpG.add(bubbles);
  const bub = []; for (let i = 0; i < BUB; i++) bub.push({ a: rnd() * 6.28, r: rnd() * (TANK_R - 0.08), ph: rnd(), sp: 0.12 + rnd() * 0.16, s: 0.012 + rnd() * 0.02 });
  const pumpGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: ELIXIR, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pumpGlow.scale.set(2.6, 2.6, 1); pumpGlow.position.set(0, TANK_Y + TANK_H / 2, -0.3); pumpG.add(pumpGlow);
  const pumpPool = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshBasicMaterial({ map: tex.glow, color: ELIXIR, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pumpPool.rotation.x = -PI / 2; pumpPool.position.set(0, 0.03, 0.4); pumpG.add(pumpPool);
  let pumpLevel = 0.5, pumpAlert = false, pumpShown = 0.5;
  solid(PX, PZ, 0.55, 0.7); anchor('pump', PX - 0.9, 1.1, PZ, -PI / 2);   // front looks toward -x

  // ===== ELIXIR SCREEN (east wall, beside the pump) =====
  const SX = HALF - 0.1, SZ = 0.6, SY = 1.65;
  at(SX, 0, SZ, -PI / 2, () => {
    box('metal', 1.2, 0.95, 0.4, 0, SY, 0.1, 0x4d5258, { rad: 0.07 });   // chunky casing
    box('metal', 1.0, 0.76, 0.06, 0, SY, 0.32, 0x2a2d31, { rad: 0.03 }); box('metal', 0.9, 0.5, 0.3, 0, SY, -0.05, 0x44484e, { rad: 0.05 });
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) sph('metal', 0.024, sx * 0.55, SY + sy * 0.4, 0.32, IRONL, { seg: 6, segH: 4 });
    box('metal', 1.1, 0.06, 0.5, 0, 1.08, 0.18, 0x3c4045, { rad: 0.02 }); for (const sx of [-1, 1]) box('metal', 0.05, 0.4, 0.05, sx * 0.4, 0.86, -0.02, IRON, { r: [-0.5, 0, 0] });   // desk shelf + struts
    for (let r2 = 0; r2 < 2; r2++) for (let i = 0; i < 9; i++) box('metal', 0.07, 0.025, 0.07, -0.38 + i * 0.095, 1.125 + r2 * 0.02, 0.1 + r2 * 0.09, i % 4 === 0 ? 0x8c8f72 : 0x5c6066, { r: [r2 * -0.1, 0, 0], rad: 0.008 });
    box('metal', 0.1, 0.05, 0.03, 0.0, SY - 0.46, 0.34, 0x2a2d31); sph('glow', 0.016, -0.42, SY - 0.46, 0.35, 0x3cff9a, { seg: 6, segH: 4 }); sph('glow', 0.016, -0.36, SY - 0.46, 0.35, 0xffb030, { seg: 6, segH: 4 });
    tube('metal', [[0.3, SY - 0.2, -0.05], [0.42, 1.3, -0.07], [0.46, 0.6, -0.07], [0.46, 0.03, -0.06]], 0.022, 0x24262a);
    // little brass plate above: ELIXIR
    box('brass', 0.5, 0.08, 0.03, 0, SY + 0.58, -0.06, 0x9a7a3a, { rad: 0.01 });
  });
  solid(SX - 0.1, SZ, 0.3, 0.65); anchor('screen', SX - 1.0, 1.55, SZ, -PI / 2);
  // the glowing face (canvas, emissive)
  const scrCv = document.createElement('canvas'); scrCv.width = 256; scrCv.height = 192; const scrTex = new THREE.CanvasTexture(scrCv); scrTex.colorSpace = THREE.SRGBColorSpace;
  let scrOn = true, scrT = 0;
  const drawScreen = () => {
    const g = scrCv.getContext('2d'); g.fillStyle = '#041a16'; g.fillRect(0, 0, 256, 192);
    if (scrOn) {
      g.fillStyle = '#0b3a30'; g.fillRect(0, 0, 256, 26); g.fillStyle = '#7dffd8'; g.font = 'bold 15px monospace'; g.textBaseline = 'middle'; g.fillText('ELIXIR SCREEN', 10, 14); g.fillStyle = '#ffd36a'; g.fillText('●', 228, 14);
      ['BASE', 'SECURITY', 'SEND'].forEach((t, i) => { const x = 8 + i * 80; g.fillStyle = i === 0 ? '#17806a' : '#0c3a31'; g.fillRect(x, 32, 74, 18); g.fillStyle = i === 0 ? '#eafff8' : '#55b9a2'; g.font = 'bold 11px monospace'; g.fillText(t, x + 8, 42); });
      const rows = [['Pump', 2, 3], ['Workbench', 1, 2], ['Recycler', 1, 3], ['Lockbox', 0, 3], ['Distill', 0, 1]];
      rows.forEach((r, i) => { const y = 60 + i * 24; g.fillStyle = 'rgba(40,200,160,0.1)'; g.fillRect(6, y, 244, 20); g.fillStyle = '#b8ffe9'; g.font = '12px monospace'; g.fillText(r[0], 12, y + 10); for (let p = 0; p < r[2]; p++) { g.fillStyle = p < r[1] ? '#39f2c4' : '#0f4a3e'; g.fillRect(104 + p * 16, y + 5, 12, 10); } g.fillStyle = '#17806a'; g.fillRect(196, y + 3, 48, 14); g.fillStyle = '#eafff8'; g.font = 'bold 10px monospace'; g.fillText(i % 2 ? 'BUY 40' : 'BUY 20', 202, y + 10); });
      g.fillStyle = '#39f2c4'; g.font = 'bold 12px monospace'; g.fillText('◆ 48 ELIXIR', 10, 182);
      g.fillStyle = 'rgba(0,0,0,0.22)'; for (let y = 0; y < 192; y += 3) g.fillRect(0, y, 256, 1);
    } else { g.fillStyle = 'rgba(120,180,170,0.05)'; g.fillRect(20, 20, 60, 140); }
    scrTex.needsUpdate = true;
  };
  drawScreen();
  const scrMat = new THREE.MeshStandardMaterial({ color: 0x0a1a16, map: scrTex, emissive: 0xffffff, emissiveMap: scrTex, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0 });
  const scrMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.69), scrMat); scrMesh.name = 'elixirScreenFace';
  { const p = new THREE.Object3D(); p.position.set(SX, SY, SZ); p.rotation.y = -PI / 2; p.translateZ(0.36); scrMesh.position.copy(p.position); scrMesh.rotation.copy(p.rotation); group.add(scrMesh); }
  const scrGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: ELIXIR, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); scrGlow.scale.set(2.2, 1.8, 1); scrGlow.position.set(SX - 0.8, SY, SZ); group.add(scrGlow);

  // ===== LOCKBOX (iron-bound chest) =====
  const LBX = HALF - 0.8, LBZ = 3.5;
  at(LBX, 0, LBZ, -PI / 2 - 0.12, () => {
    box('wood', 0.95, 0.5, 0.6, 0, 0.3, 0, WOOD, { rad: 0.035 }); put('wood', new THREE.CylinderGeometry(0.31, 0.31, 0.93, 14, 1, false, 0, PI), WOODL, { p: [0, 0.55, 0], r: [0, 0, PI / 2] });
    for (const x of [-0.35, 0, 0.35]) { box('metal', 0.07, 0.52, 0.64, x, 0.3, 0, IRON, { rad: 0.012 }); put('metal', new THREE.CylinderGeometry(0.325, 0.325, 0.07, 14, 1, false, 0, PI), IRON, { p: [x, 0.55, 0], r: [0, 0, PI / 2] }); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box('metal', 0.1, 0.12, 0.1, sx * 0.44, 0.1, sz * 0.26, 0x55595f, { rad: 0.02 }); box('wood', 0.1, 0.1, 0.1, sx * 0.42, 0.05, sz * 0.24, WOODD); }
    box('brass', 0.2, 0.22, 0.04, 0, 0.5, 0.33, 0xc29646, { rad: 0.012 }); box('metal', 0.014, 0.05, 0.01, 0, 0.5, 0.356, 0x15110c); box('metal', 0.08, 0.1, 0.05, 0.0, 0.4, 0.37, 0xc29646, { rad: 0.015 }); tor('metal', 0.035, 0.01, 0, 0.47, 0.37, IRONL, { seg: 8 });
    for (const sx of [-1, 1]) for (const sy of [0.2, 0.45]) sph('metal', 0.016, sx * 0.43, sy, 0.31, IRONL, { seg: 5, segH: 4 });
  });
  solid(LBX, LBZ, 0.45, 0.55); anchor('lockbox', LBX - 0.9, 0.6, LBZ, -PI / 2);

  // ===== SHELVES (west wall) with jars, bottles, books, a skull, an elixir bottle =====
  at(-HALF + 0.3, 0, -1.2, PI / 2, () => {
    for (const sx of [-1, 1]) box('wood', 0.1, 2.7, 0.4, sx * 1.55, 1.35, 0, WOODD, { rad: 0.02 });
    const jarCols = [0x8a7a58, 0x6a8a68, 0x8a5a4a, 0x607890, 0x9a8f78];
    for (let s = 0; s < 4; s++) {
      const y = 0.42 + s * 0.68; box('wood', 3.2, 0.06, 0.4, 0, y, 0, WOOD, { rad: 0.015 }); box('wood', 3.2, 0.04, 0.03, 0, y - 0.07, 0.19, WOODD);
      let x = -1.4; while (x < 1.35) {
        const t = rnd(), w = 0.12 + rnd() * 0.1;
        if (t < 0.28) { const h = 0.2 + rnd() * 0.14; lathe('ceramic', [[0.001, 0], [w * 0.8, 0], [w, h * 0.3], [w * 0.95, h * 0.85], [w * 0.55, h], [w * 0.55, h + 0.03], [0.001, h + 0.03]], x, y + 0.03, 0, jarCols[(rnd() * 5) | 0], { seg: 10 }); }
        else if (t < 0.5) { let by = y + 0.03; const n = 1 + ((rnd() * 4) | 0); for (let b = 0; b < n; b++) { const h = 0.05 + rnd() * 0.03; box('cloth', 0.26, h, 0.18, x, by + h / 2, 0, [0x7a2a24, 0x2a4a3a, 0x3a3a5a, 0x7a6a3a][(rnd() * 4) | 0], { r: [0, (rnd() - 0.5) * 0.3, 0], rad: 0.006 }); by += h; } }
        else if (t < 0.64) { const h = 0.18 + rnd() * 0.1; cyl('ceramic', 0.045, 0.06, h, x, y + 0.03 + h / 2, 0, [0x4a6a3a, 0x6a3a2a, 0x3a5a6a][(rnd() * 3) | 0], { seg: 8 }); cyl('ceramic', 0.02, 0.03, 0.08, x, y + 0.03 + h + 0.04, 0, 0x4a3a2a, { seg: 8 }); }
        else if (t < 0.8) { box('wood', 0.2 + rnd() * 0.12, 0.14 + rnd() * 0.08, 0.2, x, y + 0.03 + 0.09, 0, WOODL, { r: [0, (rnd() - 0.5) * 0.4, 0] }); }
        else if (t < 0.88) { sph('cloth', 0.12, x, y + 0.15, 0, 0xa28c64, { s: [1, 0.9, 0.9], seg: 8, segH: 6 }); }
        else if (s === 2) { sph('ceramic', 0.075, x, y + 0.11, 0, 0xe0d8c0, { s: [1, 0.95, 1.05], seg: 8, segH: 6 }); box('ceramic', 0.08, 0.05, 0.07, x, y + 0.04, 0.05, 0xdad2b8); sph('glow', 0.014, x - 0.026, y + 0.13, 0.06, 0xff8a40, { seg: 5, segH: 4 }); sph('glow', 0.014, x + 0.026, y + 0.13, 0.06, 0xff8a40, { seg: 5, segH: 4 }); }
        x += w * 2 + 0.06 + rnd() * 0.08;
      }
    }
    // the one elixir bottle (emissive) on the second shelf
    lathe('ceramic', [[0.001, 0], [0.07, 0], [0.075, 0.2], [0.03, 0.3], [0.03, 0.38], [0.001, 0.38]], 1.2, 0.42 + 0.68 + 0.03, 0.02, 0xa8d8cc, { seg: 10 });
    lathe('glow', [[0.001, 0.02], [0.056, 0.02], [0.062, 0.18], [0.001, 0.2]], 1.2, 0.42 + 0.68 + 0.03, 0.02, ELIXIR, { seg: 10 });
    cyl('cloth', 0.035, 0.04, 0.14, -1.45, 0.42 + 2 * 0.68 + 0.1, 0.0, 0xe2d6b4, { seg: 8 }); sph('glow', 0.02, -1.45, 0.42 + 2 * 0.68 + 0.2, 0.0, 0xffc060, { s: [1, 1.7, 1], seg: 6, segH: 4 });
  });
  solid(-HALF + 0.35, -1.2, 0.3, 1.65);

  // ===== WALL HOOKS (west wall near the door side) =====
  at(-HALF + 0.12, 0, 1.55, PI / 2, () => {
    box('wood', 1.5, 0.18, 0.07, 0, 1.95, 0, WOODD, { rad: 0.02 });
    const hooks = [-0.58, -0.2, 0.2, 0.58];
    hooks.forEach(x => { cyl('metal', 0.015, 0.015, 0.1, x, 1.88, 0.08, IRON, { r: [PI / 2, 0, 0], seg: 6 }); sph('metal', 0.022, x, 1.88, 0.14, IRONL, { seg: 6, segH: 4 }); });
    // cloak: tapered cloth with hood
    lathe('cloth', [[0.001, 0], [0.26, 0], [0.22, 0.4], [0.16, 0.9], [0.001, 0.95]], -0.58, 0.95, 0.2, 0x7a2a26, { seg: 8, s: [1, 1, 0.35] }); sph('cloth', 0.12, -0.58, 1.88, 0.18, 0x6a2420, { s: [1, 0.8, 0.8], seg: 8, segH: 6 });
    // rope coil, lantern (unlit), frying pan
    for (let i = 0; i < 3; i++) tor('cloth', 0.16, 0.03, -0.2, 1.66 - i * 0.0, 0.2 + i * 0.05, 0xb89a62, { seg: 14 });
    cyl('metal', 0.1, 0.1, 0.03, 0.2, 1.58, 0.2, 0x3a3d42, { r: [PI / 2, 0, 0], seg: 14 }); box('metal', 0.05, 0.3, 0.025, 0.2, 1.85, 0.2, 0x3a3d42, { rad: 0.008 });
    box('metal', 0.14, 0.16, 0.14, 0.58, 1.6, 0.2, 0x5c4a38, { rad: 0.02 }); tor('metal', 0.06, 0.01, 0.58, 1.74, 0.2, IRONL, { r: [PI / 2, 0, 0], seg: 8 }); sph('ceramic', 0.04, 0.58, 1.6, 0.2, 0xd8c8a0, { seg: 6, segH: 4 });
    // key ring on the spare hook
  });

  // ===== BEDROLL on a low pallet (SW corner) =====
  at(-HALF + 1.15, 0, 3.0, 0.06, () => {
    for (let i = 0; i < 4; i++) box('wood', 0.9, 0.05, 0.3, 0, 0.05, -0.8 + i * 0.5, WOOD, { rad: 0.01 });
    for (const x of [-0.38, 0, 0.38]) box('wood', 0.07, 0.07, 2.0, x, 0.0 + 0.03, 0, WOODD);
    box('cloth', 0.84, 0.15, 1.9, 0, 0.15, 0, 0x8a6e4e, { rad: 0.07 });   // straw mattress
    box('cloth', 0.88, 0.07, 1.2, 0, 0.26, 0.35, 0x7a4a3a, { r: [0, 0.03, 0], rad: 0.03 });   // blanket
    box('cloth', 0.34, 0.01, 0.3, 0.2, 0.3, 0.55, 0x4f6a5a, { rad: 0.003 }); box('cloth', 0.25, 0.01, 0.28, -0.22, 0.3, 0.1, 0xb8a060, { rad: 0.003 });   // patches
    cyl('cloth', 0.085, 0.085, 0.8, 0, 0.3, -0.28, 0x6e4034, { r: [0, 0, PI / 2], seg: 10 });   // fold at the head end
    box('cloth', 0.5, 0.13, 0.32, 0.0, 0.3, -0.7, 0xb9ab8c, { r: [0, 0.1, 0], rad: 0.06 });   // pillow
    cyl('cloth', 0.13, 0.13, 0.5, 0.16, 0.2, 1.25, 0x8a7a5a, { r: [0, 0, PI / 2], seg: 10 });   // rolled spare blanket
    // stool + candle + cup
    cyl('wood', 0.17, 0.17, 0.05, 0.9, 0.46, -0.7, WOODL, { seg: 12 }); for (let k = 0; k < 3; k++) cyl('wood', 0.02, 0.025, 0.46, 0.9 + Math.cos(k * 2.1) * 0.11, 0.23, -0.7 + Math.sin(k * 2.1) * 0.11, WOOD, { seg: 5 });
    cyl('cloth', 0.035, 0.04, 0.1, 0.9, 0.54, -0.7, 0xe2d6b4, { seg: 8 }); sph('glow', 0.02, 0.9, 0.62, -0.7, 0xffc060, { s: [1, 1.7, 1], seg: 6, segH: 4 });
  });
  solid(-HALF + 1.15, 3.0, 0.55, 1.05);

  // ===== crates, sacks, barrels (near the door-right and corners) =====
  const barrel = (x, z, h) => at(x, 0, z, rnd() * 3, () => { lathe('wood', [[0.001, 0], [0.26, 0], [0.31, h * 0.3], [0.33, h * 0.5], [0.31, h * 0.75], [0.26, h], [0.001, h]], 0, 0, 0, WOOD, { seg: 14 }); for (const f of [0.14, 0.4, 0.62, 0.88]) tor('metal', 0.3 + 0.05 * Math.sin(f * PI) * 0.7, 0.014, 0, h * f, 0, 0x5a5e64, { r: [PI / 2, 0, 0], seg: 14 }); });
  barrel(HALF - 1.0, 4.2, 0.82); barrel(HALF - 1.7, 4.45, 0.78); solid(HALF - 1.35, 4.3, 0.7, 0.4);
  at(-HALF + 0.75, 0, -HALF + 0.75, 0.25, () => { box('wood', 0.8, 0.7, 0.8, 0, 0.35, 0, WOOD, { rad: 0.03 }); for (const y of [0.1, 0.6]) box('wood', 0.84, 0.07, 0.84, 0, y, 0, WOODD, { rad: 0.015 }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('wood', 0.08, 0.74, 0.08, sx * 0.38, 0.37, sz * 0.38, WOODD); box('wood', 0.6, 0.5, 0.6, 0.05, 0.95, 0.0, WOODL, { r: [0, 0.4, 0], rad: 0.03 }); box('metal', 0.1, 0.06, 0.02, 0.05, 1.0, 0.3, IRON); });
  solid(-HALF + 0.75, -HALF + 0.75, 0.55, 0.55);
  at(HALF - 0.55, 0, 1.9, 0.5, () => { for (const [dx, dz, s] of [[0, 0, 1], [0.38, 0.1, 0.85]]) lathe('cloth', [[0.001, 0], [0.26 * s, 0], [0.32 * s, 0.2 * s], [0.26 * s, 0.5 * s], [0.12 * s, 0.68 * s], [0.07 * s, 0.76 * s], [0.12 * s, 0.82 * s], [0.001, 0.82 * s]], dx, 0, dz, 0x8a7650, { seg: 10, s: [1, 1, 0.9] }); });

  // ===== floor dressing: rug, bucket, scattered bits =====
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshStandardMaterial({ map: tex.rug, color: 0x8c7c70, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  rug.rotation.x = -PI / 2; rug.rotation.z = 0.1; rug.scale.set(2.1, 1.5, 1); rug.position.set(0.2, 0.03, 0.9); group.add(rug);
  at(-1.9, 0, 0.3, 0, () => { lathe('metal', [[0.001, 0], [0.14, 0], [0.19, 0.3], [0.17, 0.3], [0.12, 0.02], [0.001, 0.02]], 0, 0, 0, 0x6a6e73, { seg: 12 }); tor('metal', 0.18, 0.012, 0, 0.3, 0, IRONL, { r: [PI / 2, 0, 0], seg: 12 }); });
  at(1.3, 0, 2.6, 0, () => { for (let i = 0; i < 6; i++) cyl('metal', 0.02, 0.02, 0.13, (rnd() - 0.5) * 0.7, 0.025, (rnd() - 0.5) * 0.4, [0xc9a24a, 0x9aa0a6, 0xb98d40][i % 3], { r: [PI / 2, 0, 0], seg: 8 }); });   // dropped coins/washers
  { // scratched tally marks and a crude crown on the west wall above the bedroll (decal)
    const c = document.createElement('canvas'); c.width = 256; c.height = 160; const g = c.getContext('2d'); g.strokeStyle = 'rgba(50,34,22,0.75)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) { const x0 = 18 + k * 34; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(x0 + i * 6, 76); g.lineTo(x0 + i * 6 + (rnd() - 0.5) * 4, 112 + rnd() * 4); g.stroke(); } g.beginPath(); g.moveTo(x0 - 4, 114); g.lineTo(x0 + 24, 80); g.stroke(); }
    g.beginPath(); g.moveTo(150, 60); g.lineTo(160, 22); g.lineTo(182, 46); g.lineTo(204, 18); g.lineTo(226, 46); g.lineTo(240, 24); g.lineTo(244, 62); g.closePath(); g.stroke(); for (const [x, y] of [[160, 22], [204, 18], [240, 24]]) { g.beginPath(); g.arc(x, y - 4, 4, 0, 6.3); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.69), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(-HALF + 0.045, 1.75, 3.0); m.rotation.y = PI / 2; m.name = 'tallyDecal'; group.add(m);
  }
  anchor('map', 2.9, 2.0, -HALF + 0.05, 0);   // empty wall spot for the shared wall map

  // ---------- hidden upgrades ----------
  upg.lock = sub('lock', () => {
    for (const sx of [-1, 1]) for (const y of [0.85, 1.55, 2.25]) box('metal', 0.1, 0.18, 0.2, sx * (DW / 2 - 0.05), y, doorZ - 0.28, IRON, { rad: 0.015 });
    // L1 timber bar
    box('wood', DW + 0.05, 0.2, 0.16, 0, 1.55, doorZ - 0.28, WOOD, { rad: 0.03 }); for (const sx of [-1, 1]) box('metal', 0.14, 0.24, 0.2, sx * (DW / 2 - 0.1), 1.55, doorZ - 0.28, IRON, { rad: 0.02 });
  });
  const lock2 = sub('lock2', () => {
    for (const y of [0.85, 2.25]) { box('metal', DW + 0.05, 0.12, 0.14, 0, y, doorZ - 0.28, 0x575c62, { rad: 0.03 }); for (const sx of [-1, 1]) sph('metal', 0.035, sx * (DW / 2 - 0.2), y, doorZ - 0.2, IRONL, { seg: 6, segH: 4 }); }
    box('metal', 0.16, 2.0, 0.1, 0, 1.55, doorZ - 0.2, 0x4a4f55, { rad: 0.02 });
    box('metal', 0.24, 0.26, 0.1, 0, 1.55, doorZ - 0.24, 0xc29646, { rad: 0.025 }); tor('metal', 0.08, 0.02, 0, 1.73, doorZ - 0.24, IRONL, { seg: 10 }); box('metal', 0.02, 0.07, 0.02, 0, 1.52, doorZ - 0.3, 0x15110c);
  });
  group.add(upg.lock); upg.lock2 = lock2; group.add(lock2);
  const bellPivot = new THREE.Group(), bellArm = sub('alarm', () => {
    box('metal', 0.1, 0.1, 0.9, 0, DH + 0.6, HALF - 0.55, IRON, { rad: 0.02 }); box('metal', 0.6, 0.16, 0.05, 0, DH + 0.65, HALF - 0.1, IRON, { rad: 0.02 }); box('metal', 0.06, 0.4, 0.06, 0, DH + 0.45, HALF - 0.45, IRONL, { r: [0.5, 0, 0] });
  });
  bellPivot.position.set(0, DH + 0.55, HALF - 0.95); upg.alarm.add(bellArm);
  const bell = sub('bell', () => {
    at(0, 0, 0, 0, () => { lathe('brass', [[0.001, -0.3], [0.04, -0.28], [0.09, -0.18], [0.15, -0.06], [0.2, 0.0], [0.19, 0.02], [0.14, -0.04], [0.08, -0.15], [0.001, -0.24]], 0, 0, 0, 0xd8b04e, { seg: 14 }); sph('metal', 0.04, 0, -0.01, 0, IRON, { seg: 6, segH: 4 }); cyl('metal', 0.012, 0.012, 0.25, 0, -0.14, 0, IRON, { seg: 5 }); });
  });
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.5, roughness: 0.5 })); clapper.position.set(0, -0.3, 0);
  bellPivot.add(bell, clapper); bell.position.y = 0.0; upg.alarm.add(bellPivot);
  { const rope = sub('rope', () => { tube('cloth', [[0.0, DH + 0.5, HALF - 0.9], [0.05, DH, HALF - 0.9], [0.08, DH - 0.7, HALF - 0.85]], 0.012, 0x9a845a); sph('wood', 0.04, 0.08, DH - 0.72, HALF - 0.85, WOODL, { seg: 6, segH: 4 }); }); upg.alarm.add(rope); }
  // sentry: swivel post + crossbow, mounted high on the back wall between bench and recycler
  const SENX = -0.7, SENY = 2.75, SENZ = -HALF + 0.25;
  const sentryYaw = new THREE.Group(); sentryYaw.position.set(SENX, SENY, SENZ + 0.15);
  upg.sentry.add(sub('sentryMount', () => { box('metal', 0.5, 0.5, 0.06, SENX, SENY - 0.05, -HALF + 0.07, 0x4d5258, { rad: 0.02 }); for (const sx of [-1, 1]) for (const sy of [-1, 1]) sph('metal', 0.02, SENX + sx * 0.2, SENY - 0.05 + sy * 0.2, -HALF + 0.11, IRONL, { seg: 5, segH: 4 }); box('metal', 0.08, 0.1, 0.25, SENX, SENY - 0.12, -HALF + 0.22, IRON, { rad: 0.015 }); }));
  { const cb = sub('crossbow', () => {
      cyl('metal', 0.035, 0.045, 0.2, 0, -0.1, 0, IRON, { seg: 8 });
      box('wood', 0.09, 0.1, 0.8, 0, 0.0, 0.2, WOOD, { rad: 0.03 }); box('metal', 0.1, 0.03, 0.5, 0, 0.065, 0.3, IRONL, { rad: 0.01 });   // stock and rail
      for (const sx of [-1, 1]) { box('metal', 0.5, 0.045, 0.05, sx * 0.25, 0.03, 0.56, 0x55595f, { r: [0, sx * -0.35, 0], rad: 0.012 }); }
      tube('cloth', [[-0.44, 0.03, 0.42], [0, 0.03, 0.2], [0.44, 0.03, 0.42]], 0.006, 0xd8d0b8, { segs: 8 });   // string, drawn
      cyl('metal', 0.012, 0.012, 0.55, 0, 0.1, 0.34, 0x9a8a68, { r: [PI / 2, 0, 0], seg: 5 }); cyl('metal', 0, 0.025, 0.07, 0, 0.1, 0.65, IRONL, { r: [PI / 2, 0, 0], seg: 5 });   // loaded bolt
      box('wood', 0.12, 0.18, 0.1, 0.0, -0.1, 0.1, WOODD, { r: [0.3, 0, 0], rad: 0.02 }); box('wood', 0.16, 0.18, 0.12, 0.2, 0.1, -0.12, 0x6b4a30, { rad: 0.03 });   // grip + ammo box
    }); sentryYaw.add(cb); upg.sentry.add(sentryYaw); }
  // lockbox reinforcement (Lockbox level 1+: extra steel straps + a second padlock)
  upg.lockbox = sub('lockboxUp', () => {
    at(LBX, 0, LBZ, -PI / 2 - 0.12, () => { for (const y of [0.18]) box('metal', 0.99, 0.09, 0.64, 0, y, 0, 0x7a8086, { rad: 0.015 }); box('metal', 0.99, 0.06, 0.64, 0, 0.5, 0, 0x7a8086, { rad: 0.012 }); box('brass', 0.12, 0.12, 0.06, 0.3, 0.38, 0.35, 0xe0b85a, { rad: 0.02 }); tor('metal', 0.04, 0.012, 0.3, 0.45, 0.35, IRONL, { seg: 8 }); });
  });
  upg.alarm.position.x = -1.75; group.add(upg.alarm, upg.sentry, upg.lockbox);
  for (const k of ['lock', 'lock2', 'alarm', 'sentry', 'lockbox']) upg[k].visible = false;

  // ---------- merge static bags into meshes ----------
  const meshes = [];
  for (const k in bags) { if (!bags[k].length) continue; const mesh = new THREE.Mesh(mergeBag(bags[k]), k === 'glow' ? glowMat : M[k]); mesh.name = 'home_' + k; mesh.frustumCulled = false; group.add(mesh); meshes.push(mesh); bags[k].forEach(g => g.dispose()); }
  for (const u of Object.values(upg)) u.traverse(o => { if (o.isMesh) o.frustumCulled = false; });

  // ---------- warm light: emissive sprite glow + floor pool (no PointLight) ----------
  const lampGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xffb860, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); lampGlow.scale.set(2.2, 2.2, 1); lampGlow.position.set(LX, LY - 0.16, LZ); group.add(lampGlow);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ map: tex.glow, color: 0xff9a40, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pool.rotation.x = -PI / 2; pool.scale.set(4.2, 4.2, 1); pool.position.set(LX, 0.045, LZ + 0.4); group.add(pool);
  const candleGlows = [[-HALF + 0.35, 2.0, 0.25], [-2.6 + 0.35, 1.2, -4.3 - 0.28], [-2.95, 0.66, 2.3]].map(([x, y, z]) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xffa850, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.set(0.5, 0.5, 1); s.position.set(x, y, z); group.add(s); return s; });
  // recycler furnace slot glow + smoke puffs
  const furnGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xff7a24, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); furnGlow.scale.set(1.0, 0.7, 1); furnGlow.position.set(RX, 0.5, RZ + 0.95); group.add(furnGlow);
  const puffs = []; for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.smoke, color: 0x6a6660, transparent: true, opacity: 0.4, depthWrite: false })); s.renderOrder = 4; group.add(s); puffs.push({ s, ph: i / 6, dx: (rnd() - 0.5) * 0.3 }); }

  // ---------- API ----------
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
  function applyPump() {
    const L = pumpShown, h = Math.max(0.001, TANK_H * L - 0.04);
    liq.visible = L > 0.004; liq.scale.set(1, h, 1); liq.position.y = TANK_Y + 0.02 + h / 2; needle.position.y = TANK_Y + 0.08 + (TANK_H - 0.26) * L;
    pumpGlow.material.opacity = 0.04 + 0.22 * L; pumpPool.material.opacity = 0.05 + 0.3 * L;
    const col = pumpAlert ? ELIXIR_RED : ELIXIR; liqMat.emissive.setHex(pumpAlert ? col : 0x14d6a8); pumpGlow.material.color.setHex(col); pumpPool.material.color.setHex(col); liqMat.color.setHex(pumpAlert ? 0x9a2a20 : 0x168a70);
  }
  applyPump();
  const api = {
    group, anchors, solids, meshes,
    setPumpLevel(v) { pumpLevel = clamp01(v); },
    setPumpAlert(b) { pumpAlert = !!b; applyPump(); },
    setScreenPower(on) { scrOn = !!on; drawScreen(); scrMat.emissiveIntensity = scrOn ? 0.9 : 0.05; scrGlow.visible = scrOn; },
    setOwner,
    setUpgrade(name, level) {
      level = level | 0;
      if (name === 'lock' || name === 'doorlock') { upg.lock.visible = level >= 1; upg.lock2.visible = level >= 2; return true; }
      if (name === 'alarm') { upg.alarm.visible = level >= 1; return true; }
      if (name === 'sentry' || name === 'turret') { upg.sentry.visible = level >= 1; return true; }
      if (name === 'lockbox') { upg.lockbox.visible = level >= 1; return true; }
      return false;
    },
    ringAlarm() { ring = 1; },
    setSentryTarget(x, z) { sentryTarget = x == null ? null : Math.atan2(x - SENX, z - (SENZ + 0.15)); },
    update(t) {
      pumpShown += (pumpLevel - pumpShown) * 0.08; if (Math.abs(pumpLevel - pumpShown) < 0.001) pumpShown = pumpLevel; applyPump();
      // bubbles rise inside the liquid and wrap
      const top = Math.max(0.05, TANK_H * pumpShown - 0.06); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
      for (let i = 0; i < BUB; i++) { const b = bub[i], u = (b.ph + t * b.sp) % 1, wob = Math.sin(t * 2 + i) * 0.015; ps.set(Math.cos(b.a) * b.r + wob, TANK_Y + 0.05 + u * top, Math.sin(b.a) * b.r); const s = pumpShown > 0.01 ? b.s * (0.6 + 0.4 * Math.sin(u * PI)) : 0; sc.set(s, s, s); bubbles.setMatrixAt(i, m4.compose(ps, q, sc)); }
      bubbles.instanceMatrix.needsUpdate = true; liqMat.emissiveIntensity = (pumpAlert ? 1.0 + 0.6 * Math.abs(Math.sin(t * 6)) : 1.0 + 0.18 * Math.sin(t * 1.7));
      // lamp and candle flicker (emissive only)
      const fl = 1 + 0.05 * Math.sin(t * 9.1) + 0.04 * Math.sin(t * 13.7 + 1); lampGlow.material.opacity = 0.8 * fl; pool.material.opacity = 0.3 * fl;
      candleGlows.forEach((s, i) => { s.material.opacity = 0.5 + 0.12 * Math.sin(t * (8 + i * 1.3) + i * 2); });
      furnGlow.material.opacity = 0.5 + 0.15 * Math.sin(t * 3.3) + 0.08 * Math.sin(t * 7.9);
      // smoke
      for (const p of puffs) { const u = (p.ph + t * 0.1) % 1; p.s.position.set(smokeOrigin.x + p.dx * u + Math.sin(t * 0.7 + p.ph * 9) * 0.1 * u, smokeOrigin.y + u * 1.0, smokeOrigin.z); const sz = 0.22 + u * 0.7; p.s.scale.set(sz, sz, 1); p.s.material.opacity = 0.38 * Math.sin(u * PI) * (1 - u * 0.4); p.s.material.rotation = u * 2 + p.ph * 6; }
      // screen flicker
      if (scrOn) scrMat.emissiveIntensity = 0.88 + 0.06 * Math.sin(t * 31) + 0.04 * Math.sin(t * 2.3);
      // bell
      if (ring > 0.002) { bellPivot.rotation.z = Math.sin(t * 22) * 0.5 * ring; clapper.position.set(Math.sin(t * 22 + 1.2) * 0.12 * ring, -0.3, 0); ring *= 0.985; } else if (ring > 0) { ring = 0; bellPivot.rotation.z = 0; clapper.position.set(0, -0.3, 0); }
      // sentry idle sweep or aim
      if (upg.sentry.visible) { const goal = sentryTarget != null ? sentryTarget : Math.sin(t * 0.35) * 0.7; sentryYaw.rotation.y += (goal - sentryYaw.rotation.y) * 0.1; }
    },
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); [glassMat, liqMat, scrMat, nameMat, glowMat, scrTex, nameTex].forEach(x => x.dispose()); if (outside) { outside.board.geometry.dispose(); outside.board.material.dispose(); outside.sign.geometry.dispose(); } },
  };
  let ring = 0, sentryTarget = null;
  return api;
}

// Goblin King 5x5: art for tree rooms 6-10 (Thorn Shrine, Gambler's Root, Memory Tree, Hollow Oak, Elder Tree).
// docs/PLAN-5x5-rooms.md section 3.2.  Types 1-5 live in rooms5art-trees-a.js and share the tree-room identity (see docs/reports/trees-b-art.md).
//
//   import { buildTreeRoom } from './rooms5art-trees-b.js';
//   const room = buildTreeRoom(THREE, helpers, 'thorn', { height: 6.5, size: 15, seed: 1, lite: false });   // -> THREE.Group, room-local space
//   room.userData.api.{anchors, solids, extraSolids, update(t), dispose(), ...type setters}
//
// Local space: origin = room centre at floor level, +y up, north = -z.  NE = (+4.2,-4.2), NW = (-4.2,-4.2), SE = (+4.2,+4.2), SW = (-4.2,+4.2).
// Everything is procedural, merged into a handful of meshes (<= 14 draw calls), emissive only (no lights), no external assets.
// `helpers` is optional and unused for now (reserved: shared materials / env map); pass {} or null.
const PI = Math.PI, TAU = PI * 2;
export const TREE_B_TYPES = ['thorn', 'gambler', 'memory', 'hollow', 'elder'];
const ALIAS = { thorn: 'thorn', thornshrine: 'thorn', gambler: 'gambler', gamblersroot: 'gambler', root: 'gambler', memory: 'memory', memorytree: 'memory', hollow: 'hollow', hollowoak: 'hollow', oak: 'hollow', elder: 'elder', eldertree: 'elder' };
const norm = t => ALIAS[String(t || '').toLowerCase().replace(/[^a-z]/g, '')] || null;

// ---------------------------------------------------------------- small maths
const hash = (x, y, z) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
  return lerp(lerp(lerp(hash(xi, yi, zi), hash(xi + 1, yi, zi), fx), lerp(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), fx), fy),
    lerp(lerp(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), fx), lerp(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), fx), fy), fz);
}
function rngOf(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- per-THREE kit: shared textures (generated once, <= 256 px)
const KITS = new WeakMap();
function kitOf(T) {
  let k = KITS.get(T); if (k) return k;
  k = { tex: {} };
  const hasDoc = typeof document !== 'undefined';
  const canvas = (w, h, fn, repeat) => {
    if (!hasDoc) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    if (repeat) { for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { g.save(); g.translate(ox * w, oy * h); fn(g, w, h, rngOf(repeat)); g.restore(); } } else fn(g, w, h, r);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t;
  };
  const r = rngOf(7741);
  // bark: vertical grain streaks and cracks, mid-grey so vertex colours stay in charge
  k.tex.bark = canvas(256, 256, (g, w, h, r) => {
    g.fillStyle = '#b4b0a8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = r() * w, l = 20 + r() * 110, y = r() * h, a = r() < 0.5 ? 0.2 : 0.12; g.strokeStyle = r() < 0.55 ? `rgba(40,34,30,${a + 0.12})` : `rgba(240,236,226,${a * 0.7})`; g.lineWidth = 1 + r() * 2.4; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + (r() - 0.5) * 8, y + l * 0.3, x + (r() - 0.5) * 8, y + l * 0.7, x + (r() - 0.5) * 6, y + l); g.stroke(); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '30,26,22' : '250,246,236'},${0.05 + r() * 0.08})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3); }
  }, true);
  k.tex.stone = canvas(256, 256, (g, w, h, r) => {
    g.fillStyle = '#bdbbb6'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,40,44' : '255,252,244'},${0.04 + r() * 0.1})`; const s = 1 + r() * 4; g.fillRect(r() * w, r() * h, s, s * (0.5 + r())); }
    for (let i = 0; i < 18; i++) { g.strokeStyle = 'rgba(30,30,34,0.28)'; g.lineWidth = 1 + r() * 1.5; g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (r() - 0.5) * 50; y += (r() - 0.3) * 40; g.lineTo(x, y); } g.stroke(); }
  }, true);
  k.tex.wood = canvas(256, 256, (g, w, h, r) => {
    g.fillStyle = '#c0b8a8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const y = r() * h; g.strokeStyle = `rgba(${r() < 0.6 ? '60,44,28' : '250,240,220'},${0.1 + r() * 0.16})`; g.lineWidth = 1 + r() * 2.2; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 10, w * 0.7, y + (r() - 0.5) * 10, w, y + (r() - 0.5) * 6); g.stroke(); }
    for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h; g.strokeStyle = 'rgba(50,36,24,0.3)'; for (let q = 1; q < 4; q++) { g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, q * 5, q * 3, 0, 0, 7); g.stroke(); } }
  }, true);
  // leaf atlas 2x2: broad leaf, narrow leaf, notched leaf, moss strand
  k.tex.leaf = canvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const leaf = (cx, cy, len, wid, kind) => {
      g.save(); g.translate(cx, cy);
      const gr = g.createLinearGradient(0, len, 0, -len); gr.addColorStop(0, '#9a9a9a'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#d8d8d8');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, len);
      g.bezierCurveTo(wid * 1.5, len * 0.5, wid * 1.2, -len * 0.4, 0, -len); g.bezierCurveTo(-wid * 1.2, -len * 0.4, -wid * 1.5, len * 0.5, 0, len); g.fill();
      if (kind === 2) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(-wid * 1.4, -len * 0.1); g.lineTo(-wid * 0.2, -len * 0.05); g.lineTo(-wid * 1.4, len * 0.2); g.fill(); g.beginPath(); g.moveTo(wid * 1.4, len * 0.3); g.lineTo(wid * 0.2, len * 0.35); g.lineTo(wid * 1.4, len * 0.55); g.fill(); g.globalCompositeOperation = 'source-over'; }
      g.strokeStyle = 'rgba(70,70,70,0.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, len); g.lineTo(0, -len * 0.9); g.stroke();
      g.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const y = len * (0.7 - i * 0.26); g.beginPath(); g.moveTo(0, y); g.lineTo(wid * 0.9, y - len * 0.22); g.moveTo(0, y); g.lineTo(-wid * 0.9, y - len * 0.22); g.stroke(); }
      g.restore();
    };
    leaf(64, 64, 54, 26, 0); leaf(192, 64, 58, 14, 1); leaf(64, 192, 54, 24, 2);
    g.save(); g.translate(192, 128); const gr2 = g.createLinearGradient(0, 0, 0, 128); gr2.addColorStop(0, '#f0f0f0'); gr2.addColorStop(1, '#8a8a8a');   // moss strand: ragged vertical ribbon
    g.fillStyle = gr2; for (let i = 0; i < 5; i++) { const x = -26 + i * 13, l = 90 + ((i * 37) % 30); g.beginPath(); g.moveTo(x - 5, 4); g.quadraticCurveTo(x + 3, l * 0.5, x + ((i % 2) ? 6 : -6), l + 6); g.quadraticCurveTo(x - 1, l * 0.5, x + 5, 4); g.fill(); }
    g.restore();
  });
  k.tex.ray = canvas(8, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  KITS.set(T, k); return k;
}

// ---------------------------------------------------------------- merge accumulator (vertex colours; optional unlit "glow" paint ranges)
class Acc {
  constructor(T, lit) { this.T = T; this.lit = !!lit; this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.bc = []; this.cnt = 0; this.geo = null; }
  add(geo, m, col, vfn) {
    const T = this.T, pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv, ix = geo.index, base = this.cnt;
    const v = new T.Vector3(), w = new T.Vector3(), nm = new T.Matrix3().getNormalMatrix(m), out = new T.Color();
    for (let k = 0; k < pa.count; k++) {
      v.fromBufferAttribute(pa, k).applyMatrix4(m); w.fromBufferAttribute(na, k).applyMatrix3(nm).normalize();
      out.copy(col); if (vfn) vfn(out, v.x, v.y, v.z, w.x, w.y, w.z, k);
      if (this.lit) { const sh = 0.32 + 0.68 * clamp(w.x * 0.3 + w.y * 0.8 + w.z * 0.5, 0, 1); out.multiplyScalar(sh); }
      this.p.push(v.x, v.y, v.z); this.n.push(w.x, w.y, w.z); this.u.push(ua ? ua.getX(k) : 0, ua ? ua.getY(k) : 0);
      this.c.push(out.r, out.g, out.b); this.bc.push(out.r, out.g, out.b);
    }
    if (ix) for (let k = 0; k < ix.count; k++) this.i.push(ix.getX(k) + base); else for (let k = 0; k < pa.count; k++) this.i.push(base + k);
    this.cnt += pa.count; return this;
  }
  quad(a, b, c, d, col, uv) {   // four room-local points (counter-clockwise seen from the front)
    const T = this.T, n = new T.Vector3().subVectors(b, a).cross(new T.Vector3().subVectors(d, a)).normalize(), base = this.cnt;
    [a, b, c, d].forEach((q, k) => { this.p.push(q.x, q.y, q.z); this.n.push(n.x, n.y, n.z); this.u.push(uv[k * 2], uv[k * 2 + 1]); this.c.push(col.r, col.g, col.b); this.bc.push(col.r, col.g, col.b); });
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3); this.cnt += 4;
  }
  mesh(mat, name) {
    if (!this.cnt) return null; const T = this.T, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2));
    const ca = new T.Float32BufferAttribute(this.c, 3); ca.setUsage(T.DynamicDrawUsage); g.setAttribute('color', ca); g.setIndex(this.i); g.computeBoundingSphere(); g.computeBoundingBox();
    this.geo = g; const m = new T.Mesh(g, mat); m.name = name || ''; return m;
  }
  paint(start, count, k, tint) {   // glow ranges: colour = built-in colour * k (* optional tint colour)
    if (!this.geo) return; const a = this.geo.attributes.color, arr = a.array;
    for (let q = start; q < start + count; q++) { arr[q * 3] = this.bc[q * 3] * k * (tint ? tint.r : 1); arr[q * 3 + 1] = this.bc[q * 3 + 1] * k * (tint ? tint.g : 1); arr[q * 3 + 2] = this.bc[q * 3 + 2] * k * (tint ? tint.b : 1); }
    a.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- the builder context
function makeCtx(T, type, opts, cfg) {
  const kit = kitOf(T), rnd = rngOf((opts.seed | 0) * 7919 + type.length * 104729 + 13), H = opts.height || 6.5, S = opts.size || 15, lite = !!opts.lite;
  const g = new T.Group(); g.name = 'treeRoom-' + type;
  const _m = new T.Matrix4(), _q = new T.Quaternion(), _e = new T.Euler(0, 0, 0, 'YXZ'), _p = new T.Vector3(), _s = new T.Vector3(), _up = new T.Vector3(0, 1, 0);
  const mat = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };
  const matDir = (x, y, z, dx, dy, dz, sx, sy, sz) => { const d = new T.Vector3(dx, dy, dz).normalize(); _q.setFromUnitVectors(_up, d); return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)); };   // +y of the unit shape points along d
  const col = h => new T.Color(h);
  const own = [];   // disposables owned by this room
  const stdMat = (o, tex) => { const { bump, ...rest } = o, m = new T.MeshStandardMaterial({ vertexColors: true, ...rest }); if (tex) { m.map = tex; m.bumpMap = tex; m.bumpScale = bump || 1.2; } own.push(m); return m; };
  const mats = {
    bark: stdMat({ roughness: 0.92, metalness: 0, envMapIntensity: 0.5, bump: 1.6, side: T.DoubleSide }, kit.tex.bark),
    stone: stdMat({ roughness: 0.86, metalness: 0, envMapIntensity: 0.55, bump: 1.2 }, kit.tex.stone),
    wood: stdMat({ roughness: 0.78, metalness: 0, envMapIntensity: 0.5, bump: 0.8 }, kit.tex.wood),
    metal: stdMat({ roughness: 0.42, metalness: 0.85, envMapIntensity: 1.1 }),
    gold: stdMat({ roughness: 0.28, metalness: 1, envMapIntensity: 1.4, emissive: 0x3a2000, emissiveIntensity: 0.6 }),
    glow: new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  };
  own.push(mats.glow);
  const leafM = new T.MeshBasicMaterial({ map: kit.tex.leaf, vertexColors: true, alphaTest: 0.45, side: T.DoubleSide, toneMapped: false }); own.push(leafM);
  const A = { bark: new Acc(T), stone: new Acc(T), wood: new Acc(T), metal: new Acc(T), gold: new Acc(T), leaf: new Acc(T), vein: new Acc(T, true) };
  const geos = [];
  const keep = geo => { geos.push(geo); return geo; };
  const c = {
    T, g, rnd, H, S, lite, cfg, A, mats, leafM, own, geos, mat, matDir, col, kit, anchors: {}, solids: [{ id: 'C', x: 0, z: 0, r: 1.1 }], extraSolids: [], tmp: { geos }, api: {}, updaters: [],
    // ---- shape helpers (all go into a merge accumulator)
    rbox(acc, w, h, d, x, y, z, color, ry = 0, rx = 0, rz = 0, r = 0.04, vfn) {
      const geo = new T.BoxGeometry(w, h, d, 3, 3, 3), p = geo.attributes.position, n = geo.attributes.normal, hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
      for (let k = 0; k < p.count; k++) {
        const px = p.getX(k), py = p.getY(k), pz = p.getZ(k), ix = clamp(px, -hx, hx), iy = clamp(py, -hy, hy), iz = clamp(pz, -hz, hz);
        let dx = px - ix, dy = py - iy, dz = pz - iz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        p.setXYZ(k, ix + dx * r, iy + dy * r, iz + dz * r); n.setXYZ(k, dx, dy, dz);
      }
      acc.add(geo, mat(x, y, z, rx, ry, rz), color, vfn); geo.dispose();
    },
    lathe(acc, pts, seg, x, y, z, color, sx = 1, sy = 1, sz = 1, ry = 0, vfn) {
      const geo = new T.LatheGeometry(pts.map(q => new T.Vector2(q[0], q[1])), seg); acc.add(geo, mat(x, y, z, 0, ry, 0, sx, sy, sz), color, vfn); geo.dispose();
    },
    shape(acc, geo, x, y, z, color, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0, vfn) { acc.add(geo, mat(x, y, z, rx, ry, rz, sx, sy, sz), color, vfn); },
    // faceted-but-smooth-shaded displaced rock
    rock(acc, x, y, z, sx, sy, sz, color, seed, o = {}) {
      const geo = new T.IcosahedronGeometry(1, o.detail || 2), p = geo.attributes.position, amp = o.amp == null ? 0.2 : o.amp, f = o.freq || 1.6;
      for (let k = 0; k < p.count; k++) { const px = p.getX(k), py = p.getY(k), pz = p.getZ(k), n = 1 + amp * (vnoise(px * f + seed, py * f, pz * f + seed * 0.7) * 2 - 1); p.setXYZ(k, px * n, py * n * (py < 0 ? (o.flat == null ? 0.7 : o.flat) : 1), pz * n); }
      smoothNormals(geo); acc.add(geo, mat(x, y, z, o.rx || 0, o.ry || 0, o.rz || 0, sx, sy, sz), color, o.vfn); geo.dispose();
    },
    // tapered tube through points [[x,y,z],...]
    tube(acc, pts, r0, r1, color, o = {}) {
      const curve = new T.CatmullRomCurve3(pts.map(q => new T.Vector3(q[0], q[1], q[2]))), tub = o.tub || Math.max(8, pts.length * 5), rad = o.radial || 6;
      const geo = new T.TubeGeometry(curve, tub, 1, rad, !!o.closed), p = geo.attributes.position;
      for (let i = 0; i <= tub; i++) { const t = i / tub, cp = curve.getPointAt(t), rr = (r0 + (r1 - r0) * t) * (o.wob ? 1 + o.wob * (vnoise(t * 7 + (o.seed || 0), 1, 2) - 0.5) : 1); for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; p.setXYZ(k, cp.x + (p.getX(k) - cp.x) * rr, cp.y + (p.getY(k) - cp.y) * rr, cp.z + (p.getZ(k) - cp.z) * rr); } }
      geo.computeVertexNormals();
      const uv = geo.attributes.uv, len = curve.getLength(); for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getY(k) * 2, uv.getX(k) * len / 1.3);   // grain runs along the tube
      acc.add(geo, _m.identity(), color, o.vfn); geo.dispose(); return curve;
    },
    // card oriented so its normal faces `dir` (puffs of leaves look outward from their centre)
    cardDir(cell, x, y, z, w, h, dx, dy, dz, roll, color) {
      const cu = (cell % 2) * 0.5, cv = cell < 2 ? 0.5 : 0, a = new T.Vector3(-w / 2, -h / 2, 0), b = new T.Vector3(w / 2, -h / 2, 0), cc = new T.Vector3(w / 2, h / 2, 0), d = new T.Vector3(-w / 2, h / 2, 0);
      const q1 = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(dx, dy, dz).normalize()), q2 = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), roll);
      _q.copy(q1).multiply(q2); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)); [a, b, cc, d].forEach(q => q.applyMatrix4(_m));
      A.leaf.quad(a, b, cc, d, color, [cu + 0.004, cv + 0.004, cu + 0.496, cv + 0.004, cu + 0.496, cv + 0.496, cu + 0.004, cv + 0.496]);
    },
    // a card for the leaf accumulator: cell 0..3 of the atlas, centred at (x,y,z), size w x h, yaw/tilt
    card(cell, x, y, z, w, h, yaw, tilt, roll, color) {
      const cu = (cell % 2) * 0.5, cv = cell < 2 ? 0.5 : 0, a = new T.Vector3(-w / 2, -h / 2, 0), b = new T.Vector3(w / 2, -h / 2, 0), cc = new T.Vector3(w / 2, h / 2, 0), d = new T.Vector3(-w / 2, h / 2, 0);
      _e.set(tilt, yaw, roll); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1));
      [a, b, cc, d].forEach(q => q.applyMatrix4(_m));
      A.leaf.quad(a, b, cc, d, color, [cu + 0.004, cv + 0.004, cu + 0.496, cv + 0.004, cu + 0.496, cv + 0.496, cu + 0.004, cv + 0.496]);
    },
    anchor(name, x, y, z, r = 1.4, data) { const o = new T.Object3D(); o.name = 'anchor-' + name; o.position.set(x, y, z); o.userData = { id: name, reach: r, ...(data || {}) }; g.add(o); c.anchors[name] = o; return o; },
    post(id, x, z) { c.solids.push({ id, x, z, r: 0.7 }); },
    addMesh(acc, mat, name) { const m = acc.mesh(mat, name); if (m) { g.add(m); } return m; },
  };
  return c;
}

function smoothNormals(geo) {   // weld normals by position so displaced non-indexed geometry shades smoothly
  const p = geo.attributes.position, n = new Float32Array(p.count * 3), map = new Map(), a = [0, 0, 0], b = [0, 0, 0], d = [0, 0, 0];
  const key = k => Math.round(p.getX(k) * 2e3) + ',' + Math.round(p.getY(k) * 2e3) + ',' + Math.round(p.getZ(k) * 2e3);
  for (let f = 0; f < p.count; f += 3) {
    for (let q = 0; q < 3; q++) { a[q] = [p.getX(f + 1), p.getY(f + 1), p.getZ(f + 1)][q] - [p.getX(f), p.getY(f), p.getZ(f)][q]; b[q] = [p.getX(f + 2), p.getY(f + 2), p.getZ(f + 2)][q] - [p.getX(f), p.getY(f), p.getZ(f)][q]; }
    d[0] = a[1] * b[2] - a[2] * b[1]; d[1] = a[2] * b[0] - a[0] * b[2]; d[2] = a[0] * b[1] - a[1] * b[0];
    for (let q = 0; q < 3; q++) { const kk = key(f + q); let e = map.get(kk); if (!e) { e = [0, 0, 0]; map.set(kk, e); } e[0] += d[0]; e[1] += d[1]; e[2] += d[2]; }
  }
  for (let k = 0; k < p.count; k++) { const e = map.get(key(k)), l = Math.hypot(e[0], e[1], e[2]) || 1; n[k * 3] = e[0] / l; n[k * 3 + 1] = e[1] / l; n[k * 3 + 2] = e[2] / l; }
  geo.setAttribute('normal', new geo.attributes.position.constructor(n, 3));
}

// ---------------------------------------------------------------- the shared "tree room" body
// Identity every tree room shares (types 1-5 use the same recipe): a fat flared trunk with ridged bark that rises through a hole in the ceiling,
// glowing knowledge-veins in the type colour, buttress roots on the floor, a ceiling canopy of emissive leaf cards, a soft light shaft,
// a 3 m glowing root ring on the floor, fallen leaves, and four post props on the NE/NW/SE/SW anchors.
function baseTree(c) {
  const { T, rnd, H, cfg, A, lite } = c, K = cfg.K || 7, dents = cfg.dents || [], seed = cfg.seed || 0;
  const dentW = (a, y) => {
    let w = 0, d = 0;
    for (const e of dents) { let da = a - e.a; da = Math.atan2(Math.sin(da), Math.cos(da)); const q = (da / e.rx) ** 2 + ((y - e.y) / e.ry) ** 2; if (q < 1) { const t = (1 - q) * (1 - q); w = Math.max(w, t); d += e.depth * t; } }
    return [Math.min(1, w), d];
  };
  const dentNear = (a, y) => { for (const e of dents) { let da = a - e.a; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < e.rx * 1.5 && Math.abs(y - e.y) < e.ry * 1.4) return true; } return false; };
  const ridge = (a, y) => 0.5 + 0.5 * Math.sin(a * K + 1.6 * Math.sin(y * 0.8 + a * 2 + seed));
  const surf = (a, y) => {
    const lobe = 1 + (0.1 * Math.sin(a * 2 + seed + y * 0.32) + 0.06 * Math.sin(a * 3 - y * 0.21 + seed * 2)) * Math.min(1, y / 1.4) * (cfg.lobes == null ? 1 : cfg.lobes), base = cfg.R * (1 + cfg.flare * Math.exp(-y / 0.9)) * (1 + 0.035 * Math.sin(y * 1.7 + seed)) * lobe * (1 - 0.06 * clamp(y / H, 0, 1)), rid = ridge(a, y), nz = vnoise(Math.sin(a) * 2 + 3, y * 0.7, Math.cos(a) * 2 + 5), [w, d] = dentW(a, y);
    return base * (1 + ((0.14 * (rid - 0.5)) + 0.07 * (nz - 0.5)) * cfg.rough * (1 - w)) - d;
  };
  c.surf = surf; c.dentW = dentW; c.ridge = ridge;
  const bark = c.col(cfg.bark), moss = c.col(cfg.moss || 0x4d6a2e), mossD = c.col(0x2c4020);
  // ---- trunk (lathe, warped to the surface function)
  const prof = []; for (let y = -0.2; y <= H + 0.9; y += lite ? 0.2 : 0.12) prof.push([1, y]);
  const seg = lite ? 40 : 64, geo = new T.LatheGeometry(prof.map(q => new T.Vector2(q[0], q[1])), seg), p = geo.attributes.position;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), z = p.getZ(k), a = Math.atan2(x, z), r = surf(a, y); p.setXYZ(k, Math.sin(a) * r, y, Math.cos(a) * r); }
  geo.computeVertexNormals(); { const n = geo.attributes.normal, np = prof.length; for (let j = 0; j < np; j++) { const i0 = j, i1 = seg * np + j; const nx = n.getX(i0) + n.getX(i1), ny = n.getY(i0) + n.getY(i1), nz = n.getZ(i0) + n.getZ(i1), l = Math.hypot(nx, ny, nz) || 1; n.setXYZ(i0, nx / l, ny / l, nz / l); n.setXYZ(i1, nx / l, ny / l, nz / l); } }
  const uvA = geo.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getX(k) * 7, uvA.getY(k) * 5);
  A.bark.add(geo, c.mat(0, 0, 0), bark, (out, x, y, z) => {
    const a = Math.atan2(x, z), rid = ridge(a, y), [w] = dentW(a, y), nz = vnoise(x * 3, y * 2, z * 3);
    out.multiplyScalar((0.46 + 0.7 * rid) * (0.85 + 0.3 * nz) * (1 - 0.88 * w));
    if (cfg.barkAlt) out.lerp(cfg.barkAlt, clamp((nz - 0.55) * 2.2, 0, 0.6));
    const m = clamp((1.5 - y) / 1.5 + (nz - 0.5) * 1.1, 0, 1) * (1 - w); if (m > 0.35) out.lerp(nz > 0.5 ? moss : mossD, clamp((m - 0.35) * 2.2, 0, 0.9));
  }); geo.dispose();
  // ---- glowing veins that follow the surface (spiral paths)
  const veinCol = c.col(cfg.vein), nV = cfg.veins == null ? 6 : cfg.veins;
  for (let k = 0; k < nV; k++) {
    const a0 = k * TAU / nV + rnd() * 0.5, pts = [], wob = 0.3 + rnd() * 0.5, tw = (rnd() - 0.5) * 0.35, y0 = 0.5 + rnd() * 0.5;
    for (let j = 0; j < 16; j++) { const y = y0 + j * (H + 0.4 - y0) / 15, a = a0 + wob * Math.sin(j * 0.6 + k) + tw * j; if (dentNear(a, y)) continue; const r = surf(a, y) + 0.015; pts.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
    if (pts.length > 3) c.tube(A.vein, pts, 0.034, 0.016, veinCol, { radial: 4, tub: pts.length * 4 });
    // side twigs
    for (let t = 0; t < 2; t++) {
      const j = 3 + Math.floor(rnd() * (pts.length - 6)); if (!pts[j]) continue; const b = pts[j], a = Math.atan2(b[0], b[2]) + (rnd() - 0.5) * 0.9, y = b[1] + 0.3 + rnd() * 0.5, r1 = surf(a, y) + 0.015;
      const mid = [(b[0] + Math.sin(a) * r1) / 2, (b[1] + y) / 2 + 0.1, (b[2] + Math.cos(a) * r1) / 2];
      c.tube(A.vein, [b, mid, [Math.sin(a) * r1, y, Math.cos(a) * r1]], 0.022, 0.01, veinCol, { radial: 3, tub: 8 });
    }
  }
  // ---- buttress roots over the floor
  const nR = cfg.roots == null ? 7 : cfg.roots;
  for (let k = 0; k < nR; k++) {
    const a = k * TAU / nR + (rnd() - 0.5) * 0.4, len = cfg.rootLen * 0.62 * (0.75 + rnd() * 0.5), r0 = (cfg.rootR || 0.3) * (0.8 + rnd() * 0.5), hi = cfg.rootHi || 0.8, wig = (rnd() - 0.5) * 0.5, pts = [];
    for (let j = 0; j <= 6; j++) { const t = j / 6, rr = surf(a, 0.5) * 0.5 + t * len * 1.3, y = Math.max(0.02, hi * Math.pow(1 - t, 2.4) + 0.05 + r0 * 0.15 * (1 - t)), aa = a + wig * t * t; pts.push([Math.sin(aa) * rr, y - (j > 4 ? 0.04 : 0), Math.cos(aa) * rr]); }
    pts[6][1] = -0.03; c.tube(A.bark, pts, r0 * 1.15, r0 * 0.1, bark, { radial: 8, tub: 22, wob: 0.25, seed: k, vfn: (out, x, y, z) => { const n = vnoise(x * 3, y * 4, z * 3); out.multiplyScalar(0.55 + 0.7 * n); if (y < 0.18 && n > 0.45) out.lerp(moss, 0.55); } });
  }
  // ---- limbs
  const nL = cfg.limbs == null ? 5 : cfg.limbs, limbs = [];
  for (let k = 0; k < nL; k++) {
    const a = k * TAU / nL + rnd() * 0.6, y0 = H * (0.55 + rnd() * 0.25), reach = (cfg.limbReach || 3.4) * (0.8 + rnd() * 0.4), r0 = surf(a, y0), pts = [[Math.sin(a) * (r0 - (cfg.limbR || 0.3) * 2.6), y0 - 0.5, Math.cos(a) * (r0 - (cfg.limbR || 0.3) * 2.6)], [Math.sin(a) * (r0 - 0.25), y0 - 0.15, Math.cos(a) * (r0 - 0.25)]];
    for (let j = 1; j <= 4; j++) { const t = j / 4, aa = a + (rnd() - 0.5) * 0.3, rr = r0 + t * reach; pts.push([Math.sin(aa) * rr, y0 + t * (H + 0.3 - y0) * (0.5 + 0.8 * t) + Math.sin(t * 3 + k) * 0.25, Math.cos(aa) * rr]); }
    limbs.push(c.tube(A.bark, pts, cfg.limbR || 0.3, 0.07, bark, { radial: 9, tub: 24, wob: 0.2, seed: k + 9, vfn: (out, x, y, z) => { out.multiplyScalar(0.5 + 0.75 * vnoise(x * 2, y * 3, z * 2)); } }));
  }
  // ---- canopy of leaf cards under the ceiling hole + hanging leaves on the limbs
  const lt = cfg.leaf, lt2 = cfg.leaf2 || lt, mult = cfg.leafMult || 1.5, dens = (cfg.cards || 90) / 90 * (lite ? 0.55 : 1);
  const puff = (cx, cy, cz, rad, n, sz, lum) => {   // a ball of small leaf cards, each facing outward from the centre
    n = Math.max(4, Math.round(n * 1.7 * dens));
    for (let i = 0; i < n; i++) {
      const dx = rnd() - 0.5, dy = rnd() - 0.5, dz = rnd() - 0.5, l = Math.hypot(dx, dy, dz) || 1, rr = rad * Math.cbrt(rnd()), s = (0.45 + rnd() * 0.32) * sz * (cfg.leafSize || 1);
      const cc = c.col(rnd() < (cfg.mix == null ? 0 : cfg.mix) ? lt2 : lt).multiplyScalar(mult * lum * (0.55 + 0.65 * rr / rad + rnd() * 0.25));
      c.cardDir(Math.floor(rnd() * 3), cx + dx / l * rr, cy + dy / l * rr * 0.7, cz + dz / l * rr, s * 0.8, s, dx + (rnd() - 0.5) * 0.6, dy * 0.8 - 0.25, dz + (rnd() - 0.5) * 0.6, rnd() * TAU, cc);
    }
  };
  for (const lc of limbs) for (let t = 0.4; t <= 1.001; t += 0.2) { const pt = lc.getPointAt(t); puff(pt.x, pt.y - 0.1, pt.z, 0.55 + 0.5 * t, 16, 1, 1); }   // leaf puffs along every limb
  const ca = cfg.canopyR || 4.4;
  for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + rnd() * 0.5, rr = 1.8 + rnd() * (ca - 1.4); puff(Math.sin(a) * rr, H - 0.35 - rnd() * 0.7, Math.cos(a) * rr, 0.9 + rnd() * 0.5, 22, 1, 1); }   // ceiling ring
  puff(0, H + 0.5, 0, 2.3, 80, 1.5, 1.35);   // plug above the ceiling hole: the hole reads as a mass of glowing foliage, not a black disc
  puff(0, H - 0.3, 0, 1.7, 26, 1.1, 1.1);
  if (cfg.strands) for (let i = 0; i < (lite ? cfg.strands / 2 : cfg.strands) | 0; i++) {   // hanging moss ribbons
    const a = rnd() * TAU, rr = 1.3 + rnd() * (cfg.canopyR || 4.4) * 0.9, hgt = 1.0 + rnd() * 1.8, cc = c.col(cfg.strandCol || lt).multiplyScalar(cfg.strandMult || 0.8 * mult);
    c.card(3, Math.sin(a) * rr, H - 0.4 - hgt / 2 - rnd() * 0.6, Math.cos(a) * rr, 0.55, hgt, rnd() * TAU, 0, 0, cc);
  }
  // fallen leaves on the floor (dim copies, flat)
  for (let i = 0; i < (lite ? 12 : 26); i++) {
    const a = rnd() * TAU, rr = 1.6 + rnd() * 5.2, cc = c.col(rnd() < 0.5 ? lt : cfg.litter || 0x6a5a38).multiplyScalar(cfg.litterMult || 0.55 * (0.5 + rnd() * 0.7));
    c.card(Math.floor(rnd() * 3), Math.sin(a) * rr, 0.02 + rnd() * 0.01, Math.cos(a) * rr, 0.4, 0.5, rnd() * TAU, -PI / 2, 0, cc);
  }
  // ---- floor: 3 m root ring (the `ring` zone) + moss bed under the trunk
  const T2 = T, ringG = new T2.RingGeometry(2.92, 3.04, 64), bed = new T2.CircleGeometry(2.2, 28);
  const ringM = new T2.MeshBasicMaterial({ color: new T2.Color(cfg.vein), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); c.own.push(ringM);
  const ring = new T2.Mesh(ringG, ringM); ring.rotation.x = -PI / 2; ring.position.y = 0.025; ring.name = 'ring'; c.g.add(ring); c.geos.push(ringG);
  A.stone.add(bed, c.mat(0, 0.012, 0, -PI / 2), mossD.clone().lerp(bark, 0.2), (out, x, y, z) => { out.multiplyScalar(0.7 + 0.6 * vnoise(x * 2, 1, z * 2)); }); bed.dispose();
  c.ringM = ringM; c.veinBase = veinCol.clone();
  // ---- soft light shaft from the ceiling hole (additive, no depth write)
  const rayG = new T2.CylinderGeometry(1.7, 3.6, H, 28, 1, true), rayM = new T2.MeshBasicMaterial({ map: c.kit.tex.ray, color: new T2.Color(cfg.ray || cfg.vein).multiplyScalar(0.9), transparent: true, opacity: cfg.rayOpacity == null ? 0.06 : cfg.rayOpacity * 0.6, blending: T2.AdditiveBlending, depthWrite: false, side: T2.DoubleSide, toneMapped: false, fog: false });
  c.own.push(rayM); c.geos.push(rayG); const ray = new T2.Mesh(rayG, rayM); ray.position.y = H / 2; ray.name = 'ray'; c.g.add(ray); c.rayM = rayM;
  // canonical anchors
  c.anchor('C', 0, 1.4, 0, 1.1 + 1.4, { kind: 'trunk' }); c.anchor('trunk', 0, 1.5, 0, 1.1 + 1.4, { kind: 'trunk' }); c.anchor('ring', 0, 0.05, 0, 3.0, { kind: 'zone', radius: 3.0 });
  c.anchor('NE', 4.2, 0, -4.2, 0.7 + 1.4); c.anchor('NW', -4.2, 0, -4.2, 0.7 + 1.4); c.anchor('SE', 4.2, 0, 4.2, 0.7 + 1.4); c.anchor('SW', -4.2, 0, 4.2, 0.7 + 1.4);
}

// ---------------------------------------------------------------- finish: build meshes, api, return
function finish(c, type, extra) {
  const { T, g, A, mats } = c;
  const meshes = [c.addMesh(A.bark, mats.bark, 'bark'), c.addMesh(A.stone, mats.stone, 'stone'), c.addMesh(A.wood, mats.wood, 'wood'), c.addMesh(A.metal, mats.metal, 'metal'), c.addMesh(A.gold, mats.gold, 'gold'), c.addMesh(A.leaf, c.leafM, 'leaves')];
  const veinM = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); c.own.push(veinM); c.veinM = veinM; c.veinMesh = c.addMesh(A.vein, veinM, 'veins');
  if (c.veinMesh) c.veinMesh.userData.base = 1;
  for (const m of g.children) if (m.isMesh) c.geos.push(m.geometry);
  c.api.setVeins = k => { veinM.color.setScalar(k); };
  c.api.setLeaves = (k, tint) => { c.leafM.color.setScalar(k); if (tint) c.leafM.color.multiply(tint); };
  c.api.setRing = k => { c.ringM.opacity = clamp(0.12 + 0.6 * k, 0, 1); };
  const api = Object.assign({
    type, anchors: c.anchors, solids: c.solids, extraSolids: c.extraSolids, height: c.H, size: c.S,
    update(t, dt) { for (const f of c.updaters) f(t, dt || 0.016); },
    drawCalls() { let n = 0; g.traverse(o => { if (o.isMesh && o.visible) n++; }); return n; },
    dispose() { for (const m of c.own) m.dispose(); for (const geo of c.geos) geo.dispose(); },
  }, c.api, extra || {});
  g.userData.api = api; g.userData.type = type; g.userData.solids = c.solids; g.userData.anchors = c.anchors;
  return g;
}

// ================================================================ 6. THORN SHRINE (crimson): hold the thorns, bank a blessing, drink the blood bowl
function thorn(c) {
  const { T, rnd, H, A } = c, ROSE = 0xff3a52;
  c.cfg = { R: 1.0, flare: 0.5, rough: 1.3, K: 9, seed: 2, bark: 0x4a2c2a, barkAlt: new T.Color(0x2a1a1e), moss: 0x5a3a2a, vein: ROSE, ray: 0xff4a50, rayOpacity: 0.09, veins: 5, roots: 8, rootLen: 3.8, rootR: 0.26, rootHi: 0.9, limbs: 6, limbReach: 3.6, limbR: 0.26, cards: 70, leaf: 0xff4256, leaf2: 0xff9a4a, mix: 0.25, leafMult: 1.35, canopyR: 4.6, leafSize: 0.95, litter: 0x7a2630 };
  baseTree(c);
  const bark = c.col(0x35201f), thornCol = c.col(0x2a1618), gripBase = 1.0, gripTop = 2.0;
  // thorny coils spiralling up the trunk; tips split into 3 height bands that light up with the grip tier
  const tipAcc = [new Acc(T), new Acc(T), new Acc(T)], dull = c.col(0xff1810);
  for (let k = 0; k < 3; k++) {
    const a0 = k * TAU / 3 + 0.4, hand = k % 2 ? -1 : 1, pts = [], y1 = 5.2;
    for (let j = 0; j <= 30; j++) { const t = j / 30, y = 0.35 + t * (y1 - 0.35), a = a0 + hand * t * TAU * 2.6, r = c.surf(a, y) + 0.06 + 0.04 * Math.sin(j * 1.7); pts.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
    const curve = c.tube(A.bark, pts, 0.075, 0.04, bark, { radial: 5, tub: 90, vfn: (out, x, y, z) => out.multiplyScalar(0.6 + 0.8 * vnoise(x * 4, y * 4, z * 4)) });
    const nS = 46;
    for (let s = 0; s < nS; s++) {
      const t = (s + 0.5) / nS, p = curve.getPointAt(t), tg = curve.getTangentAt(t), ang = Math.atan2(p.x, p.z), ox = Math.sin(ang), oz = Math.cos(ang), big = p.y > gripBase && p.y < gripTop ? 1.45 : 1;
      const L = (0.3 + 0.3 * rnd()) * big, up = 0.25 + rnd() * 0.35, spin = (rnd() - 0.5) * 1.6;
      const d = new T.Vector3(ox + tg.x * spin * 0.4, up, oz + tg.z * spin * 0.4).normalize(), rb = 0.055 * big;
      const cone = new T.ConeGeometry(rb, L, 5, 1, false);
      cone.translate(0, L / 2, 0); A.bark.add(cone, c.matDir(p.x, p.y, p.z, d.x, d.y, d.z, 1, 1, 1), thornCol, (out) => { out.multiplyScalar(0.8 + 0.5 * rnd()); }); cone.dispose();
      const band = clamp(Math.floor((p.y - 0.35) / 1.6), 0, 2), tl = L * 0.4, tc = new T.ConeGeometry(rb * 0.42 * 1.12, tl, 5, 1, false); tc.translate(0, tl / 2, 0);
      tipAcc[band].add(tc, c.matDir(p.x + d.x * L * 0.6, p.y + d.y * L * 0.6, p.z + d.z * L * 0.6, d.x, d.y, d.z, 1, 1, 1), dull); tc.dispose();
    }
  }
  // worn grip: smoothed bare wood band with old blood, at hand height on the open side
  const gripC = c.col(0x7a4638);
  for (const [a, y, s] of [[-0.3, 1.45, 1], [0.3, 1.5, 1], [0, 1.75, 0.8]]) {   // polished, hand-worn patches where the thorns have been rubbed away (a pair of palms and a thumb)
    const r = c.surf(a, y), sg = new T.SphereGeometry(1, 14, 10);
    A.bark.add(sg, c.mat(Math.sin(a) * (r + 0.005), y, Math.cos(a) * (r + 0.005), 0, a, 0, 0.11 * s, 0.17 * s, 0.035), gripC, (out, x, y2, z) => { out.multiplyScalar(0.8 + 0.4 * vnoise(x * 9, y2 * 9, z * 9)); }); sg.dispose();
  }
  c.rbox(A.bark, 0.07, 0.45, 0.04, 0, 1.18, c.surf(0, 1.18) + 0.05, c.col(0x6a1018), 0, 0, 0.1, 0.02);   // blood drip
  c.tmp.tipAcc = tipAcc;
  // floor: puddle at the gripping spot
  const pud = new T.CircleGeometry(0.55, 18); A.bark.add(pud, c.mat(0, 0.03, 1.55, -PI / 2, 0, 0, 1, 1.3, 1), c.col(0x3a0a12), (out, x, y, z) => out.multiplyScalar(0.7 + 0.6 * vnoise(x * 5, 1, z * 5))); pud.dispose();
  // ---- posts: thorn-wrapped obelisks on NE NW SW, the blood bowl on SE
  const obelisk = (id, x, z, rot) => {
    c.post(id, x, z);
    const col = c.col(0x6a6560);
    c.lathe(A.stone, [[0.0, 0], [0.62, 0], [0.66, 0.1], [0.6, 0.2], [0.46, 0.24], [0.4, 0.5], [0.34, 1.0], [0.26, 1.5], [0.16, 1.8], [0.02, 2.05], [0, 2.06]], 10, x, 0, z, col, 1, 1, 1, rot, (out, vx, vy, vz) => { out.multiplyScalar(0.7 + 0.5 * vnoise(vx * 3 + z, vy * 2, vz * 3)); });
    const pts = []; for (let j = 0; j <= 14; j++) { const t = j / 14, y = 0.3 + t * 1.5, a = rot + t * TAU * 2.2, r = 0.42 - 0.22 * t + 0.04; pts.push([x + Math.sin(a) * r, y, z + Math.cos(a) * r]); }
    const cv = c.tube(A.bark, pts, 0.05, 0.03, bark, { radial: 4, tub: 40 });
    for (let s = 0; s < 14; s++) { const t = (s + 0.5) / 14, p = cv.getPointAt(t), dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1, cone = new T.ConeGeometry(0.03, 0.2, 4, 1); cone.translate(0, 0.1, 0); A.bark.add(cone, c.matDir(p.x, p.y, p.z, dx / l, 0.35, dz / l, 1, 1, 1), thornCol); cone.dispose(); }
    c.rock(A.stone, x + Math.sin(rot + 2) * 0.55, 0.1, z + Math.cos(rot + 2) * 0.55, 0.22, 0.14, 0.18, col, id.length * 3 + rot, { amp: 0.25 });
    c.anchor(id, x, 0, z, 0.7 + 1.4);
  };
  obelisk('NE', 4.2, -4.2, 0.4); obelisk('NW', -4.2, -4.2, 2.1); obelisk('SW', -4.2, 4.2, 4.0);
  // blood bowl (SE)
  const bx = 4.2, bz = 4.2; c.post('SE', bx, bz);
  const stoneC = c.col(0x716a64);
  c.lathe(A.stone, [[0, 0], [0.7, 0], [0.74, 0.1], [0.66, 0.2], [0.34, 0.28], [0.26, 0.5], [0.3, 0.7], [0.62, 0.86], [0.74, 1.02], [0.7, 1.08], [0.6, 1.02], [0.5, 0.92], [0.32, 0.84], [0, 0.84]], 20, bx, 0, bz, stoneC, 1, 1, 1, 0, (out, vx, vy, vz) => { out.multiplyScalar(0.7 + 0.5 * vnoise(vx * 3, vy * 3, vz * 3)); });
  for (let i = 0; i < 6; i++) { const a = i * TAU / 6; const cone = new T.ConeGeometry(0.05, 0.3, 4, 1); cone.translate(0, 0.15, 0); A.stone.add(cone, c.matDir(bx + Math.sin(a) * 0.72, 1.0, bz + Math.cos(a) * 0.72, Math.sin(a) * 0.5, 1, Math.cos(a) * 0.5, 1, 1, 1), c.col(0x4a3a36)); cone.dispose(); }   // rim spikes
  const bowlGlow = new Acc(T), tick = [];
  for (let i = 0; i < 3; i++) { const s0 = bowlGlow.cnt; const sp = new T.SphereGeometry(0.05, 8, 6); bowlGlow.add(sp, c.mat(bx + (i - 1) * 0.2, 0.52, bz - 0.29 + Math.abs(i - 1) * 0.02, 0, 0, 0, 1, 1.6, 1), c.col(0xff3a52)); sp.dispose(); tick.push([s0, bowlGlow.cnt - s0]); }   // 3 drop gems on the stem, facing north
  const liquidG = new T.CircleGeometry(0.58, 24), liqM = new T.MeshStandardMaterial({ color: 0x3a0510, emissive: 0xb0102a, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.1 }); c.own.push(liqM); c.geos.push(liquidG);
  const liquid = new T.Mesh(liquidG, liqM); liquid.rotation.x = -PI / 2; liquid.position.set(bx, 0.9, bz); liquid.name = 'bowlLiquid'; c.g.add(liquid);
  c.anchor('SE', bx, 1.0, bz, 0.7 + 1.4, { kind: 'bowl' }); c.anchors.bowl = c.anchors.SE;
  c.anchor('grip', 0, 1.5, 1.05, 2.5, { kind: 'grip' });
  // glow meshes
  const tipMats = tipAcc.map(() => { const m = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); c.own.push(m); return m; });
  const tipMeshes = tipAcc.map((a, i) => c.addMesh(a, tipMats[i], 'thornTier' + (i + 1)));
  const bowlMesh = c.addMesh(bowlGlow, c.mats.glow, 'bowlGems');
  c.mats.glow.vertexColors = true;
  // state
  let grip = 0, bowl = 0;
  const lightTiers = n => { grip = clamp(Math.round(n), 0, 3); tipAcc.forEach((a, i) => a.paint(0, a.cnt, i < grip ? 2.5 : 0.16)); };
  const setBowl = n => { bowl = clamp(Math.round(n), 0, 3); liquid.position.y = 0.88 + bowl * 0.045; liqM.emissiveIntensity = 0.35 + bowl * 0.4; tick.forEach(([s, n2], i) => bowlGlow.paint(s, n2, i < bowl ? 3.4 : 0.14)); };
  c.api.setGrip = lightTiers; c.api.setBowl = setBowl;
  c.updaters.push((t) => { if (grip > 0) { const k = 3.2 + 0.7 * Math.sin(t * (4 + grip * 2)); for (let i = 0; i < grip; i++) tipMats[i].color.setScalar(k / 3.6); } for (let i = grip; i < 3; i++) tipMats[i].color.setScalar(1); });
  c.finishHooks = () => { lightTiers(0); setBowl(0); };
  return finish(c, 'thorn');
}

// ================================================================ 7. GAMBLER'S ROOT (gold on green): a mouth in the trunk, five knots, five hoard gourds
function gambler(c) {
  const { T, rnd, H, A } = c, GOLD = 0xffc83a;
  const mouth = { a: 0, y: 1.45, rx: 0.5, ry: 0.95, depth: 0.5 };
  c.cfg = { R: 1.0, flare: 0.5, rough: 1.2, K: 6, seed: 5, bark: 0x6a4e2c, barkAlt: new T.Color(0x3e4a24), moss: 0x4d7a2a, vein: GOLD, ray: 0xffd060, rayOpacity: 0.1, veins: 6, roots: 8, rootLen: 4.0, rootR: 0.28, rootHi: 0.85, limbs: 5, limbReach: 3.4, limbR: 0.3, cards: 96, leaf: 0x58c860, leaf2: 0xf0bd30, mix: 0.4, leafMult: 1.45, canopyR: 4.6, dents: [mouth], litter: 0x8a7a30 };
  baseTree(c);
  const lip = c.col(0x8a6a3c), fang = c.col(0xe6d8b0), goldC = c.col(0xe8b22e);
  // lips (closed loop tube) around the mouth + fangs
  const loop = []; for (let i = 0; i < 20; i++) { const th = i / 20 * TAU, a = mouth.rx * 0.98 * Math.cos(th), y = mouth.y + mouth.ry * 0.98 * Math.sin(th), r = c.surf(a, y) + 0.02; loop.push([Math.sin(a) * r, y, Math.cos(a) * r]); }
  c.tube(A.bark, loop, 0.1, 0.1, lip, { radial: 6, tub: 60, closed: true, vfn: (out, x, y, z) => out.multiplyScalar(0.75 + 0.5 * vnoise(x * 6, y * 6, z * 6)) });
  for (let i = 0; i < 11; i++) {
    const top = i < 6, th = top ? (0.25 + i * 0.5 / 5) * PI : (1.25 + (i - 6) * 0.5 / 4) * PI + 0.0, a = mouth.rx * 0.9 * Math.cos(th), y = mouth.y + mouth.ry * 0.9 * Math.sin(th), r = c.surf(a, y) + 0.02, L = (top ? 0.3 : 0.22) * (0.8 + rnd() * 0.4);
    const dy = top ? -1 : 1, geo = new T.ConeGeometry(0.055, L, 6, 1); geo.translate(0, L / 2, 0);
    A.bark.add(geo, c.matDir(Math.sin(a) * r, y, Math.cos(a) * r, -Math.sin(a) * 0.35, dy * 0.9, -Math.cos(a) * 0.35, 1, 1, 1), fang); geo.dispose();
  }
  // inner glow: a pool of ember-gold deep in the mouth, brighter when open
  const mouthG = new Acc(T), mg = new T.SphereGeometry(1, 14, 10);
  const rr = c.surf(0, mouth.y) + 0.05; mouthG.add(mg, c.mat(0, mouth.y - 0.25, rr + 0.0, 0, 0, 0, 0.3, 0.38, 0.05), c.col(GOLD)); mg.dispose();
  // knots: five glow discs spiralling up the front
  const knotG = new Acc(T), kn = [];
  for (let i = 0; i < 5; i++) {
    const y = 2.55 + i * 0.52, a = 0.38 * Math.sin(i * 1.8 + 0.6) * (i % 2 ? -1 : 1), r = c.surf(a, y) + 0.01, s0 = knotG.cnt;
    c.rbox(A.bark, 0.36, 0.3, 0.1, Math.sin(a) * r, y, Math.cos(a) * r, lip, a, 0, 0.3 * (i % 2 ? 1 : -1), 0.05);   // wooden bezel
    const sp = new T.SphereGeometry(1, 12, 8); knotG.add(sp, c.mat(Math.sin(a) * (r + 0.045), y, Math.cos(a) * (r + 0.045), 0, a, 0, 0.12 + 0.01 * i, 0.11, 0.035), c.col(GOLD)); sp.dispose();
    kn.push([s0, knotG.cnt - s0]); c.anchor('knot' + (i + 1), Math.sin(a) * r, y, Math.cos(a) * r, 2.5, { kind: 'knot', index: i });
  }
  // gourds: five hanging from vine-wrapped branches
  const gourdG = new Acc(T, true), gr = [], gp = [[0, 0], [0.16, 0.01], [0.28, 0.1], [0.32, 0.24], [0.26, 0.38], [0.14, 0.5], [0.12, 0.62], [0.16, 0.72], [0.14, 0.82], [0.06, 0.9], [0, 0.92]];
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5 + 0.62, y0 = 3.5 + (i % 2) * 0.5, r0 = c.surf(a, y0), reach = 2.1 + (i % 3) * 0.35;
    const pts = [[Math.sin(a) * (r0 - 0.2), y0 - 0.15, Math.cos(a) * (r0 - 0.2)], [Math.sin(a) * (r0 + reach * 0.4), y0 + 0.15, Math.cos(a) * (r0 + reach * 0.4)], [Math.sin(a + 0.08) * (r0 + reach), y0 + 0.02, Math.cos(a + 0.08) * (r0 + reach)]];
    c.tube(A.bark, pts, 0.17, 0.06, c.col(0x6a4e2c), { radial: 6, tub: 18, vfn: (out, x, y, z) => out.multiplyScalar(0.6 + 0.7 * vnoise(x * 3, y * 3, z * 3)) });
    const gx = Math.sin(a + 0.08) * (r0 + reach), gz = Math.cos(a + 0.08) * (r0 + reach), gy = y0 - 1.55;
    c.tube(A.wood, [[gx, y0 - 0.04, gz], [gx, y0 - 0.5, gz], [gx + 0.02, gy + 0.9, gz]], 0.025, 0.02, c.col(0x4f6a2a), { radial: 4, tub: 8 });
    const s0 = gourdG.cnt; const gl = new T.LatheGeometry(gp.map(q => new T.Vector2(q[0], q[1])), 14);
    gourdG.add(gl, c.mat(gx, gy, gz, 0, rnd() * TAU, 0, 0.85, 0.85, 0.85), c.col(0xffffff)); gl.dispose(); gr.push([s0, gourdG.cnt - s0]);
    c.anchor('gourd' + (i + 1), gx, gy + 0.4, gz, 1.5, { kind: 'gourd', index: i });
  }
  // coins embedded in the bark, and the chewing stump
  for (let i = 0; i < 7; i++) { const a = 0.9 + i * 0.82 + rnd() * 0.3, y = 0.5 + rnd() * 3.6; if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.7 && y < 2.9) continue; const r = c.surf(a, y) + 0.02, geo = new T.CylinderGeometry(0.17, 0.17, 0.045, 14); A.gold.add(geo, c.mat(Math.sin(a) * r, y, Math.cos(a) * r, PI / 2, a, 0.3), goldC.clone().multiplyScalar(0.8 + 0.4 * rnd())); geo.dispose(); }
  const sx = 0, sz = 1.38;   // stump in front of the mouth (partly inside the collision margin of the trunk)
  c.lathe(A.wood, [[0, 0], [0.4, 0], [0.44, 0.1], [0.34, 0.3], [0.31, 0.55], [0.34, 0.74], [0.4, 0.8], [0.37, 0.84], [0, 0.84]], 14, sx, 0, sz, c.col(0x7a5a38), 1, 1, 1, 0.3, (out, x, y, z) => out.multiplyScalar(0.7 + 0.6 * vnoise(x * 5, y * 4, z * 5)));
  const ringg = new T.TorusGeometry(0.3, 0.012, 4, 20); A.metal.add(ringg, c.mat(sx, 0.845, sz, PI / 2), c.col(0xb0a070)); ringg.dispose();
  c.anchor('hollow', 0, mouth.y, c.surf(0, mouth.y), 2.5, { kind: 'hollow' }); c.anchor('stump', sx, 0.9, sz, 2.0, { kind: 'stump' });
  // posts: gnarled knuckle stumps with coins
  const knuckle = (id, x, z, rot) => {
    c.post(id, x, z);
    c.lathe(A.bark, [[0, 0], [0.7, 0], [0.62, 0.2], [0.5, 0.5], [0.45, 0.9], [0.5, 1.15], [0.38, 1.3], [0.2, 1.38], [0, 1.4]], 12, x, 0, z, c.col(0x5e4628), 1, 1, 1, rot, (out, vx, vy, vz) => { out.multiplyScalar(0.55 + 0.9 * vnoise(vx * 3, vy * 2.5, vz * 3)); if (vy < 0.4) out.lerp(c.col(0x4d7a2a), 0.4); });
    for (let q = 0; q < 3; q++) { const a = rot + q * 2.1; c.tube(A.bark, [[x + Math.sin(a) * 0.45, 0.8, z + Math.cos(a) * 0.45], [x + Math.sin(a) * 0.9, 0.45, z + Math.cos(a) * 0.9], [x + Math.sin(a + 0.2) * 1.5, 0.04, z + Math.cos(a + 0.2) * 1.5]], 0.14, 0.03, c.col(0x5e4628), { radial: 5, tub: 14 }); }
    const geo = new T.CylinderGeometry(0.28, 0.28, 0.06, 16); A.gold.add(geo, c.mat(x + Math.sin(rot) * 0.1, 1.34, z + Math.cos(rot) * 0.1, -0.35, rot, 0.2), goldC); geo.dispose();   // a coin pressed into the top
    const g2 = new T.CylinderGeometry(0.2, 0.2, 0.05, 14); A.gold.add(g2, c.mat(x + Math.sin(rot + 1) * 0.5, 0.7, z + Math.cos(rot + 1) * 0.5, PI / 2 - 0.1, rot + 1, 0), goldC.clone().multiplyScalar(0.85)); g2.dispose();
    c.anchor(id, x, 0, z, 0.7 + 1.4);
  };
  knuckle('NE', 4.2, -4.2, 0.5); knuckle('NW', -4.2, -4.2, 2.2); knuckle('SE', 4.2, 4.2, 3.8); knuckle('SW', -4.2, 4.2, 5.4);
  const mouthMesh = c.addMesh(mouthG, c.mats.glow, 'mouthGlow'), knotMesh = c.addMesh(knotG, c.mats.glow, 'knots'), gourdMat = new T.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); c.own.push(gourdMat);
  const gourdMesh = c.addMesh(gourdG, gourdMat, 'gourds');
  let step = 0, filled = 0, open = 0;
  const paintKnots = () => kn.forEach(([s, n], i) => knotG.paint(s, n, step === 0 ? 0.12 : i < step - 1 ? 0.8 : i === step - 1 ? 1.5 : 0.12));
  const paintGourds = (pulse = 1) => gr.forEach(([s, n], i) => gourdG.paint(s, n, 1, i < filled ? c.col(GOLD).multiplyScalar(1.25 * pulse) : c.col(0x4a5028)));
  c.api.setStep = n => { step = clamp(Math.round(n), 0, 5); paintKnots(); };
  c.api.setGourds = n => { filled = clamp(Math.round(n), 0, 5); paintGourds(); };
  c.api.setMouth = o => { open = clamp(o, 0, 1); mouthG.paint(0, mouthG.cnt, 0.3 + 1.2 * open); };
  c.updaters.push((t) => { if (filled === 5) paintGourds(1 + 0.18 * Math.sin(t * 4)); });
  c.finishHooks = () => { c.api.setStep(0); c.api.setGourds(0); c.api.setMouth(0); };
  return finish(c, 'gambler');
}

// ================================================================ 8. MEMORY TREE (lavender): four coloured lanterns on the posts
function memory(c) {
  const { T, rnd, H, A } = c, LAV = 0x9aa8ff;
  c.cfg = { R: 1.0, flare: 0.42, rough: 0.9, K: 8, seed: 11, bark: 0x6f6a80, barkAlt: new T.Color(0x45445a), moss: 0x55606a, vein: LAV, ray: 0xaab4ff, rayOpacity: 0.1, veins: 5, roots: 7, rootLen: 3.7, rootR: 0.26, rootHi: 0.8, limbs: 5, limbReach: 3.3, limbR: 0.27, cards: 92, leaf: 0x8fa0ff, leaf2: 0xe0a8ff, mix: 0.3, leafMult: 1.45, canopyR: 4.5, litter: 0x5a5a88 };
  baseTree(c);
  const LC = [0xff4a42, 0x3f9bff, 0x52e068, 0xffd23c], spots = [['NE', 4.2, -4.2], ['NW', -4.2, -4.2], ['SE', 4.2, 4.2], ['SW', -4.2, 4.2]];
  const iron = c.col(0x2c2e36), wood = c.col(0x6a5a48), stone = c.col(0x8a8a92);
  // carved memory bands round the trunk (lavender glow) + a lens plaque on the front
  for (let i = 0; i < 4; i++) {
    const y = 0.95 + i * 1.15, pts = []; for (let j = 0; j <= 28; j++) { const a = j / 28 * TAU, r = c.surf(a, y + 0.06 * Math.sin(a * 3)) + 0.02; pts.push([Math.sin(a) * r, y + 0.06 * Math.sin(a * 3), Math.cos(a) * r]); }
    pts.pop(); c.tube(A.vein, pts, 0.026, 0.026, c.col(LAV).multiplyScalar(0.65), { radial: 4, tub: 56, closed: true });
  }
  const lens = c.surf(0, 1.55) + 0.01; c.rbox(A.stone, 0.62, 0.84, 0.1, 0, 1.55, lens, c.col(0x4c4a60), 0, 0, 0, 0.05);
  const lensG = new T.SphereGeometry(1, 16, 10); A.vein.add(lensG, c.mat(0, 1.55, lens + 0.05, 0, 0, 0, 0.17, 0.26, 0.04), c.col(LAV).multiplyScalar(1.2)); lensG.dispose();
  const glowAcc = new Acc(T), rngs = [];
  const shapeG = [new T.IcosahedronGeometry(1, 1), new T.OctahedronGeometry(1.15, 0), new T.BoxGeometry(1.5, 1.5, 1.5), new T.TetrahedronGeometry(1.35, 0)];
  const cage = (x, z) => {   // iron cage round a lantern at (x, 1.62, z)
    const ly = 1.62, w = 0.17;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) c.rbox(A.metal, 0.035, 0.5, 0.035, x + dx * w, ly, z + dz * w, iron, 0, 0, 0, 0.012);
    for (const yy of [ly - 0.25, ly + 0.25]) c.rbox(A.metal, w * 2.5, 0.045, w * 2.5, x, yy, z, iron, 0, 0, 0, 0.018);
    const cap = new T.ConeGeometry(0.28, 0.2, 8, 1); A.metal.add(cap, c.mat(x, ly + 0.37, z), iron); cap.dispose();
    const ringg = new T.TorusGeometry(0.06, 0.012, 5, 10); A.metal.add(ringg, c.mat(x, ly + 0.5, z), iron); ringg.dispose();
  };
  spots.forEach(([id, x, z], i) => {
    c.post(id, x, z);
    const sx = Math.sign(x), sz = Math.sign(z);
    // stone footing + wooden post with iron bands + curved arm toward the trunk
    c.lathe(A.stone, [[0, 0], [0.62, 0], [0.66, 0.1], [0.55, 0.22], [0.36, 0.32], [0.3, 0.4], [0, 0.4]], 12, x, 0, z, stone, 1, 1, 1, i, (out, vx, vy, vz) => out.multiplyScalar(0.7 + 0.5 * vnoise(vx * 3, vy * 3, vz * 3)));
    c.rbox(A.wood, 0.3, 2.45, 0.3, x, 1.6, z, wood, i * 0.4, 0, 0, 0.06, (out, vx, vy, vz) => out.multiplyScalar(0.7 + 0.6 * vnoise(vx * 6, vy * 2, vz * 6)));
    for (const yy of [0.7, 1.3, 2.7]) c.rbox(A.metal, 0.36, 0.06, 0.36, x, yy, z, iron, i * 0.4, 0, 0, 0.02);
    const lx = x - sx * 0.62, lz = z - sz * 0.62;   // the lantern hangs inward over the walkable floor
    c.tube(A.metal, [[x, 2.72, z], [x - sx * 0.25, 2.98, z - sz * 0.25], [lx + sx * 0.12, 2.9, lz + sz * 0.12], [lx, 2.8, lz]], 0.04, 0.03, iron, { radial: 5, tub: 18 });
    c.tube(A.metal, [[lx, 2.8, lz], [lx, 2.4, lz], [lx, 2.15, lz]], 0.012, 0.012, iron, { radial: 3, tub: 6 });
    cage(lx, lz);
    const s0 = glowAcc.cnt, cc = c.col(LC[i]), lit = [];
    glowAcc.add(shapeG[i], c.mat(lx, 1.62, lz, 0, i, 0.3, 0.17, 0.17, 0.17), cc);
    // floor ring in the lantern's colour under it, and a gem on the trunk base facing the post
    const fr = new T.RingGeometry(0.48, 0.62, 28); glowAcc.add(fr, c.mat(x - sx * 0.62, 0.035, z - sz * 0.62, -PI / 2), cc); fr.dispose();
    const ga = Math.atan2(x, z), gr = c.surf(ga, 0.7) + 0.01, gm = new T.OctahedronGeometry(1, 0); glowAcc.add(gm, c.mat(Math.sin(ga) * gr, 0.7, Math.cos(ga) * gr, 0, ga, 0, 0.1, 0.16, 0.06), cc); gm.dispose();
    rngs.push([s0, glowAcc.cnt - s0]);
    c.anchor(id, x, 1.0, z, 0.7 + 1.4, { kind: 'lantern', index: i, color: LC[i] }); c.anchors['lantern' + (i + 1)] = c.anchors[id];
  });
  shapeG.forEach(s => s.dispose());
  const glowMesh = c.addMesh(glowAcc, c.mats.glow, 'lanterns');
  const lv = [0, 0, 0, 0], paint = i => glowAcc.paint(rngs[i][0], rngs[i][1], 0.14 + 3.6 * lv[i]);
  c.api.setLantern = (i, level) => { lv[i] = clamp(level, 0, 1); paint(i); };
  c.api.setAllLanterns = level => { for (let i = 0; i < 4; i++) c.api.setLantern(i, level); };
  c.api.setTrunkGlow = k => c.api.setVeins(0.3 + 1.6 * clamp(k, 0, 1));
  c.api.lanternColors = LC.slice();
  c.finishHooks = () => { c.api.setAllLanterns(0.12); c.api.setTrunkGlow(0.4); };
  return finish(c, 'memory');
}

// ================================================================ 9. HOLLOW OAK (dark teal + amber): a root cave and a watching eye
function hollow(c) {
  const { T, rnd, H, A } = c, AMB = 0xffa828;
  c.cfg = { R: 1.05, flare: 0.5, rough: 1.2, K: 7, seed: 17, dents: [{ a: 0, y: 1.1, rx: 0.7, ry: 1.3, depth: 0.45 }], bark: 0x3e4636, barkAlt: new T.Color(0x23281e), moss: 0x3c6a40, vein: AMB, ray: 0x4a9a90, rayOpacity: 0.07, veins: 3, roots: 8, rootLen: 4.2, rootR: 0.3, rootHi: 0.8, limbs: 6, limbReach: 3.5, limbR: 0.32, cards: 110, leaf: 0x2c8f80, leaf2: 0x2a6a70, mix: 0.5, leafMult: 0.8, canopyR: 4.8, drop: 2.8, strands: 14, strandCol: 0x2a8a70, strandMult: 0.6, litter: 0x2a4a3a, litterMult: 0.45 };
  baseTree(c);
  const bark = c.col(0x4a5440), mossC = c.col(0x3c6a40), bk = (out, x, y, z) => { const n = vnoise(x * 2.5, y * 2, z * 2.5); out.multiplyScalar(0.5 + 0.8 * n); if (y > 1.5 && n > 0.55) out.lerp(mossC, 0.5); };
  // the nook: a root cave built from overlapping bark lumps on the open (+z) side. Interior ~1.6 m wide, centre (0, ~2.0)
  // an arch tunnel (half ellipse 1.15 x 1.55 about (0, 0.85)) of lumps in 5 slices from the trunk out to z = 2.9; interior darkened like the inside of a cave
  const cy = 0.85, RX = 0.95, RY = 1.5, TK = 0.38, zs = 0.4, ze = 2.95, NZ = 12, NP = 21;
  const profile = (rx, ry) => { const p = [[-rx, -0.05], [-rx, 0.35]]; for (let j = 0; j <= 16; j++) { const th = j / 16 * PI; p.push([-Math.cos(th) * rx, cy + Math.sin(th) * ry]); } p.push([rx, 0.35], [rx, -0.05]); return p; };
  const shell = (rx, ry, flip, vfn) => {   // organic arch surface: NZ+1 rings of the profile, lumpy
    const pr = profile(rx, ry), pos = [], uv = [], idx = [];
    for (let i = 0; i <= NZ; i++) for (let k = 0; k < NP; k++) {
      const z = zs + (ze - zs) * i / NZ, wob = 1 + 0.16 * (vnoise(k * 0.55 + flip * 5, z * 1.3, 3) - 0.5) * 2 * (i === 0 ? 0.3 : 1), dz = 0.1 * (vnoise(k * 0.9, z * 2, 8) - 0.5);
      pos.push(pr[k][0] * wob, Math.max(-0.05, cy + (pr[k][1] - cy) * wob), z + dz); uv.push(k / NP * 3, i / NZ * 3);
    }
    for (let i = 0; i < NZ; i++) for (let k = 0; k < NP - 1; k++) { const a = i * NP + k, b = a + 1, d = a + NP, e = d + 1; if (flip) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    A.bark.add(geo, c.mat(0, 0, 0), bark, vfn); geo.dispose();
  };
  shell(RX + TK, RY + TK, 1, (out, x, y, z) => { bk(out, x, y, z); const n = vnoise(x * 2, y * 2, z * 2); if (n > 0.5 && y > 1) out.lerp(mossC, 0.55); });
  shell(RX, RY, 0, (out, x, y, z) => { out.multiplyScalar(0.3 + 0.35 * vnoise(x * 3, y * 3, z * 3) * (1.3 - Math.min(1, (z - zs) / 2.2))); });
  { // front rim joining inner and outer shells at z = ze
    const pi = profile(RX, RY), po = profile(RX + TK, RY + TK), pos = [], idx = [];
    for (let k = 0; k < NP; k++) pos.push(pi[k][0], Math.max(-0.05, pi[k][1]), ze); for (let k = 0; k < NP; k++) pos.push(po[k][0], Math.max(-0.05, po[k][1]), ze);
    for (let k = 0; k < NP - 1; k++) idx.push(k, NP + k, k + 1, k + 1, NP + k, NP + k + 1);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2)); geo.setIndex(idx); geo.computeVertexNormals();
    A.bark.add(geo, c.mat(0, 0, 0), bark, (out, x, y, z) => { bk(out, x * 3, y * 3, z); }); geo.dispose();
  }
  // moss and fern cards draped over the cave and inside (dim)
  for (let i = 0; i < 14; i++) { const a = rnd() * TAU, s = 0.5 + rnd() * 0.5; c.card(Math.floor(rnd() * 3), (rnd() < 0.5 ? -1 : 1) * (1.0 + rnd() * 0.4), 1.2 + rnd() * 1.4, 1 + rnd() * 2.2, s * 0.8, s, a, (rnd() - 0.5) * 0.8, 0, c.col(0x2f7a58).multiplyScalar(0.8 + rnd() * 0.5)); }
  for (let i = 0; i < 6; i++) c.card(3, (rnd() - 0.5) * 2.0, 2.35 - 0.45, 2.9 + rnd() * 0.1, 0.4, 0.9 + rnd() * 0.6, rnd() * 0.4, 0, 0, c.col(0x2f7a58).multiplyScalar(0.9));   // curtain over the doorway lip
  // the eye above the nook
  const eyeG = new Acc(T), ey = 3.9, er = c.surf(0, ey) + 0.01;
  c.rbox(A.bark, 1.05, 0.62, 0.1, 0, ey, er - 0.01, c.col(0x2a3022), 0, 0, 0, 0.05);
  const sc = new T.SphereGeometry(1, 20, 12), iris = new T.SphereGeometry(1, 16, 10), pup = new T.BoxGeometry(1, 1, 1);
  eyeG.add(sc, c.mat(0, ey, er + 0.04, 0, 0, 0, 0.44, 0.22, 0.05), c.col(AMB).multiplyScalar(0.55));
  eyeG.add(iris, c.mat(0, ey, er + 0.075, 0, 0, 0, 0.17, 0.17, 0.03), c.col(AMB));
  eyeG.add(pup, c.mat(0, ey, er + 0.1, 0, 0, 0, 0.032, 0.17, 0.01), new T.Color(0, 0, 0));
  const mainCount = eyeG.cnt; sc.dispose(); iris.dispose(); pup.dispose();
  // floor of the nook: a faint amber capture ring
  const nookG = new T.RingGeometry(0.72, 0.9, 30), nookM = new T.MeshBasicMaterial({ color: new T.Color(AMB), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); c.own.push(nookM); c.geos.push(nookG);
  const nookR = new T.Mesh(nookG, nookM); nookR.rotation.x = -PI / 2; nookR.position.set(0, 0.03, 1.95); nookR.name = 'nookRing'; c.g.add(nookR);
  c.anchor('nook', 0, 0.05, 1.95, 0.9 + 1.4, { kind: 'capture', radius: 0.9 }); c.anchor('eye', 0, ey, er, 3, { kind: 'eye' });
  for (const [i, z] of [1.2, 1.9, 2.6].entries()) c.extraSolids.push({ id: 'nookL' + (i + 1), x: -1.15, z, r: 0.4 }, { id: "nookR" + (i + 1), x: 1.15, z, r: 0.4 });   // the arch walls (optional; the plan keeps solids to the 5 anchors)
  // posts: watching stumps with a pair of faint amber eyes
  const stump = (id, x, z, rot) => {
    c.post(id, x, z);
    c.lathe(A.bark, [[0, 0], [0.75, 0], [0.66, 0.25], [0.55, 0.6], [0.5, 1.0], [0.54, 1.35], [0.42, 1.55], [0.2, 1.62], [0, 1.6]], 12, x, 0, z, bark, 1, 1, 1, rot, bk);
    for (let q = 0; q < 3; q++) { const a = rot + q * 2.2 + 0.4; c.tube(A.bark, [[x + Math.sin(a) * 0.5, 0.7, z + Math.cos(a) * 0.5], [x + Math.sin(a) * 1.0, 0.35, z + Math.cos(a) * 1.0], [x + Math.sin(a + 0.2) * 1.6, 0.03, z + Math.cos(a + 0.2) * 1.6]], 0.15, 0.03, bark, { radial: 5, tub: 14, vfn: bk }); }
    c.rock(A.bark, x, 1.52, z, 0.5, 0.18, 0.5, mossC, rot * 3, { amp: 0.2, vfn: (out, vx, vy, vz) => out.multiplyScalar(0.6 + 0.7 * vnoise(vx * 5, vy, vz * 5)) });
    // eyes face the trunk
    const fa = Math.atan2(-x, -z), ge = new T.SphereGeometry(1, 10, 8);
    for (const s of [-1, 1]) { const ex = x + Math.sin(fa) * 0.5 + Math.cos(fa) * s * 0.17, ez = z + Math.cos(fa) * 0.5 - Math.sin(fa) * s * 0.17; eyeG.add(ge, c.mat(ex, 1.05, ez, 0, fa, 0, 0.055, 0.04, 0.03), c.col(AMB).multiplyScalar(0.3)); }
    ge.dispose(); c.anchor(id, x, 0, z, 0.7 + 1.4);
  };
  stump('NE', 4.2, -4.2, 0.3); stump('NW', -4.2, -4.2, 1.9); stump('SE', 4.2, 4.2, 4.1); stump('SW', -4.2, 4.2, 5.2);
  const eyeMesh = c.addMesh(eyeG, c.mats.glow, 'eyes');
  let ward = 0;
  const paint = () => { eyeG.paint(0, mainCount, 0.35 + 1.25 * ward); eyeG.paint(mainCount, eyeG.cnt - mainCount, 0.5 + 1.0 * ward); nookM.opacity = 0.22 + 0.55 * ward; c.api.setVeins(0.25 + 1.5 * ward); };
  c.api.setWarden = k => { ward = clamp(k, 0, 1); paint(); };
  c.updaters.push((t) => { if (ward > 0) { const k = 0.94 + 0.06 * Math.sin(t * 2.2); eyeG.paint(0, mainCount, (0.35 + 1.25 * ward) * k); } });
  c.finishHooks = () => c.api.setWarden(0);
  return finish(c, 'hollow');
}

// ================================================================ 10. ELDER TREE (pale gold): three root-stones, a seed niche, the giant wakes
function elder(c) {
  const { T, rnd, H, A } = c, PALE = 0xfff0b0, nicheDent = { a: 0, y: 1.45, rx: 0.4, ry: 0.5, depth: 0.22 };
  c.cfg = { R: 1.05, flare: 0.8, rough: 1.5, K: 10, seed: 23, bark: 0x8a8472, barkAlt: new T.Color(0x5a5648), moss: 0x6a8a4a, vein: PALE, ray: 0xffe8a0, rayOpacity: 0.16, veins: 9, roots: 12, rootLen: 4.6, rootR: 0.3, rootHi: 1.1, limbs: 8, limbReach: 4.2, limbR: 0.4, cards: 170, leaf: 0x70e090, leaf2: 0xffe9a0, mix: 0.45, leafMult: 1.5, canopyR: 5.4, drop: 3.0, strands: 22, strandCol: 0xb8e890, strandMult: 1.2, leafSize: 1.1, dents: [nicheDent], litter: 0x9a8a50 };
  baseTree(c);
  const rune = c.col(0xffc860), stoneC = c.col(0x7b7870), cradle = c.col(0x7a7462);
  // seed niche: a little claw cradle of roots round the dent
  for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.26, r = c.surf(a, 0.9) + 0.0, x0 = Math.sin(a) * r, z0 = Math.cos(a) * r; c.tube(A.bark, [[x0, 0.85, z0], [Math.sin(a * 1.3) * (r + 0.28), 1.0, Math.cos(a * 1.3) * (r + 0.28)], [Math.sin(a * 0.6) * (r + 0.08), 1.22, Math.cos(a * 0.6) * (r + 0.08)]], 0.075, 0.03, cradle, { radial: 5, tub: 12 }); }
  const seedG = new Acc(T), sp = [[0, 0], [0.1, 0.02], [0.2, 0.1], [0.24, 0.24], [0.2, 0.38], [0.1, 0.5], [0.02, 0.56], [0, 0.57]], sl = new T.LatheGeometry(sp.map(q => new T.Vector2(q[0], q[1])), 14);
  const sr = c.surf(0, 1.45) + 0.12; seedG.add(sl, c.mat(0, 1.2, sr, 0.15, 0, 0), c.col(PALE)); sl.dispose();
  c.anchor('seed', 0, 1.5, sr, 2.5, { kind: 'seed' });
  // three root-stones with a rune, a gauge and a conduit running to the trunk (one glow mesh for all of them)
  const glowAcc = new Acc(T), stones = [], spots = [['NE', 4.2, -4.2], ['NW', -4.2, -4.2], ['SE', 4.2, 4.2]];
  const strokeSets = [[[0, -0.5, 0, 0.5], [-0.28, 0.1, 0.28, 0.1], [-0.28, -0.3, 0, -0.1], [0.28, -0.3, 0, -0.1]], [[-0.25, -0.5, -0.25, 0.5], [0.25, -0.5, 0.25, 0.5], [-0.25, 0, 0.25, 0]], [[-0.3, -0.45, 0.3, -0.45], [0, -0.45, 0, 0.5], [-0.3, 0.5, 0.3, 0.5], [-0.3, 0.05, 0.3, 0.05]]];
  spots.forEach(([id, x, z], i) => {
    c.post(id, x, z);
    const fa = Math.atan2(-x, -z), fx = Math.sin(fa), fz = Math.cos(fa), ox = Math.cos(fa), oz = -Math.sin(fa);   // toward the trunk, and sideways
    c.rock(A.stone, x, 1.2, z, 0.64, 1.45, 0.6, stoneC, i * 7 + 2, { amp: 0.22, freq: 1.4, flat: 0.95, vfn: (out, vx, vy, vz) => { const n = vnoise(vx * 3, vy * 2, vz * 3); out.multiplyScalar(0.6 + 0.8 * n); if (vy < 0.5) out.lerp(c.col(0x5a7a40), 0.35); } });
    for (let q = 0; q < 3; q++) { const a = i + q * 2.1; c.rock(A.stone, x + Math.sin(a) * 0.6, 0.12, z + Math.cos(a) * 0.6, 0.26, 0.16, 0.22, stoneC, q + i * 3, { amp: 0.25 }); }
    const s0 = glowAcc.cnt, n = { rune: null, gauge: [], conduit: [] }, fxo = x + fx * 0.68, fzo = z + fz * 0.68;
    // rune strokes on the trunk-facing side of the stone
    const rs = glowAcc.cnt;
    for (const [x0, y0, x1, y1] of strokeSets[i]) {
      const len = Math.hypot(x1 - x0, y1 - y0) * 0.95, mx = (x0 + x1) / 2 * 0.95, my = (y0 + y1) / 2 * 0.95, ang = Math.atan2(y1 - y0, x1 - x0), b = new T.BoxGeometry(len + 0.05, 0.055, 0.04);
      glowAcc.add(b, c.mat(fxo + ox * mx, 1.45 + my * 0.95, fzo + oz * mx, 0, fa + PI, ang), rune); b.dispose();
    }
    n.rune = [rs, glowAcc.cnt - rs];
    // gauge: 8 small segments in a groove beside the rune
    c.rbox(A.stone, 0.12, 1.14, 0.06, fxo + ox * 0.42 - fx * 0.02, 1.0, fzo + oz * 0.42 - fz * 0.02, c.col(0x2c2c2e), fa + PI, 0, 0, 0.02);
    for (let q = 0; q < 8; q++) { const g0 = glowAcc.cnt, b = new T.BoxGeometry(0.07, 0.11, 0.04); glowAcc.add(b, c.mat(fxo + ox * 0.42 + fx * 0.03, 0.5 + q * 0.14, fzo + oz * 0.42 + fz * 0.03, 0, fa + PI, 0), rune); b.dispose(); n.gauge.push([g0, glowAcc.cnt - g0]); }
    // conduit: ten floor plates from the stone toward the trunk
    for (let q = 0; q < 10; q++) { const t = (q + 0.5) / 10, d0 = 0.8, d1 = Math.hypot(x, z) - 1.35, d = d0 + (d1 - d0) * t, c0 = glowAcc.cnt, b = new T.BoxGeometry(0.1, 0.02, (d1 - d0) / 10 * 0.82); glowAcc.add(b, c.mat(x + fx * d, 0.03, z + fz * d, 0, fa + PI, 0), rune); b.dispose(); n.conduit.push([c0, glowAcc.cnt - c0]); }
    stones.push(n); c.anchor(id, x, 1.0, z, 0.7 + 1.4, { kind: 'rootstone', index: i }); c.anchors['stone' + (i + 1)] = c.anchors[id];
  });
  // SW: the rootling den (broken ground, dark hole, pushed-up roots)
  { const x = -4.2, z = 4.2; c.post('SW', x, z);
    for (let q = 0; q < 8; q++) { const a = q * TAU / 8; c.rock(A.stone, x + Math.sin(a) * 0.55, 0.16, z + Math.cos(a) * 0.55, 0.3, 0.3 + 0.12 * (q % 3), 0.3, stoneC, q + 40, { amp: 0.3 }); }
    for (let q = 0; q < 5; q++) { const a = q * 1.3 + 0.2; c.tube(A.bark, [[x + Math.sin(a) * 0.2, 0.0, z + Math.cos(a) * 0.2], [x + Math.sin(a) * 0.5, 0.75, z + Math.cos(a) * 0.5], [x + Math.sin(a + 0.5) * 0.85, 0.25 + 0.2 * (q % 2), z + Math.cos(a + 0.5) * 0.85]], 0.1, 0.035, c.col(0x6a5a40), { radial: 5, tub: 14 }); }
    const hole = new T.CircleGeometry(0.5, 16); A.stone.add(hole, c.mat(x, 0.34, z, -PI / 2), c.col(0x0c0a08)); hole.dispose(); c.anchor('SW', x, 0, z, 0.7 + 1.4); c.anchors.den = c.anchors.SW; }
  const glowMesh = c.addMesh(glowAcc, c.mats.glow, 'rootstones'), seedMesh = c.addMesh(seedG, c.mats.glow, 'seed');
  const prog = [0, 0, 0]; let wake = 0, withered = false, seedOn = false;
  const paintStone = i => {
    const p = prog[i], n = stones[i];
    glowAcc.paint(n.rune[0], n.rune[1], 0.08 + 1.15 * p);
    n.gauge.forEach(([s, k], q) => glowAcc.paint(s, k, clamp(p * 8 - q, 0, 1) * 1.2 + 0.06));
    n.conduit.forEach(([s, k], q) => glowAcc.paint(s, k, clamp(p * 10 - q, 0, 1) * 1.1 + 0.04));
  };
  const apply = () => {
    c.api.setVeins(withered ? 0.04 : 0.25 + 2.2 * wake); c.api.setRing(withered ? 0 : wake);
    c.leafM.color.setRGB(withered ? 0.55 : 0.4 + 0.9 * wake, withered ? 0.45 : 0.4 + 0.9 * wake, withered ? 0.3 : 0.4 + 0.9 * wake);
    c.rayM.opacity = withered ? 0.02 : 0.05 + 0.16 * wake;
  };
  c.api.setStone = (i, p) => { prog[i] = clamp(p, 0, 1); paintStone(i); };
  c.api.setWake = k => { wake = clamp(k, 0, 1); apply(); };
  c.api.setSeed = on => { seedOn = !!on; if (seedMesh) seedMesh.visible = seedOn; };
  c.api.setWithered = b => { withered = !!b; apply(); };
  c.updaters.push((t) => { if (seedOn && seedG.cnt) seedG.paint(0, seedG.cnt, 2.4 + 0.7 * Math.sin(t * 3)); if (wake > 0.6 && !withered) c.api.setVeins(0.25 + 2.2 * wake + 0.35 * Math.sin(t * 5)); });
  c.finishHooks = () => { for (let i = 0; i < 3; i++) c.api.setStone(i, 0); c.api.setWake(0); c.api.setSeed(false); };
  return finish(c, 'elder');
}

const BUILDERS = { thorn, gambler, memory, hollow, elder };

// ---------------------------------------------------------------- public entry
export function buildTreeRoom(THREE, helpers, type, opts = {}) {
  const t = norm(type); if (!t) return null;
  const c = makeCtx(THREE, t, opts, null);
  const group = BUILDERS[t](c);
  if (c.finishHooks) c.finishHooks();
  group.userData.api.size = c.S;
  return group;
}
export const TREE_B_INFO = {
  thorn: { name: 'Thorn Shrine', tint: 0xff3a52, setters: ['setGrip(0..3)', 'setBowl(0..3)'] },
  gambler: { name: "Gambler's Root", tint: 0xffc83a, setters: ['setStep(0..5)', 'setGourds(0..5)', 'setMouth(0..1)'] },
  memory: { name: 'Memory Tree', tint: 0x9aa8ff, setters: ['setLantern(i,0..1)', 'setAllLanterns(0..1)', 'setTrunkGlow(0..1)'] },
  hollow: { name: 'Hollow Oak', tint: 0xffa828, setters: ['setWarden(0..1)'] },
  elder: { name: 'Elder Tree', tint: 0xfff0b0, setters: ['setStone(i,0..1)', 'setWake(0..1)', 'setSeed(bool)', 'setWithered(bool)'] },
};
export default buildTreeRoom;

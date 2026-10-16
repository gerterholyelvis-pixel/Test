// Goblin King 5x5 tree room art, part A: Sapling Well, Brain Press, Healing Spring, Seer's Tree, Grafting Bench.
// See docs/reports/trees-a-art.md for the integration notes (anchors, setters, solids).
//
//   buildTreeRoom(THREE, helpers, type, opts) -> THREE.Group   (type: 'well' | 'press' | 'spring' | 'seer' | 'graft')
//   helpers = { mergeGeometries }              (from three/addons/utils/BufferGeometryUtils.js)
//   opts    = { seed }                          (optional; default is a hash of the type)
//
// Group origin = the centre of the 15 x 15 m cell, floor at y = 0, ceiling at y = 6.5. North is -z, east is +x.
// The group carries: group.solids  (array of {x, z, r}, cell-local),
//                    group.anchors (name -> Object3D at the interactable; .userData.r = interaction radius),
//                    group.api     (setters + update(dt, t) + dispose()); same object as group.userData.api.
// Everything is merged per material (no lights; emissive / basic materials for glow). Materials are shared per THREE
// instance except the few that carry per-room state (cloned per room).
const TAU = Math.PI * 2, PI = Math.PI, P4 = 4.2, H = 6.5;
export const TREE_A_TYPES = ['well', 'press', 'spring', 'seer', 'graft'];
export const TREE_ANCHORS = { C: { x: 0, z: 0, r: 1.1 }, NE: { x: P4, z: -P4, r: 0.7 }, NW: { x: -P4, z: -P4, r: 0.7 }, SE: { x: P4, z: P4, r: 0.7 }, SW: { x: -P4, z: P4, r: 0.7 } };

const hf = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };
function mulberry(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;

// ---------- palettes (the shared tree-room identity = bark + glowing sap veins + leaf canopy in the type colour + glowing floor ring) ----------
const PAL = {
  well:   { bark: 0xa07848, moss: 0x5f8a3a, sap: 0x86ff8c, leafD: 0x2f7d34, leafL: 0xa6ee6c, accent: 0x86ff8c, stone: 0xb9b2a2 },
  press:  { bark: 0x5e433b, moss: 0x5a2a20, sap: 0xff5a2a, leafD: 0x7a2418, leafL: 0xf0813a, accent: 0xff6a30, stone: 0x8e8478, liquid: 0xff6fa8 },
  spring: { bark: 0xd9d2c0, moss: 0x6d9c64, sap: 0x62ecff, leafD: 0x24a3b4, leafL: 0xc2fff2, accent: 0x62ecff, stone: 0xc4cbc8 },
  seer:   { bark: 0x7d6ba3, moss: 0x3d3160, sap: 0xb06cff, leafD: 0x6a35c8, leafL: 0xe2bcff, accent: 0xb06cff, stone: 0x8b84a0 },
  graft:  { bark: 0xa47c52, moss: 0x6c8a34, sap: 0xdcf54a, leafD: 0x5c8a2c, leafL: 0xeaf56c, accent: 0xdcf54a, stone: 0xbdb59f }
};
const TREE_OPT = {   // trunk silhouette per type
  well:   { rMid: 0.7, flare: 1.0, top: 0.9, butt: 0.55, nb: 5, ph: 0.4, ridge: 0.09, nr: 6, twist: 0.25, lean: 0.12, veins: 6, canopy: 'round', roots: 9 },
  press:  { rMid: 0.74, flare: 0.9, top: 0.7, butt: 0.7, nb: 4, ph: 1.9, ridge: 0.17, nr: 7, twist: 0.95, lean: 0.35, veins: 7, canopy: 'ragged', roots: 8 },
  spring: { rMid: 0.62, flare: 0.8, top: 0.8, butt: 0.85, nb: 6, ph: 0.9, ridge: 0.05, nr: 9, twist: 0.2, lean: 0.1, veins: 5, canopy: 'weeping', roots: 8, arch: true },
  seer:   { rMid: 0.74, flare: 0.8, top: 0.8, butt: 0.5, nb: 5, ph: 2.6, ridge: 0.15, nr: 5, twist: 0.5, lean: 0.06, veins: 8, canopy: 'crystal', roots: 8 },
  graft:  { rMid: 0.78, flare: 0.9, top: 0.9, butt: 0.55, nb: 6, ph: 1.2, ridge: 0.10, nr: 6, twist: -0.4, lean: 0.14, veins: 4, canopy: 'dense', roots: 8 }
};

// ---------- procedural textures (<= 256 px, once per THREE) ----------
function canvas(w, h, fn) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h, mulberry(w * 31 + h * 7 + fn.toString().length)); return c; }
function makeTextures(THREE) {
  const T = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const bark = T(canvas(256, 256, (g, w, h, r) => {
    g.fillStyle = '#a79a8a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 170; i++) { const x = r() * w, ww = 1 + r() * 4; g.fillStyle = r() < 0.6 ? 'rgba(40,28,20,' + (0.1 + r() * 0.3) + ')' : 'rgba(255,240,220,' + (0.05 + r() * 0.12) + ')'; g.fillRect(x, 0, ww, h); }
    for (let k = 0; k < 26; k++) { let x = r() * w, y = r() * h; g.strokeStyle = 'rgba(25,16,10,' + (0.35 + r() * 0.35) + ')'; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 7; y += 8 + r() * 14; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(30,22,16,' + r() * 0.22 + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 4); }
  }));
  const stone = T(canvas(256, 256, (g, w, h, r) => {
    g.fillStyle = '#c4beb2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(60,56,50,' + r() * 0.16 + ')' : 'rgba(255,252,244,' + r() * 0.14 + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let row = 0; row < 4; row++) { const y = row * 64; g.fillStyle = 'rgba(40,36,30,0.28)'; g.fillRect(0, y, w, 2); for (let x = (row % 2) * 64; x < w; x += 128) g.fillRect(x, y, 2, 64); }
    for (let k = 0; k < 9; k++) { let x = r() * w, y = r() * h; g.strokeStyle = 'rgba(30,26,22,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 16; y += (r() - 0.3) * 14; g.lineTo(x, y); } g.stroke(); }
  }));
  const wood = T(canvas(256, 256, (g, w, h, r) => {
    g.fillStyle = '#c9a97a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const y = r() * h; g.strokeStyle = r() < 0.7 ? 'rgba(70,42,18,' + (0.08 + r() * 0.22) + ')' : 'rgba(255,235,200,0.12)'; g.lineWidth = 0.6 + r() * 2; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 2.5); g.stroke(); }
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(50,30,12,0.5)'; g.fillRect(i * 64 - 1, 0, 2, h); }
    for (let i = 0; i < 24; i++) { g.fillStyle = 'rgba(30,18,8,' + (0.2 + r() * 0.3) + ')'; g.fillRect(r() * w, r() * h, 4 + r() * 10, 1); }
  }));
  const leaf = new THREE.CanvasTexture(canvas(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.fillRect(0, h - 6, 6, 6);   // solid texel at uv (0.02, 0.02): buds and flat shards sample it
    g.save(); g.translate(w / 2, h / 2); g.beginPath(); g.moveTo(0, -56); g.bezierCurveTo(34, -34, 36, 20, 0, 58); g.bezierCurveTo(-36, 20, -34, -34, 0, -56); g.closePath();
    const gr = g.createLinearGradient(0, -56, 0, 58); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b9b9b9'); g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -50); g.lineTo(0, 54); g.stroke(); g.lineWidth = 1;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(0, i * 14); g.lineTo(18, i * 14 - 12); g.moveTo(0, i * 14); g.lineTo(-18, i * 14 - 12); g.stroke(); }
    g.restore();
  }));
  leaf.colorSpace = THREE.SRGBColorSpace;
  const ripple = T(canvas(128, 128, (g, w, h, r) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) { const x = r() * w, y = r() * h, rr = 6 + r() * 22; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { g.strokeStyle = 'rgba(255,255,255,' + (0.25 + r() * 0.3) + ')'; g.lineWidth = 1 + r() * 1.4; g.beginPath(); g.arc(x + ox, y + oy, rr, 0, TAU); g.stroke(); } }
  }));
  const glyphs = new THREE.CanvasTexture(canvas(480, 80, (g, w, h) => {   // 6 glyph cells, 80 px each, white on near-black violet
    g.fillStyle = '#241a3a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let k = 0; k < 6; k++) {
      g.save(); g.translate(k * 80 + 40, 40); g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.strokeRect(-37, -37, 74, 74); g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath();
      if (k === 0) { g.arc(0, 0, 20, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill(); }
      else if (k === 1) { g.moveTo(0, -24); g.lineTo(24, 20); g.lineTo(-24, 20); g.closePath(); g.stroke(); }
      else if (k === 2) { g.moveTo(0, -26); g.lineTo(22, 0); g.lineTo(0, 26); g.lineTo(-22, 0); g.closePath(); g.stroke(); }
      else if (k === 3) { g.moveTo(-20, -20); g.lineTo(20, 20); g.moveTo(20, -20); g.lineTo(-20, 20); g.stroke(); }
      else if (k === 4) { g.arc(0, 0, 22, 0.6, TAU - 0.6); g.stroke(); g.beginPath(); g.arc(8, 0, 12, 0, TAU); g.fill(); }
      else { g.moveTo(-26, 6); g.quadraticCurveTo(-13, -22, 0, 6); g.quadraticCurveTo(13, 34, 26, 6); g.stroke(); }
      g.restore();
    }
  }));
  glyphs.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.CanvasTexture(canvas(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }));
  return { bark, stone, wood, leaf, ripple, glyphs, glow };
}

// ---------- kit: shared materials and base geometries, built once per THREE instance ----------
const KITS = new WeakMap();
function getKit(THREE) {
  let k = KITS.get(THREE); if (k) return k;
  const tex = makeTextures(THREE), std = o => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, ...o });
  const mat = {
    bark: std({ map: tex.bark, roughness: 0.96, emissive: 0x20160f }), stone: std({ map: tex.stone, roughness: 0.9 }), wood: std({ map: tex.wood, roughness: 0.82 }),
    metal: std({ roughness: 0.42, metalness: 0.7 }), flesh: std({ roughness: 0.55 }),
    sap: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    leaf: new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.leaf, alphaTest: 0.45, side: THREE.DoubleSide }),
    crystal: new THREE.MeshBasicMaterial({ vertexColors: true }),
    water: new THREE.MeshBasicMaterial({ vertexColors: true, map: tex.ripple, transparent: true, opacity: 0.84, depthWrite: false })
  };
  k = { tex, mat, plane: new THREE.PlaneGeometry(1, 1), geo: new Map() };
  KITS.set(THREE, k); return k;
}

// ---------- geometry makers ----------
function memoGeo(kit, key, make) { let g = kit.geo.get(key); if (!g) { g = make(); kit.geo.set(key, g); } return g; }
function rbox(THREE, kit, w, h, d, b = 0.03) {   // bevelled box (extruded rounded rectangle), centred
  b = Math.min(b, w / 2.2, h / 2.2, d / 2.2);
  return memoGeo(kit, 'rb' + [w, h, d, b].map(v => v.toFixed(3)).join(), () => {
    const iw = w / 2 - b, ih = h / 2 - b, r = b * 0.9, s = new THREE.Shape();
    s.moveTo(-iw + r, -ih); s.lineTo(iw - r, -ih); s.quadraticCurveTo(iw, -ih, iw, -ih + r); s.lineTo(iw, ih - r); s.quadraticCurveTo(iw, ih, iw - r, ih); s.lineTo(-iw + r, ih); s.quadraticCurveTo(-iw, ih, -iw, ih - r); s.lineTo(-iw, -ih + r); s.quadraticCurveTo(-iw, -ih, -iw + r, -ih);
    const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 3 });
    g.translate(0, 0, -(d - 2 * b) / 2); return g;
  });
}
function lathe(THREE, pts, seg = 20) { return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); }
function cylG(THREE, kit, rt, rb, h, seg = 16, open = false) { return memoGeo(kit, 'cy' + [rt, rb, h, seg, open].join(), () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)); }
function sphG(THREE, kit, r = 1, ws = 12, hs = 8) { return memoGeo(kit, 'sp' + [r, ws, hs].join(), () => new THREE.SphereGeometry(r, ws, hs)); }
function torG(THREE, kit, R, r, rs = 8, ts = 28) { return memoGeo(kit, 'to' + [R, r, rs, ts].join(), () => new THREE.TorusGeometry(R, r, rs, ts)); }
function jitter(THREE, g, amp) {   // organic radial wobble (hash of rounded position so lathe seams stay closed)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), h = hf(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40)), k = 1 + amp * (h - 0.5); p.setXYZ(i, x * k, y + amp * 0.15 * (h - 0.5), z * k); }
  g.computeVertexNormals(); return g;
}
function tubeG(THREE, pts, r0, r1, seg = 12, rad = 6) {   // tapered tube along a Catmull-Rom path; r0/r1 numbers or fn(t)
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), fr = curve.computeFrenetFrames(seg, false);
  const rf = typeof r0 === 'function' ? r0 : t => lerp(r0, r1, t), pos = [], nor = [], uv = [], idx = [], len = curve.getLength();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], r = rf(t);
    for (let j = 0; j <= rad; j++) { const a = j / rad * TAU, ca = Math.cos(a), sa = Math.sin(a), nx = N.x * ca + B.x * sa, ny = N.y * ca + B.y * sa, nz = N.z * ca + B.z * sa; pos.push(c.x + nx * r, c.y + ny * r, c.z + nz * r); nor.push(nx, ny, nz); uv.push(j / rad * 2, t * len / 2); }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

// ---------- builder: collects geometry per material key, bakes colour + transform, merges at build() ----------
function mkBuilder(THREE, mergeGeometries) {
  const L = {}, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color(), n3 = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3();
  let frame = null;
  return {
    at(x, z, ry) { frame = x === undefined ? null : new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry || 0), new THREE.Vector3(1, 1, 1)); },
    // o: p [x,y,z], r [rx,ry,rz], s [sx,sy,sz], c colour, j colour jitter, ao (darken near floor), keep (keep geometry's own colours), facet (per-face shading)
    add(key, geo, o = {}) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv' && n !== 'color') g.deleteAttribute(n);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (o.uv) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, o.uv[0], o.uv[1]); }
      const p = o.p || [0, 0, 0], r = o.r || [0, 0, 0], s = o.s || [1, 1, 1];
      e.set(r[0], r[1], r[2]); q.setFromEuler(e); m4.compose(v3.set(p[0], p[1], p[2]), q, s3.set(s[0], s[1], s[2]));
      if (frame) m4.premultiply(frame);
      g.applyMatrix4(m4);
      const pos = g.attributes.position, n = pos.count, own = o.keep && g.attributes.color, arr = new Float32Array(n * 3), jit = o.j === undefined ? 0.12 : o.j;
      col.set(o.c === undefined ? 0xffffff : o.c);
      for (let i = 0; i < n; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        let k = 1 - jit * hf(Math.round(x * 30), Math.round(y * 30), Math.round(z * 30));
        if (o.ao !== false) k *= 0.8 + 0.2 * clamp(y / 0.8, 0, 1);
        if (own) { arr[i * 3] = own.getX(i) * k; arr[i * 3 + 1] = own.getY(i) * k; arr[i * 3 + 2] = own.getZ(i) * k; } else { arr[i * 3] = col.r * k; arr[i * 3 + 1] = col.g * k; arr[i * 3 + 2] = col.b * k; }
      }
      if (o.facet) for (let i = 0; i + 2 < n; i += 3) {   // flat-shaded crystal faces: brightness from the face normal
        a3.set(pos.getX(i + 1) - pos.getX(i), pos.getY(i + 1) - pos.getY(i), pos.getZ(i + 1) - pos.getZ(i)); b3.set(pos.getX(i + 2) - pos.getX(i), pos.getY(i + 2) - pos.getY(i), pos.getZ(i + 2) - pos.getZ(i)); n3.crossVectors(a3, b3).normalize();
        const f = 0.5 + 0.34 * n3.y + 0.16 * n3.x + 0.1 * (hf(i, n, 3) - 0.5); for (let v = 0; v < 3; v++) { arr[(i + v) * 3] *= f; arr[(i + v) * 3 + 1] *= f; arr[(i + v) * 3 + 2] *= f; }
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      (L[key] || (L[key] = [])).push(g);
    },
    build(parent, mats, prefix = '') {
      const out = {};
      for (const key of Object.keys(L)) { const geo = mergeGeometries(L[key], false); for (const g of L[key]) g.dispose(); const m = new THREE.Mesh(geo, mats[key]); m.name = prefix + key; parent.add(m); out[key] = m; }
      return out;
    }
  };
}
const dynMesh = (THREE, geo, mat, c, name) => {   // a standalone (animated) mesh with a flat vertex colour
  const g = geo.clone(), n = g.attributes.position.count, col = new THREE.Color(c), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); const m = new THREE.Mesh(g, mat); m.name = name || ''; return m;
};

const dynMerged = (THREE, merge, parts, mat, name) => {   // several flat-coloured parts merged into one animated mesh
  const geos = parts.map(([g, c]) => { const d = dynMesh(THREE, g, mat, c).geometry; return d.index ? d.toNonIndexed() : d; });
  const m = new THREE.Mesh(merge(geos, false), mat); m.name = name || ''; return m;
};

// ---------- the shared tree: trunk through the ceiling, glowing sap veins, canopy, roots, floor ring, ceiling collar ----------
function trunkProfile(o) {
  const R = (y, t) => {
    const base = o.rMid + o.flare * Math.exp(-y * 1.5) + o.top * Math.exp(-(H - y) * 1.6), but = o.butt * Math.exp(-y * 2.0) * Math.pow(Math.max(0, Math.sin(o.nb * t + o.ph)), 2);
    return (base + but) * (1 + o.ridge * Math.sin(o.nr * (t + o.twist * y)) * (0.6 + 0.4 * Math.sin(y * 1.7 + t * 2)));
  };
  const lean = y => [o.lean * Math.sin(y * 0.7) * y / H, o.lean * 0.6 * Math.cos(y * 0.5) * y / H];
  return { R, lean };
}
function trunkGeo(THREE, o, pal, twoTone) {
  const seg = 32, rows = 30, { R, lean } = trunkProfile(o), pos = [], nor = [], uv = [], colr = [], idx = [], bark = new THREE.Color(pal.bark), moss = new THREE.Color(pal.moss), c = new THREE.Color(), pale = new THREE.Color(0xe6d9b0);
  for (let j = 0; j <= rows; j++) {
    const y = Math.pow(j / rows, 1.15) * H, [lx, lz] = lean(y);
    for (let i = 0; i <= seg; i++) {
      const t = i / seg * TAU, r = R(y, t); pos.push(Math.cos(t) * r + lx, y, Math.sin(t) * r + lz); nor.push(0, 1, 0); uv.push(i / seg * 3, y / 2.5);
      const rid = Math.sin(o.nr * (t + o.twist * y)), b = 0.78 + 0.22 * rid * 0.5 + 0.1 * Math.sin(y * 2.3 + t * 3);
      c.copy(bark); if (twoTone) c.lerp(pale, Math.max(0, Math.sin(t + 0.5)) * 0.8 * (1 - clamp(y / 6, 0, 1) * 0.3)); c.lerp(moss, clamp(1 - y / 0.9, 0, 1) * 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + 1))); c.multiplyScalar(b * (0.65 + 0.35 * clamp(y / 1.2, 0, 1)));
      colr.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
  g.computeVertexNormals(); return g;
}
function canopy(THREE, kit, bt, style, pal, rnd, o) {
  const dark = new THREE.Color(pal.leafD), light = new THREE.Color(pal.leafL), c = new THREE.Color(), up = a => a;
  const tint = (t) => c.copy(dark).lerp(light, clamp(t, 0, 1)).getHex();
  const limb = (a, r, y1, r1) => bt.add('bark', tubeG(THREE, [[Math.cos(a) * 0.5, 4.7, Math.sin(a) * 0.5], [Math.cos(a) * r * 0.5, 5.4 + (y1 - 5.4) * 0.5, Math.sin(a) * r * 0.5], [Math.cos(a) * r, y1, Math.sin(a) * r]], 0.2, 0.05, 9, 6), { c: pal.bark, keep: false });
  if (style === 'round' || style === 'dense' || style === 'ragged') {
    const n = style === 'dense' ? 170 : style === 'ragged' ? 84 : 150, R0 = style === 'dense' ? 3.1 : 3.4;
    for (let i = 0; i < 5; i++) limb(i / 5 * TAU + rnd() * 0.5, 2.2 + rnd() * 1.3, 5.7 + rnd() * 0.5 - (style === 'ragged' ? 0.7 : 0), 0.05);
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, rr = 0.8 + Math.sqrt(rnd()) * R0, y = (style === 'ragged' ? 5.9 : 6.15) - rr * 0.1 - rnd() * 0.9 + 0.12 * Math.sin(a * 3), s = 0.36 + rnd() * 0.32 * (style === 'ragged' ? 0.8 : 1);
      bt.add('leaf', kit.plane, { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: [(rnd() - 0.5) * 1.3 + 0.9, a + rnd() * 2, (rnd() - 0.5) * 1.2], s: [s * 0.7, s, 1], c: tint(rnd() * 0.65 + (y - 4.9) * 0.25), j: 0.05, ao: false });
    }
  } else if (style === 'crystal') {
    const oct = memoGeo(kit, 'oct', () => new THREE.OctahedronGeometry(1));
    for (let i = 0; i < 6; i++) limb(i / 6 * TAU + rnd() * 0.4, 2.0 + rnd() * 1.4, 5.9, 0.05);
    for (let i = 0; i < 62; i++) {
      const a = rnd() * TAU, rr = 0.7 + Math.sqrt(rnd()) * 3.2, y = 6.05 - rr * 0.1 - rnd() * 0.9, s = 0.1 + rnd() * 0.17;
      bt.add('crystal', oct, { p: [Math.cos(a) * rr, y, Math.sin(a) * rr], r: [(rnd() - 0.5) * 1.3, a, (rnd() - 0.5) * 1.3 + (rnd() < 0.5 ? PI : 0)], s: [s, s * (1.8 + rnd() * 1.4), s], c: tint(rnd() * 0.75 + (y - 4.9) * 0.2), j: 0, ao: false, facet: true });
    }
  } else if (style === 'weeping') {
    for (let i = 0; i < 6; i++) limb(i / 6 * TAU + rnd() * 0.4, 1.6 + rnd() * 1.4, 6.0, 0.05);
    for (let k = 0; k < 28; k++) {
      const a = k / 28 * TAU + rnd() * 0.4, r0 = 1.0 + rnd() * 2.1, y1 = 2.8 + rnd() * 1.9, dx = Math.cos(a), dz = Math.sin(a), out = 0.5 + rnd() * 0.7;
      bt.add('sap', tubeG(THREE, [[dx * r0, 6.15, dz * r0], [dx * (r0 + out * 0.5), (6.15 + y1) / 2 + 0.3, dz * (r0 + out * 0.5)], [dx * (r0 + out), y1, dz * (r0 + out)]], 0.014, 0.008, 6, 3), { c: pal.sap, j: 0.1, ao: false });
      const m = 7;
      for (let i = 0; i < m; i++) { const t = (i + 0.5) / m, y = lerp(6.0, y1 + 0.1, t), rr = lerp(r0, r0 + out, t); bt.add('leaf', kit.plane, { p: [dx * rr + (rnd() - 0.5) * 0.12, y, dz * rr + (rnd() - 0.5) * 0.12], r: [(rnd() - 0.5) * 0.4, a + (rnd() - 0.5) * 1.2 + PI / 2, (rnd() - 0.5) * 0.5], s: [0.26, 0.5, 1], c: tint(0.2 + t * 0.7 + rnd() * 0.2), j: 0.04, ao: false }); }
      bt.add('sap', sphG(THREE, kit, 0.07, 6, 4), { p: [dx * (r0 + out), y1 - 0.08, dz * (r0 + out)], c: pal.sap, j: 0, ao: false });
    }
    for (let i = 0; i < 46; i++) { const a = rnd() * TAU, rr = 0.8 + Math.sqrt(rnd()) * 3.0; bt.add('leaf', kit.plane, { p: [Math.cos(a) * rr, 6.2 - rr * 0.08 - rnd() * 0.5, Math.sin(a) * rr], r: [0.9 + (rnd() - 0.5), a + rnd() * 2, 0], s: [0.4, 0.62, 1], c: tint(rnd() * 0.8), j: 0.05, ao: false }); }
  }
}
// returns { pivot, mats } - builds the static shared parts into b (floor ring, roots, pavers, collar) and the trunk into the scalable pivot.
function commonTree(ctx) {
  const { THREE, kit, b, g, rnd, pal, o, type, mats } = ctx, pivot = new THREE.Group(); pivot.name = 'trunk'; g.add(pivot);
  const bt = mkBuilder(THREE, ctx.merge), { R, lean } = trunkProfile(o);
  bt.add('bark', trunkGeo(THREE, o, pal, type === 'graft'), { keep: true, j: 0, ao: false });
  const nv = o.veins;
  for (let k = 0; k < nv; k++) {
    const t0 = k / nv * TAU + rnd() * 0.4, pts = [], y0 = 0.25 + rnd() * 0.3, y1 = 5.6 + rnd() * 0.7;
    for (let y = y0; y <= y1; y += 0.4) { const t = t0 - o.twist * y + Math.sin(y * 1.3 + k) * 0.08, [lx, lz] = lean(y), r = R(y, t) + 0.015; pts.push([Math.cos(t) * r + lx, y, Math.sin(t) * r + lz]); }
    bt.add('sap', tubeG(THREE, pts, t => 0.05 * (1 - t) + 0.016, 0, pts.length * 2, 5), { c: pal.sap, j: 0.1, ao: false });
  }
  canopy(THREE, kit, bt, o.canopy, pal, rnd, o);
  ctx.trunkParts = bt.build(pivot, mats, 'trunk_');
  // floor: roots, ring, pavers
  for (let i = 0; i < o.roots; i++) {
    const a = i / o.roots * TAU + (rnd() - 0.5) * 0.4, len = 2.5 + rnd() * 1.8, ca = Math.cos(a), sa = Math.sin(a), w = (rnd() - 0.5) * 0.9, cw = Math.cos(a + 1.57) * w, sw = Math.sin(a + 1.57) * w, arch = o.arch ? 0.55 + rnd() * 0.3 : 0;
    b.add('bark', tubeG(THREE, [[ca * 0.7, 0.45, sa * 0.7], [ca * (0.7 + len * 0.3) + cw * 0.3, 0.2 + arch, sa * (0.7 + len * 0.3) + sw * 0.3], [ca * (0.7 + len * 0.65) + cw, 0.1 + arch * 0.5, sa * (0.7 + len * 0.65) + sw], [ca * (0.7 + len) + cw, 0.0, sa * (0.7 + len) + sw]], 0.36 + rnd() * 0.08, 0.08, 14, 8), { c: pal.bark, j: 0.2 });
  }
  b.add('sap', new THREE.RingGeometry(2.86, 3.0, 72), { p: [0, 0.025, 0], r: [-PI / 2, 0, 0], c: new THREE.Color(pal.accent).multiplyScalar(type === 'spring' ? 0.55 : 0.85).getHex(), j: 0, ao: false });
  b.add('sap', new THREE.RingGeometry(2.45, 2.5, 72), { p: [0, 0.024, 0], r: [-PI / 2, 0, 0], c: new THREE.Color(pal.accent).multiplyScalar(0.5).getHex(), j: 0, ao: false });
  if (type !== 'spring') for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU + 0.1, rr = 2.7 + (rnd() - 0.5) * 0.08, st = rbox(THREE, kit, 0.7 + rnd() * 0.25, 0.07, 0.42 + rnd() * 0.12, 0.025);
    b.add('stone', st, { p: [Math.cos(a) * rr, 0.035, Math.sin(a) * rr], r: [0, -a + PI / 2 + (rnd() - 0.5) * 0.12, 0], c: pal.stone, j: 0.2 });
  }
  // ceiling collar: dark socket with a glowing lip, roots spreading across the ceiling
  b.add('stone', new THREE.RingGeometry(0.9, 2.5, 48), { p: [0, H - 0.03, 0], r: [PI / 2, 0, 0], c: 0x5a4a3a, j: 0.15, ao: false });
  b.add('glow', new THREE.RingGeometry(2.38, 2.5, 48), { p: [0, H - 0.035, 0], r: [PI / 2, 0, 0], c: new THREE.Color(pal.accent).multiplyScalar(0.5).getHex(), j: 0, ao: false });
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.2, rr = 3.4 + rnd() * 1.4; b.add('bark', tubeG(THREE, [[Math.cos(a) * 0.9, H - 0.3, Math.sin(a) * 0.9], [Math.cos(a + 0.1) * rr * 0.5, H - 0.22, Math.sin(a + 0.1) * rr * 0.5], [Math.cos(a + 0.2) * rr, H - 0.1, Math.sin(a + 0.2) * rr]], 0.2, 0.03, 10, 6), { c: pal.bark, j: 0.15, ao: false }); }
  return pivot;
}

// ---------- state helper: smoothed values ----------
function makeState(init) {
  const S = {}; for (const k of Object.keys(init)) S[k] = { v: init[k], t: init[k] };
  return { S, set(k, t, snap) { S[k].t = t; if (snap) S[k].v = t; }, step(dt, rate = 6) { const f = 1 - Math.exp(-dt * rate); for (const k in S) { const s = S[k]; s.v += (s.t - s.v) * f; if (Math.abs(s.t - s.v) < 1e-4) s.v = s.t; } }, get: k => S[k].v, tgt: k => S[k].t };
}
function facing(x, z) { return Math.atan2(-x, -z); }   // rotation.y that turns local +z toward the cell centre
function mkAnchor(THREE, group, anchors, name, x, y, z, r) { const o = new THREE.Object3D(); o.name = 'anchor_' + name; o.position.set(x, y, z); o.userData.r = r || 0.8; group.add(o); anchors[name] = o; return o; }
function glowSprite(THREE, kit, color, size) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.tex.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.set(size, size, 1); return s; }
const setScalar = (mat, v) => mat.color.setScalar(v);

// =========================================================================================================
// 1. Sapling Well
// =========================================================================================================
function buildWell(ctx) {
  const { THREE, kit, b, g, pal, rnd, anchors, solids, mats } = ctx, st = makeState({ stage: 1, fruit: 0, water: 0.5, bucket: 0, full: 0, cr: 0 });
  const pivot = ctx.pivot;
  // the old stump the sapling grows out of
  const stump = jitter(THREE, lathe(THREE, [[1.2, 0], [1.24, 0.46], [1.4, 0.64], [1.85, 0.58], [2.05, 0.34], [2.25, 0]], 36), 0.16);
  b.add('bark', stump, { c: 0x6c5a48, j: 0.25 });
  b.add('bark', new THREE.CircleGeometry(1.25, 28), { p: [0, 0.4, 0], r: [-PI / 2, 0, 0], c: 0x2c2118, j: 0.2, ao: false });
  for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.5; b.add('stone', sphG(THREE, kit, 0.2, 7, 5), { p: [Math.cos(a) * 1.6, 0.62, Math.sin(a) * 1.6], s: [1.2, 0.5, 1], c: 0x6f9a48, j: 0.2 }); }   // moss tufts
  // the well (NE)
  const wx = P4, wz = -P4, ry = facing(wx, wz);
  b.at(wx, wz, ry);
  b.add('stone', cylG(THREE, kit, 0.66, 0.7, 0.16, 20), { p: [0, 0.08, 0], c: 0x8e8478 });
  for (let course = 0; course < 2; course++) for (let i = 0; i < 11; i++) {
    const a = (i + course * 0.5) / 11 * TAU, r = 0.6;
    b.add('stone', rbox(THREE, kit, 0.46, 0.4, 0.26, 0.04), { p: [Math.sin(a) * r, 0.36 + course * 0.4, Math.cos(a) * r], r: [0, a, 0], c: pal.stone, j: 0.22 });
  }
  for (let i = 0; i < 11; i++) { const a = (i + 0.25) / 11 * TAU; b.add('stone', rbox(THREE, kit, 0.5, 0.1, 0.4, 0.035), { p: [Math.sin(a) * 0.6, 1.2, Math.cos(a) * 0.6], r: [0, a, 0], c: new THREE.Color(pal.stone).multiplyScalar(1.05).getHex(), j: 0.18 }); }
  b.add('stone', cylG(THREE, kit, 0.5, 0.5, 0.05, 20), { p: [0, 0.1, 0], c: 0x1c1a18, j: 0, ao: false });
  // windlass frame: two A-posts, roof planks, beam
  for (const sx of [-1, 1]) {
    b.add('wood', rbox(THREE, kit, 0.12, 2.2, 0.12, 0.03), { p: [sx * 0.9, 1.1, 0], c: 0xb89868 });
    b.add('wood', rbox(THREE, kit, 0.1, 1.5, 0.1, 0.03), { p: [sx * 0.9, 0.65, 0.5], r: [-0.55, 0, 0], c: 0xa88858 });
    b.add('wood', rbox(THREE, kit, 0.1, 1.5, 0.1, 0.03), { p: [sx * 0.9, 0.65, -0.5], r: [0.55, 0, 0], c: 0xa88858 });
    b.add('metal', rbox(THREE, kit, 0.2, 0.08, 0.2, 0.02), { p: [sx * 0.9, 1.95, 0], c: 0x6e6a64 });
  }
  b.add('wood', rbox(THREE, kit, 2.2, 0.06, 0.78, 0.02), { p: [0, 2.32, 0.28], r: [0.42, 0, 0], c: 0xc4a373 }); b.add('wood', rbox(THREE, kit, 2.2, 0.06, 0.78, 0.02), { p: [0, 2.32, -0.28], r: [-0.42, 0, 0], c: 0xb89868 });
  b.add('wood', rbox(THREE, kit, 2.3, 0.1, 0.1, 0.03), { p: [0, 2.62, 0], c: 0x9a7a4c });
  b.at();
  // dynamic: beam + crank, rope, bucket, water
  const wg = new THREE.Group(); wg.position.set(wx, 0, wz); wg.rotation.y = ry; g.add(wg);
  const beam = new THREE.Group(); beam.position.set(0, 2.0, 0); wg.add(beam);
  beam.add(dynMesh(THREE, cylG(THREE, kit, 0.1, 0.1, 2.0, 12).clone().rotateZ(PI / 2), mats.wood, 0xa8885a, 'windlassBeam'));
  const crank = dynMesh(THREE, rbox(THREE, kit, 0.07, 0.56, 0.07, 0.02).clone().translate(1.12, 0.26, 0), mats.metal, 0x8a8478, 'windlassCrank'); beam.add(crank);
  const grip = dynMesh(THREE, cylG(THREE, kit, 0.05, 0.05, 0.22, 8).clone().rotateZ(PI / 2).translate(1.16, 0.55, 0), mats.wood, 0xc9a56e); beam.add(grip);
  const rope = dynMesh(THREE, cylG(THREE, kit, 0.015, 0.015, 1, 5).clone().translate(0, -0.5, 0), mats.wood, 0xd8c48e, 'rope'); rope.position.set(0, 2.0, 0); wg.add(rope);
  const bucket = new THREE.Group(); bucket.name = 'bucket'; wg.add(bucket);
  bucket.add(dynMesh(THREE, lathe(THREE, [[0, 0], [0.19, 0], [0.22, 0.04], [0.25, 0.3], [0.2, 0.3], [0.17, 0.05]], 14), mats.wood, 0xb08a58));
  bucket.add(dynMesh(THREE, torG(THREE, kit, 0.236, 0.016, 5, 14).clone().rotateX(PI / 2).translate(0, 0.08, 0), mats.metal, 0x6a665e)); bucket.add(dynMesh(THREE, torG(THREE, kit, 0.248, 0.016, 5, 14).clone().rotateX(PI / 2).translate(0, 0.24, 0), mats.metal, 0x6a665e));
  const bw = dynMesh(THREE, new THREE.CircleGeometry(0.22, 14).rotateX(-PI / 2).translate(0, 0.27, 0), mats.water, pal.sap); bucket.add(bw);
  const wmat = mats.water, water = dynMesh(THREE, new THREE.CircleGeometry(0.52, 20).rotateX(-PI / 2), wmat, 0x7ff8a0, 'wellWater'); wg.add(water);
  const wGlow = glowSprite(THREE, kit, pal.sap, 1.6); wGlow.position.set(0, 1.2, 0); wg.add(wGlow);
  mkAnchor(THREE, wg, anchors, 'well', 0, 1.2, 0, 1.1); mkAnchor(THREE, wg, anchors, 'windlass', 1.1, 2.2, 0, 1.2); mkAnchor(THREE, wg, anchors, 'bucket', 0, 1.0, 0.3, 0.8);
  solids.push({ x: wx, z: wz, r: 0.75 });
  // fruit on the trunk (world space, south face)
  const fruit = new THREE.Group(); fruit.position.set(0, 2.95, 1.0); g.add(fruit);
  fruit.add(dynMesh(THREE, sphG(THREE, kit, 0.28, 14, 10), mats.flat, 0xfff09a, 'fruit')); fruit.add(dynMesh(THREE, tubeG(THREE, [[0, 0.26, 0], [0.02, 0.4, -0.15], [0, 0.55, -0.3]], 0.03, 0.02, 4, 4), mats.flat, 0x7aa83c));
  const fglow = glowSprite(THREE, kit, 0xffe45a, 1.9); fruit.add(fglow); fruit.visible = false;
  mkAnchor(THREE, g, anchors, 'sapling', 0, 1.2, 0, 1.6); mkAnchor(THREE, g, anchors, 'fruit', 0, 2.95, 1.1, 1.6);
  const heights = [0.3, 0.5, 0.74, 1.0], bY = [0.5, 0.88, 1.26, 1.64], sapM = mats.sap, leafM = mats.leaf, wm = mats.water;
  const upd = (dt, t) => {
    st.step(dt, 5);
    const sg = st.get('stage'), ig = clamp(sg - 1, 0, 3), i0 = Math.floor(ig), i1 = Math.min(3, i0 + 1), h = lerp(heights[i0], heights[i1], ig - i0);
    pivot.scale.set(0.34 + 0.66 * h, h, 0.34 + 0.66 * h);
    setScalar(sapM, 0.55 + 0.45 * (ig / 3) + 0.08 * Math.sin(t * 2)); setScalar(leafM, 0.8 + 0.2 * (ig / 3));
    const f = st.get('fruit'); fruit.visible = f > 0.02; fruit.scale.setScalar(0.35 + 0.65 * clamp(f, 0, 1)); fglow.material.opacity = 0.55 + 0.35 * Math.sin(t * 3) * clamp(f, 0, 1); fruit.position.y = 2.95 + 0.03 * Math.sin(t * 1.7);
    water.position.y = 0.2 + 0.78 * st.get('water'); wGlow.material.opacity = 0.35 + 0.25 * st.get('water'); wm.map.offset.set(t * 0.012, t * 0.008);
    const bn = clamp(st.get('bucket'), 0, 3), by = lerp(bY[Math.floor(Math.min(2.999, bn))], bY[Math.min(3, Math.floor(bn) + 1)], bn - Math.floor(bn)) + (bn >= 3 ? 0 : 0);
    bucket.position.set(0, by, 0); bw.visible = st.get('full') > 0.5; rope.scale.y = Math.max(0.05, 2.0 - (by + 0.3)); beam.rotation.x = -bn * 2.4;
  };
  upd(0, 0);
  return {
    setStage(n) { st.set('stage', clamp(n, 1, 4)); }, setFruit(v) { st.set('fruit', v ? clamp(+v, 0, 1) || 1 : 0); }, setWaterLevel(v) { st.set('water', clamp(v, 0, 1)); },
    setBucket(notch, full) { st.set('bucket', clamp(notch, 0, 3)); if (full !== undefined) st.set('full', full ? 1 : 0); }, setBucketFull(f) { st.set('full', f ? 1 : 0); },
    update: upd, snap() { for (const k in st.S) st.S[k].v = st.S[k].t; upd(0, 0); }, state: st
  };
}

// =========================================================================================================
// 2. Brain Press
// =========================================================================================================
function buildPress(ctx) {
  const { THREE, kit, b, g, pal, rnd, anchors, solids, mats } = ctx, st = makeState({ press: 0, brain: 0, v0: 0, v1: 0, v2: 0, b0: 0, b1: 0, b2: 0 }), pivot = ctx.pivot;
  // brain-lobe swellings on the trunk (flesh), pulsing slowly
  const lobes = [];
  const bt = mkBuilder(THREE, ctx.merge);
  for (const [y, a, s] of [[2.3, -0.9, 0.5], [3.4, 2.4, 0.42], [4.3, 0.6, 0.46], [1.6, 3.9, 0.4]]) {
    const geo = sphG(THREE, kit, 1, 22, 14).clone(), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), yy = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x), ph = Math.acos(clamp(yy, -1, 1)), d = 1 + 0.1 * Math.sin(th * 5 + Math.sin(ph * 6) * 2) * Math.sin(ph * 7); p.setXYZ(i, x * d, yy * d, z * d); }
    geo.computeVertexNormals(); const r = 0.8 + Math.sin(y) * 0.05;
    bt.add('flesh', geo, { p: [Math.cos(a) * r, y, Math.sin(a) * r], s: [s * 0.9, s * 0.75, s * 0.9], r: [0, a, 0], c: 0xe3a2b4, j: 0.18, ao: false });
  }
  bt.build(pivot, mats, 'lobes_');
  // the screw press built into the south face of the trunk
  b.add('metal', torG(THREE, kit, 1.06, 0.07, 6, 36).clone().rotateX(PI / 2), { p: [0, 1.0, 0], c: 0x6e6a64, j: 0.1 }); b.add('metal', torG(THREE, kit, 1.0, 0.07, 6, 36).clone().rotateX(PI / 2), { p: [0, 3.6, 0], c: 0x6e6a64, j: 0.1 });
  for (const sx of [-1, 1]) {
    b.add('wood', rbox(THREE, kit, 0.2, 2.9, 0.22, 0.04), { p: [sx * 0.62, 2.3, 1.18], c: 0x6b4a30 });
    b.add('metal', rbox(THREE, kit, 0.3, 0.1, 0.3, 0.02), { p: [sx * 0.62, 1.2, 1.18], c: 0x78746c }); b.add('metal', rbox(THREE, kit, 0.3, 0.1, 0.3, 0.02), { p: [sx * 0.62, 3.1, 1.18], c: 0x78746c });
    b.add('metal', rbox(THREE, kit, 0.12, 0.12, 0.7, 0.02), { p: [sx * 0.62, 2.3, 0.82], c: 0x6e6a64 });
  }
  b.add('wood', rbox(THREE, kit, 1.7, 0.3, 0.34, 0.05), { p: [0, 3.65, 1.18], c: 0x5e4028 });   // top beam with the nut
  b.add('metal', cylG(THREE, kit, 0.18, 0.18, 0.4, 12), { p: [0, 3.65, 1.18], c: 0x8a867e });
  b.add('wood', rbox(THREE, kit, 1.3, 0.2, 0.9, 0.04), { p: [0, 0.98, 1.2], c: 0x6b4a30 });   // press bed with a drain lip
  b.add('metal', rbox(THREE, kit, 1.0, 0.1, 0.7, 0.03), { p: [0, 1.12, 1.2], c: 0x827e76 });
  for (const sx of [-1, 1]) b.add('metal', rbox(THREE, kit, 0.07, 0.14, 0.7, 0.02), { p: [sx * 0.52, 1.2, 1.2], c: 0x7a766e });
  b.add('sap', new THREE.RingGeometry(0.3, 0.44, 24), { p: [0, 1.185, 1.55], r: [-PI / 2, 0, 0], c: 0x883a55, j: 0, ao: false });
  // dynamic: screw (spins), platen (descends), crank bar, brain on the bed
  const pg = new THREE.Group(); pg.position.set(0, 0, 1.2); g.add(pg);
  const screw = new THREE.Group(); screw.position.set(0, 0, 0); pg.add(screw);
  const helix = []; for (let i = 0; i <= 70; i++) { const a = i / 70 * TAU * 5; helix.push([Math.cos(a) * 0.15, 1.6 + i / 70 * 2.0, Math.sin(a) * 0.15]); }
  screw.add(dynMerged(THREE, ctx.merge, [[cylG(THREE, kit, 0.11, 0.11, 2.4, 10).clone().translate(0, 2.55, 0), 0x7e7a72], [tubeG(THREE, helix, 0.04, 0.04, 160, 5), 0xa6a298]], mats.metal, 'screw'));
  const crank = new THREE.Group(); crank.position.set(0, 3.2, 0); screw.add(crank); crank.add(dynMerged(THREE, ctx.merge, [[cylG(THREE, kit, 0.05, 0.05, 1.7, 8).clone().rotateZ(PI / 2), 0x6e6a64], [sphG(THREE, kit, 0.11, 8, 6).clone().translate(-0.85, 0, 0), 0xa6a298], [sphG(THREE, kit, 0.11, 8, 6).clone().translate(0.85, 0, 0), 0xa6a298]], mats.metal, 'crank'));
  const platen = new THREE.Group(); pg.add(platen); platen.add(dynMerged(THREE, ctx.merge, [[rbox(THREE, kit, 0.95, 0.14, 0.66, 0.04), 0x8e8a82], [cylG(THREE, kit, 0.1, 0.1, 0.16, 8).clone().translate(0, 0.14, 0), 0x7e7a72]], mats.metal, 'platen'));
  const brain = dynMesh(THREE, (() => { const geo = sphG(THREE, kit, 1, 20, 14).clone(), p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), d = 1 + 0.12 * Math.sin(Math.atan2(z, x) * 6) * Math.sin(Math.acos(clamp(y, -1, 1)) * 8); p.setXYZ(i, x * d * 0.3, y * d * 0.17, z * d * 0.22); } geo.computeVertexNormals(); return geo; })(), mats.flesh, 0xec9db3, 'brain'); brain.position.set(0, 1.3, 0.05); pg.add(brain);
  const juice = glowSprite(THREE, kit, 0xff6fa8, 1.2); juice.position.set(0, 1.35, 0.35); pg.add(juice);
  mkAnchor(THREE, g, anchors, 'press', 0, 1.4, 1.9, 1.3);
  // vats NE, NW, SW
  const vats = [], vatPos = [['NE', P4, -P4], ['NW', -P4, -P4], ['SW', -P4, P4]], liq = new THREE.Color(pal.liquid), bubbleN = 4;
  for (let i = 0; i < 3; i++) {
    const [nm, vx, vz] = vatPos[i], ry = facing(vx, vz);
    b.at(vx, vz, ry);
    b.add('wood', lathe(THREE, [[0, 0.12], [0.55, 0.12], [0.62, 0.3], [0.68, 0.95], [0.64, 1.0], [0, 1.0]], 22), { c: 0x7e5a38, j: 0.15 });
    for (const [y, rr] of [[0.28, 0.62], [0.62, 0.676], [0.9, 0.68]]) b.add('metal', torG(THREE, kit, rr, 0.034, 6, 26).clone().rotateX(PI / 2), { p: [0, y, 0], c: 0x66625c, j: 0.1 });
    b.add('metal', torG(THREE, kit, 0.66, 0.06, 6, 26).clone().rotateX(PI / 2), { p: [0, 1.0, 0], c: 0x7a766e, j: 0.1 });
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; b.add('metal', sphG(THREE, kit, 0.035, 5, 4), { p: [Math.sin(a) * 0.69, 0.62, Math.cos(a) * 0.69], c: 0x9a968e, j: 0 }); }
    for (const sx of [-1, 1]) b.add('wood', rbox(THREE, kit, 0.14, 0.14, 0.14, 0.03), { p: [sx * 0.42, 0.07, 0.3], c: 0x5e4028 });
    b.add('sap', new THREE.RingGeometry(0.7, 0.88, 24), { p: [0, 0.03, 0], r: [-PI / 2, 0, 0], c: 0x7a2a42, j: 0, ao: false });
    b.at();
    const vg = new THREE.Group(); vg.position.set(vx, 0, vz); vg.rotation.y = ry; g.add(vg);
    const disc = dynMesh(THREE, new THREE.CircleGeometry(0.58, 20).rotateX(-PI / 2), mats.flat, 0xff6fa8, 'vatLiquid' + i); disc.position.y = 0.92; vg.add(disc);
    const gl = glowSprite(THREE, kit, 0xff6fa8, 1.7); gl.position.y = 1.15; vg.add(gl);
    const bub = [];
    vats.push({ vg, disc, gl, bub }); mkAnchor(THREE, vg, anchors, 'vat' + i, 0, 1.05, 0, 1.0);
    solids.push({ x: vx, z: vz, r: 0.7 });
  }
  const bubM = new THREE.InstancedMesh(sphG(THREE, kit, 1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffb5d2 }), 3 * bubbleN), _o = new THREE.Object3D(); bubM.frustumCulled = false; bubM.name = 'vatBubbles'; g.add(bubM);
  const pl = mats.sap, ll = mats.leaf;
  const upd = (dt, t) => {
    st.step(dt, 6);
    const pr = st.get('press'); pg.visible = true;
    platen.position.y = lerp(2.15, 1.38, pr); screw.rotation.y = pr * TAU * 5; crank.rotation.y = pr * TAU * 5 * 0 + 0; brain.visible = st.get('brain') > 0.5; brain.scale.set(1, lerp(1, 0.4, pr), 1); brain.scale.x = lerp(1, 1.5, pr); brain.scale.z = lerp(1, 1.5, pr);
    juice.visible = pr > 0.15; juice.material.opacity = clamp(pr * 1.2, 0, 1) * (0.6 + 0.3 * Math.sin(t * 9));
    setScalar(pl, 0.78 + 0.2 * Math.sin(t * 1.4 + 1) + 0.25 * pr); setScalar(ll, 0.85 + 0.1 * Math.sin(t * 0.9));
    for (let i = 0; i < 3; i++) {
      const V = vats[i], r = st.get('v' + i), burst = st.get('b' + i); V.disc.position.y = 0.9 + 0.05 * Math.sin(t * (2 + r * 6) + i) + 0.09 * r + 0.1 * burst;
      V.disc.material.color.setScalar(1); V.gl.material.opacity = 0.35 + 0.5 * r + 0.3 * burst; V.gl.scale.setScalar(1.5 + 0.8 * r + burst);
      for (let k = 0; k < bubbleN; k++) { const ph = (t * (0.5 + r * 1.8) + k * 0.31 + i * 0.17) % 1, on = r > 0.04 || burst > 0.1, a = k * 2.1 + i, rr = 0.3 * (0.4 + (k % 3) * 0.3); _o.position.set(V.vg.position.x + Math.cos(a) * rr, V.disc.position.y + ph * 0.08, V.vg.position.z + Math.sin(a) * rr); _o.scale.setScalar(on ? (0.04 + 0.05 * (1 - Math.abs(ph - 0.5) * 2)) * (1 + burst * 1.5) : 0.0001); _o.updateMatrix(); bubM.setMatrixAt(i * bubbleN + k, _o.matrix); }
    }
    bubM.instanceMatrix.needsUpdate = true;
    if (st.S.b0.v > 0) for (const k of ['b0', 'b1', 'b2']) if (st.S[k].t > 0 && Math.abs(st.S[k].v - st.S[k].t) < 0.05) st.S[k].t = 0;
  };
  upd(0, 0);
  return {
    setPress(progress) { st.set('press', clamp(progress, 0, 1)); }, setPressBrain(loaded) { st.set('brain', loaded ? 1 : 0); },
    setVat(i, readiness) { st.set('v' + i, clamp(readiness, 0, 1)); }, popVat(i) { st.S['b' + i].v = 1; st.S['b' + i].t = 0; },
    update: upd, snap() { for (const k in st.S) st.S[k].v = st.S[k].t; upd(0, 0); }, state: st
  };
}

// =========================================================================================================
// 3. Healing Spring
// =========================================================================================================
function buildSpring(ctx) {
  const { THREE, kit, b, g, pal, rnd, anchors, solids, mats } = ctx, st = makeState({ glow: 0, f0: 1, f1: 1, f2: 1 });
  // pool: stone rim, water with scrolling ripples, additive healing glow, floating petals
  for (let i = 0; i < 26; i++) { const a = i / 26 * TAU, w = TAU * 3.1 / 26 * 1.04; b.add('stone', rbox(THREE, kit, w, 0.2 + rnd() * 0.04, 0.34, 0.04), { p: [Math.cos(a) * 3.12, 0.1, Math.sin(a) * 3.12], r: [0, -a + PI / 2, 0], c: pal.stone, j: 0.22 }); }
  b.add('stone', cylG(THREE, kit, 2.95, 2.95, 0.04, 40), { p: [0, 0.02, 0], c: 0x3a4a4c, j: 0, ao: false });
  for (let i = 0; i < 13; i++) { const a = rnd() * TAU, rr = 1.6 + rnd() * 1.1; b.add('glow', new THREE.CircleGeometry(0.1 + rnd() * 0.06, 6), { p: [Math.cos(a) * rr, 0.115, Math.sin(a) * rr], r: [-PI / 2, 0, rnd() * 3], c: 0xdffcff, j: 0, ao: false }); }
  const pool = dynMesh(THREE, new THREE.CircleGeometry(2.96, 48).rotateX(-PI / 2).translate(0, 0.1, 0), mats.water, 0x4fd6e6, 'poolWater');
  const halo = dynMesh(THREE, new THREE.RingGeometry(0.5, 2.9, 48).rotateX(-PI / 2).translate(0, 0.125, 0), mats.glow.clone(), 0x62ecff, 'poolGlow'); g.add(pool, halo);
  // basins NE, SE, SW
  const bas = [], bp = [['NE', P4, -P4], ['SE', P4, P4], ['SW', -P4, P4]];
  for (let i = 0; i < 3; i++) {
    const [nm, bx, bz] = bp[i], ry = facing(bx, bz); b.at(bx, bz, ry);
    b.add('stone', lathe(THREE, [[0, 0], [0.5, 0], [0.54, 0.08], [0.38, 0.14], [0.3, 0.5], [0.4, 0.62], [0.74, 0.72], [0.78, 0.84], [0.72, 0.9], [0.6, 0.86], [0.56, 0.72], [0, 0.7]], 24), { c: pal.stone, j: 0.2 });
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; b.add('stone', sphG(THREE, kit, 0.07, 5, 4), { p: [Math.sin(a) * 0.76, 0.84, Math.cos(a) * 0.76], c: 0xe6efe9, j: 0.1 }); }
    b.add('sap', new THREE.RingGeometry(0.85, 0.98, 24), { p: [0, 0.03, 0], r: [-PI / 2, 0, 0], c: 0x1f6a78, j: 0, ao: false });
    // spout: a small carved leaf lip at the front
    b.add('stone', rbox(THREE, kit, 0.2, 0.06, 0.26, 0.02), { p: [0, 0.85, 0.74], r: [0.25, 0, 0], c: pal.stone });
    b.at();
    const bg = new THREE.Group(); bg.position.set(bx, 0, bz); bg.rotation.y = ry; g.add(bg);
    const w = dynMesh(THREE, new THREE.CircleGeometry(0.56, 20).rotateX(-PI / 2), mats.water, 0x6ff0ff, 'basinWater' + i); w.position.y = 0.8; bg.add(w);
    const gl = glowSprite(THREE, kit, 0x62ecff, 1.5); gl.position.y = 1.0; bg.add(gl);
    bas.push({ w, gl }); mkAnchor(THREE, bg, anchors, 'basin' + i, 0, 0.9, 0, 1.1); solids.push({ x: bx, z: bz, r: 0.7 });
  }
  mkAnchor(THREE, g, anchors, 'pool', 0, 0.2, 0, 3.0);
  const sapM = mats.sap, wm = mats.water, glowM = halo.material;
  const upd = (dt, t) => {
    st.step(dt, 5);
    const gl = st.get('glow'); halo.visible = gl > 0.02; glowM.opacity = 1; halo.material.color.setScalar(gl * (0.35 + 0.1 * Math.sin(t * 3)));
    pool.material.color.setScalar(0.9 + 0.15 * gl); wm.map.offset.set(t * 0.01, -t * 0.007);
    setScalar(sapM, 0.7 + 0.15 * Math.sin(t * 1.3) + 0.3 * gl);
    for (let i = 0; i < 3; i++) { const f = st.get('f' + i), B = bas[i]; B.w.position.y = 0.7 + 0.14 * f; B.w.visible = f > 0.03; B.gl.visible = f > 0.2; B.gl.material.opacity = 0.2 + 0.45 * f + 0.1 * Math.sin(t * 2 + i); }
  };
  upd(0, 0);
  return {
    setBasin(i, fill) { st.set('f' + i, clamp(fill, 0, 1)); }, setPoolGlow(v) { st.set('glow', clamp(v, 0, 1)); },
    update: upd, snap() { for (const k in st.S) st.S[k].v = st.S[k].t; upd(0, 0); }, state: st
  };
}

// =========================================================================================================
// 4. Seer's Tree
// =========================================================================================================
function buildSeer(ctx) {
  const { THREE, kit, b, g, pal, rnd, anchors, solids, mats } = ctx, st = makeState({ eye: 0.7, solved: 0, m0: 0, m1: 0, m2: 0 }), ringCol = [0xffc933, 0x3ff0ff, 0xff6fb0];
  // the carved eye-plaque on the south face of the trunk
  b.add('stone', rbox(THREE, kit, 1.75, 1.9, 0.5, 0.07), { p: [0, 2.6, 0.82], c: 0x6a6082, j: 0.15 });
  for (const sx of [-1, 1]) for (const y of [1.8, 3.4]) b.add('metal', sphG(THREE, kit, 0.06, 6, 4), { p: [sx * 0.75, y, 1.08], c: 0xc9a95a, j: 0 });
  b.add('stone', rbox(THREE, kit, 1.45, 0.07, 0.1, 0.02), { p: [0, 2.28, 1.1], c: 0x4c4362 });
  const eyeShape = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w, 0); s.quadraticCurveTo(0, h * 2, w, 0); s.quadraticCurveTo(0, -h * 2, -w, 0); return s; };
  const eye = new THREE.Group(); eye.position.set(0, 3.0, 1.09); g.add(eye);
  eye.add(dynMerged(THREE, ctx.merge, [[new THREE.ShapeGeometry(eyeShape(0.62, 0.3), 12), 0xf4efff], [new THREE.ShapeGeometry(eyeShape(0.7, 0.36), 12).translate(0, 0, -0.01), 0x2a2040]], mats.flat, 'eyeBase'));
  const iris = dynMerged(THREE, ctx.merge, [[new THREE.CircleGeometry(0.25, 20).translate(0, 0, 0.005), 0xb06cff], [new THREE.PlaneGeometry(0.07, 0.34).translate(0, 0, 0.01), 0x1a1030]], mats.flat, 'eyeIris'); eye.add(iris);
  const eyeGlow = glowSprite(THREE, kit, 0xb06cff, 2.4); eyeGlow.position.set(0, 0, 0.1); eye.add(eyeGlow);
  // target glyph tiles under the eye, colour-coded to the stones
  const ringMats = ringCol.map(c => { const m = new THREE.MeshBasicMaterial({ map: kit.tex.glyphs, color: c }); return m; });
  const tiles = [];
  for (let i = 0; i < 3; i++) {
    const frame = rbox(THREE, kit, 0.46, 0.46, 0.06, 0.02), geo = new THREE.PlaneGeometry(0.36, 0.36);
    b.add('metal', frame, { p: [(i - 1) * 0.52, 2.15, 1.1], c: ringCol[i], j: 0, ao: false });
    const m = new THREE.Mesh(geo, ringMats[i]); m.position.set((i - 1) * 0.52, 2.15, 1.145); m.name = 'targetTile' + i; g.add(m); tiles.push(m);
  }
  const setTile = (m, k) => { const uv = m.geometry.attributes.uv; uv.setXY(0, k / 6, 1); uv.setXY(1, (k + 1) / 6, 1); uv.setXY(2, k / 6, 0); uv.setXY(3, (k + 1) / 6, 0); uv.needsUpdate = true; };
  tiles.forEach((m, i) => setTile(m, i * 2));
  // floating crystal shards drifting round the tree (separate mesh so they can turn)
  const fl = mkBuilder(THREE, ctx.merge), oct = memoGeo(kit, 'oct', () => new THREE.OctahedronGeometry(1));
  for (let i = 0; i < 22; i++) { const a = rnd() * TAU, rr = 1.7 + rnd() * 1.9, s = 0.07 + rnd() * 0.12; fl.add('crystal', oct, { p: [Math.cos(a) * rr, 1.2 + rnd() * 3.4, Math.sin(a) * rr], r: [rnd(), rnd() * 6, rnd()], s: [s, s * (1.8 + rnd()), s], c: new THREE.Color(pal.leafL).lerp(new THREE.Color(pal.leafD), rnd() * 0.6).getHex(), j: 0, ao: false, facet: true }); }
  const floaters = new THREE.Group(); g.add(floaters); fl.build(floaters, mats, 'shards_');
  // seeing stones NE, NW, SE
  const sp = [['NE', P4, -P4], ['NW', -P4, -P4], ['SE', P4, P4]], stones = [];
  for (let i = 0; i < 3; i++) {
    const [nm, sx, sz] = sp[i], ry = facing(sx, sz); b.at(sx, sz, ry);
    b.add('stone', rbox(THREE, kit, 1.0, 0.3, 1.0, 0.07), { p: [0, 0.15, 0], c: pal.stone, j: 0.2 });
    b.add('stone', rbox(THREE, kit, 0.78, 0.14, 0.78, 0.05), { p: [0, 0.37, 0], c: 0x7a7292, j: 0.2 });
    b.add('stone', cylG(THREE, kit, 0.26, 0.34, 1.35, 8), { p: [0, 1.1, 0], c: 0x6a6082, j: 0.2 });
    for (const y of [0.93, 1.33]) b.add('metal', torG(THREE, kit, 0.37, 0.045, 6, 28).clone().rotateX(PI / 2), { p: [0, y, 0], c: ringCol[i], j: 0 });
    b.add('sap', new THREE.RingGeometry(0.62, 0.76, 24), { p: [0, 0.03, 0], r: [-PI / 2, 0, 0], c: new THREE.Color(ringCol[i]).multiplyScalar(0.45).getHex(), j: 0, ao: false });
    b.add('metal', rbox(THREE, kit, 0.08, 0.2, 0.1, 0.02), { p: [0, 1.13, 0.43], c: 0xe6c36a, j: 0, ao: false });   // fixed pointer
    b.at();
    const sg = new THREE.Group(); sg.position.set(sx, 0, sz); sg.rotation.y = ry; g.add(sg);
    const band = new THREE.Group(); band.position.y = 1.13; sg.add(band);
    const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.36, 36, 1, true), ringMats[i]); bm.name = 'ring' + i; bm.rotation.y = 0; band.add(bm);
    const capMat = new THREE.MeshBasicMaterial({ vertexColors: true }), cap = dynMesh(THREE, oct.clone().scale(0.18, 0.3, 0.18), capMat, ringCol[i], 'cap' + i); cap.position.y = 1.95; sg.add(cap);
    const capGlow = glowSprite(THREE, kit, ringCol[i], 1.1); capGlow.position.y = 1.95; sg.add(capGlow);
    stones.push({ sg, band, cap, capGlow, capMat, rot: -0.5 / 6 * TAU, tgt: -0.5 / 6 * TAU, step: 0 }); mkAnchor(THREE, sg, anchors, 'stone' + i, 0, 1.1, 0, 1.1); solids.push({ x: sx, z: sz, r: 0.6 });
  }
  for (const S of stones) S.band.rotation.y = S.rot;
  mkAnchor(THREE, g, anchors, 'eye', 0, 3.0, 1.2, 1.6); mkAnchor(THREE, g, anchors, 'trunk', 0, 1.6, 0.9, 1.5);
  const sapM = mats.sap, upd = (dt, t) => {
    st.step(dt, 6); floaters.rotation.y = t * 0.05; floaters.position.y = 0.06 * Math.sin(t * 0.8);
    const sol = st.get('solved'), op = st.get('eye');
    eye.scale.set(1, 0.12 + 0.88 * op, 1); iris.position.x = Math.sin(t * 0.4) * 0.12 * op; eyeGlow.material.opacity = 0.25 + 0.3 * op + 0.5 * sol; eyeGlow.scale.setScalar(2.2 + 1.4 * sol);
    setScalar(sapM, 0.72 + 0.16 * Math.sin(t * 1.6) + 0.4 * sol);
    for (let i = 0; i < 3; i++) {
      const S = stones[i], d = S.tgt - S.rot, f = 1 - Math.exp(-dt * 12); S.rot += d * f; if (Math.abs(S.tgt - S.rot) < 1e-3) S.rot = S.tgt; S.band.rotation.y = S.rot;
      const m = Math.max(st.get('m' + i), sol); S.cap.rotation.y = t * 0.8 + i; S.cap.position.y = 1.95 + 0.05 * Math.sin(t * 1.8 + i); S.capGlow.position.y = S.cap.position.y; S.capGlow.material.opacity = 0.1 + 0.8 * m; S.capMat.color.setScalar(0.45 + 0.6 * m);
    }
  };
  upd(0, 0);
  return {
    setRing(i, step) { const S = stones[i], base = -(step + 0.5) / 6 * TAU, k = Math.round((S.rot - base) / TAU); S.tgt = base + k * TAU; S.step = step; }, setTargets(...a) { const arr = Array.isArray(a[0]) ? a[0] : a; arr.forEach((k, i) => setTile(tiles[i], k)); },
    setMatch(i, on) { st.set('m' + i, on ? 1 : 0); }, setSolved(v) { st.set('solved', clamp(v, 0, 1)); }, setEye(open) { st.set('eye', clamp(open, 0, 1)); },
    update: upd, snap() { for (const k in st.S) st.S[k].v = st.S[k].t; for (const S of stones) S.rot = S.tgt; upd(0, 0); }, state: st
  };
}

// =========================================================================================================
// 5. Grafting Bench
// =========================================================================================================
function buildGraft(ctx) {
  const { THREE, kit, b, g, pal, rnd, anchors, solids, mats } = ctx, st = makeState({ b0: 1, b1: 1, b2: 1, b3: 1, jaw: 0, prog: 0, done: 0 });
  // grafting wraps and wax on the trunk
  for (const [y, s] of [[0.95, 1.0], [1.55, 0.97], [3.3, 0.9]]) { b.add('wood', torG(THREE, kit, 0.84 * s, 0.07, 6, 30).clone().rotateX(PI / 2), { p: [0, y, 0], c: 0xdccb92, j: 0.15 }); b.add('wood', torG(THREE, kit, 0.86 * s, 0.045, 6, 30).clone().rotateX(PI / 2), { p: [0, y + 0.14, 0], c: 0xcdb97c, j: 0.15 }); }
  for (const [a, y] of [[0.6, 1.25], [2.2, 0.8], [4.0, 1.7], [5.2, 3.0]]) b.add('flesh', sphG(THREE, kit, 0.17, 8, 6), { p: [Math.cos(a) * 0.86, y, Math.sin(a) * 0.86], s: [1, 1.3, 1], c: 0xe0a030, j: 0.12, ao: false });
  // four low branches: a bark stub with a pale cut face (always) + a regrowing limb
  const branches = [], dirs = [0, PI / 2, PI, PI * 1.5];
  for (let i = 0; i < 4; i++) {
    const a = dirs[i], ca = Math.cos(a), sa = Math.sin(a);
    b.add('bark', tubeG(THREE, [[ca * 0.5, 2.0, sa * 0.5], [ca * 0.85, 2.05, sa * 0.85], [ca * 1.12, 2.13, sa * 1.12]], 0.26, 0.16, 6, 8), { c: pal.bark, j: 0.2, ao: false });
    b.add('wood', new THREE.CircleGeometry(0.16, 10), { p: [ca * 1.125, 2.13, sa * 1.125], r: [0, PI / 2 - a, 0], c: 0xe8d6a4, j: 0.1, ao: false });
    const bm = mkBuilder(THREE, ctx.merge), rb = mulberry(i * 99 + 7);
    const L = 2.2, pts = [[ca * 1.05, 2.12, sa * 1.05], [ca * (1.05 + L * 0.4), 2.35, sa * (1.05 + L * 0.4)], [ca * (1.05 + L * 0.75), 2.9, sa * (1.05 + L * 0.75)], [ca * (1.05 + L), 3.5, sa * (1.05 + L)]];
    bm.add('bark', tubeG(THREE, pts, 0.17, 0.05, 12, 7), { c: pal.bark, j: 0.2, ao: false });
    for (let k = 0; k < 3; k++) { const t = 0.5 + k * 0.17, px = lerp(pts[0][0], pts[3][0], t), pz = lerp(pts[0][2], pts[3][2], t), py = lerp(2.2, 3.5, Math.pow(t, 1.4)), side = k % 2 ? 1 : -1, pa = a + side * 0.9; bm.add('bark', tubeG(THREE, [[px, py, pz], [px + Math.cos(pa) * 0.3, py + 0.25, pz + Math.sin(pa) * 0.3], [px + Math.cos(pa) * 0.6, py + 0.55, pz + Math.sin(pa) * 0.6]], 0.05, 0.015, 5, 4), { c: pal.bark, j: 0.2, ao: false }); }
    for (let k = 0; k < 26; k++) { const t = 0.3 + rb() * 0.8, p = pts.length - 1, ix = Math.min(2, Math.floor(Math.min(t, 0.99) * 3)), u = Math.min(t, 0.99) * 3 - ix, x = lerp(pts[ix][0], pts[ix + 1][0], u) + (rb() - 0.5) * 0.7, y = lerp(pts[ix][1], pts[ix + 1][1], u) + rb() * 0.5, z = lerp(pts[ix][2], pts[ix + 1][2], u) + (rb() - 0.5) * 0.7, s = 0.34 + rb() * 0.28; bm.add('leaf', kit.plane, { p: [x, y, z], r: [(rb() - 0.5) * 1.4 + 0.5, rb() * TAU, (rb() - 0.5) * 1.2], s: [s * 0.7, s, 1], c: new THREE.Color(pal.leafD).lerp(new THREE.Color(pal.leafL), rb() * 0.8).getHex(), j: 0.05, ao: false }); }
    bm.add('leaf', sphG(THREE, kit, 0.1, 6, 4), { p: [pts[3][0], pts[3][1] + 0.05, pts[3][2]], s: [1, 1.5, 1], c: 0xfffbb8, j: 0, ao: false, uv: [0.02, 0.02] });   // the scion bud (solid texel)
    const lg = new THREE.Group(); lg.position.set(ca * 1.05, 2.12, sa * 1.05); lg.name = 'limb' + i;
    const inner = new THREE.Group(); inner.position.set(-ca * 1.05, -2.12, -sa * 1.05); lg.add(inner); bm.build(inner, mats, 'limb' + i + '_'); g.add(lg);
    branches.push(lg); mkAnchor(THREE, g, anchors, 'branch' + i, ca * 1.6, 2.2, sa * 1.6, 1.3);
  }
  // master bench (NE) with the vise
  const bx = P4, bz = -P4, ry = facing(bx, bz); b.at(bx, bz, ry);
  b.add('wood', rbox(THREE, kit, 1.5, 0.2, 0.78, 0.04), { p: [0, 0.92, 0], c: 0xb99768 });
  b.add('wood', rbox(THREE, kit, 1.38, 0.1, 0.66, 0.03), { p: [0, 0.3, 0], c: 0x9a7a4c });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', rbox(THREE, kit, 0.18, 0.84, 0.18, 0.03), { p: [sx * 0.62, 0.42, sz * 0.28], c: 0x8a6a40 });
  b.add('metal', rbox(THREE, kit, 1.54, 0.06, 0.82, 0.02), { p: [0, 0.8, 0], c: 0x66625c });
  b.add('wood', rbox(THREE, kit, 1.5, 1.0, 0.07, 0.03), { p: [0, 1.62, -0.38], c: 0x8a6a40 });   // tool board
  b.add('metal', rbox(THREE, kit, 0.2, 0.1, 0.1, 0.02), { p: [-0.5, 1.75, -0.3], c: 0x77736b }); b.add('wood', rbox(THREE, kit, 0.06, 0.5, 0.06, 0.02), { p: [-0.5, 1.45, -0.3], c: 0x7a5a38 });
  b.add('metal', rbox(THREE, kit, 0.05, 0.55, 0.03, 0.01), { p: [0.1, 1.6, -0.32], r: [0, 0, 0.1], c: 0xa6a298 }); b.add('metal', rbox(THREE, kit, 0.05, 0.55, 0.03, 0.01), { p: [0.2, 1.6, -0.32], r: [0, 0, -0.1], c: 0xa6a298 });
  b.add('metal', rbox(THREE, kit, 0.5, 0.05, 0.03, 0.01), { p: [0.52, 1.82, -0.32], r: [0, 0, -0.08], c: 0xa6a298 });
  b.add('metal', rbox(THREE, kit, 0.3, 0.22, 0.2, 0.04), { p: [0.5, 1.05, -0.05], c: 0x6e6a64 });   // small anvil
  b.add('metal', rbox(THREE, kit, 0.46, 0.08, 0.2, 0.03), { p: [0.5, 1.2, -0.05], c: 0x7e7a72 });
  b.add('metal', rbox(THREE, kit, 0.5, 0.2, 0.28, 0.035), { p: [-0.35, 1.12, 0.2], c: 0x6a665e });   // vise body
  b.add('metal', cylG(THREE, kit, 0.035, 0.035, 0.5, 8).clone().rotateX(PI / 2), { p: [-0.35, 1.12, 0.5], c: 0x8a867e });
  b.add('metal', rbox(THREE, kit, 0.07, 0.5, 0.07, 0.02), { p: [-0.35, 1.12, 0.78], r: [0, 0, PI / 2], c: 0x8a867e });
  b.add('metal', rbox(THREE, kit, 0.7, 0.07, 0.03, 0.012), { p: [0.1, 0.93, 0.405], c: 0x2d2a26, ao: false });   // progress track
  b.at();
  const bg = new THREE.Group(); bg.position.set(bx, 0, bz); bg.rotation.y = ry; g.add(bg);
  const jaw = new THREE.Group(); jaw.position.set(-0.35, 1.3, 0.04); bg.add(jaw);   // moving vise jaws (item sits between)
  const jawL = dynMesh(THREE, rbox(THREE, kit, 0.07, 0.3, 0.22, 0.02), mats.metal, 0x8a867e, 'viseJawL'), jawR = dynMesh(THREE, rbox(THREE, kit, 0.07, 0.3, 0.22, 0.02), mats.metal, 0x8a867e, 'viseJawR'); jaw.add(jawL, jawR);
  const slot = new THREE.Object3D(); slot.name = 'viseSlot'; slot.position.set(-0.35, 1.5, 0.04); bg.add(slot); anchors.viseSlot = slot; slot.userData.r = 0.9;
  const fill = dynMesh(THREE, new THREE.PlaneGeometry(1, 0.045).translate(0.5, 0, 0), mats.flat.clone(), 0xdcf54a, 'viseProgress'); fill.position.set(-0.24, 0.93, 0.424); fill.scale.x = 0.001; bg.add(fill);
  const halo = glowSprite(THREE, kit, 0xdcf54a, 1.5); halo.position.set(-0.35, 1.5, 0.04); halo.visible = false; bg.add(halo);
  mkAnchor(THREE, bg, anchors, 'bench', 0, 1.1, 0.2, 1.2); mkAnchor(THREE, bg, anchors, 'vise', -0.35, 1.3, 0.2, 1.1);
  solids.push({ x: bx, z: bz, r: 0.75 });
  const sapM = mats.sap, leafM = mats.leaf;
  const upd = (dt, t) => {
    st.step(dt, 4);
    for (let i = 0; i < 4; i++) { const v = st.get('b' + i), s = clamp((v - 0.05) / 0.95, 0, 1); branches[i].visible = v > 0.06; branches[i].scale.setScalar(0.12 + 0.88 * s); }
    const j = st.get('jaw'); jawL.position.x = -0.09 + 0.05 * (1 - j) * 0 - 0.09 * (1 - j) * 0.5 + 0.0; jawL.position.x = lerp(-0.22, -0.065, j); jawR.position.x = lerp(0.22, 0.065, j);
    const pr = st.get('prog'), dn = st.get('done'); fill.scale.x = Math.max(0.001, 0.62 * Math.max(pr, dn)); fill.material.color.setScalar(0.55 + 0.45 * dn + (pr > 0 && dn < 0.5 ? 0.15 * Math.sin(t * 8) : 0));
    halo.visible = dn > 0.05; halo.material.opacity = dn * (0.55 + 0.3 * Math.sin(t * 4)); setScalar(sapM, 0.75 + 0.12 * Math.sin(t * 1.5));
  };
  upd(0, 0);
  return {
    setBranch(i, regrown) { st.set('b' + i, clamp(regrown, 0, 1)); }, setViseClosed(v) { st.set('jaw', clamp(v, 0, 1)); }, setViseProgress(v) { st.set('prog', clamp(v, 0, 1)); }, setViseDone(on) { st.set('done', on ? 1 : 0); },
    update: upd, snap() { for (const k in st.S) st.S[k].v = st.S[k].t; upd(0, 0); }, state: st
  };
}

// =========================================================================================================
// entry point
// =========================================================================================================
const BUILDERS = { well: buildWell, press: buildPress, spring: buildSpring, seer: buildSeer, graft: buildGraft };
export function buildTreeRoom(THREE, helpers, type, opts = {}) {
  if (!BUILDERS[type]) throw new Error('rooms5art-trees-a: unknown tree type ' + type);
  const kit = getKit(THREE), pal = PAL[type], o = TREE_OPT[type], rnd = mulberry(opts.seed || hashStr('tree:' + type));
  const group = new THREE.Group(); group.name = 'treeRoom_' + type;
  const mats = { ...kit.mat, flat: kit.mat.sap, sap: kit.mat.sap.clone(), leaf: kit.mat.leaf.clone(), water: kit.mat.water.clone(), glow: kit.mat.glow };
  mats.water.map = kit.tex.ripple.clone(); mats.water.map.repeat.set(3, 3); mats.water.map.needsUpdate = true;   // own scroll offset per room
  const b = mkBuilder(THREE, helpers.mergeGeometries), anchors = {}, solids = [{ x: 0, z: 0, r: 1.1 }];
  const ctx = { THREE, kit, b, g: group, rnd, pal, o, type, mats, anchors, solids, merge: helpers.mergeGeometries };
  ctx.pivot = commonTree(ctx);
  mkAnchor(THREE, group, anchors, 'trunk', 0, 1.4, 0, 1.6);
  const part = BUILDERS[type](ctx);
  b.build(group, mats, 'static_');
  group.traverse(m => { if (m.isMesh || m.isSprite) { m.matrixAutoUpdate = true; } });
  group.solids = solids; group.anchors = anchors; group.userData.solids = solids; group.userData.type = type; group.userData.palette = pal;
  const api = { ...part, type, group, anchors, solids, mats };
  api.dispose = () => { group.traverse(m => { if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose(); if (m.isSprite && m.material) m.material.dispose(); }); mats.sap.dispose(); mats.leaf.dispose(); mats.water.dispose(); };
  group.api = api; group.userData.api = api; group.update = api.update;
  return group;
}

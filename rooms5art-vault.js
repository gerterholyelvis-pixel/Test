// Goblin King 5x5 art: the four VAULTBREAKER heist rooms and the VAULT dressing, built entirely in code (see docs/ART.md,
// docs/PLAN-5x5-rooms.md section 4/5/8, docs/reports/vault-art.md for the integration notes).
//
//   buildVaultbreaker(THREE, helpers, type, opts) -> one 22.5 x 15 m room's props. ONE shared shell (name banner, door plates,
//     vault-door cracks) plus up to 4 station skins ('ram' | 'locksmith' | 'counting' | 'keystone') that setSkin(type) swaps.
//   buildVaultDressing(THREE, helpers, opts)       -> the 22.5 m vault's dressing: treasury heaps, coffers, door bars,
//     crown claim ring, alarm beacons, warden grate.
//
// Everything is merged (few draw calls), emissive only (no lights), room-local coordinates (y up) and fully procedural.
// Room-local frame of a vaultbreaker: the vault door is in the middle of the wall at z = -7.5 (north), B is the wall at
// z = +7.5, L/R the short walls at x = -/+11.25, F the lane in front of the vault door. The integrator rotates `group`.
// Vault frame: centre at the origin, doors N (0,-11.25) E (11.25,0) S (0,11.25) W (-11.25,0).

const KITS = new WeakMap();
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const approach = (c, t, k, dt) => c + (t - c) * (1 - Math.exp(-k * dt));
const sstep = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

export const SIZE = { W: 22.5, D: 15, H: 6.5, VAULT: 22.5 };
export const TYPES = ['ram', 'locksmith', 'counting', 'keystone'];
const ALIAS = { countinghouse: 'counting', counting_house: 'counting', 'counting house': 'counting', siege: 'ram', stealth: 'locksmith', economy: 'counting', ritual: 'keystone' };
const norm = t => { t = String(t || 'ram').toLowerCase(); t = ALIAS[t] || t; return TYPES.includes(t) ? t : 'ram'; };
export const TITLES = {
  ram: ['BATTERING RAM', 'wind the winch - release - break the vault door'],
  locksmith: ['THE LOCKSMITH', 'set the pins - cut the key - keep it quiet'],
  counting: ['COUNTING HOUSE', 'buy writs - rob the strongbox - get out'],
  keystone: ['THE KEYSTONE', 'light the circuit in order - keep it burning'],
};

// ----------------------------------------------------------------------------------------------------------------- kit
function getKit(THREE, helpers) {
  let K = KITS.get(THREE); if (K) return K;
  K = { THREE, helpers: helpers || {}, geo: new Map(), mats: {}, tex: {} };
  KITS.set(THREE, K);
  const { Color } = THREE;

  K.ctex = (w, h, fn, opts = {}) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); fn(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  // noise-painted base textures (greyish, multiplied by material colour): wood grain, worn iron, mottled stone, weave
  const painted = (n, fn) => K.ctex(n, n, (g, w, h) => { const im = g.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = clamp(fn(x, y, w), 0, 1) * 255, i = (y * w + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); }, { repeat: true });
  K.tex.wood = painted(256, (x, y, w) => { const u = x / w * 4, v = y / w * 4; const grain = Math.sin((v * 9 + vnoise(u * 0.7, v * 2.2, 3) * 7) * 2.2) * 0.5 + 0.5; const knot = Math.pow(vnoise(u * 1.3 + 9, v * 1.3, 8), 5); return 0.68 + grain * 0.22 + (vnoise(u * 9, v * 40, 1) - 0.5) * 0.12 - knot * 0.25; });
  K.tex.iron = painted(256, (x, y, w) => { const u = x / w * 5, v = y / w * 5; let r = 0.72 + (vnoise(u * 3, v * 3, 5) - 0.5) * 0.3 + (vnoise(u * 18, v * 18, 6) - 0.5) * 0.14; const scr = vnoise(u * 2, v * 38, 7); if (scr > 0.82) r += 0.14; const pit = vnoise(u * 11, v * 11, 9); if (pit > 0.8) r -= 0.2; return r; });
  K.tex.stone = painted(256, (x, y, w) => { const u = x / w * 3, v = y / w * 3; const bl = vnoise(u * 2, v * 2, 11) * 0.45 + vnoise(u * 6, v * 6, 12) * 0.3 + vnoise(u * 20, v * 20, 13) * 0.15; const line = Math.abs(vnoise(u * 3.4, v * 1.3, 14) - 0.5) < 0.012 ? 0.2 : 0; return 0.55 + bl * 0.5 - line; });
  K.tex.weave = painted(128, (x, y, w) => 0.7 + (((x >> 1) + (y >> 1)) & 1) * 0.12 + (vnoise(x * 0.3, y * 0.3, 4) - 0.5) * 0.2);

  const M = (c, o) => new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.9, ...o });
  // six material classes (so a skin merges into ~6 draw calls); named aliases are the class plus a vertex tint
  K.mats = {
    iron: M(0x8d929c, { metalness: 0.55, roughness: 0.48, map: K.tex.iron }),
    brass: M(0xffc933, { metalness: 1, roughness: 0.3, emissive: 0x6a3d00, emissiveIntensity: 0.5 }),
    wood: M(0xa0703f, { roughness: 0.86, map: K.tex.wood }),
    stone: M(0xa39e94, { roughness: 0.93, map: K.tex.stone }),
    cloth: M(0xb89a62, { roughness: 1, map: K.tex.weave }),
    paint: M(0xffffff, { roughness: 0.6 }),
  };
  K.alias = { darkIron: ['iron', 0x7c7f86], gold: ['brass', 0xffffff], brass: ['brass', 0xe2cf9c], darkWood: ['wood', 0x8a7a7a], darkStone: ['stone', 0x8e8e8e], leather: ['cloth', 0x946f4f], red: ['paint', 0xb3122b], skin: ['paint', 0x6fa83a], bone: ['paint', 0xe8e0c8], ink: ['paint', 0x1a1612] };
  for (const m of Object.values(K.mats)) m.userData.shared = true;
  K.basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

  const radial = (stops) => K.ctex(128, 128, (g, w, h) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [p, c] of stops) r.addColorStop(p, c); g.fillStyle = r; g.fillRect(0, 0, w, h); });
  K.tex.glow = (helpers && helpers.glowTex) || radial([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.45)'], [1, 'rgba(255,255,255,0)']]);
  K.tex.flame = K.ctex(128, 256, (g, w, h) => {
    const gr = g.createRadialGradient(64, 170, 4, 64, 150, 120); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.97)'); gr.addColorStop(0.7, 'rgba(235,235,235,.85)'); gr.addColorStop(1, 'rgba(205,205,205,.6)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(64, 6); g.bezierCurveTo(100, 80, 128, 140, 100, 200); g.bezierCurveTo(88, 240, 40, 240, 28, 200); g.bezierCurveTo(0, 140, 40, 90, 64, 6); g.fill();
  });
  K.glowMat = (color, op = 0.3) => new THREE.SpriteMaterial({ map: K.tex.glow, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  // ---- cached geometry
  K.g = (key, make) => { let g = K.geo.get(key); if (!g) { g = make(); K.geo.set(key, g); } return g; };
  K.rbox = (w, h, d, r) => K.g(`rb${w.toFixed(3)}_${h.toFixed(3)}_${d.toFixed(3)}_${r}`, () => {
    r = Math.min(r, Math.min(w, h, d) * 0.45);
    if (r < 0.004) return new THREE.BoxGeometry(w, h, d);
    const sw = w - 2 * r, sh = h - 2 * r, cr = Math.min(r * 0.8, sw / 2, sh / 2), s = new THREE.Shape(), x0 = -sw / 2, y0 = -sh / 2;
    s.moveTo(x0 + cr, y0); s.lineTo(x0 + sw - cr, y0); s.quadraticCurveTo(x0 + sw, y0, x0 + sw, y0 + cr); s.lineTo(x0 + sw, y0 + sh - cr); s.quadraticCurveTo(x0 + sw, y0 + sh, x0 + sw - cr, y0 + sh);
    s.lineTo(x0 + cr, y0 + sh); s.quadraticCurveTo(x0, y0 + sh, x0, y0 + sh - cr); s.lineTo(x0, y0 + cr); s.quadraticCurveTo(x0, y0, x0 + cr, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2, steps: 1 });
    g.translate(0, 0, -(d - 2 * r) / 2); g.computeVertexNormals(); return g;
  });
  K.cylG = (rt, rb, h, seg) => K.g(`c${rt}_${rb}_${h}_${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1));
  K.sphG = (r, ws, hs) => K.g(`s${r}_${ws}_${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
  K.torG = (R, r, rs, ts) => K.g(`t${R}_${r}_${rs}_${ts}`, () => new THREE.TorusGeometry(R, r, rs, ts));
  K.coneG = (r, h, seg) => K.g(`k${r}_${h}_${seg}`, () => new THREE.ConeGeometry(r, h, seg));

  // gold mound (lumpy lathe) with a painted coin-pile texture: the cheap way to a heap; scaled by a level
  K.tex.coins = K.ctex(256, 256, (g, w, h) => {
    const r = rng(12); g.fillStyle = '#7a4c0c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 380; i++) { const x = r() * w, y = r() * h, rad = 9 + r() * 8; for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { const cx = x + ox, cy = y + oy; if (cx < -20 || cx > w + 20 || cy < -20 || cy > h + 20) continue; const gr = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(0.55, '#f0b830'); gr.addColorStop(1, '#b87a14'); g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rad, rad * (0.55 + r() * 0.4), r() * 3, 0, TAU); g.fill(); g.strokeStyle = 'rgba(70,40,4,.8)'; g.lineWidth = 1.6; g.stroke(); } }
  }, { repeat: true }); K.tex.coins.repeat.set(5, 2);
  K.coinMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: K.tex.coins, bumpMap: K.tex.coins, bumpScale: 2.2, metalness: 0.85, roughness: 0.42, emissive: 0x8a5000, emissiveIntensity: 0.4, envMapIntensity: 1.2 });
  K.mound = () => K.g('mound', () => {
    const pts = [new THREE.Vector2(1.04, -0.04)]; const N = 12; for (let i = 0; i <= N; i++) { const r = 1 - i / N; pts.push(new THREE.Vector2(r, Math.pow(1 - Math.pow(r, 1.8), 0.9))); }
    const g = new THREE.LatheGeometry(pts, 30), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), n = vnoise(x * 3.1 + 5, z * 3.1, 2) - 0.5, n2 = vnoise(x * 7 + 1, z * 7 + 9, 4) - 0.5; pa.setY(i, Math.max(-0.04, y + n * 0.16 * Math.min(1, y * 3 + 0.2) + n2 * 0.05)); pa.setX(i, x * (1 + n * 0.14)); pa.setZ(i, z * (1 + n * 0.14)); }
    g.computeVertexNormals(); return g;
  });

  // ---- Batch: collects transformed parts into one merged BufferGeometry per material (vertex colour = tint x height shade x jitter)
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new Color(), _t = new Color();
  const jr = rng(7);
  K.Batch = class Batch {
    constructor(oy = 0) { this.oy = oy; this.parts = new Map(); }
    add(mat, g, x = 0, y = 0, z = 0, o = {}) {
      let key, mat0, base = 0xffffff; if (typeof mat === 'string') { const al = K.alias[mat]; key = al ? al[0] : mat; mat0 = K.mats[key]; if (al) base = al[1]; } else { key = mat.uuid; mat0 = mat; }
      let P = this.parts.get(key);
      if (!P) { P = { mat: mat0, pos: [], nor: [], uv: [], col: [] }; this.parts.set(key, P); }
      _e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ'); _q.setFromEuler(_e); const s = o.s ?? 1; _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
      _m.compose(_p.set(x, y, z), _q, _s); _n.getNormalMatrix(_m);
      const src = g.index ? g.toNonIndexed() : g, pa = src.attributes.position, na = src.attributes.normal, ua = src.attributes.uv;
      _c.set(base); _c.multiply(_t.set(o.t ?? 0xffffff)); const jit = 1 + (jr() - 0.5) * (o.j ?? 0.1);
      for (let i = 0; i < pa.count; i++) {
        _v.fromBufferAttribute(pa, i).applyMatrix4(_m); P.pos.push(_v.x, _v.y, _v.z);
        _v.fromBufferAttribute(na, i).applyNormalMatrix(_n).normalize(); P.nor.push(_v.x, _v.y, _v.z);
        if (ua) P.uv.push(ua.getX(i), ua.getY(i)); else P.uv.push(0, 0);
        const wy = P.pos[P.pos.length - 2] + this.oy, sh = o.ao === false ? 1 : (0.68 + 0.32 * sstep(0, 1.1, wy)) * (0.9 + 0.1 * sstep(1.0, 3.5, wy));
        const f = sh * jit; P.col.push(_c.r * f, _c.g * f, _c.b * f);
      }
      return this;
    }
    box(mat, w, h, d, x, y, z, o = {}) { return this.add(mat, K.rbox(w, h, d, o.r ?? Math.min(0.035, Math.min(w, h, d) * 0.3)), x, y, z, o); }
    cyl(mat, rt, rb, h, x, y, z, o = {}) { return this.add(mat, K.cylG(rt, rb, h, o.seg || 14), x, y, z, o); }
    sph(mat, r, x, y, z, o = {}) { return this.add(mat, K.sphG(r, o.ws || 14, o.hs || 10), x, y, z, o); }
    tor(mat, R, r, x, y, z, o = {}) { return this.add(mat, K.torG(R, r, o.rs || 6, o.ts || 18), x, y, z, o); }
    cone(mat, r, h, x, y, z, o = {}) { return this.add(mat, K.coneG(r, h, o.seg || 8), x, y, z, o); }
    lathe(mat, pts, x, y, z, o = {}) { const key = 'l' + pts.map(p => p.join(',')).join(';') + (o.seg || 16); return this.add(mat, K.g(key, () => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), o.seg || 16)), x, y, z, o); }
    geometry() { const P = this.parts.values().next().value, bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2)); bg.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3)); bg.computeBoundingSphere(); return bg; }
    /** anim = true marks the meshes as moving/draw-range parts: they are not merged into the skin's static meshes */
    build(name = 'batch', anim = false) {
      const grp = new THREE.Group(); grp.name = name; grp.userData.meshes = {};
      for (const [key, P] of this.parts) {
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3));
        bg.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2)); bg.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
        bg.computeBoundingSphere(); const me = new THREE.Mesh(bg, P.mat); me.name = name + ':' + key; me.userData.merge = !anim; grp.add(me); grp.userData.meshes[key] = me;
      }
      return grp;
    }
  };
  /** bakes every static Batch mesh under grp (not yet attached anywhere) into one mesh per material */
  K.mergeStatics = grp => {
    grp.updateMatrixWorld(true); const buckets = new Map(), kill = [], m3 = new THREE.Matrix3(), v = new THREE.Vector3();
    grp.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || !o.userData.merge) return; kill.push(o);
      let B = buckets.get(o.material.uuid); if (!B) { B = { mat: o.material, pos: [], nor: [], uv: [], col: [] }; buckets.set(o.material.uuid, B); }
      const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv, ca = g.attributes.color; m3.getNormalMatrix(o.matrixWorld);
      for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); B.pos.push(v.x, v.y, v.z); v.fromBufferAttribute(na, i).applyNormalMatrix(m3).normalize(); B.nor.push(v.x, v.y, v.z); B.uv.push(ua.getX(i), ua.getY(i)); B.col.push(ca.getX(i), ca.getY(i), ca.getZ(i)); }
    });
    for (const o of kill) { o.parent.remove(o); o.geometry.dispose(); }
    for (const B of buckets.values()) { const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2)); bg.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3)); bg.computeBoundingSphere(); const me = new THREE.Mesh(bg, B.mat); me.name = 'static'; grp.add(me); }
  };
  return K;
}

// ---- shared small builders
const chain = (b, x, y0, y1, z, o = {}) => { const n = Math.max(2, Math.round(Math.abs(y1 - y0) / 0.15)); for (let i = 0; i < n; i++) { const y = y0 + (y1 - y0) * (i + 0.5) / n; b.tor(o.mat || 'darkIron', 0.055, 0.017, x, y, z, { ry: (i & 1) ? Math.PI / 2 : 0, sy: 1.5, ts: 8, rs: 4, ao: false, j: 0.2 }); } };
const rivets = (b, pts, mat = 'brass', r = 0.028) => { for (const [x, y, z] of pts) b.sph(mat, r, x, y, z, { ws: 6, hs: 4, ao: false }); };

function lampRow(K, parent, positions, r, colors) {
  const THREE = K.THREE, im = new THREE.InstancedMesh(K.g('lampG' + r, () => new THREE.SphereGeometry(r, 10, 8)), new THREE.MeshBasicMaterial({ color: 0xffffff }), positions.length), c = new THREE.Color(), m = new THREE.Matrix4();
  positions.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, m); im.setColorAt(i, c.set(colors ? colors[i] ?? 0x222222 : 0x222222)); });
  im.instanceColor.needsUpdate = true; parent.add(im);
  return { mesh: im, set(i, hex) { im.setColorAt(i, c.set(hex)); im.instanceColor.needsUpdate = true; } };
}
function card(K, w, h, tex, o = {}) { // flat textured plane (basic, optionally additive) facing +z
  const THREE = K.THREE, m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending, color: o.color ?? 0xffffff, opacity: o.opacity ?? 1, side: o.side ?? THREE.FrontSide, fog: false, polygonOffset: !!o.poly, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); return m;
}

// ----------------------------------------------------------------------------------------------------------------- icons / banner
const GOLD = '#f3c04a', GOLD2 = '#a8761c';
function goldGrad(g, y0, y1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(0.45, '#f1b92f'); gr.addColorStop(0.55, '#c98a12'); gr.addColorStop(1, '#ffe27a'); return gr; }
function drawIcon(g, type, cx, cy, s) {
  g.save(); g.translate(cx, cy); g.scale(s, s); g.fillStyle = GOLD; g.strokeStyle = GOLD; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.09;
  if (type === 'ram') { // a ram's head with curled horns
    g.beginPath(); g.moveTo(-0.1, 0.02); g.quadraticCurveTo(0.3, -0.12, 0.62, 0.06); g.lineTo(0.6, 0.24); g.quadraticCurveTo(0.45, 0.46, 0.1, 0.46); g.quadraticCurveTo(-0.16, 0.4, -0.1, 0.02); g.fill();
    g.lineWidth = 0.13; g.beginPath(); for (let a = 0; a < 4.3 * Math.PI; a += 0.15) { const r = 0.05 + a * 0.042; g[a ? 'lineTo' : 'moveTo'](-0.12 + Math.cos(a + 2.2) * r, -0.08 + Math.sin(a + 2.2) * r); } g.stroke();
    g.fillStyle = '#15110c'; g.beginPath(); g.arc(0.3, 0.12, 0.045, 0, TAU); g.fill(); g.beginPath(); g.arc(0.55, 0.2, 0.025, 0, TAU); g.fill();
  } else if (type === 'locksmith') { // key
    g.lineWidth = 0.1; g.beginPath(); g.arc(-0.34, 0, 0.19, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(-0.15, 0); g.lineTo(0.55, 0); g.stroke();
    g.lineWidth = 0.09; for (const x of [0.28, 0.46]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 0.2); g.stroke(); }
  } else if (type === 'counting') { // scales over a coin
    g.lineWidth = 0.07; g.beginPath(); g.moveTo(0, -0.5); g.lineTo(0, 0.4); g.moveTo(-0.55, -0.3); g.lineTo(0.55, -0.3); g.moveTo(-0.3, 0.45); g.lineTo(0.3, 0.45); g.stroke();
    for (const x of [-0.45, 0.45]) { g.beginPath(); g.moveTo(x, -0.3); g.lineTo(x - 0.16, 0.05); g.lineTo(x + 0.16, 0.05); g.closePath(); g.stroke(); g.beginPath(); g.ellipse(x, 0.08, 0.2, 0.06, 0, 0, Math.PI); g.fill(); }
  } else { // keystone with a flame
    g.beginPath(); g.moveTo(-0.3, -0.5); g.lineTo(0.3, -0.5); g.lineTo(0.5, 0.45); g.lineTo(-0.5, 0.45); g.closePath(); g.lineWidth = 0.08; g.stroke();
    g.beginPath(); g.moveTo(0, -0.25); g.bezierCurveTo(0.22, 0, 0.2, 0.2, 0, 0.3); g.bezierCurveTo(-0.2, 0.2, -0.22, 0, 0, -0.25); g.fill();
  }
  g.restore();
}
const TYPE_GLOW = { ram: '#ff9a3a', locksmith: '#7fd0ff', counting: '#ffd24a', keystone: '#a455ff' };
function drawBanner(g, w, h, type) {
  const [title, sub] = TITLES[type];
  g.fillStyle = '#15110c'; g.fillRect(0, 0, w, h);
  const vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(255,230,160,.10)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = vg; g.fillRect(0, 0, w, h);
  g.strokeStyle = goldGrad(g, 0, h); g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20); g.lineWidth = 2.5; g.strokeRect(24, 24, w - 48, h - 48);
  g.strokeStyle = TYPE_GLOW[type]; g.globalAlpha = 0.7; g.lineWidth = 2; g.strokeRect(34, 34, w - 68, h - 68); g.globalAlpha = 1;
  drawIcon(g, type, 120, h / 2, 110); drawIcon(g, type, w - 120, h / 2, 110);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 ' + Math.round(h * 0.34) + 'px Georgia, "Times New Roman", serif';
  g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#3a2204'; g.strokeText(title, w / 2, h * 0.42); g.fillStyle = goldGrad(g, h * 0.2, h * 0.62); g.fillText(title, w / 2, h * 0.42);
  g.font = '600 ' + Math.round(h * 0.12) + 'px system-ui, sans-serif'; g.fillStyle = '#d9c9a0'; g.fillText(sub.toUpperCase(), w / 2, h * 0.76);
}

// door crack atlas: 3 stages side by side (1536 x 512), dark fissures with a light lip
function crackAtlas(K) {
  return K.tex.cracks || (K.tex.cracks = K.ctex(1536, 512, (g, w, h) => {
    const r = rng(41), seg = (x, y, a, len, wd, depth, lit) => {
      if (depth <= 0 || len < 6) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      g.lineCap = 'round'; g.strokeStyle = 'rgba(255,240,215,.38)'; g.lineWidth = wd + 2.4; g.beginPath(); g.moveTo(x - 1.5, y - 1.5); g.lineTo(x2 - 1.5, y2 - 1.5); g.stroke();
      g.strokeStyle = lit ? 'rgba(255,170,60,.95)' : 'rgba(10,8,6,.92)'; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      seg(x2, y2, a + (r() - 0.5) * 0.9, len * (0.72 + r() * 0.2), wd * 0.8, depth - 1, lit); if (r() < 0.55) seg(x2, y2, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.6, wd * 0.62, depth - 2, lit);
    };
    const stage = (i, n, wd, lit, chips) => { g.save(); g.translate(i * 512, 0); g.beginPath(); g.rect(0, 0, 512, 512); g.clip();
      for (let k = 0; k < n; k++) { const sx = 256 + (r() - 0.5) * 200, sy = 300 + (r() - 0.5) * 160; seg(sx, sy, r() * TAU, 70 + r() * 60, wd, 5, lit); }
      for (let k = 0; k < chips; k++) { g.fillStyle = 'rgba(18,14,10,.75)'; g.beginPath(); const cx = 80 + r() * 350, cy = 60 + r() * 380; g.ellipse(cx, cy, 6 + r() * 14, 4 + r() * 10, r() * 3, 0, TAU); g.fill(); }
      g.restore(); };
    stage(0, 3, 3.5, false, 2); stage(1, 6, 5, false, 9); stage(2, 10, 7.5, true, 18);
  }));
}
// a vault-door crack decal: 3 stages (breach >= 15 / 50 / 85). Width/height match the vault door opening.
export function buildDoorCracks(THREE, helpers, opts = {}) {
  const K = getKit(THREE, helpers), w = opts.w ?? 4.9, h = opts.h ?? 5, tex = crackAtlas(K), g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false });
  const mesh = new THREE.Mesh(g, mat); mesh.visible = false; mesh.name = 'doorCracks'; const grp = new THREE.Group(); grp.add(mesh); mesh.position.y = h / 2;
  let stage = -1;
  const api = { group: grp, stage: 0, setBreach(v) {
    const s = v >= 85 ? 3 : v >= 50 ? 2 : v >= 15 ? 1 : 0; if (s === stage) return; stage = s; api.stage = s; mesh.visible = s > 0; if (!s) return;
    const u0 = (s - 1) / 3; for (let i = 0; i < 4; i++) uv.setX(i, u0 + (i & 1) / 3); uv.needsUpdate = true;
    mat.color.setScalar(s === 3 ? 1 : 0.9);
  } };
  return api;
}

// ----------------------------------------------------------------------------------------------------------------- vaultbreaker
const HX = SIZE.W / 2, HZ = SIZE.D / 2;
// INTEGRATION (docs/reports/room-art-integration.md): every wall of a real vaultbreaker room has a door in its middle (3 arena doors + the vault door), so the three wall stations stand beside their doors:
// B (the far wall) is moved +BX along its wall, L +LZ and R +RZ along theirs. The three spots lie on the 'map' side of the control panels on the room's north wall.
export const LAYOUT = { BX: 4.7, LZ: 3.9, RZ: -3.9 };
const BX = LAYOUT.BX, LZ = LAYOUT.LZ, RZ = LAYOUT.RZ;
const shiftA = (anchors, B, L, R) => { const mv = (names, dx, dz) => { for (const n of names) { const a = anchors[n]; if (!a) continue; for (const o of Array.isArray(a) ? a : [a]) { o.x += dx; o.z += dz; } } }; mv(B, BX, 0); mv(L, 0, LZ); mv(R, 0, RZ); };
const A = (x, z, r = 0.6, y = 0, extra) => ({ x, y, z, r, ...extra });
/** Fixed footprints, identical for all four skins (the plan's anchor geometry): a few circles per solid box. */
export function vaultbreakerSolids() {
  return [
    { id: 'B', x: BX - 0.8, z: HZ - 0.5, r: 0.58 }, { id: 'B', x: BX, z: HZ - 0.5, r: 0.58 }, { id: 'B', x: BX + 0.8, z: HZ - 0.5, r: 0.58 },
    { id: 'L', x: -HX + 0.6, z: LZ, r: 0.72 }, { id: 'R', x: HX - 0.6, z: RZ, r: 0.72 },
    { id: 'FL', x: -3, z: -HZ + 2, r: 0.6 }, { id: 'FR', x: 3, z: -HZ + 2, r: 0.6 },
  ];
}
/** room-local solids -> world circles for a room at (cx, cz) turned by rotY (same rotation as `group.rotation.y`). */
export function transformSolids(solids, cx, cz, rotY) { const c = Math.cos(rotY), s = Math.sin(rotY); return solids.map(o => ({ x: cx + o.x * c + o.z * s, z: cz - o.x * s + o.z * c, r: o.r })); }
const BASE_ANCHORS = () => ({ B: A(BX, HZ - 0.5, 1.2), L: A(-HX + 0.6, LZ, 0.8), R: A(HX - 0.6, RZ, 0.8), FL: A(-3, -HZ + 2), FR: A(3, -HZ + 2), F: A(0, -HZ + 2.5, 1.0, 0, { w: 2, d: 5 }), door: A(0, -HZ, 2.5) });

// helper: a station group at wall position, local +z pointing into the room
const station = (THREE, parent, x, z, ry) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); return g; };
// station frame: the wall plane is z = 0 and the ROOM lies toward local -z (so "0.5 in front of the wall" is z = -0.5); local +x runs along the wall
const WALL = { B: [BX, HZ, 0], L: [-HX, LZ, -Math.PI / 2], R: [HX, RZ, Math.PI / 2], D: [0, -HZ, Math.PI] };

// ============ RAM ============
function buildRam(K, ctx) {
  const THREE = K.THREE, grp = new THREE.Group(); grp.name = 'skin:ram'; const anchors = BASE_ANCHORS();
  const st = new K.Batch(), H = SIZE.H;
  // lane floor decal: hazard edges, chevrons toward the door, scuffed
  const laneTex = K.ctex(256, 640, (g, w, h) => {
    const r = rng(5); g.fillStyle = 'rgba(40,36,32,.55)'; g.fillRect(0, 0, w, h);
    for (const x0 of [0, w - 26]) for (let y = 0; y < h; y += 52) { g.fillStyle = (y / 52) & 1 ? 'rgba(236,190,70,.9)' : 'rgba(30,26,22,.9)'; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 26, y - 26); g.lineTo(x0 + 26, y + 26); g.lineTo(x0, y + 52); g.fill(); }
    g.strokeStyle = 'rgba(20,16,12,.55)'; g.lineWidth = 16; for (const x of [78, w - 78]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = 'rgba(236,190,70,.8)'; g.lineWidth = 12; g.lineJoin = 'miter'; for (let y = 120; y < h - 80; y += 120) { g.beginPath(); g.moveTo(60, y + 40); g.lineTo(w / 2, y); g.lineTo(w - 60, y + 40); g.stroke(); }
    g.setLineDash([22, 14]); g.strokeStyle = 'rgba(240,235,225,.55)'; g.lineWidth = 4; for (const zc of [0.72, 0.53, 0.34]) g.strokeRect(46, h * zc - 36, w - 92, 72); g.setLineDash([]);
    g.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 160; k++) { g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 2 + r() * 14, 1 + r() * 3); } g.globalCompositeOperation = 'source-over';
  });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(2, 5), new THREE.MeshStandardMaterial({ map: laneTex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.012, -HZ + 2.5); grp.add(lane);
  // ceiling beams + the pivot rail over the lane
  for (const dz of [-1, 1]) st.box('darkWood', 3.2, 0.34, 0.34, 0, H - 0.17, -4.4 + dz, { r: 0.04 });
  st.box('darkWood', 0.34, 0.3, 3.2, -1.5, H - 0.4, -4.4, { r: 0.04 }); st.box('darkWood', 0.34, 0.3, 3.2, 1.5, H - 0.4, -4.4, { r: 0.04 });
  for (const dz of [-1, 1]) for (const dx of [-0.38, 0.38]) st.cyl('darkIron', 0.07, 0.07, 0.12, dx, H - 0.38, -4.4 + dz, { seg: 8 });

  // ---- the ram: log on four chains, pendulum around the pivot (group origin at the rail)
  const pivotY = H - 0.45, pend = new THREE.Group(); pend.position.set(0, pivotY, -4.4); grp.add(pend);
  const rb = new K.Batch(0.3), Lc = 3.5, logY = -Lc;
  rb.cyl('wood', 0.4, 0.42, 3.5, 0, logY, 0.0, { rx: Math.PI / 2, seg: 28, t: 0xd8c4a8 });
  for (const z of [-1.55, -0.95, -0.2, 0.55, 1.35]) rb.cyl('darkIron', 0.45, 0.45, 0.13, 0, logY, z, { rx: Math.PI / 2, seg: 28 });
  for (const dz of [-1, 1]) for (const dx of [-0.38, 0.38]) { chain(rb, dx, -0.05, logY + 0.44, dz * 0.95, { mat: 'darkIron' }); rb.tor('darkIron', 0.07, 0.022, dx, logY + 0.43, dz * 0.95, { rx: Math.PI / 2, rs: 5, ts: 10 }); }
  // head: a domed iron ram's skull with two thick curled horns and a brow ridge
  rb.cyl('darkIron', 0.47, 0.5, 0.18, 0, logY, -1.62, { rx: Math.PI / 2, seg: 28 });
  rb.sph('iron', 0.44, 0, logY, -1.86, { sz: 0.8, ws: 24, hs: 16, t: 0xd0d4dc });
  rb.box('darkIron', 0.7, 0.1, 0.14, 0, logY + 0.3, -2.12, { r: 0.03, rx: 0.2 });
  const hornG = K.g('horn', () => new THREE.TorusGeometry(0.3, 0.085, 8, 22, Math.PI * 1.45));
  rb.add('bone', hornG, -0.68, logY + 0.06, -1.78, { rx: Math.PI / 2, t: 0xffffff }); rb.add('bone', hornG, 0.68, logY + 0.06, -1.78, { rx: Math.PI / 2, rz: -Math.PI * 0.45, t: 0xffffff });
  for (const sx of [-1, 1]) { rb.sph('brass', 0.055, sx * 0.17, logY + 0.1, -2.18, { ws: 8, hs: 6 }); rb.cone('bone', 0.05, 0.2, sx * 0.14, logY - 0.2, -2.14, { rx: Math.PI, seg: 5 }); }
  rb.sph('darkIron', 0.09, 0, logY - 0.08, -2.2, { ws: 8, hs: 6, sy: 0.7 });
  // rope grips (handles) on each side
  for (const sx of [-1, 1]) for (const z of [-0.55, 0.45, 1.15]) { rb.tor('leather', 0.17, 0.035, sx * 0.43, logY - 0.05, z, { ry: Math.PI / 2, rz: 0, rs: 5, ts: 12 }); rb.cyl('darkIron', 0.03, 0.03, 0.12, sx * 0.43, logY + 0.1, z, { rz: Math.PI / 2, seg: 6 }); }
  const ramMesh = rb.build('ram', true); pend.add(ramMesh);
  const impactGlow = new THREE.Sprite(K.glowMat(0xffb060, 0)); impactGlow.scale.set(3.2, 3.2, 1); impactGlow.position.set(0, 2.6, -HZ + 0.25); grp.add(impactGlow);

  // ---- winch at B: timber frame, drum, ratchet, two cranks, tension lamps
  const wg = station(THREE, grp, ...WALL.B); const wb = new K.Batch(0);
  wb.box('darkWood', 2.4, 0.55, 1.0, 0, 0.275, -0.5, { r: 0.05 }); wb.box('wood', 2.3, 0.1, 0.9, 0, 0.6, -0.5, { r: 0.03 });
  for (const sx of [-1, 1]) { wb.box('wood', 0.22, 2.0, 0.34, sx * 1.02, 1.55, -0.5, { r: 0.04 }); wb.box('darkIron', 0.26, 0.5, 0.4, sx * 1.02, 1.7, -0.5, { r: 0.04 }); wb.box('darkIron', 0.3, 0.14, 0.4, sx * 1.02, 0.7, -0.5, { r: 0.03 }); }
  wb.box('wood', 2.5, 0.28, 0.45, 0, 2.6, -0.5, { r: 0.05 }); wb.box('darkIron', 2.55, 0.06, 0.5, 0, 2.76, -0.5, { r: 0.02 });
  wb.cyl('wood', 0.36, 0.36, 1.9, 0, 1.7, -0.5, { rz: Math.PI / 2, seg: 18, t: 0xc8a888 });
  for (const sx of [-0.62, 0.62]) wb.cyl('darkIron', 0.4, 0.4, 0.1, sx, 1.7, -0.5, { rz: Math.PI / 2, seg: 18 });
  for (let i = 0; i < 9; i++) wb.tor('leather', 0.375, 0.04, -0.5 + i * 0.125, 1.7, -0.5, { ry: Math.PI / 2, rs: 5, ts: 20, t: 0xd4c0a0 });
  // ratchet wheel (6 big teeth) and pawl
  const teeth = new THREE.Shape(); for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = i & 1 ? 0.38 : 0.52, a2 = a + TAU / 24; teeth.lineTo(Math.cos(a) * 0.4, Math.sin(a) * 0.4); teeth.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); }
  teeth.closePath(); const toothG = new THREE.ExtrudeGeometry(teeth, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1 });
  wb.add('darkIron', toothG, 0.55, 1.7, -0.46, { ry: Math.PI / 2 }); wb.cyl('iron', 0.1, 0.1, 0.3, 0, 1.7, -0.5, { rz: Math.PI / 2, seg: 8 });
  wb.box('darkIron', 0.12, 0.7, 0.1, 0.55, 2.28, -0.38, { rz: 0.7, r: 0.02 }); wb.cyl('brass', 0.05, 0.05, 0.14, 0.55, 2.55, -0.38, { rz: Math.PI / 2, seg: 8 });
  // slack lever (pawl handle) on the plinth
  wb.box('darkIron', 0.1, 0.6, 0.1, 0.0, 0.9, -1.05, { rx: -0.3, r: 0.02 }); wb.sph('red', 0.1, 0.0, 1.18, -1.14, { ws: 10, hs: 8 });
  rivets(wb, [[-1.1, 0.6, -0.97], [1.1, 0.6, -0.97], [-1.1, 2.6, -0.27], [1.1, 2.6, -0.27]]);
  wg.add(wb.build('winch'));
  // spinning drum rope end + two cranks (animated)
  const cranks = []; { const cg = new THREE.Group(); cg.position.set(0, 1.7, -0.5); wg.add(cg); const cb = new K.Batch(1.7);
    for (const sx of [-1, 1]) { cb.cyl('darkIron', 0.1, 0.1, 0.16, sx * 1.2, 0, 0, { rz: Math.PI / 2, seg: 10 }); cb.box('darkIron', 0.1, 0.62, 0.1, sx * 1.2, 0.3, 0, { r: 0.02 }); cb.cyl('wood', 0.055, 0.055, 0.42, sx * 1.34, 0.62, 0, { rz: Math.PI / 2, seg: 8, t: 0xe0c8a0 }); cb.sph('wood', 0.07, sx * 1.55, 0.62, 0, { ws: 8, hs: 6, t: 0xe0b060 }); }
    cg.add(cb.build('crank', true)); cranks.push(cg); }
  const lampsT = lampRow(K, wg, [0, 1, 2, 3, 4, 5].map(i => [-0.55 + i * 0.22, 2.6, -0.76]), 0.062, null); for (let i = 0; i < 6; i++) lampsT.set(i, 0x2a2018);
  // ---- release lever at FL
  const lg = station(THREE, grp, -3, -HZ + 2, 0); const lb = new K.Batch(0);
  lb.cyl('darkStone', 0.55, 0.62, 0.22, 0, 0.11, 0, { seg: 16 }); lb.box('darkIron', 0.5, 0.95, 0.4, 0, 0.7, 0, { r: 0.05 }); lb.box('brass', 0.3, 0.07, 0.04, 0, 1.0, 0.21, { r: 0.01 });
  rivets(lb, [[-0.2, 0.4, 0.21], [0.2, 0.4, 0.21], [-0.2, 0.95, 0.21], [0.2, 0.95, 0.21]], 'brass', 0.03); lb.box('red', 0.34, 0.2, 0.04, 0, 0.62, 0.21, { r: 0.01 });
  lg.add(lb.build('lever')); const leverArm = new THREE.Group(); leverArm.position.set(0, 1.1, 0); lg.add(leverArm); const la = new K.Batch(1.1);
  la.cyl('darkIron', 0.1, 0.1, 0.22, 0, 0, 0, { rz: Math.PI / 2, seg: 10 }); la.cyl('iron', 0.045, 0.045, 1.05, 0, 0.52, 0, { seg: 8 }); la.sph('iron', 0.12, 0, 1.08, 0, { ws: 12, hs: 8, t: 0xb3122b }); leverArm.add(la.build('arm', true));
  // ---- wedge rack at FR
  const rg = station(THREE, grp, 3, -HZ + 2, 0); const rk = new K.Batch(0);
  rk.box('darkWood', 1.1, 0.12, 0.7, 0, 0.9, 0, { r: 0.03 }); rk.box('darkWood', 1.1, 0.12, 0.7, 0, 0.35, 0, { r: 0.03 });
  for (const sx of [-0.5, 0.5]) rk.box('wood', 0.1, 1.0, 0.6, sx, 0.5, 0, { r: 0.03 });
  rk.box('wood', 1.1, 0.7, 0.08, 0, 0.62, -0.32, { r: 0.02 });
  for (let i = 0; i < 4; i++) rk.sph('bone', 0.06, -0.38 + i * 0.25, 1.25 - ((i * 7) % 3) * 0.04, 0.28, { ws: 6, hs: 5, s: 1.3 });
  rg.add(rk.build('rack'));
  const wedgeShape = new THREE.Shape(); wedgeShape.moveTo(0, 0); wedgeShape.lineTo(0.5, 0); wedgeShape.lineTo(0.5, 0.2); wedgeShape.closePath();
  const wedgeG = new THREE.ExtrudeGeometry(wedgeShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 1 }); wedgeG.translate(-0.25, 0, -0.11);
  const wb2 = new K.Batch(0.9); const wedgeMeshes = [];
  [-0.27, 0.27].forEach((x, i) => { const wbi = new K.Batch(0.9); wbi.add('iron', wedgeG, 0, 0, 0, { t: 0xffffff }); const m = wbi.build('wedge', true); m.position.set(x, 0.98, 0.05); m.rotation.y = i ? 0.2 : -0.15; m.visible = false; rg.add(m); wedgeMeshes.push(m); });

  // ---- barricade slots in the lane (instanced: planks, posts, spikes; hidden by zero scale)
  const slotZ = [-3.7, -5.0, -6.3], slotsA = slotZ.map((z, i) => A(0, z, 0.9, 0, { slot: i }));
  const mkI = (g, mat, n) => { const im = new THREE.InstancedMesh(g, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; grp.add(im); return im; };
  const pU = new K.Batch(0.3); pU.box('wood', 1.9, 0.2, 0.15, 0, 0, 0, { r: 0.03, ao: false }); for (const sx of [-0.7, 0.7]) pU.sph('wood', 0.035, sx, 0.0, 0.085, { ws: 6, hs: 4, t: 0x444444, ao: false });
  const kU = new K.Batch(0.3); kU.box('wood', 0.18, 1.15, 0.18, 0, 0, 0, { r: 0.03, t: 0x8a7a7a, ao: false }); kU.cone('wood', 0.07, 0.34, 0, 0.72, 0, { seg: 6, t: 0x55585e, ao: false });
  const planks = mkI(pU.geometry(), K.mats.wood, 12), posts = mkI(kU.geometry(), K.mats.wood, 6);
  const bar = slotZ.map(() => ({ hp: 0, shake: 0 })), dummy = new THREE.Object3D(), hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const rr = rng(77), plankJit = Array.from({ length: 12 }, () => ({ rz: (rr() - 0.5) * 0.12, dx: (rr() - 0.5) * 0.06, dy: rr() * 0.02 }));
  function layBarricade() {
    bar.forEach((b, s) => { const z = slotZ[s], n = b.hp <= 0 ? 0 : Math.max(1, Math.ceil(b.hp * 4 - 0.001)), sh = Math.sin(b.shake * 40) * b.shake * 0.05;
      for (let i = 0; i < 4; i++) { const idx = s * 4 + i; if (i < n) { const J = plankJit[idx]; dummy.position.set(J.dx + sh, 0.2 + i * 0.24 + J.dy, z + (i & 1 ? 0.05 : -0.05)); dummy.rotation.set(0, 0, J.rz * (1 + (1 - b.hp) * 2.5)); dummy.scale.setScalar(1); dummy.updateMatrix(); planks.setMatrixAt(idx, dummy.matrix); } else planks.setMatrixAt(idx, hide); }
      for (let k = 0; k < 2; k++) { const idx = s * 2 + k, sx = k ? 1 : -1; if (b.hp > 0) { dummy.position.set(sx * 0.98 + sh, 0.58, z); dummy.rotation.set(0, 0, sx * 0.05); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); posts.setMatrixAt(idx, dummy.matrix); } else posts.setMatrixAt(idx, hide); } });
    planks.instanceMatrix.needsUpdate = posts.instanceMatrix.needsUpdate = true;
  }
  layBarricade();
  const ghost = new THREE.Mesh(K.rbox(2.1, 1.1, 0.3, 0.05), new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false })); ghost.visible = false; ghost.position.y = 0.6; grp.add(ghost);

  grp.add(st.build('ram-static')); Object.assign(anchors, { winch: A(0, HZ - 0.5, 1.2), crankL: A(-1.2, HZ - 1.0, 0.5, 1.7), crankR: A(1.2, HZ - 1.0, 0.5, 1.7), pawl: A(0, HZ - 1.1, 0.5, 0.9), lever: A(-3, -HZ + 2.7, 0.6, 1.0), wedgeRack: A(3, -HZ + 2.6, 0.6, 1.0), lane: anchors.F, ram: A(0, -4.4, 1.0, 2.8), doorImpact: A(0, -HZ + 0.1, 1.0, 2.6), tensionLamps: A(0, HZ - 0.72, 0.4, 2.6) }); shiftA(anchors, ['winch', 'crankL', 'crankR', 'pawl', 'tensionLamps'], [], []);
  anchors.barricades = slotsA;

  let tension = 0, tTarget = 0, pull = 0, ang = 0, strike = null, lever = 0, leverT = 0, impact = 0, drum = 0;
  const api = {
    anchors, kind: 'ram',
    /** 0..6 notches on the ratchet: drum turns, cranks follow, lamps light */
    setTension(n) { tTarget = clamp(n, 0, 6); for (let i = 0; i < 6; i++) lampsT.set(i, i < Math.round(tTarget) ? (i >= 4 ? 0xff7a2a : 0xffc933) : 0x2a2018); },
    /** 0..1 how far the ram is drawn back (the 0.8 s telegraph); ignored while a strike plays */
    setRamPull(v) { pull = clamp(v, 0, 1); },
    /** 0..1 release lever position */
    setLever(v) { leverT = clamp(v, 0, 1); },
    /** swing down the lane and hit the door; ctx.onImpact fires at contact */
    strike(strength = 1) { strike = { t: 0, a0: ang, s: clamp(strength, 0.3, 1.6), hit: false }; },
    /** 0..2 iron wedges resting on the rack */
    setWedges(n) { wedgeMeshes.forEach((m, i) => { m.visible = i < n; }); },
    /** slot 0..2 (0 nearest the lane mouth), hp 0..1 (0 removes it) */
    setBarricade(slot, hp) { if (!bar[slot]) return; bar[slot].hp = clamp(hp, 0, 1); layBarricade(); },
    hitBarricade(slot) { if (bar[slot]) bar[slot].shake = 0.4; },
    /** translucent placement preview in a slot, -1 hides */
    setBarricadeGhost(slot) { ghost.visible = slot >= 0 && !!slotZ[slot]; if (ghost.visible) ghost.position.z = slotZ[slot]; },
    tick(dt, t) {
      tension = approach(tension, tTarget, 9, dt); drum = approach(drum, tension * 0.55, 8, dt); cranks.forEach(c => { c.rotation.x = drum; });
      lever = approach(lever, leverT, 14, dt); leverArm.rotation.x = -0.65 + lever * 1.3;
      let target = -pull * 0.42;
      if (strike) { strike.t += dt; const T1 = 0.24 / Math.min(1.4, strike.s); if (strike.t < T1) { const k = strike.t / T1; ang = strike.a0 + (0.4 - strike.a0) * k * k; } else { if (!strike.hit) { strike.hit = true; impact = 1; if (ctx.onImpact) ctx.onImpact(strike.s); } const u = strike.t - T1; ang = 0.4 * Math.exp(-2.8 * u) * Math.cos(7.5 * u); if (u > 2.4) strike = null; } }
      else ang = approach(ang, target, 7, dt);
      pend.rotation.x = ang; impact = Math.max(0, impact - dt * 2.6); impactGlow.material.opacity = impact * 0.8; impactGlow.visible = impact > 0.01;
      let dirty = false; bar.forEach(b => { if (b.shake > 0) { b.shake = Math.max(0, b.shake - dt); dirty = true; } }); if (dirty) layBarricade();
    },
  };
  K.mergeStatics(grp); return { group: grp, anchors, api, tick: api.tick };
}

// ============ LOCKSMITH ============
function buildLocksmith(K, ctx) {
  const THREE = K.THREE, grp = new THREE.Group(); grp.name = 'skin:locksmith'; const anchors = BASE_ANCHORS();
  // lock face on the B wall
  const lg = station(THREE, grp, ...WALL.B), sb = new K.Batch(0); lg.position.y = -0.4;
  sb.box('darkIron', 5.0, 3.8, 0.28, 0, 2.55, -0.2, { r: 0.06 }); sb.box('brass', 4.6, 3.4, 0.14, 0, 2.55, -0.38, { r: 0.05, t: 0xd8c090 });
  sb.box('darkIron', 4.2, 3.0, 0.1, 0, 2.55, -0.43, { r: 0.04 });
  const xs = [-1.6, -0.8, 0, 0.8, 1.6]; for (const x of xs) { sb.box('ink', 0.36, 2.1, 0.08, x, 2.5, -0.48, { r: 0.02, ao: false }); sb.box('brass', 0.5, 2.4, 0.05, x, 2.5, -0.5, { r: 0.015, t: 0xb08a40 }); sb.box('ink', 0.34, 2.0, 0.06, x, 2.5, -0.52, { r: 0.012, ao: false }); }
  // the shear line: a bright bar with notches
  sb.box('brass', 4.4, 0.06, 0.06, 0, 3.15, -0.55, { r: 0.012, t: 0xfff0b0 });
  for (const x of xs) for (const sx of [-1, 1]) sb.box('brass', 0.07, 0.14, 0.07, x + sx * 0.23, 3.15, -0.56, { r: 0.01 });
  rivets(sb, [[-2.3, 0.85, -0.46], [2.3, 0.85, -0.46], [-2.3, 4.2, -0.46], [2.3, 4.2, -0.46], [-1.2, 0.85, -0.46], [1.2, 0.85, -0.46]], 'brass', 0.04);
  // keyhole escutcheon
  sb.tor('brass', 0.42, 0.07, 0, 1.45, -0.5, { rs: 6, ts: 24 }); sb.cyl('ink', 0.26, 0.26, 0.08, 0, 1.45, -0.5, { rx: Math.PI / 2, seg: 16, ao: false }); sb.box('ink', 0.16, 0.5, 0.08, 0, 1.15, -0.5, { r: 0.02, ao: false });
  lg.add(sb.build('lockface'));
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa83a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); const kh = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), glowMat); kh.position.set(0, 1.45, -0.56); kh.rotation.y = Math.PI; lg.add(kh);
  // pins
  const pins = xs.map((x, i) => { const pm = new THREE.MeshStandardMaterial({ color: 0xe0a93a, metalness: 1, roughness: 0.3, emissive: 0x4a2800, emissiveIntensity: 0.4, vertexColors: true });
    const pb = new K.Batch(1.5); pb.box(pm, 0.26, 0.9, 0.2, 0, 0, 0, { r: 0.04 }); pb.box(pm, 0.3, 0.12, 0.22, 0, 0.5, 0, { r: 0.03, t: 0xfff0c0 }); const g = pb.build('pin', true);
    const pm2 = g.userData.meshes[pm.uuid]; pm2.material = pm; g.position.set(x, 2.2, -0.52); lg.add(g); return { g, mat: pm, v: 0, vt: 0, state: 'idle', flash: 0 }; });
  const SHEAR = 0.9; const pinY = v => 1.8 + v * 1.35;
  // grindstone at L
  const gg = station(THREE, grp, ...WALL.L), gb = new K.Batch(0);
  for (const sx of [-0.5, 0.5]) for (const dz of [-0.38, 0.38]) gb.box('wood', 0.14, 1.5, 0.14, sx, 0.8, -0.65 + dz, { r: 0.03 });
  for (const sx of [-0.5, 0.5]) gb.box('darkWood', 0.16, 0.12, 0.9, sx, 1.5, -0.65, { r: 0.03 }); gb.box('darkWood', 1.2, 0.1, 0.12, 0, 1.2, -0.27, { r: 0.02 }); gb.box('darkWood', 1.2, 0.1, 0.12, 0, 1.2, -1.03, { r: 0.02 }); gb.box('darkWood', 1.4, 0.14, 0.95, 0, 0.07, -0.65, { r: 0.04 });
  gb.box('stone', 1.0, 0.2, 0.7, 0, 0.27, -0.65, { r: 0.04 }); gb.box('ink', 0.84, 0.03, 0.56, 0, 0.375, -0.65, { r: 0.01, ao: false });
  gb.cyl('darkIron', 0.05, 0.05, 1.3, 0, 1.0, -0.65, { rz: Math.PI / 2, seg: 8 }); gb.box('darkIron', 0.05, 0.5, 0.05, 0.72, 0.8, -0.65, { rx: 0.3, r: 0.01, ry: 0 }); gb.sph('wood', 0.07, 0.72, 1.07, -0.82, { ws: 8, hs: 6 });
  gb.box('darkWood', 1.6, 1.15, 0.1, 0, 2.55, -0.06, { r: 0.03 }); gb.box('brass', 1.7, 0.07, 0.14, 0, 3.15, -0.1, { r: 0.02 });
  const keyShape = new THREE.Shape(); keyShape.absarc(0, 0, 0.13, 0, TAU, false); const hole = new THREE.Path(); hole.absarc(0, 0, 0.055, 0, TAU, true); keyShape.holes.push(hole);
  const keyG = new THREE.ExtrudeGeometry(keyShape, { depth: 0.02, bevelEnabled: false, curveSegments: 10 });
  for (let i = 0; i < 7; i++) { const x = -0.6 + i * 0.2, ln = 0.3 + ((i * 5) % 3) * 0.08; gb.add('brass', keyG, x, 2.88, -0.13, { t: 0xd8c090, ry: Math.PI }); gb.box('brass', 0.05, ln, 0.03, x, 2.88 - 0.13 - ln / 2, -0.14, { r: 0.008 }); gb.box('brass', 0.1, 0.05, 0.03, x + 0.04, 2.88 - 0.13 - ln + 0.05, -0.14, { r: 0.008 }); }
  gb.cyl('red', 0.035, 0.035, 0.04, -0.7, 2.2, -0.13, { rx: Math.PI / 2, seg: 8 });
  gg.add(gb.build('grind'));
  const wheelG = new THREE.Group(); wheelG.position.set(0, 1.0, -0.65); gg.add(wheelG); const wb = new K.Batch(1.0);
  wb.cyl('stone', 0.6, 0.6, 0.3, 0, 0, 0, { rz: Math.PI / 2, seg: 28, t: 0xd0c0a8 }); wb.cyl('darkIron', 0.14, 0.14, 0.34, 0, 0, 0, { rz: Math.PI / 2, seg: 10 }); wb.box('darkIron', 0.3, 0.06, 0.9, 0, 0, 0, { r: 0.01, ao: false }); wb.box('darkIron', 0.3, 0.9, 0.06, 0, 0, 0, { r: 0.01, ao: false });
  wheelG.add(wb.build('wheel', true));
  const spark = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshBasicMaterial({ map: K.tex.glow, color: 0xffa040, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); spark.position.set(0.0, 0.62, -1.25); spark.rotation.y = Math.PI / 2; gg.add(spark);
  // bell + noise gauge at R
  const bg = station(THREE, grp, ...WALL.R), bb = new K.Batch(0);
  bb.box('darkStone', 1.2, 0.3, 1.2, 0, 0.15, -0.6, { r: 0.04 }); bb.box('darkIron', 0.3, 3.9, 0.3, 0, 2.05, -0.4, { r: 0.04 }); bb.box('darkIron', 0.26, 0.26, 1.1, 0, 3.95, -0.85, { r: 0.04 }); bb.box('iron', 0.1, 1.1, 0.1, 0, 3.43, -0.75, { rx: -0.69, r: 0.02 });
  bb.cyl('darkIron', 0.07, 0.07, 0.4, 0, 3.95, -1.35, { rz: Math.PI / 2, seg: 8 });
  bb.box('darkIron', 0.4, 3.0, 0.18, 1.5, 2.1, -0.1, { r: 0.04 }); bb.box('brass', 0.5, 0.18, 0.1, 1.5, 3.7, -0.2, { r: 0.02 });
  bg.add(bb.build('bell-static'));
  const bellG = new THREE.Group(); bellG.position.set(0, 3.85, -1.2); bg.add(bellG); const bl = new K.Batch(2.9);
  bl.lathe('brass', [[0.0, 0.0], [0.12, 0.02], [0.14, -0.1], [0.2, -0.3], [0.36, -0.58], [0.48, -0.78], [0.5, -0.84], [0.44, -0.86], [0.4, -0.8]], 0, -0.1, 0, { seg: 20 });
  bl.cyl('darkIron', 0.04, 0.04, 0.3, 0, -0.97, 0, { seg: 6 }); bl.sph('darkIron', 0.09, 0, -1.15, 0, { ws: 8, hs: 6 }); bl.tor('darkIron', 0.07, 0.02, 0, 0.1, 0, { rs: 5, ts: 10 }); bellG.add(bl.build('bell', true));
  const lampPos = Array.from({ length: 10 }, (_, i) => [1.5, 0.95 + i * 0.26, -0.24]); const gauge = lampRow(K, bg, lampPos, 0.075, null);
  const alarmMat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c }); const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), alarmMat); beacon.position.set(0, 4.3, -0.85); bg.add(beacon);
  // warden grille cabinets at FL / FR
  const cabs = [-3, 3].map((x, i) => { const cg = station(THREE, grp, x, -HZ + 2, 0), cb = new K.Batch(0);
    cb.cyl('darkIron', 0.52, 0.56, 1.0, 0, 0.5, 0, { seg: 16 }); for (const y of [0.15, 0.55, 0.95]) cb.tor('iron', 0.54, 0.03, 0, y, 0, { rx: Math.PI / 2, rs: 5, ts: 20 });
    cb.sph('darkIron', 0.52, 0, 1.0, 0, { ws: 16, hs: 6, sy: 0.4 }); cb.cyl('iron', 0.18, 0.18, 0.12, 0, 1.18, 0, { seg: 10 }); cb.box('ink', 0.52, 0.6, 0.06, 0, 0.36, 0.52, { r: 0.01, ao: false });
    rivets(cb, [[-0.22, 0.75, 0.5], [0.22, 0.75, 0.5], [-0.22, 0.1, 0.5], [0.22, 0.1, 0.5]], 'brass', 0.03); cg.add(cb.build('cab'));
    const hg = new THREE.Group(); hg.position.set(-0.26, 0.36, 0.56); cg.add(hg); const hb = new K.Batch(0.4); const hw = 0.52;
    hb.box('darkIron', hw, 0.62, 0.05, hw / 2, 0, 0, { r: 0.012 }); for (let k = 0; k < 6; k++) hb.box('iron', 0.03, 0.54, 0.05, 0.05 + k * 0.085, 0, 0.04, { r: 0.008 }); hb.box('iron', hw, 0.04, 0.05, hw / 2, 0.2, 0.04, { r: 0.008 }); hb.box('iron', hw, 0.04, 0.05, hw / 2, -0.2, 0.04, { r: 0.008 }); hg.add(hb.build('hatch', true));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), alarmMat); lamp.position.set(0, 1.28, 0); cg.add(lamp); return { hg, v: 0, vt: 0 }; });
  Object.assign(anchors, { lockFace: A(0, HZ - 0.5, 1.0, 2.1), pins: xs.map((x, i) => A(x, HZ - 0.8, 0.3, pinY(SHEAR) - 0.4)), grindstone: A(-HX + 0.6, 0, 0.8, 1.0), bell: A(HX - 1.1, 0, 0.5, 3.0), noiseGauge: A(HX - 0.6, 1.5, 0.3, 2.1), grilleL: A(-3, -HZ + 2.6, 0.5, 0.4), grilleR: A(3, -HZ + 2.6, 0.5, 0.4), keyBoard: A(-HX + 0.9, -0.0, 0.5, 2.6) }); shiftA(anchors, ['lockFace', 'pins'], ['grindstone', 'keyBoard'], ['bell', 'noiseGauge']);
  let noise = 0, nT = 0, swing = 0, ring = 0, grind = 0, grindT = 0, alarm = false, glow = 0, glowT = 0;
  const NC = i => (i < 5 ? 0x4fd16a : i < 8 ? 0xf0b430 : 0xff3a2a);
  const api = {
    anchors, kind: 'locksmith',
    /** state: 'idle' (bobbing at v 0..1; the shear line is v = 0.9), 'set' (aligned, glowing green), 'jam' (red flash) */
    setPin(i, state = 'idle', v = 0) { const p = pins[i]; if (!p) return; if (state === 'jam' && p.state !== 'jam') p.flash = 1; p.state = state; p.vt = state === 'set' ? SHEAR : clamp(v, 0, 1); },
    /** convenience: first n pins set, pin n bobs at v */
    setPins(n, v = 0) { pins.forEach((p, i) => api.setPin(i, i < n ? 'set' : i === n ? 'idle' : 'idle', i === n ? v : 0)); },
    /** 0..100 noise: gauge lamps, bell sway (still < 20, swaying, ringing at 100) */
    setNoise(v) { nT = clamp(v, 0, 100); const lit = Math.ceil(nT / 10); for (let i = 0; i < 10; i++) gauge.set(i, i < lit ? NC(i) : 0x514836); },
    /** the bell clangs once */
    ring() { ring = 1; },
    /** grindstone spinning (true/false or 0..1) with sparks */
    setGrind(on) { grindT = on === true ? 1 : on === false ? 0 : clamp(on, 0, 1); },
    /** lock face glow (the 3 s cut channel) 0..1 */
    setCut(v) { glowT = clamp(v, 0, 1); },
    /** lock alarm: red beacon and grille lamps */
    setAlarm(on) { alarm = !!on; if (!alarm) alarmMat.color.setHex(0x3a0c0c); },
    /** 0..1 each Warden hatch swings open */
    setGrille(side, open) { const c = cabs[side]; if (c) c.vt = clamp(open, 0, 1); },
    tick(dt, t) {
      noise = approach(noise, nT, 6, dt); const amp = sstep(15, 100, noise);
      ring = Math.max(0, ring - dt * 0.8); const swAmp = 0.05 + amp * 0.45 + ring * 0.6; swing = Math.sin(t * (2.2 + amp * 5)) * swAmp; bellG.rotation.z = swing;
      if (alarm) alarmMat.color.setHex(Math.sin(t * 9) > 0 ? 0xff2a1a : 0x4a0c0c); else if (noise >= 50) alarmMat.color.setHex(0x8a3a10); else alarmMat.color.setHex(0x3a0c0c);
      grind = approach(grind, grindT, 5, dt); wheelG.rotation.x += dt * grind * 14; spark.material.opacity = grind * (0.55 + Math.sin(t * 40) * 0.25);
      glow = approach(glow, glowT, 6, dt); glowMat.opacity = glow * (0.55 + Math.sin(t * 14) * 0.15);
      pins.forEach((p, i) => { p.v = approach(p.v, p.vt, p.state === 'set' ? 20 : 12, dt); p.g.position.y = pinY(p.v); p.flash = Math.max(0, p.flash - dt * 2.5);
        const set = p.state === 'set'; p.mat.emissive.setHex(set ? 0x2fd060 : 0x4a2800); p.mat.emissiveIntensity = set ? 1.2 + Math.sin(t * 6 + i) * 0.2 : 0.4; if (p.flash > 0) { p.mat.emissive.setHex(0xff2a1a); p.mat.emissiveIntensity = 0.4 + p.flash * 1.6; } });
      cabs.forEach(c => { c.v = approach(c.v, c.vt, 8, dt); c.hg.rotation.y = -c.v * 1.7; });
    },
  };
  api.setNoise(0);
  K.mergeStatics(grp); return { group: grp, anchors, api, tick: api.tick };
}

// ============ COUNTING HOUSE ============
function buildCounting(K, ctx) {
  const THREE = K.THREE, grp = new THREE.Group(); grp.name = 'skin:counting'; const anchors = BASE_ANCHORS();
  // ---- clerk's desk at B: counter, teller grille, a seated clerk (wall at z = 0, room toward -z)
  const dg = station(THREE, grp, ...WALL.B), db = new K.Batch(0);
  db.box('darkWood', 2.4, 0.18, 1.0, 0, 0.09, -0.5, { r: 0.03 }); db.box('wood', 2.4, 0.95, 0.34, 0, 0.62, -0.83, { r: 0.04 }); // counter front
  db.box('darkWood', 2.5, 0.1, 0.55, 0, 1.12, -0.76, { r: 0.03, t: 0xe0c8a0 });
  for (const sx of [-1, 1]) db.box('wood', 0.14, 0.9, 0.6, sx * 1.14, 0.6, -0.5, { r: 0.03 });
  db.box('wood', 2.4, 1.3, 0.1, 0, 0.75, -0.05, { r: 0.02 });
  for (let i = 0; i < 3; i++) db.box('darkWood', 0.66, 0.6, 0.04, -0.8 + i * 0.8, 0.58, -1.0, { r: 0.015, t: 0xc09870 }); // panel faces
  // teller window: brass frame with bars
  for (const sx of [-1, 1]) db.box('brass', 0.12, 1.5, 0.12, sx * 1.12, 1.9, -0.92, { r: 0.03 });
  db.box('brass', 2.4, 0.14, 0.14, 0, 2.65, -0.92, { r: 0.03 }); db.tor('brass', 1.0, 0.06, 0, 2.62, -0.92, { rs: 6, ts: 20, sy: 0.3 });
  for (let i = 0; i < 9; i++) db.cyl('brass', 0.022, 0.022, 1.38, -0.88 + i * 0.22, 1.9, -0.92, { seg: 6 });
  db.box('brass', 2.3, 0.08, 0.1, 0, 1.24, -0.92, { r: 0.02 }); db.box('brass', 0.7, 0.3, 0.06, 0, 1.45, -0.97, { r: 0.04 }); // coin slot plate
  // the ledger, ink pot, little bell on the counter
  db.box('red', 0.5, 0.06, 0.34, -0.55, 1.2, -0.7, { r: 0.015, ry: 0.2 }); db.box('bone', 0.46, 0.04, 0.3, -0.55, 1.24, -0.7, { r: 0.012, ry: 0.2 }); db.cyl('ink', 0.05, 0.06, 0.1, -0.1, 1.2, -0.7, { seg: 8 });
  db.lathe('brass', [[0, 0.1], [0.06, 0.09], [0.1, 0.04], [0.13, 0.0], [0, 0.0]], 0.65, 1.17, -0.7, { seg: 10 });
  // price/alert board above on the wall
  db.box('darkWood', 3.5, 1.45, 0.14, 0, 3.45, -0.07, { r: 0.04 }); db.box('brass', 3.7, 0.1, 0.2, 0, 4.13, -0.1, { r: 0.03 }); db.box('brass', 3.7, 0.1, 0.2, 0, 2.77, -0.1, { r: 0.03 });
  for (const sx of [-1, 1]) { db.box('darkWood', 0.34, 4.0, 0.2, sx * 1.55, 2.0, -0.1, { r: 0.04 }); db.box('brass', 0.42, 0.14, 0.26, sx * 1.55, 0.3, -0.12, { r: 0.03 }); db.box('brass', 0.42, 0.14, 0.26, sx * 1.55, 3.9, -0.12, { r: 0.03 }); for (const y of [1.2, 2.2, 3.2]) db.box('brass', 0.38, 0.06, 0.24, sx * 1.55, y, -0.11, { r: 0.015 }); }
  db.cyl('brass', 0.2, 0.2, 0.05, 2.15, 3.6, -0.05, { rx: Math.PI / 2, seg: 14 });
  db.cyl('darkWood', 0.2, 0.22, 0.5, 0, 0.45, -0.35, { seg: 10 }); // the stool
  dg.add(db.build('desk'));
  // clerk (static body, head bob and a scribbling quill); built facing +z, turned to face the room
  const ck = new THREE.Group(); ck.position.set(0, 0.7, -0.35); ck.rotation.y = Math.PI; ck.scale.setScalar(1.22); dg.add(ck); const kb = new K.Batch(1.0);
  kb.sph('red', 0.3, 0, 0.32, 0, { sy: 1.0, sx: 1.05, sz: 0.9 }); kb.sph('cloth', 0.1, -0.1, 0.5, 0.26, { ws: 6, hs: 5 }); for (const y of [0.5, 0.34, 0.18]) kb.sph('brass', 0.03, 0.0, y, 0.3, { ws: 6, hs: 4 });
  const head = new THREE.Group(); head.position.set(0, 0.82, 0.02); ck.add(head); const hb = new K.Batch(1.55);
  hb.sph('skin', 0.27, 0, 0, 0, { sx: 1.08, sy: 0.95, sz: 1.0, ws: 16, hs: 12, t: 0xc8f090 });
  hb.sph('skin', 0.075, 0, -0.02, 0.28, { ws: 8, hs: 6, sy: 1.2, sz: 1.5 }); hb.cone('skin', 0.05, 0.14, 0, -0.06, 0.37, { rx: Math.PI / 2, seg: 6 }); // hooked nose
  for (const sx of [-1, 1]) { hb.cone('skin', 0.1, 0.55, sx * 0.4, -0.02, -0.02, { rz: sx * -1.9, ry: sx * 0.15, seg: 6, t: 0xd8a080 }); hb.cone('red', 0.055, 0.3, sx * 0.4, -0.02, 0.0, { rz: sx * -1.9, ry: sx * 0.15, seg: 6, t: 0x992020, s: 0.9 }); hb.sph('gold', 0.04, sx * 0.1, 0.05, 0.25, { ws: 6, hs: 5, ao: false }); hb.cone('bone', 0.025, 0.1, sx * 0.1, -0.2, 0.2, { rx: Math.PI, seg: 5 }); }
  hb.add('skin', K.rbox(0.66, 0.09, 0.2, 0.02), 0, 0.17, 0.17, { rx: 0.35, t: 0x2f8a4a }); // green eyeshade
  head.add(hb.build('head', true)); ck.add(kb.build('torso'));
  const armG = new THREE.Group(); armG.position.set(0.22, 0.52, 0.18); ck.add(armG); const ab = new K.Batch(1.2); ab.cyl('skin', 0.05, 0.06, 0.4, 0, 0, 0.15, { rx: Math.PI / 2 - 0.5, seg: 7 }); ab.cyl('bone', 0.012, 0.012, 0.28, 0.0, 0.04, 0.4, { rx: 0.5, seg: 4 }); ab.sph('skin', 0.075, 0, -0.06, 0.34, { ws: 8, hs: 6 }); armG.add(ab.build('arm', true));
  // the alarm lamp
  const bellMat = new THREE.MeshBasicMaterial({ color: 0x3a1010 }); const lampLens = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), bellMat); lampLens.position.set(2.15, 3.6, -0.2); dg.add(lampLens);
  // market board canvas
  const bw = 1024, bh = 420; const boardCan = document.createElement('canvas'); boardCan.width = bw; boardCan.height = bh; const bgx = boardCan.getContext('2d'), boardTex = new THREE.CanvasTexture(boardCan); boardTex.colorSpace = THREE.SRGBColorSpace; boardTex.anisotropy = 4;
  const market = { writPrice: 20, counterPrice: 30, writs: 0, counters: 0, box: 0 };
  function drawBoard() {
    const g = bgx; g.clearRect(0, 0, bw, bh); g.fillStyle = '#1b2420'; g.fillRect(0, 0, bw, bh); g.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 90; i++) g.fillRect((i * 97) % bw, (i * 53) % bh, 60 + (i % 5) * 30, 2);
    g.strokeStyle = '#b89558'; g.lineWidth = 8; g.strokeRect(6, 6, bw - 12, bh - 12); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#f2e2b0'; g.font = '800 54px Georgia, serif'; g.fillText('THE VOTE MARKET', bw / 2, 52);
    g.strokeStyle = 'rgba(242,226,176,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(bw / 2, 100); g.lineTo(bw / 2, bh - 30); g.moveTo(60, 90); g.lineTo(bw - 60, 90); g.stroke();
    const col = (cx, label, price, n, color) => { g.fillStyle = color; g.font = '700 40px system-ui, sans-serif'; g.fillText(label, cx, 135); g.font = '900 112px Georgia, serif'; g.fillStyle = '#fff3cc'; g.fillText(String(price), cx, 222); g.font = '700 30px system-ui'; g.fillStyle = color; g.fillText('GOLD', cx, 300);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(cx - 56 + i * 56, 352, 18, 0, TAU); g.fillStyle = i < n ? color : 'rgba(255,255,255,.12)'; g.fill(); g.lineWidth = 3; g.strokeStyle = color; g.stroke(); } };
    col(bw * 0.25, 'WRIT', market.writPrice, market.writs, '#ffd24a'); col(bw * 0.75, 'COUNTER-WRIT', market.counterPrice, market.counters, '#9fb8d8'); boardTex.needsUpdate = true;
  }
  drawBoard(); const board = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.3), new THREE.MeshBasicMaterial({ map: boardTex })); board.position.set(0, 3.45, -0.15); board.rotation.y = Math.PI; dg.add(board);
  // ---- the great scales at L
  const sg = station(THREE, grp, ...WALL.L), sbt = new K.Batch(0);
  sbt.box('darkStone', 1.2, 0.3, 1.2, 0, 0.15, -0.6, { r: 0.05 }); sbt.box('stone', 0.9, 0.4, 0.9, 0, 0.5, -0.6, { r: 0.05 }); sbt.cyl('brass', 0.14, 0.2, 2.8, 0, 2.0, -0.6, { seg: 12 }); sbt.sph('brass', 0.22, 0, 3.4, -0.6, { ws: 12, hs: 8 });
  sbt.cyl('darkIron', 0.1, 0.1, 0.4, 0, 3.4, -0.6, { rx: Math.PI / 2, seg: 8 });
  for (const y of [1.0, 2.0]) sbt.tor('brass', 0.2, 0.04, 0, y, -0.6, { rx: Math.PI / 2, rs: 5, ts: 14 }); rivets(sbt, [[0.4, 0.5, -1.07], [-0.4, 0.5, -1.07]]);
  sg.add(sbt.build('scale-static'));
  const beam = new THREE.Group(); beam.position.set(0, 3.4, -0.6); sg.add(beam); const bm = new K.Batch(3.4);
  bm.box('brass', 3.0, 0.1, 0.09, 0, 0, 0, { r: 0.03 }); bm.tor('brass', 0.5, 0.04, 0, -0.1, 0, { ts: 20, rs: 5, sy: 0.5, rz: Math.PI }); for (const sx of [-1, 1]) { bm.sph('brass', 0.08, sx * 1.5, 0.0, 0, { ws: 8, hs: 6 }); }
  bm.cone('brass', 0.05, 0.4, 0, 0.25, 0, { seg: 6 }); beam.add(bm.build('beam', true));
  const pans = [-1, 1].map((sx, i) => { const pg = new THREE.Group(); pg.position.set(sx * 1.5, -0.1, 0); beam.add(pg); const pb = new K.Batch(2.2);
    for (const a of [0, 1, 2]) { const ang = a / 3 * TAU; chain(pb, Math.cos(ang) * 0.4, -0.1, -0.95, Math.sin(ang) * 0.4, { mat: 'brass' }); }
    pb.lathe('brass', [[0, -1.05], [0.3, -1.04], [0.5, -0.98], [0.55, -0.92], [0.5, -0.94], [0.3, -1.0], [0, -1.0]], 0, 0, 0, { seg: 20 }); pb.tor('brass', 0.55, 0.03, 0, -0.93, 0, { rx: Math.PI / 2, rs: 5, ts: 24 }); pg.add(pb.build('pan', true));
    const wbt = new K.Batch(2.2); const wmat = i ? 'darkIron' : 'gold'; for (let n = 0; n < 3; n++) { const a = n * 2.1; wbt.cyl(wmat, 0.16, 0.18, 0.15, Math.cos(a) * 0.18, -0.88 + (n === 2 ? 0.15 : 0), Math.sin(a) * 0.18, { seg: 12 }); }
    const wm = wbt.build('weights', true); const mesh = Object.values(wm.userData.meshes)[0]; mesh.geometry.userData.vp = mesh.geometry.attributes.position.count / 3; pg.add(wm); return { pg, mesh, vp: mesh.geometry.userData.vp, n: 0 }; });
  pans.forEach(p => p.mesh.geometry.setDrawRange(0, 0));
  // ---- strongbox at R
  const xg = station(THREE, grp, ...WALL.R), xb = new K.Batch(0);
  xb.box('darkWood', 1.2, 0.18, 1.1, 0, 0.09, -0.6, { r: 0.03 }); xb.box('wood', 1.12, 0.7, 0.9, 0, 0.5, -0.62, { r: 0.04 });
  for (const sx of [-0.4, 0.4]) xb.box('darkIron', 0.1, 0.74, 0.94, sx, 0.5, -0.62, { r: 0.02 }); xb.box('darkIron', 1.14, 0.12, 0.92, 0, 0.14, -0.62, { r: 0.02 }); for (const sx of [-0.52, 0.52]) xb.box('darkIron', 0.1, 0.1, 0.92, sx, 0.86, -0.62, { r: 0.02 }); for (const dz of [-0.43, 0.43]) xb.box('darkIron', 1.14, 0.1, 0.1, 0, 0.86, -0.62 + dz, { r: 0.02 });
  xb.box('darkWood', 1.0, 0.04, 0.78, 0, 0.8, -0.62, { r: 0.01, t: 0x8a6a48 });
  rivets(xb, [[-0.3, 0.3, -1.1], [0.3, 0.3, -1.1], [-0.3, 0.72, -1.1], [0.3, 0.72, -1.1]], 'brass', 0.035); xb.box('brass', 0.22, 0.28, 0.06, 0, 0.62, -1.1, { r: 0.02 }); xb.cyl('darkIron', 0.05, 0.05, 0.06, 0, 0.58, -1.15, { rx: Math.PI / 2, seg: 8 });
  xg.add(xb.build('strongbox'));
  const lidG = new THREE.Group(); lidG.position.set(0, 0.88, -0.17); xg.add(lidG); const lb = new K.Batch(0.9);
  lb.box('wood', 1.12, 0.12, 0.92, 0, 0.0, -0.46, { r: 0.04 }); lb.box('darkIron', 1.14, 0.14, 0.1, 0, 0.0, -0.88, { r: 0.02 }); for (const sx of [-0.4, 0.4]) lb.box('darkIron', 0.1, 0.15, 0.94, sx, 0.0, -0.46, { r: 0.02 });
  lb.tor('darkIron', 0.46, 0.05, 0, 0.06, -0.46, { rz: 0, rx: Math.PI / 2, sx: 1.2, sy: 0.9, ts: 16, rs: 5 }); lidG.add(lb.build('lid', true));
  // coin pile in the box (ranked draw range, 3 visible stages)
  const pile = new THREE.Mesh(K.mound(), K.coinMat); pile.position.set(0, 0.78, -0.62); xg.add(pile);
  const pileGlow = new THREE.Sprite(K.glowMat(0xffc040, 0)); pileGlow.scale.set(2.2, 1.6, 1); pileGlow.position.set(0, 1.05, -0.5); xg.add(pileGlow);
  const alarmLamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bellMat); alarmLamp.position.set(-0.5, 2.9, -0.28); xg.add(alarmLamp); { const pl = new K.Batch(0); pl.cyl('brass', 0.2, 0.2, 0.05, -0.5, 2.9, -0.05, { rx: Math.PI / 2, seg: 14 }); pl.cyl('darkIron', 0.04, 0.04, 0.25, -0.5, 2.9, -0.16, { rx: Math.PI / 2, seg: 6 }); xg.add(pl.build('lampmount')); }
  // coin-sack stands at FL / FR
  const stands = [-3, 3].map(x => { const hg = station(THREE, grp, x, -HZ + 2, 0), hb2 = new K.Batch(0);
    hb2.cyl('darkStone', 0.5, 0.55, 0.2, 0, 0.1, 0, { seg: 14 }); hb2.box('darkWood', 0.16, 2.0, 0.16, 0, 1.1, 0, { r: 0.03 }); hb2.box('darkWood', 1.0, 0.14, 0.14, 0, 2.0, 0, { r: 0.03 }); hb2.box('darkWood', 0.8, 0.1, 0.1, 0, 1.55, 0, { r: 0.02, ry: 1.3 });
    for (const sx of [-0.4, 0, 0.4]) { hb2.tor('darkIron', 0.07, 0.016, sx, 1.93, 0, { rz: 0, ts: 10, rs: 4 }); } hg.add(hb2.build('stand'));
    const sb2 = new K.Batch(1.0); [-0.4, 0, 0.4].forEach((sx, k) => { sb2.lathe('cloth', [[0, -0.34], [0.14, -0.32], [0.24, -0.2], [0.22, 0.0], [0.12, 0.16], [0.07, 0.24], [0.1, 0.3]], sx, 1.5 + (k === 1 ? -0.12 : 0), 0, { seg: 12, sy: 1, t: k === 1 ? 0xb89868 : 0xc8a874 });
      sb2.tor('leather', 0.09, 0.025, sx, 1.52 + (k === 1 ? -0.12 : 0) + 0.2, 0, { rx: Math.PI / 2, rs: 4, ts: 10 }); });
    const sm = sb2.build('sacks', true); hg.add(sm); const mesh = Object.values(sm.userData.meshes); return { grp: sm, meshes: mesh }; });
  Object.assign(anchors, { desk: A(0, HZ - 0.5, 1.2, 1.1), clerk: A(0, HZ - 0.8, 0.4, 1.5), board: A(0, HZ - 0.1, 0.3, 3.7), scales: A(-HX + 0.6, 0, 0.8, 1.5), strongbox: A(HX - 0.7, 0, 0.8, 0.9), sackStandL: A(-3, -HZ + 2, 0.6, 1.5), sackStandR: A(3, -HZ + 2, 0.6, 1.5), clerkBell: A(0.65, HZ - 0.8, 0.3, 1.25) }); shiftA(anchors, ['desk', 'clerk', 'board', 'clerkBell'], ['scales'], ['strongbox']);
  let tilt = 0, tiltT = 0, lid = 0, lidT = 0.3, lvl = 0, lvlT = 0, alarm = false, rob = 0, pulse = 0;
  const api = {
    anchors, kind: 'counting',
    /** the market board: { writPrice, counterPrice, writs 0..3, counters 0..3 } */
    setMarket(o = {}) { Object.assign(market, o); drawBoard(); pans[0].n = clamp(Math.round(market.writs), 0, 3); pans[1].n = clamp(Math.round(market.counters), 0, 3); pans.forEach(p => p.mesh.geometry.setDrawRange(0, p.n * p.vp)); tiltT = clamp(pans[0].n - pans[1].n, -3, 3) * 0.07; },
    /** strongbox fill 0..1 (three visible stages), reads from the coin heap */
    setStrongbox(v) { lvlT = clamp(v, 0, 1); },
    /** lid 0..1 (0.3 = resting open as in the plan; 1 = wide, during a robbery) */
    setLid(v) { lidT = clamp(v, 0, 1); },
    /** robbery channel progress 0..1 (the lid trembles) */
    setRobbery(p) { rob = clamp(p, 0, 1); },
    /** the clerk rings his bell: red lamps flash */
    setAlarm(on) { alarm = !!on; if (!alarm) bellMat.color.setHex(0x3a1010); },
    /** n sacks left on a hook stand (0..3) */
    setSacks(side, n) { const s = stands[side]; if (!s) return; n = clamp(Math.round(n), 0, 3); s.meshes.forEach(m => { const per = m.geometry.attributes.position.count / 3; m.geometry.setDrawRange(0, per * n); }); },
    tick(dt, t) {
      tilt = approach(tilt, tiltT, 4, dt); beam.rotation.z = tilt; pans.forEach(p => { p.pg.rotation.z = -tilt; });
      lid = approach(lid, lidT, 6, dt); lidG.rotation.x = lid * 1.9 - rob * Math.sin(t * 38) * 0.03; lvl = approach(lvl, lvlT, 3, dt);
      pile.scale.set(0.2 + 0.28 * lvl, 0.03 + 0.55 * lvl, 0.2 + 0.24 * lvl); pile.visible = lvl > 0.02; pileGlow.material.opacity = lvl * 0.35 * (0.8 + 0.2 * Math.sin(t * 2)); pileGlow.visible = lvl > 0.05;
      head.rotation.x = Math.sin(t * 1.3) * 0.05 + (alarm ? 0.0 : 0); head.rotation.y = Math.sin(t * 0.5) * 0.18; armG.rotation.y = Math.sin(t * 3.1) * 0.12; armG.rotation.x = Math.sin(t * 6.3) * 0.05;
      if (alarm) bellMat.color.setHex(Math.sin(t * 10) > 0 ? 0xff2a1a : 0x4a0c0c);
    },
  };
  api.setMarket({}); api.setSacks(0, 3); api.setSacks(1, 3); api.setStrongbox(0.55);
  K.mergeStatics(grp); return { group: grp, anchors, api, tick: api.tick };
}

// ============ KEYSTONE ============
function glyphAtlas(K) {
  return K.tex.glyphs || (K.tex.glyphs = K.ctex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 15;
    const cell = (i, fn) => { g.save(); g.translate((i % 2) * 256 + 128, Math.floor(i / 2) * 256 + 128); fn(); g.restore(); };
    cell(0, () => { g.beginPath(); g.ellipse(0, 0, 90, 52, 0, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 24, 0, TAU); g.fill(); g.lineWidth = 9; g.beginPath(); g.moveTo(0, -78); g.lineTo(0, -110); g.moveTo(-60, -60); g.lineTo(-80, -86); g.moveTo(60, -60); g.lineTo(80, -86); g.stroke(); }); // eye
    cell(1, () => { g.beginPath(); for (let a = 0; a < 5.4 * Math.PI; a += 0.12) { const r = 8 + a * 7; g[a ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); }); // spiral
    cell(2, () => { g.beginPath(); g.moveTo(0, -105); g.lineTo(0, 105); g.moveTo(-70, -30); g.lineTo(0, -105); g.lineTo(70, -30); g.moveTo(-60, 40); g.lineTo(0, -20); g.lineTo(60, 40); g.stroke(); }); // arrow tree
    cell(3, () => { g.beginPath(); g.arc(-12, 0, 82, -Math.PI * 0.62, Math.PI * 0.62, false); g.stroke(); g.beginPath(); g.arc(50, 0, 18, 0, TAU); g.fill(); g.lineWidth = 9; g.beginPath(); g.moveTo(-100, 0); g.lineTo(-40, 0); g.stroke(); }); // crescent
  }));
}
function buildKeystone(K, ctx) {
  const THREE = K.THREE, grp = new THREE.Group(); grp.name = 'skin:keystone'; const anchors = BASE_ANCHORS(), atlas = glyphAtlas(K);
  const sx0 = 0, sz0 = -HZ + 2.7;
  // socket: stone ring set into the floor, dark pit, the keystone wedge
  const sk = new K.Batch(0);
  sk.cyl('darkStone', 1.05, 1.1, 0.1, sx0, 0.05, sz0, { seg: 28 }); sk.tor('stone', 0.92, 0.07, sx0, 0.1, sz0, { rx: Math.PI / 2, rs: 6, ts: 36 }); sk.cyl('ink', 0.78, 0.78, 0.05, sx0, 0.11, sz0, { seg: 28, ao: false });
  sk.tor('brass', 0.5, 0.025, sx0, 0.13, sz0, { rx: Math.PI / 2, rs: 5, ts: 32 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; sk.box('darkStone', 0.5, 0.06, 0.5, sx0 + Math.cos(a) * 1.28, 0.03, sz0 + Math.sin(a) * 1.28, { ry: -a, r: 0.015 }); }
  grp.add(sk.build('socket'));
  const keyWedge = new THREE.Shape(); keyWedge.moveTo(-0.28, 0); keyWedge.lineTo(0.28, 0); keyWedge.lineTo(0.2, 0.62); keyWedge.lineTo(-0.2, 0.62); keyWedge.closePath();
  const kwG = new THREE.ExtrudeGeometry(keyWedge, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 1 }); kwG.translate(0, -0.31, -0.1);
  const kwMat = new THREE.MeshStandardMaterial({ color: 0x9a96a8, roughness: 0.4, metalness: 0.2, emissive: 0x30d8ff, emissiveIntensity: 0.0 }); const kw = new THREE.Mesh(kwG, kwMat); kw.position.set(sx0, 0.55, sz0); grp.add(kw);
  const kwGlow = new THREE.Sprite(K.glowMat(0x50e0ff, 0)); kwGlow.scale.set(3.4, 3.4, 1); kwGlow.position.set(sx0, 0.7, sz0); grp.add(kwGlow);
  // floor glyph ring (4 slots show the circuit order; additive, vertex-coloured: next glows)
  const slotMesh = makeGlyphQuads(K, atlas, 4, 0.42, (i) => { const a = i * Math.PI / 2 + Math.PI / 4; return [sx0 + Math.cos(a) * 1.28, 0.075, sz0 + Math.sin(a) * 1.28, -Math.PI / 2, 0]; }); grp.add(slotMesh.mesh);
  // stones: tapered monolith + fire bowl + glyph face + flame
  const stoneDefs = [{ x: -HX + 0.6, z: LZ, ry: Math.PI / 2, name: 'L' }, { x: -3, z: -HZ + 2, ry: 0.35, name: 'FL' }, { x: 3, z: -HZ + 2, ry: -0.35, name: 'FR' }, { x: HX - 0.6, z: RZ, ry: -Math.PI / 2, name: 'R' }];
  const stoneG = stoneDefs.map(d => {
    const g = station(THREE, grp, d.x, d.z, d.ry), b = new K.Batch(0);
    b.box('darkStone', 1.0, 0.25, 1.0, 0, 0.125, 0, { r: 0.05 }); b.cyl('stone', 0.42, 0.55, 1.7, 0, 1.1, 0, { seg: 4, ry: Math.PI / 4, t: 0xd0c8b8 }); b.cyl('darkStone', 0.6, 0.48, 0.16, 0, 1.97, 0, { seg: 4, ry: Math.PI / 4 });
    b.lathe('brass', [[0, 0], [0.18, 0.0], [0.34, 0.12], [0.42, 0.28], [0.4, 0.3], [0.3, 0.22], [0.0, 0.1]], 0, 2.05, 0, { seg: 16 }); b.tor('brass', 0.41, 0.03, 0, 2.33, 0, { rx: Math.PI / 2, rs: 5, ts: 18 });
    b.box('ink', 0.56, 0.74, 0.03, 0, 1.18, 0.335, { r: 0.008, ao: false, rx: -0.05 }); b.box('brass', 0.62, 0.05, 0.05, 0, 1.6, 0.34, { r: 0.01 }); b.box('brass', 0.62, 0.05, 0.05, 0, 0.76, 0.35, { r: 0.01 });
    g.add(b.build('stone')); return g; });
  const flameMat = [0, 1, 2, 3].map(() => new THREE.MeshBasicMaterial({ map: K.tex.flame, color: 0xff9a3a, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, fog: false }));
  const flameG = new THREE.PlaneGeometry(0.62, 1.0); flameG.translate(0, 0.5, 0);
  const flames = stoneG.map((g, i) => { const f = new THREE.Group(); f.position.set(0, 2.3, 0); g.add(f); for (const ry of [0, Math.PI / 2]) { const m = new THREE.Mesh(flameG, flameMat[i]); m.rotation.y = ry; f.add(m); } return f; });
  // glyph faces on the monoliths (merged, vertex coloured additive)
  const faces = makeGlyphQuads(K, atlas, 4, 0.58, (i) => { const d = stoneDefs[i], c = Math.cos(d.ry), s = Math.sin(d.ry), lz = 0.36, ly = 1.18; return [d.x + s * lz, ly, d.z + c * lz, 0, d.ry]; }, true); grp.add(faces.mesh);
  // altar at B
  const ag = station(THREE, grp, ...WALL.B), ab = new K.Batch(0);
  ab.box('darkStone', 2.4, 0.3, 1.0, 0, 0.15, -0.5, { r: 0.05 }); ab.box('stone', 2.2, 0.7, 0.9, 0, 0.65, -0.5, { r: 0.05, t: 0xc8c0b0 }); ab.box('darkStone', 2.4, 0.14, 1.0, 0, 1.07, -0.5, { r: 0.04 });
  for (const sx of [-0.9, 0.9]) { ab.cyl('bone', 0.08, 0.09, 0.36, sx, 1.32, -0.55, { seg: 8 }); ab.cone('bone', 0.05, 0.08, sx, 1.55, -0.55, { seg: 6 }); }
  ab.lathe('brass', [[0, 0], [0.2, 0.0], [0.34, 0.1], [0.38, 0.2], [0.34, 0.18], [0.2, 0.08], [0, 0.06]], 0, 1.14, -0.5, { seg: 18 });
  ab.box('darkStone', 3.0, 1.9, 0.2, 0, 3.0, -0.1, { r: 0.05 }); ab.box('brass', 3.1, 0.1, 0.24, 0, 4.0, -0.1, { r: 0.03 }); ab.box('brass', 3.1, 0.08, 0.24, 0, 2.08, -0.1, { r: 0.03 });
  ag.add(ab.build('altar'));
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffd23a, metalness: 1, roughness: 0.25, emissive: 0xffa010, emissiveIntensity: 0.1 }); const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.22, 7), leafMat); leaf.rotation.x = -Math.PI / 2; leaf.position.set(0, 1.28, -0.5); ag.add(leaf);
  const relief = makeGlyphQuads(K, atlas, 4, 0.5, (i) => [(-1.05 + i * 0.7), 3.0, -0.2, 0, 0]); relief.mesh.rotation.set(0, 0, 0); ag.add(relief.mesh); relief.setAll(0x70602e);
  const altarGlow = new THREE.Sprite(K.glowMat(0xffc040, 0)); altarGlow.scale.set(2.4, 2.4, 1); altarGlow.position.set(0, 1.4, -0.5); ag.add(altarGlow);
  // resonance lamps (three marks: 30/60/90) on the socket ring
  const resL = lampRow(K, grp, [30, 60, 90].map((v, i) => [sx0 + Math.cos(-0.5 + i * 0.5) * 0, 0.16, sz0 + (i - 1) * 0.0]), 0.001, [0x222222, 0x222222, 0x222222]); resL.mesh.visible = false;
  const resPos = [0, 1, 2].map(i => { const a = Math.PI * 0.82 + i * 0.28; return [sx0 + Math.cos(a) * 1.0, 0.17, sz0 + Math.sin(a) * 1.0]; }); const res = lampRow(K, grp, resPos, 0.06, [0x514836, 0x514836, 0x514836]);
  Object.assign(anchors, { socket: A(sx0, sz0, 1.0, 0.1), stones: stoneDefs.map((d, i) => A(d.x, d.z, 0.7, 1.2, { glyph: i, name: d.name })), altar: A(BX, HZ - 0.5, 1.2, 1.1), glyphRing: A(sx0, sz0, 1.5, 0.1), flameBowls: stoneDefs.map((d, i) => A(d.x, d.z, 0.4, 2.35)) });
  const st = stoneDefs.map(() => ({ state: 'dark', frac: 0, k: 0 })); let order = [0, 1, 2, 3], progress = 0, armed = false, armedK = 0, reson = 0, altar = 0, altarT = 0;
  const FLAME_LIT = new THREE.Color(0xffa040), FLAME_ARM = new THREE.Color(0x7fe8ff), tmp = new THREE.Color();
  function relayoutSlots() { order.forEach((glyph, slot) => slotMesh.setGlyph(slot, glyph)); }
  const api = {
    anchors, kind: 'keystone',
    /** the circuit order: array of 4 stone/glyph indices (0 = L, 1 = FL, 2 = FR, 3 = R); the floor ring shows it left to right */
    setOrder(o) { order = o.slice(0, 4); relayoutSlots(); },
    /** how many glyphs of the order are already lit (the next one pulses) */
    setProgress(n) { progress = clamp(Math.round(n), 0, 4); },
    /** per stone: 'dark' | 'lit' | 'snuffed'; frac = burn left 0..1 (flickers when low) */
    setStone(i, state, frac = 1) { if (st[i]) { st[i].state = state; st[i].frac = clamp(frac, 0, 1); } },
    /** all four burning: the keystone glows and the flames turn white-blue */
    setArmed(on) { armed = !!on; },
    /** 0..100 resonance: three rune lamps at 30/60/90 */
    setResonance(v) { reson = clamp(v, 0, 100); [30, 60, 90].forEach((th, i) => res.set(i, reson >= th ? (i === 2 ? 0xff3a2a : 0xff9a2a) : 0x514836)); },
    /** gold-leaf dish glow 0..1 */
    setAltar(v) { altarT = clamp(v, 0, 1); },
    tick(dt, t) {
      armedK = approach(armedK, armed ? 1 : 0, 3, dt); kwMat.emissiveIntensity = armedK * (1.1 + Math.sin(t * 3) * 0.25); kw.position.y = 0.55 + armedK * (0.18 + Math.sin(t * 1.6) * 0.04); kw.rotation.y = armedK * t * 0.6; kwGlow.material.opacity = armedK * 0.45; kwGlow.visible = armedK > 0.02;
      altar = approach(altar, altarT, 4, dt); altarGlow.material.opacity = altar * 0.5; altarGlow.visible = altar > 0.02; leafMat.emissiveIntensity = 0.1 + altar * 1.1;
      st.forEach((s, i) => {
        const lit = s.state === 'lit', tgt = lit ? 1 : 0; s.k = approach(s.k, tgt, lit ? 9 : 5, dt); const low = lit && s.frac < 0.15, fl = low ? (Math.sin(t * 26 + i * 3) > -0.2 ? 1 : 0.15) : 1; const sz = (0.35 + 0.65 * s.k) * (0.9 + Math.sin(t * 11 + i * 2) * 0.1 + Math.sin(t * 17 + i) * 0.06) * (low ? 0.7 : 1) * fl;
        flames[i].scale.set(sz, sz * (1 + Math.sin(t * 13 + i) * 0.1), sz); flames[i].rotation.y = t * 0.8 + i; flameMat[i].opacity = s.k * fl * 0.95; flameMat[i].color.copy(FLAME_LIT).lerp(FLAME_ARM, armedK);
        const gl = lit ? 1 : s.state === 'snuffed' ? 0.12 : 0.22; tmp.setRGB(0.35 * gl + armedK * 0.1, 0.8 * gl, 1.0 * gl).multiplyScalar(lit ? 0.7 + 0.3 * fl : 1);
        faces.setGlyphColor(i, tmp.getHex());
        const next = order[progress] === i && progress < 4 && !armed; if (next && s.state !== 'lit') faces.setGlyphColor(i, tmp.setRGB(0.9, 0.7 + 0.2 * Math.sin(t * 5), 0.3).multiplyScalar(0.6 + 0.4 * Math.sin(t * 5)).getHex());
      });
      order.forEach((glyph, slot) => { const done = slot < progress, next = slot === progress && progress < 4;
        slotMesh.setGlyphColor(slot, armed ? tmp.setRGB(0.45, 0.95, 1).multiplyScalar(0.85 + 0.15 * Math.sin(t * 4 + slot)).getHex() : done ? 0xffc040 : next ? tmp.setRGB(1, 0.85, 0.35).multiplyScalar(0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 5))).getHex() : 0x2a2418); });
    },
  };
  api.setOrder([0, 1, 2, 3]); api.setResonance(0);
  K.mergeStatics(grp); return { group: grp, anchors, api, tick: api.tick };
}
// quads textured with one atlas cell each, additive, per-quad colour via vertex colours. flatFloor: lies on the floor; else faces +z (rotated by ry)
function makeGlyphQuads(K, atlas, n, size, place, upright = false) {
  const THREE = K.THREE, pos = [], uv = [], col = [], idx = [];
  for (let i = 0; i < n; i++) {
    const [x, y, z, rx, ry] = place(i), h = size / 2, c = Math.cos(ry), s = Math.sin(ry);
    // local corners (-h,-h) (h,-h) (h,h) (-h,h) in the quad plane
    const corners = [[-h, -h], [h, -h], [h, h], [-h, h]];
    for (const [lx, ly] of corners) { if (upright) { pos.push(x + lx * c, y + ly, z - lx * s); } else if (rx) { pos.push(x + lx, y, z - ly); } else { pos.push(x + lx, y + ly, z); } uv.push(0, 0); col.push(0.2, 0.2, 0.2); }
    idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: atlas, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  const uva = g.attributes.uv, cola = g.attributes.color, c = new THREE.Color();
  const api = { mesh,
    setGlyph(q, glyph) { const u0 = (glyph % 2) * 0.5, v0 = 1 - (Math.floor(glyph / 2) + 1) * 0.5; [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([a, b], k) => uva.setXY(q * 4 + k, u0 + a * 0.5, v0 + b * 0.5)); uva.needsUpdate = true; },
    setGlyphColor(q, hex) { c.set(hex); for (let k = 0; k < 4; k++) cola.setXYZ(q * 4 + k, c.r, c.g, c.b); cola.needsUpdate = true; },
    setAll(hex) { for (let q = 0; q < n; q++) { api.setGlyphColor(q, hex); api.setGlyph(q, q); } } };
  for (let q = 0; q < n; q++) api.setGlyph(q, q);
  return api;
}

// ============ coin heaps (ranked so that setDrawRange grows the pile coin by coin) ============
function coinHeap(K, o) {
  const THREE = K.THREE, r = rng(o.seed || 1), N = o.n, cnt = o.count || 1, R = o.R, Hh = o.Hh, cr = o.coinR || 0.11, th = cr * 0.28;
  const cg = K.g(`coin${cr}`, () => { const g = new THREE.CylinderGeometry(cr, cr * 0.96, th, 7, 1); return g.toNonIndexed(); }), vpc = cg.attributes.position.count, total = N * cnt;
  const pos = new Float32Array(total * vpc * 3), nor = new Float32Array(total * vpc * 3), col = new Float32Array(total * vpc * 3), uvA = new Float32Array(total * vpc * 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  const heapsR = Array.from({ length: cnt }, (_, h) => rng((o.seed || 1) * 31 + h * 17));
  let w = 0;
  for (let i = 0; i < N; i++) for (let h = 0; h < cnt; h++) {
    const rr = heapsR[h], f = (i + 1) / N, Rc = R * (0.38 + 0.62 * Math.pow(f, 0.7)), rad = Rc * Math.pow(rr(), 0.75), ang = rr() * TAU;
    const prof = Math.max(0, 1 - Math.pow(rad / (Rc + 0.001), 1.6)), y = Hh * Math.pow(f, 0.8) * prof + (rr() - 0.5) * cr * 0.4 + th;
    const slope = 0.5 * (rad / (Rc + 0.001)); e.set((rr() - 0.5) * 0.8 + Math.sin(ang) * slope, rr() * TAU, (rr() - 0.5) * 0.8 - Math.cos(ang) * slope, 'YXZ'); q.setFromEuler(e);
    p.set(Math.cos(ang) * rad * (o.sx || 1), y, Math.sin(ang) * rad); m.compose(p, q, s); nm.getNormalMatrix(m);
    const tint = 0.78 + rr() * 0.32, ci = (i % 9 === 0) ? 0xffe27a : 0xffffff; c.set(ci).multiplyScalar(tint * (0.7 + 0.3 * sstep(0, Hh, y)));
    const pa = cg.attributes.position, na = cg.attributes.normal, ua = cg.attributes.uv;
    for (let k = 0; k < vpc; k++) { v.fromBufferAttribute(pa, k).applyMatrix4(m); pos[w * 3] = v.x; pos[w * 3 + 1] = v.y; pos[w * 3 + 2] = v.z; v.fromBufferAttribute(na, k).applyNormalMatrix(nm).normalize(); nor[w * 3] = v.x; nor[w * 3 + 1] = v.y; nor[w * 3 + 2] = v.z; col[w * 3] = c.r; col[w * 3 + 1] = c.g; col[w * 3 + 2] = c.b; uvA[w * 2] = ua.getX(k); uvA[w * 2 + 1] = ua.getY(k); w++; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvA, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, Hh / 2, 0), R * 1.5 + Hh); const mesh = new THREE.Mesh(g, K.mats.brass); mesh.userData.total = N; mesh.userData.vpc = vpc * cnt; mesh.name = 'coinHeap'; return mesh;
}

// ----------------------------------------------------------------------------------------------------------------- the shared shell + public builder
const BUILDERS = { ram: buildRam, locksmith: buildLocksmith, counting: buildCounting, keystone: buildKeystone };

/**
 * One vaultbreaker room. `type` = 'ram' | 'locksmith' | 'counting' | 'keystone'.
 * opts: { lazy = true (build a skin only when first shown), onImpact(strength) (ram strike contact), H }
 * Returns { group, type, setSkin(type, {flash}), skin(type) -> state-setter API, anchors, anchorsOf(type), solids, update(dt, now),
 *           flash(), setBreach(0..100), setAlarm(on), stats(), dispose() }
 */
export function buildVaultbreaker(THREE, helpers, type = 'ram', opts = {}) {
  const K = getKit(THREE, helpers), root = new THREE.Group(); root.name = 'vaultbreaker';
  const shellB = new K.Batch(0), H = opts.H || SIZE.H;
  // name banner over B (frame, hangers), two door plates beside the vault door
  shellB.box('brass', 6.2, 1.6, 0.14, BX, 5.5, HZ - 0.09, { r: 0.04, t: 0xe8c070 }); shellB.box('darkIron', 6.0, 0.12, 0.2, BX, 6.36, HZ - 0.1, { r: 0.03 });
  for (const sx of [-2.7, 2.7]) { shellB.cyl('darkIron', 0.03, 0.03, 0.3, BX + sx, 6.2, HZ - 0.12, { seg: 6 }); }
  rivets(shellB, [[BX - 2.9, 4.85, HZ - 0.17], [BX + 2.9, 4.85, HZ - 0.17], [BX - 2.9, 6.15, HZ - 0.17], [BX + 2.9, 6.15, HZ - 0.17]], 'brass', 0.05);
  for (const sx of [-1, 1]) { shellB.cyl('brass', 0.5, 0.5, 0.12, sx * 3.45, 3.0, -HZ + 0.1, { rx: Math.PI / 2, seg: 24 }); shellB.tor('brass', 0.52, 0.05, sx * 3.45, 3.0, -HZ + 0.14, { rs: 6, ts: 24 }); shellB.box('darkIron', 0.12, 0.3, 0.12, sx * 3.45, 2.4, -HZ + 0.08, { r: 0.02 }); }
  root.add(shellB.build('shell'));
  const bannerCan = document.createElement('canvas'); bannerCan.width = 1536; bannerCan.height = 384; const bctx = bannerCan.getContext('2d'), bannerTex = new THREE.CanvasTexture(bannerCan); bannerTex.colorSpace = THREE.SRGBColorSpace; bannerTex.anisotropy = 8;
  const bannerM = new THREE.MeshStandardMaterial({ map: bannerTex, emissiveMap: bannerTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.5, metalness: 0.2 });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.45), bannerM); banner.position.set(BX, 5.5, HZ - 0.17); banner.rotation.y = Math.PI; root.add(banner);
  const plateCan = document.createElement('canvas'); plateCan.width = plateCan.height = 128; const pctx = plateCan.getContext('2d'), plateTex = new THREE.CanvasTexture(plateCan); plateTex.colorSpace = THREE.SRGBColorSpace;
  const plateM = new THREE.MeshBasicMaterial({ map: plateTex }); for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), plateM); p.position.set(sx * 3.45, 3.0, -HZ + 0.17); root.add(p); }
  const flashCan = document.createElement('canvas'); flashCan.width = 768; flashCan.height = 192; const fctx = flashCan.getContext('2d'); fctx.fillStyle = '#fff'; fctx.textAlign = 'center'; fctx.textBaseline = 'middle'; fctx.font = '900 118px Georgia, serif'; fctx.fillText('RE-KEYED', 384, 100);
  const flashTex = new THREE.CanvasTexture(flashCan); const flashM = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xffd070, fog: false });
  const flashBox = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.45), flashM); flashBox.position.set(BX, 5.5, HZ - 0.2); flashBox.rotation.y = Math.PI; root.add(flashBox);
  const bannerGlow = new THREE.Sprite(K.glowMat(0xffc860, 0.2)); bannerGlow.scale.set(9, 3.4, 1); bannerGlow.position.set(BX, 5.5, HZ - 0.5); root.add(bannerGlow);
  const cracks = buildDoorCracks(THREE, helpers, { w: 4.9, h: 5 }); cracks.group.position.set(0, 0, -HZ + (opts.crackZ ?? 0.07)); root.add(cracks.group);
  const skins = {}, ctx = { onImpact: opts.onImpact || null }; let cur = null, flashT = 0, time = 0, curType = null;
  const room = {
    group: root, type: norm(type), solids: vaultbreakerSolids(), skins, K,
    skin(t) { t = norm(t); if (!skins[t]) { const s = BUILDERS[t](K, ctx); s.group.visible = false; root.add(s.group); skins[t] = s; } return skins[t].api; },
    anchorsOf(t) { room.skin(t); return skins[norm(t)].anchors; },
    get anchors() { return skins[curType].anchors; },
    setSkin(t, o = {}) {
      t = norm(t); room.skin(t); const was = curType; curType = t; room.type = t;
      for (const k in skins) skins[k].group.visible = k === t;
      drawBanner(bctx, 1536, 384, t); bannerTex.needsUpdate = true; pctx.clearRect(0, 0, 128, 128); pctx.fillStyle = '#17120c'; pctx.beginPath(); pctx.arc(64, 64, 62, 0, TAU); pctx.fill(); drawIcon(pctx, t, 64, 64, 62); plateTex.needsUpdate = true;
      bannerGlow.material.color.set(TYPE_GLOW[t]); if (was && was !== t && o.flash !== false) flashT = 1; return room.skin(t);
    },
    flash() { flashT = 1; },
    setBreach(v) { cracks.setBreach(v); },
    update(dt, now) { time = now ?? time + dt; if (flashT > 0) { flashT = Math.max(0, flashT - dt * 0.8); const f = flashT > 0.7 ? 1 : flashT / 0.7; flashM.opacity = f * (0.55 + 0.45 * Math.sin(time * 40)); flashBox.visible = true; bannerM.emissiveIntensity = 0.85 + f * 1.4; } else { flashM.opacity = 0; flashBox.visible = false; bannerM.emissiveIntensity = 0.85; } if (curType) skins[curType].tick(dt, time); },
    stats() { const r = []; root.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isSprite) { let vis = true, p = o; while (p) { if (!p.visible) vis = false; p = p.parent; } if (vis) r.push(o); } }); return { drawCalls: r.length }; },
    dispose() { root.traverse(o => { if (o.geometry && !K.geo.has(o.geometry)) o.geometry.dispose(); }); },
  };
  if (!opts.lazy && opts.lazy !== undefined) TYPES.forEach(t => room.skin(t));
  room.setSkin(type, { flash: false });
  return room;
}

// ----------------------------------------------------------------------------------------------------------------- vault dressing
const DOORS = { N: [0, -1, 0], E: [1, 0, -Math.PI / 2], S: [0, 1, Math.PI], W: [-1, 0, Math.PI / 2] };
/**
 * The vault's dressing (centre at the origin, 22.5 m). opts: { half = 11.25, H = 6.5, daisR = 3.35, claimR = 2.45, crown = true }
 * Returns { group, solids, anchors, setTreasury(0..1), setCoffer(i, 0..1), setDoorBar(dir, bool, instant), setBreach(dir, 0..100),
 *           setClaim(progress01, ownerColor), setContested(on), setAlarm(on), setGrate(0..1), update(dt, now) }
 */
export function buildVaultDressing(THREE, helpers, opts = {}) {
  const K = getKit(THREE, helpers), root = new THREE.Group(); root.name = 'vaultDressing';
  const half = opts.half ?? SIZE.VAULT / 2, H = opts.H ?? SIZE.H, claimR = opts.claimR ?? 2.45, anchors = {}, solids = [];
  // ---- treasury: 4 gold mounds (instanced, grown by a level) with spilled coins around the base, ingot stacks and a glow
  const heapC = ['N', 'E', 'S', 'W'].map(d => { const [wx, wz, ry] = DOORS[d], c = Math.cos(ry), s = Math.sin(ry), lx = -6.0, lz = 2.0; return { x: wx * half + lx * c + lz * s, z: wz * half - lx * s + lz * c, ry, wx, wz, lx, lz }; });
  const heapsGrp = new THREE.Group(); heapsGrp.name = 'treasury'; root.add(heapsGrp);
  const cores = new THREE.InstancedMesh(K.mound(), K.coinMat, 4); cores.frustumCulled = false; cores.instanceMatrix.setUsage(THREE.DynamicDrawUsage); heapsGrp.add(cores);
  const heap = coinHeap(K, { n: 90, count: 4, R: 2.2, Hh: 0.5, seed: 9, coinR: 0.13 });
  { const pa = heap.geometry.attributes.position, vpc = heap.userData.vpc / 4; for (let i = 0; i < pa.count; i++) { const h = Math.floor(i / vpc) % 4; pa.setX(i, pa.getX(i) + heapC[h].x); pa.setZ(i, pa.getZ(i) + heapC[h].z); } pa.needsUpdate = true; heap.geometry.computeBoundingSphere(); }
  heapsGrp.add(heap);
  const barMesh = new K.Batch(0); const bars = [];
  for (const d of ['N', 'E', 'S', 'W']) { const [wx, wz, ry] = DOORS[d], c = Math.cos(ry), s = Math.sin(ry); let n = 0; for (let row = 0; row < 4; row++) for (let k = 0; k < 4 - row; k++) { const lx = -3.9 + (k - (3 - row) / 2) * 0.52, lz = 0.55, y = 0.1 + row * 0.2; const x = wx * half + lx * c + lz * s, z = wz * half - lx * s + lz * c; bars.push({ x, y, z, ry, rank: n++ + row * 0.01 }); } }
  bars.sort((a, b) => a.rank - b.rank); bars.forEach((b, i) => barMesh.box('gold', 0.46, 0.17, 0.24, b.x, b.y, b.z, { ry: b.ry, r: 0.03, t: i % 3 ? 0xffffff : 0xffe9a0 }));
  const barGrp = barMesh.build('ingots', true); const barM = Object.values(barGrp.userData.meshes)[0]; const barVpc = barM.geometry.attributes.position.count / bars.length; heapsGrp.add(barGrp);
  const hGlow = [];
  const _hm = new THREE.Matrix4(), _hq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _hs = new THREE.Vector3(), _hy = new THREE.Vector3(0, 1, 0);
  const layHeaps = L => { heapC.forEach((h, i) => { _hq.setFromAxisAngle(_hy, h.ry + i * 1.3); _hp.set(h.x, 0, h.z); const g = 0.4 + 0.6 * L; _hs.set(1.7 * g, L > 0.01 ? 0.12 + 1.6 * L : 0.0001, 1.5 * g); _hm.compose(_hp, _hq, _hs); cores.setMatrixAt(i, _hm); }); cores.instanceMatrix.needsUpdate = true; };
  // ---- coffers K1..K4 in the corners (box 1.2 x 0.8, turned toward the dais)
  const cofs = [], sgn = [[-1, -1], [1, -1], [1, 1], [-1, 1]], cofCoins = new THREE.InstancedMesh(K.mound(), K.coinMat, 4); cofCoins.frustumCulled = false; cofCoins.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(cofCoins);
  sgn.forEach(([sx, sz], i) => {
    const x = sx * (half - 3), z = sz * (half - 3), ry = Math.atan2(-sx, -sz) + 0; const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); root.add(g); const b = new K.Batch(0);
    b.box('darkStone', 1.3, 0.16, 0.9, 0, 0.08, 0, { r: 0.03 }); b.box('wood', 1.2, 0.62, 0.8, 0, 0.47, 0, { r: 0.05, t: 0xc09a70 });
    for (const sx2 of [-0.45, 0.45]) b.box('gold', 0.1, 0.66, 0.84, sx2, 0.47, 0, { r: 0.025 }); b.box('gold', 1.22, 0.1, 0.82, 0, 0.18, 0, { r: 0.03 }); b.box('gold', 1.22, 0.08, 0.82, 0, 0.78, 0, { r: 0.03 });
    b.box('ink', 1.04, 0.04, 0.64, 0, 0.8, 0, { r: 0.01, ao: false }); rivets(b, [[-0.55, 0.47, 0.41], [0.55, 0.47, 0.41], [0, 0.55, 0.42]], 'gold', 0.04); b.sph('red', 0.05, 0, 0.58, 0.43, { ws: 8, hs: 6 });
    g.add(b.build('coffer')); const lid = new THREE.Group(); lid.position.set(0, 0.8, -0.4); lid.rotation.x = -2.0; g.add(lid); const lb = new K.Batch(0.8);
    lb.box('wood', 1.2, 0.1, 0.8, 0, 0.0, 0.4, { r: 0.04, t: 0xc09a70 }); lb.box('gold', 1.22, 0.12, 0.1, 0, 0.0, 0.8, { r: 0.02 }); for (const sx2 of [-0.45, 0.45]) lb.box('gold', 0.1, 0.12, 0.82, sx2, 0.0, 0.4, { r: 0.02 }); lid.add(lb.build('lid'));
    cofs.push({ x, z, ry: g.rotation.y, v: 0.7, vt: 0.7 });
    anchors['K' + (i + 1)] = { x, y: 0.8, z, r: 0.9 };
    for (const o of [-0.3, 0.3]) { const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y); solids.push({ id: 'K' + (i + 1), x: x + o * c, z: z - o * s, r: 0.5 }); }
  });
  // ---- door bars + racks + alarm beacons + breach cracks (one set per vault door)
  const doors = {}; const beaconLens = [];
  const alarmMat = new THREE.MeshBasicMaterial({ color: 0x3a0c0c });
  for (const d of ['N', 'E', 'S', 'W']) {
    const [wx, wz, ry] = DOORS[d], g = new THREE.Group(); g.position.set(wx * half, 0, wz * half); g.rotation.y = ry; root.add(g); const b = new K.Batch(0);
    // claws either side of the door and the storage rack to +x
    for (const sx of [-1, 1]) { b.box('darkIron', 0.34, 0.5, 0.5, sx * 2.78, 2.35, 0.25, { r: 0.04 }); b.box('darkIron', 0.12, 0.6, 0.3, sx * 2.78, 2.35, 0.55, { r: 0.03 }); }
    b.box('darkWood', 5.2, 0.16, 0.36, 5.7, 2.0, 0.18, { r: 0.04 }); b.box('darkWood', 5.2, 0.14, 0.36, 5.7, 2.75, 0.18, { r: 0.04 }); for (const x of [3.4, 5.7, 8.0]) b.box('darkIron', 0.14, 1.1, 0.4, x, 2.38, 0.2, { r: 0.03 });
    rivets(b, [[3.4, 2.0, 0.4], [8.0, 2.0, 0.4], [3.4, 2.75, 0.4], [8.0, 2.75, 0.4]]);
    // beacon housing above the door
    b.box('darkIron', 0.7, 0.3, 0.4, 0, H - 0.5, 0.2, { r: 0.05 }); b.box('brass', 0.6, 0.05, 0.4, 0, H - 0.68, 0.2, { r: 0.015 }); g.add(b.build('door-' + d));
    const lens = new THREE.Mesh(K.g('lens', () => new THREE.SphereGeometry(0.2, 12, 10)), alarmMat); lens.position.set(0, H - 0.5, 0.45); g.add(lens);
    const fan = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshBasicMaterial({ map: K.tex.glow, color: 0xff2a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); fan.position.set(0, H - 0.5, 0.45); fan.rotation.x = Math.PI / 2; g.add(fan);
    // the bar: timber with iron end caps and bands
    const barG = new THREE.Group(); g.add(barG); const bb = new K.Batch(2.35);
    bb.box('wood', 5.6, 0.34, 0.34, 0, 0, 0, { r: 0.06, t: 0xd0b090 }); for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) bb.box('darkIron', 0.14, 0.4, 0.4, x, 0, 0, { r: 0.03 }); for (const sx of [-1, 1]) bb.box('iron', 0.26, 0.42, 0.42, sx * 2.8, 0, 0, { r: 0.05 });
    bb.cyl('darkIron', 0.05, 0.05, 0.3, 0, 0.25, 0, { seg: 6 }); barG.add(bb.build('bar', true));
    const crk = buildDoorCracks(THREE, helpers, { w: 4.9, h: 5 }); crk.group.position.set(0, 0, opts.crackZ ?? 0.07); g.add(crk.group);
    // hand wheel on the rack (the 5 s channel prop)
    const wh = new K.Batch(0); wh.tor('brass', 0.3, 0.04, 5.7, 1.3, 0.3, { rs: 5, ts: 20 }); for (let k = 0; k < 4; k++) wh.box('brass', 0.6, 0.05, 0.05, 5.7, 1.3, 0.3, { rz: k * Math.PI / 4, r: 0.01 }); wh.cyl('darkIron', 0.08, 0.08, 0.2, 5.7, 1.3, 0.2, { rx: Math.PI / 2, seg: 8 }); wh.box('darkWood', 0.14, 1.0, 0.1, 5.7, 1.55, 0.06, { r: 0.02 }); g.add(wh.build('wheel-' + d));
    doors[d] = { g, barG, x: 5.7, xt: 5.7, y: 2.35, z: 0.18, barred: false, crk, lens, fan, t: 1 };
    barG.position.set(5.7, 2.35, 0.18); anchors['D_' + d] = { x: wx * half + (5.7 * Math.cos(ry)) + 0.4 * Math.sin(ry), y: 1.3, z: wz * half - 5.7 * Math.sin(ry) + 0.4 * Math.cos(ry), r: 0.8 };
  }
  // ---- crown dais: claim ring (instanced tiles), a floating crown, a rune ring
  const N_TILES = 72, tileG = new THREE.PlaneGeometry(0.2, 0.13), claimMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 });
  const tiles = new THREE.InstancedMesh(tileG, claimMat, N_TILES), tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tp = new THREE.Vector3(), ts = new THREE.Vector3(1, 1, 1), tc = new THREE.Color();
  for (let i = 0; i < N_TILES; i++) { const a = i / N_TILES * TAU; tq.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -a - Math.PI / 2, 'YXZ')); tp.set(Math.cos(a) * claimR, 0.175, Math.sin(a) * claimR); tm.compose(tp, tq, ts); tiles.setMatrixAt(i, tm); tiles.setColorAt(i, tc.set(0x2a2214)); }
  tiles.instanceColor.needsUpdate = true; root.add(tiles);
  const crownG = new THREE.Group(); crownG.position.set(0, 2.5, 0); crownG.scale.setScalar(0.75); root.add(crownG); const cb = new K.Batch(1.8);
  cb.lathe('gold', [[0.42, 0], [0.44, 0.05], [0.46, 0.2], [0.46, 0.26], [0.42, 0.26], [0.4, 0.2], [0.4, 0.05]], 0, 0, 0, { seg: 20 });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; cb.cone('gold', 0.1, 0.34, Math.cos(a) * 0.43, 0.42, Math.sin(a) * 0.43, { seg: 6 }); cb.sph('red', 0.045, Math.cos(a) * 0.43, 0.62, Math.sin(a) * 0.43, { ws: 8, hs: 6 }); cb.sph('gold', 0.04, Math.cos(a + 0.52) * 0.45, 0.14, Math.sin(a + 0.52) * 0.45, { ws: 6, hs: 5 }); }
  cb.sph('red', 0.06, 0, 0.15, 0.46, { ws: 8, hs: 6 }); crownG.add(cb.build('crown', true));
  const crownGlow = new THREE.Sprite(K.glowMat(0xffc040, 0.3)); crownGlow.scale.set(2.4, 2.4, 1); crownGlow.position.set(0, 2.7, 0); root.add(crownGlow);
  crownG.visible = opts.crown !== false;
  // ---- the warden grate
  const gx = 0, gz = half - 4.0, gb = new K.Batch(0);
  gb.box('darkStone', 2.8, 0.1, 2.8, gx, 0.02, gz, { r: 0.03 }); gb.box('ink', 2.3, 0.06, 2.3, gx, 0.06, gz, { r: 0.01, ao: false }); for (const sx of [-1, 1]) { gb.box('darkIron', 0.14, 0.12, 2.5, gx + sx * 1.2, 0.1, gz, { r: 0.02 }); gb.box('darkIron', 2.5, 0.12, 0.14, gx, 0.1, gz + sx * 1.2, { r: 0.02 }); }
  rivets(gb, [[-1.2, 0.17, -1.2], [1.2, 0.17, -1.2], [-1.2, 0.17, 1.2], [1.2, 0.17, 1.2]].map(p => [gx + p[0], p[1], gz + p[2]]), 'brass', 0.05); root.add(gb.build('grate-frame'));
  const gGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), new THREE.MeshBasicMaterial({ map: K.tex.glow, color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false })); gGlow.rotation.x = -Math.PI / 2; gGlow.position.set(gx, 0.09, gz); root.add(gGlow);
  const lidG = new THREE.Group(); lidG.position.set(gx, 0.14, gz); root.add(lidG); const glb = new K.Batch(0.14); glb.box('darkIron', 2.3, 0.1, 2.3, 0, 0, 0, { r: 0.03 }); for (let k = 0; k < 7; k++) glb.box('iron', 0.1, 0.12, 2.1, -1.0 + k * 0.33, 0.02, 0, { r: 0.015 }); for (let k = 0; k < 3; k++) glb.box('iron', 2.2, 0.1, 0.1, 0, 0.02, -0.75 + k * 0.75, { r: 0.015 }); lidG.add(glb.build('grate-lid', true));
  anchors.dais = { x: 0, y: 0, z: 0, r: 2.2 }; anchors.grate = { x: gx, y: 0, z: gz, r: 1.4 };

  // ---- state
  let treasury = 0, tShown = 0, claim = 0, claimShown = 0, claimColor = new THREE.Color(0xffc933), contested = false, alarm = false, grate = 0, grateT = 0, crownK = 0;
  const placeBar = d => { d.barG.position.set(d.x, 2.35, 0.18 + 0.28 * (1 - clamp(d.x / 5.7, 0, 1))); };
  const api = {
    group: root, solids, anchors, K,
    /** 0..1: the heaps grow coin by coin, ingot stacks appear, the glow rises */
    setTreasury(v) { treasury = clamp(v, 0, 1); },
    /** coffer i (0..3 = K1..K4) fill 0..1 (the plan's 3 handfuls) */
    setCoffer(i, v) { if (cofs[i]) cofs[i].vt = clamp(v, 0, 1); },
    /** dir 'N'|'E'|'S'|'W': bar across the door (true) or racked (false). instant skips the slide */
    setDoorBar(dir, barred, instant = false) { const d = doors[dir]; if (!d) return; d.barred = !!barred; d.xt = barred ? 0 : 5.7; if (instant) { d.x = d.xt; placeBar(d); } },
    isBarred(dir) { return !!(doors[dir] && doors[dir].barred); },
    /** breach 0..100 of a vault door as seen from inside (3 stages) */
    setBreach(dir, v) { if (doors[dir]) doors[dir].crk.setBreach(v); },
    /** progress 0..1 of the leading claim, in the owner's colour (number or CSS colour); the ring fills clockwise */
    setClaim(p, color) { claim = clamp(p, 0, 1); if (color !== undefined) claimColor.set(color); },
    /** more than one goblin on the dais: the ring flickers white */
    setContested(on) { contested = !!on; },
    /** the crown alarm: red beacons above the 4 doors */
    setAlarm(on) { alarm = !!on; if (!alarm) alarmMat.color.setHex(0x3a0c0c); },
    /** warden grate open 0..1 (the lid slides and the underglow lights) */
    setGrate(v) { grateT = clamp(v, 0, 1); },
    update(dt, t) {
      tShown = approach(tShown, treasury, 2.5, dt); layHeaps(tShown); heap.geometry.setDrawRange(0, Math.floor(tShown * 90) * heap.userData.vpc); barM.geometry.setDrawRange(0, Math.floor(clamp((tShown - 0.25) / 0.75, 0, 1) * bars.length) * barVpc);
      hGlow.forEach(s => { s.material.opacity = 0.05 + tShown * 0.3; });
      cofs.forEach((c, i) => { c.v = approach(c.v, c.vt, 3, dt); _hq.setFromAxisAngle(_hy, c.ry); _hp.set(c.x, 0.76, c.z); _hs.set(0.44 * (0.55 + 0.45 * c.v), c.v > 0.01 ? 0.04 + 0.32 * c.v : 0.0001, 0.3 * (0.55 + 0.45 * c.v)); _hm.compose(_hp, _hq, _hs); cofCoins.setMatrixAt(i, _hm); }); cofCoins.instanceMatrix.needsUpdate = true;
      for (const k in doors) { const d = doors[k]; if (Math.abs(d.x - d.xt) > 0.001) { d.x = approach(d.x, d.xt, 4, dt); if (Math.abs(d.x - d.xt) < 0.003) d.x = d.xt; placeBar(d); } d.fan.visible = alarm; d.fan.material.opacity = alarm ? (0.4 + 0.3 * Math.sin(t * 9)) * 0.9 : 0; d.fan.rotation.z = t * 3; }
      if (alarm) alarmMat.color.setHex(Math.sin(t * 9) > 0 ? 0xff2a1a : 0x5a0c0c);
      claimShown = approach(claimShown, claim, 6, dt); const lit = Math.round(claimShown * N_TILES);
      for (let i = 0; i < N_TILES; i++) { const on = i < lit; let c = on ? tc.copy(claimColor) : tc.setHex(0x2a2214); if (on) { const head = i === lit - 1; c.multiplyScalar(head ? 1.5 : 0.9 + 0.1 * Math.sin(t * 4 + i * 0.3)); } else if (claim > 0 && i === lit) c.copy(claimColor).multiplyScalar(0.3); if (contested) c.lerp(tc.setHex(0xffffff), 0.5 * (0.5 + 0.5 * Math.sin(t * 12 + i))); tiles.setColorAt(i, c); }
      tiles.instanceColor.needsUpdate = true;
      crownK = approach(crownK, claim > 0 ? 1 : 0, 2, dt); crownG.rotation.y = t * 0.6; crownG.position.y = 2.5 + Math.sin(t * 1.3) * 0.08; crownGlow.position.y = crownG.position.y + 0.2; crownGlow.material.color.copy(claimColor).lerp(tc.setHex(0xffc040), 1 - crownK); crownGlow.material.opacity = 0.18 + crownK * 0.3;
      grate = approach(grate, grateT, 3, dt); lidG.position.x = gx + grate * 2.5; lidG.visible = grate < 0.98; gGlow.material.opacity = grate * (0.55 + 0.15 * Math.sin(t * 5));
    },
  };
  K.mergeStatics(root);
  Object.keys(doors).forEach(d => api.setDoorBar(d, false, true));
  return api;
}

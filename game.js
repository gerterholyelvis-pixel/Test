// Goblin King client. Needs a global THREE (r158+). Set window.GK_OFFLINE = true to run with simulated players.
(() => {
const THREE = window.THREE;
const NAMES = ['Small Goblin', 'Goblin', 'Big Goblin', 'Goblin Wizard', 'GOBLIN KING'];
const SCALE = [0.75, 1, 1.3, 1.1, 1.2];
const R = 12, H = 6.5, T = 0.6;           // room size, ceiling height, wall thickness
const DW = 4, DHT = 4.4, VW = 4.9, VH = 5; // secure door and vault door openings
const RAD = 0.45;                          // player radius
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rc = i => [((i % 3) - 1) * R, (Math.floor(i / 3) - 1) * R];
const roomAt = (x, z) => clamp(Math.round(x / R), -1, 1) + 1 + (clamp(Math.round(z / R), -1, 1) + 1) * 3;
const $ = id => document.getElementById(id);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0e);
const cam = new THREE.PerspectiveCamera(75, 1, 0.05, 140);
cam.rotation.order = 'YXZ';

// ---------- procedural textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, n, size, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${Math.random() * a})` : `rgba(0,0,0,${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * size, 1 + Math.random() * size);
  }
}
const plasterTex = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#f0efea'; g.fillRect(0, 0, w, h); speckle(g, w, h, 5000, 10, 0.05); });
const bumpTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#808080'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, 6, 0.5); }, false);
const floorTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, w, h);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .05})`; g.fillRect(tx * 256, ty * 256, 256, 256); }
  speckle(g, w, h, 1800, 5, 0.06);
  g.fillStyle = '#bdbdb8'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h); g.fillRect(0, 254, w, 4); g.fillRect(254, 0, 4, h);
  g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(0, 4, w, 2); g.fillRect(4, 0, 2, h);
});
const steelTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#9ca4ae'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .05})`; g.fillRect(0, Math.random() * h, w, 1); }
  speckle(g, w, h, 1500, 2, 0.06);
});
const hazardTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#f2b705'; g.fillRect(0, 0, w, h); g.fillStyle = '#16161a';
  for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 128, 128); g.lineTo(i * 32 + 128, 128); g.fill(); }
});
const aoTex = canvasTex(128, 128, (g, w, h) => {
  for (const [ax, ay, bx2, by2] of [[0, 0, .3, 0], [1, 0, .7, 0], [0, 0, 0, .3], [0, 1, 0, .7]]) {
    const r = g.createLinearGradient(ax * w, ay * h, bx2 * w, by2 * h);
    r.addColorStop(0, 'rgba(0,0,0,.34)'); r.addColorStop(0.5, 'rgba(0,0,0,.08)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }
});
aoTex.wrapS = aoTex.wrapT = THREE.ClampToEdgeWrapping;
const cornerTex = canvasTex(64, 8, (g, w, h) => {
  const r = g.createLinearGradient(0, 0, w, 0);
  r.addColorStop(0, 'rgba(0,0,0,.30)'); r.addColorStop(0.45, 'rgba(0,0,0,.08)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
cornerTex.wrapS = cornerTex.wrapT = THREE.ClampToEdgeWrapping;
const glowTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
function textTex(text, color, bg, w = 512, h = 128, font = 'bold 64px system-ui') {
  return canvasTex(w, h, g => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 4);
  });
}

// environment reflections (a small bright studio) so metal and gloss floors have something to reflect
{
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(30, 12, 30), new THREE.MeshBasicMaterial({ color: 0xc8c8d0, side: THREE.BackSide })));
  const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 7, 7) });
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 2), lamp); m.position.set(x, 5.8, z); es.add(m); }
  scene.environment = pm.fromScene(es, 0.03).texture;
}

// ---------- materials ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, envMapIntensity: 0.5, ...o });
const plaster = M(0xffffff, { map: plasterTex, bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.92, envMapIntensity: 0.3 });
const floorM = M(0xffffff, { map: floorTex, roughness: 0.2, envMapIntensity: 0.9 });
const ceilM = M(0xf4f4f1, { map: plasterTex, roughness: 0.95, emissive: 0xdedad2, emissiveIntensity: 0.55 });
const trimM = M(0xfafafa, { roughness: 0.45 });
const steelM = M(0xa9b6c6, { map: steelTex, metalness: 0.85, roughness: 0.42, envMapIntensity: 1 });
const vaultM = M(0x70787f, { map: steelTex, metalness: 0.9, roughness: 0.38, envMapIntensity: 1.1 });
const darkSteel = M(0x2a2e35, { metalness: 0.8, roughness: 0.45, envMapIntensity: 0.9 });
const hazardM = M(0xffffff, { map: hazardTex, roughness: 0.6 });
const glassM = new THREE.MeshStandardMaterial({ color: 0x07131c, roughness: 0.05, metalness: 0.2, emissive: 0x0b3a55, emissiveIntensity: 0.8 });
const panelM = new THREE.MeshBasicMaterial({ color: 0xfff6e6, toneMapped: false });
const aoM = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide, fog: false });
const cornerM = new THREE.MeshBasicMaterial({ map: cornerTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide });

function scaleUV(g, w, h, d, tile) {
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
}
function bx(parent, w, h, d, x, y, z, mat, tile = 4) {
  const g = new THREE.BoxGeometry(w, h, d); scaleUV(g, w, h, d, tile);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); parent.add(m); return m;
}
const CYL = new THREE.CylinderGeometry(1, 1, 1, 20);
function cyl(parent, r, len, mat, x, y, z, axis = 'y') {
  const m = new THREE.Mesh(CYL, mat); m.scale.set(r, len, r); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; if (axis === 'z') m.rotation.x = Math.PI / 2;
  parent.add(m); return m;
}

// ---------- world: 9 white rooms, doors between all neighbours ----------
const rects = [];          // solid wall boxes for collision
const doors = [];
const ceilings = [];
const statusMats = [];
function addRect(px, pz, rot, lx0, lx1, lz0, lz1) {
  if (rot === 0) rects.push({ x0: px + lx0, x1: px + lx1, z0: pz + lz0, z1: pz + lz1 });
  else rects.push({ x0: px + lz0, x1: px + lz1, z0: pz - lx1, z1: pz - lx0 });
}
function keypad(g, x, big) {
  for (const s of [-1, 1]) {
    const z = s * (T / 2 + 0.04), p = new THREE.Group(); p.position.set(x, 1.35, z); p.scale.setScalar(big ? 1.3 : 1); g.add(p);
    bx(p, 0.36, 0.55, 0.07, 0, 0, 0, darkSteel);
    bx(p, 0.26, 0.12, 0.02, 0, 0.17, s * 0.04, new THREE.MeshStandardMaterial({ color: 0x103020, emissive: big ? 0xff2a1a : 0x18ff70, emissiveIntensity: 1.4 }));
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) bx(p, 0.06, 0.06, 0.02, (c - 1) * 0.09, 0.02 - r * 0.09, s * 0.04, new THREE.MeshStandardMaterial({ color: 0x222, emissive: 0x7aa7ff, emissiveIntensity: 0.6 }));
  }
}
function sign(g, text, y, color, bg) {
  const t = textTex(text, color, bg, 512, 96, 'bold 58px system-ui');
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshBasicMaterial({ map: t }));
    m.position.set(0, y, s * (T / 2 + 0.17)); if (s < 0) m.rotation.y = Math.PI; g.add(m);
  }
}
function wall(px, pz, rot, kind) {
  const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = rot; scene.add(g);
  const L = R + T, dw = kind === 'vault' ? VW : DW, dh = kind === 'vault' ? VH : DHT;
  const solid = (x0, x1, y0, y1) => bx(g, x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, 0, plaster);
  const base = (x0, x1) => bx(g, x1 - x0, 0.2, T + 0.1, (x0 + x1) / 2, 0.1, 0, trimM);
  if (!kind) { solid(-L / 2, L / 2, 0, H); base(-L / 2, L / 2); addRect(px, pz, rot, -L / 2, L / 2, -T / 2, T / 2); return; }
  solid(-L / 2, -dw / 2, 0, H); solid(dw / 2, L / 2, 0, H); solid(-dw / 2, dw / 2, dh, H);
  base(-L / 2, -dw / 2 - 0.3); base(dw / 2 + 0.3, L / 2);
  addRect(px, pz, rot, -L / 2, -dw / 2, -T / 2, T / 2); addRect(px, pz, rot, dw / 2, L / 2, -T / 2, T / 2);
  const light = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 2 }); statusMats.push(light);
  const d = { kind, p: 0, gx: px, gz: pz, light, leaf: new THREE.Group(), wheels: [], bolts: [], blocker: null };
  d.blocker = { door: d }; addRect(px, pz, rot, -dw / 2, dw / 2, -T / 2, T / 2); Object.assign(d.blocker, rects.pop());
  rects.push(d.blocker);

  if (kind === 'secure') {
    for (const s of [-1, 1]) bx(g, 0.26, dh, T + 0.24, s * (dw / 2 + 0.13), dh / 2, 0, darkSteel);
    bx(g, dw + 0.5, 0.3, T + 0.24, 0, dh - 0.15, 0, darkSteel);
    g.add(d.leaf);
    const lw = dw - 0.04, lh = dh - 0.32;
    bx(d.leaf, lw, lh, 0.24, 0, lh / 2, 0, steelM, 2);
    for (const s of [-1, 1]) {
      for (const y of [0.7, 1.9, 3.1]) bx(d.leaf, lw - 0.35, 0.14, 0.05, 0, y, s * 0.14, darkSteel, 1);
      cyl(d.leaf, 0.035, 0.9, darkSteel, -lw / 2 + 0.35, 1.9, s * 0.2);          // pull bar
      for (let i = 0; i < 12; i++) for (const yy of [0.12, lh - 0.12]) cyl(d.leaf, 0.03, 0.04, darkSteel, -lw / 2 + 0.2 + i * (lw - 0.4) / 11, yy, s * 0.125, 'z');
    }
    bx(d.leaf, 0.9, 0.34, 0.3, 0.3, lh * 0.66, 0, glassM);                         // reinforced window
    for (let i = 0; i < 3; i++) cyl(d.leaf, 0.055, 0.5, darkSteel, lw / 2 - 0.1, 0.8 + i * 1.3, 0, 'x'); // deadbolts
    keypad(g, dw / 2 + 0.55, false);
    sign(g, 'SECURE', dh + 0.62, '#f1f1f1', '#23262c');
    for (const s of [-1, 1]) bx(g, 0.5, 0.12, 0.05, 0, dh + 0.2, s * (T / 2 + 0.14), light);
  } else {
    for (const s of [-1, 1]) {
      bx(g, 0.5, dh + 0.1, T + 0.34, s * (dw / 2 + 0.25), (dh + 0.1) / 2, 0, darkSteel);
      for (const z of [-1, 1]) bx(g, 0.4, dh, 0.03, s * (dw / 2 + 0.25), dh / 2, z * (T / 2 + 0.18), hazardM, 1.2);
    }
    bx(g, dw + 1, 0.5, T + 0.34, 0, dh - 0.05, 0, darkSteel);
    for (const z of [-1, 1]) bx(g, dw + 0.9, 0.34, 0.03, 0, dh - 0.05, z * (T / 2 + 0.18), hazardM, 1.2);
    for (let i = 0; i < 3; i++) cyl(g, 0.12, 0.5, darkSteel, -dw / 2 - 0.05, 0.8 + i * 1.8, 0);   // hinges
    // swing away from the middle room: find which local side faces the centre
    d.sgn = (Math.sin(rot) * -px + Math.cos(rot) * -pz) > 0 ? -1 : 1;
    const sw = { openOnly: d }; addRect(px, pz, rot, -dw / 2 - 0.3, -dw / 2 + 0.3, d.sgn > 0 ? 0.3 : -4.9, d.sgn > 0 ? 4.9 : -0.3); Object.assign(sw, rects.pop()); rects.push(sw);
    const hinge = new THREE.Group(); hinge.position.set(-dw / 2, 0, 0); g.add(hinge); hinge.add(d.leaf); d.leaf = hinge;
    const slab = new THREE.Group(); slab.position.x = dw / 2; hinge.add(slab);
    const lh = dh - 0.4;
    bx(slab, dw - 0.06, lh, 0.5, 0, lh / 2, 0, vaultM, 2);
    for (const s of [-1, 1]) {
      const z = s * 0.26;
      cyl(slab, 1.25, 0.12, vaultM, 0, lh / 2, z, 'z');
      cyl(slab, 1.0, 0.06, darkSteel, 0, lh / 2, s * 0.33, 'z');
      const wheel = new THREE.Group(); wheel.position.set(0, lh / 2, s * 0.42); slab.add(wheel); d.wheels.push(wheel);
      const tor = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.075, 12, 40), steelM); wheel.add(tor);
      for (let k = 0; k < 4; k++) { const sp = bx(wheel, 0.1, 1.56, 0.1, 0, 0, 0, steelM, 1); sp.rotation.z = k * Math.PI / 4; }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), steelM); hub.scale.z = 0.7; wheel.add(hub);
      for (const y of [0.35, lh - 0.35]) bx(slab, dw - 0.5, 0.36, 0.04, 0, y, z, hazardM, 1.2);
      for (let k = 0; k < 5; k++) for (const sx of [-1, 1]) {
        const b = cyl(slab, 0.09, 0.7, darkSteel, sx * (dw / 2 - 0.2), 0.9 + k * 0.85, z * 0.2, 'x'); b.userData = { sx, x0: sx * (dw / 2 - 0.2) }; d.bolts.push(b);
      }
    }
    keypad(g, dw / 2 + 0.75, true);
    sign(g, 'RESTRICTED', dh + 0.65, '#ff4a3a', '#1a1214');
    for (const s of [-1, 1]) { bx(g, 0.5, 0.14, 0.05, 0, dh + 0.25, s * (T / 2 + 0.2), light); }
  }
  doors.push(d);
}
// rooms
for (let i = 0; i < 9; i++) {
  const [cx, cz] = rc(i);
  bx(scene, R, 0.4, R, cx, -0.2, cz, floorM, 2);
  ceilings.push(bx(scene, R, 0.3, R, cx, H + 0.15, cz, ceilM));
  for (const [ox, oz] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]]) {
    bx(scene, 3, 0.05, 1.4, cx + ox, H - 0.03, cz + oz, panelM);
    bx(scene, 3.24, 0.04, 1.64, cx + ox, H - 0.015, cz + oz, trimM);
  }
  // fake ambient occlusion: darkened floor/ceiling edges and wall corners
  const hf = R / 2 - T / 2;
  const fa = new THREE.Mesh(new THREE.PlaneGeometry(2 * hf, 2 * hf), aoM); fa.rotation.x = -Math.PI / 2; fa.position.set(cx, 0.004, cz); scene.add(fa);
  const ca = new THREE.Mesh(new THREE.PlaneGeometry(2 * hf, 2 * hf), aoM); ca.rotation.x = Math.PI / 2; ca.position.set(cx, H - 0.004, cz); scene.add(ca); ceilings.push(ca);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const ax of [0, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, H), cornerM);
    if (ax) { m.rotation.y = Math.PI / 2; m.position.set(cx + sx * (hf - 0.004), H / 2, cz + sz * (hf - 0.85)); }
    else { m.position.set(cx + sx * (hf - 0.85), H / 2, cz + sz * (hf - 0.004)); }
    m.updateMatrix(); const e = new THREE.Vector3(-0.85, 0, 0).applyMatrix4(m.matrix);
    if (Math.hypot(e.x - (cx + sx * hf), e.z - (cz + sz * hf)) > 0.3) m.scale.x = -1;
    scene.add(m);
  }
  const lamp = new THREE.PointLight(i === 4 ? 0xfff0e0 : 0xfff6ea, 9, 0, 1.2); lamp.position.set(cx, H - 0.7, cz); scene.add(lamp);
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xeeebe4, 2.1));
for (let i = 0; i < 9; i++) {
  const [cx, cz] = rc(i), col = i % 3, row = Math.floor(i / 3);
  // east neighbour and south neighbour, or an outer wall on the edge
  wall(cx + R / 2, cz, Math.PI / 2, col < 2 ? (i === 4 || i + 1 === 4 ? 'vault' : 'secure') : null);
  wall(cx, cz + R / 2, 0, row < 2 ? (i === 4 || i + 3 === 4 ? 'vault' : 'secure') : null);
  if (col === 0) wall(cx - R / 2, cz, Math.PI / 2, null);
  if (row === 0) wall(cx, cz - R / 2, 0, null);
}
// static world never moves: freeze matrices so the per-frame scene graph update skips them
scene.updateMatrixWorld(true);
{
  const dyn = new Set(); doors.forEach(d => d.leaf.traverse(o => dyn.add(o)));
  scene.traverse(o => { if (o !== scene && !dyn.has(o) && !o.isLight) { o.matrixAutoUpdate = false; } });
}

// ---------- goblins ----------
const SPH = new THREE.SphereGeometry(1, 24, 16), CONE = new THREE.ConeGeometry(1, 1, 10), CAP = new THREE.CapsuleGeometry(1, 1, 6, 12);
function part(parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m; }
const cone = (p, mat, x, y, z, r, h, rx = 0, rz = 0) => { const m = part(p, CONE, mat, x, y, z, r, h, r); m.rotation.set(rx, 0, rz); return m; };
const limb = (p, mat, r, len, x, y, z) => part(p, CAP, mat, x, y, z, r, len / 2, r); // capsule: radius r, total height len+2r handled by caller
function glow(parent, color, size, x, y, z, op = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op }));
  s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s;
}
const CFG = [
  { skin: 0x86c050, cloth: 0x6a4a30, b: 0.85 }, { skin: 0x6dbb44, cloth: 0x7a5a34, b: 1 }, { skin: 0x3f8a36, cloth: 0x4a3a30, b: 1.22 },
  { skin: 0x4cb8a6, cloth: 0x5a2bb8, b: 0.95 }, { skin: 0xa9cc34, cloth: 0xb3122b, b: 1.05 },
];
// GKKIT-BEGIN (shared helpers for the wizard and the king; cached)
function goblinKit() {
  if (goblinKit.c) return goblinKit.c;
  const K = goblinKit.c = {};
  K.fold = (geo, n, k, ylo, yhi) => { // radial pleats that grow towards ylo
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z), f = Math.min(1, Math.max(0, (yhi - y) / (yhi - ylo)));
      const s = 1 + k * f * Math.sin(a * n + y * 2.2); p.setX(i, x * s); p.setZ(i, z * s);
    }
    geo.computeVertexNormals(); return geo;
  };
  K.star = (R, r, depth) => {
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? r : R; if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false }); g.translate(0, 0, -depth / 2); return g;
  };
  K.robeTex = canvasTex(512, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#24106a'); bg.addColorStop(0.7, '#3d1f98'); bg.addColorStop(1, '#5a33c4'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 150; i++) { const x = Math.random() * w, y = Math.random() * (h - 70), s = 1.5 + Math.random() * 4; g.fillStyle = Math.random() < 0.5 ? '#fff4c0' : '#cfe8ff'; g.fillRect(x - s / 2, y - 0.5, s, 1.4); g.fillRect(x - 0.5, y - s / 2, 1.4, s); }
    for (let i = 0; i < 5; i++) { const x = 40 + i * 100 + Math.random() * 30, y = 60 + Math.random() * 300, r = 14 + Math.random() * 8; g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); g.fillStyle = '#35198a'; g.beginPath(); g.arc(x + r * 0.45, y - r * 0.2, r * 0.9, 0, 6.283); g.fill(); }
    const gb = g.createLinearGradient(0, h - 60, 0, h); gb.addColorStop(0, '#ffe27a'); gb.addColorStop(1, '#b8861c'); g.fillStyle = gb; g.fillRect(0, h - 60, w, 60);
    g.fillStyle = '#3a1590'; for (let i = 0; i < 24; i++) { const x = i * 21.3 + 10; g.beginPath(); g.moveTo(x, h - 52); g.lineTo(x + 8, h - 30); g.lineTo(x, h - 8); g.lineTo(x - 8, h - 30); g.fill(); }
    g.fillStyle = '#fff1b0'; g.fillRect(0, h - 64, w, 4);
  });
  K.kingTex = canvasTex(512, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#b3122b'); bg.addColorStop(1, '#8a0c20'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,200,80,.1)'; g.lineWidth = 2;
    for (let i = -16; i < 32; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 32 + h, 0); g.lineTo(i * 32, h); g.stroke(); }
    g.fillStyle = 'rgba(255,205,90,.35)'; for (let x = 0; x < 16; x++) for (let y = 0; y < 14; y++) { g.beginPath(); g.arc(x * 32 + 16, y * 32 + 16 + (x % 2 ? 16 : 0) - 16, 3, 0, 6.283); g.fill(); }
    const gb = g.createLinearGradient(0, h - 64, 0, h); gb.addColorStop(0, '#ffe27a'); gb.addColorStop(1, '#b8861c'); g.fillStyle = gb; g.fillRect(0, h - 64, w, 64);
    g.fillStyle = '#7a0a1c'; for (let i = 0; i < 16; i++) { const x = i * 32 + 16; g.beginPath(); g.moveTo(x, h - 56); g.lineTo(x + 9, h - 32); g.lineTo(x, h - 8); g.lineTo(x - 9, h - 32); g.fill(); }
  });
  K.furTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h); speckle(g, w, h, 900, 3, 0.1);
    g.fillStyle = '#15110f'; for (let i = 0; i < 16; i++) { const x = (i % 4) * 64 + 20 + (Math.floor(i / 4) % 2) * 28, y = Math.floor(i / 4) * 64 + 14; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 5, y + 24); g.lineTo(x + 5, y + 24); g.fill(); g.beginPath(); g.arc(x, y + 3, 3, 0, 6.283); g.fill(); }
  });
  K.capeTex = canvasTex(512, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#c0152e'); bg.addColorStop(1, '#7c0a1c'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,200,80,.16)'; g.lineWidth = 2; for (let i = -16; i < 32; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 32 + h, 0); g.lineTo(i * 32, h); g.stroke(); }
    g.fillStyle = '#f6f2e8'; g.fillRect(0, h - 104, w, 104); g.fillStyle = '#15110f';
    for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) { const x = i * 58 + 14 + (r ? 29 : 0), y = h - 98 + r * 44; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 28); g.lineTo(x + 6, y + 28); g.fill(); g.beginPath(); g.arc(x, y + 3, 3.5, 0, 6.283); g.fill(); }
    g.strokeStyle = '#ffd24a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); g.lineWidth = 3; g.strokeRect(22, 22, w - 44, h - 44); g.fillStyle = '#ffd24a'; g.fillRect(0, h - 110, w, 8);
    const em = g.createRadialGradient(256, 230, 10, 256, 230, 110); em.addColorStop(0, '#fff0a0'); em.addColorStop(1, '#d99a1a'); g.fillStyle = em; g.beginPath(); g.arc(256, 230, 100, 0, 6.283); g.fill();
    g.fillStyle = '#8a0c20'; g.beginPath(); g.moveTo(205, 270); g.lineTo(200, 195); g.lineTo(228, 225); g.lineTo(256, 180); g.lineTo(284, 225); g.lineTo(312, 195); g.lineTo(307, 270); g.fill();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 6; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; g.beginPath(); g.moveTo(256 + Math.cos(a) * 112, 230 + Math.sin(a) * 112); g.lineTo(256 + Math.cos(a) * 142, 230 + Math.sin(a) * 142); g.stroke(); }
  });
  K.glyphs = []; for (let i = 0; i < 6; i++) K.glyphs.push(canvasTex(64, 64, (g) => {
    g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 8; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(32, 12); g.lineTo(32, 52); for (let k = 0; k < 3; k++) { const y = 16 + Math.random() * 28, d = Math.random() < 0.5 ? -1 : 1; g.moveTo(32, y); g.lineTo(32 + d * (9 + Math.random() * 10), y + (Math.random() - 0.3) * 16); } g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(32, 32, 27, 0, 6.283); g.stroke();
  }));
  K.circle = (c1, c2, sun) => canvasTex(512, 512, (g) => {
    g.translate(256, 256); g.strokeStyle = c1; g.fillStyle = c1; g.shadowColor = c1; g.shadowBlur = 12; g.lineWidth = 5;
    for (const r of [244, 230, sun ? 120 : 150, 62]) { g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.stroke(); }
    g.lineWidth = 3;
    if (sun) { for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * 6.283); g.beginPath(); g.moveTo(-14, 128); g.lineTo(0, 224); g.lineTo(14, 128); g.closePath(); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; g.stroke(); g.restore(); } }
    else { for (let t = 0; t < 2; t++) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = t * Math.PI / 3 + i * 2.094 - Math.PI / 2; g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); } g.closePath(); g.stroke(); }
      g.strokeStyle = c2; g.shadowColor = c2; for (let i = 0; i < 24; i++) { g.save(); g.rotate(i / 24 * 6.283); g.beginPath(); g.moveTo(0, 168); g.lineTo(0, 218); g.moveTo(0, 190); g.lineTo(i % 2 ? 10 : -10, 202 + (i % 3) * 4); g.stroke(); g.restore(); } }
  });
  K.rays = canvasTex(256, 256, (g) => {
    g.translate(128, 128);
    for (let i = 0; i < 14; i++) { g.save(); g.rotate(i / 14 * 6.283 + 0.1 * (i % 2)); const gr = g.createLinearGradient(0, 0, 0, -128); gr.addColorStop(0, 'rgba(255,225,130,.8)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; const w = i % 2 ? 0.05 : 0.08; g.beginPath(); g.moveTo(0, 0); g.lineTo(-128 * w * 1.6, -128); g.lineTo(128 * w * 1.6, -128); g.fill(); g.restore(); }
    const r = g.createRadialGradient(0, 0, 0, 0, 0, 90); r.addColorStop(0, 'rgba(255,240,180,.7)'); r.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = r; g.beginPath(); g.arc(0, 0, 90, 0, 6.283); g.fill();
  });
  return K;
}
// GKKIT-END
function buildGoblin(type) {
  const C = CFG[type], b = C.b;
  const root = new THREE.Group(), rig = new THREE.Group(); root.add(rig); rig.scale.setScalar(SCALE[type]);
  const skin = M(C.skin, { roughness: 0.5, bumpMap: bumpTex, bumpScale: 1.4 });
  const dark = M(new THREE.Color(C.skin).multiplyScalar(0.7), { roughness: 0.6 });
  const cloth = M(C.cloth, { roughness: 0.85, side: THREE.DoubleSide }), leather = M(0x3a281c, { roughness: 0.75 });
  const metal = M(0xaab0b8, { metalness: 0.95, roughness: 0.32, envMapIntensity: 1 }), gold = M(0xffc933, { metalness: 1, roughness: 0.22, envMapIntensity: 1.1 });
  const bone = M(0xf0e8d0, { roughness: 0.5 }), eyeM = new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0xffb300, emissiveIntensity: 1.8 });
  const wood = M(0x6a4526, { roughness: 0.9, bumpMap: bumpTex, bumpScale: 2 });
  const u = { rig, type, legs: [], arms: [], glows: [], spin: [] };
  const belly = M(new THREE.Color(C.skin).lerp(new THREE.Color(0xeedc9a), 0.38), { roughness: 0.55, bumpMap: bumpTex, bumpScale: 1.2 });
  const skinDeep = M(new THREE.Color(C.skin).multiplyScalar(0.52), { roughness: 0.6, bumpMap: bumpTex, bumpScale: 1.4 });
  const lidM = M(new THREE.Color(C.skin).multiplyScalar(0.62), { roughness: 0.5 });
  const irisM = new THREE.MeshStandardMaterial({ color: 0xffd21e, emissive: 0xff8a00, emissiveIntensity: 1.1, roughness: 0.25 });
  const clawM = M(0xd8cdb0, { roughness: 0.4 }), rag = M(0x5b4632, { roughness: 0.95, side: THREE.DoubleSide }), BOXG = new THREE.BoxGeometry(1, 1, 1);

  // legs and boots
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.17 * b, 0.58, 0); rig.add(leg); u.legs.push(leg);
    part(leg, SPH, skin, 0, -0.1, 0, 0.1 * b, 0.17, 0.11 * b);                         // thigh
    limb(leg, dark, 0.075, 0.2, 0, -0.17, 0); part(leg, SPH, skinDeep, 0, -0.33, 0.03, 0.075, 0.07, 0.07); // knee
    part(leg, SPH, skin, 0, -0.4, -0.005, 0.07, 0.11, 0.075);                          // calf
    part(leg, new THREE.CylinderGeometry(1, 0.8, 1, 12), leather, 0, -0.46, 0, 0.095, 0.1, 0.1);   // boot cuff
    part(leg, SPH, leather, 0, -0.53, 0.07, 0.1, 0.065, 0.17);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 14), gold); strap.rotation.x = Math.PI / 2; strap.position.y = -0.5; leg.add(strap);
    for (const x of [-0.05, 0, 0.05]) cone(leg, clawM, x, -0.54, 0.235, 0.022, 0.09, Math.PI / 2 + 0.15);   // toe claws
  }
  // torso
  const torso = new THREE.Group(); torso.position.y = 0.55; rig.add(torso); u.torso = torso;
  part(torso, SPH, skin, 0, 0.32, 0, 0.3 * b, 0.36, 0.24 * b);
  part(torso, SPH, skin, 0, 0.17, 0.07, 0.25 * b, 0.22, 0.22 * b);              // pot belly
  part(torso, SPH, skin, 0, 0.5, 0.0, 0.31 * b, 0.2, 0.23 * b);                  // shoulders
  part(torso, SPH, belly, 0, 0.2, 0.13 * b, 0.2 * b, 0.24, 0.17 * b);             // pale belly
  part(torso, SPH, belly, 0, 0.4, 0.1 * b, 0.2 * b, 0.14, 0.17 * b);              // chest
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const rb = part(torso, CAP, skinDeep, s * 0.13 * b, 0.46 - i * 0.07, 0.17 * b, 0.012, 0.05 * b, 0.012); rb.rotation.z = Math.PI / 2 - s * 0.25; } // ribs
  for (let i = 0; i < 6; i++) cone(torso, skinDeep, 0, 0.62 - i * 0.1, -0.2 * b, 0.025, 0.07, -Math.PI / 2 - 0.3);   // spine ridge
  torso.rotation.x = 0.14;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.27 * b, 0.035, 8, 28), leather); belt.rotation.x = Math.PI / 2; belt.position.set(0, 0.2, 0.03); belt.scale.set(1, 0.9, 1); torso.add(belt);
  part(torso, new THREE.BoxGeometry(1, 1, 1), gold, 0, 0.2, 0.27 * b, 0.1, 0.09, 0.03);
  // arms (shoulder pivots)
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.35 * b, 1.0, 0); rig.add(sh); u.arms.push(sh);
    limb(sh, skin, 0.06 * b, 0.22, 0, -0.14, 0); part(sh, SPH, skin, 0, -0.08, 0.01, 0.085 * b, 0.1, 0.085 * b); // bicep
    const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el); sh.userData.el = el;
    part(el, SPH, skinDeep, 0, 0, -0.01, 0.06 * b, 0.055, 0.06 * b);                  // elbow
    limb(el, skin, 0.055 * b, 0.2, 0, -0.12, 0); part(el, SPH, skin, 0, -0.1, 0.01, 0.07 * b, 0.1, 0.07 * b);
    part(el, new THREE.CylinderGeometry(1, 0.85, 1, 12), leather, 0, -0.17, 0, 0.068 * b, 0.07, 0.068 * b);   // bracer
    const hand = new THREE.Group(); hand.position.set(0, -0.28, 0); el.add(hand); el.userData.hand = hand;
    part(hand, SPH, skin, 0, 0, 0, 0.075 * b, 0.07, 0.075 * b);
    for (const x of [-0.05, -0.017, 0.017, 0.05]) { part(hand, SPH, skin, x * b, -0.07, 0.03, 0.017, 0.04, 0.017); cone(hand, clawM, x * b, -0.14, 0.04, 0.014, 0.075, Math.PI + 0.3); }
    part(hand, SPH, skin, s * 0.07 * b, -0.02, 0.03, 0.025, 0.035, 0.025);              // thumb
  }
  const handR = u.arms[1].userData.el.userData.hand, elR = u.arms[1].userData.el;

  // head
  const head = new THREE.Group(); head.position.set(0, 1.12, 0); rig.add(head); u.head = head;
  part(head, SPH, skin, 0, 0.22, 0, 0.3, 0.27, 0.28);
  part(head, SPH, skin, 0, 0.07, 0.1, 0.22, 0.12, 0.2);                           // heavy jaw
  part(head, SPH, M(0x2a0d0d), 0, 0.105, 0.2, 0.15, 0.04, 0.08);                  // mouth
  part(head, SPH, M(0xc2506a, { roughness: 0.4 }), 0, 0.095, 0.2, 0.07, 0.022, 0.06);   // tongue
  for (let i = 0; i < 6; i++) cone(head, bone, (i - 2.5) * 0.045, 0.125, 0.27 - Math.abs(i - 2.5) * 0.012, 0.016, 0.05);
  part(head, SPH, skinDeep, 0, 0.1, 0.285, 0.1, 0.018, 0.03);                      // upper lip shadow
  cone(head, skin, 0, 0.0, 0.2, 0.05, 0.1, Math.PI / 2 - 0.5);                    // chin spike
  part(head, SPH, skin, 0, 0.36, 0.06, 0.24, 0.12, 0.22);                          // heavy forehead
  for (const s of [-1, 1]) {
    cone(head, bone, s * 0.085, 0.11, 0.255, 0.034, 0.17, -0.12, s * 0.12);       // lower tusks (underbite)
    cone(head, bone, s * 0.15, 0.13, 0.215, 0.02, 0.07, -0.1, s * 0.4);           // small side fangs
    part(head, SPH, skin, s * 0.17, 0.17, 0.19, 0.07, 0.05, 0.06);                // cheekbone
    part(head, SPH, skinDeep, s * 0.12, 0.25, 0.2, 0.075, 0.062, 0.05);           // eye socket
    part(head, SPH, new THREE.MeshStandardMaterial({ color: 0xf6efb0, emissive: 0xc89400, emissiveIntensity: 0.5, roughness: 0.3 }), s * 0.12, 0.255, 0.222, 0.058, 0.05, 0.05);
    part(head, SPH, irisM, s * 0.12, 0.255, 0.262, 0.036, 0.036, 0.016);
    part(head, SPH, M(0x050505), s * 0.12, 0.255, 0.275, 0.009, 0.034, 0.01);     // slit pupils
    glow(head, 0xffd040, 0.17, s * 0.12, 0.255, 0.28, 0.28);
    const lid = part(head, SPH, lidM, s * 0.12, 0.285, 0.226, 0.066, 0.03, 0.06); lid.rotation.z = Math.PI / 2 * 0 + s * -0.0; lid.rotation.z = s * 0.38;
    const brow = part(head, CAP, skinDeep, s * 0.125, 0.325, 0.225, 0.03, 0.07, 0.034); brow.rotation.z = Math.PI / 2 + s * 0.5;
    const ear = new THREE.Group(); ear.position.set(s * 0.27, 0.27, -0.02); ear.rotation.set(0.2, 0, -s * 1.25); head.add(ear);
    cone(ear, skin, 0, 0.25, 0, 0.11, 0.55).scale.z = 0.3; cone(ear, M(0xd98a8a, { roughness: 0.6 }), 0, 0.22, 0.015, 0.075, 0.42).scale.z = 0.2;
    for (let k = 0; k < 3; k++) part(ear, SPH, skinDeep, 0, 0.12 + k * 0.1, 0.03, 0.01, 0.07, 0.006);  // ear veins
    cone(ear, skin, 0.06, 0.38, 0.0, 0.025, 0.1, 0, -0.5).scale.z = 0.4;           // torn notch tip
    for (let k = 0; k < 2; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 14), gold); ring.position.set(0, 0.04 + k * 0.09, 0.02); ear.add(ring); }
    for (let k = 0; k < 2; k++) part(head, SPH, skinDeep, s * (0.03 + k * 0.04), 0.205, 0.318 - k * 0.01, 0.012, 0.012, 0.01); // nostrils
  }
  const nose = cone(head, skin, 0, 0.2, 0.28, 0.06, 0.2, Math.PI / 2 + 0.55);
  part(head, SPH, skin, 0, 0.17, 0.33, 0.06, 0.045, 0.045);
  for (const [x, y, z] of [[-0.17, 0.12, 0.2], [0.15, 0.3, 0.2], [0.05, 0.36, 0.17], [-0.2, 0.22, 0.17], [0.19, 0.14, 0.19]]) part(head, SPH, dark, x, y, z, 0.022, 0.022, 0.022); // warts
  part(head, SPH, skinDeep, -0.16, 0.3, 0.21, 0.01, 0.07, 0.01).rotation.z = 0.5;  // scar
  head.position.z = 0.04;

  // ----- per-type gear -----
  if (type === 0) { // scrawny scavenger: rag tunic, dagger, tuft of hair
    part(torso, new THREE.CylinderGeometry(1, 1.25, 1, 18, 1, true), cloth, 0, 0.18, 0, 0.27 * b, 0.5, 0.22 * b);
    for (let i = 0; i < 5; i++) cone(torso, cloth, (i - 2) * 0.1, -0.12, 0.02, 0.05, 0.15, Math.PI);
    for (let i = 0; i < 3; i++) cone(head, leather, (i - 1) * 0.05, 0.5, 0, 0.02, 0.12, 0, (i - 1) * 0.3);
    const blade = new THREE.Group(); blade.rotation.x = -1.3; handR.add(blade);
    part(blade, new THREE.BoxGeometry(1, 1, 1), metal, 0, -0.17, 0, 0.035, 0.3, 0.01); cone(blade, metal, 0, -0.35, 0, 0.018, 0.09, Math.PI);
    part(blade, new THREE.BoxGeometry(1, 1, 1), leather, 0, 0.0, 0, 0.1, 0.025, 0.03);
    elR.rotation.x = -0.9;
  }
  if (type === 1) { // brawler: studded leather vest, mohawk, nailed club
    part(torso, SPH, leather, 0, 0.36, 0.01, 0.325 * b, 0.34, 0.255 * b).scale.y = 0.32;
    part(torso, new THREE.CylinderGeometry(1, 1.05, 1, 20, 1, true), leather, 0, 0.36, 0, 0.31 * b, 0.4, 0.245 * b);
    for (let i = 0; i < 6; i++) { const a = -0.7 + i * 0.28; part(torso, SPH, gold, Math.sin(a) * 0.3 * b, 0.5 - (i % 2) * 0.1, Math.cos(a) * 0.245 * b, 0.022, 0.022, 0.022); }
    for (let i = 0; i < 5; i++) cone(head, M(0xc23a22, { roughness: 0.6 }), 0, 0.48 - Math.abs(i - 2) * 0.02, (i - 2) * 0.07, 0.035, 0.18, (i - 2) * 0.28);
    const club = new THREE.Group(); club.rotation.x = -1.2; handR.add(club);
    part(club, new THREE.CylinderGeometry(0.1, 0.045, 0.7, 12), wood, 0, -0.3, 0);
    for (let i = 0; i < 5; i++) { const a = i * 1.3; cone(club, metal, Math.sin(a) * 0.1, -0.4 - (i % 3) * 0.1, Math.cos(a) * 0.1, 0.02, 0.09, Math.cos(a) * 1.4, -Math.sin(a) * 1.4); }
    elR.rotation.x = -0.9;
  }
  if (type === 2) { // warlord brute: bare chest, harness, spiked pauldrons, horned helm, war paint, spiked mace
    for (const [sgn, ang] of [[1, 0.7], [-1, -0.7]]) { const st = part(torso, new THREE.BoxGeometry(1, 1, 1), leather, 0, 0.35, 0.02, 0.06, 0.8, 0.5 * b); st.rotation.z = ang; }
    part(torso, new THREE.BoxGeometry(1, 1, 1), metal, 0, 0.36, 0.25 * b, 0.12, 0.12, 0.03).rotation.z = Math.PI / 4;
    for (const s of [-1, 1]) {
      const pad = part(torso, SPH, metal, s * 0.42 * b, 0.55, 0, 0.17, 0.12, 0.17); pad.rotation.z = -s * 0.3;
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; cone(torso, metal, s * 0.42 * b + Math.cos(a) * 0.1, 0.62, Math.sin(a) * 0.1, 0.03, 0.14, Math.sin(a) * 0.5, -Math.cos(a) * 0.5); }
    }
    const helm = part(head, new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, 0.3, 0, 0.32, 0.26, 0.3);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.02, 8, 24), gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.31; head.add(rim);
    for (const s of [-1, 1]) { const h1 = cone(head, bone, s * 0.34, 0.42, 0, 0.06, 0.34, 0, -s * 0.7); h1.position.x = s * 0.36; }
    for (const s of [-1, 1]) part(head, new THREE.BoxGeometry(1, 1, 1), M(0xb01818, { roughness: 0.7 }), s * 0.17, 0.2, 0.235, 0.03, 0.12, 0.01).rotation.z = s * 0.3;
    const mace = new THREE.Group(); mace.rotation.x = -1.25; handR.add(mace);
    part(mace, new THREE.CylinderGeometry(0.045, 0.05, 1.0, 12), wood, 0, -0.38, 0);
    part(mace, SPH, metal, 0, -0.95, 0, 0.17, 0.17, 0.17);
    for (let i = 0; i < 12; i++) { const y = 1 - 2 * (i + 0.5) / 12, rr = Math.sqrt(1 - y * y), a = i * 2.4; cone(mace, metal, Math.cos(a) * rr * 0.17, -0.95 + y * 0.17, Math.sin(a) * rr * 0.17, 0.035, 0.14, Math.sin(a) * rr * 1.5, -Math.cos(a) * rr * 1.5); }
    elR.rotation.x = -0.9;
  }
  if (type === 0) { // extra scavenger detail: scrawny limbs, bandana, satchel, patches
    torso.scale.x = 0.8; u.arms.forEach(a => a.scale.set(0.8, 1, 0.8)); u.legs.forEach(l => l.scale.set(0.82, 1, 0.82));
    const bw = M(0x8a1f1f, { roughness: 0.9, side: THREE.DoubleSide });
    const bnd = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.032, 8, 24), bw); bnd.rotation.x = Math.PI / 2 + 0.12; bnd.position.y = 0.33; bnd.scale.set(1, 0.93, 1); head.add(bnd);
    cone(head, bw, 0.12, 0.28, -0.3, 0.035, 0.22, -2.0, 0.4); cone(head, bw, 0.02, 0.3, -0.3, 0.03, 0.2, -2.3, -0.3);   // knot tails
    const strap = part(torso, BOXG, leather, 0, 0.35, 0.02, 0.05, 0.75, 0.46 * b); strap.rotation.z = -0.75;
    const bag = part(torso, BOXG, rag, -0.3, 0.0, 0.0, 0.1, 0.2, 0.2); bag.rotation.z = 0.2; part(torso, BOXG, leather, -0.3, 0.09, 0.0, 0.11, 0.06, 0.22);
    part(torso, BOXG, M(0x9a7a4a, { roughness: 0.9 }), 0.13, 0.05, 0.2, 0.09, 0.1, 0.01);  // patch
    part(torso, BOXG, M(0x6d6a3a, { roughness: 0.9 }), -0.1, 0.0, 0.22, 0.08, 0.07, 0.01);
    for (let i = 0; i < 4; i++) cone(torso, rag, -0.12 + i * 0.09, 0.45, 0.2, 0.025, 0.07, Math.PI);   // frayed collar
    const gm = M(0xeedd88, { metalness: 1, roughness: 0.25 }); const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), gm); hoop.position.set(0.04, 0.155, 0.335); head.add(hoop);
    for (let i = 0; i < 5; i++) cone(head, leather, (i - 2) * 0.05, 0.49, -0.02, 0.018, 0.14, 0.2, (i - 2) * 0.35);
  }
  if (type === 1) { // extra punk detail: big mohawk, spiked bracers, chain, skull buckle, nose ring
    const mo = [0xc23a22, 0xe0661a];
    for (let i = 0; i < 9; i++) { const z = -0.2 + i * 0.058, h = 0.3 - Math.abs(i - 4) * 0.025; cone(head, M(mo[i % 2], { roughness: 0.55 }), 0, 0.5 - Math.abs(i - 4) * 0.012, z, 0.05, h, (i - 4) * 0.08); }
    part(head, SPH, M(0x24301c, { roughness: 0.9 }), 0, 0.46, -0.02, 0.07, 0.04, 0.22);  // shaved stripe
    for (const s of [-1, 1]) {
      const hand = u.arms[s > 0 ? 1 : 0].userData.el;
      for (let i = 0; i < 4; i++) { const a = i * 1.57; cone(hand, metal, Math.sin(a) * 0.075, -0.17, Math.cos(a) * 0.075, 0.018, 0.07, Math.cos(a) * 1.3, -Math.sin(a) * 1.3); }
      const pad = part(torso, SPH, leather, s * 0.37 * b, 0.55, 0, 0.12, 0.08, 0.14); pad.rotation.z = -s * 0.4;
      for (let i = 0; i < 2; i++) cone(torso, metal, s * (0.4 + i * 0.05) * b, 0.62, 0.0, 0.028, 0.14, 0, -s * (0.4 + i * 0.4));
    }
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.31 * b, 0.014, 6, 30, Math.PI), metal); chain.rotation.set(0.0, 0, Math.PI); chain.position.set(0, 0.5, 0.06); chain.scale.set(1, 0.9, 0.85); torso.add(chain);
    const sk = part(torso, SPH, bone, 0, 0.2, 0.29 * b, 0.06, 0.055, 0.04); part(torso, SPH, M(0x111111), -0.02, 0.21, 0.322 * b, 0.012, 0.014, 0.01); part(torso, SPH, M(0x111111), 0.02, 0.21, 0.322 * b, 0.012, 0.014, 0.01);
    const nr = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12), gold); nr.position.set(0, 0.145, 0.345); head.add(nr);
    for (let i = 0; i < 5; i++) { const a = -0.8 + i * 0.4; part(torso, SPH, M(0x2c2c30, { roughness: 0.6 }), Math.sin(a) * 0.27 * b, 0.08, Math.cos(a) * 0.23 * b, 0.07, 0.1, 0.02); }   // studded loin straps
    part(head, SPH, M(0x2a2a30, { metalness: 0.8, roughness: 0.4 }), 0.06, 0.0, 0.3, 0.012, 0.012, 0.012);
  }
  if (type === 2) { // extra warlord detail: war paint, fur mantle, bracers, skull trophies, crest, tattoos
    const fur = M(0x5a4636, { roughness: 1 });
    for (const s of [-1, 1]) for (let i = 0; i < 10; i++) { const a = i * 0.63; cone(torso, fur, s * 0.32 * b + Math.cos(a) * 0.17, 0.5 + Math.sin(i) * 0.02, Math.sin(a) * 0.17, 0.035, 0.12, Math.sin(a) * 1.3, -Math.cos(a) * 1.3); }
    for (const s of [-1, 1]) {
      const el = u.arms[s > 0 ? 1 : 0].userData.el;
      part(el, new THREE.CylinderGeometry(1, 0.85, 1, 14), metal, 0, -0.17, 0, 0.085 * b, 0.12, 0.085 * b);
      for (let i = 0; i < 3; i++) cone(el, metal, 0, -0.14 - i * 0.04, 0.08 * b, 0.018, 0.07, Math.PI / 2);
      const g = u.arms[s > 0 ? 1 : 0]; part(g, new THREE.CylinderGeometry(1, 1, 1, 12), gold, 0, -0.01, 0, 0.1 * b, 0.025, 0.1 * b);   // armband
      cone(head, bone, s * 0.4, 0.55, 0, 0.045, 0.22, 0, -s * 1.15).position.x = s * 0.46;  // horn tips
    }
    const paint = M(0xe8e0c8, { roughness: 0.8 });
    for (const x of [-0.07, 0, 0.07]) { const st = part(head, BOXG, paint, x, 0.4, 0.21 + (1 - Math.abs(x) * 6) * 0.025, 0.02, 0.1, 0.008); st.rotation.x = -0.45; }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const st = part(head, BOXG, paint, s * (0.19 + i * 0.015), 0.09 + i * 0.03, 0.2, 0.05, 0.012, 0.008); st.rotation.z = s * 0.3; st.rotation.y = -s * 0.7; }
    const crest = part(head, BOXG, metal, 0, 0.58, 0, 0.03, 0.1, 0.46); crest.rotation.x = 0.0;
    for (let i = 0; i < 5; i++) part(head, SPH, gold, 0, 0.4 - 0.0, 0.24 - i * 0.1, 0.02, 0.02, 0.02).position.set(0, 0.62 - Math.abs(i - 2) * 0.03, -0.16 + i * 0.09);
    for (let i = 0; i < 4; i++) { const a = -0.5 + i * 0.33; const sk = part(torso, SPH, bone, Math.sin(a) * 0.3 * b, 0.12, Math.cos(a) * 0.25 * b + 0.03, 0.05, 0.055, 0.04); part(torso, SPH, M(0x111111), Math.sin(a) * 0.3 * b - 0.015, 0.125, Math.cos(a) * 0.25 * b + 0.065, 0.012, 0.014, 0.01); part(torso, SPH, M(0x111111), Math.sin(a) * 0.3 * b + 0.015, 0.125, Math.cos(a) * 0.25 * b + 0.065, 0.012, 0.014, 0.01); }
    for (let i = 0; i < 3; i++) { const sc = part(torso, BOXG, skinDeep, -0.1 - i * 0.03, 0.42 - i * 0.03, 0.3 * b, 0.1, 0.012, 0.01); sc.rotation.z = 0.7; }   // claw scars
    part(torso, BOXG, leather, 0, 0.02, 0.2 * b, 0.28 * b, 0.28, 0.02);                    // loin armour flap
    for (let i = 0; i < 3; i++) part(torso, BOXG, metal, (i - 1) * 0.09, 0.05, 0.22 * b, 0.07, 0.14, 0.015);
  }
  if (type === 3) { // wizard: starry folded robe, bent star hat, flowing beard, crystal staff, floating runes and a magic circle
    const K = goblinKit(), DS = THREE.DoubleSide, V2 = (x, y) => new THREE.Vector2(x * b, y);
    const white = M(0xf2f0fa, { roughness: 0.95 }), goldD = M(0xffc933, { metalness: 1, roughness: 0.25, envMapIntensity: 1.2, side: DS });
    const emi = (c, e, i = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i, roughness: 0.2, metalness: 0.2 });
    const robeM = M(0xffffff, { map: K.robeTex, roughness: 0.75, side: DS, envMapIntensity: 0.4 });
    const g2 = (parent, col, size, x, y, z, op) => { const s = glow(parent, col, size, x, y, z, op); s.userData.op = op; u.glows.push(s); return s; };
    // robe with pleats, gold hem and front stripe
    const prof = [[0.47, -0.55], [0.45, -0.4], [0.4, -0.2], [0.34, 0], [0.29, 0.2], [0.265, 0.38], [0.285, 0.52], [0.27, 0.62], [0.2, 0.7]];
    const robe = new THREE.Mesh(K.fold(new THREE.LatheGeometry(prof.map(([x, y]) => V2(x, y)), 44), 11, 0.07, -0.55, 0.1), robeM);
    robe.position.y = 0.12; torso.add(robe); u.robe = robe;
    const hemT = new THREE.Mesh(K.fold(new THREE.LatheGeometry([V2(0.492, -0.556), V2(0.482, -0.5)], 44), 11, 0.07, -0.55, 0.1), goldD); hemT.position.y = 0.12; torso.add(hemT);
    const stripe = new THREE.Mesh(K.fold(new THREE.LatheGeometry(prof.map(([x, y]) => V2(x + 0.014, y)), 6, -0.11, 0.22), 11, 0.07, -0.55, 0.1), goldD); stripe.position.y = 0.12; torso.add(stripe);
    [[-0.05, 0.32], [-0.2, 0.37], [-0.36, 0.425]].forEach(([y, r], i) => part(torso, SPH, emi(i === 1 ? 0xff5588 : 0x55ddff, i === 1 ? 0xcc2255 : 0x1190ee, 1.6), 0, y, (r + 0.02) * b, 0.028, 0.028, 0.02));
    // sash with buckle and tassels
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.325 * b, 0.04, 8, 32), M(0xe8b020, { metalness: 0.8, roughness: 0.35 })); sash.rotation.x = Math.PI / 2 - 0.05; sash.position.set(0, 0.22, 0); torso.add(sash);
    part(torso, new THREE.BoxGeometry(1, 1, 1), gold, 0, 0.22, 0.33 * b, 0.1, 0.1, 0.04).rotation.z = Math.PI / 4;
    part(torso, SPH, emi(0xb070ff, 0x7a2cff), 0, 0.22, 0.355 * b, 0.03, 0.03, 0.02);
    for (const s of [-1, 1]) { cone(torso, M(0xc9a6ff), s * 0.1, 0.0, 0.33 * b, 0.025, 0.2, Math.PI, 0); part(torso, SPH, gold, s * 0.1, -0.11, 0.33 * b, 0.03, 0.03, 0.03); }
    // starry mantle over the shoulders with gold rim and clasp
    const mantle = part(torso, new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0.6, 0.9), M(0x7a45d8, { roughness: 0.55, side: DS }), 0, 0.42, 0, 0.38 * b, 0.3, 0.32 * b);
    const mrim = new THREE.Mesh(new THREE.TorusGeometry(0.38 * b * Math.sin(1.5), 0.02, 6, 32), goldD); mrim.rotation.x = Math.PI / 2; mrim.position.y = 0.42 + 0.3 * Math.cos(1.5); mrim.scale.set(1, 0.84, 1); torso.add(mrim);
    for (let i = 0; i < 9; i++) { const a = (i - 4) * 0.34; part(torso, SPH, gold, Math.sin(a) * 0.38 * b * 0.94, 0.48 + 0.04 * Math.cos(a * 3), Math.cos(a) * 0.32 * b * 0.94, 0.017, 0.017, 0.017); }
    part(torso, SPH, gold, 0, 0.56, 0.3 * b, 0.05, 0.05, 0.03); part(torso, SPH, emi(0x55ddff, 0x1190ee, 2), 0, 0.56, 0.32 * b, 0.032, 0.032, 0.02);
    // bell sleeves with gold cuffs
    for (const s of [-1, 1]) {
      const sh = u.arms[s > 0 ? 1 : 0], el = sh.userData.el;
      limb(sh, robeM, 0.088 * b, 0.22, 0, -0.14, 0);
      cone(el, robeM, 0, -0.14, 0, 0.14, 0.3, Math.PI);
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 6, 20), gold); cuff.position.y = -0.285; cuff.rotation.x = Math.PI / 2; el.add(cuff);
      const cuff2 = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.01, 6, 20), gold); cuff2.position.y = -0.25; cuff2.rotation.x = Math.PI / 2; el.add(cuff2);
    }
    // long white hair, beard in tiers, moustache, bushy brows
    for (let i = 0; i < 11; i++) { const a = (i - 5) * 0.28; cone(head, white, Math.sin(a) * 0.25, 0.2 - Math.abs(a) * 0.12, -0.15 - Math.cos(a) * 0.1, 0.05, 0.42 - Math.abs(i - 5) * 0.03, Math.PI + 0.12, -a * 0.35); }
    for (let j = 0; j < 5; j++) {
      const n = 9 - j, len = 0.2 + j * 0.07, w = 0.05 - j * 0.004;
      for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * (0.5 - j * 0.04); cone(head, white, Math.sin(a) * (0.17 - j * 0.014), 0.06 - j * 0.06, 0.22 + Math.cos(a) * 0.07 + j * 0.035, w, len * (1 - Math.abs(a) * 0.35), Math.PI - 0.14 - j * 0.04, -a * 0.4); }
    }
    for (const s of [-1, 1]) {
      cone(head, white, s * 0.07, 0.15, 0.31, 0.035, 0.2, 0.3, -s * 1.15); cone(head, white, s * 0.15, 0.16, 0.29, 0.025, 0.12, 0.2, -s * 1.7);
      cone(head, white, s * 0.12, 0.37, 0.22, 0.04, 0.14, 0.2, -s * 1.15); cone(head, white, s * 0.17, 0.35, 0.2, 0.03, 0.1, 0.1, -s * 0.85);
    }
    // hat: jaunty wavy brim, five bending segments, band, buckle, glowing star on the tip
    const hatM = M(0xe8e4ff, { map: K.robeTex, roughness: 0.8, side: DS });
    const hat = new THREE.Group(); hat.position.y = 0.42; hat.rotation.set(-0.06, 0, 0.07); head.add(hat);
    const bg = new THREE.LatheGeometry([[0.2, -0.01], [0.4, -0.035], [0.56, -0.005], [0.63, 0.07], [0.61, 0.08], [0.55, 0.025], [0.4, 0.005], [0.2, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)), 40);
    { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, p.getY(i) + Math.sin(Math.atan2(x, z) * 3 + 0.6) * 0.06 * Math.max(0, r - 0.25)); } bg.computeVertexNormals(); }
    hat.add(new THREE.Mesh(bg, hatM));
    const brimEdge = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.012, 6, 40), goldD); brimEdge.rotation.x = Math.PI / 2; brimEdge.position.y = 0.075; hat.add(brimEdge);
    const rad = [0.31, 0.262, 0.222, 0.18, 0.138, 0.1, 0.045], H = [0.3, 0.26, 0.24, 0.22, 0.2, 0.18], bend = [0, 0.1, 0.22, 0.32, 0.42, 0.5];
    let prev = hat, tipY = 0;
    for (let i = 0; i < 6; i++) { const gr = new THREE.Group(); gr.position.y = i ? H[i - 1] * 0.97 : 0; gr.rotation.z = bend[i]; prev.add(gr); part(gr, new THREE.CylinderGeometry(rad[i + 1], rad[i], H[i], 18, 1), hatM, 0, H[i] / 2, 0); prev = gr; tipY = H[i]; }
    const bandG = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.028, 8, 32), goldD); bandG.rotation.x = Math.PI / 2; bandG.position.y = 0.07; hat.add(bandG);
    part(hat, new THREE.BoxGeometry(1, 1, 1), gold, 0, 0.075, 0.305, 0.12, 0.12, 0.035).rotation.z = Math.PI / 4;
    part(hat, SPH, emi(0xff5588, 0xcc1144, 2), 0, 0.075, 0.325, 0.04, 0.04, 0.025);
    for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) { const a = s * k * 0.55; part(hat, SPH, emi(0x55ddff, 0x1190ee, 1.8), Math.sin(a) * 0.295, 0.075, Math.cos(a) * 0.295, 0.024, 0.024, 0.024); }
    const starM = emi(0xffe27a, 0xffc020, 2.2), starG = new THREE.Group(); starG.position.y = tipY + 0.05; prev.add(starG);
    part(starG, K.star(0.13, 0.055, 0.03), starM, 0, 0, 0, 1, 1, 1); part(starG, K.star(0.13, 0.055, 0.03), starM, 0, 0, 0).rotation.y = Math.PI / 2;
    g2(starG, 0xffe27a, 0.7, 0, 0, 0, 0.9);
    // staff: gnarled wooden shaft, gold crescent cradle, floating crystal with orbiting shards
    const staff = new THREE.Group(); staff.position.set(0.02, -0.02, 0.05); handR.add(staff); elR.rotation.x = -0.45; staff.rotation.x = 0.45;
    const pts = []; for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3(Math.sin(i * 1.3) * 0.022, -0.45 + i * 0.22, Math.cos(i * 1.7) * 0.022));
    part(staff, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, 0.034, 8), wood, 0, 0, 0);
    for (const y of [-0.2, 0.62, 1.0]) part(staff, SPH, wood, 0.01, y, 0, 0.055, 0.07, 0.055);
    part(staff, new THREE.CylinderGeometry(0.046, 0.046, 0.26, 10), leather, 0, 0.02, 0);
    for (const [y, r] of [[0.4, 0.045], [1.18, 0.06]]) { const bn = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 6, 16), gold); bn.rotation.x = Math.PI / 2; bn.position.set(0, y, 0); staff.add(bn); }
    for (let i = 0; i < 3; i++) { const a = i * 2.09, c = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 1.16, 0), new THREE.Vector3(Math.sin(a) * 0.14, 1.34, Math.cos(a) * 0.14), new THREE.Vector3(Math.sin(a) * 0.17, 1.52, Math.cos(a) * 0.17), new THREE.Vector3(Math.sin(a) * 0.09, 1.7, Math.cos(a) * 0.09)]); part(staff, new THREE.TubeGeometry(c, 16, 0.018, 6), wood, 0, 0, 0); }
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 28, 4.4), gold); moon.position.y = 1.5; moon.rotation.z = 2.51; staff.add(moon);
    const crystal = part(staff, new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x22aaee, emissive: 0x0a7ad8, emissiveIntensity: 1.5, roughness: 0.08, metalness: 0.4, flatShading: true }), 0, 1.52, 0, 0.13, 0.24, 0.13); u.spin.push(crystal);
    g2(staff, 0x2299ff, 0.8, 0, 1.52, 0, 0.55); g2(staff, 0x8866ff, 2.0, 0, 1.52, 0, 0.16);
    for (const [tilt, rr, n, col] of [[0.5, 0.27, 3, 0xc9a6ff], [-0.7, 0.2, 2, 0x66e0ff]]) {
      const tg = new THREE.Group(); tg.position.y = 1.52; tg.rotation.z = tilt; staff.add(tg); const sg = new THREE.Group(); tg.add(sg); u.spin.push(sg);
      const ringM = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.006, 5, 36), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); ringM.rotation.x = Math.PI / 2; sg.add(ringM);
      for (let i = 0; i < n; i++) { const a = i / n * 6.283; part(sg, new THREE.OctahedronGeometry(1), emi(col, col, 2), Math.sin(a) * rr, 0, Math.cos(a) * rr, 0.03, 0.045, 0.03); }
    }
    // floating runes and sparkles around the wizard
    const runes = new THREE.Group(); runes.position.y = 1.0; rig.add(runes); u.runes = runes;
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * 6.283, y0 = ((i * 5) % 7) / 7 * 0.9 - 0.3, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glyphs[i % 6], color: i % 2 ? 0x66e0ff : 0xb48cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
      sp.scale.set(0.24, 0.24, 1); sp.position.set(Math.sin(a) * 0.8, y0, Math.cos(a) * 0.8); sp.userData.y0 = y0; runes.add(sp);
    }
    for (let i = 0; i < 12; i++) {
      const a = i * 2.4, r = 0.4 + (i * 37 % 60) / 100, y0 = -0.4 + (i * 53 % 150) / 100, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 3 ? 0xd9c4ff : 0xffe9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      sp.scale.setScalar(0.08 + (i % 3) * 0.03); sp.position.set(Math.sin(a) * r, y0, Math.cos(a) * r); sp.userData.y0 = y0; sp.userData.tw = 1; runes.add(sp);
    }
    // magic circle on the ground and a violet aura
    const circ = new THREE.Group(); circ.position.y = 0.05; rig.add(circ); u.spin.push(circ);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), new THREE.MeshBasicMaterial({ map: K.circleV || (K.circleV = K.circle('#7a4cff', '#22aadd', false)), transparent: true, depthWrite: false, side: DS, opacity: 0.85 })); cp.rotation.x = -Math.PI / 2; circ.add(cp);
    g2(rig, 0x7a4cff, 2.8, 0, 1.0, -0.3, 0.2);
  }
  if (type === 4) { // the king: damask tunic, ermine mantle, jewelled crown, embroidered cape, sun-ruby scepter, golden halo
    const K = goblinKit(), DS = THREE.DoubleSide, V2 = (x, y) => new THREE.Vector2(x * b, y);
    const goldD = M(0xffc933, { metalness: 1, roughness: 0.22, envMapIntensity: 1.3, side: DS, emissive: 0x3a2200, emissiveIntensity: 0.5 });
    const furM = M(0xffffff, { map: K.furTex, roughness: 1, side: DS }), fur = M(0xf7f3ea, { roughness: 1 }), blk = M(0x15110f, { roughness: 0.9 });
    const emi = (c, e, i = 1.8) => new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: i, roughness: 0.15, metalness: 0.3 });
    const ruby = () => emi(0xff3355, 0xff0a33, 2), sapph = () => emi(0x3377ff, 0x1144dd, 1.8), emer = () => emi(0x33dd77, 0x11aa44, 1.6);
    const tunicM = M(0xffffff, { map: K.kingTex, roughness: 0.5, side: DS, envMapIntensity: 0.6 });
    const g2 = (parent, col, size, x, y, z, op) => { const s = glow(parent, col, size, x, y, z, op); s.userData.op = op; u.glows.push(s); return s; };
    // tunic with pleats, gold hem, ermine skirt trim
    const prof = [[0.4, -0.12], [0.395, 0], [0.35, 0.15], [0.3, 0.32], [0.285, 0.45], [0.3, 0.56], [0.22, 0.64]];
    torso.add(new THREE.Mesh(K.fold(new THREE.LatheGeometry(prof.map(([x, y]) => V2(x, y)), 44), 12, 0.04, -0.12, 0.2), tunicM));
    torso.add(new THREE.Mesh(K.fold(new THREE.LatheGeometry([V2(0.405, -0.125), V2(0.4, -0.05)], 44), 12, 0.04, -0.12, 0.2), goldD));
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; part(torso, SPH, fur, Math.sin(a) * 0.41 * b, -0.14, Math.cos(a) * 0.41 * b, 0.08, 0.065, 0.08); }
    const stripe = new THREE.Mesh(K.fold(new THREE.LatheGeometry(prof.map(([x, y]) => V2(x + 0.012, y)), 6, -0.08, 0.16), 12, 0.04, -0.12, 0.2), goldD); torso.add(stripe);
    // belt with big buckle
    const belt2 = new THREE.Mesh(new THREE.TorusGeometry(0.335 * b, 0.045, 8, 36), M(0x4a0a14, { roughness: 0.5 })); belt2.rotation.x = Math.PI / 2; belt2.position.y = 0.21; torso.add(belt2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; part(torso, SPH, gold, Math.sin(a) * 0.335 * b, 0.21, Math.cos(a) * 0.335 * b, 0.02, 0.02, 0.02); }
    part(torso, new THREE.BoxGeometry(1, 1, 1), goldD, 0, 0.21, 0.355 * b, 0.17, 0.13, 0.04);
    part(torso, SPH, ruby(), 0, 0.21, 0.38 * b, 0.045, 0.045, 0.025); for (const s of [-1, 1]) part(torso, SPH, gold, s * 0.065, 0.21, 0.375 * b, 0.016, 0.016, 0.016);
    // ermine mantle, jewelled chain and clasps
    const mantle = part(torso, new THREE.SphereGeometry(1, 30, 10, 0, Math.PI * 2, 0.55, 0.95), furM, 0, 0.44, 0, 0.42 * b, 0.3, 0.35 * b);
    const mrim = new THREE.Mesh(new THREE.TorusGeometry(0.42 * b * Math.sin(1.5), 0.025, 6, 36), goldD); mrim.rotation.x = Math.PI / 2; mrim.position.y = 0.44 + 0.3 * Math.cos(1.5); mrim.scale.set(1, 0.83, 1); torso.add(mrim);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; part(torso, SPH, fur, Math.sin(a) * 0.24 * b, 0.64, Math.cos(a) * 0.2 * b, 0.1, 0.08, 0.1); }
    const chain = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3 * b, 0.6, 0.2 * b), new THREE.Vector3(-0.17 * b, 0.46, 0.31 * b), new THREE.Vector3(0, 0.4, 0.34 * b), new THREE.Vector3(0.17 * b, 0.46, 0.31 * b), new THREE.Vector3(0.3 * b, 0.6, 0.2 * b)]);
    part(torso, new THREE.TubeGeometry(chain, 30, 0.012, 6), goldD, 0, 0, 0);
    part(torso, SPH, ruby(), 0, 0.37, 0.345 * b, 0.04, 0.05, 0.025); part(torso, new THREE.OctahedronGeometry(1), goldD, 0, 0.37, 0.335 * b, 0.06, 0.075, 0.015);
    for (const s of [-1, 1]) { part(torso, SPH, gold, s * 0.3 * b, 0.6, 0.2 * b, 0.055, 0.055, 0.03); part(torso, SPH, sapph(), s * 0.3 * b, 0.6, 0.225 * b, 0.03, 0.03, 0.02); }
    // gold pauldrons with spikes and gems
    for (const s of [-1, 1]) {
      const pg = new THREE.Group(); pg.position.set(s * 0.43 * b, 0.55, 0); pg.rotation.z = -s * 0.35; torso.add(pg);
      part(pg, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), goldD, 0, 0, 0, 0.19, 0.13, 0.19);
      const pr = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.016, 6, 24), gold); pr.rotation.x = Math.PI / 2; pg.add(pr);
      for (let i = 0; i < 5; i++) { const a = i * 1.257; cone(pg, gold, Math.sin(a) * 0.1, 0.08, Math.cos(a) * 0.1, 0.028, 0.14, Math.cos(a) * 0.55, -Math.sin(a) * 0.55); }
      cone(pg, gold, 0, 0.12, 0, 0.04, 0.2); part(pg, SPH, i2(s), 0, 0.07, 0.15, 0.035, 0.035, 0.02);
    }
    function i2(s) { return s > 0 ? ruby() : sapph(); }
    // standing fan collar behind the head
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i - 4) * 0.36, hgt = 0.34 - Math.abs(i - 4) * 0.035; const sp = cone(torso, M(0x7a0a1e, { roughness: 0.5 }), Math.sin(a) * 0.3, 0.72 + hgt / 2 - 0.05, Math.cos(a) * 0.25 - 0.03, 0.06, hgt, -Math.cos(a) * 0.35, Math.sin(a) * 0.35); sp.scale.z = 0.25; if (i % 2) part(torso, SPH, gold, Math.sin(a) * 0.3 * 1.07, 0.72 + hgt - 0.03, Math.cos(a) * 0.25 * 1.07 - 0.03, 0.02, 0.02, 0.02); }
    // face: brows, scar, braided beard, moustache, earrings, sideburns
    const bearM = M(0x5a2210, { roughness: 0.95 });
    for (const s of [-1, 1]) {
      cone(head, M(0x6e1010, { roughness: 0.8 }), s * 0.13, 0.355, 0.235, 0.035, 0.15, 0.3, s * 1.0);
      cone(head, bearM, s * 0.07, 0.15, 0.31, 0.04, 0.22, 0.3, -s * 1.1); cone(head, bearM, s * 0.18, 0.14, 0.27, 0.03, 0.14, 0.2, -s * 1.6);
      for (let k = 0; k < 3; k++) cone(head, bearM, s * (0.27 - k * 0.025), 0.12 - k * 0.07, 0.13 + k * 0.03, 0.04, 0.18, Math.PI, 0);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 6, 16), goldD); hoop.position.set(s * 0.4, 0.14, -0.02); hoop.rotation.y = Math.PI / 2; head.add(hoop); part(head, SPH, i2(s), s * 0.4, 0.075, -0.02, 0.025, 0.025, 0.025);
    }
    { const scar = part(head, new THREE.BoxGeometry(1, 1, 1), M(0x8a2a2a, { roughness: 0.6 }), -0.13, 0.28, 0.265, 0.012, 0.19, 0.012); scar.rotation.z = 0.35; }
    for (let j = 0; j < 3; j++) { const n = 7 - j; for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.5; cone(head, bearM, Math.sin(a) * (0.15 - j * 0.02), 0.04 - j * 0.07, 0.24 + Math.cos(a) * 0.06 + j * 0.03, 0.045 - j * 0.005, 0.2 + j * 0.05, Math.PI - 0.12, -a * 0.35); } }
    for (const s of [-1, 1]) { for (let k = 0; k < 6; k++) part(head, SPH, k % 2 ? gold : bearM, s * (0.08 + k * 0.004), 0.0 - k * 0.055, 0.3 + k * 0.012, 0.028 - k * 0.002, 0.03, 0.028 - k * 0.002); const bd = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12), gold); bd.position.set(s * 0.085, -0.34, 0.37); head.add(bd); }
    // crown: fur-lined band, 8 fleur points with gems, crossing arches, orb and cross
    const crown = new THREE.Group(); crown.position.set(0, 0.36, 0); crown.rotation.x = -0.1; head.add(crown);
    part(crown, new THREE.CylinderGeometry(0.29, 0.275, 0.17, 36, 1, true), goldD, 0, 0.085, 0, 1, 1, 0.93);
    part(crown, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0xa0102a, { roughness: 0.6 }), 0, 0.03, 0, 0.27, 0.27, 0.25);
    const fb = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 8, 36), fur); fb.rotation.x = Math.PI / 2; fb.scale.set(1, 0.93, 1); fb.position.y = 0.0; crown.add(fb);
    for (const y of [0.0, 0.17]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(y ? 0.292 : 0.282, 0.014, 6, 36), gold); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 0.93, 1); rim.position.y = y + 0.02; crown.add(rim); }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.283 + 0.39, tall = i % 2 ? 0.2 : 0.3;
      cone(crown, goldD, Math.sin(a) * 0.285, 0.17 + tall / 2, Math.cos(a) * 0.265, 0.05, tall); part(crown, SPH, [ruby, sapph, emer][i % 3](), Math.sin(a) * 0.285, 0.17 + tall + 0.01, Math.cos(a) * 0.265, 0.026, 0.026, 0.026);
      part(crown, SPH, [sapph, ruby, emer][i % 3](), Math.sin(a + 0.39) * 0.285, 0.09, Math.cos(a + 0.39) * 0.265, 0.03, 0.04, 0.02);
    }
    for (const rot of [0, Math.PI / 2]) {
      const arch = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.285, 0.15, 0), new THREE.Vector3(-0.27, 0.3, 0), new THREE.Vector3(-0.15, 0.42, 0), new THREE.Vector3(0, 0.46, 0), new THREE.Vector3(0.15, 0.42, 0), new THREE.Vector3(0.27, 0.3, 0), new THREE.Vector3(0.285, 0.15, 0)]);
      const am = part(crown, new THREE.TubeGeometry(arch, 40, 0.02, 8), goldD, 0, 0, 0); am.rotation.y = rot; if (rot) am.scale.z = 0.93;
    }
    part(crown, SPH, goldD, 0, 0.5, 0, 0.055, 0.055, 0.055); part(crown, new THREE.BoxGeometry(1, 1, 1), goldD, 0, 0.6, 0, 0.018, 0.1, 0.018); part(crown, new THREE.BoxGeometry(1, 1, 1), goldD, 0, 0.62, 0, 0.06, 0.018, 0.018);
    part(crown, SPH, ruby(), 0, 0.085, 0.272, 0.045, 0.06, 0.025);
    g2(crown, 0xffd24a, 0.8, 0, 0.3, 0, 0.3); g2(crown, 0xff3355, 0.3, 0, 0.085, 0.29, 0.8);
    // cape with embroidered emblem, ermine hem and rolling folds
    const cape = new THREE.Group(); cape.position.set(0, 1.08, -0.2 * b); torso.parent.add(cape); u.cape = cape;
    const cg = new THREE.PlaneGeometry(0.95, 1.05, 18, 14), cpp = cg.attributes.position;
    for (let i = 0; i < cpp.count; i++) { const x = cpp.getX(i), y = cpp.getY(i), t = (0.525 - y) / 1.05; cpp.setX(i, x * (0.8 + 0.32 * t)); cpp.setZ(i, -Math.pow(t, 1.3) * 0.4 + Math.sin(x * 11 + t * 2) * 0.05 * (0.2 + t)); }
    cg.computeVertexNormals();
    const capeMesh = new THREE.Mesh(cg, M(0xffffff, { map: K.capeTex, roughness: 0.5, side: DS, envMapIntensity: 0.7 })); capeMesh.position.y = -0.52; cape.add(capeMesh);
    // scepter: spiral gold shaft, claws holding a blazing ruby, orbiting gems
    const sc = new THREE.Group(); sc.position.set(0.02, -0.02, 0.05); handR.add(sc); elR.rotation.x = -0.6; sc.rotation.x = -0.5;
    part(sc, new THREE.CylinderGeometry(0.028, 0.032, 1.15, 12), goldD, 0, 0.22, 0);
    part(sc, new THREE.CylinderGeometry(0.04, 0.04, 0.24, 10), M(0x4a0a14, { roughness: 0.5 }), 0, 0.0, 0);
    for (let i = 0; i < 7; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 6, 14), gold); r.rotation.x = Math.PI / 2; r.position.y = 0.2 + i * 0.07; sc.add(r); }
    for (const y of [-0.34, 0.12]) { part(sc, SPH, goldD, 0, y, 0, 0.05, 0.05, 0.05); }
    part(sc, SPH, sapph(), 0, 0.12, 0.045, 0.015, 0.015, 0.015);
    cone(sc, goldD, 0, 0.78, 0, 0.09, 0.14, Math.PI);
    const orb = part(sc, new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xff4466, emissive: 0xff0a33, emissiveIntensity: 2.4, roughness: 0.1, metalness: 0.3 }), 0, 0.95, 0, 0.12, 0.12, 0.12); u.spin.push(orb);
    for (let i = 0; i < 6; i++) { const a = i * 1.047; cone(sc, goldD, Math.sin(a) * 0.13, 0.92, Math.cos(a) * 0.13, 0.025, 0.2, Math.cos(a) * 0.35, -Math.sin(a) * 0.35); }
    cone(sc, goldD, 0, 1.12, 0, 0.03, 0.12);
    g2(sc, 0xff3355, 0.9, 0, 0.95, 0, 0.8); g2(sc, 0xff6a30, 2.2, 0, 0.95, 0, 0.2);
    { const tg = new THREE.Group(); tg.position.y = 0.95; tg.rotation.z = 0.5; sc.add(tg); const sg = new THREE.Group(); tg.add(sg); u.spin.push(sg);
      const rg = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.007, 5, 36), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); rg.rotation.x = Math.PI / 2; sg.add(rg);
      for (let i = 0; i < 3; i++) { const a = i * 2.094; part(sg, new THREE.OctahedronGeometry(1), i ? goldD : emi(0xffe27a, 0xffc020, 2), Math.sin(a) * 0.24, 0, Math.cos(a) * 0.24, 0.03, 0.045, 0.03); } }
    // gold rings on fingers
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 14), gold); r.position.set(0, -0.05, 0.0); u.arms[s > 0 ? 1 : 0].userData.el.userData.hand.add(r); }
    // floating coins, crown glyphs and embers, sun circle and radiant halo
    const runes = new THREE.Group(); runes.position.y = 1.0; rig.add(runes); u.runes = runes;
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283, y0 = ((i * 5) % 6) / 6 * 1.0 - 0.3, co = part(runes, new THREE.CylinderGeometry(0.075, 0.075, 0.016, 18), goldD, Math.sin(a) * 0.85, y0, Math.cos(a) * 0.85); co.rotation.z = Math.PI / 2; co.userData.y0 = y0; u.spin.push(co); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283 + 0.6, y0 = 0.1 + ((i * 3) % 5) * 0.18 - 0.2, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.glyphs[i], color: 0xffd24a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 })); sp.scale.set(0.24, 0.24, 1); sp.position.set(Math.sin(a) * 0.65, y0, Math.cos(a) * 0.65); sp.userData.y0 = y0; runes.add(sp); }
    for (let i = 0; i < 12; i++) { const a = i * 2.4, r = 0.4 + (i * 37 % 60) / 100, y0 = -0.5 + (i * 53 % 170) / 100, sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: i % 3 ? 0xffd24a : 0xfff4c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); sp.scale.setScalar(0.07 + (i % 3) * 0.03); sp.position.set(Math.sin(a) * r, y0, Math.cos(a) * r); sp.userData.y0 = y0; sp.userData.tw = 1; runes.add(sp); }
    const circ = new THREE.Group(); circ.position.y = 0.05; rig.add(circ); u.spin.push(circ);
    const cp = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: K.circleK || (K.circleK = K.circle('#e8a010', '#ff3355', true)), transparent: true, depthWrite: false, side: DS, opacity: 0.85 })); cp.rotation.x = -Math.PI / 2; circ.add(cp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: K.rays, color: 0xffc030, depthWrite: false, transparent: true, opacity: 0.45 }));
    halo.scale.set(4.4, 4.4, 1); halo.position.set(0, 1.0, -0.45); halo.userData.op = 0.5; rig.add(halo); u.halo = halo; u.glows.push(halo);
    g2(rig, 0xffc933, 3.0, 0, 1.0, -0.4, 0.16);
  }
  // blob shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.scale.setScalar(1.1 * SCALE[type] * b * 1.4); root.add(sh);
  // name tag
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(NAMES[type], type === 4 ? '#ffd75e' : type === 3 ? '#c9a6ff' : '#f1f1f1', null, 512, 96, 'bold 52px system-ui'), transparent: true, depthWrite: false }));
  label.scale.set(1.6, 0.3, 1); label.position.y = (type === 3 ? 2.35 : 1.95) * SCALE[type]; root.add(label); u.label = label;
  root.userData = u;
  return root;
}

// ---------- networking (real server, or a local simulation for the offline demo) ----------
function makeNet() {
  if (!window.GK_OFFLINE) {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    const net = { send: m => ws.readyState === 1 && ws.send(JSON.stringify(m)), onmessage: null };
    ws.onmessage = e => net.onmessage && net.onmessage(JSON.parse(e.data));
    return net;
  }
  const roll = () => { const r = Math.random() * 100; return r < 30 ? 0 : r < 60 ? 1 : r < 90 ? 2 : r < 99 ? 3 : 4; };
  let nid = 1, list = [], meP = null, seq = 0;
  const mk = bot => {
    const box = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(Math.random() * 8)], [cx, cz] = rc(box);
    const x = cx + (Math.random() - 0.5) * 6, z = cz + (Math.random() - 0.5) * 6;
    return { id: nid++, goblin: roll(), box, x, z, yaw: Math.atan2(-(cx - x), -(cz - z)), bot, tx: cx, tz: cz, wait: Math.random() * 2, seq };
  };
  const emit = () => net.onmessage && net.onmessage({ players: list.map(({ id, goblin, box, x, z, yaw, seq }) => ({ id, goblin, box, x, z, yaw, seq })) });
  const net = {
    onmessage: null,
    send(m) { if (m.m && meP) { [meP.x, meP.z, meP.yaw] = m.m; meP.box = roomAt(meP.x, meP.z); } if (m.reroll) { const o = list.indexOf(meP); seq++; meP = mk(false); meP.id = list[o].id; list[o] = meP; } },
  };
  meP = mk(false); list = [meP, mk(true), mk(true), mk(true), mk(true)];
  setTimeout(() => { net.onmessage && net.onmessage({ you: meP.id }); emit(); }, 50);
  setInterval(() => {
    for (const b of list) {
      if (!b.bot) continue;
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d < 0.3) {
        b.wait -= 0.05;
        if (b.wait <= 0) {
          const c = roomAt(b.x, b.z), col = c % 3, row = Math.floor(c / 3), n = [];
          if (col > 0) n.push(c - 1); if (col < 2) n.push(c + 1); if (row > 0) n.push(c - 3); if (row < 2) n.push(c + 3);
          [b.tx, b.tz] = rc(n[Math.floor(Math.random() * n.length)]); b.wait = 1 + Math.random() * 3;
        }
      } else { b.x += dx / d * 2.8 * 0.05; b.z += dz / d * 2.8 * 0.05; b.yaw = Math.atan2(-dx, -dz); b.box = roomAt(b.x, b.z); }
    }
    emit();
  }, 50);
  setInterval(() => { const bots = list.filter(p => p.bot); if (bots.length > 2 && Math.random() < 0.5) list.splice(list.indexOf(bots[0]), 1); else if (bots.length < 6) list.push(mk(true)); }, 7000);
  return net;
}

// ---------- state ----------
const net = makeNet();
const actors = new Map();
let me = 0, spawned = false;
const P = { x: 0, z: 0, yaw: 0, pitch: 0, speed: 0 };
net.onmessage = d => {
  if (d.you) me = d.you;
  if (!d.players) return;
  const ids = new Set(d.players.map(p => p.id));
  for (const [id, a] of actors) if (!ids.has(id)) { scene.remove(a.group); actors.delete(id); }
  for (const p of d.players) {
    let a = actors.get(p.id);
    if (a && a.goblin !== p.goblin) { scene.remove(a.group); actors.delete(p.id); a = null; }
    if (!a) {
      const group = buildGoblin(p.goblin); scene.add(group);
      a = { group, goblin: p.goblin, x: p.x, z: p.z, yaw: p.yaw, phase: Math.random() * 6, speed: 0, seq: p.seq };
      actors.set(p.id, a);
      if (p.id === me) spawned = false;
    }
    a.tx = p.x; a.tz = p.z; a.tyaw = p.yaw; a.box = p.box;
    if (p.id === me && !spawned) { P.x = p.x; P.z = p.z; P.yaw = p.yaw; P.pitch = 0; a.x = p.x; a.z = p.z; spawned = true; }
  }
  const mine = actors.get(me);
  $('me').textContent = mine ? 'You are: ' + NAMES[mine.goblin] : 'Connecting...';
  $('cnt').textContent = 'Goblin King  ·  ' + actors.size + ' online';
};
if (window.GK_OFFLINE) { $('rr').style.display = 'block'; $('rr').onclick = e => { net.send({ reroll: 1 }); e.stopPropagation(); }; $('rr').onpointerdown = e => e.stopPropagation(); }

// ---------- input ----------
const keys = new Set(); let inside = true, drag = false;
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyV') inside = !inside; });
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = renderer.domElement;
const lockOk = () => document.pointerLockElement === canvas;
$('play').onclick = () => { $('play').style.display = 'none'; try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); } catch (e) {} };
canvas.addEventListener('click', () => { if (!lockOk()) try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); } catch (e) {} });
canvas.addEventListener('mousedown', () => drag = true); addEventListener('mouseup', () => drag = false);
addEventListener('mousemove', e => {
  if (!lockOk() && !drag) return;
  P.yaw -= e.movementX * 0.0022; P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.45, 1.45);
});
let orbit = 0.4;
function resize() { renderer.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- simulation ----------
function blocked(x, z) {
  for (const r of rects) {
    if (r.door && r.door.p > 0.86) continue;
    if (r.openOnly && r.openOnly.p < 0.55) continue;
    if (x > r.x0 - RAD && x < r.x1 + RAD && z > r.z0 - RAD && z < r.z1 + RAD) return true;
  }
  return false;
}
const wrapPi = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
let last = performance.now(), sendT = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now; const t = now / 1000;
  const mine = actors.get(me);
  // my movement
  if (mine && spawned) {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.5 : 4.6) * (0.85 + 0.15 * SCALE[mine.goblin]);
    let mx = -Math.sin(P.yaw) * f + Math.cos(P.yaw) * s, mz = -Math.cos(P.yaw) * f - Math.sin(P.yaw) * s;
    const len = Math.hypot(mx, mz) || 1; mx = mx / len * sp * dt * (f || s ? 1 : 0); mz = mz / len * sp * dt * (f || s ? 1 : 0);
    const ox = P.x, oz = P.z;
    if (!blocked(P.x + mx, P.z)) P.x += mx;
    if (!blocked(P.x, P.z + mz)) P.z += mz;
    P.speed += (Math.hypot(P.x - ox, P.z - oz) / dt - P.speed) * Math.min(1, dt * 12);
    mine.x = P.x; mine.z = P.z; mine.yaw = P.yaw; mine.speed = P.speed;
    sendT += dt; if (sendT > 0.066) { sendT = 0; net.send({ m: [+P.x.toFixed(2), +P.z.toFixed(2), +P.yaw.toFixed(3)] }); }
  }
  // doors
  for (const d of doors) {
    let near = false;
    for (const a of actors.values()) if (Math.hypot(a.x - d.gx, a.z - d.gz) < (d.kind === 'vault' ? 6.2 : 4.6)) { near = true; break; }
    const dur = d.kind === 'vault' ? 2.4 : 0.8;
    d.p = clamp(d.p + (near ? 1 : -1) * dt / dur, 0, 1);
    if (d.kind === 'secure') d.leaf.position.x = d.p * (DW + 0.15);
    else {
      const bolt = Math.min(d.p / 0.3, 1), swing = Math.max((d.p - 0.3) / 0.7, 0);
      d.leaf.rotation.y = -d.sgn * swing * 1.75;
      d.wheels.forEach(w => w.rotation.z = d.p * Math.PI * 3);
      d.bolts.forEach(b => b.position.x = b.userData.x0 + b.userData.sx * 0.38 * (1 - bolt) - b.userData.sx * 0.3 * 0);
    }
    const moving = d.p > 0.02 && d.p < 0.98;
    d.light.emissive.setHex(moving ? 0xffa020 : d.p >= 0.98 ? 0x20ff60 : 0xff1a1a);
    d.light.emissiveIntensity = moving ? 1.5 + Math.sin(t * 14) : 2;
  }
  // goblins
  for (const [id, a] of actors) {
    if (id !== me) {
      const k = Math.min(1, dt * 10), nx = a.x + (a.tx - a.x) * k, nz = a.z + (a.tz - a.z) * k;
      a.speed += (Math.hypot(nx - a.x, nz - a.z) / dt - a.speed) * Math.min(1, dt * 8);
      a.x = nx; a.z = nz; a.yaw += wrapPi(a.tyaw - a.yaw) * k;
    }
    const u = a.group.userData, g = a.group;
    g.position.set(a.x, 0, a.z); g.rotation.y = a.yaw + Math.PI;
    g.visible = !(inside && id === me);
    u.label.visible = id !== me;
    const walk = clamp(a.speed / 3.5, 0, 1); a.phase += dt * a.speed * 2.3;
    u.legs[0].rotation.x = Math.sin(a.phase) * 0.75 * walk; u.legs[1].rotation.x = -Math.sin(a.phase) * 0.75 * walk;
    u.rig.position.y = Math.abs(Math.sin(a.phase)) * 0.06 * walk;
    const armed = u.type !== 3 || true;
    u.arms[0].rotation.x = -Math.sin(a.phase) * 0.6 * walk + Math.sin(t * 1.7 + id) * 0.04;
    u.arms[1].rotation.x = u.type >= 3 ? -0.15 + Math.sin(t * 1.5 + id) * 0.03 : Math.sin(a.phase) * 0.3 * walk - 0.15;
    u.torso.scale.y = 1 + Math.sin(t * 2.2 + id) * 0.015; u.torso.rotation.y = Math.sin(a.phase) * 0.12 * walk;
    u.head.rotation.y = Math.sin(t * 0.8 + id) * 0.3 * (1 - walk); u.head.rotation.x = Math.sin(t * 1.3 + id) * 0.04;
    if (u.cape) { u.cape.rotation.x = 0.05 + walk * 0.35 + Math.sin(t * 2 + id) * 0.03; u.cape.rotation.z = Math.sin(t * 1.3 + id) * 0.025; }
    if (u.runes) { u.runes.rotation.y = t * (u.type === 4 ? 0.9 : 1.4); u.runes.children.forEach((c, i) => { if (c.userData.y0 !== undefined) c.position.y = c.userData.y0 + Math.sin(t * 1.6 + i * 1.9) * 0.07; if (c.userData.tw) c.material.opacity = 0.35 + 0.6 * Math.abs(Math.sin(t * 3 + i * 2.3)); }); }
    if (u.halo) u.halo.material.rotation = t * 0.18;
    u.spin.forEach((m, i) => m.rotation.y = t * (1 + i * 0.2));
    u.glows.forEach((s, i) => s.material.opacity = (s.userData.op ?? 0.75) * (0.85 + 0.15 * Math.sin(t * 3 + i)));
  }
  // camera
  ceilings.forEach(c => c.visible = inside);
  if (inside && mine && spawned) {
    const eye = 1.5 * SCALE[mine.goblin];
    cam.fov = 75; cam.position.set(P.x, eye + Math.sin(mine.phase) * 0.035 * clamp(P.speed / 3.5, 0, 1), P.z);
    cam.rotation.set(P.pitch, P.yaw, 0);
  } else {
    if (!inside) orbit += dt * 0.05;
    const dist = innerHeight > innerWidth ? 60 : 44;
    cam.fov = 50; cam.position.set(Math.sin(orbit) * dist, dist * 0.7, Math.cos(orbit) * dist); cam.lookAt(0, 0, 0);
  }
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__gk = { P, actors, doors, info: renderer.info, scene, setView(x, z, yaw, pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch || 0; spawned = true; }, toggleOverview() { inside = !inside; }, build: buildGoblin };
})();

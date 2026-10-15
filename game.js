// Goblin King client. Needs a global THREE (r158+). Set window.GK_OFFLINE = true to run with simulated players.
(() => {
const THREE = window.THREE;
const NAMES = ['Small Goblin', 'Goblin', 'Big Goblin', 'Goblin Wizard', 'GOBLIN KING'];
const SCALE = [0.75, 1, 1.3, 1.1, 1.2];
// starting stats per goblin type (the server holds the real values, this is for display)
const STATS = [{ knowledge: 60, attack: 10, health: 40 }, { knowledge: 40, attack: 15, health: 50 }, { knowledge: 30, attack: 20, health: 80 }, { knowledge: 80, attack: 0, health: 60 }, { knowledge: 40, attack: 20, health: 100 }];
const R = 12, H = 6.5, T = 0.6;           // room size, ceiling height, wall thickness
const DW = 4, DHT = 4.4, VW = 4.9, VH = 5; // secure door and vault door openings
const RAD = 0.45;                          // player radius
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rc = i => [((i % 3) - 1) * R, (Math.floor(i / 3) - 1) * R];
const roomAt = (x, z) => clamp(Math.round(x / R), -1, 1) + 1 + (clamp(Math.round(z / R), -1, 1) + 1) * 3;
const $ = id => document.getElementById(id);
const GK = window.GK = window.GK || {};
GK.mode = 'menu';                         // 'menu' (title, settings, wheel) or 'play'
GK.settings = Object.assign({ sens: 1, fov: 75, scale: 1, invertY: false, tags: true, fx: true }, GK.settings || {});
const CS = 8;                             // chest room size
const WEAPONS = ['Rusty Sword', 'Battle Axe', 'War Spear', 'Spiked Mace', 'Short Bow', 'Dagger'];
// One chest room behind every outer wall: edge rooms get 1, corner rooms get 2 (12 in total)
const CHEST_ROOMS = [];
for (let i = 0; i < 9; i++) {
  if (i === 4) continue;
  const col = i % 3, row = Math.floor(i / 3), cx0 = (col - 1) * R, cz0 = (row - 1) * R, sides = [];
  if (row === 0) sides.push(['N', 0, -1]); if (col === 0) sides.push(['W', -1, 0]); if (col === 2) sides.push(['E', 1, 0]); if (row === 2) sides.push(['S', 0, 1]);
  for (const [side, dx, dz] of sides) CHEST_ROOMS.push({ id: CHEST_ROOMS.length, parent: i, side, dx, dz, cx: cx0 + dx * (R / 2 + CS / 2), cz: cz0 + dz * (R / 2 + CS / 2), wallX: cx0 + dx * R / 2, wallZ: cz0 + dz * R / 2 });
}
GK.CHEST_ROOMS = CHEST_ROOMS; GK.WEAPONS = WEAPONS;

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
const bumpTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {   // soft low-frequency mottling (trowel marks), wraps at the edges
    const x = Math.random() * w, y = Math.random() * h, r = 14 + Math.random() * 40, v = Math.random() < 0.5 ? 255 : 0;
    for (const [ox, oy] of [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(${v},${v},${v},.16)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
    }
  }
  speckle(g, w, h, 4000, 6, 0.5);
}, false);
// floor tile roughness (grout rough, tiles glossy with per-tile variation) and grout bump; same 2x2 layout as floorTex
const floorRoughTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, w, h);
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const v = 36 + Math.random() * 30; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(tx * 256 + 6, ty * 256 + 6, 250, 250);
    for (let i = 0; i < 26; i++) { const x = tx * 256 + 12 + Math.random() * 230, y = ty * 256 + 12 + Math.random() * 230, r = 10 + Math.random() * 38, gr = g.createRadialGradient(x, y, 0, x, y, r), a = 0.12 + Math.random() * 0.2; gr.addColorStop(0, `rgba(${Math.random() < 0.7 ? '150,150,150' : '10,10,10'},${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
  }
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(0, 253, w, 6); g.fillRect(253, 0, 6, h);
}, false);
const floorBumpTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, w, h); speckle(g, w, h, 2500, 3, 0.08);
  g.fillStyle = '#303030'; g.fillRect(0, 0, w, 5); g.fillRect(0, 0, 5, h); g.fillRect(0, 253, w, 5); g.fillRect(253, 0, 5, h);
}, false);
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
const plaster = M(0xffffff, { map: plasterTex, bumpMap: bumpTex, bumpScale: 0.9, roughness: 0.92, envMapIntensity: 0.3 });
const floorM = M(0xffffff, { map: floorTex, roughnessMap: floorRoughTex, bumpMap: floorBumpTex, bumpScale: 1.2, roughness: 1, envMapIntensity: 1.0 });
const ceilM = M(0xf4f4f1, { map: plasterTex, roughness: 0.95, emissive: 0xdedad2, emissiveIntensity: 0.55 });
const trimM = M(0xfafafa, { roughness: 0.45 });
const steelM = M(0xa9b6c6, { map: steelTex, metalness: 0.85, roughness: 0.42, envMapIntensity: 1 });
const vaultM = M(0x70787f, { map: steelTex, metalness: 0.9, roughness: 0.38, envMapIntensity: 1.1 });
const darkSteel = M(0x2a2e35, { metalness: 0.8, roughness: 0.45, envMapIntensity: 0.9 });
const hazardM = M(0xffffff, { map: hazardTex, roughness: 0.6 });
const glassM = new THREE.MeshStandardMaterial({ color: 0x07131c, roughness: 0.05, metalness: 0.2, emissive: 0x0b3a55, emissiveIntensity: 0.8 });
const panelM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e6).multiplyScalar(2.4), toneMapped: false });   // HDR so the bloom pass picks the ceiling panels up
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
  const d = { id: doors.length, open: false, kind, p: 0, gx: px, gz: pz, light, leaf: new THREE.Group(), wheels: [], bolts: [], blocker: null };
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
  wall(cx + R / 2, cz, Math.PI / 2, col < 2 ? (i === 4 || i + 1 === 4 ? 'vault' : 'secure') : 'secure');
  wall(cx, cz + R / 2, 0, row < 2 ? (i === 4 || i + 3 === 4 ? 'vault' : 'secure') : 'secure');
  if (col === 0) wall(cx - R / 2, cz, Math.PI / 2, 'secure');
  if (row === 0) wall(cx, cz - R / 2, 0, 'secure');
}
// static world never moves: freeze matrices so the per-frame scene graph update skips them
scene.updateMatrixWorld(true);
{
  const dyn = new Set(); doors.forEach(d => d.leaf.traverse(o => dyn.add(o)));
  scene.traverse(o => { if (o !== scene && !dyn.has(o) && !o.isLight) { o.matrixAutoUpdate = false; } });
}

// CHEST-BEGIN (chest rooms, chests, weapons: owned by the chest agent)
const tickers = GK.tickers = GK.tickers || [];
const chestDyn = new Set();               // objects that must keep matrixAutoUpdate (animated)
const chestSlots = [];                    // per chest room: {holder, glow, label, shaft, cur}
{
  const rnd = (() => { let s = 1234567; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const addGlow = (parent, color, size, op, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s;
  };
  // ----- textures and materials -----
  const woodTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6b4325'; g.fillRect(0, 0, w, h);
    for (let p = 0; p < 4; p++) {
      const y0 = p * 64; g.fillStyle = `hsl(${24 + rnd() * 6},${45 + rnd() * 10}%,${22 + rnd() * 8}%)`; g.fillRect(0, y0, w, 64);
      for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${rnd() < .5 ? '20,10,0' : '200,140,80'},${0.08 + rnd() * 0.18})`; g.lineWidth = 1; g.beginPath(); const y = y0 + rnd() * 64; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + rnd() * 4 - 2, w * .6, y + rnd() * 4 - 2, w, y + rnd() * 3 - 1.5); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, y0, w, 3); g.fillStyle = 'rgba(255,200,140,.18)'; g.fillRect(0, y0 + 3, w, 2);
      for (let k = 0; k < 2; k++) { g.fillStyle = 'rgba(20,10,0,.7)'; g.beginPath(); g.arc(rnd() * w, y0 + 14 + rnd() * 36, 3 + rnd() * 3, 0, 7); g.fill(); }
    }
  });
  const woodM = M(0xffffff, { map: woodTex, bumpMap: woodTex, bumpScale: 1.4, roughness: 0.78, envMapIntensity: 0.3, side: THREE.DoubleSide });
  const ironM = M(0x3a3d44, { metalness: 0.9, roughness: 0.4, envMapIntensity: 1 });
  const goldM = M(0xf4c24d, { metalness: 1, roughness: 0.26, envMapIntensity: 1.6, emissive: 0x6a3d00, emissiveIntensity: 0.5 });
  const coinM = M(0xffd35a, { metalness: 1, roughness: 0.22, envMapIntensity: 1.8, emissive: 0x8a5200, emissiveIntensity: 0.7 });
  const clothM = M(0x7a1018, { roughness: 0.95, side: THREE.DoubleSide, emissive: 0x2a0408, emissiveIntensity: 0.25 });
  const stoneTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a948a'; g.fillRect(0, 0, w, h); speckle(g, w, h, 3500, 6, 0.18);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
  const stoneM = M(0xffffff, { map: stoneTex, bumpMap: stoneTex, bumpScale: 1.5, roughness: 0.85, envMapIntensity: 0.3 });
  const cFloorTex = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#e9dcc0'; g.fillRect(0, 0, w, h);
    for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) {
      g.fillStyle = `rgba(${(tx + ty) & 1 ? '120,80,30' : '255,245,220'},${0.06 + rnd() * 0.07})`; g.fillRect(tx * 128, ty * 128, 128, 128);
      g.strokeStyle = 'rgba(90,60,20,.35)'; g.lineWidth = 2; g.strokeRect(tx * 128 + 1, ty * 128 + 1, 126, 126);
    }
    speckle(g, w, h, 5000, 6, 0.06);
    g.strokeStyle = '#d9a82b'; g.lineWidth = 10; g.strokeRect(46, 46, w - 92, h - 92); g.lineWidth = 3; g.strokeRect(70, 70, w - 140, h - 140);
    // rug
    const rx = 300, rw = w - 600, ry = 130, rh = h - 260;
    g.fillStyle = '#6e0f1a'; g.fillRect(rx, ry, rw, rh);
    g.strokeStyle = '#e4b53a'; g.lineWidth = 14; g.strokeRect(rx + 14, ry + 14, rw - 28, rh - 28);
    g.lineWidth = 4; g.strokeRect(rx + 40, ry + 40, rw - 80, rh - 80);
    g.fillStyle = '#e4b53a'; g.beginPath(); const cx = w / 2, cy = h / 2;
    g.moveTo(cx, cy - 150); g.lineTo(cx + 80, cy); g.lineTo(cx, cy + 150); g.lineTo(cx - 80, cy); g.fill();
    g.fillStyle = '#6e0f1a'; g.beginPath(); g.moveTo(cx, cy - 90); g.lineTo(cx + 46, cy); g.lineTo(cx, cy + 90); g.lineTo(cx - 46, cy); g.fill();
    for (let i = 0; i < 12; i++) { g.fillStyle = '#e4b53a'; g.fillRect(rx + 10 + i * (rw - 30) / 11, ry - 22, 8, 22); g.fillRect(rx + 10 + i * (rw - 30) / 11, ry + rh, 8, 22); }
  });
  const cFloorM = M(0xffffff, { map: cFloorTex, roughness: 0.32, envMapIntensity: 0.9 });
  const cWallM = M(0xffe6b8, { map: plasterTex, bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.9, envMapIntensity: 0.3, emissive: 0x2a1806, emissiveIntensity: 0.25 });
  const cCeilM = M(0xf2dfb8, { map: plasterTex, roughness: 0.95, emissive: 0xc8a064, emissiveIntensity: 0.6 });
  const cPanelM = new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false });
  const skirtM = M(0x4a2c18, { roughness: 0.6, envMapIntensity: 0.5 });
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffa030, toneMapped: false }), flame2M = new THREE.MeshBasicMaterial({ color: 0xfff0a8, toneMapped: false });
  const shaftTex = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,215,120,0)'); gr.addColorStop(0.7, 'rgba(255,200,90,.1)'); gr.addColorStop(1, 'rgba(255,225,140,.6)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const shaftM = new THREE.MeshBasicMaterial({ map: shaftTex, opacity: 0.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const gemCols = [0xe0203a, 0x20c860, 0x3a7bff, 0xb04cff, 0x30e0e0];
  const gemMs = gemCols.map(c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15, flatShading: true }));

  // half-round lid / band profile extruded along X
  function lidGeo(r, len, bevel) {
    const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI, false); s.lineTo(r, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: bevel, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 20 });
    g.rotateY(Math.PI / 2); g.translate(-len / 2, 0, 0); return g;
  }
  // ----- the chest -----
  const chestProto = new THREE.Group();
  {
    const g = chestProto;
    bx(g, 2.8, 0.18, 2.2, 0, 0.09, 0, stoneM, 1.2); bx(g, 2.5, 0.16, 1.9, 0, 0.26, 0, stoneM, 1.2);
    const body = bx(g, 1.5, 0.68, 0.9, 0, 0.34 + 0.34, 0, woodM, 1);
    body.position.y = 0.34 + 0.34;
    for (const sx of [-1, 1]) bx(g, 0.12, 0.7, 0.94, sx * 0.5, 0.68, 0, ironM, 1);
    bx(g, 1.54, 0.12, 0.94, 0, 0.45, 0, ironM, 1); bx(g, 1.54, 0.1, 0.94, 0, 0.98, 0, ironM, 1);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { bx(g, 0.2, 0.2, 0.2, sx * 0.72, 0.4, sz * 0.43, goldM, 1); bx(g, 0.2, 0.2, 0.2, sx * 0.72, 1.0, sz * 0.43, goldM, 1); }
    bx(g, 0.34, 0.3, 0.06, 0, 0.92, 0.48, goldM, 1); bx(g, 0.07, 0.14, 0.03, 0, 0.9, 0.52, ironM, 1);
    const hasp = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.02, 8, 16), goldM); hasp.position.set(0, 0.78, 0.5); g.add(hasp);
    for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), ironM); ring.position.set(sx * 0.78, 0.7, 0); ring.rotation.y = Math.PI / 2; g.add(ring); }
    // inside lining + treasure
    bx(g, 1.38, 0.04, 0.78, 0, 1.0, 0, clothM, 1);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), coinM); mound.scale.set(1.05, 0.55, 0.62); mound.position.set(0, 1.0, 0.0); g.add(mound);
    const coinG = new THREE.CylinderGeometry(0.075, 0.075, 0.016, 14), N = 90, im = new THREE.InstancedMesh(coinG, coinM, N), d = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * 0.62; const x = Math.cos(a) * rr * 1.05, z = Math.sin(a) * rr * 0.62;
      const hh = Math.sqrt(Math.max(0, 1 - rr * rr / 0.3844)) * 0.34; d.position.set(x, 1.0 + hh + 0.01, z); d.rotation.set(rnd() * 1.6 - 0.8, rnd() * 6, rnd() * 1.6 - 0.8); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
    }
    g.add(im);
    for (let i = 0; i < 9; i++) {
      const a = rnd() * 6.283, rr = 0.15 + rnd() * 0.45; const x = Math.cos(a) * rr * 1.0, z = Math.sin(a) * rr * 0.6, hh = Math.sqrt(Math.max(0, 1 - (rr / 0.62) ** 2)) * 0.34;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05 + rnd() * 0.04), gemMs[i % 5]); gem.scale.y = 1.3; gem.position.set(x, 1.0 + hh + 0.05, z); gem.rotation.set(rnd(), rnd() * 6, rnd()); g.add(gem);
    }
    for (let i = 0; i < 3; i++) { const ing = bx(g, 0.2, 0.07, 0.1, -0.5 + i * 0.18 + 0.1, 1.04, 0.3 - i * 0.05, goldM, 1); ing.rotation.y = rnd() - 0.5; }
    // spilled coins on the dais front
    for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(coinG, coinM); c.position.set(-0.7 + rnd() * 1.4, 0.36, 0.62 + rnd() * 0.3); c.rotation.set(rnd() * 0.3, rnd() * 6, rnd() * 0.3); g.add(c); }
    // open lid, hinged at the back top edge
    const hinge = new THREE.Group(); hinge.position.set(0, 1.0, -0.45); hinge.rotation.x = -1.95; g.add(hinge);
    const lid = new THREE.Mesh(lidGeo(0.45, 1.5, true), woodM);
    const lidWrap = new THREE.Group(); lidWrap.position.z = 0.45; hinge.add(lidWrap); lidWrap.add(lid);
    for (const sx of [-0.52, 0, 0.52]) { const b = new THREE.Mesh(lidGeo(0.47, 0.12, false), ironM); b.position.x = sx; lidWrap.add(b); }
    bx(hinge, 1.38, 0.03, 0.8, 0, 0.0, 0.45, clothM, 1);
  }
  // ----- weapons: built along +y, centred, ~1.2-1.5 long -----
  const bladeM = M(0xdfe5ec, { metalness: 0.95, roughness: 0.2, envMapIntensity: 1.8 });
  const rustTex = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#9a9aa0'; g.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(${130 + rnd() * 40 | 0},${60 + rnd() * 30 | 0},20,${0.25 + rnd() * 0.35})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 2 + rnd() * 9, 0, 7); g.fill(); } });
  const rustM = M(0xffffff, { map: rustTex, bumpMap: rustTex, bumpScale: 1, metalness: 0.7, roughness: 0.55, envMapIntensity: 1 });
  const leatherM = M(0x5a3220, { roughness: 0.8 });
  const hwoodM = M(0xffffff, { map: woodTex, roughness: 0.7, color: 0xcfa070 });
  const steel2 = M(0x8d96a3, { metalness: 0.95, roughness: 0.3, envMapIntensity: 1.6 });
  const spikeM = M(0x586070, { metalness: 0.95, roughness: 0.3, envMapIntensity: 1.5 });
  const red = M(0xa01820, { roughness: 0.8 });
  const cy2 = (p, r0, r1, len, mat, y, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, seg), mat); m.position.y = y; p.add(m); return m; };
  const cone = (p, r, len, mat, y, seg = 4, sx = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, seg), mat); m.position.y = y; m.scale.set(sx, 1, sz); p.add(m); return m; };
  const ball = (p, r, mat, y) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat); m.position.y = y; p.add(m); return m; };
  const blade2 = (p, w, len, th, mat, y) => { // flat blade with pointed tip
    const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, len); s.lineTo(0, len + w * 1.4); s.lineTo(w / 2, len); s.lineTo(w / 2, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelSize: th * 0.5, bevelThickness: th * 0.5, bevelSegments: 1 }); g.translate(0, 0, -th / 2);
    const m = new THREE.Mesh(g, mat); m.position.y = y; p.add(m); return m;
  };
  const wrap = (p, y0, y1, r, n) => { for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 14), red); t.rotation.x = Math.PI / 2; t.position.y = y0 + (y1 - y0) * i / (n - 1); p.add(t); } };
  const builders = [
    p => { // Rusty Sword
      blade2(p, 0.1, 0.78, 0.018, rustM, -0.1); bx(p, 0.012, 0.74, 0.03, 0, 0.28, 0, steel2, 1);
      bx(p, 0.44, 0.06, 0.08, 0, -0.12, 0, goldM, 1); ball(p, 0.04, goldM, -0.12).scale.set(1, .8, 1);
      cy2(p, 0.032, 0.032, 0.26, leatherM, -0.28); wrap(p, -0.4, -0.16, 0.033, 6); ball(p, 0.055, goldM, -0.43);
    },
    p => { // Battle Axe
      cy2(p, 0.03, 0.03, 1.4, hwoodM, 0, 10); cy2(p, 0.036, 0.036, 0.3, leatherM, -0.42); ball(p, 0.045, goldM, -0.72); cone(p, 0.03, 0.12, steel2, 0.74, 8);
      const s = new THREE.Shape(); s.moveTo(0, -0.2); s.bezierCurveTo(0.2, -0.28, 0.42, -0.42, 0.5, -0.38); s.bezierCurveTo(0.58, 0.0, 0.58, 0.0, 0.5, 0.38); s.bezierCurveTo(0.42, 0.42, 0.2, 0.28, 0, 0.2); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 14 }); g.translate(0, 0, -0.02);
      const h = new THREE.Mesh(g, bladeM); h.position.set(0.02, 0.45, 0); p.add(h);
      const h2 = new THREE.Mesh(g, bladeM); h2.position.set(-0.02, 0.45, 0); h2.scale.x = -0.55; p.add(h2);
      bx(p, 0.12, 0.2, 0.09, 0, 0.45, 0, ironM, 1); cone(p, 0.04, 0.18, steel2, 0.62, 6).rotation.z = 0; for (const y of [0.3, 0.6]) cy2(p, 0.04, 0.04, 0.04, goldM, y);
    },
    p => { // War Spear
      cy2(p, 0.025, 0.025, 1.9, hwoodM, 0, 10); cy2(p, 0.035, 0.035, 0.3, leatherM, -0.1);
      cone(p, 0.09, 0.5, bladeM, 1.2, 4, 1, 0.28).rotation.y = Math.PI / 4; cy2(p, 0.045, 0.03, 0.12, goldM, 0.92); cy2(p, 0.05, 0.05, 0.03, goldM, 0.86);
      cone(p, 0.03, 0.12, steel2, -0.98, 8).rotation.x = Math.PI; cy2(p, 0.04, 0.025, 0.2, red, 0.76);
    },
    p => { // Spiked Mace
      cy2(p, 0.028, 0.028, 1.0, hwoodM, -0.1, 10); cy2(p, 0.034, 0.034, 0.3, leatherM, -0.35); ball(p, 0.05, goldM, -0.6);
      cy2(p, 0.06, 0.06, 0.06, goldM, 0.28); const head = ball(p, 0.17, spikeM, 0.5);
      for (let i = 0; i < 16; i++) { const y = 1 - (i + 0.5) * 2 / 16, r = Math.sqrt(1 - y * y), a = i * 2.39996; const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
        const c = cone(p, 0.04, 0.17, spikeM, 0, 6); c.position.copy(d).multiplyScalar(0.2).add(new THREE.Vector3(0, 0.5, 0)); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); }
      const rg = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), goldM); rg.rotation.x = Math.PI / 2; rg.position.y = 0.5; p.add(rg);
    },
    p => { // Short Bow (+ arrow)
      const r = 0.62, arc = 2.3; const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.028, 8, 28, arc), hwoodM); t.rotation.z = -arc / 2 + 0; t.position.x = -r + 0.05; p.add(t);
      const ex = Math.cos(arc / 2) * r - r + 0.05, ey = Math.sin(arc / 2) * r;
      for (const s of [-1, 1]) { const tip = ball(p, 0.035, goldM, 0); tip.position.set(ex, s * ey, 0); }
      const sl = Math.hypot(0, 2 * ey); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2 * ey, 4), M(0xeee8d0, { roughness: 0.6 })); st.position.set(ex - 0.02, 0, 0); p.add(st);
      const gr = cy2(p, 0.04, 0.04, 0.25, leatherM, 0); gr.position.x = 0.05; wrap(p, -0.1, 0.1, 0.042, 5);
      p.children.slice(-5).forEach(w => w.position.x = 0.05);
      const ar = new THREE.Group(); ar.position.set(0.05, 0, 0.0); ar.rotation.z = 0; p.add(ar);
      const as = cy2(ar, 0.01, 0.01, 1.1, hwoodM, 0, 6); as.rotation.z = Math.PI / 2; as.position.x = -0.1; const at = cone(ar, 0.03, 0.1, steel2, 0, 4); at.rotation.z = -Math.PI / 2; at.position.x = 0.5;
      for (let i = 0; i < 3; i++) { const f = bx(ar, 0.12, 0.05, 0.004, -0.6 + i * 0.07, 0, 0, red, 1); f.rotation.x = i * 2.1; }
      p.rotation.z = 0;
    },
    p => { // Dagger
      blade2(p, 0.07, 0.34, 0.014, bladeM, -0.04); bx(p, 0.01, 0.34, 0.022, 0, 0.14, 0, steel2, 1);
      const gd = bx(p, 0.26, 0.04, 0.05, 0, -0.06, 0, goldM, 1); ball(p, 0.03, goldM, -0.06).scale.set(1, .8, 1);
      cy2(p, 0.026, 0.026, 0.18, leatherM, -0.17); wrap(p, -0.24, -0.1, 0.027, 5); ball(p, 0.04, goldM, -0.28);
      for (const s of [-1, 1]) { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), gemMs[0]); gem.position.set(s * 0.1, -0.06, 0.03); p.add(gem); }
    },
  ];
  const RARITY = [0xcfd8e0, 0xff5a4a, 0xc08bff, 0xff9a3c, 0x6aa8ff, 0x6dff8a];
  const WSCALE = [1.5, 1.25, 0.95, 1.55, 1.3, 2.4], WLIFT = [0, 0, 0, 0, 0, 0];
  const weaponProtos = [];
  const getWeapon = i => {
    if (!weaponProtos[i]) { const g = new THREE.Group(); builders[i](g); g.scale.setScalar(WSCALE[i]); const w = new THREE.Group(); w.add(g); weaponProtos[i] = w; }
    return weaponProtos[i];
  };
  const labelMats = [];
  const getLabel = i => labelMats[i] || (labelMats[i] = new THREE.SpriteMaterial({ map: textTex(WEAPONS[i], '#' + RARITY[i].toString(16).padStart(6, '0'), 'rgba(12,8,4,.55)', 512, 96, 'bold 54px system-ui'), transparent: true, depthWrite: false, fog: false }));

  // ----- chest rooms -----
  const CW = CS / 2, IN = CW - T / 2;
  const roomTick = [];
  for (const cr of CHEST_ROOMS) {
    const g = new THREE.Group(); g.position.set(cr.cx, 0, cr.cz); g.rotation.y = Math.atan2(-cr.dx, -cr.dz); scene.add(g);  // local +z faces the door
    bx(g, CS, 0.4, CS, 0, -0.2, 0, cFloorM, CS);
    ceilings.push(bx(g, CS + T, 0.3, CS + T, 0, H + 0.15, 0, cCeilM));
    for (const z of [-1.8, 1.4]) { ceilings.push(bx(g, 2.4, 0.05, 1.2, 0, H - 0.03, z, cPanelM), bx(g, 2.64, 0.04, 1.44, 0, H - 0.015, z, skirtM)); }
    const L = CS + T / 2;
    bx(g, CS + T, H, T, 0, H / 2, -CW, cWallM); bx(g, T, H, L, -CW, H / 2, -T / 4, cWallM); bx(g, T, H, L, CW, H / 2, -T / 4, cWallM);
    // skirting, gold band, cornice
    bx(g, 2 * IN, 0.28, 0.1, 0, 0.14, -IN + 0.05, skirtM); for (const s of [-1, 1]) bx(g, 0.1, 0.28, 2 * IN, s * (IN - 0.05), 0.14, 0, skirtM);
    bx(g, 2 * IN, 0.08, 0.05, 0, 1.3, -IN + 0.025, goldM); for (const s of [-1, 1]) bx(g, 0.05, 0.08, 2 * IN, s * (IN - 0.025), 1.3, 0, goldM);
    bx(g, 2 * IN, 0.2, 0.1, 0, H - 0.1, -IN + 0.05, skirtM); for (const s of [-1, 1]) bx(g, 0.1, 0.2, 2 * IN, s * (IN - 0.05), H - 0.1, 0, skirtM);
    // wall banners
    for (const bxp of [-2.6, 2.6]) { const b = bx(g, 0.9, 2.4, 0.04, bxp, 3.5, -IN + 0.03, clothM, 1); bx(g, 1.0, 0.07, 0.07, bxp, 4.74, -IN + 0.04, goldM, 1); const em = bx(g, 0.3, 0.3, 0.02, bxp, 3.6, -IN + 0.07, goldM, 1); em.rotation.z = Math.PI / 4; }
    // torches
    const flames = [];
    for (const [tx, tz, ry] of [[-1.3, -IN, 0], [1.3, -IN, 0], [-IN, 1.9, Math.PI / 2], [IN, 1.9, -Math.PI / 2], [-IN, -1.9, Math.PI / 2], [IN, -1.9, -Math.PI / 2]]) {
      const t = new THREE.Group(); t.position.set(tx, 2.7, tz); t.rotation.y = ry; g.add(t);       // local +z points into the room
      bx(t, 0.14, 0.14, 0.08, 0, 0, 0.04, ironM, 1); const arm = cy2(t, 0.025, 0.025, 0.3, ironM, 0); arm.rotation.x = Math.PI / 2; arm.position.z = 0.15;
      const cup = cy2(t, 0.1, 0.06, 0.16, ironM, 0.1, 10); cup.position.z = 0.3; const stick = cy2(t, 0.04, 0.04, 0.3, hwoodM, 0.25, 8); stick.position.z = 0.3;
      const f = cone(t, 0.09, 0.3, flameM, 0.5, 8); f.position.z = 0.3; const f2 = cone(t, 0.05, 0.2, flame2M, 0.46, 8); f2.position.z = 0.3;
      const gl = addGlow(t, 0xff8a2a, 2.6, 0.75, 0, 0.5, 0.35); flames.push({ f, f2, gl, ph: rnd() * 9 }); chestDyn.add(f); chestDyn.add(f2); chestDyn.add(gl);
    }
    // chest + dais, facing the door (+z local)
    const chest = chestProto.clone(); chest.position.set(0, 0, -1.2); g.add(chest);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb040, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, 0.8); chest.add(pool);
    const sh = new THREE.Group(); sh.position.set(0, 1.0, 0); chest.add(sh);
    for (let k = 0; k < 2; k++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.4), shaftM); pl.position.y = 1.7; pl.rotation.y = k * Math.PI / 2; pl.renderOrder = 3; sh.add(pl); }
    const glow = addGlow(chest, 0xffd060, 1.9, 0.6, 0, 1.2, 0); chestDyn.add(glow);
    const holder = new THREE.Group(); holder.position.set(0, 2.0, 0); chest.add(holder); chestDyn.add(holder);
    const wglow = addGlow(chest, 0xffffff, 1.8, 0.28, 0, 2.0, 0); chestDyn.add(wglow);
    const label = new THREE.Sprite(getLabel(0).clone()); label.scale.set(2.3, 0.43, 1); label.position.set(0, 3.75, 0); label.renderOrder = 5; chest.add(label); chestDyn.add(label); label.visible = false;
    chestSlots.push({ holder, glow, wglow, label, cur: -1, ph: cr.id * 1.7, base: 2.0, chest });
    roomTick.push(flames);
  }
  // static world: freeze matrices of everything we built except animated pieces
  scene.updateMatrixWorld(true);
  for (const s of chestSlots) s.chest.parent.traverse(o => { if (!chestDyn.has(o) && o.isMesh) { o.matrixAutoUpdate = false; o.updateMatrix(); } else if (!chestDyn.has(o) && !o.isSprite && !o.isLight) { o.updateMatrix(); } });
  for (const s of chestSlots) s.chest.parent.traverse(o => { if (!chestDyn.has(o) && o !== s.chest.parent) o.matrixAutoUpdate = false; });
  let lastT = -1;
  function animate() {
    const t = performance.now() / 1000; if (t === lastT) return; lastT = t;
    for (const s of chestSlots) {
      s.holder.position.y = s.base + Math.sin(t * 1.5 + s.ph) * 0.07; s.holder.rotation.y = t * 0.7 + s.ph; s.holder.updateMatrix(); s.holder.updateMatrixWorld(true);
      const k = 0.85 + 0.15 * Math.sin(t * 2.3 + s.ph); s.glow.material.opacity = 0.55 * k + 0.05;
    }
    for (const fl of roomTick) for (const q of fl) { const k = 1 + 0.12 * Math.sin(t * 17 + q.ph) + 0.08 * Math.sin(t * 29 + q.ph * 2); q.f.scale.set(k * 0.95, k, k * 0.95); q.f2.scale.set(k, 0.9 + (k - 1) * 2, k); q.gl.material.opacity = 0.62 + (k - 1) * 1.4; q.f.updateMatrix(); q.f2.updateMatrix(); }
  }
  tickers.push(animate);
  // drives the animation without frame(): a tiny always-drawn mesh whose onBeforeRender ticks everything
  const hook = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hook.position.set(0, -50, 0); hook.frustumCulled = false; hook.onBeforeRender = animate; scene.add(hook);
  hook.matrixAutoUpdate = false; hook.updateMatrix();
  function applyChestsImpl(weaponIdx) {
    if (!weaponIdx) return;
    chestSlots.forEach((s, i) => {
      const w = weaponIdx[i] | 0; if (s.cur === w || !(w >= 0 && w < WEAPONS.length)) return; s.cur = w;
      while (s.holder.children.length) s.holder.remove(s.holder.children[0]);
      const m = getWeapon(w).clone(); m.rotation.z = 0.35; s.holder.add(m);
      m.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); }); m.matrixAutoUpdate = true;
      s.wglow.material.color.setHex(RARITY[w]); s.label.material = getLabel(w); s.label.visible = true; s.holder.updateMatrixWorld(true);
    });
  }
  GK.applyChests = applyChestsImpl;
}
function applyChests(a) { GK.applyChests(a); }
// CHEST-END
// MAP-BEGIN (wall maps in the spawn rooms: owned by the map agent)
{
  const MW = 1024, MH = 740, MS = 13.2, MOX = 360, MOY = 372; // canvas size, px per metre, map origin (world 0,0)
  const mx = x => MOX + x * MS, my = z => MOY + z * MS;
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const chestIcon = (g, x, y, k) => { // gold chest, centred on x,y
    g.save(); g.translate(x, y); g.scale(k, k);
    g.fillStyle = '#7a4a12'; rr(g, -15, -4, 30, 18, 2); g.fill();
    g.fillStyle = '#c98a1c'; g.beginPath(); g.moveTo(-15, -4); g.lineTo(-15, -9); g.quadraticCurveTo(0, -20, 15, -9); g.lineTo(15, -4); g.closePath(); g.fill();
    g.fillStyle = '#ffd24a'; g.fillRect(-15, -5, 30, 4); g.fillRect(-2.5, -5, 5, 15);
    g.strokeStyle = '#3a2208'; g.lineWidth = 1.6; rr(g, -15, -4, 30, 18, 2); g.stroke();
    g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(0, 4, 2.6, 0, 7); g.fill(); g.restore();
  };
  const lockMark = (g, x, y, horiz, kind) => { // closed door; kind: undefined plain red lock, 'treasure' yellow bar, 'player' skull, 'vault' double red bar
    g.save(); g.translate(x, y);
    const L = DW * MS - 6, col = kind === 'treasure' ? '#ffd21a' : '#ff2a2a';
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8;
    const bar = (o, t) => { if (horiz) g.fillRect(o - t / 2, -L / 2, t, L); else g.fillRect(-L / 2, o - t / 2, L, t); };
    if (kind === 'vault') { bar(-6, 5); bar(6, 5); } else bar(0, kind === 'treasure' ? 9 : 8);
    g.shadowBlur = 0;
    if (kind === 'player') { // skull-ish mark: pale disc, dot eyes
      g.fillStyle = '#f4efe6'; g.strokeStyle = '#14080a'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 12, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#14080a'; g.beginPath(); g.arc(-4.5, -1.5, 3, 0, 7); g.fill(); g.beginPath(); g.arc(4.5, -1.5, 3, 0, 7); g.fill();
      g.fillRect(-3, 5, 1.8, 4); g.fillRect(1.2, 5, 1.8, 4);
    } else if (kind !== 'vault' && kind !== 'treasure') {
      g.fillStyle = '#14080a'; g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
      g.strokeStyle = '#ff5a4a'; g.lineWidth = 2.2; g.beginPath(); g.arc(0, -3, 4.2, Math.PI, 0); g.stroke();
      g.fillStyle = '#ff5a4a'; g.fillRect(-5.5, -2, 11, 8);
    } else {
      g.fillStyle = '#14080a'; g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill();
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(0, -2.5, 3.6, Math.PI, 0); g.stroke();
      g.fillStyle = col; g.fillRect(-4.5, -1.5, 9, 6.5);
    }
    g.restore();
  };
  const wallTab = (g, x, y, color, label, align) => { // wall-mounted sign symbol: pin arrow pointing at the wall (up) over a tab; x,y = pin tip on the wall line
    g.save(); g.translate(x, y); g.lineJoin = 'round';
    g.fillStyle = color; g.strokeStyle = '#06101a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6, 8); g.lineTo(-6, 8); g.closePath(); g.fill(); g.stroke();
    rr(g, -19, 8, 38, 16, 3); g.fill(); g.stroke();
    if (label) { g.font = 'bold 11px system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(label, 0, 16); }
    else { g.fillStyle = '#fff'; g.fillRect(-12, 13, 24, 2.5); g.fillRect(-12, 17.5, 24, 2.5); }
    g.restore();
  };
  const base = document.createElement('canvas'); base.width = MW; base.height = MH;
  {
    const g = base.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, MH); bg.addColorStop(0, '#0d1b2a'); bg.addColorStop(1, '#070d15');
    g.fillStyle = bg; g.fillRect(0, 0, MW, MH);
    g.strokeStyle = 'rgba(80,140,200,0.10)'; g.lineWidth = 1;
    for (let x = 0; x < MW; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, MH); g.stroke(); }
    for (let y = 0; y < MH; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(MW, y); g.stroke(); }
    g.fillStyle = '#e9f3ff'; g.font = 'bold 58px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = 'bold 58px system-ui, sans-serif'; g.fillText('FACILITY', 722, 50); g.fillText('MAP', 722, 108);
    g.fillStyle = '#4aa8ff'; g.fillRect(722, 144, 280, 5);
    // chest rooms
    for (const c of CHEST_ROOMS) {
      const x = mx(c.cx - CS / 2), y = my(c.cz - CS / 2), w = CS * MS;
      g.fillStyle = '#2b2410'; g.fillRect(x, y, w, w);
      g.strokeStyle = '#c9a23a'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, w - 3);
      chestIcon(g, x + w / 2 - c.dx * 3, y + w / 2 - c.dz * 3, 1.5);
    }
    // main rooms
    for (let i = 0; i < 9; i++) {
      const [cx, cz] = rc(i), x = mx(cx - R / 2), y = my(cz - R / 2), w = R * MS;
      g.fillStyle = i === 4 ? '#2a3442' : '#dfe8f2'; g.fillRect(x, y, w, w);
      g.strokeStyle = '#0a1018'; g.lineWidth = 5; g.strokeRect(x, y, w, w);
      if (i === 4) { // vault symbol
        const px = x + w / 2, py = y + w / 2;
        g.strokeStyle = '#9fb4cc'; g.lineWidth = 6; g.beginPath(); g.arc(px, py, 38, 0, 7); g.stroke();
        g.lineWidth = 4; g.beginPath(); g.arc(px, py, 10, 0, 7); g.stroke();
        for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; g.beginPath(); g.moveTo(px + Math.cos(t) * 12, py + Math.sin(t) * 12); g.lineTo(px + Math.cos(t) * 38, py + Math.sin(t) * 38); g.stroke(); }
        g.fillStyle = '#9fb4cc'; g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('VAULT', px, py + 62);
      }
    }
    // doors between rooms and to chest rooms (all closed)
    for (let i = 0; i < 9; i++) {
      const [cx, cz] = rc(i);
      if (i % 3 < 2) lockMark(g, mx(cx + R / 2), my(cz), true, (i === 4 || i + 1 === 4) ? 'vault' : 'player');
      if (i < 6) lockMark(g, mx(cx), my(cz + R / 2), false, (i === 4 || i + 3 === 4) ? 'vault' : 'player');
    }
    for (const c of CHEST_ROOMS) lockMark(g, mx(c.wallX), my(c.wallZ), c.dx !== 0, 'treasure');
    // legend
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = 'bold 36px system-ui, sans-serif'; g.fillStyle = '#e9f3ff';
    g.fillText('LEGEND', 722, 186);
    g.font = '600 32px system-ui, sans-serif';
    const row = (n, fn, t) => { const y = 236 + n * 46; fn(744, y); g.fillStyle = '#e9f3ff'; g.textAlign = 'left'; g.font = '600 32px system-ui, sans-serif'; g.fillText(t, 790, y + 1); };
    row(0, (x, y) => { g.fillStyle = '#d81818'; g.fillRect(x - 14, y - 14, 28, 28); g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.strokeRect(x - 14, y - 14, 28, 28); }, 'You are here');
    row(1, (x, y) => wallTab(g, x, y - 14, '#1b6fe0'), 'This map');
    row(2, (x, y) => wallTab(g, x, y - 14, '#f08a1c'), 'Door controls');
    row(3, (x, y) => chestIcon(g, x, y, 1.3), 'Chest');
    row(4, (x, y) => lockMark(g, x, y, false), 'Locked door');
    row(5, (x, y) => lockMark(g, x, y, false, 'treasure'), 'Treasure door');
    row(6, (x, y) => lockMark(g, x, y, false, 'player'), 'Player door');
    row(7, (x, y) => lockMark(g, x, y, false, 'vault'), 'Vault door');
    row(8, (x, y) => { g.fillStyle = '#dfe8f2'; g.fillRect(x - 14, y - 14, 28, 28); }, 'Room');
    row(9, (x, y) => { g.fillStyle = '#2a3442'; g.fillRect(x - 14, y - 14, 28, 28); g.strokeStyle = '#9fb4cc'; g.lineWidth = 2; g.strokeRect(x - 14, y - 14, 28, 28); }, 'Vault');
    g.fillStyle = '#7f95ad'; g.font = '24px system-ui, sans-serif'; g.fillText('All doors sealed', 722, 712);
  }
  const spawnRooms = [0, 1, 2, 3, 5, 6, 7, 8], panels = [];
  function drawMap(p) {
    const g = p.ctx, i = p.room, [cx, cz] = rc(i), x = mx(cx - R / 2), y = my(cz - R / 2), w = R * MS;
    const ph = 0.6;
    g.drawImage(base, 0, 0);
    g.save(); g.fillStyle = 'rgba(255,40,40,' + (0.16 + 0.16 * ph) + ')'; g.fillRect(x, y, w, w);
    g.shadowColor = '#ff2a2a'; g.shadowBlur = 14 + 14 * ph; g.strokeStyle = '#ff3030'; g.lineWidth = 7; g.strokeRect(x + 3, y + 3, w - 6, w - 6); g.restore();
    // label
    const lx = x + w / 2, ly = y + w / 2 + 6;
    g.save(); g.font = 'bold 25px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d81818'; rr(g, lx - 58, ly - 30, 116, 60, 9); g.fill();
    g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#fff'; g.fillText('YOU ARE', lx, ly - 12); g.fillText('HERE', lx, ly + 14); g.restore();
    // the two wall panels on this room's north wall: map at x-4.5 m, door controls at x+4.5 m (pin tips on the wall line)
    wallTab(g, lx - 4.5 * MS, y + 3, '#1b6fe0', 'MAP'); wallTab(g, lx + 4.5 * MS, y + 3, '#f08a1c', 'CTRL');
  }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    r.addColorStop(0, 'rgba(120,190,255,0.9)'); r.addColorStop(0.5, 'rgba(70,140,255,0.35)'); r.addColorStop(1, 'rgba(40,100,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.8 });
  const glowGeo = new THREE.PlaneGeometry(4.6, 3.6), backGeo = new THREE.BoxGeometry(2.6, 1.9, 0.06), screenGeo = new THREE.PlaneGeometry(2.5, 2.5 * MH / MW);
  const barH = new THREE.BoxGeometry(2.6, 0.05, 0.09), barV = new THREE.BoxGeometry(0.05, 1.8, 0.09);
  for (const i of spawnRooms) {
    const [cx, cz] = rc(i), px = cx - 4.5, py = 2.6, pz = cz - R / 2 + T / 2; // pz = wall face
    const grp = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); grp.add(m); return m; };
    const glow = add(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, toneMapped: false }), px, py, pz + 0.012);
    glow.renderOrder = 1;
    add(backGeo, frameMat, px, py, pz + 0.03);
    add(barH, frameMat, px, py + 0.925, pz + 0.045); add(barH, frameMat, px, py - 0.925, pz + 0.045);
    add(barV, frameMat, px - 1.275, py, pz + 0.045); add(barV, frameMat, px + 1.275, py, pz + 0.045);
    for (const sx of [-0.9, 0.9]) add(new THREE.BoxGeometry(0.12, 0.12, 0.03), frameMat, px + sx, py - 0.95 - 0.06, pz + 0.015); // wall brackets
    const cv = document.createElement('canvas'); cv.width = MW; cv.height = MH;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
    const p = { room: i, ctx: cv.getContext('2d'), tex, last: 0 };
    drawMap(p); tex.needsUpdate = true; panels.push(p);
    const scr = add(screenGeo, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0 }), px, py, pz + 0.076);
    scene.add(grp); grp.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; }); grp.updateMatrixWorld(true);
  }
}
// MAP-END
// PANEL-BEGIN (door control panels and round logic on the client: owned by the rounds agent)
// Door graph (ids = creation order of the wall loop; MUST match server.js), room keys: '0'..'8' grid rooms, 'c0'..'c11' chest rooms
const PDIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
const ROOM_DOORS = {}, DINFO = [];
const chestKeyOf = (i, side) => 'c' + CHEST_ROOMS.findIndex(c => c.parent === i && c.side === side);
{
  const add = (a, b, da, db) => { const id = DINFO.length; DINFO.push({ id, a, b, da, db, kind: a === '4' || b === '4' ? 'vault' : (a[0] === 'c' || b[0] === 'c') ? 'chest' : 'skull' }); (ROOM_DOORS[a] = ROOM_DOORS[a] || []).push(id); (ROOM_DOORS[b] = ROOM_DOORS[b] || []).push(id); };
  for (let i = 0; i < 9; i++) {
    const col = i % 3, row = Math.floor(i / 3), s = String(i);
    col < 2 ? add(s, String(i + 1), 'EAST', 'WEST') : add(s, chestKeyOf(i, 'E'), 'EAST', 'WEST');
    row < 2 ? add(s, String(i + 3), 'SOUTH', 'NORTH') : add(s, chestKeyOf(i, 'S'), 'SOUTH', 'NORTH');
    if (col === 0) add(s, chestKeyOf(i, 'W'), 'WEST', 'EAST');
    if (row === 0) add(s, chestKeyOf(i, 'N'), 'NORTH', 'SOUTH');
  }
  for (const k in ROOM_DOORS) ROOM_DOORS[k].sort((p, q) => { const f = id => PDIRS.indexOf(DINFO[id].a === k ? DINFO[id].da : DINFO[id].db); return f(p) - f(q); });
}
const roomKeyAt = (x, z) => {   // grid rooms inside +-18 m, chest rooms beyond
  const gi = v => clamp(Math.round(v / R), -1, 1) + 1;
  if (Math.abs(z) > 18) return chestKeyOf(gi(x) + (z < 0 ? 0 : 6), z < 0 ? 'N' : 'S');
  if (Math.abs(x) > 18) return chestKeyOf(gi(z) * 3 + (x < 0 ? 0 : 2), x < 0 ? 'W' : 'E');
  return String(gi(x) + 3 * gi(z));
};
const doorLabel = (key, id) => {
  const d = DINFO[id], mine = d.a === key, other = mine ? d.b : d.a, dir = mine ? d.da : d.db;
  const dest = other[0] === 'c' ? 'Treasure room' : other === '4' ? 'VAULT' : 'Room ' + (+other + 1);
  const k = doors[id] && ['chest', 'skull', 'vault'].includes(doors[id].kind) ? doors[id].kind : d.kind;
  return { dir, dest, kind: k };
};
const fmtT = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ----- round state (fed by applyRound; the local clock interpolates between server updates) -----
const RS = { n: 0, endAt: 0, dur: 0, sel: {}, open: [], selJ: '{}', openJ: '[]', flashed: 0, flashUntil: 0 };
const roundLeft = () => Math.max(0, RS.endAt - performance.now());
function applyRound(d) {
  const now = performance.now();
  if (d.round && Number.isFinite(d.round.n)) {
    if (RS.n > 0 && d.round.n > RS.n && RS.flashed !== RS.n) { RS.flashed = RS.n; RS.flashUntil = now + 2200; }
    RS.n = d.round.n; RS.endAt = now + (+d.round.left || 0); RS.dur = +d.round.dur || 0;
  }
  if (d.sel && typeof d.sel === 'object') { const j = JSON.stringify(d.sel); if (j !== RS.selJ) { RS.selJ = j; RS.sel = d.sel; panelsDirty(); } }
  if (Array.isArray(d.open)) { const j = JSON.stringify(d.open); if (j !== RS.openJ) { RS.openJ = j; RS.open = d.open; GK.setDoorsOpen(d.open); panelsDirty(); } }
}

// ----- control panels -----
const CP = {}, cpList = [];   // by room key
const cpGlowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  r.addColorStop(0, 'rgba(120,190,255,0.9)'); r.addColorStop(0.5, 'rgba(70,140,255,0.35)'); r.addColorStop(1, 'rgba(40,100,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const cpFrameMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.8 });
const cpGlowMat = new THREE.MeshBasicMaterial({ map: cpGlowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, toneMapped: false });
const CP_KIND = { chest: '#ffc83a', skull: '#ff6a55', vault: '#5fd0ff' };
const cpRR = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
function cpIcon(g, kind, cx, cy, r) {
  g.save(); g.translate(cx, cy);
  g.fillStyle = '#0a121c'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = CP_KIND[kind]; g.lineWidth = r * 0.12; g.beginPath(); g.arc(0, 0, r - r * 0.06, 0, 7); g.stroke();
  const k = r / 40;
  if (kind === 'chest') {
    g.fillStyle = '#8a5414'; cpRR(g, -22 * k, -6 * k, 44 * k, 26 * k, 3 * k); g.fill();
    g.fillStyle = '#d99a22'; g.beginPath(); g.moveTo(-22 * k, -6 * k); g.lineTo(-22 * k, -12 * k); g.quadraticCurveTo(0, -28 * k, 22 * k, -12 * k); g.lineTo(22 * k, -6 * k); g.closePath(); g.fill();
    g.fillStyle = '#ffd95a'; g.fillRect(-22 * k, -7 * k, 44 * k, 5 * k); g.fillRect(-3 * k, -7 * k, 6 * k, 22 * k);
    g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(0, 5 * k, 3.4 * k, 0, 7); g.fill();
  } else if (kind === 'skull') {
    g.fillStyle = '#f2ead8'; g.beginPath(); g.arc(0, -4 * k, 20 * k, 0, 7); g.fill(); cpRR(g, -12 * k, 6 * k, 24 * k, 18 * k, 4 * k); g.fill();
    g.fillStyle = '#0a121c'; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 8 * k, -4 * k, 5.5 * k, 0, 7); g.fill(); }
    g.beginPath(); g.moveTo(0, 2 * k); g.lineTo(-3 * k, 9 * k); g.lineTo(3 * k, 9 * k); g.fill();
    g.fillRect(-7 * k, 15 * k, 2 * k, 8 * k); g.fillRect(-1 * k, 15 * k, 2 * k, 8 * k); g.fillRect(5 * k, 15 * k, 2 * k, 8 * k);
  } else {
    g.strokeStyle = '#9fe0ff'; g.lineWidth = 4.5 * k; g.beginPath(); g.arc(0, 0, 21 * k, 0, 7); g.stroke();
    g.lineWidth = 3.5 * k; for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; g.beginPath(); g.moveTo(Math.cos(t) * 7 * k, Math.sin(t) * 7 * k); g.lineTo(Math.cos(t) * 21 * k, Math.sin(t) * 21 * k); g.stroke(); }
    g.fillStyle = '#9fe0ff'; g.beginPath(); g.arc(0, 0, 6 * k, 0, 7); g.fill();
  }
  g.restore();
}
function cpLayout(p) {
  const n = p.ids.length, W = p.W, H = p.H, top = 92, bottom = H - 16, gap = 10;
  const rowH = Math.min(n === 1 ? 210 : 118, (bottom - top - gap * (n - 1)) / Math.max(1, n));
  const total = rowH * n + gap * (n - 1), y0 = n === 1 ? top + (bottom - top - total) / 2 : top;
  p.buttons = p.ids.map((id, i) => ({ id, x: 18, y: y0 + i * (rowH + gap), w: W - 36, h: rowH }));
}
function cpDraw(p) {
  const g = p.ctx, W = p.W, H = p.H, selSet = new Set(Object.values(RS.sel)), openSet = new Set(RS.open);
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0d1b2a'); bg.addColorStop(1, '#070d15');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(80,140,200,0.10)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#e9f3ff'; g.font = 'bold 40px system-ui, sans-serif'; g.fillText('DOOR CONTROL', 24, 38);
  g.textAlign = 'right'; g.fillStyle = '#7fb4e8'; g.font = '600 26px system-ui, sans-serif';
  g.fillText(p.key[0] === 'c' ? 'TREASURE ROOM' : p.key === '4' ? 'VAULT' : 'ROOM ' + (+p.key + 1), W - 24, 40);
  g.fillStyle = '#4aa8ff'; g.fillRect(24, 70, W - 48, 4);
  p.buttons.forEach((b, i) => {
    const L = doorLabel(p.key, b.id), sel = selSet.has(b.id), opn = openSet.has(b.id), hov = p.hover === i;
    g.save();
    if (sel) { g.shadowColor = '#ffd24a'; g.shadowBlur = 22; g.fillStyle = hov ? '#ffe27a' : '#ffcf3a'; }
    else g.fillStyle = hov ? '#21456f' : opn ? '#0f3a24' : '#13243a';
    cpRR(g, b.x, b.y, b.w, b.h, 14); g.fill(); g.shadowBlur = 0;
    g.lineWidth = sel ? 5 : hov ? 5 : 3; g.strokeStyle = sel ? '#fff6cf' : hov ? '#9fd8ff' : opn ? '#3aff80' : '#2f5e8f'; g.stroke(); g.restore();
    const r = Math.min(b.h * 0.38, 46), ix = b.x + 16 + r, iy = b.y + b.h / 2;
    cpIcon(g, L.kind, ix, iy, r);
    const tx = ix + r + 18, tw = b.x + b.w - 16 - tx - (opn ? 96 : 0), dark = sel;
    let fs = Math.min(40, b.h * 0.34); const text = L.dir + ' · ' + L.dest;
    g.textAlign = 'left'; g.font = '800 ' + fs + 'px system-ui, sans-serif';
    while (g.measureText(text).width > tw && fs > 18) { fs -= 2; g.font = '800 ' + fs + 'px system-ui, sans-serif'; }
    g.fillStyle = dark ? '#1a1204' : '#f1f7ff'; g.fillText(text, tx, iy - fs * 0.42);
    g.font = '700 ' + Math.min(26, b.h * 0.22) + 'px system-ui, sans-serif';
    g.fillStyle = sel ? '#7a1200' : opn ? '#6dff9f' : hov ? '#cfe8ff' : '#7fa4cc';
    g.fillText(sel ? 'SELECTED · OPENS AT 0:00' : opn ? 'OPEN THIS ROUND' : 'Click to select', tx, iy + fs * 0.72);
    if (opn) { g.fillStyle = '#18c25e'; cpRR(g, b.x + b.w - 100, iy - 20, 84, 40, 20); g.fill(); g.fillStyle = '#04200f'; g.textAlign = 'center'; g.font = '800 24px system-ui, sans-serif'; g.fillText('OPEN', b.x + b.w - 58, iy + 1); }
  });
  p.tex.needsUpdate = true; p.dirty = false;
}
function cpBuild(key, parent, w, h, x, y, z, rotY) {   // framed emissive screen, same look as the facility map
  const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = rotY; parent.add(grp);
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); grp.add(m); return m; };
  add(new THREE.PlaneGeometry(w * 1.77, h * 1.89), cpGlowMat, 0, 0, 0.012).renderOrder = 1;
  add(new THREE.BoxGeometry(w, h, 0.06), cpFrameMat, 0, 0, 0.03);
  const bh = new THREE.BoxGeometry(w, 0.05, 0.09), bv = new THREE.BoxGeometry(0.05, h - 0.1, 0.09);
  add(bh, cpFrameMat, 0, h / 2 - 0.025, 0.045); add(bh, cpFrameMat, 0, -h / 2 + 0.025, 0.045);
  add(bv, cpFrameMat, -w / 2 + 0.025, 0, 0.045); add(bv, cpFrameMat, w / 2 - 0.025, 0, 0.045);
  for (const sx of [-0.9, 0.9]) if (Math.abs(sx) < w / 2 - 0.2) add(new THREE.BoxGeometry(0.12, 0.12, 0.03), cpFrameMat, sx, -h / 2 - 0.06, 0.015);
  const W = Math.round((w - 0.1) * 320), H = Math.round((h - 0.1) * 320);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const scr = add(new THREE.PlaneGeometry(w - 0.1, h - 0.1), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0 }), 0, 0, 0.076);
  const p = { key, ids: ROOM_DOORS[key], W, H, ctx: cv.getContext('2d'), tex, screen: scr, hover: -1, dirty: false, buttons: [] };
  cpLayout(p); cpDraw(p); CP[key] = p; cpList.push(p);
  return grp;
}
function panelsDirty() { for (const p of cpList) p.dirty = true; }
for (let i = 0; i < 9; i++) {   // grid rooms: north wall, mirrored against the facility map (x = centre + 4.5)
  const [cx, cz] = rc(i); cpBuild(String(i), scene, 2.6, 1.9, cx + 4.5, 2.6, cz - R / 2 + T / 2, 0);
}
for (const cr of CHEST_ROOMS) {   // chest rooms: 2 m panel on the room's left wall (the far wall is taken by banners and torches)
  const g = new THREE.Group(); g.position.set(cr.cx, 0, cr.cz); g.rotation.y = Math.atan2(-cr.dx, -cr.dz); scene.add(g);
  cpBuild('c' + cr.id, g, 2.0, 1.9, -(CS / 2 - T / 2), 2.6, 0, Math.PI / 2);
}
scene.updateMatrixWorld(true);
for (const p of cpList) { const g = p.screen.parent; g.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; }); g.updateMatrixWorld(true); }

// ----- aiming, clicking, HUD -----
const cpRay = new THREE.Raycaster(), cpV0 = new THREE.Vector2(0, 0);
let cpAim = null;   // { p, i }
cpRay.far = 7;
function cpComputeAim() {
  if (GK.mode !== 'play' || !inside) return null;
  const p = CP[roomKeyAt(P.x, P.z)]; if (!p) return null;
  cam.updateMatrixWorld(); cpRay.setFromCamera(cpV0, cam);
  const h = cpRay.intersectObject(p.screen, false)[0]; if (!h || !h.uv) return null;
  const x = h.uv.x * p.W, y = (1 - h.uv.y) * p.H;
  const i = p.buttons.findIndex(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  return i < 0 ? null : { p, i };
}
const dotEl = $('dot');
if (dotEl) dotEl.style.transition = 'transform .12s, background .12s, opacity .12s';
function panelTick() {
  const a = cpComputeAim();
  for (const p of cpList) { const hv = a && a.p === p ? a.i : -1; if (hv !== p.hover) { p.hover = hv; p.dirty = true; } }
  cpAim = a;
  if (dotEl) { dotEl.style.transform = a ? 'scale(3)' : ''; dotEl.style.background = a ? '#ffd24a' : ''; dotEl.style.opacity = a ? '1' : ''; }
  const cur = CP[roomKeyAt(P.x, P.z)];   // redraw dirty panels: the one in front of us first, one other per frame
  if (cur && cur.dirty) cpDraw(cur); else { const o = cpList.find(q => q.dirty); if (o) cpDraw(o); }
}
renderer.domElement.addEventListener('click', () => {
  const a = cpComputeAim(); if (!a) return;
  net.send({ sel: a.p.buttons[a.i].id });
});
GK.panelClick = (room, idx) => { const ids = ROOM_DOORS[String(room)]; if (ids && ids[idx] !== undefined) net.send({ sel: ids[idx] }); };   // test helper: same message as a click
GK.roundInfo = () => ({ n: RS.n, left: roundLeft(), dur: RS.dur, sel: RS.sel, open: RS.open });
GK.ROOM_DOORS = ROOM_DOORS; GK.roomKeyAt = roomKeyAt;

{
  const css = document.createElement('style');
  css.textContent = '#roundHud{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;display:none}' +
    '#roundHud .t{display:inline-block;padding:6px 26px 8px;border-radius:14px;background:rgba(8,14,24,.72);border:2px solid rgba(120,180,255,.55);color:#f2f8ff;font-weight:800;font-size:clamp(26px,4.4vw,46px);letter-spacing:.06em;font-variant-numeric:tabular-nums;text-shadow:0 2px 8px #000;box-shadow:0 4px 24px rgba(0,0,0,.5)}' +
    '#roundHud .t.warn{color:#ff4343;border-color:#ff4343;background:rgba(40,6,6,.78);animation:rhPulse .5s ease-in-out infinite alternate}' +
    '#roundHud .b{margin-top:10px;font-weight:900;font-size:clamp(28px,5.5vw,60px);letter-spacing:.14em;color:#ffd24a;text-shadow:0 0 18px #ff9a00,0 3px 10px #000;animation:rhBanner 2.2s ease-out forwards;display:none}' +
    '@keyframes rhPulse{from{transform:scale(1)}to{transform:scale(1.14)}}@keyframes rhBanner{0%{opacity:0;transform:scale(.7)}12%{opacity:1;transform:scale(1.08)}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}';
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'roundHud'; hud.innerHTML = '<div class="t"></div><div class="b">DOORS OPENING</div>';
  document.body.appendChild(hud);
  const tEl = hud.firstChild, bEl = hud.lastChild; let shownBanner = 0, lastTxt = '', lastWarn = null;
  setInterval(() => {
    const show = GK.mode === 'play' && RS.n > 0; hud.style.display = show ? 'block' : 'none'; if (!show) return;
    const left = roundLeft(), now = performance.now();
    if (left <= 0 && RS.flashed !== RS.n) { RS.flashed = RS.n; RS.flashUntil = now + 2200; }
    const txt = 'ROUND ' + RS.n + '  ' + fmtT(left), warn = left <= 5000;
    if (txt !== lastTxt) { tEl.textContent = txt; lastTxt = txt; }
    if (warn !== lastWarn) { tEl.classList.toggle('warn', warn); lastWarn = warn; }
    if (now < RS.flashUntil) { if (shownBanner !== RS.flashUntil) { shownBanner = RS.flashUntil; bEl.style.display = 'none'; void bEl.offsetWidth; bEl.style.display = 'block'; } }
    else if (shownBanner) { shownBanner = 0; bEl.style.display = 'none'; }
  }, 100);
}
// PANEL-END

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
    ws.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (err) { return; } net.onmessage && net.onmessage(d); };
    ws.onclose = () => { const m = document.getElementById('me'); if (m) m.textContent = 'Disconnected - reload to rejoin'; };
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
  // same round machine as server.js, run locally: 30 s first round, 45 s after; bots pick a door in their room each round
  const rs = { n: 1, dur: 30000, endsAt: performance.now() + 30000, sel: {}, open: [] };
  const rmsg = () => ({ round: { n: rs.n, left: Math.max(0, rs.endsAt - performance.now()), dur: rs.dur }, sel: { ...rs.sel }, open: rs.open.slice() });
  const emitRound = () => net.onmessage && net.onmessage(rmsg());
  const botPlan = () => { for (const b of list) if (b.bot) b.selAt = performance.now() + 1500 + Math.random() * (rs.dur - 6000); };
  const net = {
    onmessage: null,
    send(m) {
      if (Number.isInteger(m.sel) && meP) { const k = roomKeyAt(meP.x, meP.z); if ((ROOM_DOORS[k] || []).includes(m.sel) && rs.sel[k] !== m.sel) { rs.sel[k] = m.sel; emitRound(); } }
      if (m.m && meP) { [meP.x, meP.z, meP.yaw] = m.m; meP.box = roomAt(meP.x, meP.z); } if (m.reroll) { const o = list.indexOf(meP); seq++; meP = mk(false); meP.id = list[o].id; list[o] = meP; } },
  };
  meP = mk(false); list = [meP, mk(true), mk(true), mk(true), mk(true)];
  setTimeout(() => { net.onmessage && net.onmessage({ you: meP.id, chests: Array.from({ length: CHEST_ROOMS.length }, () => Math.floor(Math.random() * WEAPONS.length)), ...rmsg() }); emit(); }, 50);
  botPlan();
  setInterval(() => {
    const now = performance.now();
    if (now >= rs.endsAt) { rs.open = [...new Set(Object.values(rs.sel))]; rs.sel = {}; rs.n++; rs.dur = 45000; rs.endsAt = now + rs.dur; botPlan(); emitRound(); return; }
    for (const b of list) if (b.bot && b.selAt && now >= b.selAt) { b.selAt = 0; const k = roomKeyAt(b.x, b.z), ids = ROOM_DOORS[k]; if (ids && rs.sel[k] === undefined) { rs.sel[k] = ids[Math.floor(Math.random() * ids.length)]; emitRound(); } }
  }, 200);
  setInterval(emitRound, 1000);
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
function dropGoblin(g) { // free GPU memory of a removed goblin (shared geometry/materials re-upload lazily if reused)
  scene.remove(g);
  const lm = g.userData.label && g.userData.label.material.map; if (lm) lm.dispose();
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); [].concat(o.material || []).forEach(m => m.dispose()); });
}
let netReal = null;
const net = { send: m => netReal && netReal.send(m) };
const actors = new Map();
let me = 0, spawned = false;
const P = { x: 0, z: 0, yaw: 0, pitch: 0, speed: 0 };
const handleMsg = d => {
  if (d.chests) applyChests(d.chests);
  if (d.you) me = d.you;
  if (d.round || d.sel || d.open) applyRound(d);
  if (!d.players) return;
  const ids = new Set(d.players.map(p => p.id));
  for (const [id, a] of actors) if (!ids.has(id)) { dropGoblin(a.group); actors.delete(id); }
  for (const p of d.players) {
    let a = actors.get(p.id);
    if (a && a.goblin !== p.goblin) { dropGoblin(a.group); actors.delete(p.id); a = null; }
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
  if (mine) showStats(d.players.find(p => p.id === me), mine.goblin);
  $('cnt').textContent = 'Goblin King  ·  ' + actors.size + ' online';
  if (mine && !assigned) { assigned = true; GK.onAssigned && GK.onAssigned(mine.goblin); }
};
let assigned = false;
let statsEl = null;
function showStats(p, type) {   // small stat panel, bottom-left
  if (!statsEl) {
    statsEl = document.createElement('div');
    statsEl.style.cssText = 'position:fixed;left:2vw;bottom:2.5vh;min-width:190px;padding:10px 14px;border-radius:10px;background:rgba(10,10,16,.62);border:1px solid rgba(255,215,94,.35);color:#f2efe6;font:600 14px/1.5 system-ui,sans-serif;pointer-events:none;display:none;text-shadow:0 1px 4px #000';
    document.body.appendChild(statsEl);
  }
  const st = Object.assign({}, STATS[type], p && p.stats);
  const max = st.maxHealth || st.health, pct = Math.max(0, Math.min(100, 100 * st.health / max));
  statsEl.innerHTML = '<div style="color:#ffd75e;letter-spacing:.06em;margin-bottom:4px">' + NAMES[type].toUpperCase() + '</div>'
    + '<div style="display:flex;justify-content:space-between"><span>Health</span><span>' + st.health + ' / ' + max + '</span></div>'
    + '<div style="height:6px;border-radius:3px;background:#2a2a34;margin:2px 0 6px"><div style="height:100%;width:' + pct + '%;border-radius:3px;background:linear-gradient(90deg,#c0392b,#e8564a)"></div></div>'
    + '<div style="display:flex;justify-content:space-between"><span>Attack</span><span>' + st.attack + '</span></div>'
    + '<div style="display:flex;justify-content:space-between"><span>Knowledge</span><span>' + st.knowledge + '</span></div>';
  statsEl.style.display = GK.mode === 'play' ? 'block' : 'none';
}
GK.showStats = () => { if (statsEl) statsEl.style.display = GK.mode === 'play' ? 'block' : 'none'; };
function connect() { if (netReal) return; netReal = makeNet(); netReal.onmessage = handleMsg; }
if (window.GK_OFFLINE) { $('rr').onclick = e => { net.send({ reroll: 1 }); e.stopPropagation(); }; $('rr').onpointerdown = e => e.stopPropagation(); }

// ---------- input ----------
const keys = new Set(); let inside = true, drag = false;
addEventListener('keydown', e => { keys.add(e.code); if (e.code === 'KeyV' && !e.repeat) inside = !inside; });
document.addEventListener('visibilitychange', () => keys.clear());
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = renderer.domElement;
const lockOk = () => document.pointerLockElement === canvas;

canvas.addEventListener('click', () => { if (!lockOk()) try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); } catch (e) {} });
canvas.addEventListener('mousedown', () => drag = true); addEventListener('mouseup', () => drag = false);
addEventListener('mousemove', e => {
  if (!lockOk() && !drag) return;
  const k = 0.0022 * GK.settings.sens; P.yaw = wrapPi(P.yaw - e.movementX * k); P.pitch = clamp(P.pitch - e.movementY * k * (GK.settings.invertY ? -1 : 1), -1.45, 1.45);
});
// FX-BEGIN (post-processing, dust motes, light shafts, screen pulse: owned by the graphics agent)
let fx = null;   // { composer, bloom, grain } once the addons have loaded
const fxMat = { uTime: { value: 0 }, uHeight: { value: 600 } };
function fxResize() {
  const pr = renderer.getPixelRatio(); fxMat.uHeight.value = innerHeight * pr;
  if (fx) { fx.composer.setPixelRatio(pr); fx.composer.setSize(innerWidth, innerHeight); }
}
(async () => {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/ShaderPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
    const pr = renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });   // MSAA kept inside the composer
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.32, 0.55, 1.35);   // strength, radius, threshold (HDR, linear)
    const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(Math.max(1, w >> 1), Math.max(1, h >> 1));   // bloom at half resolution
    composer.addPass(bloom);
    composer.addPass(new OutputPass());   // tone mapping + sRGB
    const grain = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec2 o = d * r2 * 0.014;   // tiny chromatic aberration, zero at the centre
          vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
          c *= 1.0 - 0.34 * smoothstep(0.12, 0.62, r2);   // vignette
          c += (hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5) * 0.022;   // film grain
          gl_FragColor = vec4(c, 1.0);
        }`
    });
    composer.addPass(grain);
    fx = { composer, bloom, grain }; fxResize();
  } catch (e) { console.warn('post effects unavailable, using plain rendering', e); fx = null; }
})();
function renderWorld(t) {
  fxMat.uTime.value = t;
  for (const s of fxScreens) s.m.emissiveIntensity = s.base * (0.82 + 0.18 * Math.sin(t * 2.1 + s.ph));
  if (fx && GK.settings.fx) { fx.grain.uniforms.uTime.value = t; fx.composer.render(); }
  else renderer.render(scene, cam);
}
// keypad screens and other status displays pulse gently (found by their material signature, the builders stay untouched)
const fxScreens = [];
scene.traverse(o => { const m = o.isMesh && o.material; if (m && m.isMeshStandardMaterial && m.color.getHex() === 0x103020 && m.emissiveIntensity === 1.4) fxScreens.push({ m, base: 1.4, ph: Math.random() * 6.28 }); });
// floating dust motes (one Points object, animated entirely in the vertex shader) and soft light shafts (one merged mesh)
{
  const pos = [], seed = [], col = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const addMotes = (cx, cz, half, n, c) => { for (let i = 0; i < n; i++) { pos.push(cx + rnd(-half, half), 0, cz + rnd(-half, half)); seed.push(Math.random(), rnd(0.4, 1), rnd(0.025, 0.06), Math.random()); col.push(...c); } };
  for (let i = 0; i < 9; i++) { const [cx, cz] = rc(i); addMotes(cx, cz, 5, 38, [0.62, 0.6, 0.58]); }
  for (const cr of CHEST_ROOMS) addMotes(cr.cx, cr.cz, 3, 11, [1.0, 0.82, 0.5]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4)); geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: fxMat, transparent: true, depthWrite: false,
    vertexShader: `attribute vec4 aSeed; attribute vec3 aCol; uniform float uTime; uniform float uHeight; varying vec3 vCol; varying float vA;
      void main(){
        float t = uTime * (0.4 + aSeed.y * 0.5); vec3 p = position;
        p.x += sin(t * 0.7 + aSeed.x * 6.283) * 0.7 + sin(t * 0.37 + aSeed.w * 9.0) * 0.35;
        p.z += cos(t * 0.6 + aSeed.w * 6.283) * 0.7 + cos(t * 0.31 + aSeed.x * 7.0) * 0.35;
        float hy = fract(aSeed.x + uTime * 0.006 * (0.4 + aSeed.y)); p.y = 0.4 + hy * 5.4 + sin(t + aSeed.w * 5.0) * 0.12;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSeed.z * projectionMatrix[1][1] * uHeight * 0.5 / max(-mv.z, 0.1), 1.5, 22.0);
        vCol = aCol; vA = smoothstep(0.0, 0.12, hy) * smoothstep(1.0, 0.88, hy) * smoothstep(0.4, 1.6, -mv.z) * 0.5;
      }`,
    fragmentShader: `varying vec3 vCol; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = (1.0 - smoothstep(0.0, 1.0, d)); gl_FragColor = vec4(vCol, a * a * vA);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const motes = new THREE.Points(geo, mat); motes.frustumCulled = false; motes.renderOrder = 4; motes.matrixAutoUpdate = false; scene.add(motes);
  // light shafts: open tapered tubes under the ceiling panels, soft gradient alpha, one draw call
  const sp = [], su = [], si = [];
  const addShaft = (cx, cz, rot, ox, oz, w, d) => {   // panel centre (ox, oz) local to the room, rotated by rot about Y
    const cs = Math.cos(rot), sn = Math.sin(rot), top = H - 0.06, bot = 0.1, grow = 1.5;
    const corner = (sx, sz, k) => { const lx = ox + sx * w / 2 * k, lz = oz + sz * d / 2 * k; return [cx + lx * cs + lz * sn, -lx * sn + lz * cs + cz]; };
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) {
      const a = ring[i], b = ring[(i + 1) % 4], base = sp.length / 3;
      const [ax, az] = corner(a[0], a[1], 1), [bx2, bz] = corner(b[0], b[1], 1), [ax2, az2] = corner(a[0], a[1], grow), [bx3, bz3] = corner(b[0], b[1], grow);
      sp.push(ax, top, az, bx2, top, bz, ax2, bot, az2, bx3, bot, bz3); su.push(0, 1, 1, 1, 0, 0, 1, 0); si.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  };
  for (const [ox, oz] of [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8]]) addShaft(0, 0, 0, ox, oz, 2.6, 1.2);
  for (const cr of CHEST_ROOMS) for (const z of [-1.8, 1.4]) addShaft(cr.cx, cr.cz, Math.atan2(-cr.dx, -cr.dz), 0, z, 2.1, 1.0);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si);
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d'), img = g.createImageData(32, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) { const v = 1 - y / 63, u = Math.sin(Math.PI * (x + 0.5) / 32), a = Math.pow(v, 1.7) * Math.pow(u, 0.8); const k = (y * 32 + x) * 4; img.data[k] = 255; img.data[k + 1] = 236; img.data[k + 2] = 200; img.data[k + 3] = Math.round(a * 255); }
  g.putImageData(img, 0, 0);
  const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
  const shafts = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  shafts.frustumCulled = false; shafts.renderOrder = 2; shafts.matrixAutoUpdate = false; scene.add(shafts);
}
// FX-END
let orbit = 0.4;
function resize() { renderer.setSize(innerWidth, innerHeight); fxResize(); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
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
  const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now; const t = now / 1000;
  if (GK.mode !== 'play') { GK.menu && GK.menu.render(now, dt); requestAnimationFrame(frame); return; }
  panelTick();
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
    const near = d.open;   // doors open/close from the round state (GK.setDoorsOpen)
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
    d.light.emissiveIntensity = moving ? 1.5 + Math.sin(t * 14) : 2 + 0.4 * Math.sin(t * 2.4 + d.light.id);
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
    u.label.visible = id !== me && GK.settings.tags;
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
    cam.fov = GK.settings.fov; cam.position.set(P.x, eye + Math.sin(mine.phase) * 0.035 * clamp(P.speed / 3.5, 0, 1), P.z);
    cam.rotation.set(P.pitch, P.yaw, 0);
  } else {
    if (!inside) orbit += dt * 0.05;
    const dist = innerHeight > innerWidth ? 60 : 44;
    cam.fov = 50; cam.position.set(Math.sin(orbit) * dist, dist * 0.7, Math.cos(orbit) * dist); cam.lookAt(0, 0, 0);
  }
  cam.updateProjectionMatrix();
  renderWorld(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const lockNow = () => { try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => {}); } catch (e) {} };
GK.renderer = renderer; GK.scene = scene; GK.build = buildGoblin; GK.NAMES = NAMES; GK.SCALE = SCALE; GK.glowTex = glowTex; GK.textTex = textTex;
GK.start = () => { connect(); return new Promise(res => { if (assigned) res(actors.get(me).goblin); else { const prev = GK.onAssigned; GK.onAssigned = g => { GK.onAssigned = prev; res(g); }; } }); }; // connects and resolves with my goblin type
GK.enter = () => { GK.mode = 'play'; GK.showStats(); GK.applySettings(); if (window.GK_OFFLINE) $('rr').style.display = 'block'; lockNow(); };   // call from a click
GK.applySettings = () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * GK.settings.scale); resize(); };
GK.doors = doors;
GK.setDoorsOpen = ids => { const set = new Set(ids); doors.forEach(d => d.open = set.has(d.id)); };   // ids of doors that are open right now
GK.skipMenu = () => { connect(); GK.mode = 'play'; };   // for tests
window.__gk = { P, actors, doors, info: renderer.info, scene, setView(x, z, yaw, pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch || 0; spawned = true; }, toggleOverview() { inside = !inside; }, build: buildGoblin };
})();

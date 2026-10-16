// Goblin King client. Needs a global THREE (r158+). Set window.GK_OFFLINE = true to run with simulated players.
if (/[?&]offline=1/.test(location.search)) window.GK_OFFLINE = true;   // demo/test: simulated players, no server
(() => {
const THREE = window.THREE;
const NAMES = ['Small Goblin', 'Goblin', 'Big Goblin', 'Goblin Wizard', 'GOBLIN KING'];
const SCALE = [0.75, 1, 1.3, 1.1, 1.2];
// Attack damage comes from the starting weapon and health from the starting armour (the server holds the real values, this is the offline/default display)
const GEAR = [{ weapon: 'Dagger', armor: 'Ragged Tunic' }, { weapon: 'Nailed Club', armor: 'Studded Vest' }, { weapon: 'Spiked Mace', armor: 'Warlord Harness' }, { weapon: 'Gnarled Staff', armor: 'Starry Robe' }, { weapon: 'Royal Scepter', armor: 'Royal Mantle' }];
const STATS = [{ knowledge: 60, attack: 10, health: 40 }, { knowledge: 40, attack: 15, health: 50 }, { knowledge: 30, attack: 20, health: 80 }, { knowledge: 80, attack: 0, health: 60 }, { knowledge: 40, attack: 20, health: 100 }];
const WORLD = window.GKWORLD;              // shared geometry (world.js, also used by server.js): room sizes, THE VAULT (middle room, bigger), chest rooms, helpers
const { H, T, V: VSIZE, rc, roomAt, roomW, roomD } = WORLD;   // ceiling height, wall thickness, vault size, room centre / point -> room / per-room width and depth
const DW = 4, DHT = 4.4, VW = 4.9, VH = 5; // secure door and vault door openings
const RAD = 0.45;                          // player radius
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const GK = window.GK = window.GK || {};
GK.mode = 'menu';                         // 'menu' (title, settings, wheel) or 'play'
GK.settings = Object.assign({ sens: 1, fov: 75, scale: 1, invertY: false, tags: true, fx: true }, GK.settings || {});
const CS = WORLD.CS;                      // chest room size
const WEAPONS = ['Rusty Sword', 'Battle Axe', 'War Spear', 'Spiked Mace', 'Short Bow', 'Dagger'];
// One chest room behind every outer wall: edge rooms get 1, corner rooms get 2 (12 in total)
// Three kinds of rooms behind the outer doors: 'chest' (a chest with a random weapon), 'mystery' (question mark, contents decided later) and 'merchant' (merchant goblin behind glass, knowledge tree, workbench, recycler).
// Edge rooms (1,3,5,7) have only a chest room; each corner room (0,2,6,8) has a chest room plus one mystery or merchant room: 8 chest, 2 mystery, 2 merchant.
const ROOM_TYPE_BY_ID = { 1: 'mystery', 4: 'merchant', 7: 'merchant', 10: 'mystery' };   // ids follow the CHEST_ROOMS creation order below
const CHEST_ROOMS = [];
const layoutHooks = [];   // functions called with the type array when the match's random room layout is known (room interiors, door emblems, maps and panels are built/updated from it)
for (const c of WORLD.CHEST) CHEST_ROOMS.push({ ...c, type: ROOM_TYPE_BY_ID[c.id] || 'chest' });   // geometry (cx, cz, wallX, wallZ, dx, dz) comes from world.js
function applyLayout(types, mystery) {   // types: 12 strings in CHEST_ROOMS order; mystery: 12 entries, null or the contents of that mystery room (GKITEMS.randomMystery)
  if (!Array.isArray(types) || types.length !== CHEST_ROOMS.length || !types.every(t => t === 'chest' || t === 'mystery' || t === 'merchant')) return;
  types.forEach((t, i) => { CHEST_ROOMS[i].type = t; CHEST_ROOMS[i].mystery = t === 'mystery' && mystery && mystery[i] ? mystery[i] : null; });
  GK.layout = types.slice(); GK.mystery = CHEST_ROOMS.map(c => c.mystery); for (const f of layoutHooks) { try { f(GK.layout, GK.mystery); } catch (e) { console.error(e); } }
}
GK.layoutHooks = layoutHooks; GK.applyLayout = applyLayout;
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
const cam = new THREE.PerspectiveCamera(75, 1, 0.05, 190);
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
const panelM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6e6).multiplyScalar(3.4), toneMapped: false });   // HDR so the bloom pass picks the ceiling panels up
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

// DOORS-BEGIN (door textures, materials, burst particles: owned by the door agent)
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function star4(g, x, y, r) { g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill(); }
const moneyTex = canvasTex(512, 512, (g, w, h) => {
  const bg = g.createRadialGradient(256, 256, 30, 256, 256, 340); bg.addColorStop(0, '#3b2d0b'); bg.addColorStop(1, '#0c0a05');
  rrect(g, 8, 8, 496, 496, 46); g.fillStyle = bg; g.fill();
  g.lineWidth = 12; g.strokeStyle = '#e6b52e'; rrect(g, 8, 8, 496, 496, 46); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#8f6c14'; rrect(g, 32, 32, 448, 448, 30); g.stroke();
  // coins on the floor of the plate
  for (const [cx, cy] of [[92, 452], [150, 470], [420, 456], [366, 474]]) {
    g.fillStyle = '#7a5510'; g.beginPath(); g.ellipse(cx, cy + 5, 34, 13, 0, 0, 7); g.fill();
    g.fillStyle = '#f3c63c'; g.beginPath(); g.ellipse(cx, cy, 34, 13, 0, 0, 7); g.fill();
    g.strokeStyle = '#a8790f'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, 24, 8, 0, 0, 7); g.stroke();
  }
  // frills above the tie
  const gold = g.createLinearGradient(100, 0, 412, 0);
  gold.addColorStop(0, '#8a6212'); gold.addColorStop(0.3, '#ffe27a'); gold.addColorStop(0.6, '#e0aa28'); gold.addColorStop(1, '#7a5510');
  g.fillStyle = gold; g.strokeStyle = '#4a3208'; g.lineWidth = 7; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(222, 150); g.lineTo(176, 82); g.quadraticCurveTo(216, 112, 256, 92); g.quadraticCurveTo(296, 112, 336, 82); g.lineTo(290, 150); g.closePath(); g.fill(); g.stroke();
  // body of the sack
  g.beginPath(); g.moveTo(222, 150);
  g.bezierCurveTo(196, 205, 84, 262, 94, 372); g.bezierCurveTo(102, 452, 186, 474, 256, 474);
  g.bezierCurveTo(326, 474, 410, 452, 418, 372); g.bezierCurveTo(428, 262, 316, 205, 290, 150); g.closePath(); g.fill(); g.stroke();
  // fold shading
  g.strokeStyle = 'rgba(70,45,5,.35)'; g.lineWidth = 6;
  for (const [a, b, c, d2] of [[232, 175, 190, 240], [280, 175, 322, 240], [170, 300, 160, 360]]) { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo(a - 10, (b + d2) / 2, c, d2); g.stroke(); }
  // rope tie and bow
  g.fillStyle = '#6d4a10'; g.strokeStyle = '#2f1f04'; g.lineWidth = 5; rrect(g, 212, 138, 88, 30, 12); g.fill(); g.stroke();
  g.fillStyle = '#9a6d1a'; for (const sx of [-1, 1]) { g.save(); g.translate(256 + sx * 40, 190); g.rotate(sx * 0.7); g.beginPath(); g.ellipse(0, 0, 30, 15, 0, 0, 7); g.fill(); g.stroke(); g.restore(); }
  g.beginPath(); g.arc(256, 160, 12, 0, 7); g.fill(); g.stroke();
  // dollar sign
  g.font = 'bold 230px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff0ad'; g.fillText('$', 252, 336); g.fillStyle = '#4e3305'; g.fillText('$', 258, 342);
  g.fillStyle = '#7a5208'; g.fillText('$', 256, 340);
  g.fillStyle = 'rgba(255,255,255,.9)'; star4(g, 400, 128, 22); star4(g, 112, 150, 14); star4(g, 372, 330, 11);
});
const skullTex = canvasTex(512, 512, (g, w, h) => {
  const aura = g.createRadialGradient(256, 270, 20, 256, 270, 250); aura.addColorStop(0, 'rgba(255,30,20,.5)'); aura.addColorStop(0.6, 'rgba(160,10,10,.22)'); aura.addColorStop(1, 'rgba(120,0,0,0)');
  g.fillStyle = aura; g.fillRect(0, 0, w, h);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const boneG = g.createLinearGradient(0, 0, 0, 40); boneG.addColorStop(0, '#f4ecd6'); boneG.addColorStop(1, '#a89c80');
  for (const a of [-0.62, 0.62]) {
    g.save(); g.translate(256, 318); g.rotate(a);
    g.strokeStyle = '#1b160d'; g.lineWidth = 46; g.beginPath(); g.moveTo(-190, 0); g.lineTo(190, 0); g.stroke();
    g.strokeStyle = '#d9cfb4'; g.lineWidth = 34; g.beginPath(); g.moveTo(-190, 0); g.lineTo(190, 0); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 8; g.beginPath(); g.moveTo(-180, -8); g.lineTo(180, -8); g.stroke();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      g.fillStyle = '#1b160d'; g.beginPath(); g.arc(sx * 192, sy * 17, 29, 0, 7); g.fill();
      g.fillStyle = '#e6dcc0'; g.beginPath(); g.arc(sx * 192, sy * 17, 23, 0, 7); g.fill();
    }
    g.restore();
  }
  // cranium + jaw
  const sk = g.createRadialGradient(236, 170, 10, 256, 220, 170); sk.addColorStop(0, '#fffaf0'); sk.addColorStop(0.7, '#e3d9bd'); sk.addColorStop(1, '#a89a78');
  g.fillStyle = '#16110a'; g.beginPath(); g.ellipse(256, 215, 144, 138, 0, 0, 7); g.fill(); rrect(g, 166, 282, 180, 108, 30); g.fill();
  g.fillStyle = sk; g.beginPath(); g.ellipse(256, 215, 136, 130, 0, 0, 7); g.fill();
  rrect(g, 176, 290, 160, 92, 24); g.fill();
  // teeth
  g.fillStyle = '#16110a'; g.fillRect(180, 336, 152, 5);
  for (let i = 0; i < 7; i++) g.fillRect(200 + i * 21, 330, 4, 52);
  g.fillRect(180, 378, 152, 5);
  // cracks
  g.strokeStyle = 'rgba(40,30,15,.7)'; g.lineWidth = 4; g.beginPath(); g.moveTo(290, 92); g.lineTo(278, 130); g.lineTo(296, 150); g.lineTo(284, 182); g.stroke();
  // eye sockets with red fire
  for (const sx of [-1, 1]) {
    const ex = 256 + sx * 54, ey = 228;
    g.save(); g.translate(ex, ey); g.rotate(sx * 0.22);
    g.fillStyle = '#050303'; g.beginPath(); g.ellipse(0, 0, 42, 50, 0, 0, 7); g.fill();
    const gl = g.createRadialGradient(0, 4, 2, 0, 4, 34); gl.addColorStop(0, '#fff2d0'); gl.addColorStop(0.25, '#ff5030'); gl.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = gl; g.beginPath(); g.ellipse(0, 4, 34, 40, 0, 0, 7); g.fill(); g.restore();
  }
  g.fillStyle = '#080504'; g.beginPath(); g.moveTo(256, 258); g.quadraticCurveTo(232, 300, 236, 306); g.lineTo(276, 306); g.quadraticCurveTo(280, 300, 256, 258); g.fill();
});
const mysteryTex = canvasTex(512, 512, (g, w, h) => {
  const bg = g.createRadialGradient(256, 256, 20, 256, 256, 340); bg.addColorStop(0, '#2c1a52'); bg.addColorStop(1, '#0b0716');
  rrect(g, 8, 8, 496, 496, 46); g.fillStyle = bg; g.fill();
  g.lineWidth = 12; g.strokeStyle = '#d9a93a'; rrect(g, 8, 8, 496, 496, 46); g.stroke();
  g.lineWidth = 3; g.strokeStyle = '#7b52c9'; rrect(g, 32, 32, 448, 448, 30); g.stroke();
  g.strokeStyle = '#9a6cff'; g.lineWidth = 4; g.beginPath(); g.arc(256, 256, 214, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(256, 256, 176, 0, 7); g.stroke();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.strokeStyle = '#c9a7ff'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 20; i++) {   // runes between the rings
    const a = i / 20 * Math.PI * 2, rx = 256 + Math.sin(a) * 195, ry = 256 - Math.cos(a) * 195; g.save(); g.translate(rx, ry); g.rotate(a);
    g.beginPath(); g.moveTo(0, -13); g.lineTo(0, 13); if (rnd() < 0.7) { g.moveTo(0, -13); g.lineTo(9, -3); } if (rnd() < 0.7) { g.moveTo(0, 13); g.lineTo(-9, 2); } if (rnd() < 0.5) { g.moveTo(-8, 0); g.lineTo(8, 4); } g.stroke(); g.restore();
  }
  const gl = g.createRadialGradient(256, 262, 10, 256, 262, 190); gl.addColorStop(0, 'rgba(190,120,255,.7)'); gl.addColorStop(1, 'rgba(120,60,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, w, h);
  g.font = 'bold 330px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#3a1d7a'; g.fillText('?', 262, 276); g.fillStyle = '#e8c35a'; g.fillText('?', 256, 268); g.fillStyle = '#fff3c4'; g.globalAlpha = 0.55; g.fillText('?', 252, 262); g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,.9)'; star4(g, 380, 120, 16); star4(g, 128, 380, 12);
});
const merchantTex = canvasTex(512, 512, (g, w, h) => {
  const gold = g.createLinearGradient(40, 40, 470, 470); gold.addColorStop(0, '#fff0a0'); gold.addColorStop(0.45, '#e2a82a'); gold.addColorStop(1, '#7a5510');
  g.fillStyle = '#4a3208'; g.beginPath(); g.arc(256, 262, 250, 0, 7); g.fill();
  g.fillStyle = gold; g.beginPath(); g.arc(256, 256, 246, 0, 7); g.fill();
  g.strokeStyle = '#8a6212'; g.lineWidth = 5; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; g.beginPath(); g.moveTo(256 + Math.sin(a) * 226, 256 - Math.cos(a) * 226); g.lineTo(256 + Math.sin(a) * 242, 256 - Math.cos(a) * 242); g.stroke(); }
  g.fillStyle = '#1b1306'; g.beginPath(); g.arc(256, 256, 206, 0, 7); g.fill();
  g.strokeStyle = '#e6b52e'; g.lineWidth = 6; g.beginPath(); g.arc(256, 256, 196, 0, 7); g.stroke();
  g.fillStyle = gold; g.strokeStyle = '#e6b52e'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  // goblin merchant hat
  g.beginPath(); g.moveTo(186, 168); g.quadraticCurveTo(220, 150, 238, 100); g.quadraticCurveTo(250, 60, 300, 48); g.quadraticCurveTo(278, 80, 282, 110); g.quadraticCurveTo(300, 150, 326, 168); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(256, 172, 92, 16, 0, 0, 7); g.fill(); g.fillStyle = '#1b1306'; g.fillRect(222, 138, 66, 10); g.fillStyle = gold; g.beginPath(); g.arc(256, 143, 11, 0, 7); g.fill();
  // scales
  g.beginPath(); g.moveTo(256, 196); g.lineTo(256, 392); g.stroke(); g.beginPath(); g.moveTo(180, 410); g.lineTo(332, 410); g.stroke();
  g.beginPath(); g.moveTo(120, 232); g.lineTo(392, 232); g.stroke(); g.beginPath(); g.arc(256, 218, 15, 0, 7); g.fill();
  g.lineWidth = 4; for (const sx of [-1, 1]) {
    const x = 256 + sx * 136; g.beginPath(); g.moveTo(x, 232); g.lineTo(x - 56, 306); g.moveTo(x, 232); g.lineTo(x + 56, 306); g.stroke();
    g.beginPath(); g.moveTo(x - 66, 306); g.quadraticCurveTo(x, 372, x + 66, 306); g.closePath(); g.fill();
  }
  g.fillStyle = '#1b1306'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 256, 470);
});
const dialTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#10141a'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill();
  g.strokeStyle = '#c9d2dc'; g.fillStyle = '#e8eef5'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 20px system-ui';
  for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2, big = i % 5 === 0; g.lineWidth = big ? 4 : 2; g.beginPath(); g.moveTo(128 + Math.sin(a) * (big ? 100 : 108), 128 - Math.cos(a) * (big ? 100 : 108)); g.lineTo(128 + Math.sin(a) * 120, 128 - Math.cos(a) * 120); g.stroke(); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillText(String(i * 5), 128 + Math.sin(a) * 80, 128 - Math.cos(a) * 80); }
  g.fillStyle = '#ff3a2a'; g.beginPath(); g.moveTo(128, 6); g.lineTo(118, 28); g.lineTo(138, 28); g.fill();
});
const handTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#04141c'; g.fillRect(0, 0, w, h);
  g.shadowColor = '#3fe6ff'; g.shadowBlur = 14; g.strokeStyle = '#6ff0ff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  rrect(g, 78, 120, 100, 92, 30); g.stroke();
  for (const [x, y, l] of [[92, 120, 78], [118, 120, 96], [142, 120, 90], [166, 120, 68]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - l); g.stroke(); }
  g.beginPath(); g.moveTo(80, 170); g.lineTo(42, 128); g.stroke();
  g.shadowBlur = 0; g.strokeStyle = 'rgba(111,240,255,.45)'; g.lineWidth = 3; g.strokeRect(14, 14, 228, 228);
});
const beamTex = canvasTex(128, 32, (g, w, h) => {
  const a = g.createLinearGradient(0, 0, w, 0); a.addColorStop(0, 'rgba(255,255,255,1)'); a.addColorStop(0.35, 'rgba(255,255,255,.55)'); a.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = a; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
});
const levelTex = textTex('SECURITY LEVEL 5', '#ffd25a', '#0d0c0a', 512, 64, 'bold 40px system-ui');
const goldM = M(0xffc83a, { metalness: 1, roughness: 0.28, envMapIntensity: 1.3 });
const yellowM = M(0xf2b705, { metalness: 0.4, roughness: 0.42, envMapIntensity: 0.8 });
const gunM = M(0x2d3138, { map: steelTex, metalness: 0.9, roughness: 0.4, envMapIntensity: 1 });
const lightSteelM = M(0xd7dee8, { map: steelTex, metalness: 1, roughness: 0.26, envMapIntensity: 1.25 });
const rivetM = M(0x9aa4b0, { metalness: 1, roughness: 0.3, envMapIntensity: 1.1 });
const chainM = M(0x9aa3ad, { metalness: 1, roughness: 0.35 });
const violetTrimM = new THREE.MeshBasicMaterial({ color: 0x8a52ff, toneMapped: false });
const redTrimM = new THREE.MeshBasicMaterial({ color: 0xc41818, toneMapped: false });
const chainGeo = new THREE.TorusGeometry(0.07, 0.022, 6, 14), rivetGeo = new THREE.SphereGeometry(1, 8, 6);
const _o = new THREE.Object3D();
function inst(parent, geo, mat, list) {   // list of [x, y, z, sx, sy, sz, rx, ry, rz]
  const m = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((a, i) => { _o.position.set(a[0], a[1], a[2]); _o.scale.set(a[3] === undefined ? 1 : a[3], a[4] === undefined ? 1 : a[4], a[5] === undefined ? 1 : a[5]); _o.rotation.set(a[6] || 0, a[7] || 0, a[8] || 0); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); });
  m.instanceMatrix.needsUpdate = true; parent.add(m); return m;
}
function glowSprite(parent, mat, size, x, y, z) { const s = new THREE.Sprite(mat); s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s; }
// pooled burst particles (steam/dust + sparks): one Points each, no per-frame allocation
const dfxScale = { value: 800 };
function dfxMat(add) {
  return new THREE.ShaderMaterial({
    uniforms: { uScale: dfxScale },
    vertexShader: 'attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying float vA; varying vec3 vC; uniform float uScale; void main(){ vA=aAlpha; vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=smoothstep(1.0,0.0,d)*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }',
    transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false });
}
function dfxPool(N, add, r, gc, b) {
  const geo = new THREE.BufferGeometry(), P = {
    N, cur: 0, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N),
    base: new Float32Array(N), siz: new Float32Array(N), alp: new Float32Array(N), col: new Float32Array(N * 3)
  };
  for (let i = 0; i < N; i++) { P.pos[i * 3 + 1] = -100; P.col[i * 3] = r; P.col[i * 3 + 1] = gc; P.col[i * 3 + 2] = b; }
  const A = (n, arr, k) => geo.setAttribute(n, new THREE.BufferAttribute(arr, k).setUsage(THREE.DynamicDrawUsage));
  A('position', P.pos, 3); A('aSize', P.siz, 1); A('aAlpha', P.alp, 1); A('aCol', P.col, 3);
  P.geo = geo; P.pts = new THREE.Points(geo, dfxMat(add)); P.pts.frustumCulled = false; P.pts.renderOrder = 6; scene.add(P.pts);
  return P;
}
function dfxEmit(P, x, y, z, vx, vy, vz, life, size) {
  const i = P.cur; P.cur = (i + 1) % P.N; const k = i * 3;
  P.life[i] = P.max[i] = life; P.base[i] = size; P.siz[i] = size; P.alp[i] = 0.01;
  P.pos[k] = x; P.pos[k + 1] = y; P.pos[k + 2] = z; P.vel[k] = vx; P.vel[k + 1] = vy; P.vel[k + 2] = vz;
}
function dfxStep(P, dt, grav, drag, grow, peak) {
  const L = P.life, v = P.vel, p = P.pos; let any = false;
  for (let i = 0; i < P.N; i++) {
    if (L[i] <= 0) continue;
    any = true; L[i] -= dt; const k = i * 3;
    if (L[i] <= 0) { p[k + 1] = -100; P.alp[i] = 0; continue; }
    const dr = Math.max(0, 1 - drag * dt); v[k] *= dr; v[k + 1] = v[k + 1] * dr + grav * dt; v[k + 2] *= dr;
    p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
    if (p[k + 1] < 0.02 && grav < 0) { p[k + 1] = 0.02; v[k + 1] *= -0.3; }
    const f = L[i] / P.max[i];
    P.alp[i] = Math.min(1, f * 2.2) * peak; P.siz[i] = P.base[i] * (1 + grow * (1 - f));
  }
  if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; }
}
const dfxDust = dfxPool(700, false, 0.66, 0.68, 0.72), dfxSpark = dfxPool(500, true, 1, 0.62, 0.2);
function dfxUpdate(dt) {
  dfxScale.value = renderer.domElement.height * 0.5 / Math.tan(cam.fov * Math.PI / 360);
  dfxStep(dfxDust, dt, 0.25, 1.4, 1.8, 0.42); dfxStep(dfxSpark, dt, -9, 0.3, -0.5, 1);
}
function doorBurst(d) {
  const big = d.kind === 'vault', nd = big ? 90 : 34, ns = big ? 60 : 22, hw = d.dw / 2, R1 = Math.random;
  const wx = (lx, lz) => d.gx + d.ax[0] * lx + d.az[0] * lz, wz = (lx, lz) => d.gz + d.ax[1] * lx + d.az[1] * lz;
  for (let k = 0; k < nd; k++) {
    const lx = (R1() * 2 - 1) * hw, s = R1() < 0.5 ? -1 : 1, lz = s * (0.3 + R1() * 0.5), vx = (R1() - 0.5) * 0.6, vz = s * (0.5 + R1() * 1.3);
    dfxEmit(dfxDust, wx(lx, lz), 0.08 + R1() * 0.3, wz(lx, lz), d.ax[0] * vx + d.az[0] * vz, 0.4 + R1() * 1.1, d.ax[1] * vx + d.az[1] * vz, 1.0 + R1() * 1.0, 0.5 + R1() * 0.6);
  }
  for (let k = 0; k < ns; k++) {
    const sx = R1() < 0.5 ? -1 : 1, lx = sx * hw, s = R1() < 0.5 ? -1 : 1, lz = s * 0.35, vx = (R1() - 0.5) * 3, vz = s * (0.5 + R1() * 2.8);
    dfxEmit(dfxSpark, wx(lx, lz), R1() * d.dh, wz(lx, lz), d.ax[0] * vx + d.az[0] * vz, 0.5 + R1() * 3.2, d.ax[1] * vx + d.az[1] * vz, 0.5 + R1() * 0.7, 0.07 + R1() * 0.06);
  }
}
// DOORS-END

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
    m.position.set(0, y, s * (T / 2 + 0.17)); if (s < 0) m.rotation.y = Math.PI; g.add(m); (sign.out = sign.out || []).push(m);
  }
}
function bioPanel(g, d, x) {
  for (const s of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(x, 1.5, s * (T / 2 + 0.05)); g.add(p);
    bx(p, 0.64, 1.1, 0.1, 0, 0, 0, gunM);
    bx(p, 0.7, 0.05, 0.12, 0, 0.58, 0, lightSteelM); bx(p, 0.7, 0.05, 0.12, 0, -0.58, 0, lightSteelM);
    const hand = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: handTex, toneMapped: false }));
    hand.position.set(0, 0.2, s * 0.056); if (s < 0) hand.rotation.y = Math.PI; p.add(hand);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 8, 24), d.ledM); eye.position.set(0, -0.26, s * 0.06); p.add(eye);
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), new THREE.MeshBasicMaterial({ color: 0x021015 })); pupil.position.set(0, -0.26, s * 0.056); if (s < 0) pupil.rotation.y = Math.PI; p.add(pupil);
    bx(p, 0.44, 0.04, 0.02, 0, -0.43, s * 0.055, d.ledM);
    glowSprite(p, d.halo, 0.5, 0, -0.26, s * 0.1);
  }
}
function beacon(g, d, x, y, s, size, withHalo) {
  const grp = new THREE.Group(); grp.position.set(x, y, s * (T / 2 + 0.03)); g.add(grp);
  cyl(grp, 0.13 * size, 0.07, darkSteel, 0, 0, s * 0.0, 'z');
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1 * size, 14, 10), d.domeM); dome.position.z = s * 0.05; dome.scale.z = 0.8; grp.add(dome);
  if (withHalo) glowSprite(grp, d.halo, 0.9 * size, 0, 0, s * 0.12);
  const rot = new THREE.Group(); rot.position.z = s * 0.05; grp.add(rot);
  for (const a of [0, Math.PI]) {
    const geo = new THREE.PlaneGeometry(1.6 * size, 0.3 * size); geo.translate(0.8 * size, 0, 0);
    const m = new THREE.Mesh(geo, d.beamM); m.rotation.z = a; m.renderOrder = 4; rot.add(m);
  }
  rot.userData.dir = s; d.rots.push(rot); d.dyn.push(rot);
}
function statusLights(g, d, y) {
  for (const s of [-1, 1]) {
    bx(g, 0.64, 0.2, 0.05, 0, y, s * (T / 2 + 0.12), darkSteel);
    bx(g, 0.5, 0.12, 0.05, 0, y, s * (T / 2 + 0.15), d.light);
    glowSprite(g, d.halo, 1.3, 0, y, s * (T / 2 + 0.3));
  }
}
function wall(px, pz, rot, kind, len) {   // len: length of the room boundary this wall closes (the wall is T longer so it overlaps the corners)
  const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = rot; scene.add(g);
  const L = len + T, dw = kind === 'vault' ? VW : DW, dh = kind === 'vault' ? VH : DHT;
  const solid = (x0, x1, y0, y1) => bx(g, x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, 0, plaster);
  const base = (x0, x1) => bx(g, x1 - x0, 0.2, T + 0.1, (x0 + x1) / 2, 0.1, 0, trimM);
  if (!kind) { solid(-L / 2, L / 2, 0, H); base(-L / 2, L / 2); addRect(px, pz, rot, -L / 2, L / 2, -T / 2, T / 2); return; }
  solid(-L / 2, -dw / 2, 0, H); solid(dw / 2, L / 2, 0, H); solid(-dw / 2, dw / 2, dh, H);
  base(-L / 2, -dw / 2 - 0.3); base(dw / 2 + 0.3, L / 2);
  addRect(px, pz, rot, -L / 2, -dw / 2, -T / 2, T / 2); addRect(px, pz, rot, dw / 2, L / 2, -T / 2, T / 2);
  const light = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff1a1a, emissiveIntensity: 2 }); statusMats.push(light);
  const slide = kind !== 'vault';
  const d = { id: doors.length, open: false, kind, slide, p: 0, gx: px, gz: pz, dw, dh, ax: [Math.cos(rot), -Math.sin(rot)], az: [Math.sin(rot), Math.cos(rot)], flash: 0, light, leaf: new THREE.Group(), wheels: [], rings: [], bolts: [], rots: [], dyn: [], blocker: null };
  const glowMat = (c, op) => new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  d.halo = glowMat(0xff2020, 0.8);
  d.beamM = new THREE.MeshBasicMaterial({ map: beamTex, color: 0xffa020, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  d.domeM = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff2010, emissiveIntensity: 0.6 });
  d.ledM = new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false });
  d.blocker = { door: d }; addRect(px, pz, rot, -dw / 2, dw / 2, -T / 2, T / 2); Object.assign(d.blocker, rects.pop());
  rects.push(d.blocker);

  if (slide) {
    const sk = kind === 'skull', ch = kind === 'chest' || kind === 'mystery' || kind === 'merchant', leafM = sk ? gunM : ch ? steelM.clone() : steelM;
    if (ch) { d.art = { chest: [], mystery: [], merchant: [] }; d.leafMat = leafM; d.trimM = yellowM.clone(); d.merchPlates = []; }
    const A = (t, o) => { d.art[t].push(o); return o; };
    const plateMat = (tex, ei) => new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: ei, roughness: 0.4, metalness: 0.5, alphaTest: 0.4 });
    for (const s of [-1, 1]) {
      bx(g, 0.26, dh, T + 0.24, s * (dw / 2 + 0.13), dh / 2, 0, darkSteel);
      bx(g, 0.07, dh - 0.12, T + 0.3, s * (dw / 2 + 0.035), dh / 2 - 0.06, 0, lightSteelM);      // bevel edge
      bx(g, 0.16, dh + 0.06, T + 0.1, s * (dw / 2 + 0.34), dh / 2 + 0.03, 0, trimM);
    }
    bx(g, dw + 0.5, 0.3, T + 0.24, 0, dh - 0.15, 0, darkSteel);
    bx(g, dw + 0.1, 0.07, T + 0.3, 0, dh - 0.335, 0, lightSteelM);
    for (const z of [-1, 1]) bx(g, dw + 0.5, 0.06, 0.02, 0, dh - 0.15, z * (T / 2 + 0.131), ch ? d.trimM : sk ? redTrimM : hazardM, 0.8);
    const rv = []; for (const sx of [-1, 1]) for (const sz of [-1, 1]) { for (let k = 0; k < 9; k++) rv.push([sx * (dw / 2 + 0.13), 0.3 + k * (dh - 0.9) / 8, sz * (T / 2 + 0.125), 0.035, 0.035, 0.035]); }
    inst(g, rivetGeo, rivetM, rv);
    g.add(d.leaf);
    const lw = dw - 0.04, lh = dh - 0.32;
    bx(d.leaf, lw, lh, 0.24, 0, lh / 2, 0, leafM, 2);
    for (const s of [-1, 1]) {
      const z = s * 0.125;
      bx(d.leaf, lw, 0.1, 0.03, 0, 0.05, s * 0.135, lightSteelM, 1); bx(d.leaf, lw, 0.1, 0.03, 0, lh - 0.05, s * 0.135, lightSteelM, 1);
      bx(d.leaf, 0.1, lh, 0.03, -lw / 2 + 0.05, lh / 2, s * 0.135, lightSteelM, 1); bx(d.leaf, 0.1, lh, 0.03, lw / 2 - 0.05, lh / 2, s * 0.135, lightSteelM, 1);
      cyl(d.leaf, 0.035, 0.9, lightSteelM, -lw / 2 + 0.35, 1.9, s * 0.22);          // pull bar
      bx(d.leaf, 0.1, 0.1, 0.1, -lw / 2 + 0.35, 1.45, s * 0.17, darkSteel); bx(d.leaf, 0.1, 0.1, 0.1, -lw / 2 + 0.35, 2.35, s * 0.17, darkSteel);
      const art = [];
      for (let i = 0; i < 14; i++) for (const yy of [0.2, lh - 0.2]) art.push([-lw / 2 + 0.3 + i * (lw - 0.6) / 13, yy, z, 0.034, 0.034, 0.034]);
      inst(d.leaf, rivetGeo, rivetM, art);
      if (ch) {
        for (let i = 0; i < 6; i++) {
          const y = 0.42 + i * 0.64;
          A('chest', bx(d.leaf, lw - 0.3, 0.34, 0.03, 0, y, z + s * 0.01, darkSteel, 1));
          A('chest', bx(d.leaf, lw - 0.36, 0.26, 0.05, 0, y, z + s * 0.02, d.trimM, 1));
        }
        for (const yy of [0.5, lh - 0.5]) { A('mystery', bx(d.leaf, lw - 0.5, 0.05, 0.02, 0, yy, s * 0.14, violetTrimM, 1)); A('merchant', bx(d.leaf, lw - 0.5, 0.05, 0.02, 0, yy, s * 0.14, goldM, 1)); }
        for (const [tp, tx, ei] of [['chest', moneyTex, 0.35], ['mystery', mysteryTex, 0.5], ['merchant', merchantTex, 0.3]]) {
          const plate = A(tp, new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), plateMat(tx, ei)));
          plate.position.set(0, lh / 2, s * 0.17); if (s < 0) plate.rotation.y = Math.PI; d.leaf.add(plate);
          if (tp === 'merchant') d.merchPlates.push(plate);
          if (tp !== 'chest') { const gs = glowSprite(d.leaf, glowMat(tp === 'mystery' ? 0x9a5cff : 0xffc040, 0.5), 3.4, 0, lh / 2, s * 0.15); A(tp, gs); }
        }
      } else if (sk) {
        for (const yy of [0.5, lh - 0.5]) bx(d.leaf, lw - 0.5, 0.05, 0.02, 0, yy, s * 0.14, redTrimM, 1);
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshStandardMaterial({ map: skullTex, emissiveMap: skullTex, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.5, metalness: 0.2, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        pl.position.set(0, lh / 2 + 0.05, s * 0.135); if (s < 0) pl.rotation.y = Math.PI; d.leaf.add(pl);
        if (!d.eyeM) d.eyeM = glowMat(0xff2a10, 0.9);
        for (const ex of [-0.274, 0.274]) glowSprite(d.leaf, d.eyeM, 0.8, ex, lh / 2 + 0.05 + 0.145, s * 0.2);
      } else {
        bx(d.leaf, 0.9, 0.34, 0.3, 0.3, lh * 0.66, 0, glassM);
      }
    }
    for (let i = 0; i < 3; i++) cyl(d.leaf, 0.055, 0.5, darkSteel, lw / 2 - 0.1, 0.8 + i * 1.3, 0, 'x'); // deadbolts
    keypad(g, dw / 2 + 0.6, false);
    if (ch) {
      for (const [tp, tx, c1, c2] of [['chest', 'TREASURY', '#ffd54a', '#1b1508'], ['mystery', 'MYSTERY', '#c9a7ff', '#150c26'], ['merchant', 'MERCHANT', '#ffd54a', '#241808']]) { sign.out = []; sign(g, tx, dh + 0.62, c1, c2); sign.out.forEach(m => A(tp, m)); }
      const TY = { chest: [0xa9b6c6, 0xf2b705], mystery: [0x6a58a8, 0x8a52ff], merchant: [0xc9a25a, 0xe0a82a] };
      d.setType = t => {
        if (!d.art[t]) return; d.kind = t;
        for (const k in d.art) d.art[k].forEach(o => { o.visible = k === t; });
        d.leafMat.color.setHex(TY[t][0]); d.trimM.color.setHex(TY[t][1]);
        if (t === 'merchant' && GK.merchantLogo && !d.merchSwapped) { try { const c = GK.merchantLogo(512); if (c) { d.merchSwapped = true; if (!GK._mtex) { GK._mtex = new THREE.CanvasTexture(c); GK._mtex.colorSpace = THREE.SRGBColorSpace; } d.merchPlates.forEach(p => { p.material.map = p.material.emissiveMap = GK._mtex; p.material.needsUpdate = true; }); } } catch (e) {} }
      };
      d.setType(kind);
    } else sign(g, sk ? 'DANGER' : 'SECURE', dh + 0.62, sk ? '#ff5a4a' : '#f1f1f1', sk ? '#1a0e0e' : '#23262c');
    statusLights(g, d, dh + 0.2);
    for (const s of [-1, 1]) for (const sx of [-1, 1]) beacon(g, d, sx * (dw / 2 + 0.5), dh + 0.4, s, 1, true);
  } else {
    const piers = [];
    for (const s of [-1, 1]) {
      bx(g, 0.5, dh + 0.1, T + 0.34, s * (dw / 2 + 0.25), (dh + 0.1) / 2, 0, darkSteel);
      bx(g, 0.3, dh + 0.3, T + 0.6, s * (dw / 2 + 0.65), (dh + 0.3) / 2, 0, gunM);        // outer armour layer
      bx(g, 0.07, dh, T + 0.4, s * (dw / 2 + 0.035), dh / 2, 0, lightSteelM);              // bevel
      for (const z of [-1, 1]) {
        bx(g, 0.4, dh, 0.03, s * (dw / 2 + 0.25), dh / 2, z * (T / 2 + 0.18), hazardM, 1.2);
        bx(g, 0.22, dh + 0.1, 0.03, s * (dw / 2 + 0.65), (dh + 0.1) / 2, z * (T / 2 + 0.31), hazardM, 1.2);
        for (let k = 0; k < 12; k++) piers.push([s * (dw / 2 + 0.65), 0.25 + k * (dh - 0.3) / 11, z * (T / 2 + 0.34), 0.04, 0.04, 0.04]);
      }
    }
    inst(g, rivetGeo, rivetM, piers);
    bx(g, dw + 1, 0.5, T + 0.34, 0, dh - 0.05, 0, darkSteel);
    bx(g, dw + 1.6, 0.34, T + 0.6, 0, dh + 0.15, 0, gunM);
    for (const z of [-1, 1]) { bx(g, dw + 0.9, 0.34, 0.03, 0, dh - 0.05, z * (T / 2 + 0.18), hazardM, 1.2); bx(g, dw + 1.5, 0.2, 0.03, 0, dh + 0.15, z * (T / 2 + 0.31), hazardM, 1.2); }
    for (let i = 0; i < 3; i++) cyl(g, 0.12, 0.5, darkSteel, -dw / 2 - 0.05, 0.8 + i * 1.8, 0);   // hinges
    // swing away from the middle room: find which local side faces the centre
    d.sgn = (Math.sin(rot) * -px + Math.cos(rot) * -pz) > 0 ? -1 : 1;
    const sw = { openOnly: d }; addRect(px, pz, rot, -dw / 2 - 0.3, -dw / 2 + 0.3, d.sgn > 0 ? 0.3 : -4.9, d.sgn > 0 ? 4.9 : -0.3); Object.assign(sw, rects.pop()); rects.push(sw);
    const hinge = new THREE.Group(); hinge.position.set(-dw / 2, 0, 0); g.add(hinge); hinge.add(d.leaf); d.leaf = hinge;
    const slab = new THREE.Group(); slab.position.x = dw / 2; hinge.add(slab);
    const lh = dh - 0.4, cy0 = lh / 2 - 0.05;
    bx(slab, dw - 0.06, lh, 0.5, 0, lh / 2, 0, vaultM, 2);
    const lugs = [], pins = [];
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; lugs.push([Math.sin(a) * 1.28, Math.cos(a) * 1.28, 0, 0.09, 0.13, 0.1, 0, 0, -a]); }
    for (const a of [40, 140, 220, 320]) { const r = a * Math.PI / 180; pins.push([Math.sin(r) * 1.78, cy0 + Math.cos(r) * 1.78, 0.0, 0.2, 0.07, 0.07, 0, 0, Math.PI / 2 - r]); }
    for (const s of [-1, 1]) {
      const z = s * 0.26;
      bx(slab, dw - 0.5, 0.3, 0.04, 0, 0.18, z, hazardM, 1.2); bx(slab, dw - 0.5, 0.3, 0.04, 0, lh - 0.18, z, hazardM, 1.2);
      cyl(slab, 1.66, 0.12, gunM, 0, cy0, z, 'z');
      for (const pn of pins) { const b = bx(slab, 0.46, 0.15, 0.1, pn[0], pn[1], s * 0.3, darkSteel, 1); b.rotation.z = pn[8]; }
      const led = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.035, 8, 56), d.ledM); led.position.set(0, cy0, s * 0.33); slab.add(led);
      const ring = new THREE.Group(); ring.position.set(0, cy0, s * 0.37); slab.add(ring); d.rings.push(ring);
      ring.add(new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.1, 10, 48), steelM));
      const lg = inst(ring, new THREE.BoxGeometry(1, 1, 1), lightSteelM, lugs); lg.position.z = 0.02;
      cyl(slab, 1.04, 0.1, darkSteel, 0, cy0, s * 0.34, 'z');
      const wheel = new THREE.Group(); wheel.position.set(0, cy0, s * 0.47); slab.add(wheel); d.wheels.push(wheel);
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.07, 12, 40), steelM));
      const dial = new THREE.Mesh(new THREE.CircleGeometry(0.58, 40), new THREE.MeshStandardMaterial({ map: dialTex, metalness: 0.5, roughness: 0.4, emissive: 0x223344, emissiveIntensity: 0.4 }));
      dial.position.z = s * 0.03; if (s < 0) dial.rotation.y = Math.PI; wheel.add(dial);
      for (let k = 0; k < 3; k++) { const sp = bx(wheel, 0.1, 1.66, 0.09, 0, 0, 0, steelM, 1); sp.rotation.z = k * Math.PI / 3; }
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; cyl(wheel, 0.06, 0.2, lightSteelM, Math.sin(a) * 0.82, Math.cos(a) * 0.82, 0, 'z'); }
      const hub = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), lightSteelM); hub.scale.z = 0.6; hub.position.z = s * 0.08; wheel.add(hub);
      // plaque and bolts
      const pq = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.2), new THREE.MeshBasicMaterial({ map: levelTex, toneMapped: false })); pq.position.set(0, cy0 + 1.88, s * 0.256); if (s < 0) pq.rotation.y = Math.PI; slab.add(pq);
      bx(slab, 1.5, 0.28, 0.02, 0, cy0 + 1.88, s * 0.252, goldM, 1);
      for (let k = 0; k < 6; k++) for (const sx of [-1, 1]) {
        const y = 0.85 + k * 0.58, x0 = sx * (dw / 2 - 0.4);
        bx(slab, 0.62, 0.32, 0.1, sx * (dw / 2 - 0.4), y, s * 0.3, darkSteel, 1);
        const b = cyl(slab, 0.11, 0.5, lightSteelM, x0, y, s * 0.35, 'x'); b.userData = { sx, x0 }; d.bolts.push(b);
      }
    }
    // anchor chains + padlock blocks hang over the armoured piers
    const links = [];
    for (const sx of [-1, 1]) for (const z of [-1, 1]) for (let k = 0; k < 13; k++) links.push([sx * (dw / 2 + 0.25), dh - 0.5 - k * 0.1, z * (T / 2 + 0.22), 1, 1.5, 1, 0, (k % 2) * Math.PI / 2, 0]);
    inst(g, chainGeo, chainM, links);
    for (const sx of [-1, 1]) for (const z of [-1, 1]) { bx(g, 0.3, 0.36, 0.14, sx * (dw / 2 + 0.25), dh - 1.95, z * (T / 2 + 0.24), goldM, 1); bx(g, 0.2, 0.2, 0.12, sx * (dw / 2 + 0.25), dh - 0.42, z * (T / 2 + 0.24), darkSteel, 1); }
    // laser grid hovering in front of the closed door, scanner bar sweeping
    d.laserM = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
    d.lasers = [];
    for (const z of [-1, 1]) {
      for (let k = 0; k < 7; k++) { const l = bx(g, dw, 0.014, 0.014, 0, 0.35 + k * (dh - 0.7) / 6, z * 0.6, d.laserM); d.lasers.push(l); }
      for (let k = 0; k < 9; k++) { const l = bx(g, 0.014, dh, 0.014, -dw / 2 + 0.25 + k * (dw - 0.5) / 8, dh / 2, z * 0.6, d.laserM); d.lasers.push(l); }
      const sc = bx(g, dw, 0.06, 0.02, 0, 1, z * 0.6, d.laserM); d.scan = d.scan || []; d.scan.push(sc); d.dyn.push(sc);
    }
    bioPanel(g, d, dw / 2 + 1.35);
    keypad(g, dw / 2 + 2.05, true);
    sign(g, 'RESTRICTED', dh + 0.8, '#ff4a3a', '#1a1214');
    statusLights(g, d, dh + 0.5);
    for (const s of [-1, 1]) for (const sx of [-1, 1]) beacon(g, d, sx * (dw / 2 + 0.95), dh + 0.55, s, 1.3, true);
  }
  doors.push(d);
}
// rooms (per-room width/depth from world.js: the middle room is THE VAULT, bigger than the others)
for (let i = 0; i < 9; i++) {
  const [cx, cz] = rc(i), rw = roomW(i), rd = roomD(i);
  bx(scene, rw, 0.4, rd, cx, -0.2, cz, floorM, 2);
  ceilings.push(bx(scene, rw, 0.3, rd, cx, H + 0.15, cz, ceilM));
  for (const [ox, oz] of WORLD.panelOffsets(i)) {
    bx(scene, 3, 0.05, 1.4, cx + ox, H - 0.03, cz + oz, panelM);
    bx(scene, 3.24, 0.04, 1.64, cx + ox, H - 0.015, cz + oz, trimM);
  }
  // fake ambient occlusion: darkened floor/ceiling edges and wall corners
  const hw = rw / 2 - T / 2, hd = rd / 2 - T / 2;
  const fa = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hd), aoM); fa.rotation.x = -Math.PI / 2; fa.position.set(cx, 0.004, cz); scene.add(fa);
  const ca = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hd), aoM); ca.rotation.x = Math.PI / 2; ca.position.set(cx, H - 0.004, cz); scene.add(ca); ceilings.push(ca);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const ax of [0, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, H), cornerM);
    if (ax) { m.rotation.y = Math.PI / 2; m.position.set(cx + sx * (hw - 0.004), H / 2, cz + sz * (hd - 0.85)); }
    else { m.position.set(cx + sx * (hw - 0.85), H / 2, cz + sz * (hd - 0.004)); }
    m.updateMatrix(); const e = new THREE.Vector3(-0.85, 0, 0).applyMatrix4(m.matrix);
    if (Math.hypot(e.x - (cx + sx * hw), e.z - (cz + sz * hd)) > 0.3) m.scale.x = -1;
    scene.add(m);
  }
  // 9 point lights in total (one per room); the vault is bigger, so its lamp is stronger and a little higher to light the whole hall
  const big = i === WORLD.VAULT, lamp = new THREE.PointLight(big ? 0xfff0dc : 0xfff6ea, big ? 14 : 9, 0, 1.2); lamp.position.set(cx, H - (big ? 1.2 : 0.7), cz); scene.add(lamp);
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xeeebe4, 2.1));
for (let i = 0; i < 9; i++) {
  const [cx, cz] = rc(i), col = i % 3, row = Math.floor(i / 3), rw = roomW(i), rd = roomD(i);
  // east neighbour and south neighbour, or an outer wall on the edge
  const kd = (a, b) => (a === 4 || b === 4) ? 'vault' : 'skull';
  const outerKind = (x, z) => { const c = CHEST_ROOMS.find(r => Math.abs(r.wallX - x) < 0.01 && Math.abs(r.wallZ - z) < 0.01); return 'chest'; };
  wall(cx + rw / 2, cz, Math.PI / 2, col < 2 ? kd(i, i + 1) : outerKind(cx + rw / 2, cz), rd);   // a wall between columns is as long as the row is deep
  wall(cx, cz + rd / 2, 0, row < 2 ? kd(i, i + 3) : outerKind(cx, cz + rd / 2), rw);            // a wall between rows is as long as the column is wide
  if (col === 0) wall(cx - rw / 2, cz, Math.PI / 2, outerKind(cx - rw / 2, cz), rd);
  if (row === 0) wall(cx, cz - rd / 2, 0, outerKind(cx, cz - rd / 2), rw);
}
layoutHooks.push(types => { for (const d of doors) { if (!d.setType) continue; const c = CHEST_ROOMS.find(r => Math.abs(r.wallX - d.gx) < 0.01 && Math.abs(r.wallZ - d.gz) < 0.01); if (c) d.setType(c.type); } });
if (GK.layout) layoutHooks[layoutHooks.length - 1](GK.layout);
// VAULT-BEGIN (THE VAULT: the big middle room, 18 x 18 m: gold lettering, floor medallion, pillars, dais, chandelier; no extra PointLights)
{
  const [vx, vz] = rc(WORLD.VAULT), vh = VSIZE / 2 - T / 2;   // room centre, half size to the inner wall faces
  const brass = M(0xe0a93a, { metalness: 1, roughness: 0.27, envMapIntensity: 1.7, emissive: 0x4a2800, emissiveIntensity: 0.55 });
  const goldGlowM = new THREE.MeshStandardMaterial({ color: 0xffd478, emissive: 0xffb22e, emissiveIntensity: 2.2, roughness: 0.4 });
  const pillarM = M(0x3a414d, { map: steelTex, metalness: 0.8, roughness: 0.34, envMapIntensity: 1.3 });
  const plinthM = M(0x1d2128, { metalness: 0.7, roughness: 0.4, envMapIntensity: 1.1 });
  const star = (g, cx, cy, r0, r1, n, rot) => { g.beginPath(); for (let k = 0; k < n * 2; k++) { const a = rot + k * Math.PI / n, r = k % 2 ? r0 : r1; g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); };
  const goldGrad = (g, x0, y0, x1, y1) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.45, '#f1b92f'); gr.addColorStop(0.55, '#c98a12'); gr.addColorStop(1, '#ffe27a'); return gr; };
  // lettering: THE VAULT in big gold capitals on a dark plate with brass trim (emissive so it reads from across the room)
  const letterTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#12100c'; g.fillRect(0, 0, w, h);
    g.strokeStyle = goldGrad(g, 0, 0, w, h); g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24); g.lineWidth = 3; g.strokeRect(30, 30, w - 60, h - 60);
    g.font = '900 150px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#3a2204'; g.strokeText('THE VAULT', w / 2, h / 2 + 8);
    g.fillStyle = goldGrad(g, 0, 70, 0, 200); g.fillText('THE VAULT', w / 2, h / 2 + 8);
    g.fillStyle = '#ffe9a0'; for (const sx of [70, w - 70]) { star(g, sx, h / 2, 9, 22, 4, 0); g.fill(); }
  });
  const letterM = new THREE.MeshStandardMaterial({ map: letterTex, emissiveMap: letterTex, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.45, metalness: 0.3 });
  const LW = 5.2, LH = LW / 4, LY = 4.3;
  for (const [wx, wz, rot] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {   // four walls, plate faces the room centre
    const g = new THREE.Group(); g.position.set(vx + wx * vh, 0, vz + wz * vh); g.rotation.y = rot; scene.add(g);   // local +z points into the room
    for (const sx of [-1, 1]) {
      const px = sx * 6.0;
      bx(g, LW + 0.34, LH + 0.34, 0.08, px, LY, 0.04, brass, 1);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(LW, LH), letterM); pl.position.set(px, LY, 0.09); g.add(pl);
      glowSprite(g, vaultGlowM(), 7.5, px, LY, 0.5);
    }
    // brass picture rail at 1 m on both sides of the door and a gold cornice under the ceiling
    for (const sx of [-1, 1]) bx(g, vh - 3.3, 0.1, 0.1, sx * ((vh - 3.3) / 2 + 3.3), 1.0, 0.05, brass, 1);
    bx(g, 2 * vh, 0.22, 0.14, 0, H - 0.11, 0.07, brass, 1);
    bx(g, 2 * vh, 0.05, 0.16, 0, H - 0.24, 0.08, goldGlowM, 1);
  }
  function vaultGlowM() { return vaultGlowM.m || (vaultGlowM.m = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb040, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); }
  // floor medallion (ring of gold bands, rays and rune ticks) with a raised dais carrying the vault wheel and the goblin crown
  const ringTex = canvasTex(1024, 1024, (g, w, h) => {
    const C = w / 2; g.translate(C, C);
    for (const [r0, r1, lw] of [[496, 496, 12], [468, 468, 4], [430, 430, 7], [345, 345, 10]]) { g.strokeStyle = goldGrad(g, -r0, -r0, r0, r0); g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r1, 0, 7); g.stroke(); }
    g.fillStyle = goldGrad(g, -440, -440, 440, 440); star(g, 0, 0, 345, 428, 16, -Math.PI / 2); g.fill();
    g.fillStyle = '#17110a'; star(g, 0, 0, 352, 408, 16, -Math.PI / 2); g.fill();
    g.fillStyle = goldGrad(g, -300, -300, 300, 300); star(g, 0, 0, 352, 398, 16, -Math.PI / 2 + Math.PI / 16); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = '#e6b52e'; g.lineWidth = 6; g.lineCap = 'round'; for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 440, Math.sin(a) * 440); g.lineTo(Math.cos(a) * (k % 4 ? 458 : 480), Math.sin(a) * (k % 4 ? 458 : 480)); g.stroke(); }
  });
  ringTex.wrapS = ringTex.wrapT = THREE.ClampToEdgeWrapping;
  const wheelTex = canvasTex(512, 512, (g, w, h) => {
    const C = w / 2; g.translate(C, C);
    g.fillStyle = '#0e1118'; g.beginPath(); g.arc(0, 0, 250, 0, 7); g.fill();
    g.strokeStyle = goldGrad(g, -250, -250, 250, 250); g.lineWidth = 14; g.beginPath(); g.arc(0, 0, 240, 0, 7); g.stroke(); g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 214, 0, 7); g.stroke();
    for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; g.lineWidth = k % 3 ? 3 : 6; g.beginPath(); g.moveTo(Math.cos(a) * 196, Math.sin(a) * 196); g.lineTo(Math.cos(a) * 208, Math.sin(a) * 208); g.stroke(); }
    g.lineWidth = 18; g.beginPath(); g.arc(0, 0, 150, 0, 7); g.stroke();
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 - Math.PI / 2; g.lineWidth = 16; g.beginPath(); g.moveTo(Math.cos(a) * 40, Math.sin(a) * 40); g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); g.stroke(); g.fillStyle = goldGrad(g, -40, -40, 40, 40); g.beginPath(); g.arc(Math.cos(a) * 178, Math.sin(a) * 178, 22, 0, 7); g.fill(); }
    g.fillStyle = '#1b1306'; g.beginPath(); g.arc(0, 0, 66, 0, 7); g.fill(); g.strokeStyle = '#e6b52e'; g.lineWidth = 6; g.stroke();
    g.fillStyle = goldGrad(g, 0, -40, 0, 40);   // the crown
    g.beginPath(); g.moveTo(-36, 24); g.lineTo(-40, -22); g.lineTo(-20, -2); g.lineTo(0, -34); g.lineTo(20, -2); g.lineTo(40, -22); g.lineTo(36, 24); g.closePath(); g.fill();
    g.fillStyle = '#d8281c'; g.beginPath(); g.arc(0, 8, 7, 0, 7); g.fill();
  });
  wheelTex.wrapS = wheelTex.wrapT = THREE.ClampToEdgeWrapping;
  const flat = (tex, size, y, ei) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: ei, roughness: 0.35, metalness: 0.5, transparent: true, alphaTest: 0.02, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.rotation.x = -Math.PI / 2; m.position.set(vx, y, vz); scene.add(m); return m; };
  flat(ringTex, 11.4, 0.012, 0.55);
  cyl(scene, 3.35, 0.16, plinthM, vx, 0.08, vz);                                       // dais
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.35, 0.07, 8, 64), brass); rim.rotation.x = Math.PI / 2; rim.position.set(vx, 0.16, vz); scene.add(rim);
  flat(wheelTex, 6.2, 0.165, 0.7);
  // four pillars (steel shaft, brass bands, brass capital and plinth, a glowing gold strip), solid for collision
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = vx + sx * 5.4, pz = vz + sz * 5.4;
    bx(scene, 1.5, 0.45, 1.5, px, 0.225, pz, plinthM, 1); bx(scene, 1.64, 0.08, 1.64, px, 0.47, pz, brass, 1);
    cyl(scene, 0.52, H - 1.3, pillarM, px, 0.51 + (H - 1.3) / 2, pz);
    for (const y of [1.0, 2.6, 4.2]) cyl(scene, 0.58, 0.14, brass, px, y, pz);
    for (const [ox, oz] of [[0.53, 0], [-0.53, 0], [0, 0.53], [0, -0.53]]) bx(scene, ox ? 0.04 : 0.1, H - 2.0, oz ? 0.04 : 0.1, px + ox, 3.1, pz + oz, goldGlowM, 1);
    bx(scene, 1.64, 0.08, 1.64, px, H - 0.83, pz, brass, 1); bx(scene, 1.5, 0.45, 1.5, px, H - 0.5, pz, plinthM, 1); bx(scene, 1.64, 0.1, 1.64, px, H - 0.22, pz, brass, 1);
    rects.push({ x0: px - 0.6, x1: px + 0.6, z0: pz - 0.6, z1: pz + 0.6 });
    glowSprite(scene, vaultGlowM(), 4.2, px, 0.9, pz);
  }
  // chandelier: a brass ring with glowing candles on four chains over the dais (emissive and sprites only)
  const chy = 4.7, chr = 2.5;
  const ch = new THREE.Mesh(new THREE.TorusGeometry(chr, 0.09, 10, 64), brass); ch.rotation.x = Math.PI / 2; ch.position.set(vx, chy, vz); scene.add(ch);
  const ch2 = new THREE.Mesh(new THREE.TorusGeometry(chr * 0.55, 0.06, 8, 48), brass); ch2.rotation.x = Math.PI / 2; ch2.position.set(vx, chy - 0.35, vz); scene.add(ch2);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, x = vx + Math.cos(a) * chr, z = vz + Math.sin(a) * chr;
    cyl(scene, 0.05, 0.3, brass, x, chy + 0.2, z); const fl = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), goldGlowM); fl.scale.y = 1.5; fl.position.set(x, chy + 0.45, z); scene.add(fl);
    glowSprite(scene, vaultGlowM(), 1.5, x, chy + 0.45, z);
  }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; bx(scene, 0.03, H - chy, 0.03, vx + Math.cos(a) * chr, chy + (H - chy) / 2, vz + Math.sin(a) * chr, brass, 1); }
  glowSprite(scene, vaultGlowM(), 9, vx, chy, vz); glowSprite(scene, vaultGlowM(), 12, vx, 0.3, vz);
}
// VAULT-END
// static world never moves: freeze matrices so the per-frame scene graph update skips them
scene.updateMatrixWorld(true);
{
  const dyn = new Set(); doors.forEach(d => { d.leaf.traverse(o => dyn.add(o)); d.dyn.forEach(q => q.traverse(o => dyn.add(o))); });
  scene.traverse(o => { if (o !== scene && !dyn.has(o) && !o.isLight) { o.matrixAutoUpdate = false; } });
}

// CHEST-BEGIN (chest rooms, chests, weapons: owned by the chest agent)
const tickers = GK.tickers = GK.tickers || [];
// The merchant logo: a gold coin with a goblin-merchant hat over a pair of scales (canvas, transparent outside the coin). Reused by doors, maps and the merchant rooms.
function merchantLogo(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.scale(size / 256, size / 256);
  const C = 128;
  g.fillStyle = '#5a3504'; g.beginPath(); g.arc(C, C, 126, 0, 7); g.fill();
  const gr = g.createRadialGradient(C - 34, C - 40, 8, C, C, 124); gr.addColorStop(0, '#fff3ad'); gr.addColorStop(0.45, '#f4c23f'); gr.addColorStop(1, '#a8690c');
  g.fillStyle = gr; g.beginPath(); g.arc(C, C, 121, 0, 7); g.fill();
  g.strokeStyle = 'rgba(90,52,4,.6)'; g.lineWidth = 2;
  for (let i = 0; i < 56; i++) { const a = i / 56 * 6.2832; g.beginPath(); g.moveTo(C + Math.cos(a) * 113, C + Math.sin(a) * 113); g.lineTo(C + Math.cos(a) * 120, C + Math.sin(a) * 120); g.stroke(); }
  g.strokeStyle = '#7a4a08'; g.lineWidth = 3; g.beginPath(); g.arc(C, C, 107, 0, 7); g.stroke();
  g.strokeStyle = '#ffe99a'; g.lineWidth = 1.5; g.beginPath(); g.arc(C, C, 110, 0, 7); g.stroke();
  const emblem = (ox, oy, col) => {
    g.save(); g.translate(C + ox, C + oy + 14); g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-46, -26); g.quadraticCurveTo(-36, -68, -8, -84); g.quadraticCurveTo(20, -98, 42, -74); g.quadraticCurveTo(30, -70, 25, -58); g.quadraticCurveTo(34, -40, 46, -26); g.quadraticCurveTo(0, -36, -46, -26); g.fill();   // floppy hat
    g.beginPath(); g.ellipse(0, -24, 58, 10, 0, 0, 7); g.fill(); g.beginPath(); g.arc(46, -76, 8, 0, 7); g.fill();                                                                       // brim and bobble
    g.lineWidth = 5; g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 58); g.stroke(); g.beginPath(); g.moveTo(-56, 3); g.lineTo(56, 3); g.stroke();                                                // scales: post, beam
    g.lineWidth = 2.4; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 56, 3); g.lineTo(s * 38, 34); g.moveTo(s * 56, 3); g.lineTo(s * 74, 34); g.stroke(); g.beginPath(); g.arc(s * 56, 34, 19, 0, Math.PI); g.fill(); }
    g.beginPath(); g.moveTo(-24, 66); g.lineTo(24, 66); g.lineTo(16, 56); g.lineTo(-16, 56); g.closePath(); g.fill(); g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
    g.restore();
  };
  emblem(2.2, 2.2, 'rgba(255,240,170,.75)'); emblem(0, 0, '#43270a');
  g.fillStyle = '#d8281c'; g.beginPath(); g.arc(C + 28, C - 62 + 14 + 12, 5, 0, 7); g.fill();   // hat jewel
  return c;
}
GK.merchantLogo = merchantLogo;
GK.ROOM_TYPE_NAMES = { chest: 'Treasure room', mystery: 'Mystery room', merchant: 'Merchant' };
const chestDyn = new Set();              // objects that must keep matrixAutoUpdate (animated)
const chestSlots = [];                    // per chest room: {holder, glow, label, shaft, cur}
{
  const rnd = (() => { let s = 1234567; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
  const addGlow = (parent, color, size, op, x, y, z) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.material.userData.own = true; s.scale.set(size, size, 1); s.position.set(x, y, z); parent.add(s); return s;
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

  // ----- more weapon families (club, crossbow, flail, halberd, hammer, staff, scepter) + tier styling -----
  const rodBetween = (p, a, b, r, mat) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); p.add(m); return m; };
  const crystalM = new THREE.MeshStandardMaterial({ color: 0x66aaff, emissive: 0x3377ff, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.1 });
  const spikeRing = (p, cx, cy, n, r, len, mat) => { for (let i = 0; i < n; i++) { const y = 1 - (i + 0.5) * 2 / n, rr = Math.sqrt(1 - y * y), a = i * 2.39996, d = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr); const c = cone(p, 0.03, len, mat, 0, 6); c.position.set(cx + d.x * r, cy + d.y * r, d.z * r); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); } };
  builders.push(
    p => { // 6 club
      cy2(p, 0.035, 0.11, 1.0, hwoodM, 0, 12); cy2(p, 0.04, 0.04, 0.28, leatherM, -0.34); wrap(p, -0.46, -0.22, 0.041, 5); ball(p, 0.05, goldM, -0.52);
      for (let i = 0; i < 9; i++) { const a = i * 2.4, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), c = cone(p, 0.022, 0.1, steel2, 0, 6); c.position.set(d.x * 0.1, 0.18 + (i % 3) * 0.13, d.z * 0.1); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); }
    },
    p => { // 7 crossbow
      bx(p, 0.07, 1.0, 0.1, 0, 0, 0, hwoodM, 1); bx(p, 0.1, 0.3, 0.12, 0, -0.45, 0, hwoodM, 1);
      for (const s of [-1, 1]) { const l = bx(p, 0.5, 0.045, 0.05, s * 0.24, 0.32, 0, steel2, 1); l.rotation.z = s * 0.25; rodBetween(p, new THREE.Vector3(s * 0.47, 0.38, 0), new THREE.Vector3(0, 0.02, 0), 0.006, leatherM); }
      cy2(p, 0.012, 0.012, 0.55, hwoodM, 0.3, 6).position.z = 0.07; cone(p, 0.03, 0.12, steel2, 0.62, 4).position.z = 0.07; bx(p, 0.1, 0.02, 0.1, 0, 0.58, 0, goldM, 1);
      const st = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 14), ironM); st.position.y = 0.5; st.rotation.y = Math.PI / 2; p.add(st);
    },
    p => { // 8 flail
      cy2(p, 0.03, 0.03, 0.7, hwoodM, -0.2, 10); cy2(p, 0.036, 0.036, 0.26, leatherM, -0.4); ball(p, 0.045, goldM, -0.58); cy2(p, 0.05, 0.05, 0.04, goldM, 0.16);
      for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 10), ironM); l.position.set(0.03 + i * 0.07, 0.24 + i * 0.07 - i * i * 0.006, 0); l.rotation.y = (i & 1) * Math.PI / 2; p.add(l); }
      ball(p, 0.13, spikeM, 0).position.set(0.42, 0.5, 0); spikeRing(p, 0.42, 0.5, 12, 0.14, 0.14, spikeM);
    },
    p => { // 9 halberd
      cy2(p, 0.025, 0.025, 1.9, hwoodM, 0, 10); cone(p, 0.045, 0.34, steel2, 1.12, 4); cy2(p, 0.04, 0.04, 0.05, goldM, 0.94); cy2(p, 0.04, 0.04, 0.05, goldM, 0.6); cy2(p, 0.036, 0.036, 0.3, leatherM, -0.2); cy2(p, 0.02, 0.02, 0.06, steel2, -0.97, 6);
      const s = new THREE.Shape(); s.moveTo(0, 0.56); s.lineTo(0.4, 0.46); s.quadraticCurveTo(0.5, 0.22, 0.36, 0.0); s.lineTo(0, 0.14); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }); g.translate(0.02, 0, -0.015);
      const h = new THREE.Mesh(g, bladeM); h.position.y = 0.42; p.add(h); const hk = cone(p, 0.03, 0.24, steel2, 0.7, 5); hk.rotation.z = Math.PI / 2; hk.position.x = -0.12;
    },
    p => { // 10 warhammer
      cy2(p, 0.03, 0.03, 1.3, hwoodM, 0, 10); cy2(p, 0.036, 0.036, 0.3, leatherM, -0.3); wrap(p, -0.42, -0.18, 0.037, 5); ball(p, 0.05, goldM, -0.66);
      bx(p, 0.5, 0.22, 0.22, 0, 0.58, 0, ironM, 1); for (const s of [-1, 1]) bx(p, 0.04, 0.26, 0.26, s * 0.2, 0.58, 0, goldM, 1);
      const sp = cone(p, 0.05, 0.22, spikeM, 0.58, 4); sp.rotation.z = Math.PI / 2; sp.position.x = -0.35; cone(p, 0.05, 0.2, spikeM, 0.78, 4);
    },
    p => { // 11 staff
      cy2(p, 0.04, 0.03, 0.7, hwoodM, -0.55, 8).position.x = 0.01; cy2(p, 0.03, 0.04, 0.6, hwoodM, 0.05, 8).position.x = -0.015; cy2(p, 0.04, 0.03, 0.4, hwoodM, 0.55, 8);
      for (const [y, a] of [[-0.3, 0.8], [0.2, 3], [0.45, 5]]) { const k = ball(p, 0.045, hwoodM, y); k.position.x = Math.cos(a) * 0.035; k.position.z = Math.sin(a) * 0.035; }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, c = cone(p, 0.028, 0.34, hwoodM, 0.88, 6); c.position.set(Math.cos(a) * 0.09, 0.88, Math.sin(a) * 0.09); c.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25); }
      ball(p, 0.1, crystalM, 0.92); cy2(p, 0.03, 0.03, 0.2, leatherM, -0.2); wrap(p, -0.28, -0.12, 0.034, 4);
    },
    p => { // 12 scepter
      cy2(p, 0.03, 0.03, 1.0, goldM, 0, 12); for (const y of [-0.25, 0.1, 0.38]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 16), goldM); r.rotation.x = Math.PI / 2; r.position.y = y; p.add(r); }
      ball(p, 0.06, goldM, -0.52); ball(p, 0.07, goldM, 0.5);
      for (let i = 0; i < 5; i++) { const a = i * 1.2566, c = cone(p, 0.03, 0.2, goldM, 0.66, 5); c.position.set(Math.cos(a) * 0.09, 0.66, Math.sin(a) * 0.09); c.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
      ball(p, 0.08, gemMs[0], 0.64);
    },
  );
  WSCALE.push(1.3, 1.25, 1.3, 0.75, 1.0, 0.8, 1.3);
  const FAM = { sword: 0, axe: 1, spear: 2, mace: 3, bow: 4, dagger: 5, club: 6, crossbow: 7, flail: 8, halberd: 9, hammer: 10, staff: 11, scepter: 12 };
  const LEGACY_KEYS = ['w:sword', 'w:axe', 'w:spear', 'w:mace', 'w:bow', 'w:dagger'];
  const TIERS = {
    common: { col: 0xcfd8e0, size: 1, aura: 0 }, class: { col: 0xff9a3c, size: 1.05, aura: 0.25 },
    uncommon: { col: 0x6dff8a, size: 1.04, aura: 0.08, tint: [0xb4ffc4, 0x0c4a1a] }, rare: { col: 0x6aa8ff, size: 1.08, aura: 0.3, tint: [0x9cc4ff, 0x103a9a] },
    mythic: { col: 0xc08bff, size: 1.12, aura: 0.55, tint: [0xdcb6ff, 0x4a1a8a] }, transcendent: { col: 0x7ff4ff, size: 1.24, aura: 1.1, tint: [0xe8ffff, 0x1a5a8a], sparks: 10 }, legendary: { col: 0xffc040, size: 1.18, aura: 0.85, tint: [0xffe8a0, 0x8a5a00], sparks: 6 },
  };
  const itemOf = key => (window.GKITEMS && window.GKITEMS.ITEMS && window.GKITEMS.ITEMS[key]) || null;
  const hex6 = c => '#' + c.toString(16).padStart(6, '0');
  const tintCache = new Map();
  const tinted = (m, tier) => { const t = TIERS[tier]; if (!t || !t.tint) return m; const k = m.uuid + tier; let c = tintCache.get(k); if (!c) { c = m.clone(); c.color.multiply(new THREE.Color(t.tint[0])); c.emissive = new THREE.Color(t.tint[1]); c.emissiveIntensity = tier === 'uncommon' ? 0.35 : 0.8; tintCache.set(k, c); } return c; };
  const auraMats = {};
  const auraMat = tier => auraMats[tier] || (auraMats[tier] = new THREE.SpriteMaterial({ map: glowTex, color: TIERS[tier].col, transparent: true, opacity: 0.18 + 0.3 * TIERS[tier].aura, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const sparkMat = new THREE.SpriteMaterial({ map: glowTex, color: 0xfff2b0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const tierProtos = new Map(), keepGeo = new Set();
  chestProto.traverse(o => o.geometry && keepGeo.add(o.geometry));
  function tierProto(fam, tier) {
    const k = fam + '|' + tier; let w = tierProtos.get(k); if (w) return w;
    const t = TIERS[tier] || TIERS.common; w = getWeapon(fam).clone(); w.traverse(o => { if (o.geometry) keepGeo.add(o.geometry); if (o.isMesh && t.tint) o.material = tinted(o.material, tier); });
    w.scale.setScalar(t.size);
    if (t.aura > 0) { const s = new THREE.Sprite(auraMat(tier)); s.scale.setScalar(1.4 + t.aura * 1.4); s.position.y = 0.15; s.renderOrder = 4; w.add(s); }
    if (t.sparks) for (let i = 0; i < t.sparks; i++) { const s = new THREE.Sprite(sparkMat); s.scale.setScalar(0.1 + (i % 3) * 0.05); const a = i * 1.7; s.position.set(Math.cos(a) * 0.35, -0.5 + i * 0.22, Math.sin(a) * 0.35); w.add(s); }
    tierProtos.set(k, w); return w;
  }
  function armorModel(it) {
    const tier = it.tier || 'common', t = TIERS[tier] || TIERS.common, fam = it.family;
    const base = fam === 'cloth' ? 0x9a8a68 : fam === 'leather' ? 0x7a4e2c : fam === 'harness' ? 0x6a3a28 : fam === 'robe' ? 0x3a2a8a : fam === 'royal' ? 0x8a1020 : 0xaab3c0;
    const metal = fam === 'mail' || fam === 'plate';
    let mm = M(base, { roughness: metal ? 0.35 : 0.85, metalness: metal ? 0.9 : 0.05, envMapIntensity: metal ? 1.6 : 0.4 }); if (t.tint) mm = tinted(mm, tier);
    const g = new THREE.Group(), sc = 0.85 * t.size;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.62, 14), mm); g.add(body);
    for (const s of [-1, 1]) { const sh = ball(g, 0.15, mm, 0.28); sh.position.x = s * 0.34; sh.scale.set(1.1, 0.8, 1); const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.3, 10), mm); sl.position.set(s * 0.43, 0.14, 0); sl.rotation.z = s * 0.3; g.add(sl); }
    const nk = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 8, 14), mm); nk.rotation.x = Math.PI / 2; nk.position.y = 0.31; g.add(nk);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.07, 14), leatherM); belt.position.y = -0.12; g.add(belt); bx(g, 0.1, 0.09, 0.05, 0, -0.12, 0.28, goldM, 1);
    if (fam === 'plate') for (let i = 0; i < 3; i++) bx(g, 0.5, 0.025, 0.04, 0, 0.12 - i * 0.14, 0.31, goldM, 1);
    g.scale.setScalar(sc);
    const w = new THREE.Group(); w.add(g); if (t.aura > 0) { const s = new THREE.Sprite(auraMat(tier)); s.scale.setScalar(1.3 + t.aura * 1.3); w.add(s); }
    w.traverse(o => o.geometry && keepGeo.add(o.geometry)); return w;
  }
  const armorProtos = new Map();
  function weaponModel(key) {   // fresh Object3D for any item key ('w:axe', 'a:chain', ...), a family name or a legacy chest index; built along +y, ~1.5 m tall
    if (window.GKART) { const gm = GKART.model(key); if (gm) return gm; }   // ITEMART: custom sculpted model (itemart.js); the code below is the fallback
    if (typeof key === 'number') key = LEGACY_KEYS[key] || 'w:sword';
    let it = itemOf(key) || itemOf('w:' + key);
    if (!it) it = { type: 'weapon', family: FAM[String(key).replace(/^w:/, '')] != null ? String(key).replace(/^w:/, '') : 'sword', tier: 'common' };
    if (it.type === 'armor') { const k = it.key || key; let a = armorProtos.get(k); if (!a) armorProtos.set(k, a = armorModel(it)); return a.clone(); }
    const fam = FAM[it.family] != null ? FAM[it.family] : 0;
    return tierProto(fam, it.tier || 'common').clone();
  }
  const labelCache = new Map();
  const labelFor = key => {   // shared sprite material: 'Battle Axe · 30 dmg' in the tier colour
    if (typeof key === 'number') key = LEGACY_KEYS[key] || 'w:sword'; let m = labelCache.get(key); if (m) return m;
    const it = itemOf(key) || { name: String(key), attack: 0, tier: 'common' }, t = TIERS[it.tier] || TIERS.common;
    m = new THREE.SpriteMaterial({ map: textTex(it.name + (it.tierN ? ' · Tier ' + it.tierN : '') + (it.attack != null && it.type !== 'armor' ? ' \u00b7 ' + it.attack + ' dmg' : it.health ? ' \u00b7 ' + it.health + ' HP' : ''), hex6(t.col), 'rgba(12,8,4,.6)', 768, 96, 'bold 44px system-ui'), transparent: true, depthWrite: false, fog: false });
    labelCache.set(key, m); return m;
  };

  // ----- shared toolkit for the room interiors and the stations -----
  const CW = CS / 2, IN = CW - T / 2;
  let lastWeapons = null;                   // item keys from the server, one per CHEST_ROOMS entry
  const slots = [];                         // per outer room: { cr, g (shell group), shell, inner (rebuildable interior group), flames, built }
  const cacheM = new Map(), cache = (k, f) => { let v = cacheM.get(k); if (v === undefined) { v = f(); cacheM.set(k, v); } return v; };
  const kgeo = (k, f) => cache('g:' + k, () => { const g = f(); keepGeo.add(g); return g; });
  const mat = (k, f) => cache('m:' + k, f);
  const ctex = (k, w, h, draw, clamp = true) => cache('t:' + k, () => { const t = canvasTex(w, h, draw); if (clamp) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; });
  const GB = kgeo('box', () => new THREE.BoxGeometry(1, 1, 1)), GS = kgeo('sph', () => new THREE.SphereGeometry(1, 20, 14)), GC = kgeo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 20)), GN = kgeo('cone', () => new THREE.ConeGeometry(1, 1, 14)), GP = kgeo('pln', () => new THREE.PlaneGeometry(1, 1));
  const mkm = (p, geo, m, x, y, z, sx = 1, sy = sx, sz = sx) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); p.add(o); return o; };
  const sph = (p, m, x, y, z, a, b = a, c = a) => mkm(p, GS, m, x, y, z, a, b, c);
  const box = (p, m, x, y, z, w, h, d) => mkm(p, GB, m, x, y, z, w, h, d);
  const cyl2 = (p, m, x, y, z, r, h) => mkm(p, GC, m, x, y, z, r, h, r);
  const cne = (p, m, x, y, z, r, h) => mkm(p, GN, m, x, y, z, r, h, r);
  const pln = (p, m, x, y, z, w, h) => mkm(p, GP, m, x, y, z, w, h, 1);
  const tapG = (rt, rb, seg) => kgeo('tap' + rt + ',' + rb + ',' + seg, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
  const tap = (p, m, x, y, z, rt, rb, h, seg = 16) => mkm(p, tapG(rt, rb, seg), m, x, y, z, 1, h, 1);
  const tor = (p, m, x, y, z, r, tube) => mkm(p, kgeo('tor' + (tube / r).toFixed(3), () => new THREE.TorusGeometry(1, tube / r, 8, 24)), m, x, y, z, r);
  const tickList = [];                      // { root, fn(t, dt) }: run every frame while root is part of the scene
  const addTick = (root, fn) => tickList.push({ root, fn });
  const attached = o => { while (o.parent) o = o.parent; return o === scene; };
  const freezeTree = root => root.traverse(o => { if (chestDyn.has(o)) return; o.updateMatrix(); o.matrixAutoUpdate = false; });
  const dyn = o => { chestDyn.add(o); o.matrixAutoUpdate = true; return o; };
  const disposeTree = root => root.traverse(o => {
    chestDyn.delete(o);
    if (o.geometry && !keepGeo.has(o.geometry)) o.geometry.dispose();
    if (o.isInstancedMesh) o.dispose();
    if (o.material && o.material.userData && o.material.userData.own) o.material.dispose();
  });
  const targetsOf = (arr, pred) => { for (let i = arr.length; i--;) if (pred(arr[i])) arr.splice(i, 1); };
  GK.merchantTargets = GK.merchantTargets || []; GK.stationTargets = GK.stationTargets || [];
  const prune = () => {
    for (let i = chestSlots.length; i--;) if (!attached(chestSlots[i].holder)) chestSlots.splice(i, 1);
    for (let i = tickList.length; i--;) if (!attached(tickList[i].root)) tickList.splice(i, 1);
    targetsOf(GK.merchantTargets, o => !attached(o)); targetsOf(GK.stationTargets, o => !attached(o));
  };
  const nameSprites = new Map();
  const nameplate = (parent, text, x, y, z, w = 2.4, col = '#ffe9a8') => {   // floating label, readable from the overview camera
    let m = nameSprites.get(text + col); if (!m) nameSprites.set(text + col, m = new THREE.SpriteMaterial({ map: textTex(text, col, 'rgba(20,12,6,.7)', 512, 96, 'bold 52px system-ui'), transparent: true, depthWrite: false, fog: false }));
    const s = new THREE.Sprite(m); s.scale.set(w, w * 96 / 512, 1); s.position.set(x, y, z); s.renderOrder = 6; parent.add(s); return s;
  };
  const plaqueMats = new Map();
  const plaque = (parent, text, x, y, z, w, h, rotY = 0) => {   // framed brass plate on a wall or post (local +z faces the viewer)
    let m = plaqueMats.get(text); if (!m) plaqueMats.set(text, m = new THREE.MeshStandardMaterial({ map: canvasTex(512, 128, (g, cw, ch) => {
      g.fillStyle = '#2a1a0c'; g.fillRect(0, 0, cw, ch); g.strokeStyle = '#d9a82b'; g.lineWidth = 8; g.strokeRect(6, 6, cw - 12, ch - 12); g.lineWidth = 2; g.strokeRect(18, 18, cw - 36, ch - 36);
      g.fillStyle = '#ffe9a8'; g.font = 'bold 62px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, cw / 2, ch / 2 + 4);
    }), roughness: 0.6, metalness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.12 }));
    plaqueMats.get(text).emissiveMap = plaqueMats.get(text).map;
    const o = pln(parent, m, x, y, z, w, h); o.rotation.y = rotY; return o;
  };

  // ----- the chest kit: one implementation of the chest + dais + floating weapon -----
  function setSlotWeapon(s, k) {   // k: item key string ('w:axe'), family name or legacy index
    if (k == null) return; if (typeof k === 'number') k = LEGACY_KEYS[k]; if (!k) return;
    if (s.cur === k) return; s.cur = k;
    while (s.holder.children.length) s.holder.remove(s.holder.children[0]);
    const m = weaponModel(k); m.rotation.z = 0.35; s.holder.add(m);
    m.traverse(o => { o.matrixAutoUpdate = false; o.updateMatrix(); }); m.matrixAutoUpdate = true;
    const it = itemOf(k), t = TIERS[(it && it.tier) || 'common'] || TIERS.common;
    s.wglow.material.color.setHex(t.col); s.label.material = labelFor(k); s.label.visible = true; s.holder.updateMatrixWorld(true);
  }
  function chestKitBuild(parent, x, z, rotY, opts = {}) {
    const chest = chestProto.clone(); chest.position.set(x, 0, z); chest.rotation.y = rotY || 0; parent.add(chest);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: glowTex, color: 0xffb040, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); pool.material.userData.own = true; pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.02, 0.8); chest.add(pool);
    const sh = new THREE.Group(); sh.position.set(0, 1.0, 0); chest.add(sh);
    for (let k = 0; k < 2; k++) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.4), shaftM); pl.position.y = 1.7; pl.rotation.y = k * Math.PI / 2; pl.renderOrder = 3; sh.add(pl); }
    const glow = addGlow(chest, 0xffd060, 1.9, 0.6, 0, 1.2, 0); chestDyn.add(glow);
    const holder = new THREE.Group(); holder.position.set(0, 2.0, 0); chest.add(holder); chestDyn.add(holder);
    const wglow = addGlow(chest, 0xffffff, 1.8, 0.28, 0, 2.0, 0); chestDyn.add(wglow);
    const label = new THREE.Sprite(labelFor('w:sword')); label.scale.set(2.9, 0.43, 1); label.position.set(0, 3.75, 0); label.renderOrder = 5; chest.add(label); chestDyn.add(label); label.visible = false;
    const s = { holder, glow, wglow, label, cur: null, ph: (opts.id || 0) * 1.7 + (opts.id == null ? Math.random() * 6 : 0), base: 2.0, chest, id: opts.id };
    chestSlots.push(s); freezeTree(chest); s.setWeapon = k => setSlotWeapon(s, k);
    if (opts.weapon != null) setSlotWeapon(s, opts.weapon);
    return s;
  }
  GK.chestKit = { buildChest: chestKitBuild, weaponModel, labelFor, setWeapon: setSlotWeapon, dispose: root => { disposeTree(root); } };
  GK.disposeKit = root => { disposeTree(root); prune(); };
  // ----- chest rooms -----
  const roomTickUnused = [];
  for (const cr of CHEST_ROOMS) {
    const g = new THREE.Group(); g.position.set(cr.cx, 0, cr.cz); g.rotation.y = Math.atan2(-cr.dx, -cr.dz); scene.add(g);  // local +z faces the door
    const shell = { walls: [], bands: [], panels: [] };   // meshes whose material depends on the room type
    shell.floor = bx(g, CS, 0.4, CS, 0, -0.2, 0, cFloorM, CS);
    ceilings.push(shell.ceil = bx(g, CS + T, 0.3, CS + T, 0, H + 0.15, 0, cCeilM));
    for (const z of [-1.8, 1.4]) { const pn = bx(g, 2.4, 0.05, 1.2, 0, H - 0.03, z, cPanelM); shell.panels.push(pn); ceilings.push(pn, bx(g, 2.64, 0.04, 1.44, 0, H - 0.015, z, skirtM)); }
    const L = CS + T / 2;
    shell.walls.push(bx(g, CS + T, H, T, 0, H / 2, -CW, cWallM), bx(g, T, H, L, -CW, H / 2, -T / 4, cWallM), bx(g, T, H, L, CW, H / 2, -T / 4, cWallM));
    // skirting, gold band, cornice
    bx(g, 2 * IN, 0.28, 0.1, 0, 0.14, -IN + 0.05, skirtM); for (const s of [-1, 1]) bx(g, 0.1, 0.28, 2 * IN, s * (IN - 0.05), 0.14, 0, skirtM);
    shell.bands.push(bx(g, 2 * IN, 0.08, 0.05, 0, 1.3, -IN + 0.025, goldM)); for (const s of [-1, 1]) shell.bands.push(bx(g, 0.05, 0.08, 2 * IN, s * (IN - 0.025), 1.3, 0, goldM));
    bx(g, 2 * IN, 0.2, 0.1, 0, H - 0.1, -IN + 0.05, skirtM); for (const s of [-1, 1]) bx(g, 0.1, 0.2, 2 * IN, s * (IN - 0.05), H - 0.1, 0, skirtM);
    const inner = new THREE.Group(); g.add(inner); slots.push({ cr, g, shell, inner, flames: [], built: null });
  }
  function buildChest(slot) {   // banners, torches and the chest with its floating weapon
    const cr = slot.cr, g = slot.inner, flames = [];
    // wall banners
    for (const bxp of [-2.6, 2.6]) { const b = bx(g, 0.9, 2.4, 0.04, bxp, 3.5, -IN + 0.03, clothM, 1); bx(g, 1.0, 0.07, 0.07, bxp, 4.74, -IN + 0.04, goldM, 1); const em = bx(g, 0.3, 0.3, 0.02, bxp, 3.6, -IN + 0.07, goldM, 1); em.rotation.z = Math.PI / 4; }
    // torches
    for (const [tx, tz, ry] of [[-1.3, -IN, 0], [1.3, -IN, 0], [-IN, 1.9, Math.PI / 2], [IN, 1.9, -Math.PI / 2], [-IN, -1.9, Math.PI / 2], [IN, -1.9, -Math.PI / 2]]) {
      const t = new THREE.Group(); t.position.set(tx, 2.7, tz); t.rotation.y = ry; g.add(t);       // local +z points into the room
      bx(t, 0.14, 0.14, 0.08, 0, 0, 0.04, ironM, 1); const arm = cy2(t, 0.025, 0.025, 0.3, ironM, 0); arm.rotation.x = Math.PI / 2; arm.position.z = 0.15;
      const cup = cy2(t, 0.1, 0.06, 0.16, ironM, 0.1, 10); cup.position.z = 0.3; const stick = cy2(t, 0.04, 0.04, 0.3, hwoodM, 0.25, 8); stick.position.z = 0.3;
      const f = cone(t, 0.09, 0.3, flameM, 0.5, 8); f.position.z = 0.3; const f2 = cone(t, 0.05, 0.2, flame2M, 0.46, 8); f2.position.z = 0.3;
      const gl = addGlow(t, 0xff8a2a, 2.6, 0.75, 0, 0.5, 0.35); flames.push({ f, f2, gl, ph: rnd() * 9 }); chestDyn.add(f); chestDyn.add(f2); chestDyn.add(gl);
    }
    // chest + dais, facing the door (+z local)
    const kc = chestKitBuild(g, 0, -1.2, 0, { id: cr.id }); if (lastWeapons) kc.setWeapon(lastWeapons[cr.id]);
    slot.flames = flames;
  }
  // static world: freeze matrices of everything we built except animated pieces
  scene.updateMatrixWorld(true);
  for (const s of slots) freezeTree(s.g);
  // ===== room interiors: (re)built from the random layout; the shell (floor, walls, ceiling, lights) is built once and only retinted =====
  const SHELL = {};
  function shellMats(type) {
    if (type === 'chest') return { floor: cFloorM, wall: cWallM, ceil: cCeilM, panel: cPanelM, band: goldM };
    return SHELL[type] || (SHELL[type] = type === 'mystery' ? mysteryShell() : merchantShell());
  }
  function buildInterior(slot) {
    const cr = slot.cr, type = cr.type;
    if (slot.mg) { GK.disposeMysteryContents && GK.disposeMysteryContents(slot.mg); slot.mg = null; }
    disposeTree(slot.inner); slot.g.remove(slot.inner);
    targetsOf(GK.merchantTargets, o => o.userData.roomId === cr.id); targetsOf(GK.stationTargets, o => o.userData.roomId === cr.id);
    slot.inner = new THREE.Group(); slot.g.add(slot.inner); slot.flames = [];
    const m = shellMats(type), sh = slot.shell;
    sh.floor.material = m.floor; sh.ceil.material = m.ceil; for (const w of sh.walls) w.material = m.wall; for (const p of sh.panels) p.material = m.panel; for (const b of sh.bands) b.material = m.band;
    (type === 'mystery' ? buildMystery : type === 'merchant' ? buildMerchant : buildChest)(slot);
    freezeTree(slot.inner);
    if (type === 'mystery') {   // contents of the mystery room (separate agent): a group in the room's local frame, origin = room centre on the floor, +z toward the door
      const mg = new THREE.Group(); mg.name = 'mysteryContents'; slot.inner.add(mg); slot.mg = mg;
      if (GK.buildMysteryContents) { try { GK.buildMysteryContents(cr, mg, cr.mystery); } catch (e) { console.error(e); } }
    }
    slot.built = type; prune();
  }
  const rebuildAll = () => { for (const s of slots) { if (s.built === s.cr.type && s.cr.type !== 'mystery') continue; buildInterior(s); } };
  layoutHooks.push(rebuildAll);
  if (GK.layout) rebuildAll(); else setTimeout(() => { if (!GK.layout) rebuildAll(); }, 4000);   // no layout from the server: show the defaults
  // ===== MYSTERY ROOM: violet shell, glowing rune circle, mist, a high floating question mark; the floor and centre stay free for the contents =====
  const qGlyph = (key, fg, glow) => ctex('q' + key, 256, 256, (g, w, h) => { g.font = 'bold 210px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = glow; g.shadowBlur = 26; g.fillStyle = fg; g.fillText('?', w / 2, h / 2 + 14); g.shadowBlur = 8; g.fillText('?', w / 2, h / 2 + 14); });
  function mysteryShell() {
    const rr = (() => { let s = 99; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
    const runes = (g, col, w) => {
      const C = 512; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [r, lw] of [[420, 10], [390, 3], [320, 6], [250, 3]]) { g.lineWidth = lw * w; g.beginPath(); g.arc(C, C, r, 0, 7); g.stroke(); }
      g.lineWidth = 4 * w; for (let k = 0; k < 2; k++) { g.beginPath(); for (let i = 0; i < 3; i++) { const a = k * Math.PI / 3 + i * 2.0944 - Math.PI / 2; g.lineTo(C + Math.cos(a) * 320, C + Math.sin(a) * 320); } g.closePath(); g.stroke(); }
      for (let i = 0; i < 24; i++) {   // rune ticks between the outer rings
        const a = i / 24 * 6.2832, c = Math.cos(a), s = Math.sin(a), px = -s, py = c; g.lineWidth = 4 * w; g.beginPath();
        let x = C + c * 405, y = C + s * 405; g.moveTo(x - px * 10, y - py * 10);
        for (let j = 0; j < 3; j++) { x = C + c * (396 + rr() * 22) + px * (rr() * 22 - 11); y = C + s * (396 + rr() * 22) + py * (rr() * 22 - 11); g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = col; g.font = 'bold 110px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 6; i++) { const a = i * 1.0472 - Math.PI / 2; g.fillText('?', C + Math.cos(a) * 285, C + Math.sin(a) * 285 + 8); }
    };
    const emi = ctex('myfloorE', 1024, 1024, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); runes(g, '#9a6bff', 1); }, false);
    const tex = ctex('myfloor', 1024, 1024, (g, w, h) => {
      g.fillStyle = '#1a1236'; g.fillRect(0, 0, w, h);
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) { g.fillStyle = `rgba(${(tx + ty) & 1 ? '70,50,140' : '10,5,30'},${0.2 + rr() * 0.15})`; g.fillRect(tx * 128, ty * 128, 128, 128); g.strokeStyle = 'rgba(150,120,255,.22)'; g.lineWidth = 2; g.strokeRect(tx * 128 + 1, ty * 128 + 1, 126, 126); }
      speckle(g, w, h, 5000, 6, 0.1); runes(g, 'rgba(190,150,255,.55)', 1);
    }, false);
    return {
      floor: M(0xffffff, { map: tex, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.3, metalness: 0.25, envMapIntensity: 0.8 }),
      wall: M(0x5a4a9a, { map: plasterTex, bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.9, envMapIntensity: 0.25, emissive: 0x1c0e56, emissiveIntensity: 0.55 }),
      ceil: M(0x3a2e78, { map: plasterTex, roughness: 0.95, emissive: 0x3a2a86, emissiveIntensity: 0.6 }),
      panel: new THREE.MeshBasicMaterial({ color: 0xb59cff, toneMapped: false }),
      band: M(0x8a5cff, { metalness: 0.5, roughness: 0.4, emissive: 0x7a44ff, emissiveIntensity: 1.3 }),
    };
  }
  function buildMystery(slot) {
    const g = slot.inner, cr = slot.cr;
    const violetF = mat('vflame', () => new THREE.MeshBasicMaterial({ color: 0xa266ff, toneMapped: false })), violetF2 = mat('vflame2', () => new THREE.MeshBasicMaterial({ color: 0xece0ff, toneMapped: false }));
    const goldQ = mat('qgoldDecal', () => new THREE.MeshBasicMaterial({ map: qGlyph('gold', '#ffd76a', '#ff9a20'), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const purpQ = mat('qpurpDecal', () => new THREE.MeshBasicMaterial({ map: qGlyph('purp', '#d9bfff', '#8a4cff'), transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    // --- the floating question mark, high above the floor ---
    const qM = mat('qbody', () => M(0x7a3cff, { metalness: 0.45, roughness: 0.28, emissive: 0x8a3cff, emissiveIntensity: 1.1, envMapIntensity: 1.2 })), qDot = mat('qdot', () => M(0xffd05a, { metalness: 1, roughness: 0.25, emissive: 0xff9a10, emissiveIntensity: 1.1, envMapIntensity: 1.6 }));
    const qCurve = pts => new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], 0)));
    const hookPts = []; for (let a = 200; a >= -70; a -= 22.5) { const r = a * Math.PI / 180; hookPts.push([Math.cos(r) * 0.55, 0.85 + Math.sin(r) * 0.55]); } hookPts.push([0.1, 0.18], [0.0, -0.12], [0.0, -0.34]);
    const qGeo = kgeo('qtube', () => new THREE.TubeGeometry(qCurve(hookPts), 90, 0.13, 12, false)), qHalo = kgeo('qtube2', () => new THREE.TubeGeometry(qCurve(hookPts), 60, 0.24, 8, false));
    const haloM = mat('qhalo', () => new THREE.MeshBasicMaterial({ color: 0x8a50ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false }));
    const qg = dyn(new THREE.Group()); qg.position.set(0, 4.35, 0); qg.scale.setScalar(1.1); g.add(qg);
    mkm(qg, qGeo, qM, 0, 0, 0); mkm(qg, qHalo, haloM, 0, 0, 0); sph(qg, qDot, 0, -0.82, 0, 0.17);
    const cap = sph(qg, qDot, 0, -0.34, 0, 0.14, 0.06, 0.14);
    const ring = dyn(new THREE.Group()); ring.position.set(0, 0.3, 0); qg.add(ring); const rg = tor(ring, qDot, 0, 0, 0, 1.1, 0.025); rg.rotation.x = Math.PI / 2.4; const rg2 = tor(ring, qM, 0, 0, 0, 0.9, 0.018); rg2.rotation.x = -Math.PI / 2.2; rg2.rotation.y = 0.6;
    const hs = addGlow(qg, 0x8a50ff, 5.2, 0.5, 0, 0.3, 0), hs2 = addGlow(qg, 0xffc060, 2.4, 0.35, 0, 0.3, 0); dyn(hs); dyn(hs2);
    const beam = mkm(g, tapG(0.12, 0.9, 20), mat('qbeam', () => new THREE.MeshBasicMaterial({ color: 0x8a50ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), 0, 1.6, 0, 1, 3.2, 1);
    const flameList = [];
    // --- wall dressing: tapestries, rune tablets, violet sconces ---
    const tapM = mat('tap', () => new THREE.MeshStandardMaterial({ map: ctex('tap', 256, 640, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3a1a7a'); gr.addColorStop(1, '#190a40'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#d9a82b'; c.lineWidth = 10; c.strokeRect(10, 10, w - 20, h - 50); c.lineWidth = 3; c.strokeRect(26, 26, w - 52, h - 82);
      c.fillStyle = '#d9a82b'; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(i * 32 + 4, h - 40); c.lineTo(i * 32 + 28, h - 40); c.lineTo(i * 32 + 16, h); c.fill(); }
      c.shadowColor = '#ffb030'; c.shadowBlur = 24; c.fillStyle = '#ffd76a'; c.font = 'bold 300px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w / 2, h / 2 - 10);
      c.shadowBlur = 0; c.fillStyle = '#b894ff'; for (let i = 0; i < 14; i++) { const x = 40 + (i * 53) % 176, y = 50 + (i * 97) % 480; star4(c, x, y, 5 + i % 3 * 2); }
    }), roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.4 }));
    tapM.emissiveMap = tapM.map;
    const plM = mat('tabl', () => { const t = ctex('tabl', 256, 320, (c, w, h) => {
      c.fillStyle = '#17112e'; rrect(c, 4, 4, w - 8, h - 8, 26); c.fill(); c.strokeStyle = '#9a6bff'; c.lineWidth = 8; c.shadowColor = '#9a6bff'; c.shadowBlur = 14; rrect(c, 12, 12, w - 24, h - 24, 22); c.stroke(); c.shadowBlur = 0; c.strokeStyle = '#4a3a8a'; c.lineWidth = 3; rrect(c, 28, 28, w - 56, h - 56, 14); c.stroke();
      c.shadowColor = '#b48cff'; c.shadowBlur = 30; c.fillStyle = '#e0ccff'; c.font = 'bold 230px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w / 2, h / 2 + 14);
    }); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.6 }); });
    for (const x of [-2.6, 2.6]) { const t = pln(g, tapM, x, 3.45, -IN + 0.05, 1.1, 2.75); box(g, goldM, x, 4.88, -IN + 0.07, 1.3, 0.08, 0.1); for (const s of [-1, 1]) sph(g, goldM, x + s * 0.62, 4.88, -IN + 0.07, 0.07); }
    for (const [x, z, ry] of [[-IN + 0.04, 0, Math.PI / 2], [IN - 0.04, 0, -Math.PI / 2], [-IN + 0.04, -2.2, Math.PI / 2], [IN - 0.04, -2.2, -Math.PI / 2]]) { const p = pln(g, plM, x, 2.9, z, 0.9, 1.125); p.rotation.y = ry; }
    { const p = pln(g, plM, 0, 3.4, -IN + 0.04, 1.0, 1.25); }
    for (const [sx, sz, ry] of [[-IN, 2.4, Math.PI / 2], [IN, 2.4, -Math.PI / 2], [-IN, -1.1, Math.PI / 2], [IN, -1.1, -Math.PI / 2], [-1.3, -IN, 0], [1.3, -IN, 0]]) {
      const t = new THREE.Group(); t.position.set(sx, 2.5, sz); t.rotation.y = ry; g.add(t);
      box(t, ironM, 0, 0, 0.04, 0.14, 0.14, 0.08); cyl2(t, ironM, 0, 0, 0.15, 0.025, 0.3).rotation.x = Math.PI / 2; tap(t, ironM, 0, 0.1, 0.3, 0.13, 0.06, 0.16, 10);
      const f = dyn(cne(t, violetF, 0, 0.34, 0.3, 0.09, 0.3)), f2 = dyn(cne(t, violetF2, 0, 0.3, 0.3, 0.05, 0.2)), gl = dyn(addGlow(t, 0x8a50ff, 2.6, 0.7, 0, 0.36, 0.35));
      flameList.push({ f, f2, gl, ph: Math.random() * 9 });
    }
    // --- corner props: sealed crates and urns with '?' glyphs ---
    const woodD = mat('mywood', () => M(0xffffff, { map: woodTex, color: 0x8a78b8, roughness: 0.8, emissive: 0x120a30, emissiveIntensity: 0.4 }));
    const crate = (x, z, s, ry, y0 = 0) => {
      const c = new THREE.Group(); c.position.set(x, y0, z); c.rotation.y = ry; g.add(c);
      bx(c, s, s, s, 0, s / 2, 0, woodD, 1); for (const k of [-0.28, 0.28]) { box(c, ironM, 0, s / 2, k * s * 1.2 * 0.8, s * 1.02, s * 0.12, s * 0.12); box(c, ironM, k * s * 1.2 * 0.8, s / 2, 0, s * 0.12, s * 1.02, s * 1.02); }
      for (const [dx, dz, r] of [[0, 1, 0], [1, 0, Math.PI / 2]]) { const q = pln(c, goldQ, dx * (s / 2 + 0.012), s / 2, dz * (s / 2 + 0.012), s * 0.62, s * 0.62); q.rotation.y = r; }
      const seal = sph(c, mat('wax', () => M(0xb01830, { roughness: 0.4, emissive: 0x500010, emissiveIntensity: 0.8 })), 0, s * 0.82, s / 2 + 0.01, 0.07, 0.07, 0.03);
      return c;
    };
    crate(-2.95, -2.95, 0.95, 0.15); crate(-2.9, -2.9, 0.62, -0.5, 0.95); crate(-1.95, -3.2, 0.5, 0.3);
    const urnGeo = kgeo('urn', () => { const pts = [[0, 0], [0.28, 0], [0.34, 0.08], [0.44, 0.3], [0.46, 0.5], [0.38, 0.75], [0.22, 0.88], [0.24, 0.98], [0.32, 1.06], [0.3, 1.1], [0.0, 1.1]].map(p => new THREE.Vector2(p[0], p[1])); return new THREE.LatheGeometry(pts, 24); });
    const urnM = mat('urn', () => M(0x4a3a8a, { metalness: 0.25, roughness: 0.4, emissive: 0x20105a, emissiveIntensity: 0.7, envMapIntensity: 1.2 }));
    for (const [x, z, s, ry] of [[2.9, -2.9, 1.05, 0.2], [2.0, -3.15, 0.75, -0.3], [3.2, -1.7, 0.7, 0.5]]) {
      const u = new THREE.Group(); u.position.set(x, 0, z); u.rotation.y = ry; u.scale.setScalar(s); g.add(u);
      mkm(u, urnGeo, urnM, 0, 0, 0); tor(u, goldM, 0, 0.78, 0, 0.4, 0.02); pln(u, purpQ, 0, 0.5, 0.474, 0.42, 0.42);
    }
    // --- mist and floating motes (additive, no lights) ---
    const mistM = mat('mist', () => new THREE.SpriteMaterial({ map: glowTex, color: 0x6a48ff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const mist = []; for (let i = 0; i < 11; i++) { const s = dyn(new THREE.Sprite(mistM)); const a = i * 2.4, r = 1.2 + (i % 4) * 0.7; s.scale.set(3.4, 2, 1); s.userData.m = { a, r, sp: 0.12 + (i % 3) * 0.05, y: 0.3 + (i % 3) * 0.18 }; s.position.set(Math.cos(a) * r, s.userData.m.y, Math.sin(a) * r); g.add(s); mist.push(s); }
    const N = 80, pp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = Math.random() * 6.283, r = 0.4 + Math.random() * 3.1; pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = 0.3 + Math.random() * 5; pp[i * 3 + 2] = Math.sin(a) * r; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const motes = dyn(new THREE.Points(pg, mat('motes', () => new THREE.PointsMaterial({ map: glowTex, color: 0xc0a4ff, size: 0.2, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })))); motes.frustumCulled = false; g.add(motes);
    addTick(g, (t) => {
      qg.position.y = 4.35 + Math.sin(t * 0.9 + cr.id) * 0.15; qg.rotation.y = t * 0.45 + cr.id; ring.rotation.y = t * 0.8; ring.rotation.z = Math.sin(t * 0.5) * 0.3;
      hs.material.opacity = 0.42 + 0.12 * Math.sin(t * 2.1); beam.material.opacity = 0.045 + 0.02 * Math.sin(t * 1.3);
      motes.rotation.y = t * 0.03; motes.position.y = Math.sin(t * 0.4) * 0.15;
      for (const s of mist) { const m = s.userData.m, a = m.a + t * m.sp; s.position.set(Math.cos(a) * m.r, m.y + Math.sin(t * 0.5 + m.a) * 0.06, Math.sin(a * 0.8) * m.r * 0.8); }
      for (const q of flameList) { const k = 1 + 0.12 * Math.sin(t * 17 + q.ph) + 0.08 * Math.sin(t * 29 + q.ph * 2); q.f.scale.set(0.09 * k * 0.95, 0.3 * k, 0.09 * k * 0.95); q.f2.scale.set(0.05 * k, 0.2 * (0.9 + (k - 1) * 2), 0.05 * k); q.gl.material.opacity = 0.6 + (k - 1) * 1.4; }
    });
  }
  // ===== STATIONS: recycler, knowledge tree, workbench. Local frame: origin = floor centre of the station, +z = front (where the player stands), back wall at z = -0.5 =====
  const gearGeo = n => kgeo('gear' + n, () => {
    const s = new THREE.Shape(), steps = n * 4; for (let i = 0; i <= steps; i++) { const a = i / steps * Math.PI * 2, r = (i & 3) < 2 ? 1 : 0.8; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) s.lineTo(x, y); else s.moveTo(x, y); }
    const h = new THREE.Path(); h.absarc(0, 0, 0.25, 0, Math.PI * 2, true); s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); return g;
  });
  const gear = (p, m, x, y, z, r, th, n = 10) => mkm(p, gearGeo(n), m, x, y, z, r, r, th);
  const stationReg = new Map();   // roomId (or object) -> { recycler, workbench } for the feedback hooks
  const regStation = (kind, obj, roomId) => {
    obj.userData.station = kind; if (roomId != null) { obj.userData.roomId = roomId; GK.stationTargets.push(obj); }
    const k = roomId != null ? roomId : 'x' + obj.id, e = stationReg.get(k) || {}; e[kind] = obj; stationReg.set(k, e);
  };
  const proxyM = mat('proxy', () => new THREE.MeshBasicMaterial({ visible: false }));
  const steelDark = mat('steelDark', () => M(0x3a3f47, { metalness: 0.8, roughness: 0.45, envMapIntensity: 1 }));
  const brassM = mat('brass', () => M(0xc89a3a, { metalness: 1, roughness: 0.35, envMapIntensity: 1.4, emissive: 0x3a2200, emissiveIntensity: 0.3 }));
  const sparkPts = (parent, n, col) => {   // a burst of sparks (Points), hidden until used
    const pg = new THREE.BufferGeometry(), arr = new Float32Array(n * 3); pg.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = dyn(new THREE.Points(pg, mat('spark' + col, () => new THREE.PointsMaterial({ map: glowTex, color: col, size: 0.14, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })))); pts.frustumCulled = false; pts.visible = false; parent.add(pts);
    pts.userData.v = Array.from({ length: n }, () => [(Math.random() - 0.5) * 1.6, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6]); return pts;
  };
  const runSparks = (pts, age, dur, org) => {
    pts.visible = age >= 0 && age < dur; if (!pts.visible) return; const a = pts.geometry.attributes.position, v = pts.userData.v;
    for (let i = 0; i < v.length; i++) a.setXYZ(i, org[0] + v[i][0] * age * 0.6, org[1] + v[i][1] * age - 3.2 * age * age, org[2] + v[i][2] * age * 0.6); a.needsUpdate = true; pts.material.opacity = 1;
  };
  const recycleTex = () => ctex('recycle', 256, 256, (g, w, h) => {
    g.fillStyle = '#10241a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2fbf5a'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.translate(128, 132); g.strokeStyle = '#4cf07a'; g.fillStyle = '#4cf07a'; g.lineWidth = 22; g.lineCap = 'butt';
    for (let k = 0; k < 3; k++) { const a0 = k * 2.0944 - 1.9, a1 = a0 + 1.35; g.beginPath(); g.arc(0, 0, 62, a0, a1); g.stroke(); const ex = Math.cos(a1) * 62, ey = Math.sin(a1) * 62, tx = -Math.sin(a1), ty = Math.cos(a1), nx = Math.cos(a1), ny = Math.sin(a1); g.beginPath(); g.moveTo(ex + nx * 30, ey + ny * 30); g.lineTo(ex - nx * 30, ey - ny * 30); g.lineTo(ex + tx * 38, ey + ty * 38); g.closePath(); g.fill(); }
  });
  const beltTex = (() => { const t = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#1b1d20'; g.fillRect(0, 0, w, h); g.strokeStyle = '#3a3f46'; g.lineWidth = 8; for (let i = -1; i < 5; i++) { g.beginPath(); g.moveTo(i * 32, h); g.lineTo(i * 32 + 16, h / 2); g.lineTo(i * 32, 0); g.stroke(); } g.fillStyle = '#c8a020'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4); }, false); t.repeat.set(2, 1); return t; })();
  function buildRecycler(parent, x, z, rotY = 0, roomId) {
    const R = new THREE.Group(); R.position.set(x, 0, z); R.rotation.y = rotY; parent.add(R);
    const body = mat('recBody', () => M(0x4f6a5a, { metalness: 0.55, roughness: 0.45, envMapIntensity: 0.9 })), trim = steelDark;
    const glowGreen = new THREE.MeshBasicMaterial({ color: 0x40ff80, toneMapped: false }), glowAmber = new THREE.MeshBasicMaterial({ color: 0xffb030, toneMapped: false }), glowRed = new THREE.MeshBasicMaterial({ color: 0xff3030, toneMapped: false });
    for (const m of [glowGreen, glowAmber, glowRed]) m.userData.own = true;
    box(R, trim, 0, 0.08, 0, 1.5, 0.16, 1.2); box(R, body, 0, 0.88, 0, 1.4, 1.45, 1.1);
    for (const s of [-1, 1]) { box(R, trim, s * 0.71, 0.88, 0, 0.06, 1.5, 1.14); }
    box(R, trim, 0, 1.64, 0, 1.46, 0.1, 1.16);
    const hop = tap(R, mat('hopper', () => M(0x6a7a72, { metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide })), 0, 2.05, 0, 0.74, 0.42, 0.78, 4); hop.rotation.y = Math.PI / 4; hop.scale.set(1, 0.78, 1);
    const rim = box(R, trim, 0, 2.46, 0.52, 1.1, 0.08, 0.08); box(R, trim, 0, 2.46, -0.52, 1.1, 0.08, 0.08); box(R, trim, 0.52, 2.46, 0, 0.08, 0.08, 1.1); box(R, trim, -0.52, 2.46, 0, 0.08, 0.08, 1.1);
    const sc = new THREE.InstancedMesh(kgeo('scrapbox', () => new THREE.BoxGeometry(0.2, 0.12, 0.16)), mat('scrapM', () => M(0xffffff, { metalness: 0.5, roughness: 0.6 })), 22), d = new THREE.Object3D(), cols = [0x8a8f98, 0x9a6a3a, 0xb8a070, 0x5a6a8a, 0x7a4a3a, 0xc9c0a8];
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 0.38; d.position.set(Math.cos(a) * r, 2.22 + Math.random() * 0.22, Math.sin(a) * r); d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); d.scale.setScalar(0.7 + Math.random() * 0.8); d.updateMatrix(); sc.setMatrixAt(i, d.matrix); sc.setColorAt(i, new THREE.Color(cols[i % 6])); } R.add(sc);
    // shredder rollers peeking out of the hopper throat
    const rollM = mat('roller', () => M(0x9aa2ad, { metalness: 0.9, roughness: 0.3, envMapIntensity: 1.5 })), rolls = [];
    for (const s of [-1, 1]) { const rl = dyn(new THREE.Group()); rl.position.set(0, 1.78, s * 0.13); R.add(rl); for (let i = 0; i < 6; i++) box(rl, rollM, 0, 0, 0, 0.78, 0.06, 0.06).rotation.x = i * Math.PI / 6; cyl2(rl, rollM, 0, 0, 0, 0.09, 0.8).rotation.z = Math.PI / 2; rolls.push([rl, s]); }
    // front: emblem, indicator lights, gears
    pln(R, mat('recEmblem', () => new THREE.MeshStandardMaterial({ map: recycleTex(), emissiveMap: recycleTex(), emissive: 0xffffff, emissiveIntensity: 0.7, roughness: 0.5 })), 0, 1.2, 0.556, 0.62, 0.62);
    box(R, trim, 0, 0.66, 0.56, 0.42, 0.14, 0.03); const l1 = sph(R, glowRed, -0.13, 0.66, 0.585, 0.045), l2 = sph(R, glowAmber, 0, 0.66, 0.585, 0.045), l3 = sph(R, glowGreen, 0.13, 0.66, 0.585, 0.045);
    const flash = new THREE.Mesh(GP, new THREE.MeshBasicMaterial({ color: 0x40ff80, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); flash.material.userData.own = true; flash.position.set(0, 1.2, 0.575); flash.scale.set(0.7, 0.7, 1); R.add(flash); dyn(flash);
    const gears = [[-0.4, 0.34, 0.2, 10, 1], [0.0, 0.34, 0.16, 8, -1.25], [0.4, 0.34, 0.14, 7, 1.43]].map(([gx, gy, r, n, sp]) => { const gm = dyn(gear(R, brassM, gx, gy, 0.58, r, 0.05, n)); return { gm, sp }; });
    // conveyor feeding the machine from the +x side
    const belt = new THREE.Group(); belt.position.set(1.18, 0, 0); R.add(belt);
    box(belt, trim, 0, 0.68, 0, 0.9, 0.12, 0.64); for (const sz of [-1, 1]) box(belt, trim, 0, 0.76, sz * 0.31, 0.9, 0.06, 0.04); for (const sx of [-0.38, 0.38]) for (const sz of [-0.26, 0.26]) box(belt, trim, sx, 0.3, sz, 0.06, 0.6, 0.06);
    const bt = mkm(belt, GP, mat('beltM', () => new THREE.MeshStandardMaterial({ map: beltTex, roughness: 0.8 })), 0, 0.745, 0, 0.84, 0.52, 1); bt.rotation.x = -Math.PI / 2;
    const brolls = [-0.43, 0.43].map(bxp => { const r = dyn(new THREE.Group()); r.position.set(bxp, 0.72, 0); belt.add(r); const c = cyl2(r, rollM, 0, 0, 0, 0.07, 0.6); c.rotation.x = Math.PI / 2; box(r, trim, 0, 0.07, 0, 0.02, 0.02, 0.5); return r; });
    const itemMs = [mat('it1', () => M(0xb8a070, { roughness: 0.8 })), mat('it2', () => M(0x8a8f98, { metalness: 0.8, roughness: 0.4 })), mat('it3', () => M(0x7a4a3a, { roughness: 0.8 }))];
    const items = [0, 1, 2].map(i => { const o = dyn(new THREE.Group()); belt.add(o); if (i === 1) tor(o, itemMs[1], 0, 0.06, 0, 0.07, 0.025).rotation.x = Math.PI / 2; else box(o, itemMs[i], 0, 0.06, 0, 0.14, 0.1 + i * 0.03, 0.12); o.userData.ph = i / 3; return o; });
    // bin of scraps in front of the machine
    const bin = new THREE.Group(); bin.position.set(-0.5, 0, 0.95); R.add(bin);
    const binM = mat('binM', () => M(0x59504a, { metalness: 0.5, roughness: 0.7 }));
    box(bin, binM, 0, 0.3, 0.3, 0.7, 0.6, 0.05); box(bin, binM, 0, 0.3, -0.3, 0.7, 0.6, 0.05); box(bin, binM, 0.35, 0.3, 0, 0.05, 0.6, 0.65); box(bin, binM, -0.35, 0.3, 0, 0.05, 0.6, 0.65); box(bin, binM, 0, 0.03, 0, 0.7, 0.06, 0.65);
    for (let i = 0; i < 9; i++) { const o = box(bin, itemMs[i % 3], (Math.random() - 0.5) * 0.45, 0.45 + Math.random() * 0.1, (Math.random() - 0.5) * 0.4, 0.12 + Math.random() * 0.1, 0.1, 0.1 + Math.random() * 0.08); o.rotation.set(Math.random(), Math.random() * 3, Math.random()); }
    // exhaust stack + labels
    cyl2(R, trim, 0.5, 2.0, -0.38, 0.07, 1.0); tap(R, trim, 0.5, 2.55, -0.38, 0.1, 0.07, 0.1, 10);
    plaque(R, 'RECYCLER', 0, 3.0, -0.48, 1.6, 0.4); nameplate(R, 'RECYCLER', 0, 3.75, 0, 2.2, '#8ff0a8');
    const sparks = sparkPts(R, 28, 0xffb050), puffM = mat('puff', () => new THREE.SpriteMaterial({ map: glowTex, color: 0xc8c0b0, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    const puffs = [0, 1, 2, 3].map(i => { const s = dyn(new THREE.Sprite(puffM.clone())); s.material.userData.own = true; s.visible = false; R.add(s); return s; });
    const proxy = mkm(R, GB, proxyM, 0.5, 1.3, 0.2, 3.0, 2.8, 1.6); R.userData.fb = -1; R.userData.proxy = proxy;
    regStation('recycler', R, roomId);
    let age = -1;
    addTick(R, (t, dt) => {
      if (R.userData.fb >= 0) { age = performance.now() / 1000 - R.userData.fb; if (age > 1.6) { R.userData.fb = -1; age = -1; } } else age = -1;
      const run = age >= 0, sp = run ? 7 : 0.9;
      for (const [rl, s] of rolls) rl.rotation.z += -s * sp * dt * 1.5;   // counter-rotating shredder rollers
      for (const q of gears) q.gm.rotation.z += q.sp * sp * dt * 0.8;
      for (const r of brolls) r.rotation.z -= sp * 0.5 * dt * 3; beltTex.offset.x = (beltTex.offset.x - dt * (run ? 0.7 : 0.12)) % 1;
      for (const o of items) { const u = ((o.userData.ph + t * (run ? 0.5 : 0.1)) % 1); o.position.set(0.4 - u * 0.8, 0.745, 0); o.rotation.y = u * 6; }
      const blink = 0.5 + 0.5 * Math.sin(t * (run ? 14 : 2.2)); glowGreen.color.setScalar(1).multiply(new THREE.Color(0x40ff80)).multiplyScalar(run ? 1.6 : 0.5 + 0.7 * blink); glowAmber.color.setHex(run ? 0x604010 : 0xffb030); glowRed.color.setHex(0x601010);
      flash.material.opacity = run ? Math.max(0, 0.5 - age * 0.6) * (0.6 + 0.4 * Math.sin(age * 30)) : 0;
      runSparks(sparks, age, 1.2, [0, 2.3, 0]);
      puffs.forEach((p, i) => { const a = age - i * 0.25; p.visible = run && a >= 0 && a < 1.2; if (p.visible) { p.position.set(0.4 + Math.sin(i * 2) * 0.3, 2.5 + a * 0.9, 0.2 + Math.cos(i * 3) * 0.3); p.scale.setScalar(0.7 + a * 1.4); p.material.opacity = 0.5 * (1 - a / 1.2); } });
    });
    return R;
  }
  function buildWorkbench(parent, x, z, rotY = 0, roomId) {
    const W = new THREE.Group(); W.position.set(x, 0, z); W.rotation.y = rotY; parent.add(W);
    const wd = mat('wbWood', () => M(0xffffff, { map: woodTex, bumpMap: woodTex, bumpScale: 1.2, color: 0xb08a5a, roughness: 0.8, side: THREE.DoubleSide }));
    bx(W, 2.3, 0.12, 0.95, 0, 0.95, 0, wd, 1); bx(W, 2.1, 0.05, 0.8, 0, 0.32, 0, wd, 1); bx(W, 2.2, 0.2, 0.05, 0, 0.82, 0.45, wd, 1);
    for (const sx of [-1.05, 1.05]) for (const sz of [-0.4, 0.4]) bx(W, 0.1, 0.9, 0.1, sx, 0.45, sz, wd, 1);
    // vise
    box(W, steelDark, 0.85, 1.14, 0.34, 0.22, 0.22, 0.28); box(W, steelDark, 0.85, 1.2, 0.52, 0.18, 0.12, 0.05); const sc = cyl2(W, ironM, 0.85, 1.14, 0.64, 0.02, 0.3); sc.rotation.x = Math.PI / 2; const hd = cyl2(W, ironM, 0.85, 1.14, 0.78, 0.015, 0.26); hd.rotation.z = Math.PI / 2; sph(W, ironM, 0.97, 1.14, 0.78, 0.03); sph(W, ironM, 0.73, 1.14, 0.78, 0.03);
    const iron = steelDark, hw = mat('hwood', () => M(0x8a5a30, { roughness: 0.8 }));
    const hammer = (px, pz, ry, big) => { const h = new THREE.Group(); h.position.set(px, 1.04, pz); h.rotation.y = ry; W.add(h); const s = big ? 1.3 : 1; cyl2(h, hw, 0, 0.02, 0, 0.022 * s, 0.4 * s).rotation.z = Math.PI / 2; box(h, iron, 0.2 * s, 0.05, 0, 0.1 * s, 0.1 * s, 0.07 * s); box(h, iron, 0.2 * s, 0.05, 0.05 * s, 0.03, 0.03, 0.05); };
    hammer(-0.5, 0.2, 0.3); hammer(0.1, -0.1, -0.7, true);
    const saw = new THREE.Group(); saw.position.set(-0.1, 1.02, 0.22); saw.rotation.y = 0.15; W.add(saw); box(saw, steelDark, 0, 0.01, 0, 0.6, 0.012, 0.09).scale.x = 0.6; box(saw, hw, 0.36, 0.03, 0, 0.14, 0.05, 0.07);
    for (let i = 0; i < 12; i++) box(saw, steelDark, -0.28 + i * 0.045, 0.01, 0.055, 0.02, 0.012, 0.025);
    for (const [gx, gz, gr, gn] of [[0.55, 0.15, 0.1, 9], [0.7, -0.15, 0.07, 7], [-0.8, -0.1, 0.09, 8], [0.3, 0.3, 0.05, 6]]) { const gg = gear(W, brassM, gx, 1.016 + 0.015, gz, gr, 0.03, gn); gg.rotation.x = -Math.PI / 2; }
    for (let i = 0; i < 8; i++) { const b = cyl2(W, ironM, -0.2 + Math.random() * 1.0, 1.04, -0.3 + Math.random() * 0.6, 0.012, 0.05); b.rotation.set(Math.random(), 0, Math.random()); }
    bx(W, 0.5, 0.04, 0.12, -0.75, 1.03, -0.25, wd, 1).rotation.y = 0.2; bx(W, 0.4, 0.04, 0.1, -0.65, 1.07, -0.3, wd, 1).rotation.y = -0.1;
    box(W, wd, 0.2, 0.18, 0, 0.2, 0.12, 0.18); cyl2(W, ironM, -0.4, 0.4, 0.05, 0.12, 0.16);
    // anvil in front of the bench
    const A = new THREE.Group(); A.position.set(-0.5, 0, 0.98); A.rotation.y = 0.25; W.add(A);
    box(A, steelDark, 0, 0.2, 0, 0.5, 0.4, 0.34); box(A, steelDark, 0, 0.5, 0, 0.3, 0.2, 0.26); box(A, mat('anvTop', () => M(0x6a7078, { metalness: 0.95, roughness: 0.25, envMapIntensity: 1.5 })), 0, 0.66, 0, 0.82, 0.13, 0.3); const horn = cne(A, steelDark, 0.55, 0.66, 0, 0.12, 0.34); horn.rotation.z = -Math.PI / 2;
    // forge with glowing coals at the end of the bench
    const F = new THREE.Group(); F.position.set(-1.75, 0, 0); W.add(F);
    const brick = mat('brick', () => M(0x7a4a3a, { roughness: 0.9, map: stoneTex }));
    bx(F, 1.1, 0.8, 1.0, 0, 0.4, 0, brick, 0.6); bx(F, 1.16, 0.08, 1.06, 0, 0.84, 0, steelDark, 1);
    const coalM = mat('coals', () => new THREE.MeshBasicMaterial({ color: 0xff5a10, toneMapped: false })); const coalPl = pln(F, coalM, 0, 0.89, 0, 0.9, 0.8); coalPl.rotation.x = -Math.PI / 2; dyn(coalPl);
    for (let i = 0; i < 10; i++) { const c = sph(F, mat('coalR', () => M(0x2a1a14, { roughness: 0.9, emissive: 0x802000, emissiveIntensity: 0.6 })), (Math.random() - 0.5) * 0.7, 0.93, (Math.random() - 0.5) * 0.6, 0.07, 0.04, 0.06); }
    const hood = tap(F, steelDark, 0, 1.9, 0, 0.3, 0.7, 1.0, 4); hood.rotation.y = Math.PI / 4; box(F, steelDark, 0, 3.9, -0.28, 0.45, 4.0, 0.45);
    const fg = dyn(addGlow(F, 0xff6a20, 2.6, 0.7, 0, 1.2, 0.2)), fg2 = dyn(addGlow(F, 0xffb060, 1.2, 0.5, 0, 0.95, 0.1));
    // tool rack on the wall
    box(W, wd, 0, 2.35, -0.47, 2.0, 0.95, 0.06); box(W, steelDark, 0, 2.62, -0.42, 1.9, 0.03, 0.04);
    for (let i = 0; i < 5; i++) { const px = -0.8 + i * 0.4; cyl2(W, ironM, px, 2.58, -0.38, 0.012, 0.08).rotation.x = Math.PI / 2; const hh = new THREE.Group(); hh.position.set(px, 2.5, -0.37); W.add(hh);
      if (i % 2 === 0) { cyl2(hh, hw, 0, -0.2, 0, 0.02, 0.4); box(hh, iron, 0, -0.02, 0, 0.16, 0.08, 0.08); } else { box(hh, steelDark, 0, -0.18, 0, 0.04, 0.36, 0.015); box(hh, steelDark, 0.04, -0.34, 0, 0.1, 0.03, 0.015); cyl2(hh, hw, 0, 0, 0, 0.02, 0.1); } }
    plaque(W, 'WORKBENCH', 0, 3.4, -0.47, 1.8, 0.45); nameplate(W, 'WORKBENCH', 0, 4.2, 0, 2.3, '#ffd890');
    const sparks = sparkPts(W, 32, 0xffc060); const proxy = mkm(W, GB, proxyM, -0.5, 1.2, 0.3, 3.8, 2.6, 2.0); W.userData.fb = -1;
    regStation('workbench', W, roomId);
    addTick(W, (t, dt) => {
      const k = 1 + 0.18 * Math.sin(t * 9 + 1) + 0.1 * Math.sin(t * 23); fg.material.opacity = 0.55 + 0.2 * k; fg2.material.opacity = 0.4 + 0.25 * k; coalM.color.setRGB(1, 0.28 + 0.12 * k, 0.05);
      let age = -1; if (W.userData.fb >= 0) { age = performance.now() / 1000 - W.userData.fb; if (age > 1.4) { W.userData.fb = -1; age = -1; } }
      runSparks(sparks, age, 1.2, [-0.5, 0.8, 0.98]); if (age >= 0) { fg.material.opacity += 0.3; A.position.y = 0.01 * Math.sin(age * 40) * Math.max(0, 1 - age); } else A.position.y = 0;
    });
    return W;
  }
  const KT = [0x2a9cff, 0x22d3d0, 0x3de08a, 0xb4e03a, 0xffc830], ROMAN = ['I', 'II', 'III', 'IV', 'V'];
  function buildKnowledge(parent, x, z, rotY = 0, roomId) {
    const reqs = (window.GKITEMS && window.GKITEMS.KNOWLEDGE_TIERS) || [20, 40, 60, 80, 100];
    const T0 = new THREE.Group(); T0.position.set(x, 0, z); T0.rotation.y = rotY; parent.add(T0);
    const bark = mat('bark', () => M(0xffffff, { map: woodTex, color: 0x6a5040, roughness: 0.9, emissive: 0x0a1a20, emissiveIntensity: 0.4 }));
    // planter
    tap(T0, mat('planter', () => M(0xffffff, { map: stoneTex, color: 0x6a665e, roughness: 0.9 })), 0, 0.28, 0, 0.95, 0.99, 0.56, 24); tor(T0, mat('planter'), 0, 0.56, 0, 0.95, 0.07); tap(T0, mat('soil', () => M(0x2a1c14, { roughness: 1 })), 0, 0.55, 0, 0.86, 0.86, 0.06, 24);
    tor(T0, mat('moss', () => new THREE.MeshBasicMaterial({ color: 0x30e0b0, toneMapped: false })), 0, 0.6, 0, 0.78, 0.02).rotation.x = Math.PI / 2;
    // trunk, roots, branches
    const tube = (k, pts, r, seg = 24) => kgeo(k, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2]))), seg, r, 8, false));
    mkm(T0, tube('ktrunk1', [[0, 0.55, 0], [0.06, 1.2, 0.03], [-0.04, 2.0, 0], [0, 2.7, 0]], 0.28, 20), bark, 0, 0, 0); mkm(T0, tube('ktrunk2', [[0, 2.7, 0], [0.05, 3.6, 0.03], [-0.02, 4.4, 0], [0, 5.1, 0]], 0.15, 20), bark, 0, 0, 0);
    tap(T0, bark, 0, 0.8, 0, 0.3, 0.55, 0.5, 12);
    const vein = mat('vein', () => new THREE.MeshBasicMaterial({ color: 0x40ffd0, toneMapped: false }));
    for (let i = 0; i < 5; i++) { const a = -1.5 + i * 0.75, c = Math.cos(a), s = Math.sin(a); const pts = [[c * 0.4, 0.55, s * 0.4], [c * 0.8, 0.45, s * 0.8], [c * 1.15, 0.12, s * 1.15], [c * 1.5, 0.03, s * 1.5]];
      mkm(T0, tube('kroot' + i, pts, 0.07, 16), bark, 0, 0, 0); mkm(T0, tube('kvein' + i, pts.map(p => [p[0], p[1] + 0.06, p[2]]), 0.014, 16), vein, 0, 0, 0); }
    const tiers = [], rX = [1.05, 1.0, 0.92, 0.8, 0.62], leafG = kgeo('leaf', () => new THREE.CircleGeometry(0.11, 5));
    const dim = new THREE.Color(0.2, 0.22, 0.25);
    for (let k = 0; k < 5; k++) {
      const y = 1.75 + k * 0.85, col = new THREE.Color(KT[k]);
      for (let i = 0; i < 3; i++) { const a = k * 0.9 + i * 2.094, c = Math.cos(a), s = Math.sin(a), r0 = rX[k] * 0.72; mkm(T0, tube('kbr' + k + i, [[0, y - 0.45, 0], [c * r0 * 0.5, y - 0.15, s * r0 * 0.5], [c * r0, y + 0.05, s * r0]], 0.045, 10), bark, 0, 0, 0); }
      const lm = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }); lm.userData.own = true;
      const leaves = new THREE.InstancedMesh(leafG, lm, 96), d = new THREE.Object3D();
      for (let i = 0; i < 96; i++) { const u = Math.random() * 6.283, v = Math.acos(2 * Math.random() - 1), rr = 0.65 + Math.random() * 0.35; d.position.set(Math.sin(v) * Math.cos(u) * rX[k] * rr, y + Math.cos(v) * 0.42 * rr, Math.sin(v) * Math.sin(u) * rX[k] * rr); d.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); d.scale.setScalar(0.7 + Math.random() * 0.7); d.updateMatrix(); leaves.setMatrixAt(i, d.matrix); const c = col.clone(); c.offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.2); leaves.setColorAt(i, c); }
      T0.add(leaves);
      const glow = dyn(addGlow(T0, KT[k], 2.8, 0.3, 0, y, 0));
      const ring = dyn(new THREE.Group()); ring.position.y = y + 0.1; T0.add(ring);
      for (let j = 0; j < 2; j++) { const a = j * Math.PI, orb = new THREE.Group(); orb.position.set(Math.cos(a) * (rX[k] + 0.12), 0, Math.sin(a) * (rX[k] + 0.12)); ring.add(orb); sph(orb, new THREE.MeshBasicMaterial({ color: KT[k], toneMapped: false }), 0, 0, 0, 0.05 + 0.018 * k).material.userData.own = true; const hs = addGlow(orb, KT[k], 0.5 + 0.12 * k, 0.7, 0, 0, 0); dyn(hs); const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex('glyph' + ((k * 2 + j) % 5), 64, 64, (g, w, h) => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); const n = 3 + (k * 2 + j) % 4; for (let q = 0; q < n; q++) { const aa = q * 2.4 + k; g.lineTo(32 + Math.cos(aa) * (10 + q * 4), 32 + Math.sin(aa) * (10 + q * 4)); } g.stroke(); g.beginPath(); g.arc(32, 32, 24, 0, 7); g.stroke(); }), color: KT[k], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); gs.material.userData.own = true; gs.scale.setScalar(0.22 + 0.05 * k); gs.position.y = 0.2 + 0.03 * k; orb.add(gs); }
      const mkLabel = lit => new THREE.SpriteMaterial({ map: textTex('TIER ' + ROMAN[k] + ' · ' + reqs[k] + ' KNOWLEDGE', lit ? '#' + new THREE.Color(KT[k]).getHexString() : '#8a8f98', lit ? 'rgba(8,16,24,.8)' : 'rgba(8,10,14,.75)', 512, 80, 'bold 40px system-ui'), transparent: true, depthWrite: false, fog: false });
      const lab = ctex2(k, mkLabel); const lbl = new THREE.Sprite(lab.dim); lbl.scale.set(1.45, 0.23, 1); lbl.position.set(0, y - 0.05, rX[k] + 0.55); lbl.renderOrder = 6; T0.add(lbl); dyn(lbl);
      const lock = new THREE.Sprite(lockMat()); lock.scale.set(0.26, 0.3, 1); lock.position.set(-1.08, y - 0.05, rX[k] + 0.55); lock.renderOrder = 6; T0.add(lock); dyn(lock);
      tiers.push({ lm, glow, ring, lbl, lock, lab, col, state: -1, ph: k * 1.3 });
    }
    // floating books and scrolls
    const books = dyn(new THREE.Group()); books.position.y = 2.3; T0.add(books);
    const cov = [0x7a1a2a, 0x1a4a7a, 0x2a6a3a, 0x6a4a1a], paper = mat('paper', () => M(0xe8dcc0, { roughness: 0.9, emissive: 0x302810, emissiveIntensity: 0.4 }));
    for (let i = 0; i < 4; i++) { const a = i * 1.571, b = new THREE.Group(); b.position.set(Math.cos(a) * 1.05, Math.sin(i * 2) * 0.35, Math.sin(a) * 1.05); b.rotation.set(0.3 * Math.sin(i), -a, 0.25 * Math.cos(i * 3)); books.add(b);
      if (i % 2 === 0) { box(b, mat('cov' + i, () => M(cov[i], { roughness: 0.7, emissive: cov[i], emissiveIntensity: 0.15 })), 0, 0, 0, 0.34, 0.07, 0.25); box(b, paper, 0.01, 0, 0, 0.31, 0.055, 0.225); box(b, goldM, -0.17, 0, 0, 0.02, 0.075, 0.25); }
      else { cyl2(b, paper, 0, 0, 0, 0.045, 0.34).rotation.z = Math.PI / 2; for (const s of [-1, 1]) cyl2(b, goldM, s * 0.18, 0, 0, 0.055, 0.03).rotation.z = Math.PI / 2; } }
    // front lectern with the plaque
    const lec = new THREE.Group(); lec.position.set(0, 0, 1.12); T0.add(lec); box(lec, stoneM, -0.45, 0.25, 0, 0.12, 0.5, 0.1); box(lec, stoneM, 0.45, 0.25, 0, 0.12, 0.5, 0.1); const pl = plaque(lec, 'KNOWLEDGE TREE', 0, 0.58, 0.02, 1.2, 0.3); pl.rotation.x = -0.45;
    nameplate(T0, 'KNOWLEDGE TREE', 0, 5.95, 0, 2.6, '#8ff0e0');
    const proxy = mkm(T0, GB, proxyM, 0, 2.6, 0.3, 2.4, 5.4, 2.4);
    regStation('knowledge', T0, roomId);
    let lastK = null;
    addTick(T0, (t, dt) => {
      const kn = GK.myStats && GK.myStats.knowledge != null ? GK.myStats.knowledge : -1;
      tiers.forEach((q, k) => {
        const lit = kn >= reqs[k] ? 1 : 0; if (q.state !== lit) { q.state = lit; q.lm.color.setScalar(lit ? 1.25 : 0.2); q.lbl.material = lit ? q.lab.lit : q.lab.dim; q.lock.visible = !lit; }
        q.ring.rotation.y = t * (0.35 + 0.08 * k) * (k & 1 ? -1 : 1) + q.ph; q.glow.material.opacity = lit ? 0.32 + 0.1 * Math.sin(t * 2 + q.ph) : 0.05;
      });
      books.rotation.y = t * 0.25;
    });
    return T0;
  }
  const lockMats = {}; const lockMat = () => lockMats.l || (lockMats.l = new THREE.SpriteMaterial({ map: ctex('padlock', 64, 80, (g, w, h) => { g.fillStyle = '#c9ced6'; g.strokeStyle = '#c9ced6'; g.lineWidth = 8; g.beginPath(); g.arc(32, 28, 15, Math.PI, 0); g.stroke(); g.fillStyle = '#9aa2ad'; rrect(g, 10, 30, 44, 38, 6); g.fill(); g.fillStyle = '#2a2e34'; g.beginPath(); g.arc(32, 46, 6, 0, 7); g.fill(); g.fillRect(30, 48, 4, 12); }), transparent: true, depthWrite: false, fog: false }));
  const labs = {}; const ctex2 = (k, mk) => labs[k] || (labs[k] = { dim: mk(false), lit: mk(true) });
  GK.stations = {
    recycler: (parent, x, z, rotY, roomId) => buildRecycler(parent, x, z, rotY, roomId),
    knowledge: (parent, x, z, rotY, roomId) => buildKnowledge(parent, x, z, rotY, roomId),
    workbench: (parent, x, z, rotY, roomId) => buildWorkbench(parent, x, z, rotY, roomId),
  };
  const feedback = kind => roomId => { const e = stationReg.get(roomId); const o = e && e[kind]; if (o) o.userData.fb = performance.now() / 1000; };
  GK.recyclerFeedback = feedback('recycler'); GK.workbenchFeedback = feedback('workbench');
  // ===== MERCHANT ROOM: market stall with the glass-protected merchant goblin, plus the three stations =====
  function merchantShell() {
    const floorTex = ctex('mfloor', 1024, 1024, (g, w, h) => {
      for (let p = 0; p < 8; p++) { g.fillStyle = `hsl(${26 + Math.random() * 8},${40 + Math.random() * 12}%,${24 + Math.random() * 10}%)`; g.fillRect(p * 128, 0, 128, h); for (let i = 0; i < 30; i++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '20,10,0' : '200,150,90'},${0.06 + Math.random() * 0.12})`; g.lineWidth = 1; g.beginPath(); const x = p * 128 + Math.random() * 128; g.moveTo(x, 0); g.lineTo(x + Math.random() * 6 - 3, h); g.stroke(); } g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(p * 128, 0, 3, h); for (let y = 90; y < h; y += 200 + p * 17) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(p * 128 + 4, y, 120, 2); } }
      const rx = 336, rw = 352; g.fillStyle = '#6e0f1a'; g.fillRect(rx, 0, rw, h); g.strokeStyle = '#e4b53a'; g.lineWidth = 12; g.strokeRect(rx + 14, -10, rw - 28, h + 20); g.lineWidth = 3; g.strokeRect(rx + 40, -10, rw - 80, h + 20);
      g.fillStyle = '#e4b53a'; for (let y = 60; y < h; y += 110) { g.beginPath(); g.moveTo(rx + rw / 2, y - 30); g.lineTo(rx + rw / 2 + 24, y); g.lineTo(rx + rw / 2, y + 30); g.lineTo(rx + rw / 2 - 24, y); g.fill(); g.fillStyle = '#6e0f1a'; g.beginPath(); g.arc(rx + rw / 2, y, 7, 0, 7); g.fill(); g.fillStyle = '#e4b53a'; }
      speckle(g, w, h, 4000, 6, 0.06);
    }, false);
    return {
      floor: M(0xffffff, { map: floorTex, roughness: 0.5, envMapIntensity: 0.6 }),
      wall: M(0xf2cf98, { map: plasterTex, bumpMap: bumpTex, bumpScale: 0.6, roughness: 0.9, envMapIntensity: 0.3, emissive: 0x3a2008, emissiveIntensity: 0.35 }),
      ceil: M(0xe6bf84, { map: plasterTex, roughness: 0.95, emissive: 0xc89050, emissiveIntensity: 0.6 }),
      panel: new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false }), band: brassM,
    };
  }
  const logoTexM = () => mat('logoTex', () => { const t = new THREE.CanvasTexture(merchantLogo(256)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
  const logoM = () => mat('logoM', () => new THREE.MeshStandardMaterial({ map: logoTexM(), emissiveMap: logoTexM(), emissive: 0xffffff, emissiveIntensity: 0.35, transparent: true, alphaTest: 0.1, roughness: 0.4, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const merchantTmp = new THREE.Vector3();
  function merchantGoblin(parent, roomId) {
    const G = new THREE.Group(); parent.add(G);
    const skin = mat('mSkin', () => M(0x86a845, { roughness: 0.6, envMapIntensity: 0.4 })), skinD = mat('mSkinD', () => M(0x6f8f38, { roughness: 0.6 })), vest = mat('mVest', () => M(0x8a1424, { roughness: 0.8, emissive: 0x200408, emissiveIntensity: 0.3 })),
      apron = mat('mApron', () => M(0xe9dcc0, { roughness: 0.9, emissive: 0x302818, emissiveIntensity: 0.3 })), turb = mat('mTurb', () => M(0x5b2a8c, { roughness: 0.8, emissive: 0x180830, emissiveIntensity: 0.4 })),
      leath = mat('mLeath', () => M(0x5a3220, { roughness: 0.8 })), white = mat('mWhite', () => M(0xf2f0e8, { roughness: 0.7 })), dark = mat('mDark', () => M(0x140a08, { roughness: 0.6 })),
      ruby = mat('mRuby', () => M(0xe01030, { emissive: 0xff1030, emissiveIntensity: 1.2, roughness: 0.15 })), gtooth = mat('mTooth', () => M(0xffd24a, { metalness: 1, roughness: 0.2, emissive: 0x6a4000, emissiveIntensity: 0.5 })), pupilM = mat('mPupil', () => M(0x1a0a00, { roughness: 0.3 }));
    for (const s of [-1, 1]) { sph(G, skin, s * 0.2, 0.32, 0, 0.15, 0.34, 0.16); sph(G, leath, s * 0.2, 0.08, 0.08, 0.17, 0.1, 0.25); }
    const body = dyn(new THREE.Group()); G.add(body);
    sph(body, skin, 0, 0.98, 0, 0.5, 0.58, 0.46); sph(body, vest, 0, 0.9, 0.02, 0.54, 0.5, 0.5); box(body, apron, 0, 0.78, 0.5, 0.62, 0.72, 0.05); box(body, leath, -0.2, 1.1, 0.5, 0.05, 0.5, 0.04).rotation.z = 0.1; box(body, leath, 0.2, 1.1, 0.5, 0.05, 0.5, 0.04).rotation.z = -0.1;
    cyl2(body, leath, 0, 0.98, 0, 0.54, 0.09).scale.set(0.54, 0.09, 0.5); box(body, goldM, 0, 0.98, 0.51, 0.14, 0.11, 0.04);
    for (const s of [-1, 1]) { sph(body, leath, s * 0.46, 0.78, 0.3, 0.11, 0.12, 0.1); cne(body, leath, s * 0.46, 0.93, 0.3, 0.04, 0.1); sph(body, gtooth, s * 0.5, 0.84, 0.38, 0.03); }
    const head = dyn(new THREE.Group()); head.position.set(0, 1.68, 0.05); body.add(head);
    sph(head, skin, 0, 0, 0, 0.34, 0.31, 0.32);
    for (const s of [-1, 1]) { const e = cne(head, skin, s * 0.38, 0.07, 0, 0.09, 0.55); e.rotation.z = -s * (Math.PI / 2 - 0.35); e.position.x = s * 0.55; sph(head, skinD, s * 0.52, 0.12, 0, 0.04, 0.2, 0.05).rotation.z = -s * 0.6; }
    const eyes = [-1, 1].map(s => { const e = dyn(new THREE.Group()); e.position.set(s * 0.13, 0.08, 0.27); head.add(e); sph(e, white, 0, 0, 0, 0.078); sph(e, pupilM, 0, 0, 0.065, 0.036); return e; });
    for (const s of [-1, 1]) { const rg = tor(head, brassM, s * 0.13, 0.08, 0.35, 0.105, 0.012); sph(head, mat('mLens', () => new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.2, roughness: 0.05, depthWrite: false })), s * 0.13, 0.08, 0.35, 0.098, 0.098, 0.01); box(head, white, s * 0.13, 0.19, 0.3, 0.16, 0.035, 0.05).rotation.z = -s * 0.3; }
    box(head, brassM, 0, 0.09, 0.355, 0.05, 0.012, 0.012);
    const nose = cne(head, skinD, 0, -0.02, 0.47, 0.09, 0.3); nose.rotation.x = Math.PI / 2; const hook = cne(head, skinD, 0, -0.1, 0.6, 0.065, 0.2); hook.rotation.x = Math.PI + 0.25; sph(head, skinD, 0, -0.19, 0.61, 0.055); sph(head, skinD, 0.045, 0.02, 0.5, 0.025);
    sph(head, dark, 0, -0.15, 0.285, 0.1, 0.02, 0.05); for (const x of [-0.065, -0.022, 0.022, 0.065]) box(head, gtooth, x, -0.133, 0.3, 0.03, 0.04, 0.02);
    cne(head, white, 0, -0.34, 0.2, 0.07, 0.22).rotation.x = Math.PI;
    const turban = new THREE.Group(); turban.position.y = 0.26; head.add(turban); sph(turban, turb, 0, 0.05, 0, 0.4, 0.26, 0.4); for (const [y, r, tx] of [[-0.04, 0.36, 0.2], [0.06, 0.33, -0.25]]) { const t = tor(turban, turb, 0, y, 0, r, 0.065); t.rotation.x = Math.PI / 2 + tx; } sph(turban, turb, 0, 0.3, 0, 0.1);
    sph(turban, ruby, 0, 0.06, 0.4, 0.05); tor(turban, goldM, 0, 0.06, 0.39, 0.075, 0.015); const fe = cne(turban, mat('mFeather', () => M(0x1ab8a0, { emissive: 0x108070, emissiveIntensity: 0.6, roughness: 0.6 })), 0.1, 0.42, 0.28, 0.05, 0.5); fe.rotation.set(0.5, 0, -0.35);
    const arm = (s, rx, rz, er) => { const a = new THREE.Group(); a.position.set(s * 0.58, 1.3, 0.03); a.rotation.set(rx, 0, rz); body.add(a); sph(a, vest, 0, -0.04, 0, 0.14); sph(a, skin, 0, -0.26, 0, 0.11, 0.27, 0.11); const el = new THREE.Group(); el.position.y = -0.5; el.rotation.x = er; a.add(el); sph(el, skin, 0, -0.22, 0, 0.1, 0.24, 0.1); const hand = new THREE.Group(); hand.position.y = -0.48; el.add(hand); sph(hand, skin, 0, 0, 0, 0.1); for (let i = 0; i < 3; i++) sph(hand, skinD, (i - 1) * 0.05, -0.08, 0.02, 0.025, 0.06, 0.025); return { a, el, hand }; };
    const L = arm(-1, -0.9, 0.2, -0.9), Rg = arm(1, -0.5, -0.15, -1.9);
    const coin = dyn(new THREE.Group()); coin.position.set(0, -0.12, 0.14); Rg.hand.add(coin); const cy = cyl2(coin, mat('mCoin', () => M(0xffd35a, { metalness: 1, roughness: 0.22, emissive: 0x8a5200, emissiveIntensity: 0.9, envMapIntensity: 1.8 })), 0, 0, 0, 0.16, 0.03); cy.rotation.x = Math.PI / 2; const cg = pln(coin, logoM(), 0, 0, 0.017, 0.3, 0.3); const cg2 = pln(coin, logoM(), 0, 0, -0.017, 0.3, 0.3); cg2.rotation.y = Math.PI; const cglow = addGlow(coin, 0xffd060, 0.8, 0.5, 0, 0, 0); dyn(cglow);
    const pouch = sph(L.hand, leath, 0, -0.12, 0.04, 0.08, 0.09, 0.07); cne(L.hand, leath, 0, -0.04, 0.04, 0.035, 0.08);
    G.userData.roomId = roomId; G.userData.kind = 'merchant'; mkm(G, GB, proxyM, 0, 1.1, 0.1, 1.5, 2.4, 1.2);
    let nb = 2.5, bl = 0, tgt = 0;
    addTick(G, (t, dt) => {
      body.scale.set(1 + 0.012 * Math.sin(t * 1.8), 1 + 0.018 * Math.sin(t * 1.8), 1); head.position.y = 1.68 + 0.012 * Math.sin(t * 1.8 + 0.5);
      const Pl = GK.playerPos || (window.__gk && window.__gk.P); let want = Math.sin(t * 0.45) * 0.45 + Math.sin(t * 0.9) * 0.1;
      if (Pl) { G.worldToLocal(merchantTmp.set(Pl.x, 0, Pl.z)); if (Math.hypot(merchantTmp.x, merchantTmp.z) < 8 && merchantTmp.z > -0.5) want = Math.max(-1.0, Math.min(1.0, Math.atan2(merchantTmp.x, merchantTmp.z))); }
      tgt += (want - tgt) * Math.min(1, dt * 3); head.rotation.y = tgt; head.rotation.z = 0.05 * Math.sin(t * 0.6); head.rotation.x = 0.03 * Math.sin(t * 0.8);
      if (t > nb) { bl = t; nb = t + 2 + Math.random() * 3; } const ey = t - bl < 0.14 ? 0.08 : 1; for (const e of eyes) e.scale.y = ey;
      Rg.a.rotation.x = -0.5 + 0.06 * Math.sin(t * 1.3); Rg.el.rotation.x = -1.9 + 0.1 * Math.sin(t * 1.3 + 1); coin.rotation.y = t * 2.6; coin.position.y = -0.12 + 0.02 * Math.sin(t * 3); cglow.material.opacity = 0.4 + 0.15 * Math.sin(t * 5);
    });
    return G;
  }
  function buildMerchant(slot) {
    const g = slot.inner, cr = slot.cr, wd = mat('wbWood', () => M(0xffffff, { map: woodTex, bumpMap: woodTex, bumpScale: 1.2, color: 0xb08a5a, roughness: 0.8, side: THREE.DoubleSide }));
    const glassM = mat('glass', () => new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.1, roughness: 0.04, metalness: 0.05, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide }));
    const glintM = mat('glint', () => new THREE.MeshBasicMaterial({ map: ctex('glint', 128, 128, (c, w, h) => { c.clearRect(0, 0, w, h); for (const [x, wd2, a] of [[40, 14, 0.5], [70, 6, 0.4], [98, 3, 0.3]]) { c.fillStyle = `rgba(255,255,255,${a})`; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + wd2, 0); c.lineTo(x - 40 + wd2, h); c.lineTo(x - 40, h); c.fill(); } }), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    // wainscot, beams
    bx(g, 2 * IN, 1.05, 0.06, 0, 0.6, -IN + 0.03, wd, 1); for (const s of [-1, 1]) bx(g, 0.06, 1.05, 2 * IN, s * (IN - 0.03), 0.6, 0, wd, 1);
    for (const z of [-1.6, 1.6]) bx(g, 2 * IN, 0.28, 0.3, 0, H - 0.45, z, wd, 1);
    // banners with the merchant logo and a big medallion
    const banM = mat('mBanner', () => { const t = ctex('mBanner', 256, 640, (c, w, h) => { c.fillStyle = '#6e0f1a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e4b53a'; c.lineWidth = 10; c.strokeRect(8, 8, w - 16, h - 50); c.lineWidth = 3; c.strokeRect(24, 24, w - 48, h - 82); c.drawImage(merchantLogo(200), 28, 150, 200, 200); c.fillStyle = '#e4b53a'; for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(i * 36 + 4, h - 42); c.lineTo(i * 36 + 32, h - 42); c.lineTo(i * 36 + 18, h); c.fill(); } c.font = 'bold 34px system-ui'; c.textAlign = 'center'; c.fillText('MERCHANT', w / 2, 90); c.fillText('GOODS', w / 2, 460); }); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.9, side: THREE.DoubleSide }); });
    for (const s of [-1, 1]) { pln(g, banM, s * 3.0, 4.1, -IN + 0.04, 0.8, 2.0); box(g, goldM, s * 3.0, 5.12, -IN + 0.06, 0.95, 0.07, 0.08); }
    const med = pln(g, logoM(), 0, 4.5, -IN + 0.05, 1.5, 1.5);
    // the stall: counter, glass barrier, header, sign
    bx(g, 4.6, 1.0, 0.9, 0, 0.5, -1.6, wd, 1); bx(g, 4.8, 0.08, 1.0, 0, 1.04, -1.6, wd, 1); box(g, brassM, 0, 1.09, -1.1, 4.8, 0.03, 0.03); box(g, brassM, 0, 0.1, -1.14, 4.6, 0.05, 0.03);
    for (const x of [-1.6, 0, 1.6]) pln(g, logoM(), x, 0.52, -1.14, 0.55, 0.55);
    const post = (x, z, h, y) => { box(g, brassM, x, y, z, 0.07, h, 0.07); for (const yy of [y - h / 2 + 0.05, y + h / 2 - 0.05]) sph(g, brassM, x, yy, z + 0.04, 0.025); };
    for (const x of [-2.3, -1.15, 0, 1.15, 2.3]) post(x, -1.25, 1.55, 1.85);
    box(g, brassM, 0, 2.6, -1.25, 4.67, 0.06, 0.07); box(g, brassM, 0, 1.1, -1.25, 4.67, 0.04, 0.07);
    for (const [x, y, h] of [[-1.725, 1.85, 1.5], [-0.575, 2.0, 1.2], [0.575, 2.0, 1.2], [1.725, 1.85, 1.5]]) { pln(g, glassM, x, y, -1.25, 1.08, h); const gl = pln(g, glintM, x, y, -1.243, 1.08, h); }
    box(g, brassM, 0, 1.4, -1.25, 1.2, 0.03, 0.07); box(g, brassM, 0, 1.06, -1.2, 0.9, 0.03, 0.4);   // pass-through slot and tray
    for (const s of [-1, 1]) { const sp = pln(g, glassM, s * 2.3, 1.3, -2.475, 2.45, 2.6); sp.rotation.y = Math.PI / 2; const gl = pln(g, glintM, s * 2.3 - s * 0.006, 1.3, -2.475, 2.45, 2.6); gl.rotation.y = Math.PI / 2; post(s * 2.3, -3.65, 2.6, 1.3); post(s * 2.3, -2.45, 2.6, 1.3); }
    bx(g, 4.9, 0.36, 0.1, 0, 2.8, -1.25, wd, 1); box(g, brassM, 0, 3.0, -1.25, 4.9, 0.04, 0.12); pln(g, logoM(), 0, 2.8, -1.195, 0.5, 0.5); plaque(g, 'MERCHANT', -1.6, 2.8, -1.195, 1.5, 0.3); plaque(g, 'FAIR PRICES', 1.6, 2.8, -1.195, 1.5, 0.3);
    nameplate(g, 'MERCHANT', 0, 5.8, -2.0, 2.4, '#ffe9a8');
    const sign = dyn(new THREE.Group()); sign.position.set(-1.7, 2.62, -1.0); g.add(sign); for (const s of [-1, 1]) cyl2(sign, brassM, s * 0.22, -0.1, 0, 0.008, 0.2); bx(sign, 0.62, 0.3, 0.04, 0, -0.32, 0, wd, 1);
    const openM = mat('openSign', () => new THREE.MeshStandardMaterial({ map: ctex('open', 256, 128, (c, w, h) => { c.fillStyle = '#0e3a1a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#4cf07a'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#6dff8a'; c.shadowColor = '#40ff70'; c.shadowBlur = 14; c.font = 'bold 76px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OPEN', w / 2, h / 2 + 4); }), emissiveMap: ctex('open', 256, 128, () => { }), emissive: 0xffffff, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
    openM.emissiveMap = openM.map; const sg = pln(sign, openM, 0, -0.32, 0.025, 0.54, 0.26); const sg2 = pln(sign, openM, 0, -0.32, -0.025, 0.54, 0.26); sg2.rotation.y = Math.PI;
    // shelves and goods behind the merchant
    const bottleMs = [0xff4a6a, 0x4ab8ff, 0x6aff8a, 0xffc84a, 0xc06aff].map((c, i) => mat('bot' + i, () => M(c, { emissive: c, emissiveIntensity: 0.55, roughness: 0.15, metalness: 0.1 }))), potM = mat('pot', () => M(0x8a5a30, { roughness: 0.7 })), sackM = mat('sack', () => M(0xc8b080, { roughness: 1 }));
    for (const y of [1.3, 2.0, 2.7]) { bx(g, 4.3, 0.06, 0.34, 0, y, -IN + 0.2, wd, 1); for (const x of [-2.1, 2.1]) box(g, wd, x, y - 0.18, -IN + 0.2, 0.06, 0.3, 0.3);
      for (let i = 0; i < 9; i++) { const x = -1.9 + i * 0.47 + (Math.random() - 0.5) * 0.1, z = -IN + 0.22, k = (i + Math.round(y * 3)) % 4;
        if (k === 0) { cyl2(g, bottleMs[i % 5], x, y + 0.15, z, 0.07, 0.24); cyl2(g, bottleMs[i % 5], x, y + 0.32, z, 0.03, 0.12); sph(g, hwoodM, x, y + 0.4, z, 0.035); }
        else if (k === 1) { cyl2(g, potM, x, y + 0.14, z, 0.1, 0.22); cyl2(g, ironM, x, y + 0.27, z, 0.105, 0.03); }
        else if (k === 2) { sph(g, sackM, x, y + 0.14, z, 0.16, 0.14, 0.13); cne(g, sackM, x, y + 0.3, z, 0.05, 0.1); }
        else { box(g, wd, x, y + 0.11, z, 0.26, 0.2, 0.2); box(g, brassM, x, y + 0.13, z + 0.1, 0.05, 0.06, 0.02); } } }
    const coinM2 = mat('coin2', () => M(0xffd35a, { metalness: 1, roughness: 0.22, emissive: 0x8a5200, emissiveIntensity: 0.7, envMapIntensity: 1.8 }));
    for (const [x, n] of [[-1.3, 5], [-1.0, 3], [1.1, 4]]) for (let i = 0; i < n; i++) cyl2(g, coinM2, x, 1.1 + i * 0.03, -1.8, 0.07, 0.025);
    box(g, brassM, 1.55, 1.2, -1.75, 0.04, 0.3, 0.04); box(g, brassM, 1.55, 1.34, -1.75, 0.7, 0.02, 0.03); for (const s of [-1, 1]) { cyl2(g, brassM, 1.55 + s * 0.34, 1.2, -1.75, 0.06, 0.02); }
    // merchant
    const mer = merchantGoblin(g, cr.id); mer.position.set(0, 0, -2.55); GK.merchantTargets.push(mer);
    // lanterns (emissive + additive glow, no lights)
    for (const x of [-1.3, 1.3]) { const l = new THREE.Group(); l.position.set(x, 5.1, 0.3); g.add(l); cyl2(l, ironM, 0, 0.7, 0, 0.012, 1.4); box(l, ironM, 0, 0.05, 0, 0.26, 0.05, 0.26); box(l, mat('lampBody', () => new THREE.MeshBasicMaterial({ color: 0xffd890, toneMapped: false })), 0, -0.1, 0, 0.2, 0.25, 0.2); cne(l, ironM, 0, 0.17, 0, 0.16, 0.14); addGlow(l, 0xffb050, 2.4, 0.6, 0, -0.1, 0); }
    // stations
    buildWorkbenchAt(g, cr); buildRecycler(g, IN - 0.5, 2.05, -Math.PI / 2, cr.id); buildKnowledge(g, -2.45, 0.6, Math.PI / 2, cr.id);
    addTick(g, (t) => { sign.rotation.z = 0.06 * Math.sin(t * 1.4); });
  }
  const buildWorkbenchAt = (g, cr) => buildWorkbench(g, IN - 0.5, 0, -Math.PI / 2, cr.id);
  // @@MERCHANT@@
  let lastT = -1, lastP = 0;
  function animate() {
    const t = performance.now() / 1000; if (t === lastT) return; const dt = Math.min(0.1, lastT < 0 ? 0.016 : t - lastT); lastT = t;
    if (t - lastP > 2) { lastP = t; prune(); }
    for (const q of tickList) if (attached(q.root)) q.fn(t, dt);
    for (const s of chestSlots) {
      s.holder.position.y = s.base + Math.sin(t * 1.5 + s.ph) * 0.07; s.holder.rotation.y = t * 0.7 + s.ph; s.holder.updateMatrix(); s.holder.updateMatrixWorld(true);
      const k = 0.85 + 0.15 * Math.sin(t * 2.3 + s.ph); s.glow.material.opacity = 0.55 * k + 0.05;
    }
    for (const sl of slots) for (const q of sl.flames) { const k = 1 + 0.12 * Math.sin(t * 17 + q.ph) + 0.08 * Math.sin(t * 29 + q.ph * 2); q.f.scale.set(k * 0.95, k, k * 0.95); q.f2.scale.set(k, 0.9 + (k - 1) * 2, k); q.gl.material.opacity = 0.62 + (k - 1) * 1.4; q.f.updateMatrix(); q.f2.updateMatrix(); }
  }
  tickers.push(animate);
  // drives the animation without frame(): a tiny always-drawn mesh whose onBeforeRender ticks everything
  const hook = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hook.position.set(0, -50, 0); hook.frustumCulled = false; hook.onBeforeRender = animate; scene.add(hook);
  hook.matrixAutoUpdate = false; hook.updateMatrix();
  function applyChestsImpl(weaponIdx) {
    if (!weaponIdx) return;
    lastWeapons = Array.from(weaponIdx, w => typeof w === 'string' ? w : (LEGACY_KEYS[w | 0] || 'w:sword'));   // item keys ('w:axe') or legacy indices; kept until the interiors exist
    for (const s of chestSlots) if (s.id != null && attached(s.holder)) setSlotWeapon(s, lastWeapons[s.id]);
  }
  GK.applyChests = applyChestsImpl;
}
function applyChests(a) { GK.applyChests(a); }
// CHEST-END
// MYSTERY-BEGIN (contents of the random mystery rooms: owned by the mystery agent; defines GK.buildMysteryContents(room, group, variant))
{ // ---- part 1: shared helpers, tier styling, weapon models
const MY = GK.mys = GK.mys || {};
const PI = Math.PI, Y = new THREE.Vector3(0, 1, 0);
const GEO = MY.GEO = {
  sph: new THREE.SphereGeometry(1, 20, 14), box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 18), cone: new THREE.ConeGeometry(1, 1, 14),
  cone4: new THREE.ConeGeometry(1, 1, 4), tor: new THREE.TorusGeometry(1, 0.12, 8, 32), oct: new THREE.OctahedronGeometry(1), dodec: new THREE.DodecahedronGeometry(1),
  plane: new THREE.PlaneGeometry(1, 1), arc: new THREE.TorusGeometry(1, 0.06, 6, 14, PI), hemi: new THREE.SphereGeometry(1, 20, 10, 0, PI * 2, 0, PI / 2),
};
const cgc = {};
const cg = MY.cg = (rt, rb, seg = 16, open = false) => { const k = rt + '_' + rb + '_' + seg + open; return cgc[k] || (cgc[k] = new THREE.CylinderGeometry(rt, rb, 1, seg, 1, open)); };
const mk = MY.mk = (p, geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); p.add(m); return m; };
const grp = MY.grp = (p, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); p.add(g); return g; };
const dyn = MY.dyn = o => { o.userData.dyn = true; return o; };
const mc = {};
const MM = MY.MM = (c, o = {}) => { const k = c + '|' + JSON.stringify(o); return mc[k] || (mc[k] = M(c, o)); };
const bmc = {};
const BM = MY.BM = (c, op = 1, add = false, map = null) => { const k = c + '|' + op + '|' + add + '|' + (map ? map.uuid : ''); return bmc[k] || (bmc[k] = new THREE.MeshBasicMaterial({ color: c, opacity: op, transparent: add || op < 1, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add && op >= 1, side: add ? THREE.DoubleSide : THREE.FrontSide, toneMapped: false, fog: false, map })); };
const gsm = {};
const GS = MY.GS = (c, op) => gsm[c + '|' + op] || (gsm[c + '|' + op] = new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
const glow = MY.glow = (p, c, size, op, x = 0, y = 0, z = 0) => { const s = new THREE.Sprite(GS(c, op)); s.scale.set(size, size, 1); s.position.set(x, y, z); p.add(s); return s; };
const _v = new THREE.Vector3();
const spike = MY.spike = (p, mat, x, y, z, dx, dy, dz, len, r) => { _v.set(dx, dy, dz).normalize(); const m = new THREE.Mesh(GEO.cone, mat); m.scale.set(r, len, r); m.position.set(x + _v.x * len / 2, y + _v.y * len / 2, z + _v.z * len / 2); m.quaternion.setFromUnitVectors(Y, _v); p.add(m); return m; };
const fib = MY.fib = n => Array.from({ length: n }, (_, i) => { const yy = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - yy * yy), a = i * 2.39996; return [Math.cos(a) * r, yy, Math.sin(a) * r]; });
const canvasT = (w, h, f) => { const t = canvasTex(w, h, f); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
const clampT = t => { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; return t; };
const TEX = MY.TEX = {
  ring: clampT(canvasTex(256, 256, (g, w, h) => { const r = g.createRadialGradient(128, 128, 60, 128, 128, 128); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.72, 'rgba(255,255,255,.1)'); r.addColorStop(0.86, 'rgba(255,255,255,.95)'); r.addColorStop(0.92, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); })),
  shaft: clampT(canvasTex(16, 256, (g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(255,255,255,.75)'); r.addColorStop(0.55, 'rgba(255,255,255,.28)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); })),
  streak: clampT(canvasTex(256, 16, (g, w, h) => { const r = g.createLinearGradient(0, 0, w, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(1, 'rgba(255,255,255,.9)'); g.fillStyle = r; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h); })),
  star: clampT(canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.15, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 0); g.lineTo(36, 28); g.lineTo(64, 32); g.lineTo(36, 36); g.lineTo(32, 64); g.lineTo(28, 36); g.lineTo(0, 32); g.lineTo(28, 28); g.fill(); })),
  chain: canvasT(128, 128, (g, w, h) => { g.fillStyle = '#6a6e76'; g.fillRect(0, 0, w, h); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const cx = x * 16 + (y & 1 ? 8 : 0), cy = y * 16 + 8; g.strokeStyle = '#e6eaf0'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 6.5, 0, 7); g.stroke(); g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.stroke(); } }),
  scale: canvasT(128, 128, (g, w, h) => { g.fillStyle = '#555'; g.fillRect(0, 0, w, h); for (let y = 0; y < 9; y++) for (let x = -1; x < 9; x++) { const cx = x * 16 + (y & 1 ? 8 : 0), cy = y * 14; const gr = g.createLinearGradient(cx, cy - 2, cx, cy + 16); gr.addColorStop(0, '#f2f2f2'); gr.addColorStop(1, '#8c8c8c'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 10, 0, PI); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.5; g.stroke(); } }),
  burlap: canvasT(64, 64, (g, w, h) => { g.fillStyle = '#c9b085'; g.fillRect(0, 0, w, h); for (let i = 0; i < 64; i += 3) { g.fillStyle = `rgba(80,55,20,${0.12 + 0.12 * Math.random()})`; g.fillRect(i, 0, 1.5, h); g.fillRect(0, i, w, 1.5); } }),
  quilt: canvasT(64, 64, (g, w, h) => { g.fillStyle = '#d8d0bc'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(70,50,30,.7)'; g.lineWidth = 3; for (let i = 0; i <= 64; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } speckle(g, w, h, 200, 3, 0.1); }),
};
MY.ringTexU = TEX.ring;
// ---- tier styling
const TIERS = MY.TIERS = {
  common: { c: 0xd8d2c0, css: '#e6e0d0', n: 0 }, uncommon: { c: 0x6dff8a, css: '#7dff9a', n: 1 }, rare: { c: 0x5aa8ff, css: '#6ab4ff', n: 2 },
  mythic: { c: 0xb36bff, css: '#c58cff', n: 3 }, legendary: { c: 0xffc83a, css: '#ffd24a', n: 4 }, transcendent: { c: 0x7ff4ff, css: '#8ff6ff', n: 5 }, class: { c: 0xffe08a, css: '#ffe9a8', n: 3 },
};
const tierMats = MY.tierMats = tier => {
  const t = TIERS[tier] || TIERS.common;
  const S = {
    common: { blade: MM(0x8d8a84, { metalness: 0.6, roughness: 0.62 }), trim: MM(0x3c4048, { metalness: 0.9, roughness: 0.45 }), wood: MM(0x6b4325, { roughness: 0.85 }), lea: MM(0x5a3a22, { roughness: 0.85 }), cloth: MM(0x9a8460, { roughness: 1, side: THREE.DoubleSide }), metal: MM(0x80807c, { metalness: 0.7, roughness: 0.55 }) },
    uncommon: { blade: MM(0xcdd5de, { metalness: 0.9, roughness: 0.3, envMapIntensity: 1.3 }), trim: MM(0x9a6a38, { metalness: 0.8, roughness: 0.4 }), wood: MM(0x5e3a20, { roughness: 0.7 }), lea: MM(0x6a4426, { roughness: 0.7 }), cloth: MM(0x6a8a5a, { roughness: 1, side: THREE.DoubleSide }), metal: MM(0xb4bcc6, { metalness: 0.85, roughness: 0.35 }) },
    rare: { blade: MM(0xc2dcff, { metalness: 0.9, roughness: 0.2, envMapIntensity: 1.5, emissive: 0x1a4a9a, emissiveIntensity: 0.55 }), trim: MM(0xb9c4d4, { metalness: 0.95, roughness: 0.25 }), wood: MM(0x4a2e1a, { roughness: 0.55 }), lea: MM(0x3a4660, { roughness: 0.6 }), cloth: MM(0x3e5f9a, { roughness: 0.9, side: THREE.DoubleSide, emissive: 0x0a2050, emissiveIntensity: 0.4 }), metal: MM(0x9cb8e0, { metalness: 0.9, roughness: 0.25, emissive: 0x15407c, emissiveIntensity: 0.4 }) },
    mythic: { blade: MM(0x6a4a9a, { metalness: 0.9, roughness: 0.25, envMapIntensity: 1.4, emissive: 0x7a26d8, emissiveIntensity: 0.75 }), trim: MM(0x2a2236, { metalness: 0.9, roughness: 0.3, emissive: 0x401a70, emissiveIntensity: 0.4 }), wood: MM(0x2c2038, { roughness: 0.5, emissive: 0x2a0e50, emissiveIntensity: 0.4 }), lea: MM(0x40285c, { roughness: 0.6, emissive: 0x2a0e50, emissiveIntensity: 0.4 }), cloth: MM(0x6a3aa8, { roughness: 0.8, side: THREE.DoubleSide, emissive: 0x3a1380, emissiveIntensity: 0.5 }), metal: MM(0x6c4a9c, { metalness: 0.9, roughness: 0.25, emissive: 0x5a1ab0, emissiveIntensity: 0.6 }) },
    legendary: { blade: MM(0xffeaa8, { metalness: 1, roughness: 0.14, envMapIntensity: 1.8, emissive: 0xd89a14, emissiveIntensity: 0.85 }), trim: MM(0xf4c24d, { metalness: 1, roughness: 0.22, envMapIntensity: 1.6, emissive: 0x7a4a00, emissiveIntensity: 0.6 }), wood: MM(0x2a1a12, { roughness: 0.4, emissive: 0x4a2a00, emissiveIntensity: 0.4 }), lea: MM(0x7a1018, { roughness: 0.5, emissive: 0x3a0408, emissiveIntensity: 0.5 }), cloth: MM(0xd8b04a, { roughness: 0.6, side: THREE.DoubleSide, emissive: 0x7a4a00, emissiveIntensity: 0.55 }), metal: MM(0xffe08a, { metalness: 1, roughness: 0.16, envMapIntensity: 1.8, emissive: 0xc98a10, emissiveIntensity: 0.8 }) },
  };
  S.transcendent = Object.assign({}, S.legendary); S.class = S.legendary; const m = S[tier] || S.common; m.glow = BM(t.c); m.col = t.c; m.n = t.n; return m;
};
// ---- floor glow, spot cone, label
const poolM = c => GS(c, 1);
MY.pool = (p, c, r, op, x = 0, z = 0) => { const m = new THREE.Mesh(GEO.plane, BM(c, op, true, glowTex)); m.rotation.x = -PI / 2; m.position.set(x, 0.03, z); m.scale.set(r * 2, r * 2, 1); m.renderOrder = 2; p.add(m); return m; };
MY.ring = (p, c, r, op, x = 0, z = 0) => { const m = new THREE.Mesh(GEO.plane, BM(c, op, true, TEX.ring), 0); m.material = BM(c, op, true, TEX.ring); m.rotation.x = -PI / 2; m.position.set(x, 0.035, z); m.scale.set(r * 2, r * 2, 1); m.renderOrder = 2; p.add(m); return m; };
const cones = {};
MY.spot = (p, c, x = 0, z = 0, h = 5.8, rt = 0.3, rb = 1.4, op = 0.5) => {
  const k = h + '_' + rt + '_' + rb; const geo = cones[k] || (cones[k] = new THREE.CylinderGeometry(rt, rb, h, 28, 1, true));
  const m = new THREE.Mesh(geo, BM(c, op, true, TEX.shaft)); m.position.set(x, h / 2 + 0.05, z); m.renderOrder = 3; p.add(m); return m;
};
const lc = {};
const labelMat = MY.labelMat = (l1, c1, l2, c2) => {
  const k = l1 + '|' + c1 + '|' + (l2 || '') + '|' + (c2 || ''); if (lc[k]) return lc[k];
  const W = 1024, Hh = l2 ? 240 : 150, c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (t, px) => { let s = px; g.font = `bold ${s}px system-ui, sans-serif`; while (g.measureText(t).width > 920 && s > 18) { s -= 4; g.font = `bold ${s}px system-ui, sans-serif`; } return g.measureText(t).width; };
  const w1 = fit(l1, 84), y1 = l2 ? 80 : Hh / 2, w2 = l2 ? (g.font = '', fit(l2, 56)) : 0;
  const bw = Math.min(W - 8, Math.max(w1, w2) + 80);
  g.fillStyle = 'rgba(10,6,20,.66)'; g.beginPath(); g.roundRect ? g.roundRect((W - bw) / 2, 6, bw, Hh - 12, 36) : g.rect((W - bw) / 2, 6, bw, Hh - 12); g.fill();
  g.strokeStyle = c1; g.globalAlpha = 0.6; g.lineWidth = 4; g.stroke(); g.globalAlpha = 1;
  fit(l1, 84); g.fillStyle = c1; g.fillText(l1, W / 2, y1 + 3);
  if (l2) { fit(l2, 56); g.fillStyle = c2 || c1; g.fillText(l2, W / 2, 176); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return lc[k] = { mat: new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }), aspect: W / Hh };
};
MY.lbl = (p, l1, c1, y, hgt = 0.55, l2, c2, x = 0, z = 0) => {
  const L = labelMat(l1, c1, l2, c2), h = l2 ? hgt * 1.55 : hgt; const s = new THREE.Sprite(L.mat); s.scale.set(h * L.aspect, h, 1); s.position.set(x, y, z); s.renderOrder = 6; p.add(s); return s;
};
// ---- weapons (y up, normalised to a target length and centred on the origin)
const norm = (g, len) => {
  g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(g), s = new THREE.Vector3(), c = new THREE.Vector3(); b.getSize(s); b.getCenter(c);
  const k = len / Math.max(s.x, s.y, s.z), inner = new THREE.Group(), out = new THREE.Group(); g.position.sub(c); inner.add(g); inner.scale.setScalar(k); out.add(inner); return out;
};
const tube = (curve, r, seg = 24) => new THREE.TubeGeometry(curve, seg, r, 8, false);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const fan = (g, mat, side, y, sy, len) => mk(g, GEO.cone, mat, side * (len / 2 + 0.03), y, 0, sy, len, 0.03, 0, 0, side > 0 ? PI / 2 : -PI / 2);
const WB = {
  club(g, m, it, key) {
    if (key === 'stick') { mk(g, cg(0.05, 0.03), m.wood, 0, 0, 0, 1, 1.3, 1); mk(g, GEO.sph, m.wood, 0.03, 0.25, 0, 0.05); mk(g, cg(0.032, 0.035), m.lea, 0, -0.45, 0, 1, 0.3, 1); return; }
    mk(g, cg(0.15, 0.065), m.wood, 0, 0.25, 0, 1, 0.8, 1); mk(g, cg(0.04, 0.045), m.wood, 0, -0.4, 0, 1, 0.55, 1); mk(g, GEO.sph, m.wood, 0, -0.7, 0, 0.065);
    for (const y of [-0.5, -0.38, -0.26]) mk(g, cg(0.047, 0.047), m.lea, 0, y, 0, 1, 0.05, 1);
    for (let i = 0; i < 16; i++) { const a = i * 2.4, y = -0.12 + (i / 15) * 0.74, r = 0.065 + 0.085 * ((y + 0.15) / 0.8); spike(g, m.trim, Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a), 0.2, Math.sin(a), 0.1, 0.018); }
  },
  dagger(g, m, it, key) {
    const L = key === 'shadowfang' ? 0.72 : 0.55;
    mk(g, GEO.cone4, m.blade, 0, 0.2 + L / 2 - 0.27, 0, 0.065, L, 0.014); mk(g, GEO.box, m.trim, 0, 0.2, 0.0, 0.012, L * 0.75, 0.02).position.y = 0.15 + L * 0.3;
    mk(g, GEO.box, m.trim, 0, -0.07, 0, 0.24, 0.045, 0.06); mk(g, GEO.sph, m.trim, 0.12, -0.07, 0, 0.035); mk(g, GEO.sph, m.trim, -0.12, -0.07, 0, 0.035);
    mk(g, cg(0.03, 0.03), m.lea, 0, -0.2, 0, 1, 0.22, 1); for (const y of [-0.13, -0.2, -0.27]) mk(g, cg(0.033, 0.033), m.trim, 0, y, 0, 1, 0.015, 1); mk(g, GEO.sph, m.trim, 0, -0.33, 0, 0.045);
    if (key === 'shadowfang') { mk(g, GEO.oct, m.glow, 0, -0.07, 0.04, 0.03); for (let i = 0; i < 3; i++) spike(g, m.blade, 0.04, 0.35 + i * 0.12, 0, 1, 0.3, 0, 0.07, 0.015); }
  },
  sword(g, m, it, key) {
    const big = key === 'claymore', sl = key === 'slayer', W = big ? 0.16 : sl ? 0.14 : 0.09, L = big ? 1.2 : sl ? 1.1 : key === 'ironsword' ? 0.95 : 0.85;
    mk(g, GEO.box, m.blade, 0, L / 2, 0, W, L, 0.022); mk(g, GEO.cone4, m.blade, 0, L + 0.08, 0, W / 2, 0.17, 0.011);
    mk(g, GEO.box, m.trim, 0, L * 0.5, 0.012, W * 0.22, L * 0.82, 0.008);
    mk(g, GEO.box, m.trim, 0, 0, 0, W * 3 + 0.14, 0.05, 0.075); for (const s of [-1, 1]) mk(g, GEO.sph, m.trim, s * (W * 1.5 + 0.07), 0, 0, 0.04);
    mk(g, cg(0.03, 0.033), m.lea, 0, -0.14, 0, 1, 0.24, 1); for (const y of [-0.08, -0.14, -0.2]) mk(g, cg(0.036, 0.036), m.trim, 0, y, 0, 1, 0.012, 1); mk(g, GEO.sph, m.trim, 0, -0.29, 0, 0.05);
    if (key === 'sword') for (const [y, x, s] of [[0.2, 0.02, 0.05], [0.5, -0.02, 0.06], [0.7, 0.015, 0.04]]) mk(g, GEO.box, MM(0x6a3a1c, { roughness: 1 }), x, y, 0.012, s, s * 1.4, 0.006);
    if (sl) { mk(g, GEO.box, BM(0xff3020), 0, L * 0.5, 0.016, 0.014, L * 0.7, 0.006); mk(g, GEO.oct, BM(0xff3020), 0, 0.0, 0.05, 0.03); }
    if (big) mk(g, GEO.box, m.trim, 0, 0.18, 0, W + 0.03, 0.05, 0.03);
  },
  bow(g, m, it, key) {
    const lg = key === 'longbow', H = lg ? 0.95 : 0.7, b = lg ? 0.3 : 0.27;
    mk(g, tube(new THREE.QuadraticBezierCurve3(V3(0, -H, 0), V3(0, 0, 2 * b), V3(0, H, 0)), 0.024), m.wood);
    mk(g, cg(0.006, 0.006, 6), MM(0xe8dcc0, { roughness: 0.6 }), 0, 0, 0, 1, 2 * H, 1);
    mk(g, cg(0.036, 0.036), m.lea, 0, 0, b, 1, 0.26, 1, 0, 0, 0).rotation.x = 0; for (const s of [-1, 1]) mk(g, GEO.sph, m.trim, 0, s * H, 0, 0.03);
    mk(g, cg(0.007, 0.007, 6), m.wood, 0, 0.0, b * 0.5, 1, 2 * H * 0.55, 1, PI / 2, 0, 0).position.set(0, 0, 0.25); mk(g, GEO.cone, m.blade, 0, 0, 0.25 + H * 0.55, 0.02, 0.07, 0.01, PI / 2, 0, 0);
    if (m.n >= 2) mk(g, GEO.oct, m.glow, 0, 0.18, b + 0.03, 0.025);
  },
  axe(g, m, it, key) {
    const hand = key === 'handaxe', exe = key === 'executioner', hl = hand ? 0.9 : exe ? 1.5 : 1.3, hy = hl / 2 - 0.2;
    mk(g, cg(0.032, 0.04), m.wood, 0, 0, 0, 1, hl, 1); mk(g, GEO.sph, m.trim, 0, -hl / 2, 0, 0.045);
    mk(g, GEO.box, m.trim, 0, hy, 0, 0.13, 0.36, 0.1); spike(g, m.trim, 0, hy + 0.18, 0, 0, 1, 0, 0.2, 0.04);
    for (const dy of [-0.14, 0.14]) mk(g, cg(0.04, 0.04), m.lea, 0, hy + dy - (dy > 0 ? 0.3 : 0.12), 0, 1, 0.1, 1);
    if (hand) fan(g, m.blade, 1, hy, 0.17, 0.3); else if (exe) { fan(g, m.blade, 1, hy, 0.42, 0.55); spike(g, m.trim, -0.06, hy, 0, -1, 0, 0, 0.2, 0.05); mk(g, GEO.sph, m.glow, 0.25, hy, 0.04, 0.03); } else { fan(g, m.blade, 1, hy, 0.25, 0.36); fan(g, m.blade, -1, hy, 0.25, 0.36); }
    if (m.n >= 3) mk(g, GEO.oct, m.glow, 0, hy, 0.06, 0.03);
  },
  spear(g, m, it, key) {
    const wy = key === 'wyrmspear';
    mk(g, cg(0.025, 0.03), m.wood, 0, 0, 0, 1, 1.7, 1); mk(g, GEO.cone4, m.blade, 0, 1.02, 0, wy ? 0.1 : 0.07, wy ? 0.55 : 0.42, 0.02); mk(g, cg(0.04, 0.03), m.trim, 0, 0.8, 0, 1, 0.14, 1);
    mk(g, cg(0.032, 0.032), m.trim, 0, -0.85, 0, 1, 0.1, 1); spike(g, m.trim, 0, -0.9, 0, 0, -1, 0, 0.12, 0.03);
    spike(g, MM(0xaa2020, { roughness: 1, side: THREE.DoubleSide }), 0.02, 0.76, 0, 0, -1, 0, 0.22, 0.05);
    if (wy) for (const s of [-1, 1]) { spike(g, m.blade, s * 0.04, 0.84, 0, s * 1, 0.7, 0, 0.26, 0.03); spike(g, m.blade, s * 0.04, 0.72, 0, s * 1, -0.2, 0, 0.18, 0.025); }
  },
  mace(g, m, it) {
    mk(g, cg(0.03, 0.037), m.wood, 0, 0, 0, 1, 1.0, 1); mk(g, GEO.sph, m.trim, 0, 0.62, 0, 0.16); mk(g, cg(0.09, 0.07), m.trim, 0, 0.47, 0, 1, 0.08, 1);
    for (const [x, y, z] of fib(16)) spike(g, m.trim, x * 0.15, 0.62 + y * 0.15, z * 0.15, x, y, z, 0.12, 0.03);
    mk(g, GEO.sph, m.trim, 0, -0.5, 0, 0.045); for (const y of [-0.3, -0.2, -0.1]) mk(g, cg(0.036, 0.036), m.lea, 0, y, 0, 1, 0.03, 1);
  },
  crossbow(g, m, it) {
    mk(g, GEO.box, m.wood, 0, 0, 0, 0.1, 1.0, 0.075); mk(g, GEO.box, m.wood, 0, -0.5, 0, 0.14, 0.14, 0.09); mk(g, tube(new THREE.QuadraticBezierCurve3(V3(-0.46, 0.2, 0), V3(0, 0.55, 0), V3(0.46, 0.2, 0)), 0.025), m.trim);
    for (const s of [-1, 1]) mk(g, cg(0.006, 0.006, 6), MM(0xe8dcc0), s * 0.23, 0.12, 0, 1, 0.5, 1, 0, 0, -s * 0.9); mk(g, GEO.tor, m.trim, 0, 0.48, 0, 0.07, 0.07, 0.7, PI / 2, 0, 0);
    mk(g, cg(0.012, 0.012, 6), m.wood, 0, 0.3, 0.055, 1, 0.65, 1); mk(g, GEO.cone, m.blade, 0, 0.66, 0.055, 0.025, 0.1, 0.012); mk(g, GEO.box, m.trim, 0, -0.2, -0.07, 0.03, 0.1, 0.02);
    if (m.n >= 2) mk(g, GEO.oct, m.glow, 0, 0.1, 0.045, 0.025);
  },
  flail(g, m, it) {
    mk(g, cg(0.03, 0.037), m.wood, 0, -0.1, 0, 1, 0.8, 1); mk(g, GEO.sph, m.trim, 0, -0.52, 0, 0.045); mk(g, GEO.tor, m.trim, 0, 0.3, 0, 0.05, 0.05, 0.05, PI / 2);
    for (let i = 0; i < 7; i++) { const t = i / 6, x = 0.02 + 0.38 * t, y = 0.34 + 0.34 * t - 0.12 * t * t; const l = mk(g, GEO.tor, m.trim, x, y, 0, 0.04, 0.04, 0.04, 0, i % 2 ? PI / 2 : 0, 0.8); }
    mk(g, GEO.sph, m.trim, 0.52, 0.62, 0, 0.14); for (const [x, y, z] of fib(14)) spike(g, m.trim, 0.52 + x * 0.14, 0.62 + y * 0.14, z * 0.14, x, y, z, 0.1, 0.028);
  },
  halberd(g, m, it) {
    mk(g, cg(0.03, 0.036), m.wood, 0, 0, 0, 1, 2.0, 1); mk(g, GEO.cone4, m.blade, 0, 1.2, 0, 0.05, 0.4, 0.02); mk(g, GEO.box, m.trim, 0, 0.98, 0, 0.1, 0.16, 0.08);
    fan(g, m.blade, 1, 0.84, 0.3, 0.38); spike(g, m.trim, -0.04, 0.82, 0, -1, -0.5, 0, 0.3, 0.035); mk(g, cg(0.042, 0.042), m.trim, 0, 0.72, 0, 1, 0.08, 1); mk(g, cg(0.04, 0.04), m.lea, 0, 0.0, 0, 1, 0.3, 1); spike(g, m.trim, 0, -1.0, 0, 0, -1, 0, 0.12, 0.03);
    spike(g, MM(0xaa2020, { roughness: 1, side: THREE.DoubleSide }), 0.02, 0.68, 0, 0, -1, 0, 0.3, 0.05);
  },
  hammer(g, m, it) {
    mk(g, cg(0.036, 0.042), m.wood, 0, 0, 0, 1, 1.4, 1); mk(g, GEO.box, m.trim, 0, 0.62, 0, 0.5, 0.3, 0.26); for (const s of [-1, 1]) { mk(g, cg(0.17, 0.17), m.blade, s * 0.27, 0.62, 0, 1, 0.08, 1, 0, 0, PI / 2); mk(g, GEO.box, m.blade, s * 0.1, 0.62, 0, 0.04, 0.34, 0.3); }
    mk(g, GEO.sph, m.trim, 0, -0.7, 0, 0.05); for (const y of [-0.5, -0.4, -0.3, -0.2]) mk(g, cg(0.044, 0.044), m.lea, 0, y, 0, 1, 0.03, 1);
    if (m.n >= 2) for (const s of [-1, 1]) mk(g, GEO.box, m.glow, 0, 0.62, s * 0.131, 0.28, 0.1, 0.006);
  },
  staff(g, m, it) {
    mk(g, cg(0.03, 0.05), m.wood, 0, 0, 0, 1, 1.6, 1); for (const [y, a, s] of [[-0.4, 0.5, 0.05], [0.1, 2, 0.06], [0.45, 3.5, 0.05]]) mk(g, GEO.sph, m.wood, Math.cos(a) * 0.035, y, Math.sin(a) * 0.035, s, s * 1.3, s);
    for (let i = 0; i < 3; i++) mk(g, GEO.tor, m.wood, 0, 0.92, 0, 0.13, 0.13, 0.13, 0.9 * i, i * 1.0, 0.4).scale.z = 0.8;
    mk(g, GEO.sph, MM(0x7fd0ff, { emissive: 0x2a8cff, emissiveIntensity: 1.2, roughness: 0.1 }), 0, 0.92, 0, 0.085);
  },
  scepter(g, m, it) {
    const gold = MM(0xf4c24d, { metalness: 1, roughness: 0.22, envMapIntensity: 1.6, emissive: 0x6a3d00, emissiveIntensity: 0.5 });
    mk(g, cg(0.025, 0.03), gold, 0, 0, 0, 1, 1.0, 1); for (const y of [-0.3, 0.1, 0.35]) mk(g, GEO.tor, gold, 0, y, 0, 0.06, 0.06, 0.06, PI / 2);
    mk(g, GEO.sph, gold, 0, 0.55, 0, 0.1); mk(g, GEO.oct, MM(0xff2a4a, { emissive: 0xff1030, emissiveIntensity: 1.1, roughness: 0.1 }), 0, 0.72, 0, 0.07, 0.11, 0.07);
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; spike(g, gold, Math.cos(a) * 0.08, 0.57, Math.sin(a) * 0.08, Math.cos(a), 1.2, Math.sin(a), 0.2, 0.025); }
    spike(g, gold, 0, -0.5, 0, 0, -1, 0, 0.14, 0.035); mk(g, GEO.sph, gold, 0, -0.5, 0, 0.045);
  },
};
MY.WB = WB;
const wcache = {};
MY.weaponProto = key => {
  if (wcache[key]) return wcache[key];
  const it = GKITEMS.ITEMS[key] || GKITEMS.ITEMS['w:sword'], k = key.slice(2), m = tierMats(it.tier);
  let out = null;
  const ck = GK.chestKit && GK.chestKit.weaponModel;
  if (ck) { try { const w = ck(key); if (w) out = norm(w.clone ? w.clone(true) : w, 1.9); } catch (e) { out = null; } }
  if (!out) { const g = new THREE.Group(); (WB[it.family] || WB.sword)(g, m, it, k); const len = { dagger: 1.1, sword: k === 'claymore' ? 2.0 : 1.7, club: 1.5, bow: k === 'longbow' ? 2.0 : 1.6, axe: k === 'handaxe' ? 1.3 : 1.7, spear: 2.1, mace: 1.6, crossbow: 1.5, flail: 1.5, halberd: 2.3, hammer: 1.7, staff: 2.0, scepter: 1.6 }[it.family] || 1.6; out = norm(g, len); }
  return wcache[key] = out;
};
} // ---- end part 1
{ // ---- part 2: armour models on a mannequin (origin = floor level of the stand)
const MY = GK.mys, { GEO, cg, mk, grp, MM, BM, spike, fib, TEX, tierMats } = MY, PI = Math.PI;
const dsc = {}, DS = mat => dsc[mat.uuid] || (dsc[mat.uuid] = Object.assign(mat.clone(), { side: THREE.DoubleSide }));
const tmc = {}, texMat = (k, tex, color, o = {}) => tmc[k] || (tmc[k] = new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide, envMapIntensity: 1, ...o }));
const woodL = MM(0xb89a70, { roughness: 0.8 }), bone = MM(0xe8dfc0, { roughness: 0.6 });
const open = (a, rt, rb, len, y, mat, seg = 24) => mk(a, cg(rt, rb, seg, true), DS(mat), 0, y, 0, 1, len, 1);
const onCyl = (a, geo, mat, r, ang, y, sx, sy, sz, tilt = 0) => { const q = mk(a, geo, mat, Math.sin(ang) * r, y, Math.cos(ang) * r, sx, sy, sz); q.rotation.order = 'YXZ'; q.rotation.set(tilt, ang, 0); return q; };
const mannequin = a => {
  mk(a, cg(0.38, 0.42), MM(0x4a2c18, { roughness: 0.7 }), 0, 0.03, 0, 1, 0.06, 1); mk(a, cg(0.035, 0.035), woodL, 0, 0.45, 0, 1, 0.85, 1);
  mk(a, cg(0.25, 0.2, 20), woodL, 0, 1.12, 0, 1, 0.62, 1); mk(a, GEO.sph, woodL, 0, 1.43, 0, 0.26, 0.04, 0.2); mk(a, GEO.box, woodL, 0, 1.4, 0, 0.74, 0.06, 0.07);
  for (const s of [-1, 1]) mk(a, GEO.sph, woodL, s * 0.37, 1.4, 0, 0.055); mk(a, cg(0.06, 0.07), woodL, 0, 1.52, 0, 1, 0.12, 1); mk(a, GEO.sph, woodL, 0, 1.66, 0, 0.115, 0.13, 0.12);
};
const belt = (a, m, y = 0.9, r = 0.29, buckle = true) => { mk(a, GEO.tor, m.lea, 0, y, 0, r, r, r * 1.2, PI / 2).scale.z = 0.35; if (buckle) mk(a, GEO.box, m.trim, 0, y, r + 0.015, 0.08, 0.07, 0.025); };
const sleeves = (a, mat, r = 0.09, len = 0.28) => { for (const s of [-1, 1]) { const q = open(a, r, r * 1.2, len, 1.3, mat, 12); q.position.x = s * 0.4; q.rotation.z = -s * 1.85; } };
const AB = {
  cloth(a, m, it, k) {
    const col = m.cloth;
    if (k === 'sack') {
      const bm = texMat('burlap', TEX.burlap, 0xffffff, { metalness: 0, roughness: 1 }); TEX.burlap.repeat.set(5, 3);
      mk(a, cg(0.3, 0.4, 24, true), bm, 0, 1.0, 0, 1, 0.9, 1); mk(a, GEO.tor, bm, 0, 1.44, 0, 0.3, 0.3, 0.5, PI / 2).scale.z = 0.4; for (const s of [-1, 1]) { mk(a, cg(0.1, 0.1, 14), MM(0x2a1c10), s * 0.33, 1.28, 0, 1, 0.02, 1.3, 0, 0, PI / 2); mk(a, GEO.tor, bm, s * 0.34, 1.28, 0, 0.11, 0.11, 0.5, 0, PI / 2, 0); }
      mk(a, GEO.tor, MM(0x8a6a3a, { roughness: 1 }), 0, 0.98, 0, 0.35, 0.35, 0.9, PI / 2); mk(a, GEO.sph, bm, 0, 0.55, 0.3, 0.07, 0.04, 0.04); mk(a, GEO.sph, MM(0x8a6a3a), 0, 0.6, 0.4, 0.05);
      for (let i = 0; i < 9; i++) spike(a, bm, Math.sin(i * 0.7) * 0.37, 0.58, Math.cos(i * 0.7) * 0.37, 0, -1, 0, 0.1, 0.03); return;
    }
    const mat = k === 'gambeson' ? texMat('quilt', TEX.quilt, col.color.getHex(), { metalness: 0, roughness: 1 }) : col;
    if (k === 'gambeson') TEX.quilt.repeat.set(6, 3);
    open(a, 0.29, k === 'gambeson' ? 0.34 : 0.32, 0.72, 1.08, mat); sleeves(a, mat, k === 'gambeson' ? 0.13 : 0.1, k === 'gambeson' ? 0.4 : 0.26);
    mk(a, GEO.tor, mat, 0, 1.46, 0, 0.14, 0.14, 0.6, PI / 2).scale.z = 0.7; belt(a, { lea: MM(0x7a6a44, { roughness: 1 }), trim: m.trim }, 0.95, 0.31, false);
    if (k === 'rags' || k === 'cloth') for (let i = 0; i < 14; i++) { const ang = i / 14 * PI * 2; spike(a, DS(col), Math.sin(ang) * 0.32, 0.74, Math.cos(ang) * 0.32, 0, -1, 0, 0.1 + 0.08 * ((i * 7) % 3) / 2, 0.06); }
    const pc = [0x8a2a2a, 0x2a5a8a, 0x6a5a2a, 0x4a7a3a];
    if (k !== 'sack') for (let i = 0; i < (k === 'cloth' ? 6 : 3); i++) { const q = onCyl(a, GEO.box, MM(pc[i % 4], { roughness: 1 }), 0.325, -0.9 + i * 0.7, 1.25 - (i % 3) * 0.18, 0.1, 0.1, 0.012); mk(q, GEO.box, MM(0x2a1c10), 0, 0, 0.007, 0.115, 0.012, 0.004); }
    if (k === 'gambeson') { for (const y of [1.3, 1.1, 0.9]) mk(a, GEO.tor, MM(0x6a5a3a, { roughness: 1 }), 0, y, 0, 0.325, 0.325, 0.5, PI / 2).scale.z = 0.12; }
  },
  leather(a, m, it, k) {
    const lea = DS(k === 'boiled' ? MM(0x3a2414, { roughness: 0.3, metalness: 0.2, emissive: m.lea.emissive.getHex(), emissiveIntensity: 0.3 }) : m.lea);
    if (k === 'scraps') {
      [[0.3, 1.38, 0.2], [0.325, 1.2, 0.2], [0.3, 1.03, 0.2], [0.33, 0.86, 0.18]].forEach(([r, y, h], i) => { mk(a, cg(r, r + 0.02, 22, true), i % 2 ? lea : DS(MM(0x7a5230, { roughness: 0.9 })), 0, y, 0, 1, h, 1); for (let j = 0; j < 9; j++) { const an = j / 9 * PI * 2 + i; spike(a, i % 2 ? lea : DS(MM(0x7a5230)), Math.sin(an) * (r + 0.02), y - h / 2, Math.cos(an) * (r + 0.02), 0, -1, 0, 0.06, 0.035); } });
      for (const s of [-1, 1]) mk(a, GEO.box, lea, s * 0.2, 1.43, 0, 0.1, 0.03, 0.34); mk(a, cg(0.01, 0.01, 6), MM(0xd8c8a0), 0, 1.1, 0.3, 1, 0.6, 1).rotation.z = 0.2; return;
    }
    open(a, 0.285, 0.26, 0.64, 1.1, lea); for (const s of [-1, 1]) mk(a, GEO.box, lea, s * 0.2, 1.43, 0, 0.1, 0.035, 0.36);
    mk(a, GEO.box, MM(0x1e1208), 0, 1.15, 0.272, 0.05, 0.5, 0.012); for (let i = 0; i < 6; i++) mk(a, GEO.box, MM(0xd8c8a0), 0, 1.35 - i * 0.08, 0.282, 0.09, 0.012, 0.006, 0, 0, i % 2 ? 0.5 : -0.5);
    belt(a, m, 0.84, 0.265);
    if (k === 'vest') for (let r = 0; r < 3; r++) for (let j = 0; j < 14; j++) { const an = -1.45 + j * 0.22; if (Math.abs(an) < 0.12) continue; mk(a, GEO.sph, m.trim, Math.sin(an) * 0.29, 1.3 - r * 0.15, Math.cos(an) * 0.29, 0.02); }
    if (k === 'jerkin') { for (let i = 0; i < 7; i++) onCyl(a, GEO.sph, MM(0x2a1c10, { roughness: 1 }), 0.28, -1.2 + i * 0.5, 1.3 - (i % 3) * 0.15, 0.06, 0.04, 0.02); for (let i = 0; i < 14; i++) { const an = i / 14 * PI * 2; mk(a, GEO.sph, MM(0xe6dcc8, { roughness: 1 }), Math.sin(an) * 0.17, 1.47, Math.cos(an) * 0.17, 0.07); } }
    if (k === 'boiled') { for (let i = 0; i < 5; i++) mk(a, GEO.tor, m.trim, 0, 1.38 - i * 0.12, 0, 0.275 - i * 0.004, 0.275 - i * 0.004, 0.5, PI / 2).scale.z = 0.12; for (const s of [-1, 1]) { mk(a, GEO.hemi, m.trim, s * 0.38, 1.42, 0, 0.17, 0.12, 0.17, 0, 0, -s * 0.3); mk(a, GEO.sph, m.trim, s * 0.36, 1.55, 0, 0.02); } }
  },
  mail(a, m, it, k) {
    const sc = k === 'scale' || k === 'dragon', tex = sc ? TEX.scale : TEX.chain; tex.repeat.set(sc ? 5 : 8, sc ? 3 : 5);
    const col = k === 'dragon' ? 0x3ad0a0 : k === 'mythril' ? 0xa8c8ff : k === 'scale' ? 0xb08a58 : k === 'brigandine' ? 0x8a8a8c : m.metal.color.getHex();
    const mat = texMat('mail' + k + it.tier, tex, col, { emissive: k === 'dragon' ? 0x0a6a50 : k === 'mythril' ? 0x2a5ac8 : m.metal.emissive.getHex(), emissiveIntensity: k === 'dragon' ? 0.6 : k === 'mythril' ? 0.8 : 0.3, metalness: 0.7, roughness: 0.4 });
    open(a, 0.29, 0.31, 0.8, 1.04, mat, 26); sleeves(a, mat, 0.1, 0.34); mk(a, cg(0.14, 0.18, 14, true), mat, 0, 1.55, 0, 1, 0.14, 1); belt(a, m, 0.9, 0.3);
    for (let i = 0; i < 16; i++) { const an = i / 16 * PI * 2; spike(a, mat, Math.sin(an) * 0.315, 0.64, Math.cos(an) * 0.315, 0, -1, 0, 0.07, 0.04); }
    if (k === 'brigandine') for (let i = 0; i < 4; i++) { const q = onCyl(a, GEO.box, MM(0x5a2a2a, { roughness: 0.9 }), 0.315, -0.52 + i * 0.35, 1.15, 0.18, 0.5, 0.014); for (const dy of [-0.18, 0, 0.18]) mk(q, GEO.sph, m.trim, 0, dy, 0.01, 0.014); }
    if (k === 'dragon') { for (const s of [-1, 1]) for (let i = 0; i < 4; i++) spike(a, mk(a, GEO.dodec, MM(0x0a6a50), 0, 0, 0, 0).material, s * (0.34 + i * 0.03), 1.44 + i * 0.01, (i - 1.5) * 0.08, s, 1, 0, 0.18, 0.03); }
    if (k === 'mythril') mk(a, GEO.oct, BM(0x9ad0ff), 0, 1.3, 0.3, 0.035, 0.055, 0.02);
  },
  harness(a, m, it) {
    const lea = DS(m.lea); open(a, 0.27, 0.23, 0.6, 1.1, lea, 20); mk(a, GEO.sph, m.metal, 0, 1.22, 0.07, 0.29, 0.3, 0.2);
    for (const s of [-1, 1]) { mk(a, GEO.box, m.lea, 0, 1.15, 0.265, 0.07, 0.8, 0.025, 0, 0, s * 0.62); mk(a, GEO.hemi, m.metal, s * 0.4, 1.43, 0, 0.23, 0.17, 0.21, 0, 0, -s * 0.45); for (let i = 0; i < 4; i++) spike(a, m.trim, s * (0.4 + (i - 1.5) * 0.045), 1.5 + (i % 2) * 0.02, (i - 1.5) * 0.07, s * 0.3, 1, 0, 0.14, 0.03); }
    belt(a, m, 0.84, 0.25, false); mk(a, GEO.sph, bone, 0, 0.84, 0.27, 0.06, 0.055, 0.04); for (const s of [-1, 1]) mk(a, GEO.sph, MM(0x100808), s * 0.02, 0.85, 0.305, 0.012);
    for (let i = 0; i < 5; i++) { const an = -0.9 + i * 0.45; onCyl(a, GEO.box, m.metal, 0.27, an, 0.68, 0.12, 0.22, 0.03, 0.08); }
  },
  plate(a, m, it, k) {
    let metal = m.metal; if (k === 'obsidian') metal = MM(0x16121e, { metalness: 1, roughness: 0.1, envMapIntensity: 1.8, emissive: 0x2a0408, emissiveIntensity: 0.5 }); if (k === 'aegis') metal = MM(0xfff1c8, { metalness: 1, roughness: 0.12, envMapIntensity: 2, emissive: 0xd8a020, emissiveIntensity: 0.7 });
    const wide = k === 'dwarven' ? 1.15 : 1, simple = k === 'cuirass';
    const body = grp(a, 0, 0, 0); body.scale.x = wide;
    mk(body, GEO.sph, metal, 0, 1.2, 0.02, 0.3, 0.31, 0.22); mk(body, cg(0.25, 0.3, 24, true), DS(metal), 0, 0.82, 0, 1, 0.34, 1); mk(body, cg(0.2, 0.14, 12), metal, 0, 1.52, 0, 1, 0.1, 1);
    mk(body, GEO.box, m.trim, 0, 1.2, 0.235, 0.025, 0.5, 0.012);
    for (const s of [-1, 1]) {
      const n = simple ? 1 : 3; for (let i = 0; i < n; i++) mk(body, GEO.hemi, metal, s * (0.38 + i * 0.02), 1.43 - i * 0.07, 0, 0.2 - i * 0.015, 0.14, 0.19, 0, 0, -s * (0.4 + i * 0.1));
      if (k === 'obsidian' || k === 'aegis') for (let i = 0; i < 3; i++) spike(body, metal, s * (0.42 + i * 0.03), 1.5 - i * 0.02, (i - 1) * 0.09, s * (k === 'aegis' ? 1.2 : 0.4), 1, 0, k === 'aegis' ? 0.5 : 0.22, 0.04);
    }
    if (k === 'banded') for (let i = 0; i < 6; i++) mk(body, GEO.tor, m.trim, 0, 1.4 - i * 0.12, 0.0, 0.3 - Math.abs(i - 1) * 0.02, 0.3 - Math.abs(i - 1) * 0.02, 0.5, PI / 2).scale.z = 0.14;
    if (k !== 'cuirass') {   // helm
      mk(a, GEO.sph, metal, 0, 1.67, 0, 0.14, 0.15, 0.14); mk(a, GEO.box, MM(0x050508), 0, 1.66, 0.125, 0.16, 0.025, 0.03); mk(a, cg(0.14, 0.14), m.trim, 0, 1.62, 0, 1, 0.03, 1);
      if (k === 'knight' || k === 'aegis' || k === 'dwarven') { const pc = k === 'knight' ? 0xc02030 : k === 'aegis' ? 0xffffff : 0x8a3a1a; spike(a, MM(pc, { roughness: 0.8 }), 0, 1.78, -0.04, 0, 1, -0.5, 0.3, 0.05); }
      if (k === 'dwarven') { for (const s of [-1, 1]) spike(a, bone, s * 0.12, 1.72, 0, s, 0.7, 0, 0.22, 0.04); for (let i = 0; i < 3; i++) mk(a, GEO.sph, MM(0xa05a20, { roughness: 1 }), (i - 1) * 0.045, 1.5 - i * 0.02, 0.17, 0.035, 0.1, 0.03); }
      if (k === 'obsidian') for (const s of [-1, 1]) spike(a, metal, s * 0.1, 1.76, 0, s * 0.5, 1, 0, 0.22, 0.035);
    }
    if (k === 'knight') { mk(a, GEO.box, MM(0xc02030, { roughness: 0.9, side: THREE.DoubleSide }), 0, 0.8, 0.31, 0.3, 0.5, 0.012); mk(a, GEO.box, MM(0xf0e8d0), 0, 0.82, 0.318, 0.05, 0.36, 0.004); mk(a, GEO.box, MM(0xf0e8d0), 0, 0.88, 0.318, 0.2, 0.05, 0.004); }
    if (k === 'obsidian') for (let i = 0; i < 6; i++) mk(body, GEO.box, BM(0xff3a1a), (i % 3 - 1) * 0.12, 1.1 + (i >> 1) * 0.1, 0.235 + 0.02 * (i % 2), 0.012, 0.14, 0.006, 0, 0, i * 0.7);
    if (k === 'aegis') { mk(a, GEO.sph, BM(0xfff0b0), 0, 1.22, 0.245, 0.09, 0.09, 0.02); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) mk(a, GEO.cone, metal, s * 0.46, 1.6 + i * 0.08, -0.08, 0.04, 0.4 - i * 0.04, 0.012, 0, 0, -s * (0.9 + i * 0.2)); }
  },
  robe(a, m, it) {
    const cl = DS(MM(0x2a2a74, { roughness: 0.85, emissive: 0x0a0a30, emissiveIntensity: 0.6 })); open(a, 0.2, 0.44, 1.18, 0.88, cl, 28); sleeves(a, cl, 0.14, 0.4);
    for (const s of [-1, 1]) { mk(a, GEO.cone, cl, s * 0.5, 1.1, 0, 0.17, 0.55, 0.17, 0, 0, -s * 0.2); spike(a, cl, s * 0.1, 1.5, -0.12, s * 0.4, 1, -0.3, 0.3, 0.07); }
    mk(a, GEO.tor, MM(0xf4c24d, { metalness: 1, roughness: 0.25, emissive: 0x6a3d00, emissiveIntensity: 0.5 }), 0, 0.3, 0, 0.44, 0.44, 0.6, PI / 2).scale.z = 0.2; mk(a, GEO.tor, MM(0xf4c24d, { metalness: 1, roughness: 0.25 }), 0, 0.93, 0, 0.27, 0.27, 0.9, PI / 2).scale.z = 0.25;
    for (let i = 0; i < 22; i++) { const q = onCyl(a, GEO.oct, BM(0xffe27a), 0.2 + (1.4 - (i * 0.37 % 1.0)) * 0.24 + 0.012, i * 0.9, 0.38 + (i * 0.37 % 1.0) * 1.0, 0.025, 0.025, 0.01); }
  },
  royal(a, m, it) {
    const red = MM(0x8a0f1c, { roughness: 0.6, emissive: 0x2a0408, emissiveIntensity: 0.4, side: THREE.DoubleSide }), gold = MM(0xf4c24d, { metalness: 1, roughness: 0.22, emissive: 0x6a3d00, emissiveIntensity: 0.5 }), fur = MM(0xf4f0e8, { roughness: 1 });
    open(a, 0.28, 0.25, 0.72, 1.08, MM(0x3a0a14, { roughness: 0.6, side: THREE.DoubleSide }), 22);
    mk(a, new THREE.CylinderGeometry(0.34, 0.56, 1.25, 28, 1, true, PI - 1.35, 2.7), red, 0, 0.9, -0.02, 1, 1, 1); mk(a, new THREE.CylinderGeometry(0.34, 0.56, 1.25, 28, 1, true, PI - 1.35, 2.7), red, 0, 0.9, -0.02, 1.0, 1, 1).visible = false;
    for (let i = 0; i < 16; i++) { const an = i / 16 * PI * 2; if (Math.abs(an - PI) < 0.5) continue; mk(a, GEO.sph, fur, Math.sin(an) * 0.3, 1.5, Math.cos(an) * 0.3, 0.095); }
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) { mk(a, GEO.sph, fur, s * 0.14, 1.38 - i * 0.12, 0.27, 0.07); if (i % 2) mk(a, GEO.sph, MM(0x15110e), s * 0.14, 1.38 - i * 0.12, 0.33, 0.02); }
    for (const s of [-1, 1]) mk(a, GEO.sph, gold, s * 0.17, 1.42, 0.3, 0.04); mk(a, GEO.tor, gold, 0, 1.42, 0.3, 0.17, 0.05, 0.4).rotation.z = 0; mk(a, GEO.tor, gold, 0, 0.62, 0, 0.275, 0.275, 0.9, PI / 2).scale.z = 0.2; belt(a, { lea: gold, trim: gold }, 0.86, 0.26);
    mk(a, cg(0.12, 0.14), gold, 0, 1.78, 0, 1, 0.07, 1); for (let i = 0; i < 5; i++) { const an = i / 5 * PI * 2; spike(a, gold, Math.sin(an) * 0.125, 1.8, Math.cos(an) * 0.125, 0, 1, 0, 0.1, 0.025); mk(a, GEO.sph, gold, Math.sin(an) * 0.125, 1.92, Math.cos(an) * 0.125, 0.018); }
  },
};
MY.AB = AB; MY.mannequin = mannequin;
} // ---- end part 2
{ // ---- part 3: the five enemy goblins (regular, dumb, speedy, archer, troll). Each builder: (parent, ctx) -> { h: height in metres, anim(t) }
const MY = GK.mys, { GEO, cg, mk, grp, dyn, MM, BM, GS, glow, spike, fib } = MY, PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const rod = MY.rod = (p, mat, A, B, r) => { const m = new THREE.Mesh(GEO.cyl, mat), d = B.clone().sub(A), L = d.length(); m.scale.set(r, L, r); m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); p.add(m); return m; };
function ik(arm, T, pole, L1 = 0.3, L2 = 0.29) {   // two-bone arm in torso space: hand reaches T, elbow bends toward `pole`
  const S = arm.sh.position, u = _a.copy(T).sub(S); let d = Math.min(u.length(), L1 + L2 - 0.01); u.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a)), p = _b.copy(pole).addScaledVector(u, -pole.dot(u)).normalize();
  const E = _c.copy(S).addScaledVector(u, a).addScaledVector(p, h), e1 = E.clone().sub(S).normalize(); arm.sh.quaternion.setFromUnitVectors(DOWN, e1);
  const e2 = S.clone().addScaledVector(u, d).sub(E).normalize().applyQuaternion(arm.sh.quaternion.clone().invert()); arm.el.quaternion.setFromUnitVectors(DOWN, e2);
}
const hoodGeo = new THREE.SphereGeometry(1, 20, 14, PI / 2 + 0.95, 2 * PI - 1.9);
const arcGeo = new THREE.TorusGeometry(1, 0.05, 6, 14, PI);
function gob(parent, o) {
  const w = o.w || 1, bel = o.belly || 1, P = {};
  const sk = MM(o.skin, { roughness: 0.75, emissive: o.skin, emissiveIntensity: 0.03 }), sd = MM(o.skinD, { roughness: 0.85, emissive: o.skinD, emissiveIntensity: 0.03 });
  const eyeW = MM(0xf0e8b0, { roughness: 0.4, emissive: 0x403a10, emissiveIntensity: 0.4 }), pup = BM(o.eye || 0xff3a18), tooth = MM(0xe8dfc0, { roughness: 0.5 });
  P.sk = sk; P.sd = sd; P.tooth = tooth;
  const body = P.body = dyn(grp(parent));
  for (const s of [-1, 1]) {
    const hip = dyn(grp(body, s * 0.13 * w, 0.52, 0)), knee = dyn(grp(hip, 0, -0.26, 0)); P[s < 0 ? 'hipL' : 'hipR'] = hip; P[s < 0 ? 'kneeL' : 'kneeR'] = knee;
    mk(hip, GEO.cyl, sk, 0, -0.13, 0, 0.09 * w, 0.27, 0.09 * w); mk(knee, GEO.cyl, sk, 0, -0.13, 0, 0.075 * w, 0.27, 0.075 * w); mk(knee, GEO.sph, sd, 0, -0.26, 0.06, 0.09 * w, 0.05, 0.15);
    for (const tx of [-0.04, 0, 0.04]) spike(knee, tooth, tx * w, -0.27, 0.19, 0, -0.15, 1, 0.05, 0.013);
  }
  const torso = P.torso = dyn(grp(body, 0, 0.52, 0));
  mk(torso, GEO.sph, sk, 0, 0.3, 0, 0.27 * w, 0.34, 0.22); mk(torso, GEO.sph, sk, 0, 0.2, 0.1, 0.25 * w * bel, 0.24 * bel, 0.2 * bel); mk(torso, GEO.sph, sd, 0, 0.46, -0.1, 0.2 * w, 0.18, 0.15);
  for (const s of [-1, 1]) {
    const sh = dyn(grp(torso, s * 0.3 * w, 0.55, 0)), el = dyn(grp(sh, 0, -0.3, 0)), hand = grp(el, 0, -0.29, 0);
    mk(sh, GEO.sph, sk, 0, 0, 0, 0.09 * w); mk(sh, GEO.cyl, sk, 0, -0.15, 0, 0.062 * w, 0.3, 0.062 * w); mk(el, GEO.cyl, sk, 0, -0.14, 0, 0.053 * w, 0.28, 0.053 * w);
    mk(hand, GEO.sph, sk, 0, -0.02, 0, 0.085 * w, 0.075, 0.085 * w); for (const cx of [-0.04, 0, 0.04]) spike(hand, tooth, cx, -0.06, 0.03, 0, -0.6, 1, 0.07, 0.014);
    P[s < 0 ? 'armL' : 'armR'] = { sh, el, hand };
  }
  const head = P.head = dyn(grp(torso, 0, 0.66, 0.03)), face = P.face = grp(head, 0, 0.2, 0.04);
  mk(face, GEO.sph, sk, 0, 0, 0, 0.26, 0.23, 0.24); mk(face, GEO.sph, sk, 0, -0.1, 0.09, 0.17 * (o.jaw || 1), 0.11, 0.15);
  for (const s of [-1, 1]) {
    const ex = s * 0.1 * (o.spread || 1), er = (s < 0 ? o.eyeL : o.eyeR) || 0.06;
    mk(face, GEO.sph, eyeW, ex, 0.05, 0.19, er); const pu = mk(face, GEO.sph, pup, ex - s * (o.cross || 0) * 0.025, 0.05, 0.19 + er * 0.82, er * 0.5); P[s < 0 ? 'pupL' : 'pupR'] = pu;
    glow(face, o.eye || 0xff3a18, 0.22, 0.55, ex, 0.05, 0.27); mk(face, GEO.box, sd, ex, 0.12 + (o.browY || 0), 0.205, 0.13 * (o.brow || 1), 0.035, 0.05, 0, 0, s * (o.angry == null ? 0.4 : o.angry));
    const a = o.earA == null ? 0.35 : o.earA, len = o.earLen || 0.42, dx = s * Math.cos(a), dy = Math.sin(a);
    mk(face, GEO.cone, sk, s * 0.22 + dx * len / 2, 0.06 + dy * len / 2, -0.02, 0.1, len, 0.025, 0, 0, -s * (PI / 2 - a)); mk(face, GEO.cone, sd, s * 0.22 + dx * len * 0.45, 0.06 + dy * len * 0.45, -0.005, 0.06, len * 0.75, 0.02, 0, 0, -s * (PI / 2 - a));
  }
  spike(face, sk, 0, 0.0, 0.225, 0, -0.35, 1, o.nose || 0.15, 0.05); mk(face, GEO.box, MM(0x2a0a0a), 0, -0.125, 0.2, 0.15, 0.03, 0.04);
  for (const s of [-1, 1]) spike(face, tooth, s * 0.06, -0.12, 0.215, s * 0.1, 1, 0.3, o.tusk || 0.07, 0.016);
  return P;
}
const cloth = (c, o = {}) => MM(c, { roughness: 0.95, side: THREE.DoubleSide, ...o });
const swayRot = (o, t, ax, f, ph = 0) => o.rotation[ax] = 0;
const E = MY.ENEMY = {};
E.regular = (parent, ctx) => {
  const P = gob(parent, { skin: 0x3a6a1e, skinD: 0x2a4a16, eye: 0xff3a18 }), { torso, head, armR, armL, body } = P;
  const lea = cloth(0x6b4a2a), dk = MM(0x2a1a10, { roughness: 1 });
  mk(torso, cg(0.28, 0.32, 18, true), lea, 0, 0.3, 0, 1, 0.42, 1).scale.z = 0.8; for (const [x, y, c] of [[0.1, 0.4, 0x8a2a2a], [-0.14, 0.24, 0x4a6a8a]]) mk(torso, GEO.box, cloth(c), x, y, 0.2, 0.11, 0.1, 0.012);
  mk(torso, GEO.tor, dk, 0, 0.12, 0, 0.3, 0.3, 0.5, PI / 2).scale.set(0.3, 0.26, 0.3); mk(torso, GEO.box, MM(0xb89a3a, { metalness: 0.8, roughness: 0.4 }), 0, 0.12, 0.25, 0.08, 0.07, 0.02); mk(torso, GEO.box, cloth(0x6a1a1a), 0, -0.04, 0.2, 0.2, 0.22, 0.02);
  for (let i = 0; i < 5; i++) mk(torso, GEO.box, dk, 0.04 * (i - 2), 0.3 + 0.03 * i, 0.255, 0.01, 0.03, 0.004);
  armR.sh.rotation.x = -0.55; armR.el.rotation.x = -1.0; armL.sh.rotation.x = -0.1; armL.el.rotation.x = -0.45;
  const cl = grp(armR.hand, 0.0, -0.02, 0); cl.rotation.x = -(armR.sh.rotation.x + armR.el.rotation.x) - 0.15;
  mk(cl, cg(0.025, 0.028), MM(0x3a2414), 0, 0.1, 0, 1, 0.26, 1); mk(cl, GEO.box, MM(0x8a5a3a, { metalness: 0.7, roughness: 0.65 }), 0.0, 0.42, 0, 0.1, 0.32, 0.022); mk(cl, GEO.box, MM(0x9a6a48, { metalness: 0.8, roughness: 0.5 }), 0.05, 0.42, 0, 0.012, 0.32, 0.026);
  for (const y of [0.3, 0.45, 0.55]) mk(cl, GEO.box, MM(0x1a1008), -0.05, y, 0, 0.03, 0.03, 0.03, 0, 0, 0.8); mk(cl, GEO.sph, MM(0x7a1a10, { roughness: 1 }), 0.02, 0.5, 0.013, 0.025, 0.04, 0.005);
  mk(P.face, GEO.box, MM(0x6a2018), -0.1, 0.07, 0.232, 0.018, 0.17, 0.01, 0, 0, 0.5); mk(P.face, GEO.box, MM(0xe0d8c0), -0.1, 0.07, 0.236, 0.006, 0.17, 0.004, 0, 0, 0.5);
  mk(P.face, GEO.sph, MM(0x2a1a10), -0.245, 0.25, -0.02, 0.05, 0.04, 0.02).visible = false;
  return { h: 1.6, anim: t => {
    body.scale.y = 1 + Math.sin(t * 1.9) * 0.012; torso.rotation.x = Math.sin(t * 1.9) * 0.025; head.rotation.y = Math.sin(t * 0.7) * 0.28; head.rotation.z = Math.sin(t * 1.3) * 0.06 + 0.04; head.rotation.x = Math.sin(t * 0.9) * 0.04;
    armR.sh.rotation.x = -0.55 + Math.sin(t * 1.4) * 0.07; armL.sh.rotation.x = -0.1 + Math.sin(t * 1.9 + 1) * 0.04; body.rotation.z = Math.sin(t * 0.6) * 0.02;
  } };
};
E.dumb = (parent, ctx) => {
  const P = gob(parent, { skin: 0x74903a, skinD: 0x506a24, eye: 0xffa030, w: 1.05, belly: 1.35, cross: 1.2, eyeL: 0.085, eyeR: 0.05, angry: -0.25, nose: 0.2, jaw: 1.1, earA: 0.1, spread: 1.15 });
  const { torso, head, armR, armL, body, face } = P;
  torso.rotation.x = 0.22; head.rotation.x = 0.18;
  mk(torso, cg(0.28, 0.3, 18, true), cloth(0x7a6a8a), 0, 0.28, 0, 1, 0.34, 1).scale.z = 0.8; mk(torso, GEO.box, cloth(0x6a3a2a), 0, 0.1, 0.23, 0.26, 0.16, 0.02); mk(torso, GEO.sph, cloth(0x4a3a6a), 0, 0.35, 0.22, 0.05, 0.05, 0.015);
  mk(face, GEO.sph, MM(0x2a0a0a), 0, -0.13, 0.2, 0.085, 0.07, 0.03); const tongue = mk(face, GEO.sph, MM(0xe0707a, { roughness: 0.5 }), 0.02, -0.19, 0.205, 0.04, 0.085, 0.02); dyn(tongue);
  for (const s of [-1, 1]) spike(face, MM(0xf0e8c8), s * 0.025, -0.095, 0.215, 0, -1, 0.1, 0.065, 0.02);
  const drool = dyn(mk(face, GEO.cyl, MM(0xbfe6ff, { transparent: true, opacity: 0.65, roughness: 0.1 }), -0.04, -0.24, 0.21, 0.007, 0.12, 0.007));
  const pot = dyn(grp(face, 0.02, 0.27, 0.0, 0.0, 0, 0.18)); const potM = MM(0x7d8288, { metalness: 0.8, roughness: 0.45 });
  mk(pot, cg(0.27, 0.23, 20), potM, 0, 0, 0, 1, 0.27, 1); mk(pot, GEO.tor, potM, 0, 0.135, 0, 0.27, 0.27, 0.8, PI / 2); mk(pot, GEO.tor, MM(0x5a3a22), 0, -0.13, 0, 0.23, 0.23, 0.6, PI / 2); mk(pot, GEO.arc, MM(0x3a3d44, { metalness: 0.9 }), 0, 0.14, 0, 0.27, 0.27, 0.27, 0, 0, 0).rotation.y = PI / 2;
  mk(pot, GEO.sph, MM(0x5a5e64), 0.15, 0.04, 0.18, 0.06, 0.05, 0.02); mk(pot, GEO.sph, MM(0x5a5e64), -0.12, -0.04, 0.2, 0.04, 0.04, 0.02);
  armR.sh.rotation.x = -0.9; armR.el.rotation.x = -0.9; armL.sh.rotation.set(0.1, 0, -0.12); armL.el.rotation.x = -0.2;
  const sp = grp(armR.hand, 0, 0, 0); sp.rotation.x = -(armR.sh.rotation.x + armR.el.rotation.x) - 0.2; mk(sp, cg(0.02, 0.02), MM(0x8a6238), 0, 0.28, 0, 1, 0.7, 1); mk(sp, GEO.sph, MM(0x9a7240), 0, 0.68, 0, 0.07, 0.1, 0.025);
  return { h: 1.55, anim: t => {
    head.rotation.z = Math.sin(t * 1.7) * 0.22; head.rotation.y = Math.sin(t * 1.1 + 1) * 0.3; head.rotation.x = 0.18 + Math.sin(t * 2.3) * 0.09; pot.rotation.z = 0.18 + Math.sin(t * 2.9) * 0.06; pot.rotation.x = Math.sin(t * 2.1) * 0.05;
    body.rotation.z = Math.sin(t * 0.9) * 0.045; body.scale.y = 1 + Math.sin(t * 1.6) * 0.012; armL.sh.rotation.x = 0.1 + Math.sin(t * 1.2) * 0.12; armR.sh.rotation.x = -0.9 + Math.sin(t * 3.0) * 0.12;
    drool.scale.y = 0.1 + (0.5 + 0.5 * Math.sin(t * 1.3)) * 0.12; tongue.scale.y = 0.085 + Math.sin(t * 2.4) * 0.012;
  } };
};
E.speedy = (parent, ctx) => {
  const P = gob(parent, { skin: 0x2e9058, skinD: 0x1e6a3a, eye: 0xffb020, w: 0.8, belly: 0.55, earA: 0.65, earLen: 0.5, nose: 0.17 });
  const { torso, head, armR, armL, body, face } = P, red = MM(0xff5a1a, { roughness: 0.8, emissive: 0x802000, emissiveIntensity: 0.5 });
  body.rotation.x = 0.42; P.hipL.rotation.x = -0.6; P.kneeL.rotation.x = 0.6; P.hipR.rotation.x = 0.5; P.kneeR.rotation.x = 0.9; body.position.set(0, 0.0, 0.05);
  head.rotation.x = -0.3;
  mk(torso, cg(0.22, 0.2, 16, true), cloth(0x22262e), 0, 0.3, 0, 1, 0.4, 1).scale.z = 0.8; mk(torso, GEO.tor, red, 0, 0.5, 0.0, 0.21, 0.21, 0.6, PI / 2); mk(torso, GEO.box, red, 0, 0.14, 0.18, 0.08, 0.08, 0.02, 0, 0, 0.8);
  const mow = [];
  for (let i = 0; i < 8; i++) { const ph = 0.9 - i * 0.28, c = spike(face, red, 0, 0.23 * Math.cos(ph) * 0.95, 0.24 * Math.sin(ph) * 0.95, 0, Math.cos(ph), Math.sin(ph) - 0.7, 0.2 - Math.abs(i - 3) * 0.015, 0.045); c.scale.z = 0.5; mow.push(c); dyn(c); }
  mk(face, GEO.tor, MM(0xd02020), 0, 0.1, 0, 0.245, 0.245, 0.6, PI / 2); const tails = []; for (const s of [-1, 1]) { const tl = dyn(grp(face, s * 0.03, 0.1, -0.24)); mk(tl, GEO.box, MM(0xd02020), 0, 0, -0.1, 0.05, 0.025, 0.22); tails.push(tl); tl.userData.s = s; }
  armR.sh.rotation.x = 0.9; armR.el.rotation.x = 0.3; armL.sh.rotation.x = -0.75; armL.el.rotation.x = -0.9;
  const dagger = h => { const d = grp(h, 0, -0.02, 0); mk(d, cg(0.022, 0.022), MM(0x2a1a10), 0, -0.03, 0, 1, 0.12, 1); mk(d, GEO.box, MM(0xb0b8c0, { metalness: 0.9, roughness: 0.3 }), 0, -0.1, 0, 0.1, 0.02, 0.03); mk(d, GEO.cone4, MM(0xdfe6ee, { metalness: 1, roughness: 0.2, envMapIntensity: 1.5 }), 0, -0.3, 0, 0.035, 0.32, 0.01, PI, 0, 0); return d; };
  dagger(armR.hand); dagger(armL.hand);
  const sm = ctx.own(BM(0xbfe4ff, 0.5, true, MY.TEX.streak)), streaks = [];
  for (let i = 0; i < 6; i++) { const y = 0.35 + i * 0.22, x = (i % 3 - 1) * 0.35, L = 0.9 + (i % 3) * 0.4; for (const r of [0, PI / 2]) { const m = new THREE.Mesh(GEO.plane, sm); m.rotation.set(0, PI / 2, r); m.scale.set(L, 0.05, 1); m.position.set(x, y, -0.55 - L / 2); m.renderOrder = 4; parent.add(m); m.userData.dyn = true; streaks.push({ m, L, z0: -0.55, ph: i * 1.3 }); } }
  const puffs = []; for (let i = 0; i < 5; i++) { const mat = ctx.own(GS(0xd8cfae, 0.3)), s = new THREE.Sprite(mat); s.userData.dyn = true; parent.add(s); puffs.push({ s, mat, ph: i / 5, x: (i % 2 ? 0.2 : -0.18) }); }
  return { h: 1.4, anim: t => {
    body.position.y = Math.abs(Math.sin(t * 8)) * 0.018; const k = Math.pow(Math.max(0, Math.sin(t * 2.7)), 10), k2 = Math.pow(Math.max(0, Math.sin(t * 3.9 + 2)), 12);
    head.rotation.y = k * 0.7 - k2 * 0.6; head.rotation.x = -0.3 + k2 * 0.15; armR.sh.rotation.x = 0.9 + Math.sin(t * 7) * 0.08 + k * 0.3; armL.sh.rotation.x = -0.75 + Math.sin(t * 7.5 + 1) * 0.08;
    P.hipL.rotation.x = -0.6 + Math.sin(t * 8) * 0.06; P.hipR.rotation.x = 0.5 - Math.sin(t * 8) * 0.06;
    mow.forEach((c, i) => c.rotation.x = Math.sin(t * 6 + i * 0.5) * 0.08); tails.forEach(tl => { tl.rotation.x = 0.3 + Math.sin(t * 9 + tl.userData.s) * 0.35; tl.rotation.y = tl.userData.s * 0.2 * Math.sin(t * 7); });
    for (const q of streaks) { const f = ((t * 1.8 + q.ph) % 1); q.m.position.z = q.z0 - q.L / 2 - f * 0.5; q.m.scale.x = q.L * (0.5 + 0.5 * (1 - f)); }
    sm.opacity = 0.35 + 0.15 * Math.sin(t * 20);
    for (const q of puffs) { const f = (t * 0.9 + q.ph) % 1; q.s.position.set(q.x + Math.sin(q.ph * 9) * 0.1, 0.1 + f * 0.35, -0.35 - f * 0.7); q.s.scale.setScalar(0.25 + f * 0.7); q.mat.opacity = 0.32 * (1 - f); }
  } };
};
E.archer = (parent, ctx) => {
  const P = gob(parent, { skin: 0x3c5a2c, skinD: 0x2a4220, eye: 0xffc030, w: 0.9, belly: 0.7, earA: -0.2, earLen: 0.34, nose: 0.16 });
  const { torso, head, armR, armL, body, face } = P, hoodM = cloth(0x3b4a2a), red = cloth(0x8a2a2a), V = (x, y, z) => new THREE.Vector3(x, y, z);
  mk(face, hoodGeo, hoodM, 0, 0.03, -0.03, 0.31, 0.3, 0.31); spike(face, hoodM, 0, 0.2, -0.26, 0, -0.35, -1, 0.26, 0.1); spike(face, MM(0xd8d0b8), 0.13, 0.25, -0.12, 0.6, 1, -0.4, 0.34, 0.035).scale.z = 0.3; spike(face, MM(0xc02020), 0.16, 0.24, -0.1, 0.7, 1, -0.5, 0.26, 0.03).scale.z = 0.3;
  mk(face, GEO.sph, red, 0, -0.12, 0.09, 0.19, 0.1, 0.17); mk(face, GEO.tor, red, 0, -0.2, -0.01, 0.22, 0.22, 0.6, PI / 2); const tail = dyn(grp(face, 0.1, -0.2, -0.2)); mk(tail, GEO.box, red, 0, -0.17, -0.02, 0.09, 0.34, 0.02);
  mk(torso, cg(0.27, 0.3, 18, true), cloth(0x4a5a34), 0, 0.28, 0, 1, 0.42, 1).scale.z = 0.8; mk(torso, GEO.tor, MM(0x3a2414), 0, 0.12, 0, 0.29, 0.29, 0.5, PI / 2).scale.set(0.29, 0.25, 0.3); mk(torso, GEO.box, MM(0x3a2414), 0, 0.42, 0.04, 0.05, 0.75, 0.22, 0, 0, 0.55);
  const qv = grp(torso, 0.04, 0.4, -0.26, 0, 0, 0.3); mk(qv, cg(0.075, 0.055), MM(0x5a3a22, { roughness: 0.9 }), 0, 0, 0, 1, 0.5, 1); mk(qv, GEO.tor, MM(0x3a2414), 0, 0.2, 0, 0.075, 0.075, 0.4, PI / 2);
  for (let i = 0; i < 5; i++) { const ax = (i - 2) * 0.025; mk(qv, cg(0.007, 0.007, 6), MM(0x8a6238), ax, 0.38, i % 2 * 0.02, 1, 0.3, 1); mk(qv, GEO.cone, i % 2 ? red : MM(0xe8e0c8), ax, 0.5, i % 2 * 0.02, 0.018, 0.08, 0.004); }
  const tipsY = 0.75, G = V(-0.2, 0.62, 0.62), N = V(0.08, 0.76, 0.2);
  const bow = grp(torso, G.x, G.y, G.z), bg = new THREE.TorusGeometry(1, 0.03, 8, 20, 1.9);
  { const cur = new THREE.QuadraticBezierCurve3(V(0, -tipsY, 0), V(0, 0, 0.56), V(0, tipsY, 0)); mk(bow, new THREE.TubeGeometry(cur, 24, 0.024, 8), MM(0x6b4325, { roughness: 0.7 })); ctx.disp.push(bow.children[0].geometry); mk(bow, cg(0.04, 0.04), MM(0x3a2414), 0, 0, 0.28, 1, 0.26, 1); }
  const strM = MM(0xeee6cc, { roughness: 0.5 }); const tA = G.clone().add(V(0, tipsY, 0)), tB = G.clone().add(V(0, -tipsY, 0)); rod(torso, strM, tA, N, 0.005); rod(torso, strM, N, tB, 0.005);
  const aE = G.clone().add(V(0, 0.0, 0.62)); rod(torso, MM(0x8a6238), N, aE, 0.011); mk(torso, GEO.cone, MM(0xcfd6df, { metalness: 0.9, roughness: 0.3 }), aE.x, aE.y, aE.z + 0.05, 0.022, 0.1, 0.006, PI / 2, 0, 0); for (const k of [0, 1]) mk(torso, GEO.cone, k ? red : MM(0xe8e0c8), N.x, N.y + (k ? 0.012 : -0.012), N.z + 0.1, 0.014, 0.1, 0.004, -PI / 2, 0, 0);
  ik(armL, G.clone().add(V(0, 0, 0.0)), V(-1, -0.4, 0)); ik(armR, N.clone().add(V(0.03, -0.02, 0.0)), V(1, 0.3, -0.5));
  torso.rotation.y = -0.15; head.rotation.y = 0.15;
  return { h: 1.55, anim: t => {
    body.scale.y = 1 + Math.sin(t * 1.7) * 0.01; head.rotation.y = 0.15 + Math.sin(t * 0.6) * 0.3; head.rotation.x = Math.sin(t * 1.1) * 0.05; torso.rotation.z = Math.sin(t * 11) * 0.004 + Math.sin(t * 1.7) * 0.012;
    tail.rotation.x = 0.1 + Math.sin(t * 2.3) * 0.12; tail.rotation.z = Math.sin(t * 1.7) * 0.15;
  } };
};
E.troll = (parent, ctx) => {
  const P = gob(parent, { skin: 0x5a6a48, skinD: 0x3a4630, eye: 0xff6a18, w: 1.35, belly: 1.5, earA: 0.2, earLen: 0.3, nose: 0.22, brow: 1.8, angry: 0.55, jaw: 1.3, tusk: 0.17, browY: -0.01 });
  const { torso, head, armR, armL, body, face } = P, moss = MM(0x4a8a2a, { roughness: 1 }), stone = MM(0x80837c, { roughness: 0.9 }), bark = MM(0x5a3f28, { roughness: 1 }), iron = MM(0x3c4048, { metalness: 0.9, roughness: 0.45 });
  torso.rotation.x = 0.2; head.rotation.x = 0.1; mk(face, GEO.box, P.sd, 0, 0.11, 0.2, 0.32, 0.07, 0.08);
  for (const s of [-1, 1]) { spike(face, MM(0xe8dfc0, { roughness: 0.5 }), s * 0.12, -0.11, 0.2, s * 0.25, 1, 0.9, 0.13, 0.045); mk(torso, GEO.dodec, stone, s * 0.42, 0.82, 0, 0.12, 0.09, 0.12); mk(P.armL.sh === armL.sh ? torso : torso, GEO.dodec, stone, s * 0.18, 0.02, 0.14, 0.1, 0.07, 0.07); }
  const r = (() => { let q = 7; return () => (q = (q * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 14; i++) { const a = r() * PI * 2, y = 0.1 + r() * 0.6, rr = 0.9; const m = mk(torso, GEO.sph, moss, Math.sin(a) * 0.3 * 1.35 * rr, y, Math.cos(a) * 0.23 * rr - 0.02, 0.07 + r() * 0.06, 0.03, 0.07 + r() * 0.05); m.lookAt(m.position.x * 3, m.position.y, m.position.z * 3); }
  for (let i = 0; i < 6; i++) { const a = r() * 6; mk(face, GEO.sph, moss, Math.sin(a) * 0.15, 0.17, Math.cos(a) * 0.1 - 0.05, 0.07, 0.03, 0.07); }
  mk(torso, GEO.tor, iron, 0, 0.64, 0.02, 0.24, 0.24, 0.9, PI / 2).scale.z = 0.5; for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; spike(torso, iron, Math.sin(a) * 0.25, 0.65, Math.cos(a) * 0.23, Math.sin(a), 0.5, Math.cos(a), 0.12, 0.03); }
  mk(torso, cg(0.3, 0.34, 14, true), cloth(0x6b5a3a), 0, 0.08, 0.02, 1.35, 0.2, 1).scale.z = 0.85; for (let i = 0; i < 9; i++) spike(torso, cloth(0x6b5a3a), (i - 4) * 0.075, 0.0, 0.26, 0, -1, 0.1, 0.12, 0.04);
  armR.sh.rotation.x = -0.5; armR.el.rotation.x = -1.1; armL.sh.rotation.set(0.05, 0, -0.18); armL.el.rotation.x = -0.35;
  const club = dyn(grp(armR.hand, 0, 0, 0)); club.rotation.x = -(armR.sh.rotation.x + armR.el.rotation.x) - 0.35; club.rotation.z = -0.15;
  mk(club, cg(0.22, 0.07), bark, 0, 0.55, 0, 1, 1.4, 1); mk(club, GEO.sph, bark, 0, 1.24, 0, 0.23, 0.12, 0.23); for (const [y, a] of [[0.9, 0.5], [1.1, 3.2], [0.7, 2.2]]) { mk(club, GEO.sph, bark, Math.sin(a) * 0.17, y, Math.cos(a) * 0.17, 0.07); spike(club, bark, Math.sin(a) * 0.19, y + 0.02, Math.cos(a) * 0.19, Math.sin(a), 0.4, Math.cos(a), 0.15, 0.035); }
  for (let i = 0; i < 5; i++) { const a = i * 1.26; spike(club, iron, Math.sin(a) * 0.2, 1.1 + (i % 2) * 0.12, Math.cos(a) * 0.2, Math.sin(a), 0.2, Math.cos(a), 0.1, 0.025); } mk(club, GEO.sph, moss, 0.15, 1.28, 0.05, 0.08, 0.03, 0.08);
  return { h: 1.7, gold: true, anim: t => {
    const b = Math.sin(t * 1.2); body.scale.set(1 + b * 0.008, 1 + b * 0.014, 1 + b * 0.008); torso.rotation.x = 0.2 + b * 0.03; head.rotation.y = Math.sin(t * 0.4) * 0.3; head.rotation.x = 0.1 + Math.sin(t * 0.8) * 0.04;
    armR.sh.rotation.x = -0.5 + Math.sin(t * 0.9) * 0.06; armL.sh.rotation.x = 0.05 + Math.sin(t * 1.2 + 1) * 0.05; club.rotation.z = -0.15 + Math.sin(t * 0.9) * 0.04;
  } };
};
} // ---- end part 3
{ // ---- part 4: room displays (weapon, armour, enemy, stations, gold, plushie) and the public entry points
const MY = GK.mys, { GEO, cg, mk, grp, dyn, MM, BM, GS, glow, spike, fib, TEX, TIERS, tierMats, pool, ring, spot, lbl, rod, AB, mannequin, E } = Object.assign({}, MY, { E: MY.ENEMY }), PI = Math.PI;
const NAMES = { regular: 'Regular Goblin', dumb: 'Dumb Goblin', speedy: 'Speedy Goblin', archer: 'Archer Goblin', troll: 'Troll Goblin' };
const tierCss = t => { try { return TIER_COL[t] || TIERS[t].css; } catch (e) { return (TIERS[t] || TIERS.common).css; } };
const live = new Set(), BUILD = {};
const mkCtx = root => { const c = { root, anim: [], disp: [] }; c.own = m => { const k = m.clone(); c.disp.push(k); return k; }; return c; };
const mysTex = {};
const heartTex = () => mysTex.heart || (mysTex.heart = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#ff6a9a'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 6, 10, 24, 12); g.bezierCurveTo(30, 13, 32, 18, 32, 20); g.bezierCurveTo(32, 18, 34, 13, 40, 12); g.bezierCurveTo(58, 10, 60, 36, 32, 56); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(20, 22, 6, 4, -0.6, 0, 7); g.fill(); }));
const letterTex = ch => mysTex['L' + ch] || (mysTex['L' + ch] = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#f4e6c0'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 8; g.strokeRect(0, 0, w, h); g.fillStyle = ['#d83a3a', '#2f78d8', '#3aa84a', '#e0a020'][ch.charCodeAt(0) % 4]; g.font = 'bold 92px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70); }));
const rugTex = () => mysTex.rug || (mysTex.rug = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#7a3a6a'; g.fillRect(0, 0, w, h); const cols = ['#e8c06a', '#4a7aa8', '#d8607a', '#f4e6c0', '#5a9a6a']; for (let i = 0; i < 6; i++) { g.strokeStyle = cols[i % 5]; g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 236 - i * 36, 0, 7); g.stroke(); } for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; g.fillStyle = cols[i % 5]; g.save(); g.translate(256 + Math.cos(a) * 128, 256 + Math.sin(a) * 128); g.rotate(a); g.fillRect(-9, -9, 18, 18); g.restore(); } speckle(g, w, h, 3000, 4, 0.08); }));
// ----- common pieces
function dais(ctx, z, tier, r = 1.05) {
  const p = grp(ctx.root, 0, 0, z), T = TIERS[tier] || TIERS.common, stone = MM(0x8a8680, { roughness: 0.9 }), gold = MM(0xf4c24d, { metalness: 1, roughness: 0.26, emissive: 0x6a3d00, emissiveIntensity: 0.5 });
  mk(p, cg(r + 0.3, r + 0.35), stone, 0, 0.06, 0, 1, 0.12, 1); mk(p, cg(r, r + 0.1), stone, 0, 0.2, 0, 1, 0.16, 1); mk(p, GEO.tor, gold, 0, 0.285, 0, r, r, r * 0.5, PI / 2).scale.z = 0.4;
  const rn = mk(p, GEO.plane, BM(T.c, 0.7, true, TEX.ring), 0, 0.292, 0, r * 1.7, r * 1.7, 1, -PI / 2, 0, 0); rn.material = ctx.own(rn.material); rn.userData.dyn = true; ctx.anim.push(t => { rn.material.opacity = 0.55 + 0.25 * Math.sin(t * 2); rn.rotation.z = t * 0.3; });
  return p;
}
function aura(ctx, tier, x, y, z, R = 1.0) {
  const T = TIERS[tier] || TIERS.common, n = T.n, sz = [0, 2.4, 3.0, 3.4, 3.8, 4.2][n];
  if (n > 0) { const s = glow(ctx.root, T.c, sz, [0, 0.22, 0.34, 0.45, 0.55, 0.65][n], x, y, z); const gm = ctx.own(s.material); s.material = gm; s.userData.dyn = true; ctx.anim.push(t => { gm.opacity = ([0, 0.22, 0.34, 0.45, 0.55, 0.65][n]) * (0.85 + 0.15 * Math.sin(t * 2.3)); }); }
  const N = [0, 0, 0, 8, 14, 20][n], sp = [];
  for (let i = 0; i < N; i++) { const mat = new THREE.SpriteMaterial({ map: TEX.star, color: n === 4 ? 0xffe27a : T.c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); ctx.disp.push(mat); const s = new THREE.Sprite(mat); s.userData.dyn = true; ctx.root.add(s); sp.push({ s, mat, ph: i / N, a: i * 2.4, r: (0.5 + (i * 0.37 % 1)) * R, v: 0.1 + (i * 0.13 % 1) * 0.15 }); }
  if (N) ctx.anim.push(t => { for (const q of sp) { const f = (t * q.v + q.ph) % 1; q.s.position.set(x + Math.cos(q.a + t * 0.5) * q.r, y - 1.0 + f * 2.4, z + Math.sin(q.a + t * 0.5) * q.r); q.s.scale.setScalar(0.12 + 0.18 * Math.sin(f * PI) + 0.04 * Math.sin(t * 9 + q.a)); q.mat.opacity = Math.sin(f * PI) * 0.9; } });
}
const rarityLabel = (ctx, it, y, stat) => lbl(ctx.root, it.name, tierCss(it.tier), y, 0.5, `Tier ${it.tierN != null ? it.tierN : (TIERS[it.tier] || TIERS.common).n} · ${stat}`, tierCss(it.tier));
BUILD.weapon = (ctx, v) => {
  const it = GKITEMS.ITEMS[v.key] || GKITEMS.ITEMS['w:sword'], T = TIERS[it.tier] || TIERS.common, z = -1.0;
  dais(ctx, z, it.tier); spot(ctx.root, T.c, 0, z, 5.8, 0.3, 1.3, 0.2); pool(ctx.root, T.c, 2.6, 0.2, 0, z);
  const holder = dyn(grp(ctx.root, 0, 2.0, z)), tilt = grp(holder, 0, 0, 0, 0, 0, 0.35); tilt.add(MY.weaponProto(v.key).clone(true));
  aura(ctx, it.tier, 0, 2.0, z, 0.9); glow(ctx.root, T.c, 2.2, 0.28, 0, 2.0, z);
  ctx.anim.push(t => { holder.position.y = 2.0 + Math.sin(t * 1.5) * 0.08; holder.rotation.y = t * 0.7; });
  rarityLabel(ctx, it, 3.5, `${it.attack} dmg`);
};
BUILD.armor = (ctx, v) => {
  const it = GKITEMS.ITEMS[v.key] || GKITEMS.ITEMS['a:rags'], T = TIERS[it.tier] || TIERS.common, z = -1.0, k = v.key.slice(2), m = tierMats(it.tier);
  dais(ctx, z, it.tier); spot(ctx.root, T.c, 0, z, 5.8, 0.35, 1.4, 0.18); pool(ctx.root, T.c, 2.6, 0.2, 0, z);
  const a = dyn(grp(ctx.root, 0, 0.29, z)); a.scale.setScalar(1.25); mannequin(a); try { (AB[it.family] || AB.cloth)(a, m, it, k); } catch (e) { console.error(e); }
  if (T.n >= 2) { const rg = ring(ctx.root, T.c, 1.15, 0.6, 0, z); rg.position.y = 0.4; rg.material = ctx.own(rg.material); ctx.anim.push(t => rg.material.opacity = 0.4 + 0.3 * Math.sin(t * 2.4)); }
  aura(ctx, it.tier, 0, 1.4, z, 1.1); a.userData.s = 0; ctx.anim.push(t => { a.rotation.y = t * 0.5; });
  rarityLabel(ctx, it, 3.6, `${it.health} HP`);
};
BUILD.enemy = (ctx, v) => {
  const key = E[v.enemy] ? v.enemy : 'regular', troll = key === 'troll', sc = troll ? 1.9 : 1.2, z = troll ? -1.0 : -0.8;
  const g = grp(ctx.root, 0, 0, z); g.scale.setScalar(sc); const r = E[key](g, ctx); ctx.anim.push(r.anim);
  const rm = ring(ctx.root, 0xff2a1a, 1.5 * sc, 0.8, 0, z), pm = pool(ctx.root, 0xff2a1a, 2.2 * sc, 0.28, 0, z); rm.material = ctx.own(rm.material); pm.material = ctx.own(pm.material);
  ctx.anim.push(t => { rm.material.opacity = 0.55 + 0.3 * Math.sin(t * 3); pm.material.opacity = 0.2 + 0.1 * Math.sin(t * 3 + 1); rm.rotation.z = t * 0.4; });
  if (troll) { glow(ctx.root, 0xffc83a, 4.5, 0.18, 0, 1.6 * sc, z - 1.8); }
  lbl(ctx.root, 'ENEMY: ' + NAMES[key], '#ff5a4a', r.h * sc + 0.55 + (troll ? 0.3 : 0), 0.5, troll ? '★ RARE ★' : null, '#ffd24a', 0, z);
};
// ----- stations
const stationFallback = {
  recycler(p) {
    const st = MM(0x4a4f58, { metalness: 0.85, roughness: 0.4 }), gr = BM(0x5aff8a); mk(p, cg(0.7, 0.8), st, 0, 0.5, 0, 1, 1.0, 1); mk(p, cg(0.95, 0.5, 20, true), MM(0x5a606a, { metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }), 0, 1.3, 0, 1, 0.5, 1);
    mk(p, GEO.tor, gr, 0, 1.02, 0, 0.78, 0.78, 0.6, PI / 2); const arrows = dyn(grp(p, 0, 1.1, 0)); for (let i = 0; i < 3; i++) { const a = i * 2.094; spike(arrows, gr, Math.sin(a) * 0.55, 0, Math.cos(a) * 0.55, Math.cos(a), 0, -Math.sin(a), 0.22, 0.07); }
    glow(p, 0x5aff8a, 2.4, 0.4, 0, 1.3, 0); return t => { arrows.rotation.y = t * 1.2; };
  },
  knowledge(p) {
    const wd = MM(0x5a3a22, { roughness: 0.9 }), lf = MM(0x3ad0b0, { emissive: 0x1a9a80, emissiveIntensity: 0.9, roughness: 0.4 }); mk(p, cg(0.12, 0.26), wd, 0, 0.8, 0, 1, 1.6, 1);
    for (let i = 0; i < 5; i++) { const a = i * 1.26; spike(p, wd, 0, 1.3, 0, Math.sin(a), 0.9, Math.cos(a), 0.7, 0.05); mk(p, GEO.sph, lf, Math.sin(a) * 0.55, 2.0 + (i % 2) * 0.2, Math.cos(a) * 0.55, 0.32); } mk(p, GEO.sph, lf, 0, 2.5, 0, 0.4);
    const orb = dyn(grp(p, 0, 1.6, 0)); for (let i = 0; i < 4; i++) { const a = i * 1.57; mk(orb, GEO.box, MM(0xf4e6c0), Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0, 0.18, 0.04, 0.24); } glow(p, 0x6affd8, 3.2, 0.3, 0, 2.2, 0); return t => { orb.rotation.y = t * 0.6; orb.position.y = 1.6 + Math.sin(t * 1.4) * 0.1; };
  },
  workbench(p) {
    const wd = MM(0x6b4325, { roughness: 0.8 }), fe = MM(0x3c4048, { metalness: 0.9, roughness: 0.45 }); mk(p, GEO.box, wd, 0, 0.95, 0, 1.9, 0.14, 0.95);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(p, GEO.box, wd, sx * 0.8, 0.45, sz * 0.38, 0.14, 0.9, 0.14);
    mk(p, GEO.box, fe, 0.6, 1.1, 0.1, 0.32, 0.18, 0.2); mk(p, GEO.box, fe, 0.6, 1.0, 0.1, 0.15, 0.1, 0.12); mk(p, GEO.box, fe, -0.7, 1.08, 0.1, 0.2, 0.12, 0.3); mk(p, cg(0.03, 0.03), wd, -0.2, 1.05, 0.15, 1, 0.5, 1, 0, 0, PI / 2); mk(p, GEO.box, fe, -0.45, 1.05, 0.15, 0.2, 0.1, 0.1);
    mk(p, GEO.plane, BM(0x4aa8ff, 0.6, true), 0, 1.8, -0.4, 1.4, 0.9, 1); mk(p, GEO.box, wd, 0, 1.4, -0.45, 1.8, 0.06, 0.12); glow(p, 0x4aa8ff, 2.4, 0.3, 0, 1.7, -0.3); return null;
  },
};
const stationTitle = { recycler: 'Recycler', knowledge: 'Knowledge Tree', workbench: 'Crafting Bench' };
BUILD.stations = (ctx, v) => {
  const names = (v.stations || ['recycler', 'workbench']).slice(0, 2);
  names.forEach((nm, i) => {
    const x = (i ? 1 : -1) * 2.0, z = -1.6, h = grp(ctx.root, x, 0, z, 0, i ? -0.25 : 0.25, 0);
    const kit = GK.stations && (GK.stations[nm] || GK.stations[nm === 'workbench' ? 'bench' : nm]); let tick = null;
    if (kit) { try { kit(h, 0, 0, 0); } catch (e) { console.error(e); kit && (tick = stationFallback[nm](h)); } } else tick = stationFallback[nm] && stationFallback[nm](h);
    if (tick) ctx.anim.push(tick); pool(ctx.root, nm === 'recycler' ? 0x5aff8a : nm === 'knowledge' ? 0x6affd8 : 0x4aa8ff, 2.6, 0.25, x, z);
    if (!kit) lbl(ctx.root, stationTitle[nm] || nm, '#d8c8ff', 3.1, 0.42, null, null, x, z + 0.3);
  });
  if (!(GK.stations && GK.stations[names[0]])) lbl(ctx.root, 'Crafting stations', '#c9a7ff', 4.0, 0.3);
};
// ----- gold chest
BUILD.gold = (ctx, v) => {
  const amt = Math.max(50, Math.min(500, v.amount | 0 || 100)), k = 0.8 + 0.4 * (amt - 50) / 450, z = -1.2, c = grp(ctx.root, 0, 0, z);
  const wood = MM(0x6b4325, { roughness: 0.8 }), iron = MM(0x3c4048, { metalness: 0.9, roughness: 0.4 }), gold = MM(0xf4c24d, { metalness: 1, roughness: 0.24, emissive: 0x6a3d00, emissiveIntensity: 0.5, envMapIntensity: 1.6 }), coin = MM(0xffd35a, { metalness: 1, roughness: 0.22, emissive: 0x8a5200, emissiveIntensity: 0.8, envMapIntensity: 1.8 });
  mk(c, GEO.box, MM(0x8a8680, { roughness: 0.9 }), 0, 0.06, 0, 2.3, 0.12, 1.6);
  mk(c, GEO.box, wood, 0, 0.45, 0, 1.8, 0.66, 1.0); for (const s of [-1, 1]) mk(c, GEO.box, iron, s * 0.62, 0.45, 0, 0.12, 0.7, 1.04); mk(c, GEO.box, iron, 0, 0.2, 0, 1.84, 0.1, 1.04);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mk(c, GEO.box, gold, sx * 0.88, 0.45, sz * 0.48, 0.1, 0.72, 0.1);
  mk(c, GEO.box, MM(0x7a1018, { roughness: 0.9 }), 0, 0.77, 0, 1.6, 0.04, 0.84);
  const lid = grp(c, 0, 0.78, -0.5, -1.75); mk(lid, GEO.box, wood, 0, 0.06, 0.5, 1.8, 0.12, 1.04); for (const s of [-1, 1]) mk(lid, GEO.box, iron, s * 0.62, 0.1, 0.5, 0.12, 0.14, 1.06); mk(lid, GEO.box, MM(0x7a1018), 0, -0.01, 0.5, 1.6, 0.03, 0.84); mk(lid, GEO.box, gold, 0, 0.1, 1.0, 0.3, 0.2, 0.05);
  mk(c, GEO.hemi, coin, 0, 0.78, 0.0, 0.85 * k, 0.5 * k, 0.45 * k);
  const N = 120 + Math.round(amt * 0.45), cgeo = new THREE.CylinderGeometry(0.085, 0.085, 0.018, 14), im = new THREE.InstancedMesh(cgeo, coin, N + 40), d = new THREE.Object3D(); ctx.disp.push(cgeo, im);
  let rs = amt * 7 + 3; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()), x = Math.cos(a) * rr * 0.8 * k, zz = Math.sin(a) * rr * 0.42 * k, hh = Math.sqrt(Math.max(0, 1 - rr * rr)) * 0.48 * k; d.position.set(x, 0.78 + hh + 0.02, zz); d.rotation.set(rnd() * 1.4 - 0.7, rnd() * 6, rnd() * 1.4 - 0.7); d.scale.setScalar(1); d.updateMatrix(); im.setMatrixAt(i, d.matrix); }
  for (let i = 0; i < 40; i++) { d.position.set((rnd() - 0.5) * 2.2, 0.15 + 0.015 * (i % 3), 0.6 + rnd() * 0.9); d.rotation.set(i % 3 ? PI / 2 + rnd() * 0.2 : rnd() * 0.3, rnd() * 6, 0); d.updateMatrix(); im.setMatrixAt(N + i, d.matrix); }
  c.add(im);
  for (let i = 0; i < 8; i++) { const lay = i < 4 ? 0 : i < 7 ? 1 : 2; mk(c, GEO.box, gold, -1.35 + (i < 4 ? i * 0.3 : i < 7 ? (i - 4) * 0.3 + 0.15 : 0.3), 0.08 + 0.1 * lay + 0.05, 0.8 + 0.0, 0.28, 0.1, 0.14, 0, (i % 3 - 1) * 0.1, 0); }
  for (let i = 0; i < 4; i++) mk(c, GEO.box, gold, 0.9 + (i % 2) * 0.28, 0.12 + (i >> 1) * 0.1, 0.8, 0.26, 0.1, 0.13, 0, 0.3 + i * 0.2, 0);
  const gc = [0xe0203a, 0x20c860, 0x3a7bff, 0xb04cff, 0x30e0e0];
  for (let i = 0; i < 11; i++) { const a = i * 2.4, rr = 0.25 + (i % 4) * 0.15, m = new THREE.MeshStandardMaterial({ color: gc[i % 5], emissive: gc[i % 5], emissiveIntensity: 0.9, metalness: 0.2, roughness: 0.15, flatShading: true }); ctx.disp.push(m); mk(c, GEO.oct, m, Math.cos(a) * rr * 1.3, 0.78 + Math.sqrt(Math.max(0, 1 - (rr / 0.9) ** 2)) * 0.45 * k + 0.05, Math.sin(a) * rr * 0.6 + 0.04, 0.07, 0.1, 0.07, rnd(), rnd() * 6, rnd()); }
  const gl = glow(ctx.root, 0xffd060, 4.2, 0.55, 0, 1.4, z), gm = ctx.own(gl.material); gl.material = gm; gl.userData.dyn = true; pool(ctx.root, 0xffb040, 4.2, 0.4, 0, z + 0.3);
  const shaft = []; for (let q = 0; q < 2; q++) { const m = mk(ctx.root, GEO.plane, BM(0xffd060, 0.3, true, TEX.shaft), 0, 2.4, z, 1.5, 3.6, 1, 0, q * PI / 2, 0); m.renderOrder = 3; }
  const sp = []; for (let i = 0; i < 12; i++) { const mat = new THREE.SpriteMaterial({ map: TEX.star, color: 0xffe27a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }); ctx.disp.push(mat); const s = new THREE.Sprite(mat); s.userData.dyn = true; ctx.root.add(s); sp.push({ s, mat, ph: i / 12, x: (rnd() - 0.5) * 1.6, zz: z + (rnd() - 0.5) * 0.8 }); }
  ctx.anim.push(t => { gm.opacity = 0.5 + 0.1 * Math.sin(t * 2.2); for (const q of sp) { const f = (t * 0.35 + q.ph) % 1; q.s.position.set(q.x, 0.9 + f * 1.5, q.zz); q.s.scale.setScalar(0.1 + 0.22 * Math.sin(f * PI)); q.mat.opacity = Math.sin(f * PI) * 0.95; } });
  lbl(ctx.root, `${amt} gold`, '#ffd24a', 3.2, 0.6);
};
// ----- goblin plushie
BUILD.plushie = (ctx, v) => {
  const root = ctx.root, z = -1.0, felt = MM(0x8fc46a, { roughness: 1, emissive: 0x2a4a18, emissiveIntensity: 0.25 }), feltD = MM(0x78ae56, { roughness: 1, emissive: 0x2a4a18, emissiveIntensity: 0.2 }), pink = MM(0xf4a0b8, { roughness: 1, emissive: 0x6a2a3a, emissiveIntensity: 0.25 }), thread = MM(0x3a2010, { roughness: 1 });
  const rug = mk(root, cg(2.1, 2.1, 40), MM(0xffffff, { map: rugTex(), roughness: 1 }), 0, 0.016, z + 0.1, 1, 0.03, 1);
  const cush = mk(root, GEO.sph, MM(0xd86a9a, { roughness: 1, emissive: 0x4a1028, emissiveIntensity: 0.3 }), 0, 0.2, z, 0.95, 0.2, 0.95); mk(root, GEO.sph, MM(0xf4d078), 0, 0.4, z, 0.07, 0.05, 0.07);
  for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; mk(root, GEO.sph, MM(0xf4d078, { roughness: 1 }), Math.sin(a) * 0.9, 0.2, z + Math.cos(a) * 0.9, 0.07, 0.07, 0.07); mk(root, cg(0.025, 0.04), MM(0xf4d078), Math.sin(a) * 0.93, 0.1, z + Math.cos(a) * 0.93, 1, 0.16, 1); }
  const P = dyn(grp(root, 0, 0.36, z, 0, 0.12, 0.03)), body = dyn(grp(P, 0, 0, 0));
  const surf = (a, b, c, x, y, off = 1.0) => { const zz = c * Math.sqrt(Math.max(0.0001, 1 - (x / a) ** 2 - (y / b) ** 2)); const n = new THREE.Vector3(x / (a * a), y / (b * b), zz / (c * c)).normalize(); return { p: new THREE.Vector3(x, y, zz * off), n }; };
  const place = (par, geo, mat, ell, cx, cy, cz, x, y, off, sx, sy, sz, roll = 0) => { const s = surf(ell[0], ell[1], ell[2], x, y), m = new THREE.Mesh(geo, mat); m.position.set(cx + s.p.x * off, cy + s.p.y * off, cz + s.p.z * off); m.quaternion.setFromUnitVectors(UPV, s.n); if (roll) m.rotateY(roll); m.scale.set(sx, sy, sz); par.add(m); return m; };
  const UPV = new THREE.Vector3(0, 1, 0);
  const BE = [0.5, 0.52, 0.45], bc = [0, 0.55, 0]; mk(body, GEO.sph, felt, bc[0], bc[1], bc[2], BE[0], BE[1], BE[2]);
  mk(body, GEO.sph, feltD, 0, 0.5, 0.0, 0.0001); // placeholder keeps indices stable
  // belly patch + stitched frame
  const patch = place(body, GEO.box, MM(0xd9a05a, { roughness: 1 }), BE, bc[0], bc[1], bc[2], 0.17, -0.02, 1.0, 0.04, 0.035, 0.012);
  patch.scale.set(0.2, 0.012, 0.2); for (const [px, pz, sx, sz] of [[0, 0.42, 0.88, 0.05], [0, -0.42, 0.88, 0.05], [0.42, 0, 0.05, 0.88], [-0.42, 0, 0.05, 0.88]]) { const f = new THREE.Mesh(GEO.box, thread); f.position.set(px, 0.6, pz); f.scale.set(sx, 0.7, sz); patch.add(f); }
  // belly seam
  { const pts = []; for (let i = 0; i <= 14; i++) { const th = -0.5 + (i / 14) * 1.5; pts.push(new THREE.Vector3(0, bc[1] + BE[1] * Math.sin(th) * 1.004, BE[2] * Math.cos(th) * 1.004)); } const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 6); ctx.disp.push(g); mk(body, g, thread); for (let i = 1; i < 14; i++) { const q = pts[i]; mk(body, GEO.box, thread, q.x, q.y, q.z, 0.09, 0.012, 0.012, Math.atan2(q.y - bc[1], q.z) * -0.0, 0, 0); } }
  // legs, arms
  for (const s of [-1, 1]) {
    mk(body, GEO.sph, felt, s * 0.27, 0.17, 0.42, 0.2, 0.18, 0.34, -0.1, s * 0.2, 0); mk(body, GEO.sph, pink, s * 0.28, 0.17, 0.72, 0.13, 0.015, 0.1).position.y = 0.15; place(body, GEO.cyl, pink, [0.2, 0.18, 0.34], s * 0.27, 0.17, 0.42, 0, 0.02, 1.0, 0.11, 0.01, 0.11).visible = false;
    const arm = dyn(grp(body, s * 0.5, 0.8, 0.05, 0, 0, -s * (s < 0 ? 1.15 : 0.7))); mk(arm, GEO.sph, felt, s * 0.0, 0.0, 0, 0.17, 0.32, 0.17).position.set(s * 0.12, 0.16, 0); arm.userData.s = s; ctx.anim.push(t => { arm.rotation.z = -s * (s < 0 ? 1.15 : 0.7) + Math.sin(t * 1.6 + s) * 0.06 * s; });
  }
  // head
  const head = dyn(grp(P, 0, 1.38, 0.06, 0, 0, 0.1)), HE = [0.64, 0.56, 0.54]; mk(head, GEO.sph, felt, 0, 0, 0, HE[0], HE[1], HE[2]);
  const eyeBlack = MM(0x0a0a0c, { roughness: 0.2, metalness: 0.2 }), eyeCream = MM(0xeadfc0, { roughness: 0.5 });
  const b1 = place(head, GEO.cyl, eyeBlack, HE, 0, 0, 0, -0.24, 0.1, 1.0, 0.115, 0.05, 0.115); const b2 = place(head, GEO.cyl, eyeCream, HE, 0, 0, 0, 0.25, 0.12, 1.0, 0.14, 0.05, 0.14);
  for (const [bb, rad, hole] of [[b1, 0.115, 0x3a3a40], [b2, 0.14, 0x3a2a14]]) for (const [hx, hz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) { const hm = new THREE.Mesh(GEO.cyl, BM(hole)); hm.position.set(hx, 1.2, hz); hm.scale.set(0.12, 0.3, 0.12); bb.add(hm); }
  { const xs = place(head, GEO.box, thread, HE, 0, 0, 0, 0.25, 0.12, 1.0, 0.012, 0.012, 0.011); xs.scale.set(0.011, 0.011, 0.23); xs.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UPV, 0.785)); const xs2 = place(head, GEO.box, thread, HE, 0, 0, 0, 0.25, 0.12, 1.0, 0.011, 0.011, 0.23); xs2.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(UPV, -0.785)); xs.visible = xs2.visible = false;
    const ex = new THREE.Group(); const sp = surf(HE[0], HE[1], HE[2], 0.25, 0.12); ex.position.copy(sp.p).multiplyScalar(1.0).addScaledVector(sp.n, 0.052); ex.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), sp.n); head.add(ex); for (const r of [0.78, -0.78]) { const sb = new THREE.Mesh(GEO.box, thread); sb.scale.set(0.022, 0.2, 0.012); sb.rotation.z = r; ex.add(sb); } }
  place(head, GEO.sph, feltD, HE, 0, 0, 0, 0.0, -0.08, 1.02, 0.1, 0.075, 0.08);
  { const pts = []; for (let i = 0; i <= 12; i++) { const u = -0.28 + i * 0.0467, y = -0.2 - 0.0 + 1.1 * u * u - 0.04; const s = surf(HE[0], HE[1], HE[2], u, y); pts.push(s.p.clone().multiplyScalar(1.012).add(new THREE.Vector3(0, 0, 0))); }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.016, 6); ctx.disp.push(g); mk(head, g, thread); for (const i of [0, 12]) { const q = pts[i]; mk(head, GEO.box, thread, q.x, q.y + 0.03, q.z, 0.015, 0.07, 0.012, 0, 0, i ? -0.5 : 0.5); } for (const i of [3, 6, 9]) { const q = pts[i]; mk(head, GEO.box, thread, q.x, q.y, q.z, 0.012, 0.05, 0.012); } }
  { const pts = []; for (let i = 0; i <= 16; i++) { const th = 0.25 + (i / 16) * (PI - 0.5); pts.push(new THREE.Vector3(HE[0] * Math.cos(th) * 1.006, HE[1] * Math.sin(th) * 1.006, -0.02)); } const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.011, 6); ctx.disp.push(g); mk(head, g, thread); for (let i = 1; i < 16; i++) mk(head, GEO.box, thread, pts[i].x, pts[i].y, -0.02, 0.011, 0.011, 0.08); }
  const earPivots = [];
  for (const s of [-1, 1]) {
    const dr = s < 0 ? 0.95 : 0.4, ep = dyn(grp(head, s * 0.52, 0.1, -0.02, 0, 0, -s * dr)); earPivots.push([ep, s, dr]);
    mk(ep, GEO.sph, felt, s * 0.4, 0, 0, 0.52, 0.11, 0.3); mk(ep, GEO.sph, pink, s * 0.4, 0, 0.035, 0.4, 0.09, 0.2); mk(ep, GEO.sph, felt, s * 0.86, -0.02 - (s < 0 ? 0.08 : 0), 0, 0.18, 0.1, 0.24);
  }
  ctx.anim.push(t => { earPivots.forEach(([ep, s, dr]) => ep.rotation.z = -s * dr + Math.sin(t * 1.8 + s * 2) * 0.05 * s); head.rotation.z = 0.1 + Math.sin(t * 0.9) * 0.035; head.rotation.y = Math.sin(t * 0.6) * 0.08; const b = 1 + Math.sin(t * 1.6) * 0.012; body.scale.set(b, b, b); });
  // ribbon bow on one ear
  { const rb = MM(0xe83a7a, { roughness: 0.7, emissive: 0x60102a, emissiveIntensity: 0.4 }), bp = grp(head, 0.38, 0.5, 0.12, 0.3, 0, -0.35); for (const s of [-1, 1]) mk(bp, GEO.cone, rb, s * 0.14, 0, 0, 0.1, 0.24, 0.04, 0, 0, s * PI / 2 * -1 + 0); mk(bp, GEO.sph, rb, 0, 0, 0, 0.065, 0.06, 0.05); }
  // clothes patch on the head + blocks
  const blocks = [['G', -1.25, 0.2, 0.3], ['K', -0.95, 0.35, 0.55], ['B', -1.1, 0.2, -0.25]];
  blocks.forEach(([ch, x, , rz], i) => { const t = letterTex(ch), m = MM(0xffffff, { map: t, roughness: 0.6 }); const bk = mk(root, GEO.box, m, x, 0.18 + (i === 1 ? 0.32 : 0), z + 0.4 + (i === 2 ? -0.6 : 0) + (i === 1 ? 0.02 : 0), 0.34, 0.34, 0.34, 0, 0.3 + i * 0.7, 0); });
  mk(root, GEO.box, MM(0xe83a3a, { roughness: 0.6 }), 1.3, 0.17, z + 0.7, 0.3, 0.3, 0.3, 0, 0.5, 0); mk(root, GEO.sph, MM(0x3a78d8, { roughness: 0.6 }), 1.2, 0.17, z + 0.25, 0.17);
  // hearts / sparkles
  const fl = []; for (let i = 0; i < 9; i++) { const heart = i % 3 !== 2, mat = new THREE.SpriteMaterial({ map: heart ? heartTex() : TEX.star, color: heart ? 0xffffff : 0xfff0b0, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: heart ? THREE.NormalBlending : THREE.AdditiveBlending }); ctx.disp.push(mat); const s = new THREE.Sprite(mat); s.userData.dyn = true; root.add(s); fl.push({ s, mat, ph: i / 9, x: (i * 0.77 % 1 - 0.5) * 2.2, zz: z + (i * 0.53 % 1 - 0.5) * 1.4, sz: heart ? 0.3 : 0.25 }); }
  ctx.anim.push(t => { for (const q of fl) { const f = (t * 0.12 + q.ph) % 1; q.s.position.set(q.x + Math.sin(t * 1.2 + q.ph * 9) * 0.15, 1.6 + f * 1.9, q.zz); q.s.scale.setScalar(q.sz * (0.6 + 0.5 * Math.sin(f * PI))); q.mat.opacity = Math.sin(f * PI) * 0.95; q.mat.rotation = Math.sin(t + q.ph * 7) * 0.3; } });
  pool(root, 0xff9ac8, 4.4, 0.32, 0, z + 0.1); glow(root, 0xffd0e8, 3.4, 0.18, 0, 1.6, z);
  lbl(root, 'Goblin plushie', '#ffb0d0', 3.9, 0.55);
};
// ----- entry points
GK.disposeMysteryContents = group => {
  const c = group && group.userData.mystery; if (!c) return; live.delete(c); if (c.root.parent) c.root.parent.remove(c.root);
  for (const d of c.disp) { try { d.dispose && d.dispose(); } catch (e) {} } c.disp.length = 0; group.userData.mystery = null;
};
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
GK.buildMysteryContents = (room, group, variant) => {
  GK.disposeMysteryContents(group); variant = variant || room.mystery; if (!variant || !BUILD[variant.kind]) return;
  const root = new THREE.Group(); root.name = 'mystery-' + variant.kind; group.updateWorldMatrix(true, false);
  _m1.copy(group.matrixWorld).invert(); _m2.compose(new THREE.Vector3(room.cx, 0, room.cz), _qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-room.dx, -room.dz)), _one); _m1.multiply(_m2);
  _m1.decompose(root.position, root.quaternion, root.scale); group.add(root);
  const ctx = mkCtx(root); ctx.room = room;
  try { BUILD[variant.kind](ctx, variant); } catch (e) { console.error('mystery contents', variant.kind, e); }
  root.updateMatrixWorld(true);
  root.traverse(o => { if (o !== root && !o.userData.dyn) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
  group.userData.mystery = ctx; live.add(ctx);
};
let lastT = -1;
function animate() {
  const t = performance.now() / 1000; if (t === lastT || !live.size) return; lastT = t;
  for (const c of live) { if (!c.root.parent) continue; const dx = cam.position.x - c.room.cx, dz = cam.position.z - c.room.cz; if (dx * dx + dz * dz > 90 * 90) continue; for (const f of c.anim) f(t); }
}
if (GK.tickers) GK.tickers.push(animate);
const hook = new THREE.Mesh(new THREE.PlaneGeometry(0.01, 0.01), new THREE.MeshBasicMaterial({ color: 0x000000 })); hook.position.set(0, -50, 0); hook.frustumCulled = false; hook.onBeforeRender = animate; scene.add(hook); hook.matrixAutoUpdate = false; hook.updateMatrix();
if (GK.layout && GK.CHEST_ROOMS) { /* the rooms agent calls buildMysteryContents after its own build; nothing to do here */ }
} // ---- end part 4
// MYSTERY-END
// MAP-BEGIN (wall maps in the spawn rooms: owned by the map agent)
{
  const MW = 1024, MH = 740, MS = 11.6, MOX = 360, MOY = 372; // canvas size, px per metre (fits the grid plus the chest rooms, +-29 m), map origin (world 0,0)
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
  const mysteryIcon = (g, x, y, k) => { g.save(); g.translate(x, y); g.scale(k, k); g.shadowColor = '#b48cff'; g.shadowBlur = 10; g.fillStyle = '#c9a8ff'; g.font = 'bold 40px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, 3); g.shadowBlur = 0; g.restore(); };
  const merchantIcon = (g, x, y, k) => { const s = 34 * k; g.drawImage(merchantLogoC || (merchantLogoC = merchantLogo(96)), x - s / 2, y - s / 2, s, s); };
  let merchantLogoC = null;
  const ROOM_LOOK = { chest: ['#2b2410', '#c9a23a', chestIcon], mystery: ['#1c1236', '#9a6bff', mysteryIcon], merchant: ['#3a2a0c', '#ffd24a', merchantIcon] };
  const base = document.createElement('canvas'); base.width = MW; base.height = MH;
  function drawBase() {   // drawn once, and again whenever the random room layout arrives
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
      const look = ROOM_LOOK[c.type] || ROOM_LOOK.chest;
      g.fillStyle = look[0]; g.fillRect(x, y, w, w);
      g.strokeStyle = look[1]; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, w - 3);
      look[2](g, x + w / 2 - c.dx * 3, y + w / 2 - c.dz * 3, 1.5);
    }
    // main rooms
    for (let i = 0; i < 9; i++) {
      const [cx, cz] = rc(i), x = mx(cx - roomW(i) / 2), y = my(cz - roomD(i) / 2), w = roomW(i) * MS, h = roomD(i) * MS;   // real proportions: the vault is bigger
      g.fillStyle = i === 4 ? '#2a3442' : '#dfe8f2'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#0a1018'; g.lineWidth = 5; g.strokeRect(x, y, w, h);
      if (i === 4) { // vault symbol
        const px = x + w / 2, py = y + h / 2 - 8;
        g.strokeStyle = '#e6b52e'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
        g.strokeStyle = '#9fb4cc'; g.lineWidth = 7; g.beginPath(); g.arc(px, py, 50, 0, 7); g.stroke();
        g.lineWidth = 4; g.beginPath(); g.arc(px, py, 13, 0, 7); g.stroke();
        for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; g.beginPath(); g.moveTo(px + Math.cos(t) * 15, py + Math.sin(t) * 15); g.lineTo(px + Math.cos(t) * 50, py + Math.sin(t) * 50); g.stroke(); }
        g.fillStyle = '#f4c24d'; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('THE VAULT', px, py + 84);
      }
    }
    // doors between rooms and to chest rooms (all closed)
    for (let i = 0; i < 9; i++) {
      const [cx, cz] = rc(i);
      if (i % 3 < 2) lockMark(g, mx(cx + roomW(i) / 2), my(cz), true, (i === 4 || i + 1 === 4) ? 'vault' : 'player');
      if (i < 6) lockMark(g, mx(cx), my(cz + roomD(i) / 2), false, (i === 4 || i + 3 === 4) ? 'vault' : 'player');
    }
    for (const c of CHEST_ROOMS) lockMark(g, mx(c.wallX), my(c.wallZ), c.dx !== 0, 'treasure');
    // legend
    g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = 'bold 36px system-ui, sans-serif'; g.fillStyle = '#e9f3ff';
    g.fillText('LEGEND', 722, 186);
    g.font = '600 32px system-ui, sans-serif';
    const row = (n, fn, t) => { const y = 232 + n * 39; fn(744, y); g.fillStyle = '#e9f3ff'; g.textAlign = 'left'; g.font = '600 29px system-ui, sans-serif'; g.fillText(t, 790, y + 1); };
    row(0, (x, y) => { g.fillStyle = '#d81818'; g.fillRect(x - 14, y - 14, 28, 28); g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.strokeRect(x - 14, y - 14, 28, 28); }, 'You are here');
    row(1, (x, y) => wallTab(g, x, y - 14, '#1b6fe0'), 'This map');
    row(2, (x, y) => wallTab(g, x, y - 14, '#f08a1c'), 'Door controls');
    row(3, (x, y) => chestIcon(g, x, y, 1.2), 'Treasure room');
    row(4, (x, y) => lockMark(g, x, y, false), 'Locked door');
    row(5, (x, y) => lockMark(g, x, y, false, 'treasure'), 'Treasure door');
    row(6, (x, y) => lockMark(g, x, y, false, 'player'), 'Player door');
    row(7, (x, y) => lockMark(g, x, y, false, 'vault'), 'Vault door');
    row(8, (x, y) => { g.fillStyle = '#dfe8f2'; g.fillRect(x - 14, y - 14, 28, 28); }, 'Room');
    row(9, (x, y) => { g.fillStyle = '#2a3442'; g.fillRect(x - 14, y - 14, 28, 28); g.strokeStyle = '#9fb4cc'; g.lineWidth = 2; g.strokeRect(x - 14, y - 14, 28, 28); }, 'THE VAULT');
    row(10, (x, y) => mysteryIcon(g, x, y, 0.95), 'Mystery room');
    row(11, (x, y) => merchantIcon(g, x, y, 0.85), 'Merchant');
    g.fillStyle = '#7f95ad'; g.font = '22px system-ui, sans-serif'; g.fillText('All doors sealed', 722, 692); g.fillText('Random rooms each match', 722, 718);
  }
  drawBase();
  const spawnRooms = [0, 1, 2, 3, 5, 6, 7, 8], panels = [];
  function drawMap(p) {
    const g = p.ctx, i = p.room, [cx, cz] = rc(i), x = mx(cx - roomW(i) / 2), y = my(cz - roomD(i) / 2), w = roomW(i) * MS, h = roomD(i) * MS;
    const ph = 0.6;
    g.drawImage(base, 0, 0);
    g.save(); g.fillStyle = 'rgba(255,40,40,' + (0.16 + 0.16 * ph) + ')'; g.fillRect(x, y, w, h);
    g.shadowColor = '#ff2a2a'; g.shadowBlur = 14 + 14 * ph; g.strokeStyle = '#ff3030'; g.lineWidth = 7; g.strokeRect(x + 3, y + 3, w - 6, h - 6); g.restore();
    // label
    const lx = x + w / 2, ly = y + h / 2 + 6;
    g.save(); g.font = 'bold 25px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#d81818'; rr(g, lx - 58, ly - 30, 116, 60, 9); g.fill();
    g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#fff'; g.fillText('YOU ARE', lx, ly - 12); g.fillText('HERE', lx, ly + 14); g.restore();
    // the two wall panels on this room's north wall: map at x-dx, door controls at x+dx (dx = 4.5 m, 6.5 m in the wide rooms) (pin tips on the wall line)
    wallTab(g, lx - WORLD.panelDX(i) * MS, y + 3, '#1b6fe0', 'MAP'); wallTab(g, lx + WORLD.panelDX(i) * MS, y + 3, '#f08a1c', 'CTRL');
  }
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    r.addColorStop(0, 'rgba(120,190,255,0.9)'); r.addColorStop(0.5, 'rgba(70,140,255,0.35)'); r.addColorStop(1, 'rgba(40,100,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.8 });
  const glowGeo = new THREE.PlaneGeometry(4.6, 3.6), backGeo = new THREE.BoxGeometry(2.6, 1.9, 0.06), screenGeo = new THREE.PlaneGeometry(2.5, 2.5 * MH / MW);
  const barH = new THREE.BoxGeometry(2.6, 0.05, 0.09), barV = new THREE.BoxGeometry(0.05, 1.8, 0.09);
  for (const i of spawnRooms) {
    const [cx, cz] = rc(i), px = cx - WORLD.panelDX(i), py = 2.6, pz = cz - roomD(i) / 2 + T / 2; // pz = wall face
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
  layoutHooks.push(() => { drawBase(); for (const p of panels) { drawMap(p); p.tex.needsUpdate = true; } });   // the room types are random per match: redraw the base and every wall map once
  GK.redrawMaps = () => { drawBase(); for (const p of panels) { drawMap(p); p.tex.needsUpdate = true; } };
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
const roomKeyAt = WORLD.roomKeyOf;   // grid rooms inside +-21 m (the vault spans +-9 m), chest rooms beyond

const roomTypeName = t => (GK.ROOM_TYPE_NAMES && GK.ROOM_TYPE_NAMES[t]) || { chest: 'Treasure room', mystery: 'Mystery room', merchant: 'Merchant' }[t] || 'Treasure room';
const doorLabel = (key, id) => {
  const d = DINFO[id], mine = d.a === key, other = mine ? d.b : d.a, dir = mine ? d.da : d.db;
  const ck = a => a[0] === 'c' ? (CHEST_ROOMS[+a.slice(1)].type || 'chest') : null, ot = ck(other);
  const dest = ot ? roomTypeName(ot) : other === '4' ? 'THE VAULT' : 'Room ' + (+other + 1);
  return { dir, dest, kind: ot || d.kind };
};
const fmtT = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ----- round state (fed by applyRound; the local clock interpolates between server updates) -----
const RS = { n: 0, endAt: 0, dur: 0, sel: {}, open: [], fizzled: [], votes: 0, selJ: '{}', openJ: '[]', flashUntil: 0, fizzUntil: 0 };
const roundLeft = () => Math.max(0, RS.endAt - performance.now());
function applyRound(d) {
  const now = performance.now();
  if (d.round && Number.isFinite(d.round.n)) {
    if (RS.n > 0 && d.round.n > RS.n) {   // a round just ended: banners depend on what actually opened / fizzled
      RS.fizzled = Array.isArray(d.fizzled) ? d.fizzled : [];
      if (Array.isArray(d.open) && d.open.length) RS.flashUntil = now + 2200;
      const mySel = RS.sel[roomKeyAt(P.x, P.z)];
      if (Array.isArray(d.fizzled) && d.fizzled.length && mySel !== undefined && d.fizzled.includes(mySel)) RS.fizzUntil = now + 2800;
    }
    RS.n = d.round.n; RS.endAt = now + (+d.round.left || 0); RS.dur = +d.round.dur || 0;
  }
  if (Number.isFinite(d.vaultVotes) && d.vaultVotes !== RS.votes) { RS.votes = d.vaultVotes; panelsDirty(); }
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
const CP_KIND = { chest: '#ffc83a', skull: '#ff6a55', vault: '#5fd0ff', mystery: '#b07cff', merchant: '#ffd23a' };
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
  } else if (kind === 'mystery') {
    g.fillStyle = '#b07cff'; g.font = '900 ' + Math.round(60 * k) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#8a4cff'; g.shadowBlur = 10 * k; g.fillText('?', 0, 3 * k); g.shadowBlur = 0;
  } else if (kind === 'merchant') {
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(0, 0, 24 * k, 0, 7); g.fill(); g.strokeStyle = '#a8741a'; g.lineWidth = 3 * k; g.stroke();
    g.beginPath(); g.arc(0, 0, 17 * k, 0, 7); g.stroke(); g.fillStyle = '#a8741a'; g.font = '900 ' + Math.round(26 * k) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', 0, 2 * k);
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
  g.fillText(p.key[0] === 'c' ? roomTypeName(CHEST_ROOMS[+p.key.slice(1)].type || 'chest').toUpperCase() : p.key === '4' ? 'THE VAULT' : 'ROOM ' + (+p.key + 1), W - 24, 40);
  g.fillStyle = '#4aa8ff'; g.fillRect(24, 70, W - 48, 4);
  p.buttons.forEach((b, i) => {
    const L = doorLabel(p.key, b.id), sel = selSet.has(b.id), opn = openSet.has(b.id), hov = p.hover === i;
    g.save();
    if (sel) { const warn = RS.votes < 2 && doorLabel(p.key, b.id).kind === 'vault'; g.shadowColor = warn ? '#ff5a2a' : '#ffd24a'; g.shadowBlur = 22; g.fillStyle = warn ? (hov ? '#ffa55a' : '#ff8a3a') : hov ? '#ffe27a' : '#ffcf3a'; }
    else g.fillStyle = hov ? '#21456f' : opn ? '#0f3a24' : '#13243a';
    cpRR(g, b.x, b.y, b.w, b.h, 14); g.fill(); g.shadowBlur = 0;
    g.lineWidth = sel ? 5 : hov ? 5 : 3; g.strokeStyle = sel ? '#fff6cf' : hov ? '#9fd8ff' : opn ? '#3aff80' : '#2f5e8f'; g.stroke(); g.restore();
    const r = Math.min(b.h * 0.38, 46), ix = b.x + 16 + r, iy = b.y + b.h / 2;
    cpIcon(g, L.kind, ix, iy, r);
    const tx = ix + r + 18, tw = b.x + b.w - 16 - tx - (opn ? 96 : 0), dark = sel;
    let fs = Math.min(L.kind === 'vault' ? 34 : 40, b.h * 0.34); const text = L.dir + ' · ' + L.dest;
    g.textAlign = 'left'; g.font = '800 ' + fs + 'px system-ui, sans-serif';
    while (g.measureText(text).width > tw && fs > 18) { fs -= 2; g.font = '800 ' + fs + 'px system-ui, sans-serif'; }
    g.fillStyle = dark ? '#1a1204' : '#f1f7ff'; g.fillText(text, tx, iy - fs * (L.kind === 'vault' ? 0.82 : 0.42));
    g.font = '700 ' + Math.min(26, b.h * 0.22) + 'px system-ui, sans-serif';
    g.fillStyle = sel ? '#7a1200' : opn ? '#6dff9f' : hov ? '#cfe8ff' : '#7fa4cc';
    const vlt = L.kind === 'vault', dy = vlt ? 4 : fs * 0.72;
    g.fillText(sel ? 'SELECTED · OPENS AT 0:00' : opn ? 'OPEN THIS ROUND' : 'Press E to select', tx, iy + dy);
    if (vlt) { g.font = '800 ' + Math.min(21, b.h * 0.18) + 'px system-ui, sans-serif'; g.fillStyle = sel ? (RS.votes < 2 ? '#8a0a00' : '#1a5a10') : '#ffb347'; g.fillText('NEEDS 2 PLAYERS · THE VAULT votes: ' + RS.votes + '/2', tx, iy + dy + Math.min(27, b.h * 0.24)); }
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
  const [cx, cz] = rc(i); cpBuild(String(i), scene, 2.6, 1.9, cx + WORLD.panelDX(i), 2.6, cz - roomD(i) / 2 + T / 2, 0);
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
function cpInteract() {   // E while aiming at a control-panel button picks that door; true if it did
  const a = cpComputeAim(); if (!a) return false;
  net.send({ sel: a.p.buttons[a.i].id }); return true;
}
GK.panelClick = (room, idx) => { const ids = ROOM_DOORS[String(room)]; if (ids && ids[idx] !== undefined) net.send({ sel: ids[idx] }); };   // test helper: same message as a click
GK.roundInfo = () => ({ n: RS.n, left: roundLeft(), dur: RS.dur, sel: RS.sel, open: RS.open, votes: RS.votes, fizzled: RS.fizzled });
GK._applyRound = applyRound;   // test hook
layoutHooks.push(() => panelsDirty());
GK.ROOM_DOORS = ROOM_DOORS; GK.roomKeyAt = roomKeyAt;

{
  const css = document.createElement('style');
  css.textContent = '#roundHud{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;display:none}' +
    '#roundHud .t{display:inline-block;padding:6px 26px 8px;border-radius:14px;background:rgba(8,14,24,.72);border:2px solid rgba(120,180,255,.55);color:#f2f8ff;font-weight:800;font-size:clamp(26px,4.4vw,46px);letter-spacing:.06em;font-variant-numeric:tabular-nums;text-shadow:0 2px 8px #000;box-shadow:0 4px 24px rgba(0,0,0,.5)}' +
    '#roundHud .t.warn{color:#ff4343;border-color:#ff4343;background:rgba(40,6,6,.78);animation:rhPulse .5s ease-in-out infinite alternate}' +
    '#roundHud .b{margin-top:10px;font-weight:900;font-size:clamp(28px,5.5vw,60px);letter-spacing:.14em;color:#ffd24a;text-shadow:0 0 18px #ff9a00,0 3px 10px #000;animation:rhBanner 2.2s ease-out forwards;display:none}' +
    '#roundHud .b.f{color:#ff4a3a;font-size:clamp(20px,3.6vw,38px);text-shadow:0 0 16px #a00,0 3px 10px #000}' +
    '@keyframes rhPulse{from{transform:scale(1)}to{transform:scale(1.14)}}@keyframes rhBanner{0%{opacity:0;transform:scale(.7)}12%{opacity:1;transform:scale(1.08)}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}';
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'roundHud'; hud.innerHTML = '<div class="t"></div><div class="b">DOORS OPENING</div><div class="b f">THE VAULT NEEDS 2 PLAYERS - TURN WASTED</div>';
  document.body.appendChild(hud);
  const tEl = hud.children[0], bEl = hud.children[1], fEl = hud.children[2]; let shownBanner = 0, shownFizz = 0, lastTxt = '', lastWarn = null;
  setInterval(() => {
    const show = GK.mode === 'play' && RS.n > 0; hud.style.display = show ? 'block' : 'none'; if (!show) return;
    const left = roundLeft(), now = performance.now();
    const txt = 'ROUND ' + RS.n + '  ' + fmtT(left), warn = left <= 5000;
    if (txt !== lastTxt) { tEl.textContent = txt; lastTxt = txt; }
    if (warn !== lastWarn) { tEl.classList.toggle('warn', warn); lastWarn = warn; }
    if (now < RS.flashUntil) { if (shownBanner !== RS.flashUntil) { shownBanner = RS.flashUntil; bEl.style.display = 'none'; void bEl.offsetWidth; bEl.style.display = 'block'; } }
    else if (shownBanner) { shownBanner = 0; bEl.style.display = 'none'; }
    if (now < RS.fizzUntil) { if (shownFizz !== RS.fizzUntil) { shownFizz = RS.fizzUntil; fEl.style.display = 'none'; void fEl.offsetWidth; fEl.style.display = 'block'; } }
    else if (shownFizz) { shownFizz = 0; fEl.style.display = 'none'; }
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

// ---------- inventory rules (same as the server: also used by the offline simulation and for optimistic UI) ----------
const itemsData = () => window.GKITEMS || { ITEMS: {}, START: [], KNOWLEDGE: [], SLOTS: { backpack: 9, quick: 3 } };
const infoOf = k => { const G = window.GKITEMS; return k == null ? null : (G && G.info && G.info(k)) || (G && G.ITEMS[k]) || null; };   // also knows goblin brains
const itemName = k => { const it = infoOf(k); return it ? it.name : String(k); };
const TIER_COL = { common: '#9aa0a8', uncommon: '#4fc35b', rare: '#4a9bff', mythic: '#b06bff', legendary: '#ffb02e', transcendent: '#7ff4ff', class: '#ffd75e' };
const tierN = k => { const it = infoOf(k); return it && it.tierN != null ? it.tierN : null; };   // null for brains
const tierTxt = k => tierN(k) != null ? 'Tier ' + tierN(k) : '';
const statTxt = k => { const it = infoOf(k); if (!it) return ''; return [tierTxt(k), it.type === 'weapon' ? 'Attack ' + it.attack : it.type === 'armor' ? 'Health ' + it.health : it.gain != null ? '+' + fmtN(it.gain) + ' knowledge' : ''].filter(Boolean).join(' · '); };
const fmtN = n => Number.isInteger(+n) ? String(n) : String(+(+n).toFixed(1));   // keys -> names (plain names from an older server pass through)
const emptyInv = () => ({ backpack: Array(9).fill(null), quick: Array(3).fill(null), weapon: null, armor: null });
function startInv(goblin) { const inv = emptyInv(), s = itemsData().START[goblin]; if (s) { inv.weapon = s.weapon || null; inv.armor = s.armor || null; } return inv; }
const SLOT_RE = /^(b[0-8]|q[0-2]|weapon|armor)$/;
function invGet(inv, id) { return id === 'weapon' || id === 'armor' ? inv[id] : (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)]; }
function invSet(inv, id, v) { if (id === 'weapon' || id === 'armor') inv[id] = v; else (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)] = v; }
function slotAccepts(id, key) {
  if (key == null) return true;
  const it = infoOf(key); if (!it) return false;
  return id === 'weapon' ? it.type === 'weapon' : id === 'armor' ? it.type === 'armor' : true;
}
function canMove(inv, from, to) { return SLOT_RE.test(from) && SLOT_RE.test(to) && from !== to && invGet(inv, from) != null && slotAccepts(to, invGet(inv, from)) && slotAccepts(from, invGet(inv, to)); }
function invMove(inv, from, to) {   // swaps when the target is occupied; returns false (and changes nothing) if rejected
  if (typeof from !== 'string' || typeof to !== 'string' || !canMove(inv, from, to)) return false;
  const a = invGet(inv, from), b = invGet(inv, to); invSet(inv, to, a); invSet(inv, from, b); return true;
}
function invDrop(inv, id) { if (typeof id !== 'string' || !SLOT_RE.test(id)) return null; const k = invGet(inv, id); if (k == null) return null; invSet(inv, id, null); return k; }
function invStats(inv, goblin, know) {   // attack comes from the weapon, health from the armour, knowledge is innate (+ brains eaten)
  const w = infoOf(inv.weapon), a = infoOf(inv.armor), hp = a ? a.health : 0;
  return { knowledge: know != null ? know : (itemsData().KNOWLEDGE || [])[goblin] != null ? itemsData().KNOWLEDGE[goblin] : STATS[goblin].knowledge, attack: w ? w.attack : 0, health: hp, maxHealth: hp };
}
function invAll(inv) { return [inv.weapon, inv.armor, ...inv.backpack, ...inv.quick].filter(k => k != null); }

// ---------- networking (real server, or a local simulation for the offline demo) ----------
function makeNet(opts) {   // opts.goblin: play this goblin type (a saved character) instead of rolling one
  if (!window.GK_OFFLINE) {
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + (opts && opts.goblin != null ? '/?goblin=' + (opts.goblin | 0) + '&wins=' + (Math.max(0, (opts.wins | 0))) : (opts && opts.wins ? '/?wins=' + (opts.wins | 0) : '')));
    const net = { send: m => ws.readyState === 1 && ws.send(JSON.stringify(m)), onmessage: null };
    ws.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (err) { return; } net.onmessage && net.onmessage(d); };
    ws.onclose = () => { const m = document.getElementById('me'); if (m) m.textContent = 'Disconnected - reload to rejoin'; };
    return net;
  }
  const roll = () => { const r = Math.random() * 100; return r < 30 ? 0 : r < 60 ? 1 : r < 90 ? 2 : r < 99 ? 3 : 4; };
  let nid = 1, list = [], meP = null, seq = 0;
  const myWins = Math.max(0, (opts && opts.wins) | 0);
  const mk = bot => {
    const box = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(Math.random() * 8)], [cx, cz] = rc(box);
    const [x, z] = WORLD.randomPoint(box);
    const goblin = !bot && opts && opts.goblin != null ? opts.goblin | 0 : roll();
    return { id: nid++, goblin, box, x, z, yaw: Math.atan2(-(cx - x), -(cz - z)), bot, tx: cx, tz: cz, wait: Math.random() * 2, seq, inv: startInv(goblin), know: (itemsData().KNOWLEDGE || [])[goblin] != null ? itemsData().KNOWLEDGE[goblin] : STATS[goblin].knowledge, parts: Object.fromEntries((itemsData().PARTS || []).map(p => [p.key, 0])), gold: itemsData().START_GOLD != null ? itemsData().START_GOLD : 100, wins: bot ? Math.max(0, myWins + Math.floor(Math.random() * 3) - 1) : myWins };
  };
  const clone = v => JSON.parse(JSON.stringify(v));
  let layoutSim = null, shopsSim = null;
  const sendInv = () => net.onmessage && meP && net.onmessage({ inv: clone(meP.inv) });
  const sendGold = () => net.onmessage && meP && net.onmessage({ gold: meP.gold });
  const sendParts = () => net.onmessage && meP && net.onmessage({ parts: clone(meP.parts) });
  let dropsSim = [], nextDrop = 1, mysterySim = null;
  const sendDrops = () => net.onmessage && net.onmessage({ drops: clone(dropsSim) });
  const roomIdAt = () => CHEST_ROOMS.findIndex(C => Math.abs(meP.x - C.cx) <= 4 && Math.abs(meP.z - C.cz) <= 4);
  const eatSim = key => { const gain = itemsData().brainGain(key); meP.know = Math.round((meP.know + gain) * 100) / 100; net.onmessage && net.onmessage({ ate: { gain, knowledge: meP.know } }); };
  const sendMatch = () => { const w = list.map(p => p.wins); net.onmessage && net.onmessage({ match: { size: 5, minWins: Math.min(...w), maxWins: Math.max(...w) } }); };
  const entry = ({ id, goblin, box, x, z, yaw, seq, inv, wins, know }) => { const s = invStats(inv, goblin, know); return { id, goblin, box, x, z, yaw, seq, stats: s, gear: { weapon: inv.weapon && infoOf(inv.weapon) ? infoOf(inv.weapon).name : null, armor: inv.armor && infoOf(inv.armor) ? infoOf(inv.armor).name : null }, wins }; };
  const emit = () => net.onmessage && net.onmessage({ players: list.map(entry) });
  // same round machine as server.js, run locally: 30 s first round, 45 s after; bots pick a door in their room each round
  const rs = { n: 1, dur: 30000, endsAt: performance.now() + 30000, sel: {}, open: [], fizzled: [] };
  const isVault = id => DINFO[id].kind === 'vault', votes = () => Object.keys(rs.sel).filter(k => isVault(rs.sel[k])).length;
  const rmsg = () => ({ round: { n: rs.n, left: Math.max(0, rs.endsAt - performance.now()), dur: rs.dur }, sel: { ...rs.sel }, open: rs.open.slice(), vaultVotes: votes(), fizzled: rs.fizzled.slice() });
  const emitRound = () => net.onmessage && net.onmessage(rmsg());
  const botPlan = () => { for (const b of list) if (b.bot) b.selAt = performance.now() + 1500 + Math.random() * (rs.dur - 6000); };
  const net = {
    onmessage: null,
    send(m) {
      if (m.enter === 1 && !rs.started) { rs.started = true; rs.endsAt = performance.now() + rs.dur; botPlan(); emitRound(); }
      if (Number.isInteger(m.sel) && meP) { const k = roomKeyAt(meP.x, meP.z); if ((ROOM_DOORS[k] || []).includes(m.sel) && rs.sel[k] !== m.sel) { rs.sel[k] = m.sel; emitRound(); } }
      if (m.m && meP) { [meP.x, meP.z, meP.yaw] = m.m; meP.box = roomAt(meP.x, meP.z); } if (m.reroll) { const o = list.indexOf(meP); seq++; meP = mk(false); meP.id = list[o].id; list[o] = meP; sendInv(); sendGold(); sendParts(); emit(); }
      if (Array.isArray(m.mv) && meP) { invMove(meP.inv, m.mv[0], m.mv[1]); sendInv(); emit(); }   // same rules as the server; always answer with the real inventory
      if (typeof m.drop === 'string' && meP) { invDrop(meP.inv, m.drop); sendInv(); emit(); }
      if (typeof m.eat === 'string' && meP) {
        const k = /^(b[0-8]|q[0-2])$/.test(m.eat) ? invGet(meP.inv, m.eat) : null;
        if (itemsData().isBrain && itemsData().isBrain(k)) { invSet(meP.inv, m.eat, null); eatSim(k); }
        sendInv(); emit();
      }
      if (typeof m.recycle === 'string' && meP) {
        const id = roomIdAt(), L = id >= 0 && layoutSim ? layoutSim[id] : null, my = id >= 0 && mysterySim ? mysterySim[id] : null;
        const has = L === 'merchant' || (L === 'mystery' && my && my.kind === 'stations' && my.stations.includes('recycler'));
        const key = /^(b[0-8]|q[0-2])$/.test(m.recycle) ? invGet(meP.inv, m.recycle) : null, y = key && itemsData().recycleYield(key);
        if (!has) net.onmessage && net.onmessage({ recycleFail: 'room' });
        else if (!y) net.onmessage && net.onmessage({ recycleFail: 'item' });
        else { invSet(meP.inv, m.recycle, null); for (const k in y) meP.parts[k] = (meP.parts[k] || 0) + y[k]; sendInv(); sendParts(); net.onmessage && net.onmessage({ recycled: { key, parts: y } }); emit(); }
      }
      if (typeof m.craft === 'string' && meP) {
        const id = roomIdAt(), L = id >= 0 && layoutSim ? layoutSim[id] : null, my = id >= 0 && mysterySim ? mysterySim[id] : null;
        const has = L === 'merchant' || (L === 'mystery' && my && my.kind === 'stations' && my.stations.includes('workbench'));
        const r = (itemsData().RECIPES || []).find(x => x.id === m.craft);
        const why = !has ? 'room' : !r ? 'recipe' : meP.know < (r.needs || 0) ? 'knowledge' : Object.keys(r.cost).some(k => (meP.parts[k] || 0) < r.cost[k]) ? 'parts' : meP.inv.backpack.indexOf(null) < 0 ? 'space' : null;
        if (why) net.onmessage && net.onmessage({ craftFail: why });
        else { for (const k in r.cost) meP.parts[k] -= r.cost[k]; meP.inv.backpack[meP.inv.backpack.indexOf(null)] = r.out; sendInv(); sendParts(); net.onmessage && net.onmessage({ crafted: { key: r.out, recipe: r.id } }); emit(); }
      }
      if (Array.isArray(m.loot) && meP) {   // [dropId, index, 'take'|'eat', expectedKey]
        const [did, idx, mode, exp] = m.loot, di = dropsSim.findIndex(x => x.id === did), dr = dropsSim[di], key = dr && dr.items[idx];
        let why = !dr || key == null || (exp !== undefined && exp !== key) ? 'item' : Math.hypot(meP.x - dr.x, meP.z - dr.z) > 3 ? 'range' : null;
        if (!why && mode === 'eat' && !(itemsData().isBrain && itemsData().isBrain(key))) why = 'item';
        if (!why && mode !== 'eat' && meP.inv.backpack.indexOf(null) < 0) why = 'space';
        if (why) { net.onmessage && net.onmessage({ lootFail: why }); sendDrops(); }
        else { dr.items.splice(idx, 1); if (!dr.items.length) dropsSim.splice(di, 1); if (mode === 'eat') eatSim(key); else meP.inv.backpack[meP.inv.backpack.indexOf(null)] = key; sendInv(); sendDrops(); emit(); }
      }
      if (Array.isArray(m.buy) && meP) {   // same checks and replies as the server
        const [rid, idx] = m.buy, C = CHEST_ROOMS[rid], it = shopsSim && shopsSim[rid] && shopsSim[rid][idx];
        const why = !C || !it || !layoutSim || layoutSim[rid] !== 'merchant' || Math.abs(meP.x - C.cx) > 4 || Math.abs(meP.z - C.cz) > 4 ? 'room' : it.sold ? 'sold' : meP.gold < it.price ? 'gold' : meP.inv.backpack.indexOf(null) < 0 ? 'space' : null;
        if (why) net.onmessage && net.onmessage({ buyFail: why });
        else { meP.inv.backpack[meP.inv.backpack.indexOf(null)] = it.key; meP.gold -= it.price; it.sold = true; sendInv(); sendGold(); net.onmessage && net.onmessage({ shops: clone(shopsSim) }); emit(); }
      } },
    demoDie() {   // demo key K: everything (plus the goblin brain) drops where you stand; the pile stays in the match
      if (!meP) return null;
      const G = itemsData(), items = invAll(meP.inv), brain = G.brainKey ? G.brainKey(meP.know) : null;
      dropsSim.push({ id: nextDrop++, x: +meP.x.toFixed(2), z: +meP.z.toFixed(2), items: brain ? [...items, brain] : items.slice() });
      sendDrops(); return { items, brain };
    },
    demoGive() {   // demo key G: a random item into the first free backpack slot
      if (!meP) return null;
      const keys = Object.keys(itemsData().ITEMS), i = meP.inv.backpack.indexOf(null); if (i < 0 || !keys.length) return null;
      meP.inv.backpack[i] = keys[Math.floor(Math.random() * keys.length)]; sendInv(); emit(); return meP.inv.backpack[i];
    },
  };
  meP = mk(false); list = [meP, mk(true), mk(true), mk(true), mk(true)];
  setTimeout(() => { net.onmessage && net.onmessage({ you: meP.id, ...(() => { const layout = GKITEMS.randomLayout(); layoutSim = layout; mysterySim = layout.map(t => t === 'mystery' ? GKITEMS.randomMystery() : null); shopsSim = layout.map(t => t === 'merchant' ? GKITEMS.randomShop() : null); return { layout, mystery: mysterySim, shops: clone(shopsSim) }; })(), chests: Array.from({ length: CHEST_ROOMS.length }, () => Math.floor(Math.random() * WEAPONS.length)), chestKeys: Array.from({ length: CHEST_ROOMS.length }, () => GKITEMS.randomWeaponKey()), ...rmsg() }); sendInv(); sendGold(); sendParts(); sendMatch(); emit(); }, 50);
  botPlan();
  setInterval(() => {
    const now = performance.now();
    if (!rs.started) { rs.endsAt = now + rs.dur; return; }   // round 1 waits for Enter, as on the server
    if (now >= rs.endsAt) { const picked = [...new Set(Object.values(rs.sel))], ok = votes() >= 2; rs.open = picked.filter(d => ok || !isVault(d)); rs.fizzled = ok ? [] : picked.filter(isVault); rs.sel = {}; rs.n++; rs.dur = 45000; rs.endsAt = now + rs.dur; botPlan(); emitRound(); return; }
    for (const b of list) if (b.bot && b.selAt && now >= b.selAt) { b.selAt = 0; const k = roomKeyAt(b.x, b.z), ids = ROOM_DOORS[k]; if (ids && rs.sel[k] === undefined) { const vs = ids.filter(isVault), pool = vs.length && Math.random() < 0.5 ? vs : ids; rs.sel[k] = pool[Math.floor(Math.random() * pool.length)]; emitRound(); } }
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
  setInterval(() => { const bots = list.filter(p => p.bot); if (bots.length > 2 && Math.random() < 0.5) list.splice(list.indexOf(bots[0]), 1); else if (bots.length < 6) list.push(mk(true)); sendMatch(); }, 7000);
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
  if (d.layout) applyLayout(d.layout, d.mystery);
  if (d.chestKeys || d.chests) applyChests(d.chestKeys || d.chests);   // item keys like 'w:axe' (new), or legacy indices
  if (d.drops) applyDrops(d.drops);
  if (d.inv) setInv(d.inv);
  if (d.match) applyMatch(d.match);
  if (d.shops) applyShops(d.shops);
  if (d.gold != null) setGold(d.gold);
  if (d.buyFail) shopFail(d.buyFail);
  if (d.claimed) toastMsg(d.claimed.key ? 'Took ' + ((infoOf(d.claimed.key) || {}).name || d.claimed.key) : '+' + d.claimed.gold + ' gold', true);
  if (d.claimFail && d.claimFail !== 'room') toastMsg({ taken: 'Already taken', space: 'Your backpack is full' }[d.claimFail] || 'Nothing to take', false);
  if (d.parts) setParts(d.parts);
  if (d.recycled) recycledFx(d.recycled);
  if (d.recycleFail) stationFail('recycle', d.recycleFail);
  if (d.crafted) craftedFx(d.crafted);
  if (d.craftFail) stationFail('craft', d.craftFail);
  if (d.ate) ateFx(d.ate);
  if (d.lootFail) lootFailFx(d.lootFail);
  if (d.died) showDeathScreen(d.died);
  if (d.won) showVictory(d.won);
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
  ensureCss();
  if (!statsEl) {
    statsEl = document.createElement('div');
    statsEl.style.cssText = 'position:fixed;left:2vw;bottom:2.5vh;min-width:190px;padding:10px 14px;border-radius:10px;background:rgba(10,10,16,.62);border:1px solid rgba(255,215,94,.35);color:#f2efe6;font:600 14px/1.5 system-ui,sans-serif;pointer-events:none;display:none;text-shadow:0 1px 4px #000';
    document.body.appendChild(statsEl);
  }
  if (p && p.stats && p.stats.knowledge != null) knowOv = p.stats.knowledge;
  const mineInv = invReady ? invStats(myInv, type, knowOv) : null;   // my own inventory is the freshest source for my stats
  const st = Object.assign({}, STATS[type], mineInv, p && p.stats), gear = Object.assign({}, GEAR[type], p && p.gear, invReady ? { weapon: myInv.weapon ? itemName(myInv.weapon) : 'none', armor: myInv.armor ? itemName(myInv.armor) : 'none' } : null);
  GK.myStats = { knowledge: st.knowledge, attack: st.attack, health: st.health, maxHealth: st.maxHealth || st.health };   // read by the knowledge tree tiers
  const packN = invReady ? myInv.backpack.filter(Boolean).length : 0;
  const max = st.maxHealth || st.health || 1, pct = Math.max(0, Math.min(100, 100 * st.health / max));
  statsEl.innerHTML = '<div style="color:#ffd75e;letter-spacing:.06em;margin-bottom:4px">' + NAMES[type].toUpperCase() + '</div>'
    + '<div style="display:flex;justify-content:space-between"><span>Health</span><span>' + st.health + ' / ' + max + '</span></div>'
    + '<div style="height:6px;border-radius:3px;background:#2a2a34;margin:2px 0 6px"><div style="height:100%;width:' + pct + '%;border-radius:3px;background:linear-gradient(90deg,#c0392b,#e8564a)"></div></div>'
    + '<div style="display:flex;justify-content:space-between"><span>Attack</span><span>' + st.attack + '</span></div>'
    + '<div style="display:flex;justify-content:space-between"><span>Knowledge</span><span id="hudKnow">' + fmtN(st.knowledge) + '</span></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center"><span>Gold</span><span><i class="gkcoin"></i> <b style="color:#ffd75e">' + myGold + '</b></span></div>'
    + '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);font-weight:500;color:#cfd3dc"><div>Weapon: <b style="color:#f2efe6">' + gear.weapon + '</b> <small>(' + (tierN(myInv.weapon) != null ? 'Tier ' + tierN(myInv.weapon) + ', ' : '') + st.attack + ' dmg)</small></div>'
    + '<div>Armour: <b style="color:#f2efe6">' + gear.armor + '</b> <small>(' + (tierN(myInv.armor) != null ? 'Tier ' + tierN(myInv.armor) + ', ' : '') + max + ' HP)</small></div>'
    + (partsTotal() ? '<div>Materials: <b style="color:#f2efe6">' + partsTotal() + '</b> <small>(Tab)</small></div>' : '')
    + '<div>Backpack: <b style="color:#f2efe6">' + packN + ' / 9</b> <small>(Tab)</small></div></div>';
  statsEl.style.display = GK.mode === 'play' ? 'block' : 'none';
}
// ---- loot: what a dead goblin leaves behind (weapon, armour and everything in the inventory) ----
const lootMeshes = new Map();
let dropsList = [];
function applyDrops(list) {
  dropsList = list;
  const ids = new Set(list.map(d => d.id));
  for (const [id, g] of lootMeshes) if (!ids.has(id) || g.userData.sig !== list.find(d => d.id === id).items.join('|')) { scene.remove(g); lootMeshes.delete(id); }
  for (const d of list) {
    if (lootMeshes.has(d.id)) continue;
    const g = new THREE.Group(); g.position.set(d.x, 0, d.z); g.userData.sig = d.items.join('|');
    if (d.items.some(k => infoOf(k) && infoOf(k).family === 'brain')) {   // the dead goblin's brain sits on top of the bag
      const bm = new THREE.MeshStandardMaterial({ color: 0xf08aa8, emissive: 0xd0406a, emissiveIntensity: 0.55, roughness: 0.6 });
      const br = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), bm); br.scale.set(1.15, 0.85, 1); br.position.set(0, 0.8, 0); g.add(br);
      const bg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff6a9a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 })); bg.scale.set(0.9, 0.9, 1); bg.position.y = 0.8; g.add(bg);
    }
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: 0x7a5a34, roughness: 0.9 })); sack.scale.y = 0.8; sack.position.y = 0.25; g.add(sack);
    const neck = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 10), sack.material); neck.position.y = 0.58; g.add(neck);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd24a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); glow.scale.set(1.6, 1.6, 1); glow.position.y = 0.5; g.add(glow);
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(d.items.map(itemName).join(' · '), '#ffd75e', 'rgba(10,10,16,.6)', 640, 96, 'bold 40px system-ui'), transparent: true, depthWrite: false })); lab.scale.set(2.4, 0.36, 1); lab.position.y = 1.1; g.add(lab);
    scene.add(g); lootMeshes.set(d.id, g);
  }
  if (typeof lootOpen !== 'undefined' && lootOpen) paintLoot();
}
let diedEl = null;
function showDied(info) {
  if (!diedEl) { diedEl = document.createElement('div'); diedEl.style.cssText = 'position:fixed;left:0;right:0;top:34%;text-align:center;pointer-events:none;color:#ff5a4a;font:700 clamp(28px,5vw,60px) system-ui,sans-serif;letter-spacing:.08em;text-shadow:0 3px 18px #000;transition:opacity .6s;opacity:0'; document.body.appendChild(diedEl); }
  diedEl.innerHTML = 'YOU DIED<div style="font-size:.32em;letter-spacing:.04em;color:#f2efe6;margin-top:8px">You dropped: ' + ((info && info.items) || []).map(itemName).join(', ') + '</div>';
  diedEl.style.opacity = 1; setTimeout(() => { diedEl.style.opacity = 0; }, 2400);
}
GK.applyDrops = applyDrops; GK.showDied = showDied;
// ---- death screen: run stats, then back to the main menu or straight into the queue again ----
const run = { t0: 0, n0: 0, dist: 0 };
let deathEl = null;
function showDeathScreen(info) {
  if (GK.mode !== 'play') return;
  const mine = actors.get(me), type = mine ? mine.goblin : 0, gear = GEAR[type], st = STATS[type];
  const ms = performance.now() - run.t0, secs = Math.floor(ms / 1000), n = GK.roundInfo ? GK.roundInfo().n : 0;
  const where = !WORLD.inGrid(P.x, P.z) ? 'Treasure room' : roomAt(P.x, P.z) === WORLD.VAULT ? 'THE VAULT' : 'Room ' + (roomAt(P.x, P.z) + 1);
  closeInv(true); closeShop(true); GK.mode = 'dead'; inside = false; keys.clear(); hideHotbar();
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  for (const id of ['hint', 'dot', 'rr', 'roundHud']) { const el = $(id); if (el) el.style.display = 'none'; }
  if (statsEl) statsEl.style.display = 'none';
  const rows = [['Goblin', NAMES[type]], ['Survived', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')], ['Round reached', n || 1], ['Distance travelled', Math.round(run.dist) + ' m'], ['Died in', where],
    ['Starting weapon', gear.weapon + ' (' + [tierTxt((itemsData().START[type] || {}).weapon), st.attack + ' dmg'].filter(Boolean).join(', ') + ')'], ['Starting armour', gear.armor + ' (' + [tierTxt((itemsData().START[type] || {}).armor), st.health + ' HP'].filter(Boolean).join(', ') + ')'], ['Dropped', [...((info && info.items) || []), ...(info && info.brain ? [info.brain] : [])].map(k => itemName(k) + (tierN(k) != null ? ' (T' + tierN(k) + ')' : '')).join(', ') || 'nothing']];
  deathEl = document.createElement('div');
  deathEl.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(60,0,0,.55),rgba(0,0,0,.88));font-family:system-ui,sans-serif;color:#f2efe6;opacity:0;transition:opacity .8s';
  deathEl.innerHTML = '<div style="width:min(520px,92vw);padding:28px 32px 26px;border-radius:16px;background:rgba(14,10,12,.82);border:1px solid rgba(255,90,74,.45);box-shadow:0 10px 60px rgba(0,0,0,.7)">'
    + '<div style="text-align:center;color:#ff5a4a;font-weight:800;font-size:clamp(34px,6vw,58px);letter-spacing:.1em;text-shadow:0 0 24px rgba(255,60,40,.5)">YOU DIED</div>'
    + '<div style="text-align:center;color:#b9b4ae;margin:2px 0 18px;letter-spacing:.14em;font-size:13px">YOUR RUN</div>'
    + '<div style="display:grid;grid-template-columns:auto 1fr;gap:7px 22px;font-size:15px;font-variant-numeric:tabular-nums">'
    + rows.map(r => '<span style="color:#aaa59d">' + r[0] + '</span><b style="font-weight:600;text-align:right">' + String(r[1]).replace(/</g, '&lt;') + '</b>').join('') + '</div>'
    + '<div style="text-align:center;margin-top:16px;color:#ff8a7a;font-size:14px;letter-spacing:.04em">Everything you carried is lost.</div>'
    + '<div style="display:flex;gap:12px;margin-top:20px"><button id="deathQueue" style="flex:1;padding:13px 10px;border:0;border-radius:10px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 16px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer">REQUEUE</button>'
    + '<button id="deathMenu" style="flex:1;padding:13px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#f2efe6;font:700 16px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer">MAIN MENU</button></div></div>';
  document.body.appendChild(deathEl); requestAnimationFrame(() => { deathEl.style.opacity = 1; });
  $('deathQueue').onclick = () => { try { sessionStorage.setItem('gk.requeue', '1'); } catch (e) {} location.reload(); };   // fresh connection, new wheel roll
  $('deathMenu').onclick = () => location.reload();
  if (window.GK_OFFLINE) {   // demo: come back as a new goblin right here; the loot pile stays and can be looted
    const b = document.createElement('button'); b.id = 'deathAgain'; b.textContent = 'NEW GOBLIN (DEMO)';
    b.style.cssText = 'flex:1;padding:13px 10px;border-radius:10px;border:1px solid rgba(255,215,94,.5);background:transparent;color:#ffd75e;font:700 14px system-ui,sans-serif;letter-spacing:.06em;cursor:pointer';
    $('deathMenu').parentNode.appendChild(b);
    b.onclick = () => {
      deathEl.remove(); deathEl = null; GK.mode = 'play'; inside = true; winDone = false; run.t0 = performance.now(); run.dist = 0; myGold = 0;
      for (const id of ['hint', 'dot']) { const el = $(id); if (el) el.style.display = ''; } const rr = $('rr'); if (rr) rr.style.display = 'block';
      net.send({ reroll: 1 }); setTimeout(() => { GK.showStats(); lockNow(); }, 100);
    };
  }
  $('deathQueue').focus();
}
GK.showDeathScreen = showDeathScreen;

// ---------- inventory UI: hotbar (3 quick slots), inventory screen, lobby line ----------
let myInv = emptyInv(), invReady = false, invOpen = false, qSel = 0, held = null;
let hotEl = null, invEl = null, ghostEl = null, tipEl = null, statColEl = null, dropBtn = null, hintEl = null, lobbyEl = null;
const slotEls = {};   // slot id -> [elements showing it] (hotbar and inventory mirror the quick slots)
const GOLD = '#ffd75e';
function ensureCss() {
  if (document.getElementById('gkInvCss')) return;
  const st = document.createElement('style'); st.id = 'gkInvCss';
  st.textContent = '.gks{position:relative;box-sizing:border-box;border-radius:9px;background:linear-gradient(180deg,rgba(40,34,26,.75),rgba(12,10,8,.8));border:1px solid rgba(255,215,94,.28);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .12s,box-shadow .12s,transform .12s;box-shadow:inset 0 0 10px rgba(0,0,0,.6)}'
    + '.gks:hover{border-color:' + GOLD + ';box-shadow:inset 0 0 10px rgba(0,0,0,.6),0 0 10px rgba(255,215,94,.35)}'
    + '.gks.held{opacity:.35}.gks.sel{border-color:' + GOLD + ';box-shadow:0 0 14px rgba(255,215,94,.65),inset 0 0 12px rgba(255,215,94,.25);transform:translateY(-4px)}'
    + '.gks.bad{animation:gkbad .5s}@keyframes gkbad{0%,100%{}30%{border-color:#ff3b30;background:rgba(255,40,30,.45);box-shadow:0 0 16px #ff3b30}}'
    + '.gks .kl{position:absolute;left:5px;top:2px;font:800 12px system-ui,sans-serif;color:rgba(255,215,94,.8);text-shadow:0 1px 2px #000;pointer-events:none}'
    + '.gks canvas{pointer-events:none}.gks .sil{opacity:.2;filter:grayscale(1) brightness(1.5)}'
    + '.gkcoin{display:inline-block;width:13px;height:13px;border-radius:50%;vertical-align:-2px;background:radial-gradient(circle at 35% 30%,#fff3b0,#ffd24a 45%,#b8860b);border:1px solid #7a5a08;box-shadow:0 0 5px rgba(255,200,60,.6)}'
    + '#gkInv .lab,#gkShop .lab,#gkRec .lab,#gkCraft .lab,#gkLoot .lab{font:700 11px system-ui,sans-serif;letter-spacing:.16em;color:#b9b4ae;margin:0 0 6px;text-align:center}'
    + '#gkInv button{cursor:pointer;font:700 13px system-ui,sans-serif;letter-spacing:.1em;border-radius:8px;padding:9px 16px}';
  document.head.appendChild(st);
}
function mkIcon(key, size) {
  try { if (window.GKICONS) return window.GKICONS.canvas(key, size); } catch (e) {}
  const s = document.createElement('span'); s.textContent = itemName(key).slice(0, 2); s.style.cssText = 'color:#ddd;font:700 14px system-ui'; return s;
}
function paintSlot(el, id) {
  const k = invGet(myInv, id), size = +el.dataset.size || 40;
  el.textContent = '';
  if (el.dataset.lab) { const l = document.createElement('span'); l.className = 'kl'; l.textContent = el.dataset.lab; el.appendChild(l); }
  if (k != null) {
    el.appendChild(mkIcon(k, size));
    const tn = tierN(k); if (tn != null) { const b = document.createElement('span'); b.textContent = 'T' + tn; b.style.cssText = 'position:absolute;right:3px;bottom:2px;padding:0 4px;border-radius:4px;font:800 10px/14px system-ui,sans-serif;color:#0c0a06;pointer-events:none;background:' + (TIER_COL[(infoOf(k) || {}).tier] || '#9aa0a8'); el.appendChild(b); }
    else if (infoOf(k) && infoOf(k).family === 'brain') { const b = document.createElement('span'); b.textContent = '+' + fmtN(infoOf(k).gain); b.style.cssText = 'position:absolute;right:3px;bottom:2px;padding:0 4px;border-radius:4px;font:800 10px/14px system-ui,sans-serif;color:#0c0a06;pointer-events:none;background:#f08aa8'; el.appendChild(b); }
  } else if (id === 'weapon' || id === 'armor') { const c = mkIcon(id === 'weapon' ? 'w:sword' : 'a:vest', size); c.className = 'sil'; el.appendChild(c); }
  el.classList.toggle('held', held === id && k != null);
  el.classList.toggle('sel', id[0] === 'q' && +id[1] === qSel && el.dataset.hot === '1');
}
function mkSlot(id, px, lab, hot) {
  const el = document.createElement('div'); el.className = 'gks'; el.dataset.id = id; el.dataset.size = Math.round(px * 0.74); if (lab) el.dataset.lab = lab; if (hot) el.dataset.hot = '1';
  el.style.width = el.style.height = px + 'px'; (slotEls[id] = slotEls[id] || []).push(el); return el;
}
function ensureHotbar() {
  if (hotEl) return; ensureCss();
  hotEl = document.createElement('div'); hotEl.id = 'gkHot';
  hotEl.style.cssText = 'position:fixed;left:50%;bottom:2.2vh;transform:translateX(-50%);z-index:20;display:none;gap:10px;padding:8px 10px;border-radius:14px;background:rgba(10,10,16,.45);border:1px solid rgba(255,215,94,.2);user-select:none';
  for (let i = 0; i < 3; i++) { const s = mkSlot('q' + i, 58, String(i + 1), true); s.style.pointerEvents = 'none'; hotEl.appendChild(s); }
  document.body.appendChild(hotEl); paintAll();
}
function hideHotbar() { if (hotEl) hotEl.style.display = 'none'; }
function syncHotbar() { ensureHotbar(); hotEl.style.display = GK.mode === 'play' ? 'flex' : 'none'; }
function paintAll() { for (const id in slotEls) for (const el of slotEls[id]) paintSlot(el, id); paintStatCol(); paintGhost(); paintParts(); panelRefresh(); }
function setSel(i) { qSel = (i + 3) % 3; paintAll(); }
function setInv(d) {
  if (!d || !Array.isArray(d.backpack)) return;
  myInv = { backpack: Array.from({ length: 9 }, (_, i) => d.backpack[i] == null ? null : d.backpack[i]), quick: Array.from({ length: 3 }, (_, i) => (d.quick || [])[i] == null ? null : d.quick[i]), weapon: d.weapon || null, armor: d.armor || null };
  invReady = true; if (held && invGet(myInv, held) == null) held = null;
  if (hotEl) paintAll();
  const mine = actors.get(me); if (mine) showStats(null, mine.goblin);
}
function paintStatCol() {
  if (!statColEl) return;
  const mine = actors.get(me), type = mine ? mine.goblin : 0, s = invStats(myInv, type, knowOv), w = myInv.weapon, a = myInv.armor;
  const row = (k, v, sub) => '<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#aaa59d">' + k + '</span><b>' + v + '</b></div>' + (sub ? '<div style="font-size:11px;color:#8d8880;margin:-2px 0 6px;text-align:right">' + sub + '</div>' : '');
  statColEl.innerHTML = '<div class="lab" style="text-align:left">' + NAMES[type].toUpperCase() + '</div>'
    + row('Attack', s.attack, w ? itemName(w) : 'no weapon') + row('Health', s.health + ' / ' + s.maxHealth, a ? itemName(a) : 'no armour') + row('Knowledge', '<span class="knowv">' + fmtN(s.knowledge) + '</span>', 'innate + brains') + row('Gold', '<i class="gkcoin"></i> ' + myGold);
}
function flashBad(...ids) { for (const id of ids) for (const el of slotEls[id] || []) { el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad'); } }
function tipFor(k) {
  const it = infoOf(k); if (!it) return '<b>' + String(k).replace(/</g, '&lt;') + '</b>';
  const kind = it.type === 'weapon' ? 'Weapon' : it.type === 'armor' ? 'Armour' : 'Consumable';
  return '<b style="color:' + (TIER_COL[it.tier] || GOLD) + '">' + it.name + '</b><span style="color:#aaa59d">' + kind + ' · ' + statTxt(k) + (it.family === 'brain' ? '<br>Eat it for +' + fmtN(it.gain) + ' knowledge' : '') + '</span>';
}
function paintGhost() {
  if (!ghostEl) return; ghostEl.textContent = '';
  const k = held ? invGet(myInv, held) : null;
  if (k == null) { ghostEl.style.display = 'none'; return; }
  ghostEl.appendChild(mkIcon(k, 50)); ghostEl.style.display = 'block';
}
function moveInv(from, to) {
  if (from === to) { held = null; paintAll(); return; }
  if (!canMove(myInv, from, to)) { flashBad(to); return; }   // wrong slot type for this item: red flash, item stays picked up
  invMove(myInv, from, to); net.send({ mv: [from, to] }); held = null; paintAll();   // optimistic, the server's {inv} reconciles
  const mine = actors.get(me); if (mine) showStats(null, mine.goblin);
}
function dropSlot(id) {
  if (!id || invGet(myInv, id) == null) return;
  invDrop(myInv, id); net.send({ drop: id }); if (held === id) held = null; paintAll(); hideTip();
  const mine = actors.get(me); if (mine) showStats(null, mine.goblin);
}
function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
function buildInv() {
  ensureCss();
  invEl = document.createElement('div'); invEl.id = 'gkInv';
  invEl.style.cssText = 'position:fixed;inset:0;z-index:55;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,22,6,.5),rgba(0,0,0,.82));font-family:system-ui,sans-serif;color:#f2efe6;user-select:none';
  const panel = document.createElement('div');
  panel.style.cssText = 'width:min(660px,94vw);max-height:96vh;overflow:auto;box-sizing:border-box;padding:18px 26px 16px;border-radius:16px;background:rgba(14,12,9,.86);border:1px solid rgba(255,215,94,.45);box-shadow:0 10px 60px rgba(0,0,0,.7),inset 0 0 40px rgba(255,215,94,.04)';
  panel.innerHTML = '<div style="text-align:center;color:' + GOLD + ';font-weight:800;font-size:clamp(24px,4vw,34px);letter-spacing:.14em;text-shadow:0 0 22px rgba(255,200,60,.4)">INVENTORY</div>'
    + '<div style="text-align:center;color:#b9b4ae;margin:0 0 14px;letter-spacing:.12em;font-size:11px">CLICK AN ITEM TO PICK IT UP, CLICK A SLOT TO PLACE IT</div>';
  const main = document.createElement('div'); main.style.cssText = 'display:flex;gap:26px;justify-content:center;align-items:flex-start;flex-wrap:wrap';
  const col = (label, inner) => { const d = document.createElement('div'); d.innerHTML = '<div class="lab">' + label + '</div>'; d.appendChild(inner); return d; };
  const eq = document.createElement('div'); eq.style.cssText = 'display:flex;flex-direction:column;gap:10px;align-items:center';
  const wl = document.createElement('div'); wl.className = 'lab'; wl.textContent = 'WEAPON'; wl.style.margin = '0 0 -4px';
  const al = document.createElement('div'); al.className = 'lab'; al.textContent = 'ARMOUR'; al.style.margin = '4px 0 -4px';
  eq.append(wl, mkSlot('weapon', 70), al, mkSlot('armor', 70));
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,62px);gap:7px';
  for (let i = 0; i < 9; i++) grid.appendChild(mkSlot('b' + i, 62));
  statColEl = document.createElement('div'); statColEl.style.cssText = 'min-width:150px;font-size:14px;line-height:1.6';
  main.append(eq, col('BACKPACK', grid), statColEl);
  const quick = document.createElement('div'); quick.style.cssText = 'display:flex;gap:10px;justify-content:center';
  for (let i = 0; i < 3; i++) quick.appendChild(mkSlot('q' + i, 58, String(i + 1)));
  const qwrap = document.createElement('div'); qwrap.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)'; qwrap.innerHTML = '<div class="lab">QUICK ACCESS (KEYS 1 2 3)</div>'; qwrap.appendChild(quick);
  const pw = document.createElement('div'); pw.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)'; pw.innerHTML = '<div class="lab">MATERIALS</div>'; pw.appendChild(mkPartsRow()); qwrap.appendChild(pw);
  const foot = document.createElement('div'); foot.style.cssText = 'display:flex;gap:12px;align-items:center;margin-top:14px';
  hintEl = document.createElement('div'); hintEl.style.cssText = 'flex:1;font-size:12px;color:#8d8880;letter-spacing:.04em'; hintEl.textContent = 'Right-click an item to drop it  ·  Tab / I / Esc to close';
  dropBtn = document.createElement('button'); dropBtn.textContent = 'DROP'; dropBtn.style.cssText = 'border:1px solid rgba(255,90,74,.6);background:rgba(120,20,14,.35);color:#ff8a7a';
  const closeBtn = document.createElement('button'); closeBtn.textContent = 'CLOSE'; closeBtn.style.cssText = 'border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font-weight:800';
  const eatBtn = document.createElement('button'); eatBtn.textContent = 'EAT'; eatBtn.id = 'invEat'; eatBtn.style.cssText = 'border:1px solid #8be28b;background:rgba(40,120,50,.35);color:#b8f5b8';
  eatBtn.onclick = () => { const k = held && invGet(myInv, held); if (k && infoOf(k) && infoOf(k).family === 'brain') eatSlot(held); else { hintEl.style.color = '#ff8a7a'; hintEl.textContent = 'Pick up a brain first, then press Eat (or double-click it)'; setTimeout(() => { hintEl.style.color = '#8d8880'; hintEl.textContent = 'Right-click an item to drop it  ·  Tab / I / Esc to close'; }, 2200); } };
  foot.append(hintEl, eatBtn, dropBtn, closeBtn);
  invEl.addEventListener('dblclick', e => { const el = e.target.closest && e.target.closest('.gks'); if (el && el.dataset.id) { held = null; eatSlot(el.dataset.id); } });
  panel.append(main, qwrap, foot); invEl.appendChild(panel);
  ghostEl = document.createElement('div'); ghostEl.style.cssText = 'position:fixed;z-index:70;display:none;pointer-events:none;filter:drop-shadow(0 4px 8px #000);transform:translate(-50%,-50%)';
  tipEl = document.createElement('div'); tipEl.style.cssText = 'position:fixed;z-index:75;display:none;pointer-events:none;padding:6px 10px;border-radius:8px;background:rgba(10,8,6,.95);border:1px solid rgba(255,215,94,.5);font-size:13px;line-height:1.4';
  tipEl.innerHTML = '';
  document.body.append(invEl, ghostEl, tipEl);
  const slotOf = e => { const el = e.target.closest && e.target.closest('.gks'); return el && invEl.contains(el) ? el.dataset.id : null; };
  invEl.addEventListener('click', e => {
    const id = slotOf(e); if (e.target.closest('button')) return;
    if (!id) { if (held && e.target === invEl) { held = null; paintAll(); } return; }
    if (held == null) { if (invGet(myInv, id) != null) { held = id; hideTip(); paintAll(); ghostAt(e); } } else moveInv(held, id);
  });
  invEl.addEventListener('contextmenu', e => { e.preventDefault(); const id = held || slotOf(e); if (id) dropSlot(id); });
  invEl.addEventListener('mousemove', e => {
    ghostAt(e);
    const id = slotOf(e), k = id && !held ? invGet(myInv, id) : null;
    if (k == null) { hideTip(); return; }
    tipEl.innerHTML = tipFor(k).replace(/<span/, '<br><span'); tipEl.style.display = 'block';
    tipEl.style.left = Math.min(e.clientX + 16, innerWidth - 190) + 'px'; tipEl.style.top = Math.min(e.clientY + 14, innerHeight - 60) + 'px';
  });
  dropBtn.onclick = () => { if (held) dropSlot(held); else { hintEl.style.color = '#ff8a7a'; hintEl.textContent = 'Pick up an item first, then press Drop (or right-click it)'; setTimeout(() => { hintEl.style.color = '#8d8880'; hintEl.textContent = 'Right-click an item to drop it  ·  Tab / I / Esc to close'; }, 2200); } };
  closeBtn.onclick = () => closeInv();
  paintAll();
}
function ghostAt(e) { if (ghostEl && held) { ghostEl.style.left = e.clientX + 'px'; ghostEl.style.top = e.clientY + 'px'; } }
function openInv() {
  if (invOpen || shopOpen || GK.mode !== 'play') return;
  if (!invEl) buildInv();
  invOpen = true; keys.clear(); held = null; paintAll(); invEl.style.display = 'flex';
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
}
function closeInv(noLock) {
  if (!invOpen) return;
  invOpen = false; held = null; hideTip(); if (invEl) invEl.style.display = 'none'; if (ghostEl) ghostEl.style.display = 'none'; keys.clear();
  if (!noLock) lockNow();
}
function applyMatch(m) {
  if (!m) return;
  const hud = $('cnt') && $('cnt').parentNode; if (!hud) return;
  if (!lobbyEl) { lobbyEl = document.createElement('div'); lobbyEl.style.cssText = 'font-size:clamp(11px,1.3vw,14px);color:#9aa0ad;margin-top:2px'; hud.appendChild(lobbyEl); }
  const lo = m.minWins | 0, hi = m.maxWins | 0, v = n => n + (n === 1 ? ' victory' : ' victories');
  lobbyEl.textContent = 'Lobby: ' + (m.size | 0) + ' goblins · ' + (lo === hi ? v(lo) : lo + '-' + hi + ' victories');
}
GK.showStats = () => { if (statsEl) statsEl.style.display = GK.mode === 'play' ? 'block' : 'none'; syncHotbar(); };
GK.getInv = () => JSON.parse(JSON.stringify(myInv));
GK.openInventory = openInv; GK.closeInventory = closeInv;
addEventListener('keydown', e => {
  if (GK.mode !== 'play') return;
  if (shopOpen) { if (e.code === 'Escape' || e.code === 'Tab' || (e.code === 'KeyE' && !e.repeat)) { e.preventDefault(); closeShop(); } return; }
  if (!invOpen && !e.repeat && window.GK_OFFLINE && (e.code === 'KeyT' || e.code === 'KeyY') && spawned) {   // demo: T = into the first merchant room, Y = back to the start room
    const i = (GK.layout || []).indexOf('merchant');
    if (e.code === 'KeyT' && i >= 0) { const C = CHEST_ROOMS[i]; P.x = C.cx - C.dx * 2.2; P.z = C.cz - C.dz * 2.2; P.yaw = Math.atan2(-C.dx, -C.dz); P.pitch = 0; }
    else if (e.code === 'KeyY') { P.x = 0; P.z = 3; P.yaw = 0; P.pitch = 0; }
    return;
  }
  if (e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); if (!e.repeat) { if (invOpen) closeInv(); else openInv(); } return; }
  if (e.code === 'Escape' && invOpen) { if (held) { held = null; paintAll(); } else closeInv(); return; }
  if (e.repeat) return;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    ensureHotbar(); const i = +e.code.slice(5) - 1, k = invGet(myInv, 'q' + i);
    if (i === qSel && k != null && infoOf(k) && infoOf(k).family === 'brain') eatSlot('q' + i); else setSel(i);   // pressing the selected slot's key eats a brain
    return;
  }
  if (e.code === 'KeyE' && !invOpen) {   // one interact key: control panel, then merchant / station, then a loot pile underfoot
    if (cpInteract() || stationInteract()) return;
    if (nearestPile()) openStation('loot', nearestPile().id); else net.send({ claim: 1 });   // chest / mystery room contents
    return;
  }
  if (window.GK_OFFLINE && e.code === 'KeyG' && netReal && netReal.demoGive) netReal.demoGive();
  if (window.GK_OFFLINE && e.code === 'KeyL' && actors.get(me)) showVictory({ items: invAll(myInv), gold: myGold, parts: myParts });   // demo only: L = win
});
addEventListener('wheel', e => { if (GK.mode === 'play' && !invOpen && !shopOpen) { ensureHotbar(); setSel(qSel +(e.deltaY > 0 ? 1 : -1)); } }, { passive: true });

// ---------- victory screen: the run is won, the character and everything it carried are kept ----------
let winEl = null, winDone = false;
function showVictory(info) {
  if (GK.mode !== 'play' || winDone) return;
  winDone = true;
  const mine = actors.get(me), type = mine ? mine.goblin : 0;
  const ms = performance.now() - run.t0, secs = Math.floor(ms / 1000), n = GK.roundInfo ? GK.roundInfo().n : 0;
  const items = ((info && info.items) || []).filter(k => k != null);
  const from = GK.charId;
  let c = null; try { c = window.GKSAVE.recordWin({ charId: from, goblin: type, items, parts: (info && info.parts) || {} }); if (c && c.id != null) GK.charId = c.id; } catch (e) { c = null; }
  const wins = c && c.wins != null ? c.wins : (GK.wins | 0) + 1;
  closeInv(true); closeShop(true); GK.mode = 'win'; inside = false; keys.clear(); hideHotbar();
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  for (const id of ['hint', 'dot', 'rr', 'roundHud']) { const el = $(id); if (el) el.style.display = 'none'; }
  if (statsEl) statsEl.style.display = 'none';
  const esc = s => String(s).replace(/</g, '&lt;');
  const pm = (info && info.parts) || {}, partsStr = Object.keys(pm).filter(p => pm[p] > 0).map(p => pm[p] + ' ' + partName(p)).join(', ');
  const rows = [['Goblin', NAMES[type]], ['Survived', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')], ['Round reached', n || 1], ['Distance travelled', Math.round(run.dist) + ' m'], ...(info && info.gold != null ? [['Gold left', info.gold]] : []), ['Victories', wins]];
  winEl = document.createElement('div');
  winEl.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(70,50,0,.5),rgba(0,0,0,.88));font-family:system-ui,sans-serif;color:#f2efe6;opacity:0;transition:opacity .8s;overflow:auto';
  winEl.innerHTML = '<div style="width:min(540px,92vw);max-height:96vh;overflow:auto;box-sizing:border-box;padding:20px 32px 20px;border-radius:16px;background:rgba(16,13,6,.84);border:1px solid rgba(255,215,94,.55);box-shadow:0 10px 60px rgba(0,0,0,.7),0 0 50px rgba(255,200,60,.12)">'
    + '<div style="text-align:center;color:' + GOLD + ';font-weight:800;font-size:clamp(34px,6vw,58px);letter-spacing:.1em;text-shadow:0 0 26px rgba(255,200,60,.55)">VICTORY</div>'
    + '<div style="text-align:center;color:#d8c98c;margin:2px 0 14px;letter-spacing:.06em;font-size:15px">' + (c ? '<b style="color:' + GOLD + '">' + esc(c.name) + '</b> now has <b style="color:' + GOLD + '">' + wins + '</b> victor' + (wins === 1 ? 'y' : 'ies') : 'Your run is won') + '</div>'
    + '<div style="display:grid;grid-template-columns:auto 1fr;gap:6px 22px;font-size:15px;font-variant-numeric:tabular-nums">'
    + rows.map(r => '<span style="color:#aaa59d">' + r[0] + '</span><b style="font-weight:600;text-align:right">' + esc(r[1]) + '</b>').join('') + '</div>'
    + '<div style="text-align:center;margin:16px 0 8px;color:#b9b4ae;letter-spacing:.14em;font-size:12px">ITEMS YOU KEEP</div>'
    + '<div id="winItems" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;min-height:30px"></div>'
    + (partsStr ? '<div style="text-align:center;margin-top:8px;color:#d8c98c;font-size:13px">Materials kept: ' + esc(partsStr) + '</div>' : '')
    + '<div style="text-align:center;margin-top:8px;color:#8d8880;font-size:12px">' + (c ? 'Saved to your stash, along with ' + esc(c.name) : 'Saved to your stash') + '</div>'
    + '<div style="display:flex;gap:12px;margin-top:20px"><button id="winQueue" style="flex:1;padding:13px 10px;border:0;border-radius:10px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 16px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer">QUEUE AGAIN</button>'
    + '<button id="winMenu" style="flex:1;padding:13px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:transparent;color:#f2efe6;font:700 16px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer">MAIN MENU</button></div></div>';
  document.body.appendChild(winEl); requestAnimationFrame(() => { winEl.style.opacity = 1; });
  const box = $('winItems');
  if (!items.length) box.innerHTML = '<span style="color:#8d8880">nothing</span>';
  for (const k of items) {
    const d = document.createElement('div'); d.style.cssText = 'width:74px;padding:6px 2px 5px;border-radius:9px;background:rgba(0,0,0,.4);border:1px solid rgba(255,215,94,.3);text-align:center;font-size:11px;line-height:1.2;display:flex;flex-direction:column;align-items:center;gap:2px';
    d.appendChild(mkIcon(k, 44)); const t = document.createElement('span'); t.textContent = itemName(k) + (tierN(k) != null ? ' (T' + tierN(k) + ')' : ''); d.appendChild(t); box.appendChild(d);
  }
  $('winQueue').onclick = () => { try { sessionStorage.setItem('gk.requeue', '1'); if (from != null) sessionStorage.setItem('gk.requeueChar', String(from)); } catch (e) {} location.reload(); };
  $('winMenu').onclick = () => location.reload();
  $('winQueue').focus();
}
GK.showVictory = showVictory;

// ---------- merchant: click the merchant goblin to trade (5 items with gold prices) ----------
let myGold = 0, shops = [], shopOpen = false, shopRoom = -1, shopEl = null, shopMsg = null, hoverRoom = -1, hoverTip = null;
const MERCHANT_NAMES = ['Grizzle the Fence', 'Snaggle Pennywort', 'Old Murk', 'Bargle Two-Coins', 'Fennick Slyhand', 'Gobbo the Honest'];
const merchantName = id => { const g = (GK.merchantTargets || []).find(o => o && o.userData && o.userData.roomId === id); return (g && g.userData.merchantName) || MERCHANT_NAMES[id % MERCHANT_NAMES.length]; };
const coin = '<i class="gkcoin"></i>';
function setGold(n) { myGold = n | 0; paintStatCol(); const mine = actors.get(me); if (mine) showStats(null, mine.goblin); if (panelKind === 'shop') paintShop(); }
function applyShops(s) { if (Array.isArray(s)) { shops = s; GK.shops = s; if (panelKind === 'shop') paintShop(); } }
function shopFail(why) {
  if (!shopOpen || !shopMsg) return;
  shopMsg.textContent = { gold: 'Not enough gold', space: 'Your backpack is full', sold: 'Already sold', room: 'You are too far from the merchant' }[why] || 'Cannot buy that';
  shopMsg.style.opacity = 1; shopEl.firstChild.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], 220);
  clearTimeout(shopFail.t); shopFail.t = setTimeout(() => { if (shopMsg) shopMsg.style.opacity = 0; }, 2200);
}
function buildShop() {
  ensureCss();
  shopEl = document.createElement('div'); shopEl.id = 'gkShop';
  shopEl.style.cssText = 'position:fixed;inset:0;z-index:56;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,22,6,.5),rgba(0,0,0,.82));font-family:system-ui,sans-serif;color:#f2efe6;user-select:none';
  shopEl.innerHTML = '<div style="width:min(560px,94vw);box-sizing:border-box;padding:16px 24px 16px;border-radius:16px;background:rgba(14,12,9,.88);border:1px solid rgba(255,215,94,.45);box-shadow:0 10px 60px rgba(0,0,0,.7)">'
    + '<div id="shopTitle" style="text-align:center;color:' + GOLD + ';font-weight:800;font-size:clamp(22px,3.6vw,30px);letter-spacing:.1em;text-shadow:0 0 22px rgba(255,200,60,.4)"></div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin:4px 0 10px;font-size:12px;letter-spacing:.14em;color:#b9b4ae"><span>MERCHANT</span><span id="shopGold" style="font-size:16px;letter-spacing:.04em;color:' + GOLD + ';font-weight:700"></span></div>'
    + '<div id="shopRows" style="display:flex;flex-direction:column;gap:7px"></div>'
    + '<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><div id="shopMsg" style="flex:1;font-size:13px;color:#ff8a7a;opacity:0;transition:opacity .25s"></div><button id="shopClose" style="cursor:pointer;border:0;border-radius:8px;padding:9px 18px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 13px system-ui,sans-serif;letter-spacing:.1em">CLOSE (ESC)</button></div></div>';
  document.body.appendChild(shopEl); shopMsg = shopEl.querySelector('#shopMsg');
  shopEl.querySelector('#shopClose').onclick = () => closeShop();
  shopEl.addEventListener('click', e => { if (e.target === shopEl) closeShop(); });
}
function paintShop() {
  if (!shopEl) return;
  shopEl.querySelector('#shopTitle').textContent = merchantName(shopRoom).toUpperCase();
  shopEl.querySelector('#shopGold').innerHTML = 'Your gold ' + coin + ' ' + myGold;
  const rows = shopEl.querySelector('#shopRows'); rows.textContent = '';
  const list = shops[shopRoom] || [], full = myInv.backpack.indexOf(null) < 0;
  if (!list.length) { rows.innerHTML = '<div style="text-align:center;color:#8d8880;padding:20px">The merchant has nothing to sell.</div>'; return; }
  list.forEach((it, idx) => {
    const d = infoOf(it.key) || { name: String(it.key), type: 'weapon', attack: 0 };
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,215,94,.2)' + (it.sold ? ';opacity:.45' : '');
    const ic = document.createElement('div'); ic.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(0,0,0,.4);flex:none'; ic.appendChild(mkIcon(it.key, 40));
    const tx = document.createElement('div'); tx.style.cssText = 'flex:1;min-width:0';
    tx.innerHTML = '<div style="font-weight:700;font-size:15px;color:' + (TIER_COL[d.tier] || '#f2efe6') + '">' + d.name + '</div><div style="font-size:12px;color:#aaa59d">' + statTxt(it.key) + '</div>';
    const pr = document.createElement('div'); pr.style.cssText = 'font-weight:700;font-size:15px;min-width:64px;text-align:right;color:' + (myGold >= it.price ? GOLD : '#ff8a7a'); pr.innerHTML = coin + ' ' + it.price;
    const bt = document.createElement('button'); const can = !it.sold && myGold >= it.price && !full;
    bt.textContent = it.sold ? 'SOLD' : myGold < it.price ? 'NO GOLD' : full ? 'PACK FULL' : 'BUY'; bt.disabled = !can; bt.dataset.idx = idx;
    bt.style.cssText = 'width:92px;padding:8px 0;border-radius:8px;font:800 12px system-ui,sans-serif;letter-spacing:.1em;cursor:' + (can ? 'pointer' : 'not-allowed') + ';' + (can ? 'border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405' : it.sold ? 'border:1px solid rgba(255,255,255,.2);background:transparent;color:#8d8880' : 'border:1px solid rgba(255,90,74,.6);background:rgba(120,20,14,.35);color:#ff8a7a');
    bt.onclick = () => { if (!bt.disabled) net.send({ buy: [shopRoom, idx] }); else shopFail(it.sold ? 'sold' : myGold < it.price ? 'gold' : 'space'); };
    row.append(ic, tx, pr, bt); rows.appendChild(row);
  });
}
function openShop(roomId) {
  if (shopOpen || invOpen || GK.mode !== 'play') return;
  if (!shopEl) buildShop();
  shopRoom = roomId; shopOpen = true; panelKind = 'shop'; keys.clear(); paintShop(); shopEl.style.display = 'flex'; setHover(-1);
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
}
function closeShop(noLock) {
  if (!shopOpen) return;
  shopOpen = false; panelKind = ''; for (const id of ['gkShop', 'gkRec', 'gkCraft', 'gkLoot']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } keys.clear(); if (!noLock) lockNow();
}
GK.openShop = openShop; GK.closeShop = closeShop;
// hover: ray from the screen centre against GK.merchantTargets (pushed by the rooms code, userData.roomId = CHEST_ROOMS id)
const ray = new THREE.Raycaster();
let hoverKind = '';
function setHover(id, kind) {
  if (id === hoverRoom && (kind || '') === hoverKind) return; hoverRoom = id; hoverKind = kind || '';
  const dot = $('dot'); if (dot) { dot.style.transition = 'transform .12s'; dot.style.transform = id >= 0 ? 'scale(3)' : ''; dot.style.opacity = id >= 0 ? 1 : ''; }
  if (!hoverTip) { hoverTip = document.createElement('div'); hoverTip.style.cssText = 'position:fixed;left:50%;top:calc(50% + 24px);transform:translateX(-50%);z-index:25;pointer-events:none;padding:4px 12px;border-radius:8px;background:rgba(10,8,6,.8);border:1px solid rgba(255,215,94,.55);color:' + GOLD + ';font:700 13px system-ui,sans-serif;letter-spacing:.08em;display:none;white-space:nowrap'; document.body.appendChild(hoverTip); }
  hoverTip.innerHTML = 'Press <b style="padding:1px 6px;border-radius:4px;background:#ffd75e;color:#1a1405">E</b> to ' + (hoverKind === 'r' ? 'recycle' : hoverKind === 'w' ? 'craft' : 'trade'); hoverTip.style.display = id >= 0 ? 'block' : 'none';
}
function merchantHoverTick() {
  const T = [...(GK.merchantTargets || []), ...(GK.stationTargets || []).filter(o => o && o.userData && (o.userData.station === 'recycler' || o.userData.station === 'workbench'))];
  lootPromptTick();
  if (GK.mode !== 'play' || invOpen || shopOpen || !inside || !spawned || !T.length) { if (hoverRoom >= 0) setHover(-1); return; }
  cam.updateMatrixWorld(); ray.setFromCamera({ x: 0, y: 0 }, cam); ray.far = 7;
  const hit = ray.intersectObjects(T, true)[0]; let id = -1, kind = '';
  if (hit) { for (let o = hit.object; o; o = o.parent) { const u = o.userData; if (!u || u.roomId == null) continue; id = u.roomId; kind = u.station === 'recycler' ? 'r' : u.station === 'workbench' ? 'w' : 'm'; break; } }
  setHover(id, kind);
}
GK.hover = () => ({ room: hoverRoom, kind: hoverKind });
function stationInteract() {   // E while looking at a merchant, recycler or workbench opens it; true if it did
  if (hoverRoom < 0 || invOpen || shopOpen || GK.mode !== 'play') return false;
  if (hoverKind === 'r') openStation('recycle', hoverRoom); else if (hoverKind === 'w') openStation('craft', hoverRoom); else openShop(hoverRoom);
  return true;
}
// ---------- materials (parts), recycler, workbench, loot piles, eating ----------
let panelKind = '', myParts = {}, knowOv = null, recSel = null, lootId = -1, lootOpen = false, lootPromptEl = null;
const PART_DRAW = {   // simple canvas glyphs for the 9 crafting parts, drawn in a 0..1 box
  wood: g => { g.fillStyle = '#8a5a2b'; rr(g, 0.1, 0.3, 0.7, 0.4, 0.08); g.fillStyle = '#c99a5b'; ell(g, 0.8, 0.5, 0.1, 0.2); g.strokeStyle = '#6b431c'; g.lineWidth = 0.025; g.beginPath(); g.arc(0.8, 0.5, 0.06, 0, 6.3); g.stroke(); g.fillStyle = '#6b431c'; g.fillRect(0.25, 0.4, 0.3, 0.025); g.fillRect(0.35, 0.55, 0.3, 0.025); },
  metal: g => { g.fillStyle = '#7d8791'; poly0(g, [[0.2, 0.35], [0.8, 0.35], [0.92, 0.7], [0.08, 0.7]]); g.fillStyle = '#c3ccd4'; poly0(g, [[0.2, 0.35], [0.8, 0.35], [0.76, 0.45], [0.24, 0.45]]); },
  leather: g => { g.fillStyle = '#9a6a3a'; poly0(g, [[0.15, 0.25], [0.4, 0.15], [0.6, 0.2], [0.85, 0.15], [0.9, 0.5], [0.8, 0.85], [0.5, 0.78], [0.2, 0.85], [0.1, 0.5]]); g.strokeStyle = '#d8b583'; g.lineWidth = 0.02; g.setLineDash([0.04, 0.04]); g.strokeRect(0.2, 0.28, 0.6, 0.45); g.setLineDash([]); },
  cloth: g => { g.fillStyle = '#4a74c9'; rr(g, 0.15, 0.3, 0.6, 0.4, 0.04); g.fillStyle = '#7ea2ee'; ell(g, 0.75, 0.5, 0.1, 0.2); g.fillStyle = '#3b5da8'; ell(g, 0.15, 0.5, 0.08, 0.2); g.strokeStyle = '#a9c2f5'; g.lineWidth = 0.02; g.beginPath(); g.arc(0.75, 0.5, 0.05, 0, 6.3); g.stroke(); },
  gold: g => { g.fillStyle = '#d9a514'; poly0(g, [[0.22, 0.35], [0.78, 0.35], [0.92, 0.7], [0.08, 0.7]]); g.fillStyle = '#ffe27a'; poly0(g, [[0.22, 0.35], [0.78, 0.35], [0.74, 0.46], [0.26, 0.46]]); },
  bone: g => { g.fillStyle = '#ece4d0'; g.save(); g.translate(0.5, 0.5); g.rotate(-0.6); rr(g, -0.32, -0.05, 0.64, 0.1, 0.03); for (const [x, y] of [[-0.34, -0.08], [-0.34, 0.08], [0.34, -0.08], [0.34, 0.08]]) { g.beginPath(); g.arc(x, y, 0.07, 0, 6.3); g.fill(); } g.restore(); },
  gem: g => { g.fillStyle = '#2fbf71'; poly0(g, [[0.5, 0.15], [0.85, 0.4], [0.5, 0.85], [0.15, 0.4]]); g.fillStyle = '#8ef0b8'; poly0(g, [[0.5, 0.15], [0.85, 0.4], [0.5, 0.4]]); g.fillStyle = '#1a8a50'; poly0(g, [[0.15, 0.4], [0.5, 0.4], [0.5, 0.85]]); },
  string: g => { g.fillStyle = '#6b4a2f'; rr(g, 0.28, 0.15, 0.44, 0.1, 0.03); rr(g, 0.28, 0.75, 0.44, 0.1, 0.03); g.fillStyle = '#e8dcc0'; g.fillRect(0.32, 0.25, 0.36, 0.5); g.strokeStyle = '#b8a888'; g.lineWidth = 0.02; for (let y = 0.3; y < 0.75; y += 0.08) { g.beginPath(); g.moveTo(0.32, y); g.lineTo(0.68, y + 0.04); g.stroke(); } },
  crystal: g => { g.fillStyle = '#58d6ff'; poly0(g, [[0.5, 0.08], [0.68, 0.35], [0.62, 0.88], [0.38, 0.88], [0.32, 0.35]]); g.fillStyle = '#c4f2ff'; poly0(g, [[0.5, 0.08], [0.68, 0.35], [0.5, 0.4]]); g.fillStyle = '#2a9fd0'; poly0(g, [[0.32, 0.35], [0.5, 0.4], [0.5, 0.88], [0.38, 0.88]]); },
};
function poly0(g, p) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); g.fill(); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill(); }
function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.3); g.fill(); }
function partIcon(key, size) {
  const c = document.createElement('canvas'), d = Math.min(window.devicePixelRatio || 1, 2); c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); g.scale(c.width, c.height); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 0.03; try { (PART_DRAW[key] || (() => {}))(g); } catch (e) {}
  return c;
}
const partList = () => (window.GKITEMS && window.GKITEMS.PARTS) || [];
const partName = k => { const p = partList().find(x => x.key === k); return p ? p.name : k; };
const partsTotal = () => Object.values(myParts).reduce((a, b) => a + (b | 0), 0);
const partRows = [];
function mkPartsRow() {   // a row of the 9 materials with counters (inventory, recycler and workbench each have one)
  const row = document.createElement('div'); row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;justify-content:center';
  for (const p of partList()) {
    const c = document.createElement('div'); c.dataset.part = p.key; c.title = p.name; c.style.cssText = 'display:flex;align-items:center;gap:3px;padding:2px 7px 2px 3px;border-radius:7px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.1);font:700 13px system-ui,sans-serif;font-variant-numeric:tabular-nums';
    c.appendChild(partIcon(p.key, 22)); const n = document.createElement('span'); n.className = 'n'; c.appendChild(n); row.appendChild(c);
  }
  partRows.push(row); paintParts(); return row;
}
function paintParts() { for (const row of partRows) for (const c of row.children) { const v = myParts[c.dataset.part] | 0, n = c.querySelector('.n'); if (n.textContent !== String(v)) { n.textContent = v; } c.style.opacity = v ? 1 : 0.45; } }
function setParts(p) {
  const before = myParts; myParts = Object.assign({}, p);
  paintParts(); const mine = actors.get(me); if (mine) showStats(null, mine.goblin);
  if (panelKind === 'craft') paintCraft(); if (panelKind === 'recycle') paintRec();
  for (const row of partRows) for (const c of row.children) if ((myParts[c.dataset.part] | 0) !== (before[c.dataset.part] | 0)) c.animate([{ transform: 'scale(1.35)', background: 'rgba(255,215,94,.4)' }, { transform: 'none' }], 350);
}
GK.getParts = () => Object.assign({}, myParts);
function panelRefresh() { if (panelKind === 'recycle') paintRec(); else if (panelKind === 'craft') paintCraft(); else if (panelKind === 'shop') paintShop(); }
function mkPanel(id, title, w) {
  ensureCss();
  const el = document.createElement('div'); el.id = id;
  el.style.cssText = 'position:fixed;inset:0;z-index:56;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,22,6,.5),rgba(0,0,0,.82));font-family:system-ui,sans-serif;color:#f2efe6;user-select:none';
  el.innerHTML = '<div style="width:min(' + w + 'px,94vw);max-height:94vh;overflow:auto;box-sizing:border-box;padding:16px 24px 16px;border-radius:16px;background:rgba(14,12,9,.88);border:1px solid rgba(255,215,94,.45);box-shadow:0 10px 60px rgba(0,0,0,.7)">'
    + '<div class="ttl" style="text-align:center;color:' + GOLD + ';font-weight:800;font-size:clamp(22px,3.6vw,30px);letter-spacing:.1em;text-shadow:0 0 22px rgba(255,200,60,.4)">' + title + '</div>'
    + '<div class="sub" style="text-align:center;margin:2px 0 10px;font-size:12px;letter-spacing:.14em;color:#b9b4ae"></div><div class="body"></div>'
    + '<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><div class="msg" style="flex:1;font-size:13px;color:#ff8a7a;min-height:1.3em"></div><button class="close" style="cursor:pointer;border:0;border-radius:8px;padding:9px 18px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 13px system-ui,sans-serif;letter-spacing:.1em">CLOSE (ESC)</button></div></div>';
  document.body.appendChild(el); el.querySelector('.close').onclick = () => closeShop();
  el.addEventListener('click', e => { if (e.target === el) closeShop(); });
  return { el, body: el.querySelector('.body'), sub: el.querySelector('.sub'), msg: el.querySelector('.msg'), ttl: el.querySelector('.ttl') };
}
function say(pn, text, good) { if (!pn || !pn.msg) return; pn.msg.textContent = text; pn.msg.style.color = good ? '#8be28b' : '#ff8a7a'; clearTimeout(pn.t); pn.t = setTimeout(() => { pn.msg.textContent = ''; }, 2600); }
const stationNames = { recycle: 'RECYCLER', craft: 'WORKBENCH' };
let recPn = null, craftPn = null, lootPn = null;
function openStation(kind, roomId) {
  if (shopOpen || invOpen || GK.mode !== 'play') return;
  shopOpen = true; panelKind = kind; shopRoom = roomId; keys.clear(); setHover(-1);
  if (kind === 'recycle') { if (!recPn) buildRec(); recSel = null; paintRec(); recPn.el.style.display = 'flex'; }
  else if (kind === 'craft') { if (!craftPn) buildCraft(); paintCraft(); craftPn.el.style.display = 'flex'; }
  else if (kind === 'loot') { if (!lootPn) buildLoot(); lootId = roomId; lootOpen = true; paintLoot(); lootPn.el.style.display = 'flex'; }
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
}
GK.openStation = openStation;
function stationFail(kind, why) {
  const pn = kind === 'recycle' ? recPn : craftPn;
  say(pn, { room: 'You are too far from the ' + (kind === 'recycle' ? 'recycler' : 'workbench'), item: 'That cannot be recycled', recipe: 'Unknown recipe', knowledge: 'Not enough knowledge', parts: 'Not enough materials', space: 'Your backpack is full' }[why] || 'Cannot do that');
  flashBad(...(why === 'item' && recSel ? [recSel] : []));
}
// ---- recycler ----
function buildRec() {
  recPn = mkPanel('gkRec', 'RECYCLER', 640); recPn.sub.textContent = 'BREAK WEAPONS DOWN INTO MATERIALS - FREE FOR EVERYONE';
  const main = document.createElement('div'); main.style.cssText = 'display:flex;gap:22px;flex-wrap:wrap;justify-content:center';
  const left = document.createElement('div'); left.innerHTML = '<div class="lab">PICK A WEAPON</div>';
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,54px);gap:6px';
  for (const id of ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'q0', 'q1', 'q2']) { const s = mkSlot(id, 54); s.dataset.rec = '1'; grid.appendChild(s); }
  left.appendChild(grid);
  recPn.prev = document.createElement('div'); recPn.prev.style.cssText = 'flex:1;min-width:200px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;text-align:center';
  main.append(left, recPn.prev);
  const mats = document.createElement('div'); mats.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)'; mats.innerHTML = '<div class="lab">YOUR MATERIALS</div>'; mats.appendChild(mkPartsRow());
  recPn.body.append(main, mats);
  recPn.el.addEventListener('click', e => {
    const s = e.target.closest && e.target.closest('.gks[data-rec]'); if (!s) return;
    const id = s.dataset.id, k = invGet(myInv, id);
    if (k == null) return;
    if (!(itemsData().recycleYield && itemsData().recycleYield(k))) { flashBad(id); say(recPn, 'Only weapons can be recycled'); return; }
    recSel = id; paintRec();
  });
}
function paintRec() {
  if (!recPn) return;
  for (const id of ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'q0', 'q1', 'q2']) for (const el of slotEls[id]) if (el.dataset.rec) {
    const k = invGet(myInv, id), ok = k != null && !!(itemsData().recycleYield && itemsData().recycleYield(k));
    paintSlot(el, id); el.style.opacity = k == null || ok ? 1 : 0.3; el.style.outline = recSel === id ? '2px solid ' + GOLD : 'none'; el.title = k != null && !ok ? 'cannot recycle' : '';
  }
  if (recSel && invGet(myInv, recSel) == null) recSel = null;
  const k = recSel ? invGet(myInv, recSel) : null, y = k && itemsData().recycleYield(k), pv = recPn.prev; pv.textContent = '';
  if (!k) { pv.innerHTML = '<div style="color:#8d8880;font-size:14px;line-height:1.5">Select a weapon from your backpack or quick slots<br>to see which materials it yields.<br><span style="font-size:12px">(armour and brains cannot be recycled)</span></div>'; return; }
  const it = infoOf(k), head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:10px'; head.appendChild(mkIcon(k, 46));
  const t = document.createElement('div'); t.style.textAlign = 'left'; t.innerHTML = '<b style="color:' + (TIER_COL[it.tier] || '#fff') + ';font-size:16px">' + it.name + '</b><div style="font-size:12px;color:#aaa59d">' + statTxt(k) + '</div>'; head.appendChild(t);
  const get = document.createElement('div'); get.className = 'yield'; get.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;min-height:34px';
  for (const p in y) { const c = document.createElement('div'); c.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 9px 3px 4px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,215,94,.3);font-weight:800'; c.dataset.part = p; c.appendChild(partIcon(p, 26)); c.append('+' + y[p] + ' ' + partName(p)); get.appendChild(c); }
  const bt = document.createElement('button'); bt.textContent = 'RECYCLE'; bt.id = 'recGo'; bt.style.cssText = 'width:100%;padding:14px 10px;border:0;border-radius:10px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 18px system-ui,sans-serif;letter-spacing:.12em;cursor:pointer';
  bt.onclick = () => { net.send({ recycle: recSel }); };
  pv.append(head, Object.assign(document.createElement('div'), { className: 'lab', textContent: 'YOU GET' }), get, bt);
}
function recycledFx(r) {
  if (!recPn || panelKind !== 'recycle') return;
  say(recPn, 'Recycled ' + itemName(r.key) + ': ' + Object.keys(r.parts).map(p => '+' + r.parts[p] + ' ' + partName(p)).join(', '), true);
  const from = recPn.prev.getBoundingClientRect(), tgt = {}; for (const c of partRows[partRows.length - 1] ? partRows[partRows.length - 1].children : []) tgt[c.dataset.part] = c.getBoundingClientRect();
  Object.keys(r.parts).forEach((p, i) => {
    const f = partIcon(p, 30); f.style.cssText += ';position:fixed;z-index:90;pointer-events:none;left:' + (from.x + from.width / 2 - 15) + 'px;top:' + (from.y + from.height / 2 - 15) + 'px';
    document.body.appendChild(f); const t = tgt[p] || from, dx = t.x + 11 - (from.x + from.width / 2), dy = t.y + 11 - (from.y + from.height / 2);
    const a = f.animate([{ transform: 'scale(.4)', opacity: 0 }, { transform: 'translate(' + dx * 0.2 + 'px,' + (dy * 0.2 - 40) + 'px) scale(1.4)', opacity: 1, offset: 0.3 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.8)', opacity: 0.9 }], { duration: 650, delay: i * 90, easing: 'ease-in', fill: 'both' });
    a.onfinish = () => f.remove();
  });
}
// ---- workbench ----
function buildCraft() {
  craftPn = mkPanel('gkCraft', 'WORKBENCH', 600); craftPn.sub.textContent = 'CRAFT ITEMS FROM MATERIALS - FREE FOR EVERYONE';
  craftPn.list = document.createElement('div'); craftPn.list.style.cssText = 'display:flex;flex-direction:column;gap:7px';
  const mats = document.createElement('div'); mats.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)'; mats.innerHTML = '<div class="lab">YOUR MATERIALS</div>'; mats.appendChild(mkPartsRow());
  const hint = document.createElement('div'); hint.style.cssText = 'text-align:center;margin-top:10px;font-size:12px;color:#8d8880'; hint.textContent = 'More recipes unlock through the Knowledge Tree';
  craftPn.body.append(craftPn.list, mats, hint);
}
function myKnowledge() { const mine = actors.get(me); return invStats(myInv, mine ? mine.goblin : 0, knowOv).knowledge; }
function paintCraft() {
  if (!craftPn) return; const list = craftPn.list; list.textContent = '';
  const full = myInv.backpack.indexOf(null) < 0, know = myKnowledge(), recipes = (itemsData().RECIPES || []);
  for (const r of recipes) {
    const it = infoOf(r.out) || { name: r.out }, locked = (r.needs || 0) > know;
    const lacking = Object.keys(r.cost).filter(p => (myParts[p] | 0) < r.cost[p]);
    const reason = locked ? 'Needs ' + r.needs + ' knowledge (Knowledge Tree tier ' + r.tier + ')' : lacking.length ? 'Not enough ' + lacking.map(partName).join(', ') : full ? 'Your backpack is full' : '';
    const row = document.createElement('div'); row.dataset.recipe = r.id; row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,215,94,.2)' + (locked ? ';opacity:.5' : '');
    const ic = document.createElement('div'); ic.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(0,0,0,.4);flex:none'; ic.appendChild(mkIcon(r.out, 40));
    const tx = document.createElement('div'); tx.style.cssText = 'flex:1;min-width:0'; tx.innerHTML = '<div style="font-weight:700;font-size:15px;color:' + (TIER_COL[it.tier] || '#f2efe6') + '">' + it.name + '</div><div style="font-size:12px;color:#aaa59d">' + (locked ? '&#128274; ' + reason : statTxt(r.out)) + '</div>';
    const cost = document.createElement('div'); cost.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:210px';
    for (const p in r.cost) { const ok = (myParts[p] | 0) >= r.cost[p], c = document.createElement('div'); c.title = partName(p); c.style.cssText = 'display:flex;align-items:center;gap:2px;font:800 13px system-ui,sans-serif;color:' + (ok ? '#8be28b' : '#ff6a5a'); c.appendChild(partIcon(p, 20)); c.append(' ' + (myParts[p] | 0) + '/' + r.cost[p]); cost.appendChild(c); }
    const bt = document.createElement('button'); const can = !reason; bt.textContent = locked ? 'LOCKED' : 'CRAFT'; bt.disabled = !can; bt.title = reason;
    bt.style.cssText = 'width:84px;padding:8px 0;border-radius:8px;font:800 12px system-ui,sans-serif;letter-spacing:.1em;cursor:' + (can ? 'pointer' : 'not-allowed') + ';' + (can ? 'border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405' : 'border:1px solid rgba(255,90,74,.6);background:rgba(120,20,14,.35);color:#ff8a7a');
    bt.onclick = () => { if (can) net.send({ craft: r.id }); else say(craftPn, reason); };
    row.append(ic, tx, cost, bt); list.appendChild(row);
  }
  if (!recipes.length) list.innerHTML = '<div style="text-align:center;color:#8d8880;padding:20px">No recipes known.</div>';
}
function craftedFx(c) {
  if (!craftPn || panelKind !== 'craft') return;
  say(craftPn, 'Crafted ' + itemName(c.key) + ' - added to your backpack', true);
  const row = craftPn.list.querySelector('[data-recipe="' + c.recipe + '"]');
  if (row) { const f = mkIcon(c.key, 40), r = row.getBoundingClientRect(); f.style.cssText += ';position:fixed;z-index:90;pointer-events:none;left:' + (r.x + 14) + 'px;top:' + (r.y + 4) + 'px'; document.body.appendChild(f); const a = f.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'translateY(-50px) scale(1.7)', opacity: 1, offset: 0.4 }, { transform: 'translateY(-90px) scale(.5)', opacity: 0 }], 800); a.onfinish = () => f.remove(); row.animate([{ background: 'rgba(80,200,90,.35)' }, { background: 'rgba(0,0,0,.35)' }], 700); }
  try { GK.workbenchFeedback && GK.workbenchFeedback(shopRoom); } catch (e) {}
}
// ---- loot piles ----
function nearestPile() {
  let best = null, bd = 2.5; for (const d of dropsList) { const dd = Math.hypot(P.x - d.x, P.z - d.z); if (dd <= bd) { bd = dd; best = d; } } return best;
}
function lootPromptTick() {
  const near = GK.mode === 'play' && !invOpen && !shopOpen && spawned ? nearestPile() : null;
  if (!lootPromptEl) { lootPromptEl = document.createElement('div'); lootPromptEl.style.cssText = 'position:fixed;left:50%;top:62%;transform:translateX(-50%);z-index:25;pointer-events:none;padding:5px 14px;border-radius:8px;background:rgba(10,8,6,.8);border:1px solid rgba(255,215,94,.6);color:' + GOLD + ';font:700 14px system-ui,sans-serif;letter-spacing:.08em;display:none'; lootPromptEl.innerHTML = 'Press <b style="padding:1px 6px;border-radius:4px;background:#ffd75e;color:#1a1405">E</b> to loot'; document.body.appendChild(lootPromptEl); }
  lootPromptEl.style.display = near ? 'block' : 'none';
}
GK.nearestPile = nearestPile; GK.drops = () => dropsList;
function buildLoot() { lootPn = mkPanel('gkLoot', 'LOOT', 560); lootPn.sub.textContent = 'A DEAD GOBLIN\'S BAG'; lootPn.list = document.createElement('div'); lootPn.list.style.cssText = 'display:flex;flex-direction:column;gap:7px'; lootPn.body.appendChild(lootPn.list); }
function paintLoot() {
  if (!lootPn) return; const d = dropsList.find(x => x.id === lootId);
  if (!d || !d.items.length) { if (panelKind === 'loot') closeShop(); return; }
  const list = lootPn.list; list.textContent = ''; const full = myInv.backpack.indexOf(null) < 0;
  d.items.forEach((k, idx) => {
    const it = infoOf(k) || { name: String(k) }, row = document.createElement('div'); row.dataset.idx = idx; row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,215,94,.2)';
    const ic = document.createElement('div'); ic.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(0,0,0,.4);flex:none'; ic.appendChild(mkIcon(k, 40));
    const tx = document.createElement('div'); tx.style.cssText = 'flex:1;min-width:0'; tx.innerHTML = '<div style="font-weight:700;font-size:15px;color:' + (TIER_COL[it.tier] || '#f2efe6') + '">' + it.name + '</div><div style="font-size:12px;color:#aaa59d">' + (it.desc && it.family === 'brain' ? it.desc : statTxt(k)) + '</div>';
    row.append(ic, tx);
    const mkBtn = (txt, mode, ok, gold) => { const b = document.createElement('button'); b.textContent = txt; b.disabled = !ok; b.dataset.mode = mode; b.style.cssText = 'padding:8px 14px;border-radius:8px;font:800 12px system-ui,sans-serif;letter-spacing:.1em;cursor:' + (ok ? 'pointer' : 'not-allowed') + ';' + (ok ? (gold ? 'border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405' : 'border:1px solid #8be28b;background:rgba(40,120,50,.35);color:#b8f5b8') : 'border:1px solid rgba(255,90,74,.5);background:rgba(120,20,14,.3);color:#ff8a7a'); b.onclick = () => { if (ok) net.send({ loot: [d.id, idx, mode, k] }); else say(lootPn, 'Your backpack is full'); }; return b; };
    if (it.family === 'brain') row.appendChild(mkBtn('EAT', 'eat', true, false));
    row.appendChild(mkBtn(full ? 'PACK FULL' : 'TAKE', 'take', !full, true)); list.appendChild(row);
  });
  const all = document.createElement('button'); all.id = 'lootAll'; all.textContent = 'TAKE ALL'; all.style.cssText = 'margin-top:4px;padding:11px;border:0;border-radius:10px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 14px system-ui,sans-serif;letter-spacing:.12em;cursor:pointer';
  all.onclick = () => { const free = myInv.backpack.filter(k => k == null).length; d.items.slice(0, free).forEach(k => net.send({ loot: [d.id, 0, 'take', k] })); if (d.items.length > free) say(lootPn, 'Not everything fits in your backpack'); };   // each take shifts the next item to index 0
  list.appendChild(all);
}
let toastEl = null;
function toastMsg(text, good) {   // short message in the middle of the screen
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);padding:8px 16px;border-radius:8px;background:rgba(10,10,14,.75);font:600 16px system-ui,sans-serif;pointer-events:none;transition:opacity .4s;z-index:50'; document.body.appendChild(toastEl); }
  toastEl.textContent = text; toastEl.style.color = good ? '#ffd76a' : '#ff8a7a'; toastEl.style.opacity = '1';
  clearTimeout(toastEl.t); toastEl.t = setTimeout(() => { toastEl.style.opacity = '0'; }, 1800);
}
function lootFailFx(why) { if (panelKind === 'loot') say(lootPn, { range: 'Too far from the bag', space: 'Your backpack is full', item: 'Someone took that first' }[why] || 'Cannot loot that'); }
GK.openLoot = () => { const d = nearestPile(); if (d) openStation('loot', d.id); return !!d; };
// ---- eating ----
function eatSlot(id) {
  const k = invGet(myInv, id); if (k == null || !(infoOf(k) && infoOf(k).family === 'brain')) return false;
  invSet(myInv, id, null); if (held === id) held = null; net.send({ eat: id }); paintAll(); return true;
}
function ateFx(a) {
  knowOv = a.knowledge; const mine = actors.get(me); if (mine) showStats(null, mine.goblin); paintStatCol();
  const f = document.createElement('div'); f.textContent = '+' + fmtN(a.gain) + ' knowledge';
  f.style.cssText = 'position:fixed;left:50%;top:44%;transform:translateX(-50%);z-index:90;pointer-events:none;color:#8be28b;font:800 26px system-ui,sans-serif;text-shadow:0 2px 12px #000,0 0 18px rgba(80,220,100,.7)';
  document.body.appendChild(f); const an = f.animate([{ opacity: 0, transform: 'translate(-50%,10px)' }, { opacity: 1, transform: 'translate(-50%,-10px)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-70px)' }], 1600); an.onfinish = () => f.remove();
  for (const e of document.querySelectorAll('#hudKnow,.knowv')) e.animate([{ color: '#6dff7a', transform: 'scale(1.4)' }, { transform: 'none' }], 900);
}
GK.eat = eatSlot;
function connect(opts) { if (netReal) return; GK.charId = opts && opts.charId != null ? opts.charId : null; GK.wins = opts && opts.wins ? opts.wins | 0 : 0; netReal = makeNet(opts || {}); netReal.onmessage = handleMsg; }
if (window.GK_OFFLINE) { $('rr').onclick = e => { net.send({ reroll: 1 }); e.stopPropagation(); }; $('rr').onpointerdown = e => e.stopPropagation(); }

// ---------- input ----------
const keys = new Set(); let inside = true;
addEventListener('keydown', e => {
  if (e.code === 'KeyK' && !e.repeat && window.GK_OFFLINE && GK.mode === 'play' && actors.get(me)) { // demo only: K = die, to see the loot drop and the death screen
    const r = netReal && netReal.demoDie && netReal.demoDie(); showDeathScreen(r || { items: invAll(myInv) });
  }
  keys.add(e.code); if (e.code === 'KeyV' && !e.repeat) inside = !inside; });
document.addEventListener('visibilitychange', () => keys.clear());
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const canvas = renderer.domElement;
const lockOk = () => document.pointerLockElement === canvas;

// pointer lock with raw (unaccelerated) mouse input where the browser supports it, so the view moves 1:1 with the mouse
let lockRefused = false;
const requestLock = () => {
  if (lockOk()) return;
  const plain = () => { try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => { lockRefused = true; }); } catch (e) { lockRefused = true; } };
  try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(plain); } catch (e) { plain(); }
};
document.addEventListener('pointerlockchange', () => { if (lockOk()) lockRefused = false; });
document.addEventListener('pointerlockerror', () => { lockRefused = true; });
canvas.addEventListener('mousedown', requestLock);
// look follows the mouse, no button held: raw deltas while the pointer is locked; only if the browser refuses the lock
// (embedded views, some browsers) does plain cursor movement turn, with the left/right screen edge to keep turning
let mouseX = -1, edgeT = 0;
const freeLook = () => GK.mode === 'play' && !invOpen && !shopOpen;
addEventListener('mousemove', e => {
  mouseX = e.clientX;
  if (!freeLook() || (!lockOk() && !lockRefused)) return;
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;   // drop the jump some browsers report when the lock engages
  const k = 0.0022 * GK.settings.sens; P.yaw = wrapPi(P.yaw - e.movementX * k); P.pitch = clamp(P.pitch - e.movementY * k * (GK.settings.invertY ? -1 : 1), -1.45, 1.45);
});
// in play the cursor is hidden (only the centre dot shows); if the lock was dropped (Esc), a click anywhere resumes
let resumeEl = null;
addEventListener('mousedown', e => { if (freeLook() && !lockOk() && !lockRefused && e.target !== canvas) requestLock(); });
function cursorTick() {
  const play = freeLook() && !document.body.classList.contains('menu');
  document.body.classList.toggle('nocur', play);
  const show = play && !lockOk() && !lockRefused;
  if (show && !resumeEl) { resumeEl = document.createElement('div'); resumeEl.textContent = 'Click to resume'; resumeEl.style.cssText = 'position:fixed;left:50%;top:58%;transform:translateX(-50%);padding:8px 18px;border-radius:8px;background:rgba(10,10,14,.7);color:#f2efe6;font:600 15px system-ui,sans-serif;letter-spacing:.06em;pointer-events:none;z-index:40'; document.body.appendChild(resumeEl); }
  if (resumeEl) resumeEl.style.display = show ? 'block' : 'none';
}
document.addEventListener('mouseout', e => { if (!e.relatedTarget) mouseX = -1; });
addEventListener('blur', () => { mouseX = -1; });
(function edgeTurn(t) {
  const dt = Math.min((t - (edgeT || t)) / 1000, 0.05); edgeT = t;
  cursorTick();
  if (!lockOk() && lockRefused && freeLook() && mouseX >= 0) {
    const m = innerWidth * 0.06, d = mouseX < m ? 1 : mouseX > innerWidth - m ? -1 : 0;
    if (d) P.yaw = wrapPi(P.yaw + d * 2.4 * GK.settings.sens * dt);
  }
  requestAnimationFrame(edgeTurn);
})(0);
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.2, 2.8);   // strength, radius, threshold (HDR, linear)
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
          vec2 o = d * r2 * 0.006;   // tiny chromatic aberration, zero at the centre
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
  const addMotes = (cx, cz, hx, hz, n, c) => { for (let i = 0; i < n; i++) { pos.push(cx + rnd(-hx, hx), 0, cz + rnd(-hz, hz)); seed.push(Math.random(), rnd(0.4, 1), rnd(0.015, 0.035), Math.random()); col.push(...c); } };
  for (let i = 0; i < 9; i++) { const [cx, cz] = rc(i); addMotes(cx, cz, roomW(i) / 2 - 1, roomD(i) / 2 - 1, Math.round(38 * roomW(i) * roomD(i) / 144), i === WORLD.VAULT ? [0.9, 0.78, 0.5] : [0.62, 0.6, 0.58]); }   // dust scales with the room area (the vault gets golden dust)
  for (const cr of CHEST_ROOMS) addMotes(cr.cx, cr.cz, 3, 3, 11, [1.0, 0.82, 0.5]);
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
        gl_PointSize = clamp(aSeed.z * projectionMatrix[1][1] * uHeight * 0.5 / max(-mv.z, 0.1), 1.5, 8.0);
        vCol = aCol; vA = smoothstep(0.0, 0.12, hy) * smoothstep(1.0, 0.88, hy) * smoothstep(1.5, 3.5, -mv.z) * 0.5;
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
  for (const [ox, oz] of WORLD.panelOffsets(WORLD.VAULT)) addShaft(0, 0, 0, ox, oz, 2.6, 1.2);   // shafts under the vault's ceiling panels
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
  if (GK.mode !== 'play' && GK.mode !== 'dead' && GK.mode !== 'win') { GK.menu && GK.menu.render(now, dt); requestAnimationFrame(frame); return; }
  panelTick();
  const mine = actors.get(me);
  // my movement
  if (mine && spawned && GK.mode === 'play' && !invOpen && !shopOpen) {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sp = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.5 : 4.6) * (0.85 + 0.15 * SCALE[mine.goblin]);
    let mx = -Math.sin(P.yaw) * f + Math.cos(P.yaw) * s, mz = -Math.cos(P.yaw) * f - Math.sin(P.yaw) * s;
    const len = Math.hypot(mx, mz) || 1; mx = mx / len * sp * dt * (f || s ? 1 : 0); mz = mz / len * sp * dt * (f || s ? 1 : 0);
    const ox = P.x, oz = P.z;
    if (!blocked(P.x + mx, P.z)) P.x += mx;
    if (!blocked(P.x, P.z + mz)) P.z += mz;
    run.dist += Math.hypot(P.x - ox, P.z - oz);
    P.speed += (Math.hypot(P.x - ox, P.z - oz) / dt - P.speed) * Math.min(1, dt * 12);
    mine.x = P.x; mine.z = P.z; mine.yaw = P.yaw; mine.speed = P.speed;
    sendT += dt; if (sendT > 0.066) { sendT = 0; net.send({ m: [+P.x.toFixed(2), +P.z.toFixed(2), +P.yaw.toFixed(3)] }); }
  }
  // doors
  for (const d of doors) {
    const near = d.open, prev = d.p;   // doors open/close from the round state (GK.setDoorsOpen)
    const vault = !d.slide, dur = vault ? 2.4 : 0.8;
    d.p = clamp(d.p + (near ? 1 : -1) * dt / dur, 0, 1);
    if (prev <= 0.0005 && d.p > prev) { doorBurst(d); d.flash = 0.9; }
    d.flash = Math.max(0, d.flash - dt);
    if (d.slide) d.leaf.position.x = d.p * (DW + 0.15);
    else {
      const bolt = Math.min(d.p / 0.3, 1), swing = Math.max((d.p - 0.3) / 0.7, 0);
      d.leaf.rotation.y = -d.sgn * swing * 1.75;
      d.wheels.forEach(w => w.rotation.z = d.p * Math.PI * 3);
      d.rings.forEach(w => w.rotation.z = -d.p * Math.PI * 2);
      d.bolts.forEach(b => b.position.x = b.userData.x0 + b.userData.sx * 0.38 * (1 - bolt));
      const lf = Math.max(0, 1 - d.p / 0.25); d.laserM.opacity = 0.5 * lf * (0.8 + 0.2 * Math.sin(t * 40));
      d.lasers.forEach(l => l.visible = lf > 0.01);
      d.scan.forEach(l => { l.visible = lf > 0.01; l.position.y = 0.4 + (Math.sin(t * 1.6) * 0.5 + 0.5) * (d.dh - 0.8); });
    }
    const moving = d.p > 0.02 && d.p < 0.98, flash = d.flash > 0, hex = flash ? 0x20ff60 : moving ? 0xffa020 : d.p >= 0.98 ? 0x20ff60 : 0xff1a1a;
    d.light.emissive.setHex(hex);
    d.light.emissiveIntensity = 2.6 * (flash ? 2.5 + 1.5 * Math.sin(t * 30) : moving ? 1.5 + Math.sin(t * 14) : 2 + 0.4 * Math.sin(t * 2.4 + d.light.id));   // HDR: the status lamps feed the bloom, gentle idle pulse
    d.halo.color.setHex(hex); d.halo.opacity = (flash ? 0.95 : moving ? 0.55 + 0.3 * Math.sin(t * 14) : 0.6 + 0.1 * Math.sin(t * 2 + d.id)) ;
    d.ledM.color.setHex(vault && !flash && !moving && d.p < 0.98 ? 0xff2a1a : hex === 0xff1a1a ? 0x35e6ff : hex);
    const bt = moving ? 0.9 : vault ? 0.55 : 0, bc = moving ? 0xffa020 : d.p >= 0.98 ? 0x20ff60 : 0xff2010;
    d.beamM.opacity += (bt - d.beamM.opacity) * Math.min(1, dt * 8); d.beamM.color.setHex(bc);
    d.domeM.emissive.setHex(bc); d.domeM.emissiveIntensity = moving ? 2.5 : vault ? 1.4 : 0.35;
    const rs = moving ? 10 : vault ? 1.8 : 0;
    if (rs) d.rots.forEach(r => r.rotation.z += dt * rs * r.userData.dir);
    if (d.eyeM) d.eyeM.opacity = 0.65 + 0.3 * Math.sin(t * 2.4 + d.id);
  }
  dfxUpdate(dt);
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
    const dist = innerHeight > innerWidth ? 80 : 60;   // overview orbit radius (the world is +-29 m with the chest rooms)
    cam.fov = 50; cam.position.set(Math.sin(orbit) * dist, dist * 0.7, Math.cos(orbit) * dist); cam.lookAt(0, 0, 0);
  }
  cam.updateProjectionMatrix();
  merchantHoverTick();
  renderWorld(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const lockNow = requestLock;
GK.renderer = renderer; GK.scene = scene; GK.build = buildGoblin; GK.NAMES = NAMES; GK.SCALE = SCALE; GK.glowTex = glowTex; GK.textTex = textTex;
GK.start = (opts) => { connect(opts); return new Promise(res => { if (assigned) res(actors.get(me).goblin); else { const prev = GK.onAssigned; GK.onAssigned = g => { GK.onAssigned = prev; res(g); }; } }); }; // connects and resolves with my goblin type
GK.enter = () => { run.t0 = performance.now(); run.n0 = GK.roundInfo ? GK.roundInfo().n : 0; run.dist = 0; GK.mode = 'play'; net.send({ enter: 1 }); GK.showStats(); GK.applySettings(); if (window.GK_OFFLINE) $('rr').style.display = 'block'; lockNow(); };   // call from a click; 'enter' starts the match's round timer
GK.applySettings = () => { renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * GK.settings.scale); resize(); };
GK.doors = doors;
GK.fxDebug = { get fx() { return fx; }, cam };   // test hook: post-effects state and the world camera
GK.setDoorsOpen = ids => { const set = new Set(ids); doors.forEach(d => d.open = set.has(d.id)); };   // ids of doors that are open right now
GK.skipMenu = () => {   // for tests: straight into the rooms, with the title menu hidden as a real Enter would
  const mn = $('menu'); if (mn) mn.classList.add('gone'); document.body.classList.remove('menu');
  GK.mode = 'play'; GK.start().then(() => { net.send({ enter: 1 }); GK.showStats(); });
};
if (window.GKART) requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => GKART.bake(renderer), 600)));   // ITEMART: bake the inventory icons in small batches once the first frame is up
window.__gk = { P, actors, doors, info: renderer.info, scene, setView(x, z, yaw, pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch || 0; spawned = true; }, toggleOverview() { inside = !inside; }, build: buildGoblin };
})();

// Goblin King client. Needs a global THREE (r158+). Set window.GK_OFFLINE = true to run with simulated players.
if (/[?&]offline=1/.test(location.search)) window.GK_OFFLINE = true;   // demo/test: simulated players, no server
(() => {
const THREE = window.THREE;
const NAMES = ['Small Goblin', 'Goblin', 'Big Goblin', 'Goblin Wizard', 'GOBLIN KING'];
const SCALE = [0.75, 1, 1.3, 1.1, 1.2];
// Attack damage comes from the starting weapon and health from the starting armour (the server holds the real values, this is the offline/default display)
const GEAR = [{ weapon: 'Dagger', armor: 'Ragged Tunic' }, { weapon: 'Nailed Club', armor: 'Studded Vest' }, { weapon: 'Spiked Mace', armor: 'Warlord Harness' }, { weapon: 'Gnarled Staff', armor: 'Starry Robe' }, { weapon: 'Royal Scepter', armor: 'Royal Mantle' }];
const STATS = [{ knowledge: 60, attack: 10, health: 40 }, { knowledge: 40, attack: 15, health: 50 }, { knowledge: 30, attack: 20, health: 80 }, { knowledge: 80, attack: 0, health: 60 }, { knowledge: 40, attack: 20, health: 100 }];
// GOBTYPES: the seven newer goblin types (ids 5-11) are appended from items.js GOBLINS; ids 0-4 above never change (saved-character tokens store them)
const GOB_TAGY = [1.95, 1.95, 1.95, 2.85, 2.55, 2.3, 2.0, 2.25, 2.45, 2.3, 2.05, 2.2];   // name-tag height per type (above hats, crowns, horns, candles)
(() => { const G = window.GKITEMS; if (!G || !G.GOBLINS) return; for (const g of G.GOBLINS.slice(NAMES.length)) { const i = NAMES.length, s = G.START[i], w = G.ITEMS[s.weapon], a = G.ITEMS[s.armor]; NAMES.push(g.name); SCALE.push(g.size); GEAR.push({ weapon: w.name, armor: a.name }); STATS.push({ knowledge: G.KNOWLEDGE[i], attack: w.attack, health: G.goblinHp(i, a.health) }); } })();
const WORLD = window.GKWORLD;              // shared geometry (world.js, also used by server.js): room sizes, THE VAULT (middle room, bigger), chest rooms, helpers
const { H, T, V: VSIZE, rc, roomAt, roomW, roomD } = WORLD;   // ceiling height, wall thickness, vault size, room centre / point -> room / per-room width and depth
const DW = 4, DHT = 4.4, VW = 4.9, VH = 5; // secure door and vault door openings
const RAD = 0.45;                          // player radius
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const $ = id => document.getElementById(id);
const GK = window.GK = window.GK || {};
GK.mode = 'menu';                         // 'menu' (title, settings, wheel) or 'play'
GK.settings = Object.assign({ sens: 1, fov: 75, scale: 1, invertY: false, tags: true, fx: true, gfx: 'high' }, GK.settings || {});
// PERF2-BEGIN client performance pass 2 (docs/reports/perf-2.md): shared state. ?perf2=0 switches the whole pass off, for before / after measurements.
const PERF2_ON = !/[?&]perf2=0/.test(location.search);
const perf2Lod = { meshes: new WeakMap(), hi: new Map(), geo: new Map(), queue: [], queued: new Set(), timer: 0 };   // goblin level of detail: baked part mesh -> cache key, full-detail and simplified geometries
// PERF2-END
const CS = WORLD.CS;                      // chest room size
const WEAPONS = ['Rusty Sword', 'Battle Axe', 'War Spear', 'Spiked Mace', 'Short Bow', 'Dagger'];
// 16 attached rooms behind the perimeter cells (world.js CHEST, clockwise from the NW corner): even ids are HOMES (10x10), odd ids are loot rooms (8x8).
// Loot room types (the server sends the layout): 'chest' (a chest with a random weapon), 'mystery' (question mark, contents decided later), 'merchant' (merchant goblin behind glass,
// knowledge tree, workbench, recycler), 'forge' (Master Forge: a workbench) and 'grand' (Grand Recycler). Until the layout arrives homes show as homes and loot rooms as chest rooms.
const LAYOUT_TYPES = ['home', 'forge', 'grand', 'chest', 'mystery', 'merchant'];
const CHEST_ROOMS = [];
const layoutHooks = [];   // functions called with the type array when the match's random room layout is known (room interiors, door emblems, maps and panels are built/updated from it)
for (const c of WORLD.CHEST) CHEST_ROOMS.push({ ...c, type: c.home ? 'home' : 'chest' });   // geometry (cx, cz, wallX, wallZ, dx, dz, size, home) comes from world.js
function applyLayout(types, mystery) {   // types: 16 strings in CHEST_ROOMS order; mystery: 16 entries, null or the contents of that mystery room (GKITEMS.randomMystery)
  if (!Array.isArray(types) || types.length !== CHEST_ROOMS.length || !types.every(t => LAYOUT_TYPES.includes(t))) return;
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
// PERF: three renders transparent double-sided materials in two passes and sets needsUpdate on both, so every such object re-hashed its shader program key twice per frame. Materials that do not write depth do not need the split.
Object.defineProperty(THREE.Material.prototype, 'forceSinglePass', { get() { return this.depthWrite === false; }, set() {}, configurable: true });
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
  try { GKVFX.update(dt); } catch (e) {} // VFX
}
try { GKVFX.init(THREE, scene, cam, renderer, () => GK.settings.gfx); } catch (e) { console.error('vfx init failed', e); } // VFX (vfx.js: pooled particles, see its header for the API)
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
let hatchWoodM = null, hatchIronM = null;
function wall(px, pz, rot, kind, len) {   // len: length of the room boundary this wall closes (the wall is T longer so it overlaps the corners)
  const g = new THREE.Group(); g.position.set(px, 0, pz); g.rotation.y = rot; scene.add(g);
  const L = len + T, dw = kind === 'vault' ? VW : DW, dh = kind === 'vault' ? VH : DHT;
  const solid = (x0, x1, y0, y1) => bx(g, x1 - x0, y1 - y0, T, (x0 + x1) / 2, (y0 + y1) / 2, 0, plaster);
  const base = (x0, x1) => bx(g, x1 - x0, 0.2, T + 0.1, (x0 + x1) / 2, 0.1, 0, trimM);
  if (!kind) { solid(-L / 2, L / 2, 0, H); base(-L / 2, L / 2); addRect(px, pz, rot, -L / 2, L / 2, -T / 2, T / 2); return; }
  solid(-L / 2, -dw / 2, 0, H); solid(dw / 2, L / 2, 0, H); solid(-dw / 2, dw / 2, dh, H);
  base(-L / 2, -dw / 2 - 0.3); base(dw / 2 + 0.3, L / 2);
  addRect(px, pz, rot, -L / 2, -dw / 2, -T / 2, T / 2); addRect(px, pz, rot, dw / 2, L / 2, -T / 2, T / 2);
  if (kind === 'hatch') {   // 5x5: a home's doorway is an open archway with no leaf (always passable; task C adds the owner's name banner). A door record keeps the id order.
    const wood = hatchWoodM || (hatchWoodM = M(0x6b4a2e, { roughness: 0.8 }));
    for (const s of [-1, 1]) bx(g, 0.3, dh + 0.1, T + 0.2, s * (dw / 2 + 0.15), (dh + 0.1) / 2, 0, wood, 1);
    bx(g, dw + 0.9, 0.34, T + 0.26, 0, dh + 0.12, 0, wood, 1);
    const d = { id: doors.length, open: true, hatch: true, kind, slide: false, p: 1, gx: px, gz: pz, dw, dh, ax: [Math.cos(rot), -Math.sin(rot)], az: [Math.sin(rot), Math.cos(rot)], flash: 0, leaf: new THREE.Group(), wheels: [], rings: [], bolts: [], rots: [], dyn: [], scan: [], lasers: [], blocker: null };
    // HOME PHASE (docs/reports/home-phase.md): in round 1 an iron grille closes the archway (d.locked); it rises into the lintel when the arena opens. Open = d.p 1 (the grille is hidden, the blocker is off).
    const iron = hatchIronM || (hatchIronM = M(0x2a2a2e, { roughness: 0.45, metalness: 0.85 })), bars = new THREE.Group(), nb = 7;
    for (let i = 0; i < nb; i++) bx(bars, 0.07, dh - 0.04, 0.07, -dw / 2 + 0.12 + i * (dw - 0.24) / (nb - 1), (dh - 0.04) / 2, 0, iron, 1);
    for (const y of [0.55, dh * 0.62]) bx(bars, dw - 0.08, 0.1, 0.11, 0, y, 0, iron, 1);
    bars.position.y = dh + 0.05; bars.visible = false; d.leaf.add(bars); d.bars = bars; d.locked = false;
    d.blocker = { door: d }; addRect(px, pz, rot, -dw / 2, dw / 2, -T / 2, T / 2); Object.assign(d.blocker, rects.pop()); rects.push(d.blocker);
    g.add(d.leaf); doors.push(d); return;
  }
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
// rooms (per-room width/depth from world.js: the middle room is THE VAULT, bigger than the others): the 25 arena shells; the attached rooms' shells are built by the CHEST block
for (let i = 0; i < WORLD.NARENA; i++) {
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
}
// LAMPS-BEGIN (docs/PLAN-5x5.md 4.2): exactly 9 PointLights (+ 1 Hemisphere), created once so the light count never changes (no shader recompile). They are a pool that follows the camera:
// when the camera changes room or a door opens / closes, the rooms are ranked by door hops through open doors (then distance) and the 9 lamps go to the best ones (the vault first
// whenever it is within 2 hops). A lamp that has to move fades out over 0.25 s, jumps to its room's ceiling and fades in. Unlit rooms keep their HDR ceiling panels, the env map and the hemisphere.
// ROOMSCALE: rooms are WORLD.SCALE (1.25) times the original 12 / 18 m, so the walls are that much further from the lamp; the intensity grows by the same factor to keep the walls lit (decay 1.2)
const LAMPS = (() => {
  const N_LAMP = 9, FADE = 0.25, lit = WORLD.ROOMS.filter(r => r.kind !== 'loot');   // loot rooms are lit by their own emissive art, as before
  const base = r => (r.kind === 'vault' ? 14 : r.kind === 'home' ? 6 : 9) * WORLD.SCALE;
  const pool = []; for (let i = 0; i < N_LAMP; i++) { const l = new THREE.PointLight(0xfff6ea, 0, 0, 1.2); l.position.set(0, -20, 0); scene.add(l); pool.push({ l, key: null, want: null, k: 0 }); }
  const adj = {}; for (const d of WORLD.DOORS) { (adj[d.a] = adj[d.a] || []).push([d.id, d.b]); (adj[d.b] = adj[d.b] || []).push([d.id, d.a]); }
  const doorOpen = id => { const d = doors[id]; return !!d && (d.open || d.p > 0.001); };
  let sig = '', lastAt = 0;
  function rank(cx, cz, from) {   // the N_LAMP rooms that should be lit
    const hop = {}; if (from) { hop[from] = 0; const q = [from]; for (let h = 0; h < q.length; h++) for (const [id, to] of adj[q[h]] || []) if (hop[to] === undefined && doorOpen(id)) { hop[to] = hop[q[h]] + 1; q.push(to); } }
    const sc = r => (hop[r.key] === undefined ? 99 : hop[r.key]) * 1000 + Math.hypot(r.cx - cx, r.cz - cz);
    const out = lit.slice().sort((a, b) => sc(a) - sc(b)).slice(0, N_LAMP);
    const v = WORLD.ROOMS[WORLD.VAULT]; if (!out.includes(v) && (!from || (hop[v.key] !== undefined && hop[v.key] <= 2))) out[N_LAMP - 1] = v;
    return out;
  }
  function assign(want) {   // keep lamps that are already on a wanted room; send the others to the rest
    const keep = new Set(), todo = [];
    for (const p of pool) { const r = want.find(w => w.key === (p.want || p.key)); if (r && !keep.has(r.key)) keep.add(r.key); else todo.push(p); }
    for (const r of want) if (!keep.has(r.key)) { const p = todo.shift(); if (!p) break; p.want = r.key; }
  }
  const _v = new THREE.Vector3(); let lastT = -1;
  function tick(t) {   // t: seconds (renderWorld's clock)
    const dt = lastT < 0 ? 1 : Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
    const p = cam.position, out = p.y > H || Math.abs(p.x) > WORLD.LIM || Math.abs(p.z) > WORLD.LIM, here = out ? '' : WORLD.roomKeyOf(p.x, p.z), now = performance.now();
    let s = here; for (let i = 0; i < doors.length; i++) s += doorOpen(i) ? '1' : '0';
    if (s !== sig || (out && now - lastAt > 500)) {
      sig = s; lastAt = now; let cx = p.x, cz = p.z;
      if (out) { cam.getWorldDirection(_v); if (_v.y < -0.05) { const k = -p.y / _v.y; cx = p.x + _v.x * k; cz = p.z + _v.z * k; } }   // overview / death camera: the rooms around the point it looks at
      assign(rank(cx, cz, out || here === 'c-1' ? null : here));
    }
    for (const q of pool) {
      if (q.want !== q.key) { q.k -= dt / FADE; if (q.k <= 0) { q.k = 0; q.key = q.want; const r = WORLD.roomRect(q.key); if (r) { const v = r.kind === 'vault'; q.l.position.set(r.cx, H - (v ? 1.2 : 0.7), r.cz); q.l.color.setHex(v ? 0xfff0dc : 0xfff6ea); } } }
      else if (q.k < 1) q.k = Math.min(1, q.k + dt / FADE);
      { const hp = q.want === q.key && q.key && q.key[0] === 'c' && GK.r5 && GK.r5.lampAt(q.key); if (hp) q.l.position.set(hp[0], hp[1], hp[2]); }   // ROOMS5ART: a home's lamp hangs under its false ceiling
      const r = q.key && WORLD.roomRect(q.key); q.l.intensity = r ? base(r) * q.k : 0;
    }
  }
  return { tick, pool };
})();
GK.lamps = LAMPS;   // test hook
// LAMPS-END
scene.add(new THREE.HemisphereLight(0xffffff, 0xeeebe4, 2.1));
// walls and doors from WORLD.WALLS (doors in WORLD.DOORS id order, so doors[i].id === i matches the server): arena 'skull' doors, vault doors, loot doors (retyped from the layout), home hatches;
// then the 4 bare outer corner walls. The attached rooms' own walls are part of their shell (CHEST block); here they only get collision boxes (the client used to rely on server corrections there).
for (const w of WORLD.WALLS) {
  if (w.att !== undefined) { addRect(w.x, w.z, w.rot, -w.len / 2, w.len / 2, -T / 2, T / 2); continue; }
  wall(w.x, w.z, w.rot, w.door == null ? null : w.kind === 'arena' ? 'skull' : w.kind === 'loot' ? 'chest' : w.kind, w.len);
}
layoutHooks.push(types => { for (const d of doors) { if (!d.setType) continue; const c = CHEST_ROOMS.find(r => Math.abs(r.wallX - d.gx) < 0.01 && Math.abs(r.wallZ - d.gz) < 0.01); if (c) d.setType(c.type); } });
if (GK.layout) layoutHooks[layoutHooks.length - 1](GK.layout);
// VAULT-BEGIN (THE VAULT: the big middle room, WORLD.V (22.5 m) square: gold lettering, floor medallion, pillars, dais, chandelier; no extra PointLights)
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
      const px = sx * (vh + 3.3) / 2;   // ROOMSCALE: centred on the wall between the door's panels (3.3 m) and the corner
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
    const px = vx + sx * WORLD.PILLAR_D, pz = vz + sz * WORLD.PILLAR_D;   // ROOMSCALE: same spot as the world.js PILLARS collision rects
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
const worldStatic = new Set(scene.children);   // rooms, walls/doors and THE VAULT decor (the graphics code merges these meshes)
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
    for (const sx of [-0.46, 0.46]) {   // iron hinge barrels and plates at the back so the lid reads as hinged
      const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 14), ironM); hb.rotation.z = Math.PI / 2; hb.position.set(sx, 1.0, -0.47); g.add(hb);
      bx(g, 0.24, 0.025, 0.22, sx, 0.99, -0.36, ironM, 1); bx(hinge, 0.24, 0.03, 0.24, sx, 0.045, 0.12, ironM, 1);
      for (const rz of [-0.06, 0.06]) { const rv = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), goldM); rv.position.set(sx + rz * 1.4, 1.015, -0.36 + rz); g.add(rv); }
    }
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
    const RS2 = cr.size || CS, CW = RS2 / 2, IN = CW - T / 2, PZ = RS2 > CS ? [-2.2, 1.8] : [-1.8, 1.4];   // 5x5: homes are 10x10, loot rooms keep the authored 8x8
    shell.floor = bx(g, RS2, 0.4, RS2, 0, -0.2, 0, cFloorM, RS2);
    ceilings.push(shell.ceil = bx(g, RS2 + T, 0.3, RS2 + T, 0, H + 0.15, 0, cCeilM));
    for (const z of PZ) { const pn = bx(g, 2.4, 0.05, 1.2, 0, H - 0.03, z, cPanelM); shell.panels.push(pn); ceilings.push(pn, bx(g, 2.64, 0.04, 1.44, 0, H - 0.015, z, skirtM)); }
    const L = RS2 + T / 2;
    shell.walls.push(bx(g, RS2 + T, H, T, 0, H / 2, -CW, cWallM), bx(g, T, H, L, -CW, H / 2, -T / 4, cWallM), bx(g, T, H, L, CW, H / 2, -T / 4, cWallM));
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
    (type === 'mystery' ? buildMystery : type === 'merchant' ? buildMerchant : type === 'home' ? buildHome : type === 'forge' || type === 'grand' ? buildStationRoom : buildChest)(slot);
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
  // ===== 5x5 placeholders (docs/PLAN-5x5.md 1.5; task C builds the real home / Master Forge / Grand Recycler art in rooms5art.js): the existing station kits on the back wall
  // ELIXIR: the pump (glass tank, fills with the owner's tank level), the Elixir Screen and the lockbox, placeholders at WORLD.HOME_LAYOUT until the home art (rooms5art-home.js) replaces them. Stations 'pump' / 'screen' / 'box' are what E acts on (GKHOMEW.interact).
  function buildElixirProps(g, cr) {
    const L = WORLD.HOME_LAYOUT, id = cr.id, iron = steelDark, brass = brassM, wood = mat('hpWood', () => M(0x6b4a2a, { roughness: 0.82 }));
    if (window.GK5ART && window.GK5ART.home) {   // INTEGRATION: the art home draws the pump, screen and lockbox; these are only the invisible E-prompt targets at the art anchors (HOME_LAYOUT)
      const hit = (kind, x, y, z, w, h, d) => { const o = new THREE.Mesh(kgeo('hpHit' + w + h + d, () => new THREE.BoxGeometry(w, h, d)), proxyM); o.position.set(x, y, z); o.visible = false; g.add(o); regStation(kind, o, id); };
      hit('pump', L.pump[0], 0.9, L.pump[1], 1.1, 1.8, 1.1); hit('screen', L.screen[0] - 0.2, 1.5, L.screen[1], 0.7, 1.4, 1.5); hit('box', L.box[0], 0.4, L.box[1], 0.9, 0.8, 1.1);
      return;
    }
    const glass = mat('hpGlass', () => new THREE.MeshStandardMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.26, roughness: 0.08, metalness: 0.1, depthWrite: false }));
    const liquid = mat('hpLiquid', () => new THREE.MeshBasicMaterial({ color: 0x5fd8ff, toneMapped: false, transparent: true, opacity: 0.9 }));
    const PL = kgeo('hpPlane', () => new THREE.PlaneGeometry(1, 1));
    const Pm = new THREE.Group(); Pm.position.set(L.pump[0], 0, L.pump[1]); Pm.rotation.y = -Math.PI / 2; g.add(Pm);
    cyl2(Pm, iron, 0, 0.12, 0, 0.5, 0.24); cyl2(Pm, brass, 0, 0.27, 0, 0.4, 0.06); cyl2(Pm, glass, 0, 0.9, 0, 0.33, 1.2); cyl2(Pm, brass, 0, 1.52, 0, 0.38, 0.07); box(Pm, brass, 0, 0.5, 0.4, 0.1, 0.1, 0.22); box(Pm, iron, 0, 0.36, 0.46, 0.06, 0.3, 0.06);
    const fill = cyl2(Pm, liquid, 0, 0.3, 0, 0.29, 1.1); regStation('pump', Pm, id);
    const setFill = f => { f = Math.max(0, Math.min(1, f)); fill.visible = f > 0.02; fill.scale.y = Math.max(0.01, 1.1 * f); fill.position.y = 0.3 + 0.55 * f; };
    GK.homeFill = GK.homeFill || {}; setFill(GK.homeFill[id] != null ? GK.homeFill[id] : 0.35); GK.homeProps = GK.homeProps || {}; GK.homeProps[id] = { setFill };
    const Sc = new THREE.Group(); Sc.position.set(L.screen[0], 0, L.screen[1]); Sc.rotation.y = Math.PI / 2; g.add(Sc);
    box(Sc, iron, 0, 0.45, 0, 0.5, 0.9, 0.34); box(Sc, iron, 0, 1.38, 0, 1.0, 0.78, 0.14);
    const face = new THREE.Mesh(PL, mat('hpScreen', () => new THREE.MeshBasicMaterial({ toneMapped: false, map: ctex('hpScreenTex', 128, 80, (c, w, h) => {
      c.fillStyle = '#071722'; c.fillRect(0, 0, w, h); c.fillStyle = '#5fd8ff'; c.beginPath(); c.moveTo(w * 0.2, h * 0.28); c.quadraticCurveTo(w * 0.12, h * 0.56, w * 0.2, h * 0.64); c.quadraticCurveTo(w * 0.28, h * 0.72, w * 0.31, h * 0.56); c.quadraticCurveTo(w * 0.33, h * 0.46, w * 0.2, h * 0.28); c.fill();
      c.fillStyle = 'rgba(127,216,255,.55)'; for (let i = 0; i < 4; i++) c.fillRect(w * 0.42, h * (0.24 + i * 0.15), w * (0.4 - i * 0.07), h * 0.07);
    }) }))); face.position.set(0, 1.38, 0.075); face.scale.set(0.9, 0.62, 1); Sc.add(face); regStation('screen', Sc, id);
    const Bx = new THREE.Group(); Bx.position.set(L.box[0], 0, L.box[1]); Bx.rotation.y = Math.PI / 2; g.add(Bx);
    box(Bx, wood, 0, 0.26, 0, 0.78, 0.52, 0.48); box(Bx, iron, 0, 0.56, 0, 0.8, 0.07, 0.5); for (const s of [-0.26, 0.26]) box(Bx, iron, s, 0.28, 0.005, 0.07, 0.54, 0.5); box(Bx, brass, 0, 0.42, 0.25, 0.1, 0.12, 0.03); regStation('box', Bx, id);
  }
  function buildHome(slot) {   // the home's normal workbench and its 50% recycler (server stationAt), positions shared with world.js HOME_LAYOUT (their footprints are solid)
    const g = slot.inner, cr = slot.cr, L = WORLD.HOME_LAYOUT;
    buildWorkbench(g, L.bench[0], L.bench[1], L.bench[2], cr.id); buildRecycler(g, L.recycler[0], L.recycler[1], L.recycler[2], cr.id);
    if (window.GK5ART && window.GK5ART.home) { buildElixirProps(g, cr); g.visible = false; return; }   // ROOMS5ART: the art home draws the furniture; these kits stay as invisible E-prompt targets (Raycaster ignores visibility)
    nameplate(g, 'HOME', 0, 5.7, -(cr.size / 2 - T / 2) + 0.4, 1.8, '#ffe9a8'); buildElixirProps(g, cr);
  }
  function buildStationRoom(slot) {   // Master Forge: a workbench (master type on the server); Grand Recycler: a recycler at 100%
    const g = slot.inner, cr = slot.cr, forge = cr.type === 'forge', S = WORLD.LOOT_LAYOUT[cr.type];
    if (forge) buildWorkbench(g, S[0], S[1], S[2], cr.id); else buildRecycler(g, S[0], S[1], S[2], cr.id);
    nameplate(g, forge ? 'MASTER FORGE' : 'GRAND RECYCLER', 0, 5.7, -IN + 0.4, 2.6, '#ffe9a8');
  }
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
  const MW = 1024, MH = 740, MS = 11.6 * 29 / WORLD.LIM, MOX = 360, MOY = 372; // canvas size, px per metre (fits the grid plus the chest rooms, +-WORLD.LIM m, in the same 673 px as the original +-29 m), map origin (world 0,0)
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
  const wordIcon = (txt, col) => (g, x, y, k) => { g.save(); g.font = 'bold ' + Math.round(13 * k) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = col; g.fillText(txt, x, y); g.restore(); };
  const homeIcon = (g, x, y, k) => { g.save(); g.translate(x, y); g.scale(k, k); g.fillStyle = '#9cc8ff'; g.beginPath(); g.moveTo(0, -13); g.lineTo(13, -2); g.lineTo(9, -2); g.lineTo(9, 11); g.lineTo(-9, 11); g.lineTo(-9, -2); g.lineTo(-13, -2); g.closePath(); g.fill(); g.fillStyle = '#14243a'; g.fillRect(-3, 3, 6, 8); g.restore(); };
  const ROOM_LOOK = { chest: ['#2b2410', '#c9a23a', chestIcon], mystery: ['#1c1236', '#9a6bff', mysteryIcon], merchant: ['#3a2a0c', '#ffd24a', merchantIcon], home: ['#14243a', '#5fa8ff', homeIcon], forge: ['#3a1a0c', '#ff7a2a', (g, x, y, k) => { g.save(); g.translate(x, y); HUD5.paintIcon(g, 'forge', 14 * k); g.restore(); }], grand: ['#0c2a26', '#4affd0', (g, x, y, k) => { g.save(); g.translate(x, y); HUD5.paintIcon(g, 'recycler', 14 * k); g.restore(); }] };
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
      const S = c.size || CS, x = mx(c.cx - S / 2), y = my(c.cz - S / 2), w = S * MS;
      const look = ROOM_LOOK[c.type] || ROOM_LOOK.chest;
      g.fillStyle = look[0]; g.fillRect(x, y, w, w);
      g.strokeStyle = look[1]; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, w - 3, w - 3);
      look[2](g, x + w / 2 - c.dx * 3, y + w / 2 - c.dz * 3, 1.05);
      /* FEEL-BEGIN */ if (GK.claimedRooms && GK.claimedRooms.has(c.id)) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, w, w); g.strokeStyle = '#5dff8a'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x + w * 0.28, y + w * 0.52); g.lineTo(x + w * 0.45, y + w * 0.7); g.lineTo(x + w * 0.74, y + w * 0.3); g.stroke(); g.lineCap = 'butt'; } /* FEEL-END */
    }
    // main rooms
    for (let i = 0; i < WORLD.NARENA; i++) {
      const [cx, cz] = rc(i), x = mx(cx - roomW(i) / 2), y = my(cz - roomD(i) / 2), w = roomW(i) * MS, h = roomD(i) * MS, vlt = i === WORLD.VAULT;   // real proportions: the vault is bigger
      g.fillStyle = vlt ? '#2a3442' : '#dfe8f2'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#0a1018'; g.lineWidth = 4; g.strokeRect(x, y, w, h);
      if (vlt) { // vault symbol
        const px = x + w / 2, py = y + h / 2 - 8;
        g.strokeStyle = '#e6b52e'; g.lineWidth = 3; g.strokeRect(x + 6, y + 6, w - 12, h - 12);
        g.strokeStyle = '#9fb4cc'; g.lineWidth = 6; g.beginPath(); g.arc(px, py, 34, 0, 7); g.stroke();
        g.lineWidth = 3; g.beginPath(); g.arc(px, py, 9, 0, 7); g.stroke();
        for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; g.beginPath(); g.moveTo(px + Math.cos(t) * 10, py + Math.sin(t) * 10); g.lineTo(px + Math.cos(t) * 34, py + Math.sin(t) * 34); g.stroke(); }
        g.fillStyle = '#f4c24d'; g.font = 'bold 20px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('THE VAULT', px, py + 56);
      }
    }
    // every door (all closed): arena doors, vault doors, loot doors; home hatches are open archways (a gap in the wall)
    for (const d of WORLD.DOORS) {
      const w = d.wall; if (d.kind === 'hatch') { g.fillStyle = '#5fa8ff'; if (d.axis === 'x') g.fillRect(mx(w.x) - DW * MS / 2, my(w.z) - 3, DW * MS, 6); else g.fillRect(mx(w.x) - 3, my(w.z) - DW * MS / 2, 6, DW * MS); continue; }
      lockMark(g, mx(w.x), my(w.z), d.axis === 'z', d.kind === 'vault' ? 'vault' : d.kind === 'loot' ? 'treasure' : 'player');
    }
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
  // 5x5 (docs/PLAN-5x5.md 4.4): ONE shared facility drawing (base + intel + lore) on one CanvasTexture, shown on a wall map in every arena room except the vault;
  // "you are here" is a small marker mesh per room on the map plane (a separate 1024x740 canvas per room would cost ~100 MB at 24 rooms).
  const mapRooms = []; for (let i = 0; i < WORLD.NARENA; i++) if (i !== WORLD.VAULT) mapRooms.push(i);
  const shared = document.createElement('canvas'); shared.width = MW; shared.height = MH;
  const sharedCtx = shared.getContext('2d'), sharedTex = new THREE.CanvasTexture(shared); sharedTex.colorSpace = THREE.SRGBColorSpace; sharedTex.anisotropy = 8; sharedTex.generateMipmaps = true;
  function drawShared() {
    const g = sharedCtx; g.drawImage(base, 0, 0);
    if (GK.mapIntel) GK.mapIntel(g, mx, my, MS);   // UNIQUE: faint arrows for last round's door picks
    if (GK.hud5Map) GK.hud5Map(g, mx, my, MS);   // HUD5: special room icons (vaultbreakers, trees, breach)
    if (GK.knowMap) GK.knowMap(g, mx, my, null);   // KNOWLEDGE: Lore perks draw on the map
    sharedTex.needsUpdate = true;
  }
  const markTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d'); g.fillStyle = 'rgba(255,40,40,0.26)'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ff3030'; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const hereTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#d81818'; rr(g, 4, 4, 120, 56, 9); g.fill(); g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.stroke(); g.font = 'bold 22px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText('YOU ARE', 64, 22); g.fillText('HERE', 64, 44); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const markMat = new THREE.MeshBasicMaterial({ map: markTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const hereMat = new THREE.MeshBasicMaterial({ map: hereTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    r.addColorStop(0, 'rgba(120,190,255,0.9)'); r.addColorStop(0.5, 'rgba(70,140,255,0.35)'); r.addColorStop(1, 'rgba(40,100,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5, metalness: 0.8 });
  const SW = 2.5, SH = 2.5 * MH / MW;   // screen size (m)
  const glowGeo = new THREE.PlaneGeometry(4.6, 3.6), backGeo = new THREE.BoxGeometry(2.6, 1.9, 0.06), screenGeo = new THREE.PlaneGeometry(SW, SH), unitGeo = new THREE.PlaneGeometry(1, 1);
  const barH = new THREE.BoxGeometry(2.6, 0.05, 0.09), barV = new THREE.BoxGeometry(0.05, 1.8, 0.09), bracketGeo = new THREE.BoxGeometry(0.12, 0.12, 0.03);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, toneMapped: false });
  const screenMat = new THREE.MeshStandardMaterial({ map: sharedTex, emissiveMap: sharedTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0 });
  const onScreen = (cx, cy) => [(cx / MW - 0.5) * SW, (0.5 - cy / MH) * SH];   // canvas px -> screen-local metres
  for (const i of mapRooms) {
    const [cx, cz] = rc(i), px = cx - WORLD.panelDX(i), py = 2.6, pz = cz - roomD(i) / 2 + T / 2; // pz = wall face
    const grp = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); grp.add(m); return m; };
    add(glowGeo, glowMat, px, py, pz + 0.012).renderOrder = 1;
    add(backGeo, frameMat, px, py, pz + 0.03);
    add(barH, frameMat, px, py + 0.925, pz + 0.045); add(barH, frameMat, px, py - 0.925, pz + 0.045);
    add(barV, frameMat, px - 1.275, py, pz + 0.045); add(barV, frameMat, px + 1.275, py, pz + 0.045);
    for (const sx of [-0.9, 0.9]) add(bracketGeo, frameMat, px + sx, py - 0.95 - 0.06, pz + 0.015); // wall brackets
    add(screenGeo, screenMat, px, py, pz + 0.076);
    { const [ux, uy] = onScreen(mx(cx), my(cz)), mk = add(unitGeo, markMat, px + ux, py + uy, pz + 0.078); mk.scale.set(roomW(i) * MS / MW * SW, roomD(i) * MS / MH * SH, 1); mk.renderOrder = 2;
      const hh = add(unitGeo, hereMat, px + ux, py + uy, pz + 0.08); hh.scale.set(0.2, 0.1, 1); hh.renderOrder = 3; }
    scene.add(grp); grp.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; }); grp.updateMatrixWorld(true);
  }
  drawShared();
  layoutHooks.push(() => { drawBase(); drawShared(); });   // the room types are random per match: redraw the base and the shared map once
  GK.redrawMaps = () => { drawBase(); drawShared(); };
  GK.redrawMap = () => drawShared();   // KNOWLEDGE: live intel (one shared canvas upload)
}
// MAP-END
// PANEL-BEGIN (door control panels and round logic on the client: owned by the rounds agent)
// Door graph: WORLD.DOORS (one canonical id order shared with server.js), room keys: '0'..'24' arena rooms, 'c0'..'c15' attached rooms.
// ROOM_DOORS (client) lists the votable doors of each room, sorted N, E, S, W: a home's hatch is always open and never on a panel.
const PDIRS = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
const ROOM_DOORS = {}, DINFO = WORLD.DOORS.map(d => ({ id: d.id, a: d.a, b: d.b, da: d.da, db: d.db, kind: d.kind === 'arena' ? 'skull' : d.kind === 'loot' ? 'chest' : d.kind }));
for (const k in WORLD.ROOM_DOORS) { const ids = WORLD.ROOM_DOORS[k].filter(id => DINFO[id].kind !== 'hatch'); if (ids.length) ROOM_DOORS[k] = ids; }
const VK = WORLD.VAULT_KEY;   // THE VAULT's room key
const roomKeyAt = WORLD.roomKeyOf;   // arena rooms inside +-WORLD.HALF (41.25 m; the vault spans +-11.25 m), attached rooms beyond
const homeOwner = id => { for (const a of actors.values()) if (a.home === 'c' + id) return a.name; return null; };   // 5x5: the name of the goblin whose home this is (null when unknown)
const roomName = k => { if (k === VK) return 'THE VAULT'; { const sp = window.GKHUD5 && GKHUD5.nameOf(k); if (sp) return sp; } if (k[0] === 'c') { const c = CHEST_ROOMS[+k.slice(1)]; if (!c) return 'Outside'; if (c.type === 'home') { const n = homeOwner(c.id); return n ? 'Home of ' + n : 'Home'; } return roomTypeName(c.type || 'chest'); } return 'Room ' + (+k + 1); };

const roomTypeName = t => (GK.ROOM_TYPE_NAMES && GK.ROOM_TYPE_NAMES[t]) || { chest: 'Treasure room', mystery: 'Mystery room', merchant: 'Merchant', home: 'Home', forge: 'Master Forge', grand: 'Grand Recycler' }[t] || 'Treasure room';
const doorLabel = (key, id) => {
  const d = DINFO[id], mine = d.a === key, other = mine ? d.b : d.a, dir = mine ? d.da : d.db;
  const ck = a => a[0] === 'c' ? (CHEST_ROOMS[+a.slice(1)].type || 'chest') : null, ot = ck(other);
  return { dir, dest: roomName(other), kind: ot === 'forge' || ot === 'grand' || ot === 'home' ? 'chest' : ot || d.kind };   // the Forge and the Grand Recycler use the treasure icon until task D draws theirs
};
const fmtT = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

// ----- round state (fed by applyRound; the local clock interpolates between server updates) -----
const RS = { n: 0, endAt: 0, dur: 0, sel: {}, open: [], fizzled: [], votes: 0, selJ: '{}', openJ: '[]', flashUntil: 0, fizzUntil: 0, homeLock: false, arenaUntil: 0 };
GK.homeLocked = () => RS.homeLock;   // HOME PHASE: round 1, the hatches are shut
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
    { const hl = !!d.homeLock; if (hl !== RS.homeLock) { if (RS.homeLock && !hl) { RS.arenaUntil = now + 3200; RS.flashUntil = now + 3200; } RS.homeLock = hl; if (GK.setHomeLock) GK.setHomeLock(hl, RS.n === 0); } }   // HOME PHASE: the server's round state says whether the hatches are shut (round 1)
    RS.n = d.round.n; RS.endAt = now + (+d.round.left || 0); RS.dur = +d.round.dur || 0;
  }
  if (Number.isFinite(d.vaultVotes) && d.vaultVotes !== RS.votes) { RS.votes = d.vaultVotes; panelsDirty(); }
  if (d.sel && typeof d.sel === 'object') { const j = JSON.stringify(d.sel); if (j !== RS.selJ) { RS.selJ = j; RS.sel = d.sel; panelsDirty(); } }
  if (Array.isArray(d.open)) { const j = JSON.stringify(d.open); if (j !== RS.openJ) { RS.openJ = j; RS.open = d.open; GK.setDoorsOpen(d.open); panelsDirty(); } }
  if (GK.unique) GK.unique.round(d); if (d.selBy) panelsDirty();   // UNIQUE: who made each pick, last round's picks
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
  g.fillText(roomName(p.key).toUpperCase(), W - 24, 40);
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
    g.fillText(sel ? 'SELECTED · OPENS AT 0:00' : opn ? ((window.GKRULES && GKRULES.openText(b.id)) || 'OPEN THIS ROUND') : 'Press E to select', tx, iy + dy);
    if (vlt) { g.font = '800 ' + Math.min(21, b.h * 0.18) + 'px system-ui, sans-serif'; g.fillStyle = sel ? (RS.votes < 2 ? '#8a0a00' : '#1a5a10') : '#ffb347'; g.fillText('NEEDS 2 PLAYERS · THE VAULT votes: ' + RS.votes + '/2', tx, iy + dy + Math.min(27, b.h * 0.24)); }
    if (opn) { g.fillStyle = '#18c25e'; cpRR(g, b.x + b.w - 100, iy - 20, 84, 40, 20); g.fill(); g.fillStyle = '#04200f'; g.textAlign = 'center'; g.font = '800 24px system-ui, sans-serif'; g.fillText('OPEN', b.x + b.w - 58, iy + 1); }
  });
  if (GK.unique) GK.unique.panel(g, p);   // UNIQUE: picker badge + flash
  if (window.GKRULES) GKRULES.panel(g, p);   // RULES: bribe line
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
  const W = Math.round((w - 0.1) * 320), H = Math.round((h - 0.1) * 320), K = 0.7;   // layout units (320 per metre); 5x5: 33 panels, so the canvas itself is 0.7x that (224 px per metre)
  const cv = document.createElement('canvas'); cv.width = Math.round(W * K); cv.height = Math.round(H * K); cv.getContext('2d').scale(K, K);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const scr = add(new THREE.PlaneGeometry(w - 0.1, h - 0.1), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.4, metalness: 0 }), 0, 0, 0.076);
  const p = { key, ids: ROOM_DOORS[key], W, H, ctx: cv.getContext('2d'), tex, screen: scr, hover: -1, dirty: false, buttons: [] };
  cpLayout(p); cpDraw(p); CP[key] = p; cpList.push(p);
  return grp;
}
function panelsDirty() { for (const p of cpList) p.dirty = true; }
// RULES-CLIENT-BEGIN (experimental rules; everything here is inert unless the server advertises `rules` in its welcome / round message)
window.GKRULES = (() => {
  const R = { on: new Set(), bribes: {}, left: {}, crown: null, bolts: new Map(), ring: null, tag: null, raf: 0 };
  const INFO = { crown: ['Crown win', 'Stand on the vault dais for 20 s without being hurt and you are crowned Goblin King.'], doorclose: ['Doors close', 'A door you open stays open for 2 rounds, then slams shut. A klaxon sounds 5 s before.'], staffbolt: ['Staff bolts', 'Staffs and scepters throw a slow 6 damage bolt (12 m range, 1.2 s cooldown) instead of a melee swing.'], bribe: ['Bribes', 'Aim at a door panel and press B: pay 50 gold for +1 weight on your room\'s pick this round.'] };
  const sec = () => document.getElementById('sg-rules');
  function ui() {
    const s = sec(); if (!s) return; s.style.display = R.on.size ? '' : 'none';
    s.innerHTML = '<h3>Experimental rules</h3>' + [...R.on].map(n => '<div class="row"><label><b>' + INFO[n][0] + '</b><br><span style="opacity:.7;font-size:.85em">' + INFO[n][1] + '</span></label></div>').join('') + '<div class="row"><label style="opacity:.6;font-size:.85em">Set by the server (GK_RULES). They cannot be changed from here.</label></div>';
  }
  function loop() {
    R.raf = 0; const now = performance.now(), live = R.bolts.size || R.crown; if (!live) return;
    for (const [id, b] of R.bolts) { const t = (now - b.t0) / 1000; b.spr.position.set(b.x + b.vx * t, 1.1, b.z + b.vz * t); try { GKVFX.bolt(id, b.spr.position, 0xb89cff, 0.016); } catch (e) {} /* VFX */ if (t * 10 > b.range + 1) { scene.remove(b.spr); R.bolts.delete(id); } }
    if (R.crown && R.ring) { const k = Math.min(1, (R.crown.p0 + (now - R.crown.t0) / R.crown.ms)); R.ring.geometry.setDrawRange(0, Math.max(0, Math.round(k * 96)) * 6); R.ring.rotation.z = now * 0.0006; }
    R.raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!R.raf) R.raf = requestAnimationFrame(loop); };
  function tagEl() { if (!R.tag) { R.tag = document.createElement('div'); R.tag.style.cssText = 'position:fixed;left:50%;top:16%;transform:translateX(-50%);padding:6px 16px;border-radius:8px;background:rgba(40,28,4,.82);border:2px solid #ffd24a;color:#ffe9a0;font:800 22px system-ui,sans-serif;letter-spacing:.04em;z-index:30;pointer-events:none;display:none'; document.body.appendChild(R.tag); } return R.tag; }
  function ringMesh() {
    if (R.ring) return R.ring; const g = new THREE.RingGeometry(2.0, 2.3, 96, 1); g.rotateX(-Math.PI / 2);
    R.ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); R.ring.position.set(0, 0.24, 0); R.ring.frustumCulled = false; scene.add(R.ring); return R.ring;
  }
  let glowTex = null;
  function glow() { if (glowTex) return glowTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(160,120,255,0.8)'); g.addColorStop(1, 'rgba(100,60,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); glowTex = new THREE.CanvasTexture(c); return glowTex; }
  function onMsg(d) {
    if (Array.isArray(d.rules) && d.rules.join() !== [...R.on].join()) { R.on = new Set(d.rules); ui(); }
    if (!R.on.size) return;
    if (d.bribes && JSON.stringify(d.bribes) !== JSON.stringify(R.bribes)) { R.bribes = d.bribes; panelsDirty(); }
    if (R.on.has('doorclose') && d.openLeft && JSON.stringify(d.openLeft) !== JSON.stringify(R.left)) { R.left = d.openLeft; panelsDirty(); }
    if (d.crown !== undefined && !(d.crown && d.crown.claims)) {   // the legacy crown rule's {id, name, p, ms}; the 5x5 crown view {claims, gaining, ...} is the HUD5 panel's (it printed 'undefined IS CLAIMING THE CROWN NaNs' here)
      const t = tagEl();
      if (!d.crown) { R.crown = null; t.style.display = 'none'; if (R.ring) { scene.remove(R.ring); R.ring = null; } }
      else { R.crown = { p0: d.crown.p, t0: performance.now(), ms: d.crown.ms }; t.style.display = ''; t.textContent = (d.crown.id === me ? 'YOU ARE' : d.crown.name + ' IS') + ' CLAIMING THE CROWN ' + Math.ceil(d.crown.ms * (1 - d.crown.p) / 1000) + 's'; ringMesh(); kick(); }
    }
    if (d.bolt) { const b = d.bolt, spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xb89cff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); spr.scale.set(0.7, 0.7, 1); scene.add(spr); R.bolts.set(b.id, { spr, x: b.x, z: b.z, vx: b.vx, vz: b.vz, range: b.range, t0: performance.now() }); snd('swing', { x: b.x, z: b.z }); kick(); }
    if (d.boltEnd) { const b = R.bolts.get(d.boltEnd.id); if (b) { try { GKVFX.boltHit(b.spr.position, 0xb89cff); GKVFX.boltEnd(d.boltEnd.id); } catch (e) {} /* VFX */ scene.remove(b.spr); R.bolts.delete(d.boltEnd.id); } }
    if (d.showdown && !R.showdown) { R.showdown = 1; toastMsg('THREE GOBLINS LEFT: every door is open!', false, 3500); }   // PACE
    if (d.klaxon) { toastMsg('KLAXON: doors close at the end of the round!', false); for (let i = 0; i < 3; i++) setTimeout(() => snd('tickLast'), i * 350); }
    if (d.bribeFail) toastMsg({ pick: 'Select a door first', gold: 'Not enough gold (50)', max: 'Bribe limit reached', room: 'Not at a room panel' }[d.bribeFail] || 'No bribe', false);
  }
  function openText(id) { if (!R.on.has('doorclose')) return null; const n = R.left[id]; return n ? 'OPEN · ' + n + (n === 1 ? ' ROUND LEFT' : ' ROUNDS LEFT') : null; }
  function panel(g, p) { if (!R.on.has('bribe')) return; const n = R.bribes[p.key] || 0; g.textAlign = 'right'; g.font = '700 19px system-ui, sans-serif'; g.fillStyle = n ? '#ffd24a' : '#8fb0d0'; g.fillText(n ? 'BRIBED +' + n + ' · [B] 50g more' : '[B] BRIBE 50g: +1 weight', p.W - 24, 62); }
  function bribeKey() { if (!R.on.has('bribe') || !cpAim) return false; net.send({ bribe: 1 }); return true; }
  return { has: n => R.on.has(n), onMsg, openText, panel, bribeKey };
})();
// RULES-CLIENT-END
for (let i = 0; i < WORLD.NARENA; i++) {   // arena rooms: north wall, mirrored against the facility map (x = centre + WORLD.panelDX)
  const [cx, cz] = rc(i); cpBuild(String(i), scene, 2.6, 1.9, cx + WORLD.panelDX(i), 2.6, cz - roomD(i) / 2 + T / 2, 0);
}
for (const cr of CHEST_ROOMS) {   // loot rooms: 2 m panel on the room's left wall (the far wall is taken by banners and torches); homes have no votable door, so no panel
  if (!ROOM_DOORS['c' + cr.id]) continue;
  const g = new THREE.Group(); g.position.set(cr.cx, 0, cr.cz); g.rotation.y = Math.atan2(-cr.dx, -cr.dz); scene.add(g);
  cpBuild('c' + cr.id, g, 2.0, 1.9, -(CS / 2 - T / 2), 2.6, 0, Math.PI / 2);
  if (PERF2_ON) { g.updateMatrix(); g.matrixAutoUpdate = false; }   // PERF2: the wrapper never moves; frozen, the room culling can classify it (it was always drawn, from every room)
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
  if (cur && cur.dirty) cpDraw(cur); else { let o = null; for (let i = 0; i < cpList.length; i++) if (cpList[i].dirty && (!fxCull.active || fxCull.vis.has(cpList[i].key))) { o = cpList[i]; break; } if (o) cpDraw(o); }   // PERF2: no closure per frame; 5x5: only panels in the rooms being drawn (the others stay dirty until seen)
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
GK.tipAim = () => { const a = cpAim, b = a && a.p.buttons[a.i]; return b ? doorLabel(a.p.key, b.id).kind : null; };   // TIPS hook: kind of the panel entry under the crosshair

{
  const css = document.createElement('style');
  css.textContent = '#roundHud{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:30;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;display:none}' +
    '#roundHud .t{display:inline-block;padding:6px 26px 8px;border-radius:14px;background:rgba(8,14,24,.72);border:2px solid rgba(120,180,255,.55);color:#f2f8ff;font-weight:800;font-size:clamp(26px,4.4vw,46px);letter-spacing:.06em;font-variant-numeric:tabular-nums;text-shadow:0 2px 8px #000;box-shadow:0 4px 24px rgba(0,0,0,.5)}' +
    '#roundHud .t.warn{color:#ff4343;border-color:#ff4343;background:rgba(40,6,6,.78);animation:rhPulse .5s ease-in-out infinite alternate}' +
    '#roundHud .b{margin-top:10px;font-weight:900;font-size:clamp(28px,5.5vw,60px);letter-spacing:.14em;color:#ffd24a;text-shadow:0 0 18px #ff9a00,0 3px 10px #000;animation:rhBanner 2.2s ease-out forwards;display:none}' +
    '#roundHud .b.f{color:#ff4a3a;font-size:clamp(20px,3.6vw,38px);text-shadow:0 0 16px #a00,0 3px 10px #000}' +
    '#roundHud .h{display:none;margin:8px auto 0;padding:5px 16px 6px;border-radius:10px;background:rgba(14,10,4,.74);border:1px solid rgba(255,200,90,.55);color:#ffd98a;font-weight:800;font-size:clamp(14px,2vw,20px);letter-spacing:.04em;font-variant-numeric:tabular-nums;text-shadow:0 2px 6px #000;width:max-content;max-width:92vw;animation:rhIn .6s ease-out}' +
    '@keyframes rhIn{0%{opacity:0;transform:translateY(-6px) scale(.9)}100%{opacity:1;transform:none}}' +
    '@keyframes rhPulse{from{transform:scale(1)}to{transform:scale(1.14)}}@keyframes rhBanner{0%{opacity:0;transform:scale(.7)}12%{opacity:1;transform:scale(1.08)}20%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}';
  document.head.appendChild(css);
  const hud = document.createElement('div'); hud.id = 'roundHud'; hud.innerHTML = '<div class="t"></div><div class="h"></div><div class="b">DOORS OPENING</div><div class="b f">THE VAULT NEEDS 2 PLAYERS - TURN WASTED</div>';
  document.body.appendChild(hud);
  const tEl = hud.children[0], hEl = hud.children[1], bEl = hud.children[2], fEl = hud.children[3]; let shownBanner = 0, shownFizz = 0, lastTxt = '', lastWarn = null, lastHome = '';
  setInterval(() => {
    const show = GK.mode === 'play' && RS.n > 0; hud.style.display = show ? 'block' : 'none'; if (!show) return;
    const left = roundLeft(), now = performance.now();
    const txt = 'ROUND ' + RS.n + '  ' + fmtT(left), warn = left <= 5000;
    if (txt !== lastTxt) { tEl.textContent = txt; lastTxt = txt; }
    if (warn !== lastWarn) { tEl.classList.toggle('warn', warn); lastWarn = warn; }
    { const h = RS.homeLock ? 'Prepare in your base: the arena opens in ' + fmtT(left) : ''; if (h !== lastHome) { if (!h || !lastHome) hEl.style.display = h ? 'block' : 'none'; hEl.textContent = h; lastHome = h; } }   // HOME PHASE: round 1 line under the timer
    if (now < RS.flashUntil) { if (shownBanner !== RS.flashUntil) { shownBanner = RS.flashUntil; bEl.textContent = now < RS.arenaUntil ? 'THE ARENA IS OPEN' : 'DOORS OPENING'; bEl.style.display = 'none'; void bEl.offsetWidth; bEl.style.display = 'block'; } }
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
  { skin: 0x9ccf52, cloth: 0x4e6a2e, b: 0.82 }, { skin: 0x5e7a4c, cloth: 0x2e2c34, b: 0.9 }, { skin: 0x7f9a4a, cloth: 0x6a4a2a, b: 1.12 }, { skin: 0x8a9c6a, cloth: 0x6b5238, b: 0.92 },   // GOBTYPES: scout, sneak, miner, shaman
  { skin: 0x8c9a3c, cloth: 0x5a4636, b: 1.12 }, { skin: 0x4f8f72, cloth: 0x4a6a2a, b: 1.05 }, { skin: 0xb4733a, cloth: 0x2e2238, b: 0.9 },   // berserker, bog goblin, hobgoblin (rust: the one non-green goblin)
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
// GOBLINART-BEGIN (sculpted goblin figurines: geometry kit, one patched "uber" material per type, baked body parts, armour overlays, code-driven animation; see docs/reports/goblin-art.md)
const GA = (() => {
  const A = { cache: {}, mats: {}, corpses: [] };
  const V3 = THREE.Vector3, M4 = THREE.Matrix4, Col = THREE.Color, TAU = Math.PI * 2;
  const _m = new M4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V3(), _s = new V3(), _n3 = new THREE.Matrix3(), _v = new V3(), _nv = new V3();
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, y, z) => {   // smooth value noise, deterministic (the baked geometry is cached per type)
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const h = (a, b, c) => hash3(ix + a, iy + b, iz + c), L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
  };
  // material presets written into the aMat vertex attribute: [roughness, metalness, emissive amount, cloth-texture mix]
  const SK = [0.55, 0, 0, 0], SKE = [0.55, 0, 0.1, 0], CL = [0.92, 0, 0, 1], LT = [0.6, 0, 0, 0.6], MT = [0.3, 1, 0, 0], GD = [0.2, 1, 0.22, 0], BN = [0.42, 0, 0, 0], GL = [0.4, 0, 1.8, 0], GEM = [0.28, 0.1, 1.0, 0], DK = [0.85, 0, 0, 0], HR = [0.85, 0, 0, 0.35];
  A.P = { SK, SKE, CL, LT, MT, GD, BN, GL, GEM, DK, HR };
  const lin = h => new Col(h);
  // ---- vertex colour functions (positions are in the baked group's local space; they return linear rgb)
  function skinFn(base, o = {}) {
    const c = lin(base), pale = lin(base).lerp(lin(0xf0e2a8), 0.45), dk = lin(base).multiplyScalar(0.55), tint = o.tint ? lin(o.tint) : null;
    return (x, y, z, nx, ny, nz) => {
      const n1 = vnoise(x * 7 + 3, y * 7, z * 7) - 0.5, n2 = vnoise(x * 23, y * 23 + 7, z * 23) - 0.5, k = 1 + n1 * 0.34 + n2 * 0.14;
      let r = c.r, g = c.g, b = c.b;
      if (o.belly) { const f = sstep(0.1, 0.75, nz) * sstep(0.62, 0.25, y); r += (pale.r - r) * f; g += (pale.g - g) * f; b += (pale.b - b) * f; }
      const sh = sstep(0.2, -0.9, ny) * 0.28; r *= 1 - sh; g *= 1 - sh * 0.8; b *= 1 - sh * 0.6;   // cavity shading under chins, arms and the belly
      if (tint) { const f = Math.max(0, n1 + 0.15) * 0.8; r += (tint.r - r) * f; g += (tint.g - g) * f; b += (tint.b - b) * f; }
      const rud = sstep(0.52, 0.8, vnoise(x * 4 + 9, y * 4 + 2, z * 4)), l = (r * 0.3 + g * 0.55 + b * 0.15) * 0.1;   // T10: ruddy blotches (blood under the skin) and a touch less saturation: less vinyl
      r = r * 0.9 + l + rud * 0.07 * r; g = g * 0.9 + l - rud * 0.02; b = b * 0.9 + l - rud * 0.02;
      return [r * k, g * k, b * (k * 0.97)];
    };
  }
  const flat = (hex, v = 0.06) => { const c = lin(hex); return (x, y, z) => { const k = 1 + (vnoise(x * 11, y * 11, z * 11) - 0.5) * v * 2; return [c.r * k, c.g * k, c.b * k]; }; };
  // ---- geometry builder: pieces (with transforms, vertex colours and material presets) merge into one BufferGeometry
  class GB {
    constructor() { this.P = []; this.N = []; this.U = []; this.C = []; this.M = []; this.I = []; this.n = 0; this.base = new M4(); this.stack = []; }
    push(p, r, s) { this.stack.push(this.base.clone()); this.base.multiply(new M4().compose(new V3(...(p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), new V3(...(s || [1, 1, 1])))); return this; }
    pop() { this.base = this.stack.pop(); return this; }
    add(geo, o = {}) {
      const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, idx = geo.index, cnt = pos.count;
      _p.set(...(o.p || [0, 0, 0])); _q.setFromEuler(_e.set(...(o.r || [0, 0, 0]))); _s.set(...(o.s || [1, 1, 1]));
      _m.compose(_p, _q, _s).premultiply(this.base); _n3.getNormalMatrix(_m);
      const m = o.m || SK, cf = typeof o.c === 'function' ? o.c : flat(o.c ?? 0xffffff, o.v ?? 0.05), us = o.uv ?? (m === SK ? 2.5 : m === CL || m === LT ? 2 : 1), flip = _m.determinant() < 0;
      for (let i = 0; i < cnt; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(_m); _nv.fromBufferAttribute(nor, i).applyMatrix3(_n3).normalize();
        this.P.push(_v.x, _v.y, _v.z); this.N.push(_nv.x, _nv.y, _nv.z);
        this.U.push(uv ? uv.getX(i) * us : 0, uv ? uv.getY(i) * us : 0);
        const c = cf(_v.x, _v.y, _v.z, _nv.x, _nv.y, _nv.z); this.C.push(c[0] * (o.hdr || 1), c[1] * (o.hdr || 1), c[2] * (o.hdr || 1)); this.M.push(m[0], m[1], m[2], m[3]);
      }
      const n0 = this.n, ni = idx ? idx.count : cnt;
      for (let i = 0; i < ni; i += 3) { const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2; if (flip) this.I.push(n0 + a, n0 + c, n0 + b); else this.I.push(n0 + a, n0 + b, n0 + c); }
      this.n += cnt; return this;
    }
    finish() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.U, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3)); g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.M, 4));
      g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.I, 1) : new THREE.Uint16BufferAttribute(this.I, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
    }
    // shorthands
    e(x, y, z, sx, sy, sz, c, m, o) { return this.add(A.g.sph, { p: [x, y, z], s: [sx, sy, sz], c, m, ...o }); }          // ellipsoid
    es(x, y, z, sx, sy, sz, c, m, o) { return this.add(A.g.sphS, { p: [x, y, z], s: [sx, sy, sz], c, m, ...o }); }        // low-poly ellipsoid (small details)
    k(x, y, z, r, h, rx, rz, c, m, o) { return this.add(A.g.cone, { p: [x, y, z], s: [r, h, r], r: [rx || 0, 0, rz || 0], c, m, ...o }); }   // spike: base at the point, pointing +y
    box(x, y, z, sx, sy, sz, c, m, o) { return this.add(A.g.box, { p: [x, y, z], s: [sx, sy, sz], c, m, ...o }); }
    cyl(x, y, z, rt, rb, h, c, m, o) { return this.add(new THREE.CylinderGeometry(rt, rb, h, 14, 1), { p: [x, y, z], c, m, ...o }); }
    tor(x, y, z, R, r, rx, ry, rz, c, m, o) { return this.add(new THREE.TorusGeometry(R, r, 7, 24), { p: [x, y, z], r: [rx || 0, ry || 0, rz || 0], c, m, ...o }); }
    tube(pts, r0, r1, c, m, o = {}) { return this.add(taperTube(pts, r0, r1, o.rad || 8, o.segs, o.bulge), { c, m, ...o }); }
    lathe(prof, segs, c, m, o = {}) { return this.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), segs || 32), { c, m, ...o }); }
  }
  A.GB = GB;
  A.g = {
    sph: new THREE.SphereGeometry(1, 18, 12), sphS: new THREE.SphereGeometry(1, 9, 7), box: new THREE.BoxGeometry(1, 1, 1),
    cone: new THREE.ConeGeometry(1, 1, 9, 1).translate(0, 0.5, 0),
  };
  function taperTube(pts, r0, r1, rad = 8, segs, bulge) {   // tube along a smooth curve with a radius that tapers from r0 to r1
    const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(...p)), false, 'catmullrom', 0.5), sg = segs || Math.max(6, pts.length * 5);
    const geo = new THREE.TubeGeometry(curve, sg, 1, rad, false), p = geo.attributes.position;
    for (let i = 0; i <= sg; i++) {
      const t = i / sg, c = curve.getPointAt(t), r = (r0 + (r1 - r0) * t) * (bulge ? 1 + bulge * Math.sin(Math.PI * t) : 1);
      for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; p.setXYZ(k, c.x + (p.getX(k) - c.x) * r, c.y + (p.getY(k) - c.y) * r, c.z + (p.getZ(k) - c.z) * r); }
    }
    geo.computeVertexNormals(); return geo;
  }
  A.taperTube = taperTube;
  // T10: a shaped pauldron (replaces the old hemisphere + torus): three overlapping lames (lathe domes with a rolled lip), each wider and lower than the last, a raised central ridge and
  // optional spikes that curve up and out. Built in the shoulder's tilted frame (B.push), so it sits on the shoulder like a cap. o: c (plate), c2 (lower lames), rim (edge), spikes (count), gem.
  A.pauldron = (B, px, py, sd, k, o = {}) => {
    const c = o.c ?? 0x7a8088, c2 = o.c2 ?? c, rim = o.rim ?? 0xc9a24a, m = o.m ?? MT, sp = o.spikes ?? 0, edge = o.edge ?? MT;
    B.push([px, py, 0], [0, 0, -sd * 0.34], [1, 1, 1]);
    const lame = (R, H, y, col) => {
      B.lathe([[0.001, H], [R * 0.32, H * 0.97], [R * 0.64, H * 0.84], [R * 0.86, H * 0.55], [R * 0.97, H * 0.18], [R * 1.04, 0], [R * 1.05, -0.02 * k], [R * 0.99, -0.034 * k], [R * 0.9, -0.03 * k], [R * 0.78, -0.012 * k]], 22, col, m, { p: [0, y, 0], s: [1, 1, 0.92], v: 0.1 });
      B.tor(0, y - 0.012 * k, 0, R * 1.02, 0.015 * k, Math.PI / 2, 0, 0, rim, edge, { s: [1, 1, 1] });   // rolled edge
    };
    lame(0.19 * k, 0.1 * k, 0.0, c); lame(0.225 * k, 0.07 * k, -0.062 * k, c2); lame(0.26 * k, 0.05 * k, -0.118 * k, c2);
    B.tube([[0, -0.01 * k, 0.2 * k], [0, 0.07 * k, 0.15 * k], [0, 0.118 * k, 0], [0, 0.07 * k, -0.15 * k], [0, -0.01 * k, -0.2 * k]], 0.018 * k, 0.018 * k, rim, edge, { rad: 6, segs: 14 });   // ridge over the top
    for (let i = 0; i < sp; i++) {
      const a = sp === 1 ? 0 : (i / sp) * TAU + 0.5, rr = sp === 1 ? 0 : 0.09 * k, bx = Math.cos(a) * rr, bz = Math.sin(a) * rr, h = (sp === 1 ? 0.34 : 0.22 + (i % 2) * 0.05) * k;
      B.tube([[bx, 0.1 * k, bz], [bx * 1.25 + Math.cos(a) * 0.02, 0.1 * k + h * 0.55, bz * 1.25], [bx * 1.6 + Math.cos(a) * 0.05, 0.1 * k + h, bz * 1.6]], 0.034 * k, 0.004, o.spike ?? 0xaab0b8, MT, { rad: 6, segs: 10 });
    }
    if (o.gem) B.es(0, 0.125 * k, 0, 0.026 * k, 0.026 * k, 0.026 * k, o.gem, GEM);
    B.pop();
  };
  // ---- textures: cached, 512 px max, shared by every goblin of a type
  A.bump = canvasTex(512, 512, (g, w, h) => {   // skin: pores, wrinkles and warts (grey = flat, bright = raised)
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    const blob = (x, y, r, v, a) => { for (const [ox, oy] of [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(${v},${v},${v},${a})`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); } };
    for (let i = 0; i < 90; i++) blob(Math.random() * w, Math.random() * h, 18 + Math.random() * 40, Math.random() < 0.5 ? 255 : 0, 0.13);   // soft lumps
    for (let i = 0; i < 1100; i++) blob(Math.random() * w, Math.random() * h, 1.6 + Math.random() * 2.2, 0, 0.55);                              // pores
    g.strokeStyle = 'rgba(20,20,20,.35)'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, a = Math.random() * 6.28, l = 10 + Math.random() * 26; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 5, y + Math.sin(a) * l * 0.5 - 5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 20; i++) { const x = Math.random() * w, y = Math.random() * h, r = 5 + Math.random() * 7; blob(x, y, r * 1.5, 0, 0.5); blob(x, y, r, 255, 0.95); blob(x - r * 0.25, y - r * 0.25, r * 0.5, 255, 0.5); }   // warts
  }, false);
  const CT = [   // per type: [base grey, stitch colour, patch tints]
    ['#e8e2d0', '#2b2118', ['#f4efe0', '#cfc0a0', '#b9c7a0', '#d9a79a']], ['#dcd4c8', '#1c130d', ['#efe7da', '#b8a68c']], ['#cfc8bd', '#1a120c', ['#e0d8cb', '#a89c8a']],
    ['#ece9f4', '#2c2250', ['#ffffff', '#d7d0ee']], ['#f2eee4', '#5a3a08', ['#ffffff', '#ece0c0']],
    ['#e4e2d4', '#2b2118', ['#efe9d8']], ['#d0ccc8', '#141016', ['#dcd6d0']], ['#dcd4c8', '#1c130d', ['#efe7da']], ['#e0d8c4', '#2b2118', ['#efe6d0']], ['#d8d0c4', '#1c130d', ['#e8e0d0']], ['#e0e4d4', '#1c2a14', ['#eef0e0']], ['#dcd6e4', '#2a0a0a', ['#ece6f0']]];   // GOBTYPES
  function clothTex(type) {
    if (A.cloth && A.cloth[type]) return A.cloth[type]; (A.cloth = A.cloth || {});
    const [base, st, pt] = CT[type];
    return A.cloth[type] = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      g.globalAlpha = 0.28; g.lineWidth = 1;
      for (let i = 0; i < w; i += 3) { g.strokeStyle = i % 6 ? '#8a8478' : '#6a645a'; g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      g.globalAlpha = 1; speckle(g, w, h, 2600, 2.5, 0.16);
      if (type === 4) { g.strokeStyle = 'rgba(120,80,10,.35)'; g.lineWidth = 2; for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 64 + h, 0); g.lineTo(i * 64, h); g.stroke(); } }
      const patch = (x, y, pw, ph, col) => { g.fillStyle = col; g.fillRect(x, y, pw, ph); g.strokeStyle = st; g.lineWidth = 3; g.setLineDash([9, 7]); g.strokeRect(x + 7, y + 7, pw - 14, ph - 14); g.setLineDash([]); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; g.strokeRect(x, y, pw, ph); };
      g.strokeStyle = st; g.lineWidth = 3; g.setLineDash([11, 8]);   // stitched seams
      for (const x of [12, 256, 500]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (const y of [12, 256, 500]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.setLineDash([]);
      if (type <= 1) for (let i = 0; i < (type === 0 ? 7 : 3); i++) patch(((i * 163) % 440) + 20, ((i * 97 + 40) % 420) + 20, 70 + (i % 3) * 22, 60 + (i % 2) * 28, pt[i % pt.length]);
      if (type === 1 || type === 2) { g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; for (let i = 0; i < 60; i++) { const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + Math.random() * 30, y + Math.random() * 8 - 4); g.stroke(); } }
    });
  }
  // T10 skin look: skin vertices are flagged by roughness 0.55 (the SK preset). A warm fresnel rim (colour set per room by GA.tick: warm in rooms, gold in the vault)
  // plus a fake subsurface scatter (the albedo bleeds red-orange at grazing angles, strongest where the surface is thin: the ears' emissive inner side).
  A.U = { rim: { value: 1 }, rimCol: { value: new Col(0xffa86a) }, hull: true, vk: 0 };
  const SKIN_FRAG = `
    float skinF = (1.0 - smoothstep(0.0, 0.012, abs(vMat.x - 0.55))) * (1.0 - vMat.w) * uRim;
    if (skinF > 0.0) {
      float ndv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      float fr = pow(1.0 - ndv, 2.4);
      vec3 sss = diffuseColor.rgb * vec3(1.9, 0.55, 0.3) * (pow(1.0 - ndv, 1.4) * 0.22 + vMat.z * 0.5);
      outgoingLight += skinF * (uRimCol * fr * 0.34 + sss * (0.35 + 0.65 * fr));
    }
`;
  // ---- the one material per type: vertex colours + per-vertex roughness / metalness / emissive / cloth mix, so a whole limb is one draw call
  function uber(type) {
    if (A.mats[type]) return A.mats[type];
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, map: clothTex(type), bumpMap: A.bump, bumpScale: 2.2, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.9, sheen: 0.3, sheenRoughness: 0.45, sheenColor: new Col(CFG[type].skin).lerp(new Col(0xfff2c0), 0.2) });
    m.customProgramCacheKey = () => 'goblin-uber';
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute vec4 aMat;\nvarying vec4 vMat;\nvoid main() {').replace('#include <color_vertex>', '#include <color_vertex>\n\tvMat = aMat;');
      sh.uniforms.uRimCol = A.U.rimCol; sh.uniforms.uRim = A.U.rim;   // T10: shared by every goblin material (one program); Low sets uRim to 0
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying vec4 vMat;\nuniform vec3 uRimCol;\nuniform float uRim;\nvoid main() {')
        .replace('#include <opaque_fragment>', SKIN_FRAG + '#include <opaque_fragment>')
        .replace('#include <map_fragment>', '#ifdef USE_MAP\n\tdiffuseColor.rgb *= mix(vec3(1.0), texture2D(map, vMapUv).rgb, vMat.w);\n#endif')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vMat.x;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vMat.y;')
        .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = diffuseColor.rgb * vMat.z;')
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('dHdxy_fwd()', 'dHdxy_fwd() * (1.0 - vMat.w * 0.75) * (1.0 - vMat.y)'));
    };
    return A.mats[type] = m;
  }
  A.uber = uber; A.clothTex = clothTex;
  // T10: the same skin look for plain MeshStandardMaterials (the first-person hand): shares the rim uniforms, one extra program in total
  A.skinPatch = (m, key) => {
    const frag = SKIN_FRAG.replace(/float skinF = .*;/, 'float skinF = uRim;').replace(/vMat\.z/g, '0.0');
    m.customProgramCacheKey = () => key;
    m.onBeforeCompile = sh => { sh.uniforms.uRimCol = A.U.rimCol; sh.uniforms.uRim = A.U.rim; sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform vec3 uRimCol;\nuniform float uRim;\nvoid main() {').replace('#include <opaque_fragment>', frag + '#include <opaque_fragment>'); };
    return m;
  };
  // per-goblin variation: a clone of the type's material with a slight colour multiplier (same shader program, same geometry), so no two goblins of a type are the same shade
  function uberVar(type) {
    const base = uber(type), m = base.clone(), k = type >= 3 ? 0.5 : 1, r = () => Math.random() - 0.5;
    m.onBeforeCompile = base.onBeforeCompile; m.customProgramCacheKey = base.customProgramCacheKey;
    const v = 0.95 + r() * 0.14 * k, warm = r() * 0.3 * k;   // brightness and a warm (yellow-olive) to cool (blue-green) swing
    m.color.setRGB(v * (1 + warm * 0.55), v * (1 + warm * 0.1), v * (1 - warm * 0.8)); return m;
  }
  A.uberVar = uberVar;
  function bake(parent, type, key, build) {   // build once per type and part, then every goblin of the type shares the geometry
    const ck = type + ':' + key; let geo = A.cache[ck];
    if (!geo) { const B = new GB(); build(B); geo = A.cache[ck] = B.finish(); }
    const mesh = new THREE.Mesh(geo, A.curMat || uber(type)); parent.add(mesh); if (PERF2_ON) perf2Lod.meshes.set(mesh, ck); return mesh;   // PERF2: remember the cache key (goblin level of detail)
  }
  A.bake = bake;
  // ---- T10: inverted-hull ink outline (A7). One shared program, one shared material. Hulls reuse the baked geometry of the head, torso and ears only (4 extra draws per goblin), push the
  // vertices out along the smooth normal and draw the back faces in dark ink: the silhouette reads against the white rooms. Medium and above, goblins within 6.5 m, never the local one.
  A.hullMat = new THREE.MeshBasicMaterial({ color: 0x1a1410, side: THREE.BackSide, fog: false });
  A.hullMat.customProgramCacheKey = () => 'goblin-hull';
  A.hullMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(normal) * 0.01;'); };
  A.hullSrc = new WeakMap();
  A.hulls = u => {
    u.hulls = [];
    for (const part of [u.head, u.torso, u.earL, u.earR]) {
      if (!part) continue;
      for (const c of part.children) if (c.isMesh && c.geometry.attributes.aMat && !c.userData.hull) { const h = new THREE.Mesh(c.geometry, A.hullMat); h.userData.keep = 1; h.userData.hull = 1; A.hullSrc.set(h, c); h.visible = false; h.frustumCulled = c.frustumCulled; part.add(h); u.hulls.push(h); }
    }
  };
  A.hullStep = (u, d2) => {
    if (!u.hulls) return;
    const on = A.U.hull && d2 < 42 && !u.dead && u.lodLvl !== 2 && u.lodLvl !== 1;
    if (u.hullOn !== on) { u.hullOn = on; for (const h of u.hulls) h.visible = on; }
    if (on && !u.hullLow && typeof perf2Lod !== 'undefined') { let n = 0; for (const h of u.hulls) { const ck = perf2Lod.meshes.get(A.hullSrc.get(h)), g1 = ck && perf2Lod.geo.get(ck + '|1'); if (g1) { h.geometry = g1; n++; } } if (n === u.hulls.length) u.hullLow = true; }   // the outline only needs a rough hull: use the simplified (level 1) geometry once it is built
  };
  // ---- sculpted head: an ellipsoid pushed into a heavy brow, sunken eye sockets, cheek bones and a jutting underbite
  function sculptHead(w, h, d, o = {}) {
    const g = new THREE.SphereGeometry(1, 44, 32), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x), front = sstep(-0.1, 0.7, z);
      let X = x * w, Y = y * h, Z = z * d;
      const brow = Math.exp(-Math.pow((y - 0.36) / 0.13, 2)) * front * sstep(0.1, 0.5, ax + 0.25) * (o.brow ?? 0.07);
      const socket = Math.exp(-Math.pow((y - 0.12) / 0.15, 2) - Math.pow((ax - 0.42) / 0.2, 2)) * sstep(0.25, 0.8, z) * 0.045;
      const cheek = Math.exp(-Math.pow((y + 0.12) / 0.16, 2) - Math.pow((ax - 0.55) / 0.2, 2)) * front * 0.03;
      const jawY = sstep(-0.25, -0.85, y), jaw = jawY * sstep(-0.1, 0.75, z) * (o.jaw ?? 0.07), hollow = Math.exp(-Math.pow((y + 0.4) / 0.2, 2) - Math.pow((ax - 0.62) / 0.15, 2)) * 0.02;
      Z += brow + cheek - socket + jaw; X *= 1 + jawY * 0.12 - sstep(0.4, 1, y) * 0.1; X -= Math.sign(x) * hollow; Y -= jawY * 0.02;
      Z -= sstep(0.35, 1, y) * 0.06 * (o.slope ?? 1);   // sloped forehead
      const nz = (vnoise(x * 4 + 9, y * 4, z * 4) - 0.5) * 0.02; X += x * nz; Y += y * nz; Z += z * nz;
      p.setXYZ(i, X, Y, Z);
    }
    g.computeVertexNormals(); return g;
  }
  A.sculptHead = sculptHead;
  // ---- ears: bevelled leaf shape, cupped and drooping, with a pink inner ear
  function earGeo(len, wid, droop, side, inner) {
    const s = new THREE.Shape(), L = len, W = wid * (inner ? 0.55 : 1);
    s.moveTo(0, W * 0.5); s.bezierCurveTo(L * 0.2, W * 1.15, L * 0.55, W * 1.0, L * 0.82, W * 0.1); s.lineTo(L, -W * 0.5); s.bezierCurveTo(L * 0.62, -W * 0.5, L * 0.25, -W * 0.7, 0, -W * 0.5); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: inner ? 0.006 : 0.05, bevelEnabled: true, bevelThickness: inner ? 0.012 : 0.022, bevelSize: inner ? 0.012 : 0.018, bevelSegments: 3, curveSegments: 14 }), p = g.attributes.position;   // UNIQUE: thick outer ear, curled rim
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = x / L; p.setXYZ(i, x * side, y - droop * t * t * L, z - 0.12 * t * t * L * 0.5 + (inner ? 0.064 : 0) + earCup(L, wid, y * (inner ? 0.78 : 1), t)); }
    g.computeVertexNormals(); return g;
  }
  const earCup = (L, wid, y, t) => 0.05 * (y / wid) * (y / wid) * (0.3 + 0.7 * Math.min(1, t * 1.4));   // UNIQUE: the ear is a shallow cup, its rim curling forward
  A.earCup = earCup;
  A.earGeo = earGeo;
  A.hash3 = hash3; A.vnoise = vnoise; A.sstep = sstep; A.skinFn = skinFn; A.flat = flat; A.lin = lin;
// ---- per-type look table: head scale, hunch, ear size, eye style (lid drop, angry tilt), limb thickness
const GAT = [
  { hs: 1.2, hunch: 0.2, ear: 1.4, drop: 0.25, tilt: 0.1, limb: 0.82, pupil: 0.012, hold: -0.9, fam: 'cloth' },
  { hs: 1.1, hunch: 0.2, ear: 1.1, drop: 0.55, tilt: 0.3, limb: 1, pupil: 0.01, hold: -0.9, fam: 'leather' },
  { hs: 0.88, hunch: 0.42, ear: 0.85, drop: 0.78, tilt: 0.42, limb: 1.25, pupil: 0.009, hold: -0.8, fam: 'harness' },
  { hs: 1.1, hunch: 0.14, ear: 1.2, drop: 0.7, tilt: -0.08, limb: 0.85, pupil: 0.011, hold: -0.45, fam: 'robe' },
  { hs: 1.12, hunch: 0.1, ear: 1.1, drop: 0.78, tilt: 0.0, limb: 0.95, pupil: 0.011, hold: -0.6, fam: 'royal' },
  // GOBTYPES: scout, sneak, miner, shaman, berserker, bog goblin (hw: wider head), hobgoblin; fam = the family of the type's starting armour (its own outfit stands in for it)
  { hs: 1.08, hunch: 0.12, ear: 1.5, drop: 0.4, tilt: 0.12, limb: 0.8, pupil: 0.012, hold: -0.9, fam: 'light' }, { hs: 1.14, hunch: 0.5, ear: 1.25, drop: 0.3, tilt: 0.28, limb: 0.85, pupil: 0.006, hold: -1.0, fam: 'leather' },
  { hs: 1.0, hunch: 0.3, ear: 0.95, drop: 0.62, tilt: 0.2, limb: 1.12, pupil: 0.01, hold: -0.8, fam: 'scrap' }, { hs: 1.05, hunch: 0.3, ear: 1.25, drop: 0.72, tilt: 0.0, limb: 0.85, pupil: 0.008, hold: -0.6, fam: 'bone' },
  { hs: 0.95, hunch: 0.36, ear: 0.9, drop: 0.45, tilt: 0.5, limb: 1.18, pupil: 0.008, hold: -0.85, fam: 'fur' }, { hs: 1.1, hw: 1.16, hunch: 0.32, ear: 0.75, drop: 0.2, tilt: 0.1, limb: 0.95, pupil: 0.016, hold: -0.85, fam: 'cloth' },
  { hs: 0.88, hunch: 0.04, ear: 1.0, drop: 0.5, tilt: 0.35, limb: 0.85, pupil: 0.009, hold: -0.8, fam: 'cloth' },
];
const GA_TIER = [0x8a8f98, 0x6fcf5a, 0x4a9bff, 0xb06cff, 0xff9a2a, 0x7ff6ff];   // trim colour by item tier (0..5)
function gaLeg(B, type, s, b, SC) {
  const L = GAT[type].limb, dk = skinFn(CFG[type].skin, { tint: 0x203010 });
  B.e(0, -0.1, 0, 0.1 * b * L, 0.17, 0.11 * b * L, SC, SK);                          // thigh
  B.tube([[0, -0.17, 0], [0, -0.3, 0.03], [0, -0.44, 0.0]], 0.075 * L * b, 0.05, SC, SK);   // skinny shin
  B.e(0, -0.31, 0.04, 0.065 * L, 0.06, 0.06, dk, SK);                                   // knee knob
  const toes = (zc, y, col, claw) => { for (const x of [-0.055, 0, 0.055]) { B.e(x * b, y, zc, 0.032, 0.03, 0.05, col, SK); B.k(x * b, y - 0.005, zc + 0.045, 0.02, 0.07, 1.75, 0, claw, BN); } };
  if (type >= 5 && gxFeet(B, type, b, SC, toes)) { /* GOBTYPES */ } else if (type === 0) {   // barefoot scavenger: big flat feet, three toes with claws
    B.e(0, -0.52, 0.0, 0.065, 0.07, 0.06, SC, SK); B.e(0, -0.555, 0.08, 0.1 * b, 0.05, 0.17, SC, SK); toes(0.2, -0.56, SC, 0xd8cdb0);
    B.tor(0, -0.47, 0, 0.065, 0.014, Math.PI / 2, 0, 0, 0x7a5a34, LT);                 // rag anklet
  } else if (type === 3) {   // pointed slippers with a curled toe
    B.tube([[0, -0.5, -0.06], [0, -0.545, 0.08], [0, -0.55, 0.22], [0, -0.5, 0.33], [0, -0.42, 0.36]], 0.085 * b, 0.018, 0x3d2a98, CL, { rad: 10, bulge: 0.15 });
    B.tor(0, -0.5, 0, 0.082, 0.02, Math.PI / 2, 0, 0, 0xffc933, GD); B.es(0, -0.415, 0.365, 0.03, 0.03, 0.03, 0xffc933, GD);
  } else {   // boots: leather cuff, big toe cap, sole, buckle
    const lc = type === 4 ? 0x4a0a14 : type === 2 ? 0x3a2a1e : 0x4a301c, trim = type === 4 ? 0xffc933 : 0xb9a46a;
    B.lathe([[0.078, -0.58], [0.1, -0.56], [0.098, -0.43], [0.115, -0.4], [0.12, -0.37]].map(([x, y]) => [x * (0.9 + b * 0.1), y]), 20, lc, LT, { uv: 3 });
    B.e(0, -0.545, 0.075, 0.105 * b, 0.065, 0.185, lc, LT); B.e(0, -0.52, 0.2, 0.08 * b, 0.05, 0.08, lc, LT);
    B.box(0, -0.595, 0.07, 0.2 * b * 0.55, 0.018, 0.4 * 0.5, 0x1c1410, DK);
    B.tor(0, -0.47, 0, 0.1, 0.014, Math.PI / 2, 0, 0, trim, type === 4 ? GD : MT);
    B.box(0, -0.47, 0.105, 0.045, 0.04, 0.02, trim, type === 4 ? GD : MT);
    if (type === 2) for (let i = 0; i < 4; i++) { const a = -0.9 + i * 0.6; B.k(Math.sin(a) * 0.1, -0.4, Math.cos(a) * 0.1, 0.018, 0.06, Math.cos(a) * 1.0, -Math.sin(a) * 1.0, 0x8a9098, MT); }
  }
}
function gaBody(B, type, b, SC, SB) {   // nude torso: hunched back, pot belly, ribs and a spine ridge
  const L = GAT[type].limb, back = type === 2 ? 1.25 : 1;
  B.e(0, 0.43, -0.02, 0.29 * b, 0.25, 0.24 * b, SC, SK);                                // chest
  B.e(0, 0.5 + (type === 2 ? 0.05 : 0), -0.1, 0.27 * b * back, 0.2 * back, 0.2 * b * back, SC, SK);   // hunched upper back
  B.e(0, 0.16, 0.06, 0.27 * b, 0.25, 0.27 * b, SB, SK);                                  // pot belly
  B.e(0, -0.02, 0.0, 0.2 * b, 0.14, 0.18 * b, SC, SK);                                    // hips
  B.es(0, 0.12, 0.31 * b, 0.025, 0.02, 0.012, 0x244018, DK);                                // navel
  B.tube([[0, 0.5, -0.02], [0, 0.6, 0.0], [0, 0.66, 0.05]], 0.1 * Math.sqrt(b), 0.075, SC, SK);   // neck
  for (let i = 0; i < 6; i++) B.k(0, 0.64 - i * 0.1, -0.2 * b * (i < 2 ? 1.0 : 0.95) - (i === 0 ? 0.04 : 0), 0.026 - i * 0.002, 0.075 - i * 0.004, -Math.PI / 2 - 0.2, 0, skinFn(CFG[type].skin, { tint: 0x203010 }), SK);   // spine ridge
  for (const s of [-1, 1]) {
    B.e(s * 0.27 * b, 0.47, 0.0, 0.1, 0.09, 0.1, SC, SK);                                // shoulder ball
    for (let i = 0; i < 3; i++) B.add(A.g.sph, { p: [s * 0.15 * b, 0.46 - i * 0.07, 0.19 * b], s: [0.075, 0.011, 0.02], r: [0, 0, -s * 0.25 + 0.0], c: skinFn(CFG[type].skin, { tint: 0x102008 }), m: SK });   // ribs
    B.es(s * 0.2 * b, 0.34, 0.265 * b, 0.016, 0.016, 0.01, 0x2a1410, DK);                  // belly freckle
  }
}
function gaHand(B, s, b, SC, claw, L) {   // big three-fingered hand curled round the weapon axis (origin = wrist, weapon passes through (0,-0.03,0.05))
  B.push([0, -0.28, 0], [0, 0, 0], [s, 1, 1]);
  B.e(0, 0.03, 0.045, 0.085 * b * L, 0.06, 0.08, SC, SK);                                // palm
  B.e(0.0, 0.07, 0.0, 0.05, 0.04, 0.045, SC, SK);                                       // wrist cuff
  const R = 0.056, cy = -0.03;
  for (let j = 0; j < 3; j++) {
    const z = 0.0 + j * 0.05, pts = [20, -35, -100, -160].map(a => { const r = a * Math.PI / 180; return [Math.cos(r) * R * (1 + (j === 1 ? 0.12 : 0)), cy + Math.sin(r) * R, z + 0.012]; });
    B.tube(pts, 0.026 * L, 0.016, SC, SK, { rad: 7, segs: 12 });
    const e = pts[3]; B.e(e[0], e[1], e[2], 0.02, 0.02, 0.02, SC, SK); B.k(e[0], e[1] + 0.005, e[2], 0.014, 0.065, 0.0, 0.5, claw, BN);
    B.es(pts[0][0], pts[0][1] + 0.02, pts[0][2], 0.03, 0.03, 0.03, SC, SK);                  // knuckle
  }
  B.tube([[-0.06, 0.04, 0.05], [-0.075, -0.02, 0.07], [-0.045, -0.075, 0.075]], 0.03 * L, 0.017, SC, SK, { rad: 7 });   // thumb
  B.k(-0.045, -0.07, 0.075, 0.015, 0.06, 0.0, -0.4, claw, BN);
  B.pop();
}
function gaFaceFn(type) {
  const base = skinFn(CFG[type].skin, { tint: 0x203a10 });
  return (x, y, z, nx, ny, nz) => {
    const c = base(x, y, z, nx, ny, nz), ax = Math.abs(x);
    const sock = Math.exp(-Math.pow((ax - 0.125) / 0.075, 2) - Math.pow((y - 0.25) / 0.06, 2)) * sstep(0.1, 0.25, z), cheek = Math.exp(-Math.pow((ax - 0.17) / 0.07, 2) - Math.pow((y - 0.12) / 0.05, 2)) * sstep(0.1, 0.25, z) * 0.12;
    const nose = Math.exp(-Math.pow(x / 0.05, 2) - Math.pow((y - 0.16) / 0.07, 2)) * sstep(0.2, 0.3, z) * 0.15, k = 1 - sock * 0.55 + cheek * 0.6 + nose;
    return [c[0] * k, c[1] * k * (1 + cheek * 0.2), c[2] * k];
  };
}
function gaHead(B, type, b) {
  const C = CFG[type], P = GAT[type], face = gaFaceFn(type), SC = skinFn(C.skin, { tint: 0x203a10 }), deep = skinFn(C.skin, { tint: 0x102006 });
  const darkSkin = lin(C.skin).multiplyScalar(0.55), dsk = (x, y, z) => [darkSkin.r, darkSkin.g, darkSkin.b];
  const w = type === 2 ? 0.34 : 0.3, d = type === 2 ? 0.3 : 0.29;
  B.add(sculptHead(w, 0.275, d, { brow: type === 2 ? 0.1 : type === 0 ? 0.05 : 0.075, jaw: type === 2 ? 0.1 : 0.075 }), { p: [0, 0.22, 0], c: face, m: SK, uv: 2.2 });
  // underbite: a forward lower jaw with a thick lip, a dark mouth, tongue and a row of crooked teeth
  B.e(0, 0.075, 0.115, 0.205 * (w / 0.3), 0.1, 0.19, face, SK);
  B.e(0, 0.118, 0.205, 0.145, 0.03, 0.09, 0x2a0b0d, DK);
  B.e(0, 0.106, 0.2, 0.075, 0.016, 0.065, 0xc2506a, SK);
  B.e(0, 0.1, 0.285, 0.115, 0.032, 0.04, deep, SK);                                          // lower lip
  B.e(0, 0.137, 0.282, 0.105, 0.022, 0.035, deep, SK);                                       // upper lip
  for (let i = 0; i < 7; i++) { const x = (i - 3) * 0.032; B.k(x, 0.128, 0.283 - Math.abs(i - 3) * 0.01, 0.011, -0.03 - (i % 2) * 0.012, 0, 0, 0xe4d8b0, BN); }
  B.e(0, 0.01, 0.2, 0.06, 0.05, 0.05, face, SK);                                              // chin
  if (type !== 4) B.k(0, -0.0, 0.23, 0.03, 0.09, 2.4, 0, SC, SK);                              // chin spike
  // tusks (underbite): two curved tapered tubes
  for (const s of [-1, 1]) {
    const tl = type === 2 ? 1.35 : type === 0 ? 0.8 : 1;
    B.tube([[s * 0.085, 0.085, 0.255], [s * 0.095, 0.125, 0.29], [s * 0.088, 0.175 * tl, 0.285], [s * 0.075, 0.2 + 0.05 * tl, 0.265]], 0.03, 0.002, type === 3 ? 0xd8c8a0 : 0xe8dcb4, BN, { rad: 7, segs: 12 });
    B.k(s * 0.155, 0.125, 0.225, 0.016, 0.055, -0.15, s * 0.5, 0xe4d8b0, BN);               // small side fang
    B.e(s * 0.17, 0.165, 0.2, 0.075, 0.05, 0.06, face, SK);                                  // cheek bone
    // eye: socket shadow, glowing ball, slit pupil, heavy lid, brow ridge
    const ex = s * 0.125, ey = 0.252;
    B.e(ex, ey, 0.172, 0.072, 0.068, 0.05, deep, SK);
    B.e(ex, ey, 0.205, 0.064, 0.06, 0.06, gxEye(type, 0, type === 3 ? 0xa8f4ff : type === 4 ? 0xfff0a0 : 0xffe14a), GL, { v: 0 });
    B.e(ex + s * 0.004, ey, 0.252, 0.03, 0.05, 0.016, gxEye(type, 1, type === 3 ? 0x1a8cff : type === 4 ? 0xffa800 : 0xff9b00), GL, { v: 0, hdr: 1.1 });         // iris
    B.e(ex + s * 0.004, ey, 0.264, P.pupil, 0.042, 0.008, 0x050302, DK, { v: 0 });              // slit pupil
    B.add(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, 1.0), { p: [ex, ey, 0.205], r: [P.drop, 0, s * P.tilt], s: [0.07, 0.069, 0.069], c: deep, m: SK });   // upper lid
    B.add(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, 0.75), { p: [ex, ey - 0.004, 0.205], r: [Math.PI - 0.35 + (type === 0 ? 0.2 : 0), 0, 0], s: [0.069, 0.068, 0.068], c: deep, m: SK });   // lower lid bag
    const a = P.tilt * 0.9;
    B.tube([[s * 0.035, 0.335 - a * 0.1, 0.27], [s * 0.1, 0.34 + a * 0.02, 0.265], [s * 0.19, 0.325 + a * 0.12, 0.2]], 0.05, 0.03, deep, SK, { rad: 8 });   // brow ridge
    B.es(s * 0.02, 0.098 - 0.02 * (type === 3 ? 1.35 : 1), 0.352 + 0.035 * (type === 3 ? 1.35 : 1), 0.014, 0.011, 0.01, 0x14240c, DK);                            // nostril
    
  }
  // hooked nose: bridge, drooping hook and a bulb tip
  const nl = type === 3 ? 1.35 : type === 0 ? 0.85 : 1;
  B.tube([[0, 0.27, 0.25], [0, 0.24, 0.3 + 0.01 * nl], [0, 0.19, 0.335 + 0.03 * nl], [0, 0.135 - 0.02 * nl, 0.34 + 0.035 * nl]], 0.03, 0.036, face, SK, { rad: 9, segs: 16 });
  B.e(0, 0.118 - 0.025 * nl, 0.345 + 0.035 * nl, 0.045, 0.036, 0.04, face, SK);
  // warts, a mole, scar tissue
  for (const [x, y, z, r] of [[-0.18, 0.12, 0.17, 0.022], [0.16, 0.3, 0.2, 0.018], [0.07, 0.4, 0.2, 0.016], [-0.21, 0.22, 0.15, 0.02], [0.2, 0.13, 0.17, 0.026], [-0.05, 0.19, 0.335, 0.012]]) {
    const q = Math.hypot(x, y - 0.22, z); B.es(x * 1.02, y, z * 1.02, r, r, r, lin(C.skin).lerp(lin(0x6a6a20), 0.45), SK, { v: 0.15 }); void q;
  }
  B.tube([[-0.16, 0.34, 0.2], [-0.15, 0.28, 0.24], [-0.17, 0.2, 0.22]], 0.007, 0.007, 0xc98a82, SK, { rad: 5 });   // scar
}
function gaEarBake(B, type, s) {
  const P = GAT[type], len = 0.5 * P.ear, wid = 0.15, droop = [0.66, 0.55, 0.4, 0.55, 0.5, -0.22, 0.3, 0.55, 0.78, 0.45, 0.12, 0.2][type];
  const sk0 = skinFn(CFG[type].skin, { tint: 0x203a10 }), warmEnd = lin(0xd0705a);
  const sk = (x, y, z, nx, ny, nz) => { const c = sk0(x, y, z, nx, ny, nz), t = sstep(0.25, 1, Math.abs(x) / len) * 0.38; return [c[0] + (warmEnd.r - c[0]) * t, c[1] + (warmEnd.g - c[1]) * t, c[2] + (warmEnd.b - c[2]) * t]; };   // T10: the outer ear warms towards the tip
  const rose = lin(0x9a4452), pink = lin(0xbc7a74), skinC = lin(CFG[type].skin);
  const inner = (x, y, z) => { const t = sstep(0.0, 1, Math.abs(x) / len), n = vnoise(x * 18, y * 18, z * 18) - 0.5, ve = Math.pow(Math.abs(Math.sin(y * 70 + x * 20 + n * 3)), 12) * 0.22;   // T10: a gradient (deep rose at the root, softer pink, skin at the rim) with faint veins: no flat mauve band, no rainbow
    const k = 1 + n * 0.25 - ve, e = sstep(0.82, 1, t);
    return [(rose.r + (pink.r - rose.r) * t + (skinC.r - pink.r) * e) * k, (rose.g + (pink.g - rose.g) * t + (skinC.g - pink.g) * e) * k, (rose.b + (pink.b - rose.b) * t + (skinC.b - pink.b) * e) * k]; };
  B.push([0, 0, 0], [0, 0, 0], [s, 1, 1]);
  B.add(earGeoFor(len, wid, droop, false), { c: sk, m: SK, uv: 1.5 });
  B.add(earGeoFor(len, wid, droop, true), { c: inner, m: SKE, p: [0.02, 0, 0.012], s: [0.9, 0.78, 1] });   // thin inner ear: glows red when the light passes through (emissive + the subsurface term in the skin shader)
  const rim = (y0, c1, c2, y3) => { const pts = [], bz = (a, b, c, d, u) => (1 - u) ** 3 * a + 3 * (1 - u) ** 2 * u * b + 3 * (1 - u) * u * u * c + u ** 3 * d; for (let i = 0; i <= 10; i++) { const u = i / 10, x = bz(0, c1[0], c2[0], c2[2], u), y = bz(y0, c1[1], c2[1], y3, u), t = x / len; pts.push([x, y + Math.sign(y0) * 0.012 - droop * t * t * len, 0.03 - 0.06 * t * t * len + A.earCup(len, wid, y, t) + 0.016]); } return pts; };
  B.tube(rim(wid * 0.5, [len * 0.2, wid * 1.15], [len * 0.55, wid * 1.0, len * 0.82], wid * 0.1), 0.017, 0.008, sk, SK, { rad: 6 });   // UNIQUE: rolled rim along the top edge
  B.tube(rim(-wid * 0.5, [len * 0.25, -wid * 0.7], [len * 0.62, -wid * 0.5, len * 0.9], -wid * 0.4), 0.014, 0.007, sk, SK, { rad: 6 });   // and the bottom edge
  B.tube([[0.02, 0.03, 0.03], [len * 0.4, 0.07, 0.04], [len * 0.7, -0.01 - droop * 0.12, 0.05]], 0.012, 0.006, sk, SK, { rad: 5 });   // cartilage ridge
  if (type === 0) B.k(len * 0.7, 0.0 - droop * 0.2, 0.0, 0.03, 0.06, 0, 1.5, 0x14240c, DK);   // torn notch
  if (type === 1 || type === 4 || type === 2) for (let k = 0; k < (type === 4 ? 3 : 2); k++) B.tor(0.05 + k * 0.08, -0.07 - k * 0.012, 0.0, 0.032, 0.007, Math.PI / 2, 0, 0, 0xffc933, GD);
  B.pop();
}
const earGeoFor = (len, wid, droop, inner) => { const k = 'ear' + len.toFixed(2) + wid + droop + inner; return A_EARS[k] || (A_EARS[k] = A.earGeo(len, wid, droop, 1, inner)); };
const A_EARS = {};
  // ---- clothing helpers (torso space: hips y=0, shoulders y=0.5, neck y=0.6)
  function garment(B, prof, b, col, m, o = {}) {
    const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r * b, y)), o.segs || 40);
    if (o.fold) goblinKit().fold(g, o.fold[0], o.fold[1], o.fold[2], o.fold[3]);
    B.add(g, { p: [0, 0, o.z ?? 0.02], s: [1, 1, o.zs ?? 0.92], c: col, m, uv: o.uv ?? 2 });
  }
  const interp = (prof, y) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1]; if (y <= y0 && y >= y1) return r0 + (r1 - r0) * (y0 - y) / (y0 - y1 || 1); } return prof[prof.length - 1][0]; };
  const ringTeeth = (B, y, R, n, w, h, col, m, zs = 0.92, z0 = 0.02) => { for (let i = 0; i < n; i++) { const a = i / n * TAU; B.k(Math.sin(a) * R, y, Math.cos(a) * R * zs + z0, w, h * (0.7 + 0.6 * hash3(i, y, 3)), Math.PI - Math.cos(a) * 0.25, -Math.sin(a) * 0.25, col, m); } };
  const stud = (B, x, y, z, col = 0xc9a24a, r = 0.016) => B.es(x, y, z, r, r, r * 0.7, col, MT);
  const bandAt = (B, y, R, r, col, m, zs = 0.92) => B.add(new THREE.TorusGeometry(R, r, 7, 36), { p: [0, y, 0.02], r: [Math.PI / 2, 0, 0], s: [1, zs, 1], c: col, m });
  function strap(B, x0, y0, x1, y1, z, w, col, m = LT) {   // chest strap seen from the front, following the curve of the chest
    const n = 6, pts = []; for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; pts.push([x, y, z * Math.sqrt(Math.max(0.2, 1 - Math.pow(x / (0.36), 2))) + 0.02]); }
    B.tube(pts, w, w, col, m, { rad: 6, segs: 14 });
  }
  // ---- per-type torso outfit (baked into the torso mesh)
  function gaOutfit(B, type, b) {
    if (type === 0) {   // scrawny scavenger: a patched rag tunic with a ragged hem, rope belt and a satchel
      const prof = [[0.16, 0.6], [0.29, 0.5], [0.325, 0.4], [0.33, 0.22], [0.34, 0.0], [0.36, -0.12]];
      garment(B, prof, b, 0x9c7c54, CL, { fold: [9, 0.035, -0.12, 0.4] });
      ringTeeth(B, -0.1, 0.36 * b, 14, 0.05, 0.17, 0x9c7c54, CL);
      for (const [x, y, z, w, h, col, rz] of [[0.14, 0.1, 0.285, 0.1, 0.1, 0x6d6a3a, 0.1], [-0.12, 0.32, 0.28, 0.09, 0.07, 0x8a4a34, -0.2], [0.2, 0.34, 0.2, 0.08, 0.09, 0x5a7090, 0.3], [-0.2, -0.02, 0.26, 0.1, 0.08, 0xb89a62, 0.05]]) B.add(A.g.box, { p: [x * b, y, z * b], s: [w, h, 0.012], r: [0, Math.atan2(x, z) * 0.9, rz], c: col, m: CL, uv: 1.2 });   // sewn-on patches
      bandAt(B, 0.19, 0.335 * b, 0.022, 0xcaa05a, LT); B.tube([[0.2 * b, 0.19, 0.3 * b], [0.24 * b, 0.1, 0.31 * b], [0.2 * b, 0.0, 0.3 * b]], 0.01, 0.008, 0xcaa05a, LT);   // rope belt and hanging end
      strap(B, -0.28 * b, 0.55, 0.27 * b, -0.02, 0.27 * b, 0.026, 0x5a3b22);
      B.box(-0.34 * b, 0.0, 0.0, 0.1, 0.2, 0.2, 0x5a3b22, LT, { r: [0, 0, 0.18] }); B.box(-0.35 * b, 0.1, 0.0, 0.11, 0.05, 0.22, 0x70482a, LT, { r: [0, 0, 0.18] }); stud(B, -0.37 * b, 0.09, 0.0, 0xc9a24a, 0.022);   // satchel
      for (let i = 0; i < 5; i++) B.k((i - 2) * 0.07 * b, 0.55, 0.14 * b, 0.02, 0.08, Math.PI - 0.5, 0, 0x7a6a4a, CL);   // frayed collar
    }
    if (type === 1) {   // soldier: studded leather harness over a hide vest with tassets
      const prof = [[0.17, 0.58], [0.3, 0.5], [0.325, 0.4], [0.32, 0.26], [0.31, 0.1]];
      garment(B, prof, b, 0x5a3a20, LT, { uv: 2.6 });
      bandAt(B, 0.15, 0.335 * b, 0.034, 0x2e1c10, LT); B.box(0, 0.15, 0.315 * b, 0.1, 0.085, 0.03, 0xaab0b8, MT); B.box(0, 0.15, 0.332 * b, 0.05, 0.04, 0.015, 0xc9a24a, MT);
      strap(B, -0.24 * b, 0.56, 0.2 * b, 0.1, 0.27 * b, 0.032, 0x2e1c10); strap(B, 0.24 * b, 0.56, -0.2 * b, 0.1, 0.27 * b, 0.032, 0x2e1c10);
      B.add(new THREE.TorusGeometry(0.045, 0.012, 6, 16), { p: [0, 0.37, 0.3 * b], c: 0xaab0b8, m: MT });
      for (let i = 0; i < 7; i++) { const a = -0.75 + i * 0.25; stud(B, Math.sin(a) * 0.318 * b, 0.45 - (i % 2) * 0.07, Math.cos(a) * 0.3 * b + 0.01); }
      for (let i = 0; i < 6; i++) { const a = -0.7 + i * 0.28; B.box(Math.sin(a) * 0.33 * b, -0.03, Math.cos(a) * 0.3 * b + 0.01, 0.075, 0.2, 0.014, i % 2 ? 0x4a2e1a : 0x7a2a22, LT, { r: [0.12, a, 0] }); }   // tassets
      for (const s of [-1, 1]) { B.e(s * 0.35 * b, 0.53, 0, 0.12, 0.07, 0.13, 0x4a2e1a, LT, { r: [0, 0, -s * 0.3] }); for (let i = 0; i < 2; i++) stud(B, s * (0.33 + i * 0.05) * b, 0.58 - i * 0.012, 0.0, 0xc9a24a, 0.016); }
      B.box(0.3 * b, 0.02, 0.16 * b, 0.1, 0.12, 0.06, 0x3a281c, LT, { r: [0, 0.6, 0] }); stud(B, 0.31 * b, 0.0, 0.2 * b);   // belt pouch
    }
    if (type === 2) {   // warlord brute: bare scarred chest, a heavy harness, studded bands and a loin flap
      for (const s of [-1, 1]) strap(B, s * 0.28 * b, 0.56, -s * 0.2 * b, 0.02, 0.28 * b, 0.04, 0x2e1c10);
      B.add(new THREE.TorusGeometry(0.07, 0.018, 7, 18), { p: [0, 0.3, 0.3 * b], c: 0x8a9098, m: MT }); B.es(0, 0.3, 0.31 * b, 0.032, 0.032, 0.02, 0xc9a24a, MT);
      bandAt(B, 0.1, 0.335 * b, 0.04, 0x3a281c, LT); B.box(0, 0.1, 0.34 * b, 0.12, 0.1, 0.035, 0x8a9098, MT, { r: [0, 0, Math.PI / 4] });
      B.e(0, 0.1, 0.36 * b, 0.05, 0.055, 0.025, 0xe8e0c8, BN); B.es(-0.02, 0.105, 0.38 * b, 0.011, 0.014, 0.01, 0x111111, DK); B.es(0.02, 0.105, 0.38 * b, 0.011, 0.014, 0.01, 0x111111, DK);   // skull buckle
      B.box(0, 0.0, 0.22 * b, 0.26 * b, 0.28, 0.02, 0x4a3020, LT, { r: [0.1, 0, 0] }); for (let i = 0; i < 3; i++) B.box((i - 1) * 0.085, 0.02, 0.235 * b, 0.07, 0.15, 0.012, 0x7a8088, MT, { r: [0.1, 0, 0] });
      for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; B.k(Math.sin(a) * 0.15, 0.58, Math.cos(a) * 0.12 + 0.01, 0.016, 0.07, Math.cos(a) * 0.5 + 0.0, -Math.sin(a) * 0.5, 0xe8e0c8, BN); }   // bone necklace
      for (const [x, y, rz, l] of [[-0.12, 0.42, 0.7, 0.2], [-0.08, 0.36, 0.7, 0.15], [0.15, 0.2, -0.5, 0.18]]) B.tube([[x * b, y + l * 0.5, 0.29 * b], [x * b - 0.03, y, 0.3 * b], [x * b - 0.07 * Math.sign(rz) * -1, y - l * 0.5, 0.29 * b]], 0.008, 0.008, 0xd9a0a0, SK, { rad: 5 });   // claw scars
      for (const s of [-1, 1]) {   // fur mantle and a spiked pauldron (the left one is huge)
        const big = s < 0 ? 1.35 : 0.85, px = s * 0.43 * b, py = 0.56;
        A.pauldron(B, px, py, s, big, { c: 0x6c7480, c2: 0x5d6570, rim: 0xc9a24a, spikes: s < 0 ? 5 : 3 });   // T10: layered lames with curved spikes
        for (let i = 0; i < 9; i++) { const a = i * 0.7; B.k(px + Math.cos(a) * 0.2 * big, py - 0.03, Math.sin(a) * 0.2 * big, 0.035, 0.1, Math.sin(a) * 1.3 - 0.0, -Math.cos(a) * 1.3, 0x5a4636, HR); }   // fur trim
      }
    }
    if (type === 3) {   // wizard: a pleated starry robe with a gold hem, sash, mantle and clasp
      const prof = [[0.13, 0.62], [0.27, 0.54], [0.31, 0.42], [0.3, 0.26], [0.32, 0.1], [0.37, -0.12], [0.43, -0.32], [0.48, -0.5]];
      garment(B, prof, b, (x, y, z) => { const k = sstep(0.55, -0.5, y), v = 1 + (vnoise(x * 6, y * 6, z * 6) - 0.5) * 0.22; return [(0.017 + 0.07 * k) * v, (0.005 + 0.03 * k) * v, (0.14 + 0.29 * k) * v]; }, CL, { fold: [11, 0.07, -0.5, 0.1], uv: 1.5, segs: 52, zs: 1 });
      B.add(new THREE.LatheGeometry([new THREE.Vector2(0.49 * b, -0.5), new THREE.Vector2(0.48 * b, -0.44)], 52), { p: [0, 0, 0.02], c: 0xffc933, m: GD });
      B.add(new THREE.LatheGeometry([new THREE.Vector2(0.495 * b, -0.455), new THREE.Vector2(0.485 * b, -0.455)], 52), { p: [0, 0, 0.02], c: 0xffc933, m: GD });
      const star = goblinKit().star;
      for (let i = 0; i < 16; i++) { const a = (i * 2.4) % TAU, y = 0.3 - ((i * 37) % 100) / 100 * 0.7, r = interp(prof, y) * b * 1.06 + 0.012; B.add(star(0.045 + (i % 3) * 0.012, 0.02, 0.01), { p: [Math.sin(a) * r, y, Math.cos(a) * r + 0.02], r: [0, a, i], c: i % 4 ? 0xffe27a : 0xcfe8ff, m: GL, hdr: 1.2 }); }
      bandAt(B, 0.2, 0.34 * b, 0.045, 0xe8b020, MT, 1); B.box(0, 0.2, 0.34 * b, 0.1, 0.1, 0.04, 0xffc933, GD, { r: [0, 0, Math.PI / 4] }); B.es(0, 0.2, 0.37 * b, 0.03, 0.03, 0.02, 0xb070ff, GEM);
      for (const s of [-1, 1]) { B.k(s * 0.1, 0.17, 0.34 * b, 0.03, 0.2, Math.PI, 0, 0xc9a6ff, CL); B.es(s * 0.1, -0.03, 0.34 * b, 0.03, 0.03, 0.03, 0xffc933, GD); }
      B.add(new THREE.SphereGeometry(1, 28, 10, 0, TAU, 0.5, 0.95), { p: [0, 0.42, 0], s: [0.4 * b, 0.3, 0.34 * b], c: 0x7a45d8, m: CL });   // mantle
      B.tor(0, 0.42 + 0.3 * Math.cos(1.45), 0, 0.4 * b * Math.sin(1.45), 0.02, Math.PI / 2, 0, 0, 0xffc933, GD, { s: [1, 1, 0.85] });
      B.e(0, 0.56, 0.3 * b, 0.05, 0.05, 0.03, 0xffc933, GD); B.es(0, 0.56, 0.32 * b, 0.032, 0.032, 0.02, 0x55ddff, GEM);
    }
    if (type === 4) {   // king: damask tunic, ermine skirt and mantle, jewelled chain, gold pauldrons and a big buckle
      const prof = [[0.15, 0.62], [0.28, 0.54], [0.33, 0.42], [0.34, 0.26], [0.36, 0.1], [0.39, -0.05], [0.41, -0.14]];
      garment(B, prof, b, (x, y, z) => { const v = 1 + (vnoise(x * 6, y * 6, z * 6) - 0.5) * 0.2; return [(0.27 - 0.05 * sstep(0.5, -0.1, y)) * v, 0.006 * v, 0.022 * v]; }, CL, { fold: [12, 0.04, -0.14, 0.2], uv: 2.2, segs: 48 });
      B.add(new THREE.LatheGeometry([new THREE.Vector2(0.415 * b, -0.145), new THREE.Vector2(0.405 * b, -0.07)], 48), { p: [0, 0, 0.02], s: [1, 1, 0.92], c: 0xffc933, m: GD });
      for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; B.es(Math.sin(a) * 0.41 * b, -0.15, Math.cos(a) * 0.41 * b * 0.92 + 0.02, 0.075, 0.062, 0.075, 0xf7f3ea, HR); if (i % 3 === 0) B.es(Math.sin(a) * 0.41 * b, -0.17, Math.cos(a) * 0.41 * b * 0.92 + 0.07, 0.016, 0.026, 0.01, 0x15110f, DK); }
      bandAt(B, 0.2, 0.345 * b, 0.045, 0x4a0a14, LT); B.box(0, 0.2, 0.355 * b, 0.17, 0.13, 0.04, 0xffc933, GD); B.es(0, 0.2, 0.378 * b, 0.045, 0.045, 0.025, 0xff3355, GEM, { hdr: 1.1 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; stud(B, Math.sin(a) * 0.345 * b, 0.2, Math.cos(a) * 0.345 * b * 0.92 + 0.02, 0xffc933, 0.02); }
      B.add(new THREE.SphereGeometry(1, 30, 10, 0, TAU, 0.5, 0.95), { p: [0, 0.44, 0], s: [0.42 * b, 0.3, 0.35 * b], c: 0xf7f3ea, m: HR, uv: 3 });   // ermine mantle
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + 0.2; B.es(Math.sin(a) * 0.3 * b, 0.45 - 0.0, Math.cos(a) * 0.26 * b + 0.01, 0.014, 0.03, 0.01, 0x15110f, DK, { r: [0.6, a, 0] }); }
      B.tor(0, 0.44 + 0.3 * Math.cos(1.45), 0, 0.42 * b * Math.sin(1.45), 0.025, Math.PI / 2, 0, 0, 0xffc933, GD, { s: [1, 1, 0.84] });
      B.tube([[-0.3 * b, 0.6, 0.2 * b], [-0.17 * b, 0.46, 0.31 * b], [0, 0.4, 0.34 * b], [0.17 * b, 0.46, 0.31 * b], [0.3 * b, 0.6, 0.2 * b]], 0.013, 0.013, 0xffc933, GD, { rad: 6, segs: 30 });
      B.es(0, 0.36, 0.345 * b, 0.04, 0.05, 0.025, 0xff3355, GEM); B.add(new THREE.OctahedronGeometry(1), { p: [0, 0.37, 0.335 * b], s: [0.06, 0.075, 0.015], c: 0xffc933, m: GD });
      for (const s of [-1, 1]) {
        const px = s * 0.43 * b, py = 0.55;
        A.pauldron(B, px, py, s, 0.8, { c: 0xffc933, c2: 0xf0b428, rim: 0xffe38a, m: GD, edge: GD, spikes: 3, spike: 0xffc933, gem: s > 0 ? 0xff3355 : 0x3377ff });   // T10: layered gold lames
      }
      for (let i = 0; i < 9; i++) { const a = Math.PI + (i - 4) * 0.36, hgt = 0.34 - Math.abs(i - 4) * 0.035; B.add(A.g.cone, { p: [Math.sin(a) * 0.3, 0.68, Math.cos(a) * 0.25 - 0.03], s: [0.06, hgt, 0.015], r: [-Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35], c: 0x7a0a1e, m: CL }); if (i % 2) B.es(Math.sin(a) * 0.32, 0.68 + hgt, Math.cos(a) * 0.27 - 0.03, 0.02, 0.02, 0.02, 0xffc933, GD); }   // standing fan collar
    }
  }
  // ---- per-type head gear and hair (baked into the head mesh)
  const mossC = [0x5f8a3a, 0x7ea84a, 0x4a6a2a, 0x8fb858];
  function gaHeadGear(B, type, b) {
    const white = 0xf2f0fa;
    if (type === 0) {   // bandana with knot tails, a wild tuft, nose ring
      B.add(new THREE.TorusGeometry(0.262, 0.036, 8, 30), { p: [0, 0.355, -0.015], r: [Math.PI / 2 + 0.22, 0, 0], s: [1, 1.04, 1], c: 0x8a1f1f, m: CL, uv: 3 });
      B.tube([[0.08, 0.3, -0.3], [0.16, 0.2, -0.42], [0.2, 0.1, -0.5]], 0.035, 0.012, 0x8a1f1f, CL, { rad: 6 }); B.tube([[0.0, 0.3, -0.3], [-0.04, 0.18, -0.44], [-0.1, 0.06, -0.5]], 0.03, 0.01, 0x8a1f1f, CL, { rad: 6 });
      for (let i = 0; i < 5; i++) B.k((i - 2) * 0.05, 0.45, 0.0, 0.02, 0.14, 0.2, (i - 2) * 0.35, 0x3a281c, HR);
      B.tor(0.0, 0.06, 0.375, 0.03, 0.007, 0, 0, 0, 0xeedd88, GD);
    }
    if (type === 1) {   // open kettle helm with a red horsehair crest and a chin strap
      B.add(new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI / 2), { p: [0, 0.3, 0], s: [0.325, 0.25, 0.31], c: 0x9aa3ad, m: MT, v: 0.1 });
      B.tor(0, 0.305, 0, 0.33, 0.026, Math.PI / 2, 0, 0, 0x8a929c, MT, { s: [1, 0.95, 1] }); B.tor(0, 0.305, 0, 0.345, 0.012, Math.PI / 2, 0, 0, 0xc9a24a, MT);
      for (let i = 0; i < 6; i++) stud(B, Math.sin(-0.9 + i * 0.36) * 0.31, 0.38, Math.cos(-0.9 + i * 0.36) * 0.29, 0xc9a24a, 0.014);
      for (let i = 0; i < 9; i++) { const z = -0.22 + i * 0.055; B.k(0, 0.5 - Math.abs(i - 4) * 0.012, z, 0.032, 0.16 - Math.abs(i - 4) * 0.01, -(i - 4) * 0.07, 0, i % 2 ? 0xc23a22 : 0xe0661a, HR); }
      for (const s of [-1, 1]) B.tube([[s * 0.3, 0.27, 0.02], [s * 0.25, 0.08, 0.14], [s * 0.1, -0.02, 0.2]], 0.012, 0.012, 0x3a281c, LT, { rad: 5 });
    }
    if (type === 2) {   // war paint, broken horn stubs and heavy facial scars
      const paint = 0xe8e0c8;
      for (const x of [-0.07, 0, 0.07]) B.add(A.g.box, { p: [x, 0.43, 0.2 + (1 - Math.abs(x) * 5) * 0.02], r: [-0.45, 0, 0], s: [0.025, 0.11, 0.008], c: paint, m: DK });
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) B.add(A.g.box, { p: [s * (0.22 + i * 0.01), 0.1 + i * 0.035, 0.18], r: [0, -s * 0.7, s * 0.3], s: [0.07, 0.014, 0.008], c: i === 1 ? 0xb01818 : paint, m: DK });
        B.tube([[s * 0.17, 0.46, 0.04], [s * 0.26, 0.5, 0.0], [s * 0.3, 0.6, -0.06]], 0.045, 0.005, 0xe8e0c8, BN, { rad: 7 });   // horn stubs
      }
      B.tube([[0.14, 0.4, 0.22], [0.1, 0.3, 0.27], [0.12, 0.2, 0.25], [0.17, 0.12, 0.21]], 0.012, 0.012, 0xd9a0a0, SK, { rad: 5 });   // big scar through the eye
      B.tube([[-0.2, 0.2, 0.2], [-0.12, 0.16, 0.26], [-0.02, 0.15, 0.3]], 0.009, 0.009, 0xd9a0a0, SK, { rad: 5 });
      for (let i = 0; i < 5; i++) B.es(0, 0.58 - Math.abs(i - 2) * 0.03, -0.16 + i * 0.09, 0.02, 0.02, 0.02, 0xc9a24a, MT);
    }
    if (type === 3) {   // moss beard in tiers, moustache, bushy brows and long white hair
      for (let j = 0; j < 5; j++) {
        const n = 9 - j, len = 0.2 + j * 0.08, w = 0.04 - j * 0.003;
        for (let i = 0; i < n; i++) {
          const a = (i - (n - 1) / 2) * (0.48 - j * 0.04), x = Math.sin(a) * (0.17 - j * 0.014), y = 0.06 - j * 0.05, z = 0.2 + Math.cos(a) * 0.07 + j * 0.035, L = len * (1 - Math.abs(a) * 0.3), sw = Math.sin(i * 2.1 + j) * 0.03;
          B.tube([[x, y, z], [x * 1.05 + sw, y - L * 0.35, z + 0.045], [x * 0.9 - sw, y - L * 0.7, z + 0.03], [x * 0.7, y - L, z + 0.0]], w, 0.003, mossC[(i + j) % 4], HR, { rad: 6, segs: 12, bulge: 0.2 });
        }
      }
      for (const s of [-1, 1]) {
        B.tube([[s * 0.04, 0.15, 0.31], [s * 0.1, 0.12, 0.33], [s * 0.19, 0.07, 0.3], [s * 0.2, 0.0, 0.27]], 0.032, 0.006, white, HR, { rad: 6 });   // moustache
        B.tube([[s * 0.06, 0.34, 0.27], [s * 0.15, 0.37, 0.23], [s * 0.23, 0.33, 0.14]], 0.04, 0.012, white, HR, { rad: 6 });   // brows
        B.tube([[s * 0.2, 0.42, 0.0], [s * 0.3, 0.3, -0.05], [s * 0.33, 0.12, -0.08], [s * 0.34, -0.08, -0.06]], 0.045, 0.01, white, HR, { rad: 6 });   // hair at the sides
      }
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.35; B.tube([[Math.sin(a) * 0.22, 0.4, -0.2], [Math.sin(a) * 0.27, 0.2, -0.3], [Math.sin(a) * 0.25, -0.05, -0.32]], 0.05, 0.01, white, HR, { rad: 6 }); }
      B.es(0.05, 0.02, 0.4, 0.03, 0.03, 0.02, 0x6a8a3a, HR);
      B.push([0, 0.4, 0], [-0.06, 0, 0.07]); gaHat(B); B.pop();   // the crooked hat is baked into the head so the whole wizard stays within the draw-call budget
    }
    if (type === 4) {   // braided beard, curled moustache, smirk, sideburns, earring gems
      const bear = 0x5a2210;
      for (let j = 0; j < 3; j++) { const n = 7 - j; for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.5, x = Math.sin(a) * (0.15 - j * 0.02), y = 0.04 - j * 0.06, z = 0.24 + Math.cos(a) * 0.06 + j * 0.03, L = 0.12 + j * 0.05 + (i % 2) * 0.03, sw = Math.sin(i * 2.3 + j) * 0.03; B.tube([[x, y, z], [x * 1.1 + sw, y - L * 0.5, z + 0.05], [x * 0.8 - sw, y - L, z + 0.04]], 0.045 - j * 0.005, 0.004, bear, HR, { rad: 6, segs: 10, bulge: 0.25 }); } }
      for (const s of [-1, 1]) {
        B.tube([[s * 0.04, 0.15, 0.31], [s * 0.1, 0.13, 0.33], [s * 0.18, 0.15, 0.3], [s * 0.2, 0.2, 0.27]], 0.028, 0.005, bear, HR, { rad: 6 });   // curled moustache
        for (let k = 0; k < 6; k++) B.es(s * (0.08 + k * 0.004), -0.0 - k * 0.055 - 0.05, 0.3 + k * 0.012, 0.026, 0.03, 0.026, k % 2 ? 0xffc933 : bear, k % 2 ? GD : HR);   // beaded braids
        B.tube([[s * 0.27, 0.22, 0.1], [s * 0.3, 0.12, 0.12], [s * 0.29, 0.02, 0.14]], 0.04, 0.012, bear, HR, { rad: 6 });   // sideburns
        B.tor(s * 0.4, 0.14, -0.02, 0.055, 0.012, 0, Math.PI / 2, 0, 0xffc933, GD); B.es(s * 0.4, 0.085, -0.02, 0.026, 0.026, 0.026, s > 0 ? 0xff3355 : 0x3377ff, GEM);
      }
      B.tube([[0.09, 0.118, 0.255], [0.14, 0.14, 0.235], [0.19, 0.172, 0.2]], 0.009, 0.007, 0x1a0608, DK, { rad: 5 });   // smirk
      B.es(0.2, 0.15, 0.215, 0.02, 0.012, 0.01, 0x14240c, DK);
      B.tube([[-0.04, 0.36, 0.27], [-0.1, 0.4, 0.25], [-0.18, 0.4, 0.2]], 0.034, 0.014, 0x6e1010, HR, { rad: 6 });   // one arched brow
      // crown: gold band with ermine, eight fleur points with gems, crossing arches, orb and cross
      B.push([0, 0.38, 0], [-0.1, 0, 0]);
      B.add(new THREE.CylinderGeometry(0.29, 0.275, 0.17, 36, 1, true), { p: [0, 0.085, 0], s: [1, 1, 0.93], c: 0xffc933, m: GD });
      B.add(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2), { p: [0, 0.03, 0], s: [0.27, 0.27, 0.25], c: 0xa0102a, m: CL });
      B.tor(0, 0.0, 0, 0.28, 0.04, Math.PI / 2, 0, 0, 0xf7f3ea, HR, { s: [1, 0.93, 1] }); B.tor(0, 0.19, 0, 0.292, 0.014, Math.PI / 2, 0, 0, 0xffc933, GD, { s: [1, 0.93, 1] });
      const gc = [0xff3355, 0x3377ff, 0x33dd77];
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.39, tall = i % 2 ? 0.2 : 0.3; B.k(Math.sin(a) * 0.285, 0.17, Math.cos(a) * 0.265, 0.05, tall, 0, 0, 0xffc933, GD); B.es(Math.sin(a) * 0.285, 0.17 + tall + 0.01, Math.cos(a) * 0.265, 0.026, 0.026, 0.026, gc[i % 3], GEM); B.es(Math.sin(a + 0.39) * 0.285, 0.09, Math.cos(a + 0.39) * 0.265, 0.03, 0.04, 0.02, gc[(i + 1) % 3], GEM); }
      for (const rot of [0, Math.PI / 2]) B.tube([[-0.285, 0.15, 0], [-0.27, 0.3, 0], [-0.15, 0.42, 0], [0, 0.46, 0], [0.15, 0.42, 0], [0.27, 0.3, 0], [0.285, 0.15, 0]].map(([x, y, z]) => [x * Math.cos(rot), y, x * Math.sin(rot)]), 0.02, 0.02, 0xffc933, GD, { rad: 7, segs: 30 });
      B.es(0, 0.5, 0, 0.055, 0.055, 0.055, 0xffc933, GD); B.box(0, 0.6, 0, 0.018, 0.1, 0.018, 0xffc933, GD); B.box(0, 0.62, 0, 0.06, 0.018, 0.018, 0xffc933, GD); B.es(0, 0.085, 0.272, 0.045, 0.06, 0.025, 0xff3355, GEM, { hdr: 1.2 });
      B.pop();
    }
  }
  function gaHat(B) {   // wizard hat: wavy brim, crooked bending cone, band, buckle and glowing stars
    const prof = [[0.2, -0.01], [0.4, -0.035], [0.56, -0.005], [0.63, 0.07], [0.61, 0.08], [0.55, 0.025], [0.4, 0.005], [0.2, 0.02]].map(([x, y]) => new THREE.Vector2(x, y)), bg = new THREE.LatheGeometry(prof, 44), p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, p.getY(i) + Math.sin(Math.atan2(x, z) * 3 + 0.6) * 0.06 * Math.max(0, r - 0.25)); }
    bg.computeVertexNormals();
    const hatC = (x, y, z) => { const k = 1 + (vnoise(x * 5, y * 5, z * 5) - 0.5) * 0.2, t = sstep(0, 0.9, y); return [(0.05 + 0.04 * t) * k, (0.02 + 0.02 * t) * k, (0.3 + 0.12 * t) * k]; };
    B.add(bg, { c: hatC, m: CL, uv: 1.2 });
    B.tor(0, 0.075, 0, 0.62, 0.012, Math.PI / 2, 0, 0, 0xffc933, GD);
    const pts = [[0, 0, 0], [0.0, 0.25, 0.0], [0.04, 0.5, 0.0], [0.15, 0.72, 0.0], [0.33, 0.86, 0.02], [0.52, 0.86, 0.04]];
    B.tube(pts, 0.31, 0.012, hatC, CL, { rad: 24, segs: 30, uv: 1.6 });
    B.add(new THREE.TorusGeometry(0.295, 0.028, 8, 36), { p: [0, 0.07, 0], r: [Math.PI / 2, 0, 0], c: 0xffc933, m: GD });
    B.box(0, 0.075, 0.305, 0.12, 0.12, 0.035, 0xffc933, GD, { r: [0, 0, Math.PI / 4] }); B.es(0, 0.075, 0.325, 0.04, 0.04, 0.025, 0xff5588, GEM);
    for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) { const a = s * k * 0.55; B.es(Math.sin(a) * 0.295, 0.075, Math.cos(a) * 0.295, 0.024, 0.024, 0.024, 0x55ddff, GEM); }
    const star = goblinKit().star, curve = new THREE.CatmullRomCurve3(pts.map(q => new V3(...q)));
    for (let i = 0; i < 9; i++) { const t = 0.12 + i * 0.085, c = curve.getPointAt(t), rr = 0.31 + (0.012 - 0.31) * t; B.add(star(0.04 + (i % 3) * 0.012, 0.018, 0.012), { p: [c.x + (i % 2 ? 0.05 : -0.05) * (1 - t), c.y, c.z + rr + 0.004], r: [0, (i % 2 ? 0.5 : -0.5), i * 0.7], c: 0xffe27a, m: GL, hdr: 1.3 }); }
    B.add(star(0.13, 0.055, 0.03), { p: [0.58, 0.92, 0.05], c: 0xffe27a, m: GL, hdr: 1.5 });
  }
  // ---- per-type arm gear. part: 'sh' (upper arm, origin = shoulder) or 'el' (forearm and hand, origin = elbow)
  function gaArmGear(B, type, s, b, part) {
    const L = GAT[type].limb;
    if (type === 0 && part === 'el') { B.tor(0, -0.17, 0, 0.055, 0.016, Math.PI / 2, 0, 0, 0x8a1f1f, CL); B.tor(0, -0.2, 0, 0.052, 0.012, Math.PI / 2, 0, 0, 0x8a1f1f, CL); }
    if (type === 1) {
      if (part === 'el') { B.lathe([[0.058, -0.1], [0.075, -0.12], [0.078, -0.22], [0.062, -0.245]].map(([x, y]) => [x * b, y]), 16, 0x4a2e1a, LT); for (let i = 0; i < 4; i++) { const a = i * 1.57; B.k(Math.sin(a) * 0.07 * b, -0.235, Math.cos(a) * 0.07 * b, 0.014, 0.055, Math.cos(a) * 1.3, -Math.sin(a) * 1.3, 0xaab0b8, MT); } stud(B, 0, -0.14, 0.078 * b); }
      if (part === 'sh') B.tor(0, -0.12, 0, 0.074 * b, 0.012, Math.PI / 2, 0, 0, 0x4a2e1a, LT);
    }
    if (type === 2) {
      if (part === 'el') { B.lathe([[0.075, -0.09], [0.11, -0.11], [0.115, -0.23], [0.085, -0.25]].map(([x, y]) => [x * b, y]), 18, 0x7a8088, MT); for (let i = 0; i < 4; i++) B.k(0, -0.13 - i * 0.035, 0.1 * b, 0.016, 0.075, Math.PI / 2, 0, 0x9aa0a8, MT); B.tor(0, -0.09, 0, 0.1 * b, 0.014, Math.PI / 2, 0, 0, 0xc9a24a, MT); }
      if (part === 'sh') { B.add(new THREE.CylinderGeometry(0.105 * b, 0.105 * b, 0.04, 14, 1, true), { p: [0, -0.1, 0], c: 0xffc933, m: GD }); }
    }
    if (type === 3) {   // bell sleeves with gold cuffs
      if (part === 'sh') B.tube([[0, 0.0, 0], [0, -0.15, 0.01], [0, -0.3, 0]], 0.1 * b, 0.08 * b, (x, y, z) => { const k = 1 + (vnoise(x * 6, y * 6, z * 6) - 0.5) * 0.2; return [0.09 * k, 0.04 * k, 0.38 * k]; }, CL, { rad: 12, uv: 1.4 });
      if (part === 'el') {
        B.lathe([[0.075, 0.02], [0.1, -0.1], [0.15, -0.22], [0.17, -0.31]], 24, (x, y, z) => { const k = 1 + (vnoise(x * 6, y * 6, z * 6) - 0.5) * 0.2; return [0.1 * k, 0.045 * k, 0.4 * k]; }, CL, { uv: 1.4 });
        B.tor(0, -0.31, 0, 0.17, 0.02, Math.PI / 2, 0, 0, 0xffc933, GD); B.tor(0, -0.265, 0, 0.152, 0.01, Math.PI / 2, 0, 0, 0xffc933, GD);
      }
    }
    if (type === 4) {
      if (part === 'sh') { B.tor(0, -0.12, 0, 0.082 * b, 0.016, Math.PI / 2, 0, 0, 0xffc933, GD); B.es(0, -0.12, 0.085 * b, 0.02, 0.02, 0.012, 0xff3355, GEM); }
      if (part === 'el') {
        B.add(new THREE.CylinderGeometry(0.07 * b, 0.065 * b, 0.1, 14, 1, true), { p: [0, -0.19, 0], c: 0xffc933, m: GD });
        B.tor(0, -0.145, 0, 0.073 * b, 0.025, Math.PI / 2, 0, 0, 0xf7f3ea, HR); for (let i = 0; i < 6; i++) B.es(Math.sin(i) * 0.075 * b, -0.145, Math.cos(i) * 0.075 * b, 0.012, 0.012, 0.007, 0x15110f, DK);
      }
    }
  }
  // ---- armour overlays by item family (worn over the type's own outfit; the starting armour of a type uses its baked outfit)
  function gaArmor(B, type, fam, trim, b) {
    const R = [[0.2, 0.58], [0.335, 0.5], [0.365, 0.4], [0.36, 0.26], [0.365, 0.14], [0.35, 0.0], [0.33, -0.07]];
    if (fam === 'cloth') {
      garment(B, R, b, 0xb8a47a, CL, { fold: [10, 0.03, -0.1, 0.4] }); ringTeeth(B, -0.06, 0.34 * b, 15, 0.045, 0.16, 0xb8a47a, CL);
      bandAt(B, 0.52, 0.2 * b, 0.02, trim, GD); bandAt(B, -0.04, 0.345 * b, 0.014, trim, GD); bandAt(B, 0.17, 0.37 * b, 0.025, 0x7a5a34, LT);
      B.add(A.g.box, { p: [0.15 * b, 0.1, 0.35 * b], s: [0.09, 0.09, 0.012], c: 0x8a5a44, m: CL });
    }
    if (fam === 'leather') {
      garment(B, R, b, 0x6a4524, LT, { uv: 2.6 }); bandAt(B, 0.15, 0.38 * b, 0.034, 0x2e1c10, LT); B.box(0, 0.15, 0.355 * b, 0.1, 0.085, 0.03, trim, MT);
      for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.225; stud(B, Math.sin(a) * 0.37 * b, 0.46 - (i % 2) * 0.07, Math.cos(a) * 0.34 * b + 0.03, trim, 0.016); }
      bandAt(B, 0.52, 0.22 * b, 0.03, 0x4a2e1a, LT);
      for (let i = 0; i < 7; i++) { const a = -0.8 + i * 0.27; B.box(Math.sin(a) * 0.37 * b, -0.04, Math.cos(a) * 0.33 * b + 0.02, 0.07, 0.17, 0.014, i % 2 ? 0x4a2e1a : 0x6a4524, LT, { r: [0.1, a, 0] }); }
    }
    if (fam === 'mail') {   // rows of overlapping scales with a tier-coloured last row
      const rows = 9; for (let r = 0; r < rows; r++) {
        const y = 0.54 - r * 0.07, rad = interp(R, y) * b + 0.006, n = Math.max(10, Math.round(rad * 2 * Math.PI / 0.07)), col = [0x7e8794, 0x9aa4b0];
        for (let i = 0; i < n; i++) { const a = (i + (r % 2) * 0.5) / n * TAU; B.es(Math.sin(a) * rad, y, Math.cos(a) * rad * 0.93 + 0.02, 0.05, 0.04, 0.014, r === rows - 1 ? trim : col[(i + r) % 2], MT, { r: [0.25, a, 0], v: 0.12 }); }
      }
      B.tor(0, 0.57, 0.01, 0.2 * b, 0.032, Math.PI / 2, 0, 0, 0x8c96a2, MT); bandAt(B, 0.14, 0.375 * b, 0.016, 0x3a281c, LT);
    }
    if (fam === 'harness') {
      for (const s of [-1, 1]) strap(B, s * 0.3 * b, 0.56, -s * 0.22 * b, 0.0, 0.31 * b, 0.045, 0x2e1c10);
      B.add(new THREE.TorusGeometry(0.075, 0.02, 7, 18), { p: [0, 0.3, 0.34 * b], c: 0x8a9098, m: MT }); B.es(0, 0.3, 0.35 * b, 0.035, 0.035, 0.02, trim, GD);
      bandAt(B, 0.1, 0.375 * b, 0.04, 0x3a281c, LT); for (let i = 0; i < 6; i++) stud(B, Math.sin(-0.7 + i * 0.28) * 0.375 * b, 0.1, Math.cos(-0.7 + i * 0.28) * 0.35 * b + 0.02, trim, 0.018);
      for (const s of [-1, 1]) A.pauldron(B, s * 0.43 * b, 0.55, s, 0.78, { c: 0x7a8088, c2: 0x687078, rim: trim, spikes: 3 });   // T10
      for (let i = 0; i < 5; i++) B.box((i - 2) * 0.1 * b, -0.02, 0.3 * b, 0.075, 0.2, 0.012, 0x3a281c, LT, { r: [0.12, 0, 0] });
    }
    if (fam === 'plate') {
      garment(B, R, b, 0x8c96a2, MT, { uv: 1, segs: 40 });
      B.box(0, 0.38, 0.365 * b, 0.03, 0.34, 0.03, 0xaab4c0, MT); for (const s of [-1, 1]) B.tube([[s * 0.04, 0.54, 0.33 * b], [s * 0.2 * b, 0.4, 0.34 * b], [s * 0.1 * b, 0.2, 0.37 * b]], 0.01, 0.01, trim, GD, { rad: 5 });
      for (let i = 0; i < 3; i++) bandAt(B, 0.12 - i * 0.06, (0.375 - i * 0.012) * b, 0.026, i % 2 ? 0x7a8490 : 0x9aa4b0, MT);
      B.tor(0, 0.57, 0.01, 0.2 * b, 0.04, Math.PI / 2, 0, 0, 0x8c96a2, MT); bandAt(B, 0.55, 0.205 * b, 0.012, trim, GD);
      for (const s of [-1, 1]) A.pauldron(B, s * 0.43 * b, 0.54, s, 0.85, { c: 0x8c96a2, c2: 0x7a8490, rim: trim, edge: GD, gem: trim });   // T10: plate lames, no spikes
      for (let i = 0; i < 7; i++) { const a = -0.85 + i * 0.28; stud(B, Math.sin(a) * 0.37 * b, 0.34, Math.cos(a) * 0.35 * b + 0.03, 0xc9d2dc, 0.012); }
    }
    if (fam === 'robe') {
      const prof = [[0.2, 0.58], [0.335, 0.5], [0.34, 0.3], [0.37, 0.05], [0.42, -0.2], [0.46, -0.42]];
      garment(B, prof, b, (x, y) => [0.07, 0.04, 0.3 + 0.1 * sstep(0.5, -0.4, y)], CL, { fold: [10, 0.06, -0.42, 0.1], zs: 1, segs: 44 });
      B.add(new THREE.LatheGeometry([new THREE.Vector2(0.47 * b, -0.43), new THREE.Vector2(0.46 * b, -0.37)], 44), { p: [0, 0, 0.02], c: trim, m: GD }); bandAt(B, 0.22, 0.36 * b, 0.04, 0xe8b020, MT, 1);
    }
    if (fam === 'royal') {
      const prof = [[0.2, 0.58], [0.34, 0.5], [0.365, 0.35], [0.4, 0.1], [0.42, -0.1]];
      garment(B, prof, b, 0xb3122b, CL, { fold: [12, 0.05, -0.1, 0.3], zs: 1 }); B.add(new THREE.LatheGeometry([new THREE.Vector2(0.425 * b, -0.1), new THREE.Vector2(0.415 * b, -0.04)], 44), { p: [0, 0, 0.02], c: trim, m: GD });
      B.add(new THREE.SphereGeometry(1, 26, 10, 0, TAU, 0.55, 0.9), { p: [0, 0.44, 0], s: [0.45 * b, 0.3, 0.38 * b], c: 0xf7f3ea, m: HR, uv: 3 }); B.tor(0, 0.44 + 0.3 * Math.cos(1.45), 0, 0.45 * b * Math.sin(1.45), 0.025, Math.PI / 2, 0, 0, trim, GD, { s: [1, 1, 0.84] });
    }
  }
  // ARMOUR2-BEGIN: overlays for the nine families added in items.js (light, bone, fur, scrap, spiked, lamellar, bulwark, gilded). Same torso space and helpers as gaArmor above.
  const ARMOUR2_FAMS = { light: 1, bone: 1, fur: 1, scrap: 1, spiked: 1, lamellar: 1, bulwark: 1, gilded: 1 };
  function gaArmor2(B, type, fam, trim, b) {
    const R = [[0.2, 0.58], [0.335, 0.5], [0.365, 0.4], [0.36, 0.26], [0.365, 0.14], [0.35, 0.0], [0.33, -0.07]];
    if (fam === 'light') {   // a thin dyed wrap: one sash across the chest, a belt and a trailing tail, nothing heavy
      garment(B, R.slice(2), b, 0x3f7f6a, CL, { fold: [8, 0.02, -0.1, 0.3] });
      strap(B, 0.32 * b, 0.56, -0.2 * b, 0.0, 0.31 * b, 0.07, 0xd8c890, CL); bandAt(B, 0.06, 0.36 * b, 0.03, 0xd8c890, CL);
      B.box(-0.1 * b, -0.12, 0.3 * b, 0.07, 0.3, 0.012, 0xd8c890, CL, { r: [0.12, 0, 0.1] }); B.es(0.1 * b, 0.07, 0.355 * b, 0.025, 0.025, 0.015, trim, GD);
    }
    if (fam === 'bone') {   // curved ribs over the chest, a vertebra spine and skull-bone pauldrons
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) B.tube([[s * 0.03, 0.46 - i * 0.075, 0.37 * b], [s * 0.2 * b, 0.47 - i * 0.075, 0.33 * b], [s * 0.34 * b, 0.43 - i * 0.075, 0.12 * b]], 0.02, 0.013, 0xe8dec0, BN, { rad: 6 });
      for (let i = 0; i < 6; i++) B.es(0, 0.52 - i * 0.08, 0.38 * b, 0.026, 0.03, 0.022, 0xd8cfb0, BN);
      bandAt(B, 0.06, 0.37 * b, 0.02, 0x4a3a28, LT); for (const s of [-1, 1]) A.pauldron(B, s * 0.42 * b, 0.55, s, 0.68, { c: 0xe8dec0, c2: 0xd8cfb0, rim: 0xbfb393, m: BN, edge: BN, spikes: 1, spike: 0xe8dec0 });   // T10: bone lames with a horn
    }
    if (fam === 'fur') {   // shaggy hide over the shoulders and a pelt hem, belted
      garment(B, R, b, 0x6b5238, HR, { uv: 3, fold: [14, 0.05, -0.1, 0.5] }); ringTeeth(B, 0.5, 0.35 * b, 18, 0.07, 0.15, 0x8c6c48, HR); ringTeeth(B, -0.04, 0.35 * b, 20, 0.065, 0.17, 0x7a5c3c, HR);
      B.add(new THREE.TorusGeometry(0.29 * b, 0.07, 8, 26), { p: [0, 0.56, 0.0], r: [Math.PI / 2, 0, 0], c: 0x9a7a52, m: HR, uv: 3 }); bandAt(B, 0.14, 0.375 * b, 0.025, 0x2e1c10, LT); B.box(0, 0.14, 0.375 * b, 0.07, 0.06, 0.02, trim, MT);
    }
    if (fam === 'scrap') {   // mismatched riveted patches of salvaged metal on a hide base
      garment(B, R, b, 0x4a3a2a, LT, { uv: 2.6 });
      const pl = [[-0.17, 0.4, 0.2, 0.2, 0.2], [0.14, 0.44, 0.17, 0.15, -0.1], [-0.04, 0.2, 0.22, 0.26, 0.05], [0.2, 0.2, 0.15, 0.2, 0.12], [-0.22, 0.12, 0.17, 0.13, -0.15]];
      pl.forEach(([x, y, w, h, rz], i) => { const a = x / 0.36; B.box(x * b, y, Math.cos(a) * 0.36 * b + 0.02, w, h, 0.022, i % 2 ? 0x8a6a4a : 0x7d8590, MT, { r: [0.08, a, rz] }); for (const [dx, dy] of [[-1, -1], [1, 1]]) stud(B, x * b + dx * w * 0.38, y + dy * h * 0.36, Math.cos(a) * 0.37 * b + 0.04, 0xb0b8c0, 0.012); });
      A.pauldron(B, -0.42 * b, 0.56, -1, 0.78, { c: 0x6a6e76, c2: 0x5a5e66, rim: 0x9a8a6a }); A.pauldron(B, 0.43 * b, 0.55, 1, 0.66, { c: 0x8a6a4a, c2: 0x7a5c40, rim: 0xa0a8b0 });   // T10: mismatched salvaged pauldrons bandAt(B, 0.02, 0.37 * b, 0.02, 0x2e1c10, LT);
    }
    if (fam === 'spiked') {   // dark hide harness bristling with spikes on the shoulders and across the chest
      for (const s of [-1, 1]) strap(B, s * 0.3 * b, 0.56, -s * 0.22 * b, 0.0, 0.31 * b, 0.05, 0x22160e);
      garment(B, R.slice(3), b, 0x2e2018, LT, { uv: 2.6 }); bandAt(B, 0.1, 0.375 * b, 0.034, 0x14100c, LT);
      for (let i = 0; i < 6; i++) { const a = -0.75 + i * 0.3; B.k(Math.sin(a) * 0.375 * b, 0.1, Math.cos(a) * 0.35 * b + 0.03, 0.022, 0.1, 0.9, -a, 0xa0a8b0, MT); }
      for (const s of [-1, 1]) A.pauldron(B, s * 0.43 * b, 0.55, s, 0.72, { c: 0x3a3a40, c2: 0x2e2e34, rim: 0xa0a8b0, spikes: 4, spike: 0xa0a8b0 });   // T10
    }
    if (fam === 'lamellar') {   // rows of small laced plates, each row a little wider than the one above
      for (let r = 0; r < 7; r++) { const y = 0.5 - r * 0.08, rad = interp(R, y) * b + 0.008, n = Math.max(12, Math.round(rad * 2 * Math.PI / 0.075));
        for (let i = 0; i < n; i++) { const a = (i + (r % 2) * 0.5) / n * TAU; B.box(Math.sin(a) * rad, y, Math.cos(a) * rad * 0.93 + 0.02, 0.06, 0.1, 0.012, r % 2 ? 0x8a5a3a : 0x6e4a34, LT, { r: [0.12, a, 0] }); } }
      bandAt(B, 0.55, 0.22 * b, 0.02, 0x2e1c10, LT); bandAt(B, 0.14, 0.38 * b, 0.014, trim, GD); B.tor(0, 0.57, 0.01, 0.2 * b, 0.034, Math.PI / 2, 0, 0, 0x6e4a34, LT);
    }
    if (fam === 'bulwark') {   // slab plate: tall front shield-plate, one huge slab pauldron, heavy waist band
      garment(B, R, b, 0x6a727c, MT, { uv: 1, segs: 40 });
      B.box(0, 0.3, 0.37 * b, 0.26, 0.5, 0.045, 0x8a929c, MT); B.box(0, 0.3, 0.395 * b, 0.07, 0.42, 0.02, trim, GD); B.box(0, 0.3, 0.395 * b, 0.2, 0.07, 0.02, trim, GD);
      for (const [x, y] of [[-0.1, 0.5], [0.1, 0.5], [-0.1, 0.1], [0.1, 0.1]]) stud(B, x, y, 0.4 * b, 0xc9d2dc, 0.014);
      bandAt(B, 0.04, 0.38 * b, 0.04, 0x4a525c, MT); B.tor(0, 0.57, 0.01, 0.2 * b, 0.045, Math.PI / 2, 0, 0, 0x6a727c, MT);
      A.pauldron(B, -0.45 * b, 0.54, -1, 1.12, { c: 0x8a929c, c2: 0x7a828c, rim: trim, edge: GD }); A.pauldron(B, 0.43 * b, 0.55, 1, 0.78, { c: 0x6a727c, c2: 0x5a626c, rim: 0xa0a8b0 });   // T10: one huge slab pauldron
    }
    if (fam === 'gilded') {   // vault plate: polished steel breastplate with gold edging, a gem, gold pauldrons
      garment(B, R, b, 0xa6aeb8, MT, { uv: 1, segs: 40 });
      B.box(0, 0.38, 0.365 * b, 0.035, 0.34, 0.03, 0xf2c14a, GD); for (let i = 0; i < 3; i++) bandAt(B, 0.14 - i * 0.07, (0.375 - i * 0.012) * b, 0.024, i % 2 ? 0xf2c14a : 0xc9d2dc, i % 2 ? GD : MT);
      B.tor(0, 0.57, 0.01, 0.2 * b, 0.04, Math.PI / 2, 0, 0, 0xf2c14a, GD); B.es(0, 0.3, 0.385 * b, 0.032, 0.04, 0.02, 0xd02a4a, GEM);
      for (const s of [-1, 1]) A.pauldron(B, s * 0.43 * b, 0.54, s, 0.88, { c: 0xf2c14a, c2: 0xe0aa38, rim: 0xc9d2dc, m: GD, gem: 0xd02a4a });   // T10: gold lames with a steel edge
      for (let i = 0; i < 7; i++) { const a = -0.85 + i * 0.28; stud(B, Math.sin(a) * 0.37 * b, 0.26, Math.cos(a) * 0.35 * b + 0.03, 0xf2c14a, 0.012); }
    }
  }
  // ARMOUR2-END
  // ARMOUR3-BEGIN: overlays for the ten families added with ARMOUR-3 (cloak, tabard, shell, thorn, runic, timber, stone, quill, shroud, ember). Everything scales with the type's body width `b`; no per-type branches.
  const ARMOUR3_FAMS = { cloak: 1, tabard: 1, shell: 1, thorn: 1, runic: 1, timber: 1, stone: 1, quill: 1, shroud: 1, ember: 1 };
  function gaArmor3(B, type, fam, trim, b) {
    const R = [[0.2, 0.58], [0.335, 0.5], [0.365, 0.4], [0.36, 0.26], [0.365, 0.14], [0.35, 0.0], [0.33, -0.07]], zf = y => interp(R, y) * b * 0.92 + 0.02;
    const pauld = (s, col, m, k = 1) => B.e(s * 0.43 * b, 0.55, 0, 0.17 * k, 0.1 * k, 0.17 * k, col, m, { r: [0, 0, -s * 0.3] });
    if (fam === 'cloak') {   // short tunic, a cape hanging from the shoulders at the back, a bunched hood and a gold clasp
      garment(B, R.slice(2), b, 0x5a4a30, CL, { fold: [8, 0.02, -0.1, 0.3] }); bandAt(B, 0.04, 0.36 * b, 0.022, 0x3a2a1a, LT);
      const pts = R.map(([r, y]) => new THREE.Vector2(r * b * 1.08, y)); pts.push(new THREE.Vector2(0.36 * b * 1.08, -0.2));
      B.add(new THREE.LatheGeometry(pts, 30, Math.PI - 2.1, 4.2), { p: [0, 0, -0.02], s: [1, 1, 0.95], c: 0x4a6a3a, m: CL, uv: 2 });
      B.tor(0, 0.57, -0.02, 0.22 * b, 0.06, Math.PI / 2, 0, 0, 0x4a6a3a, CL); B.e(0, 0.6, -0.17 * b, 0.19 * b, 0.12, 0.13, 0x3e5a30, CL);
      B.es(0, 0.5, zf(0.5) + 0.02, 0.025, 0.025, 0.018, trim, GD); for (const s of [-1, 1]) B.es(s * 0.1 * b, 0.52, zf(0.5) + 0.01, 0.018, 0.018, 0.012, 0xffc933, GD);
    }
    if (fam === 'tabard') {   // steel scale shirt under a long blue surcoat with a pale stripe
      garment(B, R, b, 0x8a94a0, MT, { uv: 1 }); B.tor(0, 0.57, 0.01, 0.2 * b, 0.032, Math.PI / 2, 0, 0, 0x8c96a2, MT);
      B.box(0, 0.12, zf(0.2) + 0.02, 0.4 * b, 0.62, 0.03, 0x2f5a8a, CL, { r: [-0.04, 0, 0] }); B.box(0, 0.14, -zf(0.2), 0.4 * b, 0.6, 0.03, 0x2f5a8a, CL, { r: [0.04, 0, 0] });
      B.box(0, 0.12, zf(0.2) + 0.045, 0.07 * b, 0.5, 0.012, 0xe8dcc0, CL, { r: [-0.04, 0, 0] }); B.box(0, 0.3, zf(0.3) + 0.045, 0.2 * b, 0.06, 0.012, 0xe8dcc0, CL);
      bandAt(B, 0.1, 0.375 * b, 0.026, 0x3a2418, LT); B.box(0, 0.1, 0.375 * b, 0.07, 0.06, 0.03, trim, GD);
    }
    if (fam === 'shell') {   // overlapping chitin bands, a domed shell on the back, ridged pauldrons
      garment(B, R, b, 0x5a3a22, LT, { uv: 2.6 });
      for (let i = 0; i < 6; i++) bandAt(B, 0.5 - i * 0.1, (interp(R, 0.5 - i * 0.1) + 0.015) * b, 0.04, i % 2 ? 0x6a4a2c : 0x8a6038, LT);
      B.e(0, 0.2, -0.3 * b, 0.36 * b, 0.36, 0.2, 0x7a5028, LT); B.k(0, 0.5, -0.3 * b, 0.04, 0.16, -0.7, 0, 0xd8c08a, BN);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) B.e(s * (0.4 + i * 0.05) * b, 0.58 - i * 0.07, 0, 0.14 - i * 0.015, 0.07, 0.13, i % 2 ? 0x6a4a2c : 0x8a6038, LT, { r: [0, 0, -s * 0.3] });
    }
    if (fam === 'thorn') {   // hide jerkin wrapped in thorny bramble vines
      garment(B, R, b, 0x4e5a34, LT, { uv: 2.6 });
      for (let k = 0; k < 3; k++) {
        const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, y = 0.5 - t * 0.5, a = k * 2.1 + t * 8; pts.push([Math.sin(a) * (interp(R, y) + 0.015) * b, y, Math.cos(a) * (interp(R, y) + 0.015) * b * 0.92 + 0.02]); }
        B.tube(pts, 0.016, 0.014, 0x3a2e1c, LT, { rad: 5, segs: 30 });
        pts.forEach(([x, y, z], i) => { if (i % 2) { const a = Math.atan2(x, z); B.k(x, y, z, 0.014, 0.07, Math.cos(a) * 1.2, -Math.sin(a) * 1.2, 0xd8cdb0, BN); } });
      }
      for (const s of [-1, 1]) { pauld(s, 0x4e5a34, LT, 0.9); for (let i = 0; i < 4; i++) { const a = i * 1.6; B.k(s * 0.43 * b + Math.cos(a) * 0.07, 0.6, Math.sin(a) * 0.07, 0.02, 0.1, Math.sin(a) * 0.6, -Math.cos(a) * 0.6 - s * 0.3, 0xd8cdb0, BN); } }
      bandAt(B, 0.0, 0.355 * b, 0.022, 0x2e1c10, LT);
    }
    if (fam === 'runic') {   // long blue tunic with glowing sigil bands
      garment(B, [...R, [0.36, -0.2]], b, 0x3a3a6a, CL, { fold: [10, 0.04, -0.2, 0.4] }); bandAt(B, 0.02, 0.35 * b, 0.026, 0x2a1c3a, LT);
      for (const y of [-0.17, -0.12]) bandAt(B, y, 0.37 * b, 0.01, 0x66e8ff, GEM); bandAt(B, 0.56, 0.21 * b, 0.012, 0x66e8ff, GEM);
      for (let i = 0; i < 5; i++) { const y = 0.46 - i * 0.075; for (const x of [-0.07, 0.07]) B.box(x * b, y, zf(y) + 0.012, 0.012, 0.045 + (i % 2) * 0.02, 0.006, 0x66e8ff, GEM, { r: [0, 0, (i + (x > 0 ? 1 : 0)) % 2 ? 0.7 : -0.7] }); }
      B.tor(0, 0.32, zf(0.32) + 0.012, 0.05, 0.008, 0, 0, 0, 0x66e8ff, GEM);
    }
    if (fam === 'timber') {   // wooden staves bound with iron hoops and log pauldrons
      garment(B, R, b, 0x3a2a1a, LT, { uv: 2.6 }); const n = 16;
      for (let i = 0; i < n; i++) { const a = (i + 0.5) / n * TAU, y = 0.26, rr = interp(R, y) * b + 0.012; B.box(Math.sin(a) * rr, y + 0.05, Math.cos(a) * rr * 0.92 + 0.02, 0.1, 0.52, 0.03, i % 2 ? 0x8a6a3e : 0x7a5a30, LT, { r: [0, a, 0] }); }
      for (const y of [0.5, 0.3, 0.1]) bandAt(B, y, (interp(R, y) + 0.04) * b, 0.016, 0x4b5058, MT);
      for (const s of [-1, 1]) B.cyl(s * 0.43 * b, 0.55, 0, 0.09, 0.09, 0.3, 0x8a6a3e, LT, { r: [0, 0, Math.PI / 2 + s * 0.3] });
    }
    if (fam === 'stone') {   // rock slabs strapped over a hide base, boulder pauldrons, a moss patch
      garment(B, R, b, 0x3a2a1a, LT, { uv: 2.6 });
      [[-0.15, 0.36, 0.14, 0.11, 0.1], [0.16, 0.34, 0.13, 0.12, 0.1], [0, 0.17, 0.17, 0.12, 0.1], [-0.2, 0.06, 0.11, 0.09, 0.09], [0.2, 0.08, 0.11, 0.09, 0.09]].forEach(([x, y, w, h, d], i) => { const a = Math.asin(Math.min(1, x / (interp(R, y) * b))); B.e(x * b, y, Math.cos(a) * interp(R, y) * b * 0.92 + 0.03, w, h, d, i % 2 ? 0x8a8a84 : 0x77777a, MT, { v: 0.2, r: [0, a * 0.7, i * 0.2 - 0.3] }); });
      B.e(-0.04 * b, 0.46, zf(0.46) + 0.03, 0.09, 0.03, 0.05, 0x5f8a3f, LT);
      for (const s of [-1, 1]) B.e(s * 0.43 * b, 0.55, 0, 0.15, 0.11, 0.15, s > 0 ? 0x8a8a84 : 0x77777a, MT, { v: 0.2, r: [0, 0, -s * 0.3] });
      bandAt(B, 0.0, 0.37 * b, 0.022, 0x2e1c10, LT);
    }
    if (fam === 'quill') {   // scaled hide coat bristling with long quills
      garment(B, R, b, 0x6a4a34, LT, { uv: 2.6 });
      for (let row = 0; row < 6; row++) { const y = 0.5 - row * 0.1, n = 12 + row; for (let i = 0; i < n; i++) { const a = (i + row * 0.4) / n * TAU, rr = (interp(R, y) + 0.01) * b; B.k(Math.sin(a) * rr, y, Math.cos(a) * rr * 0.92 + 0.02, 0.014, 0.17 * (0.8 + 0.5 * hash3(i, row, 5)), Math.cos(a) * 1.1, -Math.sin(a) * 1.1, i % 3 ? 0xe8dcc0 : 0x2a1a12, BN); } }
      for (const s of [-1, 1]) { pauld(s, 0x6a4a34, LT); for (let i = 0; i < 5; i++) { const a = i * 1.26; B.k(s * 0.43 * b + Math.cos(a) * 0.06, 0.6, Math.sin(a) * 0.07, 0.016, 0.2, Math.sin(a) * 0.6, -s * 0.8 - Math.cos(a) * 0.3, 0xe8dcc0, BN); } }
      bandAt(B, 0.0, 0.355 * b, 0.022, 0x2a1a12, LT);
    }
    if (fam === 'shroud') {   // long tattered shroud with a hood and pale glowing hem
      garment(B, [...R, [0.4, -0.2], [0.42, -0.3]], b, 0x2e2a3a, CL, { fold: [10, 0.06, -0.3, 0.3] }); ringTeeth(B, -0.28, 0.42 * b, 18, 0.06, 0.2, 0x2e2a3a, CL);
      bandAt(B, -0.2, 0.4 * b, 0.01, 0xb8f0d8, GEM); bandAt(B, 0.56, 0.22 * b, 0.014, 0xb8f0d8, GEM); B.e(0, 0.6, -0.15 * b, 0.22 * b, 0.15, 0.16, 0x2e2a3a, CL); bandAt(B, 0.03, 0.36 * b, 0.022, 0x1a1620, LT);
    }
    if (fam === 'ember') {   // black plate with glowing fissures, horned pauldrons and a furnace gem
      garment(B, R, b, 0x2a2024, MT, { uv: 1, segs: 40 });
      for (let i = 0; i < 6; i++) { const a = -0.8 + i * 0.32, y0 = 0.4 + (i % 2) * 0.05, pts = []; for (let k = 0; k < 4; k++) { const y = y0 - k * 0.07, aa = a + ((i * 7 + k * 3) % 5 - 2) * 0.05, rr = (interp(R, y) + 0.012) * b; pts.push([Math.sin(aa) * rr, y, Math.cos(aa) * rr * 0.92 + 0.02]); } B.tube(pts, 0.008, 0.006, 0xff7a20, GEM, { rad: 4, segs: 8 }); }
      B.es(0, 0.3, zf(0.3) + 0.03, 0.04, 0.055, 0.03, 0xff7a20, GEM); B.tor(0, 0.3, zf(0.3) + 0.015, 0.06, 0.012, 0, 0, 0, trim, GD); B.tor(0, 0.57, 0.01, 0.2 * b, 0.04, Math.PI / 2, 0, 0, 0x3a2e30, MT); bandAt(B, 0.02, 0.375 * b, 0.03, 0x4a3a3c, MT);
      for (const s of [-1, 1]) { pauld(s, 0x3a2e30, MT, 1.15); B.k(s * 0.46 * b, 0.62, 0, 0.04, 0.2, 0, -s * 0.5, 0x4a3a3c, MT); B.k(s * 0.5 * b, 0.74, 0, 0.018, 0.1, 0, -s * 0.5, 0xff7a20, GEM); }
    }
  }
  // ARMOUR3-END
  // GOBTYPES-BEGIN: looks of the seven newer goblin types (5 scout, 6 sneak, 7 miner, 8 shaman, 9 berserker, 10 bog goblin, 11 hobgoblin). Same kit and spaces as above, all baked into the
  // existing part meshes (no extra draw calls). Silhouettes: scout = tall upright ears and feathers, sneak = deep hood and a low crouch, miner = hard hat with a candle and a pick on the back,
  // shaman = horned skull headdress and grass skirt, berserker = red mohawk and war paint, bog goblin = wide frog head, lily-pad hat and a tail, hobgoblin = tall, upright, rust skin, horns and topknot.
  const GX_EAR = { 5: { x: 0.25, ry: 0.2, rz: 0.85 }, 6: { x: 0.27, ry: 0.95, rz: -0.05 }, 8: { x: 0.27, ry: 0.35, rz: -0.25 }, 10: { x: 0.3, ry: 0.25, rz: 0.3 }, 11: { x: 0.26, ry: 0.55, rz: 0.2 } };
  const GX_EYE = { 5: [0xfff27a, 0x3ad06a], 6: [0xe4ff9a, 0x8aff2a], 7: [0xffe9a0, 0xffa020], 8: [0xd8f6ff, 0x5ac8ff], 9: [0xffa080, 0xff2a10], 10: [0xffc45a, 0xff7a00], 11: [0xfff4c0, 0xff5a00] };
  const gxEye = (type, i, def) => GX_EYE[type] ? GX_EYE[type][i] : def;
  const feather = (B, x, y, z, rx, rz, len, col) => { B.add(A.g.sph, { p: [x, y, z], s: [0.032, len, 0.008], r: [rx, 0, rz], c: col, m: HR }); B.tube([[x, y - len, z], [x, y + len * 0.9, z]].map(([px, py, pz]) => { const dy = py - y; return [px - Math.sin(rz) * dy, y + Math.cos(rx) * Math.cos(rz) * dy, pz + Math.sin(rx) * Math.cos(rz) * dy]; }), 0.007, 0.003, 0xe8e0c8, BN, { rad: 4 }); };
  function gxFeet(B, type, b, SC, toes) {   // true when this type has its own feet (otherwise boots)
    if (type === 5 || type === 6 || type === 8) {   // bare, wrapped feet (scout and sneak) or bare with a bead anklet (shaman)
      const wrap = type === 5 ? 0x8a7a5a : 0x2e2c30;
      B.e(0, -0.52, 0.0, 0.065, 0.07, 0.06, SC, SK); B.e(0, -0.555, 0.08, 0.095 * b, 0.05, 0.16, SC, SK); toes(0.19, -0.56, SC, 0xd8cdb0);
      if (type === 8) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; B.es(Math.sin(a) * 0.07, -0.47, Math.cos(a) * 0.07, 0.018, 0.018, 0.018, i % 2 ? 0xe8dec0 : 0xb3402a, i % 2 ? BN : GEM); }
      else { for (let i = 0; i < 3; i++) B.tor(0, -0.44 - i * 0.035, 0, 0.07 - i * 0.003, 0.016, Math.PI / 2 + 0.15 * (i - 1), 0, 0, wrap, CL); B.e(0, -0.55, 0.06, 0.1 * b, 0.045, 0.1, wrap, CL); }
      return true;
    }
    if (type === 10) {   // webbed frog feet: long splayed toes with skin between them
      B.e(0, -0.52, 0.0, 0.07, 0.07, 0.065, SC, SK); B.e(0, -0.565, 0.07, 0.11 * b, 0.04, 0.13, SC, SK);
      for (const a of [-0.45, 0, 0.45]) { const x = Math.sin(a) * 0.2, z = 0.06 + Math.cos(a) * 0.2; B.tube([[0, -0.56, 0.08], [x * 0.6, -0.575, 0.06 + (z - 0.06) * 0.6], [x, -0.575, z]], 0.028, 0.012, SC, SK, { rad: 6 }); B.es(x, -0.575, z, 0.028, 0.02, 0.028, SC, SK); }
      B.add(new THREE.CircleGeometry(1, 16, Math.PI * 0.2, Math.PI * 0.6), { p: [0, -0.57, 0.07], r: [-Math.PI / 2, 0, 0], s: [0.2, 0.2, 1], c: skinFn(CFG[type].skin, { tint: 0x1a4030 }), m: SK });   // the web
      return true;
    }
    return false;
  }
  function gxOutfit(B, type, b) {   // torso space: hips y=0, shoulders y=0.5, neck y=0.6, front +z
    if (type === 5) {   // scout: short hooded green cloak, sash, belt pouches, a spyglass and a bedroll on the back
      B.add(new THREE.SphereGeometry(1, 26, 10, 0, TAU, 0.45, 1.05), { p: [0, 0.42, -0.01], s: [0.37 * b, 0.3, 0.33 * b], c: 0x4e6a2e, m: CL, uv: 1.6 });
      B.e(0, 0.6, -0.2 * b, 0.17, 0.09, 0.1, 0x4e6a2e, CL);   // the hood, down
      B.add(new THREE.SphereGeometry(1, 20, 8, Math.PI * 0.6, Math.PI * 0.8, 0.9, 1.4), { p: [0, 0.42, -0.02], s: [0.39 * b, 0.42, 0.35 * b], c: 0x445e28, m: CL, uv: 1.6 });   // cloak tail behind
      strap(B, 0.3 * b, 0.56, -0.22 * b, 0.02, 0.29 * b, 0.05, 0x3f7f6a, CL); bandAt(B, 0.08, 0.34 * b, 0.028, 0x5a3b22, LT); B.box(0, 0.08, 0.33 * b, 0.06, 0.05, 0.02, 0xc9a24a, MT);
      for (const s of [-1, 1]) B.box(s * 0.22 * b, 0.02, 0.27 * b, 0.09, 0.1, 0.07, 0x6a4626, LT, { r: [0, s * 0.6, 0] });
      B.add(new THREE.CylinderGeometry(0.022, 0.03, 0.24, 10), { p: [-0.32 * b, 0.02, 0.1 * b], r: [0, 0, 0.25], c: 0xc9a24a, m: GD });   // spyglass
      B.add(new THREE.CylinderGeometry(0.085, 0.085, 0.46, 12), { p: [0, 0.44, -0.3 * b], r: [0, 0, Math.PI / 2], c: 0x8a7a52, m: CL });   // bedroll
      for (const x of [-0.14, 0.14]) B.tor(x, 0.44, -0.3 * b, 0.088, 0.012, 0, Math.PI / 2, 0, 0x3a281c, LT);
    }
    if (type === 6) {   // sneak: tight charcoal wraps, crossed knife belts, a scarf round the neck
      garment(B, [[0.17, 0.58], [0.29, 0.5], [0.31, 0.38], [0.3, 0.22], [0.3, 0.06], [0.32, -0.06]], b, 0x2e2c34, CL, { fold: [9, 0.025, -0.06, 0.4], uv: 2.4 });
      for (const s of [-1, 1]) strap(B, s * 0.28 * b, 0.56, -s * 0.22 * b, 0.02, 0.28 * b, 0.03, 0x1e1a18, LT);
      for (let i = 0; i < 4; i++) { const t = 0.2 + i * 0.17, x = (0.28 - 0.5 * t) * b, y = 0.56 - 0.54 * t; B.box(x, y + 0.05, 0.31 * b, 0.018, 0.09, 0.02, 0x4a3020, LT, { r: [0, 0, 0.6] }); B.box(x + 0.035, y - 0.0, 0.31 * b, 0.022, 0.07, 0.008, 0xb0b8c0, MT, { r: [0, 0, 0.6] }); }
      bandAt(B, 0.06, 0.32 * b, 0.026, 0x1e1a18, LT); B.box(0.12 * b, 0.0, 0.3 * b, 0.08, 0.1, 0.05, 0x2a221c, LT, { r: [0, 0.4, 0] });
      B.add(new THREE.TorusGeometry(0.15, 0.06, 8, 22), { p: [0, 0.6, 0.0], r: [Math.PI / 2 - 0.25, 0, 0], c: 0x3a3440, m: CL, uv: 2 }); B.tube([[0.06, 0.58, -0.14], [0.1, 0.45, -0.24], [0.14, 0.3, -0.27]], 0.045, 0.02, 0x3a3440, CL, { rad: 6 });
    }
    if (type === 7) {   // miner: leather apron with bib straps, riveted scrap patches, tool belt and a pick slung on the back
      garment(B, [[0.2, 0.5], [0.31, 0.42], [0.33, 0.26], [0.34, 0.1], [0.36, -0.08], [0.37, -0.16]], b, 0x6a4a2a, LT, { uv: 2.4, zs: 0.95 });
      for (const s of [-1, 1]) { strap(B, s * 0.17 * b, 0.62, s * 0.15 * b, 0.36, 0.28 * b, 0.028, 0x4a301c); stud(B, s * 0.15 * b, 0.37, 0.33 * b, 0xb9a46a, 0.02); }
      for (const [x, y, w, h, c] of [[-0.14, 0.22, 0.12, 0.1, 0x7d8590], [0.12, 0.08, 0.1, 0.12, 0x8a6a4a]]) { const a = x / 0.36; B.box(x * b, y, Math.cos(a) * 0.35 * b + 0.02, w, h, 0.02, c, MT, { r: [0.06, a, 0.1] }); stud(B, x * b - w * 0.35, y + h * 0.35, Math.cos(a) * 0.36 * b + 0.04, 0xb0b8c0, 0.011); }
      bandAt(B, 0.02, 0.37 * b, 0.034, 0x2e1c10, LT); B.box(0, 0.02, 0.37 * b, 0.08, 0.07, 0.03, 0xaab0b8, MT);
      B.box(0.27 * b, -0.04, 0.2 * b, 0.1, 0.12, 0.07, 0x4a301c, LT, { r: [0, 0.7, 0] }); B.cyl(-0.3 * b, -0.04, 0.16 * b, 0.02, 0.02, 0.2, 0x7a5530, LT, { r: [0.2, 0, 0.15] }); B.box(-0.3 * b, 0.07, 0.17 * b, 0.1, 0.04, 0.04, 0x6a6e76, MT, { r: [0, 0, 0.15] });   // pouch and hammer
      B.tube([[-0.26 * b, -0.05, -0.32 * b], [0.0, 0.3, -0.36 * b], [0.26 * b, 0.65, -0.32 * b]], 0.026, 0.026, 0x7a5530, LT, { rad: 7 });   // the pick on the back
      B.tube([[0.04 * b, 0.74, -0.33 * b], [0.24 * b, 0.67, -0.34 * b], [0.46 * b, 0.48, -0.32 * b]], 0.04, 0.008, 0x8a9098, MT, { rad: 7 }); B.tube([[0.24 * b, 0.67, -0.34 * b], [0.12 * b, 0.82, -0.33 * b], [0.02 * b, 0.9, -0.32 * b]], 0.036, 0.008, 0x8a9098, MT, { rad: 7 });
    }
    if (type === 8) {   // shaman: grass skirt, tooth necklace, fur shoulder wrap, white body paint and a charm pouch
      ringTeeth(B, 0.06, 0.3 * b, 22, 0.05, 0.36, 0xb8a060, HR); ringTeeth(B, 0.0, 0.32 * b, 18, 0.045, 0.3, 0x8a7a40, HR); bandAt(B, 0.06, 0.3 * b, 0.03, 0x5a3b22, LT);
      for (let i = 0; i < 11; i++) { const a = (i - 5) * 0.2; B.k(Math.sin(a) * 0.2, 0.55 - Math.abs(i - 5) * 0.012, Math.cos(a) * 0.17 + 0.04, 0.016, 0.07, Math.PI - 0.2, 0, 0xf0e6c8, BN); }
      B.tube([[-0.2, 0.6, 0.12], [0, 0.53, 0.22], [0.2, 0.6, 0.12]], 0.008, 0.008, 0x3a281c, LT, { rad: 4 });
      B.add(new THREE.TorusGeometry(0.27 * b, 0.075, 8, 24), { p: [0, 0.55, -0.02], r: [Math.PI / 2 + 0.1, 0, 0], s: [1, 0.9, 1], c: 0x6b5238, m: HR, uv: 3 });
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) B.add(A.g.box, { p: [s * (0.1 + i * 0.05) * b, 0.36 - i * 0.03, 0.27 * b], r: [0, s * 0.3, s * 0.2], s: [0.025, 0.12, 0.006], c: 0xe8e0d0, m: DK });
      B.e(0.2 * b, -0.02, 0.24 * b, 0.06, 0.08, 0.05, 0x5a3b22, LT); B.es(0.2 * b, 0.05, 0.27 * b, 0.025, 0.025, 0.025, 0x55ddff, GEM);
    }
    if (type === 9) {   // berserker: bare painted chest, one strap, fur kilt with a skull clasp
      strap(B, 0.28 * b, 0.56, -0.22 * b, 0.02, 0.29 * b, 0.04, 0x2e1c10);
      for (const [x, y, rz, l] of [[-0.14, 0.4, 0.5, 0.22], [-0.08, 0.33, 0.5, 0.2], [-0.02, 0.26, 0.5, 0.18]]) B.add(A.g.box, { p: [x * b, y, 0.3 * b], r: [0, Math.atan2(x, 0.3) * 0.8, rz], s: [0.03, l, 0.008], c: 0xb3122b, m: DK });   // red claw paint
      B.e(0.12 * b, 0.42, 0.28 * b, 0.06, 0.06, 0.012, 0xb3122b, DK, { r: [0, 0.4, 0] });   // hand print
      ringTeeth(B, 0.0, 0.33 * b, 16, 0.06, 0.22, 0x5a4636, HR); bandAt(B, 0.04, 0.34 * b, 0.04, 0x2e1c10, LT);
      B.e(0, 0.04, 0.35 * b, 0.05, 0.055, 0.025, 0xe8e0c8, BN); for (const s of [-1, 1]) B.es(s * 0.02, 0.05, 0.37 * b, 0.011, 0.014, 0.01, 0x111111, DK);
      for (const s of [-1, 1]) { B.e(s * 0.42 * b, 0.56, 0, 0.13, 0.08, 0.13, 0x5a4636, HR, { r: [0, 0, -s * 0.3] }); }
      for (let i = 0; i < 5; i++) B.tor(0.0 + (i - 2) * 0.09 * b, 0.62 - Math.abs(i - 2) * 0.03, 0.16, 0.028, 0.008, 0.3, 0, 0, 0x8a9098, MT);   // chain links at the throat
    }
    if (type === 10) {   // bog goblin: reed skirt, moss and little mushrooms on the shoulders, and a long tail
      ringTeeth(B, 0.02, 0.31 * b, 20, 0.04, 0.3, 0x6a8a3a, HR); ringTeeth(B, -0.02, 0.33 * b, 14, 0.035, 0.24, 0x4a6a2a, HR); bandAt(B, 0.04, 0.31 * b, 0.022, 0x4a3a20, LT);
      for (const s of [-1, 1]) { B.e(s * 0.38 * b, 0.56, 0.0, 0.14, 0.06, 0.13, mossC[s < 0 ? 0 : 2], HR); for (const [dx, dz, h] of [[0.03, 0.04, 0.07], [-0.05, -0.02, 0.05]]) { B.cyl(s * 0.38 * b + dx, 0.6 + h / 2, dz, 0.012, 0.016, h, 0xe8dcc0, SK); B.add(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2), { p: [s * 0.38 * b + dx, 0.6 + h, dz], s: [0.04, 0.03, 0.04], c: s < 0 ? 0xb83a22 : 0xa87a3a, m: SK }); } }
      const SC = skinFn(CFG[type].skin, { tint: 0x1a4030 });
      B.tube([[0, 0.02, -0.18 * b], [0, -0.12, -0.36 * b], [0.04, -0.34, -0.5 * b], [0.14, -0.5, -0.66], [0.3, -0.55, -0.78]], 0.1 * b, 0.014, SC, SK, { rad: 10, segs: 30 });   // tail
      for (let i = 0; i < 6; i++) { const t = 0.12 + i * 0.13; B.k(0.02 + 0.2 * t * t, 0.04 - 0.62 * t, -0.2 - 0.55 * t, 0.025 - i * 0.003, 0.06 - i * 0.006, -1.2 - 0.3 * t, 0, 0x2a5a40, SK); }   // ridge along the tail
    }
    if (type === 11) {   // hobgoblin: a long dark coat with a red trim, sash, lamellar shoulder plates
      const prof = [[0.17, 0.6], [0.3, 0.52], [0.33, 0.4], [0.31, 0.24], [0.32, 0.08], [0.35, -0.12], [0.39, -0.32]];
      garment(B, prof, b, 0x2e2238, CL, { fold: [10, 0.04, -0.32, 0.1], uv: 1.8, zs: 0.95 });
      B.add(new THREE.LatheGeometry([new THREE.Vector2(0.395 * b, -0.33), new THREE.Vector2(0.385 * b, -0.27)], 40), { p: [0, 0, 0.02], s: [1, 1, 0.95], c: 0x9a1a1a, m: CL });
      bandAt(B, 0.14, 0.33 * b, 0.04, 0x9a1a1a, CL); B.box(-0.12 * b, -0.02, 0.3 * b, 0.06, 0.26, 0.015, 0x9a1a1a, CL, { r: [0.12, -0.3, 0.05] });
      B.box(0, 0.36, 0.31 * b, 0.025, 0.36, 0.02, 0x9a1a1a, CL);
      for (const s of [-1, 1]) { const px = s * 0.41 * b;   // layered lacquered shoulder guards
        for (let r = 0; r < 3; r++) { B.add(new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI * 0.45), { p: [px + s * r * 0.03, 0.58 - r * 0.06, 0], r: [0, 0, -s * (0.35 + r * 0.15)], s: [0.17, 0.11, 0.17], c: r % 2 ? 0x4a1a1a : 0x6a2222, m: LT }); B.tor(px + s * r * 0.03, 0.58 - r * 0.06, 0, 0.17, 0.008, Math.PI / 2, 0, -s * (0.35 + r * 0.15), 0xc9a24a, MT); } }
    }
  }
  function gxHeadGear(B, type, b) {   // head space: centre (0, 0.22, 0), top ~0.5, face front z ~0.29, eyes at y 0.25
    const top = z => 0.22 + 0.27 * Math.sqrt(Math.max(0, 1 - (z / 0.3) * (z / 0.3)));
    if (type === 5) {   // scout: leather headband, two tall feathers, a bone toggle
      B.add(new THREE.TorusGeometry(0.27, 0.026, 8, 30), { p: [0, 0.36, -0.01], r: [Math.PI / 2 + 0.2, 0, 0], c: 0x6a4626, m: LT });
      feather(B, -0.12, 0.62, -0.22, -0.45, 0.25, 0.17, 0xf0ead8); feather(B, -0.05, 0.6, -0.25, -0.55, 0.05, 0.14, 0xb3402a); B.es(-0.1, 0.44, -0.22, 0.03, 0.03, 0.03, 0xe8dec0, BN);
      for (let i = 0; i < 4; i++) B.k((i - 1.5) * 0.06, 0.44, 0.06, 0.02, 0.1, 0.4, (i - 1.5) * 0.3, 0x5a4020, HR);   // tuft
    }
    if (type === 6) {   // sneak: a deep hood that shades the eyes
      B.add(new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI * 0.68), { p: [0, 0.25, -0.05], r: [-0.8, 0, 0], s: [0.37, 0.37, 0.4], c: 0x2a2830, m: CL, uv: 2 });   // open at the front, falling down the back
      B.tube([[0, 0.3, -0.36], [0, 0.08, -0.42], [0.04, -0.14, -0.36]], 0.12, 0.03, 0x2a2830, CL, { rad: 8 });   // hood tail
      B.e(0, 0.1, 0.17, 0.25, 0.12, 0.21, 0x34303a, CL, { uv: 2 });   // cloth wrapped over the mouth
    }
    if (type === 7) {   // miner: hard hat with goggles and a lit candle, soot on the face
      B.add(new THREE.SphereGeometry(1, 26, 10, 0, TAU, 0, Math.PI / 2), { p: [0, 0.31, 0], s: [0.33, 0.25, 0.32], c: 0xb08a3a, m: MT, v: 0.12 });
      B.tor(0, 0.31, 0, 0.35, 0.03, Math.PI / 2, 0, 0, 0x9a7a30, MT); B.tor(0, 0.43, 0, 0.3, 0.012, Math.PI / 2, 0, 0, 0x6a5420, MT, { s: [1, 1, 0.97] });
      for (const s of [-1, 1]) { B.tor(s * 0.09, 0.37, 0.31, 0.048, 0.014, 0, 0, 0, 0xc9a24a, MT); B.es(s * 0.09, 0.37, 0.31, 0.042, 0.042, 0.012, 0x8ad0ff, GEM); }
      B.box(0, 0.37, 0.31, 0.06, 0.016, 0.01, 0x3a281c, LT);
      B.cyl(0, 0.6, 0.0, 0.034, 0.04, 0.11, 0xf0e6c8, SK); B.tor(0, 0.555, 0, 0.05, 0.01, Math.PI / 2, 0, 0, 0x8a9098, MT); B.es(0.03, 0.6, 0.02, 0.012, 0.03, 0.012, 0xf0e6c8, SK);   // candle with a wax drip
      B.e(0, 0.69, 0.0, 0.022, 0.05, 0.022, 0xffa030, GL, { hdr: 1.6, v: 0 }); B.e(0, 0.675, 0.0, 0.01, 0.022, 0.01, 0xfff4d0, GL, { hdr: 2, v: 0 });   // flame (emissive only, no light)
      for (const [x, y, z, r] of [[-0.16, 0.14, 0.2, 0.05], [0.1, 0.33, 0.24, 0.035], [0.19, 0.18, 0.18, 0.04]]) B.es(x, y, z, r, r * 0.7, r * 0.3, 0x2a2a1c, DK, { r: [0, Math.atan2(x, z), 0] });
    }
    if (type === 8) {   // shaman: horned animal skull worn on the head, feathers, white face paint
      B.e(0, top(0.02) + 0.02, 0.02, 0.2, 0.11, 0.22, 0xe8dec0, BN); B.e(0, top(0.18) + 0.0, 0.22, 0.1, 0.06, 0.13, 0xe0d4b4, BN);
      for (const s of [-1, 1]) { B.es(s * 0.08, top(0.12) + 0.05, 0.16, 0.035, 0.03, 0.03, 0x1a1210, DK);
        B.tube([[s * 0.16, 0.48, 0.0], [s * 0.3, 0.62, -0.04], [s * 0.38, 0.8, -0.16], [s * 0.32, 0.93, -0.32]], 0.055, 0.006, 0xe0d4b4, BN, { rad: 8, segs: 20 });
        feather(B, s * 0.24, 0.3, -0.2, -0.3, s * 0.5, 0.13, s < 0 ? 0x2a2a2a : 0xf0ead8);
        for (let i = 0; i < 2; i++) B.add(A.g.box, { p: [s * (0.13 + i * 0.05), 0.15, 0.24 - i * 0.02], r: [0, s * 0.5, 0], s: [0.016, 0.1, 0.006], c: 0xf0ead8, m: DK }); }
      B.add(A.g.box, { p: [0, 0.36, 0.26], r: [-0.4, 0, 0], s: [0.12, 0.022, 0.008], c: 0xf0ead8, m: DK });
    }
    if (type === 9) {   // berserker: tall red mohawk, red paint across the brow, a nose ring
      for (let i = 0; i < 11; i++) { const z = 0.2 - i * 0.05; B.k(0, top(z) - 0.03, z, 0.04, 0.26 - Math.abs(i - 4) * 0.018, -(i - 4) * 0.08, 0, i % 2 ? 0xc0201a : 0xe0401a, HR); }
      B.add(A.g.box, { p: [0, 0.34, 0.25], r: [-0.35, 0, 0], s: [0.34, 0.05, 0.008], c: 0xb3122b, m: DK });
      for (const s of [-1, 1]) for (let i = 0; i < 2; i++) B.add(A.g.box, { p: [s * (0.2 + i * 0.015), 0.12 + i * 0.04, 0.2], r: [0, -s * 0.7, s * 0.35], s: [0.08, 0.016, 0.008], c: 0xb3122b, m: DK });
      B.tor(0.0, 0.06, 0.375, 0.032, 0.008, 0, 0, 0, 0xc9c9c9, MT);
    }
    if (type === 10) {   // bog goblin: frog brow bumps over the eyes, lily-pad hat, reeds, moss
      for (const s of [-1, 1]) B.e(s * 0.13, 0.31, 0.15, 0.09, 0.07, 0.08, skinFn(CFG[type].skin, { tint: 0x1a4030 }), SK);
      B.add(new THREE.CylinderGeometry(0.3, 0.3, 0.018, 22, 1, false, 0.35, TAU - 0.7), { p: [0.03, top(0) + 0.0, -0.02], r: [-0.12, 0.4, 0.12], c: 0x5a9a3a, m: CL, uv: 1 });
      B.tube([[0.03, top(0) + 0.01, -0.02], [0.16, top(0) + 0.0, 0.08], [0.25, top(0) - 0.02, 0.15]], 0.006, 0.004, 0x3a6a2a, CL, { rad: 4 });
      for (const [x, z, h, rz] of [[-0.1, -0.1, 0.26, 0.25], [-0.04, -0.14, 0.32, 0.1], [0.06, -0.12, 0.22, -0.2]]) { B.k(x, top(z) - 0.02, z, 0.012, h, -0.2, rz, 0x6a8a3a, HR); }
      B.es(-0.05, top(-0.14) + 0.28, -0.18, 0.02, 0.06, 0.02, 0x6a4a2a, HR);   // cattail head
      for (const [x, y, z] of [[0.2, 0.4, -0.1], [-0.22, 0.38, -0.08], [0.0, 0.42, -0.2]]) B.es(x, y, z, 0.06, 0.035, 0.06, mossC[(x * 10 | 0) & 3], HR);
    }
    if (type === 11) {   // hobgoblin: swept-back horns, a black topknot with a gold ring, heavy brows
      for (const s of [-1, 1]) { B.tube([[s * 0.1, 0.44, 0.15], [s * 0.15, 0.55, 0.05], [s * 0.18, 0.6, -0.1], [s * 0.2, 0.58, -0.24]], 0.04, 0.005, 0x3a3028, BN, { rad: 7, segs: 16 });
        B.tube([[s * 0.04, 0.35, 0.27], [s * 0.12, 0.37, 0.25], [s * 0.21, 0.34, 0.17]], 0.035, 0.015, 0x1a1414, HR, { rad: 6 }); }
      B.tube([[0, top(-0.12) - 0.02, -0.12], [0, top(-0.12) + 0.12, -0.14], [0, top(-0.12) + 0.14, -0.22], [0, 0.42, -0.36], [0, 0.18, -0.4]], 0.07, 0.02, 0x1a1414, HR, { rad: 8, segs: 24 });
      B.tor(0, top(-0.12) + 0.08, -0.14, 0.05, 0.014, Math.PI / 2, 0, 0, 0xffc933, GD);
    }
  }
  function gxArm(B, type, s, b, part) {   // arm gear: 'sh' upper arm (origin shoulder), 'el' forearm + hand (origin elbow)
    if (part !== 'el') { if (type === 11) B.tube([[0, 0.0, 0], [0, -0.15, 0.01], [0, -0.3, 0]], 0.085 * b, 0.07 * b, 0x2e2238, CL, { rad: 10 }); if (type === 7) B.tor(0, -0.27, 0, 0.068 * b, 0.022, Math.PI / 2, 0, 0, 0x8a6a4a, CL); return; }
    if (type === 5 || type === 6) { const c = type === 5 ? 0x6a4626 : 0x2e2c30; B.lathe([[0.055, -0.08], [0.068, -0.1], [0.07, -0.22], [0.058, -0.24]].map(([x, y]) => [x * b, y]), 14, c, LT); for (let i = 0; i < 3; i++) B.tor(0, -0.11 - i * 0.05, 0, 0.07 * b, 0.007, Math.PI / 2 + 0.2, 0, 0, type === 5 ? 0x3a281c : 0x14100c, LT); }
    if (type === 8) for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; B.es(Math.sin(a) * 0.065 * b, -0.2, Math.cos(a) * 0.065 * b, 0.016, 0.016, 0.016, i % 2 ? 0xe8dec0 : 0x2a8a9a, i % 2 ? BN : GEM); }
    if (type === 9) { B.lathe([[0.07, -0.09], [0.1, -0.11], [0.105, -0.22], [0.08, -0.24]].map(([x, y]) => [x * b, y]), 16, 0x3a281c, LT); for (let i = 0; i < 3; i++) B.k(0, -0.12 - i * 0.045, 0.095 * b, 0.016, 0.08, Math.PI / 2, 0, 0x9aa0a8, MT); }
    if (type === 11) { B.lathe([[0.06, -0.08], [0.078, -0.1], [0.08, -0.22], [0.064, -0.24]].map(([x, y]) => [x * b, y]), 16, 0x6a2a2a, LT); B.tor(0, -0.1, 0, 0.078 * b, 0.01, Math.PI / 2, 0, 0, 0xc9a24a, MT); }
    if (type === 10) B.es(0, -0.1, -0.05, 0.05, 0.03, 0.04, mossC[1], HR);
  }
  // GOBTYPES-END
  // ---- assemble one goblin
  function buildGoblin(type, demo) {
    const C = CFG[type], b = C.b, P = GAT[type], root = new THREE.Group(), rig = new THREE.Group(); root.add(rig); rig.scale.setScalar(SCALE[type]);
    const u = { rig, type, legs: [], arms: [], glows: [], spin: [], toJSON: () => ({}), hunch: P.hunch, hold: P.hold, tw: { next: 1 + Math.random() * 3, t0: -9, ear: 0 }, armKey: undefined, dead: 0 };
    if (!demo) { u.mat = uberVar(type); u.sz = 1 + (Math.random() - 0.5) * 0.08; A.curMat = u.mat; rig.scale.setScalar(SCALE[type] * u.sz); }   // variation: shade and size differ a little per goblin (the title showcase keeps the canonical look)
    const SC = skinFn(C.skin, { tint: 0x203a10 }), SB = skinFn(C.skin, { tint: 0x203a10, belly: true }), L = P.limb, claw = 0xd8cdb0;
    for (const s of [-1, 1]) {   // legs (pivot at the hip)
      const leg = new THREE.Group(); leg.position.set(s * 0.17 * b, 0.58, 0); leg.name = s < 0 ? 'legL' : 'legR'; rig.add(leg); u.legs.push(leg);
      bake(leg, type, 'leg', B => gaLeg(B, type, 1, b, SC));
    }
    const torso = new THREE.Group(); torso.name = 'torso'; torso.position.y = 0.55; torso.rotation.x = P.hunch; rig.add(torso); u.torso = torso;
    bake(torso, type, 'torso', B => { gaBody(B, type, b, SC, SB); gaOutfit(B, type, b); gxOutfit(B, type, b); });
    for (const s of [-1, 1]) {   // arms: shoulder pivot -> elbow pivot -> hand socket
      const sh = new THREE.Group(); sh.position.set(s * 0.35 * b, 1.0, 0); sh.name = s < 0 ? 'armL' : 'armR'; rig.add(sh); u.arms.push(sh);
      bake(sh, type, 'sh' + s, B => { B.push([0, 0, 0], [0, 0, 0], [s, 1, 1]); B.e(0, 0, 0, 0.1 * b * L, 0.09, 0.1 * b * L, SC, SK); B.tube([[0, 0.02, 0], [0, -0.15, 0.012], [0, -0.3, 0]], 0.072 * b * L, 0.056 * b * L, SC, SK, { rad: 9, bulge: 0.12 }); gaArmGear(B, type, s, b, 'sh'); gxArm(B, type, s, b, 'sh'); B.pop(); });
      const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el); sh.userData.el = el;
      bake(el, type, 'el' + s, B => { B.push([0, 0, 0], [0, 0, 0], [s, 1, 1]); B.e(0, 0, -0.005, 0.062 * L * b, 0.056, 0.06 * L * b, SC, SK); B.tube([[0, 0, 0], [0, -0.14, 0.012], [0, -0.28, 0]], 0.058 * b * L, 0.044, SC, SK, { rad: 8, bulge: 0.1 }); gaArmGear(B, type, s, b, 'el'); gxArm(B, type, s, b, 'el'); gaHand(B, 1, b, SC, claw, L); if (type === 4 && s > 0) { B.tor(0.0, -0.325, 0.05, 0.034, 0.009, Math.PI / 2, 0, 0, 0xffc933, GD); B.es(0.0, -0.325, 0.088, 0.014, 0.014, 0.01, 0xff3355, GEM); } B.pop(); });
      const hand = new THREE.Group(); hand.name = 'hand'; hand.position.set(0, -0.28, 0); el.add(hand); el.userData.hand = hand; if (s > 0) u.hand = hand;
    }
    u.armL = u.arms[0]; u.armR = u.arms[1]; u.legL = u.legs[0]; u.legR = u.legs[1];
    const head = new THREE.Group(); head.name = 'head'; head.position.set(0, 1.12, 0.04); head.scale.setScalar(P.hs); if (P.hw) head.scale.x *= P.hw; rig.add(head); u.head = head;
    if (u.sz) head.scale.multiplyScalar(0.96 + Math.random() * 0.1);   // a slightly bigger or smaller head
    bake(head, type, 'head', B => { gaHead(B, type, b); gaHeadGear(B, type, b); gxHeadGear(B, type, b); });
    for (const s of [-1, 1]) {
      const ear = new THREE.Group(); ear.name = s < 0 ? 'earL' : 'earR'; const eo = GX_EAR[type]; ear.position.set(s * (eo ? eo.x : type === 2 ? 0.31 : 0.27), 0.27, -0.02); ear.rotation.set(0, s * (eo ? eo.ry : 0.35), s * (eo ? eo.rz : 0.16)); ear.userData.base = ear.rotation.clone(); head.add(ear);
      bake(ear, type, 'ear', B => gaEarBake(B, type, 1)); if (s < 0) ear.scale.x = -1;   // the left ear is the mirror of the right one (shared geometry)
      u[s < 0 ? 'earL' : 'earR'] = ear;
    }
    
    // ----- extras that animate on their own: the king's cape, glow points, halo and the wizard's circle
    const K = type >= 3 ? goblinKit() : null, DS = THREE.DoubleSide;
    if (type === 4) {
      const cape = new THREE.Group(); cape.position.set(0, 1.08, -0.2 * b); rig.add(cape); u.cape = cape;
      if (!A.capeGeo) {
        const cg = A.capeGeo = new THREE.PlaneGeometry(0.95, 1.05, 18, 14), cpp = cg.attributes.position;
        for (let i = 0; i < cpp.count; i++) { const x = cpp.getX(i), y = cpp.getY(i), t = (0.525 - y) / 1.05; cpp.setX(i, x * (0.8 + 0.32 * t)); cpp.setZ(i, -Math.pow(t, 1.3) * 0.4 + Math.sin(x * 11 + t * 2) * 0.05 * (0.2 + t)); }
        cg.computeVertexNormals(); A.capeMat = M(0xffffff, { map: K.capeTex, roughness: 0.5, side: DS, envMapIntensity: 0.7 });
      }
      const cm = new THREE.Mesh(A.capeGeo, A.capeMat); cm.position.y = -0.52; cape.add(cm);
      
    }
    if (type === 3) {
      const n = 26, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), cs = type === 4 ? [new Col(0xffd24a), new Col(0xfff4c0)] : [new Col(0xb48cff), new Col(0x66e0ff)];
      for (let i = 0; i < n; i++) { const c = cs[i % 2]; col.set([c.r, c.g, c.b], i * 3); }
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const sp = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, size: 0.16, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9, sizeAttenuation: true })); sp.frustumCulled = false; sp.position.y = 1.0; rig.add(sp); u.sparks = sp;
      if (type === 3) {
        
      }
    }
    // ----- armour overlay (worn armour of another family covers the type's own outfit), weapon in the hand socket
    u.setArmor = key => {
      if (u.armKey === key) return; u.armKey = key;
      const it = key && itemsData().ITEMS[key], fam = it && it.family;
      if (!fam || fam === P.fam) { if (u.armMesh) u.armMesh.visible = false; return; }
      const tier = it.tierN || 0, ck = type + ':ar:' + fam + ':' + tier; let geo = A.cache[ck];
      if (!geo) { const B = new GB(); try { (ARMOUR3_FAMS[fam] ? gaArmor3 : ARMOUR2_FAMS[fam] ? gaArmor2 : gaArmor)(B, type, fam, GA_TIER[tier], b); } catch (e) { console.error(e); } geo = A.cache[ck] = B.finish(); }
      if (!u.armMesh) { u.armMesh = new THREE.Mesh(geo, u.mat || uber(type)); u.armMesh.userData.keep = 1; u.armMesh.scale.setScalar(1.015); torso.add(u.armMesh); }
      if (!u.armMesh) { u.armMesh = new THREE.Mesh(geo, u.mat || uber(type)); u.armMesh.userData.keep = 1; u.armMesh.scale.setScalar(1.015); torso.add(u.armMesh); }
      u.armMesh.geometry = geo; u.armMesh.visible = true;
    };
    if (demo) try {   // title-screen showcase: the type's starting weapon (the game itself mounts the real one from the inventory)
      const key = itemsData().START[type].weapon, f = vmFamOf(key), m = GK.chestKit.weaponModel(key), mnt = new THREE.Group(), sc = (VM_SC[f] || 0.35) * 0.45;
      m.scale.multiplyScalar(sc); m.position.set(0, -(VM_GRIP[f] || 0) * sc, 0); mnt.add(m); mnt.rotation.set(1.35, 0, 0); mnt.position.set(0, -0.03, 0.05); m.traverse(o => { if (o.isSprite) o.visible = false; });
      u.hand.add(mnt); u.demoW = mnt;
    } catch (e) { /* no weapon art yet: empty fist */ }
    u.arms[1].userData.el.rotation.x = P.hold; u.arms[0].userData.el.rotation.x = -0.3;
    // blob shadow and name tag
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.scale.setScalar(1.1 * SCALE[type] * b * 1.4); root.add(sh);
    const nameCol = type === 4 ? '#ffd75e' : type === 3 ? '#c9a6ff' : '#f1f1f1';
    const label = window.GKTAGS ? window.GKTAGS.nameTag(NAMES[type], nameCol) : new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(NAMES[type], nameCol, null, 512, 96, 'bold 52px system-ui'), transparent: true, depthWrite: false }));   // UI-TAGS: one shared atlas texture (client/ui/tags.js)
    if (!window.GKTAGS) label.scale.set(1.6, 0.3, 1); label.position.y = (GOB_TAGY[type] || 1.95) * SCALE[type]; root.add(label); u.label = label;   // UNIQUE: tag above the wizard hat / king crown
    A.hulls(u);   // T10: ink outline hulls (head, torso, ears)
    A.curMat = null; root.userData = u; if (PERF2_ON) perf2LodInit(root, u);   // PERF2: level-of-detail copies of the baked parts
    return root;
  }
  A.build = buildGoblin;
  // ---- animation: called every frame for every goblin from the frame loop (idle breathing, ear twitch, bouncy waddle, hit flinch)
  const armName = (() => { let m = null; return n => { if (!n) return null; if (!m) { m = {}; const I = itemsData().ITEMS; for (const k in I) if (I[k].type === 'armor') m[I[k].name] = k; } return m[n] || null; }; })();
  A.gear = (a, p) => { a.gArm = p && p.gear ? p.gear.armor : undefined; };
  A.anim = (a, u, id, t, dt, walk) => {
    A.hullStep(u, id === me ? 1e6 : (a.x - GK.cam.position.x) ** 2 + (a.z - GK.cam.position.z) ** 2);   // T10: outline on or off by preset and distance
    const type = u.type, P = GAT[type], ph = a.phase, S = Math.sin(ph), S2 = Math.abs(S), idle = 1 - walk, sc = SCALE[type], rig = u.rig;
    const f = a.hitT > 0 ? Math.sin(Math.PI * (1 - a.hitT / CB.HIT)) : 0;   // flinch envelope 0..1..0
    const key = id === me ? (invReady ? myInv.armor || null : undefined) : (a.gArm === undefined ? undefined : armName(a.gArm));
    if (key !== undefined && u.armKey !== key) u.setArmor(key);
    if (u.demoW) u.demoW.visible = a.vmMount === undefined;
    const br = Math.sin(t * 2.1 + id * 1.3) * 0.016 * (0.6 + 0.4 * idle);
    // FOOTWORK: planted feet. The hip drops as the legs spread (the stance leg stretches a little to stay on the floor), the swing leg shortens to lift its foot, sprinting leans and lengthens the stride
    const run = a.speed > 0 ? clamp((a.speed - 5.4) / 2.4, 0, 1) : 0, amp = 0.8 + 0.2 * run, cph = Math.cos(ph), sz = u.sz || 1;
    const lift0 = Math.max(0, -cph) * walk, lift1 = Math.max(0, cph) * walk;   // leg 0 swings forward while cos(ph) < 0
    u.legs[0].rotation.x = S * amp * walk; u.legs[1].rotation.x = -S * amp * walk;
    u.legs[0].rotation.z = -(0.03 + 0.07 * walk * S2); u.legs[1].rotation.z = 0.03 + 0.07 * walk * S2;
    u.legs[0].scale.y = 1 + 0.15 * S2 * walk - 0.15 * lift0; u.legs[1].scale.y = 1 + 0.15 * S2 * walk - 0.15 * lift1;
    u.legs[0].position.y = u.legs[1].position.y = 0.58;
    const sw = a.swing > 0 && a.swing < 1 ? a.swing : -1, ant = sw < 0 ? 0 : sstep(0, 0.28, sw) * (1 - sstep(0.28, 0.46, sw)), lun = sw < 0 ? 0 : sstep(0.28, 0.46, sw) * (1 - sstep(0.52, 1, sw));   // swing: wind up (crouch, lean back), then lunge
    if (sw >= 0) { u.legs[0].rotation.x += 0.3 * lun - 0.1 * ant; u.legs[1].rotation.x += -0.3 * lun + 0.1 * ant; u.legs[0].scale.y -= 0.06 * ant; u.legs[1].scale.y -= 0.06 * ant; }
    rig.position.y = -0.115 * sc * S2 * S2 * walk - 0.035 * f - 0.05 * sc * ant; rig.rotation.z = S * 0.075 * walk + Math.sin(t * 0.7 + id * 2.1) * 0.018 * idle; rig.rotation.x = 0.05 * walk + 0.12 * run - 0.1 * ant + 0.16 * lun;
    const sq = (1 - 2 * S2) * walk;   // stretched while the legs pass under the body, squashed when they spread
    rig.scale.set(sz * sc * (1 + 0.05 * f - 0.01 * sq), sz * sc * (1 - 0.08 * f + 0.02 * sq), sz * sc * (1 + 0.05 * f - 0.01 * sq));   // squash on the flinch and stretch at the top of each bounce
    u.torso.scale.set(1 + br * 0.4, 1 + br, 1 + br * 0.4); u.torso.rotation.y = S * 0.14 * walk + Math.sin(t * 0.45 + id) * 0.04 * idle; u.torso.rotation.z = -S * 0.06 * walk; u.torso.rotation.x = u.hunch + 0.04 * S2 * walk;
    const hd = u.head; hd.position.y = 1.12 + br * 6 - S2 * 0.025 * walk;
    hd.rotation.y = Math.sin(t * 0.8 + id) * 0.3 * idle - S * 0.08 * walk; hd.rotation.x = Math.sin(t * 1.3 + id) * 0.04 + 0.06 * Math.abs(Math.sin(ph + 0.6)) * walk; hd.rotation.z = Math.sin(t * 0.6 + id * 2) * 0.05 * idle + (type === 4 ? 0.09 : type === 3 ? 0.04 * Math.sin(t * 1.7 + id) : 0) - S * 0.05 * walk;
    const A0 = u.arms[0], A1 = u.arms[1], fl = 0.7 * f;
    A0.position.y = A1.position.y = 1.0 + br * 4;
    A0.rotation.x = -S * (0.6 + 0.4 * run) * walk + Math.sin(t * 1.7 + id) * 0.04; A0.rotation.z = -(0.06 + 0.1 * S2 * walk + fl);
    A1.rotation.x = type >= 3 ? -0.15 + Math.sin(t * 1.5 + id) * 0.03 : S * 0.3 * walk - 0.15; A1.rotation.z = 0.06 + 0.1 * S2 * walk + fl;
    A0.userData.el.rotation.x = -0.3 - 0.35 * walk * Math.max(0, S) - 0.2 * f; A1.userData.el.rotation.x = u.hold + Math.sin(t * 2 + id) * 0.02;
    // ears: slow droop, bounce with the steps, random twitch, pin back when hit
    const tw = u.tw; if (t > tw.next) { tw.t0 = t; tw.next = t + 1.5 + Math.random() * 4.5; tw.ear = (Math.random() * 3) | 0; }
    const k = t - tw.t0, env = k < 0.6 ? Math.exp(-k * 6) * Math.sin(k * 40) : 0;
    for (let i = 0; i < 2; i++) {
      const ear = i ? u.earR : u.earL, s = i ? 1 : -1, bs = ear.userData.base, tz = (tw.ear === 2 || tw.ear === i) ? env : 0;
      ear.rotation.z = bs.z + s * (0.05 * Math.sin(t * 1.3 + id + i * 1.7) + (S2 - 0.5) * 0.16 * walk + tz * 0.35 - 0.5 * f);
      ear.rotation.y = bs.y + s * (0.12 * f + 0.08 * S * walk + tz * 0.1); ear.rotation.x = tz * 0.2 + Math.sin(t * 1.9 + id + i) * 0.03;
    }
    if (u.hat) { u.hat.rotation.z = 0.07 + Math.sin(t * 1.7 + id) * 0.03 - S * 0.06 * walk + 0.08 * f; u.hat.rotation.x = -0.06 + Math.sin(t * 1.3 + id) * 0.02 + 0.05 * S2 * walk; }
    if (u.cape) { u.cape.rotation.x = 0.05 + walk * 0.35 + Math.sin(t * 2 + id) * 0.03; u.cape.rotation.z = Math.sin(t * 1.3 + id) * 0.025; }
    if (u.sparks) {
      const pa = u.sparks.geometry.attributes.position.array, n = pa.length / 3;
      for (let i = 0; i < n; i++) { const an = i / n * TAU * 2.3 + t * (type === 4 ? 0.9 : 1.4), r = 0.45 + (i * 37 % 60) / 100, y = -0.55 + ((i * 53) % 150) / 100 + Math.sin(t * 1.6 + i * 1.9) * 0.07; pa[i * 3] = Math.sin(an) * r; pa[i * 3 + 1] = y; pa[i * 3 + 2] = Math.cos(an) * r; }
      u.sparks.geometry.attributes.position.needsUpdate = true; u.sparks.material.opacity = 0.65 + 0.3 * Math.sin(t * 3 + id);
    }
    if (u.halo) u.halo.material.rotation = t * 0.18;
    u.spin.forEach((m, i) => m.rotation.y = t * (1 + i * 0.2));
    u.glows.forEach((s, i) => s.material.opacity = (s.userData.op ?? 0.75) * (0.85 + 0.15 * Math.sin(t * 3 + i)));
  };
  // ---- death slump: a killed goblin buckles at the knees, folds forward, topples and fades (the actor itself is already gone)
  A.die = a => {
    const g = a.group, u = g && g.userData; if (!u || !u.rig || !(a.hitT > 0 || (a.hp != null && a.hp <= 0))) return false;
    A.corpses.push({ g, u, t: 0, side: Math.random() < 0.5 ? -1 : 1 }); if (u.label) u.label.visible = false; return true;
  };
  A.tick = dt => {
    const hi = GK.settings.gfx !== 'low'; A.U.hull = hi; A.U.rim.value = hi ? 1 : 0;   // T10: Low is plain (no rim, no subsurface, no outline); the rim turns gold inside the vault (centred on the origin, +-9 m)
    const vault = Math.abs(cam.position.x) < 10 && Math.abs(cam.position.z) < 10; A.U.vk += ((vault ? 1 : 0) - A.U.vk) * Math.min(1, dt * 3);
    A.U.rimCol.value.setRGB(1.0, 0.42 + 0.3 * A.U.vk, 0.2 - 0.12 * A.U.vk);
    for (let i = A.corpses.length - 1; i >= 0; i--) {
      const c = A.corpses[i], u = c.u, g = c.g, t = c.t += dt, k1 = sstep(0, 0.45, t), k2 = sstep(0.35, 1.05, t), fade = sstep(1.8, 2.3, t), sc = SCALE[u.type];
      u.legs[0].rotation.x = -1.15 * k1; u.legs[1].rotation.x = -0.9 * k1; u.legs[0].rotation.z = -0.15 * k1; u.legs[1].rotation.z = 0.2 * k1; u.legs[0].scale.y = u.legs[1].scale.y = 1;
      u.rig.position.y = -0.28 * k1; u.rig.rotation.x = 0.1 * k1; u.rig.rotation.z = 0; u.rig.scale.setScalar(sc * (u.sz || 1) * (1 - 0.1 * fade));
      u.torso.rotation.x = u.hunch + 0.95 * k1; u.torso.rotation.z = c.side * 0.2 * k2; u.torso.scale.set(1, 1, 1); u.head.rotation.x = 0.55 * k1 + 0.2 * k2; u.head.rotation.z = c.side * 0.35 * k2; u.head.rotation.y = 0;
      u.arms[0].rotation.x = 0.35 * k1; u.arms[1].rotation.x = 0.35 * k1; u.arms[0].rotation.z = -(0.2 + 0.6 * k2); u.arms[1].rotation.z = 0.2 + 0.6 * k2; u.arms[0].userData.el.rotation.x = -0.1; u.arms[1].userData.el.rotation.x = -0.1;
      for (const s of [-1, 1]) { const ear = s < 0 ? u.earL : u.earR; ear.rotation.z = ear.userData.base.z - s * 0.55 * k1; ear.rotation.x = 0; }
      g.rotation.z = c.side * 1.5 * k2 * k2; g.position.y = 0.12 * k2;
      if (u.cape) u.cape.rotation.x = 0.05 + 0.5 * k1;
      for (const s of u.glows) s.material.opacity *= 1 - fade; if (u.sparks) u.sparks.material.opacity *= 1 - fade; if (u.halo) u.halo.material.opacity = 0;
      if (t > 2.3) { dropGoblin(g); A.corpses.splice(i, 1); }
    }
  };
  A.draws = g => { let n = 0; g.traverse(o => { if ((o.isMesh || o.isSprite || o.isPoints) && o.visible) n++; }); return n; };
  return A;
})();
// GOBLINART-END
// UNIQUE-BEGIN (Goblin King's own features, docs/DESIGN-core-loop.md s1 and s4: panel politics, door intel, knowledge glow, brain aura, king bounty marker; see docs/reports/unique-features.md)
const UNIQUE = (() => {
  const U = {}, cl = (x, a, b) => Math.min(b, Math.max(a, x)), TAU2 = Math.PI * 2;
  RS.selBy = {}; RS.lastSel = {}; RS.lastJ = '{}';
  const soft = (c, g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, Math.min(w, h) / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); };
  const mkTex = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // ---- panel politics (design s1, bullet 1): the round state carries selBy[room] = player id; the panel screen shows that goblin's head, and flashes when another goblin takes the pick
  U.round = d => {   // called from applyRound
    if (d.selBy && typeof d.selBy === 'object') {
      const now = performance.now(), mine = roomKeyAt(P.x, P.z);
      for (const k in d.selBy) {
        const was = RS.selBy[k];
        if (was !== undefined && was !== d.selBy[k] && CP[k]) { CP[k].flashUntil = now + 900; if (k === mine && d.selBy[k] !== me) snd('panel'); }
      }
      RS.selBy = d.selBy;
    }
    if (d.lastSel && typeof d.lastSel === 'object') { const j = JSON.stringify(d.lastSel); if (j !== RS.lastJ) { RS.lastJ = j; RS.lastSel = d.lastSel; if (GK.redrawMaps) GK.redrawMaps(); } }
  };
  U.panel = (g, p) => {   // end of cpDraw: picker badge in the header, flash overlay
    const id = RS.selBy[p.key], sel = RS.sel[p.key] !== undefined, cx = p.W * 0.5 + 30, cy = 37, r = 31;
    if (sel && id !== undefined) {
      const a = actors.get(id), type = a ? a.goblin : -1;
      g.save(); g.fillStyle = 'rgba(8,16,28,.9)'; g.strokeStyle = '#ffd24a'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, TAU2); g.fill(); g.stroke(); g.clip();
      const hc = window.GKHEAD && type >= 0 ? window.GKHEAD(type, 64) : null;
      if (hc) g.drawImage(hc, cx - r, cy - r, r * 2, r * 2); else { g.fillStyle = '#7f95ad'; g.font = 'bold 32px system-ui'; g.textAlign = 'center'; g.fillText('?', cx, cy + 1); }
      g.restore(); g.save(); g.fillStyle = "#ffd24a"; g.font = "800 21px system-ui, sans-serif"; g.textAlign = "left"; g.fillText(id === me ? 'YOU' : 'PICKED BY', cx + r + 8, cy + 1); g.restore();
    }
    const left = (p.flashUntil || 0) - performance.now();
    if (left > 0) { g.save(); g.globalAlpha = Math.min(0.6, left / 900 * 0.7) * (0.6 + 0.4 * Math.sin(left * 0.04)); g.fillStyle = '#ffe9a0'; g.fillRect(0, 0, p.W, p.H); g.restore(); }
  };
  // ---- door intel (design s1, bullet 2): faint arrows on the facility wall map for last round's picks
  GK.mapIntel = (g, mx, my, MS) => {
    for (const k in RS.lastSel) {
      const d = DINFO[RS.lastSel[k]]; if (!d) continue; const dir = d.a === k ? d.da : d.db;
      let cx, cz, w, h;
      if (k[0] === 'c') { const c = CHEST_ROOMS[+k.slice(1)]; if (!c) continue; cx = c.cx; cz = c.cz; w = h = c.size || CS; } else { const i = +k; [cx, cz] = rc(i); w = roomW(i); h = roomD(i); }
      const ux = dir === 'EAST' ? 1 : dir === 'WEST' ? -1 : 0, uz = dir === 'SOUTH' ? 1 : dir === 'NORTH' ? -1 : 0, ex = mx(cx + ux * w / 2) - ux * 13, ey = my(cz + uz * h / 2) - uz * 13;
      g.save(); g.translate(ex, ey); g.rotate(Math.atan2(uz, ux)); g.globalAlpha = 0.62; g.fillStyle = '#1d6fd6'; g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
    g.save(); g.fillStyle = '#7fd0ff'; g.strokeStyle = '#04101c'; g.globalAlpha = 0.85; g.font = '600 20px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.translate(900, 692); g.beginPath(); g.moveTo(12, 0); g.lineTo(-8, -10); g.lineTo(-3, 0); g.lineTo(-8, 10); g.closePath(); g.fill(); g.stroke(); g.fillText('Last picks', 20, 1); g.restore();
  };
  // ---- knowledge glow (design s4): eyes + a forehead rune that brighten with knowledge; one extra draw call per goblin, additive, no lights
  const atlas = mkTex(256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.save(); g.beginPath(); g.rect(0, 0, 128, 128); g.clip(); soft(null, g, 128, 128); g.restore();
    g.save(); g.translate(128, 0); g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 6; g.lineWidth = 5;
    g.beginPath(); g.moveTo(64, 6); g.lineTo(64, 122); g.moveTo(64, 34); g.lineTo(34, 18); g.moveTo(64, 34); g.lineTo(94, 18); g.moveTo(64, 66); g.lineTo(26, 46); g.moveTo(64, 66); g.lineTo(102, 46); g.moveTo(64, 94); g.lineTo(40, 112); g.moveTo(64, 94); g.lineTo(88, 112); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(64, 64, 11, 0, TAU2); g.stroke(); g.beginPath(); g.moveTo(14, 70); g.quadraticCurveTo(26, 56, 34, 76); g.moveTo(114, 70); g.quadraticCurveTo(102, 56, 94, 76); g.stroke(); g.restore();
  });
  const knowGeo = type => {   // two eye glows + a rune patch bent over the forehead (head space; the head ellipsoid is 0.3 x 0.275 x 0.29 about y = 0.22)
    const w = type === 2 ? 0.34 : 0.3, d = type === 2 ? 0.3 : 0.29, P = [], Uv = [], I = []; let n = 0;
    for (const s of [-1, 1]) { const x = s * 0.125, y = 0.252, z = 0.29, q = 0.064; P.push(x - q, y - q, z, x + q, y - q, z, x + q, y + q, z, x - q, y + q, z); Uv.push(0, 0, 0.5, 0, 0.5, 1, 0, 1); I.push(n, n + 1, n + 2, n, n + 2, n + 3); n += 4; }
    const NX = 8, NY = 5, x0 = -0.17, x1 = 0.17, y0 = 0.4, y1 = 0.5;
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const x = x0 + (x1 - x0) * i / NX, y = y0 + (y1 - y0) * j / NY, q = 1 - (x / w) ** 2 - ((y - 0.22) / 0.275) ** 2, z = d * Math.sqrt(Math.max(0.02, q)) + 0.012;
      P.push(x, y, z); Uv.push(0.5 + 0.5 * i / NX, j / NY);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = n + j * (NX + 1) + i, b = a + 1, c = a + NX + 1, e = c + 1; I.push(a, b, e, a, e, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2)); g.setIndex(I); return g;
  };
  const geoCache = {}, cLow = new THREE.Color(0xff9a30), cHigh = new THREE.Color(0xa8f4ff);
  const levelOf = (type, know) => { const base = (itemsData().KNOWLEDGE || [])[type] || 40; return cl(0.1 + 0.25 * cl(base / 100, 0, 1) + 0.65 * cl((know - base) / 24, 0, 1), 0, 1); };
  U.levelOf = levelOf; U.flash = (key, ms) => { if (CP[key]) { CP[key].flashUntil = performance.now() + ms; CP[key].dirty = true; } };   // test hook
  const auraTex = mkTex(128, 128, (g, w, h) => soft(null, g, w, h));
  const crownTex = mkTex(128, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.shadowColor = '#ffd24a'; g.shadowBlur = 8; g.fillStyle = '#ffd24a'; g.strokeStyle = '#3a2500'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(18, 74); g.lineTo(10, 28); g.lineTo(38, 50); g.lineTo(64, 14); g.lineTo(90, 50); g.lineTo(118, 28); g.lineTo(110, 74); g.closePath(); g.fill(); g.stroke();
    g.shadowBlur = 0; g.fillStyle = '#b3122b'; g.beginPath(); g.arc(64, 56, 7, 0, TAU2); g.fill();
  });
  const markers = [];
  const setup = (a, u) => {
    const type = u.type, head = u.head, G = geoCache[type] || (geoCache[type] = knowGeo(type));
    const mat = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.FrontSide, vertexColors: true });
    const geo = G.clone(), nv = geo.attributes.position.count, col = new THREE.BufferAttribute(new Float32Array(nv * 3).fill(1), 3); geo.setAttribute('color', col);   // own colour attribute: the rune fades in separately from the eyes
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 3; head.add(mesh); u.kg = { mesh, mat, col, rf: -1 };
  };
  U.actor = (a, u, id, t) => {   // every frame, from the goblin loop
    if (!u.head || !u.rig) return;
    if (!u.kg) setup(a, u);
    const know = a.know != null ? a.know : (itemsData().KNOWLEDGE || [])[u.type], L = levelOf(u.type, know), pulse = 0.88 + 0.12 * Math.sin(t * (1.6 + L * 2.4) + id);
    u.kgL = L; const m = u.kg.mat; m.color.copy(cLow).lerp(cHigh, L).multiplyScalar((0.3 + 1.6 * L) * pulse); m.opacity = 0.55 + 0.45 * L;
    const rf = Math.pow(cl((L - 0.15) / 0.7, 0, 1), 1.2); if (Math.abs(rf - u.kg.rf) > 0.01) { u.kg.rf = rf; const ca = u.kg.col.array; ca.fill(rf, 24); u.kg.col.needsUpdate = true; }   // forehead rune: invisible at base knowledge, full at high
    u.kg.mesh.visible = !(u.dead > 0);
    // brain aura: a faint pulsing sprite behind a goblin that has eaten brains
    const br = a.brains | 0;
    if (br > 0 && !u.aura) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: auraTex, color: 0xb48cff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 })); s.position.y = 1.05 * SCALE[u.type]; u.aura = s; a.group.add(s); }
    if (u.aura) { const k = Math.min(br, 6); u.aura.visible = br > 0; u.aura.scale.setScalar((1.7 + 0.12 * k) * SCALE[u.type] * (1 + 0.06 * Math.sin(t * 2.2 + id))); u.aura.material.color.copy(cLow).lerp(cHigh, L).lerp(new THREE.Color(0xb48cff), 0.6); u.aura.material.opacity = (0.14 + 0.05 * k) * (0.7 + 0.3 * Math.sin(t * 2.2 + id)); }
    // king bounty: a small crown marker seen through the walls from an adjacent room, within 12 m
    if (u.type === 4 && id !== me) {
      if (!u.crown) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: crownTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, opacity: 0 })); s.renderOrder = 999; s.scale.set(0.5, 0.375, 1); s.userData.aid = id; s.userData.grp = a.group; u.crown = s; scene.add(s); markers.push(s); }   // a scene child, not part of the goblin: the room culling hides goblins in rooms we cannot see, and this marker must still draw
      u.crown.position.set(a.x, 3.05, a.z);
      const mk = roomKeyAt(P.x, P.z), kk = roomKeyAt(a.x, a.z), dist = Math.hypot(a.x - P.x, a.z - P.z);
      const adj = mk !== undefined && kk !== undefined && mk !== kk && (ROOM_DOORS[mk] || []).some(i => DINFO[i].a === kk || DINFO[i].b === kk);
      const show = adj && dist < 12 && GK.mode === 'play' && !(u.dead > 0); u.crown.visible = show;
      if (show) u.crown.material.opacity = 0.9 * (1 - 0.45 * dist / 12) * (0.8 + 0.2 * Math.sin(t * 3));
    }
  };
  U.sync = (a, p) => { if (p.stats && p.stats.knowledge != null) a.know = p.stats.knowledge; a.brains = p.brains | 0; };   // slow state
  U.tick = () => {   // panel flash: keep a flashing screen redrawing, then one last redraw; drop crown markers of goblins that left
    for (let i = markers.length - 1; i >= 0; i--) { const s = markers[i], a = actors.get(s.userData.aid); if (!a || a.group !== s.userData.grp) { scene.remove(s); s.material.dispose(); markers.splice(i, 1); } }
    const now = performance.now();
    for (const p of cpList) if (p.flashUntil) { p.dirty = true; if (now > p.flashUntil) p.flashUntil = 0; }
  };
  U.tagY = type => (GOB_TAGY[type] || 1.95) * (SCALE[type] || 1);   // name tag height: above the wizard's hat / the king's crown
  return U;
})();
GK.unique = UNIQUE; panelsDirty();
// UNIQUE-END
const buildGoblin = GA.build; GK.ga = GA;   // GK.ga: test hook (build, anim, draws, caches)

// ---------- inventory rules (same as the server: also used by the offline simulation and for optimistic UI) ----------
const itemsData = () => window.GKITEMS || { ITEMS: {}, START: [], KNOWLEDGE: [], SLOTS: { backpack: 9, quick: 3 } };
const infoOf = k => { const G = window.GKITEMS; return k == null ? null : (G && G.info && G.info(k)) || (G && G.ITEMS[k]) || null; };   // also knows goblin brains
const itemName = k => { const it = infoOf(k); return it ? it.name : String(k); };
const TIER_COL = { common: '#9aa0a8', uncommon: '#4fc35b', rare: '#4a9bff', mythic: '#b06bff', legendary: '#ffb02e', transcendent: '#7ff4ff', class: '#ffd75e' };
const tierN = k => { const it = infoOf(k); return it && it.tierN != null ? it.tierN : null; };   // null for brains
const tierTxt = k => tierN(k) != null ? 'Tier ' + tierN(k) : '';
const statTxt = k => { const it = infoOf(k); if (!it) return ''; return [tierTxt(k), it.type === 'weapon' ? 'Attack ' + it.attack : it.type === 'armor' ? 'Health ' + it.health + (it.speed ? (it.speed > 1 ? ' · Speed +' : ' · Speed -') + Math.round(Math.abs(it.speed - 1) * 100) + '%' : '') + (it.thorns ? ' · Thorns ' + it.thorns : '') : it.gain != null ? '+' + fmtN(it.gain) + ' knowledge' : it.use || it.type === 'charm' ? it.desc : ''].filter(Boolean).join(' · '); };
const fmtN = n => Number.isInteger(+n) ? String(n) : String(+(+n).toFixed(1));   // keys -> names (plain names from an older server pass through)
const emptyInv = () => ({ backpack: Array(9).fill(null), quick: Array(3).fill(null), weapon: null, armor: null, charm: null });
function startInv(goblin) { const inv = emptyInv(), s = itemsData().START[goblin]; if (s) { inv.weapon = s.weapon || null; inv.armor = s.armor || null; } return inv; }
const SLOT_RE = /^(b[0-8]|q[0-2]|weapon|armor|charm)$/;
function invGet(inv, id) { return id === 'weapon' || id === 'armor' || id === 'charm' ? inv[id] : (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)]; }
function invSet(inv, id, v) { if (id === 'weapon' || id === 'armor' || id === 'charm') inv[id] = v; else (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)] = v; }
function slotAccepts(id, key) {
  if (key == null) return true;
  const it = infoOf(key); if (!it) return false;
  return id === 'weapon' ? it.type === 'weapon' : id === 'armor' ? it.type === 'armor' : id === 'charm' ? it.type === 'charm' : true;
}
function canMove(inv, from, to) { return SLOT_RE.test(from) && SLOT_RE.test(to) && from !== to && invGet(inv, from) != null && slotAccepts(to, invGet(inv, from)) && slotAccepts(from, invGet(inv, to)); }
function invMove(inv, from, to) {   // swaps when the target is occupied; returns false (and changes nothing) if rejected
  if (typeof from !== 'string' || typeof to !== 'string' || !canMove(inv, from, to)) return false;
  const a = invGet(inv, from), b = invGet(inv, to); invSet(inv, to, a); invSet(inv, from, b); return true;
}
function invDrop(inv, id) { if (typeof id !== 'string' || !SLOT_RE.test(id)) return null; const k = invGet(inv, id); if (k == null) return null; invSet(inv, id, null); return k; }
function invStats(inv, goblin, know) {   // attack comes from the weapon, health from the armour, knowledge is innate (+ brains eaten)
  const w = infoOf(inv.weapon), a = infoOf(inv.armor); let hp = a ? (itemsData().goblinHp ? itemsData().goblinHp(goblin, a.health) : a.health) : 0; const hpc = (itemsData().charmEff && itemsData().charmEff(inv.charm, 'hp')) || 0; hp += hpc;   // GOBTYPES: plus the type's health bonus
  return { knowledge: know != null ? know : (itemsData().KNOWLEDGE || [])[goblin] != null ? itemsData().KNOWLEDGE[goblin] : STATS[goblin].knowledge, attack: w ? w.attack : 0, health: hp, maxHealth: hp };
}
function invAll(inv) { return [inv.weapon, inv.armor, inv.charm, ...inv.backpack, ...inv.quick].filter(k => k != null); }

// ---------- networking (real server, or a local simulation for the offline demo) ----------
function makeNet(opts) {   // opts.goblin: play this goblin type (a saved character) instead of rolling one
  if (!window.GK_OFFLINE) {
    // SECURITY: the server rolls the goblin and owns the victories. A saved character only sends its signed token (empty = an old character without one: the server rolls a new goblin and says so).
    const joinUrl = () => { let tk = ''; try { const c = opts && opts.charId != null && window.GKSAVE ? GKSAVE.getCharacter(+opts.charId) : null; if (c) tk = c.token || ''; else if (opts && opts.charId != null) tk = ''; } catch (e) {} return funUrl((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + (opts && opts.charId != null ? '/?ctoken=' + encodeURIComponent(tk) : '')); };
    const tokUrl = tk => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/?token=' + encodeURIComponent(tk);   // SOCIAL: resume a player inside the grace period
    let ws = new WebSocket(opts && opts.resume ? tokUrl(opts.resume) : joinUrl()), busyRetry = false;
    let lastM = '', lastMT = 0;   // NET: my position goes out only when it changed (plus a 1 s keepalive); attacks carry the server time I was seeing
    const net = { send: m => {
      if (ws.readyState !== 1) return;
      if (m.m) { const j = JSON.stringify(m), t = performance.now(); if (j === lastM && t - lastMT < 1000) return; lastM = j; lastMT = t; return ws.send(j); }
      if (m.atk === 1 && NETC.offPong) m = { atk: 1, rt: Math.round(srvNow() - NETC.delay) };
      ws.send(JSON.stringify(m));
    }, onmessage: null };
    const ping = () => ws.readyState === 1 && ws.send(JSON.stringify({ ping: performance.now() }));
    setInterval(ping, 2000);   // NET: RTT and clock offset
    const wire = w => { w.onopen = ping; w.onmessage = e => { let d; try { d = JSON.parse(e.data); } catch (err) { return; } if (d.busy) { busyRetry = true; toastMsg('Servers are full — retrying…', false, 3500); setTimeout(() => { busyRetry = false; lastM = ''; ws = new WebSocket(joinUrl()); wire(ws); }, 4000); return; } net.onmessage && net.onmessage(d); }; w.onclose = () => { if (w !== ws || busyRetry) return; onClose(); }; };   // SECURITY: {busy:1} = match cap reached, try again
    GK.social.attach({ state: () => ws.readyState, drop: () => ws.close(), reopen: tk => { lastM = ''; ws = new WebSocket(tokUrl(tk)); wire(ws); } });   // SOCIAL: reconnect with the token
    const onClose = () => { if (GK.social.onClose()) return; const m = document.getElementById('me'); if (m) m.textContent = 'Disconnected - reload to rejoin'; /* FEEL-BEGIN */ if (GK.feel) GK.feel.onClose(); /* FEEL-END */ };
    wire(ws);
    return net;
  }
  const roll = () => itemsData().rollGoblin ? itemsData().rollGoblin() : (Math.random() * 3) | 0;   // GOBTYPES: the server's weighted 12-type roll
  let nid = 1, list = [], meP = null, seq = 0;
  const myWins = Math.max(0, (opts && opts.wins) | 0);
  const simSlots = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);   // 5x5: every goblin starts in a home of its own (offline: the free homes in random order)
  const mk = bot => {
    const slot = simSlots.length ? simSlots.pop() : Math.floor(Math.random() * 8), home = WORLD.homeOf(slot), hc = WORLD.CHEST[2 * slot], box = hc.parent, [cx, cz] = rc(box);
    const [x, z] = WORLD.randomPoint(home);
    const goblin = !bot && opts && opts.goblin != null ? opts.goblin | 0 : roll();
    return { id: nid++, goblin, box, home, x, z, yaw: Math.atan2(-(hc.wallX - x), -(hc.wallZ - z)), bot, tx: cx, tz: cz, wait: Math.random() * 2, seq, inv: startInv(goblin), know: (itemsData().KNOWLEDGE || [])[goblin] != null ? itemsData().KNOWLEDGE[goblin] : STATS[goblin].knowledge, parts: Object.fromEntries((itemsData().PARTS || []).map(p => [p.key, 0])), gold: itemsData().START_GOLD != null ? itemsData().START_GOLD : 100, wins: bot ? Math.max(0, myWins + Math.floor(Math.random() * 3) - 1) : myWins };
  };
  const clone = v => JSON.parse(JSON.stringify(v));
  let layoutSim = null, shopsSim = null, chestKeysSim = null, claimedSim = new Set();   // FEEL: chestKeysSim / claimedSim back the offline claim
  const sendInv = () => net.onmessage && meP && net.onmessage({ inv: clone(meP.inv) });
  const sendGold = () => net.onmessage && meP && net.onmessage({ gold: meP.gold });
  const sendParts = () => net.onmessage && meP && net.onmessage({ parts: clone(meP.parts) });
  let dropsSim = [], nextDrop = 1, mysterySim = null; let craftSim = null;   // STATIONS: the offline demo's running craft
  const sendDrops = () => net.onmessage && net.onmessage({ drops: clone(dropsSim) });
  const roomIdAt = () => CHEST_ROOMS.findIndex(C => Math.abs(meP.x - C.cx) <= C.size / 2 && Math.abs(meP.z - C.cz) <= C.size / 2);
  const simStation = (L, my, st) => L === 'merchant' || (L === 'home' && st !== 'knowledge') || (L === 'forge' && st === 'workbench') || (L === 'grand' && st === 'recycler') || (L === 'mystery' && my && my.kind === 'stations' && my.stations.includes(st));   // same table as server.js stationAt
  const SIM_DBG = /[?&]debug=1/.test(location.search);   // DEV: ?offline=1&debug=1 shows the skip-to-0:10 button
  const eatSim = key => { const G = itemsData(), gain = G.brainGain(key); meP.know = Math.round((meP.know + gain) * 100) / 100; meP.brains = (meP.brains || 0) + 1; const max = maxHpOf(meP), heal = G.hasPerk && G.hasPerk(meP.perks, 'gourmet') ? Math.min(G.KNOW.gourmet, max - hpOf(meP)) : 0; if (heal > 0) meP.hp += heal; net.onmessage && net.onmessage({ ate: { gain, knowledge: meP.know, ...(heal > 0 ? { heal } : null) } }); };
  const sendMatch = () => { const w = list.map(p => p.wins); net.onmessage && net.onmessage({ match: { size: 5, alive: list.length, minWins: Math.min(...w), maxWins: Math.max(...w) } }); };
  const entry = ({ id, goblin, box, home, x, z, yaw, seq, inv, wins, know, hp, kills, brains }) => { const s = invStats(inv, goblin, know); if (hp != null) s.health = Math.min(hp, s.maxHealth); return { id, goblin, box, home, x, z, yaw, seq, kills: kills || 0, brains: brains || 0, stats: s, gear: { weapon: inv.weapon && infoOf(inv.weapon) ? infoOf(inv.weapon).name : null, armor: inv.armor && infoOf(inv.armor) ? infoOf(inv.armor).name : null }, wins }; };
  const emit = () => net.onmessage && net.onmessage({ players: list.map(entry) });
  // NET: the offline mock speaks the same protocol as server.js: slow {players} on changes, {s:[...]} snapshots of the bots that moved every 50 ms, {pong}
  const lastSent = new Map();
  const emitSnap = () => { if (!net.onmessage) return; const t = Math.round(performance.now()), out = [t]; for (const b of list) { if (b === meP) continue; const l = lastSent.get(b.id), d = l ? Math.hypot(b.x - l.x, b.z - l.z) : 1, v = d < 0.004 ? 0 : Math.min(12, d / 0.05); if (l && d < 0.004 && b.yaw === l.yaw && l.v === 0) continue; lastSent.set(b.id, { x: b.x, z: b.z, yaw: b.yaw, v }); out.push(b.id, Math.round(b.x * 100) / 100, Math.round(b.z * 100) / 100, Math.round(b.yaw * 1000) / 1000, Math.round(v * 10) / 10, 0); } if (out.length > 1) net.onmessage({ s: out }); };
  // same round machine as server.js, run locally: 30 s first round, 45 s after; bots pick a door in their room each round
  const rs = { n: 1, dur: 120000, endsAt: performance.now() + 120000, sel: {}, open: [], fizzled: [] };   // 5x5: every round is 2 minutes, as on the server (offline: tree rooms and vaultbreakers are visual only, no special rules)
  const isVault = id => DINFO[id].kind === 'vault', votes = () => Object.keys(rs.sel).filter(k => isVault(rs.sel[k])).length;
  const rmsg = () => ({ round: { n: rs.n, left: Math.max(0, rs.endsAt - performance.now()), dur: rs.dur }, sel: { ...rs.sel }, open: rs.open.slice(), vaultVotes: votes(), fizzled: rs.fizzled.slice(), ...(rs.n === 1 ? { homeLock: 1 } : null) });   // HOME PHASE: round 1 is spent at home, as on the server
  const homeExits = () => { for (const p of list) { const c = String(WORLD.CHEST[+p.home.slice(1)].parent), ds = (ROOM_DOORS[c] || []).filter(id => !isVault(id)); if (ds.length && !ds.some(id => rs.open.includes(id))) rs.open.push(ds[Math.floor(Math.random() * ds.length)]); } };   // HOME PHASE: round 2 opens one door of every home's cell (server.js homeOpen)
  const emitRound = () => net.onmessage && net.onmessage(rmsg());
  const botPlan = () => { for (const b of list) if (b.bot) b.selAt = performance.now() + 1500 + Math.random() * (rs.dur - 6000); };
  // COMBAT-BEGIN offline simulation of the server's combat: bots have health, fight back within 6 m, drop loot when killed; same rules as server.js (items.js combat())
  let simDeaths = 0;
  const wcOf = p => (itemsData().combat ? itemsData().combat(p.inv.weapon) : { dmg: 1, range: 2.2, cd: 600, ranged: false });
  const maxHpOf = p => invStats(p.inv, p.goblin, p.know).maxHealth;
  const hpOf = p => (p.hp == null ? (p.hp = maxHpOf(p)) : (p.hp = Math.min(p.hp, maxHpOf(p))));
  const inCone = (a, t, reach) => { const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz); return d <= reach && (d < 0.05 || (dx * -Math.sin(a.yaw) + dz * -Math.cos(a.yaw)) / d >= Math.cos(itemsData().COMBAT.cone)); };
  function simKill(t, from) {
    simDeaths++; from.kills = (from.kills || 0) + 1;
    if (from === meP) net.onmessage && net.onmessage({ kills: from.kills });
    const G = itemsData(), items = invAll(t.inv), brain = G.brainKey ? G.brainKey(t.know) : null;
    dropsSim.push({ id: nextDrop++, x: +t.x.toFixed(2), z: +t.z.toFixed(2), items: brain ? [...items, brain] : items });   // loot the way the server drops it
    if (t === meP) { t.dead = true; net.onmessage && net.onmessage({ died: { items, brain, by: from.id } }); } else list.splice(list.indexOf(t), 1);
    sendDrops(); emit(); sendMatch();
    if (!meP.dead && list.every(p => p === meP)) net.onmessage && net.onmessage({ won: { items: invAll(meP.inv), gold: meP.gold, parts: clone(meP.parts) } });   // last goblin standing
  }
  function simHit(t, dmg, from) {
    const max = maxHpOf(t); t.hp = Math.max(0, hpOf(t) - dmg); t.hurtAt = performance.now();
    net.onmessage && net.onmessage({ hit: { from: from.id, to: t.id, dmg, hp: t.hp, max, dead: t.hp <= 0 } });
    if (t.hp <= 0) simKill(t, from); else emit();
  }
  function simAtk() {   // the player's {atk:1}
    if (!meP || meP.dead || !rs.started) return;
    const c = wcOf(meP), now = performance.now(); if (now - (meP.atkAt || 0) < c.cd * 0.9) return; meP.atkAt = now;
    net.onmessage && net.onmessage({ swing: meP.id });
    const key = roomKeyAt(meP.x, meP.z); let best = null, bd = 1e9;
    for (const b of list) { if (!b.bot || roomKeyAt(b.x, b.z) !== key || !inCone(meP, b, c.range + itemsData().COMBAT.slack)) continue; const d = Math.hypot(b.x - meP.x, b.z - meP.z); if (d < bd) { bd = d; best = b; } }
    if (best) simHit(best, c.dmg, meP);
  }
  setInterval(() => {   // bot behaviour (a bot within 6 m in the same room walks to the player and attacks) and health regeneration
    const now = performance.now();
    if (meP && !meP.dead && meP.hp != null && meP.hp < maxHpOf(meP) && now - (meP.hurtAt || 0) >= 6000 && now - (meP.regenAt || 0) >= 4000) { meP.regenAt = now; meP.hp++; emit(); }
    for (const b of list.slice()) {
      if (!b.bot) continue;
      if (!meP || meP.dead || !rs.started) { b.chase = false; continue; }
      const dx = meP.x - b.x, dz = meP.z - b.z, d = Math.hypot(dx, dz), c = wcOf(b);
      if (d >= 6 || roomKeyAt(b.x, b.z) !== roomKeyAt(meP.x, meP.z)) { b.chase = false; continue; }
      if (!b.chase) b.atkAt = now + 900 - c.cd * 1.8;   // reaction delay when a bot first notices the player
      b.chase = true; b.yaw = Math.atan2(-dx, -dz);
      const stop = c.ranged ? 4 : 1.7;
      if (d > stop) { b.x += dx / d * 2.4 * 0.1; b.z += dz / d * 2.4 * 0.1; b.box = roomAt(b.x, b.z); }
      if (!window.GK_BOTS_PASSIVE && rs.n > 1 && now - rs.goAt >= 20000 && d <= c.range && now - (b.atkAt || 0) >= c.cd * 1.8) { b.atkAt = now; net.onmessage && net.onmessage({ swing: b.id }); if (inCone(b, meP, c.range + 0.3)) simHit(meP, c.dmg, b); }
    }
  }, 100);
  // COMBAT-END
  // ITEMS2-DEMO-BEGIN: the offline demo can use items too (a reduced copy of server.js useItem(): heals, tonic, jar, thrown items, traps, flares, bells, notes)
  let simToss = 0;
  const demoKit = p => { ['x:bandage', 'x:smoke', 'x:trap'].forEach((k, i) => { p.inv.quick[i] = k; }); ['x:flare', 'x:lens', 'x:ward', 'x:dazzle', 'x:rage', 'x:bait', 'x:jar', 'c:heart', 'x:bell'].forEach((k, i) => { p.inv.backpack[i] = k; }); };
  function simUse(slot) {
    const say = o => net.onmessage && net.onmessage(o), key = /^(b[0-8]|q[0-2])$/.test(slot) ? invGet(meP.inv, slot) : null, it = key && itemsData().ITEMS[key];
    if (!it || !it.use) return say({ useFail: 'item' }); if (!rs.started) return say({ useFail: 'now' });
    let extra = {}; const fx = -Math.sin(meP.yaw), fz = -Math.cos(meP.yaw), rk = roomKeyAt(meP.x, meP.z), id = ++simToss, here = { x: +meP.x.toFixed(2), z: +meP.z.toFixed(2), room: rk };
    switch (it.use) {
      case 'heal': { const mx = maxHpOf(meP); if (hpOf(meP) >= mx) return say({ useFail: 'full' }); const b0 = meP.hp; meP.hp = Math.min(mx, b0 + it.n); extra = { hp: meP.hp - b0 }; emit(); break; }
      case 'speed': extra = { ms: it.ms, n: it.n }; break;
      case 'know': meP.know = Math.round((meP.know + it.n) * 100) / 100; say({ ate: { gain: it.n, knowledge: meP.know } }); break;
      case 'smoke': case 'bomb': { const tx = +(meP.x + fx * 6).toFixed(2), tz = +(meP.z + fz * 6).toFixed(2); say({ toss: { id, kind: it.use, by: meP.id, from: [here.x, here.z], to: [tx, tz], ms: 600, room: rk } }); if (it.use === 'bomb') setTimeout(() => say({ boom: { id, x: tx, z: tz, r: it.r, room: rk } }), 1600); break; }
      case 'trap': say({ trap: { id, ...here, by: meP.id, arm: it.arm } }); break;
      case 'bell': say({ bell: { id, ...here } }); break;
      case 'flare': say({ flare: { id, ...here, ms: it.ms, by: meP.id } }); extra = { ms: it.ms }; break;
      case 'dazzle': say({ flash: { id: meP.id, ...here, r: it.r, ms: it.ms } }); break;
      case 'lens': case 'ward': case 'rage': extra = { ms: it.ms }; break;
      default: break;
    }
    invSet(meP.inv, slot, null); sendInv(); say({ used: { key, slot, ...extra } });
  }
  // ITEMS2-DEMO-END
  const net = {
    onmessage: null,
    send(m) {
      if (typeof m.ping === 'number') net.onmessage && net.onmessage({ pong: m.ping, t: Math.round(performance.now()) });
      if (m.atk === 1) simAtk();
      if (typeof m.use === 'string' && meP) simUse(m.use);   // ITEMS2
      if (m.dbgFF === 1 && SIM_DBG && rs.started) { rs.endsAt = Math.min(rs.endsAt, performance.now() + 10000); emitRound(); }   // DEV: same rule as server.js dbgFF
      if (m.enter === 1 && !rs.started) { rs.started = true; rs.goAt = performance.now(); rs.endsAt = performance.now() + rs.dur; botPlan(); emitRound(); }
      if (Number.isInteger(m.sel) && meP) { const k = roomKeyAt(meP.x, meP.z); if ((ROOM_DOORS[k] || []).includes(m.sel) && rs.sel[k] !== m.sel) { rs.sel[k] = m.sel; emitRound(); } }
      if (m.m && meP) { [meP.x, meP.z, meP.yaw] = m.m; meP.box = roomAt(meP.x, meP.z); } if (m.reroll) { claimedSim.clear(); net.onmessage && net.onmessage({ claimedReset: 1 }); const o = list.indexOf(meP); seq++; meP = mk(false); meP.id = list[o].id; list[o] = meP; sendInv(); sendGold(); sendParts(); emit(); }
      // FEEL-BEGIN offline claim: mirrors server.js claim() (E in a chest room or a weapon / armour / gold mystery room, once per player)
      if (m.claim === 1 && meP) {
        const id = roomIdAt(), L = id >= 0 && layoutSim ? layoutSim[id] : null, my = id >= 0 && mysterySim ? mysterySim[id] : null;
        let key = null, gold = 0, why = null;
        if (L === 'chest') key = chestKeysSim && chestKeysSim[id];
        else if (L === 'mystery' && my && (my.kind === 'weapon' || my.kind === 'armor')) key = my.key;
        else if (L === 'mystery' && my && my.kind === 'gold') gold = my.amount;
        else why = 'room';
        if (!why && claimedSim.has(id)) why = 'taken';
        if (!why && key && meP.inv.backpack.indexOf(null) < 0) why = 'space';
        if (why) net.onmessage && net.onmessage({ claimFail: why });
        else {
          if (key) { meP.inv.backpack[meP.inv.backpack.indexOf(null)] = key; sendInv(); }
          claimedSim.add(id);
          if (gold) { meP.gold += gold; sendGold(); }
          net.onmessage && net.onmessage({ claimed: { room: id, key: key || null, gold } }); emit();
        }
      }
      // FEEL-END
      if (Array.isArray(m.mv) && meP) { invMove(meP.inv, m.mv[0], m.mv[1]); sendInv(); emit(); }   // same rules as the server; always answer with the real inventory
      if (typeof m.drop === 'string' && meP) { invDrop(meP.inv, m.drop); sendInv(); emit(); }
      if (typeof m.eat === 'string' && meP) {
        const k = /^(b[0-8]|q[0-2])$/.test(m.eat) ? invGet(meP.inv, m.eat) : null;
        if (itemsData().isBrain && itemsData().isBrain(k)) { invSet(meP.inv, m.eat, null); eatSim(k); }
        sendInv(); emit();
      }
      if (typeof m.recycle === 'string' && meP) {
        const id = roomIdAt(), L = id >= 0 && layoutSim ? layoutSim[id] : null, my = id >= 0 && mysterySim ? mysterySim[id] : null;
        const has = simStation(L, my, 'recycler');
        const key = /^(b[0-8]|q[0-2])$/.test(m.recycle) ? invGet(meP.inv, m.recycle) : null, y0 = key && (itemsData().recycleFor ? itemsData().recycleFor(key, meP.perks) : itemsData().recycleYield(key)), y = y0 && L === 'home' && itemsData().recycleEff ? itemsData().recycleEff(y0, itemsData().STATIONS.recycler.home.eff) : y0;
        if (!has) net.onmessage && net.onmessage({ recycleFail: 'room' });
        else if (!y) net.onmessage && net.onmessage({ recycleFail: 'item' });
        else { invSet(meP.inv, m.recycle, null); for (const k in y) meP.parts[k] = (meP.parts[k] || 0) + y[k]; sendInv(); sendParts(); net.onmessage && net.onmessage({ recycled: { key, parts: y } }); emit(); }
      }
      if (m.craftCancel === 1 && meP && craftSim) { for (const k in craftSim.cost) meP.parts[k] = (meP.parts[k] || 0) + craftSim.cost[k]; craftSim = null; sendParts(); net.onmessage && net.onmessage({ craftCancel: 'cancel' }); }   // STATIONS (offline): same rules as server.js craft()
      if (typeof m.craft === 'string' && meP) {
        const id = roomIdAt(), L = id >= 0 && layoutSim ? layoutSim[id] : null, my = id >= 0 && mysterySim ? mysterySim[id] : null, G = itemsData();
        const has = simStation(L, my, 'workbench') || simStation(L, my, 'knowledge');   // KNOWLEDGE: the tree is a bench too
        const r = (G.RECIPES || []).find(x => x.id === m.craft), bc = r && has && G.benchCraft ? G.benchCraft({ stats: { knowledge: meP.know } }, r, L === 'forge' ? 'master' : 'normal', meP.perks) : null, cost = bc && bc.cost;
        const why = !has ? 'room' : !r ? 'recipe' : craftSim ? 'busy' : bc && bc.why ? bc.why : Object.keys(cost).some(k => (meP.parts[k] || 0) < cost[k]) ? 'parts' : meP.inv.backpack.indexOf(null) < 0 ? 'space' : null;
        if (why) net.onmessage && net.onmessage({ craftFail: why });
        else {
          for (const k in cost) meP.parts[k] -= cost[k]; sendParts(); const job = craftSim = { cost, id, rid: r.id, out: r.out };
          net.onmessage && net.onmessage({ crafting: { rid: r.id, ms: bc.ms, type: L === 'forge' ? 'master' : 'normal', bonus: bc.bonus ? 1 : 0 } });
          setTimeout(() => {   // finished, unless cancelled or you left the room
            if (craftSim !== job) return; craftSim = null;
            if (roomIdAt() !== job.id || meP.inv.backpack.indexOf(null) < 0) { for (const k in job.cost) meP.parts[k] = (meP.parts[k] || 0) + job.cost[k]; sendParts(); net.onmessage && net.onmessage({ craftCancel: roomIdAt() !== job.id ? 'left' : 'space' }); return; }
            meP.inv.backpack[meP.inv.backpack.indexOf(null)] = job.out; sendInv(); net.onmessage && net.onmessage({ crafted: { key: job.out, recipe: job.rid } }); emit();
          }, bc.ms);
        }
      }
      if ((typeof m.learn === 'string' || typeof m.reforge === 'string') && meP) {   // KNOWLEDGE: same checks as server.js learn() / reforge()
        const G = itemsData(), id = roomIdAt(), L = id >= 0 && layoutSim ? layoutSim[id] : null, my = id >= 0 && mysterySim ? mysterySim[id] : null;
        const has = simStation(L, my, 'workbench') || simStation(L, my, 'knowledge');
        meP.perks = meP.perks || [];
        if (typeof m.learn === 'string') { const why = !has ? 'room' : G.learnFail(m.learn, meP.know, meP.brains, meP.perks); if (why) net.onmessage && net.onmessage({ learnFail: why }); else { meP.perks.push(m.learn); net.onmessage && net.onmessage({ perks: meP.perks.slice(), learned: m.learn }); } }
        else { const slot = m.reforge, key = /^(b[0-8]|q[0-2]|weapon|armor)$/.test(slot) ? invGet(meP.inv, slot) : null, cost = key && G.reforgeCost(key);
          const why = !has ? 'room' : !G.hasPerk(meP.perks, 'reforge') ? 'perk' : !cost ? 'item' : Object.keys(cost).some(k => (meP.parts[k] || 0) < cost[k]) ? 'parts' : null;
          if (why) net.onmessage && net.onmessage({ reforgeFail: why }); else { for (const k in cost) meP.parts[k] -= cost[k]; invSet(meP.inv, slot, key + '+'); sendInv(); sendParts(); net.onmessage && net.onmessage({ reforged: { slot, key: key + '+' } }); emit(); } }
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
  meP = mk(false); list = [meP, mk(true), mk(true), mk(true), mk(true)]; demoKit(meP);
  setTimeout(() => { net.onmessage && net.onmessage({ you: meP.id, ...(SIM_DBG ? { dbg: 1 } : null), ...(() => { const layout = GKITEMS.randomLayout(); layoutSim = layout; mysterySim = layout.map(t => t === 'mystery' ? GKITEMS.randomMystery() : null); shopsSim = layout.map(t => t === 'merchant' ? GKITEMS.randomShop() : null); return { layout, mystery: mysterySim, shops: clone(shopsSim) }; })(), chests: Array.from({ length: CHEST_ROOMS.length }, () => Math.floor(Math.random() * WEAPONS.length)), chestKeys: (chestKeysSim = Array.from({ length: CHEST_ROOMS.length }, () => GKITEMS.randomWeaponKey())), ...rmsg() }); sendInv(); sendGold(); sendParts(); sendMatch(); emit(); }, 50);
  botPlan();
  setInterval(() => {
    const now = performance.now();
    if (!rs.started) { rs.endsAt = now + rs.dur; return; }   // round 1 waits for Enter, as on the server
    if (now >= rs.endsAt) { const picked = [...new Set(Object.values(rs.sel))], ok = votes() >= 2; rs.open = picked.filter(d => ok || !isVault(d)); rs.fizzled = ok ? [] : picked.filter(isVault); rs.sel = {}; rs.n++; if (rs.n === 2) homeExits(); rs.dur = 120000; rs.endsAt = now + rs.dur; botPlan(); emitRound(); return; }
    for (const b of list) if (b.bot && b.selAt && now >= b.selAt) { b.selAt = 0; const k = roomKeyAt(b.x, b.z), ids = ROOM_DOORS[k]; if (ids && rs.sel[k] === undefined) { const vs = ids.filter(isVault), pool = vs.length && Math.random() < 0.5 ? vs : ids; rs.sel[k] = pool[Math.floor(Math.random() * pool.length)]; emitRound(); } }
  }, 200);
  setInterval(emitRound, 1000);
  setInterval(() => {
    for (const b of list) {
      if (!b.bot || b.chase) continue;
      if (rs.n === 1 && roomKeyAt(b.tx, b.tz) !== b.home) { [b.tx, b.tz] = WORLD.randomPoint(b.home); b.homeHold = true; }   // HOME PHASE: offline bots potter about at home in round 1
      else if (rs.n > 1 && b.homeHold) { b.homeHold = false; const hc = WORLD.CHEST[+b.home.slice(1)]; [b.tx, b.tz] = rc(hc.parent); }   // the arena is open: walk out into the cell
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d < 0.3) {
        b.wait -= 0.05;
        if (b.wait <= 0) {
          const c = roomAt(b.x, b.z), N5 = WORLD.N, col = c % N5, row = Math.floor(c / N5), n = [];
          if (col > 0) n.push(c - 1); if (col < N5 - 1) n.push(c + 1); if (row > 0) n.push(c - N5); if (row < N5 - 1) n.push(c + N5);
          [b.tx, b.tz] = rc(n[Math.floor(Math.random() * n.length)]); b.wait = 1 + Math.random() * 3;
        }
      } else { b.x += dx / d * 2.8 * 0.05; b.z += dz / d * 2.8 * 0.05; b.yaw = Math.atan2(-dx, -dz); b.box = roomAt(b.x, b.z); }
    }
    emitSnap();
  }, 50);
  setInterval(() => { if (simDeaths) { sendMatch(); return; } const bots = list.filter(p => p.bot); if (bots.length > 2 && Math.random() < 0.5) list.splice(list.indexOf(bots[0]), 1); else if (bots.length < 6) list.push(mk(true)); emit(); sendMatch(); }, 7000);
  return net;
}

// ---------- state ----------
function dropGoblin(g) { // free GPU memory of a removed goblin (shared geometry/materials re-upload lazily if reused)
  scene.remove(g);
  if (window.GKTAGS) window.GKTAGS.disposeTag(g.userData.label); else { const lm = g.userData.label && g.userData.label.material.map; if (lm) lm.dispose(); }
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); [].concat(o.material || []).forEach(m => m.dispose()); });
}
// NET-BEGIN (client side of the netcode: snapshot interpolation with an adaptive delay, clock sync, ping readout, server corrections; see docs/reports/netcode.md)
const NETC = { off: null, offPong: false, rtt: 0, delay: 100, jit: 0, lastArr: 0, lastT: 0, rt: 0, fix: null, el: null, txt: '' };
const NS = { x: 0, z: 0, yaw: 0, y: 0 };   // scratch result of netSample (no per-frame allocation)
const srvNow = () => performance.now() + (NETC.off || 0);   // estimate of the server clock in ms
function netRenderT(dt) {   // the server time that remote goblins are drawn at: now minus the interpolation delay (never runs backwards)
  NETC.delay += (clamp(66 + 2 * NETC.jit, 70, 150) - NETC.delay) * Math.min(1, dt * 2);
  const r = srvNow() - NETC.delay; NETC.rt = r > NETC.rt || NETC.rt - r > 500 ? r : NETC.rt; return NETC.rt;
}
function netPong(d) {   // {pong: my ping time, t: server time}
  const now = performance.now(), rtt = now - d.pong; if (!(rtt >= 0 && rtt < 5000) || typeof d.t !== 'number') return;
  NETC.rtt = NETC.rtt ? NETC.rtt + (rtt - NETC.rtt) * 0.3 : rtt;
  if (!NETC.offPong || rtt <= NETC.rtt * 1.5 + 5) { const o = d.t + rtt / 2 - now; NETC.off = !NETC.offPong || NETC.off == null ? o : NETC.off + (o - NETC.off) * 0.2; NETC.offPong = true; }
  netHud();
}
function netHud() {   // small ping readout, bottom right: green below 80 ms, yellow below 150, red above (hidden offline and outside play mode)
  if (!NETC.el) { NETC.el = document.createElement('div'); NETC.el.style.cssText = 'position:fixed;right:10px;bottom:8px;z-index:5;padding:3px 7px;border-radius:6px;background:rgba(10,10,16,.55);font:600 11px/1 system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 3px #000;display:none'; document.body.appendChild(NETC.el); }
  const show = !window.GK_OFFLINE && NETC.offPong && GK.mode === 'play', r = Math.round(NETC.rtt), txt = 'Ping ' + r + ' ms';
  if (show !== (NETC.el.style.display === 'block')) NETC.el.style.display = show ? 'block' : 'none';
  if (txt !== NETC.txt) { NETC.txt = txt; NETC.el.textContent = txt; NETC.el.style.color = r < 80 ? '#7be08a' : r < 150 ? '#ffd75e' : '#ff6a5a'; }
}
setInterval(netHud, 500);
function netSnap(s) {   // {s:[t, id,x,z,yaw,speed,age, ...]}: buffer one entry per moved goblin, stamped with the server time its position was received
  const now = performance.now(), t = s[0];
  if (NETC.off == null) NETC.off = t - now;
  if (NETC.lastArr) NETC.jit += (Math.min(Math.abs(now - NETC.lastArr - (t - NETC.lastT)), 300) - NETC.jit) * 0.1;   // arrival jitter (RFC 3550 style)
  NETC.lastArr = now; NETC.lastT = t;
  for (let i = 1; i + 5 < s.length; i += 6) {
    const a = actors.get(s[i]); if (!a || s[i] === me) continue;
    const et = t - s[i + 5], b = a.buf || (a.buf = []), l = b[b.length - 1];
    if (l && et <= l.t) continue;
    if (l && l.v === 0 && et - l.t > 250) b.push({ t: et - 66, x: l.x, z: l.z, yaw: l.yaw, v: 0, y: l.y });   // was standing still: hold the old spot until just before he moved
    b.push({ t: et, x: s[i + 1], z: s[i + 2], yaw: s[i + 3], v: s[i + 4] % 100, y: Math.floor(s[i + 4] / 100) / 100 });   // JUMP: the speed slot also carries the jump height in cm (v + 100 * cm)
    while (b.length > 3 && b[1].t < et - 1500) b.shift();
  }
}
function netSample(a, rt) {   // position of a remote goblin at server time rt: interpolate between the two snapshots around it, extrapolate at most 100 ms past the newest
  const b = a.buf, n = b ? b.length : 0; if (!n) return null;
  const L = b[n - 1];
  if (rt >= L.t) {
    NS.x = L.x; NS.z = L.z; NS.yaw = L.yaw; NS.y = L.y || 0;
    if (L.v > 0 && n > 1) { const q = b[n - 2], dx = L.x - q.x, dz = L.z - q.z, d = Math.hypot(dx, dz), o = Math.min(rt - L.t, 100) / 1000; if (d > 1e-4) { NS.x += dx / d * L.v * o; NS.z += dz / d * L.v * o; } }
    return NS;
  }
  if (rt <= b[0].t) { NS.x = b[0].x; NS.z = b[0].z; NS.yaw = b[0].yaw; NS.y = b[0].y || 0; return NS; }
  let i = n - 2; while (i > 0 && b[i].t > rt) i--;
  const A = b[i], B = b[i + 1], f = (rt - A.t) / (B.t - A.t || 1);
  NS.x = A.x + (B.x - A.x) * f; NS.z = A.z + (B.z - A.z) * f; NS.yaw = A.yaw + wrapPi(B.yaw - A.yaw) * f; NS.y = (A.y || 0) + ((B.y || 0) - (A.y || 0)) * f; return NS;
}
function netFixStep(a, dt) {   // the server refused a move ({fix:[x,z]}): blend my position back to the last accepted one (snap when it is far away)
  const f = NETC.fix; if (!f) return;
  const dx = f[0] - P.x, dz = f[1] - P.z, d = Math.hypot(dx, dz), k = d > 4 || d < 0.02 ? 1 : Math.min(1, dt * 14);
  P.x += dx * k; P.z += dz * k; a.x = P.x; a.z = P.z; if (k === 1) NETC.fix = null;
}
// NET-END
let netReal = null;
const net = { send: m => netReal && !(GK.locked && (m.atk || m.claim || m.m || m.sel !== undefined)) && netReal.send(m) };   // MATCH: those are locked until GO
const actors = new Map();
function npcLook(group, kind) {   // BOTS: hostile mystery enemy = normal goblin model with a type tint (no new geometry, no lights); materials are cloned so the shared ones stay untouched
  const tint = { troll: 0x6a8a5a, archer: 0x7a5a3a, speedy: 0xff7a3a, dumb: 0xb89a6a, regular: 0xd05a4a, rat: 0x8a7560 }[kind] || 0xd05a4a, c = new THREE.Color(tint);
  group.traverse(o => { if (o.isMesh && o.material && o.material.color && !Array.isArray(o.material)) { o.material = o.material.clone(); o.material.color.multiply(c).multiplyScalar(1.4); } });
  group.scale.setScalar(kind === 'troll' ? 1.8 : kind === 'speedy' ? 0.9 : kind === 'rat' ? 0.4 : 1.1);
}
let me = 0, spawned = false;
const P = { x: 0, z: 0, yaw: 0, pitch: 0, speed: 0 };
const handleMsg = d => { handleMsg0(d); /* MATCH */ if (GK.matchOnMsg) GK.matchOnMsg(d); };
const handleMsg0 = d => {
  if (d.s) return netSnap(d.s);   // NET: fast position snapshots (hot path)
  if (d.pong != null) return netPong(d);
  if (d.emote || d.token || d.resumed || d.resumeFail) SOC.onMsg(d);   // SOCIAL
  if (d.fix) NETC.fix = d.fix;
  /* FEEL-BEGIN */ if (GK.feel) GK.feel.onMsg(d); /* FEEL-END */
  if (window.GKACT5) GKACT5.pre(d);   // ACT5UI: breach by door -> by side, arc labels
  if (GK.r5) GK.r5.onMsg(d);   // ROOMS5ART: trees / vb / treasury / crown / breach fields and the match start / end
  if (d.layout) applyLayout(d.layout, d.mystery);
  if (d.chestKeys || d.chests) applyChests(d.chestKeys || d.chests);   // item keys like 'w:axe' (new), or legacy indices
  if (d.drops) applyDrops(d.drops);
  if (d.inv) setInv(d.inv);
  if (d.match) applyMatch(d.match);
  if (d.shops) applyShops(d.shops);
  if (d.gold != null) setGold(d.gold);
  if (d.buyFail) shopFail(d.buyFail);
  if (d.claimed) try { GKVFX.glint({ x: P.x, y: 1.0, z: P.z }, d.claimed.key ? 0xb8e8ff : 0xffd75e, 14); } catch (e) {} /* VFX */
  if (d.claimed) toastMsg(d.claimed.key ? 'Took ' + ((infoOf(d.claimed.key) || {}).name || d.claimed.key) : '+' + d.claimed.gold + ' gold', true);
  if (d.claimFail && d.claimFail !== 'room') toastMsg({ taken: 'Already taken', space: 'Your backpack is full' }[d.claimFail] || 'Nothing to take', false);
  if (d.parts) setParts(d.parts);
  if (d.recycled) recycledFx(d.recycled);
  if (d.recycleFail) stationFail('recycle', d.recycleFail);
  if (d.crafted) craftedFx(d.crafted);
  if (d.craftFail) stationFail('craft', d.craftFail);
  if (d.ate) ateFx(d.ate);
  KNOWUI.onMsg(d);   // KNOWLEDGE: perks, learning, reforging, map intel
  if (d.lootFail) lootFailFx(d.lootFail);
  if (GK.fun) GK.fun.onMsg(d);   // FUN: kill feed, board, match summary
  if (window.GKSTATSUI) GKSTATSUI.onMsg(d);   // STATS: lifetime stats recorder (statsui.js)
  if (window.GKLOOT) GKLOOT.onMsg(d);   // LOOT: vault relic, thrown plushie
  if (window.GKHOMEW) GKHOMEW.onMsg(d);   // ELIXIR: counter, Elixir Screen state, toasts, send effects
  if (window.GKUSE) GKUSE.onMsg(d);   // UTILITY: used items, thrown bombs, smoke
  if (window.GKRULES) GKRULES.onMsg(d);   // RULES: experimental rules (inert unless the server advertises them)
  if (d.died) showDeathScreen(d.died);
  if (d.won) showVictory(d.won);
  if (d.swing != null || d.hit || d.kills != null || d.match) combatMsg(d);   // COMBAT
  if (d.you) me = d.you;
  if (d.dbg === 1 || (d.matchStart && d.matchStart.dbg === 1)) GK.dbg = true;   // DEV: the server runs with GK_DEBUG (shows the skip-to-0:10 button)
  if (d.round || d.sel || d.open) applyRound(d);
  if (window.GKHUD5) GKHUD5.onMsg(d);   // HUD5: round banners, crown panel, tints, activity arc
  if (window.GKACT5) GKACT5.onMsg(d);   // ACT5UI: room state for the art and the prompts, toasts, fails
  if (d.exitHint) toastMsg('No way out: a door unlocks in ' + Math.ceil((+d.exitHint.ms || 5000) / 1000) + ' s', false, 2600);   // DOORGUARD
  if (d.exitOpen != null) toastMsg('A door unlocks', true, 1800);   // DOORGUARD
  if (!d.players) return;
  const ids = new Set(d.players.map(p => p.id));
  for (const [id, a] of actors) if (!ids.has(id)) { if (!GA.die(a)) dropGoblin(a.group); else try { GKVFX.dissolve(a.x, a.z, 1.5 * (SCALE[a.goblin] || 1), 0xffd75e); } catch (e) {} /* VFX */ actors.delete(id); }
  for (const p of d.players) {
    let a = actors.get(p.id);
    if (a && a.goblin !== p.goblin) { dropGoblin(a.group); actors.delete(p.id); a = null; }
    if (!a) {
      const group = buildGoblin(p.goblin); scene.add(group); if (p.npc) { npcLook(group, p.npc); GK.fun && GK.fun.hideDecoy(p.x, p.z); }   // BOTS: bots look like normal goblins; mystery enemies get a hostile tint (and the troll is big)
      a = { group, goblin: p.goblin, x: p.x, z: p.z, yaw: p.yaw, phase: Math.random() * 6, speed: 0, seq: p.seq };
      actors.set(p.id, a);
      if (p.id === me) spawned = false;
    }
    a.box = p.box; a.npc = p.npc; if (p.home) { const ch = a.home !== p.home || a.name !== p.name; a.home = p.home; a.name = p.name; if (ch && p.id === me) GK.myHome = p.home; if (ch) panelsDirty(); } combatSync(a, p);   // 5x5: whose home is whose (panels and maps name homes)
    vmGear(a, p); GA.gear(a, p); UNIQUE.sync(a, p); SOC.sync(a, p);   // positions of existing goblins come from the snapshots (NET), not from this slow list
    if (p.id === me && !spawned) { P.x = p.x; P.z = p.z; P.yaw = p.yaw; P.pitch = 0; a.x = p.x; a.z = p.z; spawned = true; }
  }
  const mine = actors.get(me);
  $('me').textContent = mine ? 'You are: ' + NAMES[mine.goblin] : GK.mode === 'dead' ? 'You are out' : GK.mode === 'win' ? 'You won' : 'Connecting...';   // after death or a win my actor is gone: do not claim we are still connecting
  if (mine) showStats(d.players.find(p => p.id === me), mine.goblin);
  $('cnt').textContent = actors.size + ' online';
  if (mine && !assigned) { assigned = true; GK.onAssigned && GK.onAssigned(mine.goblin); }
};
let assigned = false;
let statsEl = null;
function leftStack() {   // one bottom-left column: the combat card sits above the stats card, so they never overlap
  let s = document.getElementById('gkLeft');
  if (!s) { s = document.createElement('div'); s.id = 'gkLeft'; s.style.cssText = 'position:fixed;left:2vw;bottom:2.5vh;max-width:calc(100vw - 4vw);display:flex;flex-direction:column;gap:6px;align-items:stretch;pointer-events:none;z-index:20'; document.body.appendChild(s); }
  return s;
}
function showStats(p, type) {   // small stat panel, bottom-left
  ensureCss();
  if (!statsEl) {
    statsEl = document.createElement('div');
    statsEl.style.cssText = 'min-width:190px;padding:10px 14px;border-radius:10px;background:rgba(10,10,16,.62);border:1px solid rgba(255,215,94,.35);color:#f2efe6;font:600 14px/1.5 system-ui,sans-serif;pointer-events:none;display:none;text-shadow:0 1px 4px #000';
    leftStack().appendChild(statsEl);
  }
  if (p && p.stats && p.stats.knowledge != null) knowOv = p.stats.knowledge;
  const mineInv = invReady ? invStats(myInv, type, knowOv) : null;   // my own inventory is the freshest source for my stats
  const st = Object.assign({}, STATS[type], mineInv, p && p.stats), gear = Object.assign({}, GEAR[type], p && p.gear, invReady ? { weapon: myInv.weapon ? itemName(myInv.weapon) : 'none', armor: myInv.armor ? itemName(myInv.armor) : 'none' } : null);
  GK.myStats = { knowledge: st.knowledge, attack: st.attack, health: st.health, maxHealth: st.maxHealth || st.health };   // read by the knowledge tree tiers
  const packN = invReady ? myInv.backpack.filter(Boolean).length : 0;
  const max = st.maxHealth || st.health || 1;
  if (!statsEl._f) {   // PERF: the card is built once; each refresh only sets the text of the fields whose value changed
    statsEl.innerHTML = '<div style="display:none"></div>'
      + '<div style="display:flex;justify-content:space-between"><span>Attack</span><span></span></div>'
      + '<div style="display:flex;justify-content:space-between"><span>Knowledge</span><span id="hudKnow"></span></div>'
      + '<div style="display:flex;justify-content:space-between;align-items:center"><span>Gold</span><span><i class="gkcoin"></i> <b style="color:#ffd75e"></b></span></div>'
      + '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.12);font-weight:500;color:#cfd3dc"><div>Weapon: <b style="color:#f2efe6"></b> <small></small></div>'
      + '<div>Armour: <b style="color:#f2efe6"></b> <small></small></div>'
      + '<div>Materials: <b style="color:#f2efe6"></b></div>'
      + '<div>Backpack: <b style="color:#f2efe6"></b></div></div>';
    const c = statsEl.children, g = c[3], gl = c[4].children;
    statsEl._f = { name: c[0], atk: c[1].lastChild, know: c[2].lastChild, gold: g.querySelector('b'), wep: gl[0].querySelector('b'), wepS: gl[0].querySelector('small'), arm: gl[1].querySelector('b'), armS: gl[1].querySelector('small'), mat: gl[2], matB: gl[2].querySelector('b'), pack: gl[3].querySelector('b') };
  }
  const F = statsEl._f, setT = (e, s) => { if (e._t !== s) { e._t = s; e.textContent = s; } };
  setT(F.name, NAMES[type].toUpperCase()); setT(F.atk, '' + st.attack); setT(F.know, fmtN(st.knowledge)); setT(F.gold, '' + myGold);
  setT(F.wep, '' + gear.weapon); setT(F.wepS, tierN(myInv.weapon) != null ? 'T' + tierN(myInv.weapon) : '');   // the attack number is the row above
  setT(F.arm, '' + gear.armor); setT(F.armS, tierN(myInv.armor) != null ? 'T' + tierN(myInv.armor) : '');   // max health is in the health card
  const pt = partsTotal(); if (F.mat._h !== !pt) { F.mat._h = !pt; F.mat.style.display = pt ? '' : 'none'; } setT(F.matB, '' + pt);
  setT(F.pack, packN + ' / 9');
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
    try { window.GKART && GKART.dropLook && GKART.dropLook(g, d.items, glow, lab); } catch (e) {}   // ICONFRAME: tier beam + the best item floating over the bag
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
GK.tipEnv = () => ({ mine: actors.get(me), brainNear: dropsList.some(d => Math.hypot(d.x - P.x, d.z - P.z) < 7 && d.items.some(k => infoOf(k) && infoOf(k).family === 'brain')) });   // TIPS hook
// ---- death screen: run stats, then back to the main menu or straight into the queue again ----
const run = { t0: 0, n0: 0, dist: 0 };
let deathEl = null;
// RESULT-SCREENS (menu2): one card layout for death and victory: the big result, the run in three numbers, the details, then the buttons (styles: .rs* in index.html)
const rsEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function rsCard(o) {   // o: { big, sub (html), hero: [[value, label]], rows: [[label, value]], mid (html), note, btns: [[id, label, primary]] }
  return '<div class="rs-card"><h1 class="rs-big">' + rsEsc(o.big) + '</h1><div class="rs-sub">' + o.sub + '</div>'
    + '<div class="rs-hero">' + o.hero.map(h => '<div><b>' + rsEsc(h[0]) + '</b><span>' + rsEsc(h[1]) + '</span></div>').join('') + '</div>'
    + '<dl class="rs-rows">' + o.rows.map(r => '<dt>' + rsEsc(r[0]) + '</dt><dd>' + rsEsc(r[1]) + '</dd>').join('') + '</dl>' + (o.mid || '')
    + (o.note ? '<div class="rs-note">' + o.note + '</div>' : '')
    + '<div class="rs-btns">' + o.btns.map(b => '<button id="' + b[0] + '" class="rbtn' + (b[2] ? ' primary' : '') + '">' + rsEsc(b[1]) + '</button>').join('') + '</div></div>';
}
function rsShow(cls, html) {
  const el = document.createElement('div'); el.className = 'rs ' + cls; el.innerHTML = html; document.body.appendChild(el); requestAnimationFrame(() => { el.style.opacity = 1; }); return el;
}
const rsTime = secs => Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
function showDeathScreen(info) {
  if (GK.mode !== 'play') return;
  const mine = actors.get(me), type = mine ? mine.goblin : 0, gear = GEAR[type], st = STATS[type];
  const ms = performance.now() - run.t0, secs = Math.floor(ms / 1000), n = GK.roundInfo ? GK.roundInfo().n : 0;
  const where = roomName(roomKeyAt(P.x, P.z));
  closeInv(true); closeShop(true); GK.mode = 'dead'; inside = false; keys.clear(); hideHotbar(); GK.social.clear();   // SOCIAL: out of the match, nothing to resume
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  for (const id of ['hint', 'dot', 'rr', 'roundHud', 'hud', 'gkLeft']) { const el = $(id); if (el) el.style.display = 'none'; }
  if (statsEl) statsEl.style.display = 'none';
  const rows = [['Goblin', NAMES[type]], ['Survived', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')], ['Round reached', n || 1], ['Distance travelled', Math.round(run.dist) + ' m'], ['Died in', where],
    ['Starting weapon', gear.weapon + ' (' + [tierTxt((itemsData().START[type] || {}).weapon), st.attack + ' dmg'].filter(Boolean).join(', ') + ')'], ['Starting armour', gear.armor + ' (' + [tierTxt((itemsData().START[type] || {}).armor), st.health + ' HP'].filter(Boolean).join(', ') + ')'], ['Dropped', [...((info && info.items) || []), ...(info && info.brain ? [info.brain] : [])].map(k => itemName(k) + (tierN(k) != null ? ' (T' + tierN(k) + ')' : '')).join(', ') || 'nothing']];
  const kl = info && info.killer, killedBy = kl ? (kl.npc ? 'a ' : '') + kl.name + (kl.w ? ' (' + kl.w + ')' : '') : '';
  const dhero = [[rsTime(secs), 'Survived'], [n || 1, 'Round'], [(typeof CB !== 'undefined' && CB.kills) | 0, 'Kills']];
  deathEl = rsShow('dead', rsCard({ big: 'You died', sub: 'Your run', hero: dhero, rows: (killedBy ? [['Killed by', killedBy]] : []).concat(rows.filter(r => r[0] !== 'Survived' && r[0] !== 'Round reached')), note: 'Everything you carried is lost.', btns: [['deathQueue', 'Requeue', true], ['deathMenu', 'Main menu']] }));
  $('deathQueue').onclick = () => { try { sessionStorage.setItem('gk.requeue', '1'); } catch (e) {} location.reload(); };   // fresh connection, new wheel roll
  $('deathMenu').onclick = () => location.reload();
  if (GK.fun) GK.fun.deathButton(info);   // FUN: SPECTATE
  if (window.GK_OFFLINE) {   // demo: come back as a new goblin right here; the loot pile stays and can be looted
    const b = document.createElement('button'); b.id = 'deathAgain'; b.textContent = 'NEW GOBLIN (DEMO)';
    b.className = 'rbtn';
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
// MINIMAP-BEGIN (HUD minimap top right + M overlay; see docs/reports/minimap.md). Reads RS, DINFO, actors, P, CHEST_ROOMS. No lights, no per-frame allocation: redraws at most 10 Hz and only when the signature changes.
(() => {
  const WD = window.GKWORLD, LIM = WD.LIM, NA = WD.NARENA, NR = NA + CHEST_ROOMS.length;   // 5x5: room index = arena 0..24, then attached rooms 25..40 (NR = outside)
  const st = document.createElement('style');
  st.textContent = '#gkMM{position:fixed;top:84px;right:12px;z-index:29;pointer-events:none;display:none;line-height:0;border:2px solid #c9a13a;border-radius:10px;box-shadow:inset 0 0 0 1px #5a4513,0 0 0 1px #2a1e08,0 4px 16px rgba(0,0,0,.65);overflow:hidden}'
    + '#gkMMBig{position:fixed;inset:0;z-index:60;pointer-events:none;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}'
    + '#gkMMBig canvas{border:3px solid #c9a13a;border-radius:14px;box-shadow:inset 0 0 0 1px #5a4513,0 8px 40px rgba(0,0,0,.8)}#gkMM canvas{display:block}';
  document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'gkMM'; const cv = document.createElement('canvas'); box.appendChild(cv);
  const bigBox = document.createElement('div'); bigBox.id = 'gkMMBig'; const cvB = document.createElement('canvas'); bigBox.appendChild(cvB);
  document.body.appendChild(box); document.body.appendChild(bigBox);
  const gS = cv.getContext('2d'), gB = cvB.getContext('2d');
  // ---- static tables (built once)
  const KEYS = WD.ROOMS.map(r => r.key);
  const idxOf = k => k[0] === 'c' ? (k === 'c-1' ? NR : NA + (+k.slice(1))) : +k;
  const keyIdx = (x, z) => idxOf(WD.roomKeyOf(x, z));
  const rcx = i => i < NA ? WD.rc(i)[0] : CHEST_ROOMS[i - NA].cx, rcz = i => i < NA ? WD.rc(i)[1] : CHEST_ROOMS[i - NA].cz;
  const ND = DINFO.length, dA = new Int8Array(ND), dB = new Int8Array(ND), dX = new Float32Array(ND), dZ = new Float32Array(ND), dH = new Uint8Array(ND), dKind = new Uint8Array(ND);
  const DIRV = { NORTH: [0, -1], EAST: [1, 0], SOUTH: [0, 1], WEST: [-1, 0] };
  WD.DOORS.forEach(d => { dA[d.id] = idxOf(d.a); dB[d.id] = idxOf(d.b); dX[d.id] = d.wall.x; dZ[d.id] = d.wall.z; dH[d.id] = d.axis === 'x' ? 1 : 0; dKind[d.id] = d.kind === 'vault' ? 1 : d.kind === 'hatch' ? 2 : 0; });
  const dirOf = (d, k) => DIRV[d.a === k ? d.da : d.db];
  // ---- state
  const disc = new Uint8Array(CHEST_ROOMS.length), openF = new Uint8Array(ND), vis = new Uint8Array(NR + 1);
  let layRef = null, openRef = null, selRef = null, lastRef = null, lastSig = 1e9, prevOn = false, bigOpen = false, szS = 0, szB = 0, dprC = 0, bgS = null, bgB = null, fontS = '', fontB = '', fontCap = '', forceDraw = true, feedTop = -1;
  let cg = null, cip = 1, cbig = false, cmy = 0, sigH = 0;   // per-draw context for the shared actor callbacks
  const cfg = () => GK.settings || {};
  // parchment background (rendered once per size) with a vignette
  const makeBg = (S, dpr) => {
    const c = document.createElement('canvas'); c.width = c.height = Math.round(S * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr);
    g.fillStyle = '#17120b'; g.fillRect(0, 0, S, S);
    const n = Math.round(S * S / 14); let s = 12345;   // deterministic parchment speckle and fibres
    for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; const x = (s & 0xffff) / 65535 * S; s = (s * 1664525 + 1013904223) >>> 0; const y = (s & 0xffff) / 65535 * S; g.fillStyle = (s & 0x100) ? 'rgba(214,186,128,.07)' : 'rgba(60,40,18,.12)'; g.fillRect(x, y, 1 + (s >> 9 & 1), 1); }
    g.strokeStyle = 'rgba(190,160,100,.05)'; g.lineWidth = 1; for (let i = 0; i < S / 5; i++) { s = (s * 1664525 + 1013904223) >>> 0; const x = (s & 0xffff) / 65535 * S; s = (s * 1664525 + 1013904223) >>> 0; const y = (s & 0xffff) / 65535 * S; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6 + (s & 7), y + ((s >> 4 & 7) - 3)); g.stroke(); }
    const r = g.createRadialGradient(S / 2, S / 2, S * .3, S / 2, S / 2, S * .75); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = r; g.fillRect(0, 0, S, S);
    return c;
  };
  const sizeFor = big => big ? Math.round(Math.max(300, Math.min(innerHeight * .84, innerWidth * .92, 860))) : Math.round(Math.max(150, Math.min(220, innerWidth * .12)));
  function resize(big) {
    const S = sizeFor(big), dpr = Math.min(3, window.devicePixelRatio || 1), c = big ? cvB : cv;
    c.width = c.height = Math.round(S * dpr); c.style.width = c.style.height = S + 'px';
    const bg = makeBg(S, dpr), f = '700 ' + Math.round(S / (big ? 28 : 15)) + 'px system-ui,sans-serif';
    if (big) { szB = S; bgB = bg; fontB = f; fontCap = '600 ' + Math.round(S / 50) + 'px system-ui,sans-serif'; } else { szS = S; bgS = bg; fontS = f; }
    forceDraw = true;
  }
  // ---- drawing helpers (px units: after g.scale(1/sc))
  function arrowPx(g, r, fill, line) { g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r * .95, r * .95); g.lineTo(0, r * .5); g.lineTo(-r * .95, r * .95); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 1.5; g.strokeStyle = line; g.stroke(); }
  function tickMark(g, r) { g.lineWidth = 2.2; g.strokeStyle = '#5dff8a'; g.lineCap = 'round'; g.beginPath(); g.moveTo(-r * .6, 0); g.lineTo(-r * .1, r * .55); g.lineTo(r * .7, -r * .5); g.stroke(); g.lineCap = 'butt'; }
  const actorSig = (a, id) => { if (id === me || a.npc) return; sigH = (sigH * 31 + Math.round(a.x * 2)) | 0; sigH = (sigH * 31 + Math.round(a.z * 2)) | 0; };
  // HUD5: the map is drawn from HUD5.mapOps (25 arena cells, 16 attached rooms, special room icons, breach bars). Fog of war stays: loot rooms show once discovered, goblins only where I can see.
  const ST = { me: { x: 0, z: 0, yaw: 0 }, discovered: [], open: WD.DOORS.map(d => ({ x: d.wall.x, z: d.wall.z, h: d.axis === 'x' ? 1 : 0, open: d.kind === 'hatch', vault: d.kind === 'vault' })), actors: [], layout: {}, homes: {}, crown: null };
  function hud5State() {
    const H = window.GKHUD5 ? GKHUD5.S : {}, lay = ST.layout, homes = ST.homes, dsc = ST.discovered;
    for (let i = 0; i < CHEST_ROOMS.length; i++) { const t = CHEST_ROOMS[i].type; lay['c' + CHEST_ROOMS[i].id] = t === 'grand' ? 'recycler' : t; }
    for (const k in homes) delete homes[k];
    actors.forEach(a => { if (a.home && a.name && !a.npc) homes[a.home] = a.name; });
    dsc.length = 0; for (let i = 0; i < disc.length; i++) if (disc[i]) dsc.push('c' + CHEST_ROOMS[i].id);
    ST.me.x = P.x; ST.me.z = P.z; ST.me.yaw = P.yaw; ST.myHome = GK.myHome;
    ST.vb = H.vb; ST.vbNext = H.vbNext; ST.trees = H.trees; ST.armed = H.armed; ST.breach = H.breach; ST.crown = H.crown;
    for (let id = 0; id < ND; id++) ST.open[id].open = dKind[id] !== 2 ? !!openF[id] : !RS.homeLock;   // HOME PHASE: the hatches show shut in round 1
    ST.actors.length = 0;
    actors.forEach((a, id) => { if (id === me || a.npc || (vis[keyIdx(a.x, a.z)] !== 1 && !(window.GKUSE2 && GKUSE2.reveal()) && !(window.GKHOMEW && GKHOMEW.bellAt(a.x, a.z)) && !(window.GKACT5 && GKACT5.pulsed(id)))) return; ST.actors.push(a); });   // GKHOMEW.bellAt: a room with a Bell send running shows its goblins
  }
  function arrows(g, ids, ip, lw, col) {   // door-pick arrows (last round's picks, Panel Lens picks)
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw * ip;
    for (let i = 0; i < NR; i++) {
      const id = ids[KEYS[i]]; if (id === undefined || !DINFO[id]) continue;
      const v = dirOf(DINFO[id], KEYS[i]), cx = rcx(i), cz = rcz(i), L = i < NA ? 3.2 : 1.8, hx = v[0] * L, hz = v[1] * L;
      g.beginPath(); g.moveTo(cx - hx * .4, cz - hz * .4); g.lineTo(cx + hx, cz + hz); g.stroke();
      g.beginPath(); g.moveTo(cx + hx * 1.25, cz + hz * 1.25); g.lineTo(cx + hx * .7 - v[1] * L * .45, cz + hz * .7 + v[0] * L * .45); g.lineTo(cx + hx * .7 + v[1] * L * .45, cz + hz * .7 - v[0] * L * .45); g.closePath(); g.fill();
    }
  }
  function draw(g, S, big, bg, font) {
    const dpr = g.canvas.width / S, rot = cfg().mmNorth === false ? P.yaw : 0, sc = (S - S * .1) / (2 * LIM) * (rot ? .72 : 1), ip = 1 / sc;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.drawImage(bg, 0, 0, S, S);
    const my = keyIdx(P.x, P.z), rr = big ? 9 : 5;
    vis.fill(0); if (my < NR) { vis[my] = 1; for (let id = 0; id < ND; id++) if (openF[id] || dKind[id] === 2) { if (dA[id] === my) vis[dB[id]] = 1; else if (dB[id] === my) vis[dA[id]] = 1; } }
    hud5State();
    const ops = HUD5.mapOps(ST, { big }), mainOps = ops.filter(o => o.t !== 'dot' && o.t !== 'me'), topOps = ops.filter(o => o.t === 'dot' || o.t === 'me'), mo = { north: !rot, yaw: P.yaw, time: performance.now() };
    HUD5.drawMap(g, S, mainOps, mo);
    g.save(); g.translate(S / 2, S / 2); g.rotate(rot); g.scale(sc, sc);   // overlays in world metres: door intel, my pick, claimed ticks
    arrows(g, RS.lastSel, ip, 1.6, 'rgba(120,175,255,.42)');
    if (window.GKUSE2 && GKUSE2.lens()) arrows(g, RS.sel, ip, 2.2, '#ffd24a');   // ITEMS2: Panel Lens: every room's current pick
    const mySel = my < NR ? RS.sel[KEYS[my]] : undefined;
    if (mySel !== undefined && DINFO[mySel]) { g.lineWidth = 1.4 * ip; g.strokeStyle = '#bfe6ff'; g.beginPath(); g.arc(dX[mySel], dZ[mySel], 3.6, 0, 6.2832); g.stroke(); }
    for (let i = 0; i < CHEST_ROOMS.length; i++) {
      const c = CHEST_ROOMS[i]; if (!(GK.claimedRooms && GK.claimedRooms.has(c.id))) continue;
      g.save(); g.translate(c.cx, c.cz); g.rotate(-rot); g.scale(ip, ip); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(-rr * 1.3, -rr * 1.3, rr * 2.6, rr * 2.6); tickMark(g, rr * 1.4); g.restore();
    }
    g.restore();
    HUD5.drawMap(g, S, topOps, mo);
    const R = S / 2 - S * .04; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#e8c860'; g.fillText('N', S / 2 + Math.sin(rot) * R, S / 2 - Math.cos(rot) * R);
    if (big) { g.font = fontCap; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillStyle = 'rgba(232,214,160,.85)'; g.fillText('M to close', S * .03, S * .975); g.textAlign = 'right'; g.fillText('green open  red closed  blue ring picked  faint arrows last round', S * .97, S * .975); }
  }
  function discover(my) {   // an outer room is known once I stand in it or look into it through an open door
    if (my >= NR) return;
    if (my >= NA) disc[my - NA] = 1;
    else for (let id = 0; id < ND; id++) if (openF[id]) { if (dA[id] === my && dB[id] >= NA) disc[dB[id] - NA] = 1; else if (dB[id] === my && dA[id] >= NA) disc[dA[id] - NA] = 1; }
  }
  function setBig(on) { bigOpen = on; bigBox.style.display = on ? 'flex' : 'none'; if (on) resize(true); forceDraw = true; }
  addEventListener('keydown', e => {   // M (no other keydown handler uses KeyM)
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && GK.mode === 'play') { const t = e.target && e.target.tagName; if (t === 'INPUT' || t === 'TEXTAREA') return; setBig(!bigOpen); }
    else if (e.code === 'Escape' && bigOpen) setBig(false);
  });
  addEventListener('resize', () => { dprC = 0; });
  setInterval(() => {
    const on = GK.mode === 'play' && cfg().minimap !== false;
    if (GK.mode !== 'play' && bigOpen) setBig(false);
    if (on !== prevOn) { prevOn = on; box.style.display = on ? 'block' : 'none'; forceDraw = true; feedTop = -1; if (!on) document.documentElement.style.removeProperty('--gkFeedTop'); }
    if (!on) return;
    const dpr = window.devicePixelRatio || 1;
    if (!szS || dpr !== dprC || sizeFor(false) !== szS) { dprC = dpr; resize(false); if (bigOpen) resize(true); }
    if (GK.layout !== layRef) { layRef = GK.layout; disc.fill(0); }
    if (RS.open !== openRef) { openRef = RS.open; openF.fill(0); for (let i = 0; i < RS.open.length; i++) if (RS.open[i] < ND) openF[RS.open[i]] = 1; forceDraw = true; }
    if (RS.sel !== selRef || RS.lastSel !== lastRef) { selRef = RS.sel; lastRef = RS.lastSel; forceDraw = true; }
    const my = keyIdx(P.x, P.z); discover(my); let dc = 0; for (let i = 0; i < disc.length; i++) dc += disc[i];
    sigH = (Math.round(P.x * 4) * 131 + Math.round(P.z * 4)) | 0; sigH = (sigH * 131 + Math.round(P.yaw * 25)) | 0; sigH = (sigH * 131 + (cfg().mmNorth === false ? 1 : 2) + my * 7 + (GK.claimedRooms ? GK.claimedRooms.size : 0) * 13 + dc) | 0;
    actors.forEach(actorSig);
    if (sigH === lastSig && !forceDraw) return; lastSig = sigH; forceDraw = false;
    draw(gS, szS, false, bgS, fontS); if (bigOpen) draw(gB, szB, true, bgB, fontB);
    const ft = box.offsetTop + box.offsetHeight + 8; if (ft !== feedTop) { feedTop = ft; document.documentElement.style.setProperty('--gkFeedTop', ft + 'px'); }   // the kill feed stacks under the minimap
  }, 100);
  GK.minimap = { open: () => setBig(true), close: () => setBig(false), disc, redraw: () => { forceDraw = true; } };
})();
// MINIMAP-END
// HUD5-BEGIN (client wiring of hud5.js, task D; see docs/reports/hud-wiring.md): round banners (re-key), room-name banners, crown claim panel, alarm / sudden-death tints, activity arc, dev skip button, special-room icons for the maps. Messages that the server does not send yet (vbNext, actMe, actFx, crown claims, breach) are no-ops.
window.GKHUD5 = (() => {
  const H = window.HUD5; if (!H) return { onMsg() {}, nameOf() { return null; }, S: {} };
  const S = { vb: null, vbNext: null, trees: null, armed: null, breach: null, crown: null, round: 0 };   // read by the minimap (hud5State) and the wall map
  const hud = H.createHud5({ root: document.body, getMe: () => me, clock: () => srvNow(), onSkip: () => net.send({ dbgFF: 1 }) });
  const rootEl = hud.el.style; rootEl.display = 'none';
  document.documentElement.style.setProperty('--gk5SkipTop', '22px'); document.documentElement.style.setProperty('--gk5SkipLeft', 'calc(50% + min(14vw, 185px) + 14px)'); document.documentElement.style.setProperty('--gk5CrownTop', 'max(130px, 24vh)');
  const sameJ = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const typeAt = k => k === VK ? 'vault' : (S.vb && S.vb[k]) || (S.trees && S.trees[k]) || null;
  const redraw = () => { try { GK.minimap && GK.minimap.redraw(); GK.redrawMap && GK.redrawMap(); panelsDirty(); } catch (e) {} };
  let lastRoom = null, dbgOn = false, prevMode = '';
  function onMsg(d) {
    if (d.matchStart) { S.vb = null; S.vbNext = null; S.crown = null; S.breach = null; S.armed = null; S.trees = d.matchStart.trees || null; hud.crown(null); hud.sudden(false); hud.stop(); lastRoom = null; redraw(); }
    if (d.trees && !sameJ(d.trees, S.trees)) { S.trees = d.trees; redraw(); }
    if (d.round) {   // every roundState (also the welcome): vb is the vaultbreaker assignment, vbNext the one revealed 15 s before the end
      const vb = d.vb || null, nx = d.vbNext || null, old = S.vb;
      S.vb = vb; S.vbNext = nx; S.round = d.round.n;
      if (d.breach !== undefined) S.breach = d.breach || null;
      if (d.armed !== undefined) S.armed = d.armed || null;
      hud.roundState({ round: d.round, vb: vb || undefined, vbNext: nx, sudden: !!d.sudden });
      const k = roomKeyAt(P.x, P.z);
      if (old && vb && vb[k] && old[k] && vb[k] !== old[k] && GK.mode === 'play') hud.rekeyed(vb[k]);   // I stand in a room that just changed its function
      if (!sameJ(old, vb) || d.vbNext !== undefined || d.breach !== undefined) redraw();
    }
    if (d.crown !== undefined) {   // claims panel: {claims:[{id,name,s}], gaining, active}; the old crown-win rule's {id,name,p,ms} has no claims and is left to RULES
      if (d.crown === null || d.crown.claims) { hud.crown(d.crown); S.crown = d.crown && (d.crown.active || d.crown.gaining != null) ? { active: true } : null; redraw(); }
    }
    if (d.actMe !== undefined) hud.me(d.actMe || {});   // own activity: {chan:{a,t0,ms,label?,ticks?}} or {timing:{a,t0,per,wa,wb,label?}}; null stops
    if (d.actS) { const a = GK.actState || (GK.actState = {}); a[d.actS.r] = d.actS; }   // room activity state, kept for the room visuals
    if (d.actFx) {
      const f = d.actFx;
      if (f.k === 'rekey') { if (!f.r || f.r === roomKeyAt(P.x, P.z)) hud.fx(f); }
      else if (f.id == null || f.id === me) hud.fx(f);
    }
  }
  setInterval(() => {   // 5 Hz: visibility, dev button, room-name banner, pulsing vault ring
    const play = GK.mode === 'play';
    if (play !== (rootEl.display !== 'none')) rootEl.display = play ? '' : 'none';
    if (play !== (prevMode === 'play')) { prevMode = GK.mode; if (!play) hud.stop(); }
    const dbg = !!GK.dbg && play; if (dbg !== dbgOn) { dbgOn = dbg; hud.debug(dbg); }
    if (!play) return;
    const k = roomKeyAt(P.x, P.z);
    if (k !== lastRoom) { lastRoom = k; const t = typeAt(k); if (t) hud.enterRoom(k, t); }
    if (S.crown && GK.minimap) GK.minimap.redraw();
  }, 200);
  // wall maps: the special room icons go onto the shared facility texture (called by drawShared)
  GK.hud5Map = (g, mx, my, MS) => {
    const Sz = MS * 2 * H.LIM / .9, ops = H.mapOps({ vb: S.vb, vbNext: S.vbNext, trees: S.trees, armed: S.armed, breach: S.breach, crown: S.crown }, { big: true }), out = [];
    for (const o of ops) {
      if (o.t === 'icon' && (o.k === 'ram' || o.k === 'locksmith' || o.k === 'counting' || o.k === 'keystone' || o.k.indexOf('tree:') === 0)) { o.r *= 1.5; out.push(o); }
      else if (o.t === 'text' && Math.abs(o.x) < 42 && Math.abs(o.z) < 42 && o.text !== 'Vault') { o.size *= 2.1; o.dy *= 2.1; o.color = '#1d2733'; out.push(o); }
      else if (o.t === 'breach') out.push(o);
    }
    g.save(); g.translate(mx(0) - Sz / 2, my(0) - Sz / 2); H.drawMap(g, Sz, out, { north: true }); g.restore();
  };
  const nameOf = k => { const t = k !== VK && ((S.vb && S.vb[k]) || (S.trees && S.trees[k])); return t && H.INFO[t] ? H.INFO[t][0] : null; };   // arena rooms with a function carry its name on the panels
  GK.srvNow = srvNow;
  return { onMsg, S, hud, nameOf };
})();
GK.hud5 = GKHUD5;
// HUD5-END
// FUN-BEGIN (kill feed, scoreboard on `, spectating after death, match summary; see docs/reports/fun.md)
function funUrl(u) {   // add the saved character's name to the join query
  try { const c = GK.charId != null && window.GKSAVE ? GKSAVE.getCharacter(+GK.charId) : null; if (c && c.name) return u + (u.indexOf('?') < 0 ? '/?' : '&') + 'name=' + encodeURIComponent(String(c.name).slice(0, 14)); } catch (e) {}
  return u;
}
GK.fun = (() => {
  const GOLDC = '#ffd75e', esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const VERB = { dagger: 'stabbed', spear: 'stabbed', sword: 'sliced', axe: 'sliced', halberd: 'sliced', club: 'smashed', mace: 'smashed', hammer: 'smashed', flail: 'smashed', bow: 'shot', crossbow: 'shot', staff: 'zapped', scepter: 'zapped', wand: 'zapped', whip: 'lashed', sling: 'shot', fist: 'punched' };
  const NPCV = { Archer: 'was shot down by', Speedy: 'was shredded by' };
  const an = w => /^[aeiou]/i.test(w) ? 'an ' : 'a ';
  const S = { board: null, myName: '', feed: null, sb: null, sbOn: false, spec: false, tgt: null, ang: 0, yaw: 0, bar: null, end: null, cp: null, names: {} };
  const css = () => {
    if (document.getElementById('gkFunCss')) return;
    const st = document.createElement('style'); st.id = 'gkFunCss';
    st.textContent = '@keyframes gkFeedIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}'
      + '#gkFeed{position:fixed;top:var(--gkFeedTop,12px);right:12px;z-index:31;display:flex;flex-direction:column;align-items:flex-end;gap:5px;pointer-events:none;font:600 var(--t2,15px)/1.2 var(--ui,system-ui)}'
      + '#gkFeed div{padding:5px 12px;border-radius:0;border-left:3px solid #a8741a;background:rgba(10,10,16,.66);border:1px solid rgba(255,215,94,.3);color:#e9e5da;text-shadow:0 1px 3px #000;animation:gkFeedIn .25s ease-out;transition:opacity .6s;max-width:min(520px,70vw);box-shadow:0 2px 10px rgba(0,0,0,.4)}'
      + '#gkFeed div.me{border-color:' + GOLDC + ';box-shadow:0 0 14px rgba(255,215,94,.35)}#gkFeed div.fade{opacity:0}#gkFeed b{color:' + GOLDC + '}#gkFeed b.v{color:#ff8a7a}#gkFeed i{color:#fff;font-style:normal}'
      + '.gkFunBtn{padding:11px 18px;border-radius:0;font:700 var(--t2,16px)/1 var(--ui,system-ui);letter-spacing:.2em;text-transform:uppercase;cursor:pointer;pointer-events:auto;transition:transform .15s,box-shadow .15s,filter .15s}.gkFunBtn:hover{transform:translateY(-2px);box-shadow:0 0 14px rgba(245,170,50,.5)}.gkFunBtn:active{transform:translateY(1px);box-shadow:none}'
      + '.gkFunBtn.g{border:1px solid var(--gold2,#ffe39a);background:linear-gradient(180deg,#ffe39a,#f5c451 55%,#d9962b);color:#1a1104}.gkFunBtn.o{border:1px solid rgba(255,215,94,.5);background:rgba(10,10,16,.5);color:' + GOLDC + '}.gkFunBtn.w{border:1px solid rgba(255,255,255,.3);background:transparent;color:#f2efe6}';
    document.head.appendChild(st);
  };
  const el = (id, css0) => { let e = document.getElementById(id); if (!e) { e = document.createElement('div'); e.id = id; e.style.cssText = css0; document.body.appendChild(e); } return e; };
  const gname = t => (typeof NAMES !== 'undefined' && NAMES[t]) || 'Goblin';
  const requeue = () => { try { sessionStorage.setItem('gk.requeue', '1'); } catch (e) {} location.reload(); };
  // ---- kill feed
  function feed(f) {
    css(); const box = S.feed || (S.feed = el('gkFeed', '')), row = document.createElement('div');
    if (S.myName && (f.k === S.myName || f.v === S.myName)) row.className = 'me';
    row.innerHTML = f.msg ? '<b>' + esc(f.k) + '</b>' + esc(f.msg) : f.npc ? '<b class="v">' + esc(f.v) + '</b> ' + (NPCV[f.k] || 'was mauled by') + ' ' + an(f.k) + esc(f.k)
      : '<b>' + esc(f.k) + '</b> ' + (VERB[f.f] || 'killed') + ' <b class="v">' + esc(f.v) + '</b>' + (f.w ? ' with ' + an(f.w) + '<i>' + esc(f.w) + '</i>' : '');
    box.appendChild(row); while (box.children.length > 5) box.removeChild(box.firstChild);
    setTimeout(() => row.classList.add('fade'), 5400); setTimeout(() => row.remove(), 6000);
  }
  // ---- scoreboard (hold `)
  function paintBoard() {
    const b = S.board; if (!S.sb) S.sb = el('gkBoard', 'position:fixed;left:50%;top:14vh;transform:translateX(-50%);z-index:55;width:min(560px,94vw);padding:16px 20px 14px;border-radius:14px;background:rgba(10,10,16,.86);border:1px solid rgba(255,215,94,.45);box-shadow:0 10px 50px rgba(0,0,0,.7);color:#f2efe6;font:600 14px system-ui,sans-serif;pointer-events:none;display:none');
    const rows = b ? b.rows.slice().sort((x, y) => y[4] - x[4] || y[3] - x[3] || x[0] - y[0]) : [];
    const html = '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px"><span style="color:' + GOLDC + ';font-weight:800;letter-spacing:.14em">SCOREBOARD</span><span style="color:#cfd3dc">Goblins left <b style="color:' + GOLDC + ';font-size:20px">' + (b ? b.left : '-') + '</b></span></div>'
      + '<div style="display:grid;grid-template-columns:1.4fr 1.3fr .5fr .7fr .8fr;gap:4px 10px;font-variant-numeric:tabular-nums">'
      + ['Goblin', 'Type', 'Kills', 'Status', 'Victories'].map(h => '<span style="color:#8d887f;font-size:11px;letter-spacing:.1em;text-transform:uppercase">' + h + '</span>').join('')
      + rows.map(r => { const you = r[0] === me, c = r[4] ? '#f2efe6' : '#7d7871'; return '<span style="color:' + (you ? GOLDC : c) + ';' + (you ? 'font-weight:800;' : '') + '">' + esc(r[1]) + (r[6] ? ' <small style="margin-left:4px;padding:1px 5px;border-radius:5px;background:rgba(255,255,255,.12);color:#b9b4ae;font-size:10px;letter-spacing:.08em;vertical-align:middle">BOT</small>' : '') + '</span>'
        + '<span style="color:' + c + '">' + esc(gname(r[2])) + '</span><span style="color:' + c + '">' + r[3] + '</span><span style="color:' + (r[4] ? '#8be28b' : '#ff6a5a') + '">' + (r[4] ? 'Alive' : 'Dead') + '</span><span style="color:' + c + '">' + r[5] + '</span>'; }).join('')
      + (rows.length ? '' : '<span style="grid-column:1/-1;color:#8d887f">The scoreboard fills in when the match starts.</span>') + '</div>'; if (S.sbH !== html) { S.sbH = html; S.sb.innerHTML = html; }   // PERF: repaint only when the rows changed
  }
  function showBoard(on) { if (on === S.sbOn) return; S.sbOn = on; if (on) paintBoard(); if (S.sb) S.sb.style.display = on ? 'block' : 'none'; }
  // ---- spectating
  const alive = () => S.board ? S.board.rows.filter(r => r[4] && r[0] !== me && actors.has(r[0])).map(r => r[0]) : [];
  const nameOfId = id => S.names[id] || 'a goblin';
  function cycle(dir) { const l = alive(); if (!l.length) return; const i = l.indexOf(S.tgt); S.tgt = l[i < 0 ? (dir > 0 ? 0 : l.length - 1) : (i + dir + l.length) % l.length]; S.ang = 0; barPaint(); }
  function barPaint() {
    if (!S.bar) return; const l = alive(), a = S.tgt != null && actors.get(S.tgt);
    const wh = a ? 'Spectating <b style="color:' + GOLDC + '">' + esc(nameOfId(S.tgt)) + '</b>' : 'Nobody left to watch'; if (S.whoH !== wh) { S.whoH = wh; S.bar.querySelector('.who').innerHTML = wh; }
    S.bar.querySelector('.hint').textContent = l.length > 1 || (l.length === 1 && l[0] !== S.tgt) ? '← → switch goblin · drag to look' : 'drag to look around';
  }
  function startSpec(info) {
    css(); if (S.spec) return; S.spec = true; if (deathEl) deathEl.style.display = 'none';
    S.tgt = info && info.by != null && actors.has(info.by) ? info.by : (alive()[0] != null ? alive()[0] : null);
    if (!S.bar) {
      S.bar = el('gkSpecBar', 'position:fixed;left:50%;bottom:3vh;transform:translateX(-50%);z-index:58;display:flex;align-items:center;gap:14px;padding:10px 16px;border-radius:0;background:linear-gradient(180deg,rgba(20,16,12,.9),rgba(9,7,7,.92));border:1px solid rgba(245,196,81,.35);box-shadow:0 6px 30px rgba(0,0,0,.6);color:#f2efe6;font:600 var(--t2,15px) var(--ui,system-ui);max-width:96vw;flex-wrap:wrap;justify-content:center');
      S.bar.innerHTML = '<button class="gkFunBtn o" id="gkSpL" style="padding:6px 12px">◀</button><div style="min-width:190px;text-align:center"><div class="who"></div><div class="hint" style="font-size:11px;color:#8d887f;letter-spacing:.06em"></div></div><button class="gkFunBtn o" id="gkSpR" style="padding:6px 12px">▶</button>'
        + '<button class="gkFunBtn g" id="gkSpQ">REQUEUE</button><button class="gkFunBtn w" id="gkSpM">MAIN MENU</button>';
      $('gkSpL').onclick = () => cycle(-1); $('gkSpR').onclick = () => cycle(1); $('gkSpQ').onclick = requeue; $('gkSpM').onclick = () => location.reload();
    }
    S.bar.style.display = 'flex'; barPaint();
  }
  function roomClamp(p, tx, tz) {   // keep the orbit camera inside the walls of the room the followed goblin is in (it used to sit outside them)
    const k = WORLD.roomKeyOf(tx, tz), M = 0.7; let x0, x1, z0, z1;
    { const r = WORLD.roomRect(k); if (!r) return; x0 = r.cx - r.hw; x1 = r.cx + r.hw; z0 = r.cz - r.hd; z1 = r.cz + r.hd; }   // 5x5: any room (arena, home, loot)
    p.x = Math.min(Math.max(p.x, x0 + M), x1 - M); p.z = Math.min(Math.max(p.z, z0 + M), z1 - M);
  }
  function camera(c, dt) {   // third-person orbit around the followed goblin; returns true when it placed the camera
    if (!S.spec) return false;
    let a = S.tgt != null ? actors.get(S.tgt) : null;
    const deadNow = S.tgt != null && S.board && S.board.rows.some(r => r[0] === S.tgt && !r[4]);
    if (!a || deadNow) { const l = alive(); if (l.length) { S.tgt = l[0]; a = actors.get(S.tgt); S.ang = 0; barPaint(); } else if (!a) return false; }
    const sc = (typeof SCALE !== 'undefined' && SCALE[a.goblin]) || 1;
    S.yaw += wrapPi(a.yaw - S.yaw) * Math.min(1, dt * 2.5);
    const ang = S.yaw + S.ang, d = 4.4 * sc + 1.2, px = a.x + Math.sin(ang) * d, pz = a.z + Math.cos(ang) * d, py = 2.5 * sc + 0.8;
    if (!S.cp) S.cp = new THREE.Vector3(px, py, pz); const k = Math.min(1, dt * 6); S.cp.x += (px - S.cp.x) * k; S.cp.y += (py - S.cp.y) * k; S.cp.z += (pz - S.cp.z) * k;
    roomClamp(S.cp, a.x, a.z); c.fov = 68; c.position.copy(S.cp); c.lookAt(a.x, 1.15 * sc, a.z); return true;
  }
  // ---- match summary
  function matchEnd(e) {
    if (GK.mode === 'win') return;   // the victory card is the result; the standings card used to open on top of it
    css(); if (S.end) S.end.remove();
    const mine = e.places.find(p => p.id === me), mmss = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    const line = (k, v) => '<span style="color:#aaa59d">' + k + '</span><b style="text-align:right;font-weight:600">' + v + '</b>';
    const w = e.winner, t = e.top, l = e.longest;
    const box = S.end = el('gkEnd', 'position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:var(--ui,system-ui);color:#f2efe6');
    box.innerHTML = '<div style="width:min(500px,92vw);padding:24px 28px 22px;border-radius:0;background:linear-gradient(180deg,rgba(20,16,12,.94),rgba(9,7,7,.95));border:1px solid rgba(245,196,81,.3);box-shadow:0 10px 60px rgba(0,0,0,.75);animation:gkFeedIn .3s ease-out">'
      + '<div style="text-align:center;color:' + GOLDC + ';font-family:var(--disp,Georgia,serif);font-weight:900;font-size:clamp(30px,6vw,52px);letter-spacing:.04em;text-transform:uppercase;text-shadow:0 0 22px rgba(255,190,50,.45)">Match over</div>'
      + (e.timeLimit ? '<div style="text-align:center;color:#ff8a7a;font-size:12px;letter-spacing:.14em;margin-top:2px">TIME LIMIT REACHED: MOST KILLS, THEN MOST HP</div>' : '')
      + (mine ? '<div style="text-align:center;margin:6px 0 14px;font-size:clamp(30px,6vw,46px);font-weight:900;color:' + (mine.place === 1 ? '#8be28b' : '#f2efe6') + '">#' + mine.place + ' <small style="font-size:.4em;color:#aaa59d;letter-spacing:.1em">OF ' + e.size + '</small></div>' : '<div style="height:12px"></div>')
      + '<div style="display:grid;grid-template-columns:auto 1fr;gap:7px 20px;font-size:15px">'
      + (w ? line('Winner', esc(w.name) + ' <small style="color:#aaa59d">' + esc(gname(w.goblin)) + '</small>') : '')
      + (t ? line('Top killer', esc(t.name) + ' <small style="color:#aaa59d">' + t.kills + (t.kills === 1 ? ' kill' : ' kills') + '</small>') : '')
      + (l ? line('Longest survivor', esc(l.name) + ' <small style="color:#aaa59d">' + mmss(l.secs) + '</small>') : '') + '</div>'
      + '<div style="margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12);display:grid;grid-template-columns:auto 1fr auto auto;gap:3px 12px;font-size:13px;font-variant-numeric:tabular-nums">'
      + e.places.map(p => { const c = p.id === me ? GOLDC : '#cfd3dc'; return '<span style="color:#8d887f">#' + p.place + '</span><span style="color:' + c + '">' + esc(p.name) + '</span><span style="color:' + c + '">' + p.kills + ' K</span><span style="color:#8d887f">' + mmss(p.secs) + '</span>'; }).join('') + '</div>'
      + '<div style="display:flex;gap:10px;margin-top:18px"><button class="gkFunBtn o" id="gkEndX" style="flex:1">CLOSE</button><button class="gkFunBtn g" id="gkEndQ" style="flex:1">REQUEUE</button><button class="gkFunBtn w" id="gkEndM" style="flex:1">MAIN MENU</button></div></div>';
    $('gkEndX').onclick = () => { box.remove(); S.end = null; }; $('gkEndQ').onclick = requeue; $('gkEndM').onclick = () => location.reload();
  }
  function suddenBanner() {   // after round 8 (server rule): all doors open, no healing
    S.sudden = true; css();
    const b = el('gkSudden', 'position:fixed;left:50%;top:34%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;text-align:center;font-family:system-ui,sans-serif;font-weight:900;color:#ff4a3a;text-shadow:0 0 22px #a00,0 3px 10px #000');
    b.innerHTML = '<div style="font-size:clamp(34px,7vw,76px);letter-spacing:.14em">SUDDEN DEATH</div><div style="font-size:clamp(14px,2.4vw,24px);letter-spacing:.1em;color:#ffd75e;margin-top:6px">All doors are open. Healing only in THE VAULT.</div>';
    b.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.7)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.06)', offset: 0.1 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 4500, fill: 'forwards' });
    const t = el('gkSudTag', 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:29;pointer-events:none;padding:2px 12px;border-radius:8px;background:rgba(40,6,6,.72);border:1px solid #ff4a3a;color:#ff6a5a;font:800 12px system-ui,sans-serif;letter-spacing:.14em');
    t.textContent = 'SUDDEN DEATH';
  }
  function onMsg(d) {
    if (d.players) { const m = d.players.find(p => p.id === me); if (m && m.name) S.myName = m.name; for (const p of d.players) if (p.name) S.names[p.id] = p.name; }
    if (d.feed) feed(d.feed);
    if (d.board) { S.board = d.board; for (const r of d.board.rows) S.names[r[0]] = r[1]; if (S.sbOn) paintBoard(); if (S.spec) barPaint(); }
    if (d.sudden && !S.sudden) suddenBanner();
    if (d.matchEnd) matchEnd(d.matchEnd);
  }
  function deathButton(info) {
    if (window.GK_OFFLINE) return;
    css(); const q = $('deathQueue'); if (!q) return;
    const b = document.createElement('button'); b.id = 'deathSpec'; b.className = 'rbtn'; b.textContent = 'Spectate'; b.style.cssText = 'display:block;width:100%;flex:none;margin-top:var(--s2)';
    q.parentNode.parentNode.insertBefore(b, q.parentNode); q.parentNode.style.marginTop = '12px'; b.onclick = () => startSpec(info);
  }
  function hideDecoy(x, z) {   // the room's static decoy enemy model is replaced by the real NPC
    const v = new THREE.Vector3(); scene.traverse(o => { if (o.name === 'mystery-enemy' && o.visible) { o.getWorldPosition(v); if (Math.hypot(v.x - x, v.z - z) < 6) o.visible = false; } });
  }
  addEventListener('keydown', e => {
    if (e.code === 'Backquote' && (GK.mode === 'play' || GK.mode === 'dead')) { e.preventDefault(); showBoard(true); return; }
    if (S.spec && !e.repeat && GK.mode === 'dead') { if (e.code === 'ArrowLeft' || e.code === 'KeyA') cycle(-1); else if (e.code === 'ArrowRight' || e.code === 'KeyD') cycle(1); }
  });
  addEventListener('keyup', e => { if (e.code === 'Backquote') showBoard(false); });
  addEventListener('blur', () => showBoard(false));
  addEventListener('mousemove', e => { if (S.spec && (e.buttons & 1)) S.ang -= e.movementX * 0.006; });
  return { myName: () => S.myName, onMsg, deathButton, camera, hideDecoy, state: S, debugKill: () => net.send({ kill: 1 }) };   // debugKill only works against GK_DEBUG=1 servers
})();
// FUN-END

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
  } else if (id === 'weapon' || id === 'armor' || id === 'charm') { const c = mkIcon(id === 'weapon' ? 'w:sword' : id === 'charm' ? 'c:heart' : 'a:vest', size); c.className = 'sil'; el.appendChild(c); }
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
  myInv = { backpack: Array.from({ length: 9 }, (_, i) => d.backpack[i] == null ? null : d.backpack[i]), quick: Array.from({ length: 3 }, (_, i) => (d.quick || [])[i] == null ? null : d.quick[i]), weapon: d.weapon || null, armor: d.armor || null, charm: d.charm || null };
  invReady = true; if (held && invGet(myInv, held) == null) held = null;
  if (hotEl) paintAll();
  const mine = actors.get(me); if (mine) showStats(null, mine.goblin);
}
function paintStatCol() {
  if (!statColEl) return;
  const mine = actors.get(me), type = mine ? mine.goblin : 0, s = invStats(myInv, type, knowOv), w = myInv.weapon, a = myInv.armor;
  const row = (k, v, sub) => '<div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#aaa59d">' + k + '</span><b>' + v + '</b></div>' + (sub ? '<div style="font-size:11px;color:#8d8880;margin:-2px 0 6px;text-align:right">' + sub + '</div>' : '');
  statColEl.innerHTML = '<div class="lab" style="text-align:left">' + NAMES[type].toUpperCase() + '</div>'
    + row('Attack', s.attack, w ? itemName(w) : 'no weapon') + row('Health', s.health + ' / ' + s.maxHealth, a ? itemName(a) : 'no armour') + row('Knowledge', '<span class="knowv">' + fmtN(s.knowledge) + '</span>', KNOWUI.statNote()) + row('Gold', '<i class="gkcoin"></i> ' + myGold);
}
function flashBad(...ids) { for (const id of ids) for (const el of slotEls[id] || []) { el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad'); } }
function cmpTxt(k) {   // UI-POLISH: "+4 attack vs Dagger" against whatever is equipped in that slot (empty for non-gear and for the equipped item itself)
  const it = infoOf(k); if (!it || (it.type !== 'weapon' && it.type !== 'armor')) return '';
  const cur = it.type === 'weapon' ? myInv.weapon : myInv.armor; if (cur == null || cur === k) return '';
  const ci = infoOf(cur), w = it.type === 'weapon', d = (w ? it.attack : it.health) - (ci ? (w ? ci.attack : ci.health) : 0);
  return '<span style="color:' + (d > 0 ? '#7be07b' : d < 0 ? '#ff8a7a' : '#b9b4a6') + '">' + (d > 0 ? '+' + d : d < 0 ? '\u2212' + (-d) : 'same') + ' ' + (w ? 'attack' : 'health') + ' vs ' + (ci ? ci.name : 'nothing') + '</span>';
}
function tipFor(k) {
  const it = infoOf(k); if (!it) return '<b>' + String(k).replace(/</g, '&lt;') + '</b>';
  const kind = it.type === 'weapon' ? 'Weapon' : it.type === 'armor' ? 'Armour' : it.type ? it.type[0].toUpperCase() + it.type.slice(1) : 'Item', cm = cmpTxt(k);
  return '<b style="color:' + (TIER_COL[it.tier] || GOLD) + '">' + it.name + '</b><span style="color:#b9b4a6">' + kind + ' · ' + statTxt(k) + (cm ? '<br>' + cm : '') + (it.family === 'brain' ? '<br>Eat it for +' + fmtN(it.gain) + ' knowledge' : it.desc ? '<br><i>' + String(it.desc).replace(/</g, '&lt;') + '</i>' : '') + '</span>';
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
  const cl = document.createElement('div'); cl.className = 'lab'; cl.textContent = 'CHARM'; cl.style.margin = '4px 0 -4px';   // ITEMS2: the passive slot
  eq.append(wl, mkSlot('weapon', 70), al, mkSlot('armor', 70), cl, mkSlot('charm', 70));
  const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,62px);gap:7px';
  for (let i = 0; i < 9; i++) grid.appendChild(mkSlot('b' + i, 62));
  statColEl = document.createElement('div'); statColEl.style.cssText = 'min-width:150px;font-size:14px;line-height:1.6';
  main.append(eq, col('BACKPACK', grid), statColEl);
  const quick = document.createElement('div'); quick.style.cssText = 'display:flex;gap:10px;justify-content:center';
  for (let i = 0; i < 3; i++) quick.appendChild(mkSlot('q' + i, 58, String(i + 1)));
  const qwrap = document.createElement('div'); qwrap.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.1)'; qwrap.innerHTML = '<div class="lab">QUICK ACCESS (KEYS 1 2 3)</div>'; qwrap.appendChild(quick);
  const pw = document.createElement('div'); pw.style.cssText = 'margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)'; pw.innerHTML = '<div class="lab">MATERIALS</div>'; pw.appendChild(mkPartsRow()); qwrap.appendChild(pw);
  const foot = document.createElement('div'); foot.style.cssText = 'display:flex;gap:12px;align-items:center;margin-top:14px';
  hintEl = document.createElement('div'); hintEl.style.cssText = 'flex:1;font-size:12px;color:#8d8880;letter-spacing:.04em'; hintEl.textContent = 'Right-click an item to drop it  ·  Tab / I / E to close';
  dropBtn = document.createElement('button'); dropBtn.textContent = 'DROP'; dropBtn.style.cssText = 'border:1px solid rgba(255,90,74,.6);background:rgba(120,20,14,.35);color:#ff8a7a';
  const closeBtn = document.createElement('button'); closeBtn.textContent = 'CLOSE'; closeBtn.style.cssText = 'border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font-weight:800';
  const eatBtn = document.createElement('button'); eatBtn.textContent = 'EAT / USE'; eatBtn.id = 'invEat'; eatBtn.style.cssText = 'border:1px solid #8be28b;background:rgba(40,120,50,.35);color:#b8f5b8';
  eatBtn.onclick = () => { const k = held && invGet(myInv, held); if (k && infoOf(k) && (infoOf(k).family === 'brain' || infoOf(k).use || infoOf(k).type === 'charm')) eatSlot(held); else { hintEl.style.color = '#ff8a7a'; hintEl.textContent = 'Pick up a brain or a utility item first, then press Eat / Use (or double-click it)'; setTimeout(() => { hintEl.style.color = '#8d8880'; hintEl.textContent = 'Right-click an item to drop it  ·  Tab / I / E to close'; }, 2200); } };
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
    if (!id) { if (e.target === invEl) { if (held) { held = null; paintAll(); } else closeInv(); } return; }   // FULLSCREEN-2: a click outside the bag closes it
    if (held == null) { if (invGet(myInv, id) != null) { held = id; hideTip(); paintAll(); ghostAt(e); } } else moveInv(held, id);
  });
  invEl.addEventListener('contextmenu', e => { e.preventDefault(); const id = held || slotOf(e); if (id) dropSlot(id); });
  invEl.addEventListener('mousemove', e => {
    ghostAt(e);
    const id = slotOf(e), k = id && !held ? invGet(myInv, id) : null;
    if (k == null) { hideTip(); return; }
    tipEl.innerHTML = tipFor(k).replace(/<span/, '<br><span'); tipEl.style.display = 'block';
    tipEl.style.left = Math.max(4, Math.min(e.clientX + 16, innerWidth - tipEl.offsetWidth - 8)) + 'px'; tipEl.style.top = Math.max(4, Math.min(e.clientY + 14, innerHeight - tipEl.offsetHeight - 8)) + 'px';
  });
  dropBtn.onclick = () => { if (held) dropSlot(held); else { hintEl.style.color = '#ff8a7a'; hintEl.textContent = 'Pick up an item first, then press Drop (or right-click it)'; setTimeout(() => { hintEl.style.color = '#8d8880'; hintEl.textContent = 'Right-click an item to drop it  ·  Tab / I / E to close'; }, 2200); } };
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
  if (!lobbyEl) { lobbyEl = document.createElement('div'); lobbyEl.className = 'gkLobby'; lobbyEl.style.cssText = 'font-size:clamp(11px,1.3vw,14px);color:#9aa0ad;margin-top:2px'; hud.appendChild(lobbyEl); }
  const lo = m.minWins | 0, hi = m.maxWins | 0, v = n => n + (n === 1 ? ' victory' : ' victories');
  lobbyEl.textContent = (lo === hi ? v(lo) : lo + '-' + hi + ' victories');
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
  if (e.code === 'KeyE' && invOpen && !e.repeat) { closeInv(); return; }   // FULLSCREEN-2: E closes the bag too, so Esc is never needed
  if (e.code === 'Escape' && invOpen) { if (held) { held = null; paintAll(); } else closeInv(); return; }
  if (e.repeat) return;
  if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
    if (window.GKLOOT && GKLOOT.key(+e.code.slice(5) - 1)) return;   // LOOT: a plushie in that quick slot is thrown
    if (window.GKUSE && GKUSE.key(+e.code.slice(5) - 1)) return;   // UTILITY: a utility item in that quick slot is used
    ensureHotbar(); const i = +e.code.slice(5) - 1, k = invGet(myInv, 'q' + i);
    if (i === qSel && k != null && infoOf(k) && infoOf(k).family === 'brain') eatSlot('q' + i); else setSel(i);   // pressing the selected slot's key eats a brain
    return;
  }
  if (e.code === 'KeyE' && !invOpen) { if (GK.locked) return;   // one interact key: control panel, then merchant / station, then a loot pile underfoot
    if (cpInteract() || (window.GKACT5 && GKACT5.key(e)) || stationInteract()) return;   // ACT5UI: an anchor of a tree room / vaultbreaker / the vault comes after the door panel
    if (nearestPile()) openStation('loot', nearestPile().id); else net.send({ claim: 1 });   // chest / mystery room contents
    return;
  }
  if (e.code === 'KeyB' && !invOpen && !e.repeat && window.GKRULES && !GK.locked && GKRULES.bribeKey()) return;   // RULES: bribe at a door panel
  if (window.GK_OFFLINE && e.code === 'KeyG' && netReal && netReal.demoGive) netReal.demoGive();
  if (window.GK_OFFLINE && e.code === 'KeyL' && actors.get(me)) showVictory({ items: invAll(myInv), gold: myGold, parts: myParts });   // demo only: L = win
});
addEventListener('wheel', e => { if (GK.mode === 'play' && !invOpen && !shopOpen) { ensureHotbar(); setSel(qSel +(e.deltaY > 0 ? 1 : -1)); } }, { passive: true });

// ---------- victory screen: the run is won, the character and everything it carried are kept ----------
// WINSTAGE (menu2): on victory the goblin that won turns on a gold-lit floor behind the card. Own scene and lights, so the game scene (9 PointLight + 1 Hemisphere) is untouched; frame() renders this instead of the world while it is on.
const WINSTAGE = { on: false, sc: null, cam: null, g: null, pts: null, key: null, W: 0, H: 0 };
function winStageStart(type) {
  try {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0x07060a); sc.fog = new THREE.FogExp2(0x07060a, 0.045);
    if (scene.environment) { sc.environment = scene.environment; if ('environmentIntensity' in sc) sc.environmentIntensity = 0.4; }
    sc.add(new THREE.AmbientLight(0x4a3c2a, 1.3));
    const key = new THREE.SpotLight(0xffe2a8, 130, 30, 0.5, 0.6, 1.4); key.position.set(0, 9, 4.5); key.target.position.set(0, 1.2, 0); sc.add(key, key.target);
    const rimA = new THREE.PointLight(0xff9a30, 50, 22, 1.6); rimA.position.set(-4, 2.6, -3); sc.add(rimA);
    const rimB = new THREE.PointLight(0x38d6b4, 36, 22, 1.6); rimB.position.set(4.2, 2.2, -2.4); sc.add(rimB);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x0c0a0c, metalness: 0.65, roughness: 0.3, envMapIntensity: 0.6 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
    for (const [r0, r1, o] of [[2.1, 2.16, 0.9], [3.3, 3.34, 0.5], [4.6, 4.63, 0.3]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), new THREE.MeshBasicMaterial({ color: 0xf5c451, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; sc.add(ring); }
    const g = buildGoblin(type, true); g.traverse(o => { if (o.isSprite) o.visible = false; }); g.scale.multiplyScalar(1.4); sc.add(g);
    const NP = 200, pos = new Float32Array(NP * 3), seed = new Float32Array(NP);
    for (let i = 0; i < NP; i++) { const a = Math.random() * 6.283, r = 0.8 + Math.random() * 7; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 8; pos[i * 3 + 2] = Math.sin(a) * r - 1; seed[i] = Math.random() * 6; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: glowTex, color: 0xffd36a, size: 0.22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85, fog: false })); pts.frustumCulled = false; sc.add(pts);
    const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 60); cam.position.set(0, 1.9, 6.4); cam.lookAt(0, 1.25, 0);
    Object.assign(WINSTAGE, { on: true, sc, cam, g, pts, seed, key, W: 0, H: 0 });
  } catch (e) { WINSTAGE.on = false; console.warn('win stage skipped', e); }
}
function winStageRender(now, dt) {
  const S = WINSTAGE, W = innerWidth, H = innerHeight;
  if (W !== S.W || H !== S.H) { S.W = W; S.H = H; S.cam.aspect = W / H; if (W / H > 1.25) S.cam.setViewOffset(W, H, -W * 0.2, 0, W, H); else S.cam.clearViewOffset(); S.cam.updateProjectionMatrix(); renderer.setSize(W, H); }
  const t = now / 1000; S.g.rotation.y += dt * 0.7; S.g.position.y = Math.sin(t * 1.4) * 0.04; S.key.intensity = 125 + Math.sin(t * 1.7) * 8;
  const p = S.pts.geometry.attributes.position.array; for (let i = 0; i < p.length / 3; i++) { p[i * 3 + 1] -= dt * (0.25 + (i % 5) * 0.08); p[i * 3] += Math.sin(t * 0.8 + S.seed[i]) * dt * 0.2; if (p[i * 3 + 1] < 0) p[i * 3 + 1] = 8; } S.pts.geometry.attributes.position.needsUpdate = true;
  renderer.setRenderTarget(null); renderer.render(S.sc, S.cam);
}
let winEl = null, winDone = false;
function showVictory(info) {
  if (GK.mode !== 'play' || winDone) return;
  winDone = true;
  { const old = document.getElementById('gkEnd'); if (old) old.remove(); }   // a match-over card that arrived first would sit on top of the victory card
  const mine = actors.get(me), type = mine ? mine.goblin : 0;
  const ms = performance.now() - run.t0, secs = Math.floor(ms / 1000), n = GK.roundInfo ? GK.roundInfo().n : 0;
  const items = ((info && info.items) || []).filter(k => k != null);
  const from = GK.charId;
  let c = null; try { c = window.GKSAVE.recordWin({ charId: from, goblin: type, items, parts: (info && info.parts) || {}, token: info && info.ctoken, name: GK.fun && GK.fun.myName && GK.fun.myName() }); if (c && c.id != null) GK.charId = c.id; } catch (e) { c = null; }
  const wins = c && c.wins != null ? c.wins : (GK.wins | 0) + 1;
  closeInv(true); closeShop(true); GK.mode = 'win'; inside = false; { const sd = document.getElementById('gkSudTag'); if (sd) sd.remove(); } keys.clear(); hideHotbar(); GK.social.clear();   // SOCIAL: match won, nothing to resume
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
  for (const id of ['hint', 'dot', 'rr', 'roundHud', 'hud', 'gkLeft']) { const el = $(id); if (el) el.style.display = 'none'; }
  if (statsEl) statsEl.style.display = 'none';
  const esc = s => String(s).replace(/</g, '&lt;');
  const pm = (info && info.parts) || {}, partsStr = Object.keys(pm).filter(p => pm[p] > 0).map(p => pm[p] + ' ' + partName(p)).join(', ');
  const rows = [['Goblin', NAMES[type]], ['Survived', Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')], ['Round reached', n || 1], ['Distance travelled', Math.round(run.dist) + ' m'], ...(info && info.gold != null ? [['Gold left', info.gold]] : []), ['Victories', wins]];
  const whero = [[rsTime(secs), 'Survived'], [n || 1, 'Round'], [wins, wins === 1 ? 'Victory' : 'Victories']];
  const wsub = c ? '<b>' + esc(c.name) + '</b> now has <b>' + wins + '</b> victor' + (wins === 1 ? 'y' : 'ies') : 'Your run is won';
  winEl = rsShow('win', rsCard({ big: 'Victory', sub: wsub, hero: whero, rows: rows.filter(r => !['Survived', 'Round reached', 'Victories'].includes(r[0])),
    mid: '<div class="rs-h">Items you keep</div><div id="winItems" class="rs-items"></div>' + (partsStr ? '<div class="rs-note">Materials kept: ' + esc(partsStr) + '</div>' : ''),
    note: c ? 'Saved to your stash, along with ' + esc(c.name) : 'Saved to your stash', btns: [['winQueue', 'Queue again', true], ['winMenu', 'Main menu']] }));
  winStageStart(type);
  const box = $('winItems');
  if (!items.length) box.innerHTML = '<span style="color:var(--mut)">nothing</span>';
  for (const k of items) {
    const d = document.createElement('div'); d.className = 'rs-item';
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
    + '<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><div id="shopMsg" style="flex:1;font-size:13px;color:#ff8a7a;opacity:0;transition:opacity .25s"></div><button id="shopClose" style="cursor:pointer;border:0;border-radius:8px;padding:9px 18px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 13px system-ui,sans-serif;letter-spacing:.1em">CLOSE (E)</button></div></div>';
  document.body.appendChild(shopEl); shopMsg = shopEl.querySelector('#shopMsg');
  shopEl.querySelector('#shopClose').onclick = () => closeShop();
  shopEl.addEventListener('click', e => { if (e.target === shopEl) closeShop(); });
}
function paintShop() {
  if (!shopEl) return;
  shopEl.querySelector('#shopTitle').textContent = merchantName(shopRoom).toUpperCase();
  shopEl.querySelector('#shopGold').innerHTML = 'Your gold ' + coin + ' ' + myGold; window.GKLOOT && GKLOOT.shopNote(shopEl);   // LOOT
  const rows = shopEl.querySelector('#shopRows'); rows.textContent = '';
  const list = shops[shopRoom] || [], full = myInv.backpack.indexOf(null) < 0;
  if (!list.length) { rows.innerHTML = '<div style="text-align:center;color:#8d8880;padding:20px">The merchant has nothing to sell.</div>'; return; }
  list.forEach((it, idx) => {
    const d = infoOf(it.key) || { name: String(it.key), type: 'weapon', attack: 0 };
    const row = document.createElement('div'); row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,215,94,.2)' + (it.sold ? ';opacity:.45' : '');
    const ic = document.createElement('div'); ic.style.cssText = 'width:48px;height:48px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(0,0,0,.4);flex:none'; ic.appendChild(mkIcon(it.key, 40));
    const tx = document.createElement('div'); tx.style.cssText = 'flex:1;min-width:0';
    tx.innerHTML = '<div style="font-weight:700;font-size:15px;color:' + (TIER_COL[d.tier] || '#f2efe6') + '">' + d.name + '</div><div style="font-size:12px;color:#b9b4a6">' + statTxt(it.key) + '</div>' + (cmpTxt(it.key) ? '<div style="font-size:12px">' + cmpTxt(it.key) + '</div>' : '');
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
  if (panelKind === 'home' && window.GKHOMEW) GKHOMEW.shut();   // ELIXIR
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
  hoverTip.innerHTML = 'Press <b style="padding:1px 6px;border-radius:4px;background:#ffd75e;color:#1a1405">E</b> to ' + (hoverKind === 'r' ? 'recycle' : hoverKind === 'w' ? 'craft' : hoverKind === 'k' ? 'study' : 'trade'); hoverTip.style.display = /* FEEL: shown by feel.js */ false ? 'block' : 'none';
}
function merchantHoverTick() {
  const T = PERF2_ON ? perf2HoverTargets() : [...(GK.merchantTargets || []), ...(GK.stationTargets || []).filter(o => o && o.userData && (o.userData.station === 'recycler' || o.userData.station === 'workbench' || o.userData.station === 'knowledge' || o.userData.station === 'screen' || o.userData.station === 'pump' || o.userData.station === 'box'))];   // PERF2: list cached (was rebuilt with a spread and a closure every frame)
  lootPromptTick();
  if (GK.mode !== 'play' || invOpen || shopOpen || !inside || !spawned || !T.length) { if (hoverRoom >= 0) setHover(-1); return; }
  if (PERF2_ON && !perf2HoverNear(T)) { setHover(-1); return; }   // PERF2: nothing within 20 m, so the ray cannot reach (it is 7 m long): skip the raycast over every merchant, recycler and workbench model
  cam.updateMatrixWorld(); ray.setFromCamera({ x: 0, y: 0 }, cam); ray.far = 7;
  const hit = ray.intersectObjects(T, true)[0]; let id = -1, kind = '';
  if (hit) { for (let o = hit.object; o; o = o.parent) { const u = o.userData; if (!u || u.roomId == null) continue; id = u.roomId; kind = u.station === 'recycler' ? 'r' : u.station === 'workbench' ? 'w' : u.station === 'knowledge' ? 'k' : u.station === 'screen' ? 's' : u.station === 'pump' ? 'p' : u.station === 'box' ? 'b' : 'm'; break; } }
  setHover(id, kind);
}
GK.hover = () => ({ room: hoverRoom, kind: hoverKind });
function stationInteract() {   // E while looking at a merchant, recycler or workbench opens it; true if it did
  if (hoverRoom < 0 || invOpen || shopOpen || GK.mode !== 'play') return false;
  if ((hoverKind === 's' || hoverKind === 'p' || hoverKind === 'b') && window.GKHOMEW) return GKHOMEW.interact(hoverKind, hoverRoom);   // ELIXIR: Elixir Screen, pump, lockbox
  if (hoverKind === 'r') openStation('recycle', hoverRoom); else if (hoverKind === 'w' || hoverKind === 'k') openStation('craft', hoverRoom);   // KNOWLEDGE: the tree and the bench open the same screen else openShop(hoverRoom);
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
    + '<div style="display:flex;align-items:center;gap:12px;margin-top:12px"><div class="msg" style="flex:1;font-size:13px;color:#ff8a7a;min-height:1.3em"></div><button class="close" style="cursor:pointer;border:0;border-radius:8px;padding:9px 18px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 13px system-ui,sans-serif;letter-spacing:.1em">CLOSE (E)</button></div></div>';
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
function stationFail(kind, why) {   // (STATIONS: 'bench' = tier too high for this bench, 'busy' = a craft is running)
  const pn = kind === 'recycle' ? recPn : craftPn;
  say(pn, { room: 'You are too far from the ' + (kind === 'recycle' ? 'recycler' : 'workbench'), item: 'That cannot be recycled', recipe: 'Unknown recipe', knowledge: 'Not enough knowledge', bench: 'This bench is too basic for that recipe', busy: 'Already crafting', parts: 'Not enough materials', space: 'Your backpack is full', owner: 'Only the home owner can use this', elixir: 'Not enough elixir' }[why] || 'Cannot do that');
  flashBad(...(why === 'item' && recSel ? [recSel] : []));
}
// ---- STATIONS-UI-BEGIN (task E): which station type am I at (server.js stationAt: homes normal bench + 50% recycler, Forge master bench, Grand Recycler 100%, merchants and mystery stations normal bench + 100% recycler)
const STNUI = {
  room: () => CHEST_ROOMS[shopRoom] || {},
  benchType() { return this.room().type === 'forge' ? 'master' : 'normal'; },
  recType() { return this.room().type === 'home' ? 'home' : 'full'; },
  benchName() { const t = this.room().type; return t === 'forge' ? 'MASTER FORGE' : t === 'home' ? 'HOME WORKBENCH' : 'WORKBENCH'; },
  recName() { const t = this.room().type; return t === 'grand' ? 'GRAND RECYCLER' : t === 'home' ? 'HOME RECYCLER' : 'RECYCLER'; },
  eff() { if (this.recType() === 'home' && window.GKHOMEW) return GKHOMEW.recEff(); const G = itemsData(); return ((G.STATIONS && G.STATIONS.recycler[this.recType()]) || { eff: 1 }).eff; },
  yield(y) { const G = itemsData(); return y && G.recycleEff ? G.recycleEff(y, this.eff()) : y; },
  benchInfo() {   // what this bench can craft: tiers, discount, speed, bonus tier
    const G = itemsData(), sp = G.benchSpec ? G.benchSpec(this.benchType()) : { maxTier: 5, costMul: 1, craftMs: 2500 }, R = ['0', 'I', 'II', 'III', 'IV', 'V'];
    return 'Crafts tiers 0-' + R[Math.min(5, sp.maxTier)] + ' - parts ' + (sp.costMul < 1 ? Math.round((1 - sp.costMul) * 100) + '% cheaper' : 'full price') + ' - ' + (sp.craftMs / 1000).toFixed(1) + ' s per craft' + (sp.bonusTier ? ' - one tier above your knowledge, at full price' : '');
  },
};
// STATIONS-UI-END
// ---- recycler ----
function buildRec() {
  recPn = mkPanel('gkRec', 'RECYCLER', 640); recPn.sub.textContent = '';
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
    if (!KNOWUI.recYield(k)) { flashBad(id); say(recPn, 'Weapons, armour and utility items can be recycled'); return; }
    recSel = id; paintRec();
  });
}
function paintRec() {
  if (!recPn) return;
  for (const id of ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'q0', 'q1', 'q2']) for (const el of slotEls[id]) if (el.dataset.rec) {
    const k = invGet(myInv, id), ok = k != null && !!KNOWUI.recYield(k);
    paintSlot(el, id); el.style.opacity = k == null || ok ? 1 : 0.3; el.style.outline = recSel === id ? '2px solid ' + GOLD : 'none'; el.title = k != null && !ok ? 'cannot recycle' : '';
  }
  if (recSel && invGet(myInv, recSel) == null) recSel = null;
  recPn.ttl.textContent = STNUI.recName(); recPn.sub.textContent = STNUI.eff() >= 1 ? 'RETURNS EVERY PART OF A WEAPON, ARMOUR OR UTILITY ITEM - 100%' : 'RETURNS ' + Math.round(STNUI.eff() * 100) + '% OF THE PARTS (AT LEAST 1) - THE GRAND RECYCLER GIVES 100%';
  const k = recSel ? invGet(myInv, recSel) : null, pv = recPn.prev; pv.textContent = '';
  let y = STNUI.yield(k && KNOWUI.recYield(k));   // 5x5: the home recycler gives 50% (server stationAt)
  if (!k) { pv.innerHTML = '<div style="color:#8d8880;font-size:14px;line-height:1.5">Select a weapon or armour from your backpack or quick slots<br>to see which materials it yields.<br><span style="font-size:12px">(brains and worn gear cannot be recycled)</span></div>'; return; }
  const it = infoOf(k), head = document.createElement('div'); head.style.cssText = 'display:flex;align-items:center;gap:10px'; head.appendChild(mkIcon(k, 46));
  const t = document.createElement('div'); t.style.textAlign = 'left'; t.innerHTML = '<b style="color:' + (TIER_COL[it.tier] || '#fff') + ';font-size:16px">' + it.name + '</b><div style="font-size:12px;color:#aaa59d">' + statTxt(k) + '</div>'; head.appendChild(t);
  const get = document.createElement('div'); get.className = 'yield'; get.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;justify-content:center;min-height:34px';
  for (const p in y) { const c = document.createElement('div'); c.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 9px 3px 4px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,215,94,.3);font-weight:800'; c.dataset.part = p; c.appendChild(partIcon(p, 26)); c.append('+' + y[p] + ' ' + partName(p)); get.appendChild(c); }
  const bt = document.createElement('button'); bt.textContent = 'RECYCLE'; bt.id = 'recGo'; bt.style.cssText = 'width:100%;padding:14px 10px;border:0;border-radius:10px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:800 18px system-ui,sans-serif;letter-spacing:.12em;cursor:pointer';
  bt.onclick = () => { net.send({ recycle: recSel }); };
  pv.append(head, Object.assign(document.createElement('div'), { className: 'lab', textContent: 'YOU GET' }), get, bt);
  if (window.GKHOMEW && GKHOMEW.canRefine(shopRoom)) { const rf = document.createElement('button'); rf.textContent = 'REFINE: 100% FOR 4 ELIXIR'; rf.id = 'recRefine'; rf.style.cssText = 'width:100%;padding:9px 10px;border:1px solid #7fd8ff;border-radius:10px;background:rgba(127,216,255,.12);color:#bdeaff;font:800 14px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer'; rf.onclick = () => { net.send({ recycle: recSel, refine: 1 }); }; pv.append(rf); }   // ELIXIR
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
// ---- workbench + knowledge tree (KNOWLEDGE-BEGIN, docs/KNOWLEDGE.md): one screen, opened with E at a workbench or at a knowledge tree. Left: the perk tree. Right: recipes by tier (and Reforge). ----
function buildCraft() { KNOWUI.build(); if (window.GKHOMEW) GKHOMEW.decorateCraft(craftPn); }   // ELIXIR: brew row
function myKnowledge() { const mine = actors.get(me); return invStats(myInv, mine ? mine.goblin : 0, knowOv).knowledge; }
function paintCraft() { if (craftPn) { KNOWUI.paint(); if (window.GKHOMEW) GKHOMEW.paintBrew(); } }
const KNOWUI = (() => {
  const U = {}, ROM = ['0', 'I', 'II', 'III', 'IV', 'V'], BR_COL = { craft: '#ffb84a', lore: '#7fd0ff', guts: '#ff8a7a' };
  let perks = [], relic = null, chestKeys = null, lastJ = '', lastRoom = null, hcAt = 0, crafting = null;   // STATIONS: crafting = { rid, key, at, ms } while a craft runs
  const D = () => itemsData(), esc = s => String(s).replace(/</g, '&lt;');
  const brains = () => { const a = actors.get(me); return a ? a.brains | 0 : 0; };
  const div = css => { const e = document.createElement('div'); e.style.cssText = css; return e; };
  U.perks = () => perks.slice(); U.has = id => perks.includes(id);
  U.points = () => D().knowPoints ? D().knowPoints(myKnowledge(), brains(), perks) : 0;
  U.recYield = k => { const G = D(); return G.recycleFor ? G.recycleFor(k, perks) : G.recycleYield ? G.recycleYield(k) : null; };
  U.cost = r => D().recipeCost ? D().recipeCost(r, perks) : r.cost;
  U.statNote = () => { const n = U.points(); return n ? n + ' point' + (n > 1 ? 's' : '') + ' to spend' : 'innate + brains'; };
  const learnWhy = { room: 'Learn at a workbench or a knowledge tree', points: 'Not enough knowledge points', order: 'Learn the perk above it first', have: 'You know that already', perk: 'Unknown perk' };
  const forgeWhy = { room: 'Reforge at a workbench or a knowledge tree', perk: 'Learn Reforge first', item: 'That cannot be reforged', parts: 'Not enough materials' };
  U.onMsg = d => {
    if (d.matchStart) { perks = []; relic = null; crafting = null; }
    if (d.crafting) { const r = (D().RECIPES || []).find(x => x.id === d.crafting.rid); crafting = { rid: d.crafting.rid, key: r ? r.out : null, at: performance.now(), ms: d.crafting.ms }; if (panelKind === 'craft') paintCraft(); barLoop(); }   // STATIONS: the server started a timed craft
    if (d.crafted) { crafting = null; if (panelKind === 'craft') paintCraft(); else toastMsg('Crafted ' + itemName(d.crafted.key), true); }
    if (d.craftCancel) {
      const was = crafting; crafting = null; if (panelKind === 'craft') paintCraft();
      const why = { left: 'You left the bench', hit: 'You were hit', dead: 'You died', space: 'Your backpack is full' }[d.craftCancel];
      if (was && why) { if (craftPn && panelKind === 'craft') say(craftPn, 'Crafting cancelled: ' + why + ' - parts refunded'); else toastMsg('Crafting cancelled: ' + why.toLowerCase() + ', parts refunded', false); }
    }   // a new match: nothing learned yet (death loses everything)
    if (d.chestKeys) chestKeys = d.chestKeys;
    if (d.relic !== undefined) relic = d.relic;
    if (Array.isArray(d.perks)) {
      perks = d.perks.filter(x => typeof x === 'string'); lastJ = ''; lastRoom = null;
      if (GK.redrawMaps) GK.redrawMaps(); if (panelKind === 'craft') paintCraft(); const mine = actors.get(me); if (mine) showStats(null, mine.goblin);
    }
    if (d.learned) learnedFx(d.learned);
    if (d.learnFail && craftPn) say(craftPn, learnWhy[d.learnFail] || 'Cannot learn that');
    if (d.reforged) { if (craftPn) say(craftPn, 'Reforged into ' + itemName(d.reforged.key), true); if (panelKind === 'craft') paintCraft(); try { GK.workbenchFeedback && GK.workbenchFeedback(shopRoom); } catch (e) {} }
    if (d.reforgeFail && craftPn) say(craftPn, forgeWhy[d.reforgeFail] || 'Cannot reforge that');
    if (d.secondWind) toastMsg('Second Wind! You cling on at 1 HP', true, 2600);
    if (d.ate && d.ate.heal) toastMsg('The brain heals you +' + d.ate.heal + ' HP', true);
    if (d.ate && panelKind === 'craft') paintCraft();
  };
  function learnedFx(id) {
    const pk = D().PERK && D().PERK[id]; if (!craftPn || !pk) return;
    say(craftPn, 'Learned ' + pk.name, true);
    const n = craftPn.tree && craftPn.tree.querySelector('[data-perk="' + id + '"]'); if (n) n.animate([{ boxShadow: '0 0 0 0 rgba(255,215,94,.9)', transform: 'scale(1.05)' }, { boxShadow: '0 0 24px 4px rgba(255,215,94,0)', transform: 'none' }], 700);
    try { GK.workbenchFeedback && GK.workbenchFeedback(shopRoom); } catch (e) {}
  }
  U.build = () => {
    craftPn = mkPanel('gkCraft', 'WORKBENCH', 980); craftPn.sub.textContent = 'KNOWLEDGE TREE AND CRAFTING - FREE FOR EVERYONE';
    craftPn.head = div('display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:0 0 12px');
    const main = div('display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start');
    craftPn.tree = div('flex:1 1 360px;min-width:min(300px,100%)');
    const right = div('flex:1 1 400px;min-width:min(300px,100%)'); right.innerHTML = '<div class="lab">RECIPES</div>';
    craftPn.list = div('display:flex;flex-direction:column;gap:6px;max-height:min(54vh,540px);overflow:auto;padding-right:4px'); right.appendChild(craftPn.list);
    main.append(craftPn.tree, right);
    const mats = div('margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)'); mats.innerHTML = '<div class="lab">YOUR MATERIALS</div>'; mats.appendChild(mkPartsRow());
    craftPn.body.append(craftPn.head, main, mats);
    craftPn.tree.addEventListener('click', e => {
      const n = e.target.closest && e.target.closest('[data-perk]'); if (!n) return;
      const why = D().learnFail(n.dataset.perk, myKnowledge(), brains(), perks);
      if (why) { say(craftPn, learnWhy[why] || 'Cannot learn that'); n.animate([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], 220); } else net.send({ learn: n.dataset.perk });
    });
  };
  const stat = (lab, val, col) => '<div style="display:flex;flex-direction:column;align-items:center;min-width:92px;padding:4px 12px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08)"><span style="font:700 10px system-ui;letter-spacing:.16em;color:#b9b4ae">' + lab + '</span><span style="font:800 20px system-ui;color:' + col + ';font-variant-numeric:tabular-nums">' + val + '</span></div>';
  function paintTree() {
    const G = D(), know = myKnowledge(), pts = U.points(), tier = G.knowTier ? G.knowTier(know) : 0;
    craftPn.head.innerHTML = stat('KNOWLEDGE', fmtN(know), '#8ff0e0') + stat('RECIPE TIER', ROM[tier], '#ffd75e') + stat('POINTS', pts, pts ? '#8be28b' : '#8d8880')
      + '<div style="font-size:12px;color:#9a958c;max-width:250px;line-height:1.4">1 point per ' + ((G.KNOW && G.KNOW.step) || 20) + ' knowledge and 1 per brain you eat. Perks last until you die.</div>';
    const T = craftPn.tree; T.innerHTML = '<div class="lab">KNOWLEDGE TREE</div>';
    const grid = div('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px'); T.appendChild(grid);
    for (const b of G.BRANCHES || []) {
      const col = div('display:flex;flex-direction:column;align-items:stretch'), c = BR_COL[b.id] || '#ffd75e';
      col.innerHTML = '<div style="text-align:center;font:800 12px system-ui;letter-spacing:.18em;color:' + c + ';margin-bottom:6px">' + b.name.toUpperCase() + '</div>';
      const list = (G.PERKS || []).filter(p => p.branch === b.id).sort((x, y) => x.rank - y.rank);
      list.forEach((pk, i) => {
        if (i) { const ln = div('width:2px;height:10px;margin:0 auto;background:' + (U.has(list[i - 1].id) ? c : 'rgba(255,255,255,.15)')); col.appendChild(ln); }
        const have = U.has(pk.id), why = have ? 'have' : G.learnFail(pk.id, know, brains(), perks), can = !why;
        const n = div('padding:8px 9px;border-radius:10px;box-sizing:border-box;min-height:104px;display:flex;flex-direction:column;gap:3px;cursor:' + (can ? 'pointer' : 'default') + ';'
          + (have ? 'background:linear-gradient(180deg,' + c + '33,rgba(0,0,0,.4));border:1px solid ' + c : can ? 'background:rgba(0,0,0,.35);border:1px dashed ' + c : 'background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);opacity:.62'));
        n.dataset.perk = pk.id; n.title = pk.desc;
        n.innerHTML = '<div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline"><b style="font-size:13px;color:' + (have ? '#fff4d6' : '#f2efe6') + '">' + esc(pk.name) + '</b><span style="font:800 11px system-ui;color:' + c + ';white-space:nowrap">' + pk.cost + ' PT</span></div>'
          + '<div style="font-size:11.5px;line-height:1.3;color:#b9b4a6;flex:1">' + esc(pk.desc) + '</div>'
          + '<div style="font:800 10px system-ui;letter-spacing:.12em;color:' + (have ? c : can ? '#8be28b' : '#8d8880') + '">' + (have ? 'LEARNED' : can ? 'CLICK TO LEARN' : why === 'order' ? 'LEARN THE ONE ABOVE' : 'NEEDS ' + pk.cost + ' POINT' + (pk.cost > 1 ? 'S' : '')) + '</div>';
        col.appendChild(n);
      });
      grid.appendChild(col);
    }
  }
  const costChips = (cost, base) => { const w = div('display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;max-width:190px'); for (const p in cost) { const ok = (myParts[p] | 0) >= cost[p], c = div('display:flex;align-items:center;gap:2px;font:800 13px system-ui,sans-serif;color:' + (ok ? '#8be28b' : '#ff6a5a')); c.title = partName(p) + (base && base[p] > cost[p] ? ' (Thrifty Hands: ' + base[p] + ' -> ' + cost[p] + ')' : ''); c.appendChild(partIcon(p, 20)); c.append(' ' + (myParts[p] | 0) + '/' + cost[p]); w.appendChild(c); } return w; };
  const btn = (txt, can) => { const b = document.createElement('button'); b.textContent = txt; b.disabled = !can; b.style.cssText = 'width:84px;flex:none;padding:8px 0;border-radius:8px;font:800 12px system-ui,sans-serif;letter-spacing:.1em;cursor:' + (can ? 'pointer' : 'not-allowed') + ';' + (can ? 'border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405' : 'border:1px solid rgba(255,90,74,.6);background:rgba(120,20,14,.35);color:#ff8a7a'); return b; };
  const row = (key, line, cost, base, label, can, reason, onGo, dim) => {
    const it = infoOf(key) || { name: key }, r = div('display:flex;align-items:center;gap:10px;padding:5px 8px;border-radius:10px;background:rgba(0,0,0,.35);border:1px solid rgba(255,215,94,.18)' + (dim ? ';opacity:.5' : ''));
    const ic = div('width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(0,0,0,.4);flex:none'); ic.appendChild(mkIcon(key, 36));
    const tx = div('flex:1;min-width:0'); tx.innerHTML = '<div style="font-weight:700;font-size:14px;color:' + (TIER_COL[it.tier] || '#f2efe6') + '">' + esc(it.name) + '</div><div style="font-size:12px;color:#aaa59d">' + line + '</div>';
    const b = btn(label, can); b.title = reason; b.onclick = () => { if (can) onGo(); else say(craftPn, reason); };
    r.append(ic, tx, costChips(cost, base), b); return r;
  };
  const head = (txt, col, note) => { const h = div('display:flex;justify-content:space-between;align-items:baseline;margin:8px 2px 0;font:800 11px system-ui;letter-spacing:.16em;color:' + col); h.innerHTML = '<span>' + txt + '</span><span style="letter-spacing:.04em;font-weight:600;color:#8d8880">' + (note || '') + '</span>'; return h; };
  function paintRecipes() {
    const G = D(), list = craftPn.list, full = myInv.backpack.indexOf(null) < 0, know = myKnowledge(); list.textContent = '';
    if (U.has('reforge') && G.reforgeCost) {   // Reforge: every carried weapon and armour that is not reforged yet
      const ids = ['weapon', 'armor', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'q0', 'q1', 'q2'].filter(id => { const k = invGet(myInv, id); return k && G.reforgeCost(k); });
      list.appendChild(head('REFORGE', '#ffb84a', ids.length ? '+20%, once per item' : 'no gear to reforge'));
      for (const id of ids) {
        const k = invGet(myInv, id), cost = G.reforgeCost(k), a = infoOf(k), b = infoOf(k + '+'), s = a.type === 'weapon' ? 'attack' : 'health', lacking = Object.keys(cost).filter(p => (myParts[p] | 0) < cost[p]);
        const reason = lacking.length ? 'Not enough ' + lacking.map(partName).join(', ') : '';
        list.appendChild(row(k, (s === 'attack' ? 'Attack ' : 'Health ') + a[s] + ' &rarr; <b style="color:#8be28b">' + b[s] + '</b>' + (id === 'weapon' || id === 'armor' ? ' · equipped' : ''), cost, null, 'REFORGE', !reason, reason, () => net.send({ reforge: id })));
      }
    }
    if (crafting) {   // STATIONS: a craft is running - progress bar and cancel
      const pb = div('display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:rgba(255,215,94,.1);border:1px solid rgba(255,215,94,.5);margin-bottom:4px');
      if (crafting.key) { const ic = div('width:36px;height:36px;flex:none'); ic.appendChild(mkIcon(crafting.key, 34)); pb.appendChild(ic); }
      const mid = div('flex:1;min-width:0'), track = div('height:10px;border-radius:5px;background:rgba(0,0,0,.55);overflow:hidden;margin-top:4px'); craftPn.bar = div('height:100%;width:0;background:linear-gradient(90deg,#e0a82a,#ffd75e)'); track.appendChild(craftPn.bar);
      mid.innerHTML = '<div style="font:800 12px system-ui;letter-spacing:.14em;color:#ffd75e">CRAFTING ' + esc(crafting.key ? infoOf(crafting.key).name.toUpperCase() : '') + '</div>'; mid.appendChild(track);
      const cb = btn('CANCEL', true); cb.onclick = () => net.send({ craftCancel: 1 }); cb.title = 'Cancel and get your parts back'; pb.append(mid, cb); list.appendChild(pb);
    } else craftPn.bar = null;
    const recipes = (G.RECIPES || []).slice().sort((x, y) => x.tier - y.tier); let tier = -1, bt = STNUI.benchType();
    for (const r of recipes) {
      const bc = G.benchCraft ? G.benchCraft({ stats: { knowledge: know } }, r, bt, perks) : { cost: U.cost(r), ms: 2500 }, locked = bc.why === 'knowledge', low = bc.why === 'bench', cost = bc.cost || U.cost(r);
      if (r.tier !== tier) { tier = r.tier; list.appendChild(head(tier ? 'TIER ' + ROM[tier] + ' · ' + r.needs + ' KNOWLEDGE' : 'TIER 0 · BASICS', locked || low ? '#8d8880' : '#8ff0e0', locked ? '&#128274; you have ' + fmtN(know) : low ? 'needs the Master Forge' : bc.bonus ? 'bonus tier' : tier ? 'unlocked' : 'for everyone')); }
      const lacking = Object.keys(cost).filter(p => (myParts[p] | 0) < cost[p]);
      const reason = locked ? 'Needs ' + r.needs + ' knowledge' : low ? 'This bench is too basic: tier ' + ROM[r.tier] + ' needs the Master Forge' : crafting ? 'Already crafting' : lacking.length ? 'Not enough ' + lacking.map(partName).join(', ') : full ? 'Your backpack is full' : '';
      const el = row(r.out, statTxt(r.out) + (bc.ms ? ' · ' + (bc.ms / 1000).toFixed(1) + ' s' : '') + (bc.bonus ? ' · <b style="color:#ffd75e">BONUS TIER</b>' : ''), cost, r.cost, locked ? 'LOCKED' : low ? 'FORGE' : 'CRAFT', !reason, reason, () => net.send({ craft: r.id }), locked || low); el.dataset.recipe = r.id; list.appendChild(el);
    }
    if (!recipes.length) list.innerHTML = '<div style="text-align:center;color:#8d8880;padding:20px">No recipes known.</div>';
  }
  U.paint = () => { const top = craftPn.list.scrollTop; craftPn.ttl.textContent = STNUI.benchName(); craftPn.sub.textContent = STNUI.benchInfo().toUpperCase(); paintTree(); paintRecipes(); craftPn.list.scrollTop = top; };
  U.crafting = () => crafting;
  function barLoop() {   // the progress bar of a running craft: one style write per frame, only while a craft runs
    if (!crafting) return;
    if (panelKind === 'craft' && craftPn && craftPn.bar) { const f = crafting.ms > 0 ? Math.min(1, (performance.now() - crafting.at) / crafting.ms) : 1; craftPn.bar.style.width = (f * 100).toFixed(1) + '%'; }
    requestAnimationFrame(barLoop);
  }
  // ---- Lore perks on the facility maps: drawn by drawMap (MAP block) through GK.knowMap; live intel redraws only the map of the room I stand in
  const rectOf = k => { const r = WORLD.roomRect(k); return r ? [r.cx, r.cz, 2 * r.hw, 2 * r.hd] : null; };
  const pill = (g, x, y, l1, c1, l2) => {
    g.font = '800 17px system-ui, sans-serif'; const w = Math.max(g.measureText(l1).width, l2 ? (g.font = '600 13px system-ui, sans-serif', g.measureText(l2).width) : 0) + 14, h = l2 ? 38 : 22;
    g.fillStyle = 'rgba(4,8,14,.82)'; rr(g, x - w / 2, y - h / 2, w, h, 6); g.fill(); g.strokeStyle = c1; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = c1; g.font = '800 17px system-ui, sans-serif'; g.fillText(l1, x, y - (l2 ? 8 : 0)); if (l2) { g.fillStyle = '#c9d4e0'; g.font = '600 13px system-ui, sans-serif'; g.fillText(l2, x, y + 10); }
  };
  const roomLabel = c => {
    const it = k => infoOf(k);
    if (c.type === 'chest') { const i = chestKeys && it(chestKeys[c.id]); return i ? [i.tier.toUpperCase(), TIER_COL[i.tier] || '#fff', i.family] : null; }
    const m = c.type === 'mystery' && c.mystery; if (!m) return null;
    if (m.kind === 'weapon' || m.kind === 'armor') { const i = it(m.key); return i ? [i.tier.toUpperCase(), TIER_COL[i.tier] || '#fff', m.kind === 'armor' ? 'armour' : i.family] : null; }
    if (m.kind === 'enemy') return [String(m.enemy || 'enemy').toUpperCase(), '#ff7a6a', 'enemy goblin'];
    if (m.kind === 'stations') return ['STATIONS', '#6affd8', (m.stations || []).map(s => s === 'workbench' ? 'bench' : s === 'knowledge' ? 'tree' : s).join(' + ')];
    if (m.kind === 'gold') return [m.amount + ' GOLD', '#ffd24a', 'gold chest'];
    if (m.kind === 'plushie') return ['PLUSHIE', '#ff9fc4', 'a toy'];
    return null;
  };
  GK.knowMap = (g, mx, my) => {
    if (!perks.length) return;
    g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
    if (U.has('appraiser')) for (const c of CHEST_ROOMS) {   // Appraiser: what waits in every outer room
      if (c.type === 'merchant' || (GK.claimedRooms && GK.claimedRooms.has(c.id))) continue;
      const L = roomLabel(c); if (!L) continue; const s = mx(c.cx + (c.size || CS) / 2) - mx(c.cx - (c.size || CS) / 2);
      pill(g, mx(c.cx), my(c.cz) + s * 0.3, L[0], L[1], L[2]);
    }
    if (U.has('eavesdrop')) {   // Eavesdropper: this round's picks, orange, beside the blue "last picks"
      for (const k in RS.sel || {}) {
        const d = DINFO[RS.sel[k]], r = d && rectOf(k); if (!r) continue; const dir = d.a === k ? d.da : d.db;
        const ux = dir === 'EAST' ? 1 : dir === 'WEST' ? -1 : 0, uz = dir === 'SOUTH' ? 1 : dir === 'NORTH' ? -1 : 0, ex = mx(r[0] + ux * r[2] / 2) - ux * 34, ey = my(r[1] + uz * r[3] / 2) - uz * 34;
        g.save(); g.translate(ex, ey); g.rotate(Math.atan2(uz, ux)); g.fillStyle = '#ff9a1a'; g.strokeStyle = '#1a0c00'; g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(15, 0); g.lineTo(-10, -12); g.lineTo(-4, 0); g.lineTo(-10, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
      }
      g.textAlign = 'left'; g.fillStyle = '#ff9a1a'; g.font = '700 16px system-ui, sans-serif'; g.fillText('Orange arrows: picked this round', 722, 163); g.textAlign = 'center';
    }
    if (U.has('headcount')) {   // Head Count: goblins per room (me included), and the Vault relic
      const n = {}; for (const [id, a] of actors) { const k = id === me ? roomKeyAt(P.x, P.z) : roomKeyAt(a.x, a.z); if (k != null) n[k] = (n[k] || 0) + 1; }
      for (const k in n) { const r = rectOf(String(k)); if (!r) continue; const x = mx(r[0] - r[2] / 2) + 20, y = my(r[1] - r[3] / 2) + 20;
        g.fillStyle = '#d81818'; g.beginPath(); g.arc(x, y, 14, 0, 6.2832); g.fill(); g.strokeStyle = '#ffd0d0'; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff'; g.font = '800 17px system-ui, sans-serif'; g.fillText(String(n[k]), x, y + 1); }
      const ri = relic && infoOf(relic); if (ri) { const [cx, cz] = rc(4); pill(g, mx(cx), my(cz - roomD(4) / 2) + 22, 'RELIC: ' + ri.name, TIER_COL[ri.tier] || '#ffd24a'); }
    }
    g.restore();
  };
  setInterval(() => {   // live intel: only the map of the room I am in is redrawn (one canvas upload), when what it shows changed or every 2 s for Head Count
    if (GK.mode !== 'play' || !(U.has('eavesdrop') || U.has('headcount')) || !GK.redrawMap) return;
    const k = roomKeyAt(P.x, P.z), j = U.has('eavesdrop') ? JSON.stringify(RS.sel || {}) : '', t = performance.now();
    if (k === lastRoom && j === lastJ && !(U.has('headcount') && t - hcAt > 2000)) return;
    lastRoom = k; lastJ = j; hcAt = t; if (k != null && WORLD.roomRect(k) && k[0] !== 'c' && k !== VK) GK.redrawMap(k);
  }, 500);
  GK.know = U;   // test hook
  return U;
})();
// KNOWLEDGE-END
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
  if (lootPromptEl.style.display !== 'none') lootPromptEl.style.display = /* FEEL: shown by feel.js */ 'none';   // PERF2: no style write when nothing changes
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
function toastMsg(text, good, ms) {   // short message in the middle of the screen
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.style.cssText = 'position:fixed;left:50%;top:38%;transform:translateX(-50%);padding:8px 16px;border-radius:8px;background:rgba(10,10,14,.75);font:600 16px system-ui,sans-serif;pointer-events:none;transition:opacity .4s;z-index:50'; document.body.appendChild(toastEl); }
  toastEl.textContent = text; toastEl.style.color = good ? '#ffd76a' : '#ff8a7a'; toastEl.style.opacity = '1';
  clearTimeout(toastEl.t); toastEl.t = setTimeout(() => { toastEl.style.opacity = '0'; }, ms || 1800);
}
function lootFailFx(why) { if (panelKind === 'loot') say(lootPn, { range: 'Too far from the bag', space: 'Your backpack is full', item: 'Someone took that first' }[why] || 'Cannot loot that'); }
GK.openLoot = () => { const d = nearestPile(); if (d) openStation('loot', d.id); return !!d; };
// ---- eating ----
function eatSlot(id) {
  const k0 = invGet(myInv, id), i0 = k0 != null && infoOf(k0);   // ITEMS2: double-click uses a utility item, or wears a charm
  if (i0 && i0.use) { held = null; net.send({ use: id }); paintAll(); return true; }
  if (i0 && i0.type === 'charm' && id !== 'charm') { moveInv(id, 'charm'); return true; }
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
  JUMP.key(e);
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
  lockRefused = false;   // every click retries the lock: one refusal (e.g. the browser's short cooldown after Esc) must not leave the cursor free for the rest of the session
  const plain =() => { try { const r = canvas.requestPointerLock(); r && r.catch && r.catch(() => { lockRefused = true; }); } catch (e) { lockRefused = true; } };
  try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); if (r && r.catch) r.catch(plain); } catch (e) { plain(); }
};
document.addEventListener('pointerlockchange', () => { if (lockOk()) lockRefused = false; });
document.addEventListener('pointerlockerror', () => { lockRefused = true; });
canvas.addEventListener('mousedown', requestLock);
// FULLSCREEN-2: a key in play with no panel open takes the pointer lock back, fullscreen or not (fskeep.js install, wired by menu.js)
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
addEventListener('mousedown', e => { if (freeLook() && !lockOk() && e.target !== canvas) requestLock(); });
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
// GFX2 quality presets (Settings > Graphics quality, GK.settings.gfx): post chain, ambient occlusion, pixel ratio cap, texture anisotropy
const FXQ = {
  low: { post: false, ao: 0, pr: 1, aniso: 2 },        // plain render (context MSAA), no composer
  medium: { post: true, ao: 0, pr: 1.5, aniso: 4 },    // composer: MSAA 4x HDR target, bloom, vignette/grain
  high: { post: true, ao: 1, pr: 2, aniso: 8 },        // + GTAO ambient occlusion at half resolution
  ultra: { post: true, ao: 2, pr: 2, aniso: 16 },      // + GTAO at full resolution with more samples, max anisotropy
};
const fxQ = () => FXQ[GK.settings.gfx] || FXQ.high;
function fxPixelRatio() { return Math.min(devicePixelRatio, fxQ().pr) * GK.settings.scale; }
const FX_TONE = THREE.NeutralToneMapping, FX_EXPOSURE = 0.88, FX_ENV = 0.6;   // game view only (the title menu keeps the renderer's ACES look)
scene.traverse(o => { if (o.isHemisphereLight) o.intensity = 0.9; });   // was 2.1: the environment map now supplies most of the fill light (same light, lower intensity: light count unchanged)
let fxAniso = 0;
function fxApplyQuality(force) {
  const q = fxQ(), an = Math.min(q.aniso, renderer.capabilities.getMaxAnisotropy());
  if (an !== fxAniso || force) {   // re-upload the world's textures whose anisotropy differs from the preset's
    fxAniso = an; const seen = new Set();
    scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const k of ['map', 'roughnessMap', 'bumpMap', 'normalMap', 'emissiveMap', 'metalnessMap', 'alphaMap', 'aoMap']) { const t = m[k]; if (t && t.isTexture && !seen.has(t) && !t.isRenderTargetTexture && t.anisotropy !== an) { seen.add(t); t.anisotropy = an; t.needsUpdate = true; } } });
  }
  if (PERF2_ON) { for (const d of doors) if (d.halo) d.halo.visible = GK.settings.gfx !== 'low'; perf2Quality(); }   // PERF2: the small additive halos round the door lamps and keypads (up to 8 draw calls per vault door) are dropped on Low
  aoM.opacity = cornerM.opacity = q.ao && GK.settings.fx ? 0.55 : 1;   // the baked corner shading is lighter when GTAO adds real AO
  if (fx && fx.makeBloom) {   // bloom mips and edge fringing follow the preset
    const n = GK.settings.gfx === 'ultra' ? 5 : GK.settings.gfx === 'high' ? 4 : 3, b = fx.bloomCache[n] || (fx.bloomCache[n] = fx.makeBloom(n));
    if (fx.composer.passes[fx.bloomPassIdx] !== b) { fx.composer.passes[fx.bloomPassIdx] = b; fx.bloom = b; fxResize(); }
    fx.final.material.uniforms.uCA.value = q.ao > 0 ? 1 : 0;
  }
  if (fx && fx.gtao) { fx.gtao.enabled = q.ao > 0; fx.gtao.updateGtaoMaterial({ samples: q.ao > 1 ? 16 : 12 }); fx.gtao.updatePdMaterial({ samples: q.ao > 1 ? 16 : 8 }); fx.aoHalf = q.ao === 1; fxResize(); }
}
(async () => {   // image-based lighting: PMREM of three's RoomEnvironment replaces the small studio box built at startup
  try {
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const pm = new THREE.PMREMGenerator(renderer), env = new RoomEnvironment();
    scene.environment = pm.fromScene(env, 0.035).texture; scene.environmentIntensity = FX_ENV;
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); pm.dispose();
  } catch (e) { console.warn('RoomEnvironment unavailable, keeping the studio environment', e); }
})();
(async () => {
  try {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { GTAOPass }] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'), import('three/addons/postprocessing/ShaderPass.js'),
      import('three/addons/postprocessing/GTAOPass.js')]);
    const pr = renderer.getPixelRatio();
    // MSAA HDR target with a depth texture: GTAO reads the scene pass's own depth, so there is no second (normal) scene pass
    const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(innerWidth * pr, innerHeight * pr) });
    const composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    // GTAO ambient occlusion (High: half resolution, Ultra: full), normals rebuilt from depth; the result multiplies into the scene buffer in place
    const gtao = new GTAOPass(scene, cam, innerWidth, innerHeight, undefined, { radius: 1.1, distanceExponent: 2, thickness: 2, scale: 1.9, samples: 12, distanceFallOff: 1 }, { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
    gtao.blendIntensity = 1; gtao._renderGBuffer = false; gtao.normalTexture = null; gtao.needsSwap = false;
    for (const m of [gtao.gtaoMaterial, gtao.pdMaterial]) { m.defines.NORMAL_VECTOR_TYPE = 0; m.defines.DEPTH_SWIZZLING = 'x'; m.needsUpdate = true; }
    gtao.render = function (renderer, writeBuffer, readBuffer) {
      const dt = readBuffer.depthTexture, gu = this.gtaoMaterial.uniforms, pu = this.pdMaterial.uniforms;
      gu.tDepth.value = pu.tDepth.value = this.depthTexture = dt;
      gu.cameraNear.value = this.camera.near; gu.cameraFar.value = this.camera.far;
      gu.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix); gu.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse); gu.cameraWorldMatrix.value.copy(this.camera.matrixWorld);
      this._renderPass(renderer, this.gtaoMaterial, this.gtaoRenderTarget, 0xffffff, 1.0);
      pu.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
      this._renderPass(renderer, this.pdMaterial, this.pdRenderTarget, 0xffffff, 1.0);
      this.blendMaterial.uniforms.intensity.value = this.blendIntensity; this.blendMaterial.uniforms.tDiffuse.value = this.pdRenderTarget.texture;
      this._renderPass(renderer, this.blendMaterial, readBuffer);   // multiply blend straight into the scene buffer (no copy pass)
    };
    const gs = gtao.setSize.bind(gtao); gtao.setSize = (w, h) => (fx && fx.aoHalf) ? gs(Math.max(1, w >> 1), Math.max(1, h >> 1)) : gs(w, h);
    composer.addPass(gtao);
    // bloom at half resolution; the mip count is a preset setting (3 on Medium, 4 on High, 5 on Ultra), one pass per count, built on demand
    const bloomCache = {};
    const makeBloom = n => {
      const b = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.2, 2.8);   // strength, radius, threshold (HDR, linear)
      while (b.nMips > n) { b.nMips--; b.renderTargetsHorizontal.pop().dispose(); b.renderTargetsVertical.pop().dispose(); b.separableBlurMaterials.pop().dispose(); }
      const old = b.compositeMaterial; b.bloomTintColors.length = n;
      let tex = '', sum = ''; for (let i = 1; i <= n; i++) { tex += 'uniform sampler2D blurTexture' + i + ';\n'; sum += (i > 1 ? ' +\n' : '') + 'lerpBloomFactor(bloomFactors[' + (i - 1) + ']) * bloomTintColors[' + (i - 1) + '] * texture2D(blurTexture' + i + ', vUv).rgb'; }
      const un = { bloomStrength: { value: 1 }, bloomFactors: { value: [1.0, 0.8, 0.6, 0.4, 0.2].slice(0, n) }, bloomTintColors: { value: b.bloomTintColors }, bloomRadius: { value: 0 } };
      for (let i = 1; i <= n; i++) un['blurTexture' + i] = { value: b.renderTargetsVertical[i - 1].texture };
      b.compositeMaterial = new THREE.ShaderMaterial({ defines: { NUM_MIPS: n }, uniforms: un, vertexShader: old.vertexShader, fragmentShader: `varying vec2 vUv; ${tex}
        uniform float bloomStrength; uniform float bloomRadius; uniform float bloomFactors[NUM_MIPS]; uniform vec3 bloomTintColors[NUM_MIPS];
        float lerpBloomFactor(const in float factor) { return mix(factor, 1.2 - factor, bloomRadius); }
        void main() { vec3 bloom = 3.0 * bloomStrength * (${sum}); gl_FragColor = vec4(bloom, max(bloom.r, max(bloom.g, bloom.b))); }` });
      old.dispose(); b.strength = n <= 3 ? 0.27 : n === 4 ? 0.24 : 0.22;   // fewer mips lose the wide halo: a little more strength keeps the same glow
      const bs = b.setSize.bind(b); b.setSize = (w, h) => bs(Math.max(1, w >> 1), Math.max(1, h >> 1));
      return b;
    };
    const bloomPassIdx = composer.passes.length;
    composer.addPass(bloomCache[5] = makeBloom(5));
    // ONE final pass: tone mapping + sRGB, edge chromatic aberration (High+), light colour grade, vignette and film grain (replaces OutputPass + the old grain pass)
    const finalPass = new ShaderPass(new THREE.RawShaderMaterial({
      uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: 1 }, uTime: { value: 0 }, uCA: { value: 1 } },
      defines: { NEUTRAL_TONE_MAPPING: '', SRGB_TRANSFER: '' },
      vertexShader: 'precision highp float; uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp float; uniform sampler2D tDiffuse; uniform float uTime; uniform float uCA; varying vec2 vUv;
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        vec3 disp(vec2 uv){ return sRGBTransferOETF(vec4(NeutralToneMapping(texture2D(tDiffuse, uv).rgb), 1.0)).rgb; }
        void main(){
          vec2 d = vUv - 0.5; float r2 = dot(d, d);
          vec3 c;
          if (uCA > 0.5) { vec2 o = d * r2 * 0.006; c = vec3(disp(vUv + o).r, disp(vUv).g, disp(vUv - o).b); }   // tiny chromatic aberration, zero at the centre
          else c = disp(vUv);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.05);   // grade: a touch more colour, warm highlights, cool shadows
          c += vec3(0.010, 0.004, -0.008) * smoothstep(0.45, 1.0, l) + vec3(-0.006, 0.0, 0.010) * (1.0 - smoothstep(0.0, 0.35, l));
          c *= 1.0 - 0.34 * smoothstep(0.12, 0.62, r2);   // vignette
          c += (hash(vUv * 1024.0 + fract(uTime) * 61.0) - 0.5) * 0.022;   // film grain
          gl_FragColor = vec4(c, 1.0);
        }` }));
    const fp = finalPass.render.bind(finalPass);
    finalPass.render = function (r, w, rd, dt, m) { this.material.uniforms.toneMappingExposure.value = r.toneMappingExposure; return fp(r, w, rd, dt, m); };
    composer.addPass(finalPass);
    fx = { composer, bloom: bloomCache[5], bloomCache, makeBloom, bloomPassIdx, grain: finalPass, final: finalPass, gtao, aoHalf: true }; fxApplyQuality(); fxResize();
  } catch (e) { console.warn('post effects unavailable, using plain rendering', e); fx = null; }
})();
function renderWorld(t) {
  fxMat.uTime.value = t;
  for (const s of fxScreens) s.m.emissiveIntensity = s.base * (0.82 + 0.18 * Math.sin(t * 2.1 + s.ph));
  fxPrepActors();
  LAMPS.tick(t);   // 5x5: the 9 pooled lamps follow the camera
  if (cam.position.y < H) ROOMART.near(WORLD.roomKeyOf(cam.position.x, cam.position.z));   // 5x5: lazy room dressing, the camera's room and its neighbours first
  fxCullBegin();
  R5.tick(t);   // ROOMS5ART: lazy room art queue + update() of the visible art rooms (needs the cull set of this frame)
  const tm = renderer.toneMapping, te = renderer.toneMappingExposure;
  renderer.toneMapping = FX_TONE; renderer.toneMappingExposure = FX_EXPOSURE;
  if (fx && GK.settings.fx && fxQ().post) { fx.final.material.uniforms.uTime.value = t; fx.composer.render(); }
  else renderer.render(scene, cam);
  renderer.toneMapping = tm; renderer.toneMappingExposure = te;
  fxCullEnd();
}
// keypad screens and other status displays pulse gently (found by their material signature, the builders stay untouched)
const fxScreens = [];
scene.traverse(o => { const m = o.isMesh && o.material; if (m && m.isMeshStandardMaterial && m.color.getHex() === 0x103020 && m.emissiveIntensity === 1.4) fxScreens.push({ m, base: 1.4, ph: Math.random() * 6.28 }); });
// floating dust motes (one Points object, animated entirely in the vertex shader) and soft light shafts (one merged mesh)
{
  const pos = [], seed = [], col = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const addMotes = (cx, cz, hx, hz, n, c) => { for (let i = 0; i < n; i++) { pos.push(cx + rnd(-hx, hx), 0, cz + rnd(-hz, hz)); seed.push(Math.random(), rnd(0.4, 1), rnd(0.015, 0.035), Math.random()); col.push(...c); } };
  for (let i = 0; i < WORLD.NARENA; i++) { const [cx, cz] = rc(i); addMotes(cx, cz, roomW(i) / 2 - 1, roomD(i) / 2 - 1, Math.round(38 * roomW(i) * roomD(i) / 144), i === WORLD.VAULT ? [0.9, 0.78, 0.5] : [0.62, 0.6, 0.58]); }   // dust scales with the room area (the vault gets golden dust)
  for (const cr of CHEST_ROOMS) addMotes(cr.cx, cr.cz, (cr.size || CS) / 2 - 1, (cr.size || CS) / 2 - 1, 11, [1.0, 0.82, 0.5]);
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
  for (const cr of CHEST_ROOMS) for (const z of (cr.size > CS ? [-2.2, 1.8] : [-1.8, 1.4])) addShaft(cr.cx, cr.cz, Math.atan2(-cr.dx, -cr.dz), 0, z, 2.1, 1.0);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); sg.setIndex(si);
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d'), img = g.createImageData(32, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) { const v = 1 - y / 63, u = Math.sin(Math.PI * (x + 0.5) / 32), a = Math.pow(v, 1.7) * Math.pow(u, 0.8); const k = (y * 32 + x) * 4; img.data[k] = 255; img.data[k + 1] = 236; img.data[k + 2] = 200; img.data[k + 3] = Math.round(a * 255); }
  g.putImageData(img, 0, 0);
  const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
  const shafts = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.11, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  shafts.frustumCulled = false; shafts.renderOrder = 2; shafts.matrixAutoUpdate = false; scene.add(shafts);
}
// ---- GFX2 material polish: roughness detail for plaster and brushed steel, physical skin and cloth for the goblins (fxSkin / fxCloth, used by buildGoblin)
{
  const plasterRough = canvasTex(256, 256, (g, w, h) => {   // soft trowel patches: plaster is not uniformly matte
    g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const x = Math.random() * w, y = Math.random() * h, r = 12 + Math.random() * 46, v = Math.random() < 0.5 ? 255 : 150;
      for (const [ox, oy] of [[0, 0], [-w, 0], [w, 0], [0, -h], [0, h]]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, `rgba(${v},${v},${v},.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); } }
  }, false);
  plaster.roughnessMap = plasterRough; plaster.roughness = 1; plaster.envMapIntensity = 0.35; plaster.bumpScale = 0.35;   // softer bump: with less flat fill light the old 0.9 read as stucco
  const brushRough = canvasTex(256, 256, (g, w, h) => {   // brushed metal: fine horizontal streaks of varying roughness
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) { const v = 90 + Math.random() * 110 | 0; g.fillStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.35})`; g.fillRect(Math.random() * w - 40, Math.random() * h, 30 + Math.random() * 160, 1); }
    speckle(g, w, h, 600, 2, 0.15);
  }, false);
  for (const [m, r] of [[steelM, 0.5], [vaultM, 0.46], [gunM, 0.5], [lightSteelM, 0.34], [darkSteel, 0.5]]) { m.roughnessMap = brushRough; m.roughness = r; }
  floorM.envMapIntensity = 0.8; goldM.roughness = 0.24; goldM.envMapIntensity = 1.5; rivetM.envMapIntensity = 1.3;
}
function fxSkin(color, o = {}) {   // goblin skin: physical material with a soft sheen (peach fuzz) and a faint clearcoat so it reads as skin, not plastic
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, envMapIntensity: 0.5, sheen: 0.35, sheenRoughness: 0.5, sheenColor: c.clone().lerp(new THREE.Color(0xfff2c0), 0.25), clearcoat: 0.12, clearcoatRoughness: 0.5, ...o });
}
function fxCloth(color, o = {}) {   // woven cloth: strong sheen at grazing angles, no specular glint
  const c = new THREE.Color(color);
  return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.9, envMapIntensity: 0.35, sheen: 1, sheenRoughness: 0.65, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.35), ...o });
}
// ---- GFX2 static merging: sibling meshes that share a material are merged into one mesh (fewer draw calls); animated parts, door art and toggled parts are skipped
const FX_OBR = THREE.Object3D.prototype.onBeforeRender;
function fxMergeList(list) {
  const g0 = list[0].geometry, names = Object.keys(g0.attributes), parts = [];
  let nv = 0, ni = 0;
  for (const c of list) {
    if (c.matrixAutoUpdate) c.updateMatrix();
    const g = c.geometry.clone(); g.applyMatrix4(c.matrix);
    if (c.matrix.determinant() < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } }
    parts.push(g); nv += g.attributes.position.count; ni += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const a0 = g0.attributes[n], arr = new a0.array.constructor(nv * a0.itemSize); let off = 0;
    for (const g of parts) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
  }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let io = 0, vo = 0;
  for (const g of parts) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo; io += ix.length; vo += g.attributes.position.count; g.dispose(); }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(out, list[0].material); m.name = 'fxMerged'; m.frustumCulled = list[0].frustumCulled; m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}
function fxMergeKids(parent, skip) {   // merge the leaf mesh children of one node, bucketed by material and vertex layout
  const buckets = new Map();
  for (const c of parent.children) {
    if (!c.isMesh || c.isInstancedMesh || c.isSkinnedMesh || c.children.length || !c.visible || skip.has(c) || Array.isArray(c.material) || c.onBeforeRender !== FX_OBR || c.renderOrder !== 0 || Object.keys(c.userData).length) continue;
    const g = c.geometry; if (!g || !g.index || !g.attributes.position || Object.keys(g.morphAttributes).length) continue;   // (geometry groups are ignored with a single material)
    if (Object.values(g.attributes).some(a => a.isInterleavedBufferAttribute)) continue;
    const key = c.material.uuid + '|' + Object.keys(g.attributes).sort().map(n => n + g.attributes[n].itemSize + g.attributes[n].array.constructor.name).join() + '|' + c.frustumCulled + c.layers.mask;
    let l = buckets.get(key); if (!l) buckets.set(key, l = []); l.push(c);
  }
  let saved = 0;
  for (const list of buckets.values()) { if (list.length < 2) continue; const m = fxMergeList(list); for (const c of list) parent.remove(c); parent.add(m); saved += list.length - 1; }
  return saved;
}
// door frames and leaves (walls), the room shells and THE VAULT decor: merged once at startup (all built by the world code above)
const fxMergeStats = { walls: 0, rooms: 0, goblins: 0 };
{
  const skip = new Set();
  for (const d of doors) {
    if (d.art) for (const k in d.art) d.art[k].forEach(o => o.traverse(c => skip.add(c)));
    for (const o of [...d.bolts, ...(d.lasers || []), ...(d.scan || []), ...(d.merchPlates || [])]) skip.add(o);
  }
  let btnM = null;   // keypad buttons: identical materials, one per button; share one so they merge
  scene.traverse(o => { const m = o.material; if (o.isMesh && m && m.isMeshStandardMaterial && m.color.getHex() === 0x222222 && m.emissive.getHex() === 0x7aa7ff && m.emissiveIntensity === 0.6) o.material = btnM || (btnM = m); });
  for (const o of worldStatic) if (!o.isMesh && !o.isLight) o.traverse(n => { if (n.children.length) fxMergeStats.walls += fxMergeKids(n, skip); });
  // leaf meshes directly under the scene (floors, panels, AO decals, vault pillars and trims): merged per room so room culling still works
  const ceil = new Set(ceilings), byRoom = new Map(), bb = new THREE.Box3();
  for (const o of worldStatic) {
    if (!o.isMesh || ceil.has(o)) continue;
    bb.setFromObject(o); if (bb.isEmpty()) continue;
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, k = WORLD.roomKeyOf(cx, cz);
    if (WORLD.roomKeyOf(bb.min.x + 0.05, bb.min.z + 0.05) !== k || WORLD.roomKeyOf(bb.max.x - 0.05, bb.max.z - 0.05) !== k) continue;   // only meshes inside one room
    let l = byRoom.get(k); if (!l) byRoom.set(k, l = new THREE.Group()); l.add(o);   // temporary holder (the meshes keep their world transforms: the scene is the identity)
  }
  for (const [, grp] of byRoom) { fxMergeStats.rooms += fxMergeKids(grp, skip); for (const c of grp.children.slice()) scene.add(c); }
}
// PERF2-BEGIN door draw-call merge (client performance pass 2, docs/reports/perf-2.md)
// A vault door was about 130 draw calls: 32 laser boxes, 24 bolts, keypad / panel / beacon parts spread over nested groups. The startup merge above only joins direct siblings.
// Here every door is split into rigid "frames" (the wall group itself plus each node the door code moves: leaf / hinge, wheels, rings, beacon rotors, scanner bars) and the
// static meshes of each frame are merged per material into the frame. Lasers become one mesh (the frame loop only toggles .visible); the 24 bolts become one mesh per slide
// direction (the frame loop sets position.x = userData.x0 + sx * 0.38 * (1 - bolt), x0 is baked into the geometry so it is 0 here).
const perf2 = { lasers: 0, bolts: 0, flat: 0 };
function perf2Bake(list, frame) {   // merge meshes sharing material and vertex layout into one mesh in the local space of `frame` (matrixWorld of everything is current)
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), rel = new THREE.Matrix4(), g0 = list[0].geometry, names = Object.keys(g0.attributes), parts = [];
  let nv = 0, ni = 0;
  for (const c of list) {
    rel.multiplyMatrices(inv, c.matrixWorld);
    const g = c.geometry.clone(); g.applyMatrix4(rel);
    if (rel.determinant() < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const k = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = k; } }
    parts.push(g); nv += g.attributes.position.count; ni += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const a0 = g0.attributes[n], arr = new a0.array.constructor(nv * a0.itemSize); let off = 0;
    for (const g of parts) { arr.set(g.attributes[n].array, off); off += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, a0.itemSize, a0.normalized));
  }
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni); let io = 0, vo = 0;
  for (const g of parts) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo; io += ix.length; vo += g.attributes.position.count; g.dispose(); }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(out, list[0].material); m.name = 'fxMerged'; m.frustumCulled = list[0].frustumCulled; m.renderOrder = list[0].renderOrder; m.layers.mask = list[0].layers.mask;
  m.matrixAutoUpdate = false; m.updateMatrix(); out.computeBoundingSphere();
  return m;
}
function perf2Mergeable(o, skip) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length || !o.visible || skip.has(o) || Array.isArray(o.material) || o.onBeforeRender !== FX_OBR || Object.keys(o.userData).length) return false;
  const g = o.geometry, m = o.material; if (!g || !g.index || !g.attributes.position || Object.keys(g.morphAttributes).length || Object.values(g.attributes).some(a => a.isInterleavedBufferAttribute)) return false;
  return !m.transparent || (m.depthWrite === false && m.blending === THREE.AdditiveBlending);   // additive glow pieces add up in any order; ordinary see-through parts stay separate
}
const perf2Canon = new Map();   // look-alike materials the door builders create one per mesh (keypad buttons, signs, bio-panel hands / pupils, plaques) -> one fresh shared clone per look
function perf2CanonMat(m, owned) {   // only unanimated, unreferenced look-alikes; the door's own materials (d.light, d.ledM, d.leafMat ...) and the pulsing keypad screens keep their identity
  if (owned.has(m) || m.userData.perf2) return m;
  let key = null;
  if (m.isMeshBasicMaterial) key = ['B', m.color.getHex(), m.map && m.map.uuid, m.toneMapped, m.side, m.transparent, m.opacity, m.blending, m.depthWrite, m.fog, m.alphaTest, m.vertexColors].join('|');
  else if (m.isMeshStandardMaterial && !m.isMeshPhysicalMaterial && m.color.getHex() === 0x000222 && m.emissive.getHex() === 0x7aa7ff && m.emissiveIntensity === 0.6 && !m.map) key = 'keypad-button';   // (the old startup pass looked for 0x222222 and never matched these)
  if (!key) return m;
  let c = perf2Canon.get(key); if (!c) { c = m.clone(); c.userData = { perf2: 1 }; perf2Canon.set(key, c); }
  return c;
}
function perf2MergeDoors() {
  const owned = new Set(statusMats); for (const s of fxScreens) owned.add(s.m);
  for (const d of doors) for (const k in d) { const v = d[k]; if (v && v.isMaterial) owned.add(v); }
  for (const d of doors) {
    let root = d.leaf; while (root.parent && root.parent !== scene) root = root.parent;
    root.updateMatrixWorld(true);
    const skip = new Set();
    if (d.art) for (const k in d.art) d.art[k].forEach(o => o.traverse(c => skip.add(c)));
    for (const o of d.merchPlates || []) skip.add(o);
    for (const o of d.scan || []) skip.add(o);   // the scanner bars move on their own
    root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !skip.has(o) && !Array.isArray(o.material)) o.material = perf2CanonMat(o.material, owned); });
    // lasers: one mesh, still toggled through d.lasers[i].visible
    if (d.lasers && d.lasers.length > 1 && d.lasers.every(o => o.parent === d.lasers[0].parent && perf2Mergeable(o, skip))) {
      const par = d.lasers[0].parent, m = perf2Bake(d.lasers, par); perf2.lasers += d.lasers.length - 1;
      for (const o of d.lasers) par.remove(o); par.add(m); d.lasers = [m];
    }
    // bolts: one mesh per slide direction, position.x is the only animated channel
    if (d.bolts.length > 1) {
      const par = d.bolts[0].parent, bySx = new Map(); let ok = true;
      for (const b of d.bolts) { if (b.parent !== par || !b.userData || b.userData.sx === undefined) { ok = false; break; } let l = bySx.get(b.userData.sx); if (!l) bySx.set(b.userData.sx, l = []); l.push(b); }
      if (ok) {
        const nb = [];
        for (const [sx, l] of bySx) { const m = perf2Bake(l, par); m.matrixAutoUpdate = true; m.userData = { sx, x0: 0 }; perf2.bolts += l.length - 1; for (const o of l) par.remove(o); par.add(m); nb.push(m); }
        d.bolts = nb;
      }
    }
    for (const o of d.bolts) skip.add(o);
    for (const o of d.lasers || []) skip.add(o);
    // static parts per frame
    const frames = new Set([root, d.leaf, ...d.wheels, ...d.rings, ...d.rots, ...d.dyn, ...(d.scan || [])]);
    const buckets = new Map();
    const walk = (o, frame) => {
      for (const c of o.children) {
        if (!c.visible) continue;
        if (c.isMesh && !c.isInstancedMesh) {
          if (!perf2Mergeable(c, skip)) continue;
          const g = c.geometry, key = frame.uuid + '|' + c.material.uuid + '|' + c.renderOrder + '|' + c.frustumCulled + c.layers.mask + '|' + Object.keys(g.attributes).sort().map(n => n + g.attributes[n].itemSize + g.attributes[n].array.constructor.name).join();
          let b = buckets.get(key); if (!b) buckets.set(key, b = { frame, list: [] }); b.list.push(c);
        } else if (c.children.length) walk(c, frames.has(c) ? c : frame);
      }
    };
    walk(root, root);
    for (const b of buckets.values()) {
      if (b.list.length < 2) continue;
      const m = perf2Bake(b.list, b.frame); perf2.flat += b.list.length - 1;
      for (const o of b.list) o.parent.remove(o); b.frame.add(m);
    }
  }
}
// PERF2-END
// PERF2-BEGIN goblin level of detail and far-goblin update rate
// A goblin is about 45 to 60 thousand triangles (10 baked parts, shared per type). Beyond a preset-dependent distance the parts swap to simplified copies of the same baked geometry
// (vertex clustering: one vertex per grid cell, attributes averaged, degenerate triangles dropped), 3x and 7x fewer triangles. The copies are built one per idle slot after a goblin
// of a new type appears, shared by every goblin of the type, and until one exists the full-detail geometry stays.
const PERF2_LOD = { low: [5, 10], medium: [8, 16], high: [12, 24], ultra: [14, 28] };   // metres beyond which level 1 / level 2 is used
const PERF2_CELL = [0, 0.03, 0.06];   // clustering cell size per level, in the baked part's own units (metres at rig scale 1)
function perf2Simplify(geo, cell) {
  const pa = geo.attributes.position.array, na = geo.attributes.normal.array, ua = geo.attributes.uv.array, ca = geo.attributes.color.array, ma = geo.attributes.aMat.array, ix = geo.index.array, n = geo.attributes.position.count;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox, map = new Map(), rep = new Int32Array(n);
  let m = 0; const P = [], N = [], U = [], C = [], A = [], cnt = [];
  for (let i = 0; i < n; i++) {
    const key = Math.floor((pa[i * 3] - bb.min.x) / cell) + ',' + Math.floor((pa[i * 3 + 1] - bb.min.y) / cell) + ',' + Math.floor((pa[i * 3 + 2] - bb.min.z) / cell);
    let c = map.get(key);
    if (c === undefined) { c = m++; map.set(key, c); P.push(0, 0, 0); N.push(0, 0, 0); U.push(0, 0); C.push(0, 0, 0); A.push(0, 0, 0, 0); cnt.push(0); }
    rep[i] = c; cnt[c]++;
    for (let k = 0; k < 3; k++) { P[c * 3 + k] += pa[i * 3 + k]; N[c * 3 + k] += na[i * 3 + k]; C[c * 3 + k] += ca[i * 3 + k]; }
    U[c * 2] += ua[i * 2]; U[c * 2 + 1] += ua[i * 2 + 1];
    for (let k = 0; k < 4; k++) A[c * 4 + k] += ma[i * 4 + k];
  }
  const tri = []; for (let i = 0; i < ix.length; i += 3) { const a = rep[ix[i]], b = rep[ix[i + 1]], c = rep[ix[i + 2]]; if (a !== b && b !== c && a !== c) tri.push(a, b, c); }
  const used = new Int32Array(m).fill(-1); let k = 0; for (let i = 0; i < tri.length; i++) if (used[tri[i]] < 0) used[tri[i]] = k++;
  const op = new Float32Array(k * 3), on = new Float32Array(k * 3), ou = new Float32Array(k * 2), oc = new Float32Array(k * 3), oa = new Float32Array(k * 4);
  for (let c = 0; c < m; c++) {
    const j = used[c]; if (j < 0) continue; const q = 1 / cnt[c], l = Math.hypot(N[c * 3], N[c * 3 + 1], N[c * 3 + 2]) || 1;
    for (let t = 0; t < 3; t++) { op[j * 3 + t] = P[c * 3 + t] * q; on[j * 3 + t] = N[c * 3 + t] / l; oc[j * 3 + t] = C[c * 3 + t] * q; }
    ou[j * 2] = U[c * 2] * q; ou[j * 2 + 1] = U[c * 2 + 1] * q;
    for (let t = 0; t < 4; t++) oa[j * 4 + t] = A[c * 4 + t] * q;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(op, 3)); g.setAttribute('normal', new THREE.BufferAttribute(on, 3)); g.setAttribute('uv', new THREE.BufferAttribute(ou, 2));
  g.setAttribute('color', new THREE.BufferAttribute(oc, 3)); g.setAttribute('aMat', new THREE.BufferAttribute(oa, 4));
  const oi = k > 65535 ? new Uint32Array(tri.length) : new Uint16Array(tri.length); for (let i = 0; i < tri.length; i++) oi[i] = used[tri[i]];
  g.setIndex(new THREE.BufferAttribute(oi, 1)); g.computeBoundingSphere(); g.computeBoundingBox(); return g;
}
function perf2LodPump() {   // one simplified geometry per idle slot
  perf2Lod.timer = 0; const job = perf2Lod.queue.shift(); if (!job) return;
  try { perf2Lod.geo.set(job.k, perf2Simplify(job.g, job.cell)); } catch (e) { perf2Lod.geo.set(job.k, null); console.warn('goblin LOD skipped', e); }
  if (perf2Lod.queue.length) perf2LodSched();
}
function perf2LodSched() { if (perf2Lod.timer) return; perf2Lod.timer = 1; if (window.requestIdleCallback) requestIdleCallback(perf2LodPump, { timeout: 1500 }); else setTimeout(perf2LodPump, 60); }
function perf2LodInit(root, u) {   // called by buildGoblin: collect the baked part meshes and queue their simplified copies
  const list = []; root.traverse(o => { const ck = perf2Lod.meshes.get(o); if (ck) list.push({ mesh: o, k: [ck, ck + '|1', ck + '|2'] }); });
  u.lodList = list; u.lodLvl = 0; u.lodDone = true;
  for (const e of list) {
    if (!perf2Lod.hi.has(e.k[0])) perf2Lod.hi.set(e.k[0], e.mesh.geometry);
    for (let l = 2; l >= 1; l--) if (!perf2Lod.queued.has(e.k[l])) { perf2Lod.queued.add(e.k[l]); perf2Lod.queue.push({ k: e.k[l], g: perf2Lod.hi.get(e.k[0]), cell: PERF2_CELL[l] }); }
  }
  perf2LodSched();
}
function perf2LodStep(u, d2, th) {   // th = [near, far] metres for the current preset; 10 % hysteresis so a goblin on the border does not flicker
  const lst = u.lodList; if (!lst) return;
  const a = th[0] * (u.lodLvl >= 1 ? 0.9 : 1.1), b = th[1] * (u.lodLvl === 2 ? 0.9 : 1.1);
  const lvl = d2 > b * b ? 2 : d2 > a * a ? 1 : 0;
  if (lvl === u.lodLvl && u.lodDone) return;
  u.lodLvl = lvl; u.lodDone = true;
  for (let i = 0; i < lst.length; i++) {
    const e = lst[i]; let g = lvl ? perf2Lod.geo.get(e.k[lvl]) : null;
    if (!g && lvl === 2) g = perf2Lod.geo.get(e.k[1]);   // level 2 not built yet: level 1 if it is there
    if (!g) { g = perf2Lod.hi.get(e.k[0]); if (lvl) u.lodDone = false; }   // nothing built yet: stay detailed and look again next frame
    if (e.mesh.geometry !== g) e.mesh.geometry = g;
  }
}
// far goblins: the animation pose is refreshed every 2nd frame beyond 14 m and every 3rd beyond 26 m, or when the goblin is outside the view frustum and not within 6 m; the local goblin and anything within 6 m always runs
const perf2View = { m: new THREE.Matrix4(), fr: new THREE.Frustum(), s: new THREE.Sphere(), n: 0 };
function perf2ViewBegin() { perf2View.n++; if (!PERF2_ON) return; perf2View.m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); perf2View.fr.setFromProjectionMatrix(perf2View.m); }
function perf2Skip(a, id, d2) {   // true when this goblin's pose update can wait for a later frame
  if (!PERF2_ON || id === me || d2 < 36 || a.swing || a.hitT > 0 || a.dead) return false;
  const v = perf2View; v.s.center.set(a.x, 1, a.z); v.s.radius = 2.2;
  const k = d2 > 676 ? 3 : d2 > 196 ? 2 : !v.fr.intersectsSphere(v.s) ? 3 : 1;
  return k > 1 && (v.n + id) % k !== 0;
}
// PERF2-END
// PERF2-BEGIN per-frame JS and preset details
// merchantHoverTick: the target list is cached (rebuilt only when the arrays change) and the 7 m ray is skipped while no target is within 20 m
const perf2Hov = { mt: null, st: null, m0: null, m1: null, s0: null, s1: null, nm: -1, ns: -1, T: [] };
function perf2HoverTargets() {
  const mt = GK.merchantTargets, st = GK.stationTargets, nm = mt ? mt.length : 0, ns = st ? st.length : 0, h = perf2Hov, m0 = nm ? mt[0] : null, m1 = nm ? mt[nm - 1] : null, s0 = ns ? st[0] : null, s1 = ns ? st[ns - 1] : null;
  if (h.mt !== mt || h.st !== st || h.nm !== nm || h.ns !== ns || h.m0 !== m0 || h.m1 !== m1 || h.s0 !== s0 || h.s1 !== s1) {
    h.mt = mt; h.st = st; h.nm = nm; h.ns = ns; h.m0 = m0; h.m1 = m1; h.s0 = s0; h.s1 = s1;
    h.T = [...(mt || []), ...(st || []).filter(o => o && o.userData && (o.userData.station === 'recycler' || o.userData.station === 'workbench' || o.userData.station === 'knowledge' || o.userData.station === 'screen' || o.userData.station === 'pump' || o.userData.station === 'box'))];
  }
  return h.T;
}
function perf2HoverNear(T) {
  const p = cam.position;
  for (let i = 0; i < T.length; i++) { const e = T[i].matrixWorld.elements, dx = e[12] - p.x, dz = e[14] - p.z; if (dx * dx + dz * dz < 400) return true; }
  return false;
}
// preset details: the door chains and rivets (instanced, 168 and 80 triangles each, 100 to 150 per vault door) use a coarser mesh on Low and Medium; Medium's HDR composer targets use 2x instead of 4x MSAA
const perf2Detail = { chain: new THREE.TorusGeometry(0.07, 0.022, 4, 8), rivet: new THREE.SphereGeometry(1, 6, 4), list: null };
function perf2Quality() {
  if (!PERF2_ON) return;
  const gq = GK.settings.gfx, coarse = gq === 'low' || gq === 'medium', D = perf2Detail;
  if (!D.list) { D.list = []; scene.traverse(o => { if (o.isInstancedMesh && (o.geometry === chainGeo || o.geometry === rivetGeo)) D.list.push({ m: o, hi: o.geometry, lo: o.geometry === chainGeo ? D.chain : D.rivet }); }); }
  for (const e of D.list) { const g = coarse ? e.lo : e.hi; if (e.m.geometry !== g) e.m.geometry = g; }
  if (fx && fx.composer) { const s = gq === 'medium' ? 2 : 4; for (const t of [fx.composer.renderTarget1, fx.composer.renderTarget2]) if (t.samples !== s) { t.samples = s; t.dispose(); } }
}
// PERF2-END
// PERF2-BEGIN door merge, continued: rigid groups, startup
function perf2MergeGroup(g) {   // rigid group built from many small meshes (the first-person hand): one mesh per material, same pose
  g.updateMatrixWorld(true);
  const buckets = new Map();
  for (const c of g.children) {
    if (!perf2Mergeable(c, perf2None)) continue;
    const key = c.material.uuid + '|' + Object.keys(c.geometry.attributes).sort().join(); let l = buckets.get(key); if (!l) buckets.set(key, l = []); l.push(c);
  }
  for (const l of buckets.values()) { if (l.length < 2) continue; const m = perf2Bake(l, g); m.frustumCulled = false; for (const c of l) g.remove(c); g.add(m); perf2.flat += l.length - 1; }
  return g;
}
const perf2None = new Set();
try { if (PERF2_ON) perf2MergeDoors(); } catch (e) { console.warn('door merge skipped', e); }
if (PERF2_ON) scene.traverse(o => { if (o.name === 'fxMerged' && o.geometry && !o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); });   // the merged meshes get their bounding sphere now, not lazily in the first frame that tests them against the frustum
GK.perf2 = perf2;
// PERF2-END
// goblins (players): merged lazily the first time they are drawn; animated parts (legs, arms, head, cape, spinning and floating bits) keep their own groups
const fxSeen = new WeakSet();
function fxPrepActors() {
  for (const a of actors.values()) {
    const g = a.group; if (!g || fxSeen.has(g)) continue; fxSeen.add(g);
    const u = g.userData; if (!u || !u.rig) continue;
    const skip = new Set(); if (u.runes) u.runes.traverse(o => skip.add(o)); if (u.label) skip.add(u.label); for (const o of u.glows || []) skip.add(o);
    try { u.rig.traverse(o => { if (o.children.length && !skip.has(o)) fxMergeStats.goblins += fxMergeKids(o, skip); }); } catch (e) { console.warn('goblin merge skipped', e); }
  }
}
// ---- GFX2 room culling: from inside a room only that room, rooms reachable through open (or moving) doors, and the goblins in them are drawn
const fxAny = (k, set) => { for (let i = 0; i < k.length; i++) if (set.has(k[i])) return true; return false; };   // PERF: replaces k.some(closure) in the per-frame culling loops
const fxCull = { on: true, active: false, cls: new WeakMap(), adj: null, vis: new Set(), near: new Set(), hidden: [], dist: new Map() /* FEEL2: door hops from the current room */ };
const _fxB = new THREE.Box3();
// 5x5 portal culling helpers: the screen rectangle (NDC [x0, y0, x1, y1]) of a door's opening (both wall faces), null when off screen, the full screen when a corner is behind the camera
const fxProjM = new THREE.Matrix4(), FX_FULL = [-1, -1, 1, 1], _fxV = new THREE.Vector4();
function fxDoorRect(d) {
  const hw = d.dw / 2 + 0.1; let x0 = 9, y0 = 9, x1 = -9, y1 = -9, behind = 0;
  for (const s of [-1, 1]) for (const f of [-1, 1]) for (const y of [0, d.dh]) {
    const x = d.gx + d.ax[0] * s * hw + d.az[0] * f * T / 2, z = d.gz + d.ax[1] * s * hw + d.az[1] * f * T / 2;
    _fxV.set(x, y, z, 1).applyMatrix4(fxProjM); if (_fxV.w < 0.05) { behind++; continue; }
    const px = _fxV.x / _fxV.w, py = _fxV.y / _fxV.w; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  if (behind === 8) return null;   // the whole opening is behind the camera
  if (behind) return FX_FULL;      // the camera is in or right next to the doorway
  if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null;
  return [Math.max(-1, x0 - 0.02), Math.max(-1, y0 - 0.02), Math.min(1, x1 + 0.02), Math.min(1, y1 + 0.02)];
}
const fxBoxes = new WeakMap(), _fxB2 = new THREE.Box3();
function fxInPortal(o, keys, rects) {   // does the static object's screen rectangle meet the portal rectangle of one of its rooms?
  let b = fxBoxes.get(o); if (!b) { _fxB2.setFromObject(o); b = _fxB2.isEmpty() ? null : [_fxB2.min.x, _fxB2.min.y, _fxB2.min.z, _fxB2.max.x, _fxB2.max.y, _fxB2.max.z]; fxBoxes.set(o, b || []); }
  if (!b || !b.length) return true;
  let x0 = 9, y0 = 9, x1 = -9, y1 = -9, behind = 0;
  for (let i = 0; i < 8; i++) {
    _fxV.set(b[i & 1 ? 3 : 0], b[i & 2 ? 4 : 1], b[i & 4 ? 5 : 2], 1).applyMatrix4(fxProjM); if (_fxV.w < 0.05) { behind++; continue; }
    const px = _fxV.x / _fxV.w, py = _fxV.y / _fxV.w; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  if (behind === 8) return false;
  const r = behind ? FX_FULL : [x0, y0, x1, y1];
  for (let i = 0; i < keys.length; i++) if (fxClipRect(rects.get(keys[i]), r)) return true;
  return false;
}
const fxClipRect = (a, b) => { if (!a || !b) return null; const r = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]; return r[0] < r[2] && r[1] < r[3] ? r : null; };
function fxClassify(o) {   // room keys a static top-level object belongs to (1 or 2 for walls between rooms), null = always drawn
  if (o.isLight || o.matrixAutoUpdate !== false) return null;
  let hook = false; o.traverse(c => { if (c.onBeforeRender !== FX_OBR) hook = true; }); if (hook) return null;   // objects that animate from onBeforeRender must keep rendering
  _fxB.setFromObject(o); if (_fxB.isEmpty()) return undefined;   // empty holder: classify again later
  const cx = (_fxB.min.x + _fxB.max.x) / 2, cz = (_fxB.min.z + _fxB.max.z) / 2;
  const hx = Math.max(0.05, (_fxB.max.x - _fxB.min.x) / 2 - 0.6), hz = Math.max(0.05, (_fxB.max.z - _fxB.min.z) / 2 - 0.6), keys = new Set();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = cx + hx * (i / 1.5 - 1), z = cz + hz * (j / 1.5 - 1);
    if (Math.abs(x) > WORLD.LIM || Math.abs(z) > WORLD.LIM) return null;
    keys.add(WORLD.roomKeyOf(x, z)); if (keys.size > 2) return null;
  }
  return [...keys];
}
function fxCullBegin() {
  const p = cam.position;
  fxCull.active = false;
  if (!fxCull.on || p.y > H || Math.abs(p.x) > WORLD.LIM || Math.abs(p.z) > WORLD.LIM) return;   // overview / death / win cameras see everything
  if (!fxCull.adj) fxCull.adj = doors.map(d => [WORLD.roomKeyOf(d.gx + d.az[0] * 1.2, d.gz + d.az[1] * 1.2), WORLD.roomKeyOf(d.gx - d.az[0] * 1.2, d.gz - d.az[1] * 1.2)]);
  const vis = fxCull.vis, here = WORLD.roomKeyOf(p.x, p.z); vis.clear(); vis.add(here); fxCull.active = true;
  const near = fxCull.near; near.clear(); near.add(here);
  for (let i = 0; i < doors.length; i++) { const d = doors[i], ad = fxCull.adj[i], a = ad[0], b = ad[1]; if ((d.p > 0.001 || d.open) && (a === here || b === here)) { near.add(a); near.add(b); } }
  /* FEEL2-BEGIN: breadth-first growth through open doors, limited to 2 door hops (low/medium) or 3 (high/ultra) so sudden death does not render every room */
  // 5x5 (docs/PLAN-5x5.md 4.3): portal culling. Each door's opening is projected to the screen; a room is drawn only if it can be seen through the chain of open doors
  // that leads to it (the screen rectangles are intersected door by door), and only within 40 m. In a 5x5 grid with every door open this keeps the view to the rooms in line of sight.
  const dist = fxCull.dist, gq = GK.settings.gfx, maxHop = (gq === 'low' || gq === 'medium') ? 2 : 3; dist.clear(); dist.set(here, 0);
  cam.updateMatrixWorld(); fxProjM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  const rects = fxCull.rects || (fxCull.rects = new Map()); rects.clear(); rects.set(here, FX_FULL);
  let front = [here];
  for (let hop = 0; hop < maxHop && front.length; hop++) {
    const next = [];
    for (let i = 0; i < doors.length; i++) {
      const d = doors[i]; if (d.p <= 0.001 && !d.open) continue;
      const ad = fxCull.adj[i], a = ad[0], b = ad[1], da = dist.get(a), db = dist.get(b);
      let from, to; if (da === hop && (db === undefined || db === hop + 1)) { from = a; to = b; } else if (db === hop && (da === undefined || da === hop + 1)) { from = b; to = a; } else continue;
      const rr = fxClipRect(rects.get(from), fxDoorRect(d)); if (!rr) continue;
      const box = WORLD.roomRect(to); if (box && Math.hypot(Math.max(0, Math.abs(p.x - box.cx) - box.hw), Math.max(0, Math.abs(p.z - box.cz) - box.hd)) > 40) continue;
      const old = rects.get(to); rects.set(to, old ? [Math.min(old[0], rr[0]), Math.min(old[1], rr[1]), Math.max(old[2], rr[2]), Math.max(old[3], rr[3])] : rr);
      if (dist.get(to) === undefined) { dist.set(to, hop + 1); vis.add(to); next.push(to); }
    }
    front = next;
  }
  /* FEEL2-END */
  const hid = fxCull.hidden;
  for (const o of scene.children) {
    if (!o.visible) continue;
    let k = fxCull.cls.get(o); if (k === undefined) { k = fxClassify(o); if (k !== undefined) fxCull.cls.set(o, k); }
    if (k && !fxAny(k, vis)) { o.visible = false; hid.push(o); }
    else if (k && !k.includes(here) && !fxInPortal(o, k, rects)) { o.visible = false; hid.push(o); }   // 5x5: in a room seen through doors, only what lies inside that room's portal rectangle
  }
  for (const a of actors.values()) { const g = a.group; if (g && g.visible && !vis.has(WORLD.roomKeyOf(a.x, a.z))) { g.visible = false; hid.push(g); } }
}
function fxCullEnd() { const hid = fxCull.hidden; for (let i = 0; i < hid.length; i++) hid[i].visible = true; hid.length = 0; }
// ---- GFX2 contact shadows: soft dark blobs under floor-standing props (one InstancedMesh, rebuilt when the match layout fills the side rooms)
const fxBlob = { mesh: null };
function fxBuildBlobs() {
  const boxes = [], bb = new THREE.Box3(), ws = new Set(worldStatic), actorGroups = new Set([...actors.values()].map(a => a.group));
  for (const o of scene.children) {
    if (ws.has(o) || actorGroups.has(o) || o === fxBlob.mesh || o.name === 'fxMerged' || o.userData.r5 || o.matrixAutoUpdate !== false) continue;   // ROOMS5ART wrappers carry their own grime
    o.updateMatrixWorld(true);
    o.traverseVisible(c => {
      const m = c.material; if (!c.isMesh || c.isInstancedMesh || !m || Array.isArray(m) || m.transparent || !m.isMeshStandardMaterial) return;
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      bb.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld);
      const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
      if (bb.min.y > 0.08 || bb.max.y - bb.min.y < 0.3 || w < 0.2 || d < 0.2 || w > 3.2 || d > 3.2) return;
      boxes.push([bb.min.x, bb.min.z, bb.max.x, bb.max.z]);
    });
  }
  const [vx, vz] = rc(WORLD.VAULT), pd = WORLD.PILLAR_D; for (const sx of [-1, 1]) for (const sz of [-1, 1]) boxes.push([vx + sx * pd - 0.75, vz + sz * pd - 0.75, vx + sx * pd + 0.75, vz + sz * pd + 0.75]);   // vault pillars
  for (let merged = true; merged;) {   // union overlapping footprints so one prop gets one blob (capped at 4 m)
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a[0] > b[2] + 0.05 || b[0] > a[2] + 0.05 || a[1] > b[3] + 0.05 || b[1] > a[3] + 0.05) continue;
      const u = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
      if (u[2] - u[0] > 4 || u[3] - u[1] > 4) continue;
      boxes[i] = u; boxes.splice(j, 1); merged = true; break;
    }
  }
  if (fxBlob.mesh) { scene.remove(fxBlob.mesh); fxBlob.mesh.dispose(); }
  if (!fxBlob.mat) {
    const t = canvasTex(64, 64, (g, w, h) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.45, 'rgba(0,0,0,.7)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    fxBlob.mat = new THREE.MeshBasicMaterial({ color: 0x000000, map: t, transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, fog: false });
    fxBlob.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  const m = fxBlob.mesh = new THREE.InstancedMesh(fxBlob.geo, fxBlob.mat, Math.max(1, boxes.length));
  boxes.forEach((b, i) => { _o.position.set((b[0] + b[2]) / 2, 0.008, (b[1] + b[3]) / 2); _o.rotation.set(0, 0, 0); _o.scale.set((b[2] - b[0]) * 1.45 + 0.25, 1, (b[3] - b[1]) * 1.45 + 0.25); _o.updateMatrix(); m.setMatrixAt(i, _o.matrix); });
  m.count = boxes.length; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.renderOrder = 1; m.matrixAutoUpdate = false; scene.add(m);
  fxBlob.count = boxes.length;
}
fxBuildBlobs();
layoutHooks.push(() => { fxCull.cls = new WeakMap(); try { fxBuildBlobs(); } catch (e) { console.warn('contact shadows skipped', e); } fxApplyQuality(true); });
GK.gfx = { get fx() { return fx; }, cull: fxCull, merge: fxMergeStats, blob: fxBlob, quality: fxQ };   // test hook
// FX-END
// ROOMART-BEGIN (room art: floor trims, skirting caps, ceiling beams, wall seams, door hazard stripes, goblin graffiti decals, scattered props, vault treasure dressing, chest/mystery/merchant mood accents.
// Visual only, no collision, no new lights. Per room the geometry is baked into a few merged static meshes (vertex-coloured solid, gold, ceiling, alpha decals, emissive accents) so the FX room culling handles them.
// Layout is seeded from the room key, so every client sees the same rooms without network traffic. Hook: ROOMART.init() below (it also registers one layoutHooks entry).)
const ROOMART = (() => {
  const V3 = THREE.Vector3, PI = Math.PI;
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mul = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const BOXG = new THREE.BoxGeometry(1, 1, 1), CYLG = new THREE.CylinderGeometry(1, 1, 1, 10, 1), CONEG = new THREE.CylinderGeometry(0, 1, 1, 8, 1), SPHG = new THREE.SphereGeometry(1, 8, 6),
    HEMG = new THREE.SphereGeometry(1, 10, 5, 0, PI * 2, 0, PI / 2), LINKG = new THREE.TorusGeometry(1, 0.2, 4, 8), ARCG = new THREE.TorusGeometry(1, 0.09, 4, 10, PI), OCTG = new THREE.SphereGeometry(1, 4, 2);
  const _v = new V3(), _w = new V3(), _n3 = new THREE.Matrix3(), _M = new THREE.Matrix4(), _Q = new THREE.Quaternion(), _E = new THREE.Euler(0, 0, 0, 'YXZ'), _P = new V3(), _S = new V3();
  class Acc {   // merged geometry builder; R = room matrix (local -> world)
    constructor(R) { this.R = R; this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.cnt = 0; }
    add(geo, m, col) {
      const pa = geo.attributes.position, na = geo.attributes.normal, ua = geo.attributes.uv, ix = geo.index, base = this.cnt; _n3.getNormalMatrix(m);
      for (let k = 0; k < pa.count; k++) {
        _v.fromBufferAttribute(pa, k).applyMatrix4(m); this.p.push(_v.x, _v.y, _v.z);
        _w.fromBufferAttribute(na, k).applyMatrix3(_n3).normalize(); this.n.push(_w.x, _w.y, _w.z);
        this.u.push(ua.getX(k), ua.getY(k)); this.c.push(col.r, col.g, col.b);
      }
      for (let k = 0; k < ix.count; k++) this.i.push(ix.getX(k) + base);
      this.cnt += pa.count;
    }
    quad(c, n, up, hw, hh, rect, col) {   // decal quad in room-local space; n = facing normal, up = image up (perpendicular to n)
      const right = new V3().crossVectors(up, n), a = c.clone().addScaledVector(right, -hw).addScaledVector(up, -hh), b = c.clone().addScaledVector(right, hw).addScaledVector(up, -hh),
        d = c.clone().addScaledVector(right, hw).addScaledVector(up, hh), e = c.clone().addScaledVector(right, -hw).addScaledVector(up, hh);
      const nw = n.clone().transformDirection(this.R), uv = [rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]], base = this.cnt;
      [a, b, d, e].forEach((q, k) => { q.applyMatrix4(this.R); this.p.push(q.x, q.y, q.z); this.n.push(nw.x, nw.y, nw.z); this.u.push(uv[k * 2], uv[k * 2 + 1]); this.c.push(col.r, col.g, col.b); });
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3); this.cnt += 4;
    }
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
      g.computeBoundingSphere(); g.computeBoundingBox(); return g;
    }
  }
  const put = (a, g, x, y, z, rx, ry, rz, sx, sy, sz, c) => { _E.set(rx, ry, rz); _Q.setFromEuler(_E); _M.compose(_P.set(x, y, z), _Q, _S.set(sx, sy, sz)); _M.premultiply(a.R); a.add(g, _M, c); };
  const cv = (hex, rnd, a = 0.12) => new THREE.Color(hex).multiplyScalar(1 + (rnd() - 0.5) * 2 * a);
  const rot = (x, z, yaw) => [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];   // local offset -> offset after yaw about y
  const WHITE = new THREE.Color(0xffffff);

  // ---- materials and textures
  const solidM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.45, side: THREE.DoubleSide });
  const goldVM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 1, envMapIntensity: 1.4, emissive: 0x3a2000, emissiveIntensity: 0.6 });
  const MOOD = { chest: 0xffb02e, mystery: 0xa04dff, merchant: 0x22e0cc };
  const moodM = {}; for (const k in MOOD) moodM[k] = new THREE.MeshStandardMaterial({ color: 0x15110c, emissive: MOOD[k], emissiveIntensity: 2.3, roughness: 0.55 });
  const AW = 1024, AH = 2048;
  const CELLS = { gob: [0, 0, 512, 256], crown: [512, 0, 256, 256], tally: [768, 0, 256, 256], arrow: [0, 256, 256, 256], mine: [256, 256, 256, 256], king: [512, 256, 512, 256], haz: [0, 512, 1024, 128], kingme: [0, 640, 512, 256], face: [512, 640, 256, 256], scr: [768, 640, 256, 256], grime: [0, 896, 512, 128], scuff: [512, 896, 256, 128], crack: [768, 896, 256, 128], warrR: [0, 1024, 512, 256], warrL: [512, 1024, 512, 256], path: [0, 1280, 256, 256], drag: [256, 1280, 256, 256], claw: [0, 1536, 256, 256], scorch: [256, 1536, 256, 256], sawdust: [512, 1536, 512, 128], rm0: [0, 1792, 128, 128], rm1: [128, 1792, 128, 128], rm2: [256, 1792, 128, 128], rm3: [384, 1792, 128, 128], rm5: [512, 1792, 128, 128], rm6: [640, 1792, 128, 128], rm7: [768, 1792, 128, 128], rm8: [896, 1792, 128, 128] };
  // ROOMID: every grid room gets its own paint colour (wainscot band, floor inlay, pipe collars, a stencilled room number): the same white facility, but you can tell where you are
  const ROOM_ACC = { 0: 0x6f9a86, 1: 0x6f8fb4, 2: 0xc27c5e, 3: 0xa7799b, 5: 0xcba44a, 6: 0x5f9ea0, 7: 0xbb6f7a, 8: 0x8ea352 };
  const accOf = key => ROOM_ACC[key] == null ? null : new THREE.Color(ROOM_ACC[key]);
  const SIZES = { gob: [1.5, 0.75], crown: [0.75, 0.75], tally: [0.7, 0.7], arrow: [0.95, 0.95], mine: [0.8, 0.8], king: [1.5, 0.75], warr: [1.6, 0.8], kingme: [2.0, 1.0], face: [0.9, 0.9], scr: [0.9, 0.9], warrR: [1.6, 0.8], warrL: [1.6, 0.8] };
  const GW = { gob: 4.0, crown: 2.0, tally: 2.0, mine: 2.2, king: 4.2, kingme: 4.5, face: 2.6, scr: 2.4, warr: 3.4 };   // wall graffiti widths in metres (readable from across the room)
  const uvr = k => { const [x, y, w, h] = CELLS[k]; return [(x + 2) / AW, 1 - (y + h - 2) / AH, (x + w - 2) / AW, 1 - (y + 2) / AH]; };
  const atlas = canvasTex(AW, AH, (g, w, h) => {
    const rnd = mul(0xC0FFEE), INK = 'rgba(34,38,34,0.92)', RED = 'rgba(150,34,24,0.93)';
    g.clearRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round';
    const cell = (k, fn, wear = true) => {
      const [x, y, cw, ch] = CELLS[k]; g.save(); g.beginPath(); g.rect(x, y, cw, ch); g.clip(); g.translate(x, y); fn(cw, ch);
      if (wear) { g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < cw * ch / 450; i++) { g.globalAlpha = 0.35 + rnd() * 0.55; g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 3, 1 + rnd() * 2); } }
      g.restore();
    };
    const sl = (x0, y0, x1, y1, lw, col) => { g.strokeStyle = col; for (let p = 0; p < 2; p++) { g.lineWidth = lw * (p ? 0.55 : 1); g.beginPath(); g.moveTo(x0 + (rnd() - 0.5) * 3, y0 + (rnd() - 0.5) * 3); g.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 7, (y0 + y1) / 2 + (rnd() - 0.5) * 7, x1 + (rnd() - 0.5) * 3, y1 + (rnd() - 0.5) * 3); g.stroke(); } };
    const scrawl = (txt, cx, cy, size, col) => {
      g.font = `900 ${size}px "Comic Sans MS","Marker Felt","Chalkboard SE",Impact,sans-serif`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 2;
      let tw = 0; const ws = [...txt].map(c => { const m = g.measureText(c).width; tw += m; return m; }); let x = cx - tw / 2;
      [...txt].forEach((c, i) => { g.save(); g.translate(x, cy + (rnd() - 0.5) * size * 0.2); g.rotate((rnd() - 0.5) * 0.3); g.fillText(c, 0, 0); g.strokeText(c, 0, 0); g.restore(); x += ws[i]; });
    };
    const face = (x, y, r, col) => { g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 4; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); sl(x - r, y - r * 0.2, x - r * 1.6, y - r * 0.9, 4, col); sl(x + r, y - r * 0.2, x + r * 1.6, y - r * 0.9, 4, col); for (const s of [-1, 1]) { g.beginPath(); g.arc(x + s * r * 0.4, y - r * 0.15, r * 0.14, 0, 7); g.fill(); } sl(x - r * 0.4, y + r * 0.45, x + r * 0.4, y + r * 0.45, 4, col); };
    cell('gob', () => { scrawl('GOB WOZ ERE', 256, 100, 80, RED); sl(60, 158, 440, 164, 6, RED); face(256, 212, 20, INK); });
    cell('crown', () => {
      g.strokeStyle = RED; g.lineWidth = 8; const pts = [[50, 190], [40, 80], [95, 135], [128, 50], [160, 135], [215, 80], [206, 190]];
      for (let p = 0; p < 2; p++) { g.beginPath(); pts.forEach(([x, y], i) => { x += (rnd() - 0.5) * 6; y += (rnd() - 0.5) * 6; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); }
      sl(50, 190, 206, 192, 8, RED); for (const x of [128, 60, 196]) { g.fillStyle = RED; g.beginPath(); g.arc(x, 172, 7, 0, 7); g.fill(); }
      for (let k = 0; k < 6; k++) { const x = 50 + rnd() * 156, l = 12 + rnd() * 34; sl(x, 194, x + (rnd() - 0.5) * 3, 194 + l, 4, RED); }
    });
    cell('tally', () => { for (let gI = 0; gI < 3; gI++) { const ox = 30 + (gI % 2) * 110, oy = 28 + gI * 72; for (let k = 0; k < 4; k++) sl(ox + k * 20, oy, ox + k * 20 + (rnd() - 0.5) * 4, oy + 54, 5, INK); sl(ox - 8, oy + 44, ox + 70, oy + 8, 5, INK); } });
    cell('arrow', () => {   // arrow in the middle, VAULT readable from either end (the far copy is upside down on purpose)
      sl(128, 190, 128, 70, 12, RED); sl(128, 52, 76, 112, 12, RED); sl(128, 52, 180, 112, 12, RED); scrawl('VAULT', 128, 236, 42, INK);
      g.save(); g.translate(128, 20); g.rotate(Math.PI); scrawl('VAULT', 0, 0, 42, INK); g.restore();
    });
    cell('mine', () => { face(128, 70, 26, INK); scrawl('MINE!!', 128, 170, 78, INK); sl(30, 222, 226, 214, 5, INK); });
    cell('king', () => { scrawl('KING SMELZ', 256, 96, 74, INK); sl(20, 96, 490, 100, 6, RED); sl(20, 120, 490, 70, 5, RED); face(256, 200, 22, RED); });
    // ---- art pass 2: three hand-drawn graffiti styles (scratched into the paint, red paint with drips, smudged charcoal) and wall wear
    const scr = (x0, y0, x1, y1, lw) => {   // scratched: two jittery dark gouges and a pale chip beside them
      for (let p = 0; p < 3; p++) {
        const j = () => (rnd() - 0.5) * 3, o = p === 2 ? 1.6 : 0;
        g.strokeStyle = p === 2 ? 'rgba(255,255,255,0.55)' : 'rgba(46,50,54,0.9)'; g.lineWidth = p === 2 ? lw * 0.5 : lw * (1 - p * 0.35); g.beginPath();
        g.moveTo(x0 + j() + o, y0 + j() + o); g.quadraticCurveTo((x0 + x1) / 2 + j() * 2 + o, (y0 + y1) / 2 + j() * 2 + o, x1 + j() + o, y1 + j() + o); g.stroke();
      }
    };
    const drip = (x, y, len, lw, col) => { g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y + len); g.stroke(); g.beginPath(); g.arc(x, y + len, lw * 0.85, 0, 7); g.fill(); };
    const smudge = (pts, lw) => {   // broad smeared charcoal stroke through the points
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round'; g.shadowColor = 'rgba(50,42,36,0.8)'; g.shadowBlur = 9;
      for (let p = 0; p < 3; p++) { g.strokeStyle = `rgba(${52 + p * 8},${46 + p * 6},${42 + p * 5},${0.5 - p * 0.1})`; g.lineWidth = lw * (1.15 - p * 0.25); g.beginPath(); pts.forEach(([x, y], i) => { x += (rnd() - 0.5) * 3; y += (rnd() - 0.5) * 3; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
      g.restore();
    };
    cell('kingme', () => {   // red paint, crude crown, drips
      const P = 'rgba(158,30,24,0.95)', pts = [[196, 96], [186, 36], [226, 70], [256, 18], [286, 70], [326, 36], [316, 96]];
      g.strokeStyle = P; g.lineWidth = 11; for (let q = 0; q < 2; q++) { g.beginPath(); pts.forEach(([x, y], i) => { x += (rnd() - 0.5) * 5; y += (rnd() - 0.5) * 5; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke(); }
      for (const x of [226, 256, 286]) { g.fillStyle = P; g.beginPath(); g.arc(x, 84, 6, 0, 7); g.fill(); }
      scrawl('KING ME', 256, 160, 104, P);
      for (let k = 0; k < 7; k++) drip(64 + rnd() * 384, 196 + rnd() * 10, 14 + rnd() * 44, 4 + rnd() * 3, P);
    });
    cell('face', () => {   // charcoal goblin face
      smudge([[128, 30], [70, 50], [42, 110], [60, 180], [128, 226], [196, 180], [214, 110], [186, 50], [128, 30]], 13);
      smudge([[46, 104], [8, 70], [30, 132]], 10); smudge([[210, 104], [248, 70], [226, 132]], 10);
      smudge([[76, 96], [112, 112]], 14); smudge([[180, 96], [144, 112]], 14);
      g.fillStyle = 'rgba(40,34,30,0.8)'; for (const x of [96, 160]) { g.beginPath(); g.arc(x, 128, 9, 0, 7); g.fill(); }
      smudge([[128, 120], [140, 158], [120, 164]], 9);
      smudge([[78, 190], [104, 202], [128, 196], [152, 202], [178, 190]], 10); for (const x of [96, 116, 140, 160]) smudge([[x, 196], [x + 4, 216]], 7);
    });
    cell('scr', () => {   // scratched tally, six gates of five
      for (let row = 0; row < 3; row++) for (let gI = 0; gI < 2; gI++) {
        const ox = 26 + gI * 118, oy = 26 + row * 78;
        for (let k = 0; k < 4; k++) scr(ox + k * 22, oy, ox + k * 22 + (rnd() - 0.5) * 6, oy + 58, 5);
        scr(ox - 10, oy + 46, ox + 78, oy + 8, 5);
      }
    });
    const arrowCell = dir => (cw, ch) => {   // wide arrow with VAULT above it, pointing right (dir 1) or left (dir -1)
      const sx = x => dir > 0 ? x : cw - x, P = 'rgba(150,34,24,0.93)';
      sl(sx(40), 168, sx(430), 160, 12, P); sl(sx(430), 160, sx(350), 100, 12, P); sl(sx(430), 160, sx(350), 222, 12, P);
      scrawl('VAULT', 256, 70, 78, 'rgba(34,38,34,0.92)');
    };
    cell('warrR', arrowCell(1)); cell('warrL', arrowCell(-1));
    cell('grime', (cw, ch) => {   // dirt gradient for the bottom of the walls
      const gr = g.createLinearGradient(0, ch, 0, 0); gr.addColorStop(0, 'rgba(62,52,40,0.62)'); gr.addColorStop(0.18, 'rgba(70,60,46,0.4)'); gr.addColorStop(0.6, 'rgba(80,70,56,0.1)'); gr.addColorStop(1, 'rgba(80,70,56,0)');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 26; i++) { const x = rnd() * cw, y = ch - rnd() * 40, rr = 14 + rnd() * 34, bl = g.createRadialGradient(x, y, 0, x, y, rr); bl.addColorStop(0, `rgba(50,40,30,${0.12 + rnd() * 0.16})`); bl.addColorStop(1, 'rgba(50,40,30,0)'); g.fillStyle = bl; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      for (let i = 0; i < 22; i++) { const x = rnd() * cw, l = 18 + rnd() * 80; g.strokeStyle = `rgba(60,50,38,${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 3; g.beginPath(); g.moveTo(x, ch); g.lineTo(x + (rnd() - 0.5) * 4, ch - l); g.stroke(); }
    }, false);
    cell('scuff', (cw, ch) => {   // boot and crate scuffs
      for (let i = 0; i < 9; i++) { const x = 20 + rnd() * 200, y = 14 + rnd() * 100, a = -0.5 + rnd() * 0.4, l = 30 + rnd() * 70; g.strokeStyle = `rgba(40,40,44,${0.18 + rnd() * 0.3})`; g.lineWidth = 2 + rnd() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 2; i++) { const x = 40 + rnd() * 170, y = 30 + rnd() * 70; g.strokeStyle = 'rgba(20,20,24,0.45)'; g.lineWidth = 7 + rnd() * 4; g.beginPath(); g.arc(x, y, 18 + rnd() * 16, 0.2, 1.7); g.stroke(); }
    }, false);
    cell('crack', (cw, ch) => {   // cracked floor tile cluster: soft grey, thick at the impact point, tapering to hairlines
      const crack = (x, y, a, n, lw, depth) => {
        const pts = [[x, y]];
        for (let q = 0; q < n; q++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * (6 + rnd() * 10); y += Math.sin(a) * (4 + rnd() * 7); pts.push([x, y]); if (depth < 2 && rnd() < 0.18) crack(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.5), 5 + ((rnd() * 6) | 0), lw * 0.6, depth + 1); }
        for (let i = 1; i < pts.length; i++) {
          const k = Math.max(0.12, 1 - i / n * 0.9), seg = (col, wd, o) => { g.strokeStyle = col; g.lineWidth = wd; g.beginPath(); g.moveTo(pts[i - 1][0] + o, pts[i - 1][1] + o); g.lineTo(pts[i][0] + o, pts[i][1] + o); g.stroke(); };
          seg('rgba(150,152,158,0.10)', lw * k * 3.2, 0); seg('rgba(128,130,136,0.4)', lw * k, 0); seg('rgba(255,255,255,0.3)', lw * k * 0.4, 1);
        }
      };
      for (let k = 0; k < 6; k++) crack(128, 64, k * 1.05 + rnd() * 0.5, 7 + ((rnd() * 6) | 0), 5.5, 0);
      g.fillStyle = 'rgba(130,132,138,0.16)'; g.beginPath(); g.ellipse(128, 64, 10, 7, 0, 0, 7); g.fill();
    }, false);
    const fadeEnds = (cw, ch) => { g.globalCompositeOperation = 'destination-in'; const gy = g.createLinearGradient(0, 0, 0, ch); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.14, 'rgba(0,0,0,1)'); gy.addColorStop(0.86, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gy; g.fillRect(0, 0, cw, ch); g.globalCompositeOperation = 'source-over'; };
    cell('path', (cw, ch) => {   // worn walking line: darker band, long scuff streaks, boot marks; x across the path, y along it
      const gx = g.createLinearGradient(0, 0, cw, 0); gx.addColorStop(0, 'rgba(70,64,56,0)'); gx.addColorStop(0.22, 'rgba(70,64,56,0.10)'); gx.addColorStop(0.5, 'rgba(60,54,46,0.2)'); gx.addColorStop(0.78, 'rgba(70,64,56,0.10)'); gx.addColorStop(1, 'rgba(70,64,56,0)');
      g.fillStyle = gx; g.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 34; i++) { const x = 40 + rnd() * 176, y = rnd() * ch, l = 20 + rnd() * 90; g.strokeStyle = `rgba(40,36,30,${0.05 + rnd() * 0.13})`; g.lineWidth = 1 + rnd() * 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 8, y + l); g.stroke(); }
      for (let i = 0; i < 18; i++) { const x = 50 + rnd() * 156, y = rnd() * ch; g.strokeStyle = 'rgba(30,28,24,0.2)'; g.lineWidth = 3 + rnd() * 3; g.beginPath(); g.arc(x, y, 6 + rnd() * 8, 0.3, 2.2); g.stroke(); }
      fadeEnds(cw, ch);
    }, false);
    cell('drag', (cw, ch) => {   // something heavy dragged across the floor: two smeared lanes
      g.lineCap = 'round'; for (const ox of [-20, 22]) { g.strokeStyle = 'rgba(70,58,46,0.32)'; g.lineWidth = 16; g.shadowColor = 'rgba(70,58,46,0.6)'; g.shadowBlur = 10; g.beginPath(); for (let y = 0; y <= ch; y += 16) { const x = 128 + ox + Math.sin(y * 0.04 + ox) * 14; y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      g.shadowBlur = 0; for (let i = 0; i < 14; i++) { const x = 70 + rnd() * 116, y = rnd() * ch; g.strokeStyle = 'rgba(40,34,28,0.2)'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 6, y + 20 + rnd() * 40); g.stroke(); }
      fadeEnds(cw, ch);
    }, false);
    cell('claw', () => {   // four parallel gouges ripped across the wall
      for (let k = 0; k < 4; k++) {
        const x0 = 46 + k * 40, y0 = 14 + (k % 2) * 8, x1 = x0 + 36 + rnd() * 10, y1 = 238 - (k % 2) * 10;
        for (let p = 0; p < 3; p++) { g.strokeStyle = p === 2 ? 'rgba(255,255,255,0.35)' : p === 1 ? 'rgba(40,30,36,0.55)' : 'rgba(20,14,18,0.9)'; g.lineWidth = p === 0 ? 9 - k * 0.6 : p === 1 ? 14 : 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 + (p === 2 ? 3 : 0), y0); g.quadraticCurveTo((x0 + x1) / 2 + (rnd() - 0.5) * 14, (y0 + y1) / 2, x1 + (p === 2 ? 3 : 0), y1); g.stroke(); }
        for (let c = 0; c < 6; c++) { const t = rnd(); g.fillStyle = 'rgba(30,24,28,0.7)'; g.fillRect(x0 + (x1 - x0) * t + (rnd() - 0.5) * 8, y0 + (y1 - y0) * t, 3, 6); }
      }
    }, false);
    cell('scorch', (cw, ch) => {   // soft burnt patch
      const gr = g.createRadialGradient(cw / 2, ch / 2, 6, cw / 2, ch / 2, cw / 2); gr.addColorStop(0, 'rgba(20,14,12,0.7)'); gr.addColorStop(0.5, 'rgba(30,22,18,0.35)'); gr.addColorStop(1, 'rgba(30,22,18,0)'); g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(24,18,14,${0.15 + rnd() * 0.3})`; g.beginPath(); g.arc(cw / 2 + (rnd() - 0.5) * cw * 0.7, ch / 2 + (rnd() - 0.5) * ch * 0.7, 2 + rnd() * 7, 0, 7); g.fill(); }
    }, false);
    cell('sawdust', (cw, ch) => {   // shavings and dust drifts
      for (let i = 0; i < 700; i++) { const x = cw * (0.5 + (rnd() + rnd() + rnd() - 1.5) * 0.36), y = ch * (0.5 + (rnd() + rnd() - 1) * 0.5); g.fillStyle = `rgba(${196 + rnd() * 30 | 0},${160 + rnd() * 30 | 0},${100 + rnd() * 30 | 0},${0.25 + rnd() * 0.55})`; g.fillRect(x, y, 2 + rnd() * 5, 1 + rnd() * 2); }
    }, false);
    cell('haz', (cw, ch) => {   // yellow/black safety stripes, 8:1, worn
      g.fillStyle = '#17171a'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#e1ad1c';
      for (let x = -128; x < cw + 128; x += 128) { g.beginPath(); g.moveTo(x, ch); g.lineTo(x + 64, ch); g.lineTo(x + 192, 0); g.lineTo(x + 128, 0); g.closePath(); g.fill(); }
      for (let i = 0; i < 900; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,45,15,0.28)' : 'rgba(255,240,200,0.12)'; g.fillRect(rnd() * cw, rnd() * ch, 1 + rnd() * 4, 1 + rnd() * 3); }
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, cw, 5); g.fillRect(0, ch - 5, cw, 5);
    }, false);
    for (const key in ROOM_ACC) cell('rm' + key, (cw, ch) => {   // ROOMID: stencilled room number in the room's own paint colour, stencil bridges cut through the digit
      const col = '#' + ROOM_ACC[key].toString(16).padStart(6, '0');
      g.fillStyle = col; g.fillRect(14, 12, cw - 28, 6); g.fillRect(14, ch - 18, cw - 28, 6);
      g.font = '900 24px Impact,"Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('R O O M', cw / 2, 33);
      g.font = '900 84px Impact,"Arial Black",sans-serif'; g.fillText(String(+key + 1), cw / 2, 80);
      g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 71, cw, 3); g.fillRect(0, 90, cw, 3); g.globalCompositeOperation = 'source-over';
    });
  });
  atlas.wrapS = atlas.wrapT = THREE.ClampToEdgeWrapping;
  const emberM = new THREE.MeshStandardMaterial({ color: 0x1a0d06, emissive: 0xff5a14, emissiveIntensity: 2.6, roughness: 0.9 });   // cold-campfire embers: emissive only, never a light
  const decalM = new THREE.MeshStandardMaterial({ map: atlas, transparent: true, depthWrite: false, roughness: 1, metalness: 0, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  decalM.vertexColors = true; decalM.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.a *= vColor.r;'); }; decalM.customProgramCacheKey = () => 'roomartDecal2';   // each decal's opacity comes from its vertex colour

  // ---- prop builders (A = {S solid, G gold, C ceiling}); x,z local, y up
  const GOLD = [0xffc83a, 0xf0b02a, 0xffd860, 0xd89a1c];
  const coin = (A, x, y, z, rnd, tilt = 0) => put(A.G, CYLG, x, y, z, (rnd() - 0.5) * tilt, rnd() * 6.28, (rnd() - 0.5) * tilt, 0.062, 0.011, 0.062, cv(GOLD[(rnd() * 4) | 0], rnd, 0.08));
  const coinScatter = (A, x, z, n, spread, rnd) => { for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = spread * Math.sqrt(rnd()), stack = rnd() < 0.25; coin(A, x + Math.cos(a) * d, 0.012 + (stack ? 0.012 : 0), z + Math.sin(a) * d, rnd, stack ? 0.5 : 0.15); } };
  const coinPile = (A, x, z, r, h, rnd) => {
    put(A.G, SPHG, x, 0, z, 0, 0, 0, r, h, r, cv(0xd8a028, rnd, 0.1));
    const n = Math.round(r * r * 200); for (let i = 0; i < n; i++) { const t = rnd() * 6.28, d = r * Math.sqrt(rnd()) * 0.95, y = h * Math.sqrt(Math.max(0, 1 - (d / r) ** 2)); coin(A, x + Math.cos(t) * d, y + 0.01, z + Math.sin(t) * d, rnd, 0.8); }
    coinScatter(A, x, z, Math.round(r * 9), r * 1.7, rnd);
  };
  const bone = (A, x, z, yaw, rnd) => {
    const c = cv(0xe6dcc0, rnd, 0.06), L = 0.34 + rnd() * 0.18, [dx, dz] = rot(L / 2, 0, yaw);
    put(A.S, CYLG, x, 0.03, z, 0, yaw, PI / 2, 0.021, L, 0.021, c); for (const s of [-1, 1]) for (const q of [-0.025, 0.025]) { const [ex, ez] = rot(0, q, yaw); put(A.S, SPHG, x + s * dx + ex, 0.032, z + s * dz + ez, 0, 0, 0, 0.034, 0.03, 0.034, c); }
  };
  const skull = (A, x, z, yaw, rnd) => {
    const c = cv(0xe9e0c6, rnd, 0.05), d = cv(0x1a1a18, rnd, 0.1);
    put(A.S, SPHG, x, 0.085, z, 0, yaw, 0, 0.1, 0.085, 0.11, c);
    let [ox, oz] = rot(0, 0.07, yaw); put(A.S, BOXG, x + ox, 0.032, z + oz, 0, yaw, 0, 0.1, 0.04, 0.09, c);
    for (const s of [-1, 1]) { [ox, oz] = rot(s * 0.04, 0.085, yaw); put(A.S, SPHG, x + ox, 0.1, z + oz, 0, 0, 0, 0.026, 0.026, 0.02, d); }
  };
  const ribs = (A, x, z, yaw, rnd) => { const c = cv(0xdcd2b6, rnd, 0.06); for (let i = 0; i < 4; i++) { const [ox, oz] = rot(i * 0.065, 0, yaw); put(A.S, ARCG, x + ox, 0, z + oz, 0, yaw + PI / 2, (rnd() - 0.5) * 0.3, 0.13, 0.11, 0.13, c); } };
  const boneSet = (A, x, z, rnd) => {
    const k = rnd(), yaw = rnd() * 6.28;
    if (k < 0.35) { skull(A, x, z, yaw, rnd); bone(A, x + 0.25, z + 0.1, rnd() * 6.28, rnd); }
    else if (k < 0.7) { ribs(A, x, z, yaw, rnd); bone(A, x - 0.2, z + 0.2, rnd() * 6.28, rnd); bone(A, x + 0.1, z - 0.25, rnd() * 6.28, rnd); }
    else { for (let i = 0; i < 3 + ((rnd() * 3) | 0); i++) bone(A, x + (rnd() - 0.5) * 0.7, z + (rnd() - 0.5) * 0.7, rnd() * 6.28, rnd); if (rnd() < 0.6) skull(A, x + 0.3, z - 0.2, rnd() * 6.28, rnd); }
  };
  const bucket = (A, x, z, yaw, rnd) => {
    const m = cv(0x8b949d, rnd, 0.08), dk = cv(0x23262b, rnd, 0.1), w = (u, v) => { const [a, b] = rot(u, v, yaw); return [x + a, z + b]; };
    let [px, pz] = w(0, 0); put(A.S, CYLG, px, 0.195, pz, 0, yaw, PI / 2 + 0.04, 0.19, 0.32, 0.19, m);       // lying on its side, mouth toward -x
    [px, pz] = w(-0.158, 0); put(A.S, CYLG, px, 0.198, pz, 0, yaw, PI / 2 + 0.04, 0.17, 0.02, 0.17, dk);
    [px, pz] = w(0.16, 0.34); put(A.S, ARCG, px, 0.012, pz, -PI / 2, yaw + 0.5, 0, 0.17, 0.17, 0.17, cv(0x2f343b, rnd, 0.1));   // bail handle on the floor
    [px, pz] = w(-0.5, 0.05); put(A.S, CYLG, px, 0.004, pz, 0, 0, 0, 0.42, 0.006, 0.3, cv(0x4a5864, rnd, 0.1));   // spilled puddle
  };
  const crate = (A, x, z, yaw, s, rnd) => {
    const wood = cv(0x8c6a45, rnd, 0.1), dk = cv(0x5b4228, rnd, 0.1);
    put(A.S, BOXG, x, s / 2, z, 0, yaw, 0, s, s, s, wood);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const [a, b] = rot(sx * s / 2, sz * s / 2, yaw); put(A.S, BOXG, x + a, s / 2, z + b, 0, yaw, 0, s * 0.1, s * 1.012, s * 0.1, dk); }
    for (const f of [0, 1]) { const [a, b] = f ? rot(s / 2, 0, yaw) : rot(0, s / 2, yaw); put(A.S, BOXG, x + a * 1.002, s / 2, z + b * 1.002, 0, yaw + (f ? PI / 2 : 0), PI / 4 * (f ? 1 : -1), s * 1.2, s * 0.09, s * 0.03, dk); }
    for (const q of [-0.3, 0, 0.3]) { const [a, b] = rot(0, q * s, yaw); put(A.S, BOXG, x + a, s * 1.006, z + b, 0, yaw, 0, s * 0.96, s * 0.012, s * 0.16, cv(0x9a7650, rnd, 0.1)); }
  };
  const sack = (A, x, z, rnd) => { put(A.S, SPHG, x, 0.17, z, 0, rnd() * 6, 0, 0.27, 0.19, 0.24, cv(0xb09a6e, rnd, 0.1)); put(A.S, CYLG, x, 0.35, z, 0, 0, 0, 0.07, 0.07, 0.07, cv(0x6a5a3a, rnd, 0.1)); };
  const chain = (A, x, z, len, rnd) => {
    const c = cv(0x2f343b, rnd, 0.1), n = Math.floor(len / 0.075), sw = (rnd() - 0.5) * 0.1;
    put(A.C, BOXG, x, H - 0.02, z, 0, 0, 0, 0.16, 0.04, 0.16, cv(0x1d2025, rnd, 0.1));
    for (let i = 0; i < n; i++) put(A.C, LINKG, x + sw * (i / n), H - 0.07 - i * 0.075, z, 0, (i % 2) * PI / 2, 0, 0.026, 0.045, 0.026, c);
    put(A.C, ARCG, x + sw, H - 0.07 - n * 0.075 - 0.02, z, PI, rnd() * 6, 0, 0.07, 0.07, 0.07, c);
  };
  const helmet = (A, x, z, yaw, rnd) => {
    const m = cv(0x56604c, rnd, 0.08), brass = cv(0x8a7a40, rnd, 0.1), bone2 = cv(0xe2d8b8, rnd, 0.05), w = (u, v) => { const [a, b] = rot(u, v, yaw); return [x + a, z + b]; };
    let [px, pz] = w(0, 0); put(A.S, HEMG, px, 0.17, pz, 0, yaw, -PI / 2 + 0.1, 0.17, 0.15, 0.17, m);
    put(A.S, LINKG, px, 0.17, pz, 0, yaw + PI / 2, 0, 0.17, 0.17, 0.17, brass);
    [px, pz] = w(0.0, 0.17); put(A.S, CONEG, px, 0.2, pz, PI / 2 - 0.2, yaw, 0, 0.045, 0.19, 0.045, bone2);              // one horn
    [px, pz] = w(0.0, -0.17); put(A.S, CONEG, px, 0.15, pz, -PI / 2, yaw, 0, 0.045, 0.05, 0.045, bone2);                  // snapped stub
    [px, pz] = w(0.3, -0.35); put(A.S, CONEG, px, 0.04, pz, 0, yaw + 1.3, PI / 2, 0.04, 0.14, 0.04, bone2);                // the snapped-off horn tip
    [px, pz] = w(0.12, 0.0); put(A.S, SPHG, px, 0.2, pz, 0, 0, 0, 0.05, 0.03, 0.05, cv(0x7a4a2a, rnd, 0.1));              // rust patch
  };

  // ---- art pass 2 props: the "story corner" pieces (all visual only, built from the same primitives, merged per room)
  const boneAt = (A, x, y, z, yaw, pitch, rnd) => {   // a bone lying (or leaning) at any angle, sometimes with a gnawed end
    const c = cv(0xe0d6ba, rnd, 0.07), L = 0.26 + rnd() * 0.2, [dx, dz] = rot(L / 2 * Math.cos(pitch), 0, yaw), dy = L / 2 * Math.sin(pitch);
    put(A.S, CYLG, x, y, z, 0, yaw, PI / 2 + pitch, 0.02, L, 0.02, c);
    for (const s of [-1, 1]) for (const q of [-0.024, 0.024]) { const [ex, ez] = rot(0, q, yaw); put(A.S, OCTG, x + s * dx + ex, y + s * dy, z + s * dz + ez, 0, 0, 0, 0.034, 0.032, 0.034, c); }
    if (rnd() < 0.5) put(A.S, OCTG, x + dx, y + dy, z + dz, 0, 0, 0, 0.028, 0.028, 0.028, cv(0x3a3226, rnd, 0.1));   // tooth-mark notch
  };
  const bonePile = (A, x, z, rnd) => {   // gnawed heap: criss-crossed bones in layers, skulls and a rib cage
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.28, d = 0.5 * Math.sqrt(rnd()), h = 0.04 + (1 - d / 0.5) * 0.17 + rnd() * 0.03; boneAt(A, x + Math.cos(a) * d, h, z + Math.sin(a) * d, rnd() * 6.28, (rnd() - 0.5) * 0.7, rnd); }
    skull(A, x - 0.35, z + 0.25, rnd() * 6.28, rnd); skull(A, x + 0.22, z - 0.3, rnd() * 6.28, rnd); ribs(A, x + 0.1, z + 0.38, rnd() * 6.28, rnd);
  };
  const barrelTipped = (A, x, z, yaw, rnd) => {   // lying on its side, mouth toward +u, coins spilled out of it
    const w = (u, v) => { const [a, b] = rot(u, v, yaw); return [x + a, z + b]; }, wood = cv(0x7a5634, rnd, 0.08), dk = cv(0x2d2f33, rnd, 0.06), R = 0.33, Lb = 0.82;
    let [px, pz] = w(0, 0); put(A.S, CYLG, px, R, pz, 0, yaw, PI / 2, R, Lb, R, wood);
    for (const u of [-0.3, 0, 0.3]) { [px, pz] = w(u, 0); put(A.S, CYLG, px, R, pz, 0, yaw, PI / 2, R + 0.016, 0.05, R + 0.016, dk); }
    [px, pz] = w(Lb / 2 - 0.02, 0); put(A.S, CYLG, px, R, pz, 0, yaw, PI / 2, R + 0.012, 0.04, R + 0.012, cv(0x4a3a28, rnd, 0.06));   // rim
    [px, pz] = w(Lb / 2 + 0.002, 0); put(A.S, CYLG, px, R, pz, 0, yaw, PI / 2, R - 0.05, 0.02, R - 0.05, cv(0x1b140c, rnd, 0.1));    // dark mouth
    [px, pz] = w(0.1, -0.2); put(A.S, BOXG, px, 0.016, pz, 0, yaw + 0.3, 0, 0.5, 0.03, 0.04, cv(0x5b4228, rnd, 0.1));                // a loose stave on the floor
    for (let i = 0; i < 18; i++) { const u = 0.5 + rnd() * 1.1, v = (rnd() - 0.5) * (0.3 + u * 0.55); [px, pz] = w(u, v); coin(A, px, 0.012 + (rnd() < 0.2 ? 0.012 : 0), pz, rnd, 0.3); }
    [px, pz] = w(0.78, 0.05); coinPile(A, px, pz, 0.24, 0.09, rnd);
  };
  const crateBroken = (A, x, z, yaw, s, rnd) => {   // smashed open: floor boards, two side panels, snapped posts, loose planks and straw everywhere
    const wood = cv(0x8c6a45, rnd, 0.1), dk = cv(0x5b4228, rnd, 0.1), w = (u, v) => { const [a, b] = rot(u, v, yaw); return [x + a, z + b]; };
    put(A.S, BOXG, x, 0.03, z, 0, yaw, 0, s, 0.05, s, dk);
    for (const sx of [-1, 1]) { const [a, b] = w(sx * s / 2, 0); put(A.S, BOXG, a, s * 0.35, b, 0, yaw, 0, 0.05, s * 0.7, s, wood); }
    { const [a, b] = w(0, -s / 2); put(A.S, BOXG, a, s * 0.2, b, 0, yaw, 0, s, s * 0.4, 0.05, wood); }
    for (const sx of [-1, 1]) { const [a, b] = w(sx * s / 2, -s / 2), h = s * (0.55 + rnd() * 0.35); put(A.S, BOXG, a, h / 2, b, 0, yaw, 0, 0.08, h, 0.08, dk); }
    for (let i = 0; i < 4; i++) { const [a, b] = w((rnd() - 0.5) * s * 1.6, s * 0.45 + rnd() * s * 0.9); put(A.S, BOXG, a, 0.02 + (i % 2) * 0.03, b, (rnd() - 0.5) * 0.15, yaw + (rnd() - 0.5) * 1.6, 0, s * (0.7 + rnd() * 0.3), 0.025, 0.11, cv(0x9a7650, rnd, 0.1)); }
    const strawC = [0xd8b955, 0xc9a944, 0xe4cb74];
    for (let i = 0; i < 34; i++) { const inside = i < 14, [a, b] = inside ? w((rnd() - 0.5) * s * 0.8, (rnd() - 0.5) * s * 0.7) : w((rnd() - 0.5) * s * 2, s * 0.5 + rnd() * s); put(A.S, BOXG, a, inside ? 0.06 + rnd() * s * 0.32 : 0.012 + rnd() * 0.03, b, (rnd() - 0.5) * 0.9, rnd() * 6.28, (rnd() - 0.5) * 0.9, 0.012, 0.012, 0.24 + rnd() * 0.22, cv(strawC[(rnd() * 3) | 0], rnd, 0.08)); }
  };
  const bedroll = (A, x, z, yaw, rnd) => {   // groundsheet, bunched blanket, pillow and a rolled end with a strap
    const w = (u, v) => { const [a, b] = rot(u, v, yaw); return [x + a, z + b]; }, blanket = cv([0x6b3a30, 0x3f5a3a, 0x5a4a2a][(rnd() * 3) | 0], rnd, 0.1), leather = cv(0x4a3a28, rnd, 0.08);
    let [px, pz] = w(0, 0); put(A.S, BOXG, px, 0.025, pz, 0, yaw, 0, 0.72, 0.05, 1.8, leather);
    [px, pz] = w(0, 0.12); put(A.S, BOXG, px, 0.07, pz, 0, yaw, 0, 0.62, 0.07, 1.25, blanket);
    [px, pz] = w(0.05, 0.3); put(A.S, SPHG, px, 0.1, pz, 0, yaw, 0.05, 0.26, 0.05, 0.34, blanket.clone().multiplyScalar(1.25));
    [px, pz] = w(0, -0.72); put(A.S, SPHG, px, 0.09, pz, 0, yaw, 0, 0.26, 0.08, 0.17, cv(0xcfc3a0, rnd, 0.05));
    [px, pz] = w(0, 0.84); put(A.S, CYLG, px, 0.12, pz, 0, yaw, PI / 2, 0.12, 0.7, 0.12, blanket); [px, pz] = w(0, 0.84 - 0.14); put(A.S, BOXG, px, 0.12, pz, 0, yaw, 0, 0.3, 0.27, 0.035, leather);
  };
  const coldFire = (A, x, z, rnd) => {   // stone ring, ash, charred logs, a few glowing embers (emissive mesh only, no light)
    const stone = [0x6b6e72, 0x80838a, 0x5a5d62];
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + rnd() * 0.2, rr = 0.42 + rnd() * 0.05; put(A.S, SPHG, x + Math.cos(a) * rr, 0.07, z + Math.sin(a) * rr, 0, rnd() * 6, 0, 0.12 + rnd() * 0.04, 0.08 + rnd() * 0.04, 0.11 + rnd() * 0.03, cv(stone[(rnd() * 3) | 0], rnd, 0.08)); }
    put(A.S, CYLG, x, 0.012, z, 0, 0, 0, 0.36, 0.024, 0.36, cv(0x3a3633, rnd, 0.06));
    for (let i = 0; i < 3; i++) put(A.S, CYLG, x, 0.075, z, 0, i * 2.1 + rnd() * 0.4, PI / 2 - 0.15 + rnd() * 0.1, 0.05, 0.62, 0.05, cv(0x241f1b, rnd, 0.1));
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, rr = 0.28 * Math.sqrt(rnd()); put(A.M, BOXG, x + Math.cos(a) * rr, 0.03 + rnd() * 0.07, z + Math.sin(a) * rr, rnd() * 3, rnd() * 3, rnd() * 3, 0.03 + rnd() * 0.035, 0.025 + rnd() * 0.02, 0.03 + rnd() * 0.03, WHITE); }
  };
  const shackles = (A, x, z, rnd) => {   // ceiling hook, a long chain, then two short chains ending in open cuffs
    const c = cv(0x2f343b, rnd, 0.1), len = 1.9 + rnd() * 0.8, n = Math.floor(len / 0.075);
    put(A.C, BOXG, x, H - 0.02, z, 0, 0, 0, 0.2, 0.04, 0.2, cv(0x1d2025, rnd, 0.1)); put(A.C, ARCG, x, H - 0.12, z, 0, rnd() * 6, 0, 0.09, 0.09, 0.09, cv(0x5a4632, rnd, 0.1));
    for (let i = 0; i < n; i++) put(A.C, LINKG, x, H - 0.2 - i * 0.075, z, 0, (i % 2) * PI / 2, 0, 0.026, 0.045, 0.026, c);
    const y0 = H - 0.2 - n * 0.075;
    for (const s of [-1, 1]) { for (let i = 0; i < 4; i++) put(A.C, LINKG, x + s * (0.04 + i * 0.045), y0 - 0.03 - i * 0.05, z, 0, (i % 2) * PI / 2, s * 0.6, 0.024, 0.04, 0.024, c); put(A.C, LINKG, x + s * 0.24, y0 - 0.26, z, 0, 0, 0, 0.1, 0.1, 0.1, cv(0x4a4f56, rnd, 0.08)); }
  };
  const barrelUpright = (A, x, z, rnd) => {   // standing barrel with two hoops and a half-lifted lid
    const wood = cv(0x7a5634, rnd, 0.08), dk = cv(0x2d2f33, rnd, 0.06);
    put(A.S, CYLG, x, 0.45, z, 0, 0, 0, 0.34, 0.9, 0.34, wood); for (const y of [0.18, 0.72]) put(A.S, CYLG, x, y, z, 0, 0, 0, 0.355, 0.05, 0.355, dk);
    put(A.S, CYLG, x + 0.12, 0.93, z + 0.04, 0, 0, 0.12, 0.33, 0.04, 0.33, cv(0x5b4228, rnd, 0.08));
  };
  const tripodPot = (A, x, z, rnd) => {   // three poles, a chain and a dented cooking pot over the cold fire
    const wood = cv(0x4a3a28, rnd, 0.08), a0 = rnd() * 6.28;
    for (let i = 0; i < 3; i++) { const a = a0 + i * 2.094, bx = x + Math.cos(a) * 0.62, bz = z + Math.sin(a) * 0.62, ax = x + Math.cos(a) * 0.05, az = z + Math.sin(a) * 0.05, h = 1.3, ln = Math.hypot(bx - ax, h, bz - az);
      put(A.S, CYLG, (bx + ax) / 2, h / 2, (bz + az) / 2, Math.acos(h / ln), Math.atan2(ax - bx, az - bz), 0, 0.025, ln, 0.025, wood); }
    for (let i = 0; i < 5; i++) put(A.S, LINKG, x, 1.22 - i * 0.07, z, 0, (i % 2) * PI / 2, 0, 0.022, 0.04, 0.022, cv(0x2f343b, rnd, 0.1));
    put(A.S, HEMG, x, 0.7, z, PI, 0, 0, 0.24, 0.2, 0.24, cv(0x2a2a2c, rnd, 0.08)); put(A.S, CYLG, x, 0.7, z, 0, 0, 0, 0.245, 0.03, 0.245, cv(0x3a3a3d, rnd, 0.08));
  };
  const logSeat = (A, x, z, yaw, rnd) => { put(A.S, CYLG, x, 0.13, z, 0, yaw, PI / 2, 0.13, 0.85, 0.13, cv(0x6a4a2e, rnd, 0.1)); put(A.S, CYLG, x + Math.cos(yaw) * 0.43, 0.13, z - Math.sin(yaw) * 0.43, 0, yaw, PI / 2, 0.1, 0.02, 0.1, cv(0xb8956a, rnd, 0.06)); };
  const tooth = (A, x, z, rnd) => put(A.S, CONEG, x, 0.025, z, PI / 2 - 0.1, rnd() * 6.28, 0, 0.022, 0.07, 0.022, cv(0xe8dfc2, rnd, 0.05));   // a knocked-out goblin tooth
  const earRing = (A, x, z, rnd) => { put(A.G, LINKG, x, 0.012, z, PI / 2, rnd() * 6.28, 0, 0.055, 0.055, 0.055, cv(0xf0b02a, rnd, 0.06)); if (rnd() < 0.5) put(A.G, LINKG, x + 0.07, 0.011, z + 0.03, PI / 2, rnd() * 6.28, 0, 0.04, 0.04, 0.04, cv(0xffc83a, rnd, 0.06)); };   // a dropped ear-ring
  const waterStain = (A, x, z, rnd) => {   // dried tide-mark rings on the ceiling
    const rx = 0.7 + rnd() * 0.7, rz = rx * (0.6 + rnd() * 0.5), yw = rnd() * 3;
    put(A.C, CYLG, x, H - 0.012, z, 0, yw, 0, rx, 0.004, rz, cv(0xb9a981, rnd, 0.04));
    put(A.C, CYLG, x, H - 0.0095, z, 0, yw, 0, rx * 0.9, 0.004, rz * 0.9, cv(0xd6cdb6, rnd, 0.03));
    put(A.C, CYLG, x + rx * 0.1, H - 0.0075, z, 0, yw, 0, rx * 0.55, 0.004, rz * 0.55, cv(0xc9bd9c, rnd, 0.04));
  };

  // ---- room geometry helpers (room-local frame: x east, z south; walls at +-hx / +-hz; wall 0 N, 1 S, 2 W, 3 E)
  const YAW = [0, 0, PI / 2, PI / 2], NRM = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const wp = (r, w, t, off) => w === 0 ? [t, -r.hz + off] : w === 1 ? [t, r.hz - off] : w === 2 ? [-r.hx + off, t] : [r.hx - off, t];
  const segs = (r, w, sh, ge = 0) => { const L = (w < 2 ? r.hx : r.hz) - sh, g = r.gaps[w] ? r.gaps[w] + ge : 0; return (g ? [[-L, -g], [g, L]] : [[-L, L]]).filter(s => s[1] - s[0] > 0.05); };
  const wbox = (a, r, w, t0, t1, y0, y1, o0, o1, col) => { const [x, z] = wp(r, w, (t0 + t1) / 2, (o0 + o1) / 2); put(a, BOXG, x, (y0 + y1) / 2, z, 0, YAW[w], 0, t1 - t0, y1 - y0, o1 - o0, col); };
  const pickSeg = (list, rnd) => { const tot = list.reduce((s, q) => s + q[1] - q[0], 0); if (tot <= 0) return null; let k = rnd() * tot; for (const q of list) { const l = q[1] - q[0]; if (k < l) return q[0] + k; k -= l; } return list[0][0]; };

  function buildRoom(r) {
    const rnd = mul(hashStr('roomart:' + r.key)), S = new Acc(r.R), G = new Acc(r.R), C = new Acc(r.R), D = new Acc(r.R), E = new Acc(r.R), A = { S, G, C, M: E };
    const big = r.vault, hx = r.hx, hz = r.hz;
    // 1. skirting cap, floor trim lines, safety corner squares
    const acc = r.kind === 'grid' && !big ? accOf(r.key) : null;   // ROOMID paint colour (null: vault, chest rooms)
    const capC = cv(0xcfd3d8, rnd, 0.03), lineC0 = cv(0x46515d, rnd, 0.04), lineC20 = cv(0xa8b0b8, rnd, 0.03), lineC = acc ? acc.clone().multiplyScalar(0.55) : lineC0, lineC2 = acc ? acc.clone().lerp(WHITE, 0.25) : lineC20;
    for (let w = 0; w < 4; w++) {
      for (const [a, b] of segs(r, w, 0.02)) wbox(S, r, w, a, b, 0.2, 0.285, 0, 0.09, capC);
      for (const [a, b] of segs(r, w, 0.46, 0.2)) { wbox(S, r, w, a, b, 0, 0.012, 0.42, 0.48, lineC); wbox(S, r, w, a, b, 0, 0.011, 0.5, 0.515, lineC2); }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(S, BOXG, sx * (hx - 0.45), 0.008, sz * (hz - 0.45), 0, 0, 0, 0.2, 0.016, 0.2, cv(0xdca92c, rnd, 0.05));
    // 2. wall panel seams (vertical reveals plus two horizontal ones)
    const seamC = cv(0xa9afb6, rnd, 0.03), seamHi = new THREE.Color(0xf3f1ea), seamLo = new THREE.Color(0xb4babf), sp = r.kind === 'chest' ? 2.0 + rnd() * 0.4 : 2.0 + rnd() * 0.7;
    for (let w = 0; w < 4; w++) {
      for (const [a, b] of segs(r, w, 0.3, 0.08)) {
        for (let t = a + rnd() * sp; t < b - 0.05; t += sp) { wbox(S, r, w, t - 0.016, t - 0.004, 0.3, H - 0.55, 0, 0.016, seamHi); wbox(S, r, w, t + 0.004, t + 0.016, 0.3, H - 0.55, 0, 0.012, seamLo); }
        { wbox(S, r, w, a, b, 2.705, 2.72, 0, 0.016, seamHi); wbox(S, r, w, a, b, 2.69, 2.703, 0, 0.012, seamLo); }
      }
      for (const [a, b] of segs(r, w, 0.3)) { wbox(S, r, w, a, b, 5.635, 5.65, 0, 0.016, seamHi); wbox(S, r, w, a, b, 5.62, 5.633, 0, 0.012, seamLo); }
    }
    // 3. ceiling: cornice and coffer beams (separate mesh so the overview camera hides it together with the ceilings)
    const beamC = cv(0xe4e1da, rnd, 0.02);
    if (!big) for (let w = 0; w < 4; w++) wbox(C, r, w, -(w < 2 ? hx : hz), (w < 2 ? hx : hz), H - 0.24, H, 0, 0.12, cv(0xdad7cf, rnd, 0.02));
    const uq = a => [...new Set(a.map(v => +v.toFixed(2)))].sort((p, q) => p - q), mids = a => { const u = uq(a), o = []; for (let i = 0; i + 1 < u.length; i++) o.push((u[i] + u[i + 1]) / 2); return o; };
    for (const z of mids(r.panels.map(p => p[1]))) put(C, BOXG, 0, H - 0.17, z, 0, 0, 0, 2 * hx, 0.34, 0.3, beamC);
    for (const x of (r.xBeams || mids(r.panels.map(p => p[0])))) put(C, BOXG, x, H - 0.17, 0, 0, 0, 0, 0.3, 0.34, 2 * hz, beamC);
    // 4. hazard stripes at every door of this room (floor strip in front of the threshold)
    for (const e of r.doors) {
      const wdt = e.d.dw + 0.5, dep = wdt / 8, c = new V3(e.lp.x + e.sl.x * 0.95, 0.007, e.lp.z + e.sl.z * 0.95);
      D.quad(c, new V3(0, 1, 0), new V3(e.t.z, 0, -e.t.x), wdt / 2, dep / 2, uvr('haz'), WHITE);
    }
    // 5. props, near walls and corners only, kept clear of door gaps
    const occ = [], free = (x, z, rad) => !occ.some(o => Math.hypot(o[0] - x, o[1] - z) < o[2] + rad + 0.12);
    if (r.kind === 'chest' && r.type === 'home') { const K = WORLD.HOME_LAYOUT.crate, B = WORLD.HOME_LAYOUT.bench, Rc = WORLD.HOME_LAYOUT.recycler; crate(A, K[0], K[1], 0.35, 0.83, rnd); occ.push([K[0], K[1], 0.6], [B[0], B[1], 1.3], [Rc[0], Rc[1], 1.0]); }   // 5x5: the home's solid crate (world.js 'hcrate') and the station footprints
    // 5b. art pass 2: the story corner is placed first so the older props flow around it
    const r2 = mul(hashStr('roomart2:' + r.key)); let storyAt = null;
    const spot = (rad, edge) => { for (let k = 0; k < 24; k++) { const sx = r2() < 0.5 ? -1 : 1, sz = r2() < 0.5 ? -1 : 1, x = sx * (hx - edge - r2() * 0.3), z = sz * (hz - edge - r2() * 0.3); if (free(x, z, rad)) { occ.push([x, z, rad]); return [x, z, sx, sz]; } } return null; };
    const theme = (r2() * 3) | 0;   // 0 goblin camp, 1 hoard corner, 2 gaol corner
    if (!big && r.kind === 'grid' && r.story !== false) {   // 5x5: tree and vaultbreaker rooms have no story corner (world.js storyOf)
      const p = spot(1.5, 1.7);
      if (p) {
        const [x, z, sx, sz] = p, toCentre = Math.atan2(sz, -sx); { const w = WORLD.storyOf(+r.key); if (!w || w.theme !== theme || Math.abs(w.x - x) > 1e-6 || Math.abs(w.z - z) > 1e-6) console.warn('roomart: story corner differs from world.js', r.key); }   // SOLID: world.js repeats the story draws for the collision footprints
        story.set(r.key, [x, z, theme]); storyAt = [x, z];
        if (theme === 0) { coldFire(A, x, z, r2); tripodPot(A, x, z, r2); logSeat(A, x - sx * 0.2, z - sz * 0.95, 0.4 + r2(), r2); bedroll(A, x + sx * 1.1, z + sz * 0.15, (r2() - 0.5) * 0.2, r2); bonePile(A, x - sx * 0.1, z + sz * 1.1, r2); barrelTipped(A, x - sx * 1.25, z + sz * 0.95, toCentre, r2); crate(A, x + sx * 1.15, z - sz * 0.95, r2() * 0.4, 0.62, r2); crate(A, x + sx * 1.15, z - sz * 1.55, r2() * 0.4, 0.55, r2); sack(A, x + sx * 0.55, z - sz * 1.2, r2); }
        else if (theme === 1) { barrelTipped(A, x, z, toCentre, r2); barrelUpright(A, x + sx * 1.0, z + sz * 1.35, r2); barrelUpright(A, x + sx * 1.55, z + sz * 0.85, r2); crateBroken(A, x + sx * 1.3, z - sz * 0.45, (r2() - 0.5) * 0.6, 0.85, r2); sack(A, x + sx * 0.4, z + sz * 1.3, r2); sack(A, x + sx * 0.9, z + sz * 1.45, r2); coinScatter(A, x - sx * 0.8, z + sz * 0.3, 10, 0.4, r2); }
        else { shackles(A, x, z, r2); bonePile(A, x, z + sz * 0.15, r2); bucket(A, x + sx * 1.0, z + sz * 0.6, r2() * 6, r2); crateBroken(A, x - sx * 0.2, z + sz * 1.5, r2() * 0.5, 0.7, r2); }
      }
      for (const p of WORLD.solidsOf(r.key, '')) occ.push([p.x - r.cx, p.z - r.cz, p.r]);   // SOLID: keep the second story spot off the crate corner
      const q = spot(0.8, 1.2); if (q) { if (theme === 1) bonePile(A, q[0], q[1], r2); else crateBroken(A, q[0], q[1], r2() * 6, 0.75, r2); }
    } else if (r.kind === 'chest') {
      for (let k = 0; k < 2; k++) {
        const sx = r2() < 0.5 ? -1 : 1, x = sx * (hx - 0.95), z = hz - 0.95;
        if (!free(x, z, 0.8)) continue; occ.push([x, z, 0.8]);
        const t = (r2() * 3) | 0; if (t === 0) barrelTipped(A, x, z, Math.atan2(1, -sx), r2); else if (t === 1) crateBroken(A, x, z, (r2() - 0.5) * 0.8, 0.7, r2); else bonePile(A, x, z, r2);
      }
    } else if (big) { const q = spot(0.9, 2.6); if (q) shackles(A, q[0], q[1], r2); }
    const wallSpot = rad => { for (let k = 0; k < 30; k++) { const w = (rnd() * 4) | 0, t = pickSeg(segs(r, w, rad + 0.5, rad + 0.7), rnd); if (t == null) continue; const [x, z] = wp(r, w, t, rad + 0.28 + rnd() * 0.7); if (Math.abs(x) < hx - rad && Math.abs(z) < hz - rad && free(x, z, rad)) { occ.push([x, z, rad]); return [x, z, w]; } } return null; };
    const cornerSpot = rad => { for (let k = 0; k < 16; k++) { const sx = rnd() < 0.5 ? -1 : 1, sz = rnd() < 0.5 ? -1 : 1, x = sx * (hx - 0.25 - rad - rnd() * 0.35), z = sz * (hz - 0.25 - rad - rnd() * 0.35); if (free(x, z, rad)) { occ.push([x, z, rad]); return [x, z]; } } return null; };
    if (r.kind === 'grid') for (const p of WORLD.solidsOf(r.key, '')) occ.push([p.x - r.cx, p.z - r.cz, p.r]);   // SOLID: the collidable crates / pedestal are placed by world.js; everything else flows around them
    if (r.vault) vaultDress(r, A, rnd, occ);
    if (r.kind === 'chest') {   // door-side corners only (the far wall carries banners, torches and the chest)
      const cs = rad => { for (let k = 0; k < 10; k++) { const sx = rnd() < 0.5 ? -1 : 1, x = sx * (hx - 0.3 - rad - rnd() * 0.2), z = hz - 0.3 - rad - rnd() * 0.2; if (free(x, z, rad)) { occ.push([x, z, rad]); return [x, z]; } } return null; };
      let p;
      if (rnd() < 0.5 && (p = cs(0.3))) { crate(A, p[0], p[1], rnd() * 6, 0.5 + rnd() * 0.15, rnd); if (rnd() < 0.5) sack(A, p[0] + (p[0] < 0 ? 0.4 : -0.4), p[1] - 0.4, rnd); }
      if ((p = cs(0.3))) { const k = rnd(); if (k < 0.3) helmet(A, p[0], p[1], rnd() * 6, rnd); else if (k < 0.6) bucket(A, p[0], p[1], rnd() * 6, rnd); else boneSet(A, p[0], p[1], rnd); }
      for (let i = 0, n = 1 + ((rnd() * 2) | 0); i < n; i++) if ((p = cs(0.3))) coinScatter(A, p[0], p[1], 7 + ((rnd() * 8) | 0), 0.3, rnd);
    } else {
      const nCrates = 1 + ((rnd() * (big ? 3 : 2)) | 0), nBones = 2 + ((rnd() * 3) | 0), nCoins = 1 + ((rnd() * 3) | 0) + (big ? 2 : 0), nChains = 1 + ((rnd() * 3) | 0), bucketOn = rnd() < 0.5, helmetOn = rnd() < 0.45, sackOn = rnd() < 0.5;
      for (const w of WORLD.solidsOf(r.key, '')) if (w.k === 'crate') crate(A, w.x - r.cx, w.z - r.cz, w.yaw, w.s, rnd);   // SOLID: crates are collidable, so world.js picks where they stand (south corners, clear of doors and panels)
      for (let i = 0; i < nBones; i++) { const p = rnd() < 0.5 ? cornerSpot(0.4) : wallSpot(0.4); if (p) boneSet(A, p[0], p[1], rnd); }
      if (bucketOn) { const p = wallSpot(0.45); if (p) bucket(A, p[0], p[1], rnd() * 6, rnd); }
      if (helmetOn) { const p = wallSpot(0.3); if (p) helmet(A, p[0], p[1], rnd() * 6, rnd); }
      if (sackOn) { const p = wallSpot(0.3); if (p) sack(A, p[0], p[1], rnd); }
      for (let i = 0; i < nCoins; i++) { const p = wallSpot(0.4); if (p) coinScatter(A, p[0], p[1], 8 + ((rnd() * 14) | 0), 0.38, rnd); }
      for (let i = 0; i < nChains; i++) { const p = rnd() < 0.5 ? cornerSpot(0.15) : wallSpot(0.15); if (p) chain(A, p[0], p[1], 1.0 + rnd() * 2.2, rnd); }
    }
    // 6. graffiti on the walls (never over door gaps, the north wall's map/control panels, or each other) and a floor arrow toward the vault
    const marks = [], kinds = ['gob', 'gob', 'crown', 'tally', 'scr', 'mine', 'king', 'kingme', 'kingme', 'face', 'face', 'warr'];
    const nG = r.kind === 'chest' ? 2 : big ? 3 : 3 + ((rnd() * 3) | 0), up = new V3(0, 1, 0);
    for (let n = 0, tries = 0; n < nG && tries < 50; tries++) {
      let k = kinds[(rnd() * kinds.length) | 0]; if (k === 'warr' && (big || r.kind !== 'grid')) continue; const sc = big || r.kind === 'chest' ? 0.5 : 0.85 + rnd() * 0.3, hw = GW[k] * sc / 2, hh = hw * SIZES[k][1] / SIZES[k][0];
      const w = r.kind === 'chest' ? 1 : (rnd() * 4) | 0, t = pickSeg(segs(r, w, hw + 0.3, hw + 0.2), rnd); if (t == null) continue;
      if (r.kind === 'chest' && (Math.abs(t) < 2.2 || hw > 1.2)) continue;
      if (w === 0 && r.panelDX && Math.abs(Math.abs(t) - r.panelDX) < hw + 1.4) continue;
      if (big && hh > 0.55) continue;
      const y = big ? 0.6 : Math.max(0.4 + hh, 0.55 + rnd() * 0.95);
      if (marks.some(m => m[0] === w && Math.abs(m[1] - t) < m[2] + hw + 0.2)) continue;
      marks.push([w, t, hw]); n++;
      const [x, z] = wp(r, w, t, 0.012), nrm = NRM[w], nv = new V3(nrm[0], 0, nrm[1]), upv = up.clone().applyAxisAngle(nv, (rnd() - 0.5) * 0.26), op = 0.62 + rnd() * 0.38;
      let rect = k === 'warr' ? null : uvr(k);
      if (k === 'warr') { const [vx, vz] = rc(WORLD.VAULT), along = w < 2 ? vx - r.cx : vz - r.cz; rect = uvr(along - t >= 0 ? 'warrR' : 'warrL'); if (w === 1 || w === 2) rect = uvr(along - t >= 0 ? 'warrL' : 'warrR'); }   // the arrow points along the wall toward the vault side
      D.quad(new V3(x, y, z), nv, upv, hw, hh, rect, new THREE.Color(op, op, op));
    }
    if (r.kind === 'grid' && !big) {
      const [vx, vz] = rc(WORLD.VAULT), dx = vx - r.cx, dz = vz - r.cz, l = Math.hypot(dx, dz), dir = new V3(dx / l, 0, dz / l);
      D.quad(new V3(dir.x * 3.5, 0.008, dir.z * 3.5), new V3(0, 1, 0), dir, 0.95, 0.95, uvr('arrow'), WHITE);   // big enough to read from the room centre; text readable from both ends
    }
    // 7. art pass 2: the story corner, wall wear (grime, scuffs, cracked tiles, ceiling water stains). Own seeded stream so the layout above is untouched.
    const nv0 = i => new V3(NRM[i][0], 0, NRM[i][1]);
    const dq = (cx0, cy0, cz0, nrm, upv, hw, hh, key, op, flip) => { const u = uvr(key); D.quad(new V3(cx0, cy0, cz0), nrm, upv, hw, hh, flip ? [u[2], u[1], u[0], u[3]] : u, new THREE.Color(op, op, op)); };
    for (let w = 0; w < 4; w++) for (const [a, b] of segs(r, w, 0.3, 0.1)) {   // grime near the floor
      for (let t = a; t < b - 0.2;) { const len = Math.min(b - t, 2.4 + r2() * 1.6), [x, z] = wp(r, w, t + len / 2, 0.008); dq(x, 0.62, z, nv0(w), up, len / 2, 0.62, 'grime', big ? 0.5 : 0.6 + r2() * 0.4, r2() < 0.5); t += len; }
    }
    for (let i = 0, n = big ? 4 : 5 + ((r2() * 3) | 0); i < n; i++) {   // scuffs on the lower walls
      const w = (r2() * 4) | 0, t = pickSeg(segs(r, w, 1.1, 0.4), r2); if (t == null) continue;
      const [x, z] = wp(r, w, t, 0.01), hw = 0.45 + r2() * 0.55; dq(x, 0.25 + r2() * 1.1, z, nv0(w), up.clone().applyAxisAngle(nv0(w), (r2() - 0.5) * 0.9), hw, hw / 2, 'scuff', 0.5 + r2() * 0.5, r2() < 0.5);
    }
    for (let i = 0, n = 1 + ((r2() * 2) | 0); i < n; i++) {   // cracked tile cluster on the floor, away from doorways
      for (let k = 0; k < 12; k++) {
        const x = (r2() - 0.5) * (hx * 2 - 3), z = (r2() - 0.5) * (hz * 2 - 3);
        if (r.doors.some(d => Math.hypot(d.lp.x - x, d.lp.z - z) < 2.8) || (big && Math.hypot(x, z) < 4.6)) continue;
        const a = r2() * 6.28, hw = 0.5 + r2() * 0.4; dq(x, 0.009, z, new V3(0, 1, 0), new V3(Math.sin(a), 0, Math.cos(a)), hw, hw / 2, 'crack', 0.45 + r2() * 0.35, r2() < 0.5); story.set(r.key + '#crack' + i, [x, z, 0]); break;
      }
    }
    // 8. art pass 3: floor storytelling in the middle of the room (decals and tiny props in the same merged meshes, no collision)
    if (r.kind === 'grid' && !big && r.doors.length >= 2) {
      let best = null;   // the worn line runs between the two doors that are furthest apart (a vault door counts extra: that is where everyone is heading)
      for (let i = 0; i < r.doors.length; i++) for (let j = i + 1; j < r.doors.length; j++) { const P0 = r.doors[i], P1 = r.doors[j], d = Math.hypot(P0.lp.x - P1.lp.x, P0.lp.z - P1.lp.z) * (P0.d.kind === 'vault' || P1.d.kind === 'vault' ? 1.3 : 1); if (!best || d > best[2]) best = [P0, P1, d]; }
      const [P0, P1] = best, ax = P0.lp.x + P0.sl.x * 1.1, az = P0.lp.z + P0.sl.z * 1.1, bx = P1.lp.x + P1.sl.x * 1.1, bz = P1.lp.z + P1.sl.z * 1.1, L = Math.hypot(bx - ax, bz - az);
      if (L > 2) dq((ax + bx) / 2, 0.006, (az + bz) / 2, new V3(0, 1, 0), new V3((bx - ax) / L, 0, (bz - az) / L), 0.75 + r2() * 0.2, L / 2, 'path', 0.85 + r2() * 0.15, r2() < 0.5);
      if (storyAt) { const m = Math.hypot(storyAt[0], storyAt[1]) || 1, dx = -storyAt[0] / m, dz = -storyAt[1] / m, Ld = 3 + r2() * 2; dq(storyAt[0] + dx * (0.9 + Ld / 2), 0.007, storyAt[1] + dz * (0.9 + Ld / 2), new V3(0, 1, 0), new V3(dx, 0, dz), 0.4, Ld / 2, 'drag', 0.8 + r2() * 0.2, r2() < 0.5); }
      const cd = r.doors.find(e => e.d.kind === 'chest');   // spilled coins trailing away from the treasure door
      if (cd) for (let i = 0; i < 9; i++) { const k = 1.5 + i * 0.5 + r2() * 0.2, off = (r2() - 0.5) * 0.45 + Math.sin(i * 0.9) * 0.2, cx = cd.lp.x + cd.sl.x * k - cd.sl.z * off, cz = cd.lp.z + cd.sl.z * k + cd.sl.x * off; for (let c2 = 0, nc = Math.max(1, 4 - ((i * 0.4) | 0) - ((r2() * 2) | 0)); c2 < nc; c2++) coin(A, cx + (r2() - 0.5) * 0.3, 0.012 + (r2() < 0.2 ? 0.012 : 0), cz + (r2() - 0.5) * 0.3, r2, 0.3); }
      for (let i = 0, n = 3 + ((r2() * 2) | 0); i < n; i++) for (let k = 0; k < 10; k++) {   // a couple of teeth and an ear-ring away from the doorways
        const x = (r2() - 0.5) * (hx * 2 - 4), z = (r2() - 0.5) * (hz * 2 - 4); if (r.doors.some(e => Math.hypot(e.lp.x - x, e.lp.z - z) < 2.4)) continue;
        if (i === 0) earRing(A, x, z, r2); else tooth(A, x, z, r2); break;
      }
    }
    for (let i = 0, n = 1 + ((r2() * 2) | 0); i < n; i++) waterStain(A, (r2() < 0.5 ? -1 : 1) * (hx - 1.1 - r2() * 1.4), (r2() < 0.5 ? -1 : 1) * (hz - 1.1 - r2() * 1.4), r2);
    // 9. ROOMID: painted wainscot band, steel conduit run with the room's colour collars, a corner riser and a stencilled room number (own seeded stream, merged into the same meshes)
    if (acc) {
      const r3 = mul(hashStr('roomart5:' + r.key)), band = acc.clone().multiplyScalar(0.94), rail = acc.clone().lerp(WHITE, 0.45), shade = acc.clone().multiplyScalar(0.7),
        steel = cv(0x59616b, r3, 0.05), steel2 = cv(0x8a929c, r3, 0.05), dark = new THREE.Color(0x2b3037), PY = 4.9;
      for (let w = 0; w < 4; w++) {
        for (const [a, b] of segs(r, w, 0.02, 0.05)) {   // painted band, 4 mm proud of the wall so the seams and decals still read over it
          wbox(S, r, w, a, b, 0.285, 1.04, 0.002, 0.006, band); wbox(S, r, w, a, b, 1.04, 1.085, 0.002, 0.007, rail); wbox(S, r, w, a, b, 0.285, 0.32, 0.002, 0.007, shade);
        }
        for (const [a, b] of segs(r, w, 0.1, 1.5)) {   // conduit: a thick steel pipe and a thin one above it, bracketed every ~2.3 m, a colour collar at each bracket
          const L = b - a, [mx, mz] = wp(r, w, (a + b) / 2, 0.13), [m2x, m2z] = wp(r, w, (a + b) / 2, 0.1);
          put(S, CYLG, mx, PY, mz, 0, YAW[w], PI / 2, 0.075, L, 0.075, steel); put(S, CYLG, m2x, PY + 0.2, m2z, 0, YAW[w], PI / 2, 0.038, L, 0.038, steel2);
          const n = Math.max(1, Math.round(L / 2.3));
          for (let k = 0; k < n; k++) {
            const t = a + (k + 0.5) * L / n, [bx, bz] = wp(r, w, t, 0.05), [cx, cz] = wp(r, w, t, 0.13);
            put(S, BOXG, bx, PY + 0.1, bz, 0, YAW[w], 0, 0.05, 0.42, 0.1, dark);
            put(S, CYLG, cx, PY, cz, 0, YAW[w], PI / 2, 0.086, 0.07, 0.086, acc);
          }
        }
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(S, SPHG, sx * (hx - 0.13), PY, sz * (hz - 0.13), 0, 0, 0, 0.1, 0.1, 0.1, steel);   // elbows
      { const sx = r3() < 0.5 ? -1 : 1, sz = r3() < 0.5 ? -1 : 1, x = sx * (hx - 0.13), z = sz * (hz - 0.13);   // one riser down to the floor, flanged
        put(S, CYLG, x, (PY + 0.32) / 2, z, 0, 0, 0, 0.065, PY - 0.32, 0.065, steel); put(S, CYLG, x, 0.33, z, 0, 0, 0, 0.1, 0.05, 0.1, dark); put(S, CYLG, x, 1.6, z, 0, 0, 0, 0.082, 0.07, 0.082, acc); put(S, CYLG, x, 3.3, z, 0, 0, 0, 0.082, 0.07, 0.082, acc); }
      for (let k = 0; k < 6; k++) {   // stencilled room number high on one of the side or back walls, clear of the doors and of the graffiti zone
        const w = 1 + ((r3() * 3) | 0), t = pickSeg(segs(r, w, 1.3, 1.9), r3); if (t == null) continue;
        const [x, z] = wp(r, w, t, 0.014), nv = nv0(w); D.quad(new V3(x, 3.75, z), nv, up, 0.85, 0.85, uvr('rm' + r.key), WHITE); break;
      }
    }
    if (r.kind === 'chest') { moodAccents(r, E, S, C, rnd); outerDress(r, A, D, mul(hashStr('roomart4:' + r.key))); }
    const out = [], add = (acc, mat, isCeil, name) => { if (!acc.cnt) return; const m = new THREE.Mesh(acc.geometry(), mat); m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); out.push(m); if (isCeil) ceilings.push(m); };
    add(S, solidM, false, 'roomartSolid'); add(G, goldVM, false, 'roomartGold'); add(C, solidM, true, 'roomartCeil'); add(D, decalM, false, 'roomartDecal'); add(E, r.kind === 'chest' ? (moodM[r.type] || solidM) : emberM, false, 'roomartMood');
    if (r.kind === 'chest' && r.type === 'merchant') { const bm = makeBoard(r); scene.add(bm); out.push(bm); }   // price board with the real prices
    return out;
  }

  // ---- the vault: coin piles around the medallion, corner hoards
  function vaultDress(r, A, rnd, occ) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const [a0, a1] of [[22, 36], [52, 66]]) {
      const a = (a0 + rnd() * (a1 - a0)) * PI / 180, rad = 4.2 + rnd() * 0.8, x = sx * Math.cos(a) * rad, z = sz * Math.sin(a) * rad, pr = 0.4 + rnd() * 0.35;
      coinPile(A, x, z, pr, 0.2 + rnd() * 0.2, rnd); r.piles.push([x, z, pr]);
    }
    for (let k = 0; k < 2; k++) { const sx = k ? 1 : -1, sz = -1, x = sx * (r.hx - 1.3), z = sz * (r.hz - 1.3); coinPile(A, x, z, 1.0 + rnd() * 0.2, 0.6, rnd); occ.push([x, z, 1.2]); }   // SOLID: both hoards in the north corners; the south corners hold the (collidable) crates from world.js
  }
  // ---- chest / mystery / merchant mood accents (emissive only): floor inlay, ceiling cove and corner motifs
  function moodAccents(r, E, S, C, rnd) {
    const t = r.type, hx = r.hx;
    for (let w = 0; w < 4; w++) {
      for (const [a, b] of segs(r, w, 0.62, 0.2)) wbox(E, r, w, a, b, 0, 0.016, 0.54, 0.6, WHITE);
      for (const [a, b] of segs(r, w, 0.02)) wbox(E, r, w, a, b, H - 0.52, H - 0.46, 0, 0.06, WHITE);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (hx - 0.5), z = sz * (hx - 0.5);
      if (t === 'chest') { put(E, BOXG, x, 0.05, z, 0, 0.3 * sx, 0, 0.36, 0.1, 0.18, WHITE); put(E, BOXG, x - 0.22 * sx, 0.05, z + 0.02, 0, -0.2 * sz, 0, 0.36, 0.1, 0.18, WHITE); put(E, BOXG, x - 0.08 * sx, 0.15, z + 0.05, 0, 0.1, 0, 0.36, 0.1, 0.18, WHITE); }
      else if (t === 'mystery') { const y = 3.0 + rnd() * 1.1; put(E, BOXG, x, (H + y) / 2, z, 0, 0, 0, 0.012, H - y, 0.012, WHITE); put(E, OCTG, x, y, z, 0, rnd() * 3, 0, 0.14, 0.3, 0.14, WHITE); }
      else { put(C, BOXG, x, H - 0.75, z, 0, 0, 0, 0.014, 1.5, 0.014, new THREE.Color(0x2f343b)); put(E, BOXG, x, H - 1.65, z, 0, 0.4, 0, 0.2, 0.3, 0.2, WHITE); put(S, CONEG, x, H - 1.44, z, 0, 0, 0, 0.17, 0.1, 0.17, new THREE.Color(0x23262b)); }
    }
  }

  // ---- vault floor veining + glinting sprites (once)
  function vaultFloor() {
    const [vx, vz] = rc(WORLD.VAULT), size = VSIZE - T - 0.4, rnd = mul(0xBEEF);
    const tex = canvasTex(1024, 1024, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.lineCap = 'round';
      for (let i = 0; i < 26; i++) { const x = rnd() * w, y = rnd() * h, rr = 60 + rnd() * 140, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(120,128,142,0.10)'); gr.addColorStop(1, 'rgba(120,128,142,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      const vein = (x, y, a, steps, lw, col, depth) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < steps; s++) { a += (rnd() - 0.5) * 0.55; x += Math.cos(a) * (5 + rnd() * 7); y += Math.sin(a) * (5 + rnd() * 7); g.lineTo(x, y); if (depth < 2 && rnd() < 0.035) { g.stroke(); vein(x, y, a + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.6), steps * 0.45, lw * 0.6, col, depth + 1); g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(x, y); } } g.stroke(); };
      for (let i = 0; i < 70; i++) vein(rnd() * w, rnd() * h, rnd() * 6.28, 50 + rnd() * 150, 0.8 + rnd() * 2.2, `rgba(${55 + rnd() * 25 | 0},${62 + rnd() * 25 | 0},${78 + rnd() * 25 | 0},${0.18 + rnd() * 0.25})`, 0);
      for (let i = 0; i < 14; i++) vein(rnd() * w, rnd() * h, rnd() * 6.28, 40 + rnd() * 110, 0.8 + rnd() * 1.6, `rgba(214,162,58,${0.25 + rnd() * 0.25})`, 0);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.28, metalness: 0, envMapIntensity: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.name = 'roomartMarble'; m.position.set(vx, 0.006, vz); m.updateMatrix(); m.matrixAutoUpdate = false; scene.add(m); return m;
  }
  const glints = [];
  function vaultGlints(piles) {
    const [vx, vz] = rc(WORLD.VAULT), star = canvasTex(128, 128, (g, w, h) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,248,210,1)'); gr.addColorStop(0.12, 'rgba(255,214,110,0.55)'); gr.addColorStop(1, 'rgba(255,190,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,250,225,0.95)'; for (const [a, l] of [[0, 62], [PI / 2, 62], [PI / 4, 30], [-PI / 4, 30]]) { g.save(); g.translate(64, 64); g.rotate(a); g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, 2.5, l, 0); g.quadraticCurveTo(0, -2.5, -l, 0); g.fill(); g.restore(); }
    });
    const spots = [[vx, 1.25, vz, 2.3, 0.9, 0]].concat(piles.slice(0, 4).map((p, i) => [vx + p[0], 0.55, vz + p[1], 1.0, 1.3 + i * 0.37, i + 1]));
    for (const [x, y, z, s, sp, ph] of spots) {
      const mat = new THREE.SpriteMaterial({ map: star, color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      const spr = new THREE.Sprite(mat); spr.position.set(x, y, z); spr.scale.set(s, s, 1); scene.add(spr); glints.push({ spr, mat, s, sp, ph });
    }
    const tick = now => { for (const g of glints) { const k = 0.5 + 0.5 * Math.sin(now * 0.002 * g.sp + g.ph * 2.1), q = k * k * k, s = g.s * (0.35 + 0.65 * q); g.spr.scale.set(s, s, 1); g.mat.opacity = 0.25 + 0.7 * q; g.mat.rotation = now * 0.0002 * g.sp; } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // ---- art pass 4: set dressing for the 12 outer rooms (chest, each mystery kind, merchant). Visual only, merged into the room's meshes, seeded per room.
  const TRIG = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, -1, 0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); g.setIndex([0, 1, 2]); return g; })();
  const GEMC = [0xe0203a, 0x20c860, 0x3a7bff, 0xb04cff, 0x30e0e0], PARTY = [0xff5a8a, 0xffc933, 0x38d6b4, 0x7a5cff, 0xff8a30];
  const STEEL = 0xa9b3be, DARKW = 0x4a3422;
  function outerDress(r, A, D, rd) {
    const hx = r.hx, S = A.S, G = A.G, E = A.M, mk = r.mkind;
    if (r.type === 'mystery') for (let i = 0; i < 38; i++) put(E, OCTG, (rd() - 0.5) * (hx * 2 - 1), 0.5 + rd() * 3.4, (rd() - 0.5) * (hx * 2 - 1), rd() * 3, rd() * 3, 0, 0.022 + rd() * 0.02, 0.03 + rd() * 0.03, 0.022 + rd() * 0.02, WHITE);   // floating dust motes (emissive, the room's mood colour)
    if (r.type === 'chest') {
      for (let i = 0; i < 34; i++) { const a = (rd() - 0.5) * 2.2, d = 0.6 + rd() * 1.9; coin(A, Math.sin(a) * d, 0.012 + (rd() < 0.2 ? 0.012 : 0), -1.9 + Math.cos(a) * d * 0.8, rd, 0.4); }   // coins spilled in a fan from the chest toward the rug
      for (let i = 0; i < 7; i++) put(S, OCTG, (rd() - 0.5) * 3.2, 0.05, -1.3 - rd() * 1.2, rd() * 3, rd() * 6, rd() * 3, 0.05, 0.075, 0.05, cv(GEMC[i % 5], rd, 0.1));
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) put(G, BOXG, sx * 2.15, 0.07 + i * 0.12, -3.0, 0, (rd() - 0.5) * 0.3 + i * 0.1, 0, 0.44 - i * 0.05, 0.11, 0.2, cv(GOLD[(i + 1) % 4], rd, 0.06));   // ingot stacks beside the dais
      sack(A, -2.8, -2.4, rd); sack(A, 2.75, -2.5, rd); sack(A, 2.45, -2.9, rd);
    } else if (r.type === 'mystery' && mk === 'weapon') {
      put(S, BOXG, -hx + 0.1, 1.9, 0, 0, 0, 0, 0.12, 1.5, 2.5, cv(DARKW, rd, 0.1));
      for (let i = 0; i < 4; i++) {   // a rack of blades and spears
        const z = -0.9 + i * 0.6, sp = i % 2 === 0;
        put(S, CYLG, -hx + 0.26, 1.9, z, 0, 0, 0, sp ? 0.028 : 0.02, sp ? 1.7 : 1.1, sp ? 0.028 : 0.02, cv(sp ? 0x7a5634 : STEEL, rd, 0.06));
        if (sp) put(S, CONEG, -hx + 0.26, 2.9, z, 0, 0, 0, 0.07, 0.3, 0.07, cv(STEEL, rd, 0.05)); else { put(S, BOXG, -hx + 0.26, 1.4, z, 0, 0, 0, 0.09, 0.05, 0.3, cv(0xc8962e, rd, 0.05)); put(S, BOXG, -hx + 0.26, 1.2, z, 0, 0, 0, 0.05, 0.3, 0.05, cv(DARKW, rd, 0.05)); }
      }
      put(S, CYLG, hx - 0.12, 2.2, -0.6, 0, 0, PI / 2, 0.55, 0.07, 0.55, cv(0x8a1424, rd, 0.06)); put(G, CYLG, hx - 0.17, 2.2, -0.6, 0, 0, PI / 2, 0.14, 0.06, 0.14, cv(0xf0b02a, rd, 0.05));   // round shield with a gold boss
    } else if (r.type === 'mystery' && mk === 'armor') {
      for (const sx of [-1, 1]) {   // two mannequins in mail
        const x = sx * 2.75, z = -2.5, steel = cv(STEEL, rd, 0.06);
        put(S, CYLG, x, 0.04, z, 0, 0, 0, 0.32, 0.08, 0.32, cv(DARKW, rd, 0.08)); put(S, CYLG, x, 0.7, z, 0, 0, 0, 0.04, 1.4, 0.04, cv(DARKW, rd, 0.08));
        put(S, SPHG, x, 1.25, z, 0, 0, 0, 0.3, 0.38, 0.2, steel); put(S, SPHG, x, 1.7, z, 0, 0, 0, 0.16, 0.18, 0.16, steel); put(S, BOXG, x, 1.7, z + 0.13, 0, 0, 0, 0.18, 0.03, 0.02, cv(0x20242a, rd, 0.05));
        for (const s2 of [-1, 1]) put(S, SPHG, x + s2 * 0.3, 1.45, z, 0, 0, 0, 0.14, 0.12, 0.14, steel);
      }
      put(S, BOXG, 0, 3.4, -hx + 0.08, 0, 0, 0, 1.3, 0.05, 0.04, cv(0xc8962e, rd, 0.05));
    } else if (r.type === 'mystery' && mk === 'gold') {
      for (const [x, z] of [[-2.7, -2.9], [2.7, -2.9], [-2.9, 1.2], [2.9, 1.0]]) coinPile(A, x, z, 0.5 + rd() * 0.25, 0.22 + rd() * 0.15, rd);
      for (let i = 0; i < 6; i++) put(G, BOXG, 2.7 - (i % 3) * 0.46, 0.07 + Math.floor(i / 3) * 0.12, 2.4, 0, 0.1 * (i % 2), 0, 0.42, 0.11, 0.2, cv(GOLD[i % 4], rd, 0.06));
    } else if (r.type === 'mystery' && mk === 'stations') {
      put(S, BOXG, -hx + 0.08, 2.0, 0.2, 0, 0, 0, 0.08, 1.5, 2.3, cv(0x3a2a1c, rd, 0.1));   // pegboard with tools
      const tool = cv(STEEL, rd, 0.08), wood = cv(0x7a5634, rd, 0.08);
      put(S, CYLG, -hx + 0.16, 2.5, -0.6, 0, 0, 0, 0.03, 0.5, 0.03, wood); put(S, BOXG, -hx + 0.16, 2.78, -0.6, 0, 0, 0, 0.1, 0.1, 0.24, tool);   // hammer
      put(S, BOXG, -hx + 0.16, 2.2, 0.35, 0, 0, 0, 0.02, 0.18, 0.8, tool); for (let i = 0; i < 9; i++) put(S, CONEG, -hx + 0.16, 2.11, -0.02 + i * 0.09, 0, 0, PI, 0.012, 0.04, 0.012, tool);   // saw with teeth
      put(S, TRIG, -hx + 0.15, 2.0, 1.05, 0, -PI / 2, 0, 0.4, 0.5, 1, tool);   // a flat blade
      for (let i = 0; i < 3; i++) { const z = -0.6 + i * 0.7; put(S, BOXG, -hx + 0.2, 1.5, z, 0, 0, 0, 0.05, 0.05, 0.4, cv(0x2a2a30, rd, 0.1)); }
      for (let i = 0; i < 3; i++) { const z = -1.2 + i * 1.1, ore = [0x8a5a2b, 0xa9b4be, 0x3a7bff][i]; put(S, BOXG, 3.0, 0.3, z, 0, 0, 0, 0.7, 0.6, 0.9, cv(0x4a3a2a, rd, 0.1)); for (let k = 0; k < 6; k++) put(S, SPHG, 3.0 + (rd() - 0.5) * 0.4, 0.62 + rd() * 0.1, z + (rd() - 0.5) * 0.6, 0, 0, 0, 0.11, 0.09, 0.11, cv(ore, rd, 0.1)); }   // bins of ore, metal and gems
      const cx = -1.2, cz = 1.4; put(C0(A), TORG, cx, 4.7, cz, PI / 2, 0, 0, 0.42, 0.42, 0.42, cv(0x6a6e74, rd, 0.06)); for (let i = 0; i < 10; i++) { const a = i * PI / 5; put(C0(A), BOXG, cx + Math.cos(a) * 0.44, 4.7 + Math.sin(a) * 0.44, cz, 0, 0, a, 0.12, 0.12, 0.1, cv(0x6a6e74, rd, 0.06)); }   // a cog hung from the ceiling
      const u = uvr('sawdust'); D.quad(new V3(-2.3, 0.008, 1.9), new V3(0, 1, 0), new V3(0, 0, 1), 1.1, 0.9, u, new THREE.Color(0.9, 0.9, 0.9));
    } else if (r.type === 'mystery' && mk === 'enemy') {
      bonePile(A, -2.6, -2.7, rd); bonePile(A, 2.5, 1.4, rd);
      for (const [w, t, y, hw, op] of [[2, -1.4, 1.9, 1.0, 1], [3, 1.2, 2.1, 1.1, 0.9], [2, 2.2, 1.5, 0.8, 0.8]]) {   // claw marks on the side walls
        const x = w === 2 ? -hx + 0.012 : hx - 0.012; D.quad(new V3(x, y, t), new V3(w === 2 ? 1 : -1, 0, 0), new V3(0, 1, 0).applyAxisAngle(new V3(w === 2 ? 1 : -1, 0, 0), (rd() - 0.5) * 0.5), hw, hw, uvr('claw'), new THREE.Color(op, op, op));
      }
      D.quad(new V3(0, 0.009, 0.4), new V3(0, 1, 0), new V3(0, 0, 1), 1.5, 1.5, uvr('scorch'), new THREE.Color(0.9, 0.9, 0.9));   // the lair floor is scorched under the enemy
      shackles(A, -2.9, 0.8, rd); shackles(A, 2.9, -1.0, rd);
    } else if (r.type === 'mystery' && mk === 'plushie') {
      for (const [z, y0] of [[-1.4, 4.9], [1.3, 4.6]]) {   // two strings of bunting across the room
        put(C0(A), BOXG, 0, y0 - 0.25, z, 0, 0, 0, 7.2, 0.012, 0.012, cv(0x6a4a2e, rd, 0.05));
        for (let i = 0; i < 14; i++) { const t = i / 13, x = -3.4 + 6.8 * t, y = y0 - 0.1 - 0.5 * Math.sin(PI * t); put(C0(A), TRIG, x, y, z, 0, 0, (rd() - 0.5) * 0.25, 0.4, 0.5, 1, cv(PARTY[i % 5], rd, 0.06)); }
      }
      for (let i = 0; i < 7; i++) {   // balloons tied to the floor
        const a = i / 7 * PI * 2 + 0.4, x = Math.cos(a) * 2.7, z = Math.sin(a) * 2.5 - 0.3, y = 2.7 + rd() * 1.3;
        put(S, SPHG, x, y, z, 0, 0, 0, 0.27, 0.34, 0.27, cv(PARTY[i % 5], rd, 0.05)); put(S, CONEG, x, y - 0.36, z, PI, 0, 0, 0.04, 0.06, 0.04, cv(PARTY[i % 5], rd, 0.05)); put(S, CYLG, x, (y - 0.36) / 2 + 0.02, z, 0, 0, 0, 0.006, y - 0.36, 0.006, cv(0xe8e0d0, rd, 0.04));
      }
      for (let i = 0; i < 70; i++) put(S, BOXG, (rd() - 0.5) * 6.6, 0.006 + rd() * 0.004, (rd() - 0.5) * 6.6, 0, rd() * 6, 0, 0.07, 0.004, 0.045, cv(PARTY[(rd() * 5) | 0], rd, 0.05));   // confetti
      for (const [x, z, y, c] of [[2.6, -2.6, 0.15, 0], [2.6, -2.6, 0.45, 1], [2.55, -2.62, 0.75, 2], [-2.7, -2.5, 0.15, 3]]) put(S, BOXG, x, y, z, 0, rd() * 0.5, 0, 0.3, 0.3, 0.3, cv(PARTY[c], rd, 0.05));   // toy blocks
    } else if (r.type === 'merchant') {
      const beamY = H - 0.55;   // goods hang from a rope along the door-side beam
      put(C0(A), BOXG, 0, beamY - 0.05, 1.6, 0, 0, 0, 7.0, 0.02, 0.02, cv(0x6a4a2e, rd, 0.05));
      for (let i = 0; i < 9; i++) {
        const x = -3.1 + i * 0.77, len = 0.9 + rd() * 1.3, y = beamY - len, kind = i % 5, z = 1.6;
        put(C0(A), BOXG, x, beamY - len / 2, z, 0, 0, 0, 0.012, len, 0.012, cv(0x8a6a44, rd, 0.05));
        if (kind === 0) { put(S, SPHG, x, y - 0.2, z, 0, 0, 0, 0.2, 0.26, 0.2, cv(0xb09a6e, rd, 0.08)); put(S, CYLG, x, y, z, 0, 0, 0, 0.06, 0.06, 0.06, cv(0x6a5a3a, rd, 0.05)); }
        else if (kind === 1) { put(S, SPHG, x, y - 0.1, z, 0, 0, 0, 0.1, 0.34, 0.04, cv(0x8f9aa6, rd, 0.06)); put(S, TRIG, x, y - 0.4, z, 0, 0, PI, 0.18, 0.2, 1, cv(0x7f8a96, rd, 0.06)); }
        else if (kind === 2) { put(S, HEMG, x, y - 0.1, z, PI, 0, 0, 0.22, 0.2, 0.22, cv(0xb8734a, rd, 0.06)); put(S, ARCG, x, y + 0.02, z, 0, 0, 0, 0.2, 0.2, 0.2, cv(0x6a3a22, rd, 0.05)); }
        else if (kind === 3) { put(S, CYLG, x, y - 0.14, z, 0, 0, 0, 0.07, 0.24, 0.07, cv(0x2c9a8a, rd, 0.08)); put(S, CYLG, x, y + 0.02, z, 0, 0, 0, 0.03, 0.1, 0.03, cv(0x2c9a8a, rd, 0.08)); put(S, SPHG, x, y + 0.09, z, 0, 0, 0, 0.035, 0.035, 0.035, cv(0xb08a5a, rd, 0.05)); }
        else { put(S, BOXG, x, y - 0.15, z, 0, 0, 0, 0.18, 0.04, 0.18, cv(0x23262b, rd, 0.05)); put(S, BOXG, x, y - 0.02, z, 0, 0, 0, 0.18, 0.04, 0.18, cv(0x23262b, rd, 0.05)); put(E, BOXG, x, y - 0.085, z, 0, 0, 0, 0.14, 0.14, 0.14, WHITE); }   // teal lantern: glass is the emissive mood mesh
      }
      for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) put(S, CYLG, sx * 3.1, 0.14 + i * 0.28, 2.2, 0, 0, PI / 2, 0.15, 0.7, 0.15, cv([0x7a3a30, 0x2c6a8a, 0xd8b955, 0x5a8a3a][i], rd, 0.06));   // bolts of cloth
    }
  }
  const C0 = A => A.C, TORG = new THREE.TorusGeometry(1, 0.2, 6, 14);
  // ---- the merchant's price board: real (scaled) prices from the server, redrawn when they change
  const boards = new Set();
  function makeBoard(r) {
    const cv2 = document.createElement('canvas'); cv2.width = 512; cv2.height = 420; const tex = new THREE.CanvasTexture(cv2); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.56), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.name = 'roomartBoard';
    const Mx = new THREE.Matrix4().compose(new V3(1.8, 4.15, -r.hz + 0.07), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), 0), new V3(1, 1, 1)).premultiply(r.R);
    m.matrixAutoUpdate = false; m.matrix.copy(Mx); m.matrixWorldNeedsUpdate = true;
    const b = { id: r.cid, cv: cv2, tex, sig: '', mesh: m }; m.userData.board = b; boards.add(b); drawBoard(b); return m;
  }
  function drawBoard(b) {
    const shop = (GK.shops && GK.shops[b.id]) || [], n = GK.roundInfo ? GK.roundInfo().n : 1, sig = n + '|' + shop.map(s => s.key + ':' + s.price + ':' + (s.sold ? 1 : 0)).join(',');
    if (sig === b.sig) return; b.sig = sig;
    const g = b.cv.getContext('2d'), w = 512, h = 420; g.clearRect(0, 0, w, h);
    g.fillStyle = '#2a1c10'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d9a93a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); g.lineWidth = 2; g.strokeRect(24, 24, w - 48, h - 48);
    g.textBaseline = 'middle'; g.fillStyle = '#ffd75e'; g.font = '700 46px "Barlow Condensed",Impact,sans-serif'; g.textAlign = 'center'; g.fillText("TODAY'S GOODS", w / 2, 54);
    const up = Math.max(0, n - 2) * 10; g.font = '600 20px "Barlow Condensed",sans-serif'; g.fillStyle = up ? '#ff9a7a' : '#8fe0d0'; g.fillText(up ? 'Round ' + n + ': prices +' + up + '%' : 'Fair prices', w / 2, 84);
    g.textAlign = 'left';
    shop.slice(0, 5).forEach((s, i) => {
      const y = 128 + i * 52, nm = (typeof itemName === 'function' ? itemName(s.key) : s.key), sold = !!s.sold;
      g.fillStyle = sold ? '#7a7468' : '#f2efe6'; g.font = '600 33px "Barlow Condensed",sans-serif'; g.fillText(nm.length > 17 ? nm.slice(0, 16) + '…' : nm, 44, y);
      g.textAlign = 'right'; g.fillStyle = sold ? '#7a7468' : '#ffd75e'; g.font = '700 36px "Barlow Condensed",sans-serif'; g.fillText(sold ? 'SOLD' : s.price + ' g', w - 44, y); g.textAlign = 'left';
      if (sold) { g.strokeStyle = '#7a7468'; g.lineWidth = 2; g.beginPath(); g.moveTo(44, y); g.lineTo(44 + Math.min(300, g.measureText(nm).width), y); g.stroke(); }
      g.strokeStyle = 'rgba(217,169,58,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(44, y + 26); g.lineTo(w - 44, y + 26); g.stroke();
    });
    if (!shop.length) { g.fillStyle = '#a9a493'; g.font = '600 24px "Barlow Condensed",sans-serif'; g.textAlign = 'center'; g.fillText('Stock arriving…', w / 2, 220); }
    b.tex.needsUpdate = true;
  }
  setInterval(() => { for (const b of boards) { if (!b.mesh.parent) { boards.delete(b); try { b.tex.dispose(); } catch (e) {} continue; } try { drawBoard(b); } catch (e) {} } }, 800);
  // ---- rooms
  const story = new Map(), built = new Map(), doorsByRoom = new Map();   // room key -> meshes; room key -> doors touching it
  const mkRoom = (key, cx, cz, rotY, hx, hz, extra) => {
    const R = new THREE.Matrix4().makeRotationY(rotY).setPosition(cx, 0, cz), Ri = R.clone().invert(), r = { key, cx, cz, R, Ri, hx, hz, gaps: [0, 0, 0, 0], doors: [], panels: [[0, 0]], piles: [], ...extra };
    for (const e of doorsByRoom.get(key) || []) {
      const lp = new V3(e.d.gx, 0, e.d.gz).applyMatrix4(Ri), sl = new V3(e.s[0], 0, e.s[1]).transformDirection(Ri), tg = new V3(e.d.ax[0], 0, e.d.ax[1]).transformDirection(Ri);
      const w = Math.abs(lp.z + hz) < 0.8 ? 0 : Math.abs(lp.z - hz) < 0.8 ? 1 : Math.abs(lp.x + hx) < 0.8 ? 2 : Math.abs(lp.x - hx) < 0.8 ? 3 : -1;
      if (w >= 0) r.gaps[w] = e.d.dw / 2 + 0.45;
      r.doors.push({ d: e.d, lp, sl, t: tg });
    }
    return r;
  };
  const dispose = key => { for (const m of built.get(key) || []) { scene.remove(m); m.geometry.dispose(); const i = ceilings.indexOf(m); if (i >= 0) ceilings.splice(i, 1); } built.delete(key); };
  // 5x5 (docs/PLAN-5x5.md 4.1): 41 rooms are too many to dress at load, so the dressing is lazy. near(key) builds the camera's room and its 2-hop neighbours at once
  // (called every frame, it returns early unless the room changed); everything else is built one room per idle slot, nearest first by door hops.
  const sigOf = cr => cr.type + (cr.mystery ? ':' + cr.mystery.kind : '');
  const attSig = new Map(), ALL = WORLD.ROOMS.map(r => r.key), ADJ = {};
  for (const d of WORLD.DOORS) { (ADJ[d.a] = ADJ[d.a] || []).push(d.b); (ADJ[d.b] = ADJ[d.b] || []).push(d.a); }
  const hopsFrom = from => { const h = { [from]: 0 }, q = [from]; for (let i = 0; i < q.length; i++) for (const k of ADJ[q[i]] || []) if (h[k] === undefined) { h[k] = h[q[i]] + 1; q.push(k); } return h; };
  const stale = key => key[0] === 'c' ? attSig.get(key) !== sigOf(CHEST_ROOMS[+key.slice(1)]) : !built.has(key);
  function runOne(key) {
    try {
      if (key[0] === 'c') {
        const cr = CHEST_ROOMS[+key.slice(1)]; dispose(key); attSig.set(key, sigOf(cr));
        if (cr.type === 'home' && window.GK5ART && window.GK5ART.home) { built.set(key, []); return; }   // ROOMS5ART: the home art brings its own floor, walls and props
        const S = cr.size || WORLD.CS, IN = S / 2 - T / 2, big = S > WORLD.CS, r = mkRoom(key, cr.cx, cr.cz, Math.atan2(-cr.dx, -cr.dz), IN, IN, { kind: 'chest', type: cr.type, mkind: cr.mystery && cr.mystery.kind, cid: cr.id, panels: big ? [[0, -2.2], [0, 1.8]] : [[0, -1.8], [0, 1.4]], xBeams: big ? [-2.0, 2.0] : [-1.6, 1.6] });
        built.set(key, buildRoom(r));
      } else {
        const i = +key, [cx, cz] = rc(i), vault = i === WORLD.VAULT, r = mkRoom(key, cx, cz, 0, roomW(i) / 2 - T / 2, roomD(i) / 2 - T / 2, { kind: 'grid', vault, story: WORLD.kindOf(i) === 'arena', panels: WORLD.panelOffsets(i), panelDX: WORLD.panelDX(i) });
        built.set(key, buildRoom(r));
        if (vault) { built.get(key).push(vaultFloor()); vaultGlints(r.piles); }
      }
    } catch (e) { console.warn('roomart room skipped', key, e); if (!built.has(key)) built.set(key, []); }
  }
  let queueOn = false, anchor = WORLD.VAULT_KEY, nearKey = null;
  function pump() {
    const h = hopsFrom(anchor), todo = ALL.filter(stale).sort((a, b) => (h[a] === undefined ? 99 : h[a]) - (h[b] === undefined ? 99 : h[b]));
    if (!todo.length) { queueOn = false; try { if (typeof fxBuildBlobs === 'function') fxBuildBlobs(); } catch (e) {} return; }   // the contact shadows include the late rooms' props
    runOne(todo[0]); schedule();
  }
  function schedule() { queueOn = true; if (window.requestIdleCallback) requestIdleCallback(pump, { timeout: 400 }); else setTimeout(pump, 30); }
  function near(key) {   // the camera's room and its 2-hop neighbours, built now when missing or stale
    if (key === nearKey || !key || !WORLD.roomRect(key)) return;
    nearKey = key; anchor = key; const h = hopsFrom(key);
    for (const k of ALL) if (h[k] !== undefined && h[k] <= 2 && stale(k)) runOne(k);
    if (!queueOn && ALL.some(stale)) schedule();
  }
  function build() {
    if (!doorsByRoom.size) for (const d of doors) {
      const ka = WORLD.roomKeyOf(d.gx + d.az[0] * 1.2, d.gz + d.az[1] * 1.2), kb = WORLD.roomKeyOf(d.gx - d.az[0] * 1.2, d.gz - d.az[1] * 1.2);
      for (const [k, sg] of [[ka, 1], [kb, -1]]) { if (!doorsByRoom.has(k)) doorsByRoom.set(k, []); doorsByRoom.get(k).push({ d, s: [d.az[0] * sg, d.az[1] * sg] }); }
    }
    const k0 = nearKey || WORLD.VAULT_KEY; nearKey = null; near(k0);   // a new layout: the rooms around the camera now, the rest in idle time
    if (typeof fxCull !== 'undefined') fxCull.cls = new WeakMap();
  }
  return { story, init() { try { build(); layoutHooks.push(() => { try { build(); } catch (e) { console.warn('roomart layout skipped', e); } }); } catch (e) { console.warn('roomart skipped', e); } }, built, glints, near, pending: () => ALL.filter(stale).length };
})();
ROOMART.init(); GK.roomart = ROOMART;   // test hook: ROOMART.story = room key -> [x, z, theme] of its story corner
// ROOMART-END
// ROOMS5ART-BEGIN (docs/reports/room-art-integration.md): the art modules rooms5art-home / trees-a / trees-b / vault (window.GK5ART, loaded by index.html) built into the real arena.
// 8 homes (c0, c2 .. c14), 4 tree rooms (cells 6 8 16 18), 4 vaultbreaker rooms (7 11 13 17) and the vault dressing (12) are built lazily, nearest first (the camera's room and its 2-hop
// neighbours at one room per frame, the rest in idle time), each inside a frozen wrapper group so the FX room culling hides it with its room; update() runs only for rooms in the cull set.
// Server state is read from GK.state (trees, vb, vbNext, breach, treasury, crown, alarm, bars, homes) when it exists, else from the same fields of the messages seen here, else a placeholder
// roll derived from the match (visual only). No PointLights: a home's lamp position is handed to the pooled lamps (GK.r5.lampAt). Everything is disposed when the match ends.
const R5 = (() => {
  const ART = window.GK5ART || {};
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const mul = seed => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const TREE_ART = { well: ['ta', 'well'], press: ['ta', 'press'], spring: ['ta', 'spring'], seer: ['ta', 'seer'], graft: ['ta', 'graft'], thorn: ['tb', 'thorn'], gambler: ['tb', 'gambler'], memory: ['tb', 'memory'], oak: ['tb', 'hollow'], elder: ['tb', 'elder'] };
  const TREE_W = { well: 22, press: 16, spring: 14, seer: 12, graft: 10, thorn: 8, gambler: 7, memory: 5, oak: 4, elder: 2 }, VB_TYPES = ['ram', 'locksmith', 'counting', 'keystone'];
  const HOME_COL = ['#ff8a78', '#ffb54a', '#ffe36a', '#98e46c', '#4ad8c2', '#6fb0ff', '#ab94ff', '#ff82cc'];   // the owner's colour: one per home slot (nameplate text)
  const VBS = WORLD.VB_CELLS;
  const ALL = [...WORLD.HOME_IDS.map(i => 'c' + i), ...WORLD.TREE_CELLS.map(String), ...Object.values(VBS).map(String), WORLD.VAULT_KEY];
  const st = { seed: 'offline', trees: null, vb: null, vbNext: null, breach: null, treasury: null, crown: null, alarm: null, bars: null };   // fields seen on the wire
  const S = k => (GK.state && GK.state[k] != null ? GK.state[k] : st[k]);
  const lite = () => GK.settings.gfx === 'low';
  const entries = new Map(), failed = new Set(), stats = { built: 0, ms: 0, last: 0 };
  // ---- placeholder rolls (visual only; the server's roll replaces them the moment it arrives)
  const ph = {};
  const phTrees = () => ph.t && ph.ts === st.seed ? ph.t : (ph.ts = st.seed, ph.t = (() => { const r = mul(hashStr('trees:' + st.seed)), left = Object.keys(TREE_W), out = {}; for (const c of WORLD.TREE_CELLS) { let tot = 0; for (const k of left) tot += TREE_W[k]; let x = r() * tot, j = 0; for (; j < left.length - 1; j++) { x -= TREE_W[left[j]]; if (x < 0) break; } out[c] = left.splice(j, 1)[0]; } return out; })());
  const phVb = () => ph.v && ph.vs === st.seed ? ph.v : (ph.vs = st.seed, ph.v = (() => { const r = mul(hashStr('vb:' + st.seed)), a = VB_TYPES.slice(), out = {}; for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } Object.values(VBS).forEach((c, i) => { out[c] = a[i]; }); return out; })());
  let tmSrc = null, tmVal = null;
  function treeMap() {   // { cell: server tree type }: the server's roll (array in cell order, or { cell: type }) once all 4 are valid, else the placeholder
    const src = S('trees'); if (tmVal && src === tmSrc && (src || ph.ts === st.seed)) return tmVal;
    const out = {}; if (src) WORLD.TREE_CELLS.forEach((c, i) => { const k = WORLD.treeKind(Array.isArray(src) ? src[i] : src[c]); if (k) out[c] = k; });
    tmSrc = src; return (tmVal = Object.keys(out).length === WORLD.TREE_CELLS.length ? out : phTrees());
  }
  function vbMap(src) {   // { cell: vaultbreaker type } or null when the field is missing or partial
    const out = {}; if (src) for (const c of Object.values(VBS)) { const t = src[c]; if (VB_TYPES.includes(t)) out[c] = t; }
    return Object.keys(out).length === 4 ? out : null;
  }
  const vbNow = () => vbMap(S('vb')) || phVb();
  // ---- helpers
  const ADJ = {}; for (const d of WORLD.DOORS) { (ADJ[d.a] = ADJ[d.a] || []).push(d.b); (ADJ[d.b] = ADJ[d.b] || []).push(d.a); }
  const hopsFrom = from => { const h = { [from]: 0 }, q = [from]; for (let i = 0; i < q.length; i++) for (const k of ADJ[q[i]] || []) if (h[k] === undefined) { h[k] = h[q[i]] + 1; q.push(k); } return h; };
  const wrapAt = (key, x, z, ry, art, sx = 1, sz = 1) => { const w = new THREE.Group(); w.name = 'r5:' + key; w.userData.r5 = key; w.position.set(x, 0, z); w.rotation.y = ry; w.scale.set(sx, 1, sz); w.add(art); w.matrixAutoUpdate = false; w.updateMatrix(); scene.add(w); return w; };
  const colorOf = id => { const a = actors.get(id); return a && a.goblin != null ? [0xffd75e, 0xff9a5e, 0x9ae06e, 0x6fc8ff, 0xc89aff][a.goblin % 5] : 0xffd75e; };
  function homeState(key) {   // GK.state.homes[key] = { pump 0..1, alert, dead, lv: { lock, alarm, sentry, lockbox } }; the own home also reads the pump tank
    const hs = (GK.state && GK.state.homes && GK.state.homes[key]) || {}, lv = hs.lv || {}, tank = GK.myHome === key && GK.state && GK.state.tankCap ? GK.state.tank / GK.state.tankCap : null;
    return { pump: Math.max(0, Math.min(1, hs.pump != null ? hs.pump : tank != null ? tank : 0.55)), alert: !!hs.alert, dead: !!hs.dead, lock: lv.lock | 0, alarm: lv.alarm | 0, sentry: lv.sentry | 0, lockbox: lv.lockbox | 0 };
  }
  const BUILD = {
    home(key) {
      const c = CHEST_ROOMS[+key.slice(1)], hd = WORLD.DOORS.find(d => d.kind === 'hatch' && d.b === key), dw = hd ? 2 * (hd.hw - 0.2) : DW, ry = Math.atan2(-c.dx, -c.dz), cs = Math.cos(ry), sn = Math.sin(ry), K = WORLD.HOME_K;   // K: the art's walls (+-4.98) are scaled onto the real wall faces (+-4.7)
      let owner = homeOwner(c.id); const col = HOME_COL[(c.id >> 1) % 8];
      const home = ART.home.buildHomeRoom(THREE, {}, { doorSide: 'S', seed: c.id + 1, owner, colour: col, size: c.size, doorW: dw / K, doorH: 2.9, outZ: (c.size / 2 + T / 2 + 0.06) / K, outY: 5.25 });   // the doorway matches the hatch in WORLD.DOORS
      const wrap = wrapAt(key, c.cx, c.cz, ry, home.group, K, K), la = home.anchors.lamp, e = { key, kind: 'home', api: home, wrap, sig: 'H', hs: '' };
      e.lamp = [c.cx + (la.x * cs + la.z * sn) * K, 3.1, c.cz + (-la.x * sn + la.z * cs) * K];   // under the false ceiling: the pooled lamp of this room moves here
      e.sync = () => {
        const nm = homeOwner(c.id); if (nm !== owner) { owner = nm; home.setOwner(owner, col); }
        const s = homeState(key), sig = [s.pump.toFixed(2), s.alert ? 1 : 0, s.dead ? 1 : 0, s.lock, s.alarm, s.sentry, s.lockbox].join();
        if (sig === e.hs) return; e.hs = sig;
        home.setPumpLevel(s.pump); home.setPumpAlert(s.alert); home.setScreenPower(!s.dead); home.setUpgrade('lock', s.lock); home.setUpgrade('alarm', s.alarm); home.setUpgrade('sentry', s.sentry); home.setUpgrade('lockbox', s.lockbox);
      };
      e.update = (dt, t) => home.update(t); e.dispose = () => home.dispose();
      return e;
    },
    tree(key) {
      const cell = +key, type = treeMap()[cell], [mod, name] = TREE_ART[type], [cx, cz] = rc(cell), seed = cell * 7 + 1, M = ART[mod];
      if (!M) return null;
      const g = mod === 'ta' ? M.buildTreeRoom(THREE, { mergeGeometries: ART.merge }, name, { seed }) : M.buildTreeRoom(THREE, {}, name, { height: H, size: WORLD.W, seed, lite: lite() });
      if (!g) return null; const api = mod === 'ta' ? g.api : g.userData.api, wrap = wrapAt(key, cx, cz, 0, g);
      if (api.snap) api.snap();
      return { key, kind: 'tree', api, type, wrap, sig: 'T' + type + (lite() ? 'l' : ''), update: mod === 'ta' ? (dt, t) => api.update(dt, t) : (dt, t) => api.update(t, dt), dispose: () => api.dispose() };
    },
    vb(key) {
      const cell = +key, [cx, cz] = rc(cell), [vx, vz] = rc(WORLD.VAULT), ry = Math.atan2(-Math.sign(vx - cx) || 0, -Math.sign(vz - cz) || 0), type = vbNow()[cell];   // local north (the vault door wall) faces the vault
      const room = ART.vault.buildVaultbreaker(THREE, { glowTex }, type, { lazy: true, H });   // the group is scaled by VB_SCALE so the art walls (at the cell boundary) land on the real wall faces; the door cracks then sit on the door face
      const wrap = wrapAt(key, cx, cz, ry, room.group, WORLD.VB_SCALE[0], WORLD.VB_SCALE[1]), vd = WORLD.DOORS.find(d => d.kind === 'vault' && (d.a === key || d.b === key)), cr = room.group.getObjectByName('doorCracks');
      return { key, kind: 'vb', api: room, type, wrap, sig: 'V', door: vd && vd.id, cracks: cr && cr.parent, update: (dt, t) => room.update(dt, t), dispose: () => room.dispose() };
    },
    vault(key) {
      const dress = ART.vault.buildVaultDressing(THREE, { glowTex }, { half: WORLD.V / 2 - T / 2, H, claimR: 2.45 }), [cx, cz] = rc(WORLD.VAULT);
      return { key, kind: 'vault', api: dress, wrap: wrapAt(key, cx, cz, 0, dress.group), sig: 'D', update: (dt, t) => dress.update(dt, t), dispose: () => dress.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }) };
    },
  };
  const kindOfKey = k => k[0] === 'c' ? 'home' : k === WORLD.VAULT_KEY ? 'vault' : WORLD.TREE_CELLS.includes(+k) ? 'tree' : 'vb';
  const avail = k => { const kd = kindOfKey(k); if (kd === 'home') return !!ART.home; if (kd === 'tree') { const m = TREE_ART[treeMap()[+k]][0]; return !!ART[m] && (m !== 'ta' || !!ART.merge); } return !!ART.vault; };
  const sigFor = k => { const kd = kindOfKey(k); return kd === 'home' ? 'H' : kd === 'tree' ? 'T' + treeMap()[+k] + (lite() ? 'l' : '') : kd === 'vb' ? 'V' : 'D'; };
  const stale = k => { if (failed.has(k) || !avail(k)) return false; const e = entries.get(k); return !e || e.sig !== sigFor(k); };
  function drop(k) { const e = entries.get(k); if (!e) return; entries.delete(k); try { e.dispose(); } catch (x) {} scene.remove(e.wrap); }
  function make(k) {
    drop(k); const t0 = performance.now();
    try { const e = BUILD[kindOfKey(k)](k); if (!e) failed.add(k); else { entries.set(k, e); applyState(e); } }
    catch (x) { console.warn('room art skipped', k, x); failed.add(k); }
    stats.built++; stats.last = performance.now() - t0; stats.ms += stats.last;
  }
  // ---- server state to art (cheap, idempotent setters)
  function applyState(e) {
    if (e.kind === 'home') { e.sync(); return; }
    if (e.kind === 'vb') {
      const cell = +e.key, t = vbNow()[cell]; if (t && t !== e.type) { e.api.setSkin(t); e.type = t; }
      if (window.GKACT5) GKACT5.apply(e);   // ACT5UI: machine state, breach cracks (by side)
      return;
    }
    if (window.GKACT5) { GKACT5.apply(e); return; }   // ACT5UI drives the tree rooms and the vault dressing from actS / actMe / crown; below is the offline placeholder
    if (e.kind === 'vault') {
      const d = e.api, T = S('treasury'), tv = T == null ? 0.4 : (+T <= 1 ? +T : Math.min(1, +T / 100)); d.setTreasury(tv); for (let i = 0; i < 4; i++) d.setCoffer(i, tv);
      const cw = S('crown'), al = S('alarm'); d.setClaim(cw && cw.p != null ? cw.p : 0, cw ? colorOf(cw.id) : 0xffd75e); d.setContested(!!(cw && cw.contested)); d.setAlarm(al != null ? !!al : !!(cw && cw.alarm));
      const bars = S('bars'), b = S('breach'); for (const s in VBS) { d.setDoorBar(s, !!(bars && bars[s]), true); d.setBreach(s, (b && b[VBS[s]]) | 0); }
    }
  }
  const syncAll = () => { for (const e of entries.values()) try { applyState(e); } catch (x) {} };
  // ---- queue: nearest first by door hops from the camera's room
  let nearKey = null, order = ALL.slice(), hops = {}, idleOn = false;
  function near(key) { if (!key || key === nearKey || !WORLD.roomRect(key)) return; nearKey = key; hops = hopsFrom(key); order = ALL.slice().sort((a, b) => (hops[a] === undefined ? 99 : hops[a]) - (hops[b] === undefined ? 99 : hops[b])); }
  const later = () => { idleOn = true; if (window.requestIdleCallback) requestIdleCallback(idle, { timeout: 600 }); else setTimeout(idle, 40); };
  function idle() { idleOn = false; const k = order.find(stale); if (k) make(k); if (order.some(stale)) later(); }
  function pump() {
    const k = order.find(stale); if (!k) return;
    if ((hops[k] === undefined ? 99 : hops[k]) <= 2) make(k);   // the camera's room and its 2-hop neighbours: one room per frame
    else if (!idleOn) later();                                   // everything else: one room per idle slot
  }
  let lastT = -1, ended = false, started = false;
  function tick(t) {
    const dt = lastT < 0 ? 0.016 : Math.max(0, Math.min(0.1, t - lastT)); lastT = t;
    if (ended) return;   // after the match nothing is rebuilt (the art was disposed)
    const play = GK.mode === 'play';
    if (play && cam.position.y < H) near(WORLD.roomKeyOf(cam.position.x, cam.position.z)); else if (!play && started && GK.myHome) near(GK.myHome);   // during the wheel / countdown the own home and its neighbours are built behind the screen
    if (play || started) pump();   // the menu backdrop of an idle title builds nothing
    const vis = fxCull.active ? fxCull.vis : null;
    for (const e of entries.values()) {
      if (vis && !vis.has(e.key)) continue;   // update() only for rooms that are drawn this frame
      if (e.sync) e.sync(); else if (window.GKACT5) GKACT5.apply(e);   // ACT5UI: tree / vaultbreaker / vault art follow actS, actMe, crown
      if (e.cracks) { const d = doors[e.door]; e.cracks.visible = !(d && (d.open || d.p > 0.02)); }   // the cracks belong on the closed vault door
      e.update(dt, t);
    }
  }
  function reset() { for (const k of [...entries.keys()]) drop(k); failed.clear(); nearKey = null; hops = {}; order = ALL.slice(); lastT = -1; tmVal = null; }
  function onMsg(d) {
    if (d.matchStart || d.resumed) {
      const m = d.matchStart || d, ps = m.players || d.players || []; if (d.matchStart) reset(); ended = false; started = true;
      st.seed = ps.map(p => p.id + ':' + (p.name || '')).join('|') || 'match'; for (const k of ['breach', 'treasury', 'crown', 'alarm', 'bars']) st[k] = null;
      st.trees = m.trees || d.trees || null; st.vb = m.vb || d.vb || null; st.vbNext = m.vbNext || d.vbNext || null; tmVal = null;
    }
    let ch = false;
    if (d.trees) { st.trees = d.trees; ch = true; }
    for (const k of ['vb', 'vbNext', 'breach', 'treasury', 'alarm', 'bars']) if (d[k] !== undefined) { st[k] = d[k]; ch = true; }
    if (d.crown !== undefined) { st.crown = d.crown; ch = true; }
    if (ch) syncAll();
    if (d.matchEnd) { reset(); ended = true; started = false; }
  }
  window.addEventListener('pagehide', reset);
  return {
    entries, st, near, tick, onMsg, reset, stats, make, hopsFrom, treeMap, vbNow, syncAll, art: ART, room: key => entries.get(key) || null, pending: () => ALL.filter(stale),
    homeArt: () => !!ART.home, lampAt: key => { const e = key[0] === 'c' && entries.get(key); return e && e.lamp || null; },
  };
})();
GK.r5 = R5;
// ROOMS5ART-END
let orbit = 0.4;
function uiScale() { document.documentElement.style.setProperty('--uis', Math.max(1, Math.min(1.5, innerHeight / 720)).toFixed(3)); }   // HUD cards, hotbar, scoreboard, inventory and shop grow on tall screens (1080p: x1.5); 720p stays as designed
function resize() { uiScale(); renderer.setSize(innerWidth, innerHeight); fxResize(); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
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
// COMBAT-BEGIN (left click swings the equipped weapon, server applies damage; floating numbers, hurt vignette, health bars; see docs/reports/combat.md)
const CB = { last: 0, kills: 0, alive: 0, size: 0, floats: [], bars: new Map(), hud: null, hudSig: '', vig: null, SW: 0.34, HIT: 0.35 };
function combatSwing() {   // left click: swing animation on my own goblin now, the server decides whether anything is hit
  if (GK.mode !== 'play' || invOpen || shopOpen || !spawned || GK.locked) return false;
  const mine = actors.get(me); if (!mine) return false;
  const cb = itemsData().combat ? itemsData().combat(invReady ? myInv.weapon : null) : { cd: 600 }, now = performance.now();
  if (now - CB.last < cb.cd) return false;
  CB.last = now; CB.nextAt = now + cb.cd; /* FEEL2: cooldown end for buffer/hold */ mine.swing = 1e-4; vmSwing(mine, true); net.send({ atk: 1 }); snd('swing', { fam: mine.vmFam }); return true;
}
canvas.addEventListener('mousedown', e => { if (e.button === 0 && (lockOk() || lockRefused)) { /* FEEL2: hold + input buffer */ CB.held = true; if (!combatSwing() && CB.nextAt - performance.now() <= 180) CB.buf = true; } });   // the click that captures the mouse does not swing
// FEEL2-BEGIN (attack input buffer + hold-to-attack, directional damage arc, crosshair hit marker; see docs/reports/feel-2.md)
CB.nextAt = 0; CB.held = false; CB.buf = false; CB.arc = null; CB.arcAnim = null; CB.hm = null; CB.hmAnim = null;
addEventListener('mouseup', e => { if (e.button === 0) { CB.held = false; } });
addEventListener('blur', () => { CB.held = false; CB.buf = false; });
function feel2Tick() {   // frame(): fire a buffered click or a held button as soon as the cooldown allows, through the normal combatSwing()
  if (!CB.held && !CB.buf) return;
  if (GK.mode !== 'play' || invOpen || shopOpen || !spawned || GK.locked) { CB.buf = false; return; }
  if (CB.held && !lockOk() && !lockRefused) { CB.held = false; return; }   // lock dropped (Esc): stop auto-swinging
  if (performance.now() < CB.nextAt) return;
  CB.buf = false; combatSwing();
}
function feel2Arc(f) {   // short-lived red arc at the screen edge, pointing toward the attacker's bearing (forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw))
  const mine = actors.get(me), px = mine ? mine.x : P.x, pz = mine ? mine.z : P.z, dx = f.x - px, dz = f.z - pz;
  if (dx * dx + dz * dz < 0.04) return;
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), ang = Math.atan2(dx * cy - dz * sy, -dx * sy - dz * cy);
  if (!CB.arc) {
    const w = document.createElement('div'); w.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;z-index:46;pointer-events:none;opacity:0';
    const r = document.createElement('div'); r.style.cssText = 'position:absolute;border-radius:50%;background:conic-gradient(from -34deg,rgba(255,40,28,0) 0deg,rgba(255,40,28,.9) 14deg,rgba(255,40,28,.9) 54deg,rgba(255,40,28,0) 68deg,rgba(255,40,28,0) 360deg);-webkit-mask-image:radial-gradient(circle closest-side,transparent calc(100% - 30px),#000 calc(100% - 22px),#000 calc(100% - 8px),transparent 100%);mask-image:radial-gradient(circle closest-side,transparent calc(100% - 30px),#000 calc(100% - 22px),#000 calc(100% - 8px),transparent 100%);filter:drop-shadow(0 0 6px rgba(255,30,20,.8))';
    w.appendChild(r); document.body.appendChild(w); CB.arc = { w, r, rad: 0 };
  }
  const a = CB.arc, rad = Math.round(Math.min(innerWidth, innerHeight) * 0.36);
  if (a.rad !== rad) { a.rad = rad; a.r.style.width = a.r.style.height = 2 * rad + 'px'; a.r.style.left = a.r.style.top = -rad + 'px'; }
  a.w.style.transform = 'rotate(' + ang + 'rad)';
  if (CB.arcAnim) CB.arcAnim.cancel();
  CB.arcAnim = a.w.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
}
function feel2HitMark(kill) {   // small white X at screen centre for ~120 ms; larger and gold on a kill
  if (!CB.hm) {
    const e = document.createElement('div'); e.style.cssText = 'position:fixed;left:50%;top:50%;width:0;height:0;z-index:46;pointer-events:none;opacity:0';
    e.innerHTML = '<svg width="44" height="44" viewBox="-22 -22 44 44" style="position:absolute;left:-22px;top:-22px;overflow:visible;filter:drop-shadow(0 0 2px rgba(0,0,0,.9))"><g fill="none" stroke-width="2.6" stroke-linecap="round"><path d="M-9 -9L-4.5 -4.5M9 -9L4.5 -4.5M-9 9L-4.5 4.5M9 9L4.5 4.5"/></g></svg>';
    document.body.appendChild(e); CB.hm = { e, g: e.querySelector('g') };
  }
  CB.hm.g.setAttribute('stroke', kill ? '#ffd75e' : '#ffffff');
  if (CB.hmAnim) CB.hmAnim.cancel();
  const s = kill ? 1.45 : 1; CB.hmAnim = CB.hm.e.animate([{ opacity: 1, transform: 'scale(' + (s * 1.25) + ')' }, { opacity: 1, transform: 'scale(' + s + ')', offset: 0.35 }, { opacity: 0, transform: 'scale(' + s + ')' }], { duration: kill ? 170 : 120 });
}
// FEEL2-END
function combatSync(a, p) { if (p.stats && p.stats.health != null) { a.hp = p.stats.health; a.maxHp = p.stats.maxHealth || p.stats.health; } if (p.kills != null) a.kills = p.kills; }
function combatFloat(text, pos, color, size) {   // floating damage number (a sprite that rises and fades)
  const c = document.createElement('canvas'); c.width = 160; c.height = 80; const g = c.getContext('2d');
  g.font = '800 54px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(text, 80, 42); g.fillStyle = color; g.fillText(text, 80, 42);
  const tex = new THREE.CanvasTexture(c), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(size * 2, size, 1); sp.position.copy(pos); sp.renderOrder = 999; scene.add(sp); CB.floats.push({ sp, t: 0, x: (Math.random() - 0.5) * 0.4 });
}
function combatHurtFx(dmg, max) {   // red vignette + screen number when I am hurt
  if (!CB.vig) { CB.vig = document.createElement('div'); CB.vig.style.cssText = 'position:fixed;inset:0;z-index:45;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 42%,rgba(190,8,8,.55) 78%,rgba(120,0,0,.85) 100%)'; document.body.appendChild(CB.vig); }
  CB.vig.animate([{ opacity: Math.min(1, 0.5 + 2 * dmg / (max || 40)) }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
  const f = document.createElement('div'); f.textContent = '-' + dmg;
  f.style.cssText = 'position:fixed;left:50%;top:58%;z-index:90;pointer-events:none;color:#ff4a3a;font:800 34px system-ui,sans-serif;text-shadow:0 2px 10px #000';
  document.body.appendChild(f); f.animate([{ opacity: 1, transform: 'translate(-50%,0)' }, { opacity: 0, transform: 'translate(-50%,-50px)' }], 900).onfinish = () => f.remove();
}
const vmArmKey = n => { if (!n) return null; const I = itemsData().ITEMS; for (const k in I) if (I[k].type === 'armor' && I[k].name === n) return k; return null; };   // FEEL3: armour name -> item key
const snd = (n, o) => { try { window.GKAUDIO && GKAUDIO.play(n, o); } catch (e) {} };   // combat sounds (audio.js)
function combatMsg(d) {   // server messages: swing, hit, kills, match (goblins left)
  if (d.swing != null && d.swing !== me) { const a = actors.get(d.swing); if (a) { a.swing = 1e-4; vmSwing(a, false); snd('swing', { x: a.x, z: a.z, vol: 0.7, fam: a.vmFam }); } }
  if (d.hit) {
    const h = d.hit, v = actors.get(h.to), f = actors.get(h.from); if (h.from === me) vmHit(h);
    if (v) {
      v.hp = h.hp; v.maxHp = h.max; v.hitT = h.bleed ? 0 : CB.HIT;   /* WEAPONS3: a bleed tick is just a number, no lean or flash */
      const dx = f ? v.x - f.x : 0, dz = f ? v.z - f.z : 1, l = Math.hypot(dx, dz) || 1; v.kx = dx / l; v.kz = dz / l;
      const y = (h.to === me ? 1.4 : 2.0) * (SCALE[v.goblin] || 1);
      combatFloat('-' + h.dmg, new THREE.Vector3(v.x, y, v.z), h.from === me ? '#ffd75e' : '#ffffff', 0.5);
      if (!h.bleed) { const burst = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));   // red hit flash on the victim (sprite only, no lights)
      burst.scale.set(1.3, 1.3, 1); burst.position.set(v.x, 1.0 * (SCALE[v.goblin] || 1), v.z); scene.add(burst); CB.floats.push({ sp: burst, t: 0, flash: true }); }
    }
    if (v && !h.bleed) try { const sc = SCALE[v.goblin] || 1, dx = v.x - (f ? f.x : v.x), dz = v.z - (f ? f.z : v.z - 1), l = Math.hypot(dx, dz) || 1, ak0 = h.to === me ? (invReady ? myInv.armor : null) : (v.gArm !== undefined ? vmArmKey(v.gArm) : null); GKVFX.hit({ x: v.x - dx / l * 0.3, y: 1.1 * sc, z: v.z - dz / l * 0.3 }, { x: dx / l, z: dz / l }, f && f.vmFam, ak0 && itemsData().ITEMS[ak0] && itemsData().ITEMS[ak0].family, h.dmg, h.dead); if (h.dead) GKVFX.ring(v.x, v.z, 0xffd75e, 1.5); } catch (e) {} // VFX
    if (!h.bleed) { const fam = f && f.vmFam, ak = h.to === me ? (invReady ? myInv.armor : null) : (v && v.gArm !== undefined ? vmArmKey(v.gArm) : null), ait = ak && itemsData().ITEMS[ak], armor = ait && ait.family; /* FEEL3: weapon and armour families pick the hit sound */
      if (h.to === me) { combatHurtFx(h.dmg, h.max); snd('hit', { fam, armor, vol: 0.7 }); snd('hurt'); try { GK.feel.hurt(h.dmg, h.max); } catch (e) {} if (f) feel2Arc(f); /* FEEL2 */ } else if (v) snd('hit', h.from === me ? { fam, armor } : { x: v.x, z: v.z, fam, armor }); }
  }
  if (d.dodge) { const v = actors.get(d.dodge.to); if (v && (d.dodge.to === me || d.dodge.from === me)) combatFloat('dodged', new THREE.Vector3(v.x, 1.8 * (SCALE[v.goblin] || 1), v.z), '#9ae6d0', 0.42); }   // GOBTYPES: the scout's nimble perk
  if (d.kills != null) { CB.kills = d.kills; toastMsg('Goblin defeated!  Kills: ' + d.kills + (d.bounty ? '   +' + d.bounty + ' gold' : ''), true); }   /* PACE: bounty */
  if (d.match) { CB.alive = d.match.alive | 0; CB.size = d.match.size | 0; }
}
function combatBar(a, id) {   // small health bar sprite over another goblin's head
  let b = CB.bars.get(id);
  if (b && b.a !== a) { b.tex.dispose(); CB.bars.delete(id); b = null; }
  if (!b) {
    if (window.GKTAGS) {   // UI-TAGS: a shared-atlas bar sprite (client/ui/tags.js), hidden at full health
      const sp = window.GKTAGS.healthBar(); sp.position.y = a.group.userData.label.position.y + 0.2; a.group.add(sp);
      b = { a, tex: { dispose() {} }, sp, sig: '', atlas: true }; CB.bars.set(id, b);
    } else {
    const c = document.createElement('canvas'); c.width = 128; c.height = 16; const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(0.9, 0.11, 1); sp.position.y = a.group.userData.label.position.y + 0.26; sp.renderOrder = 5; a.group.add(sp);
    b = { a, c, tex, sp, sig: '' }; CB.bars.set(id, b);
    }
  }
  const hp = Math.max(0, a.hp), max = a.maxHp || 1, sig = hp + '/' + max;
  if (b.atlas) { if (b.sig !== sig) { b.sig = sig; b.full = !window.GKTAGS.setBar(b.sp, Math.max(0, Math.min(1, hp / max))); } b.sp.visible = !b.full && GK.settings.tags !== false; return; }
  if (b.sig !== sig) {
    b.sig = sig; const g = b.c.getContext('2d'), f = Math.max(0, Math.min(1, hp / max));
    g.clearRect(0, 0, 128, 16); g.fillStyle = 'rgba(10,10,14,.85)'; g.fillRect(0, 0, 128, 16);
    g.fillStyle = f > 0.5 ? '#5ed05e' : f > 0.25 ? '#e0b030' : '#e04a3a'; g.fillRect(2, 2, 124 * f, 12);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 127, 15); b.tex.needsUpdate = true;
  }
  b.sp.visible = GK.settings.tags !== false;
}
function combatHud(mine) {   // health bar next to the stats panel, plus kills and "Goblins left"
  if (!CB.hud) {
    CB.hud = document.createElement('div');
    CB.hud.style.cssText = 'order:-1;padding:9px 12px;border-radius:10px;background:rgba(10,10,16,.62);border:1px solid rgba(255,90,74,.4);color:#f2efe6;font:600 14px/1.5 system-ui,sans-serif;pointer-events:none;display:none;text-shadow:0 1px 4px #000;';
    leftStack().appendChild(CB.hud);
  }
  const play = GK.mode === 'play' && mine && mine.hp != null;
  const hp = play ? Math.max(0, mine.hp) : 0, max = play ? (mine.maxHp || 1) : 1, left = CB.alive > 0 ? CB.alive : CB.size, sig = play + '|' + hp + '|' + max + '|' + left + '|' + CB.kills;
  if (sig === CB.hudSig) return; CB.hudSig = sig;
  CB.hud.style.display = play ? 'block' : 'none'; if (!play) return;
  const f = Math.max(0, Math.min(100, 100 * hp / max));
  CB.hud.innerHTML = '<div style="display:flex;justify-content:space-between"><span style="color:#ff8a7a;letter-spacing:.06em">HEALTH</span><span>' + hp + ' / ' + max + '</span></div>'
    + '<div style="height:12px;border-radius:6px;background:#2a2a34;margin:3px 0 7px;overflow:hidden"><div style="height:100%;width:' + f + '%;background:linear-gradient(90deg,#c0392b,#e8564a);transition:width .25s"></div></div>'
    + '<div style="display:flex;justify-content:space-between"><span>Goblins left</span><b style="color:#ffd75e">' + left + '</b></div>'
    + '<div style="display:flex;justify-content:space-between"><span>Kills</span><b>' + CB.kills + '</b></div>';
}
function combatTick(dt) {   // called every frame after the goblin loop: swing, hit reaction, bars, floating numbers, HUD
  for (const [id, a] of actors) {
    const u = a.group.userData;
    if (a.swing) {   // arm sweep over CB.SW seconds
      a.swing += dt / vmSw(a);   // VIEWMODEL: duration and pose depend on the weapon family
      if (a.swing >= 1) { a.swing = 0; vmEnd3(a, u); } else { vmPose3(a, u); try { vfxSwing(id, a, u); } catch (e) {} /* VFX */ }
    }
    if (a.hitT > 0) {   // knockback + lean, purely visual (the real position never changes)
      a.hitT -= dt; const e = Math.max(0, a.hitT) / CB.HIT, s = Math.sin(Math.PI * (1 - e));
      a.group.position.x += a.kx * 0.3 * s; a.group.position.z += a.kz * 0.3 * s; u.torso.rotation.x = (u.hunch ?? 0.14) - 0.5 * s; u.head.rotation.x = -0.35 * s; a.hitLean = true;
    } else if (a.hitLean) { a.hitLean = false; u.torso.rotation.x = u.hunch ?? 0.14; }
    if (id !== me && a.hp != null) combatBar(a, id);
  }
  for (const [id, b] of CB.bars) if (actors.get(id) !== b.a) { b.tex.dispose(); CB.bars.delete(id); }
  for (let i = CB.floats.length - 1; i >= 0; i--) {
    const q = CB.floats[i]; q.t += dt;
    const life = q.flash ? 0.28 : 0.95;
    if (q.t >= life) { scene.remove(q.sp); if (q.sp.material.map && !q.flash) q.sp.material.map.dispose(); q.sp.material.dispose(); CB.floats.splice(i, 1); continue; }
    const k = q.t / life;
    if (q.flash) { q.sp.material.opacity = 0.9 * (1 - k); q.sp.scale.setScalar(1.3 + k); } else { q.sp.position.y += dt * 1.1; q.sp.position.x += q.x * dt; q.sp.material.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; }
  }
  combatHud(actors.get(me));
}
GK.attack = combatSwing; GK.combatState = CB; GK.combatHurtFx = combatHurtFx;
// COMBAT-END
// VFX-BEGIN (T15: small glue for vfx.js: surface lookup and the weapon swing trail; everything else is called inline, tagged VFX)
const vfxSurf = (x, z) => roomKeyAt(x, z) == WORLD.VAULT ? 'gold' : 'dust';
const vfxTip = new THREE.Vector3(), vfxBase = new THREE.Vector3();
function vfxSwing(id, a, u) {   // melee swings only: one pooled ribbon per goblin, sampled while the blow travels (no ribbon for bows and casters)
  const cls = VM_CLASS[a.vmFam]; if (!cls || cls === 'bow' || cls === 'cast') return;
  const p = a.swing, hit = VM_HITAT[cls]; if (p < hit - 0.3 || p > hit + 0.1) return;
  const col = cls === 'smash' ? 0xe0a060 : 0x8fb0e8;
  if (id === me && !a.group.visible) {   // first person: an arc in front of the camera
    const k = clamp((p - (hit - 0.3)) / 0.4, 0, 1), sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let f = 0.95, sx = 0, h = 0;
    if (cls === 'slash') { sx = 0.75 - 1.5 * k; h = 0.2 - 0.45 * k; } else if (cls === 'thrust') { f = 0.5 + 1.0 * k; sx = 0.25; h = -0.12; } else { f = 0.9; sx = 0.3; h = 0.55 - 1.1 * k; }
    const f0 = cls === 'thrust' ? f - 0.4 : f - 0.2;
    vfxTip.set(cam.position.x + fx * f + rx * sx, cam.position.y + h, cam.position.z + fz * f + rz * sx);
    vfxBase.set(cam.position.x + fx * f0 + rx * sx * 0.6, cam.position.y + h - 0.05, cam.position.z + fz * f0 + rz * sx * 0.6);
  } else {   // other goblins: the swinging arm extended by the weapon
    const arm = u.arms[1]; arm.updateWorldMatrix(true, false);
    vfxTip.set(0, -1.15, 0); arm.localToWorld(vfxTip); vfxBase.set(0, -0.6, 0); arm.localToWorld(vfxBase);
  }
  GKVFX.trail(id, vfxTip, vfxBase, col);
}
// VFX-END
// VIEWMODEL-BEGIN (first-person weapon + goblin hands, per-family attack clips, third-person weapon socket + family swings; see docs/reports/viewmodel.md)
// Rules: no lights, no render passes. The camera is a scene child so the viewmodel is lit by the environment map and emissive only. Hooks elsewhere: vmUpdate/vmHide (frame), vmSwing/vmHit (combat), vmGear (player list), vmSw/vmPose3 (combatTick).
const VM = { root: new THREE.Group(), rp: new THREE.Group(), lp: new THREE.Group(), wm: new THREE.Group(), key: undefined, fam: 'fist', model: null, hand: [], t: -1, dur: 0.4, clip: null, side: 0, stop: 0, kick: 0, shake: 0, eq: 1, want: undefined, lyaw: 0, lpit: 0, lagX: 0, lagY: 0, fired: false, shook: false, tip: new THREE.Vector3(0, 0.9, 0), tracers: [], active: false };
const VM_FAM_MELEE = { whip: 1, sword: 1, dagger: 1, club: 1, mace: 1, axe: 1, flail: 1, hammer: 1, halberd: 1, spear: 1 };
const VM_CLASS = { sword: 'slash', dagger: 'slash', spear: 'thrust', axe: 'smash', mace: 'smash', club: 'smash', flail: 'smash', hammer: 'smash', halberd: 'smash', bow: 'bow', crossbow: 'bow', staff: 'cast', scepter: 'cast', whip: 'slash', sling: 'slash', wand: 'cast' };
const VM_SC = { sword: 0.34, dagger: 0.34, spear: 0.24, axe: 0.3, mace: 0.28, club: 0.33, flail: 0.28, hammer: 0.29, halberd: 0.23, bow: 0.34, crossbow: 0.3, staff: 0.28, scepter: 0.32, whip: 0.3, sling: 0.38, wand: 0.4 };   // model units -> first-person metres
const VM_GRIP = { sword: -0.3, dagger: -0.4, spear: -0.3, axe: -0.5, mace: -0.55, club: -0.35, flail: -0.5, hammer: -0.4, halberd: -0.4, bow: 0, crossbow: -0.2, staff: -0.3, scepter: -0.4, whip: -0.45, sling: -0.15, wand: -0.15 };   // grip point along the model's +y
const VM_TILT = { sword: -0.35, dagger: -0.35, spear: -1.05, axe: -0.3, mace: -0.3, club: -0.3, flail: -0.3, hammer: -0.3, halberd: -0.8, bow: 0, crossbow: -1.45, staff: -0.25, scepter: -0.3, whip: -0.5, sling: -0.5, wand: -0.45 };   // base pitch of the weapon in the hand
// first-person only (third person keeps VM_SC): bigger bow, spear and a slightly smaller axe so the limb and string, the spear head and the whole axe head read on screen
const VM_FPX = { bow: 1.82, spear: 2.5, axe: 0.87 };
const VM_ADJ = { bow: { rot: [0, 0.5, 0.12] }, crossbow: { rot: [-1.2, -0.7, 0.2], pos: [-0.05, 0, 0] }, spear: { rot: [-0.7, 0, 0] }, axe: { rot: [-0.1, 0, 0] } };   // per-family overrides of the weapon's pose in the hand: { rot: [x, y, z], pos: [x, y, z] } (applied after the tables above)
const VM_SECS = { slash: 0.46, thrust: 0.5, smash: 0.7, bow: 0.66, cast: 0.6, fist: 0.32 };   // clip length at most; also capped to 0.85 x the weapon cooldown
const VM_HITAT = { slash: 0.44, thrust: 0.4, smash: 0.56, bow: 0.64, cast: 0.46, fist: 0.4 };   // when the blow lands inside the clip (fraction)
// T10: the hand uses the goblin skin look (pore/wart bump, warm rim + subsurface bleed from GA.skinPatch, redder knuckles) and the sleeve the stitched cloth weave
const vmBump = GA.bump.clone(); vmBump.repeat.set(2.5, 2.5); vmBump.needsUpdate = true;
const vmWeave = GA.clothTex(1).clone(); vmWeave.repeat.set(2, 3); vmWeave.needsUpdate = true;
const vmSkin = GA.skinPatch(new THREE.MeshStandardMaterial({ color: 0x6aa238, roughness: 0.55, metalness: 0, emissive: 0x24520f, emissiveIntensity: 0.16, envMapIntensity: 0.9, bumpMap: vmBump, bumpScale: 1.6 }), 'vm-skin');
const vmSkinDeep = GA.skinPatch(new THREE.MeshStandardMaterial({ color: 0x7e8a34, roughness: 0.6, emissive: 0x4a1a0c, emissiveIntensity: 0.35, bumpMap: vmBump, bumpScale: 2.4 }), 'vm-skin');
const vmLeather = new THREE.MeshStandardMaterial({ color: 0x8a5a30, map: vmWeave, roughness: 0.88, emissive: 0x2a1608, emissiveIntensity: 0.3 });
const vmClaw = new THREE.MeshStandardMaterial({ color: 0xe8dfc0, roughness: 0.5, emissive: 0x4a4430, emissiveIntensity: 0.4 });
const vmSph = new THREE.SphereGeometry(1, 14, 10), vmCap = new THREE.CapsuleGeometry(0.02, 0.07, 4, 10), vmCone = new THREE.ConeGeometry(0.012, 0.035, 6), vmCyl = new THREE.CylinderGeometry(1, 1, 1, 14);
function vmHandMesh(side) {   // grip axis = local y, palm behind (+z), three chunky fingers wrapped in front (-z), thumb on the near side; forearm runs back toward the camera
  const g = new THREE.Group(), add = (geo, mat, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m; };
  add(vmSph, vmSkin, 0, 0, 0.05, 0.058, 0.075, 0.05);   // palm: behind the handle, so the weapon sits in the grip instead of passing through it
  for (let i = -1; i <= 1; i++) {
    const f = add(vmCap, vmSkin, 0, i * 0.047, -0.03, 1.05, 1, 1.05); f.rotation.z = Math.PI / 2;   // finger wrapped across the handle
    add(vmSph, vmSkinDeep, -side * 0.058, i * 0.047, -0.024, 0.028, 0.026, 0.026);                     // knuckle (redder, bigger)    const c = add(vmCone, vmClaw, side * 0.062, i * 0.047, -0.04, 1.1, 1.1, 1.1); c.rotation.z = -side * 1.35; c.rotation.x = 0.5;   // claw
  }
  const th = add(vmCap, vmSkin, side * 0.05, 0.062, -0.012, 1.15, 0.85, 1.15); th.rotation.z = side * 0.5; th.rotation.x = 0.2;   // thumb
  add(vmCone, vmClaw, side * 0.06, 0.1, -0.03, 1.1, 1.1, 1.1).rotation.z = side * 0.4;
  g.traverse(o => { o.frustumCulled = false; }); return PERF2_ON ? perf2MergeGroup(g) : g;   // PERF2: 12 meshes -> 3 (skin, knuckles, claws)
}
const vmGlowMat = col => new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 });
VM.burst = new THREE.Sprite(vmGlowMat(0x7affd8)); VM.burst.visible = false; VM.burst.renderOrder = 30;
const vmTrailTex = (() => {   // faint crescent, drawn diagonally from upper right to lower left, brightest at the leading end
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  const grd = g.createLinearGradient(220, 40, 36, 216); grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.55, 'rgba(255,244,214,.55)'); grd.addColorStop(1, 'rgba(255,255,255,.95)');
  g.strokeStyle = grd; g.lineCap = 'round'; g.lineWidth = 16; g.beginPath(); g.moveTo(214, 38); g.quadraticCurveTo(190, 190, 44, 218); g.stroke();
  g.lineWidth = 5; g.beginPath(); g.moveTo(206, 54); g.quadraticCurveTo(184, 176, 50, 204); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
VM.trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: vmTrailTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0, side: THREE.DoubleSide }));
VM.trail.position.set(0.02, -0.03, -0.62); VM.trail.scale.set(0.8, 0.8, 1); VM.trail.renderOrder = 29; VM.trail.visible = false;
VM.arrow = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 6), new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.7, emissive: 0x3a2a10 })); VM.arrow.rotation.x = Math.PI / 2; VM.arrow.visible = false;
VM.hand = [vmHandMesh(1), vmHandMesh(-1)]; VM.rp.add(VM.hand[0]); VM.lp.add(VM.hand[1]); VM.rp.add(VM.wm);
VM.arms = [1, -1].map(side => { const arm = new THREE.Mesh(vmCyl, vmSkin), br = new THREE.Mesh(vmCyl, vmLeather); VM.root.add(arm, br); return { arm, br, side }; });   // forearms are anchored off-screen and stretch to the wrist
VM.root.add(VM.rp, VM.lp, VM.trail, VM.arrow); VM.root.visible = false; VM.root.traverse(o => { o.frustumCulled = false; });
cam.add(VM.root); scene.add(cam);   // the camera must be in the scene for its children to render
const vmV1 = new THREE.Vector3(), vmV2 = new THREE.Vector3(), vmV3 = new THREE.Vector3(), vmY = new THREE.Vector3(0, 1, 0);
const vmRP = new THREE.Vector3(0.33, -0.3, -0.6), vmLP = new THREE.Vector3(-0.23, -0.27, -0.5);
const vmFamOf = key => { const it = key && itemsData().ITEMS[key]; return it && it.type === 'weapon' ? it.family : null; };
const vmSm = x => x * x * (3 - 2 * x), vmRamp = (p, a, b) => Math.min(1, Math.max(0, (p - a) / (b - a)));
function vmKf(p, K, out) {   // keyframes [[t, v0..v5], ...] eased; fills out[6]
  let i = 1; while (i < K.length - 1 && p > K[i][0]) i++;
  const a = K[i - 1], b = K[i], u = vmSm(Math.min(1, Math.max(0, (p - a[0]) / (b[0] - a[0]))));
  for (let k = 0; k < 6; k++) out[k] = a[k + 1] + (b[k + 1] - a[k + 1]) * u; return out;
}
//        t   x      y      z     rx     ry    rz        (offsets from the rest pose of the weapon hand)
const VM_CLIPS = {
  slash: [[0, 0, 0, 0, 0, 0, 0], [0.26, 0.1, 0.13, 0.06, 0.4, 0, -1.0], [0.46, -0.2, 0.04, -0.26, -0.75, 0, 1.0], [0.62, -0.22, 0.03, -0.24, -0.8, 0, 1.05], [1, 0, 0, 0, 0, 0, 0]],
  dagger: [[0, 0, 0, 0, 0, 0, 0], [0.2, 0.07, 0.07, 0.05, 0.25, 0, -0.7], [0.4, -0.15, 0.03, -0.24, -0.7, 0, 0.8], [0.58, -0.16, 0.02, -0.22, -0.75, 0, 0.85], [1, 0, 0, 0, 0, 0, 0]],
  thrust: [[0, 0, 0, 0, 0, 0, 0], [0.28, 0.02, 0.0, 0.16, 0.15, 0, 0.05], [0.42, -0.02, 0.02, -0.46, -0.1, 0, 0], [0.6, -0.02, 0.02, -0.46, -0.1, 0, 0], [1, 0, 0, 0, 0, 0, 0]],
  smash: [[0, 0, 0, 0, 0, 0, 0], [0.42, 0.02, 0.3, 0.12, 1.25, 0, 0.1], [0.56, 0, -0.26, -0.3, -1.2, 0, -0.05], [0.7, 0, -0.27, -0.3, -1.2, 0, -0.05], [1, 0, 0, 0, 0, 0, 0]],
  cast: [[0, 0, 0, 0, 0, 0, 0], [0.22, 0.03, 0.1, 0.1, 0.55, 0, 0.25], [0.46, -0.04, 0.2, -0.28, -0.9, 0, -0.2], [0.7, 0, 0.14, -0.2, -0.6, 0, 0.1], [1, 0, 0, 0, 0, 0, 0]],
  fist: [[0, 0, 0, 0, 0, 0, 0], [0.18, 0.02, -0.03, 0.12, 0.15, 0, 0], [0.4, -0.04, 0.05, -0.48, -0.1, 0, 0], [0.55, -0.04, 0.05, -0.46, -0.1, 0, 0], [1, 0, 0, 0, 0, 0, 0]],
};
const vmPose = [0, 0, 0, 0, 0, 0];
function vmSetWeapon(key) {   // swap the model in the hand (called at the bottom of the equip dip)
  if (VM.model) { VM.wm.remove(VM.model); VM.model = null; }
  VM.key = key; VM.fam = vmFamOf(key) || 'fist';
  const fist = VM.fam === 'fist'; VM.hand[1].visible = true;
  if (!fist && GK.chestKit && GK.chestKit.weaponModel) {
    try {
      const m = GK.chestKit.weaponModel(key), sc = (VM_SC[VM.fam] || 0.35) * (VM_FPX[VM.fam] || 1), wrap = new THREE.Group();
      m.scale.multiplyScalar(sc); m.position.set(0, -VM_GRIP[VM.fam] * sc, 0); wrap.add(m);
      m.traverse(o => { o.frustumCulled = false; if (o.isSprite) { o.scale.multiplyScalar(0.45); o.renderOrder = 28; } });
      const box = new THREE.Box3().setFromObject(m); VM.tip.set(0, Math.max(0.3, box.max.y), 0);
      VM.wm.add(wrap); VM.model = wrap;
    } catch (e) { VM.model = null; }
  }
  VM.wm.visible = !fist; VM.wm.rotation.set(VM_TILT[VM.fam] || 0, 0, 0);
  const cls = VM_CLASS[VM.fam];
  VM.wm.position.set(0, 0, 0);
  if (cls === 'bow') { VM.wm.rotation.set(0, Math.PI / 2, 0); if (VM.fam === 'crossbow') VM.wm.rotation.set(VM_TILT.crossbow, 0, 0); }
  const adj = VM_ADJ[VM.fam]; if (adj) { if (adj.rot) VM.wm.rotation.set(adj.rot[0], adj.rot[1], adj.rot[2]); if (adj.pos) VM.wm.position.set(adj.pos[0], adj.pos[1], adj.pos[2]); }
  VM.burst.visible = false; VM.burst.parent && VM.burst.parent.remove(VM.burst);
  if (cls === 'cast' && VM.model) { VM.burst.material.color.setHex(VM.fam === 'staff' ? 0x7affd8 : 0xffc933); VM.burst.position.copy(VM.tip); VM.model.add(VM.burst); }
}
function vmStart(fam, cd, side) {   // begin my own attack clip
  const cls = fam ? VM_CLASS[fam] || 'slash' : 'fist';
  VM.clip = fam === 'dagger' ? 'dagger' : cls; VM.cls = cls; VM.t = 0; VM.dur = Math.min(VM_SECS[cls] * (fam === 'dagger' ? 0.78 : fam === 'hammer' || fam === 'halberd' ? 1.2 : 1), (cd || 600) / 1000 * 0.85);
  VM.fired = false; VM.shook = false; VM.side = side;
}
function vmSwing(a, isMe) {   // hook: a.swing was just set (combatSwing for me, {swing} for others)
  const key = isMe ? (invReady ? myInv.weapon : null) : a.vmKey, fam = vmFamOf(key);
  a.vmFam = fam; a.punch = !a.punch;
  if (isMe) { vmStart(fam, itemsData().combat(key).cd, a.punch ? 1 : 0); }
}
function vmHit(h) {   // hook: the server confirmed my hit: recoil + hit-stop (heavier for big weapons)
  const heavy = VM_CLASS[VM.fam] === 'smash' ? 1 : VM_CLASS[VM.fam] === 'thrust' ? 0.7 : 0.5;
  feel2HitMark(!!h.dead); /* FEEL2 */ VM.stop = 0.06 + 0.03 * heavy; VM.kick = 1; VM.shake = Math.max(VM.shake, 0.35 + 0.5 * heavy);
}
function vmGear(a, p) { a.vmName = p.gear && p.gear.weapon || null; }   // hook: other goblins' weapon arrives as a name in the player list
const vmByName = (() => { let m = null; return name => { if (!name) return null; if (!m) { m = {}; const I = itemsData().ITEMS; for (const k in I) if (I[k].type === 'weapon') m[I[k].name] = k; } return m[name] || null; }; })();
function vmTracer(dir, from) {   // thin arrow streak flying forward in world space (no physics, ~0.3 s)
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(vmTracer.geo || (vmTracer.geo = new THREE.CylinderGeometry(0.012, 0.004, 1.6, 6)), mat); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); m.position.copy(from).addScaledVector(dir, 0.9);
  const sp = new THREE.Sprite(vmGlowMat(0xffe29a)); sp.material.opacity = 0.8; sp.scale.setScalar(0.35); m.add(sp); sp.position.y = 0.8; scene.add(m); VM.tracers.push({ m, dir: dir.clone(), t: 0 });
}
function vmUpdate(dt, t, mine) {   // hook: every frame after the actor loop, before the camera is finalised
  // third person: weapon in the hand socket of every goblin (mine from my inventory, others from the player list)
  for (const [id, a] of actors) {
    const key = id === me ? (invReady ? myInv.weapon : null) : vmByName(a.vmName);
    if (a.vmKey !== key || a.vmMount === undefined) {
      const u = a.group.userData, hand = u.arms[1].userData.el.userData.hand;
      if (a.vmMount) hand.remove(a.vmMount);
      a.vmMount = null; a.vmKey = key; a.vmFam = vmFamOf(key);
      if (key && GK.chestKit && GK.chestKit.weaponModel) {
        try {
          const m = GK.chestKit.weaponModel(key), f = a.vmFam, mnt = new THREE.Group(), sc = (VM_SC[f] || 0.35) * 0.45;
          m.scale.multiplyScalar(sc); m.position.set(0, -(VM_GRIP[f] || 0) * sc, 0); mnt.add(m); mnt.rotation.set(f === 'bow' || f === 'crossbow' ? 0.2 : 1.35, f === 'bow' ? Math.PI / 2 : 0, 0); mnt.position.set(0, -0.03, 0.05);
          m.traverse(o => { if (o.isSprite) o.visible = false; });
          hand.add(mnt); a.vmMount = mnt; a.group.userData.vmSocket = mnt;
        } catch (e) { a.vmMount = null; }
      }
    }
  }
  const bad = !(inside && mine && spawned && GK.mode === 'play' && !invOpen && !shopOpen && !(mine.hp != null && mine.hp <= 0));
  VM.active = !bad; VM.root.visible = !bad; if (bad) { VM.t = -1; VM.burst.visible = false; }
  for (let i = VM.tracers.length - 1; i >= 0; i--) {
    const q = VM.tracers[i]; q.t += dt; q.m.position.addScaledVector(q.dir, 48 * dt); q.m.material.opacity = 0.95 * (1 - q.t / 0.32);
    if (q.t >= 0.32) { scene.remove(q.m); q.m.material.dispose(); q.m.children.forEach(c => c.material.dispose()); VM.tracers.splice(i, 1); }
  }
  if (bad) return;
  // equip: lower, swap, raise
  const want = invReady ? myInv.weapon : null;
  if (VM.key === undefined) { vmSetWeapon(want); VM.eq = 1; } else if (want !== VM.key && VM.eq >= 1) { VM.eq = 0; VM.want = want; }
  if (VM.eq < 1) { const was = VM.eq; VM.eq = Math.min(1, VM.eq + dt / 0.42); if (was < 0.48 && VM.eq >= 0.48) { vmSetWeapon(VM.want); VM.t = -1; } }
  const eqL = VM.eq < 0.48 ? vmSm(VM.eq / 0.48) : 1 - vmSm((VM.eq - 0.48) / 0.52);   // 0 raised .. 1 lowered
  // hit-stop freezes the clip for a moment
  if (VM.stop > 0) VM.stop -= dt; else if (VM.t >= 0) { VM.t += dt; if (VM.t >= VM.dur) VM.t = -1; }
  const p = VM.t >= 0 ? VM.t / VM.dur : -1, cls = VM.fam === 'fist' ? 'fist' : VM_CLASS[VM.fam], moving = clamp(P.speed / 3.5, 0, 1);
  // sway, bob, look lag
  const dyaw = wrapPi(P.yaw - VM.lyaw), dpit = P.pitch - VM.lpit; VM.lyaw = P.yaw; VM.lpit = P.pitch;
  VM.lagX += (-dyaw * 0.9 - VM.lagX) * Math.min(1, dt * 9) * 0.5 - VM.lagX * Math.min(1, dt * 4); VM.lagY += (dpit * 0.9 - VM.lagY) * Math.min(1, dt * 9) * 0.5 - VM.lagY * Math.min(1, dt * 4);
  const lx = clamp(VM.lagX, -0.12, 0.12), ly = clamp(VM.lagY, -0.1, 0.1), ph = mine.phase;
  const ox = Math.sin(t * 1.1) * 0.004 + Math.sin(ph * 0.5) * 0.014 * moving + lx, oy = Math.sin(t * 1.6) * 0.004 + Math.abs(Math.sin(ph)) * 0.02 * moving - 0.01 * moving + ly - eqL * 0.5 + JUMP.vmY();
  VM.kick = Math.max(0, VM.kick - dt * 7);
  VM.root.position.set(ox, oy, VM.kick * 0.045); VM.root.rotation.set(eqL * 0.7 + VM.kick * 0.05 + Math.sin(t * 1.3) * 0.004 + ly * 0.6, -lx * 1.2, -lx * 0.8 + Math.sin(ph * 0.5) * 0.012 * moving);
  // clip pose
  const pose = vmPose; pose.fill(0); let draw = 0, punchSide = VM.side;
  if (p >= 0) {
    vmKf(p, VM_CLIPS[VM.clip] || VM_CLIPS.fist, pose);
    if (cls === 'bow') { draw = vmSm(vmRamp(p, 0, 0.58)) * (1 - vmRamp(p, 0.62, 0.7)); pose.fill(0); pose[2] = 0.0; pose[3] = -0.02 * draw; if (p > 0.62) { pose[2] = 0.05 * (1 - vmRamp(p, 0.62, 0.95)); pose[3] = 0.12 * (1 - vmRamp(p, 0.62, 0.95)); } }
    if (cls === 'slash') { const tr = vmSm(vmRamp(p, 0.26, 0.5)) * (1 - vmRamp(p, 0.52, 0.8)); VM.trail.visible = tr > 0.01; VM.trail.material.opacity = 0.4 * tr; VM.trail.scale.set(0.4 + 0.3 * vmSm(vmRamp(p, 0.26, 0.5)), 0.4 + 0.3 * vmSm(vmRamp(p, 0.26, 0.5)), 1); VM.trail.rotation.z = VM.fam === 'dagger' ? 0.1 : 0; } else VM.trail.visible = false;
    if (cls === 'smash' && !VM.shook && p >= 0.56) { VM.shook = true; VM.shake = Math.max(VM.shake, 0.55); }
    if (cls === 'bow' && !VM.fired && p >= 0.64) {
      VM.fired = true; const d = new THREE.Vector3(); cam.getWorldDirection(d); const from = new THREE.Vector3(0.18, -0.16, -0.5).applyMatrix4(cam.matrixWorld);
      vmTracer(d, from); VM.kick = 0.8;
    }
    if (cls === 'cast') { const b = vmRamp(p, 0.4, 1); VM.burst.visible = b > 0 && b < 1; VM.burst.material.opacity = Math.sin(b * Math.PI) * 0.95; VM.burst.scale.setScalar(0.18 + 0.7 * vmSm(b)); }
  } else { VM.trail.visible = false; if (VM.burst.visible) VM.burst.visible = false; }
  VM.arrow.visible = cls === 'bow' && VM.fam === 'bow' && p >= 0 && draw > 0.02;
  // place the hands
  const R = VM.rp, L = VM.lp;
  R.visible = true; L.visible = cls === 'fist' || (cls === 'bow' && VM.fam === 'bow');
  if (cls === 'fist') {
    const rs = punchSide === 1;   // right fist throws on odd swings
    R.position.copy(vmRP).add(new THREE.Vector3(-0.02, 0.0, 0.02)); L.position.copy(vmLP).add(new THREE.Vector3(0.02, 0, 0.02)); R.rotation.set(-1.0, 0, 0); L.rotation.set(-1.0, 0, 0);
    const T = rs ? R : L, s = rs ? 1 : -1;
    T.position.x += s * -0.0 + pose[0] * s * -1; T.position.y += pose[1]; T.position.z += pose[2]; T.rotation.x += pose[3]; T.rotation.y += pose[4] * s; T.position.x += (rs ? -0.12 : 0.12) * Math.sin(Math.min(1, p < 0 ? 0 : p / 0.4) * Math.PI / 2) * (p >= 0 && p < 0.6 ? 1 : 0);
    const brth = Math.sin(t * 1.5) * 0.006; R.position.y += brth; L.position.y -= brth;
  } else if (cls === 'bow' && VM.fam === 'bow') {
    R.position.set(0.2, -0.24, -0.62 + pose[2]); R.rotation.set(pose[3], 0, 0); VM.wm.rotation.set(0, Math.PI / 2, 0); L.rotation.set(-0.2, 0, 0);
    L.position.set(0.2, -0.24, -0.5 + 0.2 * draw + (p >= 0.64 ? 0.05 * (1 - vmRamp(p, 0.64, 0.8)) : 0)); if (p < 0) L.position.set(0.1, -0.34, -0.42);
    VM.arrow.position.set(0.2, -0.24, L.position.z - 0.3); L.position.y += Math.sin(t * 1.5) * 0.004;
  } else {
    R.position.set(vmRP.x + pose[0], vmRP.y + pose[1] + Math.sin(t * 1.5) * 0.004, vmRP.z + pose[2]); R.rotation.set(pose[3], pose[4], pose[5]);
    if (VM.fam === 'crossbow') { R.position.set(0.24 + pose[0], -0.28 + pose[1], -0.5 + pose[2]); R.rotation.set(pose[3] * 0.4, 0, 0); if (p >= 0) R.position.z += 0.06 * Math.max(0, 1 - Math.abs(p - 0.64) * 6); L.visible = false; }
  }
  for (let i = 0; i < 2; i++) {   // stretch each forearm from its fixed shoulder anchor to the wrist
    const A = VM.arms[i], P_ = i ? L : R, vis = P_.visible; A.arm.visible = A.br.visible = vis; if (!vis) continue;
    const wr = vmV1.set(0, -0.02, 0.075).applyEuler(P_.rotation).add(P_.position), an = vmV2.set(A.side * 0.34, -0.62, 0.15), dir = vmV3.copy(wr).sub(an), len = dir.length(); dir.divideScalar(len);
    A.arm.position.copy(an).addScaledVector(dir, len * 0.5); A.arm.scale.set(0.043, len, 0.043); A.arm.quaternion.setFromUnitVectors(vmY, dir);
    A.br.position.copy(wr).addScaledVector(dir, -0.07); A.br.scale.set(0.051, 0.14, 0.051); A.br.quaternion.copy(A.arm.quaternion);
  }
  // camera shake (after the pose; cam rotation is reset every frame)
  if (VM.shake > 0.001) { const k = VM.shake; cam.rotation.x += (Math.random() - 0.5) * 0.02 * k; cam.rotation.y += (Math.random() - 0.5) * 0.016 * k; cam.rotation.z += (Math.random() - 0.5) * 0.014 * k; VM.shake *= Math.pow(0.002, dt); }
}
function vmHide() { VM.root.visible = false; }   // hook: menu / early-return path of frame()
// ---- third person: per-family arm clips driven by a.swing (0..1)
const vmSw = a => { const c = VM_CLASS[a.vmFam] || (a.vmFam ? 'slash' : 'fist'); return Math.max(0.25, VM_SECS[c] * (a.vmFam === 'dagger' ? 0.78 : 1) * 1); };
function vmPose3(a, u) {   // arm/torso pose for one swing frame; combatTick resets nothing, vmEnd3 clears what these set
  const p = a.swing, cls = a.vmFam ? VM_CLASS[a.vmFam] || 'slash' : 'fist', arm = u.arms[1], el = arm.userData.el, bell = vmSm(vmRamp(p, 0.1, VM_HITAT[cls])) * (1 - vmSm(vmRamp(p, VM_HITAT[cls] + 0.1, 1)));
  if (cls === 'slash') { arm.rotation.x = -0.4 - 1.9 * bell; arm.rotation.z = 0.9 * (1 - 2 * vmSm(vmRamp(p, 0.15, 0.5))) * (1 - vmRamp(p, 0.6, 1)); el.rotation.x = -0.4 * bell; u.torso.rotation.y += 0.5 * bell; }
  else if (cls === 'thrust') { const w = vmSm(vmRamp(p, 0, 0.28)) * (1 - vmSm(vmRamp(p, 0.28, 0.42))), th = vmSm(vmRamp(p, 0.28, 0.42)) * (1 - vmSm(vmRamp(p, 0.62, 1))); arm.rotation.x = -1.35 * Math.max(w, th) ; el.rotation.x = -1.1 * w; u.torso.rotation.x += 0.3 * th - 0.15 * w; u.torso.rotation.y += 0.25 * th; }
  else if (cls === 'smash') { const up = vmSm(vmRamp(p, 0, 0.42)) * (1 - vmSm(vmRamp(p, 0.42, 0.56))), dn = vmSm(vmRamp(p, 0.42, 0.56)) * (1 - vmSm(vmRamp(p, 0.7, 1))); arm.rotation.x = -3.0 * up - 0.9 * dn; el.rotation.x = -0.5 * up; u.torso.rotation.x += -0.3 * up + 0.4 * dn; }
  else if (cls === 'bow') { const dr = vmSm(vmRamp(p, 0, 0.58)) * (1 - vmSm(vmRamp(p, 0.64, 0.8))), hold = vmSm(vmRamp(p, 0, 0.2)) * (1 - vmSm(vmRamp(p, 0.8, 1))); u.arms[0].rotation.x = -1.5 * hold; arm.rotation.x = -1.5 * hold; el.rotation.x = -1.3 * dr; u.torso.rotation.y += -0.3 * hold; }
  else if (cls === 'cast') { const up = vmSm(vmRamp(p, 0, 0.46)) * (1 - vmSm(vmRamp(p, 0.55, 1))); arm.rotation.x = -2.4 * up; arm.rotation.z = 0.5 * Math.sin(p * Math.PI * 2) * up; u.torso.rotation.x += -0.12 * up; }
  else { const A = a.punch ? u.arms[1] : u.arms[0], s = a.punch ? 1 : -1, pb = vmSm(vmRamp(p, 0.05, 0.4)) * (1 - vmSm(vmRamp(p, 0.4, 0.9))); A.rotation.x = -0.15 - 1.5 * pb; A.userData.el.rotation.x = -0.3 * pb; u.torso.rotation.y += s * -0.4 * pb; if (A !== arm) arm.rotation.x = -0.15; }
}
function vmEnd3(a, u) { const arm = u.arms[1]; arm.rotation.z = 0; arm.userData.el.rotation.x = 0; u.arms[0].userData.el.rotation.x = 0; }
GK.vm = { tables: { VM_SC, VM_GRIP, VM_TILT, VM_ADJ, VM_FPX }, rebuild: key => vmSetWeapon(key), state: VM, setWeapon(key) { if (typeof myInv === 'object') { myInv.weapon = key; invReady = true; } return key; }, swing: () => combatSwing(), tracers: VM.tracers };   // GK.vm.setWeapon is a test hook: local equip without the server
// VIEWMODEL-END
// SOCIAL-BEGIN (reconnect grace overlay + auto-retry, "disconnected" icon, goblin emotes on keys 4-7; see docs/reports/social.md)
const SOC = (() => {
  const S = { token: null, net: null, rc: null, boot: null, unloading: false, lastEmote: 0 };
  const EM = [{ name: 'Taunt', icon: '\u{1F624}', snd: 'emoteTaunt', dur: 1.7 }, { name: 'Laugh', icon: '\u{1F602}', snd: 'emoteLaugh', dur: 1.8 }, { name: 'Point', icon: '\u{1F449}', snd: 'emotePoint', dur: 1.5 }, { name: 'Dance', icon: '\u{1F3B5}', snd: 'emoteDance', dur: 2.6 }];
  const KEYS = { Digit4: 0, Digit5: 1, Digit6: 2, Digit7: 3 }, BUBBLE_S = 2;
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const mx = (o, p, v, e) => { o[p] += (v - o[p]) * e; };   // blend a joint toward the emote pose
  const now = () => performance.now() / 1000;
  const FRESH_MS = 15000, BOOT_MS = 8000;   // a reload resumes only inside the server's grace period; the resume gets 8 s to answer
  const stamp = () => { try { sessionStorage.setItem('gk.tokenT', String(Date.now())); sessionStorage.setItem('gk.tokenO', JSON.stringify({ c: GK.charId, w: GK.wins | 0 })); } catch (e) {} };   // 'last seen connected' time + the saved character, next to gk.token
  function clear() { S.token = null; try { for (const k of ['gk.token', 'gk.tokenT', 'gk.tokenO']) sessionStorage.removeItem(k); } catch (e) {} }   // a clean exit (death, win, cancel, main menu): nothing to resume
  try { S.token = sessionStorage.getItem('gk.token'); } catch (e) {}
  addEventListener('beforeunload', () => { S.unloading = true; if (S.token && GK.mode === 'play') stamp(); });
  setInterval(() => { if (S.token && GK.mode === 'play' && S.net && S.net.state() === 1) stamp(); }, 2000);   // so a reload can tell how long ago the socket was alive (also after a crash)
  // ---- icon sprites (one texture per emote, one for the disconnected icon; sprites are created per goblin on demand)
  const texes = {};
  const bubbleTex = (key, draw) => {
    if (texes[key]) return texes[key];
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(250,246,232,.96)'; g.strokeStyle = '#1a1208'; g.lineWidth = 6; g.beginPath(); g.roundRect ? g.roundRect(8, 8, 112, 90, 22) : g.rect(8, 8, 112, 90); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(44, 96); g.lineTo(58, 122); g.lineTo(72, 96); g.closePath(); g.fill(); g.stroke(); g.fillRect(48, 92, 20, 8);
    draw(g); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return texes[key] = t;
  };
  const emoTex = n => bubbleTex('e' + n, g => { g.font = '66px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(EM[n].icon, 64, 56); });
  const dcTex = () => bubbleTex('dc', g => {   // a crossed-out signal: three arcs and a red slash
    g.strokeStyle = '#2a2a2a'; g.lineWidth = 8; g.lineCap = 'round';
    for (let i = 1; i <= 3; i++) { g.beginPath(); g.arc(64, 78, 14 * i, Math.PI * 1.22, Math.PI * 1.78); g.stroke(); }
    g.fillStyle = '#2a2a2a'; g.beginPath(); g.arc(64, 78, 6, 0, 7); g.fill();
    g.strokeStyle = '#e02a1a'; g.lineWidth = 10; g.beginPath(); g.moveTo(34, 24); g.lineTo(94, 80); g.stroke();
  });
  function sprite(a, key) {   // lazily add a sprite to the goblin's group
    const u = a.group.userData; if (a[key]) return a[key];
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false })); s.renderOrder = 6; s.visible = false;
    s.position.y = (u.label ? u.label.position.y : 2) + 0.5; a.group.add(s); return a[key] = s;
  }
  // ---- emotes
  function play(a, n, mine) {   // start emote n on actor a (sound, bubble, pose clock)
    if (!a || !EM[n]) return;
    const t = now(); a.em = { n, t0: t }; a.emB = t;
    const s = sprite(a, 'emoSpr'); s.material.map = emoTex(n); s.material.needsUpdate = true; s.visible = true;
    snd(EM[n].snd, mine ? { vol: 0.9 } : { x: a.x, z: a.z, vol: 0.9 });
  }
  function pose(a, u, t) {   // called every frame per goblin after GA.anim: overlay the emote on the head, ears, arms and torso
    const em = a.em; if (!em) return;
    const tt = t - em.t0, D = EM[em.n].dur;
    if (tt >= D) { a.em = null; }
    else {
      const k = tt / D, e = sm(0, 0.12, k) * (1 - sm(0.85, 1, k)), L = u.arms[0], R = u.arms[1], rig = u.rig, hd = u.head, to = u.torso, hu = u.hunch || 0;
      if (em.n === 0) {   // taunt: both fists thump the chest, chin up
        const b = Math.abs(Math.sin(tt * 11));
        for (const [A, s] of [[L, 1], [R, -1]]) { mx(A.rotation, 'x', -0.7 - 0.3 * b, e); mx(A.rotation, 'z', s * 0.45, e); mx(A.userData.el.rotation, 'x', -2.1, e); }
        mx(to.rotation, 'x', hu - 0.3 + 0.08 * b, e); mx(hd.rotation, 'x', -0.4, e); mx(hd.rotation, 'y', 0, e); rig.position.y += 0.03 * b * e;
      } else if (em.n === 1) {   // laugh: belly shakes, head thrown back, ears flap, hands on the belly
        const s = Math.sin(tt * 24);
        mx(to.rotation, 'x', hu - 0.2 + 0.1 * s, e); mx(hd.rotation, 'x', -0.55 + 0.08 * s, e); mx(hd.rotation, 'y', 0, e); rig.position.y += Math.abs(s) * 0.04 * e;
        for (const [A, sg] of [[L, 1], [R, -1]]) { mx(A.rotation, 'x', -0.45, e); mx(A.rotation, 'z', sg * 0.2, e); mx(A.userData.el.rotation, 'x', -1.5 + 0.1 * s, e); }
        u.earL.rotation.z += 0.35 * s * e; u.earR.rotation.z -= 0.35 * s * e;
      } else if (em.n === 2) {   // point: right arm straight out, poking, left hand on the hip, a stern look
        const p = Math.sin(tt * 9) * 0.1;
        mx(R.rotation, 'x', -1.5 + p, e); mx(R.rotation, 'z', 0.05, e); mx(R.userData.el.rotation, 'x', -0.08, e);
        mx(L.rotation, 'z', -0.55, e); mx(L.userData.el.rotation, 'x', -1.7, e); mx(to.rotation, 'y', -0.25, e); mx(hd.rotation, 'y', 0.2, e); mx(hd.rotation, 'x', 0.05 + p * 0.3, e);
      } else {   // dance: a little jig, arms alternate up and down, hips swing
        const w = tt * 8.5, sn = Math.sin(w);
        rig.position.y += Math.abs(sn) * 0.1 * e; mx(rig.rotation, 'z', sn * 0.14, e); mx(rig.rotation, 'y', Math.sin(w * 0.5) * 0.5, e);
        mx(L.rotation, 'x', -1.1 - sn * 0.7, e); mx(L.rotation, 'z', -0.7, e); mx(R.rotation, 'x', -1.1 + sn * 0.7, e); mx(R.rotation, 'z', 0.7, e);
        mx(L.userData.el.rotation, 'x', -0.5, e); mx(R.userData.el.rotation, 'x', -0.5, e);
        mx(to.rotation, 'y', sn * 0.4, e); mx(hd.rotation, 'z', sn * 0.25, e); mx(hd.rotation, 'x', -0.1, e);
        mx(u.legs[0].rotation, 'x', sn * 0.7, e); mx(u.legs[1].rotation, 'x', -sn * 0.7, e);
      }
    }
  }
  function bubble(a, u, t) {   // the speech-bubble icon: pops in, bobs, fades out after BUBBLE_S seconds
    const s = a.emoSpr, tt = t - a.emB;
    if (tt >= BUBBLE_S) { s.visible = false; a.emB = 0; return; }
    const pop = 0.55 * (tt < 0.18 ? 1.25 * Math.sin(tt / 0.18 * Math.PI / 2) : 1.25 - 0.25 * sm(0.18, 0.35, tt));
    s.scale.set(pop, pop, 1); s.material.opacity = 1 - sm(BUBBLE_S - 0.4, BUBBLE_S, tt); s.position.y = (u.label ? u.label.position.y : 2) + 0.5 + 0.04 * Math.sin(tt * 5);
  }
  function actor(a, u, id, t) {   // hook: per goblin per frame
    if (a.dc !== a.dcShown) { a.dcShown = a.dc; const s = sprite(a, 'dcSpr'); s.material.map = dcTex(); s.material.needsUpdate = true; s.scale.set(0.55, 0.55, 1); s.material.opacity = 1; s.visible = !!a.dc; }
    if (a.dc && a.dcSpr) a.dcSpr.position.y = (u.label ? u.label.position.y : 2) + 0.5 + 0.03 * Math.sin(t * 3);
    if (a.em) pose(a, u, t);
    if (a.emB) bubble(a, u, t);
  }
  function fp(t) {   // hook: after vmUpdate: my viewmodel hand does a matching small gesture
    const a = actors.get(me), em = a && a.em; if (!em || !VM.root.visible) return;
    const tt = t - em.t0, D = EM[em.n].dur; if (tt >= D) return;
    const k = tt / D, e = sm(0, 0.12, k) * (1 - sm(0.85, 1, k)), r = VM.root;
    if (em.n === 0) { const b = Math.abs(Math.sin(tt * 11)); r.position.x -= 0.18 * e; r.position.y += (0.16 + 0.03 * b) * e; r.rotation.x += (0.5 + 0.12 * b) * e; r.rotation.z += 0.3 * e; }
    else if (em.n === 1) { const s = Math.sin(tt * 24); r.position.y += (0.05 + 0.02 * s) * e; r.position.x -= 0.06 * e; r.rotation.z += 0.08 * s * e; r.rotation.x += 0.15 * e; }
    else if (em.n === 2) { const p = Math.sin(tt * 9) * 0.03; r.position.x -= 0.12 * e; r.position.y += 0.12 * e; r.position.z += (-0.18 + p) * e; r.rotation.x += 0.6 * e; }
    else { const w = tt * 8.5; r.position.x += Math.sin(w) * 0.1 * e; r.position.y += (0.05 + Math.abs(Math.sin(w)) * 0.06) * e; r.rotation.z += Math.sin(w) * 0.25 * e; r.rotation.y += Math.sin(w * 0.5) * 0.2 * e; }
  }
  addEventListener('keydown', e => {   // keys 4-7 (no other handler uses Digit4..Digit7)
    const n = KEYS[e.code]; if (n === undefined || e.repeat || e.ctrlKey || e.altKey || e.metaKey || GK.mode !== 'play' || invOpen || shopOpen || S.rc) return;
    const a = actors.get(me), t = now(); if (!a || !spawned || t - S.lastEmote < 1) return;
    S.lastEmote = t; play(a, n, true); net.send({ emote: n });
  });
  // ---- reconnect
  let ov = null;
  function overlay(head, text, menu) {
    if (!ov) { ov = document.createElement('div'); ov.id = 'gkLost'; document.body.appendChild(ov); try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {} }
    ov.innerHTML = '<div class="c"><h2></h2><p></p><div class="r"><button class="no" id="gkSocMenu">Main menu</button></div></div>';
    ov.querySelector('h2').textContent = head; ov.querySelector('p').textContent = text; const b = ov.querySelector('.r'); if (!menu) b.style.display = 'none'; else document.getElementById('gkSocMenu').onclick = () => { clear(); location.reload(); };
  }
  function stopRc() { if (S.rc) { clearInterval(S.rc.timer); } if (ov) { ov.remove(); ov = null; } }
  function fail() {
    if (S.rc) { clearInterval(S.rc.timer); S.rc.done = true; }
    overlay('Connection lost', 'Could not get back into the match.', true); snd('deny');
  }
  function startRc() {
    const rc = S.rc = { t0: performance.now(), last: -1e9, done: false };
    const step = () => {
      if (rc.done) return; const el = performance.now() - rc.t0, left = Math.ceil((15000 - el) / 1000);
      if (left <= 0) return fail();
      overlay('Connection lost', 'Reconnecting… ' + left, false);
      if (el - rc.last >= 2000 && S.net && S.net.state() >= 2) { rc.last = el; S.net.reopen(S.token); }
    };
    rc.timer = setInterval(step, 500); step();
  }
  function bootFail() {   // the resume was refused or never answered: forget the token and show the normal title
    if (!S.boot) return; clearTimeout(S.boot.timer); S.boot = null; clear(); location.reload();
  }
  return {
    attach: n => { S.net = n; },
    pending() {   // start-up (menu.js): {token, charId, wins} when a match can be resumed (token stored less than 15 s ago), else null
      try {
        const tk = sessionStorage.getItem('gk.token'), age = Date.now() - +sessionStorage.getItem('gk.tokenT');
        if (tk && age >= 0 && age < FRESH_MS) { let o = null; try { o = JSON.parse(sessionStorage.getItem('gk.tokenO')); } catch (e) {} return { token: tk, charId: o && o.c != null ? o.c : null, wins: o ? o.w | 0 : 0 }; }
      } catch (e) {}
      clear(); return null;
    },
    resume(r) {   // connect with ?token= right away, no title; matchOnMsg enters the match on {resumed:1}
      S.token = r.token; S.boot = { timer: setTimeout(bootFail, BOOT_MS) };
      overlay('Rejoining…', 'Getting you back into the match.', false);
      GK.resume({ resume: r.token, charId: r.charId, wins: r.wins });
    },
    booted() { if (!S.boot) return false; clearTimeout(S.boot.timer); S.boot = null; stopRc(); return true; },   // the welcome is applied: the match view takes over
    clear,
    onClose() {   // makeNet: the socket closed. true = handled here (a reconnect is running)
      if (S.boot) { bootFail(); return true; }
      if (S.unloading) return true;
      if (S.rc) return true;
      if (!S.token || GK.mode !== 'play') return false;
      startRc(); return true;
    },
    onMsg(d) {
      if (d.token) { S.token = d.token; try { sessionStorage.setItem('gk.token', d.token); } catch (e) {} }
      if (d.resumed && S.rc) { stopRc(); S.rc = null; toastMsg && toastMsg('Reconnected', true); }
      if (d.resumeFail && S.rc && !S.rc.done) fail();
      if (d.resumeFail && S.boot) bootFail();
      if (d.emote) { const a = actors.get(d.emote.id); if (a && d.emote.id !== me) play(a, d.emote.n, false); }
    },
    sync: (a, p) => { a.dc = !!p.dc; },
    actor, fp, play, drop: () => { S.net && S.net.drop(); }, names: EM.map(x => x.name), state: S
  };
})();
GK.social = SOC;
// SOCIAL-END
// JUMP-BEGIN (Space: a cosmetic hop. y moves only my camera, my goblin, the viewmodel and the snapshot; collision, doors, ranges and hits stay 2D, so jumping dodges nothing; server side is the JUMP block in server.js)
const JUMP = (() => {
  const H = 0.9, T = 0.55, G = 8 * H / (T * T), V0 = 4 * H / T, COYOTE = 0.08, BUF = 0.1, DIPT = 0.26;   // 0.9 m apex, 0.55 s in the air
  const J = { y: 0, vy: 0, air: false, buf: 0, coy: COYOTE, dipT: 9 };
  const active = () => GK.mode === 'play' && !invOpen && !shopOpen && !GK.locked && spawned;
  const dip = () => { const k = J.dipT / DIPT; return k >= 1 ? 0 : Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k); };   // 0..1 landing bump
  const start = () => { J.air = true; J.vy = V0; J.coy = 0; J.buf = 0; snd('hup'); try { GKVFX.jump(P.x, P.z, vfxSurf(P.x, P.z)); } catch (e) {} /* VFX */ };
  J.key = e => {
    if (e.code !== 'Space') return;
    const tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!active()) return;
    e.preventDefault();   // no page scroll, no focused button pressed
    if (!e.repeat) J.buf = BUF;
  };
  J.step = (dt, on) => {
    if (!on) J.buf = 0; else J.buf = Math.max(0, J.buf - dt);
    J.dipT += dt;
    if (!J.air) { J.coy = COYOTE; if (on && J.buf > 0) start(); }   // coyote: there are no ledges yet, so the grace never decides anything; a jump pressed after walking off one would still count for 80 ms
    if (J.air) {
      J.y += J.vy * dt - 0.5 * G * dt * dt; J.vy -= G * dt;
      if (J.y <= 0) { J.y = 0; J.vy = 0; J.air = false; J.dipT = 0; snd('thud'); try { GKVFX.land(P.x, P.z, vfxSurf(P.x, P.z)); } catch (e) {} /* VFX */ if (on && J.buf > 0) start(); }
    }
  };
  J.camY = () => J.y - (GK.settings.bob === false ? 0 : 0.07 * dip());   // landing dip follows the head bob setting
  J.vmY = () => (J.air ? 0.035 * clamp(J.vy / V0, -0.5, 1) : 0) - (GK.settings.bob === false ? 0 : 0.05 * dip());
  J.tail = () => (J.y > 0.004 ? [Math.round(J.y * 100)] : []);   // 4th element of {m}: height in cm, only while airborne
  J.pose = (a, u, id, dt) => {   // after GA.anim: ears flop (rising: down, falling: up, landing: a bounce), remote hop sounds
    const y = a.jy || 0, py = a.jyP || 0; a.jyP = y;
    if (id !== me && dt > 0) { const o = { x: a.x, z: a.z }; if (py < 0.01 && y > 0.03) snd('hup', o); else if (py > 0.03 && y < 0.01) snd('thud', o); }
    const vy = dt > 0 ? (y - py) / dt : 0, air = y > 0.01;
    let tg = air ? clamp(vy / 5, -1, 1) : 0; if (!air && py > 0.01) a.jfl = 1;   // landing: ears slap down
    a.jfl = (a.jfl || 0) + (tg - (a.jfl || 0)) * Math.min(1, dt * (air ? 16 : 9));
    if (Math.abs(a.jfl) < 0.01 || !u.earL) return;
    for (let i = 0; i < 2; i++) { const ear = i ? u.earR : u.earL, s = i ? 1 : -1; ear.rotation.z += s * 0.85 * a.jfl; ear.rotation.x += 0.3 * a.jfl; }
  };
  return J;
})();
// JUMP-END
function frame(now) {
  const dt = clamp((now - last) / 1000, 0.001, 0.05); last = now; const t = now / 1000;
  if (GK.mode !== 'play' && GK.mode !== 'dead' && GK.mode !== 'win') { vmHide(); GK.menu && GK.menu.render(now, dt); requestAnimationFrame(frame); return; }
  if (GK.mode === 'win' && WINSTAGE.on) { if (GK.feel) GK.feel.tick(dt, now); winStageRender(now, dt); requestAnimationFrame(frame); return; }   // MENU2: the victory stage replaces the world view
  panelTick();
  /* FEEL-BEGIN */ if (GK.feel) GK.feel.tick(dt, now); /* FEEL-END */
  const mine = actors.get(me);
  feel2Tick();   // FEEL2: buffered / held attack
  // my movement
  if (mine && spawned && GK.mode === 'play' && !invOpen && !shopOpen && !GK.locked) {
    const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const sp = (GK.carryHeavy ? 4.6 * 0.7 : keys.has('ShiftLeft') || keys.has('ShiftRight') ? 7.5 : 4.6) * ((itemsData().SPEED || [])[mine.goblin] || (0.85 + 0.15 * SCALE[mine.goblin])) * (invReady && itemsData().armorSpeed ? itemsData().armorSpeed(myInv.armor) : 1) * (window.GKUSE ? GKUSE.speedMul() : 1);   // ARMOUR-2: worn armour speed   // BALANCE: class speed table (items.js SPEED, shared with the server): small fastest, big slowest
    let mx = -Math.sin(P.yaw) * f + Math.cos(P.yaw) * s, mz = -Math.cos(P.yaw) * f - Math.sin(P.yaw) * s;
    const len = Math.hypot(mx, mz) || 1; mx = mx / len * sp * dt * (f || s ? 1 : 0); mz = mz / len * sp * dt * (f || s ? 1 : 0);
    const ox = P.x, oz = P.z;
    if (!blocked(P.x + mx, P.z)) P.x += mx;
    if (!blocked(P.x, P.z + mz)) P.z += mz;
    if (WORLD.slide && (mx || mz)) { const [qx, qz] = WORLD.slide(ox, oz, P.x, P.z, RAD, CHEST_ROOMS); if (qx !== P.x || qz !== P.z) { const bz0 = P.z; P.x = blocked(qx, bz0) ? ox : qx; P.z = blocked(P.x, qz) ? oz : qz; } }   // SOLID: slide around crates, barrels, urns and the pedestal (world.js footprints, shared with the server)
    run.dist += Math.hypot(P.x - ox, P.z - oz);
    P.speed += (Math.hypot(P.x - ox, P.z - oz) / dt - P.speed) * Math.min(1, dt * 12);
    mine.x = P.x; mine.z = P.z; mine.yaw = P.yaw; mine.speed = P.speed;
    sendT += dt; if (sendT > 0.066) { sendT = 0; net.send({ m: [+P.x.toFixed(2), +P.z.toFixed(2), +P.yaw.toFixed(3), ...JUMP.tail()] }); }
  }
  JUMP.step(dt, !!(mine && spawned && GK.mode === 'play' && !invOpen && !shopOpen && !GK.locked));   // JUMP
  // doors
  for (const d of doors) {
    if (d.hatch) {   // 5x5: home hatches are open archways; HOME PHASE: the round-1 grille drops / rises (d.p 0 = shut, 1 = open; the blocker lets you through above 0.86)
      const tp = d.locked ? 0 : 1; if (d.p !== tp) { d.p = clamp(d.p + (tp ? 1 : -1) * dt / 1.4, 0, 1); d.bars.position.y = d.p * (d.dh + 0.05); d.bars.visible = d.p < 0.995; }
      continue;
    }
    const near = d.open, prev = d.p;   // doors open/close from the round state (GK.setDoorsOpen)
    const vault = !d.slide, dur = vault ? 2.4 : 0.8;
    d.p = clamp(d.p + (near ? 1 : -1) * dt / dur, 0, 1);
    if (prev <= 0.0005 && d.p > prev) { doorBurst(d); d.flash = 0.9; }
    d.flash = Math.max(0, d.flash - dt);
    if (d.slide) d.leaf.position.x = d.p * (DW + 0.15);
    else {
      const bolt = Math.min(d.p / 0.3, 1), swing = Math.max((d.p - 0.3) / 0.7, 0);
      d.leaf.rotation.y = -d.sgn * swing * 1.75;
      for (let i = 0; i < d.wheels.length; i++) d.wheels[i].rotation.z = d.p * Math.PI * 3;   // PERF: plain loops, no closure per door per frame
      for (let i = 0; i < d.rings.length; i++) d.rings[i].rotation.z = -d.p * Math.PI * 2;
      for (let i = 0; i < d.bolts.length; i++) { const b = d.bolts[i]; b.position.x = b.userData.x0 + b.userData.sx * 0.38 * (1 - bolt); }
      const lf = Math.max(0, 1 - d.p / 0.25); d.laserM.opacity = 0.5 * lf * (0.8 + 0.2 * Math.sin(t * 40));
      for (let i = 0; i < d.lasers.length; i++) d.lasers[i].visible = lf > 0.01;
      const sy = 0.4 + (Math.sin(t * 1.6) * 0.5 + 0.5) * (d.dh - 0.8);
      for (let i = 0; i < d.scan.length; i++) { const l = d.scan[i]; l.visible = lf > 0.01; l.position.y = sy; }
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
    if (rs) for (let i = 0; i < d.rots.length; i++) { const r = d.rots[i]; r.rotation.z += dt * rs * r.userData.dir; }
    if (d.eyeM) d.eyeM.opacity = 0.65 + 0.3 * Math.sin(t * 2.4 + d.id);
  }
  dfxUpdate(dt);
  // goblins
  const nrt = netRenderT(dt);   // NET: server time that remote goblins are drawn at
  perf2ViewBegin();   // PERF2
  for (const [id, a] of actors) {
    if (id !== me) {
      const s = netSample(a, nrt), nx = s ? s.x : a.x, nz = s ? s.z : a.z;
      a.speed += (Math.hypot(nx - a.x, nz - a.z) / dt - a.speed) * Math.min(1, dt * 8);
      a.x = nx; a.z = nz; if (s) a.yaw = s.yaw; a.jy = s ? s.y : 0;   // JUMP: remote height from the snapshots
    } else { netFixStep(a, dt); a.jy = JUMP.y; }
    const u = a.group.userData, g = a.group;
    g.position.set(a.x, a.jy || 0, a.z); g.rotation.y = a.yaw + Math.PI;
    g.visible = !(inside && id === me);
    u.label.visible = id !== me && GK.settings.tags;
    if (window.GKTAGS && u.label.visible) { const tb = CB.bars.get(id), td = Math.hypot(cam.position.x - a.x, cam.position.y - (g.position.y + u.label.position.y), cam.position.z - a.z); window.GKTAGS.fit(u.label, td, true); if (tb && tb.sp.visible) window.GKTAGS.fit(tb.sp, td, true); }   // UI-TAGS: clamp size, fade up close
    const walk = clamp(a.speed / 3.5, 0, 1); a.phase += dt * a.speed * 2.7 / Math.pow(SCALE[u.type] || 1, 0.6);   // stride rate follows the leg length (small goblins scurry, big ones lumber) so the feet stay planted
    try { GKVFX.foot(id, a.phase, a.speed, a.x, a.z, a.jy || 0, vfxSurf(a.x, a.z), 1, cam.position.x, cam.position.z); } catch (e) {} // VFX: footstep puffs
    /* PERF2-BEGIN: far goblins refresh their pose every 2nd / 3rd frame (the skipped dt is carried over); distant ones also drop to simpler geometry */
    let adt = dt;
    if (PERF2_ON) {
      const dx = a.x - cam.position.x, dz = a.z - cam.position.z, dy = cam.position.y - 1, d2 = dx * dx + dz * dz + dy * dy;
      if (id !== me && u.lodList) perf2LodStep(u, d2, PERF2_LOD[GK.settings.gfx] || PERF2_LOD.high);
      adt = a.pdt ? a.pdt + dt : dt;
      if (perf2Skip(a, id, d2)) { a.pdt = adt; continue; }
      a.pdt = 0;
    }
    /* PERF2-END */
    GA.anim(a, u, id, t, adt, walk);   // GOBLINART: waddle, breathing, ear twitch, flinch, gear
    JUMP.pose(a, u, id, adt);   // JUMP: ears-flop pose and remote hop sounds, after GA.anim
    UNIQUE.actor(a, u, id, t);   // UNIQUE: knowledge glow, brain aura, king marker
    SOC.actor(a, u, id, t);   // SOCIAL: emote pose, bubble, disconnected icon
  }
  GA.tick(dt);   // GOBLINART: death slumps
  UNIQUE.tick();   // UNIQUE: panel flash
  combatTick(dt);   // COMBAT
  // camera
  for (let i = 0; i < ceilings.length; i++) ceilings[i].visible = inside;
  if (GK.fun && GK.fun.camera(cam, dt)) { /* FUN: spectator camera */ } else if (inside && mine && spawned) {
    const eye = 1.5 * SCALE[mine.goblin];
    cam.fov = GK.settings.fov; cam.position.set(P.x, eye + JUMP.camY() + (GK.settings.bob === false ? 0 : Math.sin(mine.phase) * 0.035 * clamp(P.speed / 3.5, 0, 1)), P.z);   // FEEL: head bob can be switched off in Settings
    cam.rotation.set(P.pitch, P.yaw, 0);
    /* FEEL-BEGIN */ if (GK.feel) GK.feel.camera(cam, dt, mine); /* FEEL-END */
  } else {
    if (!inside) orbit += dt * 0.05;
    const dist = (innerHeight > innerWidth ? 80 : 60) * WORLD.LIM / 29;   // overview orbit radius (tuned for the original +-29 m world; scales with WORLD.LIM)
    cam.fov = 50; cam.position.set(Math.sin(orbit) * dist, dist * 0.7, Math.cos(orbit) * dist); cam.lookAt(0, 0, 0);
  }
  vmUpdate(dt, t, mine);   // VIEWMODEL
  SOC.fp(t);   // SOCIAL: first-person emote gesture
  cam.updateProjectionMatrix();
  merchantHoverTick();
  renderWorld(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const lockNow = requestLock;
// FULLSCREEN-BEGIN
GK.requestLock = requestLock; GK.lockOk = lockOk;   // menu.js fullscreen block: re-take the pointer lock after entering fullscreen
GK.panelOpen = () => invOpen || shopOpen; GK.closePanels = () => { closeInv(true); closeShop(true); };   // FULLSCREEN-2 (fskeep.js)
// FULLSCREEN-END
GK.net = net; GK.cam = cam; GK.P = P; GK.actors = actors; GK.renderer = renderer; GK.scene = scene; GK.build = t => buildGoblin(t, true); GK.NAMES = NAMES; GK.SCALE = SCALE; GK.glowTex = glowTex; GK.textTex = textTex;
// MATCH-BEGIN (matchmaking: the wheel screen is the queue, the match start moves everyone into the rooms, a 3-2-1-GO countdown locks movement/attacks/interaction; see docs/reports/matchmaking.md)
const MQ = { goblin: null, began: false, inWorld: false, offset: 0, at: 0, went: false, timer: 0, el: null, resolve: null, lastDigit: -1 };
GK.locked = false;   // true from the match start until GO: the camera can look around, nothing else works
function mqResolve(g) { if (MQ.goblin == null && g != null && MQ.resolve) { MQ.goblin = g; MQ.resolve(g); } }
function mqEnterWorld() {   // leave the wheel screen and show the rooms (the old GK.enter, without the click)
  if (MQ.inWorld) return; MQ.inWorld = true;
  if (GK.menu && GK.menu.hideWheel) GK.menu.hideWheel();
  run.t0 = performance.now(); run.n0 = GK.roundInfo ? GK.roundInfo().n : 0; run.dist = 0; GK.mode = 'play';
  GK.showStats(); GK.applySettings(); if (window.GK_OFFLINE) $('rr').style.display = 'block'; lockNow();
}
function mqBegin(offlineMode) {   // the match formed and the world is built: wait for the wheel reveal, then get ready
  if (MQ.began) return; MQ.began = true; GK.locked = true;
  if (GK.menu && GK.menu.queueDone) GK.menu.queueDone();
  const go = () => { mqEnterWorld(); setTimeout(() => { net.send({ ready: 1 }); if (offlineMode) mqCountdown({ at: Date.now() + 3000, now: Date.now() }); }, 350); };
  if (GK.menu && GK.menu.whenRevealed) GK.menu.whenRevealed(go, 7000, 1500); else go();
}
function mqEl() {
  if (MQ.el) return MQ.el;
  const st = document.createElement('style');
  st.textContent = '@keyframes gkCountPop{0%{transform:scale(1.7);opacity:0}25%{transform:scale(1);opacity:1}80%{opacity:1}100%{transform:scale(.88);opacity:0}}';
  document.head.appendChild(st);
  const el = MQ.el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:0;right:0;top:50%;transform:translateY(-58%);z-index:80;text-align:center;pointer-events:none;display:none;font:900 clamp(96px,24vh,260px)/1 Georgia,"Times New Roman",serif;letter-spacing:.04em;color:' + GOLD + ';text-shadow:0 0 28px rgba(255,190,50,.65),0 4px 0 #6b4a05,0 10px 28px rgba(0,0,0,.8)';
  document.body.appendChild(el); return el;
}
function mqShow(text, last) {
  const el = mqEl(); el.style.display = 'block'; el.textContent = text;
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = 'gkCountPop ' + (last ? '.9s' : '1s') + ' ease-out forwards';
  if (last) el.style.color = '#fff3c0';
}
// PERF-BEGIN (first run only: pick the quality preset from a 2 s FPS probe after GO; a preset the player chose is never touched; see docs/reports/perf.md)
const GFX_ORDER = ['low', 'medium', 'high', 'ultra'];
function gfxAutoProbe() {
  let st; try { st = localStorage.getItem('gk.gfxAuto'); const s = JSON.parse(localStorage.getItem('gk.settings') || 'null'); if (!st && s && s.gfx && s.gfx !== 'high') st = 'user'; } catch (e) { return; }   // a saved non-default preset counts as chosen
  if (st || GK.gfxProbe) return; GK.gfxProbe = { fps: 0 };
  const mark = v => { try { localStorage.setItem('gk.gfxAuto', v); } catch (e) {} };
  setTimeout(() => {
    let n = 0, t0 = 0, dead = false; const onVis = () => { dead = true; };   // a hidden tab throttles rAF: no verdict then, try again next match
    document.addEventListener('visibilitychange', onVis);
    const tick = now => {
      if (dead) { document.removeEventListener('visibilitychange', onVis); GK.gfxProbe = null; return; }
      if (!t0) t0 = now; n++;
      if (now - t0 < 2000) { requestAnimationFrame(tick); return; }
      document.removeEventListener('visibilitychange', onVis);
      const fps = (n - 1) * 1000 / (now - t0), cur = GK.settings.gfx, i = GFX_ORDER.indexOf(cur); GK.gfxProbe = { fps, from: cur };
      if (localStorage.getItem('gk.gfxAuto') === 'user') return;
      mark('auto');
      if (fps < 40 && i > 0) {   // too slow: one preset down
        const to = GFX_ORDER[i - 1]; GK.settings.gfx = to; GK.settings.fx = to !== 'low'; GK.gfxProbe.to = to;
        try { const s = JSON.parse(localStorage.getItem('gk.settings') || '{}'); s.gfx = to; s.fx = GK.settings.fx; localStorage.setItem('gk.settings', JSON.stringify(s)); } catch (e) {}
        GK.applySettings(); toastMsg('Graphics set to ' + to[0].toUpperCase() + to.slice(1) + ' for smoother play (Settings > Graphics quality)', true);
      } else if (fps > 100 && cur === 'high') toastMsg('Running at ' + Math.round(fps) + ' fps: Ultra graphics are available in Settings > Graphics quality', true);
    };
    requestAnimationFrame(tick);
  }, 600);
}
// PERF-END
function mqCountdown(c) {   // {at: server ms of GO, now: server ms when sent} -> 3, 2, 1, GO
  if (!c || !Number.isFinite(c.at) || MQ.at) return; MQ.at = c.at; MQ.offset = Number.isFinite(c.now) ? c.now - Date.now() : 0;
  mqEnterWorld(); GK.locked = true;
  const step = () => {
    const rem = MQ.at - (Date.now() + MQ.offset);
    if (rem <= 0) {
      clearInterval(MQ.timer); GK.locked = false; MQ.went = true;
      mqShow('GO!', true); snd('go'); gfxAutoProbe(); run.t0 = performance.now(); run.n0 = GK.roundInfo ? GK.roundInfo().n : 0;
      if (window.GK_OFFLINE) net.send({ enter: 1 });   // the offline simulation starts its round timer on this; the real server ignores it
      setTimeout(() => { if (MQ.el) MQ.el.style.display = 'none'; }, 900); return;
    }
    const d = Math.ceil(rem / 1000);
    if (d !== MQ.lastDigit) { MQ.lastDigit = d; mqShow(String(d)); snd(d === 1 && itemsAudioHas('tickLast') ? 'tickLast' : 'tick'); }
  };
  const itemsAudioHas = n => !!(window.GKAUDIO && GKAUDIO.names ? GKAUDIO.names.includes(n) : false);
  MQ.timer = setInterval(step, 50); step();
}
GK.matchOnMsg = d => {   // called by handleMsg after it has processed a message
  if (d.unverified) toastMsg('Character could not be verified — playing as a new goblin.', false, 6000);   // SECURITY
  if (d.queue) { mqResolve(d.goblin); if (GK.menu && GK.menu.queue) GK.menu.queue(d.queue.n, d.queue.size, d.queue.since); }
  if (d.matchStart) { mqResolve(((d.matchStart.players || []).find(p => p.id === d.matchStart.you) || {}).goblin); mqBegin(false); }
  if (d.resumed) mqResume();   // SOCIAL: before the countdown that may follow
  if (d.countdown) mqCountdown(d.countdown);
  if (d.readyN && GK.menu && GK.menu.ready) GK.menu.ready(d.readyN.n, d.readyN.size);
};
function mqOffline() {   // offline mode: hold the simulation's messages back, fake a ~2 s queue, then start like the server would
  const held = [], latest = {}; let flushed = false, n = 1, offId = 0;
  netReal.onmessage = d => {
    if (flushed) return handleMsg(d);
    const ks = Object.keys(d); if (d.you) offId = d.you;
    if (ks.length === 1 && (ks[0] === 'players' || ks[0] === 'round' || ks[0] === 'match' || ks[0] === 'swing')) latest[ks[0]] = d; else held.push(d);
    if (ks[0] === 'players' && MQ.goblin == null) { const mine = d.players.find(p => p.id === offId); if (mine) { mqResolve(mine.goblin); GK.matchOnMsg({ queue: { n: 1, size: 8, since: 0 } }); } }
  };
  const tick = setInterval(() => { if (n < 8) { n++; GK.matchOnMsg({ queue: { n, size: 8, since: n * 250 } }); } }, 250);
  setTimeout(() => {
    clearInterval(tick); flushed = true;
    for (const d of held) handleMsg(d); for (const k of ['match', 'round', 'players']) if (latest[k]) handleMsg(latest[k]);
    GK.matchOnMsg({ queue: { n: 8, size: 8, since: 2000 } }); mqBegin(true);
  }, 2100);
}
GK.cancelQueue = () => { GK.social.clear(); net.send({ cancel: 1 }); };
GK.resume = opts => { connect(opts); };   // SOCIAL: a page reload during a match; the {resumed} welcome comes back through matchOnMsg
function mqResume() {   // the welcome of a resumed match is applied (world, players, round): skip the title, the wheel and the queue and drop straight in
  if (!GK.social.booted()) return;
  const mine = actors.get(me); if (mine && MQ.goblin == null) MQ.goblin = mine.goblin;
  MQ.began = true; GK.locked = false;   // a running countdown message follows and locks it again
  if (GK.menu && GK.menu.resumed) GK.menu.resumed();
  mqEnterWorld();
}
GK.start = (opts) => { return new Promise(res => { MQ.resolve = res; connect(opts); if (window.GK_OFFLINE) mqOffline(); }); };   // connects and joins the queue; resolves with my goblin type (the wheel result)
// MATCH-END
GK.enter = () => { if (GK.howTo) GK.howTo.close(); run.t0 = performance.now(); run.n0 = GK.roundInfo ? GK.roundInfo().n : 0; run.dist = 0; GK.mode = 'play'; net.send({ enter: 1 }); GK.showStats(); GK.applySettings(); if (window.GK_OFFLINE) $('rr').style.display = 'block'; lockNow(); };   // call from a click; 'enter' starts the match's round timer
GK.applySettings = () => { renderer.setPixelRatio(fxPixelRatio()); fxApplyQuality(); resize(); };
GK.doors = doors;
GK.fxDebug = { get fx() { return fx; }, cam };   // test hook: post-effects state and the world camera
GK.setDoorsOpen = ids => { const set = new Set(ids); doors.forEach(d => d.open = d.hatch || set.has(d.id)); };   // ids of doors that are open right now (a home's hatch is always open)
GK.setHomeLock = (on, snap) => { for (const d of doors) if (d.hatch) { d.locked = !!on; if (snap) { d.p = on ? 0 : 1; d.bars.position.y = d.p * (d.dh + 0.05); d.bars.visible = !!on; } } };   // HOME PHASE: round 1 shuts every hatch (snap: no drop animation on the first round state)
GK.skipMenu = () => {   // for tests: straight into the rooms, with the title menu hidden as a real Enter would
  const mn = $('menu'); if (mn) mn.classList.add('gone'); document.body.classList.remove('menu');
  GK.mode = 'play'; GK.start();   // joins the queue; the match start and the countdown follow
};
// FEEL-BEGIN (read-only window into game state for feel.js: sounds, interaction prompts, disconnect overlay)
GK.feelApi = { P, actors, doors, keys, CHEST_ROOMS, roomKeyAt, nearestPile, hover: () => ({ room: hoverRoom, kind: hoverKind }),
  get me() { return me; }, get invOpen() { return invOpen; }, get shopOpen() { return shopOpen; }, get panelKind() { return panelKind; },
  get spawned() { return spawned; }, get inside() { return inside; }, get cpAim() { return cpAim; }, get inv() { return invReady ? myInv : null; } };
// FEEL-END
// LOOT-BEGIN (vault relic pedestal, merchant price note, throwable goblin plushie; no lights; see docs/reports/loot.md)
const LOOT = window.GKLOOT = (() => {
  const [vx, vz] = rc(WORLD.VAULT), PX = vx + 2.4, PZ = vz, PH = 0.95, BASE = 0.16;   // pedestal on the dais edge (same offset as RELIC_POS in server.js)
  const gold = new THREE.MeshStandardMaterial({ color: 0xe0a93a, metalness: 1, roughness: 0.3, emissive: 0x4a2800, emissiveIntensity: 0.5 }), dark = new THREE.MeshStandardMaterial({ color: 0x1d2128, metalness: 0.7, roughness: 0.4 });
  const ped = new THREE.Group(); ped.position.set(PX, BASE, PZ); scene.add(ped);
  const add = (geo, mat, y) => { const m = new THREE.Mesh(geo, mat); m.position.y = y; ped.add(m); return m; };
  add(new THREE.CylinderGeometry(0.62, 0.7, 0.18, 24), dark, 0.09); add(new THREE.CylinderGeometry(0.4, 0.52, PH - 0.3, 24), dark, 0.09 + (PH - 0.3) / 2);
  add(new THREE.CylinderGeometry(0.58, 0.46, 0.12, 24), gold, PH - 0.06); add(new THREE.TorusGeometry(0.5, 0.035, 8, 32), gold, 0.2).rotation.x = Math.PI / 2;
  const sparkTex = canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,248,210,1)'); gr.addColorStop(0.15, 'rgba(255,214,110,0.5)'); gr.addColorStop(1, 'rgba(255,190,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,250,225,0.95)'; for (const [a, l] of [[0, 62], [Math.PI / 2, 62], [Math.PI / 4, 28], [-Math.PI / 4, 28]]) { g.save(); g.translate(64, 64); g.rotate(a); g.beginPath(); g.moveTo(-l, 0); g.quadraticCurveTo(0, 2.5, l, 0); g.quadraticCurveTo(0, -2.5, -l, 0); g.fill(); g.restore(); }
  });
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: 0xffe9a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); spark.visible = false; ped.add(spark);
  let relicKey = null, relicObj = null, spin = null;
  function setRelic(key) {
    if (key === relicKey) return; relicKey = key;
    if (spin) { ped.remove(spin); spin = null; relicObj = null; }
    spark.visible = !!key; if (!key) return;
    const mdl = window.GKART && GKART.model(key); if (!mdl) { relicKey = null; return; }
    const bb = new THREE.Box3().setFromObject(mdl), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), s = 1.5 / Math.max(sz.x, sz.y, sz.z, 0.01);
    spin = new THREE.Group(); relicObj = new THREE.Group(); mdl.position.set(-c.x, -c.y, -c.z); relicObj.add(mdl); relicObj.scale.setScalar(s); spin.add(relicObj); spin.position.y = PH + 0.62; ped.add(spin);
    if (infoOf(key) && infoOf(key).type === 'weapon') relicObj.rotation.z = 0.5;
  }
  // E prompt next to the pedestal
  let promptEl = null;
  const near = () => relicKey && Math.hypot(P.x - PX, P.z - PZ) < 2.2;
  // ---- throwable plushie: the server picks the landing spot, the client draws the arc and the squeak
  const pk = new THREE.MeshStandardMaterial({ color: 0xff9fc4, roughness: 0.95 }), eyeM = new THREE.MeshStandardMaterial({ color: 0x2a1018, roughness: 0.5 });
  const gS = new THREE.SphereGeometry(0.5, 14, 10), gC = new THREE.ConeGeometry(0.2, 0.42, 8);
  function plushieMesh() {
    const g = new THREE.Group(), body = new THREE.Mesh(gS, pk); body.scale.set(0.2, 0.22, 0.17); g.add(body);
    const head = new THREE.Mesh(gS, pk); head.scale.setScalar(0.22); head.position.y = 0.2; g.add(head);
    for (const sx of [-1, 1]) { const ear = new THREE.Mesh(gC, pk); ear.position.set(sx * 0.12, 0.26, 0); ear.rotation.z = -sx * 1.25; ear.scale.setScalar(0.45); g.add(ear); const eye = new THREE.Mesh(gS, eyeM); eye.scale.setScalar(0.03); eye.position.set(sx * 0.05, 0.22, 0.095); g.add(eye); }
    return g;
  }
  const flying = [];
  function onThrow(t) {
    const m = plushieMesh(); scene.add(m);
    const y0 = (t.by === me ? 1.45 : 1.3);
    flying.push({ m, t0: performance.now(), ms: t.ms, x0: t.from[0], z0: t.from[1], y0, x1: t.to[0], z1: t.to[1], landed: false, until: 0 });
    snd('squeak', { x: t.from[0], z: t.from[1], vol: 0.6 });
  }
  function update(now, dt) {
    if (spin) { spin.rotation.y += dt * 0.7; spin.position.y = PH + 0.62 + Math.sin(now * 0.0016) * 0.06; const k = 0.5 + 0.5 * Math.sin(now * 0.004); spark.position.y = PH + 0.62; spark.scale.setScalar(0.9 + k * 0.5); spark.material.opacity = 0.3 + 0.4 * k; }
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i], k = Math.min(1, (now - f.t0) / f.ms);
      if (k < 1) {
        f.m.position.set(f.x0 + (f.x1 - f.x0) * k, f.y0 * (1 - k) + 0.16 * k + Math.sin(k * Math.PI) * 1.4, f.z0 + (f.z1 - f.z0) * k); f.m.rotation.x = k * 9; f.m.rotation.z = k * 5;
      } else if (!f.landed) { f.landed = true; f.until = now + 3200; f.m.position.set(f.x1, 0.14, f.z1); f.m.rotation.set(0.35, f.x0, 1.2); snd('squeak', { x: f.x1, z: f.z1, pitch: 1.15 }); }
      else if (now > f.until) { scene.remove(f.m); flying.splice(i, 1); }
    }
    const show = GK.mode === 'play' && !invOpen && near();
    if (show && !promptEl) { promptEl = document.createElement('div'); promptEl.style.cssText = 'position:fixed;left:50%;bottom:24vh;transform:translateX(-50%);z-index:30;padding:8px 16px;border-radius:10px;background:rgba(10,10,16,.72);border:1px solid rgba(255,215,94,.55);color:#ffe9a8;font:700 15px system-ui,sans-serif;letter-spacing:.04em;pointer-events:none;text-shadow:0 1px 3px #000'; document.body.appendChild(promptEl); }
    if (promptEl) { promptEl.style.display = show ? 'block' : 'none'; if (show) { const n = (infoOf(relicKey) || {}).name || 'relic'; if (promptEl.dataset.k !== relicKey) { promptEl.dataset.k = relicKey; promptEl.textContent = 'E  take the Vault relic: ' + n; } } }
  }
  let last = performance.now(); const loop = now => { update(now, Math.min(0.1, (now - last) / 1000)); last = now; requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  return {
    onMsg(d) { if (d.relic !== undefined) setRelic(d.relic); if (d.throw) onThrow(d.throw); },
    key(i) {   // quick-slot key pressed: a plushie in that slot is thrown (true = handled)
      if (GK.mode !== 'play' || invOpen || !myInv || invGet(myInv, 'q' + i) !== 'x:plushie') return false;
      net.send({ throw: 'q' + i }); return true;
    },
    shopNote(el) {   // merchant panel: say that prices follow the round
      const n = GK.roundInfo ? GK.roundInfo().n : 0, g = el && el.querySelector('#shopGold'); if (!g || n < 3) return;
      const s = document.createElement('span'); s.style.cssText = 'margin-left:12px;font-size:12px;color:#ff9f7a'; s.textContent = 'Round ' + n + ': prices +' + (n - 2) * 10 + '%'; g.appendChild(s);
    },
    get relic() { return relicKey; }
  };
})();
// LOOT-END
// UTILITY-BEGIN (use effects of the eight utility items: floating note, thrown bomb / smoke arc, smoke cloud sprites, bomb flash; no lights; see docs/reports/utility-items.md)
const GKUSE = window.GKUSE = (() => {
  const UT = k => (itemsData().ITEMS || {})[k] || {};
  let tonicEnd = 0, lastKey = null;
  const FAIL = { now: 'Not now', busy: 'Not yet', full: 'You are at full health', sudden: 'Nothing heals in sudden death', door: 'No open door close by', room: 'Use it in a room with a panel', item: 'Cannot use that' };
  const note = (text, col) => {   // short floating note, the same family as the knowledge gain text but smaller
    const f = document.createElement('div'); f.textContent = text;
    f.style.cssText = 'position:fixed;left:50%;top:50%;transform:translateX(-50%);z-index:90;pointer-events:none;color:' + (col || '#ffe9a8') + ';font:700 20px system-ui,sans-serif;letter-spacing:.04em;text-shadow:0 2px 8px #000';
    document.body.appendChild(f); const an = f.animate([{ opacity: 0, transform: 'translate(-50%,8px)' }, { opacity: 1, transform: 'translate(-50%,-6px)', offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-44px)' }], 1300); an.onfinish = () => f.remove();
  };
  const puffTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const ballG = new THREE.SphereGeometry(1, 12, 9), bombM = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.4 }), smokeM = new THREE.MeshStandardMaterial({ color: 0x6b7078, roughness: 0.8 }), sparkM = new THREE.MeshBasicMaterial({ color: 0xffb83a });
  const mkBall = kind => { const m = new THREE.Mesh(ballG, kind === 'bomb' ? bombM : smokeM); m.scale.setScalar(0.13); if (kind === 'bomb') { const s = new THREE.Mesh(ballG, sparkM); s.scale.setScalar(0.3); s.position.set(0.3, 1.05, 0); m.add(s); } return m; };
  const flying = [], clouds = [], flashes = [], bombs = new Map();
  function onToss(t) {
    const m = mkBall(t.kind); scene.add(m);
    flying.push({ m, kind: t.kind, id: t.id, t0: performance.now(), ms: t.ms, x0: t.from[0], z0: t.from[1], y0: t.by === me ? 1.45 : 1.3, x1: t.to[0], z1: t.to[1], landed: false });
  }
  function landed(f, now) {
    f.landed = true;
    if (f.kind === 'bomb') { f.m.position.set(f.x1, 0.14, f.z1); bombs.set(f.id, f.m); return; }
    scene.remove(f.m); f.m.visible = false;
    const u = UT('x:smoke'), r = u.r || 3, sprites = [];
    for (let i = 0; i < 5; i++) { const a = i * 1.26, d = i ? r * 0.45 : 0, s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xa4aab2, transparent: true, opacity: 0, depthWrite: false, fog: false })); s.position.set(f.x1 + Math.cos(a) * d, 1.0 + (i % 2) * 0.35, f.z1 + Math.sin(a) * d); s.scale.setScalar(r * 1.25); sprites.push(s); scene.add(s); }
    clouds.push({ sprites, t0: now, ms: u.ms || 6000 }); snd('hiss', { x: f.x1, z: f.z1, vol: 0.5 });
  }
  function onBoom(b) {
    const m = bombs.get(b.id); if (m) { scene.remove(m); bombs.delete(b.id); }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.position.set(b.x, 0.9, b.z); scene.add(s);
    flashes.push({ s, t0: performance.now(), r: b.r }); snd('boom', { x: b.x, z: b.z, vol: 0.9 });
  }
  function update(now) {
    if (!flying.length && !clouds.length && !flashes.length) return;
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i], k = Math.min(1, (now - f.t0) / f.ms);
      if (k < 1) { f.m.position.set(f.x0 + (f.x1 - f.x0) * k, f.y0 * (1 - k) + 0.14 * k + Math.sin(k * Math.PI) * 1.2, f.z0 + (f.z1 - f.z0) * k); f.m.rotation.x = k * 8; }
      else { if (!f.landed) landed(f, now); flying.splice(i, 1); }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i], k = (now - c.t0) / c.ms, a = k < 0.12 ? k / 0.12 : k > 0.85 ? Math.max(0, (1 - k) / 0.15) : 1;
      for (const s of c.sprites) { s.material.opacity = 0.5 * a; s.material.rotation += 0.002; }
      if (k >= 1) { for (const s of c.sprites) { scene.remove(s); s.material.dispose(); } clouds.splice(i, 1); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], k = (now - f.t0) / 380;
      if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); flashes.splice(i, 1); continue; }
      f.s.scale.setScalar(0.6 + f.r * 1.8 * Math.sqrt(k)); f.s.material.opacity = 0.9 * (1 - k);
    }
  }
  const loop = now => { update(now); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  return {
    key(i) {   // quick-slot key pressed: a utility item in that slot is used (true = handled; the server decides whether it works)
      if (GK.mode !== 'play' || invOpen || !myInv) return false;
      const k = invGet(myInv, 'q' + i), it = k && infoOf(k); if (!it || !it.use) return false;
      lastKey = k; net.send({ use: 'q' + i }); return true;
    },
    note, lastKey: () => lastKey,
    speedMul() { return (performance.now() < tonicEnd ? UT('x:tonic').n || 1.25 : 1) * (window.GKUSE2 ? GKUSE2.speedMul() : 1); },
    onMsg(d) {
      if (window.GKUSE2) GKUSE2.onMsg(d);   // ITEMS2
      if (d.toss) onToss(d.toss);
      if (d.boom) onBoom(d.boom);
      if (d.used && !(window.GKUSE2 && GKUSE2.owns(d.used.key))) {
        const u = d.used, it = UT(u.key); snd('useSoft', { pitch: it.use === 'speed' ? 1.3 : it.use === 'pick' ? 1.5 : 1 });
        if (it.use === 'heal') note('+' + u.hp + ' HP', '#8be28b');
        else if (it.use === 'regen') note('Regenerating', '#8be28b');
        else if (it.use === 'speed') { tonicEnd = performance.now() + (u.ms || 8000); note('Quick on your feet', '#ffd76a'); }
        else if (it.use === 'wedge') note('Door wedged open', '#ffd76a');
        else if (it.use === 'pick') note('Vault vote added', '#ffd76a');
      }
      if (d.sealed) { note('Panel sealed by ' + d.sealed.by, '#ffd76a'); snd('useSoft', { pitch: 0.8 }); }
      if (d.sealBlock) { toastMsg('This panel is sealed', false, 1100); snd('deny'); }
      if (d.useFail) {
        const pickMsg = lastKey === 'x:lockpick' ? 'Pick a Vault door on the panel first' : 'Pick a door on the panel first';
        toastMsg(d.useFail === 'pick' ? pickMsg : d.useFail === 'door' && lastKey === 'x:pry' ? 'No closed door close by (not the Vault)' : FAIL[d.useFail] || 'Cannot use that', false, 1400); snd('deny');
      }
    },
  };
})();
// UTILITY-END
// ITEMS2-BEGIN (client side of the twelve more utility items and the charm slot; docs/reports/more-items.md): placed bear traps and alarm bells, the flare glow, the dazzle whiteout, short notes, minimap reveals. No lights.
const GKUSE2 = window.GKUSE2 = (() => {
  const OWN = new Set(['trap', 'flare', 'lens', 'pry', 'ward', 'jar', 'bait', 'dazzle', 'haggle', 'rage', 'feather', 'bell'].map(k => 'x:' + k));
  const UT = k => (itemsData().ITEMS || {})[k] || {};
  let flareEnd = 0, lensEnd = 0, revealEnd = 0, snareEnd = 0, snareN = 1, wardEnd = 0;
  const placed = new Map(), glows = [];
  const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,180,1)'); gr.addColorStop(0.3, 'rgba(255,150,70,.55)'); gr.addColorStop(1, 'rgba(255,100,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const redraw = () => { try { GK.minimap && GK.minimap.redraw(); } catch (e) {} };
  const later = (ms, f) => setTimeout(f, ms);
  const note = (t, c) => GKUSE.note(t, c);
  function model(key, width, fallbackCol) {   // the item model scaled to a world prop `width` metres wide, standing on the floor (a plain disc when itemart is missing)
    const m = window.GKART && GKART.model(key), g = new THREE.Group();
    if (m) {
      m.traverse(o => { if (o.userData.glow) o.visible = false; });
      const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3()), s = width / Math.max(sz.x, sz.z, 0.01);
      m.scale.setScalar(s); m.position.y = -bb.min.y * s; g.add(m); return g;
    }
    const f = new THREE.Mesh(new THREE.CylinderGeometry(width / 2, width / 2, 0.04, 14), new THREE.MeshStandardMaterial({ color: fallbackCol, roughness: 0.6 })); f.position.y = 0.02; g.add(f); return g;
  }
  function putTrap(t) {   // everyone sees a placed trap; it lies flat on the floor
    const m = model('x:trap', 0.55, 0x555a62); m.position.set(t.x, 0.01, t.z); m.rotation.y = (t.id * 1.7) % 6.28; scene.add(m); placed.set('t' + t.id, m);
  }
  function putBell(t) {   // only its owner sees an alarm bell
    const m = model('x:bell', 0.3, 0xc9a13a); m.position.set(t.x, 0.01, t.z); scene.add(m); placed.set('b' + t.id, m);
  }
  const drop = id => { const m = placed.get(id); if (m) { scene.remove(m); placed.delete(id); } };
  function putFlare(f) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.position.set(f.x, 2.6, f.z); s.scale.setScalar(2.4); scene.add(s);
    glows.push({ s, t0: performance.now(), ms: f.ms, x: f.x, z: f.z });
  }
  function whiteout(ms) {   // dazzle: the screen goes white for a moment, then clears
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;z-index:80;pointer-events:none;background:#fffbe8';
    document.body.appendChild(d); const an = d.animate([{ opacity: 0.9 }, { opacity: 0.8, offset: 0.35 }, { opacity: 0 }], ms); an.onfinish = () => d.remove();
  }
  const loop = now => {
    for (let i = glows.length - 1; i >= 0; i--) {
      const g = glows[i], k = (now - g.t0) / g.ms, a = k < 0.08 ? k / 0.08 : k > 0.85 ? Math.max(0, (1 - k) / 0.15) : 1;
      g.s.material.opacity = 0.85 * a * (0.85 + 0.15 * Math.sin(now / 90)); g.s.position.y = 2.6 + Math.sin(now / 600) * 0.12;
      if (k >= 1) { scene.remove(g.s); g.s.material.dispose(); glows.splice(i, 1); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const at = (x, z) => ({ x, z });
  return {
    owns: k => OWN.has(k),
    reveal: () => { const n = performance.now(); return n < flareEnd || n < revealEnd; },   // minimap: every goblin shows
    lens: () => performance.now() < lensEnd,   // minimap: this round's picks show
    speedMul() { const n = performance.now(), ch = myInv && myInv.charm && itemsData().charmEff ? itemsData().charmEff(myInv.charm, 'spd') || 1 : 1; return ch * (n < snareEnd ? snareN : 1); },
    onMsg(d) {
      if (d.used && OWN.has(d.used.key)) {
        const u = d.used, it = UT(u.key), n = performance.now();
        try { GK.feel.itemUsed(it, 'use'); } catch (e) {}
        if (it.use === 'flare') { flareEnd = n + (u.ms || 8000); redraw(); later((u.ms || 8000) + 50, redraw); note('Flare lit: every goblin shows', '#ffb070'); }
        else if (it.use === 'lens') { lensEnd = n + (u.ms || 12000); redraw(); later((u.ms || 12000) + 50, redraw); note('Picks revealed on the map', '#bfe6ff'); }
        else if (it.use === 'pry') note('Door pried open', '#ffd76a');
        else if (it.use === 'ward') { wardEnd = n + (u.ms || 30000); note('Ward up', '#7fe8ff'); }
        else if (it.use === 'bait') note('Bait set', '#ffd76a');
        else if (it.use === 'haggle') note('Next purchase half price', '#ffd76a');
        else if (it.use === 'rage') note('Rage', '#ff7a5a');
        else if (it.use === 'recall') note('Recalling... do not get hit', '#ffd76a');
        else if (it.use === 'trap') note('Trap set', '#ffd76a');
        else if (it.use === 'bell') note('Bell set', '#ffd76a');
      }
      if (d.trap) putTrap(d.trap);
      if (d.trapEnd) { const m = placed.get('t' + d.trapEnd.id); if (m && d.trapEnd.hit) snd('snap', { x: m.position.x, z: m.position.z, vol: 0.9 }); drop('t' + d.trapEnd.id); }
      if (d.bell) putBell(d.bell);
      if (d.bellRing) { drop('b' + d.bellRing.id); revealEnd = performance.now() + (d.bellRing.ms || 5000); redraw(); later((d.bellRing.ms || 5000) + 50, redraw); try { GK.feel.itemUsed(UT('x:bell'), 'use'); } catch (e) {} note('Your bell rings', '#ffd76a'); }
      if (d.bellEnd) drop('b' + d.bellEnd.id);
      if (d.flare) putFlare(d.flare);
      if (d.flash) {
        const f = d.flash; snd('zap', { x: f.x, z: f.z, vol: 0.7 });
        if (f.id !== me && roomKeyAt(P.x, P.z) === f.room && Math.hypot(P.x - f.x, P.z - f.z) <= f.r) whiteout(Math.max(900, f.ms * 0.8));
      }
      if (d.ward && d.ward.id === me) { wardEnd = 0; note('Ward broken', '#7fe8ff'); snd('wardBreak'); }
      else if (d.ward) { const a = actors.get(d.ward.id); snd('wardBreak', a ? { x: a.x, z: a.z, vol: 0.6 } : { vol: 0.4 }); }
      if (d.snared) { snareEnd = performance.now() + (d.snared.ms || 2500); snareN = d.snared.n || 0.35; note('Caught in a trap', '#ff8a7a'); }
      if (d.mimic) snd('snap', { x: d.mimic.x, z: d.mimic.z, vol: 0.9 });
      if (d.bite) note('It was a mimic! -' + d.bite.dmg, '#ff8a7a');
      if (d.haggled) note('Haggled: saved ' + d.haggled + ' gold', '#ffd76a');
      if (d.recallEnd) note(d.recallEnd.ok ? 'Back home' : 'The spell broke', d.recallEnd.ok ? '#ffd76a' : '#ff8a7a');
    },
  };
})();
// ITEMS2-END
// HOME-BEGIN (Elixir Screen, elixir counter, toasts and send effects; homeui.js is the panel, the server is server.js ELIXIR; see docs/reports/elixir-home-wiring.md)
const HOMEW = window.GKHOMEW = (() => {
  if (!window.GKHOMEUI || !window.GKHOMEBASE) return null;
  const W = WORLD, K = window.GKHOMEBASE;
  let hs = null, elixir = 0, vig = null, sentT = 0, alertT = 0; const bells = new Map(), gas = new Set();
  const redrawMM = () => { try { GK.minimap && GK.minimap.redraw(); } catch (e) {} };
  // INTEGRATION: the home state the art reads (R5 homeState): GK.state.homes[key] = { pump 0..1, alert, dead, lv:{lock,alarm,sentry,lockbox} }; only my own home is known to me, the rest stay at the base look
  const gs = GK.state = GK.state || {}; gs.homes = gs.homes || {};
  const hput = (key, o) => { if (key) gs.homes[key] = Object.assign(gs.homes[key] || {}, o); };
  const ringHome = () => { const e = GK.r5 && GK.r5.room(GK.myHome); if (e && e.api.ringAlarm) e.api.ringAlarm(); };
  const ui = GKHOMEUI.createHomeUI({ root: document.body, send: m => net.send(m), onClose: () => { shopOpen = false; panelKind = ''; keys.clear(); lockNow(); } });
  const mine = room => GK.myHome && 'c' + room === GK.myHome;
  function mapState() {
    const cells = [];
    for (let i = 0; i < W.NARENA; i++) cells.push({ key: String(i), gx: i % W.N, gy: Math.floor(i / W.N), kind: String(i) === W.VAULT_KEY ? 'vault' : 'arena', label: String(i) === W.VAULT_KEY ? 'V' : '' });
    for (const c of W.CHEST) if (c.home) { const k = 'c' + c.id, hm = hs && hs.homes && hs.homes[k]; cells.push({ key: k, gx: c.parent % W.N + c.dx, gy: Math.floor(c.parent / W.N) + c.dz, kind: 'home', owner: hm ? hm.owner : '', dead: hm && hm.dead ? 1 : 0, mine: k === GK.myHome, label: '' }); }
    return { myRoom: GK.myHome, vaultKey: W.VAULT_KEY, cells };
  }
  function state() {
    const bag = []; if (myInv) myInv.backpack.forEach((k, i) => { if (k) { const it = infoOf(k); bag.push({ slot: 'b' + i, name: it ? it.name : k, n: 1 }); } });
    return { elixir, cap: 120, tank: hs.tank, tankCap: hs.tankCap, round: hs.round, sentRound: hs.sentRound, distills: hs.distills, distillMax: 3, home: { lv: hs.lv, ammo: hs.ammo, snareArmed: hs.snareArmed, box: hs.box, dead: hs.dead }, bag, active: hs.active, map: mapState() };
  }
  function interact(kind, room) {   // E on the screen, the pump or the lockbox
    if (kind === 's') {
      if (!mine(room)) { ui.toast('info', 'Not your screen'); snd('deny'); return true; }
      if (!hs) { ui.toast('info', 'The screen is warming up'); return true; }
      shopOpen = true; panelKind = 'home'; keys.clear(); try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
      ui.open(state()); return true;
    }
    if (kind === 'p') { net.send({ pump: 1 }); return true; }
    if (mine(room)) { ui.toast('info', 'Your lockbox: manage it on the Elixir Screen'); return true; }
    net.send({ base: { crack: 1 } }); return true;
  }
  const REASON = { owner: 'Only the home owner can use this', room: 'Too far from a workbench', space: 'Your backpack is full', elixir: 'Not enough elixir' };
  function fx(f) {
    if (f.kind === 'gas') { if (f.on === 1) gas.add(f.room); else if (f.on === 0) gas.delete(f.room); }
    else if (f.kind === 'bell') { if (f.on === 1) { bells.set(f.room, performance.now() + (f.ms || 20000)); setTimeout(redrawMM, (f.ms || 20000) + 60); } else if (f.on === 0) bells.delete(f.room); redrawMM(); }   // a bell send: the goblins of that room show on the minimap (bellAt)
    else if (f.kind === 'sentry') { const t = actors.get(f.to), e = GK.r5 && GK.r5.room(GK.myHome); if (t && e && e.api.setSentryTarget) { e.api.setSentryTarget(t.x, t.z); clearTimeout(sentT); sentT = setTimeout(() => { const q = GK.r5 && GK.r5.room(GK.myHome); if (q) q.api.setSentryTarget(null); }, 900); } }   // the art sentry turns toward its target
    else if (f.kind === 'spike' && f.hit) snd('snap', { vol: 0.8 });
  }
  function paintGas() {   // a green haze while I stand in a room with Stink Gas running
    const r = W.roomKeyOf(P.x, P.z), on = spawned && gas.has(r);
    if (!on && !vig) return;
    if (!vig) { vig = document.createElement('div'); vig.style.cssText = 'position:fixed;inset:0;z-index:6;pointer-events:none;opacity:0;transition:opacity .9s;background:radial-gradient(ellipse at center,rgba(120,170,40,.12) 25%,rgba(90,140,30,.42) 100%)'; document.body.appendChild(vig); }
    vig.style.opacity = on ? '1' : '0';
  }
  setInterval(paintGas, 300);
  setInterval(() => {   // the counter sits right under the minimap (whatever size and place the HUD gives it)
    const c = document.querySelector('.hu-ctr'), mm = document.getElementById('gkMM'); if (!c || !mm || !c.classList.contains('on')) return;
    const r = mm.getBoundingClientRect(); if (r.width < 10) return; const z = parseFloat(getComputedStyle(c).zoom) || 1;
    c.style.top = Math.round(r.bottom + 6) / z + 'px'; c.style.right = Math.round(innerWidth - r.right) / z + 'px';
  }, 1000);
  function onMsg(d) {
    if (d.matchStart || d.queue) { hs = null; elixir = 0; ui.setElixir(null); bells.clear(); gas.clear(); gs.homes = {}; gs.tank = gs.tankCap = undefined; }
    if (d.elixir !== undefined) { elixir = d.elixir | 0; ui.setElixir(elixir, 120); if (ui.isOpen() && hs) ui.update(state()); }
    if (d.home) {
      hs = d.home; if (ui.isOpen()) ui.update(state());
      hput(hs.key, { pump: hs.tankCap ? hs.tank / hs.tankCap : 0, lv: hs.lv || {}, dead: !!hs.dead }); gs.tank = hs.tank; gs.tankCap = hs.tankCap;
      const id = GK.myHome ? +GK.myHome.slice(1) : -1; GK.homeFill = GK.homeFill || {}; GK.homeFill[id] = hs.tank / hs.tankCap; if (GK.homeProps && GK.homeProps[id]) GK.homeProps[id].setFill(GK.homeFill[id]);
    }
    if (d.pumpGlow) { hput(GK.myHome, { alert: true }); clearTimeout(alertT); alertT = setTimeout(() => hput(GK.myHome, { alert: false }), +d.pumpGlow || 4000); }   // a raider is draining my pump: the art tank glows red
    if (d.homeDead) hput(d.homeDead, { dead: true, lv: {}, alert: false });
    if (d.homePing) ringHome();   // my alarm went off: the bell in my home rings
    if (d.homeToast) { ui.toast(d.homeToast.kind, d.homeToast.text); if (d.homeToast.kind === 'raid' || d.homeToast.kind === 'alarm') snd('deny', { vol: 0.5 }); }
    if (d.homeRes) {
      if (ui.isOpen()) ui.result(d.homeRes);
      else if (d.homeRes.ok && d.homeRes.text) ui.toast('good', d.homeRes.text);
      else if (!d.homeRes.ok && d.homeRes.reason) ui.toast('info', d.homeRes.reason);
    }
    if (d.brewed) ui.toast('good', 'Brewed ' + itemName(d.brewed.key));
    if (d.brewFail) ui.toast('info', REASON[d.brewFail] || 'Cannot brew that');
    if (d.homeFx) fx(d.homeFx);
  }
  // Refine and Brew live on the recycler / workbench panels (game.js hooks): they only show where the server will accept them
  const inHome = room => { const c = CHEST_ROOMS[room]; return !!c && c.type === 'home'; };
  let brewRow = null;
  function decorateCraft(pn) {
    if (!pn || brewRow) return;
    brewRow = document.createElement('div'); brewRow.style.cssText = 'margin-top:10px;padding-top:8px;border-top:1px solid rgba(127,216,255,.25);display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;font:700 13px system-ui,sans-serif;color:#bdeaff';
    brewRow.innerHTML = '<span style="letter-spacing:.14em;font-size:12px">BREW</span>';
    for (const [k, label, cost] of [['heal', 'Healing Draught', 8], ['tonic', 'Speed Tonic', 12]]) {
      const b = document.createElement('button'); b.dataset.brew = k; b.textContent = label + ' ' + cost; b.style.cssText = 'cursor:pointer;border:1px solid #7fd8ff;border-radius:8px;padding:6px 12px;background:rgba(127,216,255,.12);color:#bdeaff;font:800 12px system-ui,sans-serif;letter-spacing:.06em';
      b.onclick = () => net.send({ brew: k }); brewRow.appendChild(b);
    }
    pn.body.after(brewRow);
  }
  function paintBrew() {
    if (!brewRow) return; brewRow.style.display = hs || elixir ? 'flex' : 'none';
    for (const b of brewRow.querySelectorAll('button')) b.style.opacity = elixir >= (b.dataset.brew === 'heal' ? 8 : 12) ? 1 : 0.45;
  }
  return {
    onMsg, interact, shut: () => ui.close(false), decorateCraft, paintBrew, dbgSend: m => { if (GK.dbg) net.send(m); },   // GK_DEBUG servers only (screenshots, tests)
    elixir: () => elixir, recEff: () => (hs ? K.recyclerEff({ lv: hs.lv, dead: hs.dead }) : 0.5),
    canRefine: room => !!hs && !hs.dead && elixir >= 4 && mine(room) && inHome(room),
    bellAt: (x, z) => { if (!bells.size) return false; const k = W.roomKeyOf(x, z), t = bells.get(k); return t != null && t > performance.now(); },
    ui,
  };
})();
// HOME-END
// ACT5UI-BEGIN (docs/reports/integration-polish.md): the human side of the special rooms. actS / actMe / actFx / crown / breach drive the tree, vaultbreaker and vault art (rooms5art-*), and E / R / Q at an anchor send {act:{r,a,v,x?}}
// (act5ui.js says what each anchor offers; the server act5.js judges). Holds (channels) send `stop` when the key is released. The arc under the crosshair is hud5's (actMe). No lights, nothing per frame except cheap setters on drawn rooms.
window.GKACT5 = (() => {
  const U = window.GKACT5UI; if (!U) return null;
  const W = WORLD, VB = W.VB_CELLS, SIDES = ['N', 'E', 'S', 'W'];
  const rooms = {}, A = { me: {}, crown: null, sudden: false, choice: 0, breach: {}, pulse: null };   // rooms[key] = { type, st, e, tSeen }: the last actS of each room I heard about
  const srv = () => srvNow();
  const sideOfCell = cell => SIDES.find(s => VB[s] === +cell);
  const doorOfSide = {}; for (const s of SIDES) { const d = W.DOORS.find(x => x.kind === 'vault' && (x.a === String(VB[s]) || x.b === String(VB[s]))); if (d) doorOfSide[s] = d.id; }
  const sideOfDoor = {}; for (const s of SIDES) sideOfDoor[doorOfSide[s]] = s;
  const LABEL = { press: 'Pressing', fruit: 'Picking the fruit', pour: 'Pouring', bottle: 'Bottling', cut: 'Cutting', bowl: 'Drinking', grip: 'Gripping the thorns', seed: 'Taking the seed', grind: 'Grinding', rob: 'Robbing', light: 'Lighting', feed: 'Feeding the flame', snuff: 'Snuffing', offer: 'Offering', bar: 'Building', slack: 'Slackening' };
  const FAIL = { far: 'Too far away', busy: 'Someone is already using it', cap: 'You have had enough of this for now', cost: 'You cannot pay for that', item: 'You do not have what that needs', state: 'Not now', cool: 'Not yet', carry: 'Your hands are full', room: 'Not here' };
  const anchorCache = {}; const anchorsOf = key => anchorCache[key] || (anchorCache[key] = W.actAnchors(key));
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const call = (api, fn, ...a) => { try { if (api && typeof api[fn] === 'function') api[fn](...a); } catch (e) {} };
  const colorOf = id => { const a = actors.get(id); return a && a.goblin != null ? [0xffd75e, 0xff9a5e, 0x9ae06e, 0x6fc8ff, 0xc89aff][a.goblin % 5] : 0xffd75e; };

  // ---- messages (before the HUD sees them: pre) and after
  function pre(d) {
    if (d.breach && typeof d.breach === 'object') {   // roundState breach is { doorId: 0..100 }; hud5 and the art want { N, E, S, W }
      const b = {}; for (const k of Object.keys(d.breach)) { const s = sideOfDoor[k] || (SIDES.includes(k) ? k : null); if (s) b[s] = d.breach[k]; }
      d.breach = b; A.breach = b;
    }
    if (d.actMe && d.actMe.chan && !d.actMe.chan.label) d.actMe.chan.label = LABEL[d.actMe.chan.n] || '';
    if (d.actMe && d.actMe.timing && !d.actMe.timing.label) d.actMe.timing.label = 'Press E in the green';
  }
  let flashes = {};   // memory lanterns lit by a touch: key:a -> until (ms of performance.now)
  function onMsg(d) {
    if (d.matchStart) { for (const k in rooms) delete rooms[k]; A.me = {}; A.crown = null; A.sudden = false; A.breach = {}; A.pulse = null; flashes = {}; GK.carryHeavy = false; }
    if (d.round) A.sudden = !!d.sudden || A.sudden;
    if (d.actS && d.actS.r != null) rooms[d.actS.r] = { type: d.actS.type, st: d.actS.st || {}, e: d.actS.e || 0, tSeen: performance.now(), prev: rooms[d.actS.r] && rooms[d.actS.r].st };
    if (d.actMe !== undefined) { A.me = d.actMe || {}; GK.carryHeavy = !!(A.me.carry && A.me.carry.heavy); }
    if (d.crown !== undefined) A.crown = d.crown;
    if (d.toast) toastMsg(String(d.toast).slice(0, 90), true, 2600);
    if (d.actFail) toastMsg(FAIL[d.actFail] || 'Not now', false, 1400);
    if (d.actFx) fx(d.actFx);
    if (d.matchEnd) { for (const k in rooms) delete rooms[k]; GK.carryHeavy = false; }
  }
  function fx(f) {
    const e = f.r != null && GK.r5 && GK.r5.room(String(f.r)), api = e && e.api;
    if (f.k === 'lit' && f.a) flashes[f.r + ':' + f.a] = performance.now() + 380;
    if (e && e.kind === 'vb') {
      const sk = api.skin && api.skin(e.type);
      if (f.k === 'ramhit' || f.k === 'barhit') call(sk, 'strike', 1);
      else if (f.k === 'lockalarm' || f.k === 'robalarm') { call(sk, 'ring'); }
      else if (f.k === 'rekey') call(api, 'setSkin', f.type || e.type);
    }
    if (f.k === 'pulse') { A.pulse = { until: performance.now() + (f.ms || 8000), ids: new Set((f.gob || []).map(g => g[0])) }; try { GK.minimap && GK.minimap.redraw(); } catch (x) {} }
    else if (f.k === 'vbNext' && f.vbNext && window.GKHUD5) { GKHUD5.S.vbNext = f.vbNext; try { GK.minimap && GK.minimap.redraw(); } catch (x) {} }
    if (f.id != null && f.id !== me && f.k !== 'gain') return;
    if (f.k === 'gain' || f.k === 'treasury') {
      const t = []; if (f.know) t.push('+' + f.know + ' knowledge'); if (f.gold) t.push('+' + f.gold + ' gold'); if (f.item) t.push(itemName(f.item)); if (f.tok) t.push(itemName(f.tok));
      if (t.length) toastMsg(t.join('  '), true, 1700);
    }
    else if (f.k === 'capped') toastMsg('The trees have taught you enough for now', false, 2200);
    else if (f.k === 'bless') toastMsg('Blessing of ' + ({ fury: 'Fury', bark: 'Bark', thorns: 'Thorns' }[f.bk] || 'the shrine') + (f.tier ? ' ' + 'I'.repeat(f.tier) : ''), true, 1800);
    else if (f.k === 'spill') toastMsg('The bucket spills', false, 1400);
  }

  // ---- what the prompt offers
  let cur = null, holding = null, hint = '';
  const KEYMAP = { KeyE: 'E', KeyR: 'R', KeyQ: 'Q' };
  const hasKey = k => { const v = myInv; return !!v && (v.backpack.includes(k) || v.quick.includes(k) || v.weapon === k); };
  const countKey = k => { const v = myInv; return v ? v.backpack.filter(x => x === k).length + v.quick.filter(x => x === k).length : 0; };
  const gearOf = k => { const it = infoOf(k); return it && (it.type === 'weapon' || it.type === 'armor') ? it : null; };
  function env(key, kind, type, r) {
    const G = itemsData(), st = (r && r.st) || {};
    const sack = kind === 'vb' && type === 'counting' && st.sacks ? st.sacks.find(s => Math.hypot(P.x - s.x, P.z - s.z) <= 1.6) : null;
    const claims = A.crown && A.crown.claims || [], leader = claims.length ? claims[0].id : null;
    return {
      uid: me, elixir: window.GKHOMEW ? GKHOMEW.elixir() : 0, sudden: A.sudden, choice: A.choice, sack: sack && { id: sack.id }, leader: leader != null && leader !== me,
      has: hasKey, count: countKey, brain: () => (myInv ? [...myInv.backpack, ...myInv.quick] : []).some(k => k && (k === 'x:huskbrain' || (infoOf(k) && infoOf(k).family === 'brain'))),
      junk() { let best = null; if (myInv) myInv.backpack.forEach((k, i) => { const it = k && gearOf(k); if (it && (it.tierN | 0) < 5 && (!best || (it.tierN | 0) < best.t)) best = { slot: i, name: it.name, t: it.tierN | 0 }; }); return best; },
      graftSlot() {
        const twin = k => { const it = k && gearOf(k); return it && !it.up && G.ITEMS && G.ITEMS[k + '+'] ? it : null; };
        if (myInv && twin(myInv.weapon)) return { slot: -1, name: infoOf(myInv.weapon).name };
        let r2 = null; if (myInv) myInv.backpack.forEach((k, i) => { if (!r2 && twin(k)) r2 = { slot: i, name: infoOf(k).name }; }); return r2;
      },
      doorOpen: dir => { const d = doors[doorOfSide[dir]]; return !!d && (d.open || d.p > 0.5); },
    };
  }
  function recompute() {
    cur = null;
    const play = GK.mode === 'play' && spawned && !invOpen && !shopOpen && !GK.locked;
    if (play) {
      const key = roomKeyAt(P.x, P.z), kind = W.actKind(key);
      if (kind) {
        const r = rooms[key], type = kind === 'tree' ? GK.r5.treeMap()[+key] : kind === 'vb' ? GK.r5.vbNow()[+key] : 'vault';
        if (r && r.type === type) { const me2 = A.me && A.me.r === key ? A.me : {}; const c = U.pick(kind, type, anchorsOf(key), r.st, me2, env(key, kind, type, r), P.x, P.z); if (c) cur = { key, a: c.a, acts: c.acts }; }
      }
    }
    if (cur && A.me && A.me.r === cur.key && (A.me.chan || A.me.timing)) cur.busy = true;   // the arc under the crosshair is the prompt while I hold or time something
    const extra = cur && !cur.busy ? cur.acts.slice(1).map(x => x.k + '  ' + x.label + (x.hold ? ' (hold)' : '')).join('     ') : '';
    if (extra !== hint) { hint = extra; hintEl.textContent = extra; hintEl.style.opacity = extra ? '1' : '0'; }
  }
  const hintEl = document.createElement('div'); hintEl.style.cssText = 'position:fixed;left:50%;top:calc(50% + 86px);transform:translateX(-50%);z-index:25;pointer-events:none;padding:4px 12px;border-radius:7px;background:rgba(10,10,16,.6);color:#d9d3c4;font:600 13px/1.2 system-ui,sans-serif;letter-spacing:.03em;opacity:0;transition:opacity .14s;white-space:nowrap';
  document.body.appendChild(hintEl);
  setInterval(recompute, 100);
  setInterval(() => { if (GK.mode === 'play' && cur && NETC.rtt) net.send({ lat: Math.min(500, Math.round(NETC.rtt / 2)) }); }, 2500);   // one-way latency for the server's timing judge

  function press(code) {
    const k = KEYMAP[code]; if (!cur || !k) return false;
    const a = cur.acts.find(x => x.k === k); if (!a) return false;
    if (a.v === '_cycle') { A.choice = (A.choice + 1) % 3; toastMsg('Blessing: ' + U.BLESS[A.choice], true, 1100); recompute(); return true; }
    const m = { r: cur.key, a: a.a, v: a.v }; if (a.x != null) m.x = a.x;
    net.send({ act: m });
    if (a.hold) holding = { code, r: cur.key, a: a.a };
    return true;
  }
  function release(code) { if (holding && holding.code === code) { net.send({ act: { r: holding.r, a: holding.a, v: 'stop' } }); holding = null; } }
  const typing = e => { const t = e.target && e.target.tagName; return t === 'INPUT' || t === 'TEXTAREA'; };
  addEventListener('keydown', e => { if ((e.code === 'KeyR' || e.code === 'KeyQ') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e) && GK.mode === 'play' && !invOpen && !shopOpen && !GK.locked) press(e.code); });
  addEventListener('keyup', e => { if (KEYMAP[e.code]) release(e.code); });
  addEventListener('blur', () => { if (holding) release(holding.code); });

  // ---- art drivers (called for the rooms that are drawn)
  const chOf = (st, n) => (st.ch || []).find(c => c.n === n);
  const lerpMs = (r, t0, ms) => clamp01((srv() - (t0 - r.e)) / ms);
  const pool = (r, key, lvl, ms) => { const m = r.pm || (r.pm = {}); if (lvl >= 1) { delete m[key]; return 1; } if (m[key] == null) m[key] = performance.now(); return Math.min(0.95, (performance.now() - m[key]) / ms); };
  const LANT = ['NE', 'NW', 'SE', 'SW'], GL = { L: 0, FL: 1, FR: 2, R: 3 };
  function driveTree(e, r) {
    const st = r.st, api = e.api, now = srv();
    switch (e.type) {
      case 'well': call(api, 'setStage', Math.max(1, Math.min(4, st.stage | 0))); call(api, 'setFruit', st.ripe ? 1 : 0); call(api, 'setWaterLevel', clamp01((st.water | 0) / (st.max || 4))); call(api, 'setBucket', Math.min(3, st.notch | 0), false); call(api, 'setBucketFull', st.ready != null); break;
      case 'press': {
        const c = chOf(st, 'press'); call(api, 'setPress', c ? lerpMs(r, c.t0, c.ms) : 0); call(api, 'setPressBrain', !!c);
        const rem = st.next ? (st.next - r.e) - now : 25000, ramp = (st.husks | 0) >= 3 ? 0 : clamp01(1 - rem / 25000);
        for (let i = 0; i < 3; i++) call(api, 'setVat', i, ramp);
        if (r.husks != null && (st.husks | 0) > r.husks) call(api, 'popVat', (Math.random() * 3) | 0); r.husks = st.husks | 0; break;
      }
      case 'spring': call(api, 'setPoolGlow', st.healing ? 1 : 0); ['NE', 'SE', 'SW'].forEach((a, i) => call(api, 'setBasin', i, pool(r, a, st.basins && st.basins[a], 25000))); break;
      case 'seer': {
        const v = st.v || [0, 0, 0], t = st.target || [0, 0, 0];
        for (let i = 0; i < 3; i++) { call(api, 'setRing', i, v[i]); call(api, 'setMatch', i, v[i] === t[i]); }
        call(api, 'setTargets', t[0], t[1], t[2]); call(api, 'setEye', 1);
        if (r.solves != null && st.solves > r.solves) { call(api, 'setSolved', 1); setTimeout(() => call(api, 'setSolved', 0), 700); } r.solves = st.solves | 0; break;
      }
      case 'graft': {
        (st.branches || []).forEach((n, i) => call(api, 'setBranch', i, n >= 1 ? 1 : pool(r, 'b' + i, n, 30000) * 0.9));
        const v = st.vise || {}, run = v.state === 'run'; if (run && !r.viseT) r.viseT = performance.now(); if (!run) r.viseT = 0;
        call(api, 'setViseClosed', v.state && v.state !== 'idle' ? 1 : 0); call(api, 'setViseProgress', v.state === 'ready' ? 1 : run ? clamp01((performance.now() - r.viseT) / 6000) : 0); call(api, 'setViseDone', v.state === 'ready'); break;
      }
      case 'thorn': {
        const g = st.grip, held = g ? now - (g.t0 - r.e) : 0; call(api, 'setGrip', g ? (held >= 9000 ? 3 : held >= 6000 ? 2 : held >= 3000 ? 1 : 0) : 0); call(api, 'setBowl', st.bowl | 0); break;
      }
      case 'gambler': call(api, 'setStep', st.stump ? st.stump.step | 0 : st.chew ? 1 : 0); call(api, 'setGourds', st.hoard | 0); call(api, 'setMouth', st.chew ? 1 : st.stump ? 0.5 : 0.15); break;
      case 'memory': {
        const show = st.phase === 'show' && st.show ? st.show : null, idx = show ? Math.floor((now - (st.t0 - r.e)) / (st.per || 700)) : -1, fr = show ? ((now - (st.t0 - r.e)) / (st.per || 700)) % 1 : 0, on = show && idx >= 0 && idx < show.length && fr > 0.08 && fr < 0.75 ? show[idx] : null, pn = performance.now();
        LANT.forEach((a, i) => call(api, 'setLantern', i, on === a || (flashes[e.key + ':' + a] || 0) > pn ? 1 : st.phase === 'idle' ? 0.12 : 0.2)); call(api, 'setTrunkGlow', st.phase === 'idle' ? 0.15 : 0.7); break;
      }
      case 'oak': call(api, 'setWarden', st.held ? 1 : 0); break;
      case 'elder': {
        const need = st.need || 20000, lit = (st.stones || []).filter(s => s.lit).length;
        (st.stones || []).forEach((s, i) => { const c = chOf(st, 'stone' + i); call(api, 'setStone', i, s.lit ? 1 : clamp01(((s.prog | 0) + (c ? now - (c.t0 - r.e) : 0)) / need)); });
        call(api, 'setWake', st.phase === 'waking' || st.phase === 'seed' ? 1 : st.phase === 'withered' ? 0 : lit / 3 * 0.6); call(api, 'setSeed', st.phase === 'seed'); call(api, 'setWithered', st.phase === 'withered'); break;
      }
    }
  }
  function driveVb(e, r) {
    const sk = e.api.skin && e.api.skin(e.type), st = r.st, now = srv(); if (!sk) return;
    const side = sideOfCell(e.key), b = A.breach[side];
    if (b != null) call(e.api, 'setBreach', b | 0);
    switch (e.type) {
      case 'ram': call(sk, 'setTension', Math.min(6, st.notches | 0)); call(sk, 'setRamPull', st.swing ? lerpMs(r, st.swing.t0, 1200) : 0); call(sk, 'setLever', st.swing ? 1 : 0); call(sk, 'setWedges', Math.min(2, st.rack | 0)); call(sk, 'setBarricade', 1, st.bar ? st.bar.hp / (st.bar.max || 60) : 0); break;
      case 'locksmith': call(sk, 'setPins', st.pins | 0, 1); call(sk, 'setNoise', st.noise | 0); call(sk, 'setAlarm', (st.noise | 0) >= 100); break;
      case 'counting': call(sk, 'setMarket', { writPrice: st.price | 0, counterPrice: Math.ceil(1.5 * (st.price | 0)), writs: st.writs | 0, counters: st.counters | 0 }); call(sk, 'setStrongbox', (st.boxStage | 0) / 2); call(sk, 'setAlarm', !!st.alarm); call(sk, 'setRobbery', st.alarm ? 1 : 0); call(sk, 'setSacks', 0, Math.min(3, (st.sacks || []).length)); break;
      case 'keystone': {
        if (st.order) call(sk, 'setOrder', st.order.map(id => GL[id])); call(sk, 'setProgress', st.pos | 0);
        U.STONE_ORDER.forEach((id, i) => { const ms = st.lit && st.lit[i]; call(sk, 'setStone', GL[id], ms > 0 ? 'lit' : 'dark', ms > 0 ? clamp01(ms / 35000) : 0); });
        call(sk, 'setArmed', !!st.armed); call(sk, 'setResonance', st.res | 0); call(sk, 'setAltar', st.armed ? 1 : 0); break;
      }
    }
  }
  function driveVault(e) {
    const d = e.api, r = rooms[W.VAULT_KEY], c = A.crown || (r && r.st) || {}, claims = c.claims || [], g = c.gaining, top = claims.find(x => x.id === g);
    call(d, 'setClaim', top ? (top.s % 10) / 10 : 0, g != null ? colorOf(g) : 0xffd75e);
    const [vx, vz] = rc(W.VAULT); let on = 0; actors.forEach(a => { if (!a.npc && Math.hypot(a.x - vx, a.z - vz) < 2.45) on++; }); call(d, 'setContested', on >= 2);
    call(d, 'setAlarm', !!c.alarm);
    const cof = c.cof || {}; let sum = 0; for (let i = 0; i < 4; i++) { const v = cof['K' + (i + 1)]; const f = v == null ? 1 : clamp01(v / 3); sum += f; call(d, 'setCoffer', i, f); }
    call(d, 'setTreasury', 0.3 + 0.7 * sum / 4);
    for (const s of SIDES) { call(d, 'setDoorBar', s, (c.bars || []).includes(s), false); call(d, 'setBreach', s, (A.breach[s] | 0)); }
  }
  function apply(e) {
    try {
      if (e.kind === 'vault') { driveVault(e); return; }
      const r = rooms[e.key]; if (!r) return;
      if (e.kind === 'tree') { if (r.type === e.type) driveTree(e, r); } else if (e.kind === 'vb') driveVb(e, r);
    } catch (x) { if (!apply.warned) { apply.warned = 1; console.warn('act5 art', x); } }
  }
  return { pre, onMsg, key: e => press(e.code), prompt: () => cur && !cur.busy ? cur.acts[0].label + (cur.acts[0].hold ? ' (hold)' : '') : '', apply, rooms, A, pulsed: id => !!(A.pulse && A.pulse.until > performance.now() && A.pulse.ids.has(id)), recompute, cur: () => cur };
})();
// ACT5UI-END
if (window.GKART) requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => GKART.bake(renderer, { priority: () => { const v = myInv || {}; return [v.weapon, v.armor].concat(v.quick || [], v.backpack || [], (window.GKITEMS && GKITEMS.START || []).flatMap(g => [g.weapon, g.armor])).filter(k => typeof k === 'string'); } }), 600)));   // ITEMART: bake the inventory icons in small batches once the first frame is up
window.__gk = { P, actors, doors, info: renderer.info, scene, setView(x, z, yaw, pitch) { P.x = x; P.z = z; P.yaw = yaw; P.pitch = pitch || 0; spawned = true; }, toggleOverview() { inside = !inside; }, build: buildGoblin };
})();

// TIPS-BEGIN (onboarding: contextual tip card above the bottom-left HUD, How to Play overlay, Show/Reset tips settings; docs/reports/onboarding.md)
(() => {
  const KEY = 'gk.tips.v1', MAX = { go: 3, vaultAim: 3, outer: 2, brain: 2, lowhp: 2, vaultOpen: 2, sudden: 2 };
  const TEXT = {
    go: 'Each round, every room picks ONE door on its panel. It opens when the timer hits 0.',
    vaultAim: 'Vault doors need TWO rooms to pick them, or the vote fizzles.',
    outer: 'Behind outer doors: chests, mystery rooms (risky!) and merchants.',
    brain: 'Eat a goblin brain for 5% of its knowledge. Each brain is also a knowledge point for a perk at the workbench.',
    lowhp: 'Death loses EVERYTHING you carry. Run through a door if you must.',
    vaultOpen: 'THE VAULT holds a relic. Everyone else wants it too.',
    sudden: 'Sudden death: every door is open and only THE VAULT heals. Last goblin standing wins.',
  };
  let st = { on: true, seen: {} };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') st = { on: s.on !== false, seen: s.seen && typeof s.seen === 'object' ? s.seen : {} }; } catch (e) {}
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const card = document.createElement('div');
  card.id = 'gkTip';
  card.style.cssText = 'position:fixed;left:14px;bottom:300px;z-index:44;pointer-events:none;width:min(290px,60vw);padding:9px 12px 10px;border-radius:8px;background:rgba(18,15,10,.86);border:1px solid #c8962e;box-shadow:0 0 0 1px rgba(0,0,0,.6),0 4px 16px rgba(0,0,0,.5),inset 0 0 0 1px rgba(255,215,94,.18);color:#f2efe6;font:600 13.5px/1.35 system-ui,sans-serif;opacity:0;transform:translateY(8px);transition:opacity .3s,transform .3s;display:none';
  card.innerHTML = '<div style="font-size:10.5px;letter-spacing:.18em;color:#ffd75e;margin-bottom:3px">TIP</div><div id="gkTipTx"></div>';
  document.body.appendChild(card);
  let cur = null, hideT = 0, lastEnd = 0; const shownNow = {};   // each tip at most once per page load
  function place() {   // sit just above the topmost bottom-left HUD panel
    let top = innerHeight - 20;
    for (const e of document.body.children) {
      if (e === card) continue;
      const cs = getComputedStyle(e); if (cs.position !== 'fixed' || cs.display === 'none' || +cs.opacity === 0) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 40 || r.height < 20 || r.left > innerWidth * 0.15 || r.bottom < innerHeight * 0.55 || r.top < innerHeight * 0.3) continue;
      top = Math.min(top, r.top);
    }
    card.style.bottom = (innerHeight - top + 10) + 'px';
  }
  function hide() { card.style.opacity = 0; card.style.transform = 'translateY(8px)'; setTimeout(() => { if (!cur) card.style.display = 'none'; }, 320); }
  function show(id) {
    if (!st.on || cur || performance.now() - lastEnd < 1500 || shownNow[id] || (st.seen[id] | 0) >= MAX[id]) return false;
    shownNow[id] = 1;
    st.seen[id] = (st.seen[id] | 0) + 1; persist(); cur = id;
    card.querySelector('#gkTipTx').textContent = TEXT[id]; place(); card.style.display = 'block';
    requestAnimationFrame(() => { card.style.opacity = 1; card.style.transform = 'none'; });
    try { window.GKAUDIO && GKAUDIO.play('tip'); } catch (e) {}
    clearTimeout(hideT); hideT = setTimeout(() => { cur = null; lastEnd = performance.now(); hide(); }, 7500);
    return true;
  }
  GK.tips = { show, reset() { st.seen = {}; for (const k in shownNow) delete shownNow[k]; persist(); }, setOn(v) { st.on = !!v; persist(); if (!v) { cur = null; clearTimeout(hideT); card.style.display = 'none'; } }, state: () => st };

  let goAt = 0, prevOpenVault = false;
  setInterval(() => {
    if (cur) place();   // UI-POLISH: follow the stat cards (they appear and grow after the tip is shown)
    if (!st.on || GK.mode !== 'play' || GK.locked) { if (cur && GK.mode !== 'play') { cur = null; clearTimeout(hideT); card.style.display = 'none'; } return; }
    if (!goAt) goAt = performance.now();
    const ri = GK.roundInfo(), env = GK.tipEnv(), mine = env.mine, now = performance.now();
    const sudden = !!document.getElementById('gkSudTag');
    const vd = GK.ROOM_DOORS[window.GKWORLD.VAULT_KEY] || [], vaultOpen = !sudden && vd.some(d => (ri.open || []).includes(d));
    if (sudden) { show('sudden'); return; }
    if (mine && mine.hp != null && mine.maxHp && mine.hp > 0 && mine.hp / mine.maxHp <= 0.35 && show('lowhp')) return;
    if (vaultOpen && !prevOpenVault) { prevOpenVault = true; if (show('vaultOpen')) return; }
    if (!vaultOpen) prevOpenVault = false;
    if (env.brainNear && show('brain')) return;
    const kind = GK.tipAim();
    if (kind === 'vault' && show('vaultAim')) return;
    if (kind && kind !== 'vault' && kind !== 'skull' && show('outer')) return;
    if (now - goAt < 20000 && show('go')) return;
  }, 300);

  // ---- settings rows and menu button (index.html <!-- TIPS --> blocks) ----
  const chk = document.getElementById('s-tips'), rst = document.getElementById('s-tipsreset'), hb = document.getElementById('b-howto');
  if (chk) { chk.checked = st.on; chk.onchange = () => GK.tips.setOn(chk.checked); }
  if (rst) rst.onclick = () => { GK.tips.reset(); rst.textContent = 'Done'; setTimeout(() => { rst.textContent = 'Reset'; }, 1200); };

  // ---- How to Play overlay: five canvas drawings in the gold style ----
  const GOLDC = '#f5c451', DARK = '#120f0a', PINK = '#f08aa8';
  const PANELS = [
    { t: 'Pick a door', x: 'Each room votes on ONE door at its panel. When the timer hits 0, picked doors open.', d(g) {
      g.fillStyle = '#0d1b2a'; g.fillRect(14, 16, 96, 118); g.strokeStyle = '#4aa8ff'; g.strokeRect(14, 16, 96, 118);
      [0, 1, 2].forEach(i => { g.fillStyle = i === 1 ? GOLDC : '#2f5e8f'; g.fillRect(24, 28 + i * 34, 76, 24); });
      g.fillStyle = GOLDC; g.fillRect(150, 30, 70, 100); g.fillStyle = DARK; g.fillRect(158, 38, 54, 92);
      g.strokeStyle = GOLDC; g.lineWidth = 3; g.beginPath(); g.moveTo(112, 74); g.lineTo(144, 74); g.lineTo(136, 66); g.moveTo(144, 74); g.lineTo(136, 82); g.stroke();
      g.fillStyle = GOLDC; g.font = 'bold 15px system-ui'; g.fillText('0:00', 166, 24); } },
    { t: 'The vault needs two', x: 'A vault door only opens if TWO different rooms pick it. One lonely vote fizzles.', d(g) {
      g.strokeStyle = GOLDC; g.lineWidth = 4; g.beginPath(); g.arc(130, 78, 54, 0, 7); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(130, 78, 38, 0, 7); g.stroke();
      g.fillStyle = GOLDC; g.font = 'bold 44px system-ui'; g.textAlign = 'center'; g.fillText('$', 130, 94);
      g.font = 'bold 13px system-ui'; g.fillText('ROOM A', 38, 150); g.fillText('ROOM B', 222, 150); g.textAlign = 'left';
      g.fillRect(14, 60, 46, 5); g.fillRect(200, 60, 46, 5); } },
    { t: 'Chests, mysteries, merchants', x: 'Outer doors lead to chest rooms, risky mystery rooms and merchants who sell for gold.', d(g) {
      [['▣', 30], ['?', 105], ['●', 180]].forEach(([c, x], i) => {
        g.strokeStyle = GOLDC; g.lineWidth = 3; g.strokeRect(x, 40, 60, 70); g.fillStyle = i === 1 ? '#ff7a4a' : GOLDC; g.font = 'bold 38px system-ui'; g.textAlign = 'center'; g.fillText(c, x + 30, 87);
        g.font = 'bold 11px system-ui'; g.fillStyle = '#efe9d8'; g.fillText(['CHEST', 'MYSTERY', 'MERCHANT'][i], x + 30, 128); }); g.textAlign = 'left'; } },
    { t: 'Brains and knowledge', x: 'Eat a fallen goblin\'s brain to gain 5% of its knowledge. Knowledge unlocks recipe tiers, and every brain is a point to spend on a perk at the workbench or knowledge tree.', d(g) {
      g.fillStyle = PINK; g.beginPath(); g.ellipse(80, 78, 42, 32, 0, 0, 7); g.fill(); g.strokeStyle = '#a83a60'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(80, 48); g.quadraticCurveTo(70, 78, 80, 108); g.moveTo(55, 70); g.quadraticCurveTo(70, 66, 80, 76); g.moveTo(105, 84); g.quadraticCurveTo(92, 82, 80, 90); g.stroke();
      g.strokeStyle = GOLDC; g.lineWidth = 3; g.beginPath(); g.moveTo(130, 78); g.lineTo(158, 78); g.lineTo(150, 70); g.moveTo(158, 78); g.lineTo(150, 86); g.stroke();
      g.fillStyle = '#5fae4a'; g.beginPath(); g.arc(205, 82, 28, 0, 7); g.fill(); g.beginPath(); g.moveTo(180, 80); g.lineTo(166, 62); g.lineTo(184, 70); g.fill(); g.beginPath(); g.moveTo(230, 80); g.lineTo(244, 62); g.lineTo(226, 70); g.fill();
      g.fillStyle = DARK; g.fillRect(195, 76, 5, 5); g.fillRect(211, 76, 5, 5); g.fillStyle = GOLDC; g.font = 'bold 14px system-ui'; g.fillText('+5%', 187, 130); } },
    { t: 'Death loses everything', x: 'If you die, you drop ALL you carry. Run through a door if the fight is lost.', d(g) {
      g.fillStyle = '#e9e4d6'; g.beginPath(); g.arc(130, 62, 32, 0, 7); g.fill(); g.fillRect(114, 80, 32, 22);
      g.fillStyle = DARK; g.beginPath(); g.arc(118, 62, 8, 0, 7); g.arc(142, 62, 8, 0, 7); g.fill(); g.fillRect(126, 74, 8, 8);
      g.fillStyle = GOLDC; [[30, 40], [50, 100], [210, 50], [225, 110], [70, 130]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); });
      g.strokeStyle = '#ff4a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(100, 120); g.lineTo(160, 140); g.moveTo(160, 120); g.lineTo(100, 140); g.stroke(); } },
  ];
  let ov = null;
  function closeHow() { if (ov) { ov.remove(); ov = null; document.removeEventListener('keydown', onKey, true); } }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closeHow(); } }
  function openHow() {
    if (ov) return;
    ov = document.createElement('div'); ov.id = 'gkHowTo';
    ov.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(8,7,11,.94);overflow:auto;padding:22px 16px;display:flex;font-family:var(--ui,system-ui);color:#efe9d8';
    ov.innerHTML = '<div style="max-width:1180px;margin:auto;width:100%"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px"><h2 style="margin:0;color:#f5c451;font-family:var(--disp,Georgia,serif);letter-spacing:.05em;text-transform:uppercase;font-size:var(--t4,30px)">How to play</h2><button id="gkHowX" class="rbtn primary" style="flex:none;padding:0 22px">Skip / close</button></div><div id="gkHowG" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:var(--s2,14px);margin-top:var(--s3,20px)"></div></div>';
    const grid = ov.querySelector('#gkHowG');
    PANELS.forEach((p, i) => {
      const c = document.createElement('canvas'); c.width = 260; c.height = 160; c.style.cssText = 'width:100%;height:auto;display:block;background:#1a150d;border-bottom:2px solid #c8962e';
      const g = c.getContext('2d'); g.textBaseline = 'alphabetic'; p.d(g);
      const w = document.createElement('div'); w.style.cssText = 'background:#14110b;border:1px solid #a8741a;border-radius:0;overflow:hidden;box-shadow:0 0 0 1px #000,inset 0 0 0 1px rgba(255,215,94,.15)';
      w.appendChild(c); const t = document.createElement('div'); t.style.cssText = 'padding:10px 12px 14px';
      t.innerHTML = '<div style="color:#f5c451;font:700 var(--t3,20px)/1.1 var(--ui,system-ui);letter-spacing:.08em;text-transform:uppercase;margin-bottom:5px">' + (i + 1) + '. ' + p.t + '</div><div style="font-size:var(--t2,16px);line-height:1.25;color:#d8d2c0">' + p.x + '</div>';
      w.appendChild(t); grid.appendChild(w);
    });
    document.body.appendChild(ov); ov.querySelector('#gkHowX').onclick = closeHow; ov.onclick = e => { if (e.target === ov) closeHow(); };
    document.addEventListener('keydown', onKey, true); ov.querySelector('#gkHowX').focus();
  }
  if (hb) hb.onclick = openHow;
  GK.howTo = { open: openHow, close: closeHow };
})();
// TIPS-END

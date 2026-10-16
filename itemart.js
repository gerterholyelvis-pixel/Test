// Goblin King item art: custom stylized 3D models for every item, built in code (see docs/ART.md).
//   GKART.model(key)      -> fresh THREE.Object3D (weapons, armour, brains, gold, parts), built along +y, ~1.5 m tall, centred on the origin
//   GKART.bake(renderer)  -> renders every item once into a cached icon (private scene + lights + PMREM, never touches the game scene)
//   GKART.icon(key)       -> baked <canvas> or null; icons.js uses it and refreshes on the 'gkart-icons' event
//   GKART.sheet()         -> contact sheet canvas of all baked icons (debug); GKART.showSheet() overlays it on the page
// Everything is shared through caches: textures (<= 512 px, generated once), materials, and one prototype per item key.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const PI = Math.PI, TAU = PI * 2;
const ACC = { rare: 0x4a8dff, mythic: 0xa455ff, legendary: 0xff9a1a, transcendent: 0x3ff0ff };
const GLOW = { uncommon: 0x7fe08a, rare: 0x4a8dff, mythic: 0xa455ff, legendary: 0xff9a1a, transcendent: 0x3ff0ff };
const TIER_ORDER = ['common', 'uncommon', 'rare', 'mythic', 'legendary', 'transcendent'];
const infoOf = key => { const I = window.GKITEMS; return I ? (I.info ? I.info(key) : I.ITEMS[key]) || null : null; };

// ---------- small utils ----------
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
const cache = new Map(), memo = (k, f) => { let v = cache.get(k); if (v === undefined) { v = f(); cache.set(k, v); } return v; };

// ---------- procedural textures (<= 512 px, generated once, greyscale-ish so the material colour tints them) ----------
function canvasTex(name, size, draw, rx = 1, ry = rx) {
  return memo('tex:' + name, () => {
    const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size, rng(hash(name)));
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.repeat.set(rx, ry); return t;
  });
}
const wrapDraw = (g, s, x, y, f) => { for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) { if (x + ox < -80 || x + ox > s + 80 || y + oy < -80 || y + oy > s + 80) continue; g.save(); g.translate(ox, oy); f(); g.restore(); } };
const TEX = {
  wood: () => canvasTex('wood', 512, (g, s, r) => {   // grain runs along v (canvas x = around the shaft): long wavy lines, knots, nicks
    g.fillStyle = '#cdb089'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { const x = r() * s, w = 0.6 + r() * 2.4, ph = r() * 6, amp = 1 + r() * 4; g.strokeStyle = r() < 0.7 ? 'rgba(70,40,15,' + (0.06 + r() * 0.22) + ')' : 'rgba(255,235,200,' + (0.05 + r() * 0.12) + ')'; g.lineWidth = w; g.beginPath(); for (let y = 0; y <= s; y += 16) { const xx = x + Math.sin(y * 0.02 + ph) * amp; y ? g.lineTo(xx, y) : g.moveTo(xx, y); } g.stroke(); }
    for (let k = 0; k < 4; k++) { const x = r() * s, y = r() * s; wrapDraw(g, s, x, y, () => { for (let q = 5; q > 0; q--) { g.strokeStyle = 'rgba(60,32,10,' + (0.12 + 0.05 * q) + ')'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x, y, 4 + q * 5, 9 + q * 10, 0, 0, TAU); g.stroke(); } }); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(40,22,8,' + (0.2 + r() * 0.3) + ')'; g.lineWidth = 1 + r() * 1.5; const x = r() * s, y = r() * s, l = 6 + r() * 16; g.beginPath(); g.moveTo(x, y); g.lineTo(x + l * (r() - 0.5), y + l * 0.3); g.stroke(); }
  }, 1, 2),
  metal: () => canvasTex('metal', 512, (g, s, r) => {   // brushed steel: streaks, scratches, pits, a few worn light patches
    g.fillStyle = '#d6dadf'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) { const x = r() * s, y = r() * s, l = 30 + r() * 160; g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,' + r() * 0.09 + ')' : 'rgba(40,50,60,' + r() * 0.07 + ')'; wrapDraw(g, s, x, y, () => g.fillRect(x, y, l, 1 + r() * 1.5)); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(20,24,30,0.28)'; g.lineWidth = 0.7; const x = r() * s, y = r() * s, a = r() * TAU, l = 10 + r() * 50; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(25,30,36,' + (0.05 + r() * 0.14) + ')'; g.beginPath(); g.arc(r() * s, r() * s, 0.5 + r() * 1.4, 0, TAU); g.fill(); }
    for (let i = 0; i < 10; i++) { const x = r() * s, y = r() * s, rr = 14 + r() * 36, gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(95,72,50,0.16)'); gr.addColorStop(1, 'rgba(95,72,50,0)'); g.fillStyle = gr; wrapDraw(g, s, x, y, () => g.fillRect(x - rr, y - rr, rr * 2, rr * 2)); }
  }, 2, 2),
  leather: () => canvasTex('leather', 256, (g, s, r) => {   // pebbled hide with a stitched seam near both edges
    g.fillStyle = '#c9a585'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) { const x = r() * s, y = r() * s, q = 1 + r() * 2.3; g.fillStyle = 'rgba(50,28,12,' + (0.05 + r() * 0.13) + ')'; g.beginPath(); g.arc(x, y, q, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,230,190,0.07)'; g.beginPath(); g.arc(x - 0.8, y - 0.8, q * 0.7, 0, TAU); g.fill(); }
    for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(40,20,8,' + (0.1 + r() * 0.15) + ')'; g.lineWidth = 1; const x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20 * (r() - 0.5), y + 14, x + 30 * (r() - 0.5), y + 34 * r()); g.stroke(); }
    for (const y of [s * 0.07, s * 0.93]) { g.strokeStyle = 'rgba(30,15,5,0.55)'; g.lineWidth = 2.2; g.setLineDash([9, 6]); g.beginPath(); g.moveTo(0, y + 1.5); g.lineTo(s, y + 1.5); g.stroke(); g.strokeStyle = '#efdcae'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); g.setLineDash([]); }
  }, 3, 2),
  cloth: () => canvasTex('cloth', 256, (g, s, r) => {   // plain weave
    g.fillStyle = '#d9d1bd'; g.fillRect(0, 0, s, s); const c = 4;
    for (let y = 0; y < s; y += c) for (let x = 0; x < s; x += c) { const o = ((x + y) / c) & 1, v = r() * 0.12; g.fillStyle = o ? 'rgba(255,250,235,' + (0.18 + v) + ')' : 'rgba(60,45,25,' + (0.14 + v) + ')'; g.fillRect(x, y + (o ? 0 : 1), c - 1, c - 1); }
    for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(70,50,30,' + r() * 0.2 + ')'; g.lineWidth = 1; const y = r() * s; g.beginPath(); g.moveTo(0, y); g.lineTo(s, y + (r() - 0.5) * 3); g.stroke(); }
  }, 5, 3),
  burlap: () => canvasTex('burlap', 256, (g, s, r) => {   // coarse sacking
    g.fillStyle = '#bda878'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 6) { g.fillStyle = 'rgba(90,65,30,' + (0.25 + r() * 0.2) + ')'; g.fillRect(0, y, s, 2); }
    for (let x = 0; x < s; x += 6) { g.fillStyle = 'rgba(255,240,200,' + (0.12 + r() * 0.15) + ')'; g.fillRect(x, 0, 2, s); }
    for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(60,40,15,' + r() * 0.25 + ')'; g.fillRect(r() * s, r() * s, 2 + r() * 8, 1); }
  }, 4, 3),
  quilt: () => canvasTex('quilt', 256, (g, s, r) => {   // padded diamonds
    g.fillStyle = '#d8ceb4'; g.fillRect(0, 0, s, s); const n = 4, d = s / n;
    for (let j = -1; j < n; j++) for (let i = -1; i < n; i++) { const cx = (i + 0.5) * d + (j & 1 ? d / 2 : 0), cy = (j + 0.5) * d; const gr = g.createRadialGradient(cx, cy, 2, cx, cy, d * 0.55); gr.addColorStop(0, 'rgba(255,250,235,0.55)'); gr.addColorStop(1, 'rgba(80,60,30,0.35)'); g.fillStyle = gr; g.beginPath(); g.moveTo(cx, cy - d / 2); g.lineTo(cx + d / 2, cy); g.lineTo(cx, cy + d / 2); g.lineTo(cx - d / 2, cy); g.closePath(); g.fill(); g.strokeStyle = 'rgba(50,35,15,0.6)'; g.lineWidth = 1.6; g.stroke(); }
    for (let i = 0; i < 1200; i++) { g.fillStyle = 'rgba(60,45,25,' + r() * 0.1 + ')'; g.fillRect(r() * s, r() * s, 1, 1); }
  }, 3, 3),
  mail: () => canvasTex('mail', 256, (g, s, r) => {   // interlocking rings
    g.fillStyle = '#23272c'; g.fillRect(0, 0, s, s); const d = 16, n = s / d;
    for (let j = 0; j < n * 2; j++) for (let i = -1; i <= n; i++) { const x = i * d + (j & 1 ? d / 2 : 0), y = j * d / 2; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 3.6; g.beginPath(); g.arc(x + 1, y + 1.5, d * 0.34, 0, TAU); g.stroke(); const v = 175 + Math.floor(r() * 70); g.strokeStyle = 'rgb(' + v + ',' + (v + 4) + ',' + (v + 10) + ')'; g.lineWidth = 2.4; g.beginPath(); g.arc(x, y, d * 0.34, 0, TAU); g.stroke(); }
  }, 3, 3),
  scale: () => canvasTex('scale', 256, (g, s, r) => {   // overlapping scales
    g.fillStyle = '#16191c'; g.fillRect(0, 0, s, s); const d = 32, n = s / d;
    for (let j = -1; j < n * 2 + 1; j++) for (let i = -1; i <= n; i++) { const x = i * d + (j & 1 ? d / 2 : 0), y = j * d * 0.5; const gr = g.createLinearGradient(x, y - d / 2, x, y + d / 2); const v = 150 + Math.floor(r() * 80); gr.addColorStop(0, 'rgb(' + (v + 40) + ',' + (v + 40) + ',' + (v + 40) + ')'); gr.addColorStop(1, 'rgb(' + (v - 70) + ',' + (v - 70) + ',' + (v - 70) + ')'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - d / 2, y - d * 0.1); g.quadraticCurveTo(x - d / 2, y + d * 0.55, x, y + d * 0.55); g.quadraticCurveTo(x + d / 2, y + d * 0.55, x + d / 2, y - d * 0.1); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 1.5; g.stroke(); }
  }, 2, 2),
  ermine: () => canvasTex('ermine', 256, (g, s, r) => {
    g.fillStyle = '#f0ebe0'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { const x = r() * s, y = r() * s; wrapDraw(g, s, x, y, () => { g.fillStyle = '#26211f'; g.beginPath(); g.ellipse(x, y, 3, 6, 0, 0, TAU); g.fill(); g.fillRect(x - 1, y + 4, 2, 9); }); }
    for (let i = 0; i < 1500; i++) { g.fillStyle = 'rgba(160,150,135,' + r() * 0.12 + ')'; g.fillRect(r() * s, r() * s, 1, 3); }
  }, 2, 1),
  royal: () => canvasTex('royal', 256, (g, s, r) => {   // crimson velvet with gold fleur-like studs
    g.fillStyle = '#b3122b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 3000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,120,130,' + r() * 0.08 + ')' : 'rgba(40,0,10,' + r() * 0.14 + ')'; g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2); }
    g.fillStyle = 'rgba(255,201,51,0.8)'; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const x = (i + (j & 1 ? 0.5 : 0)) * 64 + 16, y = j * 64 + 32; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); for (const a of [0, 2.1, 4.2]) { g.beginPath(); g.ellipse(x + Math.cos(a - 1.57) * 7, y + Math.sin(a - 1.57) * 7, 2, 4, a, 0, TAU); g.fill(); } }
  }, 2, 2),
  stars: () => canvasTex('stars', 256, (g, s, r) => {   // wizard silk: deep violet with gold stars
    const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#4b27a0'); gr.addColorStop(1, '#2f1a72'); g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2000; i++) { g.fillStyle = 'rgba(255,255,255,' + r() * 0.05 + ')'; g.fillRect(r() * s, r() * s, 1, 2); }
    for (let i = 0; i < 26; i++) { const x = r() * s, y = r() * s, q = 3 + r() * 5; wrapDraw(g, s, x, y, () => { g.fillStyle = r() < 0.7 ? '#ffd24a' : '#fff4c0'; g.beginPath(); for (let k = 0; k < 10; k++) { const a = k * PI / 5 - PI / 2, rr = k & 1 ? q * 0.42 : q; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }); }
  }, 2, 2),
  bark: () => canvasTex('bark', 256, (g, s, r) => {
    g.fillStyle = '#a58d6b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 70; i++) { const x = r() * s; g.strokeStyle = 'rgba(40,25,10,' + (0.2 + r() * 0.35) + ')'; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= s; y += 20) g.lineTo(x + Math.sin(y * 0.05 + i) * 5, y); g.stroke(); }
  }, 2, 1),
  hide: () => canvasTex('hide', 256, (g, s, r) => {   // mottled fur-ish patchwork
    g.fillStyle = '#d3b38c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) { const x = r() * s, y = r() * s, q = 10 + r() * 28; wrapDraw(g, s, x, y, () => { g.fillStyle = r() < 0.5 ? 'rgba(60,35,15,0.28)' : 'rgba(255,240,210,0.2)'; g.beginPath(); g.ellipse(x, y, q, q * 0.6, r() * 3, 0, TAU); g.fill(); }); }
    for (let i = 0; i < 2500; i++) { g.strokeStyle = 'rgba(50,30,12,' + r() * 0.2 + ')'; g.lineWidth = 1; const x = r() * s, y = r() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y + 4); g.stroke(); }
  }, 2, 2),
  glow: () => canvasTex('glow', 128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }),
  spark: () => canvasTex('spark', 64, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); g.fillStyle = '#fff'; g.fillRect(s / 2 - 1, 4, 2, s - 8); g.fillRect(4, s / 2 - 1, s - 8, 2); }),
};
const tex = k => TEX[k]();

// ---------- materials (cached by kind + colour + options) ----------
const pulsers = [];   // { mat, base, amp, speed, ph }: gently animated emissive (mythic runes, legendary embers)
let pulseOn = false;
function startPulse() {
  if (pulseOn || typeof requestAnimationFrame === 'undefined') return; pulseOn = true;
  const step = t => { const s = t / 1000; for (const p of pulsers) p.mat.emissiveIntensity = p.base + p.amp * (0.5 + 0.5 * Math.sin(s * p.speed + p.ph)); requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const MK = {
  steel: (c, o) => ({ map: tex('metal'), bumpMap: tex('metal'), bumpScale: 0.5, color: c, metalness: 0.9, roughness: o.rough ?? 0.34 }),
  iron: (c, o) => ({ map: tex('metal'), bumpMap: tex('metal'), bumpScale: 0.9, color: c, metalness: 0.75, roughness: o.rough ?? 0.6 }),
  gold: (c, o) => ({ color: c, metalness: 1, roughness: 0.24, emissive: o.emissive ?? 0x6a4300, emissiveIntensity: o.ei ?? 0.5 }),
  iri: (c, o) => ({ map: tex(o.tex || 'metal'), side: THREE.DoubleSide, color: c, metalness: 0.85, roughness: 0.18, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 700], emissive: 0x1a6a78, emissiveIntensity: 0.35 }),
  wood: (c, o) => ({ map: tex('wood'), bumpMap: tex('wood'), bumpScale: 0.7, color: c, metalness: 0, roughness: 0.82 }),
  bark: (c) => ({ map: tex('bark'), bumpMap: tex('bark'), bumpScale: 1.5, color: c, metalness: 0, roughness: 0.95 }),
  leather: (c, o) => ({ map: tex('leather'), bumpMap: tex('leather'), bumpScale: 0.8, color: c, metalness: 0, roughness: o.rough ?? 0.78, side: THREE.DoubleSide }),
  hide: (c) => ({ map: tex('hide'), bumpMap: tex('hide'), bumpScale: 0.8, color: c, metalness: 0, roughness: 0.92, side: THREE.DoubleSide }),
  cloth: (c, o) => ({ map: tex(o.tex || 'cloth'), bumpMap: tex(o.tex || 'cloth'), bumpScale: 0.9, color: c, metalness: 0, roughness: 0.95, side: THREE.DoubleSide }),
  mail: (c, o) => ({ map: tex('mail'), bumpMap: tex('mail'), bumpScale: 1.2, color: c, metalness: 0.75, roughness: 0.5, side: THREE.DoubleSide }),
  scale: (c, o) => ({ map: tex('scale'), bumpMap: tex('scale'), bumpScale: 1.4, color: c, metalness: 0.7, roughness: o.rough ?? 0.4, side: THREE.DoubleSide, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 0 }),
  silk: (c, o) => ({ map: tex(o.tex), bumpMap: tex(o.tex), bumpScale: 0.4, color: c, metalness: 0.05, roughness: 0.55, side: THREE.DoubleSide, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xc8a8ff) }),
  gem: (c, o) => ({ color: c, emissive: c, emissiveIntensity: o.ei ?? 1.3, metalness: 0.1, roughness: 0.12 }),
  flesh: (c) => ({ color: c, metalness: 0, roughness: 0.34, vertexColors: true, clearcoat: 0.8, clearcoatRoughness: 0.25, sheen: 0.6, sheenColor: new THREE.Color(0xffb0c0), sheenRoughness: 0.4 }),
  plain: (c, o) => ({ color: c, metalness: o.metal ?? 0, roughness: o.rough ?? 0.7, emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 0 }),
};
function M(kind, color, o = {}) {
  const key = 'mat:' + kind + ':' + color + ':' + JSON.stringify(o);
  return memo(key, () => {
    const p = MK[kind](color, o);
    const phys = kind === 'iri' || kind === 'flesh' || kind === 'silk';
    const m = phys ? new THREE.MeshPhysicalMaterial(p) : new THREE.MeshStandardMaterial(p);
    if (o.pulse) { pulsers.push({ mat: m, base: m.emissiveIntensity, amp: o.pulse, speed: o.speed || 2.2, ph: pulsers.length * 1.3 }); startPulse(); }
    m.userData.shared = true; return m;
  });
}

// ---------- geometry toolkit ----------
const UP = new THREE.Vector3(0, 1, 0), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (pts, seg = 24) => { const a = []; for (let i = 0; i < pts.length; i += 2) a.push(new THREE.Vector2(pts[i], pts[i + 1])); return new THREE.LatheGeometry(a, seg); };
const ext = (shape, depth = 0.01, bt = 0.008, bs = 0.006, seg = 2) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bs, bevelSegments: seg, curveSegments: 8 }); g.translate(0, 0, -depth / 2); return g; };
const polyShape = pts => { const s = new THREE.Shape(); pts.forEach((p, i) => i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])); s.closePath(); return s; };
const mirrorPts = pts => pts.map(p => [-p[0], p[1]]).reverse();
const bez = (p0, c, p1, n = 8) => { const o = []; for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]); } return o; };
const rrShape = (w, h, r) => { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2); s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s; };
const rbox = (w, h, d, e = 0.008) => ext(rrShape(w - 2 * e, h - 2 * e, e * 1.5), Math.max(d - 2 * e, 0.001), e, e, 2);   // bevelled box
const SP = (r = 1, w = 14, h = 10) => memo('sp' + r + ',' + w + ',' + h, () => new THREE.SphereGeometry(r, w, h));
const CONE = (r, h, seg = 6) => memo('cone' + r + ',' + h + ',' + seg, () => { const g = new THREE.ConeGeometry(r, h, seg); g.translate(0, h / 2, 0); return g; });
const CYL = (r0, r1, h, seg = 10) => memo('cyl' + r0 + ',' + r1 + ',' + h + ',' + seg, () => { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(0, h / 2, 0); return g; });   // base radius r0 at y=0, top r1 at y=h
const TOR = (R, r, rs = 6, ts = 16) => memo('tor' + R + ',' + r + ',' + rs + ',' + ts, () => new THREE.TorusGeometry(R, r, rs, ts));
const BOXG = (w, h, d) => memo('box' + w + ',' + h + ',' + d, () => new THREE.BoxGeometry(w, h, d));
// swept tube along a Catmull-Rom path with a radius function; caps closed
function sweep(pts, rad, radial = 8, steps = 24) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => V(p[0], p[1], p[2] || 0)), false, 'centripetal'), fr = curve.computeFrenetFrames(steps, false);
  const pos = [], nor = [], uv = [], idx = [], rf = typeof rad === 'function' ? rad : () => rad;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, P = curve.getPointAt(t), r = rf(t), N = fr.normals[i], Bn = fr.binormals[i];
    for (let j = 0; j <= radial; j++) { const a = j / radial * TAU, c = Math.cos(a), s = Math.sin(a); const nx = N.x * c + Bn.x * s, ny = N.y * c + Bn.y * s, nz = N.z * c + Bn.z * s; pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r); nor.push(nx, ny, nz); uv.push(j / radial, t); }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  for (const [i, sgn] of [[0, -1], [steps, 1]]) {   // caps
    const P = curve.getPointAt(i / steps), T = fr.tangents[i], c0 = pos.length / 3; pos.push(P.x, P.y, P.z); nor.push(T.x * sgn, T.y * sgn, T.z * sgn); uv.push(0.5, i / steps);
    for (let j = 0; j < radial; j++) { const a = i * (radial + 1) + j; if (sgn < 0) idx.push(c0, a + 1, a); else idx.push(c0, a, a + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
// value-noise-ish displacement for blobs
const nz3 = (x, y, z) => Math.sin(x * 1.7 + Math.sin(y * 2.3 + z)) * Math.sin(y * 1.9 + Math.sin(z * 2.1 + x)) * Math.sin(z * 2.5 + Math.sin(x * 1.3 + y));
function blob(r, amp, seed, sx = 1, sy = 1, sz = 1, freq = 3, w = 24, h = 16, shade = false) {
  let g = new THREE.SphereGeometry(r, w, h); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-5);
  const p = g.attributes.position, v = new THREE.Vector3(), cols = []; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(), q = nz3(n.x * freq + seed, n.y * freq, n.z * freq + seed * 0.7), d = shade ? 1 + amp * (Math.min(1, Math.abs(q) * 5) * 1.5 - 1.1 + 0.3 * nz3(n.x * freq * 1.9, n.y * freq * 1.9 + seed, n.z * freq * 1.9)) : 1 + amp * (q + 0.5 * nz3(n.x * freq * 2.1, n.y * freq * 2.1 + seed, n.z * freq * 2.1)); p.setXYZ(i, n.x * r * d * sx, n.y * r * d * sy, n.z * r * d * sz); if (shade) { const s = Math.min(1, Math.max(0.35, 0.72 + (d - 1) / amp * 0.3)); cols.push(s, s * 0.92, s * 0.95); } }
  g.computeVertexNormals(); if (shade) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); return g;
}

// ---------- model builder: collects geometry per material, merges into one mesh per material ----------
function norm(g) {
  for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv' && n !== 'color') g.deleteAttribute(n);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.index) g = mergeVertices(g, 1e-4);
  return g;
}
class Build {
  constructor(key) { this.key = key; this.g = new Map(); this.R = rng(hash(key)); this.spine = null; this.gem = null; this.ownGem = false; this.glowCol = 0; this.sparks = false; }
  addM(mat, geo, m) { let l = this.g.get(mat); if (!l) this.g.set(mat, l = []); l.push(norm(geo.clone().applyMatrix4(m))); return this; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) { _q.setFromEuler(_e.set(rx, ry, rz)); return this.addM(mat, geo, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))); }
  aim(mat, geo, x, y, z, dx, dy, dz, sx = 1, sy = sx, sz = sx) { _q.setFromUnitVectors(UP, _d.set(dx, dy, dz).normalize()); return this.addM(mat, geo, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz))); }
  finish(height, tier) {
    const grp = new THREE.Group(), bb = new THREE.Box3();
    for (const [mat, list] of this.g) {
      if (list.some(g => g.attributes.color)) for (const g of list) if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      const geo = mergeGeometries(list, false); geo.computeBoundingBox(); bb.union(geo.boundingBox); grp.add(new THREE.Mesh(geo, mat));
    }
    const c = bb.getCenter(new THREE.Vector3()), s = height / (bb.max.y - bb.min.y);
    for (const m of grp.children) { m.geometry.translate(-c.x, -c.y, -c.z); m.geometry.scale(s, s, s); m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere(); m.userData.art = 1; }
    const size = bb.getSize(new THREE.Vector3()).multiplyScalar(s); grp.userData.size = size;
    if (this.glowCol) {   // soft additive halo (mythic and up), shared material per colour
      const sp = new THREE.Sprite(glowMat(this.glowCol, tier)); sp.scale.setScalar(height * 1.25); sp.renderOrder = 4; sp.userData.glow = true; grp.add(sp);
    }
    if (this.sparks) {   // transcendent: a handful of floating sparkles (one Points draw call)
      const r = rng(hash(this.key + 'sp')), n = 22, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const ang = r() * TAU, rad = 0.12 + r() * 0.28; a[i * 3] = Math.cos(ang) * rad * (size.x + 0.4) * 0.8; a[i * 3 + 1] = (r() - 0.5) * height * 1.05; a[i * 3 + 2] = Math.sin(ang) * rad * (size.x + 0.4) * 0.8; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(a, 3)); const pts = new THREE.Points(geo, sparkMat()); pts.userData.sparks = true; grp.add(pts);
    }
    grp.userData.key = this.key; grp.userData.glowColor = this.glowCol;
    return grp;
  }
}
const glowMat = (col, tier) => memo('glowmat' + col + tier, () => new THREE.SpriteMaterial({ map: tex('glow'), color: col, transparent: true, opacity: tier === 'mythic' ? 0.42 : 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
const sparkMat = () => memo('sparkmat', () => new THREE.PointsMaterial({ map: tex('spark'), color: 0xcffcff, size: 0.075, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true }));

// ---------- tier context: materials per item and the tier accents of ART.md ----------
// slots: S steel/blade, T trim (gold by default), H handle (wood/leather), A accent (gem + runes). Usually 3-4 draw calls.
function ctxFor(it, spec = {}) {
  const tier = it.tier || 'common', tn = Math.max(0, TIER_ORDER.indexOf(tier)), dull = tier === 'common', clean = tier === 'uncommon';
  const sc = new THREE.Color(spec.steel ?? 0xb9c1c9); if (dull && !spec.keepTone) sc.multiplyScalar(0.74); else if (clean) sc.multiplyScalar(1.04);
  const kind = spec.mail ? 'mail' : spec.scale ? 'scale' : spec.iron ? 'iron' : 'steel';
  const S = tier === 'transcendent' && !spec.noIri ? M('iri', 0xdff8ff) : M(kind, sc.getHex(), { rough: spec.rough ?? (dull ? 0.62 : clean ? 0.42 : 0.3), emissive: spec.emissive, ei: spec.ei });
  const goldO = tier === 'legendary' ? { emissive: 0xff6a10, ei: 0.75, pulse: 0.3, speed: 1.6 } : tier === 'transcendent' ? { emissive: 0x30d8e8, ei: 0.55 } : {};
  const G = M('gold', spec.goldCol ?? 0xffc933, goldO);
  const T = spec.trim === 'steel' ? S : spec.trim === 'dark' ? M('iron', 0x4b5058) : spec.trim && spec.trim.kind ? M(spec.trim.kind, spec.trim.col, spec.trim.o || {}) : G;
  const hd = spec.handle || ['wood', 0x8a5a30], H = M(hd[0], hd[1], hd[2] || {});
  const A = tn >= 2 ? M('gem', ACC[tier], { ei: tier === 'mythic' ? 1.1 : 1.4, pulse: tier === 'mythic' ? 0.9 : tier === 'legendary' ? 0.35 : 0, speed: tier === 'mythic' ? 2.6 : 1.5 }) : null;
  return { S, T, H, G, A, tier, tn, spec };
}
const OCT = memo('oct', () => new THREE.OctahedronGeometry(1, 0));
function glyph(b, mat, x, y, z, side, r, s) {
  const n = 2 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) {
    const t = Math.floor(r() * 5), ox = (r() - 0.5) * s, oy = (r() - 0.5) * s * 1.4;
    if (t === 0) b.add(mat, BOXG(0.01, s * 1.3, 0.006), x + ox, y + oy, z, 0, 0, 0);
    else if (t === 1) b.add(mat, BOXG(s, 0.01, 0.006), x + ox, y + oy, z, 0, 0, 0);
    else if (t === 4) b.add(mat, SP(0.011, 6, 4), x + ox, y + oy, z + side * 0.002);
    else b.add(mat, BOXG(s * 1.1, 0.01, 0.006), x + ox, y + oy, z, 0, 0, t === 2 ? 0.8 : -0.8);
  }
}
function accents(b, c) {
  if (c.tn < 2) return;
  if (!b.ownGem && b.gem) { const [x, y, z, s] = b.gem; b.add(c.A, OCT, x, y, z, 0, 0, 0, s * 1.0, s * 1.4, s * 1.0); }
  const sp = b.spine, r = rng(hash(b.key + 'acc'));
  if (c.tn >= 3) b.glowCol = ACC[c.tier];
  if (c.tn === 3 && sp) {   // mythic: pulsing purple runes in a column on both faces
    const n = Math.max(3, Math.min(8, Math.floor((sp.y1 - sp.y0) / 0.1)));
    for (let i = 0; i < n; i++) { const y = sp.y0 + (i + 0.5) * (sp.y1 - sp.y0) / n; for (const side of sp.one ? [1] : [1, -1]) glyph(b, c.A, sp.x || 0, y, side * (sp.rz + 0.002), side, r, sp.gs * 1.25 || 0.035); }
  }
  if (c.tn === 4 && sp) {   // legendary: gold filigree vine with curls, glowing like embers
    for (const side of sp.one ? [1] : [1, -1]) {
      const pts = [], N = 14, ph = side > 0 ? 0 : PI;
      for (let i = 0; i <= N; i++) { const t = i / N, y = sp.y0 + t * (sp.y1 - sp.y0); if (sp.kind === 'shaft') { const a = t * TAU * 3 + ph, rr = sp.rz + 0.007; pts.push([(sp.x || 0) + Math.cos(a) * rr, y, Math.sin(a) * rr]); } else pts.push([(sp.x || 0) + Math.sin(t * TAU * 2 + ph) * sp.rx * 0.5, y, side * (sp.rz + 0.005)]); }
      b.add(c.G, sweep(pts, 0.0065, 6, 28)); b.add(c.G, SP(0.011, 8, 6), pts[N][0], pts[N][1], pts[N][2]); b.add(c.G, SP(0.011, 8, 6), pts[0][0], pts[0][1], pts[0][2]);
    }
  }
  if (c.tn === 5) b.sparks = true;
}
const finishItem = (b, c, height) => { accents(b, c); return b.finish(height, c.tier); };

// ---------- weapon parts ----------
function bladeShape(L, W, o = {}) {
  const tl = L * (o.tip ?? 0.2), bl = L - tl, N = 10, cx = y => (o.curve || 0) * (y / L) ** 2, half = y => W / 2 * (1 - (1 - (o.taper ?? 0.85)) * (y / bl));
  const rr = rng(hash('bs' + L + W)), R = [], Lf = [];
  for (let i = 0; i <= N; i++) { const y = bl * i / N; R.push([half(y) + cx(y) - (o.notch && i > 1 && rr() < 0.35 ? rr() * 0.014 : 0) + (o.serr && i > 1 && (i & 1) ? 0.016 : 0), y]); Lf.push([-half(y) + cx(y) + (o.notch && i > 1 && rr() < 0.35 ? rr() * 0.014 : 0), y]); }
  return polyShape([...R, [cx(L) + (o.hook || 0), L], ...Lf.reverse()]);
}
function guardBar(b, mat, gw, kind, y = 0, th = 0.016) {
  const pts = kind === 'swept' ? [[-gw, y - 0.045, 0], [-gw * 0.55, y - 0.01, 0], [0, y + 0.012, 0], [gw * 0.55, y - 0.01, 0], [gw, y - 0.045, 0]]
    : kind === 'wing' ? [[-gw, y + 0.075, 0], [-gw * 0.8, y - 0.012, 0], [0, y + 0.012, 0], [gw * 0.8, y - 0.012, 0], [gw, y + 0.075, 0]]
    : [[-gw, y, 0], [-gw / 2, y, 0], [0, y, 0], [gw / 2, y, 0], [gw, y, 0]];
  b.add(mat, sweep(pts, t => th * (0.62 + 0.55 * Math.sin(PI * t)), 8, 22));
  for (const p of [pts[0], pts[4]]) b.add(mat, SP(th * 0.95, 10, 8), p[0], p[1], p[2]);
  b.add(mat, rbox(0.06, 0.05, 0.05, 0.01), 0, y, 0);
}
function gripPart(b, mat, y0, y1, r, rings, ringMat) {
  b.add(mat, lathe([0, y0, r * 0.82, y0, r * 1.08, y0 + 0.02, r * 0.92, (y0 + y1) * 0.5, r * 1.08, y1 - 0.02, r * 0.86, y1, 0, y1], 14));
  for (let i = 0; i < rings; i++) b.add(ringMat || mat, TOR(r * 1.02, r * 0.17, 5, 14), 0, y0 + 0.03 + (i + 0.5) * (y1 - y0 - 0.06) / rings, 0, PI / 2);
}
function pommel(b, mat, kind, y, r = 0.035) {
  if (kind === 'disc') b.add(mat, lathe([0, y - r * 0.5, r * 0.9, y - r * 0.35, r * 1.3, y, r * 0.9, y + r * 0.45, 0, y + r * 0.55], 16));
  else if (kind === 'spike') { b.add(mat, SP(r * 0.9, 10, 8), 0, y, 0); b.add(mat, CONE(r * 0.5, r * 2.2, 6), 0, y - r * 3, 0, PI); }
  else b.add(mat, SP(r, 12, 10), 0, y, 0, 0, 0, 0, 1, 1.1, 1);
}

// ---------- weapon families (each is shared by several items; items vary through parameters) ----------
const WF = {
  sword(b, c, p) {   // also dagger / knife: lens-section bevelled blade with a ridge, guard, wrapped grip, pommel
    const { S, T, H } = c, L = p.len, W = p.w, gl = p.grip ?? 0.26;
    b.add(S, ext(bladeShape(L, W, p), 0.003, 0.017, 0.007, 3));
    b.add(S, ext(polyShape([[-0.007, 0.03], [0.007, 0.03], [0.004, L * (p.ridge ?? 0.82)], [-0.004, L * (p.ridge ?? 0.82)]]), 0.002, 0.022, 0.003, 2));
    if (p.guard !== 'none') guardBar(b, T, p.gw ?? 0.12, p.guard || 'bar', 0, p.gth ?? 0.016); else b.add(T, TOR(W * 0.4, 0.008, 6, 12), 0, 0.005, 0, PI / 2, 0, 0, 1, 1, 0.6);
    gripPart(b, H, -gl, -0.012, p.gr ?? 0.019, p.rings ?? 6, p.ringMat);
    pommel(b, T, p.pommel || 'ball', -gl - 0.02, p.pr ?? 0.036);
    b.gem = [0, 0.045, 0.026, 0.018]; b.spine = { y0: L * 0.2, y1: L * 0.72, rx: W / 2, rz: 0.019 };
  },
  club(b, c, p) {
    const { S, T, H } = c, L = p.len;
    if (p.branch) {   // gnarled stick
      const pts = []; for (let i = 0; i <= 8; i++) pts.push([Math.sin(i * 0.9) * 0.018, i / 8 * L, Math.cos(i * 1.3) * 0.014]);
      b.add(H, sweep(pts, t => 0.027 + 0.005 * Math.sin(t * 9) + 0.008 * (1 - t), 8, 32));
      for (const [t, a, l] of [[0.35, 0.8, 0.12], [0.62, 3.2, 0.1], [0.8, 5.2, 0.09]]) { const y = t * L; b.aim(H, CONE(0.014, l, 6), Math.cos(a) * 0.02, y, Math.sin(a) * 0.02, Math.cos(a) * 0.9, 0.5, Math.sin(a) * 0.9); }
      b.add(H, SP(0.03, 8, 6), 0, L, 0, 0, 0, 0, 1, 0.7, 1);
      b.spine = { y0: L * 0.25, y1: L * 0.8, rx: 0.02, rz: 0.022, kind: 'shaft', gs: 0.02 }; b.gem = [0.015, L * 0.9, 0.02, 0.014]; return;
    }
    const hr = p.headR ?? 0.1;
    b.add(H, lathe([0, 0, 0.026, 0, 0.03, 0.04, 0.026, 0.1, 0.034, L * 0.45, 0.05, L * 0.62, hr * 0.95, L * 0.78, hr * 1.1, L * 0.88, hr * 0.7, L * 0.98, 0, L], 18));
    if (p.nails) for (let i = 0; i < p.nails; i++) { const a = i * 2.4, y = L * (0.66 + 0.28 * ((i * 0.37) % 1)), rad = hr * (0.7 + 0.35 * Math.sin((y / L - 0.6) * 5)); b.aim(S, CONE(0.012, 0.06, 5), Math.cos(a) * rad * 0.9, y, Math.sin(a) * rad * 0.9, Math.cos(a), 0.15, Math.sin(a)); }
    if (p.bind) for (let i = 0; i < 5; i++) b.add(T, TOR(0.052 + i * 0.001, 0.007, 5, 14), 0, L * 0.5 + i * 0.022, 0, PI / 2);
    b.add(T, TOR(0.028, 0.012, 6, 12), 0, 0.09, 0, PI / 2);
    b.spine = { y0: L * 0.2, y1: L * 0.62, rx: 0.03, rz: 0.034, kind: 'shaft', gs: 0.022 }; b.gem = [0, L * 0.7, hr * 0.98, 0.022];
  },
  mace(b, c, p) {
    const { S, T, H } = c, L = p.len;
    gripPart(b, H, 0, L * 0.7, 0.024, 7); b.add(H, lathe([0, L * 0.65, 0.026, L * 0.65, 0.03, L * 0.78, 0, L * 0.78], 12));
    b.add(T, TOR(0.03, 0.012, 6, 14), 0, 0.01, 0, PI / 2); pommel(b, T, 'ball', -0.02, 0.03);
    const hy = L * 0.88, r = p.headR ?? 0.09;
    b.add(S, lathe([0, hy - r * 1.1, r * 0.45, hy - r * 1.05, r * 0.95, hy - r * 0.5, r * 1.08, hy, r * 0.95, hy + r * 0.5, r * 0.45, hy + r * 1.05, 0, hy + r * 1.1], 20));
    b.add(T, TOR(r * 1.04, 0.012, 6, 20), 0, hy, 0, PI / 2);
    const n = p.spikes ?? 8;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; b.aim(S, CONE(0.026, 0.085, 5), Math.cos(a) * r * 1.0, hy, Math.sin(a) * r * 1.0, Math.cos(a), 0, Math.sin(a)); }
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.3; b.aim(S, CONE(0.024, 0.075, 5), Math.cos(a) * r * 0.7, hy + r * 0.72, Math.sin(a) * r * 0.7, Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7); b.aim(S, CONE(0.024, 0.075, 5), Math.cos(a) * r * 0.7, hy - r * 0.72, Math.sin(a) * r * 0.7, Math.cos(a) * 0.7, -1, Math.sin(a) * 0.7); }
    b.aim(S, CONE(0.03, 0.1, 6), 0, hy + r * 1.0, 0, 0, 1, 0);
    b.spine = { y0: L * 0.1, y1: L * 0.6, rx: 0.025, rz: 0.026, kind: 'shaft', gs: 0.02 }; b.gem = [0, hy, r * 1.12, 0.022];
  },
  axe(b, c, p) {
    const { S, T, H } = c, L = p.haft, s = p.size, ty = L * 0.82;
    gripPart(b, H, 0, L, 0.025, p.rings ?? 0); pommel(b, T, 'ball', -0.012, 0.03);
    b.add(T, TOR(0.03, 0.01, 6, 14), 0, L * 0.5, 0, PI / 2);
    const out = [[0.03, -0.1 * s], [0.1, -0.16 * s], ...bez([0.1, -0.16 * s], [0.18 * s + 0.05, -0.3 * s], [0.3 * s + 0.06, -0.52 * s], 6), ...bez([0.3 * s + 0.06, -0.52 * s], [0.68 * s + 0.05, 0], [0.3 * s + 0.06, 0.52 * s], 12), ...bez([0.3 * s + 0.06, 0.52 * s], [0.18 * s + 0.05, 0.3 * s], [0.1, 0.16 * s], 6), [0.03, 0.1 * s]];
    b.add(S, ext(polyShape(out), 0.012, 0.014, 0.008, 2), 0, ty, 0);
    const EG = M('steel', 0xeef2f6, { rough: 0.2 }), ed = bez([0.3 * s + 0.06, -0.52 * s], [0.68 * s + 0.05, 0], [0.3 * s + 0.06, 0.52 * s], 12), ei = bez([0.3 * s + 0.06, 0.52 * s], [0.36 * s + 0.05, 0], [0.3 * s + 0.06, -0.52 * s], 12);
    const edgePts = [[0.3 * s + 0.06, -0.52 * s], ...ed, ...ei];   // polished bevel along the cutting edge: worn light steel against the darker head
    b.add(EG, ext(polyShape(edgePts), 0.03, 0.015, 0.006, 2), 0, ty, 0);
    if (p.double) { b.add(S, ext(polyShape(mirrorPts(out)), 0.012, 0.014, 0.008, 2), 0, ty, 0); b.add(EG, ext(polyShape(mirrorPts(edgePts)), 0.03, 0.015, 0.006, 2), 0, ty, 0); }
    else { b.add(S, rbox(0.075, 0.3 * s, 0.055, 0.012), -0.01, ty, 0); b.aim(S, CONE(0.03, 0.08 + 0.05 * s, 5), -0.04, ty, 0, -1, 0, 0); }
    b.add(S, rbox(0.08, 0.2 * s + 0.04, 0.06, 0.012), 0, ty, 0);
    b.aim(T, CONE(0.026, 0.1, 6), 0, ty + 0.1 * s + 0.02, 0, 0, 1, 0); b.add(T, TOR(0.034, 0.008, 6, 12), 0, ty + 0.1 * s + 0.01, 0, PI / 2);
    b.spine = { y0: L * 0.05, y1: ty - 0.1 * s - 0.04, rx: 0.025, rz: 0.026, kind: 'shaft', gs: 0.02 }; b.gem = [0.0, ty, 0.034, 0.02];
  },
  spear(b, c, p) {
    const { S, T, H } = c, L = p.shaft, hl = p.head;
    if (p.wood) {   // sharpened stick: fire-hardened tip
      const pts = []; for (let i = 0; i <= 6; i++) pts.push([Math.sin(i) * 0.008, i / 6 * L, Math.cos(i * 1.3) * 0.006]);
      b.add(H, sweep(pts, t => t > 0.85 ? 0.021 * (1 - (t - 0.85) / 0.15) + 0.002 : 0.021, 8, 30)); b.add(S, CONE(0.014, 0.1, 6), 0, L - 0.08, 0);
      b.spine = { y0: L * 0.2, y1: L * 0.8, rx: 0.02, rz: 0.022, kind: 'shaft' }; b.gem = [0, L * 0.88, 0.02, 0.014]; return;
    }
    b.add(H, lathe([0, 0, 0.018, 0, 0.022, 0.02, 0.02, L * 0.5, 0.022, L, 0, L], 12));
    b.aim(S, CONE(0.02, 0.1, 6), 0, 0, 0, 0, -1, 0); b.add(T, TOR(0.022, 0.008, 6, 12), 0, 0.03, 0, PI / 2);
    b.add(T, lathe([0, L - 0.03, 0.034, L - 0.03, 0.03, L + 0.03, 0.022, L + 0.06, 0, L + 0.06], 12));
    const w = p.hw ?? 0.075, pts = [[-0.02, 0], [-w, 0.1 * hl], [-w * 1.05, 0.38 * hl], [0, hl], [w * 1.05, 0.38 * hl], [w, 0.1 * hl], [0.02, 0]];
    b.add(S, ext(polyShape(pts), 0.004, 0.016, 0.006, 3), 0, L + 0.04, 0);
    b.add(S, ext(polyShape([[-0.006, 0.02], [0.006, 0.02], [0.003, hl * 0.8], [-0.003, hl * 0.8]]), 0.002, 0.02, 0.003, 2), 0, L + 0.04, 0);
    if (p.fangs) for (const sd of [-1, 1]) b.add(S, sweep([[sd * 0.02, L + 0.03, 0], [sd * 0.1, L + 0.0, 0], [sd * 0.14, L - 0.1, 0], [sd * 0.13, L - 0.2, 0]], t => 0.022 * (1 - t) + 0.002, 7, 14));
    if (p.tassel) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.aim(T, CONE(0.012, 0.12, 5), Math.cos(a) * 0.03, L - 0.04, Math.sin(a) * 0.03, Math.cos(a) * 0.5, -1, Math.sin(a) * 0.5); }
    b.spine = { y0: L * 0.15, y1: L - 0.1, rx: 0.02, rz: 0.022, kind: 'shaft', gs: 0.02 }; b.gem = [0, L + 0.01, 0.036, 0.02];
  },
  bow(b, c, p) {
    const { S, T, H } = c, L = p.len, k = p.curve, N = 14, pts = [];
    for (let i = 0; i <= N; i++) { const t = i / N * 2 - 1; pts.push([k * t * t + (p.recurve || 0) * Math.pow(Math.abs(t), 7), t * L / 2, 0]); }
    b.add(H, sweep(pts, t => 0.021 + 0.03 * Math.pow(Math.sin(PI * t), 0.7), 8, 40));
    b.add(S, SP(0.013, 8, 6), pts[N][0], L / 2, 0); b.add(S, SP(0.013, 8, 6), pts[0][0], -L / 2, 0);
    b.add(T, sweep([[pts[N][0], L / 2, 0], [pts[N][0], 0, 0], [pts[0][0], -L / 2, 0]], 0.0065, 4, 12));
    gripPart(b, p.gripMat || H, -0.1, 0.1, 0.02, 0); b.add(T, rbox(0.035, 0.07, 0.035, 0.008), 0.0, 0.1, 0);
    if (p.wrap) for (let i = 0; i < 6; i++) b.add(T, TOR(0.026, 0.005, 4, 12), 0, -0.1 + i * 0.033, 0, PI / 2);
    b.spine = { x: 0, y0: L * 0.1, y1: L * 0.36, rx: 0.02, rz: 0.028, kind: 'shaft', gs: 0.02, one: false }; b.gem = [0, 0.14, 0.03, 0.016];
  },
  crossbow(b, c, p) {
    const { S, T, H } = c, L = p.len;
    b.add(H, ext(polyShape([[-0.03, -L / 2], [0.03, -L / 2], [0.045, -L * 0.1], [0.04, L / 2 - 0.03], [0.02, L / 2], [-0.02, L / 2], [-0.04, L / 2 - 0.03], [-0.045, -L * 0.1]]), 0.04, 0.012, 0.008, 2));
    const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 5 - 1; pts.push([t * p.span, L / 2 - 0.05 + 0.1 * t * t * (1 - p.bend), 0]); }
    b.add(S, sweep(pts, t => 0.019 + 0.022 * Math.sin(PI * t) ** 0.7, 8, 30)); b.add(T, SP(0.014, 8, 6), pts[0][0], pts[0][1], 0); b.add(T, SP(0.014, 8, 6), pts[10][0], pts[10][1], 0);
    b.add(T, sweep([[pts[0][0], pts[0][1], 0], [0, L / 2 - 0.34, 0.025], [pts[10][0], pts[10][1], 0]], 0.0035, 4, 12));
    b.add(S, TOR(0.045, 0.01, 6, 14), 0, L / 2 - 0.02, 0.0, 0, 0, 0, 1, 1.3, 1);
    b.add(H, CYL(0.007, 0.007, L * 0.72, 6), 0, -L * 0.2, 0.03); b.aim(S, CONE(0.016, 0.07, 4), 0, -L * 0.2 + L * 0.72, 0.03, 0, 1, 0);
    b.add(T, rbox(0.07, 0.05, 0.07, 0.01), 0, -L * 0.1, 0.01); b.add(S, rbox(0.012, 0.07, 0.02, 0.004), 0, -L * 0.22, -0.035);
    b.spine = { y0: -L * 0.4, y1: L * 0.1, rx: 0.03, rz: 0.04, kind: 'blade', gs: 0.022 }; b.gem = [0, L * 0.12, 0.045, 0.016];
  },
  flail(b, c, p) {
    const { S, T, H } = c, L = p.len;
    gripPart(b, H, 0, L, 0.024, 6); pommel(b, T, 'ball', -0.01, 0.034); b.add(T, TOR(0.03, 0.011, 6, 14), 0, L, 0, PI / 2);
    let x = 0, y = L + 0.05; const links = 6;
    for (let i = 0; i < links; i++) { const a = 0.55 - i * 0.04; b.add(S, TOR(0.026, 0.0075, 5, 12), x, y, 0, 0, (i & 1) * PI / 2, 0, 1, 1.35, 1); x += Math.sin(a + 0.5) * 0.04; y += Math.cos(a + 0.5) * 0.04; }
    const bx = x + 0.07, by = y + 0.04, r = p.ball ?? 0.095;
    b.add(S, blob(r, 0.04, 3, 1, 1, 1, 2.5, 18, 12), bx, by, 0);
    for (let i = 0; i < 14; i++) { const u = (i + 0.5) / 14, th = Math.acos(1 - 2 * u), ph = i * 2.4; const dx = Math.sin(th) * Math.cos(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.sin(ph); b.aim(S, CONE(0.024, 0.075, 5), bx + dx * r * 0.95, by + dy * r * 0.95, dz * r * 0.95, dx, dy, dz); }
    b.add(T, TOR(r * 0.55, 0.01, 6, 16), bx, by, 0, PI / 2);
    b.spine = { y0: L * 0.15, y1: L * 0.85, rx: 0.025, rz: 0.026, kind: 'shaft', gs: 0.02 }; b.gem = [bx, by, r * 1.0, 0.02];
  },
  halberd(b, c, p) {
    const { S, T, H } = c, L = p.len, s = p.size;
    gripPart(b, H, 0, L, 0.024, 0); b.aim(S, CONE(0.02, 0.09, 6), 0, 0, 0, 0, -1, 0); for (const y of [L * 0.15, L * 0.62]) b.add(T, TOR(0.028, 0.01, 6, 14), 0, y, 0, PI / 2);
    for (const y of [L - 0.2, L - 0.01]) b.add(T, lathe([0, y, 0.034, y, 0.03, y + 0.07, 0, y + 0.07], 12));
    b.add(S, ext(polyShape([[-0.02, 0], [-0.065, 0.06], [0, 0.34], [0.065, 0.06], [0.02, 0]]), 0.004, 0.016, 0.006, 3), 0, L + 0.04, 0);
    const ty = L - 0.18, out = [[0.03, -0.1 * s], [0.1, -0.16 * s], ...bez([0.1, -0.16 * s], [0.2 * s + 0.05, -0.3 * s], [0.34 * s + 0.06, -0.46 * s], 6), ...bez([0.34 * s + 0.06, -0.46 * s], [0.7 * s + 0.05, -0.05], [0.4 * s + 0.06, 0.5 * s], 12), ...bez([0.4 * s + 0.06, 0.5 * s], [0.2 * s + 0.05, 0.25 * s], [0.1, 0.16 * s], 6), [0.03, 0.1 * s]];
    b.add(S, ext(polyShape(out), 0.012, 0.014, 0.008, 2), 0, ty, 0); b.add(S, rbox(0.08, 0.2 * s + 0.04, 0.06, 0.012), 0, ty, 0);
    b.add(S, sweep([[-0.02, ty + 0.02, 0], [-0.1, ty + 0.1 * s + 0.02, 0], [-0.17, ty + 0.1 * s + 0.15, 0]], t => 0.028 * (1 - t) + 0.003, 6, 10));
    b.spine = { y0: L * 0.1, y1: L * 0.55, rx: 0.025, rz: 0.026, kind: 'shaft', gs: 0.02 }; b.gem = [0, ty, 0.034, 0.02];
  },
  hammer(b, c, p) {
    const { S, T, H } = c, L = p.len, hy = L + 0.04, hw = p.head;
    gripPart(b, H, 0, L, 0.026, 8); pommel(b, T, 'disc', -0.015, 0.04); b.add(T, TOR(0.031, 0.01, 6, 14), 0, L * 0.5, 0, PI / 2);
    b.add(S, rbox(hw, 0.2, 0.2, 0.03), 0, hy, 0);
    for (const sd of [-1, 1]) { b.add(T, rbox(0.035, 0.225, 0.225, 0.01), sd * (hw * 0.36), hy, 0); b.add(S, rbox(0.04, 0.17, 0.17, 0.012), sd * hw * 0.5, hy, 0); }
    b.add(T, TOR(0.05, 0.012, 6, 14), 0, L - 0.01, 0, PI / 2);
    b.aim(S, CONE(0.05, 0.16, 5), -hw * 0.5 - 0.02, hy, 0, -1, 0, 0); b.aim(S, CONE(0.04, 0.12, 5), 0, hy + 0.1, 0, 0, 1, 0);
    b.spine = { y0: L * 0.1, y1: L * 0.62, rx: 0.026, rz: 0.028, kind: 'shaft', gs: 0.02 }; b.gem = [0, hy, 0.105, 0.024];
  },
  staff(b, c, p) {
    const { S, T, H } = c, L = 1.5, pts = []; for (let i = 0; i <= 10; i++) pts.push([Math.sin(i * 0.8) * 0.02, i / 10 * L, Math.cos(i * 1.1) * 0.017]);
    b.add(H, sweep(pts, t => 0.027 - 0.006 * t + 0.003 * Math.sin(t * 22), 9, 44));
    for (const [t, a] of [[0.2, 0.8], [0.45, 3.0], [0.62, 5.2]]) b.add(H, blob(0.03, 0.2, t * 9, 1, 0.8, 1, 3, 10, 8), Math.cos(a) * 0.03, t * L, Math.sin(a) * 0.03);
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; b.add(H, sweep([[Math.cos(a) * 0.02, L - 0.02, Math.sin(a) * 0.02], [Math.cos(a) * 0.075, L + 0.06, Math.sin(a) * 0.075], [Math.cos(a) * 0.085, L + 0.17, Math.sin(a) * 0.085], [Math.cos(a) * 0.04, L + 0.27, Math.sin(a) * 0.04]], t => 0.02 * (1 - t) + 0.005, 6, 14)); }
    const gc = M('gem', p.gem ?? 0x66ddff, { ei: 1.6 }); b.add(gc, new THREE.IcosahedronGeometry(0.07, 0), 0, L + 0.12, 0, 0.3, 0.4, 0, 1, 1.5, 1); b.ownGem = true;
    b.add(T, TOR(0.03, 0.01, 6, 12), 0, L * 0.3, 0, PI / 2);
    b.spine = { y0: L * 0.12, y1: L * 0.8, rx: 0.025, rz: 0.028, kind: 'shaft', gs: 0.02 };
  },
  scepter(b, c, p) {
    const { G } = c, L = 1.0;
    b.add(G, lathe([0, 0, 0.02, 0, 0.026, 0.03, 0.02, 0.07, 0.022, L, 0, L], 14));
    for (const y of [0.25, 0.55, 0.78]) b.add(G, lathe([0, y - 0.025, 0.028, y - 0.025, 0.04, y, 0.028, y + 0.025, 0, y + 0.025], 14));
    b.add(G, SP(0.04, 12, 8), 0, -0.02, 0); b.add(G, lathe([0, L - 0.03, 0.03, L - 0.03, 0.06, L + 0.02, 0.05, L + 0.07, 0.03, L + 0.1, 0, L + 0.1], 16));
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.add(G, sweep([[Math.cos(a) * 0.05, L + 0.07, Math.sin(a) * 0.05], [Math.cos(a) * 0.1, L + 0.14, Math.sin(a) * 0.1], [Math.cos(a) * 0.09, L + 0.24, Math.sin(a) * 0.09], [Math.cos(a) * 0.03, L + 0.29, Math.sin(a) * 0.03]], t => 0.014 * (1 - t) + 0.004, 6, 14)); }
    const rg = M('gem', 0xff2a4a, { ei: 1.4 }); b.add(rg, OCT, 0, L + 0.17, 0, 0, 0.3, 0, 0.07, 0.1, 0.07); b.ownGem = true;
    b.spine = { y0: L * 0.1, y1: L * 0.8, rx: 0.025, rz: 0.028, kind: 'shaft', gs: 0.02 };
  },
};

// ---------- armour: a draped/plated torso on a small wooden display stand ----------
const SX = 1.3, SZ = 0.78;   // torso is a lathe squashed into an ellipse
function torsoProfile(p = {}) {
  const hemY = p.hemY ?? 0.44, hemR = p.hemR ?? 0.31, waistR = p.waistR ?? 0.255, chestR = p.chestR ?? 0.285, shR = p.shR ?? 0.25, wy = p.waistY ?? 0.66;
  return [hemR, hemY, hemR * 0.6 + waistR * 0.4, hemY + (wy - hemY) * 0.4, waistR, wy, chestR, 0.88, shR, 1.0, 0.17, 1.065, 0.088, 1.1, 0.078, 1.06];
}
function torsoGeo(p, ragAmp = 0, teeth = 9, seg = 30) {
  const g = lathe(torsoProfile(p), seg), hemY = p.hemY ?? 0.44;
  if (ragAmp) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < hemY + 0.15) { const a = Math.atan2(pos.getX(i), pos.getZ(i)), k = 1 - (y - hemY) / 0.15, saw = Math.abs(Math.sin(a * teeth * 0.5 + 0.7)) * 0.7 + 0.3 * Math.abs(Math.sin(a * 2.3)); pos.setY(i, y - ragAmp * saw * Math.max(0, k) * (y < hemY + 0.001 ? 1 : 0.6)); } }
    g.computeVertexNormals();
  }
  return g;
}
const frontZ = (r) => r * SZ;
function stand(b, c) {
  const { H } = c, wd = H;
  b.add(wd, lathe([0, 0, 0.25, 0, 0.265, 0.018, 0.25, 0.045, 0.06, 0.07, 0.03, 0.1, 0, 0.1], 28));
  b.add(wd, CYL(0.02, 0.02, 1.0, 10), 0, 0.06, 0); b.add(wd, SP(0.075, 14, 10), 0, 1.2, 0, 0, 0, 0, 1, 1.15, 1);
  b.add(wd, sweep([[-0.36, 1.0, 0], [0, 1.03, 0], [0.36, 1.0, 0]], 0.017, 7, 10)); for (const s of [-1, 1]) b.add(wd, SP(0.026, 8, 6), s * 0.36, 1.0, 0);
}
function sleeve(b, mat, s, len, r0, r1, down = 0.85) {   // tapered tube from the shoulder, out and down
  const dx = s * 0.55, dy = -down, n = Math.hypot(dx, dy), ux = dx / n, uy = dy / n, x0 = s * 0.255, y0 = 1.0;
  b.add(mat, sweep([[x0, y0, 0], [x0 + ux * len * 0.5, y0 + uy * len * 0.5 + 0.015, 0], [x0 + ux * len, y0 + uy * len, 0]], t => r0 + (r1 - r0) * t, 10, 10));
  return [x0 + ux * len, y0 + uy * len];
}
function belt(b, mat, buckle, y = 0.66, rad = 0.262, th = 0.026) { b.add(mat, TOR(rad, th, 6, 30), 0, y, 0, PI / 2, 0, 0, SX * 0.99, SZ * 1.0, 0.7); if (buckle) b.add(buckle, rbox(0.075, 0.07, 0.03, 0.008), 0, y, rad * SZ + 0.01); }
function studs(b, mat, rows, cols, y0, y1, rad, r = 0.011, a0 = -1.1, a1 = 1.1) {
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const a = a0 + (a1 - a0) * (cols > 1 ? i / (cols - 1) : 0.5) + (j & 1 ? 0.5 * (a1 - a0) / cols : 0), y = y0 + (y1 - y0) * (rows > 1 ? j / (rows - 1) : 0.5), rr = rad(y); b.add(mat, SP(r, 6, 5), Math.sin(a) * rr * SX, y, Math.cos(a) * rr * SZ); }
}
const radAt = p => y => { const pr = torsoProfile(p); for (let i = 0; i < pr.length - 2; i += 2) if (y <= pr[i + 3]) { const t = (y - pr[i + 1]) / (pr[i + 3] - pr[i + 1]); return pr[i] + (pr[i + 2] - pr[i]) * Math.max(0, Math.min(1, t)); } return 0.2; };
function chestSpine(b, y0 = 0.74, y1 = 0.97, gs = 0.03) { const z = radAt({})(0.85) * SZ + 0.006; b.spine = { x: 0, y0, y1, rx: 0.11, rz: z, kind: 'blade', one: true, gs }; b.gem = [0, 0.93, z + 0.012, 0.032]; }

const AF = {
  cloth(b, c, p) {
    const { MAIN, T, G } = c; stand(b, c);
    b.add(MAIN, torsoGeo(p.prof || {}, p.rag ?? 0.04, p.teeth ?? 9), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    if (p.kind !== 'sack' && p.sleeve !== 0) { sleeve(b, MAIN, 1, p.sleeve ?? 0.26, p.sr ?? 0.09, 0.075); sleeve(b, MAIN, -1, p.sleeve ?? 0.26, p.sr ?? 0.09, 0.075); }
    else if (p.sleeve !== 0) for (const s of [-1, 1]) b.add(MAIN, TOR(0.09, 0.025, 6, 14), s * 0.33, 0.99, 0, 0, PI / 2 + s * 0.3, 0);
    if (p.padded) { b.add(MAIN, TOR(0.12, 0.05, 8, 18), 0, 1.07, 0, PI / 2, 0, 0, 1.2, 0.85, 1); }
    if (p.belt) belt(b, T, p.buckle ? G : null);
    if (p.patches) for (let i = 0; i < p.patches; i++) { const y = 0.6 + (i * 0.37 % 0.3), a = -0.8 + i * 0.7, r = radAt(p.prof || {})(y); b.add(T, rbox(0.1 + 0.02 * (i & 1), 0.085, 0.012, 0.004), Math.sin(a) * r * SX, y, Math.cos(a) * r * SZ + 0.004, 0, a * 0.9, (i - 1) * 0.08); }
    if (p.strips) for (let i = 0; i < p.strips; i++) b.add(T, TOR(0.27 + i * 0.012, 0.016, 5, 28), 0, 0.6 + i * 0.1, 0, PI / 2 + 0.12 * (i & 1 ? 1 : -1), 0, 0, SX, SZ, 1);
    if (p.leaves) for (let row = 0; row < 3; row++) for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + row * 0.3, y = 0.98 - row * 0.2, r = radAt({})(y); b.aim(T, SP(1, 6, 5), Math.sin(a) * r * SX * 1.02, y, Math.cos(a) * r * SZ * 1.05, Math.sin(a) * 0.8, -0.7, Math.cos(a) * 0.5, 0.05, 0.1, 0.012); }
    chestSpine(b);
  },
  leather(b, c, p) {
    const { MAIN, T, G } = c; stand(b, c);
    const prof = p.prof || { hemY: 0.5, hemR: 0.285 };
    if (p.kind === 'boiled') {   // lamellar bands
      for (let i = 0; i < 6; i++) { const y0 = 0.5 + i * 0.1, r0 = radAt(prof)(y0), r1 = radAt(prof)(y0 + 0.12); b.add(MAIN, lathe([r0 * 0.97, y0 - 0.0, r0 * 1.04, y0 + 0.015, r1 * 1.045, y0 + 0.1, r1 * 0.98, y0 + 0.125], 28), 0, 0, 0, 0, PI, 0, SX, 1, SZ); }
      b.add(MAIN, lathe([0.255, 1.0, 0.17, 1.065, 0.088, 1.1, 0.078, 1.06], 28), 0, 0, 0, 0, PI, 0, SX, 1, SZ); sleeve(b, MAIN, 1, 0.22, 0.09, 0.08); sleeve(b, MAIN, -1, 0.22, 0.09, 0.08);
      studs(b, T, 2, 7, 0.62, 0.9, radAt(prof), 0.01);
    } else if (p.kind === 'scraps') {   // patchwork pieces laced on
      b.add(MAIN, torsoGeo(prof, 0.05, 7), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
      const r = rng(7); for (let i = 0; i < 9; i++) { const a = -1.2 + i * 0.3, y = 0.62 + r() * 0.36, rr = radAt(prof)(y); b.add(T, rbox(0.1 + r() * 0.06, 0.09 + r() * 0.05, 0.014, 0.005), Math.sin(a) * rr * SX, y, Math.cos(a) * rr * SZ + 0.006, 0, a * 0.85, (r() - 0.5) * 0.5); }
      for (const s of [-1, 1]) b.add(MAIN, TOR(0.07, 0.03, 6, 12), s * 0.31, 1.0, 0, 0, PI / 2 + s * 0.4, 0);
    } else {
      b.add(MAIN, torsoGeo(prof, p.kind === 'jerkin' ? 0.02 : 0.03, 11), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
      if (p.kind !== 'vest') { sleeve(b, MAIN, 1, 0.3, 0.095, 0.075); sleeve(b, MAIN, -1, 0.3, 0.095, 0.075); }
      if (p.kind === 'jerkin') b.add(T, TOR(0.15, 0.045, 7, 20), 0, 1.07, 0, PI / 2, 0, 0, 1.45, 1.0, 0.85);   // fur collar
      if (p.kind === 'vest') studs(b, T, 3, 6, 0.64, 0.92, radAt(prof), 0.012);
      if (p.kind === 'bark') for (let i = 0; i < 5; i++) b.add(T, TOR(0.27, 0.012, 5, 28), 0, 0.56 + i * 0.1, 0, PI / 2, 0, 0, SX, SZ, 1);
    }
    belt(b, (p.beltMat === 'main' ? MAIN : T), T === G ? G : null, 0.6, 0.27, 0.028);
    if (p.lace) { for (let i = 0; i < 4; i++) { const y = 0.7 + i * 0.07; b.add(T, sweep([[-0.05, y, radAt(prof)(y) * SZ + 0.008], [0.05, y + 0.06, radAt(prof)(y) * SZ + 0.008]], 0.005, 4, 2)); } }
    chestSpine(b);
  },
  mail(b, c, p) {
    const { MAIN, T, G, S } = c; stand(b, c);
    const prof = p.prof || { hemY: 0.38, hemR: 0.315 };
    b.add(MAIN, torsoGeo(prof, p.rag ?? 0.035, 14), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    sleeve(b, MAIN, 1, p.sleeve ?? 0.3, 0.1, 0.085); sleeve(b, MAIN, -1, p.sleeve ?? 0.3, 0.1, 0.085);
    b.add(MAIN, TOR(0.13, 0.04, 7, 20), 0, 1.07, 0, PI / 2, 0, 0, 1.3, 0.9, 1);   // coif collar
    belt(b, (p.beltMat === 'main' ? MAIN : T), null, 0.6, 0.275, 0.026);
    if (p.studs) studs(b, T, 3, 8, 0.66, 0.96, radAt(prof), 0.012);
    if (p.shoulder) for (const s of [-1, 1]) { b.add(p.sh === 'T' ? T : MAIN, SP(1, 14, 8), s * 0.3, 1.02, 0, 0, 0, 0, 0.11, 0.06, 0.1); if (p.spikes) b.aim(p.tsp ? T : S, CONE(0.03, 0.14, 6), s * 0.33, 1.06, 0, s * 0.6, 1, 0); }
    if (p.fins) for (let i = 0; i < 5; i++) b.aim(T, CONE(0.025, 0.1 + 0.02 * (i % 2), 5), 0, 1.02 - i * 0.0, -0.17 + 0, 0, 0.6, -1, 0.9, 0.9 + (i % 2) * 0.4, 0.9);
    chestSpine(b);
  },
  harness(b, c, p) {
    const { MAIN, S, T, G, H: HH } = c; stand(b, c);
    const prof = { hemY: 0.52, hemR: 0.29 };
    b.add(MAIN, torsoGeo(prof, 0.03, 9), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    for (const s of [-1, 1]) {   // crossed leather straps, front and back
      for (const zz of [1, -1]) b.add(MAIN, sweep([[s * 0.2, 1.04, zz * 0.205], [0.0, 0.84, zz * 0.225], [-s * 0.19, 0.6, zz * 0.21]], 0.026, 7, 14));
      b.add(S, SP(1, 14, 8), s * 0.3, 1.04, 0, 0, 0, 0, 0.14, 0.075, 0.13);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; b.aim(S, CONE(0.03, 0.12, 5), s * 0.3 + Math.cos(a) * 0.07, 1.06, Math.sin(a) * 0.07, Math.cos(a) * 0.5 + s * 0.3, 1, Math.sin(a) * 0.5); }
      b.aim(S, CONE(0.036, 0.18, 6), s * 0.3, 1.09, 0, s * 0.4, 1, 0);
    }
    b.add(S, TOR(0.045, 0.014, 6, 14), 0, 0.84, 0.235, 0, 0, 0); belt(b, MAIN, null, 0.58, 0.27, 0.034);
    studs(b, S, 2, 8, 0.52, 0.64, radAt(prof), 0.012, -1.3, 1.3);
    chestSpine(b);
  },
  plate(b, c, p) {
    const { MAIN, T, G, S } = c; stand(b, c);
    const prof = { hemY: 0.54, hemR: 0.27, waistR: 0.235, chestR: 0.3, shR: 0.26, waistY: 0.68 }, pr = radAt(prof);
    b.add(MAIN, lathe([0.27, 0.54, 0.255, 0.62, 0.235, 0.68, 0.3, 0.88, 0.26, 1.0, 0.17, 1.065, 0.088, 1.1, 0.078, 1.06], 32), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    // breastplate ridge down the middle
    b.add(MAIN, sweep([[0, 0.6, 0.235 * SZ], [0, 0.8, 0.29 * SZ + 0.012], [0, 0.98, 0.25 * SZ + 0.008]], t => 0.022 * Math.sin(PI * t) + 0.006, 8, 12));
    // fauld: overlapping skirt rings
    for (let i = 0; i < (p.skirt ?? 2); i++) b.add(MAIN, lathe([0.27 + i * 0.035, 0.54 - i * 0.075, 0.28 + i * 0.035, 0.56 - i * 0.075, 0.26 + i * 0.03, 0.62 - i * 0.075, 0.25, 0.64 - i * 0.075], 32), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    if (p.bands) for (let i = 0; i < p.bands; i++) { b.add(T, TOR(pr(0.66 + i * 0.065) + 0.004, 0.011, 5, 32), 0, 0.66 + i * 0.065, 0, PI / 2, 0, 0, SX, SZ, 1); }
    // gorget + pauldrons
    b.add(MAIN, lathe([0.13, 1.02, 0.15, 1.06, 0.12, 1.12, 0.095, 1.13], 22), 0, 0, 0, 0, 0, 0, 1.15, 1, 0.9);
    for (const s of [-1, 1]) {
      const px = s * 0.31, k = p.pauld ?? 1;
      for (let i = 0; i < (p.layers ?? 2); i++) b.add(MAIN, new THREE.SphereGeometry(1, 16, 9, 0, TAU, 0, PI * 0.55), px + s * i * 0.03, 1.02 - i * 0.055, 0, 0, 0, s * 0.35, 0.125 * k + i * 0.02, (0.085 - i * 0.008) * k, 0.12 * k + i * 0.02);
      b.add(G, TOR(0.12 * k, 0.01, 5, 20), px, 1.0, 0, PI / 2, 0, s * 0.35, 1, 0.92, 1);
      if (p.spikes) b.aim(MAIN, CONE(0.035 * k, 0.17 * k, 6), px + s * 0.02, 1.08, 0, s * 0.35, 1, 0);
    }
    b.add(G, TOR(0.255, 0.012, 5, 32), 0, 0.545, 0, PI / 2, 0, 0, SX, SZ, 1); b.add(G, TOR(0.12, 0.011, 5, 24), 0, 1.115, 0, PI / 2, 0, 0, 1.15, 0.92, 1);
    if (p.rivets) studs(b, G, 3, 9, 0.66, 0.96, pr, 0.011, -1.2, 1.2);
    if (p.cracks) {   // glowing red fissures (obsidian)
      const cm = M('plain', 0xff3a1a, { emissive: 0xff2a10, ei: 1.5, rough: 0.5 }), rr = rng(11);
      for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3, y0 = 0.62 + rr() * 0.12, pts = []; for (let k = 0; k < 4; k++) { const y = y0 + k * 0.08, aa = a + (rr() - 0.5) * 0.25, r = pr(y); pts.push([Math.sin(aa) * r * SX * 1.005, y, Math.cos(aa) * r * SZ * 1.012]); } b.add(cm, sweep(pts, 0.0065, 4, 6)); }
    }
    if (p.crest) b.add(G, ext(polyShape([[-0.03, 0], [0.03, 0], [0.045, 0.15], [0, 0.22], [-0.045, 0.15]]), 0.012, 0.01, 0.006, 2), 0, 1.22, 0);
    if (b.key === 'a:knight') { const zf = radAt({})(0.85) * SZ + 0.014; b.add(G, rbox(0.04, 0.22, 0.02, 0.006), 0, 0.82, zf); b.add(G, rbox(0.15, 0.04, 0.02, 0.006), 0, 0.89, zf); }   // knight: heraldic cross on the breastplate
    if (b.key === 'a:aegis') for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, zf = radAt({})(0.88) * SZ; b.aim(G, CONE(0.012, 0.1, 4), Math.sin(a) * 0.055, 0.88 + Math.cos(a) * 0.075, zf + 0.02, Math.sin(a), Math.cos(a), 0.15); }   // aegis: sunburst rays around the great gem
    chestSpine(b, 0.72, 0.96); if (p.bigGem) { b.add(c.A || M('gem', 0x4a8dff, {}), OCT, 0, 0.88, pr(0.88) * SZ + 0.02, 0, 0, 0, 0.04, 0.06, 0.03); }
  },
  robe(b, c, p) {
    const { MAIN, T, G } = c; stand(b, c);
    const prof = { hemY: 0.06, hemR: 0.4, waistR: 0.22, waistY: 0.62, chestR: 0.265, shR: 0.24 };
    b.add(MAIN, lathe([0.4, 0.06, 0.385, 0.18, 0.33, 0.36, 0.23, 0.6, 0.28, 0.88, 0.25, 1.0, 0.17, 1.065, 0.088, 1.1, 0.078, 1.06], 32), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    b.add(G, TOR(0.4, 0.014, 5, 36), 0, 0.065, 0, PI / 2, 0, 0, SX, SZ, 1); b.add(G, TOR(0.385, 0.01, 5, 36), 0, 0.13, 0, PI / 2, 0, 0, SX, SZ, 1);
    for (const s of [-1, 1]) {   // wide bell sleeves
      const x0 = s * 0.27, e = [x0 + s * 0.2, 0.6]; b.add(MAIN, lathe([0.07, 0, 0.1, 0.12, 0.17, 0.3, 0.2, 0.36], 20), x0, 1.0, 0, 0, 0, s * 2.45);
      b.add(G, TOR(0.2, 0.012, 5, 22), x0 + s * 0.25, 0.7, 0, PI / 2, 0, s * 2.45 + PI / 2 * 0);
    }
    belt(b, T, G, 0.62, 0.225, 0.034); b.add(T, ext(polyShape([[-0.03, 0], [0.03, 0], [0.05, -0.28], [0, -0.32], [-0.05, -0.28]]), 0.006, 0.006, 0.004, 1), 0.0, 0.6, 0.18);
    b.add(MAIN, TOR(0.17, 0.05, 7, 22), 0, 1.07, 0, PI / 2, 0, 0, 1.3, 0.9, 1);
    chestSpine(b, 0.7, 0.98);
  },
  royal(b, c, p) {
    const { MAIN, T, G } = c; stand(b, c);
    b.add(MAIN, lathe([0.33, 0.3, 0.3, 0.45, 0.255, 0.66, 0.285, 0.88, 0.25, 1.0, 0.17, 1.065, 0.088, 1.1, 0.078, 1.06], 32), 0, 0, 0, 0, PI, 0, SX, 1, SZ);
    // the cape hangs from both shoulders behind
    b.add(MAIN, ext(polyShape([[-0.4, 0], [0.4, 0], [0.5, -0.82], [0.2, -0.9], [-0.2, -0.9], [-0.5, -0.82]]), 0.012, 0.012, 0.01, 2), 0, 1.04, -0.24, -0.12, 0, 0);
    for (const s of [-1, 1]) sleeve(b, MAIN, s, 0.2, 0.1, 0.09);
    // ermine collar: a fat ring with the dark-tailed fur texture
    b.add(T, TOR(0.2, 0.065, 8, 26), 0, 1.04, 0, PI / 2, 0, 0, 1.45, 1.0, 0.95);
    b.add(T, rbox(0.1, 0.62, 0.02, 0.008), -0.0, 0.73, 0.222, 0, 0, 0);
    b.add(G, rbox(0.115, 0.04, 0.026, 0.008), 0, 0.3, 0.3 * SZ + 0.008); b.add(G, TOR(0.33, 0.012, 5, 34), 0, 0.31, 0, PI / 2, 0, 0, SX, SZ, 1);
    b.add(G, SP(0.036, 10, 8), 0, 1.0, 0.205); b.add(G, TOR(0.052, 0.01, 6, 14), 0, 1.0, 0.2);
    belt(b, G, null, 0.62, 0.26, 0.02);
    b.spine = { x: 0, y0: 0.5, y1: 0.8, rx: 0.07, rz: 0.235, kind: 'blade', one: true, gs: 0.03 }; b.gem = [0, 1.0, 0.24, 0.03];
  },
};

// ---------- per-item tables: [family, parameters, material spec, height in metres] ----------
const LEA = (c, o) => ({ kind: 'leather', col: c, o }), CLO = (c, o) => ({ kind: 'cloth', col: c, o });
const ROPE = { kind: 'plain', col: 0xcdbf9a, o: { rough: 0.95 } };
const WS = {
  'w:stick': ['club', { len: 1.1, branch: 1 }, { handle: ['bark', 0x8a6a45] }, 1.35],
  'w:roughclub': ['club', { len: 0.85, headR: 0.085, bind: 1 }, { handle: ['wood', 0x7a5230], trim: ROPE }, 1.25],
  'w:club': ['club', { len: 0.95, nails: 12 }, { handle: ['wood', 0x6f4a2a], iron: 1, steel: 0x9aa0a6 }, 1.35],
  'w:dagger': ['sword', { len: 0.3, w: 0.052, tip: 0.3, gw: 0.05, grip: 0.12, gr: 0.015, rings: 4, pr: 0.024, ridge: 0.7, gth: 0.011 }, { handle: ['leather', 0x5a3a26] }, 0.95],
  'w:stoneknife': ['sword', { len: 0.28, w: 0.075, tip: 0.45, guard: 'none', grip: 0.14, gr: 0.016, rings: 5, pr: 0.02, notch: 1, ridge: 0.6 }, { steel: 0x8d887c, iron: 1, handle: ['wood', 0x7a5230], trim: ROPE, ringMat: 0 }, 0.9],
  'w:shadowfang': ['sword', { len: 0.4, w: 0.07, tip: 0.3, curve: 0.09, guard: 'wing', gw: 0.06, grip: 0.13, gr: 0.015, rings: 4, pommel: 'spike', pr: 0.024, ridge: 0.8, gth: 0.011 }, { steel: 0x2a2736, keepTone: 1, trim: 'dark', handle: ['leather', 0x2b2030] }, 0.95],
  'w:sword': ['sword', { len: 0.75, w: 0.095, notch: 1, gw: 0.12, pommel: 'ball' }, { steel: 0x9b8e83, iron: 1, rough: 0.7, handle: ['leather', 0x5b3b24] }, 1.5],
  'w:ironsword': ['sword', { len: 0.82, w: 0.09, guard: 'swept', gw: 0.14, pommel: 'disc' }, { steel: 0xc2c9d0, handle: ['leather', 0x2f3a52] }, 1.55],
  'w:claymore': ['sword', { len: 1.15, w: 0.115, guard: 'swept', gw: 0.22, grip: 0.38, pommel: 'disc', pr: 0.045, ridge: 0.85 }, { steel: 0xcfd6dc, handle: ['leather', 0x3a2a20] }, 1.85],
  'w:slayer': ['sword', { len: 0.95, w: 0.13, serr: 1, guard: 'wing', gw: 0.2, grip: 0.3, pommel: 'spike', pr: 0.04 }, { steel: 0x3a4148, keepTone: 1, handle: ['leather', 0x7a1020] }, 1.7],
  'w:handaxe': ['axe', { haft: 0.7, size: 0.55 }, { iron: 1, steel: 0x8f959b, handle: ['wood', 0x7a5230] }, 1.2],
  'w:axe': ['axe', { haft: 1.0, size: 0.8, double: 1 }, { steel: 0xaab2ba, handle: ['wood', 0x6a4426] }, 1.6],
  'w:executioner': ['axe', { haft: 1.15, size: 1.15, rings: 6 }, { steel: 0x4d525a, keepTone: 1, handle: ['wood', 0x2f2018] }, 1.75],
  'w:spear': ['spear', { shaft: 1.6, head: 0.3 }, { steel: 0xaab2ba, handle: ['wood', 0x8a5a30] }, 1.9],
  'w:wyrmspear': ['spear', { shaft: 1.9, head: 0.48, hw: 0.07, fangs: 1, tassel: 1 }, { steel: 0xc9ddd2, handle: ['wood', 0x3f3a2c] }, 2.1],
  'w:sharpstick': ['spear', { shaft: 1.4, head: 0.1, wood: 1 }, { steel: 0x2a2018, keepTone: 1, handle: ['wood', 0xa07a4a] }, 1.6],
  'w:mace': ['mace', { len: 0.85, headR: 0.09 }, { iron: 1, steel: 0x8f969c, handle: ['wood', 0x6a4426] }, 1.35],
  'w:bow': ['bow', { len: 1.25, curve: 0.18 }, { handle: ['wood', 0x9a6a38], trim: ROPE, steel: 0xb0a890 }, 1.5],
  'w:longbow': ['bow', { len: 1.75, curve: 0.22, wrap: 1, recurve: 0.06 }, { handle: ['wood', 0x6a4a2a], trim: ROPE, steel: 0x8a8a7a }, 1.95],
  'w:crossbow': ['crossbow', { len: 0.95, span: 0.36, bend: 0.4 }, { handle: ['wood', 0x6f4a2a], trim: 'dark', steel: 0x8f969c }, 1.15],
  'w:flail': ['flail', { len: 0.55, ball: 0.09 }, { iron: 1, steel: 0x8f969c, handle: ['wood', 0x6a4426] }, 1.4],
  'w:halberd': ['halberd', { len: 1.7, size: 0.7 }, { steel: 0xb0b8c0, handle: ['wood', 0x5a3a22] }, 2.05],
  'w:warhammer': ['hammer', { len: 1.1, head: 0.34 }, { steel: 0x99a1a9, handle: ['wood', 0x4f3220] }, 1.6],
  'w:staff': ['staff', { gem: 0x66ddff }, { handle: ['wood', 0x6a4426] }, 1.8],
  'w:scepter': ['scepter', {}, {}, 1.3],
};
// ---------- WEAPONS 2 (placeholder models; reuse the existing family builders with new parameters; another pass may polish these) ----------
function registerWeapons2() {
  Object.assign(WS, {
    'w:scrapcleaver': ['sword', { len: 0.5, w: 0.17, tip: 0.8, notch: 1, guard: 'none', grip: 0.2, gr: 0.02, rings: 3, pommel: 'none' }, { steel: 0x7d6a58, iron: 1, rough: 0.9, handle: ['wood', 0x5a4028], trim: ROPE }, 1.15],
    'w:handxbow': ['crossbow', { len: 0.5, span: 0.24, bend: 0.3 }, { handle: ['wood', 0x7a5230], trim: 'dark', steel: 0x8f969c }, 0.7],
    'w:twinfangs': ['sword', { len: 0.32, w: 0.05, tip: 0.3, curve: 0.06, guard: 'wing', gw: 0.07, grip: 0.12, gr: 0.015, rings: 4, pr: 0.022, ridge: 0.7, gth: 0.011 }, { steel: 0xb8e0c8, handle: ['leather', 0x2f4a38] }, 0.95],
    'w:throwaxe': ['axe', { haft: 0.5, size: 0.5 }, { steel: 0xa8b0b8, handle: ['wood', 0x8a5a30] }, 0.9],
    'w:pike': ['spear', { shaft: 2.4, head: 0.22, hw: 0.04 }, { steel: 0xb4bcc4, handle: ['wood', 0x6a4426] }, 2.6],
    'w:ogreclub': ['club', { len: 1.25, headR: 0.15, nails: 6 }, { handle: ['wood', 0x5a3a22], iron: 1, steel: 0x8a8f95 }, 1.5],
    'w:maul': ['hammer', { len: 1.45, head: 0.5 }, { steel: 0x6e757d, handle: ['wood', 0x3f2a1a] }, 1.9],
    'w:arbalest': ['crossbow', { len: 1.2, span: 0.5, bend: 0.55 }, { handle: ['wood', 0x4f3220], trim: 'dark', steel: 0x5d646c }, 1.35],
    'w:crownsplitter': ['axe', { haft: 1.3, size: 1.2, double: 1, rings: 4 }, { steel: 0xe8c860, keepTone: 1, handle: ['wood', 0x2a1018] }, 1.9],
  });
}
registerWeapons2();
const AS = {
  'a:sack': ['cloth', { kind: 'sack', belt: 1, rag: 0.07, prof: { hemY: 0.5, hemR: 0.3, waistR: 0.3, chestR: 0.3, shR: 0.26, waistY: 0.7 } }, { main: ['cloth', 0xc4ae7c, { tex: 'burlap' }], trim: CLO(0x7a5a30, { tex: 'burlap' }) }],
  'a:cloth': ['cloth', { patches: 4, belt: 1, rag: 0.04 }, { main: ['cloth', 0xcdbf9a], trim: CLO(0x8a3a30) }],
  'a:rags': ['cloth', { rag: 0.11, teeth: 12, patches: 2, sleeve: 0.18 }, { main: ['cloth', 0x8c7b5c], trim: CLO(0x4f3f2b) }],
  'a:gambeson': ['cloth', { padded: 1, belt: 1, sleeve: 0.34, sr: 0.11, rag: 0.015 }, { main: ['cloth', 0xd8cdb0, { tex: 'quilt' }], trim: LEA(0x5a3a22) }],
  'a:leafwrap': ['cloth', { leaves: 1, rag: 0.05, sleeve: 0 }, { main: ['cloth', 0x6f8f3e], trim: CLO(0x93b04a) }],
  'a:ragwrap': ['cloth', { strips: 3, rag: 0.06, sleeve: 0.12 }, { main: ['cloth', 0xb09d78], trim: CLO(0xe0d4b0) }],
  'a:scraps': ['leather', { kind: 'scraps', beltMat: 'main' }, { main: ['leather', 0x8b6a45], trim: LEA(0x5e4128) }],
  'a:vest': ['leather', { kind: 'vest', lace: 1, beltMat: 'main' }, { main: ['leather', 0x6b4a2f] }],
  'a:jerkin': ['leather', { kind: 'jerkin', beltMat: 'main' }, { main: ['hide', 0xb08a5a], trim: { kind: 'hide', col: 0xefe4cc } }],
  'a:boiled': ['leather', { kind: 'boiled', beltMat: 'main' }, { main: ['leather', 0x3a2515, { rough: 0.36 }] }],
  'a:barkvest': ['leather', { kind: 'bark' }, { main: ['bark', 0xa58d6b], trim: LEA(0x5a3a22) }],
  'a:chain': ['mail', { sleeve: 0.28 }, { main: ['mail', 0xc9d0d8], trim: LEA(0x4a3426) }],
  'a:scale': ['mail', { shoulder: 1, rag: 0.02 }, { main: ['scale', 0xaeb6be], trim: LEA(0x3a2a20) }],
  'a:brigandine': ['mail', { studs: 1, shoulder: 1, sh: 'T', rag: 0.02, sleeve: 0.24 }, { main: ['cloth', 0x7a2c24], trim: 'steel' }],
  'a:dragon': ['mail', { shoulder: 1, spikes: 1, tsp: 1, fins: 1, rag: 0.03 }, { main: ['scale', 0x38a86a, { emissive: 0x501010, ei: 0.5, rough: 0.35 }], trim: { kind: 'plain', col: 0xe8dcc0, o: { rough: 0.5 } } }],
  'a:mythril': ['mail', { shoulder: 1, rag: 0.02 }, { main: ['mail', 0xe3f2ff], trim: 'steel', metal: 1 }],
  'a:harness': ['harness', {}, { main: ['leather', 0x4f3322], trim: 'steel' }],
  'a:cuirass': ['plate', { skirt: 1, layers: 1, pauld: 0.8 }, { main: ['iron', 0x9ba2a9, { rough: 0.5 }], goldCol: 0x9a7a30 }],
  'a:banded': ['plate', { bands: 5, skirt: 1, rivets: 1, layers: 2 }, { main: ['iron', 0x8a9098, { rough: 0.45 }], goldCol: 0xb08a3a }],
  'a:knight': ['plate', { skirt: 2, layers: 3, crest: 1, rivets: 1 }, { main: ['steel', 0xd5dbe2], metal: 1 }],
  'a:dwarven': ['plate', { pauld: 1.25, layers: 3, rivets: 1, bands: 2, skirt: 2 }, { main: ['steel', 0xa07a3e, { rough: 0.28 }], goldCol: 0xffc933 }],
  'a:obsidian': ['plate', { spikes: 1, cracks: 1, layers: 3, pauld: 1.15, skirt: 2 }, { main: ['iron', 0x1c1a24, { rough: 0.16 }], goldCol: 0x8a1a2a }],
  'a:aegis': ['plate', { pauld: 1.5, layers: 3, bigGem: 1, crest: 1, rivets: 1, skirt: 2 }, { main: ['steel', 0xefe9da, { rough: 0.22 }], goldCol: 0xffd860, metal: 1 }],
  'a:leafwrapX': null,
  'a:robe': ['robe', {}, { main: ['silk', 0xffffff, { tex: 'stars' }] }],
  'a:royal': ['royal', {}, { main: ['cloth', 0xffffff, { tex: 'royal' }], trim: CLO(0xffffff, { tex: 'ermine' }) }],
};
delete AS['a:leafwrapX'];
// base-item aliases and unknown future items fall back to a representative of their family
const REP = { club: 'w:club', dagger: 'w:dagger', sword: 'w:ironsword', bow: 'w:bow', axe: 'w:axe', spear: 'w:spear', mace: 'w:mace', crossbow: 'w:crossbow', flail: 'w:flail', halberd: 'w:halberd', hammer: 'w:warhammer', staff: 'w:staff', scepter: 'w:scepter', cloth: 'a:cloth', leather: 'a:vest', mail: 'a:chain', harness: 'a:harness', plate: 'a:cuirass', robe: 'a:robe', royal: 'a:royal' };

// ---------- brain, gold, parts ----------
function brainModel() {
  const b = new Build('m:brain'), m = M('flesh', 0xf6a2bb);
  for (const s of [-1, 1]) b.add(m, blob(0.17, 0.1, s * 3 + 1, 1, 0.88, 1.3, 6.5, 48, 34, true), s * 0.088, 0, 0);
  b.add(m, blob(0.085, 0.06, 9, 1.35, 0.8, 1, 6, 28, 20, true), 0, -0.1, -0.2);
  b.add(m, sweep([[0, -0.08, -0.08], [0, -0.18, -0.1], [0, -0.3, -0.07]], t => 0.04 - 0.017 * t, 8, 8));
  b.glowCol = 0xff7a9e; return b.finish(0.62, 'uncommon');
}
function goldModel() {
  const b = new Build('gold'), g = M('gold', 0xffc933, { ei: 0.55 }), r = rng(5);
  const coin = lathe([0, 0, 0.088, 0, 0.1, 0.01, 0.1, 0.024, 0.088, 0.034, 0.066, 0.034, 0.061, 0.027, 0, 0.027], 22);
  for (const [x, z, n] of [[-0.13, 0.02, 9], [0.12, -0.02, 6], [0.0, 0.15, 4], [0.03, -0.17, 3]]) for (let i = 0; i < n; i++) b.add(g, coin, x + (r() - 0.5) * 0.012, i * 0.034, z + (r() - 0.5) * 0.012, 0, r() * TAU, 0);
  b.add(g, coin, 0.2, 0.1, 0.1, 1.15, 0.5, 0.2); b.add(g, coin, -0.12, 0.0, 0.2, 0, 0.4, 0); b.add(g, coin, 0.2, 0.0, 0.12, 0, 1, 0); b.add(g, coin, -0.28, 0.0, -0.1, 0, 2, 0);
  b.glowCol = 0xffc933; return b.finish(0.55, 'legendary');
}
const PARTB = {
  wood() { const b = new Build('part:wood'), m = M('bark', 0xa58d6b), w = M('wood', 0xd8b98a); const log = lathe([0, 0, 0.065, 0, 0.07, 0.012, 0.072, 0.1, 0.07, 0.4, 0.07, 0.488, 0.065, 0.5, 0, 0.5], 14);
    for (const [x, y, z] of [[-0.075, 0, 0.0], [0.075, 0, 0.0], [0, 0.125, 0.0]]) { b.add(m, log, x, y, -0.25, PI / 2, 0, 0); b.add(w, new THREE.CircleGeometry(0.058, 14), x, y, 0.253, 0, 0, 0); b.add(w, new THREE.CircleGeometry(0.058, 14), x, y, -0.253, 0, PI, 0); }
    return b.finish(0.38, 'common'); },
  metal() { const b = new Build('part:metal'), m = M('iron', 0xaab2ba, { rough: 0.4 }); const ing = ext(polyShape([[-0.15, 0], [0.15, 0], [0.11, 0.08], [-0.11, 0.08]]), 0.12, 0.012, 0.01, 2);
    for (const [x, y, z] of [[-0.16, 0, 0], [0.16, 0, 0], [0, 0.09, 0]]) b.add(m, ing, x, y, z); return b.finish(0.22, 'common'); },
  leather() { const b = new Build('part:leather'), m = M('leather', 0x8b5a34), d = M('leather', 0x4a3020); b.add(m, lathe([0, -0.2, 0.11, -0.2, 0.12, -0.18, 0.12, 0.18, 0.11, 0.2, 0, 0.2], 18), 0, 0, 0, 0, 0, PI / 2); for (const x of [-0.1, 0.1]) b.add(d, TOR(0.123, 0.014, 5, 20), x, 0, 0, 0, PI / 2, 0); return b.finish(0.26, 'common'); },
  cloth() { const b = new Build('part:cloth'); const cs = [M('cloth', 0xcfc2a0), M('cloth', 0x8a3a30), M('cloth', 0x4a6a8a)]; for (let i = 0; i < 4; i++) b.add(cs[i % 3], rbox(0.32 - i * 0.015, 0.06, 0.24, 0.02), 0, i * 0.058, 0, 0, i * 0.12, 0); return b.finish(0.24, 'common'); },
  bone() { const b = new Build('part:bone'), m = M('plain', 0xe9dfc2, { rough: 0.55 }); b.add(m, sweep([[0, -0.3, 0], [0.01, 0, 0], [0, 0.3, 0]], t => 0.03 + 0.008 * Math.cos(t * 6), 8, 12)); for (const y of [-0.31, 0.31]) for (const x of [-0.035, 0.035]) b.add(m, SP(0.045, 10, 8), x, y, 0); return b.finish(0.5, 'common'); },
  gem() { const b = new Build('part:gem'), m = M('gem', 0x4a8dff, { ei: 1.0 }); b.add(m, new THREE.IcosahedronGeometry(0.16, 0), 0, 0, 0, 0.3, 0.4, 0, 1, 1.3, 1); b.add(m, new THREE.IcosahedronGeometry(0.07, 0), 0.18, -0.12, 0.05); b.add(M('gem', 0xff4a7a, { ei: 1.0 }), new THREE.IcosahedronGeometry(0.06, 0), -0.17, -0.13, 0.08); b.glowCol = 0x4a8dff; return b.finish(0.42, 'rare'); },
  string() { const b = new Build('part:string'), m = M('plain', 0xd8c9a0, { rough: 0.95 }); b.add(m, blob(0.15, 0.02, 4, 1, 1, 1, 3, 20, 14)); const r = rng(8); for (let i = 0; i < 9; i++) b.add(m, TOR(0.148, 0.012, 5, 28), 0, 0, 0, r() * PI, r() * PI, r() * PI); b.add(m, sweep([[0.12, -0.1, 0.1], [0.28, -0.18, 0.12], [0.3, -0.1, 0.2]], 0.01, 5, 10)); return b.finish(0.34, 'common'); },
  crystal() { const b = new Build('part:crystal'), m = M('gem', 0x7ff4ff, { ei: 0.9 }); const sh = lathe([0, 0, 0.06, 0, 0.06, 0.22, 0, 0.36], 6); for (const [x, z, h, rx, rz] of [[0, 0, 1.2, 0, 0], [0.1, 0.02, 0.8, 0, -0.35], [-0.09, 0.03, 0.7, 0.2, 0.3], [0.02, -0.09, 0.6, -0.4, 0.1]]) b.add(m, sh, x, 0, z, rx, 0, rz, 1, h, 1); b.glowCol = 0x7ff4ff; return b.finish(0.46, 'transcendent'); },
};
const PART_KEYS = ['wood', 'metal', 'leather', 'cloth', 'bone', 'gem', 'string', 'crystal'];
// ITEMS2-MODELS-BEGIN: small models for the utility items (x:) and charms (c:), used for the baked icons. One builder per key name; each is a handful of primitives.
const UTILB = (() => {
  const P = (c, o = {}) => M('plain', c, o), ST = c => M('steel', c, {}), IR = c => M('iron', c, {}), WD = c => M('wood', c, {}), CL = (c, t) => M('cloth', c, t ? { tex: t } : {}), LE = c => M('leather', c, {}), GM = (c, ei = 0.5) => M('gem', c, { ei }), GD = () => M('gold', 0xffc933, {});
  const glass = c => M('gem', c, { ei: 0.18 });
  const bottle = (b, col, neck = 0.03, h = 0.22, round = false) => {   // a stoppered bottle: glass body, cork
    b.add(glass(col), lathe(round ? [0, 0, 0.06, 0, 0.1, 0.05, 0.11, 0.11, 0.09, 0.17, 0.04, 0.21, neck, 0.25, neck, h + 0.1, 0, h + 0.1] : [0, 0, 0.07, 0, 0.09, 0.03, 0.09, 0.12, 0.05, 0.18, neck, 0.22, neck, h + 0.1, 0, h + 0.1], 16));
    b.add(WD(0x9a7040), CYL(neck * 1.15, neck * 1.05, 0.05, 10), 0, h + 0.09, 0);
  };
  const chain = (b, y, c) => b.add(c || GD(), TOR(0.05, 0.008, 5, 14), 0, y, 0);
  const U = {
    bandage(b) { b.add(CL(0xe9ddc2), CYL(0.11, 0.11, 0.13, 18), 0, 0, 0); b.add(CL(0xc9b88f), CYL(0.05, 0.05, 0.135, 12), 0, 0, 0); b.add(CL(0xf2e8cc), rbox(0.24, 0.012, 0.075), 0.17, 0.0, 0.05, 0, 0.4, 0); b.add(P(0xb3262d), BOXG(0.012, 0.004, 0.05), 0, 0.131, 0.0); return b.finish(0.2, 'common'); },
    mushroom(b) { b.add(CL(0xefe4c8), CYL(0.04, 0.03, 0.1, 12), 0, 0, 0); b.add(P(0xc9553d, { rough: 0.5 }), SP(0.1, 20, 12), 0, 0.12, 0, 0, 0, 0, 1, 0.62, 1); for (const [x, z] of [[0.04, 0.05], [-0.05, 0.03], [0.0, -0.07], [0.07, -0.03]]) b.add(P(0xf6efe0), SP(0.016, 8, 6), x, 0.17, z); return b.finish(0.2, 'common'); },
    tonic(b) { bottle(b, 0x7fd8ff); b.add(P(0x6fe0ff, { emissive: 0x2a9ad8, ei: 0.6 }), CYL(0.065, 0.075, 0.1, 14), 0, 0.02, 0); return b.finish(0.28, 'uncommon'); },
    smoke(b) { b.add(P(0x5d636b, { rough: 0.55, metal: 0.3 }), SP(0.11, 18, 12), 0, 0.1, 0); b.add(IR(0x3c4046), CYL(0.04, 0.035, 0.06, 10), 0, 0.19, 0); b.add(P(0x8a6a3a), sweep([[0, 0.25, 0], [0.03, 0.3, 0], [0.07, 0.31, 0]], 0.006, 6, 8)); b.add(IR(0x4a4f58), TOR(0.11, 0.008, 5, 20), 0, 0.1, 0, PI / 2, 0, 0); return b.finish(0.26, 'uncommon'); },
    bomb(b) { b.add(P(0x24272d, { rough: 0.35, metal: 0.5 }), SP(0.12, 20, 14), 0, 0.1, 0); b.add(IR(0x4a4f58), CYL(0.045, 0.04, 0.05, 10), 0, 0.2, 0); b.add(P(0xa07a44), sweep([[0, 0.24, 0], [0.03, 0.31, 0], [0.09, 0.33, 0]], 0.007, 6, 10)); b.add(GM(0xff9a2a, 1.4), SP(0.022, 8, 6), 0.095, 0.335, 0); return b.finish(0.3, 'rare'); },
    wedge(b) { b.add(WD(0xa8793f), ext(polyShape([[-0.18, 0], [0.18, 0], [0.18, 0.12]]), 0.14, 0.01, 0.008, 2), 0, 0, -0.07); b.add(WD(0x6a4a28), BOXG(0.36, 0.008, 0.02), 0, 0.001, 0.071); return b.finish(0.14, 'uncommon'); },
    wax(b) { b.add(P(0xb3262d, { rough: 0.35 }), lathe([0, 0, 0.12, 0, 0.14, 0.012, 0.125, 0.04, 0.07, 0.05, 0, 0.05], 20)); b.add(P(0x8a1a20, { rough: 0.35 }), TOR(0.065, 0.008, 5, 18), 0, 0.052, 0, PI / 2, 0, 0); b.add(P(0x8a1a20, { rough: 0.35 }), SP(0.02, 8, 6), 0, 0.058, 0); return b.finish(0.12, 'common'); },
    lockpick(b) { const s = ST(0xc8d0d8); b.add(s, sweep([[-0.06, 0, 0], [0, 0.28, 0], [0.03, 0.34, 0], [0.07, 0.33, 0]], 0.012, 6, 14)); b.add(s, sweep([[0.07, 0, 0], [0.03, 0.26, 0], [0.0, 0.3, 0]], 0.01, 6, 10)); b.add(LE(0x4a3020), CYL(0.025, 0.025, 0.1, 8), -0.075, -0.02, 0, 0, 0, 0.12); b.add(LE(0x4a3020), CYL(0.022, 0.022, 0.09, 8), 0.075, -0.02, 0, 0, 0, -0.1); return b.finish(0.34, 'mythic'); },
    trap(b) { const iron = IR(0x6a7078); b.add(iron, BOXG(0.34, 0.03, 0.16), 0, 0, 0); for (const s of [-1, 1]) { b.add(iron, TOR(0.12, 0.014, 5, 16), 0, 0.05, s * 0.0, PI / 2 - s * 0.35, 0, 0); for (let i = 0; i < 6; i++) { const a = (i / 5) * PI, x = Math.cos(a) * 0.12, y = Math.sin(a) * 0.12; b.add(ST(0xd0d6dc), CONE(0.014, 0.05, 4), x, 0.05 + Math.sin(PI / 2 - s * 0.35) * 0 + y * 0.9, s * y * 0.35, 0, 0, 0); } } b.add(IR(0x4a4f58), CYL(0.03, 0.03, 0.02, 10), 0, 0.03, 0); return b.finish(0.16, 'uncommon'); },
    flare(b) { b.add(P(0xc22a1f, { rough: 0.5 }), CYL(0.035, 0.035, 0.3, 12), 0, 0, 0); b.add(P(0xf0d060), CYL(0.037, 0.037, 0.03, 12), 0, 0.2, 0); b.add(P(0x3a2a20), CYL(0.03, 0.03, 0.03, 10), 0, 0.3, 0); b.add(GM(0xff7a30, 1.6), SP(0.03, 8, 6), 0, 0.345, 0); b.glowCol = 0xff6a3a; return b.finish(0.36, 'uncommon'); },
    lens(b) { b.add(GD(), TOR(0.1, 0.012, 6, 24), 0, 0.15, 0); b.add(glass(0xaee8ff), SP(0.1, 20, 10), 0, 0.15, 0, 0, 0, 0, 1, 1, 0.1); b.add(WD(0x6a4a28), CYL(0.016, 0.02, 0.17, 8), 0, -0.04, 0); b.add(GD(), CYL(0.022, 0.022, 0.02, 8), 0, 0.04, 0); return b.finish(0.34, 'rare'); },
    pry(b) { const s = IR(0x7a2a24); b.add(s, sweep([[0, 0, 0], [0, 0.34, 0], [0.01, 0.4, 0], [0.07, 0.43, 0], [0.12, 0.4, 0]], 0.016, 8, 20)); b.add(s, CONE(0.03, 0.06, 6), 0, -0.05, 0, PI, 0, 0); b.add(ST(0xc8d0d8), BOXG(0.04, 0.012, 0.02), 0.13, 0.39, 0); return b.finish(0.4, 'rare'); },
    ward(b) { b.add(P(0x6a707a, { rough: 0.8 }), ext(polyShape([[-0.1, -0.13], [0.1, -0.13], [0.13, 0.0], [0.1, 0.13], [-0.1, 0.13], [-0.13, 0.0]]), 0.04, 0.012, 0.01, 2)); const g = GM(0x7fe8ff, 1.5); b.add(g, BOXG(0.02, 0.12, 0.012), 0, 0, 0.032); b.add(g, BOXG(0.09, 0.02, 0.012), 0, 0.02, 0.032); b.add(g, BOXG(0.02, 0.07, 0.012), 0.03, -0.04, 0.032, 0, 0, 0.5); b.glowCol = 0x7fe8ff; return b.finish(0.26, 'rare'); },
    jar(b) { b.add(glass(0xbfe4d8), lathe([0, 0, 0.1, 0, 0.12, 0.03, 0.12, 0.22, 0.1, 0.25, 0.07, 0.26, 0, 0.26], 18)); b.add(M('flesh', 0xf6a2bb), blob(0.075, 0.05, 3, 1.2, 0.85, 1, 6, 22, 16, true), 0, 0.13, 0); b.add(WD(0x7a5a38), CYL(0.075, 0.075, 0.04, 14), 0, 0.26, 0); b.add(GD(), TOR(0.077, 0.006, 5, 16), 0, 0.27, 0, PI / 2, 0, 0); return b.finish(0.3, 'rare'); },
    bait(b) { b.add(CL(0x7a5230), blob(0.13, 0.03, 5, 1, 0.95, 1, 4, 22, 16), 0, 0.12, 0); b.add(CL(0x7a5230), CYL(0.06, 0.04, 0.07, 10), 0, 0.22, 0); b.add(LE(0x3a2818), TOR(0.045, 0.01, 5, 12), 0, 0.235, 0, PI / 2, 0, 0); const coin = lathe([0, 0, 0.04, 0, 0.045, 0.006, 0.04, 0.012, 0, 0.012], 12); b.add(GD(), coin, 0.15, 0, 0.05, 0, 0.3, 0); b.add(GD(), coin, 0.12, 0.012, 0.12, 0.2, 0, 0.1); b.add(GD(), coin, -0.15, 0, 0.08); return b.finish(0.22, 'uncommon'); },
    dazzle(b) { b.add(P(0xf2efe0, { rough: 0.9 }), blob(0.11, 0.03, 8, 1, 0.9, 1, 4, 22, 16), 0, 0.1, 0); b.add(CL(0xcbb890), CYL(0.05, 0.035, 0.06, 10), 0, 0.19, 0); b.add(LE(0x4a3020), TOR(0.04, 0.008, 5, 12), 0, 0.205, 0, PI / 2, 0, 0); b.add(GM(0xfff4b0, 1.5), SP(0.02, 8, 6), 0.12, 0.2, 0.04); b.add(GM(0xfff4b0, 1.5), SP(0.014, 8, 6), -0.1, 0.24, -0.03); b.glowCol = 0xfff4b0; return b.finish(0.26, 'uncommon'); },
    haggle(b) { b.add(LE(0xb08a52), rbox(0.2, 0.3, 0.02, 0.01), 0, 0, 0); b.add(GD(), TOR(0.028, 0.008, 5, 14), 0, 0.17, 0); b.add(LE(0x3a2818), sweep([[0.0, 0.19, 0], [0.05, 0.27, 0], [0.12, 0.29, 0]], 0.005, 5, 8)); b.add(GD(), lathe([0, 0, 0.06, 0, 0.065, 0.005, 0.06, 0.01, 0, 0.01], 14), 0, -0.02, 0.011, PI / 2, 0, 0); return b.finish(0.32, 'uncommon'); },
    rage(b) { bottle(b, 0xd03a2a, 0.035, 0.2, true); b.add(P(0xff4a2a, { emissive: 0xb01a10, ei: 0.7 }), SP(0.09, 14, 10), 0, 0.07, 0, 0, 0, 0, 1, 0.8, 1); b.add(P(0xe9dfc2), SP(0.03, 8, 6), 0, 0.1, 0.1); return b.finish(0.28, 'rare'); },
    feather(b) { b.add(P(0xf4f4ff, { rough: 0.8 }), SP(0.06, 14, 10), 0, 0.2, 0, 0, 0, 0, 1, 3.4, 0.16); b.add(P(0xcfd8f0), CYL(0.006, 0.004, 0.42, 6), 0, -0.1, 0); b.add(P(0x9fb4e8), SP(0.05, 10, 8), 0.0, 0.3, 0.004, 0, 0, 0, 0.7, 1.5, 0.12); return b.finish(0.42, 'uncommon'); },
    bell(b) { b.add(GD(), lathe([0, 0.19, 0.03, 0.19, 0.06, 0.17, 0.09, 0.08, 0.12, 0.01, 0.13, 0, 0.115, -0.01, 0, -0.01], 20)); b.add(IR(0x4a3a20), SP(0.025, 8, 6), 0, -0.02, 0); b.add(GD(), TOR(0.03, 0.008, 5, 12), 0, 0.21, 0); b.add(LE(0x4a3020), CYL(0.02, 0.02, 0.05, 8), 0, -0.07, 0); return b.finish(0.26, 'uncommon'); },
    heart(b) { const g = GM(0xe23a4a, 0.9); b.add(g, SP(0.06, 14, 10), -0.045, 0.04, 0, 0, 0, 0, 1, 1, 0.7); b.add(g, SP(0.06, 14, 10), 0.045, 0.04, 0, 0, 0, 0, 1, 1, 0.7); b.add(g, CONE(0.1, 0.12, 4), 0, -0.1, 0, PI, PI / 4, 0, 1, 1, 0.55); chain(b, 0.13); return b.finish(0.28, 'uncommon'); },
    swift(b) { b.add(GD(), lathe([0, 0, 0.05, 0, 0.06, 0.05, 0.035, 0.14, 0, 0.15], 14)); b.add(GD(), SP(0.04, 10, 8), 0, 0.19, 0); for (const s of [-1, 1]) b.add(P(0xfff0b0, { metal: 0.6, rough: 0.3 }), SP(0.05, 10, 8), s * 0.08, 0.17, -0.01, 0, 0, s * 0.6, 0.35, 1.8, 0.2); b.add(GM(0x4aa8ff, 1.0), SP(0.012, 6, 5), 0, 0.2, 0.038); chain(b, 0.25); return b.finish(0.3, 'uncommon'); },
    magnet(b) { b.add(P(0xc0392b, { rough: 0.4, metal: 0.3 }), new THREE.TorusGeometry(0.1, 0.032, 8, 20, PI), 0, 0.05, 0); for (const s of [-1, 1]) { b.add(ST(0xe0e6ec), CYL(0.034, 0.034, 0.06, 10), s * 0.1, -0.04, 0, PI, 0, 0); } b.add(GD(), SP(0.02, 8, 6), 0, 0.17, 0); return b.finish(0.26, 'rare'); },
    scholar(b) { b.add(CL(0xe8d8a8), CYL(0.05, 0.05, 0.22, 12), 0, 0, 0, 0, 0, PI / 2); b.add(WD(0x6a4a28), CYL(0.056, 0.056, 0.02, 12), -0.12, 0, 0, 0, 0, PI / 2); b.add(WD(0x6a4a28), CYL(0.056, 0.056, 0.02, 12), 0.12, 0, 0, 0, 0, PI / 2); b.add(P(0x2a3a8a), TOR(0.052, 0.01, 5, 14), 0, 0, 0, 0, PI / 2, 0); b.add(GM(0x7a5aff, 1.0), SP(0.018, 8, 6), 0.0, 0.0, 0.058); return b.finish(0.14, 'rare'); },
    tongue(b) { b.add(ST(0xdfe6ee), SP(0.06, 14, 10), 0, 0.05, 0, 0, 0, 0, 0.9, 2.0, 0.28); b.add(P(0x8a9098, { metal: 0.8, rough: 0.35 }), BOXG(0.008, 0.16, 0.02), 0, 0.05, 0.02); chain(b, 0.17, ST(0xdfe6ee)); return b.finish(0.3, 'rare'); },
    fang(b) { b.add(P(0xf0e8d0, { rough: 0.5 }), sweep([[0, 0, 0], [0.025, 0.1, 0], [0.085, 0.19, 0]], t => 0.04 * (1 - t) + 0.004, 8, 14)); b.add(GD(), TOR(0.026, 0.007, 5, 12), -0.005, -0.02, 0); b.add(GD(), CYL(0.044, 0.04, 0.035, 10), 0, -0.01, 0); return b.finish(0.26, 'uncommon'); },
  };
  return new Proxy(U, { get: (t, k) => t[k] ? () => { const b = new Build((k in { heart: 1, swift: 1, magnet: 1, scholar: 1, tongue: 1, fang: 1 } ? 'c:' : 'x:') + k); return t[k](b); } : undefined });
})();
// ITEMS2-MODELS-END
function canon(key) {
  if (typeof key !== 'string') return null;
  if (key.startsWith('x:') || key.startsWith('c:')) return UTILB[key.slice(2)] ? key : null;   // UTILITY / ITEMS2: models for the utility items and charms (UTILB above); the plushie has none
  if (key.startsWith('m:brain')) return 'm:brain';
  if (key === 'gold' || key === 'm:gold' || key === 'part:gold') return 'gold';
  const k = key.replace(/^(m:|part:)/, ''); if (PART_KEYS.includes(k)) return 'part:' + k;
  if (infoOf(key)) return key; if (infoOf('w:' + key)) return 'w:' + key;
  return null;
}

// ---------- building and caching one prototype per item key ----------
function buildItem(key) {
  if (key.startsWith('x:') || key.startsWith('c:')) return UTILB[key.slice(2)]();
  if (key === 'm:brain') return brainModel();
  if (key === 'gold') return goldModel();
  if (key.startsWith('part:')) return PARTB[key.slice(5)]();
  const it = infoOf(key); if (!it) return null;
  if (it.type === 'weapon') {
    const d = WS[key] || WS[REP[it.family] || 'w:sword'], [fam, p, spec, h] = d, c = ctxFor(it, spec), b = new Build(key);
    WF[fam](b, c, p); return finishItem(b, c, h);
  }
  const d = AS[key] || AS[REP[it.family] || 'a:cloth'], [fam, p, spec] = d, c = ctxFor(it, spec), b = new Build(key);
  const mk = spec.main || ['steel', 0xb9c1c9], dull = it.tier === 'common';
  if (it.tier === 'transcendent' && spec.metal) c.MAIN = M('iri', 0xdff8ff, { tex: mk[0] === 'mail' ? 'mail' : 'metal' });
  else { let col = mk[2] && mk[2].keep ? mk[1] : mk[1]; c.MAIN = M(mk[0], col, mk[2] || {}); }
  if (spec.cloth) c.cloth = M('cloth', spec.cloth);
  c.H = M('wood', 0x7a5a3a);   // the display stand
  AF[fam](b, c, p); return finishItem(b, c, 1.25);
}
const protos = new Map();
function proto(key) {
  const k = canon(key); if (!k) return null;
  let p = protos.get(k);
  if (p === undefined) { try { p = buildItem(k); } catch (e) { console.warn('[GKART] build failed for', k, e); p = null; } protos.set(k, p); }
  return p;
}
function model(key) { const p = proto(key); return p ? p.clone() : null; }
function drawCalls(key) { const p = proto(key); let n = 0; if (p) p.traverse(o => { if (o.isMesh || o.isSprite || o.isPoints) n++; }); return n; }

// ---------- icon baking: private scene, own lights + PMREM room environment, offscreen float render target ----------
const ICON = (typeof window !== "undefined" && window.GK_ICON_PX) || 160, RTS = ICON * 2, tune = { key: 1.3, fill: 0.4, rim: 0.9, hemi: 0.25, env: 0.6, expo: 0.95 };
const icons = new Map();
let bakeJob = null;
let ENC_LUT = null; const ENC_S = 512, ENC_N = 12 * 512;   // PERF3: encode lookup table (0..12 in 1/512 steps, linear interpolation; the curve is flat at 1.0 beyond about 6)
const allKeys = () => { const I = window.GKITEMS, ks = I ? Object.keys(I.ITEMS) : []; return ks.concat(['m:brain', 'gold'], PART_KEYS.map(k => 'part:' + k)); };
const enc = v => { v = Math.max(0, v * tune.expo); v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14); v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; };
function bake(renderer, opts = {}) {
  if (bakeJob && !opts.force) return bakeJob.promise;
  const keys = (opts.keys || allKeys()), t00 = performance.now(), budget = opts.budget ?? 10, gap = opts.gap ?? 40;
  let env, scene, cam, rt, rtM, bufC, bufM, tmp, tctx;
  const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), maskPts = new THREE.PointsMaterial({ color: 0xffffff, size: 0.075, sizeAttenuation: true });
  const setup = () => {
    const pm = new THREE.PMREMGenerator(renderer); env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    scene = new THREE.Scene(); scene.environment = env; scene.environmentIntensity = tune.env;
    const key = new THREE.DirectionalLight(0xfff0dc, tune.key); key.position.set(-2.5, 3.5, 4); const fill = new THREE.DirectionalLight(0xbfd4ff, tune.fill); fill.position.set(3, 0.5, 3); const rim = new THREE.DirectionalLight(0xffffff, tune.rim); rim.position.set(2, 2.5, -3.5);
    scene.add(key, fill, rim, new THREE.HemisphereLight(0xffffff, 0x8a8478, tune.hemi));   // private bake lights: never added to the game scene
    cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 60);
    rt = new THREE.WebGLRenderTarget(RTS, RTS, { type: THREE.FloatType, samples: 4, depthBuffer: true }); rtM = new THREE.WebGLRenderTarget(RTS, RTS, { type: THREE.UnsignedByteType, samples: 4, depthBuffer: true }); bufC = new Float32Array(RTS * RTS * 4); bufM = new Uint8Array(RTS * RTS * 4);
    tmp = document.createElement('canvas'); tmp.width = tmp.height = RTS; tctx = tmp.getContext('2d');
  };
  const one = key => {
    const m = model(key); if (!m) return;
    const info = infoOf(key) || {}, isW = info.type === 'weapon', tall = isW && !(info.family === 'bow' || info.family === 'crossbow');
    for (const o of m.children.slice()) if (o.userData.glow) m.remove(o);
    const g1 = new THREE.Group(), g2 = new THREE.Group(), g3 = new THREE.Group(); g1.add(m); g2.add(g1); g3.add(g2); scene.add(g3);
    g1.rotation.y = isW ? 0.5 : info.type === 'armor' ? 0.42 : 0.5; g2.rotation.z = tall ? -0.74 : isW ? -0.3 : 0; g3.rotation.x = 0.24; g3.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(g3, true), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3()), half = Math.max(sz.x, sz.y) / 2 * 1.06;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half; cam.position.set(c.x, c.y, c.z + 20); cam.lookAt(c.x, c.y, c.z); cam.updateProjectionMatrix();
    // pass 1: colour over black (premultiplied); pass 2: coverage mask (white unlit) -> straight alpha
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, RTS, RTS, bufC);
    const saved = []; g3.traverse(o => { if (o.isMesh) { saved.push([o, o.material]); o.material = maskMat; } else if (o.isPoints) { saved.push([o, o.material]); o.material = maskPts; } });
    const env0 = scene.environment; scene.environment = null; const lights = scene.children.filter(o => o.isLight); lights.forEach(l => l.visible = false);
    renderer.setRenderTarget(rtM); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rtM, 0, 0, RTS, RTS, bufM);
    lights.forEach(l => l.visible = true); scene.environment = env0; for (const [o, mt] of saved) o.material = mt;
    scene.remove(g3);
    const id = tctx.createImageData(RTS, RTS), d = id.data;
    if (!ENC_LUT) { ENC_LUT = new Float32Array(ENC_N + 2); for (let k = 0; k < ENC_LUT.length; k++) ENC_LUT[k] = enc(k / ENC_S) * 255; }   // PERF3: tone map + sRGB once per level, not three Math.pow per pixel (about 10 ms of main thread per icon)
    const encF = v => { const f = v * ENC_S; if (!(f < ENC_N)) return ENC_LUT[ENC_N]; const k = f | 0, r = f - k; return ENC_LUT[k] + (ENC_LUT[k + 1] - ENC_LUT[k]) * r; };
    for (let y = 0; y < RTS; y++) for (let x = 0; x < RTS; x++) {
      const si = ((RTS - 1 - y) * RTS + x) * 4, di = (y * RTS + x) * 4, a = bufM[si] / 255;
      if (a < 0.004) { d[di + 3] = 0; continue; }
      const ia = 1 / a; d[di] = encF(bufC[si] * ia); d[di + 1] = encF(bufC[si + 1] * ia); d[di + 2] = encF(bufC[si + 2] * ia); d[di + 3] = a * 255;
    }
    tctx.putImageData(id, 0, 0);
    const out = document.createElement('canvas'); out.width = out.height = ICON; const o2 = out.getContext('2d'); o2.imageSmoothingQuality = 'high';
    const gc = GLOW[info.tier] || (key === 'm:brain' ? 0xff7a9e : key === 'gold' ? 0xffc933 : 0);
    if (gc) { const hex = '#' + gc.toString(16).padStart(6, '0'), a = (TIER_ORDER.indexOf(info.tier) >= 2 || !info.tier) ? 0.55 : 0.28, gr = o2.createRadialGradient(ICON / 2, ICON / 2, 0, ICON / 2, ICON / 2, ICON * 0.5); gr.addColorStop(0, hex + Math.round(a * 255).toString(16).padStart(2, '0')); gr.addColorStop(0.6, hex + '22'); gr.addColorStop(1, hex + '00'); o2.fillStyle = gr; o2.fillRect(0, 0, ICON, ICON); }
    o2.drawImage(tmp, 0, 0, ICON, ICON);
    icons.set(key, out);
  };
  bakeJob = { promise: null };
  bakeJob.promise = new Promise(resolve => {
    let i = 0, ready = false;
    const step = () => {
      const t0 = performance.now(), done = [];
      const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevTM = renderer.toneMapping, prevAuto = renderer.info.autoReset, prevXR = renderer.xr.enabled;
      renderer.info.autoReset = false; renderer.toneMapping = THREE.NoToneMapping; renderer.xr.enabled = false;
      try {
        if (!ready) { setup(); ready = true; }
        while (i < keys.length && (done.length === 0 || performance.now() - t0 < budget)) { const k = keys[i++]; try { one(k); done.push(k); } catch (e) { console.warn('[GKART] bake failed for', k, e); } }
      } catch (e) { console.warn('[GKART] bake aborted', e); i = keys.length; }
      renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); renderer.toneMapping = prevTM; renderer.info.autoReset = prevAuto; renderer.xr.enabled = prevXR;
      if (done.length) window.dispatchEvent(new CustomEvent('gkart-icons', { detail: { keys: done } }));
      if (i < keys.length) setTimeout(step, gap);
      else { try { rt && rt.dispose(); rtM && rtM.dispose(); env && env.dispose(); } catch (e) {} GKART.bakeMs = performance.now() - t00; window.dispatchEvent(new CustomEvent('gkart-baked', { detail: { count: icons.size } })); resolve(icons.size); }
    };
    setTimeout(step, opts.delay ?? 0);
  });
  return bakeJob.promise;
}
const icon = key => { const k = canon(key); return k ? icons.get(k) || null : null; };

// ---------- contact sheet (debug): all baked icons in a grid with names ----------
function sheet(opts = {}) {
  const keys = opts.keys || allKeys().filter(k => icons.has(k)), cell = opts.cell || 128, cols = opts.cols || 8, lab = 16, rows = Math.ceil(keys.length / cols);
  const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * (cell + lab); const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#cfcac0'; g.fillRect(0, 0, c.width, c.height); g.font = '600 11px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  keys.forEach((k, i) => {
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + lab), ic = icons.get(k); g.fillStyle = (i + Math.floor(i / cols)) & 1 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.12)'; g.fillRect(x, y, cell, cell + lab);
    if (ic) g.drawImage(ic, x, y, cell, cell);
    const it = infoOf(k); g.fillStyle = '#2a2622'; g.fillText((it && it.name || k) + (it && it.tier ? ' · ' + it.tier[0].toUpperCase() : ''), x + cell / 2, y + cell + lab / 2 - 1, cell - 4);
  });
  return c;
}
function showSheet(opts) {
  const old = document.getElementById('gkart-sheet'); if (old) old.remove();
  const d = document.createElement('div'); d.id = 'gkart-sheet'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#cfcac0;overflow:auto;display:flex;justify-content:center;align-items:flex-start';
  const c = sheet(opts); c.style.cssText = 'max-width:100%;height:auto'; d.appendChild(c); d.onclick = () => d.remove(); document.body.appendChild(d); return d;
}

const GKART = window.GKART = { model, bake, icon, sheet, showSheet, canon, keys: allKeys, drawCalls, bakeMs: 0, ICON, tune, count: () => icons.size };
export default GKART;

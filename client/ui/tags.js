// Goblin name tags and health bars. Two shared atlas canvases (one for names, one for bar fill steps) replace the
// per-goblin text/bar textures: every tag texture below is a view onto ONE canvas image, so the GPU holds two uploads in total.
// Tags clamp to a readable on-screen size, fade up close, and ignore tone mapping so bloom leaves them alone.
import * as THREE from 'three';

const NAME_W = 512, NAME_H = 64, NAME_ROWS = 8;       // 512 x 512 atlas, one row per distinct name
const BAR_W = 128, BAR_H = 16, BAR_STEPS = 25;        // 128 x 512 atlas, row k = fill k/24
const FONT = '"Barlow Condensed","Arial Narrow",Arial,sans-serif';

function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const nameCv = mkCanvas(NAME_W, NAME_W), barCv = mkCanvas(BAR_W, 512);
const nameAtlas = new THREE.CanvasTexture(nameCv), barAtlas = new THREE.CanvasTexture(barCv);
for (const t of [nameAtlas, barAtlas]) { t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.SRGBColorSpace; }

const rows = new Map();   // name + colour -> { text, color, row, tex }
function drawName(text, color, row) {
  const g = nameCv.getContext('2d'), y = row * NAME_H;
  g.clearRect(0, y, NAME_W, NAME_H);
  g.font = '600 46px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (g.letterSpacing !== undefined) g.letterSpacing = '3px';
  g.lineJoin = 'round'; g.lineWidth = 8; g.strokeStyle = 'rgba(8,6,6,.85)'; g.strokeText(text.toUpperCase(), NAME_W / 2, y + NAME_H / 2 + 2);
  g.fillStyle = color; g.fillText(text.toUpperCase(), NAME_W / 2, y + NAME_H / 2 + 2);
}
function drawBars() {
  const g = barCv.getContext('2d'); g.clearRect(0, 0, BAR_W, 512);
  for (let k = 0; k < BAR_STEPS; k++) {
    const y = k * BAR_H, f = k / (BAR_STEPS - 1);
    g.fillStyle = 'rgba(8,6,6,.8)'; g.beginPath(); g.roundRect(1, y + 3, BAR_W - 2, BAR_H - 6, 5); g.fill();
    if (f > 0) { g.fillStyle = f > 0.5 ? '#7fcf6a' : f > 0.25 ? '#e0b030' : '#e0503a'; g.beginPath(); g.roundRect(3, y + 5, Math.max(6, (BAR_W - 6) * f), BAR_H - 10, 3); g.fill(); }
  }
  barAtlas.needsUpdate = true;
}
function view(atlas, repeatY, offsetY) {   // a Texture sharing the atlas image, showing one row
  const t = atlas.clone(); t.repeat.set(1, repeatY); t.offset.set(0, offsetY); t.needsUpdate = true; return t;
}
drawBars();
const barTex = Array.from({ length: BAR_STEPS }, (_, k) => view(barAtlas, BAR_H / 512, 1 - (k + 1) * BAR_H / 512));
const barMat = barTex.map(map => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
const isBarMat = new Set(barMat);

let fontsDone = false;
if (document.fonts && document.fonts.load) document.fonts.load('600 46px "Barlow Condensed"').then(() => {
  fontsDone = true; for (const r of rows.values()) drawName(r.text, r.color, r.row);
  nameAtlas.needsUpdate = true; for (const r of rows.values()) r.tex.needsUpdate = true;
}).catch(() => {});

export function nameTag(text, color) {   // -> Sprite (own material for its fade, shared atlas texture)
  const key = text + '|' + color; let r = rows.get(key);
  if (!r) {
    const row = rows.size % NAME_ROWS;
    r = { text, color, row, tex: view(nameAtlas, NAME_H / NAME_W, 1 - (row + 1) * NAME_H / NAME_W) }; rows.set(key, r);
    drawName(text, color, row); nameAtlas.needsUpdate = true; r.tex.needsUpdate = true;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: r.tex, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  sp.renderOrder = 5; sp.userData.tagW = 1.6; sp.userData.tagH = 0.2; sp.scale.set(1.6, 0.2, 1); return sp;
}
export function healthBar() {
  const sp = new THREE.Sprite(barMat[BAR_STEPS - 1]); sp.renderOrder = 5; sp.userData.tagW = 0.8; sp.userData.tagH = 0.1; sp.scale.set(0.8, 0.1, 1); sp.visible = false; return sp;
}
export function setBar(sp, frac) {   // picks the shared material for this fill; returns false at full health (the caller hides the bar)
  const k = Math.max(0, Math.min(BAR_STEPS - 1, Math.round(frac * (BAR_STEPS - 1)))); sp.material = barMat[k]; return k < BAR_STEPS - 1;
}
// Keep a tag readable: constant on-screen size between 4 m and 10 m (it scales with distance outside that), fade out within 3 m and beyond 30 m.
export function fit(sp, dist, on = true) {
  const f = dist < 4 ? dist / 4 : dist > 10 ? dist / 10 : 1, d = sp.userData;
  sp.scale.set(d.tagW * f, d.tagH * f, 1);
  const a = Math.min(1, Math.max(0, (dist - 1.2) / 1.8), Math.max(0, (34 - dist) / 4));
  if (!isBarMat.has(sp.material) && sp.material.opacity !== a) sp.material.opacity = a;
  sp.visible = on && a > 0.02;
}
export function disposeTag(sp) { if (sp && sp.material && !isBarMat.has(sp.material)) sp.material.dispose(); }   // the texture stays: it is a shared atlas view
export const _debug = { get names() { return rows.size; }, get fontsDone() { return fontsDone; }, nameAtlas, barAtlas };

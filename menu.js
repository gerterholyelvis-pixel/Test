// Goblin King title screen, settings, controls and the goblin roulette wheel. Needs window.GK (game.js) and window.THREE.
(() => {
const GK = window.GK, THREE = window.THREE;
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const DEFAULTS = { sens: 1, fov: 75, scale: 1, invertY: false, tags: true, fx: true, fsStart: false, gfx: 'high' };
Object.assign(DEFAULTS, GK.feelDefaults || {});   // FEEL: vol, sfx, amb, bob (feel.js)
const SKIN = ['#9bd45a', '#6dbb44', '#3f8a36', '#4cb8a6', '#a9cc34'];
const ODDS = [30, 30, 30, 9, 1];
const FLAVOR = [
  'Tiny, twitchy and easy to overlook. Stay low, stay quick.',
  'A sturdy brawler of the horde. Dependable and mean.',
  'Hulking, loud and hard to ignore. Everyone gets out of your way.',
  'Robed and rare. The horde whispers of your spells.',
  'One in a hundred. Every goblin in the cave kneels to you.'];
const SLOT = [0, 3, 1, 4, 2];            // wheel slot -> goblin type (spreads the colours around)
const A = TAU / 5;
const body = document.body;

// ---------- settings ----------
const KEY = 'gk.settings';
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') for (const k in DEFAULTS) if (typeof s[k] === typeof DEFAULTS[k]) GK.settings[k] = s[k]; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(GK.settings)); } catch (e) {} };
const ctl = { sens: $('s-sens'), fov: $('s-fov'), scale: $('s-scale') };
const fmt = { sens: v => (+v).toFixed(2) + 'x', fov: v => Math.round(v) + '°', scale: v => Math.round(v * 100) + '%' };
// FEEL-BEGIN audio sliders and the head-bob switch
Object.assign(ctl, { vol: $('s-vol'), sfx: $('s-sfx'), amb: $('s-amb') });
const pct = v => Math.round(v * 100) + '%'; Object.assign(fmt, { vol: pct, sfx: pct, amb: pct });
GK.feelSync = () => { $('s-bob').checked = GK.settings.bob !== false; };
$('s-bob').onchange = e => { GK.settings.bob = e.target.checked; save(); };
// FEEL-END
function syncUI() {
  for (const k in ctl) { ctl[k].value = GK.settings[k]; $('o-' + k).textContent = fmt[k](GK.settings[k]); const p = (ctl[k].value - ctl[k].min) / (ctl[k].max - ctl[k].min); ctl[k].style.setProperty('--p', (p * 100) + '%'); }
  $('s-inv').checked = GK.settings.invertY; $('s-tags').checked = GK.settings.tags; $('s-fx').checked = GK.settings.fx; GK.feelSync && GK.feelSync(); fsSync();   // FULLSCREEN
  if (!['low', 'medium', 'high', 'ultra'].includes(GK.settings.gfx)) GK.settings.gfx = DEFAULTS.gfx; $('s-gfx').value = GK.settings.gfx;
}
for (const k in ctl) ctl[k].addEventListener('input', () => { GK.settings[k] = +ctl[k].value; syncUI(); GK.applySettings(); save(); });
$('s-inv').onchange = e => { GK.settings.invertY = e.target.checked; GK.applySettings(); save(); };
$('s-tags').onchange = e => { GK.settings.tags = e.target.checked; GK.applySettings(); save(); };
$('s-fx').onchange = e => { GK.settings.fx = e.target.checked; GK.applySettings(); save(); };
// FULLSCREEN-BEGIN (fullscreen toggle, title-screen button, F key, 'start in fullscreen' option)
const fsEl = document.documentElement;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function fsSet(on) {   // must run inside a user gesture (click / keydown)
  try {
    if (on && !fsOn()) { const r = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl, { navigationUI: 'hide' }); r && r.catch && r.catch(() => fsSync()); }
    else if (!on && fsOn()) { const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); r && r.catch && r.catch(() => fsSync()); }
  } catch (e) { fsSync(); }
}
function fsSync() {
  const on = fsOn(), c = $('s-fs'), b = $('fsbtn'), o = $('s-fsstart');
  if (c) c.checked = on; if (o) o.checked = !!GK.settings.fsStart;
  if (b) { b.classList.toggle('on', on); b.title = b.dataset.tip = on ? 'Exit fullscreen' : 'Fullscreen'; b.setAttribute('aria-label', b.dataset.tip); b.setAttribute('aria-pressed', on); }
}
function fsChanged() {
  fsSync(); GK.applySettings();   // resize renderer, composer and camera to the new window size
  if (GK.mode === 'play' && fsOn() && GK.requestLock && !GK.lockOk() && navigator.userActivation && navigator.userActivation.isActive) GK.requestLock();   // entering by click/key: end up locked. Leaving (Esc) is left to the browser; the game shows 'Click to resume'
}
document.addEventListener('fullscreenchange', fsChanged); document.addEventListener('webkitfullscreenchange', fsChanged);
$('s-fs').onchange = e => fsSet(e.target.checked);
$('s-fsstart').onchange = e => { GK.settings.fsStart = e.target.checked; save(); };
$('fsbtn').onclick = e => { fsSet(!fsOn()); e.currentTarget.blur(); };
addEventListener('keydown', e => {   // F in play (no other handler in game.js / menu.js uses it)
  if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey && GK.mode === 'play') { e.preventDefault(); fsSet(!fsOn()); }
});
GK.fullscreen = { on: fsOn, set: fsSet };
// FULLSCREEN-END
$('s-gfx').onchange = e => { try { localStorage.setItem('gk.gfxAuto', 'user'); } catch (er) {} GK.settings.gfx = e.target.value; GK.settings.fx = e.target.value !== 'low'; syncUI(); GK.applySettings(); save(); };   // the preset also switches post effects (Low = none)
$('s-reset').onclick = () => { Object.assign(GK.settings, DEFAULTS); syncUI(); GK.applySettings(); save(); };
syncUI(); GK.applySettings();

// ---------- panels ----------
function show(name) {
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('on', p.id === 'p-' + name);
  if (name === 'chars') renderChars(); if (name === 'inv') renderInv();
  const f = { main: 'b-start', settings: 's-back', controls: 'c-back', chars: 'ch-back', inv: 'inv-back' }[name];
  setTimeout(() => { const first = name === 'chars' && document.querySelector('#chars-list .cplay'); const el = first || $(f); el && el.focus({ preventScroll: true }); }, 30);
  if (name === 'main') $('b-start').focus();
  curPanel = name; document.querySelector('#menu .col').classList.toggle('sub', name !== 'main'); $('menu').classList.toggle('sub', name !== 'main');
  document.querySelector('#menu .col').classList.toggle('wide', name === 'chars' || name === 'inv'); document.querySelector('#menu .col').classList.toggle('xwide', name === 'settings' || name === 'controls'); tip(null);
}
let curPanel = 'main';
$('b-settings').onclick = () => show('settings'); $('b-controls').onclick = () => show('controls');
$('b-chars').onclick = () => show('chars'); $('b-inv').onclick = () => show('inv');
$('s-back').onclick = $('c-back').onclick = $('ch-back').onclick = $('inv-back').onclick = () => show('main');

// ---------- characters + inventory panels ----------
function headCanvas(type, size) {   // goblin portrait using the wheel's head drawing
  const c = document.createElement('canvas'), d = Math.min(devicePixelRatio || 1, 2);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); g.scale(d, d); g.translate(size / 2, size * (type === 3 ? 0.62 : type === 4 ? 0.6 : 0.5));
  drawHead(g, type, size * (type === 3 ? 0.2 : type === 4 ? 0.26 : 0.29)); return c;
}
function trophyCanvas(size) {
  const c = document.createElement('canvas'), d = Math.min(devicePixelRatio || 1, 2);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); g.scale(d * size, d * size);
  const gr = g.createLinearGradient(0, 0, 1, 1); gr.addColorStop(0, '#fff0a0'); gr.addColorStop(.5, '#f5c451'); gr.addColorStop(1, '#a8741a');
  g.fillStyle = gr; g.strokeStyle = '#4a2c05'; g.lineWidth = 0.04; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(.22, .1); g.lineTo(.78, .1); g.quadraticCurveTo(.78, .62, .5, .66); g.quadraticCurveTo(.22, .62, .22, .1); g.closePath(); g.fill(); g.stroke();
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(.5 + s * .28, .16); g.quadraticCurveTo(.5 + s * .46, .16, .5 + s * .42, .32); g.quadraticCurveTo(.5 + s * .38, .45, .5 + s * .24, .46); g.lineWidth = 0.05; g.stroke(); }
  g.lineWidth = 0.04; g.fillRect(.45, .64, .1, .16); g.fillRect(.28, .8, .44, .1); g.strokeRect(.28, .8, .44, .1);
  return c;
}
function fixedWins(c) { return Math.max(0, c.wins | 0); }
function renderChars() {
  const box = $('chars-list'); box.textContent = '';
  let list = []; try { list = (window.GKSAVE ? GKSAVE.characters() : []).slice(); } catch (e) {}
  list.sort((a, b) => fixedWins(b) - fixedWins(a) || (b.lastWin || 0) - (a.lastWin || 0));
  $('chars-note').style.display = list.length ? '' : 'none';
  if (!list.length) { const e = document.createElement('div'); e.className = 'cempty'; e.textContent = 'No saved characters yet. Win a run to keep your goblin.'; box.appendChild(e); box.style.display = 'block'; return; }
  box.style.display = '';
  for (const c of list) {
    const card = document.createElement('div'); card.className = 'ccard';
    card.appendChild(headCanvas(c.goblin, 56));
    const info = document.createElement('div'); info.className = 'cinfo';
    const n = document.createElement('div'); n.className = 'cname'; n.textContent = c.name; info.appendChild(n);
    const t = document.createElement('div'); t.className = 'ctype'; t.textContent = GK.NAMES[c.goblin] || 'Goblin'; info.appendChild(t);
    const w = document.createElement('div'); w.className = 'cwins'; w.appendChild(trophyCanvas(20));
    const l = document.createElement('span'); l.textContent = 'Victories'; const b = document.createElement('b'); b.textContent = fixedWins(c); w.append(l, b); info.appendChild(w);
    card.appendChild(info);
    const p = document.createElement('button'); p.className = 'cplay'; p.textContent = 'Play'; p.onclick = () => startGame({ goblin: c.goblin, wins: fixedWins(c), charId: c.id });
    card.appendChild(p); box.appendChild(card);
  }
}
const itipEl = $('itip');
const TCOL = { common: '#b9b4a4', uncommon: '#6fdc6a', rare: '#5aa8ff', mythic: '#c06bff', legendary: '#ffb02e', transcendent: '#8ff6ff' };
function tip(it, e) {
  if (!it) { itipEl.style.display = 'none'; return; }
  itipEl.textContent = ''; const b = document.createElement('b'); b.textContent = it.name; const s = document.createElement('span');
  const tn = it.tierN != null ? it.tierN : null, tname = it.tier ? it.tier[0].toUpperCase() + it.tier.slice(1) : '';
  const st = it.attack != null ? 'Attack ' + it.attack : it.health != null ? 'Health ' + it.health : (it.desc || '');
  s.textContent = [tn != null ? 'Tier ' + tn + (tname ? ' \u00b7 ' + tname : '') : '', st].filter(Boolean).join(' \u00b7 ');
  if (it.tier && TCOL[it.tier]) b.style.color = TCOL[it.tier];
  itipEl.append(b, s);
  itipEl.style.display = 'block';
  const w = itipEl.offsetWidth, h = itipEl.offsetHeight;
  itipEl.style.left = Math.max(4, Math.min(innerWidth - w - 4, e.clientX + 14)) + 'px'; itipEl.style.top = Math.max(4, Math.min(innerHeight - h - 4, e.clientY + 14)) + 'px';
}
function itemInfo(raw) {
  const IT = (window.GKITEMS && GKITEMS.ITEMS) || {};
  const key = typeof raw === 'string' ? raw : raw && (raw.key || raw.id);
  try { const i = GKITEMS.info(key); if (i) return i; } catch (e) {}
  if (IT[key]) return IT[key];
  const nm = typeof raw === 'string' ? raw : raw && raw.name;
  for (const k in IT) if (IT[k].name === nm) return IT[k];
  return raw && typeof raw === 'object' ? raw : { key, name: String(raw), type: 'weapon' };
}
const PCOL = { wood: '#8a5a2b', metal: '#a9b4be', leather: '#7a4a2a', cloth: '#b86adf', gold: '#f5c451', bone: '#eee6cf', gem: '#e0344f', string: '#d8d2c0', crystal: '#66e0ff' };
function renderParts() {
  const box = $('inv-parts'); box.textContent = '';
  let ps = {}; try { ps = GKSAVE.parts() || {}; } catch (e) {}
  const list = ((window.GKITEMS && GKITEMS.PARTS) || []).filter(p => ps[p.key] > 0);
  box.style.display = list.length ? '' : 'none';
  for (const p of list) {
    const d = document.createElement('div'); d.className = 'part'; d.title = p.name;
    const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    g.fillStyle = PCOL[p.key] || '#999'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1.5; g.beginPath();
    if (p.key === 'gem' || p.key === 'crystal') { g.moveTo(8, 1); g.lineTo(14, 7); g.lineTo(8, 15); g.lineTo(2, 7); g.closePath(); } else if (p.key === 'cloth' || p.key === 'leather') g.rect(2, 3, 12, 10); else g.arc(8, 8, 6, 0, 6.3);
    g.fill(); g.stroke();
    const t = document.createElement('span'); t.textContent = p.name + ' ' + ps[p.key]; d.append(c, t); box.appendChild(d);
  }
}
function renderInv() {
  renderParts();
  const grid = $('inv-grid'); grid.textContent = '';
  let st = []; try { st = (window.GKSAVE ? GKSAVE.stash() : []).filter(Boolean); } catch (e) {}
  $('inv-sum').textContent = st.length ? st.length + (st.length === 1 ? ' item' : ' items') + ' brought back' : 'Stash';
  $('inv-empty').style.display = st.length ? 'none' : '';
  const total = Math.max(48, Math.ceil(st.length / 8) * 8);
  for (let i = 0; i < total; i++) {
    const s = document.createElement('div'); s.className = 'islot';
    if (i < st.length) {
      const it = itemInfo(st[i]); s.classList.add('full');
      if (it.tier && TCOL[it.tier]) { s.style.borderColor = TCOL[it.tier] + '66'; s.dataset.t = it.tier; }
      s.appendChild(window.GKICONS ? GKICONS.canvas(it.key, 40) : document.createTextNode('?'));
      if (it.tierN != null) { const bd = document.createElement('i'); bd.className = 'tb'; bd.textContent = it.tierN; bd.style.color = TCOL[it.tier] || '#ddd'; s.appendChild(bd); }
      s.onmouseenter = s.onmousemove = e => tip(it, e); s.onmouseleave = () => tip(null);
    }
    grid.appendChild(s);
  }
}
addEventListener('keydown', e => {
  if (GK.mode === 'play' || !$('menu') || $('menu').classList.contains('gone')) return;
  if (e.key === 'Escape' && curPanel !== 'main') { show('main'); e.preventDefault(); }
  if (curPanel === 'main' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const b = [...document.querySelectorAll('#p-main .mbtn')], i = b.indexOf(document.activeElement);
    b[(i + (e.key === 'ArrowDown' ? 1 : -1) + b.length) % b.length].focus(); e.preventDefault();
  }
});
$('b-start').focus();

// ---------- 3D title scene ----------
const mscene = new THREE.Scene();
mscene.background = new THREE.Color(0x07060a);
mscene.fog = new THREE.FogExp2(0x07060a, 0.045);
if (GK.scene && GK.scene.environment) mscene.environment = GK.scene.environment;
if ('environmentIntensity' in mscene) mscene.environmentIntensity = 0.35;
const mcam = new THREE.PerspectiveCamera(36, 1, 0.1, 80);

function cTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// glossy floor + reflection
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c0a0c, metalness: 0.65, roughness: 0.28, transparent: true, opacity: 0.8, envMapIntensity: 0.6 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(15, 96), floorMat); floor.rotation.x = -Math.PI / 2; mscene.add(floor);
// runic rings texture
const ringTex = cTex(1024, 1024, (g, w, h) => {
  g.translate(w / 2, h / 2); g.strokeStyle = '#f5c451'; g.lineCap = 'round';
  const circ = (r, lw, a) => { g.globalAlpha = a; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  circ(498, 3, .9); circ(486, 1.5, .6); circ(380, 2, .55); circ(372, 6, .35); circ(260, 2, .6); circ(150, 1.5, .5);
  for (let i = 0; i < 120; i++) { const a = i / 120 * TAU, l = i % 5 === 0 ? 26 : 12; g.globalAlpha = i % 5 === 0 ? .9 : .45; g.lineWidth = i % 5 === 0 ? 3 : 1.5; g.beginPath(); g.moveTo(Math.cos(a) * 486, Math.sin(a) * 486); g.lineTo(Math.cos(a) * (486 - l), Math.sin(a) * (486 - l)); g.stroke(); }
  g.globalAlpha = .55; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 5; i++) { const a = (i * 2 % 5) / 5 * TAU - Math.PI / 2; const x = Math.cos(a) * 372, y = Math.sin(a) * 372; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  g.globalAlpha = .8; for (let i = 0; i < 5; i++) { const a = i / 5 * TAU - Math.PI / 2; g.beginPath(); g.arc(Math.cos(a) * 372, Math.sin(a) * 372, 12, 0, TAU); g.stroke(); }
  for (let i = 0; i < 40; i++) { const a = i / 40 * TAU + .03; g.globalAlpha = .5; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 440, a, a + .05); g.stroke(); g.beginPath(); g.arc(0, 0, 320, a + .06, a + .12); g.stroke(); }
});
const rings = new THREE.Mesh(new THREE.CircleGeometry(7.2, 96), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, fog: false }));
rings.rotation.x = -Math.PI / 2; rings.position.y = 0.012; mscene.add(rings);
const rings2 = new THREE.Mesh(new THREE.CircleGeometry(12, 96), new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.12, fog: false }));
rings2.rotation.x = -Math.PI / 2; rings2.position.y = 0.01; mscene.add(rings2);

// lights
mscene.add(new THREE.AmbientLight(0x2a2438, 1.1));
const key = new THREE.SpotLight(0xffe2a8, 90, 30, 0.5, 0.7, 1.4); key.position.set(0, 9, 4); key.target.position.set(0, 1, -1); mscene.add(key, key.target);
const rimR = new THREE.PointLight(0xff3d22, 70, 22, 1.6); rimR.position.set(-6, 3, -5); mscene.add(rimR);
const rimT = new THREE.PointLight(0x2fe0bf, 60, 22, 1.6); rimT.position.set(6.5, 2.6, -4); mscene.add(rimT);
const rimV = new THREE.PointLight(0x8a4dff, 35, 16, 1.6); rimV.position.set(-3.2, 2.2, 3.5); mscene.add(rimV);
const front = new THREE.PointLight(0xffb870, 14, 14, 1.6); front.position.set(2.5, 1.5, 6); mscene.add(front);

// light shaft + back glow
const shaftTex = cTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,230,170,0.0)'); gr.addColorStop(.25, 'rgba(255,215,140,.55)'); gr.addColorStop(1, 'rgba(255,200,110,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 4.2, 11, 40, 1, true), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.2, fog: false }));
shaft.position.set(0, 5.5, -2.2); mscene.add(shaft);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GK.glowTex, color: 0xff5a22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, fog: false }));
glow.scale.set(16, 10, 1); glow.position.set(0, 3.2, -7); mscene.add(glow);
const glow2 = glow.clone(); glow2.material = glow.material.clone(); glow2.material.color.set(0xffc060); glow2.material.opacity = 0.3; glow2.scale.set(7, 7, 1); glow2.position.set(0, 3.5, -4.2); mscene.add(glow2);

// embers
const NP = 360, pPos = new Float32Array(NP * 3), pSeed = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3);
for (let i = 0; i < NP; i++) {
  const a = Math.random() * TAU, r = 1 + Math.random() * 11;
  pPos[i * 3] = Math.cos(a) * r; pPos[i * 3 + 1] = Math.random() * 9; pPos[i * 3 + 2] = Math.sin(a) * r - 1;
  pSeed[i * 3] = Math.random() * 6; pSeed[i * 3 + 1] = 0.25 + Math.random() * 0.7; pSeed[i * 3 + 2] = Math.random();
  const hot = Math.random() < .7; pCol[i * 3] = 1; pCol[i * 3 + 1] = hot ? .45 + Math.random() * .25 : .8; pCol[i * 3 + 2] = hot ? .1 : .5;
}
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ map: GK.glowTex, size: 0.34, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9, sizeAttenuation: true, fog: false }));
pts.frustumCulled = false; mscene.add(pts);

// goblin line-up: king centre back, wizard + big flank, brawler + small in front
const LINE = [
  { t: 4, x: 0, z: -2.6, ry: 0, s: 1.15 }, { t: 3, x: -2.7, z: -1.8, ry: 0.45, s: 1 }, { t: 2, x: 2.8, z: -1.6, ry: -0.5, s: 1 },
  { t: 1, x: -1.7, z: 1.3, ry: 0.32, s: 1 }, { t: 0, x: 1.75, z: 1.6, ry: -0.3, s: 1 }];
const rigs = [];
for (const L of LINE) {
  let g = null; try { g = GK.build(L.t); } catch (e) { console.warn('build failed', e); }
  const rig = new THREE.Group(); rig.position.set(L.x, 0, L.z); rig.scale.setScalar(L.s);
  if (g) {
    g.traverse(o => { if (o.isSprite) o.visible = false; });   // hide name tags
    g.position.set(0, 0, 0); rig.add(g);
    const m = g.clone(true); m.scale.y = -1; rig.add(m);   // mirrored copy shows through the glossy floor
    rig.userData = { g, m };
  }
  rigs.push({ rig, L, ph: Math.random() * 6 }); mscene.add(rig);
}

// ---------- title render ----------
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });
let W = 0, H = 0, T0 = 0;
function titleRender(now, dt) {
  const t = now / 1000, r = GK.renderer;
  if (innerWidth !== W || innerHeight !== H) {
    W = innerWidth; H = innerHeight; mcam.aspect = W / H;
    mcam.userData.wide = W / H > 1.25;
    if (mcam.userData.wide) mcam.setViewOffset(W, H, -W * 0.2, 0, W, H); else mcam.clearViewOffset();
    mcam.updateProjectionMatrix();
  }
  mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 2.5); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 2.5);
  // slow dolly + sway, plus parallax
  const asp = W / H, back = asp < 1.25 ? (1.25 / asp - 1) * 7 + 2 : 0;
  const dolly = 1.5 * (0.5 + 0.5 * Math.sin(t * 0.13));
  mcam.position.set(Math.sin(t * 0.17) * 1.6 + mouse.sx * 1.3, 2.1 + mouse.sy * -0.45 + Math.sin(t * 0.21) * 0.15, 13.4 - dolly + back);
  mcam.lookAt(0 + mouse.sx * 0.3, 1.35, -0.8);
  for (const o of rigs) {
    const b = o.ph + t;
    o.rig.position.y = Math.sin(b * 1.3) * 0.045;
    o.rig.rotation.y = o.L.ry + Math.sin(b * 0.5) * 0.28 + mouse.sx * 0.25;
  }
  key.intensity = 85 + Math.sin(t * 1.7) * 6; rimR.intensity = 65 + Math.sin(t * 2.3 + 1) * 12; rimT.intensity = 55 + Math.sin(t * 1.9) * 8;
  rings.rotation.z = t * 0.05; rings2.rotation.z = -t * 0.03; shaft.material.opacity = 0.17 + Math.sin(t * .8) * .04;
  const p = pGeo.attributes.position.array;
  for (let i = 0; i < NP; i++) {
    p[i * 3 + 1] += pSeed[i * 3 + 1] * dt * 0.7; p[i * 3] += Math.sin(t * .6 + pSeed[i * 3]) * dt * .25; p[i * 3 + 2] += Math.cos(t * .5 + pSeed[i * 3]) * dt * .15;
    if (p[i * 3 + 1] > 9) p[i * 3 + 1] = 0;
  }
  pGeo.attributes.position.needsUpdate = true;
  r.render(mscene, mcam);
}

// ---------- wheel ----------
const wc = $('wheel'), wx = wc.getContext('2d');
let S = 0, dpr = 1, staticC = null, wheelGo = false;
function drawHead(g, type, s, glow) {  // goblin head, centred, radius ~ s
  g.save();
  const sc = [0.8, 0.95, 1.12, 0.95, 1][type];
  g.scale(sc, sc);
  g.lineJoin = 'round';
  const skin = SKIN[type], dark = 'rgba(0,0,0,.55)';
  const ear = (sx) => { g.beginPath(); g.moveTo(sx * s * .62, -s * .12); g.lineTo(sx * s * 1.42, -s * .5 - (type === 0 ? s * .1 : 0)); g.lineTo(sx * s * .7, s * .42); g.closePath(); g.fillStyle = skin; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .07; g.stroke(); g.beginPath(); g.moveTo(sx * s * .72, 0); g.lineTo(sx * s * 1.2, -s * .36); g.lineTo(sx * s * .76, s * .26); g.fillStyle = 'rgba(255,120,120,.28)'; g.fill(); };
  ear(-1); ear(1);
  if (type === 3) { }
  const hw = type === 2 ? 1.0 : .88, hh = type === 2 ? .88 : .94;
  g.beginPath(); g.ellipse(0, 0, s * hw, s * hh, 0, 0, TAU); const gr = g.createRadialGradient(-s * .3, -s * .4, s * .1, 0, 0, s * 1.1); gr.addColorStop(0, '#fff8'); gr.addColorStop(.01, skin); gr.addColorStop(1, skin); g.fillStyle = skin; g.fill();
  const sh = g.createRadialGradient(-s * .3, -s * .35, s * .1, 0, 0, s * 1.05); sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = sh; g.fill();
  g.strokeStyle = dark; g.lineWidth = s * .08; g.stroke();
  // brow + eyes
  const ey = -s * .12, ex = s * .38;
  for (const sx of [-1, 1]) {
    g.beginPath(); g.ellipse(sx * ex, ey, s * .24, s * .17, sx * .25, 0, TAU); g.fillStyle = type === 3 ? '#9ff' : type === 4 ? '#ffd24a' : '#f3e86a'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .05; g.stroke();
    g.beginPath(); g.arc(sx * ex * .85, ey + s * .01, s * .075, 0, TAU); g.fillStyle = '#111'; g.fill();
    g.beginPath(); g.moveTo(sx * ex - sx * s * .34, ey - s * .3 + (type === 2 ? s * .05 : 0)); g.lineTo(sx * ex + sx * s * .02 - sx * s * .0, ey - s * .06 + s * .04); g.lineTo(sx * ex + sx * s * .3, ey - s * .22 - s * .1); g.strokeStyle = '#1a2a10'; g.lineWidth = s * .12; g.lineCap = 'round'; g.stroke();
  }
  // nose
  g.beginPath(); g.moveTo(0, -s * .05); g.lineTo(-s * .1, s * .25); g.lineTo(s * .13, s * .24); g.closePath(); g.fillStyle = 'rgba(0,0,0,.2)'; g.fill();
  // mouth
  g.beginPath(); g.moveTo(-s * .5, s * .4); g.quadraticCurveTo(0, s * .78, s * .5, s * .4); g.quadraticCurveTo(0, s * .55, -s * .5, s * .4); g.fillStyle = '#240c0c'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .05; g.stroke();
  g.fillStyle = '#f2ecd0'; for (const sx of [-.3, .3]) { g.beginPath(); g.moveTo(sx * s - s * .07, s * .46); g.lineTo(sx * s, s * .27); g.lineTo(sx * s + s * .07, s * .46); g.fill(); }
  if (type === 2) for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * .34, s * .52); g.lineTo(sx * s * .42, s * .2); g.lineTo(sx * s * .5, s * .52); g.fillStyle = '#f4efd6'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .03; g.stroke(); }
  // hats
  if (type === 3) {
    g.beginPath(); g.ellipse(0, -s * .62, s * 1.12, s * .26, 0, 0, TAU); g.fillStyle = '#4a2a8c'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .06; g.stroke();
    g.beginPath(); g.moveTo(-s * .62, -s * .66); g.quadraticCurveTo(-s * .1, -s * 1.5, s * .55, -s * 2.0); g.quadraticCurveTo(s * .52, -s * 1.5, s * .66, -s * .66); g.closePath();
    const hg = g.createLinearGradient(0, -s * 2, 0, -s * .6); hg.addColorStop(0, '#9a63ff'); hg.addColorStop(1, '#3a1d78'); g.fillStyle = hg; g.fill(); g.stroke();
    g.fillStyle = '#ffd75e'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rr = i % 2 ? s * .07 : s * .17; g.lineTo(-s * .02 + Math.cos(a) * rr, -s * 1.15 + Math.sin(a) * rr); } g.fill();
    g.fillStyle = '#ffd75e'; g.fillRect(-s * .66, -s * .78, s * 1.32, s * .1);
  }
  if (type === 4) {
    const cy = -s * .8;
    g.beginPath(); g.moveTo(-s * .75, cy + s * .35); g.lineTo(-s * .8, cy - s * .55); g.lineTo(-s * .4, cy - s * .15); g.lineTo(0, cy - s * .75); g.lineTo(s * .4, cy - s * .15); g.lineTo(s * .8, cy - s * .55); g.lineTo(s * .75, cy + s * .35); g.closePath();
    const cg = g.createLinearGradient(0, cy - s * .8, 0, cy + s * .4); cg.addColorStop(0, '#fff2a0'); cg.addColorStop(.5, '#f5c451'); cg.addColorStop(1, '#a8741a'); g.fillStyle = cg; g.fill(); g.strokeStyle = '#4a2c05'; g.lineWidth = s * .07; g.stroke();
    for (const [px, py, c] of [[0, cy - s * .75, '#ff4040'], [-s * .8, cy - s * .55, '#5ff'], [s * .8, cy - s * .55, '#5ff']]) { g.beginPath(); g.arc(px, py, s * .09, 0, TAU); g.fillStyle = c; g.fill(); }
    g.beginPath(); g.arc(0, cy + s * .05, s * .1, 0, TAU); g.fillStyle = '#e03030'; g.fill();
  }
  g.restore();
}
function buildStatic() {
  staticC = document.createElement('canvas'); staticC.width = staticC.height = Math.round(S * dpr);
  const g = staticC.getContext('2d'); g.scale(dpr, dpr); g.translate(S / 2, S / 2);
  const R = S / 2 * 0.86;
  // drop shadow + rim
  g.save(); g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = S * .04; g.beginPath(); g.arc(0, 0, R * 1.1, 0, TAU); g.fillStyle = '#000'; g.fill(); g.restore();
  const rim = g.createLinearGradient(-R, -R, R, R); rim.addColorStop(0, '#fff0b0'); rim.addColorStop(.3, '#d99a2b'); rim.addColorStop(.55, '#7a4e0f'); rim.addColorStop(.8, '#f0c25a'); rim.addColorStop(1, '#8a5a12');
  g.beginPath(); g.arc(0, 0, R * 1.1, 0, TAU); g.fillStyle = rim; g.fill();
  g.beginPath(); g.arc(0, 0, R * 1.03, 0, TAU); g.fillStyle = '#2b1a05'; g.fill();
  // segments
  const bgs = ['#2c3a1d', '#1f2b3a', '#3a2418', '#2c1d3f', '#4a3410'];
  for (let i = 0; i < 5; i++) {
    const type = SLOT[i], a0 = i * A - Math.PI / 2 - A / 2, a1 = a0 + A;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath();
    const col = ['#35502a', '#2a4a30', '#2a3f4a', '#3b2a5c', '#6a4a10'][type];
    const gr = g.createRadialGradient(0, 0, R * .1, 0, 0, R); gr.addColorStop(0, '#0d0b0a'); gr.addColorStop(.35, col); gr.addColorStop(1, shade(col, 1.35));
    g.fillStyle = gr; g.fill(); g.strokeStyle = '#e8b64a'; g.lineWidth = Math.max(2, S * .006); g.stroke();
    // content in the segment's local frame (up = -y)
    g.save(); g.rotate(i * A);
    g.save(); g.translate(0, -R * .56); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = S * .02; drawHead(g, type, S * .058); g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = S * .042; g.font = `700 ${fs}px "Barlow Condensed","Arial Narrow",Impact,sans-serif`;
    g.fillStyle = type === 4 ? '#ffe36a' : '#f4ecd2'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(GK.NAMES[type].toUpperCase(), 0, -R * .88);
    g.font = `600 ${fs * .8}px "Barlow Condensed","Arial Narrow",sans-serif`; g.fillStyle = type === 4 ? '#ffb43a' : '#9ae6d0'; g.fillText(ODDS[type] + '%', 0, -R * .88 + fs * .95);
    g.restore();
  }
  // inner ring
  g.beginPath(); g.arc(0, 0, R * .3, 0, TAU); g.strokeStyle = '#e8b64a'; g.lineWidth = S * .012; g.stroke();
}
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); const f = c => Math.min(255, Math.round(c * k)); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function sizeWheel() {
  const r = wc.getBoundingClientRect(); const s = Math.round(r.width) || 400; const d = Math.min(devicePixelRatio || 1, 2);
  if (s === S && d === dpr && staticC) return;
  S = s; dpr = d; wc.width = wc.height = Math.round(S * dpr); buildStatic();
}
addEventListener('resize', () => { if (wheelGo) sizeWheel(); });

const wh = { state: 'idle', rot: 0, speed: 0, t: 0, result: null, resolveAt: 0, rot0: 0, D: 0, T: 0, t2: 0, pw: 0, pv: 0, lastB: 0, flash: 0, land: 0, shown: false };
const VMAX = 11;
function wheelStep(now, dt) {
  if (wh.state === 'spin') {
    wh.t += dt;
    const u = Math.min(1, wh.t / 1.2); wh.speed = VMAX * u * u * (3 - 2 * u);
    wh.rot += wh.speed * dt;
    const net = wh.result == null ? 'wait' : 'ok';
    if (wh.t > 3 && net === 'wait') { $('rstat').innerHTML = 'Connecting...'; }
    if (wh.t > 8 && net === 'wait') { $('rstat').innerHTML = 'Still connecting. The server may be asleep or offline.'; $('retry').style.display = 'inline-flex'; }
    if (net === 'ok' && wh.t >= 2.5) {
      const slot = SLOT.indexOf(wh.result);
      let d = ((-slot * A - wh.rot) % TAU + TAU) % TAU; wh.D = d + TAU * 2; wh.rot0 = wh.rot; wh.T = 3 * wh.D / VMAX; wh.t2 = 0; wh.state = 'decel';
      $('rstat').innerHTML = 'The wheel is slowing...';
    }
  } else if (wh.state === 'decel') {
    wh.t2 += dt; const u = Math.min(1, wh.t2 / wh.T), q = 1 - u;
    wh.rot = wh.rot0 + wh.D * (1 - q * q * q); wh.speed = 3 * wh.D / wh.T * q * q;
    if (u >= 1) { wh.rot = wh.rot0 + wh.D; wh.speed = 0; wh.state = 'landed'; wh.land = 0; }
  } else if (wh.state === 'landed') {
    wh.land += dt;
    if (wh.land > 1.1 && !wh.shown) { wh.shown = true; wh.shownAt = performance.now(); showReveal(); }
  }
  // pointer tick
  const b = Math.floor(-wh.rot / A + 0.5);
  if (b !== wh.lastB) { wh.lastB = b; wh.pw = -Math.min(0.55, 0.16 + wh.speed * 0.04); wh.pv = 0; }
  for (let n = 0, h = Math.min(dt, 0.04); n < Math.ceil(dt / 0.04) && n < 8; n++) { wh.pv += (-320 * wh.pw - 16 * wh.pv) * h; wh.pw += wh.pv * h; }
  drawWheel(now);
}
function drawWheel(now) {
  if (!staticC) return;
  const g = wx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
  const R = S / 2 * 0.86, cx = S / 2, cy = S / 2;
  const idx = ((Math.round(-wh.rot / A) % 5) + 5) % 5, under = SLOT[idx];
  // rotating static layer
  g.save(); g.translate(cx, cy); g.rotate(wh.rot); g.scale(1 / dpr, 1 / dpr); g.drawImage(staticC, -staticC.width / 2, -staticC.height / 2); g.scale(dpr, dpr);
  if (wh.state === 'landed') {
    const k = Math.min(1, wh.land / .6), win = SLOT.indexOf(wh.result);
    for (let i = 0; i < 5; i++) {
      const a0 = i * A - Math.PI / 2 - A / 2; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a0 + A); g.closePath();
      if (i !== win) { g.fillStyle = `rgba(0,0,0,${.6 * k})`; g.fill(); }
      else { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(255,220,120,${(.18 + .17 * Math.sin(now / 120)) * k})`; g.fill(); g.globalCompositeOperation = 'source-over'; g.strokeStyle = `rgba(255,236,160,${k})`; g.lineWidth = S * .012; g.stroke(); }
    }
  }
  g.restore();
  // rim bulbs (fixed, chasing)
  const NB = 24, Rb = R * 1.065;
  for (let i = 0; i < NB; i++) {
    const a = i / NB * TAU, on = wh.state === 'landed' ? (Math.floor(now / 160) % 2 === i % 2) : ((i + Math.floor(now / (wh.state === 'spin' ? 70 : 110))) % 3 === 0);
    const x = cx + Math.cos(a) * Rb, y = cy + Math.sin(a) * Rb;
    if (on) { const gr = g.createRadialGradient(x, y, 0, x, y, S * .035); gr.addColorStop(0, 'rgba(255,240,170,.95)'); gr.addColorStop(1, 'rgba(255,170,40,0)'); g.fillStyle = gr; g.fillRect(x - S * .04, y - S * .04, S * .08, S * .08); }
    g.beginPath(); g.arc(x, y, S * .0085, 0, TAU); g.fillStyle = on ? '#fff6c8' : '#7a5a1c'; g.fill();
  }
  // hub with live readout
  const hr = R * .3;
  g.beginPath(); g.arc(cx, cy, hr * 1.04, 0, TAU); g.fillStyle = '#f0c25a'; g.fill();
  const hg = g.createRadialGradient(cx, cy - hr * .4, hr * .1, cx, cy, hr); hg.addColorStop(0, '#2a2018'); hg.addColorStop(1, '#0a0806'); g.beginPath(); g.arc(cx, cy, hr * .94, 0, TAU); g.fillStyle = hg; g.fill();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const words = GK.NAMES[under].toUpperCase().split(' '), lines = words.length > 1 ? [words.slice(0, -1).join(' '), words[words.length - 1]] : [words[0]];
  const fs = Math.min(S * .05, hr * 1.5 / Math.max(...lines.map(l => l.length)) * 1.9);
  g.font = `700 ${fs}px "Barlow Condensed","Arial Narrow",Impact,sans-serif`; g.fillStyle = under === 4 ? '#ffe36a' : '#fff1c4'; g.shadowColor = 'rgba(255,190,70,.7)'; g.shadowBlur = 8;
  lines.forEach((l, i) => g.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * fs * 1.05));
  g.shadowBlur = 0;
  // pointer
  g.save(); g.translate(cx, cy - R * 1.12); g.rotate(wh.pw);
  const ps = S * .055;
  g.beginPath(); g.moveTo(0, ps * 1.5); g.lineTo(-ps * .75, -ps * .45); g.quadraticCurveTo(0, -ps * 1.1, ps * .75, -ps * .45); g.closePath();
  const pg = g.createLinearGradient(-ps, 0, ps, 0); pg.addColorStop(0, '#ff7a45'); pg.addColorStop(.5, '#ff2d1e'); pg.addColorStop(1, '#a30d08'); g.fillStyle = pg; g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 8; g.fill(); g.shadowBlur = 0;
  g.strokeStyle = '#ffe9a0'; g.lineWidth = S * .008; g.stroke(); g.beginPath(); g.arc(0, -ps * .1, ps * .2, 0, TAU); g.fillStyle = '#ffe9a0'; g.fill();
  g.restore();
  if (wh.state !== 'landed') $('rname').textContent = GK.NAMES[under];
}

function showReveal() {
  const t = wh.result, k = $('reveal');
  $('rolling').style.display = 'none';
  $('vname').textContent = (t === 3 || t === 4 ? '' : '') + GK.NAMES[t];
  $('vflav').textContent = FLAVOR[t]; $('vodds').textContent = ODDS[t] + '% chance';
  k.classList.toggle('king', t === 4); k.classList.add('on');
}

let started = false;
function startGame(opts) {
  if (started) return; started = true;
  if (GK.settings.fsStart && (!opts || opts.type === 'click')) fsSet(true);   // FULLSCREEN: inside the Start click
  if (!opts || typeof opts !== 'object' || opts.type === 'click') opts = undefined;
  body.classList.add('rolling'); $('menu').classList.add('gone');
  const roll = $('roll'); roll.classList.add('show'); roll.getBoundingClientRect(); roll.classList.add('vis');
  wheelGo = true; sizeWheel(); queueStart();
  wh.state = 'spin'; wh.t = 0; wh.rot = Math.random() * TAU; wh.result = null; wh.shown = false;
  $('rname').textContent = 'Rolling...'; $('rstat').textContent = 'Spinning the wheel of fate';
  let p; try { p = opts ? GK.start(opts) : GK.start(); } catch (e) { console.error(e); p = new Promise(() => {}); }
  Promise.resolve(p).then(g => { wh.result = (typeof g === 'number' && g >= 0 && g < 5) ? g : 0; });
}
$('b-start').onclick = () => startGame();
try {   // 'Requeue' from the death screen (optionally with a saved character)
  if (sessionStorage.getItem('gk.requeue')) {
    const cid = sessionStorage.getItem('gk.requeueChar');
    sessionStorage.removeItem('gk.requeue'); sessionStorage.removeItem('gk.requeueChar');
    let c = null; try { if (cid != null && window.GKSAVE) c = GKSAVE.getCharacter(+cid); } catch (e) {}
    setTimeout(() => startGame(c ? { goblin: c.goblin, wins: c.wins | 0, charId: c.id } : undefined), 150);
  }
} catch (e) {}
GK.menuDebug = { addDemoSave() {
  GKSAVE.clearAll(); GKSAVE.recordWin({ goblin: 4, items: ['w:scepter', 'a:royal', 'w:axe', 'w:shadowfang', 'a:dragon', 'w:sharpstick'], parts: { wood: 5, metal: 3, gem: 2 } });
  const a = GKSAVE.recordWin({ goblin: 2, items: ['w:mace', 'a:harness'] }); GKSAVE.recordWin({ charId: a.id, goblin: 2, items: ['w:spear'] });
  GKSAVE.recordWin({ charId: a.id, goblin: 2, items: [] });
  const s = GKSAVE.load(); s.characters.push({ id: s.nextId++, goblin: 3, name: 'Mizzle', wins: 0 }); localStorage.setItem('gk.save.v1', JSON.stringify(s));
} };
$('retry').onclick = () => location.reload();
// MATCH-BEGIN (the wheel screen is the queue: "Finding goblins N/8", elapsed time, Cancel; the match start moves you into the rooms, see game.js MATCH block)
let qT0 = 0, qTimer = 0, qDone = false;
function qFmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function queueStart() {
  qT0 = performance.now(); qDone = false; $('qbox').classList.add('on'); $('qfind').textContent = 'Finding goblins'; $('qtime').textContent = '0:00';
  clearInterval(qTimer); qTimer = setInterval(() => { if (!qDone) $('qtime').textContent = qFmt(performance.now() - qT0); }, 250);
}
$('qcancel').onclick = () => { try { GK.cancelQueue && GK.cancelQueue(); } catch (e) {} setTimeout(() => location.reload(), 60); };   // back to the title with a clean connection
function hideWheel() {
  clearInterval(qTimer); body.classList.remove('menu'); $('qbox').classList.remove('on');
  $('roll').classList.add('out'); setTimeout(() => { $('roll').classList.remove('show'); wheelGo = false; }, 700);
}
// MATCH-END

GK.menu = {
  render(now, dt) {
    const rd = Math.min((now - (GK.menu._last || now)) / 1000, 0.5); GK.menu._last = now;   // wall-clock dt (game.js clamps its own to 50 ms)
    titleRender(now, Math.max(dt, Math.min(rd, 0.1))); if (wheelGo) wheelStep(now, rd);
  },
  _wheel: wh,
  /* MATCH-BEGIN */
  queue(n, size, since) { if (qDone) return; if (since > 0) qT0 = performance.now() - since; $('qfind').textContent = 'Finding goblins ' + n + '/' + size; },
  queueDone() { qDone = true; $('qfind').textContent = 'Waiting for goblins…'; $('qtime').textContent = ''; $('qcancel').style.display = 'none'; },
  ready(n, size) { if (qDone) $('qtime').textContent = n + '/' + size + ' ready'; },
  whenRevealed(cb, maxMs, holdMs = 1500) { if (!wheelGo || wh.state === 'idle') return cb(); const t0 = performance.now(), t = setInterval(() => { const now = performance.now(), late = now - t0 > maxMs; if ((wh.shown && now - (wh.shownAt || now) >= holdMs) || late) { clearInterval(t); cb(); } }, 100); },   // the goblin you rolled stays on screen for holdMs before we report ready (the server waits up to its READY_MS)   // wait until the wheel has landed and shown the goblin (but not past maxMs: the server starts the countdown 8 s after the match forms)
  hideWheel,
  /* MATCH-END */
};
window.GKHEAD = headCanvas;   // UNIQUE: panel screens draw the picker's goblin head
})();

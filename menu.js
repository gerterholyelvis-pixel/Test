// Goblin King title screen, settings, controls and the goblin roulette wheel. Needs window.GK (game.js) and window.THREE.
(() => {
const GK = window.GK, THREE = window.THREE;
const $ = id => document.getElementById(id);
const TAU = Math.PI * 2;
const DEFAULTS = { sens: 1, fov: 75, scale: 1, invertY: false, tags: true, fx: true, fsStart: false, gfx: 'high', minimap: true, mmNorth: true };   // MINIMAP: show / hide, north-up
Object.assign(DEFAULTS, GK.feelDefaults || {});   // FEEL: vol, sfx, amb, bob (feel.js)
const SKIN = ['#9bd45a', '#6dbb44', '#3f8a36', '#4cb8a6', '#a9cc34', '#9ccf52', '#5e7a4c', '#7f9a4a', '#8a9c6a', '#8c9a3c', '#4f8f72', '#b4733a'];
const GOBS = (window.GKITEMS && GKITEMS.GOBLINS) || [], NG = GOBS.length || 5;   // GOBTYPES: the twelve starting goblins (items.js)
const ODDS = GOBS.length ? GOBS.map(g => g.odds) : [30, 30, 30, 9, 1];
const FLAVOR = [
  'Tiny, twitchy and easy to overlook. Stay low, stay quick.',
  'A sturdy brawler of the horde. Dependable and mean.',
  'Hulking, loud and hard to ignore. Everyone gets out of your way.',
  'Robed and rare. The horde whispers of your spells.',
  'One in a hundred. Every goblin in the cave kneels to you.'];
for (let i = FLAVOR.length; i < NG; i++) FLAVOR.push(GOBS[i].desc);   // GOBTYPES
const SLOT = NG === 12 ? [0, 5, 1, 8, 6, 3, 2, 9, 7, 4, 10, 11] : [0, 3, 1, 4, 2];            // wheel slot -> goblin type (spreads the colours around)
const A = TAU / NG;
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
// MINIMAP-BEGIN
GK.mmSync = () => { $('s-mm').checked = GK.settings.minimap !== false; $('s-mmn').checked = GK.settings.mmNorth !== false; };
$('s-mm').onchange = e => { GK.settings.minimap = e.target.checked; save(); };
$('s-mmn').onchange = e => { GK.settings.mmNorth = e.target.checked; save(); GK.minimap && GK.minimap.redraw(); };
// MINIMAP-END
// FEEL-END
function syncUI() {
  for (const k in ctl) { ctl[k].value = GK.settings[k]; $('o-' + k).textContent = fmt[k](GK.settings[k]); const p = (ctl[k].value - ctl[k].min) / (ctl[k].max - ctl[k].min); ctl[k].style.setProperty('--p', (p * 100) + '%'); }
  $('s-inv').checked = GK.settings.invertY; $('s-tags').checked = GK.settings.tags; $('s-fx').checked = GK.settings.fx; GK.feelSync && GK.feelSync(); GK.mmSync && GK.mmSync(); fsSync();   // FULLSCREEN
  if (!['low', 'medium', 'high', 'ultra'].includes(GK.settings.gfx)) GK.settings.gfx = DEFAULTS.gfx; $('s-gfx').value = GK.settings.gfx;
}
for (const k in ctl) ctl[k].addEventListener('input', () => { GK.settings[k] = +ctl[k].value; syncUI(); GK.applySettings(); save(); });
$('s-inv').onchange = e => { GK.settings.invertY = e.target.checked; GK.applySettings(); save(); };
$('s-tags').onchange = e => { GK.settings.tags = e.target.checked; GK.applySettings(); save(); };
$('s-fx').onchange = e => { GK.settings.fx = e.target.checked; GK.applySettings(); save(); };
// FULLSCREEN-BEGIN (fullscreen toggle, title-screen button, F key, 'start in fullscreen' option)
const fsEl = document.documentElement;
const fsOn = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
let fsSet = function (on) {   // must run inside a user gesture (click / keydown)
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
// Sticky fullscreen: remember the wish and take it back on the next gesture when the browser dropped it unprompted
// (page reloads between screens, Esc leaving pointer lock + fullscreen together, focus loss). Always the document element.
const fsWishGet = () => { try { return localStorage.getItem('gk.fsWish') === '1'; } catch (e) { return false; } };
const fsWishSet = v => { try { localStorage.setItem('gk.fsWish', v ? '1' : '0'); } catch (e) {} };
let fsHeldEsc = 0, fsTry = 0;
const fsSetOrig = fsSet;
fsSet = function (on) { fsWishSet(on); fsSetOrig(on); }; GK.fullscreen.set = fsSet;   // explicit user toggles (F, button, checkbox, Start) update the wish
function fsKeyLock() { try { if (fsOn() && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {}); else if (!fsOn() && navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock(); } catch (e) {} }   // Esc stays with the game (closes panels, keeps fullscreen); holding it still leaves
document.addEventListener('fullscreenchange', fsKeyLock); document.addEventListener('webkitfullscreenchange', fsKeyLock);
addEventListener('keydown', e => { if (e.code === 'Escape' && e.repeat) fsHeldEsc = performance.now(); }, true);
document.addEventListener('fullscreenchange', () => { if (!fsOn() && performance.now() - fsHeldEsc < 2500) fsWishSet(false); });   // deliberate exit (held Esc) is respected
function fsRetake(e) {
  if (fsOn() || !fsWishGet() || e.isTrusted === false || e.code === 'Escape') return;
  const t = performance.now(); if (t - fsTry < 800) return; fsTry = t;
  fsSetOrig(true);
}
addEventListener('pointerdown', fsRetake, true); addEventListener('keydown', fsRetake, true);
if (GK.settings.fsStart && !fsWishGet()) fsWishSet(true);
// FULLSCREEN-END
$('s-gfx').onchange = e => { try { localStorage.setItem('gk.gfxAuto', 'user'); } catch (er) {} GK.settings.gfx = e.target.value; GK.settings.fx = e.target.value !== 'low'; syncUI(); GK.applySettings(); save(); };   // the preset also switches post effects (Low = none)
$('s-reset').onclick = () => { Object.assign(GK.settings, DEFAULTS); syncUI(); GK.applySettings(); save(); };
syncUI(); GK.applySettings();

// ---------- panels ----------
function show(name) {
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('on', p.id === 'p-' + name);
  if (name === 'chars') renderChars(); if (name === 'inv') renderInv();
  if (name === 'stats') renderStats();   // STATS
  const f = { main: 'b-start', settings: 's-back', controls: 'c-back', chars: 'ch-back', inv: 'inv-back', stats: 'st-back' }[name];
  setTimeout(() => { const first = name === 'chars' && document.querySelector('#chars-list .cplay'); const el = first || $(f); el && el.focus({ preventScroll: true }); }, 30);
  if (name === 'main') $('b-start').focus();
  curPanel = name; document.querySelector('#menu .col').classList.toggle('sub', name !== 'main'); $('menu').classList.toggle('sub', name !== 'main');
  document.querySelector('#menu .col').classList.toggle('wide', name === 'chars' || name === 'inv'); document.querySelector('#menu .col').classList.toggle('stats', name === 'stats'); document.querySelector('#menu .col').classList.toggle('xwide', name === 'settings' || name === 'controls'); tip(null);
}
let curPanel = 'main';
$('b-settings').onclick = () => show('settings'); $('b-controls').onclick = () => show('controls');
$('b-chars').onclick = () => show('chars'); $('b-inv').onclick = () => show('inv');
{ const cx = $('b-codex'); if (cx) cx.onclick = () => { window.open('/codex', '_blank', 'noopener'); }; }   // CODEX: the reference page (server.js /codex), in a new tab so the menu and any queue stay put
// STATS-BEGIN: the Stats screen (statsui.js draws it); Reset stats asks for confirmation in the page itself
function renderStats() { stConfirm(false); try { GKSTATSUI.render($('stats-sheet'), { portrait: portraitEl }); } catch (e) { console.warn('stats failed', e); $('stats-sheet').textContent = 'Stats are not available.'; } }
function stConfirm(on) { $('st-confirm').hidden = !on; $('st-btns').style.display = on ? 'none' : ''; if (on) $('st-no').focus(); else if (curPanel === 'stats' && document.activeElement && document.activeElement.id === 'st-yes') $('st-back').focus(); }
$('b-stats').onclick = () => show('stats'); $('st-back').onclick = () => show('main');
$('st-reset').onclick = () => { stConfirm(true); };
$('st-no').onclick = () => { stConfirm(false); $('st-reset').focus(); };
$('st-yes').onclick = () => { try { GKSTATSUI.reset(); } catch (e) {} renderStats(); $('st-back').focus(); };
// STATS-END
$('s-back').onclick = $('c-back').onclick = $('ch-back').onclick = $('inv-back').onclick = () => show('main');

// ---------- characters + inventory panels ----------
function headCanvas(type, size) {   // goblin portrait using the wheel's head drawing
  const c = document.createElement('canvas'), d = Math.min(devicePixelRatio || 1, 2);
  c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px';
  const g = c.getContext('2d'); g.scale(d, d); g.translate(size / 2, size * (type === 3 ? 0.62 : type === 4 ? 0.6 : type === 7 || type === 8 || type === 9 ? 0.57 : 0.5));
  drawHead(g, type, size * (type === 3 ? 0.2 : type === 4 ? 0.26 : type === 7 || type === 8 || type === 9 ? 0.25 : 0.29)); return c;
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
// 3D portrait of a goblin type: rendered once into an offscreen target with its own little studio rig (never touches the game scene), cached as a data URL
const PORT = {}; let portScene = null, portCam = null, portRT = null;
function portraitURL(type) {
  if (PORT[type] !== undefined) return PORT[type];
  PORT[type] = null;
  try {
    const r = GK.renderer, S = 256;
    if (!portScene) {
      portScene = new THREE.Scene(); portScene.add(new THREE.AmbientLight(0x8a7a66, 1.5));
      const k = new THREE.DirectionalLight(0xffe2b0, 3.4); k.position.set(2.5, 3, 4); portScene.add(k);
      const rim = new THREE.DirectionalLight(0x44e0c0, 2.2); rim.position.set(-3, 2, -2.5); portScene.add(rim);
      if (GK.scene && GK.scene.environment) { portScene.environment = GK.scene.environment; if ('environmentIntensity' in portScene) portScene.environmentIntensity = 0.5; }
      portCam = new THREE.PerspectiveCamera(26, 1, 0.1, 40); portRT = new THREE.WebGLRenderTarget(S, S, { samples: 4 }); portRT.texture.colorSpace = THREE.SRGBColorSpace;
    }
    const g = GK.build(type); g.traverse(o => { if (o.isSprite) o.visible = false; }); g.rotation.y = 0.4; portScene.add(g);
    const box = new THREE.Box3().setFromObject(g), h = box.max.y - box.min.y, ty = box.max.y - h * 0.38, d = h * 1.55;
    portCam.position.set(d * 0.18, ty + h * 0.04, d); portCam.lookAt(0, ty, 0); portCam.updateProjectionMatrix();
    const cc = new THREE.Color(); r.getClearColor(cc); const ca = r.getClearAlpha(), prev = r.getRenderTarget();
    r.setClearColor(0x000000, 0); r.setRenderTarget(portRT); r.clear(); r.render(portScene, portCam); r.setRenderTarget(prev); r.setClearColor(cc, ca);
    const px = new Uint8Array(S * S * 4); r.readRenderTargetPixels(portRT, 0, 0, S, S, px);
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g2 = cv.getContext('2d'), im = g2.createImageData(S, S);
    for (let y = 0; y < S; y++) im.data.set(px.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    g2.putImageData(im, 0, 0); PORT[type] = cv.toDataURL('image/png'); portScene.remove(g);
  } catch (e) { console.warn('portrait failed', e); }
  return PORT[type];
}
function portraitEl(type, size) {
  const url = portraitURL(type), w = document.createElement('div'); w.className = 'cport'; w.style.width = w.style.height = size + 'px';
  if (url) { const i = document.createElement('img'); i.src = url; i.alt = ''; w.appendChild(i); } else w.appendChild(headCanvas(type, size - 6));
  return w;
}
function ago(t) {
  if (!t) return 'No wins yet';
  const m = Math.max(0, (Date.now() - t) / 60000);
  return 'Last win ' + (m < 2 ? 'just now' : m < 90 ? Math.round(m) + ' min ago' : m < 60 * 36 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago');
}
function fixedWins(c) { return Math.max(0, c.wins | 0); }
function renderRoster() {   // GOBTYPES: all twelve starting goblins with a model portrait, odds, perk and a one-line description
  const box = $('roster'); if (!box || box.childElementCount || !GOBS.length) return;
  GOBS.map((g, i) => i).sort((a, b) => GOBS[b].odds - GOBS[a].odds).forEach(i => {
    const g = GOBS[i], card = document.createElement('div'); card.className = 'rcard' + (i === 4 ? ' king' : ''); card.appendChild(portraitEl(i, 58));
    const info = document.createElement('div'); info.className = 'cinfo'; const n = document.createElement('div'); n.className = 'rn'; n.textContent = GK.NAMES[i] || g.name;
    const o = document.createElement('span'); o.className = 'ro'; o.textContent = g.odds + '%'; n.appendChild(o);
    const p = document.createElement('div'); p.className = 'rp'; p.textContent = g.perkName + ': ' + g.perkText; const d = document.createElement('div'); d.className = 'rd'; d.textContent = g.desc;
    info.append(n, p, d); card.appendChild(info); box.appendChild(card);
  });
}
function renderChars() {
  try { renderRoster(); } catch (e) { console.warn('roster failed', e); }
  const box = $('chars-list'); box.textContent = '';
  let list = []; try { list = (window.GKSAVE ? GKSAVE.characters() : []).slice(); } catch (e) {}
  list.sort((a, b) => fixedWins(b) - fixedWins(a) || (b.lastWin || 0) - (a.lastWin || 0));
  $('chars-note').style.display = list.length ? '' : 'none';
  if (!list.length) { const e = document.createElement('div'); e.className = 'cempty'; e.textContent = 'No saved characters yet. Win a run to keep your goblin.'; box.appendChild(e); box.style.display = 'block'; return; }
  box.style.display = '';
  for (const c of list) {
    const card = document.createElement('div'); card.className = 'ccard';
    card.appendChild(portraitEl(c.goblin, 84));
    const info = document.createElement('div'); info.className = 'cinfo';
    const n = document.createElement('div'); n.className = 'cname'; n.textContent = c.name; info.appendChild(n);
    const t = document.createElement('div'); t.className = 'ctype'; t.textContent = GK.NAMES[c.goblin] || 'Goblin'; info.appendChild(t);
    const w = document.createElement('div'); w.className = 'cwins'; w.appendChild(trophyCanvas(22));
    const l = document.createElement('span'); l.textContent = 'Victories'; const b = document.createElement('b'); b.textContent = fixedWins(c); w.append(l, b); info.appendChild(w);
    const when = document.createElement('div'); when.className = 'cwhen'; when.textContent = ago(c.lastWin); info.appendChild(when);
    card.appendChild(info);
    if (c.best && window.GKICONS) { const bi = itemInfo(c.best), bx = document.createElement('div'); bx.className = 'cbest'; bx.title = 'Best item: ' + bi.name; if (bi.tier) bx.dataset.t = bi.tier; bx.appendChild(GKICONS.canvas(bi.key || c.best, 36)); bx.onmouseenter = bx.onmousemove = e => tip(bi, e); bx.onmouseleave = () => tip(null); card.appendChild(bx); }
    const p = document.createElement('button'); p.className = 'cplay'; p.textContent = 'Play'; p.onclick = () => startGame({ goblin: c.goblin, wins: fixedWins(c), charId: c.id });
    card.appendChild(p); box.appendChild(card);
  }
}
const itipEl = $('itip');
const TCOL = { common: '#b9b4a4', uncommon: '#6fdc6a', rare: '#5aa8ff', mythic: '#c06bff', legendary: '#ffb02e', transcendent: '#8ff6ff' };
function tip(it, e) {
  if (!it) { itipEl.style.display = 'none'; return; }
  itipEl.textContent = ''; itipEl.style.setProperty('--tc', TCOL[it.tier] || 'var(--gold3)'); const b = document.createElement('b'); b.textContent = it.name; const s = document.createElement('span');
  const tn = it.tierN != null ? it.tierN : null, tname = it.tier ? it.tier[0].toUpperCase() + it.tier.slice(1) : '';
  const st = it.attack != null ? 'Attack ' + it.attack : it.health != null ? 'Health ' + it.health : (it.desc || '');
  s.textContent = [tn != null ? 'Tier ' + tn + (tname ? ' \u00b7 ' + tname : '') : '', st].filter(Boolean).join(' \u00b7 ');
  if (it.tier && TCOL[it.tier]) b.style.color = TCOL[it.tier];
  itipEl.append(b, s);
  if (it.desc && it.attack == null && it.health == null) { /* desc already in the stat line */ } else if (it.desc) { const d = document.createElement('em'); d.textContent = it.desc; itipEl.appendChild(d); }
  if (it.price) { const p = document.createElement('i'); p.textContent = 'Worth ~' + it.price + ' gold'; itipEl.appendChild(p); }
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
      s.appendChild(window.GKICONS ? GKICONS.canvas(it.key, 52) : document.createTextNode('?'));
      if (it.tierN != null) { const bd = document.createElement('i'); bd.className = 'tb'; bd.textContent = it.tierN; bd.style.color = TCOL[it.tier] || '#ddd'; s.appendChild(bd); }
      s.onmouseenter = s.onmousemove = e => tip(it, e); s.onmouseleave = () => tip(null);
    }
    grid.appendChild(s);
  }
}
addEventListener('keydown', e => {
  if (GK.mode === 'play' || !$('menu') || $('menu').classList.contains('gone')) return;
  if (e.key === 'Escape' && curPanel === 'stats' && !$('st-confirm').hidden) { stConfirm(false); $('st-reset').focus(); e.preventDefault(); return; }   // STATS: Esc first closes the confirmation
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
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0c0a0c, metalness: 0.2, roughness: 0.7, transparent: true, opacity: 0.8, envMapIntensity: 0.6 });
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
glow.scale.set(16, 10, 1); glow.position.set(0, 3.6, -10.4); mscene.add(glow);
const glow2 = glow.clone(); glow2.material = glow.material.clone(); glow2.material.color.set(0xffc060); glow2.material.opacity = 0.3; glow2.scale.set(8, 8, 1); glow2.position.set(0, 3.6, -8.6); mscene.add(glow2);

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

// TITLE2-BEGIN: throne hall backdrop (arch + portal, pillars, torches, throne on a dais), god rays, dust motes, torch sparks, fog banks. No new lights: emissive materials and additive sprites only.
const TQ = { low: 0, medium: 1, high: 2 };
let tq = 2, portal = null, torches = [], throneGlow = null;
const hall = new THREE.Group(); mscene.add(hall);
const stoneM = new THREE.MeshStandardMaterial({ color: 0x1b1720, roughness: 0.78, metalness: 0.25, envMapIntensity: 0.5 });
const goldM = new THREE.MeshStandardMaterial({ color: 0xd9a22a, roughness: 0.3, metalness: 1, emissive: 0x4a2a00, emissiveIntensity: 0.6, envMapIntensity: 1.2 });
{ // doorway: a bevelled arch round a blazing portal
  const arch = (r, h) => { const s = new THREE.Shape(); s.moveTo(-r, 0); s.lineTo(-r, h); s.absarc(0, h, r, Math.PI, 0, true); s.lineTo(r, 0); return s; };
  const o = arch(3.6, 5.8); o.holes.push((() => { const p = new THREE.Path(); p.moveTo(-2.5, 0); p.lineTo(2.5, 0); p.lineTo(2.5, 5.8); p.absarc(0, 5.8, 2.5, 0, Math.PI, false); p.lineTo(-2.5, 0); return p; })());
  const ag = new THREE.ExtrudeGeometry(o, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 20 });
  const am = new THREE.Mesh(ag, stoneM); am.position.set(0, 0, -11.6); hall.add(am);
  const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), goldM); keystone.scale.set(0.8, 1.3, 0.6); keystone.position.set(0, 9.6, -10.4); hall.add(keystone);
  const pt = cTex(128, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * .62, 4, w / 2, h * .62, h * .72); gr.addColorStop(0, 'rgba(255,248,214,1)'); gr.addColorStop(.35, 'rgba(255,205,120,.95)'); gr.addColorStop(.75, 'rgba(255,120,40,.55)'); gr.addColorStop(1, 'rgba(120,40,10,.2)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const pg = new THREE.ShapeGeometry(arch(2.5, 5.8), 20);
  const pu = pg.attributes.position, pv = pg.attributes.uv; for (let i = 0; i < pu.count; i++) pv.setXY(i, (pu.getX(i) + 2.5) / 5, pu.getY(i) / 8.3);
  portal = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: pt, fog: false, transparent: true, opacity: 0.95, depthWrite: false })); portal.position.set(0, 0, -11.0); hall.add(portal);
}
{ // pillars, one instanced lathe, plus torches on the inner pair
  const prof = [[.66, 0], [.66, .28], [.5, .4], [.42, .55], [.38, 1.2], [.36, 5.1], [.43, 5.35], [.58, 5.6], [.74, 5.95], [.74, 6.3]].map(p => new THREE.Vector2(p[0], p[1]));
  const lg = new THREE.LatheGeometry(prof, 12); const POS = [[-6.4, -3.2], [-8.2, -6.6], [-9.4, -10], [6.6, -3.6], [8.4, -7], [9.6, -10.4]];
  const im = new THREE.InstancedMesh(lg, stoneM, POS.length); const mm = new THREE.Matrix4();
  POS.forEach((p, i) => { mm.makeScale(1, 1 + (i % 3) * 0.12, 1).setPosition(p[0], 0, p[1]); im.setMatrixAt(i, mm); }); hall.add(im);
  for (const p of [POS[0], POS[3]]) {
    const hx = p[0] + (p[0] < 0 ? 0.8 : -0.8), hy = 3.1, bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.34, 8), goldM); bowl.position.set(hx, hy, p[1]); hall.add(bowl);
    const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: GK.glowTex, color: 0xff9a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95, fog: false })); f.scale.set(0.9, 1.3, 1); f.position.set(hx, hy + 0.35, p[1]); hall.add(f);
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: GK.glowTex, color: 0xff6a22, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.3, fog: false })); h.scale.set(4.2, 4.2, 1); h.position.copy(f.position); hall.add(h);
    torches.push({ f, h, ph: Math.random() * 9, x: hx, y: hy + 0.4, z: p[1] });
  }
}
{ // throne on a two-step dais, in front of the doorway
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.7, 0.34, 9), stoneM); dais.position.set(0, 0.17, -6.4); hall.add(dais);
  const d2 = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.9, 0.34, 9), stoneM); d2.position.set(0, 0.5, -6.4); hall.add(d2);
  const P = [[-1.15, 0], [-1.15, 2.6], [-1.5, 3.8], [-0.92, 3.35], [-0.7, 4.6], [-0.26, 3.85], [0, 5.2], [0.26, 3.85], [0.7, 4.6], [0.92, 3.35], [1.5, 3.8], [1.15, 2.6], [1.15, 0]];
  const sh = new THREE.Shape(P.map(p => new THREE.Vector2(p[0], p[1])));
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2 });
  const back = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x241a1c, roughness: 0.5, metalness: 0.6, envMapIntensity: 0.9 })); back.position.set(0, 0.67, -7.1); hall.add(back);
  const trim = new THREE.LineSegments(new THREE.EdgesGeometry(bg, 30), new THREE.LineBasicMaterial({ color: 0xffc94a, fog: false })); trim.position.copy(back.position); hall.add(trim);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.7, 1.6), stoneM); seat.position.set(0, 1.0, -6.4); hall.add(seat);
  for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.9, 1.5), goldM); arm.position.set(sx * 1.2, 1.4, -6.4); hall.add(arm); }
  const gem = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc4122f, emissive: 0xff1a38, emissiveIntensity: 1.6, roughness: 0.2 })); gem.position.set(0, 3.9, -6.72); hall.add(gem);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 8, 28), goldM); ring.position.copy(gem.position); hall.add(ring);
  const gg = new THREE.Sprite(new THREE.SpriteMaterial({ map: GK.glowTex, color: 0xff2a44, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, fog: false })); gg.scale.set(2.2, 2.2, 1); gg.position.set(0, 3.9, -6.5); hall.add(gg); throneGlow = gg;
}
// god rays from high windows (soft-edged additive planes)
const rayTex = cTex(64, 256, (g, w, h) => { const hg = g.createLinearGradient(0, 0, w, 0); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(.5, 'rgba(255,255,255,1)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hg; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-in'; const vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(.18, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, w, h); });
const rays = [];
for (const [x, z, rz, w, c, o] of [[-4.6, -4.5, 0.42, 2.6, 0xffd9a0, 0.16], [-1.9, -7.5, 0.36, 3.4, 0xffe6b8, 0.13], [3.8, -6, -0.4, 3.0, 0xffcf90, 0.12]]) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 15), new THREE.MeshBasicMaterial({ map: rayTex, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: o, fog: false }));
  m.position.set(x, 6.5, z); m.rotation.z = rz; hall.add(m); rays.push({ m, o, ph: Math.random() * 6 });
}
// dust motes (slow, lit by the rays) and torch sparks (quick, rising)
const ND = 160, dPos = new Float32Array(ND * 3), dSeed = new Float32Array(ND);
for (let i = 0; i < ND; i++) { dPos[i * 3] = (Math.random() - .5) * 16; dPos[i * 3 + 1] = Math.random() * 7; dPos[i * 3 + 2] = -9 + Math.random() * 15; dSeed[i] = Math.random() * 6.28; }
const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ map: GK.glowTex, color: 0xffe2b0, size: 0.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55, fog: false })); dust.frustumCulled = false; mscene.add(dust);
const NS = 70, sPos = new Float32Array(NS * 3), sSeed = new Float32Array(NS * 3);
for (let i = 0; i < NS; i++) { sSeed[i * 3] = Math.floor(Math.random() * 2); sSeed[i * 3 + 1] = 0.8 + Math.random() * 1.6; sSeed[i * 3 + 2] = Math.random() * 6.28; sPos[i * 3 + 1] = -100; }
const sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ map: GK.glowTex, color: 0xffa040, size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 1, fog: false })); sparks.frustumCulled = false; mscene.add(sparks);
// drifting fog banks
const fogTex = cTex(256, 128, (g, w, h) => { for (let i = 0; i < 26; i++) { const x = Math.random() * w, y = h * (.3 + Math.random() * .4), r = 22 + Math.random() * 44, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(.2, 'rgba(0,0,0,0)'); e.addColorStop(.8, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = e; g.fillRect(0, 0, w, h); });
const fogs = [];
for (const [x, y, z, s, c, o, v] of [[-3, 0.8, -8, 14, 0x8a6a8a, 0.2, 0.18], [4, 0.7, -5.5, 12, 0xa07a5a, 0.16, -0.14], [0, 0.9, -10, 18, 0x6a6aa0, 0.22, 0.1], [-5, 0.6, -2.5, 11, 0x7a6a8a, 0.12, 0.2], [5, 0.6, -1, 10, 0x9a7a6a, 0.1, -0.16]]) {
  const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: fogTex, color: c, transparent: true, depthWrite: false, opacity: o, fog: false })); f.scale.set(s, s * 0.32, 1); f.position.set(x, y, z); mscene.add(f); fogs.push({ f, v, x0: x, o });
}
function titleQuality() {
  const q = TQ[GK.settings && GK.settings.gfx]; tq = q === undefined ? 2 : q;
  pGeo.setDrawRange(0, tq === 0 ? 110 : tq === 1 ? 240 : NP); dust.visible = tq > 0; dGeo.setDrawRange(0, tq === 1 ? 80 : ND); sparks.visible = tq > 0; sGeo.setDrawRange(0, tq === 1 ? 30 : NS);
  fogs.forEach((o, i) => { o.f.visible = tq === 2 || (tq === 1 && i < 3); }); rays.forEach((o, i) => { o.m.visible = tq === 2 || i === 0 || (tq === 1 && i < 2); });
  rings2.visible = tq > 0; glow2.visible = tq > 0; for (const r of rigs) if (r.rig.userData.m) r.rig.userData.m.visible = tq > 0;
  document.body.dataset.gfx = ['low', 'medium', 'high'][tq];
}
setTimeout(() => { const cu = $('tcurtain'); if (cu) cu.classList.add('up'); body.classList.add('tready'); }, 4000);   // safety: never leave the curtain down (a resumed match skips the title render)
try {   // film grain: one small noise tile, jittered by CSS (static on Low)
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gg2 = gc.getContext('2d'), im = gg2.createImageData(128, 128);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  gg2.putImageData(im, 0, 0); const gel = $('grain'); if (gel) gel.style.backgroundImage = 'url(' + gc.toDataURL('image/png') + ')';
} catch (e) {}
// TITLE2-END

// ---------- title render ----------
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; });
let W = 0, H = 0, T0 = 0, introT0 = 0, tqT = 0;
const ease3 = x => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
function titleRender(now, dt) {
  const t = now / 1000, r = GK.renderer;
  if (!T0) { T0 = now; body.classList.add('tready'); const cu = $('tcurtain'); if (cu) cu.classList.add('up'); }
  if (now - tqT > 800) { tqT = now; titleQuality(); }
  const lead = 1 - ease3((now - T0) / 2600), go = introT0 ? ease3((now - introT0) / 1100) : 0;   // lead: the camera settles in on page load; go: it pushes toward the doorway when a match starts
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
  mcam.position.set(Math.sin(t * 0.17) * 1.6 + mouse.sx * 1.8, 2.1 + mouse.sy * -0.6 + Math.sin(t * 0.21) * 0.15 + lead * 0.5 - go * 0.25, 13.4 - dolly + back + lead * 2.8 - go * 5.5);
  mcam.lookAt(0 + mouse.sx * 0.4, 1.35 + go * 0.9, -0.8 - go * 2);
  const fov = 36 - go * 7 + lead * 4; if (Math.abs(mcam.fov - fov) > 0.01) { mcam.fov = fov; mcam.updateProjectionMatrix(); }
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
  // hall life: flickering torches and rays, drifting fog and dust, sparks off the torches, the throne gem pulsing
  for (const o of torches) { const fl = 0.85 + Math.sin(t * 11 + o.ph) * 0.08 + Math.sin(t * 23 + o.ph * 2) * 0.07; o.f.scale.set(0.9 * fl, 1.3 * fl, 1); o.h.material.opacity = 0.26 * fl + 0.04; }
  for (const o of rays) o.m.material.opacity = o.o * (0.75 + Math.sin(t * 0.5 + o.ph) * 0.25 + Math.sin(t * 1.3 + o.ph) * 0.06);
  if (tq > 0) {
    for (const o of fogs) { o.f.position.x = o.x0 + Math.sin(t * o.v * 0.35 + o.x0) * 3; o.f.material.opacity = o.o * (0.8 + 0.2 * Math.sin(t * 0.3 + o.x0)); }
    const dp = dGeo.attributes.position.array; for (let i = 0; i < ND; i++) { dp[i * 3 + 1] += dt * 0.06; dp[i * 3] += Math.sin(t * 0.3 + dSeed[i]) * dt * 0.1; dp[i * 3 + 2] += Math.cos(t * 0.27 + dSeed[i]) * dt * 0.06; if (dp[i * 3 + 1] > 7) dp[i * 3 + 1] = 0; } dGeo.attributes.position.needsUpdate = true;
    const sp = sGeo.attributes.position.array; for (let i = 0; i < NS; i++) {
      const T = torches[sSeed[i * 3]]; if (!T) continue;
      if (sp[i * 3 + 1] < -50) { sp[i * 3] = T.x + (Math.random() - .5) * 0.2; sp[i * 3 + 1] = T.y; sp[i * 3 + 2] = T.z; sSeed[i * 3 + 1] = 0.8 + Math.random() * 1.6; }
      sp[i * 3 + 1] += sSeed[i * 3 + 1] * dt; sp[i * 3] += Math.sin(t * 2 + sSeed[i * 3 + 2]) * dt * 0.5; if (sp[i * 3 + 1] > T.y + 2.8) sp[i * 3 + 1] = -100;
    } sGeo.attributes.position.needsUpdate = true;
  }
  throneGlow.material.opacity = 0.5 + Math.sin(t * 1.6) * 0.12; portal.material.opacity = 0.9 + Math.sin(t * 0.9) * 0.05 + go * 0.1; hall.position.x = -mouse.sx * 0.35;
  r.render(mscene, mcam);
}

// ---------- wheel ----------
const wc = $('wheel'), wx = wc.getContext('2d');
let S = 0, dpr = 1, staticC = null, wheelGo = false;
function drawHead(g, type, s, glow) {  // goblin head, centred, radius ~ s
  g.save();
  const sc = [0.8, 0.95, 1.12, 0.95, 1, 0.86, 0.9, 1.0, 0.95, 1.05, 1.0, 0.95][type] || 1;
  g.scale(sc, sc);
  g.lineJoin = 'round';
  const skin = SKIN[type], dark = 'rgba(0,0,0,.55)';
  const ear = (sx) => { g.beginPath(); g.moveTo(sx * s * .62, -s * .12); g.lineTo(sx * s * (type === 10 ? 1.15 : 1.42), -s * .5 - (type === 0 ? s * .1 : 0) - ({ 5: .55, 10: -.3, 11: .05 }[type] || 0) * s); g.lineTo(sx * s * .7, s * .42); g.closePath(); g.fillStyle = skin; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .07; g.stroke(); g.beginPath(); g.moveTo(sx * s * .72, 0); g.lineTo(sx * s * 1.2, -s * .36); g.lineTo(sx * s * .76, s * .26); g.fillStyle = 'rgba(255,120,120,.28)'; g.fill(); };
  ear(-1); ear(1);
  if (type === 3) { }
  const hw = type === 2 ? 1.0 : .88, hh = type === 2 ? .88 : .94;
  g.beginPath(); g.ellipse(0, 0, s * hw, s * hh, 0, 0, TAU); const gr = g.createRadialGradient(-s * .3, -s * .4, s * .1, 0, 0, s * 1.1); gr.addColorStop(0, '#fff8'); gr.addColorStop(.01, skin); gr.addColorStop(1, skin); g.fillStyle = skin; g.fill();
  const sh = g.createRadialGradient(-s * .3, -s * .35, s * .1, 0, 0, s * 1.05); sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = sh; g.fill();
  g.strokeStyle = dark; g.lineWidth = s * .08; g.stroke();
  // brow + eyes
  const ey = -s * .12, ex = s * .38;
  for (const sx of [-1, 1]) {
    g.beginPath(); g.ellipse(sx * ex, ey, s * .24, s * .17, sx * .25, 0, TAU); g.fillStyle = type === 3 ? '#9ff' : type === 4 ? '#ffd24a' : type === 9 ? '#ff7a5a' : type === 8 ? '#dff6ff' : type === 10 ? '#ffb84a' : '#f3e86a'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .05; g.stroke();
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
  head2D(g, type, s, dark);   // GOBTYPES
  g.restore();
}
function head2D(g, type, s, dark) {   // GOBTYPES: wheel/portrait marks of the newer goblins: feathers, hood, hard hat, horned skull, mohawk, lily pad, horns + topknot
  const P = (pts, fill, w) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)); g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = dark; g.lineWidth = s * (w || .06); g.stroke(); };
  if (type === 5) { P([[-.55, -.55], [-.75, -1.45], [-.42, -.6]], '#f0ead8'); P([[-.38, -.62], [-.45, -1.3], [-.25, -.66]], '#b3402a'); g.fillStyle = '#6a4626'; g.fillRect(-s * .86, -s * .5, s * 1.72, s * .12); }
  if (type === 6) { g.beginPath(); g.ellipse(0, -s * .1, s * 1.0, s * 1.02, 0, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(s * .7, -s * .25); g.quadraticCurveTo(0, -s * .55, -s * .7, -s * .25); g.closePath(); g.fillStyle = '#2a2830'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .06; g.stroke(); }
  if (type === 7) { g.beginPath(); g.ellipse(0, -s * .55, s * .9, s * .55, 0, Math.PI, TAU); g.closePath(); g.fillStyle = '#b08a3a'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .06; g.stroke(); g.fillStyle = '#9a7a30'; g.fillRect(-s * 1.0, -s * .6, s * 2.0, s * .12); g.fillStyle = '#f0e6c8'; g.fillRect(-s * .08, -s * 1.38, s * .16, s * .3); g.beginPath(); g.ellipse(0, -s * 1.5, s * .07, s * .13, 0, 0, TAU); g.fillStyle = '#ffb030'; g.fill(); }
  if (type === 8) { for (const sx of [-1, 1]) P([[sx * .45, -.6], [sx * 1.1, -1.25], [sx * .95, -1.6], [sx * .85, -1.2], [sx * .25, -.75]], '#e0d4b4', .05); g.beginPath(); g.ellipse(0, -s * .78, s * .55, s * .3, 0, 0, TAU); g.fillStyle = '#e8dec0'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .06; g.stroke(); g.fillStyle = '#1a1210'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * s * .2, -s * .8, s * .08, 0, TAU); g.fill(); } }
  if (type === 9) { const pts = [[-.12, -.8]]; for (let i = 0; i < 6; i++) pts.push([-.12 + i * .05, -1.5 + (i % 2) * .3 + Math.abs(i - 2.5) * .08], [-.08 + i * .05, -.85]); P(pts, '#d0281a', .04); g.fillStyle = 'rgba(179,18,43,.85)'; g.fillRect(-s * .8, -s * .36, s * 1.6, s * .1); }
  if (type === 10) { g.beginPath(); g.ellipse(s * .05, -s * .82, s * .95, s * .22, -.12, 0.25, TAU - 0.25); g.lineTo(s * .05, -s * .82); g.closePath(); g.fillStyle = '#5a9a3a'; g.fill(); g.strokeStyle = dark; g.lineWidth = s * .05; g.stroke(); }
  if (type === 11) { for (const sx of [-1, 1]) P([[sx * .2, -.75], [sx * .55, -1.2], [sx * .75, -1.25], [sx * .45, -.7]], '#3a3028', .04); P([[-.15, -.85], [-.12, -1.35], [.12, -1.35], [.15, -.85]], '#1a1414', .04); g.fillStyle = '#ffc933'; g.fillRect(-s * .16, -s * 1.12, s * .32, s * .08); }
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
  for (let i = 0; i < NG; i++) {
    const type = SLOT[i], a0 = i * A - Math.PI / 2 - A / 2, a1 = a0 + A;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a0, a1); g.closePath();
    const col = ['#35502a', '#2a4a30', '#2a3f4a', '#3b2a5c', '#6a4a10', '#3a5224', '#26262e', '#4a3c22', '#3a4a40', '#5a2420', '#1f4a3e', '#4a2a1e'][type] || '#2a4a30';
    const gr = g.createRadialGradient(0, 0, R * .1, 0, 0, R); gr.addColorStop(0, '#0d0b0a'); gr.addColorStop(.35, col); gr.addColorStop(1, shade(col, 1.35));
    g.fillStyle = gr; g.fill(); g.strokeStyle = '#e8b64a'; g.lineWidth = Math.max(2, S * .006); g.stroke();
    // content in the segment's local frame (up = -y)
    g.save(); g.rotate(i * A);
    g.save(); g.translate(0, -R * .56); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = S * .02; drawHead(g, type, S * (NG > 5 ? .04 : .058)); g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = S * (NG > 5 ? .03 : .042); g.font = `700 ${fs}px "Barlow Condensed","Arial Narrow",Impact,sans-serif`;
    g.fillStyle = type === 4 ? '#ffe36a' : '#f4ecd2'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText((NG > 5 ? GK.NAMES[type].replace(/^Goblin /, '').replace(/ Goblin$/, '') : GK.NAMES[type]).toUpperCase(), 0, -R * .88);
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
  const idx = ((Math.round(-wh.rot / A) % NG) + NG) % NG, under = SLOT[idx];
  // rotating static layer
  g.save(); g.translate(cx, cy); g.rotate(wh.rot); g.scale(1 / dpr, 1 / dpr); g.drawImage(staticC, -staticC.width / 2, -staticC.height / 2); g.scale(dpr, dpr);
  if (wh.state === 'landed') {
    const k = Math.min(1, wh.land / .6), win = SLOT.indexOf(wh.result);
    for (let i = 0; i < NG; i++) {
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
  $('vflav').textContent = FLAVOR[t] + (GOBS[t] ? ' ' + GOBS[t].perkName + ': ' + GOBS[t].perkText : ''); $('vodds').textContent = ODDS[t] + '% chance';
  k.classList.toggle('king', t === 4); k.classList.add('on');
}

let started = false;
function startGame(opts) {
  if (started) return; started = true;
  if (GK.settings.fsStart && (!opts || opts.type === 'click')) fsSet(true);   // FULLSCREEN: inside the Start click
  if (!opts || typeof opts !== 'object' || opts.type === 'click') opts = undefined;
  body.classList.add('rolling'); $('menu').classList.add('gone'); introT0 = performance.now(); { const cu = $('tcurtain'); if (cu) { cu.classList.remove('go'); cu.getBoundingClientRect(); cu.classList.add('go'); } }
  const roll = $('roll'); roll.classList.add('show'); roll.getBoundingClientRect(); roll.classList.add('vis');
  wheelGo = true; sizeWheel(); queueStart();
  wh.state = 'spin'; wh.t = 0; wh.rot = Math.random() * TAU; wh.result = null; wh.shown = false;
  $('rname').textContent = 'Rolling...'; $('rstat').textContent = 'Spinning the wheel of fate';
  let p; try { p = opts ? GK.start(opts) : GK.start(); } catch (e) { console.error(e); p = new Promise(() => {}); }
  Promise.resolve(p).then(g => { wh.result = (typeof g === 'number' && g >= 0 && g < NG) ? g : 0; });
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
function pips(n, size, cls) {   // one diamond per seat: gold while the match fills, teal as goblins report ready
  const box = $('qpips'); if (!box) return; if (box.children.length !== size) { box.textContent = ''; for (let i = 0; i < size; i++) box.appendChild(document.createElement('i')); }
  [...box.children].forEach((d, i) => { d.className = i < n ? cls : ''; });
}
function qFmt(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function queueStart() {
  qT0 = performance.now(); qDone = false; $('qbox').classList.add('on'); $('qfind').textContent = 'Finding goblins'; $('qtime').textContent = '0:00';
  clearInterval(qTimer); qTimer = setInterval(() => { if (!qDone) $('qtime').textContent = qFmt(performance.now() - qT0); }, 250);
}
$('qcancel').onclick = () => { try { GK.cancelQueue && GK.cancelQueue(); } catch (e) {} try { GK.social && GK.social.clear(); } catch (e) {} setTimeout(() => location.reload(), 60); };   // back to the title with a clean connection
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
  queue(n, size, since) { if (qDone) return; if (since > 0) qT0 = performance.now() - since; $('qfind').textContent = 'Finding goblins ' + n + '/' + size; pips(n, size, 'on'); },
  queueDone() { qDone = true; $('qfind').textContent = 'Waiting for goblins…'; $('qtime').textContent = ''; $('qcancel').style.display = 'none'; pips(0, 8, 'rdy'); },
  ready(n, size) { if (qDone) { $('qtime').textContent = n + '/' + size + ' ready'; pips(n, size, 'rdy'); } },
  whenRevealed(cb, maxMs, holdMs = 1500) { if (!wheelGo || wh.state === 'idle') return cb(); const t0 = performance.now(), t = setInterval(() => { const now = performance.now(), late = now - t0 > maxMs; if ((wh.shown && now - (wh.shownAt || now) >= holdMs) || late) { clearInterval(t); cb(); } }, 100); },   // the goblin you rolled stays on screen for holdMs before we report ready (the server waits up to its READY_MS)   // wait until the wheel has landed and shown the goblin (but not past maxMs: the server starts the countdown 8 s after the match forms)
  hideWheel,
  /* MATCH-END */
  resumed() { started = true; $('menu').classList.add('gone'); },   // SOCIAL: a reload resumed the match: the title stays away
};
try { const r = GK.social && GK.social.pending(); if (r) { started = true; $('menu').classList.add('gone'); GK.social.resume(r); } } catch (e) { console.error(e); }   // SOCIAL: a match was running less than 15 s ago: reconnect with the token, no title
window.GKHEAD = headCanvas;   // UNIQUE: panel screens draw the picker's goblin head
})();

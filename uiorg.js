// uiorg.js: UI-ORGANIZE (docs/reports/ui-organize.md). Pure UI decisions (unit-tested in tests/uiorg.test.js) plus the in-game Menu:
// a small always-visible Menu button, the pause panel (Resume, Settings, Controls, How to Play, Stats, Codex, Report a problem,
// Leave game) opened by Esc / P / the button, and the keybind cheat sheet (? or F1). There is no real pause: the match keeps running.
// While the panel is open game.js ignores movement (GK.pauseOpen) and this file swallows every other key. Closing it re-locks the
// pointer; nothing here ever leaves fullscreen (see fskeep.js; GK.panelOpen / closePanels are wrapped so fskeep treats it as a panel).
// UMD: window.GKUIORG / module.exports. The DOM part only runs in a browser.
(function (root) {
  'use strict';
  // ---- keybinds: one table for the Controls view, the cheat sheet and the title-menu Controls screen ----
  const CHEAT = [
    { group: 'Move and fight', keys: [
      { k: ['W', 'A', 'S', 'D'], t: 'Move' }, { k: ['Shift'], t: 'Sprint' }, { k: ['Space'], t: 'Jump (onto crates and barrels for high ground)' },
      { k: ['C'], t: 'Dash (or double-tap a direction)' }, { k: ['Click'], t: 'Attack (hold to keep swinging)' }, { k: ['Right mouse'], t: 'Heavy blow (hold to wind up)' }] },
    { group: 'Interact and items', keys: [
      { k: ['E'], t: 'Interact: door panel, trade, craft, loot, pump (some stations: hold E)' }, { k: ['R', 'Q'], t: 'Extra actions at tree, heist and vault stations' },
      { k: ['B'], t: 'Bribe at a door panel' }, { k: ['Tab', 'I'], t: 'Inventory' }, { k: ['1', '2', '3'], t: 'Quick slots (scroll wheel cycles)' }] },
    { group: 'Social and view', keys: [
      { k: ['4', '5', '6', '7'], t: 'Emotes: taunt, laugh, point, dance' }, { k: ['V'], t: 'Overview camera' }, { k: ['M'], t: 'Big map' }, { k: ['`'], t: 'Hold for the scoreboard' }] },
    { group: 'System', keys: [
      { k: ['Esc', 'P'], t: 'Menu (resume, settings, leave); closes the top panel first' }, { k: ['? ', 'F1'], t: 'This key list' }, { k: ['N'], t: 'Mute or unmute all sound' }, { k: ['F'], t: 'Toggle fullscreen (hold Esc to leave it)' }] }
  ];
  const PAUSE_ENTRIES = [
    { id: 'resume', t: 'Resume' }, { id: 'settings', t: 'Settings' }, { id: 'controls', t: 'Controls' }, { id: 'how', t: 'How to Play' },
    { id: 'stats', t: 'Stats' }, { id: 'codex', t: 'Codex' }, { id: 'report', t: 'Report a problem / Privacy' }, { id: 'leave', t: 'Leave game' }];
  // settings sections shown in the pause panel (keys are GK.settings keys, defaults live in menu.js DEFAULTS)
  const SETTINGS = [
    { name: 'Graphics', rows: [{ key: 'gfx', type: 'select', label: 'Quality preset', opts: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra']] }, { key: 'dynres', type: 'check', label: 'Dynamic resolution' }, { key: 'fov', type: 'range', label: 'Field of view', min: 60, max: 110, step: 1, unit: 'deg' }] },
    { name: 'Audio', rows: [{ key: 'mute', type: 'check', label: 'Mute all (N)' }, { key: 'vol', type: 'range', label: 'Master volume', min: 0, max: 1, step: 0.01, unit: '%' }, { key: 'sfx', type: 'range', label: 'Effects volume', min: 0, max: 1, step: 0.01, unit: '%' }, { key: 'amb', type: 'range', label: 'Ambient volume', min: 0, max: 1, step: 0.01, unit: '%' }] },
    { name: 'Controls', rows: [{ key: 'sens', type: 'range', label: 'Mouse sensitivity', min: 0.2, max: 3, step: 0.05, unit: 'x' }, { key: 'invertY', type: 'check', label: 'Invert Y axis' }, { key: 'bob', type: 'check', label: 'Head bob' }] },
    { name: 'Gameplay', rows: [{ key: 'tags', type: 'check', label: 'Name tags' }, { key: 'minimap', type: 'check', label: 'Minimap' }, { key: 'mmNorth', type: 'check', label: 'Minimap north-up' }] }
  ];
  const TIER_ORDER = ['common', 'uncommon', 'rare', 'mythic', 'legendary', 'transcendent', 'class'];
  // rarity colours (same values as game.js TIER_COL) so every screen can share one table
  const RARITY = { common: '#9aa0a8', uncommon: '#4fc35b', rare: '#4a9bff', mythic: '#b06bff', legendary: '#ffb02e', transcendent: '#7ff4ff', class: '#ffd75e' };

  // ---- decisions ----
  // s: { code, mode, panel, paused, howOpen, inField } -> 'open' | 'close' | 'back' | null  (Esc and P)
  function escAction(s) {
    if (s.mode !== 'play' || s.howOpen) return null;
    if (s.paused) return s.code === 'Escape' ? (s.view && s.view !== 'main' ? 'back' : 'close') : s.code === 'KeyP' && !s.inField ? 'close' : null;
    if (s.panel || s.inField) return null;   // a panel open: the game closes it with Esc first (consistent: Esc closes the top panel)
    return s.code === 'Escape' || s.code === 'KeyP' ? 'open' : null;
  }
  // the pointer lock was lost: was it the player pressing Esc (open the menu) or a panel / focus change (do nothing)?
  function openOnLockLoss(s) { return s.mode === 'play' && !s.panel && !s.paused && !s.howOpen && s.focused && s.visible; }
  function cheatKey(e) { return e.code === 'F1' || (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey); }
  function muteKey(e) { return e.code === 'KeyN' && !e.repeat && !e.ctrlKey && !e.altKey && !e.metaKey; }
  // ---- item list organising (pure; used by lists that show items) ----
  const tierRank = t => { const i = TIER_ORDER.indexOf(t); return i < 0 ? -1 : i; };
  // entries: [{ key, name, tier, kind, n }] ; mode: 'tier' (best first) | 'name' | 'kind'
  function sortEntries(list, mode, favs) {
    const f = favs || {}, cmp = {
      tier: (a, b) => tierRank(b.tier) - tierRank(a.tier) || String(a.name).localeCompare(b.name),
      name: (a, b) => String(a.name).localeCompare(b.name),
      kind: (a, b) => String(a.kind).localeCompare(b.kind) || tierRank(b.tier) - tierRank(a.tier) || String(a.name).localeCompare(b.name) }[mode || 'tier'];
    return list.slice().sort((a, b) => (f[b.key] ? 1 : 0) - (f[a.key] ? 1 : 0) || cmp(a, b));   // favourites first
  }
  function groupBy(list, field) { const out = []; for (const e of list) { let g = out.find(x => x.id === (e[field] == null ? '' : e[field])); if (!g) out.push(g = { id: e[field] == null ? '' : e[field], items: [] }); g.items.push(e); } return out; }
  function stack(list) { const m = new Map(); for (const e of list) { const r = m.get(e.key); if (r) r.n += e.n || 1; else m.set(e.key, Object.assign({}, e, { n: e.n || 1 })); } return [...m.values()]; }
  function filterEntries(list, q, kind) { const s = String(q || '').trim().toLowerCase(); return list.filter(e => (!kind || kind === 'all' || e.kind === kind) && (!s || String(e.name).toLowerCase().includes(s))); }
  function toggleFav(favs, key) { const f = Object.assign({}, favs); if (f[key]) delete f[key]; else f[key] = 1; return f; }
  const fmtVal = (r, v) => r.unit === '%' ? Math.round(v * 100) + '%' : r.unit === 'x' ? (+v).toFixed(2) + 'x' : r.unit === 'deg' ? Math.round(v) + '°' : String(v);

  const API = { CHEAT, PAUSE_ENTRIES, SETTINGS, RARITY, TIER_ORDER, escAction, openOnLockLoss, cheatKey, muteKey, tierRank, sortEntries, groupBy, stack, filterEntries, toggleFav, fmtVal };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; return; }
  root.GKUIORG = API;
  if (typeof document === 'undefined') return;

  // ================= browser part =================
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  let GK = null, ov = null, btn = null, view = 'main', paused = false, last = null, sheetFirst = false;
  const css = '#gkPause{position:fixed;inset:0;z-index:150;display:none;align-items:center;justify-content:center;background:rgba(6,5,8,.78);font-family:var(--ui,system-ui);color:var(--gk-txt,#efe9d8)}' +
    '#gkPause.on{display:flex}#gkPause .pp{width:min(560px,94vw);max-height:90vh;overflow:auto;padding:var(--gk-s4,16px) var(--gk-s5,24px);background:linear-gradient(180deg,var(--gk-bg-hi,#120f0c),var(--gk-bg,#0c0a08));border:1px solid var(--gk-line-hi,#a8741a);border-left:3px solid var(--gk-accent-dim,#a8741a);border-radius:3px;box-shadow:0 10px 36px rgba(0,0,0,.6)}' +
    '#gkPause h2{margin:0 0 12px;font:700 22px/1.1 var(--ui,system-ui);letter-spacing:.2em;text-transform:uppercase;color:var(--gk-accent,#f5c451)}#gkPause h3{margin:14px 0 4px;font:700 13px/1 var(--ui,system-ui);letter-spacing:.2em;text-transform:uppercase;color:#c9c3b0}' +
    '#gkPause .pb{display:block;width:100%;margin:6px 0;padding:10px 14px;text-align:left;font:600 17px/1.2 var(--ui,system-ui);letter-spacing:.04em;color:#efe9d8;background:rgba(255,255,255,.05);border:1px solid rgba(245,196,81,.26);border-radius:3px;cursor:pointer}' +
    '#gkPause .pb:hover,#gkPause .pb:focus-visible{background:rgba(245,196,81,.16);outline:2px solid rgba(255,106,42,.85);outline-offset:1px}#gkPause .pb.bad{border-color:#e0503a;color:#ffb3a6}' +
    '#gkPause .sr{display:grid;grid-template-columns:1fr minmax(120px,1.1fr) 52px;gap:8px;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:16px}#gkPause .sr output{text-align:right;color:#c9c3b0}' +
    '#gkPause .kr{display:flex;gap:10px;align-items:center;padding:4px 0;font-size:16px}#gkPause .kr .ks{flex:0 0 150px}#gkPause kbd{display:inline-block;min-width:26px;margin-right:4px;padding:2px 7px;text-align:center;font:700 14px/1.3 var(--ui,system-ui);color:#f5d27a;background:#1d1810;border:1px solid #a8741a;border-radius:4px}' +
    '#gkPause .pp.wide{width:min(960px,96vw)}#gkPause .cg{columns:2 380px;column-gap:28px}#gkPause .cgr{break-inside:avoid}#gkPause .kr{padding:2px 0;font-size:15px}#gkPause .kr .ks{flex:0 0 130px}' +
    '#gkPause .note{margin-top:10px;font-size:15px;color:#c9c3b0}#gkMenuBtn{position:fixed;right:max(10px,1vw);bottom:max(10px,1.5vh);z-index:30;display:none;padding:6px 12px;font:700 14px/1 var(--ui,system-ui);letter-spacing:.1em;text-transform:uppercase;color:#efe9d8;background:rgba(12,10,8,.84);border:1px solid rgba(245,196,81,.5);border-radius:3px;cursor:pointer;opacity:.78}' +
    '#gkMenuBtn:hover,#gkMenuBtn:focus-visible{opacity:1;outline:2px solid rgba(255,106,42,.85)}#gkMenuBtn small{margin-left:6px;color:#a39e8e;font-weight:600;letter-spacing:.04em}@media (max-width:780px){#gkMenuBtn small{display:none}}';

  const persist = () => { try { localStorage.setItem('gk.settings', JSON.stringify(GK.settings)); } catch (e) {} };
  const howOpen = () => !!document.getElementById('gkHowTo');
  function applyAudio() { try { window.GKAUDIO && GKAUDIO.refresh(); } catch (e) {} }
  function setMute(v) { GK.settings.mute = !!v; persist(); applyAudio(); if (GK.toastNote) GK.toastNote(v ? 'Sound muted (N)' : 'Sound on (N)'); }

  function build() {
    const st = $('style'); st.textContent = css; document.head.appendChild(st);
    ov = $('div'); ov.id = 'gkPause'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Menu');
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    btn = $('button', null, 'Menu'); btn.id = 'gkMenuBtn'; btn.type = 'button'; btn.title = 'Open the menu (Esc or P)';
    btn.appendChild($('small', null, 'Esc'));
    btn.addEventListener('click', () => open('main'));
    document.body.appendChild(btn);
  }
  function box(title) { ov.textContent = ''; const p = $('div', 'pp'); p.appendChild($('h2', null, title)); ov.appendChild(p); return p; }
  function backBtn(p) { const b = $('button', 'pb', 'Back'); b.type = 'button'; b.onclick = () => show('main'); p.appendChild(b); return b; }
  function show(v) {
    view = v; let p, first = null;
    if (v === 'main') {
      p = box('Menu');
      for (const en of PAUSE_ENTRIES) { const b = $('button', 'pb' + (en.id === 'leave' ? ' bad' : ''), en.t); b.type = 'button'; b.onclick = () => act(en.id); p.appendChild(b); if (!first) first = b; }
      p.appendChild($('div', 'note', 'The match keeps running while this menu is open.'));
    } else if (v === 'settings') {
      p = box('Settings');
      for (const sec of SETTINGS) {
        p.appendChild($('h3', null, sec.name));
        for (const r of sec.rows) {
          const row = $('div', 'sr'), lab = $('label', null, r.label), id = 'pz-' + r.key; lab.htmlFor = id; row.appendChild(lab);
          const cur = GK.settings[r.key]; let inp, out = $('output');
          if (r.type === 'select') { inp = $('select'); for (const [v2, n] of r.opts) { const o = $('option', null, n); o.value = v2; inp.appendChild(o); } inp.value = cur || 'high'; inp.onchange = () => { try { localStorage.setItem('gk.gfxAuto', 'user'); } catch (e) {} GK.settings.gfx = inp.value; GK.settings.fx = inp.value !== 'low'; persist(); GK.applySettings(); }; }
          else if (r.type === 'check') { inp = $('input'); inp.type = 'checkbox'; inp.checked = r.key === 'mute' ? !!cur : cur !== false; inp.onchange = () => { GK.settings[r.key] = inp.checked; persist(); if (r.key === 'mute') applyAudio(); else GK.applySettings(); if (r.key === 'minimap' || r.key === 'mmNorth') try { GK.minimap && GK.minimap.redraw(); } catch (e) {} }; }
          else { inp = $('input'); inp.type = 'range'; inp.min = r.min; inp.max = r.max; inp.step = r.step; inp.value = cur == null ? r.min : cur; out.textContent = fmtVal(r, inp.value); inp.oninput = () => { GK.settings[r.key] = +inp.value; out.textContent = fmtVal(r, inp.value); persist(); GK.applySettings(); }; }
          inp.id = id; row.appendChild(inp); row.appendChild(out); p.appendChild(row); if (!first) first = inp;
        }
      }
      backBtn(p);
    } else if (v === 'controls') {
      p = box('Controls');
      p.classList.add('wide'); const cg = $('div', 'cg'); p.appendChild(cg);   // two columns: the whole list fits at 720p
      for (const g of CHEAT) { const gd = $('div', 'cgr'); gd.appendChild($('h3', null, g.group)); for (const k of g.keys) { const r = $('div', 'kr'), ks = $('span', 'ks'); for (const x of k.k) ks.appendChild($('kbd', null, x.trim())); r.appendChild(ks); r.appendChild($('span', null, k.t)); gd.appendChild(r); } cg.appendChild(gd); }
      first = backBtn(p);
    } else if (v === 'stats') {
      p = box('Stats'); const holder = $('div'); p.appendChild(holder);
      try { window.GKSTATSUI ? GKSTATSUI.render(holder, {}) : holder.appendChild($('div', 'note', 'No stats yet.')); } catch (e) { holder.appendChild($('div', 'note', 'Stats are not available right now.')); }
      first = backBtn(p);
    } else if (v === 'leave') {
      p = box('Leave game?');
      p.appendChild($('div', 'note', 'You return to the main menu. The server treats it as a normal disconnect and you lose the items you are carrying in this match.'));
      const stay = $('button', 'pb', 'Stay in the match'); stay.type = 'button'; stay.onclick = () => show('main'); p.appendChild(stay); first = stay;
      const go = $('button', 'pb bad', 'Leave and lose my items'); go.type = 'button'; go.onclick = leave; p.appendChild(go);
    }
    if (first && first.focus) try { first.focus({ preventScroll: true }); } catch (e) {}
  }
  function act(id) {
    if (id === 'resume') close();
    else if (id === 'how') { if (GK.howTo) GK.howTo.open(); }
    else if (id === 'codex') window.open('/codex', '_blank', 'noopener');
    else if (id === 'report') { window.open('/privacy', '_blank', 'noopener'); }
    else show(id);
  }
  function leave() { paused = false; GK.pauseOpen = false; try { sessionStorage.setItem('gk.left', '1'); } catch (e) {} location.reload(); }   // the socket closes: a normal disconnect; the title menu comes back
  function open(v) {
    if (!ov) build();
    if (GK.mode !== 'play') return;
    paused = true; GK.pauseOpen = true; ov.classList.add('on'); show(v || 'main');
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}   // fullscreen stays: only the pointer is released
  }
  function close() {
    if (!paused) return;
    paused = false; GK.pauseOpen = false; ov.classList.remove('on'); ov.textContent = '';
    if (GK.requestLock) GK.requestLock();   // may need the next click or key when the browser wants a gesture: fskeep.js retakes it
  }
  function state(e) { return { code: e.code, mode: GK.mode, panel: !!(GK.panelOpen && GK.panelOpen()) && !paused, paused, view, howOpen: howOpen(), inField: !!(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || '') && e.target.type !== 'checkbox' && e.target.type !== 'range') }; }

  function install() {
    GK = window.GK; build();
    const pOpen = GK.panelOpen, pClose = GK.closePanels;
    GK.panelOpen = () => paused || (pOpen ? pOpen() : false);
    GK.closePanels = () => { if (paused) close(); if (pClose) pClose(); };
    GK.uiorg = { open, close, show, isOpen: () => paused, setMute };
    addEventListener('keydown', e => {   // capture, before game.js and every panel
      if (GK.mode !== 'play' && !paused) return;
      if (paused) {
        if (howOpen()) return;
        const a = escAction(state(e));
        if (a === 'close') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
        if (a === 'back') { e.preventDefault(); e.stopImmediatePropagation(); show('main'); return; }
        if (cheatKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); show(view === 'controls' ? 'main' : 'controls'); return; }
        e.stopImmediatePropagation();   // movement and every other key are ignored while the menu is open
        return;
      }
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName || '') && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
      if (muteKey(e) && !(GK.panelOpen && GK.panelOpen())) { setMute(!GK.settings.mute); return; }
      if (cheatKey(e) && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); open('controls'); return; }
      if (!e.repeat && escAction(state(e)) === 'open') { e.preventDefault(); e.stopImmediatePropagation(); open('main'); }
    }, true);
    document.addEventListener('pointerlockchange', () => {   // Esc in a locked, non-fullscreen page never reaches keydown: the lock loss is the signal
      if (document.pointerLockElement) return;
      setTimeout(() => {
        if (document.pointerLockElement) return;
        if (openOnLockLoss({ mode: GK.mode, panel: !!(GK.panelOpen && GK.panelOpen()), paused, howOpen: howOpen(), focused: document.hasFocus(), visible: document.visibilityState === 'visible' })) open('main');
      }, 140);
    });
    setInterval(() => { const on = GK.mode === 'play' && !paused; if (btn) btn.style.display = on ? 'block' : 'none'; if (paused && GK.mode !== 'play') { paused = false; GK.pauseOpen = false; ov.classList.remove('on'); } }, 250);
    document.addEventListener('visibilitychange', () => { if (document.hidden) last = performance.now(); });
  }
  const poll = setInterval(() => { if (window.GK && window.GK.panelOpen && document.body && !window.GK.uiorg) { clearInterval(poll); try { install(); } catch (e) { console.warn('uiorg', e); } } }, 150);
})(typeof self !== 'undefined' ? self : this);

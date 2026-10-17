// CAMTERM: the Camera Terminal (home base upgrade 'camera', docs/reports/camera-terminal.md). UMD: the rules and the frame builder are pure (no clock, no RNG, no server state) and shared by server.js and the
// tests; createCamUI() is the browser overlay (a 2D schematic live view drawn from the frames the server sends; nothing is rendered in 3D).
// Wire: client {cam:{open:1}} {cam:{room:'7'}} {cam:{close:1}}; server {cam:frame} 4 Hz while a session runs, {cam:null} when it ends, {camRes:{ok, reason?}} for refusals.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKCAM = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const LEVELS = [null,
    { feedMs: 120000, meterMs: 15000, vault: false },   // L1: arena rooms only, a 2 minute feed, 1 elixir per 15 s
    { feedMs: 300000, meterMs: 20000, vault: true }];   // L2: the Vault too, a 5 minute feed, 1 elixir per 20 s
  const OPEN_COST = 2, METER_COST = 1, GAP_MS = 250, HEARTBEAT_MS = 1000, RANGE = 2.5, FIRST_ROUND = 2, SPOT_COOLDOWN_MS = 20000;
  const MAX_GOBS = 16, MAX_FOES = 12, MAX_DROPS = 12, MAX_DOORS = 8;
  const params = lv => LEVELS[Math.max(0, Math.min(2, lv | 0))];
  const r1 = v => Math.round(v * 10) / 10, clip = (s, n) => String(s == null ? '' : s).slice(0, n);

  // May this goblin open or keep a session? c = {lv, round, sudden, showdown, alive, entered, homeDead, atTerminal}. Returns null or a reason (shown to the player).
  function gate(c) {
    if (!c || !params(c.lv)) return 'Buy the Camera Terminal first';
    if (!c.alive || !c.entered) return 'state';
    if (c.homeDead) return 'This home is dead';
    if (!c.atTerminal) return 'Too far from the terminal';
    if (c.sudden || c.showdown) return 'The feed is dead in the final showdown';
    if ((c.round | 0) < FIRST_ROUND) return 'Cameras go live in round ' + FIRST_ROUND;
    return null;
  }
  // Which rooms can be watched: arena cells only (halls, trees, vaultbreakers are arena cells); the Vault needs L2; never a home. Returns null or a reason.
  function viewable(lv, room, isArena, vaultKey) {
    if (typeof room !== 'string' || room.length > 3 || !isArena(room)) return 'No camera there';
    if (room === vaultKey && !(params(lv) || {}).vault) return 'Camera tier II needed for the Vault';
    return null;
  }
  // A session is a plain object kept on the player; step() says what the server must do now: {end:reason} | {charge:n, send:bool} | {send:bool} | null.
  const newSession = (now, lv, room) => ({ room, lv, since: now, until: now + params(lv).feedMs, meterAt: now + params(lv).meterMs, sentAt: 0, last: '' });
  function step(s, now, elixir) {
    if (now >= s.until) return { end: 'The feed timed out' };
    let charge = 0;
    if (now >= s.meterAt) {
      if ((elixir | 0) < METER_COST) return { end: 'Out of elixir' };
      charge = METER_COST; s.meterAt += params(s.lv).meterMs;
    }
    return { charge, send: now - s.sentAt >= GAP_MS };
  }
  // The server skips a frame identical to the last one unless a heartbeat is due (keeps the countdown alive).
  function shouldSend(s, json, now) { if (json === s.last && now - s.sentAt < HEARTBEAT_MS) return false; s.last = json; s.sentAt = now; return true; }

  // view = {room, name, w, d, goblins:[{id,name,x,z,hp}], foes:[{name,x,z,hp}], drops:[{x,z,n}], doors:[{side,off,open}], hidden, crown}; x/z are metres from the room centre (the server subtracts the centre).
  // Only these fields ever reach the wire: no inventories, no gold, no vault picks, no held Hollow Oak (a hidden room shows no occupants at all).
  function frame(view, s, now) {
    const f = { room: view.room, name: clip(view.name, 24), w: r1(view.w), d: r1(view.d), left: Math.max(0, s.until - now), lv: s.lv, doors: [], g: [], f: [], i: [] };
    for (const d of (view.doors || []).slice(0, MAX_DOORS)) f.doors.push([d.side, r1(d.off), d.open ? 1 : 0]);
    if (view.hidden) { f.hid = 1; return f; }
    for (const g of (view.goblins || []).slice(0, MAX_GOBS)) f.g.push([g.id | 0, clip(g.name, 16), r1(g.x), r1(g.z), Math.max(0, Math.min(100, Math.round(g.hp * 20) * 5))]);
    for (const g of (view.foes || []).slice(0, MAX_FOES)) f.f.push([clip(g.name, 16), r1(g.x), r1(g.z), Math.max(0, Math.min(100, Math.round(g.hp * 20) * 5))]);
    for (const d of (view.drops || []).slice(0, MAX_DROPS)) f.i.push([r1(d.x), r1(d.z), Math.min(9, d.n | 0)]);
    if (view.crown) f.crown = clip(view.crown, 16);
    return f;
  }

  // ---------------------------------------------------------------- browser overlay
  function createCamUI(opts) {
    const G = typeof window !== 'undefined' ? window : null; if (!G) return null;
    const doc = G.document, root = opts.root || doc.body, send = opts.send || (() => {}), snd = opts.snd || (() => {}), N = opts.n || 5, VK = String(opts.vaultKey), say0 = opts.label || (k => 'Room ' + k);
    if (!doc.getElementById('ctCss')) {
      const st = doc.createElement('style'); st.id = 'ctCss'; st.textContent = `
.ct-screen{position:fixed;inset:0;z-index:57;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.78);font-family:'Barlow Condensed','Arial Narrow',system-ui,sans-serif;color:#cfeedd;user-select:none;zoom:var(--uis,1)}
.ct-screen.on{display:flex}.ct-win{width:min(900px,95vw);max-height:94vh;display:flex;flex-direction:column;gap:8px;padding:12px 16px;background:#08120d;border:1px solid #2f7a52;border-top:3px solid #4cf07a;box-shadow:0 0 40px rgba(76,240,122,.12)}
.ct-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.ct-ttl{font:700 clamp(18px,3vh,26px) 'Cinzel Decorative',Georgia,serif;letter-spacing:.08em;color:#8dffb0;margin-right:auto}
.ct-meta{font-size:clamp(13px,2vh,16px);letter-spacing:.08em;color:#8fb8a0}.ct-meta b{color:#bdeaff}
.ct-main{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;min-height:0}
.ct-view{position:relative;background:#03100a;border:1px solid #1f5a3a;aspect-ratio:4/3;overflow:hidden}.ct-view canvas{width:100%;height:100%;display:block}
.ct-view::after{content:"";position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px)}
.ct-tag{position:absolute;left:8px;top:6px;font-size:clamp(12px,1.9vh,15px);letter-spacing:.14em;color:#8dffb0;z-index:1}.ct-rec{position:absolute;right:10px;top:6px;color:#ff6a5a;font-size:clamp(12px,1.9vh,15px);letter-spacing:.14em;z-index:1}
.ct-grid{display:grid;gap:3px;align-content:start}.ct-c{appearance:none;width:clamp(30px,5.4vh,44px);height:clamp(30px,5.4vh,44px);padding:0;border:1px solid #1f5a3a;background:#0b1d14;color:#8fb8a0;font:600 clamp(10px,1.6vh,13px) inherit;cursor:pointer}
.ct-c:hover:not(:disabled){border-color:#4cf07a;color:#fff}.ct-c.on{background:#1c5a38;color:#fff;border-color:#4cf07a}.ct-c.v{color:#ffe39a}.ct-c:disabled{opacity:.35;cursor:not-allowed}
.ct-pad{display:flex;gap:6px;margin-top:8px}.ct-b{appearance:none;cursor:pointer;flex:1;padding:6px 10px;border:1px solid #2f7a52;background:#0b1d14;color:#bdf5d0;font:700 clamp(13px,2vh,16px) inherit;letter-spacing:.12em}.ct-b:hover{border-color:#4cf07a;color:#fff}
.ct-foot{display:flex;align-items:center;gap:12px}.ct-msg{flex:1;min-height:1.3em;font-size:clamp(13px,2vh,16px);letter-spacing:.04em}.ct-keys{color:#6f9a82;font-size:clamp(12px,1.8vh,13px);letter-spacing:.08em}
@media (max-width:760px){.ct-main{grid-template-columns:1fr}.ct-keys{display:none}}`; doc.head.appendChild(st);
    }
    const scr = doc.createElement('div'); scr.className = 'ct-screen'; scr.id = 'gkCam'; scr.setAttribute('role', 'dialog'); scr.setAttribute('aria-label', 'Camera Terminal');
    scr.innerHTML = '<div class="ct-win"><div class="ct-head"><div class="ct-ttl">CAMERA TERMINAL</div><div class="ct-meta"></div></div><div class="ct-main"><div class="ct-view"><div class="ct-tag"></div><div class="ct-rec"></div><canvas width="480" height="360"></canvas></div>'
      + '<div><div class="ct-grid"></div><div class="ct-pad"><button class="ct-b" data-d="-1" aria-label="Previous room">&#9664;</button><button class="ct-b" data-d="1" aria-label="Next room">&#9654;</button></div></div></div>'
      + '<div class="ct-foot"><div class="ct-msg" aria-live="polite"></div><div class="ct-keys">ARROWS CYCLE &nbsp; E CLOSE</div><button class="ct-b" data-x="1" style="flex:none">CLOSE (E)</button></div></div>';
    root.appendChild(scr);
    const cv = scr.querySelector('canvas'), g2 = cv.getContext('2d'), grid = scr.querySelector('.ct-grid'), meta = scr.querySelector('.ct-meta'), tag = scr.querySelector('.ct-tag'), rec = scr.querySelector('.ct-rec'), msg = scr.querySelector('.ct-msg');
    grid.style.gridTemplateColumns = 'repeat(' + N + ',auto)';
    let isOpen = false, lv = 1, cur = null, fr = null, frAt = 0, elixir = 0, msgT = 0, raf = 0;
    const say = (t, good) => { msg.textContent = t || ''; msg.style.color = good ? '#8be28b' : '#ff8a7a'; clearTimeout(msgT); if (t) msgT = setTimeout(() => { msg.textContent = ''; }, 2600); };
    const cells = []; for (let i = 0; i < N * N; i++) cells.push(String(i));
    grid.innerHTML = cells.map(k => '<button class="ct-c' + (k === VK ? ' v' : '') + '" data-room="' + k + '" title="' + say0(k) + '">' + (k === VK ? 'V' : (+k % N + 1) + '.' + (Math.floor(+k / N) + 1)) + '</button>').join('');
    const usable = k => k !== VK || lv >= 2;
    const mark = () => { for (const b of grid.children) { b.classList.toggle('on', b.dataset.room === cur); b.disabled = !usable(b.dataset.room); } };
    function pick(k) { if (!usable(k)) { say('Camera tier II needed for the Vault'); snd('deny'); return; } cur = k; fr = null; mark(); send({ cam: { room: k } }); snd('uiClick'); draw(); }
    function cycle(d) { let i = cells.indexOf(cur); for (let n = 0; n < cells.length; n++) { i = (i + d + cells.length) % cells.length; if (usable(cells[i])) return pick(cells[i]); } }
    function meterText() { const p = LEVELS[lv] || LEVELS[1]; return 'FEED <b>' + (fr ? Math.max(0, Math.ceil((fr.left - (Date.now() - frAt)) / 1000)) : 0) + ' s</b> &nbsp; COST <b>' + METER_COST + '</b> per ' + p.meterMs / 1000 + ' s &nbsp; ELIXIR <b>' + (elixir | 0) + '</b>'; }
    function draw() {
      const W = cv.width, H = cv.height; g2.fillStyle = '#03100a'; g2.fillRect(0, 0, W, H);
      meta.innerHTML = meterText(); tag.textContent = fr ? (fr.name || say0(fr.room)).toUpperCase() : 'NO SIGNAL'; rec.textContent = fr && !fr.hid ? 'REC' : '';
      if (!fr) { g2.fillStyle = '#2f7a52'; g2.font = '20px monospace'; g2.textAlign = 'center'; g2.fillText(cur ? 'CONNECTING...' : 'PICK A ROOM', W / 2, H / 2); return; }
      const pad = 34, sc = Math.min((W - pad * 2) / fr.w, (H - pad * 2) / fr.d), cx = W / 2, cy = H / 2, X = x => cx + x * sc, Z = z => cy + z * sc;
      g2.strokeStyle = '#1f7a4a'; g2.lineWidth = 2; g2.strokeRect(X(-fr.w / 2), Z(-fr.d / 2), fr.w * sc, fr.d * sc);
      g2.strokeStyle = 'rgba(76,240,122,.07)'; g2.lineWidth = 1; for (let x = -fr.w / 2 + 2; x < fr.w / 2; x += 2) { g2.beginPath(); g2.moveTo(X(x), Z(-fr.d / 2)); g2.lineTo(X(x), Z(fr.d / 2)); g2.stroke(); } for (let z = -fr.d / 2 + 2; z < fr.d / 2; z += 2) { g2.beginPath(); g2.moveTo(X(-fr.w / 2), Z(z)); g2.lineTo(X(fr.w / 2), Z(z)); g2.stroke(); }
      for (const [side, off, open] of fr.doors) {   // a door is a bar on its wall: green and thin when open, red and thick when shut
        const h = side === 'E' || side === 'W', x = h ? (side === 'E' ? fr.w / 2 : -fr.w / 2) : off, z = h ? off : (side === 'S' ? fr.d / 2 : -fr.d / 2);
        g2.strokeStyle = open ? '#4cf07a' : '#ff5a4a'; g2.lineWidth = open ? 3 : 7; g2.beginPath(); if (h) { g2.moveTo(X(x), Z(z - 1.3)); g2.lineTo(X(x), Z(z + 1.3)); } else { g2.moveTo(X(x - 1.3), Z(z)); g2.lineTo(X(x + 1.3), Z(z)); } g2.stroke();
      }
      if (fr.hid) { g2.fillStyle = '#6f9a82'; g2.font = '22px monospace'; g2.textAlign = 'center'; g2.fillText('SIGNAL LOST', cx, cy); return; }
      if (fr.crown) { g2.strokeStyle = '#ffd75e'; g2.lineWidth = 2; g2.beginPath(); g2.arc(cx, cy, 2.2 * sc, 0, 6.3); g2.stroke(); g2.fillStyle = '#ffd75e'; g2.font = '14px monospace'; g2.textAlign = 'center'; g2.fillText('CROWN: ' + fr.crown, cx, Z(-fr.d / 2) + 16); }
      g2.fillStyle = '#ffd75e'; for (const [x, z, n] of fr.i) { g2.fillRect(X(x) - 5, Z(z) - 5, 10, 10); if (n > 1) { g2.fillStyle = '#000'; g2.font = '9px monospace'; g2.textAlign = 'center'; g2.fillText(n, X(x), Z(z) + 3); g2.fillStyle = '#ffd75e'; } }
      g2.font = '13px monospace'; g2.textAlign = 'center';
      for (const [name, x, z, hp] of fr.f) { g2.strokeStyle = '#ff5a4a'; g2.lineWidth = 2; g2.beginPath(); g2.moveTo(X(x) - 5, Z(z) - 5); g2.lineTo(X(x) + 5, Z(z) + 5); g2.moveTo(X(x) + 5, Z(z) - 5); g2.lineTo(X(x) - 5, Z(z) + 5); g2.stroke(); g2.fillStyle = '#ff9a8a'; g2.fillText(name, X(x), Z(z) - 9); }
      for (const [id, name, x, z, hp] of fr.g) {
        const col = 'hsl(' + (id * 67 % 360) + ',80%,62%)'; g2.fillStyle = col; g2.beginPath(); g2.arc(X(x), Z(z), 6, 0, 6.3); g2.fill();
        g2.fillStyle = '#000'; g2.fillRect(X(x) - 13, Z(z) + 9, 26, 4); g2.fillStyle = hp > 50 ? '#4cf07a' : hp > 25 ? '#ffd75e' : '#ff5a4a'; g2.fillRect(X(x) - 13, Z(z) + 9, 26 * hp / 100, 4);
        g2.fillStyle = col; g2.fillText(name, X(x), Z(z) - 10);
      }
      if (!fr.g.length && !fr.f.length) { g2.fillStyle = '#2f7a52'; g2.font = '14px monospace'; g2.fillText('EMPTY', cx, Z(fr.d / 2) - 10); }
    }
    function loop() { if (!isOpen) return; draw(); raf = G.setTimeout(loop, 500); }   // the countdown only; frames redraw on arrival
    scr.addEventListener('click', e => {
      if (e.target === scr) return close(true);
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.x) close(true); else if (b.dataset.d) cycle(+b.dataset.d); else if (b.dataset.room) pick(b.dataset.room);
    });
    G.addEventListener('keydown', e => {
      if (!isOpen) return; const k = e.key; let used = true;
      if (k === 'Escape' || ((k === 'e' || k === 'E') && !e.repeat)) close(true);
      else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'd' || k === 'D') cycle(1); else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'a' || k === 'A') cycle(-1); else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); } else if (!/^F\d|^Control|^Shift|^Alt|^Meta|^Tab/.test(k)) e.stopPropagation();
    }, true);
    function open(o) {   // o = {level, elixir, room?}: the session itself starts when the server accepts {cam:{open:1}}
      lv = o.level || 1; elixir = o.elixir | 0; isOpen = true; fr = null; cur = o.room && usable(o.room) ? o.room : (cur && usable(cur) ? cur : cells.find(usable)); scr.classList.add('on'); mark(); say('');
      send({ cam: { open: 1 } }); send({ cam: { room: cur } }); snd('panel'); draw(); G.clearTimeout(raf); loop();
    }
    function close(notify) { if (!isOpen) return; isOpen = false; scr.classList.remove('on'); G.clearTimeout(raf); send({ cam: { close: 1 } }); if (notify && typeof opts.onClose === 'function') opts.onClose(); }
    function frame(f) { if (!isOpen) return; if (f === null) { fr = null; draw(); return; } fr = f; frAt = Date.now(); if (f.room === cur) draw(); }
    function result(r) { if (!r || !isOpen) return; if (!r.ok) { say(r.reason || 'Refused'); snd('deny'); if (r.end) { fr = null; draw(); } } }
    return { open, close, frame, result, setElixir: n => { elixir = n | 0; }, isOpen: () => isOpen, el: scr };
  }
  return { LEVELS, OPEN_COST, METER_COST, GAP_MS, HEARTBEAT_MS, RANGE, FIRST_ROUND, SPOT_COOLDOWN_MS, MAX_GOBS, MAX_FOES, MAX_DROPS, params, gate, viewable, newSession, step, shouldSend, frame, createCamUI };
});

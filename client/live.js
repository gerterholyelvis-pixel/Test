// LIVE (docs/reports/release-2.md): what a public server needs on the client. Classic script, loaded in the page head with `defer`; touches game.js only through
// window.GKR2 (four one-line hooks: onMsg, closed, joinUrl, muted).
//   1. version check: a new deploy shows a small "reload" pill (on a closed socket, when the tab comes back, every 10 min); a server shutdown ({bye}) says so
//   2. private rooms: footer "Friends" dialog, ?room=CODE on the join URL, queue status line (room code, countdown, honest bot count, host Start button)
//   3. quick chat + mute + report (key H): no free text exists, only 8 fixed phrases
(function () {
  'use strict';
  var W = window, D = document, KEY = 'gk.live.v1';
  var el = function (t, a, x) { var e = D.createElement(t); if (a) for (var k in a) e.setAttribute(k, a[k]); if (x != null) e.textContent = x; return e; };
  var store = { get: function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }, set: function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} } };
  var ss = function (k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} return null; };

  var css = el('style'); css.textContent = [
    '.gkr-pill{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99990;max-width:min(92vw,560px);background:#16130c;border:1px solid #f5c451;color:#efe9d8;font:600 15px/1.3 "Barlow Condensed",Arial,sans-serif;letter-spacing:.03em;padding:8px 14px;border-radius:6px;box-shadow:0 4px 18px #000a;display:flex;gap:12px;align-items:center}',
    '.gkr-pill button,.gkr-btn{font:600 14px "Barlow Condensed",Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;background:#f5c451;color:#1a1508;border:0;border-radius:4px;padding:5px 12px;cursor:pointer}',
    '.gkr-pill button.alt,.gkr-btn.alt{background:transparent;color:#efe9d8;border:1px solid #6b5f3c}',
    '.gkr-feed{position:fixed;left:14px;bottom:150px;z-index:9990;display:flex;flex-direction:column;gap:3px;pointer-events:none;font:600 16px "Barlow Condensed",Arial,sans-serif;max-width:40vw}',
    '.gkr-feed div{background:#0b0b0ecc;border-left:3px solid #f5c451;color:#efe9d8;padding:3px 9px;border-radius:0 4px 4px 0;animation:gkrIn .2s ease-out}',
    '@keyframes gkrIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}',
    '.gkr-panel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99991;width:min(94vw,520px);max-height:88vh;overflow:auto;background:#12100aee;border:1px solid #f5c451;border-radius:8px;color:#efe9d8;font:16px/1.4 "Barlow Condensed",Arial,sans-serif;padding:16px 18px;box-shadow:0 10px 40px #000c}',
    '.gkr-panel h2{margin:0 0 8px;font-size:24px;color:#f5c451;letter-spacing:.08em;text-transform:uppercase}.gkr-panel h3{margin:12px 0 4px;font-size:15px;color:#c9b77a;letter-spacing:.1em;text-transform:uppercase}',
    '.gkr-panel p{margin:4px 0;color:#d8d0b8}.gkr-panel input{font:600 22px "Barlow Condensed",Arial,sans-serif;letter-spacing:.3em;text-transform:uppercase;width:7em;background:#0b0b0e;color:#fff;border:1px solid #6b5f3c;border-radius:4px;padding:4px 8px;text-align:center}',
    '.gkr-q{display:grid;grid-template-columns:1fr 1fr;gap:6px}.gkr-q button{text-align:left}.gkr-q b{color:#f5c451;margin-right:6px}',
    '.gkr-row{display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #2a2415}.gkr-row span:first-child{flex:1}.gkr-tag{font-size:12px;border:1px solid #6b5f3c;border-radius:3px;padding:0 5px;color:#c9b77a;letter-spacing:.1em}',
    '#qbox .gkr-qi{margin-top:8px;font:600 17px/1.35 "Barlow Condensed",Arial,sans-serif;color:#efe9d8;text-align:center;letter-spacing:.04em}#qbox .gkr-qi b{color:#f5c451;letter-spacing:.2em}',
    '#menu .foot button.gkr-link{background:none;border:0;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;padding:0;margin-right:10px}'
  ].join('\n'); D.head.appendChild(css);

  // ---- tiny helpers ----
  var pillEl = null;
  function pill(msg, btns) {   // one pill at a time at the top
    if (pillEl) pillEl.remove(); pillEl = el('div', { 'class': 'gkr-pill', role: 'alert' }); pillEl.appendChild(el('span', null, msg));
    (btns || []).forEach(function (b) { var x = el('button', b.alt ? { 'class': 'alt' } : null, b.label); x.onclick = function () { if (b.go) b.go(); if (b.close !== false && pillEl) { pillEl.remove(); pillEl = null; } }; pillEl.appendChild(x); });
    D.body.appendChild(pillEl); return pillEl;
  }
  var feed = null;
  function feedLine(text, ms) { if (!feed) { feed = el('div', { 'class': 'gkr-feed', 'aria-live': 'polite' }); D.body.appendChild(feed); } var d = el('div', null, text); feed.appendChild(d); while (feed.children.length > 4) feed.firstChild.remove(); setTimeout(function () { d.remove(); }, ms || 6000); }
  var inPlay = function () { return W.GK && W.GK.mode === 'play'; };

  // ---- 1. version check and shutdown notice ----
  var base = null, shown = false;
  function getVer() { return fetch('/version', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
  getVer().then(function (v) { if (v) base = v; });
  function check() {
    if (shown) return; getVer().then(function (v) {
      if (!v || !base || shown) return; if (v.version === base.version && (!v.commit || !base.commit || v.commit === base.commit)) return;
      shown = true; var live = inPlay();
      pill(live ? 'A new version is out. Reload after this match.' : 'A new version of Goblin King is out.', [{ label: 'Reload', go: function () { location.reload(); } }, { label: 'Later', alt: true, go: function () { shown = false; base = v; } }]);
    });
  }
  setInterval(check, 10 * 60 * 1000);
  D.addEventListener('visibilitychange', function () { if (!D.hidden) check(); });

  // ---- 2. private rooms ----
  var ROOM_RE = /^[A-Z0-9]{3,6}$/;
  var room = (function () { var r = String(ss('gk.room') || '').toUpperCase(); return ROOM_RE.test(r) ? r : ''; })();
  var CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newCode() { var s = '', a = new Uint32Array(4); (W.crypto || W.msCrypto).getRandomValues(a); for (var i = 0; i < 4; i++) s += CODE_CH[a[i] % CODE_CH.length]; return s; }
  function setRoom(c) { room = c || ''; ss('gk.room', room || null); footer(); }
  var dlg = null;
  function closeDlg() { if (dlg) { dlg.remove(); dlg = null; } }
  function friends() {
    closeDlg(); dlg = el('div', { 'class': 'gkr-panel', role: 'dialog', 'aria-label': 'Play with friends' });
    dlg.appendChild(el('h2', null, 'Play with friends'));
    dlg.appendChild(el('p', null, 'Everyone who enters the same room code plays in the same match. Empty seats are filled with bots (they are marked as bots). The first player in the room can start early.'));
    var row = el('div', { style: 'display:flex;gap:10px;align-items:center;margin:12px 0;flex-wrap:wrap' }), inp = el('input', { maxlength: '6', placeholder: 'CODE', 'aria-label': 'Room code', autocomplete: 'off', spellcheck: 'false' });
    inp.value = room; inp.addEventListener('keydown', function (e) { e.stopPropagation(); });
    var join = el('button', { 'class': 'gkr-btn' }, 'Use this code'), make = el('button', { 'class': 'gkr-btn alt' }, 'Make a new code');
    make.onclick = function () { inp.value = newCode(); }; join.onclick = function () { var c = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!ROOM_RE.test(c)) { inp.style.borderColor = '#d33'; return; } setRoom(c); closeDlg(); pill('Room ' + c + ' is set. Press Start, then tell your friends the code.', [{ label: 'OK' }]); };
    row.appendChild(inp); row.appendChild(join); row.appendChild(make); dlg.appendChild(row);
    var foot = el('div', { style: 'display:flex;gap:8px;justify-content:space-between' });
    var leave = el('button', { 'class': 'gkr-btn alt' }, room ? 'Back to public matches' : 'Close'); leave.onclick = function () { if (room) setRoom(''); closeDlg(); };
    foot.appendChild(leave); if (room) { var keep = el('button', { 'class': 'gkr-btn' }, 'Close'); keep.onclick = closeDlg; foot.appendChild(keep); } dlg.appendChild(foot);
    D.body.appendChild(dlg); inp.focus();
  }
  function footer() {
    var f = D.querySelector('#menu .foot'); if (!f) return; var b = f.querySelector('.gkr-friends');
    if (!b) { b = el('button', { 'class': 'gkr-link gkr-friends', type: 'button' }); b.onclick = friends; f.insertBefore(b, f.firstChild); var c = el('button', { 'class': 'gkr-link', type: 'button' }, 'Credits'); c.onclick = function () { W.open('/credits', '_blank', 'noopener'); }; f.appendChild(c); }
    b.textContent = room ? 'Room ' + room : 'Play with friends';
  }
  // the queue line under "Finding goblins N/8"
  var qi = null, qd = null, hostNow = false;
  function queueInfo(q) {
    var box = D.getElementById('qbox'); if (!box) return;
    if (!qi) { qi = el('div', { 'class': 'gkr-qi', 'aria-live': 'polite' }); box.insertBefore(qi, D.getElementById('qcancel')); }
    qd = { at: performance.now(), q: q }; paintQueue();
  }
  function paintQueue() {
    if (!qi || !qd) return; var q = qd.q, left = Math.max(0, Math.ceil((q.ms - q.since - (performance.now() - qd.at)) / 1000)), bots = Math.max(0, q.size - q.n);
    qi.textContent = ''; if (q.room) { qi.appendChild(D.createTextNode('Room ')); qi.appendChild(el('b', null, q.room)); qi.appendChild(D.createTextNode(' - share this code. ')); }
    qi.appendChild(D.createTextNode((q.n >= q.size ? 'Full. Starting now.' : 'Starts in ' + left + ' s or when ' + q.size + ' goblins join. ' + (bots ? bots + ' empty seat' + (bots > 1 ? 's' : '') + ' will be filled with bots (marked as bots).' : ''))));
    if (hostNow && q.room) { var s = el('button', { 'class': 'gkr-btn', style: 'margin-left:10px' }, 'Start now'); s.onclick = function () { try { W.GK.net.send({ start: 1 }); } catch (e) {} s.disabled = true; }; qi.appendChild(s); }
  }
  setInterval(function () { if (qd && qi && qi.isConnected && qd.q) paintQueue(); }, 1000);

  // ---- 3. roster, quick chat, mute, report ----
  var QUICK = ['Hello!', 'Good luck!', 'Thanks!', 'Nice one!', 'Truce?', 'Help!', 'Watch out!', 'Good game!'];
  var REASONS = ['Cheating', 'Harassment or a bad name', 'Griefing or team abuse', 'Other'];
  var roster = new Map(), me = 0, muted = new Set(), sent = {};
  var mutedAll = !!store.get().muteChat;
  function takePlayers(list) { roster.clear(); (list || []).forEach(function (p) { roster.set(p.id, { name: p.name || 'Goblin', bot: !!p.bot, npc: !!p.npc }); }); }
  var panel = null;
  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function openPanel() {
    if (panel) return closePanel(); if (!(W.GK && W.GK.net)) return;
    try { D.exitPointerLock && D.exitPointerLock(); } catch (e) {}
    panel = el('div', { 'class': 'gkr-panel', role: 'dialog', 'aria-label': 'Quick chat, mute and report' });
    panel.appendChild(el('h2', null, 'Quick chat'));
    var g = el('div', { 'class': 'gkr-q' });
    QUICK.forEach(function (t, i) { var b = el('button', { 'class': 'gkr-btn alt', type: 'button' }); b.appendChild(el('b', null, String(i + 1))); b.appendChild(D.createTextNode(t)); b.onclick = function () { say(i); }; g.appendChild(b); });
    panel.appendChild(g);
    var mc = el('label', { style: 'display:block;margin-top:8px' }), cb = el('input', { type: 'checkbox', style: 'width:auto;letter-spacing:0;font-size:16px' }); cb.checked = mutedAll;
    cb.onchange = function () { mutedAll = cb.checked; var o = store.get(); o.muteChat = mutedAll; store.set(o); }; mc.appendChild(cb); mc.appendChild(D.createTextNode(' Hide everyone\'s quick chat'));
    panel.appendChild(mc);
    panel.appendChild(el('h3', null, 'Goblins in this match'));
    var any = false;
    roster.forEach(function (p, id) {
      if (id === me || p.npc) return; any = true;
      var r = el('div', { 'class': 'gkr-row' }); r.appendChild(el('span', null, p.name));
      if (p.bot) { r.appendChild(el('span', { 'class': 'gkr-tag' }, 'BOT')); } else {
        var m = el('button', { 'class': 'gkr-btn alt', type: 'button' }, muted.has(id) ? 'Unmute' : 'Mute'); m.onclick = function () { if (muted.has(id)) muted['delete'](id); else muted.add(id); m.textContent = muted.has(id) ? 'Unmute' : 'Mute'; };
        var rp = el('button', { 'class': 'gkr-btn alt', type: 'button' }, sent[id] ? 'Reported' : 'Report'); rp.disabled = !!sent[id];
        rp.onclick = function () { reportMenu(r, id, rp); };
        r.appendChild(m); r.appendChild(rp);
      }
      panel.appendChild(r);
    });
    if (!any) panel.appendChild(el('p', null, 'Nobody else is here yet.'));
    panel.appendChild(el('p', { style: 'font-size:13px;color:#9d9373;margin-top:10px' }, 'Muting hides a goblin\'s quick chat and emotes for you. Bots are labelled and cannot be reported. Press H or Esc to close.'));
    var x = el('button', { 'class': 'gkr-btn', style: 'margin-top:8px', type: 'button' }, 'Close'); x.onclick = closePanel; panel.appendChild(x);
    D.body.appendChild(panel);
  }
  function reportMenu(row, id, btn) {
    var old = row.nextSibling; if (old && old.className === 'gkr-why') { old.remove(); return; }
    var w = el('div', { 'class': 'gkr-why', style: 'display:flex;gap:6px;flex-wrap:wrap;padding:4px 0' });
    REASONS.forEach(function (t, i) { var b = el('button', { 'class': 'gkr-btn alt', type: 'button' }, t); b.onclick = function () { try { W.GK.net.send({ report: { id: id, r: i } }); } catch (e) {} sent[id] = 1; btn.textContent = 'Reported'; btn.disabled = true; w.remove(); }; w.appendChild(b); });
    row.parentNode.insertBefore(w, row.nextSibling);
  }
  function say(i) { try { W.GK.net.send({ say: i }); } catch (e) {} feedLine('You: ' + QUICK[i], 4000); closePanel(); }
  addEventListener('keydown', function (e) {
    var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'KeyH' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && W.GK && W.GK.net && (inPlay() || D.getElementById('qbox') && D.getElementById('qbox').classList.contains('on'))) { e.preventDefault(); e.stopImmediatePropagation(); openPanel(); return; }
    if (!panel) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); return; }
    var m = /^(Digit|Numpad)([1-8])$/.exec(e.code); if (m) { e.preventDefault(); e.stopImmediatePropagation(); say(+m[2] - 1); }
  }, true);

  // ---- hooks called from game.js ----
  var botNote = 0;
  W.GKR2 = {
    joinUrl: function (u) { return room ? u + (u.indexOf('?') < 0 ? '/?' : '&') + 'room=' + room : u; },   // funUrl
    muted: function (id) { return mutedAll || muted.has(id); },
    closed: function (code) {   // socket closed
      if (code === 1012) { pill('The server is restarting for an update. Reload in a moment to rejoin.', [{ label: 'Reload', go: function () { location.reload(); } }, { label: 'Dismiss', alt: true }]); return; }
      setTimeout(check, 1500);
    },
    onMsg: function (d) {
      if (W.GKONB) { try { W.GKONB.onMsg(d); } catch (e) {} }   // client/onboard.js
      if (d.bye) { pill('The server is restarting for an update. Your match will end. Reload in a moment.', [{ label: 'Reload', go: function () { location.reload(); } }, { label: 'Dismiss', alt: true }]); return; }
      if (d.queue) { queueInfo(d.queue); return; }
      if (d.host) { if (!hostNow) { hostNow = true; paintQueue(); } return; }
      if (d.say) { if (!(mutedAll || muted.has(d.say.id)) && QUICK[d.say.n]) feedLine((d.say.name || 'Goblin') + ': ' + QUICK[d.say.n]); return; }
      if (d.reported) { var k = d.reported, msg = { ok: 'Report sent. Thank you.', dup: 'You already reported that goblin.', limit: 'You have used your reports for this match.', rate: 'Wait a few seconds between reports.' }[k]; if (msg) feedLine(msg, 5000); return; }
      if (d.you != null && typeof d.you === 'number') me = d.you;
      if (d.matchStart) {
        if (d.matchStart.you != null) me = d.matchStart.you; takePlayers(d.matchStart.players); hostNow = false; if (qi) { qi.remove(); qi = null; qd = null; }
        var bots = (d.matchStart.players || []).filter(function (p) { return p.bot; });
        if (bots.length) { clearTimeout(botNote); botNote = setTimeout(function () { feedLine(bots.length + ' of the goblins are bots: ' + bots.map(function (p) { return p.name; }).join(', ') + '.', 9000); }, 3000); }
        var o = store.get(); if ((o.hintH || 0) < 3) { o.hintH = (o.hintH || 0) + 1; store.set(o); setTimeout(function () { feedLine('Press H for quick chat, mute and report.', 7000); }, 6000); }
      } else if (d.players && d.players.length && d.players.length >= roster.size) takePlayers(d.players);
    }
  };
  function init() { footer(); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();
  setTimeout(footer, 1500);   // boot.js builds the footer content after the DOM is ready
})();

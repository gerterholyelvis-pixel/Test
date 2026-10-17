// ONBOARD (docs/reports/release-2.md): a short, skippable first-match walkthrough for round 1 (the home phase). Classic script (defer). It only WATCHES input (capture-phase
// listeners that never stop an event) and the round messages forwarded by client/live.js (GKR2.onMsg -> GKONB.onMsg), so it cannot change how the game plays.
// Steps: move, look, jump, interact (workbench / pump / screen), swing the weapon, what the crown is. Each ticks off by itself; "Skip" ends it for good.
// It shows in the first 3 matches until finished or skipped (localStorage gk.onboard.v1); Settings > Accessibility > "Replay tutorial" resets it.
(function () {
  'use strict';
  var W = window, D = document, KEY = 'gk.onboard.v1';
  var rd = function () { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }, wr = function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} };
  var STEPS = [
    { id: 'move', t: 'Move', x: 'Walk around with W A S D. Hold Shift to sprint.', ok: function (s) { return s.keys >= 3 || s.moveMs > 900; } },
    { id: 'look', t: 'Look', x: 'Move the mouse to look around. If the mouse is free, click the game window once.', ok: function (s) { return s.look > 700; } },
    { id: 'jump', t: 'Jump', x: 'Press Space to jump. Low crates and ledges can be climbed.', ok: function (s) { return s.jump > 0; } },
    { id: 'use', t: 'Use things', x: 'Walk up to the workbench, the elixir pump or the screen and press E. The pump makes elixir, the screen spends it, the bench crafts.', ok: function (s) { return s.use >= 2; } },
    { id: 'hit', t: 'Fight', x: 'Left-click to swing your weapon. Real fights start in round 2, when the grille rises.', ok: function (s) { return s.hit >= 2; } },
    { id: 'crown', t: 'The crown', x: 'Goal: be the last goblin standing, or hold the dais in THE VAULT in the middle to claim the crown. From round 2 you pick doors at the panels. Good luck!', ok: null }
  ];
  var st = rd(), S = { keys: 0, seen: {}, moveMs: 0, look: 0, jump: 0, use: 0, hit: 0 }, i = 0, card = null, round = 0, active = false, started = false, last = 0, locked = true, dead = false;
  if (st.done) dead = true;
  var css = D.createElement('style'); css.textContent = '.gko{position:fixed;left:50%;bottom:132px;transform:translateX(-50%);z-index:9995;width:min(92vw,470px);background:#12100aee;border:1px solid #f5c451;border-radius:8px;color:#efe9d8;font:16px/1.35 "Barlow Condensed",Arial,sans-serif;padding:10px 14px;box-shadow:0 6px 24px #000a}.gko h4{margin:0 0 2px;color:#f5c451;font-size:19px;letter-spacing:.08em;text-transform:uppercase;display:flex;justify-content:space-between}.gko h4 span{color:#9d9373;font-size:14px}.gko p{margin:0 0 8px}.gko .r{display:flex;gap:8px;justify-content:space-between;align-items:center}.gko button{font:600 14px "Barlow Condensed",Arial,sans-serif;letter-spacing:.06em;text-transform:uppercase;background:#f5c451;color:#1a1508;border:0;border-radius:4px;padding:4px 12px;cursor:pointer}.gko button.alt{background:transparent;color:#c9b77a;border:1px solid #6b5f3c}.gko i{display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:50%;border:1px solid #f5c451}.gko i.on{background:#f5c451}'; D.head.appendChild(css);

  function finish(why) { dead = true; active = false; st.done = why; wr(st); if (card) { card.remove(); card = null; } }
  function paint() {
    if (!card) { card = D.createElement('div'); card.className = 'gko'; card.setAttribute('role', 'status'); card.setAttribute('aria-live', 'polite'); D.body.appendChild(card); }
    var s = STEPS[i]; card.textContent = '';
    var h = D.createElement('h4'), a = D.createElement('b'), b = D.createElement('span'); a.textContent = s.t; b.textContent = 'Welcome ' + (i + 1) + '/' + STEPS.length; h.appendChild(a); h.appendChild(b); card.appendChild(h);
    var p = D.createElement('p'); p.textContent = s.x; card.appendChild(p);
    var r = D.createElement('div'); r.className = 'r'; var dots = D.createElement('span'); STEPS.forEach(function (_, k) { var d = D.createElement('i'); if (k <= i) d.className = 'on'; dots.appendChild(d); }); r.appendChild(dots);
    var bt = D.createElement('span'); var sk = D.createElement('button'); sk.className = 'alt'; sk.textContent = i === STEPS.length - 1 ? 'Close' : 'Skip tutorial'; sk.onclick = function () { finish(i === STEPS.length - 1 ? 'done' : 'skipped'); };
    if (!s.ok) { var gb = D.createElement('button'); gb.textContent = 'Got it'; gb.style.marginRight = '8px'; gb.onclick = function () { finish('done'); }; bt.appendChild(gb); } else if (i < STEPS.length - 1) { var nx = D.createElement('button'); nx.className = 'alt'; nx.style.marginRight = '8px'; nx.textContent = 'Next'; nx.onclick = function () { next(); }; bt.appendChild(nx); }
    bt.appendChild(sk); r.appendChild(bt); card.appendChild(r);
  }
  function next() { if (i < STEPS.length - 1) { i++; S.keys = 0; S.seen = {}; S.moveMs = 0; S.look = 0; S.jump = 0; S.use = 0; S.hit = 0; paint(); } }
  function tick() {
    if (dead) return; var G = W.GK;
    var inMatch = G && G.mode === 'play' && !G.locked && round === 1;
    if (!started) { if (!inMatch) return; if ((st.runs || 0) >= 3) return finish('enough'); st.runs = (st.runs || 0) + 1; wr(st); started = true; active = true; paint(); return; }
    if (round > 1 || (G && G.mode !== 'play')) { if (round > 1) finish(i >= 3 ? 'done' : 'seen'); return; }
    var s = STEPS[i]; if (s.ok && s.ok(S)) next();
  }
  setInterval(tick, 250);
  var held = {};
  addEventListener('keydown', function (e) {
    if (!active || dead) return;
    if (/^Key[WASD]$/.test(e.code) || /^Arrow/.test(e.code)) { if (!S.seen[e.code]) { S.seen[e.code] = 1; S.keys++; } held[e.code] = performance.now(); }
    if (e.code === 'Space' && !e.repeat) S.jump++;
    if (e.code === 'KeyE' && !e.repeat) S.use++;
  }, true);
  addEventListener('keyup', function (e) { if (held[e.code]) { S.moveMs += performance.now() - held[e.code]; delete held[e.code]; } }, true);
  addEventListener('mousemove', function (e) { if (active && D.pointerLockElement) S.look += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0); }, true);
  addEventListener('mousedown', function (e) { if (active && e.button === 0 && D.pointerLockElement) S.hit++; }, true);
  W.GKONB = {
    onMsg: function (d) { if (d.round && typeof d.round.n === 'number') round = d.round.n; if (d.matchStart || d.queue) { round = 1; } },
    reset: function () { st = {}; wr(st); dead = false; started = false; i = 0; if (card) { card.remove(); card = null; } },
    state: function () { return { step: i, active: active, dead: dead, st: st }; }
  };
})();

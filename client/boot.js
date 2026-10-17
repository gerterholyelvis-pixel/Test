// RELEASE (docs/RELEASE.md): the first script on the page (a classic script in <head>, no dependencies). It makes the first 30 seconds friendly:
//  - an unsupported browser (no WebGL2, no import maps / modules) gets a clear message instead of a black screen
//  - a phone or tablet gets a "desktop browser required" note it can dismiss
//  - the loading curtain shows real progress (scripts fetched so far) and a rotating tip until the title screen is ready
//  - a page that never comes up (a script failed) offers a reload instead of hanging
//  - the menu footer shows the version (from /version) and a Privacy link; going offline shows a slim banner
// It never touches the game state. Escape hatch: ?noboot=1 skips all of it.
(function () {
  'use strict';
  if (/[?&]noboot=1/.test(location.search)) return;
  var D = document, W = window, booted = false, errors = [];
  var css = '#gkBoot{position:absolute;left:50%;bottom:16vh;transform:translateX(-50%);width:min(420px,80vw);text-align:center;font-family:var(--ui,sans-serif);color:#cfc9b6;letter-spacing:.08em;transition:opacity .4s}'
    + '#gkBoot .bar{height:3px;margin:0 0 14px;background:rgba(245,196,81,.14);overflow:hidden}#gkBoot .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#a8741a,#f5c451);transition:width .35s ease-out}'
    + '#gkBoot .lab{font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#a9a493;margin-bottom:6px}#gkBoot .tip{font-size:16px;line-height:1.35;min-height:2.7em;transition:opacity .4s}'
    + '#tcurtain.up #gkBoot{opacity:0}'
    + '.gkSheet{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(5,4,8,.94);font-family:var(--ui,sans-serif);color:#efe9d8}'
    + '.gkSheet .c{max-width:520px;padding:24px 28px;border:1px solid rgba(245,196,81,.35);border-top:3px solid #a8741a;background:linear-gradient(180deg,rgba(20,16,12,.96),rgba(9,7,7,.96));box-shadow:0 18px 60px rgba(0,0,0,.7)}'
    + '.gkSheet h2{margin:0 0 10px;font-family:var(--disp,Georgia,serif);color:#f5c451;font-size:26px;letter-spacing:.05em}.gkSheet p{margin:0 0 10px;font-size:17px;line-height:1.45;color:#d8d2bf;letter-spacing:.03em}'
    + '.gkSheet .r{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}.gkSheet button{cursor:pointer;padding:9px 18px;font:700 15px var(--ui,sans-serif);letter-spacing:.16em;text-transform:uppercase;color:#1a1104;background:linear-gradient(90deg,#ffe39a,#f5c451);border:1px solid #a8741a}'
    + '.gkSheet button.alt{color:#efe9d8;background:rgba(255,255,255,.05);border-color:rgba(245,196,81,.35)}'
    + '#gkOffline{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:101;padding:5px 16px;font:600 14px var(--ui,sans-serif);letter-spacing:.12em;text-transform:uppercase;color:#1a1104;background:#e0b030;display:none}'
    + '#menu .foot{left:auto;right:clamp(20px,2.4vw,28px)}'   // bottom right: with 8 menu buttons the left column reaches the bottom edge at 1080p
    + '.foot .gkVer{margin-left:.9em;color:#6d6a60;text-transform:none}.foot a{pointer-events:auto;color:#8b877a;text-decoration:none;margin-left:.9em}.foot a:hover{color:#f5c451}';
  function el(tag, attrs, html) { var e = D.createElement(tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (html != null) e.innerHTML = html; return e; }
  function sheet(id, head, lines, buttons) {
    if (D.getElementById(id)) return;
    var s = el('div', { id: id, 'class': 'gkSheet', role: 'dialog', 'aria-modal': 'true' }), c = el('div', { 'class': 'c' }), h = el('h2'), r = el('div', { 'class': 'r' });
    h.textContent = head; c.appendChild(h);
    lines.forEach(function (t) { var p = el('p'); p.textContent = t; c.appendChild(p); });
    buttons.forEach(function (b) { var x = el('button', { type: 'button', 'class': b.alt ? 'alt' : '' }); x.textContent = b.label; x.onclick = function () { b.go(s); }; r.appendChild(x); });
    c.appendChild(r); s.appendChild(c); D.body.appendChild(s);
    var f = r.querySelector('button'); if (f) try { f.focus(); } catch (e) {}
  }
  function ready(fn) { if (D.readyState !== 'loading') fn(); else D.addEventListener('DOMContentLoaded', fn); }
  ready(function () { var st = el('style'); st.textContent = css; D.head.appendChild(st); });
  function store(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  // ---- 1. capabilities: three.js r160+ needs WebGL2, the page needs ES modules and import maps ----
  var gl2 = false; try { var cv = D.createElement('canvas'); gl2 = !!(W.WebGL2RenderingContext && (cv.getContext('webgl2') || cv.getContext('experimental-webgl2'))); } catch (e) {}
  var modern = !!(W.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap')) && 'noModule' in D.createElement('script');
  W.GK_BOOT = { gl2: gl2, modern: modern };
  if (!modern || !gl2) {
    ready(function () {
      sheet('gkUnsupported', 'This browser cannot run Goblin King', [
        !modern ? 'Goblin King needs a current browser: Chrome, Edge or Firefox from 2023 or later, or Safari 16.4+.' : 'Goblin King needs WebGL 2, and this browser has it switched off or the graphics driver blocks it.',
        'Try updating the browser, turning on hardware acceleration in its settings, or another browser.'
      ], [{ label: 'Try anyway', alt: true, go: function (s) { s.remove(); } }]);
    });
  }

  // ---- 2. phones and tablets: the game needs a keyboard and a mouse ----
  var mm = function (q) { try { return W.matchMedia(q).matches; } catch (e) { return false; } };
  var touchOnly = mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
  if (touchOnly && store('gk.mobileOk') !== '1') {
    ready(function () {
      sheet('gkMobile', 'Desktop browser required', ['Goblin King is played with a keyboard and a mouse. On a phone or tablet you can look around the menus, but you cannot play a match.'],
        [{ label: 'Continue anyway', go: function (s) { store('gk.mobileOk', '1'); s.remove(); } }]);
    });
  }

  // ---- 3. loading curtain: progress from the scripts actually fetched, and a tip ----
  W.addEventListener('error', function (e) { if (e && e.filename && e.filename.indexOf(location.origin) === 0) errors.push(String(e.message || e.filename)); }, true);
  W.addEventListener('unhandledrejection', function (e) { errors.push(String(e && e.reason && e.reason.message || 'rejected')); });
  var TIPS = [
    'Each round, every room picks ONE door on its panel. It opens when the timer hits 0.',
    'Vault doors need TWO rooms to pick them, or the vote fizzles.',
    'Behind outer doors: chests, mystery rooms (risky!) and merchants.',
    'Death loses EVERYTHING you carry. Run through a door if you must.',
    'THE VAULT holds a relic. Everyone else wants it too.',
    'Sudden death: every door is open and only THE VAULT heals. Last goblin standing wins.'
  ];
  ready(function () {
    var cu = D.getElementById('tcurtain'); if (!cu || D.documentElement.classList.contains('gkResume')) return;
    var box = el('div', { id: 'gkBoot', 'aria-live': 'polite' }, '<div class="bar"><i></i></div><div class="lab">Loading</div><div class="tip"></div>');
    cu.appendChild(box);
    var bar = box.querySelector('i'), lab = box.querySelector('.lab'), tip = box.querySelector('.tip'), ti = Math.floor(Math.random() * TIPS.length), t0 = Date.now();
    tip.textContent = TIPS[ti];
    var expect = D.querySelectorAll('script[src]').length + 14;   // classic scripts + the modules the page imports (game, menu, item and room art, tags, three, addons)
    var tick = setInterval(function () {
      var n = 0; try { n = performance.getEntriesByType('resource').filter(function (r) { return /\.js(\?|$)/.test(r.name); }).length; } catch (e) {}
      var done = D.body.classList.contains('tready') || cu.classList.contains('up');
      bar.style.width = (done ? 100 : Math.min(92, 100 * n / Math.max(expect, n + 1))) + '%';
      if (W.GK && W.GK.renderer && !done) lab.textContent = 'Lighting the hall';
      if ((Date.now() - t0) % 6000 < 500 && Date.now() - t0 > 1000) { ti = (ti + 1) % TIPS.length; tip.textContent = TIPS[ti]; }
      if (done) { booted = true; clearInterval(tick); setTimeout(function () { box.remove(); }, 900); }
      else if (Date.now() - t0 > 45000) { clearInterval(tick); failed(); }
    }, 500);
  });
  function failed() {
    if (booted) return;
    sheet('gkBootFail', 'Goblin King did not load', [errors.length ? 'Part of the game failed to load. A reload usually fixes it.' : 'Loading is taking much longer than it should. Your connection may be slow, or the server is busy.'],
      [{ label: 'Reload', go: function () { location.reload(); } }, { label: 'Keep waiting', alt: true, go: function (s) { s.remove(); } }]);
  }

  // ---- 4. footer: version and privacy link; offline banner ----
  ready(function () {
    var foot = D.querySelector('#menu .foot');
    if (foot && !foot.querySelector('a')) {
      var a = el('a', { href: '/privacy', target: '_blank', rel: 'noopener' }); a.textContent = 'Privacy'; foot.appendChild(a);
      try { fetch('/version', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (v) { if (!v || !v.version) return; var s = el('span', { 'class': 'gkVer' }); s.textContent = 'v' + v.version; foot.insertBefore(s, a); W.GK_VERSION = v; }).catch(function () {}); } catch (e) {}
    }
    var off = el('div', { id: 'gkOffline', role: 'status' }); off.textContent = 'You are offline'; D.body.appendChild(off);
    var sync = function () { off.style.display = navigator.onLine === false ? 'block' : 'none'; };
    W.addEventListener('online', sync); W.addEventListener('offline', sync); sync();
  });
})();

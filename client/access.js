// ACCESS (docs/reports/release-2.md): accessibility options and device defaults. Classic script (defer). The settings menu belongs to the UI work, so this only injects one
// small "Accessibility" section into it (a few rows, found by element id) and stores its own values under localStorage gk.access.v1.
//   UI scale        zoom of the HUD and the menus (0.8 - 1.6)
//   Calm mode       no camera shake, no CSS animations / transitions, softer hit flash. Starts ON when the OS says prefers-reduced-motion
//   Less flashing   the red hit vignette and bright flashes are cut to a third (photosensitivity)
//   Clear text      heavier outline on HUD text for contrast
// game.js reads window.GKACC.calm / .flash in two places (camera shake, hit vignette).
(function () {
  'use strict';
  var W = window, D = document, KEY = 'gk.access.v1';
  var def = { scale: 1, calm: false, flash: false, clear: false };
  try { def.calm = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  var A = W.GKACC = { scale: def.scale, calm: def.calm, flash: def.flash, clear: def.clear };
  try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') { if (typeof s.scale === 'number' && s.scale >= 0.8 && s.scale <= 1.6) A.scale = s.scale; ['calm', 'flash', 'clear'].forEach(function (k) { if (typeof s[k] === 'boolean') A[k] = s[k]; }); } } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify({ scale: A.scale, calm: A.calm, flash: A.flash, clear: A.clear })); } catch (e) {} };

  var st = D.createElement('style'); st.textContent = [
    'body.gk-calm *,body.gk-calm *::before,body.gk-calm *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}',
    'body.gk-clear #hud,body.gk-clear #hud *,body.gk-clear #hint,body.gk-clear .gkr-feed div{text-shadow:0 0 1px #000,0 0 3px #000,0 1px 4px #000;font-weight:700}',
    '#sg-access .row output{min-width:3em}'
  ].join('\n'); D.head.appendChild(st);

  function apply() {
    var b = D.body; if (!b) return; b.classList.toggle('gk-calm', A.calm); b.classList.toggle('gk-clear', A.clear);
    var z = A.scale === 1 ? '' : String(A.scale); ['hud', 'hint', 'menu'].forEach(function (id) { var e = D.getElementById(id); if (e) e.style.zoom = z; });
  }

  // device defaults, first run only: a weak machine starts on Low / Medium so the first match is smooth (the post-GO fps probe in game.js may still step down).
  function deviceDefaults() {
    try {
      if (localStorage.getItem('gk.settings') || localStorage.getItem('gk.gfxAuto')) return;   // the player (or an earlier run) already has settings
      var cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8, dpr = W.devicePixelRatio || 1, gpu = '';
      try { var gl = D.createElement('canvas').getContext('webgl2'), ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : ''; } catch (e) {}
      var soft = /swiftshader|llvmpipe|software|basic render/i.test(gpu), integrated = /intel|uhd|iris|hd graphics|mali|adreno|apple gpu/i.test(gpu) && !/arc/i.test(gpu);
      var gfx = soft || cores <= 2 || mem <= 2 ? 'low' : (integrated || cores <= 4 || mem <= 4) ? 'medium' : 'high';
      if (gfx === 'high') return;   // the shipped default
      localStorage.setItem('gk.settings', JSON.stringify({ gfx: gfx, fx: gfx !== 'low' }));
      A.device = { cores: cores, mem: mem, dpr: dpr, gpu: gpu, gfx: gfx };
    } catch (e) {}
  }
  deviceDefaults();

  function row(label, ctl, id) { var r = D.createElement('div'); r.className = 'row' + (ctl.type === 'checkbox' ? ' chk' : ''); var l = D.createElement('label'); l.textContent = label; l.htmlFor = id; r.appendChild(l); r.appendChild(ctl); return r; }
  function section() {
    var back = D.getElementById('s-back'); if (!back || D.getElementById('sg-access')) return;
    var host = back.parentNode && back.parentNode.previousElementSibling; if (!host) return;
    var sec = D.createElement('section'); sec.className = 'sg'; sec.id = 'sg-access'; var h = D.createElement('h3'); h.textContent = 'Accessibility'; sec.appendChild(h);
    var sc = D.createElement('input'); sc.type = 'range'; sc.min = '0.8'; sc.max = '1.6'; sc.step = '0.05'; sc.id = 's-uiscale'; sc.value = A.scale;
    var out = D.createElement('output'); out.textContent = Math.round(A.scale * 100) + '%'; sc.oninput = function () { A.scale = +sc.value; out.textContent = Math.round(A.scale * 100) + '%'; apply(); save(); };
    var r1 = row('Interface size', sc, 's-uiscale'); r1.appendChild(out); sec.appendChild(r1);
    [['calm', 'Calm mode (no shake or animation)', 's-calm'], ['flash', 'Less flashing', 's-flash'], ['clear', 'Clear text (HUD outline)', 's-clear']].forEach(function (x) {
      var c = D.createElement('input'); c.type = 'checkbox'; c.id = x[2]; c.checked = !!A[x[0]]; c.onchange = function () { A[x[0]] = c.checked; apply(); save(); }; sec.appendChild(row(x[1], c, x[2]));
    });
    var rb = D.createElement('button'); rb.type = 'button'; rb.className = 'mbtn small'; rb.textContent = 'Replay'; rb.style.cssText = 'min-width:0;--h:32px;padding:0 14px'; rb.onclick = function () { if (W.GKONB) W.GKONB.reset(); rb.textContent = 'Done'; };
    var rr = D.createElement('div'); rr.className = 'row chk'; var rl = D.createElement('label'); rl.textContent = 'Replay tutorial'; rr.appendChild(rl); rr.appendChild(rb); sec.appendChild(rr);
    host.appendChild(sec);
  }
  function init() { apply(); section(); setTimeout(function () { apply(); section(); }, 1200); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();
})();

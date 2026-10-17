// WHEELHOST-BEGIN (the tall thin goblin host who spins the character wheel, see docs/reports/wheel-host.md)
// Presentation only: the result of the wheel is still picked by the server / save logic (menu.js wh.result). This file draws a 2D-canvas
// character (about 60 path ops per frame, no textures, no WebGL, no lights) beside the wheel and times his animation to the wheel's
// states. UMD: the pure parts (tierOf, poseFor, ik, rimX) are unit-tested in tests/wheelhost.test.js.
(function (root) {
'use strict';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

// ---- rarity tiers by the goblin's odds (percent): 20/20/20 common ... King 1% ----
const TIERS = [
  { key: 'common', min: 20, color: '#cfcdb4', react: 'shrug', burst: 0 },
  { key: 'uncommon', min: 6, color: '#6fdc72', react: 'clap', burst: 9 },
  { key: 'rare', min: 2, color: '#62b4ff', react: 'cheer', burst: 16 },
  { key: 'epic', min: 1.2, color: '#c07cff', react: 'cheerBig', burst: 24 },
  { key: 'king', min: 0, color: '#ffd75e', react: 'bow', burst: 38 },
];
function tierOf(odds, isKing) {
  if (isKing) return TIERS[4];
  for (const t of TIERS) if (odds >= t.min) return t;
  return TIERS[4];
}

// timings (seconds)
const WIND = 0.55, SWING = 0.22;
const REACT_LEN = { shrug: 1.7, clap: 1.6, cheer: 2.1, cheerBig: 2.5, bow: 2.8 };
// wheel contact point (figure-local x for a local y); wheel centre at local (170, -22), rim radius 142 (see layout in draw())
const rimX = y => 170 - Math.sqrt(Math.max(0, 142 * 142 - (y + 22) * (y + 22))) - 3;

// two-bone arm: shoulder (sx,sy) -> hand target (tx,ty); dir picks the elbow side
function ik(sx, sy, tx, ty, l1, l2, dir) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 0.001;
  const max = l1 + l2 - 0.01, min = Math.abs(l1 - l2) + 0.01;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; } else if (d < min) { dx *= min / d; dy *= min / d; d = min; }
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a)), ux = dx / d, uy = dy / d;
  return { ex: sx + ux * a - dir * uy * h, ey: sy + uy * a + dir * ux * h, hx: sx + dx, hy: sy + dy };
}

// The pose is a pure function of (mode, time in the mode, global time, tension). Hand targets are in figure-local units (hip at 0,0, y down).
// mode: idle | wind | swing | watch | shrug | clap | cheer | cheerBig | bow
function poseFor(mode, t, T, tension) {
  tension = tension || 0;
  const br = Math.sin(T * 2.2);
  const P = {
    lean: 0, hop: 0, sh: br * 1.1, tilt: Math.sin(T * 0.6) * 0.03, nod: 0, ex: 1, ey: 0, open: 0, smile: 0.35, brow: 0, hat: 0, hatFly: 0,
    wa: [20 + Math.sin(T * 0.7) * 3, 26 + br * 1.2], fa: [-23, 30], cane: 0, hatHand: 0,
  };
  const cyc = T % 9.2;                               // idle: hat tip every ~9 s
  const glance = T % 6.4;                            // idle: a glance at the camera every ~6 s
  if (glance > 4.6 && glance < 5.8 && (mode === 'idle' || mode === 'watch')) { P.ex = 0; P.ey = 0.35; P.tilt = -0.1; P.smile = 0.9; P.brow = 0.4; }
  if (mode === 'idle') {
    if (cyc < 1.5) { const u = Math.sin(clamp(cyc / 1.5, 0, 1) * Math.PI); P.wa = [lerp(P.wa[0], 7, sm(u * 1.4)), lerp(P.wa[1], -126, sm(u * 1.4))]; P.hat = 5 * u; P.nod = 0.12 * u; P.smile = 0.8; P.ex = 0; P.hatHand = u; }
    P.cane = Math.sin(T * 0.5) > 0.96 ? 1 : 0;       // an occasional tap of the cane
  } else if (mode === 'wind') {
    const u = sm(t / WIND);
    P.wa = [lerp(P.wa[0], -16, u), lerp(P.wa[1], 36, u)]; P.fa = [lerp(-23, -34, u), lerp(30, -24, u)];
    P.lean = -0.16 * u; P.smile = 0.9; P.brow = 0.5 * u; P.tilt = 0.08 * u; P.hat = 2 * u;
  } else if (mode === 'swing') {
    const u = sm(t / SWING), y = lerp(36, -50, u);
    P.wa = [lerp(-16, rimX(y), sm(u * 3)), y]; P.fa = [-34, lerp(-24, -6, u)];
    P.lean = lerp(-0.16, 0.17, u); P.smile = 1; P.open = 0.5; P.brow = 0.6; P.ex = 1;
  } else if (mode === 'watch') {
    const u = sm(t / 0.5);
    P.wa = [lerp(rimX(-50) , 22, u), lerp(-50, 28, u)]; P.lean = lerp(0.17, 0.04 + tension * 0.06, u); P.nod = Math.sin(T * 9) * 0.015 * tension;
    P.smile = 0.5 + tension * 0.3; P.brow = tension * 0.6; P.ex = 1;
  } else if (mode === 'shrug') {
    const u = sm(t / 0.3) * (1 - sm((t - REACT_LEN.shrug + 0.4) / 0.4));
    P.sh = 6 * u; P.wa = [lerp(P.wa[0], 40, u), lerp(P.wa[1], -4, u)]; P.fa = [lerp(-23, -44, u), lerp(30, -2, u)];
    P.tilt = 0.16 * u; P.smile = lerp(0.35, -0.5, u); P.brow = -0.3 * u; P.ex = lerp(1, 0.2, u); P.ey = 0.2 * u;
  } else if (mode === 'clap') {
    const u = sm(t / 0.2) * (1 - sm((t - REACT_LEN.clap + 0.3) / 0.3)), c = (Math.sin(t * 22) + 1) * 0.5;
    P.wa = [lerp(P.wa[0], 6 + c * 5, u), lerp(P.wa[1], -36, u)]; P.fa = [lerp(-23, -6 - c * 5, u), lerp(30, -36, u)];
    P.smile = 0.9; P.open = 0.3; P.brow = 0.5; P.ex = 0.5; P.nod = -0.04 * u; P.hop = -Math.abs(Math.sin(t * 11)) * 1.5 * u;
  } else if (mode === 'cheer' || mode === 'cheerBig') {
    const big = mode === 'cheerBig', len = REACT_LEN[mode], u = sm(t / 0.22) * (1 - sm((t - len + 0.4) / 0.4)), w = Math.sin(t * 9) * 5;
    P.wa = [lerp(P.wa[0], big ? 30 : 22, u) + w * u, lerp(P.wa[1], big ? -150 : -128, u) - Math.abs(w) * u]; P.fa = [lerp(-23, big ? -30 : -22, u) - w * u, lerp(30, big ? -150 : -128, u) - Math.abs(w) * u];
    P.hop = -Math.abs(Math.sin(t * (big ? 7 : 5.5))) * (big ? 9 : 5) * u; P.lean = Math.sin(t * 4.5) * 0.05 * u;
    P.smile = 1; P.open = 0.9 * u; P.brow = 0.8 * u; P.ex = 0; P.ey = -0.2 * u; P.tilt = Math.sin(t * 4.5) * 0.08 * u; P.cane = u;
    if (big) { const f = clamp((t - 0.25) / 1.0, 0, 1); P.hatFly = f > 0 && f < 1 ? Math.sin(f * Math.PI) * 70 : 0; }
  } else if (mode === 'bow') {
    const len = REACT_LEN.bow, u = sm(t / 0.7) * (1 - sm((t - len + 0.7) / 0.7));
    P.lean = -0.5 * u; P.wa = [lerp(P.wa[0], -42, u), lerp(P.wa[1], 30, u)]; P.fa = [lerp(-23, -18, u), lerp(30, -6, u)];
    P.smile = 0.9; P.ex = 0; P.hat = 0; P.brow = 0.3; P.nod = 0.2 * u; P.hatHand = u;
  }
  return P;
}

// ---- the host ----
// State machine: begin(opts) at Start; step(now, dt, wh) every wheel frame; the host reads the wheel's state to time itself.
const H = {
  mode: 'idle', t: 0, T: 0, cv: null, g: null, W: 0, Hh: 0, k: 1, dpr: 1, on: false, quick: false, last: 0, parts: [], tier: null, burstAt: -1, lastTick: 0, prevState: '', lead: 0,
  tierOf, poseFor, ik, rimX, TIERS, WIND, SWING, REACT_LEN,
  isQuick() {   // reduced motion or the Low preset: the short version (no wind-up, no flying hat, fewer sparks)
    let rm = false; try { rm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    const gfx = root.GK && root.GK.settings && root.GK.settings.gfx;
    return { reduced: rm, low: gfx === 'low' };
  },
  // Called from menu.js startGame. Returns the delay (s) before the wheel starts to turn (the wind-up + the swing).
  begin() {
    const q = H.isQuick(); H.quick = q.reduced || q.low; H.reduced = q.reduced;
    H.cv = root.document && root.document.getElementById('host'); if (!H.cv) { H.on = false; H.lead = 0; return 0; }
    if (root.innerWidth <= 760) { H.on = false; H.lead = 0; return 0; }
    H.on = true; H.parts.length = 0; H.tier = null; H.prevState = '';
    H.size();
    if (q.reduced) { H.set('idle'); H.lead = 0; return 0; }
    H.lead = H.quick ? 0.3 : WIND + SWING; H.set('wind'); H.windLen = H.quick ? 0.3 : WIND; return H.lead;
  },
  set(m) { H.mode = m; H.t = 0; },
  size() {
    const cv = H.cv; if (!cv) return;
    const r = cv.getBoundingClientRect(), d = H.quick ? 1 : Math.min(root.devicePixelRatio || 1, 1.5);
    const w = Math.max(2, Math.round(r.width * d)), h = Math.max(2, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    H.dpr = d; H.k = h / 300; H.g = cv.getContext('2d');
  },
  // wheel result is final (the wheel just landed): react by rarity
  landed(type, odds) {
    if (!H.on) return;
    H.tier = tierOf(odds, type === 4);
    if (!H.reduced) { H.set(H.tier.react); if (H.tier.burst) H.spawn(H.tier); }   // reduced motion: no reaction animation or sparks, only the sound
    const A = root.GKAUDIO; if (A) try { A.play(H.tier.key === 'king' ? 'gong' : H.tier.key === 'common' ? 'uiHover' : H.tier.key === 'uncommon' ? 'pickup' : 'victory', { vol: 0.8 }); } catch (e) {}
  },
  spawn(tier) {
    const n = Math.round(tier.burst * (H.quick ? 0.45 : 1)), c = tier.color;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 60 + Math.random() * (tier.key === 'king' ? 150 : 100);
      H.parts.push({ x: 40 + (Math.random() - 0.5) * 44, y: 40 + Math.random() * 70, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.9 + Math.random() * 0.7, s: 2.6 + Math.random() * 3, c });
    }
  },
  tick(speed) {   // the pointer clicked over a peg: a short tick per peg, throttled, softer when slow
    const A = root.GKAUDIO; if (!A) return;
    const now = root.performance.now(); if (now - H.lastTick < 55) return; H.lastTick = now;
    try { A.play('tick', { vol: clamp(0.25 + speed * 0.05, 0.25, 0.7), pitch: 0.9 + Math.min(speed, 11) * 0.02 }); } catch (e) {}
  },
  lastTickSound() { const A = root.GKAUDIO; if (A) try { A.play('tickLast', { vol: 0.9 }); } catch (e) {} },
  step(now, dt, wh) {
    if (!H.on) return;
    H.T += dt; H.t += dt;
    // follow the wheel
    if (H.mode === 'wind' && H.t >= H.windLen) { if (H.quick) H.set('watch'); else H.set('swing'); }
    else if (H.mode === 'swing' && H.t >= SWING) H.set('watch');
    else if (H.mode === 'idle' && wh.state === 'spin' && wh.t >= H.lead) H.set('watch');
    if (wh.state === 'decel' && H.prevState !== 'decel') H.tier = null;
    if (wh.state === 'landed' && H.prevState !== 'landed') { H.lastTickSound(); }
    H.prevState = wh.state;
    if (H.REACT_LEN[H.mode] && H.t >= H.REACT_LEN[H.mode]) H.set('idle');
    // draw at 30 fps (20 on Low) to keep the menu cheap
    const iv = H.quick ? 50 : 33; if (now - H.last < iv) return;
    const step = Math.min((now - H.last) / 1000, 0.1); H.last = now;
    const tension = wh.state === 'decel' ? clamp(1 - wh.speed / 6, 0, 1) : wh.state === 'spin' ? 0.1 : 0;
    H.draw(poseFor(H.mode, H.t, H.T, tension), step);
  },
};

// ---- drawing (units: canvas is 390 x 300; the figure hip is at (70,172) and its feet at y=290) ----
const COL = { suit: '#2b2335', suitHi: '#4a3d5c', vest: '#7c1c2c', gold: '#e2b84a', skin: '#86b84c', skinD: '#4f7a2c', line: 'rgba(8,6,10,.85)', hat: '#17141d', white: '#f2eedc' };
const FX = 70, FY = 172;
H.draw = function (P, dt) {
  const g = H.g; if (!g) return; const k = H.k;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, H.cv.width, H.cv.height);
  g.setTransform(k, 0, 0, k, 0, 0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const T = H.T, hop = P.hop, br = P.sh;
  // ground shadow
  g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(FX, 290, 26 - hop * 0.2, 5, 0, 0, TAU); g.fill();
  g.save(); g.translate(FX, FY + hop);
  // legs
  g.strokeStyle = '#1d1a26'; g.lineWidth = 6.5;
  g.beginPath(); g.moveTo(-6, -2); g.lineTo(-7, 112 - hop); g.moveTo(6, -2); g.lineTo(7, 112 - hop); g.stroke();
  g.fillStyle = '#0f0d14'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 9, 116 - hop, 10, 4.2, 0, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,.25)'; for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 11, 114.5 - hop, 4, 1.2, 0, 0, TAU); g.fill(); }
  // upper body, leaning about the hip
  g.save(); g.rotate(P.lean);
  g.fillStyle = COL.suit; g.beginPath(); g.moveTo(-13, -8); g.lineTo(13, -8); g.lineTo(19, 40); g.lineTo(0, 30); g.lineTo(-19, 40); g.closePath(); g.fill();   // coat tails
  g.beginPath(); g.moveTo(-12, -78 - br * 0.3); g.lineTo(12, -78 - br * 0.3); g.lineTo(14.5, -4); g.lineTo(-14.5, -4); g.closePath(); g.fill();   // coat
  g.strokeStyle = COL.suitHi; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-12, -78); g.lineTo(-14.5, -4); g.moveTo(12, -78); g.lineTo(14.5, -4); g.stroke();
  g.fillStyle = COL.vest; g.beginPath(); g.moveTo(-7.5, -77); g.lineTo(7.5, -77); g.lineTo(8.5, -8); g.lineTo(0, -1); g.lineTo(-8.5, -8); g.closePath(); g.fill();   // waistcoat
  g.fillStyle = COL.white; g.beginPath(); g.moveTo(-4.5, -78); g.lineTo(4.5, -78); g.lineTo(0, -60); g.closePath(); g.fill();   // shirt front
  g.fillStyle = COL.gold; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, -50 + i * 15, 1.5, 0, TAU); g.fill(); }
  g.strokeStyle = COL.gold; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-5, -26); g.quadraticCurveTo(-1, -20, 5, -28); g.stroke();   // watch chain
  g.fillStyle = '#c8962c'; g.beginPath(); g.moveTo(-1.5, -80); g.lineTo(-10, -86); g.lineTo(-10, -73); g.closePath(); g.moveTo(1.5, -80); g.lineTo(10, -86); g.lineTo(10, -73); g.closePath(); g.fill();   // bow tie
  g.fillStyle = '#7c1c2c'; g.fillRect(-2.2, -83, 4.4, 6);
  // neck + head (nod and tilt about the neck)
  g.fillStyle = COL.skinD; g.fillRect(-3.2, -92, 6.4, 14);
  g.save(); g.translate(0, -94 - br * 0.3); g.rotate(P.tilt + P.nod); drawHead(g, P, T); g.restore();
  g.restore();
  // arms and cane (figure frame; shoulders rotate with the lean)
  const rs = (x, y) => { const c = Math.cos(P.lean), s = Math.sin(P.lean); return [x * c - y * s, x * s + y * c]; };
  const shL = rs(-12, -74 - br), shR = rs(12, -74 - br);
  const fa = ik(shL[0], shL[1], P.fa[0], P.fa[1], 53, 56, 1), wa = ik(shR[0], shR[1], P.wa[0], P.wa[1], 53, 56, -1);
  // cane: from the free hand to the ground (waves when cheering)
  const cs = P.cane > 0.5 && H.mode !== 'idle' ? Math.sin(T * 10) * 0.5 : 0;
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 3.2; const ch = [fa.hx, fa.hy - 6];
  if (P.fa[1] < -60) { g.beginPath(); g.moveTo(fa.hx - 2 * cs, fa.hy + 38); g.lineTo(fa.hx + 2 * cs, fa.hy - 24); g.stroke(); g.fillStyle = COL.gold; g.beginPath(); g.arc(fa.hx + 2 * cs, fa.hy - 26, 3.4, 0, TAU); g.fill(); }
  else { const tap = P.cane ? Math.sin(T * 14) * 1.5 : 0; g.beginPath(); g.moveTo(ch[0], ch[1]); g.lineTo(ch[0] - 3, 113 - hop + tap); g.stroke(); g.fillStyle = COL.gold; g.beginPath(); g.arc(ch[0], ch[1] - 2, 3.4, 0, TAU); g.fill(); }
  const arm = a => { g.strokeStyle = COL.suit; g.lineWidth = 7; g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(a.ex, a.ey); g.lineTo(a.hx, a.hy); g.stroke(); g.strokeStyle = COL.suitHi; g.lineWidth = 1.1; g.beginPath(); g.moveTo(a.sx, a.sy - 2); g.lineTo(a.ex, a.ey - 2); g.stroke(); g.fillStyle = COL.white; g.strokeStyle = COL.line; g.lineWidth = 0.9; g.beginPath(); g.arc(a.hx, a.hy, 4.8, 0, TAU); g.fill(); g.stroke(); g.fillStyle = COL.gold; g.fillRect(a.hx - 2.5, a.hy + (a.hy < a.ey ? 3.5 : -4.5), 5, 1.4); };
  fa.sx = shL[0]; fa.sy = shL[1]; wa.sx = shR[0]; wa.sy = shR[1]; arm(fa); arm(wa);
  // the hat: on the head, lifted when tipped, or flung up / held out in the hand
  const hp = rs(0, -94 - br * 0.3);
  if (P.hatHand > 0.5 && H.mode === 'bow') { g.save(); g.translate(wa.hx + 4, wa.hy - 4); g.rotate(-0.4); drawHat(g, 0.8); g.restore(); }
  else if (P.hatFly > 0) { g.save(); g.translate(hp[0] + P.hatFly * 0.1, hp[1] - 34 - P.hatFly); g.rotate(P.hatFly * 0.09); drawHat(g, 1); g.restore(); }
  else { g.save(); g.translate(hp[0], hp[1] - 31 - P.hat); g.rotate(P.tilt + P.nod + P.lean * 0.4 + (P.hatHand > 0 ? 0.12 : 0)); drawHat(g, 1); g.restore(); }
  g.restore();
  // sparks
  if (H.parts.length) {
    const ps = H.parts, c = ps[0].c; g.fillStyle = c;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life += dt; if (p.life >= p.max) { ps.splice(i, 1); continue; }
      p.vy += 150 * dt; p.x += p.vx * dt; p.y += p.vy * dt; g.globalAlpha = clamp(1 - p.life / p.max, 0, 1);
      g.save(); g.translate(p.x + FX - 40, p.y + FY - 172); g.rotate(p.life * 6); g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore();
    }
    g.globalAlpha = 1;
  }
};
function drawHat(g, s) {
  g.save(); g.scale(s, s);
  g.fillStyle = COL.hat; g.beginPath(); g.ellipse(0, 0, 21, 4.6, 0, 0, TAU); g.fill();                       // brim
  g.fillRect(-12.5, -28, 25, 28); g.beginPath(); g.ellipse(0, -28, 12.5, 3.4, 0, 0, TAU); g.fill();          // crown
  g.fillStyle = '#2d2938'; g.beginPath(); g.ellipse(0, -28.4, 10.5, 2.4, 0, 0, TAU); g.fill();
  g.fillStyle = COL.vest; g.fillRect(-12.5, -9, 25, 6); g.fillStyle = COL.gold; g.fillRect(-3, -9, 6, 6); g.fillStyle = COL.hat; g.fillRect(-1.6, -7.6, 3.2, 3.2);
  g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(-9.5, -27, 2.4, 17);
  g.restore();
}
function drawHead(g, P, T) {
  const sk = COL.skin, dk = COL.skinD;
  // ears: long, pointed, with a little flap
  const fl = Math.sin(T * 1.7) * 0.05 + P.open * 0.12 + P.brow * 0.08;
  g.fillStyle = sk; g.strokeStyle = COL.line; g.lineWidth = 1;
  for (const sx of [-1, 1]) { g.save(); g.rotate(sx * fl); g.beginPath(); g.moveTo(sx * 9, -20); g.lineTo(sx * 30, -29); g.lineTo(sx * 11, -3); g.closePath(); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,120,120,.3)'; g.beginPath(); g.moveTo(sx * 12, -18); g.lineTo(sx * 25, -25); g.lineTo(sx * 12, -8); g.closePath(); g.fill(); g.fillStyle = sk; g.restore(); }
  // long face with a pointed chin
  g.beginPath(); g.moveTo(-11.5, -22); g.quadraticCurveTo(-13, -4, -4, 14); g.lineTo(0, 17); g.lineTo(4, 14); g.quadraticCurveTo(13, -4, 11.5, -22); g.quadraticCurveTo(0, -30, -11.5, -22); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.moveTo(11.5, -22); g.quadraticCurveTo(13, -4, 4, 14); g.lineTo(2, 12); g.quadraticCurveTo(8, -4, 7, -22); g.closePath(); g.fill();
  // brow, eyes (pupils follow the gaze), monocle
  const bu = P.brow;
  for (const sx of [-1, 1]) {
    g.fillStyle = '#f3e86a'; g.beginPath(); g.ellipse(sx * 5.4, -12, 3.9, 3.2, sx * 0.2, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.arc(sx * 5.4 + P.ex * 1.5 - (sx > 0 ? 0 : 0), -12 + P.ey * 1.5, 1.5, 0, TAU); g.fill();
    g.strokeStyle = '#1a2a10'; g.lineWidth = 1.7; g.beginPath(); g.moveTo(sx * 9.6, -17.5 - bu * 2.2 - (sx > 0 ? 0 : 0)); g.lineTo(sx * 2.2, -14.4 + bu * 1.4 * 0 - bu * 0.6); g.stroke(); g.strokeStyle = COL.line; g.lineWidth = 1;
  }
  g.strokeStyle = COL.gold; g.lineWidth = 1.1; g.beginPath(); g.arc(5.4, -12, 5.2, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(8.2, -7.8); g.quadraticCurveTo(12, 2, 9, 9); g.stroke(); g.strokeStyle = COL.line; g.lineWidth = 1;
  // long hooked nose
  g.fillStyle = dk; g.beginPath(); g.moveTo(-1.5, -10); g.quadraticCurveTo(-1, 0, 4.5, 3.5); g.lineTo(-0.5, 4.2); g.quadraticCurveTo(-3.5, 0, -3, -9); g.closePath(); g.fill();
  // mouth: smile (negative = flat / downturned), open for cheers, two teeth
  const sm2 = P.smile, op = P.open * 3.6, my = 9;
  g.fillStyle = '#2a0e0e'; g.strokeStyle = COL.line; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(-6.5, my - sm2 * 0.4 * 2); g.quadraticCurveTo(0, my + sm2 * 4 + op * 1.3, 6.5, my - sm2 * 0.8); g.quadraticCurveTo(0, my + 1 + op * 0.6 - sm2 * 0.3, -6.5, my - sm2 * 0.8); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#f2ecd0'; for (const sx of [-2.8, 2.8]) { g.beginPath(); g.moveTo(sx - 1.1, my + 0.6); g.lineTo(sx, my - 1.5); g.lineTo(sx + 1.1, my + 0.6); g.fill(); }
}

if (typeof module !== 'undefined' && module.exports) module.exports = H;
root.GKHOST = H;
})(typeof window !== 'undefined' ? window : globalThis);
// WHEELHOST-END

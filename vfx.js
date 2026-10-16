// Goblin King VFX pack (T15): one pooled, allocation-free particle system plus a pooled swing-trail ribbon.
// Plain script loaded BEFORE game.js (index.html). It needs three.js, which only exists once the module script has run,
// so game.js calls GKVFX.init(THREE, scene, camera, renderer, () => GK.settings.gfx) and GKVFX.update(dt) each frame.
// Every call is a no-op before init and wrapped by the game hooks in try/catch, so a VFX bug can never stop the game.
//
// API (positions are plain {x,y,z} or three Vector3; colours are 0xRRGGBB numbers):
//   GKVFX.spark(pos, kind, dir?, mul?)            a hit/impact burst by material. kind: metal plate mail leather cloth bone flesh wood stone magic gold dust
//                                                  dir = {x,z} the direction the blow travelled (sparks fly along it), mul = count multiplier
//   GKVFX.hit(pos, dir, weaponFam, armorFam, dmg, dead?)  the combat hook: picks the burst from weapon family (blade/blunt/pierce) and armour material
//   GKVFX.burst(pos, opts)                         generic burst: {n, hex, hex2, speed, life, size, grav, drag, grow, add, up, spread, dir}
//   GKVFX.trail(id, tip, base, hex)                call every frame while a weapon swings: feeds one pooled ribbon (id = any string/number)
//   GKVFX.bolt(id, pos, hex, dt)                   call every frame for a flying bolt: soft comet tail; GKVFX.boltHit(pos, hex) for the impact
//   GKVFX.foot(id, phase, speed, x, z, jy, surf, scale, camX, camZ)   footstep puffs on the foot plant; surf: 'dust' | 'gold' | 'mystic'
//   GKVFX.land(x, z, surf)  GKVFX.jump(x, z, surf) dust ring on landing / take-off
//   GKVFX.dissolve(x, z, height, hex)              death: 1.3 s of motes rising off the body and sinking into the loot pile
//   GKVFX.glint(pos, hex, n)                       pickup / chest sparkle; GKVFX.ring(x, z, hex, r) a floor shockwave ring (kill confirm)
//   GKVFX.elixir(pos, dt)  GKVFX.vault(pos, dt, radius)  GKVFX.crown(pos, dt)  GKVFX.embers(pos, dt, radius)
//        continuous glow helpers: call each frame with dt, they emit at a fixed rate per second (rising bubbles, gold glints, crown motes, embers)
//   GKVFX.stats()                                  { live, cap, draws, level } for tests and the report
// Quality: Low keeps only the cheapest (a handful of hit sparks and bolt impacts); Medium adds puffs, glints, rings, dissolve and trails;
// High and Ultra raise the live caps. Hard global cap: 600 live particles. Nothing allocates after init.
(function () {
  'use strict';
  const V = window.GKVFX = { ready: false };
  let T, scene, cam, renderer, level = () => 'high';
  // per level: f = share of the pool that may be live, c = emit count multiplier, min = what is allowed at all (0 spark only, 1 + puffs/glints/rings/dissolve, 2 + trails)
  const LV = { low: { f: 0.1, c: 0.5, k: 0 }, medium: { f: 0.35, c: 0.7, k: 2 }, high: { f: 0.7, c: 1, k: 2 }, ultra: { f: 1, c: 1.2, k: 2 } };
  const cur = () => LV[level()] || LV.high;
  const rnd = Math.random;

  // ---- pooled points ----
  const vs = 'attribute float aSize; attribute float aAlpha; attribute vec3 aCol; varying float vA; varying vec3 vC; uniform float uScale;' +
    'void main(){ vA=aAlpha; vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(aSize*uScale/max(0.1,-mv.z),1.0,96.0); gl_Position=projectionMatrix*mv; }';
  const fsSoft = 'varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float a=1.0-smoothstep(0.0,1.0,d); a*=vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }';
  // glow pool: hot white core, saturated rim, drawn with NORMAL blending (the facility rooms are white, additive light would vanish on them)
  const fsGlow = 'varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-0.5)*2.0; float core=1.0-smoothstep(0.0,0.6,d); vec3 c=mix(vC*0.9, vec3(1.0,0.97,0.9), core*core); float a=(1.0-smoothstep(0.35,1.0,d))*vA; if(a<0.01) discard; gl_FragColor=vec4(c,a); }';
  const uScale = { value: 800 };
  function mkPool(N, add) {
    const P = { N, add, live: 0, cur: 0, pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), max: new Float32Array(N), base: new Float32Array(N),
      siz: new Float32Array(N), alp: new Float32Array(N), col: new Float32Array(N * 3), grav: new Float32Array(N), drag: new Float32Array(N), grow: new Float32Array(N), peak: new Float32Array(N) };
    for (let i = 0; i < N; i++) P.pos[i * 3 + 1] = -100;
    const geo = new T.BufferGeometry(), A = (n, arr, k) => geo.setAttribute(n, new T.BufferAttribute(arr, k).setUsage(T.DynamicDrawUsage));
    A('position', P.pos, 3); A('aSize', P.siz, 1); A('aAlpha', P.alp, 1); A('aCol', P.col, 3);
    const mat = new T.ShaderMaterial({ uniforms: { uScale }, vertexShader: vs, fragmentShader: add ? fsGlow : fsSoft, transparent: true, depthWrite: false, blending: T.NormalBlending, fog: false });
    P.geo = geo; P.pts = new T.Points(geo, mat); P.pts.frustumCulled = false; P.pts.renderOrder = 7; P.pts.visible = false; P.pts.name = 'gkvfx' + (add ? 'Add' : 'Nrm'); scene.add(P.pts);
    return P;
  }
  let ADD, NRM;
  const capOf = P => Math.round(P.N * cur().f);
  function emit(P, x, y, z, vx, vy, vz, life, size, r, g, b, grav, drag, grow, peak) {
    if (P.live >= capOf(P)) return;
    let i = P.cur, tries = P.N; while (P.life[i] > 0 && tries-- > 0) i = (i + 1) % P.N;
    if (P.life[i] > 0) return; P.cur = (i + 1) % P.N; const k = i * 3;
    P.live++; P.life[i] = P.max[i] = life; P.base[i] = P.siz[i] = size; P.alp[i] = 0.01;
    P.pos[k] = x; P.pos[k + 1] = y; P.pos[k + 2] = z; P.vel[k] = vx; P.vel[k + 1] = vy; P.vel[k + 2] = vz;
    P.col[k] = r; P.col[k + 1] = g; P.col[k + 2] = b; P.grav[i] = grav; P.drag[i] = drag; P.grow[i] = grow; P.peak[i] = peak;
    P.pts.visible = true;
  }
  function step(P, dt) {
    if (P.live <= 0) { P.pts.visible = false; return; }
    const L = P.life, v = P.vel, p = P.pos; let live = 0;
    for (let i = 0; i < P.N; i++) {
      if (L[i] <= 0) continue;
      const k = i * 3; L[i] -= dt;
      if (L[i] <= 0) { p[k + 1] = -100; P.alp[i] = 0; continue; }
      live++;
      const dr = Math.max(0, 1 - P.drag[i] * dt), g = P.grav[i]; v[k] *= dr; v[k + 1] = v[k + 1] * dr + g * dt; v[k + 2] *= dr;
      p[k] += v[k] * dt; p[k + 1] += v[k + 1] * dt; p[k + 2] += v[k + 2] * dt;
      if (g < 0 && p[k + 1] < 0.02) { p[k + 1] = 0.02; v[k + 1] *= -0.25; v[k] *= 0.6; v[k + 2] *= 0.6; }
      const f = L[i] / P.max[i];
      P.alp[i] = Math.min(1, f * 2.4) * Math.min(1, (1 - f) * 14 + 0.25) * P.peak[i]; P.siz[i] = P.base[i] * (1 + P.grow[i] * (1 - f));
    }
    P.live = live;
    const a = P.geo.attributes; a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aCol.needsUpdate = true;
    if (!live) P.pts.visible = false;
  }

  // ---- colour helpers (no allocation: results land in module scratch) ----
  let cr = 1, cg = 1, cb = 1;
  const hex = h => { cr = ((h >> 16) & 255) / 255; cg = ((h >> 8) & 255) / 255; cb = (h & 255) / 255; };
  const mixTo = (h, t) => { const r = ((h >> 16) & 255) / 255, g = ((h >> 8) & 255) / 255, b = (h & 255) / 255; cr += (r - cr) * t; cg += (g - cg) * t; cb += (b - cb) * t; };
  const n_ = n => { const c = cur().c * n, f = Math.floor(c); return f + (rnd() < c - f ? 1 : 0); };   // scaled integer count

  // ---- bursts ----
  // KINDS: add = additive (glowing) or normal blended; h/h2 = colour range; n count; sp speed; li life; sz size; gv gravity; dr drag; gr growth; fl impact flash colour (0 none)
  const KINDS = {
    metal:   { add: 1, h: 0xffc055, h2: 0xff7a1a, n: 10, sp: 4.6, li: 0.38, sz: 0.11, gv: -9, dr: 0.6, gr: -0.5, fl: 0xffd890 },
    plate:   { add: 1, h: 0xffe070, h2: 0xffa030, n: 12, sp: 5.2, li: 0.4, sz: 0.12, gv: -9, dr: 0.5, gr: -0.5, fl: 0xffffff },
    mail:    { add: 1, h: 0xffd070, h2: 0xd08a20, n: 8, sp: 4, li: 0.34, sz: 0.1, gv: -9, dr: 0.6, gr: -0.5, fl: 0xffe0a0 },
    leather: { add: 0, h: 0x8a6a48, h2: 0x5a4430, n: 5, sp: 2.2, li: 0.6, sz: 0.2, gv: 0.2, dr: 2.6, gr: 1.6, fl: 0 },
    cloth:   { add: 0, h: 0xd8d2c0, h2: 0xb8b09c, n: 6, sp: 1.8, li: 0.7, sz: 0.24, gv: 0.3, dr: 2.8, gr: 1.8, fl: 0 },
    bone:    { add: 0, h: 0xf0e8d2, h2: 0xcfc4a8, n: 6, sp: 3.4, li: 0.5, sz: 0.05, gv: -10, dr: 0.8, gr: 0, fl: 0 },
    flesh:   { add: 0, h: 0x6fa83a, h2: 0xa8261a, n: 7, sp: 3, li: 0.5, sz: 0.09, gv: -10, dr: 0.8, gr: -0.2, fl: 0 },
    wood:    { add: 0, h: 0xb08a58, h2: 0x7a5a38, n: 6, sp: 3, li: 0.5, sz: 0.05, gv: -10, dr: 0.8, gr: 0, fl: 0 },
    stone:   { add: 0, h: 0xb4b0a8, h2: 0x8a867e, n: 6, sp: 2.8, li: 0.6, sz: 0.2, gv: 0.1, dr: 2.4, gr: 1.4, fl: 0 },
    magic:   { add: 1, h: 0xb08cff, h2: 0x7a4cff, n: 14, sp: 3.4, li: 0.5, sz: 0.11, gv: -1.5, dr: 1.2, gr: -0.4, fl: 0xb89cff },
    gold:    { add: 1, h: 0xffd040, h2: 0xe0a000, n: 8, sp: 2.4, li: 0.7, sz: 0.095, gv: -2.5, dr: 1.2, gr: -0.3, fl: 0 },
    dust:    { add: 0, h: 0xd4cdbd, h2: 0xb4ac9a, n: 4, sp: 0.9, li: 0.9, sz: 0.3, gv: 0.2, dr: 2, gr: 1.6, fl: 0 },
  };
  const ARMOR_KIND = { cloth: 'cloth', light: 'cloth', fur: 'cloth', robe: 'cloth', sack: 'cloth', leather: 'leather', mail: 'mail', lamellar: 'mail', harness: 'mail', spiked: 'metal', scrap: 'metal',
    plate: 'plate', bulwark: 'plate', gilded: 'plate', royal: 'gold', bone: 'bone' };
  function flash(x, y, z, h, size, life) { hex(h); emit(ADD, x, y, z, 0, 0, 0, life || 0.09, size || 0.8, cr, cg, cb, 0, 0, 0.6, 0.75); }
  function burst(pos, o) {
    if (!V.ready) return;
    o = o || {}; const K = o.kind ? KINDS[o.kind] : null, n = n_(o.n || (K ? K.n : 8)), P = (o.add != null ? o.add : K ? K.add : 1) ? ADD : NRM;
    const h1 = o.hex != null ? o.hex : K ? K.h : 0xffffff, h2 = o.hex2 != null ? o.hex2 : K ? K.h2 : h1, sp = o.speed || (K ? K.sp : 3), li = o.life || (K ? K.li : 0.5), sz = o.size || (K ? K.sz : 0.06),
      gv = o.grav != null ? o.grav : K ? K.gv : -6, dr = o.drag != null ? o.drag : K ? K.dr : 1, gr = o.grow != null ? o.grow : K ? K.gr : 0, up = o.up != null ? o.up : 0.35, spread = o.spread != null ? o.spread : 1;
    const dx = o.dir ? o.dir.x : 0, dz = o.dir ? o.dir.z : 0, dl = Math.hypot(dx, dz), hasDir = dl > 1e-3, ux = hasDir ? dx / dl : 0, uz = hasDir ? dz / dl : 0;
    const peak = o.peak != null ? o.peak : P === ADD ? 1 : 0.5;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, s = sp * (0.35 + rnd() * 0.65);
      let vx = Math.cos(a) * s * spread, vz = Math.sin(a) * s * spread; const vy = (rnd() * 0.9 + up * 0.5) * s * 0.6 + up * sp * 0.25;
      if (hasDir) { vx = vx * 0.35 + ux * s * 0.9; vz = vz * 0.35 + uz * s * 0.9; }
      hex(h1); if (h2 !== h1) mixTo(h2, rnd());
      emit(P, pos.x + (rnd() - 0.5) * 0.12, pos.y, pos.z + (rnd() - 0.5) * 0.12, vx, vy, vz, li * (0.7 + rnd() * 0.6), sz * (0.7 + rnd() * 0.6), cr, cg, cb, gv, dr, gr, peak);
    }
  }
  V.burst = burst;
  V.spark = function (pos, kind, dir, mul) {
    if (!V.ready) return; const K = KINDS[kind] || KINDS.dust;
    burst(pos, { kind: kind in KINDS ? kind : 'dust', dir, n: Math.max(1, Math.round(K.n * (mul || 1))) });
    if (K.fl) flash(pos.x, pos.y, pos.z, K.fl, 0.55 * Math.min(1.5, 0.7 + (mul || 1) * 0.3));
  };
  const WEAPON_MUL = { dagger: 0.7, sword: 1, axe: 1.15, spear: 0.85, halberd: 1.1, mace: 1.05, club: 1, flail: 1.05, hammer: 1.2, bow: 0.6, crossbow: 0.6, staff: 0.8, scepter: 0.8 };
  V.hit = function (pos, dir, weaponFam, armorFam, dmg, dead) {
    if (!V.ready) return;
    const ak = ARMOR_KIND[armorFam] || 'flesh', w = (WEAPON_MUL[weaponFam] || 0.9) * Math.max(0.7, Math.min(1.5, 0.7 + (dmg || 20) / 60)) * (dead ? 1.3 : 1);
    const blunt = weaponFam === 'club' || weaponFam === 'mace' || weaponFam === 'hammer' || weaponFam === 'flail';
    if (weaponFam === 'staff' || weaponFam === 'scepter') V.spark(pos, 'magic', dir, w);
    else V.spark(pos, ak, dir, w);
    if (ak !== 'flesh') burst(pos, { kind: 'flesh', dir, n: 3, sp: 2.4 });
    if (blunt) burst(pos, { kind: 'dust', n: 3, size: 0.26 });   // a thud kicks up a little dust
  };

  // ---- footsteps, landing, jump ----
  const STEP = {};   // actor id -> last foot index
  const SURF = { dust: [0xd4cdbd, 0xb4ac9a, 0], gold: [0xfff0a0, 0xffc933, 1], mystic: [0xc8a8ff, 0x8a5cff, 1] };
  function puffs(x, z, n, surf, big) {
    const S = SURF[surf] || SURF.dust, P = S[2] ? ADD : NRM;
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, s = (S[2] ? 0.5 : 0.35) * (big ? 2.2 : 1) * (0.4 + rnd() * 0.6);
      hex(S[0]); mixTo(S[1], rnd());
      emit(P, x + Math.cos(a) * 0.12, 0.05, z + Math.sin(a) * 0.12, Math.cos(a) * s, 0.25 + rnd() * 0.3, Math.sin(a) * s, 0.55 + rnd() * 0.35, S[2] ? 0.05 : 0.2 * (big ? 1.4 : 1), cr, cg, cb, S[2] ? -0.4 : 0.1, 2.2, S[2] ? 0 : 1.6, S[2] ? 0.9 : 0.3);
    }
  }
  V.foot = function (id, phase, speed, x, z, jy, surf, scale, camX, camZ) {
    if (!V.ready || cur().k < 1) return;
    const idx = Math.floor(phase / Math.PI), last = STEP[id]; STEP[id] = idx;
    if (last === undefined || idx === last || speed < 1.8 || jy > 0.05) return;
    const dx = x - camX, dz = z - camZ; if (dx * dx + dz * dz > 144) return;   // beyond 12 m: skip
    puffs(x, z, n_(speed > 4.5 ? 3 : 2), surf, false);
  };
  V.land = function (x, z, surf) { if (V.ready && cur().k >= 1) puffs(x, z, n_(7), surf, true); };
  V.jump = function (x, z, surf) { if (V.ready && cur().k >= 1) puffs(x, z, n_(4), surf, true); };
  V.forget = id => { delete STEP[id]; };

  // ---- bolts ----
  const BOLT = {};
  V.bolt = function (id, pos, h, dt) {
    if (!V.ready) return;
    let b = BOLT[id] || (BOLT[id] = { acc: 0 }); b.acc += dt * (cur().k >= 1 ? 48 : 20);
    while (b.acc >= 1) { b.acc -= 1; hex(h); mixTo(0xffffff, rnd() * 0.5); emit(ADD, pos.x + (rnd() - 0.5) * 0.12, pos.y + (rnd() - 0.5) * 0.12, pos.z + (rnd() - 0.5) * 0.12, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, 0.32 + rnd() * 0.2, 0.14, cr, cg, cb, 0, 1.5, -0.6, 0.85); }
  };
  V.boltHit = function (pos, h) { if (!V.ready) return; burst(pos, { kind: 'magic', hex: h, hex2: 0xffffff, n: 14, sp: 3.6 }); flash(pos.x, pos.y, pos.z, h, 0.9, 0.14); };
  V.boltEnd = id => { delete BOLT[id]; };

  // ---- death dissolve ----
  const DIS = []; for (let i = 0; i < 6; i++) DIS.push({ on: false, x: 0, z: 0, h: 1.4, t: 0, col: 0xffd75e });
  V.dissolve = function (x, z, height, h) {
    if (!V.ready || cur().k < 1) return;
    for (const d of DIS) if (!d.on) { d.on = true; d.x = x; d.z = z; d.h = height || 1.4; d.t = 0; d.col = h || 0xffd75e; return; }
  };
  function dissolveStep(dt) {
    for (const d of DIS) {
      if (!d.on) continue; const t0 = d.t; d.t += dt; if (d.t > 1.3) { d.on = false; continue; }
      const k = d.t / 1.3, n = n_(dt * 46 * Math.sin(Math.PI * Math.min(1, k + 0.1)));
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, r = rnd() * 0.3 * (d.h * 0.7); hex(d.col); mixTo(0xffffff, rnd() * 0.4);
        emit(ADD, d.x + Math.cos(a) * r, d.h * (0.1 + rnd() * 0.8) * (1 - k * 0.5), d.z + Math.sin(a) * r, (rnd() - 0.5) * 0.25, 0.25 + rnd() * 0.5, (rnd() - 0.5) * 0.25, 0.7 + rnd() * 0.5, 0.06 + rnd() * 0.035, cr, cg, cb, -0.6, 0.7, -0.4, 0.9);
      }
    }
  }

  // ---- glints, rings, glow helpers ----
  V.glint = function (pos, h, n) {
    if (!V.ready || cur().k < 1) return; const c = n_(n || 8);
    for (let i = 0; i < c; i++) { const a = rnd() * 6.283, r = rnd() * 0.3; hex(h || 0xffe08a); mixTo(0xffffff, rnd() * 0.6);
      emit(ADD, pos.x + Math.cos(a) * r, pos.y + rnd() * 0.3, pos.z + Math.sin(a) * r, Math.cos(a) * 0.3, 0.6 + rnd() * 0.8, Math.sin(a) * 0.3, 0.6 + rnd() * 0.5, 0.07 + rnd() * 0.04, cr, cg, cb, -0.5, 0.8, -0.3, 1); }
  };
  V.ring = function (x, z, h, r) {
    if (!V.ready || cur().k < 1) return; const n = n_(18), sp = (r || 1.6) / 0.42;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283; hex(h || 0xffd75e); emit(ADD, x, 0.06, z, Math.cos(a) * sp, 0, Math.sin(a) * sp, 0.42, 0.12, cr, cg, cb, 0, 3.2, -0.3, 0.85); }
  };
  const RATE = {};
  const rate = (key, dt, perSec) => { const v = (RATE[key] || 0) + dt * perSec * cur().c; const n = Math.floor(v); RATE[key] = v - n; return Math.min(n, 4); };
  V.elixir = function (pos, dt) {
    if (!V.ready || cur().k < 1) return;
    for (let n = rate('e', dt, 5); n > 0; n--) { hex(0x7affd0); mixTo(0xffffff, rnd() * 0.4); emit(ADD, pos.x + (rnd() - 0.5) * 0.2, pos.y, pos.z + (rnd() - 0.5) * 0.2, (rnd() - 0.5) * 0.1, 0.35 + rnd() * 0.25, (rnd() - 0.5) * 0.1, 0.9 + rnd() * 0.5, 0.045, cr, cg, cb, 0, 0.3, 0.2, 0.8); }
  };
  V.vault = function (pos, dt, radius) {
    if (!V.ready || cur().k < 1) return; radius = radius || 3;
    for (let n = rate('v', dt, 7); n > 0; n--) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * radius; hex(0xffd75e); mixTo(0xffffff, rnd() * 0.5); emit(ADD, pos.x + Math.cos(a) * r, pos.y + rnd() * 0.5, pos.z + Math.sin(a) * r, 0, 0.12 + rnd() * 0.2, 0, 1 + rnd() * 0.8, 0.055, cr, cg, cb, 0, 0.2, 0, 0.75); }
  };
  V.crown = function (pos, dt) {
    if (!V.ready || cur().k < 1) return;
    for (let n = rate('c', dt, 9); n > 0; n--) { const a = rnd() * 6.283; hex(0xfff2b0); mixTo(0xffc933, rnd()); emit(ADD, pos.x + Math.cos(a) * 0.22, pos.y + rnd() * 0.15, pos.z + Math.sin(a) * 0.22, Math.cos(a) * 0.15, 0.3 + rnd() * 0.3, Math.sin(a) * 0.15, 0.9 + rnd() * 0.4, 0.045, cr, cg, cb, 0, 0.4, -0.2, 0.9); }
  };
  V.embers = function (pos, dt, radius) {
    if (!V.ready || cur().k < 1) return; radius = radius || 4;
    for (let n = rate('m', dt, 8); n > 0; n--) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * radius; hex(0xff7a2a); mixTo(0xffd080, rnd() * 0.6); emit(ADD, pos.x + Math.cos(a) * r, pos.y, pos.z + Math.sin(a) * r, (rnd() - 0.5) * 0.3, 0.5 + rnd() * 0.7, (rnd() - 0.5) * 0.3, 1.2 + rnd() * 0.8, 0.04, cr, cg, cb, 0, 0.3, -0.3, 0.9); }
  };

  // ---- swing trail: one mesh, SLOTS ribbons of SEG samples (tip + base), additive, fades in LIFE s ----
  const SLOTS = 5, SEG = 12, LIFE = 0.2;
  let RB = null;
  const slot = []; for (let i = 0; i < SLOTS; i++) slot.push({ id: null, n: 0, pts: new Float32Array(SEG * 6), age: new Float32Array(SEG), r: 1, g: 1, b: 1 });
  function mkRibbon() {
    const nv = SLOTS * SEG * 2, geo = new T.BufferGeometry(), pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4), idx = [];
    for (let s = 0; s < SLOTS; s++) for (let i = 0; i < SEG - 1; i++) { const a = (s * SEG + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); geo.setAttribute('aCol', new T.BufferAttribute(col, 4).setUsage(T.DynamicDrawUsage)); geo.setIndex(idx);
    const mat = new T.ShaderMaterial({ vertexShader: 'attribute vec4 aCol; varying vec4 vC; void main(){ vC=aCol; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }', fragmentShader: 'varying vec4 vC; void main(){ gl_FragColor=vec4(vC.rgb,vC.a); }',
      transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.NormalBlending, fog: false });
    RB = new T.Mesh(geo, mat); RB.frustumCulled = false; RB.renderOrder = 8; RB.visible = false; RB.name = 'gkvfxTrail'; scene.add(RB);
  }
  V.trail = function (id, tip, base, h) {
    if (!V.ready || cur().k < 2) return;
    let s = null; for (const q of slot) if (q.id === id) { s = q; break; }
    if (!s) { for (const q of slot) if (q.id === null) { s = q; break; } if (!s) return; s.id = id; s.n = 0; hex(h || 0xffffff); s.r = cr; s.g = cg; s.b = cb; }
    const n = Math.min(s.n + 1, SEG); for (let i = n - 1; i > 0; i--) { s.age[i] = s.age[i - 1]; for (let k = 0; k < 6; k++) s.pts[i * 6 + k] = s.pts[(i - 1) * 6 + k]; }
    s.age[0] = 0; s.pts[0] = tip.x; s.pts[1] = tip.y; s.pts[2] = tip.z; s.pts[3] = base.x; s.pts[4] = base.y; s.pts[5] = base.z; s.n = n; s.fed = true;
  };
  function trailStep(dt) {
    let any = false;
    for (const s of slot) { if (s.id === null) continue; for (let i = 0; i < s.n; i++) s.age[i] += dt; any = true; }
    if (!any) { if (RB) RB.visible = false; return; }
    if (!RB) mkRibbon();
    const pa = RB.geometry.attributes.position.array, ca = RB.geometry.attributes.aCol.array;
    for (let si = 0; si < SLOTS; si++) {
      const s = slot[si];
      if (s.id !== null) {
        while (s.n > 0 && s.age[s.n - 1] > LIFE) s.n--;
        if (s.n < 2 && (s.n === 0 || s.age[0] > LIFE)) { s.id = null; s.n = 0; }
      }
      for (let i = 0; i < SEG; i++) {
        const v = (si * SEG + i) * 2, j = Math.min(i, Math.max(0, s.n - 1)), live = s.id !== null && i < s.n && s.n >= 2, a = live ? Math.max(0, 1 - s.age[j] / LIFE) : 0, tf = live ? a * a * 0.8 : 0;
        for (let e = 0; e < 2; e++) {
          const o = (v + e) * 3, c = (v + e) * 4, src = j * 6 + e * 3;
          pa[o] = s.n ? s.pts[src] : 0; pa[o + 1] = s.n ? s.pts[src + 1] : -100; pa[o + 2] = s.n ? s.pts[src + 2] : 0;
          ca[c] = s.r; ca[c + 1] = s.g; ca[c + 2] = s.b; ca[c + 3] = e === 0 ? tf : tf * 0.15;
        }
      }
    }
    RB.geometry.attributes.position.needsUpdate = RB.geometry.attributes.aCol.needsUpdate = true; RB.visible = true;
  }

  // ---- lifecycle ----
  V.init = function (THREE, sc, camera, rend, levelFn) {
    if (V.ready) return; T = THREE; scene = sc; cam = camera; renderer = rend; if (levelFn) level = levelFn;
    ADD = mkPool(360, true); NRM = mkPool(240, false); V.ready = true;
  };
  V.update = function (dt) {
    if (!V.ready || V.hold) return; dt = Math.min(dt, 0.1);   // V.hold = true freezes everything (screenshots, tests)
    uScale.value = renderer.domElement.height * 0.5 / Math.tan(cam.fov * Math.PI / 360);
    dissolveStep(dt); step(ADD, dt); step(NRM, dt); trailStep(dt);
  };
  V.pools = () => [ADD, NRM, RB];   // test hook
  V.stats = () => ({ live: ADD ? ADD.live + NRM.live : 0, cap: ADD ? capOf(ADD) + capOf(NRM) : 0, draws: (ADD && ADD.pts.visible ? 1 : 0) + (NRM && NRM.pts.visible ? 1 : 0) + (RB && RB.visible ? 1 : 0), level: level() });
})();

// COMBAT4: shared hit geometry, swing timing and hit feel (docs/reports/combat-4.md).
// The server (server.js COMBAT4 blocks) is authoritative and uses this file for every melee swing and projectile; the client (game.js COMBAT4 blocks)
// runs the same code for its hit prediction, the reticle and the aim assist, so "looks like a hit" and "is a hit" are the same test.
// Pure functions, no allocation in the hot paths (results go into a caller-owned object), no randomness. Heights (y) are optional everywhere:
// today y is the cosmetic jump height; when the vertical model (climbing on props) lands, pass the real feet height and the tests still hold.
// Damage numbers are NOT here (items.js owns them). This file owns the shape of a swing: when it lands, what it covers, how it pushes.
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;
  // ---- swing timing. The same tables drive the first person clip (game.js vmStart), the third person clip (vmSw) and the server's damage moment,
  // so the damage lands on the clip's contact frame. dur = clip length (s), hitAt = contact fraction of the clip.
  const CLASS = { sword: 'slash', dagger: 'slash', spear: 'thrust', axe: 'smash', mace: 'smash', club: 'smash', flail: 'smash', hammer: 'smash', halberd: 'smash', bow: 'bow', crossbow: 'bow', staff: 'cast', scepter: 'cast', whip: 'slash', sling: 'slash', wand: 'cast' };
  const SECS = { slash: 0.46, thrust: 0.5, smash: 0.7, bow: 0.66, cast: 0.6, fist: 0.32 };
  const HITAT = { slash: 0.44, thrust: 0.4, smash: 0.56, bow: 0.64, cast: 0.46, fist: 0.4 };
  const clsOf = fam => fam ? CLASS[fam] || 'slash' : 'fist';
  const durMul = fam => fam === 'dagger' ? 0.78 : fam === 'hammer' || fam === 'halberd' ? 1.2 : 1;
  // ---- per family strike profiles.
  //   shape: 'arc' (a horizontal sweep: half = half angle), 'line' (a thrust / lash: w = half width of the line), 'circle' (a slam: a disc of rad x reach centred off x reach ahead)
  //   active: ms the blade keeps cutting after the contact frame (a target that walks into the sweep in that time is still hit; each target once)
  //   cleave: how many goblins one swing can hit (sweeps), cleaveMul: damage share of the extra ones
  //   kb: knockback in m (scaled down by the victim's poise), stag: stagger ms (cancels the victim's wind-up, blocks his next swing; poise scales it)
  //   weight 0..1: hit-stop, camera kick and shake on the attacker's screen
  //   y0 / y1: the vertical band the strike covers, relative to the attacker's feet (a goblin on a crate 2.5 m up is out of a sword's reach)
  const P = {
    fist: { shape: 'line', w: 0.3, active: 60, cleave: 1, kb: 0.1, stag: 0, weight: 0.2, y0: -0.4, y1: 1.7 },
    sword: { shape: 'arc', half: 62 * D2R, active: 90, cleave: 2, kb: 0.15, stag: 0, weight: 0.45, y0: -0.5, y1: 1.9 },
    dagger: { shape: 'line', w: 0.32, active: 60, cleave: 1, kb: 0, stag: 0, weight: 0.25, y0: -0.4, y1: 1.8 },
    spear: { shape: 'line', w: 0.32, active: 80, cleave: 1, kb: 0.2, stag: 0, weight: 0.55, y0: -0.6, y1: 2.0 },
    axe: { shape: 'arc', half: 36 * D2R, active: 70, cleave: 1, kb: 0.3, stag: 160, weight: 0.8, y0: -0.7, y1: 2.0 },
    mace: { shape: 'arc', half: 46 * D2R, active: 70, cleave: 1, kb: 0.3, stag: 140, weight: 0.75, y0: -0.6, y1: 1.9 },
    club: { shape: 'arc', half: 50 * D2R, active: 70, cleave: 1, kb: 0.35, stag: 150, weight: 0.7, y0: -0.6, y1: 1.9 },
    flail: { shape: 'arc', half: 75 * D2R, active: 110, cleave: 2, kb: 0.45, stag: 220, weight: 0.9, y0: -0.6, y1: 1.9 },
    hammer: { shape: 'circle', off: 0.55, rad: 0.5, active: 70, cleave: 2, kb: 0.6, stag: 300, weight: 1, y0: -0.9, y1: 1.6 },
    halberd: { shape: 'arc', half: 50 * D2R, active: 90, cleave: 2, kb: 0.4, stag: 200, weight: 0.9, y0: -0.7, y1: 2.0 },
    whip: { shape: 'line', w: 0.38, active: 90, cleave: 1, kb: 0, stag: 0, weight: 0.35, y0: -0.6, y1: 1.9 },
    staff: { shape: 'arc', half: 46 * D2R, active: 70, cleave: 1, kb: 0.2, stag: 0, weight: 0.5, y0: -0.5, y1: 1.9 },
    scepter: { shape: 'arc', half: 46 * D2R, active: 70, cleave: 1, kb: 0.2, stag: 0, weight: 0.5, y0: -0.5, y1: 1.9 },
    wand: { shape: 'arc', half: 46 * D2R, active: 70, cleave: 1, kb: 0, stag: 0, weight: 0.3, y0: -0.5, y1: 1.9 },
  };
  // ranged families fly real projectiles: speed m/s, g = gravity m/s^2 (arrows drop a little over 12 m), r = projectile radius.
  // A ranged weapon of a melee family (throwing knives = dagger, throwing axe = axe, sling) gets its own row.
  const PROJ = { bow: { speed: 42, g: 7, r: 0.05, kind: 'arrow' }, crossbow: { speed: 60, g: 4, r: 0.05, kind: 'bolt' }, sling: { speed: 30, g: 9, r: 0.07, kind: 'stone' }, dagger: { speed: 26, g: 8, r: 0.06, kind: 'knife' }, axe: { speed: 20, g: 9.8, r: 0.12, kind: 'axe' } };
  const PROJ_DEF = PROJ.bow;
  // armour poise: how much of the knockback and stagger an armour family shrugs off (0 = all of it lands, 1 = immune)
  const POISE = { plate: 0.6, gilded: 0.5, mail: 0.45, lamellar: 0.45, royal: 0.4, scrap: 0.35, spiked: 0.35, harness: 0.3, bone: 0.3, fur: 0.2, leather: 0.2, tabard: 0.15, cloth: 0.05, robe: 0.05 };
  const STAG_MAX = 350, STAG_IMMUNE = 900;   // a stagger never lasts longer than this; after one, the victim cannot be staggered again for STAG_IMMUNE ms (no stun lock by a gang)
  const REWIND_MAX = 200;   // lag compensation never reaches further back than this (ms)
  const QUEUE_MS = 120;     // an attack that reaches the server this early (network jitter) is queued and fires on time, instead of being dropped while the client animates it
  const ASSIST = { deg: 9, maxDeg: 6, rate: 0.35 };   // aim assist: a target this far outside the strike gets a pull of at most maxDeg per swing, rate x the error per frame (client)
  const BODY_H = 1.6;       // a size-1 goblin's hit capsule height (m); radius is items.js hitRadius (0.35 x size)

  // tune: optional per-weapon fields in items.js WEAPON_TUNE (the balance agent adds them; nothing here edits numbers there):
  //   windup (ms to the contact frame), active, cleave, cleaveMul, kb, stag, weight, half (deg), w, speed, g
  function tuneOf(G, key) { const T = G && G.WEAPON_TUNE, w = key && G && G.ITEMS && G.ITEMS[key]; return (T && w && (T[key] || (w.base && T[w.base]))) || null; }
  function profile(G, key) {   // the strike profile of a weapon key (null = fists), with WEAPON_TUNE overrides
    const w = key && G && G.ITEMS ? G.ITEMS[key] : null, fam = w && w.type === 'weapon' ? w.family : null, base = P[fam] || (fam ? P.sword : P.fist), t = tuneOf(G, key);
    if (!t || !(t.active != null || t.cleave != null || t.cleaveMul != null || t.kb != null || t.stag != null || t.weight != null || t.half != null || t.w != null)) return base;
    return { ...base, ...(t.active != null ? { active: t.active } : null), ...(t.cleave != null ? { cleave: t.cleave } : null), ...(t.cleaveMul != null ? { cleaveMul: t.cleaveMul } : null), ...(t.kb != null ? { kb: t.kb } : null), ...(t.stag != null ? { stag: t.stag } : null), ...(t.weight != null ? { weight: t.weight } : null), ...(t.half != null ? { half: t.half * D2R } : null), ...(t.w != null ? { w: t.w } : null) };
  }
  // timing of one swing in ms: { dur, contact, active, end }. cd = the weapon's cooldown in ms (the clip is capped to 0.85 x cd, as the viewmodel always was).
  function timing(G, key, cd, out) {
    const w = key && G && G.ITEMS ? G.ITEMS[key] : null, fam = w && w.type === 'weapon' ? w.family : null, cls = clsOf(fam), t = tuneOf(G, key), pr = profile(G, key);
    const dur = Math.min(SECS[cls] * durMul(fam), (cd || 600) / 1000 * 0.85) * 1000;
    const contact = t && t.windup != null ? Math.min(dur * 0.9, t.windup) : HITAT[cls] * dur;
    const o = out || {}; o.dur = Math.round(dur); o.contact = Math.round(contact); o.active = Math.round(Math.min(pr.active, Math.max(30, dur - contact))); o.end = o.contact + o.active; o.cls = cls; o.fam = fam; return o;
  }
  const famTiming = (fam, cd, out) => {   // the same for a bare family (third person clips know the family, not always the key)
    const cls = clsOf(fam), dur = Math.min(SECS[cls] * durMul(fam), (cd || 600) / 1000 * 0.85) * 1000, o = out || {};
    o.dur = Math.round(dur); o.contact = Math.round(HITAT[cls] * dur); o.active = Math.round(Math.min((P[fam] || P.fist).active, Math.max(30, dur - o.contact))); o.end = o.contact + o.active; o.cls = cls; o.fam = fam; return o;
  };
  const projOf = (G, key) => { const w = key && G && G.ITEMS ? G.ITEMS[key] : null, fam = w && w.family, base = PROJ[fam] || PROJ_DEF, t = tuneOf(G, key); return t && (t.speed != null || t.g != null) ? { ...base, ...(t.speed != null ? { speed: t.speed } : null), ...(t.g != null ? { g: t.g } : null) } : base; };
  const capH = size => BODY_H * (size || 1);
  const poiseOf = armorFamily => POISE[armorFamily] || 0;

  // ---- melee: does the strike of an attacker at (ax, ay, az) facing yaw (forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)) with reach R
  // touch a target capsule (centre tx, tz, feet ty, radius tr, height th)? Fills out { d, along, lat, cx, cy, cz } (cx..cz = contact point on the target) and returns true.
  const CLOSE = 0.45;   // bodies this close (surface to centre) are hit by any weapon in the front half: a swing cannot miss someone you are standing on
  function melee(pr, R, ax, ay, az, yaw, tx, ty, tz, tr, th, out) {
    const lo = (ay || 0) + pr.y0, hi = (ay || 0) + pr.y1, t0 = ty || 0;
    if (t0 > hi || t0 + th < lo) return false;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), dx = tx - ax, dz = tz - az, d = Math.sqrt(dx * dx + dz * dz), along = dx * fx + dz * fz, lat = dx * -fz + dz * fx;
    let ok = false;
    if (d - tr < CLOSE) ok = d < 0.05 || along > -0.1 * d;
    else if (pr.shape === 'arc') { if (d - tr <= R) { const c = Math.max(-1, Math.min(1, along / d)), tol = pr.half + Math.asin(Math.min(1, tr / d)); ok = Math.acos(c) <= tol; } }
    else if (pr.shape === 'line') { const s = Math.max(0, Math.min(R, along)), ex = dx - fx * s, ez = dz - fz * s, w = pr.w + tr; ok = along > -tr && ex * ex + ez * ez <= w * w && along - tr <= R; }
    else if (pr.shape === 'circle') { const cx = fx * R * pr.off, cz = fz * R * pr.off, ex = dx - cx, ez = dz - cz, rr = R * pr.rad + tr; ok = ex * ex + ez * ez <= rr * rr; }
    if (!ok) return false;
    if (out) { const k = d > 1e-6 ? tr / d : 0; out.d = d; out.along = along; out.lat = lat; out.cx = tx - dx * k; out.cz = tz - dz * k; out.cy = Math.max(t0, Math.min(t0 + th, (ay || 0) + 1.0)); }
    return true;
  }
  // signed angle (rad) from the attacker's facing to the target: > 0 = to the right. Turning toward it means yaw -= bearing (aim assist).
  function bearing(ax, az, yaw, tx, tz) { const dx = tx - ax, dz = tz - az, fx = -Math.sin(yaw), fz = -Math.cos(yaw); return Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz); }

  // ---- projectiles: closest distance between segment p (a -> b) and segment q (c -> d), 3D (Ericson, Real-Time Collision Detection 5.1.9).
  // Writes the parameter s along p of the closest point into out.s; returns the squared distance.
  function segSeg2(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, out) {
    const d1x = bx - ax, d1y = by - ay, d1z = bz - az, d2x = dx - cx, d2y = dy - cy, d2z = dz - cz, rx = ax - cx, ry = ay - cy, rz = az - cz;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
    else if (a <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
    else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else {
        const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
        s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
      }
    }
    const px = ax + d1x * s - (cx + d2x * t), py = ay + d1y * s - (cy + d2y * t), pz = az + d1z * s - (cz + d2z * t);
    if (out) { out.s = s; out.t = t; }
    return px * px + py * py + pz * pz;
  }
  // a projectile step (x0,y0,z0) -> (x1,y1,z1) of radius pr against a vertical capsule (feet ty, radius tr, height th). Returns the hit parameter along the step (0..1) or -1.
  const SC = { s: 0, t: 0 };
  function projHit(x0, y0, z0, x1, y1, z1, pr, tx, ty, tz, tr, th) {
    const t0 = ty || 0, r = tr + pr, lo = t0 + Math.min(tr, th / 2), hi = t0 + Math.max(th - tr, th / 2);
    const d2 = segSeg2(x0, y0, z0, x1, y1, z1, tx, lo, tz, tx, hi, tz, SC);
    return d2 <= r * r ? SC.s : -1;
  }
  // launch pitch (rad, + = up) that puts a projectile of speed v and gravity g from (horizontal distance dx, height difference dy) on the target: the low arc; flat aim when unreachable
  function aimPitch(dx, dy, v, g) {
    if (!(g > 0) || dx < 1e-3) return Math.atan2(dy, Math.max(1e-3, dx));
    const v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
    return disc < 0 ? Math.PI / 4 : Math.atan((v2 - Math.sqrt(disc)) / (g * dx));
  }

  // ---- line of sight between two points through the room grid: every room change must go through an OPEN door's opening; props (world.js footprints, x 0.85 like segBlocked)
  // and the vault pillars block below their height. W = world.js api, layout = the match's prop layout, isOpen(doorId) = door state. 3D-ready: a prop only blocks a line that passes below PROP_H.
  const PROP_H = 1.15;
  let DOOR_AT = null;
  const doorAt = W => { if (DOOR_AT) return DOOR_AT; DOOR_AT = {}; for (const d of W.DOORS) DOOR_AT[d.a + '|' + d.b] = DOOR_AT[d.b + '|' + d.a] = d; return DOOR_AT; };
  function los(W, layout, isOpen, x0, y0, z0, x1, y1, z1, propsToo) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.ceil(L / 0.2)), DA = doorAt(W);
    let prev = W.roomKeyOf(x0, z0);
    for (let i = 1; i <= n; i++) {
      const x = x0 + dx * i / n, z = z0 + dz * i / n, k = W.roomKeyOf(x, z);
      if (k === prev) continue;
      const d = DA[prev + '|' + k];
      if (!d || !isOpen(d.id) || Math.abs((d.axis === 'x' ? x : z) - d.c) > d.hw) return false;
      prev = k;
    }
    if (propsToo === false) return true;
    const ya = y0 == null ? 0.9 : y0, yb = y1 == null ? 0.9 : y1;
    if (Math.min(ya, yb) >= PROP_H) return true;   // the whole line runs above the props
    if (L > 1e-6 && W.segBlocked && W.segBlocked(x0, z0, x1, z1, layout)) return false;
    if (W.rectsAt) for (const q of W.rectsAt(x0, z0)) if (segRect(x0, z0, x1, z1, q[0], q[1], q[2], q[3])) return false;   // vault pillars (segBlocked only knows the round props)
    return true;
  }
  function segRect(x0, z0, x1, z1, rx0, rz0, rx1, rz1) {   // slab test: does the segment cross the axis-aligned rectangle?
    let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0;
    for (const [p, d, lo, hi] of [[x0, dx, rx0, rx1], [z0, dz, rz0, rz1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
      let a = (lo - p) / d, b = (hi - p) / d; if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
    }
    return true;
  }

  // ---- block / parry hook (for the block or dodge ability of the balance agent). A target with g = t.guard = { at, until, mul, parry, cone } is guarding
  // from at until until (ms, the server's Date.now()); a hit from inside the cone (rad, default 70 deg either side of the guard's facing) is blocked: damage x mul
  // (default 0.35). Within parry ms of g.at it is a parry: no damage, the attacker is staggered. Returns null, { block: true, mul } or { parry: true }.
  function guard(g, now, tx, tz, tyaw, ax, az) {
    if (!g || !(now >= (g.at || 0) && now <= (g.until || 0))) return null;
    const fx = -Math.sin(tyaw || 0), fz = -Math.cos(tyaw || 0), dx = ax - tx, dz = az - tz, d = Math.hypot(dx, dz) || 1, cone = g.cone || 70 * D2R;
    if ((dx * fx + dz * fz) / d < Math.cos(cone)) return null;   // hit from the side or behind: the guard does nothing
    if (g.parry && now - (g.at || 0) <= g.parry) return { parry: true };
    return { block: true, mul: g.mul != null ? g.mul : 0.35 };
  }

  const api = { CLASS, SECS, HITAT, P, PROJ, POISE, STAG_MAX, STAG_IMMUNE, REWIND_MAX, QUEUE_MS, ASSIST, BODY_H, PROP_H, CLOSE, clsOf, profile, timing, famTiming, projOf, capH, poiseOf, melee, bearing, segSeg2, projHit, aimPitch, los, segRect, guard, tuneOf };
  root.GKC4 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

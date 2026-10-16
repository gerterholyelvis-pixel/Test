// Bot navigation helpers (server only, pure functions, no game state): steering around solid props, stuck detection, and stat-based item decisions.
// Obstacle interface (what world.js props should expose): a plain list of { x, z, hw, hd } (axis-aligned box, half extents) or { x, z, r } (circle).
// Optional `solid: false` obstacles are ignored. Everything here treats the bot as a disc of radius R (default BOT_R).
(function (root) {
  const BOT_R = 0.4, SAMPLE = 0.15;
  const solid = o => o && o.solid !== false;
  const inside = (x, z, o, R) => {   // is a disc of radius R at (x, z) touching obstacle o?
    if (o.r > 0) return Math.hypot(x - o.x, z - o.z) < o.r + R;
    return Math.abs(x - o.x) < (o.hw || 0) + R && Math.abs(z - o.z) < (o.hd || 0) + R;
  };
  function hitAt(x, z, obs, R = BOT_R) { if (obs) for (const o of obs) if (solid(o) && inside(x, z, o, R)) return o; return null; }
  function segHit(x0, z0, x1, z1, obs, R = BOT_R) {   // first obstacle touched by the disc moving from (x0, z0) to (x1, z1) (sampled every 15 cm), else null
    if (!obs || !obs.length) return null;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / SAMPLE));
    for (let i = 1; i <= n; i++) { const o = hitAt(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, obs, R); if (o) return o; }
    return null;
  }
  // The nearest point outside every obstacle (used for a target or a position that ended up inside a prop). Pushes out along the shortest axis / radius.
  function pushOut(x, z, obs, R = BOT_R, hx, hz) {   // hx, hz (optional): where the walker is; a point dead centre in a prop leaves on that side
    for (let it = 0; it < 4; it++) {
      const o = hitAt(x, z, obs, R); if (!o) break;
      let sx = x - o.x, sz = z - o.z; if (hx !== undefined && Math.hypot(sx, sz) < 0.2) { sx = hx - o.x; sz = hz - o.z; }
      if (o.r > 0) { const d = Math.hypot(sx, sz) || 1, k = (o.r + R + 0.05) / d; x = o.x + (sx || 1) * k; z = o.z + sz * k; }
      else {
        const ex = (o.hw || 0) + R + 0.05, ez = (o.hd || 0) + R + 0.05, px = ex - Math.abs(x - o.x), pz = ez - Math.abs(z - o.z);   // penetration on each axis
        if (px < pz) x = o.x + (sx >= 0 ? ex : -ex); else z = o.z + (sz >= 0 ? ez : -ez);
      }
    }
    return [x, z];
  }
  const rot = (dx, dz, a) => { const c = Math.cos(a), s = Math.sin(a); return [dx * c - dz * s, dx * s + dz * c]; };
  const ANGLES = [0.5, 1.0, 1.5, 2.0, 2.6];   // radians off the straight line, tried in growing order
  // st: per-bot memory { side: +1|-1, sideUntil, clearN }. The detour side is chosen once (toward the nearer edge of the blocker) and kept until the way is clear again: no flip-flopping in front of a crate.
  function steer(st, px, pz, tx, tz, step, obs, R = BOT_R, now = 0) {   // the next position (one step toward the target, bent around obstacles), or null when boxed in
    const dx = tx - px, dz = tz - pz, d = Math.hypot(dx, dz); if (d < 1e-6) return [px, pz];
    const s = Math.min(d, step), ux = dx / d, uz = dz / d, nx = px + ux * s, nz = pz + uz * s;
    if (!obs || !obs.length) return [nx, nz];
    const look = Math.min(d, Math.max(step, 0.8)), blocker = segHit(px, pz, px + ux * look, pz + uz * look, obs, R);
    if (!blocker && !hitAt(nx, nz, obs, R)) { if (st && st.side && ++st.clearN > 4) st.side = 0; return [nx, nz]; }
    if (st) st.clearN = 0;
    let side = st && st.side && (!st.sideUntil || now < st.sideUntil) ? st.side : 0;
    if (!side) {   // pick the side whose edge of the blocker is closer to the line of travel
      const b = blocker || hitAt(nx, nz, obs, R) || { x: px, z: pz };
      side = (ux * (b.z - pz) - uz * (b.x - px)) > 0 ? -1 : 1;   // blocker to the left of travel -> go right
      if (st) { st.side = side; st.sideUntil = now + 2500; }
    }
    for (const sg of [side, -side]) for (const a of ANGLES) {
      const [rx, rz] = rot(ux, uz, a * sg), cx = px + rx * s, cz = pz + rz * s;
      if (!segHit(px, pz, cx, cz, obs, R) && !segHit(cx, cz, cx + rx * 0.5, cz + rz * 0.5, obs, R)) { if (sg !== side && st) { st.side = sg; st.sideUntil = now + 2500; } return [cx, cz]; }
    }
    return null;
  }
  // slide: for movement that is not a route (orbiting a target): the intended point, else the part of it along one axis, else stay put
  function slide(px, pz, nx, nz, obs, R = BOT_R) {
    if (!obs || !obs.length || !segHit(px, pz, nx, nz, obs, R)) return [nx, nz];
    if (!segHit(px, pz, nx, pz, obs, R)) return [nx, pz];
    if (!segHit(px, pz, px, nz, obs, R)) return [px, nz];
    return [px, pz];
  }
  // ---- stuck detection. track() is called every time a bot tries to walk somewhere (not on arrival): when it has covered less than MIN_NET metres in WIN ms it is stuck, jittering in place counts too.
  // Returns 0 (fine) or an escalating level: 1 = flip the detour side, 2 = walk a short escape leg sideways, 3 = give the route up and plan again.
  const WIN = 1100, MIN_NET = 0.3, GOAL_WIN = 3000, MIN_GAIN = 0.3;
  function track(st, x, z, now, tx, tz) {   // tx, tz (optional): the goal. Also stuck when the distance to it has not shrunk by MIN_GAIN in GOAL_WIN ms (a bot pacing inside a pen of props moves, but gets nowhere)
    const t = st.trk || (st.trk = { x, z, t: now, lvl: 0, gd: Infinity, gt: now });
    if (tx !== undefined) {
      const gd = Math.hypot(tx - x, tz - z);
      if (gd < t.gd - MIN_GAIN) { t.gd = gd; t.gt = now; } else if (now - t.gt >= GOAL_WIN) { t.gt = now; t.gd = gd; t.x = x; t.z = z; t.t = now; t.lvl = Math.min(3, t.lvl + 1); return t.lvl; }
    }
    if (Math.hypot(x - t.x, z - t.z) >= MIN_NET) { t.x = x; t.z = z; t.t = now; if (tx === undefined) t.lvl = 0; return 0; }
    if (now - t.t < WIN) return 0;
    t.t = now; t.lvl = Math.min(3, t.lvl + 1); return t.lvl;
  }
  const untrack = st => { if (st.trk) st.trk = null; };   // call when the bot is not trying to move (fighting, idle): no stale window
  function escape(st, ux, uz, now) {   // set a short sideways leg (0.7 s) perpendicular to travel, on the side we were NOT using
    const sg = st.side ? -st.side : (Math.random() < 0.5 ? -1 : 1); st.side = sg; st.sideUntil = now + 2500;
    const [rx, rz] = rot(ux, uz, 1.57 * sg); st.esc = { x: rx, z: rz, until: now + 700 };
  }

  // ---- stat-based item decisions. Items come from items.js (info(key) -> { type, attack, health, heal, ... }); no item id appears here.
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const weaponValue = it => it && it.type === 'weapon' ? num(it.attack) : -1;   // damage per hit; tier / family are not used
  const armorValue = it => it && it.type === 'armor' ? num(it.health) : -1;
  const healValue = it => it && it.type === 'consumable' ? Math.max(0, num(it.heal)) : 0;   // hit points restored by one use (0 for brains, plushies and other consumables)
  // best(keys, info, value): the key with the highest value above `floor`
  function best(keys, info, value, floor = -1) { let bk = null, bv = floor; for (const k of keys) { const it = k && info(k); if (!it) continue; const v = value(it); if (v > bv) { bv = v; bk = k; } } return bk; }
  // the heal to drink now: a heal item once the missing health covers most of what it restores, or when health is low (< lowFrac). Returns the smallest heal that is enough (no wasted big potions); else the biggest one when nothing is enough.
  function pickHeal(keys, info, hp, maxHp, lowFrac = 0.45) {
    const missing = maxHp - hp; if (missing <= 0) return null;
    const cands = keys.map(k => [k, healValue(k && info(k))]).filter(c => c[1] > 0).sort((a, b) => a[1] - b[1]); if (!cands.length) return null;
    const low = hp < maxHp * lowFrac;
    for (const [k, h] of cands) if (h >= missing && (low || missing >= h * 0.6)) return k;   // smallest that covers it
    const [k, h] = cands[cands.length - 1]; return low || missing >= h * 0.8 ? k : null;
  }
  const api = { BOT_R, hitAt, segHit, pushOut, steer, slide, track, untrack, escape, weaponValue, armorValue, healValue, best, pickHeal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GKBOTNAV = api;
})(typeof window !== 'undefined' ? window : globalThis);

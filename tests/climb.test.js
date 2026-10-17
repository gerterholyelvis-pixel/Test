// CLIMB: the shared vertical model (world.js vstep / groundY / climbFrame), which props are climbable, stability on and around crate tops, and the server's height validation,
// 3D hits and high ground, plus climbing at 100 ms of network jitter without a single correction (docs/reports/climb.md)
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const C = W.CLIMB, RAD = 0.45, NONE = Array(W.NATT).fill('chest'), DT = 1 / 60;
const near = (a, b, e, msg) => assert(Math.abs(a - b) <= e, (msg || 'near') + ': ' + a + ' vs ' + b);

// the client's per-frame movement (game.js frame + JUMP.step without the wall rects): slide with the feet height, then the shared climbFrame
function frame(s, x, z, tx, tz, speed, types = NONE) {
  const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz), st = Math.min(d, speed * DT);
  let qx = x, qz = z; if (st > 1e-6) [qx, qz] = W.slide(x, z, x + dx / d * st, z + dz / d * st, RAD, types, true, s.y);
  const [px, pz, ev] = W.climbFrame(s, qx, qz, RAD, types, DT, true); return [px, pz, ev];
}
// walk from (x, z) toward the centre of prop p, press jump when the edge is close, stop on the centre; returns the per-frame states
function climbRun(p, x, z, opts = {}) {
  const s = { y: opts.y0 || 0 }, out = []; let jumped = !!opts.nojump;
  for (let n = 0; n < (opts.frames || 150); n++) {
    if (!jumped && Math.hypot(x - p.x, z - p.z) < p.r + RAD + (opts.lead || 0.5)) { s.buf = C.BUF; jumped = true; }
    const tx = opts.tx != null ? opts.tx : p.x, tz = opts.tz != null ? opts.tz : p.z;
    [x, z] = frame(s, x, z, tx, tz, Math.hypot(tx - x, tz - z) < 0.05 ? 0 : 4.6, opts.types); out.push({ x, z, y: s.y, air: s.air });
  }
  return out;
}
// a climbable crate with free floor between it and its room's centre (the approach used by the server tests)
function pickCrate() {
  for (let i = 0; i < W.NARENA; i++) {
    if (W.kindOf(i) !== 'arena') continue;
    const [cx, cz] = W.rc(i);
    for (const p of W.solidsOf(String(i), '')) {
      if (p.k !== 'crate' || !p.climb || p.h < 0.75) continue;
      const d = Math.hypot(cx - p.x, cz - p.z), ux = (cx - p.x) / d, uz = (cz - p.z) / d, sx = p.x + ux * (p.r + 2.2), sz = p.z + uz * (p.r + 2.2);
      const others = W.solidsOf(String(i), '').filter(q => q !== p), clear = (x, z) => others.every(q => Math.hypot(x - q.x, z - q.z) > q.r + RAD + 0.3);
      let free = true; for (let t = 0; t <= 1; t += 0.05) if (!clear(sx + (p.x - sx) * t, sz + (p.z - sz) * t)) free = false;      if (free &&!W.inProp(sx, sz, RAD + 0.2, NONE, true) && W.roomKeyOf(sx, sz) === String(i)) return { p, room: i, sx, sz, ux, uz };
    }
  }
  throw new Error('no crate');
}

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '60000' }); let fail = 1;
  const pair = async wins => {
    const [a, b] = await Promise.all([connect(srv.port, 'goblin=0&wins=' + wins), connect(srv.port, 'goblin=0&wins=' + wins)]);
    await a.until(x => x.state.match && x.state.match.alive === 2, 2500, 'both entered'); return [a, b];
  };
  const snaps = (c, id, from = 0) => c.msgs.slice(from).filter(m => m.s).flatMap(m => { const o = []; for (let i = 1; i < m.s.length; i += 6) if (m.s[i] === id) o.push({ x: m.s[i + 1], z: m.s[i + 2], v: m.s[i + 4], y: Math.floor(m.s[i + 4] / 100) / 100 }); return o; });
  const fixes = (c, from) => c.msgs.slice(from).filter(m => m.fix);
  const msgOf = st => ({ m: [+st.x.toFixed(2), +st.z.toFixed(2), 0, ...(st.y > 0.004 ? [Math.round(st.y * 100)] : [])] });
  // play the frames back as {m} at 20 Hz (every 3rd frame, like game.js) plus the take-off / landing frames; jitter: extra random arrival delay (order kept, like TCP)
  const playback = async (c, frames, jitter = 0) => {
    const idx = []; for (let i = 0; i < frames.length; i++) if (i % 3 === 2 || (i && frames[i].air !== frames[i - 1].air)) idx.push(i);
    const t0 = Date.now(); let arr = 0;
    for (const i of idx) { arr = Math.max(arr, i * DT * 1000 + Math.random() * jitter); const w = t0 + arr - Date.now(); if (w > 0) await sleep(w); c.send(msgOf(frames[i])); }
    await sleep(120);
  };
  const K = pickCrate();
  try {
    fail = await L.run('climb', [
      ['vertical model: a jump peaks at APEX after AIR / 2, gravity brings him back, coyote time and the jump buffer work, small steps are automatic', () => {
        near(C.APEX, 1.2, 1e-9); assert(C.APEX >= 1.1 && C.APEX <= 1.3, 'apex 1.1-1.3 m');
        const s = { y: 0, buf: C.BUF }; let peak = 0, t = 0, ev = W.vstep(s, DT, 0); eq(ev, 'jump');
        while (s.air && t < 2) { W.vstep(s, DT, 0); t += DT; peak = Math.max(peak, s.y); }
        near(peak, C.APEX, 0.03, 'peak'); near(t + DT, C.AIR, 0.04, 'airtime'); eq(s.y, 0); eq(s.air, false);
        // coyote: walked off a 0.9 m top; a jump 80 ms later still works, 150 ms later it does not
        for (const [late, ok] of [[0.08, true], [0.15, false]]) { const q = { y: 0.9 }; W.vstep(q, DT, 0); assert(q.air, 'falls off the edge'); let tt = DT; while (tt < late) { W.vstep(q, DT, 0); tt += DT; } q.buf = C.BUF; const e = W.vstep(q, DT, 0); eq(e === 'jump', ok, 'coyote ' + late); }
        // buffer: pressing 0.1 s before landing jumps on landing
        { const q = { y: 0, buf: C.BUF }; W.vstep(q, DT, 0); let n = 0, evs = []; while (n++ < 200) { if (q.air && q.vy < 0 && q.y < 0.3 && !q.pressed) { q.buf = C.BUF; q.pressed = 1; } const e = W.vstep(q, DT, 0); if (e) evs.push(e); if (evs.length >= 3) break; } eq(evs.slice(0, 2), ['land', 'jump'], 'buffered jump on landing'); }
        // steps: 0.3 m up or down is instant, 0.5 m down is a fall
        { const q = { y: 0 }; eq(W.vstep(q, DT, 0.3), 'step'); eq(q.y, 0.3); eq(!!q.air, false); W.vstep(q, DT, 0); eq(q.y, 0); const r = { y: 0.5 }; W.vstep(r, DT, 0); eq(r.air, true); }
        // no input: no jump, gravity still applies
        { const q = { y: 0, buf: C.BUF }; eq(W.vstep(q, DT, 0, false), ''); eq(!!q.air, false); }
      }],
      ['groundY: floor 0, the vault dais, a crate top while over it, only tops within a step of the feet, the support pad', () => {
        const p = K.p; eq(W.groundY(p.x + 5, p.z + 5, NONE), 0);
        near(W.groundY(0, 0, NONE, 0), 0.16, 1e-9, 'dais'); eq(W.groundY(0, 3.4, NONE, 0), 0, 'beyond the dais rim');
        eq(W.groundY(p.x, p.z, NONE), p.h, 'top without a height limit'); eq(W.groundY(p.x, p.z, NONE, 0), 0, 'from the floor the top is a wall, not ground');
        eq(W.groundY(p.x, p.z, NONE, p.h - 0.3), p.h, 'within a step'); eq(W.groundY(p.x + p.r + C.SUP - 0.02, p.z, NONE, p.h), p.h, 'support pad'); eq(W.groundY(p.x + p.r + C.SUP + 0.02, p.z, NONE, p.h), 0, 'past the pad');
        eq(W.blocksAt(p, 0), true); eq(W.blocksAt(p, p.h - C.STEP + 0.01), false);
      }],
      ['which props are climbable: crates, barrels and low home tops; pillars, trunks, the relic pedestal, coffers, urns, stations stay walls; every top is reachable with one jump', () => {
        const all = W.allProps(Array(W.NATT).fill('mystery')).concat(...W.HOME_IDS.map(id => W.solidsOf('c' + id, 'home')));
        for (const p of all) {
          assert(typeof p.h === 'number' && p.h > 0, 'height on ' + p.k);
          if (p.climb) assert(p.h <= C.MAXTOP && p.h <= C.APEX + C.STEP - 0.25, p.k + ' top ' + p.h + ' must be reachable');
          if (['trunk', 'tprop', 'vbprop', 'ped', 'coffer', 'urn', 'bench', 'recycler'].includes(p.k)) eq(p.climb, false, p.k + ' is not climbable');
          if (['crate', 'sbarrel', 'scrate', 'tbarrel'].includes(p.k)) eq(p.climb, true, p.k + ' is climbable');
        }
        assert(all.filter(p => p.climb).length >= 50, 'plenty of tops');
        for (const p of W.allProps(NONE)) if (p.climb) for (const d of W.DOORS) assert(Math.hypot(p.x - d.wall.x, p.z - d.wall.z) > d.hw + 1.0, 'climbable ' + p.k + ' too close to door ' + d.id);   // nobody perches in a doorway
        eq(W.TERRAIN.length, 1);
      }],
      ['climbing: a run-up and a jump land on every arena crate that has a free approach; without a jump he stays on the floor and slides around it', () => {
        let tried = 0, landed = 0;
        for (let i = 0; i < W.NARENA; i++) for (const p of W.solidsOf(String(i), '')) {
          if (!p.climb || p.h < 0.4) continue;
          for (let a = 0; a < 360; a += 30) {
            const ux = Math.cos(a * Math.PI / 180), uz = Math.sin(a * Math.PI / 180), sx = p.x + ux * (p.r + 2), sz = p.z + uz * (p.r + 2);
            if (W.roomKeyOf(sx, sz) !== String(i) || W.inProp(sx, sz, RAD + 0.1, NONE, true)) continue;
            if ([0.25, 0.5, 0.75].some(t => { const x = sx + (p.x - sx) * t, z = sz + (p.z - sz) * t; return Math.hypot(x - p.x, z - p.z) > p.r + RAD + 0.3 && W.inProp(x, z, RAD, NONE, true); })) continue;
            const [cx, cz] = W.rc(i), hx = W.roomW(i) / 2 - W.T / 2 - RAD, hz = W.roomD(i) / 2 - W.T / 2 - RAD; if (Math.abs(sx - cx) > hx || Math.abs(sz - cz) > hz) continue;
            tried++; const fr = climbRun(p, sx, sz), last = fr[fr.length - 1];
            for (const f of fr) assert(!W.inProp(f.x, f.z, RAD - 0.12, NONE, true, f.y), 'inside ' + p.k + ' at y ' + f.y.toFixed(2));
            if (Math.abs(last.y - p.h) < 1e-6 && !last.air) landed++;
            // no jump: never leaves the floor
            const s = { y: 0 }; let x = sx, z = sz; for (let n = 0; n < 90; n++) { [x, z] = frame(s, x, z, p.x, p.z, 4.6); assert(s.y < 1e-9, 'no jump, no climb'); assert(!W.inProp(x, z, RAD - 0.02, NONE, true, 0), 'pushed into the crate (a pocket between two barrels settles 1.3 cm deep)'); }
          }
        }
        assert(tried >= 30, 'approaches tried ' + tried); assert(landed >= tried * 0.9, 'landed ' + landed + ' of ' + tried);
      }],
      ['rock solid: standing on a top does not drift, walking off an edge ends on the floor outside it, a rim perch slides off, a goblin stuck inside is pushed out smoothly', () => {
        const p = K.p, fr = climbRun(p, K.sx, K.sz), on = fr[fr.length - 1]; eq(on.y, p.h, 'on top');
        { const s = { y: p.h }; let x = on.x, z = on.z; for (let n = 0; n < 120; n++) [x, z] = frame(s, x, z, x, z, 0); near(x, on.x, 1e-9, 'no drift x'); near(z, on.z, 1e-9); eq(s.y, p.h); }
        { const s = { y: p.h }; let x = on.x, z = on.z; const tx = p.x + K.ux * (p.r + 2), tz = p.z + K.uz * (p.r + 2); let maxStep = 0;
          for (let n = 0; n < 120; n++) { const ox = x, oz = z; [x, z] = frame(s, x, z, tx, tz, 3); maxStep = Math.max(maxStep, Math.hypot(x - ox, z - oz)); assert(!W.inProp(x, z, RAD - 0.12, NONE, true, s.y), 'inside while stepping off'); }
          eq(s.y, 0, 'back on the floor'); assert(Math.hypot(x - p.x, z - p.z) >= p.r + RAD - 1e-6, 'outside'); assert(maxStep < 0.12, 'no pop: ' + maxStep); }
        { const s = { y: p.h }; let x = p.x + K.ux * (p.r + C.SUP + 0.05), z = p.z + K.uz * (p.r + C.SUP + 0.05); for (let n = 0; n < 90; n++) [x, z] = frame(s, x, z, x, z, 0); eq(s.y, 0, 'the rim does not hold him'); assert(Math.hypot(x - p.x, z - p.z) >= p.r + RAD - 1e-6, 'slid off clear of the crate'); }
        { let x = p.x + K.ux * 0.2, z = p.z + K.uz * 0.2; const s = { y: 0 }; let steps = 0; for (let n = 0; n < 60; n++) { const ox = x, oz = z; [x, z] = frame(s, x, z, x, z, 0); steps = Math.max(steps, Math.hypot(x - ox, z - oz)); } assert(!W.inProp(x, z, RAD - 1e-3, NONE, true, 0), 'unstuck'); assert(steps <= C.PUSHV * DT + 1e-9, 'smooth push ' + steps); }
      }],
      ['server: climbing onto a crate is accepted and other goblins see him on top; he stays up there (the stuck guard leaves him alone); walking off brings him down; no corrections', async () => {
        const [a, b] = await pair(1); b.send({ tp: [K.sx, K.sz] }); a.send({ tp: [K.sx + K.ux * 2, K.sz + K.uz * 2] }); await sleep(150);
        const n = a.msgs.length, nb = b.msgs.length, fr = climbRun(K.p, K.sx, K.sz); await playback(b, fr);
        const ys = snaps(a, b.state.you, n).map(s => s.y); near(ys[ys.length - 1], K.p.h, 0.011, 'seen on top'); assert(Math.max(...ys) > K.p.h + 0.2, 'the arc is seen');
        await sleep(require('../doorguard.js').STUCK_MS + 700); eq(fixes(b, nb), [], 'the stuck guard leaves a goblin standing on a top alone');
        const off = climbRun(K.p, fr[fr.length - 1].x, fr[fr.length - 1].z, { tx: K.sx, tz: K.sz, frames: 90, y0: K.p.h, nojump: true }); await playback(b, off);
        eq(snaps(a, b.state.you, n).pop().y, 0, 'down again'); eq(fixes(b, nb), [], 'no corrections'); await a.close(); await b.close();
      }],
      ['server: no climbing without a jump, no flying, no hovering, no climbing a tree trunk', async () => {
        const [a, b] = await pair(2), p = K.p, ox = p.x + K.ux * (p.r + 0.5), oz = p.z + K.uz * (p.r + 0.5);
        b.send({ tp: [ox, oz] }); a.send({ tp: [K.sx + K.ux * 2, K.sz + K.uz * 2] }); await sleep(150);
        let n = a.msgs.length, nb = b.msgs.length; b.send({ m: [+p.x.toFixed(2), +p.z.toFixed(2), 0, Math.round(p.h * 100)] }); await sleep(200);   // teleport up onto the top
        assert(fixes(b, nb).length >= 1, 'refused'); assert(snaps(a, b.state.you, n).every(s => s.y < 0.3), 'never seen on top');
        await L.sleep(200); b.send({ tp: [K.sx, K.sz] }); b.send({ m: [K.sx, K.sz, 0] }); await sleep(150);
        n = a.msgs.length; b.send({ m: [K.sx, K.sz, 0, 900] }); await sleep(150);   // flying: 9 m
        assert(snaps(a, b.state.you, n).every(s => s.y <= C.APEX + 0.13), 'clamped to launch + APEX');
        n = a.msgs.length; nb = b.msgs.length; const t0 = Date.now(); while (Date.now() - t0 < 3800) { b.send({ m: [K.sx, K.sz, 0, 100] }); await sleep(100); }   // hovering at 1 m
        assert(snaps(a, b.state.you, n).some(s => s.y === 0), 'put down after AIRMAX'); assert(fixes(b, nb).some(f => f.fix.length === 3), 'a height fix');
        b.send({ m: [K.sx, K.sz, 0] }); await sleep(100);
        n = a.msgs.length; b.send({ m: [K.sx, K.sz, 0, 60] }); await sleep(60); b.send({ m: [K.sx, K.sz, 0, 30] }); await sleep(60); b.send({ m: [K.sx, K.sz, 0, 90] }); await sleep(120);   // falling, then rising again
        assert(snaps(a, b.state.you, n).every(s => s.y <= 0.61), 'no second jump in mid air'); b.send({ m: [K.sx, K.sz, 0] }); await sleep(100);
        // a tree trunk is a wall at any height: a jump into it is refused
        const tc = W.TREE_CELLS[0], [tx, tz] = W.rc(tc); b.send({ tp: [tx + 2.2, tz] }); b.send({ m: [tx + 2.2, tz, 0] }); await sleep(150); nb = b.msgs.length;
        { const s = { y: 0, buf: C.BUF }; let x = tx + 2.2; for (let k = 0; k < 24; k++) { W.vstep(s, 0.025, 0); x -= 0.1; b.send({ m: [+x.toFixed(2), tz, 0, Math.round(s.y * 100)] }); await sleep(25); } }
        assert(fixes(b, nb).length >= 1, 'jumping into the trunk is refused'); await a.close(); await b.close();
      }],
      ['server: hits in 3D: from a crate top +10% damage (hg:1), from below a normal hit; a bolt shot from the floor still stops on a big crate', async () => {
        const [a, b] = await pair(3); a.send({ tp: [K.sx, K.sz] }); const bx = K.p.x + K.ux * (K.p.r + 0.6), bz = K.p.z + K.uz * (K.p.r + 0.6); b.send({ tp: [bx, bz] }); await sleep(150);
        await playback(a, climbRun(K.p, K.sx, K.sz)); b.send({ m: [+bx.toFixed(2), +bz.toFixed(2), Math.atan2(K.ux, K.uz)] }); await sleep(150);
        const yawAB = Math.atan2(-(bx - K.p.x), -(bz - K.p.z)), base = G.ITEMS[G.START[0].weapon].attack;
        const [ax, az] = (() => { const fr = climbRun(K.p, K.sx, K.sz); const l = fr[fr.length - 1]; return [l.x, l.z]; })();
        a.send({ m: [+ax.toFixed(2), +az.toFixed(2), yawAB, Math.round(K.p.h * 100)] }); await sleep(120);
        let k = a.msgs.length; a.send({ atk: 1 }); await a.until(x => x.msgs.slice(k).some(m => m.hit), 1500, 'hit from above');
        const h1 = a.msgs.slice(k).find(m => m.hit).hit; eq(h1.hg, 1, 'high ground flag'); eq(h1.dmg, Math.round(base * 1.1), 'high ground damage');
        await sleep(900); b.send({ m: [+bx.toFixed(2), +bz.toFixed(2), yawAB + Math.PI] }); await sleep(100); k = b.msgs.length; b.send({ atk: 1 });
        await b.until(x => x.msgs.slice(k).some(m => m.hit), 1500, 'hit from below (reach is 3D but generous)'); const h2 = b.msgs.slice(k).find(m => m.hit).hit; eq(h2.hg, undefined); eq(h2.dmg, base);
        // line of sight: floor to floor through a big crate is blocked, over it from the top is clear
        const p = K.p; eq(W.segBlocked(p.x + 2, p.z, p.x - 2, p.z, NONE, 0, 0.9, 0.9), p.h + 0.12 > 0.9, 'floor-level line vs the crate'); eq(W.segBlocked(p.x + 2, p.z, p.x - 2, p.z, NONE, 0, p.h + 0.9, 0.9), false, 'from up high');
        await a.close(); await b.close();
      }],
      ['netcode: jumping on and off a crate with 100 ms of arrival jitter never draws a correction', async () => {
        const [a, b] = await pair(4); b.send({ tp: [K.sx, K.sz] }); a.send({ tp: [K.sx + K.ux * 2.5, K.sz + K.uz * 2.5] }); await sleep(150); const nb = b.msgs.length;
        for (let r = 0; r < 3; r++) {
          const up = climbRun(K.p, K.sx, K.sz, { lead: 0.35 + r * 0.15 }); await playback(b, up, 100); const l = up[up.length - 1];
          const off = climbRun(K.p, l.x, l.z, { tx: K.sx, tz: K.sz, frames: 80, y0: K.p.h, nojump: r === 1, lead: 2 }); await playback(b, off, 100);
        }
        eq(fixes(b, nb).length, 0, 'no corrections'); await a.close(); await b.close();
      }],
      ['bots: an idle bot sometimes takes the high ground on a crate top and always comes down again', async () => {
        const s2 = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '90000', GK_BOT_GRACE_MS: '120000', GK_BOT_PERCH_MS: '1200' });
        try {
          const c = await connect(s2.port, 'goblin=1'), t0 = Date.now(), up = new Map(), downAfter = new Set();
          while (Date.now() - t0 < 30000) { await sleep(500); for (const m of c.msgs.splice(0)) if (m.s) for (let i = 1; i < m.s.length; i += 6) { const id = m.s[i], y = Math.floor(m.s[i + 4] / 100) / 100; if (y >= 0.45 && W.groundY(m.s[i + 1], m.s[i + 2], c.state.layout || NONE, y, C.SUP + 0.1) >= y - 0.02) up.set(id, Date.now()); else if (y < 0.2 && up.has(id)) downAfter.add(id); } if (up.size && [...up.keys()].every(id => downAfter.has(id))) break; }
          assert(up.size >= 1, 'some bot stood on a top'); for (const id of up.keys()) assert(downAfter.has(id), 'bot ' + id + ' came down again'); await c.close();
        } finally { s2.stop(); }
      }],
    ]);
  } catch (e) { console.log('  FAIL  climb: ' + (e && e.stack || e)); fail = 1; }
  finally { srv.stop(); process.exit(fail ? 1 : 0); }
})();

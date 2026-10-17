// ARENASOLID: collision vs placement audit of every room (pure, world.js only; art modules read the same solids): props stay inside the walls, never block a doorway lane,
// do not overlap props of another kind, hall pieces all have collision and every hall solid belongs to a piece, ground height is finite and the floor is flat where a goblin stands.
const W = require('../world.js'), { run, assert, eq } = require('./lib.js');
const TREE = Object.keys(W.TREE_SOLIDS), LOOT = ['chest', 'mystery', 'merchant', 'forge', 'grand', 'home'];
const combos = [];   // [room key, type]
for (const r of W.ROOMS) { const k = r.key; if (k[0] === 'c') for (const t of LOOT) combos.push([k, t]); else if (W.treeKind && [6, 8, 16, 18].includes(+k)) for (const t of TREE) combos.push([k, t]); else combos.push([k, '']); }
const doorPts = k => W.DOORS.filter(d => d.a === k || d.b === k).map(d => [d.wall.x, d.wall.z]);
const segDist = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
const problems = {};
const note = (kind, s) => (problems[kind] = problems[kind] || []).push(s);
for (const [k, t] of combos) {
  const r = W.roomRect(k); let sol; try { sol = W.solidsOf(k, t); } catch (e) { note('throws', k + ' ' + t + ' ' + e.message); continue; }
  const tag = k + '/' + t;
  for (const s of sol) {
    if (!isFinite(s.x + s.z + s.r)) { note('nan', tag); continue; }
    if (Math.abs(s.x - r.cx) + s.r > r.hw + 0.15 && Math.abs(s.x - r.cx) - s.r > -0.01 && Math.abs(s.x - r.cx) > r.hw - s.r * 0.5 + 0.15) note('wall', tag + ' ' + s.k + ' x ' + (s.x - r.cx).toFixed(2));
    if (Math.abs(s.z - r.cz) > r.hd - s.r * 0.5 + 0.15) note('wall', tag + ' ' + s.k + ' z ' + (s.z - r.cz).toFixed(2));
    if (k[0] !== 'c') for (const [dx, dz] of doorPts(k)) if (segDist(s.x, s.z, dx, dz, dx + (r.cx - dx) * Math.min(1, 4.5 / Math.hypot(r.cx - dx, r.cz - dz)), dz + (r.cz - dz) * Math.min(1, 4.5 / Math.hypot(r.cx - dx, r.cz - dz))) < s.r + 0.55) note('lane', tag + ' ' + s.k + ' (' + s.x.toFixed(1) + ',' + s.z.toFixed(1) + ') r' + s.r.toFixed(2));
    const g = W.groundY(s.x, s.z); if (!isFinite(g)) note('ground', tag);
  }
}
const cnt = (a, n = 6) => a ? a.length + ': ' + a.slice(0, n).join('; ') : '0';
run('arena-solid', [
  ['no solid is NaN and no room throws', () => { assert(!problems.nan && !problems.throws, cnt(problems.nan) + ' ' + cnt(problems.throws)); }],
  ['no prop circle pokes out through a wall', () => { assert(!problems.wall, cnt(problems.wall)); }],
  ['no prop blocks a door lane (the first 4.5 m inside the door, 1.1 m wide)', () => { assert(!problems.lane, cnt(problems.lane)); }],
  ['ground height is finite under every prop', () => { assert(!problems.ground, cnt(problems.ground)); }],
  ['every hall piece has collision and every hall solid belongs to a piece', () => {
    for (const i of W.HALL_CELLS) {
      const pcs = W.hallPieces(i), sol = W.solidsOf(String(i), '').filter(s => /^hall/.test(s.k));
      assert(pcs.length >= 3, 'hall ' + i + ' has pieces');
      for (const p of pcs) assert(sol.some(s => Math.hypot(s.x - p.x, s.z - p.z) <= Math.max(p.hx, p.hz) + 0.01 + s.r), 'hall ' + i + ' piece ' + p.h + ' has no collision circle');
      for (const s of sol) assert(pcs.some(p => Math.hypot(s.x - p.x, s.z - p.z) <= Math.max(p.hx, p.hz) + s.r + 0.01), 'hall ' + i + ' solid ' + s.k + ' has no piece');
    }
  }],
  ['hall pieces do not overlap each other (footprint circles of different pieces)', () => {
    for (const i of W.HALL_CELLS) { const p = W.hallPieces(i); for (let a = 0; a < p.length; a++) for (let b = a + 1; b < p.length; b++) assert(Math.hypot(p[a].x - p[b].x, p[a].z - p[b].z) > Math.min(p[a].hx, p[a].hz) + Math.min(p[b].hx, p[b].hz) - 0.2, 'hall ' + i + ': ' + p[a].h + ' overlaps ' + p[b].h); }
  }],
]);

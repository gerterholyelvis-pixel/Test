// Duel harness (docs/reports/bots6.md), not part of `npm test`: bot against bot with the same weapon, armour and goblin type in one plain hall, fought to the death
// (no fleeing, no items). Side A runs the BOTS6 fight code, side B the old one (tac:false), or both the same for a control. Sides alternate between the two bots.
//   node tests/sim-duel.js [duels per weapon=20] [parallel=6] [weapons=w:spear,w:pike,...] [armour=a:knight]
// Exports duels(o) -> { rows, table } so a test can run a small version.
const L = require('./lib.js'), { connect, sleep } = L;
const WEAPONS = ['w:spear', 'w:pike', 'w:warhammer', 'w:maul', 'w:dagger', 'w:sword', 'w:mace', 'w:bow', 'w:sling', 'w:emberwand', 'w:bullwhip'];
async function duels(o) {
  o = Object.assign({ n: 20, parallel: 6, weapons: WEAPONS, armour: 'a:knight', goblin: 1, a: { tac: true }, b: { tac: false }, log: true, limit: 45000 }, o || {});
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_QUEUE_MS: '100', GK_READY_MS: '300', GK_ROUND_MS: '1200', GK_NEXT_ROUND_MS: '120000', GK_BOT_GRACE_MS: '0', ...(o.env || {}) });
  const jobs = []; for (const w of o.weapons) for (let i = 0; i < o.n; i++) jobs.push({ w, i, swap: i % 2 === 1 });
  const rows = []; let k = 0, lock = Promise.resolve();
  const one = async job => {
    const got = lock.then(() => connect(srv.port, 'name=Duel' + k)); lock = got.then(() => sleep(50), () => {});   // one client per match: the next one joins after this match has started
    const c = await got; c.send({ kill: 1 });
    await c.until(x => x.state.round && x.state.round.n >= 2, 8000, 'round 2').catch(() => {});
    const A = { ...o.a, w: job.w, arm: o.armour, goblin: o.goblin }, B = { ...o.b, w: job.w, arm: o.armour, goblin: o.goblin };
    c.send({ duel6: { a: job.swap ? B : A, b: job.swap ? A : B } });
    await c.until(x => x.state.duel6, 3000, 'duel6').catch(() => {});
    const ids = c.state.duel6 && c.state.duel6.ids, t0 = Date.now();
    await c.until(x => x.state.matchEnd, o.limit, 'end').catch(() => {});
    const e = c.state.matchEnd, win = e && e.winner && e.winner.id, aId = ids ? ids[job.swap ? 1 : 0] : null;
    const res = !ids ? 'error' : !e ? 'draw' : win === aId ? 'A' : ids.includes(win) ? 'B' : 'draw';
    rows.push({ w: job.w, res, secs: (Date.now() - t0) / 1000 }); await c.close();
  };
  try {
    const workers = Array.from({ length: Math.min(o.parallel, jobs.length) }, async (_, wi) => { await sleep(150 * wi); while (k < jobs.length) { const j = jobs[k++]; await one(j); } });
    await Promise.all(workers);
  } finally { srv.stop(); }
  const table = {};
  for (const r of rows) { const t = table[r.w] || (table[r.w] = { A: 0, B: 0, draw: 0, error: 0, secs: 0, n: 0 }); t[r.res]++; t.n++; t.secs += r.secs; }
  for (const w in table) { const t = table[w]; t.secs = +(t.secs / t.n).toFixed(1); t.aShare = +(t.A / Math.max(1, t.A + t.B)).toFixed(2); }
  if (o.log) { for (const w of Object.keys(table)) { const t = table[w]; console.log(w.padEnd(13) + ' A ' + String(t.A).padStart(3) + '  B ' + String(t.B).padStart(3) + '  draw ' + t.draw + (t.error ? '  error ' + t.error : '') + '  A share ' + t.aShare + '  mean ' + t.secs + ' s'); }
    const tot = rows.reduce((s, r) => (s[r.res] = (s[r.res] || 0) + 1, s), {}); console.log('total ' + JSON.stringify(tot) + '  A share ' + (tot.A / Math.max(1, (tot.A || 0) + (tot.B || 0))).toFixed(2)); }
  return { rows, table };
}
module.exports = { duels };
if (require.main === module) {
  const a = process.argv.slice(2), o = { n: +a[0] || 20, parallel: +a[1] || 6 };
  if (a[2]) o.weapons = a[2].split(','); if (a[3]) o.armour = a[3]; if (a[4]) o.goblin = +a[4];
  if (process.env.DUEL_CONTROL) o.a = { tac: process.env.DUEL_CONTROL === 'new' }, o.b = { tac: process.env.DUEL_CONTROL === 'new' };
  if (process.env.DUEL_LVL) { const [la, lb] = process.env.DUEL_LVL.split(','); o.a = { tac: true, lvl: la }; o.b = { tac: true, lvl: lb }; }
  duels(o).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
}

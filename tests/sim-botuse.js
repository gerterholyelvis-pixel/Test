// Not part of `npm test` (tests/botuse.test.js runs a tiny version). Plays N all-bot matches with short rounds and counts, per feature, how often the bots used it
// (docs/reports/bots-use.md). The counts come from the server's BOTUSE block (GK_DEBUG {bot5:1} -> `bu`).
//   node tests/sim-botuse.js [matches=20] [roundMs=30000] [parallel=5] [elxScale=4]     (GK_BOT_LEVEL=mix is the default here: easy, normal, hard in turn)
//   elxScale: GK_ELX_SCALE, the pumps run that many times faster (30 s rounds are a quarter of a real 120 s round); 1 = the real rate.
//   5th argument (after elxScale): tree types to force into the 4 tree rooms, e.g. oak,elder,gambler,press (a check of the rare types).
const { simBots5, summary5 } = require('./sim-fairness.js');
const TREES = ['well', 'press', 'spring', 'seer', 'graft', 'thorn', 'gambler', 'memory', 'oak', 'elder'];
const VBS = ['ram', 'locksmith', 'counting', 'keystone'];
// every feature a player can use and the bots must (the counters are named like this in server.js bu())
const FEATURES = {
  'home bench': ['home.craft', 'home.brew'], 'recycler': ['home.recycle', 'home.refine', 'grand.recycle'], 'Master Forge': ['forge.craft'], 'knowledge bench': ['know.learn'],
  'gear': ['equip.weapon', 'equip.armor'], 'pump': ['pump.collect'],
  'screen upgrades': ['pump', 'alarm', 'lock', 'recycler', 'snare', 'bench', 'guard', 'pad', 'sentry'].map(x => 'screen.buy.' + x),
  'screen actions': ['screen.distill', 'screen.rearm', 'screen.ammo'], 'sends': ['leech', 'bell', 'gas', 'rats', 'jam', 'spike'].map(x => 'screen.send.' + x),
  'loot rooms': ['merchant.buy', 'merchant.recycle', 'merchant.craft', 'chest.claim', 'mystery.claim'],
  'halls': ['hall.cache', 'hall.container', 'hall.font', 'hall.stew', 'hall.whet'],
  'tree rooms': TREES.map(t => 'tree.' + t), 'heist rooms': VBS.map(t => 'vb.' + t),
  'heist stations': [].concat(...VBS.map(t => [1, 2, 3, 4].map(i => 'vbx.' + t + '.S' + i))).concat(['vbx.keystone.G1']),
  'vault': ['vault.coop', 'vault.lockpick', 'vault.bribe', 'crown.claim'], 'room visits': ['visit.home', 'visit.forge', 'visit.grand', 'visit.vault', 'visit.tree', 'visit.vb'],
};
const ALL = [].concat(...Object.values(FEATURES));
const LAB_ONLY = ['screen.rearm', 'screen.ammo'];   // need an intruder at a home (a spent snare, a fired sentry); bots never raid, so only tests/botuse.test.js (lab) sees them
function tally(rows) {   // -> { feat: { n, bots (distinct bots), matches, lvl: {easy, normal, hard} (uses) }, nBots, lvlBots: {level: count} }
  const out = {}, lvlBots = {}; let nBots = 0;
  rows.forEach((r, mi) => {
    const s = r.s; if (!s || !s.b6) return; const L = s.b6.lvl || {};
    for (const id in L) { lvlBots[L[id]] = (lvlBots[L[id]] || 0) + 1; nBots++; }
    for (const f in s.bu || {}) {
      const e = s.bu[f], o = out[f] || (out[f] = { n: 0, bots: 0, matches: 0, lvl: {}, lvlBots: {} });
      o.n += e.n; o.bots += Object.keys(e.by).length; o.matches++;
      for (const l in e.lvl) o.lvl[l] = (o.lvl[l] || 0) + e.lvl[l];
      for (const id in e.by) { const l = L[id] || '?'; o.lvlBots[l] = (o.lvlBots[l] || 0) + 1; }
    }
  });
  const present = {}; for (const r of rows) if (r.s) for (const t of new Set(Object.values(r.s.trees || {}).map(x => (x && x.type) || x))) present[t] = (present[t] || 0) + 1;   // matches in which a tree type was in play
  const leave = {}; for (const r of rows) if (r.s) for (const k in r.s.leaveWhy || {}) leave[k] = (leave[k] || 0) + r.s.leaveWhy[k];   // why bots left their goal rooms
  return { feats: out, nBots, lvlBots, present, leave };
}
function report(t, rows) {
  const lines = []; const f = t.feats, zero = [];
  lines.push('feature | uses | bots | easy/normal/hard bots using it');
  for (const group in FEATURES) {
    lines.push('-- ' + group);
    for (const k of FEATURES[group]) { const o = f[k]; if (!o) { zero.push(k); lines.push(k.padEnd(26) + ' 0'); continue; } lines.push(k.padEnd(26) + String(o.n).padStart(5) + String(o.bots).padStart(5) + '   ' + ['easy', 'normal', 'hard'].map(l => (o.lvlBots[l] || 0) + '/' + (t.lvlBots[l] || 0)).join(' ')); }
  }
  zero.splice(0, zero.length, ...zero.filter(k => !LAB_ONLY.includes(k)));
  const extra = Object.keys(f).filter(k => !ALL.includes(k)).sort();
  if (extra.length) lines.push('-- other: ' + extra.map(k => k + ' ' + f[k].n).join(', '));
  lines.push('tree types in play (matches): ' + JSON.stringify(t.present)); lines.push('goal rooms left because: ' + JSON.stringify(t.leave));
  lines.push('bots ' + t.nBots + ' (' + Object.entries(t.lvlBots).map(([l, n]) => l + ' ' + n).join(', ') + '), matches ' + rows.length + ', features at 0: ' + (zero.length ? zero.join(', ') : 'none') + ' (lab only: ' + LAB_ONLY.filter(k => !f[k]).join(', ') + ')');
  return { text: lines.join('\n'), zero };
}
async function main() {
  const n = +process.argv[2] || 20, roundMs = +process.argv[3] || 30000, parallel = +process.argv[4] || 5, scale = process.argv[5] || '4';
  process.env.GK_BOT_LEVEL = process.env.GK_BOT_LEVEL || 'mix'; process.env.GK_ELX_SCALE = scale;
  const force = (process.argv[6] || '').split(',').filter(Boolean), cells = ['6', '8', '16', '18'];   // optional: force these tree types into the 4 tree rooms (a check of rare types, not the usage run)
  const setup = force.length ? async c => { force.slice(0, 4).forEach((t, i) => c.send({ actDbg: { tree: [cells[i], t] } })); } : null;
  const r = await simBots5({ n, roundMs, parallel, log: false, setup });
  const t = tally(r.rows), rep = report(t, r.rows);
  console.log(rep.text); console.log('match summary ' + JSON.stringify(summary5(r.rows))); console.log('sweep mean ms ' + (r.rows.map(x => x.s && x.s.sweepMean).filter(Boolean).reduce((a, b) => a + b, 0) / Math.max(1, r.rows.length)).toFixed(2));
  process.exit(0);
}
module.exports = { FEATURES, ALL, LAB_ONLY, tally, report, TREES, VBS };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });

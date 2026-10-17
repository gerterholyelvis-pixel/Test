// bots5-sim (task G, docs/reports/bots5.md): two all-bot 5x5 matches on short rounds (tests/sim-fairness.js simBots5: 7 s rounds, round 1 at home, sudden death after round 4,
// decided after round 5). Every match ends, every bot leaves its home, bots send activity verbs, nobody is hard stuck, the per-feature bot cost stays small
// and act5 logs no errors. The full 20-match report is `node tests/sim-fairness.js bots5`.
const L = require('./lib.js'), { assert, eq } = L, { simBots5 } = require('./sim-fairness.js');
(async () => {
  let fail = 0, sim = null;
  try { sim = await simBots5({ n: 2, roundMs: 7000, parallel: 2, sudden: 4, max: 5, log: false }); }   // HOME PHASE: round 1 is spent at home, so one round more keeps two open-arena rounds before sudden death
  catch (e) { fail++; console.log('  FAIL  bots5-sim: setup:', e.stack || e); }
  if (sim) fail += await L.run('bots5-sim', [
    ['two all-bot matches end (crown, kills, HP or last standing) and every bot walks out of its home', () => {
      for (const r of sim.rows) { assert(r.how !== 'timeout', 'match ' + r.idx + ' timed out'); assert(r.s, 'stats'); eq(r.s.bots, 7, 'bots'); eq(r.s.left, r.s.bots, 'bots that left home in match ' + r.idx); }
      console.log('         ' + sim.rows.map(r => r.secs + ' s, ' + r.rounds + ' rounds, ' + r.how + ', trees ' + JSON.stringify(r.s.tree) + ', heists ' + JSON.stringify(r.s.vb) + ', rewards ' + JSON.stringify(r.s.rewards)).join('\n         '));
    }],
    ['bots use the activity rooms (tree or heist verbs, or the vault) in both matches', () => {
      for (const r of sim.rows) assert(r.s.treeUsers + r.s.vbUsers + r.s.visits.vault >= 1, 'activity in match ' + r.idx + ': ' + JSON.stringify([r.s.tree, r.s.vb, r.s.visits]));
    }],
    ['never stuck, cheap, no act5 errors: no hard-stuck bot, each feature under 0.5 ms per sweep, the whole sweep under 2 ms', () => {
      for (const r of sim.rows) { eq(r.s.hardStuck, 0, 'hard stuck bots in match ' + r.idx); assert(r.s.stuck <= 6, 'stuck recoveries in match ' + r.idx + ': ' + r.s.stuck); }
      const last = sim.rows[sim.rows.length - 1].s, f = last.f5 || {};
      for (const k of Object.keys(f)) assert(f[k] / Math.max(1, last.sweeps) < 0.5, 'feature ' + k + ' costs ' + (f[k] / last.sweeps).toFixed(3) + ' ms per sweep');
      assert(last.sweepMean < 2, 'mean bot sweep ' + last.sweepMean);
      console.log('         per sweep (ms): ' + Object.keys(f).map(k => k + ' ' + (f[k] / last.sweeps).toFixed(3)).join(', ') + '; whole sweep ' + last.sweepMean.toFixed(3));
      eq(sim.out.split('\n').filter(l => /act5 |TypeError|ReferenceError/.test(l)).slice(0, 3), [], 'server errors');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

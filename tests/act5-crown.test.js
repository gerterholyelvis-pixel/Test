// act5.js + vault5.js: the crown claim on the vault dais decides the match at the time limit (owner Q1: no instant win); death loses the claim.
const L = require('./lib.js'), { connect, assert, eq, sleep } = L, W = require('../world.js');
const me = c => (c.state.players || []).find(p => p.id === c.state.you);
(async () => {
  let fail = 0;
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '11000', GK_MAX_ROUND: '1', GK_QUEUE_MS: '60000' });
  try {
    fail += await L.run('act5-crown', [['the time limit goes to the highest claim, even over more HP; the claim shows in crown and actMe', async () => {
      const [a, b] = await Promise.all([connect(srv.port, 'goblin=1&name=Claimer'), connect(srv.port, 'goblin=1&name=Healthy')]);
      const [vx, vz] = W.rc(W.VAULT); a.send({ hp: 20 });   // without the claim, b (full HP) would win the HP tiebreak
      a.send({ tp: [vx + 0.4, vz + 0.3] });
      await a.until(x => x.state.crown && x.state.crown.claims && x.state.crown.claims.some(e => e.id === x.state.you && e.s >= 5.5), 9500, 'a claim of 5.5 s');
      assert(b.msgs.some(m => m.crown && m.crown.gaining === a.state.you), 'everyone sees the claimant');
      assert(a.msgs.some(m => typeof m.toast === 'string' && /claiming the crown/.test(m.toast)), 'the alarm toast');
      await a.until(x => x.state.actMe && x.state.actMe.claim >= 5, 1500, 'own claim in actMe');
      eq(me(a).stats.health < me(b).stats.health, true, 'a has less HP');
      await a.until(x => x.state.matchEnd, 8000, 'match decided at the time limit');
      const e = a.state.matchEnd; eq(e.timeLimit, 1); eq(e.winner.id, a.state.you, 'the claimant wins'); eq(e.decision.reason, 'claim'); assert(e.decision.claim >= 5, 'claim in the decision');
      assert(a.msgs.some(m => m.won), 'a won'); await b.until(x => x.state.matchEnd, 2000, 'b sees the end');
      await a.close(); await b.close();
    }]]);
  } catch (e) { fail++; console.log('  FAIL  act5-crown setup: ' + e.message); }
  if (/act5 /.test(srv.out())) { fail++; console.log('  FAIL  act5-crown: server errors\n' + srv.out().slice(-1500)); }
  srv.stop();
  const s2 = await L.startServer({ GK_ROUND_MS: '60000' });
  try {
    fail += await L.run('act5-crown', [['vault coffer: a 2 s scoop pays 12 gold and empties a handful', async () => {
      const c = await connect(s2.port), K = require('../act5.js').ANCHORS['12'].K1, g0 = c.state.gold;
      c.send({ tp: [K.x + 2.1, K.z] }); await sleep(200); c.send({ act: { r: '12', a: 'K1', v: 'use' } });   // a spot clear of the vault pillar
      await c.until(x => x.state.gold === g0 + 12, 3500, '+12 gold');
      await c.until(x => x.msgs.some(m => m.actS && m.actS.r === '12' && m.actS.st.cof.K1 === 2), 1500, 'K1 has 2 handfuls left');
      await c.close();
    }], ['death loses the claim', async () => {
      const c = await connect(s2.port); c.send({ actDbg: { claim: 8000 } });
      const [vx, vz] = W.rc(W.VAULT); c.send({ tp: [vx + 0.5, vz] });
      await c.until(x => x.state.crown && x.state.crown.claims.some(e => e.id === x.state.you && e.s >= 8), 4000, 'the claim of 8 s');
      c.send({ kill: 1 }); await c.until(x => x.state.died, 2000, 'died');
      await c.until(x => x.state.crown === null || (x.state.crown && !x.state.crown.claims.some(e => e.id === x.state.you)), 3000, 'the claim is gone');
      await c.close();
    }]]);
  } catch (e) { fail++; console.log('  FAIL  act5-crown setup 2: ' + e.message); }
  if (/act5 /.test(s2.out())) { fail++; console.log('  FAIL  act5-crown: server errors\n' + s2.out().slice(-1500)); }
  s2.stop(); process.exit(fail ? 1 : 0);
})();

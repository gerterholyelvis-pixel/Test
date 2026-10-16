// 5x5 round rules (docs/PLAN-5x5.md 5.2): every round is ROUND_MS (2 min); {dbgFF:1} cuts the running round to 10 s under GK_DEBUG and is ignored without it
// (and before GO); sudden death after round 5; the match is decided after round 7.
const L = require('./lib.js'), { connect, connectRaw, sleep, assert, eq } = L, W = require('../world.js');
const ROUND = 120000;

(async () => {
  const dbg = await L.startServer({}), dbgCd = await L.startServer({ GK_COUNTDOWN_MS: '2500' }), prod = await L.startServer({ GK_DEBUG: '', GK_SECRET: 'test', GK_QUEUE_MS: '0' });
  const short = await L.startServer({ GK_ROUND_MS: '1500', GK_NEXT_ROUND_MS: '1500', GK_BOT_GRACE_MS: '60000' });
  let fail = 1;
  try {
    const R = await Promise.all([
      L.run('rounds5', [['every round is ROUND_MS: round 1 and (after a fast-forward) round 2 both last 2 min; dbgFF leaves at most 10 s', async () => {
        const c = await connect(dbg.port, 'goblin=2'); assert(c.state.dbg === 1 || c.msgs.some(m => m.dbg === 1), 'the debug server advertises dbg:1');
        eq(c.state.round.n, 1); eq(c.state.round.dur, ROUND); assert(c.state.round.left > ROUND - 3000 && c.state.round.left <= ROUND, 'round 1 starts at the full 2 min: ' + c.state.round.left);
        await sleep(200);   // the phase flips to play on the first server tick after GO
        c.send({ dbgFF: 1 }); await c.until(x => x.state.round.left <= 10000, 2000, 'dbgFF cut the round to 10 s');
        assert(c.state.round.left > 8000, 'about 10 s left: ' + c.state.round.left); eq(c.state.round.n, 1); eq(c.state.round.dur, ROUND, 'the round keeps its nominal length');
        await c.until(x => x.state.round.n === 2, 12000, 'round 2 after the fast-forward'); eq(c.state.round.dur, ROUND, 'round 2 is also 2 min'); assert(c.state.round.left > ROUND - 3000, 'round 2 starts at the full length');
        c.send({ dbgFF: 1 }); await c.until(x => x.state.round.left <= 10000, 2000, 'dbgFF in round 2');
        c.send({ dbgFF: 1 }); await sleep(300); assert(c.state.round.left > 8000 || c.state.round.n === 2, 'a second dbgFF never adds time'); eq(c.state.sudden, undefined, 'not sudden death in round 2');
        await c.close();
      }]]),
      L.run('rounds5-go', [['dbgFF is ignored before GO (countdown) and a bad payload does nothing', async () => {
        const c = await connectRaw(dbgCd.port, 'goblin=2'); await c.until(x => x.state.matchStart, 2000, 'matchStart'); c.send({ ready: 1 }); await c.until(x => x.state.countdown, 2000, 'countdown');
        const n0 = c.msgs.length; c.send({ dbgFF: 1 }); c.send({ dbgFF: 2 }); c.send({ dbgFF: 'x' }); await sleep(300); assert(Date.now() < c.state.countdown.at, 'test timing: GO already happened');
        assert(!c.msgs.slice(n0).some(m => m.round && m.round.left < 100000), 'dbgFF during the countdown must not shorten round 1');
        await c.until(x => Date.now() >= x.state.countdown.at + 300, 4000, 'GO'); await sleep(300); assert(!c.state.round || c.state.round.left > ROUND - 6000, 'round 1 runs full length after GO: ' + (c.state.round && c.state.round.left));
        c.send({ dbgFF: 2 }); c.send({ dbgFF: true }); await sleep(300); assert(c.state.round.left > ROUND - 8000, 'only dbgFF:1 counts'); await c.close();
      }]]),
      L.run('rounds5-prod', [['without GK_DEBUG dbgFF is IGNORED (the round keeps its full 2 min), and the debug overrides are off too', async () => {
        const c = await connect(prod.port, 'goblin=2', { wait: 25000 });
        assert(!c.msgs.some(m => m.dbg), 'a non-debug server never advertises dbg'); assert(c.state.round && c.state.round.dur === ROUND, 'round 1 is ROUND_MS (' + (c.state.round && c.state.round.dur) + ')');
        eq(c.state.matchStart.players.length, 8, 'GK_MATCH_SIZE is off: the queue closes with a full table of bots');
        c.send({ dbgFF: 1 }); await sleep(800); c.send({ dbgFF: 1 }); await sleep(500);
        assert(!c.msgs.some(m => m.round && m.round.left < ROUND - 10000), 'dbgFF shortened a round on a non-debug server: ' + JSON.stringify(c.msgs.filter(m => m.round).map(m => m.round.left).slice(-3)));
        assert(c.state.round.left > ROUND - 10000, 'round 1 still has its time: ' + c.state.round.left); assert(!c.closed, 'the connection survives the ignored message'); await c.close();
      }]]),
      L.run('rounds5-sudden', [['sudden death starts after round 5 (every door open), the match is decided after round 7 (timeLimit)', async () => {
        const c = await connect(short.port, 'goblin=2'); const seen = [];
        c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.round) seen.push([d.round.n, d.sudden === 1, (d.open || []).length, d.round.dur]); });
        await c.until(x => x.state.matchEnd, 16000, 'matchEnd after round 7');
        for (const [n, sud, , dur] of seen) { assert(dur === 1500, 'GK_ROUND_MS / GK_NEXT_ROUND_MS shorten every round (round ' + n + ' = ' + dur + ')'); if (n <= 5) assert(!sud, 'no sudden death in round ' + n); }
        const r = n => seen.filter(s => s[0] === n); for (const n of [1, 2, 3, 4, 5, 6, 7]) assert(r(n).length, 'round ' + n + ' ran');
        assert(r(6).some(s => s[1] && s[2] === W.DOORS.length), 'round 6 is sudden death with every door open'); assert(r(7).some(s => s[1] && s[2] === W.DOORS.length), 'round 7 too');
        assert(!seen.some(s => s[0] > 7), 'nothing after round 7'); eq(c.state.matchEnd.timeLimit, 1, 'decided by the time limit'); await c.until(x => x.state.won, 2000, 'the lone goblin wins on the time limit');
        await c.close();
      }]]),
    ]);
    fail = R.reduce((a, b) => a + b, 0);
  } catch (e) { console.log('  FAIL  rounds5 setup: ' + (e.stack || e)); }
  for (const s of [dbg, dbgCd, prod, short]) s.stop(); process.exit(fail ? 1 : 0);
})();

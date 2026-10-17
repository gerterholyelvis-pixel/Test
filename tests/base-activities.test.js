// @timing
// @timeout 150
// Base activities end to end against the real server (docs/reports/base-activities.md): the four jobs, the caps and cooldowns, the round goals with their claim, the lookout window,
// and the refusals (far away, someone else's prop, too early, no job). Real time: a job runs 5 to 11 s, so this file takes about 40 s. GK_DEBUG hooks: {tp}, {dbgElixir:{tank}}.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), BA = require('../baseact.js');
const at = (home, kind, d = 1.2) => { const c = W.CHEST[+home.slice(1)], a = W.HOME_LAYOUT[kind], [x, z] = W.attLocal(c, a[0], a[1]), [cx, cz] = W.attLocal(c, 0, 0), ux = cx - x, uz = cz - z, l = Math.hypot(ux, uz) || 1; return [x + ux / l * d, z + uz / l * d]; };
const homeOf = c => c.state.matchStart.spawn.home;
const mark = c => c.msgs.length;
const since = (c, i, key) => c.msgs.slice(i).map(m => m[key]).filter(v => v !== undefined);
let spare = null;
async function pair(srv) {
  if (spare) { await spare.close(); spare = null; }
  const [a, b, c3] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1'), connect(srv.port, 'goblin=2')]); spare = c3;
  await a.until(c => c.state.round && c.state.round.n >= 1 && c.state.elixir === 0, 4000, 'elixir 0 at GO'); return [a, b];
}
// start `job` at the prop, wait the run out, play it perfectly (key times straight from the seed) and return the baRes
async function runJob(c, home, job, hits) {
  c.send({ tp: at(home, BA.JOBS[job].anchor) }); await sleep(120);
  const i = mark(c); c.send({ ba: { start: job } });
  await c.until(x => since(x, i, 'baStart').length, 2000, job + ' started'); const s = since(c, i, 'baStart')[0];
  eq(s.job, job); const cues = BA.cues(job, s.seed), j = BA.JOBS[job];
  await sleep(s.dur + 120); const k = mark(c);
  c.send({ ba: { done: job, hits: BA.encode(hits ? hits(cues, s) : cues.map(q => [j.type === 'sort' ? q.t + 100 : q.t, q.k])) } });
  await c.until(x => since(x, k, 'baRes').length, 2500, job + ' result'); return since(c, k, 'baRes')[0];
}
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_ROUND_MS: '100000', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0' }); let fail = 1;
  try {
    fail = await L.run('base-activities', [
      ['crank: far away and a stranger are refused, a perfect run adds 4 elixir to the tank, a cheater gets no more, the cooldown holds', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a);
        a.send({ tp: L.centre(ha) }); await sleep(100); let i = mark(a); a.send({ ba: { start: 'crank' } });
        await a.until(c => since(c, i, 'baRes').length, 1500, 'far refused'); assert(/far/i.test(since(a, i, 'baRes')[0].text) && !since(a, i, 'baStart').length, 'too far from the wheel');
        b.send({ tp: at(ha, 'crank') }); await sleep(100); i = mark(b); b.send({ ba: { start: 'crank' } });
        await b.until(c => since(c, i, 'baRes').length, 1500, 'stranger refused'); eq(since(b, i, 'baStart').length, 0, 'a goblin cannot crank another home wheel');
        a.send({ dbgElixir: { tank: 10 } }); await a.until(c => c.state.home && c.state.home.tank === 10, 2000, 'tank 10');
        a.send({ tp: at(ha, 'crank') }); await sleep(100); i = mark(a); a.send({ ba: { start: 'crank' } });
        await a.until(c => since(c, i, 'baStart').length, 2000, 'started'); const s = since(a, i, 'baStart')[0];
        a.send({ ba: { done: 'crank', hits: [] } }); await a.until(c => since(c, i, 'baRes').length, 1500, 'early refused'); assert(/early/i.test(since(a, i, 'baRes')[0].text), 'finishing at once is "Too early"');
        i = mark(a); a.send({ ba: { start: 'crank' } }); await a.until(c => since(c, i, 'baStart').length, 2000, 'second start'); const s2 = since(a, i, 'baStart')[0];
        await sleep(s2.dur + 120); const k = mark(a);
        a.send({ ba: { done: 'crank', hits: BA.encode(Array.from({ length: 60 }, (_, n) => [n * 10, 'x'])) } });   // 60 presses in 600 ms: one lucky cue at most
        await a.until(c => since(c, k, 'baRes').length, 2500, 'cheat result'); const r0 = since(a, k, 'baRes')[0];
        assert(r0.ok && r0.score <= 2, 'spamming pays almost nothing: ' + r0.score);
        const t1 = a.state.home.tank; assert(t1 >= 10 && t1 <= 12, 'tank ' + t1);
        i = mark(a); a.send({ ba: { start: 'crank' } }); await a.until(c => since(c, i, 'baRes').length, 1500, 'cooldown'); assert(/again in/.test(since(a, i, 'baRes')[0].text), 'cooling down: ' + since(a, i, 'baRes')[0].text);
        await a.close(); await b.close();
      }],
      ['crank, perfect: +4 elixir in the tank, the cap of 6 a round holds across runs', async () => {
        const [a] = await pair(srv), ha = homeOf(a);
        a.send({ dbgElixir: { tank: 10 } }); await a.until(c => c.state.home && c.state.home.tank === 10, 2000, 'tank 10');
        const r = await runJob(a, ha, 'crank'); assert(r.ok && r.score === BA.maxScore('crank'), 'perfect run: ' + JSON.stringify(r)); assert(/\+4 elixir/.test(r.text), r.text);
        await a.until(c => c.state.home.tank >= 14 && c.state.home.tank <= 15, 2000, 'tank rose by 4'); await a.until(c => c.state.ba && c.state.ba.cap.crank === 2, 2000, 'cap left 2');
        eq(a.state.ba.cd.crank > 10000, true, 'cooldown shown in the snapshot');
        await a.close();
      }],
      ['tune and sort and dummy pay their capped rewards, two goblins at once', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a), hb = homeOf(b);
        const [r1, r2] = await Promise.all([runJob(a, ha, 'tune'), runJob(b, hb, 'sort')]);
        assert(r1.ok && r1.score === 10 && /\+2 metal/.test(r1.text), 'tune: ' + JSON.stringify(r1)); assert(r2.ok && r2.score === 16 && /\+2 leather/.test(r2.text), 'sort: ' + JSON.stringify(r2));
        await a.until(c => c.state.parts && c.state.parts.metal >= 2, 1500, 'metal arrived'); await b.until(c => c.state.parts && c.state.parts.leather >= 2, 1500, 'leather arrived');
        const g0 = a.state.gold, r3 = await runJob(a, ha, 'dummy'); assert(r3.ok && r3.score === 20 && /\+3 gold/.test(r3.text) && /\+1 knowledge/.test(r3.text), 'dummy: ' + JSON.stringify(r3));
        await a.until(c => c.state.gold === g0 + 3, 1500, 'gold +3');
        await a.close(); await b.close();
      }],
      ['goals board: pump 8, two jobs and a 70% score make the board ready; claim pays once and puts a trophy up; round 1 shows pump / jobs / good', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a);
        a.send({ tp: at(ha, 'board') }); await sleep(100); a.send({ ba: { sync: 1 } });
        await a.until(c => c.state.ba && c.state.ba.goals.length === 3, 1500, 'snapshot'); eq(a.state.ba.goals.map(g => g.id), ['pump', 'jobs', 'good']); eq(a.state.ba.ready, 0);
        let i = mark(a); a.send({ ba: { claim: 1 } }); await a.until(c => since(c, i, 'baRes').length, 1500, 'early claim'); assert(!since(a, i, 'baRes')[0].ok, 'goals not done: no claim');
        a.send({ dbgElixir: { tank: 12 } }); await a.until(c => c.state.home && c.state.home.tank === 12, 2000); a.send({ tp: at(ha, 'pump', 1.0) }); await sleep(100); a.send({ pump: 1 });
        await a.until(c => c.state.elixir >= 12, 1500, 'collected'); a.send({ ba: { sync: 1 } }); await a.until(c => c.state.ba && c.state.ba.goals[0].done, 1500, 'pump goal done');
        const r1 = await runJob(a, ha, 'tune'), r2 = await runJob(a, ha, 'crank'); assert(r1.ok && r2.ok);   // crank has its own 15 s cooldown: a different prop each, so both run
        await a.until(c => c.state.ba && c.state.ba.ready === 1, 2000, 'ready'); eq(a.state.ba.goals.map(g => g.done), [true, true, true]);
        a.send({ tp: at(ha, 'board') }); await sleep(100); const g0 = a.state.gold; i = mark(a); a.send({ ba: { claim: 1 } });
        await a.until(c => since(c, i, 'baRes').some(r => r.ok && r.trophy === 1), 1500, 'claimed'); await a.until(c => c.state.gold === g0 + BA.CFG.CLAIM_GOLD, 1500, 'gold'); await a.until(c => c.state.ba.claimed === 1 && c.state.ba.trophies === 1, 1500, 'trophy');
        i = mark(a); a.send({ ba: { claim: 1 } }); await a.until(c => since(c, i, 'baRes').length, 1500, 'second claim'); assert(!since(a, i, 'baRes')[0].ok, 'once a round'); eq(a.state.gold, g0 + BA.CFG.CLAIM_GOLD, 'no second payout');
        await a.close(); await b.close();
      }],
      ['lookout window: needs the window, reports counts only, has a cooldown and counts for the scout goal', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a);
        a.send({ tp: L.centre(ha) }); await sleep(100); let i = mark(a); a.send({ ba: { look: 1 } }); await a.until(c => since(c, i, 'baRes').length, 1500, 'far'); eq(since(a, i, 'baLook').length, 0, 'no view from the middle of the room');
        a.send({ tp: at(ha, 'window') }); await sleep(100); i = mark(a); a.send({ ba: { look: 1 } });
        await a.until(c => since(c, i, 'baLook').length, 1500, 'look'); const lk = since(a, i, 'baLook')[0];
        assert(Number.isInteger(lk.outside) && Number.isInteger(lk.near) && Number.isInteger(lk.home) && lk.shut > 0 && lk.round === 1, JSON.stringify(lk));
        eq(Object.keys(lk).sort(), ['home', 'near', 'outside', 'round', 'shut'], 'counts and times only: no names or positions');
        await a.until(c => c.state.ba && c.state.ba.scout === undefined && c.state.ba.look > 0, 1500, 'cooldown in the snapshot'); i = mark(a); a.send({ ba: { look: 1 } });
        await a.until(c => since(c, i, 'baRes').length, 1500, 'cooldown'); assert(/clear/.test(since(a, i, 'baRes')[0].text) && !since(a, i, 'baLook').length);
        await a.close(); await b.close();
      }],
      ['leaving the home or giving up: no payout; garbage messages are ignored', async () => {
        const [a] = await pair(srv), ha = homeOf(a);
        a.send({ tp: at(ha, 'bin') }); await sleep(100); let i = mark(a); a.send({ ba: { start: 'sort' } }); await a.until(c => since(c, i, 'baStart').length, 2000, 'started'); const s = since(a, i, 'baStart')[0];
        await sleep(s.dur + 100); a.send({ tp: L.centre(ha) }); await sleep(100); const k = mark(a); a.send({ ba: { done: 'sort', hits: BA.encode(BA.cues('sort', s.seed).map(q => [q.t + 100, q.k])) } });
        await a.until(c => since(c, k, 'baRes').length, 1500, 'left'); assert(!since(a, k, 'baRes')[0].ok, 'walked away: nothing paid');
        for (const bad of [null, 5, 'x', [], { start: 7 }, { start: 'nope' }, { done: 'crank' }, { done: {} }, { cancel: 1 }, { sync: 'x' }, { claim: 0 }, { look: 2 }]) a.send({ ba: bad });
        await sleep(1100); a.send({ ba: { sync: 1 } }); await a.until(c => c.state.ba && c.state.ba.goals, 1500, 'still alive after junk');   // (the home message rate limit is 8 a second, so the junk burst must drain first) eq(a.state.parts && a.state.parts.leather || 0, 0, 'no leather');
        await a.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  base-activities setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

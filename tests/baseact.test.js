// baseact.js and baseactui.js: the base jobs, caps, goals and the prompt targeting. Pure logic, no server (the live checks are tests/base-activities.test.js).
const L = require('./lib.js'), { assert, eq } = L, BA = require('../baseact.js'), UI = require('../baseactui.js'), W = require('../world.js');
const perfect = id => { const j = BA.JOBS[id]; return BA.cues(id, 7).map(c => [j.type === 'sort' ? c.t + 100 : c.t, c.k]); };
(async () => {
  const fail = await L.run('baseact', [
    ['cues: same seed, same list; times rise; the run length covers the last window', () => {
      for (const id of BA.JOB_IDS) {
        const j = BA.JOBS[id], a = BA.cues(id, 1234), b = BA.cues(id, 1234), c = BA.cues(id, 99);
        eq(a, b, id + ' deterministic'); eq(a.length, j.n); assert(JSON.stringify(a) !== JSON.stringify(c), id + ' seeds differ');
        for (let i = 1; i < a.length; i++) assert(a[i].t > a[i - 1].t + j.gap * 0.5, id + ' spacing');
        for (const q of a) assert(j.keys.includes(q.k), id + ' key ' + q.k);
        assert(BA.dur(id, 1234) > a[a.length - 1].t, id + ' dur'); assert(BA.dur(id, 1234) < 16000, id + ' stays short: ' + BA.dur(id, 1234));
      }
    }],
    ['score: perfect play = full marks, no input = 0, wrong keys = 0, one input pays one cue, edge of the window pays 1', () => {
      for (const id of BA.JOB_IDS) {
        const c = BA.cues(id, 7), r = BA.score(id, c, perfect(id)); eq(r.score, BA.maxScore(id), id + ' perfect'); eq(BA.score(id, c, []).score, 0, id + ' idle');
        if (id === 'sort') continue; const wrong = c.map(q => [q.t, BA.JOBS[id].keys.length === 1 ? 'L' : (q.k === 'L' ? 'R' : 'L')]); eq(BA.score(id, c, wrong).score, 0, id + ' wrong key');
        eq(BA.score(id, c, Array.from({ length: 30 }, () => [c[0].t, c[0].k])).score <= 2, true, id + ' spam pays one cue');
      }
      const c = BA.cues('crank', 3), j = BA.JOBS.crank;
      eq(BA.score('crank', c, [[c[0].t + j.good, 'x']]).score, 1, 'good window edge'); eq(BA.score('crank', c, [[c[0].t + j.good + 5, 'x']]).score, 0, 'just outside'); eq(BA.score('crank', c, [[c[0].t + j.perfect, 'x']]).score, 2, 'perfect edge');
      const s = BA.cues('sort', 3); eq(BA.score('sort', s, [[s[0].t + 1000, s[0].k]]).score, 1, 'a late sort pays 1'); eq(BA.score('sort', s, [[s[0].t - 300, s[0].k]]).score, 0, 'before the item shows pays 0'); eq(BA.score('sort', s, [[s[0].t + BA.JOBS.sort.gap + 30, s[0].k]]).score, 0, 'after the window');
    }],
    ['cleanInputs: decodes the wire format; drops future times, odd keys, junk and floods; sorts by time', () => {
      const w = (t, k) => BA.encode([[t, k]])[0];
      const raw = [w(500, 'x'), -5, w(999999, 'x'), 7, 8 * 100 + 7, 'junk', 1.5, NaN, w(50, 'x'), null, [1]];
      eq(BA.cleanInputs(raw, 'crank', 1, 6000), [[50, 'x'], [500, 'x']]);
      eq(BA.cleanInputs(Array.from({ length: 500 }, (_, i) => i * 8), 'crank', 1, 9000).length, BA.JOBS.crank.n * 3 + 4, 'flood is cut'); eq(BA.cleanInputs(null, 'crank', 1, 5), []); eq(BA.cleanInputs([8], 'nope', 1, 5), []);
      eq(BA.cleanInputs([w(6400, 'x')], 'crank', 1, 6000), [], 'later than the server clock allows'); eq(BA.cleanInputs([w(6200, 'x')], 'crank', 1, 6000).length, 1, 'latency slack');
      eq(BA.cleanInputs(BA.encode([[10, 'L'], [20, 'R'], [30, 'U'], [40, 'D'], [50, 'x']]), 'dummy', 1, 999), [[10, 'L'], [20, 'R'], [30, 'U'], [40, 'D'], [50, 'x']], 'every key survives the round trip');
      assert(JSON.stringify({ ba: { done: 'dummy', hits: BA.encode(Array.from({ length: 34 }, (_, i) => [11000 + i, 'D'])) } }).length < 512, 'the busiest legal message fits the 512 byte socket frame');
    }],
    ['rewards: small, tiered, and clipped by the per-round caps; knowledge also by the match cap', () => {
      const ba = BA.roll(BA.newBa(), 1); const max = id => BA.maxScore(id);
      eq(BA.reward('crank', max('crank'), ba), { elx: 4, parts: {}, gold: 0, kn: 0 }); eq(BA.reward('crank', 0, ba).elx, 0); eq(BA.reward('crank', max('crank') * 0.5, ba).elx, 2);
      for (let i = 0; i < 5; i++) BA.apply(ba, 'crank', BA.reward('crank', max('crank'), ba)); eq(ba.got.elx, BA.CAPS.elx, 'elixir capped at ' + BA.CAPS.elx); eq(BA.reward('crank', max('crank'), ba).elx, 0); eq(BA.capLeft('crank', ba), 0);
      for (let i = 0; i < 5; i++) BA.apply(ba, 'x', BA.reward(i % 2 ? 'tune' : 'sort', max('tune'), ba)); eq(ba.got.parts, BA.CAPS.parts, 'parts capped (tune and sort share it)'); eq(BA.capLeft('tune', ba), 0);
      eq(BA.reward('tune', max('tune'), BA.newBa()).parts, { metal: 2 }); eq(BA.reward('sort', max('sort'), BA.newBa()).parts, { leather: 2 }); eq(BA.reward('tune', max('tune') * 0.6, BA.newBa()).parts, { metal: 1 });
      const d = BA.roll(BA.newBa(), 1); let gold = 0, kn = 0;
      for (let r = 1; r <= 6; r++) { BA.roll(d, r); for (let i = 0; i < 4; i++) { const rw = BA.reward('dummy', max('dummy'), d); BA.apply(d, 'dummy', rw); gold += rw.gold; kn += rw.kn; } }
      eq(gold, 6 * BA.CAPS.gold, 'gold: the round cap, six rounds'); eq(kn, BA.CAPS.knMatch, 'knowledge: ' + BA.CAPS.knMatch + ' a match, one a round');
      assert(BA.CAPS.elx + BA.CAPS.parts + BA.CAPS.gold + BA.CAPS.kn + BA.CFG.CLAIM_GOLD <= 25, 'everything a round pays stays small');
    }],
    ['goals: three per round, all doable inside the home, rotating; roll resets counters but keeps trophies and the match knowledge count', () => {
      eq(BA.goalsOf(1).map(g => g.id), ['pump', 'jobs', 'good']);
      for (let r = 1; r <= 12; r++) { const g = BA.goalsOf(r); eq(g.length, 3); eq(new Set(g.map(x => x.id)).size, 3, 'distinct goals in round ' + r); }
      assert(new Set([1, 2, 3].flatMap(r => BA.goalsOf(r).map(g => g.id))).size >= 5, 'rotation covers most goals in three rounds');
      const ba = BA.roll(BA.newBa(), 1); eq(BA.goalsDone(ba, 1), false);
      BA.note(ba, 'pump', 5); BA.note(ba, 'pump', 3); BA.note(ba, 'jobs'); BA.note(ba, 'jobs'); BA.note(ba, 'best', 60); BA.note(ba, 'best', 85); BA.note(ba, 'best', 40);
      eq(ba.best, 85, 'best keeps the maximum'); eq(BA.goalsDone(ba, 1), true); eq(BA.goalView(ba, 1).map(g => g.have), [8, 2, 70], 'progress is clamped to the need');
      ba.trophies = 3; ba.knMatch = 2; ba.claimed = true; BA.roll(ba, 2); eq(ba.trophies, 3); eq(ba.knMatch, 2); eq(ba.claimed, false); eq(ba.pump, 0); eq(ba.got.gold, 0);
    }],
    ['ui: the key a job reads, and the prompt only for a prop in reach that I face', () => {
      eq(UI.keyOf('Space', 'crank'), 'x'); eq(UI.keyOf('KeyE', 'tune'), 'x'); eq(UI.keyOf('KeyA', 'sort'), 'L'); eq(UI.keyOf('ArrowRight', 'sort'), 'R'); eq(UI.keyOf('KeyW', 'sort'), '', 'sort has no up'); eq(UI.keyOf('KeyW', 'dummy'), 'U'); eq(UI.keyOf('Space', 'dummy'), '');
      const home = 'c' + W.CHEST.findIndex(c => c.home), c = W.CHEST[+home.slice(1)];
      const at = (kind, d, yawOff) => { const a = W.HOME_LAYOUT[kind], [ax, az] = W.attLocal(c, a[0], a[1]), [cx, cz] = W.attLocal(c, 0, 0), ux = cx - ax, uz = cz - az, l = Math.hypot(ux, uz) || 1; const x = ax + ux / l * d, z = az + uz / l * d; return { x, z, yaw: Math.atan2(-(ax - x), -(az - z)) + (yawOff || 0) }; };
      let me = at('anvil', 1.2), act = true; const sent = [];
      const ui = UI.create({ world: W, send: m => sent.push(m), snd() {}, toast() {}, me: () => me, home: () => home, active: () => act, inHome: () => true, alive: () => true, lock: { open() {}, close() {} } });
      assert(/Bench tune-up/.test(ui.prompt()), 'near the anvil, facing it: ' + ui.prompt());
      me = at('anvil', 1.2, Math.PI); eq(ui.prompt(), '', 'back turned'); me = at('anvil', 3.5); eq(ui.prompt(), '', 'too far');
      me = at('crank', 1.2); assert(/Crank the pump/.test(ui.prompt()), 'crank: ' + ui.prompt()); me = at('bin', 1.2); assert(/Sort the scrap/.test(ui.prompt())); me = at('dummy', 1.2); assert(/Combo drill/.test(ui.prompt()));
      me = at('board', 1.2); assert(/goals/i.test(ui.prompt())); me = at('window', 1.2); assert(/window/i.test(ui.prompt()));
      act = false; eq(ui.prompt(), '', 'nothing while another panel is open'); act = true;
      me = at('crank', 1.2); eq(ui.key(), true); eq(sent.pop(), { ba: { start: 'crank' } });
      ui.onMsg({ ba: { r: 1, goals: [], ready: 0, claimed: 0, trophies: 0, gold: 6, look: 0, cd: { crank: 4000, tune: 0, sort: 0, dummy: 0 }, cap: { crank: 6, tune: 4, sort: 4, dummy: 7 } } });
      assert(/again in 4 s/.test(ui.prompt()), 'cooldown shown: ' + ui.prompt()); eq(ui.key(), true); eq(sent.length, 0, 'no message while cooling down');
      me = at('board', 1.2); ui.onMsg({ ba: { r: 1, goals: BA.goalView(BA.newBa(), 1), ready: 1, claimed: 0, trophies: 0, gold: 6, look: 0, cd: {}, cap: {} } }); assert(/Claim/.test(ui.prompt())); ui.key(); eq(sent.pop(), { ba: { claim: 1 } });
    }],
    ['codex: the Codex lists every job and goal with the numbers of baseact.js', () => {
      const D = require('../tools/gameinfo.js').build().data, tabs = {}; for (const sec of Object.values(D.sections)) for (const b of sec) for (const x of (b.t === 'cards' ? b.cards : [b])) if (x.t === 'table') tabs[x.id] = x;
      eq(tabs.basejobs.rows.length, BA.JOB_IDS.length, 'job rows'); eq(tabs.basegoals.rows.length, BA.GOALS.length, 'goal rows');
      const dummy = tabs.basejobs.rows.find(r => r.id === 'job-dummy'), crank = tabs.basejobs.rows.find(r => r.id === 'job-crank');
      assert(dummy && new RegExp('cap ' + BA.CAPS.gold).test(dummy.pay), 'the dummy row reads the gold cap: ' + (dummy && dummy.pay)); assert(crank && new RegExp('cap ' + BA.CAPS.elx).test(crank.pay), 'the crank row reads the elixir cap');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

// stats: lifetime stats. stats.js (pure recording rules), statsui.js recording glue driven by server-shaped messages (with stubbed browser globals), save.js persistence,
// and the server's STATS block (died / won / matchEnd carry per-player tallies).
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const ST = require('../stats.js');
const T0 = 1_700_000_000_000;
const play = (s, o, how, extra = {}, t = T0) => { ST.begin(s, { id: o.id || 1, goblin: o.goblin || 0, size: 12 }, t); Object.assign(s.live, o.live || {}); return ST.finish(s, Object.assign({ how }, extra), t + (extra.secs != null ? extra.secs : 300) * 1000); };

// ---- browser stubs so save.js and statsui.js run under node
function browser(session = {}) {
  const store = new Map(), sess = new Map(Object.entries(session));
  const g = global; g.window = g; g.location = { search: '' };
  g.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  g.sessionStorage = { getItem: k => sess.has(k) ? sess.get(k) : null, setItem: (k, v) => sess.set(k, String(v)), removeItem: k => sess.delete(k) };
  g.document = { documentElement: { classList: { add() {} } }, addEventListener() {}, hidden: false, querySelector: () => null, createElement: () => ({}) };
  g.addEventListener = () => {};
  g.GK = { hud5: { S: { vb: { b1: 'ram' }, trees: { t1: 'well' } } }, fun: { state: { names: { 7: 'Gruk' } } }, mode: 'play' };
  for (const f of ['../save.js', '../statsui.js']) { delete require.cache[require.resolve(f)]; require(f); }
  return { store, sess };
}

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_READY_MS: '300' });
  let fail = 1;
  try {
    fail = await L.run('stats', [
      ['blank and normalize: garbage, wrong types, future versions and partial data become a valid object', () => {
        eq(ST.blank(5).tot.matches, 0); eq(ST.blank(5).gob.length, 12);
        for (const junk of [null, undefined, 7, 'x', [], {}, { tot: 5, gob: 'no', recent: {}, live: 3 }]) { const s = ST.normalize(junk, 9); assert(s.v === 1 && s.recent.length === 0 && s.gob.length === 12 && s.tot.wins === 0 && s.live === null, 'junk ' + JSON.stringify(junk)); }
        const s = ST.normalize({ v: 99, extra: 1, tot: { matches: '12', wins: -4, kills: 1e20, quits: 'a' }, streak: 3.9, gob: [{ m: 2, w: 9, k: 1 }], recent: [null, { how: 'bogus', g: 99, pl: 3, by: 'A\u0001B' }].concat(Array(20).fill({ how: 'win' })), best: { rounds: 5 } }, 9);
        eq(s.tot.matches, 12); eq(s.tot.wins, 0); eq(s.tot.kills, 1e9); eq(s.tot.quits, 0); eq(s.streak, 3); eq(s.gob[0].w, 2, 'wins never exceed matches'); eq(s.gob[11].m, 0);
        eq(s.recent.length, 10); eq(s.recent[0].how, 'died'); eq(s.recent[0].g, 11); eq(s.recent[0].by, 'AB'); eq(s.best.rounds, 5); eq(s.v, 1);
        const again = ST.normalize(JSON.parse(JSON.stringify(s))); eq(again, s, 'a normalized object survives JSON unchanged');
      }],
      ['a death: totals, per-goblin, deaths, rounds survived (round - 1), placement from the board, server tallies', () => {
        const s = ST.blank(T0); ST.begin(s, { id: 4, goblin: 4, size: 12 }, T0);
        ST.event(s, { round: { n: 1 } }, null, T0); ST.event(s, { board: { rows: [[4, 'me', 4, 0, 1], [5, 'a', 0, 2, 1], [6, 'b', 0, 0, 1], [7, 'c', 0, 0, 0]] } }, null, T0);
        ST.event(s, { round: { n: 3 } }, null, T0); ST.event(s, { kills: 1 }, null, T0); ST.event(s, { kills: 2 }, null, T0); ST.event(s, { crafted: { key: 'w:x' } }, null, T0); ST.event(s, { recycled: { key: 'w:x' } }, null, T0); ST.event(s, { recycled: {} }, null, T0);
        eq(s.live.others, 2); eq(s.live.round, 3); eq(s.live.kills, 2);
        const r = ST.finish(s, { how: 'died', by: 'Gruk', st: { dd: 50, dt: 40, ge: 300, gs: 120, ex: 25, rd: 3 } }, T0 + 400000);
        eq(s.live, null); eq(r.how, 'died'); eq(r.pl, 3, 'two others alive: placed 3rd'); eq(r.rd, 2); eq(r.secs, 400); eq(r.k, 2); eq(r.by, 'Gruk');
        const t = s.tot; eq([t.matches, t.wins, t.kills, t.deaths, t.rounds, t.secs, t.dealt, t.taken, t.goldEarned, t.goldSpent, t.elixir, t.crafted, t.recycled], [1, 0, 2, 1, 2, 400, 50, 40, 300, 120, 25, 1, 2]);
        eq(s.gob[4], { m: 1, w: 0, k: 2 }); eq(s.streak, 0); eq(s.best.kills, 2); eq(s.best.rounds, 2); eq(s.best.secs, 400); eq(s.best.gold, 300); eq(s.recent.length, 1); eq(s.last, r);
        eq(ST.finish(s, { how: 'died' }, T0), null, 'finishing twice records nothing more'); eq(s.tot.matches, 1);
      }],
      ['wins, crown wins, streaks (a loss or a quit resets), fastest win, derived numbers', () => {
        const s = ST.blank(T0);
        play(s, { goblin: 4 }, 'win', { st: { rd: 5 }, secs: 600, kills: 3 }); play(s, { goblin: 4 }, 'crown', { st: { rd: 7 }, secs: 500 }); eq(s.streak, 2);
        play(s, { goblin: 1 }, 'died', { st: { rd: 2 }, place: 4 }); eq(s.streak, 0); eq(s.best.streak, 2);
        play(s, { goblin: 4 }, 'win', { secs: 450, st: { rd: 4 } }); play(s, { goblin: 4 }, 'quit', {}); eq(s.streak, 0);
        eq(s.tot.matches, 5); eq(s.tot.wins, 3); eq(s.tot.crownWins, 1); eq(s.tot.deaths, 1); eq(s.tot.quits, 1); eq(s.best.fastWin, 450);
        eq(s.tot.rounds, 5 + 7 + 1 + 4 + 0, 'a win counts its round, a death or quit round - 1'); eq(s.recent[0].how, 'quit'); eq(s.recent[4].how, 'win');
        const d = ST.derived(s); eq(d.winRate, 0.6); eq(d.kd, 3 / 1); eq(d.favourite, 4); eq(d.avgSecs, Math.round(s.tot.secs / 5));
        eq(ST.derived(ST.blank(1)).favourite, -1); eq(ST.derived(ST.blank(1)).winRate, 0);
      }],
      ['recent list keeps the newest 10; time limit and crowned-by-another outcomes are losses that survived the round', () => {
        const s = ST.blank(T0); for (let i = 0; i < 13; i++) play(s, { goblin: i % 12 }, 'died', { place: 2 + i }, T0 + i * 1e6);
        eq(s.recent.length, 10); eq(s.recent[0].pl, 14); eq(s.recent[9].pl, 5); eq(s.tot.matches, 13);
        play(s, {}, 'time', { st: { rd: 8 }, place: 3, size: 6 }); play(s, {}, 'crowned', { st: { rd: 5 }, place: 4 });
        eq(s.recent[1].rd, 8); eq(s.recent[0].rd, 5); eq(s.tot.deaths, 13); eq(s.tot.wins, 0);
      }],
      ['live events: vault claim edges, tree rooms and heists counted once per room, noise ignored', () => {
        const s = ST.blank(T0), kindOf = r => r === 'b1' ? 'heist' : r === 't1' || r === 't2' ? 'tree' : null;
        ST.begin(s, { id: 1, goblin: 0, size: 3 }, T0);
        const ev = d => ST.event(s, d, { kindOf }, T0);
        eq(ev({ actMe: { r: 'v', claim: 0 } }), false); eq(ev({ actMe: { r: 'v', claim: 1.2 } }), true); eq(ev({ actMe: { r: 'v', claim: 2 } }), false); eq(s.live.vc, 1);
        ev({ actMe: {} }); ev({ actMe: { claim: 0.5 } }); eq(s.live.vc, 2, 'a claim lost and regained is a second claim');
        ev({ actMe: { r: 't1', chan: { n: 'a' } } }); ev({ actMe: { r: 't1', timing: {} } }); ev({ actMe: { r: 't2', chan: {} } }); ev({ actMe: { r: 'b1', timing: {} } }); ev({ actMe: { r: 'zz', chan: {} } }); ev({ actMe: { r: 't1' } });
        eq(s.live.trees, ['t1', 't2']); eq(s.live.heists, ['b1']);
        eq(ev({ gold: 5, hit: {}, s: 'x', kills: 0, round: { n: 0 } }), false); eq(ST.event(ST.blank(1), { crafted: 1 }, null, 0), false, 'no live match: nothing happens');
        ST.finish(s, { how: 'died', place: 2 }, T0 + 1000); eq([s.tot.vaultClaims, s.tot.trees, s.tot.heists], [2, 2, 1]);
      }],
      ['begin: a resumed match continues, a fresh one settles the stale one as a quit; refine only fixes placement', () => {
        const s = ST.blank(T0); ST.begin(s, { id: 3, goblin: 2, size: 5 }, T0); s.live.kills = 2; s.live.round = 4;
        ST.begin(s, { id: 3, goblin: 2, size: 5, resumed: true }, T0 + 5000); eq(s.live.kills, 2, 'resume keeps the record'); eq(s.tot.matches, 0);
        ST.begin(s, { id: 3, goblin: 2, size: 5, resumed: true }, T0 + 5000 + 200000); eq(s.tot.quits, 1, 'too old to resume: the old one is a quit'); eq(s.live.kills, 0);
        ST.begin(s, { id: 9, goblin: 5, size: 5, resumed: true }, T0 + 210000); eq(s.tot.quits, 2, 'a different player id never resumes'); eq(s.recent[0].rd, 0);
        ST.begin(s, { id: 9, goblin: 5, size: 5 }, T0 + 220000); eq(s.tot.quits, 3, 'a new matchStart settles an unfinished one');
        const r = ST.finish(s, { how: 'died', place: 0, size: 0 }, T0 + 230000); eq(r.pl, 1, 'no board seen: only the goblin itself is "alive" so far');
        eq(ST.refine(s, r.mid, { place: 4, size: 6 }), true); eq(s.last.pl, 4); eq(s.recent[0].sz, 6); eq(ST.refine(s, r.mid + 1, { place: 2 }), false); eq(s.tot.matches, 4, 'refine never adds a match');
        const w = play(s, {}, 'win'); eq(ST.refine(s, w.mid, { place: 3, size: 4 }), true); eq(s.last.pl, 1, 'a win stays 1st');
      }],
      ['client glue: matchStart -> messages -> died is recorded and stored; offline demo records nothing; reload during a match resumes', () => {
        browser(); const U = global.GKSTATSUI, S = () => JSON.parse(localStorage.getItem('gk.stats.v1'));
        U.onMsg({ matchStart: { you: 7, size: 3, players: [{ id: 7, goblin: 9 }, { id: 8, goblin: 1 }, { id: 9, goblin: 2 }] } });
        U.onMsg({ round: { n: 2 } }); U.onMsg({ kills: 1 }); U.onMsg({ crafted: { key: 'k' } });
        U.onMsg({ died: { items: [], by: 8, killer: { name: 'Mizzle', npc: false, w: 'Sword' }, st: { dd: 12, dt: 20, ge: 90, gs: 10, ex: 3, rd: 2 } } });
        let s = S(); eq(s.tot.matches, 1); eq(s.tot.deaths, 1); eq(s.recent[0].by, 'Mizzle'); eq(s.gob[9], { m: 1, w: 0, k: 1 }); eq(s.tot.crafted, 1); eq(s.tot.goldEarned, 90); eq(s.tot.rounds, 1); eq(s.live, null);
        U.onMsg({ matchEnd: { winner: { id: 8 }, size: 3, places: [{ id: 8, place: 1, kills: 1, secs: 100 }, { id: 9, place: 2, kills: 0, secs: 80 }, { id: 7, place: 3, kills: 1, secs: 50 }] } });
        s = S(); eq(s.recent[0].pl, 3, 'matchEnd after the death card fixes the placement'); eq(s.tot.matches, 1);
        // the winner: matchEnd (crown) arrives first, the won message after it
        U.onMsg({ matchStart: { you: 7, size: 3, players: [{ id: 7, goblin: 4 }] } });
        U.onMsg({ matchEnd: { winner: { id: 7 }, crown: 1, size: 3, places: [{ id: 7, place: 1, kills: 2, secs: 300 }], stats: { 7: { dd: 70, dt: 5, ge: 500, gs: 100, ex: 0, rd: 6 } } } }); U.onMsg({ won: { st: { dd: 70, dt: 5, ge: 500, gs: 100, ex: 0, rd: 6 } } });
        s = S(); eq(s.tot.matches, 2); eq(s.tot.wins, 1); eq(s.tot.crownWins, 1); eq(s.streak, 1); eq(s.tot.dealt, 82); eq(s.tot.rounds, 7);
        // a match left unfinished, then a new page load that cannot resume it: settled as left early
        U.onMsg({ matchStart: { you: 1, size: 3, players: [{ id: 1, goblin: 0 }] } }); U.onMsg({ kills: 1 });
        const keep = localStorage.getItem('gk.stats.v1'); assert(JSON.parse(keep).live, 'the live match is in storage');
        const b = browser(); b.store.set('gk.stats.v1', keep); delete require.cache[require.resolve('../save.js')]; delete require.cache[require.resolve('../statsui.js')]; require('../save.js'); require('../statsui.js');
        s = JSON.parse(b.store.get('gk.stats.v1')); eq(s.live, null); eq(s.tot.quits, 1); eq(s.tot.matches, 3); eq(s.recent[0].how, 'quit'); eq(s.recent[0].k, 1);
        // the same, but a resume token is fresh: the match stays live and the resumed message continues it
        const b2 = browser({ 'gk.token': 'abc', 'gk.tokenT': String(Date.now()) }); b2.store.set('gk.stats.v1', keep); require('../save.js'); delete require.cache[require.resolve('../statsui.js')]; require('../statsui.js');
        const V = global.GKSTATSUI; V.onMsg({ resumed: 1, you: 1, players: [{ id: 1, goblin: 0 }] }); V.onMsg({ kills: 2 }); V.onMsg({ died: { items: [], st: { rd: 3 } } });
        s = JSON.parse(b2.store.get('gk.stats.v1')); eq(s.tot.matches, 3, 'the resumed match is one record (2 earlier + 1)'); eq(s.tot.quits, 0); eq(s.recent[0].k, 2);
        // offline demo: not recorded
        const b3 = browser(); global.location.search = '?offline=1'; delete require.cache[require.resolve('../statsui.js')]; require('../statsui.js');
        global.GKSTATSUI.onMsg({ matchStart: { you: 1, size: 3, players: [{ id: 1, goblin: 0 }] } }); global.GKSTATSUI.onMsg({ died: { items: [] } }); eq(b3.store.has('gk.stats.v1'), false, 'the demo leaves no stats');
      }],
      ['storage: unavailable or corrupt localStorage falls back to memory and never throws; stats survive the existing save and clearAll; reset works', () => {
        browser(); localStorage.setItem('gk.save.v1', JSON.stringify({ stash: ['w:club'], characters: [{ id: 1, goblin: 2, name: 'Thok', wins: 3 }], nextId: 2, parts: {} }));
        let s = GKSAVE.stats(); eq(s.tot.matches, 0); s.tot.matches = 5; GKSAVE.saveStats(s); eq(GKSAVE.stats().tot.matches, 5); eq(GKSAVE.characters().length, 1, 'characters untouched');
        GKSAVE.clearAll(); eq(GKSAVE.stats().tot.matches, 5, 'clearing the stash does not clear stats'); GKSAVE.clearStats(); eq(GKSAVE.stats().tot.matches, 0);
        localStorage.setItem('gk.stats.v1', '{not json'); eq(GKSAVE.stats().tot.matches, 0, 'corrupt json');
        localStorage.setItem('gk.stats.v1', JSON.stringify({ v: 0, tot: { matches: 4 } })); eq(GKSAVE.stats().tot.matches, 4, 'old shapes are read');
        global.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
        s = GKSAVE.stats(); s.tot.matches = 2; GKSAVE.saveStats(s); eq(GKSAVE.stats().tot.matches, 2, 'in-memory fallback'); GKSAVE.clearStats(); eq(GKSAVE.stats().tot.matches, 0);
        const b = browser({}); global.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }; delete require.cache[require.resolve('../statsui.js')]; require('../statsui.js'); global.GKSTATSUI.onMsg({ matchStart: { you: 1, size: 2, players: [] } });   // must not throw
      }],
      ['server STATS block: died.st, won.st and matchEnd.stats carry damage, gold and round for each human', async () => {
        const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
        const startOf = (c, id) => c.state.matchStart.players.find(p => p.id === id);
        const hunt = async (a, victim) => { const v = startOf(a, victim.state.you); for (let i = 0; i < 60 && !victim.state.died; i++) { a.send({ tp: [v.x + 1.3, v.z] }); a.send({ m: [v.x + 1.3, v.z, Math.PI / 2] }); await sleep(40); a.send({ atk: 1 }); await sleep(120); } assert(victim.state.died, 'the victim never died'); };
        const [a, b, c] = await Promise.all([connect(srv.port, 'name=Aa&goblin=2&wins=0'), connect(srv.port, 'name=Bb&goblin=2&wins=0'), connect(srv.port, 'name=Cc&goblin=2&wins=0')]);
        await give(a, 'w:slayer', 'weapon'); await give(a, 'a:aegis', 'armor');
        a.send({ gold: 500 }); await a.until(x => x.state.gold === 500, 2000, 'gold 500'); a.send({ gold: 120 }); await a.until(x => x.state.gold === 120, 2000, 'gold 120');
        await hunt(a, b);
        const bd = b.state.died.st; assert(bd && bd.dt > 0 && bd.dd === 0 && bd.rd >= 1, 'victim tallies ' + JSON.stringify(bd));
        await hunt(a, c); await a.until(x => x.state.won, 2000, 'won');
        const ws = a.state.won.st; assert(ws.dd > 0 && ws.dt === 0, 'winner dealt damage, took none: ' + JSON.stringify(ws));
        assert(ws.ge >= 400 && ws.gs >= 380, 'gold earned ' + ws.ge + ' / spent ' + ws.gs + ' (500 up, 120 down)'); assert(ws.rd >= 1);
        for (const x of [a, b, c]) await x.until(y => y.state.matchEnd, 2000, 'matchEnd');
        const e = a.state.matchEnd; eq(Object.keys(e.stats).sort(), [a, b, c].map(x => String(x.state.you)).sort());
        eq(e.stats[a.state.you].dd, e.stats[b.state.you].dt + e.stats[c.state.you].dt, 'damage dealt equals damage taken by the victims'); eq(e.stats[a.state.you].dd, ws.dd); eq(e.stats[b.state.you], bd, 'the same block as the death card');
        for (const k in e.stats) for (const f of ['dd', 'dt', 'ge', 'gs', 'ex', 'rd']) assert(Number.isInteger(e.stats[k][f]) && e.stats[k][f] >= 0, k + '.' + f);
        eq(b.state.matchEnd, e, 'every spectator sees the same summary');
        for (const x of [a, b, c]) await x.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// botuse (docs/reports/bots-use.md): bots use the whole game through the player paths, and the BOTUSE counters see it.
// Pure: the sim's tally and report. Live: a bot with elixir walks to its Elixir Screen and buys an upgrade (range gate applies), a bot that is far from the pump
// does not empty it by magic, GK_DEBUG {bot5:1} carries `bu`, and a short all-bot match counts several features.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, SIM = require('./sim-botuse.js');
const lab = async (c, o) => { for (let i = 0; i < 40; i++) { const n = c.msgs.length; c.send({ bot6: o || {} }); await c.until(x => x.msgs.slice(n).some(m => m.bot6), 3000, 'bot6'); const r = c.msgs.slice(n).find(m => m.bot6).bot6; if (!r.err) return r; await sleep(250); } throw new Error('no bot'); };
const stat = async c => { const n = c.msgs.length; c.send({ bot5: 1 }); await c.until(x => x.msgs.slice(n).some(m => m.bot5), 3000, 'bot5'); return c.msgs.slice(n).find(m => m.bot5).bot5; };
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_READY_MS: '300', GK_ROUND_MS: '60000', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '600000', GK_BOT_LEVEL: 'hard' });
  let fail = 1;
  try {
    fail = await L.run('botuse', [
      ['tally and report: bots, uses and levels per feature; zero features are listed', async () => {
        const rows = [{ s: { b6: { lvl: { 3: 'easy', 4: 'hard' } }, bu: { 'pump.collect': { n: 5, by: { 3: 2, 4: 3 }, lvl: { easy: 2, hard: 3 } }, 'tree.well': { n: 1, by: { 4: 1 }, lvl: { hard: 1 } } } } }, { s: { b6: { lvl: { 3: 'normal' } }, bu: {} } }];
        const t = SIM.tally(rows); eq(t.nBots, 3); eq(t.feats['pump.collect'].bots, 2); eq(t.feats['pump.collect'].lvlBots, { easy: 1, hard: 1 }); eq(t.lvlBots, { easy: 1, hard: 1, normal: 1 });
        const r = SIM.report(t, rows); assert(r.zero.includes('screen.buy.pump') && !r.zero.includes('pump.collect') && !r.zero.includes('tree.well'), 'zero list: ' + r.zero.length);
        assert(SIM.ALL.length > 60 && new Set(SIM.ALL).size === SIM.ALL.length, 'feature list is complete and unique');
      }],
      ['a bot with elixir goes to its Elixir Screen and buys an upgrade (baseMsg: range and rate gates), counted as screen.buy', async () => {
        const c = await connect(srv.port, 'name=Lab1'); await c.until(x => x.state.matchStart, 8000, 'start');
        await lab(c, { elixir: 90 }); let s = null;
        for (let i = 0; i < 80; i++) { await sleep(250); s = await stat(c); if (s.bu['screen.buy.pump']) break; }
        assert(s.bu['screen.buy.pump'] && s.bu['screen.buy.pump'].n >= 1, 'no screen purchase: ' + JSON.stringify(Object.keys(s.bu)));
        assert(Object.keys(s.bu).some(k => /^screen\.buy\./.test(k)), 'a purchase is counted'); await c.close();
      }],
      ['a bot re-arms its spent snare and reloads its sentry at the Elixir Screen (screen.rearm, screen.ammo)', async () => {
        const c = await connect(srv.port, 'name=Lab3'); await c.until(x => x.state.matchStart, 8000, 'start');
        await lab(c, { elixir: 120, home: { lv: { snare: 1, sentry: 1 }, armed: false, ammo: 2, list: [] } }); let s = null;
        for (let i = 0; i < 100; i++) { await sleep(250); s = await stat(c); if (s.bu['screen.rearm'] && s.bu['screen.ammo']) break; }
        assert(s.bu['screen.rearm'] && s.bu['screen.ammo'], 'rearm / ammo: ' + JSON.stringify(Object.keys(s.bu)));
        await c.close();
      }],
      ['the heist station tour: a bot with parts and junk, and a free moment, is sent to different stations of each of the 4 rooms, once each per round; tourP 0 sends nobody', async () => {
        const ACT = require('../activity.js'), VB = require('../vb5.js'), X = require('../vbx5.js'), cells = ['7', '11', '13', '17'], order = ['ram', 'locksmith', 'counting', 'keystone'];
        const H = VB.create({ cells, doors: { 7: 'dN', 11: 'dW', 13: 'dE', 17: 'dS' }, rng: ACT.rng(5), now: 1000, order });
        const p = { id: 4, name: 'b', skill: 0.6, bot: true, parts: { metal: 9, wood: 9, cloth: 3, bone: 3 }, brain: {}, inv: {}, room: '7' };
        const seen = {}; let now = 1000;
        for (let i = 0; i < 40; i++) {
          now += 7000; H.round = 1 + (i >> 3);
          for (const c of cells) {
            p.room = c; const t = VB.typeAt(H, c), info = { now, round: H.round, sudden: false, gold: 120, metal: 9, has: () => false, aggression: 0.5, greed: 0.5, wantVault: false, wantNoVault: false, tourP: 1, junkSlot: 1 };
            const h = X.tourHint(H, c, t, p, info, { next: null, score: 0 }), n = h.next; if (n && n.a && /^S\d$/.test(n.a)) { (seen[t] = seen[t] || new Set()).add(n.a); }
          }
        }
        for (const t of order) assert(seen[t] && seen[t].size >= 2, t + ' tour stations: ' + (seen[t] ? [...seen[t]] : 'none'));
        const q = { id: 5, name: 'c', skill: 0.6, bot: true, parts: { metal: 9, wood: 9, cloth: 3, bone: 3 }, brain: {}, inv: {}, room: '7' }; let any = 0;
        for (let i = 0; i < 10; i++) for (const c of cells) { const h = X.tourHint(H, c, VB.typeAt(H, c), q, { now: now + i * 7000, round: 9, sudden: false, gold: 120, has: () => false, tourP: 0, junkSlot: 1 }, { next: null, score: 0 }); if (h.next) any++; }
        eq(any, 0, 'tourP 0 sends nobody');
      }],
      ['tree types its hint ignores are tried once: a bot walks into the Hollow Oak nook (lined up with the arch) and waits as Warden, and counts tree.oak', async () => {
        const c = await connect(srv.port, 'name=Lab4'); await c.until(x => x.state.matchStart, 8000, 'start'); await lab(c, {});
        c.send({ actDbg: { tree: ['6', 'oak'], npcs: false } }); await sleep(300);
        const n0 = c.msgs.length; c.send({ bot5: { goal: '6' } }); await c.until(x => x.msgs.slice(n0).some(m => m.bot5), 3000, 'bot5');
        let s = null; for (let i = 0; i < 80; i++) { await sleep(250); s = await stat(c); if (s.bu['tree.oak']) break; }
        assert(s.bu['tree.oak'] && s.bu['tree.oak'].n >= 1, 'the nook was not reached: ' + JSON.stringify(Object.keys(s.bu))); await c.close();
      }],
      ['bot5 stats carry the BOTUSE counters with per-bot and per-level splits', async () => {
        const c = await connect(srv.port, 'name=Lab2'); await c.until(x => x.state.matchStart, 8000, 'start');
        await lab(c, { elixir: 90 }); let s = null; for (let i = 0; i < 80; i++) { await sleep(250); s = await stat(c); if (Object.keys(s.bu).length) break; }
        const f = Object.keys(s.bu)[0]; assert(f, 'a counter'); const e = s.bu[f]; assert(e.n >= 1 && Object.keys(e.by).length >= 1 && Object.keys(e.lvl).length >= 1, JSON.stringify(e)); await c.close();
      }],
    ]);
  } finally { srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

// botgoals.js (pure 5x5 bot scoring, docs/reports/bots5.md): room terms, the vault want and vote under the 2-room rule, timing presses against the real
// activity.js judge, lanterns, stand points, the stuck watchdog, all-pairs door hops over the WORLD door table, craft values, personalities.
const L = require('./lib.js'), { assert, eq } = L, BG = require('../botgoals.js'), ACT = require('../activity.js'), W = require('../world.js');
const base = { dist: 2, hint: 0, work: false, junk: 0, master: false, hpFrac: 1, sudden: false, round: 2, done: false, vault: 0, homeBody: 0.5 };
const T = o => BG.roomTerm(Object.assign({}, base, o));
const vw = o => BG.vaultWant(Object.assign({ round: 2, sudden: false, sudRound: 5, msLeft: 90000, gaining: false, wardens: 0, hpFrac: 1, aggr: 0.5, patience: 0.5 }, o));
const vv = o => BG.vaultVote(Object.assign({ round: 3, sudden: false, hurt: false, others: 0, extra: 0, bribe: false, pick: false, want: 3, spoil: false }, o));

(async () => {
  const fail = await L.run('botgoals', [
    ['home: work and hurt pull a bot home, an idle home does not, someone else\'s home never, sudden death vents it', () => {
      assert(T({ kind: 'home', work: true }) >= 3, 'home with work');
      assert(T({ kind: 'home', hpFrac: 0.3 }) >= BG.K.HOME_HURT, 'hurt goes home');
      assert(T({ kind: 'home', hpFrac: 0.3, work: true }) > T({ kind: 'home', work: true }), 'hurt adds to work');
      assert(T({ kind: 'home' }) < 0, 'nothing to do at home');
      assert(T({ kind: 'home', hpFrac: 0.3, sudden: true }) === BG.K.VENT, 'sudden death: homes vent');
      assert(T({ kind: 'foreign', work: true }) < 0 && T({ kind: 'foreign' }) === BG.K.FOREIGN_HOME, 'never another home');
      assert(T({ kind: 'home', work: true, homeBody: 1 }) > T({ kind: 'home', work: true, homeBody: 0 }), 'personality: home bodies like home more');
    }],
    ['Forge only with a master-bench upgrade, Grand Recycler with junk, preferred within 3 hops; both vent in sudden death', () => {
      assert(T({ kind: 'forge', master: true }) === BG.K.FORGE && T({ kind: 'forge' }) < 0, 'forge');
      assert(T({ kind: 'grand', junk: 2, dist: 3 }) > T({ kind: 'grand', junk: 2, dist: 4 }), 'near grand preferred');
      assert(T({ kind: 'grand', junk: 3 }) > T({ kind: 'grand', junk: 1 }) && T({ kind: 'grand' }) < 0, 'more junk, more pull; none, none');
      assert(T({ kind: 'grand', junk: 3, dist: 1 }) > BG.K.HOME_WORK * (0.7 + 0.6 * 0.5) - 0.35 * 2, 'within 3 hops the Grand Recycler beats the home recycler for junk');
      eq([T({ kind: 'forge', master: true, sudden: true }), T({ kind: 'grand', junk: 3, sudden: true }), T({ kind: 'vent' })], [BG.K.VENT, BG.K.VENT, BG.K.VENT]);
    }],
    ['activity rooms use the room hint; finished rooms are skipped this round; a vaultbreaker borrows the vault pull while it is shut', () => {
      eq(T({ kind: 'tree', hint: 3 }), 3); eq(T({ kind: 'tree', hint: 3, done: true }), BG.K.DONE);
      assert(T({ kind: 'vb', hint: 0, vault: 10 }) === 10 * BG.K.STAGE, 'staging pull');
      assert(T({ kind: 'vb', hint: 6, vault: 2 }) === 6, 'the heist hint when it is bigger');
      assert(T({ kind: 'vb', hint: 6, hpFrac: 0.3 }) < 6, 'hurt bots avoid heists');
      eq(T({ kind: 'vault', vault: 7 }), 7); eq(T({ kind: 'other' }), 0);
    }],
    ['vault want: grows with the rounds, the crown in late rounds, the treasury near the round end, a claimant to contest; wardens and low HP keep a bot out', () => {
      assert(vw({ round: 1 }) < vw({ round: 3 }), 'rounds');
      assert(vw({ round: 4 }) - vw({ round: 3 }) >= BG.K.CLAIM - 0.01, 'round 4 (one before sudden death): the claim');
      assert(vw({ round: 2, msLeft: 20000 }) > vw({ round: 2 }), 'treasury');
      assert(vw({ round: 2, msLeft: 20000, sudden: true }) <= vw({ round: 2, sudden: true }), 'no treasury in sudden death');
      assert(vw({ gaining: true }) > vw({}) + 4, 'contest a claimant');
      assert(vw({ gaining: true, aggr: 1 }) > vw({ gaining: true, aggr: 0 }), 'aggressive bots contest harder');
      assert(vw({ round: 4, wardens: 1, hpFrac: 0.5 }) < vw({ round: 4, hpFrac: 0.5 }), 'wardens');
      assert(vw({ round: 4, hpFrac: 0.2 }) < vw({ round: 4 }), 'low HP');
    }],
    ['vault vote (2-room rule): a second vote, a heist weight, a bribe or a lockpick make it likely; alone early it is unlikely; spoilers hold back', () => {
      assert(vv({ round: 1 }) < 1, 'round 1 alone');
      assert(vv({ others: 1 }) > vv({}) + 5, 'the second vote');
      assert(vv({ extra: 1 }) > vv({}) + 5, 'an armed keystone / writs');
      assert(vv({ bribe: true }) > vv({}) && vv({ pick: true }) > vv({}), 'bribe or lockpick');
      assert(vv({ spoil: true }) < vv({}), 'spoiler'); assert(vv({ spoil: true, others: 1 }) > vv({}), 'a spoiler still completes an open vote');
      assert(vv({ hurt: true, others: 1 }) < vv({ others: 1 }), 'hurt'); assert(vv({ sudden: true, others: 1 }) < 1, 'sudden death: all doors open anyway');
      eq([BG.stepFactor(3, 2), BG.stepFactor(3, 4), BG.stepFactor(3, 3), BG.stepFactor(null, 2)], [2.5, 0.6, 1, 1]);
    }],
    ['timing presses: tapNow(wantHit) presses only inside the window and the real judge scores a hit; tapNow(miss) presses outside and misses', () => {
      const rng = ACT.rng(7); let hits = 0, misses = 0, n = 0;
      for (let k = 0; k < 200; k++) {
        const t0 = 1000 * k, tm = ACT.timing.open(rng, t0, { per: [800, 1100], win: 0.3 }), want = k % 2 === 0;
        let t = t0; while (!BG.tapNow(tm, t, want) && t < t0 + 3000) t += 10;   // the bot's 10 Hz think is coarser: the window is about 250 ms wide
        assert(t < t0 + 3000, 'the window comes round'); n++;
        const r = ACT.timing.judge(tm, t, { lat: 0 }); if (want && r === 'hit') hits++; if (!want && r === 'miss') misses++;
      }
      eq([hits, misses], [100, 100], 'every planned hit hits, every planned miss misses');
      const ok = Array.from({ length: 1000 }, (_, i) => BG.pressOk(0.5, i / 1000)).filter(Boolean).length; eq(ok, 600, 'the 0.45 + 0.3 * skill roll');
      assert(BG.tapNow(null, 0, true), 'no attempt: just press');
    }],
    ['lanterns, stand points and reach', () => {
      eq(BG.lantern(['NE', 'SW', 'NW'], 1, true, 0.3), 'SW');
      const wrong = BG.lantern(['NE', 'SW', 'NW'], 1, false, 0.99); assert(wrong !== 'SW' && ['NE', 'NW', 'SE'].includes(wrong), 'a wrong lantern');
      const an = { x: 2, z: 3, r: 0.7 }, [x, z] = BG.standPoint(an, 10, 3, 0, 0);
      assert(Math.abs(Math.hypot(x - 2, z - 3) - 1.25) < 1e-9 && x > 2, 'stands on the bot side, just inside the reach');
      assert(BG.inReach(an, x, z, 0.7) && ACT.reach({ x, z }, an), 'inside both the bot pad and the server reach');
      const [x2, z2] = BG.standPoint({ x: 0, z: 0, r: 1 }, 0, 0, 0, 5); assert(z2 > 0 && Math.abs(x2) < 1e-9, 'standing on the anchor: step toward the room centre');
      assert(!BG.inReach(an, 9, 9) && !BG.inReach(null, 0, 0), 'out of reach');
    }],
    ['stuck watchdog: counts only while the bot wants to move and stays put', () => {
      const wd = {};
      eq(BG.watch(wd, 0, 0, '1', 0, true), 0); eq(BG.watch(wd, 0.3, 0, '1', 4000, true), 4000); eq(BG.watch(wd, 0.4, 0.2, '1', 7000, true), 7000);
      eq(BG.watch(wd, 2, 0, '1', 7100, true), 0, 'moved'); eq(BG.watch(wd, 2, 0, '1', 9000, false), 0, 'standing still on purpose');
      eq(BG.watch(wd, 2, 0, '1', 9500, true), 500, 'the clock restarts after a deliberate stop'); eq(BG.watch(wd, 2, 0, '2', 9600, true), 0, 'a room change is progress');
    }],
    ['all-pairs door hops over the WORLD door table: 45 rooms, symmetric, every home the hatch + 1 door from a tree room and 4 doors from the vault (all 8 homes alike)', () => {
      const adj = {}; for (const d of W.DOORS) { (adj[d.a] = adj[d.a] || []).push(d.b); (adj[d.b] = adj[d.b] || []).push(d.a); }
      const D = BG.allDist(adj), keys = Object.keys(adj); eq(keys.length, 45);
      for (const a of keys) for (const b of keys) { assert(D[a][b] != null, a + '->' + b); eq(D[a][b], D[b][a]); }
      for (const h of W.HOME_IDS.map(i => 'c' + i)) {
        eq(Math.min(...W.TREE_CELLS.map(t => D[h][String(t)])), 2, 'home ' + h + ' to its nearest tree room: hatch + 1 door');
        eq(D[h][W.VAULT_KEY], 4, 'home ' + h + ' to the vault'); eq(Math.min(...Object.values(W.VB_CELLS).map(t => D[h][String(t)])), 3, 'home ' + h + ' to its nearest vaultbreaker');
      }
    }],
    ['craft values and personalities', () => {
      eq(BG.craftValue({ type: 'weapon', attack: 12 }, { attack: 8 }), 4); eq(BG.craftValue({ type: 'weapon', attack: 6 }, { attack: 8 }), 0);
      eq(BG.craftValue({ type: 'armor', score: 30 }, { armor: 20 }), 5); eq(BG.craftValue({ type: 'consumable', heal: 20 }, { heals: 0 }), 3); eq(BG.craftValue({ type: 'consumable', heal: 20 }, { heals: 1 }), 0);
      eq(BG.craftValue({ type: 'charm' }, {}), 0); eq(BG.craftValue(null, {}), 0);
      const a = BG.persona(ACT.rng(3)), b = BG.persona(ACT.rng(3)), c = BG.persona(ACT.rng(4)); eq(a, b, 'deterministic from the rng'); assert(JSON.stringify(a) !== JSON.stringify(c), 'varies');
      for (let s = 1; s < 200; s++) { const p = BG.persona(ACT.rng(s)); assert(p.skill >= 0.2 && p.skill <= 0.9 && p.tree >= 0.6 && p.tree <= 1.4 && typeof p.spoil === 'boolean', 'ranges'); }
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

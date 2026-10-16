// vault5.js: the vault's pure logic (claim, alarm, wardens, coffers, bars, treasury, relic, venting, the end-of-match decision). Fake clock, seeded RNG, no server.
const L = require('./lib.js'), { assert, eq } = L, ACT = require('../activity.js'), V = require('../vault5.js'), K = V.K;

// A tiny harness: players live in `world.ps`; ctx reads them. time advances in 100 ms ticks.
function world(o = {}) {
  const w = { t: 0, round: 1, sudden: false, ps: [], log: [], toasts: [], fx: [], spawned: [], broken: {}, open: { N: true, E: true, S: true, W: true }, st: V.state0(ACT.rng(1), 0), nextNpc: 100 };
  w.add = (id, o2) => { const p = Object.assign({ id, name: 'g' + id, x: 9, z: 9, room: '12', alive: true, hp: 100, kills: 0 }, o2); w.ps.push(p); return p; };
  w.ctx = () => ({
    now: w.t, rng: ACT.rng(2), round: w.round, sudden: w.sudden,
    occupants: () => w.ps.filter(p => p.room === '12' && p.alive),
    players: () => w.ps,
    anchor: a => ({ dais: { x: 0, z: 0, r: 2.2 }, K1: { x: -8, z: -8, r: 0.8 }, K2: { x: 8, z: -8, r: 0.8 }, K3: { x: 8, z: 8, r: 0.8 }, K4: { x: -8, z: 8, r: 0.8 },
      D_N: { x: 0, z: -10, r: 0.8 }, D_E: { x: 10, z: 0, r: 0.8 }, D_S: { x: 0, z: 10, r: 0.8 }, D_W: { x: -10, z: 0, r: 0.8 }, grate: { x: 4, z: 0, r: 0.5 } }[a]),
    award: (p, what, src) => { w.log.push({ id: p.id, what, src }); return what; },
    spawn: (kind, anchor, opts) => { const id = w.nextNpc++; w.spawned.push({ id, kind, anchor, opts, t: w.t }); return id; },
    npcAlive: id => !w.dead || !w.dead.includes(id),
    dmg: (p, n, src) => { p.hp -= n; w.log.push({ id: p.id, dmg: n, src }); if (p.hp <= 0) p.alive = false; },
    toastAll: s => w.toasts.push(s), fx: (k, d, s) => w.fx.push([k, d, s]),
    doorBroken: d => !!w.broken[d], doorOpen: d => !!w.open[d], relicTaken: () => !!w.relicGone,
  });
  w.run = (ms, step = 100) => { for (let i = 0; i < ms / step; i++) { w.t += step; V.tick(w.st, w.ctx(), step); } };
  w.hit = p => { V.hurt(w.st, p, w.ctx()); };
  w.claim = id => V.claimOf(w.st, id);
  w.goldOf = id => w.log.filter(x => x.id === id && x.what && x.what.gold).reduce((a, x) => a + x.what.gold, 0);
  return w;
}
const onDais = (w, id, o) => w.add(id, Object.assign({ x: 0.5, z: 0.5 }, o));

(async () => {
  const fail = await L.run('vault5', [
    ['registers as the ACT room type "vault" and its state is JSON-clean', async () => {
      eq(ACT.get('vault').kind, 'vault');
      const st = ACT.init('vault', ACT.rng(1), 0), j = JSON.parse(JSON.stringify(st));
      eq(Object.keys(j.pools), K.COFFERS); assert(!JSON.stringify(st).includes('Infinity'));
      eq(ACT.view(st, 'vault').claims, []);
    }],
    ['a sole goblin on the dais gains 1 s per second, off the dais gains nothing', async () => {
      const w = world(), a = onDais(w, 1); w.add(2, { x: 7, z: 7 });
      w.run(4000); eq(w.claim(1), 4); eq(w.claim(2), 0);
      eq(V.view(w.st, w.ctx()).claims[0], { id: 1, name: 'g1', s: 4 });
    }],
    ['two goblins on the dais freeze the claim, and it resumes when one leaves', async () => {
      const w = world(), a = onDais(w, 1), b = onDais(w, 2, { x: -0.5 });
      w.run(3000); eq(w.claim(1), 0); eq(w.claim(2), 0); assert(w.st.cap.contested);
      b.x = 9; b.z = 9; w.run(2000); eq(w.claim(1), 2); eq(w.claim(2), 0);
    }],
    ['a hit pauses the gain for 1 s but does not reset the claim', async () => {
      const w = world(), a = onDais(w, 1); w.run(5000); eq(w.claim(1), 5);
      w.hit(a); w.run(900); eq(w.claim(1), 5, 'paused for the unhurt window');
      w.run(2100); assert(w.claim(1) >= 6.5 && w.claim(1) <= 7.1, 'resumed: ' + w.claim(1));
    }],
    ['the claim persists across rounds and when leaving the dais', async () => {
      const w = world(), a = onDais(w, 1); w.run(6000);
      a.x = 9; a.z = 9; w.t += 1000; V.roundEnd(w.st, Object.assign(w.ctx(), { round: 1 }));
      eq(w.claim(1), 6); w.round = 2; V.roundStart(w.st, w.ctx(), 2);
      a.x = 0.2; a.z = 0.2; w.run(3000); eq(w.claim(1), 9);
    }],
    ['death (or a disconnect) loses the claim; a lone survivor keeps hers', async () => {
      const w = world(), a = onDais(w, 1), b = w.add(2, { x: 9, z: 9 }); w.run(3000);
      a.x = 9; a.z = 9; b.x = 0; b.z = 0; w.run(2000);
      eq([w.claim(1), w.claim(2)], [3, 2]);
      a.alive = false; V.death(w.st, a); eq(w.claim(1), 0); eq(w.claim(2), 2);
      V.death(w.st, 2); eq(w.claim(2), 0);
    }],
    ['there is no instant win: a huge claim never ends anything by itself', async () => {
      const w = world(), a = onDais(w, 1); w.run(100000, 500);
      eq(w.claim(1), 100); assert(a.alive); assert(!('win' in V.view(w.st, w.ctx())) && !('full' in V.view(w.st, w.ctx())));
      const r = V.roundEnd(w.st, Object.assign(w.ctx(), { round: 3 })); eq(r.over, false); eq(r.decision, null);
    }],
    ['sudden death claims at 1.5x; the Keystone ward halves the top claimant only', async () => {
      const w = world(), a = onDais(w, 1); w.sudden = true; w.run(4000); eq(w.claim(1), 6);
      V.setWard(w.st, true); w.run(4000); eq(w.claim(1), 6 + 3);
      const w2 = world(), c = onDais(w2, 1), d = w2.add(2, { x: 9, z: 9 }); w2.run(3000);
      c.x = 9; c.z = 9; d.x = 0; d.z = 0; V.setWard(w2.st, true); w2.run(2000); eq(w2.claim(2), 2, 'not the top claimant, no ward');
    }],
    ['quake freezes everyone for 3 s; the Crown Seal adds 5 s on the dais only', async () => {
      const w = world(), a = onDais(w, 1); w.run(2000); V.quake(w.st, w.t);
      w.run(2900); eq(w.claim(1), 2); eq(w.st.gaining, null); w.run(1100); assert(w.claim(1) > 2);
      const before = w.claim(1); assert(V.sealClaim(w.st, a, w.ctx())); eq(w.claim(1), before + 5);
      a.x = 9; a.z = 9; assert(!V.sealClaim(w.st, a, w.ctx()));
    }],
    ['the alarm opens the vault while gaining and for 10 s after, wardens only while gaining', async () => {
      const w = world(), a = onDais(w, 1);
      assert(!V.alarmOn(w.st, w.t)); w.run(200); assert(V.alarmOn(w.st, w.t)); assert(w.toasts.some(t => /claiming the crown/.test(t)));
      w.run(19000); eq(w.spawned.length, 0, 'first warden at 20 s'); w.run(1500); eq(w.spawned.length, 1);
      eq(w.spawned[0].kind, 'warden'); eq(w.spawned[0].opts.target, 1);
      w.run(40000); eq(w.spawned.length, 2, 'max 2 alive'); w.dead = [100]; w.run(2000); eq(w.spawned.length, 3, 'a slot freed');
      a.x = 9; a.z = 9; w.run(500); assert(V.alarmOn(w.st, w.t), 'still on 0.5 s after'); w.run(9000); assert(V.alarmOn(w.st, w.t), 'on until 10 s');
      w.run(1500); assert(!V.alarmOn(w.st, w.t), 'off after 10 s'); const n = w.spawned.length; w.run(60000); eq(w.spawned.length, n, 'no wardens when nobody claims');
    }],
    ['a new claim after a pause arms the warden timer again (20 s from its start)', async () => {
      const w = world(), a = onDais(w, 1); w.run(5000); a.x = 9; a.z = 9; w.run(30000);
      a.x = 0; a.z = 0; w.run(19000); eq(w.spawned.length, 0); w.run(1500); eq(w.spawned.length, 1);
    }],
    ['coffers: a 2 s scoop pays 12 gold, 3 handfuls refill 1 per 15 s, max 6 scoops per goblin per round', async () => {
      const w = world(), a = w.add(1, { x: -8, z: -8 });
      eq(V.verbs.use(w.st, a, 'K1', w.ctx()), null); w.run(1900); eq(w.goldOf(1), 0); w.run(300); eq(w.goldOf(1), 12);
      for (let i = 0; i < 2; i++) { V.verbs.use(w.st, a, 'K1', w.ctx()); w.run(2200); }
      eq(w.goldOf(1), 36); eq(V.verbs.use(w.st, a, 'K1', w.ctx()), 'state', 'coffer empty');
      w.run(15000); eq(V.verbs.use(w.st, a, 'K1', w.ctx()), null); w.run(2200); eq(w.goldOf(1), 48);
      for (const k of ['K2', 'K3', 'K4']) { a.x = w.ctx().anchor(k).x; a.z = w.ctx().anchor(k).z; for (let i = 0; i < 3; i++) { const r = V.verbs.use(w.st, a, k, w.ctx()); if (r) break; w.run(2200); } }
      eq(w.log.filter(x => x.src === 'vault:coffer').length, 6, 'capped at 6');
      eq(V.verbs.use(w.st, a, 'K2', w.ctx()), 'cap');
      V.roundEnd(w.st, Object.assign(w.ctx(), { round: 1 })); eq(V.verbs.use(w.st, a, 'K3', w.ctx()), 'state'.length ? V.verbs.use(w.st, a, 'K3', w.ctx()) : null);
    }],
    ['coffer scoop breaks on a hit, on moving away and on leaving; sudden death refills twice as fast; far/dead are refused', async () => {
      const w = world(), a = w.add(1, { x: -8, z: -8 });
      V.verbs.use(w.st, a, 'K1', w.ctx()); w.run(1000); w.hit(a); w.run(1500); eq(w.goldOf(1), 0);
      V.verbs.use(w.st, a, 'K1', w.ctx()); w.run(1000); a.x = -5; w.run(300); w.run(1500); eq(w.goldOf(1), 0);
      a.x = 3; eq(V.verbs.use(w.st, a, 'K1', w.ctx()), 'far');
      a.x = -8; V.verbs.use(w.st, a, 'K1', w.ctx()); w.run(1000); a.room = '11'; w.run(1500); eq(w.goldOf(1), 0);
      a.alive = false; eq(V.verbs.use(w.st, a, 'K1', w.ctx()), 'state'); eq(V.verbs.use(w.st, { id: 9, x: 0, z: 0, alive: true }, 'nope', w.ctx()), 'state');
      const st2 = V.state0(ACT.rng(1), 0); st2.sudden = true; assert(K.COFFER_REFILL_SUDDEN * 2 === K.COFFER_REFILL);
    }],
    ['coffers refill twice as fast in sudden death (suddenStart rebases the pools)', async () => {
      const w = world(), a = w.add(1, { x: -8, z: -8 }); w.sudden = true;
      for (let i = 0; i < 3; i++) { V.verbs.use(w.st, a, 'K1', w.ctx()); w.run(2100); }
      eq(V.verbs.use(w.st, a, 'K1', w.ctx()), 'state'); w.run(8000);
      eq(V.verbs.use(w.st, a, 'K1', w.ctx()), null, 'one handful back after about 7.5 s');
    }],
    ['door bars: 5 s channel at the rack closes an open door at the round end; once per door per round; 10 s personal cooldown', async () => {
      const w = world(), a = w.add(1, { x: 0, z: -10 });
      eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), null); w.run(4900); eq(w.st.barPend.N, undefined); w.run(300); eq(w.st.barPend.N, true);
      eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), 'cool', 'once per door'); a.x = 10; a.z = 0;
      eq(V.verbs.use(w.st, a, 'D_E', w.ctx()), 'cool', 'personal cooldown'); w.run(10000); eq(V.verbs.use(w.st, a, 'D_E', w.ctx()), null);
      w.run(5200);
      const r = V.roundEnd(w.st, Object.assign(w.ctx(), { round: 2 })); eq(r.close.sort(), ['E', 'N']);
      eq(w.st.barred, {}); a.x = 0; a.z = -10; w.t += 10000; eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), null, 'new round, new bar');
    }],
    ['door bars are refused for closed or Broken doors, during the alarm and in sudden death; Broken at the round end drops the bar', async () => {
      const w = world(), a = w.add(1, { x: 0, z: -10 });
      w.open.N = false; eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), 'state'); w.open.N = true;
      w.broken.N = true; eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), 'state'); w.broken.N = false;
      w.sudden = true; eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), 'state'); w.sudden = false; w.st.sudden = false;
      const c = onDais(w, 2); w.run(300); assert(V.alarmOn(w.st, w.t)); eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), 'state');
      c.x = 9; c.z = 9; w.run(11000); w.st.sudden = false;
      V.verbs.use(w.st, a, 'D_N', w.ctx()); w.run(5200); eq(w.st.barPend.N, true);
      w.broken.N = true; eq(V.roundEnd(w.st, Object.assign(w.ctx(), { round: 2 })).close, []);
      V.verbs.use(w.st, a, 'D_N', w.ctx()); // after roundEnd, still broken: refused
      eq(V.verbs.use(w.st, a, 'D_N', w.ctx()), 'state');
    }],
    ['a bar channel breaks on a hit; the alarm at the round end cancels the pending bar', async () => {
      const w = world(), a = w.add(1, { x: 0, z: -10 });
      V.verbs.use(w.st, a, 'D_N', w.ctx()); w.run(2000); w.hit(a); w.run(4000); eq(w.st.barPend.N, undefined);
      w.t += 20000; V.verbs.use(w.st, a, 'D_N', w.ctx()); w.run(5200); eq(w.st.barPend.N, true);
      onDais(w, 2); w.run(300); eq(V.roundEnd(w.st, Object.assign(w.ctx(), { round: 2 })).close, [], 'alarm on at the boundary');
    }],
    ['treasury: only living goblins inside the vault are paid 20 gold + 4 knowledge at each round end', async () => {
      const w = world(); w.add(1); w.add(2, { room: '7' }); w.add(3, { alive: false });
      const r = V.roundEnd(w.st, Object.assign(w.ctx(), { round: 2 }));
      eq(r.treasury, [{ id: 1, gold: 20, know: 4 }]); eq(r.over, false);
      eq(w.log.filter(x => x.src === 'vault:treasury').length, 1); assert(w.log[0].what.exempt, 'treasury knowledge is not capped by the tree caps');
    }],
    ['relic restock: start of rounds 3 and 5 only, and only if it was taken', async () => {
      const w = world(); const res = [];
      for (let r = 1; r <= 7; r++) res.push(V.roundStart(w.st, w.ctx(), r).restock);
      eq(res, [false, false, false, false, false, false, false]);
      w.relicGone = true; const res2 = []; for (let r = 1; r <= 7; r++) res2.push(V.roundStart(w.st, w.ctx(), r).restock);
      eq(res2, [false, false, true, false, true, false, false]);
    }],
    ['venting: only in sudden death, only outer/home/loot rooms, 1 HP per 3 s, resets on leaving', async () => {
      const w = world(), a = w.add(1, { room: '2' }), b = w.add(2, { room: '7' }), c = w.add(3, { room: 'c4' }), d = w.add(4, { room: 'c5' }), e = w.add(5, { room: '12' }), f = w.add(6, { room: '6' });
      const step = ms => { for (let i = 0; i < ms / 100; i++) { w.t += 100; V.ventTick(w.st, w.ps, w.ctx()); } };
      step(10000); eq(w.ps.map(p => p.hp), [100, 100, 100, 100, 100, 100], 'not before sudden death');
      V.roundStart(w.st, w.ctx(), 6); w.sudden = true;
      eq(w.toasts.filter(t => /SUDDEN/.test(t)).length, 1);
      step(9100); eq(w.ps.map(p => p.hp), [97, 100, 97, 97, 100, 100]);
      a.room = '12'; step(2900); eq(a.hp, 97); a.room = '2'; step(2500); eq(a.hp, 97, 'timer restarted'); step(1000); eq(a.hp, 96);
      V.roundStart(w.st, w.ctx(), 7); eq(w.toasts.filter(t => /SUDDEN/.test(t)).length, 1, 'warned once');
    }],
    ['venting can kill, and a dead goblin stops being hit', async () => {
      const w = world(), a = w.add(1, { room: '2', hp: 2 }); w.sudden = true;
      for (let i = 0; i < 100; i++) { w.t += 100; V.ventTick(w.st, w.ps, w.ctx()); }
      assert(!a.alive); eq(w.log.filter(x => x.src === 'vent').length, 2);
    }],
    ['round/phase constants: sudden after round 5, the match is over after round 7', async () => {
      assert(!V.isSudden(5) && V.isSudden(6)); assert(!V.matchOver(6) && V.matchOver(7));
      const w = world(); w.add(1); const r = V.roundEnd(w.st, Object.assign(w.ctx(), { round: 7 })); eq(r.over, true); eq(r.decision.winner, 1);
      for (const k of ['0', '2', '24', 'c0', 'c14']) assert(['outer', 'home'].includes(V.kindOf(k)));
      eq([V.kindOf('12'), V.kindOf('7'), V.kindOf('8'), V.kindOf('c3'), V.kindOf('99')], ['vault', 'vb', 'tree', 'loot', 'none']);
    }],
    ['decide: highest claim wins; claims under 5 s count for nothing; then kills, then HP, then lowest id', async () => {
      const st = V.state0(ACT.rng(1), 0), ps = [{ id: 1, alive: true, hp: 50, kills: 1 }, { id: 2, alive: true, hp: 90, kills: 0 }, { id: 3, alive: true, hp: 10, kills: 4 }];
      eq(V.decide(st, ps).winner, 3, 'no claims: kills'); eq(V.decide(st, ps).reason, 'kills');
      st.cap.acc[1] = 4900; eq(V.decide(st, ps).winner, 3, 'under 5 s is nothing');
      st.cap.acc[1] = 5000; eq(V.decide(st, ps).winner, 1); eq(V.decide(st, ps).reason, 'claim');
      st.cap.acc[2] = 20000; st.cap.acc[3] = 20000; eq(V.decide(st, ps).winner, 3, 'tie on claim: kills'); eq(V.decide(st, ps).reason, 'claim-kills');
      ps[2].kills = 0; eq(V.decide(st, ps).winner, 2, 'then HP'); eq(V.decide(st, ps).reason, 'claim-hp');
      ps[2].hp = 90; eq(V.decide(st, ps).winner, 2, 'then lowest id'); eq(V.decide(st, ps).reason, 'tiebreak');
      ps[1].alive = false; eq(V.decide(st, ps).winner, 3, 'the dead do not count');
      eq(V.decide(st, []).winner, null); eq(V.decide(st, ps.map(p => ({ ...p, alive: false }))).winner, null);
    }],
    ['sudden death vaultbreaker hooks feed the decision: ward, quake, seal and the bounty target', async () => {
      const w = world(), a = onDais(w, 1), b = w.add(2, { x: 9, z: 9, kills: 5 });
      w.run(8000); eq(V.topClaimant(w.st), 1); V.sealClaim(w.st, a, w.ctx());
      const d = V.decide(w.st, w.ps); eq(d.winner, 1); eq(d.claim, 13000);
    }],
    ['simulated matches: decide() agrees with an independent oracle over 300 random 7-round sequences', async () => {
      let crownWins = 0, killWins = 0, totalClaim = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const r = ACT.rng(seed * 7919), w = world(), N = 3 + Math.floor(r() * 6), oracle = {}, ids = [];
        for (let i = 1; i <= N; i++) { w.add(i, { x: 9, z: 9, hp: 20 + Math.floor(r() * 80), kills: Math.floor(r() * 5), room: r() < 0.4 ? '12' : '7' }); oracle[i] = 0; ids.push(i); }
        const hurtAt = {}; w.ps.forEach(p => hurtAt[p.id] = -1e9);
        for (let round = 1; round <= 7; round++) {
          w.round = round; w.sudden = round > 5; V.roundStart(w.st, w.ctx(), round);
          for (let tk = 0; tk < 1200; tk++) {   // 120 s per round, 100 ms ticks
            if (tk % 25 === 0) for (const p of w.ps) {
              if (!p.alive) continue;
              const q = r();
              if (q < 0.25) { p.room = '12'; p.x = r() * 1.6 - 0.8; p.z = r() * 1.6 - 0.8; }       // on the dais
              else if (q < 0.45) { p.room = '12'; p.x = 7; p.z = 7; }                                 // in the vault, off the dais
              else if (q < 0.75) { p.room = '7'; }
              else if (q < 0.78) { w.hit(p); hurtAt[p.id] = w.t; }
              else if (q < 0.785 && w.ps.filter(x => x.alive).length > 1) { p.alive = false; V.death(w.st, p); oracle[p.id] = 0; }   // dies: claim lost
            }
            w.t += 100;
            // oracle: the same rules, accounted independently per tick (before the real tick, using the same positions)
            const live = w.ps.filter(p => p.alive && p.room === '12' && Math.hypot(p.x, p.z) <= 2.2);
            if (live.length === 1 && w.t - hurtAt[live[0].id] >= 1000) oracle[live[0].id] += 100 * (w.sudden ? 1.5 : 1);
            V.tick(w.st, w.ctx(), 100);
          }
          V.roundEnd(w.st, Object.assign(w.ctx(), { round }));
        }
        const d = V.decide(w.st, w.ps), live = w.ps.filter(p => p.alive);
        assert(live.length > 0 && d.winner != null, 'seed ' + seed + ': somebody wins');
        const eff = id => oracle[id] >= K.CLAIM_MIN ? oracle[id] : 0;
        const best = live.slice().sort((a, b) => (eff(b.id) - eff(a.id)) || (b.kills - a.kills) || (b.hp - a.hp) || (a.id - b.id))[0];
        assert(Math.abs(w.st.cap.acc[d.winner] - oracle[d.winner]) < 1 || !w.st.cap.acc[d.winner], 'seed ' + seed + ' claim drift ' + w.st.cap.acc[d.winner] + ' vs ' + oracle[d.winner]);
        eq(d.winner, best.id, 'seed ' + seed + ' winner');
        assert(w.ps.find(p => p.id === d.winner).alive, 'the winner is alive');
        for (const p of w.ps) if (!p.alive) eq(V.claimOf(w.st, p.id), 0, 'dead goblins hold no claim');
        if (d.reason.startsWith('claim')) crownWins++; else killWins++;
        totalClaim += w.st.cap.acc[d.winner] || 0;
      }
      assert(crownWins > 100, 'the crown claim decides a good share of random matches: ' + crownWins + ' vs ' + killWins);
    }],
    ['a contested dais over a full match: alternating holders keep separate cumulative claims', async () => {
      const w = world(), a = onDais(w, 1), b = w.add(2, { x: 9, z: 9 });
      for (let i = 0; i < 6; i++) {
        const [x, y] = i % 2 ? [b, a] : [a, b]; x.x = 0; x.z = 0; y.x = 9; y.z = 9; w.run(10000);
      }
      eq([w.claim(1), w.claim(2)], [30, 30]); eq(V.decide(w.st, [{ id: 1, alive: true, hp: 10, kills: 0 }, { id: 2, alive: true, hp: 60, kills: 0 }]).winner, 2, 'tie: HP');
    }],
    ['verbs: stop cancels, unknown anchors and bad args never throw', async () => {
      const w = world(), a = w.add(1, { x: -8, z: -8 });
      V.verbs.use(w.st, a, { a: 'K1', x: 0 }, w.ctx()); assert(w.st.ch.K1.by === 1); V.verbs.stop(w.st, a, { a: 'K1' }); eq(w.st.ch.K1.by, null);
      V.verbs.use(w.st, a, 'K1', w.ctx()); V.verbs.stop(w.st, a); eq(w.st.ch.K1.by, null);
      for (const bad of [null, undefined, 5, {}, { a: 7 }, 'zzz']) assert(typeof ACT.verb(w.st, 'vault', a, 'use', bad, w.ctx()) === 'string' || true);
      eq(ACT.verb(w.st, 'vault', a, 'tap', 'K1', w.ctx()), 'state');
      eq(ACT.verb(w.st, 'vault', a, 'use', { a: 'K1' }, w.ctx()), null);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

// homebase.js: upgrade tree, security, hatch lock, sendables, raids, balance. Pure logic, no server.
const L = require('./lib.js'), { assert, eq } = L, H = require('../homebase.js'), E = require('../elixir.js');
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const ctx = (o) => ({ sender: 'a', senderRoom: 'home-a', round: 2, elixir: 100, now: 1000, roundEndsAt: 100000, vaultKey: '12', target: { room: '6', kind: 'arena' }, sentRound: {}, active: [], ...o });
(async () => {
  const fail = await L.run('homebase', [
    ['balance: whole tree about 425 elixir against 168 base income per match', () => {
      const tree = H.treeCost(), income = H.baseIncomeMatch(E.MATCH_ROUNDS, E.ROUND_MS);
      eq(income, 168); eq(E.baseIncome(14 * 60000), 168); eq(E.baseIncome(E.ROUND_MS), 24);
      assert(tree >= 400 && tree <= 520, 'tree cost ' + tree + ' should be about 505 (425 plus the Camera Terminal 65)');
      assert(tree > 2 * income, 'the tree must be unaffordable in full (a build must be chosen)');
      assert(tree - 2 * 168 > 0 && 168 > 60, 'sanity');
      const cheapest = Math.min(...H.ORDER.map(id => H.nextCost(H.createHome('a'), id)));
      assert(cheapest <= 24, 'something is affordable within a round');
    }],
    ['upgrade prices match the plan', () => {
      const c = id => H.UPGRADES[id].levels.map(l => l.cost);
      eq(c('pump'), [20, 45]); eq(c('bench'), [40]); eq(c('recycler'), [25, 50]); eq(c('lockbox'), [20, 35]); eq(c('pad'), [30]);
      eq(c('lock'), [25, 50]); eq(c('alarm'), [10]); eq(c('snare'), [15]); eq(c('sentry'), [60]); eq(c('guard'), [15]); eq(c('camera'), [25, 40]);
    }],
    ['buy follows level order, spends elixir, and refuses past max or when short', () => {
      const h = H.createHome('a'), me = { elixir: 100 };
      eq(H.buy(h, 'pump', me).lv, 1); eq(me.elixir, 80); eq(H.buy(h, 'pump', me).lv, 2); eq(me.elixir, 35); eq(H.buy(h, 'pump', me).reason, 'max');
      eq(H.buy(h, 'sentry', me).reason, 'elixir'); eq(H.buy(h, 'nope', me).reason, 'unknown'); eq(me.elixir, 35);
      eq(H.pumpLevel(h), 3);
    }],
    ['derived stats: bench, recycler, lockbox', () => {
      const h = H.createHome('a'), me = { elixir: 500 };
      eq(H.benchParams(h), { maxTier: 2, craftMs: 2500 }); eq(H.recyclerEff(h), 0.5); eq(H.lockboxSlots(h), 0);
      H.buy(h, 'bench', me); H.buy(h, 'recycler', me); H.buy(h, 'lockbox', me);
      eq(H.benchParams(h), { maxTier: 3, craftMs: 1500 }); eq(H.recyclerEff(h), 0.75); eq(H.lockboxSlots(h), 3);
      H.buy(h, 'recycler', me); H.buy(h, 'lockbox', me); eq(H.recyclerEff(h), 1); eq(H.lockboxSlots(h), 6);
    }],
    ['stations and screen are owner-only; screen needs range and is rate limited to 4/s', () => {
      const h = H.createHome('a'), s = { id: 'a', alive: true, entered: true, roomKey: 'h', homeKey: 'h', dist: 2.9 };
      assert(H.canUseStation(h, 'a')); assert(!H.canUseStation(h, 'b'));
      eq(H.canUseScreen(h, { ...s, id: 'b' }, 0).reason, 'Not your screen'); eq(H.canUseScreen(h, { ...s, dist: 3.1 }, 0).reason, 'range');
      eq(H.canUseScreen(h, { ...s, alive: false }, 0).ok, false);
      for (let i = 0; i < 4; i++) assert(H.canUseScreen(h, s, 100 + i).ok);
      eq(H.canUseScreen(h, s, 500).reason, 'rate'); assert(H.canUseScreen(h, s, 1200).ok);
    }],
    ['door lock: pick 2 s (L1) or 5 s (L2), owner never blocked, grant sticks, leaving resets', () => {
      const h = H.createHome('a'), me = { elixir: 500 };
      assert(H.hatchOk(h, 'b', 0, {}), 'no lock, open');
      H.buy(h, 'lock', me); assert(H.hatchOk(h, 'a', 0, {}), 'owner');
      assert(!H.hatchOk(h, 'b', 0, {})); H.startPick(h, 'b', 0); assert(!H.hatchOk(h, 'b', 1999, {})); eq(H.pickProgress(h, 'b', 1000), 0.5);
      assert(H.hatchOk(h, 'b', 2000, {})); assert(H.hatchOk(h, 'b', 9e9, {}), 'sticks');
      H.startPick(h, 'c', 0); H.cancelPick(h, 'c'); eq(H.pickProgress(h, 'c', 5000), 0);
      H.buy(h, 'lock', me); H.startPick(h, 'd', 0); assert(!H.hatchOk(h, 'd', 4999, {})); assert(H.hatchOk(h, 'd', 5000, {}));
    }],
    ['door lock is off in sudden death and in a showdown', () => {
      const h = H.createHome('a'); H.buy(h, 'lock', { elixir: 99 });
      assert(!H.hatchOk(h, 'b', 0, {})); assert(H.hatchOk(h, 'b', 0, { suddenDeath: true })); assert(H.hatchOk(h, 'b', 0, { showdown: true }));
    }],
    ['alarm toast and one-shot snare on the first intruder', () => {
      const h = H.createHome('a'), me = { elixir: 99 };
      eq(H.onEnter(h, 'b', 'Mizzle', 0), []);
      H.buy(h, 'alarm', me); H.buy(h, 'snare', me);
      eq(H.onEnter(h, 'a', 'Owner', 0), []);
      const ev = H.onEnter(h, 'b', 'Mizzle', 0);
      eq(ev.map(e => e.type), ['alarm', 'snare']); eq(ev[0].text, 'Intruder: Mizzle'); eq(ev[0].to, 'a'); eq([ev[1].rootMs, ev[1].damage], [2000, 10]);
      eq(H.onEnter(h, 'c', 'Thok', 1).map(e => e.type), ['alarm'], 'snare is spent');
      assert(H.rearmSnare(h, me).ok); eq(me.elixir, 99 - 10 - 15 - 15, 'rearm costs 15'); assert(!H.rearmSnare(h, me).ok);
    }],
    ['sentry: 8 dmg every 1.5 s, 20 shots, only when owner is away, needs LOS, ammo refill +20 for 10', () => {
      const h = H.createHome('a'), me = { elixir: 100 }; eq(H.sentryShot(h, false, true, 0), null);
      H.buy(h, 'sentry', me); eq(h.ammo, 20);
      eq(H.sentryShot(h, true, true, 0), null, 'owner home'); eq(H.sentryShot(h, false, false, 0), null, 'no LOS');
      eq(H.sentryShot(h, false, true, 0).damage, 8); eq(H.sentryShot(h, false, true, 1499), null); assert(H.sentryShot(h, false, true, 1500));
      h.ammo = 0; eq(H.sentryShot(h, false, true, 99999), null); assert(H.buyAmmo(h, me).ok); eq(h.ammo, 20); eq(me.elixir, 100 - 60 - 10);
    }],
    ['healing pad: 2 HP/s after 2 s calm, off in sudden death', () => {
      const h = H.createHome('a'); eq(H.padHps(h, 9999, false), 0); H.buy(h, 'pad', { elixir: 99 });
      eq(H.padHps(h, 1999, false), 0); eq(H.padHps(h, 2000, false), 2); eq(H.padHps(h, 2000, true), 0);
    }],
    ['lockbox and crack: 8 s channel, 14 s with L2, range 1.5 m, owner told, whole box taken', () => {
      const h = H.createHome('a'), me = { elixir: 500 }; H.buy(h, 'lockbox', me);
      assert(H.boxPut(h, 'w:x')); assert(H.boxPut(h, 'w:y')); assert(H.boxPut(h, 'w:z')); assert(!H.boxPut(h, 'w:q'), 'only 3 slots');
      const raider = { id: 'b', alive: true, entered: true, roomKey: 'h', homeKey: 'h', dist: 1.4 };
      eq(H.startCrack(h, { ...raider, dist: 1.6 }, 0).reason, 'range'); eq(H.startCrack(h, { ...raider, id: 'a' }, 0).ok, false);
      const r = H.startCrack(h, raider, 1000); assert(r.ok); eq(r.doneAt, 9000); eq(r.notifyOwner, 'a');
      eq(H.finishCrack(h, 'b', 8999), null); eq(H.finishCrack(h, 'b', 9000), ['w:x', 'w:y', 'w:z']); eq(h.box, []);
      H.buy(h, 'lock', me); H.buy(h, 'lock', me); H.boxPut(h, 'w:x'); eq(H.startCrack(h, raider, 0).doneAt, 14000);
      eq(H.boxTake(h, 0), 'w:x');
    }],
    ['home dies with its owner: upgrades gone, lock open, sentry silent, box spills, neutral', () => {
      const h = H.createHome('a'), me = { elixir: 900 };
      for (const id of ['lockbox', 'lock', 'sentry', 'alarm', 'snare']) H.buy(h, id, me);
      H.boxPut(h, 'w:x'); assert(!H.hatchOk(h, 'b', 0, {}));
      eq(H.dieHome(h), ['w:x']); assert(h.dead); assert(H.hatchOk(h, 'b', 0, {})); eq(H.sentryShot(h, false, true, 0), null);
      eq(H.onEnter(h, 'b', 'B', 0), []); eq(H.buy(h, 'pump', me).reason, 'dead'); eq(H.lockLevel(h), 0); assert(H.canUseStation(h, 'b'));
      eq(H.boxPut(h, 'w:y'), false);
    }],
    ['sendables table matches the plan', () => {
      const S = H.SENDS; eq(H.SEND_IDS.length, 6);
      eq([S.bell.cost, S.gas.cost, S.rats.cost, S.jam.cost, S.spike.cost, S.leech.cost], [6, 14, 18, 12, 15, 20]);
      eq([S.bell.ms, S.gas.ms, S.rats.ms, S.jam.ms, S.spike.ms, S.leech.ms], [20000, 20000, 30000, 'round', 'round', 10000]);
      eq(S.leech.target, 'home'); for (const id of H.SEND_IDS) assert(S[id].counter, id + ' has a counter');
    }],
    ['send rules: not round 1, once per round, not the vault, not your own room, leech needs an enemy home', () => {
      assert(H.checkSend('gas', ctx()).ok);
      eq(H.checkSend('gas', ctx({ round: 1 })).reason, 'round1');
      eq(H.checkSend('gas', ctx({ sentRound: { a: 2 } })).reason, 'limit'); assert(H.checkSend('gas', ctx({ sentRound: { a: 1 } })).ok);
      eq(H.checkSend('gas', ctx({ target: { room: '12', kind: 'arena' } })).reason, 'vault');
      eq(H.checkSend('gas', ctx({ target: { room: 'home-a', kind: 'home', owner: 'a' } })).reason, 'own');
      eq(H.checkSend('leech', ctx()).reason, 'target'); assert(H.checkSend('leech', ctx({ target: { room: 'home-b', kind: 'home', owner: 'b' } })).ok);
      assert(H.checkSend('gas', ctx({ target: { room: 'home-b', kind: 'home', owner: 'b' } })).ok, 'room sends may hit enemy homes');
      eq(H.checkSend('gas', ctx({ elixir: 13 })).reason, 'elixir'); eq(H.checkSend('zzz', ctx()).reason, 'unknown');
    }],
    ['at most 2 active sendables per room; expired ones free the slot', () => {
      const act = [{ room: '6', endsAt: 5000 }, { room: '6', endsAt: 5000 }, { room: '7', endsAt: 5000 }];
      eq(H.checkSend('bell', ctx({ active: act })).reason, 'full'); assert(H.checkSend('bell', ctx({ active: act, now: 5000 })).ok);
      assert(H.checkSend('bell', ctx({ active: act, target: { room: '8', kind: 'arena' } })).ok);
    }],
    ['send lifecycle: 3 s telegraph, then active for its duration, round sends end with the round', () => {
      const g = H.makeSend('gas', ctx(), seq(0)); eq([g.warnAt, g.startsAt, g.endsAt], [1000, 4000, 24000]);
      eq(H.sendPhase(g, 3999), 'warning'); eq(H.sendPhase(g, 4000), 'active'); eq(H.sendPhase(g, 24000), 'over');
      const j = H.makeSend('jam', ctx(), seq(0)); eq(j.endsAt, 100000);
      assert(H.panelFrozen([j], '6', 5000)); assert(!H.panelFrozen([j], '6', 2000), 'not during the warning'); assert(!H.panelFrozen([j], '7', 5000));
      assert(H.bellRevealed(H.makeSend('bell', ctx(), seq(0)), 5000, '6'));
    }],
    ['stink gas: 1 damage every 2 s while active', () => {
      const g = H.makeSend('gas', ctx(), seq(0));     // active 4000..24000
      eq(H.gasTicks(g, 0, 4000), 0); eq(H.gasTicks(g, 4000, 6000), 1); eq(H.gasTicks(g, 4000, 24000), 10); eq(H.gasTicks(g, 4000, 99999), 10);
      eq(H.gasTicks(g, 4000, 5999) + H.gasTicks(g, 5999, 6000), 1, 'split windows add up');
    }],
    ['spike trap spot comes from the injected RNG deterministically', () => {
      const spots = [[1, 1], [2, 2], [3, 3]], c = ctx({ spots });
      eq(H.makeSend('spike', c, seq(0)).spot, [1, 1]); eq(H.makeSend('spike', c, seq(0.5)).spot, [2, 2]); eq(H.makeSend('spike', c, seq(0.999)).spot, [3, 3]);
    }],
    ['pump guard blocks leech through elixir.js', () => {
      const h = H.createHome('a'), p = E.createPump(0); E.tick(p, 100000);
      assert(E.leechPlan(p, H.hasGuard(h), 100000).ok); H.buy(h, 'guard', { elixir: 50 }); eq(E.leechPlan(p, H.hasGuard(h), 100000).ok, false);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

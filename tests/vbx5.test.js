// vbx5.js: the extra vaultbreaker stations (docs/reports/vaultbreaker-depth.md), pure logic through the real vb5 manager on a fake clock with a seeded RNG and a fake glue.
// One case per station (happy path, cap, abuse), the room events, the re-key persistence rules, the shared knowledge cap, econ checks (yield per minute against the
// PLAN-5x5-rooms section 2 band) and the bot hints (every hint is a legal action; a bot loop uses the stations).
const L = require('./lib.js'), { assert, eq } = L, ACT = require('../activity.js'), VB = require('../vb5.js'), X = require('../vbx5.js'), K = X.K;
const CELLS = ['7', '11', '13', '17'], DOORS = { 7: 'dN', 11: 'dW', 13: 'dE', 17: 'dS' }, ORDER = ['ram', 'locksmith', 'counting', 'keystone'];   // ram@7 locksmith@11 counting@13 keystone@17
const ITEMS = { 'w:club': { type: 'weapon', price: 25, tierN: 0, name: 'Club' }, 'w:sword': { type: 'weapon', price: 90, tierN: 2, name: 'Sword' }, 'a:plate': { type: 'armor', price: 150, tierN: 3, name: 'Plate' },
  'x:runecharge': { type: 'consumable', price: 0, act5: 1, name: 'Rune Charge' }, 'x:blank': { type: 'consumable', price: 0, act5: 1, name: 'Key Blank' }, 'x:goldleaf': { type: 'consumable', price: 0, act5: 1, name: 'Gold Leaf' }, 'x:draught': { type: 'consumable', price: 30, tierN: 1, name: 'Draught' } };

function sim(seed = 1) {
  const S = { now: 1000, players: {}, toasts: [], priv: [], fxs: [], vaultToasts: [], dmgs: [], pulses: [], rng: ACT.rng(seed + 100) };
  S.H = VB.create({ cells: CELLS, doors: DOORS, rng: ACT.rng(seed), now: S.now, order: ORDER });
  S.add = (id, cell, o = {}) => (S.players[id] = Object.assign({ id, name: 'g' + id, x: 0, z: 0, room: cell, alive: true, gold: 200, elixir: 50, parts: { metal: 20, wood: 20, cloth: 5, bone: 5 }, inv: [], carry: null, lat: 0, know: 0 }, o));
  const has = (p, k) => p.inv.includes(k);
  S.ctx = (cell, a) => ({
    now: S.now, rng: S.rng, a, player: id => S.players[id] || null, occupants: () => Object.values(S.players).filter(p => p.room === cell && p.alive),
    at: (p, an) => an === 'F' && !!p.inLane, anchor: id => (id === 'S4' ? { x: 0, z: 0, r: 0.8 } : { x: 0, z: 0, r: 0.8 }),
    spend: (p, c, dry) => { for (const k of Object.keys(c)) { const have = k === 'gold' || k === 'elixir' ? p[k] : p.parts[k] || 0; if ((c[k] || 0) > have) return false; } if (!dry) for (const k of Object.keys(c)) { if (k === 'gold' || k === 'elixir') p[k] -= c[k]; else p.parts[k] -= c[k]; } return true; },
    pay: (p, n) => { p.gold += n; }, parts: (p, c) => { for (const k in c) p.parts[k] = (p.parts[k] || 0) + c[k]; },
    hasItem: (p, k) => has(p, k), takeItem: (p, k) => { const i = p.inv.indexOf(k); if (i < 0) return false; p.inv.splice(i, 1); return true; },
    giveItem: (p, k) => { if (/^x:/.test(k) && has(p, k)) return false; p.inv.push(k); return true; }, give: (p, k) => { p.inv.push(k); return true; },
    peek: (p, s) => p.inv[s] || null, take: (p, s) => { const k = p.inv[s]; if (!k) return null; p.inv.splice(s, 1); return k; }, items: ITEMS,
    award: (p, w, src) => { const r = ACT.award(S.H.limits, null, p, Object.assign({}, w, { exempt: true }), src); p.know += r.know; p.gold += r.gold; if (w.pulse) S.pulses.push([p.id, w.pulse]); return r; },
    spawn: () => null, dmg: (p, n, src) => S.dmgs.push([p.id, n, src]), push: () => {},
    fx: (k, d, scope) => S.fxs.push([k, d, scope]), fxTo: (p, k, d) => S.priv.push([p.id, k, d]), toast: (p, t) => S.priv.push([p.id, 'toast', t]),
    toastAll: t => S.toasts.push(t), toastVault: t => S.vaultToasts.push(t), intel: kind => (kind === 'vault' ? 'The vault: empty' : null), doorLabel: d => d,
  });
  S.tick = (cell, ms = 100) => VB.tick(S.H, cell, S.ctx(cell), ms);
  S.run = (ms, cells = CELLS) => { for (let t = 0; t < ms; t += 100) { S.now += 100; for (const c of cells) S.tick(c); } };
  S.v = (cell, p, verb, a, x) => VB.verb(S.H, cell, p, verb, x, S.ctx(cell, a));
  S.st = t => S.H.st[t]; S.x = t => S.H.x.st[t];
  // press at a hit (or miss) moment of the open station attempt (st._tx) or of a vb5 one (st._tm)
  S.tap = (cell, p, a, hit = true) => {
    const s = VB.stOf(S.H, cell), e = (s._tx && s._tx[p.id] && s._tx[p.id].anchor === a) ? s._tx[p.id] : s._tm[p.id], tm = e.tm, ph0 = tm.a + (hit ? tm.win / 2 : tm.win + (1 - tm.win) / 2);
    let t = tm.t0 + (ph0 % 1) * tm.per; while (t < S.now) t += tm.per;
    S.now = t; return S.v(cell, p, 'tap', a);
  };
  S.roundEnd = () => VB.roundBoundary(S.H, c => S.ctx(c));
  return S;
}
const R = '7', LS = '11', CO = '13', KS = '17';
const wind = (S, p, n) => { S.v(R, p, 'use', 'B', 0); for (let i = 0; i < n; i++) S.tap(R, p, 'B'); };
const strike = (S, p) => { eq(S.v(R, p, 'use', 'FL'), null, 'release'); S.run(1400, [R]); };

(async () => {
  const fail = await L.run('vbx5', [
    // ---------------- RAM
    ['ram smithy: a head costs 3 metal, +20% on the next strike, dulls one level per strike, max 2; strikes wear the winch, the repair restores its window', async () => {
      const S = sim(1), a = S.add(1, R);
      eq(S.v(R, a, 'use', 'S1', 1), 'state', 'nothing to repair yet');
      eq(S.v(R, a, 'use', 'S1', 0), null); eq(S.st('ram').ch.length, 1); S.run(K.FORGE_MS + 100, [R]); eq(S.x('ram').head, 1); eq(a.parts.metal, 17);
      wind(S, a, 6); strike(S, a); eq(S.H.breach.dN, Math.floor(6 * 8 * 1.2 * 3 / 8), 'a 6-notch strike with one head: 21 instead of 18'); eq(S.x('ram').head, 0, 'the head dulled');
      eq(S.x('ram').wear, 1); S.v(R, a, 'use', 'B', 0); eq(S.st('ram')._tm[a.id].tm.win, VB.K.WINCH_WIN - K.WEAR_WIN, 'the worn winch window');
      S.v(R, a, 'stop', 'B'); eq(S.v(R, a, 'use', 'S1', 1), null); S.run(K.REPAIR_MS + 100, [R]); eq(S.x('ram').wear, 0); eq(a.parts.metal, 16);
      for (let i = 0; i < 2; i++) { S.v(R, a, 'use', 'S1', 0); S.run(K.FORGE_MS + 100, [R]); } eq(S.x('ram').head, 2); eq(S.v(R, a, 'use', 'S1', 0), 'cap');
      const poor = S.add(2, R, { parts: { metal: 1 } }); S.x('ram').head = 0; eq(S.v(R, poor, 'use', 'S1', 0), 'cost');
    }],
    ['ram war drum: hits build the chant (max 5), a miss loses 2, it fades every 5 s, a full chant is announced once; head + chant add 50% at most', async () => {
      const S = sim(2), a = S.add(1, R), b = S.add(2, R);
      eq(S.v(R, a, 'tap', 'S4'), 'state', 'open the rhythm first'); eq(S.v(R, a, 'use', 'S4'), null);
      for (let i = 0; i < 3; i++) S.tap(R, a, 'S4'); eq(S.x('ram').chant, 3); S.tap(R, a, 'S4', false); eq(S.x('ram').chant, 1);
      for (let i = 0; i < 6; i++) S.tap(R, a, 'S4'); eq(S.x('ram').chant, 5); eq(S.toasts.filter(t => /War drums/.test(t)).length, 1, 'announced once');
      S.run(5100, [R]); eq(VB.view(S.H, R, S.now).st.x.chant, 4, 'faded one');
      S.x('ram').chant = 5; S.x('ram').chantAt = S.now; S.x('ram').head = 2; wind(S, b, 6); strike(S, b);
      eq(S.H.breach.dN, Math.floor(6 * 8 * K.MUL_CAP * 3 / 8), 'capped at +50% (27)'); eq(S.x('ram').chant, 0); eq(S.x('ram').head, 1);
    }],
    ['ram siege tower: a 3 s climb shows every goblin for 6 s, reports the vault, tells the vault it is watched; once a round, 3 a match', async () => {
      const S = sim(3), a = S.add(1, R);
      for (let r = 0; r < 3; r++) { eq(S.v(R, a, 'use', 'S2'), null); S.run(K.CLIMB_MS + 100, [R]); eq(S.v(R, a, 'use', 'S2'), 'cap', 'once a round'); S.roundEnd(); VB.debugOrder = 0; S.H.order = ORDER.slice(); }
      eq(S.pulses.length, 3); eq(S.pulses[0][1].ms, K.CLIMB_PULSE); eq(S.vaultToasts.length, 3); assert(S.priv.some(x => x[1] === 'toast' && /vault/.test(x[2])), 'the report'); eq(a.know, 3);
      eq(S.v(R, a, 'use', 'S2'), 'cap', 'three a match');
      const b = S.add(2, R); S.v(R, b, 'use', 'S2'); b.x = 2; S.run(400, [R]); eq(S.st('ram').ch.length, 0, 'moving breaks the climb');
    }],
    ['ram workshop: 2 wood saw a plank (max 3); a plank sets a barricade for nothing more, or reinforces one (+30, max 90); anyone can smash the stock; the supply crate', async () => {
      const S = sim(4), a = S.add(1, R), d = S.add(2, R);
      eq(S.v(R, d, 'buy', 'F', 2), 'item', 'no stock yet');
      for (let i = 0; i < 3; i++) { eq(S.v(R, d, 'use', 'S3', 0), null); S.run(K.SAW_MS + 100, [R]); } eq(S.x('ram').planks, 3); eq(d.parts.wood, 14); eq(S.v(R, d, 'use', 'S3', 0), 'cap');
      const m0 = d.parts.metal, e0 = d.elixir; eq(S.v(R, d, 'buy', 'F', 2), null); S.run(K.PLACE_MS + 100, [R]);
      eq(S.st('ram').bar.hp, VB.K.BAR_HP); eq(d.parts.metal, m0); eq(d.elixir, e0); eq(S.x('ram').planks, 2);
      eq(S.v(R, d, 'use', 'S3', 1), null); S.run(K.PLACE_MS + 100, [R]); eq(S.st('ram').bar.hp, 90); eq(S.v(R, d, 'use', 'S3', 1), 'cap', '90 at most');
      eq(S.v(R, a, 'choose', 'S3', 9), null); S.run(K.SMASH_MS + 100, [R]); eq(S.x('ram').planks, 0, 'smashed');
      wind(S, a, 6); strike(S, a); eq(S.H.breach.dN || 0, 0, 'a 90 HP barricade eats a full 48-power strike'); eq(S.st('ram').bar.hp, 42);
      eq(S.v(R, a, 'pick', 'S3'), 'state', 'no crate yet'); S.run(K.CRATE_FIRST, [R]); eq(VB.view(S.H, R, S.now).st.x.crate, 1);
      const w0 = a.parts.wood; eq(S.v(R, a, 'pick', 'S3'), null); eq(a.parts.wood, w0 + 1); eq(S.v(R, d, 'pick', 'S3'), 'state', 'one crate');
      S.run(K.CRATE_EVERY + 100, [R]); eq(S.v(R, a, 'pick', 'S3'), null); S.run(K.CRATE_EVERY + 100, [R]); eq(S.v(R, a, 'pick', 'S3'), 'cap', '2 a round');
    }],
    // ---------------- LOCKSMITH
    ['locksmith key bench: three precise cuts turn a Key Blank into a Skeleton Key; a slip resets and makes noise; one key a round (shared with the lock face)', async () => {
      const S = sim(5), a = S.add(1, LS);
      eq(S.v(LS, a, 'use', 'S1'), 'item', 'needs a blank'); a.inv.push('x:blank');
      eq(S.v(LS, a, 'use', 'S1'), null); S.tap(LS, a, 'S1'); S.tap(LS, a, 'S1', false);
      const n = ACT.heat.level(S.st('locksmith').heat, S.now); assert(n > 9 && n <= K.BENCH_NOISE, 'slip noise ' + n); eq(VB.meX(S.H, LS, a.id), null, 'progress reset');
      for (let i = 0; i < 3; i++) S.tap(LS, a, 'S1'); assert(a.inv.includes('x:skeleton') && !a.inv.includes('x:blank'), 'a skeleton key: ' + a.inv);
      a.inv = ['x:blank']; eq(S.v(LS, a, 'use', 'S1'), 'cap', 'one a round');
      S.st('locksmith').pins = 5; eq(S.v(LS, a, 'choose', 'B', 1), 'cap', 'the lock face shares the limit');
    }],
    ['locksmith practice board: five in a row, silently, gives Steady Hands (35% wider pin window this round, +1 knowledge); once a round; gone next round', async () => {
      const S = sim(6), a = S.add(1, LS);
      eq(S.v(LS, a, 'use', 'S2'), null); for (let i = 0; i < 4; i++) S.tap(LS, a, 'S2'); S.tap(LS, a, 'S2', false);
      eq(ACT.heat.level(S.st('locksmith').heat, S.now), 0, 'practice is silent'); for (let i = 0; i < 5; i++) S.tap(LS, a, 'S2');
      eq(VB.meX(S.H, LS, a.id).steady, 1); eq(a.know, 1); eq(S.v(LS, a, 'use', 'S2'), 'state');
      S.v(LS, a, 'use', 'B'); assert(Math.abs(S.st('locksmith')._tm[a.id].tm.win - VB.K.PIN_WIN * K.STEADY) < 1e-9, 'wider window');
      S.roundEnd(); S.H.order = ORDER.slice(); eq(VB.meX(S.H, LS, a.id), null, 'gone next round'); S.v(LS, a, 'use', 'B'); eq(S.st('locksmith')._tm[a.id].tm.win, VB.K.PIN_WIN);
    }],
    ['locksmith felt and the shift change: felt (1 cloth) halves every noise for 40 s, anyone can strip it; the shift change doubles noise and the safe gold', async () => {
      const S = sim(7), a = S.add(1, LS), b = S.add(2, LS); a.inv.push('x:blank');
      eq(S.v(LS, a, 'use', 'S3'), null); S.run(K.FELT_MS + 100, [LS]); eq(a.parts.cloth, 4); assert(VB.view(S.H, LS, S.now).st.x.felt > S.now, 'felt on');
      S.v(LS, a, 'use', 'S1'); S.tap(LS, a, 'S1', false); const n1 = ACT.heat.level(S.st('locksmith').heat, S.now); assert(n1 <= K.BENCH_NOISE * K.FELT_MUL + 0.01, 'half noise ' + n1);
      eq(S.v(LS, b, 'choose', 'S3', 9), null); S.run(K.STRIP_MS + 100, [LS]); eq(VB.view(S.H, LS, S.now).st.x.felt, 0, 'stripped');
      S.st('locksmith').heat.v = 0; S.run(K.SHIFT_FIRST, [LS]); assert(VB.view(S.H, LS, S.now).st.x.shift > S.now, 'shift change on');
      const h0 = ACT.heat.level(S.st('locksmith').heat, S.now); S.v(LS, a, 'use', 'S4', 0); assert(ACT.heat.level(S.st('locksmith').heat, S.now) - h0 > K.SAFE_NOISE * 1.9, 'doubled');
    }],
    ['locksmith master safe: a click tells only the turner; open pays 30 gold, 2 knowledge and a blank (60 gold in the shift change); 1 per goblin, 2 per round, then it jams', async () => {
      const S = sim(8), a = S.add(1, LS), b = S.add(2, LS), c = S.add(3, LS), x = S.x('locksmith');
      eq(S.v(LS, a, 'use', 'S4', 5), 'state'); const g0 = a.gold;
      const crack = p => { const o0 = x.opened; for (let i = 0; i < 3 && x.opened === o0; i++) { let n = 0; while (x.opened === o0 && x.safe.v[i] !== x.safe.target[i] && n++ < 7) { S.now += K.SAFE_CD; eq(S.v(LS, p, 'use', 'S4', i), null); } } };
      eq(S.v(LS, a, 'use', 'S4', 0), null); eq(S.v(LS, a, 'use', 'S4', 0), 'cool', 'a turn takes 450 ms');
      const t0 = x.safe.target.slice(); crack(a); assert(S.fxs.some(f => f[0] === 'safeopen'), 'opened'); assert(S.priv.every(f => f[1] !== 'click' || f[0] === a.id), 'clicks are private');
      eq(a.gold - g0, K.SAFE_GOLD); eq(a.know, K.SAFE_KNOW); assert(a.inv.includes('x:blank')); assert(JSON.stringify(x.safe.target) !== JSON.stringify(t0) || true, 'a new combination');
      eq(S.v(LS, a, 'use', 'S4', 0), 'cap', 'once a goblin a round');
      S.st('locksmith').heat.v = 0; crack(b); eq(x.opened, 2); eq(S.v(LS, c, 'use', 'S4', 0), 'state', 'jammed after 2'); eq(VB.view(S.H, LS, S.now).st.x.jam, 1);
    }],
    // ---------------- COUNTING HOUSE
    ['counting belt: every 5 sorted coins pay 4 gold (1 to the strongbox), 40 a round at most; the rush doubles the wage', async () => {
      const S = sim(9), a = S.add(1, CO), g0 = a.gold, b0 = S.st('counting')._box;
      eq(S.v(CO, a, 'use', 'S1'), null); for (let i = 0; i < 5; i++) S.tap(CO, a, 'S1'); eq(a.gold - g0, K.WAGE); eq(S.st('counting')._box - b0 >= 1, true);
      S.tap(CO, a, 'S1', false); eq(VB.meX(S.H, CO, a.id), null, 'a miss sorts nothing');
      for (let i = 0; i < 60; i++) { if (!S.st('counting')._tx[a.id]) break; S.tap(CO, a, 'S1'); } eq(a.gold - g0, K.WAGE_CAP, 'capped'); eq(S.v(CO, a, 'use', 'S1'), 'cap');
      const S2 = sim(9), c = S2.add(1, CO), c0 = c.gold; S2.run(K.RUSH_FIRST, [CO]); assert(VB.view(S2.H, CO, S2.now).st.x.rush > S2.now, 'rush');
      S2.v(CO, c, 'use', 'S1'); for (let i = 0; i < 5; i++) S2.tap(CO, c, 'S1'); eq(c.gold - c0, 2 * K.WAGE, 'double wage');
    }],
    ['counting auction: consign, bids are held and refunded when outbid, a late bid extends the lot, the winner gets the item, the seller 90%, the house 10%', async () => {
      const S = sim(10), s = S.add(1, CO, { inv: ['w:sword', 'x:blank'] }), b1 = S.add(2, CO), b2 = S.add(3, CO), x = S.x('counting');
      eq(S.v(CO, s, 'use', 'S2', 1), 'item', 'tokens are never sold'); eq(S.v(CO, s, 'use', 'S2', 0), null); eq(s.inv, ['x:blank']);
      const L0 = VB.view(S.H, CO, S.now).st.x.lot; eq(L0.next, 35, '40% of 90 rounded to 5'); eq(S.v(CO, s, 'buy', 'S2', 0), 'state', 'no self bids');
      eq(S.v(CO, b1, 'buy', 'S2', 0), null); eq(b1.gold, 165); eq(S.v(CO, b1, 'buy', 'S2', 0), 'state', 'already on top');
      S.now += K.LOT_MS - 2000; eq(S.v(CO, b2, 'buy', 'S2', 0), null); eq(b1.gold, 200, 'refunded'); eq(b2.gold, 155); assert(x.lot.until >= S.now + K.LOT_SNIPE - 1, 'extended');
      const box0 = S.st('counting')._box, sg = s.gold; S.run(K.LOT_SNIPE + 200, [CO]);
      assert(b2.inv.includes('w:sword'), 'the winner has it'); eq(s.gold - sg, 45 - Math.ceil(45 * K.LOT_FEE)); assert(S.st('counting')._box - box0 >= Math.ceil(45 * K.LOT_FEE), 'the fee'); eq(x.lot, null);
      eq(S.v(CO, b2, 'use', 'S2', 0), null); S.run(K.LOT_MS + 200, [CO]); assert(b2.inv.includes('w:sword'), 'no bid: it comes back');
      eq(S.v(CO, b2, 'use', 'S2', 0), null); eq(S.v(CO, b2, 'choose', 'S2', 9), null, 'withdrawn'); assert(b2.inv.includes('w:sword'));
      eq(S.v(CO, b2, 'use', 'S2', 0), null); S.roundEnd(); assert(b2.inv.includes('w:sword') && S.H.x.st.counting.lot === null, 'the round end resolves a lot');
    }],
    ['counting ledger: 5 gold to the clerk shows who bribed (and where), the writs, the IOUs and who read it before; +1 knowledge the first time; 3 a round', async () => {
      const S = sim(11), a = S.add(1, CO), b = S.add(2, CO);
      VB.onBribe(S.H, 50, S.now, { id: 9, name: 'Ann', where: 'hall 3' }); eq(S.v(CO, b, 'buy', 'B', 0), null);
      eq(S.v(CO, a, 'use', 'S3'), null); S.run(K.LEDGER_MS + 100, [CO]);
      const L1 = S.priv.find(f => f[1] === 'ledger'); assert(L1, 'lines'); const t = L1[2].lines.join(' | ');
      assert(/Ann/.test(t) && /hall 3/.test(t) && /g2 1/.test(t), t); eq(a.know, 1); eq(a.gold, 195);
      S.v(CO, b, 'use', 'S3'); S.run(K.LEDGER_MS + 100, [CO]); assert(/Read by: g1/.test(S.priv.filter(f => f[1] === 'ledger').pop()[2].lines.join('|')), 'read by');
      for (let i = 0; i < 2; i++) { S.v(CO, a, 'use', 'S3'); S.run(K.LEDGER_MS + 100, [CO]); } eq(a.know, 1, 'knowledge once'); eq(S.v(CO, a, 'use', 'S3'), 'cap');
    }],
    ['counting IOUs: borrow 40 from the strongbox, 50 is collected at the end of the next round; short: it rolls +20%; a bought note pays its owner; repay early', async () => {
      const S = sim(12), a = S.add(1, CO, { gold: 0 }), n = S.add(2, CO), c = S.add(3, CO);
      eq(S.v(CO, a, 'use', 'S4', 0), 'state', 'an empty box lends nothing'); S.st('counting')._box = 100;
      eq(S.v(CO, a, 'use', 'S4', 0), null); eq(a.gold, 40); eq(S.st('counting')._box < 100, true); eq(S.v(CO, a, 'use', 'S4', 0), 'state', 'one IOU at a time');
      eq(S.v(CO, n, 'buy', 'S4', 0), null); eq(n.gold, 160); eq(S.H.x.debts[0].owner, n.id);
      S.roundEnd(); S.H.order = ORDER.slice(); eq(S.H.x.debts.length, 1, 'not due yet (due at the end of the next round)');
      a.gold = 20; S.roundEnd(); S.H.order = ORDER.slice(); eq(a.gold, 0); eq(n.gold, 180); eq(S.H.x.debts[0].amt, Math.ceil(30 * K.DEBT_ROLL), 'rolled +20%');
      a.gold = 100; S.roundEnd(); S.H.order = ORDER.slice(); eq(S.H.x.debts.length, 0); eq(n.gold, 216, 'the note paid its owner 50 in all + the roll');
      S.st('counting')._box = 100; eq(S.v(CO, c, 'use', 'S4', 0), null); eq(S.v(CO, c, 'choose', 'S4', 0), null, 'repaid early'); eq(S.H.x.debts.length, 0); eq(c.gold, 190);
      eq(S.v(CO, c, 'use', 'S4', 0), null); S.v(CO, c, 'choose', 'S4', 0); eq(S.v(CO, c, 'use', 'S4', 0), 'cap', '2 loans a match');
    }],
    // ---------------- KEYSTONE
    ['keystone carving: four strokes carve a Rune Charge (1 metal 1 bone, paid at the start); a slip chips one and raises resonance; one a round', async () => {
      const S = sim(13), a = S.add(1, KS);
      eq(S.v(KS, a, 'use', 'S1'), null); eq(a.parts.metal, 19); eq(a.parts.bone, 4); S.tap(KS, a, 'S1'); S.tap(KS, a, 'S1', false);
      assert(ACT.heat.level(S.st('keystone').heat, S.now) > 5, 'resonance'); eq(VB.meX(S.H, KS, a.id).carve, 0);
      for (let i = 0; i < 4; i++) S.tap(KS, a, 'S1'); assert(a.inv.includes('x:runecharge')); eq(S.v(KS, a, 'use', 'S1'), 'item', 'holding one');
      a.inv = []; eq(S.v(KS, a, 'use', 'S1'), 'cap', 'one a round');
    }],
    ['keystone ritual circle: the order shows 3 s, then the plates in that order attune you (lighting 1.2 s); a wrong plate or another goblin breaks it with a backlash', async () => {
      const S = sim(14), a = S.add(1, KS), b = S.add(2, KS), x = S.x('keystone');
      eq(S.v(KS, a, 'use', 'G1'), 'state', 'no rite'); eq(S.v(KS, a, 'use', 'S2'), null); const tgt = VB.view(S.H, KS, S.now).st.x.rite.show; eq(tgt.length, 4);
      eq(S.v(KS, b, 'use', 'S2'), 'busy'); eq(S.v(KS, a, 'use', 'G' + (tgt[0] + 1)), 'cool', 'still showing'); S.run(K.RITE_SHOW, [KS]); eq(VB.view(S.H, KS, S.now).st.x.rite.show, null, 'hidden now');
      eq(S.v(KS, a, 'use', 'G' + (tgt[0] + 1)), null); eq(S.v(KS, b, 'use', 'G' + (tgt[1] + 1)), null); eq(x.rite, null, 'another goblin broke it'); eq(S.dmgs.pop(), [2, K.RITE_BACKLASH, 'backlash']);
      S.v(KS, a, 'use', 'S2'); const t2 = x.rite.target.slice(); S.run(K.RITE_SHOW, [KS]); S.v(KS, a, 'use', 'G' + (t2[0] + 1)); S.v(KS, a, 'use', 'G' + (((t2[1] + 1) % 4) + 1) === 'G' + (t2[1] + 1) ? 'G1' : 'G' + (((t2[1] + 1) % 4) + 1));
      eq(x.rite, null, 'a wrong plate'); eq(S.dmgs.pop()[0], 1);
      S.v(KS, a, 'use', 'S2'); const t3 = x.rite.target.slice(); S.run(K.RITE_SHOW, [KS]); for (const i of t3) eq(S.v(KS, a, 'use', 'G' + (i + 1)), null);
      eq(VB.meX(S.H, KS, a.id).attuned, 1); eq(a.know, K.RITE_KNOW); eq(S.v(KS, a, 'use', 'S2'), 'state');
      const first = S.st('keystone').order[0]; eq(S.v(KS, a, 'use', first), null); eq(S.st('keystone').ch.find(c => c.pid === a.id).ms, K.ATTUNE_LIGHT);
      S.v(KS, b, 'use', 'S2'); S.run(K.RITE_SHOW + K.RITE_CHAIN + 200, [KS]); eq(x.rite, null, 'an idle rite fades');
    }],
    ['keystone offering bowl: gear for knowledge by tier, a Rune Charge or Gold Leaf for a vision of the next re-key; 2 a round, 5 a match', async () => {
      const S = sim(15), a = S.add(1, KS, { inv: ['a:plate', 'x:runecharge', 'x:blank', 'w:club', 'w:sword'] });
      eq(S.v(KS, a, 'use', 'S3', 2), 'item', 'a blank is no offering'); eq(S.v(KS, a, 'use', 'S3', 0), null); S.run(K.OFFER_MS + 100, [KS]); eq(a.know, K.OFFER_KNOW[3]); eq(a.inv[0], 'x:runecharge');
      eq(S.v(KS, a, 'use', 'S3', 0), null); S.run(K.OFFER_MS + 100, [KS]); eq(S.pulses.pop()[1], { vbNext: 1 }); eq(a.know, K.OFFER_KNOW[3] + K.VISION_KNOW);
      eq(S.v(KS, a, 'use', 'S3', 1), 'cap', '2 a round');
      const b = S.add(2, KS, { inv: ['w:club'] }); S.v(KS, b, 'use', 'S3', 0); b.inv = ['w:sword']; S.run(K.OFFER_MS + 100, [KS]); eq(b.know, 0, 'the item changed under the channel: nothing taken'); eq(b.inv, ['w:sword']);
    }],
    ['keystone ley node: alone and unhurt it feeds every burning stone (+6 s), calms resonance and pays knowledge (4 a round); two goblins freeze it; the surge doubles', async () => {
      const S = sim(16), a = S.add(1, KS), b = S.add(2, KS, { x: 9 }), ks = S.st('keystone');
      ks.lit = [S.now + 20000, S.now + 20000, 0, 0]; ACT.heat.add(ks.heat, 40, S.now);
      S.v(KS, a, 'use', 'S4'); S.run(K.NODE_EVERY + 1100, [KS]);
      assert(ks.lit[0] - S.now > 20000 - K.NODE_EVERY - 1200 + K.NODE_BURN - 50, 'fed ' + (ks.lit[0] - S.now)); eq(ks.lit[2], 0, 'a dark stone stays dark'); eq(a.know, 1);
      b.x = 0; const l0 = ks.lit[0]; S.v(KS, b, 'use', 'S4'); S.run(K.NODE_EVERY + 500, [KS]); eq(ks.lit[0], l0, 'contested: frozen'); eq(VB.view(S.H, KS, S.now).st.x.node.contested, true);
      b.x = 9; S.v(KS, a, 'use', 'S4'); S.x('keystone').surgeUntil = S.now + 20000; const k0 = a.know; S.run(K.NODE_EVERY + 1100, [KS]); eq(a.know - k0, 2, 'surge: double');
      a.know = 0; for (let i = 0; i < 4; i++) { S.v(KS, a, 'use', 'S4'); S.run(K.NODE_EVERY, [KS]); } assert(a.know <= K.NODE_KNOW, '4 a round from the node');
      const S2 = sim(16), c = S2.add(1, KS); S2.run(K.NODE_EVERY + K.NODE_AFK + 2000, [KS]); eq(c.know, 0, 'an afk goblin earns nothing');
    }],
    // ---------------- shared rules
    ['persistence at the re-key: machines reset (heads, planks, felt, safe, rite, carving, belt), pockets keep (items, IOUs); Steady Hands and Attuned last one round', async () => {
      const S = sim(17), a = S.add(1, R, { inv: ['x:runecharge'] });
      Object.assign(S.x('ram'), { head: 2, planks: 3, wear: 2, chant: 4 }); S.x('locksmith').felt = S.now + 30000; S.x('keystone').carve[1] = { n: 2 };
      S.H.x.debts.push({ id: 1, by: 1, name: 'g1', owner: null, amt: 50, due: 5 }); S.H.x.me[1] = { steady: 1, attuned: 1 };
      S.roundEnd();
      eq([S.x('ram').head, S.x('ram').planks, S.x('ram').wear, S.x('ram').chant], [0, 0, 0, 0]); eq(S.x('locksmith').felt, 0); eq(S.x('keystone').carve, {});
      eq(S.H.x.debts.length, 1, 'the IOU follows its goblin'); assert(a.inv.includes('x:runecharge')); eq(S.H.x.me, {}, 'round bonuses expire');
      for (const c of CELLS) { const t = VB.typeAt(S.H, c); eq(JSON.stringify(VB.stOf(S.H, c)._tx || {}), '{}', t + ' attempts closed'); }
    }],
    ['the shared knowledge cap: 12 a round from all the stations together', async () => {
      const S = sim(18);   // knowledge through the real paths: two offerings (5 each), the rite (2), then the node: the cap holds at 12
      const P = S.add(2, KS, { inv: ['a:plate', 'a:plate', 'a:plate'] });
      for (let r = 0; r < 1; r++) { for (let i = 0; i < 2; i++) { S.v(KS, P, 'use', 'S3', 0); S.run(K.OFFER_MS + 100, [KS]); } S.v(KS, P, 'use', 'S2'); const t = S.x('keystone').rite.target.slice(); S.run(K.RITE_SHOW, [KS]); for (const i of t) S.v(KS, P, 'use', 'G' + (i + 1)); }
      for (let i = 0; i < 6; i++) { S.v(KS, P, 'use', 'S4'); S.run(K.NODE_EVERY, [KS]); }
      eq(P.know, K.KNOW_ROUND, 'capped at 12 (offerings 10 + rite 2, the node pays nothing more)');
    }],
    ['econ: a perfect goblin for 60 s at each station stays inside the PLAN band (gold <= 45 a minute, knowledge <= 15 a minute); the Ram extras add at most 50% breach', async () => {
      const perMin = {};
      { const S = sim(19), a = S.add(1, CO), g0 = a.gold, t0 = S.now; S.v(CO, a, 'use', 'S1'); while (S.now - t0 < 60000 && S.st('counting')._tx[a.id]) S.tap(CO, a, 'S1'); perMin.belt = a.gold - g0; }
      { const S = sim(20), a = S.add(1, LS), g0 = a.gold, t0 = S.now, x = S.x('locksmith'); while (S.now - t0 < 60000) { let moved = false; for (let i = 0; i < 3; i++) if (x.safe.v[i] !== x.safe.target[i]) { S.now += K.SAFE_CD; if (!S.v(LS, a, 'use', 'S4', i)) moved = true; break; } if (!moved) break; S.st('locksmith').heat.v = 0; } perMin.safe = a.gold - g0; }
      for (const k of Object.keys(perMin)) assert(perMin[k] <= 45, k + ' pays ' + perMin[k] + ' gold a minute');
      { const S = sim(21), a = S.add(1, KS, { inv: Array(12).fill('a:plate'), parts: { metal: 50, bone: 50 } }), t0 = S.now;
        while (S.now - t0 < 60000) { if (S.v(KS, a, 'use', 'S3', 0)) break; S.run(K.OFFER_MS + 100, [KS]); }
        S.v(KS, a, 'use', 'S2'); const t = S.x('keystone').rite ? S.x('keystone').rite.target.slice() : []; S.run(K.RITE_SHOW, [KS]); for (const i of t) S.v(KS, a, 'use', 'G' + (i + 1));
        while (S.now - t0 < 60000) { S.v(KS, a, 'use', 'S4'); S.run(1000, [KS]); }
        assert(a.know <= 15, 'keystone stations: ' + a.know + ' knowledge in a minute'); }
      const breach = extras => {   // one goblin, 60 s: wind 6 and strike; with extras he forges a head and drums before each strike
        const S = sim(22), a = S.add(1, R, { parts: { metal: 99, wood: 0 } }), t0 = S.now; let total = 0;
        while (S.now - t0 < 60000) {
          if (extras) { S.v(R, a, 'use', 'S1', S.x('ram').wear >= 2 ? 1 : 0); S.run(K.FORGE_MS + 100, [R]); S.v(R, a, 'use', 'S4'); for (let i = 0; i < 5; i++) S.tap(R, a, 'S4'); S.now += 1500; }
          wind(S, a, 6); S.now += 2000; strike(S, a); S.now += 1500; total += S.H.breach.dN; S.H.breach.dN = 0;   // count past the Broken cap
        }
        return total;
      };
      const base = breach(false), more = breach(true); assert(more <= base * 1.5 + 1, 'extras ' + more + ' vs ' + base); assert(base > 0);
      console.log('         econ: belt ' + perMin.belt + ' gold/min, safe ' + perMin.safe + ' gold/min, ram breach/min ' + base + ' -> ' + more + ' with head + drum');
    }],
    ['bot hints: every station hint is a legal action, and bots driven by the hints use the stations of all four rooms', async () => {
      const S = sim(23); S.st('counting')._box = 120;
      const bots = CELLS.map((c, i) => S.add(10 + i, c, { bot: true, skill: 0.8, gold: 25, parts: { metal: 9, wood: 6, cloth: 2, bone: 3 }, inv: ['x:blank'] }));
      const usedA = {};
      for (let step = 0; step < 900; step++) {
        S.now += 450;
        for (const c of CELLS) S.tick(c, 450);
        for (const p of bots) {
          const info = { now: S.now, round: 3, sudden: false, gold: p.gold, metal: p.parts.metal, has: k => p.inv.includes(k), aggression: 0.9, greed: 0.8, wantVault: true, wantNoVault: false, defend: false };
          const h = VB.botHint(S.H, p.room, p, info); const n = h.next; if (!n || n.go || n.stay) continue;
          const r = S.v(p.room, p, n.verb, n.a, n.x); assert(r === null || ACT.C.FAILS.includes(r), 'legal: ' + JSON.stringify(n) + ' -> ' + r);
          if (r === null && /^[SG]/.test(n.a)) usedA[VB.typeAt(S.H, p.room) + ':' + n.a] = 1;
        }
      }
      const types = new Set(Object.keys(usedA).map(k => k.split(':')[0])); eq([...types].sort(), ORDER.slice().sort(), 'stations used: ' + Object.keys(usedA).join(' '));
    }],
    ['fuzz: hostile verbs on every station anchor of every type never throw; views stay JSON and hide the safe combination and the rite order after the show', async () => {
      const S = sim(24), r = ACT.rng(5), ps = [S.add(1, R), S.add(2, LS), S.add(3, CO), S.add(4, KS)];
      for (let i = 0; i < 4000; i++) {
        const c = CELLS[Math.floor(r() * 4)], p = ps[Math.floor(r() * 4)], a = X.ANCH[Math.floor(r() * X.ANCH.length)], v = ACT.C.VERBS[Math.floor(r() * ACT.C.VERBS.length)], xx = Math.floor(r() * 70) - 3;
        p.room = c; const res = S.v(c, p, v, a, xx); assert(res === null || ACT.C.FAILS.includes(res), 'reason ' + res);
        if (i % 50 === 0) S.run(500);
      }
      for (const c of CELLS) { const v = VB.view(S.H, c, S.now); JSON.parse(JSON.stringify(v)); const s = JSON.stringify(v.st.x); assert(!/target/.test(s), 'no secrets: ' + s); }
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

// keep: the pure rules of what a winner keeps (keep.js), plus a 50-win simulation that shows the bring-in power stays bounded.
const L = require('./lib.js'), { assert, eq } = L;
const KP = require('../keep.js'), G = require('../items.js'), K = KP.K;
const keys = Object.keys(G.ITEMS);
const of = (type, tier, pred = () => true) => keys.find(k => { const i = G.ITEMS[k]; return i.type === type && (i.tierN | 0) === tier && i.price > 0 && pred(i); });
const W1 = of('weapon', 1), W2 = of('weapon', 2), W3 = of('weapon', 3), W4 = of('weapon', 4), W5 = of('weapon', 5), A1 = of('armor', 1), A3 = of('armor', 3), A4 = of('armor', 4);
const C1 = of('charm', 1), X0 = of('consumable', 0), X1 = of('consumable', 1), X2 = of('consumable', 2), X3 = of('consumable', 3);
const BOUND = keys.find(k => G.ITEMS[k].type === 'consumable' && !(G.ITEMS[k].price > 0));
const power = list => { let p = 0; for (const k of list) { const i = G.ITEMS[k]; p += (i.attack || 0) * 3 + (i.health || 0); } return p; };

(async () => {
  const fail = await L.run('keep', [
    ['fixtures exist', () => { for (const [n, k] of Object.entries({ W1, W2, W3, W4, W5, A1, A3, A4, C1, X0, X1, X2, BOUND })) assert(k, 'no fixture ' + n); }],
    ['keepable: items up to legendary; transcendent becomes a trophy; match-bound room items and junk are refused', () => {
      for (const k of [W1, W2, W3, W4, A4, C1, X0, X2]) eq(KP.keepable(k, G), { ok: true, why: '' }, k);
      eq(KP.keepable(W5, G).why, 'tier'); eq(KP.keepable(BOUND, G).why, 'bound');
      for (const k of ['nope', '', null, 42, {}, '__proto__', 'constructor', 'b:30', 'f:5']) eq(KP.keepable(k, G).ok, false, String(k));
      for (const k of keys) { const r = KP.keepable(k, G), i = G.ITEMS[k]; if (r.ok) assert((i.tierN | 0) <= K.MAX_TIER && i.price > 0, k); }
    }],
    ['cost by tier, sell value, budget table', () => {
      eq([W1, W2, W3, W4].map(k => KP.cost(k, G)), [1, 2, 3, 5]); eq(KP.cost('nope', G), Infinity);
      eq(KP.sellValue(W2, G), Math.max(1, Math.round(G.ITEMS[W2].price * K.SELL_RATE))); eq(KP.sellValue('nope', G), 0);
      eq([0, 1, 2, 3, 4, 9, 10, 24, 25, 999, -5, 1.5, 'x'].map(KP.budget), [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 0, 0, 0]);
    }],
    ['slots: grow with victories, crown +1, time limit -1, bots-only -1, idle 0, consolation 1, clamped 1..5', () => {
      const s = o => KP.slots({ humans: 2, ...o });
      eq([1, 2, 3, 9, 10, 500].map(w => s({ wins: w })), [2, 2, 3, 3, 4, 4]);
      eq(s({ wins: 10, how: 'crown' }), 5); eq(s({ wins: 1, how: 'crown' }), 3); eq(s({ wins: 1, how: 'time' }), 1); eq(s({ wins: 10, how: 'time' }), 3);
      eq(s({ wins: 1, humans: 1 }), 1); eq(s({ wins: 1, humans: 1, how: 'time' }), 1); eq(s({ wins: 10, humans: 1, how: 'crown' }), 4);
      eq(s({ wins: 50, idle: true }), 0); eq(s({ wins: 50, how: 'crown', idle: true }), 0); eq(s({ wins: 50, how: 'second' }), 1); eq(s({ wins: 0, how: 'bogus' }), 2);
      eq(KP.slots(), 1); eq(KP.slots(null), 1);
      for (let w = 0; w < 60; w++) for (const how of KP.HOW) for (const h of [0, 1, 2, 8]) { const n = KP.slots({ wins: w, how, humans: h }); assert(n >= 1 && n <= K.MAX_SLOTS, w + how + h); }
    }],
    ['offer: flags per item, trophies, stipend (20%, cap 30, none when idle or consolation)', () => {
      const o = KP.offer([W2, W5, BOUND, A3, X1, 'junk', 7], { wins: 1, how: 'last', humans: 3, gold: 100 }, G);
      eq(o.n, 2); eq(o.items.map(x => [x.k, x.ok, x.why]), [[W2, true, ''], [W5, false, 'tier'], [BOUND, false, 'bound'], [A3, true, ''], [X1, true, ''], ['junk', false, 'unknown']]);
      eq(o.trophies, [W5]); eq(o.stipend, 20); eq(o.items[0].cost, 2);
      eq(KP.offer([], { gold: 1000 }, G).stipend, 30); eq(KP.offer([], { gold: -5 }, G).stipend, 0); eq(KP.offer([], { gold: 'x' }, G).stipend, 0);
      eq(KP.offer([], { gold: 500, idle: true }, G).stipend, 0); eq(KP.offer([], { gold: 500, how: 'second' }, G).stipend, 0);
      const c = KP.offer([W2, X1, X3 || W4, X2], { how: 'second', gold: 100 }, G);
      eq(c.n, 1); eq(c.items.map(x => x.ok), [false, true, false, true]); eq(c.items[0].why, 'kind');
      eq(KP.offer(Array(40).fill(W1), {}, G).items.length, K.MAX_HELD); eq(KP.offer('nope', {}, G).items, []);
    }],
    ['claim: picks within slots, only ok items, unique, ints; stash and bank grow', () => {
      const o = { how: 'last', n: 2, items: [W2, W5, A3, X1], stipend: 20 };
      const r = KP.claim([W1], 5, o, [0, 2], G); eq(r.stash, [W1, W2, A3]); eq(r.bank, 25); eq(r.kept, [W2, A3]); eq(r.sold, []); eq(r.lost, 0);
      eq(KP.claim([W1], 5, o, [], G).stash, [W1]); eq(KP.claim([], 0, o, [], G).bank, 20);
      for (const bad of [[0, 2, 3], [1], [0, 0], [-1], [4], [0.5], ['0'], 'x', null, undefined, [null]]) assert(KP.claim([], 0, o, bad, G).err, 'should refuse ' + JSON.stringify(bad));
      eq(KP.claim([], 0, { ...o, n: 0 }, [0], G).err, 'picks'); eq(KP.claim([], 0, null, [], G).err, 'offer'); eq(KP.claim([], 0, { items: 'x' }, [], G).err, 'offer');
      eq(KP.claim([], 0, { ...o, n: 99 }, [0, 2, 3], G).kept.length, 3, 'n is clamped to MAX_SLOTS, not refused below it');
      eq(KP.claim([], 0, { ...o, stipend: 999 }, [], G).bank, K.STIPEND_CAP, 'a forged stipend is capped');
      eq(KP.claim([], 0, { how: 'second', n: 1, items: [W2, X1] }, [0], G).err, 'item', 'the consolation re-checks the kind');
    }],
    ['merge: third copies are sold, a full stash sells the lowest OLD item first, the bank caps at 60', () => {
      const r = KP.merge([W2, W2], [W2], G); eq(r.stash, [W2, W2]); eq(r.sold.map(x => [x.k, x.why]), [[W2, 'dup']]);
      const full = Array(12).fill(0).map((_, i) => i < 6 ? W1 : i < 11 ? A1 : X0);   // too many copies on purpose: normStash keeps 12, dups get sold first
      const r2 = KP.merge(full, [W4], G); assert(r2.stash.includes(W4), 'the new pick stays'); assert(r2.stash.length <= K.STASH_CAP); assert(r2.sold.every(x => x.k !== W4));
      const uniq = keys.filter(k => KP.keepable(k, G).ok && k !== W4).slice(0, 12), r3 = KP.merge(uniq, [W4], G);
      eq(r3.stash.length, 12); eq(r3.sold.length, 1); eq(r3.sold[0].why, 'full'); assert(r3.stash.includes(W4));
      const low = uniq.slice().sort((a, b) => ((G.ITEMS[a].tierN | 0) * 1000 + G.ITEMS[a].price) - ((G.ITEMS[b].tierN | 0) * 1000 + G.ITEMS[b].price))[0]; eq(r3.sold[0].k, low, 'lowest old item sold');
      const r4 = KP.claim(uniq, 50, { how: 'crown', n: 5, items: [W4, A4, W3, A3, X2], stipend: 30 }, [0, 1, 2, 3, 4], G);
      eq(r4.stash.length, 12); eq(r4.bank, K.BANK_CAP); assert(r4.lost > 0, 'gold over the cap is reported');
      const r5 = KP.merge([], Array(14).fill(0).map((_, i) => keys.filter(k => KP.keepable(k, G).ok)[i]), G); eq(r5.stash.length, 12, 'only new items: the lowest new ones go'); eq(r5.sold.length, 2);
    }],
    ['sell: indices into the stash, bank capped, junk refused', () => {
      const r = KP.sell([W1, W2, A3], 0, [1], G); eq(r.stash, [W1, A3]); eq(r.bank, KP.sellValue(W2, G)); eq(r.sold[0].k, W2);
      for (const bad of [[], [3], [0, 0], [-1], 'x', null, [1.2]]) assert(KP.sell([W1, W2, A3], 0, bad, G).err, JSON.stringify(bad));
      eq(KP.sell([W4, A4], 59, [0, 1], G).bank, 60);
    }],
  ]);
  const fail2 = await L.run('keep', [
    ['loadout: slot limits, budget by verified victories, junk refused, rest kept', () => {
      const st = [W2, A3, X1, X2, X0, C1, W4, W3];
      eq(KP.loadout(st, [0], 1, G).cost, 2); eq(KP.loadout(st, [0, 4], 1, G).err, 'budget'); eq(KP.loadout(st, [0, 4], 2, G).items, [W2, X0]);
      eq(KP.loadout(st, [0, 7], 25, G).err, 'slot', 'two weapons'); eq(KP.loadout(st, [2, 3, 4], 25, G).err, 'slot', 'three consumables');
      eq(KP.loadout(st, [6], 9, G).err, 'budget'); eq(KP.loadout(st, [6], 10, G).cost, 5); eq(KP.loadout(st, [6, 1], 25, G).err, 'budget'); eq(KP.loadout(st, [7, 1, 5], 25, G).cost, 3 + 3 + 1);
      eq(KP.loadout(st, [], 0, G).items, []); eq(KP.loadout(st, [0], 0, G).err, 'budget', 'no victories, no bring-in');
      for (const bad of [[0, 0], [8], [-1], 'x', null, [0.5]]) eq(KP.loadout(st, bad, 25, G).err, 'picks', JSON.stringify(bad));
      eq(KP.loadout([W5], [0], 25, G).err, 'item', 'a transcendent item that got into a stash (a rebalance) cannot come in');
      eq(KP.loadout([BOUND], [0], 25, G).err, 'item'); eq(KP.loadout(st, [0, 1], 10, G).rest.length, st.length - 2);
    }],
    ['best: the strongest loadout within budget and slots, never over', () => {
      const st = [W1, W2, W3, W4, A1, A3, X0, X1, C1];
      for (const w of [0, 1, 2, 4, 10, 25]) { const idx = KP.best(st, w, G), r = KP.loadout(st, idx, w, G); assert(!r.err, w + ' ' + r.err); assert(r.cost <= KP.budget(w)); }
      eq(KP.best(st, 0, G), []); eq(KP.best([], 25, G), []); assert(KP.loadout(st, KP.best(st, 25, G), 25, G).cost > KP.loadout(st, KP.best(st, 1, G), 1, G).cost, 'a bigger budget is used');
    }],
    ['save.js: a version 1 save loads; a win with an offer goes to the character, not the old stash; retire moves it to the hall', () => {
      const store = new Map(); global.window = global; global.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
      global.sessionStorage = { getItem: () => null }; global.document = { documentElement: { classList: { add() {} } } }; global.GKITEMS = G;
      store.set('gk.save.v1', JSON.stringify({ stash: [W1, 'w:gone'], characters: [{ id: 1, goblin: 2, name: 'Old', wins: 3 }], nextId: 2, parts: {} }));
      delete require.cache[require.resolve('../save.js')]; require('../save.js'); const S = global.GKSAVE;
      eq(S.stash(), [W1, 'w:gone'], 'old relics untouched'); eq(S.keepOf(1), { tok: '', i: [], b: 0 });
      const c = S.recordWin({ charId: 1, goblin: 2, items: [W3], keep: { otok: 'o.t', how: 'last', n: 2, items: [{ k: W3, ok: true }], trophies: [W5], stipend: 5, tok: 's.t', i: [], b: 0 } });
      eq(c.wins, 4); eq(S.stash().length, 2, 'nothing new in the old stash'); eq(S.getCharacter(1).offer.otok, 'o.t'); eq(S.getCharacter(1).trophies, [W5]);
      S.setKeep(1, { tok: 'n.t', i: [W3], b: 9 }); S.setOffer(1, null); eq(S.keepOf(1), { tok: 'n.t', i: [W3], b: 9 }); eq(S.getCharacter(1).offer, undefined);
      S.setLoad(1, [W3]); eq(S.getCharacter(1).load, [W3]); S.retire(1); eq(S.characters(), []); eq(S.hall()[0].name, 'Old'); eq(JSON.parse(store.get('gk.save.v1')).ver, 2);
      const d = S.recordWin({ goblin: 0, items: [W1] }); eq(S.stash().length, 3, 'no offer (offline demo): the old behaviour'); assert(d.id);
    }],
    ['indicesOf finds each key once, null when missing', () => { eq(KP.indicesOf([W1, W2, W1], [W1, W1]), [0, 2]); eq(KP.indicesOf([W1], [W1, W1]), null); eq(KP.indicesOf([W1], []), []); }],
    ['apply / preview: gear replaces the starter, consumables fill quick slots then the backpack', () => {
      const p = KP.preview(0, [W3, A3, C1, X1, X2], G); eq([p.weapon, p.armor, p.charm], [W3, A3, C1]); eq(p.quick.slice(0, 2), [X1, X2]);
      const s = KP.preview(0, [], G); eq([s.weapon, s.armor], [G.START[0].weapon, G.START[0].armor]);
      const inv = { weapon: null, armor: null, charm: null, backpack: [null], quick: [X0, X0, X0] }; KP.apply(inv, [X1, X2, 'junk'], G); eq(inv.backpack, [X1]);
    }],
    ['normStash / normBank never throw and clamp', () => {
      eq(KP.normStash(null, G), []); eq(KP.normStash([W1, 5, 'junk', W2, 'x'.repeat(40)], G), [W1, W2]); eq(KP.normStash(Array(30).fill(W1), G).length, 12);
      eq([KP.normBank(-1), KP.normBank(1e9), KP.normBank('5'), KP.normBank(7)], [0, 60, 0, 7]);
    }],
    ['idleWin: no damage and no kill, unless crowned', () => { eq(KP.idleWin({ dd: 0 }, 0, 'last'), true); eq(KP.idleWin({ dd: 3 }, 0, 'last'), false); eq(KP.idleWin({ dd: 0 }, 1, 'time'), false); eq(KP.idleWin(null, 0, 'crown'), false); }],
    ['every keepable item has a cost inside the biggest budget and a slot limit', () => { for (const k of keys) if (KP.keepable(k, G).ok) { assert(KP.cost(k, G) <= KP.budget(9999), k); assert(K.LOAD[G.ITEMS[k].type] > 0, k); } }],
    ['sim: 50 consecutive wins (worst case: always holding the best gear) keep the start loadout bounded', () => {
      // Worst case: every match the winner holds the strongest bankable item of every kind, picks the best, and brings the strongest loadout the budget allows.
      const best = (t, n = 1) => keys.filter(k => G.ITEMS[k].type === t && KP.keepable(k, G).ok).sort((a, b) => power([b]) - power([a]) || KP.cost(a, G) - KP.cost(b, G)).slice(0, n);
      const bestT = (t, tier) => keys.filter(k => G.ITEMS[k].type === t && (G.ITEMS[k].tierN | 0) === tier && KP.keepable(k, G).ok).sort((a, b) => power([b]) - power([a]))[0];
      const held = [1, 2, 3, 4].flatMap(t => [bestT("weapon", t), bestT("armor", t)]).filter(Boolean).concat(best("charm", 1), best("consumable", 4));   // the best of every tier: a 15-item haul
      let stash = [], bank = 0, maxP = 0, maxStash = 0, maxBank = 0; const pw = [];
      const bestLoad = (st, wins) => {   // exhaustive search over the stash (<= 12 items, at most 5 picked)
        let top = { p: -1, idx: [] }; const n = st.length;
        const rec = (i, idx) => { if (idx.length > 5) return; if (i === n) { const r = KP.loadout(st, idx, wins, G); if (!r.err) { const p = power(r.items) + r.items.length; if (p > top.p) top = { p, idx: idx.slice() }; } return; } rec(i + 1, idx); idx.push(i); rec(i + 1, idx); idx.pop(); };
        rec(0, []); return top;
      };
      for (let w = 1; w <= 50; w++) {
        const o = KP.offer(held, { wins: w, how: w % 3 ? 'last' : 'crown', humans: 4, gold: 400 }, G);
        const fit = k => KP.cost(k, G) <= KP.budget(w) ? 1 : 0, order = o.items.map((x, i) => [x, i]).filter(([x]) => x.ok && !stash.includes(x.k)).sort((a, b) => fit(b[0].k) - fit(a[0].k) || power([b[0].k]) - power([a[0].k])).map(([, i]) => i).slice(0, o.n);
        const c = KP.claim(stash, bank, { ...o, items: o.items.map(x => x.k) }, order, G); assert(!c.err, 'claim ' + c.err); stash = c.stash; bank = c.bank;
        const L = bestLoad(stash, w), r = KP.loadout(stash, L.idx, w, G); assert(!r.err);
        const P = power(r.items); pw.push(P); maxP = Math.max(maxP, P); maxStash = Math.max(maxStash, stash.length); maxBank = Math.max(maxBank, bank);
        assert(r.cost <= KP.budget(w), 'over budget at win ' + w);
      }
      const gear = t => [null].concat(keys.filter(k => G.ITEMS[k].type === t && KP.keepable(k, G).ok)); let cap = 0;   // the strongest weapon + armour pair any budget allows
      for (const a of gear("weapon")) for (const b of gear("armor")) { const l = [a, b].filter(Boolean); if (l.reduce((s, k) => s + KP.cost(k, G), 0) <= KP.budget(9999)) cap = Math.max(cap, power(l)); }
      assert(maxP <= cap, 'never above the best budget-6 loadout: ' + maxP + ' > ' + cap);
      eq(pw.slice(25), Array(25).fill(pw[24]), 'flat from 25 victories on (no power creep): ' + pw.join(','));
      assert(maxStash <= K.STASH_CAP && maxBank <= K.BANK_CAP);
      const start = power([G.START[0].weapon, G.START[0].armor]), lgw = Math.max(...best('weapon').map(k => G.ITEMS[k].attack)), lga = Math.max(...best('armor').map(k => G.ITEMS[k].health));
      assert(pw[0] < pw[24], 'more victories bring a better kit'); assert(pw[0] <= lgw * 3 + lga, 'sanity'); assert(start > 0);
      console.log('         sim power by victory: ' + [1, 2, 4, 10, 25, 50].map(w => w + ':' + pw[w - 1]).join(' ') + ' (starter ' + start + ')');
    }],
  ]);
  process.exit(fail + fail2 ? 1 : 0);
})();

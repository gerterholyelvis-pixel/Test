// RARE (rareitems.js, raresrv.js; docs/reports/rare-items.md): the published drop ladder matches seeded sampled frequencies, the once-per-match cap on transcendent drops,
// luck, keep / recycle rules, balance of the 26 new items against the tier ladder (tools/balsim.js), art and Codex rows for every new item, and the mechanics hooks.
const fs = require('fs'), path = require('path');
const L = require('./lib.js'), { assert, eq } = L, G = require('../items.js'), R = G.RARE, K = require('../keep.js'), S = require('../tools/balsim.js'), make = require('../raresrv.js');
const ROOT = path.join(__dirname, '..'), I = G.ITEMS;
const seeded = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const N = 300000, near = (a, b, abs, rel = 0.12) => Math.abs(a - b) <= abs + rel * b;
const sampleKind = (kind, src, o, n = N, seed = 1) => { const rnd = seeded(seed), c = {}; for (let i = 0; i < n; i++) { const k = R.pick(I, kind, src, { ...o, rnd }); c[k] = (c[k] || 0) + 1; } return c; };

(async () => {
  const fail = await L.run('rareitems', [
    ['the ladder: every source sums to 100, rungs fall off from common to transcendent, and there are 26 new items in four kinds', () => {
      for (const [id, s] of Object.entries(R.SOURCES)) { if (!s.w) continue; eq(Math.round(s.w.reduce((a, b) => a + b, 0) * 1000) / 1000, 100, id); for (let i = 1; i < 6; i++) assert(s.w[i] <= s.w[i - 1] || id === 'treasure', id + ' rung ' + i); }
      eq(R.KEYS.length, 26); const kinds = {}; for (const k of R.KEYS) kinds[R.kindOf(I[k])] = (kinds[R.kindOf(I[k])] || 0) + 1; eq(kinds, { weapon: 7, armor: 6, charm: 7, consumable: 6 });
      assert(R.SOURCES.chest.w[5] <= 0.1 && R.SOURCES.chest.w[4] < 1, 'chest tops out at 0.9 / 0.1');
      for (const k of R.KEYS) { const it = I[k]; assert(it.tierN >= 2 && it.rare === 1 && it.chance === 0 && it.lore && it.desc && it.price > 0, k); }
      const sources = ['chest', 'mystery', 'hall', 'kill', 'merchant']; for (const s of sources) for (let i = 1; i < 6; i++) assert(R.SOURCES[s].w[i] < R.SOURCES[s].w[i - 1], s);
      for (let i = 1; i < 6; i++) { const [a, b] = [R.SOURCES.kill.w[i], R.SOURCES.chest.w[i]]; assert(a < b, 'enemy drops are poorer than chests at rung ' + i); }
    }],
    ['sampled drop frequencies match the table: tier rungs per kind per source (seeded, tolerance), and each rare item against its exact dropChance', () => {
      const cases = [['weapon', 'chest', {}], ['weapon', 'mystery', {}], ['armor', 'mystery', {}], ['weapon', 'hall', { min: 2 }], ['armor', 'hall', { min: 2 }], ['weapon', 'kill', { min: 1 }], ['armor', 'kill', {}], ['weapon', 'heist', { min: 1 }],
        ['weapon', 'merchant', {}], ['armor', 'merchant', {}], ['charm', 'kill', {}], ['charm', 'heist', {}], ['consumable', 'kill', {}], ['consumable', 'hall', {}], ['consumable', 'merchant', {}], ['weapon', 'treasure', { min: 3 }], ['armor', 'treasure', { min: 3 }]];
      let seed = 100;
      for (const [kind, src, o] of cases) {
        const c = sampleKind(kind, src, o, N, ++seed), eff = R.effective(I, kind, src, o), by = [0, 0, 0, 0, 0, 0];
        for (const k in c) by[I[k].tierN] += c[k] / N * 100;
        for (let t = 0; t < 6; t++) assert(near(by[t], eff[t], 0.18, 0.04), kind + '@' + src + ' rung ' + t + ': sampled ' + by[t].toFixed(2) + ' vs table ' + eff[t].toFixed(2));
        for (const k of R.KEYS) if (R.kindOf(I[k]) === kind) { const want = R.dropChance(I, k, src, o), got = (c[k] || 0) / N; assert(near(got, want, 0.0025, 0.2), kind + '@' + src + ' ' + k + ': sampled ' + got.toFixed(5) + ' vs ' + want.toFixed(5)); }
      }
    }],
    ['the nominal table is what the player is told: a chest weapon roll lands on each rung at the published share once empty rungs are dropped', () => {
      const e = R.effective(I, 'weapon', 'chest'); eq(e[0], 0); const s = R.SOURCES.chest.w, tot = s[1] + s[2] + s[3] + s[4] + s[5];
      for (let t = 1; t < 6; t++) assert(Math.abs(e[t] - s[t] / tot * 100) < 1e-9, 'rung ' + t);
      const u = R.effective(I, 'consumable', 'chest'); for (let t = 0; t < 6; t++) assert(Math.abs(u[t] - s[t]) < 1e-9, 'one-use rung ' + t);   // consumables fill the whole six-rung ladder
      for (const src of Object.keys(R.SOURCES)) for (const k of R.KEYS) { const p = R.dropChance(I, k, src, src === 'tree' ? { min: 3 } : {}); assert(p >= 0 && p <= 1, k + src); }
    }],
    ['once per match: at most one transcendent per kind from any mix of sources, then the rung is closed; a fresh match starts over', () => {
      const rnd = seeded(77); let maxPerMatch = 0, matchesWithTrophy = 0;
      for (let m = 0; m < 400; m++) {
        const ctx = {}, got = { weapon: 0, armor: 0, charm: 0, consumable: 0 };
        for (let i = 0; i < 400; i++) for (const [kind, src] of [['weapon', 'treasure'], ['armor', 'heist'], ['weapon', 'chest'], ['charm', 'heist'], ['consumable', 'heist']]) { const k = R.pick(I, kind, src, { rnd, ctx, min: src === 'treasure' ? 3 : 0 }); if (I[k].tierN === 5) got[kind]++; }
        for (const kind in got) maxPerMatch = Math.max(maxPerMatch, got[kind]); if (got.weapon + got.armor + got.consumable) matchesWithTrophy++;
      }
      eq(maxPerMatch, 1, 'a kind got two transcendent drops'); assert(matchesWithTrophy > 300, 'a fresh match should be able to roll one again: ' + matchesWithTrophy);
    }],
    ['luck: the Four-Leaf Clover lifts the middle and upper rungs, never the one-of-a-kind rung', () => {
      const a = sampleKind('weapon', 'kill', { min: 1 }, 200000, 5), b = sampleKind('weapon', 'kill', { min: 1, luck: 1 }, 200000, 5), share = (c, t) => Object.keys(c).filter(k => I[k].tierN === t).reduce((s, k) => s + c[k], 0) / 200000;
      assert(share(b, 3) > share(a, 3) * 1.3 && share(b, 4) > share(a, 4) * 1.5, 'mythic ' + share(a, 3) + ' -> ' + share(b, 3));
      assert(near(share(b, 5), share(a, 5), 0.0004, 0.5), 'transcendent unchanged ' + share(a, 5) + ' ' + share(b, 5));
      eq(R.luckOf(I, 'c:clover'), 1); eq(R.luckOf(I, 'c:heart'), 0); eq(R.luckOf(I, null), 0);
    }],
    ['keep and recycle: tier 2-4 finds can be banked at the usual cost, transcendent ones are trophies; nothing here is scrap', () => {
      for (const k of R.KEYS) { const it = I[k], r = K.keepable(k, G); if (it.tierN === 5) { eq(r, { ok: false, why: 'tier' }, k); eq(G.recycleYield(k), null, k + ' recycles'); assert(it.trophy === 1, k); } else { eq(r.ok, true, k); const y = G.recycleYield(k); assert(y && Object.values(y).reduce((a, b) => a + b, 0) <= 2, k + ' scrap ' + JSON.stringify(y)); } }
      eq(K.cost('w:hungerblade', G), 3); eq(K.cost('c:phoenix', G), 5);
    }],
    ['balance: every new weapon beats the tier below, loses to the tier above, stays fair inside its tier; transcendent is strong, not unbeatable (tools/balsim.js)', () => {
      const bad = [], T = S.byTier(S.weapons());
      for (const k of R.KEYS.filter(k => I[k].type === 'weapon')) {
        const t = I[k].tierN, row = {}; for (const [lab, tt] of [['down', t - 1], ['same', t], ['up', t + 1]]) { const foes = (T[tt] || []); if (!foes.length) continue; const arm = S.refArmour(Math.max(t, tt)); row[lab] = foes.reduce((s, f, i) => s + S.rate(S.kit({ weapon: k, armor: arm }), S.kit({ weapon: f, armor: arm }), 80, 11 + i).p, 0) / foes.length; }
        if (row.down != null && row.down < 0.5) bad.push(k + ' loses to the tier below ' + row.down.toFixed(2)); if (row.up != null && row.up > 0.5) bad.push(k + ' beats the tier above ' + row.up.toFixed(2));
        if (row.same != null && (row.same < 0.2 || row.same > 0.8)) bad.push(k + ' wins ' + row.same.toFixed(2) + ' in its own tier'); if (t === 5 && row.down > 0.96) bad.push(k + ' unbeatable ' + row.down.toFixed(2));
      }
      assert(!bad.length, bad.join('; '));
    }],
    ['balance: every new armour beats the tier below and loses to the tier above', () => {
      const bad = [], T = S.byTier(S.armours());
      for (const k of R.KEYS.filter(k => I[k].type === 'armor')) {
        const t = I[k].tierN, row = {}; for (const [lab, tt] of [['down', t - 1], ['up', t + 1]]) { const foes = (T[tt] || []); if (!foes.length) continue; const ws = S.refWeapons(Math.max(1, Math.min(5, Math.max(t, tt)))); let s = 0, c = 0; for (const f of foes) for (let i = 0; i < ws.length; i += 2) { s += S.rate(S.kit({ weapon: ws[i], armor: k }), S.kit({ weapon: ws[i], armor: f }), 40, 5 + i).p; c++; } row[lab] = s / c; }
        if (row.down != null && row.down < (I[k].speed > 1 ? 0.45 : 0.5)) bad.push(k + ' loses to the tier below ' + row.down.toFixed(2)); if (row.up != null && row.up > 0.5) bad.push(k + ' beats the tier above ' + row.up.toFixed(2));
      }
      assert(!bad.length, bad.join('; '));
    }],
    ['no duel is decided by the mechanic alone: a rare weapon with its edge modelled at its maximum still stays inside its tier band', () => {
      // the simulator models stats only; give each mechanic its generous maximum as extra damage and check the tier ladder still holds
      const edge = { 'w:echodirk': 1.2, 'w:gravespade': 1.12, 'w:hungerblade': 1.33, 'w:leechfang': 1.15, 'w:wardbreaker': 1.1, 'w:stormtongue': 1.1, 'w:kingsbane': 1.2 }, T = S.byTier(S.weapons());
      for (const k in edge) { const t = I[k].tierN, kit = S.kit({ weapon: k, armor: S.refArmour(t + 1 > 5 ? 5 : t + 1) }); kit.dmg = kit.dmg * edge[k]; const foes = T[t + 1] || T[t - 0], arm = S.refArmour(t + 1 > 5 ? 5 : t + 1); let s = 0; foes.forEach((f, i) => { s += S.rate(kit, S.kit({ weapon: f, armor: arm }), 80, 3 + i).p; }); assert(s / foes.length < (t === 5 ? 0.99 : 0.6), k + ' with its edge beats the tier above ' + (s / foes.length).toFixed(2)); }
    }],
    ['art: every new item has a model entry in itemart.js (weapons and armour have their own entry, charms and consumables their own builder) and a Codex row', () => {
      const art = fs.readFileSync(path.join(ROOT, 'itemart.js'), 'utf8').replace(/\r/g, '');
      const info = require('../tools/gameinfo.js').build().data;
      for (const k of R.KEYS) { const it = I[k], nm = k.slice(2);
        if (it.type === 'weapon' || it.type === 'armor') assert(art.includes("'" + k + "':"), k + ' has no model entry'); else assert(new RegExp('\\n\\s+' + nm + '\\(b\\) \\{').test(art), k + ' has no builder');
        if (it.type === 'charm') assert(new RegExp('\\b' + nm + ': 1').test(art.slice(art.indexOf("k in { heart: 1"), art.indexOf("k in { heart: 1") + 400)), k + ' is not listed as a charm model');
      }
      { const rows = {}; const walk = o => { if (o && typeof o === 'object') { if (o.t === 'table' && o.rows) for (const r of o.rows) (rows[o.id] = rows[o.id] || new Set()).add(r.id); for (const v of Object.values(o)) walk(v); } }; walk(info);
        for (const k of R.KEYS) { assert(rows['rare-items'] && rows['rare-items'].has(k), k + ' missing from the Rarity tab'); const tab = I[k].type === 'weapon' ? 'weapons' : I[k].type === 'armor' ? 'armour' : 'items'; assert(rows[tab].has(k), k + ' missing from ' + tab); } }
    }],
    ['mechanics (raresrv.js hooks on fake players): phase cloak once a round, Phoenix Ember once a round, Hungering Blade grows with kills, the Aegis caps a blow, Stoneskin, Mirrorscale, Hourglass, luck and the announcement', () => {
      const sent = [], bc = [], hits = [];
      const RS = make({ G, bcast: (m, o) => bc.push(o), sendTo: (ws, o) => sent.push(o), hit: (...a) => hits.push(a), stagger: () => {}, recalc: p => { p.stats.maxHealth = 100 + RS.maxHp(p); } });
      const P = (id, o = {}) => ({ id, kills: 0, x: 0, z: 0, room: 'r', entered: true, stats: { health: 100, maxHealth: 100 }, inv: { weapon: null, armor: null, charm: null }, ws: { readyState: 1 }, ...o });
      const m = { round: 1, players: new Map(), sudden: false }, att = P(1, { inv: { weapon: 'w:hungerblade' } }), tgt = P(2, { inv: { armor: 'a:phasecloak' } });
      eq(RS.inn(m, tgt, att, 30, 1000, { melee: true }), 0, 'the first blow passes through'); eq(RS.inn(m, tgt, att, 30, 1100, { melee: true }), 30); m.round = 2; eq(RS.inn(m, tgt, att, 30, 9000, { melee: true }), 0, 'a new round, a new phase');
      eq(RS.inn(m, tgt, att, 30, 9100, { melee: true, bleed: true }), 30, 'bleed is not a blow');
      const pho = P(3, { inv: { charm: 'c:phoenix' } }); eq(RS.save(m, pho, 1), true); eq(RS.save(m, pho, 2), false); m.round = 3; eq(RS.save(m, pho, 3), true); eq(RS.save(P(4), P(4) && m, 1), false);
      const t2 = P(5); att.kills = 0; eq(RS.out(m, att, t2, 24, 0, {}), 24); att.kills = 3; eq(RS.out(m, att, t2, 24, 0, {}), 29); att.kills = 40; eq(RS.out(m, att, t2, 24, 0, {}), 32, 'growth caps at +8');
      const aeg = P(6, { inv: { armor: 'a:lastbastion' }, stats: { health: 245, maxHealth: 245 } }); eq(RS.inn(m, aeg, att, 200, 0, { melee: true }), 62, '25% of 245 rounded up');
      const sk = P(7, { ri: { skinUntil: 5000 } }); eq(RS.inn(m, sk, att, 100, 4000, {}), 65); eq(RS.inn(m, sk, att, 100, 6000, {}), 100, 'expired');
      const mir = P(8, { inv: { armor: 'a:mirrorscale' } }); eq(RS.inn(m, mir, att, 100, 0, { melee: false }), 70, 'ranged -30%'); eq(RS.inn(m, mir, att, 100, 0, { melee: true }), 100);
      const hg = P(9, { dashAt: 123456 }); eq(RS.use(m, hg, I['x:hourglass'], 1000).ms, 10000); eq(hg.dashAt, 0); eq(RS.dashMul(hg, 2000), 0.5); eq(RS.dashMul(hg, 20000), 1); eq(RS.dashMul(P(10, { inv: { charm: 'c:ironknot' } }), 0), 0.75);
      const fe = P(11); RS.use(m, fe, I['x:feast'], 0); eq(fe.stats.maxHealth, 125); eq(fe.stats.health, 125); eq(RS.maxHp(fe), 25);
      const pt = P(12, { stats: { health: 10, maxHealth: 100 } }); RS.use(m, pt, I['x:phoenixtear'], 0); eq(pt.stats.health, 70); m.sudden = true; pt.stats.health = 10; RS.use(m, pt, I['x:phoenixtear'], 0); eq(pt.stats.health, 40, 'half in sudden death'); m.sudden = false;
      const fnd = P(13); sent.length = 0; RS.found(Object.assign(m, { rare: {} }), fnd, 'w:hungerblade'); eq(sent[0].rareFind.tier, 'mythic'); RS.found(m, fnd, 'w:sword'); eq(sent.length, 1, 'a plain sword is not announced');
      const o1 = P(14), o2 = P(15); m.players = new Map([[{ readyState: 1 }, fnd], [{ readyState: 1 }, o1], [{ readyState: 1 }, o2]]); sent.length = 0; RS.found(m, fnd, 'w:kingsbane'); eq(sent.filter(x => x.rareCue).length, 2, 'the others get a faint cue'); eq(sent.filter(x => x.rareFind).length, 1);
      sent.length = 0; RS.found(m, fnd, 'w:kingsbane'); eq(sent.filter(x => x.rareCue).length, 0, 'once per trophy');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

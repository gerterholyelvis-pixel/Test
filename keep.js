// KEEP: what a winner keeps between matches (pure rules, UMD: window.GKKEEP in the browser, module.exports in node).
// The server (server.js KEEP block) decides and signs everything; the client (keepui.js) only shows the same numbers.
// Core rule: DEATH LOSES EVERYTHING. Only a won match (or surviving to the time limit, a small consolation) adds to a goblin's stash,
// and whatever a goblin brings INTO a match is at stake like anything else it carries. See docs/reports/keep-on-win.md.
(function (root) {
  'use strict';
  const items = () => (typeof module !== 'undefined' && module.exports && typeof require === 'function') ? require('./items.js') : root.GKITEMS;
  const K = {
    V: 1,                       // rule version (goes into every token, so a later rule change can tell old tokens apart)
    STASH_CAP: 12,              // items per character stash
    DUP_CAP: 2,                 // copies of one item key per stash; a third copy is sold
    MAX_TIER: 4,                // legendary at most; a transcendent item cannot be banked, it becomes a trophy
    COST: [1, 1, 2, 3, 5],      // bring-in cost by tier 0..4
    BUDGET: [[25, 6], [10, 5], [4, 4], [2, 3], [1, 2]],   // [victories at least, loadout budget]; 0 victories = no stash
    LOAD: { weapon: 1, armor: 1, charm: 1, consumable: 2 },   // bring-in slot limits
    SLOTS: [[10, 4], [3, 3], [1, 2]],                      // [victories after this win at least, keepsakes]
    MAX_SLOTS: 5,
    STIPEND_RATE: 0.2, STIPEND_CAP: 30,                    // a winner banks 20% of the gold held, at most 30
    BANK_CAP: 60,                                          // banked gold; it comes into the next match on top of the start gold
    SELL_RATE: 0.25,                                       // selling a stash item banks a quarter of its price (at least 1)
    SECOND_TIER: 2,                                        // the consolation (alive at the end, not the winner): one consumable of this tier or lower
    OFFER_MS: 7 * 24 * 3600e3,                             // an unclaimed choice expires after a week
    MAX_HELD: 20,                                          // an offer lists at most this many held items
  };
  const HOW = ['last', 'crown', 'time', 'second'];   // last goblin standing, crowned, decided by the time limit, consolation (alive at the end, did not win)
  const TYPES = ['weapon', 'armor', 'charm', 'consumable'];
  const int = x => Number.isInteger(x) ? x : 0;
  const tierOf = it => Math.max(0, int(it && it.tierN));

  function infoOf(key, G) { G = G || items(); return typeof key === 'string' && G && G.ITEMS && Object.prototype.hasOwnProperty.call(G.ITEMS, key) ? G.ITEMS[key] : null; }
  // Can this item be banked? -> { ok, why } why: 'unknown' (not an item), 'tier' (transcendent: becomes a trophy), 'bound' (a match-only room item, price 0)
  function keepable(key, G) {
    const it = infoOf(key, G);
    if (!it || !TYPES.includes(it.type)) return { ok: false, why: 'unknown' };
    if (tierOf(it) > K.MAX_TIER) return { ok: false, why: 'tier' };
    if (!(it.price > 0)) return { ok: false, why: 'bound' };
    return { ok: true, why: '' };
  }
  const cost = (key, G) => { const it = infoOf(key, G); return it ? K.COST[Math.min(K.MAX_TIER, tierOf(it))] : Infinity; };
  const sellValue = (key, G) => { const it = infoOf(key, G); return it ? Math.max(1, Math.round((it.price || 0) * K.SELL_RATE)) : 0; };
  const value = (key, G) => { const it = infoOf(key, G); return it ? tierOf(it) * 1000 + (it.price || 0) : -1; };   // auto-sell order: lowest first
  const step = (tbl, w) => { for (const [at, v] of tbl) if (w >= at) return v; return 0; };
  function budget(wins) { return step(K.BUDGET, Math.max(0, int(wins))); }

  // How many keepsakes a goblin chooses. ctx: { wins (victories AFTER this win), how, humans (humans who played the match, the winner included), idle }
  function slots(ctx) {
    const c = ctx || {}, how = HOW.includes(c.how) ? c.how : 'last';
    if (c.idle) return 0;   // an idle or AFK win (no damage, no kill, not crowned) keeps nothing but the victory
    if (how === 'second') return 1;
    let n = step(K.SLOTS, Math.max(1, int(c.wins)));
    if (how === 'crown') n++;          // the crown is the harder win
    if (how === 'time') n--;           // decided by the time limit
    if (int(c.humans) < 2) n--;        // nobody but bots to beat
    return Math.max(1, Math.min(K.MAX_SLOTS, n));
  }
  // What each held item offers. -> [{ k, ok, why, cost }]; why adds 'kind' (the consolation takes consumables only)
  function offerItems(held, how, G) {
    const out = [];
    for (const k of Array.isArray(held) ? held : []) {
      if (out.length >= K.MAX_HELD) break;
      if (typeof k !== 'string') continue;
      const r = keepable(k, G); let ok = r.ok, why = r.why;
      if (ok && how === 'second') { const it = infoOf(k, G); if (it.type !== 'consumable' || tierOf(it) > K.SECOND_TIER) { ok = false; why = 'kind'; } }
      out.push({ k, ok, why, cost: ok ? cost(k, G) : 0 });
    }
    return out;
  }
  function stipend(gold, ctx) { const c = ctx || {}; if (c.idle || c.how === 'second') return 0; return Math.max(0, Math.min(K.STIPEND_CAP, Math.floor(Math.max(0, +gold || 0) * K.STIPEND_RATE))); }
  // Everything the server puts into an offer. held: item keys carried at the end; ctx as slots() plus gold.
  function offer(held, ctx, G) {
    const c = ctx || {}, how = HOW.includes(c.how) ? c.how : 'last', its = offerItems(held, how, G);
    return { how, n: slots({ ...c, how }), items: its, trophies: its.filter(x => x.why === 'tier').map(x => x.k), stipend: stipend(c.gold, { ...c, how }) };
  }
  // A clean stash: known item keys only, at most STASH_CAP (older entries first). Never throws.
  function normStash(raw, G) { return (Array.isArray(raw) ? raw : []).filter(k => typeof k === 'string' && k.length <= 24 && !!infoOf(k, G)).slice(0, K.STASH_CAP); }
  const normBank = b => Math.max(0, Math.min(K.BANK_CAP, int(b)));
  function pickList(picks, n, max) {   // unique integers in [0, max) and at most n of them, else null
    if (!Array.isArray(picks) || picks.length > n) return null;
    const seen = new Set();
    for (const i of picks) { if (!Number.isInteger(i) || i < 0 || i >= max || seen.has(i)) return null; seen.add(i); }
    return picks.slice();
  }
  // Merge new items into a stash with the dup and capacity rules. -> { stash, sold: [{k, g, why:'dup'|'full'}], gold }
  // Third copies of a key are sold first (the newest copy); then, while the stash is over capacity, the lowest-value OLD item goes, and only then the lowest new one.
  function merge(stash, add, G) {
    const old = normStash(stash, G).map(k => ({ k, n: 0 })), neu = add.map(k => ({ k, n: 1 })), sold = [];
    const all = old.concat(neu), cnt = {};
    const keep = [];
    for (const e of all) { cnt[e.k] = (cnt[e.k] || 0) + 1; if (cnt[e.k] > K.DUP_CAP) sold.push({ k: e.k, g: sellValue(e.k, G), why: 'dup' }); else keep.push(e); }
    while (keep.length > K.STASH_CAP) {
      let bi = -1;
      for (let i = 0; i < keep.length; i++) if (bi < 0 || keep[i].n < keep[bi].n || (keep[i].n === keep[bi].n && value(keep[i].k, G) < value(keep[bi].k, G))) bi = i;
      const e = keep.splice(bi, 1)[0]; sold.push({ k: e.k, g: sellValue(e.k, G), why: 'full' });
    }
    return { stash: keep.map(e => e.k), sold, gold: sold.reduce((s, x) => s + x.g, 0) };
  }
  // Claim an offer. o: { how, n, items (keys as offered), stipend }; picks: indices into o.items. -> { stash, bank, kept, sold, lost } or { err }
  function claim(stash, bank, o, picks, G) {
    if (!o || !Array.isArray(o.items)) return { err: 'offer' };
    const how = HOW.includes(o.how) ? o.how : 'last', its = offerItems(o.items, how, G);   // recomputed from the keys: the rules decide, not the token's flags
    const n = Math.max(0, Math.min(K.MAX_SLOTS, int(o.n)));
    const pk = pickList(picks, n, its.length); if (!pk) return { err: 'picks' };
    for (const i of pk) if (!its[i].ok) return { err: 'item' };
    const kept = pk.map(i => its[i].k), mg = merge(stash, kept, G);
    const raw = normBank(bank) + Math.max(0, Math.min(K.STIPEND_CAP, int(o.stipend))) + mg.gold, b = Math.min(K.BANK_CAP, raw);
    return { stash: mg.stash, bank: b, kept, sold: mg.sold, lost: raw - b };   // lost: gold over the bank cap
  }
  // Sell stash items (indices) into the bank. -> { stash, bank, sold, lost } or { err }
  function sell(stash, bank, idx, G) {
    const st = normStash(stash, G), pk = pickList(idx, st.length, st.length); if (!pk || !pk.length) return { err: 'picks' };
    const sold = pk.map(i => ({ k: st[i], g: sellValue(st[i], G), why: 'sold' })), raw = normBank(bank) + sold.reduce((s, x) => s + x.g, 0), b = Math.min(K.BANK_CAP, raw);
    return { stash: st.filter((_, i) => !pk.includes(i)), bank: b, sold, lost: raw - b };
  }
  // A start loadout from the stash. idx: stash indices; wins: the verified victory count. -> { items, rest, cost, budget } or { err, ... }
  function loadout(stash, idx, wins, G) {
    const st = normStash(stash, G), bud = budget(wins);
    const pk = pickList(idx, st.length, st.length); if (!pk) return { err: 'picks', budget: bud };
    const per = {}; let c = 0;
    for (const i of pk) {
      const k = st[i], r = keepable(k, G); if (!r.ok) return { err: 'item', k, budget: bud };
      const t = infoOf(k, G).type; per[t] = (per[t] || 0) + 1; if (per[t] > (K.LOAD[t] || 0)) return { err: 'slot', k, budget: bud };
      c += cost(k, G);
    }
    if (c > bud) return { err: 'budget', cost: c, budget: bud };
    return { items: pk.map(i => st[i]), rest: st.filter((_, i) => !pk.includes(i)), cost: c, budget: bud };
  }
  // Find loadout keys in a stash (the server re-checks a queued request against the stash at match start). -> indices or null
  function indicesOf(stash, keys) {
    const used = new Set(), out = [];
    for (const k of keys || []) { const i = stash.findIndex((x, j) => x === k && !used.has(j)); if (i < 0) return null; used.add(i); out.push(i); }
    return out;
  }
  // Put a loadout on a fresh inventory ({weapon, armor, charm, backpack, quick}). Gear replaces the starter piece; consumables fill quick slots, then the backpack. Returns the inventory (changed in place).
  function apply(inv, list, G) {
    for (const k of list || []) {
      const it = infoOf(k, G); if (!it) continue;
      if (it.type === 'weapon') inv.weapon = k; else if (it.type === 'armor') inv.armor = k; else if (it.type === 'charm') inv.charm = k;
      else { let i = inv.quick.indexOf(null); if (i >= 0) inv.quick[i] = k; else { i = inv.backpack.indexOf(null); if (i >= 0) inv.backpack[i] = k; } }
    }
    return inv;
  }
  // The start inventory a goblin type gets with this loadout (for the preview).
  function preview(goblin, list, G) {
    G = G || items(); const s = (G.START && G.START[goblin]) || { weapon: null, armor: null };
    const SL = G.SLOTS || { backpack: 9, quick: 3 };
    return apply({ weapon: s.weapon, armor: s.armor, charm: null, backpack: Array(SL.backpack).fill(null), quick: Array(SL.quick).fill(null) }, list, G);
  }
  // A suggestion: the strongest loadout the budget allows (exhaustive: a stash has at most 12 items). -> stash indices
  function best(stash, wins, G) {
    const st = normStash(stash, G), bud = budget(wins), val = k => { const it = infoOf(k, G); return (it.attack || 0) * 3 + (it.health || 0) + (it.type === 'charm' || it.type === 'consumable' ? 8 + 6 * tierOf(it) : 0); };
    let top = { v: 0, idx: [] };
    const rec = (i, idx, c, v) => {
      if (v > top.v) top = { v, idx: idx.slice() };
      for (let j = i; j < st.length; j++) {
        const k = st[j], cj = cost(k, G); if (c + cj > bud || !keepable(k, G).ok) continue;
        idx.push(j); if (!loadout(st, idx, wins, G).err) rec(j + 1, idx, c + cj, v + val(k)); idx.pop();
      }
    };
    rec(0, [], 0, 0); return top.idx;
  }
  // Was this win idle? (statBlock dd = damage dealt; crowned wins are never idle: standing on the dais under fire is the work)
  const idleWin = (st, kills, how) => how !== 'crown' && !((st && st.dd) > 0) && !(kills > 0);

  const api = { K, HOW, keepable, cost, sellValue, budget, slots, offerItems, offer, stipend, normStash, normBank, merge, claim, sell, loadout, indicesOf, apply, preview, idleWin, infoOf, best };
  root.GKKEEP = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

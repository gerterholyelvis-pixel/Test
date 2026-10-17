// DAILY5: daily challenges (docs/RESEARCH-game.md 11.1 and 14.1, docs/reports/research-game.md). Three per UTC day, picked from the date alone, so every
// player gets the same three (Spelunky's daily seed, Deep Rock's shared weekly assignments). Progress counts across all of today's matches, from the
// messages the game already gets ({kills}, {assist}, the stat block in {died} / {won} / {matchEnd}, the placement in {matchEnd}).
// Completing all three on consecutive days builds a streak. Cosmetic only: nothing here changes play. The offline demo is never recorded.
// UMD: the pure core (pick, fresh, event, progress) works in Node for tests; the browser part is window.GKDAILY = { onMsg, cardHtml, state }.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GKDAILY = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  // templates: k = counter, g = goals by difficulty (one is picked by the seed), t = text with {n}
  const POOL = [
    { id: 'dmg', k: 'dd', g: [250, 400, 600], t: 'Deal {n} damage' },
    { id: 'kill', k: 'kills', g: [2, 3, 5], t: 'Defeat {n} goblins' },
    { id: 'assist', k: 'assists', g: [1, 2, 3], t: 'Get {n} assists' },
    { id: 'elixir', k: 'ex', g: [20, 40, 70], t: 'Collect {n} elixir' },
    { id: 'gold', k: 'ge', g: [100, 200, 350], t: 'Earn {n} gold' },
    { id: 'round', k: 'rd', g: [3, 4, 5], t: 'Reach round {n}', max: 1 },
    { id: 'top3', k: 'top3', g: [1, 2, 3], t: 'Finish in the top 3 {n}x' },
    { id: 'match', k: 'matches', g: [2, 3, 4], t: 'Finish {n} matches' },
  ];
  const dayOf = ms => { const d = new Date(ms); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
  const prevDay = day => { const y = Math.floor(day / 10000), m = Math.floor(day / 100) % 100, d = day % 100; return dayOf(Date.UTC(y, m - 1, d) - 86400000); };
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function pick(day) {   // three distinct challenges for this UTC day: [{id, k, n, txt, max}]
    const r = rng(day * 2654435761), ids = POOL.map((_, i) => i);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids.slice(0, 3).map(i => { const p = POOL[i], n = p.g[Math.floor(r() * p.g.length)]; return { id: p.id, k: p.k, n, txt: p.t.replace('{n}', n), max: !!p.max }; });
  }
  function fresh(day, old) {   // today's state; the streak survives from the old state
    return { v: 1, day, c: {}, streak: old && old.streak | 0 || 0, full: old && old.full | 0 || 0, m: null };
  }
  function add(s, k, n, max) { n = +n || 0; if (n <= 0) return; s.c[k] = max ? Math.max(s.c[k] || 0, n) : (s.c[k] || 0) + n; }
  // one server message -> counters. s.m = the live match: { k: kills seen, done: stat block counted, placed: placement counted }
  function event(s, d) {
    if (!d) return false;
    let ch = false;
    if (d.matchStart || d.resumed) { if (!(d.resumed && s.m)) s.m = { k: 0, done: false, placed: false }; return true; }
    const m = s.m; if (!m) return false;
    if (typeof d.kills === 'number' && d.kills > m.k) { add(s, 'kills', d.kills - m.k); m.k = d.kills; ch = true; }
    if (d.assist) { add(s, 'assists', 1); ch = true; }
    const blk = d.died ? d.died.st : d.won ? d.won.st : null;
    if (blk && !m.done) { settle(s, blk); ch = true; }
    if (d.matchEnd) {
      const mine = s.me != null ? (d.matchEnd.places || []).find(p => p.id === s.me) : null;   // s.me = my id, set from {matchStart} / {resumed}
      if (!m.done) { const st = d.matchEnd.stats && s.me != null ? d.matchEnd.stats[s.me] : null; settle(s, st || {}); }
      if (mine && !m.placed && mine.place <= 3) { add(s, 'top3', 1); m.placed = true; }
      ch = true;
    }
    return ch;
  }
  function settle(s, st) {
    s.m.done = true; add(s, 'matches', 1);
    add(s, 'dd', st.dd); add(s, 'ex', st.ex); add(s, 'ge', st.ge); add(s, 'rd', st.rd, true);
  }
  function progress(s) {   // [{txt, have, n, ok}] and the streak bookkeeping (updated in place when all three are done)
    const list = pick(s.day).map(c => { const have = Math.min(c.n, s.c[c.k] || 0); return { id: c.id, txt: c.txt, have, n: c.n, ok: have >= c.n }; });
    if (list.every(c => c.ok) && s.full !== s.day) { s.streak = s.full === prevDay(s.day) ? s.streak + 1 : 1; s.full = s.day; }
    return list;
  }

  // ---- browser side
  const KEY = 'gk.daily.v1';
  let S = null;
  const demo = () => !!(root && (root.GK_OFFLINE || (root.location && /[?&]offline=1/.test(root.location.search))));
  function load(now) {
    let s = null; try { s = JSON.parse(root.localStorage.getItem(KEY) || 'null'); } catch (e) {}
    const day = dayOf(now);
    if (!s || s.v !== 1) s = fresh(day, null); else if (s.day !== day) s = fresh(day, s.full === prevDay(day) ? s : { streak: 0, full: s.full });
    return s;
  }
  const save = () => { try { root.localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  function state() { const now = Date.now(); if (!S || S.day !== dayOf(now)) S = load(now); return S; }
  function onMsg(d) {
    if (!d || demo()) return;
    const s = state();
    if (d.matchStart) s.me = d.matchStart.you; else if (d.resumed && d.you != null) s.me = d.you;
    const before = progress(s).filter(c => c.ok).length;
    if (!event(s, d)) return 0;
    const after = progress(s).filter(c => c.ok).length; save();
    return after > before ? after : 0;   // > 0: a challenge was just completed (the caller shows a toast "Daily challenge N/3")
  }
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function cardHtml() {
    if (demo()) return '';
    const s = state(), list = progress(s), ok = list.filter(c => c.ok).length;
    return '<div class="gk-daily" style="margin:10px 0 2px;text-align:left;font-size:13.5px">'
      + '<div style="display:flex;justify-content:space-between;color:#8d887f;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px"><span>Today\'s challenges ' + ok + '/3</span>'
      + (s.streak > 0 ? '<span style="color:#ffd75e">Streak ' + s.streak + (s.streak === 1 ? ' day' : ' days') + '</span>' : '') + '</div>'
      + list.map(c => '<div style="display:flex;gap:8px;align-items:center;margin:2px 0;color:' + (c.ok ? '#8be28b' : '#e9e5da') + '"><span style="flex:1">' + (c.ok ? '&#10003; ' : '') + esc(c.txt) + '</span><span style="font-variant-numeric:tabular-nums;color:#aaa59d">' + c.have + '/' + c.n + '</span></div>').join('') + '</div>';
  }
  return { POOL, dayOf, prevDay, pick, fresh, event, progress, onMsg, cardHtml, state };
});

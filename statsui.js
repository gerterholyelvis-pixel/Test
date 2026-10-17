// STATS (client): records the player's lifetime stats from the messages the game already receives, and draws the Stats screen of the title menu.
// Pure rules live in stats.js (GKSTATS); storage is GKSAVE.stats / saveStats / clearStats (save.js, key gk.stats.v1).
// Recording: game.js passes every server message to GKSTATSUI.onMsg(d). matchStart / resumed begin a match, kills, rounds, crafted, recycled, board and actMe feed the live record,
// and {died}, {won} or {matchEnd} close it (all three carry the server's tally block, see server.js STATS). A match left unfinished (tab closed, "Main menu" mid-match)
// is settled as "left early" the next time the game loads without a resumable session. The offline demo (?offline=1) is never recorded.
(function () {
  'use strict';
  const ST = window.GKSTATS; if (!ST) return;
  let S = null, me = null, lastSave = 0, timer = 0;
  const demo = () => !!window.GK_OFFLINE || /[?&]offline=1/.test(location.search);
  const resumable = () => { try { return !!sessionStorage.getItem('gk.token') && Date.now() - +sessionStorage.getItem('gk.tokenT') < 15000; } catch (e) { return false; } };
  const load = () => { try { return window.GKSAVE ? GKSAVE.stats() : ST.normalize(null); } catch (e) { return ST.normalize(null); } };
  const flush = () => { clearTimeout(timer); timer = 0; lastSave = Date.now(); if (S) try { GKSAVE.saveStats(S); } catch (e) {} };
  const persist = urgent => { if (urgent || Date.now() - lastSave > 2000) flush(); else if (!timer) timer = setTimeout(flush, 2000); };
  const get = () => S || (S = load());
  // a match that was still running when the page closed is a loss, unless the same page is about to resume it
  if (!demo()) { S = load(); if (S.live && !resumable()) { ST.finish(S, { how: 'quit' }, Date.now()); flush(); } }
  addEventListener('pagehide', () => { if (S && S.live) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && S && S.live) flush(); });

  const kindOf = r => { const H = window.GK && GK.hud5 && GK.hud5.S; return H && H.vb && H.vb[r] ? 'heist' : H && H.trees && H.trees[r] ? 'tree' : null; };
  const nameOf = id => { const f = window.GK && GK.fun && GK.fun.state && GK.fun.state.names; return f && f[id] || ''; };
  function onMsg(d) {
    if (demo() || !d) return;
    const s = get(), now = Date.now();
    if (d.matchStart) { me = d.matchStart.you; const p = (d.matchStart.players || []).find(x => x.id === me); ST.begin(s, { id: me, goblin: p ? p.goblin : 0, size: d.matchStart.size, resumed: false }, now); persist(true); return; }
    if (d.resumed) { me = d.you; const p = (d.players || []).find(x => x.id === me); ST.begin(s, { id: me, goblin: p ? p.goblin : 0, size: (d.players || []).length, resumed: true }, now); persist(true); }
    if (!s.live) { if (d.matchEnd) refine(s, d.matchEnd); else if (d.won && s.last && s.last.win) setTimeout(() => lastCard(s.last, 'win'), 60); return; }   // the winner's matchEnd closed the match already; the victory card comes after it
    if (ST.event(s, d, { kindOf }, now)) persist(!d.board);   // the board changes often (throttled); kills, crafts, claims are rare and saved at once
    if (d.died) { const k = d.died.killer; settle(s, { how: 'died', st: d.died.st, by: k ? k.name : d.died.by != null ? nameOf(d.died.by) : '' }, 'dead'); }
    else if (d.won) settle(s, { how: 'win', st: d.won.st }, 'win');
    else if (d.matchEnd) matchEnd(s, d.matchEnd);
  }
  function mineIn(e) { return (e.places || []).find(p => p.id === me); }
  function matchEnd(s, e) {
    const m = mineIn(e); if (!m) return;
    const won = e.winner && e.winner.id === me, how = won ? (e.crown ? 'crown' : 'win') : (e.crown ? 'crowned' : 'time');
    settle(s, { how, place: m.place, size: e.size, kills: m.kills, secs: m.secs, st: e.stats && e.stats[me] }, null);
  }
  function refine(s, e) {   // the match-over message after our own death card: only the placement is new
    const m = mineIn(e); if (!m || !s.last) return;
    if (ST.refine(s, s.last.mid, { place: m.place, size: e.size })) persist(true);
  }
  function settle(s, o, card) {
    const rec = ST.finish(s, o, Date.now()); persist(true);
    if (rec && card) setTimeout(() => lastCard(rec, card), 60);
  }

  // ---------- text helpers
  const N = n => (n | 0).toLocaleString();
  const dur = sec => { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + ' h ' + String(m).padStart(2, '0') + ' min' : m + ':' + String(s).padStart(2, '0'); };
  const pct = x => Math.round(x * 100) + '%';
  const ord = n => { const v = n % 100; return n + (v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); };
  const gname = i => { const g = window.GKITEMS && GKITEMS.GOBLINS && GKITEMS.GOBLINS[i]; return g ? g.name : 'Goblin ' + (i + 1); };
  const HOWTXT = { win: 'Last goblin standing', crown: 'Crowned Goblin King', time: 'Alive at the time limit', crowned: 'Another goblin took the crown', died: 'Died', quit: 'Left early' };
  const howTxt = r => r.how === 'died' && r.by ? 'Killed by ' + r.by : HOWTXT[r.how] || '';
  const when = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- compact "last match" line on the death / victory card
  function lastCard(rec, kind) {
    try {
      const card = document.querySelector('.rs .rs-card'); if (!card || card.querySelector('.st-last')) return;
      const s = get(), d = ST.derived(s), box = el('div', 'st-last');
      const a = el('div', 'st-l1'); a.append(el('span', null, 'This match'), el('b', null, (rec.win ? '1st' : rec.pl ? ord(rec.pl) : '–') + (rec.sz ? ' of ' + rec.sz : '')), el('span', null, rec.k + (rec.k === 1 ? ' kill' : ' kills')), el('span', null, howTxt(rec)));
      const b = el('div', 'st-l2', 'Lifetime: ' + N(s.tot.matches) + (s.tot.matches === 1 ? ' match' : ' matches') + ' · ' + N(s.tot.wins) + (s.tot.wins === 1 ? ' win' : ' wins') + ' (' + pct(d.winRate) + ') · K/D ' + d.kd.toFixed(2) + (s.streak > 1 ? ' · ' + s.streak + ' wins in a row' : ''));
      box.append(a, b); const btns = card.querySelector('.rs-btns'); card.insertBefore(box, btns || null);
    } catch (e) {}
  }

  // ---------- the Stats screen
  function chart(s) {
    const NS = 'http://www.w3.org/2000/svg', rows = [], max = Math.max(1, ...s.gob.map(g => g.m));
    const W = 640, L = 132, R = 74, H = 24, top = 22, h = top + 12 * H + 6, bw = W - L - R;
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + h); svg.setAttribute('class', 'st-chart'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Wins and losses for each goblin type; the table below has the same numbers');
    const add = (tag, at, text) => { const e = document.createElementNS(NS, tag); for (const k in at) e.setAttribute(k, at[k]); if (text != null) e.textContent = text; svg.appendChild(e); return e; };
    add('rect', { x: L, y: 4, width: 10, height: 10, class: 'c-w' }); add('text', { x: L + 16, y: 13, class: 'c-t' }, 'Wins');
    add('rect', { x: L + 70, y: 4, width: 10, height: 10, class: 'c-l' }); add('text', { x: L + 86, y: 13, class: 'c-t' }, 'Other results');
    s.gob.forEach((g, i) => {
      const y = top + i * H, wd = g.w / max * bw, ld = (g.m - g.w) / max * bw;
      add('text', { x: L - 10, y: y + 15, 'text-anchor': 'end', class: g.m ? 'c-n' : 'c-n off' }, gname(i));
      add('rect', { x: L, y: y + 3, width: bw, height: 16, class: 'c-bg' });
      if (g.w) add('rect', { x: L, y: y + 3, width: Math.max(2, wd), height: 16, class: 'c-w' });
      if (g.m - g.w) add('rect', { x: L + wd, y: y + 3, width: Math.max(2, ld), height: 16, class: 'c-l' });
      add('text', { x: L + wd + ld + 8, y: y + 15, class: 'c-v' }, g.m ? g.w + ' / ' + g.m : '–');
    });
    return svg;
  }
  function tile(big, label, sub) { const t = el('div', 'st-tile'); t.append(el('b', null, big), el('span', null, label)); if (sub) t.appendChild(el('i', null, sub)); return t; }
  function group(title, rows) {
    const g = el('section', 'st-g'); g.appendChild(el('h3', null, title)); const dl = el('dl', 'st-rows');
    for (const [k, v] of rows) { dl.append(el('dt', null, k), el('dd', null, v)); } g.appendChild(dl); return g;
  }
  function render(box, opts) {
    const s = get(), d = ST.derived(s), t = s.tot, b = s.best; box.textContent = '';
    opts = opts || {};
    if (!demo() && s.live && !resumable() && Date.now() - s.live.upd > 60000) { ST.finish(s, { how: 'quit' }, Date.now()); flush(); }
    if (ST.empty(s)) box.appendChild(el('div', 'note st-empty', 'No matches recorded yet. Play one and your numbers will appear here. The offline demo is not counted.'));
    const hero = el('div', 'st-hero');
    hero.append(tile(N(t.matches), 'Matches'), tile(N(t.wins), 'Wins', t.matches ? pct(d.winRate) + ' win rate' : ''), tile(N(t.kills), 'Kills', N(t.deaths) + (t.deaths === 1 ? ' death' : ' deaths')), tile(d.kd.toFixed(2), 'Kill / death'));
    box.appendChild(hero);
    const grid = el('div', 'st-grid');
    grid.append(
      group('Survival', [['Win streak', s.streak + ' (best ' + b.streak + ')'], ['Rounds survived', N(t.rounds) + ' (best ' + b.rounds + ')'], ['Average match', t.matches ? dur(d.avgSecs) : '–'], ['Longest survival', b.secs ? dur(b.secs) : '–'], ['Time played', dur(t.secs)]]),
      group('Combat', [['Damage dealt', N(t.dealt)], ['Damage taken', N(t.taken)], ['Kills per match', t.matches ? d.avgKills.toFixed(1) : '–'], ['Matches left early', N(t.quits)]]),
      group('Economy', [['Gold earned', N(t.goldEarned)], ['Gold spent', N(t.goldSpent)], ['Elixir collected', N(t.elixir)], ['Items crafted', N(t.crafted)], ['Items recycled', N(t.recycled)]]),
      group('Special rooms', [['Vault claims', N(t.vaultClaims)], ['Crown wins', N(t.crownWins)], ['Tree rooms used', N(t.trees)], ['Heists tried', N(t.heists)]]),
      group('Personal bests', [['Most kills', N(b.kills)], ['Most rounds', N(b.rounds)], ['Longest survival', b.secs ? dur(b.secs) : '–'], ['Best win streak', N(b.streak)], ['Fastest win', b.fastWin ? dur(b.fastWin) : '–'], ['Most gold in a match', N(b.gold)], ['Most damage dealt', N(b.dealt)]]));
    box.appendChild(grid);
    const fav = el('h3', 'st-h', 'Goblins'); box.appendChild(fav);
    if (d.favourite >= 0) { const f = s.gob[d.favourite], row = el('div', 'st-fav'); if (opts.portrait) try { row.appendChild(opts.portrait(d.favourite, 52)); } catch (e) {}
      const tx = el('div'); tx.append(el('span', null, 'Favourite goblin'), el('b', null, gname(d.favourite)), el('i', null, f.m + (f.m === 1 ? ' match' : ' matches') + ', ' + f.w + (f.w === 1 ? ' win' : ' wins') + ', ' + f.k + ' kills')); row.appendChild(tx); box.appendChild(row); }
    box.appendChild(chart(s));
    const tbl = el('table', 'st-tbl'), cap = el('caption', 'st-cap', 'Per goblin type'); tbl.appendChild(cap);
    const hr = el('tr'); for (const h of ['Goblin', 'Matches', 'Wins', 'Win %', 'Kills']) hr.appendChild(el('th', null, h)); const th = el('thead'); th.appendChild(hr); tbl.appendChild(th);
    const tb = el('tbody'); s.gob.forEach((g, i) => { const r = el('tr', g.m ? '' : 'off'); r.append(el('td', null, gname(i)), el('td', null, g.m), el('td', null, g.w), el('td', null, g.m ? pct(g.w / g.m) : '–'), el('td', null, g.k)); tb.appendChild(r); }); tbl.appendChild(tb);
    box.appendChild(tbl);
    box.appendChild(el('h3', 'st-h', 'Recent matches'));
    if (!s.recent.length) box.appendChild(el('div', 'st-none', 'Nothing yet.'));
    else {
      const rt = el('table', 'st-tbl st-recent'), rh = el('tr'); for (const h of ['When', 'Goblin', 'Place', 'Kills', 'Rounds', 'Ended']) rh.appendChild(el('th', null, h)); const rth = el('thead'); rth.appendChild(rh); rt.appendChild(rth);
      const rb = el('tbody'); for (const r of s.recent) { const tr = el('tr', r.win ? 'won' : ''); tr.append(el('td', null, when(r.t)), el('td', null, gname(r.g)), el('td', null, r.win ? '1st' : r.pl ? ord(r.pl) + (r.sz ? ' / ' + r.sz : '') : '–'), el('td', null, r.k), el('td', null, r.rd), el('td', null, howTxt(r))); rb.appendChild(tr); } rt.appendChild(rb); box.appendChild(rt);
    }
    box.appendChild(el('div', 'st-foot', 'Counted since ' + (s.since ? new Date(s.since).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'now') + ' on this browser. Rounds survived counts the rounds you lived through.'));
  }
  function reset() { S = null; try { GKSAVE.clearStats(); } catch (e) {} S = load(); flush(); }

  window.GKSTATSUI = { onMsg, render, reset, state: get };
})();

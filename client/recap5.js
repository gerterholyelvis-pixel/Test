// RECAP5: death recap, assist credit, kill streaks and match highlights (docs/RESEARCH-game.md sections 1, 5, 12, 13; docs/reports/research-game.md).
// Pure and DOM-free: UMD, no clock, no RNG (the caller passes `now` in ms). Shared by the server (require('./client/recap5.js')) and the browser
// (window.GKRECAP: the HTML builders for the death card, the kill feed suffix and the summary highlights).
// Server state lives on the player object as p.rc5 = { log: [{t, id, n, npc, d, w, f}], streak, best, multi, lastKill, assists, big }.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GKRECAP = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const WIN = 12000, ASSIST_MS = 10000, MULTI_MS = 4500, MAXLOG = 40, TOP = 4, STREAK_SHOW = 3;
  const F_BS = 1, F_BLEED = 2, F_HEAVY = 4, F_HIGH = 8;
  const st = p => p.rc5 || (p.rc5 = { log: [], streak: 0, best: 0, multi: 0, lastKill: 0, assists: 0, big: 0 });
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

  // a hit landed on t: dmg = real health lost, from = the attacker ({id, name, npc}), w = weapon name, o = {bs, bleed, heavy, hg}
  function note(t, from, dmg, now, w, o) {
    dmg = Math.round(num(dmg)); if (!t || !from || dmg <= 0) return;
    const s = st(t), f = (o && o.bs ? F_BS : 0) | (o && o.bleed ? F_BLEED : 0) | (o && o.heavy ? F_HEAVY : 0) | (o && o.hg ? F_HIGH : 0);
    s.log.push({ t: now, id: from.id, n: String(from.name || 'Goblin'), npc: from.npc ? 1 : 0, d: dmg, w: w ? String(w) : '', f });
    while (s.log.length > MAXLOG || (s.log.length && now - s.log[0].t > WIN)) s.log.shift();
    if (!from.npc && !(o && o.bleed)) { const a = st(from); if (dmg > a.big) a.big = dmg; }
  }
  // damage taken in the last WIN ms, grouped by attacker, most damage first
  function sources(t, now) {
    const s = t && t.rc5; if (!s) return [];
    const by = new Map();
    for (const e of s.log) {
      if (now - e.t > WIN) continue;
      let r = by.get(e.id); if (!r) { r = { id: e.id, n: e.n, npc: e.npc, w: '', d: 0, h: 0, bs: 0, bl: 0, hv: 0, hg: 0 }; by.set(e.id, r); }
      r.d += e.d; r.h++; if (e.w && !(e.f & F_BLEED)) r.w = e.w;
      if (e.f & F_BS) r.bs += e.d; if (e.f & F_BLEED) r.bl += e.d; if (e.f & F_HEAVY) r.hv += e.d; if (e.f & F_HIGH) r.hg += e.d;
    }
    return [...by.values()].sort((a, b) => b.d - a.d || a.id - b.id);
  }
  // goblins (not mystery enemies, not the killer) who hurt t within ASSIST_MS, best first
  function assists(t, killerId, now) {
    return sources(t, now).filter(r => !r.npc && r.id !== killerId && r.d > 0 && t.rc5.log.some(e => e.id === r.id && now - e.t <= ASSIST_MS));
  }
  // one teaching line for the death card (the first rule that fits)
  function tip(src, killerNpc) {
    const all = src.reduce((a, r) => a + r.d, 0); if (!all) return '';
    const gob = src.filter(r => !r.npc).length, sum = k => src.reduce((a, r) => a + r[k], 0);
    if (gob >= 2) return gob + ' goblins hit you at once. Back off through a door and fight them one at a time.';
    if (sum('bs') / all > 0.4) return 'Most of the damage came from behind. Keep a wall at your back and turn to face footsteps.';
    if (sum('bl') / all > 0.3) return 'Bleeding did a lot of it. After a whip or trident hit, break away or heal.';
    if (sum('hv') / all > 0.4) return 'Heavy blows did most of it. Step back or dash when you see the wind-up.';
    if (sum('hg') / all > 0.4) return 'Hits from higher ground deal more. Do not fight under a goblin on a crate.';
    if (killerNpc) return 'Room enemies hit hard. Go into a mystery room with full health.';
    return '';
  }
  // the {died} payload: rc = { src: [[name, weapon, dmg, hits, isKiller, npc]], tip }
  function died(t, now) {
    const src = sources(t, now), k = t.killedBy;
    const killerNpc = !!(t.killer && t.killer.npc);
    return { src: src.slice(0, TOP).map(r => [r.n, r.w, r.d, r.h, r.id === k ? 1 : 0, r.npc]), tip: tip(src, killerNpc) };
  }
  // p killed t: streaks, multi-kills, shutdowns and assists. Returns the extra kill-feed fields { a: [names], st, mk, sh } (only the ones that apply)
  // and the assisting players' ids (ax, for the server to credit; not sent).
  function kill(p, t, now) {
    const out = {};
    if (!p || !t) return out;
    const vs = st(t), ended = vs.streak; vs.streak = 0; vs.multi = 0;
    if (t.npc) return out;   // mystery enemies make no streaks and get no assists
    if (!p.npc) {
      const s = st(p); s.streak++; if (s.streak > s.best) s.best = s.streak;
      s.multi = now - s.lastKill <= MULTI_MS ? s.multi + 1 : 1; s.lastKill = now;
      if (s.streak >= STREAK_SHOW) out.st = s.streak;
      if (s.multi >= 2) out.mk = s.multi;
    }
    if (ended >= STREAK_SHOW) out.sh = ended;
    const as = assists(t, p.id, now);
    if (as.length) { out.a = as.slice(0, 2).map(r => r.n); out.ax = as.slice(0, 2).map(r => r.id); }
    return out;
  }
  function credit(p) { st(p).assists++; return st(p).assists; }
  // match highlights: rows = [{name, dd, kills, assists, best, big}] -> [[label, name, value]] (only awards somebody earned)
  function awards(rows) {
    const out = [], pick = (k, min) => rows.filter(r => num(r[k]) >= min).sort((a, b) => num(b[k]) - num(a[k]))[0];
    const a1 = pick('dd', 1); if (a1) out.push(['Most damage', a1.name, Math.round(a1.dd)]);
    const a2 = pick('best', 2); if (a2) out.push(['Best streak', a2.name, a2.best]);
    const a3 = pick('assists', 1); if (a3) out.push(['Most assists', a3.name, a3.assists]);
    const a4 = pick('big', 1); if (a4) out.push(['Biggest hit', a4.name, Math.round(a4.big)]);
    return out;
  }
  function rowOf(p) { const s = p.rc5 || {}; return { name: p.name || 'Goblin', dd: p.st5 ? p.st5.dd : 0, kills: p.kills || 0, assists: s.assists || 0, best: s.best || 0, big: s.big || 0 }; }

  // ---- browser side: small HTML builders (escaped)
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function deathHtml(rc) {
    if (!rc || !rc.src || !rc.src.length) return '';
    const all = rc.src.reduce((a, r) => a + num(r[2]), 0) || 1;
    return '<div class="gk-recap" style="margin:10px 0 2px;text-align:left;font-size:14px">'
      + '<div style="color:#8d887f;font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px">Damage taken, last 12 s</div>'
      + rc.src.map(r => '<div style="display:flex;align-items:center;gap:8px;margin:2px 0"><span style="flex:0 0 38%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:' + (r[4] ? '#ff8a7a' : '#e9e5da') + '">' + (r[4] ? '&#9760; ' : '') + esc(r[0]) + (r[1] ? ' <small style="color:#8d887f">' + esc(r[1]) + '</small>' : '') + '</span>'
        + '<span style="flex:1;height:6px;background:rgba(255,255,255,.08)"><i style="display:block;height:100%;width:' + Math.max(4, Math.round(num(r[2]) / all * 100)) + '%;background:' + (r[4] ? '#d9573f' : '#a8741a') + '"></i></span>'
        + '<b style="flex:0 0 auto;font-variant-numeric:tabular-nums">' + Math.round(num(r[2])) + '</b><small style="color:#8d887f">' + r[3] + (r[3] === 1 ? ' hit' : ' hits') + '</small></div>').join('')
      + (rc.tip ? '<div style="margin-top:6px;color:#ffd75e">' + esc(rc.tip) + '</div>' : '') + '</div>';
  }
  const MULTI = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'QUAD KILL' };
  function feedSuffix(f) {   // extra HTML after a kill-feed row: assists, streak, multi-kill, shutdown
    if (!f) return '';
    let s = '';
    if (f.a && f.a.length) s += ' <small style="color:#b9b4ae">+ ' + f.a.map(esc).join(', ') + '</small>';
    if (f.mk >= 2) s += ' <b style="color:#ff9a3a;letter-spacing:.08em">' + (MULTI[f.mk] || f.mk + 'x KILL') + '</b>';
    else if (f.st >= STREAK_SHOW) s += ' <b style="color:#ff9a3a">' + f.st + ' in a row</b>';
    if (f.sh >= STREAK_SHOW) s += ' <small style="color:#8be28b">ended a ' + f.sh + '-kill streak</small>';
    return s;
  }
  function awardsHtml(aw) {
    if (!aw || !aw.length) return '';
    return '<div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.12);display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;font-size:14px">'
      + '<span style="grid-column:1/-1;color:#8d887f;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Highlights</span>'
      + aw.map(a => '<span style="color:#aaa59d">' + esc(a[0]) + '</span><b style="font-weight:600">' + esc(a[1]) + '</b><span style="color:#ffd75e;font-variant-numeric:tabular-nums">' + esc(a[2]) + '</span>').join('') + '</div>';
  }
  return { WIN, ASSIST_MS, MULTI_MS, STREAK_SHOW, note, sources, assists, tip, died, kill, credit, awards, rowOf, deathHtml, feedSuffix, awardsHtml };
});

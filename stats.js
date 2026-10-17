// STATS: lifetime player statistics. Pure functions only (no DOM, no storage): shared by the browser (window.GKSTATS) and tests/stats.test.js.
// A stats object s = { v, since, tot:{...}, streak, best:{...}, gob:[{m,w,k} x12], recent:[last 10 records], last, live }.
//   live = the match in progress (kept in storage so a reload resumes it and a quit is settled later as a loss), last = the most recent finished record.
// Flow: begin(s, info, now) at matchStart/resume -> event(s, msg) for each server message -> finish(s, outcome, now) once (died / won / matchEnd / quit) -> refine(s, o) when a later matchEnd knows more.
// Offline demo (?offline=1) is never recorded: the client does not call begin() there (statsui.js), so demo play cannot inflate real stats.
(function (root) {
  'use strict';
  const VERSION = 1, N_GOB = 12, RECENT = 10, BIG = 1e9;
  const num = (x, max) => { x = Math.floor(+x); return Number.isFinite(x) && x > 0 ? Math.min(x, max || BIG) : 0; };
  const TOT = ['matches', 'wins', 'kills', 'deaths', 'quits', 'rounds', 'secs', 'dealt', 'taken', 'goldEarned', 'goldSpent', 'elixir', 'crafted', 'recycled', 'vaultClaims', 'crownWins', 'trees', 'heists'];
  const BEST = ['kills', 'rounds', 'secs', 'streak', 'gold', 'dealt', 'fastWin'];   // fastWin: shortest win in seconds (0 = none yet)
  const HOW = ['win', 'crown', 'time', 'crowned', 'died', 'quit'];   // win: last goblin standing; crown: crowned Goblin King; time: alive when the time limit ended; crowned: another goblin took the crown; died; quit
  const WIN_HOW = { win: 1, crown: 1 };
  const zero = keys => { const o = {}; for (const k of keys) o[k] = 0; return o; };
  const blank = now => ({ v: VERSION, since: num(now, 1e15), tot: zero(TOT), streak: 0, best: zero(BEST), gob: Array.from({ length: N_GOB }, () => ({ m: 0, w: 0, k: 0 })), recent: [], last: null, live: null });

  function cleanRec(r) {
    if (!r || typeof r !== 'object') return null;
    const how = HOW.includes(r.how) ? r.how : 'died';
    return { t: num(r.t, 1e15), g: Math.min(N_GOB - 1, num(r.g)), pl: num(r.pl, 99), sz: num(r.sz, 99), k: num(r.k, 9999), rd: num(r.rd, 99), secs: num(r.secs, 1e6), how, by: typeof r.by === 'string' ? r.by.replace(/[^\x20-\x7e]/g, '').slice(0, 24) : '', win: WIN_HOW[how] ? 1 : 0, mid: num(r.mid, 1e15) };
  }
  function cleanLive(l) {
    if (!l || typeof l !== 'object' || l.fin) return null;
    const arr = a => Array.isArray(a) ? a.filter(x => typeof x === 'string').slice(0, 40).map(x => x.slice(0, 16)) : [];
    return { t0: num(l.t0, 1e15), upd: num(l.upd, 1e15), id: num(l.id, 1e9), goblin: Math.min(N_GOB - 1, num(l.goblin)), size: num(l.size, 99), go: l.go ? 1 : 0, round: Math.max(1, num(l.round, 99)), kills: num(l.kills, 9999), crafted: num(l.crafted, 9999), recycled: num(l.recycled, 9999), vc: num(l.vc, 999), cl: l.cl ? 1 : 0, trees: arr(l.trees), heists: arr(l.heists), others: num(l.others, 99), sv: cleanSv(l.sv) };
  }
  function cleanSv(b) { return b && typeof b === 'object' ? { dd: num(b.dd), dt: num(b.dt), ge: num(b.ge), gs: num(b.gs), ex: num(b.ex), rd: num(b.rd, 99) } : null; }

  // Read whatever storage gave us (any version, any garbage) and return a valid object of the current version. Unknown future fields are dropped, known ones kept.
  function normalize(raw, now) {
    const s = blank(now != null ? now : Date.now());
    if (!raw || typeof raw !== 'object') return s;
    if (raw.since) s.since = num(raw.since, 1e15) || s.since;
    for (const k of TOT) s.tot[k] = num(raw.tot && raw.tot[k]);
    for (const k of BEST) s.best[k] = num(raw.best && raw.best[k]);
    s.streak = num(raw.streak, 99999);
    if (Array.isArray(raw.gob)) for (let i = 0; i < N_GOB; i++) { const g = raw.gob[i]; if (g && typeof g === 'object') s.gob[i] = { m: num(g.m), w: Math.min(num(g.w), num(g.m)), k: num(g.k) }; }
    if (Array.isArray(raw.recent)) s.recent = raw.recent.map(cleanRec).filter(Boolean).slice(0, RECENT);
    s.last = cleanRec(raw.last) || null; s.live = cleanLive(raw.live);
    return s;
  }

  // ---- recording
  const zeroLive = (now, info) => ({ t0: now, upd: now, id: info.id | 0, goblin: Math.max(0, Math.min(N_GOB - 1, info.goblin | 0)), size: info.size | 0, go: 0, round: 1, kills: 0, crafted: 0, recycled: 0, vc: 0, cl: 0, trees: [], heists: [], others: 0, sv: null });
  // A match starts (or, with info.resumed, the same match comes back after a reload). A stale unfinished match is settled first as a quit.
  function begin(s, info, now) {
    if (s.live && info.resumed && s.live.id === (info.id | 0) && now - s.live.upd < 120000 && now >= s.live.upd) { s.live.upd = now; return s; }
    if (s.live) finish(s, { how: 'quit' }, now);
    s.live = zeroLive(now, info);
    return s;
  }
  // One server message. ctx.kindOf(roomKey) -> 'tree' | 'heist' | null. Returns true when the live record changed.
  function event(s, d, ctx, now) {
    const l = s.live; if (!l || !d || typeof d !== 'object') return false; let ch = false;
    if (d.countdown && !l.go && Number.isFinite(d.countdown.at) && Number.isFinite(d.countdown.now)) { l.t0 = Math.round(now + (d.countdown.at - d.countdown.now)); l.go = 1; ch = true; }   // the match clock starts at GO (server time corrected for clock skew), not in the lobby
    if (d.round && Number.isFinite(d.round.n) && d.round.n > l.round) { l.round = Math.min(99, d.round.n | 0); ch = true; }
    if (Number.isFinite(d.kills) && d.kills > l.kills) { l.kills = Math.min(9999, d.kills | 0); ch = true; }
    if (d.crafted) { l.crafted++; ch = true; }
    if (d.recycled) { l.recycled++; ch = true; }
    if (d.board && Array.isArray(d.board.rows)) { l.others = d.board.rows.filter(r => r && r[4] && r[0] !== l.id).length; l.size = Math.max(l.size, d.board.rows.length); ch = true; }
    if (d.actMe !== undefined) {
      const o = d.actMe || {}, on = o.claim > 0;
      if (on && !l.cl) { l.vc++; ch = true; }
      if (!!on !== !!l.cl) { l.cl = on ? 1 : 0; ch = true; }
      if ((o.chan || o.timing) && typeof o.r === 'string') {
        const kd = ctx && ctx.kindOf ? ctx.kindOf(o.r) : null, list = kd === 'tree' ? l.trees : kd === 'heist' ? l.heists : null;
        if (list && !list.includes(o.r) && list.length < 40) { list.push(o.r); ch = true; }
      }
    }
    if (ch) l.upd = now;
    return ch;
  }
  const better = (a, b) => b > a ? b : a;
  // The match is over for this player. o: { how, place, size, st (server block), round, kills, by, secs }. Returns the record, or null when there is no live match.
  function finish(s, o, now) {
    const l = s.live; if (!l) return null; s.live = null;
    const how = HOW.includes(o.how) ? o.how : 'died', won = !!WIN_HOW[how], sv = cleanSv(o.st) || l.sv || { dd: 0, dt: 0, ge: 0, gs: 0, ex: 0, rd: 0 };
    const round = Math.max(1, Math.min(99, sv.rd || o.round | 0 || l.round));
    const survived = won || how === 'time' || how === 'crowned' ? round : Math.max(0, round - 1);
    const secs = o.secs != null ? num(o.secs, 1e6) : num(((how === 'quit' ? l.upd : now) - l.t0) / 1000, 1e6);
    const kills = Math.max(l.kills, num(o.kills, 9999)), size = num(o.size, 99) || l.size;
    const place = won ? 1 : num(o.place, 99) || (how === 'died' && l.others >= 0 ? l.others + 1 : 0);
    const rec = { t: now, g: l.goblin, pl: place, sz: size, k: kills, rd: survived, secs, how, by: typeof o.by === 'string' ? o.by.slice(0, 24) : '', win: won ? 1 : 0, mid: l.t0 };
    const t = s.tot, g = s.gob[l.goblin];
    t.matches++; t.kills += kills; t.rounds += survived; t.secs += secs;
    t.dealt += sv.dd; t.taken += sv.dt; t.goldEarned += sv.ge; t.goldSpent += sv.gs; t.elixir += sv.ex;
    t.crafted += l.crafted; t.recycled += l.recycled; t.vaultClaims += l.vc; t.trees += l.trees.length; t.heists += l.heists.length;
    g.m++; g.k += kills;
    if (won) { t.wins++; g.w++; s.streak++; if (how === 'crown') t.crownWins++; } else s.streak = 0;
    if (how === 'died') t.deaths++; if (how === 'quit') t.quits++;
    const b = s.best;
    b.kills = better(b.kills, kills); b.rounds = better(b.rounds, survived); b.secs = better(b.secs, secs); b.streak = better(b.streak, s.streak);
    b.gold = better(b.gold, sv.ge); b.dealt = better(b.dealt, sv.dd);
    if (won && secs > 0 && (!b.fastWin || secs < b.fastWin)) b.fastWin = secs;
    s.recent.unshift(rec); s.recent.length = Math.min(s.recent.length, RECENT); s.last = rec;
    return rec;
  }
  // A later, fuller message (matchEnd after the death card) fixes the placement and size of the match just recorded. Totals are untouched.
  function refine(s, mid, o) {
    const r = s.last; if (!r || r.mid !== mid) return false; let ch = false;
    if (!r.win && o.place > 0 && o.place !== r.pl) { r.pl = num(o.place, 99); ch = true; }
    if (o.size > 0 && o.size !== r.sz) { r.sz = num(o.size, 99); ch = true; }
    if (ch && s.recent[0] && s.recent[0].mid === mid) { s.recent[0].pl = r.pl; s.recent[0].sz = r.sz; }
    return ch;
  }

  // ---- derived numbers for the page
  function derived(s) {
    const t = s.tot, m = t.matches;
    let fav = -1;
    for (let i = 0; i < N_GOB; i++) { const g = s.gob[i]; if (g.m && (fav < 0 || g.m > s.gob[fav].m || (g.m === s.gob[fav].m && g.w > s.gob[fav].w))) fav = i; }
    return { winRate: m ? t.wins / m : 0, kd: t.kills / Math.max(1, t.deaths), avgSecs: m ? Math.round(t.secs / m) : 0, avgKills: m ? t.kills / m : 0, avgRounds: m ? t.rounds / m : 0, favourite: fav, losses: m - t.wins };
  }
  function empty(s) { return !s.tot.matches; }
  const api = { VERSION, N_GOB, RECENT, blank, normalize, begin, event, finish, refine, derived, empty };
  root.GKSTATS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

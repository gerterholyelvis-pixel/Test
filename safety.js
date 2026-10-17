// SAFETY (docs/reports/release-2.md): player-safety and abuse-protection logic that needs no game state, so it is unit tested (tests/safety.test.js).
// Node only (never served to the browser). server.js requires it once; every function here is pure or owns a small Map.
//   clientIp(headers, remote, trust)   the address a connection counts against (X-Forwarded-For handling, see GK_TRUST_PROXY below)
//   connLimiter(opts)                  per-IP connection-rate limiter (join floods, reconnect storms): allow(ip, now) -> boolean
//   cleanName(s)                       the name a player may use ('' = refused: the server then gives a goblin name)
//   reportBook()                       report() rate limits and the log line for a "report this player" click
//   health()                           uncaught-error counters for /healthz
const net = require('net');

// ---- client address ----
// GK_TRUST_PROXY unset / 0 / false: the socket address (no proxy). 1 / true: the proxy appended the address it saw, so the LAST X-Forwarded-For entry is the
// client (earlier entries are whatever the client claimed and are ignored: a forged "X-Forwarded-For: 1.2.3.4" cannot dodge the per-IP cap). N > 1: N trusted
// proxies in a row (e.g. a CDN in front of the host), take the Nth entry from the right. A header that is missing, too short or not an IP falls back to the socket address.
function hops(trust) {
  const t = String(trust == null ? '' : trust).trim().toLowerCase();
  if (!t || t === '0' || t === 'false' || t === 'off' || t === 'no') return 0;
  return /^\d{1,2}$/.test(t) ? Math.max(1, +t) : 1;
}
function normIp(s) {
  s = String(s || '').trim().replace(/^\[|\]$/g, ''); if (s.startsWith('::ffff:') && net.isIPv4(s.slice(7))) s = s.slice(7);
  return net.isIP(s) ? s.toLowerCase() : '';
}
function clientIp(headers, remote, trust) {
  const sock = normIp(remote) || String(remote || '?'), n = hops(trust);
  if (!n) return sock;
  const raw = headers && headers['x-forwarded-for'];
  const parts = String(Array.isArray(raw) ? raw.join(',') : raw || '').split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < n) return sock;
  return normIp(parts[parts.length - n]) || sock;
}

// ---- connection-rate limiter: a token bucket per address (burst `burst`, one new token every `everyMs`) ----
function connLimiter(o) {
  const burst = (o && o.burst) || 12, everyMs = (o && o.everyMs) || 2500, max = (o && o.maxIps) || 5000, m = new Map();
  let refused = 0;
  function allow(ip, now) {
    now = now || Date.now();
    let b = m.get(ip); if (!b) { if (m.size >= max) prune(now, true); b = { t: burst, at: now }; m.set(ip, b); }
    b.t = Math.min(burst, b.t + (now - b.at) / everyMs); b.at = now;
    if (b.t < 1) { refused++; return false; }
    b.t--; return true;
  }
  function prune(now, force) { for (const [ip, b] of m) if (force ? now - b.at > everyMs : b.t + (now - b.at) / everyMs >= burst) m.delete(ip); if (m.size >= max) m.clear(); }
  const timer = setInterval(() => prune(Date.now(), false), 60000); if (timer.unref) timer.unref();
  return { allow, size: () => m.size, refused: () => refused, prune };
}

// ---- names ----
const BAD = /(fuck|shit|cunt|nigg|fag|retard|bitch|whore|slut|cock|dick|pussy|rape|nazi|hitler|kike|spic|chink|twat|wank|penis|vagina|porn|nigr|tranny|dildo|molest|pedo|kkk|rapist)/i;   // fix-list 17 + more
const RESERVED = /^(admin|administrator|moderator|mod|staff|server|system|owner|official|goblin king|gm|support|bot|null|undefined)$/i;   // nobody poses as the game
const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', 9: 'g' };
function looksBad(n) {   // letters only, digits read as letters ("sh1t"), repeats collapsed ("fuuuck"), spaces ignored ("f u c k")
  const low = n.toLowerCase();
  const forms = [low.replace(/[^a-z]/g, ''), low.replace(/[01345789]/g, d => LEET[d]).replace(/[^a-z]/g, ''), low.replace(/1/g, 'l').replace(/[01345789]/g, d => LEET[d]).replace(/[^a-z]/g, '')];
  for (const f of forms) { if (BAD.test(f) || BAD.test(f.replace(/(.)\1+/g, '$1'))) return true; }
  return /(https?|www|discord|\.gg|telegram)/i.test(low) || false;
}
function cleanName(s) {
  const n = String(s || '').replace(/[^A-Za-z0-9 '\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
  return n && !looksBad(n) && !RESERVED.test(n) ? n : '';
}

// ---- quick chat (no free text anywhere: a fixed phrase list, the client holds the words) and reports ----
const QUICK = ['Hello!', 'Good luck!', 'Thanks!', 'Nice one!', 'Truce?', 'Help!', 'Watch out!', 'Good game!'];
const QUICK_MS = 1500, QUICK_MAX = 40;
const REASONS = ['Cheating', 'Harassment or a bad name', 'Griefing or team abuse', 'Other'];
function reportBook(log) {
  const total = { n: 0 };
  function report(m, reporter, target, reason, now) {   // reporter / target: players; returns 'ok' or why not
    now = now || Date.now();
    if (!reporter || !target || reporter === target) return 'self';
    if (target.bot || target.npc || reporter.bot || reporter.npc) return 'bot';
    if (!Number.isInteger(reason) || reason < 0 || reason >= REASONS.length) return 'reason';
    if (now - (reporter.reportAt || 0) < 4000) return 'rate';
    const mine = reporter.reportsMade || (reporter.reportsMade = new Set());
    if (mine.has(target.id)) return 'dup';
    if (mine.size >= 3) return 'limit';
    reporter.reportAt = now; mine.add(target.id); total.n++;
    (m.reports || (m.reports = [])).length < 50 && m.reports.push({ from: reporter.name, to: target.name, why: REASONS[reason], at: now });
    (log || console.log)('report: match ' + m.id + ' "' + reporter.name + '" reported "' + target.name + '" for ' + REASONS[reason]);
    return 'ok';
  }
  return { report, total: () => total.n };
}

// ---- error counters for /healthz ----
function health() {
  const h = { errors: 0, last: '', lastAt: 0 };
  return { note(kind, e) { h.errors++; h.last = (kind + ': ' + (e && e.message || e)).slice(0, 160); h.lastAt = Date.now(); }, get: () => ({ errors: h.errors, lastError: h.last || undefined, lastErrorAt: h.lastAt ? new Date(h.lastAt).toISOString() : undefined }) };
}

module.exports = { clientIp, hops, connLimiter, cleanName, looksBad, reportBook, health, QUICK, QUICK_MS, QUICK_MAX, REASONS };

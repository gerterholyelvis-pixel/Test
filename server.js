const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const WORLD = require('./world.js'); // shared geometry (rooms, vault, chest rooms), the client uses the same file
// SECURITY-BEGIN (static serving from memory, headers, origin / per-IP / match limits, signed character tokens, speed-hack kicks; see docs/reports/security.md)
const crypto = require('crypto');
const SEC_DEBUG = !!process.env.GK_DEBUG;
const envInt = (k, d) => /^\d+$/.test(process.env[k] || '') && +process.env[k] > 0 ? +process.env[k] : d;
const MAX_PER_IP = envInt('GK_MAX_PER_IP', SEC_DEBUG ? 1000 : 8), MAX_MATCHES = envInt('GK_MAX_MATCHES', 200), MATCH_LIFE_MS = SEC_DEBUG ? envInt('GK_MATCH_LIFE_MS', 20 * 60000) : 20 * 60000;   // tests get a high per-IP default (all clients are 127.0.0.1) unless GK_MAX_PER_IP is set
const ORIGINS = (process.env.GK_ORIGINS || '').split(',').map(s => s.trim().toLowerCase().replace(/\/$/, '')).filter(Boolean);
let SECRET = process.env.GK_SECRET;
if (!SECRET && !process.env.GK_DEBUG) {   // local play: keep one generated secret in .gk-secret (git-ignored) so saved characters survive restarts
  const f = path.join(__dirname, '.gk-secret');
  try { SECRET = fs.readFileSync(f, 'utf8').trim(); } catch (e) {}
  if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); try { fs.writeFileSync(f, SECRET, { mode: 0o600 }); } catch (e) {} }
  console.warn('GK_SECRET is not set: using the local secret in .gk-secret (set GK_SECRET in production).');
}
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); console.warn('WARNING: GK_SECRET is not set. Using a random secret: saved-character tokens will not survive a restart (set GK_SECRET in production).'); }
const b64u = b => Buffer.from(b).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(c) {   // c: { c: charId, g: goblin, w: wins, n: name } -> "payload.signature" (HMAC-SHA256)
  const body = b64u(JSON.stringify({ c: c.c, g: c.g, w: c.w, n: c.n })); return body + '.' + sign(body);
}
function readToken(t) {   // the payload when the signature and shape are valid, else null
  if (typeof t !== 'string' || t.length > 400) return null;
  const i = t.indexOf('.'); if (i < 1) return null;
  const body = t.slice(0, i), sig = Buffer.from(t.slice(i + 1)), want = Buffer.from(sign(body));
  if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!o || typeof o.c !== 'string' || !Number.isInteger(o.g) || o.g < 0 || o.g >= GOBLIN_N || !Number.isInteger(o.w) || o.w < 0 || o.w > 9999 || typeof o.n !== 'string') return null;
    return o;
  } catch (e) { return null; }
}
// static files: read once and cached in memory; a failed read is a 404, never a crash
const ROOT_DIR = __dirname, THREE_DIR = path.join(__dirname, 'node_modules/three/build'), ADDON_DIR = path.join(__dirname, 'node_modules/three/examples/jsm');
const cache = new Map();   // url key -> { body, type } or null (known missing)
function cached(key, file, type) {
  if (cache.has(key)) return cache.get(key);
  let e = null; try { e = { body: fs.readFileSync(file), type }; } catch (err) { e = null; }
  if (cache.size < 500) cache.set(key, e);
  return e;
}
const CLIENT_JS = new Set(['game', 'menu', 'items', 'world', 'save', 'icons', 'audio', 'feel', 'itemart', 'vfx', 'hud5', 'iconworker', 'elixir', 'homebase', 'homeui', 'act5ui', 'rooms5art-home', 'rooms5art-trees-a', 'rooms5art-trees-b', 'rooms5art-vault']);   // ROOMS5ART: the room art modules (hyphenated names)
let CSP = '';
function buildCsp() {   // the page has two inline scripts (importmap + module): allowed by hash, so no 'unsafe-inline' for scripts
  const page = cached('/index.html', path.join(ROOT_DIR, 'index.html'), 'text/html; charset=utf-8'), hashes = [];
  if (page) for (const mm of page.body.toString().matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) hashes.push("'sha256-" + crypto.createHash('sha256').update(mm[1].replace(/\r\n?/g, "\n")).digest('base64') + "'");
  CSP = ["default-src 'self'", "script-src 'self' " + hashes.join(' '), "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "connect-src 'self' ws: wss:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'"].join('; ');
}
function staticFor(url) {   // -> { body, type, cc } or null (404)
  const p = url.split('?')[0].split('#')[0];
  if (p === '/' || p === '/index.html') { const e = cached('/index.html', path.join(ROOT_DIR, 'index.html'), 'text/html; charset=utf-8'); return e && { ...e, cc: 'no-cache' }; }
  const mm = p.match(/^\/([a-z0-9-]+)\.js$/);   // ROOMS5ART: hyphens and digits allowed (the whitelist above still decides)
  if (mm && CLIENT_JS.has(mm[1])) { const e = cached(p, path.join(ROOT_DIR, mm[1] + '.js'), 'text/javascript; charset=utf-8'); return e && { ...e, cc: 'no-cache' }; }
  const cm = p.match(/^\/client\/((?:[a-z0-9_-]+\/)*[a-z0-9_-]+)\.js$/);   // client modules (client/**.js); no dots in the capture, so no traversal
  if (cm) { const e = cached(p, path.join(ROOT_DIR, 'client', cm[1] + '.js'), 'text/javascript; charset=utf-8'); return e && { ...e, cc: 'no-cache' }; }
  if (/^\/three\/three\.(module|core)\.js$/.test(p)) { const e = cached(p, path.join(THREE_DIR, p.slice(7)), 'text/javascript; charset=utf-8'); return e && { ...e, cc: 'public, max-age=86400' }; }
  if (p.startsWith('/three/addons/')) {   // .js only, no path traversal
    let rel = ''; try { rel = decodeURIComponent(p.slice(14)); } catch (e) {}
    const file = path.resolve(ADDON_DIR, rel);
    if (rel && !rel.includes('\0') && file.startsWith(ADDON_DIR + path.sep) && file.endsWith('.js')) { const e = cached(p, file, 'text/javascript; charset=utf-8'); return e && { ...e, cc: 'public, max-age=86400' }; }
  }
  return null;
}
const SEC_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin' };
const srv = http.createServer((q, r) => {
  try {
    const e = q.method === 'GET' || q.method === 'HEAD' ? staticFor(q.url || '/') : null;
    if (!e) { r.writeHead(404, { ...SEC_HEADERS, 'content-type': 'text/plain' }); return r.end('Not found'); }
    r.writeHead(200, { ...SEC_HEADERS, 'content-type': e.type, 'cache-control': e.cc, 'content-security-policy': CSP });
    r.end(q.method === 'HEAD' ? undefined : e.body);
  } catch (err) { try { r.writeHead(500); r.end(); } catch (e2) {} }
});
buildCsp();
const ipCount = new Map();
const ipOf = req => (process.env.GK_TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '') || req.socket.remoteAddress || '?';   // behind a proxy set GK_TRUST_PROXY=1 (uses the last X-Forwarded-For hop)
function originOk(req) {   // browsers always send Origin; a client without one is not a browser (no CSRF risk) and is allowed
  const o = req.headers.origin; if (!o) return true;
  const low = String(o).toLowerCase().replace(/\/$/, '');
  if (ORIGINS.length) return ORIGINS.includes(low);
  let u; try { u = new URL(low); } catch (e) { return false; }
  return u.host === String(req.headers.host || '').toLowerCase() || u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
}
function verifyClient(info, cb) {
  const req = info.req;
  if (!originOk(req)) return cb(false, 403, 'Forbidden origin');
  if ((ipCount.get(ipOf(req)) || 0) >= MAX_PER_IP) return cb(false, 429, 'Too many connections');
  cb(true);
}
const FIX_WINDOW_MS = 10000, FIX_MAX = 15;
function secFix(p, ws, now) {   // count corrections in a sliding 10 s window; more than 15 -> kick. Bots and mystery enemies never come through applyMove.
  if (p.bot || p.npc) return false;
  const a = p.fixes || (p.fixes = []); a.push(now); while (a.length && now - a[0] > FIX_WINDOW_MS) a.shift();
  if (a.length <= FIX_MAX) return false;
  console.log('kick: player ' + p.id + ' (' + p.name + ') ' + a.length + ' movement corrections in ' + FIX_WINDOW_MS / 1000 + ' s');
  p.kicked = true; sendTo(ws, { kicked: 'movement' }); try { ws.close(); } catch (e) {} return true;
}
const BAD_WORDS = /(fuck|shit|cunt|nigg|fag|retard|bitch|whore|slut|cock|dick|pussy|rape|nazi|hitler|kike|spic|chink|twat|wank|penis|vagina)/i;   // a name that contains one of these becomes a goblin name instead (fix-list 17)
const cleanName = s => { const n = String(s || '').replace(/[^A-Za-z0-9 '\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return n && !BAD_WORDS.test(n.replace(/[^A-Za-z]/g, '')) ? n : ''; };
process.on('uncaughtException', e => console.error('uncaught', e));   // one bad message must not take every running match down (a port clash still exits, see srv.on('error'))
process.on('unhandledRejection', e => console.error('unhandled', e));
// SECURITY-END
const wss = new WebSocketServer({ server: srv, maxPayload: 512, verifyClient }); // oversize frames close the socket
setInterval(() => { for (const ws of wss.clients) { if (ws.alive === false || ws.bufferedAmount > 262144) { try { ws.terminate(); } catch (e) {} continue; }   /* ROBUST: also drop a socket that is not reading (256 KB queued) */ ws.alive = false; try { ws.ping(); } catch (e) {} } }, 30000).unref();   // SECURITY: heartbeat, a socket that answers no ping for 30 s is dead (frees its per-IP slot, starts the reconnect grace)
const LIM = WORLD.LIM + 1; // world half-extent: the room grid plus the attached rooms around it (+1 m slack)
const clamp = v => Math.max(-LIM, Math.min(LIM, v));
// ---- doors and rounds: every table comes from WORLD.DOORS / WORLD.ROOMS (docs/PLAN-5x5.md 5.1), the client derives the same ids ----
const VK = WORLD.VAULT_KEY;   // THE VAULT's room key ('12')
const ROOM_DOORS = WORLD.ROOM_DOORS, nDoors = WORLD.DOORS.length; // room key ('0'..'24' arena, 'c0'..'c15' attached) -> door ids on its walls (sorted N E S W)
const DOOR_AT = {}; // 'a|b' and 'b|a' -> { id, axis, c, hw }: where the doorway sits on the wall between two rooms (axis = coordinate along the wall, c = its centre, hw = half opening + slack)
for (const d of WORLD.DOORS) DOOR_AT[d.a + '|' + d.b] = DOOR_AT[d.b + '|' + d.a] = { id: d.id, axis: d.axis, c: d.c, hw: d.hw };
const isOpen = (m, d) => WORLD.alwaysOpen(d) || m.open.includes(d);   // a home's hatch is always open
const isHatch = d => WORLD.alwaysOpen(d);
const isArena = k => typeof k === 'string' && /^\d{1,2}$/.test(k) && +k < WORLD.NARENA;
const isHome = k => typeof k === 'string' && k[0] === 'c' && !!WORLD.CHEST[+k.slice(1)] && WORLD.CHEST[+k.slice(1)].home;
const parentCell = k => isHome(k) ? String(WORLD.CHEST[+k.slice(1)].parent) : k;   // a home's arena cell (the door guard counts a goblin at home as an occupant of it)
const roomKeyOf = WORLD.roomKeyOf, boxOf = WORLD.roomAt;
// ---- matches: independent games, players are queued with similar victory counts ----
// MATCH-BEGIN (matchmaking: players wait in a queue match (phase 'queue'); it closes at CAP players, or after QUEUE_MS with >= 2; then everyone loads in together. See docs/reports/matchmaking.md)
const DBG = !!process.env.GK_DEBUG;
// RULES-BEGIN (rule toggles; see docs/reports/rules-experimental.md. DEFAULT ON since the playtest pass: staffbolt (wizards can fight) and bribe (gold buys door weight). GK_RULES adds rules ("crown,doorclose"), removes them with a minus ("-bribe"), "none" turns everything off.)
const RULE_NAMES = ['crown', 'doorclose', 'staffbolt', 'bribe'], RULE_DEFAULT = ['staffbolt', 'bribe'];
const RULES = (() => { const s = new Set(RULE_DEFAULT); for (const t of (process.env.GK_RULES || '').split(',').map(x => x.trim().toLowerCase())) { if (t === 'none') s.clear(); else if (t[0] === '-' && RULE_NAMES.includes(t.slice(1))) s.delete(t.slice(1)); else if (RULE_NAMES.includes(t)) s.add(t); } return s; })();
const rule = n => RULES.has(n);
const CROWN_MS = DBG && +process.env.GK_CROWN_MS > 0 ? +process.env.GK_CROWN_MS : 20000, DAIS_R = 2.2;   // stand on the vault dais this long, unhurt, to be crowned (GK_CROWN_MS only with GK_DEBUG=1)
const DOOR_LIFE = 2, KLAXON_MS = 5000;   // doorclose: a door stays open this many rounds; the warning comes this long before the round ends
const BOLT = { dmg: 9, range: 12, speed: 10, cd: 1000, radius: 0.6 };   // staffbolt: 9 damage per second at range (was 6 / 1.2 s = 5 dps, too weak to finish anything); melee classes do 22-31 dps at 2.2 m
const BRIBE = { cost: 50, max: 3 };   // bribe: gold per +1 weight, and the most bribes one room can stack per round
// RULES-END
const CAP = DBG && /^[1-8]$/.test(process.env.GK_MATCH_SIZE || '') ? +process.env.GK_MATCH_SIZE : 8;   // GK_MATCH_SIZE only works with GK_DEBUG=1
const QUEUE_MS = process.env.GK_QUEUE_MS && +process.env.GK_QUEUE_MS >= 0 ? +process.env.GK_QUEUE_MS : 15000, MIN_START = 1;   // after QUEUE_MS the match starts even with ONE human, the rest are bots
const READY_MS = DBG && process.env.GK_READY_MS && +process.env.GK_READY_MS >= 0 ? +process.env.GK_READY_MS : 8000, COUNT_MS = DBG && process.env.GK_COUNTDOWN_MS !== undefined && +process.env.GK_COUNTDOWN_MS >= 0 ? +process.env.GK_COUNTDOWN_MS : 3000;   // debug-only overrides for tests
// MATCH-END
const matches = new Map(); // id -> match
let nextId = 1, nextMatch = 1;
const sendTo = (ws, o) => { if (ws && ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const bcast = (m, o) => { const msg = typeof o === 'string' ? o : JSON.stringify(o); for (const ws of m.players.keys()) if (ws.readyState === 1) ws.send(msg); if (m.specs) for (const ws of m.specs.keys()) if (ws.readyState === 1) ws.send(msg); };   // FUN: spectators (dead players who stay subscribed) get everything the match broadcasts
const isHum = p => !p.bot && !p.npc;
const humans = m => { let n = 0; for (const p of m.players.values()) if (isHum(p)) n++; return n; };   // bots and mystery enemies are not humans
const avgWins = m => { let s = 0; for (const p of m.players.values()) s += p.wins; return m.players.size ? s / m.players.size : 0; };
const tolerance = w => w <= 5 ? 1 : Math.ceil(w * 0.25);
function newMatch() {
  const R1 = process.env.GK_DEBUG && +process.env.GK_ROUND_MS > 0 ? +process.env.GK_ROUND_MS : ROUND_MS; // GK_DEBUG only: shorter round 1 so the tests run fast
  const m = { id: nextMatch++, players: new Map(), round: 1, dur: R1, endsAt: Date.now() + R1, started: false, phase: 'queue', formedAt: Date.now(), goAt: 0, sel: {}, selBy: {}, lastSel: {}, open: [], drops: [], nextDrop: 1, dirty: false, lastRound: 0, specs: new Map(), dead: [], npcSpawned: new Set(),
    chests: Array.from({ length: WORLD.NATT }, () => Math.floor(Math.random() * 6)), chestKeys: Array.from({ length: WORLD.NATT }, () => GKITEMS.randomWeaponKey()), layout: GKITEMS.randomLayout(),
    trees: null, vb: null, vbNext: null, ram: null, claimant: null, relicRestock: null };   // 5x5 hooks (docs/PLAN-5x5.md 5.2): tree rooms and vaultbreakers (task B), crown claim and relic restock (task A) fill these; null = inert
  m.shops = m.layout.map(x => x === 'merchant' ? GKITEMS.randomShop() : null);   // each merchant's 5 items with gold prices, rolled once per match
  m.mystery = m.layout.map(x => x === 'mystery' ? GKITEMS.randomMystery() : null);   // what is inside each mystery room, rolled once per match // weapon index per chest room
  lootInit(m);   // LOOT: vault relic, shop base prices, lures
  A5.init(m);   // ACT5: tree roll, vaultbreaker layout, the activity rooms' state (act5.js)
  matches.set(m.id, m); return m;
}
const VAULT = ROOM_DOORS[VK] || []; // the 4 doors touching the middle vault room
const vaultVotes = m => { const rooms = Object.keys(m.sel).filter(k => VAULT.includes(m.sel[k])); return (rule('bribe') ? rooms.reduce((n, k) => n + 1 + ((m.bribes && m.bribes[k]) || 0), 0) : rooms.length) + rooms.filter(k => m.picked && m.picked[k]).length + A5.voteExtra(m); };   /* ACT5: + Keystone armed, net writs, Cracked doors (vb5.js heistVotes) */ // distinct rooms selecting a vault door (bribe rule: each room weighs 1 + its bribes)
const roundState = m => ({ round: { n: m.round, left: Math.max(0, m.endsAt - Date.now()), dur: m.dur }, sel: m.sel, selBy: m.selBy || {}, lastSel: m.lastSel || {}, open: m.open, vaultVotes: vaultVotes(m), fizzled: m.fizzled || [], relic: m.relicKey && !m.relicTaken ? m.relicKey : null, ...(m.sudden ? { sudden: 1 } : null), ...(m.showdown && !m.sudden ? { showdown: 1 } : null), ...A5.roundFields(m), ...ruleState(m) });   // vb: task B (vaultbreaker assignment)
const broadcastRound = m => bcast(m, roundState(m));
const matchInfo = m => { let lo = Infinity, hi = -Infinity, n = 0, alive = 0; for (const p of m.players.values()) { if (p.npc) continue; n++; lo = Math.min(lo, p.wins); hi = Math.max(hi, p.wins); if (p.entered && !p.dead) alive++; } return { size: n, minWins: n ? lo : 0, maxWins: n ? hi : 0, alive }; };   // mystery enemies never count
const broadcastMatch = m => bcast(m, { match: matchInfo(m) });
function findMatch(wins) {
  let best = null;
  for (const m of matches.values()) {
    if (m.phase !== 'queue' || m.players.size >= CAP) continue;   // closed matches take no late joiners
    const d = m.players.size ? Math.abs(wins - avgWins(m)) : 0;
    if (m.players.size && d > tolerance(wins)) continue;
    if (!best || d < best.d || (d === best.d && m.players.size > best.m.players.size)) best = { m, d };
  }
  return best ? best.m : matches.size >= MAX_MATCHES ? null : newMatch();   // SECURITY: null = servers are full
}
function leave(m, ws) { // remove a player from their match; empty matches disappear
  const gone = m.players.get(ws);
  if (!m.players.delete(ws)) return;
  if (gone && gone.token) socTokens.delete(gone.token);   // ROBUST: a player who left for good can never resume, free the token now
  m.dirty = true;
  if (gone && m.sel[gone.room] != null && ![...m.players.values()].some(q => q.room === gone.room)) { delete m.sel[gone.room]; if (m.selBy) delete m.selBy[gone.room]; broadcastRound(m); } // an empty room's door vote no longer counts
  if (!humans(m) && (m.ended || !m.specs.size || m.phase === 'queue')) matches.delete(m.id);   // FUN: spectators keep a match with only bots alive until it is decided
  else if (m.phase === 'queue') broadcastQueue(m); else { broadcastMatch(m); sendBoard(m); checkWin(m); }
}
const TS = { n: 0, sum: 0, max: 0, over: 0 };   // tick timing (GK_DEBUG {botstat:1} -> tick), see tests/tickbench.js
setInterval(() => { // one global timer steps every match
  const now = Date.now(), tick0 = DBG ? process.hrtime.bigint() : 0n;
  for (const m of matches.values()) { try {   // ROBUST: a throwing match must not stop the matches after it (see the catch below)
    if (DBG && m.boom) throw new Error('boom (test hook)');
    /* MATCH-BEGIN */ if (matchTick(m, now)) continue; /* MATCH-END */
    if (now - m.formedAt > MATCH_LIFE_MS) {   // SECURITY: hard match lifetime (20 min): decided by the round-10 rule; a match that is still open a minute later is closed
      if (!m.ended && m.started) timeLimit(m);
      else if (now - m.formedAt > MATCH_LIFE_MS + 60000) { for (const w of [...m.players.keys(), ...m.specs.keys()]) try { w.close(); } catch (e) {} for (const q of m.players.values()) if (q.token) socTokens.delete(q.token); matches.delete(m.id); continue; }
    }
    socGrace(m, now);   // SOCIAL: disconnected players whose grace period ran out die now
    botTick(m, now);   // BOTS: brains of bots and mystery enemies (~10 Hz)
    craftTick(m, now);   // STATIONS: finished crafts, cancelled crafts
    useTick(m, now);   // UTILITY: bombs, smoke, mushroom regeneration
    weapons3Tick(m, now);   // WEAPONS3: bleeds, and bolts of tuned wands when the staffbolt rule is off
    ruleTick(m, now);   // RULES: experimental rules (no-op unless GK_RULES is set)
    guardTick(m, now);   // DOORGUARD: nobody stays locked in a room, nobody stays stuck inside a prop
    A5.tick(m, now);   // ACT5: tree rooms, vaultbreakers, the vault (10 Hz inside)
    elixirTick(m, now);   // ELIXIR: pumps, home security, sendables, bots at home
    if (!m.started) m.endsAt = now + m.dur;   // round 1 waits until someone has left the wheel and entered the rooms
    if (now >= m.endsAt) {
      const picked = [...new Set(Object.values(m.sel))], ok = vaultVotes(m) >= 2; // vault doors need 2 different rooms
      const fresh = A5.doors(m, paceNoDoor(m, picked.filter(d => ok || !VAULT.includes(d))), now); m.open = useOpen(m, ruleOpen(m, fresh)); m.fizzled = ok ? [] : picked.filter(d => VAULT.includes(d)); m.lastSel = { ...m.sel }; m.sel = {}; m.selBy = {}; m.bribes = {}; m.round++; m.dur = NEXT_MS; m.endsAt = now + m.dur; suddenCheck(m); paceRound(m); lootRound(m); A5.round(m, now); broadcastRound(m); m.lastRound = now; }
    else if (now - m.lastRound >= 1000) { m.lastRound = now; broadcastRound(m); }
    // COMBAT-BEGIN regen: 1 HP every 4 s once a player has not been hit for 6 s. SUDDEN DEATH: only inside THE VAULT (the sanctuary everyone converges on), nowhere else.
    for (const p of m.players.values()) if ((!m.sudden || p.room === VK) && p.entered && !p.dead && p.stats && p.stats.health < p.stats.maxHealth && now - (p.hurtAt || 0) >= C.regenIdle * RSCALE * G.goblinRegen(p.goblin).idle && now - (p.regenAt || 0) >= C.regenEvery * RSCALE * G.goblinRegen(p.goblin).every) { p.regenAt = now; p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + C.regenAmt); m.dirty = true; }
    // COMBAT-END
    if (m.dirty) { m.dirty = false; bcast(m, { players: [...m.players.values()].map(pub) }); } // slow state: only when something other than movement changed
    snapshots(m); // NETCODE: positions of players who moved go out at 20 Hz as compact snapshots
    m.errs = 0;
  } catch (e) {   // ROBUST: log it (the first few), and close a match that keeps failing, so one broken match cannot flood the log or starve the others
    m.errs = (m.errs || 0) + 1; if (m.errs <= 3) console.error('tick match=' + m.id + ' phase=' + m.phase, e);
    if (m.errs >= 40) { console.error('closing match ' + m.id + ' after repeated tick errors'); for (const w of [...m.players.keys(), ...m.specs.keys()]) try { w.close(); } catch (e2) {} for (const q of m.players.values()) if (q.token) socTokens.delete(q.token); matches.delete(m.id); }
  } }
  botSweepEnd();
  if (DBG) { const ms = Number(process.hrtime.bigint() - tick0) / 1e6; TS.n++; TS.sum += ms; if (ms > TS.max) TS.max = ms; if (ms > 25) TS.over++; }
}, 50);

// goblin types and their odds: items.js GOBLINS (GOBTYPES)
// Equipment decides combat stats: attack damage comes from the weapon (items.js), health from the armour.
const G = require('./items.js'), ITEMS = G.ITEMS, C = G.COMBAT;
const info = k => (typeof k === 'string' && k.length < 40 && G.info(k)) || null; // any item key incl. goblin brains
const isItem = k => !!info(k);
const SLOT_IDS = new Set([...Array.from({ length: 9 }, (_, i) => 'b' + i), ...Array.from({ length: 3 }, (_, i) => 'q' + i), 'weapon', 'armor', 'charm']);
const getSlot = (inv, id) => id === 'weapon' ? inv.weapon : id === 'armor' ? inv.armor : id === 'charm' ? inv.charm : id === 'charm' ? inv.charm : (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)];
const setSlot = (inv, id, v) => { if (id === 'weapon') inv.weapon = v; else if (id === 'armor') inv.armor = v; else if (id === 'charm') inv.charm = v; else if (id === 'charm') inv.charm = v; else (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)] = v; };
const fits = (id, key) => key == null || (id === 'weapon' ? info(key).type === 'weapon' : id === 'armor' ? info(key).type === 'armor' : id === 'charm' ? info(key).type === 'charm' : true);
const allItems = inv => [inv.weapon, inv.armor, inv.charm, ...inv.backpack, ...inv.quick].filter(Boolean);
function recalc(p) { // derived stats from the equipped items
  const w = p.inv.weapon && info(p.inv.weapon), a = p.inv.armor && info(p.inv.armor);
  const maxHealth = p.npc ? (a ? a.health : 10) : G.goblinHp(p.goblin, a ? a.health : 10) + (p.npc ? 0 : (G.charmEff(p.inv.charm, 'hp') || 0));   // GOBTYPES: plus the type's health bonus
  p.stats = { knowledge: p.stats ? p.stats.knowledge : G.KNOWLEDGE[p.goblin], attack: w ? w.attack : 0, health: Math.min(p.stats ? p.stats.health : maxHealth, maxHealth), maxHealth };
  p.gear = { weapon: w ? w.name : 'None', armor: a ? a.name : 'None' };
  if (p.bless) A5.blessStats(p);   // ACT5: Thorn Shrine blessing (Fury attack, Bark max HP)
}
function equip(p, goblin) { // give a player a goblin type with its starting gear and otherwise empty inventory
  const s = G.START[goblin];
  p.goblin = goblin; p.inv = { backpack: Array(G.SLOTS.backpack).fill(null), quick: Array(G.SLOTS.quick).fill(null), weapon: s.weapon, armor: s.armor, charm: null };
  p.stats = null; recalc(p); p.gold = G.START_GOLD; p.parts = {}; for (const pt of G.PARTS) p.parts[pt.key] = 0;
  p.perks = []; p.swUsed = false;   // KNOWLEDGE: perks last until death
  const pk = G.goblinStart(goblin); if (pk) { p.gold += pk.gold; for (const k in pk.parts) p.parts[k] = (p.parts[k] || 0) + pk.parts[k]; }   // GOBTYPES: the miner's prospector pouch
}
const sendGold = p => { if (p.ws) sendTo(p.ws, { gold: p.gold }); };
const sendParts = p => { if (p.ws) sendTo(p.ws, { parts: p.parts }); };
// STATIONS (docs/PLAN-5x5.md 1.6): which station of which type the goblin stands at. kind: 'workbench' | 'recycler' | 'knowledge'. -> { kind, type } or null.
// Types are items.js STATIONS keys: bench 'normal' | 'master', recycler 'home' (50%) | 'full' (100%). Merchants and mystery 'stations' rooms: normal bench, full recycler (as before);
// homes: normal bench, home recycler; the Master Forge: master bench; the Grand Recycler: full recycler. Task E adds bench tiers, craft time and owner rules.
const STATION_TYPES = { merchant: { workbench: 'normal', recycler: 'full', knowledge: 'normal' }, home: { workbench: 'normal', recycler: 'home' }, forge: { workbench: 'master' }, grand: { recycler: 'full' } };
function stationAt(m, p, st) {
  const mm = /^c(\d+)$/.exec(p.room || ''), id = mm ? +mm[1] : -1;
  const L = id >= 0 ? m.layout[id] : null, my = id >= 0 ? m.mystery[id] : null;
  if (L === 'mystery') return !!my && my.kind === 'stations' && Array.isArray(my.stations) && my.stations.includes(st) ? { kind: st, type: st === 'recycler' ? 'full' : 'normal' } : null;
  const t = L && STATION_TYPES[L] && STATION_TYPES[L][st];
  return t ? { kind: st, type: t } : null;
}
const hasStation = (m, p, st) => !!stationAt(m, p, st);
// STATIONS-CRAFT-BEGIN (task E): crafting takes time. {craft: id} pays the (bench-discounted) parts and starts p.crafting; the item arrives after the bench's craftMs.
// Leaving the room, taking a hit, dying or {craftCancel:1} cancels it and refunds the parts. One craft at a time.
function craft(m, p, rid) { // {craft: recipeId}; returns null or a failure reason
  const stn = stationAt(m, p, 'workbench') || stationAt(m, p, 'knowledge'); if (!stn) return 'room';   // KNOWLEDGE: the knowledge tree is a workbench too
  const r = typeof rid === 'string' && G.RECIPES.find(x => x.id === rid);
  if (!r) return 'recipe';
  if (p.crafting) return 'busy';
  const bc = G.benchCraft(p, r, stn.type, p.perks);   // knowledge adapter + bench maxTier / costMul / bonusTier / craftMs, Thrifty Hands
  if (bc.why) return bc.why;
  const cost = bc.cost;
  for (const k in cost) if ((p.parts[k] || 0) < cost[k]) return 'parts';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  const now = Date.now(), ms = Math.max(0, bc.ms * CRAFT_SCALE);
  for (const k in cost) p.parts[k] -= cost[k];
  p.crafting = { rid: r.id, out: r.out, cost, room: p.room, startedAt: now, doneAt: now + ms, hp: p.stats.health };
  sendParts(p); sendTo(p.ws, { crafting: { rid: r.id, ms, type: stn.type, bonus: bc.bonus ? 1 : 0 } });
  if (ms <= 0) craftTick(m, now);
  return null;
}
const CRAFT_SCALE = DBG && +process.env.GK_CRAFT_SCALE >= 0 && process.env.GK_CRAFT_SCALE !== '' ? +process.env.GK_CRAFT_SCALE : 1;   // test hook only
function craftCancel(p, why) {   // refund the parts of a running craft
  const c = p.crafting; if (!c) return false; p.crafting = null;
  for (const k in c.cost) p.parts[k] = (p.parts[k] || 0) + c.cost[k];
  sendParts(p); sendTo(p.ws, { craftCancel: why || 'cancel', rid: c.rid }); return true;
}
function craftTick(m, now) {
  for (const p of m.players.values()) {
    const c = p.crafting; if (!c) continue;
    if (p.dead || p.room !== c.room || (p.stats && p.stats.health < c.hp) || (p.hurtAt || 0) >= c.startedAt) { craftCancel(p, p.dead ? 'dead' : p.room !== c.room ? 'left' : 'hit'); continue; }
    if (now < c.doneAt) continue;
    if (!giveItem(p, c.out)) { craftCancel(p, 'space'); continue; }
    p.crafting = null; sendTo(p.ws, { crafted: { key: c.out, recipe: c.rid } });
  }
}
// STATIONS-CRAFT-END
// KNOWLEDGE-BEGIN (docs/KNOWLEDGE.md): learning perks and reforging gear at a workbench or knowledge tree
const knowBench = (m, p) => hasStation(m, p, 'workbench') || hasStation(m, p, 'knowledge');
function learn(m, p, id) {   // {learn: perkId}; returns null or a failure reason
  if (!knowBench(m, p)) return 'room';
  const why = G.learnFail(id, p.stats.knowledge, p.brains, p.perks); if (why) return why;
  p.perks.push(id); sendTo(p.ws, { perks: p.perks, learned: id });
  return null;
}
function reforge(m, p, slot) {   // {reforge: slotId}: needs the Reforge perk, a bench, and the parts; the item becomes its '+' twin in place
  if (typeof slot !== 'string' || !SLOT_IDS.has(slot)) return 'item';
  if (!knowBench(m, p)) return 'room';
  if (!G.hasPerk(p.perks, 'reforge')) return 'perk';
  const key = getSlot(p.inv, slot), cost = key && G.reforgeCost(key); if (!cost) return 'item';
  for (const k in cost) if ((p.parts[k] || 0) < cost[k]) return 'parts';
  for (const k in cost) p.parts[k] -= cost[k];
  setSlot(p.inv, slot, key + '+'); recalc(p); sendInv(p); sendParts(p); sendTo(p.ws, { reforged: { slot, key: key + '+' } }); m.dirty = true;
  return null;
}
const BOT_PERKS = ['medic', 'thrifty', 'gourmet', 'scrapper', 'secondwind'];   // bots only take perks that act on their own (no map reading, no reforging)
function botLearn(m, p) { for (const id of BOT_PERKS) if (!learn(m, p, id)) return; }
// KNOWLEDGE-END
function recycle(m, p, slot) { // returns null on success or a failure reason
  if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return 'item';
  const stn = stationAt(m, p, 'recycler'); if (!stn) return 'room';
  const key = getSlot(p.inv, slot), y = key && G.recycleEff(G.recycleFor(key, p.perks), (G.STATIONS.recycler[stn.type] || {}).eff);   // KNOWLEDGE: Scrapper; STATIONS: the home recycler gives 50%
  if (!y) return 'item';
  setSlot(p.inv, slot, null);
  for (const k in y) p.parts[k] = (p.parts[k] || 0) + y[k];
  sendInv(p); sendParts(p); sendTo(p.ws, { recycled: { key, parts: y } }); m.dirty = true;
  return null;
}
function buy(m, p, roomId, idx) { // returns null on success or a failure reason
  if (!Number.isInteger(roomId) || !Number.isInteger(idx) || roomId < 0 || roomId >= m.shops.length || p.room !== 'c' + roomId) return 'room';
  const shop = m.shops[roomId], it = shop && shop[idx];
  if (!it) return 'room';
  if (it.sold) return 'sold';
  const price = p.haggle ? Math.ceil(it.price / 2 / 5) * 5 : it.price;   // USE2: Haggler's Tag
  if (p.gold < price) return 'gold';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  giveItem(p, it.key); p.gold -= price; it.sold = true; if (p.haggle) { p.haggle = false; sendTo(p.ws, { haggled: it.price - price }); }
  sendGold(p); bcast(m, { shops: m.shops });
  return null;
}
function claim(m, p) { // E in a chest room or a weapon/armour/gold mystery room: each player takes its contents once
  if (p.room === VK) return relicClaim(m, p);   // LOOT: the vault relic
  const id = /^c[0-9]+$/.test(p.room || '') ? +p.room.slice(1) : -1;
  if (id < 0 || id >= m.layout.length) return 'room';
  const L = m.layout[id], my = m.mystery[id];
  let key = null, gold = 0;
  if (L === 'chest') key = m.chestKeys[id];
  else if (L === 'mystery' && my && (my.kind === 'weapon' || my.kind === 'armor')) key = my.key;
  else if (L === 'mystery' && my && my.kind === 'gold') gold = my.amount;
  else if (L === 'mystery' && my && my.kind === 'plushie') key = 'x:plushie';   // LOOT: a throwable plushie
  else return 'room';
  p.claimed = p.claimed || new Set();
  if (p.claimed.has(id)) return 'taken';
  if (key && !giveItem(p, key)) return 'space';
  p.claimed.add(id);
  if (gold) { gold = Math.round(gold * goldMul(p)); p.gold += gold; sendGold(p); }
  sendTo(p.ws, { claimed: { room: id, key, gold } }); m.dirty = true;
  return null;
}
const sendInv = p => { if (p.ws) sendTo(p.ws, { inv: p.inv }); };
function giveItem(p, key) { // first free backpack slot; false when full or unknown item
  if (!isItem(key)) return false;
  const i = p.inv.backpack.indexOf(null); if (i < 0) return false;
  p.inv.backpack[i] = key; sendInv(p); return true;
}
function move(p, from, to) { // inventory move/swap, strictly validated
  if (typeof from !== 'string' || typeof to !== 'string' || !SLOT_IDS.has(from) || !SLOT_IDS.has(to) || from === to) return false;
  const a = getSlot(p.inv, from), b = getSlot(p.inv, to);
  if (a == null || !fits(to, a) || !fits(from, b)) return false;
  setSlot(p.inv, to, a); setSlot(p.inv, from, b == null ? null : b);
  recalc(p); return true;
}
const pub = p => ({ ...(p.bot ? { bot: 1, name: p.name } : p.npc ? { npc: p.npc, name: p.name } : { name: p.name }), kills: p.kills || 0, brains: p.brains || 0, ...(p.dc ? { dc: 1 } : null), id: p.id, goblin: p.goblin, wins: p.wins, box: p.box, ...(p.home ? { home: p.home } : null), room: p.room, x: p.x, z: p.z, yaw: p.yaw, stats: p.stats, gear: p.gear }); // never includes the inventory
function addDrop(m, p, items) {
  if (!items.length) return;
  m.drops.push({ id: m.nextDrop++, x: +p.x.toFixed(2), z: +p.z.toFixed(2), items }); if (m.drops.length > 60) m.drops.shift();
  bcast(m, { drops: m.drops });
}
function rollGoblin() { return G.rollGoblin(); }   // GOBTYPES: 12 weighted types (items.js GOBLINS)
const GOBLIN_N = G.GOBLINS.length;
function spawn(slot = Math.floor(Math.random() * 8)) {   // a point in home slot 0..7 (room 'c' + 2 * slot), 3 m off the walls, facing the doorway
  const home = WORLD.homeOf(slot), c = WORLD.CHEST[+home.slice(1)], [x, z] = WORLD.randomPoint(home);
  return { home, box: c.parent, x, z, yaw: Math.atan2(-(c.wallX - x), -(c.wallZ - z)) };
}
function die(ws, p) { // a dead player drops everything where they fell and leaves the match
  const m = p.match; if (p.dead || !m) return;
  if (p.npc) return dieNpc(m, p);
  craftCancel(p, 'dead');   // STATIONS: a running craft is refunded before the death pile is made
  A5.death(m, p);   // ACT5: the claim, carried sack or bucket, blessing and channels are lost
  const items = allItems(p.inv), brain = G.brainKey(p.stats.knowledge); // the brain carries the victim's CURRENT knowledge
  m.deaths = (m.deaths || 0) + 1; p.dead = true; p.diedAt = Date.now(); m.dead.push(p);
  if (ws && ws.readyState === 1) m.specs.set(ws, p);   // FUN: a dead human stays subscribed as a spectator (snapshots, hits, feed) until the socket closes
  addDrop(m, p, [...items, brain, ...elixirDeath(m, p)]);   // ELIXIR: carried elixir drops as a flask, the home dies
  sendTo(ws, { died: { items, brain, by: p.killedBy || null, ...(p.killer ? { killer: p.killer } : null) } });   // killer: { name, npc, w } for the death card
  leave(m, ws);
}
// FUN-BEGIN (kill feed, board, spectators, match summary; see docs/reports/fun.md)
function sendFeed(m, killer, victim) {   // {feed:{k,v,w,f}}: killer name, victim name, weapon name, weapon family (the client picks the verb); mystery-enemy kills carry npc:1
  const w = killer.npc ? null : killer.inv && killer.inv.weapon && G.ITEMS[killer.inv.weapon];
  bcast(m, { feed: { k: killer.name || 'Goblin', v: victim.name || 'Goblin', w: w ? w.name : '', f: killer.npc ? '' : w ? w.family : 'fist', ...(killer.npc ? { npc: 1 } : null) } });
}
function boardRows(m) {   // [id, name, goblin, kills, alive, wins, bot]
  const rows = []; for (const p of m.players.values()) if (!p.npc) rows.push(p); for (const p of m.dead) rows.push(p);
  return rows.map(p => [p.id, p.name, p.goblin, p.kills || 0, p.dead ? 0 : 1, p.wins, p.bot ? 1 : 0]);
}
function sendBoard(m) { if (m.phase === 'play') bcast(m, { board: { left: matchInfo(m).alive, rows: boardRows(m) } }); }
function endMatch(m, winner) {   // once per match: {matchEnd:{winner, top, longest, places, size}} to everyone, spectators included
  if (m.ended) return; m.ended = true;
  const now = Date.now(), goAt = m.goAt || now, dead = m.dead.filter(p => !p.npc);
  const living = [...m.players.values()].filter(p => !p.npc && p.entered && !p.dead && p !== winner).sort((a, b) => (b.kills || 0) - (a.kills || 0));
  const order = [...(winner ? [winner] : []), ...living, ...dead.filter(p => p !== winner).reverse()];   // best first: the winner, other survivors by kills, then the dead, last to die first
  const secs = p => Math.max(0, Math.round(((p.dead ? p.diedAt : now) - goAt) / 1000));
  const places = order.map((p, i) => ({ id: p.id, name: p.name, goblin: p.goblin, bot: p.bot ? 1 : 0, place: i + 1, kills: p.kills || 0, secs: secs(p) }));
  const top = places.slice().sort((a, b) => b.kills - a.kills || a.place - b.place)[0] || null;
  const run = places.filter(r => r.place > 1).sort((a, b) => b.secs - a.secs || a.place - b.place)[0] || null;   // longest survivor besides the winner (who survived by definition)
  const w = places[0] || null, msg = JSON.stringify({ matchEnd: { ...(m.timeLimit ? { timeLimit: 1 } : null), ...(m.crownWin ? { crown: 1 } : null), ...(m.decision ? { decision: m.decision } : null), winner: w && { id: w.id, name: w.name, goblin: w.goblin, bot: w.bot, kills: w.kills }, top, longest: run, places, size: places.length } });
  bcast(m, msg);
  if (!m.specs.size && !humans(m)) matches.delete(m.id);
}
// FUN-END
// SUDDEN-BEGIN (match time limit, DEFAULT awaiting the owner's decision, see docs/FEATURES.md): after round SUDDEN_ROUND every door is open and regeneration stops; if nobody has won after round MAX_ROUND the goblin with the most kills wins, then the most HP
// 5x5 (docs/PLAN-5x5.md 5.2): every round is ROUND_MS (2 min); sudden death after round 5, decided after round 7 (14 min at most)
const SUDDEN_ROUND = DBG && +process.env.GK_SUDDEN_ROUND > 0 ? +process.env.GK_SUDDEN_ROUND : 5, MAX_ROUND = DBG && +process.env.GK_MAX_ROUND > 0 ? +process.env.GK_MAX_ROUND : 7;
const ROUND_MS = 120000;
const NEXT_MS = DBG && +process.env.GK_NEXT_ROUND_MS > 0 ? +process.env.GK_NEXT_ROUND_MS : ROUND_MS;   // length of rounds 2 and up (GK_DEBUG only override; GK_ROUND_MS shortens round 1)
const FF_MS = 10000;   // DEV: {dbgFF:1} (GK_DEBUG only) cuts the round to 0:10
function dbgFF(m, now) {   // the dev fast-forward button: honoured only under GK_DEBUG, while a started round is running; anything else is ignored silently
  if (!DBG || m.phase !== 'play' || !m.started || m.ended) return false;
  m.endsAt = Math.min(m.endsAt, now + FF_MS); broadcastRound(m); return true;
}
function suddenCheck(m) {   // right after m.round++ (the round that just ended is m.round - 1)
  if (m.ended) return;
  if (m.round > SUDDEN_ROUND) { m.sudden = true; m.open = Array.from({ length: nDoors }, (_, i) => i); m.openLeft = {}; m.fizzled = []; }
  if (m.round > MAX_ROUND) timeLimit(m);
}
function timeLimit(m) {
  const live = [...m.players.entries()].filter(([, q]) => !q.npc && q.entered && !q.dead);
  live.sort((a, b) => (b[1].kills || 0) - (a[1].kills || 0) || ((b[1].stats && b[1].stats.health) || 0) - ((a[1].stats && a[1].stats.health) || 0) || a[1].id - b[1].id);
  A5.sortLive(m, live);   // ACT5 (owner Q1): the highest crown claim (5 s at least) decides first, then kills, then HP
  m.timeLimit = true; const best = live[0];
  if (best && isHum(best[1])) win(best[0], best[1]); else endMatch(m, best ? best[1] : null);   // a bot can win too
  for (const [ws, q] of live.slice(1)) if (isHum(q)) die(ws, q);   // the beaten humans become spectators (checkWin ignores a decided match)
}
// SUDDEN-END
// PACE-BEGIN (pacing and economy, docs/reports/fun-pacing.md): a bounty for kills, a little income each round, no dead round, and a showdown when three are left
const PACE = { income: 10, bountyKill: 15, showdownAt: 3 };
function paceBounty(p, t) {   // the killer takes half of the victim's gold plus 15 per kill the victim had made: beating the leader pays, and a runaway leader is a target. Mystery enemies pay nothing and carry nothing.
  if (p.npc || t.npc) return 0;
  const g = Math.min(t.gold || 0, 400), amt = Math.round((g / 2 + PACE.bountyKill * Math.max(0, (t.kills || 0))) / 5) * 5;
  if (amt <= 0) return 0;
  const pay = Math.round(amt * goldMul(p)); t.gold = Math.max(0, (t.gold || 0) - Math.round(g / 2)); p.gold = (p.gold || 0) + pay; sendGold(p); return pay;
}
function paceNoDoor(m, fresh) {   // a round that would open nothing at all (nobody picked) opens one outer door of a room that holds somebody, so a round is never dead time
  if (fresh.length || m.sudden || rule('doorclose')) return fresh;
  const cand = r => (ROOM_DOORS[r] || []).filter(d => !VAULT.includes(d) && !isHatch(d));   // never a vault door, never a home's hatch (it is open anyway)
  const rooms = [...new Set([...m.players.values()].filter(q => !q.npc && q.entered && !q.dead).map(q => parentCell(q.room)))].filter(r => cand(r).length);
  const ds = rooms.length ? cand(rooms[Math.floor(Math.random() * rooms.length)]) : [];
  return ds.length ? [ds[Math.floor(Math.random() * ds.length)]] : fresh;
}
function paceRound(m) {   // right after m.round++: round income for everyone still alive, and the showdown (every door opens) once only three goblins are left
  if (m.ended || m.round < 2) return;
  for (const q of m.players.values()) if (!q.npc && q.entered && !q.dead) { q.gold = (q.gold || 0) + Math.round(PACE.income * goldMul(q)); sendGold(q); }
  if (!m.sudden && !m.showdown && m.round >= 3 && (m.enteredEver || 0) >= 4 && matchInfo(m).alive <= PACE.showdownAt) m.showdown = true;
  if (m.showdown && !m.sudden) { m.open = Array.from({ length: nDoors }, (_, i) => i); m.openLeft = {}; m.fizzled = []; }
}
// PACE-END
// GUARD-BEGIN (docs/reports/door-guard.md): every occupied room except the vault keeps an open exit to a non-vault neighbour. After TRAP_MS without one, the room's own pick (else a random door of it) unlocks and stays open until the round ends. A goblin stuck inside a prop is moved to the nearest free spot.
const GUARD = require('./doorguard.js'), TRAP_MS = DBG && +process.env.GK_TRAP_MS > 0 ? +process.env.GK_TRAP_MS : GUARD.TRAP_MS;
const roomFree = (m, key, x, z) => { const r = RB[key]; return !!r && Math.abs(x - r.cx) <= r.hw - 0.9 && Math.abs(z - r.cz) <= r.hd - 0.9 && !WORLD.inProp(x, z, 0.5, m.layout, true) && roomKeyOf(x, z) === key; };
function guardTick(m, now) {
  if (m.phase !== 'play' || m.ended || !m.goAt || now < m.goAt || now - (m.guardAt || 0) < 200) return;
  m.guardAt = now;
  if (m.guardRound !== m.round) { m.guardRound = m.round; m.trapSince = {}; }
  const occ = new Map();   // room -> [ws, player] in it (bots count as occupants, only humans get the hint)
  for (const [ws, p] of m.players) {
    if (p.npc || !p.entered || p.dead) continue;
    { const k = parentCell(p.room); (occ.get(k) || occ.set(k, []).get(k)).push([ws, p]); }   // 5x5: a goblin at home occupies the arena cell outside (the hatch is always open, the cell must have an exit)
    if (WORLD.inProp(p.x, p.z, 0.2, m.layout, true)) {   // stuck-recovery push-out
      if (!p.stuckAt) p.stuckAt = now;
      else if (now - p.stuckAt >= GUARD.STUCK_MS) { const s = GUARD.freeSpot(p.x, p.z, (x, z) => roomFree(m, p.room, x, z)); p.stuckAt = 0; if (s) { place(p, s[0], s[1]); sendTo(ws, { fix: [r2(s[0]), r2(s[1])] }); m.dirty = true; } }
    } else p.stuckAt = 0;
  }
  const since = m.trapSince;
  const op = d => isOpen(m, d);
  for (const k of Object.keys(since)) if (!occ.has(k) || !GUARD.trapped(k, op, ROOM_DOORS, VAULT)) delete since[k];
  for (const [room, ps] of occ) {
    if (!GUARD.trapped(room, op, ROOM_DOORS, VAULT)) continue;
    if (since[room] == null) { since[room] = now; for (const [ws, p] of ps) if (isHum(p)) sendTo(ws, { exitHint: { ms: TRAP_MS } }); }
    else if (now - since[room] >= TRAP_MS) {
      const d = GUARD.pickExit(room, m.sel, ROOM_DOORS, VAULT);
      delete since[room]; if (d < 0) continue;
      m.open = m.open.concat(d); if (m.fizzled) m.fizzled = m.fizzled.filter(x => x !== d);
      for (const [ws, p] of ps) if (isHum(p)) sendTo(ws, { exitOpen: d });
      broadcastRound(m);
    }
  }
}
// GUARD-END

// COMBAT-BEGIN (server-authoritative melee/ranged attacks, kills and the DEFAULT win rule: last goblin standing; see docs/FEATURES.md)
function checkWin(m) {   // DEFAULT RULE (owner has not decided): >= 2 players entered the rooms, at least one died, exactly one living entered player is left -> that player wins
  if (m.ended || !m.deaths || (m.enteredEver || 0) < 2) return;
  const living = [...m.players.entries()].filter(([, q]) => !q.npc && q.entered && !q.dead);
  if (living.length === 1 && isHum(living[0][1])) win(living[0][0], living[0][1]);   // a bot standing last wins nothing (the match is dropped when no human is left)
  else if (!humans(m) && living.length <= 1 && m.specs.size) endMatch(m, null);   // FUN: only spectators are left: the last bot decides the match
}
function attack(m, ws, p, now, rt) {   // {atk:1, rt}: rate limit by weapon, nearest valid target in range, in the 70 degree cone, same room key; targets are rewound to server time rt (what the attacker saw), at most 200 ms
  if (!p.entered || p.dead) return;
  if (p.carry) return;   // ACT5: no attacks while carrying a bucket or a coin sack
  let cb = G.combat(p.inv.weapon); if (p.npc) cb = { ...cb, dmg: p.npcDmg, cd: p.npcCd };
  const bolt = boltWeapon(p); if (bolt && !cb.bolt) cb = { ...cb, cd: BOLT.cd };   // WEAPONS3: a tuned wand/staff keeps its own cd and bolt damage
    // staffbolt: staves and scepters throw a slow bolt instead of a melee bonk   // mystery enemies have their own damage and cooldown
  if (now < (p.dazeUntil || 0)) return;   // USE2: dazzled
  if (!p.npc) { const dm = dmgMul(p, now); if (dm !== 1) cb = { ...cb, dmg: Math.round(cb.dmg * dm) }; }   // USE2: Wolf Fang, Rage Brew
  if (now - (p.atkAt || 0) < cb.cd * 0.9) return;   // 10% jitter allowance
  p.atkAt = now; bcast(m, { swing: p.id });
  if (bolt) return fireBolt(m, p, now, cb.bolt);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), reach = cb.range + C.slack + (cb.ranged || p.npc ? 0 : G.goblinReach(p.goblin));   // GOBTYPES: the hobgoblin's long arms;   // forward vector, same as the client's movement
  let best = null, bd = Infinity;
  const T = srvT(), at = typeof rt === 'number' && Number.isFinite(rt) ? Math.max(T - REWIND_MAX, Math.min(T, rt)) : T;   // lag compensation: look at the world as the attacker saw it
  for (const [tws, t] of m.players) {
    if (t === p || t.dead || !t.entered) continue;
    const [tx, tz] = at < T ? posAt(t, at) : [t.x, t.z]; if (roomKeyOf(tx, tz) !== p.room) continue;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > reach + (t.npc ? 0 : G.hitRadius(t.goblin) - G.HIT_R)) continue;   // GOBTYPES: bigger goblins are easier to reach
    if (d > 2.5 && inSmoke(m, t, now)) continue;   // UTILITY: nobody shoots into a smoke cloud from beyond melee range
    if (d > 0.05 && (dx * fx + dz * fz) / d < Math.cos(C.cone)) continue;
    if (d > 0.9 && WORLD.segBlocked(p.x, p.z, tx, tz, m.layout)) continue;   // SOLID: no swinging through a crate or barrel
    if (d < bd) { bd = d; best = [tws, t]; }
  }
  if (!best) return;
  const [tws, t] = best, hp0 = t.stats.health; hitTarget(m, ws, p, tws, t, cb.dmg, now, undefined, { melee: !cb.ranged });   // thorns and the scout's dodge only apply to melee
  if (cb.bleed && t.stats.health > 0 && t.stats.health < hp0) t.bleed = { by: p, dmg: cb.bleed[0], left: cb.bleed[1], next: now + BLEED_MS, w: p.inv && p.inv.weapon && G.ITEMS[p.inv.weapon] ? G.ITEMS[p.inv.weapon].name : '' };   // WEAPONS3: whips and tridents leave a bleed
}
// COMBAT-END
// WEAPONS3-BEGIN (bleed from whips and tridents, tuned magic bolts; weapon numbers live in items.js WEAPON_TUNE)
const BLEED_MS = +process.env.GK_BLEED_MS || 1000;   // one bleed tick a second (tests shorten it)
function weapons3Tick(m, now) {
  if (m.phase !== 'play' || m.ended) return;
  for (const [tws, t] of m.players) {
    const bl = t.bleed; if (!bl) continue;
    if (t.dead || !t.entered || bl.left <= 0) { t.bleed = null; continue; }
    if (now < bl.next) continue;
    bl.next = now + BLEED_MS; bl.left--; if (bl.left <= 0) t.bleed = null;
    hitTarget(m, bl.by.ws, bl.by, tws, t, bl.dmg, now, bl.w, { bleed: true });
  }
  if (!rule('staffbolt') && m.bolts && m.bolts.length) boltTick(m, now);   // ruleTick handles bolts when the rule is on
}
// WEAPONS3-END
// RULES-LOGIC-BEGIN (the four experimental rules; every function is a no-op unless its rule is on)
const ruleState = m => RULES.size ? { rules: [...RULES], ...(rule('bribe') ? { bribes: m.bribes || {} } : null), ...(rule('doorclose') ? { openLeft: Object.fromEntries((m.open || []).filter(d => m.openLeft && m.openLeft[d]).map(d => [d, m.openLeft[d]])) } : null) } : null;
function ruleOpen(m, fresh) {   // doorclose: the doors stay open for DOOR_LIFE rounds (m.openLeft counts the rounds still to go), a door picked again is refreshed
  if (!rule('doorclose')) return fresh;
  const left = m.openLeft || {}, next = {}, keep = [];
  for (const d of m.open || []) if ((left[d] || 1) - 1 > 0) { next[d] = left[d] - 1; keep.push(d); }
  for (const d of fresh) { next[d] = DOOR_LIFE; if (!keep.includes(d)) keep.push(d); }
  m.openLeft = next; return keep;
}
function hitTarget(m, ws, p, tws, t, dmg, now, wname, opts) {   // damage, hit broadcast, kill bookkeeping (melee and bolts share it)
  if (t.ward && dmg > 0) { const live = t.ward.until > now; t.ward = null; if (live) { bcast(m, { ward: { id: t.id } }); return; } }   // USE2: a Ward Rune soaks the hit
  { const behind = (p.x - t.x) * -Math.sin(t.yaw || 0) + (p.z - t.z) * -Math.cos(t.yaw || 0) < -0.3 * Math.hypot(p.x - t.x, p.z - t.z);   // GOBTYPES: type perks (dodge, backstab, rage, thick hide)
    const r = G.goblinHit({ goblin: p.goblin, hp: p.stats ? p.stats.health : 0, max: p.stats ? p.stats.maxHealth : 0, npc: p.npc }, { goblin: t.goblin, npc: t.npc }, dmg, { melee: !!(opts && opts.melee), behind });
    if (r.dodged) { bcast(m, { dodge: { from: p.id, to: t.id } }); return; } dmg = r.dmg; }
  dmg = A5.hitMul(m, p, t, dmg, wname, opts);   // ACT5: Fury blessing, Hollow Oak ambush
  let hp = Math.max(0, t.stats.health - dmg);
  if (hp <= 0 && !t.npc && !t.swUsed && G.hasPerk(t.perks, 'secondwind')) { hp = 1; t.swUsed = true; sendTo(t.ws, { secondWind: 1 }); }   // KNOWLEDGE: Second Wind
  t.stats.health = hp; t.hurtAt = now; t.hitBy = p.id; m.dirty = true;   // hitBy: a bot notices whoever hurt it at once
  A5.hurt(m, t, p);   // ACT5: a hit breaks channels and drops carried sacks / buckets
  bcast(m, { hit: { from: p.id, to: t.id, dmg, hp, max: t.stats.maxHealth, dead: hp <= 0, ...(opts && opts.bleed ? { bleed: 1 } : null) } });
  const th = opts && opts.melee && hp > 0 && !p.dead ? G.armorThorns(t.inv && t.inv.armor) + A5.reflect(m, t, dmg) : 0;   /* ACT5: + the Thorns blessing */   // ARMOUR-3: thorns hurt a melee attacker (never lethal, so no kill bookkeeping is needed)
  if (th && p.stats.health > 1) { const ph = Math.max(1, p.stats.health - th); p.stats.health = ph; p.hurtAt = now; bcast(m, { hit: { from: t.id, to: p.id, dmg: th, hp: ph, max: p.stats.maxHealth, dead: false, thorns: 1 } }); }
  if (hp <= 0) { p.kills = (p.kills || 0) + 1; const bounty = paceBounty(p, t); t.killedBy = p.id; { const kw = p.npc ? null : p.inv && p.inv.weapon && G.ITEMS[p.inv.weapon]; t.killer = { name: p.name || 'Goblin', npc: !!p.npc, w: wname || (kw ? kw.name : (p.npc ? '' : 'Fists')) }; } sendTo(ws, { kills: p.kills, ...(bounty ? { bounty } : null) }); sendFeed(m, p, t); die(tws, t); }
}
function boltWeapon(p) { const w = p.inv && p.inv.weapon && G.ITEMS[p.inv.weapon]; if (w && G.combat(p.inv.weapon).bolt) return true; if (!rule('staffbolt')) return false; return !!w && (w.family === 'staff' || w.family === 'scepter'); }
function fireBolt(m, p, now, dmg) {   // staffbolt: a slow projectile straight ahead, 12 m range, never leaves the room it was fired in
  m.bolts = m.bolts || []; m.boltN = (m.boltN || 0) + 1;
  const b = { id: m.boltN, by: p, x: p.x, z: p.z, vx: -Math.sin(p.yaw) * BOLT.speed, vz: -Math.cos(p.yaw) * BOLT.speed, dist: 0, room: p.room, t: now, dmg: Math.round((dmg || BOLT.dmg) * dmgMul(p, now)) };
  m.bolts.push(b); bcast(m, { bolt: { id: b.id, by: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), vx: +b.vx.toFixed(2), vz: +b.vz.toFixed(2), range: BOLT.range } });
}
function boltTick(m, now) {
  if (!m.bolts || !m.bolts.length) return;
  const dt = Math.min(0.1, (now - (m.boltAt || now)) / 1000); m.boltAt = now;
  m.bolts = m.bolts.filter(b => {
    b.x += b.vx * dt; b.z += b.vz * dt; b.dist += BOLT.speed * dt;
    let hit = null;
    for (const [tws, t] of m.players) { if (t === b.by || t.dead || !t.entered || t.room !== b.room) continue; if (Math.hypot(t.x - b.x, t.z - b.z) < BOLT.radius + (t.npc ? 0 : G.hitRadius(t.goblin) - G.HIT_R) && !(Math.hypot(t.x - b.by.x, t.z - b.by.z) > 2.5 && inSmoke(m, t, now))) { hit = [tws, t]; break; } }
    if (hit && WORLD.segBlocked(b.x - b.vx * dt, b.z - b.vz * dt, hit[1].x, hit[1].z, m.layout)) hit = null;   // SOLID: a prop between the bolt and the goblin shields him
    if (hit) { hitTarget(m, b.by.ws, b.by, hit[0], hit[1], b.dmg || BOLT.dmg, now); bcast(m, { boltEnd: { id: b.id, hit: 1 } }); return false; }
    if (WORLD.inProp(b.x, b.z, 0.08, m.layout)) { bcast(m, { boltEnd: { id: b.id } }); return false; }   // SOLID: the bolt dies on a crate, barrel or urn
    if (b.dist >= BOLT.range || roomKeyOf(b.x, b.z) !== b.room) { bcast(m, { boltEnd: { id: b.id } }); return false; }
    return true;
  });
}
function bribe(m, p) {   // bribe: pay gold at your room's panel for +1 weight on its pick this round (counts for the vault's 2-vote rule); returns a failure reason or null
  if (!isArena(p.room) || m.phase !== 'play') return 'room';
  if (m.sel[p.room] == null) return 'pick';
  m.bribes = m.bribes || {};
  if ((m.bribes[p.room] || 0) >= BRIBE.max) return 'max';
  const cost = Math.round(BRIBE.cost * (G.charmEff(p.inv.charm, 'bribe') || 1));   // USE2: Silver Tongue
  if (p.gold < cost) return 'gold';
  p.gold -= cost; m.bribes[p.room] = (m.bribes[p.room] || 0) + 1; sendGold(p); A5.bribe(m, cost); broadcastRound(m);   // ACT5: half of it goes into the Counting House strongbox
  return null;
}
function crownTick(m, now) {   // crown: stand on the vault dais for CROWN_MS without being hurt and you win the match
  let lead = null;
  for (const [ws, p] of m.players) {
    if (p.npc || p.dead || !p.entered) continue;
    const on = p.room === VK && Math.hypot(p.x, p.z) < DAIS_R;
    if (!on) { p.crownAt = 0; continue; }
    if (!p.crownAt || (p.hurtAt || 0) > p.crownAt) p.crownAt = now;   // damage starts the count again
    const prog = (now - p.crownAt) / CROWN_MS;
    if (prog >= 1) { crownWin(m, ws, p); return; }
    if (!lead || prog > lead.prog) lead = { p, prog };
  }
  if (lead) {
    if (m.crownBy !== lead.p.id) { m.crownBy = lead.p.id; bcast(m, { feed: { k: lead.p.name || 'Goblin', msg: ' is claiming the crown!' } }); }
    if (now - (m.crownSent || 0) >= 250) { m.crownSent = now; bcast(m, { crown: { id: lead.p.id, name: lead.p.name || 'Goblin', p: +lead.prog.toFixed(3), ms: CROWN_MS } }); }
  } else if (m.crownBy != null) { m.crownBy = null; bcast(m, { crown: null }); }
}
function crownWin(m, ws, p) {
  m.crownWin = true; bcast(m, { crown: null, feed: { k: p.name || 'Goblin', msg: ' was crowned Goblin King!' } });
  const live = [...m.players.entries()].filter(([, q]) => !q.npc && q.entered && !q.dead && q !== p);
  if (isHum(p)) win(ws, p); else endMatch(m, p);
  for (const [w2, q] of live) if (isHum(q)) die(w2, q);   // the beaten humans become spectators
}
function ruleTick(m, now) {   // called from the 50 ms match loop
  if (m.phase !== 'play' || m.ended) return;
  if (RULES.size === 0) return;
  if (rule('crown')) crownTick(m, now);
  if (rule('staffbolt')) boltTick(m, now);
  if (rule('doorclose') && !m.sudden && m.klaxonRound !== m.round && m.endsAt - now <= KLAXON_MS && m.open && m.open.length) {   // 5 s before the round ends: warn about the doors that close with it
    m.klaxonRound = m.round; const going = m.open.filter(d => m.openLeft && m.openLeft[d] === 1);
    if (going.length) bcast(m, { klaxon: { doors: going, ms: Math.max(0, m.endsAt - now) } });
  }
}
// RULES-LOGIC-END
function eatBrain(p, key) { // applies a brain's knowledge gain, returns the gain
  const gain = Math.round(G.brainGain(key) * (G.charmEff(p.inv.charm, 'know') || 1) * 100) / 100;   // USE2: Scholar's Charm
  p.stats.knowledge = Math.round((p.stats.knowledge + gain) * 100) / 100; p.brains = (p.brains || 0) + 1;
  const heal = G.hasPerk(p.perks, 'gourmet') && !(p.match && p.match.sudden) ? Math.min(G.KNOW.gourmet, p.stats.maxHealth - p.stats.health) : 0; if (heal > 0) p.stats.health += heal;   // KNOWLEDGE: Brain Gourmet
  sendTo(p.ws, { ate: { gain, knowledge: p.stats.knowledge, ...(heal > 0 ? { heal } : null) } }); p.match.dirty = true;
  return gain;
}
function eat(p, slot) { // {eat: slotId}
  if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return false;
  const key = getSlot(p.inv, slot); if (!G.isBrain(key)) return false;
  setSlot(p.inv, slot, null); eatBrain(p, key); sendInv(p); return true;
}
function loot(m, p, a) { // {loot:[dropId, index, 'take'|'eat', expectedKey?]}; returns null or a failure reason
  if (!Array.isArray(a) || a.length < 3 || a.length > 4 || !Number.isInteger(a[0]) || !Number.isInteger(a[1]) || (a[2] !== 'take' && a[2] !== 'eat')) return 'item';
  const di = m.drops.findIndex(x => x.id === a[0]), dr = m.drops[di];
  if (!dr) return 'item';
  if (Math.hypot(p.x - dr.x, p.z - dr.z) > 3) return 'range';
  if (dr.bait != null) return baitTake(m, p, dr, a[2]);   // USE2: Mimic Bait
  const key = dr.items[a[1]];
  if (key == null || (a.length === 4 && a[3] !== key)) return 'item';
  if (G.isFlask(key)) return elixirTakeFlask(m, p, dr, di, a);   // ELIXIR: an Elixir Flask adds to the carried elixir
  if (a[2] === 'eat') { if (!G.isBrain(key)) return 'item'; }
  else if (p.inv.backpack.indexOf(null) < 0) return 'space';
  dr.items.splice(a[1], 1); if (!dr.items.length) m.drops.splice(di, 1);
  if (a[2] === 'eat') eatBrain(p, key); else giveItem(p, key);
  bcast(m, { drops: m.drops }); m.dirty = true;
  return null;
}
function win(ws, p) { // everything carried goes home with the winner, nothing is dropped
  const m = p.match; if (p.dead || !m) return;
  const items = allItems(p.inv);
  p.dead = true; p.diedAt = Date.now(); endMatch(m, p); leave(m, ws);
  sendTo(ws, { won: { items, gold: p.gold, parts: p.parts, ctoken: makeToken({ c: p.charId, g: p.goblin, w: Math.min(9999, p.wins + 1), n: p.name }) } });   // SECURITY: signed character token
}

// JUMP-BEGIN (server side: the jump is cosmetic; movement, walls and attack ranges stay 2D)
const JUMP_MAX_CM = 100;   // the client arc peaks at 90 cm; anything above is clamped
const jumpV = p => r1(p.spd || 0) + 100 * (p.jy | 0);   // snapshot speed slot carries the jump: v = speed + 100 * cm (speed is always < 100)
// JUMP-END
// NET-BEGIN (movement validation, 20 Hz snapshots, position history for lag compensation; see docs/reports/netcode.md)
const T0 = Date.now(), srvT = () => Date.now() - T0;   // server clock in ms, sent with every snapshot and pong
const RSCALE = process.env.GK_DEBUG && +process.env.GK_REGEN_SCALE > 0 ? +process.env.GK_REGEN_SCALE : 1;   // GK_DEBUG only: speeds regeneration up for the tests
const MAXV = 7.5 * Math.max(...G.SPEED) * G.MAX_ARMOR_SPEED * Math.max(1, ...G.CHARM_KEYS.map(k => G.charmEff(k, 'spd') || 1)) * 1.1, BUDGET = 1.0, SLACK = 0.3, MOVE_SLACK = 0.3;   // BALANCE: the fastest class multiplier comes from items.js SPEED (shared with the client)   // fastest goblin sprint (game.js) x 1.1; the distance a client may bank while idle; SLACK: bounds tolerance in m; MOVE_SLACK: extra distance per move (SECURITY: was 1.25 / 1.2 / 0.3 per move)
const HIST_MS = 1000, REWIND_MAX = 200;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const PROP_R = 0.33;   // SOLID: the walker radius the server checks against prop footprints (game.js RAD is 0.45; the gap keeps a slide along an edge from being corrected)
function inBounds(x, z) {   // inside a room of the grid, or inside one of the 16 attached rooms (not the void around them)
  if (Math.abs(x) > LIM || Math.abs(z) > LIM) return false;
  if (Math.abs(x) <= WORLD.HALF && Math.abs(z) <= WORLD.HALF) return true;
  const id = WORLD.attachedAt(x, z, SLACK);
  return id >= 0 && 'c' + id === roomKeyOf(x, z);
}
function pathOk(m, x0, z0, x1, z1, who) {   // walk the segment in 0.2 m steps: every room change must go through an OPEN door, inside its opening
  if (who) who.lockDeny = false;   // ELIXIR: set again by homeGate when a Door Lock refuses this step
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2)); let prev = roomKeyOf(x0, z0); const inside0 = WORLD.inProp(x0, z0, PROP_R, m.layout, true);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
    if (!inBounds(x, z)) return false;
    if (!inside0 && WORLD.inProp(x, z, PROP_R, m.layout, true)) return false;   // SOLID: crates, barrels, urns, pedestal, vault pillars (the client keeps 0.45, the server accepts 0.33)
    const k = roomKeyOf(x, z); if (k === prev) continue;
    const d = DOOR_AT[prev + '|' + k];
    if (!d || !isOpen(m, d.id) || Math.abs((d.axis === 'x' ? x : z) - d.c) > d.hw) return false;
    if (who && m.homes && isHome(k) && !homeGate(m, who, k, Date.now())) return false;   // ELIXIR: Door Lock pick bar
    prev = k;
  }
  return true;
}
function place(p, x, z) {   // hard set (spawn, debug teleport): resets speed budget and history
  const prev = p.room; p.x = x; p.z = z; p.box = boxOf(x, z); p.room = roomKeyOf(x, z); p.spd = 0; p.fixAt = 0; p.budget = BUDGET; p.mvAt = Date.now(); p.mvT = srvT(); p.hist = [[p.mvT, x, z]]; p.sd = true;
  if (p.room !== prev) p.roomAt = p.mvAt;   // BOTS: when he arrived in this room (bots take a moment to notice newcomers)
}
function applyMove(m, ws, p, x, z, yaw, now, jy) {   // {m:[x,z,yaw]}: accept, or keep the old position and answer {fix:[x,z]}
  x = clamp(x); z = clamp(z); yaw = Math.max(-1e3, Math.min(1e3, yaw));
  const dt = p.mvAt ? Math.min(0.5, (now - p.mvAt) / 1000) : 0.066; p.mvAt = now; const prevRoom = p.room;
  const hv = !!(p.carry && p.carry.heavy);   // ACT5: a carried coin sack: 70% of the walk (x1.3 for jitter), no sprint, and a small slack so the limit holds over time (the normal 0.3 m slack would allow 9 m/s at 15 messages a second)
  p.budget = Math.min(hv ? 0.8 : BUDGET, (p.budget == null ? BUDGET : p.budget) + dt * (hv ? Math.min(MAXV, walkOf(p) * 0.7 * 1.3) : MAXV) * (now < (p.tonicUntil || 0) + 500 ? G.ITEMS['x:tonic'].n : 1) * (G.charmEff(p.inv.charm, 'spd') || 1));   // UTILITY: a speed tonic raises the movement allowance
  const dist = Math.hypot(x - p.x, z - p.z);
  if (dist > 0.0005 && (dist > p.budget + (hv ? 0.08 : MOVE_SLACK) || !pathOk(m, p.x, p.z, x, z, p))) {
    if (now - (p.fixAt || 0) > 150) { p.fixAt = now; sendTo(ws, { fix: [r2(p.x), r2(p.z)] }); if (!p.lockDeny && secFix(p, ws, now)) return false; }   // ELIXIR: a Door Lock refusal is not a speed-hack correction
    if (yaw !== p.yaw) { p.yaw = yaw; p.sd = true; }
    return false;
  }
  p.budget = Math.max(0, p.budget - dist);
  { const j = jy > 0 ? Math.min(JUMP_MAX_CM, Math.round(jy)) : 0; if (j !== (p.jy | 0)) { p.jy = j; p.sd = true; } }   // JUMP: cosmetic height in cm, never used for collision or hits
  const t = srvT(), v = dist < 0.004 ? 0 : Math.min(12, dist / Math.max(dt, 0.04));
  const spd = v === 0 ? 0 : p.spd ? p.spd * 0.6 + v * 0.4 : v;
  if (dist > 0.0005 || yaw !== p.yaw || r1(spd) !== r1(p.spd || 0)) p.sd = true;
  if (dist > 0.0005) {   // history for lag compensation; a long-still player gets a hold entry so the rewind does not slide him
    const h = p.hist || (p.hist = []), last = h[h.length - 1];
    if (last && t - last[0] > 150) h.push([t - 1, last[1], last[2]]);
    h.push([t, x, z]); while (h.length > 2 && h[1][0] < t - HIST_MS) h.shift();
  }
  p.x = x; p.z = z; p.yaw = yaw; p.spd = spd; p.mvT = t; p.box = boxOf(x, z); p.room = roomKeyOf(x, z); if (p.room !== prevRoom) p.roomAt = now; noteRoom(m, p, prevRoom);
  return true;
}
function posAt(p, T) {   // where p was at server time T (position history, linear interpolation)
  const h = p.hist; if (!h || !h.length || T >= h[h.length - 1][0]) return [p.x, p.z];
  if (T <= h[0][0]) return [h[0][1], h[0][2]];
  let i = h.length - 2; while (i > 0 && h[i][0] > T) i--;
  const a = h[i], b = h[i + 1], f = (T - a[0]) / Math.max(1, b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function snapshots(m) {   // {s:[t, id,x,z,yaw,speed,age, ...]} with the players that moved since the last tick, to everyone but themselves; age = ms since that position was received
  const now = Date.now(); for (const p of m.players.values()) if (p.spd && now - p.mvAt > 150) { p.spd = 0; p.sd = true; }   // no update for a while: tell the others he stopped (clients only send when something changed)
  let moved = null;
  for (const p of m.players.values()) if (p.sd) { p.sd = false; (moved = moved || []).push(p); }
  if (!moved) return;
  const t = srvT(), chunk = moved.map(p => p.id + ',' + r2(p.x) + ',' + r2(p.z) + ',' + r3(p.yaw) + ',' + jumpV(p) + ',' + Math.min(255, Math.max(0, t - (p.mvT || t))));   // PERF: each mover is formatted once, every receiver just joins the strings (same JSON as before: {"s":[t,id,x,z,yaw,v,age,...]})
  for (const [ws, q] of m.players) {
    if (q.bot || q.npc || ws.readyState !== 1) continue;
    let s = '{"s":[' + t; for (let i = 0; i < moved.length; i++) if (moved[i] !== q) s += ',' + chunk[i];
    if (s.length > 6 + ('' + t).length) ws.send(s + ']}');
  }
  if (m.specs.size) { const all = '{"s":[' + t + ',' + chunk.join(',') + ']}'; for (const ws of m.specs.keys()) sendTo(ws, all); }   // FUN: spectators get every mover
}
// NET-END

// BOTS-BEGIN (server bots that fill the match to 8 + hostile mystery-room enemies; see docs/reports/bots.md)
// Bots are normal player records (bot:true, ws:null) kept in m.players under a stub key whose readyState is 0, so sendTo/bcast skip them. They move ONLY through applyMove(), so walls, doors and the speed budget apply to them like to humans.
const BOT_GRACE = DBG && process.env.GK_BOT_GRACE_MS !== undefined && +process.env.GK_BOT_GRACE_MS >= 0 ? +process.env.GK_BOT_GRACE_MS : 20000;   // no bot attacks in round 1 or in this long after GO (GK_DEBUG only override)
const BOT_NAMES = ['Snikt', 'Grubb', 'Mozzle', 'Skritch', 'Nobb', 'Gribble', 'Zug', 'Pogg', 'Snaga', 'Murk', 'Blit', 'Krag', 'Fizzle', 'Drog', 'Wort', 'Skab', 'Yibb', 'Glorp', 'Narg', 'Tikk'];
const RB = {};   // room key -> bounds { cx, cz, hw, hd }
for (const r of WORLD.ROOMS) RB[r.key] = { cx: r.cx, cz: r.cz, hw: r.hw, hd: r.hd };
const ADJ = {};   // room key -> edges { to, door, w1, w2 }: w1 is a point inside this room in front of the doorway, w2 a point inside the next room behind it
for (const k of Object.keys(DOOR_AT)) {
  const [a, b] = k.split('|'), d = DOOR_AT[k], A = RB[a], B = RB[b];
  const e = d.axis === 'z' ? (s => ({ w1: [A.cx + s * A.hw - s * 1.5, d.c], w2: [A.cx + s * A.hw + s * 1.5, d.c] }))(Math.sign(B.cx - A.cx))
                           : (s => ({ w1: [d.c, A.cz + s * A.hd - s * 1.5], w2: [d.c, A.cz + s * A.hd + s * 1.5] }))(Math.sign(B.cz - A.cz));
  (ADJ[a] = ADJ[a] || []).push({ to: b, door: d.id, ...e });
}
const DIST_V = (() => { const dist = { [VK]: 0 }, q = [VK]; for (let h = 0; h < q.length; h++) for (const e of ADJ[q[h]] || []) if (dist[e.to] === undefined) { dist[e.to] = dist[q[h]] + 1; q.push(e.to); } return dist; })();   // hops to the vault, all doors
const DOOR_ROOMS = []; for (const k of Object.keys(DOOR_AT)) { const [a, b] = k.split('|'); DOOR_ROOMS[DOOR_AT[k].id] = [a, b]; }
const rnd = (a, b) => a + Math.random() * (b - a);
const pointIn = (key, margin) => { const r = RB[key]; return [r.cx + rnd(-1, 1) * (r.hw - margin), r.cz + rnd(-1, 1) * (r.hd - margin)]; };
const clampIn = (key, x, z, margin) => { const r = RB[key]; return [Math.max(r.cx - r.hw + margin, Math.min(r.cx + r.hw - margin, x)), Math.max(r.cz - r.hd + margin, Math.min(r.cz + r.hd - margin, z))]; };
const BS = { cur: 0, n: 0, sum: 0, max: 0, calls: 0, bad: 0 };   // bot tick timing (GK_DEBUG {botstat:1})
const botSweepEnd = () => { if (BS.cur > 0) { BS.n++; BS.sum += BS.cur; if (BS.cur > BS.max) BS.max = BS.cur; BS.cur = 0; } };

function bfsPath(m, from, to) {   // edges over currently OPEN doors, or null
  if (from === to) return [];
  const prev = { [from]: null }, q = [from];
  for (let h = 0; h < q.length; h++) for (const e of ADJ[q[h]] || []) {
    if (prev[e.to] !== undefined || !isOpen(m, e.door)) continue;
    prev[e.to] = { u: q[h], e };
    if (e.to === to) { const path = []; for (let k = to; prev[k]; k = prev[k].u) path.push(prev[k].e); return path.reverse(); }
    q.push(e.to);
  }
  return null;
}
function reach(m, from) {   // hops to every room reachable through open doors
  const dist = { [from]: 0 }, q = [from];
  for (let h = 0; h < q.length; h++) for (const e of ADJ[q[h]] || []) if (dist[e.to] === undefined && isOpen(m, e.door)) { dist[e.to] = dist[q[h]] + 1; q.push(e.to); }
  return dist;
}
const tag = (w, door) => { const a = [w[0], w[1]]; a.door = door; return a; };   // a doorway waypoint remembers its door: follow() gives up when that door has closed meanwhile
function routeTo(m, p, key, pt) {   // set p.brain.route: waypoints through the open doors to a point in room `key`; false when unreachable
  const path = bfsPath(m, p.room, key); if (!path) return false;
  const r = []; for (const e of path) r.push(tag(e.w1, e.door), tag(e.w2, e.door));
  r.push(pt || pointIn(key, 1.5)); p.brain.route = r; p.brain.cross = path.length > 0; return true;
}
const BN = require('./botnav.js');   // NAV: obstacle steering, stuck detection, stat-based item picks (see docs/reports/bot-nav.md)
const NO_OBS = [];
function obstaclesFor(m, room) {   // solid props of a room as [{x, z, hw, hd} | {x, z, r}]: world.js (obstaclesIn(room) or OBSTACLES), else the match (m.obstacles: an array, or a map room -> array). [] when there are none.
  let o = m && m.obstacles ? (Array.isArray(m.obstacles) ? m.obstacles : m.obstacles[room]) : null;
  if (!o && typeof WORLD.obstaclesIn === 'function') o = WORLD.obstaclesIn(room, m);
  if (!o && Array.isArray(WORLD.OBSTACLES)) o = WORLD.OBSTACLES;
  if (!o || !o.length) return NO_OBS;
  return o.some(q => q.room !== undefined) ? o.filter(q => q.room === undefined || String(q.room) === room) : o;   // a flat list may tag each obstacle with its room
}
const betterW = (cur, key) => key && info(key) && info(key).type === 'weapon' && info(key).attack > (cur ? info(cur).attack : -1);
const armorVal = it => it && it.type === 'armor' ? (it.key ? G.armorScore(it.key) : BN.armorValue(it)) : -1;   // ARMOUR-3: bots weigh health against speed and thorns (items.js armorScore)
const betterA = (cur, key) => key && info(key) && info(key).type === 'armor' && armorVal(info(key)) > (cur ? armorVal(info(cur)) : 0);
function equipBest(m, p) {   // put the best weapon/armour from the backpack and quick slots on, by stats only (the same inventory rules as the players: move())
  const slots = () => [...p.inv.backpack.map((k, i) => ['b' + i, k]), ...(p.inv.quick || []).map((k, i) => ['q' + i, k])];
  const w = BN.best(slots().map(s => s[1]), info, BN.weaponValue, p.inv.weapon ? BN.weaponValue(info(p.inv.weapon)) : -1);
  if (w) move(p, slots().find(s => s[1] === w)[0], 'weapon');
  const a = BN.best(slots().map(s => s[1]), info, armorVal, p.inv.armor ? armorVal(info(p.inv.armor)) : 0);
  if (a) move(p, slots().find(s => s[1] === a)[0], 'armor');
  if (!p.inv.charm) { const c = slots().find(s => s[1] && info(s[1]) && info(s[1]).type === 'charm'); if (c) move(p, c[0], 'charm'); }   // USE2: bots wear a charm
  m.dirty = true;
}
function botHeal(m, p, now) {   // drink the right healing consumable (any item with a `heal` value) when hurt; bots only, one per 1.2 s
  if (p.stats.health >= p.stats.maxHealth || now - (p.healAt || 0) < 1200) return false;
  const slots = [...p.inv.backpack.map((k, i) => ['b' + i, k]), ...(p.inv.quick || []).map((k, i) => ['q' + i, k])].filter(s => s[1]);
  const k = BN.pickHeal(slots.map(s => s[1]), info, p.stats.health, p.stats.maxHealth); if (!k) return false;
  setSlot(p.inv, slots.find(s => s[1] === k)[0], null); p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + BN.healValue(info(k))); p.healAt = now; m.dirty = true; return true;
}
function fillBots(m) {   // up to CAP goblins: bots get the normal goblin odds, START gear, a goblin name and a home of their own
  const used = new Set([...m.players.values()].map(p => p.home)), free = [0, 1, 2, 3, 4, 5, 6, 7].filter(s => !used.has(WORLD.homeOf(s)));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const taken = new Set([...m.players.values()].map(p => (p.name || '').toLowerCase())), names = BOT_NAMES.filter(b => !taken.has(b.toLowerCase())).sort(() => Math.random() - 0.5); let w = 0, n = 0; for (const p of m.players.values()) { w += p.wins; n++; }
  while (m.players.size < CAP && free.length) {
    const sp = spawn(free.pop()), key = { readyState: 0, bot: true };
    const p = { id: nextId++, wins: n ? Math.round(w / n) : 0, ws: null, key, bot: true, name: names.pop() || 'Grub' + nextId, match: m, box: sp.box, home: sp.home, yaw: sp.yaw, ready: true };
    equip(p, rollGoblin()); place(p, sp.x, sp.z); p.brain = newBrain(p, (3.6 + Math.random() * 1.0) * G.SPEED[p.goblin]); m.players.set(key, p);   // BALANCE: bots walk at their class speed like humans
  }
  m.dirty = true;
}
function newBrain(p, speed) {
  const flee = 0.15 + Math.random() * 0.25;   // AI: personality, rolled once per bot. aggr: engagement range and nerve; flee: HP fraction at which it runs (15-40 %); greed: loot and merchant priority; patience: how late it votes, how long it waits at a doorway
  return { speed, route: [], cross: false, last: Date.now(), reactAt: 0, pauseUntil: 0, idleUntil: 0, tgt: null, seen: { [p.room]: 1 }, done: {}, skip: new Set(), seenRound: 0, votedRound: 0, voteAt: 0, mode: '', stuck: 0,
    aggr: rnd(0.3, 1), flee, caution: (flee - 0.15) / 0.25, greed: Math.random(), patience: Math.random(),
    mem: {}, scan: null, scanAt: 0, scanDir: Math.random() < 0.5 ? -1 : 1, strafe: Math.random() < 0.5 ? -1 : 1, strafeAt: 0, orbitR: 1.5, rangeD: rnd(5, 8), backUntil: 0, jump: null, jumpAt: 0, kills: 0, lastHurt: 0, lootAt: 0, lootOff: 0, waitUntil: 0, blindUntil: 0, avoidUntil: 0, sdAt: 0, reAt: 0 };
}

// ---- mystery enemies: hostile NPCs in their mystery room, spawned at GO. They are in m.players with npc:kind but never count for "goblins left", the win or the match size.
const NPC = {   // hp, dmg (per hit), cd ms, speed m/s, reaction ms [lo, hi], weapon, loot: [number of items, min tier 0-5], look = goblin model index for the client
  troll:   { hp: 160, dmg: 28, cd: 1100, speed: 3.0, react: [350, 550], weapon: 'w:club', loot: [2, 2], look: 2, name: 'Troll' },
  archer:  { hp: 35,  dmg: 9,  cd: 800,  speed: 3.6, react: [250, 400], weapon: 'w:bow', loot: [1, 1], look: 0, name: 'Archer' },
  speedy:  { hp: 30,  dmg: 6,  cd: 450,  speed: 6.4, react: [120, 220], weapon: 'w:dagger', loot: [1, 1], look: 0, name: 'Speedy' },
  dumb:    { hp: 50,  dmg: 8,  cd: 900,  speed: 2.6, react: [700, 1100], weapon: 'w:club', loot: [1, 0], look: 1, name: 'Dumb' },
  regular: { hp: 40,  dmg: 10, cd: 700,  speed: 4.2, react: [250, 400], weapon: 'w:sword', loot: [1, 0], look: 1, name: 'Goblin' },
  rat:     { hp: 5,   dmg: 2,  cd: 900,  speed: 2.2, react: [500, 800], weapon: 'w:dagger', loot: [0, 0], look: 0, name: 'Rat' },   // ELIXIR: the Rat Swarm sendable (no loot)
};
function spawnNpc(m, id) {   // FUN: the enemy of mystery room c<id> appears when a goblin first walks in
  if (m.phase !== 'play' || m.npcSpawned.has(id)) return;
  {
    const my = m.mystery[id]; if (m.layout[id] !== 'mystery' || !my || my.kind !== 'enemy' || !NPC[my.enemy]) return;
    m.npcSpawned.add(id); m.dirty = true;
    const S = NPC[my.enemy], c = WORLD.CHEST[id], key = { readyState: 0, npc: true };
    const p = { id: nextId++, wins: 0, ws: null, key, npc: my.enemy, name: S.name, match: m, box: -1, yaw: 0, ready: true, entered: true, npcDmg: S.dmg, npcCd: S.cd };
    equip(p, S.look); p.inv.weapon = S.weapon; p.inv.armor = null; recalc(p); p.stats.maxHealth = S.hp; p.stats.health = S.hp; p.stats.attack = S.dmg; p.gear = { weapon: S.name + "'s weapon", armor: 'None' };
    place(p, c.cx, c.cz); p.home = [c.cx, c.cz]; p.brain = newBrain(p, S.speed); p.brain.react = S.react; m.players.set(key, p);
  }
}
function noteRoom(m, p, prev) { if (p.room !== prev && !p.npc) A5.room(m, p, prev); /* ACT5 */ if (p.room !== prev && !p.npc && p.entered) { const mm = /^c(\d+)$/.exec(p.room); if (mm) spawnNpc(m, +mm[1]); } }
function npcLoot(kind) {
  const S = NPC[kind], out = [];
  if (!S.loot[0]) return out;   // ELIXIR: rats carry nothing
  for (let i = 0; i < S.loot[0]; i++) {
    let k = null; for (let t = 0; t < 40; t++) { k = (i % 2 ? G.randomArmorKey : G.randomWeaponKey)(); if (G.ITEMS[k].tierN >= S.loot[1]) break; }
    out.push(k);
  }
  if (Math.random() < 0.4) out.push(G.pickUtil());   // UTILITY: a mystery-room enemy sometimes carries a utility item
  if (Math.random() < 0.15) out.push(G.pickCharm());   // USE2: or a charm
  return out;
}
function dieNpc(m, p) {   // loot by type, counts as a kill for the attacker (done in attack()), not as a death
  if (p.actNpc) return A5.npcDied(m, p);   // ACT5: husks, rootlings, wardens, wisps
  p.dead = true; m.players.delete(p.key); m.dirty = true; sendBoard(m);
  addDrop(m, p, npcLoot(p.npc));
}

// ---- the brain
const NPC_AGGRO = DBG && process.env.GK_NPC_AGGRO_MS !== undefined && +process.env.GK_NPC_AGGRO_MS >= 0 ? +process.env.GK_NPC_AGGRO_MS : 1500;   // a mystery enemy only turns on a goblin that has been inside its room this long
function graceOver(m, now) { return m.round > 1 && now - m.goAt >= BOT_GRACE; }
const GANG_PEN = 4.5, HUMAN_PEN = 1.2;   // fairness: metres of "distance" a bot adds for a target that others already attack, and for a human target
// FAIR-BEGIN (bot fairness: at most MAX_GANG bots swing at one goblin at a time, the rest circle at HOLD_D; a bot needs BOT_NOTICE ms to notice a newcomer unless it was hit; BOT_MISS of its swings are deliberate misses)
const MAX_GANG = 2, HOLD_D = 3.6, BOT_NOTICE = DBG && process.env.GK_BOT_NOTICE_MS !== undefined ? +process.env.GK_BOT_NOTICE_MS : 700, BOT_MISS = 0.3, NPC_MISS = 0.15;
function focusOf(m) {   // target id -> how many bots are attacking it right now, and m.focusIds: target id -> attacker ids in order (the first MAX_GANG fight, the others hold back). Rebuilt once per bot tick.
  const f = {}, ids = {}; for (const q of m.players.values()) { const t = q.bot && !q.dead && q.brain && q.brain.tgt; if (t && !t.dead) { f[t.id] = (f[t.id] || 0) + 1; (ids[t.id] = ids[t.id] || []).push(q.id); } }
  for (const k in ids) ids[k].sort((a, b) => a - b); m.focusIds = ids; return f;
}
const noticed = (p, q, now) => !p.bot || !q.roomAt || now - q.roomAt >= BOT_NOTICE || (p.hitBy === q.id && now - (p.hurtAt || 0) < 2500);   // a bot ignores someone who just walked in, unless that someone hit it
// FAIR-END
// AI-BEGIN (human-like bots: perception, player-like movement, personality, target judgement; see docs/reports/bots-2.md). Bots only; mystery enemies (p.npc) keep the plain brain.
const SPRINT = 7.5, WALK = 4.6, COS_FOV = Math.cos(75 * Math.PI / 180), SEE_FAR = 12, SEE_NEAR = 2.5, SEE_HIT_MS = 3000, SEE_MEM_MS = 4000;   // vision: 150 degree cone to 12 m, 2.5 m all round, 3 s after a hit, 4 s of memory
const BOT_EMOTE_P = DBG && process.env.GK_BOT_EMOTE_P !== undefined ? +process.env.GK_BOT_EMOTE_P : 0.3;   // chance of an emote after a kill (GK_DEBUG only override, for the tests)
const sprintOf = p => SPRINT * G.SPEED[p.goblin | 0] * G.armorSpeed(p.inv.armor), walkOf = p => WALK * G.SPEED[p.goblin | 0] * G.armorSpeed(p.inv.armor);   // the human speeds of this goblin class
const hpFrac = q => q.stats.health / Math.max(1, q.stats.maxHealth);
const power = q => Math.sqrt(Math.max(1, q.stats.health) * Math.max(1, q.stats.attack));   // how dangerous a goblin looks: health bar x weapon
const angNorm = a => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; };
const yawTo = (p, x, z) => Math.atan2(-(x - p.x), -(z - p.z));
const humanIn = (m, room) => { for (const q of m.players.values()) if (isHum(q) && !q.dead && q.room === room) return true; return false; };
function mv(m, p, x, z, yaw, now) {   // the one place a brain moves: applyMove plus the cosmetic jump arc (height in cm)
  const b = p.brain; let jy = 0;
  if (b.jump) { const f = (now - b.jump.t0) / b.jump.dur; if (f >= 1) b.jump = null; else jy = Math.round(b.jump.h * 4 * f * (1 - f)); }
  if (x !== p.x || z !== p.z) {
    // 5x5 test migration fix: bots sprint between rooms at ~8.4 m/s, so one sweep after a >140 ms server gap asked for 1.4-1.9 m, more than the movement budget (BUDGET 1.0 + MOVE_SLACK 0.3)
    // allows, and applyMove refused the move (tests/bots.test.js saw 7-59 refused bot moves, all in round 2+). A bot step is now capped at 1.2 m, like any other walker.
    { const st = Math.hypot(x - p.x, z - p.z); if (st > 1.2) { x = p.x + (x - p.x) * 1.2 / st; z = p.z + (z - p.z) * 1.2 / st; } }
    [x, z] = WORLD.slide(p.x, p.z, x, z, 0.45, m.layout, true);   // SOLID: bots and mystery enemies walk around crates, barrels, urns, the pedestal and the vault pillars
    // 5x5 test migration fix: a ~1 m bot step can clip a prop's footprint with its CHORD although both end points are clear (the home crate beside the doorway made bots
    // bounce off it 4 times in a row: the server refused the move, tests/bots.test.js counted 7-59 refused moves). Shorten such a step (halve up to 3 times) until the chord is clear.
    for (let k = 0; k < 3 && Math.hypot(x - p.x, z - p.z) > 0.15 && [0.25, 0.5, 0.75].some(f => WORLD.inProp(p.x + (x - p.x) * f, p.z + (z - p.z) * f, PROP_R, m.layout, true)) && !pathOk(m, p.x, p.z, x, z); k++) { x = p.x + (x - p.x) / 2; z = p.z + (z - p.z) / 2; }
  }
  return applyMove(m, null, p, x, z, yaw, now, jy);
}
function startJump(p, now) { const b = p.brain; if (b.jump || now < b.jumpAt) return; b.jump = { t0: now, dur: rnd(480, 620), h: rnd(55, 90) }; b.jumpAt = now + rnd(30000, 60000); }   // at most 1-2 a minute
function inView(p, q) {   // 2.5 m all round, or inside the 150 degree cone in front of the yaw within 12 m
  const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
  if (d > 2.5 && p.match && p.match.smokes && p.match.smokes.length && inSmoke(p.match, q, Date.now())) return false;   // UTILITY: bots cannot see into a smoke cloud
  return d <= SEE_NEAR || (d <= SEE_FAR && (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d >= COS_FOV);
}
function canSee(p, q, now) { return inView(p, q) || (p.hitBy === q.id && now - (p.hurtAt || 0) < SEE_HIT_MS && now >= (p.brain.blindUntil || 0)); }   // a hit from behind is only understood after the turn-around delay
function perceive(m, p, now) {   // the goblins this bot notices right now (same room, FAIR notice delay, in view); remembers where it saw them
  const b = p.brain, out = [];
  if (now < (p.dazeUntil || 0)) return out;   // USE2: dazzled bots see nothing
  for (const q of m.players.values()) {
    if (q === p || q.dead || !q.entered || q.room !== p.room || !noticed(p, q, now) || !canSee(p, q, now)) continue;
    const e = b.mem[q.id] || (b.mem[q.id] = {}); e.x = q.x; e.z = q.z; e.t = now; e.room = q.room; out.push(q);
  }
  return out;
}
function pickTarget(m, p, now, vis) {   // aggression sets the range and the nerve to take on a stronger goblin; weaker and wounded targets are preferred
  const b = p.brain, engage = 4.5 + b.aggr * 3.5, willing = 1.8 + b.aggr * 6, me = power(p), waiting = now < b.waitUntil;
  let best = null, bs = 1e9;
  for (const q of vis) {
    const d = Math.hypot(q.x - p.x, q.z - p.z), hit = p.hitBy === q.id && now - (p.hurtAt || 0) < SEE_HIT_MS, cur = b.tgt === q, rel = power(q) / me;
    if (!hit && d > SEE_NEAR && (d >= engage + (cur ? 1.5 : 0) || waiting || rel > willing)) continue;
    let sc = d - (cur ? 1 : 0);
    const others = (m.focus ? m.focus[q.id] || 0 : 0) - (cur ? 1 : 0);
    if (others >= 2) sc += GANG_PEN * (others - 1);
    if (isHum(q)) sc += HUMAN_PEN;
    sc += 2.2 * Math.log2(Math.max(0.25, Math.min(8, rel))) * (1.4 - b.aggr) - (1 - hpFrac(q)) * 3;
    if (sc < bs) { bs = sc; best = q; }
  }
  return best;
}
function idleLook(m, p, now) {   // standing around: every 1-3 s turn 60-180 degrees over about half a second, so something behind us gets noticed
  const b = p.brain, s = b.scan;
  if (s) { const f = (now - s.t0) / 500; if (f >= 1) { b.scan = null; mv(m, p, p.x, p.z, s.y1, now); } else mv(m, p, p.x, p.z, s.y0 + (s.y1 - s.y0) * f, now); return; }
  if (!b.scanAt) b.scanAt = now + rnd(300, 1500);
  if (now >= b.scanAt) {
    if (Math.random() < 0.2) b.scanDir = -b.scanDir;
    const y0 = angNorm(p.yaw); b.scan = { t0: now, y0, y1: y0 + b.scanDir * rnd(60, 180) * Math.PI / 180 }; b.scanAt = now + rnd(1000, 3000);
  } else if (b.jump) mv(m, p, p.x, p.z, p.yaw, now);
}
function startFlee(m, p, from, nearest, now) {   // run for an open doorway (the nearest one, or the one farthest from `from`) and stay out of this room for a while
  const b = p.brain, es = (ADJ[p.room] || []).filter(e => isOpen(m, e.door));
  if (es.length) {
    es.sort(nearest ? (a, c) => Math.hypot(a.w1[0] - p.x, a.w1[1] - p.z) - Math.hypot(c.w1[0] - p.x, c.w1[1] - p.z) : (a, c) => Math.hypot(c.w1[0] - from.x, c.w1[1] - from.z) - Math.hypot(a.w1[0] - from.x, a.w1[1] - from.z));
    const e = es[0]; b.route = [tag(e.w1, e.door), tag(e.w2, e.door), [e.w2[0] + (e.w2[0] - e.w1[0]) * 1.2, e.w2[1] + (e.w2[1] - e.w1[1]) * 1.2]]; b.cross = true;
  } else { b.route = [clampIn(p.room, p.x + (p.x - from.x) * 9, p.z + (p.z - from.z) * 9, 0.8)]; b.cross = false; }
  b.mode = 'flee'; b.avoidRoom = p.room; b.avoidUntil = now + rnd(10000, 20000) * (0.6 + b.caution * 0.8); b.tgt = null; b.eng = null; b.search = null; b.waitUntil = 0; b.scan = null;
}
function onHurt(m, p, now) {   // a new hit landed on this bot
  const b = p.brain; b.lastHurt = p.hurtAt;
  let a = null; for (const q of m.players.values()) if (q.id === p.hitBy) { a = q; break; }
  if (a && !a.dead && a.room === p.room && !inView(p, a)) { b.blindUntil = now + rnd(250, 500); b.turnTo = a.id; b.reactAt = Math.min(b.reactAt, b.blindUntil); } else b.blindUntil = 0;   // hit from outside the view: turn toward the attacker after 250-500 ms
  b.hitT = (b.hitT || []).filter(t => now - t < 5000); b.hitT.push(now);
  if (b.hitT.length >= 2 && now - b.lootAt < 2500) {   // hit twice while looting: stop looting, then fight or run according to caution
    b.lootOff = now + 10000; b.route = [];
    if (a && !a.dead && Math.random() < b.caution && power(a) > power(p) * 0.8) startFlee(m, p, a, true, now);
  }
}
function onKill(m, p, now) {   // a short pause, now and then a hop and an emote (broadcast like socEmote, a bot has no socket)
  const b = p.brain; b.tgt = null; b.eng = null; b.search = null; b.pauseUntil = Math.max(b.pauseUntil, now + rnd(500, 1200));
  if (Math.random() < 0.5) startJump(p, now);
  if (Math.random() < BOT_EMOTE_P && now - (p.emoteAt || 0) >= EMOTE_MS) { p.emoteAt = now; bcast(m, { emote: { id: p.id, n: Math.floor(Math.random() * EMOTES) } }); }
}
function botVote(m, p, now) {   // once per round at a personal moment (patient bots vote later); impatient ones may change their own vote in the last seconds, never over a human in the room
  const b = p.brain;
  if (b.seenRound !== m.round) { b.seenRound = m.round; b.voteAt = now + (rnd(0.05, 0.35) + b.patience * rnd(0.15, 0.5)) * Math.max(1000, m.endsAt - now); b.reAt = Math.random() < (1 - b.patience) * 0.45 ? m.endsAt - rnd(1200, 4800) : 0; }
  else if (b.votedRound !== m.round) { if (now >= b.voteAt) { b.votedRound = m.round; if (m.sel[p.room] == null && !humanIn(m, p.room)) voteDoor(m, p, now); } }
  else if (b.reAt && now >= b.reAt) { b.reAt = 0; if (m.sel[p.room] != null && m.selBy && m.selBy[p.room] === p.id && !humanIn(m, p.room)) voteDoor(m, p, now, m.sel[p.room]); }
}
function botFight(m, p, t, now, dt) {   // melee: orbit the target at 1.2-1.8 m, flip the strafe every 0.6-1.5 s, step back after some swings; ranged: keep 5-8 m and sidestep. Always facing the target. One validated move per tick.
  const b = p.brain, cb = G.combat(p.inv.weapon), ranged = !!(cb.ranged || boltWeapon(p)), dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 0.001, rx = dx / d, rz = dz / d;
  const hold = m.focusIds && m.focusIds[t.id] ? m.focusIds[t.id].indexOf(p.id) >= MAX_GANG : false;   // FAIR: the 3rd+ bot on the same goblin circles at HOLD_D instead of piling on
  b.scan = null;
  if (now >= b.strafeAt) { b.strafe = Math.random() < 0.85 ? -b.strafe : b.strafe; b.strafeAt = now + (ranged ? rnd(500, 1100) : rnd(600, 1500)); b.orbitR = rnd(1.2, 1.8); if (Math.random() < 0.2) b.rangeD = rnd(5, 8); }
  const R = hold ? HOLD_D : ranged ? b.rangeD : b.orbitR, walk = walkOf(p), step = walk * dt, err = d - R, backing = !ranged && !hold && now < b.backUntil;
  let cr, ct = 0;   // metres toward the target and sideways this tick
  if (backing) cr = -step;
  else if (err > (ranged ? 3 : 1.5)) cr = Math.min(err, sprintOf(p) * dt);   // far away: sprint at it
  else { cr = Math.abs(err) < 0.25 ? 0 : Math.max(-step, Math.min(step, err * 0.9)); ct = Math.sqrt(Math.max(0, step * step - cr * cr)) * (ranged ? 0.7 : hold ? 0.5 : 0.85) * b.strafe; }
  const px = p.x + rx * cr - rz * ct, pz = p.z + rz * cr + rx * ct, [cx, cz] = clampIn(p.room, px, pz, 0.5), [nx, nz] = BN.slide(p.x, p.z, cx, cz, obstaclesFor(m, p.room));   // NAV: props block the orbit too
  if (Math.abs(nx - px) + Math.abs(nz - pz) > 0.15) b.strafe = -b.strafe;   // a wall in the way: orbit the other way
  if (!mv(m, p, nx, nz, yawTo({ x: nx, z: nz }, t.x, t.z) + (Math.random() - 0.5) * 0.18, now)) { BS.bad++; b.strafe = -b.strafe; return; }
  if (!hold && !backing && Math.hypot(t.x - nx, t.z - nz) <= (ranged ? 10 : 2.0) && Math.random() < 0.85) {
    if (Math.random() < BOT_MISS) mv(m, p, nx, nz, yawTo(p, t.x, t.z) + (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 0.5), now);   // FAIR: a swing aimed wide on purpose
    attack(m, null, p, now);
    if (p.atkAt === now && !ranged && Math.random() < 0.33) b.backUntil = now + rnd(1, 2) / walk * 1000;
  }
}
function npcFight(m, p, t, now, dt) {   // mystery enemies: close in, face, swing; archers keep their distance
  const b = p.brain, cb = G.combat(p.inv.weapon), ranged = cb.ranged || boltWeapon(p), d = Math.hypot(t.x - p.x, t.z - p.z), want = ranged ? (p.npc === 'archer' ? 7 : 5) : 1.4;
  b.route = [];
  if (d > want + 0.4) { const [tx, tz] = clampIn(p.room, t.x, t.z, 0.5); stepTo(m, p, tx, tz, dt, now); }
  else if (ranged && d < want - 2.5) { const [tx, tz] = clampIn(p.room, p.x + (p.x - t.x) * 3, p.z + (p.z - t.z) * 3, 0.8); stepTo(m, p, tx, tz, dt, now); }
  else face(m, p, t.x, t.z, now, true);
  if (d <= (ranged ? 10 : 2.0) && Math.random() < 0.85) {
    if (Math.random() < NPC_MISS) mv(m, p, p.x, p.z, yawTo(p, t.x, t.z) + (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 0.5), now); else face(m, p, t.x, t.z, now, true);
    attack(m, null, p, now);
  }
}
// AI-END
function nearestEnemy(m, p, maxd) {   // mystery enemies only (omniscient, the same room); bots use perceive() + pickTarget()
  let best = null, bd = maxd;
  for (const q of m.players.values()) {
    if (q === p || q.dead || !q.entered || q.room !== p.room || q.npc) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; best = q; }
  }
  return best;
}
function face(m, p, x, z, now, jitter) {   // turn toward a point (with aim jitter) without moving
  const yaw = Math.atan2(-(x - p.x), -(z - p.z)) + (jitter ? (Math.random() - 0.5) * 0.22 : 0);
  mv(m, p, p.x, p.z, yaw, now);
}
function doorClamp(m, key, x, z) {   // keep (x, z) 0.5 m off the walls of room `key`, except straight through the opening of an open door (where it may leave the room)
  const r = RB[key]; if (!r) return [x, z];
  let [cx, cz] = clampIn(key, x, z, 0.5);
  for (const e of ADJ[key] || []) {
    if (!isOpen(m, e.door)) continue; const d = DOOR_AT[key + '|' + e.to];
    if (d.axis === 'z') { if (Math.abs(z - d.c) < d.hw - 0.5 && Math.sign(x - r.cx) === Math.sign(e.w2[0] - r.cx)) cx = x; }
    else if (Math.abs(x - d.c) < d.hw - 0.5 && Math.sign(z - r.cz) === Math.sign(e.w2[1] - r.cz)) cz = z;
  }
  return [cx, cz];
}
function stepTo(m, p, tx, tz, dt, now, free) {   // one validated step toward (tx, tz); returns true when there. `free`: a doorway crossing (no wall margin)
  const b = p.brain, obs = obstaclesFor(m, p.room), nav = b.nav || (b.nav = {});
  if (obs.length) { if (BN.hitAt(p.x, p.z, obs)) { const [ox, oz] = BN.pushOut(p.x, p.z, obs); mv(m, p, ox, oz, p.yaw, now); } [tx, tz] = BN.pushOut(tx, tz, obs, BN.BOT_R, p.x, p.z); }   // NAV: a target inside a prop moves out of it; a bot inside one steps out
  let dx = tx - p.x, dz = tz - p.z; const d = Math.hypot(dx, dz);
  if (d < 0.08) { BN.untrack(nav); return true; }
  if (nav.esc && now < nav.esc.until) { dx = nav.esc.x * d; dz = nav.esc.z * d; } else nav.esc = null;   // NAV: a short leg sideways out of a jam
  const st = Math.min(d, b.speed * dt * (now < (p.snareUntil || 0) ? 0.35 : 1)); let nx = p.x + dx / d * st, nz = p.z + dz / d * st;
  if (!free) [nx, nz] = clampIn(p.room, nx, nz, 0.5);
  if (obs.length) { const r = BN.steer(nav, p.x, p.z, nx, nz, Math.hypot(nx - p.x, nz - p.z) || st, obs, BN.BOT_R, now); if (r) { nx = r[0]; nz = r[1]; } else { nx = p.x; nz = p.z; } }
  if (free) [nx, nz] = doorClamp(m, p.room, nx, nz);   // a prop detour or an escape leg must not drag a doorway walker along the wall into the masonry
  b.scan = null;
  const lvl = obs.length ? BN.track(nav, p.x, p.z, now, tx, tz) : 0;   // NAV: stuck detection (nothing runs while a room has no props)
  if (lvl) { BS.nav = (BS.nav || 0) + 1; if (lvl === 1) nav.side = -(nav.side || 1); else if (lvl === 2) BN.escape(nav, dx / d, dz / d, now); else { b.route = []; b.idleUntil = now + 300; BN.untrack(nav); nav.side = 0; return false; } }
  if (!mv(m, p, nx, nz, Math.atan2(-dx, -dz), now)) { BS.bad++; if (++b.stuck > 3) { b.route = []; b.stuck = 0; b.idleUntil = now + 300; } return false; }
  b.stuck = 0; return d <= st + 0.05;
}
function follow(m, p, dt, now) {   // walk the current route (waypoints are pre-validated points: doorway fronts, doorway exits, room points)
  const b = p.brain; if (!b.route.length) return;
  const wp = b.route[0];
  if (wp.door !== undefined && !isOpen(m, wp.door)) { b.route = []; b.idleUntil = now + rnd(200, 600); return; }   // the door closed while we were on our way: plan again
  if (stepTo(m, p, wp[0], wp[1], dt, now, true)) b.route.shift();
}
function voteDoor(m, p, now, except) {   // weighted pick of a door of this room; `except`: a door the bot is changing its mind about
  const b = p.brain, doors = ROOM_DOORS[p.room] || [], ws = [], hurt = p.stats.health < p.stats.maxHealth * 0.5, rich = p.gold >= 60;
  let tot = 0;
  for (const d of doors) {
    const o = DOOR_ROOMS[d][0] === p.room ? DOOR_ROOMS[d][1] : DOOR_ROOMS[d][0]; let w;
    if (d === except || isHatch(d)) w = 0;   // 5x5: a home's hatch is never voted on
    else if (o === VK) w = (m.round > 3 ? 7 : 0.4) * (hurt ? 0.5 : 1);   // late rounds: the vault (not when wounded)
    else if (o[0] === 'c') {
      const id = +o.slice(1), L = m.layout[id], my = m.mystery[id];
      w = !b.seen[o] ? (m.round <= 3 ? 3.5 : 1.5) : 0.6;
      if (L === 'merchant') w *= rich ? 3 + 2 * b.greed : 0.5;   // rich bots (gold >= 60) go shopping
      else if (L === 'chest') w *= p.claimed && p.claimed.has(id) ? 0.3 : hurt ? 2.5 : 1;   // wounded bots want a quiet chest room
      else if (L === 'mystery' && my && my.kind === 'enemy') w *= hurt ? 0.25 : 1;
    } else w = 1 + (m.round > 3 && DIST_V[o] < DIST_V[p.room] ? 3 : 0);
    if (p.bot && !isHatch(d) && d !== except) w = b5Vote(m, p, d, o, w);   // BOTS5: the 2-room vault rule, doors toward the bot's goal
    ws.push(w); tot += w;
  }
  if (!doors.length || tot <= 0) return;
  let r = Math.random() * tot, pick = null; for (let i = 0; i < doors.length; i++) if (ws[i] > 0 && (r -= ws[i]) < 0) { pick = doors[i]; break; }
  if (pick == null) pick = doors.find(d => d !== except && ws[doors.indexOf(d)] > 0); if (pick == null) return;
  if (m.sel[p.room] !== pick && !(m.sealed && m.sealed[p.room])) { m.sel[p.room] = pick; (m.selBy || (m.selBy = {}))[p.room] = p.id; broadcastRound(m); }
}
function lootNearby(m, p, dt, now) {   // walk to useful loot piles in this room and take/eat what helps; returns true while busy with it
  const b = p.brain; let best = null, bd = 8 + 12 * b.greed;   // AI: greedy bots walk further for loot
  for (const dr of m.drops) {
    if (b.skip.has(dr.id) || roomKeyOf(dr.x, dr.z) !== p.room) continue;
    if (!dr.items.some(k => G.isBrain(k) || BN.healValue(info(k)) > 0 || betterW(p.inv.weapon, k) || betterA(p.inv.armor, k) || useful2(k))) { b.skip.add(dr.id); continue; }
    const d = Math.hypot(dr.x - p.x, dr.z - p.z); if (d < bd) { bd = d; best = dr; }
  }
  if (!best) return false;
  if (bd > 2.2) { const [tx, tz] = clampIn(p.room, best.x, best.z, 0.5); stepTo(m, p, tx, tz, dt, now); return true; }
  for (let i = best.items.length - 1; i >= 0; i--) {
    const k = best.items[i];
    if (G.isBrain(k)) loot(m, p, [best.id, i, 'eat']);
    else if (BN.healValue(info(k)) > 0 || betterW(p.inv.weapon, k) || betterA(p.inv.armor, k) || useful2(k)) loot(m, p, [best.id, i, 'take']);
  }
  b.skip.add(best.id); equipBest(m, p); return true;
}
function roomGoals(m, p) {   // once per visit: claim a chest/mystery prize, buy from the merchant with the gold we have
  const b = p.brain, mm = /^c(\d+)$/.exec(p.room); if (!mm || b.done[p.room]) return;
  if (p.bot && b5Station(m, p)) return;   // BOTS5: homes, the Forge and the Grand Recycler go through station5
  b.done[p.room] = 1; const id = +mm[1], L = m.layout[id];
  if (L === 'merchant') {
    const shop = m.shops[id]; let bi = -1, bg = 0;
    shop.forEach((it, i) => { if (it.sold || it.price > p.gold) return; const g = G.ITEMS[it.key].type === 'weapon' ? (betterW(p.inv.weapon, it.key) ? G.ITEMS[it.key].attack - (p.inv.weapon ? info(p.inv.weapon).attack : 0) : 0) : (betterA(p.inv.armor, it.key) ? (armorVal(G.ITEMS[it.key]) - (p.inv.armor ? armorVal(info(p.inv.armor)) : 0)) / 2 : 0); if (g > bg) { bg = g; bi = i; } });
    if (bi >= 0) buy(m, p, id, bi);
  } else claim(m, p);
  equipBest(m, p); botStations(m, p);   // LOOT: recycle junk, craft tier 0
  equipBest(m, p);
}
// BOTS5-BEGIN (task G, docs/reports/bots5.md): bots play the 5x5 game. Pure scoring lives in botgoals.js; this block holds the per-bot goal (home work, the Master Forge,
// the Grand Recycler, tree rooms, vaultbreaker heists, THE VAULT and its crown), the activity driver that sends the SAME {act} verbs a human sends (A5.act, so every rule,
// reach check, rate limit and cap applies), the vault vote under the 2-room rule (co-op votes, bribes, lockpicks), the per-round vaultbreaker re-key, venting,
// a stuck watchdog, per-match stats (GK_DEBUG {bot5:1}) and per-feature cost (BS.f5, tests/bots.test.js). Hooks elsewhere in BOTS are one-liners tagged BOTS5.
const BG = require('./botgoals.js'), ACTF = require('./activity.js'), VB5M = require('./vb5.js'), V5M = require('./vault5.js');
const B5_ADJ = {}; for (const k of Object.keys(ADJ)) B5_ADJ[k] = ADJ[k].map(e => e.to);
const ALLD = BG.allDist(B5_ADJ);   // door hops between every pair of rooms over all doors (41 x 41, built once)
const TREE5 = new Set(WORLD.TREE_CELLS.map(String)), VB5C = new Set(Object.values(WORLD.VB_CELLS).map(String));
const OUTER5 = new Set(WORLD.ROOMS.filter(r => r.kind === 'arena').map(r => r.key));   // the 16 plain halls of the outer ring (vented in sudden death, like homes and loot rooms)
const GOAL5 = new Set([...TREE5, ...VB5C, VK]), WANT5 = [...GOAL5, ...WORLD.LOOT_IDS.map(i => 'c' + i)];   // the rooms a bot can want from afar (plus its own home)
const f5 = (k, t0) => { const f = BS.f5 || (BS.f5 = { score: 0, act: 0, station: 0, vote: 0, watch: 0 }); f[k] += Number(process.hrtime.bigint() - t0) / 1e6; };
const st5 = m => m.b5 || (m.b5 = { tree: {}, vb: {}, vault: {}, treeU: {}, vbU: {}, home: 0, forge: 0, grand: 0, crafted: 0, recycled: 0, brewed: 0, rested: 0, bribes: 0, coop: 0, lockpicks: 0, vaultPicks: 0, stuck: 0, hardStuck: 0, rekey: 0, left: {}, seen: {}, visits: { tree: 0, vb: 0, vault: 0 }, leaveWhy: {} });
const invCount = (p, k) => { let n = 0; for (const x of p.inv.backpack) if (x === k) n++; for (const x of p.inv.quick) if (x === k) n++; return n; };
const slotOf5 = (p, k) => BOT_SLOTS.find(s => getSlot(p.inv, s) === k);
const healCount5 = p => { let n = 0; for (const x of [...p.inv.backpack, ...p.inv.quick]) if (x && BN.healValue(info(x)) > 0) n++; return n; };
function b5Init(m, p) { const b = p.brain; if (!b.p5) { b.p5 = BG.persona(Math.random); p.skill = b.p5.skill; b.d5 = {}; b.vr5 = {}; b.w5 = {}; } return b; }
function knowLeft5(m, p) { if (!m.act) return 0; const u = ACTF.limit.used(m.act.L, p, 'know'); return Math.max(0, Math.min(ACTF.C.TREE_KNOW_ROUND - u.round, ACTF.C.TREE_KNOW_MATCH - u.match)); }
function bestCraft5(p, type) {   // the best upgrade this bench type makes from the parts the bot carries (weapon or armour over what it wears, a heal when it has none)
  let sum = 0; for (const k in p.parts) sum += p.parts[k] || 0; if (!sum) return null;
  const cur = { attack: p.inv.weapon && info(p.inv.weapon) ? info(p.inv.weapon).attack || 0 : 0, armor: p.inv.armor && info(p.inv.armor) ? armorVal(info(p.inv.armor)) : 0, heals: healCount5(p) };
  let best = null, bv = 0;
  for (const r of G.RECIPES) {
    const bc = G.benchCraft(p, r, type, p.perks); if (bc.why) continue;
    let ok = true; for (const k in bc.cost) if ((p.parts[k] || 0) < bc.cost[k]) { ok = false; break; } if (!ok) continue;
    const o = G.ITEMS[r.out]; if (!o) continue;
    const v = BG.craftValue({ type: o.type, attack: o.attack, score: o.type === 'armor' ? armorVal(o) : undefined, heal: BN.healValue(o) }, cur);
    if (v > bv) { bv = v; best = r; }
  }
  return best;
}
function junk5(p) { let n = 0; for (const s of BOT_SLOTS) { const k = getSlot(p.inv, s); if (k && isJunkW(p, k)) n++; } return n; }
function kind5(m, p, key) {   // the bot's view of a room: home (its own) | foreign | forge | grand | tree | vb | vault | vent | other
  if (key === VK) return 'vault'; if (TREE5.has(key)) return 'tree'; if (VB5C.has(key)) return 'vb';
  if (key === p.home) return 'home'; if (isHome(key)) return 'foreign';
  if (key[0] === 'c') { const L = m.layout[+key.slice(1)]; return L === 'forge' ? 'forge' : L === 'grand' ? 'grand' : m.sudden ? 'vent' : 'other'; }
  return m.sudden && OUTER5.has(key) ? 'vent' : 'other';
}
function treeInfo5(m, p, key, now, base) {   // the `b` object of rooms5-trees.js spec.bot (docs/reports/rooms5-trees.md); `base`: the room-independent part, reused across the 4 tree rooms
  const b = p.brain, an = A5.ANCHORS[key] || {}; let others = 0;
  for (const q of m.players.values()) if (q !== p && !q.dead && q.entered && !q.npc && q.room === key) others++;
  let o = base;
  if (!o) {
    let junkSlot = -2, brain = false, husk = 0, scions = 0, heals = 0;
    for (let i = 0; i < 12; i++) {
      const k = i < 9 ? p.inv.backpack[i] : p.inv.quick[i - 9]; if (!k) continue;
      if (junkSlot < 0 && isJunkW(p, k)) junkSlot = i; if (G.isBrain(k)) brain = true; else if (k === 'x:huskbrain') husk++; else if (k === 'x:scion') scions++; else if (BN.healValue(info(k)) > 0) heals++;
    }
    o = { now, round: m.round, sudden: !!m.sudden, knowLeft: knowLeft5(m, p), hpFrac: hpFrac(p), aggr: b.aggr, greed: b.greed, coop: b.p5.coop > 0.5,
      brainOf: brain ? 'goblin' : husk ? 'husk' : null, scions, junk: junkSlot >= 0, junkSlot, healItems: heals, hasGear: !!p.inv.weapon, cautious: b.caution > 0.5 };
  }
  return Object.assign({}, o, { anchor: id => an[id] ? { x: an[id].x, z: an[id].z, r: an[id].r + 0.3 } : null, others });   // the hints' near() (r + 1.0) widened to just inside the server reach (r + 1.4): anchors stand on solid props now
}
function vbInfo5(m, p, key, now) {   // the `info` object of VB5.botHint
  const b = p.brain, H = m.act.H, wantVault = (b.v5 || 0) > 4 || m.round >= 3, wantNoVault = !wantVault && b.p5.spoil, ram = H.st.ram;
  return { now, round: m.round, sudden: !!m.sudden, gold: p.gold || 0, metal: (p.parts && p.parts.metal) || 0, has: k => invCount(p, k === 'x:wedge' ? 'x:ironwedge' : k) > 0,
    aggression: b.aggr, greed: b.greed, wantVault, wantNoVault, rivalArmed: !!H.st.keystone.armed && b.lit5 !== m.round,
    defend: wantNoVault && VB5M.typeAt(H, key) === 'ram' && !!ram && ram.handles.some(h => h != null && h !== p.id) };
}
function hint5(m, p, key, now, base) {   // {score, next, maxStay, type} for an activity room
  const A = m.act; if (!A) return null;
  if (TREE5.has(key)) { const t = A.trees[key], sp = t && ACTF.get(t.type); if (!sp || !sp.bot || !sp.bot.score) return null; const bi = treeInfo5(m, p, key, now, base); return { score: sp.bot.score(bi, p, t.st) * p.brain.p5.tree, next: () => sp.bot.next(bi, p, t.st), maxStay: sp.bot.maxStay || 45000, type: t.type }; }
  if (VB5C.has(key)) { const h = VB5M.botHint(A.H, key, p, vbInfo5(m, p, key, now)); return { score: h.score * p.brain.p5.heist, next: () => h.next, maxStay: h.maxStay || 45000, type: VB5M.typeAt(A.H, key) }; }
  return null;
}
function vaultWant5(m, p, now) {
  const b = p.brain, v = m.act && m.act.vault; let wardens = 0;
  if (v && v.gaining != null) for (const q of m.players.values()) if (q.npc === 'warden' && !q.dead && q.room === VK) wardens++;
  return BG.vaultWant({ round: m.round, sudden: !!m.sudden, sudRound: SUDDEN_ROUND, msLeft: m.endsAt - now, gaining: !!v && v.gaining != null && v.gaining !== p.id, wardens, hpFrac: hpFrac(p), aggr: b.aggr, patience: b.patience });
}
function b5Prep(m, p, now, dist) {   // once per pickDest: what the bot could do where; c.terms[key] = the extra pickDest term of every reachable room
  const t0 = process.hrtime.bigint(), b = b5Init(m, p), c = { work: null, hints: {}, vault: 0, terms: {} };
  const junk = junk5(p), craftN = !!bestCraft5(p, 'normal'), craftM = !!bestCraft5(p, 'master');
  c.work = { junk, craftN, craftM };   // ELIXIR: the pump's pull is pickDest's own botHomeWant term (not counted twice here); a home visit is a station goal either way c.shut = !m.sudden && !VAULT.some(d => isOpen(m, d));
  b.v5 = c.vault = vaultWant5(m, p, now);
  if (m.act && b.h5 && now - b.h5.t < 1500 && b.h5.room === p.room && b.h5.round === m.round) c.hints = b.h5.hints;   // the room hints change slowly: reuse them for 1.5 s
  else if (m.act) { let base = null; for (const k of GOAL5) if (k !== VK) { try { if (!base && TREE5.has(k)) base = treeInfo5(m, p, k, now); c.hints[k] = hint5(m, p, k, now, base); } catch (e) { c.hints[k] = null; } } b.h5 = { t: now, room: p.room, round: m.round, hints: c.hints }; }
  let want = null, ws = -1e9;   // the room the bot most wants, reachable or not (votes steer toward it)
  for (const k of [...WANT5, p.home]) { const s = b5Term(m, p, k, ALLD[p.room] ? ALLD[p.room][k] : 9, c) - 0.35 * ((ALLD[p.room] && ALLD[p.room][k]) || 0); if (s > ws) { ws = s; want = k; } }
  b.want5 = ws > 2 ? want : null;
  if (dist) for (const k in dist) c.terms[k] = b5Term(m, p, k, dist[k], c);
  f5('score', t0); return c;
}
function b5Term(m, p, key, dist, c) {   // the extra pickDest term for one room (botgoals.js roomTerm)
  const b = p.brain, kind = kind5(m, p, key), w = c.work, hn = c.hints[key];
  const vaultShut = c.shut;
  return BG.roomTerm({ kind, dist, hint: hn ? hn.score : 0, work: w.junk >= 2 || w.craftN, junk: w.junk, master: w.craftM, hpFrac: hpFrac(p), sudden: !!m.sudden, round: m.round,
    done: b.d5[key] === m.round, vault: kind === 'vb' ? (vaultShut ? c.vault : 0) : c.vault, homeBody: b.p5.homeBody });
}
function b5Pick(m, p, key, now) {   // pickDest chose `key`: remember it as the goal when there is something to do there
  const b = p.brain, kind = kind5(m, p, key);
  if (B5LOG === 'pick') console.log('B5', p.id, p.room, '->', key, kind, junk5(p), p.home);
  if (b.d5[key] === m.round && key !== VK) b.g5 = null;   // finished (or fled) there this round
  else if (kind === 'home' || kind === 'forge' || kind === 'grand' || GOAL5.has(key)) b.g5 = { room: key, kind, type: VB5C.has(key) && m.act ? VB5M.typeAt(m.act.H, key) : null, since: 0, nextAt: 0, rep: 0, sig: '', crafts: 0, acts: 0 };
  else b.g5 = null;
}
function b5Station(m, p) {   // roomGoals hook: own home, the Forge and the Grand Recycler are worked by station5 (timed crafts, one click per beat), never by the one-shot legacy botStations; other homes are off limits
  const b = b5Init(m, p), kind = kind5(m, p, p.room);
  if (kind !== 'home' && kind !== 'forge' && kind !== 'grand' && kind !== 'foreign') return false;
  if (kind !== 'foreign' && !b.g5 && b.d5[p.room] !== m.round) {
    const junk = junk5(p), has = kind === 'home' ? junk > 0 || !!bestCraft5(p, 'normal') || hpFrac(p) < 0.75 || (typeof botHomeWant === 'function' && botHomeWant(m, p, Date.now()) > 0) : kind === 'forge' ? !!bestCraft5(p, 'master') : junk > 0;
    if (has) b5Pick(m, p, p.room, Date.now());
  }
  return true;
}
function leave5(m, p, now, why) { const b = p.brain, g = b.g5; if (g) { b.d5[g.room] = m.round; const L = st5(m).leaveWhy; L[why || 'done'] = (L[why || 'done'] || 0) + 1; } b.g5 = null; b.route = []; b.idleUntil = now; }
function busy5(m, key, p) {   // a channel, grip or running sequence of this bot in this room: stand still
  const A = m.act; if (!A) return false;
  if (TREE5.has(key)) { const st = A.trees[key].st; for (const n in st.chs) if (st.chs[n].by === p.id) return true; return !!(st.grip && st.grip.by === p.id); }
  if (VB5C.has(key)) { const s = VB5M.stOf(A.H, key); return !!s && s.ch.some(c => c.pid === p.id); }
  if (key === VK) { for (const k in A.vault.ch) if (A.vault.ch[k].by === p.id) return true; }
  return false;
}
const B5LOG = DBG && process.env.GK_B5LOG;   // GK_DEBUG trace of one activity type (e.g. GK_B5LOG=keystone): the hint, the room view, busy, position, HP %
const walk5 = (m, p, x, z, dt, now) => { const b = p.brain; b.mv5 = now; const [tx, tz] = clampIn(p.room, x, z, 0.6); if (Math.hypot(tx - p.x, tz - p.z) > 4) b.speed = sprintOf(p); stepTo(m, p, tx, tz, dt, now); };   // sprint across the room like a player, walk the last metres
function vaultNext5(m, p, now) {   // THE VAULT (vault5.js has no bot hints): contest a claimant, claim late, scoop the coffers, sit out the treasury
  const v = m.act.vault, b = p.brain, late = m.round >= SUDDEN_ROUND - 1 || m.sudden;
  if (v.gaining != null && v.gaining !== p.id) return { stay: 'dais' };   // 2 on the dais freeze the claim; the combat code fights whoever is visible
  if (late && hpFrac(p) > 0.3) return { stay: 'dais' };
  let best = null, bd = 1e9;
  if (ACTF.limit.ok(v.L, p, 'scoop', V5M.K.SCOOP_PER_ROUND) && b.greed > 0.25) for (const k of V5M.K.COFFERS) { if (ACTF.pool.level(v.pools[k], now) < 1 || v.ch[k].by != null) continue; const a = A5.ANCHORS[VK][k], d = Math.hypot(a.x - p.x, a.z - p.z); if (d < bd) { bd = d; best = k; } }
  if (best) return { verb: 'use', a: best };
  if (!m.sudden && m.endsAt - now < 30000) return { idle: true };   // be inside when the treasury pays
  if (m.round >= 3 && b.aggr > 0.5) return { stay: 'dais' };
  return null;
}
function act5Think(m, p, now, dt) {   // the bot is in its activity room: follow the room's bot hints through the human `act` path. true = handled this tick
  const b = p.brain, g = b.g5, key = p.room, A = m.act;
  if (now >= b.lootOff && lootNearby(m, p, dt, now)) { b.lootAt = now; return true; }   // husk brains, spring water and dropped loot first
  if (key === VK && !m.relicTaken && m.relicKey && (b.relicTries || 0) <= 2) return false;   // LOOT relicGoal takes the relic first
  let next = null, maxStay = 45000, type = null;
  if (key === VK) { next = vaultNext5(m, p, now); maxStay = 90000; type = 'vault'; }
  else { const h = hint5(m, p, key, now); if (h) { next = h.next(); maxStay = h.maxStay; type = h.type; } }
  if (VB5C.has(key) && b.caution > 0.5) { const rk = VB5M.risk(A.H, key, now); if ((rk.kind === 'noise' && rk.v > 60) || (rk.kind === 'alarm' && rk.v > 0) || (rk.kind === 'resonance' && rk.v > 60)) next = null; }   // cautious bots leave a noisy heist
  if (B5LOG && type === B5LOG) console.log('B5', p.id, type, JSON.stringify(next), VB5C.has(key) ? JSON.stringify(VB5M.view(A.H, key, now).st) : '', busy5(m, key, p), Math.round(p.x), Math.round(p.z), Math.round(hpFrac(p) * 100));
  if (now - g.since > maxStay) { leave5(m, p, now, 'maxStay'); return false; }
  if (hpFrac(p) < b.flee + 0.1 && key !== VK) { leave5(m, p, now, 'hurt'); return false; }
  if (!next || next.go === 'exit') { leave5(m, p, now, next ? 'exit' : 'done'); return false; }
  const an = A5.ANCHORS[key] || {}, busy = busy5(m, key, p), S = st5(m), R = WORLD.roomRect(key);
  if (busy) { const a = an[next.a || next.stay || next.go]; if (a) face(m, p, a.x, a.z, now, false); return true; }   // a running channel: hold still (moving 0.6 m breaks it)
  if (next.fight || next.idle) { idleLook(m, p, now); return true; }
  if (next.memory) {   // Memory Tree: touch the lanterns in order, each with the skill roll
    const pos = next.pos | 0; if (g.memPos !== pos || g.memSeq !== next.seq) { g.memPos = pos; g.memSeq = next.seq; g.memA = BG.lantern(next.seq, pos, BG.pressOk(b.p5.skill, Math.random()), Math.random()); }
    next = { verb: 'use', a: g.memA, mem: 1 };
  }
  const aid = next.go || next.stay || next.a, a = an[aid]; if (!a) { leave5(m, p, now, 'anchor'); return false; }
  const obs = obstaclesFor(m, key), free = (x, z) => obs.length ? BN.pushOut(x, z, obs, BN.BOT_R, p.x, p.z) : [x, z], there = pt => Math.hypot(p.x - pt[0], p.z - pt[1]) < 0.4;   // anchors sit on solid props (trunks, posts, stations): aim at the free spot next to them
  if (next.stay) { const pt = free(a.x, a.z); if (!there(pt) && Math.hypot(p.x - a.x, p.z - a.z) > Math.min(0.9, (a.r || 1) * 0.6)) walk5(m, p, pt[0], pt[1], dt, now); else idleLook(m, p, now); return true; }
  if (!BG.inReach(a, p.x, p.z, 1.25)) {   // walk up to the anchor (go, or before a verb); the server's reach is r + 1.4
    const pt = free(...BG.standPoint(a, p.x, p.z, R.cx, R.cz));
    if (!there(pt)) { walk5(m, p, pt[0], pt[1], dt, now); return true; }
    if (!BG.inReach(a, p.x, p.z, 1.38)) { leave5(m, p, now, 'unreachable'); return false; }
  }
  if (next.go) { idleLook(m, p, now); return true; }
  if (now < g.nextAt) { face(m, p, a.x, a.z, now, false); return true; }
  if (next.verb === 'tap' && TREE5.has(key)) {   // a tree timing press: wait for the window (skill roll per attempt), then press like a human
    const tm = A.trees[key].st._tm;
    if (tm && tm.by === p.id) { if (g.tapT0 !== tm.t0) { g.tapT0 = tm.t0; g.tapHit = BG.pressOk(b.p5.skill, Math.random()); g.tapWait = now; } if (!BG.tapNow(tm, now, g.tapHit) && now - g.tapWait < 2500) return true; }
  }
  const sig = next.verb + ':' + aid + ':' + (next.x == null ? '' : next.x);
  if (next.verb !== 'tap' && !next.mem) { g.rep = sig === g.sig ? g.rep + 1 : 0; g.sig = sig; if (g.rep >= 6) { leave5(m, p, now, 'futile'); return false; } }
  if (++g.acts > 80) { leave5(m, p, now, 'acts'); return false; }
  const msg = { r: key, a: aid, v: next.verb }; if (Number.isInteger(next.x)) msg.x = next.x;
  face(m, p, a.x, a.z, now, false);
  A5.act(m, p, msg, now);
  if (type === 'keystone' && next.verb === 'use') b.lit5 = m.round;
  const bag = TREE5.has(key) ? S.tree : VB5C.has(key) ? S.vb : S.vault, users = TREE5.has(key) ? S.treeU : VB5C.has(key) ? S.vbU : null;
  bag[type] = (bag[type] || 0) + 1; if (users) users[p.id] = 1;
  g.nextAt = now + (next.verb === 'tap' ? rnd(420, 650) : rnd(380, 750));
  return true;
}
function stationSpot5(key, kind) {   // in front of the home bench / the Forge bench / the Grand Recycler
  const c = WORLD.CHEST[+key.slice(1)], L = kind === 'home' ? WORLD.HOME_LAYOUT.bench : WORLD.LOOT_LAYOUT[kind];
  return WORLD.attLocal(c, L[0], L[1] + 1.5);
}
function station5(m, p, now, dt) {   // home work at the bench and recycler (owner), the Master Forge, the Grand Recycler; resting at home when hurt
  const b = p.brain, g = b.g5, key = p.room, S = st5(m);
  if (!g.counted) { g.counted = 1; S[g.kind] = (S[g.kind] || 0) + 1; }
  if (now - g.since > 32000 || (m.sudden && g.kind === 'home')) { leave5(m, p, now, 'stationTime'); return false; }
  if (p.crafting) { idleLook(m, p, now); return true; }   // wait out craftMs at the bench (a hit or leaving cancels it and refunds)
  const sp = g.spot || (g.spot = stationSpot5(key, g.kind));
  if (B5LOG === 'station') console.log('B5', p.id, g.kind, key, sp.map(Math.round), Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, junk5(p), JSON.stringify(p.inv.backpack), p.inv.weapon);
  if (Math.hypot(p.x - sp[0], p.z - sp[1]) > 0.8) { walk5(m, p, sp[0], sp[1], dt, now); return true; }
  if (now < g.nextAt) { idleLook(m, p, now); return true; }
  g.nextAt = now + rnd(450, 900);   // one panel click per beat, like a player
  const t0 = process.hrtime.bigint();
  try {
    const home = typeof homeAt === 'function' ? homeAt(m, key) : null;   // ELIXIR: a home's stations follow the player paths ({recycle} -> homeRecycle with its upgrade and Refine, owner-only craft)
    if (home && HB.canUseStation && !HB.canUseStation(home, p.id)) { leave5(m, p, now, 'owner'); return false; }
    if (hasStation(m, p, 'recycler')) for (const s of BOT_SLOTS) { const k = getSlot(p.inv, s); if (k && isJunkW(p, k)) { if (!(home && typeof homeRecycle === 'function' ? homeRecycle(m, p, s, (p.elixir | 0) >= 4 + 12) : recycle(m, p, s))) S.recycled++; else g.recFail = (g.recFail | 0) + 1; if (g.recFail > 2) break; return true; } }   // refine (100%) while the bot keeps 12 elixir in reserve
    const bench = stationAt(m, p, 'workbench');
    if (bench && typeof brewAt === 'function' && (p.elixir | 0) >= 8 && !healCount5(p) && !g.brewed) { g.brewed = 1; try { if (!brewAt(m, p, 'heal')) S.brewed++; } catch (e) {} return true; }   // ELIXIR: a Healing Draught when it carries no heal
    if (bench && g.crafts < 3) { const r = bestCraft5(p, bench.type); if (r) { g.crafts++; if (!craft(m, p, r.id)) S.crafted++; return true; } }
    if (knowBench(m, p)) botLearn(m, p);
    equipBest(m, p);
    if (g.kind === 'home' && hpFrac(p) < 0.75 && !m.sudden && now - g.since < 26000) { if (!g.rest) { g.rest = 1; S.rested++; } return true; }   // heal up at home before going out again
    if (g.kind === 'home' && now - g.since < 1300) return true;   // ELIXIR: botHomes (1 Hz) empties the pump and buys upgrades while the bot is home
  } finally { f5('station', t0); }
  leave5(m, p, now, 'stationDone'); return false;
}
function b5Vote(m, p, d, o, w) {   // voteDoor weight hook: the vault door under the 2-room rule, other doors toward the room the bot wants
  const t0 = process.hrtime.bigint(), b = b5Init(m, p);
  try {
    if (o === VK) {
      let others = 0; for (const k in m.sel) if (k !== p.room && VAULT.includes(m.sel[k])) others += 1 + (rule('bribe') ? (m.bribes && m.bribes[k]) || 0 : 0) + (m.picked && m.picked[k] ? 1 : 0);
      let extra = 0; if (m.act && VB5C.has(p.room)) { const H = m.act.H, t = VB5M.typeAt(H, p.room); if (t === 'keystone' && H.st.keystone.armed) extra++; if (t === 'counting') extra += Math.max(0, H.st.counting.writs - H.st.counting.counters); if ((H.breach[d] || 0) >= VB5M.K.CRACKED) extra++; }
      return BG.vaultVote({ round: m.round, sudden: !!m.sudden, hurt: hpFrac(p) < 0.5, others, extra, bribe: rule('bribe') && (p.gold || 0) >= BRIBE.cost + 15, pick: invCount(p, 'x:lockpick') > 0, want: b.v5 || 0, spoil: b.p5.spoil });
    }
    if (w > 0 && b.want5 && ALLD[p.room] && ALLD[o]) w *= BG.stepFactor(ALLD[p.room][b.want5], ALLD[o][b.want5]);
    if (w > 0 && m.round >= 2 && isHome(o) && o !== p.home) w = 0;
    return w;
  } finally { f5('vote', t0); }
}
function vote5(m, p, now) {   // every ~1.5 s: vote in each room the bot passes (not once per round), complete a vault vote, bribe or pick the lock for the missing vote
  const b = p.brain; if (now < (b.v5At || 0) || m.sudden || !isArena(p.room)) return; b.v5At = now + rnd(1200, 1800);
  const t0 = process.hrtime.bigint(), S = st5(m), room = p.room;
  try {
    if (m.sel[room] == null && b.votedRound === m.round && b.vr5[room] !== m.round && now - (p.roomAt || 0) > 2000 + b.patience * 4000 && !humanIn(m, room)) { b.vr5[room] = m.round; voteDoor(m, p, now); }   // a second room this round gets a pick too
    const vd = (ROOM_DOORS[room] || []).find(d => VAULT.includes(d)); if (vd == null) return;
    let others = 0; for (const k in m.sel) if (k !== room && VAULT.includes(m.sel[k])) others++;
    if (others >= 1 && m.sel[room] !== vd && b.coop5 !== m.round && (b.v5 || 0) > 2 && !b.p5.spoil && !(m.sealed && m.sealed[room]) && !humanIn(m, room) && (m.sel[room] == null || [...m.players.values()].some(q => q.bot && q.id === m.selBy[room]))) {
      b.coop5 = m.round; m.sel[room] = vd; m.selBy[room] = p.id; S.coop++; broadcastRound(m);   // co-op: a second room's vault vote completes the rule
    }
    if (m.sel[room] === vd && m.selBy[room] === p.id) {
      if (b.vp5 !== m.round) { b.vp5 = m.round; S.vaultPicks++; }
      if (vaultVotes(m) < 2) {
        const sl = slotOf5(p, 'x:lockpick');
        if (sl && !(m.picked && m.picked[room])) { if (!useItem(m, p, sl, now)) S.lockpicks++; }
        else if (rule('bribe') && (p.gold || 0) >= BRIBE.cost + 15 && !((m.bribes && m.bribes[room]) > 0) && (m.endsAt - now < 30000 || b.greed < 0.4)) { if (!bribe(m, p)) S.bribes++; }
      }
    }
  } finally { f5('vote', t0); }
}
function b5Think(m, p, now, dt) {   // from botThink (after fights and flight): goal bookkeeping, votes, the stuck watchdog, then the activity / station driver. true = handled
  const b = b5Init(m, p), S = st5(m);
  S.seen[p.id] = 1; if (p.room !== p.home) S.left[p.id] = 1;
  if (S.vr !== m.round) { S.vr = m.round; if (S.vOpen == null && !m.sudden && VAULT.some(d => m.open.includes(d))) S.vOpen = m.round; }   // the first round a vault door stood open (before sudden death)
  vote5(m, p, now);
  { const t0 = process.hrtime.bigint(), moving = (b.route.length > 0 || now - (b.mv5 || 0) < 300) && b.mode !== 'flee', ms = BG.watch(b.w5, p.x, p.z, p.room, now, moving);   // stuck watchdog: wanting to move but not moving
    if (ms > 6000) { S.stuck++; if (b.w5.last && now - b.w5.last < 20000 && Math.hypot(p.x - b.w5.lx, p.z - b.w5.lz) < 1) S.hardStuck++; b.w5.last = now; b.w5.lx = p.x; b.w5.lz = p.z; b.w5.t = now; b.route = []; b.nav = {}; if (b.g5 && b.g5.room === p.room) leave5(m, p, now, 'stuck'); else b.g5 = null; b.idleUntil = now + 200; }
    f5('watch', t0); }
  const g = b.g5; if (!g || !m.act) return false;
  if (g.kind === 'vb' && g.type && VB5M.typeAt(m.act.H, g.room) !== g.type) {   // the vaultbreakers re-keyed: follow the type to its new room
    const cell = VB5M.cellOf(m.act.H, g.type); S.rekey++;
    if (cell && cell !== p.room && routeTo(m, p, cell)) { g.room = cell; g.since = 0; g.acts = 0; g.rep = 0; } else if (cell === p.room) { g.room = cell; } else b.g5 = null;
    if (!b.g5) return false;
  }
  if (g.room !== p.room) return false;   // still on the way
  if (!g.since) { g.since = now; b.route = []; if (GOAL5.has(g.room)) S.visits[g.kind]++; }
  if (g.kind === 'home' || g.kind === 'forge' || g.kind === 'grand') return station5(m, p, now, dt);
  const t0 = process.hrtime.bigint(); try { return act5Think(m, p, now, dt); } finally { f5('act', t0); }
}
function bot5Lab(m, cmd) {   // GK_DEBUG {bot5:{goal: roomKey}}: the first living bot is put into that room with it as its goal (tests/bots5.test.js)
  const p = [...m.players.values()].find(q => q.bot && !q.dead && q.entered), key = cmd && typeof cmd.goal === 'string' && RB[cmd.goal] ? cmd.goal : null; if (!p || !key) return;
  const b = b5Init(m, p), r = RB[key], pr = p.room; place(p, r.cx + 1.2, r.cz + 1.2); noteRoom(m, p, pr);
  delete b.d5[key]; b.route = []; b.mode = ''; b.tgt = null; b.g5 = null; b5Pick(m, p, key, Date.now()); b.lab5 = p.id; m.dirty = true;
}
function bot5Stat(m) {   // GK_DEBUG {bot5:1}: this match's bot stats for tests/bots5.test.js and tests/sim-fairness.js
  const S = st5(m), bots = [...m.players.values()].filter(q => q.bot), lab = bots.find(q => q.brain && q.brain.lab5 === q.id);
  const claims = m.act ? V5M.view(m.act.vault, { now: Date.now() }).claims : [];
  return { round: m.round, ended: !!m.ended, sudden: !!m.sudden, tree: S.tree, vb: S.vb, vault: S.vault, treeUsers: Object.keys(S.treeU).length, vbUsers: Object.keys(S.vbU).length, home: S.home, forge: S.forge, grand: S.grand,
    crafted: S.crafted, recycled: S.recycled, brewed: S.brewed, rested: S.rested, bribes: S.bribes, coop: S.coop, lockpicks: S.lockpicks, vaultPicks: S.vaultPicks, stuck: S.stuck, hardStuck: S.hardStuck, rekey: S.rekey, vaultOpen: S.vOpen == null ? null : S.vOpen,
    left: Object.keys(S.left).length, bots: Object.keys(S.seen).length, alive: bots.filter(q => !q.dead).length, visits: S.visits, leaveWhy: S.leaveWhy, trees: m.trees, vbLayout: m.vb, claims, lab: lab ? { id: lab.id, room: lab.room, goal: lab.brain.g5 ? lab.brain.g5.room : null, know: lab.stats.knowledge, gold: lab.gold, pack: lab.inv.backpack.filter(Boolean) } : null, rewards: m.act ? Object.fromEntries(Object.entries(m.act.log).map(([k, v]) => [k, v.n])) : {}, f5: BS.f5 || null, sweeps: BS.n, sweepMean: BS.n ? BS.sum / BS.n : 0 };
}
// BOTS5-END
function pickDest(m, p, now) {   // idle: where to go next (claimable rooms, the merchant, the vault later, hunting, otherwise wander in the room)
  const b = p.brain, dist = reach(m, p.room), here = new Set(), hunt = {};
  const c5 = p.bot ? b5Prep(m, p, now, dist) : null;   // BOTS5
  for (const q of m.players.values()) if (q !== p && !q.dead && q.entered && !q.npc) hunt[q.room] = (hunt[q.room] || 0) + 1;
  let best = null, bs = -1e9;
  for (const key in dist) {
    let s = Math.random() * 2 - dist[key] * 0.35, mm = /^c(\d+)$/.exec(key);
    if (mm) {
      const id = +mm[1], L = m.layout[id], my = m.mystery[id];
      if (key === p.home) s += botHomeWant(m, p, now);   // ELIXIR: go home to collect a full pump and spend it
      if (L === 'chest' && !(p.claimed && p.claimed.has(id))) s += 5 + b.greed + (p.stats.health < p.stats.maxHealth * 0.5 ? 2 : 0);   // AI: wounded bots like quiet chest rooms
      else if (L === 'mystery' && my && ['weapon', 'armor', 'gold'].includes(my.kind) && !(p.claimed && p.claimed.has(id))) s += 5;
      else if (L === 'merchant' && !b.done[key] && p.gold >= 20) s += 2 + 4 * b.greed + (p.gold >= 60 ? 2 : 0);   // AI: greed, and rich bots shop
      else if (L === 'merchant' || (L === 'mystery' && my && my.kind === 'stations')) s += !b.done[key] && botNeedsStation(p) ? 3 : -1;   // LOOT: junk to recycle
      else if (L === 'mystery' && my && my.kind === 'enemy') s += m.round > 2 && p.stats.health > p.stats.maxHealth * 0.7 ? 0.5 : -3;
      else s -= 1;
    } else if (key === VK) s += (rule('crown') ? 9 : 0) + (m.round > 3 ? 4 : -1) + (relicFree(m) && p.inv.backpack.indexOf(null) >= 0 ? 14 : 0);   // LOOT: bots want the vault relic
    else s += (b.seen[key] ? 0 : 1);
    if (m.round >= 3 && hunt[key]) s += (m.sudden ? 0.6 : 2.5) * (0.4 + b.aggr);   // AI: aggressive bots hunt   // in sudden death everyone converges on the vault (and its relic), not on whoever is in the next room
    if (m.sudden && key === VK && now >= b.sdAt) s += 7;   // AI: patient bots head for the vault later
    if (key === b.avoidRoom && now < b.avoidUntil) s -= 9;   // AI: not back into the room it ran from, yet
    if (key === p.room) s -= b.done[key] || !/^c/.test(key) ? 1 : 0;
    if (c5) s += c5.terms[key] || 0;   // BOTS5: home work, Forge, Grand Recycler, tree rooms, heists, the vault, venting
    if (s > bs) { bs = s; best = key; }
  }
  if (c5 && best) b5Pick(m, p, best, now);   // BOTS5: the goal the activity driver works on when the bot gets there
  if (c5 && best === p.room && b.g5 && b.g5.room === p.room) return;   // BOTS5: the goal is this room: start on it now
  if (best && best !== p.room && routeTo(m, p, best)) return;
  b.route = [pointIn(p.room, 1.5)]; b.cross = false; b.idleUntil = now + rnd(1200, 4200);
}
function botThink(m, p, now, dt) {
  if (p.actNpc && A5.npcThink(m, p, now, dt)) return;   // ACT5: activity NPCs have their own small brain
  const b = p.brain, fighter = graceOver(m, now), bot = p.bot;   // bots AND mystery enemies: no attacks in round 1 or for BOT_GRACE after GO
  b.seen[p.room] = 1;
  if (bot) {   // AI: bookkeeping that bots do like players (votes, being hit, kills, rooms)
    botVote(m, p, now); b.speed = walkOf(p);
    if (b.room !== p.room) { if (b.room !== undefined && Math.random() < 0.12) startJump(p, now); b.room = p.room; }   // a hop in the doorway now and then
    if (p.hurtAt && p.hurtAt !== b.lastHurt) onHurt(m, p, now);
    if ((p.kills | 0) !== b.kills) { b.kills = p.kills | 0; onKill(m, p, now); }
    if (m.sudden && !b.sdAtSet) { b.sdAtSet = true; b.sdAt = now + (0.1 + 0.9 * b.patience) * rnd(1000, 9000); }   // sudden death: everyone wants the vault, at staggered times
    else if (b.sdAtSet && b.sdAt && now >= b.sdAt) { b.sdAt = 0; b.idleUntil = Math.min(b.idleUntil, now); }
    if (b.chkAt !== p.roomAt) { b.chkAt = p.roomAt; b.reactAt = 0; b.entering = true; }
  }
  if (bot) botHeal(m, p, now);   // NAV: healing consumables by stat
  if (now < b.pauseUntil) { if (b.jump) mv(m, p, p.x, p.z, p.yaw, now); return; }
  { const lu = lureFor(m, p, now); if (lu) { b.route = []; b.tgt = null; b.mode = ''; const [lx, lz] = clampIn(p.room, lu.x, lu.z, 0.5); if (Math.hypot(lx - p.x, lz - p.z) > 0.9) stepTo(m, p, lx, lz, dt, now); return; } }   // LOOT: a thrown plushie distracts
  if (b.turnTo && now >= b.blindUntil) {   // AI: turn toward whoever hit us from outside the view
    for (const q of m.players.values()) if (q.id === b.turnTo && !q.dead && q.room === p.room) { mv(m, p, p.x, p.z, yawTo(p, q.x, q.z), now); break; }
    b.turnTo = 0;
  }
  // reaction: re-decide the target every 200-400 ms (human-like delay)
  if (now >= b.reactAt) {
    b.reactAt = now + (b.react ? rnd(b.react[0], b.react[1]) : rnd(200, 400));
    if (p.npc) {
      const tg = fighter ? nearestEnemy(m, p, p.rat ? 40 : 6) : null;   // ELIXIR: rats see the whole room
      if (tg && tg.room === p.room) { if (!b.seenAt) b.seenAt = now; } else b.seenAt = 0; b.tgt = tg && b.seenAt && now - b.seenAt >= NPC_AGGRO ? tg : null;   // enemies wait until someone has stood in their room for NPC_AGGRO
    } else {
      const vis = fighter ? perceive(m, p, now) : null, prev = b.tgt;   // AI: only what the bot can see
      if (b.entering) { b.entering = false; if (vis && vis.length >= 2) b.waitUntil = now + b.patience * 2000; }   // two or more enemies in the room we just entered: wait at the doorway first
      const tg = vis ? pickTarget(m, p, now, vis) : null; b.tgt = tg;
      if (tg) {
        b.search = null; const e = b.eng;
        if (!e || e.id !== tg.id) b.eng = { id: tg.id, t0: now, my: hpFrac(p), his: hpFrac(tg) };
        else if (now - e.t0 > 1800 && e.my - hpFrac(p) > 0.15 && e.my - hpFrac(p) > (e.his - hpFrac(tg)) * 1.4 && power(tg) > power(p) * 1.1 && Math.random() < 0.3 + b.caution * 0.7) startFlee(m, p, tg, true, now);   // losing to someone stronger: retreat through the nearest door
      } else {
        b.eng = null;
        if (prev && !prev.dead && prev.room === p.room && b.mem[prev.id] && now - b.mem[prev.id].t < SEE_MEM_MS) b.search = b.mem[prev.id];   // dropped out of view: go and check the spot
      }
      if (Math.random() < 0.04) { b.pauseUntil = now + rnd(300, 800); return; }   // occasional hesitation
    }
  }
  const t = b.tgt && !b.tgt.dead && b.tgt.room === p.room ? b.tgt : null;
  if (bot && t && b.mode !== 'flee' && p.stats.health < p.stats.maxHealth * b.flee) startFlee(m, p, t, false, now);   // flee toward the farthest door at the personal HP threshold
  if (b.mode === 'flee') { if (!b.route.length) b.mode = ''; else { if (bot) b.speed = sprintOf(p); follow(m, p, dt, now); return; } }
  if (t) { if (bot) botFight(m, p, t, now, dt); else npcFight(m, p, t, now, dt); return; }
  if (p.npc) {   // stay in the room: drift back home
    if (Math.hypot(p.x - p.home[0], p.z - p.home[1]) > 0.6) stepTo(m, p, p.home[0], p.home[1], dt, now);
    return;
  }
  if (b.search) {   // AI: walk to where the target was last seen
    const s = b.search;
    if (now - s.t >= SEE_MEM_MS || s.room !== p.room) b.search = null;
    else if (Math.hypot(s.x - p.x, s.z - p.z) < 1.0) { b.search = null; b.scanAt = now; }
    else { const [tx, tz] = clampIn(p.room, s.x, s.z, 0.5); stepTo(m, p, tx, tz, dt, now); return; }
  }
  if (now < b.waitUntil) { idleLook(m, p, now); return; }   // AI: holding at the doorway
  if (rule('crown') && p.room === VK) { if (Math.hypot(p.x, p.z) > 1.0) stepTo(m, p, 0, 0, dt, now); return; }   // RULES crown: bots go and stand on the dais, and fight whoever is on it
  if (bot && b5Think(m, p, now, dt)) return;   // BOTS5: the 5x5 goals (home work, stations, tree rooms, heists, the vault and its crown)
  if (b.route.length) {
    if (b.cross) b.speed = sprintOf(p);   // AI: sprint between rooms
    follow(m, p, dt, now); if (!b.route.length) b.idleUntil = Math.max(b.idleUntil, now + rnd(500, 2200)); return;   // arrived: look around a moment
  }
  const looting = now >= b.lootOff;
  if (looting && lootNearby(m, p, dt, now)) { b.lootAt = now; return; }
  if (relicGoal(m, p, dt, now)) { b.lootAt = now; return; }   // LOOT
  if (looting) { const dn = b.done[p.room]; roomGoals(m, p); if (!dn && b.done[p.room]) b.lootAt = now; }
  if (now >= b.idleUntil) pickDest(m, p, now); else idleLook(m, p, now);
}
function botTick(m, now) {   // ~10 Hz per match
  if (m.phase !== 'play') return;
  if (now - (m.botAt || 0) < 95) return;
  const t0 = process.hrtime.bigint(), dt = Math.min(0.25, (now - (m.botAt || now - 100)) / 1000); m.botAt = now;
  m.focus = focusOf(m);
  for (const p of m.players.values()) if ((p.bot || p.npc) && !p.dead) botThink(m, p, now, dt);
  BS.cur += Number(process.hrtime.bigint() - t0) / 1e6; BS.calls++;
}
// BOTS-END

// USE-BEGIN (utility items: bandage, mushroom, tonic, smoke bomb, powder bomb, door wedge, sealing wax, vault lockpick; see docs/reports/utility-items.md)
// {use: slot} from a quick slot or the backpack. The item is only spent when the effect applies; a refused use answers {useFail: reason}. Success answers {used: {key, slot, ...}} to the user.
const USE_CD = 500, TOSS_FLY = 600, BOMB_FUSE = 1000, MAX_CLOUDS = 6;
const inSmoke = (m, q, now) => { for (const s of m.smokes || []) if (s.room === q.room && now >= s.from && now <= s.until && Math.hypot(q.x - s.x, q.z - s.z) <= s.r) return true; return false; };
function useOpen(m, open) {   // a round ends: wedged doors stay open for the next round, seals and lockpicks are spent
  const keep = (m.wedged || []).filter(d => !open.includes(d));
  m.wedged = []; m.sealed = {}; m.picked = {}; m.pried = []; m.pried = [];
  return keep.length ? open.concat(keep) : open;
}
function toss(m, p, kind, now) {   // thrown items land 6 m ahead of the thrower, inside his room; the server decides, everyone gets the arc
  const [lx, lz] = clampIn(p.room, p.x - Math.sin(p.yaw) * 6, p.z - Math.cos(p.yaw) * 6, 0.7), id = (m.tossId = (m.tossId || 0) + 1);
  bcast(m, { toss: { id, kind, by: p.id, from: [+p.x.toFixed(2), +p.z.toFixed(2)], to: [+lx.toFixed(2), +lz.toFixed(2)], ms: TOSS_FLY, room: p.room } });
  return { id, x: lx, z: lz, room: p.room, from: now + TOSS_FLY };
}
function useItem(m, p, slot, now) {   // returns null or a failure reason
  if (m.phase !== 'play' || !m.goAt || now < m.goAt || m.ended || p.dead || !p.entered || !RB[p.room]) return 'now';
  if (typeof slot !== 'string' || !/^(q[0-2]|b[0-8])$/.test(slot)) return 'item';
  const key = getSlot(p.inv, slot), it = key && G.ITEMS[key]; if (!it || !it.use) return 'item';
  if (now - (p.useAt || 0) < USE_CD) return 'busy';
  if (p.carry && p.carry.heavy) return 'busy';   // ACT5: hands full (coin sack)
  const hp = p.stats.health, max = p.stats.maxHealth, grid = isArena(p.room);
  let extra = null;
  switch (it.use) {
    case 'heal':
      if (m.sudden) return 'sudden'; if (hp >= max) return 'full'; if (now < (p.healAt || 0)) return 'busy';
      p.stats.health = Math.min(max, hp + Math.round(it.n * G.healMult(p.perks))); p.healAt = now + 4000; extra = { hp: p.stats.health - hp }; break;
    case 'regen':
      if (m.sudden) return 'sudden'; if (hp >= max) return 'full'; if (p.regen && p.regen.until > now) return 'busy';
      p.regen = { until: now + it.ms, next: now + 1000, since: now, n: Math.round(it.n * G.healMult(p.perks)) }; extra = { ms: it.ms }; break;
    case 'speed':
      if (now < (p.tonicUntil || 0)) return 'busy';
      p.tonicUntil = now + it.ms; extra = { ms: it.ms, n: it.n }; break;
    case 'smoke': {
      m.smokes = (m.smokes || []).filter(s => s.until > now); if (m.smokes.length >= MAX_CLOUDS) return 'busy';
      const t = toss(m, p, 'smoke', now); m.smokes.push({ ...t, until: t.from + it.ms, r: it.r }); break;
    }
    case 'bomb': {
      m.bombs = m.bombs || []; if (m.bombs.length >= MAX_CLOUDS) return 'busy';
      const t = toss(m, p, 'bomb', now); m.bombs.push({ ...t, at: t.from + BOMB_FUSE, by: p, n: it.n, r: it.r }); break;
    }
    case 'wedge': {
      if (m.sudden) return 'sudden';
      let best = null, bd = it.r; m.wedged = m.wedged || [];
      for (const e of ADJ[p.room] || []) { if (!m.open.includes(e.door) || VAULT.includes(e.door) || isHatch(e.door) || m.wedged.includes(e.door)) continue; const d = Math.hypot(e.w1[0] - p.x, e.w1[1] - p.z); if (d <= bd) { bd = d; best = e; } }
      if (!best) return 'door';
      m.wedged.push(best.door); extra = { door: best.door }; break;
    }
    case 'seal':
      if (!grid) return 'room'; if (m.sel[p.room] == null) return 'pick'; m.sealed = m.sealed || {}; if (m.sealed[p.room]) return 'busy';
      m.sealed[p.room] = p.id; for (const q of m.players.values()) if (q.room === p.room && q.ws) sendTo(q.ws, { sealed: { room: p.room, by: p.name || 'Goblin' } }); break;
    case 'pick':
      if (!grid) return 'room'; if (!VAULT.includes(m.sel[p.room])) return 'pick'; m.picked = m.picked || {}; if (m.picked[p.room]) return 'busy';
      m.picked[p.room] = p.id; broadcastRound(m); break;
    default: { const r = use2(m, p, it, now); if (typeof r === 'string') return r; if (!r) return 'item'; extra = r; }   // USE2
  }
  setSlot(p.inv, slot, null); p.useAt = now; recalc(p); sendInv(p); m.dirty = true;
  sendTo(p.ws, { used: { key, slot, ...extra } });
  return null;
}
function explode(m, b, now) {
  bcast(m, { boom: { id: b.id, x: b.x, z: b.z, r: b.r, room: b.room } });
  const hit = [...m.players].filter(([, t]) => t !== b.by && !t.dead && t.entered && t.room === b.room && Math.hypot(t.x - b.x, t.z - b.z) <= b.r);
  for (const [tws, t] of hit) if (!t.dead) hitTarget(m, b.by.ws, b.by, tws, t, Math.max(1, Math.round(b.n * (1 - 0.5 * Math.hypot(t.x - b.x, t.z - b.z) / b.r))), now, 'Powder Bomb');
}
function useTick(m, now) {   // from the 50 ms match loop
  use2Tick(m, now);   // USE2
  if (m.bombs && m.bombs.length) { const due = m.bombs.filter(b => now >= b.at); if (due.length) { m.bombs = m.bombs.filter(b => now < b.at); for (const b of due) explode(m, b, now); } }
  if (m.smokes && m.smokes.length && m.smokes[0].until < now - 1000) m.smokes = m.smokes.filter(s => s.until > now);
  for (const p of m.players.values()) {   // mushroom regeneration: 1 s beats, ended by a hit
    const r = p.regen; if (!r) continue;
    if (p.dead || m.sudden || (p.hurtAt || 0) > r.since) { p.regen = null; continue; }
    while (r.next <= now && r.next <= r.until && p.stats.health < p.stats.maxHealth) { r.next += 1000; p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + r.n); m.dirty = true; }
    if (now > r.until || p.stats.health >= p.stats.maxHealth) p.regen = null;
  }
  if (now - (m.useBotAt || 0) >= 1000) {   // bots patch themselves up with a bandage or mushroom when badly hurt and left alone
    m.useBotAt = now;
    for (const p of m.players.values()) if (p.bot && !p.dead && p.entered && p.stats.health < p.stats.maxHealth * 0.5 && now - (p.hurtAt || 0) > 3000) {
      const s = BOT_USE_SLOTS.find(sl => { const k = getSlot(p.inv, sl); return k === 'x:bandage' || k === 'x:mushroom'; }); if (s) useItem(m, p, s, now);
    }
  }
}
const BOT_USE_SLOTS = [...Array.from({ length: 9 }, (_, i) => 'b' + i), 'q0', 'q1', 'q2'];
// USE-END
// USE2-BEGIN (docs/reports/more-items.md: Bear Trap, Signal Flare, Panel Lens, Crowbar, Ward Rune, Brain Jar, Mimic Bait, Dazzle Powder, Haggler's Tag, Rage Brew, Homing Feather, Alarm Bell; the charm slot is read through charmEff). use2() is the `default:` branch of useItem(): a failure reason (string), or the extra fields of {used}.
const charmEff = (p, f) => (p && p.inv ? G.charmEff(p.inv.charm, f) : undefined);
const goldMul = p => charmEff(p, 'gold') || 1;
const dmgMul = (p, now) => Math.min(1.5, (charmEff(p, 'dmg') || 1) * (now < (p.rageUntil || 0) ? G.ITEMS['x:rage'].n : 1));   // never more than +50% from items
const USE2_BOT = new Set(['x:ward', 'x:rage', 'x:jar', 'x:trap', 'x:dazzle']);
const useful2 = k => { const it = G.ITEMS[k]; return !!it && (it.type === 'charm' || USE2_BOT.has(k)); };   // what a bot picks up and uses
const MAX_PLACED = 2, BAIT_LIFE = 90000;
const baitKey = () => { let k = G.randomWeaponKey(); for (let i = 0; i < 20 && G.ITEMS[k].tierN < 1; i++) k = G.randomWeaponKey(); return k; };   // what the fake pile pretends to hold
function sweep(list, m, now, ev, owner) {   // drop spent / expired placed things, telling everyone (or just the owner)
  if (!list || !list.length) return list || [];
  const keep = [];
  for (const o of list) { if (o.until > now && !o.by.dead && o.by.match === m) keep.push(o); else { const msg = { [ev]: { id: o.id, hit: o.hit ? 1 : 0 } }; if (owner) sendTo(o.by.ws, msg); else bcast(m, msg); } }
  return keep.length === list.length ? list : keep;
}
function use2(m, p, it, now) {
  const hx = r2(p.x), hz = r2(p.z), id = (m.placeId = (m.placeId || 0) + 1);
  switch (it.use) {
    case 'trap':
      m.traps = sweep(m.traps, m, now, 'trapEnd'); if (m.traps.filter(o => o.by === p).length >= MAX_PLACED) return 'busy';
      m.traps.push({ id, x: p.x, z: p.z, room: p.room, by: p, armAt: now + it.arm, until: now + it.life });
      bcast(m, { trap: { id, x: hx, z: hz, room: p.room, by: p.id, arm: it.arm } }); return { arm: it.arm };
    case 'flare': bcast(m, { flare: { id, x: hx, z: hz, room: p.room, ms: it.ms, by: p.id } }); return { ms: it.ms };
    case 'lens': return { ms: it.ms };
    case 'pry': {
      if (m.sudden) return 'sudden';
      let best = null, bd = it.r;
      for (const e of ADJ[p.room] || []) { if (isOpen(m, e.door) || VAULT.includes(e.door)) continue; const d = Math.hypot(e.w1[0] - p.x, e.w1[1] - p.z); if (d <= bd) { bd = d; best = e; } }
      if (!best) return 'door';
      m.open = m.open.concat(best.door); (m.pried = m.pried || []).push({ door: best.door, until: now + it.ms }); broadcastRound(m); return { door: best.door, ms: it.ms };
    }
    case 'ward': if (p.ward && p.ward.until > now) return 'busy'; p.ward = { until: now + it.ms }; return { ms: it.ms };
    case 'know': {
      const gain = Math.round(it.n * (charmEff(p, 'know') || 1) * 100) / 100; p.stats.knowledge = Math.round((p.stats.knowledge + gain) * 100) / 100;
      sendTo(p.ws, { ate: { gain, knowledge: p.stats.knowledge } }); return {};
    }
    case 'bait': {
      if (m.drops.filter(d => d.bait === p.id).length >= MAX_PLACED) return 'busy';
      const dr = { id: m.nextDrop++, x: hx, z: hz, items: [baitKey()] };
      Object.defineProperty(dr, 'bait', { value: p.id, enumerable: false }); Object.defineProperty(dr, 'until', { value: now + BAIT_LIFE, enumerable: false, writable: true });   // not enumerable: never sent to clients
      m.drops.push(dr); if (m.drops.length > 60) m.drops.shift(); bcast(m, { drops: m.drops }); return {};
    }
    case 'dazzle':
      for (const q of m.players.values()) if (q !== p && !q.dead && q.entered && q.room === p.room && Math.hypot(q.x - p.x, q.z - p.z) <= it.r) q.dazeUntil = now + it.ms;
      bcast(m, { flash: { id: p.id, x: hx, z: hz, room: p.room, r: it.r, ms: it.ms } }); return {};
    case 'haggle': if (p.haggle) return 'busy'; p.haggle = true; return {};
    case 'crownseal': return A5.crownSeal(m, p) ? {} : 'room';   // ACT5: +5 s of crown claim on the dais
    case 'rage': if (now < (p.rageUntil || 0)) return 'busy'; p.rageUntil = now + it.ms; return { ms: it.ms };
    case 'recall': if (m.sudden) return 'sudden'; if (p.recall) return 'busy'; p.recall = { at: now + it.ms, since: now }; return { ms: it.ms };
    case 'bell':
      m.bells = sweep(m.bells, m, now, 'bellEnd', true); if (m.bells.filter(o => o.by === p).length >= MAX_PLACED) return 'busy';
      m.bells.push({ id, x: p.x, z: p.z, room: p.room, by: p, until: now + it.ms }); sendTo(p.ws, { bell: { id, x: hx, z: hz, room: p.room } }); return {};
    default: return null;
  }
}
function baitTake(m, p, dr, mode) {   // {loot} on a Mimic Bait pile: its owner gets the bait back, anybody else is bitten
  if (mode !== 'take') return 'item';
  const di = m.drops.indexOf(dr);
  if (dr.bait === p.id) { if (p.inv.backpack.indexOf(null) < 0) return 'space'; m.drops.splice(di, 1); giveItem(p, 'x:bait'); bcast(m, { drops: m.drops }); return null; }
  m.drops.splice(di, 1); bcast(m, { drops: m.drops });
  let owner = null; for (const q of m.players.values()) if (q.id === dr.bait) owner = q;
  const n = G.ITEMS['x:bait'].n, tws = [...m.players].find(([, q]) => q === p)[0];
  bcast(m, { mimic: { x: dr.x, z: dr.z, room: p.room } }); sendTo(p.ws, { bite: { dmg: n } });
  if (owner && !owner.dead) hitTarget(m, owner.ws, owner, tws, p, n, Date.now(), 'Mimic');
  return null;
}
function botUse2(m, p, now) {   // bots use the sensible ones: jar at once, ward / dazzle / trap when hurt, rage when a target is close
  const slot = k => BOT_USE_SLOTS.find(sl => getSlot(p.inv, sl) === k), hurtNow = now - (p.hurtAt || 0) < 1500; let s;
  if ((s = slot('x:jar'))) return useItem(m, p, s, now);
  if (hurtNow && (s = slot('x:ward'))) return useItem(m, p, s, now);
  const t = p.brain && p.brain.tgt;
  if (t && !t.dead && t.room === p.room && Math.hypot(t.x - p.x, t.z - p.z) < 4 && (s = slot('x:rage'))) return useItem(m, p, s, now);
  if (hurtNow) {
    let foe = null; for (const q of m.players.values()) if (q.id === p.hitBy && !q.dead && q.room === p.room && Math.hypot(q.x - p.x, q.z - p.z) < 3.5) foe = q;
    if (foe && (s = slot('x:dazzle'))) return useItem(m, p, s, now);
    if (p.stats.health < p.stats.maxHealth * 0.6 && (s = slot('x:trap'))) return useItem(m, p, s, now);
  }
}
function use2Tick(m, now) {   // from useTick (50 ms)
  if (m.traps && m.traps.length) {
    const I = G.ITEMS['x:trap'];
    for (const tr of m.traps) {
      if (now < tr.armAt || tr.until <= now) continue;
      for (const [tws, t] of m.players) {
        if (t === tr.by || t.dead || !t.entered || t.room !== tr.room || Math.hypot(t.x - tr.x, t.z - tr.z) > 0.9) continue;
        tr.hit = true; tr.until = 0; t.snareUntil = now + I.ms; if (t.ws) sendTo(t.ws, { snared: { ms: I.ms, n: 0.35 } });
        hitTarget(m, tr.by.ws, tr.by, tws, t, I.n, now, 'Bear Trap'); break;
      }
    }
    m.traps = sweep(m.traps, m, now, 'trapEnd');
  }
  if (m.bells && m.bells.length) {
    const I = G.ITEMS['x:bell'];
    for (const b of m.bells) for (const t of m.players.values()) {
      if (t === b.by || t.dead || !t.entered || t.npc || t.room !== b.room || Math.hypot(t.x - b.x, t.z - b.z) > I.r) continue;
      sendTo(b.by.ws, { bellRing: { id: b.id, room: b.room, by: t.id, ms: I.reveal } }); b.hit = true; b.until = 0; break;
    }
    m.bells = sweep(m.bells, m, now, 'bellEnd', true);
  }
  if (m.pried && m.pried.length && m.pried.some(d => d.until <= now)) {   // a pried-open door slams shut again
    const gone = m.pried.filter(d => d.until <= now).map(d => d.door); m.pried = m.pried.filter(d => d.until > now);
    m.open = m.open.filter(d => !gone.includes(d)); broadcastRound(m);
  }
  if (m.drops && m.drops.some(d => d.until && d.until <= now)) { m.drops = m.drops.filter(d => !(d.until && d.until <= now)); bcast(m, { drops: m.drops }); }
  for (const p of m.players.values()) {
    const r = p.recall; if (!r) continue;
    if (p.dead || m.sudden) { p.recall = null; continue; }
    if ((p.hurtAt || 0) > r.since) { p.recall = null; sendTo(p.ws, { recallEnd: { ok: 0 } }); continue; }
    if (now >= r.at) {
      p.recall = null; const home = RB[p.home] ? p.home : 0, [x, z] = WORLD.randomPoint(home), pr = p.room;
      place(p, x, z); noteRoom(m, p, pr); p.sd = true; m.dirty = true; sendTo(p.ws, { fix: [r2(p.x), r2(p.z)] }); sendTo(p.ws, { recallEnd: { ok: 1 } });
    }
  }
  if (now - (m.use2BotAt || 0) >= 1000) { m.use2BotAt = now; for (const p of m.players.values()) if (p.bot && !p.dead && p.entered) botUse2(m, p, now); }
}
// USE2-END
// LOOT-BEGIN (vault relic, merchant price scaling, throwable plushie, bots at stations; see docs/reports/loot.md)
const RELIC_POS = WORLD.RELIC;   // the pedestal on the dais edge (the game.js LOOT block uses the same offset)
const priceAt = (base, round) => Math.max(5, Math.round(base * (1 + 0.1 * Math.max(0, round - 2)) / 5) * 5);   // +10 % per round after round 2, rounded to 5 gold
const LURE_FLY = 650, LURE_MS = 3000, LURE_RANGE = 8;
function lootInit(m) {
  const keys = Object.keys(ITEMS).filter(k => ITEMS[k].chance > 0 && ITEMS[k].tierN >= 3 && (ITEMS[k].type === 'weapon' || ITEMS[k].type === 'armor'));   // mythic or better, weighted by the normal drop chances
  let r = Math.random() * keys.reduce((s, k) => s + ITEMS[k].chance, 0); m.relicKey = keys[0]; for (const k of keys) { if ((r -= ITEMS[k].chance) < 0) { m.relicKey = k; break; } }
  m.relicTaken = null; m.lures = [];
  for (const s of m.shops) if (s) for (const it of s) it.base = it.price;
}
function lootRound(m) {   // a new round: shop prices follow the round number (server is authoritative; buy() and the bots read it.price)
  let ch = false; for (const s of m.shops) if (s) for (const it of s) { const np = priceAt(it.base || it.price, m.round); if (np !== it.price) { it.price = np; ch = true; } }
  if (ch) bcast(m, { shops: m.shops });
}
const relicFree = m => !!m.relicKey && !m.relicTaken && m.open.some(d => VAULT.includes(d));
function relicClaim(m, p) {   // E next to the pedestal inside the vault: the first goblin only
  if (m.relicTaken) return 'taken';
  if (Math.hypot(p.x - RELIC_POS.x, p.z - RELIC_POS.z) > 2.2) return 'room';   // too far from the pedestal (also keeps the old 'claim in the middle of the vault fails' test true)
  if (!giveItem(p, m.relicKey)) return 'space';
  m.relicTaken = p.id; m.dirty = true;
  sendTo(p.ws, { claimed: { room: WORLD.VAULT, key: m.relicKey, gold: 0, relic: 1 } });
  bcast(m, { relic: null, feed: { k: p.name || 'Goblin', msg: ' seized the Vault relic!' } });
  return null;
}
function relicGoal(m, p, dt, now) {   // a bot in the vault walks to the pedestal and takes the relic
  const b = p.brain; if (p.room !== VK || m.relicTaken || !m.relicKey || b.relicTries > 2) return false;
  if (Math.hypot(p.x - RELIC_POS.x, p.z - RELIC_POS.z) > 1.8) { stepTo(m, p, RELIC_POS.x, RELIC_POS.z, dt, now); return true; }
  b.relicTries = (b.relicTries || 0) + 1; claim(m, p); equipBest(m, p); return false;
}
function throwPlushie(m, p, slot, now) {   // {throw: 'q1'}: the plushie leaves the slot, the server picks the landing spot 7 m ahead (clamped into the room) and tells everyone
  if (m.phase !== 'play' || !m.goAt || now < m.goAt || !RB[p.room] || typeof slot !== 'string' || !/^(q[0-2]|b[0-8])$/.test(slot) || getSlot(p.inv, slot) !== 'x:plushie') return;
  setSlot(p.inv, slot, null); recalc(p); sendInv(p); m.dirty = true;
  let [lx, lz] = clampIn(p.room, p.x - Math.sin(p.yaw) * 7, p.z - Math.cos(p.yaw) * 7, 0.7);
  [lx, lz] = WORLD.slide(p.x, p.z, lx, lz, 0.2, m.layout, true);   // SOLID: the plushie lands next to a prop, never inside it
  m.lures = (m.lures || []).filter(q => q.until > now);
  const l = { id: (m.lureId = (m.lureId || 0) + 1), x: lx, z: lz, room: p.room, from: now + LURE_FLY, until: now + LURE_FLY + LURE_MS };
  m.lures.push(l);
  bcast(m, { throw: { id: l.id, by: p.id, from: [+p.x.toFixed(2), +p.z.toFixed(2)], to: [+lx.toFixed(2), +lz.toFixed(2)], ms: LURE_FLY, room: p.room } });
}
function lureFor(m, p, now) {   // the landed plushie in this room within 8 m of p (bots and mystery enemies walk to it for 3 s)
  let best = null, bd = LURE_RANGE;
  for (const l of m.lures || []) { if (now < l.from || now > l.until || l.room !== p.room) continue; const d = Math.hypot(l.x - p.x, l.z - p.z); if (d <= bd) { bd = d; best = l; } }
  return best;
}
const BOT_SLOTS = [...Array.from({ length: 9 }, (_, i) => 'b' + i), 'q0', 'q1', 'q2'];
const isJunkW = (p, k) => { const it = G.ITEMS[k]; return !!it && (it.type === 'weapon' ? !betterW(p.inv.weapon, k) : it.type === 'armor' && !betterA(p.inv.armor, k)) && !!G.recycleYield(k); };   // ARMOUR-3: spare armour that is no upgrade is junk too
const botNeedsStation = p => BOT_SLOTS.some(s => { const k = getSlot(p.inv, s); return k && isJunkW(p, k); });
function botStations(m, p) {   // in a merchant room or a stations mystery room: recycle junk weapons, then craft the best tier 0 recipe the parts pay for
  if (hasStation(m, p, 'recycler')) for (const s of BOT_SLOTS) { const k = getSlot(p.inv, s); if (k && isJunkW(p, k) && !recycle(m, p, s)) BS.rec = (BS.rec || 0) + 1; }
  if (knowBench(m, p)) botLearn(m, p);   // KNOWLEDGE: spend knowledge points on the bot perks
  if (knowBench(m, p) && !p.crafting) {   // STATIONS: price and gate every recipe at THIS bench's type (the Master Forge is cheaper and reaches higher tiers)
    const stn = stationAt(m, p, 'workbench') || stationAt(m, p, 'knowledge'); let best = null, bv = -1;
    for (const r of G.RECIPES) { const bc = G.benchCraft(p, r, stn.type, p.perks); if (bc.why || (r.tier !== 0 && stn.type !== 'master') || !Object.keys(bc.cost).every(k => (p.parts[k] || 0) >= bc.cost[k])) continue; const o = G.ITEMS[r.out], v = o.attack || o.health || 0; if (!v) continue; if (v > bv) { bv = v; best = r; } }
    if (best && !craft(m, p, best.id)) BS.cra = (BS.cra || 0) + 1;
  }
}
function botLab(m, ws, p, cmd) {   // GK_DEBUG only, for tests. 'station': make c1 (the first loot room) a merchant and drop a bot with junk into it. {near:[x,z]}: put a bot there. Any command replies with counters and the lab bot's state.
  const bot = [...m.players.values()].find(q => q.bot && !q.dead);
  if (cmd && cmd.nav && bot) {   // NAV test: {nav:{obs:[{x,z,hw,hd}|{x,z,r}], from:[x,z], to:[x,z]}} synthetic props for this match, the bot walks from `from` to `to`; {nav:{backpack:[keys]}} fills the bot's backpack and runs equipBest
    const n = cmd.nav, b = bot.brain;
    if (Array.isArray(n.obs)) m.obstacles = n.obs.slice(0, 40).map(o => ({ x: +o.x, z: +o.z, hw: +o.hw || 0, hd: +o.hd || 0, r: +o.r || 0 }));
    if (Array.isArray(n.from) && Array.isArray(n.to)) { place(bot, +n.from[0], +n.from[1]); b.route = [[+n.to[0], +n.to[1]]]; b.cross = false; b.idleUntil = Date.now() + 60000; b.mode = ''; b.tgt = null; b.waitUntil = 0; b.pauseUntil = 0; b.nav = {}; m.dirty = true; }
    if (Array.isArray(n.backpack)) { bot.inv.backpack = n.backpack.slice(0, 9).concat(Array(9).fill(null)).slice(0, 9).map(k => (typeof k === 'string' && G.ITEMS[k] ? k : null)); equipBest(m, bot); }
  }
  if (cmd === 'station' && bot) {
    m.layout[1] = 'merchant'; m.shops[1] = G.randomShop().map(it => ({ ...it, base: it.price })); bot.inv.weapon = 'w:sword'; bot.inv.backpack[0] = 'w:stick'; bot.inv.backpack[1] = 'w:stick'; bot.gold = 0; recalc(bot);
    const c = WORLD.CHEST[1]; bot.brain.route = []; bot.brain.done = {}; bot.brain.idleUntil = 0; bot.brain.mode = ''; place(bot, c.cx, c.cz); m.dirty = true; BS.rec = 0; BS.cra = 0;
  } else if (cmd && Array.isArray(cmd.near) && bot) {   // {near:[x,z]} one bot; {near:[x,z], all:1} every living bot in a small grid, or on a ring of radius `ring` around the point
    const bots = cmd.all ? [...m.players.values()].filter(q => q.bot && !q.dead) : [bot], r = +cmd.ring > 0 ? +cmd.ring : 0;
    bots.forEach((q, i) => { const a = 2 * Math.PI * i / bots.length; place(q, cmd.near[0] + (r ? Math.cos(a) * r : (i % 3) * 0.8), cmd.near[1] + (r ? Math.sin(a) * r : Math.floor(i / 3) * 0.8)); q.brain.route = []; q.brain.idleUntil = Date.now() + 60000; q.brain.mode = ''; q.roomAt = 0; q.brain.tgt = null; q.brain.search = null; q.brain.scan = null; q.brain.waitUntil = 0; q.brain.pauseUntil = 0;
      if (typeof cmd.yaw === 'number') q.yaw = cmd.yaw; else if (r) q.yaw = yawTo(q, cmd.near[0], cmd.near[1]);   // ring bots face the middle unless {yaw} says otherwise
      q.brain.scanAt = typeof cmd.scanAfter === 'number' ? Date.now() + cmd.scanAfter : 0; q.sd = true; if (cmd.wpn === 'none' || (typeof cmd.wpn === 'string' && G.ITEMS[cmd.wpn])) { q.inv.weapon = cmd.wpn === 'none' ? null : cmd.wpn; recalc(q); } }); m.dirty = true;   // wpn: give the bot that weapon ('none': unarmed, 1 damage, keeps a test human alive). roomAt 0: they count as long-time residents. scanAfter: ms before the idle bot first looks around
  }
  sendTo(ws, { botlab: { rec: BS.rec || 0, cra: BS.cra || 0, pos: bot ? [bot.x, bot.z] : null, junk: bot ? bot.inv.backpack.filter(k => k === 'w:stick').length : 0, room: bot ? bot.room : null, charm: bot ? bot.inv.charm : null, know: bot ? bot.stats.knowledge : null, pack: bot ? bot.inv.backpack.filter(Boolean) : null, wpn: bot ? bot.inv.weapon : null, armor: bot ? bot.inv.armor : null, nav: BS.nav || 0, yaw: bot ? bot.yaw : null, ai: bot ? { aggr: bot.brain.aggr, flee: bot.brain.flee, greed: bot.brain.greed, patience: bot.brain.patience } : null } });
}
// LOOT-END
// ELIXIR-BEGIN (PLAN-5x5 1.7, 1.8; docs/reports/elixir-home-wiring.md). Pure rules live in elixir.js (pump, sinks) and homebase.js (upgrades, security, sends); this block holds the per-match state m.homes[homeKey] and the server effects.
// m.homes[key] = homebase home {owner (player id), lv, box, snareArmed, ammo, dead, ...} + {key, ref (owner's player record), pump, pickSeen}. Carried elixir is p.elixir. Live sendables are m.sends, one send per player and round is m.sentRound[id] = round.
const HB = require('./homebase.js'), EX = require('./elixir.js');
const homeAt = (m, key) => (m.homes && typeof key === 'string' && m.homes[key]) || null;
const hAnchor = (key, kind) => { const c = WORLD.CHEST[+key.slice(1)], a = WORLD.HOME_LAYOUT[kind]; return WORLD.attLocal(c, a[0], a[1]); };   // pump, screen, box, sentry in world metres
const hState = (p, key, kind) => { const [x, z] = hAnchor(key, kind); return { id: p.id, alive: !p.dead, entered: !!p.entered, roomKey: p.room, homeKey: key, dist: Math.hypot(p.x - x, p.z - z) }; };
const sendElixir = p => { if (p.ws) sendTo(p.ws, { elixir: p.elixir | 0 }); };
const homeToast = (p, kind, text) => { if (p && p.ws && !p.dead) sendTo(p.ws, { homeToast: { kind, text } }); };
const homeRes = (p, ok, reason, text) => { if (p.ws) sendTo(p.ws, { homeRes: { ok, ...(reason ? { reason } : null), ...(text ? { text } : null) } }); };
const ENV = name => ({ id: 0, npc: 'env', name, x: 0, z: 0, kills: 0, stats: null, ws: null, inv: null, dead: false });   // the "attacker" of gas, plates, snares and sentries: no perks, no bounty, shown as an enemy in the feed
const envHit = (m, t, dmg, now, name) => { if (t.dead || !t.entered || dmg <= 0) return; const e = [...m.players].find(([, q]) => q === t); if (e) hitTarget(m, null, ENV(name), e[0], t, dmg, now, name); };
const homeRate = (p, now) => { const r = (p.hmRing || []).filter(t => now - t < 1000); p.hmRing = r; if (r.length >= HB.MSG_RATE * 2) return false; r.push(now); return true; };   // 8 msgs/s per player over every home message (the screen itself allows 4/s, homebase.canUseScreen)
function homesInit(m, now) {   // at GO: a home record and a pump for every goblin, bots included
  m.homes = {}; m.sends = []; m.sentRound = {};
  for (const p of m.players.values()) if (!p.npc && typeof p.home === 'string' && WORLD.CHEST[+p.home.slice(1)]) {
    p.elixir = 0; p.distills = 0; p.oils = 0; p.elxRoom = p.room;
    m.homes[p.home] = Object.assign(HB.createHome(p.id), { key: p.home, ref: p, pump: EX.createPump(now, 1), pickSeen: {} });
    sendElixir(p);
  }
}
const activeSends = (m, now) => { const o = {}; for (const s of m.sends || []) if (HB.sendPhase(s, now) !== 'over' && !s.ended) o[s.room] = (o[s.room] || 0) + 1; return o; };
function homeView(m, h, p, now) {   // what the owner sees on the Elixir Screen ({home}); everything else about a home stays on the server
  const homes = {}; for (const k in m.homes) homes[k] = { owner: m.homes[k].ref.name, dead: m.homes[k].dead ? 1 : 0 };
  return { key: h.key, lv: h.lv, ammo: h.ammo, snareArmed: h.snareArmed, dead: h.dead, box: h.box.map(k => ({ name: (info(k) || {}).name || k, n: 1 })), slots: HB.lockboxSlots(h), tank: EX.tick(h.pump, now), tankCap: EX.params(h.pump).cap, round: m.round, sentRound: m.sentRound[p.id] === m.round ? 1 : 0, distills: p.distills | 0, active: activeSends(m, now), elixir: p.elixir | 0, homes };
}
const pushHome = (m, h, now) => { const p = h.ref; if (p && p.ws && !p.dead) { sendTo(p.ws, { home: homeView(m, h, p, now) }); sendElixir(p); } };

// ---- messages: {pump:1}, {base:{buy|act|send+room|crack}}, {lockbox:{put|take}}, {brew:'heal'|'tonic'}
function pumpUse(m, p, now) {
  const h = homeAt(m, p.room); if (!h || !EX.canUsePump(hState(p, p.room, 'pump'))) return homeRes(p, false, 'Too far from the pump');
  const own = h.owner === p.id, r = EX.collect(h.pump, p.elixir | 0, now, own);
  p.elixir = r.carried;
  if (r.moved <= 0) return homeRes(p, false, (p.elixir | 0) >= EX.CARRY_CAP ? 'You carry all you can' : 'The tank is empty');
  sendElixir(p); homeRes(p, true, null, '+' + r.moved + ' elixir');
  if (r.raid && !h.dead && h.ref && !h.ref.dead) { homeToast(h.ref, 'raid', p.name + ' is draining your pump!'); sendTo(h.ref.ws, { pumpGlow: EX.RAID_GLOW_MS }); }
  pushHome(m, h, now);
}
function baseMsg(m, p, b, now) {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return;
  if (b.crack === 1) return crackStart(m, p, now);
  const h = homeAt(m, p.home); if (!h || h.dead) return;
  const gate = HB.canUseScreen(h, hState(p, p.home, 'screen'), now); if (!gate.ok) return homeRes(p, false, gate.reason === 'range' ? 'Too far from the screen' : gate.reason === 'rate' ? 'Slow down' : gate.reason);
  let r = null;
  if (typeof b.buy === 'string') {
    r = HB.buy(h, b.buy, p);
    if (r.ok) { if (b.buy === 'pump') EX.setLevel(h.pump, HB.pumpLevel(h), now); r.text = HB.UPGRADES[b.buy].name + ' bought'; }
    else if (r.reason === 'max') r.reason = 'Already at the top level';
  } else if (b.act === 'distill') {
    r = EX.distill(p); if (r.ok) { G.addKnowledge(p, r.knowledge); m.dirty = true; r.text = '+' + r.knowledge + ' knowledge'; } else if (r.reason === 'max') r.reason = 'Three distills per match';
  } else if (b.act === 'snareRearm') { r = HB.rearmSnare(h, p); if (!r.ok && r.reason === 'n/a') r.reason = 'Nothing to re-arm'; if (r.ok) r.text = 'Snare armed'; }
  else if (b.act === 'sentryAmmo') { r = HB.buyAmmo(h, p); if (!r.ok && r.reason === 'n/a') r.reason = 'No sentry'; if (r.ok) r.text = 'Sentry reloaded'; }
  else if (typeof b.send === 'string' && typeof b.room === 'string') r = sendStart(m, p, h, b.send, b.room, now);
  else return;
  if (!r) return;
  homeRes(p, r.ok, r.ok ? null : r.reason, r.text); pushHome(m, h, now);
}
function lockboxMsg(m, p, b, now) {
  const h = homeAt(m, p.home); if (!h || h.dead || !b || typeof b !== 'object') return;
  const gate = HB.canUseScreen(h, hState(p, p.home, 'screen'), now); if (!gate.ok) return homeRes(p, false, gate.reason === 'range' ? 'Too far from the screen' : gate.reason);
  if (b.put !== undefined) {
    const slot = Number.isInteger(b.put) ? 'b' + b.put : b.put;
    if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return homeRes(p, false, 'That cannot be stored');
    const key = getSlot(p.inv, slot); if (!key) return homeRes(p, false, 'Nothing there');
    if (!HB.boxPut(h, key)) return homeRes(p, false, 'The lockbox is full');
    setSlot(p.inv, slot, null); sendInv(p);
  } else if (Number.isInteger(b.take)) {
    if (b.take < 0 || b.take >= h.box.length) return homeRes(p, false, 'Nothing there');
    const key = h.box[b.take]; if (!giveItem(p, key)) return homeRes(p, false, 'Your backpack is full');
    HB.boxTake(h, b.take);
  } else return;
  pushHome(m, h, now);
}
function brewAt(m, p, kind) {   // {brew}: any workbench; the home bench is owner-only. Returns null or a failure reason
  if (typeof kind !== 'string' || !stationAt(m, p, 'workbench')) return 'room';
  const h = homeAt(m, p.room); if (h && !HB.canUseStation(h, p.id)) return 'owner';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  const r = EX.brew(p, kind); if (!r.ok) return r.reason;
  giveItem(p, r.item === 'c:draught' ? 'x:draught' : r.item); sendElixir(p); sendTo(p.ws, { brewed: { key: r.item === 'c:draught' ? 'x:draught' : r.item, cost: r.cost } });
  return null;
}
function homeRecycle(m, p, slot, refine) {   // {recycle:slot, refine?:1} inside a home: owner only, efficiency from the Recycler upgrade, or 100% for 4 elixir (Refine). Returns null or a failure reason
  const h = homeAt(m, p.room); if (!h) return 'room';
  if (!HB.canUseStation(h, p.id)) return 'owner';
  if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return 'item';
  const key = getSlot(p.inv, slot), base = key && G.recycleFor(key, p.perks); if (!base) return 'item';
  let eff = h.dead ? 0.5 : HB.recyclerEff(h);
  if (refine === true) { if ((p.elixir | 0) < EX.SINKS.refine) return 'elixir'; const r = EX.refine(p, 1); if (!r.ok) return r.reason; eff = r.eff; sendElixir(p); }
  const y = G.recycleEff(base, eff); if (!y) return 'item';
  setSlot(p.inv, slot, null); for (const k in y) p.parts[k] = (p.parts[k] || 0) + y[k];
  sendInv(p); sendParts(p); sendTo(p.ws, { recycled: { key, parts: y, ...(refine === true ? { refined: 1 } : null) } }); m.dirty = true;
  return null;
}
function homeMsg(m, ws, p, d, now) {   // the one entry for the home messages (validated here, then by homebase.js)
  if (!m.homes || m.phase !== 'play' || m.ended || p.dead || !p.entered || !homeRate(p, now)) return;
  if (d.pump === 1) pumpUse(m, p, now);
  else if (d.base !== undefined) baseMsg(m, p, d.base, now);
  else if (d.lockbox !== undefined) lockboxMsg(m, p, d.lockbox, now);
  else if (d.brew !== undefined) { const why = brewAt(m, p, d.brew); if (why) sendTo(ws, { brewFail: why }); }
}

// ---- raids: crack a foreign lockbox (8 s, 14 s against Lock L2) within 1.5 m
function crackStart(m, p, now) {
  const h = homeAt(m, p.room); if (!h) return homeRes(p, false, 'Not a home');
  const r = HB.startCrack(h, hState(p, p.room, 'box'), now);
  if (!r.ok) return homeRes(p, false, r.reason === 'range' ? 'Too far from the box' : r.reason === 'busy' ? 'Someone is already cracking it' : 'Nothing to crack');
  homeRes(p, true, null, 'Cracking the lockbox...');
  if (h.ref && !h.ref.dead) homeToast(h.ref, 'raid', p.name + ' is cracking your lockbox!');
}
function crackTick(m, h, now) {
  const c = h.crack; if (!c) return;
  const q = [...m.players.values()].find(x => x.id === c.by);
  if (!q || q.dead || q.room !== h.key || hState(q, h.key, 'box').dist > HB.CRACK_RANGE + 0.3) { HB.cancelCrack(h); return; }
  if (now < c.doneAt) return;
  const items = HB.finishCrack(h, q.id, now) || [], left = items.filter(k => !giveItem(q, k));
  if (left.length) addDrop(m, q, left);
  homeToast(q, 'good', items.length ? 'Lockbox cracked: ' + items.length + ' item' + (items.length > 1 ? 's' : '') : 'The box was empty'); sendInv(q);
  if (h.ref && !h.ref.dead) { homeToast(h.ref, 'raid', 'Your lockbox was emptied by ' + q.name); pushHome(m, h, now); }
}

// ---- the lock: pathOk() asks homeGate() whenever a non-owner steps through a hatch into a home. A refused step starts the pick bar; it keeps running while he keeps pushing (600 ms grace).
function homeGate(m, p, k, now) {
  const h = homeAt(m, k); if (!h || p.npc) return true;
  if (HB.hatchOk(h, p.id, now, { suddenDeath: !!m.sudden, showdown: !!m.showdown })) return true;
  HB.startPick(h, p.id, now); h.pickSeen[p.id] = now; p.lockDeny = true;
  if (now - (p.pickToast || 0) > 4000) { p.pickToast = now; homeToast(p, 'info', 'Picking the lock...'); }
  return false;
}

// ---- sendables
const SEND_WARN = { bell: 'Alarm bell! You show on every map', gas: 'Stink gas incoming!', rats: 'Rats incoming!', jam: 'Panel jammed!', spike: 'A trap is set in this room', leech: 'Someone is draining your pump!' };
function sendStart(m, p, h, id, room, now) {
  const th = homeAt(m, room), target = th ? { room, kind: 'home', owner: th.owner, dead: th.dead } : isArena(room) ? { room, kind: 'arena' } : null;
  const spots = []; if (id === 'spike' && target && target.kind === 'arena') for (let i = 0; i < 24 && spots.length < 8; i++) { const [x, z] = WORLD.randomPoint(room); if (!WORLD.inProp(x, z, 0.8, m.layout, true) && !WORLD.inProp(x, z, 0.3, m.layout, true)) spots.push([x, z]); }
  const ctx = { sender: p.id, senderRoom: p.home, round: m.round, elixir: p.elixir | 0, now, vaultKey: VK, target, sentRound: m.sentRound, active: (m.sends || []).filter(s => !s.ended).map(s => ({ room: s.room, endsAt: s.endsAt })), roundEndsAt: m.endsAt, spots };
  const c = HB.checkSend(id, ctx); if (!c.ok) return { ok: false, reason: c.reason };
  const s = HB.makeSend(id, ctx, Math.random); p.elixir -= c.cost; m.sentRound[p.id] = m.round;
  Object.assign(s, { id: (m.sendN = (m.sendN || 0) + 1), byName: p.name, by: p }); m.sends.push(s);
  return { ok: true, text: HB.SENDS[id].name + ' sent. The room has been warned.' };
}
function mkRat(m, room, now) {   // a rat is an NPC kind (like the mystery enemies): never counts as a goblin, no loot, dies to normal attacks
  const S = NPC.rat; let x, z; for (let i = 0; i < 20; i++) { [x, z] = WORLD.randomPoint(room); if (!WORLD.inProp(x, z, 0.5, m.layout, true)) break; }
  const key = { readyState: 0, npc: true }, p = { id: nextId++, wins: 0, ws: null, key, npc: 'rat', name: S.name, match: m, box: -1, yaw: 0, ready: true, entered: true, npcDmg: S.dmg, npcCd: S.cd };
  equip(p, S.look); p.inv.weapon = S.weapon; p.inv.armor = null; recalc(p); p.stats.maxHealth = S.hp; p.stats.health = S.hp; p.stats.attack = S.dmg; p.gear = { weapon: 'Rat teeth', armor: 'None' };
  place(p, x, z); p.home = [x, z]; p.brain = newBrain(p, S.speed); p.brain.react = S.react; p.rat = true; m.players.set(key, p); return p;
}
function sendTick(m, now) {
  for (const s of m.sends) {
    const ph = HB.sendPhase(s, now);
    if (!s.warned) {   // the 3 s telegraph: only the occupants learn the sender (a toast naming him); the room itself shows a fx flag to everyone
      s.warned = true;
      for (const q of m.players.values()) if (q.room === s.room && !q.dead && q.entered && !q.npc) homeToast(q, 'send', SEND_WARN[s.kind] + (s.kind === 'leech' ? '' : '. Sent by ' + s.byName));
      bcast(m, { homeFx: { id: s.id, kind: s.kind, room: s.room, warn: HB.TELEGRAPH_MS } });
    }
    if (ph === 'active' && !s.started) {
      s.started = true; s.lastTick = s.startsAt;
      if (s.kind === 'rats') { s.rats = Array.from({ length: HB.SENDS.rats.rats }, () => mkRat(m, s.room, now)); m.dirty = true; }
      else if (s.kind === 'jam') { m.sealed = m.sealed || {}; m.sealed[s.room] = true; }   // the seal mechanism (sealing wax) is exactly "the pick is frozen until the round ends"
      else if (s.kind === 'leech') {
        const vh = homeAt(m, s.room); s.plan = vh ? EX.leechPlan(vh.pump, HB.hasGuard(vh), now) : { ok: false, total: 0 }; s.delivered = 0;
        if (!s.plan.ok) { homeToast(s.by, 'info', vh && HB.hasGuard(vh) ? 'Pump Guard: the leech was blocked' : 'The leech found nothing'); s.endsAt = now; }
        else if (vh.ref && !vh.ref.dead) homeToast(vh.ref, 'raid', s.byName + ' is draining your pump!');
      }
      bcast(m, { homeFx: { id: s.id, kind: s.kind, room: s.room, on: 1, ms: s.kind === 'jam' || s.kind === 'spike' ? Math.max(0, s.endsAt - now) : HB.SENDS[s.kind].ms, ...(DBG && s.spot ? { spot: s.spot } : null) } });   // the plate stays hidden; only the tests (GK_DEBUG) see where it is
    }
    if (ph === 'active' && s.started && !s.ended) {
      if (s.kind === 'gas') { const n = HB.gasTicks(s, s.lastTick, now); s.lastTick = now; if (n > 0) for (const q of [...m.players.values()]) if (q.room === s.room && !q.npc) envHit(m, q, n * HB.SENDS.gas.dmg, now, 'Stink Gas'); }
      else if (s.kind === 'spike' && s.spot) {
        for (const q of [...m.players.values()]) if (q.room === s.room && !q.npc && !q.dead && q.entered && Math.hypot(q.x - s.spot[0], q.z - s.spot[1]) < 0.8) {
          s.endsAt = now; q.snareUntil = now + HB.SENDS.spike.slowMs; if (q.ws) sendTo(q.ws, { snared: { ms: HB.SENDS.spike.slowMs, n: 0.35 } });
          bcast(m, { homeFx: { id: s.id, kind: 'spike', room: s.room, hit: [+s.spot[0].toFixed(2), +s.spot[1].toFixed(2)] } }); envHit(m, q, HB.SENDS.spike.dmg, now, 'Spike Trap'); break;
        }
      } else if (s.kind === 'leech' && s.plan && s.plan.ok) {
        const vh = homeAt(m, s.room), due = EX.leechDue(s.plan, s.delivered, now);
        if (due > 0 && vh && !s.by.dead) { EX.tick(vh.pump, now); const amt = Math.min(due, vh.pump.tank, EX.CARRY_CAP - (s.by.elixir | 0)); if (amt > 0) { vh.pump.tank -= amt; s.by.elixir = (s.by.elixir | 0) + amt; s.delivered += amt; sendElixir(s.by); } }
        if (s.by.dead) s.endsAt = now;
      }
    }
    if ((HB.sendPhase(s, now) === 'over' || s.endsAt <= now) && s.started && !s.ended) {
      s.ended = true;
      if (s.rats) for (const r of s.rats) if (!r.dead) { r.dead = true; m.players.delete(r.key); m.dirty = true; }
      bcast(m, { homeFx: { id: s.id, kind: s.kind, room: s.room, on: 0 } });
    }
  }
  m.sends = m.sends.filter(s => !(s.ended || (HB.sendPhase(s, now) === 'over' && !s.started)));
}

// ---- the per-match tick (from the main loop, about 5 Hz): lazy pumps need none, this does pads, sentries, alarms, snares, sends, raids, bots and the owner's live view
function elixirTick(m, now) {
  if (m.phase !== 'play' || m.ended || !m.goAt || now < m.goAt) return;
  if (!m.homes) homesInit(m, m.goAt);
  if (now - (m.elxAt || 0) < 200) return; m.elxAt = now;
  for (const h of Object.values(m.homes)) {
    for (const pid in h.pickSeen) if (now - h.pickSeen[pid] > 600) { HB.cancelPick(h, +pid); delete h.pickSeen[pid]; }
    crackTick(m, h, now);
    const o = h.ref;
    if (!h.dead && HB.level(h, 'sentry') && h.ammo > 0) {   // the Sentry Crossbow fires only while the owner is away, 8 damage / 1.5 s at the nearest non-owner in line of sight
      const away = !o || o.dead || o.room !== h.key, [sx, sz] = hAnchor(h.key, 'sentry');
      if (away) for (const q of [...m.players.values()]) {
        if (q.room !== h.key || q.dead || !q.entered || q.npc || q.id === h.owner || WORLD.segBlocked(sx, sz, q.x, q.z, m.layout)) continue;
        const sh = HB.sentryShot(h, false, true, now); if (sh) { envHit(m, q, sh.damage, now, 'Sentry'); bcast(m, { homeFx: { kind: 'sentry', room: h.key, to: q.id } }); } break;
      }
    }
    if (o && !o.dead && o.entered && o.room === h.key && o.stats && o.stats.health < o.stats.maxHealth && now - (h.padAt || 0) >= 1000) {   // Healing Pad
      const hp = HB.padHps(h, now - (o.hurtAt || 0), !!m.sudden); h.padAt = now; if (hp > 0) { o.stats.health = Math.min(o.stats.maxHealth, o.stats.health + hp); m.dirty = true; }
    }
  }
  for (const p of m.players.values()) {   // room changes: alarm and snare when a non-owner steps into a home
    if (p.npc || p.dead || !p.entered) continue;
    if (p.elxRoom !== p.room) {
      p.elxRoom = p.room; const h = homeAt(m, p.room);
      if (h) {
        for (const ev of HB.onEnter(h, p.id, p.name, now)) {
          if (ev.type === 'alarm') { if (h.ref && !h.ref.dead) { homeToast(h.ref, 'alarm', ev.text); sendTo(h.ref.ws, { homePing: { room: h.key, name: p.name } }); } }
          else if (ev.type === 'snare') { p.snareUntil = now + ev.rootMs; if (p.ws) sendTo(p.ws, { snared: { ms: ev.rootMs, n: 0.05 } }); homeToast(p, 'raid', 'A snare grabs your leg!'); envHit(m, p, ev.damage, now, 'Snare'); if (h.ref && !h.ref.dead) homeToast(h.ref, 'alarm', 'Your snare caught ' + p.name); }
        }
        if (h.owner === p.id) pushHome(m, h, now);
      }
    }
  }
  sendTick(m, now);
  if (now - (m.elxSyncAt || 0) >= 1500) {   // owners see their pump and the HUD counter stay current
    m.elxSyncAt = now;
    for (const h of Object.values(m.homes)) { const o = h.ref; if (o && !o.dead && o.ws && o.entered) { if (o.room === h.key) pushHome(m, h, now); else sendElixir(o); } }
  }
  botHomes(m, now);
}
// ---- bots: when one is in his own home he collects a tank of 12 or more, then buys in a fixed order (pump first, then security), keeping a reserve of 8
const botHomeWant = (m, p, now) => { const h = homeAt(m, p.home); if (!h || h.dead) return -1; const t = EX.tick(h.pump, now); return t >= 30 ? 9 : t >= 15 ? 4 : -1; };   // pickDest bonus for the bot's own home
const BOT_BUYS = ['pump', 'alarm', 'pump', 'lock', 'recycler', 'snare', 'lock', 'guard'];
function botHomes(m, now) {
  if (now - (m.elxBotAt || 0) < 1000) return; m.elxBotAt = now;
  for (const p of m.players.values()) {
    if (!p.bot || p.dead || !p.entered) continue; const h = homeAt(m, p.home); if (!h || h.dead || p.room !== h.key) continue;
    if (EX.tick(h.pump, now) >= 12) { const r = EX.collect(h.pump, p.elixir | 0, now, true); p.elixir = r.carried; }
    const need = {}; let want = null; for (const id of BOT_BUYS) { need[id] = (need[id] || 0) + 1; if (HB.level(h, id) < need[id]) { want = id; break; } }
    if (want && (p.elixir | 0) >= HB.nextCost(h, want) + 8) { const r = HB.buy(h, want, p); if (r.ok && want === 'pump') EX.setLevel(h.pump, HB.pumpLevel(h), now); }
  }
}
// ---- death: the carried elixir becomes a flask in the pile, the pump stops, the home dies with its owner (upgrades gone, lock open, box spilled, dark screen)
function elixirDeath(m, p) {   // from die(); returns the extra pile entries
  const out = [], h = homeAt(m, p.home), now = Date.now(); if (!m.homes) return out;
  const r = EX.onDeath(p, h && h.pump, now); if (r.drop) out.push('x:flask:' + Math.min(EX.CARRY_CAP, r.drop.n));
  if (h && !h.dead && h.owner === p.id) {
    const c = WORLD.CHEST[+h.key.slice(1)], spill = HB.dieHome(h); if (spill.length) addDrop(m, { x: c.cx, z: c.cz }, spill);
    bcast(m, { homeDead: h.key });
  }
  return out;
}
function elixirTakeFlask(m, p, dr, di, a) {   // loot(): taking a flask adds its elixir to what you carry (the carry cap leaves the rest in the pile)
  if (a[2] !== 'take') return 'item';
  const key = dr.items[a[1]], r = EX.pickUpFlask(p.elixir | 0, G.flaskN(key)); if (r.got <= 0) return 'space';
  p.elixir = r.carried; sendElixir(p);
  if (r.left > 0) dr.items[a[1]] = 'x:flask:' + r.left; else { dr.items.splice(a[1], 1); if (!dr.items.length) m.drops.splice(di, 1); }
  bcast(m, { drops: m.drops }); m.dirty = true; return null;
}
function elixirOil(p, bribesSoFar) { const r = EX.oilLock(p, bribesSoFar); if (r.ok) sendElixir(p); return r; }   // for the Counting House (vaultbreaker task): one vault bribe paid in 15 elixir; {ok, reason?} (shares the max of 3 with gold bribes)
function elixirDbg(m, p, o) {   // GK_DEBUG test hook: {dbgElixir:{n, tank, lv:{id:level}}} sets carried elixir, the own tank and upgrade levels
  const h = homeAt(m, p.home), now = Date.now(); if (!h || typeof o !== 'object') return;
  if (o.dump) return sendTo(p.ws, { elixirDump: Object.values(m.homes).map(x => ({ name: x.ref.name, bot: !!x.ref.bot, dead: x.dead, lv: x.lv, tank: EX.tick(x.pump, now), elixir: x.ref.elixir | 0, at: x.ref.room })) });
  if (Number.isFinite(o.n)) p.elixir = Math.max(0, Math.min(EX.CARRY_CAP, Math.floor(o.n)));
  if (Number.isFinite(o.tank)) { h.pump.tank = Math.max(0, Math.min(EX.params(h.pump).cap, Math.floor(o.tank))); h.pump.t = now; }
  if (o.lv && typeof o.lv === 'object') { for (const id in o.lv) if (HB.UPGRADES[id]) h.lv[id] = Math.max(0, Math.min(HB.UPGRADES[id].levels.length, o.lv[id] | 0)); EX.setLevel(h.pump, HB.pumpLevel(h), now); if (h.lv.snare) h.snareArmed = true; if (h.lv.sentry) h.ammo = HB.SENTRY.shots; }
  pushHome(m, h, now);
}
// ELIXIR-END

/* MATCH-BEGIN */
const queueInfo = m => ({ n: m.players.size, size: CAP, since: Date.now() - m.formedAt });
function broadcastQueue(m, except) { const msg = JSON.stringify({ queue: queueInfo(m) }); for (const ws of m.players.keys()) if (ws !== except && ws.readyState === 1) ws.send(msg); }
function fillWithBots(m) { fillBots(m); }   // see the BOTS block
function startMatch(m) {   // close the queue match, give everyone their own outer room, tell them to load
  if (m.phase !== 'queue') return;
  m.phase = 'loading'; m.loadAt = Date.now();
  const slots = [0, 1, 2, 3, 4, 5, 6, 7]; for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }   // 5x5: one home per goblin
  let i = 0;
  for (const p of m.players.values()) {
    const sp = spawn(slots[i++ % slots.length]);
    Object.assign(p, { home: sp.home, box: sp.box, yaw: sp.yaw, ready: false }); place(p, sp.x, sp.z);   // place() also resets the netcode speed budget and history
  }
  { const seen = new Set(); for (const p of m.players.values()) { let n = p.name || 'Goblin'; if (seen.has(n.toLowerCase())) { const free = BOT_NAMES.filter(b => !seen.has(b.toLowerCase())); n = free.length ? free[Math.floor(Math.random() * free.length)] : n + ' ' + p.id; } p.name = n; seen.add(n.toLowerCase()); } }   // unique names inside a match
  fillWithBots(m);
  const players = [...m.players.values()].map(pub);
  for (const [ws, p] of m.players) {
    sendTo(ws, { you: p.id, chests: m.chests, chestKeys: m.chestKeys, layout: m.layout, mystery: m.mystery, shops: m.shops, drops: m.drops, ...roundState(m), match: matchInfo(m), players,
      matchStart: { you: p.id, players, layout: m.layout, chests: m.chests, chestKeys: m.chestKeys, mystery: m.mystery, shops: m.shops, spawn: { box: p.box, home: p.home, x: p.x, z: p.z, yaw: p.yaw }, size: players.length, ...(DBG ? { dbg: 1 } : null), ...(m.trees ? { trees: m.trees } : null) } });
    sendTo(ws, { inv: p.inv }); sendGold(p); sendParts(p);
  }
}
function beginCountdown(m) {
  if (m.phase !== 'loading') return;
  m.phase = 'countdown'; m.goAt = Date.now() + COUNT_MS; bcast(m, { countdown: { at: m.goAt, now: Date.now() } });   // now: server clock, so clients can correct for clock skew
}
function matchTick(m, now) {   // returns true when the normal round/combat tick must be skipped for this match (still queueing)
  if (m.phase === 'queue') {
    if (m.players.size >= CAP || (m.players.size >= MIN_START && now - m.formedAt >= QUEUE_MS)) startMatch(m);
    else if (now - (m.qSent || 0) >= 1000) { m.qSent = now; broadcastQueue(m); }
    return m.phase === 'queue';
  }
  if (m.phase === 'loading' && now - m.loadAt >= READY_MS) beginCountdown(m);
  if (m.phase === 'countdown' && now >= m.goAt) {   // GO: everyone is in, round 1 starts now
    m.phase = 'play'; m.started = true; m.endsAt = now + m.dur;
    for (const p of m.players.values()) p.entered = true;
    m.enteredEver = matchInfo(m).size; broadcastMatch(m); sendBoard(m); broadcastRound(m); m.dirty = true;
  }
  return false;
}
/* MATCH-END */
// SOCIAL-BEGIN (reconnect grace and emotes; see docs/reports/social.md)
const GRACE_MS = process.env.GK_DEBUG && +process.env.GK_GRACE_MS > 0 ? +process.env.GK_GRACE_MS : 15000, EMOTE_MS = 1000, EMOTES = 4;   // GK_GRACE_MS only with GK_DEBUG=1 (tests)
const socTokens = new Map();   // token -> player (only players of a started match are ever resumed)
const socToken = p => { p.token = require('crypto').randomBytes(12).toString('hex'); socTokens.set(p.token, p); return p.token; };
function socClose(m, ws, p) {   // socket closed: true when the close was handled here (stale socket, or grace period started); false = leave as usual
  if (p.ws !== ws) return true;   // a resumed player's old socket: nothing to do
  if (p.kicked) return false;   // SECURITY: a kicked player leaves at once, no grace period
  if (p.dead || m.ended || m.phase === 'queue' || !m.players.has(ws)) return false;
  p.dc = Date.now(); p.ready = true; m.dirty = true;   // frozen in the world, still alive for bots and the win rule; a loading match does not wait for him
  A5.dc(m, p);   // ACT5: his channels stop; he does not count on the dais or in a capture zone while away
  return true;
}
function socGrace(m, now) {   // after GRACE_MS without a socket the goblin dies normally (drops, brain)
  for (const [ws, p] of [...m.players]) if (p.dc && now - p.dc >= GRACE_MS && !p.dead) { p.dc = 0; die(ws, p); }
}
function socResume(ws, token) {   // the player of this token, now bound to the new socket, or null
  const p = socTokens.get(token), m = p && p.match;
  if (!p || p.dead || !m || m.ended || m.phase === 'queue' || !m.players.has(p.ws) || matches.get(m.id) !== m) return null;
  const old = p.ws; m.players.delete(old); m.players.set(ws, p); p.ws = ws; p.dc = 0; m.dirty = true;
  place(p, p.x, p.z);   // fresh speed budget: the time offline must not bank movement
  if (old !== ws) { try { old.terminate(); } catch (e) {} }
  return p;
}
function socWelcome(m, ws, p) {   // full resync: the welcome fields of startMatch, then the current round, players, drops, board and countdown
  sendTo(ws, { token: p.token, resumed: 1, ...(DBG ? { dbg: 1 } : null), ...(m.trees ? { trees: m.trees } : null), you: p.id, chests: m.chests, chestKeys: m.chestKeys, layout: m.layout, mystery: m.mystery, shops: m.shops, drops: m.drops, ...roundState(m), match: matchInfo(m), players: [...m.players.values()].map(pub), fix: [p.x, p.z] });
  sendTo(ws, { inv: p.inv }); sendGold(p); sendParts(p); sendTo(ws, { perks: p.perks || [] });   // KNOWLEDGE
  if (m.phase === 'play') sendTo(ws, { board: { left: matchInfo(m).alive, rows: boardRows(m) } });
  if (m.phase === 'countdown') sendTo(ws, { countdown: { at: m.goAt, now: Date.now() } });
  A5.welcome(m, ws, p);   // ACT5: trees, the room's activity state, the crown
}
function socEmote(m, ws, p, n, now) {   // {emote:n}: relayed to everyone else (specs included), at most one per second per player
  if (!Number.isInteger(n) || n < 0 || n >= EMOTES || p.dc || m.phase === 'queue' || now - (p.emoteAt || 0) < EMOTE_MS) return;
  p.emoteAt = now; const msg = JSON.stringify({ emote: { id: p.id, n } });
  for (const w of m.players.keys()) if (w !== ws && w.readyState === 1) w.send(msg);
  for (const w of m.specs.keys()) if (w !== ws && w.readyState === 1) w.send(msg);
}
setInterval(() => { for (const [t, p] of socTokens) if (p.dead || !p.match || !p.match.players.has(p.ws) || matches.get(p.match.id) !== p.match) socTokens.delete(t); }, 60000).unref();   // ROBUST: also forget the tokens of a match that was closed (lifetime, repeated errors)
// SOCIAL-END
// ACT5-BEGIN (the activity rooms: act5.js glue for activity.js, rooms5-trees.js, vb5.js, vault5.js; docs/reports/special-rooms-server.md)
const A5 = require('./act5.js')({ G, DBG, rule, bcast, sendTo, sendInv, sendGold, sendParts, giveItem, recalc, place, die, addDrop, broadcastRound, sendBoard, isOpen, VAULT, eatBrain, srvT, T0, newId: () => nextId++, equip, newBrain, npcFight, stepTo, clampIn });
// ACT5-END
wss.on('connection', (ws, req) => {
  { const ip = ipOf(req); ipCount.set(ip, (ipCount.get(ip) || 0) + 1); ws.once('close', () => { const n = (ipCount.get(ip) || 1) - 1; if (n > 0) ipCount.set(ip, n); else ipCount.delete(ip); }); }   // SECURITY: per-IP socket count
  ws.on('error', () => {});
  let q; try { q = new URL(req.url, 'http://x').searchParams; } catch { q = new URLSearchParams(); }
  let p, m; const tk = q.get('token'), resumed = tk !== null ? socResume(ws, tk) : null;   // SOCIAL: ?token= resumes a player inside the grace period
  if (tk !== null && !resumed) { sendTo(ws, { resumeFail: 1 }); return ws.close(); }
  let goblin = 0;
  if (resumed) { p = resumed; m = p.match; } else {
  // SECURITY-BEGIN: the server owns the goblin type and the victories. ?goblin= and ?wins= are honoured only under GK_DEBUG (tests); a saved character proves itself with a signed ?ctoken=
  const g = q.get('goblin'), wq = q.get('wins'), ct = q.get('ctoken'), tok = ct ? readToken(ct) : null;
  let wins = 0, charId = crypto.randomBytes(6).toString('hex'), tokName = null;
  goblin = rollGoblin();
  if (tok) { goblin = tok.g; wins = tok.w; charId = tok.c; tokName = tok.n; }
  else if (SEC_DEBUG) { if (g !== null && /^\d{1,2}$/.test(g) && +g < GOBLIN_N) goblin = +g; if (wq !== null && /^\d{1,9}$/.test(wq)) wins = Math.min(9999, +wq); }
  const unverified = ct !== null && !tok;   // a saved character came without a valid token: playing as a new goblin
  m = findMatch(wins);
  if (!m) { sendTo(ws, { busy: 1 }); return ws.close(); }
  const id = nextId++, nq = cleanName(tokName != null ? tokName : q.get('name'));
  p = { id, wins, charId, ws, name: nq || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], ...spawn() }; equip(p, goblin); place(p, p.x, p.z);
  p.match = m; m.players.set(ws, p); m.dirty = true; socToken(p); p.unverified = unverified; }
  // SECURITY-END
  ws.on('error', () => {});
  if (resumed) socWelcome(m, ws, p); else { /* MATCH-BEGIN */ sendTo(ws, { queue: queueInfo(m), goblin, wins: p.wins, token: p.token, ...(DBG ? { dbg: 1 } : null), ...(p.unverified ? { unverified: 1 } : null) }); broadcastQueue(m, ws); if (m.players.size >= CAP) startMatch(m); /* MATCH-END */ }
  ws.on('pong', () => { ws.alive = true; }); ws.alive = true;   // SECURITY: heartbeat
  let tokens = 40, last = Date.now(); // rate limit: ~30 msg/s sustained, burst 40
  ws.on('message', (raw, isBinary) => { try { onMessage(raw, isBinary); } catch (e) { console.error('message id=' + p.id, e); } });   // SECURITY: a bug in one handler never takes the process down
  function onMessage(raw, isBinary) {
    const now = Date.now();
    tokens = Math.min(40, tokens + (now - last) * 0.03); last = now;
    if (isBinary || tokens < 1) return;
    tokens--;
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    if (p.dead && d && typeof d.ping === 'number' && Number.isFinite(d.ping)) return sendTo(ws, { pong: d.ping, t: srvT() });
    if (p.dead && d && d.botstat && process.env.GK_DEBUG) return sendTo(ws, { botstat: { n: BS.n, sum: BS.sum, max: BS.max, calls: BS.calls, bad: BS.bad, tick: TS, heap: process.memoryUsage().heapUsed, matches: matches.size, tokens: socTokens.size, ips: ipCount.size } });   // debug stats still answer a dead human (bots can kill the test client)
    if (d && d.bot5 && process.env.GK_DEBUG) { if (typeof d.bot5 === 'object') bot5Lab(m, d.bot5); return sendTo(ws, { bot5: bot5Stat(m) }); }   // BOTS5: per-match bot stats (tests, sim), also for a dead spectator; {bot5:{goal}} lab
    if (p.dead || !d || typeof d !== 'object' || Array.isArray(d)) return;
    const dbg = !!process.env.GK_DEBUG;
    /* MATCH-BEGIN */ if (d.cancel === 1) { if (m.phase === 'queue') { leave(m, ws); ws.close(); } return; }
    if (d.ready === 1) { p.ready = true; if (m.phase === 'loading') { const all = [...m.players.values()]; bcast(m, { readyN: { n: all.filter(q => q.ready).length, size: all.length } }); if (all.every(q => q.ready)) beginCountdown(m); } return; }   // readyN: how many goblins are ready (the loading screen shows it)
    if (!m.goAt || now < m.goAt) { if (d.m || d.atk === 1 || d.claim === 1 || d.bribe === 1 || d.sel !== undefined) return; }   // movement, attacks, claims and door picks are locked until GO
    /* MATCH-END */
    if (Array.isArray(d.m) && (d.m.length === 3 || d.m.length === 4) && d.m.every(v => typeof v === 'number' && Number.isFinite(v))) { applyMove(m, ws, p, d.m[0], d.m[1], d.m[2], now, d.m[3]);
    } else if (typeof d.ping === 'number' && Number.isFinite(d.ping)) { sendTo(ws, { pong: d.ping, t: srvT() });
    } else if (d.emote !== undefined) { socEmote(m, ws, p, d.emote, now);   // SOCIAL
    } else if (d.act !== undefined) { A5.act(m, p, d.act, now);   // ACT5: an activity verb {act:{r,a,v,x?}}
    } else if (typeof d.lat === 'number' && Number.isFinite(d.lat)) { p.lat = Math.max(0, Math.min(1000, d.lat));   // ACT5: smoothed latency for the timing presses
    } else if (dbg && d.actDbg) { A5.debug(m, p, d.actDbg);   // ACT5 test hook
    } else if (d.pump === 1 || d.base !== undefined || d.lockbox !== undefined || d.brew !== undefined) { homeMsg(m, ws, p, d, now);   // ELIXIR
    } else if (dbg && d.dbgElixir) { elixirDbg(m, p, d.dbgElixir);
    } else if (typeof d.recycle === 'string' && homeAt(m, p.room)) { const why = homeRecycle(m, p, d.recycle, d.refine === 1); if (why) sendTo(ws, { recycleFail: why });   // ELIXIR: the home recycler is owner-only and follows its upgrade
    } else if (typeof d.craft === 'string' && homeAt(m, p.room) && !HB.canUseStation(homeAt(m, p.room), p.id)) { sendTo(ws, { craftFail: 'owner' });
    } else if (dbg && d.botstat) { sendTo(ws, { botstat: { n: BS.n, sum: BS.sum, max: BS.max, calls: BS.calls, bad: BS.bad, tick: TS, heap: process.memoryUsage().heapUsed, matches: matches.size, tokens: socTokens.size, ips: ipCount.size } });
    } else if (d.dbgFF === 1) { dbgFF(m, now);   // DEV: skip to 0:10 (ignored without GK_DEBUG)
    } else if (dbg && d.boom === 1) { m.boom = true;   // test hook: this match's tick throws from now on (tests/robust.test.js)
    } else if (dbg && d.quit === 1) { process.exit(0);   // lets tests/tickbench.js flush a --cpu-prof profile
    } else if (dbg && d.kill) { die(ws, p);   // test hooks, only with GK_DEBUG=1
    } else if (dbg && d.win) { win(ws, p);
    } else if (dbg && typeof d.give === 'string') { giveItem(p, d.give);
    } else if (dbg && Array.isArray(d.tp) && d.tp.length === 2 && d.tp.every(v => typeof v === 'number' && Number.isFinite(v))) {
      { const pr = p.room; place(p, clamp(d.tp[0]), clamp(d.tp[1])); noteRoom(m, p, pr); } m.dirty = true;
    } else if (dbg && Number.isFinite(d.hp)) { p.stats.health = Math.max(1, Math.min(p.stats.maxHealth, Math.floor(d.hp))); p.hurtAt = now; m.dirty = true;   // test hook (utility items)
    } else if (dbg && Number.isFinite(d.know)) { p.stats.knowledge = Math.max(0, d.know); m.dirty = true;   // test hook (knowledge.test.js)
    } else if (dbg && d.setParts && typeof d.setParts === 'object') { for (const pt of G.PARTS) if (Number.isFinite(d.setParts[pt.key])) p.parts[pt.key] = Math.max(0, Math.floor(d.setParts[pt.key])); sendParts(p);   // test hook (stations.test.js)
    } else if (dbg && Number.isFinite(d.gold)) { p.gold = Math.max(0, Math.floor(d.gold)); sendGold(p);
    } else if (typeof d.throw === 'string') { throwPlushie(m, p, d.throw, now);   // LOOT
    } else if (typeof d.use === 'string') { const why = useItem(m, p, d.use, now); if (why) sendTo(ws, { useFail: why });   // UTILITY
    } else if (dbg && d.botlab) { botLab(m, ws, p, d.botlab);
    } else if (d.atk === 1) { attack(m, ws, p, now, d.rt);
    } else if (d.bribe === 1) { if (rule('bribe')) { const why = bribe(m, p); if (why) sendTo(ws, { bribeFail: why }); }   // RULES
    } else if (d.enter === 1) { /* legacy: the match start (GO) replaced it */
    } else if (typeof d.eat === 'string') { eat(p, d.eat);
    } else if (Array.isArray(d.loot)) { const why = loot(m, p, d.loot); if (why) sendTo(ws, { lootFail: why });
    } else if (d.craftCancel === 1) { craftCancel(p, 'cancel');
    } else if (typeof d.craft === 'string') {
      const why = craft(m, p, d.craft); if (why) sendTo(ws, { craftFail: why });
    } else if (typeof d.learn === 'string') { const why = learn(m, p, d.learn); if (why) sendTo(ws, { learnFail: why });   // KNOWLEDGE
    } else if (typeof d.reforge === 'string') { const why = reforge(m, p, d.reforge); if (why) sendTo(ws, { reforgeFail: why });
    } else if (typeof d.recycle === 'string') {
      const why = recycle(m, p, d.recycle); if (why) sendTo(ws, { recycleFail: why });
    } else if (d.claim === 1) { const why = claim(m, p); if (why) sendTo(ws, { claimFail: why });
    } else if (Array.isArray(d.buy) && d.buy.length === 2) {
      const why = buy(m, p, d.buy[0], d.buy[1]); if (why) sendTo(ws, { buyFail: why });
    } else if (Array.isArray(d.mv) && d.mv.length === 2) {
      if (move(p, d.mv[0], d.mv[1])) { sendInv(p); m.dirty = true; }
    } else if (typeof d.drop === 'string') {
      if (SLOT_IDS.has(d.drop) && getSlot(p.inv, d.drop) != null) {
        const key = getSlot(p.inv, d.drop); setSlot(p.inv, d.drop, null); recalc(p);
        addDrop(m, p, [key]); sendInv(p); m.dirty = true;
      }
    } else if (Number.isInteger(d.sel) && d.sel >= 0 && d.sel < nDoors && !isHatch(d.sel) && (ROOM_DOORS[p.room] || []).includes(d.sel)) {
      if (m.sealed && m.sealed[p.room]) sendTo(ws, { sealBlock: 1 });   // UTILITY: sealing wax
      else if (m.sel[p.room] !== d.sel) { m.sel[p.room] = d.sel; (m.selBy || (m.selBy = {}))[p.room] = p.id; broadcastRound(m); }
    }
  }
  ws.on('close', () => { try { if (socClose(m, ws, p)) return; m.specs.delete(ws); leave(m, ws); if (!humans(m) && !m.specs.size) matches.delete(m.id); } catch (e) { console.error('close id=' + p.id, e); } });
});

srv.on('error', e => { console.error('listen failed', e); process.exit(1); });   // SECURITY: the uncaughtException handler must not turn a port clash into a silent zombie
srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

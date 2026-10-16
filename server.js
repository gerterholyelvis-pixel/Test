const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const WORLD = require('./world.js'); // shared geometry (rooms, vault, chest rooms), the client uses the same file
// SECURITY-BEGIN (static serving from memory, headers, origin / per-IP / match limits, signed character tokens, speed-hack kicks; see docs/reports/security.md)
const crypto = require('crypto');
const SEC_DEBUG = !!process.env.GK_DEBUG;
const envInt = (k, d) => /^\d+$/.test(process.env[k] || '') && +process.env[k] > 0 ? +process.env[k] : d;
const MAX_PER_IP = envInt('GK_MAX_PER_IP', SEC_DEBUG ? 1000 : 8), MAX_MATCHES = envInt('GK_MAX_MATCHES', 200), MATCH_LIFE_MS = SEC_DEBUG ? envInt('GK_MATCH_LIFE_MS', 20 * 60000) : 20 * 60000;   // tests get a high per-IP default (all clients are 127.0.0.1) unless GK_MAX_PER_IP is set
const ORIGINS = (process.env.GK_ORIGINS || '').split(',').map(s => s.trim().toLowerCase().replace(/\/$/, '')).filter(Boolean);
let SECRET = process.env.GK_SECRET;
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
    if (!o || typeof o.c !== 'string' || !Number.isInteger(o.g) || o.g < 0 || o.g > 4 || !Number.isInteger(o.w) || o.w < 0 || o.w > 9999 || typeof o.n !== 'string') return null;
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
const CLIENT_JS = new Set(['game', 'menu', 'items', 'world', 'save', 'icons', 'audio', 'feel', 'itemart']);
let CSP = '';
function buildCsp() {   // the page has two inline scripts (importmap + module): allowed by hash, so no 'unsafe-inline' for scripts
  const page = cached('/index.html', path.join(ROOT_DIR, 'index.html'), 'text/html; charset=utf-8'), hashes = [];
  if (page) for (const mm of page.body.toString().matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) hashes.push("'sha256-" + crypto.createHash('sha256').update(mm[1].replace(/\r\n?/g, "\n")).digest('base64') + "'");
  CSP = ["default-src 'self'", "script-src 'self' " + hashes.join(' '), "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", "font-src 'self' https://fonts.gstatic.com", "img-src 'self' data: blob:", "media-src 'self' blob: data:", "connect-src 'self' ws: wss:", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'"].join('; ');
}
function staticFor(url) {   // -> { body, type, cc } or null (404)
  const p = url.split('?')[0].split('#')[0];
  if (p === '/' || p === '/index.html') { const e = cached('/index.html', path.join(ROOT_DIR, 'index.html'), 'text/html; charset=utf-8'); return e && { ...e, cc: 'no-cache' }; }
  const mm = p.match(/^\/([a-z]+)\.js$/);
  if (mm && CLIENT_JS.has(mm[1])) { const e = cached(p, path.join(ROOT_DIR, mm[1] + '.js'), 'text/javascript; charset=utf-8'); return e && { ...e, cc: 'no-cache' }; }
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
// SECURITY-END
const wss = new WebSocketServer({ server: srv, maxPayload: 512, verifyClient }); // oversize frames close the socket
const LIM = WORLD.LIM + 1; // world half-extent: the room grid plus the 8 m chest rooms around it (+1 m slack)
const clamp = v => Math.max(-LIM, Math.min(LIM, v));
// ---- doors and rounds (door ids and room keys must match game.js) ----
const chestKey = WORLD.chestKey; // chest rooms in game.js order (WORLD.CHEST)
const ROOM_DOORS = {}; let nDoors = 0; // room key ('0'..'8' grid, 'c0'..'c11' chest) -> door ids on its walls
const DOOR_AT = {}; // 'a|b' and 'b|a' -> { id, axis, c, hw }: where the doorway sits on the wall between two rooms (axis = coordinate along the wall, c = its centre, hw = half opening + slack)
const addDoor = (a, b, axis, c) => { const id = nDoors++; (ROOM_DOORS[a] = ROOM_DOORS[a] || []).push(id); (ROOM_DOORS[b] = ROOM_DOORS[b] || []).push(id); DOOR_AT[a + '|' + b] = DOOR_AT[b + '|' + a] = { id, axis, c, hw: (a === '4' || b === '4' ? 4.9 : 4) / 2 + 0.2 }; }; // opening widths = VW / DW in game.js
for (let i = 0; i < 9; i++) {
  const col = i % 3, row = Math.floor(i / 3), [rx, rz] = WORLD.rc(i); // every door is centred on its wall segment
  addDoor(String(i), col < 2 ? String(i + 1) : chestKey(i, 'E'), 'z', rz);
  addDoor(String(i), row < 2 ? String(i + 3) : chestKey(i, 'S'), 'x', rx);
  if (col === 0) addDoor(String(i), chestKey(i, 'W'), 'z', rz);
  if (row === 0) addDoor(String(i), chestKey(i, 'N'), 'x', rx);
}
const roomKeyOf = WORLD.roomKeyOf, boxOf = WORLD.roomAt;
// ---- matches: independent games, players are queued with similar victory counts ----
// MATCH-BEGIN (matchmaking: players wait in a queue match (phase 'queue'); it closes at CAP players, or after QUEUE_MS with >= 2; then everyone loads in together. See docs/reports/matchmaking.md)
const DBG = !!process.env.GK_DEBUG;
// RULES-BEGIN (experimental rule toggles, all OFF unless the server is started with GK_RULES=crown,doorclose,staffbolt,bribe; see docs/reports/rules-experimental.md)
const RULE_NAMES = ['crown', 'doorclose', 'staffbolt', 'bribe'];
const RULES = new Set((process.env.GK_RULES || '').split(',').map(s => s.trim().toLowerCase()).filter(s => RULE_NAMES.includes(s)));
const rule = n => RULES.has(n);
const CROWN_MS = DBG && +process.env.GK_CROWN_MS > 0 ? +process.env.GK_CROWN_MS : 20000, DAIS_R = 2.2;   // stand on the vault dais this long, unhurt, to be crowned (GK_CROWN_MS only with GK_DEBUG=1)
const DOOR_LIFE = 2, KLAXON_MS = 5000;   // doorclose: a door stays open this many rounds; the warning comes this long before the round ends
const BOLT = { dmg: 6, range: 12, speed: 10, cd: 1200, radius: 0.6 };   // staffbolt
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
  const R1 = process.env.GK_DEBUG && +process.env.GK_ROUND_MS > 0 ? +process.env.GK_ROUND_MS : 30000; // GK_DEBUG only: shorter round 1 so the tests run fast
  const m = { id: nextMatch++, players: new Map(), round: 1, dur: R1, endsAt: Date.now() + R1, started: false, phase: 'queue', formedAt: Date.now(), goAt: 0, sel: {}, selBy: {}, lastSel: {}, open: [], drops: [], nextDrop: 1, dirty: false, lastRound: 0, specs: new Map(), dead: [], npcSpawned: new Set(),
    chests: Array.from({ length: 12 }, () => Math.floor(Math.random() * 6)), chestKeys: Array.from({ length: 12 }, () => GKITEMS.randomWeaponKey()), layout: GKITEMS.randomLayout() };
  m.shops = m.layout.map(x => x === 'merchant' ? GKITEMS.randomShop() : null);   // each merchant's 5 items with gold prices, rolled once per match
  m.mystery = m.layout.map(x => x === 'mystery' ? GKITEMS.randomMystery() : null);   // what is inside each mystery room, rolled once per match // weapon index per chest room
  lootInit(m);   // LOOT: vault relic, shop base prices, lures
  matches.set(m.id, m); return m;
}
const VAULT = ROOM_DOORS['4'] || []; // the 4 doors touching the middle vault room
const vaultVotes = m => { const rooms = Object.keys(m.sel).filter(k => VAULT.includes(m.sel[k])); return rule('bribe') ? rooms.reduce((n, k) => n + 1 + ((m.bribes && m.bribes[k]) || 0), 0) : rooms.length; }; // distinct rooms selecting a vault door (bribe rule: each room weighs 1 + its bribes)
const roundState = m => ({ round: { n: m.round, left: Math.max(0, m.endsAt - Date.now()), dur: m.dur }, sel: m.sel, selBy: m.selBy || {}, lastSel: m.lastSel || {}, open: m.open, vaultVotes: vaultVotes(m), fizzled: m.fizzled || [], relic: m.relicKey && !m.relicTaken ? m.relicKey : null, ...(m.sudden ? { sudden: 1 } : null), ...ruleState(m) });
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
  m.dirty = true;
  if (gone && m.sel[gone.room] != null && ![...m.players.values()].some(q => q.room === gone.room)) { delete m.sel[gone.room]; if (m.selBy) delete m.selBy[gone.room]; broadcastRound(m); } // an empty room's door vote no longer counts
  if (!humans(m) && (m.ended || !m.specs.size || m.phase === 'queue')) matches.delete(m.id);   // FUN: spectators keep a match with only bots alive until it is decided
  else if (m.phase === 'queue') broadcastQueue(m); else { broadcastMatch(m); sendBoard(m); checkWin(m); }
}
setInterval(() => { // one global timer steps every match
  const now = Date.now();
  for (const m of matches.values()) {
    /* MATCH-BEGIN */ if (matchTick(m, now)) continue; /* MATCH-END */
    if (now - m.formedAt > MATCH_LIFE_MS) {   // SECURITY: hard match lifetime (20 min): decided by the round-10 rule; a match that is still open a minute later is closed
      if (!m.ended && m.started) timeLimit(m);
      else if (now - m.formedAt > MATCH_LIFE_MS + 60000) { for (const w of [...m.players.keys(), ...m.specs.keys()]) try { w.close(); } catch (e) {} matches.delete(m.id); continue; }
    }
    socGrace(m, now);   // SOCIAL: disconnected players whose grace period ran out die now
    botTick(m, now);   // BOTS: brains of bots and mystery enemies (~10 Hz)
    ruleTick(m, now);   // RULES: experimental rules (no-op unless GK_RULES is set)
    if (!m.started) m.endsAt = now + m.dur;   // round 1 waits until someone has left the wheel and entered the rooms
    if (now >= m.endsAt) {
      const picked = [...new Set(Object.values(m.sel))], ok = vaultVotes(m) >= 2; // vault doors need 2 different rooms
      const fresh = picked.filter(d => ok || !VAULT.includes(d)); m.open = ruleOpen(m, fresh); m.fizzled = ok ? [] : picked.filter(d => VAULT.includes(d)); m.lastSel = { ...m.sel }; m.sel = {}; m.selBy = {}; m.bribes = {}; m.round++; m.dur = NEXT_MS; m.endsAt = now + m.dur; suddenCheck(m); lootRound(m); broadcastRound(m); m.lastRound = now; }
    else if (now - m.lastRound >= 1000) { m.lastRound = now; broadcastRound(m); }
    // COMBAT-BEGIN regen: 1 HP every 4 s once a player has not been hit for 6 s
    for (const p of m.players.values()) if (!m.sudden && p.entered && !p.dead && p.stats && p.stats.health < p.stats.maxHealth && now - (p.hurtAt || 0) >= C.regenIdle * RSCALE && now - (p.regenAt || 0) >= C.regenEvery * RSCALE) { p.regenAt = now; p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + C.regenAmt); m.dirty = true; }
    // COMBAT-END
    if (m.dirty) { m.dirty = false; bcast(m, { players: [...m.players.values()].map(pub) }); } // slow state: only when something other than movement changed
    snapshots(m); // NETCODE: positions of players who moved go out at 20 Hz as compact snapshots
  }
  botSweepEnd();
}, 50);

// 0 small 30%, 1 medium 30%, 2 big 30%, 3 wizard 9%, 4 king 1%
// Equipment decides combat stats: attack damage comes from the weapon (items.js), health from the armour.
const G = require('./items.js'), ITEMS = G.ITEMS, C = G.COMBAT;
const info = k => (typeof k === 'string' && k.length < 40 && G.info(k)) || null; // any item key incl. goblin brains
const isItem = k => !!info(k);
const SLOT_IDS = new Set([...Array.from({ length: 9 }, (_, i) => 'b' + i), ...Array.from({ length: 3 }, (_, i) => 'q' + i), 'weapon', 'armor']);
const getSlot = (inv, id) => id === 'weapon' ? inv.weapon : id === 'armor' ? inv.armor : (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)];
const setSlot = (inv, id, v) => { if (id === 'weapon') inv.weapon = v; else if (id === 'armor') inv.armor = v; else (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)] = v; };
const fits = (id, key) => key == null || (id === 'weapon' ? info(key).type === 'weapon' : id === 'armor' ? info(key).type === 'armor' : true);
const allItems = inv => [inv.weapon, inv.armor, ...inv.backpack, ...inv.quick].filter(Boolean);
function recalc(p) { // derived stats from the equipped items
  const w = p.inv.weapon && info(p.inv.weapon), a = p.inv.armor && info(p.inv.armor);
  const maxHealth = a ? a.health : 10;
  p.stats = { knowledge: p.stats ? p.stats.knowledge : G.KNOWLEDGE[p.goblin], attack: w ? w.attack : 0, health: Math.min(p.stats ? p.stats.health : maxHealth, maxHealth), maxHealth };
  p.gear = { weapon: w ? w.name : 'None', armor: a ? a.name : 'None' };
}
function equip(p, goblin) { // give a player a goblin type with its starting gear and otherwise empty inventory
  const s = G.START[goblin];
  p.goblin = goblin; p.inv = { backpack: Array(G.SLOTS.backpack).fill(null), quick: Array(G.SLOTS.quick).fill(null), weapon: s.weapon, armor: s.armor };
  p.stats = null; recalc(p); p.gold = G.START_GOLD; p.parts = {}; for (const pt of G.PARTS) p.parts[pt.key] = 0;
}
const sendGold = p => { if (p.ws) sendTo(p.ws, { gold: p.gold }); };
const sendParts = p => { if (p.ws) sendTo(p.ws, { parts: p.parts }); };
function hasStation(m, p, st) { // merchant rooms have all stations, mystery 'stations' rooms list theirs
  const mm = /^c(\d+)$/.exec(p.room || ''), id = mm ? +mm[1] : -1;
  const L = id >= 0 ? m.layout[id] : null, my = id >= 0 ? m.mystery[id] : null;
  return L === 'merchant' || (L === 'mystery' && !!my && my.kind === 'stations' && Array.isArray(my.stations) && my.stations.includes(st));
}
function craft(m, p, rid) { // {craft: recipeId}; returns null or a failure reason
  if (!hasStation(m, p, 'workbench')) return 'room';
  const r = typeof rid === 'string' && G.RECIPES.find(x => x.id === rid);
  if (!r) return 'recipe';
  if (p.stats.knowledge < (r.needs || 0)) return 'knowledge';
  for (const k in r.cost) if ((p.parts[k] || 0) < r.cost[k]) return 'parts';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  for (const k in r.cost) p.parts[k] -= r.cost[k];
  giveItem(p, r.out); sendParts(p); sendTo(p.ws, { crafted: { key: r.out, recipe: r.id } });
  return null;
}
function recycle(m, p, slot) { // returns null on success or a failure reason
  if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return 'item';
  if (!hasStation(m, p, 'recycler')) return 'room';
  const key = getSlot(p.inv, slot), y = key && G.recycleYield(key);
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
  if (p.gold < it.price) return 'gold';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  giveItem(p, it.key); p.gold -= it.price; it.sold = true;
  sendGold(p); bcast(m, { shops: m.shops });
  return null;
}
function claim(m, p) { // E in a chest room or a weapon/armour/gold mystery room: each player takes its contents once
  if (p.room === '4') return relicClaim(m, p);   // LOOT: the vault relic
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
  if (gold) { p.gold += gold; sendGold(p); }
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
const pub = p => ({ ...(p.bot ? { bot: 1, name: p.name } : p.npc ? { npc: p.npc, name: p.name } : { name: p.name }), kills: p.kills || 0, brains: p.brains || 0, ...(p.dc ? { dc: 1 } : null), id: p.id, goblin: p.goblin, wins: p.wins, box: p.box, room: p.room, x: p.x, z: p.z, yaw: p.yaw, stats: p.stats, gear: p.gear }); // never includes the inventory
function addDrop(m, p, items) {
  if (!items.length) return;
  m.drops.push({ id: m.nextDrop++, x: +p.x.toFixed(2), z: +p.z.toFixed(2), items }); if (m.drops.length > 60) m.drops.shift();
  bcast(m, { drops: m.drops });
}
function rollGoblin() {
  const r = Math.random() * 100;
  return r < 30 ? 0 : r < 60 ? 1 : r < 90 ? 2 : r < 99 ? 3 : 4;
}
function spawn() {
  const box = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(Math.random() * 8)]; // never the vault (4)
  const [cx, cz] = WORLD.rc(box), [x, z] = WORLD.randomPoint(box);
  return { box, x, z, yaw: Math.atan2(-(cx - x), -(cz - z)) }; // facing the room centre
}
function die(ws, p) { // a dead player drops everything where they fell and leaves the match
  const m = p.match; if (p.dead || !m) return;
  if (p.npc) return dieNpc(m, p);
  const items = allItems(p.inv), brain = G.brainKey(p.stats.knowledge); // the brain carries the victim's CURRENT knowledge
  m.deaths = (m.deaths || 0) + 1; p.dead = true; p.diedAt = Date.now(); m.dead.push(p);
  if (ws && ws.readyState === 1) m.specs.set(ws, p);   // FUN: a dead human stays subscribed as a spectator (snapshots, hits, feed) until the socket closes
  addDrop(m, p, [...items, brain]);
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
  const w = places[0] || null, msg = JSON.stringify({ matchEnd: { ...(m.timeLimit ? { timeLimit: 1 } : null), ...(m.crownWin ? { crown: 1 } : null), winner: w && { id: w.id, name: w.name, goblin: w.goblin, bot: w.bot, kills: w.kills }, top, longest: run, places, size: places.length } });
  bcast(m, msg);
  if (!m.specs.size && !humans(m)) matches.delete(m.id);
}
// FUN-END
// SUDDEN-BEGIN (match time limit, DEFAULT awaiting the owner's decision, see docs/FEATURES.md): after round SUDDEN_ROUND every door is open and regeneration stops; if nobody has won after round MAX_ROUND the goblin with the most kills wins, then the most HP
const SUDDEN_ROUND = DBG && +process.env.GK_SUDDEN_ROUND > 0 ? +process.env.GK_SUDDEN_ROUND : 8, MAX_ROUND = DBG && +process.env.GK_MAX_ROUND > 0 ? +process.env.GK_MAX_ROUND : 10;
const NEXT_MS = DBG && +process.env.GK_NEXT_ROUND_MS > 0 ? +process.env.GK_NEXT_ROUND_MS : 45000;   // length of rounds 2 and up (GK_DEBUG only override)
function suddenCheck(m) {   // right after m.round++ (the round that just ended is m.round - 1)
  if (m.ended) return;
  if (m.round > SUDDEN_ROUND) { m.sudden = true; m.open = Array.from({ length: nDoors }, (_, i) => i); m.openLeft = {}; m.fizzled = []; }
  if (m.round > MAX_ROUND) timeLimit(m);
}
function timeLimit(m) {
  const live = [...m.players.entries()].filter(([, q]) => !q.npc && q.entered && !q.dead);
  live.sort((a, b) => (b[1].kills || 0) - (a[1].kills || 0) || ((b[1].stats && b[1].stats.health) || 0) - ((a[1].stats && a[1].stats.health) || 0) || a[1].id - b[1].id);
  m.timeLimit = true; const best = live[0];
  if (best && isHum(best[1])) win(best[0], best[1]); else endMatch(m, best ? best[1] : null);   // a bot can win too
  for (const [ws, q] of live.slice(1)) if (isHum(q)) die(ws, q);   // the beaten humans become spectators (checkWin ignores a decided match)
}
// SUDDEN-END

// COMBAT-BEGIN (server-authoritative melee/ranged attacks, kills and the DEFAULT win rule: last goblin standing; see docs/FEATURES.md)
function checkWin(m) {   // DEFAULT RULE (owner has not decided): >= 2 players entered the rooms, at least one died, exactly one living entered player is left -> that player wins
  if (m.ended || !m.deaths || (m.enteredEver || 0) < 2) return;
  const living = [...m.players.entries()].filter(([, q]) => !q.npc && q.entered && !q.dead);
  if (living.length === 1 && isHum(living[0][1])) win(living[0][0], living[0][1]);   // a bot standing last wins nothing (the match is dropped when no human is left)
  else if (!humans(m) && living.length <= 1 && m.specs.size) endMatch(m, null);   // FUN: only spectators are left: the last bot decides the match
}
function attack(m, ws, p, now, rt) {   // {atk:1, rt}: rate limit by weapon, nearest valid target in range, in the 70 degree cone, same room key; targets are rewound to server time rt (what the attacker saw), at most 200 ms
  if (!p.entered || p.dead) return;
  let cb = G.combat(p.inv.weapon); if (p.npc) cb = { ...cb, dmg: p.npcDmg, cd: p.npcCd };
  const bolt = boltWeapon(p); if (bolt) cb = { ...cb, cd: BOLT.cd };   // staffbolt: staves and scepters throw a slow bolt instead of a melee bonk   // mystery enemies have their own damage and cooldown
  if (now - (p.atkAt || 0) < cb.cd * 0.9) return;   // 10% jitter allowance
  p.atkAt = now; bcast(m, { swing: p.id });
  if (bolt) return fireBolt(m, p, now);
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), reach = cb.range + C.slack;   // forward vector, same as the client's movement
  let best = null, bd = Infinity;
  const T = srvT(), at = typeof rt === 'number' && Number.isFinite(rt) ? Math.max(T - REWIND_MAX, Math.min(T, rt)) : T;   // lag compensation: look at the world as the attacker saw it
  for (const [tws, t] of m.players) {
    if (t === p || t.dead || !t.entered) continue;
    const [tx, tz] = at < T ? posAt(t, at) : [t.x, t.z]; if (roomKeyOf(tx, tz) !== p.room) continue;
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > reach) continue;
    if (d > 0.05 && (dx * fx + dz * fz) / d < Math.cos(C.cone)) continue;
    if (d < bd) { bd = d; best = [tws, t]; }
  }
  if (!best) return;
  const [tws, t] = best; hitTarget(m, ws, p, tws, t, cb.dmg, now);
}
// COMBAT-END
// RULES-LOGIC-BEGIN (the four experimental rules; every function is a no-op unless its rule is on)
const ruleState = m => RULES.size ? { rules: [...RULES], ...(rule('bribe') ? { bribes: m.bribes || {} } : null), ...(rule('doorclose') ? { openLeft: Object.fromEntries((m.open || []).filter(d => m.openLeft && m.openLeft[d]).map(d => [d, m.openLeft[d]])) } : null) } : null;
function ruleOpen(m, fresh) {   // doorclose: the doors stay open for DOOR_LIFE rounds (m.openLeft counts the rounds still to go), a door picked again is refreshed
  if (!rule('doorclose')) return fresh;
  const left = m.openLeft || {}, next = {}, keep = [];
  for (const d of m.open || []) if ((left[d] || 1) - 1 > 0) { next[d] = left[d] - 1; keep.push(d); }
  for (const d of fresh) { next[d] = DOOR_LIFE; if (!keep.includes(d)) keep.push(d); }
  m.openLeft = next; return keep;
}
function hitTarget(m, ws, p, tws, t, dmg, now) {   // damage, hit broadcast, kill bookkeeping (melee and bolts share it)
  const hp = Math.max(0, t.stats.health - dmg);
  t.stats.health = hp; t.hurtAt = now; m.dirty = true;
  bcast(m, { hit: { from: p.id, to: t.id, dmg, hp, max: t.stats.maxHealth, dead: hp <= 0 } });
  if (hp <= 0) { p.kills = (p.kills || 0) + 1; t.killedBy = p.id; { const kw = p.npc ? null : p.inv && p.inv.weapon && G.ITEMS[p.inv.weapon]; t.killer = { name: p.name || 'Goblin', npc: !!p.npc, w: kw ? kw.name : (p.npc ? '' : 'Fists') }; } sendTo(ws, { kills: p.kills }); sendFeed(m, p, t); die(tws, t); }
}
function boltWeapon(p) { if (!rule('staffbolt')) return false; const w = p.inv && p.inv.weapon && G.ITEMS[p.inv.weapon]; return !!w && (w.family === 'staff' || w.family === 'scepter'); }
function fireBolt(m, p, now) {   // staffbolt: a slow projectile straight ahead, 12 m range, never leaves the room it was fired in
  m.bolts = m.bolts || []; m.boltN = (m.boltN || 0) + 1;
  const b = { id: m.boltN, by: p, x: p.x, z: p.z, vx: -Math.sin(p.yaw) * BOLT.speed, vz: -Math.cos(p.yaw) * BOLT.speed, dist: 0, room: p.room, t: now };
  m.bolts.push(b); bcast(m, { bolt: { id: b.id, by: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), vx: +b.vx.toFixed(2), vz: +b.vz.toFixed(2), range: BOLT.range } });
}
function boltTick(m, now) {
  if (!m.bolts || !m.bolts.length) return;
  const dt = Math.min(0.1, (now - (m.boltAt || now)) / 1000); m.boltAt = now;
  m.bolts = m.bolts.filter(b => {
    b.x += b.vx * dt; b.z += b.vz * dt; b.dist += BOLT.speed * dt;
    let hit = null;
    for (const [tws, t] of m.players) { if (t === b.by || t.dead || !t.entered || t.room !== b.room) continue; if (Math.hypot(t.x - b.x, t.z - b.z) < BOLT.radius) { hit = [tws, t]; break; } }
    if (hit) { hitTarget(m, b.by.ws, b.by, hit[0], hit[1], BOLT.dmg, now); bcast(m, { boltEnd: { id: b.id, hit: 1 } }); return false; }
    if (b.dist >= BOLT.range || roomKeyOf(b.x, b.z) !== b.room) { bcast(m, { boltEnd: { id: b.id } }); return false; }
    return true;
  });
}
function bribe(m, p) {   // bribe: pay gold at your room's panel for +1 weight on its pick this round (counts for the vault's 2-vote rule); returns a failure reason or null
  if (!/^[0-8]$/.test(p.room || '') || m.phase !== 'play') return 'room';
  if (m.sel[p.room] == null) return 'pick';
  m.bribes = m.bribes || {};
  if ((m.bribes[p.room] || 0) >= BRIBE.max) return 'max';
  if (p.gold < BRIBE.cost) return 'gold';
  p.gold -= BRIBE.cost; m.bribes[p.room] = (m.bribes[p.room] || 0) + 1; sendGold(p); broadcastRound(m);
  return null;
}
function crownTick(m, now) {   // crown: stand on the vault dais for CROWN_MS without being hurt and you win the match
  let lead = null;
  for (const [ws, p] of m.players) {
    if (p.npc || p.dead || !p.entered) continue;
    const on = p.room === '4' && Math.hypot(p.x, p.z) < DAIS_R;
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
  const gain = G.brainGain(key);
  p.stats.knowledge = Math.round((p.stats.knowledge + gain) * 100) / 100; p.brains = (p.brains || 0) + 1;
  sendTo(p.ws, { ate: { gain, knowledge: p.stats.knowledge } }); p.match.dirty = true;
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
  const key = dr.items[a[1]];
  if (key == null || (a.length === 4 && a[3] !== key)) return 'item';
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
const MAXV = 7.5 * (0.85 + 0.15 * 1.3) * 1.1, BUDGET = 1.0, SLACK = 0.3, MOVE_SLACK = 0.3;   // fastest goblin sprint (game.js) x 1.1; the distance a client may bank while idle; SLACK: bounds tolerance in m; MOVE_SLACK: extra distance per move (SECURITY: was 1.25 / 1.2 / 0.3 per move)
const HIST_MS = 1000, REWIND_MAX = 200;
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
function inBounds(x, z) {   // inside a room of the grid, or inside one of the 12 chest rooms (not the void around them)
  if (Math.abs(x) > LIM || Math.abs(z) > LIM) return false;
  if (Math.abs(x) <= WORLD.HALF && Math.abs(z) <= WORLD.HALF) return true;
  const c = WORLD.CHEST[+roomKeyOf(x, z).slice(1)];
  return !!c && Math.abs(x - c.cx) <= WORLD.CS / 2 + SLACK && Math.abs(z - c.cz) <= WORLD.CS / 2 + SLACK;
}
function pathOk(m, x0, z0, x1, z1) {   // walk the segment in 0.2 m steps: every room change must go through an OPEN door, inside its opening
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.2)); let prev = roomKeyOf(x0, z0);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
    if (!inBounds(x, z)) return false;
    const k = roomKeyOf(x, z); if (k === prev) continue;
    const d = DOOR_AT[prev + '|' + k];
    if (!d || !m.open.includes(d.id) || Math.abs((d.axis === 'x' ? x : z) - d.c) > d.hw) return false;
    prev = k;
  }
  return true;
}
function place(p, x, z) {   // hard set (spawn, debug teleport): resets speed budget and history
  p.x = x; p.z = z; p.box = boxOf(x, z); p.room = roomKeyOf(x, z); p.spd = 0; p.fixAt = 0; p.budget = BUDGET; p.mvAt = Date.now(); p.mvT = srvT(); p.hist = [[p.mvT, x, z]]; p.sd = true;
}
function applyMove(m, ws, p, x, z, yaw, now, jy) {   // {m:[x,z,yaw]}: accept, or keep the old position and answer {fix:[x,z]}
  x = clamp(x); z = clamp(z); yaw = Math.max(-1e3, Math.min(1e3, yaw));
  const dt = p.mvAt ? Math.min(0.5, (now - p.mvAt) / 1000) : 0.066; p.mvAt = now; const prevRoom = p.room;
  p.budget = Math.min(BUDGET, (p.budget == null ? BUDGET : p.budget) + dt * MAXV);
  const dist = Math.hypot(x - p.x, z - p.z);
  if (dist > 0.0005 && (dist > p.budget + MOVE_SLACK || !pathOk(m, p.x, p.z, x, z))) {
    if (now - (p.fixAt || 0) > 150) { p.fixAt = now; sendTo(ws, { fix: [r2(p.x), r2(p.z)] }); if (secFix(p, ws, now)) return false; }
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
  p.x = x; p.z = z; p.yaw = yaw; p.spd = spd; p.mvT = t; p.box = boxOf(x, z); p.room = roomKeyOf(x, z); noteRoom(m, p, prevRoom);
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
  const t = srvT();
  for (const [ws, q] of m.players) {
    if (q.bot || q.npc) continue;
    const out = [t]; for (const p of moved) if (p !== q) out.push(p.id, r2(p.x), r2(p.z), r3(p.yaw), jumpV(p), Math.min(255, Math.max(0, t - (p.mvT || t))));
    if (out.length > 1) sendTo(ws, { s: out });
  }
  const all = [t]; for (const p of moved) all.push(p.id, r2(p.x), r2(p.z), r3(p.yaw), jumpV(p), Math.min(255, Math.max(0, t - (p.mvT || t))));   // FUN: spectators get every mover
  if (all.length > 1) for (const ws of m.specs.keys()) sendTo(ws, { s: all });
}
// NET-END

// BOTS-BEGIN (server bots that fill the match to 8 + hostile mystery-room enemies; see docs/reports/bots.md)
// Bots are normal player records (bot:true, ws:null) kept in m.players under a stub key whose readyState is 0, so sendTo/bcast skip them. They move ONLY through applyMove(), so walls, doors and the speed budget apply to them like to humans.
const BOT_GRACE = DBG && process.env.GK_BOT_GRACE_MS !== undefined && +process.env.GK_BOT_GRACE_MS >= 0 ? +process.env.GK_BOT_GRACE_MS : 20000;   // no bot attacks in round 1 or in this long after GO (GK_DEBUG only override)
const BOT_NAMES = ['Snikt', 'Grubb', 'Mozzle', 'Skritch', 'Nobb', 'Gribble', 'Zug', 'Pogg', 'Snaga', 'Murk', 'Blit', 'Krag', 'Fizzle', 'Drog', 'Wort', 'Skab', 'Yibb', 'Glorp', 'Narg', 'Tikk'];
const RB = {};   // room key -> bounds { cx, cz, hw, hd }
for (let i = 0; i < 9; i++) { const [cx, cz] = WORLD.rc(i); RB[i] = { cx, cz, hw: WORLD.roomW(i) / 2, hd: WORLD.roomD(i) / 2 }; }
for (const c of WORLD.CHEST) RB['c' + c.id] = { cx: c.cx, cz: c.cz, hw: WORLD.CS / 2, hd: WORLD.CS / 2 };
const ADJ = {};   // room key -> edges { to, door, w1, w2 }: w1 is a point inside this room in front of the doorway, w2 a point inside the next room behind it
for (const k of Object.keys(DOOR_AT)) {
  const [a, b] = k.split('|'), d = DOOR_AT[k], A = RB[a], B = RB[b];
  const e = d.axis === 'z' ? (s => ({ w1: [A.cx + s * A.hw - s * 1.5, d.c], w2: [A.cx + s * A.hw + s * 1.5, d.c] }))(Math.sign(B.cx - A.cx))
                           : (s => ({ w1: [d.c, A.cz + s * A.hd - s * 1.5], w2: [d.c, A.cz + s * A.hd + s * 1.5] }))(Math.sign(B.cz - A.cz));
  (ADJ[a] = ADJ[a] || []).push({ to: b, door: d.id, ...e });
}
const DIST_V = (() => { const dist = { 4: 0 }, q = ['4']; for (let h = 0; h < q.length; h++) for (const e of ADJ[q[h]] || []) if (dist[e.to] === undefined) { dist[e.to] = dist[q[h]] + 1; q.push(e.to); } return dist; })();   // hops to the vault, all doors
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
    if (prev[e.to] !== undefined || !m.open.includes(e.door)) continue;
    prev[e.to] = { u: q[h], e };
    if (e.to === to) { const path = []; for (let k = to; prev[k]; k = prev[k].u) path.push(prev[k].e); return path.reverse(); }
    q.push(e.to);
  }
  return null;
}
function reach(m, from) {   // hops to every room reachable through open doors
  const dist = { [from]: 0 }, q = [from];
  for (let h = 0; h < q.length; h++) for (const e of ADJ[q[h]] || []) if (dist[e.to] === undefined && m.open.includes(e.door)) { dist[e.to] = dist[q[h]] + 1; q.push(e.to); }
  return dist;
}
function routeTo(m, p, key, pt) {   // set p.brain.route: waypoints through the open doors to a point in room `key`; false when unreachable
  const path = bfsPath(m, p.room, key); if (!path) return false;
  const r = []; for (const e of path) r.push(e.w1, e.w2);
  r.push(pt || pointIn(key, 1.5)); p.brain.route = r; p.brain.cross = path.length > 0; return true;
}
const betterW = (cur, key) => key && info(key) && info(key).type === 'weapon' && info(key).attack > (cur ? info(cur).attack : -1);
const betterA = (cur, key) => key && info(key) && info(key).type === 'armor' && info(key).health > (cur ? info(cur).health : 0);
function equipBest(m, p) {   // put the best weapon/armour from the backpack on (the same inventory rules as the players: move())
  for (let i = 0; i < p.inv.backpack.length; i++) {
    const k = p.inv.backpack[i];
    if (betterW(p.inv.weapon, k)) move(p, 'b' + i, 'weapon'); else if (betterA(p.inv.armor, k)) move(p, 'b' + i, 'armor');
  }
  m.dirty = true;
}
function fillBots(m) {   // up to CAP goblins: bots get the normal goblin odds, START gear, a goblin name and an outer room of their own
  const used = new Set([...m.players.values()].map(p => p.box)), free = [0, 1, 2, 3, 5, 6, 7, 8].filter(b => !used.has(b));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }
  const taken = new Set([...m.players.values()].map(p => (p.name || '').toLowerCase())), names = BOT_NAMES.filter(b => !taken.has(b.toLowerCase())).sort(() => Math.random() - 0.5); let w = 0, n = 0; for (const p of m.players.values()) { w += p.wins; n++; }
  while (m.players.size < CAP && free.length) {
    const box = free.pop(), [cx, cz] = WORLD.rc(box), [x, z] = WORLD.randomPoint(box), key = { readyState: 0, bot: true };
    const p = { id: nextId++, wins: n ? Math.round(w / n) : 0, ws: null, key, bot: true, name: names.pop() || 'Grub' + nextId, match: m, box, yaw: Math.atan2(-(cx - x), -(cz - z)), ready: true };
    equip(p, rollGoblin()); place(p, x, z); p.brain = newBrain(p, 3.6 + Math.random() * 1.0); m.players.set(key, p);
  }
  m.dirty = true;
}
function newBrain(p, speed) { return { speed, route: [], cross: false, last: Date.now(), reactAt: 0, pauseUntil: 0, idleUntil: 0, tgt: null, seen: { [p.room]: 1 }, done: {}, skip: new Set(), seenRound: 0, votedRound: 0, voteAt: 0, mode: '', stuck: 0 }; }

// ---- mystery enemies: hostile NPCs in their mystery room, spawned at GO. They are in m.players with npc:kind but never count for "goblins left", the win or the match size.
const NPC = {   // hp, dmg (per hit), cd ms, speed m/s, reaction ms [lo, hi], weapon, loot: [number of items, min tier 0-5], look = goblin model index for the client
  troll:   { hp: 160, dmg: 28, cd: 1100, speed: 3.0, react: [350, 550], weapon: 'w:club', loot: [2, 2], look: 2, name: 'Troll' },
  archer:  { hp: 35,  dmg: 9,  cd: 800,  speed: 3.6, react: [250, 400], weapon: 'w:bow', loot: [1, 1], look: 0, name: 'Archer' },
  speedy:  { hp: 30,  dmg: 6,  cd: 450,  speed: 6.4, react: [120, 220], weapon: 'w:dagger', loot: [1, 1], look: 0, name: 'Speedy' },
  dumb:    { hp: 50,  dmg: 8,  cd: 900,  speed: 2.6, react: [700, 1100], weapon: 'w:club', loot: [1, 0], look: 1, name: 'Dumb' },
  regular: { hp: 40,  dmg: 10, cd: 700,  speed: 4.2, react: [250, 400], weapon: 'w:sword', loot: [1, 0], look: 1, name: 'Goblin' },
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
function noteRoom(m, p, prev) { if (p.room !== prev && !p.npc && p.entered) { const mm = /^c(\d+)$/.exec(p.room); if (mm) spawnNpc(m, +mm[1]); } }
function npcLoot(kind) {
  const S = NPC[kind], out = [];
  for (let i = 0; i < S.loot[0]; i++) {
    let k = null; for (let t = 0; t < 40; t++) { k = (i % 2 ? G.randomArmorKey : G.randomWeaponKey)(); if (G.ITEMS[k].tierN >= S.loot[1]) break; }
    out.push(k);
  }
  return out;
}
function dieNpc(m, p) {   // loot by type, counts as a kill for the attacker (done in attack()), not as a death
  p.dead = true; m.players.delete(p.key); m.dirty = true; sendBoard(m);
  addDrop(m, p, npcLoot(p.npc));
}

// ---- the brain
const NPC_AGGRO = DBG && process.env.GK_NPC_AGGRO_MS !== undefined && +process.env.GK_NPC_AGGRO_MS >= 0 ? +process.env.GK_NPC_AGGRO_MS : 1500;   // a mystery enemy only turns on a goblin that has been inside its room this long
function graceOver(m, now) { return m.round > 1 && now - m.goAt >= BOT_GRACE; }
const GANG_PEN = 4.5, HUMAN_PEN = 1.2;   // fairness: metres of "distance" a bot adds for a target that others already attack, and for a human target
function focusOf(m) {   // target id -> how many bots are attacking it right now (rebuilt once per bot tick)
  const f = {}; for (const q of m.players.values()) { const t = q.bot && !q.dead && q.brain && q.brain.tgt; if (t && !t.dead) f[t.id] = (f[t.id] || 0) + 1; } return f;
}
function nearestEnemy(m, p, maxd) {
  let best = null, bs = maxd + 99;
  for (const q of m.players.values()) {
    if (q === p || q.dead || !q.entered || q.room !== p.room || (p.npc && q.npc)) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z); if (d >= maxd) continue;
    let sc = d;
    if (p.bot && m.focus) {   // spread the bots over the targets: a goblin that 2+ others already attack is less attractive, humans are not singled out
      const others = (m.focus[q.id] || 0) - (p.brain && p.brain.tgt === q ? 1 : 0);
      if (others >= 2) sc += GANG_PEN * (others - 1);
      if (isHum(q)) sc += HUMAN_PEN;
    }
    if (sc < bs) { bs = sc; best = q; }
  }
  return best;
}
function face(m, p, x, z, now, jitter) {   // turn toward a point (with aim jitter) without moving
  const yaw = Math.atan2(-(x - p.x), -(z - p.z)) + (jitter ? (Math.random() - 0.5) * 0.22 : 0);
  applyMove(m, null, p, p.x, p.z, yaw, now);
}
function stepTo(m, p, tx, tz, dt, now, free) {   // one validated step toward (tx, tz); returns true when there. `free`: a doorway crossing (no wall margin)
  const b = p.brain, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (d < 0.08) return true;
  const st = Math.min(d, b.speed * dt); let nx = p.x + dx / d * st, nz = p.z + dz / d * st;
  if (!free) [nx, nz] = clampIn(p.room, nx, nz, 0.5);
  if (!applyMove(m, null, p, nx, nz, Math.atan2(-dx, -dz), now)) { BS.bad++; if (++b.stuck > 3) { b.route = []; b.stuck = 0; b.idleUntil = now + 300; } return false; }
  b.stuck = 0; return d <= st + 0.05;
}
function follow(m, p, dt, now) {   // walk the current route (waypoints are pre-validated points: doorway fronts, doorway exits, room points)
  const b = p.brain; if (!b.route.length) return;
  const wp = b.route[0]; if (stepTo(m, p, wp[0], wp[1], dt, now, true)) b.route.shift();
}
function voteDoor(m, p, now) {
  const b = p.brain, doors = ROOM_DOORS[p.room] || [], ws = [];
  let tot = 0;
  for (const d of doors) {
    const o = DOOR_ROOMS[d][0] === p.room ? DOOR_ROOMS[d][1] : DOOR_ROOMS[d][0]; let w;
    if (o === '4') w = m.round > 3 ? 7 : 0.4;
    else if (o[0] === 'c') w = !b.seen[o] ? (m.round <= 3 ? 3.5 : 1.5) : 0.6;
    else w = 1 + (m.round > 3 && DIST_V[o] < DIST_V[p.room] ? 3 : 0);
    ws.push(w); tot += w;
  }
  if (!doors.length) return;
  let r = Math.random() * tot, pick = doors[0]; for (let i = 0; i < doors.length; i++) if ((r -= ws[i]) < 0) { pick = doors[i]; break; }
  if (m.sel[p.room] !== pick) { m.sel[p.room] = pick; (m.selBy || (m.selBy = {}))[p.room] = p.id; broadcastRound(m); }
}
function lootNearby(m, p, dt, now) {   // walk to useful loot piles in this room and take/eat what helps; returns true while busy with it
  const b = p.brain; let best = null, bd = 18;
  for (const dr of m.drops) {
    if (b.skip.has(dr.id) || roomKeyOf(dr.x, dr.z) !== p.room) continue;
    if (!dr.items.some(k => G.isBrain(k) || betterW(p.inv.weapon, k) || betterA(p.inv.armor, k))) { b.skip.add(dr.id); continue; }
    const d = Math.hypot(dr.x - p.x, dr.z - p.z); if (d < bd) { bd = d; best = dr; }
  }
  if (!best) return false;
  if (bd > 2.2) { const [tx, tz] = clampIn(p.room, best.x, best.z, 0.5); stepTo(m, p, tx, tz, dt, now); return true; }
  for (let i = best.items.length - 1; i >= 0; i--) {
    const k = best.items[i];
    if (G.isBrain(k)) loot(m, p, [best.id, i, 'eat']);
    else if (betterW(p.inv.weapon, k) || betterA(p.inv.armor, k)) loot(m, p, [best.id, i, 'take']);
  }
  b.skip.add(best.id); equipBest(m, p); return true;
}
function roomGoals(m, p) {   // once per visit: claim a chest/mystery prize, buy from the merchant with the gold we have
  const b = p.brain, mm = /^c(\d+)$/.exec(p.room); if (!mm || b.done[p.room]) return;
  b.done[p.room] = 1; const id = +mm[1], L = m.layout[id];
  if (L === 'merchant') {
    const shop = m.shops[id]; let bi = -1, bg = 0;
    shop.forEach((it, i) => { if (it.sold || it.price > p.gold) return; const g = G.ITEMS[it.key].type === 'weapon' ? (betterW(p.inv.weapon, it.key) ? G.ITEMS[it.key].attack - (p.inv.weapon ? info(p.inv.weapon).attack : 0) : 0) : (betterA(p.inv.armor, it.key) ? (G.ITEMS[it.key].health - (p.inv.armor ? info(p.inv.armor).health : 0)) / 2 : 0); if (g > bg) { bg = g; bi = i; } });
    if (bi >= 0) buy(m, p, id, bi);
  } else claim(m, p);
  equipBest(m, p); botStations(m, p);   // LOOT: recycle junk, craft tier 0
  equipBest(m, p);
}
function pickDest(m, p, now) {   // idle: where to go next (claimable rooms, the merchant, the vault later, hunting, otherwise wander in the room)
  const b = p.brain, dist = reach(m, p.room), here = new Set(), hunt = {};
  for (const q of m.players.values()) if (q !== p && !q.dead && q.entered && !q.npc) hunt[q.room] = (hunt[q.room] || 0) + 1;
  let best = null, bs = -1e9;
  for (const key in dist) {
    let s = Math.random() * 2 - dist[key] * 0.35, mm = /^c(\d+)$/.exec(key);
    if (mm) {
      const id = +mm[1], L = m.layout[id], my = m.mystery[id];
      if (L === 'chest' && !(p.claimed && p.claimed.has(id))) s += 6;
      else if (L === 'mystery' && my && ['weapon', 'armor', 'gold'].includes(my.kind) && !(p.claimed && p.claimed.has(id))) s += 5;
      else if (L === 'merchant' && !b.done[key] && p.gold >= 20) s += 4;
      else if (L === 'merchant' || (L === 'mystery' && my && my.kind === 'stations')) s += !b.done[key] && botNeedsStation(p) ? 3 : -1;   // LOOT: junk to recycle
      else if (L === 'mystery' && my && my.kind === 'enemy') s += m.round > 2 && p.stats.health > p.stats.maxHealth * 0.7 ? 0.5 : -3;
      else s -= 1;
    } else if (key === '4') s += (rule('crown') ? 9 : 0) + (m.round > 3 ? 4 : -1) + (relicFree(m) && p.inv.backpack.indexOf(null) >= 0 ? 14 : 0);   // LOOT: bots want the vault relic
    else s += (b.seen[key] ? 0 : 1);
    if (m.round >= 3 && hunt[key]) s += m.sudden ? 0.6 : 2.5;   // in sudden death everyone converges on the vault (and its relic), not on whoever is in the next room
    if (m.sudden && key === '4') s += 7;
    if (key === p.room) s -= b.done[key] || !/^c/.test(key) ? 1 : 0;
    if (s > bs) { bs = s; best = key; }
  }
  if (best && best !== p.room && routeTo(m, p, best)) return;
  b.route = [pointIn(p.room, 1.5)]; b.cross = false; b.idleUntil = now + rnd(1200, 4200);
}
function botThink(m, p, now, dt) {
  const b = p.brain, fighter = graceOver(m, now);   // bots AND mystery enemies: no attacks in round 1 or for BOT_GRACE after GO
  b.seen[p.room] = 1;
  if (p.bot) {   // door vote (once per round, at a random moment of the round, never over a human in the same room)
    if (b.seenRound !== m.round) { b.seenRound = m.round; b.voteAt = now + rnd(0.1, 0.8) * Math.max(1000, m.endsAt - now); }
    else if (b.votedRound !== m.round && now >= b.voteAt) {
      b.votedRound = m.round;
      let human = false; for (const q of m.players.values()) if (isHum(q) && !q.dead && q.room === p.room) { human = true; break; }
      if (!human && m.sel[p.room] == null) voteDoor(m, p, now);
    }
  }
  if (now < b.pauseUntil) return;
  { const lu = lureFor(m, p, now); if (lu) { b.route = []; b.tgt = null; b.mode = ''; const [lx, lz] = clampIn(p.room, lu.x, lu.z, 0.5); if (Math.hypot(lx - p.x, lz - p.z) > 0.9) stepTo(m, p, lx, lz, dt, now); return; } }   // LOOT: a thrown plushie distracts
  // reaction: re-decide the target every 200-400 ms (human-like delay)
  if (now >= b.reactAt) {
    b.reactAt = now + (b.react ? rnd(b.react[0], b.react[1]) : rnd(200, 400));
    const tg = fighter ? nearestEnemy(m, p, 6) : null;
    if (p.npc) { if (tg && tg.room === p.room) { if (!b.seenAt) b.seenAt = now; } else b.seenAt = 0; b.tgt = tg && b.seenAt && now - b.seenAt >= NPC_AGGRO ? tg : null; }   // enemies wait until someone has stood in their room for NPC_AGGRO
    else b.tgt = tg;
    if (!p.npc && Math.random() < 0.04) { b.pauseUntil = now + rnd(300, 800); return; }   // occasional hesitation
  }
  const t = b.tgt && !b.tgt.dead && b.tgt.room === p.room ? b.tgt : null;
  if (p.bot && t && p.stats.health < p.stats.maxHealth * 0.25 && b.mode !== 'flee') {   // flee toward a door
    const es = (ADJ[p.room] || []).filter(e => m.open.includes(e.door));
    if (es.length) { es.sort((a, c) => Math.hypot(c.w1[0] - t.x, c.w1[1] - t.z) - Math.hypot(a.w1[0] - t.x, a.w1[1] - t.z)); const e = es[0]; b.route = [e.w1, e.w2, [e.w2[0] + (e.w2[0] - e.w1[0]) * 1.2, e.w2[1] + (e.w2[1] - e.w1[1]) * 1.2]]; b.cross = true; b.mode = 'flee'; }
    else { const r = RB[p.room]; b.route = [clampIn(p.room, p.x + (p.x - t.x) * 9, p.z + (p.z - t.z) * 9, 0.8)]; b.cross = false; b.mode = 'flee'; }
  }
  if (b.mode === 'flee') { if (!b.route.length) b.mode = ''; else { follow(m, p, dt, now); return; } }
  if (t) {   // fight: close in, face, swing (attack() enforces cooldown, range and cone like for players)
    const cb = G.combat(p.inv.weapon), ranged = cb.ranged || boltWeapon(p), want = ranged ? (p.npc === 'archer' ? 7 : 5) : 1.4, d = Math.hypot(t.x - p.x, t.z - p.z);
    b.route = [];
    if (d > want + 0.4) { const [tx, tz] = clampIn(p.room, t.x, t.z, 0.5); stepTo(m, p, tx, tz, dt, now); }
    else if (ranged && d < want - 2.5) { const [tx, tz] = clampIn(p.room, p.x + (p.x - t.x) * 3, p.z + (p.z - t.z) * 3, 0.8); stepTo(m, p, tx, tz, dt, now); }
    else face(m, p, t.x, t.z, now, true);
    if (d <= (ranged ? 10 : 2.0) && Math.random() < 0.85) { face(m, p, t.x, t.z, now, true); attack(m, null, p, now); }
    return;
  }
  if (p.npc) {   // stay in the room: drift back home
    if (Math.hypot(p.x - p.home[0], p.z - p.home[1]) > 0.6) stepTo(m, p, p.home[0], p.home[1], dt, now);
    return;
  }
  if (rule('crown') && p.bot && p.room === '4') { if (Math.hypot(p.x, p.z) > 1.0) stepTo(m, p, 0, 0, dt, now); return; }   // RULES crown: bots go and stand on the dais, and fight whoever is on it
  if (b.route.length) { follow(m, p, dt, now); return; }
  if (lootNearby(m, p, dt, now)) return;
  if (p.bot && relicGoal(m, p, dt, now)) return;   // LOOT
  roomGoals(m, p);
  if (now >= b.idleUntil) pickDest(m, p, now);
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

// LOOT-BEGIN (vault relic, merchant price scaling, throwable plushie, bots at stations; see docs/reports/loot.md)
const RELIC_POS = (() => { const [vx, vz] = WORLD.rc(WORLD.VAULT); return { x: vx + 2.4, z: vz }; })();   // the pedestal on the dais edge (the game.js LOOT block uses the same offset)
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
  sendTo(p.ws, { claimed: { room: 4, key: m.relicKey, gold: 0, relic: 1 } });
  bcast(m, { relic: null, feed: { k: p.name || 'Goblin', msg: ' seized the Vault relic!' } });
  return null;
}
function relicGoal(m, p, dt, now) {   // a bot in the vault walks to the pedestal and takes the relic
  const b = p.brain; if (p.room !== '4' || m.relicTaken || !m.relicKey || b.relicTries > 2) return false;
  if (Math.hypot(p.x - RELIC_POS.x, p.z - RELIC_POS.z) > 1.8) { stepTo(m, p, RELIC_POS.x, RELIC_POS.z, dt, now); return true; }
  b.relicTries = (b.relicTries || 0) + 1; claim(m, p); equipBest(m, p); return false;
}
function throwPlushie(m, p, slot, now) {   // {throw: 'q1'}: the plushie leaves the slot, the server picks the landing spot 7 m ahead (clamped into the room) and tells everyone
  if (m.phase !== 'play' || !m.goAt || now < m.goAt || !RB[p.room] || typeof slot !== 'string' || !/^(q[0-2]|b[0-8])$/.test(slot) || getSlot(p.inv, slot) !== 'x:plushie') return;
  setSlot(p.inv, slot, null); recalc(p); sendInv(p); m.dirty = true;
  const [lx, lz] = clampIn(p.room, p.x - Math.sin(p.yaw) * 7, p.z - Math.cos(p.yaw) * 7, 0.7);
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
const isJunkW = (p, k) => { const it = G.ITEMS[k]; return !!it && it.type === 'weapon' && !!G.recycleYield(k) && !betterW(p.inv.weapon, k); };
const botNeedsStation = p => BOT_SLOTS.some(s => { const k = getSlot(p.inv, s); return k && isJunkW(p, k); });
function botStations(m, p) {   // in a merchant room or a stations mystery room: recycle junk weapons, then craft the best tier 0 recipe the parts pay for
  if (hasStation(m, p, 'recycler')) for (const s of BOT_SLOTS) { const k = getSlot(p.inv, s); if (k && isJunkW(p, k) && !recycle(m, p, s)) BS.rec = (BS.rec || 0) + 1; }
  if (hasStation(m, p, 'workbench')) {
    let best = null, bv = -1;
    for (const r of G.RECIPES) { if (r.tier !== 0 || !Object.keys(r.cost).every(k => (p.parts[k] || 0) >= r.cost[k])) continue; const o = G.ITEMS[r.out], v = o.attack || o.health || 0; if (v > bv) { bv = v; best = r; } }
    if (best && !craft(m, p, best.id)) BS.cra = (BS.cra || 0) + 1;
  }
}
function botLab(m, ws, p, cmd) {   // GK_DEBUG only, for tests. 'station': make c0 a merchant and drop a bot with junk into it. {near:[x,z]}: put a bot there. Any command replies with counters and the lab bot's state.
  const bot = [...m.players.values()].find(q => q.bot && !q.dead);
  if (cmd === 'station' && bot) {
    m.layout[0] = 'merchant'; m.shops[0] = G.randomShop().map(it => ({ ...it, base: it.price })); bot.inv.weapon = 'w:sword'; bot.inv.backpack[0] = 'w:stick'; bot.inv.backpack[1] = 'w:stick'; bot.gold = 0; recalc(bot);
    const c = WORLD.CHEST[0]; bot.brain.route = []; bot.brain.done = {}; bot.brain.idleUntil = 0; bot.brain.mode = ''; place(bot, c.cx, c.cz); m.dirty = true; BS.rec = 0; BS.cra = 0;
  } else if (cmd && Array.isArray(cmd.near) && bot) { place(bot, cmd.near[0], cmd.near[1]); bot.brain.route = []; bot.brain.idleUntil = Date.now() + 60000; bot.brain.mode = ''; m.dirty = true; }
  sendTo(ws, { botlab: { rec: BS.rec || 0, cra: BS.cra || 0, pos: bot ? [bot.x, bot.z] : null, junk: bot ? bot.inv.backpack.filter(k => k === 'w:stick').length : 0, room: bot ? bot.room : null, wpn: bot ? bot.inv.weapon : null } });
}
// LOOT-END

/* MATCH-BEGIN */
const queueInfo = m => ({ n: m.players.size, size: CAP, since: Date.now() - m.formedAt });
function broadcastQueue(m, except) { const msg = JSON.stringify({ queue: queueInfo(m) }); for (const ws of m.players.keys()) if (ws !== except && ws.readyState === 1) ws.send(msg); }
function fillWithBots(m) { fillBots(m); }   // see the BOTS block
function startMatch(m) {   // close the queue match, give everyone their own outer room, tell them to load
  if (m.phase !== 'queue') return;
  m.phase = 'loading'; m.loadAt = Date.now();
  const rooms = [0, 1, 2, 3, 5, 6, 7, 8]; for (let i = rooms.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rooms[i], rooms[j]] = [rooms[j], rooms[i]]; }   // never the vault
  let i = 0;
  for (const p of m.players.values()) {
    const box = rooms[i++ % rooms.length], [cx, cz] = WORLD.rc(box), [x, z] = WORLD.randomPoint(box);
    Object.assign(p, { box, yaw: Math.atan2(-(cx - x), -(cz - z)), ready: false }); place(p, x, z);   // place() also resets the netcode speed budget and history
  }
  { const seen = new Set(); for (const p of m.players.values()) { let n = p.name || 'Goblin'; if (seen.has(n.toLowerCase())) { const free = BOT_NAMES.filter(b => !seen.has(b.toLowerCase())); n = free.length ? free[Math.floor(Math.random() * free.length)] : n + ' ' + p.id; } p.name = n; seen.add(n.toLowerCase()); } }   // unique names inside a match
  fillWithBots(m);
  const players = [...m.players.values()].map(pub);
  for (const [ws, p] of m.players) {
    sendTo(ws, { you: p.id, chests: m.chests, chestKeys: m.chestKeys, layout: m.layout, mystery: m.mystery, shops: m.shops, drops: m.drops, ...roundState(m), match: matchInfo(m), players,
      matchStart: { you: p.id, players, layout: m.layout, chests: m.chests, chestKeys: m.chestKeys, mystery: m.mystery, shops: m.shops, spawn: { box: p.box, x: p.x, z: p.z, yaw: p.yaw }, size: players.length } });
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
  return true;
}
function socGrace(m, now) {   // after GRACE_MS without a socket the goblin dies normally (drops, brain)
  for (const [ws, p] of [...m.players]) if (p.dc && now - p.dc >= GRACE_MS && !p.dead) { p.dc = 0; die(ws, p); }
}
function socResume(ws, token) {   // the player of this token, now bound to the new socket, or null
  const p = socTokens.get(token), m = p && p.match;
  if (!p || p.dead || !m || m.ended || m.phase === 'queue' || !m.players.has(p.ws)) return null;
  const old = p.ws; m.players.delete(old); m.players.set(ws, p); p.ws = ws; p.dc = 0; m.dirty = true;
  place(p, p.x, p.z);   // fresh speed budget: the time offline must not bank movement
  if (old !== ws) { try { old.terminate(); } catch (e) {} }
  return p;
}
function socWelcome(m, ws, p) {   // full resync: the welcome fields of startMatch, then the current round, players, drops, board and countdown
  sendTo(ws, { token: p.token, resumed: 1, you: p.id, chests: m.chests, chestKeys: m.chestKeys, layout: m.layout, mystery: m.mystery, shops: m.shops, drops: m.drops, ...roundState(m), match: matchInfo(m), players: [...m.players.values()].map(pub), fix: [p.x, p.z] });
  sendTo(ws, { inv: p.inv }); sendGold(p); sendParts(p);
  if (m.phase === 'play') sendTo(ws, { board: { left: matchInfo(m).alive, rows: boardRows(m) } });
  if (m.phase === 'countdown') sendTo(ws, { countdown: { at: m.goAt, now: Date.now() } });
}
function socEmote(m, ws, p, n, now) {   // {emote:n}: relayed to everyone else (specs included), at most one per second per player
  if (!Number.isInteger(n) || n < 0 || n >= EMOTES || p.dc || m.phase === 'queue' || now - (p.emoteAt || 0) < EMOTE_MS) return;
  p.emoteAt = now; const msg = JSON.stringify({ emote: { id: p.id, n } });
  for (const w of m.players.keys()) if (w !== ws && w.readyState === 1) w.send(msg);
  for (const w of m.specs.keys()) if (w !== ws && w.readyState === 1) w.send(msg);
}
setInterval(() => { for (const [t, p] of socTokens) if (p.dead || !p.match || !p.match.players.has(p.ws)) socTokens.delete(t); }, 60000).unref();
// SOCIAL-END
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
  else if (SEC_DEBUG) { if (g !== null && /^[0-4]$/.test(g)) goblin = +g; if (wq !== null && /^\d{1,9}$/.test(wq)) wins = Math.min(9999, +wq); }
  const unverified = ct !== null && !tok;   // a saved character came without a valid token: playing as a new goblin
  m = findMatch(wins);
  if (!m) { sendTo(ws, { busy: 1 }); return ws.close(); }
  const id = nextId++, nq = (tokName != null ? tokName : q.get('name') || '').replace(/[^A-Za-z0-9 '\-]/g, '').trim().slice(0, 14);
  p = { id, wins, charId, ws, name: nq || BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)], ...spawn() }; p.room = String(p.box); equip(p, goblin); place(p, p.x, p.z);
  p.match = m; m.players.set(ws, p); m.dirty = true; socToken(p); p.unverified = unverified; }
  // SECURITY-END
  ws.on('error', () => {});
  if (resumed) socWelcome(m, ws, p); else { /* MATCH-BEGIN */ sendTo(ws, { queue: queueInfo(m), goblin, wins: p.wins, token: p.token, ...(p.unverified ? { unverified: 1 } : null) }); broadcastQueue(m, ws); if (m.players.size >= CAP) startMatch(m); /* MATCH-END */ }
  let tokens = 40, last = Date.now(); // rate limit: ~30 msg/s sustained, burst 40
  ws.on('message', (raw, isBinary) => {
    const now = Date.now();
    tokens = Math.min(40, tokens + (now - last) * 0.03); last = now;
    if (isBinary || tokens < 1) return;
    tokens--;
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    if (p.dead && d && typeof d.ping === 'number' && Number.isFinite(d.ping)) return sendTo(ws, { pong: d.ping, t: srvT() });
    if (p.dead && d && d.botstat && process.env.GK_DEBUG) return sendTo(ws, { botstat: { n: BS.n, sum: BS.sum, max: BS.max, calls: BS.calls, bad: BS.bad } });   // debug stats still answer a dead human (bots can kill the test client)
    if (p.dead || !d || typeof d !== 'object') return;
    const dbg = !!process.env.GK_DEBUG;
    /* MATCH-BEGIN */ if (d.cancel === 1) { if (m.phase === 'queue') { leave(m, ws); ws.close(); } return; }
    if (d.ready === 1) { p.ready = true; if (m.phase === 'loading') { const all = [...m.players.values()]; bcast(m, { readyN: { n: all.filter(q => q.ready).length, size: all.length } }); if (all.every(q => q.ready)) beginCountdown(m); } return; }   // readyN: how many goblins are ready (the loading screen shows it)
    if (!m.goAt || now < m.goAt) { if (d.m || d.atk === 1 || d.claim === 1 || d.bribe === 1 || d.sel !== undefined) return; }   // movement, attacks, claims and door picks are locked until GO
    /* MATCH-END */
    if (Array.isArray(d.m) && (d.m.length === 3 || d.m.length === 4) && d.m.every(v => typeof v === 'number' && Number.isFinite(v))) { applyMove(m, ws, p, d.m[0], d.m[1], d.m[2], now, d.m[3]);
    } else if (typeof d.ping === 'number' && Number.isFinite(d.ping)) { sendTo(ws, { pong: d.ping, t: srvT() });
    } else if (d.emote !== undefined) { socEmote(m, ws, p, d.emote, now);   // SOCIAL
    } else if (dbg && d.botstat) { sendTo(ws, { botstat: { n: BS.n, sum: BS.sum, max: BS.max, calls: BS.calls, bad: BS.bad } });
    } else if (dbg && d.kill) { die(ws, p);   // test hooks, only with GK_DEBUG=1
    } else if (dbg && d.win) { win(ws, p);
    } else if (dbg && typeof d.give === 'string') { giveItem(p, d.give);
    } else if (dbg && Array.isArray(d.tp) && d.tp.length === 2 && d.tp.every(v => typeof v === 'number' && Number.isFinite(v))) {
      { const pr = p.room; place(p, clamp(d.tp[0]), clamp(d.tp[1])); noteRoom(m, p, pr); } m.dirty = true;
    } else if (dbg && Number.isFinite(d.gold)) { p.gold = Math.max(0, Math.floor(d.gold)); sendGold(p);
    } else if (typeof d.throw === 'string') { throwPlushie(m, p, d.throw, now);   // LOOT
    } else if (dbg && d.botlab) { botLab(m, ws, p, d.botlab);
    } else if (d.atk === 1) { attack(m, ws, p, now, d.rt);
    } else if (d.bribe === 1) { if (rule('bribe')) { const why = bribe(m, p); if (why) sendTo(ws, { bribeFail: why }); }   // RULES
    } else if (d.enter === 1) { /* legacy: the match start (GO) replaced it */
    } else if (typeof d.eat === 'string') { eat(p, d.eat);
    } else if (Array.isArray(d.loot)) { const why = loot(m, p, d.loot); if (why) sendTo(ws, { lootFail: why });
    } else if (typeof d.craft === 'string') {
      const why = craft(m, p, d.craft); if (why) sendTo(ws, { craftFail: why });
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
    } else if (Number.isInteger(d.sel) && d.sel >= 0 && d.sel < nDoors && (ROOM_DOORS[p.room] || []).includes(d.sel)) {
      if (m.sel[p.room] !== d.sel) { m.sel[p.room] = d.sel; (m.selBy || (m.selBy = {}))[p.room] = p.id; broadcastRound(m); }
    }
  });
  ws.on('close', () => { if (socClose(m, ws, p)) return; m.specs.delete(ws); leave(m, ws); if (!humans(m) && !m.specs.size) matches.delete(m.id); });
});

srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

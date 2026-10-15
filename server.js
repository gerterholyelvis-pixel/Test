const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const R = 12; // room size, must match game.js
const THREE_DIR = path.join(__dirname, 'node_modules/three/build');
const read = f => fs.readFileSync(path.join(__dirname, f));

const srv = http.createServer((q, r) => {
  const m = q.url.match(/^\/three\/(three\.(?:module|core)\.js)$/); // three.js is served from here, no CDN
  if (m) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(path.join(THREE_DIR, m[1]))); }
  if (q.url.startsWith('/three/addons/')) { // three.js post-processing addons (importmap "three/addons/"), .js only, no path traversal
    let rel = ''; try { rel = decodeURIComponent(q.url.slice(14).split('?')[0]); } catch (e) {}
    const base = path.join(__dirname, 'node_modules/three/examples/jsm'), file = path.resolve(base, rel);
    if (rel && !rel.includes('\0') && file.startsWith(base + path.sep) && file.endsWith('.js') && fs.existsSync(file) && fs.statSync(file).isFile()) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(file)); }
    r.writeHead(404); return r.end();
  }
  const js = q.url.match(/^\/(game|menu|items|save|icons)\.js/); // client scripts
  if (js) { r.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return r.end(read(js[1] + '.js')); }
  r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); r.end(read('index.html'));
});
const wss = new WebSocketServer({ server: srv, maxPayload: 256 }); // oversize frames close the socket
const LIM = 27; // world half-extent: 36x36 m grid plus the 8 m chest rooms around it
const clamp = v => Math.max(-LIM, Math.min(LIM, v));
// ---- doors and rounds (door ids and room keys must match game.js) ----
const CHEST = []; // chest rooms in game.js order: { parent, side }
for (let i = 0; i < 9; i++) {
  if (i === 4) continue;
  const col = i % 3, row = Math.floor(i / 3);
  if (row === 0) CHEST.push({ parent: i, side: 'N' }); if (col === 0) CHEST.push({ parent: i, side: 'W' }); if (col === 2) CHEST.push({ parent: i, side: 'E' }); if (row === 2) CHEST.push({ parent: i, side: 'S' });
}
const chestKey = (i, side) => 'c' + CHEST.findIndex(c => c.parent === i && c.side === side);
const ROOM_DOORS = {}; let nDoors = 0; // room key ('0'..'8' grid, 'c0'..'c11' chest) -> door ids on its walls
const addDoor = (a, b) => { const id = nDoors++; (ROOM_DOORS[a] = ROOM_DOORS[a] || []).push(id); (ROOM_DOORS[b] = ROOM_DOORS[b] || []).push(id); };
for (let i = 0; i < 9; i++) {
  const col = i % 3, row = Math.floor(i / 3);
  addDoor(String(i), col < 2 ? String(i + 1) : chestKey(i, 'E'));
  addDoor(String(i), row < 2 ? String(i + 3) : chestKey(i, 'S'));
  if (col === 0) addDoor(String(i), chestKey(i, 'W'));
  if (row === 0) addDoor(String(i), chestKey(i, 'N'));
}
const gi = v => Math.max(0, Math.min(2, Math.round(v / R) + 1));
const roomKeyOf = (x, z) => { // grid rooms inside +-18, chest rooms beyond
  if (Math.abs(z) > 18) return chestKey(gi(x) + (z < 0 ? 0 : 6), z < 0 ? 'N' : 'S');
  if (Math.abs(x) > 18) return chestKey(gi(z) * 3 + (x < 0 ? 0 : 2), x < 0 ? 'W' : 'E');
  return String(gi(x) + 3 * gi(z));
};
const boxOf = (x, z) => Math.max(0, Math.min(2, Math.round(x / R) + 1)) + 3 * Math.max(0, Math.min(2, Math.round(z / R) + 1));
// ---- matches: independent games, players are queued with similar victory counts ----
const CAP = 8;
const matches = new Map(); // id -> match
let nextId = 1, nextMatch = 1;
const sendTo = (ws, o) => { if (ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const bcast = (m, o) => { const msg = typeof o === 'string' ? o : JSON.stringify(o); for (const ws of m.players.keys()) if (ws.readyState === 1) ws.send(msg); };
const avgWins = m => { let s = 0; for (const p of m.players.values()) s += p.wins; return m.players.size ? s / m.players.size : 0; };
const tolerance = w => w <= 5 ? 1 : Math.ceil(w * 0.25);
function newMatch() {
  const m = { id: nextMatch++, players: new Map(), round: 1, dur: 30000, endsAt: Date.now() + 30000, sel: {}, open: [], drops: [], nextDrop: 1, dirty: false, lastRound: 0,
    chests: Array.from({ length: 12 }, () => Math.floor(Math.random() * 6)) }; // weapon index per chest room
  matches.set(m.id, m); return m;
}
const VAULT = ROOM_DOORS['4'] || []; // the 4 doors touching the middle vault room
const vaultVotes = m => new Set(Object.keys(m.sel).filter(k => VAULT.includes(m.sel[k]))).size; // distinct rooms selecting a vault door
const roundState = m => ({ round: { n: m.round, left: Math.max(0, m.endsAt - Date.now()), dur: m.dur }, sel: m.sel, open: m.open, vaultVotes: vaultVotes(m), fizzled: m.fizzled || [] });
const broadcastRound = m => bcast(m, roundState(m));
const matchInfo = m => { let lo = Infinity, hi = -Infinity; for (const p of m.players.values()) { lo = Math.min(lo, p.wins); hi = Math.max(hi, p.wins); } return { size: m.players.size, minWins: m.players.size ? lo : 0, maxWins: m.players.size ? hi : 0 }; };
const broadcastMatch = m => bcast(m, { match: matchInfo(m) });
function findMatch(wins) {
  let best = null;
  for (const m of matches.values()) {
    if (m.players.size >= CAP) continue;
    const d = m.players.size ? Math.abs(wins - avgWins(m)) : 0;
    if (m.players.size && d > tolerance(wins)) continue;
    if (!best || d < best.d || (d === best.d && m.players.size > best.m.players.size)) best = { m, d };
  }
  return best ? best.m : newMatch();
}
function leave(m, ws) { // remove a player from their match; empty matches disappear
  if (!m.players.delete(ws)) return;
  m.dirty = true;
  if (!m.players.size) matches.delete(m.id); else broadcastMatch(m);
}
setInterval(() => { // one global timer steps every match
  const now = Date.now();
  for (const m of matches.values()) {
    if (now >= m.endsAt) {
      const picked = [...new Set(Object.values(m.sel))], ok = vaultVotes(m) >= 2; // vault doors need 2 different rooms
      m.open = picked.filter(d => ok || !VAULT.includes(d)); m.fizzled = ok ? [] : picked.filter(d => VAULT.includes(d)); m.sel = {}; m.round++; m.dur = 45000; m.endsAt = now + m.dur; broadcastRound(m); m.lastRound = now; }
    else if (now - m.lastRound >= 1000) { m.lastRound = now; broadcastRound(m); }
    if (m.dirty) { m.dirty = false; bcast(m, { players: [...m.players.values()].map(pub) }); } // positions go out at 20 Hz
  }
}, 50);

// 0 small 30%, 1 medium 30%, 2 big 30%, 3 wizard 9%, 4 king 1%
// Equipment decides combat stats: attack damage comes from the weapon, health from the armour.
const WEAPONS = { dagger: { name: 'Dagger', attack: 10 }, club: { name: 'Nailed Club', attack: 15 }, mace: { name: 'Spiked Mace', attack: 20 }, staff: { name: 'Gnarled Staff', attack: 0 }, scepter: { name: 'Royal Scepter', attack: 20 },
  sword: { name: 'Rusty Sword', attack: 12 }, axe: { name: 'Battle Axe', attack: 22 }, spear: { name: 'War Spear', attack: 18 }, bow: { name: 'Short Bow', attack: 14 } };
const ARMOR = { rags: { name: 'Ragged Tunic', health: 40 }, vest: { name: 'Studded Vest', health: 50 }, harness: { name: 'Warlord Harness', health: 80 }, robe: { name: 'Starry Robe', health: 60 }, royal: { name: 'Royal Mantle', health: 100 } };
const KNOWLEDGE = [60, 40, 30, 80, 40]; // innate, per goblin type
const START = [{ weapon: 'dagger', armor: 'rags' }, { weapon: 'club', armor: 'vest' }, { weapon: 'mace', armor: 'harness' }, { weapon: 'staff', armor: 'robe' }, { weapon: 'scepter', armor: 'royal' }];
const drops = []; // loot left behind by dead players: { id, x, z, items: [name...] }
let nextDrop = 1;
function equip(p, goblin) { // give a player a goblin type with its starting weapon, armour and an empty inventory
  const s = START[goblin];
  p.goblin = goblin; p.equip = { weapon: s.weapon, armor: s.armor }; p.inv = [];
  p.stats = { knowledge: KNOWLEDGE[goblin], attack: WEAPONS[s.weapon].attack, health: ARMOR[s.armor].health, maxHealth: ARMOR[s.armor].health };
  p.gear = { weapon: WEAPONS[s.weapon].name, armor: ARMOR[s.armor].name };
}
function rollGoblin() {
  const r = Math.random() * 100;
  return r < 30 ? 0 : r < 60 ? 1 : r < 90 ? 2 : r < 99 ? 3 : 4;
}
function spawn() {
  const box = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(Math.random() * 8)]; // never the middle (4)
  const cx = ((box % 3) - 1) * R, cz = (Math.floor(box / 3) - 1) * R;
  const x = cx + (Math.random() - 0.5) * 6, z = cz + (Math.random() - 0.5) * 6;
  return { box, x, z, yaw: Math.atan2(-(cx - x), -(cz - z)) }; // facing the room centre
}
function die(ws, p) { // a dead player drops weapon, armour and everything in the inventory where they fell and leaves the game
  const items = [p.gear.weapon, p.gear.armor, ...p.inv];
  drops.push({ id: nextDrop++, x: +p.x.toFixed(2), z: +p.z.toFixed(2), items }); if (drops.length > 60) drops.shift();
  const msg = JSON.stringify({ drops }); wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
  if (ws.readyState === 1) ws.send(JSON.stringify({ died: { items } }));
  p.dead = true; players.delete(ws); dirty = true;   // out of the game; the client goes back to the menu or requeues with a new connection
}
const send = () => {
  const msg = JSON.stringify({ players: [...players.values()] });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
};
setInterval(() => { if (dirty) { dirty = false; send(); } }, 50); // positions go out at 20 Hz

wss.on('connection', ws => {
  const id = nextId++;
  const p = { id, ...spawn() }; p.room = String(p.box); equip(p, rollGoblin());
  players.set(ws, p);
  ws.on('error', () => {});
  ws.send(JSON.stringify({ you: id, chests, drops, ...roundState() }));
  dirty = true;
  let tokens = 40, last = Date.now(); // rate limit: ~30 msg/s sustained, burst 40
  ws.on('message', (raw, isBinary) => {
    const now = Date.now();
    tokens = Math.min(40, tokens + (now - last) * 0.03); last = now;
    if (isBinary || tokens < 1) return;
    tokens--;
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    if (p.dead) return;
    if (d && Array.isArray(d.m) && d.m.length === 3 && d.m.every(v => typeof v === 'number' && Number.isFinite(v))) {
      p.x = clamp(d.m[0]); p.z = clamp(d.m[1]);
      p.yaw = Math.max(-1e3, Math.min(1e3, d.m[2]));
      p.box = boxOf(p.x, p.z); p.room = roomKeyOf(p.x, p.z);
      dirty = true;
    } else if (d && d.kill && process.env.GK_DEBUG) { die(ws, p);   // test hook, only with GK_DEBUG=1
    } else if (d && Number.isInteger(d.sel) && d.sel >= 0 && d.sel < nDoors && (ROOM_DOORS[p.room] || []).includes(d.sel)) {
      if (sel[p.room] !== d.sel) { sel[p.room] = d.sel; broadcastRound(); }
    }
  });
  ws.on('close', () => { players.delete(ws); dirty = true; });
});

srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

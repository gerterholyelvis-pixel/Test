const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const R = 12; // room size, must match game.js
const THREE_DIR = path.join(__dirname, 'node_modules/three/build');
const read = f => fs.readFileSync(path.join(__dirname, f));

const srv = http.createServer((q, r) => {
  const m = q.url.match(/^\/three\/(three\.(?:module|core)\.js)$/); // three.js is served from here, no CDN
  if (m) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(path.join(THREE_DIR, m[1]))); }
  const js = q.url.match(/^\/(game|menu)\.js/); // client scripts
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
let round = 1, dur = 30000, endsAt = Date.now() + dur, sel = {}, open = []; // sel: room key -> selected door id, open: doors open during this round
const roundState = () => ({ round: { n: round, left: Math.max(0, endsAt - Date.now()), dur }, sel, open });
const broadcastRound = () => { const msg = JSON.stringify(roundState()); wss.clients.forEach(c => c.readyState === 1 && c.send(msg)); };
setInterval(() => {
  if (Date.now() >= endsAt) { open = [...new Set(Object.values(sel))]; sel = {}; round++; dur = 45000; endsAt = Date.now() + dur; broadcastRound(); }
}, 100);
setInterval(broadcastRound, 1000);
const boxOf = (x, z) => Math.max(0, Math.min(2, Math.round(x / R) + 1)) + 3 * Math.max(0, Math.min(2, Math.round(z / R) + 1));
const players = new Map();
let nextId = 1, dirty = false;
const chests = Array.from({ length: 12 }, () => Math.floor(Math.random() * 6)); // weapon index per chest room, rolled once per server start

// 0 small 30%, 1 medium 30%, 2 big 30%, 3 wizard 9%, 4 king 1%
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
const send = () => {
  const msg = JSON.stringify({ players: [...players.values()] });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
};
setInterval(() => { if (dirty) { dirty = false; send(); } }, 50); // positions go out at 20 Hz

wss.on('connection', ws => {
  const id = nextId++;
  const p = { id, goblin: rollGoblin(), ...spawn() }; p.room = String(p.box);
  players.set(ws, p);
  ws.on('error', () => {});
  ws.send(JSON.stringify({ you: id, chests, ...roundState() }));
  dirty = true;
  let tokens = 40, last = Date.now(); // rate limit: ~30 msg/s sustained, burst 40
  ws.on('message', (raw, isBinary) => {
    const now = Date.now();
    tokens = Math.min(40, tokens + (now - last) * 0.03); last = now;
    if (isBinary || tokens < 1) return;
    tokens--;
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    if (d && Array.isArray(d.m) && d.m.length === 3 && d.m.every(v => typeof v === 'number' && Number.isFinite(v))) {
      p.x = clamp(d.m[0]); p.z = clamp(d.m[1]);
      p.yaw = Math.max(-1e3, Math.min(1e3, d.m[2]));
      p.box = boxOf(p.x, p.z); p.room = roomKeyOf(p.x, p.z);
      dirty = true;
    } else if (d && Number.isInteger(d.sel) && d.sel >= 0 && d.sel < nDoors && (ROOM_DOORS[p.room] || []).includes(d.sel)) {
      if (sel[p.room] !== d.sel) { sel[p.room] = d.sel; broadcastRound(); }
    }
  });
  ws.on('close', () => { players.delete(ws); dirty = true; });
});

srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

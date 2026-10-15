const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const R = 12; // room size, must match game.js
const THREE_DIR = path.join(__dirname, 'node_modules/three/build');
const read = f => fs.readFileSync(path.join(__dirname, f));

const srv = http.createServer((q, r) => {
  const m = q.url.match(/^\/three\/(three\.(?:module|core)\.js)$/); // three.js is served from here, no CDN
  if (m) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(path.join(THREE_DIR, m[1]))); }
  if (q.url.startsWith('/game.js')) { r.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return r.end(read('game.js')); }
  r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); r.end(read('index.html'));
});
const wss = new WebSocketServer({ server: srv });
const players = new Map();
let nextId = 1, dirty = false;

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
  players.set(ws, { id, goblin: rollGoblin(), ...spawn() });
  ws.send(JSON.stringify({ you: id }));
  send();
  ws.on('message', raw => {
    let d; try { d = JSON.parse(raw); } catch { return; }
    const p = players.get(ws);
    if (Array.isArray(d.m) && d.m.length === 3 && d.m.every(Number.isFinite)) {
      [p.x, p.z, p.yaw] = d.m;
      p.box = Math.max(0, Math.min(2, Math.round(p.x / R) + 1)) + 3 * Math.max(0, Math.min(2, Math.round(p.z / R) + 1));
      dirty = true;
    }
  });
  ws.on('close', () => { players.delete(ws); send(); });
});

srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

const http = require('http'), fs = require('fs'), { WebSocketServer } = require('ws');
const page = fs.readFileSync(__dirname + '/index.html');
const path = require('path');
const THREE_DIR = path.join(__dirname, 'node_modules/three/build');
const srv = http.createServer((q, r) => {
  const m = q.url.match(/^\/three\/(three\.(?:module|core)\.js)$/); // serve three.js ourselves, no CDN
  if (m) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(path.join(THREE_DIR, m[1]))); }
  r.writeHead(200, { 'content-type': 'text/html' }); r.end(page);
});
const wss = new WebSocketServer({ server: srv });
const players = new Map();
let nextId = 1;

// 0 small 30%, 1 medium 30%, 2 big 30%, 3 wizard 9%, 4 king 1%
function rollGoblin() {
  const r = Math.random() * 100;
  return r < 30 ? 0 : r < 60 ? 1 : r < 90 ? 2 : r < 99 ? 3 : 4;
}
function rollBox() {
  const boxes = [0, 1, 2, 3, 5, 6, 7, 8]; // never the middle (4)
  return boxes[Math.floor(Math.random() * boxes.length)];
}
function broadcast() {
  const msg = JSON.stringify({ players: [...players.values()] });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

wss.on('connection', ws => {
  const id = nextId++;
  players.set(ws, { id, goblin: rollGoblin(), box: rollBox() });
  ws.send(JSON.stringify({ you: id }));
  broadcast();
  ws.on('close', () => { players.delete(ws); broadcast(); });
});

srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

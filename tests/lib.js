// Shared helpers for the test scripts: spawn a server on a free port, connect ws clients that remember what they received.
const { spawn } = require('child_process'), net = require('net'), path = require('path'), WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

async function startServer(env = {}) {
  const port = await freePort();
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, GK_DEBUG: '1', GK_MATCH_SIZE: '1', GK_COUNTDOWN_MS: '0', PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + out)), 8000);
    proc.stdout.on('data', () => { if (out.includes('Goblin King on')) { clearTimeout(t); res(); } });
    proc.on('exit', c => { clearTimeout(t); rej(new Error('server exited early (' + c + '): ' + out)); });
  });
  return { port, proc, out: () => out, alive: () => proc.exitCode === null, stop: () => { try { proc.kill(); } catch (e) {} } };
}

// A client keeps every message (c.msgs) and the latest value of every key (c.state), e.g. c.state.inv, c.state.round, c.state.claimFail
// opts.raw: do not send {ready:1} and do not wait for the match to start (queue tests). By default a client joins a queue of size GK_MATCH_SIZE (1 in these tests), readies up and waits for GO.
function connect(port, query = '', opts = {}) {
  return new Promise((res, rej) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/' + (query ? '?' + query : '')), c = { ws, msgs: [], state: {}, closed: false };
    ws.on('message', raw => { let d; try { d = JSON.parse(raw.toString()); } catch (e) { return; } c.msgs.push(d); Object.assign(c.state, d); if (d.matchStart && !opts.raw) c.send({ ready: 1 }); });
    ws.on('close', () => c.closed = true);
    ws.on('error', rej);
    c.send = o => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
    c.until = async (fn, ms = 3000, what = 'condition') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn(c)) return true; await sleep(25); } throw new Error('timeout waiting for ' + what); };
    c.close = () => new Promise(r => { if (c.closed) return r(); ws.on('close', r); ws.close(); });
    if (opts.raw) return ws.on('open', () => res(c));
    ws.on('open', () => c.until(x => x.state.you != null && x.state.inv && x.state.countdown && Date.now() >= x.state.countdown.at, opts.wait || 5000, 'match start and GO').then(() => res(c), rej));
  });
}
// Join until the match's layout satisfies pred (each fresh match rolls a new layout; an empty match disappears when its last player leaves)
async function connectWith(port, pred, query = '') {
  for (let i = 0; i < 30; i++) { const c = await connect(port, query); if (pred(c.state)) return c; await c.close(); await sleep(150); }
  throw new Error('no match with the wanted layout after 30 tries');
}
// run a list of [name, async fn]; print results; exit non-zero on failure or when a test throws
async function run(file, tests) {
  let fail = 0;
  for (const [name, fn] of tests) {
    const t0 = Date.now();
    try { const r = await fn(); console.log(r === 'skip' ? '  skip ' : '  ok   ', file + ': ' + name + (Date.now() - t0 > 1500 ? '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' : '')); }
    catch (e) { fail++; console.log('  FAIL ', file + ': ' + name + '\n         ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n         ')); }
  }
  return fail;
}
const assert = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
const connectRaw = (port, query = '') => connect(port, query, { raw: true });
module.exports = { sleep, startServer, connect, connectRaw, connectWith, run, assert, eq, ROOT };
// All doors in canonical id order (WORLD.DOORS): [{id, a, b}] with the room keys of both sides.
module.exports.doors = () => require('../world.js').DOORS.map(d => ({ id: d.id, a: d.a, b: d.b }));
// The id of the door between two rooms (order does not matter); throws when they are not neighbours.
module.exports.doorBetween = (a, b) => { const d = require('../world.js').DOORS.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); if (!d) throw new Error('no door between ' + a + ' and ' + b); return d.id; };
// The arena cell behind a room key: a home 'c0' -> its parent cell; an arena key stays itself.
module.exports.cellOf = k => { const W = require('../world.js'); return k[0] === 'c' ? String(W.CHEST[+k.slice(1)].parent) : k; };
// Centre [x, z] of any room key.
module.exports.centre = k => { const r = require('../world.js').roomRect(k); return [r.cx, r.cz]; };
// The 4 arena rooms that have a door into the vault, as room keys (N E S W order of the vault's doors).
module.exports.vaultNeighbours = () => { const W = require('../world.js'); return W.ROOM_DOORS[W.VAULT_KEY].map(id => { const d = W.DOORS[id]; return d.a === W.VAULT_KEY ? d.b : d.a; }); };
// The non-vault, non-hatch door ids of an arena room.
module.exports.plainDoors = k => { const W = require('../world.js'); return W.ROOM_DOORS[k].filter(id => W.DOORS[id].kind === 'arena'); };

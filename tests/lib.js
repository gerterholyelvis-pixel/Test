// Shared helpers for the test scripts: spawn a server on a free port, connect ws clients that remember what they received.
const { spawn } = require('child_process'), net = require('net'), path = require('path'), WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

async function startServer(env = {}) {
  const port = await freePort();
  const proc = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...process.env, GK_DEBUG: '1', PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server did not start: ' + out)), 8000);
    proc.stdout.on('data', () => { if (out.includes('Goblin King on')) { clearTimeout(t); res(); } });
    proc.on('exit', c => { clearTimeout(t); rej(new Error('server exited early (' + c + '): ' + out)); });
  });
  return { port, proc, out: () => out, alive: () => proc.exitCode === null, stop: () => { try { proc.kill(); } catch (e) {} } };
}

// A client keeps every message (c.msgs) and the latest value of every key (c.state), e.g. c.state.inv, c.state.round, c.state.claimFail
function connect(port, query = '') {
  return new Promise((res, rej) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/' + (query ? '?' + query : '')), c = { ws, msgs: [], state: {}, closed: false };
    ws.on('message', raw => { let d; try { d = JSON.parse(raw.toString()); } catch (e) { return; } c.msgs.push(d); Object.assign(c.state, d); });
    ws.on('close', () => c.closed = true);
    ws.on('error', rej);
    c.send = o => ws.send(typeof o === 'string' ? o : JSON.stringify(o));
    c.until = async (fn, ms = 3000, what = 'condition') => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn(c)) return true; await sleep(25); } throw new Error('timeout waiting for ' + what); };
    c.close = () => new Promise(r => { if (c.closed) return r(); ws.on('close', r); ws.close(); });
    ws.on('open', () => c.until(x => x.state.you != null && x.state.inv, 3000, 'join messages').then(() => res(c), rej));
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
    try { const r = await fn(); console.log(r === 'skip' ? '  skip ' : '  ok   ', file + ': ' + name); }
    catch (e) { fail++; console.log('  FAIL ', file + ': ' + name + '\n         ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n         ')); }
  }
  return fail;
}
const assert = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b)); };
module.exports = { sleep, startServer, connect, connectWith, run, assert, eq, ROOT };
// Door ids in creation order: for each grid room i: E-or-chest, S-or-chest, W chest (left column), N chest (top row). Returns [{id, a, b}] with room keys of both sides.
module.exports.doors = () => {
  const W = require('../world.js'), out = [], add = (a, b) => out.push({ id: out.length, a, b });
  for (let i = 0; i < 9; i++) {
    const col = W.colOf(i), row = W.rowOf(i);
    add(String(i), col < 2 ? String(i + 1) : W.chestKey(i, 'E')); add(String(i), row < 2 ? String(i + 3) : W.chestKey(i, 'S'));
    if (col === 0) add(String(i), W.chestKey(i, 'W')); if (row === 0) add(String(i), W.chestKey(i, 'N'));
  }
  return out;
};

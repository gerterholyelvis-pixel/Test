#!/usr/bin/env node
// COMBAT4 duel harness: does a blow that LOOKS like a hit on the attacker's screen at the clip's contact frame register on the server, under latency?
//   node tools/duelsim.js [--root <checkout>] [--swings 24] [--scen 0,100,200,a200v20,a20v200] [--json]
// A real server, two ws clients in one match. The victim B strafes on a known path in front of the attacker A (sword, standing still, facing B's lane).
// Latency is injected on the attacker's link (one way = ping/2 each direction) and on the victim's uplink; A's picture of B is modelled exactly like
// the client draws it: render time rt = now - A's downlink - 100 ms interpolation delay, and B's position at rt is where B was ow_b earlier on his path.
// For every swing the harness asks combat4.js whether the strike touches B's drawn capsule at the contact frame ("looks like a hit"), then reads the server's verdict.
//   reg   = looked like a hit and registered          phantom = registered although it looked like a miss
// --root runs another checkout (the "before" numbers in docs/reports/combat-4.md come from the pre-COMBAT4 tree; it gets the same atk + rt messages).
const path = require('path'), { spawn } = require('child_process'), net = require('net');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function startServer(root, env) {
  const port = await freePort(), proc = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, GK_DEBUG: '1', GK_COUNTDOWN_MS: '0', PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proc.stdout.on('data', d => out += d); proc.stderr.on('data', d => out += d);
  await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('server did not start: ' + out)), 10000); proc.stdout.on('data', () => { if (out.includes('Goblin King on')) { clearTimeout(t); res(); } }); proc.on('exit', c => { clearTimeout(t); rej(new Error('exit ' + c + out)); }); });
  return { port, stop: () => { try { proc.kill(); } catch (e) {} } };
}
const SCEN = { 0: { a: 0, b: 0 }, 100: { a: 100, b: 100 }, 200: { a: 200, b: 200 }, a200v20: { a: 200, b: 20 }, a20v200: { a: 20, b: 200 } };   // ping (ms) of attacker / victim
async function duel(port, root, scen, swings, wins) {
  const here = path.join(__dirname, '..'), lib = require(path.join(here, 'tests', 'lib.js')), W = require(path.join(here, 'world.js')), G = require(path.join(here, 'items.js')), C4 = require(path.join(here, 'combat4.js'));
  const owA = scen.a / 2, owB = scen.b / 2, DELAY = 100;
  const [a, b] = await Promise.all([lib.connect(port, 'goblin=1&wins=' + wins), lib.connect(port, 'goblin=1&wins=' + wins)]);
  await a.until(x => x.state.match && x.state.match.alive === 2, 4000, 'both entered').catch(() => {});
  const give = async (c, k) => { c.send({ give: k }); await c.until(x => x.state.inv.backpack.includes(k), 2000, k); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(k), 'weapon'] }); await c.until(x => x.state.inv.weapon === k, 2000, k + ' on'); };
  await give(a, 'w:sword');
  const key = 'w:sword', cb = G.combat(key), tm = C4.timing(G, key, cb.cd), pr = C4.profile(G, key), R = cb.range, r = G.hitRadius(1), h = C4.capH(1);
  // a plain spot: room 0's centre, A faces east (yaw -pi/2), B strafes 1.2 .. 3.0 m in front and +-1.1 m to the side
  const [cx, cz] = W.rc(0), ax = cx - 2, az = cz, yaw = -Math.PI / 2;
  const pathB = t => [ax + 2.1 + 0.9 * Math.sin(t * 3.1), az + 1.1 * Math.sin(t * 1.9 + 0.7)];
  a.send({ tp: [ax, az] }); a.send({ m: [ax, az, yaw] }); const p0 = pathB(0); b.send({ tp: p0 }); await sleep(300);
  let off = 0; { const k = Math.random(); a.send({ ping: k }); await a.until(x => x.msgs.some(m => m.pong === k), 2000, 'pong'); off = a.msgs.find(m => m.pong === k).t - Date.now(); }
  const srvNow = () => Date.now() + off, T0 = Date.now();
  const sendA = o => setTimeout(() => a.send(o), owA), sendB = o => setTimeout(() => b.send(o), owB);
  let run = true; const walker = (async () => { while (run) { const [x, z] = pathB((Date.now() - T0) / 1000); sendB({ m: [+x.toFixed(2), +z.toFixed(2), 0] }); await sleep(50); } })();
  await sleep(600);
  const res = { looks: 0, reg: 0, missLooks: 0, phantom: 0, n: 0 }, me = a.state.you, other = b.state.you;
  for (let i = 0; i < swings; i++) {
    const tClick = Date.now() + Math.random() * 120, n0 = a.msgs.length; await sleep(tClick - Date.now());
    const rt = Math.round(srvNow() - owA - DELAY);   // what the attacker's screen shows right now (server time)
    sendA({ atk: 1, rt, sq: i + 1 });
    let looks = false;   // B on A's screen during the blow (contact frame to the end of the active window, the frames the blade cuts)
    for (let q = tm.contact; q <= tm.end && !looks; q += 15) { const [bx, bz] = pathB((tClick + q - owA - DELAY - owB - T0) / 1000); looks = C4.melee(pr, R, ax, 0, az, yaw, bx, 0, bz, r, h, null); }
    await sleep(Math.round(cb.cd * (1 + (G.COMBAT5 ? G.COMBAT5.COMBO.whiff : 0))) + 40 + scen.a);   // COMBAT5: a client obeys the whiff recovery too
    const hit = a.msgs.slice(n0).some(m => m.hit && m.hit.from === me && m.hit.to === other);
    b.send({ hp: 999 });   // full health again (GK_DEBUG hook), so the duel never ends
    res.n++; if (looks) { res.looks++; if (hit) res.reg++; } else { res.missLooks++; if (hit) res.phantom++; }
  }
  run = false; await walker; await a.close(); await b.close();
  return { regPct: +(100 * res.reg / Math.max(1, res.looks)).toFixed(1), phantomPct: +(100 * res.phantom / Math.max(1, res.missLooks)).toFixed(1), ...res };
}
async function simulate(o = {}) {
  const root = o.root || path.join(__dirname, '..'), names = o.scen || ['0', '100', '200'], out = {};   // one server per scenario: parallel duels never get matched across
  const rs = await Promise.all(names.map(async s => { const S = await startServer(root, { GK_MATCH_SIZE: '2', GK_ROUND_MS: '600000' }); try { return await duel(S.port, root, SCEN[s], o.swings || 24, 0); } finally { S.stop(); } }));
  names.forEach((s, i) => out[s] = rs[i]); return out;
}
module.exports = { simulate, SCEN };
if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  simulate({ root: path.resolve(arg('root', path.join(__dirname, '..'))), swings: +arg('swings', 24), scen: arg('scen', '0,100,200,a200v20,a20v200').split(',') })
    .then(r => { console.log(JSON.stringify(r, null, process.argv.includes('--json') ? 0 : 1)); process.exit(0); }, e => { console.error(e); process.exit(1); });
}

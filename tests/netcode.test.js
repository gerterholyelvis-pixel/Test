// netcode: ping/pong, snapshot shape, slow state not resent, movement validation (speed, closed door, open door, walls), lag-compensated melee
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const FACE_E = -Math.PI / 2;
const D = L.doors(), DOOR01 = D.find(d => d.a === '0' && d.b === '1').id;
async function pair(srv, wins, ga = 0, gb = 0) {   // two players in one private match (distinct `wins` keep tests apart)
  // servers run with GK_MATCH_SIZE=2: both clients queue together (same `wins` bracket); connect() returns after GO
  const [a, b] = await Promise.all([connect(srv.port, 'goblin=' + ga + '&wins=' + wins), connect(srv.port, 'goblin=' + gb + '&wins=' + wins)]);
  await a.until(x => x.state.players && x.state.players.some(p => p.id === b.state.you), 1500, 'same match');
  await a.until(x => x.state.match && x.state.match.alive === 2, 2000, 'both entered');
  return [a, b];
}
const put = async (c, x, z, yaw = 0) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const snapsOf = (c, id, from = 0) => c.msgs.slice(from).filter(m => m.s).flatMap(m => { const out = []; for (let i = 1; i < m.s.length; i += 6) if (m.s[i] === id) out.push({ t: m.s[0], id, x: m.s[i + 1], z: m.s[i + 2], yaw: m.s[i + 3], v: m.s[i + 4], age: m.s[i + 5] }); return out; });
const walk = async (c, x0, z0, x1, z1, secs, speed) => {   // send {m} every 66 ms along a line at the given speed (m/s); returns the end point
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(secs / 0.066)); let x = x0, z = z0;
  for (let i = 1; i <= n; i++) { const d = Math.min(len, speed * 0.066 * i) / (len || 1); x = x0 + (x1 - x0) * d; z = z0 + (z1 - z0) * d; c.send({ m: [+x.toFixed(2), +z.toFixed(2), 0] }); await sleep(66); }
  return [x, z];
};

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '1200' }); let fail = 1;
  try {
    fail = await L.run('netcode', [
      ['ping/pong: pong echoes the client time and carries a growing server time', async () => {
        const c = await L.connectRaw(srv.port); c.send({ ping: 12345.5 }); await c.until(x => x.state.pong === 12345.5, 2000, 'pong'); const t1 = c.state.t;
        assert(Number.isInteger(t1) && t1 >= 0, 'server time is an integer ms: ' + t1); await sleep(120); c.send({ ping: 7 }); await c.until(x => x.state.pong === 7, 2000, 'pong 2');
        assert(c.state.t - t1 >= 90 && c.state.t - t1 < 400, 'server clock advances in ms: ' + (c.state.t - t1));
        c.send({ ping: 'x' }); c.send({ ping: null }); await sleep(100); assert(srv.alive()); await c.close();
      }],
      ['snapshots: flat {s:[t, id,x,z,yaw,speed,age,...]}, rounded, only movers, never yourself; moving does not resend the slow players list', async () => {
        const [a, b] = await pair(srv, 0); a.send({ tp: [-15, -15] }); b.send({ tp: [-13, -15] }); await sleep(150);
        const n = a.msgs.length, nb = b.msgs.length; await walk(b, -13, -15, -9.7, -15, 0.7, 4.6); await sleep(150);
        const ms = a.msgs.slice(n), snaps = ms.filter(m => m.s);
        assert(snaps.length >= 5 && snaps.length <= 20, 'about 20 Hz while moving, got ' + snaps.length + ' in 0.85 s');
        for (const m of snaps) { assert(Array.isArray(m.s) && (m.s.length - 1) % 6 === 0 && m.s.length >= 7, 'shape ' + JSON.stringify(m)); assert(Number.isInteger(m.s[0]), 't is ms'); assert(m.s.slice(1).every(v => typeof v === 'number')); }
        const mine = snapsOf(a, b.state.you, n); assert(mine.length >= 5);
        for (const s of mine) { eq(Math.round(s.x * 100) / 100, s.x, 'x rounded to cm'); eq(Math.round(s.yaw * 1000) / 1000, s.yaw, 'yaw rounded to mrad'); assert(s.age >= 0 && s.age <= 255); assert(s.x > -13.5 && s.x < -9.6); }
        assert(mine[mine.length - 1].x > mine[0].x, 'x increases'); assert(mine.some(s => s.v > 2 && s.v < 8), 'speed field ~4.6 m/s: ' + mine.map(s => s.v)); eq(mine[mine.length - 1].v, 0, 'a final snapshot says he stopped');
        assert(mine.every((s, i) => i === 0 || s.t >= mine[i - 1].t), 'server time never goes back');
        eq(snapsOf(b, b.state.you, nb), [], 'a player never receives his own snapshots'); eq(ms.filter(m => m.players), [], 'moving must not trigger the slow players message');
        const quiet = a.msgs.length; await sleep(300); eq(a.msgs.slice(quiet).filter(m => m.s), [], 'a goblin standing still sends nothing');
        await a.close(); await b.close();
      }],
      ['speed: normal walking and sprinting are accepted, teleports and speed hacks get {fix:[x,z]}', async () => {
        const [a, b] = await pair(srv, 10); await put(a, -15, -15); await put(b, -17, -15);
        await walk(b, -17, -15, -12.5, -15, 0.6, 7.8); await sleep(100); eq(b.msgs.filter(m => m.fix), [], 'sprinting at 7.8 m/s was corrected');
        const last = snapsOf(a, b.state.you).pop(); assert(Math.abs(last.x - -12.5) < 0.1, 'server followed to ' + last.x);
        delete b.state.fix; b.send({ m: [-15, -15, 0] }); await b.until(x => x.state.fix, 2000, 'fix after a 4 m jump');
        assert(Math.abs(b.state.fix[0] - -12.5) < 0.1 && Math.abs(b.state.fix[1] - -15) < 0.1, 'fix puts him back at the last good position: ' + b.state.fix);
        delete b.state.fix; const n = b.msgs.length; await walk(b, -12.5, -15, -17, -15, 0.5, 20); await sleep(100);   // 20 m/s for 0.8 s
        const fixes = b.msgs.slice(n).filter(m => m.fix); assert(fixes.length >= 1, 'no fix for 20 m/s'); assert(fixes.length <= 6, 'fix spam: ' + fixes.length);
        const far = snapsOf(a, b.state.you).pop(); assert(far.x > -15, 'speed hacker got to ' + far.x + ' (should crawl)');
        await a.close(); await b.close();
      }],
      ['closed door: walking through a wall or a closed door is rejected; after the round opens it, the doorway works but the wall beside it does not', async () => {
        const [a, o] = await pair(srv, 20);   // a = mover, o = observer
        await put(a, -9.4, -15); delete a.state.fix; await sleep(80); const no = o.msgs.length;
        a.send({ m: [-8.6, -15, 0] }); await a.until(x => x.state.fix, 2000, 'fix at the closed door');
        eq(a.state.fix, [-9.4, -15], 'back to the last good spot'); eq(snapsOf(o, a.state.you, no).filter(s => s.x > -9), [], 'the observer saw him pass the wall');
        delete a.state.fix; a.send({ tp: [-20.4, -15] }); a.send({ m: [-21.3, -15, 0] }); await a.until(x => x.state.fix, 2000, 'fix at the outer wall'); eq(a.state.fix, [-20.4, -15]);
        delete a.state.fix; a.send({ tp: [-10, -19] }); a.send({ m: [-8, -19, 0] }); await a.until(x => x.state.fix, 2000, 'fix when crossing at the wall instead of the doorway'); // 4 m beside the door centre
        a.send({ tp: [-9.4, -15] }); a.send({ enter: 1 }); await sleep(100); a.send({ sel: DOOR01 });   // room 0 votes for the plain door to room 1
        await a.until(x => x.state.open && x.state.open.includes(DOOR01), 6000, 'door opens at the end of round 1');
        delete a.state.fix; a.send({ m: [-8.6, -15, 0] }); await sleep(200); eq(a.state.fix, undefined, 'open door still blocks'); await o.until(x => snapsOf(x, a.state.you).some(s => s.x > -9), 1500, 'observer sees him in the next room');
        delete a.state.fix; a.send({ tp: [-8.6, -19] }); a.send({ m: [-9.6, -19, 0] }); await a.until(x => x.state.fix, 2000, 'wall beside the open doorway');
        await a.close(); await o.close();
      }],
      ['lag compensation: melee uses the target position the attacker saw (rewound, capped at 200 ms)', async () => {
        const [a, b] = await pair(srv, 30, 0, 0); a.send({ enter: 1 }); b.send({ enter: 1 }); await a.until(x => x.state.match && x.state.match.alive === 2, 2000, 'both entered');
        const MACE_ATK = G.ITEMS[G.START[0].weapon].attack, reach = G.COMBAT.melee + G.COMBAT.slack;
        await put(a, -15, -15, FACE_E); await put(b, -13, -15); await sleep(150);   // 2.0 m away: in reach
        const n = a.msgs.length; b.send({ m: [-11.8, -15, 0] });   // one 1.2 m step: now 3.2 m away, out of reach
        await a.until(x => snapsOf(x, b.state.you, n).some(s => s.x > -11.9), 1500, 'step seen');
        const first = snapsOf(a, b.state.you, n)[0], tSaw = first.t - first.age - 20;   // server time just before he moved away
        assert(3.2 > reach && 2.0 < reach, 'test geometry');
        const hitBy = async rt => hits(await swing(a, rt)); const hits = ms => ms.filter(m => m.hit);
        const swing = async (c, rt) => { const k = c.msgs.length; c.send(rt == null ? { atk: 1 } : { atk: 1, rt }); await sleep(130); return c.msgs.slice(k); };
        const h = await hitBy(tSaw); eq(h.length, 1, 'rewound swing should hit what the attacker saw'); eq(h[0].hit.dmg, MACE_ATK);
        await sleep(450); eq((await hitBy()).length, 0, 'without rewind he is out of reach');
        await sleep(450); eq((await hitBy(tSaw)).length, 0, 'rewind is capped at 200 ms: ' + 'an old timestamp must not reach back');
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  netcode setup: ' + (e.stack || e.message)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

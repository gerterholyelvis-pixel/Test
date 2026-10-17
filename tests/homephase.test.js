// HOME PHASE (docs/reports/home-phase.md): round 1 is spent at home. Every hatch is shut on the server (pathOk refuses the step, for humans and bots alike), nobody can walk
// into a foreign home, the door guard leaves the cells alone, the dev fast-forward still works, and round 2 opens every hatch (DOORS-PERSIST: and nothing else, see tests/doors-persist.test.js).
// {tp} (GK_DEBUG) is only used to stand a raider outside a home, which the rules make impossible in round 1; every crossing is a real walk ({m}).
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
const doorSpot = (home, d) => { const c = W.CHEST[+home.slice(1)]; return W.attLocal(c, 0, W.HS / 2 + d); };   // d > 0 outside the hatch (in the arena cell), d < 0 inside the home
const homeOf = c => c.state.matchStart.spawn.home;
const mark = c => c.msgs.length, since = (c, i, key) => c.msgs.slice(i).map(m => m[key]).filter(v => v !== undefined);
const lastRound = c => c.msgs.slice().reverse().find(m => m.round);
async function walk(c, pts) {   // real moves through a list of points, 0.6 m apart at most; returns the fixes received
  const i = mark(c);
  for (const p of pts) { c.send({ m: [+p[0].toFixed(2), +p[1].toFixed(2), 0] }); await sleep(140); }
  await sleep(150); return since(c, i, 'fix');
}
const through = (home, from, to) => { const o = []; for (let d = from; from < to ? d <= to + 1e-9 : d >= to - 1e-9; d += from < to ? 0.4 : -0.4) o.push(doorSpot(home, d)); return o; };
function track(c) { const room = {}; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.s) for (let i = 1; i + 5 < d.s.length; i += 6) { const k = W.roomKeyOf(d.s[i + 1], d.s[i + 2]); (room[d.s[i]] = room[d.s[i]] || new Set()).add(k); } }); return room; }
const bot5 = async c => { const n = c.msgs.length; c.send({ bot5: 1 }); await c.until(x => x.msgs.slice(n).some(m => m.bot5), 2000, 'bot5'); return c.msgs.slice(n).find(m => m.bot5).bot5; };

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '30000', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '60000' });
  const srvB = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '12000', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0' });
  let fail = 1;
  try {
    fail = await L.run('homephase', [
      ['round 1: you cannot walk out of your home, a raider cannot walk in, no vote or open door; {dbgFF} still skips; round 2 opens the hatches', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'name=Ana&goblin=2&wins=0'), connect(srv.port, 'name=Bob&goblin=2&wins=0')]);
        const ha = homeOf(a), cell = L.cellOf(ha), hatch = W.ROOM_DOORS[ha][0];
        eq(lastRound(a).round.n, 1); eq(lastRound(a).homeLock, 1, 'round 1 carries homeLock'); eq(a.state.open, []);
        // the owner pushes through his own hatch: refused, and he is still at home
        a.send({ tp: doorSpot(ha, -1.2) }); await sleep(120);
        let fx = await walk(a, through(ha, -0.8, 1.2)); assert(fx.length >= 1, 'the shut hatch refused the step'); eq(W.roomKeyOf(...fx[fx.length - 1]), ha, 'corrected back into the home');
        // a raider (teleported outside, which round 1 never allows) cannot walk in either
        b.send({ tp: doorSpot(ha, 1.4) }); await sleep(120);
        fx = await walk(b, through(ha, 1.0, -1.0)); assert(fx.length >= 1, 'the raider was refused'); eq(W.roomKeyOf(...fx[fx.length - 1]), cell, 'the raider stays in the cell');
        // the hatch is never a vote, and the guard opens nothing for a goblin at home
        a.send({ sel: hatch }); await sleep(300); eq(a.state.sel[ha], undefined, 'no pick on a hatch');
        assert(!a.msgs.some(m => m.exitHint || m.exitOpen != null), 'no exit hint for a goblin at home'); eq(a.state.open.filter(d => W.ROOM_DOORS[cell].includes(d)), [], 'the cell outside a home stays shut in round 1');
        // the dev fast-forward still works in the home phase
        a.send({ dbgFF: 1 }); await a.until(c => c.state.round.left <= 10500, 1500, 'skipped to 0:10');
        await a.until(c => c.state.round.n === 2, 13000, 'round 2');
        assert(!lastRound(a).homeLock, 'round 2 has no homeLock');
        // DOORS-PERSIST: round 2 itself opens nothing but the hatches (tests/doors-persist.test.js); here the raider stood in the cell during round 1 (a debug teleport), so the guard may have given that cell a door
        assert(!a.state.open.includes(hatch), 'a hatch never sits in the open list (it opens by the round, not by a vote)');
        // now both walk freely: the owner out, the raider in (no Door Lock bought)
        a.send({ tp: doorSpot(ha, -1.2) }); await sleep(120); eq((await walk(a, through(ha, -0.8, 1.6))).length, 0, 'the owner walks out in round 2');
        b.send({ tp: doorSpot(ha, 1.4) }); await sleep(120); eq((await walk(b, through(ha, 1.0, -1.0))).length, 0, 'anyone may walk in from round 2');
        for (const c of [a, b]) await c.close();
      }],
      ['bots: in round 1 every bot stays in its own home and works there (bench, recycler, pump); when the arena opens they walk out', async () => {
        const c = await connect(srvB.port, 'name=Watcher&goblin=2&wins=0'), rooms = track(c);
        const bots = c.state.matchStart.players.filter(p => p.bot); eq(bots.length, 7);
        await c.until(x => x.state.round.n === 1 && x.state.round.left < 3000, 14000, 'late round 1');
        const s1 = await bot5(c);
        for (const p of bots) { const seen = [...(rooms[p.id] || [])]; assert(seen.every(k => k === p.home), 'bot ' + p.id + ' left home ' + p.home + ' in round 1: ' + seen.join(',')); }
        assert(Object.keys(rooms).filter(id => bots.some(p => p.id === +id)).length >= 4, 'bots move about at home (snapshots seen)');
        assert(s1.home >= 5, 'most bots took a home work goal in round 1: ' + s1.home); eq(s1.left, 0, 'no bot left home in round 1'); eq(s1.hardStuck, 0, 'nobody hard stuck');
        await c.until(x => x.state.round.n === 2, 6000, 'round 2');
        const t0 = Date.now(); let out = 0;
        while (Date.now() - t0 < 25000) { out = bots.filter(p => [...(rooms[p.id] || [])].some(k => k !== p.home)).length; if (out >= 5) break; await sleep(500); }
        assert(out >= 5, 'bots walked out when the arena opened: ' + out + ' of 7');
        const s2 = await bot5(c); assert((s2.leaveWhy.arenaOpen || 0) >= 3, 'bots ended their home work because the arena opened: ' + JSON.stringify(s2.leaveWhy));
        await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  homephase setup: ' + (e.stack || e)); }
  srv.stop(); srvB.stop(); process.exit(fail ? 1 : 0);
})();

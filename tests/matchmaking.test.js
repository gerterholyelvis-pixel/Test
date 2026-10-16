// matchmaking: queue -> match at 8 players (or GK_MATCH_SIZE) or after GK_QUEUE_MS with >= 2 -> synchronized load-in -> countdown -> GO
const L = require('../tests/lib.js'), { connectRaw, sleep, assert, eq } = L, W = require('../world.js');
const ready = c => c.send({ ready: 1 });
(async () => {
  let fail = 0;
  const run = async (name, env, fn) => {
    const srv = await L.startServer(env);
    try { fail += await L.run('matchmaking', [[name, () => fn(srv)]]); } catch (e) { fail++; console.log('  FAIL  ' + name + ': ' + e.message); }
    srv.stop();
  };
  await run('8 clients form one match, same countdown, 8 distinct outer rooms', { GK_MATCH_SIZE: '8', GK_COUNTDOWN_MS: '1200', GK_QUEUE_MS: '60000' }, async srv => {
    const cs = [];
    for (let i = 0; i < 7; i++) { cs.push(await connectRaw(srv.port)); await sleep(30); }
    await sleep(300); assert(cs.every(c => !c.state.matchStart), 'match started with only 7 players');
    eq(cs[0].state.queue.n, 7); eq(cs[0].state.queue.size, 8);
    cs.push(await connectRaw(srv.port));
    await Promise.all(cs.map(c => c.until(x => x.state.matchStart, 3000, 'matchStart')));
    const ms = cs[0].state.matchStart; eq(ms.players.length, 8);
    const rooms = ms.players.map(p => p.box); eq(new Set(rooms).size, 8, 'one goblin per room'); assert(!rooms.includes(W.VAULT), 'someone spawned in the vault');
    for (const p of ms.players) eq(W.roomKeyOf(p.x, p.z), String(p.box));
    for (const c of cs) { const mine = c.state.matchStart.players.find(p => p.id === c.state.you); eq(c.state.matchStart.spawn, { box: mine.box, x: mine.x, z: mine.z, yaw: mine.yaw }); eq(c.state.matchStart.layout, ms.layout); }
    await sleep(300); assert(cs.every(c => !c.state.countdown), 'countdown before everyone was ready');
    for (const c of cs.slice(0, 7)) ready(c);
    await sleep(300); assert(cs.every(c => !c.state.countdown), 'countdown before the last player was ready');
    const t0 = Date.now(); ready(cs[7]);
    await Promise.all(cs.map(c => c.until(x => x.state.countdown, 2000, 'countdown')));
    const at = cs[0].state.countdown.at; assert(cs.every(c => c.state.countdown.at === at), 'different GO times');
    assert(at - t0 > 1000 && at - t0 < 1600, 'GO is ~countdown after the last ready: ' + (at - t0));
    await sleep(Math.max(0, at - Date.now()) + 200);
    await cs[0].until(x => x.state.round && x.state.round.left > 29000, 1000, 'round 1 running'); assert(cs[0].state.round.left <= 30000);
    const late = await connectRaw(srv.port); await sleep(200); assert(!late.state.matchStart && late.state.queue.n === 1, 'late joiner must not enter the closed match');
    for (const c of [...cs, late]) await c.close();
  });
  await run('movement, attacks, claims and door picks are ignored before GO', { GK_MATCH_SIZE: '2', GK_COUNTDOWN_MS: '1500' }, async srv => {
    const a = await connectRaw(srv.port, 'goblin=2'), b = await connectRaw(srv.port, 'goblin=2');
    await a.until(x => x.state.matchStart, 2000, 'matchStart'); ready(a); ready(b);
    await a.until(x => x.state.countdown, 2000, 'countdown');
    const me = a.state.matchStart.players.find(p => p.id === a.state.you), n0 = a.msgs.length;
    a.send({ m: [0, 0, 1] }); a.send({ atk: 1 }); a.send({ claim: 1 }); a.send({ sel: 0 });
    await sleep(300);
    assert(Date.now() < a.state.countdown.at, 'test timing: GO already happened');
    assert(a.msgs.slice(n0).every(m => !m.players && !m.claimFail && !m.swing && !(m.sel && Object.keys(m.sel).length)), 'a locked message got an answer: ' + JSON.stringify(a.msgs.slice(n0)).slice(0, 200));
    await a.until(x => x.state.round && x.state.round.left < 29500 && x.msgs.slice(n0).some(m => m.players), 3500, 'GO');
    const after = a.state.players.find(p => p.id === a.state.you); eq([after.x, after.z], [me.x, me.z], 'moved before GO');
    // movement now arrives as {s:[t,id,x,z,yaw,v,age]} snapshots to the OTHER player; the mover gets a {fix} only if refused. A 0.4 m step from the spawn is legal.
    const nb = b.msgs.length, nf = a.msgs.length, tx = +(me.x + 0.4).toFixed(2); a.send({ m: [tx, me.z, 1] });
    await b.until(x => x.msgs.slice(nb).some(m => m.s && m.s.some((v, i) => i % 6 === 1 && v === a.state.you && m.s[i + 1] === tx && m.s[i + 2] === +me.z.toFixed(2))), 2000, 'movement works after GO (snapshot at the new position)');
    await sleep(250); assert(!a.msgs.slice(nf).some(m => m.fix), 'a legal move right after spawn was refused: ' + JSON.stringify(a.msgs.slice(nf).filter(m => m.fix)));
    await a.close(); await b.close();
  });
  await run('GK_MATCH_SIZE=2: the first player waits, the second starts the match', { GK_MATCH_SIZE: '2', GK_QUEUE_MS: '60000' }, async srv => {
    const a = await connectRaw(srv.port); await sleep(300);
    eq(a.state.queue.n, 1); eq(a.state.queue.size, 2); assert(typeof a.state.goblin === 'number', 'queue message carries my goblin'); assert(!a.state.matchStart);
    const b = await connectRaw(srv.port); await a.until(x => x.state.matchStart && x.state.matchStart.players.length === 2, 2000, 'match of 2'); await b.until(x => x.state.matchStart, 2000, 'b match');
    await a.close(); await b.close();
  });
  await run('queue timeout: starts with whoever is there (even ONE human), the rest are bots', { GK_MATCH_SIZE: '8', GK_QUEUE_MS: '900', GK_READY_MS: '500', GK_COUNTDOWN_MS: '300' }, async srv => {
    const a = await connectRaw(srv.port); await sleep(400); assert(!a.state.matchStart, 'must wait for the queue time first');
    const b = await connectRaw(srv.port);
    await a.until(x => x.state.matchStart, 2500, 'timeout start'); await b.until(x => x.state.matchStart, 500, 'b start'); eq(a.state.matchStart.players.length, 8); eq(a.state.matchStart.players.filter(p => p.bot).length, 6);
    await a.until(x => x.state.countdown, 2000, 'countdown after the ready timeout (nobody sent ready)'); await b.until(x => x.state.countdown, 500, 'b countdown'); eq(a.state.countdown.at, b.state.countdown.at);
    await a.close(); await b.close();
  });
  await run('cancel removes the player from the queue', { GK_MATCH_SIZE: '3', GK_QUEUE_MS: '60000' }, async srv => {
    const a = await connectRaw(srv.port), b = await connectRaw(srv.port); await a.until(x => x.state.queue.n === 2, 2000, 'two queued');
    b.send({ cancel: 1 }); await b.until(x => x.closed, 2000, 'b socket closed'); await a.until(x => x.state.queue.n === 1, 2000, 'a sees one queued');
    const c = await connectRaw(srv.port); await sleep(300); assert(!a.state.matchStart && !c.state.matchStart, 'the cancelled player still counted');
    const d = await connectRaw(srv.port); await a.until(x => x.state.matchStart, 2000, 'a, c, d make 3'); eq(a.state.matchStart.players.length, 3);
    for (const x of [a, c, d]) await x.close();
  });
  process.exit(fail ? 1 : 0);
})();

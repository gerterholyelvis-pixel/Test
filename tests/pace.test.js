// pacing rules (server.js PACE block): round income, kill bounty, no dead round, showdown when three goblins are left.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const startOf = (c, id) => c.state.matchStart.players.find(p => p.id === id);
async function kill(a, b) {   // a (with a slayer) walks next to b and swings until b is dead
  a.send({ give: 'w:slayer' }); await a.until(x => x.state.inv.backpack.includes('w:slayer'), 2000, 'slayer');
  a.send({ mv: ['b' + a.state.inv.backpack.indexOf('w:slayer'), 'weapon'] }); await sleep(120);
  const v = startOf(a, b.state.you);
  for (let i = 0; i < 40 && !b.state.died; i++) { a.send({ tp: [v.x + 1.3, v.z] }); a.send({ m: [v.x + 1.3, v.z, Math.PI / 2] }); await sleep(60); a.send({ atk: 1 }); await sleep(250); }
  assert(b.state.died, 'the victim never died');
}
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '5000', GK_NEXT_ROUND_MS: '5000', GK_READY_MS: '300', GK_BOT_GRACE_MS: '60000' });
  const srv4 = await L.startServer({ GK_MATCH_SIZE: '4', GK_QUEUE_MS: '100', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500', GK_READY_MS: '300', GK_BOT_GRACE_MS: '60000' });
  let fail = 1;
  try {
    fail = await L.run('pace', [
      ['a round nobody voted in still opens one outer door; living goblins earn 10 gold at the new round', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'name=Thok&goblin=2&wins=0'), connect(srv.port, 'name=Mizzle&goblin=2&wins=0')]);
        a.send({ enter: 1 }); b.send({ enter: 1 });
        const g0 = a.state.gold != null ? a.state.gold : 100;
        await a.until(x => x.state.round && x.state.round.n === 2, 7000, 'round 2');
        eq(a.state.open.length, 1, 'one door opened with no votes');
        await a.until(x => x.state.gold === g0 + 10, 1500, 'round income');
        for (const x of [a, b]) await x.close();
      }],
      ['a kill pays half of the victim\'s gold, and the toast message carries it', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'name=Thok&goblin=2&wins=0'), connect(srv.port, 'name=Mizzle&goblin=2&wins=0')]);
        a.send({ enter: 1 }); b.send({ enter: 1 });
        b.send({ gold: 200 }); await b.until(x => x.state.gold === 200, 1500, 'b gold');
        a.send({ gold: 100 }); await a.until(x => x.state.gold === 100, 1500, 'a gold');
        await kill(a, b);
        await a.until(x => x.state.bounty != null, 2000, 'bounty message');
        assert(a.state.bounty >= 100, 'bounty ' + a.state.bounty);
        await a.until(x => x.state.gold >= 200, 1500, 'killer holds the bounty');
        for (const x of [a, b]) await x.close();
      }],
    ]);
    if (!fail) fail = await L.run('pace', [
      ['three goblins left (of four): the next round opens every door and says showdown', async () => {
        const cs = await Promise.all([1, 2, 3, 4].map(i => connect(srv4.port, 'name=G' + i + '&goblin=2&wins=0')));
        for (const c of cs) c.send({ enter: 1 });
        assert(!cs[0].state.showdown, 'no showdown at four');
        await kill(cs[0], cs[1]);
        await cs[0].until(x => x.state.showdown === 1, 8000, 'showdown flag');
        eq(cs[0].state.open.length, L.doors().length, 'every door open');
        for (const c of cs) await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); srv4.stop(); process.exit(fail ? 1 : 0);
})();

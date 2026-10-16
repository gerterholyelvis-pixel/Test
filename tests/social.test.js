// social: reconnect grace (token resume within GK_GRACE_MS, death after it) and emotes (relay, per-player 1 s rate limit)
const L = require('./lib.js'), { connect, connectRaw, sleep, assert, eq } = L;
const pair = srv => Promise.all([connect(srv.port, 'goblin=2&name=Aaa'), connect(srv.port, 'goblin=2&name=Bbb')]);
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_READY_MS: '300', GK_GRACE_MS: '1500' });
  let fail = 1;
  try {
    fail = await L.run('social', [
      ['reconnect inside the grace period resumes the same id, inventory and health; others see him frozen, then back', async () => {
        const [a, b] = await pair(srv);
        a.send({ give: 'w:slayer' }); await a.until(x => x.state.inv.backpack.includes('w:slayer'), 2000, 'item');
        const tok = a.state.token, id = a.state.you, inv = JSON.stringify(a.state.inv); assert(tok && tok.length >= 16, 'no token'); eq(b.state.you !== id, true);
        const hp = a.state.matchStart.players.find(p => p.id === id).stats.health;
        a.ws.close();
        await b.until(x => x.state.players && x.state.players.some(p => p.id === id && p.dc === 1), 2000, 'dc flag');
        assert(b.state.players.some(p => p.id === id), 'frozen goblin must stay in the world');
        const r = await connectRaw(srv.port, 'token=' + tok); await r.until(x => x.state.resumed, 2000, 'resume welcome');
        eq(r.state.you, id, 'same id'); eq(JSON.stringify(r.state.inv), inv, 'same inventory');
        const me = r.state.players.find(p => p.id === id); assert(me && !me.dc, 'back in the list without the flag'); eq(me.stats.health, hp, 'same health');
        assert(r.state.round && r.state.match && r.state.layout && r.state.chests && r.state.board, 'full resync'); eq(r.state.match.alive, 2, 'still counted alive');
        await b.until(x => x.state.players.some(p => p.id === id && !p.dc), 2000, 'dc flag cleared'); assert(!b.state.died && !b.state.won);
        r.send({ m: [me.x + 0.2, me.z, 0] }); await sleep(100); assert(!r.closed, 'resumed socket stays open');
        await sleep(1800); assert(b.state.players.some(p => p.id === id), 'still in the match after the grace time');
        await r.close(); await b.close();
      }],
      ['reconnect after the grace period fails, the goblin died with drops, and the other player won', async () => {
        const [a, b] = await pair(srv);
        a.send({ give: 'w:slayer' }); await a.until(x => x.state.inv.backpack.includes('w:slayer'), 2000, 'item');
        const tok = a.state.token, id = a.state.you; a.ws.close();
        await sleep(300); assert(!b.state.won, 'alive during the grace period');
        await b.until(x => x.state.won, 3000, 'win after the disconnected goblin died');
        assert(b.msgs.some(m => m.board && m.board.rows.some(r => r[0] === id && r[4] === 0)), 'board shows him dead');
        assert(b.msgs.some(m => m.drops && m.drops.length) || b.state.drops, 'drops');
        const r = await connectRaw(srv.port, 'token=' + tok); await r.until(x => x.closed, 2000, 'closed'); assert(r.state.resumeFail === 1 && !r.state.resumed, 'resume must fail');
        const r2 = await connectRaw(srv.port, 'token=nonsense'); await r2.until(x => x.closed, 2000, 'closed'); assert(r2.state.resumeFail === 1);
        await b.close();
      }],
      ['emotes are relayed to others, never to the sender, validated and limited to one per second', async () => {
        const [a, b] = await pair(srv), got = c => c.msgs.filter(m => m.emote).map(m => m.emote);
        a.send({ emote: 2 }); await b.until(x => got(x).length === 1, 2000, 'emote'); eq(got(b)[0], { id: a.state.you, n: 2 });
        a.send({ emote: 1 }); a.send({ emote: 3 }); await sleep(200); eq(got(b).length, 1, 'rate limited'); eq(got(a).length, 0, 'not echoed to the sender');
        await sleep(900); a.send({ emote: 9 }); a.send({ emote: 'x' }); a.send({ emote: -1 }); await sleep(150); eq(got(b).length, 1, 'invalid ids ignored');
        a.send({ emote: 3 }); await b.until(x => got(x).length === 2, 2000, 'second emote'); eq(got(b)[1].n, 3);
        b.send({ emote: 0 }); await a.until(x => got(x).length === 1, 2000, 'other direction'); eq(got(a)[0].n, 0);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('FAIL setup', e); } finally { srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

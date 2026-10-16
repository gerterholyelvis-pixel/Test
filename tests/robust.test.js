// robustness: a throwing match does not stop the others, disconnects free every per-player table, floods and junk are survived
const L = require('./lib.js'), { connect, connectRaw, sleep, assert, eq } = L, WebSocket = require('ws');
const stat = async (port) => { const c = await connectRaw(port); await c.until(x => x.state.queue, 2000, 'queue'); c.send({ botstat: 1 }); await c.until(x => x.state.botstat, 2000, 'botstat'); const s = c.state.botstat; await c.close(); return s; };

(async () => {
  const srv = await L.startServer({ GK_GRACE_MS: '300' });
  let fail = 1;
  try {
    fail = await L.run('robust', [
      ['tick: a match whose tick throws is closed after repeated errors, the other match keeps ticking, the server stays up', async () => {
        const a = await connect(srv.port, 'goblin=0&wins=0'), b = await connect(srv.port, 'goblin=0&wins=1000');
        const n0 = b.msgs.filter(m => m.round).length; a.send({ boom: 1 });
        await a.until(x => x.closed, 8000, 'broken match closed'); assert(srv.alive(), 'server alive');
        await b.until(x => x.msgs.filter(m => m.round).length > n0 + 1, 3000, 'other match still broadcasts rounds');
        assert(!b.closed, 'other client untouched'); const log = srv.out(); assert(log.includes('tick match='), 'error logged'); assert(log.split('tick match=').length <= 5, 'log not flooded: ' + (log.split('tick match=').length - 1) + ' lines');
        await b.close();
      }],
      ['cleanup: players that disconnect mid-match free the match, the resume token and the IP slot', async () => {
        for (let i = 0; i < 12; i++) { const c = await connect(srv.port, 'goblin=0&wins=' + (2000 + i * 100)); c.ws.terminate(); }   // abrupt close, no close frame
        await sleep(1200);   // GK_GRACE_MS 300: the goblins die and leave
        const s = await stat(srv.port); assert(s.matches <= 1, 'matches left: ' + s.matches); assert(s.tokens <= 1, 'tokens left: ' + s.tokens); assert(s.ips <= 1, 'ips left: ' + s.ips);
      }],
      ['flood: 400 messages in one burst are mostly dropped by the rate limit, the socket stays usable', async () => {
        const c = await connect(srv.port, 'goblin=0'); const n0 = c.msgs.filter(m => m.pong !== undefined).length;
        for (let i = 0; i < 400; i++) c.send({ ping: i });
        await sleep(400); const got = c.msgs.filter(m => m.pong !== undefined).length - n0; assert(got < 90, 'processed ' + got + ' of 400');
        await sleep(1500); c.send({ ping: 999 }); await c.until(x => x.state.pong === 999, 2000, 'answers again after the burst'); await c.close();
      }],
      ['junk: malformed JSON, wrong types, binary frames, huge numbers and prototype keys never crash or kick', async () => {
        const c = await connect(srv.port, 'goblin=0'); const junk = ['{', 'null', '5', '"x"', '[]', '[1,2,3]', '{"m":"a"}', '{"m":[1e999,1,1]}', '{"m":[1,2,3,4,5]}', '{"sel":{}}', '{"loot":[1]}', '{"loot":[[],[],"take"]}', '{"buy":[null,null]}', '{"mv":["__proto__","constructor"]}', '{"__proto__":{"x":1}}', '{"constructor":{"prototype":{"y":1}}}', '{"emote":"1"}', '{"throw":{}}', '{"eat":["b0"]}', '{"drop":"__proto__"}', '{"craft":{"a":1}}', '{"atk":1,"rt":"x"}', '{"claim":1}'];
        for (const j of junk) { c.send(j); await sleep(40); }
        c.ws.send(Buffer.from([1, 2, 3])); await sleep(100); c.send({ ping: 7 }); await c.until(x => x.state.pong === 7, 2000, 'still answers'); assert(srv.alive() && !c.closed, 'alive');
        assert(!({}).x && !({}).y, 'Object.prototype untouched'); await c.close();
      }],
      ['junk: a frame over 512 bytes closes that socket only', async () => {
        const c = await connect(srv.port, 'goblin=0'), d = await connect(srv.port, 'goblin=0&wins=3000'); c.send(JSON.stringify({ m: [1, 2, 3], pad: 'x'.repeat(600) }));
        await c.until(x => x.closed, 2000, 'oversize closed'); assert(srv.alive() && !d.closed, 'others unaffected'); await d.close();
      }],
    ]);
  } finally { srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

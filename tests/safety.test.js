// safety: client address behind a proxy (X-Forwarded-For), join-flood limiter, name filter, quick chat, reports, private rooms, host start, /healthz counters (docs/reports/release-2.md)
const L = require('./lib.js'), { connectRaw, sleep, assert, eq } = L;
const S = require('../safety.js'), WS = require(require.resolve('ws', { paths: [L.ROOT] })), http = require('http');
const getJson = (port, p) => new Promise((res, rej) => http.get({ host: '127.0.0.1', port, path: p }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res(JSON.parse(b))); }).on('error', rej));
const tryWs = (port, headers, query = '') => new Promise(res => { const ws = new WS('ws://127.0.0.1:' + port + '/' + query, { headers }); ws.on('open', () => res({ ok: true, ws })); ws.on('unexpected-response', (rq, rs) => res({ ok: false, status: rs.statusCode })); ws.on('error', () => {}); });

(async () => {
  let fail = 0;
  const group = async (name, env, fn) => { const srv = await L.startServer(env); try { fail += await L.run('safety', [[name, () => fn(srv)]]); } catch (e) { fail++; console.log('  FAIL  ' + name + ': ' + e.message); } srv.stop(); };

  fail += await L.run('safety', [
    ['clientIp: no proxy uses the socket; GK_TRUST_PROXY=1 takes the LAST hop, so a forged first entry changes nothing', async () => {
      eq(S.clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5', ''), '10.0.0.5', 'unset: header ignored'); eq(S.clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5', '0'), '10.0.0.5');
      eq(S.clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5', '1'), '1.2.3.4'); eq(S.clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4' }, '10.0.0.5', '1'), '1.2.3.4', 'forged leading entry is ignored');
      eq(S.clientIp({ 'x-forwarded-for': '6.6.6.6, 1.2.3.4, 172.16.0.9' }, '10.0.0.5', '2'), '1.2.3.4', 'two proxies deep');
      eq(S.clientIp({}, '10.0.0.5', '1'), '10.0.0.5', 'header missing falls back to the socket'); eq(S.clientIp({ 'x-forwarded-for': 'garbage' }, '10.0.0.5', '1'), '10.0.0.5', 'not an IP');
      eq(S.clientIp({ 'x-forwarded-for': '1.2.3.4' }, '10.0.0.5', '2'), '10.0.0.5', 'fewer hops than trusted'); eq(S.clientIp({ 'x-forwarded-for': ['5.5.5.5', '1.2.3.4'] }, '::ffff:10.0.0.5', 'true'), '1.2.3.4', 'repeated header');
      eq(S.clientIp({}, '::ffff:127.0.0.1', ''), '127.0.0.1', 'mapped IPv4'); eq(S.clientIp({ 'x-forwarded-for': '2001:DB8::1' }, '10.0.0.5', '1'), '2001:db8::1', 'IPv6');
    }],
    ['connLimiter: a burst, then one per interval; addresses are independent; refills', async () => {
      const l = S.connLimiter({ burst: 3, everyMs: 1000 }); const t = 1e6;
      assert(l.allow('a', t) && l.allow('a', t) && l.allow('a', t), 'burst'); assert(!l.allow('a', t + 10), '4th refused'); assert(l.allow('b', t), 'other address'); assert(l.allow('a', t + 1100), 'refilled one'); assert(!l.allow('a', t + 1110));
      eq(l.refused(), 2);
    }],
    ['cleanName: leet, spaces, repeats, links and staff names are refused; ordinary names pass', async () => {
      for (const bad of ['fuck', 'Sh1t', 'f u c k', 'fuuuuck', 'N4zi', 'www.x', 'Admin', 'Moderator', 'b1tch', 'discord']) eq(S.cleanName(bad), '', bad);
      for (const good of ['Narg', 'Mizzle', "O'Neil", 'Grub-3', 'Zog the Mild', 'Skritch']) eq(S.cleanName(good), good);
      eq(S.cleanName('  a   b  '), 'a b'); eq(S.cleanName('x'.repeat(40)).length, 14); eq(S.cleanName('<b>Zog</b>'), 'bZogb');
    }],
    ['reportBook: reasons, self, bots, duplicates, per-match limit and rate', async () => {
      const b = S.reportBook(() => {}), m = { id: 1 }, a = { id: 1, name: 'A' }, t = { id: 2, name: 'T' }, bot = { id: 3, name: 'B', bot: 1 };
      eq(b.report(m, a, a, 0, 1e6), 'self'); eq(b.report(m, a, bot, 0, 1e6), 'bot'); eq(b.report(m, a, t, 9, 1e6), 'reason'); eq(b.report(m, a, t, 0, 1e6), 'ok'); eq(b.report(m, a, t, 0, 1e6 + 9000), 'dup');
      eq(b.report(m, a, { id: 4, name: 'U' }, 1, 1e6 + 1000), 'rate'); eq(b.report(m, a, { id: 4, name: 'U' }, 1, 1e6 + 9000), 'ok'); eq(b.report(m, a, { id: 5, name: 'V' }, 1, 1e6 + 20000), 'ok'); eq(b.report(m, a, { id: 6, name: 'W' }, 1, 1e6 + 30000), 'limit');
      eq(b.total(), 3); eq(m.reports.length, 3);
    }],
  ]);

  await group('private rooms: only the same code meets; the host starts early; bots fill the rest and are marked', { GK_MATCH_SIZE: '4', GK_QUEUE_MS: '60000', GK_PRIVATE_MS: '60000' }, async srv => {
    const a = await connectRaw(srv.port, 'room=abcd'), b = await connectRaw(srv.port, 'room=ABCD'), c = await connectRaw(srv.port), d = await connectRaw(srv.port, 'room=WXYZ');
    await b.until(x => x.state.queue && x.state.queue.n === 2, 2000, 'two in the room'); await Promise.all([a, c, d].map(x => x.until(y => y.state.queue, 2000, 'queue info')));
    eq(a.state.queue.room, 'ABCD', 'codes are upper-cased'); eq(b.state.queue.room, 'ABCD'); eq(c.state.queue.n, 1, 'a public player is alone'); assert(!c.state.queue.room, 'public queue has no room'); eq(d.state.queue.room, 'WXYZ'); eq(d.state.queue.n, 1);
    eq(b.state.queue.bots, 2, 'the queue says how many seats become bots'); eq(b.state.queue.ms, 60000);
    await a.until(x => x.state.host === 1, 1000, 'host'); assert(b.state.host !== 1, 'only the first player is the host');
    b.send({ start: 1 }); await sleep(300); assert(!a.state.matchStart, 'a non-host cannot start');
    a.send({ start: 1 }); await Promise.all([a, b].map(x => x.until(y => y.state.matchStart, 3000, 'matchStart')));
    const ps = a.state.matchStart.players; eq(ps.length, 4, 'filled to a full match'); eq(ps.filter(p => p.bot).length, 2, 'the rest are bots, flagged'); assert(!c.state.matchStart && !d.state.matchStart, 'others still wait');
    for (const x of [a, b, c, d]) await x.close();
  });

  await group('quick chat and reports: fixed phrases only, rate limited, bots and self cannot be reported', { GK_MATCH_SIZE: '8', GK_QUEUE_MS: '1200' }, async srv => {
    const a = await connectRaw(srv.port, 'name=Alpha'), b = await connectRaw(srv.port, 'name=Beta'); const c = await connectRaw(srv.port, 'name=Gamma');
    await Promise.all([a, b, c].map(x => x.until(y => y.state.matchStart, 3000, 'matchStart'))); for (const x of [a, b, c]) x.send({ ready: 1 });
    await Promise.all([a, b, c].map(x => x.until(y => y.state.countdown, 3000, 'countdown'))); await sleep(200);
    a.send({ say: 4 }); a.send({ say: 5 }); a.send({ say: 'hi' }); a.send({ say: 99 });
    await b.until(x => x.msgs.some(m => m.say), 1000, 'say relayed'); await sleep(200);
    const got = b.msgs.filter(m => m.say); eq(got.length, 1, 'one phrase per 1.5 s, bad values dropped'); eq(got[0].say.n, 4); eq(got[0].say.name, 'Alpha'); assert(!a.msgs.some(m => m.say), 'the sender is not echoed');
    const bId = b.state.matchStart.players.find(p => p.name === 'Beta').id, botId = b.state.matchStart.players.find(p => p.bot).id, aId = a.state.matchStart.players.find(p => p.name === 'Alpha').id;
    a.send({ report: { id: bId, r: 1 } }); await a.until(x => x.state.reported, 1000, 'report ack'); eq(a.state.reported, 'ok');
    a.send({ report: { id: bId, r: 1 } }); await sleep(100); a.state.reported = null; await sleep(4300);
    a.send({ report: { id: bId, r: 2 } }); await a.until(x => x.state.reported, 1000, 'dup ack'); eq(a.state.reported, 'dup'); a.state.reported = null;
    a.send({ report: { id: botId, r: 0 } }); await a.until(x => x.state.reported, 1000, 'bot ack'); eq(a.state.reported, 'bot'); a.state.reported = null;
    a.send({ report: { id: aId, r: 0 } }); await a.until(x => x.state.reported, 1000, 'self ack'); eq(a.state.reported, 'self');
    a.send({ report: 'x' }); a.send({ report: null }); a.send({ report: { id: 'zz', r: 0 } }); await sleep(200);
    const h = await getJson(srv.port, '/healthz'); eq(h.reports, 1, 'one report counted'); assert(h.ok && Number.isFinite(h.heapMb) && Number.isInteger(h.humans) && h.errors === 0, 'healthz carries humans, heap, error counters: ' + JSON.stringify(h));
    for (const x of [a, b, c]) await x.close();
  });

  await group('join flood: the per-address burst limit refuses with 429; X-Forwarded-For (last hop) picks the address behind a proxy', { GK_TRUST_PROXY: '1', GK_CONN_BURST: '3', GK_CONN_EVERY_MS: '600000', GK_MAX_PER_IP: '50' }, async srv => {
    const keep = [];
    for (let i = 0; i < 3; i++) { const r = await tryWs(srv.port, { 'x-forwarded-for': '9.9.9.9' }); assert(r.ok, 'burst connection ' + i); keep.push(r.ws); }
    const r4 = await tryWs(srv.port, { 'x-forwarded-for': '9.9.9.9' }); eq(r4.ok, false); eq(r4.status, 429);
    const forged = await tryWs(srv.port, { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }); eq(forged.status, 429, 'a forged leading entry does not give a fresh address');
    const other = await tryWs(srv.port, { 'x-forwarded-for': '8.8.8.8' }); assert(other.ok, 'another client behind the proxy is unaffected'); keep.push(other.ws);
    const noh = await tryWs(srv.port, {}); assert(noh.ok, 'no header: the socket address (127.0.0.1) has its own bucket'); keep.push(noh.ws);
    const h = await getJson(srv.port, '/healthz'); assert(h.refusedConnections >= 2, 'refusals are counted: ' + h.refusedConnections);
    for (const w of keep) w.terminate();
  });

  await group('without GK_TRUST_PROXY the header is ignored: one socket address, one bucket', { GK_CONN_BURST: '2', GK_CONN_EVERY_MS: '600000', GK_MAX_PER_IP: '50' }, async srv => {
    const keep = []; for (const ip of ['1.1.1.1', '2.2.2.2']) { const r = await tryWs(srv.port, { 'x-forwarded-for': ip }); assert(r.ok); keep.push(r.ws); }
    const r3 = await tryWs(srv.port, { 'x-forwarded-for': '3.3.3.3' }); eq(r3.status, 429, 'spoofing the header does not help'); for (const w of keep) w.terminate();
  });

  process.exit(fail ? 1 : 0);
})();

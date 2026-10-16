// security: signed character tokens, origin / per-IP / match limits, static serving and headers, speed-hack kicks (see docs/reports/security.md)
const L = require('./lib.js'), { connect, connectRaw, sleep, assert, eq } = L, W = require('../world.js');
const crypto = require('crypto'), http = require('http'), WebSocket = require('ws');
const SECRET = 'test-secret-123';
const tok = (o, secret = SECRET) => { const body = Buffer.from(JSON.stringify(o)).toString('base64url'); return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url'); };
const get = (port, path, method = 'GET') => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port, path, method }, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => res({ status: x.statusCode, headers: x.headers, body: b })); }); r.on('error', rej); r.end(); });
const wsOpen = (port, headers = {}, q = '') => new Promise(res => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/' + q, { headers }); ws.on('open', () => res({ ok: true, ws })); ws.on('unexpected-response', (rq, rs) => res({ ok: false, status: rs.statusCode })); ws.on('error', () => {}); });
const join = async (port, q) => { const c = await connectRaw(port, q); await c.until(x => x.state.queue, 2000, 'queue msg'); return c; };

(async () => {
  const prod = await L.startServer({ GK_DEBUG: '', GK_SECRET: SECRET }), dbg = await L.startServer({ GK_SECRET: SECRET });   // prod: no GK_DEBUG, so ?goblin= and ?wins= must be ignored
  const origins = await L.startServer({ GK_ORIGINS: 'https://play.example, https://www.play.example' }), ip8 = await L.startServer({ GK_MAX_PER_IP: '8' });
  const cap = await L.startServer({ GK_MAX_MATCHES: '2', GK_MATCH_SIZE: '8' }), life = await L.startServer({ GK_MATCH_LIFE_MS: '1500' }); let fail = 1;
  try {
    fail = await L.run('security', [
      ['token: a valid token gives its goblin, wins and name; client-sent goblin and wins are ignored', async () => {
        const c = await join(prod.port, 'ctoken=' + tok({ c: 'abc', g: 3, w: 7, n: 'Zed' }) + '&goblin=0&wins=0&name=Hacker');
        eq(c.state.goblin, 3); eq(c.state.wins, 7); assert(!c.state.unverified, 'no notice for a valid token'); await c.close();
      }],
      ['token: tampered, foreign-secret, garbage and empty tokens are rejected (fresh roll, wins 0, notice)', async () => {
        const good = tok({ c: 'abc', g: 4, w: 7, n: 'Zed' }), [body, sig] = good.split('.');
        const bad = [Buffer.from(JSON.stringify({ c: 'abc', g: 4, w: 99, n: 'Zed' })).toString('base64url') + '.' + sig, tok({ c: 'abc', g: 4, w: 7, n: 'Zed' }, 'other-secret'), 'garbage', body + '.', '', good + 'x'];
        for (const t of bad) { const c = await join(prod.port, 'ctoken=' + encodeURIComponent(t) + '&goblin=4&wins=500'); eq(c.state.wins, 0, 'wins for ' + t.slice(0, 12)); eq(c.state.unverified, 1, 'notice for ' + t.slice(0, 12)); await c.close(); }
      }],
      ['no token: ?goblin= and ?wins= are ignored without GK_DEBUG (server rolls)', async () => {
        const seen = new Set();
        for (let i = 0; i < 12; i++) { const c = await join(prod.port, 'goblin=4&wins=999'); eq(c.state.wins, 0); seen.add(c.state.goblin); assert(!c.state.unverified); await c.close(); }
        assert([...seen].some(g => g !== 4), 'the server rolled the type: ' + [...seen]);
      }],
      ['win: the server issues a token that verifies and carries wins + 1', async () => {
        const c = await connect(dbg.port, 'goblin=2'); const g = c.state.goblin; c.send({ win: 1 }); await c.until(x => x.state.won, 3000, 'won');
        const t = c.state.won.ctoken; assert(typeof t === 'string' && t.includes('.'), 'token issued'); const [body, sig] = t.split('.');
        eq(sig, crypto.createHmac('sha256', SECRET).update(body).digest('base64url'), 'signature'); const o = JSON.parse(Buffer.from(body, 'base64url').toString());
        eq([o.g, o.w], [2, 1]); assert(typeof g === 'number'); await c.close();
        const d = await join(prod.port, 'ctoken=' + t); eq([d.state.goblin, d.state.wins], [2, 1]); await d.close();
      }],
      ['origin: foreign Origin is rejected, same-host and localhost are allowed', async () => {
        const bad = await wsOpen(prod.port, { Origin: 'http://evil.example' }); eq(bad.ok, false); eq(bad.status, 403);
        const ok1 = await wsOpen(prod.port, { Origin: 'http://127.0.0.1:' + prod.port }); assert(ok1.ok); ok1.ws.close();
        const ok2 = await wsOpen(prod.port, { Origin: 'http://localhost:9999' }); assert(ok2.ok); ok2.ws.close();
        const ok3 = await wsOpen(prod.port, { Host: 'game.example', Origin: 'https://game.example' }); assert(ok3.ok, 'Origin host equals Host header'); ok3.ws.close();
      }],
      ['origin: GK_ORIGINS allow-list replaces the default', async () => {
        const a = await wsOpen(origins.port, { Origin: 'https://play.example' }); assert(a.ok); a.ws.close();
        const b = await wsOpen(origins.port, { Origin: 'http://127.0.0.1:' + origins.port }); eq(b.ok, false);
        const c = await wsOpen(origins.port, { Origin: 'https://evil.example' }); eq(c.ok, false);
      }],
      ['per-IP: the 9th socket from one IP is rejected, a slot frees up when one closes', async () => {
        const open = []; for (let i = 0; i < 8; i++) { const r = await wsOpen(ip8.port); assert(r.ok, 'socket ' + (i + 1)); open.push(r.ws); }
        const nine = await wsOpen(ip8.port); eq(nine.ok, false); eq(nine.status, 429);
        open[0].close(); await sleep(200); const again = await wsOpen(ip8.port); assert(again.ok, 'slot freed'); again.ws.close(); open.forEach(w => w.close());
      }],
      ['match cap: over GK_MAX_MATCHES the queue answers busy and closes; joining an open queue still works', async () => {
        const a = await join(cap.port, 'wins=0'), b = await join(cap.port, 'wins=1000');
        const c = await connectRaw(cap.port, 'wins=5000'); await c.until(x => x.state.busy, 2000, 'busy'); eq(c.state.busy, 1); await c.until(x => x.closed, 2000, 'closed'); assert(!c.state.queue);
        const d = await join(cap.port, 'wins=0'); assert(d.state.queue.n === 2, 'joined the existing queue match'); await a.close(); await b.close(); await d.close();
      }],
      ['static: unknown paths are 404, only / and /index.html return the page, traversal is refused', async () => {
        for (const p of ['/index.htm', '/foo', '/server.js', '/package.json', '/tests/lib.js', '/game.js.map', '/three/addons/../../package.json', '/three/addons/%2e%2e/%2e%2e/package.json', '/three/addons/', '/three/other.js', '/nope.js', '/client/nope.js', '/client/ui/../../server.js', '/client/%2e%2e/server.js', '/client/ui/tags.txt', '/client/']) eq((await get(prod.port, p)).status, 404, p);
        for (const p of ['/', '/index.html', '/?x=1', '/game.js', '/menu.js', '/save.js', '/client/ui/tags.js', '/three/three.module.js', '/three/addons/postprocessing/EffectComposer.js']) eq((await get(prod.port, p)).status, 200, p);
        eq((await get(prod.port, '/', 'POST')).status, 404);
      }],
      ['static: security headers, a CSP with script hashes and no unsafe-inline for scripts', async () => {
        for (const p of ['/', '/game.js', '/three/three.module.js', '/missing']) { const r = await get(prod.port, p); eq(r.headers['x-content-type-options'], 'nosniff', p); eq(r.headers['referrer-policy'], 'same-origin', p); }
        const r = await get(prod.port, '/'), csp = r.headers['content-security-policy'], script = csp.split(';').find(s => s.trim().startsWith('script-src'));
        assert(script.includes("'self'") && !script.includes('unsafe-inline') && !script.includes('unsafe-eval'), script); eq((script.match(/'sha256-/g) || []).length, 2, 'importmap + module script hashes');
        for (const m of r.body.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) assert(script.includes("'sha256-" + crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, "\n")).digest('base64') + "'"), 'hash of an inline script');
        assert(csp.includes("default-src 'self'") && csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'"));
        assert(r.headers['cache-control'] && (await get(prod.port, '/three/three.module.js')).headers['cache-control'].includes('max-age'));
      }],
      ['static: a missing or unreadable file is a 404 and the server stays up', async () => {
        for (const p of ['/three/addons/does/not/exist.js', '/three/addons/utils', '/three/addons/environments']) eq((await get(prod.port, p)).status, 404, p);
        eq((await get(prod.port, '/three/addons/does/not/exist.js')).status, 404, 'cached miss'); eq((await get(prod.port, '/', 'HEAD')).status, 200); assert(prod.alive()); const c = await join(prod.port); await c.close();
      }],
      ['speed hack: a teleporting client is corrected, then kicked with {kicked:"movement"}', async () => {
        const c = await connect(dbg.port, 'goblin=0'), [cx, cz] = W.rc(1); c.send({ tp: [cx, cz] }); await sleep(100);
        for (let i = 0; i < 100 && !c.closed; i++) { c.send({ m: [cx + (i % 2 ? 6 : -6), cz, 0] }); await sleep(50); }
        await c.until(x => x.state.kicked === 'movement', 2000, 'kicked'); await c.until(x => x.closed, 2000, 'socket closed'); assert(dbg.out().includes('kick: player'), 'log line'); assert(dbg.alive());
      }],
      ['speed hack: a legit sprinter at 7.8 m/s for 10 s (back and forth in a room) is never corrected or kicked', async () => {
        const c = await connect(dbg.port, 'goblin=4'), [cx, cz] = W.rc(1), n0 = c.msgs.length; c.send({ tp: [cx - 6, cz] }); await sleep(100);
        const V = 7.8, HALF = 6, LEG = 2 * HALF / V, t0 = Date.now();   // triangle wave: 12 m legs
        while (Date.now() - t0 < 10000) { const t = (Date.now() - t0) / 1000, ph = (t / LEG) % 2, u = ph < 1 ? ph : 2 - ph; c.send({ m: [+(cx - HALF + 2 * HALF * u).toFixed(2), cz, 0] }); await sleep(66); }
        await sleep(150); eq(c.msgs.slice(n0).filter(m => m.fix).length, 0, 'no corrections'); assert(!c.state.kicked && !c.closed, 'not kicked'); await c.close();
      }],
      ['lifetime: a match past GK_MATCH_LIFE_MS is decided by the round-10 rule', async () => {
        const c = await connect(life.port, 'goblin=0'); await c.until(x => x.state.matchEnd, 6000, 'matchEnd'); assert(c.state.matchEnd.timeLimit === 1, 'decided by the time limit'); await c.close();
      }],
    ]);
  } finally { for (const s of [prod, dbg, origins, ip8, cap, life]) s.stop(); }
  process.exit(fail ? 1 : 0);
})();

// release: the production build (tools/build.js) and its serving (release.js): ops endpoints, pages, 404s, dist/ with hashed immutable files,
// compression, the page CSP over the rewritten import map, the stale-build fallback, and the dev server never touching dist/ (docs/RELEASE.md)
const L = require('./lib.js'), { assert, eq } = L;
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto'), zlib = require('zlib'), { execFileSync } = require('child_process');
const get = (port, p, headers = {}, method = 'GET') => new Promise((res, rej) => { const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, x => { const b = []; x.on('data', d => b.push(d)); x.on('end', () => res({ status: x.statusCode, headers: x.headers, buf: Buffer.concat(b), body: Buffer.concat(b).toString() })); }); r.on('error', rej); r.end(); });
const hashOf = s => "'sha256-" + crypto.createHash('sha256').update(s.replace(/\r\n?/g, '\n')).digest('base64') + "'";

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gkrel-')), out = path.join(tmp, 'dist'), stale = path.join(tmp, 'stale');
  execFileSync(process.execPath, [path.join(L.ROOT, 'tools/build.js'), '--out', out, '--fast', '--no-vendor'], { stdio: 'pipe' });
  fs.cpSync(out, stale, { recursive: true });
  const sm = JSON.parse(fs.readFileSync(path.join(stale, 'manifest.json'), 'utf8')); sm.files['/game.js'].src = 'x'.repeat(64); fs.writeFileSync(path.join(stale, 'manifest.json'), JSON.stringify(sm));
  const dev = await L.startServer({ GK_DIST: '' }), prod = await L.startServer({ GK_DIST: '1', GK_DIST_DIR: out }), old = await L.startServer({ GK_DIST: '1', GK_DIST_DIR: stale });
  const pkg = JSON.parse(fs.readFileSync(path.join(L.ROOT, 'package.json'), 'utf8')), man = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
  let fail = 1;
  try {
    fail = await L.run('release', [
      ['healthz and version answer JSON, never cached', async () => {
        const h = await get(dev.port, '/healthz'), v = await get(dev.port, '/version');
        eq(h.status, 200); const hj = JSON.parse(h.body); eq(hj.ok, true); eq(hj.status, 'ok'); assert(Number.isInteger(hj.matches) && Number.isInteger(hj.sockets), 'counts'); eq(h.headers['cache-control'], 'no-store');
        const vj = JSON.parse(v.body); eq(vj.version, pkg.version); eq(vj.name, 'Goblin King'); eq(vj.dist, false); eq(h.headers['x-content-type-options'], 'nosniff');
      }],
      ['pages: privacy, favicon, manifest, robots; repo files stay 404', async () => {
        const pr = await get(dev.port, '/privacy'); eq(pr.status, 200); assert(/text\/html/.test(pr.headers['content-type']) && /Privacy/.test(pr.body)); assert(pr.headers['content-security-policy'].includes("default-src 'self'"), 'csp');
        eq((await get(dev.port, '/favicon.svg')).headers['content-type'], 'image/svg+xml'); eq((await get(dev.port, '/manifest.webmanifest')).status, 200); eq((await get(dev.port, '/robots.txt')).status, 200);
        for (const p of ['/release.js', '/pages/privacy.html', '/tools/build.js', '/tools/smoke.js', '/dist/index.html', '/dist/manifest.json', '/manifest.json', '/client/boot.js.map', '/.gk-secret', '/.env']) eq((await get(dev.port, p)).status, 404, p);
        eq((await get(dev.port, '/client/boot.js')).status, 200, 'boot script');
      }],
      ['404: an HTML page for browsers, plain text otherwise, both with the security headers', async () => {
        const a = await get(dev.port, '/nope', { accept: 'text/html,*/*' }), b = await get(dev.port, '/nope');
        eq(a.status, 404); assert(/text\/html/.test(a.headers['content-type']) && /Back to Goblin King/.test(a.body), 'html 404'); eq(b.status, 404); eq(b.body, 'Not found'); eq(b.headers['x-content-type-options'], 'nosniff');
      }],
      ['development never serves dist/ and never compresses', async () => {
        const r = await get(dev.port, '/game.js', { 'accept-encoding': 'br, gzip' }); eq(r.status, 200); assert(!r.headers['content-encoding'], 'no encoding in dev'); eq(r.headers['cache-control'], 'no-cache');
        eq(r.body, fs.readFileSync(path.join(L.ROOT, 'game.js'), 'utf8')); eq((await get(dev.port, man.files['/game.js'].hashed)).status, 404, 'hashed name unknown in dev');
      }],
      ['dist: the page points at hashed files, which are immutable; the plain names still work (no-cache, minified)', async () => {
        const v = JSON.parse((await get(prod.port, '/version')).body); eq(v.dist, true);
        const page = await get(prod.port, '/'); eq(page.status, 200); eq(page.headers['cache-control'], 'no-cache');
        const srcs = [...page.body.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]); assert(srcs.length >= 5, 'script tags');
        for (const s of srcs) assert(/\.[0-9a-f]{10}\.js$/.test(s), 'hashed src ' + s);
        const im = JSON.parse(page.body.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports; eq(im['/game.js'], man.files['/game.js'].hashed); eq(im.three, '/three/three.module.js');
        const h = await get(prod.port, man.files['/game.js'].hashed); eq(h.status, 200); eq(h.headers['cache-control'], 'public, max-age=31536000, immutable');
        const plain = await get(prod.port, '/game.js'); eq(plain.headers['cache-control'], 'no-cache'); eq(plain.body, h.body); assert(plain.buf.length < fs.statSync(path.join(L.ROOT, 'game.js')).size * 0.9, 'minified');
        eq((await get(prod.port, '/client/ui/tags.js')).status, 200); eq((await get(prod.port, '/three/three.module.js')).status, 200, 'three from node_modules');
        eq((await get(prod.port, '/manifest.json')).status, 404); eq((await get(prod.port, '/maps/game.js.map')).status, 404, 'source maps are not served');
      }],
      ['dist: Brotli or gzip by Accept-Encoding, identical bytes after decoding', async () => {
        const raw = (await get(prod.port, '/game.js')).buf;
        const br = await get(prod.port, '/game.js', { 'accept-encoding': 'gzip, deflate, br' }); eq(br.headers['content-encoding'], 'br'); eq(br.headers.vary, 'accept-encoding'); assert(zlib.brotliDecompressSync(br.buf).equals(raw), 'br body');
        const gz = await get(prod.port, '/game.js', { 'accept-encoding': 'gzip' }); eq(gz.headers['content-encoding'], 'gzip'); assert(zlib.gunzipSync(gz.buf).equals(raw), 'gz body'); assert(+gz.headers['content-length'] === gz.buf.length, 'length');
        const cx = await get(prod.port, '/codex', { 'accept-encoding': 'gzip' }); if (cx.status === 200) eq(cx.headers['content-encoding'], 'gzip', 'codex compressed');
        const hd = await get(prod.port, '/game.js', { 'accept-encoding': 'br' }, 'HEAD'); eq(hd.status, 200); eq(hd.buf.length, 0);
      }],
      ['dist: the page CSP allows exactly its own inline scripts (the rewritten import map), still no unsafe-inline', async () => {
        const page = await get(prod.port, '/'), csp = page.headers['content-security-policy'], script = csp.split(';').find(s => s.trim().startsWith('script-src'));
        assert(!script.includes('unsafe-inline') && !script.includes('unsafe-eval'), script);
        const inl = [...page.body.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]); eq(inl.length, (script.match(/'sha256-/g) || []).length, 'one hash per inline script');
        for (const s of inl) assert(script.includes(hashOf(s)), 'hash of an inline script');
      }],
      ['a stale build (a source changed after npm run build) is not served: the plain files are', async () => {
        eq(JSON.parse((await get(old.port, '/version')).body).dist, false); assert(/dist: not used/.test(old.out()), 'logged why');
        eq((await get(old.port, '/game.js')).body, fs.readFileSync(path.join(L.ROOT, 'game.js'), 'utf8'));
      }],
      ['every page script is on the CLIENT_JS allow-list or under client/, and every allow-listed file exists', () => {
        const html = fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8'), set = require('../tools/build.js').clientFiles();
        for (const m of html.matchAll(/<script\b[^>]*\ssrc="\/([^"]+)"/g)) assert(set.includes(m[1]), 'served: ' + m[1]);
        const src = fs.readFileSync(path.join(L.ROOT, 'server.js'), 'utf8'), names = [...src.match(/const CLIENT_JS = new Set\(\[([^\]]*)\]\)/)[1].matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1]);
        for (const n of names) assert(fs.existsSync(path.join(L.ROOT, n + '.js')), 'exists: ' + n + '.js');
      }],
      ['RELEASE2: credits page, the new client scripts (dev and dist) and the /healthz health fields', async () => {
        const cr = await get(dev.port, '/credits'); eq(cr.status, 200); assert(/Credits/.test(cr.body) && /OWNER/.test(cr.body) && /three\.js/.test(cr.body) && /SIL Open Font/.test(cr.body), 'credits text with owner placeholders'); assert(cr.body.includes('/privacy'), 'links the privacy page');
        for (const f of ['live', 'access', 'onboard']) { eq((await get(dev.port, '/client/' + f + '.js')).status, 200, f + ' dev'); eq((await get(prod.port, '/client/' + f + '.js')).status, 200, f + ' dist'); assert((await get(dev.port, '/')).body.includes('/client/' + f + '.js'), f + ' is in the page'); }
        eq((await get(dev.port, '/safety.js')).status, 404, 'server-only module stays private'); eq((await get(dev.port, '/tools/soak.js')).status, 404);
        const h = JSON.parse((await get(dev.port, '/healthz')).body); for (const k of ['humans', 'tickMs', 'tickMaxMs', 'heapMb', 'rssMb', 'reports', 'refusedConnections', 'errors']) assert(Number.isFinite(h[k]), 'healthz.' + k + ': ' + JSON.stringify(h));
        const pv = (await get(dev.port, '/privacy')).body; assert(/quick chat/i.test(pv) && /report/i.test(pv) && /bots/i.test(pv) && /30 seconds/.test(pv), 'the privacy page covers the new features');
      }],
      ['RELEASE2: a restart notice: the shutdown hook sends {bye} before close code 1012 (client shows "restarting")', async () => {
        const src = fs.readFileSync(path.join(L.ROOT, 'release.js'), 'utf8'); assert(src.includes('{"bye":"restart"}') && src.includes('1012'), 'release.js shutdown sends bye then 1012');
        const live = fs.readFileSync(path.join(L.ROOT, 'client/live.js'), 'utf8'); assert(live.includes('d.bye') && live.includes('1012') && live.includes("'/version'"), 'client/live.js handles bye, 1012 and the version check');
        const game = fs.readFileSync(path.join(L.ROOT, 'game.js'), 'utf8'); for (const h of ['GKR2.onMsg', 'GKR2.closed', 'GKR2.joinUrl', 'GKR2.muted']) assert(game.includes(h), 'game.js hook ' + h);
      }],
    ]);
  } finally { dev.stop(); prod.stop(); old.stop(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})();

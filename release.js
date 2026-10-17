// RELEASE (docs/RELEASE.md): production serving and the ops endpoints, kept out of server.js so the game code stays readable. Node only, never served to the browser.
//   const REL = require('./release.js')({ root, secHeaders, csp: () => CSP, stats: () => ({ matches, players }) });
//   REL.route(q, r)            -> true when it answered: /healthz, /version, /privacy, /favicon.svg, /manifest.webmanifest, /robots.txt, /og.jpg, and in production the dist/ files
//   REL.send(q, r, 200, h, b)  -> writes a response, Brotli / gzip compressed in production when the client accepts it
//   REL.notFound(q, r)         -> the 404 page (HTML for browsers, plain text otherwise)
//   REL.shutdown(srv, wss)     -> SIGTERM / SIGINT: /healthz turns 503, no new connections, players get close code 1012, exit after GK_DRAIN_MS
// Environment (all optional): NODE_ENV=production, GK_DIST=1 or 'node server.js --production' serves dist/ (npm run build) when it matches the sources (GK_DIST=0 never does), GK_DIST_DIR overrides
// the folder, GK_LOG=json writes one JSON object per log line, GK_DRAIN_MS (default 2000) is the shutdown grace, GK_COMMIT names the build in /version.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib'), util = require('util');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const TYPES = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png' };
const IMMUTABLE = 'public, max-age=31536000, immutable';

function jsonLogs() {   // GK_LOG=json: every console line becomes {"t","level","msg"} (log collectors on Render and friends parse it); the text still contains the original message
  const out = (level, stream) => (...a) => { try { stream.write(JSON.stringify({ t: new Date().toISOString(), level, msg: util.format(...a) }) + '\n'); } catch (e) {} };
  console.log = console.info = out('info', process.stdout); console.warn = out('warn', process.stderr); console.error = out('error', process.stderr); console.debug = out('debug', process.stdout);
}

module.exports = function release(o) {
  const ROOT = o.root, SEC = o.secHeaders || {}, env = process.env;
  if (env.GK_LOG === 'json') jsonLogs();
  const PROD = env.GK_DIST !== '0' && (env.NODE_ENV === 'production' || env.GK_DIST === '1' || process.argv.includes('--production'));
  const DIST = path.resolve(ROOT, env.GK_DIST_DIR || 'dist'), PAGES = path.join(ROOT, 'pages'), T0 = Date.now();
  let draining = false;

  // ---- version: package.json, plus the commit (env, the build manifest, or .git/HEAD) ----
  const pkg = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')); } catch (e) { return {}; } })();
  let man = null; try { man = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.json'), 'utf8')); } catch (e) {}
  const gitHead = () => { try { let h = fs.readFileSync(path.join(ROOT, '.git/HEAD'), 'utf8').trim(); if (h.startsWith('ref: ')) h = fs.readFileSync(path.join(ROOT, '.git', h.slice(5)), 'utf8').trim(); return /^[0-9a-f]{7,40}$/.test(h) ? h : ''; } catch (e) { return ''; } };
  const VERSION = { name: 'Goblin King', version: pkg.version || '0.0.0', commit: String(env.GK_COMMIT || env.RENDER_GIT_COMMIT || (man && man.commit) || gitHead()).slice(0, 12), builtAt: man && man.builtAt || null, node: process.version };

  // ---- dist/: loaded once into memory, only when every source still matches the build ----
  const files = new Map();   // url -> { body, br, gz, type, cc }
  let distOn = false, distWhy = PROD ? '' : 'development';
  if (PROD) {
    try {
      if (!man) throw new Error('no ' + path.relative(ROOT, DIST) + '/manifest.json (run npm run build)');
      if (sha(fs.readFileSync(path.join(ROOT, 'index.html'))) !== man.html.src) throw new Error('index.html changed since the build');
      const read = f => { try { return fs.readFileSync(f); } catch (e) { return null; } };
      for (const [url, f] of Object.entries(man.files)) {
        const src = read(path.join(ROOT, f.from)); if (!src || sha(src) !== f.src) throw new Error(f.from + ' changed since the build');
        for (const u of new Set([url, f.hashed])) {
          const rel = u.slice(1), body = read(path.join(DIST, rel)); if (!body) throw new Error('dist is missing ' + rel);
          files.set(u, { body, br: read(path.join(DIST, rel + '.br')), gz: read(path.join(DIST, rel + '.gz')), type: TYPES['.js'], cc: u === f.hashed ? IMMUTABLE : 'no-cache' });
        }
      }
      const html = read(path.join(DIST, 'index.html')); if (!html) throw new Error('dist is missing index.html');
      files.set('/index.html', { body: html, br: read(path.join(DIST, 'index.html.br')), gz: read(path.join(DIST, 'index.html.gz')), type: TYPES['.html'], cc: 'no-cache', page: 1 });
      distOn = true; distWhy = 'build ' + (man.commit || '?').slice(0, 7) + ' from ' + man.builtAt;
    } catch (e) { files.clear(); distWhy = e.message; console.warn('dist: not used, serving the source files (' + e.message + ')'); }
  }
  // the dist page has its own inline scripts (the rewritten import map): its CSP carries their hashes
  let pageCsp = null, pageCspFor = null;
  const cspForPage = body => {
    const base = o.csp(); if (pageCspFor === base) return pageCsp;
    const hs = [...body.toString().matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + crypto.createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64') + "'");
    pageCspFor = base; pageCsp = base.replace(/script-src [^;]*/, "script-src 'self' " + hs.join(' ')); return pageCsp;
  };

  // ---- small static pages and icons (pages/), read once ----
  const PAGE_URLS = { '/privacy': 'privacy.html', '/terms': 'privacy.html', '/favicon.svg': 'favicon.svg', '/favicon.ico': 'favicon.svg', '/manifest.webmanifest': 'manifest.webmanifest', '/robots.txt': 'robots.txt', '/og.jpg': 'og.jpg' };
  const pageCache = new Map();
  const pageFile = name => { if (!pageCache.has(name)) { let e = null; try { e = { body: fs.readFileSync(path.join(PAGES, name)), type: TYPES[path.extname(name)] || 'application/octet-stream', cc: /\.(svg|jpg|png)$/.test(name) ? 'public, max-age=86400' : 'no-cache' }; } catch (err) {} pageCache.set(name, e); } return pageCache.get(name); };

  // ---- compression: precompressed dist copies, else compressed once and remembered (production only, text types only) ----
  const zc = new WeakMap();
  function encode(q, e) {
    if (!PROD || !e || !e.body || e.body.length < 1024 || !/^(text\/|application\/(json|manifest)|image\/svg)/.test(e.type)) return null;
    const ae = String(q.headers['accept-encoding'] || ''), br = /\bbr\b/.test(ae), gz = /\bgzip\b/.test(ae);
    if (!br && !gz) return null;
    let z = zc.get(e.body); if (!z) { z = { br: e.br || null, gz: e.gz || null }; zc.set(e.body, z); }
    if (br) { if (!z.br) z.br = zlib.brotliCompressSync(e.body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }); return { enc: 'br', body: z.br }; }
    if (!z.gz) z.gz = zlib.gzipSync(e.body, { level: 6 }); return { enc: 'gzip', body: z.gz };
  }
  function send(q, r, status, headers, e) {   // e: { body, type, br?, gz? }
    const h = { ...SEC, ...headers }, z = encode(q, e);
    if (PROD && e && e.body && e.body.length >= 1024) h.vary = 'accept-encoding';
    const body = z ? z.body : e && e.body;
    if (z) h['content-encoding'] = z.enc;
    if (body) h['content-length'] = body.length;
    r.writeHead(status, h); r.end(q.method === 'HEAD' ? undefined : body);
  }
  const json = (q, r, status, obj) => { const body = Buffer.from(JSON.stringify(obj)); r.writeHead(status, { ...SEC, 'content-type': TYPES['.json'], 'cache-control': 'no-store', 'content-length': body.length }); r.end(q.method === 'HEAD' ? undefined : body); };

  function route(q, r) {
    if (q.method !== 'GET' && q.method !== 'HEAD') return false;
    const p = String(q.url || '/').split('?')[0].split('#')[0];
    if (p === '/healthz') { let s = {}; try { s = o.stats ? o.stats() : {}; } catch (e) {} json(q, r, draining ? 503 : 200, { ok: !draining, status: draining ? 'draining' : 'ok', uptime: Math.round((Date.now() - T0) / 1000), dist: distOn, ...s }); return true; }
    if (p === '/version') { json(q, r, 200, { ...VERSION, dist: distOn }); return true; }
    if (PAGE_URLS[p]) { const e = pageFile(PAGE_URLS[p]); if (!e) return false; send(q, r, 200, { 'content-type': e.type, 'cache-control': e.cc, 'content-security-policy': o.csp() }, e); return true; }
    if (distOn) {
      const e = files.get(p === '/' ? '/index.html' : p); if (!e) return false;
      send(q, r, 200, { 'content-type': e.type, 'cache-control': e.cc, 'content-security-policy': e.page ? cspForPage(e.body) : o.csp() }, e); return true;
    }
    return false;
  }
  const NF_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found - Goblin King</title><link rel="icon" href="/favicon.svg">'
    + '<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0b0e;color:#efe9d8;font:18px/1.5 Georgia,serif;text-align:center}h1{color:#f5c451;font-size:44px;margin:0 0 8px;letter-spacing:.06em}a{color:#f5c451}</style></head>'
    + '<body><main><h1>Lost in the tunnels</h1><p>There is nothing at this address.</p><p><a href="/">Back to Goblin King</a></p></main></body></html>';
  function notFound(q, r) {
    const html = /text\/html/.test(String(q.headers.accept || ''));
    const e = { body: Buffer.from(html ? NF_HTML : 'Not found'), type: html ? TYPES['.html'] : 'text/plain' };
    send(q, r, 404, { 'content-type': e.type, 'cache-control': 'no-cache', ...(html ? { 'content-security-policy': o.csp() } : null) }, e);
  }
  function shutdown(srv, getWss) {
    const MS = /^\d+$/.test(env.GK_DRAIN_MS || '') ? +env.GK_DRAIN_MS : 2000;
    const go = sig => {
      if (draining) { console.warn('shutdown: second ' + sig + ', exiting now'); process.exit(0); }
      draining = true; console.log('shutdown: ' + sig + ', closing (' + MS + ' ms grace)');
      try { srv.close(); } catch (e) {}
      const wss = getWss && getWss(); if (wss) for (const ws of wss.clients) { try { ws.close(1012, 'Server restarting'); } catch (e) {} }
      setTimeout(() => process.exit(0), MS).unref();
    };
    process.on('SIGTERM', () => go('SIGTERM')); process.on('SIGINT', () => go('SIGINT'));
  }
  return { route, send, notFound, shutdown, PROD, VERSION, dist: () => ({ on: distOn, why: distWhy }), draining: () => draining };
};

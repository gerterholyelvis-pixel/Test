// RELEASE: production build (npm run build). Minifies every client script into dist/ and writes a content-hashed copy of each one next to it.
//   node tools/build.js [--out dist] [--fast]      (--fast: lower Brotli quality, for the tests)
// Layout of dist/:
//   index.html               the page; <script src> tags point at the hashed files and the import map remaps every "/x.js" module specifier to "/x.<hash>.js",
//                            so import('/game.js') and friends load the hashed file without touching the game code
//   x.js, client/ui/tags.js  minified, served at the ORIGINAL path with no-cache (relative URLs such as new URL('iconworker.js', import.meta.url) keep working)
//   x.<hash>.js              the same bytes, served with a one-year immutable cache
//   *.br, *.gz               precompressed copies (the server picks one from Accept-Encoding)
//   maps/*.map               source maps, NOT served and not referenced from the files (keep them for reading production stack traces)
//   manifest.json            version, commit, build time, and for every file its URL, hashed URL and the SHA-256 of the source it was built from
// The server (release.js) serves dist only when NODE_ENV=production or GK_DIST=1 AND every source hash in the manifest still matches the working tree;
// otherwise it logs why and serves the plain files as in development. Development (npm start without NODE_ENV) never reads dist.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const OUT = path.resolve(ROOT, String(arg('out', 'dist'))), FAST = !!arg('fast', false);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// the client files: server.js's CLIENT_JS allow-list (root *.js) plus every client/**/*.js module
function clientFiles() {
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8'), m = src.match(/const CLIENT_JS = new Set\(\[([^\]]*)\]\)/);
  if (!m) throw new Error('CLIENT_JS not found in server.js');
  const names = [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1] + '.js');
  const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(d + '/' + e.name) : /^[a-z0-9_-]+\.js$/.test(e.name) ? [d + '/' + e.name] : []);
  return names.concat(fs.existsSync(path.join(ROOT, 'client')) ? walk('client') : []).filter(f => fs.existsSync(path.join(ROOT, f)));
}
function version() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  let commit = process.env.GK_COMMIT || process.env.RENDER_GIT_COMMIT || '';
  if (!commit) try { commit = require('child_process').execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
  return { name: 'Goblin King', version: pkg.version, commit: commit.slice(0, 12), builtAt: new Date().toISOString() };
}
function compress(file, body) {
  if (body.length < 1024) return;
  fs.writeFileSync(file + '.br', zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: FAST ? 5 : 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length } }));
  fs.writeFileSync(file + '.gz', zlib.gzipSync(body, { level: 9 }));
}
async function build() {
  let esbuild = null; try { esbuild = require('esbuild'); } catch (e) { console.warn('build: esbuild is not installed (npm install --include=dev): copying the scripts unminified'); }
  const t0 = Date.now(), files = clientFiles(), man = { ...version(), files: {} };
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'maps'), { recursive: true });
  let inB = 0, outB = 0, brB = 0;
  for (const rel of files) {
    const srcBuf = fs.readFileSync(path.join(ROOT, rel)), src = srcBuf.toString('utf8');
    let code = src, map = null;
    if (esbuild) {
      // per-file transform, no bundling: bare 'three' imports stay for the import map, classic scripts keep their top-level globals
      const r = await esbuild.transform(src, { loader: 'js', minify: true, legalComments: 'none', sourcemap: 'external', sourcefile: '/' + rel, charset: 'utf8' });
      code = r.code; map = r.map;
    }
    const buf = Buffer.from(code), h = sha(buf).slice(0, 10), hashed = rel.replace(/\.js$/, '.' + h + '.js');
    fs.mkdirSync(path.dirname(path.join(OUT, rel)), { recursive: true });
    fs.writeFileSync(path.join(OUT, rel), buf); fs.writeFileSync(path.join(OUT, hashed), buf);
    compress(path.join(OUT, rel), buf); compress(path.join(OUT, hashed), buf);
    if (map) fs.writeFileSync(path.join(OUT, 'maps', rel.replace(/\//g, '__') + '.map'), map);
    man.files['/' + rel] = { hashed: '/' + hashed, from: rel, src: sha(srcBuf), bytes: buf.length };
    inB += srcBuf.length; outB += buf.length; try { brB += fs.statSync(path.join(OUT, rel + '.br')).size; } catch (e) { brB += buf.length; }
  }
  // three.js: minified copies under a versioned folder (immutable); the addons stay at /three/addons/ and import the same 'three' through the import map
  let threeUrl = null;
  try {
    const tv = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version, dir = 'vendor/three-' + tv;
    fs.mkdirSync(path.join(OUT, dir), { recursive: true });
    for (const f of ['three.module.js', 'three.core.js']) {
      const srcBuf = fs.readFileSync(path.join(ROOT, 'node_modules/three/build', f));
      const buf = esbuild ? Buffer.from((await esbuild.transform(srcBuf.toString('utf8'), { loader: 'js', minify: true, legalComments: 'eof', charset: 'utf8' })).code) : srcBuf;   // eof: keeps the three.js MIT licence line
      fs.writeFileSync(path.join(OUT, dir, f), buf); compress(path.join(OUT, dir, f), buf);
      man.files['/' + dir + '/' + f] = { hashed: '/' + dir + '/' + f, from: 'node_modules/three/build/' + f, src: sha(srcBuf), bytes: buf.length, vendor: 1 };
    }
    threeUrl = '/' + dir + '/three.module.js';
  } catch (e) { console.warn('build: three.js not minified (' + e.message + '), the page keeps /three/three.module.js'); }
  // index.html: hashed <script src> tags and an import map that redirects every module URL to its hashed copy
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html')); let html = htmlSrc.toString('utf8');
  html = html.replace(/(<script\b[^>]*\ssrc=")(\/[^"?#]+\.js)(")/g, (all, a, u, b) => man.files[u] ? a + man.files[u].hashed + b : all);
  html = html.replace(/<script type="importmap">([\s\S]*?)<\/script>/, (all, json) => {
    const map = JSON.parse(json); map.imports = map.imports || {};
    for (const [u, f] of Object.entries(man.files)) if (!map.imports[u] && !f.vendor) map.imports[u] = f.hashed;
    if (threeUrl && map.imports.three === '/three/three.module.js') map.imports.three = threeUrl;
    return '<script type="importmap">' + JSON.stringify(map) + '</script>';
  });
  if (process.env.GK_PUBLIC_URL) html = html.replace(/(<meta property="og:image" content=")\//, '$1' + process.env.GK_PUBLIC_URL.replace(/\/$/, '') + '/');   // share cards need an absolute image URL
  html = html.replace(/<meta name="gk-version" content="[^"]*">/, '').replace('</title>', '</title><meta name="gk-version" content="' + man.version + (man.commit ? '+' + man.commit.slice(0, 7) : '') + '">');
  fs.writeFileSync(path.join(OUT, 'index.html'), html); compress(path.join(OUT, 'index.html'), Buffer.from(html));
  man.html = { src: sha(htmlSrc) };
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(man, null, 1));
  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log('build: ' + files.length + ' scripts, ' + kb(inB) + ' -> ' + kb(outB) + ' minified, ' + kb(brB) + ' brotli, v' + man.version + (man.commit ? ' (' + man.commit.slice(0, 7) + ')' : '') + ', ' + (Date.now() - t0) + ' ms -> ' + path.relative(ROOT, OUT));
  return man;
}
if (require.main === module) build().catch(e => { console.error('build failed:', e.message); process.exit(1); });
module.exports = { build, clientFiles };

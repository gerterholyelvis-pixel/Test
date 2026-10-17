// RELEASE: quality gate (npm run check), a few seconds, no server. Errors fail (exit 1); warnings are printed (--strict makes them fail too).
//   1. syntax: every tracked .js file parses (classic scripts and CommonJS through vm, ES modules through esbuild or node --check)
//   2. no leftover merge-conflict markers in tracked text files
//   3. no secrets: private keys, cloud / GitHub / npm / API tokens, a committed .gk-secret or .env
//   4. index.html vs server.js: every page script is served (CLIENT_JS allow-list or client/), every allow-listed file exists
//   5. docs: relative links in Markdown files point at files that exist (errors for the front-door docs, warnings elsewhere)
//   6. package.json scripts point at files that exist
//   7. debug leftovers in client code (console.log, debugger, TODO in UI text): warnings
const fs = require('fs'), path = require('path'), vm = require('vm'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..'), STRICT = process.argv.includes('--strict');
const errors = [], warns = [], err = (k, m) => errors.push('[' + k + '] ' + m), warn = (k, m) => warns.push('[' + k + '] ' + m);
let tracked;
try { tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString().split('\0').filter(Boolean); }
catch (e) { tracked = []; const walk = d => { for (const e2 of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (/^(node_modules|\.git|dist)$/.test(e2.name)) continue; const r = d ? d + '/' + e2.name : e2.name; if (e2.isDirectory()) walk(r); else tracked.push(r); } }; walk(''); }
tracked = tracked.filter(f => fs.existsSync(path.join(ROOT, f)));
const TEXT = /\.(js|mjs|cjs|json|md|html|css|txt|yaml|yml|svg|webmanifest)$|^\.(gitignore|gitattributes|node-version)$/;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const texts = tracked.filter(f => TEXT.test(path.basename(f)) || TEXT.test(f));

// 1. syntax
let esbuild = null; try { esbuild = require('esbuild'); } catch (e) {}
const isModule = s => /^\s*(import\s[\s\S]*?from\s|import\s*['"*{]|export\s)/m.test(s);
const jobs = [];
for (const f of tracked.filter(f => /\.js$/.test(f) && !/^node_modules\//.test(f))) {
  const s = read(f).replace(/^#!.*/, '');   // a shebang line is fine for node
  if (isModule(s)) {
    if (esbuild) jobs.push(esbuild.transform(s, { loader: 'js', format: 'esm', sourcefile: f, logLevel: 'silent' }).catch(e => err('syntax', f + ': ' + String(e.errors && e.errors[0] ? e.errors[0].text + ' (line ' + (e.errors[0].location || {}).line + ')' : e.message))));
    else try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: s, stdio: ['pipe', 'ignore', 'pipe'] }); } catch (e) { err('syntax', f + ': ' + String(e.stderr || e.message).split('\n').find(l => /Error/.test(l))); }
  } else {
    try { new vm.Script('(function (exports, require, module, __filename, __dirname) {' + s + '\n})', { filename: f }); }
    catch (e) { err('syntax', f + ': ' + e.message); }
  }
}

// 2. conflict markers, 3. secrets
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'], [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'], [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}\b/, 'GitHub token'], [/\bnpm_[A-Za-z0-9]{36}\b/, 'npm token'], [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'], [/\bsk-(ant-|proj-)?[A-Za-z0-9_-]{32,}/, 'API secret key'], [/\brnd_[A-Za-z0-9]{20,}\b/, 'Render API key'],
  [/\bGK_SECRET\s*[=:]\s*['"]?[0-9a-f]{32,}/i, 'a real-looking GK_SECRET'],
];
for (const f of texts) {
  if (f === 'tools/check.js') continue;
  const s = read(f);
  if (/^<<<<<<< /m.test(s) || /^>>>>>>> /m.test(s)) err('conflict', f + ': merge-conflict markers');
  for (const [re, what] of SECRETS) if (re.test(s)) err('secret', f + ': looks like a ' + what);
}
for (const f of tracked) if (/(^|\/)(\.gk-secret|\.env(\..*)?|id_rsa|.*\.pem|.*\.key)$/.test(f)) err('secret', f + ': this file must not be committed');

// 4. page scripts vs the server allow-list
const server = read('server.js'), cm = server.match(/const CLIENT_JS = new Set\(\[([^\]]*)\]\)/);
if (!cm) err('client', 'CLIENT_JS not found in server.js');
else {
  const allow = new Set([...cm[1].matchAll(/'([^']+)'/g)].map(x => x[1])), html = read('index.html');
  const served = u => { const m = u.match(/^\/([a-z0-9-]+)\.js$/); if (m) return allow.has(m[1]); return /^\/client\/([a-z0-9_-]+\/)*[a-z0-9_-]+\.js$/.test(u) && fs.existsSync(path.join(ROOT, u.slice(1))); };
  for (const m of html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)) if (!served(m[1])) err('client', 'index.html loads ' + m[1] + ' but server.js does not serve it (add it to CLIENT_JS)');
  for (const m of html.matchAll(/import\(\s*'(\/[^']+\.js)'\s*\)/g)) if (!served(m[1])) err('client', 'index.html imports ' + m[1] + ' but server.js does not serve it');
  for (const n of allow) {
    if (!fs.existsSync(path.join(ROOT, n + '.js'))) err('client', 'CLIENT_JS lists ' + n + ' but ' + n + '.js does not exist');
    else if (!html.includes('/' + n + '.js') && !html.includes("'/" + n.replace(/-[^-]+$/, '-')) && !tracked.some(f => /\.js$/.test(f) && f !== n + '.js' && f !== 'server.js' && read(f).includes(n + '.js'))) warn('client', n + '.js is allow-listed but nothing seems to load it');
  }
}

// 5. Markdown links
const FRONT = new Set(['README.md', 'CHANGELOG.md', 'docs/README.md', 'docs/RELEASE.md', 'docs/HANDOFF.md', 'THIRD-PARTY-NOTICES.md', 'assets/CREDITS.md']);
let broken = 0;
for (const f of tracked.filter(f => /\.md$/.test(f))) {
  const s = read(f).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const m of s.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let u = m[1]; if (/^(https?:|mailto:|#|data:)/.test(u) || u.startsWith('/')) continue;
    u = decodeURI(u.split('#')[0].split('?')[0]); if (!u) continue;
    if (!fs.existsSync(path.join(ROOT, path.dirname(f), u))) { broken++; (FRONT.has(f) ? err : warn)('links', f + ': broken link ' + m[1]); }
  }
}

// 6. package.json scripts
try {
  const pkg = JSON.parse(read('package.json'));
  for (const [k, v] of Object.entries(pkg.scripts || {})) for (const m of String(v).matchAll(/\bnode\s+([\w./-]+\.js)/g)) if (!fs.existsSync(path.join(ROOT, m[1]))) err('scripts', 'npm run ' + k + ': ' + m[1] + ' does not exist');
} catch (e) { err('scripts', 'package.json: ' + e.message); }

// 7. debug leftovers in what the browser loads
const clientJs = cm ? [...cm[1].matchAll(/'([^']+)'/g)].map(x => x[1] + '.js').concat(tracked.filter(f => /^client\/.*\.js$/.test(f))) : [];
let logs = 0;
for (const f of clientJs.filter(f => fs.existsSync(path.join(ROOT, f)))) {
  const lines = read(f).split('\n');
  lines.forEach((l, i) => {
    if (/^\s*debugger\s*;?\s*$/.test(l)) err('debug', f + ':' + (i + 1) + ': debugger statement');
    if (/\bconsole\.log\(/.test(l) && !/\b(DBG|dbg|debug|DEBUG|GK_DEBUG|VERBOSE)\b/.test(l)) { logs++; if (logs <= 15) warn('debug', f + ':' + (i + 1) + ': console.log outside a debug guard'); }
  });
}
if (logs > 15) warn('debug', '... ' + (logs - 15) + ' more console.log lines in client code');
const ui = read('index.html').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/g, '');
for (const w of ['TODO', 'FIXME', 'XXX', 'lorem ipsum', 'placeholder text']) if (ui.toLowerCase().includes(w.toLowerCase())) warn('copy', 'index.html shows "' + w + '" in its visible markup');

Promise.all(jobs).then(() => {
  for (const w of warns) console.log('  warn  ' + w);
  for (const e of errors) console.log('  ERROR ' + e);
  const bad = errors.length || (STRICT && warns.length);
  console.log((bad ? 'check FAILED: ' : 'check ok: ') + errors.length + ' errors, ' + warns.length + ' warnings (' + tracked.filter(f => /\.js$/.test(f)).length + ' JS files parsed, ' + texts.length + ' text files scanned)');
  process.exit(bad ? 1 : 0);
});

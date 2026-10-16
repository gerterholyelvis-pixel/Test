// T7 guards for the icon bake pipeline (no browser in npm test): the worker file ships, is whitelisted, and every fallback is still wired.
const fs = require('fs'), path = require('path'), L = require('./lib.js');
const read = f => fs.readFileSync(path.join(L.ROOT, f), 'utf8');
(async () => {
  const art = read('itemart.js'), wk = read('iconworker.js'), srv = read('server.js'), game = read('game.js');
  const fail = await L.run('iconbake', [
    ['server serves iconworker.js as a whitelisted client script', () => L.assert(/CLIENT_JS = new Set\([^)]*'iconworker'/.test(srv), 'iconworker missing from CLIENT_JS')],
    ['the worker is a classic script with no imports (same-origin, covered by script-src self)', () => L.assert(!/^\s*(import|export)\s/m.test(wk) && /onmessage/.test(wk), 'worker must be dependency free')],
    ['worker and main thread use the same tone curve constants', () => { for (const s of ['2.51 * v + 0.03', '2.43 * v + 0.59) + 0.14', '12 * 512']) L.assert(wk.includes(s) && art.includes(s), s); }],
    ['bake falls back when Worker, OffscreenCanvas or createImageBitmap are missing', () => L.assert(/typeof Worker === 'undefined' \|\| typeof OffscreenCanvas === 'undefined' \|\| typeof createImageBitmap === 'undefined'/.test(art), 'feature check missing')],
    ['a worker error puts the owed icons back on the main-thread path', () => L.assert(/const fail = why =>[^]*q\.push\(k\)/.test(art) && /w\.onerror = /.test(art), 'worker failure handling missing')],
    ['every IndexedDB call is guarded', () => L.assert(/idbOpen = \(\) => new Promise\(res => \{ try \{ if \(typeof indexedDB === 'undefined'\)/.test(art) && /catch \(e\) \{ res\(new Map\(\)\); \}/.test(art) && /const put = \(k, blob\) => \{ try \{/.test(art), 'unguarded IndexedDB')],
    ['cache key includes model source, items, worker, three revision, icon size and tune', () => L.assert(/import\.meta\.url, new URL\('items\.js'/.test(art) && /THREE\.REVISION \+ '\.' \+ ICON \+ '\.' \+ JSON\.stringify\(tune\)/.test(art), 'version hash incomplete')],
    ['all-cached runs skip scene, render targets and PMREM entirely', () => L.assert(/if \(!q\.length\) return finish\(\);/.test(art), 'early finish missing')],
    ['render targets, env map and worker are released when the bake ends', () => L.assert(/rt && rt\.dispose\(\); rtM && rtM\.dispose\(\); env && env\.dispose\(\)/.test(art) && /wk\.w\.terminate\(\)/.test(art), 'cleanup missing')],
    ['game passes inventory/hotbar items as bake priority', () => L.assert(/GKART\.bake\(renderer, \{ priority: /.test(game), 'priority hook missing')],
  ]);
  process.exit(fail ? 1 : 0);
})();

// tags: every NAME-BEGIN block tag in the source has its NAME-END (tools/mapgen.js --check), so docs/MAP.md and Grep-by-tag stay reliable
const L = require('./lib.js'), { spawnSync } = require('child_process'), path = require('path');
L.run('tags', [
  ['every BEGIN tag has a matching END tag', () => { const r = spawnSync(process.execPath, [path.join(L.ROOT, 'tools', 'mapgen.js'), '--check'], { encoding: 'utf8' }); L.assert(r.status === 0, (r.stdout || '') + (r.stderr || '')); }],
]).then(f => process.exit(f ? 1 : 0));

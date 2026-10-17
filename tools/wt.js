// tools/wt.js: start an agent worktree that can run the game and the tests at once.
//   node tools/wt.js NAME [BASE]   git worktree add .claude/worktrees/NAME -b NAME BASE (default main), link node_modules, print a free port
//   node tools/wt.js --link        only link node_modules into the current worktree (fixes three.js 404s and `Cannot find module 'ws'`)
//   node tools/wt.js --port        print a free port (use it as PORT=... so servers in parallel worktrees never collide)
// node_modules is a directory junction to the main checkout's (no admin rights needed on Windows, a symlink elsewhere), so there is
// no `npm install` per worktree. .gitignore already lists node_modules.
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), net = require('net');
const here = process.cwd(), args = process.argv.slice(2);
const git = (a, cwd = here) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); if (r.status) throw new Error('git ' + a.join(' ') + ': ' + r.stderr.trim()); return r.stdout.trim(); };
const mainRoot = () => path.dirname(path.resolve(here, git(['rev-parse', '--git-common-dir'])));   // .../goblin-king/.git -> .../goblin-king
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });

function link(dir) {
  const target = path.join(mainRoot(), 'node_modules'), at = path.join(dir, 'node_modules');
  if (!fs.existsSync(target)) { console.log('main checkout has no node_modules yet: run `npm install` in ' + mainRoot()); return false; }
  if (path.resolve(at) === path.resolve(target)) { console.log('this is the main checkout; nothing to link'); return true; }
  if (fs.existsSync(path.join(at, 'ws'))) { console.log('node_modules already present in ' + dir); return true; }
  try { fs.rmSync(at, { recursive: false, force: true }); } catch (e) {}
  fs.symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
  console.log('linked ' + at + ' -> ' + target); return true;
}

(async () => {
  if (args[0] === '--port') return console.log(await freePort());
  if (args[0] === '--link') { link(here); return; }
  const name = args[0], base = args[1] || 'main';
  if (!name || name.startsWith('-')) { console.log('usage: node tools/wt.js NAME [BASE] | --link | --port'); process.exit(1); }
  const root = mainRoot(), dir = path.join(root, '.claude', 'worktrees', name);
  if (fs.existsSync(dir)) { console.log('exists: ' + dir); } else { git(['worktree', 'add', dir, '-b', name, base], root); console.log('worktree ' + dir + ' on new branch ' + name + ' from ' + base); }
  link(dir);
  const port = await freePort();
  console.log('\nnext:\n  cd "' + dir + '"\n  PORT=' + port + ' npm start        (PowerShell: $env:PORT=' + port + '; npm start)  then http://localhost:' + port + '/?offline=1\n  npm run test:fast  |  npm run test:changed  |  npm test');
})().catch(e => { console.error(e.message); process.exit(1); });

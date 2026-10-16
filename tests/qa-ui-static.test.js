// QA regression guards for client-only fixes (no browser in npm test): these assert the fixes are still in the source.
const fs = require('fs'), path = require('path'), L = require('./lib.js');
const read = f => fs.readFileSync(path.join(L.ROOT, f), 'utf8');
(async () => {
  const game = read('game.js'), html = read('index.html');
  const fail = await L.run('qa-ui-static', [
    ['the victory stage frame still runs the feel tick (clears the E prompt, plays the victory sound)', () => L.assert(/WINSTAGE\.on\) \{ if \(GK\.feel\) GK\.feel\.tick\(dt, now\); winStageRender/.test(game), 'missing')],
    ['winning removes the SUDDEN DEATH tag', () => L.assert(/GK\.mode = 'win'; inside = false; \{ const sd = document\.getElementById\('gkSudTag'\)/.test(game), 'missing')],
    ['GK.enter closes the How to Play overlay', () => L.assert(/GK\.enter = \(\) => \{ if \(GK\.howTo\) GK\.howTo\.close\(\)/.test(game), 'missing')],
    ['the menu footer is hidden on short windows (it overlapped the last button)', () => L.assert(/max-height:700px\)\{\.foot\{display:none\}/.test(html), 'missing')],
  ]);
  process.exit(fail ? 1 : 0);
})();

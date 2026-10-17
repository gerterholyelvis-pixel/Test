// QA regression guards for client-only fixes (no browser in npm test): these assert the fixes are still in the source.
const fs = require('fs'), path = require('path'), L = require('./lib.js');
const read = f => fs.readFileSync(path.join(L.ROOT, f), 'utf8');
(async () => {
  const game = read('game.js'), html = read('index.html');
  const fail = await L.run('qa-ui-static', [
    ['the victory stage frame still runs the feel tick (clears the E prompt, plays the victory sound)', () => L.assert(/WINSTAGE\.on\) \{ if \(GK\.feel\) GK\.feel\.tick\(dt, now\); winStageRender/.test(game), 'missing')],
    ['winning removes the SUDDEN DEATH tag', () => L.assert(/GK\.mode = 'win'; inside = false; \{ const sd = document\.getElementById\('gkSudTag'\)/.test(game), 'missing')],
    ['GK.enter closes the How to Play overlay', () => L.assert(/GK\.enter = \(\) => \{ if \(GK\.howTo\) GK\.howTo\.close\(\)/.test(game), 'missing')],
    ['WBUI: the workbench and the recycler are one screen (recycler = a tab), keys reach it before the global E / Esc / Tab handler, typing in its search box never moves the goblin', () => {
      L.assert(/function buildRec\(\) \{ if \(!craftPn\) buildCraft\(\); recPn = craftPn; \}/.test(game), 'recycler is a tab of the workbench screen');
      L.assert(/if \(\(panelKind === 'craft' \|\| panelKind === 'recycle'\) && craftPn && craftPn\.wb && craftPn\.wb\.key\(e\)\) return;/.test(game), 'screen keys first');
      L.assert(/if \(shopOpen && e\.target && e\.target\.tagName === 'INPUT'\) return;/.test(game), 'search box guard');
    }],
    ['WBUI: the screen has a fixed size and scrolls inside its lists (no layout jumps)', () => L.assert(/#gkCraft>div\{width:calc\(min\(1280px,96vw\)/.test(html) && /\.wb-list\{flex:1;min-height:0;overflow-y:auto/.test(html), 'missing')],
    ['the menu footer is hidden on short windows (it overlapped the last button)', () => L.assert(/max-height:700px\)\{\.foot\{display:none\}/.test(html), 'missing')],
  ]);
  process.exit(fail ? 1 : 0);
})();

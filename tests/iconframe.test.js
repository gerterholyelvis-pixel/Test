// ICONFRAME: static guards for the item icon frame, the extra consumable models and the world drop look (no browser in npm test).
const L = require('./lib.js'), { assert } = L, G = require('../items.js'), fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
(async () => {
  const icons = src('icons.js'), art = src('itemart.js'), game = src('game.js');
  const fail = await L.run('iconframe', [
    ['icons.js frames all six tiers with their own material and exposes frame()', () => {
      for (const t of ['common', 'uncommon', 'rare', 'mythic', 'legendary', 'transcendent']) assert(new RegExp('\\b' + t + ': \\{ hi:').test(icons), 'frame for ' + t);
      assert(/GKICONS = \{ draw, canvas, frame/.test(icons), 'frame exported');
    }],
    ['badges: reforged plus, stack count, charge bar, risk marker', () => { for (const s of ['it.up', 'o.count > 1', 'o.charge != null', 'it.risk || it.cursed']) assert(icons.includes(s), s); }],
    ['every consumable and charm has a 3D model (no flat-icon stragglers)', () => {
      const names = new Set([...art.matchAll(/\n    ([a-z]+)\(b\) \{/g)].map(m => m[1]));
      const miss = Object.keys(G.ITEMS).filter(k => /^[xc]:/.test(k)).filter(k => !names.has(k.slice(2).split(':')[0]));
      assert(!miss.length, 'no model for ' + miss.join(', '));
    }],
    ['x:flask:<n> maps to one model', () => assert(/split\(':'\)\[0\]/.test(art))],
    ['armour icons leave the display stand out; world drops show a tier beam and the best item', () => {
      assert(art.includes('material.userData.stand'), 'stand stripped'); assert(/function dropLook/.test(art) && /dropLook,/.test(art), 'dropLook');
      assert(/GKART\.dropLook\(g, d\.items, glow, lab\)/.test(game), 'game.js calls dropLook');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

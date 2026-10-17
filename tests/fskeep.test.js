// FULLSCREEN-2: pure checks on fskeep.js (when fullscreen / pointer lock are taken back) plus the wiring that stops game code leaving fullscreen
const F = require('../fskeep.js'), { run, assert, eq } = require('./lib.js');
const fs = require('fs'), path = require('path'), R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const base = { wish: true, fsOn: false, trusted: true, type: 'keydown', code: 'KeyW', now: 10000, last: 0 };
run('fskeep', [
  ['lost fullscreen comes back on the next trusted key or click (W, E, Tab, a click), never on Esc', () => {
    for (const code of ['KeyW', 'KeyE', 'Tab', 'Space']) assert(F.shouldRetake(Object.assign({}, base, { code })), code);
    assert(F.shouldRetake(Object.assign({}, base, { type: 'pointerdown', code: undefined })), 'click');
    assert(!F.shouldRetake(Object.assign({}, base, { code: 'Escape' })), 'Esc is no gesture');
    assert(!F.shouldRetake(Object.assign({}, base, { code: 'ShiftLeft' })), 'modifier alone');
    assert(!F.shouldRetake(Object.assign({}, base, { type: 'keyup' })), 'keyup is no activation');
  }],
  ['no retake without the wish, when already fullscreen, for synthetic events, or twice within the retry window', () => {
    assert(!F.shouldRetake(Object.assign({}, base, { wish: false })));
    assert(!F.shouldRetake(Object.assign({}, base, { fsOn: true })));
    assert(!F.shouldRetake(Object.assign({}, base, { trusted: false })));
    assert(!F.shouldRetake(Object.assign({}, base, { last: base.now - F.RETRY_MS + 1 })));
    assert(F.shouldRetake(Object.assign({}, base, { last: base.now - F.RETRY_MS })));
  }],
  ['pointer lock returns on any key once no panel is open, with or without fullscreen', () => {
    const s = { mode: 'play', panel: false, locked: false, repeat: false, code: 'KeyW', inField: false };
    assert(F.shouldRelockOnKey(s), 'W after a panel closed');
    assert(F.shouldRelockOnKey(Object.assign({}, s, { code: 'KeyE' })), 'the E that closed the panel');
    assert(!F.shouldRelockOnKey(Object.assign({}, s, { panel: true })), 'panel open: cursor stays free');
    assert(!F.shouldRelockOnKey(Object.assign({}, s, { code: 'Escape' })), 'Esc releases, never grabs');
    assert(!F.shouldRelockOnKey(Object.assign({}, s, { locked: true })));
    assert(!F.shouldRelockOnKey(Object.assign({}, s, { mode: 'menu' })));
    assert(!F.shouldRelockOnKey(Object.assign({}, s, { inField: true })), 'typing in a field');
  }],
  ['F enters fullscreen, leaves it only with no panel open', () => {
    const s = { code: 'KeyF', repeat: false, mods: false, mode: 'play', panel: false, fsOn: false, inField: false };
    eq(F.fKey(s), 'enter'); eq(F.fKey(Object.assign({}, s, { fsOn: true })), 'leave');
    eq(F.fKey(Object.assign({}, s, { fsOn: true, panel: true })), null);
    eq(F.fKey(Object.assign({}, s, { panel: true })), 'enter');
    eq(F.fKey(Object.assign({}, s, { repeat: true })), null); eq(F.fKey(Object.assign({}, s, { mods: true })), null); eq(F.fKey(Object.assign({}, s, { mode: 'menu' })), null);
  }],
  ['fullscreenchange: entering re-locks (no panel), leaving keeps the wish unless Esc was held', () => {
    eq(F.afterChange({ fsOn: true, mode: 'play', panel: false, locked: false, now: 5000, heldEsc: 0 }).relock, true);
    eq(F.afterChange({ fsOn: true, mode: 'play', panel: true, locked: false, now: 5000, heldEsc: 0 }).relock, false);
    eq(F.afterChange({ fsOn: false, mode: 'play', panel: false, locked: false, now: 5000, heldEsc: 0 }).wishOff, false);
    eq(F.afterChange({ fsOn: false, mode: 'play', panel: false, locked: false, now: 5000, heldEsc: 4000 }).wishOff, true);
  }],
  ['the browser keeping Esc to leave fullscreen with a panel open closes the panel (the player must never be stuck)', () => {
    eq(F.afterChange({ fsOn: false, mode: 'play', panel: true, locked: false, now: 5000, heldEsc: 0 }).closePanel, true);
    eq(F.afterChange({ fsOn: false, mode: 'play', panel: false, locked: false, now: 5000, heldEsc: 0 }).closePanel, false);
    eq(F.afterChange({ fsOn: true, mode: 'play', panel: true, locked: false, now: 5000, heldEsc: 0 }).closePanel, false);
    assert(require('fs').readFileSync(require('path').join(__dirname, '..', 'game.js'), 'utf8').includes('GK.closePanels = () =>'), 'game.js exposes closePanels');
  }],
  ['panels close with E and Tab as well as Esc', () => {
    for (const c of ['KeyE', 'Tab', 'Escape']) assert(F.closesPanel(c, false), c);
    assert(!F.closesPanel('KeyE', true), 'held E does not flicker the panel');
  }],
  ['wiring: no game code leaves fullscreen; panels never ask for Esc; movement does not need the pointer lock', () => {
    for (const f of ['game.js', 'feel.js', 'homeui.js', 'act5ui.js', 'hud5.js', 'fskeep.js']) assert(!/exitFullscreen/.test(R(f)), f + ' calls exitFullscreen');
    const menu = R('menu.js'); eq((menu.match(/exitFullscreen/g) || []).length, 1, 'only the explicit toggle leaves');
    assert(menu.includes('GKFS.install(') && menu.includes('GKFS.fKey('), 'menu.js uses fskeep');
    const g = R('game.js'), idx = R('index.html'), srv = R('server.js');
    assert(!g.includes('CLOSE (ESC)') && !R('homeui.js').includes('CLOSE (ESC)'), 'close buttons say E');
    assert(g.includes("e.code === 'KeyE' && invOpen"), 'E closes the inventory');
    assert(/if \(mine && spawned && GK\.mode === 'play' && !invOpen && !shopOpen && !GK\.locked\)/.test(g), 'movement gate has no pointer-lock condition');
    assert(!/document\.fullscreenElement\) requestLock/.test(g), 'relock is not tied to fullscreen');
    assert(/CLIENT_JS = new Set\(\[[^\]]*'fskeep'/.test(srv), 'fskeep served');
    assert(idx.indexOf('/fskeep.js') > 0 && idx.indexOf('/fskeep.js') < idx.indexOf("import('/menu.js')"), 'loaded before menu.js');
  }],
]);

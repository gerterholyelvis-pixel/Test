// Pure checks on uiorg.js (in-game Menu, cheat sheet, item list organising) plus wiring
const U = require('../uiorg.js'), { run, assert, eq } = require('./lib.js');
const fsx = require('fs'), rd = f => fsx.readFileSync(__dirname + '/../' + f, 'utf8');
const base = { code: 'Escape', mode: 'play', panel: false, paused: false, view: 'main', howOpen: false, inField: false };
run('uiorg', [
  ['Esc and P open the menu in play, nothing else does', () => {
    eq(U.escAction(base), 'open'); eq(U.escAction({ ...base, code: 'KeyP' }), 'open'); eq(U.escAction({ ...base, code: 'KeyX' }), null);
    eq(U.escAction({ ...base, mode: 'dead' }), null); eq(U.escAction({ ...base, mode: 'menu' }), null);
  }],
  ['Esc closes the top panel first: with a panel open the menu does not open', () => { eq(U.escAction({ ...base, panel: true }), null); eq(U.escAction({ ...base, inField: true }), null); }],
  ['inside the menu: Esc steps back from a sub view, then resumes; the How to Play overlay keeps its own Esc', () => {
    eq(U.escAction({ ...base, paused: true, view: 'settings' }), 'back'); eq(U.escAction({ ...base, paused: true }), 'close');
    eq(U.escAction({ ...base, paused: true, code: 'KeyP' }), 'close'); eq(U.escAction({ ...base, paused: true, howOpen: true }), null);
  }],
  ['losing the pointer lock opens the menu only when focused, visible and no panel caused it', () => {
    const s = { mode: 'play', panel: false, paused: false, howOpen: false, focused: true, visible: true };
    assert(U.openOnLockLoss(s)); assert(!U.openOnLockLoss({ ...s, panel: true })); assert(!U.openOnLockLoss({ ...s, focused: false })); assert(!U.openOnLockLoss({ ...s, mode: 'dead' })); assert(!U.openOnLockLoss({ ...s, paused: true }));
  }],
  ['cheat sheet keys and mute key', () => {
    assert(U.cheatKey({ code: 'F1' })); assert(U.cheatKey({ key: '?' })); assert(!U.cheatKey({ key: '?', ctrlKey: true })); assert(U.muteKey({ code: 'KeyN' })); assert(!U.muteKey({ code: 'KeyN', repeat: true }));
  }],
  ['the key list covers dash, heavy blow, interact, jump, inventory and the menu', () => {
    const all = JSON.stringify(U.CHEAT); for (const w of ['"C"', 'Right mouse', '"E"', '"Space"', '"Tab"', '"Esc"']) assert(all.includes(w), w);
  }],
  ['the menu lists every entry the owner asked for', () => {
    const ids = U.PAUSE_ENTRIES.map(e => e.id); for (const i of ['resume', 'settings', 'controls', 'how', 'stats', 'codex', 'report', 'leave']) assert(ids.includes(i), i);
    const keys = U.SETTINGS.flatMap(s => s.rows.map(r => r.key)); for (const k of ['gfx', 'dynres', 'mute', 'vol', 'sfx', 'amb', 'sens']) assert(keys.includes(k), k);
  }],
  ['sort puts favourites first, then best tier; filter and stack work', () => {
    const L = [{ key: 'a', name: 'Axe', tier: 'common', kind: 'weapon', n: 1 }, { key: 'b', name: 'Bow', tier: 'rare', kind: 'weapon' }, { key: 'c', name: 'Cap', tier: 'common', kind: 'armor' }, { key: 'a', name: 'Axe', tier: 'common', kind: 'weapon', n: 2 }];
    eq(U.sortEntries(U.stack(L), 'tier').map(e => e.key), ['b', 'a', 'c']); eq(U.sortEntries(U.stack(L), 'tier', { c: 1 }).map(e => e.key)[0], 'c');
    eq(U.stack(L).find(e => e.key === 'a').n, 3); eq(U.filterEntries(L, 'bo').length, 1); eq(U.filterEntries(L, '', 'armor').length, 1);
    eq(U.groupBy(U.stack(L), 'kind').map(g => g.id), ['weapon', 'armor']); eq(U.toggleFav({}, 'x'), { x: 1 }); eq(U.toggleFav({ x: 1 }, 'x'), {});
  }],
  ['wiring: served, loaded, movement gated, mute honoured, no window.confirm', () => {
    assert(/CLIENT_JS = new Set\(\[[^\]]*'uiorg'/.test(rd('server.js')), 'CLIENT_JS'); assert(rd('index.html').includes('/uiorg.js'), 'script tag');
    assert(rd('game.js').includes('!GK.locked && !GK.pauseOpen'), 'movement gate'); assert(/set\(\)\.mute \? 0/.test(rd('audio.js')), 'audio mute');
    const u = rd('uiorg.js'); assert(!/[^.\w]confirm\(/.test(u), 'in-page confirm only'); assert(!u.includes('exitFullscreen'), 'never leaves fullscreen');
  }]
]);

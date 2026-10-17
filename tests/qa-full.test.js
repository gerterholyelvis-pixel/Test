// QA-FULL: regression checks for the issues found in the full end-to-end playtest (docs/reports/qa-full.md)
const { run, assert, eq } = require('./lib.js');
const fs = require('fs'), path = require('path'), R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const HB = require('../homebase.js'), EX = require('../elixir.js');
run('qa-full', [
  ['home props: the client prompt reach sits inside the server gates (pump, screen, lockbox crack)', () => {
    eq(HB.PROP_REACH.p, EX.PUMP_RANGE, 'pump reach = elixir.js PUMP_RANGE'); eq(HB.PROP_REACH.s, HB.SCREEN_RANGE); eq(HB.PROP_REACH.b, HB.CRACK_RANGE);
    for (const k of ['p', 's', 'b']) { assert(HB.inReach(k, 0.5), k + ' close'); assert(!HB.inReach(k, HB.PROP_REACH[k]), k + ' at the edge is refused by the client first'); assert(HB.inReach(k, HB.PROP_REACH[k] - 0.25), k + ' just inside'); }
    assert(!HB.inReach('x', 0), 'unknown kind');
    const g = R('game.js'); assert(/GK\.homeReach && !GK\.homeReach\(kind/.test(g), 'merchantHoverTick drops the pump / screen / box hover out of reach');
  }],
  ['Elixir Screen: E closes it (the footer says "E close"; the capture handler used to swallow E)', () => {
    const src = R('homeui.js'), onKey = src.slice(src.indexOf('function onKey(e)'), src.indexOf("G.addEventListener('keydown', onKey, true)"));
    assert(/k === 'e' \|\| k === 'E'\)[^\n]*close\(true\)/.test(onKey), 'E closes the screen');
    assert(onKey.indexOf("k === 'e'") < onKey.indexOf('e.stopPropagation()'), 'handled before the key is stopped');
  }],
  ['a browser that refuses the pointer lock still swings on click (the retry click used to reset the refusal before the swing check)', () => {
    const g = R('game.js'), rl = g.slice(g.indexOf('const requestLock = () => {'), g.indexOf("canvas.addEventListener('mousedown', requestLock)"));
    assert(rl.indexOf('lockPrevRefused = lockRefused') >= 0 && rl.indexOf('lockPrevRefused = lockRefused') < rl.indexOf('lockRefused = false;'), 'requestLock remembers the refusal before it resets it');
    assert(/mousedown', e => \{ if \(e\.button === 0 && \(lockOk\(\) \|\| lockRefused \|\| lockPrevRefused\)\)/.test(g), 'the swing handler accepts a remembered refusal');
    assert(/lockRefused = lockPrevRefused = false/.test(g), 'a real lock clears it');
    // the two mousedown listeners run in registration order: requestLock first, then the swing; simulate both
    let lockOk = false, lockRefused = true, lockPrevRefused = false, swung = 0;
    const requestLock = () => { if (lockOk) return; lockPrevRefused = lockRefused; lockRefused = false; };
    const swing = () => { if (lockOk || lockRefused || lockPrevRefused) swung++; };
    for (let i = 0; i < 3; i++) { requestLock(); swing(); lockRefused = true; }   // the browser refuses again after each click
    eq(swung, 3, 'every click swings while the lock is refused');
    lockOk = true; lockRefused = lockPrevRefused = false; swing(); eq(swung, 4);
  }],
  ['E on a merchant opens the shop (the "else openShop" had slipped into a line comment)', () => {
    const g = R('game.js').replace(/\r\n/g, '\n'), i = g.indexOf('function stationInteract()'), body = g.slice(i, g.indexOf('\n}\n', i) + 2);
    const calls = []; const f = new Function('hoverRoom', 'hoverKind', 'invOpen', 'shopOpen', 'GK', 'window', 'openStation', 'openShop', body + '\nreturn stationInteract();');
    const go = kind => { calls.length = 0; const r = f(3, kind, false, false, { mode: 'play' }, {}, (k, id) => calls.push(k + ':' + id), id => calls.push('shop:' + id)); return [r, calls.join()]; };
    eq(go('m'), [true, 'shop:3']); eq(go('r'), [true, 'recycle:3']); eq(go('w'), [true, 'craft:3']); eq(go('k'), [true, 'craft:3']);
  }],
  ['the Master Forge and the Grand Recycler say so in the E prompt', () => {
    const f = R('feel.js'); assert(/=== 'grand' \? 'Use the Grand Recycler'/.test(f) && /=== 'forge' \? 'Use the Master Forge'/.test(f));
  }],
  ['the crown claim list only shows while someone gains, the alarm runs, or I am in the vault', () => {
    assert(/quiet = !S\.crown && k !== WORLD\.VAULT_KEY/.test(R('game.js')));
  }],
  ['the "Vault re-keyed" strip waits until the round-start banners are gone (they stacked into one unreadable block at round 2)', () => {
    const h = R('hud5.js'), m = /REKEY_DELAY = cfg\.rekeyDelay != null \? cfg\.rekeyDelay : (\d+)/.exec(h);
    assert(m && +m[1] >= 3200, 'delay ' + (m && m[1])); assert(/later\('bnRekey', \(\) => showBanner\(html, 4200\), REKEY_DELAY\)/.test(h), 'shown through the delayed timer');
    const g = R('game.js'); const a = /RS\.arenaUntil = now \+ (\d+)/.exec(g); assert(a && +a[1] <= +m[1], 'the arena banner (' + (a && a[1]) + ' ms) is gone before the strip');
  }],
  ['home toasts sit below the round timer and the home-phase line, not on top of them', () => {
    const m = /\.hu-tw\{[^}]*top:(\d+)vh/.exec(R('homeui.js')); assert(m && +m[1] >= 15, 'toast stack top ' + (m && m[1]));
  }],
  ['How to Play and the tips describe the 5x5 game with the home phase (not the old 3x3 rules)', () => {
    const g = R('game.js'), tips = g.slice(g.indexOf('// TIPS-BEGIN'), g.indexOf('// TIPS-END'));
    const panels = [...tips.matchAll(/\{ t: '([^']+)', x: '((?:[^'\\]|\\.)+)'/g)].map(m => ({ t: m[1], x: m[2] }));
    eq(panels.length, 5, 'five How to Play panels');
    assert(/round 1/i.test(panels[0].t) && /home/i.test(panels[0].x) && /elixir/i.test(panels[0].x), 'panel 1 is the home phase');
    assert(panels.some(p => /crown/i.test(p.t) && /dais/.test(p.x) && /round 5/.test(p.x) && /round 7/.test(p.x)), 'crown and time limit panel');
    assert(panels.some(p => /Forge/.test(p.x) && /Grand Recycler/.test(p.x)), 'loot rooms include the Forge and the Grand Recycler');
    assert(/home: 'Round 1/.test(tips) && /homeLocked\(\)\) \{ goAt = 0; show\('home'\); return; \}/.test(tips), 'home tip in round 1, door tips wait for the arena');
    const src = R('server.js'), sud = /SUDDEN_ROUND = [^:]+: (\d+), MAX_ROUND = [^:]+: (\d+)/.exec(src);
    assert(sud && sud[1] === '5' && sud[2] === '7', 'How to Play round numbers match server.js SUDDEN_ROUND / MAX_ROUND: ' + (sud && sud.slice(1)));
    const ctl = R('index.html'); assert(/Round 1 is spent in your home/.test(ctl) && /<span class="kc">R<\/span><span class="kc">Q<\/span>/.test(ctl), 'controls sheet: home phase note and R / Q');
  }],
]);

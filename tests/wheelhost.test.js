// WHEELHOST: the wheel host is presentation only. Pins the wheel's slot -> goblin mapping and the 12 odds (20/20/20 tapering to King 1%),
// checks the rarity tiers and that every pose is finite and reachable, and that menu.js still lets the server pick the result.
const H = require('../menuhost.js'), I = require('../items.js'), { run, assert, eq } = require('./lib.js');
const fs = require('fs'), path = require('path'), R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
global.window = global.window || {};
const G = (global.GKITEMS || (global.window && global.window.GKITEMS) || I.GOBLINS && I) ;
const GOB = (I.GOBLINS || (G && G.GOBLINS));
run('wheelhost', [
  ['the odds are unchanged: 12 goblins, 20/20/20 then a taper, King 1%, total 100', () => {
    eq(GOB.length, 12);
    eq(GOB.slice(0, 3).map(g => g.odds), [20, 20, 20]);
    eq(GOB[4].odds, 1); assert(GOB[4].name.toUpperCase().includes('KING'));
    eq(Math.round(GOB.reduce((s, g) => s + g.odds, 0) * 1000) / 1000, 100);
    const n = 100000; const c = new Array(12).fill(0); for (let i = 0; i < n; i++) c[I.rollGoblin((i + 0.5) / n)]++;
    GOB.forEach((g, i) => assert(Math.abs(c[i] / n * 100 - g.odds) < 0.05, 'type ' + i + ' ' + c[i] / n * 100));
  }],
  ['the wheel result mapping is untouched in menu.js (slot order, result guard, server result goes straight to wh.result)', () => {
    const m = R('menu.js');
    assert(m.includes('const SLOT = NG === 12 ? [0, 5, 1, 8, 6, 3, 2, 9, 7, 4, 10, 11] : [0, 3, 1, 4, 2];'), 'SLOT order');
    assert(m.includes("wh.result = (typeof g === 'number' && g >= 0 && g < NG) ? g : 0;"), 'result guard');
    assert(m.includes('const slot = SLOT.indexOf(wh.result);'), 'decel aims at the result slot');
    assert(!/Math\.random\(\) \* NG|wh\.result\s*=\s*SLOT/.test(m), 'no client side re-roll');
    const slot = [0, 5, 1, 8, 6, 3, 2, 9, 7, 4, 10, 11]; eq([...slot].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  }],
  ['rarity tiers: commons shrug, King bows, tiers follow the odds', () => {
    const t = GOB.map((g, i) => H.tierOf(g.odds, i === 4).key);
    eq(t.slice(0, 3), ['common', 'common', 'common']); eq(t[4], 'king');
    eq(H.tierOf(11.2).key, 'uncommon'); eq(H.tierOf(6.1).key, 'uncommon'); eq(H.tierOf(4.5).key, 'rare'); eq(H.tierOf(2.5).key, 'rare');
    eq(H.tierOf(1.8).key, 'epic'); eq(H.tierOf(1.4).key, 'epic'); eq(H.tierOf(1).key, 'king');
    eq(H.tierOf(20).react, 'shrug'); eq(H.tierOf(1, true).react, 'bow'); assert(H.tierOf(1, true).burst > H.tierOf(2.5).burst, 'King has the biggest burst');
  }],
  ['every pose is finite and every hand target is reachable by the arm', () => {
    const modes = ['idle', 'wind', 'swing', 'watch', 'shrug', 'clap', 'cheer', 'cheerBig', 'bow'];
    for (const m of modes) for (let t = 0; t <= 3; t += 0.05) for (const T of [0, 3.1, 5.2, 8.9]) {
      const P = H.poseFor(m, t, T, 0.5);
      for (const k of ['lean', 'hop', 'sh', 'tilt', 'nod', 'ex', 'ey', 'open', 'smile', 'brow', 'hat', 'hatFly']) assert(Number.isFinite(P[k]), m + ' ' + k);
      for (const h of [P.wa, P.fa]) { assert(h.every(Number.isFinite), m + ' hand'); const a = H.ik(12, -74, h[0], h[1], 53, 56, -1); assert(Number.isFinite(a.ex + a.ey + a.hx + a.hy), m + ' ik'); }
    }
    assert(H.poseFor('cheerBig', 0.9, 0, 0).hatFly > 0, 'the hat is thrown in a big cheer');
    assert(Math.abs(H.poseFor('bow', 1.2, 0, 0).lean) > 0.5, 'the King gets a deep bow');
  }],
  ['the swing ends with the hand on the wheel rim; the wind-up delay is short and the wheel is only delayed, never re-rolled', () => {
    const P = H.poseFor('swing', 0.11, 0, 0); assert(Math.abs(P.wa[0] - H.rimX(P.wa[1])) < 25, 'hand near the rim mid swing');
    assert(H.WIND + H.SWING < 1, 'lead under one second');
    const m = R('menu.js'); assert(m.includes('Math.max(0, wh.t - (wh.lead || 0))'), 'lead only delays the spin-up ramp');
    assert(m.includes('wh.state = \'decel\''), 'decel kept'); assert(R('index.html').includes('/menuhost.js'), 'script tag');
    assert(/CLIENT_JS = new Set\(\[[^\]]*'menuhost'/.test(R('server.js')), 'served');
  }],
]);

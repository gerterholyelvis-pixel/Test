// bot navigation: obstacle steering (boxes and circles), no flip-flopping, stuck detection, stat-based item picks (botnav.js), and the wiring in server.js (synthetic props via the botlab hook)
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), BN = require('../botnav.js'), G = require('../items.js');

// walk a point with botnav.steer like stepTo does: 10 Hz, 4.6 m/s. Returns { reached, steps, path, minClear, flips }
function walk(obs, from, to, opts = {}) {
  const st = {}, path = [from.slice()]; let [x, z] = from, now = 0, flips = 0, lastSide = 0, stuckMax = 0;
  for (let i = 0; i < (opts.max || 300); i++) {
    now += 100; if (Math.hypot(to[0] - x, to[1] - z) < 0.1) break;
    const r = BN.steer(st, x, z, to[0], to[1], 0.46, obs, BN.BOT_R, now);
    const lvl = BN.track(st, x, z, now, to[0], to[1]); stuckMax = Math.max(stuckMax, lvl);
    if (!r) continue;
    if (st.side && lastSide && st.side !== lastSide) flips++; if (st.side) lastSide = st.side;
    x = r[0]; z = r[1]; path.push([x, z]);
  }
  return { reached: Math.hypot(to[0] - x, to[1] - z) < 0.3, steps: path.length, path, flips, stuckMax, end: [x, z] };
}
const clear = (path, obs) => path.every(([x, z]) => !BN.hitAt(x, z, obs, BN.BOT_R - 0.05));
const dirChanges = path => { let n = 0, prev = 0; for (let i = 1; i < path.length; i++) { const s = Math.sign(Math.round((path[i][1] - path[i - 1][1]) * 1000)); if (s && prev && s !== prev) n++; if (s) prev = s; } return n; };

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_BOT_GRACE_MS: '0' }); let fail = 1;
  try { fail = await L.run('bot-nav', [
  ['a clear path is walked straight', async () => {
    const r = walk([{ x: 0, z: 8, hw: 1, hd: 1 }], [-5, 0], [5, 0]); assert(r.reached); assert(r.path.every(p => Math.abs(p[1]) < 1e-6), 'no detour when nothing is in the way');
  }],
  ['an axis-aligned crate on the line is walked around, once, without touching it', async () => {
    const obs = [{ x: 0, z: 0, hw: 1, hd: 1.5 }], r = walk(obs, [-5, 0.1], [5, 0.1]);
    assert(r.reached, 'did not arrive, ended ' + r.end); assert(clear(r.path, obs), 'walked into the crate'); assert(r.steps < 40, 'detour too long: ' + r.steps); assert(dirChanges(r.path) <= 2, 'zig-zag: ' + dirChanges(r.path) + ' sideways turns'); assert(r.flips === 0, 'changed detour side');
  }],
  ['a barrel (circle) dead centre on the line is walked around', async () => {
    const obs = [{ x: 0, z: 0, r: 0.6 }], r = walk(obs, [-4, 0], [4, 0]); assert(r.reached); assert(clear(r.path, obs)); assert(r.steps < 30);
  }],
  ['a row of crates with a gap is passed through the gap; a cluster is circled', async () => {
    const row = [{ x: 0, z: -3, hw: 0.6, hd: 0.6 }, { x: 0, z: 0, hw: 0.6, hd: 0.6 }, { x: 0, z: 3, hw: 0.6, hd: 0.6 }];   // gaps of 1.8 m between them
    let r = walk(row, [-5, 1.5], [5, 1.5]); assert(r.reached, 'gap 1: ' + r.end); assert(clear(r.path, row));
    const cluster = [{ x: 0, z: 0, hw: 1, hd: 1 }, { x: 1.6, z: 0.4, r: 0.7 }, { x: -1.4, z: 1, hw: 0.5, hd: 0.5 }];
    r = walk(cluster, [-6, 0.2], [6, 0.2]); assert(r.reached, 'cluster: ' + r.end); assert(clear(r.path, cluster)); eq(r.flips, 0);
  }],
  ['approaching a crate head-on from every side finds a way round', async () => {
    const obs = [{ x: 0, z: 0, hw: 1.2, hd: 1.2 }];
    for (const [a, b] of [[[-5, 0], [5, 0]], [[5, 0], [-5, 0]], [[0, -5], [0, 5]], [[0, 5], [0, -5]], [[-4, -4], [4, 4]], [[4, -4], [-4, 4]]]) { const r = walk(obs, a, b); assert(r.reached, a + ' -> ' + b + ' ended ' + r.end); assert(clear(r.path, obs)); }
  }],
  ['no jitter at a doorway next to a prop: a crate beside the opening does not make the bot oscillate', async () => {
    const obs = [{ x: 1.3, z: -0.5, hw: 0.6, hd: 0.6 }], r = walk(obs, [0, 4], [0.3, -3]);   // door at x ~ 0, crate just beside the line
    assert(r.reached, 'ended ' + r.end); let len = 0; for (let i = 1; i < r.path.length; i++) len += Math.hypot(r.path[i][0] - r.path[i - 1][0], r.path[i][1] - r.path[i - 1][1]);
    assert(len < 7.6 * 1.15, 'path ' + len.toFixed(2) + ' m for 7.6 m of distance'); assert(dirChanges(r.path) <= 1);
  }],
  ['pushOut moves a point out of a box or a circle, and stuck bots step out of a prop', async () => {
    const obs = [{ x: 0, z: 0, hw: 1, hd: 1 }, { x: 5, z: 0, r: 1 }];
    for (const [x, z] of [[0.2, 0.1], [0.9, -0.3], [5.1, 0.2], [4.5, 0]]) { const [px, pz] = BN.pushOut(x, z, obs); assert(!BN.hitAt(px, pz, obs, BN.BOT_R - 0.05), 'still inside from ' + x + ',' + z); assert(Math.hypot(px - x, pz - z) < 2.5, 'moved too far'); }
    eq(BN.pushOut(9, 9, obs), [9, 9]); const [qx, qz] = BN.pushOut(5, 0, obs, BN.BOT_R, 2, 0); assert(qx < 5 && !BN.hitAt(qx, qz, obs, 0.35), 'a point dead centre leaves toward the walker: ' + qx + ',' + qz);
  }],
  ['slide keeps the free axis against a wall of crates and stays put in a corner', async () => {
    const obs = [{ x: 1, z: 0, hw: 0.2, hd: 5 }];   // a long thin wall
    const [sx, sz] = BN.slide(0, 0, 0.9, 0.5, obs); assert(sx === 0 && sz === 0.5, 'slid along z: ' + sx + ',' + sz);
    eq(BN.slide(0, 0, 0.1, 0.1, obs), [0.1, 0.1]);
  }],
  ['stuck detection: no progress escalates 1 -> 2 -> 3; progress or arrival resets it', async () => {
    const st = {}; let lv = []; for (let t = 0; t <= 5000; t += 100) lv.push(BN.track(st, 3, 3, t)); const seen = [...new Set(lv.filter(Boolean))];
    eq(seen, [1, 2, 3], 'levels'); assert(lv.indexOf(1) >= 10 && lv.indexOf(1) <= 12, 'first level after ~1.1 s: ' + lv.indexOf(1));
    eq(BN.track(st, 4, 3, 5100), 0); assert(st.trk.lvl === 0, 'moving again resets');
    const j = {}; let hi = 0; for (let t = 0; t < 4000; t += 100) hi = Math.max(hi, BN.track(j, 3 + (t / 100 % 2) * 0.1, 3, t)); assert(hi >= 2, 'jittering in place counts as stuck');   // 10 cm back and forth
    BN.untrack(j); assert(!j.trk);
  }],
  ['boxed in by props: steer reports no way, and a walker that cannot progress is flagged stuck', async () => {
    const box = [{ x: -1.2, z: 0, hw: 0.3, hd: 2 }, { x: 1.2, z: 0, hw: 0.3, hd: 2 }, { x: 0, z: -2.2, hw: 1.5, hd: 0.3 }, { x: 0, z: 2.2, hw: 1.5, hd: 0.3 }];
    const r = walk(box, [0, 0], [5, 0], { max: 120 }); assert(!r.reached); assert(r.stuckMax >= 2, 'stuck level ' + r.stuckMax);
  }],
  ['obstacle edge cases: solid:false is ignored, empty or missing lists are fine', async () => {
    assert(!BN.hitAt(0, 0, [{ x: 0, z: 0, hw: 1, hd: 1, solid: false }])); assert(!BN.hitAt(0, 0, null)); eq(BN.steer({}, 0, 0, 1, 0, 0.5, [], 0.4, 0), [0.5, 0]); eq(BN.steer(null, 0, 0, 0, 0, 0.5, null), [0, 0]);
  }],
  ['weapons and armour are picked by stats, never by id', async () => {
    const info = k => G.ITEMS[k] || null, keys = Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'weapon' && k !== 'w:staff');
    const bw = BN.best(keys, info, BN.weaponValue), top = Math.max(...keys.map(k => G.ITEMS[k].attack)); eq(G.ITEMS[bw].attack, top);
    eq(BN.best(['w:stick', 'w:sword'], info, BN.weaponValue, G.ITEMS['w:sword'].attack), null, 'nothing beats the current weapon of equal attack');
    const fake = { 'w:a': { type: 'weapon', attack: 40 }, 'w:b': { type: 'weapon', attack: 41 }, 'a:x': { type: 'armor', health: 500 }, 'x:y': { type: 'consumable' } }, fi = k => fake[k];   // made-up ids from a future family
    eq(BN.best(['w:a', 'x:y', 'w:b', 'a:x'], fi, BN.weaponValue), 'w:b'); eq(BN.best(['w:a', 'a:x', 'w:b'], fi, BN.armorValue), 'a:x');
  }],
  ['healing: the smallest sufficient potion, never at full health, and only real heal items count', async () => {
    const it = { 'h:s': { type: 'consumable', heal: 20 }, 'h:m': { type: 'consumable', heal: 50 }, 'h:l': { type: 'consumable', heal: 120 }, 'm:brain:60': { type: 'consumable', gain: 3 }, 'x:plushie': { type: 'consumable' }, 'w:z': { type: 'weapon', attack: 5, heal: 99 } }, info = k => it[k];
    const all = Object.keys(it);
    eq(BN.pickHeal(all, info, 100, 100), null, 'full health'); eq(BN.pickHeal(['m:brain:60', 'x:plushie', 'w:z'], info, 10, 100), null, 'nothing to drink');
    eq(BN.pickHeal(all, info, 60, 100), 'h:m', 'missing 40: the 50 potion'); eq(BN.pickHeal(all, info, 85, 100), 'h:s', 'missing 15: the small one'); eq(BN.pickHeal(all, info, 97, 100), null, 'a scratch: keep the potions');
    eq(BN.pickHeal(all, info, 40, 100), 'h:l', 'missing 60 and low-ish: the smallest that covers it is the big one'); eq(BN.pickHeal(all, info, 70, 100), 'h:m', 'missing 30');
    eq(BN.pickHeal(['h:s', 'h:m'], info, 10, 100), 'h:m', 'low health with nothing that covers it: the biggest'); eq(BN.pickHeal(['h:s'], info, 78, 100), 'h:s', 'missing 22 for a 20 potion');
  }],
  ['server: a bot walks around a synthetic crate in the way and arrives (never inside it)', async () => {
    const c = await connect(srv.port, 'wins=0'), lab = async cmd => { const n = c.msgs.length; c.send({ botlab: cmd }); await c.until(x => x.msgs.slice(n).some(m => m.botlab), 2000, 'botlab'); return c.msgs.slice(n).find(m => m.botlab).botlab; };
    const [cx, cz] = W.rc(c.state.matchStart.spawn.box), obs = [{ x: cx, z: cz, hw: 1, hd: 1.4 }];
    let r = await lab({ nav: { obs, from: [cx - 4, cz + 0.1], to: [cx + 4, cz + 0.1] } }); let minD = 9, done = false;
    for (let i = 0; i < 80 && !done; i++) { await sleep(100); r = await lab({}); const [x, z] = r.pos; assert(!BN.hitAt(x, z, obs, 0.3), 'bot inside the crate at ' + x + ',' + z); if (Math.hypot(x - (cx + 4), z - (cz + 0.1)) < 0.5) done = true; }
    assert(done, 'the bot never got round the crate, last ' + r.pos); await c.close();
  }],
  ['server: a target inside a prop is reached at its edge, and the bot is not stuck forever', async () => {
    const c = await connect(srv.port, 'wins=0'), lab = async cmd => { const n = c.msgs.length; c.send({ botlab: cmd }); await c.until(x => x.msgs.slice(n).some(m => m.botlab), 2000, 'botlab'); return c.msgs.slice(n).find(m => m.botlab).botlab; };
    const [cx, cz] = W.rc(c.state.matchStart.spawn.box), obs = [{ x: cx, z: cz, r: 1 }]; let r = await lab({ nav: { obs, from: [cx - 4, cz], to: [cx, cz] } });
    for (let i = 0; i < 60; i++) { await sleep(100); r = await lab({}); if (process.env.DBG && i % 5 === 0) console.log(i, r.pos.map(v => v.toFixed(2)), cx.toFixed(2), cz.toFixed(2), r.nav); assert(!BN.hitAt(r.pos[0], r.pos[1], obs, 0.3), 'inside the barrel'); }
    assert(Math.hypot(r.pos[0] - cx, r.pos[1] - cz) < 2.2, 'bot ended ' + Math.hypot(r.pos[0] - cx, r.pos[1] - cz).toFixed(2) + ' m away'); await c.close();
  }],
  ['server: a bot equips the strongest weapon and armour from its backpack by stats', async () => {
    const c = await connect(srv.port, 'wins=0'), lab = async cmd => { const n = c.msgs.length; c.send({ botlab: cmd }); await c.until(x => x.msgs.slice(n).some(m => m.botlab), 2000, 'botlab'); return c.msgs.slice(n).find(m => m.botlab).botlab; };
    const r = await lab({ nav: { backpack: ['w:stick', 'a:sack', 'w:claymore', 'a:dwarven', 'w:dagger', 'a:cloth', 'x:plushie'] } });
    eq(r.wpn, 'w:claymore'); eq(r.armor, 'a:dwarven'); await c.close();
  }],
]); } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

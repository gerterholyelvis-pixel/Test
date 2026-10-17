// Pure checks on hud5.js map layout (no DOM)
const H = require('../hud5.js'), { run, assert, eq } = require('./lib.js');
run('hud5', [
  ['ARENAHUE: every cell but the vault has a compass colour, mirrored cells (i, 24-i) have opposite sides, the map uses it', () => {
    eq(H.cellSide(12), null); eq(H.cellHue(12), null);
    const seen = {}; for (let i = 0; i < 25; i++) if (i !== 12) { const s = H.cellSide(i); assert(H.SIDE_HUE[s] != null, 'hue for cell ' + i); seen[s] = (seen[s] || 0) + 1; }
    eq(Object.keys(seen).length, 8, 'eight sides'); eq([H.cellSide(0), H.cellSide(2), H.cellSide(4), H.cellSide(10), H.cellSide(14), H.cellSide(20), H.cellSide(22), H.cellSide(24)], ['NW', 'N', 'NE', 'W', 'E', 'SW', 'S', 'SE']);
    eq([H.cellSide(6), H.cellSide(7), H.cellSide(13), H.cellSide(16)], ['NW', 'N', 'E', 'SW'], 'inner ring');
    const opp = { N: 'S', S: 'N', E: 'W', W: 'E', NE: 'SW', SW: 'NE', NW: 'SE', SE: 'NW' };
    for (let i = 0; i < 12; i++) eq(H.cellSide(24 - i), opp[H.cellSide(i)], 'mirror ' + i);
    const hues = Object.values(H.SIDE_HUE); eq(new Set(hues).size, 8, 'distinct hues');
    const ops = H.mapOps({ me: { x: 0, z: 0, yaw: 0 } }, {}), cell0 = ops.find(o => o.t === 'rect' && o.x === H.ARENA[0].cx && o.z === H.ARENA[0].cz);
    assert(/rgba\(68,165,173/.test(cell0.fill), 'minimap cell 0 is teal: ' + cell0.fill);
  }],
  ['25 arena cells and 20 attached rooms, no overlaps, the same rects as world.js', () => {
    eq(H.ARENA.length, 25); eq(H.ATTACHED.length, 20);
    const W = require('../world.js'); W.CHEST.forEach((c, i) => { const a = H.ATTACHED[i]; eq([a.id, a.cx, a.cz, a.w, a.h, a.side], ['c' + c.id, c.cx, c.cz, c.size, c.size, c.side], 'attached rect ' + i); });
    const all = H.ARENA.concat(H.ATTACHED);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2), oz = Math.min(a.cz + a.h / 2, b.cz + b.h / 2) - Math.max(a.cz - a.h / 2, b.cz - b.h / 2);
      assert(!(ox > 0.01 && oz > 0.01), 'overlap ' + a.id + ' ' + b.id);
    }
  }],
  ['room centres map back to their key', () => { for (const r of H.ARENA.concat(H.ATTACHED)) eq(H.cellAt(r.cx, r.cz), r.id); }],
  ['mapOps emits an icon per special room and one me arrow', () => {
    const ops = H.mapOps({ me: { x: 0, z: 0, yaw: 0 }, vb: { 7: 'ram', 11: 'keystone', 13: 'locksmith', 17: 'counting' }, trees: { 6: 'well', 8: 'seer', 16: 'thorn', 18: 'elder' }, layout: { c0: 'forge' }, myHome: 'c1' }, {});
    eq(ops.filter(o => o.t === 'me').length, 1);
    const k = ops.filter(o => o.t === 'icon').map(o => o.k);
    for (const x of ['crown', 'ram', 'keystone', 'locksmith', 'counting', 'tree:well', 'forge']) assert(k.includes(x), 'missing icon ' + x);
    eq(k.filter(x => x === 'home').length, 8);
  }],
  ['mapOps tolerates an empty state', () => { assert(H.mapOps().length >= 45); }],
  ['wiring: hud5.js is served, loaded before game.js, and game.js feeds it', () => {
    const fsx = require('fs'), srv = fsx.readFileSync(__dirname + '/../server.js', 'utf8'), idx = fsx.readFileSync(__dirname + '/../index.html', 'utf8'), gm = fsx.readFileSync(__dirname + '/../game.js', 'utf8');
    assert(/CLIENT_JS = new Set\(\[[^\]]*'hud5'/.test(srv), 'hud5 in CLIENT_JS');
    assert(srv.includes('([a-z0-9-]+)') || srv.includes('([a-z0-9]+)'), 'client script route allows digits');
    assert(idx.indexOf('/hud5.js') > 0 && idx.indexOf('/hud5.js') < idx.indexOf("import('/game.js')"), 'script tag before game.js');
    assert(gm.includes('GKHUD5.onMsg(d)') && gm.includes('HUD5.mapOps(ST'), 'game.js hooks present');
    assert(!gm.includes('gkDbgFF'), 'the Foundation skip button is gone');
  }]
]);

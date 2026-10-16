// Pure checks on hud5.js map layout (no DOM)
const H = require('../hud5.js'), { run, assert, eq } = require('./lib.js');
run('hud5', [
  ['25 arena cells and 16 attached rooms, no overlaps', () => {
    eq(H.ARENA.length, 25); eq(H.ATTACHED.length, 16);
    const all = H.ARENA.concat(H.ATTACHED);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j], ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2), oz = Math.min(a.cz + a.h / 2, b.cz + b.h / 2) - Math.max(a.cz - a.h / 2, b.cz - b.h / 2);
      assert(!(ox > 0.01 && oz > 0.01), 'overlap ' + a.id + ' ' + b.id);
    }
  }],
  ['room centres map back to their key', () => { for (const r of H.ARENA.concat(H.ATTACHED)) eq(H.cellAt(r.cx, r.cz), r.id); }],
  ['mapOps emits an icon per special room and one me arrow', () => {
    const ops = H.mapOps({ me: { x: 0, z: 0, yaw: 0 }, vb: { 7: 'ram', 11: 'keystone', 13: 'locksmith', 17: 'counting' }, trees: { 6: 'well', 8: 'seer', 16: 'thorn', 18: 'elder' }, layout: { c1: 'forge' }, myHome: 'c0' }, {});
    eq(ops.filter(o => o.t === 'me').length, 1);
    const k = ops.filter(o => o.t === 'icon').map(o => o.k);
    for (const x of ['crown', 'ram', 'keystone', 'locksmith', 'counting', 'tree:well', 'forge']) assert(k.includes(x), 'missing icon ' + x);
    eq(k.filter(x => x === 'home').length, 8);
  }],
  ['mapOps tolerates an empty state', () => { assert(H.mapOps().length >= 41); }],
  ['wiring: hud5.js is served, loaded before game.js, and game.js feeds it', () => {
    const fsx = require('fs'), srv = fsx.readFileSync(__dirname + '/../server.js', 'utf8'), idx = fsx.readFileSync(__dirname + '/../index.html', 'utf8'), gm = fsx.readFileSync(__dirname + '/../game.js', 'utf8');
    assert(/CLIENT_JS = new Set\(\[[^\]]*'hud5'/.test(srv), 'hud5 in CLIENT_JS');
    assert(srv.includes('([a-z0-9]+)'), 'client script route allows digits');
    assert(idx.indexOf('/hud5.js') > 0 && idx.indexOf('/hud5.js') < idx.indexOf("import('/game.js')"), 'script tag before game.js');
    assert(gm.includes('GKHUD5.onMsg(d)') && gm.includes('HUD5.mapOps(ST'), 'game.js hooks present');
    assert(!gm.includes('gkDbgFF'), 'the Foundation skip button is gone');
  }]
]);

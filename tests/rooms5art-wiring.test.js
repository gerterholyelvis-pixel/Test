// ROOMS5ART wiring: the collision tables in world.js (HOME_SOLIDS, TREE_SOLIDS, VB_SOLIDS, COFFERS) match the art modules' own footprints, solidsOf / propsAt / obstaclesIn pick the tree type up,
// and the page / server serve and load the four art modules. The art is built headless (no GL; a stub canvas for the textures). Skips the art checks when `three` is not installed.
const L = require('./lib.js'), { assert, eq } = L, W = require('../world.js'), fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const near = (a, b, m) => assert(Math.abs(a - b) < 1e-6, m + ': ' + a + ' vs ' + b);
const sameCircles = (art, tab, what) => {   // art: [{x, z, r}], tab: [[x, z, r]] (order free)
  eq(art.length, tab.length, what + ': circle count');
  for (const [x, z, r] of tab) assert(art.some(a => Math.abs(a.x - x) < 1e-3 && Math.abs(a.z - z) < 1e-3 && Math.abs(a.r - r) < 1e-6), what + ': circle ' + [x, z, r] + ' is not in the art');
};
(async () => {
  let THREE = null, mods = {};
  try {
    const noop = new Proxy(function () {}, { get: (t, k) => k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 10 }) : noop, apply: () => noop, set: () => true });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop, style: {} }) };
    const base = path.dirname(require.resolve('three')); THREE = await import(pathToFileURL(path.join(base, 'three.module.js')).href);
    for (const f of ['home', 'trees-a', 'trees-b', 'vault']) mods[f] = await import(pathToFileURL(path.join(L.ROOT, 'rooms5art-' + f + '.js')).href);
    mods.merge = (await import(pathToFileURL(path.join(base, '..', 'examples', 'jsm', 'utils', 'BufferGeometryUtils.js')).href)).mergeGeometries;
  } catch (e) { console.log('  note: art modules not buildable here (' + String(e.message).slice(0, 80) + '), art checks skipped'); THREE = null; }
  const art = (name, fn) => [name, () => { if (THREE) fn(); }];
  const fail = await L.run('rooms5art-wiring', [
    art('home: HOME_SOLIDS are the footprints of the art home, and the circles stay inside them', () => {
      const h = mods.home.buildHomeRoom(THREE, {}, { doorSide: 'S', seed: 3, owner: 'x' });
      eq(h.solids.length, W.HOME_SOLIDS.length, 'footprint count');
      for (const [k, x, z, hx, hz] of W.HOME_SOLIDS) assert(h.solids.some(s => Math.abs(s.x - x) < 1e-6 && Math.abs(s.z - z) < 1e-6 && Math.abs(s.hx - hx) < 1e-6 && Math.abs(s.hz - hz) < 1e-6), 'rect ' + k + ' ' + [x, z] + ' is not in the art');
      const K = W.HOME_K; for (const [k, x0, z0, hx0, hz0] of W.HOME_SOLIDS) for (const c of W.rectCircles(k, x0 * K, z0 * K, hx0 * K, hz0 * K)) { const x = x0 * K, z = z0 * K, hx = hx0 * K, hz = hz0 * K; assert(Math.abs(c.x - x) + c.r <= hx + 1e-9 + (hx >= hz ? hx - hz : 0) && Math.abs(c.z - z) + c.r <= hz + 1e-9 + (hz > hx ? hz - hx : 0), 'circle inside its rect'); }
      near(W.HOME_LAYOUT.bench[0], h.solids[0].x * K, 'bench x'); near(W.HOME_LAYOUT.bench[1], h.solids[0].z * K, 'bench z'); near(W.HOME_LAYOUT.recycler[0], h.solids[1].x * K, 'recycler x'); near(W.HOME_LAYOUT.recycler[1], h.solids[1].z * K, 'recycler z');
      for (const [kind, x, z] of [['pump', 4.25, -1.9], ['screen', 4.8, 0.6], ['box', 4.2, 3.5]]) { assert(h.solids.some(q => Math.abs(q.x - x) < 1e-6 && Math.abs(q.z - z) < 1e-6), kind + ' is a footprint of the art home'); near(W.HOME_LAYOUT[kind][0], x * K, kind + ' x'); near(W.HOME_LAYOUT[kind][1], z * K, kind + ' z'); }   // the E-prompt anchors stand on the art pump, screen and lockbox
      near(W.HS / 2 - W.T / 2, 4.98 * K, 'the art walls (4.98) land on the real wall faces');
      // the owner colour and the outside sign exist
      h.setOwner('Grimble', '#ff8a78'); h.setOwner('Grimble', 0xff8a78); h.dispose();
    }),
    art('home: the hatch of WORLD.DOORS fits the art doorway', () => {
      const hd = W.DOORS.find(d => d.kind === 'hatch'), dw = 2 * (hd.hw - 0.2); near(dw, 4, 'hatch width');
      const h = mods.home.buildHomeRoom(THREE, {}, { doorSide: 'S', seed: 1, doorW: dw, doorH: 2.9, size: W.HS }); assert(h.group.children.length > 0); h.dispose();
    }),
    art('trees: TREE_SOLIDS match the art of all 10 types (Well: wider trunk, Hollow Oak: nook walls)', () => {
      const names = { well: 'well', press: 'press', spring: 'spring', seer: 'seer', graft: 'graft', thorn: 'thorn', gambler: 'gambler', memory: 'memory', oak: 'hollow', elder: 'elder' };
      for (const [type, name] of Object.entries(names)) {
        const ta = ['well', 'press', 'spring', 'seer', 'graft'].includes(type), g = ta ? mods['trees-a'].buildTreeRoom(THREE, { mergeGeometries: mods.merge }, name, { seed: 1 }) : mods['trees-b'].buildTreeRoom(THREE, {}, name, { height: 6.5, size: 15, seed: 1 });
        const api = ta ? g.api : g.userData.api; let circ = (ta ? g.solids : api.solids).map(s => ({ x: s.x, z: s.z, r: s.r })).concat(ta ? [] : (api.extraSolids || []).map(s => ({ x: s.x, z: s.z, r: s.r })));
        if (type === 'well') circ = circ.map(c => (c.x === 0 && c.z === 0 ? { ...c, r: 1.7 } : c));   // the wiring fix: the stump is solid
        sameCircles(circ, W.TREE_SOLIDS[type], type);
        api.dispose();
      }
      eq(Object.keys(W.TREE_SOLIDS).sort(), Object.keys(names).sort());
    }),
    art('vaultbreakers: VB_SOLIDS and the vault COFFERS match the art', () => {
      sameCircles(mods.vault.vaultbreakerSolids(), W.VB_SOLIDS, 'vaultbreaker');
      const d = mods.vault.buildVaultDressing(THREE, {}, { half: W.V / 2 - W.T / 2, H: W.H, claimR: 2.45 }); sameCircles(d.solids, W.COFFERS.map(([x, z]) => [x, z, 0.5]), 'coffers');
      const r = mods.vault.buildVaultbreaker(THREE, {}, 'ram', { lazy: true, H: W.H });
      for (const t of ['ram', 'locksmith', 'counting', 'keystone']) { r.setSkin(t); assert(r.anchors && r.anchors.B, 'skin ' + t); }
      r.setBreach(0); r.setBreach(100); assert(r.group.getObjectByName('doorCracks'), 'door cracks mesh'); r.dispose();
    }),
    ['tree rooms: solidsOf follows the type; propsAt reads layout.trees; obstaclesIn reads m.trees; unknown = trunk only', () => {
      for (const cell of W.TREE_CELLS) {
        const key = String(cell), base = W.solidsOf(key, '').filter(p => p.k === 'trunk');
        eq(base.length, 1, 'trunk only without a type'); eq(base[0].r, 1.1);
        const well = W.solidsOf(key, 'well').filter(p => p.k === 'trunk' || p.k === 'tprop'); eq(well.find(p => p.k === 'trunk').r, 1.7, 'the Well stump blocks'); eq(well.length, 2);
        const oak = W.solidsOf(key, 'oak').filter(p => p.k === 'trunk' || p.k === 'tprop'); eq(oak.length, 11, 'oak: trunk + 4 posts + 6 nook walls');
        eq(W.solidsOf(key, 'hollow').filter(p => p.k === 'tprop').length, 0, 'an unnormalised alias is not a type');
      }
      const [cx, cz] = W.rc(6), layout = ['chest', 'chest']; layout.trees = ['well', 'press', 'spring', 'oak'];
      assert(W.propsAt(cx, cz, layout).some(p => p.k === 'trunk' && p.r === 1.7), 'propsAt: layout.trees'); eq(W.propsAt(cx, cz, ['chest']).find(p => p.k === 'trunk').r, 1.1, 'propsAt without trees');
      assert(W.obstaclesIn('6', { trees: { 6: 'well' } }).some(p => p.k === 'trunk' && p.r === 1.7), 'obstaclesIn: m.trees map');
      eq(W.treeTypeOf({ trees: ['a', 'b', 'c', 'bogus'] }, '18'), '', 'unknown names give nothing'); eq(W.treeTypeOf({ trees: ['well', 'press', 'spring', 'hollow'] }, '18'), 'oak', 'alias normalised'); eq(W.treeTypeOf({ trees: { 8: 'elder' } }, 8), 'elder');
      // a goblin cannot walk into the Well stump or the Hollow Oak walls, but can walk into the nook
      const [x, z] = W.slide(cx + 3, cz, cx + 1.8, cz, 0.45, layout, false); assert(x - cx >= 1.7 + 0.45 - 1e-6, 'pushed out of the Well stump');
      const [w2x, w2z] = W.slide(W.rc(18)[0], W.rc(18)[1] + 3.2, W.rc(18)[0], W.rc(18)[1] + 1.9, 0.45, layout, false); assert(Math.abs(w2x - W.rc(18)[0]) < 0.01, 'the oak nook is walkable: ' + w2x);
    }],
    ['vaultbreaker rooms: the station footprints face the vault and stay inside their room; the vault has its coffers', () => {
      for (const [side, cell] of Object.entries(W.VB_CELLS)) {
        const r = W.roomRect(cell), ps = W.solidsOf(String(cell), '').filter(p => p.k === 'vbprop'); eq(ps.length, 7, 'vbprops in ' + cell);
        for (const p of ps) assert(Math.abs(p.x - r.cx) + p.r <= r.hw && Math.abs(p.z - r.cz) + p.r <= r.hd, side + ': ' + p.x + ',' + p.z + ' pokes out');
        // B (3 circles) sits on the wall away from the vault, FL / FR near the vault door
        const [vx, vz] = W.rc(W.VAULT), toV = p => Math.hypot(p.x - vx, p.z - vz), far = ps.slice().sort((a, b) => toV(b) - toV(a)).slice(0, 3), near2 = ps.slice().sort((a, b) => toV(a) - toV(b)).slice(0, 2);
        assert(far.every(p => p.r === 0.58) || far.some(p => p.r === 0.72), 'B / L / R are on the far side'); assert(near2.every(p => p.r === 0.6), 'FL / FR are next to the vault door: ' + near2.map(p => p.r));
      }
      eq(W.solidsOf('12', '').filter(p => p.k === 'coffer').length, 8, 'coffers');
      for (const p of W.solidsOf('12', '')) assert(Math.abs(p.x) + p.r <= W.V / 2 && Math.abs(p.z) + p.r <= W.V / 2, 'vault prop inside');
    }],
    ['homes: every footprint circle lies inside its home and leaves the hatch strip free', () => {
      for (const id of W.HOME_IDS) {
        const c = W.CHEST[id], ps = W.solidsOf('c' + id, 'home'); assert(ps.length >= 15, 'home props ' + ps.length);
        for (const p of ps) { eq(W.roomKeyOf(p.x, p.z), 'c' + id, 'prop in c' + id); assert(Math.abs(p.x - c.cx) + p.r <= c.size / 2 && Math.abs(p.z - c.cz) + p.r <= c.size / 2, 'prop inside the walls'); }
        const [dx, dz] = W.attLocal(c, 0, 3.0); assert(!W.inProp(dx, dz, 0.45, ['home'], false), 'the spot right inside the doorway is free'); const [sx, sz] = W.attLocal(c, 0, 2.8 * W.HOME_K); assert(!W.inProp(sx, sz, 0.45, ['home'], false), 'the art spawn point is free');
        const [ax, az] = W.attLocal(c, W.HOME_LAYOUT.bench[0], W.HOME_LAYOUT.bench[1] + 1.2); assert(!W.inProp(ax, az, 0.45, ['home'], false), 'a goblin can stand in front of the bench');
        const [rx, rz] = W.attLocal(c, W.HOME_LAYOUT.recycler[0], W.HOME_LAYOUT.recycler[1] + 1.4); assert(!W.inProp(rx, rz, 0.45, ['home'], false), 'a goblin can stand in front of the recycler');
      }
    }],
    ['page and server: the four art modules are whitelisted, served and imported by index.html', () => {
      const srv = fs.readFileSync(path.join(L.ROOT, 'server.js'), 'utf8'), idx = fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8');
      for (const f of ['rooms5art-home', 'rooms5art-trees-a', 'rooms5art-trees-b', 'rooms5art-vault']) { assert(srv.includes("'" + f + "'"), f + ' in CLIENT_JS'); assert(fs.existsSync(path.join(L.ROOT, f + '.js')), f + '.js exists'); }
      assert(/\^\\\/\(\[a-z0-9-\]\+\)\\\.js\$/.test(srv), 'the static regex allows hyphens'); assert(idx.includes("'/rooms5art-' + f + '.js'") && idx.includes('GK5ART'), 'index.html imports the art'); assert(idx.includes('BufferGeometryUtils.js'), 'mergeGeometries for the trees-a art');
      const game = fs.readFileSync(path.join(L.ROOT, 'game.js'), 'utf8'); assert(game.includes('ROOMS5ART-BEGIN') && game.includes('ROOMS5ART-END') && game.includes('R5.tick(t)'), 'game.js block and tick hook');
    }],
    ['static server: a hyphenated art module is served and a made-up one is 404', async () => {
      const S = await L.startServer(); try {
        const get = p => new Promise((res, rej) => require('http').get('http://127.0.0.1:' + S.port + p, r => { r.resume(); res(r.statusCode); }).on('error', rej));
        eq(await get('/rooms5art-home.js'), 200); eq(await get('/rooms5art-vault.js'), 200); eq(await get('/rooms5art-nope.js'), 404); eq(await get('/rooms5art-home.js/../server.js'), 404);
      } finally { S.stop(); }
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

// Regression tests for the bugs found playing all 10 tree rooms for real (docs/reports/tree-rooms-fix.md)
const L = require('./lib.js'), { connect, assert, eq, sleep, run } = L, fs = require('fs'), path = require('path'), R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const W = require('../world.js'), A5 = require('../act5.js'), ACT = require('../activity.js'); require('../rooms5-trees.js');
const spot = (key, id, d = 1.1) => { const a = A5.ANCHORS[key][id], r = W.roomRect(key); let dx = r.cx - a.x, dz = r.cz - a.z; const l0 = Math.hypot(dx, dz), l = l0 || 1; if (l0 < 0.01) { dx = 0; dz = 1; } return [a.x + dx / l * (a.r + d), a.z + dz / l * (a.r + d)]; };
const AS = (c, r) => { for (let i = c.msgs.length - 1; i >= 0; i--) { const a = c.msgs[i].actS; if (a && a.r === r) return a; } return null; };

(async () => {
  let fail = await run('tree-rooms-fix', [
    ['Graft: the public view turns the vise to ready when its time is up (it never did: the view had no clock)', () => {
      const st = ACT.init('graft', ACT.rng(3), 1000);
      ACT.station.start(st.vise, { id: 1, alive: true }, 1000, { item: 'w:club', ms: 6000, out: 'w:club+', ownerMs: 4000 });
      eq(ACT.view(st, 'graft', 2000).vise.state, 'run'); eq(ACT.view(st, 'graft', 7500).vise.state, 'ready'); eq(ACT.view(st, 'graft', 7500).vise.by, 1);
      const ui = require('../act5ui.js');   // the prompt that depends on it
      eq(ui.options('tree', 'graft', 'NE', { branches: [1, 1, 1, 1], vise: { state: 'ready', by: 1 } }, {}, { count: () => 0 })[0].v, 'use');
    }],
    ['client collision: game.js hands the tree types to world.js (CHEST_ROOMS.trees), so posts, vats, the Well stump and the Oak arch block as on the server', () => {
      const g = R('game.js'); assert(/CHEST_ROOMS\.trees = tr \|\| null/.test(g), 'R5.onMsg sets CHEST_ROOMS.trees from trees / matchStart.trees');
      const types = []; types.trees = { 6: 'well', 8: 'oak', 16: 'press', 18: 'seer' };
      const r6 = W.roomRect('6'), r8 = W.roomRect('8');
      assert(W.propsAt(r6.cx, r6.cz + 1.5, types).some(p => p.k === 'trunk' && p.r === 1.7), 'Well stump r 1.7');
      assert(W.propsAt(r6.cx + 4.2, r6.cz - 4.2, types).some(p => p.k === 'tprop'), 'Well wellhead');
      assert(W.propsAt(r8.cx + 1.15, r8.cz + 1.9, types).some(p => p.k === 'tprop' && p.r === 0.4), 'Oak arch wall');
      const bare = []; assert(!W.propsAt(r6.cx + 4.2, r6.cz - 4.2, bare).some(p => p.k === 'tprop'), 'without the types only the trunk blocks (the old client)');
    }],
    ['a held Hollow Oak is hidden from every map: roundState.hidden reaches the minimap filter; the Elder stone channel has a label; the dry spring offers nothing in sudden death', () => {
      const g = R('game.js');
      assert(/if \(d\.round\) A\.hidden = \(d\.hidden \|\| \[\]\)/.test(g), 'GKACT5.onMsg keeps roundState.hidden');
      assert(/GKACT5\.hiddenAt\(a\.x, a\.z\)\) \|\| \(vis\[keyIdx/.test(g), 'the minimap actor filter drops goblins of a hidden room');
      assert(/hiddenAt: \(x, z\) =>[^}]*A\.hidden\.includes\(k\) && roomKeyAt\(P\.x, P\.z\) !== k/.test(g), 'except for the room I stand in');
      assert(/\/\^stone\\d\/\.test\(d\.actMe\.chan\.n\)/.test(g), 'stone0..2 channels are labelled');
      const ui = require('../act5ui.js'), st = { basins: { NE: 1, SE: 1, SW: 1 } };
      eq(ui.options('tree', 'spring', 'NE', st, {}, { elixir: 0 }).length, 1); eq(ui.options('tree', 'spring', 'NE', st, {}, { sudden: true }).length, 0);
    }],
  ]);
  const srv = await L.startServer({ GK_ROUND_MS: '90000', GK_GRACE_MS: '8000' });
  try {
    fail += await run('tree-rooms-fix', [
      ['Graft end to end: cut a scion, graft the weapon, the vise is READY in actS after 6 s and the owner takes the + twin', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['6', 'graft'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.trees['6'] === 'graft', 2000, 'graft forced');
        c.send({ tp: spot('6', 'C', 1.3) }); await sleep(250);
        c.send({ act: { r: '6', a: 'C', v: 'use' } }); await c.until(x => x.state.inv && x.state.inv.backpack.includes('x:scion'), 3500, 'scion');
        c.send({ tp: spot('6', 'NE', 0.9) }); await sleep(250);
        const w = c.state.inv.weapon; assert(w, 'a weapon');
        c.send({ act: { r: '6', a: 'NE', v: 'choose', x: -1 } });
        await c.until(x => AS(x, '6') && AS(x, '6').st.vise.state === 'run', 2000, 'vise runs');
        await c.until(x => AS(x, '6') && AS(x, '6').st.vise.state === 'ready', 8000, 'vise ready in the public view');
        c.send({ act: { r: '6', a: 'NE', v: 'use' } });
        await c.until(x => x.state.inv && (x.state.inv.backpack.includes(w + '+') || x.state.inv.weapon === w + '+'), 2500, 'the reforged twin');
        await c.close();
      }],
    ]);
  } finally { srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

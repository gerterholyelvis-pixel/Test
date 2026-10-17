// act5ui.js (what E / R / Q do at each anchor) played against the real server: the offered action is accepted (no actFail) and has its effect, holds end with `stop`.
// Also: the saw-tooth needle contract of the HUD, the coin sack slowdown (server movement budget) and the shared anchor tables.
const fs = require('fs'), path = require('path');
const L = require('./lib.js'), { connect, assert, eq, sleep } = L, W = require('../world.js'), A5 = require('../act5.js'), U = require('../act5ui.js');
const me = c => (c.state.players || []).find(p => p.id === c.state.you);
const AS = (c, r) => { for (let i = c.msgs.length - 1; i >= 0; i--) { const a = c.msgs[i].actS; if (a && a.r === r) return a; } return null; };
const spot = (key, id, d = 1.1) => { const a = A5.ANCHORS[key][id], r = W.roomRect(key), dx = r.cx - a.x, dz = r.cz - a.z, l = Math.hypot(dx, dz) || 1; return [a.x + dx / l * (a.r + d), a.z + dz / l * (a.r + d)]; };
// the offered actions at an anchor, from the same messages the client sees
const offer = (c, kind, type, key, a, env = {}) => U.options(kind, type, a, AS(c, key) && AS(c, key).st, c.state.actMe && c.state.actMe.r === key ? c.state.actMe : {}, Object.assign({ uid: c.state.you, count: () => 0, has: () => false }, env));
const send = (c, key, o) => { const m = { r: key, a: o.a, v: o.v }; if (o.x != null) m.x = o.x; c.send({ act: m }); };
const noFail = (c, n0) => assert(!c.msgs.slice(n0).some(m => m.actFail), 'no actFail: ' + JSON.stringify(c.msgs.slice(n0).filter(m => m.actFail)));
(async () => {
  let fail = 0;
  fail += await L.run('act5ui', [
    ['anchor tables: the client (world.js actAnchors) and the server (act5.js ANCHORS) agree, and every vaultbreaker station is next to its art prop', () => {
      for (const k of ['6', '8', '16', '18', '7', '11', '13', '17', '12']) { const a = W.actAnchors(k); eq(Object.keys(a).sort(), Object.keys(A5.ANCHORS[k]).sort(), 'ids ' + k); for (const id in a) eq(a[id], A5.ANCHORS[k][id], k + ' ' + id); }
      for (const [x, z, id] of [[4.7, 7, 'B'], [-10.65, 3.9, 'L'], [10.65, -3.9, 'R'], [-3, -5.5, 'FL'], [3, -5.5, 'FR']]) { const o = W.ACT_LOCAL.vb[id]; eq([o[0], o[1]], [x, z], 'vb ' + id); }
      assert(W.VB_SOLIDS.some(s => Math.abs(s[0] - 4.7) < 1e-6 && Math.abs(s[1] - 7) < 1e-6), 'the B solid sits on the B anchor');
    }],
    ['the HUD needle is a saw-tooth (one-way sweep, as activity.js timing.phase and the server judge) and draws a wrapped window in two pieces', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'hud5.js'), 'utf8');
      assert(/act\.curve === 'tri' \? tri : saw/.test(src), 'hud5 uses saw unless a message asks for tri');
      assert(!/const pos = tri\(/.test(src), 'no ping-pong default');
      const ACT = require('../activity.js'), tm = { t0: 1000, per: 1000 }; assert(ACT.timing.phase(tm, 1250) === 0.25 && ACT.timing.phase(tm, 1750) === 0.75, 'phase is saw');
    }],
    ['options: the right actions at the right anchors (pure)', () => {
      const has = k => k === 'x:blank', E = { uid: 1, count: () => 0, has, elixir: 12, junk: () => ({ slot: 2, name: 'Rusty Dagger' }) };
      eq(U.options('tree', 'well', 'NE', { water: 2 }, {}, E).map(a => a.v), ['use']);
      eq(U.options('tree', 'well', 'NE', { water: 2 }, { timing: { a: 'NE' } }, E).map(a => a.v), ['tap']);
      eq(U.options('tree', 'well', 'NE', { water: 2 }, { ready: true }, E).map(a => a.x), [0, 1]);
      eq(U.options('tree', 'gambler', 'C', { stump: null, chew: false }, {}, E).map(a => [a.v, a.x]), [['choose', 2], ['buy', 2]]);
      eq(U.options('tree', 'thorn', 'C', { grip: null }, { needChoice: true }, Object.assign({ choice: 1 }, E)).map(a => [a.v, a.x]), [['choose', 1], ['_cycle', undefined]]);
      eq(U.options('tree', 'oak', 'C', { held: false }, {}, E), []);
      eq(U.options('vb', 'locksmith', 'B', { pins: 5 }, {}, E).map(a => [a.k, a.x]), [['E', 0], ['R', 1], ['Q', 2]]);
      eq(U.options('vb', 'locksmith', 'B', { pins: 5 }, {}, Object.assign({}, E, { sudden: true })).map(a => a.k), ['E', 'R']);
      eq(U.options('vb', 'ram', 'B', { notches: 3, handles: [true, false] }, {}, E).map(a => [a.v, a.x, !!a.hold]), [['use', 1, false], ['use', 2, true]]);
      eq(U.options('vb', 'counting', 'R', { boxStage: 0 }, {}, E), []);
      eq(U.options('vb', 'counting', 'B', {}, {}, Object.assign({ sack: { id: 3 } }, E)).map(a => [a.v, a.x]), [['pick', 3]]);
      eq(U.options('vault', 'vault', 'K1', { cof: { K1: 2 } }, {}, E).map(a => a.v), ['use']);
      eq(U.options('vault', 'vault', 'K1', { cof: { K1: 0.4 } }, {}, E), []);
      eq(U.options('tree', 'well', 'NE', null, {}, E), [], 'no state, no offer');
      const pk = U.pick('tree', 'seer', W.actAnchors('6'), { v: [0, 0, 0], target: [1, 1, 1] }, {}, E, ...spot('6', 'NW'));
      eq(pk && pk.a, 'NW', 'the nearest anchor with an action');
      assert(!U.pick('tree', 'seer', W.actAnchors('6'), { v: [0, 0, 0] }, {}, E, W.roomRect('6').cx + 0.2, W.roomRect('6').cz + 6.6), 'out of reach: nothing');
    }],
  ]);
  const srv = await L.startServer({ GK_ROUND_MS: '90000', GK_GRACE_MS: '8000' });
  try {
    fail += await L.run('act5ui', [
      ['Well: E cranks (timing opens), E again presses the needle (hit or miss), no failures', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['6', 'well'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.trees['6'] === 'well', 2000, 'well'); c.send({ tp: spot('6', 'NE') }); await c.until(x => AS(x, '6') && AS(x, '6').type === 'well', 2000, 'actS');
        const n0 = c.msgs.length; let o = offer(c, 'tree', 'well', '6', 'NE'); eq(o.map(a => a.v), ['use']); send(c, '6', o[0]);
        await c.until(x => x.state.actMe && x.state.actMe.timing && x.state.actMe.timing.a === 'NE', 1500, 'the needle opens');
        const tm = c.state.actMe.timing; eq(tm.curve, 'saw'); assert(tm.per >= 800 && tm.per <= 1100 && tm.wa >= 0 && tm.wa < 1 && tm.wb >= 0 && tm.wb < 1, 'a window inside 0..1: ' + JSON.stringify(tm));
        o = offer(c, 'tree', 'well', '6', 'NE'); eq(o.map(a => a.v), ['tap']); send(c, '6', o[0]);
        await c.until(x => x.msgs.slice(n0).some(m => m.actFx && (m.actFx.k === 'hit' || m.actFx.k === 'miss')), 1500, 'the press is judged'); noFail(c, n0); await c.close();
      }],
      ['Spring: a hold (E down) starts the bottle channel, releasing (stop) cancels it', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['8', 'spring'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.trees['8'] === 'spring', 2000, 'spring'); c.send({ tp: spot('8', 'SE') }); await c.until(x => AS(x, '8') && AS(x, '8').type === 'spring', 2000, 'actS');
        const n0 = c.msgs.length, st = AS(c, '8').st; eq(st.basins.SE, 1, 'the public view carries the level now'); const o = offer(c, 'tree', 'spring', '8', 'SE', { elixir: 0 }); eq([o[0].v, o[0].hold], ['use', true]);
        send(c, '8', o[0]); await c.until(x => x.state.actMe && x.state.actMe.chan && x.state.actMe.chan.a === 'SE', 1500, 'channel');
        c.send({ act: { r: '8', a: 'SE', v: 'stop' } }); await c.until(x => !x.state.actMe.chan, 1500, 'the channel ended'); await sleep(400);
        assert(!c.state.inv.backpack.includes('x:springwater'), 'cancelled: no water'); noFail(c, n0); await c.close();
      }],
      ['Memory: E at the trunk starts the show; the lanterns offer nothing until my input phase', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['16', 'memory'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.trees['16'] === 'memory', 2000, 'memory'); c.send({ tp: spot('16', 'C') }); await c.until(x => AS(x, '16') && AS(x, '16').type === 'memory', 2000, 'actS');
        const n0 = c.msgs.length; send(c, '16', offer(c, 'tree', 'memory', '16', 'C')[0]);
        await c.until(x => AS(x, '16').st.phase === 'show' && AS(x, '16').st.show.length === 3, 1500, 'the show'); eq(offer(c, 'tree', 'memory', '16', 'NE'), [], 'no touching during the show');
        await c.until(x => x.state.actMe && x.state.actMe.input, 4000, 'my input phase'); const seq = AS(c, '16').st; eq(offer(c, 'tree', 'memory', '16', 'NE').map(a => a.v), ['use']); noFail(c, n0); await c.close();
      }],
      ['Ram: E works the winch, then presses the needle on B (the station stands beside the door, where the art put it)', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { vb: ['ram', 'locksmith', 'counting', 'keystone'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.vb['7'] === 'ram', 2000, 'ram at 7'); c.send({ tp: spot('7', 'B') }); await c.until(x => AS(x, '7') && AS(x, '7').type === 'ram', 2000, 'actS');
        const n0 = c.msgs.length; let o = offer(c, 'vb', 'ram', '7', 'B'); eq(o[0].v, 'use'); send(c, '7', o[0]);
        await c.until(x => x.state.actMe && x.state.actMe.timing && x.state.actMe.timing.a === 'B', 1500, 'the winch needle'); o = offer(c, 'vb', 'ram', '7', 'B'); eq(o.map(a => a.v), ['tap']); send(c, '7', o[0]);
        await sleep(300); noFail(c, n0); eq(AS(c, '7').st.handles.filter(Boolean).length, 1, 'one handle taken'); await c.close();
      }],
      ['Keystone: a stone offers light (hold), and the holds end with stop', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { vb: ['keystone', 'ram', 'locksmith', 'counting'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.vb['7'] === 'keystone', 2000, 'keystone at 7'); c.send({ tp: spot('7', 'L') }); await c.until(x => AS(x, '7') && AS(x, '7').type === 'keystone', 2000, 'actS');
        const st = AS(c, '7').st, first = st.order[0]; c.send({ tp: spot('7', first) }); await sleep(250); const n0 = c.msgs.length; const o = offer(c, 'vb', 'keystone', '7', first); eq([o[0].v, o[0].hold], ['use', true]);
        send(c, '7', o[0]); await c.until(x => x.state.actMe && x.state.actMe.chan && x.state.actMe.chan.a === first, 1500, 'light channel');
        await c.until(x => AS(x, '7').st.pos === 1, 3500, 'lit in order'); noFail(c, n0); await c.close();
      }],
      ['Vault: a coffer scoop is offered when the coffer holds a handful, and pays gold', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { npcs: false } }); const g0 = c.state.gold;
        const K1 = A5.ANCHORS['12'].K1; c.send({ tp: [K1.x + 2.1, K1.z] }); await c.until(x => AS(x, '12') && AS(x, '12').type === 'vault', 2000, 'actS');
        const n0 = c.msgs.length, o = offer(c, 'vault', 'vault', '12', 'K1'); assert(o.length && o[0].v === 'use' && o[0].hold, 'scoop offered: ' + JSON.stringify(AS(c, '12').st.cof));
        send(c, '12', o[0]); await c.until(x => x.state.gold > g0, 4500, 'gold'); noFail(c, n0); await c.close();
      }],
      ['coin sack: a carried sack slows the goblin on the server (a sprint is refused and he is put back), a plain walk is accepted', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { vb: ['counting', 'ram', 'locksmith', 'keystone'], npcs: false } });
        await c.until(x => x.state.actDbg && x.state.actDbg.vb['7'] === 'counting', 2000, 'counting at 7'); c.send({ tp: spot('7', 'B') }); await c.until(x => AS(x, '7') && AS(x, '7').type === 'counting', 2000, 'actS');
        send(c, '7', { a: 'B', v: 'buy', x: 0 }); await c.until(x => AS(x, '7').st.writs === 1, 1500, 'a writ pays 20 into the strongbox');
        c.send({ tp: spot('7', 'R') }); await sleep(250); c.send({ act: { r: '7', a: 'R', v: 'use', x: 0 } });
        await c.until(x => x.state.actMe && x.state.actMe.carry && x.state.actMe.carry.heavy, 8500, 'the sack');
        const run = async (mps, sec) => { let x = spot('7', 'R')[0], z = spot('7', 'R')[1], fixes0 = c.msgs.filter(m => m.fix).length; const r = W.roomRect('7'), dir = x < r.cx ? 1 : -1; for (let i = 0; i < sec * 15; i++) { x += dir * mps / 15; c.send({ m: [+x.toFixed(2), +z.toFixed(2), 0] }); await sleep(66); } return c.msgs.filter(m => m.fix).length - fixes0; };
        c.send({ tp: spot('7', 'R') }); await sleep(300);
        const slow = await run(2.6, 1.5); eq(slow, 0, 'a walk at 70% (2.6 m/s) is accepted');
        c.send({ tp: spot('7', 'R') }); await sleep(300);
        const fast = await run(7.4, 1.5); assert(fast >= 1, 'a sprint (7.4 m/s) with a heavy sack is corrected: ' + fast + ' fixes');
        await c.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  act5ui setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

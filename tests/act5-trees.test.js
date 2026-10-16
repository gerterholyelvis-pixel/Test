// act5.js (special rooms server glue): anchors, the act message validation, a tree room activity end to end (Seer, Healing Spring), reconnect.
const L = require('./lib.js'), { connect, assert, eq, sleep } = L, W = require('../world.js'), A5 = require('../act5.js');
const me = c => (c.state.players || []).find(p => p.id === c.state.you);
const AS = (c, r) => { for (let i = c.msgs.length - 1; i >= 0; i--) { const a = c.msgs[i].actS; if (a && a.r === r) return a; } return null; };   // the latest actS of room r (neighbour rooms send theirs too)
const spot = (key, id, d = 1.1) => { const a = A5.ANCHORS[key][id], r = W.roomRect(key), dx = r.cx - a.x, dz = r.cz - a.z, l = Math.hypot(dx, dz) || 1; return [a.x + dx / l * (a.r + d), a.z + dz / l * (a.r + d)]; };   // a standing spot in reach of an anchor
(async () => {
  let fail = 0;
  fail += await L.run('act5-trees', [['anchors: every activity room has its props inside its walls, vaultbreakers face the vault', async () => {
    for (const k of ['6', '8', '16', '18', '7', '11', '13', '17', '12']) {
      const r = W.roomRect(k), an = A5.ANCHORS[k]; assert(an && Object.keys(an).length >= 6, 'anchors of ' + k);
      for (const id of Object.keys(an)) { const a = an[id]; assert(Math.abs(a.x - r.cx) < r.hw - 0.2 && Math.abs(a.z - r.cz) < r.hd - 0.2, k + ' ' + id + ' inside'); eq(W.roomKeyOf(a.x, a.z), k, k + ' ' + id + ' room'); }
    }
    for (const k of ['7', '11', '13', '17']) {   // F (the ram lane) is next to the vault door, B is on the far wall
      const an = A5.ANCHORS[k], v = W.rc(W.VAULT), dF = Math.hypot(an.F.x - v[0], an.F.z - v[1]), dB = Math.hypot(an.B.x - v[0], an.B.z - v[1]);
      assert(dF + 10 < dB, k + ' F near the vault door'); const d = W.DOORS[A5.VB_DOOR[k]]; assert((d.a === k && d.b === W.VAULT_KEY) || (d.b === k && d.a === W.VAULT_KEY), k + ' vault door');
    }
  }]]);
  const srv = await L.startServer({ GK_ROUND_MS: '60000', GK_GRACE_MS: '8000' });
  try {
    fail += await L.run('act5-trees', [
      ['welcome: 4 distinct tree types and the vaultbreaker layout', async () => {
        const c = await connect(srv.port);
        const t = c.state.trees || c.state.matchStart.trees; eq(Object.keys(t).sort(), ['16', '18', '6', '8']); eq(new Set(Object.values(t)).size, 4, 'no duplicates');
        eq(Object.keys(c.state.vb).sort(), ['11', '13', '17', '7']); eq(new Set(Object.values(c.state.vb)).size, 4);
        eq(Object.keys(c.state.breach).length, 4); await c.close();
      }],
      ['Seer: turning the rings to the eye pays +3 knowledge and a map pulse', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['6', 'seer'] } });
        await c.until(x => x.state.actDbg && x.state.actDbg.trees['6'] === 'seer', 2000, 'seer forced');
        const k0 = me(c).stats.knowledge, S = ['NE', 'NW', 'SE'];
        c.send({ tp: spot('6', 'NE') }); await c.until(x => AS(x, '6') && AS(x, '6').type === 'seer', 2000, 'actS on entry');
        for (let i = 0; i < 3; i++) {
          c.send({ tp: spot('6', S[i]) }); await sleep(120);
          let st = AS(c, '6').st;
          for (let n = 0; n < 6 && st.v[i] !== st.target[i]; n++) { c.send({ act: { r: '6', a: S[i], v: 'use' } }); await sleep(560); st = AS(c, '6').st; if (st.solves) break; }
          if (AS(c, '6').st.solves) break;
        }
        await c.until(x => x.msgs.some(m => m.actFx && m.actFx.k === 'pulse'), 3000, 'pulse');
        const pu = c.msgs.find(m => m.actFx && m.actFx.k === 'pulse').actFx; eq(pu.ms, 8000); assert(Array.isArray(pu.gob), 'pulse goblins');
        await c.until(x => me(x).stats.knowledge >= k0 + 3, 3000, 'knowledge +3');
        assert(c.msgs.some(m => typeof m.toast === 'string' && /consulted the Seer/.test(m.toast)), 'the Seer toast');
        assert(!c.msgs.some(m => m.actFail), 'no failures: ' + JSON.stringify(c.msgs.filter(m => m.actFail)));
        await c.close();
      }],
      ['Healing Spring: a 2 s channel bottles Spring Water (actMe arc), which heals 20', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['8', 'spring'] } });
        await c.until(x => x.state.actDbg && x.state.actDbg.trees['8'] === 'spring', 2000, 'spring forced');
        c.send({ tp: spot('8', 'NE') }); await sleep(200);
        c.send({ act: { r: '8', a: 'NE', v: 'use' } });
        await c.until(x => x.state.actMe && x.state.actMe.chan && x.state.actMe.chan.a === 'NE', 1500, 'channel arc');
        eq(c.state.actMe.chan.ms, 2000);
        await c.until(x => x.state.inv && x.state.inv.backpack.includes('x:springwater'), 3500, 'Spring Water');
        await c.until(x => AS(x, '8') && AS(x, '8').st.basins && AS(x, '8').st.basins.NE === 0, 1500, 'the basin is empty');
        const slot = 'b' + c.state.inv.backpack.indexOf('x:springwater'); c.send({ hp: 1 }); await sleep(150);
        c.send({ use: slot }); await c.until(x => x.msgs.some(m => m.used && m.used.key === 'x:springwater'), 2000, 'used');
        eq(c.msgs.find(m => m.used && m.used.key === 'x:springwater').used.hp, Math.min(20, me(c).stats.maxHealth - 1));
        await c.close();
      }],
      ['validation: wrong room and unknown anchors are dropped, too far says far, 8 acts per second, malformed acts never crash', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['6', 'seer'] } }); await sleep(150);
        const [cx, cz] = L.centre('6'); c.send({ tp: [cx, cz + 3] }); await sleep(200);
        c.send({ act: { r: '8', a: 'NE', v: 'use' } }); c.send({ act: { r: '6', a: 'XX', v: 'use' } }); c.send({ act: { r: '6', a: 'NE', v: 'fly' } }); await sleep(250);
        assert(!c.msgs.some(m => m.actFail), 'dropped silently');
        c.send({ tp: [cx - 4, cz + 5] }); await sleep(150); c.send({ act: { r: '6', a: 'NE', v: 'use' } });
        await c.until(x => x.state.actFail === 'far', 1500, 'far');
        await sleep(1100); const n0 = c.msgs.filter(m => m.actFail).length; for (let i = 0; i < 20; i++) c.send({ act: { r: '6', a: 'NE', v: 'use' } }); await sleep(400);
        const n = c.msgs.filter(m => m.actFail).length - n0; assert(n >= 6 && n <= 8, 'rate limit: ' + n + ' answers to 20 acts');
        await sleep(1100);
        for (const bad of [null, 1, 'x', [], {}, { r: 6, a: 'NE', v: 'use' }, { r: '6', a: 'NE', v: 'use', x: 1e9 }, { r: '6'.repeat(40), a: 'NE', v: 'use' }, { r: '6', a: { y: 1 }, v: 'use' }, { r: '__proto__', a: 'constructor', v: 'use' }]) c.send({ act: bad });
        c.send({ tp: L.centre('7') }); await sleep(150); for (const v of ['use', 'tap', 'stop', 'pick', 'drop', 'buy', 'choose']) for (const a of ['B', 'L', 'R', 'F', 'FL', 'FR']) c.send({ act: { r: '7', a, v, x: 63 } });
        c.send({ tp: L.centre('12') }); await sleep(1100); for (const v of ['use', 'stop', 'tap']) for (const a of ['K1', 'D_N', 'dais', 'grate']) c.send({ act: { r: '12', a, v, x: -1 } });
        await sleep(400); c.send({ ping: 1 }); await c.until(x => x.state.pong === 1, 2000, 'server still answers');
        assert(srv.alive(), 'server alive'); assert(!/act5 /.test(srv.out()), 'no act5 errors: ' + srv.out().slice(-600));
        await c.close();
      }],
      ['reconnect: the resumed goblin gets the trees, his room state and the crown', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { tree: ['16', 'seer'] } }); await sleep(150);
        c.send({ tp: spot('16', 'NE') }); await c.until(x => AS(x, '16'), 2000, 'actS');
        const tok = c.state.token; c.ws.terminate(); await sleep(300);
        const d = await L.connectRaw(srv.port, 'token=' + tok);
        await d.until(x => x.state.resumed && x.state.trees && AS(x, '16') && 'crown' in x.state, 3000, 'resume state');
        eq(d.state.trees['16'], 'seer'); await d.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  act5-trees setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

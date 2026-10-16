// act5.js: vaultbreaker heists wired into the vault vote. The Keystone circuit arms and its room's vault pick opens the door alone;
// Counting House writs and counter-writs move the vote at once; the shuffle re-keys the rooms at the round boundary; wisps snuff stones.
const L = require('./lib.js'), { connect, assert, eq, sleep } = L, W = require('../world.js'), A5 = require('../act5.js');
const S = (c, r) => { for (let i = c.msgs.length - 1; i >= 0; i--) { const a = c.msgs[i].actS; if (a && a.r === r) return a; } return null; };   // the latest actS of room r (neighbour rooms send theirs too)
const spot = (key, id, d = 1.1) => { const a = A5.ANCHORS[key][id], r = W.roomRect(key), dx = r.cx - a.x, dz = r.cz - a.z, l = Math.hypot(dx, dz) || 1; return [a.x + dx / l * (a.r + d), a.z + dz / l * (a.r + d)]; };
const STONES = ['L', 'R', 'FL', 'FR'];
async function keystone(srv, npcs) {   // a solo match with the Keystone in room 7, its circuit lit in order
  const c = await connect(srv.port); c.send({ actDbg: { vb: ['keystone', 'ram', 'locksmith', 'counting'], npcs } });
  await c.until(x => x.state.vb && x.state.vb['7'] === 'keystone', 2000, 'layout forced');
  c.send({ tp: spot('7', 'B') }); await c.until(x => S(x, '7') && S(x, '7').type === 'keystone', 2000, 'actS');
  const order = S(c, '7').st.order.slice(); eq(order.length, 4);
  for (const id of order) {
    c.send({ tp: spot('7', id) }); await sleep(150);
    c.send({ act: { r: '7', a: id, v: 'use' } });
    await c.until(x => x.state.actMe && x.state.actMe.chan && x.state.actMe.chan.a === id, 1500, 'channel at ' + id);
    await c.until(x => S(x, '7').st.lit[STONES.indexOf(id)] > 0, 3500, id + ' lit');
  }
  await c.until(x => S(x, '7').st.armed === true, 2000, 'armed');
  return c;
}
(async () => {
  const srv = await L.startServer({ GK_ROUND_MS: '60000', GK_NEXT_ROUND_MS: '60000' }); let fail = 1;
  try {
    fail = await L.run('act5-heist', [
      ['Counting House: a writ adds a vault vote at once, a counter-writ cancels it, the strongbox takes the gold', async () => {
        const c = await connect(srv.port); c.send({ actDbg: { vb: ['counting', 'ram', 'locksmith', 'keystone'] } });
        await c.until(x => x.state.vb && x.state.vb['7'] === 'counting', 2000, 'layout forced');
        c.send({ tp: spot('7', 'B') }); await sleep(200);
        c.send({ sel: A5.VB_DOOR['7'] }); await c.until(x => x.state.vaultVotes === 1, 2000, 'one vote');
        const g0 = c.state.gold; c.send({ act: { r: '7', a: 'B', v: 'buy', x: 0 } });
        await c.until(x => x.state.vaultVotes === 2, 2000, 'the writ is a second vote');
        eq(c.state.gold, g0 - 20); eq(c.state.writs['7'], 1);
        await c.until(x => S(x, '7') && S(x, '7').st.writs === 1, 1500, 'actS writs');
        c.send({ act: { r: '7', a: 'B', v: 'buy', x: 1 } });   // the counter-writ costs 1.5 x the next writ price (30) = 45
        await c.until(x => x.state.vaultVotes === 1, 2000, 'counter-writ');
        eq(c.state.gold, g0 - 20 - 45); eq(S(c, '7').st.boxStage, 1, 'the box holds 65+ gold');
        await c.close();
      }],
      ['Keystone: lighting the circuit in order arms it; its room alone opens its vault door at the round end; re-key', async () => {
        const c = await keystone(srv, false);
        await c.until(x => (x.state.armed || []).includes('7'), 2000, 'roundState armed');
        await c.until(x => x.state.inv.backpack.includes('x:runecharge'), 2000, 'Rune Charge for the fourth stone');
        assert(c.msgs.some(m => m.toast === 'KEYSTONE ARMED'), 'announced');
        c.send({ sel: A5.VB_DOOR['7'] }); await c.until(x => x.state.vaultVotes === 2, 2000, 'an armed Keystone pick is 2 votes');
        const vb1 = { ...c.state.vb }; c.send({ dbgFF: 1 });
        await c.until(x => x.state.round.n === 2, 14000, 'round 2');
        assert(c.state.open.includes(A5.VB_DOOR['7']), 'the vault door opened: ' + JSON.stringify([c.state.open, c.state.lastSel, c.state.fizzled]));
        for (const k of Object.keys(vb1)) assert(c.state.vb[k] !== vb1[k], 'every type moved (derangement)');
        assert(c.msgs.some(m => m.actFx && m.actFx.k === 'rekey' && m.actFx.r === '7'), 'the room re-keyed');
        await c.close();
      }],
      ['Keystone resonance: a wisp rises from the socket and snuffs a lit stone', async () => {
        const c = await keystone(srv, true);
        await c.until(x => (x.state.players || []).some(p => p.npc === 'wisp'), 3000, 'a wisp');
        await c.until(x => x.msgs.some(m => m.actFx && m.actFx.k === 'wispsnuff'), 12000, 'wisp snuff');
        await c.until(x => S(x, '7').st.armed === false, 2000, 'disarmed');
        await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  act5-heist setup: ' + e.message); }
  if (/act5 /.test(srv.out())) { fail = 1; console.log('  FAIL  act5-heist: server errors\n' + srv.out().slice(-1500)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

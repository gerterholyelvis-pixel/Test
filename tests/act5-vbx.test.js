// VBX through the real server (act5.js + vb5.js + vbx5.js): a full heist that uses the extra stations of all four rooms on the way.
// Ram: forge a head, wind 6, strike: 21 breach instead of 18; climb the tower (vault report). Locksmith: Steady Hands, then a Key Blank becomes a Skeleton Key at the bench.
// Counting House: belt wage, an IOU loan collected at the end of the next round, the ledger. Keystone: a Rune Charge carved, then used at the Ram lever.
// GK_DEBUG actDbg {hit:true} makes this goblin's timing presses hit, so the test is deterministic (the judge itself is covered in activity / vb5 tests).
const L = require('./lib.js'), { connect, assert, eq, sleep } = L, W = require('../world.js'), A5 = require('../act5.js');
const S = (c, r) => { for (let i = c.msgs.length - 1; i >= 0; i--) { const a = c.msgs[i].actS; if (a && a.r === r) return a; } return null; };
const spot = (key, id, d = 1.1) => { const a = A5.ANCHORS[key][id], r = W.roomRect(key), dx = r.cx - a.x, dz = r.cz - a.z, l = Math.hypot(dx, dz) || 1; return [a.x + dx / l * (a.r + d), a.z + dz / l * (a.r + d)]; };
const act = (c, a, v, x) => c.send({ act: Object.assign({ r: '7', a, v }, x == null ? {} : { x }) });
const noFail = (c, n0, what) => { const f = c.msgs.slice(n0).filter(m => m.actFail); assert(!f.length, what + ': ' + JSON.stringify(f)); };
async function layout(c, order) { c.send({ actDbg: { vb: order } }); await c.until(x => x.state.actDbg && x.state.actDbg.vb && x.state.actDbg.vb['7'] === order[0] && S(x, '7') && S(x, '7').type === order[0], 3000, order[0] + ' at 7'); }
async function at(c, id) { c.send({ tp: spot('7', id) }); await sleep(220); }
async function taps(c, a, n) { act(c, a, 'use'); await c.until(x => x.state.actMe && x.state.actMe.timing && x.state.actMe.timing.a === a, 1500, 'needle at ' + a); for (let i = 0; i < n; i++) { act(c, a, 'tap'); await sleep(140); } }
(async () => {
  const srv = await L.startServer({ GK_ROUND_MS: '90000', GK_NEXT_ROUND_MS: '90000' }); let fail = 1;
  try {
    const c = await connect(srv.port); c.send({ actDbg: { npcs: false, hit: true, parts: { metal: 20, wood: 6, cloth: 2, bone: 2 }, gold: 100 } }); c.send({ tp: spot('7', 'B') }); await sleep(200);
    fail = await L.run('act5-vbx', [
      ['Ram: a forged head makes a 6-notch strike breach 21; the siege tower reports the vault', async () => {
        await layout(c, ['ram', 'locksmith', 'counting', 'keystone']); const n0 = c.msgs.length, door = A5.VB_DOOR['7'];
        await at(c, 'S1'); act(c, 'S1', 'use', 0); await c.until(x => S(x, '7').st.x.head === 1, 5000, 'head forged');
        await at(c, 'B'); await taps(c, 'B', 6); await c.until(x => S(x, '7').st.notches === 6, 2000, '6 notches');
        await at(c, 'FL'); act(c, 'FL', 'use', 0); await c.until(x => x.state.breach && x.state.breach[door] === 21, 4000, 'breach 21');
        eq(S(c, '7').st.x.wear, 1, 'the winch wore');
        await at(c, 'S2'); act(c, 'S2', 'use'); await c.until(x => x.msgs.slice(n0).some(m => typeof m.toast === 'string' && /^The vault/.test(m.toast)), 5000, 'vault report');
        assert(c.msgs.slice(n0).some(m => m.actFx && m.actFx.k === 'pulse'), 'map pulse'); noFail(c, n0, 'ram');
      }],
      ['Locksmith: practice gives Steady Hands; a blank (grindstone) becomes a Skeleton Key at the bench', async () => {
        await layout(c, ['locksmith', 'ram', 'counting', 'keystone']); const n0 = c.msgs.length;
        await at(c, 'S2'); await taps(c, 'S2', 5); await c.until(x => x.state.actMe && x.state.actMe.vx && x.state.actMe.vx.steady, 2000, 'steady');
        await at(c, 'L'); act(c, 'L', 'use', 0); await c.until(x => x.state.inv.backpack.includes('x:blank'), 5000, 'blank');
        await at(c, 'S1'); await taps(c, 'S1', 3); await c.until(x => x.state.inv.backpack.includes('x:skeleton') && !x.state.inv.backpack.includes('x:blank'), 2000, 'skeleton key'); noFail(c, n0, 'locksmith');
      }],
      ['Keystone: a Rune Charge carved at the altar', async () => {
        await layout(c, ['keystone', 'ram', 'locksmith', 'counting']); const n0 = c.msgs.length;
        await at(c, 'S1'); await taps(c, 'S1', 4); await c.until(x => x.state.inv.backpack.includes('x:runecharge'), 2000, 'rune charge'); noFail(c, n0, 'keystone');
      }],
      ['Counting House: belt wage, the ledger, an IOU collected at the end of the next round', async () => {
        await layout(c, ['counting', 'ram', 'locksmith', 'keystone']); c.send({ actDbg: { box: 120, gold: 10 } }); await c.until(x => x.state.gold === 10, 1500, 'gold set'); const n0 = c.msgs.length;
        await at(c, 'S1'); await taps(c, 'S1', 5); await c.until(x => x.state.gold === 14, 2000, 'wage 4');
        await at(c, 'S4'); act(c, 'S4', 'use', 0); await c.until(x => x.state.gold === 54, 2000, 'loan 40'); await c.until(x => x.state.actMe.vx && x.state.actMe.vx.debt === 50, 1500, 'debt shown');
        await at(c, 'S3'); act(c, 'S3', 'use'); await c.until(x => x.msgs.slice(n0).some(m => m.actFx && m.actFx.k === 'ledger' && /IOUs: .*owes 50/.test(m.actFx.lines.join(' '))), 4000, 'ledger');
        noFail(c, n0, 'counting');
        c.send({ dbgFF: 1 }); await c.until(x => x.state.round && x.state.round.n === 2, 15000, 'round 2'); 
        c.send({ dbgFF: 1 }); await c.until(x => x.state.round && x.state.round.n === 3, 15000, 'round 3'); await c.until(x => x.msgs.some(m => typeof m.toast === 'string' && /collected your IOU/.test(m.toast)), 3000, 'IOU collected');
      }],
    ]);
    await c.close();
  } catch (e) { console.log('  FAIL  act5-vbx setup: ' + e.message); }
  if (/act5 /.test(srv.out())) { fail = 1; console.log('  FAIL  act5-vbx: server errors\n' + srv.out().slice(-1500)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// experimental rules (GK_RULES): off = nothing changes, on = the rule works. See docs/reports/rules-experimental.md
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
const D = L.doors(), door = (a, b) => D.find(d => (d.a === a && d.b === b) || (d.a === b && d.b === a)).id;
const count = (c, k) => c.msgs.filter(m => m[k] !== undefined && m[k] !== null).length;
const equip = async (c, key) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack[0] === key, 2000, key); c.send({ mv: ['b0', 'weapon'] }); await c.until(x => x.state.inv.weapon === key, 2000, 'equipped'); };
(async () => {
  const SHORT = { GK_ROUND_MS: '1800', GK_NEXT_ROUND_MS: '1800', GK_BOT_GRACE_MS: '0' };
  const NONE = { GK_RULES: 'none' };   // staffbolt and bribe are ON by default now (docs/reports/balance.md); the "off" servers turn everything off explicitly
  const off = await L.startServer({ GK_CROWN_MS: '800', ...NONE }), offShort = await L.startServer({ ...SHORT, ...NONE }), offTwo = await L.startServer({ GK_MATCH_SIZE: '2', ...NONE });
  const crown = await L.startServer({ GK_RULES: 'none,crown', GK_CROWN_MS: '1500', GK_MATCH_SIZE: '2' }), dclose = await L.startServer({ GK_RULES: 'none,doorclose', ...SHORT });
  const staff = await L.startServer({ GK_RULES: 'none,staffbolt', GK_MATCH_SIZE: '2' }), bribe = await L.startServer({ GK_RULES: 'none,bribe', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500' });
  const offBribe = await L.startServer({ GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500', ...NONE }); let fail = 1;
  const pair = (srv, qa = '', qb = '') => Promise.all([connect(srv.port, 'goblin=2' + qa), connect(srv.port, 'goblin=3' + qb)]);
  try {
    fail = await L.run('rules', [
      ['all rules off: no rules field, crown / bribe / staff bolt do nothing', async () => {
        const c = await connect(off.port, 'goblin=3'); eq(c.state.rules, undefined, 'welcome must not advertise rules when none are on');
        c.send({ tp: [0, 0] }); await sleep(1400); assert(!c.state.won && count(c, 'crown') === 0, 'standing on the dais must not crown anyone');
        c.send({ tp: W.rc(0) }); c.send({ sel: door('0', '1') }); c.send({ bribe: 1 }); await sleep(300); eq(c.state.gold, 100, 'bribe is ignored'); eq(count(c, 'bribeFail'), 0);
        c.send({ atk: 1 }); await sleep(500); eq(count(c, 'bolt'), 0, 'no bolt without the rule'); await c.close();
      }],
      ['doorclose off: a picked door is open for one round only', async () => {
        const c = await connect(offShort.port); c.send({ tp: W.rc(0) }); const id = door('0', '1'); c.send({ sel: id });
        await c.until(x => x.state.round.n === 2 && x.state.open.includes(id), 4000, 'door open in round 2'); eq(c.state.openLeft, undefined);
        await c.until(x => x.state.round.n === 3, 4000, 'round 3'); eq(c.state.open.includes(id), false, 'closed again in round 3'); await c.close();
      }],
      ['crown: stand on the dais, be hit and the count restarts, then you are crowned and the other goblin dies', async () => {
        const [a, b] = await pair(crown); eq(a.state.rules, ['crown']);
        a.send({ tp: [0, 0] }); await a.until(x => x.state.crown && x.state.crown.id === a.state.you, 2000, 'crown progress');
        assert(a.msgs.some(m => m.feed && /claiming the crown/.test(m.feed.msg || '')), 'global alert'); assert(b.msgs.some(m => m.feed && /claiming the crown/.test(m.feed.msg || '')), 'the others get the alert too');
        await sleep(600); b.send({ tp: [-2.4, 0] }); await sleep(100); b.send({ m: [-2.4, 0, -Math.PI / 2] }); b.send({ atk: 1 });   // b is off the dais (west side: the relic pedestal stands at +2.4), hits a from 2.4 m
        await a.until(x => x.msgs.some(m => m.hit && m.hit.to === x.state.you), 1500, 'a was hit'); const hitAt = a.msgs.length;
        await a.until(x => x.msgs.slice(hitAt).some(m => m.crown && m.crown.p < 0.4), 1500, 'progress restarts after damage');
        await a.until(x => x.state.won, 4000, 'crowned'); await b.until(x => x.state.died, 2000, 'the beaten goblin is out'); await b.until(x => x.state.matchEnd, 2000, 'match end'); eq(b.state.matchEnd.crown, 1);
        await a.close(); await b.close();
      }],
      ['crown: leaving the dais resets the count', async () => {
        const [a, b] = await pair(crown); a.send({ tp: [0, 0] }); await sleep(900); a.send({ tp: [5, 5] }); await sleep(300); a.send({ tp: [0, 0] });
        await sleep(900); assert(!a.state.won, 'after leaving, 900 ms more on the dais is not enough for a 1.5 s crown'); await a.close(); await b.close();
      }],
      ['doorclose on: a picked door stays open two rounds, the klaxon warns, then it closes', async () => {
        const c = await connect(dclose.port); eq(c.state.rules, ['doorclose']); c.send({ tp: W.rc(0) }); const id = door('0', '1'); c.send({ sel: id });
        await c.until(x => x.state.round.n === 2 && x.state.open.includes(id), 4000, 'open in round 2'); eq(c.state.openLeft[id], 2);
        await c.until(x => x.state.round.n === 3, 4000, 'round 3'); assert(c.state.open.includes(id), 'still open in round 3'); eq(c.state.openLeft[id], 1);
        await c.until(x => x.msgs.some(m => m.klaxon && m.klaxon.doors.includes(id)), 3000, 'klaxon before the door closes');
        await c.until(x => x.state.round.n === 4, 4000, 'round 4'); assert(!c.state.open.includes(id), 'closed in round 4'); await c.close();
      }],
      ['staffbolt off: a wizard 3 m from an enemy cannot hurt it (melee only)', async () => {
        const [a, b] = await pair(offTwo); a.send({ tp: W.rc(0) }); b.send({ tp: [W.rc(0)[0] + 3, W.rc(0)[1]] }); await sleep(150);
        a.send({ m: [W.rc(0)[0], W.rc(0)[1], -Math.PI / 2] }); a.send({ atk: 1 }); await sleep(900); eq(count(a, 'bolt'), 0); assert(!b.msgs.some(m => m.hit), 'nobody was hit'); await a.close(); await b.close();
      }],
      ['staffbolt on: a bolt flies 3 m, deals 9, 1.0 s cooldown', async () => {
        const [a, b] = await pair(staff); eq(a.state.rules, ['staffbolt']); const [x, z] = W.rc(0); a.send({ tp: [x, z] }); b.send({ tp: [x + 3, z] }); await sleep(150);
        await equip(a, 'w:staff'); a.send({ m: [x, z, -Math.PI / 2] }); a.send({ atk: 1 });
        await a.until(c => c.msgs.some(m => m.bolt && m.bolt.by === c.state.you), 1000, 'bolt message'); const t0 = Date.now();
        await a.until(c => c.msgs.some(m => m.hit && m.hit.from === c.state.you && m.hit.dmg === 9), 3000, 'bolt hit for 9'); assert(Date.now() - t0 > 150, 'a bolt is slow, not instant');
        await a.until(c => c.msgs.some(m => m.boltEnd && m.boltEnd.hit), 1000, 'boltEnd');
        await sleep(300); a.send({ atk: 1 }); await sleep(400); eq(count(a, 'bolt'), 1, 'second shot inside the cooldown is ignored');
        await sleep(900); a.send({ atk: 1 }); await a.until(c => count(c, 'bolt') === 2, 1500, 'second bolt after the cooldown'); await a.close(); await b.close();
      }],
      ['bribe off: a lone vault vote fizzles and the bribe does nothing', async () => {
        const c = await connect(offBribe.port); c.send({ tp: W.rc(1) }); const v = door('1', '4'); c.send({ sel: v }); c.send({ bribe: 1 }); await sleep(200); eq(c.state.gold, 100);
        await c.until(x => x.state.round.n === 2, 4000, 'round 2'); assert(!c.state.open.includes(v), 'one room alone cannot open the vault'); assert(c.state.fizzled.includes(v)); await c.close();
      }],
      ['bribe on: 50 gold adds +1 weight, so one room can open the vault; failures are reported', async () => {
        const c = await connect(bribe.port); await sleep(150); eq(c.state.rules, ['bribe']);   /* phase flips to play on the next 50 ms tick after GO */ c.send({ tp: W.rc(1) });
        c.send({ bribe: 1 }); await c.until(x => x.state.bribeFail, 1500, 'no pick yet'); eq(c.state.bribeFail, 'pick'); delete c.state.bribeFail;
        const v = door('1', '4'); c.send({ sel: v }); await c.until(x => x.state.sel && x.state.sel['1'] === v, 1500, 'pick'); c.send({ bribe: 1 });
        await c.until(x => x.state.gold === 50 && x.state.bribes && x.state.bribes['1'] === 1, 1500, 'paid 50, weight 2'); await c.until(x => x.state.vaultVotes === 2, 1500, 'vault votes 2/2');
        c.send({ gold: 10 }); await c.until(x => x.state.gold === 10, 1000, 'gold 10'); c.send({ bribe: 1 }); await c.until(x => x.state.bribeFail, 1500, 'too poor'); eq(c.state.bribeFail, 'gold');
        await c.until(x => x.state.round.n === 2, 4000, 'round 2'); assert(c.state.open.includes(v), 'the bribed vault door opened'); eq(c.state.bribes['1'], undefined, 'bribes reset every round'); await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup: ' + (e.stack || e)); }
  for (const s of [off, offShort, offTwo, crown, dclose, staff, bribe, offBribe]) s.stop(); process.exit(fail ? 1 : 0);
})();

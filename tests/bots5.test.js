// bots5 (task G, docs/reports/bots5.md), scripted part: one bot at a time is given a goal ({bot5:{goal}}, GK_DEBUG) and must finish it through the same
// server paths a player uses: the home recycler, the Sapling Well (crank, timing presses, drink) and the Keystone circuit (4 ordered stones) through {act},
// and the crown dais in a late round. Long rounds (no re-key mid-test) and a long bot grace (no fights). The all-bot matches are in bots5-sim.test.js.
const L = require('./lib.js'), { connect, sleep, assert } = L;
const bot5 = async (c, cmd) => { const n = c.msgs.length; c.send({ bot5: cmd || 1 }); await c.until(x => x.msgs.slice(n).some(m => m.bot5), 2000, 'bot5'); return c.msgs.slice(n).find(m => m.bot5).bot5; };
async function waitFor(c, pred, ms, what) { const t0 = Date.now(); let s = null; while (Date.now() - t0 < ms) { await sleep(500); s = await bot5(c); if (pred(s)) return s; } throw new Error('timeout: ' + what + ' ' + JSON.stringify(s && { rewards: s.rewards, lab: s.lab, tree: s.tree, vb: s.vb, claims: s.claims, leaveWhy: s.leaveWhy })); }

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '90000', GK_BOT_GRACE_MS: '120000', GK_SUDDEN_ROUND: '2' }); let fail = 1;
  try {
    fail = await L.run('bots5', [
      ['home routine: a bot carrying junk works its own home recycler (one click per beat, the player recycle path)', async () => {
        const c = await connect(srv.port, 'wins=0');
        c.send({ botlab: { nav: { backpack: ['w:stick', 'w:stick', 'w:stick'] } } }); await c.until(x => x.state.botlab, 2000, 'botlab');
        const s = await waitFor(c, s => s.recycled >= 2, 14000, 'home recycling');
        assert(s.home >= 1, 'a home visit: ' + s.home);
        await c.close();
      }],
      ['tree room: a bot at a Sapling Well cranks with timed presses and drinks (+3 knowledge) through {act}', async () => {
        const c = await connect(srv.port, 'wins=0');
        c.send({ actDbg: { tree: ['6', 'well'], npcs: false } }); await sleep(200);
        const s0 = await bot5(c, { goal: '6' }), k0 = s0.lab.know;
        const s = await waitFor(c, s => (s.rewards['well:drink'] || 0) >= 1, 15000, 'a drink');
        assert(s.lab.know >= k0 + 3, 'knowledge ' + k0 + ' -> ' + s.lab.know);
        assert(s.tree.well >= 4, 'use + taps + choose were sent: ' + s.tree.well);
        await c.close();
      }],
      ['heist: a bot in the Keystone room lights the 4 stones in the secret order and completes the circuit (+3 knowledge to the lighters)', async () => {
        const c = await connect(srv.port, 'wins=0');
        c.send({ actDbg: { vb: ['keystone', 'ram', 'locksmith', 'counting'], npcs: false } }); await sleep(200);   // order of cells 7 11 13 17
        const s0 = await bot5(c); const cell = Object.keys(s0.vbLayout).find(k => s0.vbLayout[k] === 'keystone');
        await bot5(c, { goal: cell });
        const s = await waitFor(c, s => (s.rewards.keystone || 0) >= 1, 24000, 'a circuit');
        assert(s.vb.keystone >= 4, 'stone verbs: ' + s.vb.keystone);
        await c.close();
      }],
      ['the vault in a late round: a bot walks onto the dais and builds a crown claim', async () => {
        const c = await connect(srv.port, 'wins=0');
        c.send({ actDbg: { npcs: false } }); await sleep(100);
        c.send({ bot6: { hp: 9999 } }); await sleep(100);   // BOTS6: a bot below 40 % health does not claim the crown (the bot sometimes starts hurt), so the lab bot starts healthy
        const s0 = await bot5(c, { goal: '12' });
        const s = await waitFor(c, s => s.claims.some(x => x.id === s0.lab.id && x.s >= 2), 30000, 'a claim');
        assert(s.lab.room === '12', 'still in the vault');
        await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  const errs = srv.out().split('\n').filter(l => /act5 |TypeError|ReferenceError/.test(l));
  if (errs.length) { console.log('  FAIL  bots5: server errors\n         ' + errs.slice(0, 3).join('\n         ')); fail++; }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// MATCH MUTATORS (mutators.js + server hooks): table sanity, rolls, and one server run per mutator that changes a number.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, M = require('../mutators.js'), W = require('../world.js'), G = require('../items.js');
const withServer = async (env, fn) => { const srv = await L.startServer(env); try { await fn(srv); } finally { srv.stop(); } };
(async () => {
  const fail = await L.run('mutators', [
    ['table: eight mutators, bounded multipliers, text, 30% roll, unknown ids are inert', async () => {
      eq(M.IDS.length, 8);
      for (const id of M.IDS) { const m = M.MUT[id]; assert(m.name && m.text.length > 10, id); for (const k in m.p) assert(m.p[k] >= 0.5 && m.p[k] <= 3 || k === 'earlyRounds' || k === 'bounty', id + '.' + k + ' bounded'); }
      eq(M.mul('glass', 'dmg'), 1.3); eq(M.mul('glass', 'sight'), 1); eq(M.mul(null, 'dmg'), 1); eq(M.mul('__proto__', 'dmg'), 1); eq(M.mul('nope', 'hp'), 1); eq(M.mul('bounty', 'earlyRounds', 0), 0);
      let n = 0, seen = new Set(), r = M.rng ? null : null; for (let i = 0; i < 6000; i++) { const x = M.roll(); if (x) { n++; seen.add(x); } }
      assert(n / 6000 > 0.25 && n / 6000 < 0.35, 'rate ' + n / 6000); eq(seen.size, 8, 'all eight come up');
      eq(M.roll(() => 0.99), null); eq(M.roll(() => 0), M.IDS[0]); eq(M.pub('x'), null); eq(M.pub('fog').name, 'Fog');
    }],
    ['no mutator: nothing is announced and numbers are untouched', async () => withServer({ GK_MUTATOR: 'none' }, async srv => {
      const c = await connect(srv.port); await sleep(300); assert(!c.msgs.some(m => m.mut), 'no mut message'); eq(c.state.round.dur, 120000); await c.close();
    })],
    ['Glass Cannon: announced at GO, health is 70% of the plain value', async () => withServer({ GK_MUTATOR: 'glass' }, async srv => {
      const c = await connect(srv.port); await c.until(x => x.state.mut, 3000, 'mut'); eq(c.state.mut.id, 'glass');
      const me = c.state.players.find(p => p.id === c.state.you), plain = G.goblinHp(me.goblin, G.ITEMS[G.START[me.goblin].armor].health);
      await c.until(x => { const p = (x.state.players || []).find(q => q.id === x.state.you); return p && p.stats.maxHealth === Math.round(plain * 0.7); }, 3000, 'maxHealth x0.7'); await c.close();
    })],
    ['Fast Doors: round 1 is 90 s instead of 120 s', async () => withServer({ GK_MUTATOR: 'fastdoors' }, async srv => {
      const c = await connect(srv.port); await c.until(x => x.state.mut, 3000, 'mut'); eq(c.state.mut.id, 'fastdoors'); eq(c.state.round.dur, 90000); await c.close();
    })],
    ['Bounty Hunt: a goblin is marked and named in the banner', async () => withServer({ GK_MUTATOR: 'bounty' }, async srv => {
      const c = await connect(srv.port); await c.until(x => x.msgs.some(m => m.mut && m.mut.note), 3000, 'bounty note');
      const note = c.msgs.find(m => m.mut && m.mut.note); assert(/bounty/.test(note.mut.note) && Number.isInteger(c.msgs.find(m => m.bounty > 0).bounty)); await c.close();
    })],
    ['Scavenger: a chest can be emptied again after the next round starts', async () => withServer({ GK_MUTATOR: 'scavenger', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500' }, async srv => {
      let c = null; for (let i = 0; i < 20 && !c; i++) { const x = await connect(srv.port); if (x.state.layout.includes('chest')) c = x; else { await x.close(); await sleep(100); } }
      assert(c, 'a match with a chest'); const id = c.state.layout.indexOf('chest'), at = [W.CHEST[id].cx, W.CHEST[id].cz];
      c.send({ tp: at }); c.send({ claim: 1 }); await c.until(x => x.state.claimed, 2000, 'first claim'); delete c.state.claimed;
      await c.until(x => x.msgs.some(m => m.claimedReset), 6000, 'refill at the round change');
      c.send({ tp: at }); c.send({ claim: 1 }); await c.until(x => x.state.claimed, 2000, 'second claim after refill'); await c.close();
    })],
  ]);
  process.exit(fail ? 1 : 0);
})();

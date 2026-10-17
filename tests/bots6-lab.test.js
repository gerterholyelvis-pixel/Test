// bots6-lab (docs/reports/bots6.md): BOTS6 behaviours in a live server through the GK_DEBUG {bot6} lab: a hurt bot drinks its Healing Draught when safe
// (through useItem), leaves a room with a telegraphed Stink Gas, steps out of a powder bomb before it blows; GK_BOT_LEVEL=mix deals easy, normal, hard;
// the duel harness (tests/sim-duel.js) finishes duels with a winner.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, { duels } = require('./sim-duel.js');
const lab = async (c, o) => { const n = c.msgs.length; c.send({ bot6: o || {} }); await c.until(x => x.msgs.slice(n).some(m => m.bot6), 3000, 'bot6'); return c.msgs.slice(n).find(m => m.bot6).bot6; };
(async () => {
  const ENV = { GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_READY_MS: '300', GK_ROUND_MS: '1200', GK_NEXT_ROUND_MS: '120000', GK_BOT_GRACE_MS: '600000' };
  const srv = await L.startServer(ENV), mix = await L.startServer({ ...ENV, GK_MATCH_SIZE: '4', GK_BOT_LEVEL: 'mix' }); let fail = 1;
  try {
    const round2 = async c => c.until(x => x.state.round && x.state.round.n >= 2, 6000, 'round 2');
    fail = await L.run('bots6-lab', [
      ['a hurt bot with a Healing Draught drinks it once it is safe, through useItem (the draught is spent, +30 HP)', async () => {
        const c = await connect(srv.port, 'name=Lab1'); await round2(c);
        const s0 = await lab(c, { sure: 1, at: 'cell', give: ['x:draught'], hp: 20, hurtAgo: 5000 }); assert(s0.pack.includes('x:draught'), 'draught given: ' + JSON.stringify(s0.pack));
        let s = s0; for (let i = 0; i < 40 && s.pack.includes('x:draught'); i++) { await sleep(200); s = await lab(c, {}); }
        assert(!s.pack.includes('x:draught'), 'the draught was not drunk'); assert(s.hp >= Math.min(s.max, 45) - 1, 'healed: ' + s.hp + ' of ' + s.max); assert((s.use.heal | 0) >= 1, 'counted: ' + JSON.stringify(s.use));
        await c.close();
      }],
      ['a bot leaves a room when a Stink Gas is telegraphed there', async () => {
        const c = await connect(srv.port, 'name=Lab2'); await round2(c);
        const s0 = await lab(c, { sure: 1, at: 'cell', send: 'gas' }); let s = s0;
        for (let i = 0; i < 30 && s.room === s0.room; i++) { await sleep(200); s = await lab(c, {}); }
        assert(s.room !== s0.room, 'still in the gassed room ' + s0.room); assert((s.danger.gas | 0) >= 1, 'danger counted: ' + JSON.stringify(s.danger));
        await c.close();
      }],
      ['a bot steps out of a powder bomb before it goes off and takes no damage', async () => {
        const c = await connect(srv.port, 'name=Lab3'); await round2(c);
        const s0 = await lab(c, { sure: 1, at: 'cell' }); await sleep(300);
        const s1 = await lab(c, { bomb: 1, hp: 999 }), bx = s1.x + 0.8, bz = s1.z; await sleep(1900);
        const s2 = await lab(c, {});
        assert(Math.hypot(s2.x - bx, s2.z - bz) > 2.5 || s2.room !== s1.room, 'too close to the blast: ' + Math.hypot(s2.x - bx, s2.z - bz).toFixed(2)); eq(s2.hp, s1.hp, 'hp after the blast'); assert(s2.dodge >= 1, 'dodge counted');
        void s0; await c.close();
      }],
      ['GK_BOT_LEVEL=mix deals easy, normal and hard bots', async () => {
        const c = await connect(mix.port, 'name=Lab4'); const n = c.msgs.length; c.send({ bot5: 1 }); await c.until(x => x.msgs.slice(n).some(m => m.bot5), 3000, 'bot5');
        const st = c.msgs.slice(n).find(m => m.bot5).bot5; eq(Object.values(st.b6.lvl).sort(), ['easy', 'hard', 'normal']); await c.close();
      }],
      ['the duel harness: two spear duels (new against old fight code) end with a winner', async () => {
        const r = await duels({ n: 2, parallel: 2, weapons: ['w:spear'], log: false, limit: 30000 });
        eq(r.rows.length, 2); for (const x of r.rows) assert(x.res === 'A' || x.res === 'B', 'duel result ' + x.res);
      }],
    ]);
  } finally { srv.stop(); mix.stop(); }
  process.exit(fail ? 1 : 0);
})();

// recap-server: RECAP block end to end: a hit then a kill by another goblin gives the victim a damage recap, the feed names the assister,
// the assister hears {assist}, and the match summary carries highlights. docs/reports/research-game.md
const L = require('./lib.js'), { connect, sleep, assert, eq } = L;
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
const startOf = (c, id) => c.state.matchStart.players.find(p => p.id === id);
async function swingAt(a, victim, until) {
  const v = startOf(a, victim.state.you);
  for (let i = 0; i < 60 && !until(); i++) { a.send({ tp: [v.x + 1.3, v.z] }); a.send({ m: [v.x + 1.3, v.z, Math.PI / 2] }); await sleep(40); a.send({ atk: 1 }); await sleep(120); }
  assert(until(), 'swinging did not get there');
}
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_READY_MS: '300' });
  let fail = 1;
  try {
    fail = await L.run('recap-server', [
      ['assist in the feed, {assist} to the helper, recap on {died}, highlights in {matchEnd}', async () => {
        const [a, b, c] = await Promise.all([connect(srv.port, 'name=Killa&goblin=2&wins=0'), connect(srv.port, 'name=Victa&goblin=2&wins=0'), connect(srv.port, 'name=Helpa&goblin=2&wins=0')]);
        await a.until(x => x.state.board, 3000, 'board');
        await give(b, 'a:aegis', 'armor');   // b lives through the helper's hit
        const hitByC = () => c.msgs.some(m => m.hit && m.hit.from === c.state.you && m.hit.to === b.state.you && m.hit.dmg > 0);
        await swingAt(c, b, hitByC);
        c.send({ tp: [startOf(c, c.state.you).x, startOf(c, c.state.you).z] });   // step away
        await give(a, 'w:slayer', 'weapon');
        await swingAt(a, b, () => !!b.state.died);
        const f = await a.until(x => x.msgs.some(m => m.feed && m.feed.v === 'Victa'), 2000, 'feed').then(() => a.msgs.find(m => m.feed && m.feed.v === 'Victa').feed);
        eq(f.k, 'Killa'); eq(f.a, ['Helpa'], 'assister named');
        await c.until(x => x.msgs.some(m => m.assist), 2000, 'assist message'); eq(c.msgs.find(m => m.assist).assist, 1);
        const rc = b.state.died.rc; assert(rc && rc.src.length >= 2, 'recap sources ' + JSON.stringify(rc));
        const k = rc.src.find(r => r[4] === 1); eq(k[0], 'Killa'); eq(k[1], 'Goblin Slayer'); assert(rc.src.some(r => r[0] === 'Helpa' && r[2] > 0), 'helper in the recap');
        assert(typeof rc.tip === 'string', 'tip');
        await give(a, 'a:aegis', 'armor');
        await swingAt(a, c, () => !!c.state.died);
        await a.until(x => x.msgs.some(m => m.matchEnd), 3000, 'matchEnd');
        const e = a.msgs.find(m => m.matchEnd).matchEnd; assert(Array.isArray(e.aw) && e.aw.length >= 1, 'highlights ' + JSON.stringify(e.aw));
        const md = e.aw.find(x => x[0] === 'Most damage'); eq(md[1], 'Killa'); assert(e.aw.some(x => x[0] === 'Most assists' && x[1] === 'Helpa'), 'assist award');
        for (const x of [a, b, c]) x.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop();
  process.exit(fail ? 1 : 0);
})();

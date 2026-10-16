// The six sendables against the real server (docs/PLAN-5x5.md 1.8): telegraph to the occupants only, the effect on the target room, one send per round, counters.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
const at = (home, kind, dx = 0, dz = 0) => { const c = W.CHEST[+home.slice(1)], a = W.HOME_LAYOUT[kind], [x, z] = W.attLocal(c, a[0], a[1]); return [x + dx, z + dz]; };
const homeOf = c => c.state.matchStart.spawn.home;
const mark = c => c.msgs.length;
const since = (c, i, key) => c.msgs.slice(i).map(m => m[key]).filter(v => v !== undefined);
const dbg = (c, o) => c.send({ dbgElixir: o });
const CELL = '24';
async function pair(srv) {   // A is the sender, standing at his screen in round 2 with 100 elixir; B waits in CELL
  const [a, b] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1')]), ha = homeOf(a);
  await a.until(c => c.state.round && c.state.elixir === 0, 4000, 'GO'); dbg(a, { n: 100 }); a.send({ tp: at(ha, 'screen', 1, 0) });
  await a.until(c => c.state.round.n >= 2, 8000, 'round 2'); b.send({ tp: L.centre(CELL) }); await sleep(150); return [a, b, ha];
}
const send = (a, id, room) => a.send({ base: { send: id, room } });
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '1500', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0' }); let fail = 1;
  try {
    fail = await L.run('elixir-sends', [
      ['rats: 3 s telegraph names the sender to the occupant only, 5 rats of 5 HP appear in the room, bite for 2, one send per round', async () => {
        const [a, b] = await pair(srv), kb = mark(b), ka = mark(a);
        send(a, 'rats', CELL); await a.until(c => c.state.elixir === 82, 1500, 'rats cost 18');
        await b.until(c => since(c, kb, 'homeToast').some(t => t.kind === 'send' && /Rats incoming/.test(t.text) && /Sent by /.test(t.text)), 1500, 'telegraph names the sender');
        assert(!since(a, ka, 'homeToast').some(t => t.kind === 'send'), 'the sender is not told about himself'); assert(!b.msgs.slice(kb).some(m => m.feed), 'nothing in the global feed');
        const k2 = mark(a); send(a, 'gas', CELL); await a.until(c => since(c, k2, 'homeRes').length > 0, 1500); eq(since(a, k2, 'homeRes')[0].reason, 'limit', 'one send per round'); eq(a.state.elixir, 82);
        await sleep(2000); assert(!(b.state.players || []).some(p => p.npc === 'rat'), 'no rats during the telegraph');
        await b.until(c => (c.state.players || []).some(p => p.npc === 'rat'), 3500, 'rats spawned'); await b.until(c => since(c, kb, 'homeFx').some(f => f.kind === 'rats' && f.on === 1), 1000, 'fx on');
        const rats = b.state.players.filter(p => p.npc === 'rat'); eq(rats.length, 5); assert(rats.every(r => r.room === CELL && r.stats.maxHealth === 5), 'five 5 HP rats in the target room');
        await b.until(c => since(c, kb, 'hit').some(h => h.from !== c.state.you && h.to === c.state.you && h.dmg === 2), 8000, 'a rat bites for 2');
        await a.close(); await b.close();
      }],
      ['gas (A) and bell (B) in one match: fog fx and 1 damage / 2 s for the room; the bell fx carries its 20 s', async () => {
        const [a, b] = await pair(srv), kb = mark(b), ka = mark(a), hb = homeOf(b); send(a, 'gas', CELL); await a.until(c => c.state.elixir === 86, 1500, 'gas costs 14');
        dbg(b, { n: 100 }); b.send({ tp: at(hb, 'screen', 1, 0) }); await sleep(150); b.send({ base: { send: 'bell', room: '0' } }); await b.until(c => c.state.elixir === 94, 1500, 'bell costs 6');
        b.send({ tp: L.centre(CELL) });
        await b.until(c => since(c, kb, 'homeFx').some(f => f.kind === 'gas' && f.on === 1), 5000, 'gas fx on');
        await a.until(c => since(c, ka, 'homeFx').some(f => f.kind === 'bell' && f.on === 1 && f.ms === 20000 && f.room === '0'), 5000, 'bell fx reaches everyone');
        await b.until(c => since(c, kb, 'hit').filter(h => h.to === c.state.you && h.dmg === 1).length >= 1, 4000, 'a gas tick');
        await a.close(); await b.close();
      }],
      ['spike trap (A) and jammed panel (B): the first goblin on the plate takes 15 and a 2 s slow, once; the jammed room cannot pick', async () => {
        const [a, b, ha] = await pair(srv), hb = homeOf(b), kb = mark(b), ka = mark(a), door = L.plainDoors('0')[0];
        send(a, 'spike', CELL); await a.until(c => c.state.elixir === 85, 1500, 'spike costs 15');
        dbg(b, { n: 100 }); b.send({ tp: at(hb, 'screen', 1, 0) }); await sleep(150); b.send({ base: { send: 'jam', room: '0' } }); await b.until(c => c.state.elixir === 88, 1500, 'jam costs 12');
        b.send({ tp: L.centre(CELL) }); a.send({ tp: L.centre('0') });
        await b.until(c => since(c, kb, 'homeFx').some(f => f.kind === 'spike' && f.on === 1 && f.spot), 5000, 'armed (debug shows the spot)');
        const spot = since(b, kb, 'homeFx').find(f => f.spot).spot; b.send({ tp: [spot[0], spot[1]] });
        await b.until(c => since(c, kb, 'hit').some(h => h.to === c.state.you && h.dmg === 15), 2500, '15 damage'); await b.until(c => since(c, kb, 'snared').some(s => s.ms === 2000), 1000, 'slow 2 s');
        const n = since(b, kb, 'hit').length; b.send({ tp: [spot[0] + 3, spot[1]] }); await sleep(150); b.send({ tp: [spot[0], spot[1]] }); await sleep(500); eq(since(b, kb, 'hit').length, n, 'the plate is spent');
        await a.until(c => since(c, ka, 'homeFx').some(f => f.kind === 'jam' && f.on === 1), 3000, 'jam on'); a.send({ sel: door }); await a.until(c => since(c, ka, 'sealBlock').length > 0, 1500, 'pick refused');
        eq(a.state.sel['0'], undefined, 'no vote registered');
        await a.close(); await b.close();
      }],
      ['pump leech both ways in one match: Pump Guard blocks A, B (unguarded) is told and about half of the tank arrives', async () => {
        const [a, b, ha] = await pair(srv), hb = homeOf(b); dbg(b, { tank: 40, lv: { guard: 1, lockbox: 0 }, n: 100 }); dbg(a, { tank: 40 }); await sleep(200); const ka = mark(a), kb = mark(b);
        send(a, 'leech', hb); await a.until(c => c.state.elixir === 80, 1500, 'leech costs 20');
        b.send({ tp: at(hb, 'screen', 1, 0) }); await sleep(120); b.send({ base: { send: 'leech', room: ha } }); await b.until(c => c.state.elixir === 80, 1500, 'B pays too');
        await a.until(c => since(c, ka, 'homeToast').some(t => t.kind === 'raid' && /is draining your pump/.test(t.text)), 5000, 'A told');
        await a.until(c => since(c, ka, 'homeToast').some(t => /Pump Guard/.test(t.text)), 1500, 'blocked by the guard'); eq(a.state.elixir, 80, 'nothing arrived');
        await b.until(c => c.state.elixir >= 99, 13000, 'about 20 arrived'); assert(b.state.elixir <= 101, 'no more than half: ' + b.state.elixir);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  elixir-sends setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// combat: misses (behind, out of range, other room), damage = attack, cooldown, kill -> died/kills/won, bow range, regeneration (GK_REGEN_SCALE speeds regen up)
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const MACE = G.START[2].weapon, MACE_ATK = G.ITEMS[MACE].attack, SMALL_HP = G.ITEMS[G.START[0].armor].health;
const PX = d => W.rc(1)[0] + d, PZ = W.rc(1)[1];   // the fight spot: the middle of arena room 1 (a plain hall)
const FACE_E = -Math.PI / 2, FACE_W = Math.PI / 2;   // forward = (-sin yaw, -cos yaw)

// two players (a: big goblin with a mace, b: small goblin) in the same private match; each test uses its own `wins` value so matches never mix
async function pair(srv, wins, ga = 2, gb = 0) {
  // servers run with GK_MATCH_SIZE=2: both clients queue together (same `wins` bracket); connect() returns after GO
  const [a, b] = await Promise.all([connect(srv.port, 'goblin=' + ga + '&wins=' + wins), connect(srv.port, 'goblin=' + gb + '&wins=' + wins)]);
  await a.until(x => x.state.players && x.state.players.some(p => p.id === b.state.you), 1500, 'same match');
  await a.until(x => x.state.match && x.state.match.alive === 2, 2000, 'both entered');
  return [a, b];
}
const put = async (c, x, z, yaw) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const swing = async (c, extra) => { const n = c.msgs.length; c.send({ atk: 1, ...extra }); await c.until(x => x.msgs.slice(n).some(m => m.swr || m.projEnd), 1200, 'swing resolved').catch(() => {}); await sleep(40); return c.msgs.slice(n); };   // COMBAT4: the blow lands on the clip's contact frame (swr = the swing's result, projEnd = an arrow landed)
const hits = ms => ms.filter(m => m.hit).map(m => m.hit);
const equipBow = async c => { c.send({ give: 'w:bow' }); await c.until(x => x.state.inv.backpack[0] === 'w:bow', 2000, 'bow in pack'); c.send({ mv: ['b0', 'weapon'] }); await c.until(x => x.state.inv.weapon === 'w:bow', 2000, 'bow equipped'); };

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2' }), srvR = await L.startServer({ GK_MATCH_SIZE: '2', GK_REGEN_SCALE: '0.1' }); let fail = 1;   // srvR: regeneration 10x faster
  try {
    fail = await L.run('combat', [
      ['misses: from behind, out of range, in another room (and a swing still happens)', async () => {
        const cases = [
          async () => { const [a, b] = await pair(srv, 0); await put(a, PX(-2), PZ, FACE_W); await put(b, PX(-0.5), PZ, 0); const ms = await swing(a); assert(ms.some(m => m.swing === a.state.you), 'swing not broadcast'); eq(hits(ms), [], 'hit from behind'); await a.close(); await b.close(); },
          async () => { const [a, b] = await pair(srv, 10); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(1.5), PZ, 0); eq(hits(await swing(a)), [], 'hit at 3.5 m'); await a.close(); await b.close(); },
          async () => { const [a, b] = await pair(srv, 20); const wx = W.rc(0)[0] + W.roomW(0) / 2; const wz = W.rc(0)[1]; await put(a, wx - 0.8, wz, FACE_E); await put(b, wx + 0.4, wz, 0); eq(W.roomKeyOf(wx - 0.8, wz), '0'); eq(W.roomKeyOf(wx + 0.4, wz), '1'); /* across the room 0 / room 1 wall */ eq(hits(await swing(a)), [], 'hit through the wall'); await a.close(); await b.close(); },
        ];
        await Promise.all(cases.map(f => f()));
      }],
      ['hit = attack stat, cooldown blocks a second swing, kill gives died + kill count + the survivor wins', async () => {
        const [a, b] = await pair(srv, 30); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.5), PZ, 0);
        const n0 = a.msgs.length; a.send({ atk: 1 }); await sleep(130); a.send({ atk: 1 });   // COMBAT4: the second swing is deep inside the cooldown (more than QUEUE_MS early): dropped, not queued
        await a.until(x => x.msgs.slice(n0).some(m => m.swr), 1500, 'first swing resolved'); await sleep(450);
        const ms = a.msgs.slice(n0), h = hits(ms); eq(h.length, 1); eq(h[0].dmg, MACE_ATK, 'damage is the weapon attack'); eq(h[0].to, b.state.you); eq(h[0].hp, SMALL_HP - MACE_ATK); eq(h[0].dead, false);
        await b.until(x => x.state.hit && x.state.hit.hp === SMALL_HP - MACE_ATK, 1500, 'victim sees the hit');
        eq(a.state.kills, undefined);
        eq(ms.filter(m => m.swing != null).length, 1, 'cooldown ignored: ' + JSON.stringify(ms.filter(m => m.swing != null)));
        let ms2 = []; for (let i = 1; i < Math.ceil(SMALL_HP / MACE_ATK); i++) { await sleep(600); ms2 = await swing(a); }   // BALANCE-3: the small goblin's jerkin takes three mace blows
        eq(hits(ms2).map(x => x.dead), [true], 'the last hit kills');
        await b.until(x => x.state.died, 2000, 'died'); eq(b.state.died.by, a.state.you); assert(b.state.died.killer && b.state.died.killer.name && typeof b.state.died.killer.w === 'string' && b.state.died.killer.npc === false, 'the died message names the killer: ' + JSON.stringify(b.state.died.killer)); assert(b.state.died.brain.startsWith('m:brain:'), 'brain'); assert(b.state.died.items.includes(G.START[0].weapon), 'dropped gear');
        await a.until(x => x.state.kills === 1, 2000, 'kill count'); await a.until(x => x.state.won, 2000, 'survivor won'); assert(a.state.won.items.includes(MACE), 'winner keeps the mace');
        await a.close(); await b.close();
      }],
      ['bow: hits at 9 m, misses at 13.5 m (and bow damage is its attack stat)', async () => {
        const [a, b] = await pair(srv, 40, 0, 2); await equipBow(a);   // 80 HP target survives both shots
        const bz = -3;   // off the line through the relic pedestal, so only the range decides
        await put(a, -8.5, bz, FACE_E); await put(b, 0.5, bz, 0); eq(W.roomKeyOf(-8.5, bz), W.VAULT_KEY);
        const h = hits(await swing(a)); eq(h.length, 1, 'bow miss at 9 m'); eq(h[0].dmg, G.combat('w:bow').dmg);
        await sleep(650); await put(b, 5.0, bz, 0);
        eq(hits(await swing(a)), [], 'bow hit at 13.5 m'); await a.close(); await b.close();
      }],
      ['regeneration: a wounded goblin heals again after a pause (regen sped up 10x for the test)', async () => {
        const [a, b] = await pair(srvR, 50); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.5), PZ, 0);
        eq(hits(await swing(a)).length, 1);
        const hp = () => (a.state.players.find(p => p.id === b.state.you) || { stats: {} }).stats.health;
        await a.until(x => hp() === SMALL_HP - MACE_ATK, 1500, 'wounded'); const t0 = Date.now();
        await a.until(x => hp() > SMALL_HP - MACE_ATK, 4000, 'healed a point'); const dt = Date.now() - t0;
        assert(dt >= 400, 'regen started too early: ' + dt + ' ms'); await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  combat setup: ' + (e.stack || e.message)); }
  srv.stop(); srvR.stop(); process.exit(fail ? 1 : 0);
})();

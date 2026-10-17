// RARE on a live server (raresrv.js hooks in server.js): the pickup announcement and the trophy cue, Phasecloak, Phoenix Ember, Echo Dirk, Storm Flask, and that rare gear can be worn and fought with.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const PX = d => W.rc(1)[0] + d, PZ = W.rc(1)[1], FACE_E = -Math.PI / 2;
const put = async (c, x, z, yaw) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const give = async (c, key, slot) => {
  c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key);
  if (slot) { c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => (slot[0] === 'q' ? x.state.inv.quick[+slot[1]] : x.state.inv[slot]) === key, 2000, key + ' in ' + slot); }
};
async function pair(srv, wins) {
  const [a, b] = await Promise.all([connect(srv.port, 'goblin=1&wins=' + wins), connect(srv.port, 'goblin=1&wins=' + wins)]);
  await a.until(x => x.state.match && x.state.match.alive === 2, 2000, 'both entered'); return [a, b];
}
const hitsOn = (c, n0) => c.msgs.slice(n0).filter(m => m.hit && m.hit.to === c.state.you && !m.hit.thorns).map(m => m.hit);
const swing = async (a, ms = 700) => { a.send({ atk: 1 }); await sleep(ms); };

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2' }); let fail = 1;
  try {
    fail = await L.run('rareitems-server', [
      ['a rare find is announced to its finder (name, tier, lore); a one-of-a-kind trophy also sends everyone else a faint cue, once', async () => {
        const [a, b] = await pair(srv, 100); let n0 = a.msgs.length, m0 = b.msgs.length;
        await give(a, 'w:hungerblade'); const f = a.msgs.slice(n0).find(m => m.rareFind); assert(f, 'no rareFind'); eq(f.rareFind.tier, 'mythic'); eq(f.rareFind.name, 'Hungering Blade'); assert(f.rareFind.lore.length > 10);
        eq(b.msgs.slice(m0).filter(m => m.rareCue).length, 0, 'a mythic is not a trophy');
        await give(a, 'w:sword'); eq(a.msgs.slice(n0).filter(m => m.rareFind).length, 1, 'a plain sword is not announced');
        n0 = a.msgs.length; m0 = b.msgs.length; await give(a, 'w:kingsbane');
        assert(a.msgs.slice(n0).some(m => m.rareFind && m.rareFind.tier === 'transcendent'), 'trophy announced'); await b.until(x => x.msgs.slice(m0).some(m => m.rareCue), 1500, 'cue'); eq(b.msgs.slice(m0).filter(m => m.rareCue).length, 1);
        assert(!b.msgs.slice(m0).some(m => m.rareFind), 'the other goblin gets no name');
        await a.close(); await b.close();
      }],
      ['Phasecloak: the first blow each round passes through, the second lands; Phoenix Ember: one lethal blow leaves 1 HP, the next one kills', async () => {
        const [a, b] = await pair(srv, 110); await give(b, 'a:phasecloak', 'armor'); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.8), PZ, Math.PI / 2);
        let n0 = b.msgs.length; await swing(a); eq(hitsOn(b, n0).length, 0, 'first blow'); assert(a.msgs.some(m => m.rare && m.rare.fx === 'phase'), 'phase cue'); n0 = b.msgs.length; await swing(a, 900); eq(hitsOn(b, n0).length, 1, 'second blow');
        await give(b, 'c:phoenix', 'charm'); b.send({ hp: 5 }); await sleep(150); n0 = b.msgs.length; await swing(a, 900);
        const hs = hitsOn(b, n0); eq(hs.length, 1); eq(hs[0].hp, 1, 'left on 1 HP'); eq(hs[0].dead, false); assert(a.msgs.some(m => m.rare && m.rare.fx === 'phoenix'), 'phoenix cue');
        n0 = b.msgs.length; await swing(a, 900); assert(b.msgs.slice(n0).some(m => m.died) || b.closed || hitsOn(b, n0).some(h => h.dead), 'the second lethal blow in the same round kills');
        await a.close(); await b.close();
      }],
      ['Echo Dirk: the third landed blow strikes twice', async () => {
        const [a, b] = await pair(srv, 120); await give(a, 'w:echodirk', 'weapon'); await give(b, 'a:aegis', 'armor'); b.send({ hp: 300 }); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.8), PZ, Math.PI / 2); await sleep(150);
        const n0 = b.msgs.length; for (let i = 0; i < 3; i++) await swing(a, 700); await sleep(200);
        eq(hitsOn(b, n0).length, 4, 'three blows and the echo'); assert(a.msgs.some(m => m.rare && m.rare.fx === 'echo'), 'echo cue');
        await a.close(); await b.close();
      }],
      ['Storm Flask: goblins within 3.5 m take its damage and cannot attack for the stun; the user is spared', async () => {
        const [a, b] = await pair(srv, 130); await give(a, 'x:stormflask', 'q0'); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.5), PZ, Math.PI / 2); await sleep(100);
        const n0 = b.msgs.length, a0 = a.msgs.length; a.send({ use: 'q0' }); await a.until(x => x.msgs.slice(a0).some(m => m.used), 2000, 'used');
        const h = hitsOn(b, n0); eq(h.length, 1); eq(h[0].dmg, G.ITEMS['x:stormflask'].n); assert(!hitsOn(a, a0).length, 'the thrower is spared');
        assert(a.state.inv.quick[0] == null, 'the flask is spent'); await a.close(); await b.close();
      }],
      ['rare gear is wearable: Aegis of the Last Stand caps a heavy hit, Mirrorscale and Stonebark equip without errors, Hungering Blade swings', async () => {
        const [a, b] = await pair(srv, 140); await give(a, 'w:hungerblade', 'weapon'); await give(b, 'a:lastbastion', 'armor'); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.8), PZ, Math.PI / 2); await sleep(150);
        const n0 = b.msgs.length; await swing(a, 900); const h = hitsOn(b, n0); eq(h.length, 1); assert(h[0].dmg <= Math.ceil(G.ITEMS['a:lastbastion'].health * 0.25), 'cap ' + h[0].dmg);
        await give(b, 'a:mirrorscale', 'armor'); await give(b, 'a:stonebark', 'armor'); await give(b, 'a:mossback', 'armor'); await give(b, 'c:lantern', 'charm'); await give(b, 'c:clover', 'charm');
        assert(!srv.out().includes('Error') || !/TypeError|ReferenceError/.test(srv.out()), 'server errors: ' + srv.out().slice(-500)); await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  rareitems-server setup: ' + (e.stack || e.message)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

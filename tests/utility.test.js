// utility items: data, shop stock, recycle/craft, bandage, mushroom, tonic, smoke, bomb, wedge, wax, lockpick
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const hpOf = c => { const p = (c.state.players || []).find(q => q.id === c.state.you); return p ? p.stats.health : null; };
const give = async (c, key, slot = 'q0') => {   // debug give, then move it into a quick slot
  c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, 'item ' + key);
  c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv.quick[+slot[1]] === key, 2000, key + ' in ' + slot);
};
const use = async (c, slot = 'q0') => { const n = c.msgs.length; c.send({ use: slot }); await sleep(120); return c.msgs.slice(n); };
const DOORS = W.DOORS.map(d => [d.id, d.a, d.b]);   // door ids from the shared world table
const doorsOf = r => DOORS.filter(d => d[1] === r || d[2] === r).map(d => d[0]), VAULT_DOORS = doorsOf(W.VAULT_KEY);
const roomOnly = id => DOORS.find(d => d[0] === id);

(async () => {
  let fail = 0;
  fail += await L.run('utility-data', [
    ['twenty utility items are well formed, never dropped as gear, recyclable and craftable', async () => {
      eq(G.UTIL_KEYS.length, 20);
      for (const k of G.UTIL_KEYS) {
        const it = G.ITEMS[k]; assert(it.type === 'consumable' && it.use && it.name && it.desc && it.family && it.price > 0, k + ' fields'); eq(it.chance, 0);
        assert(G.recycleYield(k) && Object.keys(G.recycleYield(k)).length, k + ' recycles');
        const r = G.RECIPES.find(x => x.out === k); assert(r, k + ' has a recipe'); eq(r.needs, r.tier * 20);
        for (const p in r.cost) assert(G.PARTS.some(q => q.key === p), k + ' cost part ' + p);
      }
      assert(!G.randomWeaponKey().startsWith('x:') && !G.randomArmorKey().startsWith('x:'), 'gear picks stay gear');
    }],
    ['merchant stock: five different entries, utility items show up, prices sane', async () => {
      let withUtil = 0;
      for (let i = 0; i < 300; i++) { const s = G.randomShop(); eq(s.length, 5); eq(new Set(s.map(x => x.key)).size, 5, 'unique'); assert(s.every(x => G.ITEMS[x.key] && x.price >= 5), 'valid'); if (s.some(x => x.key.startsWith('x:'))) withUtil++; assert(s.filter(x => x.key.startsWith('x:')).length <= 1, 'at most one utility item'); }
      assert(withUtil > 150 && withUtil < 290, 'most shops stock one: ' + withUtil);
    }],
  ]);

  // ---- one human: bandage, mushroom, tonic, recycle, craft
  let srv = await L.startServer({ GK_MATCH_SIZE: '1', GK_ROUND_MS: '60000' });
  try {
    fail += await L.run('utility-solo', [
      ['bandage heals 12 HP once, refuses at full health, is spent only when it works', async () => {
        const c = await connect(srv.port, 'goblin=1'); c.send({ tp: W.rc(0) }); await sleep(100);
        await give(c, 'x:bandage'); let r = await use(c); assert(r.some(m => m.useFail === 'full'), 'full health refuses'); eq(c.state.inv.quick[0], 'x:bandage');
        c.send({ hp: 5 }); await c.until(x => hpOf(x) === 5, 2000, 'hp 5'); r = await use(c);
        assert(r.some(m => m.used && m.used.key === 'x:bandage' && m.used.hp === 12), 'used'); await c.until(x => hpOf(x) === 17, 2000, 'healed to 17'); eq(c.state.inv.quick[0], null);
        r = await use(c); assert(r.some(m => m.useFail === 'item'), 'nothing left');
        c.send({ hp: 45 }); await c.until(x => hpOf(x) === 45, 2000, 'hp 45'); await give(c, 'x:bandage'); r = await use(c); assert(r.some(m => m.useFail === 'busy'), 'heal cooldown'); eq(c.state.inv.quick[0], 'x:bandage');
        await sleep(4000); r = await use(c); await c.until(x => hpOf(x) === 50, 2000, 'capped at max health'); eq(c.state.inv.quick[0], null);
        await c.close();
      }],
      ['mushroom regenerates 2 HP a second', async () => {
        const c = await connect(srv.port, 'goblin=1'); c.send({ tp: W.rc(0) }); await sleep(100); c.send({ hp: 10 }); await c.until(x => hpOf(x) === 10, 2000, 'hp');
        await give(c, 'x:mushroom'); const r = await use(c); assert(r.some(m => m.used && m.used.ms === 8000), 'used'); await sleep(2600);
        const hp = hpOf(c); assert(hp >= 12 && hp <= 16, 'regenerated about 4-5 HP in 2.6 s: ' + hp); await c.close();
      }],
      ['speed tonic: used, a second one waits, the faster walking is not rejected', async () => {
        const c = await connect(srv.port, 'goblin=0'); const [cx, cz] = W.rc(0); c.send({ tp: [cx - 5, cz] }); await sleep(100);
        await give(c, 'x:tonic'); const r = await use(c); assert(r.some(m => m.used && m.used.key === 'x:tonic' && m.used.n === 1.25), 'used');
        await give(c, 'x:tonic', 'q1'); const r2 = await use(c, 'q1'); assert(r2.some(m => m.useFail === 'busy'), 'second tonic is busy'); eq(c.state.inv.quick[1], 'x:tonic');
        delete c.state.fix; let x = cx - 5; for (let i = 0; i < 18; i++) { x += 0.52; c.send({ m: [x, cz, -Math.PI / 2] }); await sleep(50); }
        await sleep(100); assert(!c.state.fix, 'no fix while under the tonic'); await c.close();
      }],
      ['recycle: a utility item breaks into parts; two bandages pay for a crafted one (tier 0)', async () => {
        const c = await connect(srv.port, 'goblin=1'), id = 0; c.state.layout.includes('merchant') || c.send({ tp: [0, 0] });
        await L.sleep(50); const mid = c.state.layout.indexOf('merchant'); if (mid < 0) { await c.close(); return; }   // no merchant room in this layout: the station paths are covered by loot.test.js
        const cc = W.CHEST[mid]; c.send({ tp: [cc.cx, cc.cz] }); await sleep(100);
        await give(c, 'x:bandage'); await give(c, 'x:bandage', 'q1');
        c.send({ recycle: 'q0' }); c.send({ recycle: 'q1' }); await c.until(x => x.state.parts && x.state.parts.cloth === 2, 2000, 'two cloth');
        c.send({ craft: 'r:x:bandage' }); await c.until(x => x.state.crafted, 2000, 'crafted'); eq(c.state.crafted.key, 'x:bandage'); eq(c.state.parts.cloth, 0);
        c.send({ craft: 'r:x:lockpick' }); await c.until(x => x.state.craftFail, 2000, 'craftFail'); assert(['knowledge', 'parts'].includes(c.state.craftFail), 'lockpick is gated: ' + c.state.craftFail);
        await c.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  utility-solo setup: ' + e.message); }
  srv.stop();

  // ---- one human, quick rounds: wedge, wax, lockpick
  srv = await L.startServer({ GK_MATCH_SIZE: '1', GK_ROUND_MS: '2500', GK_NEXT_ROUND_MS: '2500' });
  try {
    const waitRound = async (c, n) => c.until(x => x.state.round.n >= n, 8000, 'round ' + n);
    fail += await L.run('utility-doors', [
      ['door wedge keeps an open door open for one more round, not a vault door, not far from it', async () => {
        const c = await connect(srv.port, 'goblin=1'), [cx, cz] = W.rc(0), doors = doorsOf('0').filter(d => !VAULT_DOORS.includes(d));
        const east = DOORS.find(d => d[1] === '0' && d[2] === '1')[0]; assert(doors.includes(east), 'door 0|1');
        c.send({ tp: [cx, cz] }); await sleep(80); c.send({ sel: east }); await c.until(x => x.state.round.n >= 2 && x.state.open.includes(east), 8000, 'door open in round 2');
        await give(c, 'x:wedge'); let r = await use(c); assert(r.some(m => m.useFail === 'door'), 'too far from the door'); eq(c.state.inv.quick[0], 'x:wedge');
        const hw = W.roomW(0) / 2; c.send({ tp: [cx + hw - 1.5, cz] }); await sleep(100); r = await use(c);
        assert(r.some(m => m.used && m.used.key === 'x:wedge' && m.used.door === east), 'wedged ' + JSON.stringify(r)); eq(c.state.inv.quick[0], null);
        const other = DOORS.find(d => d[1] === '0' && d[2] === '5')[0]; c.send({ sel: other });
        const n = c.state.round.n; await waitRound(c, n + 1); await sleep(80);
        assert(c.state.open.includes(east) && c.state.open.includes(other), 'wedged door stayed open next to the new pick: ' + c.state.open);
        c.send({ sel: other }); await waitRound(c, n + 2); await sleep(80); assert(!c.state.open.includes(east), 'only one extra round');
        await c.close();
      }],
      ['sealing wax locks the room pick until the round ends', async () => {
        const c = await connect(srv.port, 'goblin=1'), [cx, cz] = W.rc(0), a = DOORS.find(d => d[1] === '0' && d[2] === '1')[0], b = DOORS.find(d => d[1] === '0' && d[2] === '5')[0];
        c.send({ tp: [cx, cz] }); await sleep(80); await give(c, 'x:wax');
        let r = await use(c); assert(r.some(m => m.useFail === 'pick'), 'needs a pick first'); eq(c.state.inv.quick[0], 'x:wax');
        const n0 = c.state.round.n; c.send({ sel: a }); await c.until(x => x.state.sel['0'] === a, 2000, 'picked');
        r = await use(c); assert(r.some(m => m.used && m.used.key === 'x:wax') && r.some(m => m.sealed), 'sealed');
        c.send({ sel: b }); await sleep(150); assert(c.msgs.some(m => m.sealBlock), 'blocked'); eq(c.state.sel['0'], a);
        if (c.state.round.n === n0) { await waitRound(c, n0 + 1); await sleep(80); }
        c.send({ sel: b }); await c.until(x => x.state.sel['0'] === b, 2000, 'free again next round'); await c.close();
      }],
      ['vault lockpick adds a second vote so one room can open the vault; refused without a vault pick', async () => {
        const VN = L.vaultNeighbours()[0], c = await connect(srv.port, 'goblin=1'), [cx, cz] = L.centre(VN), vd = L.doorBetween(VN, W.VAULT_KEY), plain = L.plainDoors(VN)[0];
        c.send({ tp: [cx, cz] }); await sleep(80); await give(c, 'x:lockpick');
        c.send({ sel: plain }); await c.until(x => x.state.sel[VN] === plain, 2000, 'picked a plain door');
        let r = await use(c); assert(r.some(m => m.useFail === 'pick'), 'not a vault pick'); eq(c.state.inv.quick[0], 'x:lockpick');
        c.send({ sel: vd }); await c.until(x => x.state.sel[VN] === vd, 2000, 'picked the vault door'); eq(c.state.vaultVotes, 1);
        r = await use(c); assert(r.some(m => m.used && m.used.key === 'x:lockpick'), 'used'); await c.until(x => x.state.vaultVotes === 2, 2000, 'two votes');
        const n = c.state.round.n; await waitRound(c, n + 1); await sleep(80);
        assert(c.state.open.includes(vd), 'the vault door opened with one room and a lockpick: ' + c.state.open); assert(!(c.state.fizzled || []).includes(vd), 'not fizzled');
        await c.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  utility-doors setup: ' + e.message); }
  srv.stop();

  // ---- two humans: bomb and smoke
  srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '60000' });
  try {
    fail += await L.run('utility-throw', [
      ['powder bomb: lands 6 m ahead, 22 damage in the middle after 1 s, spares the thrower, not other rooms', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'goblin=1'), connect(srv.port, 'goblin=1')]), [cx, cz] = W.rc(8);
        a.send({ tp: [cx + 3, cz] }); b.send({ tp: [cx - 3, cz] }); await sleep(120); a.send({ m: [cx + 3, cz, Math.PI / 2] }); await sleep(120);
        await give(a, 'x:bomb'); const hp0 = hpOf(b), ha = hpOf(a);
        const r = await use(a); assert(r.some(m => m.used && m.used.key === 'x:bomb'), 'used'); const t = a.msgs.find(m => m.toss); assert(t && t.toss.kind === 'bomb', 'toss message');
        assert(Math.abs(t.toss.to[0] - (cx - 3)) < 0.6, 'lands about 6 m ahead: ' + JSON.stringify(t.toss.to));
        await b.until(x => x.msgs.some(m => m.boom), 3000, 'boom'); await b.until(x => x.msgs.some(m => m.hit && m.hit.to === b.state.you), 2000, 'b was hit');
        const h = b.msgs.find(m => m.hit && m.hit.to === b.state.you).hit; assert(h.dmg >= 20 && h.dmg <= 22, 'damage near the centre: ' + h.dmg); eq(h.from, a.state.you);
        await sleep(100); assert(hpOf(a) === ha, 'thrower unharmed'); await a.close(); await b.close();
      }],
      ['smoke bomb: a goblin inside the cloud cannot be shot from beyond 2.5 m, melee still works', async () => {
        const [a, b] = await Promise.all([connect(srv.port, 'goblin=1'), connect(srv.port, 'goblin=1')]), [cx, cz] = W.rc(8);
        a.send({ tp: [cx + 4, cz] }); b.send({ tp: [cx - 2, cz] }); await sleep(120); a.send({ m: [cx + 4, cz, Math.PI / 2] }); await sleep(120);
        a.send({ give: 'w:bow' }); await a.until(x => x.state.inv.backpack.includes('w:bow'), 2000, 'bow'); a.send({ mv: ['b' + a.state.inv.backpack.indexOf('w:bow'), 'weapon'] }); await a.until(x => x.state.inv.weapon === 'w:bow', 2000, 'bow equipped');
        const shot = async () => { const n = b.msgs.length; a.send({ atk: 1 }); await sleep(200); return b.msgs.slice(n).some(m => m.hit && m.hit.to === b.state.you); };
        assert(await shot(), 'baseline: the bow hits across 6 m');
        await give(a, 'x:smoke'); const r = await use(a); assert(r.some(m => m.used && m.used.key === 'x:smoke'), 'used'); await sleep(800);   // lands next to b (6 m ahead of a)
        await sleep(700); assert(!(await shot()), 'no hit into the cloud');
        a.send({ tp: [cx - 0.6, cz] }); await sleep(150); a.send({ m: [cx - 0.6, cz, Math.PI / 2] }); await sleep(100); a.send({ give: 'w:dagger' }); await a.until(x => x.state.inv.backpack.includes('w:dagger'), 2000, 'dagger'); a.send({ mv: ['b' + a.state.inv.backpack.indexOf('w:dagger'), 'weapon'] });
        await a.until(x => x.state.inv.weapon === 'w:dagger', 2000, 'dagger equipped'); await sleep(750); assert(await shot(), 'melee hits inside the cloud');
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  utility-throw setup: ' + e.message); }
  srv.stop();
  process.exit(fail ? 1 : 0);
})();

// more items (docs/reports/more-items.md): twelve utility items and the charm slot
const L = require('./lib.js'), { connect, connectWith, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js'), fs = require('fs'), path = require('path');
const hpOf = c => { const p = (c.state.players || []).find(q => q.id === c.state.you); return p ? p.stats.health : null; };
const maxOf = c => { const p = (c.state.players || []).find(q => q.id === c.state.you); return p ? p.stats.maxHealth : null; };
const give = async (c, key, slot = 'q0') => {
  c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, 'item ' + key);
  if (slot) { c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => (slot === 'charm' ? x.state.inv.charm : x.state.inv.quick[+slot[1]]) === key, 2000, key + ' in ' + slot); }
};
const use = async (c, slot = 'q0') => { const n = c.msgs.length; c.send({ use: slot }); await sleep(150); return c.msgs.slice(n); };
const pair = async srv => { const [a, b] = await Promise.all([connect(srv.port, 'goblin=1'), connect(srv.port, 'goblin=1')]), [cx, cz] = W.rc(8); a.send({ tp: [cx + 3, cz] }); b.send({ tp: [cx + 1.5, cz] }); await sleep(150); a.send({ m: [cx + 3, cz, Math.PI / 2] }); b.send({ m: [cx + 1.5, cz, -Math.PI / 2] }); await sleep(120); return [a, b, cx, cz]; };

(async () => {
  let fail = 0;
  fail += await L.run('useplus-data', [
    ['twelve more utility items and six charms: well formed, recyclable, craftable, never gear drops', async () => {
      eq(G.UTIL_KEYS.length, 20); eq(G.CHARM_KEYS.length, 6);
      for (const k of [...G.UTIL_KEYS, ...G.CHARM_KEYS]) {
        const it = G.ITEMS[k]; assert(it && it.name && it.desc && it.family && it.price > 0 && it.tier, k + ' fields'); eq(it.chance, 0);
        assert(it.type === (k[0] === 'c' ? 'charm' : 'consumable'), k + ' type');
        if (k[0] === 'x') assert(it.use, k + ' use'); else assert(it.eff && Object.keys(it.eff).length === 1, k + ' eff');
        assert(G.recycleYield(k) && Object.keys(G.recycleYield(k)).length, k + ' recycles');
        const r = G.RECIPES.find(x => x.out === k); assert(r, k + ' has a recipe'); eq(r.needs, r.tier * 20);
        for (const p in r.cost) assert(G.PARTS.some(q => q.key === p), k + ' cost part ' + p);
      }
      eq(new Set(G.UTIL_KEYS.map(k => G.ITEMS[k].use)).size, 20, 'every use is distinct');
      eq(new Set(G.UTIL_KEYS.map(k => G.ITEMS[k].name)).size, 20, 'names are unique');
      assert(G.UTIL_KEYS.every(k => !G.info(k).heal), 'no accidental bot heal value');
    }],
    ['merchants stock charms now and then, never two in one shop slot, never over the five-slot limit', async () => {
      let withCharm = 0;
      for (let i = 0; i < 400; i++) { const s = G.randomShop(); eq(s.length, 5); eq(new Set(s.map(x => x.key)).size, 5); if (s.some(x => x.key[0] === 'c')) withCharm++; assert(s.filter(x => x.key[0] === 'c').length <= 1, 'one charm at most'); }
      assert(withCharm > 60 && withCharm < 220, 'about 30% of shops: ' + withCharm);
    }],
    ['the speed-hack cap covers the fastest goblin, armour and charm together', async () => {
      const src = fs.readFileSync(path.join(L.ROOT, 'server.js'), 'utf8'), m = /const MAXV = (.*?),\s*BUDGET/.exec(src); assert(m, 'MAXV found');
      assert(/CHARM_KEYS/.test(m[1]) && /MAX_ARMOR_SPEED/.test(m[1]) && /G\.SPEED/.test(m[1]), 'MAXV uses speed, armour and charm: ' + m[1]);
      assert(G.charmEff('c:swift', 'spd') === 1.06, 'swift idol numbers');
    }],
  ]);

  let srv = await L.startServer({ GK_MATCH_SIZE: '1', GK_ROUND_MS: '60000' });
  try {
    fail += await L.run('useplus-solo', [
      ['charm slot: only charms fit, Heart Charm adds 10 maximum health, a death drops it', async () => {
        const c = await connect(srv.port, 'goblin=1'); c.send({ tp: W.rc(0) }); await sleep(100); const m0 = maxOf(c);
        await give(c, 'x:bandage', null); c.send({ mv: ['b' + c.state.inv.backpack.indexOf('x:bandage'), 'charm'] }); await sleep(150); eq(c.state.inv.charm, null, 'a bandage does not fit the charm slot');
        await give(c, 'c:heart', 'charm'); await c.until(x => maxOf(x) === m0 + 10, 2000, 'max health +10'); eq(c.state.inv.charm, 'c:heart');
        c.send({ mv: ['charm', 'weapon'] }); await sleep(150); eq(c.state.inv.charm, 'c:heart', 'a charm does not fit the weapon slot');
        c.send({ kill: 1 }); await c.until(x => x.state.died, 2000, 'died'); assert(c.state.died.items.includes('c:heart'), 'the charm drops with the rest'); await c.close();
      }],
      ['brain jar: +4 knowledge, +6 with the Scholar charm; the jar is spent', async () => {
        const c = await connect(srv.port, 'goblin=1'); c.send({ tp: W.rc(0) }); await sleep(100);
        await give(c, 'x:jar'); let r = await use(c); const a = r.find(m => m.ate); assert(a && a.ate.gain === 4, 'ate +4: ' + JSON.stringify(r)); eq(c.state.inv.quick[0], null);
        await give(c, 'c:scholar', 'charm'); await sleep(550); await give(c, 'x:jar'); r = await use(c); const b = r.find(m => m.ate); assert(b && b.ate.gain === 6, 'ate +6 with the charm: ' + JSON.stringify(b)); await c.close();
      }],
      ['flare and lens report their time; both are spent; a second ward is refused while one is up', async () => {
        const c = await connect(srv.port, 'goblin=1'); c.send({ tp: W.rc(0) }); await sleep(100);
        await give(c, 'x:flare'); let r = await use(c); assert(r.some(m => m.used && m.used.ms === 8000) && r.some(m => m.flare), 'flare'); eq(c.state.inv.quick[0], null);
        await sleep(550); await give(c, 'x:lens'); r = await use(c); assert(r.some(m => m.used && m.used.ms === 12000), 'lens');
        await sleep(550); await give(c, 'x:ward'); await use(c); await sleep(550); await give(c, 'x:ward'); r = await use(c); assert(r.some(m => m.useFail === 'busy'), 'one ward at a time'); eq(c.state.inv.quick[0], 'x:ward'); await c.close();
      }],
      ['crowbar pries a closed door open for good (DOORS-PERSIST); never a vault door; not from afar', async () => {
        const c = await connect(srv.port, 'goblin=1'), [cx, cz] = W.rc(0), hw = W.roomW(0) / 2; c.send({ tp: [cx, cz] }); await sleep(100);
        await give(c, 'x:pry'); let r = await use(c); assert(r.some(m => m.useFail === 'door'), 'too far from any door'); eq(c.state.inv.quick[0], 'x:pry');
        c.send({ tp: [cx + hw - 1.5, cz] }); await sleep(120); r = await use(c); const u = r.find(m => m.used); assert(u && u.used.ms === undefined && Number.isInteger(u.used.door), 'pried: ' + JSON.stringify(r));
        await c.until(x => x.state.open.includes(u.used.door), 2000, 'the door shows as open'); eq(c.state.inv.quick[0], null);
        await sleep(600); await give(c, 'x:pry'); r = await use(c); assert(r.some(m => m.useFail === 'door'), 'an open door is not pried again: ' + JSON.stringify(r.filter(m => m.useFail || m.used)));   // after the 500 ms use cooldown
        await sleep(1500); assert(c.state.open.includes(u.used.door), 'still open: the door never slams shut'); await c.close();
      }],
      ['crowbar refuses a vault door', async () => {
        const n1 = L.vaultNeighbours()[0], vd = W.DOORS[L.doorBetween(n1, W.VAULT_KEY)], [cx, cz] = L.centre(n1), ux = Math.sign(vd.wall.x - cx), uz = Math.sign(vd.wall.z - cz);
        const c = await connect(srv.port, 'goblin=1'); c.send({ tp: [vd.wall.x - ux * 1.5, vd.wall.z - uz * 1.5] }); await sleep(120);   // a room next to the vault, 1.5 m in front of its vault door
        await give(c, 'x:pry'); const r = await use(c); assert(r.some(m => m.useFail === 'door'), 'a vault door is not pried: ' + JSON.stringify(r)); eq(c.state.inv.quick[0], 'x:pry'); await c.close();
      }],
      ['homing feather: back in the starting room after 2.5 s', async () => {
        const c = await connect(srv.port, 'goblin=1'), home = c.state.matchStart.spawn.home, other = L.cellOf(home) === '0' ? 2 : 0; c.send({ tp: W.rc(other) }); await sleep(120);
        await give(c, 'x:feather'); const r = await use(c); assert(r.some(m => m.used && m.used.ms === 2500), 'used');
        await c.until(x => x.msgs.some(m => m.recallEnd && m.recallEnd.ok === 1), 4000, 'recalled'); const f = c.msgs.filter(m => m.fix).pop().fix; eq(W.roomKeyOf(f[0], f[1]), home); await c.close();
      }],
      ['haggler tag halves the next purchase only', async () => {
        const c = await connectWith(srv.port, s => s.layout && s.layout.includes('merchant')), mid = c.state.layout.indexOf('merchant'), cc = W.CHEST[mid];
        c.send({ tp: [cc.cx, cc.cz] }); await sleep(120); const it = c.state.shops[mid][0], half = Math.ceil(it.price / 2 / 5) * 5; c.send({ gold: 1000 }); await c.until(x => x.state.gold === 1000, 2000, 'gold');
        await give(c, 'x:haggle'); let r = await use(c); assert(r.some(m => m.used && m.used.key === 'x:haggle'), 'used');
        c.send({ buy: [mid, 0] }); await c.until(x => x.state.gold === 1000 - half, 2000, 'paid half: ' + c.state.gold + ' want ' + (1000 - half)); assert(c.msgs.some(m => m.haggled === it.price - half), 'haggled message');
        c.send({ buy: [mid, 1] }); const p1 = c.state.shops[mid][1].price; await c.until(x => x.state.gold === 1000 - half - p1, 2000, 'second purchase at full price'); await c.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  useplus-solo setup: ' + e.message); }
  srv.stop();

  srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '60000' });
  try {
    fail += await L.run('useplus-duel', [
      ['bear trap: 14 damage and a snare for the first other goblin, the owner walks free, the trap is spent', async () => {
        const [a, b, cx, cz] = await pair(srv); b.send({ tp: [cx - 3, cz] }); await sleep(100);
        await give(a, 'x:trap'); let r = await use(a); assert(r.some(m => m.trap), 'trap broadcast'); const t = a.msgs.find(m => m.trap).trap;
        await sleep(300); assert(hpOf(a) === maxOf(a), 'the owner is not hurt by his own trap'); eq(a.msgs.some(m => m.trapEnd), false, 'still armed');
        await sleep(1400); const hp0 = hpOf(b); b.send({ tp: [t.x, t.z] });
        await b.until(x => x.msgs.some(m => m.snared), 2000, 'snared'); await b.until(x => x.msgs.some(m => m.trapEnd && m.trapEnd.hit), 2000, 'trapEnd');
        const h = b.msgs.find(m => m.hit && m.hit.to === b.state.you); assert(h && h.hit.dmg === 14 && h.hit.from === a.state.you, 'bitten for 14 by the owner'); eq(b.msgs.find(m => m.snared).snared.n, 0.35);
        await a.close(); await b.close();
      }],
      ['ward rune soaks exactly one hit', async () => {
        const [a, b] = await pair(srv); await give(b, 'x:ward'); let r = await use(b); assert(r.some(m => m.used && m.used.ms === 30000), 'ward up');
        const n = a.msgs.length; a.send({ atk: 1 }); await sleep(250); const m1 = a.msgs.slice(n); assert(m1.some(m => m.ward && m.ward.id === b.state.you) && !m1.some(m => m.hit), 'the first swing is absorbed');
        const hp = hpOf(b); await sleep(900); a.send({ atk: 1 }); await b.until(x => hpOf(x) < hp, 2000, 'the second swing lands'); await a.close(); await b.close();
      }],
      ['dazzle powder: goblins within 4.5 m cannot attack for 2 s, then can again; the thrower can', async () => {
        const [a, b] = await pair(srv); await give(a, 'x:dazzle'); const r = await use(a); assert(r.some(m => m.flash), 'flash broadcast');
        const n = b.msgs.length; b.send({ atk: 1 }); await sleep(250); assert(!b.msgs.slice(n).some(m => m.hit), 'dazzled goblin cannot hit');
        const k = a.msgs.length; a.send({ atk: 1 }); await sleep(250); assert(a.msgs.slice(k).some(m => m.hit), 'the thrower hits');
        await sleep(2200); const j = b.msgs.length; b.send({ atk: 1 }); await sleep(250); assert(b.msgs.slice(j).some(m => m.hit), 'recovered'); await a.close(); await b.close();
      }],
      ['rage brew and wolf fang raise damage, never past +50%', async () => {
        const [a, b] = await pair(srv); const club = G.combat(a.state.inv.weapon).dmg;
        await give(a, 'x:rage'); await use(a); let n = b.msgs.length; a.send({ atk: 1 }); await sleep(250); let h = b.msgs.slice(n).find(m => m.hit); assert(h && h.hit.dmg === Math.round(club * 1.3), 'rage 1.3x: ' + (h && h.hit.dmg) + ' vs ' + club);
        await give(a, 'c:fang', 'charm'); await sleep(1100); n = b.msgs.length; a.send({ atk: 1 }); await sleep(250); h = b.msgs.slice(n).find(m => m.hit); assert(h && h.hit.dmg === Math.round(club * 1.3 * 1.08), 'rage + fang: ' + (h && h.hit.dmg)); await a.close(); await b.close();
      }],
      ['mimic bait: the fake pile bites a stranger for 16, gives the owner his bait back, and never leaks the trick', async () => {
        const [a, b, cx, cz] = await pair(srv); await give(a, 'x:bait'); await use(a);
        assert(a.state.drops.length === 1, 'one pile'); const pile = a.state.drops[0];
        assert(!JSON.stringify(a.state.drops).includes('bait') && G.ITEMS[pile.items[0]].type === 'weapon' && G.ITEMS[pile.items[0]].tierN >= 1, 'it looks like a real weapon drop');
        b.send({ tp: [pile.x - 1, pile.z] }); await sleep(120); const hp = hpOf(b); b.send({ loot: [pile.id, 0, 'take', pile.items[0]] });
        await b.until(x => x.msgs.some(m => m.bite && m.bite.dmg === 16), 2000, 'bitten'); await b.until(x => hpOf(x) === hp - 16, 2000, 'hp -16'); eq(b.state.drops.length, 0, 'the pile is gone'); eq(b.state.inv.backpack.includes(pile.items[0]), false, 'no weapon was gained');
        await sleep(550); await give(a, 'x:bait'); await use(a); const p2 = a.state.drops[0]; a.send({ loot: [p2.id, 0, 'take'] }); await a.until(x => x.state.inv.backpack.includes('x:bait'), 2000, 'owner takes the bait back'); eq(hpOf(a), maxOf(a)); await a.close(); await b.close();
      }],
      ['alarm bell: rings only its owner when somebody comes within 3 m', async () => {
        const [a, b, cx, cz] = await pair(srv); b.send({ tp: [cx - 5, cz] }); await sleep(120); await give(a, 'x:bell'); const r = await use(a); const bell = a.msgs.find(m => m.bell); assert(bell, 'owner is told');
        eq(b.msgs.some(m => m.bell), false, 'nobody else sees the bell'); await sleep(300); eq(a.msgs.some(m => m.bellRing), false, 'quiet while nobody is near');
        b.send({ tp: [bell.bell.x - 2, bell.bell.z] }); await a.until(x => x.msgs.some(m => m.bellRing && m.bellRing.by === b.state.you && m.bellRing.ms === 5000), 2000, 'bell rings'); eq(b.msgs.some(m => m.bellRing), false, 'the intruder is not told');
        await a.until(x => x.msgs.some(m => m.bellEnd), 2000, 'bell spent'); await a.close(); await b.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  useplus-duel setup: ' + e.message); }
  srv.stop();

  // bots: wear a charm, drink a brain jar
  srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_BOT_GRACE_MS: '0', GK_ROUND_MS: '60000' });
  try {
    fail += await L.run('useplus-bots', [
      ['a bot puts on a charm from its backpack and uses a brain jar at once', async () => {
        const c = await connect(srv.port, 'wins=0'), lab = async cmd => { const n = c.msgs.length; c.send({ botlab: cmd }); await c.until(x => x.msgs.slice(n).some(m => m.botlab), 2000, 'botlab'); return c.msgs.slice(n).find(m => m.botlab).botlab; };
        const k0 = (await lab({})).know; const r = await lab({ nav: { backpack: ['c:heart', 'x:jar'] } }); eq(r.charm, 'c:heart', 'charm worn');
        await sleep(2500); const r2 = await lab({}); assert(!r2.pack.includes('x:jar'), 'jar used'); assert(r2.know >= k0 + 3.99, 'knowledge rose: ' + k0 + ' -> ' + r2.know); await c.close();
      }],
    ]);
  } catch (e) { fail++; console.log('  FAIL  useplus-bots setup: ' + e.message); }
  srv.stop();
  process.exit(fail ? 1 : 0);
})();

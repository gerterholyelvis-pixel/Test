// stations (docs/PLAN-5x5.md 1.5, 1.6, 9): layout rules over many rolls, the recycler efficiency (home 50%: floor, at least 1 of the main part; merchant and Grand 100%),
// and a live check that a recycle in your own home gives 50% and a recycle at a merchant gives 100%.
const L = require('./lib.js'), { connect, connectWith, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const side = id => Math.floor(id / 5);   // attached ids 5s..5s+4 sit on side s (N E S W), positions 1..5
const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// an item whose full recycler yield differs from its 50% yield, so the live test can tell the two apart
const probe = (() => {
  for (const key of Object.keys(G.ITEMS)) {
    if (!/^[wa]:/.test(key) || G.ITEMS[key].chance === 0) continue; const y = G.recycleFor(key, []); if (!y) continue;
    const half = G.recycleEff(y, 0.5); if (JSON.stringify(half) !== JSON.stringify(y) && Object.keys(y).length >= 1) return { key, full: y, half };
  }
  throw new Error('no item with a recycle yield that halves');
})();

(async () => {
  let fail = await L.run('stations', [
    ['layout: 20 entries over 5000 rolls, homes at positions 2 and 4, exactly 1 forge and 1 grand on opposite sides, at least one merchant, only known types', () => {
      const rnd = seeded(7), sidesF = new Set(), slotsF = new Set(), slotsG = new Set(); let merchants = 0;
      for (let n = 0; n < 5000; n++) {
        const l = G.randomLayout(rnd); eq(l.length, 20);
        l.forEach((t, id) => { assert(['home', 'chest', 'mystery', 'merchant', 'forge', 'grand'].includes(t), 'bad type ' + t); eq(t === 'home', id % 5 === 1 || id % 5 === 3, 'only positions 2 and 4 are homes (id ' + id + ')'); });
        const fi = l.indexOf('forge'), gi = l.indexOf('grand'); eq(l.filter(t => t === 'forge').length, 1); eq(l.filter(t => t === 'grand').length, 1);
        eq(side(gi), (side(fi) + 2) % 4, 'Grand Recycler sits on the opposite side of the Master Forge');
        assert(l.includes('merchant'), 'no merchant in a layout'); merchants += l.filter(t => t === 'merchant').length;
        sidesF.add(side(fi)); slotsF.add(fi % 5); slotsG.add(gi % 5);
      }
      eq([...sidesF].sort(), [0, 1, 2, 3], 'the Forge turns up on every side'); eq([...slotsF].sort(), [0, 2, 4], 'on any loot position (1, 3, 5) of its side'); eq([...slotsG].sort(), [0, 2, 4]);
      assert(merchants / 5000 > 1 && merchants / 5000 < 3, 'merchants per layout: ' + merchants / 5000);
    }],
    ['layout: the default (Math.random) roll obeys the same rules, and an unlucky roll without a merchant gets one', () => {
      for (let n = 0; n < 300; n++) { const l = G.randomLayout(); assert(l.includes('merchant') && l.includes('forge') && l.includes('grand')); }
      // a roll that only ever draws chest (the first table entry): a merchant is forced in
      const l = G.randomLayout(() => 0.0001); assert(l.includes('merchant'), 'forced merchant'); eq(l.filter(t => t === 'merchant').length, 1);
    }],
    ['STATIONS table: bench normal / master, recycler home 50% / full 100%', () => {
      eq(G.STATIONS.recycler.home.eff, 0.5); eq(G.STATIONS.recycler.full.eff, 1.0);
      assert(G.STATIONS.bench.master.maxTier > G.STATIONS.bench.normal.maxTier && G.STATIONS.bench.master.costMul < G.STATIONS.bench.normal.costMul && G.STATIONS.bench.master.craftMs < G.STATIONS.bench.normal.craftMs, 'the Master Forge is better in every way');
      assert(G.STATIONS.bench.master.bonusTier >= 1, 'bonusTier');
    }],
    ['recycleEff: floor(n * eff) per part, at least 1 of the main part; full efficiency and nulls pass through', () => {
      eq(G.recycleEff({ metal: 5, wood: 3 }, 0.5), { metal: 2, wood: 1 }, 'floors');
      eq(G.recycleEff({ metal: 4, gem: 1 }, 0.5), { metal: 2 }, 'a part that floors to 0 disappears');
      eq(G.recycleEff({ metal: 1 }, 0.5), { metal: 1 }, 'a single part keeps its 1');
      eq(G.recycleEff({ metal: 3, gem: 1 }, 0.5), { metal: 1 }, '3 * 0.5 floors to 1, the gem is lost');
      eq(G.recycleEff({ wood: 1, gem: 1 }, 0.5), { wood: 1 }, 'equal parts: the first is the main part and keeps 1');
      eq(G.recycleEff({ cloth: 2 }, 0.5), { cloth: 1 });
      eq(G.recycleEff({ metal: 7, wood: 3 }, 1), { metal: 7, wood: 3 }, 'eff 1 = unchanged'); eq(G.recycleEff({ metal: 7 }, undefined), { metal: 7 }, 'unknown eff = unchanged');
      eq(G.recycleEff(null, 0.5), null); eq(G.recycleEff({}, 0.5), {});
      for (const key of Object.keys(G.ITEMS)) {   // every real item: the home yield is a subset of the full yield, never empty, and holds >= 1 of the biggest part
        const y = G.recycleFor(key, []); if (!y) continue; const h = G.recycleEff(y, G.STATIONS.recycler.home.eff), main = Object.keys(y).reduce((a, b) => y[b] > y[a] ? b : a);
        assert(h && Object.keys(h).length >= 1 && h[main] >= 1, key + ' home yield lost its main part');
        for (const k in h) assert(h[k] <= y[k] && h[k] === Math.max(Math.floor(y[k] * 0.5), k === main ? 1 : 0), key + ' part ' + k + ': ' + h[k] + ' of ' + y[k]);
      }
    }],
    ['benchCraft: the normal bench stops at tier 2, the Master Forge reaches tier 5 at 25% off, and bonusTier crafts one tier above your knowledge at full price', () => {
      const R = id => G.RECIPES.find(r => r.id === id), P = k => ({ stats: { knowledge: k } }), t0 = R('r:w:roughclub'), t2 = R('r:w:trident'), t3 = R('r:w:halberd'), t5 = R('r:a:aegis');
      eq(G.benchCraft(P(0), t0, 'normal').cost, t0.cost, 'normal = full price'); eq(G.benchCraft(P(0), t0, 'normal').ms, 2500);
      eq(G.benchCraft(P(40), t2, 'normal').cost, t2.cost); eq(G.benchCraft(P(100), t3, 'normal').why, 'bench', 'a tier 3 recipe is too much for a normal bench, even with the knowledge');
      eq(G.benchCraft(P(10), t2, 'normal').why, 'knowledge'); eq(G.benchCraft(P(10), t2, 'master').why, 'knowledge', 'two tiers up is out of reach even at the Forge');
      const m = G.benchCraft(P(100), t3, 'master'); eq(m.ms, 800); eq(m.bonus, false); for (const k in t3.cost) eq(m.cost[k], Math.ceil(t3.cost[k] * 0.75), 'master discount on ' + k);
      const b = G.benchCraft(P(40), t3, 'master'); eq(b.bonus, true, 'bonus tier'); eq(b.cost, t3.cost, 'bonus tier costs full price'); eq(G.benchCraft(P(20), t3, 'master').why, 'knowledge');
      assert(!G.benchCraft(P(100), t5, 'master').why, 'tier 5 at the Forge'); eq(G.benchCraft(P(100), t5, 'normal').why, 'bench');
      eq(G.benchCraft(P(0), t0, 'nonsense').cost, t0.cost, 'an unknown bench type counts as normal');
      for (const r of G.RECIPES) { const n = G.benchCraft(P(100), r, 'master'); for (const k in r.cost) assert(n.cost[k] >= 1 && n.cost[k] <= r.cost[k], r.id + ' master cost ' + k); }
    }],
    ['no infinite materials: crafting at any bench and recycling at 50% or 100% never returns more than was paid, with every perk mix', () => {
      for (const perks of [[], ['thrifty'], ['scrapper'], ['thrifty', 'scrapper']]) for (const r of G.RECIPES) for (const key of [r.out, r.out + '+']) {
        if (!G.ITEMS[key]) continue; const y = G.recycleFor(key, perks); if (!y) continue;
        const paid = G.benchCraft({ stats: { knowledge: 100 } }, r, 'master', perks).cost;   // the cheapest way to make it
        for (const eff of [0.5, 1]) { const out = G.recycleEff(y, eff); let got = 0, cost = 0; for (const k in out) { assert(out[k] <= (paid[k] || 0), key + ' perks ' + perks + ' eff ' + eff + ': ' + k + ' ' + out[k] + ' > ' + (paid[k] || 0)); got += out[k]; } for (const k in paid) cost += paid[k]; assert(got <= cost, key + ' total'); }
      }
    }],
    ['canCraft / addKnowledge adapters', () => {
      assert(G.canCraft({ stats: { knowledge: 3 } }, { needs: 3 }) && !G.canCraft({ stats: { knowledge: 2 } }, { needs: 3 }) && G.canCraft({ stats: {} }, {}), 'canCraft');
      const p = { stats: { knowledge: 1 } }; eq(G.addKnowledge(p, 2.5), 2.5); eq(p.stats.knowledge, 3.5); eq(G.addKnowledge(p, NaN), 0); eq(p.stats.knowledge, 3.5); eq(G.addKnowledge(null, 1), 0);
    }],
  ]);
  if (fail) process.exit(1);
  // ---- live ----
  const srv = await L.startServer(); let bad = 1;
  try {
    bad = await L.run('stations-live', [
      ['a recycle in your own home gives 50% (floor, at least 1 of the main part)', async () => {
        const c = await connect(srv.port, 'goblin=2'), home = c.state.matchStart.spawn.home, ck = W.CHEST[+home.slice(1)];
        eq(c.state.layout[ck.id], 'home'); c.send({ tp: [ck.cx, ck.cz] }); await sleep(120);
        c.send({ give: probe.key }); await c.until(x => x.state.inv.backpack.includes(probe.key), 2000, 'item'); const slot = 'b' + c.state.inv.backpack.indexOf(probe.key), before = { ...c.state.parts };
        c.send({ recycle: slot }); await c.until(x => x.state.recycled, 2000, 'recycled');
        eq(c.state.recycled.parts, probe.half, 'the home recycler yields half of ' + JSON.stringify(probe.full)); eq(c.state.inv.backpack[+slot.slice(1)], null, 'the item is consumed');
        for (const k in probe.half) eq(c.state.parts[k] - (before[k] || 0), probe.half[k], 'part ' + k + ' added');
        await c.close();
      }],
      ['a recycle at a merchant gives 100%; a recycle in an arena hall is refused', async () => {
        const c = await connectWith(srv.port, s => s.layout && s.layout.includes('merchant'), 'goblin=2'), mid = c.state.layout.indexOf('merchant'), mk = W.CHEST[mid];
        c.send({ give: probe.key }); await c.until(x => x.state.inv.backpack.includes(probe.key), 2000, 'item'); const slot = 'b' + c.state.inv.backpack.indexOf(probe.key);
        c.send({ tp: W.rc(0) }); await sleep(120); c.send({ recycle: slot }); await c.until(x => x.state.recycleFail, 2000, 'refused in a hall'); eq(c.state.recycleFail, 'room'); eq(c.state.inv.backpack[+slot.slice(1)], probe.key, 'item kept');
        const before = { ...c.state.parts }; c.send({ tp: [mk.cx, mk.cz] }); await sleep(120); c.send({ recycle: slot }); await c.until(x => x.state.recycled, 2000, 'recycled');
        eq(c.state.recycled.parts, probe.full, 'a merchant recycler gives everything'); for (const k in probe.full) eq(c.state.parts[k] - (before[k] || 0), probe.full[k], 'part ' + k + ' added');
        await c.close();
      }],
      ['crafting takes time: parts are paid at the start, the item arrives after the bench time and not before', async () => {
        const c = await connect(srv.port, 'goblin=2'), home = c.state.matchStart.spawn.home, ck = W.CHEST[+home.slice(1)];
        c.send({ tp: [ck.cx, ck.cz] }); c.send({ setParts: { wood: 5 } }); await c.until(x => x.state.parts.wood === 5, 2000, 'parts'); await sleep(100);
        const bag = c.state.inv.backpack.filter(Boolean).length; c.send({ craft: 'r:w:sharpstick' }); await c.until(x => x.state.crafting, 2000, 'craft started');
        eq(c.state.crafting.ms, G.STATIONS.bench.normal.craftMs); eq(c.state.crafting.type, 'normal'); await c.until(x => x.state.parts.wood === 3, 1000, 'parts paid up front');
        const t0 = Date.now(); c.send({ craft: 'r:w:stoneknife' }); await c.until(x => x.state.craftFail, 1000, 'busy'); eq(c.state.craftFail, 'busy', 'one craft at a time');
        await sleep(1500); eq(c.state.inv.backpack.filter(Boolean).length, bag, 'nothing yet after 1.5 s'); eq(c.state.crafted, undefined);
        await c.until(x => x.state.crafted, 3000, 'crafted'); assert(Date.now() - t0 >= 2000, 'took the bench time'); eq(c.state.crafted.key, 'w:sharpstick'); eq(c.state.inv.backpack.filter(Boolean).length, bag + 1);
        await c.close();
      }],
      ['cancel refunds the parts; leaving the room cancels and refunds too', async () => {
        const c = await connect(srv.port, 'goblin=2'), home = c.state.matchStart.spawn.home, ck = W.CHEST[+home.slice(1)];
        c.send({ tp: [ck.cx, ck.cz] }); c.send({ setParts: { wood: 5 } }); await c.until(x => x.state.parts.wood === 5, 2000, 'parts'); await sleep(100);
        c.send({ craft: 'r:w:sharpstick' }); await c.until(x => x.state.crafting, 2000, 'started'); await c.until(x => x.state.parts.wood === 3, 1000, 'paid');
        c.send({ craftCancel: 1 }); await c.until(x => x.state.craftCancel, 2000, 'cancelled'); eq(c.state.craftCancel, 'cancel'); eq(c.state.parts.wood, 5, 'refunded'); await sleep(2800); eq(c.state.crafted, undefined, 'a cancelled craft never completes');
        delete c.state.craftCancel; c.send({ craft: 'r:w:sharpstick' }); await c.until(x => x.state.parts.wood === 3, 1000, 'paid again'); c.send({ tp: W.rc(0) });
        await c.until(x => x.state.craftCancel, 2000, 'cancelled by leaving'); eq(c.state.craftCancel, 'left'); eq(c.state.parts.wood, 5, 'refunded after leaving'); await sleep(2800); eq(c.state.crafted, undefined);
        delete c.state.craftCancel; c.send({ tp: [ck.cx, ck.cz] }); await sleep(120); c.send({ craft: 'r:w:sharpstick' }); await c.until(x => x.state.parts.wood === 3, 1000, 'paid a third time'); c.send({ hp: 5 });   // taking a hit cancels as well
        await c.until(x => x.state.craftCancel, 2000, 'cancelled by a hit'); eq(c.state.craftCancel, 'hit'); eq(c.state.parts.wood, 5, 'refunded after a hit');
        c.send({ craftCancel: 1 }); await sleep(150);   // nothing running: harmless
        await c.close();
      }],
      ['a normal bench refuses a tier 3 recipe; the Master Forge crafts it fast, cheaper, and one tier above your knowledge at full price', async () => {
        const c = await connectWith(srv.port, s => s.layout && s.layout.includes('forge'), 'goblin=2'), home = c.state.matchStart.spawn.home, hk = W.CHEST[+home.slice(1)], fk = W.CHEST[c.state.layout.indexOf('forge')];
        const hal = G.RECIPES.find(r => r.id === 'r:w:halberd'), full = {}; for (const k in hal.cost) full[k] = 40; c.send({ setParts: full }); c.send({ know: 100 }); await sleep(150);
        c.send({ tp: [hk.cx, hk.cz] }); await sleep(120); c.send({ craft: hal.id }); await c.until(x => x.state.craftFail, 2000, 'refused'); eq(c.state.craftFail, 'bench', 'home bench: tier too high');
        delete c.state.crafting; c.send({ tp: [fk.cx, fk.cz] }); await sleep(120); c.send({ craft: hal.id }); await c.until(x => x.state.crafting, 2000, 'forge craft'); eq(c.state.crafting.type, 'master'); eq(c.state.crafting.ms, G.STATIONS.bench.master.craftMs); eq(c.state.crafting.bonus, 0);
        for (const k in hal.cost) await c.until(x => x.state.parts[k] === 40 - Math.ceil(hal.cost[k] * 0.75), 1000, 'discounted ' + k);
        await c.until(x => x.state.crafted, 3000, 'crafted'); eq(c.state.crafted.key, 'w:halberd');
        // bonus tier: 40 knowledge unlocks tier 2, the Forge lets you reach tier 3, at full price
        c.send({ know: 40 }); c.send({ setParts: full }); await sleep(150); delete c.state.crafting; delete c.state.crafted; c.send({ craft: hal.id }); await c.until(x => x.state.crafting, 2000, 'bonus craft'); eq(c.state.crafting.bonus, 1);
        for (const k in hal.cost) await c.until(x => x.state.parts[k] === 40 - hal.cost[k], 1000, 'full price ' + k);
        await c.until(x => x.state.crafted, 3000, 'crafted'); c.send({ know: 20 }); await sleep(100); c.send({ craft: hal.id }); await c.until(x => x.state.craftFail === 'knowledge', 2000, 'two tiers up is refused');
        await c.close();
      }],
      ['the Grand Recycler gives 100% and the Master Forge has no recycler', async () => {
        const c = await connectWith(srv.port, s => s.layout && s.layout.includes('grand'), 'goblin=2'), gk = W.CHEST[c.state.layout.indexOf('grand')], fk = W.CHEST[c.state.layout.indexOf('forge')];
        c.send({ give: probe.key }); await c.until(x => x.state.inv.backpack.includes(probe.key), 2000, 'item'); const slot = 'b' + c.state.inv.backpack.indexOf(probe.key);
        c.send({ tp: [fk.cx, fk.cz] }); await sleep(120); c.send({ recycle: slot }); await c.until(x => x.state.recycleFail, 2000, 'no recycler at the forge'); eq(c.state.recycleFail, 'room');
        c.send({ tp: [gk.cx, gk.cz] }); await sleep(120); c.send({ recycle: slot }); await c.until(x => x.state.recycled, 2000, 'recycled'); eq(c.state.recycled.parts, probe.full);
        await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  stations setup: ' + (e.stack || e)); }
  srv.stop(); process.exit(bad ? 1 : 0);
})();

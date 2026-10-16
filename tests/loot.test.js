// loot: the vault relic (once, only in the vault), merchant prices scale by round, a thrown plushie lures a bot, a bot recycles and crafts at a station
const L = require('./lib.js'), { connect, connectWith, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const [VX, VZ] = W.rc(W.VAULT), PED = [VX + 2.4, VZ];
const lab = async (c, cmd) => { const n = c.msgs.length; c.send({ botlab: cmd }); await c.until(x => x.msgs.slice(n).some(m => m.botlab), 2000, 'botlab'); return c.msgs.slice(n).find(m => m.botlab).botlab; };

(async () => {
  let fail = 0;
  // ---- relic: two humans, no bots
  let srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '30000' });
  try {
    fail += await L.run('loot-relic', [['the vault relic is a tier 3+ item, claimable once, only at the pedestal inside the vault', async () => {
      const [a, b] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1')]);
      const key = a.state.relic; assert(typeof key === 'string' && G.ITEMS[key] && G.ITEMS[key].tierN >= 3, 'relic key is mythic or better: ' + key); eq(b.state.relic, key);
      a.send({ tp: W.rc(1) }); a.send({ claim: 1 }); await a.until(x => x.state.claimFail, 2000, 'claimFail outside the vault'); eq(a.state.claimFail, 'room'); delete a.state.claimFail;
      a.send({ tp: [VX - 5, VZ] }); a.send({ claim: 1 }); await a.until(x => x.state.claimFail, 2000, 'claimFail far from the pedestal'); eq(a.state.claimFail, 'room'); delete a.state.claimFail;
      a.send({ tp: PED }); a.send({ claim: 1 });
      await a.until(x => x.state.claimed, 2000, 'claimed'); eq(a.state.claimed.key, key); assert(a.state.inv.backpack.includes(key), 'relic is in the backpack');
      await b.until(x => x.msgs.some(m => m.feed && /Vault relic/.test(m.feed.msg || '')), 2000, 'broadcast'); await b.until(x => x.state.relic === null, 2000, 'relic gone');
      b.send({ tp: PED }); b.send({ claim: 1 }); await b.until(x => x.state.claimFail, 2000, 'second claim'); eq(b.state.claimFail, 'taken'); assert(!b.state.inv.backpack.includes(key), 'second goblin gets nothing');
      await a.close(); await b.close();
    }]]);
  } catch (e) { fail++; console.log('  FAIL  loot-relic setup: ' + e.message); }
  srv.stop();

  // ---- prices: one human, quick rounds
  srv = await L.startServer({ GK_MATCH_SIZE: '1', GK_ROUND_MS: '700', GK_NEXT_ROUND_MS: '700' });
  try {
    fail += await L.run('loot-prices', [['shop prices rise 10% per round after round 2 (rounded to 5), buy() charges the current price', async () => {
      const c = await connectWith(srv.port, s => s.shops && s.shops.some(Boolean));
      const want = (base, n) => Math.round(base * (1 + 0.1 * Math.max(0, n - 2)) / 5) * 5, id = c.state.shops.findIndex(Boolean);
      const check = (n) => { const bad = c.state.shops.filter(Boolean).flat().filter(it => it.price !== want(it.base, n)); assert(!bad.length, 'round ' + n + ' wrong prices: ' + JSON.stringify(bad)); };
      const n0 = c.state.round.n; if (n0 <= 2) check(n0);
      await c.until(x => x.state.round.n === 3, 6000, 'round 3'); await sleep(60); check(3);
      assert(c.state.shops.filter(Boolean).flat().some(it => it.price > it.base), 'some price went up at round 3');
      await c.until(x => x.state.round.n === 5, 6000, 'round 5'); await sleep(60); check(5);
      const cc = W.CHEST[id]; c.send({ tp: [cc.cx, cc.cz] }); c.send({ gold: 5000 }); await c.until(x => x.state.gold === 5000, 2000, 'gold');
      const idx = c.state.shops[id].findIndex(it => !it.sold), price = c.state.shops[id][idx].price; c.send({ buy: [id, idx] });
      await c.until(x => x.state.gold !== 5000, 2000, 'bought'); eq(c.state.gold, 5000 - price);
      await c.close();
    }]]);
  } catch (e) { fail++; console.log('  FAIL  loot-prices setup: ' + e.message); }
  srv.stop();

  // ---- bots: plushie lure and stations
  srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0' });
  try {
    fail += await L.run('loot-bots', [
      ['a thrown plushie (quick slot key) lands where the server says and lures a bot within 8 m', async () => {
        const c = await connect(srv.port, 'wins=0'), [cx, cz] = W.rc(1);
        c.send({ tp: [cx + 3, cz] }); await sleep(100); c.send({ give: 'x:plushie' }); await c.until(x => x.state.inv.backpack.includes('x:plushie'), 2000, 'plushie in backpack');
        c.send({ mv: ['b' + c.state.inv.backpack.indexOf('x:plushie'), 'q0'] }); await c.until(x => x.state.inv.quick[0] === 'x:plushie', 2000, 'plushie in quick slot');
        c.send({ m: [cx + 3, cz, Math.PI / 2] }); await sleep(150);
        c.send({ throw: 'q0' }); await c.until(x => x.state.throw, 2000, 'throw message'); const t = c.state.throw;
        assert(Math.abs(t.to[0] - (cx - 4)) < 0.6 && Math.abs(t.to[1] - cz) < 0.6, 'lands about 7 m ahead: ' + JSON.stringify(t.to));
        eq(c.state.inv.quick[0], null);
        const bz = Math.min(t.to[1] + 5, cz + 5); await lab(c, { near: [t.to[0], bz] });
        let best = 99; for (let i = 0; i < 24 && best > 1.5; i++) { await sleep(150); const r = await lab(c, 'get'); best = Math.min(best, Math.hypot(r.pos[0] - t.to[0], r.pos[1] - t.to[1])); }
        assert(best <= 1.5, 'bot walked to the plushie, closest ' + best.toFixed(2) + ' m');
        c.send({ throw: 'q0' }); await sleep(250); eq(c.msgs.filter(m => m.throw).length, 1, 'single use');
        await c.close();
      }],
      ['a bot in a merchant room recycles junk weapons into parts and crafts a tier 0 item', async () => {
        const c = await connect(srv.port, 'wins=0'); await lab(c, 'station'); let r = null;
        for (let i = 0; i < 40; i++) { await sleep(200); r = await lab(c, 'get'); if (r.rec >= 2 && r.cra >= 1) break; }
        assert(r.rec >= 2 && r.junk === 0, 'junk sticks recycled: ' + JSON.stringify(r)); assert(r.cra >= 1, 'crafted: ' + JSON.stringify(r));
        await c.close();
      }]]);
  } catch (e) { fail++; console.log('  FAIL  loot-bots setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

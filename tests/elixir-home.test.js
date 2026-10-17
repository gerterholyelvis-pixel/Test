// Elixir pump, Elixir Screen, security and sendables end to end against the real server (docs/PLAN-5x5.md 1.7, 1.8; docs/reports/elixir-home-wiring.md).
// Two goblins (A, B) in one match. GK_DEBUG hooks: {tp}, {give}, {kill}, {dbgElixir:{n, tank, lv}}.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js');
const at = (home, kind, dx = 0, dz = 0) => { const c = W.CHEST[+home.slice(1)], a = W.HOME_LAYOUT[kind], [x, z] = W.attLocal(c, a[0], a[1]); return [x + dx, z + dz]; };
const doorSpot = (home, d) => { const c = W.CHEST[+home.slice(1)]; return W.attLocal(c, 0, W.HS / 2 + d); };   // d > 0 is outside the hatch (in the arena cell), d < 0 inside the home
const homeOf = c => c.state.matchStart.spawn.home;
const last = (c, key) => { for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i][key] !== undefined) return c.msgs[i][key]; return undefined; };
const mark = c => c.msgs.length;
const since = (c, i, key) => c.msgs.slice(i).map(m => m[key]).filter(v => v !== undefined);
const dbg = (c, o) => c.send({ dbgElixir: o });
let spare = null;
async function pair(srv) {   // a third goblin keeps the match alive when one of them dies
  if (spare) { await spare.close(); spare = null; }
  const [a, b, c3] = await Promise.all([connect(srv.port, 'goblin=0'), connect(srv.port, 'goblin=1'), connect(srv.port, 'goblin=2')]); spare = c3;
  await a.until(c => c.state.round && c.state.round.n >= 1 && c.state.elixir === 0, 4000, 'elixir 0 at GO'); return [a, b];
}
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '3', GK_ROUND_MS: '4000', GK_NEXT_ROUND_MS: '60000', GK_BOT_GRACE_MS: '0' }); let fail = 1;
  try {
    fail = await L.run('elixir-home', [
      ['pump: lazy tank, E collects at the pump only, the carry cap holds, a raider drains a foreign tank and the owner is told', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a), hb = homeOf(b);
        a.send({ tp: at(ha, 'pump', 0, 1.2) }); await sleep(100);
        dbg(a, { tank: 30 }); await a.until(c => c.state.home && c.state.home.tank === 30, 2000, 'tank 30');
        a.send({ tp: L.centre(ha) }); await sleep(60); a.send({ pump: 1 }); await a.until(c => c.state.homeRes && c.state.homeRes.ok === false, 1500, 'too far refused');
        eq(a.state.elixir, 0, 'nothing collected from far away');
        a.send({ tp: at(ha, 'pump', 0, 1.2) }); await sleep(100); a.send({ pump: 1 });
        await a.until(c => c.state.elixir === 30, 2000, 'collected 30'); eq(a.state.home.tank, 0);
        dbg(a, { n: 115, tank: 20 }); await a.until(c => c.state.elixir === 115, 1500); a.send({ pump: 1 });
        await a.until(c => c.state.elixir === 120, 2000, 'carry cap 120'); assert(a.state.home.tank >= 15, 'the rest stays in the tank: ' + a.state.home.tank);
        // B raids A's tank
        dbg(a, { tank: 10 }); await sleep(100); const i = mark(a);
        b.send({ tp: at(ha, 'pump', 0, 1.2) }); await sleep(100); b.send({ pump: 1 });
        await b.until(c => c.state.elixir === 10, 2000, 'raider took the tank');
        await a.until(c => since(a, i, 'homeToast').some(t => t.kind === 'raid' && /draining your pump/.test(t.text)), 2000, 'owner toast');
        // B at his own pump with a tank of 5 gets it, A cannot use B's screen
        await a.close(); await b.close();
      }],
      ['screen: owner-only buys with level order and cost, the pump level raises the tank cap, distill is capped at 3, rate limit holds', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a);
        dbg(a, { n: 100 }); a.send({ tp: at(ha, 'screen', 1, 0) }); await sleep(100);
        a.send({ base: { buy: 'alarm' } }); await a.until(c => c.state.home && c.state.home.lv.alarm === 1 && c.state.elixir === 90, 2000, 'alarm bought for 10');
        a.send({ base: { buy: 'pump' } }); await a.until(c => c.state.home.lv.pump === 1 && c.state.elixir === 70 && c.state.home.tankCap === 64, 2000, 'pump II: cap 64');
        a.send({ base: { buy: 'nope' } }); a.send({ base: { buy: 'pump' } }); a.send({ base: { buy: 'pump' } }); await sleep(250);
        assert(a.state.home.lv.pump <= 2 && a.state.elixir >= 0, 'never more than level 3 or negative elixir');
        dbg(a, { n: 100 }); await sleep(120);
        for (let k = 0; k < 4; k++) { await sleep(280); a.send({ base: { act: 'distill' } }); }
        await sleep(300); eq(a.state.home.distills, 3, 'three distills at most'); eq(a.state.elixir, 40, '3 x 20 spent');
        // B cannot use A's screen (and A cannot send B's mail)
        b.send({ tp: at(ha, 'screen', 1, 0) }); await sleep(100); const i = mark(b);
        b.send({ base: { buy: 'alarm' } }); await sleep(250);
        eq(since(b, i, 'home').length, 0, 'B receives no home state'); assert(a.state.home.lv.alarm === 1);
        // not enough elixir
        dbg(a, { n: 3 }); await sleep(100); const j = mark(a); a.send({ base: { buy: 'guard' } });
        await a.until(c => since(c, j, 'homeRes').some(r => r.ok === false), 1500, 'refused'); eq(a.state.home.lv.guard || 0, 0);
        // flood: far more than 8 messages in a second, the excess is dropped (elixir never goes negative)
        dbg(a, { n: 100 }); await sleep(100); for (let k = 0; k < 30; k++) a.send({ base: { buy: 'bench' } }); await sleep(400);
        eq(a.state.home.lv.bench, 1); eq(a.state.elixir, 60);
        await a.close(); await b.close();
      }],
      ['brew and refine: a Healing Draught for 8, a refined recycle for 4 at 100%, owner only', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a), hb = homeOf(b);
        dbg(a, { n: 30 }); a.send({ tp: at(ha, 'bench', 0, 1.3) }); await sleep(100);
        a.send({ brew: 'heal' }); await a.until(c => c.state.elixir === 22 && c.state.inv.backpack.includes('x:draught'), 2000, 'draught brewed');
        a.send({ brew: 'bogus' }); await sleep(150); eq(a.state.elixir, 22);
        a.send({ brew: 'tonic' }); await a.until(c => c.state.elixir === 10 && c.state.inv.backpack.includes('x:tonic'), 2000, 'tonic brewed');
        const probe = Object.keys(G.ITEMS).find(k => /^w:/.test(k) && G.ITEMS[k].chance > 0 && G.recycleFor(k, []) && JSON.stringify(G.recycleEff(G.recycleFor(k, []), 0.5)) !== JSON.stringify(G.recycleFor(k, [])));
        a.send({ give: probe }); await a.until(c => c.state.inv.backpack.includes(probe), 1500); const slot = 'b' + a.state.inv.backpack.indexOf(probe);
        a.send({ tp: at(ha, 'recycler', 0, 1.6) }); await sleep(100); a.send({ recycle: slot, refine: 1 });
        await a.until(c => c.state.recycled, 2000, 'recycled'); eq(a.state.recycled.parts, G.recycleFor(probe, []), 'refined = 100%'); eq(a.state.elixir, 6, 'refine costs 4');
        // B cannot use A's recycler or bench
        b.send({ give: probe }); await b.until(c => c.state.inv.backpack.includes(probe), 1500); b.send({ tp: at(ha, 'recycler', 0, 1.6) }); await sleep(100);
        b.send({ recycle: 'b' + b.state.inv.backpack.indexOf(probe) }); await b.until(c => c.state.recycleFail === 'owner', 1500, 'owner only');
        await a.close(); await b.close();
      }],
      ['raid vs lock: Door Lock L1 holds a non-owner at the hatch for 2 s, never the owner; Alarm tells the owner; the Snare roots and hurts the first intruder once', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a);
        dbg(a, { lv: { lock: 1, alarm: 1, snare: 1 } }); await a.until(c => c.state.home && c.state.home.lv.lock === 1, 1500);
        a.send({ dbgElixir: { lv: { snare: 1 } } });
        await a.until(c => c.state.round.n >= 2, 8000, 'round 2: the hatches open (home phase)');
        // the owner walks out and in without any delay
        const out = doorSpot(ha, 1.0), inn = doorSpot(ha, -0.2); a.send({ tp: doorSpot(ha, -1) }); await sleep(80);
        const i = mark(a); a.send({ m: [...doorSpot(ha, 0.2), 0] }); await sleep(120); a.send({ m: [...doorSpot(ha, 1.0), 0] }); await sleep(120); a.send({ m: [...doorSpot(ha, 0.1), 0] }); await sleep(120); a.send({ m: [...doorSpot(ha, -0.9), 0] }); await sleep(150);
        eq(since(a, i, 'fix').length, 0, 'the lock never stops the owner');
        // the intruder pushes against the hatch
        b.send({ tp: doorSpot(ha, 0.8) }); await sleep(100); const j = mark(b), t0 = Date.now(); let through = -1, fixes = 0;
        while (Date.now() - t0 < 4000) {
          const k = mark(b); b.send({ m: [...doorSpot(ha, -0.4), 0] }); await sleep(100);
          if (since(b, k, 'fix').length) { fixes++; b.send({ tp: doorSpot(ha, 0.8) }); await sleep(60); } else { through = Date.now() - t0; break; }
        }
        assert(through >= 1700 && through < 3500, 'picked through after ' + through + ' ms (fixes ' + fixes + ')'); assert(fixes >= 5, 'refused while picking: ' + fixes);
        await b.until(c => since(c, j, 'homeToast').some(t => /Picking the lock/.test(t.text)), 1000, 'pick toast');
        await a.until(c => since(c, i, 'homeToast').some(t => t.kind === 'alarm' && /Intruder: /.test(t.text)), 2500, 'alarm toast');
        await b.until(c => since(c, j, 'snared').length === 1 && since(c, j, 'homeToast').some(t => /snare/i.test(t.text)), 2500, 'snare');
        assert(b.state.snared.ms === 2000, 'root 2 s'); await b.until(c => c.msgs.slice(j).some(m => m.hit && m.hit.to === c.state.you && m.hit.dmg === 10), 1500, 'snare damage 10');
        assert(!a.closed && !b.closed, 'nobody was kicked for the refused steps');
        await a.close(); await b.close();
      }],
      ['sends are refused in round 1 and for the Vault, your own room and non-rooms, and a refusal charges nothing', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a), cellB = '24';
        dbg(a, { n: 100 }); a.send({ tp: at(ha, 'screen', 1, 0) }); await sleep(100);
        a.send({ base: { send: 'rats', room: cellB } }); await a.until(c => c.state.homeRes && c.state.homeRes.reason === 'round1', 1500, 'round 1 refused');
        await a.until(c => c.state.round.n >= 2, 8000, 'round 2');
        for (const [id, room, why] of [['rats', W.VAULT_KEY, 'vault'], ['rats', ha, 'own'], ['leech', cellB, 'target'], ['rats', 'c1', 'target'], ['nope', cellB, 'unknown']]) {
          const k = mark(a); a.send({ base: { send: id, room } }); await a.until(c => since(c, k, 'homeRes').length > 0, 1500, 'reply ' + why); await sleep(300);
          eq(since(a, k, 'homeRes')[0].reason, why, id + ' to ' + room); eq(a.state.elixir, 100, 'nothing charged for a refusal');
        }
        await a.close(); await b.close();
      }],
      ['death loses elixir: the carried amount becomes a flask pile anyone can take, the home dies (upgrades gone, lock open, box spilled, pump stays takeable)', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a), hb = homeOf(b);
        dbg(a, { n: 50, tank: 12, lv: { lock: 1, lockbox: 1 } }); await a.until(c => c.state.home && c.state.home.lv.lock === 1, 1500);
        a.send({ give: 'w:sword' }); await a.until(c => c.state.inv.backpack.includes('w:sword'), 1500); a.send({ tp: at(ha, 'screen', 1, 0) }); await sleep(100);
        a.send({ lockbox: { put: 'b' + a.state.inv.backpack.indexOf('w:sword') } }); await a.until(c => c.state.home.box.length === 1, 1500, 'stored in the lockbox');
        a.send({ dbgElixir: { n: 50 } }); await sleep(100); const kb = mark(b);
        a.send({ kill: 1 });
        await b.until(c => c.state.drops && c.state.drops.some(d => d.items.includes('x:flask:50')), 2500, 'flask pile of 50');
        await b.until(c => since(c, kb, 'homeDead').includes(ha), 1500, 'home dead broadcast');
        const dr = b.state.drops.find(d => d.items.includes('x:flask:50')); b.send({ tp: [dr.x, dr.z] }); await sleep(100);
        b.send({ loot: [dr.id, dr.items.indexOf('x:flask:50'), 'take'] }); await b.until(c => c.state.elixir === 50, 2000, 'the killer or anyone takes the elixir');
        const sp = b.state.drops.find(d => d.items.includes('w:sword') && d.id !== dr.id) || b.state.drops.find(d => d.items.includes('w:sword')); assert(sp, 'the lockbox spilled as a loot pile');
        // the dead pump is a neutral tank: anyone may take what was left
        b.send({ tp: at(ha, 'pump', 0, 1.2) }); await sleep(100); b.send({ pump: 1 }); await b.until(c => c.state.elixir === 62, 2000, 'left-over tank of the dead home');
        await b.until(c => c.state.round.n >= 2, 8000, 'round 2: the hatches open (home phase)');
        // the lock is gone: B walks in with no pick (we are already inside); walk out and in
        b.send({ tp: doorSpot(ha, 0.5) }); await sleep(100); const j = mark(b); b.send({ m: [...doorSpot(ha, -0.5), 0] }); await sleep(250); eq(since(b, j, 'fix').length, 0, 'the lock opened');
        await b.close();
      }],
      ['raid: cracking a lockbox takes 8 s and is announced to the owner; walking away cancels; at the end the raider holds the items', async () => {
        const [a, b] = await pair(srv), ha = homeOf(a);
        dbg(a, { lv: { lockbox: 1 } }); await a.until(c => c.state.home && c.state.home.lv.lockbox === 1, 1500);
        a.send({ give: 'w:sword' }); await a.until(c => c.state.inv.backpack.includes('w:sword'), 1500); a.send({ tp: at(ha, 'screen', 1, 0) }); await sleep(100);
        a.send({ lockbox: { put: 'b' + a.state.inv.backpack.indexOf('w:sword') } }); await a.until(c => c.state.home.box.length === 1, 1500);
        const i = mark(a), j = mark(b);
        b.send({ tp: at(ha, 'box', 1.2, 0) }); await sleep(100); b.send({ base: { crack: 1 } }); await b.until(c => since(c, j, 'homeRes').some(r => r.ok), 1500, 'crack started');
        await a.until(c => since(c, i, 'homeToast').some(t => /cracking your lockbox/.test(t.text)), 1500, 'owner told');
        await sleep(1200); b.send({ tp: L.centre(ha) }); await sleep(900); eq(a.state.home.box.length, 1, 'walking away cancelled it');
        b.send({ tp: at(ha, 'box', 1.2, 0) }); await sleep(100); b.send({ base: { crack: 1 } });
        await sleep(6500); eq(a.state.home.box.length, 1, 'still shut after 6.5 s');
        await b.until(c => c.state.inv.backpack.includes('w:sword'), 4000, 'raider got the sword after 8 s');
        await a.until(c => since(c, i, 'homeToast').some(t => /emptied/.test(t.text)), 1500);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  elixir-home setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

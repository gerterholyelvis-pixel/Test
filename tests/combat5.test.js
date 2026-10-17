// combat5: the rules of a fight. Pure part: stamina, chain / whiff, guard numbers, the counterplay table. Server part: block, parry (tight window, riposte), guard break,
// tap-spam proof raises, winded swings, combos with a finisher, whiff recovery, dagger weak to cleave, bots that guard.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js'), C5 = require('../combat5.js').of(G);
const FACE_E = -Math.PI / 2, FACE_W = Math.PI / 2, T = G.COMBAT5;
const give = async (c, k) => { c.send({ give: k }); await c.until(x => x.state.inv.backpack.includes(k), 2000, k); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(k), 'weapon'] }); await c.until(x => x.state.inv.weapon === k, 2000, k + ' equipped'); };
const put = async (c, x, z, yaw = 0) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const hits = ms => ms.filter(m => m.hit && !m.hit.thorns).map(m => m.hit);
const near = (x, y, tol = 1) => Math.abs(x - y) <= tol;
async function base(a) { const n = a.msgs.length; a.send({ atk: 1 }); await sleep(450); const h = hits(a.msgs.slice(n)); eq(h.length, 1, 'baseline hit'); await sleep(700); return h[0].dmg; }   // an unguarded blow on this pair: goblin type perks vary, so every number below is relative to it
const lastSta = c => { const s = c.msgs.filter(m => m.sta).pop(); return s ? s.sta[0] : null; };
async function pair(srv, wins = 20) {
  const [a, b] = await Promise.all([connect(srv.port, 'goblin=1&wins=' + wins), connect(srv.port, 'goblin=1&wins=' + wins)]);
  await a.until(x => x.state.match && x.state.match.alive === 2, 3000, 'both entered');
  const [cx, cz] = W.rc(0), z = cz - 3; await give(a, 'w:sword'); await give(b, 'w:sword');
  await put(a, cx - 1, z, FACE_E); await put(b, cx + 0.4, z, FACE_W); return [a, b];
}

(async () => {
  let fail = await L.run('combat5', [
    ['stamina: spending, the post-spend pause, regeneration, never below zero; a short payment reports the shortfall', () => {
      const s = C5.staNew(); eq(s.v, T.STA.max);
      eq(C5.staSpend(s, 1000, 30), 0); eq(s.v, 70);
      C5.staStep(s, 1000 + T.STA.delay - 10); eq(s.v, 70);   // still inside the pause
      C5.staStep(s, 1000 + T.STA.delay + 1000); assert(Math.abs(s.v - (70 + T.STA.regen)) < 1, 'one second of regen: ' + s.v);
      const short = C5.staSpend(s, 5000, 500); assert(short > 0 && s.v === 0, 'shortfall, floor at 0');
      C5.staStep(s, 1e6); eq(s.v, T.STA.max);
    }],
    ['spam is costly but never a wall: a steady stream of swings runs a goblin dry in 5-15 s, a pause of one second brings a swing back, and a dry swing still happens', () => {
      for (const k of ['w:sword', 'w:dagger', 'w:warhammer', 'w:halberd', 'w:mace', 'w:spear']) {
        const cd = G.combat(k).cd, c = C5.state(); let t = 1000, dry = null;
        for (let i = 0; i < 80 && dry == null; i++) { const r = C5.pre(c, t, cd, k, 0, true); if (r.winded) dry = t - 1000; t += cd; }
        assert(dry != null && dry > 4000 && dry < 16000, k + ' runs dry after ' + dry + ' ms of non-stop swinging');
        const r0 = C5.pre(c, t, cd, k, 0, true); assert(r0.winded && r0.cdMul > 1 && r0.dmgMul < 1, 'the dry swing is slower and weaker, not refused');
        C5.staStep(c.sta, t + 1000 + T.STA.delay); assert(C5.pre(c, t + 1000 + T.STA.delay, cd, k, 0, true).winded === false, k + ': a one second breather is enough for a swing');
      }
    }],
    ['combo: a landed blow chains faster (daggers fastest), the third is a finisher with a longer recovery; a whiff costs recovery; a blocked blow breaks the chain; a late swing starts over', () => {
      const k = 'w:sword', cd = 600, c = C5.state(); let t = 1000;
      let r = C5.pre(c, t, cd, k, 0, true); eq(r.idx, 0); const d1 = C5.post(c, k, cd, 0, 1, 'e'); assert(d1 < 0 && d1 === -Math.round(cd * (1 - T.COMBO.fast)), 'chain faster: ' + d1);
      t += 500; r = C5.pre(c, t, cd, k, 0, true); eq(r.idx, 1); eq(r.fin, false); C5.post(c, k, cd, 1, 1, 'e');
      t += 500; r = C5.pre(c, t, cd, k, 0, true); eq(r.idx, 2); assert(r.fin && r.dmgMul === T.COMBO.fin.dmg, 'finisher');
      const d3 = C5.post(c, k, cd, 2, 1, 'e'); assert(d3 > 0, 'finisher recovery ' + d3); eq(c.n, 0);
      t += 500; r = C5.pre(c, t, cd, k, 0, true); eq(r.idx, 0); assert(C5.post(c, k, cd, 0, 0, 'e') === Math.round(cd * T.COMBO.whiff), 'whiff recovery');
      t += 500; r = C5.pre(c, t, cd, k, 0, true); eq(r.idx, 0, 'a whiff resets the chain');
      C5.post(c, k, cd, 0, 1, 'e'); t += 500; r = C5.pre(c, t, cd, k, 0, true); eq(r.idx, 1); eq(C5.post(c, k, cd, 1, 1, 'b'), 0); eq(c.n, 0, 'blocked: chain broken');
      C5.post(c, k, cd, 0, 1, 'e'); t += cd + T.COMBO.windowMs + 50; eq(C5.pre(c, t, cd, k, 0, true).idx, 0, 'too late: starts over');
      const dd = C5.state(); C5.pre(dd, 0, 450, 'w:dagger', 0, true); assert(C5.post(dd, 'w:dagger', 450, 0, 1, 'e') < -Math.round(450 * (1 - T.COMBO.fast)), 'daggers chain faster than swords');
      const rng = C5.state(); eq(C5.pre(rng, 0, 700, 'w:bow', 0, false).idx, 0); eq(rng.n, 0);
    }],
    ['guard numbers and the counterplay table: every weapon family has a row; bows cannot guard; hammers and whips cannot parry; axes break guards; daggers block worst; the Codex rows exist', () => {
      const fams = new Set(Object.values(G.ITEMS).filter(i => i.type === 'weapon').map(i => i.family));
      for (const f of fams) assert(T.FAM[f], 'no COMBAT5 row for family ' + f);
      for (const [f, r] of Object.entries(T.FAM)) assert(r.cost > 0 && r.drain > 0 && (r.blk == null || r.blk > 0 && r.blk < 1) && r.par >= 0, f);
      for (const f of ['bow', 'crossbow', 'sling']) eq(C5.guardOf('w:' + (f === 'sling' ? 'sling' : f)), null, f + ' cannot guard');
      eq(C5.guardOf('w:warhammer').parry, 0); eq(C5.guardOf('w:bullwhip').parry, 0);
      assert(C5.guardOf('w:sword').parry > 200 && C5.guardOf('w:sword').parry < 400, 'a tight window');
      assert(C5.blockCost('w:axe', 20) > C5.blockCost('w:sword', 20) && C5.blockCost('w:warhammer', 20) > C5.blockCost('w:axe', 20), 'axes and hammers drain a blocker most');
      assert(T.FAM.dagger.blk > T.FAM.sword.blk, 'a dagger blocks worst');
      assert(T.TEXT.length >= 4 && T.TEXT.every(r => r[0] && r[1].length > 30) && T.COUNTER.length >= 8, 'Codex rows');
    }],
  ]);
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '600000', GK_DEBUG: '1' }); let dsrv = null;
  try {
    fail += await L.run('combat5', [
      ['block: a held guard cuts a blow from the front by the weapon (cue blk), costs stamina; the blow from behind is not cut; a guard raised before the contact is a parry window, later it is a block', async () => {
        const [a, b] = await pair(srv); await sleep(300); const sw = await base(a);
        b.send({ grd: 1 }); await b.until(x => x.msgs.some(m => m.grd === x.state.you && !m.off), 1000, 'guard raised'); await sleep(450);   // past the parry window
        const s0 = lastSta(b), n = a.msgs.length; a.send({ atk: 1 }); await sleep(450);
        const h = hits(a.msgs.slice(n)); eq(h.length, 1); assert(h[0].blk === 1 && near(h[0].dmg, sw * T.FAM.sword.blk), 'blocked: ' + JSON.stringify(h[0]));
        assert(lastSta(b) < s0, 'the block cost stamina: ' + s0 + ' -> ' + lastSta(b));
        b.send({ grd: 0 }); await b.until(x => x.msgs.slice(-6).some(m => m.grd === x.state.you && m.off), 1000, 'lowered'); await sleep(900);
        const [cx, cz] = W.rc(0); await put(b, cx + 0.4, cz - 3, FACE_E);   // b turns his back on a: a guard does nothing from behind
        b.send({ grd: 1 }); await sleep(600); const n2 = a.msgs.length; a.send({ atk: 1 }); await sleep(450);
        const h2 = hits(a.msgs.slice(n2)); eq(h2.length, 1); assert(!h2[0].blk && h2[0].dmg >= sw, 'a guard does not cover the back: ' + JSON.stringify(h2[0]));
        await a.close(); await b.close();
      }],
      ['parry: raised just before the contact frame it takes no damage, staggers the attacker (c4g cue) and the next blow is a riposte; tapping the guard over and over is refused', async () => {
        const [a, b] = await pair(srv); await sleep(300); const sw = await base(a); await sleep(300);
        const n = a.msgs.length; a.send({ atk: 1 }); await sleep(90); b.send({ grd: 1 }); await sleep(500);
        const ms = a.msgs.slice(n); eq(hits(ms).length, 0, 'a parried blow does no damage');
        const pg = ms.find(m => m.c4g); assert(pg && pg.c4g.k === 'parry' && pg.c4g.to === b.state.you, 'parry cue ' + JSON.stringify(pg));
        b.send({ grd: 0 }); await sleep(100); const n2 = b.msgs.length; b.send({ atk: 1 }); await sleep(450);
        const h = hits(b.msgs.slice(n2)); eq(h.length, 1); assert(near(h[0].dmg, sw * T.GUARD.rip.mul), 'riposte x' + T.GUARD.rip.mul + ': ' + h[0].dmg);
        await sleep(900); const n3 = b.msgs.length; b.send({ grd: 1 }); await sleep(60); b.send({ grd: 0 }); await sleep(30); b.send({ grd: 1 }); await sleep(200);
        const g3 = b.msgs.slice(n3).filter(m => m.grd === b.state.you); assert(g3.length >= 3 && g3[g3.length - 1].off, 'a second raise right after lowering is refused: ' + JSON.stringify(g3));
        await a.close(); await b.close();
      }],
      ['guard break: a guard without stamina breaks (cue brk), most of the blow gets through, the guard drops; winded: a dry swing is weaker', async () => {
        const [a, b] = await pair(srv); await sleep(300); const sw = await base(a);
        b.send({ sta5: 14 }); await sleep(80); b.send({ grd: 1 }); await sleep(500);
        const n = a.msgs.length, nb = b.msgs.length; a.send({ atk: 1 }); await sleep(450);
        const h = hits(a.msgs.slice(n)); eq(h.length, 1); assert(h[0].brk === 1 && near(h[0].dmg, sw * T.GUARD.brkDmg), 'guard break: ' + JSON.stringify(h[0]));
        assert(b.msgs.slice(nb).some(m => m.grd === b.state.you && m.off && m.k === 'brk'), 'the guard came down with cue brk');
        await sleep(700); a.send({ sta5: 2 }); await sleep(60); const n2 = a.msgs.length; a.send({ atk: 1 }); await sleep(450);
        const w = hits(a.msgs.slice(n2)); eq(w.length, 1); assert(near(w[0].dmg, sw * T.STA.windedDmg), 'a winded swing hits softer: ' + w[0].dmg + ' vs ' + sw);
        await a.close(); await b.close();
      }],
      ['combo: a quick second and third swing after landed blows are accepted earlier than the cooldown, the third is a finisher (fin cue, +20 %); a whiff makes the next swing wait longer', async () => {
        const [a, b] = await pair(srv), cb = G.combat('w:sword'); await sleep(300);
        const early = Math.round(cb.cd * 0.9) - 70, n = a.msgs.length;   // earlier than the plain cooldown allows
        a.send({ atk: 1 }); await sleep(early); a.send({ atk: 1 }); await sleep(early); a.send({ atk: 1 }); await sleep(500);
        const ms = a.msgs.slice(n), sws = ms.filter(m => m.swing === a.state.you);
        eq(sws.length, 3, 'three swings accepted inside the plain cooldown: ' + sws.length); assert(sws[2].fin === 1 && !sws[1].fin, 'the third swing is the finisher');
        const hs = hits(ms); eq(hs.length, 3); assert(hs[2].fin === 1 && near(hs[2].dmg, hs[0].dmg * T.COMBO.fin.dmg), 'finisher damage ' + hs[2].dmg);
        await sleep(1500); const [cx, cz] = W.rc(0); await put(b, cx + 5, cz - 3, FACE_W); await sleep(100);
        const n2 = a.msgs.length; a.send({ atk: 1 }); await sleep(Math.round(cb.cd * 0.9) + 60); a.send({ atk: 1 }); await sleep(150);
        eq(a.msgs.slice(n2).filter(m => m.swing === a.state.you).length, 1, 'after a whiff the plain cooldown is not enough');
        await sleep(Math.round(cb.cd * T.COMBO.whiff) + 100); a.send({ atk: 1 }); await sleep(150);
        eq(a.msgs.slice(n2).filter(m => m.swing === a.state.you).length, 2, 'the penalty ends');
        await a.close(); await b.close();
      }],
      ['counterplay: sweeping blows hurt a dagger user 15 % more; stamina bar is reported to the owner', async () => {
        const [a, b] = await pair(srv); await sleep(300); const sw = await base(a); await give(b, 'w:dagger'); await sleep(300);
        const n = a.msgs.length; a.send({ atk: 1 }); await sleep(450);
        const h = hits(a.msgs.slice(n)); eq(h.length, 1); assert(near(h[0].dmg, sw * T.RULES.cleaveBane.dagger), 'sword vs dagger user: ' + h[0].dmg + ' vs ' + sw);
        const s = a.msgs.slice(n).filter(m => m.sta); assert(s.length && s[0].sta[0] <= T.STA.max - T.FAM.sword.cost + 1, 'a swing reports stamina ' + JSON.stringify(s[0]));
        await a.close(); await b.close();
      }],
    ]);
    // bots use the guard: two bots fight with the same sword; the tally says they raised guards and some parried
    const dsrvEnv = { GK_MATCH_SIZE: '3', GK_QUEUE_MS: '100', GK_READY_MS: '300', GK_ROUND_MS: '1200', GK_NEXT_ROUND_MS: '120000', GK_BOT_GRACE_MS: '0', GK_DEBUG: '1' };
    dsrv = await L.startServer(dsrvEnv);
    fail += await L.run('combat5', [['bots: in a fight bots raise guards (and parry now and then), run on the stamina rule and still finish the duel', async () => {
      const c = await connect(dsrv.port, 'name=Duel5'); c.send({ kill: 1 });
      await c.until(x => x.state.round && x.state.round.n >= 2, 8000, 'round 2').catch(() => {});
      const bot = { w: 'w:sword', arm: 'a:knight', goblin: 1, tac: true }; c.send({ duel6: { a: bot, b: bot } });
      await c.until(x => x.state.duel6, 3000, 'duel6'); await c.until(x => x.state.matchEnd, 40000, 'duel ends').catch(() => {});
      const n = c.msgs.length; c.send({ botstat: 1 }); await c.until(x => x.msgs.slice(n).some(m => m.botstat), 2000, 'botstat');
      const st = c.msgs.slice(n).find(m => m.botstat).botstat.c5; assert(st.botGuards >= 1, 'bots raised guards: ' + JSON.stringify(st)); assert(st.blocks + st.parries >= 1, 'bots blocked or parried: ' + JSON.stringify(st));
      assert(c.state.matchEnd, 'the duel finished'); await c.close();
    }]]);
  } catch (e) { console.log('  FAIL  combat5 setup: ' + (e.stack || e.message)); fail++; }
  srv.stop(); if (dsrv) dsrv.stop(); process.exit(fail ? 1 : 0);
})();

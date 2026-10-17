// BALANCE-3 (docs/reports/balance-3.md): ladder guards over tools/balsim.js (they fail when a number change breaks a tier ladder), the damage cap,
// and the server side of the two abilities: the dash (i-frames, movement allowance, cooldown) and the heavy blow (wind-up, damage, stagger), plus point blank and the perk cues.
const C4T = k => require('../combat4.js').timing(require('../items.js'), k, require('../items.js').combat(k).cd).contact;   // COMBAT4: ms from the click to the blow
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js'), S = require('../tools/balsim.js');
const JUNK = ['w:stick'], DASH_WAIT = G.ABIL.DASH.ms + 600;   // the Wooden Stick is the deliberate junk weapon of tier 1 (the most common drop)
const PX = d => W.rc(1)[0] + d, PZ = W.rc(1)[1], FACE_E = -Math.PI / 2;
const put = async (c, x, z, yaw) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
async function pair(srv, wins, ga = 1, gb = 1) {
  const [a, b] = await Promise.all([connect(srv.port, 'goblin=' + ga + '&wins=' + wins), connect(srv.port, 'goblin=' + gb + '&wins=' + wins)]);
  await a.until(x => x.state.match && x.state.match.alive === 2, 2000, 'both entered'); return [a, b];
}
const hitsOn = (c, n0) => c.msgs.slice(n0).filter(m => m.hit && m.hit.to === c.state.you && !m.hit.thorns).map(m => m.hit);
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2' }); let fail = 1;
  try {
    fail = await L.run('balance3', [
      ['weapon ladder: every weapon beats the tier below and loses to the tier above; inside a tier nothing is a must-pick; transcendent is strong, not unbeatable', async () => {
        const bad = [];
        for (const r of S.weaponLadder(50)) {
          if (r.down != null && r.down < 0.5) bad.push(r.name + ' loses to the tier below (' + r.down + ')');
          if (r.up != null && r.up > 0.5) bad.push(r.name + ' beats the tier above (' + r.up + ')');
          if (!JUNK.includes(r.key) && (r.same < 0.25 || r.same > 0.75)) bad.push(r.name + ' wins ' + r.same + ' in its own tier');
          if (r.tier === 5 && r.down > 0.96) bad.push(r.name + ' is unbeatable by legendary gear (' + r.down + ')');
        }
        assert(!bad.length, bad.join('; '));
      }],
      ['armour ladder: every armour beats the tier below and loses to the tier above (light pieces trade health for speed, so they may sit lower)', async () => {
        const bad = [];
        for (const r of S.armourLadder(24)) {
          if (r.down != null && r.down < (r.speed > 1 ? 0.45 : 0.5)) bad.push(r.name + ' loses to the tier below (' + r.down + ')');
          if (r.up != null && r.up > 0.5) bad.push(r.name + ' beats the tier above (' + r.up + ')');
        }
        assert(!bad.length, bad.join('; '));
      }],
      ['damage cap: one blow carries at most x1.75 of its weapon damage, thick hide still applies after it; the stack the cap stops is real', async () => {
        eq(G.DMG_CAP, 1.75); eq(G.capHit(20, 60, { goblin: 1 }), 35); eq(G.capHit(20, 30, { goblin: 1 }), 30); eq(G.capHit(20, 60, { goblin: 10 }), Math.round(35 * G.GOB_PERKS.thickhide.taken)); eq(G.capHit(0, 60, { goblin: 1 }), 60);
        const st = S.stacking(); assert(st.raw > 3, 'the uncapped stack: ' + st.raw); eq(st.capped, 1.75);
      }],
      ['abilities data: every heavy family has a multiplier under the cap, swords and bows have none; the Codex text exists', async () => {
        for (const k of ['w:warhammer', 'w:axe', 'w:mace', 'w:club', 'w:flail']) { const h = G.ABIL.heavyFor(k); assert(h && h.mult > 1 && h.mult < G.DMG_CAP, k); }
        for (const k of ['w:sword', 'w:bow', 'w:staff', 'w:dagger', null]) eq(G.ABIL.heavyFor(k), null, String(k));
        assert(G.ABIL.TEXT.length >= 3 && G.ABIL.TEXT.every(t => t[0] && t[1].length > 20));
      }],
      ['dash: blows inside the dash window miss (dodge broadcast), the next one after it lands; the cooldown holds', async () => {
        const [a, b] = await pair(srv, 10); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.6), PZ, 0);
        await sleep(200); let n0 = b.msgs.length; a.send({ atk: 1 }); await sleep(Math.max(0, C4T('w:club') - 60)); b.send({ dash: 1 }); await sleep(450);   // COMBAT4: the blow lands on its contact frame: the dash answers the telegraphed swing
        assert(b.msgs.slice(n0).some(m => m.dash === b.state.you), 'dash broadcast'); assert(a.msgs.some(m => m.dodge && m.dodge.dash && m.dodge.to === b.state.you), 'the blow was dodged'); eq(hitsOn(b, n0), [], 'hit during the dash');
        await sleep(500); n0 = b.msgs.length; a.send({ atk: 1 }); await sleep(Math.max(0, C4T('w:club') - 60)); b.send({ dash: 1 }); await sleep(450);
        eq(hitsOn(b, n0).length, 1, 'a second dash inside the cooldown still protected');
        await a.close(); await b.close();
      }],
      ['dash: it buys about 3 m of extra movement once (on top of the 2 m bank), then the normal limit applies again', async () => {
        const [a, b] = await pair(srv, 20); await put(a, PX(-4), PZ, FACE_E); await sleep(1100);   // a full movement budget
        const fixes = () => a.msgs.filter(m => m.fix).length, f0 = fixes();
        a.send({ dash: 1 }); await sleep(20); a.send({ m: [+PX(0.2).toFixed(2), PZ, FACE_E] }); await sleep(150);
        eq(fixes() - f0, 0, 'a dash-length step was corrected'); await sleep(DASH_WAIT);
        const f1 = fixes(); a.send({ m: [+PX(3.2).toFixed(2), PZ, FACE_E] }); await sleep(150); assert(fixes() > f1, 'the same step without a dash was accepted');
        await a.close(); await b.close();
      }],
      ['heavy blow: wind-up broadcast, x mult damage after chargeMs, the target is staggered (its swing is refused), a quick release is a normal swing', async () => {
        const [a, b] = await pair(srv, 30); await give(a, 'w:warhammer', 'weapon'); await give(b, 'a:aegis', 'armor'); b.send({ hp: 300 }); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.6), PZ, Math.PI / 2);
        const dmg = G.combat('w:warhammer').dmg, mult = G.ABIL.heavyFor('w:warhammer').mult;
        let n0 = b.msgs.length; a.send({ charge: 1 }); await sleep(80); assert(b.msgs.slice(n0).some(m => m.charge === a.state.you && !m.off), 'wind-up broadcast');
        await sleep(G.ABIL.HEAVY.chargeMs); a.send({ atk: 1, heavy: 1 }); await b.until(x => x.msgs.slice(n0).some(m => m.hit && m.hit.to === x.state.you), 1500, 'heavy blow landed'); b.send({ atk: 1 }); await sleep(200);   // COMBAT4: the blow lands on the contact frame; the victim's swing right after is refused
        const h = hitsOn(b, n0); eq(h.length, 1); eq(h[0].dmg, Math.round(dmg * mult), 'heavy damage'); eq(h[0].heavy, 1);
        assert(!b.msgs.slice(n0).some(m => m.swing === b.state.you), 'a staggered goblin swung');
        await sleep(G.combat('w:warhammer').cd + 100); n0 = b.msgs.length; a.send({ charge: 1 }); await sleep(100); a.send({ atk: 1, heavy: 1 }); await sleep(800);
        const h2 = hitsOn(b, n0); eq(h2.length, 1); eq(h2[0].dmg, dmg, 'an early release is a normal blow');
        await a.close(); await b.close();
      }],
      ['heavy blow: only heavy weapons can wind up; point blank: a bow hits for 70% inside 2 m', async () => {
        const [a, b] = await pair(srv, 40); await give(a, 'w:bow', 'weapon'); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.8), PZ, 0);
        let n0 = b.msgs.length; a.send({ charge: 1 }); await sleep(150); assert(!b.msgs.slice(n0).some(m => m.charge === a.state.you), 'a bow wound up');
        a.send({ atk: 1 }); await sleep(900); const h = hitsOn(b, n0); eq(h.length, 1); eq(h[0].dmg, Math.round(G.combat('w:bow').dmg * G.POINT_BLANK.mul), 'point blank');
        await a.close(); await b.close();
      }],
      ['perk cue: a sneak hitting from behind sends bs:1 with the hit', async () => {
        const [a, b] = await pair(srv, 50, 6, 1); await put(a, PX(-2), PZ, FACE_E); await put(b, PX(-0.8), PZ, FACE_E);   // b faces away from a
        const n0 = b.msgs.length; a.send({ atk: 1 }); await sleep(600); const h = hitsOn(b, n0); eq(h.length, 1); eq(h[0].bs, 1);
        await a.close(); await b.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  balance3 setup: ' + (e.stack || e.message)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

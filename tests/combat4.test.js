// combat4: hit geometry per weapon family (deterministic), swing windows, obstacles, cleave without double hits, stagger, projectiles vs walls,
// and duels under injected latency (tools/duelsim.js): blows that look like hits on the attacker's screen register, at 0 / 100 / 200 ms and with asymmetric pings.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), G = require('../items.js'), C4 = require('../combat4.js');
const FACE_E = -Math.PI / 2, yawE = FACE_E;
const pr = k => C4.profile(G, k), R = k => G.combat(k).range, r1 = G.hitRadius(1), h1 = C4.capH(1);
const hitAt = (k, tx, tz, ty = 0, ay = 0) => C4.melee(pr(k), R(k), 0, ay, 0, yawE, tx, ty, tz, r1, h1, null);   // attacker at the origin facing +x
const give = async (c, k) => { c.send({ give: k }); await c.until(x => x.state.inv.backpack.includes(k), 2000, k); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(k), 'weapon'] }); await c.until(x => x.state.inv.weapon === k, 2000, k + ' equipped'); };
const put = async (c, x, z, yaw = 0) => { c.send({ tp: [x, z] }); c.send({ m: [x, z, yaw] }); await sleep(60); };
const swing = async (c, extra) => { const n = c.msgs.length; c.send({ atk: 1, ...extra }); await c.until(x => x.msgs.slice(n).some(m => m.swr || m.projEnd), 1500, 'swing resolved').catch(() => {}); await sleep(60); return c.msgs.slice(n); };
const hits = ms => ms.filter(m => m.hit && !m.hit.thorns).map(m => m.hit);
async function group(srv, n, wins, gob = 1) { const cs = await Promise.all(Array.from({ length: n }, () => connect(srv.port, 'goblin=' + gob + '&wins=' + wins))); await cs[0].until(x => x.state.match && x.state.match.alive === n, 3000, 'all entered'); return cs; }

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '2', GK_ROUND_MS: '600000' }), srv3 = await L.startServer({ GK_MATCH_SIZE: '3', GK_ROUND_MS: '600000' }); let fail = 1;
  try {
    fail = await L.run('combat4', [
      ['geometry: sword arc, spear / dagger / whip line, axe narrow chop, hammer slam disc, flail wide arc', () => {
        assert(hitAt('w:sword', 1.5, 0) && hitAt('w:sword', 1.0, 1.4) && !hitAt('w:sword', 0.2, 2.0) && !hitAt('w:sword', -1, 0), 'sword arc: front and 54 deg yes, side at 84 deg / behind no');
        assert(!hitAt('w:sword', 2.6, 0) && hitAt('w:sword', 2.5, 0), 'sword reach = range + target radius');
        assert(hitAt('w:spear', 2.4, 0.3) && !hitAt('w:spear', 1.5, 1.0) && !hitAt('w:spear', 2.0, 0.8), 'spear: a long narrow line');
        assert(hitAt('w:dagger', 1.6, 0.2) && !hitAt('w:dagger', 1.2, 0.9), 'dagger: a quick narrow stab');
        assert(hitAt('w:bullwhip', 3.6, 0.2) && !hitAt('w:bullwhip', 3.6, 1.0), 'whip: a long lash line');
        assert(hitAt('w:axe', 1.6, 0.6) && !hitAt('w:axe', 1.0, 1.4), 'axe: a narrow overhead chop (36 deg)');
        assert(hitAt('w:maul', 1.8, 0.9) && hitAt('w:maul', 0.9, -0.9) && !hitAt('w:maul', -0.6, 0), 'hammer: a disc ahead');
        assert(hitAt('w:ballchain', 0.4, 1.9) && !hitAt('w:sword', 0.4, 1.9), 'flail sweeps wider than a sword');
        assert(hitAt('w:sword', 0.3, 0.55), 'bodies touching: any weapon connects in the front half');
        assert(!hitAt('w:sword', 1.5, 0, 2.6) && hitAt('w:sword', 1.5, 0, 0.9) && hitAt('w:sword', 1.5, 0, 0.9, 1.0), '3D-ready: a goblin 2.6 m up is out of reach, a jump (0.9 m) or a crate under the attacker is not');
        assert(pr('w:sword').cleave === 2 && pr('w:mace').cleave === 1, 'sweeps cleave, chops do not');
      }],
      ['timing: the damage moment is the clip contact frame (first person and third person use these numbers)', () => {
        for (const k of ['w:sword', 'w:dagger', 'w:maul', 'w:spear', 'w:bow', 'w:twinfangs', null]) { const t = C4.timing(G, k, G.combat(k).cd); assert(t.contact > 80 && t.contact < t.dur && t.end <= t.dur + 1 && t.dur <= G.combat(k).cd * 0.85 + 1, k + ' ' + JSON.stringify(t)); }
        assert(C4.timing(G, 'w:maul', 1300).contact > C4.timing(G, 'w:dagger', 450).contact * 2, 'heavy weapons telegraph longer');
      }],
      ['projectiles: swept capsule test (no tunnelling at 60 m/s), ballistic aim, guard hook', () => {
        assert(C4.projHit(-1, 1, 0, 1, 1, 0, 0.05, 0, 0, 0, r1, h1) >= 0, 'a 2 m step through the capsule hits');
        assert(C4.projHit(-1, 1.9, 0, 1, 1.9, 0, 0.05, 0, 0, 0, r1, h1) < 0 && C4.projHit(-1, 0.5, 0.5, 1, 0.5, 0.5, 0.05, 0, 0, 0, r1, h1) < 0, 'over the head / beside him misses');
        const v = 42, g = 7, pt = C4.aimPitch(10, -0.5, v, g), tt = 10 / (v * Math.cos(pt)), y = v * Math.sin(pt) * tt - 0.5 * g * tt * tt; assert(Math.abs(y + 0.5) < 0.02, 'aimPitch lands on target: ' + y);
        const gd = { at: 1000, until: 2000, parry: 150, mul: 0.4 };
        assert(C4.guard(gd, 1100, 0, 0, 0, 0, -2).parry && C4.guard(gd, 1500, 0, 0, 0, 0, -2).block && !C4.guard(gd, 1500, 0, 0, 0, 0, 2) && !C4.guard(gd, 2500, 0, 0, 0, 0, -2), 'parry early, block later, nothing from behind or after');
      }],
      ['obstacles: no hit through a closed door, through a crate, or with an arrow at a wall', async () => {
        const [a, b] = await group(srv, 2, 10); await give(a, 'w:sword');
        const [cx, cz] = W.rc(0), wx = cx + W.roomW(0) / 2;
        await put(a, wx - 0.7, cz, FACE_E); await put(b, wx + 0.7, cz); eq(W.roomKeyOf(wx + 0.7, cz), '1');
        eq(hits(await swing(a)), [], 'hit through the closed door between room 0 and 1');
        const pr0 = W.propsAt(cx, cz, a.state.layout).find(p => W.roomKeyOf(p.x, p.z) === '0' && p.r < 0.7 && !W.inProp(p.x - p.r - 0.6, p.z, 0.3, a.state.layout) && !W.inProp(p.x + p.r + 0.6, p.z, 0.3, a.state.layout) && W.segBlocked(p.x - p.r - 0.6, p.z, p.x + p.r + 0.6, p.z, a.state.layout, 0, 0.9, 0.9));   // a prop taller than chest height (CLIMB: a blow over a low top is fine)
        if (pr0) { await sleep(700); await put(a, pr0.x - pr0.r - 0.6, pr0.z, FACE_E); await put(b, pr0.x + pr0.r + 0.6, pr0.z); eq(hits(await swing(a)), [], 'hit through a ' + pr0.k); }
        await give(a, 'w:bow'); await put(a, wx - 5, cz + 3, FACE_E); await put(b, wx + 3, cz + 3); await sleep(800);
        const ms = await swing(a); eq(hits(ms), [], 'arrow through the wall'); assert(ms.some(m => m.proj) && ms.some(m => m.projEnd && !m.projEnd.hit), 'a real projectile flew and ended');
        await a.close(); await b.close();
      }],
      ['a sword sweep hits two goblins once each (no double damage), a mace only the nearest; heavy blows stagger and push', async () => {
        const [a, b, c] = await group(srv3, 3, 20); await give(a, 'w:sword');
        const [cx, cz] = W.rc(0), y0 = cz - 3;
        await put(a, cx - 1, y0, FACE_E); await put(b, cx + 0.3, y0 - 0.5); await put(c, cx + 0.5, y0 + 0.6);
        let h = hits(await swing(a)); eq(h.map(x => x.to).sort(), [b.state.you, c.state.you].sort(), 'both in the sweep'); eq(new Set(h.map(x => x.to)).size, h.length, 'one hit per target per swing');
        assert(h.some(x => x.dmg === G.combat('w:sword').dmg) && h.some(x => x.dmg < G.combat('w:sword').dmg), 'the second goblin takes the cleave share');
        await sleep(700); await give(a, 'w:mace'); h = hits(await swing(a)); eq(h.length, 1, 'a mace chop hits one goblin');
        await sleep(800); await give(a, 'w:maul'); await put(c, cx + 4, y0 + 3); await sleep(100);
        h = hits(await swing(a)); eq(h.length, 1); assert(h[0].st > 0 && h[0].kb, 'a maul blow staggers and pushes: ' + JSON.stringify(h[0]));
        const k = b.msgs.length; b.send({ atk: 1 }); await sleep(120); assert(!b.msgs.slice(k).some(m => m.swing === b.state.you), 'a staggered goblin cannot swing');
        for (const x of [a, b, c]) await x.close();
      }],
    ]);
    // duels under latency (real server, injected link delay; see tools/duelsim.js)
    const sim = require('../tools/duelsim.js'), t0 = Date.now(), r = await sim.simulate({ swings: 12, scen: ['0', '100', '200', 'a200v20'] });
    console.log('         duels: ' + Object.entries(r).map(([k, v]) => k + ' reg ' + v.regPct + '% phantom ' + v.phantomPct + '% (' + v.looks + '/' + v.n + ')').join(', ') + '  (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    fail += await L.run('combat4', [['latency: blows that look like hits at the contact frame register at 0 / 100 / 200 ms and with ping asymmetry (loose bounds: machine load)', () => {
      for (const [k, v] of Object.entries(r)) { assert(v.looks >= 3, k + ': too few hit-looking swings ' + v.looks); assert(v.regPct >= 75, k + ': registration ' + v.regPct + '%'); assert(v.phantomPct <= 40, k + ': phantom hits ' + v.phantomPct + '%'); }
    }]]);
  } catch (e) { console.log('  FAIL  combat4 setup: ' + (e.stack || e.message)); }
  srv.stop(); srv3.stop(); process.exit(fail ? 1 : 0);
})();

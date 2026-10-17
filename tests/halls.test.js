// @timeout 150
// halls (docs/reports/halls-fill.md): the plan of the 16 plain halls (themes, spots, home halls), the pure loot rolls and caps, the per-match events, and a live server check:
// search a container (hold), cooldown, per-round cap, starter cache once per goblin, restock, moving cancels, fonts, whetstone, notice board.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), H = require('../halls.js'), G = require('../items.js');
const seeded = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

(async () => {
  let fail = await L.run('halls', [
    ['plan: 16 halls with a theme; every hall has a container; home halls have exactly one starter cache and one notice board, fighting halls have neither', () => {
      eq(W.HALL_CELLS.length, 16); const themes = {};
      for (const i of W.HALL_CELLS) {
        const sp = W.hallSpots(i), pcs = W.hallPieces(i); themes[W.HALL_THEME[i]] = (themes[W.HALL_THEME[i]] || 0) + 1;
        assert(sp.some(s => s.role === 'cont'), 'hall ' + i + ' has no container'); assert(pcs.length >= 3 && pcs.length <= 8, 'hall ' + i + ' pieces ' + pcs.length);
        eq(sp.filter(s => s.kind === 'cache').length, W.hallIsHome(i) ? 1 : 0, 'starter cache in hall ' + i); eq(sp.filter(s => s.kind === 'board').length, W.hallIsHome(i) ? 1 : 0, 'notice board in hall ' + i);
        assert(sp.length <= 4, 'too many spots in ' + i);
      }
      eq(Object.keys(themes).length, 8, '8 themes'); for (const t in themes) eq(themes[t], 2, t + ' appears twice (180-degree pair)');
      for (const i of W.HALL_CELLS) eq(W.HALL_THEME[i], W.HALL_THEME[24 - i], 'rotation pair ' + i);
      eq(W.HALL_CELLS.filter(W.hallIsHome).length, 8);
      const ids = W.allHallSpots().map(s => s.id); eq(new Set(ids).size, ids.length, 'spot ids are unique');
    }],
    ['plan: pieces and stand points lie inside the room, never inside another prop or a keep-clear zone, and the spots are in reach of their stand point', () => {
      for (const i of W.HALL_CELLS) {
        const [cx, cz] = W.rc(i), hw = W.roomW(i) / 2 - W.T / 2, hd = W.roomD(i) / 2 - W.T / 2, solids = W.solidsOf(String(i), '');
        for (const s of W.hallSpots(i)) {
          assert(Math.abs(s.sx - cx) < hw && Math.abs(s.sz - cz) < hd, 'stand point of ' + s.id + ' inside the room');
          assert(!W.inProp(s.sx, s.sz, 0.33, null), 'stand point of ' + s.id + ' is free of props');
          assert(Math.hypot(s.sx - s.x, s.sz - s.z) <= s.r + 1.4, 'stand point of ' + s.id + ' is within reach of the spot');
        }
        const isHall = p => typeof p.piece === 'string';
        for (const p of solids) assert(Math.abs(p.x - cx) <= hw + 0.01 && Math.abs(p.z - cz) <= hd + 0.01 || !isHall(p), 'prop ' + p.k + ' in hall ' + i + ' inside the room');
        const hall = solids.filter(isHall); assert(hall.length >= 3, 'hall ' + i + ' has furniture'); for (const p of hall) for (const q of solids) if (p !== q) assert(Math.hypot(p.x - q.x, p.z - q.z) >= Math.min(p.r, q.r) * 0.9 || p.h === q.h, 'hall prop overlaps another prop in ' + i);
      }
    }],
    ['plan: deterministic, and the door fronts of every hall stay reachable (flood fill over the footprints)', () => {
      for (const i of W.HALL_CELLS) {
        const a = JSON.stringify(W.hallPieces(i)); eq(JSON.stringify(W.hallPieces(i)), a);
        const [cx, cz] = W.rc(i), hw = W.roomW(i) / 2 - 0.9, step = 0.5, n = Math.round(2 * hw / step) + 1, ok = (x, z) => !W.inProp(x, z, 0.33, null), seen = new Set(), key = (a2, b) => a2 + ',' + b;
        const gx = a2 => cx - hw + a2 * step, gz = b => cz - hw + b * step; let start = null;
        for (let a2 = 0; a2 < n && !start; a2++) for (let b = 0; b < n; b++) if (ok(gx(a2), gz(b))) { start = [a2, b]; break; }
        const q = [start]; seen.add(key(...start)); for (let k = 0; k < q.length; k++) for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a2 = q[k][0] + da, b = q[k][1] + db; if (a2 < 0 || b < 0 || a2 >= n || b >= n || seen.has(key(a2, b)) || !ok(gx(a2), gz(b))) continue; seen.add(key(a2, b)); q.push([a2, b]); }
        for (const [dx, dz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const x = cx + dx * hw, z = cz + dz * hw, a2 = Math.round((x - (cx - hw)) / step), b = Math.round((z - (cz - hw)) / step); assert(seen.has(key(a2, b)), 'hall ' + i + ': the wall middle ' + dx + ',' + dz + ' is reachable'); }
        for (const s of W.hallSpots(i)) { const fa = Math.floor((s.sx - (cx - hw)) / step), fb = Math.floor((s.sz - (cz - hw)) / step); assert([[0, 0], [1, 0], [0, 1], [1, 1]].some(([da, db]) => seen.has(key(fa + da, fb + db))) || Math.abs(s.sx - cx) > hw || Math.abs(s.sz - cz) > hw, 'spot ' + s.id + ' is reachable'); }
      }
    }],
    ['loot: profiles roll what they promise (gold range, parts, items) and the starter cache is the same every time', () => {
      const rnd = seeded(11), N = 4000;
      for (const kind of ['locker', 'rack', 'larder', 'tomes', 'cashbox', 'parts', 'sunk', 'offering']) {
        let gold = 0, weapons = 0, empty = 0;
        for (let n = 0; n < N; n++) { const r = H.rollLoot(kind, rnd, G); assert(r.gold >= 0 && r.gold <= 30, kind + ' gold ' + r.gold); gold += r.gold; for (const k of r.items) { assert(G.ITEMS[k], 'known item ' + k); if (G.ITEMS[k].type === 'weapon' || G.ITEMS[k].type === 'armor') weapons++; } for (const k in r.parts) assert(H.BASIC.includes(k)); if (!r.gold && !r.items.length && !H.partsN(r.parts)) empty++; }
        assert(gold / N < 20, kind + ' averages ' + gold / N + ' gold per search'); eq(empty, 0, kind + ' never yields nothing');
        if (kind === 'rack') assert(weapons / N > 0.1 && weapons / N < 0.3, 'racks hand out a weapon or armour now and then: ' + weapons / N); else assert(weapons / N < 0.07, kind + ' rarely: ' + weapons / N);
      }
      for (let n = 0; n < 50; n++) { const r = H.rollLoot('cache', rnd, G); assert(r.gold >= 20 && r.gold <= 30 && H.partsN(r.parts) === 3 && r.items.length === 1, 'cache is a fixed kind of reward'); }
    }],
    ['caps: per round, gold, parts and items per match; yield per minute stays far below a tree room', () => {
      const rnd = seeded(5); let L1 = null; const got = { gold: 0, parts: 0, items: 0 }; let rounds = 0;
      for (let round = 1; round <= 7; round++) for (let s = 0; s < 6; s++) {
        if (!H.canSearch(L1, round)) { L1 = L1 || null; continue; }
        const r = H.applyCaps(L1 = H.ledger(L1, round), round, H.rollLoot(['rack', 'cashbox', 'parts', 'locker'][s % 4], rnd, G)); got.gold += r.gold; got.parts += H.partsN(r.parts); got.items += r.items.length;
        assert(L1.searches <= H.CFG.PER_ROUND, 'per-round cap');
      }
      assert(got.gold <= H.CFG.GOLD_MATCH && got.parts <= H.CFG.PARTS_MATCH && got.items <= H.CFG.ITEMS_MATCH, JSON.stringify(got) + ' within the match caps'); rounds = 7;
      assert(got.gold / (rounds * 2) <= 80, 'at most ' + Math.round(got.gold / (rounds * 2)) + ' gold per minute even for a goblin who searches every round');
      const a = H.ledger(null, 1); a.searches = 3; assert(!H.canSearch(a, 1), 'cap in the same round'); assert(H.canSearch(a, 2), 'a new round resets the search count');
      const b = H.ledger(null, 1); b.gold = H.CFG.GOLD_MATCH; b.parts = H.CFG.PARTS_MATCH; b.items = H.CFG.ITEMS_MATCH; assert(!H.canSearch(b, 1), 'match caps spent');
      const t = H.applyCaps(H.ledger({ round: 1, searches: 0, gold: 150, parts: 0, items: 0 }, 1), 1, { gold: 25, parts: {}, items: [] }); eq(t.gold, 10, 'gold is trimmed to the cap that is left');
    }],
    ['events: at most 3 guarded halls (fighting halls only, weak kinds), dry containers never the starter cache; rolls differ between matches', () => {
      const fight = W.HALL_CELLS.filter(c => !W.hallIsHome(c)), spots = W.allHallSpots(), seen = new Set(), seenDry = new Set();
      for (let n = 0; n < 300; n++) {
        const e = H.rollEvents(seeded(n + 1), fight, spots), g = Object.keys(e.guard).map(Number); eq(g.length, H.CFG.GUARDS); for (const c of g) { assert(fight.includes(c), 'guard in a fighting hall'); assert(H.CFG.GUARD_KINDS.includes(e.guard[c])); }
        for (const id in e.dry) { const s = spots.find(x => x.id === id); assert(s.role === 'cont' && s.kind !== 'cache', 'dry ' + id); assert(e.dry[id] >= H.CFG.DRY_MS[0] && e.dry[id] <= H.CFG.DRY_MS[1]); }
        seen.add(g.sort().join()); seenDry.add(Object.keys(e.dry).sort().join());
      }
      assert(seen.size > 20 && seenDry.size > 20, 'different halls are guarded in different matches: ' + seen.size);
    }],
  ]);
  if (fail) process.exit(1);

  // ---- live ----
  const srv = await L.startServer({ GK_HALL_RESTOCK_MS: '1800', GK_HALL_DRY: '0', GK_HALL_GUARDS: '0' }); let bad = 1;
  try {
    const stand = async (c, s) => { c.send({ tp: [s.sx, s.sz] }); await sleep(150); };
    const cont = (cell, kind) => W.hallSpots(cell).find(s => s.kind === kind);
    bad = await L.run('halls-live', [
      ['search a container: hold, the loot arrives after the search time and not before, gold or parts are added; the container is then empty and tells everybody', async () => {
        const c = await connect(srv.port, 'goblin=2'), sp = W.hallSpots(0).find(s => s.role === 'cont');
        await c.until(x => x.state.hallS, 3000, 'hall state at the start'); eq(c.state.hallFull, 1);
        const g0 = c.state.gold, p0 = JSON.stringify(c.state.parts); await stand(c, sp);
        c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallMe, 2000, 'search started'); eq(c.state.hallMe.id, sp.id); eq(c.state.hallMe.ms, H.CFG.SEARCH_MS);
        await sleep(1200); eq(c.state.hallFx, undefined, 'nothing yet after 1.2 s');
        await c.until(x => x.state.hallFx, 3500, 'loot'); eq(c.state.hallFx.k, 'loot'); eq(c.state.hallFx.id, sp.id);
        const fx = c.state.hallFx; assert(fx.gold > 0 || H.partsN(fx.parts) > 0 || fx.items.length > 0, 'something came out');
        await sleep(150); if (fx.gold) assert(c.state.gold >= g0 + fx.gold, 'gold added'); if (H.partsN(fx.parts)) assert(JSON.stringify(c.state.parts) !== p0, 'parts added');
        await c.until(x => x.state.hallS && x.state.hallS[sp.id] > 0, 1500, 'the container reports its restock'); eq(c.state.hallMe, null);
        delete c.state.hallFail; c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallFail, 1500, 'refused'); eq(c.state.hallFail, 'cool', 'empty until it restocks');
        await c.close();
      }],
      ['restock: the same container works again after the (test) restock time, and tells everybody it is ready', async () => {
        const c = await connect(srv.port, 'goblin=2'), sp = W.hallSpots(24).find(s => s.role === 'cont'); await stand(c, sp);
        c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallFx, 4000, 'first search'); await c.until(x => x.state.hallS && x.state.hallS[sp.id] > 0, 1500, 'empty');
        await c.until(x => x.state.hallS && x.state.hallS[sp.id] === 0, 4000, 'ready message'); delete c.state.hallFx; c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallFx, 4000, 'second search');
        await c.close();
      }],
      ['moving away, being hit, or being too far cancels; a search from the other side of the room is refused', async () => {
        const c = await connect(srv.port, 'goblin=2'), sp = W.hallSpots(4).find(s => s.role === 'cont'), far = W.hallSpots(4).find(s => s !== sp);
        const [cx, cz] = W.rc(4); c.send({ tp: [cx, cz + 6.5] }); await sleep(150); const tooFar = Math.hypot(cx - sp.x, cz + 6.5 - sp.z) > sp.r + 1.4; if (tooFar) { c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallFail, 1500, 'far'); eq(c.state.hallFail, 'far'); }
        await stand(c, sp); delete c.state.hallFx; c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallMe, 1500, 'started'); await sleep(500); c.send({ tp: [sp.sx + 2.5, sp.sz] }); await c.until(x => x.state.hallMe === null, 1500, 'cancelled by moving'); await sleep(2800); eq(c.state.hallFx, undefined, 'a cancelled search gives nothing');
        await stand(c, sp); c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallMe, 1500, 'started again'); await sleep(400); c.send({ hp: 5 }); await c.until(x => x.state.hallMe === null, 1500, 'cancelled by a hit'); void far;
        await stand(c, sp); delete c.state.hallMe; c.send({ hall: { s: sp.id, v: 'use' } }); await c.until(x => x.state.hallMe, 1500, 'started a third time'); c.send({ hall: { s: sp.id, v: 'stop' } }); await c.until(x => x.state.hallMe === null, 1500, 'stop key');
        await c.close();
      }],
      ['the starter cache of the hall behind your home: once per goblin, quick, always food for the first minutes; the notice board lists the kills', async () => {
        const c = await connect(srv.port, 'goblin=2'), cell = c.state.matchStart.spawn.box, cache = cont(cell, 'cache'), board = cont(cell, 'board'); assert(cache && board, 'cache and board in the hall behind my home');
        const g0 = c.state.gold; await stand(c, cache); c.send({ hall: { s: cache.id, v: 'use' } }); await c.until(x => x.state.hallMe, 1500, 'started'); eq(c.state.hallMe.ms, H.CFG.CACHE_MS);
        await c.until(x => x.state.hallFx && x.state.hallFx.k === 'loot', 3000, 'cache loot'); const fx = c.state.hallFx; assert(fx.gold >= 20 && H.partsN(fx.parts) === 3 && fx.items.length === 1, 'starter loot ' + JSON.stringify(fx)); await sleep(150); assert(c.state.gold >= g0 + 20);
        delete c.state.hallFail; c.send({ hall: { s: cache.id, v: 'use' } }); await c.until(x => x.state.hallFail, 1500, 'taken'); eq(c.state.hallFail, 'taken');
        await stand(c, board); delete c.state.hallFx; c.send({ hall: { s: board.id, v: 'use' } }); await c.until(x => x.state.hallFx && x.state.hallFx.k === 'board', 1500, 'board'); assert(c.state.hallFx.rows.length >= 1 && c.state.hallFx.rows[0].length === 2);
        await c.close();
      }],
      ['per-round cap: the fourth search in one round is refused ("cap")', async () => {
        const c = await connect(srv.port, 'goblin=2'); const conts = [0, 4, 20, 24, 2].map(i => W.hallSpots(i).find(s => s.role === 'cont')); let done = 0;
        for (const sp of conts) {
          await stand(c, sp); delete c.state.hallFx; delete c.state.hallFail; c.send({ hall: { s: sp.id, v: 'use' } });
          if (done < H.CFG.PER_ROUND) { await c.until(x => x.state.hallFx, 4000, 'search ' + (done + 1)); done++; } else { await c.until(x => x.state.hallFail, 1500, 'cap'); eq(c.state.hallFail, 'cap'); break; }
        }
        eq(done, H.CFG.PER_ROUND); await c.close();
      }],
      ['stations: the font heals once and then recharges ("full" at full health), the whetstone arms a +12% edge once a minute', async () => {
        const c = await connect(srv.port, 'goblin=2'), font = W.hallSpots(10).find(s => s.kind === 'font'), whet = W.hallSpots(0).find(s => s.kind === 'whet'); assert(font && whet);
        await stand(c, font); delete c.state.hallFail; c.send({ hall: { s: font.id, v: 'use' } }); await c.until(x => x.state.hallFail, 1500, 'full'); eq(c.state.hallFail, 'full', 'no heal at full health');
        c.send({ hp: 1 }); await sleep(150); delete c.state.hallFx; c.send({ hall: { s: font.id, v: 'use' } }); await c.until(x => x.state.hallFx && x.state.hallFx.k === 'heal', 4000, 'heal'); eq(c.state.hallFx.hp, H.CFG.FONT_HEAL);
        c.send({ hp: 1 }); await sleep(150); delete c.state.hallFail; c.send({ hall: { s: font.id, v: 'use' } }); await c.until(x => x.state.hallFail, 1500, 'cool'); eq(c.state.hallFail, 'cool', 'the font recharges');
        await stand(c, whet); delete c.state.hallFx; c.send({ hall: { s: whet.id, v: 'use' } }); await c.until(x => x.state.hallFx && x.state.hallFx.k === 'whet', 4000, 'whet'); eq(c.state.hallFx.ms, H.CFG.WHET_MS);
        delete c.state.hallFail; c.send({ hall: { s: whet.id, v: 'use' } }); await sleep(200); await c.until(x => x.state.hallFail, 1500, 'cool again'); eq(c.state.hallFail, 'cool');
        await c.close();
      }],
      ['junk messages are ignored (unknown spot, wrong types) and the server stays up', async () => {
        const c = await connect(srv.port, 'goblin=2'); for (const m of [{ hall: 5 }, { hall: null }, { hall: { s: 'zz', v: 'use' } }, { hall: { s: { a: 1 }, v: 'use' } }, { hall: { s: '0:0', v: 'dance' } }, { hall: { s: 'x'.repeat(100), v: 'use' } }]) c.send(m);
        await sleep(300); assert(srv.alive(), 'server alive'); await c.close();
      }],
    ]);
  } finally { srv.stop(); }
  if (bad) process.exit(1);
  const srv2 = await L.startServer(); let bad2 = 1;   // events on (the default): guards and empty containers
  try {
    bad2 = await L.run('halls-events', [
      ['a match rolls 3 guarded fighting halls and some containers that start empty; the empty ones are reported at the start', async () => {
        const c = await connect(srv2.port, 'goblin=2'); await c.until(x => x.state.hallS, 3000, 'hall state'); const first = c.msgs.find(d => d.hallFull), dry0 = first.hallS;
        c.send({ hall: { dbg: 1 } }); await c.until(x => x.state.hallEv, 1500, 'events'); const ev = c.state.hallEv, fight = W.HALL_CELLS.filter(i => !W.hallIsHome(i));
        eq(Object.keys(ev.guard).length, H.CFG.GUARDS); for (const k in ev.guard) assert(fight.includes(+k), 'guard cell ' + k + ' is a fighting hall');
        for (const id in ev.dry) assert(dry0[id] > 0, 'dry container ' + id + ' is reported as empty at the start'); for (const id in dry0) assert(ev.dry[id] !== undefined, 'only dry containers start empty: ' + id);
        await c.close();
      }],
      ['a goblin walking into a guarded hall meets its enemy (once), and its loot drops when it dies', async () => {
        const c = await connect(srv2.port, 'goblin=2'); c.send({ hall: { dbg: 1 } }); await c.until(x => x.state.hallEv, 1500, 'events'); const cell = +Object.keys(c.state.hallEv.guard)[0], kind = c.state.hallEv.guard[cell];
        const n0 = c.msgs.length; c.send({ tp: W.rc(cell) }); await sleep(600);
        const seen = c.msgs.slice(n0).some(d => JSON.stringify(d).includes('"npc":"' + kind + '"')); assert(seen, 'the ' + kind + ' appeared in hall ' + cell);
        c.send({ tp: W.rc(cell === 0 ? 1 : 0) }); await sleep(200); const n1 = c.msgs.length; c.send({ tp: W.rc(cell) }); await sleep(600); assert(!c.msgs.slice(n1).some(d => d.matchStart), 'no second spawn crashes anything'); assert(srv2.alive());
        await c.close();
      }],
    ]);
  } finally { srv2.stop(); }
  if (bad2) process.exit(1);
  const srv3 = await L.startServer({ GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_BOT_GRACE_MS: '0', GK_HALL_DRY: '0', GK_HALL_GUARDS: '0' }); let bad3 = 1;   // a match with a bot
  try {
    bad3 = await L.run('halls-bots', [
      ['bots use the halls: a bot dropped next to a container searches it by itself, through the same rules (the restock message arrives)', async () => {
        const c = await connect(srv3.port, 'goblin=2&wins=0'), sp = W.hallSpots(20).find(x => x.role === 'cont'); c.send({ botlab: { near: [sp.sx + 1.5, sp.sz], hallGo: 1 } });
        const t0 = Date.now(); let got = false; while (Date.now() - t0 < 30000 && !got) { await sleep(300); for (const d of c.msgs) if (d.hallS && Object.keys(d.hallS).some(id => id.startsWith('20:') && d.hallS[id] > 0)) got = true; }
        assert(got, 'no bot searched a container in hall 20 within 30 s'); await c.close();
      }],
    ]);
  } finally { srv3.stop(); }
  process.exit(bad3 ? 1 : 0);
})();

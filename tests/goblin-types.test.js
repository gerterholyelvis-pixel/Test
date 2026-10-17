// GOBTYPES: the 12 starting goblins (items.js GOBLINS): roll odds over a large N, table consistency, perk maths, a duel balance sim, and the server applying type stats.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, G = require('../items.js'), fs = require('fs'), path = require('path');
const N_TYPES = 12;

// ---- duel balance sim: two goblins with their START gear, perks and speed fight in one room. Ranged starters (bows, staves) get free shots while the other closes in,
// backstab lands on a share of the blows, reach gives a free first swing, a quarter of all swings miss (players and bots both whiff). Returns 1 when a wins.
const BOLT = { dmg: 9, cd: 1000 }, MISS = 0.25;
function kit(g) {
  const s = G.START[g], c = G.combat(s.weapon), w = G.ITEMS[s.weapon], bolt = w && (w.family === 'staff' || w.family === 'scepter');
  const max = G.goblinHp(g, G.ITEMS[s.armor].health), spd = G.SPEED[g] * G.armorSpeed(s.armor);
  return { goblin: g, max, dmg: bolt ? BOLT.dmg : c.dmg, cd: bolt ? BOLT.cd : c.cd, ranged: bolt || c.ranged, spd, reach: G.goblinReach(g), regen: G.goblinRegen(g) };
}
function duel(A, B, rnd) {
  const a = { ...A, hp: A.max, next: 0, hurt: -1e9, rg: 0 }, b = { ...B, hp: B.max, next: 0, hurt: -1e9, rg: 0 };
  for (const [x, y] of [[a, b], [b, a]]) {   // opening: a ranged goblin shoots while a melee one closes 4 m (longer when it is also the faster one); longer reach swings first
    x.next = Math.round(rnd() * 300);
    if (x.ranged && !y.ranged) x.next -= Math.round(4 / (4.6 * y.spd) * 1000 * (x.spd > y.spd ? 1.3 : 1));
    else if (x.reach > y.reach) x.next -= x.cd;
  }
  for (let t = Math.min(a.next, b.next); t < 120000; t += 50) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (t >= x.next && ((x.next = t + x.cd), rnd() >= MISS)) {
        const r = G.goblinHit({ goblin: x.goblin, hp: x.hp, max: x.max }, { goblin: y.goblin }, x.dmg, { melee: !x.ranged || t >= 0, behind: rnd() < 0.2, rnd: rnd() });
        if (!r.dodged) { y.hp -= r.dmg; y.hurt = t; }
        if (y.hp <= 0) return x === a ? 1 : 0;
      }
      if (x.hp < x.max && t - x.hurt >= 6000 * x.regen.idle && t - x.rg >= 4000 * x.regen.every) { x.rg = t; x.hp = Math.min(x.max, x.hp + 1); }
    }
  }
  return a.hp / a.max > b.hp / b.max ? 1 : 0;
}
function balance(n = 400) {
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const K = G.GOBLINS.map((_, g) => kit(g)), M = K.map(() => K.map(() => 0));
  for (let i = 0; i < K.length; i++) for (let j = 0; j < K.length; j++) if (i !== j) { let w = 0; for (let k = 0; k < n; k++) w += duel(K[i], K[j], rnd); M[i][j] = w / n; }
  return { K, M, field: M.map((row, i) => row.reduce((s, v, j) => s + (i === j ? 0 : v), 0) / (K.length - 1)) };
}
module.exports = { balance };
if (require.main !== module) return;

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '1' }); let fail = 1;
  try {
    fail = await L.run('goblin-types', [
      ['table: 12 types, every per-type array covers them, odds add up to 100 with the common three at 20 each and the King rarest', async () => {
        eq(G.GOBLINS.length, N_TYPES); for (const k of ['START', 'KNOWLEDGE', 'SPEED']) eq(G[k].length, N_TYPES, k);
        const sum = G.GOBLINS.reduce((s, g) => s + g.odds, 0); assert(Math.abs(sum - 100) < 1e-9, 'odds sum ' + sum);
        eq(G.GOBLINS.slice(0, 3).map(g => g.odds), [20, 20, 20]);
        const rare = G.GOBLINS.slice(3).map(g => g.odds).sort((a, b) => b - a); assert(Math.abs(rare.reduce((s, v) => s + v, 0) - 40) < 1e-9, 'rare nine add to 40');
        for (let i = 1; i < rare.length; i++) { const q = rare[i] / rare[i - 1]; assert(q > 0.6 && q < 0.85, 'smooth taper: ' + rare); }
        assert(G.GOBLINS[4].odds === Math.min(...G.GOBLINS.map(g => g.odds)) && G.GOBLINS[4].odds === 1, 'the King stays the rarest at 1%');
        eq(G.GOBLINS.slice(0, 5).map(g => g.key), ['small', 'medium', 'big', 'wizard', 'king'], 'type ids 0-4 never move (saved tokens)');
        for (const [i, g] of G.GOBLINS.entries()) {
          assert(g.name && g.desc && g.perkName && g.perkText && g.desc.length < 90 && g.perkText.length < 80, 'texts of ' + i);
          assert(G.ITEMS[G.START[i].weapon] && G.ITEMS[G.START[i].weapon].type === 'weapon' && G.ITEMS[G.START[i].armor] && G.ITEMS[G.START[i].armor].type === 'armor', 'start gear of ' + g.key);
          assert(g.size >= 0.7 && g.size <= 1.35 && G.SPEED[i] >= 0.85 && G.SPEED[i] <= 1.15 && G.goblinHp(i, G.ITEMS[G.START[i].armor].health) > 20, 'sane stats of ' + g.key);
          assert(g.perk === null || G.GOB_PERKS[g.perk], 'perk of ' + g.key);
        }
        assert(new Set(G.GOBLINS.map(g => g.name)).size === N_TYPES && new Set(G.GOBLINS.slice(5).map(g => g.perk)).size === 7, 'distinct names and perks');
      }],
      ['roll: 1,000,000 rolls match the target odds (within 0.15 points, the rare ones within 12% of their own odds)', async () => {
        const N = 1e6, c = Array(N_TYPES).fill(0); for (let i = 0; i < N; i++) c[G.rollGoblin()]++;
        for (let i = 0; i < N_TYPES; i++) { const got = c[i] / N * 100, want = G.GOBLINS[i].odds; assert(Math.abs(got - want) < 0.15 && Math.abs(got - want) / want < 0.12, G.GOBLINS[i].key + ': ' + got.toFixed(3) + '% vs ' + want + '%'); }
        eq(G.rollGoblin(0), 0); eq(G.rollGoblin(0.9999999), N_TYPES - 1); eq(G.rollGoblin(0.599), 2); eq(G.rollGoblin(0.6), 3);
      }],
      ['perks: dodge only against melee, backstab from behind, rage below half, thick hide, NPCs have none', async () => {
        const hit = (a, t, d, ctx) => G.goblinHit(a, t, d, ctx);
        assert(hit({ goblin: 1 }, { goblin: 5 }, 10, { melee: true, rnd: 0.05 }).dodged, 'scout dodges a blow'); assert(!hit({ goblin: 1 }, { goblin: 5 }, 10, { melee: false, rnd: 0.05 }).dodged, 'not a bolt');
        assert(!hit({ goblin: 1 }, { goblin: 5 }, 10, { melee: true, rnd: 0.5 }).dodged, 'most blows land');
        eq(hit({ goblin: 6 }, { goblin: 1 }, 10, { behind: true }).dmg, 15); eq(hit({ goblin: 6 }, { goblin: 1 }, 10, { behind: false }).dmg, 10);
        eq(hit({ goblin: 9, hp: 20, max: 60 }, { goblin: 1 }, 20, {}).dmg, Math.round(20 * G.GOB_PERKS.rage.mult)); eq(hit({ goblin: 9, hp: 40, max: 60 }, { goblin: 1 }, 20, {}).dmg, 20);
        eq(hit({ goblin: 1 }, { goblin: 10 }, 20, {}).dmg, Math.round(20 * G.GOB_PERKS.thickhide.taken)); assert(hit({ goblin: 6 }, { goblin: 1 }, 10, { behind: true }).backstab, 'backstab cue');   // BALANCE-3: numbers from GOB_PERKS eq(hit({ goblin: 6, npc: 'troll' }, { goblin: 1 }, 10, { behind: true }).dmg, 10); eq(hit({ goblin: 1 }, { goblin: 10, npc: 'dumb' }, 20, {}).dmg, 20);
        eq(hit({ goblin: 1 }, { goblin: 1 }, 0.2, {}).dmg, 1, 'a hit always does at least 1');
        assert(G.hitRadius(11) > G.hitRadius(1) && G.hitRadius(0) < G.hitRadius(1), 'hit box follows size'); eq(G.goblinReach(11), 0.4);
        eq(G.goblinRegen(8), G.GOB_PERKS.mending); eq(G.goblinRegen(1), { idle: 1, every: 1 }); eq(G.goblinStart(7), G.GOB_PERKS.prospector); eq(G.goblinStart(0), null);
      }],
      ['balance sim (BALANCE-3, tools/balsim.js): all twelve types win 42-58% of their start-kit duels and 40-60% with even gear, and each loses to someone', async () => {
        const rows = require('../tools/balsim.js').goblinTable(60);   // the older in-file sim (balance() above) is kept for reference; balsim models kiting, bolts, bleed, thorns, the cap and the dash
        console.log('         duel win rates (start / even): ' + rows.map(r => r.key + ' ' + Math.round(r.start * 100) + '/' + Math.round(r.even * 100)).join(', '));
        for (const r of rows) {
          assert(r.start >= 0.42 && r.start <= 0.58, r.key + ' wins ' + Math.round(r.start * 100) + '% of start-kit duels');
          assert(r.even >= 0.4 && r.even <= 0.6, r.key + ' wins ' + Math.round(r.even * 100) + '% of even-gear duels');
          assert(r.worst < 0.45, r.key + ' has no counter');
        }
      }],
      ['client tables: game.js names / scales and menu odds come from the same table', async () => {
        const src = fs.readFileSync(path.join(L.ROOT, 'game.js'), 'utf8'), names = JSON.parse(src.match(/const NAMES = (\[[^\]]+\]);/)[1].replace(/'/g, '"')), scale = JSON.parse(src.match(/const SCALE = (\[[^\]]+\]);/)[1]);
        eq(names, G.GOBLINS.slice(0, 5).map(g => g.name)); eq(scale, G.GOBLINS.slice(0, 5).map(g => g.size));
        assert(/GOBLINS\.slice\(NAMES\.length\)/.test(src), 'game.js appends the newer types from items.js');
        assert(/GKITEMS\.GOBLINS/.test(fs.readFileSync(path.join(L.ROOT, 'menu.js'), 'utf8')), 'menu.js reads the odds from items.js');
      }],
      ['server: every type joins (debug ?goblin=) with its start gear, health bonus and perk extras', async () => {
        for (let g = 0; g < N_TYPES; g++) {
          const c = await connect(srv.port, 'goblin=' + g + '&wins=' + (100 + g)), s = c.state, me = s.players && s.players.find(p => p.id === s.you);
          eq(s.goblin, g, 'type'); eq([s.inv.weapon, s.inv.armor], [G.START[g].weapon, G.START[g].armor], 'start gear ' + g);
          eq(me.stats.maxHealth, G.goblinHp(g, G.ITEMS[G.START[g].armor].health), 'max health ' + g); eq(me.stats.knowledge, G.KNOWLEDGE[g], 'knowledge ' + g);
          const pk = G.goblinStart(g); eq(s.gold, G.START_GOLD + (pk ? pk.gold : 0), 'gold ' + g); if (pk) for (const k in pk.parts) eq(s.parts[k], pk.parts[k], 'part ' + k);
          await c.close();
        }
        const bad = await connect(srv.port, 'goblin=12&wins=500'); assert(bad.state.goblin >= 0 && bad.state.goblin < N_TYPES, 'an unknown type rolls a real one'); await bad.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  goblin-types setup: ' + (e.stack || e)); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

// bots6 (docs/reports/bots6.md): the pure BOTS6 helpers in botgoals.js. Skill levels, fight styles and spacing by weapon family, whiff punishing, flanking,
// kiting, weapon / armour / charm values, consumables at the right moment, target judgement, claim timing, danger checks, bomb dodges, chases given up,
// truces, sends and the sighting memory. No server: every case feeds plain objects.
const L = require('./lib.js'), { assert, eq } = L, BG = require('../botgoals.js'), G = require('../items.js');
const cb = k => G.combat(k), fam = k => G.ITEMS[k].family, sty = k => BG.styleOf(cb(k), fam(k));
const plan = o => BG.fightPlan(Object.assign({ style: 'brawler', d: 2, reach: 2.85, foeReach: 2.85, foeRanged: false, ready: 0, foeReady: 0, behind: false, wantFlank: true, useWindow: true, kite: true, waited: 0, rangeD: 6.5, orbitR: 1.5, hold: false }, o));
const use = o => BG.useNow(Object.assign({ hp: 100, max: 100, sudden: false, foes: 0, near: 99, hurtAgo: 10000, fleeing: false, pursued: false, foeRanged: false, atDoor: false, chase: false, cluster: 0, still: false, homeGuard: false,
  heal: 0, regen: false, smoke: false, bomb: false, trap: false, tonic: false, recall: false, roll: 0, items: 1 }, o));
const ta = o => BG.targetAdj(Object.assign({ claimant: false, leader: false, worn: false, hp: 1, truce: false, traitor: false, hitMe: false, third: 0.7 }, o));
const cn = o => BG.claimNow(Object.assign({ round: 3, sudden: false, sudRound: 5, hp: 1, foes: 0, onDais: false, mine: 0, top: 0, msLeft: 60000, aggr: 0.5, wardens: 0 }, o));
const dg = o => BG.danger(Object.assign({ send: null, home: false, hp: 1, wardens: 0, vault: false, claiming: false, alarm: false, heistRisk: 0, vented: false, sudden: false }, o));

(async () => {
  const fail = await L.run('bots6', [
    ['skill levels: one table, easy is slower and sloppier than normal, hard is sharper; mix deals easy, normal, hard in turn', () => {
      const E = BG.LEVELS.easy, N = BG.LEVELS.normal, H = BG.LEVELS.hard;
      eq([E.notice, N.notice, H.notice], [1200, 700, 450], 'notice delays (PLAN-fun feature 8)'); eq([E.miss, N.miss, H.miss], [0.45, 0.3, 0.15], 'deliberate misses'); eq([E.spoil, N.spoil, H.spoil], [0, 0.22, 0.3], 'sabotage share');
      for (const k of ['flank', 'window', 'kite', 'items', 'dodge', 'third', 'hear', 'mem', 'lead']) assert(E[k] < N[k] && N[k] < H[k], k + ' grows with the level');
      for (const k of ['aim', 'hesitate']) assert(E[k] > N[k] && N[k] > H[k], k + ' shrinks with the level');
      assert(E.react[0] > N.react[0] && N.react[0] > H.react[0], 'reaction');
      eq([0, 1, 2, 3].map(i => BG.lvlFor('mix', i)), ['easy', 'normal', 'hard', 'easy']); eq(BG.lvlFor('hard', 5), 'hard'); eq(BG.lvlFor('nonsense', 0), 'normal'); eq(BG.lvlOf('x'), N);
    }],
    ['fight styles by weapon family: wands and staves cast, bows kite, spears and whips poke, hammers wait, daggers flank, the rest brawl', () => {
      eq(sty('w:emberwand'), 'caster'); eq(sty('w:stormstaff'), 'caster'); eq(sty('w:bow'), 'archer'); eq(sty('w:crossbow'), 'archer'); eq(sty('w:sling'), 'archer');
      eq(sty('w:spear'), 'poke'); eq(sty('w:pike'), 'poke'); eq(sty('w:bullwhip'), 'poke'); eq(sty('w:glaive'), 'poke');
      eq(sty('w:warhammer'), 'heavy'); eq(sty('w:maul'), 'heavy'); eq(sty('w:ogreclub'), 'heavy'); eq(sty('w:ballchain'), 'heavy');
      eq(sty('w:dagger'), 'quick'); eq(sty('w:twinfangs'), 'quick'); eq(sty('w:shiv'), 'quick');
      eq(sty('w:sword'), 'brawler'); eq(sty('w:mace'), 'brawler'); eq(sty('w:club'), 'brawler'); eq(BG.styleOf(G.combat(null), null), 'brawler');
    }],
    ['spear: pokes from the edge of its reach, outside a shorter foe reach; steps out while reloading inside his reach', () => {
      const p = plan({ style: 'poke', reach: 3.4, foeReach: 2.5, d: 3.1 });
      assert(p.R > 2.5 + 0.3 && p.R < 3.4, 'stands between his reach and mine: ' + p.R); assert(p.swing, 'swings at 3.1 m with a 3.4 m reach');
      assert(!plan({ style: 'poke', reach: 3.4, d: 3.6 }).swing, 'no swing out of reach');
      assert(plan({ style: 'poke', reach: 3.4, foeReach: 2.5, d: 2.3, ready: 400, foeReady: 0 }).back, 'reloading inside his reach: back');
    }],
    ['hammer: steps out of his reach while reloading, moves to the edge of its own reach when ready, commits right after he swings', () => {
      const reload = plan({ style: 'heavy', ready: 500, foeReach: 2.85, d: 2.0 }); assert(reload.back && reload.sprint && reload.R >= 2.85 + 0.3 && !reload.swing, 'reload: out ' + JSON.stringify(reload));
      const outside = plan({ style: 'heavy', ready: 500, foeReach: 2.85, d: 3.2 }); assert(!outside.back && outside.R > 2.85, 'already outside: wait there');
      const edge = plan({ style: 'heavy', ready: 0, foeReady: 0, d: 3.2 }); assert(edge.R < 2.85 && !edge.swing, 'ready: to the edge of the reach');
      assert(plan({ style: 'heavy', ready: 0, foeReady: 0, d: 2.7 }).swing, 'and swing the moment he is in it');
      const go = plan({ style: 'heavy', ready: 0, foeReady: 500, d: 3.2 }); assert(go.R <= 1.6 && go.sprint && !go.swing, 'he just swung: close in');
      assert(plan({ style: 'heavy', ready: 0, useWindow: false, d: 2.0 }).swing, 'a hammer without the spacing habit just swings');
      const sh = plan({ style: 'heavy', ready: 300, foeRanged: true, d: 4 }); assert(sh.R <= 1.2 && sh.sprint && !sh.back, 'against a shooter: get on him');
    }],
    ['dagger: a Sneak circles to the back (flank) and stabs whenever in reach; without the flank roll it just stabs', () => {
      const f = plan({ style: 'quick', d: 1.8, behind: false }); assert(f.flank && f.lat === 1 && f.swing && f.R <= 1.4, 'circling: ' + JSON.stringify(f));
      const bh = plan({ style: 'quick', d: 1.6, behind: true }); assert(!bh.flank && bh.swing, 'behind: stab');
      assert(plan({ style: 'quick', d: 1.8, wantFlank: false }).swing && !plan({ style: 'quick', d: 1.8, wantFlank: false }).flank, 'no flank roll');
      assert(plan({ style: 'quick', d: 2.0, ready: 200, foeReady: 0 }).back, 'reloading in his reach: out');
    }],
    ['bow and wand: keep range, back off a melee foe closing in (kite), shoot when ready; no kiting from another shooter', () => {
      const k = plan({ style: 'archer', d: 2.5, reach: 12, foeReach: 2.85 }); assert(k.back && k.swing && k.R >= 5, 'kite and shoot: ' + JSON.stringify(k));
      assert(plan({ style: 'archer', d: 2.0, reach: 12, foeReach: 2.85 }).sprint, 'very close: sprint away');
      assert(!plan({ style: 'caster', d: 2.5, reach: 12, foeRanged: true, foeReach: 12 }).back, 'a shooter: no point backing off');
      assert(!plan({ style: 'archer', d: 2.5, reach: 12, kite: false }).back, 'no kite roll');
      assert(!plan({ style: 'archer', d: 5, reach: 12, ready: 300 }).swing, 'reloading');
    }],
    ['brawler: swings when in reach, backs out of his reach while reloading if he can swing, stays close while he reloads too; the FAIR hold stands off', () => {
      assert(plan({ style: 'brawler', ready: 0, foeReady: 0, d: 2.6 }).swing, 'in reach and ready');
      assert(plan({ style: 'brawler', ready: 300, foeReady: 0, d: 2.0 }).back, 'reloading in his reach: back out');
      const both = plan({ style: 'brawler', ready: 300, foeReady: 300, d: 2.0 }); assert(!both.back && both.R < 2.85, 'both reloading: stay in range');
      eq(plan({ style: 'brawler', ready: 0, useWindow: false, d: 2.0, orbitR: 1.5 }).R, 1.5, 'old-style orbit without the spacing habit');
      const sp = plan({ style: 'poke', ready: 0, reach: 3.45, foeReach: 2.5, d: 3.0 }); assert(sp.R > 2.5 && sp.swing, 'a pike outreaches a sword');
      eq(plan({ hold: true, holdR: 3.6 }).R, 3.6);
    }],
    ['behind test matches server.js hitTarget, the behind point is behind, the flank side turns toward it', () => {
      const yaw = 0;   // facing -z
      assert(BG.isBehind(0, 2, 0, 0, yaw), 'at +z is behind a goblin facing -z'); assert(!BG.isBehind(0, -2, 0, 0, yaw), 'in front'); assert(!BG.isBehind(2, 0, 0, 0, yaw), 'beside');
      const [bx, bz] = BG.behindPoint(0, 0, yaw, 1.2); assert(Math.abs(bx) < 1e-9 && Math.abs(bz - 1.2) < 1e-9, 'behind point');
      // bot at (2, 0) east of the target; lateral (+1) = (-rz, rx) of r = (-1, 0) = (0, -1): toward -z, which is the front, so the back is side -1
      eq(BG.flankSide(2, 0, 0, 0, yaw), -1); eq(BG.flankSide(-2, 0, 0, 0, yaw), 1);
      eq(BG.readyIn(1000, 500, 600), 40); eq(BG.readyIn(2000, 500, 600), 0);
    }],
    ['weapon value: bolts count, a staff beats a club, per hit matters more than speed, bleed and reach add; armour by style; charm by personality', () => {
      const ws = k => BG.weaponScore(G.ITEMS[k], G.combat(k));
      assert(ws('w:stormstaff') > ws('w:club'), 'the 36 bolt staff beats a 15 club (attack 36 vs 15)');
      assert(ws('w:dagger') < ws('w:sword') * 1.6, 'a dagger is not worth twice a sword');
      assert(ws('w:trident') > ws('w:handaxe') * 0.95, 'bleed and reach');
      assert(ws('w:slayer') > ws('w:claymore'), 'more damage, more value'); eq(BG.weaponScore(null, null), -1); eq(BG.weaponScore(G.ITEMS['a:vest'], G.combat('a:vest')), -1);
      const cloak = G.ITEMS['a:cloak'], tab = G.ITEMS['a:tabard'], thorn = G.ITEMS['a:thornhide'];
      assert(BG.armorFor(cloak, 'archer') - BG.armorFor(cloak, 'heavy') > 0, 'kiters value speed more');
      assert(BG.armorFor(thorn, 'brawler') > BG.armorFor(thorn, 'archer'), 'brawlers value thorns more'); assert(BG.armorFor(tab, 'brawler') > 0, 'plain armour');
      const fang = G.ITEMS['c:fang'].eff, heart = G.ITEMS['c:heart'].eff, magnet = G.ITEMS['c:magnet'].eff;
      assert(BG.charmScore(fang, { aggr: 1, caution: 0 }) > BG.charmScore(heart, { aggr: 1, caution: 0 }), 'aggressive: fang');
      assert(BG.charmScore(heart, { aggr: 0.2, caution: 1 }) > BG.charmScore(fang, { aggr: 0.2, caution: 1 }), 'cautious: heart');
      assert(BG.charmScore(magnet, { greed: 1 }) > BG.charmScore(magnet, { greed: 0 }), 'greedy: magnet');
    }],
    ['consumables: heal when safe without waste, drink in an emergency, emergency only in sudden death; regen only alone', () => {
      eq(use({ hp: 60, heal: 30, foes: 0 }), 'heal'); eq(use({ hp: 90, heal: 30 }), null, 'no waste'); eq(use({ hp: 50, max: 100, heal: 60 }), 'heal', 'at half health a big potion is fine'); eq(use({ hp: 60, heal: 30, foes: 1, near: 3, hurtAgo: 400 }), null, 'mid-fight at 60%: keep fighting');
      eq(use({ hp: 20, heal: 30, foes: 1, near: 5, hurtAgo: 400 }), 'heal', 'emergency'); eq(use({ hp: 20, heal: 30, foes: 1, near: 1.5, hurtAgo: 200 }), null, 'not while being hit point blank');
      eq(use({ hp: 20, heal: 30, sudden: true }), 'heal', 'sudden death: an emergency heal still works (half strength)'); eq(use({ hp: 70, heal: 30, sudden: true }), null, 'sudden death: no topping up'); eq(use({ hp: 20, regen: true, sudden: true }), null, 'regen potions stay off'); eq(use({ hp: 70, regen: true }), 'regen'); eq(use({ hp: 70, regen: true, foes: 1, near: 9 }), null, 'regen: alone only');
      eq(use({ hp: 20, heal: 30, roll: 0.9, items: 0.45 }), null, 'easy bots forget their pockets sometimes');
    }],
    ['consumables: smoke and tonic to escape, a trap in the doorway behind it, the feather when low; bombs on groups or a busy goblin; trap at the home hatch', () => {
      eq(use({ fleeing: true, smoke: true, foes: 1, near: 4, foeRanged: true }), 'smoke'); eq(use({ fleeing: true, trap: true, atDoor: true, pursued: true }), 'trap');
      eq(use({ fleeing: true, tonic: true, pursued: true }), 'tonic'); eq(use({ fleeing: true, recall: true, hp: 30, near: 8 }), 'recall'); eq(use({ fleeing: true, recall: true, hp: 30, near: 8, sudden: true }), null);
      eq(use({ bomb: true, cluster: 2 }), 'bomb'); eq(use({ bomb: true, cluster: 1 }), null, 'one moving goblin dodges'); eq(use({ bomb: true, cluster: 1, still: true }), 'bomb', 'a claimant on the dais');
      eq(use({ tonic: true, chase: true }), 'tonic'); eq(use({ trap: true, homeGuard: true }), 'trap'); eq(use({}), null);
    }],
    ['targets: the crown claimant first, the leader next, finish a worn-down goblin (third party), respect a truce until betrayed', () => {
      const c = ta({ claimant: true }); assert(c.force && c.adj <= -6, 'claimant'); assert(ta({ leader: true }).adj < 0 && !ta({ leader: true }).force, 'leader');
      const w = ta({ worn: true, hp: 0.2, third: 1 }); assert(w.force && w.adj <= -3, 'finish him'); assert(!ta({ worn: true, hp: 0.2, third: 0.3 }).force, 'easy bots do not force it');
      eq(ta({ worn: true, hp: 0.9 }).adj, 0, 'a healthy goblin is not worn down');
      assert(ta({ newbie: true, round: 2 }).skip && !ta({ newbie: true, round: 2, hitMe: true }).skip && !ta({ newbie: true, round: 2, claimant: true }).skip, 'a new player is left alone in rounds 2-3'); assert(ta({ newbie: true, round: 4 }).adj > 0, 'and less wanted later');
      assert(ta({ truce: true }).skip, 'truce'); assert(!ta({ truce: true, hitMe: true }).skip, 'he hit me'); const t = ta({ traitor: true }); assert(t.force && t.adj < 0, 'traitor');
    }],
    ['claim timing: contest anyone on the dais, bank claim time when alone, not when hurt or with a warden pack, late rounds and sudden death claim', () => {
      assert(cn({ onDais: true, hp: 0.2 }), 'contest'); assert(cn({ foes: 0 }), 'alone: bank it'); assert(!cn({ foes: 0, round: 1 }), 'not in round 1');
      assert(!cn({ hp: 0.3 }), 'hurt'); assert(!cn({ wardens: 2, hp: 0.6 }), 'warden pack'); assert(cn({ sudden: true, hp: 0.3, foes: 3 }), 'sudden death');
      assert(cn({ round: 4, foes: 2, hp: 0.6 }), 'late round'); assert(!cn({ round: 3, foes: 2, hp: 0.9, aggr: 0.4 }), 'mid match with rivals around: a timid bot waits');
      assert(cn({ round: 3, foes: 1, hp: 0.9, aggr: 0.8 }), 'a bold one claims');
    }],
    ['danger: leave gas, rats (unless at home and healthy), a bell, a warden pack when hurt, a loud heist when hurt', () => {
      eq(dg({ send: 'gas' }), 'gas'); eq(dg({ send: 'gas', home: true }), 'gas'); eq(dg({ send: 'rats', home: true }), null); eq(dg({ send: 'rats', home: true, hp: 0.3 }), 'rats'); eq(dg({ send: 'rats' }), 'rats');
      eq(dg({ send: 'bell' }), 'bell'); eq(dg({ send: 'jam' }), null); eq(dg({ vault: true, wardens: 2, hp: 0.4 }), 'wardens'); eq(dg({ vault: true, wardens: 2, hp: 0.4, claiming: true }), null);
      eq(dg({ vault: true, wardens: 2, hp: 0.4, sudden: true }), null, 'sudden death: the vault is the only safe place'); eq(dg({ alarm: true, hp: 0.4 }), 'alarm'); eq(dg({ heistRisk: 80, hp: 0.9 }), null); eq(dg({}), null);
    }],
    ['bomb dodge: away from the landing spot inside its radius; giving up a fruitless chase; truce odds by aggression and level', () => {
      eq(BG.bombDodge({ x: 0, z: 0, r: 2.5 }, 5, 0), null); const v = BG.bombDodge({ x: 0, z: 0, r: 2.5 }, 1, 1); assert(v[0] > 0.7 && v[1] > 0.7, 'away'); eq(BG.bombDodge({ x: 0, z: 0, r: 2.5 }, 0, 0), [1, 0]);
      assert(BG.giveUp({ chaseMs: 10000, dealt: 0, human: true }), 'a human kiting for 10 s untouched'); assert(!BG.giveUp({ chaseMs: 10000, dealt: 20, human: true }), 'making progress');
      assert(!BG.giveUp({ chaseMs: 10000, dealt: 0, human: false }), 'a bot gets 14 s'); assert(BG.giveUp({ chaseMs: 15000, dealt: 0 }), 'then gives up');
      assert(BG.truceAccept(0.3, 'normal', 0.3) && !BG.truceAccept(0.9, 'normal', 0.3), 'aggression'); assert(BG.truceAccept(0.5, 'easy', 0.3) && !BG.truceAccept(0.5, 'hard', 0.15), 'level');
    }],
    ['late rounds with nobody seen for 20 s: pull toward the vault ring and rooms not visited lately', () => {
      eq(BG.seekTerm({ quiet: 10000, round: 4, hops: 0, visited: null }), 0); eq(BG.seekTerm({ quiet: 60000, round: 2, hops: 0 }), 0);
      assert(BG.seekTerm({ quiet: 60000, round: 4, hops: 0, visited: 1000 }) > BG.seekTerm({ quiet: 60000, round: 4, hops: 3, visited: 1000 }), 'the vault first');
      assert(BG.seekTerm({ quiet: 60000, round: 4, hops: 3, visited: null }) > 0, 'unvisited rooms'); assert(BG.seekTerm({ quiet: 60000, round: 4, hops: 1, visited: 0 }) > BG.seekTerm({ quiet: 25000, round: 4, hops: 1, visited: 0 }), 'grows with the quiet');
    }],
    ['sends: a Pump Leech on the crown leader, else the top killer, never on a dead or own home, not without spare elixir or in round 1; memory fades', () => {
      const homes = [{ room: 'c1', me: true, kills: 9 }, { room: 'c3', kills: 1, hops: 2 }, { room: 'c6', kills: 0, claim: 20, hops: 6 }, { room: 'c8', kills: 5, dead: true }];
      eq(BG.sendPick(homes, { elixir: 40, round: 3, reserve: 8, sends: 1, roll: 0 }), { id: 'leech', room: 'c6' }, 'the claim leader');
      eq(BG.sendPick(homes.slice(0, 2), { elixir: 40, round: 3, reserve: 8, sends: 1, roll: 0 }), { id: 'leech', room: 'c3' });
      eq(BG.sendPick(homes, { elixir: 20, round: 3, reserve: 8, sends: 1, roll: 0 }), null, 'keeps a reserve'); eq(BG.sendPick(homes, { elixir: 99, round: 1, sends: 1, roll: 0 }), null, 'round 1');
      eq(BG.sendPick(homes, { elixir: 99, round: 3, sends: 0, roll: 0.1 }), null, 'easy never sends');
      eq(BG.memWeight({ a: 1000 }, 'a', 1000, 4000), 1); assert(BG.memWeight({ a: 1000 }, 'a', 9000, 4000) === 0.5, 'half way'); eq(BG.memWeight({ a: 1000 }, 'a', 30000, 4000), 0); eq(BG.memWeight({}, 'a', 1, 1), 0);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

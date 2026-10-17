// MORE MYSTERY-ROOM ENEMIES (docs/reports/variety.md): four new kinds on the existing NPC framework (server.js NPC table, npcFight, dieNpc).
//   bomber    rushes you; when it dies it leaves a glowing ring and blows up 0.9 s later (22 damage to goblins close, half at the edge, never to other enemies).
//   summoner  keeps its distance and calls up to two imps every 5 s (a ring marks each spawn); weak in melee.
//   shield    a slow brute that takes 70% less damage from the front: hit it from behind.
//   thief     bites, then steals a quarter of your gold (10-60) and runs; kill it within 7 s to get the gold back, otherwise it escapes with it.
// KINDS is a plain table (client and tests can read it); the factory below needs the server's functions.
const KINDS = {   // same fields as server.js NPC: hp, dmg, cd ms, speed m/s, reaction ms [lo, hi], weapon, loot [count, min tier], look = goblin model index
  bomber:   { hp: 28, dmg: 6,  cd: 700,  speed: 5.4, react: [200, 320], weapon: 'w:dagger', loot: [1, 0], look: 0, name: 'Bomber' },
  summoner: { hp: 40, dmg: 3,  cd: 900,  speed: 3.4, react: [300, 450], weapon: 'w:dagger', loot: [1, 2], look: 3, name: 'Summoner' },
  shield:   { hp: 90, dmg: 16, cd: 1300, speed: 2.8, react: [450, 650], weapon: 'w:mace',   loot: [2, 2], look: 2, name: 'Shieldbearer' },
  thief:    { hp: 30, dmg: 2,  cd: 600,  speed: 5.8, react: [150, 260], weapon: 'w:dagger', loot: [1, 1], look: 0, name: 'Thief' },
  imp:      { hp: 8,  dmg: 3,  cd: 800,  speed: 4.8, react: [250, 400], weapon: 'w:dagger', loot: [0, 0], look: 0, name: 'Imp' },
};
const P = { bomberFuse: 900, bomberDmg: 22, bomberR: 2.6, shieldFront: 0.5, shieldTaken: 0.3, imps: 2, impEvery: 5000, stealPct: 0.25, stealMin: 10, stealMax: 60, stealR: 1.9, fleeMs: 7000, fleeSpeed: 6.6 };
const WEIGHTS = [['troll', 2], ['archer', 8], ['speedy', 20], ['dumb', 30], ['regular', 50], ['bomber', 14], ['summoner', 8], ['shield', 8], ['thief', 10]];   // relative odds in a mystery room (items.js randomMystery reads this)

function make(c) {   // c: { NPC, WORLD, equip, recalc, place, newBrain, newId, bcast, sendTo, sendGold, stepTo, clampIn, face }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function mk(m, kind, x, z) {   // a new enemy of this kind at (x, z); never counts as a goblin
    const S = c.NPC[kind], key = { readyState: 0, npc: true };
    const p = { id: c.newId(), wins: 0, ws: null, key, npc: kind, name: S.name, match: m, box: -1, yaw: 0, ready: true, entered: true, npcDmg: S.dmg, npcCd: S.cd };
    c.equip(p, S.look); p.inv.weapon = S.weapon; p.inv.armor = null; c.recalc(p); p.stats.maxHealth = S.hp; p.stats.health = S.hp; p.stats.attack = S.dmg; p.gear = { weapon: S.name + "'s weapon", armor: 'None' };
    c.place(p, x, z); p.home = [x, z]; p.brain = c.newBrain(p, S.speed); p.brain.react = S.react; m.players.set(key, p); m.dirty = true; return p;
  }
  const ring = (m, x, z, r, col) => c.bcast(m, { npcRing: { x: +x.toFixed(2), z: +z.toFixed(2), r, c: col } });
  const note = (p, text) => { if (p && p.ws) c.sendTo(p.ws, { npcNote: text }); };

  // every brain tick of an NPC, before the normal brain: returns true when this kind handled the tick itself
  function think(m, p, now, dt) {
    const b = p.brain, t = b.tgt && !b.tgt.dead && b.tgt.room === p.room ? b.tgt : null;
    if (p.npc === 'summoner') {
      if (t && now >= (p.smAt || 0)) {
        p.smAt = now + P.impEvery; const mine = [...m.players.values()].filter(q => q.master === p.id && !q.dead).length;
        if (mine < P.imps) { const a = Math.random() * 6.28, [x, z] = c.clampIn(p.room, p.x + Math.cos(a) * 1.4, p.z + Math.sin(a) * 1.4, 0.6), im = mk(m, 'imp', x, z); im.master = p.id; im.brain.seenAt = now - 5000; ring(m, x, z, 1.0, '#b070ff'); }
      }
      return false;
    }
    if (p.npc === 'thief') {
      const th = p.th;
      if (th && th.state === 'flee') {
        if (now >= th.until) { p.dead = true; m.players.delete(p.key); m.dirty = true; c.bcast(m, { npcNote: 'The thief got away with ' + th.loot + ' gold' }); return true; }   // escaped: no drop
        if (Math.hypot(p.x - th.x, p.z - th.z) < 0.8) { const [x, z] = th.far(p); th.x = x; th.z = z; }
        b.speed = P.fleeSpeed; c.stepTo(m, p, th.x, th.z, dt, now); return true;
      }
      if (t && !t.npc && (t.gold | 0) > 0 && dist(p, t) <= P.stealR && now - (p.hurtAt || 0) >= 0) {
        const amt = Math.min(t.gold | 0, Math.max(P.stealMin, Math.min(P.stealMax, Math.round(t.gold * P.stealPct))));
        t.gold -= amt; c.sendGold(t); note(t, 'A thief stole ' + amt + ' gold! Kill it to get it back');
        const far = q => { let best = null, bd = -1; for (let i = 0; i < 6; i++) { const [x, z] = c.WORLD.randomPoint(q.room), d = Math.hypot(x - t.x, z - t.z); if (d > bd) { bd = d; best = [x, z]; } } return best; };
        const [x, z] = far(p); p.th = { state: 'flee', loot: amt, until: now + P.fleeMs, x, z, far }; b.tgt = null; return true;
      }
    }
    return false;
  }
  // fighting: the summoner keeps its distance and only bites when cornered
  function fight(m, p, t, now, dt) {
    if (p.npc !== 'summoner') return false;
    const d = dist(p, t);
    if (d < 4) { const [x, z] = c.clampIn(p.room, p.x + (p.x - t.x) * 3, p.z + (p.z - t.z) * 3, 0.8); c.stepTo(m, p, x, z, dt, now); }
    else if (d > 7.5) { const [x, z] = c.clampIn(p.room, t.x, t.z, 0.5); c.stepTo(m, p, x, z, dt, now); }
    else c.face(m, p, t.x, t.z, now, true);
    return d > 1.7;   // close enough to bite: let the normal swing code run
  }
  // damage a target takes (called from hitTarget): the shieldbearer shrugs off hits from the front
  function hit(m, att, t, dmg) {
    if (t.npc !== 'shield' || !att) return dmg;
    const dx = att.x - t.x, dz = att.z - t.z, l = Math.hypot(dx, dz) || 1;
    return (dx * -Math.sin(t.yaw || 0) + dz * -Math.cos(t.yaw || 0)) / l > P.shieldFront ? Math.max(1, Math.round(dmg * P.shieldTaken)) : dmg;
  }
  // an enemy died (before its loot drops): the bomber arms, a thief returns the stolen gold to its killer
  function died(m, p, now) {
    if (p.npc === 'bomber') {
      ring(m, p.x, p.z, P.bomberR, '#ff5030');
      m.bombs = m.bombs || []; m.bombs.push({ id: -c.newId(), x: p.x, z: p.z, room: p.room, at: now + P.bomberFuse, by: p, n: P.bomberDmg, r: P.bomberR, goblinsOnly: true });
    }
    if (p.npc === 'thief' && p.th && p.th.loot) { const k = [...m.players.values()].find(q => q.id === p.killedBy && !q.npc); if (k) { k.gold = (k.gold || 0) + p.th.loot; c.sendGold(k); note(k, 'Got ' + p.th.loot + ' gold back'); } }
  }
  return { mk, think, fight, hit, died };
}
make.KINDS = KINDS; make.P = P; make.WEIGHTS = WEIGHTS;
module.exports = make;

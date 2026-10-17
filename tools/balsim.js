// BALANCE-3 (docs/reports/balance-3.md): a deterministic duel simulator over the real combat rules in items.js (combat(), goblinHit(), goblinHp(), hit radius,
// reach, thorns, bleed, bolts, regeneration, charms, the damage cap and the abilities). Pure, seeded and fast: no server, no clock, no Math.random.
//   node tools/balsim.js              prints every table of the report (weapons, armour, goblins, stacking, economy)
//   require('./tools/balsim.js')      { duel, kit, field, weaponLadder, armourLadder, goblinTable, ... } for tests/balance3.test.js
// The model: two goblins meet 7 m apart in a 15 m room. The one with the shorter reach sprints in; the longer reach (bow, bolt, whip, pike) backs off at sprint speed while it can,
// until the wall is 6 m behind it, then circles (a circling kiter only gains 55% of its speed on the chaser). Every swing whiffs 25% of the time (both players and bots miss);
// a slow bolt misses more the farther it flies (the target strafes). Backstab lands on 20% of the sneak's melee blows. The dash (ABILITY) dodges one blow every cooldown
// when `abil` is on; the heavy blow is used by heavy weapons when the target is in reach and not mid-dash.
const G = require('../items.js');
const ROOM_FREE = 6, START_D = 7, DT = 50, T_MAX = 120000, MISS = 0.25, BACKSTAB_P = 0.2, CIRCLE = 0.55, SPRINT = 7.5, SLACK = G.COMBAT.slack;
function rng(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const SB = () => G.STAFF_BOLT || { dmg: 9, cd: 1000 };
// kit: what a goblin brings to a fight. o = { goblin, weapon, armor, charm, perks }
function kit(o) {
  const g = o.goblin == null ? 1 : o.goblin, c = G.combat(o.weapon), w = o.weapon && G.ITEMS[o.weapon], a = G.ITEMS[o.armor] || { health: 0 };
  const staff = w && (w.family === 'staff' || w.family === 'scepter'), bolt = c.bolt || (staff ? SB().dmg : 0);
  const hp = G.goblinHp(g, a.health) + ((o.charm && G.charmEff(o.charm, 'hp')) || 0);
  const spd = SPRINT * G.SPEED[g] * G.armorSpeed(o.armor) * ((o.charm && G.charmEff(o.charm, 'spd')) || 1);
  const range = bolt ? 12 : c.ranged ? c.range : c.range + SLACK + G.goblinReach(g);
  return { g, key: o.weapon, armor: o.armor, dmg: bolt || c.dmg, cd: bolt && !c.bolt ? SB().cd : c.cd, bolt: !!bolt, ranged: !!(c.ranged || bolt), bleed: c.bleed || null,
    range, max: hp, spd, hitR: G.hitRadius(g), thorns: G.armorThorns(o.armor), regen: G.goblinRegen(g), itemMul: (o.charm && G.charmEff(o.charm, 'dmg')) || 1, perks: o.perks || [],
    heavy: G.ABIL && G.ABIL.heavyFor ? G.ABIL.heavyFor(o.weapon) : null };
}
const reachOn = (x, y) => x.range + (x.ranged && !x.bolt ? 0 : y.hitR - G.HIT_R);   // melee reach and the bolt radius grow with the target's size
// one fight -> { win: 1 if A wins, t: ms, hpLeft: fraction of the winner's health }
function duel(A, B, rnd, opt = {}) {
  const abil = opt.abil !== false && !!G.ABIL, D = abil ? G.ABIL.DASH : null, H = abil ? G.ABIL.HEAVY : null;
  const C5 = opt.c5 !== false && G.COMBAT5 ? require('../combat5.js').of(G) : null;   // COMBAT5: stamina, combo chains and whiff recovery (the guard is not modelled here: both sides would only trade it)
  const mk = K => ({ ...K, c5: C5 ? C5.state() : null, hp: K.max, next: 0, hurt: -1e9, rg: 0, bl: null, dashAt: -1e9, iUntil: -1e9, back: ROOM_FREE, charge: -1, stun: -1e9, sw: false });
  const a = mk(A), b = mk(B); let d = opt.d0 || START_D;
  a.next = Math.round(rnd() * 300); b.next = Math.round(rnd() * 300);
  const hit = (x, y, t, base, melee, isBleed, mul = 1) => {   // the server's hitTarget order: dash i-frames, dodge/backstab/rage/thick hide, cap, health, thorns
    if (!isBleed && t < y.iUntil) return 0;
    const pre = isBleed ? 1 : x.itemMul * mul;
    const r = G.goblinHit({ goblin: x.g, hp: x.hp, max: x.max }, { goblin: y.g }, Math.round(base * pre), { melee, behind: melee && rnd() < BACKSTAB_P, rnd: rnd() });
    if (r.dodged) return 0;
    let dmg = r.dmg; if (G.capHit) dmg = G.capHit(base, dmg, { goblin: y.g });
    y.hp -= dmg; y.hurt = t;
    if (melee && !isBleed && y.hp > 0 && y.thorns && x.hp > 1) x.hp = Math.max(1, x.hp - y.thorns);
    return dmg;
  };
  for (let t = 0; t < T_MAX; t += DT) {
    // movement: the shorter reach closes, the longer one keeps its distance
    const ra = reachOn(a, b), rb = reachOn(b, a);
    const [far, near] = ra > rb + 0.4 ? [a, b] : rb > ra + 0.4 ? [b, a] : [null, null];
    if (!far) d = Math.max(0.9, d - 2 * SPRINT * G.SPEED[1] * DT / 1000);
    else {
      const want = Math.max(reachOn(near, far) + 0.7, Math.min(reachOn(far, near) - 0.4, far.bolt ? 4.5 : 6));
      const nearV = near.spd * (t < near.stun ? 0 : 1) * (near.charge >= 0 ? (H ? H.moveMul : 1) : 1), farV = far.spd * (far.back > 0 ? 1 : CIRCLE);
      let dd = -nearV * DT / 1000;
      if (d < want + 0.3) { dd += farV * DT / 1000; if (far.back > 0) far.back -= far.spd * DT / 1000; }
      if (D && t >= near.dashAt + D.cd && t >= near.stun && d > reachOn(near, far) + 1 && d < reachOn(near, far) + D.dist + 1.5) { near.dashAt = t; near.iUntil = t + D.iframeMs; dd -= D.dist; }   // ABILITY: the dash closes the gap on a kiter
      d = Math.max(0.9, d + dd);
    }
    for (const [x, y] of [[a, b], [b, a]]) {
      // bleed ticks (one a second)
      if (x.bl && t >= x.bl.next) { x.bl.next = t + 1000; x.bl.left--; hit(x.bl.by, x, t, x.bl.dmg, false, true); if (x.bl.left <= 0) x.bl = null; if (x.hp <= 0) return { win: x === a ? 0 : 1, t, hpLeft: (x === a ? b : a).hp / (x === a ? b : a).max }; }
      // ABILITY: the dash. A goblin with its dash ready sidesteps the blow it sees coming (the attacker winding up a heavy, or any blow when wounded) half the time
      if (D && t >= x.dashAt + D.cd && t >= x.stun && (y.charge >= 0 && t - y.charge >= H.chargeMs - 200 || (t >= y.next - 100 && d <= reachOn(y, x) && x.hp < x.max * 0.7)) && rnd() < 0.5) { x.dashAt = t; x.iUntil = t + D.iframeMs; }
      if (t < x.stun) continue;
      const reach = !x.ranged && !y.ranged && Math.abs(ra - rb) < 0.3 ? Math.max(ra, rb) : reachOn(x, y);   // a few cm of hit box do not decide who swings first (50 ms steps close 0.75 m)
      // ABILITY: heavy weapons charge a heavy blow when the foe is close and the dash of the foe is not ready
      if (H && x.heavy && x.charge < 0 && t >= x.next && d <= reach + 0.6 && rnd() < 0.5) { x.charge = t; continue; }
      if (x.charge >= 0) {
        if (t - x.charge < H.chargeMs) continue;
        x.charge = -1; x.next = t + Math.round(x.cd * H.cdMul);
        const h5 = C5 ? C5.pre(x.c5, t, x.cd, x.key, 1, true) : null; if (h5 && h5.cdMul !== 1) x.next += Math.round(x.cd * (h5.cdMul - 1));
        let hl = 0; if (d <= reach && rnd() >= MISS) { const dm = hit(x, y, t, x.dmg, true, false, x.heavy.mult * (h5 ? h5.dmgMul : 1)); if (dm > 0) { hl = 1; y.stun = t + H.staggerMs; y.charge = -1; } }
        if (h5) x.next += C5.post(x.c5, x.key, x.cd, h5.idx, hl, 'e');
        if (y.hp <= 0) return { win: x === a ? 1 : 0, t, hpLeft: x.hp / x.max };
        continue;
      }
      if (t >= x.next && d <= reach) {
        x.next = t + x.cd;
        const r5 = C5 ? C5.pre(x.c5, t, x.cd, x.key, 0, !x.ranged) : null; if (r5 && r5.cdMul !== 1) x.next = t + Math.round(x.cd * r5.cdMul);
        let p = 1 - MISS, landed = 0; if (x.bolt) p *= Math.max(0.4, Math.min(1, 1.2 - d / 10)); const pb = x.ranged && !x.bolt && G.POINT_BLANK && d < G.POINT_BLANK.r ? G.POINT_BLANK.mul : 1;
        if (rnd() < p) {
          const hp0 = y.hp, dm = hit(x, y, t, x.dmg, !x.ranged, false, pb * (r5 ? r5.dmgMul : 1)); landed = dm > 0 ? 1 : 0;
          if (dm > 0 && x.bleed && y.hp > 0 && y.hp < hp0) y.bl = { by: x, dmg: x.bleed[0], left: x.bleed[1], next: t + 1000 };
        }
        if (r5 && !x.ranged) x.next += C5.post(x.c5, x.key, x.cd, r5.idx, landed, 'e');
        if (y.hp <= 0) return { win: x === a ? 1 : 0, t, hpLeft: x.hp / x.max };
      }
      if (x.hp < x.max && t - x.hurt >= G.COMBAT.regenIdle * x.regen.idle && t - x.rg >= G.COMBAT.regenEvery * x.regen.every) { x.rg = t; x.hp = Math.min(x.max, x.hp + G.COMBAT.regenAmt); }
    }
  }
  return { win: a.hp / a.max > b.hp / b.max ? 1 : 0, t: T_MAX, hpLeft: 0 };
}
// win rate of A over B in n seeded fights (each fight swaps who acts first by the random opening)
function rate(A, B, n = 200, seed = 7, opt) { const r = rng(seed); let w = 0, t = 0; for (let i = 0; i < n; i++) { const o = i & 1 ? duel(B, A, r, opt) : duel(A, B, r, opt); w += i & 1 ? 1 - o.win : o.win; t += o.t; } return { p: w / n, t: t / n }; }   // every other fight swaps sides (A acts first inside a 50 ms step)
const isGear = k => { const i = G.ITEMS[k]; return i && !i.up && i.chance > 0; };
const weapons = () => Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'weapon' && isGear(k));
const armours = () => Object.keys(G.ITEMS).filter(k => G.ITEMS[k].type === 'armor' && isGear(k));
const byTier = keys => { const o = {}; for (const k of keys) (o[G.ITEMS[k].tierN] = o[G.ITEMS[k].tierN] || []).push(k); return o; };
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
// the reference armour of a tier: the plain (speed 1, no thorns) piece nearest the tier's median health
function refArmour(tier) { const ks = byTier(armours())[tier] || [], m = median(ks.map(k => G.ITEMS[k].health)), plain = ks.filter(k => !G.ITEMS[k].speed && !G.ITEMS[k].thorns); return (plain.length ? plain : ks).sort((x, y) => Math.abs(G.ITEMS[x].health - m) - Math.abs(G.ITEMS[y].health - m))[0]; }
function refWeapons(tier) { return (byTier(weapons())[tier] || []); }
function dpsOf(k) { const K = kit({ weapon: k, armor: 'a:vest' }); return K.dmg * 1000 / K.cd + (K.bleed ? K.bleed[0] * K.bleed[1] * 1000 / Math.max(K.cd, K.bleed[1] * 1000) : 0); }
// weapons: each weapon vs every weapon of its own tier, the tier below and above, everyone a medium goblin in that tier's reference armour (the higher tier's armour for cross-tier fights)
function weaponLadder(n = 120, opt) {
  const T = byTier(weapons()), out = [];
  for (const t of Object.keys(T).map(Number).sort()) for (const k of T[t]) {
    const row = { key: k, name: G.ITEMS[k].name, tier: t, dps: +dpsOf(k).toFixed(1) };
    for (const [lab, tt] of [['down', t - 1], ['same', t], ['up', t + 1]]) {
      const foes = (T[tt] || []).filter(f => f !== k); if (!foes.length) continue;
      const arm = refArmour(Math.max(t, tt));
      row[lab] = +(foes.reduce((s, f, i) => s + rate(kit({ weapon: k, armor: arm }), kit({ weapon: f, armor: arm }), n, 11 + i, opt).p, 0) / foes.length).toFixed(2);
    }
    out.push(row);
  }
  return out;
}
// armour: each armour vs every armour of its tier and the tiers around it, both goblins with the same weapon (each reference weapon of the higher tier in turn)
function armourLadder(n = 60, opt) {
  const T = byTier(armours()), out = [];
  for (const t of Object.keys(T).map(Number).sort()) for (const k of T[t]) {
    const it = G.ITEMS[k], row = { key: k, name: it.name, tier: t, hp: it.health, speed: it.speed || 1, thorns: it.thorns || 0 };
    for (const [lab, tt] of [['down', t - 1], ['same', t], ['up', t + 1]]) {
      const foes = (T[tt] || []).filter(f => f !== k); if (!foes.length) continue;
      const ws = refWeapons(Math.max(1, Math.min(5, Math.max(t, tt)))); let s = 0, c = 0;
      for (const f of foes) for (let i = 0; i < ws.length; i += 2) { s += rate(kit({ weapon: ws[i], armor: k }), kit({ weapon: ws[i], armor: f }), n, 5 + i, opt).p; c++; }
      row[lab] = +(s / c).toFixed(2);
    }
    out.push(row);
  }
  return out;
}
// goblins: every type against every other, (a) with its START gear, (b) all with the same mid gear (Iron Sword + Chainmail Shirt) so only the type itself counts
function goblinTable(n = 200, opt) {
  const NG = G.GOBLINS.length, startK = g => kit({ goblin: g, weapon: G.START[g].weapon, armor: G.START[g].armor });
  const EVEN = [['w:ironsword', 'a:chain'], ['w:axe', 'a:boiled'], ['w:spear', 'a:scale'], ['w:halberd', 'a:cuirass']], evenK = (g, k) => kit({ goblin: g, weapon: EVEN[k][0], armor: EVEN[k][1] });   // four mid kits, so one hit-count step does not decide
  const rows = [];
  for (let i = 0; i < NG; i++) {
    let s = 0, e = 0; const vs = [];
    for (let j = 0; j < NG; j++) if (j !== i) { const p = rate(startK(i), startK(j), n, 100 + i * 13 + j, opt).p; s += p; vs.push(p); for (let k = 0; k < EVEN.length; k++) e += rate(evenK(i, k), evenK(j, k), n >> 1, 300 + i * 13 + j + k * 7, opt).p / EVEN.length; }
    rows.push({ g: i, key: G.GOBLINS[i].key, start: +(s / (NG - 1)).toFixed(2), even: +(e / (NG - 1)).toFixed(2), worst: +Math.min(...vs).toFixed(2), best: +Math.max(...vs).toFixed(2) });
  }
  return rows;
}
// stacking: the largest multiplier one blow can carry over the bare weapon (Wolf Fang + Rage Brew + Fury III + Oak ambush + backstab + berserker rage), before and after the cap
function stacking() {
  const items = Math.min(1.5, G.charmEff('c:fang', 'dmg') * G.ITEMS['x:rage'].n), perk = Math.max(G.GOB_PERKS.backstab.mult, G.GOB_PERKS.rage.mult), fury = 1.15, ambush = 1.5;
  const raw = items * perk * fury * ambush, heavy = G.ABIL ? Math.max(...Object.values(G.ABIL.HEAVY.fams)) : 1;
  return { items, perk, fury, ambush, heavy, raw: +(raw * heavy).toFixed(2), capped: G.DMG_CAP ? Math.min(raw * heavy, G.DMG_CAP) : raw * heavy, cap: G.DMG_CAP || null };
}
module.exports = { rng, kit, duel, rate, weapons, armours, byTier, refArmour, refWeapons, dpsOf, weaponLadder, armourLadder, goblinTable, stacking };
if (require.main === module) {
  const t0 = Date.now(), pr = (h, rows, cols) => { console.log('\n## ' + h + '\n| ' + cols.join(' | ') + ' |\n|' + cols.map(() => '---').join('|') + '|'); for (const r of rows) console.log('| ' + cols.map(c => r[c] == null ? '' : r[c]).join(' | ') + ' |'); };
  const opt = process.argv.includes('noabil') ? { abil: false } : undefined;
  pr('Goblins (field win rate)', goblinTable(160, opt), ['key', 'start', 'even', 'worst', 'best']);
  pr('Weapons (win rate vs the tier below / own tier / tier above)', weaponLadder(80, opt), ['name', 'tier', 'dps', 'down', 'same', 'up']);
  pr('Armour (win rate vs the tier below / own tier / tier above)', armourLadder(40, opt), ['name', 'tier', 'hp', 'speed', 'thorns', 'down', 'same', 'up']);
  console.log('\nstacking', JSON.stringify(stacking()), '\n' + (Date.now() - t0) + ' ms');
}

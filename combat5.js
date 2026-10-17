// COMBAT5: the rules of a fight, pure and shared (docs/reports/combat-5.md). Stamina, combo chains, whiff recovery and the guard numbers of a weapon.
// The numbers all live in items.js COMBAT5 (one tunable table). The server (server.js COMBAT5 block) is authoritative; the client (game.js COMBAT5 block) runs the same
// functions on its own clock so the cooldown it shows and the swing it sends agree with the server's verdict. No allocation in the hot paths beyond one small result object.
//   const C5 = GKC5.of(GKITEMS);   state per goblin: c = C5.state()  ->  { n (landed chain), at (last melee swing start), sta: {v, t, hold}, rip (riposte until), off (guard lowered at) }
(function (root) {
  'use strict';
  function of(G) {
    const T = G.COMBAT5, S = T.STA, CB = T.COMBO, GD = T.GUARD;
    const famOf = key => { const w = key && G.ITEMS && G.ITEMS[key]; return w && w.type === 'weapon' && w.family ? w.family : 'fist'; };
    const row = key => T.FAM[famOf(key)] || T.FAM.sword;
    const staNew = () => ({ v: S.max, t: 0, hold: 0 });
    const state = () => ({ n: 0, at: 0, rip: 0, off: 0, sta: staNew() });
    // regeneration runs from the later of the last update and the end of the post-spend delay
    function staStep(s, now, mult) {
      const from = Math.max(s.t || now, s.hold || 0);
      if (now > from && s.v < S.max) s.v = Math.min(S.max, s.v + S.regen * (mult == null ? 1 : mult) * (now - from) / 1000);
      s.t = now; return s.v;
    }
    function staSpend(s, now, amt) {   // returns the shortfall (0 = paid in full); stamina never goes below 0
      staStep(s, now); const short = Math.max(0, amt - s.v); s.v = Math.max(0, s.v - amt); s.hold = now + S.delay; return short;
    }
    const staSet = (s, v, now, holdMs) => { s.v = Math.max(0, Math.min(S.max, v)); s.t = now; s.hold = now + (holdMs || 0); };
    const staHas = (s, now, need) => staStep(s, now) >= need;
    // a swing: stamina and chain position. melee: only melee swings chain. hm: a heavy blow multiplier (0 = none)
    function pre(c, now, cd, key, hm, melee) {
      const f = row(key), idx = melee && c.at && c.n > 0 && now - c.at <= cd + CB.windowMs ? Math.min(c.n, 2) : 0;
      const short = staSpend(c.sta, now, f.cost + (hm ? S.heavy : 0)), winded = short > 0, fin = idx === 2;
      if (melee) c.at = now;
      if (melee && idx === 0) c.n = 0;
      return { idx, fin, winded, cdMul: winded ? S.windedCd : 1, dmgMul: (fin ? CB.fin.dmg : 1) * (winded ? S.windedDmg : 1) };
    }
    // the swing is over: n goblins hit (blocked/parried ones are reported through why 'b' / 'p'), why: 'c'/'s' cancelled / staggered. Returns ms to add to the cooldown (negative = chain faster)
    function post(c, key, cd, idx, n, why) {
      if (why === 'c' || why === 's' || why === 'p' || why === 'b' || why === 'n') { c.n = 0; return 0; }
      if (!(n > 0)) { c.n = 0; return Math.round(cd * CB.whiff); }
      if (idx >= 2) { c.n = 0; return Math.round(cd * (CB.fin.recover - 1)); }
      c.n = idx + 1; return -Math.round(cd * (1 - (CB.famFast[famOf(key)] || CB.fast)));
    }
    // guard numbers of the weapon in hand; null = cannot guard (bows)
    function guardOf(key) {
      const f = row(key); if (f.blk == null) return null;
      return { mul: f.blk, parry: f.par ? f.par + GD.slack : 0, cone: GD.cone * Math.PI / 180, fam: famOf(key) };
    }
    // stamina a block costs the defender: damage x blockPerDmg x the attacker's family drain (a heavy blow doubles it again for hammers' sake: it is already in drain)
    const blockCost = (attKey, dmg, hm) => Math.max(1, dmg * S.blockPerDmg * (row(attKey).drain || 1) * (hm ? 1.25 : 1));
    return { T, S, CB, GD, famOf, row, state, staNew, staStep, staSpend, staSet, staHas, pre, post, guardOf, blockCost };
  }
  const api = { of };
  root.GKC5 = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

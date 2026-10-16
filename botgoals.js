// botgoals.js: pure goal scoring for the 5x5 server bots (docs/PLAN-5x5.md 5.3, docs/PLAN-5x5-rooms.md 6, docs/reports/bots5.md).
// No I/O, no clock, no Math.random(): server.js (the BOTS5 block) builds small plain objects, these functions turn them into numbers and choices.
// Node only (the client has its own offline bots). Everything here is cheap: O(1) per room, no allocation in the hot paths.
'use strict';

const K = {
  HOME_WORK: 4, HOME_HURT: 5, FOREIGN_HOME: -5,   // own home: +4 with work (junk, a craftable upgrade), +5 when hurt (the full pump is server.js botHomeWant); never someone else's home
  FORGE: 5, GRAND: 3, GRAND_NEAR: 4.5,                          // Master Forge with a craftable upgrade; Grand Recycler with junk (preferred over home within 3 hops)
  VENT: -6,                                                     // sudden death: outer ring, homes and loot rooms hurt
  TREASURY: 4, CLAIM: 5, CONTEST: 9, WARDEN: -5,                // the vault: be inside at the round end, claim late, contest a claimant, avoid wardens when hurt
  STAGE: 0.6,                                                   // a vaultbreaker room borrows this share of the vault's pull while the vault is shut
  DONE: -4,                                                     // an activity room already finished this round
  HURT: 0.45,                                                   // below this HP fraction a bot goes home to recover (outside sudden death)
};

// ---- the extra pickDest term for one room. o: {kind, dist, hint, work, junk, master, hpFrac, sudden, round, sudRound, msLeft,
// gaining, wardens, aggr, greed, caution, done, vault (the bot's vault want), homeBody}. kind: home | foreign | forge | grand | tree | vb | vault | vent | other
function roomTerm(o) {
  let s = 0;
  const hurt = o.hpFrac < K.HURT && !o.sudden;
  switch (o.kind) {
    case 'home':
      if (o.sudden) return K.VENT;
      if (o.work) s += K.HOME_WORK * (0.7 + 0.6 * (o.homeBody || 0.5));
      if (hurt) s += K.HOME_HURT;
      return o.work || hurt ? s : -1;
    case 'foreign': return K.FOREIGN_HOME + (o.sudden ? K.VENT : 0);
    case 'forge': return o.sudden ? K.VENT : o.master ? K.FORGE : -1;
    case 'grand': return o.sudden ? K.VENT : o.junk ? (o.dist <= 3 ? K.GRAND_NEAR : K.GRAND) + Math.min(2, (o.junk - 1) * 0.5) : -1;
    case 'tree': case 'vb':
      if (o.done) return K.DONE;
      s = o.hint || 0;
      if (o.kind === 'vb' && o.vault > 0) s = Math.max(s, o.vault * K.STAGE);   // a vault door room is the way in
      if (hurt && o.kind === 'vb') s -= 2;
      return s;
    case 'vault': return o.vault || 0;
    case 'vent': return K.VENT;
    default: return 0;
  }
}

// ---- how much a bot wants to be in THE VAULT right now (also the staging pull of the vaultbreaker rooms).
// o: {round, sudden, sudRound, msLeft, gaining (someone else is claiming), mine (this bot is the claimant), wardens, hpFrac, aggr, patience, caution, claimMs}
function vaultWant(o) {
  let s = 0;
  if (o.round >= 3) s += 2 + 2 * (o.aggr || 0);                      // the objective grows with the rounds
  if (o.round >= o.sudRound - 1 || o.sudden) s += K.CLAIM;           // late rounds and sudden death: the crown decides the match
  if (!o.sudden && o.msLeft != null && o.msLeft < 30000 && o.round >= 2) s += K.TREASURY;   // be inside when the treasury pays
  if (o.gaining) s += K.CONTEST * (0.5 + 0.5 * (o.aggr || 0));      // contest a claimant: 2 on the dais freeze the claim
  if (o.wardens && o.hpFrac < 0.6) s += K.WARDEN;
  if (o.hpFrac < 0.35 && !o.sudden) s -= 4;
  return s;
}

// ---- the weight of a vault door on a vaultbreaker room's panel (the 2-room rule: it opens only with 2 or more votes in all).
// o: {round, sudden, hurt, others (vault votes already on the board from other rooms), extra (heist weight in this room: armed Keystone, writs, a Cracked door),
//     bribe (the bot can afford a bribe), pick (it carries a Vault Lockpick), want (vaultWant), spoil (a spoiler personality)}
function vaultVote(o) {
  if (o.sudden) return 0.2;                                          // every door is open anyway
  let w = o.round >= 3 ? 3 : 0.4;
  if (o.others >= 1 || o.extra >= 1) w += 6;                         // the second vote, or a heist already worth one: complete the rule
  if (o.bribe || o.pick) w += 2.5;                                   // it can make up the missing vote alone
  if (o.want > 6) w += 2;
  if (o.hurt) w *= 0.5;
  if (o.spoil && o.others < 1) w *= 0.3;
  return w;
}

// ---- a door toward the room the bot wants (its goal, even when that room is not reachable yet): factor for the vote weight
const stepFactor = (here, there) => here == null || there == null ? 1 : there < here ? 2.5 : there > here ? 0.6 : 1;

// ---- timing presses: the bot taps through the same message as a human. With wantHit it waits for the window, otherwise it taps outside it.
// tm = {t0, per, a, win} (activity.js timing). Returns true when the bot should press now.
function tapNow(tm, now, wantHit) {
  if (!tm || !(tm.per > 0)) return true;
  const ph = (((now - tm.t0) % tm.per) + tm.per) % tm.per / tm.per, d = ((ph - tm.a) % 1 + 1) % 1, w = tm.win == null ? 0.3 : tm.win;
  const inside = d >= w * 0.15 && d <= w * 0.85;                     // well inside the window (the server adds its own grace)
  return wantHit ? inside : d > w + 0.1 && d < 0.9;
}
// the press roll (activity rooms: 0.45 + 0.3 * skill)
const pressOk = (skill, r) => r < 0.45 + 0.3 * (skill || 0);

// ---- Memory Tree: touch the right lantern (ok) or a wrong one
function lantern(seq, pos, ok, r, all) {
  const want = seq && seq[pos];
  if (ok && want) return want;
  const others = (all || ['NE', 'NW', 'SE', 'SW']).filter(a => a !== want);
  return others[Math.floor(r * others.length) % others.length];
}

// ---- where to stand to use an anchor {x, z, r}: on the line from the anchor toward the bot (or the room centre), just inside its reach
function standPoint(an, px, pz, cx, cz) {
  let ux = px - an.x, uz = pz - an.z, l = Math.hypot(ux, uz);
  if (l < 0.3) { ux = cx - an.x; uz = cz - an.z; l = Math.hypot(ux, uz); }
  if (l < 0.3) { ux = 0; uz = 1; l = 1; }
  const d = (an.r || 0) + 0.55;
  return [an.x + ux / l * d, an.z + uz / l * d];
}
const inReach = (an, px, pz, pad) => !!an && Math.hypot(px - an.x, pz - an.z) <= (an.r || 0) + (pad == null ? 1.0 : pad);

// ---- stuck watchdog. wd = {x, z, room, t, n}. moving: the bot wants to move (it has a route). Returns the ms it has been stuck (0 = fine).
function watch(wd, x, z, room, now, moving) {
  if (wd.t == null || room !== wd.room || Math.hypot(x - wd.x, z - wd.z) > 1.0 || !moving) { wd.x = x; wd.z = z; wd.room = room; wd.t = now; return 0; }
  return now - wd.t;
}

// ---- all-pairs door hops over every door (open or not): adj = {key: [toKey, ...]} -> {from: {to: hops}}
function allDist(adj) {
  const out = {};
  for (const s of Object.keys(adj)) {
    const d = { [s]: 0 }, q = [s];
    for (let h = 0; h < q.length; h++) for (const t of adj[q[h]] || []) if (d[t] === undefined) { d[t] = d[q[h]] + 1; q.push(t); }
    out[s] = d;
  }
  return out;
}

// ---- which crafted item is worth it: value of the output over what the bot wears. o: {type, attack, health, heal}, cur: {attack, armor (score), heals}
function craftValue(o, cur) {
  if (!o) return 0;
  if (o.type === 'weapon') return Math.max(0, (o.attack || 0) - (cur.attack || 0));
  if (o.type === 'armor') return Math.max(0, ((o.score != null ? o.score : o.health) || 0) - (cur.armor || 0)) / 2;
  if (o.type === 'consumable' && o.heal > 0) return cur.heals ? 0 : 3;
  return 0;
}

// ---- a personality for the 5x5 goals (rolled once per bot from an rng): how much it likes home, co-op, skill presses, spoiling
function persona(r) {
  return { skill: 0.2 + 0.7 * r(), coop: r(), homeBody: r(), spoil: r() < 0.22, tree: 0.6 + 0.8 * r(), heist: 0.6 + 0.8 * r() };
}

const BG = { K, roomTerm, vaultWant, vaultVote, stepFactor, tapNow, pressOk, lantern, standPoint, inReach, watch, allDist, craftValue, persona };
module.exports = BG;

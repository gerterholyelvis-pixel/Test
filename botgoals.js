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

// =====================================================================================================================================
// BOTS6 (docs/reports/bots6.md): skill levels, fight spacing by weapon family, consumables at the right moment, target judgement,
// claim timing, danger checks and sends. Pure: every input is a small plain object built by server.js (the BOTS6 block), every
// random roll comes in as a number. Nothing here reads more than a human could know: what the bot saw, heard or was told.
// =====================================================================================================================================

// ---- skill levels (PLAN-fun feature 8): one table of parameters, no extra code paths.
// notice: ms before a newcomer is noticed; miss: share of deliberate misses; react: re-decide interval [lo, hi] ms; aim: yaw error (rad, +-);
// skill: timing-press skill (null = personality); spoil: sabotage share; sends: chance a send is worth it; mem: ms a sighting is remembered;
// hear: metres a fight is heard through walls; hesitate: chance of a short pause per decision; flank / window / kite: how often the bot uses
// the family tactic (flanking with daggers, waiting out a swing, kiting with bows); items: how often it uses a consumable when one would help;
// dodge: chance it steps out of a bomb or a telegraphed send; third: appetite for finishing a goblin someone else wore down; tokens: heist weight; lead: how well it leads a moving goblin with a slow bolt.
const LEVELS = {
  easy:   { name: 'easy',   notice: 1200, miss: 0.45, react: [380, 650], aim: 0.30, skill: 0.25, spoil: 0,    sends: 0,    mem: 2500, hear: 7,  hesitate: 0.08, flank: 0.1, window: 0.25, kite: 0.35, items: 0.45, dodge: 0.25, third: 0.3, tokens: 0.5, lead: 0.2 },
  normal: { name: 'normal', notice: 700,  miss: 0.30, react: [220, 420], aim: 0.18, skill: null, spoil: 0.22, sends: 0.45, mem: 4000, hear: 10, hesitate: 0.04, flank: 0.6, window: 0.7,  kite: 0.8,  items: 0.85, dodge: 0.65, third: 0.7, tokens: 1, lead: 0.6 },
  hard:   { name: 'hard',   notice: 450,  miss: 0.15, react: [150, 300], aim: 0.10, skill: 0.8,  spoil: 0.30, sends: 0.9,  mem: 6000, hear: 14, hesitate: 0.02, flank: 0.9, window: 0.95, kite: 1,    items: 1,    dodge: 0.9,  third: 1,   tokens: 1.1, lead: 0.9 },
};
const lvlOf = n => LEVELS[n] || LEVELS.normal;
// the level of the i-th bot of a match: a fixed name, or 'mix' (easy, normal, hard in turn: the sim measures them side by side)
function lvlFor(mode, i) { if (mode === 'mix') return ['easy', 'normal', 'hard'][((i | 0) % 3 + 3) % 3]; return LEVELS[mode] ? mode : 'normal'; }

// ---- fight style by weapon: cb = items.js combat(key) ({dmg, range, cd, ranged, bolt?, bleed?}), fam = the weapon family.
// caster: wands and staves throw slow bolts (keep distance); archer: bows, crossbows, slings, knives (kite); poke: long reach (spears,
// halberds, whips: hit from the edge of the reach); heavy: slow swings (hammers, flails, ogre clubs: wait for the foe to whiff, then commit);
// quick: daggers (flank, stab from behind); brawler: everything else (orbit, punish whiffs).
function styleOf(cb, fam) {
  if (!cb) return 'brawler';
  if (cb.bolt) return 'caster';
  if (cb.ranged) return 'archer';
  if (cb.range >= 2.55 || fam === 'spear' || fam === 'halberd' || fam === 'whip') return 'poke';
  if (cb.cd >= 850) return 'heavy';
  if (cb.cd <= 460 || fam === 'dagger') return 'quick';
  return 'brawler';
}
// ms until a goblin can swing again (from the swing it was SEEN to make: every swing is broadcast)
const readyIn = (now, atkAt, cd) => Math.max(0, (atkAt || 0) + (cd || 600) * 0.9 - now);
// is (px, pz) behind a goblin at (tx, tz) facing tyaw? The same test server.js hitTarget uses for the Sneak's backstab.
const isBehind = (px, pz, tx, tz, tyaw) => (px - tx) * -Math.sin(tyaw || 0) + (pz - tz) * -Math.cos(tyaw || 0) < -0.3 * Math.hypot(px - tx, pz - tz);
// the spot d metres behind a goblin
const behindPoint = (tx, tz, tyaw, d) => [tx + Math.sin(tyaw || 0) * d, tz + Math.cos(tyaw || 0) * d];
// which way to circle to get behind: +1 / -1 in the bot's strafe convention (lateral = (-rz, rx) of the unit vector toward the target)
function flankSide(px, pz, tx, tz, tyaw) {
  const [bx, bz] = behindPoint(tx, tz, tyaw, 1), rx = tx - px, rz = tz - pz;
  return (-rz) * (bx - px) + rx * (bz - pz) >= 0 ? 1 : -1;
}

// ---- one fight decision. o: {style, d, reach (my hit reach, m), foeReach, foeRanged, ready (ms until I can swing), foeReady (ms until the foe can),
// behind (I am behind it now), wantFlank (the per-engagement flank roll: Sneaks only), useWindow (the per-engagement spacing roll, only once the foe has swung), kite (kite roll),
// waited (unused, kept for callers), rangeD (the archer's preferred range), orbitR (the brawler's orbit), hold (FAIR: stand off at holdR), holdR}
// -> {R: wanted distance, lat: share of the step that goes sideways, swing: swing now if it would land, flank: circle to the back, sprint: close fast, back: step away}
function fightPlan(o) {
  const out = { R: o.orbitR || 1.5, lat: 0.85, swing: false, flank: false, sprint: false, back: false };
  if (o.hold) { out.R = o.holdR || 3.6; out.lat = 0.5; return out; }
  const inReach = o.d <= o.reach - 0.05, ready = o.ready <= 0, foeMelee = !o.foeRanged, foeArmed = o.foeReady <= 120;
  switch (o.style) {
    case 'caster': case 'archer':
      out.R = o.rangeD || 6.5; out.lat = 0.7;
      if (o.kite && foeMelee && o.d < Math.max(3.5, o.foeReach + 1.4)) { out.back = true; out.sprint = o.d < o.foeReach + 0.6; out.lat = 0.35; }   // a melee foe closing in: back off first
      out.swing = ready && o.d <= o.reach;
      return out;
    default: {   // melee (poke, heavy, quick, brawler): spacing. Swing the moment a swing would land; while reloading, stand outside his reach if he can swing
      const quick = o.style === 'quick', heavy = o.style === 'heavy', edge = o.reach - (o.style === 'poke' ? 0.25 : 0.35), orbit = o.orbitR || 1.5, sp = !!o.useWindow;
      out.lat = o.style === 'poke' || heavy ? 0.6 : quick ? 0.9 : 0.85;
      out.swing = ready && inReach;
      if (!foeMelee) { out.R = 1.2; out.sprint = o.d > 2.5; return out; }   // a shooter: get on him
      if (!ready) {
        if (sp && foeArmed && o.d < o.foeReach + 0.15) { out.back = true; out.R = o.foeReach + 0.35; out.sprint = heavy; }   // reloading inside his reach: step out (a hammer reloads longest)
        else out.R = sp ? (foeArmed ? o.foeReach + 0.35 : edge - 0.2) : orbit;   // he can swing: wait outside; he is reloading too: stay close for the next swing
      } else {
        out.R = !sp ? orbit : o.foeReach < edge - 0.25 ? Math.max(o.foeReach + 0.3, edge - 0.15) : edge;   // ready: the edge of my reach (outside his when mine is longer: the spear's poke)
        if (heavy && sp && !foeArmed) { out.R = Math.min(out.R, 1.6); out.sprint = o.d > out.R + 0.8; }   // he just swung: commit the hammer
      }
      if (quick && o.wantFlank && !o.behind) { out.flank = true; out.lat = 1; out.R = Math.min(out.R, 1.4); }   // a Sneak circles to the back (+50% from behind)
      return out;
    }
  }
}
// ---- weapon value for equip and loot: damage per hit blended with damage per second (a swing that lands counts most), plus bleed, reach and range.
// it = the item, cb = combat(key). A staff that throws a 36 bolt is worth more than a 15 club; a dagger is not worth twice a sword.
function weaponScore(it, cb) {
  if (!it || it.type !== 'weapon' || !cb) return -1;
  const dmg = cb.bolt || Math.max(1, it.attack || 0), cd = Math.max(250, cb.cd || 600);
  let s = dmg * (0.5 + 0.5 * 600 / cd);
  if (cb.bleed) s += cb.bleed[0] * cb.bleed[1] * 0.6;
  if (cb.ranged || cb.bolt) s *= 1.1; else if (cb.range >= 2.55) s *= 1.08;
  return s;
}
// armour for a fighting style: items.js armorScore weighs health, speed (1% ~ 2% health) and thorns (1 ~ 6 health); kiters and flankers value speed more,
// brawlers and heavy hitters thorns. it = item {health, speed, thorns}.
function armorFor(it, style) {
  if (!it || it.type !== 'armor') return -1;
  const sp = (it.speed || 1) - 1, kite = style === 'archer' || style === 'caster' || style === 'quick', melee = style === 'brawler' || style === 'heavy';
  return it.health * (1 + (kite ? 3 : 2) * sp) + (it.thorns || 0) * (melee ? 8 : 4);
}
// which charm to wear: c = {hp, spd, dmg, gold, know, bribe} effects of one charm; who = {aggr, greed, caution, style}
function charmScore(c, who) {
  if (!c) return -1;
  let s = 0;
  if (c.hp) s += c.hp * (0.15 + 0.15 * (who.caution || 0));
  if (c.spd) s += (c.spd - 1) * 30 * (who.style === 'archer' || who.style === 'caster' || who.style === 'quick' ? 1.4 : 0.9);
  if (c.dmg) s += (c.dmg - 1) * 30 * (0.6 + 0.8 * (who.aggr || 0));
  if (c.gold) s += (c.gold - 1) * 6 * (who.greed || 0);
  if (c.know) s += (c.know - 1) * 2;
  if (c.bribe) s += (1 - c.bribe) * 3 * (who.greed || 0);
  return s;
}

// ---- consumables: what to use NOW (one item per decision). o = {hp, max, sudden, foes (seen in the last second, this room), near (m to the closest),
// hurtAgo (ms since the last hit), fleeing, pursued (a foe follows within 7 m), foeRanged, atDoor (within 2.5 m of the doorway it runs for),
// chase (the target runs and is low), cluster (foes within 2.5 m of where a bomb would land, 6 m ahead), still (that target is busy: claiming,
// channeling or fighting someone else), homeGuard (at its own home in the home phase, near the hatch, the arena about to open),
// heal (the HP of the best heal item, 0 = none), regen, smoke, bomb, trap, tonic, recall (have one), roll (0..1), items (level share)}
// -> 'heal' | 'regen' | 'smoke' | 'bomb' | 'trap' | 'tonic' | 'recall' | null
function useNow(o) {
  if (o.roll > o.items) return null;   // a weaker bot forgets its pockets now and then
  const f = o.hp / Math.max(1, o.max), miss = o.max - o.hp, quiet = (!o.foes || o.near > 7) && o.hurtAgo > 2500;
  if (!o.sudden && o.heal > 0) {
    if (f < 0.3 && (o.near > 3 || o.hurtAgo > 1500)) return 'heal';   // emergency: drink when not being hit this very moment
    if (quiet && (miss >= o.heal * 0.8 || f < 0.55)) return 'heal';   // patch up when safe, without wasting the potion (below 55% waste does not matter)
  }
  if (!o.sudden && o.regen && !o.foes && o.hurtAgo > 3500 && miss >= 10) return 'regen';   // a hit would end it: only when alone
  if (o.fleeing) {
    if (o.smoke && (o.foeRanged || o.near < 5) && o.foes) return 'smoke';
    if (o.trap && o.atDoor && o.pursued) return 'trap';
    if (o.tonic && o.pursued) return 'tonic';
    if (o.recall && !o.sudden && f < 0.35 && o.near > 6) return 'recall';
  }
  if (o.bomb && (o.cluster >= 2 || (o.cluster >= 1 && o.still))) return 'bomb';
  if (o.tonic && o.chase) return 'tonic';
  if (o.trap && o.homeGuard) return 'trap';
  return null;
}

// ---- target judgement on top of server.js pickTarget. o = {claimant (it is gaining the crown now), leader (it leads the crown claims), worn (someone else
// hit it in the last 2 s), hp (its HP fraction), truce (a live truce with it), traitor (it broke a truce), hitMe (it hit me lately), third (level appetite)}
// -> {adj (metres added to the score, negative = preferred), force (take it on even if it looks stronger), skip}
function targetAdj(o) {
  const out = { adj: 0, force: false, skip: false };
  if (o.truce && !o.hitMe && !o.traitor) { out.skip = true; return out; }
  if (o.newbie && !o.hitMe && !o.claimant) { if (o.round <= 3) { out.skip = true; return out; } out.adj += 2; }   // a new player (few wins) gets the first arena rounds to find his feet
  if (o.claimant) { out.adj -= 6; out.force = true; }                 // the crown claimant wins the match if nobody stops him
  else if (o.leader) out.adj -= 2;
  if (o.worn && o.hp < 0.45) { out.adj -= 3 * (o.third || 0); if (o.hp < 0.3 && o.third >= 0.5) out.force = true; }   // finish a goblin someone else wore down
  if (o.traitor) { out.adj -= 4; out.force = true; }
  return out;
}

// ---- the crown: stand on the dais and claim now? o = {round, sudden, sudRound, hp (fraction), foes (other goblins seen in the vault), onDais (another goblin
// is on the dais), mine (my claim ms), top (the best claim ms of anyone else), msLeft, aggr, wardens}
function claimNow(o) {
  if (o.onDais) return true;                                          // 2 on the dais freeze his claim
  if (o.sudden) return o.hp > 0.25;
  if (o.hp < 0.4) return false;
  if (o.wardens >= 2 && o.hp < 0.7) return false;
  if (o.round >= o.sudRound - 1) return o.hp > 0.5 || o.top > o.mine;   // late: the crown decides the match
  if (!o.foes) return o.round >= 2;                                   // nobody here: bank claim time (it is cumulative)
  return o.aggr > 0.6 && o.hp > 0.7;
}

// ---- leave this room now? o = {send (kind of a send telegraphed or running here: gas | rats | bell | spike | jam | leech), home (it is my home),
// hp, wardens, vault, claiming, alarm (heist alarm here), heistRisk (noise / resonance 0..100), vented, sudden}
// -> a reason string or null
function danger(o) {
  if (o.send === 'gas') return 'gas';
  if (o.send === 'rats' && (!o.home || o.hp < 0.4)) return 'rats';
  if (o.send === 'bell' && !o.vault) return 'bell';
  if (o.vault && o.wardens >= 2 && o.hp < 0.45 && !o.sudden && !o.claiming) return 'wardens';
  if ((o.alarm || o.heistRisk > 75) && o.hp < 0.5) return 'alarm';
  return null;
}

// ---- a bomb landing near me: step out? b = {x, z, r}; px, pz = me. Returns the unit escape vector [x, z] or null.
function bombDodge(b, px, pz) {
  const dx = px - b.x, dz = pz - b.z, d = Math.hypot(dx, dz);
  if (d > (b.r || 2.5) + 0.6) return null;
  return d < 0.05 ? [1, 0] : [dx / d, dz / d];
}

// ---- give up a chase? A bot that has run after the same goblin for long without landing a hit lets it go (no grief loops, no endless chases).
// o = {chaseMs, dealt (damage dealt to it in this engagement), fled (it left the room at least once), human}
const giveUp = o => o.chaseMs > (o.human ? 9000 : 14000) && o.dealt < 5 || (o.fled >= 2 && o.chaseMs > 6000);

// ---- a "Truce?" from a goblin (parley wheel, PLAN-fun 5): accepted with 0.7 - aggression (easier for easy bots, harder for hard ones). r = roll.
const truceAccept = (aggr, lvl, r) => r < Math.max(0.05, 0.7 - (aggr || 0) + (lvl === 'easy' ? 0.15 : lvl === 'hard' ? -0.1 : 0));

// ---- a sendable worth its elixir: homes = [{room, owner, kills, claim (crown claim s), dead, hops, me (it is my own)}], o = {elixir, round, reserve, sends (level share), roll}
// -> {id, room} or null. A Pump Leech on the leader's home (crown claim, then kills), else on a close neighbour.
function sendPick(homes, o) {
  if (o.round < 2 || o.roll > o.sends || o.elixir < 20 + (o.reserve || 0)) return null;
  let best = null, bs = -1e9;
  for (const h of homes || []) {
    if (h.dead || h.me) continue;
    const s = (h.claim || 0) * 0.6 + (h.kills || 0) * 2 - (h.hops || 0) * 0.4;
    if (s > bs) { bs = s; best = h; }
  }
  return best ? { id: 'leech', room: best.room } : null;
}

// ---- where to go next by memory: rooms where goblins were seen or heard lately (instead of knowing where everyone is).
// seen = {room: ms of the last sighting / sound}, now, mem (level ms) -> weight 0..1 for the room
// ---- nobody seen for a while (late rounds): where to look. o = {quiet (ms since a goblin was last seen or heard), round, hops (to the vault), visited (ms since this bot was in the room, null = never)}
// -> a pickDest bonus: toward the vault and its ring, and rooms it has not been in lately, so the late game does not stall with goblins idling apart.
function seekTerm(o) {
  if (o.round < 3 || o.quiet < 20000) return 0;
  const urge = Math.min(1, (o.quiet - 20000) / 30000 + 0.4);
  return urge * ((o.hops === 0 ? 3 : o.hops === 1 ? 2 : 0) + (o.visited == null || o.visited > 40000 ? 1.5 : 0));
}
const memWeight = (seen, room, now, mem) => { const t = seen && seen[room]; if (!t) return 0; const a = now - t; return a >= mem * 4 ? 0 : 1 - a / (mem * 4); };

const BG = { K, roomTerm, vaultWant, vaultVote, stepFactor, tapNow, pressOk, lantern, standPoint, inReach, watch, allDist, craftValue, persona,
  LEVELS, lvlOf, lvlFor, styleOf, readyIn, isBehind, behindPoint, flankSide, fightPlan, weaponScore, armorFor, charmScore, useNow, targetAdj, claimNow, danger, bombDodge, giveUp, truceAccept, sendPick, memWeight, seekTerm };
module.exports = BG;

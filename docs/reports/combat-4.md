# Combat 4: precise, fair hits

Code: `combat4.js` (new, shared by server and client: shapes, timing, projectile and line-of-sight math, guard hook), `server.js` COMBAT4 block (plus small tagged hooks in `attack`, `hitTarget`, `fireBolt`/`boltTick`, `applyMove`, the message handler and the tick), `game.js` COMBAT4 block (plus hooks in combatSwing/combatMsg/combatTick, vmSw, vmHit, the NET send, mouse look and the offline sim). Weapon numbers in items.js are untouched; optional per-weapon fields `windup, active, cleave, cleaveMul, kb, stag, weight, half, w, speed, g` can be added to `WEAPON_TUNE`.

## What changed
- **Damage on the contact frame.** A swing is wind-up, contact, active window, recovery, with the same timing table the first and third person clips use (`{swing, c4:[contact, dur, sq]}` lets observers time the clip). The server judges the blow at the contact frame and during the active window; each target once per swing; sweeps (sword, flail, halberd, hammer) cleave a 2nd goblin for 60 %.
- **Per family hit shapes** instead of "2.2 m and a 70 degree cone": sword/flail/halberd arcs, axe narrow chop, mace/club arcs, spear/dagger/whip/fist lines, hammer slam disc; vertical bands so climbing (p.y) works.
- **Rewind** samples the target at the attacker's render time at the contact frame (rt + contact, cap 200 ms). Mismatch fixes: the client sends the render time it really drew (`NETC.rt`), the server's still-then-moving hold entry matches the client's (50 ms, was a 1 ms jump).
- **Obstacles**: line of sight through the room grid (closed doors, walls), props with their heights, vault pillars. Hits across an OPEN doorway now work.
- **Real projectiles** for bows, crossbows, slings, thrown knives/axes: speed, gravity, swept capsule test against rewound targets, die on walls/props; pitch from the client (`pt`, `{aim}` at release), auto-aim for bots and old clients. Bolts: swept and rewound.
- **Stagger/knockback** for heavy families scaled by armour poise (stun-lock immunity 0.9 s), cancels the victim's wind-up; knockback validated (humans get the allowance, bots are pushed server side). Integrated with the abilities agent's heavy blow / dash / staggerUntil and the climb high ground.
- **Guard API**: `target.guard = {at, until, mul, parry, cone}` or `C4HOOKS.guard`; parry staggers the attacker (`{c4g}` cue).
- **Queue**: a human swing up to 120 ms early is queued, not dropped.
- **Client feel**: prediction at the contact frame (hit-stop, kick, shake by weapon weight, spark, sound, marker) confirmed by the server's hit (`sq`), rolled back silently by `{swr}`; pooled damage numbers/flashes/projectiles; crit/blocked colours; reticle turns warm when a swing would land; aim assist (max 6 deg pull in the wind-up, slight stickiness, `GK.settings.aimAssist=false` turns it off). `GK.c4.stats()`.

## Hit registration (tools/duelsim.js, 30 swings per row, victim strafing; "looks" = the strike touches the drawn target during the blow)
| ping attacker/victim | before reg / phantom | after reg / phantom |
|---|---|---|
| 0 / 0 | 70 % / 30 % | 95 % / 0 % |
| 100 / 100 | 74 % / 14 % | 100 % / 8 % |
| 200 / 200 | 89 % / 0 % | 100 % / 9 % |
| 200 / 20 | 76 % / 0 % | 94 % / 17 % |
| 20 / 200 | 70 % / 20 % | 91 % / 13 % |
Remaining misses: the 200 ms rewind cap (attacker 200 ms) and grazes at the shape edge. Brawl: 8 goblins, tick 1.3 ms, one swing look ~0.1 ms.

## Tests
`tests/combat4.test.js` (geometry per family, timing, projectiles, guard, door/crate/wall blocking, cleave without double hits, stagger, latency duels), brawl guard in `tests/netperf.test.js`; combat, netcode, armour3, useplus, utility, balance3 tests follow the contact frame. `npm test` (jobs 3): green except security static + release minified (worktree has no three/esbuild install; fail on the base too) and load flakes that pass alone (bots-combat, bots5).

Not done: headshot zones; third-person clip for knockback; visual check limited to one offline shot (`docs/screens/combat4-contact.jpg`).

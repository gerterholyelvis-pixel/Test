# Fun pass: pacing and economy

Code: `server.js` PACE-BEGIN/END block (plus 4 one-line hooks), two one-line client edits in `game.js` (`PACE` tags). Tests: `tests/pace.test.js` (3 cases). Nothing in `items.js` changed.

## What the numbers showed
A real-time probe (8 goblins, one idle human, default 30 s / 45 s rounds): 4 kills in the first 50 s of round 2, then the leading bot (3 kills) ran away with the early loot; with 4 left, rounds 4 and 5 went 35+ s with no contact and nothing opened up until sudden death at round 9 (about 6 minutes in). So: a hot start, snowballing early winners, dead time late, and gold with no income.

## Changes
1. **Kill bounty.** The killer takes half of the victim's gold plus 15 per kill the victim had (rounded to 5). The victim's gold is already lost on death, so this only redirects it. Beating a streaking goblin pays the most, which is a built-in comeback and a target on the leader. The kill toast reads "Goblin defeated! Kills: 2   +65 gold". Mystery enemies pay nothing.
2. **Round income.** Every living goblin gets +10 gold at the start of each round after round 1. Gold now keeps its purpose (merchant prices rise 10 % a round, bribes cost 50) instead of being a one-off 100.
3. **No dead round.** If a round ends with no votes at all, one random outer door of an occupied room opens (never a vault door, off in sudden death and under `doorclose`).
4. **Three-left showdown.** From round 3, once only three goblins are alive (4+ entered), every door opens each round (no sudden-death heal rule, no extra systems) and a toast says so: "THREE GOBLINS LEFT: every door is open!". It removes late hide-and-wait stalemates without waiting for round 9.

## Tested
`node tests/pace.test.js`: random door with no votes + income, bounty amount and message, showdown flag and all doors open. `tests/rules.test.js` doorclose-off case relaxed (a voteless round now opens one door). Full `npm test` in this worktree: bots tick-cost, speed-hack and staffbolt cases are load-flaky when run in parallel with other agents; security static cases (3 module missing, no node_modules in the worktree) fail on baseline too.

## Not done / for the owner
Not checked by eye in a browser. Bounty size and income are single constants in `PACE`. A true comeback item and a crown win remain owner calls.

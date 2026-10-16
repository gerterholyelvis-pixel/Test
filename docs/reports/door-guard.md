# Door guard: nobody stays locked in

## The problem
`m.open` is replaced at the end of every round by that round's picked doors, so a goblin who walked into a chest/mystery/merchant room (one door) or an outer room whose doors were not picked was shut in until the next round ended (30-45 s), and in the worst case again after that. A failed vault vote (only 1 room) fizzles and opens nothing, which also left voters locked in.

## The guarantee
Every occupied room except THE VAULT always has an open door to a non-vault neighbour, or gets one within `TRAP_MS` (5 s). Occupied = a living goblin (human or bot) who has entered. The vault keeps its own rule (2 votes); its occupants chose it.

How: `guardTick` in server.js (GUARD block, 200 ms) tracks the time each occupied room has had no open non-vault door. The human occupants get `{exitHint:{ms}}` (client toast "No way out: a door unlocks in 5 s"). When the grace runs out the room's own pick (else a random non-vault door of it) is added to `m.open` and stays open until the round ends (`{exitOpen}` toast "A door unlocks", round state rebroadcast). Timers reset each round. The door-control core is unchanged: votes, the 2-vote vault rule and PACE `paceNoDoor` still decide what opens; the guard only fills the gap, one door, after a visible delay.

Stuck-recovery: a goblin whose core (r 0.2) is inside a prop footprint for 1.5 s is moved to the nearest free spot in the same room and gets a `fix`. (No path currently puts anyone there; spawn points, door fronts and panels are already clear, this is a safety net.)

## Files
- `doorguard.js` (new, pure helpers: trapped, pickExit, freeSpot, constants)
- `server.js` (GUARD block after PACE, one call in the tick loop after ruleTick)
- `game.js` (two toasts after `applyRound`)
- `tests/doorguard.test.js`: static geometry (spawns 1500 samples/room, door fronts, panels, flood-fill reachability for every grid room and every chest room type), a 3000-round random vote simulation asserting no occupied room is locked in after the grace, and a live server test (GK_TRAP_MS override, GK_DEBUG only) that teleports a human into chest rooms and checks the hint, the unlock and the time to an exit.

## Notes
- Geometry was already clean: no prop blocks a spawn, door front or panel.
- Not covered: the offline demo (`?offline=1`) has its own door logic in game.js and was not changed. Vault occupants can still wait for a vault vote by design.
- `security.test.js` fails in this worktree only because `node_modules/three` is not installed here (404 for /three/three.module.js); unrelated.

# Server bots and mystery enemies (docs/DESIGN-core-loop.md sections 3 and 6)

Code: `server.js` block `BOTS-BEGIN/END` (after the NET block) plus small hooks (marked `isHum`/`humans`, `matchInfo`, `checkWin`, `attack`, `die`, `pub`, `snapshots`, `matchTick`, the 50 ms timer, `sendTo`). Client: `npcLook()` in game.js (next to `actors`) and one call where actors are created. `buildGoblin` and the lights are untouched.

## Filling the match
- `fillWithBots(m)` -> `fillBots(m)`: adds bots until the match has `CAP` goblins (8 in production; `GK_MATCH_SIZE` in debug, so existing tests with size 1/2/3 get no bots). Bots are normal player records: `bot:true`, `ws:null`, stored in `m.players` under a stub key `{readyState:0}`, so `bcast`/`sendTo`/snapshots skip them (`sendTo` also accepts a null socket now). Normal goblin odds (`rollGoblin`), `equip()` = START gear, goblin names (Snikt, Grubb, Mozzle, ...), an unused outer room each, `wins` = the human average.
- `pub()` of a bot adds `bot:1, name` (client: never shown over heads; for a future scoreboard). Mystery enemies add `npc:kind, name`.
- Queue: `MIN_START` is now 1 and `GK_QUEUE_MS` defaults to 15 s: after that the match starts with even one human, filled with bots. Debug override unchanged (`GK_QUEUE_MS`).
- Bots count for `alive`/"goblins left" and last-standing. `checkWin` only crowns a human; a bot standing last wins nothing. `leave()` now deletes the match when no human is left (bots do not keep a match alive).

## Brain (`botTick`, every ~95 ms per match, called from the global 50 ms timer)
- **Movement only through `applyMove`** (same validation: speed budget, walls, open doors, in-opening crossing). Steps are at most speed x dt (3.6-4.6 m/s). A refused move is counted (`botstat.bad`, test: 0) and re-plans. Furniture is not known to the server, so bots can walk through pillars (same as human validation).
- **Pathing**: `ADJ` graph from `DOOR_AT`; `bfsPath` over the match's open doors gives a list of rooms; each door edge has two waypoints (1.5 m in front of the doorway, 1.5 m behind it, on the door centre line), then a random point (1.5 m from walls) in the target room. In-room chase steps are clamped 0.5 m off the walls, so bots never stand inside walls.
- **Door vote**: once per round at a random moment, only if no human is in the room and nobody has voted there yet; same `m.sel[room] = door` as `sel`. Weights: unexplored outer (chest/mystery/merchant) rooms x3.5 in rounds 1-3, the vault door x7 after round 3 (x0.4 before), other doors towards the vault x4 after round 3.
- **Goals when idle** (`pickDest`, scores): unclaimed chest / weapon / armour / gold mystery rooms, the merchant while gold >= 20, the vault after round 3, rooms with living goblins from round 3, otherwise wandering in the room. `roomGoals` once per visit: `claim()`, or `buy()` the best upgrade they can afford; `lootNearby` walks to drop piles in the room (<= 18 m), eats brains and takes weapons/armour that are better (attack / health), `equipBest` equips through `move()`.
- **Combat**: living goblin or mystery enemy within 6 m in the same room -> approach (1.4 m melee, 5 m for bows), face it with aim jitter, swing through `attack()` (cooldown, range, cone, lag-comp unused). Flee towards the farthest open door at HP < 25 %. **No bot attacks in round 1 or in the first 20 s after GO** (`GK_BOT_GRACE_MS`, debug only, 0 in the tests). Reaction 200-400 ms, 4 % chance of a 0.3-0.8 s hesitation, 15 % of swings skipped.

## Mystery enemies (`mystery.kind === 'enemy'`)
- Spawned at GO (`spawnNpcs`) in the middle of their room as `npc:kind` records in `m.players`, `entered:true`. They use the same brain (`p.npc`): no grace period, never leave the room (they drift back home), never flee, other enemies are not targets. They do not count in `matchInfo` (size, alive), `checkWin`, `enteredEver`, snapshots recipients or `humans`.
- Stats: troll 160 HP / 28 dmg / 1.1 s / 3.0 m/s (rare, loot 2 items tier >= 2); archer 35 HP / 9 / bow, keeps 7 m; speedy 30 / 6 / 0.45 s / 6.4 m/s (loot tier >= 1); dumb 50 / 8 / 2.6 m/s, reaction 0.7-1.1 s; regular 40 / 10 / 4.2 m/s. `attack()` uses `npcDmg`/`npcCd` for them.
- Death (`dieNpc` via `die()`): removed from the match, `addDrop` of the loot, the killer's `kills` +1 (from `attack()`), no `deaths` increment.
- Client: normal goblin model (type look: troll = big goblin) cloned-material tint, troll x1.8; health bars come from the existing combat code. The static decoy enemy that the room builder draws in the room is still there (it was never removable); hiding it when `npc` exists is a follow-up.

## Numbers
`tests/bots.test.js` last run: bot sweep for 8 matches x 8 bots (64 bots, plus any mystery enemies): mean 0.7 ms per sweep (includes the hrtime overhead), max about 10 ms once (JIT/GC), limit asserted 2 ms mean. Measured inside the server (`{botstat:1}` debug message: sweeps, summed ms, max, refused moves).

## Tests
`tests/bots.test.js`: solo human -> 8 goblins (7 bots, names, types, gear, 8 distinct non-vault rooms, alive = 8); bots move legally (>= 5 of 7 move, at least one changes rooms through a door, no sample inside a wall, 0 refused moves); tick cost. `tests/bots-combat.test.js`: a bot walks to and kills a 10 HP human; a human with a slayer + aegis kills the last bot and gets `won`; a mystery enemy spawns (players list has `npc`), hits back, dies and drops loot, size/alive stay 1, no win. `tests/matchmaking.test.js` queue-timeout test updated (lone player starts with 7 bots, two humans get 6 bots, closed match takes no late joiners). `npm test`: 10 files, about 12 s.

## Not done / not verified
- No browser run: the client change (`npcLook`) is syntax-checked only. The offline demo still uses its own client-side bots.
- Bots do not use stations (recycler, bench, knowledge tree), do not throw or craft, and do not pick up gold piles.
- Bots do not avoid furniture; mystery enemies in a room with the static decoy overlap visually with it.
- Bot fights are not balanced; no scoreboard yet (the `bot:1` flag is in the players list for it).
- Mystery enemies spawn at GO, not on first entry.

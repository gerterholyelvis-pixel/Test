# Home phase: round 1 is spent at home

Owner request: "in the start round make it so I only have access to my start room first".

## The rule
- **Round 1 (the first 120 s) is the home phase.** Every home's hatch is shut, so nobody can leave their home and nobody can walk into one. Players use their bench, recycler, elixir pump, Elixir Screen and inventory.
- **Round 2 starts:** all hatches open, and each occupied home's arena cell gets one plain exit at once. The exit is the cell's round-1 pick if it has one, otherwise a random door that does not lead to the vault. So nobody waits 5 s in the cell.
- **From round 2 on,** the normal rules apply unchanged: votes, the 2-room vault rule, PACE `paceNoDoor` (no dead round), the door guard, showdown and sudden death.
- **Door-vote panels in round 1:** no one can reach a panel, so no votes happen. The round 1→2 transition still runs the normal tally on an empty `m.sel`, which leaves the PACE door plus the home-cell exits.
- **Sends** were already refused in round 1 (`homebase.js FIRST_SEND_ROUND = 2`). A Crowbar can never pry a hatch.

## Server (server.js)
- **`homeShut(m) = m.round === 1`.** `isOpen` returns `!homeShut(m)` for hatches and ignores `m.open` for them. Everything that walks or plans goes through `isOpen`, so they all refuse the hatch: `pathOk`/`applyMove` (humans and bots), `bfsPath`, `reach`, `follow`, `doorClamp`, act5 and elixir.
- **Debug teleports** (`{tp}`, `bot5Lab`) still place players anywhere under GK_DEBUG.
- **`roundState`** carries `homeLock: 1` during round 1.
- **`homeOpen(m)`** (GUARD block) runs right after `m.round++` into round 2.
- **`guardTick`:** in round 1 a goblin at home no longer counts as an occupant of its cell. The cell stays shut: no hint and no door ~5 s after GO, which was the old behaviour.
  - A goblin who is somehow in the arena in round 1 (debug teleport only) is still guarded.
  - From round 2 the guarantee is the same as before.
- **Bots (`station5`, BOTS5 block):** in round 1 a bot keeps its home goal. It recycles, brews, crafts, learns and equips, then potters about the home for 2.5-6 s and checks the bench again. `botHomes` empties the pump while it is there.
  - When round 2 starts, the bot leaves (`leaveWhy.arenaOpen`); a running craft finishes first.
  - `pickDest` is not called while the bot holds the goal.

## Client
- **`game.js`:**
  - Each hatch gets an iron grille (7 bars and 2 straps, one shared material) and a collision blocker. `d.locked` drops the grille; it rises into the lintel over 1.4 s when the arena opens.
  - The hatch stays "open" for portal culling and the lamps, so the cell is still seen through the bars.
  - The minimap shows hatches shut in round 1.
  - Under the timer a line reads "Prepare in your base: the arena opens in M:SS" (live countdown). At round 2 the big banner reads "THE ARENA IS OPEN".
- **`feel.js`:** the round 1 banner says "Prepare in your base", and a hatch plays the light door sound.
- **`index.html`:** themed style for the line, and a note in How to play.
- **Offline demo (`?offline=1`):** `homeLock` in round 1, simulated bots stay in their homes, and round 2 opens one door of each home's cell. Dev skip works.

## Tests
- **New `tests/homephase.test.js`:**
  - A real walk out through your own hatch is refused and corrected into the home.
  - A raider standing outside cannot walk in.
  - A hatch cannot be picked, and the cell stays shut.
  - `dbgFF` still works.
  - Round 2 has no `homeLock`, the cell gets a plain exit at once, and both walks succeed.
  - Bots: 7 bots stay in their own homes all of round 1 (snapshots), take home goals, `left = 0`, and at least 5 of 7 walk out after round 2 starts.
- **Updated tests:**
  - `doorguard`: the guard is exempt in the home phase, and round 2 opens a cell exit.
  - `pace`: home-cell exits at round 2; the dead-round door is checked at round 3.
  - `vault-open`: votes happen in round 2.
  - `elixir-home`: the lock/walk checks wait for round 2.
  - `bots5-sim`: one extra round (sudden 4, max 5) so the arena time is the same as before.
- **Verified in the browser pane, offline and online:** the grille, the banner and countdown, and the skip button. Round 2 raises the grille and shows the banner. No console errors.

## Sim (`node tests/sim-fairness.js bots5 20 30000 5`)
20 matches, 0 timeouts. Mean match 187 s, 6.55 rounds. Results compared with the report before the home phase:

| metric | before | now |
|---|---|---|
| how matches ended | 16 last standing / 4 crown | 16 last standing / 4 crown |
| vault opened before sudden death | 80% of matches, round 3.1 | 85% of matches, round 3.9 |
| tree / heist use | 90% / 100% | 90% / 100% |
| station uses per match | 4.7 | 10.9 |
| crafts per match | 0.1 | 0.45 |
| bots that left home | 100% | 100% |
| stuck / hard stuck | 0 / 0 | 0 / 0 |

The vault now opens about one round later, because the first round is spent at home.

Winner home slots 0-7 were 1 2 2 3 5 1 2 4.

Timing could not be measured fairly: the machine ran about 20 other node processes. The sweep was over budget both with and without the home phase; in an A/B run of `bots5-sim`, the version without the home phase was worse. Rerun `bots`, `bots5-sim` and the sim on a quiet machine.

## Balance: decision for the owner (not changed)
Rounds stay at 120 s, sudden death after round 5, decided after round 7, so a match is still at most 14 min. Arena time before sudden death drops from 10 min (rounds 1-5) to 8 min (rounds 2-5).

A level-1 pump makes 1 elixir per 5 s, so a 120 s home round yields about 24 elixir: about 2 Healing Draughts or one or two cheap upgrades. You start with no junk and no parts, so the bench has little to do. Two minutes at home will feel long.

**Suggestion:** make round 1 60 s, a one-line change to `R1` in `newMatch`. Alternatively shift the schedule to sudden death after round 6 and the decision after round 8 (16 min) to keep 10 min of open arena.

## Notes for the merger
- I created a gitignored `node_modules` junction in this worktree for the browser check; it is not committed.
- `security` static tests fail in worktrees without `node_modules/three`. Timing tests (`bots` tick cost, the `security` sprinter, `combat`, `balance`) flake under load.

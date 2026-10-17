# Doors stay open; round 2 opens only each hall

Owner requests:
1. A door that has opened stays open for the rest of the match.
2. Round 1 stays home-only. Round 2 opens only the single arena cell (the "hall") behind each home.

## The rule (server.js, DOORS-PERSIST)
- **`m.open` is everything that stands open right now.** At each round end it becomes the old set, plus this round's new doors, plus `m.shut`. This is done in `ruleOpen` (default branch).
- **What can open a door, for good:**
  - votes, including the 2-room vault rule
  - a Broken vault door
  - the crown alarm
  - the Crowbar
  - the Door Wedge
  - the guard
  - the PACE door
  - showdown and sudden death
- **Votes only add doors.** A `{sel}` on a door that is already open (or barred) is ignored. Bots give such a door 0 weight, and the vote5 co-op skips an open vault door.
- **Vault bars:** the owner decided that occupants CAN bar a door.
  - A finished 5 s bar takes its open vault door out of `m.open` at once and puts it in `m.shut` (`act5.js barDoors`).
  - The door reopens at the round end. `roundState` carries `shut`.
  - Bars cannot be used during the alarm, in sudden death, or on a Broken door.
  - The alarm reopens a barred door and clears pending bars.
- **Crown alarm:** the doors it forces open stay open. They no longer close again 10 s later.
- **Door Wedge (new meaning):** use it beside a SHUT door (not the Vault). The door opens for good at the round end, so it works as one extra pick.
- **Crowbar:** pries a door open for good, at once. It no longer slams shut.
- **Sealing Wax and Vault Lockpick:** unchanged.
- **`doorclose` rule (off by default):** keeps the old behaviour (doors close after 2 rounds, the alarm closes its doors, the Crowbar slams shut). Votes on open doors stay allowed under it.
- **Round 1 → 2:** there is no PACE door. Round 2 therefore opens only the hatches, so each player gets home + hall. `homeOpen` (one exit per hall) is removed.
- **Guard (`guardOpts`):** in round 2 it skips homes and the 8 home cells. Each hall votes its way out at its panel, and the pick opens at the end of round 2. From round 3 the exit guarantee is back as before.
  - A hall that did not vote gets one door after 5 s.
  - `pickExit` never picks a loot door for a cell. A loot room is reached through its parent cell's vote.
- **`paceNoDoor`:** only picks doors that are still shut.

## Client
- **Panels:**
  - an open door reads "OPEN FOR GOOD"
  - a barred door reads "BARRED · REOPENS AT 0:00"
  - E on an open door is refused, and there is no "Select door" prompt for it
- **Wall maps:** open doors are drawn live as green bars, barred doors in amber. The legend says "Open door". Last-pick arrows show only for picks that did not open.
- **Minimap:** the same arrow filter. A barred door shows in amber, and the big-map caption is updated.
- **Round 2:**
  - the line under the timer reads "Pick a door on your hall's panel: it opens in M:SS"
  - the banner reads "YOUR HALL IS OPEN"
  - the feel banner reads "Vote your way out", and later rounds read "N doors open for good"
- **Offline demo:** uses the same rules. There is no round-2 exit, and bots skip doors that are already open.
- **Text updated:** items.js (Wedge, Crowbar), TIPS, How to Play, index.html note, codex (`tools/gameinfo.js` with `CELL_ROUND`, regenerated), PLAN-5x5 sections 1.4 and 5.2, FEATURES.

## Tests
- **New `doors-persist`:**
  - map reachability, including loot rooms through their parent cell
  - a 2000-match × 7-round pure simulation: the open set never shrinks, the guard never touches a hall in round 2, nobody stays trapped from round 3
  - live: round 2 opens nothing, even after the grace time
  - live: 7 rounds where the open set only grows and a vote on an open door is ignored
  - live: a vault bar shuts a door at once and it reopens at the round end
- **Updated:** doorguard, homephase, pace, rules, utility (Wedge), useplus (Crowbar), vault-fizzle.
- **Full run (`GK_TEST_JOBS=3`):** the failures were act5-trees, act5ui, bots-ai, bots (cost) and doorguard. All pass when rerun alone, after the doorguard timing fix.
- **Sim:** `node tests/sim-fairness.js bots5 10 20000 5`, before → after.

  | metric | before | after |
  |---|---|---|
  | vault opened before sudden death | 80% of matches, round 4.6 | 70% of matches, round 5 |
  | stuck | 0 | 0 |
  | timeouts | 0 | 0 |
  | bots that left home | all | all |
  | tree / heist use | similar | similar |

- **Browser check:** round 2 started with `open []`. All 8 halls had a door at round 3. About 23 doors were open by round 5 on 25 s rounds. No console errors.

## Balance notes for the owner
- Round 2 is now about 2 minutes alone in home + hall. Consider shortening round 2.
- The map opens up steadily (votes add up), so the late rounds are very open.

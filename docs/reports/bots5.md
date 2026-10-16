# Bots 5x5 (task G)

The 8 bots now play the 5x5 game. Pure scoring lives in the new `botgoals.js`. The server side is the `BOTS5-BEGIN/END` block in server.js (inside BOTS), plus one-line `BOTS5` hooks in `pickDest`, `voteDoor`, `roomGoals`, `botThink` and the message handler. No act5, elixir or vault blocks were edited.

## What bots do
- **Home routine.** A bot goes home when it has work (2 or more junk items, or a craftable upgrade), when it is hurt (below 45% HP, outside sudden death), or when its pump is full (the elixir block's `botHomeWant`). At home, `station5` makes one panel action per beat:
  - recycles through the player path, `homeRecycle`, with Refine when it holds 16 or more elixir;
  - brews a Healing Draught when it carries no heal;
  - crafts the best upgrade the bench allows and waits out `craftMs` (a hit or leaving cancels it);
  - learns perks, equips its best gear, and rests until 75% HP.
- **Master Forge and Grand Recycler.** The Forge is a goal when the master bench (with its bonus tier) can craft an upgrade. The Grand Recycler is a goal when the bot has junk, and it is preferred over home within 3 hops. Other players' homes are never a goal.
- **Tree rooms and heists.** The room's own bot hints (`spec.bot.score/next/maxStay`, `VB5.botHint`) drive the bot. Every verb goes through `A5.act`, the same path a human uses: reach checks, rate limit and caps all apply.
  - Tree timing presses wait for the window when the skill roll (0.45 + 0.3 × skill) says hit.
  - Channels hold still until they finish.
  - The Memory Tree touches lanterns using the same roll.
  - Heists include light sabotage: about 22% of bots are spoilers, who snuff, counter-writ or barricade.
  - Cautious bots leave a heist when its noise, alarm or resonance is high.
- **Vault votes (2-room rule).** A bot gives a vault door weight when another room already votes vault, when a heist here adds weight, or when it can bribe or pick the lock. It votes in every room it passes, not only once per round. Co-op: in a vaultbreaker room it switches a bot pick to the vault door to complete the rule. When the vault still lacks votes, it uses its lockpick or bribes.
- **In the vault.** It contests a claimant on the dais (2 goblins on the dais freeze the claim), and claims the crown itself from round 4 on and in sudden death. It also scoops the coffers and stays inside for the treasury.
- **Avoidance and re-plans.**
  - In sudden death, vented rooms score −6.
  - When the bot is hurt, rooms with wardens lower its wish to enter the vault.
  - When the vaultbreakers re-key, a bot whose goal was a type follows that type to its new room.
- **Stuck watchdog.** A bot that wants to move but has not moved 1 m in 6 s drops its route and goal.
- **Cost.** `BS.f5` tracks the cost of each feature. GK_DEBUG `{bot5:1}` returns stats, and `{bot5:{goal}}` is a test lab.

## Simulation (`node tests/sim-fairness.js bots5 20 30000 5`)
Setup: 20 all-bot matches, 7 bots each (the watcher dies at GO), 30 s rounds, sudden death after round 5, decided after round 7.

| metric | value |
|---|---|
| match length | 185 s mean, 6.5 rounds |
| timeouts | 0 |
| how matches ended | 16 last standing, 4 crown decision |
| winner home slots 0-7 | 2 1 3 2 3 1 5 3 |
| vault opened before sudden death | 80% of matches, mean round 3.1 |
| matches with tree use / heist use | 90% / 100% |
| bots using trees / heists per match | 1.6 / 2.1 |
| station visits per match | 4.7 |
| crafts per match | 0.1 |
| co-op vault votes per match | 1.75 |
| bribes per match | 1.25 |
| bots that left home | 100% |
| stuck recoveries / hard stuck | 0 / 0 |
| bot sweep | 0.87 ms (5 matches in parallel) |

## Tests
- `tests/botgoals.test.js` (pure): includes timing presses checked against the real `activity.js` judge.
- `tests/bots5.test.js` (lab): home recycling, a Well drink, a full Keystone circuit, a dais claim.
- `tests/bots5-sim.test.js`: 2 short matches. Checks that each match ends, every bot leaves home, bots use activity rooms, nobody is hard stuck, each feature costs under 0.5 ms per sweep, and there are no act5 errors.
- `tests/bots.test.js`: adds a per-feature cost check.
- `tests/armour3.test.js`: the thorns test moved out of tree room 6. Some rolled tree types put a corner post at its old spot (a flake caused by main's room art).
- Full `npm test` (GK_TEST_JOBS=3): only the 2 environmental `security` static cases fail (no `node_modules/three` in a worktree).

## Not done / notes
- Crafting is rare (0.1 per match): bots die fast in short sim rounds, and junk recycled at home only yields 50%.
- No elixir "oil the lock" bribe (there is no human path for it yet). No home sendables. No pre-positioning on `vbNext`.
- The sim uses 30 s rounds, so the time limit is rarely reached. With real 2-minute rounds, expect more crown decisions.
- `GK_B5LOG=<type|station|pick>` (GK_DEBUG) traces one activity.

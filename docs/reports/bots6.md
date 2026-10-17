# Bots 6: smarter, more human bots

Code: pure helpers in `botgoals.js` (BOTS6 section), server block `BOTS6-BEGIN/END` in server.js plus one-line hooks tagged BOTS6 in the BOTS, AI, FAIR and BOTS5 code. `GK_BOTS6=0` switches all of it off (the old bots, for A/B). `GK_BOT_LEVEL=easy|normal|hard|mix` sets the level (default normal; `m.botLvl` can override per match for lobbies).

## What changed
- **Skill levels** (`BG.LEVELS`, the PLAN-fun table): notice 1.2/0.7/0.45 s, misses 45/30/15 %, reaction, aim error, press skill, sabotage share, memory, hearing range, and how often each tactic or item is used.
- **No cheating:** the hunt term no longer reads where every goblin is. Bots hunt rooms where they saw or heard goblins (fights are heard through walls, 7/10/14 m). Swings, tosses, traps and telegraphs are public, so bots may react to them.
- **Fights (`BG.fightPlan`):**
  - Melee spacing: a bot swings the moment a swing would land, and steps out of the foe's reach while it reloads.
  - Spears and whips poke from beyond a shorter reach. Hammers commit right after the foe swings.
  - Sneaks flank for the backstab. Bows and wands kite melee foes, and wands lead their bolts.
- **Gear:** weapons are valued by damage per hit and per second, plus bleed, reach and bolts, so staves are no longer worth 0. Armour is chosen by fighting style. Charms suit the personality.
- **Items (`BG.useNow`):** all go through `useItem`. Bots heal when safe, or in an emergency, never in sudden death. They also use smoke, tonic, a trap in the doorway, or the feather when fleeing, bombs on groups or on a busy goblin, and a trap at the hatch at the start of round 2.
  - Fixed: bots never drank Draughts or Bandages (`healValue` read a missing field), and `botHeal` skipped the sudden-death and cooldown rules.
- **Judgement:** bots go for the crown claimant first, then the leader, and finish goblins someone else has worn down. They give up fruitless chases. Truces and traitors are handled (`botTruce`, ready for the parley wheel).
- **Retreat and return:** bots retreat, heal and come back (regroup). They defend their home when its alarm sees an intruder.
- **Danger:** bots leave telegraphed gas, rats or a bell, warden packs and loud heists when hurt, and step out of bombs.
- **Vault claim timing (`BG.claimNow`):** late rounds, contesting, banking claim time in an empty vault.
- **Sends:** Pump Leech on the leader from the Elixir Screen.
- **QA fixes:**
  - Humans with fewer than 3 wins are left alone in rounds 2-3 unless they attack (`GK_NEWBIE_WINS`; off under GK_DEBUG).
  - In round 3+, after 20 s with nobody seen, bots seek toward the vault ring and rooms they have not visited (`BG.seekTerm`).
- **Doors-persist:** all route checks use `isOpen`. Nothing reads `m.open` semantics except a stat.

## Numbers
**Duels** (`node tests/sim-duel.js 20 6`): same weapon, Knight's Plate, no fleeing.
- New fight code against old: **130-90 (59 %)**.
  - bullwhip 85 %, sword 70 %, pike 65 %, spear, bow 60 %
  - hammer, sling, wand 55 %, maul, dagger 50 %, mace 45 %
- Control, old against old: 45 %.

**Sims:** 40 all-bot matches with 30 s rounds (`GK_BOT_LEVEL=mix node tests/sim-fairness.js bots5 40 30000 5`), new bots against `GK_BOTS6=0`.

| | new (mix) | old |
|---|---|---|
| match length | 176 s, 6.25 rounds | 175 s, 6.33 rounds |
| ends | 31 last standing, 9 crown | 36 last standing, 2 crown, 2 other |
| matches with a crown claim / mean top claim | 95 % / 19 s | |
| tree / heist users per match | 3.3 / 2.3 | 2.5 / 1.8 |
| stuck / hard stuck | 0 / 0 | 0.03 / 0 |
| bot sweep (machine fully loaded) | 1.02 ms | 0.93 ms |

Per level (wins per bot, kills, deaths per bot):
- easy: 0.08, 0.63, 0.88
- normal: 0.19, 0.91, 0.78
- hard: 0.19, 1.19, 0.78

Tallies: 175 heals, 229 flank swings, 621 swings in the foe's reload window, 28 kites, 32 chases given up, 68 regroups.

## Tests
- `tests/bots6.test.js`: pure, every helper.
- `tests/bots6-lab.test.js`: live server.
  - A bot drinks its draught when safe.
  - It leaves a gassed room.
  - It dodges a bomb.
  - The mix levels are dealt.
  - The duel harness runs.
- `npm test` (GK_TEST_JOBS=3) passes except the environmental `security` static cases (no node_modules/three in a worktree). `bots5` dais failed once, was fixed (claim order), and passes alone.

## Not done / notes
- Sends happened 0 times and bomb dodges 0 times in the sim: bots rarely hold 28 elixir or carry bombs in 30 s rounds. Both are covered by unit and lab tests.
- Hard bots win as often as normal ones (more kills, same deaths). Tuning hard further is a balance call.
- AFK takeover, raids on other homes and the newcomer Easy neighbourhood are not built.
- Not seen in a browser.

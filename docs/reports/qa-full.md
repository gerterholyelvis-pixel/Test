# QA full: end-to-end playtest of the merged 5x5 game

## Method
- **Browser:** a real server on a random port and a headless Edge on the AMD iGPU (ANGLE D3D11), driven with trusted CDP input: keys, mouse, clicks.
  - The driver and its helpers are in `tools/qa/` (`drv.js`, `q.js`, `go.js`, `walk.js`, `near.js`, `timing.js`, `fight.js`). They are documented in `docs/PLAYTEST.md`.
  - The view was turned by setting yaw (the mouse look).
  - Teleports (`{tp}`, GK_DEBUG) were used only to reach rooms quickly in solo matches.
- **Matches played:**
  - real 8-goblin matches with bots: 2-minute rounds, played to Match Over, then Requeue
  - solo debug matches with 10-minute rounds, at 1280x720 (Medium) and 1920x1080 (Low)
- **Screens:** `docs/screens/qa-full-*.jpg`.

**Covered:**
- the menu: every button
- queue, wheel and load-in
- round 1 at home: recycler, bench, pump, Elixir Screen (all 3 tabs), inventory, scoreboard
- the grille rising at round 2
- walking through hatches and doors, a door vote, and the door opening next round
- loot rooms: merchant (buy), chest, mystery, Master Forge, Grand Recycler
- the Sapling Well: crank, 3 timed presses, drink (+3 knowledge)
- Keystone: light a stone
- the vault: coffer scoop +12 gold, crown claim, Vault Warden
- melee vs bots and a warden
- death card, spectate, Match Over, Requeue
- reload and resume mid-match

Console: no errors, only an ANGLE D3D shader-compiler warning, X4122. The server log had no exceptions.

## Fixed (regression test in `tests/qa-full.test.js` unless noted)
1. **The merchant could not be opened with E.** `else openShop(...)` had slipped into a `//` comment in `stationInteract`. E on a merchant did nothing. The test runs the real function with stubs.
2. **The Elixir Screen ignored E**, although its footer says "E close". Its capture handler swallowed the key. Fixed in `homeui.js`.
3. **Clicks never swung when the browser refused pointer lock.** Each click reset the refusal before the swing check, so only a granted lock could attack. Fixed in game.js with `lockPrevRefused`.
4. **The pump, screen and lockbox prompts showed at 7 m and then answered "Too far".** Now they show only inside the server's reach (`homebase.inReach`, 0.2 m inside the server gates).
5. **Home toasts covered the round timer.** They now start at 17vh.
6. **Round 2 stacked three banners into one block.** "Vault re-keyed" now waits 3.4 s for the round banners.
7. **The crown claim list sat mid-screen all match after any claim.** Now it shows only while someone gains, during the alarm, or in the vault.
8. **Prompts at the Master Forge and the Grand Recycler** now name the station.
9. **How to Play, tips and Controls described the 3x3 game.**
   - How to Play: five new panels (home phase, doors, loot/trees/heists, crown and time limit, death).
   - The `home` tip shows in round 1. The door tips wait for the arena.
   - Controls now list click, R/Q, B and `.
10. **Small fixes:**
    - "YOU DIED" wrapped at 1080p.
    - The `favicon.ico` 404.
    - `tests/run.js` now counts a printed FAIL. Before, fskeep and hud5 could fail silently.

## The two reported tests
- **`security` "legit sprinter".** This was real.
  - Cause: a server stall or a TCP burst delivers several moves at once. With the 1.0 m movement bank they were refused (15 fixes at one spot).
  - The perf-4 merge on main already fixes it (`BURST` 2.0 m plus stall credit). It passes 5 of 5 alone and passed in the full run.
- **`utility` "nothing left".** This was a test flake.
  - Cause: `use()` read replies after a fixed 120 ms, which a loaded machine misses.
  - Fix: it now waits up to 2 s for `used` / `useFail`. The bandage test takes about 7 s instead of 5 s.

## Full `npm test` (GK_TEST_JOBS=3, machine shared with other agents)
6 files failed under load:
- act5-crown
- act5-trees (`cool`)
- bots and bots5-sim (sweep 9.8 ms / 0.88 ms against budgets of 2 / 0.5 ms)
- combat
- elixir-home (lock timing)

All 6 pass alone, so these are load flakes. The bot-cost budgets cannot hold while about 14 agents share the CPU.

## Not fixed (for the owner or the next pass)
- **Bots kill a new player fast.** I died within about 40 s of the arena opening, in 4 of 4 bot matches.
  - Bots craft Twin Fangs or Spiked Maces at home in round 1.
  - Bot rounds 4-5 then idled with 5 alive for 4 minutes. That is dull to spectate.
- **The Match Over card does not say why the winner won** (claim, kills or HP).
- **Spectating and the death card:**
  - The elixir counter stays visible.
  - A solo debug death reads "1st of 1".
- **Feedback on kick and cheat surface:**
  - A movement kick shows only "Connection lost".
  - The client receives mystery-room contents before anyone enters (readable in the console).
- **Odd panels:**
  - The Brew row shows on the bench of merchant and mystery rooms.
  - The recycler header says "Pick a weapon" for armour too.
- **Ping reads 50-150 ms on localhost**, probably the 20 Hz tick plus frame time. It reads 200-470 ms right after load or resume.
- **Performance:**
  - Medium at 1280x720: 43-51 fps.
  - Low at 1080p in the vault: 52 fps (127 calls).
  - The first seconds after load-in dip to about 9 fps (shader compile). Measured on a shared iGPU.
- **Not tested:** real audio, physical mouse/keyboard with pointer lock, a second human, sends between players, the bow in a real fight, all 10 tree types (only the Well; the others are covered by the server tests).

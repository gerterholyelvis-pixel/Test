# Playtest guide

How to run Goblin King and what to try in a first session. Written after the full end-to-end QA pass (`docs/reports/qa-full.md`).

## Run it
1. `npm install` (once), then `npm start`.
2. Open http://localhost:3000 in Chrome or Edge. Press **F** for fullscreen.
3. Press **Start**. The wheel rolls your goblin. After 15 s the empty slots fill with server bots, so you always get an 8-goblin match.

Useful variants:
- **Faster testing:** `GK_DEBUG=1 npm start`. A **Skip to 0:10** button appears next to the round timer.
  - `GK_QUEUE_MS=3000` starts the match after 3 s.
  - `GK_MATCH_SIZE=1` gives a solo match with no bots, which is handy for looking at rooms in peace.
  - `GK_ROUND_MS=600000 GK_NEXT_ROUND_MS=600000` gives 10-minute rounds.
- **Offline demo:** http://localhost:3000/?offline=1 (no server match, simulated bots).
- **Other port:** `PORT=4000 npm start`.
- **Production:** set `GK_SECRET` (keeps saved characters valid across restarts) and `GK_ORIGINS`.

## Controls
| key | action |
|---|---|
| WASD, Shift, Space | move, sprint, jump (the jump is just for show) |
| Mouse | look around (click once to capture the mouse) |
| Left click | attack; hold it to keep swinging |
| E | interact: door panel, merchant, bench, recycler, pump, Elixir Screen, loot, tree and heist stations. Some stations need E held. E also closes every panel. |
| R / Q | second and third action at tree, heist and vault stations (shown under the E prompt) |
| Tab or I | inventory |
| 1 2 3 | quick slots |
| B | bribe at a door panel (50 gold, +1 vote) |
| ` (hold) | scoreboard |
| M | big map |
| V | overview camera |
| 4-7 | emotes |
| F | fullscreen (hold Esc to leave it) |

## How a match goes
- **Round 1 (2 min): the home phase.** You are locked in your home behind an iron grille. Do these things:
  - Collect elixir at the **pump**. Walk close and the prompt appears.
  - Spend it on the **Elixir Screen**: BASE upgrades, SECURITY, and SEND (sends start in round 2).
  - Craft at the **bench**.
  - Recycle junk in the **recycler**.
- **Round 2: the arena opens.** The grille rises and your cell gets one exit.
  - From now on, every room votes on **one door** at its panel (a big screen on the north wall). Picked doors open when the timer hits 0.
  - **Vault doors need picks from two different rooms.**
- **The 5x5 arena:**
  - The outer ring has plain halls.
  - The **4 tree rooms** (inner corners) are activities: Well, Spring, Seer, Memory Tree and so on. They give knowledge, potions and blessings.
  - The **4 heist rooms** around the vault (Ram, Locksmith, Counting House, Keystone) help open or break the vault. They move every round (the "Vault re-keyed" strip).
  - **THE VAULT** is in the middle. It has gold coffers (hold E), the relic, and the **crown dais**.
  - Side rooms hold chests, mystery rooms, merchants, the **Master Forge** and the **Grand Recycler**.
- **Winning:**
  - The last goblin standing wins.
  - From round 6 the outer rooms vent (sudden death) and only the vault heals.
  - After round 7 the biggest **crown claim** wins (at least 5 s on the dais), then kills, then health.
- **Death loses everything** you carry. You can spectate, requeue, or go back to the menu.

## What to try (and what to look for)
1. **Every menu button:** Start, Characters, Stats, Inventory, Settings, Controls, How to play, Codex (opens a new tab).
2. **Home phase:**
   - Pump: the prompt appears within about 2.3 m.
   - Elixir Screen: buy Pump II.
   - Bench: Brew a Healing Draught.
   - Recycler.
   - Tab inventory.
3. **Round 2:**
   - Walk out and vote on a door at your room's panel.
   - Check at the next round that the door opened.
4. **A merchant room:** press E on the merchant and buy something.
5. **A tree room:** at the Sapling Well, press E to crank, press E with the needle in the green three times, then E to drink (+knowledge).
6. **A heist room:** at Keystone, hold E on the lit stone.
7. **The vault:** hold E at a coffer (+12 gold); stand on the dais (crown claim; Vault Wardens rise from the grate).
8. **Combat:** fight the bots with melee and a bow. A real mouse with pointer lock is the normal case.
9. **Reconnect:** reload the page mid-match. You are back in the same match within 15 s.
10. **The end of the match:** die, spectate, wait for the Match Over card, then Requeue.

## Known issues (open)
See `docs/reports/qa-full.md`, section "Not fixed".

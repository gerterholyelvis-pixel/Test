# Balance 3: duel simulator, retune, damage cap, dash and heavy blow

## Simulator
`tools/balsim.js` (`node tools/balsim.js` prints every table) is pure, seeded and fast (~5 s). It uses the real rules from items.js: `combat()`, `goblinHit()`, `goblinHp()`, hit radius, reach, thorns, bleed, bolts, regeneration, charms, `capHit()` and `ABIL`.

How a fight is modelled:
- Two goblins start 7 m apart in a 15 m room.
- The goblin with the shorter reach sprints in. The longer reach backs off until the wall, then circles at 55% effect.
- 25% of blows miss. A bolt misses more often the farther it flies.
- Backstab lands on 20% of the sneak's melee blows.
- Bots-style use of the dash and the heavy blow.
- Sides swap every fight, so neither side gets a first-move bias.

Guards in `tests/balance3.test.js`:
- Every weapon and armour wins at least 50% against the tier below and at most 50% against the tier above.
- Inside its tier a weapon wins 25-75% (the Wooden Stick is exempt as the junk item).
- A transcendent weapon wins at most 96% against legendary gear.

In `tests/goblin-types.test.js`, all 12 goblins must win 42-58% with their start kit and 40-60% with even gear.

## Goblins (field win rate, start kit)
| | small | medium | big | wizard | king | scout | sneak | miner | shaman | berserker | bog | hob |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before | 31 | 57 | **96** | **7** | 45 | 53 | 61 | 63 | 51 | 57 | 56 | 36 |
| after | 50 | 49 | 50 | 52 | 52 | 51 | 46 | 55 | 51 | 48 | 52 | 49 |

With even gear (four mid kits) every type now wins 47-57%. Before, the scout won 93%, the shaman 29% and the miner 37%.

Changes:
- **Start kits**
  - Small: Ragged Tunic -> Hide Jerkin.
  - Big: Warlord Harness -> Leather Scraps (keeps the mace).
  - Scout: Scrap Cleaver + Bone Plate.
  - Miner: Fur Mantle.
  - Shaman: Hide Jerkin.
  - Berserker: club + Bone Plate.
  - Hob: Ragged Tunic.
- **Health bonus**
  - Scout 22 -> 0, Sneak -4 -> -10, Miner -12 -> -4.
  - Berserker -12 -> -7, Bog 0 -> -2, Hob 4 -> 0.
- **Perks**
  - Nimble 1/8 -> 1/12.
  - Rage x1.35 -> x1.3.
  - Thick hide -15% -> -10%.
- **Staff bolt and King**
  - Staff bolt 9 / 1.0 s -> 16 / 0.9 s (`items.js STAFF_BOLT`, which server `BOLT` now reads).
  - Royal Mantle 100 -> 63.

## Weapons (attack / cooldown; dps counts bleed)
| weapon | before | after | dps before -> after |
|---|---|---|---|
| Gilded Lash | 62 / 450 ms, bleed 6x3 | 50 / 500 ms, bleed 5x3 | 144 -> 105 |
| Shadowfang (dagger cd 450 -> 500) | 90 | 80 | 200 -> 160 |
| Goblin Slayer | 110 | 80 | 183 -> 133 |
| Iron Sword / Battle Axe / Claymore | 24 / 30 / 56 | 17 / 25 / 48 | |
| Wyrmfang / Executioner | 64 / 75 | 58 / 66 | |
| Longbow | cd 700 | cd 950 | 54 -> 40 |
| Arbalest | 66 / 1700 ms | 84 / 1050 ms | 39 -> 80 |
| Siege Maul / Ogre Club / Ball and Chain | 72/1300, 40/1000, cd 1150 | 80/1200, 44/950, cd 1050 | |
| Ember / Storm / Sunspire bolt | 12, 36/1100, 95/1000 | 16, 42/1000, 115/900 | |
| Hand Crossbow, Throwing Knives, Trident, Glaive, Scrap Cleaver | 14, 8, 21, 38, 14 | 16, 11, 18, 35, 13 | |

Ladder before:
- Longbow beat the legendary field (62%).
- Arbalest lost to the mythic field (43%).
- In-tier win rates ran from 13% to 82%.

Ladder after:
- Every weapon beats the tier below and loses to the tier above.
- In-tier win rates run from 31% to 73%.
- Transcendent weapons win 86-94% against legendary gear.

Armour: only the Gravewalker Shroud was off the ladder (it lost to mythic armour). Its health goes 100 -> 125, keeping its +10% speed. Light armours sit low in duels by design, because they pay in speed.

## Damage stacking
Before, one blow could stack up to **x3.6**: Wolf Fang and Rage Brew (x1.4), backstab x1.5, Fury x1.15 and the Oak ambush x1.5. The heavy blow would have taken it to x5.8.

Now `DMG_CAP = 1.75`: no blow carries more than x1.75 of its bare weapon damage. `capHit` applies this in `hitTarget` for melee hits, bolts and bleeds. Thick hide still applies after the cap.

## New rules and abilities
- **Point blank:** bows, crossbows, slings and thrown weapons hit for 70% inside 2 m. This gives melee a reason to close in.
- **Dash** (double-tap a direction, or C):
  - 3.2 m in 0.2 s, on a 3 s cooldown.
  - For 250 ms every blow misses, and the dodge is broadcast.
  - The server grants a one-time movement allowance (`dashBank` in applyMove) and still checks walls and doors.
- **Heavy blow** (hold the right mouse button; hammer, axe, mace, club, flail):
  - The 0.55 s wind-up is broadcast, and other goblins see a crouch and lean-back.
  - The goblin moves at 60% while winding up.
  - The blow does x1.45-1.6 damage and staggers the target for 0.4 s (no attacks).
  - It also breaks the target's own wind-up.
  - The next swing comes after half the cooldown.
  - A dash dodges it.
- **Bots:**
  - They sidestep wind-ups, dash in on archers and wizards, and dash away when hurt.
  - They wind up heavy blows, and still miss on purpose.
- **Perk cues:** hits carry `bs` (backstab) or `rage`. The client shows a small "backstab", "rage" or "stagger" word, only to the two goblins involved. A lone `{dodge}` message is now shown; before, it was dropped.
- **Codex:** `tools/gameinfo.js` lists the abilities, the damage cap and point blank under combat facts, all read from `items.js ABIL`.

## Economy (measured, not changed)
- **Elixir:** the base pump makes 24 per round and 168 per 7-round match. The whole home tree costs 440, so a goblin buys about a third of it. Pump level 2 pays back in about 3.3 rounds, level 3 in about 4.5. That is fine early, and a late buy is a deliberate trade.
- **Gold:** 100 to start, plus 10 a round, plus bounties (half the victim's gold plus 15 per kill they made).
- **Average shop prices:**

| tier | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| price (gold) | 56 | 72 | 134 | 219 | 275 |

  A tier 3-4 purchase needs a kill or a heist. Nothing looked like a runaway.
- **Recycler and craft loops:** still capped by `recycleFor`.

Not modelled: tree-room knowledge per minute, heist and vault rewards, sendables, and comeback chance. Those need the bot match sim (`node tests/sim-fairness.js bots5`), which I did not rerun.

## Tested
- `npm test` with GK_TEST_JOBS=3: all 68 files green.
- New `balance3.test.js` (9 cases): the ladders, the cap, the ability data, dash i-frames and cooldown, the dash movement allowance, heavy damage and stagger, an early release, point blank, the backstab cue.
- The client loads offline with no console errors.
- **Not verified by eye:** how the dash and the wind-up feel in play. There is also no cooldown indicator; I left it out on purpose to avoid HUD clutter.

## For the merger
- server.js: `BALANCE-3` and `ABILITY` tags in attack, hitTarget, fireBolt/boltTick, bleed, applyMove (`db`), botFight, and the message switch (`dash`/`charge`, `atk.heavy`). The `ABILITY-BEGIN` block sits after WEAPONS3.
- game.js: an `ABILITY-BEGIN` block before `frame()`, plus three one-line hooks (the movement line, the message dispatch, and the `a.chg` pose).
- New keys and inputs: C and the right mouse button. The canvas context menu is now suppressed.

# QA pass 2 (Sonnet worker): solo matches against server bots

Setup: `GK_DEBUG=1 GK_QUEUE_MS=2000` (and 9000 / 12000 for the two-tab run), own port 3110, headless Chrome (software GL, Low preset, resolution scale 0.3, so blur is expected) driven over the DevTools protocol on port 9444. About six solo matches and one two-tab match (one tab forced to the King with `GK.start({goblin:4})`). Sudden death and the round-10 decision were skipped as asked. Time-based features (bots voting, fights) were observed through the scoreboard and round state, not frame by frame.

## Fixed (one commit each, on worker-qa)
- `686f06e` The "E Select door" prompt no longer covers the door panel: while aiming at a panel it sits above the hotbar (`feel.js`, class `low`). Checked live: prompt top 422 px, panel bottom ~400 px at 1264x625 (`docs/screens/qa2-panel-prompt.jpg`).
- `3efc930` After death or a win the top-left label said "Connecting..." for the rest of the session; it now says "You are out" / "You won".

## Worked as designed (no change)
- Queue -> wheel -> match found -> world load -> countdown -> GO -> round 1 timer: ~19 s end to end with a 2 s queue; movement locked until GO (`GK.locked`).
- Bots filled the match to 8 and voted for doors in round 1 already (`sel` had 7 rooms); scoreboard (hold backquote) lists bots with a BOT tag, kills, alive/dead, "Goblins left".
- Door intel arrows and "Last picks" legend appear on the wall map from round 2; picker badge ("PICKED BY ROOM n") on the door panel.
- Brain: `give m:brain:80` then eat: knowledge 40 -> 44 (+5%); glow level function goes 0.20 -> 0.31.
- King marker: for a second tab as King in a neighbouring room the crown sprite exists, is visible and has opacity 0.70 (read from the scene). I did not get a clean screenshot of it.
- Death screen (stats, dropped items incl. brain), SPECTATE, Left/Right switching ("Spectating Nobb" -> "Spectating Yibb"), kill feed row ("Nobb smashed Zug with a Spiked Mace").
- Viewmodel renders for all 13 weapon families (`docs/screens/qa2-viewmodels.jpg`).
- Room art pass 3 floor details (path, trail, teeth, ear-ring) are visible in the bot match; no console errors in any run.

## Issues (severity, repro)
| # | Sev | Issue | Repro |
|---|-----|-------|-------|
| 1 | high | A match with only two bots left never ends: round 12 and still 2 goblins alive 3+ minutes after my death, only one door open, they never meet. Spectators wait forever (the sudden-death work should cover it). | solo match, `GK.fun.debugKill()` after round 6, spectate, wait |
| 2 | medium | Spectator camera can look at a blank wall or the ceiling (orbit camera outside the room / pointing into a wall), see `docs/screens/qa2-spectate-wall.jpg`. | die, SPECTATE, press Right a few times |
| 3 | medium | The world loads and the countdown starts before the wheel finishes (ready cap ~6 s), so the player never sees which goblin they rolled; the wheel is still spinning when the match starts. The queue box also shows "GOBLINS FOUND. LOADING IN 0:00" for the whole load. | press Start with `GK_QUEUE_MS=2000` |
| 4 | medium | Bow viewmodel shows only a vertical stick in the hand (limbs cropped or missing); crossbow is flat and mostly hidden behind the fist; spear head is tiny; axe head is clipped at the top-left. | `GK.vm.setWeapon('w:bow')` in a match |
| 5 | medium | A wizard (staff, 0 damage, 60 HP) died 13 s after GO in a mystery room with a "regular" enemy; small goblins die within a minute in most runs. Probably intended, but a wizard has no way to fight back (0 attack). | tp into an enemy mystery room right after GO |
| 6 | low | Death screen "Distance travelled 0 m" and "Survived" are fine, but a player who is teleported (debug) is not counted; only a test artifact. | |
| 7 | low | The "Died in Treasure room" label is used for mystery rooms too. | die in a mystery room |
| 8 | low | Mystery enemy spawn/loot: after teleporting into an enemy room the client had no actor tagged `npc` after 1.5 s, yet something killed the player within 13 s; I could not confirm the spawn on entry, the enemy's loot drop, or bots looting. Not verified. | see #5 |
| 9 | low | Wall map legend text and the panel header are unreadable at the 0.3 resolution scale I used; not judged. | |
| info | | Not verified: audio, real mouse-look, real 60 fps feel, King marker as a picture, enemy loot, bots picking up loot, bot voting weights, mid-match requeue flow, 1920x1080. |

Housekeeping: my Chrome debug port first collided with another session's (9333); I moved to 9444.

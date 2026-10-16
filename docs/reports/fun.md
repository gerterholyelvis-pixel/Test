# Phase 3 fun: kill feed, scoreboard, spectating, match summary

Code: server.js block `FUN-BEGIN/END` (before COMBAT) plus small hooks; game.js block `FUN-BEGIN/END` after `GK.showDeathScreen` (`GK.fun`), with hooks in `makeNet` (name in the join query), `handleMsg0` (`GK.fun.onMsg`), the npc actor creation (decoy hide), `showDeathScreen` (SPECTATE button) and `frame` (spectator camera). `buildGoblin`, ROOMART and lights are untouched.

## Server messages
- `{feed:{k,v,w,f[,npc:1]}}`: killer name, victim name, weapon name, weapon family (`fist` unarmed). Mystery-enemy kills: `k` is the enemy name, `npc:1`. Sent from `attack()` before `die()`.
- `{board:{left, rows:[[id,name,goblin,kills,alive,wins,bot]]}}`: sent at GO, on every death/leave and when an enemy dies (dead goblins stay in the rows).
- `{matchEnd:{winner,top,longest,places:[{id,name,goblin,bot,place,kills,secs}],size}}`: to everyone in the match and all spectators when a human wins, or when the last bot decides a match that only spectators are left in.
- Names: `pub()` now carries `name` for everyone. The join query `name=` (sanitized, 14 chars) is used if present, otherwise a goblin name from the bot pool; duplicates inside a match are renamed at match start and bots avoid taken names. Client passes the saved character's name (`GKSAVE.getCharacter(GK.charId)`).

## Spectators
`die()` no longer drops the socket: the dead human goes into `m.specs` (ws -> player) and stays subscribed. `bcast` and `snapshots` also go to `m.specs` (snapshots with every mover), pings are still answered. `leave()` keeps a match with only bots alive while spectators exist (`humans==0` alone no longer deletes it); the socket close removes the spectator and deletes the match when nobody is left. `checkWin`: a human who is the last living goblin wins as before; if no human is playing and at most one goblin lives, `endMatch(m,null)` is sent to the spectators.

Placement: winner is #1, then other survivors by kills, then the dead, last to die first. "Longest survivor" is the best-placed non-winner by time alive (the winner survives by definition). Bots are never tagged in the summary, only on the scoreboard.

## Client
- Kill feed: top right, 5 rows, fades after 6 s; verbs: stabbed (dagger, spear), sliced (sword, axe, halberd), smashed (club, mace, hammer, flail), shot (bow, crossbow), zapped (staff, scepter), punched; enemies: mauled / shot down / shredded. Your own rows are gold-edged.
- Scoreboard: hold Backquote (also while dead): name, type, kills, alive/dead, victories, BOT tag, "Goblins left".
- Death screen: SPECTATE button. Third-person orbit camera follows the killer first (if it is a goblin or enemy actor), then Left/Right (or A/D, or the arrow buttons) cycle living goblins; drag the mouse to orbit; auto-switches when the followed goblin dies. Bar: "Spectating Snikt" with REQUEUE and MAIN MENU. Hidden in the offline demo.
- Match summary card (CLOSE / REQUEUE / MAIN MENU): winner, top killer, longest survivor, your place "#3 of 8", full standings.

## Bot gaps (docs/reports/bots.md)
- Mystery enemies spawn when a human or bot first enters their room (`noteRoom` from `applyMove` and the debug teleport), not at GO. They appear through the normal `players` broadcast.
- The static decoy model (`mystery-enemy` root) near the NPC is hidden when the NPC actor appears.

## Tests
`tests/fun.test.js` (3 humans, no bots): names and uniqueness, board at GO, feed fields, board after a kill, spectator snapshots after death with the socket open, win -> `matchEnd` identical for winner and both spectators, placements; solo human + bot: debug kill -> `died`, socket stays open, `matchEnd` with the bot as winner. `tests/bots-combat.test.js` updated: no enemy before entering the room, spawn after a teleport into it. `npm test`: 11 files green.

## Browser check (PORT=3130, GK_DEBUG=1, GK_QUEUE_MS=2000)
Solo match with 7 bots: scoreboard, death via debug kill, SPECTATE (follows a living goblin), live feed row. No new console errors (one stale ERR_CONNECTION_REFUSED from a server run without node_modules/three). Screens: `docs/screens/fun-scoreboard.jpg`, `fun-spectate.jpg`, `fun-feed.jpg`.

## Not done / notes
- Not browser-tested: the matchEnd card, the enemy decoy hiding, the death screen with a killer that is an enemy, camera collision with walls (the camera can sit outside a room wall).
- The top-left "Connecting..." text after death is old behaviour (own actor removed).
- Spectators of a bot-only finale get no time limit; bots decide the match.
- `GK.fun.debugKill()` is a test hook (needs a GK_DEBUG server).
- In a worktree `node_modules/three` is missing; run the server with a junction to the main checkout's `node_modules`.

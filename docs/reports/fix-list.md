# What needs fixing: Goblin King status report (2026-10-16)

_Status tags added by the playtest pass later the same day; see docs/reports/security.md, balance.md, feel-2.md._

This comes from a full audit: every QA and feature report, a code scan, `npm test` (17/17 pass), and a simulation of 20 matches with garbage and malformed input. That simulation produced no crash, and memory went from 63.5 to 65.8 MB, so there's no real leak.

## Fix before anyone else plays (security)
1. [DONE] **Clients choose their own goblin type and victory count.** The `?goblin=` and `?wins=` URL values are trusted (server.js ~884). Anyone can pick the King or fake their victory count to game matchmaking. **Fix:** the server rolls the goblin and keeps victories server-side, or a signed token proves them.
2. [DONE] **No connection limits.** There's no WebSocket origin check, no per-IP cap and no cap on total matches. One script can open thousands of sockets. **Fix:** check the origin, allow about 8 connections per IP, and set a global match cap.
3. [DONE] **Static file serving reads from disk on every request** (three.js is 1 MB+). A missing file can crash the server, and any unknown URL returns 200. **Fix:** cache the files at startup, add try/catch, return 404 for unknown paths, and send security headers.
4. [DONE] **Small speed hacks go uncaught.** Moving just under the speed cap isn't detected. **Fix:** tighten the movement budget, and kick players who keep getting corrected.

## Hurts fun and fairness
5. [ADDRESSED: vault-only healing, bot gang cap, misses] **Sudden death is a death sentence.** With every door open, even a fully geared player dies by round 3-4 in short-round tests. **Fix:** tune how bots converge, or add a safe zone or regen in the vault.
6. [DONE: staffbolt on, 9 dmg] **Wizards can't fight**, because their staff does 0 damage. The `staffbolt` rule fixes this once the owner decides.
7. **Reloading the page doesn't resume a match.** The reconnect token only works for the in-page retry. **Fix:** resume from sessionStorage on page load. **[fixed: reload-resume.md]**
8. **Bots walk through pillars and furniture**, because the server only knows the walls. **Fix:** add furniture boxes to world.js.
9. [PARTLY: 2-hop culling cap on Low/Medium] **Draw calls spike late in a match.** With every door open in sudden death, room culling shows all 21 rooms (2,500-3,500 calls, even on Low). **Fix:** a distance cull or lower detail for far rooms.

## Medium
10. [DONE] Matches that are only bots plus one spectator who never leaves can live forever. **Fix:** a hard match lifetime (20 min).
11. [DONE: capped, decided matches torn down] Loot piles (`drops`) and the `dead` list grow without a cap during a match. **Fix:** cap them and prune empty piles.
12. Loot pile meshes are never disposed (game.js ~3879). This is harmless today because each page runs one match, but it would leak if requeue ever stops reloading.
13. The spectator-camera fix and the experimental rules (crown, bribe, door closing, staff bolt) are only tested on the server, not by eye in play.

## Polish
14. The death card always says "Treasure room", even for mystery rooms.
15. The vault-open tip never shows, because other tips always win.
16. The E prompt keeps old text while hidden.
17. [DONE] Add a profanity filter for names before going public.

## Never tested for real
Audio output, a real 8-human match, 60 fps on a gaming GPU, real high-ping and packet-loss behaviour (all tests ran at about 1 ms), every screen at 1080p, emote poses seen by other players, and the plushie lure on a live bot.

## To scale to a "huge" game (later)
The server is one process holding all state in memory, so it can't grow past one machine as it is. The plan: one process per group of matches behind a load balancer that keeps each player on the same process, a separate matchmaker, and accounts with a real database so characters, victories and stash live server-side. That last part also fixes item 1.

## Owner decisions
These are covered in HANDOFF.md. You can try a–c with `GK_RULES=...`.
a. Win condition: last-standing plus sudden death, or the crown win.
b. Wizard staff bolt.
c. Doors closing, bribes, Jam Spike.
d. Starting gold, how stash items enter a run, and crafting tiers 1-5.
e. Cream or white rooms.
f. Should anyone be able to survive sudden death?
g. Do players choose their goblin, or does the server roll it? (This ties to item 1.)

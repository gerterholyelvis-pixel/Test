# Stats page (owner request: "give me a stats page of the game")

A **Stats** screen on the title menu (between Characters and Inventory) with the player's lifetime numbers, stored locally in the browser.

## What the player sees
- Four headline tiles: matches, wins (with win rate), kills (with deaths), kill/death.
- Four grouped lists: Survival (win streak now/best, rounds survived total/best, average match, longest survival, time played), Combat (damage dealt/taken, kills per match, matches left early), Economy (gold earned/spent, elixir collected, items crafted/recycled), Special rooms (vault claims, crown wins, tree rooms used, heists tried), plus Personal bests (most kills, rounds, longest survival, best streak, fastest win, most gold, most damage).
- Goblins: favourite goblin, an SVG bar chart (wins vs other results for all 12 types) and a per-goblin table (matches, wins, win %, kills).
- Recent matches (last 10): when, goblin, place / size, kills, rounds survived, how it ended (last standing, crowned, alive at the time limit, beaten to the crown, killed by X, left early).
- Reset stats: an in-page confirmation bar (Keep stats focused, Esc cancels). Characters and stash are never touched.
- Death and victory cards get one compact "This match / Lifetime" line (`.st-last`).
- Keyboard: Up/Down on the main menu reaches Stats; the sheet is focusable and scrolls with the arrow keys; Esc goes back (first closes the confirmation).

## Files
- `stats.js` (new, UMD, pure): blank / normalize (versioned, sanitising) / begin / event / finish / refine / derived. `window.GKSTATS` and `module.exports`.
- `statsui.js` (new): recorder (`GKSTATSUI.onMsg`, called once from game.js) and the page renderer.
- `save.js`: `STATS` block, own key `gk.stats.v1` (try/catch, in-memory fallback). `GKSAVE.stats / saveStats / clearStats`. The old `gk.save.v1` (stash, characters) is untouched and `clearAll()` does not clear stats.
- `index.html`: `STATS` CSS block (UI-SYSTEM tokens), `#p-stats` markup, Stats button, two script tags. Main menu buttons are a little lower (`--h` 6.7vh, max 58px) so seven entries clear the footer at 1080p.
- `menu.js` (small `STATS` block): panel wiring, confirmation, Esc handling. `game.js`: one line in the message handler. `server.js`: `CLIENT_JS` gets `stats`, `statsui`.
- `server.js` `STATS-BEGIN/END` block + five one-line hooks (see below).
- `tests/stats.test.js` (new, 9 tests).

## Where each number comes from
Client, from messages it already gets (`matchStart`, `resumed`, `round`, `kills`, `crafted`, `recycled`, `board`, `actMe`, `countdown`, `died`, `won`, `matchEnd`):
matches, wins, deaths, kills, rounds, time, placement, crafted, recycled, vault claims (rising edge of `actMe.claim`), tree rooms and heists (a room counts once per match when a channel or timing attempt starts in it; kind from `GK.hud5.S.vb / trees`), crown wins (`matchEnd.crown` with me as winner), recent list.

Server (only it knows): damage dealt and taken, gold earned and spent, elixir collected, and the round of death or win. New `STATS` block in server.js: `p.st5` tallies, hooks `statInit` (player setup), `statGold` (inside `sendGold`: any sent change of gold counts as earned or spent), `statHit` (in `hitTarget`: real health lost to melee, bolts, bleed; not thorns or room hazards), `statElx` (pump, flask pickup). The block `{dd,dt,ge,gs,ex,rd}` goes out in `died.st`, `won.st` and `matchEnd.stats[playerId]` (humans only). Existing messages only gain fields.

## Rules and decisions
- **Offline demo (`?offline=1`) is not recorded at all** (the recorder is inert there), so demo play cannot inflate real stats. The empty state says so.
- **A match is recorded once.** `finish` is idempotent: the first of died / won / matchEnd closes it; a later `matchEnd` after a death only `refine`s placement and size. The winner receives `matchEnd` before `won`, both carry the same block.
- **Reconnects and reloads:** the live match is saved after every event (board updates throttled to 2 s). A reload with a fresh resume token (same rule as save.js, 15 s) continues the same record on `resumed`; otherwise the unfinished match is settled as "left early" (a loss, not a death, placement unknown, rounds survived = round - 1, time up to the last event) when the page next loads or the next match begins.
- Rounds survived: a win counts the round it was won in, a death or quit round - 1, alive when the time limit or another goblin's crown ended it counts the round.
- Match clock starts at GO (server countdown corrected for clock skew), not in the lobby.
- Bot-filled matches count like any other. Win streak resets on any non-win (quit included).
- Limits: two tabs share one storage key and the last writer wins; stats are per browser; storage that is full or blocked falls back to memory for the session; environmental damage (vents, ram) is not counted as damage taken.

## Tests
`node tests/stats.test.js`: normalize junk and future versions, death / win / crown / quit totals and streaks, recent list cap, live-event edge cases, begin / resume / refine, client glue run against stubbed browser globals (message flow, offline not recorded, reload settles a quit, resume continues), storage fallbacks (corrupt json, blocked localStorage, old save untouched), and a server integration test (3 players: `died.st`, `won.st`, `matchEnd.stats`, damage dealt = damage taken by victims, gold earned/spent via the debug gold command).
Not covered by a test: elixir tally (pump and flask hooks are one-liners, checked by reading only) and the render function (checked in a browser).

## Verified in a browser (headless Chrome, 1920x1080, 1100x640, 700x700)
Screens in `docs/screens/stats-*.jpg`: main menu, empty state, top / goblins / recent, reset confirmation, small window, narrow window, death card line. A real match against a local server (`GK_DEBUG`, one bot) was recorded end to end (live record while playing, death stored, placement refined by matchEnd). No console errors.

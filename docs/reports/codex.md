# Goblin King Codex (stats page)

Owner request: "a stats page like info of everything: items, goblins, percentages, etc". The codex now documents the whole game, generated from the real code, never hand-copied.

## What it is
- `npm run gameinfo` (`node tools/gameinfo.js`) writes `docs/game-info.html`: one self-contained file (data and script inline) with 13 tabs: Overview, Match, Goblins (12), Weapons (48), Armour (44), Items (38 consumables, charms, tokens), Recipes (55, stations, recycler yields), Knowledge (tiers, 9 perks, reforge costs, points per goblin), Rooms (25 arena cells, 16 attached rooms, layout odds, mystery contents and enemies), Trees (10 rooms, blessings, every constant), Vault (4 vaultbreakers, the vault, tokens, every constant), Home (pump, 14 upgrade levels, sinks, 6 sendables), Loot (tier bands, pools, price formulas).
- Global search across every tab, sortable tables, per-table filter, percentage bars, links between related things (item to recipe to knowledge tier to perk, goblin to starting gear, tree to the items it makes, heist to its token), light/dark tokens and a theme button, phone layout.
- Reachable in game: a **Codex** button in the main menu (`index.html` `<!-- CODEX -->`, handler in `menu.js` tagged CODEX) opens `/codex` in a new tab.

## Where the numbers come from
`tools/gameinfo.js` requires items.js, world.js, elixir.js, homebase.js, activity.js, rooms5-trees.js, vb5.js and vault5.js directly. Values that live only in server.js (PACE, BOLT, BRIBE, the NPC table, round length, sudden-death round, vision, station types) are read out of its source with `srvConst(name)`, which finds `const NAME = ...` and evaluates it with the GK_DEBUG switches off, so it reports the production default. A handful of private tables of items.js (LOOT_ROLL, TIER_MULT, mystery enemy weights, shop swap chances) are read by regex. If any is renamed the generator throws, so it cannot silently go stale. Odds that are not stored anywhere (a tree type's real chance to appear in a match, the odds of each loot room type) come from running the real `rollTrees` / `randomLayout` 20000 times with a fixed seed (stable output).

Round 1 as a home-only phase is not in this build and `docs/reports/home-phase.md` did not exist. The page says so and will switch automatically once that report or a `HOME_PHASE*` constant exists in server.js (see `homePhaseDoc` / `homePhaseConst`; adjust that detection to the real name when the feature lands). PACE income in code is 10 gold per round (PLAN-5x5 text says 20); the page shows the code value.

## Serving and CSP
`server.js` CODEX block: `/codex` (and `/codex/`) serves docs/game-info.html. The page carries a source hash (sha1 of the generator inputs, line-ending independent); at start the server rebuilds and rewrites the file when the hash no longer matches or the file is missing (a read-only disk serves from memory). Under `GK_DEBUG` the build is deferred to the first visit so the tests start fast. The response has its own CSP: the normal policy with `script-src 'self'` plus the sha256 of the page's one inline script (no unsafe-inline). Cache-Control no-cache. The fonts link is allowed by the existing style/font rules.

## Menu layout
Seven menu buttons did not fit a 1280x720 window (the last one hung off the bottom), so `index.html` has a tagged CSS rule making rows and gaps slightly shorter (`--h: clamp(34px,5.6vh,60px)`); eight buttons (when the Stats button lands) still fit at 720 px high. Menu entry delays for buttons 7 and 8 were added.

## Tests
`tests/gameinfo.test.js` (9 checks): every weapon, armour, consumable, charm, recipe, goblin, perk, tree, vaultbreaker, upgrade level and send is present and nothing extra; damage, reach, swing, DPS, price, health, thorns, odds, recipe cost and perk text match the modules; odds sum to 100; server.js constants agree with the shared modules (round length, sudden-death round, last round); every tree, vaultbreaker and vault constant is on the page; every link points at an existing row; the page is one file whose script parses; `/codex` returns 200 with a CSP hash that matches the inline script; the menu button exists. `tests/security.test.js` allow-list gained `/codex`.

## Notes for the merger
- Regenerate with `npm run gameinfo` after merging items.js/server.js changes and commit docs/game-info.html (the server also rebuilds it in memory/on disk at start, so a stale committed copy is harmless, just a diff).
- Not tested: the menu button click in a real browser (the headless pane renders the WebGL menu black; the button position was measured by script) and `npm test` was only partly green under load: the bot-tick-cost and timing tests (bots, bots5-sim, elixir-home lock timing, speed-hack) fail when the machine is busy and pass alone; the 11 tests I touched or that touch static routes (gameinfo, security) pass alone.
- The worktree had no node_modules (the server's three.js route 404s without it); I linked it for testing, it is gitignored.
- Screens: docs/screens/codex-desktop-goblins.jpg, codex-desktop-vault.jpg, codex-phone-trees.jpg, codex-phone-search.jpg.

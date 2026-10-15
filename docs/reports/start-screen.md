# Start screen: Characters + Inventory

Files: index.html (markup/CSS), menu.js. Not committed.

Built
- Main menu: Start, Characters, Inventory, Settings, Controls (keyboard nav and Esc work for all).
- Characters panel: cards sorted by victories desc, canvas portrait (shared drawHead via headCanvas), name, goblin type, trophy + VICTORIES count, PLAY -> startGame({goblin,wins,charId}) -> GK.start(opts). Empty state text, matchmaking note.
- Inventory panel: 8x6+ slot grid (scrolls), GKICONS icons, gold hover, tier-coloured borders and Tier N corner badge, tooltip "Tier 5 · Transcendent · Attack 90", "N items brought back" summary, Parts row (GKSAVE.parts + GKITEMS.PARTS, small drawn icons), empty state.
- Requeue: sessionStorage gk.requeue + gk.requeueChar starts that saved character (try/catch, keys removed).
- GK.menuDebug.addDemoSave() (manual only).

Tests (playwright, port 3713, scratchpad/menu_panels_test.js)
- Panels render at 1000x640 and 640x360; Esc returns to main; no page errors.
- PLAY on the 3-win Big Goblin: ws url ?goblin=2&wins=3, wheel landed on 2, __gk.actors goblin 2.

Not checked
- gk.requeueChar path, keyboard arrow nav inside Characters, inventory at 640x360 after the tier badge change, character cards showing gear (not implemented).
- Stash entries that are brains (m:brain:*) use the generic icon fallback.

# Inventory, hotbar, victory, shop, recycler, workbench, loot/brain UI (game.js client)

All code is in `game.js` (client only; server.js, index.html and menu.js untouched). Offline demo: `/?offline=1`.

## Built
- Hotbar (keys 1-3, wheel; pressing the selected slot's key eats a brain), inventory screen (Tab/I, Esc, pointer-lock release; 3x3 backpack, weapon/armour slots with type validation + red flash, quick slots, stats column, gold, materials row, EAT/DROP buttons, tier badges `T0-T5` coloured by tier name). Optimistic `{mv}`/`{drop}`/`{eat}`, reconciled by `{inv}`. `invOpen`/`shopOpen` freeze movement and mouse look.
- Stats HUD (server `stats`/`gear`, inventory, tiers, gold, materials, knowledge with 1 decimal), lobby line from `{match}`, `wins` in the WebSocket query.
- Drops use item keys (`infoOf(key)` also resolves brains); loot pile rebuilt when contents change; pink brain mesh on top of piles; prompt "Press E to loot" within 2.5 m, loot panel with TAKE / EAT / TAKE ALL sending `{loot:[dropId,idx,mode,expectedKey]}`, refreshed by `{drops}`, `{lootFail}`.
- Eating: `{eat:slot}`, `{ate}` shows a floating "+N knowledge" and flashes the knowledge stat.
- Merchant shop, recycler and workbench panels opened by clicking (ray from screen centre, 7 m) objects in `GK.merchantTargets` / `GK.stationTargets` (`userData.station` 'recycler'|'workbench', `userData.roomId`); crosshair grows and a tooltip shows. Gold, materials (9 canvas part icons), `{recycle}`, `{craft}`, `{buy}` and their replies/fail messages; fly-in and pop animations.
- Victory screen (`{won}`; items with tiers, gold, materials; `GKSAVE.recordWin({charId,goblin,items,parts})` once; QUEUE AGAIN sets `gk.requeue` and `gk.requeueChar`), death screen states everything is lost and lists the brain.
- Offline simulation parity: per-player inventory, stats, wins within +-1, `{match}`, `{inv}`, `{gold}`, `{parts}`, `{shops}`, drops, eat/loot/recycle/craft/buy with the server's rules. Keys: G give item, K die (drops pile incl. brain; "NEW GOBLIN (DEMO)" button re-rolls so the pile can be looted), L win, T / Y teleport to first merchant room / start.
- Test hooks: `GK.getInv() getParts() openShop(id) openStation(kind,id) openLoot() nearestPile() drops() hover() eat(slot) showVictory()`.

## Tested (playwright, offline, one job at a time; scripts in the session scratchpad: flow.js)
G items, Tab inventory, hotbar selection, T teleport, shop buy (gold 100 -> 55), recycle (parts + inventory change), craft (part counters tick down, item lands in backpack), K death -> new goblin -> walk to pile -> loot panel -> eat brain (30 -> 32 = +5% of 40) -> take all, L victory (GKSAVE stash + character written), 0 page errors. Screenshots: `docs/screens/inventory_h_*.png`.

## Not checked
- Online (real server) end to end after the latest server changes; only offline was run.
- Real mouse hover/click on the 3D merchant and stations (targets existed, but tests opened panels through `GK.openShop/openStation`; the pointer-lock click path is untested in software GL).
- Mouse-driven slot moves with ghost icon were tested in an earlier iteration only; Tab/I toggling while the menu overlay (skipMenu test mode) is visible looks odd but that is the test shortcut.
- Phone/small viewports below 900x560; `transcendent` tier uses the existing TIER_COL cyan.

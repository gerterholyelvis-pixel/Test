# QA pass 1 (Sonnet worker, on origin/main 9e76451 + HUD fix)

Method: the Browser pane was hidden (no animation frames), so the game was driven in headless Chrome (software GL, resolution scale 0.25, Low preset) through the Chrome DevTools protocol against `PORT=3110 GK_DEBUG=1 node server.js`, plus `?offline=1`. Test hooks used: `__gk.setView`, `GK.setDoorsOpen`, `GK.applyLayout`, `GK.openShop/openStation`, `GK.panelClick`. No automated test suite changes.

## Fixed
- HUD overlap: the combat health card and the stats card are now one bottom-left column (`#gkLeft`, combat card on top). Checked 1280x720 (no overlap, screenshot `docs/screens/hud-stack.jpg`). 1920x1080 and 375 px width were not checked visually (375 px: no horizontal scroll).

## Passed
- All 24 doors, both directions, open: the player walks through and ends 2 m past the door (no clipping stops). The first run showed 19 "failures" that were only a 6 s timeout at ~10 fps; a rerun with a 20 s stall detector passed all of them. Closed vault door and a closed skull door block (BLOCKED at the wall).
- Door room keys vs server door table (done earlier): all 24 match.
- Mystery rooms, one of each kind (weapon, armor, enemy, stations, gold, plushie), plus merchant and chest rooms: built and viewed from inside with `GK.applyLayout`, no console errors.
- Merchant shop opens (gold shown); Recycler and Workbench panels open in a merchant room; loot pile panel opens with Brain and Eat; inventory opens; victory screen shows; death screen shows (offline); `GK.redrawMaps()` runs; door pick via `GK.panelClick` reaches the server and appears in the round state.
- Graphics presets Low/Medium/High/Ultra: switching and rendering all four gives no console errors. Draw calls with the camera in a normal room and doors closed: about 318 (Low).
- Audio sliders (master, effects, ambient): values, labels and `localStorage` update, no errors.
- Server-side flows (vault 2-room rule, claim, buy failures, mv/drop, kill drops) are covered by `npm test`.

## Issues / not verified
| # | Sev | What | Steps |
|---|-----|------|-------|
| 1 | medium | Offline demo: the player dies within about 10 s of starting (bots attack straight away, even during round 1 "pick a door"), so the demo is hard to explore. | open `?offline=1`, press Play, wait |
| 2 | low | The interact prompt ("E") stays visible while a station panel (Recycler/Workbench) is open. | open a merchant room, call `GK.openStation('recycle', 4)`, look at `#gkPrompt` |
| 3 | low | Health is shown twice (combat card and stats card). Suggest dropping the bar from one of them. | start any game |
| 4 | low | With every door open, room culling floods visibility to all 21 rooms (draw calls ~2500-3500 even on Low). Expected by design, but late rounds will look like this. | `GK.setDoorsOpen` all, read `__gk.info.render.calls` |
| 5 | info | Could not check by eye: audio output (headless), real mouse-look walking, vault rule through the UI with two real browsers, wall map / minimap appearance, preset visuals, 1920x1080 and phone layout of the HUD, death and victory via real server messages. Frame rate in software GL is 1-16 fps so timing-based checks are only indicative. |

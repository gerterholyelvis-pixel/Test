# Halls fill (the empty rooms)

Owner report: "a bunch of rooms (including the ones you start next to) are empty".

## Tour result (real headless Chrome, offline demo, `tools/hallshot-audit.js`, `tools/hallshot-views.js`)
Furnished already: the 8 homes, the 4 tree rooms, the 4 vaultbreakers, the vault, and every attached loot room type (chest, mystery, merchant, Master Forge, Grand Recycler).
**Bare: the 16 outer halls** (corners, middles and the 8 halls behind the homes): only a story corner and crates, nothing to do. They are now the "halls" below.

## What was added
- **Themes** (`world.js` `HALL_THEME`, `THEME_PLAN`, `hallPieces`, `hallSpots`): barracks, armoury, kitchen, library, den, shrine, workshop, cistern, in 180-degree pairs (cell i and 24-i). 3 to 8 pieces per hall, placed deterministically from the cell. Furniture is solid through `solidsOf` (same footprints on both sides); door lanes (2.35 m each side of the door-to-centre cross) and the middle stay free, gaps between props are closed or at least 1 m. `randomPoint` now never returns a point inside a prop. `props`, `doorguard`, `world` tests pass unchanged.
- **Art** (`game.js` `hallDress`, inside ROOMART): merged into the room's existing meshes (no new draw calls); one extra small water mesh in cistern and shrine halls. One banner in the hall colour above the first wall piece, a rug under the centre piece in four themes. No lights. Measured Low, headless, standing in a hall: 61 to 83 draw calls (no baseline taken for an unfurnished hall; the pieces add no meshes except the water).
- **Content** (`halls.js` pure rules, `halls5.js` server): containers (hold E, 2.6 s; starter cache 1.6 s) with loot profiles built from the existing pools (gold, basic parts, utility items, tier 2+ weapon or armour from racks only, about 20%), stations (heal font and stew pot +22 HP / 30 s; whetstone +12% damage 20 s, once a minute per goblin; notice board shows the 3 top kill counts). Restock 100 s shared; caps per goblin 3 searches a round, 160 gold / 36 parts / 5 items a match. Cancelled by moving 0.6 m, leaving, or any damage. Sudden death: all off.
- **Safe halls** (behind the 8 homes): one starter cache per goblin (20 to 30 gold, 3 parts, 1 utility item) and a notice board. Themes there are kitchen, library, shrine, workshop (2 each), so every home gets one stew pot or font, whetstone, or neither; the cache and board are identical for all. **Fighting halls**: per match the server rolls 3 guarded halls (a `dumb` or `regular` goblin that wakes when someone walks in, mystery-room loot) and which containers start empty (20%, 30 to 80 s).
- **Bots**: an idle bot in a hall walks to a container or station in reach and uses it through the same `H5.act` (caps apply); heal spots only when hurt.
- **Client**: E prompt through feel.js `promptFor` (nearest spot in front of you), progress bar under the crosshair, toasts, sounds from existing names (chest, coins, pickup, drink, craft, bell, deny). Offline demo has a local stand-in. Codex: "The 16 outer halls" table and "Hall rules" in the Rooms tab.
- **Balance**: the hard cap is 160 gold, 36 parts and 5 items per goblin per match (3 searches a round), against 50 to 500 gold from one mystery room and far more from trees and heists.

## Files
`world.js`, `halls.js` (new), `halls5.js` (new), `server.js` (hooks tagged HALLS: init, tick, welcome, act message, hit/death, `spawnGuard`, `hallBot`), `game.js` (`hallDress`, GKHALL block), `feel.js`, `index.html`, `tools/gameinfo.js`, `docs/game-info.html`, `tests/halls.test.js` (new), `tools/hallshot-*.js`, `docs/screens/halls-*.jpg`, `docs/FEATURES.md`.

## Tests
`tests/halls.test.js` (pure: plan, reach, flood fill, loot ranges, caps, events; live: search, restock, cancel, starter cache, round cap, stations, junk messages, guards and dry containers, a bot searching). Test hooks (GK_DEBUG only): `GK_HALL_RESTOCK_MS`, `GK_HALL_DRY=0`, `GK_HALL_GUARDS=0`, `{hall:{dbg:1}}`, `{botlab:{near, hallGo:1}}`.

## Not done / for the merger
- Real-GPU frame time not measured; library/den shelves can stand as free islands when the walls are full (drawn two-sided).
- Fonts and stew pots heal at +22, which is minor; tune `CFG` in halls.js. Containers show no "ready" glint (the prompt says "Empty, restocks in M:SS").
- Not touched: tree, vaultbreaker and vault code.

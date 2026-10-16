# THE VAULT resize (quick report)

Done: rooms are 12x12 corners, 18x12 / 12x18 edges, 18x18 vault. Geometry lives only in `world.js` (client `window.GKWORLD`, server `require`); `game.js` and `server.js` hold no duplicate size constants. Vault has "THE VAULT" signs, gold floor medallion, pillars, dais.

Lights: 9 PointLight + 1 HemisphereLight before (62c156f) and after. No lights added (the vault's own lamp is brighter, 14 vs 9, same count).

Tested:
- `node --check` passes on every .js file.
- Loads with no console errors in `?offline=1` and in server mode (match started, layout received, spawn in room 6 of the right size).
- All 24 doors: for each, the room keys on its two sides (via `GK.roomKeyAt`) equal the server's `ROOM_DOORS` entry for that door id.
- 12 chest rooms: `WORLD.chestKey` ids match `roomKeyOf` of their centres; 1800 random spawn points all land in their own room; server edge rooms (ids 2,5,6,9) never merchant.
- Screenshot: `docs/screens/vault.jpg`.

Not tested: walking through every door to check clipping (the browser pane throttles frames when hidden, so automated walking stalled), vault 2-rooms-to-pick rule after the resize, merchant/mystery interiors and stations by hand, minimap by eye, full screenshot pass.

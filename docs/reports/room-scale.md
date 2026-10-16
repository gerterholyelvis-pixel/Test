# Rooms slightly bigger (room-scale)

**What changed:** `world.js` now has `SCALE = 1.25`, so every grid room is 25% bigger per side and keeps its proportions: corner rooms 15x15, edge rooms 22.5x15 and 15x22.5, and the vault 22.5x22.5. `HALF` went from 21 to 26.25 and `LIM` from 29 to 34.25. Doors, door frames, keypads, props, the dais, the relic and the chest rooms (8x8) keep their size.

`world.js` also changed in these ways:
- **Ceiling panels:** the grid stays the same: 2x2 in a corner room, 3x2 in an edge room, 3x3 in the vault. The spacing is 7 m.
- **`panelDX`:** now 5.3 m, or 7.9 m in the wide rooms.
- **`PILLAR_D`:** new value, `V * 0.3` = 6.75. It is used for both the collision rects and the art.

**game.js:**
- **Lamps:** still 9 PointLights + 1 Hemisphere. Each lamp's intensity is multiplied by `SCALE` (9 to 11.25, 14 to 17.5) so the walls stay lit.
- **Vault art:** the pillar art and the pillar blob shadows use `PILLAR_D`. The "THE VAULT" plates are centred on their wall segment.
- **Map and camera:** the wall-map scale is `11.6 * 29 / LIM`, and the overview orbit radius scales with `LIM`.

Everything else (minimap, wall maps, room art, motes, doors, server bounds, spawns, bot routes) was already driven by `world.js`.

**Chest rooms were not scaled on purpose.** The merchant glass booth, the shelves and the mystery clutter footprints are authored against the 8 m back wall. Changing `CS` needs a pass over buildMerchant / buildMystery and the world.js mystery props.

**server.js:** I added `doorClamp` for doorway walkers in `stepTo`. Prop detours and escape legs could drag a bot along a wall into the masonry beside a door, which caused refused moves and "inside a wall" positions. This bug already existed at SCALE 1 and got more frequent with the bigger rooms. With the fix, `bots.test.js` passed 5 runs in a row with 0 refused moves.

**Timing:** movement speed is unchanged. A room-to-vault trip is about 7.5 m longer, roughly 1.6 s walking or 1 s sprinting, against rounds of 30 s and 45 s. The door-vote timers do not need a change. Bot sight (12 m) and bolt range (12 m) are left as they are.

**Tests:** `world.test.js` has new dimensions plus new checks for the panel grid, the pillars and prop placement. `combat.test.js` and `netcode.test.js` now take their door and wall coordinates from `world.js`. `npm test` passes everything except `security.test.js` static: this worktree has no `node_modules/three`, so the failure is environmental and unrelated.

**Screens:** before and after shots are in `docs/screens/room-scale/` (vault, room 0, room 3), taken in the browser with `?offline=1`. There were no console errors.

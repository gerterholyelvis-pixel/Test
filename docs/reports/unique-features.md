# Unique features: panel politics, door intel, knowledge glow, king marker, ear polish

Spec: docs/DESIGN-core-loop.md sections 1 and 4. Code: `// UNIQUE-BEGIN` ... `// UNIQUE-END` in game.js (after GOBLINART-END), plus one-line hooks.

## Server (server.js)
- `m.selBy[room] = playerId` is set wherever `m.sel[room]` is set (player `sel` message and bot votes) and cleared with `m.sel` at round end and when a room empties.
- `m.lastSel` = copy of last round's `m.sel` taken at round end (door intel).
- `roundState` now carries `selBy` and `lastSel` (both objects keyed by room key).
- Slow player state (`pub`) gains `brains` (count of brains eaten). Knowledge was already in `stats.knowledge`.
- Test: tests/panel-selby.test.js (two goblins in one room, last pick wins, selBy resets, lastSel arrives next round).

## Client
1. **Panel politics**: the door control screen header shows a gold-ringed head of whoever made the pick ("YOU" / "PICKED BY"). It uses `window.GKHEAD` (menu.js exports `headCanvas`, one line). When `selBy[room]` changes from one goblin to another, that panel flashes for 0.9 s; the room I stand in also plays `GKAUDIO 'panel'` unless I made the change. Hooks: `applyRound` (round state in), end of `cpDraw` (badge and flash), `UNIQUE.tick` (keeps a flashing screen redrawing).
2. **Door intel**: the facility wall maps draw a faint blue arrow just inside each room, pointing at the door that room picked last round, plus a "Last picks" legend entry. Claimed-room ticks (FEEL) untouched. Hook: one line in `drawMap`; the maps redraw when `lastSel` changes. There is no separate minimap in the game, so the wall maps are the only map.
3. **Knowledge glow**: one extra mesh on each goblin's head (one draw call, additive, no lights): two eye glows plus a rune/vein patch bent over the forehead, in one atlas texture with its own vertex colours. Level = 0.1 + 0.25 * (base/100) + 0.65 * clamp((knowledge - base) / 24): low is dim amber eyes and no rune, high is hot white-cyan eyes and a bright rune (about 3 brains from a typical base reaches the middle). Slow state feeds `a.know` and `a.brains`, so other players see it. Goblins with `brains > 0` get a faint pulsing aura sprite behind the body (one more draw call, only for them).
4. **King bounty**: a small gold crown sprite (dark outline so it reads on white walls), depth test off, shown only when the King (not me) is within 12 m and in a room that shares a door with mine. It is a scene child, not part of the goblin, because the GFX2 room culling hides goblins in rooms you cannot see. Removed when the goblin leaves the actor list. No text (kill feed agent can add it).
5. **Art polish**: ears are thicker (extrude 0.05, bigger bevel), cupped with the rim curling forward, with a rolled rim tube along the edges; the inner ear is now `0x9c6a74` (darker, less saturated) and sits on the cup. Name tags: `[1.95,1.95,1.95,2.85,2.55] * SCALE`, clear of the wizard hat and king crown (the HP bar follows the tag by +0.26).

## Test hooks added to game.js (one line)
`GK.net`, `GK.cam`, `GK.P`, `GK.actors`, `GK.unique` (round, panel, flash, levelOf).

## Verified
- `node --check` clean; `npm test` 11 files pass (bots.test.js timing check failed once under parallel load and passed on rerun and alone).
- Browser solo match with bots (GK_DEBUG=1 GK_QUEUE_MS=2000, port 3140): no new console errors. Door-intel arrows seen in round 2 from real server data. Panel badge verified on a real pick; the flash was verified through `GK.unique.flash` and by reading the sound call (the screenshot lag is longer than the flash). King marker checked through a closed door with a dummy King actor. Dummy goblins for the knowledge shots were injected through `GK.actors` (no server support for scripted knowledge).
- Goblin draw calls now about 13-14 (+1 glow mesh, +1 aura while it has eaten brains).
- Screenshots: docs/screens/unique-panel.jpg, unique-knowledge.jpg, art-goblins-lineup2.jpg.

## Not done / notes
- The aura is deliberately faint; at lineup distance it is barely visible. Tune opacity in `U.actor` if the owner wants it louder.
- Offline mode (`?offline=1`) sim does not send `selBy`/`lastSel`, so those features are idle there.
- The panel flash is not seen by a goblin who made the change themselves, apart from the badge changing.

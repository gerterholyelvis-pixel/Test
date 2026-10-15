# Rooms agent report: chest / mystery / merchant rooms, stations, chest kit, map

All code is in `game.js`, inside CHEST-BEGIN/CHEST-END (rooms, stations, chest kit) and MAP-BEGIN/MAP-END (maps). One tiny edit outside: `GK.myStats = {...}` in `showStats` (read by the knowledge tree).

## Architecture
- At load, each of the 12 outer rooms gets a generic SHELL (floor, 3 walls, ceiling, 2 emissive panels, skirting, gold band; frozen matrices). Slot data lives in `slots[]` (`{cr, g, shell, inner}`).
- INTERIORS are built per room in `inner` (one THREE.Group) from a layout hook (`layoutHooks.push(rebuildAll)`). A room is rebuilt when its type changed (mystery rooms always, because their contents are random). Before a rebuild the old `inner` is disposed (geometries not in the shared `keepGeo` set, own materials, InstancedMesh buffers) and removed, entries in `GK.merchantTargets` / `GK.stationTargets` for that room are dropped, and the shell materials are swapped for the new type (chest / violet mystery / warm merchant). If no layout arrives within 4 s the default types are built.
- Memory check (`jtest.js mem`): applying layouts A/B(all merchant)/C(all chest)/D(all mystery) twice over gave stable `renderer.info.memory` (geometries per layout identical on the 2nd round, textures flat at 167).
- Animation: one tick list (`addTick(root, fn(t, dt))`), run from the existing `onBeforeRender` hook while the root is attached to the scene; ticks and chest slots whose root is detached are pruned every 2 s.

## Exports (all on `GK`)
- `GK.merchantLogo(size)` returns a canvas (gold coin, goblin-merchant hat over scales). Defined first in the block.
- `GK.ROOM_TYPE_NAMES = {chest:'Treasure room', mystery:'Mystery room', merchant:'Merchant'}`.
- `GK.stations.recycler|knowledge|workbench(parent, x, z, rotY, roomId?)`: builds the station with nameplate sprite + wall plaque. Local frame: +z front, back wall at z = -0.5. With `roomId` it registers the object in `GK.stationTargets` (`userData.station`, `userData.roomId`, invisible proxy box for raycasts).
- `GK.chestKit = { buildChest(parent,x,z,rotY,{weapon,id}), weaponModel(key), labelFor(key), setWeapon, dispose }`. `weaponModel` works for all weapon and armour keys in `GKITEMS.ITEMS`, a family name or a legacy index (13 families, 6 tier styles incl. transcendent). Labels read `Name . Tier N . X dmg` in the tier colour.
- `GK.disposeKit(group)`: disposes kit-built geometry/own materials (use before discarding a group built with stations/chest kit).
- `GK.merchantTargets`: merchant goblin Object3Ds (`userData.roomId`); glass is not part of them. Head turns toward the local player within 8 m (reads `GK.playerPos` or `__gk.P`).
- `GK.recyclerFeedback(roomId)` (~1.6 s: fast rollers/gears, belt, green flash, sparks, dust puffs) and `GK.workbenchFeedback(roomId)` (sparks, forge flare, anvil shake).
- `applyChests(keysOrIndices)`: accepts item key strings (`chestKeys`) or legacy indices, stored and applied whenever chest interiors exist.
- `GK.redrawMaps()`; maps also redraw from a layout hook.
- Mystery room: after the eerie shell, an empty group `mysteryContents` (room-local frame, origin = floor centre, +z toward the door) is created and `GK.buildMysteryContents(room, group, room.mystery)` is called; `GK.disposeMysteryContents(group)` is called before each rebuild.

## Rooms
- Chest: unchanged look (banners, torches, chest on dais) now rebuilt in the layout hook via the chest kit.
- Mystery: deep violet walls/floor, glowing floor rune circle (emissive map), tapestries and rune tablets with '?', violet sconces, sealed crates and urns with '?' in the back corners, drifting mist sprites, floating motes, big floating '?' (tube geometry + gold dot, rotating, ring, halo, faint beam) kept high (> 3 m). Floor centre left free for the contents.
- Merchant: wooden market stall with brass-framed glass barrier (low-opacity standard material, glints), header and OPEN sign, shelves with goods, coin stacks, logo banners and medallion, lanterns (emissive + glow sprites, no lights), animated merchant goblin (breathing, head turn/look-at, blinking, coin in hand), knowledge tree (5 tiers, tier plaques `TIER I - 20 KNOWLEDGE`..., lit/locked by `GK.myStats.knowledge` vs `GKITEMS.KNOWLEDGE_TIERS`, padlock sprites, orbiting orbs, floating books), workbench (vise, hammers, saw, gears, anvil, forge coals, tool rack), recycler (hopper with scraps, shredder rollers, conveyor with moving belt and items, gears, emblem, indicator lights, scrap bin).
- Map: base canvas redrawn from the layout (chest icon, purple '?', gold merchant coin), legend extended (Treasure/Mystery/Merchant, "Random rooms each match").

## Tests done
Screenshots with software GL (`docs/screens/rooms-*`): merchant room incl. tree and goblin, recycler + workbench, mystery room, map legend. Console had no errors from this code (page errors `partsTotal`/`setParts` seen earlier were from another agent's work in progress). `weaponModel`/`labelFor` ran for all 50 item keys without error; stations built on a foreign group with a roomId register targets and dispose cleanly.

## Not checked
- Real GPU frame cost of 12 merchant rooms (all-merchant layout: 12 merchant targets, 36 station targets) was not measured; `renderer.info.calls` reads were unreliable in the screenshot harness.
- The workbench/recycler layouts were only viewed from the door side; the overview camera sees them only partly (walls are tall).
- Armour models are simple placeholders; weapon silhouettes for new families (flail, halberd, crossbow, hammer) were not individually inspected.
- Floating '?' was retuned (colour, scale) after the last viewing.

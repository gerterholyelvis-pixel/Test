# Room art report

Goal: make the rooms look hand-crafted and lived-in while keeping the white-facility look. All code is in one block in game.js, `// ROOMART-BEGIN` to `// ROOMART-END`, placed right after `// FX-END`. Nothing outside that block was edited. One call, `ROOMART.init()`, builds the rooms and registers one `layoutHooks` entry.

## What each room gets
Everything is seeded from the room key (`hash('roomart:' + key)`), so all clients get the same layout with no network traffic. Everything is visual only: no collision, no lights.

- **Floor trims and skirting.** A cap moulding above the existing white base, a dark floor inlay line with a pale second line, and yellow safety squares in the corners.
- **Wall panel seams.** Vertical reveals at a seeded spacing, plus two horizontal reveals.
- **Ceiling.** Cornice and coffer beams that run between the light-panel rows. They live in their own mesh, which is pushed into `ceilings`, so the overview camera hides them with the ceilings.
- **Hazard stripes.** A worn yellow/black floor strip in front of every door, on each side.
- **Goblin graffiti** as canvas-atlas alpha decals: "GOB WOZ ERE", a crude crown, tally marks, "MINE!!", "KING SMELZ", and goblin faces.
  - They never cover door gaps, the north-wall map and control panels, or each other.
  - Non-vault grid rooms also get a floor arrow and "VAULT" pointing at the vault.
- **Props**, kept near walls and corners and clear of door gaps:
  - gold coin scatters
  - bones, skulls and ribs
  - a knocked-over bucket with a puddle
  - crates and sacks
  - a broken goblin helmet with a snapped horn
  - hanging chains
  - Counts, positions and picks differ per room.
- **Vault** (grid room 4):
  - 8 coin piles around the medallion, plus 2 corner hoards with crates
  - marble veining decal over the floor (grey and gold veins)
  - 5 additive glint sprites that pulse and rotate: one over the dais, four over piles
  - Graffiti is smaller and sits below the brass rail.
- **Chest, mystery and merchant rooms.** Emissive-only mood accents: a floor inlay, a ceiling cove strip, and corner motifs.
  - chest: warm gold, with gold ingot stacks
  - mystery: purple, with hanging crystal shards
  - merchant: teal, with hanging lanterns
  - These rooms also get door-side corner props, 2 graffiti on the door wall, door hazard stripes, and beams.
  - They are rebuilt on every layout change, keyed on the type signature.

## Rendering cost
Per room the geometry is baked into at most 5 merged static meshes:

| Mesh | Material |
|---|---|
| solid | vertex colours |
| gold | metal |
| ceiling | |
| decal | alpha atlas |
| mood | emissive, chest rooms only |

They are top-level, frozen (`matrixAutoUpdate` false) and sit inside one room, so FX room culling classifies and culls them. They are not in `worldStatic`, so the merge step and the contact-blob step ignore them.

Draw calls, High preset, `?offline=1`, 20-frame average of `renderer.info` with autoReset off, all passes counted, art toggled on and off in the same session. Bots move the numbers a little between runs.

| View | Without art | With art |
|---|---|---|
| Spawn room (room 8) | 299 / 916 (two runs) | 304 / 921 |
| Vault, centre looking north | 1142 | 1168 (the glint sprites were toggled off too) |
| Chest room | 298 | 303 |

The increase is about +5 per room (+26 in the vault, which includes the sprites and the marble decal). The GTAO normal pass counts the opaque meshes a second time.

## Checks
- `node --check game.js` passes.
- `?offline=1`: no script errors. The console shows one `ERR_CONNECTION_REFUSED` resource message. It showed up before the game started, and I did not trace it.
- Lights: 9 PointLight + 1 HemisphereLight, checked through `window.__gk.scene` after the art was built.
- Screenshots: `docs/screens/art-rooms-spawn.jpg`, `art-rooms-vault.jpg`, `art-rooms-chest.jpg`. I did not screenshot the mystery or merchant rooms.

## Risks and notes
- Decals sit 1.2 cm off the wall. Anything else mounted on a wall at 0.4 to 1.9 m could overlap a graffiti piece. Only the north-wall panels are avoided.
- Chest-room props sit in the door-side corners. A merchant room's shelves or counters could overlap them. They are small and have no collision.
- Marble veining is subtle by design.
- The glint sprites are always drawn when they are in the frustum (they are not in the culling system). They animate from their own `requestAnimationFrame`.
- Test setup: the worktree had no `node_modules`, so I made a junction to the main repo's `node_modules` (gitignored, not committed).

## Art pass 2 (hand-made, not generated)
Before/after: `docs/screens/art-rooms2-{before,after}-{spawn,vault,corner}.jpg` (same cameras, High preset, offline).

- **Story corner per room.** Each grid room (not the vault) reserves one corner first and the older props flow around it. Three seeded themes: goblin camp (bedroll, cold campfire with a tripod pot, log seats, gnawed bone pile, tipped barrel with spilled coins, crate stack), hoard corner (tipped barrel, two standing barrels, broken crate with straw, sacks, coins) and gaol corner (ceiling hook with a chain and open cuffs, bone pile, bucket, broken crate). Chest rooms get one or two door-side pieces; the vault gets a pair of shackles. The campfire embers are an emissive-only mesh (no light).
- **Graffiti.** Three hand-drawn styles in the atlas (scratched into the paint, red paint with drips, smudged charcoal): a big "KING ME" with a crude crown, a charcoal goblin face, scratched tally gates, "VAULT" wall arrows that point toward the vault side, plus the older marks. Widths are 2 to 4.5 m (readable from the room centre), with per-decal opacity (vertex colour, patched into the decal shader) and a slight tilt.
- **Wear.** Grime gradient up the walls, boot scuffs, a cracked tile cluster on the floor (away from doorways) and dried water stains on the ceiling.
- **Panel seams** are two thin ridges (light and shadow side) instead of one flat line.
- All seeded from the room key (`roomart2:` stream), visual only, no collision.

Cost: lights unchanged (9 PointLight + 1 Hemisphere). Draw calls: the new props, decals and stains reuse the existing per-room merged meshes; the only new mesh is one ember mesh in camp rooms (+1 to +4 draw calls in the whole level, and culling still applies). Triangles: static art grows 140k to 199k (whole scene 272k to 332k). Not measured: real GPU frame time (software GL only).
Test hook: `GK.roomart.story` (room key to [x, z, theme]).

# Room art 5: per-room identity (ROOMID)

Surveyed every room type by screenshot. Vault, chest, mystery and merchant rooms already had strong identity (marble and gold, warm, purple, teal). The eight outer grid rooms were identical white boxes apart from their props, so that is what this pass fixes.

## What changed (all inside the ROOMART block of game.js)
- **Per-room paint colour** (`ROOM_ACC`): sage, slate blue, terracotta, mauve, ochre, cadet teal, rose, olive. It drives:
  - a painted wainscot band (0.29 to 1.04 m) with a lighter rail and a darker foot. The band is only 4 mm proud of the wall, so seams, grime and graffiti still read over it.
  - the floor inlay lines (they were dark grey and are now the room colour).
  - colour collars on the pipe brackets.
- **Steel conduit run** along every wall at 4.9 m (one thick and one thin pipe, brackets, corner elbows) and a flanged riser in one corner. Pipes stop 1.5 m short of the door gaps.
- **Stencilled "ROOM n"** high on a side or back wall, in the room's own colour, so players can tell where they are. It matches the "Room n" text on the door panels and the HUD.
- The vault and the chest, mystery and merchant rooms are untouched.

## Cost
No new lights and no new draw calls. The band, pipes and flanges merge into the existing `roomartSolid` mesh, and the stencil is a decal in the existing atlas. The atlas grew from 1024x1792 to 1024x2048 (+1 MB). Prop layouts are unchanged (the seeded random streams are consumed exactly as before; the new code uses its own stream).

## Tested
- `npm test`: all 20 files pass.
- Headless Chrome, `?offline=1`: all rooms rendered, no script errors.
- Screenshots: docs/screens/art-rooms5-*.jpg.

## Not done / merger notes
- Not profiled on a real GPU or on the Low preset (the extra geometry is a few thousand triangles per room, culled with the room).
- The atlas rows 1664 to 1792 are claw/scorch cells. The new `rm*` cells are at y=1792 for that reason.

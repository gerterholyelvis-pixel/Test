# Tree rooms B: art for tree types 6-10

New file `rooms5art-trees-b.js` (ES module, no game.js / world.js / server.js / index.html edits). Types: Thorn Shrine, Gambler's Root, Memory Tree, Hollow Oak, Elder Tree (PLAN-5x5-rooms 3.2).

## API
```js
import { buildTreeRoom, TREE_B_TYPES, TREE_B_INFO } from './rooms5art-trees-b.js';
const room = buildTreeRoom(THREE, {}, 'thorn', { height: 6.5, size: 15, seed: 1, lite: false });  // THREE.Group, room-local; null for other types
const api = room.userData.api;
```
- Types accept `thorn | gambler | memory | hollow | elder` (aliases such as `hollow_oak`, `Thorn Shrine` work).
- Local space: origin = room centre on the floor, +y up, north = -z. **NE = (+4.2,-4.2), NW = (-4.2,-4.2), SE = (+4.2,+4.2), SW = (-4.2,+4.2)**. Place the group at the cell centre. Needs `height` (ceiling, default 6.5): the trunk runs through a ceiling hole, and leaf cards sit above the ceiling to fill the hole (hidden by the ceiling otherwise).
- `api.anchors[name]` are `Object3D`s (position = interaction point, `userData.reach`, `userData.kind`). Common: `C`, `trunk` (E on the trunk), `ring` (r 3.0 floor zone), `NE NW SE SW`. Per type:
  - thorn: `grip`, `bowl` (= SE)
  - gambler: `hollow` (the mouth), `stump` (the item sits at its y), `knot1..5`, `gourd1..5`
  - memory: `lantern1..4` (= NE red, NW blue, SE green, SW amber; also `api.lanternColors`)
  - hollow: `nook` (capture zone r 0.9 at (0, 1.95)), `eye`
  - elder: `seed`, `stone1..3` (= NE NW SE), `den` (= SW)
- `api.solids`: `[{id, x, z, r}]`, exactly the plan's 5 circles (trunk r 1.1, 4 posts r 0.7). Every post position carries a prop, so the static solids never block empty air. `api.extraSolids` (Hollow Oak only): 6 optional circles for the arch walls; the plan keeps solids static, so ignore them unless you want the walls to be solid.
- Shared setters: `setVeins(k)`, `setLeaves(k, tintColor?)`, `setRing(0..1)`, `update(t, dt)` (cheap ambient pulses, call only for rooms in the cull set), `dispose()`, `drawCalls()`.
- State setters (the "props show all the state" rule):

| type | setters |
|---|---|
| thorn | `setGrip(0..3)` lights tier I-III of the thorn tips; `setBowl(0..3)` raises the blood and lights the drop gems |
| gambler | `setStep(0..5)` current knot bright, lower knots dim; `setGourds(0..5)` filled gourds glow gold (pulse at 5); `setMouth(0..1)` ember glow in the hollow |
| memory | `setLantern(i, 0..1)`, `setAllLanterns(k)` (lantern core, floor ring and trunk gem light together), `setTrunkGlow(0..1)` |
| hollow | `setWarden(0..1)` eye, nook ring, veins |
| elder | `setStone(i, 0..1)` rune + 8-segment gauge + conduit to the trunk; `setWake(0..1)` canopy, veins, ring, light shaft; `setSeed(bool)`; `setWithered(bool)` (after the 3rd waking) |

## Shared tree-room identity (match this in types 1-5)
Fat flared trunk with ridged, lobed bark and mossy foot, rising through the ceiling hole; thin glowing "knowledge veins" in the type colour spiralling up it; 7-12 buttress roots; 5-8 limbs carrying puffs of leaf cards (one shared 2x2 leaf atlas, unlit, vertex-tinted, HDR multiplier > 1 so bloom picks them up) plus a foliage plug above the ceiling hole; a faint additive light shaft; a 3 m glowing floor ring; fallen leaves; four post props on the corners. Bark / stone / wood textures are tileable 256 px canvases shared per THREE instance. Colours: thorn crimson (0xff3a52), gambler gold on green (0xffc83a), memory lavender (0x9aa8ff), hollow dim teal with amber (0xffa828), elder pale gold on emerald (0xfff0b0).

## Cost
Per room: 7-12 meshes (budget 25), about 18-37k vertices, about 25-33k triangles, built in 40-230 ms in Node. No lights, no extra textures beyond the shared canvases. `lite: true` halves leaf and mesh density (use for the Low preset). All meshes are static except the colour buffers of the glow meshes (vertex-colour updates on state changes) and a few material colours.

## Integration notes
- The file imports nothing: it takes `THREE`, so it loads with the same importmap. Add it to the server's client file whitelist (like `itemart`) and `import('/rooms5art-trees-b.js')` from game.js. It only touches `document` for canvas textures (and skips them when there is no DOM, which is how the unit test runs).
- Bark material is DoubleSide (tube end caps and the Hollow Oak shell are open surfaces).
- The Hollow Oak nook is a real walkable arch (inner width about 1.9 m) carved into the trunk; walk-through is allowed by the static solids, so a goblin can stand in the walls. `extraSolids` fixes that if wanted.
- Preview: `tools/preview-trees-b.html?type=thorn|gambler|memory|hollow|elder&cam=wide|front|close|nook|ne2|se2|top|...&st=1` (st=1 shows the max state). It needs a static server that maps `/three/` to `node_modules/three/build` and `/three/addons/` to `examples/jsm`, with the repo root at `/`. `&save=name` posts a JPEG to `/save` of a dev server (used for the screenshots).
- Test: `tests/trees-b-art.test.js` (headless build, anchors, solids, setters, budget). It skips itself when `three` is not installed.
- Screenshots: `docs/screens/art-trees-b-*.jpg` (rendered in headless Chrome with software GL and no bloom, in a stand-in room with a few point lights, so colours are flatter than in game).

## Not done / known
- Not seen in the real game (no bloom, real lighting, real ceiling): leaf and glow brightness may need a pass (`cfg.leafMult`, glow multipliers in the paint calls).
- Elder limbs show a few blunt stubs where they leave the trunk near the ceiling.
- Activity logic (`GK.actView[type]`) is not written; the setters above are the hooks for it.

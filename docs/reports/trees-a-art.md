# Tree room art A: Sapling Well, Brain Press, Healing Spring, Seer's Tree, Grafting Bench

New files only: `rooms5art-trees-a.js`, `tools/preview-trees-a.html`, `docs/screens/art-trees-a-*.jpg` (11 shots), this report. Nothing in game.js / world.js / server.js / index.html was touched.

## API
```js
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTreeRoom, TREE_A_TYPES, TREE_ANCHORS } from './rooms5art-trees-a.js';
const g = buildTreeRoom(THREE, { mergeGeometries }, 'well' /* well|press|spring|seer|graft */, { seed });
roomGroup.add(g);  // g origin = cell centre, floor y 0, ceiling 6.5 (north = -z, east = +x)
```
- `g.solids`: `[{x,z,r}]` cell-local circles (trunk r 1.1 always, plus the corner props of that type at r 0.6 to 0.75). Add the cell centre before feeding `solidsOf`.
- `g.anchors`: name -> Object3D (child of `g`, so `getWorldPosition` works), `userData.r` = interaction radius. Use for the activity logic and the `actFx` "+n" floats.
- `g.api` (also `g.userData.api`): setters, `update(dt, t)` (call every frame for rooms in the cull set; smooths all state and runs the idle animation), `snap()` (jump to target state), `dispose()`.
- All setters are cheap and idempotent; call them from the `act` state snapshot.

## Per type
| type | anchors | setters | solids (besides trunk) |
|---|---|---|---|
| well | `trunk`, `sapling`, `fruit` (ripe fruit, channel here), `well`, `windlass` (crank), `bucket` | `setStage(1..4)` sapling grows from 2 m to a ceiling-high tree, `setFruit(0..1)` (>0 shows the glowing fruit), `setWaterLevel(0..1)` shaft water, `setBucket(notch 0..3, full?)`, `setBucketFull(bool)` | NE r .75 (well) |
| press | `trunk`, `press` (stand here to crank), `vat0` (NE), `vat1` (NW), `vat2` (SW) rim tops = husk spawn | `setPress(0..1)` platen descends and screw turns, `setPressBrain(bool)` brain on the bed, `setVat(i, 0..1)` bubbling and glow rise as the next husk nears, `popVat(i)` one-shot burst when a husk climbs out | NE, NW, SW r .7 |
| spring | `trunk`, `pool` (r 3 zone), `basin0` (NE), `basin1` (SE), `basin2` (SW) | `setPoolGlow(0..1)` (someone is healing), `setBasin(i, fill 0..1)` | NE, SE, SW r .7 |
| seer | `trunk`, `eye`, `stone0` (NE), `stone1` (NW), `stone2` (SE) | `setRing(i, step 0..5)` turns the ring smoothly, `setTargets(a,b,c)` or `setTargets([a,b,c])` glyph indices 0..5 on the eye plaque (ring colours: gold, cyan, rose), `setMatch(i, bool)` lights that stone's cap, `setSolved(0..1)` vision flash, `setEye(0..1)` lid | NE, NW, SE r .6 |
| graft | `trunk`, `branch0..3` (E, S, W, N, cut here), `bench`, `vise`, `viseSlot` (Object3D between the jaws: parent the clamped item model to it) | `setBranch(i, 0..1)` regrowth (0 = bare stub with a pale cut face), `setViseClosed(0..1)` jaws, `setViseProgress(0..1)` front-edge bar, `setViseDone(bool)` green glow | NE r .75 (bench) |

Glyph index 0..5: dot-in-circle, triangle, diamond, cross, crescent, wave.

## Look and budget
- Shared tree identity: gnarled trunk through a ceiling collar, glowing sap veins and a thin sap-coloured floor ring in the type colour, paver slabs, a leaf canopy. Per type: living green (well), charred and ember-red with brain-lobe swellings (press), pale weeping aqua willow in a pool (spring), violet petrified trunk with crystal canopy and a carved eye plaque (seer), two-tone grafted trunk with bast wraps and four limbs (graft).
- Draw calls per room (room only): well about 21, press about 22, spring about 14, seer about 22, graft about 19 (budget 25). Triangles 9k to 14k. No lights, no textures above 256 px (bark, stone, wood, leaf, ripple, glyph atlas generated once per THREE instance), shared materials except the few per-room ones (sap, leaf, water).
- Sprites (additive glow) are used for the fruit, vats, eye, stone caps; they are the only transparent-sorted parts besides water.

## Notes for the integrator
- Ceiling collar and canopy sit at y 6.2 to 6.5: the room's own ceiling coffers will overlap; hide ROOMART ceiling dressing inside r 3.5 for tree cells, or leave a hole as the plan says.
- Additive glow is invisible on the white floor, so floor rings are opaque sap colour; animate-by-brightness uses the per-room `sap` material colour scalar.
- The Well is the only room whose trunk scales: at stage 1 the big ancient stump (r 2.2, 0.6 m high, low enough to step over visually but NOT solid) frames a 2 m sapling. If the stump should block, add a ring of solids in wiring.
- Husks, the carried bucket, scion items and the clamped item are logic-side objects: attach them to the named anchors.
- Sudden death: `setPoolGlow(0)` and `setBasin(i, 0)` for the spring.
- Preview: `node` static server over the repo plus `/three/` -> `node_modules/three/build` (see tools/preview-trees-a.html header for URL params: `type`, `view`, `set=setStage:4,setFruit:1`, `cam`, `snap=1`, `save=name`).
- Not tested inside the real game (the wiring is out of scope); `npm test` untouched since no existing file changed.

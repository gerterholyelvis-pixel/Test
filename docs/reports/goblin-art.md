# Goblin art: sculpted figurines for all five types

Code: `game.js`, block `GOBLINART-BEGIN/END` (replaces the old `buildGoblin`, keeps the `GKKIT` helper block it uses). Hooks elsewhere, one line each: the frame loop calls `GA.anim` (replacing the old inline leg/arm/torso/head lines) and `GA.tick`; the player-list loop calls `GA.gear`; the "actor left" line calls `GA.die`; `combatTick` uses `u.hunch` instead of a fixed 0.14 for the torso lean; `GK.build` now builds with a title-screen weapon (`buildGoblin(t, true)`). `GK.ga` is a test hook (build, anim, draws, caches). No lights, no render passes. Light count unchanged: 9 PointLight + 1 Hemisphere.

## How the goblins are made
- **Geometry kit (`GB`).** Pieces (displaced/sculpted spheres, tapered `TubeGeometry`, `LatheGeometry`, bevelled `ExtrudeGeometry` ears and stars, tori, cones) are transformed and merged into one `BufferGeometry` per animated group. Vertex colours carry the paint (noise-mottled skin, pale belly, darker sockets and cavities) and an `aMat` vertex attribute carries roughness, metalness, emissive amount and cloth-texture mix per vertex.
- **Sculpted head.** An ellipsoid pushed into a heavy brow ridge, sunken eye sockets, cheek bones, sloped forehead and a jutting underbite. On top: hooked nose with nostrils, curved tapered tusks and side fangs, thick lip, crooked teeth, glowing slit-pupil eyes with angled lids, warts and scars, big bevelled droopy ears with a pink inner ear (twin mesh) and a cartilage ridge.
- **Body.** Hunched back, pot belly with pale front, spine ridge, ribs, skinny tapered limbs, big flat clawed feet or boots, big three-fingered hands curled round the weapon axis.
- **One material per type (`uber`).** A `MeshPhysicalMaterial` patched with `onBeforeCompile` (one shared program for all five): per-vertex roughness, metalness and emissive; skin with a 512 px procedural bump map (pores, wrinkles, warts) and a soft sheen; cloth and leather with a 512 px per-type stitched weave (seams, sewn patches, damask for the king); gold is polished metal with a faint emissive; eyes, gems and stars are emissive so the bloom picks them up. Textures and geometry are built once per type and shared by every goblin of that type (first build 35 to 85 ms per type, then free).
- **Personalities.**
  - Small: oversized ears with a torn notch, patched rag tunic with a ragged hem, rope belt, satchel, bandana with knot tails, tuft, nose ring, bare clawed feet.
  - Medium: soldier. Studded leather harness with crossed straps, tassets, belt pouch, bracers, kettle helm with chin strap and horsehair crest.
  - Big: hunched brute with a small head on huge shoulders, scars through the face and across the chest, war paint, horn stubs, bone necklace, skull buckle, one huge and one small spiked pauldron with fur trim.
  - Wizard: crooked wavy-brimmed hat with gold stars (baked into the head), pleated starry robe with gold hem, mantle, sash, bell sleeves, curled slippers, tiered moss beard, white moustache and brows, cyan eyes, orbiting sparkle points.
  - King: jewelled crown (band, eight fleur points, arches, orb, cross), ermine mantle and skirt trim, damask tunic, gold pauldrons with gems, chain with ruby pendant, big buckle, fan collar, braided beaded beard, curled moustache, one arched brow and a smirk, earrings, ring, the existing cape texture on a swinging cape.
- **Gear on the body.** The weapon is mounted by the existing viewmodel code into the hand socket (`arms[1].userData.el.userData.hand`, unchanged API). The title screen mounts the type's starting weapon itself (hidden in game as soon as the viewmodel mounts the real one). Armour: each type's own outfit is baked in (it matches that type's starting armour family). Wearing armour of another family adds one overlay mesh over the torso (cached per type, family and tier): `cloth` tunic, `leather` studded vest, `mail` rows of scales, `harness` crossed straps with spiked pads, `plate` cuirass with gorget and pauldrons, `robe`, `royal` mantle. Trim colours follow the item tier. Names kept: `head`, `earL`, `earR`, `armL`, `armR`, `legL`, `legR`, `torso`, `hand`, plus `u.arms/u.legs` and `sh.userData.el`.

## Animation (all code, `GA.anim`)
- Idle breathing (torso and shoulders), head look-around, random ear twitch (one or both ears, damped ring), ears droop and bounce with steps.
- Bouncy waddle: body bounce with squash and stretch, roll, legs splay, counter-twisting torso and head, arm swing.
- Hit flinch: squash, arms flare out, ears pin back, hat tilts (on top of the existing knockback and lean in `combatTick`).
- Death slump (`GA.die` / `GA.tick`): when an actor disappears right after being hit or at 0 HP, the group is kept for 2.3 s: knees buckle, torso folds, arms fall, ears flop, topples sideways, fades, then `dropGoblin`.
- The old walk/swing hooks still work: `a.swing`, `vmPose3` and `vmEnd3` run after `GA.anim` in `combatTick`, so swings override the arm pose and the next frame restores the hold pose.

## Draw calls per goblin (counting meshes, sprites and points)
| Type | Before, unmerged | Before, after the merge pass | After |
|---|---|---|---|
| Small | 164 | 62 | 12 |
| Medium | 188 | 83 | 12 |
| Big | 233 | 75 | 12 |
| Wizard | 282 | 122 | 13 |
| King | 356 | 149 | 13 |

After = 10 body parts (2 legs, torso, 2 upper arms, 2 forearms with hands, head, 2 ears) + ground shadow + name tag, plus the king's cape or the wizard's sparkle points. Not counted: the health bar sprite over other goblins and the weapon model the viewmodel mounts (3 to 4 draws). The lazy merge pass finds nothing left to merge. Because of the draw-call budget the old halo sprite (king), ground magic circle (wizard) and floating glyph sprites were dropped, and the wizard's hat no longer sways on its own.
Triangles are about 55 to 73 k per goblin (shared geometry per type); the old goblins were 100 k+ before merging.

## Tested
- `node --check game.js` passes.
- `?offline=1` loads with no console errors (title, Start, offline match with bots, swings, hit flinch, kills).
- Title showcase renders the new goblins with their starting weapons.
- Debug lineup (own scene, IBL only, a debug light that is not in the game): walking, flinch, death slump, all armour families on different types.
- Screenshots: `docs/screens/art-goblins-lineup.jpg`, `docs/screens/art-goblins-closeup.jpg`.
- `node tests/run.js`: world and server-items etc. pass; `combat`, `matchmaking` and `netcode` fail with "could not get two players into one match". Only `game.js` and docs changed, so that is the server/matchmaking side (not touched here).

## Not tested / notes
- Character portraits (menu.js 2D `drawHead`) are unchanged canvas drawings and do not use `buildGoblin`.
- Online play with real server gear names (offline bots have no `gear`, so the armour overlay was only exercised in the lineup); real hit/kill slump timing at 60 fps.
- The title-screen mirror reflection is a static clone, so idle animation is not shown there. Cloning uses `userData.toJSON`, which now returns `{}` (the old code JSON-copied the whole rig).
- Gems look slightly pastel under the studio IBL; the in-game bloom is unchanged.
- If a new item family is added, add a branch to `gaArmor`.

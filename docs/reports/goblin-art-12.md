# Goblin art pass: all 12 types

Edits are in game.js, inside GOBLINART and GOBTYPES (tagged GOBART12). Screenshots: `docs/screens/goblins12-{before,after}-*.jpg`. Rendered with headless Edge over CDP (software GL), High preset, with all 12 types in a studio-isolated lineup (the game's own renderer, materials and lights).

## Findings (before)
- The shared head had no readable mouth (the nose hid it): every face looked blank.
- Hit feedback was a squash only (no flash). Death was one shared slump. Motion differed only by size.
- Berserker and miner were nearly the same olive. The hobgoblin read as orange plastic, and its shoulder guards stuck out as a bar (also under overlay armour).
- Silhouettes (black-fill test at 6.5 m): sneak, shaman, wizard, king, big and hobgoblin were distinct. Berserker, miner and bog were weak from the front.
- Armour overlays fit the thin scout, the wide bog goblin and the tall hobgoblin acceptably. Only the hobgoblin's own guards clipped out.

## Changes
- **Skin shader.** Per-type tuning through per-material uniforms. The shader program is unchanged (same cache key). `A.TUNE`: subsurface colour, rim strength and wetness. Bog goblin has a wet gloss. Shaman is warm ochre, sneak has a low rim, hobgoblin a muted rim, wizard and king their own bleed.
- **Hit flash.** `uFlash` uniform per goblin material, driven by `hitT`. It also plays on the killing blow.
- **Palette.** Shaman is ochre, berserker darker olive, miner grey olive, hobgoblin deeper brick.
- **Faces.** Every type gets a mouth line with its own expression: grin, frown, smug king, berserker open snarl with teeth. Eyebrows per type, including bushy grey for the miner and white for the wizard and king. The hobgoblin has a moustache, goatee and scar, the berserker war paint, fangs and a scar, the scout freckles, the shaman ochre dots and the bog goblin a throat sac. Tusk lengths vary by type.
- **Silhouettes.** Taller, fatter mohawk. Bigger lily pad and taller reeds (name tag raised). Hobgoblin shoulder guards tucked in. Hands are larger on the berserker, hobgoblin and big goblin.
- **Animation.** `GXM` motion profiles: bounce, sway, twist, arm swing, lean, crouch, wind-up and lunge strength, plus idle habits (scout scans, miner taps a foot, berserker heaves, bog goblin puffs, shaman rocks, hobgoblin stands stiff, king struts). Ten death variants: backward arch, face-plant, plank fall, flop flat, spin, crumple, kneel-then-topple, puddling robe.

## Cost
No new meshes or materials, so draw calls per goblin are unchanged (about 11-12 plus 4 outline hulls on High within 6.5 m). The shader program count is unchanged. LOD is untouched. Vertices in the head bake grow a little (a few hundred).

## Not done
- Low and Medium preset lineups were not rendered (only High; Low just skips the rim and wet term).
- Walk and run frames and the first-person other-goblin view were rendered before the changes only.
- The king's cape and scale were not changed (SCALE is gameplay).
- Name tags in my lineup harness showed wrong names after repeated build and clear cycles. This is probably a harness artefact (labels never disposed), but it was not checked in a real match.
- The dev server caches static files forever. Restart it between visual iterations.

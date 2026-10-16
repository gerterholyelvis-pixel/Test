# T10: goblin look (skin shader, rim, outline, pauldrons, ears, viewmodel hand)

Code: `game.js`, inside the GOBLINART block (small local edits) and the VIEWMODEL materials. No new lights. The program count stays low: the goblin material is still one shared program (`goblin-uber`, all types and per-goblin colour clones), plus one tiny program for the outline hull (`goblin-hull`) and one for the first-person hand (`vm-skin`).

## What changed
- **Skin shader (A5).** The patched `uber` material now flags skin by roughness 0.55 (preset `SK`). On skin it adds a warm fresnel rim (colour from a shared uniform: warm orange in rooms, fades to gold inside the vault) and a fake subsurface bleed (albedo goes red-orange at grazing angles). Vertex colours lose some vinyl saturation and get ruddy blotches. Per-goblin colour variation (`uberVar`) and `A.curMat` are untouched.
- **Ears.** The flat mauve inner-ear band is replaced by a vertex-colour gradient (deep rose at the root, softer pink, skin at the rim) with faint veins, drawn with the new `SKE` preset (small emissive, so thin ears glow red against the light). The outer ear warms towards the tip. No more rainbow gradient.
- **Pauldrons (A6).** `GA.pauldron()` builds three overlapping lathe lames with rolled edges, a ridge and curved tapered spikes. Used by the Big goblin, the King (gold) and the armour overlays: plate, scrap, spiked, bone, bulwark and gilded. The sphere + torus + cone versions are gone.
- **Outline (A7).** Inverted hull (back faces, normals pushed out 1 cm, dark ink colour) on the head, torso and both ears only. Shared geometry (the simplified LOD level 1 once built), one shared material. Medium and above, goblins within 6.5 m, never your own goblin, off when the LOD drops.
- **Viewmodel hand (A13).** Same skin look (pore and wart bump, rim and subsurface via `GA.skinPatch`), redder bigger knuckles, the sleeve uses the stitched cloth weave, and the palm sits behind the handle so the weapon no longer passes through it.
- **Presets.** Low: rim, subsurface and outline all off (uniform `uRim` = 0, no hull meshes shown), so it is plain lit. Medium, High, Ultra: all on.

## Cost (headless Chrome, SwiftShader software GL, so only relative numbers matter; 8 goblins in view at 3 to 6 m, High)
| | Draw calls per goblin | Frame total (8 goblins) |
|---|---|---|
| Before (Low, or outline off) | 11 to 12 | baseline |
| Outline on | 15 to 16 (+4) | +32 draws, about +220 k triangles (+25 %) before the 6.5 m cut-off |
| Rim and subsurface | 0 | within noise (under 1 ms on a CPU rasteriser) |

Measured frame time on SwiftShader (8 goblins, forced outline on): 18.1 ms vs 15.0 ms with it off (High), 18.4 vs 13.8 (Medium). The outline is the only real cost and it is distance-gated, so a typical fight (1 to 3 goblins within 6.5 m) adds 4 to 12 draw calls. The shader additions are a handful of ALU ops per skin pixel. Program count of the whole game: about 61 to 69 in these runs (unchanged apart from the two small new programs).

## Screenshots (`docs/screens/`)
`t10-before-*` and `t10-after-*`: `types` (all 5 goblin types, gameplay lighting in the vault corridor), `closeup`, `ears`, `armour0..2` (15 armour families on the Medium goblin), `pauldrons`, `hand` (after only; the before hand is visible in every before shot), and `t10-after-types-low.jpg` for the plain Low look. Note: the brief says 12 types; the game has 5 goblin types, shown with all armour families.

## Notes for the merger
- `SK` roughness is now 0.55 and is the skin flag in the shader. Any new preset that is not skin must not use roughness 0.55.
- `GA.tick` reads the vault position as |x|, |z| < 10 around the origin (does not depend on world.js).
- `GA.hullStep` is called from the top of `GA.anim`; the title-screen goblins have no outline.
- Test lineup scripts used for the shots live outside the repo.

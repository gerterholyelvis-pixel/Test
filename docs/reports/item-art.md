# Item art: custom 3D models and baked icons

New file `itemart.js` (ES module, `window.GKART`). Everything is built in code (lathe, bevelled extrusions, swept tubes, displaced spheres) with procedural canvas textures. No lights are added to the game scene (checked: 9 PointLight + 1 HemisphereLight after loading, baking, chest rooms and the merchant).

## What was built
- `GKART.model(key)`: fresh `Object3D` for all 20 weapons, 20 armours, the 6 tier-0 base items, the 4 class items (staff, scepter, robe, royal mantle), `m:brain[:n]`, `gold` and the 8 material parts (`part:wood`, ...). Built along +y and centred on the origin. Weapons are 0.9-2.1 m tall (dagger 0.95, sword 1.5, claymore 1.85, spear 1.9, halberd 2.05); armour is a 1.25 m torso on a small wooden display stand. Unknown or future items fall back to a representative of their family. Returns `null` for keys it does not know, so `weaponModel` keeps its old code as the fallback.
- 13 weapon families (sword/dagger/knife, club/stick, mace, axe, spear, bow, crossbow, flail, halberd, hammer, staff, scepter) and 7 armour families (cloth, leather, mail, harness, plate, robe, royal). Items vary by parameters (blade length, notches, serrations, curve, guard type, pommel, spikes, haft, colours, textures).
- Procedural textures, all at most 512 px, generated once and cached: wood grain with knots and nicks, brushed and scratched steel, pebbled stitched leather, cloth weave, burlap, quilting, chain rings, scale, bark, hide, ermine, royal velvet, starry silk. Materials, geometry primitives and one prototype per key are cached; `model()` returns `proto.clone()`, so geometry and materials are shared between all instances.
- Tier accents follow ART.md: common is dull and worn (darker steel, rougher), uncommon is clean, rare adds a blue gem, mythic adds purple runes on both faces (a shared emissive material pulsed by one tiny rAF loop) plus a soft glow sprite, legendary adds a gold filigree vine, a pulsing ember emissive on the gold and an orange glow, transcendent switches the metal to an iridescent physical material, adds a cyan gem, a glow and 22 floating sparkles (one `Points` draw call).
- Static geometry is merged per material, so an item is a handful of meshes.

## Draw calls per item (measured with `GKART.drawCalls(key)`)
| group | calls |
|---|---|
| Common/uncommon weapons | 1-4 (stick 1, club/dagger/sword/handaxe/bow 3, spear/mace/axe/crossbow/ironsword 4) |
| Rare+ weapons | 4-5 (flail, longbow, halberd, warhammer, claymore, wyrmspear, executioner 5) |
| Transcendent weapons | 6 (extra glow sprite and sparkle Points) |
| Common/uncommon armour | 3-4 (stand + body + trim) |
| Rare/mythic armour | 4-6 (plate, royal mantle 5-6 because of gold rims, gem, ermine) |
| Legendary/transcendent armour | 6 |
| Brain, gold, parts | 1-3 |

So the budget of about 4 holds for common to rare items; mythic and above go to 5-6 because the gem, the glow sprite and the sparkles are separate draws by design. Obsidian, dragonscale, mythril and the aegis are the heaviest at 6.

## Baked icons
- `GKART.bake(renderer)` uses a private scene with its own three directional lights, a hemisphere light and a PMREM `RoomEnvironment` (none of this touches the game scene). It renders into a 320 px MSAA float `WebGLRenderTarget` (no second WebGL context), 3/4 view (yaw about 0.5, tall weapons tilted 42 degrees so they fill the square, camera slightly above), orthographic fit to the model's bounding box. A second pass renders a white coverage mask, which gives a clean straight alpha on a transparent background (tone mapping and sRGB are applied in JS, because render targets skip them). The tier back-glow (green faint for uncommon, then rare to transcendent colours, pink for brains, gold for gold) is painted behind the model. Icons are 160 px canvases cached in a map.
- The renderer's state is restored after every batch (render target, clear colour and alpha, tone mapping, XR flag, `info.autoReset`).
- Batches run in a `setTimeout` loop with a 10 ms budget per batch and a 40 ms gap, one icon at least per batch, so loading does not stall. The game schedules it two frames after the first frame plus 600 ms (`// ITEMART` line before `window.__gk =` in game.js).
- `icons.js`: `GKICONS.draw` and `GKICONS.canvas` keep the same API. When a baked icon exists it is drawn instead; otherwise the old 2D drawing runs. Canvases created before their icon was baked are remembered (weak references) and repainted on the `gkart-icons` event.
- Debug: `GKART.sheet({cols, cell})` returns a contact-sheet canvas and `GKART.showSheet()` overlays it on the page. `GKART.tune` holds the bake light intensities and exposure.

## Hooks in other files
- `game.js`: 2 lines marked `// ITEMART` (top of `weaponModel`, and the bake schedule before `window.__gk =`).
- `index.html`: one line in the module block, `try { await import('/itemart.js') } catch ...`, between three and game.js. If itemart fails to load, the game falls back to the old models and icons.
- `server.js`: the static route regex gets `|itemart` (the server only serves whitelisted client scripts). Nothing else in the server changed.
- `icons.js`: described above.

## Numbers (software GL in the Browser pane, so slow)
- Building all 60 prototypes (40 items + base/class items, brain, gold, parts): about 0.45 s total.
- Baking all 60 icons in one go (dedicated renderer): about 2.9 s. In the game it completes in about 5 s of wall time, spread over frames at around 20 fps.
- No console errors or warnings after the changes. `npm test`: all 5 files pass.

## Screenshots (docs/screens)
- `art-items-inventory-before.jpg`, `art-items-inventory-after.jpg`
- `art-items-chest-weapon.jpg` (warhammer, mythic), `art-items-chest-armour.jpg` (Titan's Aegis)
- `art-items-merchant-shelf.jpg` (shop panel with the baked icons)
- `art-items-contact-sheet.jpg` (all 60 icons: 20 weapons, 20 armours, 6 base items, 4 class items, brain, gold, 8 parts)

## Risks and not done
- Mythic runes and legendary filigree are small and mostly visible in the 3D displays, not in 40 px icons.
- The merchant counter in the game does not show item models (the stall has only props); items appear on the shop panel and in chest/mystery displays.
- Armour on the chest dais is smaller than weapons (1.25 m against 1.5-2 m), and the lid hides its lower part. A per-display scale would fix it but lives in game.js.
- `disposeTree` in game.js disposes geometries that are not in `keepGeo`, including the shared item geometry. It is harmless (three re-uploads on the next use) but costs one re-upload per display change. Registering GKART geometries in `keepGeo` would avoid it.
- Models are built lazily on first use (a few ms each, at most about 20 ms for the biggest). The first chest room load with a new item pays that once.
- A couple of icons are thin by nature (short bow, sharpened stick). Stylisation could exaggerate them more.
- The old `MY.weaponProto` path (mystery rooms) calls `weaponModel` and then re-normalises to 1.9 m, so mystery weapon displays pick the new models up automatically. Not separately screenshotted.
- Wizard staff, scepter and goblin-held weapons use the same models via `weaponModel`; hand-held scale and orientation were not re-checked.

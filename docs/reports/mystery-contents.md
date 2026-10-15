# Mystery room contents (mystery agent)

Code: `game.js`, block `MYSTERY-BEGIN` .. `MYSTERY-END` (four self-contained `{ }` parts sharing helpers through `GK.mys`).

## Public API
- `GK.buildMysteryContents(room, group, variant)` - already called by the rooms agent in `buildInterior`. Builds into a child `root` of `group` (root is re-oriented from `room.cx/cz/dx/dz`, so it works with any group transform): origin = room centre on the floor, +z = toward the door. Door side (z > ~1.2) is left clear. Calling it again rebuilds.
- `GK.disposeMysteryContents(group)` - removes `root`, disposes the per-build geometries, cloned materials and instanced meshes (shared/cached ones are kept). Called by the rooms agent before it rebuilds.
- Animation: one hidden `onBeforeRender` hook mesh (same trick as the chest block), also pushed on `GK.tickers`; only rooms within 90 m of the camera animate. No lights added. Static meshes get `matrixAutoUpdate = false`; animated pivots carry `userData.dyn`.
- Helpers exported on `GK.mys` (`mk`, `grp`, `MM`, `BM`, `lbl`, `ring`, `pool`, `spot`, `tierMats`, `weaponProto`, `AB` armour builders, `ENEMY` goblin builders, `rod`, ...).

## Variants
| kind | what is built |
|---|---|
| weapon | stone dais, tier-coloured spot cone, floating/spinning weapon (uses `GK.chestKit.weaponModel(key)` when present, normalised to ~1.9 m; own fallback models for all 13 families in `GK.mys.WB`), tier aura (glow, sparkles for mythic+), label `name` / `Tier N - X dmg` coloured by tier (`TIER_COL`) |
| armor | dais + wooden mannequin (slowly turning, 1.25x) wearing a family model: cloth (sack, patched, rags, gambeson), leather (scraps, vest with studs, hide jerkin, boiled), mail (chain-ring / scale texture, brigandine, dragon, mythril), harness (straps, spiked pauldrons, skull buckle), plate (cuirass, banded, knight, dwarven, obsidian, aegis), robe, royal; tier styling (tinted materials, rare+ ring, mythic+ sparkles); label `name` / `Tier N - X HP` |
| enemy | five hostile goblins with red/orange glowing eyes, red `ENEMY: <Name>` label (troll adds gold `RARE`), pulsing red floor ring + pool, per-type idle: regular (cleaver, jerkin, scar, breathing/head turn), dumb (cross eyes, bucket on head, wooden spoon, drool, head wobble), speedy (running lean, mohawk, twin daggers, streaks, dust puffs, twitchy flicks), archer (hood, scarf, quiver, longbow drawn with arrow, IK arms), troll (1.9x, moss/stone skin, tusks, spiked collar, tree-trunk club) |
| stations | two stations side by side using `GK.stations[name](parent, 0, 0, 0)` (rooms agent builders; they bring their own nameplates), own fallback builders (recycler, knowledge tree, workbench) if missing |
| gold | open wooden chest overflowing with instanced coins, bars, gems, glow, shafts, sparkles, label `N gold` (pile size scales with the amount) |
| plushie | big stitched goblin plushie (button eyes, stitched smile and seams drawn with tubes, belly patch, mismatched floppy ears, ribbon bow) on a cushion on a rug, toy blocks, floating hearts/sparkles, label `Goblin plushie` |

## Tests
Server on port 3901, Playwright shots with a hand-made layout (room 0 = mystery, variant per shot): all 5 enemies, gold, plushie, stations, axe + sword weapons, aegis/chain/royal/knight armour, claymore weapon. No console or page errors in the runs. Shots: `docs/screens/mystery-*.jpg`.

## Not checked
- Every one of the 20 weapons / 20 armours individually (only a sample was viewed); the rooms-agent `weaponModel` is used for weapons, so my own `WB` fallbacks are only exercised if `GK.chestKit` is absent.
- Station size vs walls with the rooms agent's real station builders (the workbench is wide; looked inside the room at x = +-2.0 but not measured against the walls).
- Overview (V key) look and performance on real GPUs (only software GL).
- Plushie/gold labels were partly cropped in my low camera shots; label heights were not tuned further.
- Troll glow sprite was moved behind the troll after the last screenshot (not re-shot).

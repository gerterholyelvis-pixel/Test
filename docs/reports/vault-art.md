# Vault art: vaultbreaker heist rooms and vault dressing

New file `rooms5art-vault.js` (ES module, no dependencies beyond `three`), preview page `tools/preview-vault.html`, screenshots `docs/screens/art-vault-*.jpg`. Nothing in game.js / world.js / server.js / index.html was touched.

Look: "gilded grime" craft in the white facility. Bevelled (extruded) boxes, lumpy lathe mounds with a painted coin texture, chains of tori, riveted brass, vertex-colour wear (dark near the floor, per-part jitter), noise-painted wood/iron/stone/weave textures (256 px, generated once and cached per THREE module). Emissive and sprites only: no lights, no PointLight changes.

## Usage

```js
import { buildVaultbreaker, buildVaultDressing, buildDoorCracks, vaultbreakerSolids, transformSolids } from '/rooms5art-vault.js';
const room = buildVaultbreaker(THREE, { glowTex }, 'ram', { onImpact: s => shake(), crackZ: 0.07 });  // helpers optional ({glowTex}); opts.lazy builds skins on first use
scene.add(room.group);  room.group.position.set(cx, 0, cz);  room.group.rotation.y = rotY;  // rotY: turn the local north wall (vault door) to face the real vault door
room.setSkin('keystone');              // per-round shuffle: swaps skin, banner, door plates, plays the RE-KEYED flash (setSkin(t, {flash:false}) to skip)
room.update(dt, nowSeconds);           // once per frame, only for rooms in the cull set (it ticks just the visible skin)
const ks = room.skin('keystone');      // state-setter API of a skin (builds it lazily)
```
Add `transformSolids(room.solids, cx, cz, rotY)` -> `{x,z,r}` circles in world space. The footprints are identical for all 4 skins (the plan's anchors: B 2.4x1.0 as 3 circles, L/R 1.2 boxes as r0.72 circles, FL/FR r0.6). Everything else (lane, socket, grates) is floor.

## Room-local frame (vaultbreaker, 22.5 x 15, H 6.5)
- Origin at the room centre. Vault door in the middle of the wall at `z = -7.5`; `B` wall at `z = +7.5`; `L`/`R` at `x = -/+11.25`; `F` lane `x in [-1,1], z in [-7.5,-2.5]`.
- `room.anchorsOf(type)` / `room.anchors` return `{x, y, z, r}` per station in this frame (BASE: B L R FL FR F door; plus the names below). Rotate with the same transform as `solids` (and add `y`).
- Banner is a plaque over `B` (y 5.2), two round door plates at `x = +-3.45, y 3.0` beside the vault door. **`room.setBreach(0..100)`** shows the 3 crack stages (>=15, >=50, >=85) on the room face of the vault door. It is in the shell (not the Ram skin) because breach persists across a re-key. It sits at `z = -7.5 + opts.crackZ` (default 0.07 m in front of the wall plane); set `crackZ` to the real door face, and hide `room.group`-level cracks when the door is open (the cracks mesh is `room.group.children` named `doorCracks`; or use `buildDoorCracks()` yourself for either face).

## Skin APIs (all setters are cheap and idempotent)
**ram** anchors `winch crankL crankR pawl lever wedgeRack lane ram doorImpact tensionLamps barricades[3]`
`setTension(0..6)` (drum, cranks, 6 ratchet lamps), `setRamPull(0..1)` (telegraph), `strike(strength)` (swing, calls `opts.onImpact(strength)` at contact, door-glow), `setLever(0..1)`, `setWedges(0..2)`, `setBarricade(slot 0..2, hp 0..1)` (0 removes; 4 planks vanish as hp falls, `hitBarricade(slot)` shakes it), `setBarricadeGhost(slot|-1)` (placement preview). Barricade slots are 3 spots in the lane at `z = -3.7, -5.0, -6.3`, 2 m wide.
**locksmith** anchors `lockFace pins[5] grindstone bell noiseGauge grilleL grilleR keyBoard`
`setPin(i, 'idle'|'set'|'jam', v 0..1)` (shear line at v 0.9), `setPins(n, v)`, `setNoise(0..100)` (10-lamp gauge green/amber/red, bell sways more and more, beacon red from 50), `ring()`, `setGrind(bool|0..1)`, `setCut(0..1)` (keyhole glow), `setAlarm(bool)`, `setGrille(side 0|1, open 0..1)`.
**counting** anchors `desk clerk board scales strongbox sackStandL sackStandR clerkBell`
`setMarket({writPrice, counterPrice, writs 0..3, counters 0..3})` (redraws the price board, loads the scale pans, tips the beam), `setStrongbox(0..1)` (gold mound in the box), `setLid(0..1)`, `setRobbery(0..1)` (lid trembles), `setAlarm(bool)`, `setSacks(side, n 0..3)`. A seated clerk (head bob, quill) sits behind the teller grille.
**keystone** anchors `socket stones[4] (glyph 0=L 1=FL 2=FR 3=R) altar glyphRing flameBowls`
`setOrder([4 stone indices])` (floor ring shows the order), `setProgress(0..4)` (next glyph pulses), `setStone(i, 'dark'|'lit'|'snuffed', burnFrac)` (flickers under 0.15), `setArmed(bool)` (keystone hovers, flames go white-blue), `setResonance(0..100)` (3 lamps at 30/60/90), `setAltar(0..1)`.

## Vault dressing (`buildVaultDressing(THREE, helpers, {half: 11.25, H: 6.5, claimR: 2.45, crackZ})`, centre at the origin)
`setTreasury(0..1)` (4 gold mounds grow, coins spill, ingot stacks appear), `setCoffer(i 0..3, 0..1)`, `setDoorBar(dir 'N'|'E'|'S'|'W', bool, instant)` (the bar slides from its wall rack across the door; `isBarred(dir)`), `setBreach(dir, 0..100)` (inside face), `setClaim(progress01, colour)` (72-tile ring at r 2.45 fills in the owner colour; the floating crown tints), `setContested(bool)`, `setAlarm(bool)` (red beacons and sweeping fans over the 4 doors), `setGrate(0..1)`, `update(dt, now)`. Anchors `K1..K4 D_N D_E D_S D_W dais grate`. Solids: the 4 coffers (2 circles r0.5 each, turned toward the dais). The pillars, dais plate, medallion and relic pedestal are the existing game.js ones; the dressing does not duplicate them. Wall racks sit on the +x side of each door (looking into the room), heaps on the -x side.

## Budget
Measured with the preview (visible meshes, per skin, incl. the shell): ram ~24, locksmith ~28, counting ~29, keystone ~23 (limit 30; `room.stats()`). Hidden skins cost no draws, only memory (lazy build avoids that). Vault dressing ~22 (alarm fans add up to 4 only while on). Static pieces of a skin are baked into ~6 meshes (one per material class), movers are separate small meshes, lamps/barricades are instanced. No PointLights. Textures: 3 x 256 px noise maps + weave + coins, one 1536 x 384 banner canvas, 128 px plate canvas.

## Integration notes
- `room.update` must run every frame for visible rooms (banner flash, sway, flames). Pure state calls need no update to take effect except tweens.
- Per-round shuffle: call `setSkin(newType)` at the round boundary; all state setters of the old skin stay as they were (reset the machines yourself: `setPins(0)`, `setTension(0)`, `setStone(i,'dark')` ...).
- Cracks: the vault-door breach can also be shown from the vault side with `dress.setBreach(dir, v)`.
- The preview page needs a static server with `/three/` mapped to `node_modules/three/build`; it saves screenshots through a `POST /save/<name>.jpg` that the real server does not provide (only `PV.shot`).
- Not done / ideas: the clerk is a hand-built goblin but not the shared `buildGoblin` model; icons for tokens (wedge, key, leaf, charge) are not in this file; no audio.

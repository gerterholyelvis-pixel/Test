# Feel 2: attack input, damage direction, hit marker, culling depth

Code: `game.js` only, every addition tagged `FEEL2` (blocks `FEEL2-BEGIN/END`, one-liners `/* FEEL2 */`). No lights, no dependencies, no server change.

## What changed
1. **Attack input** (`CB` block, before `combatSync`): `combatSwing()` now records `CB.nextAt` (cooldown end). Mousedown on the canvas (same lock condition as before) sets `CB.held`; if the swing is refused and the cooldown ends within 180 ms the click is buffered (`CB.buf`). `feel2Tick()` (called from `frame()` right after `const mine`) calls the normal `combatSwing()` as soon as `performance.now() >= CB.nextAt` while a buffered click or the held button exists, so animation, sound and `{atk:1}` are unchanged. Window `mouseup` and `blur` clear the hold; the buffer and hold are dropped when the play guards fail (inventory/shop open, not spawned, locked, not in play); a hold ends if the pointer lock is lost. Clicks earlier than 180 ms before the cooldown ends are still dropped.
2. **Damage arc** (`feel2Arc`, called in `combatMsg` when `h.to === me` and the attacker actor exists): one reusable fixed `div` at screen centre, rotated by the attacker's bearing (`atan2(d.R, d.F)`, forward `(-sin yaw, -cos yaw)`, right `(cos yaw, -sin yaw)`), showing a ~40 degree red ring segment at 36% of the shorter screen side; opacity animated (hold, then fade over 700 ms); a new hit cancels and re-aims it. z-index 46, above the existing vignette (45). Works for bots and mystery NPCs (any actor).
3. **Hit marker** (`feel2HitMark`, called from `vmHit`): one reusable fixed SVG "X" (four short strokes) at centre, 120 ms, white; on `h.dead` 170 ms, 1.45x size, gold `#ffd75e`. Sound: `audio.js` already has `hit` and `combatMsg` already plays it for my hits (`snd('hit', {})`), so nothing was added to `audio.js`.
4. **Culling depth** (`fxCullBegin`): the unlimited fixpoint loop is replaced by a breadth-first expansion over open doors limited to 2 door hops for `low`/`medium` and 3 for `high`/`ultra` (and any other value). Uses a reusable `fxCull.dist` Map (cleared per frame, no new allocation per frame); the `near` set and the actors loop are untouched.

## Verified (offline mode, `PORT=3111`, new tab, software GL at about 1 fps)
- `node --input-type=module --check < game.js` OK; `npm test`: all 18 test files pass (server untouched).
- Console: no JS errors (one 404 for a non-script resource and ANGLE shader precision warnings, both unrelated).
- Hold: dispatched mousedown on the canvas and held 3 s: swings fired every frame once the 598 ms club cooldown allowed (about one per frame at 1 fps), stopped on mouseup.
- Buffer: swing, then click 120 ms before cooldown end: `CB.buf` set and the second `{atk:1}` was sent; click 400 ms before the end: not buffered, no extra swing.
- Arc and marker: bot fight with held attack, both elements created; animations paused mid-way for a screenshot: red arc at the screen edge pointing to the attacker and the white X at the crosshair, alongside the existing vignette and "-15".
- Culling, all 24 doors open (sudden death state), `low` quality, draw calls: edge room 713 and centre room 895 versus 1162 with culling off (= old behaviour with all doors open); visible rooms 12 / 13 versus 21. `high` (3 hops): 17 rooms at an edge room, 21 from the centre (a 3x3 grid with corridors is only 3 hops deep from the centre, so no saving there, as specified).

## Not verified
- Real mouse with pointer lock (events were dispatched; lock was refused in the embedded pane so the `lockRefused` path was used), real frame rate feel (about 1 fps in the test pane, so buffer timing precision below one frame was not measured).
- Draw calls with the post-processing composer (`medium`/`high`): `info.render.calls` only counts the last pass there; only `low` draw calls were compared.
- Arc direction was checked by derivation and one visual sample, not against a bot placed at each compass point.
- Online play; hold-to-attack against the real server cooldown (client cooldown equals the server's, server allows 10% jitter).

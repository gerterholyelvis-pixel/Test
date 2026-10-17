# Tree rooms: played for real, bugs fixed

## Method
Real server on a random port with `GK_DEBUG`, headless Edge (D3D11) over CDP with trusted key / mouse input (`tools/qa/drv.js`), plus a new helper lib `tools/qa/th.js` (teleport to an anchor, force a tree type into a cell with `actDbg`, read prompts / actS / actMe / toasts / inventory, hook every `actFx` / `actFail`). Node ws clients (`tests/lib.js`) for server-only paths (death, second human).

Played end to end in a browser: all 10 types (Well: 4 timed cranks, buckets, pour, fruit; Press: rouse, kill husk, press brain; Spring: bottle, blessed, early release, pool heal; Seer; Graft; Thorn: choose, hold, bank, walk away; Gambler: feed, ride, take, caps; Memory: show, input; Oak: nook, Warden; Elder: 3 stones, waking, seed). Also checked: prompts only in reach, arcs, banner, ceiling junction and 4-angle screenshots per type, collision, draw calls (tree room view 100-140 calls vs 95 in a plain hall on Medium), reload / resume, death while gripping, offline demo, no console errors, no server exceptions.

## Bugs found and fixed (regression tests in `tests/tree-rooms-fix.test.js`)
1. **Client collision only knew the trunk (r 1.1).** `world.js propsAt` reads the tree type from `types.trees`, the client passes `CHEST_ROOMS` and nothing ever set `.trees`. Posts, press vats, spring basins, seer stones, the Well stump (r 1.7) and the Oak arch were walk-through for the player while the server blocked them: rubber-banding (125 server corrections in a few minutes of play) and being pushed out of props. Fix: `R5.onMsg` sets `CHEST_ROOMS.trees` from `trees` / `matchStart.trees` / resume; offline placeholder trees set it too.
2. **Grafting Bench never became "ready".** `ACT.view` had no clock, `station.state(vise)` compared against `undefined`, so the public state stayed `run` forever: no "Take the grafted item" prompt, the vise art never finished, the player lost his weapon into the vise. Fix: `ACT.view(st, type, now)` passes `now` to `spec.view`, graft uses it, act5 passes it. (`use NE` always worked on the server.)
3. **Held Hollow Oak was not hidden from the map.** The server sent `roundState.hidden`, the client ignored it, so the minimap showed the Warden. Fix: `GKACT5.hiddenAt` in the minimap actor filter (except for the room I stand in).
4. **Elder stone art ran at double speed** while held (server `prog` already includes the running channel, the client added the channel time again).
5. Small: Elder stone arc had an empty label ("Waking the root-stone"); the dry spring still offered "Bottle" in sudden death (server refuses).

## Verified fine
Prompts (reach r+1.3 vs server r+1.4), E / R / Q verbs and holds for all 10 rooms, timing hits, caps ("enough for now"), husk spawn / fight / loot (`x:huskbrain`) / press, no NPC inside a prop, Thorn grip and banking, memory run and reward, Spring pool heal ~2 HP/s, death clears grip and channels, reload resumes with the right types, perf, art setters all exist and are driven.

## Remaining / not done
- Bots barely use tree rooms (not examined beyond a 3-minute server run: no errors).
- Prompts are offered for actions the server will refuse: Take graft item inside the owner window, Crank / Grip while another goblin holds it. Toast says "Not yet" / "Someone is already using it".
- Graft: grafting takes the equipped weapon without a confirm; vise bar restarts if you enter mid-run; the clamped item is not drawn.
- Seer: the "+3 knowledge" toast is replaced at once by the global "consulted the Seer" toast.
- Standing in the Hollow Oak nook puts the camera against the bark.
- Not seen: High / Ultra with bloom, a real GPU, audio, a second human in a browser, a real 8-goblin match with human play (bots).
- `release.test.js` fails in this worktree only because `esbuild` is not in the linked `node_modules`; balance / bots5 are load flakes that pass alone.

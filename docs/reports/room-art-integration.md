# Room art integration (task C: client rendering of homes, tree rooms, vaultbreakers, vault dressing)

The four art modules (`rooms5art-home.js`, `rooms5art-trees-a.js`, `rooms5art-trees-b.js`, `rooms5art-vault.js`) are now built into the real arena. Branch `worktree-agent-a981189065d08d70c` (fast-forwarded to main `6dc34af` first).

## What was wired
- **Loading:** `index.html` imports the four modules (plus `mergeGeometries`) into `window.GK5ART` before game.js; each import is in its own try/catch, a missing module leaves those rooms plain. `server.js`: the four names are in `CLIENT_JS`, and the static regex now allows `-` and digits (the whitelist still decides).
- **game.js `ROOMS5ART` block** (after ROOMART, one `R5` object, `GK.r5`): builds the 8 homes (`c0, c2 .. c14`), the 4 tree rooms (6, 8, 16, 18), the 4 vaultbreakers (7, 11, 13, 17) and the vault dressing (12). Each room sits in a frozen wrapper group (`matrixAutoUpdate=false`, tagged `userData.r5`), so the existing FX portal culling hides it with its room. Lazy queue: the camera room and its 2-hop neighbours one room per frame, everything else one room per idle slot, nearest first by door hops. During the wheel / countdown the own home is built behind the screen. `update()` runs only for rooms in `fxCull.vis`. Everything is disposed on `matchEnd` and `pagehide`; nothing is rebuilt after it.
- **Small hooks elsewhere in game.js (all tagged ROOMS5ART):** `R5.tick(t)` after `fxCullBegin()`; `GK.r5.onMsg(d)` at the top of `handleMsg0`; ROOMART skips homes when the home art exists; the old placeholder bench/recycler kits stay as invisible E-prompt targets (Raycaster ignores visibility; "Use recycler" prompt verified); LAMPS moves a home's pooled lamp to the art's lamp anchor (3.1 m, under the false ceiling); `fxBuildBlobs` skips the wrappers. **No PointLight was added** (9 + hemisphere unchanged).
- **State (client):** `GK.state.X` if present, else the same field of the messages seen, else a placeholder derived from the match (`players` ids and names, offline: constant). Fields: `trees` (array in cell order 6, 8, 16, 18 or `{cell: type}`; names as rooms5-trees.js: well press spring seer graft thorn gambler memory **oak** elder, `oak` is the Hollow Oak), `vb` / `vbNext` (`{cell: type}`; a change calls `setSkin`, which plays the re-key flash), `breach` (`{cell: 0..100}`: cracks on the vb side and the vault side), `treasury` (0..1, or gold / 100), `crown` (`{id, p, contested?}`), `alarm`, `bars` (`{N,E,S,W: bool}`). Homes: `GK.state.homes[key] = {pump 0..1, alert, dead, lv:{lock, alarm, sentry, lockbox}}`; own pump also from `tank / tankCap`; owner name from the actors, owner colour = one of 8 per home slot (nameplate text; `setOwner(name, colour)` added to the home art).

## world.js (shared with the server; new tests)
- Collision now matches the art: `HOME_SOLIDS` (9 footprints turned into inscribed circles by `rectCircles`, 24 circles per home), `TREE_SOLIDS` (10 types), `VB_SOLIDS` (7 circles, rotated to face the vault), `COFFERS` (8 circles in the vault). `HOME_LAYOUT` moved to the art's bench and recycler. New exports: `HOME_SOLIDS HOME_K TREE_SOLIDS VB_SOLIDS VB_SCALE COFFERS rectCircles treeKind treeTypeOf`.
- **Tree type reaches collision through `layout.trees` / `m.trees`:** `propsAt(x, z, types)` reads `types.trees`, `obstaclesIn(key, m)` reads `m.trees`. **Merger / server agent: set `m.layout.trees = m.trees` where the roll is stored** (arrays lose extra properties in JSON, which is fine). Until then the server only knows the trunk (r 1.1), the client blocks more (no rubber banding, only a laxer server).
- **Wiring fixes from the reports:** Well stump is solid (trunk r 1.7; reach is `r + 1.4`, so the sapling stays usable); Hollow Oak nook walls are solid (6 circles, the nook stays walkable); hatch doorway width comes from `WORLD.DOORS` (4 m); vault door cracks sit on the real door face.
- **Scales (real wall faces are `T / 2` inside the cell boundary):** the home art walls (4.98) are scaled by `HOME_K` = 0.944 onto the 4.7 m faces; the vaultbreaker group by `VB_SCALE` (x 0.973, z 0.96); the vault dressing is built with `half = V / 2 - T / 2`. Solids are scaled the same way.
- **Vaultbreaker layout change (art edit, `LAYOUT` in rooms5art-vault.js):** every wall of a real vaultbreaker room has a door in its middle, and the art put the B, L and R stations exactly there (they blocked three doors, which the door guard tests caught). The three stations now stand beside their doors: B at +4.7 m along its wall, L at +3.9, R at -3.9 (anchors, banner and keystone stones moved with them; banner smaller and higher to clear the door frame). They sit on the wall-map side of the control panels.
- Tests changed because tree rooms now have a trunk and vb rooms have stations: `doorguard` and `props` start their reachability walk from a free spot and only check random spawn points in plain halls (only homes use random spawn points); `props` home kinds; `utility` smoke-bomb test uses a plain hall (room 9) instead of tree room 8 (the trunk is now in its line of fire). Props order: a home is never a mystery room.

## Tests
New `tests/rooms5art-wiring.test.js` (9 checks): world tables equal the art footprints (all 10 tree types, home rects, vb, coffers), Well / Oak solids, `layout.trees` / `m.trees`, vb props face the vault and stay inside, homes keep doorway / spawn / bench front free, the four modules are whitelisted, served (and a made-up one is 404) and imported. `GK_TEST_JOBS=3 npm test`: all files pass except timing flakes under load that pass alone (`bots` tick, `utility`).

## Draw calls and cost (headless Chrome, software GL, 800x450, per frame; "plain" = same view after `matchEnd` disposed the art)
| view (all doors open = sudden death) | Low art / plain | Medium+post art / plain |
|---|---|---|
| vault centre N / E | 268 / 225, 272 / 220 | n/a, 316 / 250 |
| vault corner | 312 / 255 | 353 / 296 |
| home back wall (inside) | 67 / 35 | 80 / 49 |
| home doorway | 184 / 153 | 217 / 193 |
| tree 6 looking north | 517 / 477 | 711 / 692 |
| vb 7 far wall | 216 / 170 | 237 / 206 |
| vb 11 vault door | 391 / 317 | 442 / 366 |
Art costs about +20 to +60 calls per visible art room. The worst view (tree room straight through open doors) was already 477 on Low before the art (the Foundation's 455 was the vault view); doors closed: about +10 to +50. Build time: 17 rooms 1.5 to 1.9 s total in this headless run, at most 155 ms for one room (largest: home / tree), spread over frames and idle slots. 70 to 150 textures, 60 to 80 programs.

## Screens (`docs/screens/c-*.jpg`, 960x540, Low, no post)
`c-home-back / pump / door / sign-outside`, `c-tree-6-press / 8-spring / 16-graft / 18-well`, `c-vb-7-keystone / 11-ram / 13-counting / 17-locksmith / 7-side / 7-rekey / 7-cracks`, `c-vault-north / heaps / alarm-claim`. Dev tool: `tools/r5shot.js` (real headless Chrome over CDP: starts the offline demo, moves the camera, saves JPEGs, prints draw calls) with `tools/r5shot-views.js` as the scenario used. Needs a node_modules next to the server.

## Not done / for the merger
- Not seen: an online match with the real server fields (trees, vb, treasury, crown are placeholders offline), real GPU timing, High / Ultra look with post and bloom (leaf and glow brightness may need a pass), the Hollow Oak nook and the tree activity props in play. The claim ring sits on the dais top and is hard to read at this angle; the alarm beacons are small.
- The home's false ceiling (3.8 m) hides the interior in the overview / death camera (ceilings of the shell are hidden, the art one is not).
- Tree-room activity setters (stage, press, vats, ring...) are not driven yet (rooms show their idle state); `GK.r5.room(key).api` exposes them for the activity task. Tree types a and b take `snap()` on build only.

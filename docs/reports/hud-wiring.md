# hud-wiring (task D): hud5.js wired into the game

Branch `worktree-agent-a9d4c00a609207afc`, merged with main `6dc34af`. Client only. Screens: `docs/screens/d-*.jpg` (1080p and 960x540 sets: play, rekey, bigmap, crown, arc, arczoom, room, panel, wallmap).

## What changed
- `index.html`: `<script src="/hud5.js">` before game.js. `server.js`: `hud5` in `CLIENT_JS`, and the static route regex is now `[a-z0-9]+` (a digit in the name was a 404). No CSP change is needed (script-src 'self').
- `game.js`, one tagged block `HUD5-BEGIN/END` (after MINIMAP-END) plus small hooks:
  - `GKHUD5.onMsg(d)` is called after `applyRound` in the message handler. It maps: `trees` (welcome, matchStart), `round`+`vb`+`vbNext`+`sudden` to `hud.roundState` (re-key banner at round start, "Re-key in Ns" 15 s before the end), `crown` to the claims panel and edge alarm (only when it carries `claims`; the old crown-rule `{id,name,p,ms}` is left to RULES), `actMe` to the activity arc (null stops it), `actFx` to hit/miss/done/rekey, `actS` stored in `GK.actState[r]`. Missing messages are no-ops.
  - Room-name banners: a 5 Hz poll calls `hud.enterRoom(key, type)` for tree cells, vaultbreaker cells and the vault. Standing in a room that re-keys calls `hud.rekeyed`.
  - Dev button: the Foundation `#gkDbgFF` is removed; hud5's button (beside the round timer) shows only in play with `GK.dbg`, sends `{dbgFF:1}` (server honours it only under GK_DEBUG).
  - Minimap and M map: `draw()` now builds a state (fog kept: loot rooms once discovered, goblins only when visible or flared) and paints with `HUD5.mapOps/drawMap`. Door-pick arrows, Panel Lens, my pick ring and claimed ticks stay as overlays. Special icons, "next" icons, armed ring, breach bar, pulsing vault ring and home names (M map) come from hud5.
  - Wall maps: `GK.hud5Map` paints special-room icons and labels onto the shared facility texture (redrawn on vb/trees change). Forge and Grand Recycler use hud5 glyphs instead of clipped text.
  - Panels: `roomName` returns the function name for tree/vaultbreaker cells ("Seer's Tree", "Keystone"), so door labels and panel headers say what is behind a door instead of "Room 9". Panels redraw on vb/trees change.
- `hud5.js`: room banner gets a soft dark backdrop (it was unreadable on white floors); `paintIcon` exported.
- Fix to the Foundation: a `//` comment on the players-list line had swallowed `vmGear / GA.gear / UNIQUE.sync / SOC.sync`, so other goblins' weapons and gear never synced. Split onto its own line.
- CSS vars: skip button right of the timer, crown panel at `max(130px, 24vh)` (clear of the 15% banner).

## Shapes assumed (not on the server yet)
`vbNext` (roundState, `{cell:type}`), `breach` (`{N,E,S,W:0..100}`) and `armed` (`[cell]`) on the roundState, `actMe` `{chan|timing}` with `t0` in server time (compared with `srvNow()`), `actFx` `{r,k,id?}`, `actS` `{r,t,st}`, `crown` `{claims,gaining,active}`.

## Verified
Headless Chrome (swiftshader) over CDP, offline demo with injected messages, 1920x1080 and 960x540: banners, minimap, M map, crown panel plus tints, arc, room banner, panel labels, wall map. No console errors. `tests/hud5.test.js` has a wiring test. Full `npm test`: only `bots` (timing, passes alone) failed under load.

## Not verified
Live special-room server messages (none exist yet), a real GPU, `?offline` has no vb so icons only appear with injected data. Tree icons on the 220 px minimap are small but legible; hud5 sizes were not changed. The activity arc `tri` needle curve must match the server's period when it lands.

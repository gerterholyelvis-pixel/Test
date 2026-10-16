# hud5: client HUD pieces for the 5x5 arena

New files: `hud5.js` (UMD, no deps on game.js or three), `tools/preview-hud5.html` (mock-state preview, `?s=timing|channel|thorn|rekey|next|room|tree|crown|sudden|map|debug|all`), `tests/hud5.test.js`. Screens: `docs/screens/hud5-*.jpg`. Nothing in game.js, world.js, server.js or index.html was touched.

## Wiring (a few lines in game.js)
```html
<script src="hud5.js"></script>   <!-- before game.js, or any time before first use -->
```
```js
const hud5 = HUD5.createHud5({ root: document.body, getMe: () => me, debug: !!welcome.dbg, onSkip: () => net.send({ dbgFF: 1 }),
                               clock: () => srvNow() });   // clock optional, default Date.now(); must match the t0 domain of actMe
```
| server message / game event | call |
|---|---|
| `roundState` (every one, also in welcome) | `hud5.roundState(msg)` reads `round{n,left,dur}`, `vb`, `vbNext`, `sudden`, `crown`. Shows "Vault re-keyed" at round start and "Re-key in Ns" once, 15 s before the end (needs `vbNext`) |
| `actMe` | `hud5.me(msg)` : `chan:{a,t0,ms,label?,ticks?}` or `timing:{a,t0,per,wa,wb,label?}` starts the arc; neither present stops it |
| `actFx` | `hud5.fx(msg)` : `k:'hit'`/`'miss'` (own timing press) flashes the arc, `'done'` completes it, `{k:'rekey',type}` shows the re-key room banner |
| room change (`noteRoom` equivalent on the client) | `hud5.enterRoom(roomKey, type)` with type one of well, press, spring, seer, graft, thorn, gambler, memory, oak, elder, ram, locksmith, counting, keystone, vault. Same room within 20 s is ignored |
| `crown` | `hud5.crown({claims:[{id,name,s}], gaining:id|null, active})` : top-3 panel (bars relative to the leader, no "full" target, per owner Q1) and the edge alarm tint while `gaining != null` or `active` |
| vault alarm without a crown message | `hud5.alarm(bool)` |
| sudden death flag | `hud5.sudden(bool)` (also read from `roundState.sudden`) |
| welcome `dbg:1` / `?debug=1` | `createHud5({debug:true})` or `hud5.debug(bool)`: "Skip to 0:10" button, calls `onSkip` |

Local (non-server) arcs: `hud5.channel({t0,ms,label,ticks})`, `hud5.timing({t0,per,wa,wb,label})`, `hud5.stop()`. `ticks` are fractions (Thorn Shrine tiers: `[1/3,2/3,1]` with `ms` 9000). Timing needle: ping-pong `tri((now-t0)/per)` along the arc, window `[wa,wb]` as 0..1 along the arc; if the server uses another curve, change `tri` in `arcFrame`. Positions: arc under the crosshair, crown panel top centre (`--gk5CrownTop`), skip button `--gk5SkipTop/--gk5SkipLeft`, banners 15% from top. All are `pointer-events:none` except the skip button. CSS is injected once, prefixed `gk5-`.

## Maps
`HUD5.mapOps(state, {big})` returns drawing instructions in world metres (rect, icon, text, door, breach, ring, dot, me) for 25 arena cells + 16 attached rooms; `HUD5.drawMap(ctx, S, ops, {north, yaw, follow, time})` paints them into a provided 2D context (caller draws the parchment and the fog logic: pass `discovered` and `actors` already filtered). State: `{me:{x,z,yaw}, vb:{cell:type}, vbNext, trees:{cell:type}, layout:{cN:'home'|'forge'|'recycler'|'chest'|'merchant'|'mystery'}, homes:{cN:name}, myHome, armed:[cell], breach:{N,E,S,W:0..100}, crown:{active}, discovered:[cN], open:[{x,z,h,open,vault}], actors:[{x,z}]}`. Icons: ram, key (locksmith), coin stack (counting), keystone gem, tree dots in the tree-type colour, crown (vault), houses (own home gold), anvil, recycler arrows, chest/merchant/mystery. Faint "next" icon top-right in each vb cell; armed keystone gets a ring; breach is a crack bar on the vault edge (orange at 50, red at 100); the vault gets a pulsing ring while the crown alarm is on. `HUD5.cellAt(x,z)` gives the room key of a point. The existing minimap block in game.js can keep its fog/door logic and swap its 3x3 loop for `mapOps`.

## Notes
- Preview needs an http server (file:// renders a static snapshot). Pass `hold:true` to `createHud5` to keep banners up (preview only).
- Not wired: no game.js edit was allowed. Wall maps and panels are out of scope.

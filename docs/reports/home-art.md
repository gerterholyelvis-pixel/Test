# Home room art (rooms5art-home.js)

New file `rooms5art-home.js` (ES module, same importmap as game.js) plus `tools/preview-home.html` (needs a static server mapping /three/ to node_modules/three/build and /three/addons/ to examples/jsm; query flags are listed in the page hud). Screens: `docs/screens/art-home-room.jpg`, `art-home-door-upgrades.jpg`. Nothing in game.js, world.js, server.js or index.html was touched.

## API
`const home = buildHomeRoom(THREE, {}, { doorSide: 'S'|'N'|'E'|'W', seed, owner, ceilingY = 3.8, doorW = 2.4, doorH = 2.7, size = 10, shell = true })`
- `home.group`: origin = room centre, floor y 0, already rotated so the hatch is on `doorSide` ('S' = +z). Add it to the scene and set `group.position` to the room centre.
- `home.anchors`: Vector3 (room-relative, rotated) for `bench, recycler, pump, screen, lockbox, spawn, door, lamp, map`; each has `.yaw` (facing, sin/cos convention). `map` is the empty wall spot for the shared wall map.
- `home.solids`: `[{x,z,hx,hz}]` footprints (room-relative, rotated) of the big props.
- `setPumpLevel(0..1)` (eases), `setPumpAlert(bool)` (red glow for raids), `setUpgrade(name, level)` with `lock` (1 = timber bar, 2 = iron bars + padlock), `alarm`, `sentry`, `lockbox`; `ringAlarm()`, `setSentryTarget(x, z | null)`, `setScreenPower(bool)` (dark when the owner dies), `setOwner(name)` (hatch nameplate), `update(timeSeconds)` once per frame while visible, `dispose()`.

## Integration (game.js / rooms5.js)
```js
import { buildHomeRoom } from './rooms5art-home.js';   // server.js CLIENT_JS regex is [a-z]+ : serve this file name explicitly or extend the regex
const home = buildHomeRoom(THREE, {}, { doorSide: sideOfHatch, seed: homeId, owner: name });
home.group.position.set(cx, 0, cz); scene.add(home.group);
// per frame, only when the room is in the cull set:  home.update(performance.now() / 1000);
// on state: home.setPumpLevel(tank / tankCap); home.setUpgrade('lock', lv); ...
```
Notes for the merger:
- The home brings its own plank floor, plaster/wainscot walls and a lowered ceiling at 3.8 m (cosy and dark). The shell walls and ceiling can stay; they are hidden behind it. Move this room's pooled PointLight to about (cx+0.4, 3.1, cz-0.6), under the false ceiling. The lamp glow and floor light pool are emissive sprites, not lights.
- Cost: 31 draw calls base (7 merged static meshes), 45 with every upgrade shown, about 100k triangles. Textures are created once and shared by all 16 homes (cached per THREE namespace); static materials are shared, so `dispose()` frees only geometry and per-home materials.
- The hatch is sized for a 2.4 x 2.7 m opening; pass `doorW/doorH` to match WORLD.DOORS.
- Preview-only: the page adds a stand-in PointLight at the lamp position.

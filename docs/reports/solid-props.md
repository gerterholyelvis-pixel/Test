# Solid props

Crates, barrels, urns and the relic pedestal are now obstacles. Footprints live in `world.js` (shared by client prediction and server validation).

## API (world.js)
- `solidsOf(roomKey, type)`: circles `{k, x, z, r, ...}` in world metres. `allProps(types)` lists every room. `types` is the 12 chest-room types (server `m.layout`, client `CHEST_ROOMS`); only `'mystery'` chest rooms have props.
- `slide(x0, z0, x1, z1, rad, types, withRects)`: depenetration plus a tangential turn when a move is head-on (no sticking). `inProp`, `segBlocked(x0,z0,x1,z1,types,pad)`, `propsAt(x,z,types)`, `PILLARS` (vault pillar rects, server only: the client already blocks them), `RELIC`, `storyOf(i)`.

## Footprints (circle radius r, walker adds 0.45 client / 0.33 server)
- Grid rooms (not vault): one big crate (r 0.48-0.60) in a SOUTH corner, optionally a small one beside it (r 0.30-0.37). Story corner: theme 0 two crates (r 0.40, 0.35), theme 1 two upright barrels (r 0.38) and the tipped barrel as two circles (r 0.36). Only kept when clear of the door strips and the north-wall panels.
- Vault: pedestal at RELIC (vx+2.4, vz) r 0.68, two crate stacks in the south corners (hoards moved to the north corners). Pillars: rects +-0.6 at (+-5.4, +-5.4).
- Mystery rooms only (room frame, +z to the door): crates r 0.62 / 0.30 at (-2.8,-2.85) / (-1.95,-3.2), urns r 0.5 / 0.36 / 0.34 at (2.9,-2.9) / (2.0,-3.15) / (3.2,-1.7).
- Not solid (flat or tiny): broken crates, bone piles, sacks, coins, buckets, the small chest-room corner crates.

## Behaviour
- Client: after the wall slide, `WORLD.slide` pushes the player out of props; falls back to the old position if that would enter a wall.
- Server: `pathOk` rejects steps inside a footprint (radius 0.33, skipped when the start is already inside); all bot/NPC moves (`mv`) go through `slide` (0.45 plus pillars), so bots walk around props. Staff bolts stop on props and cannot hit through one; melee further than 0.9 m is blocked by a prop between attacker and target; the thrown plushie lands outside props.
- ROOMART now draws the corner crates from `solidsOf` (the old random corner-crate loop was removed); vault hoards both in the north corners. A console warning fires if the story-corner replica in world.js ever disagrees with game.js.

## Tests
`tests/props.test.js`: footprints inside rooms, determinism, flood-fill reachability of door fronts, panel spots, spawn range, relic sides and mystery rooms; sliding from every angle; segBlocked; server correction versus edge sliding. `tests/rules.test.js` crown test moved the attacker to the west side of the dais (the pedestal now stands at +2.4).

## Notes
`bots.test.js` timing checks (refused moves, 2 ms sweep) are flaky when the machine is busy; baseline fails the same way under load.

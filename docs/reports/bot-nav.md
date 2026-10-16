# Bot navigation and item use

New file `botnav.js` (pure, server only) plus small wiring in server.js (marked NAV).

Obstacle interface: a list of `{x, z, hw, hd}` (axis-aligned box, half extents) or `{x, z, r}` (circle); `solid:false` is ignored. `obstaclesFor(m, room)` in server.js reads, in order: `WORLD.obstaclesIn(room, m)`, `m.obstacles` (array, or map room -> array), `WORLD.OBSTACLES`; a flat list may tag items with `room`. No obstacles means zero extra cost. When the prop branch lands, only `obstaclesFor` needs a one-line change if its names differ.

Behaviour: `stepTo` steers around obstacles (bot radius 0.4, the detour side is chosen once and kept, so no flip-flopping at doorways or crates), moves a target inside a prop to its edge, and steps a bot out if it ended inside one. `botFight` orbit moves slide along props. Stuck detection (`BN.track`): under 0.3 m of movement in 1.1 s, or under 0.3 m gain on the goal in 3 s; escalates: flip side, short sideways leg, drop the route and re-plan.

Items (stat based, no ids): `equipBest` picks highest attack / health across backpack and quick slots; `botHeal` drinks any consumable with a numeric `heal` (smallest potion that covers the missing health, never at full health); bots also pick up heal drops. Brains and plushies are unaffected.

Tests: `tests/bot-nav.test.js` (unit: steering, stuck, pushOut, item picks; server: a bot walks round a synthetic crate/barrel via the GK_DEBUG `botlab {nav:{...}}` hook, equips best gear).

Merger notes: players cannot yet eat heal items (`eat()` only handles brains); bots consume them directly in `botHeal`. Server move validation (`pathOk`) does not know about props; the prop agent should add it. Bots already avoid the same footprints. Under heavy machine load the existing timing tests (bots tick cost, bots-combat) can flake; they pass alone. The security static test fails in a worktree without node_modules/three.

# Climb: real jumps and standable props

Space is now a real jump onto crates and barrels. Client prediction and the server share one vertical model. The code lives in `world.js` (CLIMB block), the `server.js` JUMP/CLIMB blocks, and the `game.js` JUMP block.

## Model (world.js)
- **Jump:** `CLIMB` gives an apex of 1.2 m with 0.6 s of airtime (G 26.7, V0 8). Steps of 0.35 m or less are automatic. There is 0.1 s of coyote time and a 0.12 s jump buffer. There is no fall damage.
- **Prop data:** every prop circle carries `h` (its top height, taken from the art) and `climb`.
- **Walls and support:** a climbable prop only acts as a wall while your feet are more than one step below its top. You stand on it while your centre is within `r + SUP` (0.15).
- **Functions:**
  - `groundY(x,z,types,y)` returns the floor, the vault dais (0.16), or the top you are over.
  - `vstep` is one vertical frame.
  - `climbPush` pushes you out of a prop at 5 m/s at most and slides you off a rim at 2.5 m/s.
  - `climbFrame` is the full per-frame step used by the client and the tests.
  - `slide`, `inProp` and `segBlocked` take an optional height. Old callers without it stay 2D.
- **Climbable:**
  - Corner crates (0.5-1.0 m) and story crates.
  - Upright and tipped barrels.
  - The small mystery crate.
  - Home barrels (0.82 m) and the home crate stack (1.2 m).
  - The bedroll (0.3 m, an auto-step).
- **Not climbable, and why:**
  - Tall things: pillars, tree trunks, the 1.57 m mystery stack.
  - Narrow tops: urns.
  - Relic pedestal: the relic sits on it.
  - Coffers: they are open chests.
  - All vaultbreaker stations, tree corner props and benches/recyclers: cluttered or tall art (survey: none have a clean low top).

## Server
- **Height in messages:** `{m}` sends the feet height in cm as its 4th element. Snapshots carry it in the speed slot, as before.
- **Height check (`climbY`):**
  - Your height is raised to the surface under you.
  - It is capped at the surface you launched from plus APEX.
  - You cannot rise again once falling.
  - You are put down after 3 s in the air.
  - A top more than a step up can only be reached through the air.
  - A refused height gets `{fix:[x,z,y]}`. This does not count as a speed correction.
- **Path check:** `pathOk` uses the highest height on the segment, plus 0.1 m.
- **Stuck guard:** it ignores a goblin standing on a top.
- **Melee:** reach is 3D, but the first 0.8 m of height difference is free, so a goblin on a crate can always be hit from its foot.
- **Line of sight:** it passes over a top that is 0.12 m below the line. Lines are drawn at chest height (feet + 0.9).
- **Bolts:** they fly at the shooter's chest height and can pass over or under a target.
- **High ground:** standing (not mid-jump) at least 0.5 m above the target gives +10% damage, melee and ranged. The hit message carries `hg:1`. I kept it small because the crates are open to everyone.
- **Bots:**
  - They still walk around every prop.
  - An idle bot, every 25-60 s, may hop onto a climbable top within 6 m, look around for 3-7 s and walk off.
  - A target, a hit, or a refused move ends the perch.
  - `GK_BOT_PERCH_MS` is a debug-only override.

## Client
- **Movement and network:**
  - The jump is buffered, the camera eases over steps, and the landing dip scales with the fall.
  - Take-off and landing frames are sent at once.
- **Feel:**
  - Goblins squash and stretch.
  - The blob shadow stays on the ground and fades with height.
  - Feet stand on the surface.
  - The landing puff appears at the surface height.
  - Steps and landings on a top use a wooden knock (`audio.js` surface `wood`).
- **Remote goblins:** they appear on tops through the snapshots.
- **Hints:**
  - A one-time "SPACE jump onto it" shows under the crosshair near a crate, remembered in localStorage.
  - The controls table explains the jump.

## Tests
`tests/climb.test.js` has 10 tests:
- The model (apex, coyote time, buffer, steps).
- `groundY`.
- The climbable set and doorway clearance.
- Climbing every arena crate from every free angle.
- Stability: no drift, a clean step-off, rim slide-off, smooth unstick.
- Server climb and stay: the stuck guard leaves you alone.
- Server rejects teleporting up, flying, hovering, double jumps and jumping into a trunk.
- High-ground hit +10% and a normal hit from below.
- 3 climbs at 100 ms jitter with 0 corrections.
- A bot perches and comes down.

`netcode.test.js` now uses the new jump clamp.

The full `npm test` run (3 jobs) passes. Security's static tests need `node_modules` in the worktree: I added a junction to the main checkout's `node_modules`, which is gitignored.

**Browser check:** headless Edge on a real GPU through `tools/qa/drv.js`. I ran up to a hall crate and jumped. The heights were 0 → 0.75 → 1.17 → 0.87 and he stayed on top, with 0 corrections and no console errors. Screenshots: `docs/screens/climb-1-approach.jpg`, `climb-2-jump.jpg`, `climb-3-ontop.jpg`.

## Notes for the merger
- **Not done:** no lag-compensated height rewind (hits use the current y). The hover limit uses wall-clock time, so it is 3 s to stay safe at low fps.
- **Bot perches:** they use `idleLook`, so a bot waiting at an activity anchor can perch briefly.
- **Home barrels:** they sit 1.1 m from the doorway edge, inside the home.

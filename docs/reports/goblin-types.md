# Goblin types: 12 starting goblins

**What changed**
- items.js `GOBTYPES` block: the `GOBLINS` table (name, odds, size, health bonus, reach, perk, menu texts), `rollGoblin`, and the perk helpers `goblinHit`, `goblinHp`, `hitRadius`, `goblinReach`, `goblinRegen` and `goblinStart`. `START`, `KNOWLEDGE` and `SPEED` are extended with `push`. Type ids 0-4 are unchanged, because saved-character tokens store them. The new types are ids 5-11.
- Odds: Small, Medium and Big are 20% each. The other nine taper by about x0.74: Scout 11.2, Sneak 8.2, Miner 6.1, Wizard 4.5, Shaman 3.3, Berserker 2.5, Bog 1.8, Hobgoblin 1.4, King 1.
- server.js:
  - uses the shared roll.
  - Token and debug type range is 0-11.
  - Max health = armour + type bonus.
  - Applies the perks in `hitTarget`. A dodge broadcasts `{dodge}`.
  - Melee reach and bolt radius grow with the target's size.
  - Applies the shaman's faster regeneration and the miner's starting pouch.
- game.js:
  - `NAMES`, `SCALE`, `STATS` and `GEAR` get the new types appended from items.js.
  - The `GOBTYPES` art block adds feet, outfit, headgear and arm gear for each new type, baked into the existing part meshes. Draw calls per goblin are unchanged (15-16).
  - Adds per-type eyes, ears and name-tag heights, a "dodged" float, and the health bonus in the stat panel.
- menu.js: a 12-slot wheel with heads for the new types, and the perk shown on the reveal. The Characters panel gets a roster of all 12 goblins (3D portrait, odds, perk, description).
- save.js: name pools for the new types.

**Tests**
- New tests/goblin-types.test.js:
  - checks the table.
  - rolls the odds 1,000,000 times.
  - checks the perk maths.
  - runs a duel balance sim: each new type wins 47-60% of its duels.
  - checks that the client tables stay consistent.
  - joins the server once per type.
- Updated the type range in bots.test.js and balance.test.js.

**Notes for the merger**
- The shared names are `GOB_PERKS` and `HIT_R`. They are exported at the end of `GKITEMS`.
- The sim shows that the original five are unbalanced in pure duels: Big wins 96%, Wizard 7%. I did not retune them.
- World collision radius is still one value for every type (client RAD / server PROP_R). Size only changes the hit box.
- `bots.test.js` "refused bot moves" fails intermittently (4-11 refused against a limit of 3). It fails just as often on an untouched HEAD export (checked: 3 of 4 runs), so it comes from bot nav, not from this change.
- `security.test.js` static tests need node_modules inside the worktree. With it, everything else passes.

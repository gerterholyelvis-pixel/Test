# 5x5 Foundation (F0)

Branch `worktree-agent-ade9610b0d711bbdd`, built on main `227dc79` and merged with main `60ecfae` (no conflicts). This implements docs/PLAN-5x5.md section 8, Phase 1.

## What changed

### world.js v2
- The arena is 5x5 with keys `'0'..'24'`. The vault is room 12 (`VAULT_KEY`) at the origin.
- There are 16 attached rooms, `'c0'..'c15'`, in a pinwheel, clockwise from the NW corner. Even ids are 10x10 homes and odd ids are 8x8 loot rooms.
- New exports, exactly as in plan section 6: `N, NARENA, NATT, HS, VAULT_KEY, HOME_IDS, LOOT_IDS, TREE_CELLS, VB_CELLS, ROOMS, roomRect, DOORS, WALLS, ROOM_DOORS, HATCHES, alwaysOpen, attachedAt, homeOf`. Extras: `kindOf, attLocal, HOME_LAYOUT, LOOT_LAYOUT, EDGE`.
- `DOORS` holds 56 doors in the canonical order: for each cell, its E door, its S door, then its attached door. Kinds are `arena`, `vault`, `loot` and `hatch`.
- `WALLS` lists every wall segment: the door walls, 4 bare corner walls, and 3 walls for each attached room.
- `randomPoint` now accepts room keys as well as indices.
- Solid props for the new room kinds:
  - Tree and vaultbreaker rooms have no story corner.
  - Vaultbreaker crates sit in the corners away from the vault door and obey the keep-clear zones.
  - Homes have solid footprints for the bench, the recycler and one crate.
  - The Forge and the Grand Recycler have solid station footprints.
  - The tree trunk is left to task B/C.

### Other shared modules
- **doorguard.js:** takes the vault key as a parameter and a skip set (the vault and the homes by default). Hatches never count as exits. The open-door argument can be an array or a function.
- **items.js:**
  - `randomLayout()` returns 16 entries. Homes are fixed. One Forge and one Grand Recycler sit on opposite sides. The other 6 roll chest 45 / mystery 35 / merchant 20, with at least one merchant.
  - Adds the `STATIONS` table and `recycleEff`.
  - Adds the `canCraft` and `addKnowledge` adapters.

### server.js
- Every door table comes from WORLD. `VK` replaces the hard-coded `'4'`. `isOpen` treats hatches as always open.
- `inBounds` uses `attachedAt`.
- Each goblin gets its own home, facing the doorway. `pub()` includes `home`.
- Every round is 120 s (`GK_ROUND_MS` / `GK_NEXT_ROUND_MS` override in debug). Sudden death comes after round 5 and the decision after round 7.
- `{dbgFF:1}` skips the round to 0:10 only under `GK_DEBUG`. The queue message, matchStart and resume welcome carry `dbg:1`.
- `stationAt(m, p, kind)` returns `{kind, type}`:
  - home: normal bench, recycler at 50%
  - forge: master bench
  - grand: recycler at 100%
  - merchant and mystery stations: unchanged

  Only the recycler efficiency is applied. Bench tiers, craft time and owner-only use are task E/I.
- Hatches are excluded from votes, from `paceNoDoor` and from wedge/pry.
- The door guard counts a goblin at home as an occupant of its cell, so about 5 s after GO each occupied cell gets an arena door.
- Hooks are left as `null` for later tasks: `m.trees`, `m.vb`, `m.vbNext`, `m.ram`, `m.claimant`, `m.relicRestock`. `trees` goes into matchStart and the welcome, and `vb` into roundState, when they are set.
- **Fix from the test agent, in `mv()`:** bot steps are capped at 1.2 m and shortened when the step clips a prop. This brought refused bot moves to 0.

### game.js
- Walls and doors are built from `WORLD.WALLS`, so `doors[i].id === i`. Hatches are open archways with no leaf. The attached rooms' walls now collide on the client too.
- **Rooms:** 25 arena shells. Homes use a 10x10 shell; loot rooms keep their 8x8 art.
- **Home placeholders:** the existing workbench and recycler kits stand at `HOME_LAYOUT`. The Forge and Grand Recycler get placeholder workbench / recycler kits.
- **Lights:** a pool of exactly 9 PointLights plus the Hemisphere light. When the camera changes room or a door changes state, the lamps are reassigned by door hops through open doors, then by distance. The vault gets a lamp within 2 hops, and lamps fade over 0.25 s. Loot rooms stay unlit, as before.
- **Culling:** portal culling replaces the plain hop flood. Each door opening is projected to the screen, rectangles are intersected along the chain, rooms beyond 40 m are skipped, and objects outside their room's portal rectangle are hidden.
- **Room art:** ROOMART is lazy. The camera's room and its 2-hop neighbours are built at once; the rest is built one room per idle slot.
- **Maps and panels:**
  - One shared facility map texture serves the 24 non-vault rooms, each with a "you are here" marker mesh.
  - There are 33 door panels with canvases at 0.7x resolution. Only panels in visible rooms redraw.
  - The minimap and M map are driven by WORLD. Homes are always shown, and your own home is gold.
- The offline demo uses homes, 2-minute rounds and the station table.
- A "Skip to 0:10" button appears only with `dbg:1` (or `?offline=1&debug=1`).
- **feel.js:** the vault key comes from WORLD.

### Tests
- `world.test.js` and `doorguard.test.js` are rewritten.
- New: `rounds5.test.js` and `stations.test.js`.
- Every suite that pinned door ids, room keys or layouts now derives them from WORLD (helpers in `tests/lib.js`).

## How to run
- **Server:** `GK_DEBUG=1 GK_QUEUE_MS=1500 PORT=3000 node server.js`, then open `/`. The skip button shows under the timer.
- **Offline:** `/?offline=1&debug=1`.
- **Tests:** `GK_TEST_JOBS=3 npm test`.

## Verified
- **Tests:** `npm test` passed fully in one clean run (38 files, 134 s). Later full runs on this heavily loaded machine (other agents running) failed only on timing tests: `bots` tick cost, the `security` legit sprinter, `combat` regen and `netcode`. Each of these passes standalone, except `security`, which also flakes on main per the test agent.
- **Real-GPU browser pane, online:** I started in a home, walked through the hatch into the cell, voted a door on the panel, and the skip button brought round 2 with that door open. No console errors.
- **Headless Chrome (swiftshader):**
  - Offline and online start in a home.
  - Home, cell, vaultbreaker room, vault and the M map render correctly.
  - The skip button works.
  - The only console error is the existing favicon 404.
  - 9 PointLights + 1 Hemisphere confirmed.
- **Server smoke test:** 8 goblins in 8 distinct homes; bots walk out; the guard opened a cell door for every occupied home 5 s after GO.

## Not verified / known issues
- **Draw calls with every door open (sudden death)**, measured headless at 800x450:

  | view | Low | High |
  |---|---|---|
  | vault | about 455 | about 800 |
  | room 11 | about 365 | about 590 |
  | room 10 | about 235 | about 355 |

  With doors closed a room is about 95 (Low). The vault view is over the plan budget (Low 300 / High 600), so task Q should take this up. The doors are the heavy part (about 36 objects each); door LOD would help.
- Load time and frame time were not measured on a real GPU: the headless swiftshader runs are dominated by shader compiles and too noisy to judge.
- From inside a home, the white cell floor beyond the hatch shows a strong specular glare. It is likely the cell lamp at a grazing angle; check by eye.
- **Not reviewed in a real browser:**
  - the vault vote, live (it is covered by `vault-open` and `rules`)
  - a full 7-round match with 8 bots in the browser (`rounds5.test.js` covers it on the server)
- **Left for later tasks:**
  - `PACE.income` is still 10; the plan's 20 belongs to task A.
  - Forge and Grand doors show the treasure door art.
  - Home banners, tree rooms, vaultbreakers, elixir, crown and venting are inert.
- main now has `hud5.js` with its own skip button. Task D can replace the minimal button in the game.js PANEL block (`#gkDbgFF`).

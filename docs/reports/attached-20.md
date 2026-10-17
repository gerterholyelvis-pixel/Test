# 20 attached rooms (owner decision)

Branch `worktree-agent-addcc42ad6cc73e64`, main merged in twice (no conflicts).

## The layout
- One attached room behind each of the 20 outward wall segments, 5 per side. A corner cell has two of them, one on each outward side.
- **Ids:** side `s` (N 0, E 1, S 2, W 3) holds `c(5s)`..`c(5s+4)`. These are positions 1..5, numbered clockwise along the side (N west to east, E north to south, S east to west, W south to north).
- **Homes (10 m, unchanged art):** positions 2 and 4, so `HOME_IDS` = 1, 3, 6, 8, 11, 13, 16, 18. Every home cell is an edge cell next to a corner.
- **Loot rooms (8 m):** positions 1, 3 and 5, 12 rooms in all. Each corner cell has two of them.
- **Symmetry:** a 90-degree rotation maps id to id + 5, and positions 2 and 4 mirror each other, so all 8 homes are equivalent. Every home is the hatch plus 1 door from a tree room and 4 doors from the vault (tested).
- **Spacing:** every attached room is centred on its own 15 or 22.5 m segment, so neighbours never overlap. The two rooms at a corner are 3.5 m apart across the diagonal, and the diagonal square beyond the corner is void (`'c-1'`).
- **Doors:** 60 in total, 40 between arena rooms and 20 to attached rooms. The canonical order is unchanged, and a corner's two attached doors come in N E S W order. No bare outer walls are left.

## world.js API
- New: `NSIDE, SIDE_ORDER, SIDE_CELLS, HOME_POS, attachedSide(id|key), attachedPos(id|key), attachedId(side, pos), attachedOf(cell), isHomeKey(key)`.
- `CHEST` entries gain `pos`.
- `homeOf(slot)` is now `'c' + HOME_IDS[slot]`.
- Every old export is kept.

## Consumers
- `items.randomLayout` returns 20 rooms. Forge and Grand stay on opposite sides, each at a random loot position, and the other 10 roll as before.
- **hud5 map** builds its 20 rects procedurally; a test checks them against world.js.
- `vault5.kindOf` is migrated.
- The server `station` lab now uses the first loot room.
- The offline sim (`game.js`) spawns at the real home.
- Comments are updated. The rest of game.js (walls, shells, lamps, culling, minimap, panels, lazy art) was already WORLD-driven.
- **Codex:** `tools/gameinfo.js` and `gameinfo-pdf.js` are updated, and the HTML and PDF are regenerated.
- **docs/PLAN-5x5.md:** sections 0 to 1.5 and 6 are updated.

## Behaviour change in doorguard
A loot door is no longer an exit for an arena cell, because the loot room behind it is a dead end. A corner cell with only its loot doors open now counts as locked in, and the guard opens one of its arena doors instead. For the loot room itself, its one door is still its exit. This is tested, and `homeOpen` (the home phase) uses the same rule.

## Tests
- Rewritten: `world`.
- Updated: `doorguard` (new loot-door test), `hud5`, `stations`, `server-basic`, `vault5`, `botgoals`, `elixir-home`, `gameinfo`.
- **Final run after the last merge of main:** `GK_TEST_JOBS=3 npm test` failed only `act5-crown`, `bots` (tick cost) and `bots5-sim` (cost). All three pass when run alone.
- **Earlier loaded runs** also flaked on the security sprinter, netcode, matchmaking, rounds5 and rules. Every one of these passes alone except the security sprinter.
- **The sprinter and the bots tick cost** fail the same way on an untouched copy of the pre-change commit run on this loaded machine.

## Browser (real server, GK_DEBUG, headless Chrome over CDP, Low)
- Run with `tools/att20-views.js` and `Q=/ tools/r5shot.js`.
- Spawned in c18 (W position 4), held W through the hatch in round 2 and reached cell 5.
- Screenshots are `docs/screens/att20-*.jpg`:
  - the home spawn and the walk-out
  - corner cell 0 with both loot doors (N mystery, W merchant)
  - inside loot rooms c0, c2 and c19
  - bird's-eye views of the north side, the NW corner, the east side and the whole map
  - the M map
- No console errors.

## Draw calls (960x540)

| view | calls |
|---|---|
| home spawn | 190 |
| corner cell 0 | 78 |
| loot c0, looking out | 179 |
| loot c2 | 110 |
| loot c19 | 271 (open doors behind) |

There is no strict before/after baseline for the same views. Loot-room art and culling code are unchanged, so the cost per loot room is the same as before. There are 4 more rooms in total, and they are culled when not visible.

Note: the worktree has a `node_modules` junction (gitignored) pointing at the main checkout, needed to serve three.js.

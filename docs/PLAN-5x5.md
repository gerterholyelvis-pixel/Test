# PLAN-5x5: the 5x5 arena, home rooms, tree rooms, vaultbreakers and a pivotal vault

Written 2026-10-16 (Opus, design only). Based on main at `c4e7eaa` (world.js `SCALE 1.25`, doorguard, armour 3).
Nothing here is implemented yet. Items marked **(owner?)** need the owner's call. Section 11 lists them all.
**Superseded in part:** sections 2 and 3 and the task rows A, B and C in section 8 are replaced by [PLAN-5x5-rooms.md](PLAN-5x5-rooms.md) (activity rooms built on a shared framework).

## 0. Summary
- **Arena:** 5x5 grid, 25 rooms. The middle room is THE VAULT. The inner 3x3 is special:
  - the 4 inner corners are **tree rooms**: 10 types, rolled by weight per match
  - the 4 rooms touching the vault are **vaultbreaker rooms**: 4 fixed types that move between the 4 rooms every round
  - the outer ring has 16 plain halls
- **Attached rooms (owner decision, final):** 20 rooms, one behind each outward wall segment: 5 per side, numbered 1..5 along the side. A corner cell has two outward sides, so it has two attached rooms.
  - 8 are **home rooms**, at positions 2 and 4 of every side: one per player, smaller (10x10), each with a normal workbench, a 50% recycler and an **elixir pump** (1 elixir every 5 s into a tank that caps at 48), plus an **Elixir Screen** for base upgrades, security and "sendables" aimed at other rooms (1.8). The doorway is never voted on and stays open unless the owner buys a Door Lock.
  - The other 12 (positions 1, 3, 5) are loot rooms. They are guaranteed to include **1 Master Forge** (the upgraded bench) and **1 Grand Recycler** (100%), on opposite sides. The other 10 are rolled from chest, mystery and merchant.
- **Rounds** last 2 minutes (`ROUND_MS = 120000`). Sudden death starts after round 5 and the match is decided after round 7, so a match takes at most 14 minutes.
- **Dev fast-forward:** a debug-only button sets the round timer to 10 s. The server honours it only with `GK_DEBUG`.
- **Doors:** the voting core stays: one pick per room, panels, panel politics, and the 2-vote vault rule. The vaultbreakers are four ways to get the second vote, and the Ram bypasses the vote for one door. The exit guarantee in doorguard ignores home doorways.
- **The vault becomes the objective.** It gives treasury income each round. The relic restocks. The Crown claim sets off an alarm that opens all 4 vault doors. Sudden death "vents" the outer ring, so everyone converges on the vault.
- **Order of work:** one **Foundation** task lands first. It covers world.js v2, a single shared door table, and a mechanical migration of every consumer with no new features. After it, 6 parallel tasks (A to F) own separate files or blocks. QA comes last.

---

## 1. Geometry

### 1.1 Grid and sizes (world.js v2)
Keep `SCALE = 1.25`, `W = 15`, `V = 22.5`, `H = 6.5`, `T = 0.6`. New constants:

| constant | value | meaning |
|---|---|---|
| `N` | 5 | grid side |
| `COLW = ROWD` | `[W, W, V, W, W]` = [15, 15, 22.5, 15, 15] | the vault column and row are 22.5 m, like today's edge rooms |
| `HALF` | `V/2 + 2W` = 41.25 | grid half extent (82.5 m across) |
| `COLX = ROWZ` | [-33.75, -18.75, 0, 18.75, 33.75] | column and row centres |
| `CS` | 8 (unchanged) | loot room size. The merchant, mystery and chest art is authored for 8 m (see room-scale.md), so it is not touched. |
| `HS` | 10 | home room size. Smaller than an arena room (15), with enough space for a bench, a recycler, a wall map and a spawn. |
| `LIM` | `HALF + HS` = 51.25 | world half extent, used for bounds and clamps |

Arena room sizes:
- **Corners and other outer cells:** 15x15.
- **Vault row and column:** 22.5 x 15 (in the vault column) or 15 x 22.5 (in the vault row).
- **Vault:** 22.5 x 22.5.

The distance from a home to the vault is about 45-60 m of path, which is 6-8 s sprinting or 10-13 s walking. **Movement speed and room sizes stay as they are.** With 2-minute rounds, travel is never the bottleneck; the doors are. That is the design intent.

### 1.2 Indexing (backwards-friendly)
- **Arena room key:** `String(col + 5*row)`, `'0'..'24'`. `VAULT = 12`, `VAULT_KEY = '12'`. The helpers `colOf`, `rowOf`, `rc`, `roomW`, `roomD`, `roomAt` and `gi` keep their names, generalised to N=5. `gi` becomes a lookup over the column edges.
- **Attached room key:** `'c0'..'c19'`, keeping the `'c'` prefix. Every existing `key[0] === 'c'` check (claims, mystery, merchant, `m.layout[id]`, the mystery props) keeps working. A home is just an attached room whose `m.layout[id] === 'home'`.
- **Attached order (owner decision, 20 rooms; docs/reports/attached-20.md):** one attached room behind each of the 20 outward wall segments, 5 per side. Side `s` (N 0, E 1, S 2, W 3) holds ids `5s .. 5s+4` = **positions 1..5**, numbered clockwise along the side (N west to east, E north to south, S east to west, W south to north). **Positions 2 and 4 are homes, positions 1, 3 and 5 are loot rooms**:

| side (attach dir) | cells -> ids (position 1..5) |
|---|---|
| N | 0 c0, 1 **c1 home**, 2 c2, 3 **c3 home**, 4 c4 |
| E | 4 c5, 9 **c6 home**, 14 c7, 19 **c8 home**, 24 c9 |
| S | 24 c10, 23 **c11 home**, 22 c12, 21 **c13 home**, 20 c14 |
| W | 20 c15, 15 **c16 home**, 10 c17, 5 **c18 home**, 0 c19 |

- `HOME_IDS` = [1, 3, 6, 8, 11, 13, 16, 18], `LOOT_IDS` = the other 12. World API: `attachedSide(id)`, `attachedPos(id)`, `attachedId(side, pos)`, `attachedOf(cell)` (0, 1 or 2 rooms), `isHomeKey(key)`, `SIDE_CELLS`, `SIDE_ORDER`, `HOME_POS`; `homeOf(slot)` = `'c' + HOME_IDS[slot]`.
- **Corners:** a corner cell has two attached rooms (positions 1 and 5 of two sides), both loot rooms. They sit centred on the two outer wall segments, so they never touch: across the diagonal the gap is 3.5 m, and the diagonal square beyond the corner is void (`roomKeyOf` gives `'c-1'`).
- **Symmetry:** rotating the map by 90 degrees maps side `s` position `p` onto side `s+1` position `p` (id + 5), and positions 2 and 4 mirror each other, so all 8 homes are equivalent. Neighbours along a side never overlap: every attached room (8 or 10 m) is centred on a 15 or 22.5 m segment.

### 1.3 Special arena cells
| cells | role |
|---|---|
| 12 | THE VAULT |
| 7 (N), 11 (W), 13 (E), 17 (S) | **vaultbreaker rooms** (the 4 rooms with a vault door) |
| 6, 8, 16, 18 | **tree rooms** (the inner 3x3 corners) |
| outer ring, 16 cells | plain halls with story corners and crates, as today. 8 of them lead to a home (cells 1, 3, 9, 19, 23, 21, 15, 5), the 4 corners to two loot rooms each, the 4 middle cells (2, 14, 22, 10) to one loot room. |

Fairness check: every home's cell is an edge cell next to a corner, with 3 arena neighbours; it is 1 door from a tree room and 2 doors from a vaultbreaker room. All 8 homes are the same under the rotation and mirror symmetry.

### 1.4 Doors (one shared table: `WORLD.DOORS`)
- **Count:** 40 arena-arena doors (4 of them vault doors) + 20 attached doors (8 hatches + 12 loot doors) = **60 doors**.
- **Canonical id order** (the only order; server and client both derive from it). For `i = 0..24`:
  - the E door (if `col < 4`)
  - the S door (if `row < 4`)
  - the cell's attached door(s), in N E S W order (a corner has two)
- Each entry is `{ id, a, b, kind: 'arena'|'vault'|'loot'|'hatch', axis, c, hw, wall: {x, z, rot, len} }`.
  - `hw` is 4.9/2 + 0.2 for vault doors and 2 + 0.2 otherwise (the same as today's `addDoor`).
- `WORLD.WALLS` lists every wall segment, with or without a door: `{x, z, rot, len, door: id|null}`. That covers:
  - the 40 internal walls
  - the 20 outer segments, all with an attached door (no bare outer wall is left)
  - each attached room's 3 own walls
- **Hatch** (the home doorway): an **open archway with no leaf**. It carries the owner's name banner (cloth, painted per match from the player name) and is always passable: for its owner always, and for everyone else unless the owner bought a Door Lock (1.8). It is the cheapest door to draw.
  - Every rule treats it as open through `WORLD.alwaysOpen(id)`.
  - It never appears on a panel and never counts for the door guard.
- **Loot door:** a loot room has exactly one door, which is its exit for the door guard. For the arena cell outside it is **no** exit (the loot room is a dead end): a corner cell with only its two loot doors open counts as locked in, and the guard opens one of its arena doors.

- **Doors stay open (docs/reports/doors-persist.md):** once a door opens it stays open for the rest of the match. Votes only add doors. Only a vault bar shuts one, and only until the round ends. A hatch is shut in round 1 and open from round 2. Round 2 opens nothing else, so every home's hall starts closed and its panel picks the first way out. A loot room is reached through its parent cell's panel.

### 1.5 The 20 attached rooms
- **Homes (positions 2 and 4):** 10x10, with the doorway on the arena side. Contents along the back wall:
  - a **normal workbench**
  - a **home recycler (50%)**
  - a **wall map** (shared texture, see 4.4)
  - a small bed and crate dressing
- **Loot rooms (positions 1, 3, 5; rolled per match):**
  - **1 Master Forge**: upgraded bench, 8x8
  - **1 Grand Recycler**: 100%, 8x8
  - **10 rolled** with weights chest 45, mystery 35, merchant 20, guaranteeing at least 1 merchant (if the roll has none, convert one random chest).
  - **Constraint:** the Forge and the Grand Recycler sit on **opposite sides** (side k and side k+2), each at a random loot position (1, 3 or 5). Neither type wins a whole half of the map.
- **Edge rule:** today's rule ("edge rooms can never be merchant") stays gone: every loot room has its own door.

### 1.6 Workbench and recycler types (parameters, not code paths)
`items.js` gets:
```
STATIONS = {
  bench:    { normal: { maxTier: 2, costMul: 1.0,  craftMs: 2500 },
              master: { maxTier: 5, costMul: 0.75, craftMs: 800, bonusTier: 1 } },
  recycler: { home: { eff: 0.5 }, full: { eff: 1.0 } }
}
```

**Bench rules:**
- A recipe is craftable at a bench when `recipe.tier <= bench.maxTier` **and** the knowledge system allows it.
- The knowledge side is a single adapter call, `G.canCraft(p, recipe)`. It defaults to today's `p.stats.knowledge >= recipe.needs` until KNOWLEDGE.md lands.
- Part cost is `ceil(cost * costMul)`.
- `bonusTier` means a master bench lets you craft **one tier above** what your knowledge unlocks, at full cost (`costMul` 1.0 for that recipe).
- **Craft time:** the server holds `p.crafting = {rid, doneAt, room}`. The item arrives after `craftMs`. Leaving the room or taking a hit cancels it and refunds the parts. The client shows a progress bar in the bench panel.

**Recycler rule:** yield per part is `floor(n * eff)`, with at least 1 of the item's main part.

**Where each type is:**

| place | bench | recycler |
|---|---|---|
| homes | normal | home (0.5) |
| Master Forge | master | none |
| Grand Recycler room | none | full (1.0), plus armour and utility items |
| merchants and mystery "stations" rooms | normal (as today) | full |
| tree room "Grafting Bench" (see 2) | master | none |

**Server API:**
- `stationAt(m, p, 'workbench'|'recycler')` returns the station object (`{kind, type}`) or null. It replaces `hasStation`.
- `craft()` and `recycle()` read `type` from that object. Nothing else branches on location.
- The knowledge branch only needs to read the `bench` object it is passed.

### 1.7 Elixir pump (one per home): the "work out of your home" loop
**Recommendation: a tank, not direct income.**
- **Production:** the pump in each home fills its own glass **tank** at **1 elixir every 5 s**. That is 12 per minute and **24 per 2-minute round** (a 1-hour rate of 720 never happens: the longest match is 14 min, which is at most about 168 per pump).
- **Collecting:** press E at the pump inside the home to move the whole tank into your **carried elixir** (`p.elixir`).
- **Accumulation while away:** the pump keeps filling while you are out in the arena, so coming home pays. That is the loop: go out, loot, come home, collect, brew and craft.
- **Anti-hoarding:**
  - the tank caps at **48** (2 rounds), so leaving it longer wastes elixir
  - a goblin can carry at most **120**
  - the pump runs from GO until its owner dies, then stops (the tank stays)
- **Server authority:** the server computes the tank lazily: `tank = min(48, tank + floor((now - t) / 5000))`, carrying the remainder in `t`. `{pump:1}` is accepted only when the goblin is alive, entered, inside that home's room key and within 2.5 m of the pump.

**Raids:**
- Homes are open (see 11.2), apart from the optional Door Lock (1.8), so **anyone can drain anyone's tank**.
- The owner gets a private toast ("<name> is draining your pump!"), and the tank glows red for 5 s.
- Raiding costs a trip into someone's dead-end home: real risk, a real decision, no new protection rules.
- **Death loses everything:** the carried elixir drops into the death pile as a **Elixir Flask (n)** pile entry. The killer or anyone else can take it, like any item. The victim's pump stops.

**Uses (4 sinks, all at existing stations):**

| sink | where | cost | effect |
|---|---|---|---|
| **Brew** | any workbench (the home bench is the natural one) | 8 / 12 | Healing Draught (heals 30, a new consumable using the existing heal path) / Speed Tonic (`x:tonic`, exists) |
| **Refine** | the home recycler | 4 per item | that one recycle runs at 100% instead of 50%. This is what makes the home recycler worth using. |
| **Distill** | home pump | 20 | +5 knowledge through `G.addKnowledge` (max 3 per match) |
| **Oil the lock** | Counting House (vaultbreaker) | 15 | one vault bribe, paid in elixir instead of gold (the same max of 3) |

**HUD:** one small counter beside gold (a drop icon and the number). The pump's 3D tank fill shows the level in the world. No other HUD.

**Bots:**
- collect at home whenever they are there and the tank holds 12 or more
- brew a Healing Draught when they carry no heal and have 8 or more elixir
- refine their junk at home
- spend leftover elixir at the Counting House when they are voting vault

**Balance:** 24 per round buys about one draught plus one refine per round. Distill is about one round of pump time per +5 knowledge. Oil the lock (15) is cheaper per vote than gold (25 at the Counting House) only for players who went home.

**Owner question:** the elixir uses are the owner's call (11.8). The recommendation is the 4 above, plus the Elixir Screen (1.8), which is the main sink.

### 1.8 Elixir Screen: base upgrades, security, sendables
- **Where:** each home has an **Elixir Screen** on the wall beside the pump. Press E to open a panel with the same look as the workbench (`mkPanel`).
- **Owner only:** a non-owner gets "Not your screen". The home's **bench, recycler and screen are owner-only** too. A raider can drain the tank and crack the lockbox, nothing else.
- **Tabs:** BASE, SECURITY, SEND. Each row shows the name, level pips, cost, a one-line effect and Buy.
- **Distill** (1.7) is also a row on BASE.

**Budget:** 24 elixir per round at the base rate, about 168 per match. Buying the whole tree costs about 425, so **players must choose a build** (economy, workshop or fortress).

**BASE**

| upgrade | levels (cost) | effect |
|---|---|---|
| Pump | II (20), III (45) | 1 per 4 s, tank 64 / 1 per 3 s, tank 90. Payback is about 7 and about 6 min. |
| Workbench | II (40) | home bench `maxTier` 3, `craftMs` 1500. The Master Forge is still better: tier 5 at 0.75 cost. |
| Recycler | 75% (25), 100% (50) | permanent home recycler efficiency. Refine stays for the per-item boost. |
| Lockbox | 3 slots (20), 6 slots (+35) | stores items at home (see raids) |
| Healing Pad | (30) | 2 HP/s while standing on it unhurt 2 s. Off in sudden death (homes vent). |

**SECURITY**

| upgrade | cost | effect |
|---|---|---|
| Door Lock | L1 (25), L2 (+50) | A non-owner must stand at the hatch for 2 s (L1) or 5 s (L2) before it lets him through, shown as a pick bar. Never blocks the owner. Off in sudden death and in a showdown. |
| Alarm | (10) | Anyone entering gives the owner a toast "Intruder: <name>" and a minimap ping, wherever he is. |
| Snare | (15, re-arm 15) | The first non-owner to enter is rooted for 2 s and takes 10 damage. One-shot. |
| Sentry Crossbow | (60, ammo 10 for +20) | Fires at non-owners in the home (8 damage every 1.5 s, line of sight, the normal bolt path). 20 shots. It fires only while the owner is **not** home, so it does not double the owner's damage. |
| Pump Guard | (15) | Immune to Pump Leech. |

**Raids:** what a raider can take from a home:
- the tank (all of it)
- the lockbox items, after cracking it: an **8 s channel** at the box, announced to the owner. With Door Lock L2 it takes 14 s.
- the kill, if the owner comes back

He cannot use the owner's stations or screen.

**SEND** (bad things sent to a room; the hook for politics):

| sendable | cost | duration | effect | counter |
|---|---|---|---|---|
| Alarm Bell | 6 | 20 s | Goblins in the target room show on **everyone's** minimap. | leave the room |
| Stink Gas | 14 | 20 s | Fog in the room (client fog density on that room's cull set) and 1 damage every 2 s. | leave |
| Rat Swarm | 18 | 30 s | 5 rats (a new NPC kind using the mystery-enemy code: 5 HP, 2 damage, slow) | kill them (they count as NPC kills, no loot) or leave |
| Jammed Panel | 12 | rest of the round | The target room's pick is frozen (no pick if it has none). It is the remote version of sealing wax. | none, but the door guard still guarantees an exit |
| Spike Trap | 15 | 1 round | A hidden plate at a random free spot. The first goblin to step on it takes 15 damage and is slowed for 2 s. | luck, or watch for the faint plate |
| Pump Leech | 20 | 10 s | Targets an enemy home: 50% of its tank flows into yours. | Pump Guard, or go home |

Fairness rules (server):
- **Limits:** 1 send per player per round; no sends in round 1; at most 2 active sendables per room (a third is refused and refunded).
- **Targets:** any arena room except **THE VAULT**, or an enemy home. Never your own room.
- **Telegraph:** a **3 s warning** in the target room (a sign flash, a sound, a toast "Rats incoming!" naming the sender). Only the occupants of the target room learn the sender. Nothing goes to the global feed, to avoid clutter.
- **Doors:** sendables never change doors or the vote tally, except Jammed Panel freezing a pick. The guard still gives every room an exit after `TRAP_MS`.

**Death:**
- "Death loses everything": **a home dies with its owner**. The pump stops, every upgrade is gone, the lock opens and the sentry goes silent.
- The lockbox spills its items as a normal loot pile in the home.
- The home becomes a neutral 10x10 room with a dark screen.
- Nothing persists across matches.

**Server authority:**
- `{base: {buy: id}}`, `{base: {send: id, room}}`, `{base: {crack: 1}}`, `{lockbox: {put|take: slot}}` are each validated: alive and entered, in **own** home within 3 m of the screen (crack: within 1.5 m of a foreign box), level order, cost, the per-round send limit, the target rule.
- Rate limit 4 messages/s, the excess dropped.
- All state lives in `m.homes[id] = {owner, lv:{...}, box:[...], snare, ammo}`, sent only to the owner as `{home}` (others see just the effects).
- **Hatch passability:** for non-owners it becomes per-player: `hatchOk(m, p, id)` is true for the owner, when there is no lock, or after the pick channel has finished. It is checked in `pathOk`, `bfsPath`/`reach` (bots), and the guard (the owner is never trapped).

**Bots:**
- **Buy order** (spend when elixir ≥ cost + 8 reserve): Pump II, Recycler 75%, Alarm, Lock L1, Workbench II, then Pump III or the Sentry by personality (greed or caution).
- **Sends**, one per round from round 2:
  - Jammed Panel on a vaultbreaker room where a human is voting vault late in the round
  - Rat Swarm on a room with a lone wounded enemy
  - Pump Leech on a home only when aggression > 0.7
- They never target the same human twice in a row, so bots do not grief one player.

**UI:** the panel plus one small elixir counter (1.7). Targets are picked on a mini 5x5 map in the SEND tab (click a cell or a home). Toasts are reused for every notification. No permanent new HUD.

---

## 2. Tree rooms (the 4 inner corners: cells 6, 8, 16, 18)

- **Shell:** an arena room (15x15) with a central **tree**. It is a stylised knowledge tree that grows out of the floor through a ceiling hole: sculpted trunk, emissive leaf cards in the type's colour, and no new lights.
- **Roll:** per match, **without replacement** (no duplicates), weights renormalised after each pick. Four different tree types per match keeps every match readable and varied.
- **Interaction:** E on the trunk. Each effect has its own limit: once per goblin per round, once per goblin per match, or once per match for everyone.
- **Knowledge hooks:** all knowledge effects go through `G.addKnowledge(p, n, src)` and `G.perk*` adapters. Until KNOWLEDGE.md lands, they map to `p.stats.knowledge += n` and stubs.

| # | type | weight % | effect | limit |
|---|---|---|---|---|
| 1 | **Sapling Well** | 22 | +3 knowledge | once / goblin / round (match cap +15) |
| 2 | **Brain Press** | 16 | Brains eaten in this room give 10% of the victim's knowledge, not 5%. Press a brain item from your bag here for the same. | per brain |
| 3 | **Healing Spring** | 14 | Standing in the room unhurt for 2 s regenerates 1 HP/s. Off in sudden death. | continuous |
| 4 | **Seer's Tree** | 12 | Pulse: for 8 s your minimap shows every goblin and this round's door picks of every room. Everyone sees "<name> consulted the Seer". | once / goblin / round |
| 5 | **Grafting Bench** | 10 | A master bench (bonusTier) built into the trunk. A second master bench, in the contested middle. | as a bench |
| 6 | **Thorn Shrine** | 8 | Sacrifice 10 knowledge for a 2-round blessing: +10% attack **or** +15% max HP. | once / goblin / match |
| 7 | **Gambler's Root** | 7 | Feed your equipped weapon: 55% it comes back as a random weapon one tier higher, 45% it is lost. | once / goblin / round |
| 8 | **Memory Tree** | 5 | Unlock one knowledge perk from the next tier early (KNOWLEDGE.md perk API; until then +10 knowledge). | once / goblin / match |
| 9 | **Hollow Oak** | 4 | Goblins inside are hidden from every map and Seer pulse, and this room's door pick is hidden on panels and wall maps. Ambush and secret-ally room. | continuous |
| 10 | **Elder Tree** | 2 | The first goblin to touch it gets +25 knowledge and a tier 3+ item. Announced to all. The tree then withers to Sapling Well. | once / match |

Weights sum to 100. Roughly, a type with weight w appears in a match with probability `1-(1-w)^4`, adjusted for no duplicates. The Elder Tree appears in about 8-9% of matches and the Sapling Well in about 65%.

**Data:**
- `m.trees = { '6': 'well', '8': 'seer', ... }`, rolled in `newMatch`.
- It is sent in the welcome and `matchStart` like `layout`. Static per match.

---

## 3. Vaultbreaker rooms (cells 7, 11, 13, 17) and the vault

### 3.1 The four types (all four exist in every match)
**Vote rule:** unchanged. A vault door opens when `vaultVotes >= 2`. Each vaultbreaker is one way to make up the missing vote alone, at a price. Only the Ram bypasses the vote, and only for its own door.

| type | station | function | interaction with the 2-vote rule |
|---|---|---|---|
| **Keystone** | a stone lock socket in the floor | This room's vault pick counts **2 votes**. The pick shows on every panel and wall map as "KEYSTONE ARMED". | One goblin here can open this room's vault door alone, but everyone sees it coming. |
| **Counting House** | a pay desk at the door panel | Bribes cost 25 (not 50), up to 3, and work **even when the `bribe` rule is off**. | Gold buys the second vote. |
| **Locksmith** | a small bench | Crafts a **Vault Lockpick** (the existing `x:lockpick` item, which adds +1 vault vote when used in a room whose pick is a vault door) for `{metal 2, bone 1}`. Max 1 per goblin per round and 2 per match. | The pick can be used in **any** vaultbreaker room in a later round. Plan ahead. |
| **Battering Ram** | a ram on a winch, facing the vault door | Stand in the ram circle (r 1.6 m) and you accumulate ram time while unhurt for 2 s. After **20 s** total this round, this room's vault door opens at the round end **regardless of votes**. | It bypasses the vote, but loudly: "<name> is ramming the <side> vault door" goes to everyone at the start and at 50%. Progress resets every round. |

### 3.2 Positions shuffle every round
- **Assignment:** `m.vb = { '7': 'keystone', '11': 'ram', ... }`. At **every round boundary**, in the same tick as the door results, the server applies a **derangement**: a random permutation in which every type moves. That honours "positions change each round".
- **Pre-roll and reveal:** the next assignment is pre-rolled at round start. It is revealed **15 s before the round ends** (`vbNext` in `roundState`), so players can pre-position.
- **No mid-round swaps.** A room's function is fixed for the whole round. The tally at the round end uses the assignment of the round that is ending. Then the new one applies.
- **In-progress state:** ram progress and bribes already reset per round. A lockpick is an item, so it survives. Bot plans re-plan on the `vb` change.
- **Players standing in a room when it re-keys:** the room plays a short "RE-KEYED" flash and a clank, the sign swaps, and a toast names the new function. Nothing they own is lost. The swap never moves geometry, doors or props.
  - Every station sits on the **same spot in every vaultbreaker room** (the centre of the wall opposite the vault door).
  - The ram circle is the floor in front of the vault door.
  - So the swap is purely a skin and function change.
- **Communication** (fewer, better signals):
  - **In the room:** one large painted sign over the station (KEYSTONE / COUNTING HOUSE / LOCKSMITH / RAM) in the type colour, plus the station prop.
  - **Doors leading in:** the existing door sign plate (`sign()`) on every door into a vaultbreaker room shows the type icon, so you can read it from the neighbour room.
  - **Minimap, M map and wall maps:** a type icon in each of the 4 cells. During the last 15 s, a faint "next" icon sits beside it.
  - **Round start:** one banner line under the round timer for 3 s: "Vault re-keyed: Ram NORTH - Keystone EAST - Locksmith SOUTH - Counting WEST". No extra HUD element stays on screen.
- **Doors and votes:** unchanged. A vaultbreaker room is a normal arena room with 3 arena doors plus 1 vault door, and its panel works as today.
- **Exit guarantee:** unaffected. These are normal arena rooms, and the guard's exits are non-vault doors.
- **Bots:** they read `m.vb` every round (see 5.3).

### 3.3 THE VAULT becomes pivotal
**Inside** (no clutter: the dais, the pedestal, the treasury):
- **Relic pedestal** (exists): a tier 3+ item. It **restocks at the start of rounds 3 and 5** (a new roll) if it was taken. Announced.
- **Treasury income:** at every round end, each living goblin inside the vault gets **+30 gold and +4 knowledge**, with a floating "+30" over the coin pile (no new HUD).
  - This makes holding the vault worth more than a single raid.
  - It also feeds the Counting House and the merchants.
- **The Crown dais** (today's `crown` rule, **ON by default in 5x5** **(owner?)**): stand on the dais unhurt for **25 s** and you are crowned Goblin King and win.
  - **Vault alarm:** while someone is claiming, **all 4 vault doors are forced open**, and everyone gets "<name> is claiming the crown!" with a ring progress on the map.
  - Claiming the crown therefore invites the whole map. That is the climax of the match, not a camping exploit.
  - Getting hurt resets the timer.
  - Last goblin standing still wins too.

**Rounds and the end:**

| round | what happens |
|---|---|
| 1-5 | Normal voting, vaultbreakers active, treasury paid each round end. |
| after round 5 (`SUDDEN_ROUND = 5`) | **Sudden death:** every door opens and stays open. Regeneration works only in the vault (existing rule). The Healing Spring turns off. Crown time drops to **15 s**. **Venting:** each outer-ring arena cell, each home and each loot room deals **1 HP every 3 s** to goblins inside, with a hazard-stripe warning toast. Everyone converges. |
| after round 7 (`MAX_ROUND = 7`) | The time-limit rule decides as today: most kills, then most HP. |

Max match length is 7 x 2 min = 14 min, inside `MATCH_LIFE_MS` = 20 min.

**Links to the other rooms:**
- **Tree rooms** power you up for the vault: knowledge, healing, intel.
- **Vaultbreakers** are the ways in.
- **Homes** are where you turn loot into gear.
- **Home wall maps** show the vault state (open or sealed, the claimant, the vaultbreaker layout).

---

## 4. Client

### 4.1 Building 45 rooms
**Shells at load** (floor, ceiling, walls, AO planes, ceiling panels) for all 25 arena rooms + 20 attached rooms, from `WORLD.WALLS` and room rects. There is no per-room loop over `9` any more.

**Doors:** 56. Hatches have no leaf, so they cost about 12 draw calls. `perf2MergeDoors` keeps merging per material.

**ROOMART dressing, lazy:**
- Build the spawn room and its 2-hop neighbours synchronously.
- Build the rest from `requestIdleCallback`, at most one room per idle slot, nearest first by door hops.
- `ROOMART.build()` already works per key, so it gains a queue.
- Target: load time grows by no more than 1.5 s over today on Medium.

**New builders in a new file `rooms5.js`** (loaded after game.js, uses `GK.*` hooks, owned by task C):
- `buildHome(r, ownerName)`
- `buildForge(r)`
- `buildGrandRecycler(r)`
- `buildTree(r, type)`: 1 trunk kit + 10 colour/prop variants
- `buildVaultbreaker(r)`: shell + 4 station props, of which only the current one is visible. The swap toggles visibility, like the door `setType`.
- `vaultTreasury(r)`

They reuse `GK.stations` (recycler, workbench), `bx`, `inst` and the materials.

### 4.2 Light budget: 9 PointLight + 1 Hemisphere (owner rule), pooled
- **Fixed pool:** exactly **9 PointLights**, created once, so the light count never changes and there is no shader recompile.
- **Every unlit room** stays readable through its HDR emissive ceiling panels (with bloom), the env map and the hemisphere.
- **Assignment** runs only when the camera changes room or a door opens or closes, not every frame:
  1. Rank rooms by (door-hop distance from the camera room through open doors, then Euclidean distance).
  2. The vault always gets the first lamp whenever it is within 2 hops.
  3. Lamps move to their room's ceiling centre with the room's own intensity (`(vault ? 14 : home ? 6 : 9) * SCALE`).
- **Swap:** a light leaving a room fades out over 0.25 s and the new one fades in, using the pool's own intensity tween. No pops.
- **Overview and death cameras** (outside LIM or above H): lamps go to the vault plus the 8 nearest rooms to the camera target.
- The vault chandelier, tree leaf glow and station glows are emissive, sprite or bloom only.

### 4.3 Culling and performance budget
- `fxClassify` and `fxCullBegin` already work by room key and door hops. They only need `WORLD.roomKeyOf` v2 and the door table. Keep 2 hops on Low/Medium and 3 on High/Ultra, plus a **40 m distance cap** so a long straight line of open doors in sudden death stays bounded.
- **Budget, in an arena room looking down a line of open doors:**

| preset | draw calls | triangles |
|---|---|---|
| Low | ≤ 300 | ≤ 400k |
| Medium | ≤ 450 | ≤ 400k |
| High | ≤ 600 | ≤ 900k |

- Today's vault view is about 220 on Low and 450 on High, so this is achievable because culling keeps at most about 7-10 rooms visible.
- **Dust motes, light shafts and contact-shadow blobs:** only for rooms with a pooled light, or all built but culled with the room.
- **Control panels:** 25 canvas textures, one per arena room, plus 12 loot rooms. They redraw only when dirty **and** visible (in the cull set), and the panel canvas drops to 256x192.

### 4.4 Minimap, M map, wall maps, overview
- **Minimap:** drive it from `WORLD` tables (`ROOMS`, `DOORS`, `ATTACHED`) and remove the hard-coded `CI` (parent*4 + side), `NR = 9 + 12` and `disc = 12` tables. Keep the fog of war.
  - The 5x5 at minimap size is about 11 px per 15 m room, which is readable.
  - New cell icons: the home banner colour (your own home in gold), the tree type glyph, the vaultbreaker type glyph, Forge, Recycler.
- **M map:** the same renderer at a larger scale, plus ownership names on homes.
- **Wall maps:** today each grid room has its own 1024x740 canvas. With 33 maps (25 arena + 8 homes) that would cost about 100 MB, so instead:
  - **one shared CanvasTexture** with the facility drawing (redrawn at most once a second when round state changes)
  - per room, a small "you are here" marker mesh on the map plane
- **Overview camera:** the orbit radius already scales with `LIM`.

### 4.5 Panels, prompts and the dev button
- **Panels** come from `WORLD.DOORS` (`ROOM_DOORS` per room, sorted N, E, S, W). Hatches are excluded. A vaultbreaker panel shows the type colour and "KEYSTONE ARMED" where it applies. Bribe prices come from the server (`bribeCost` per room in `roundState`).
- **E-prompts:** tree ("Drink from the Sapling Well", ...), the vaultbreaker stations, ram progress (a ring at the ram).
- **Dev fast-forward:**
  - A small button "Skip to 0:10" under the round timer.
  - Rendered **only** when the welcome contains `dbg: 1` (the server sends it only under `GK_DEBUG`) or offline with `?debug=1`.
  - Click sends `{ dbgFF: 1 }`. Hotkey: none, so it is never pressed by accident.

### 4.6 Offline demo (`?offline=1`)
It keeps working:
- the door tables come from `WORLD.DOORS`
- simulated bots spawn in homes
- tree rooms and vaultbreakers are **visual only** offline (static roll), and are labelled as such in a code comment

---

## 5. Server

### 5.1 Tables and rules
- `ROOM_DOORS`, `DOOR_AT`, `RB` (room bounds), `ADJ` and `DOOR_ROOMS` are built from `WORLD.DOORS` / `WORLD.ROOMS`. The `for (i < 9)` loops and `addDoor` go away.
- `VAULT` = the doors of `WORLD.VAULT_KEY`.
- Every `'4'` literal becomes `VK` (11 in server.js, 1 in doorguard.js, 4 in game.js, 2 in feel.js).
- **Open-door check:** `isOpen(m, d) = WORLD.alwaysOpen(d) || m.open.includes(d)`. It is used by `pathOk`, `bfsPath`, `reach`, `follow`, `doorClamp` and the guard. Sudden death and showdown keep `m.open = all ids`.
- **Persistent doors (docs/reports/doors-persist.md):** a door that opened stays open for the rest of the match, whatever opened it (vote, Broken vault door, crown alarm, Crowbar, Door Wedge, guard, PACE). At the round end `m.open` = the old set + this round's doors + `m.shut`. `m.shut` holds the vault doors barred from inside this round (a finished bar takes its door out of `m.open` at once; the round end puts it back). A vote on a door that is already open is ignored, and bots never cast one. The experimental `doorclose` rule keeps the old closing doors.
- **`inBounds`:** inside the grid, or inside one of the 20 attached rects (`WORLD.attachedAt(x, z)`).

### 5.2 Spawns, rounds, votes
- **Spawn:** each goblin gets a distinct **home** (`p.home = 'c' + id`, id even), with a random point inside the home's 10x10 (3 m margin), facing the doorway. `fillBots` uses the free homes. `box` becomes `p.room` (the client shows "Home of <name>").
- **Rounds:** `ROUND_MS = 120000` for **every** round. Delete the R1 = 30 s / NEXT = 45 s split. `GK_ROUND_MS` and `GK_NEXT_ROUND_MS` stay as debug overrides.
- **Sudden death and max rounds:** `SUDDEN_ROUND = 5`, `MAX_ROUND = 7`.
- **Pacing:** `PACE.income` goes from 10 to **20** per round (there are fewer, longer rounds). Merchant price growth stays at +10% per round after round 2.
- **Votes:** one pick per occupied room, as today. Arena rooms have 2-4 votable doors and loot rooms have 1. Homes and hatches are not votable.
  - `paceNoDoor` (a round where nobody picked opens one door) stays. It excludes hatches and doors that are already open, and it does not run at the end of round 1.
- **Vault tally:** `vaultVotes` is the sum over rooms whose pick is a vault door, `1 + (keystone ? 1 : 0) + bribes + picked`. Opening needs ≥ 2. Rammed doors are added after the vote.
- **Exit guarantee** (doorguard.js):
  - `trapped(room, isOpenFn, roomDoors, vaultDoors, skip)` skips **homes** (their doorway is always open, and the trap check moves to the arena cell outside) and the vault.
  - `isExit` excludes hatches. So a hall whose only open way is the hatch back home counts as trapped and gets an arena door after `TRAP_MS`. From round 3 a goblin is never stuck in home + cell; round 2 is the exception below.
  - **Round 1:** everyone steps from home into their cell. 5 s later the guard opens one arena door per occupied cell. Round 1 is never dead.
  - **Superseded by the home phase (docs/reports/home-phase.md):** round 1 is spent at home with every hatch shut and the guard exempt; round 2 opens the hatches and one exit per occupied home's cell at once.
  - **Superseded by persistent doors (docs/reports/doors-persist.md):** round 2 is the **hall round**: the hatches open and nothing else (no PACE door, no cell exit). The guard skips homes and the 8 home cells for round 2 only (each hall votes its way out at its panel; the pick opens at the round end). From round 3 the guarantee above holds again.
- **Dev fast-forward:** `{dbgFF:1}` is honoured only if `DBG && m.phase === 'play' && m.started && !m.ended`. It sets `m.endsAt = Math.min(m.endsAt, now + 10000)` and calls `broadcastRound(m)`. Otherwise it is ignored silently (and counted by the security fuzz).
- **New match state:**
  - `m.layout` (16)
  - `m.trees`
  - `m.vb` and `m.vbNext`
  - `m.ram` (room -> ms)
  - `m.claimant` (the crown)
  - `m.relicRestock`
  - All of it goes into `roundState` / `matchStart` / resume.

### 5.3 Bots (BOTS block + a new pure file `botgoals.js`)
**Graph:** 41 nodes. BFS is trivial, and `DIST_V` is recomputed from `VK`. Cost stays below 0.1 ms per bot tick.

**Home routine:**
- At GO the bot walks out.
- It returns home when it holds 2 or more junk items, or when it has the parts for a bench recipe and its home is within 4 hops. There it recycles at 50% (or prefers the Grand Recycler if that is within 3 hops) and crafts. The craft time matters: bots also wait out `craftMs` and get interrupted when hit.

**`pickDest` scores** (new terms):

| destination | score |
|---|---|
| home (work) | +4 when it has work |
| Master Forge | +5 when it can craft tier ≥ 1 |
| Grand Recycler | +3 with junk |
| tree rooms (by type) | Well +3 (not used this round); Spring +4 when hurt; Brain Press +4 while carrying a brain; Seer +1; Gambler +2 × greed; others +1 |
| Keystone | +6 after round 2, then vote vault |
| Counting House | +5 if gold ≥ 50, then vote vault and bribe |
| Locksmith | +3 with parts |
| Ram | aggression > 0.6 after round 3: walk in, channel; flee when hurt |
| vault | as today, plus +4 per treasury round, plus +9 to contest a crown claimant |

**Re-planning:** when `m.vb` changes, a bot whose goal was a vaultbreaker type re-targets the room that now holds that type.

**Venting:** in sudden death, bots treat vented rooms as -6.

### 5.4 Match balance
| quantity | today (3x3) | 5x5 |
|---|---|---|
| rooms / doors | 21 / 24 | 41 / 56 |
| home to vault doors | 1-2 | 2-4 (+ the vault vote) |
| round length | 30 s, then 45 s | 120 s |
| match cap | 10 rounds (~7.5 min) | 7 rounds (14 min) |

- **Speed and room size:** no change (see 1.1).
- **Bot sight (12 m) and bolt range:** no change. Rooms stay 15 m.
- **Watch in QA:** a share of rounds with no fight (target < 40% of goblin-rounds without any encounter by round 3). If the map plays too empty, the first lever is `TRAP_MS` 5 s to 3 s and the second is opening one random arena door per vaultbreaker room each round. Room sizes and speed are not the levers.

---

## 6. world.js v2 API (exact surface)
Kept (same names, generalised): `SCALE W V H T CS COLW ROWD COLX ROWZ HALF LIM VAULT colOf rowOf roomW roomD rc gi roomAt inGrid roomKeyOf panelOffsets panelDX randomPoint` and all of `SOLID` (`solidsOf storyOf slide inProp segBlocked allProps propsAt rectsAt PILLARS PILLAR_D RELIC obstaclesIn`).

- `CHEST` keeps its shape `{id, parent, side, dx, dz, cx, cz, wallX, wallZ}` and adds `size` (8 or 10), `home: bool` and `pos` (1..5 along its side). 20 entries.
- `chestKey(i, side)` stays.

New:
- `N`, `NARENA` (25), `NATT` (20), `HS`, `VAULT_KEY`, `HOME_IDS` [1, 3, 6, 8, 11, 13, 16, 18], `LOOT_IDS` (the other 12), `attachedSide attachedPos attachedId attachedOf isHomeKey SIDE_CELLS SIDE_ORDER HOME_POS`, `TREE_CELLS` [6, 8, 16, 18], `VB_CELLS` {N: 7, W: 11, E: 13, S: 17}
- `ROOMS`: `[{key, kind: 'arena'|'vault'|'tree'|'vb'|'home'|'loot', cx, cz, hw, hd}]`, 45 entries
- `roomRect(key)`
- `DOORS`, `WALLS`, `ROOM_DOORS` (key -> ids, sorted N E S W)
- `alwaysOpen(id)`
- `attachedAt(x, z)`: the id or -1
- `homeOf(slot)`: `'c' + HOME_IDS[slot]`

Rules for these helpers:
- `randomPoint(key | i)` accepts a room key, so homes work.
- `panelOffsets` and `panelDX` accept arena indices only. Attached rooms keep their own panel layout.
- `storyOf` and `solidsOf` for the new kinds:
  - **tree:** story corner off; one trunk circle r 1.1 at the centre is a solid
  - **vb:** no story corner (the station wall stays clear); crates in the 2 corners away from the vault door
  - **home:** one crate stack; the bench and recycler footprints are solids
  - **forge / grand:** the station footprints are solids

---

## 7. Migration plan per consumer
| consumer | change |
|---|---|
| **server.js** | tables from WORLD (5.1); `'4'` to `VK`; `spawn`/`fillBots` to homes; `inBounds` via `attachedAt`; `RB` from `ROOMS`; `isOpen`; `newMatch` layout 20 (was 16); `chests`/`chestKeys` length `NATT`; `RELIC_POS` from `WORLD.RELIC`; `claim` ignores homes |
| **doorguard.js** | parametrised vault key, a skip set, a hatch-aware exit (5.2) |
| **botnav.js** | no change (pure steering) |
| **items.js** | `randomLayout()` returns 16 with homes fixed and Forge/Grand placed (1.5); `STATIONS`; `canCraft` / `addKnowledge` adapters; `TREES` weight table + `rollTrees()`; `VB_TYPES` + `derange()` |
| **game.js** | walls loop and `DINFO` from `WORLD.WALLS` / `DOORS`; room shells from `ROOMS`; `CHEST_ROOMS` from `CHEST` (16); `ROOM_TYPE_BY_ID` gone (the server sends the layout); `applyLayout` accepts 16 and the types home/forge/grand/chest/mystery/merchant; minimap (4.4); wall map (shared texture); `cpBuild` for 25 + 8; `fxCull` (40 m cap); lamps (pool, 4.2); motes and shafts; offline sim tables; "Room N" naming |
| **feel.js** | the `'4'` vault checks to `VK` |
| **tests** | see 9. `world.test.js` is rewritten; tests that pin door ids, `'c0'..'c11'`, `'4'` or 12-entry layouts move to WORLD lookups (`combat`, `netcode`, `vault-open`, `vault-fizzle`, `panel-selby`, `doorguard`, `props`, `loot`, `bots*`, `utility`, `matchmaking`, `server-items`, `rules`, `sudden`) |

**Rule for the Foundation task:** behaviour is preserved, except for things that follow from the geometry: homes, hatches, 2-minute rounds and round caps. All new room functions stay inert until their tasks land, and their rooms render as plain halls.

---

## 8. Work breakdown

### Phase 1 (serial, must land first): **F0 Foundation** (Opus or a careful Sonnet; 1 agent)
- **Files:** `world.js`, `doorguard.js`, `items.js` (layout, STATIONS skeleton, adapters), plus a mechanical migration of server.js, game.js, feel.js and the tests (sections 5.1, 5.2 spawns/rounds/guard/FF, 7).
- **Includes:** the dev fast-forward on the server and the client button (small), and the light pool (4.2), because nothing renders correctly at 41 rooms without it.
- **Done when:** `npm test` is green. Offline and online both start in a home, walk the 5x5 and vote doors; the vault vote works; the guard opens a cell door in round 1; no console errors.
- **Branch:** `5x5-foundation`, merged before anything else starts.

### Phase 2 (parallel after F0; each task owns a block or file)
| task | owner files / blocks | content |
|---|---|---|
| **A Vault & rounds** | server.js `VAULT5-BEGIN/END` block (new, after SUDDEN), the SUDDEN constants | treasury, relic restock, crown default + alarm + 15 s in sudden, venting, PACE income 20; tests |
| **B Special rooms server** | new `rooms5.js` (pure: tree effects, vaultbreaker tally, ram, derangement) + server.js `ROOMS5-BEGIN/END` block + `{tree}`, `{vb}` message handlers | the 10 trees, the 4 vaultbreakers, `vb` / `vbNext` in roundState; tests |
| **C Room art** | new `rooms5art.js` (+1 `<script>` line in index.html) | home, forge, grand recycler, tree kit with 10 variants, vaultbreaker shell + 4 station skins + swap flash, vault treasury pile, hatch archway + name banner; lazy ROOMART queue hook |
| **D HUD & maps** | game.js `MINIMAP`, `MAP`, `PANEL` blocks; new `hud5.js` for banners and toasts | minimap/M map/wall map v2, icons, re-key banner, vb door plates, Seer pulse view, Hollow Oak hiding, ram ring, crown ring |
| **E Stations & knowledge glue** | items.js `STATIONS` block; server.js `craft`/`recycle`/`stationAt`; game.js workbench/recycler panels | bench tiers, craft time with cancel/refund, recycle efficiency, Master Forge `bonusTier`, the adapters wired to KNOWLEDGE.md when it merges |
| **H Elixir** | new `elixir.js` (pure: tank math, sink costs) + server.js `ELIXIR-BEGIN/END` block (`{pump}`, `{brew}`, `{refine}`, `{distill}`, the Counting House elixir bribe through the B helper) + the counter in `hud5.js` (coordinate with D: H owns only the counter element) + the pump prop in rooms5art.js (coordinate with C: H supplies the tank-level hook `GK.pumpLevel(id, n)`) | sections 1.7 and 11.8; `p.elixir` goes into the death pile; the Healing Draught item in items.js |
| **I Home base** (starts after H merges; it builds on `elixir.js`) | new `homebase.js` (pure: the upgrade tree, costs, send rules, hatch lock) + server.js `HOME-BEGIN/END` block (`{base}`, `{lockbox}`, sendable ticks, the rat NPC kind through `spawnNpc`, `hatchOk` hook into `pathOk`/`bfsPath`) + new `homeui.js` (Elixir Screen panel, SEND target map, telegraph toasts, gas fog) + the screen/lockbox/pad/sentry props in rooms5art.js (C provides the anchors `GK.homeAnchors(id)`) | section 1.8 |
| **G Bots 5x5** | server.js BOTS block (`pickDest`, `voteDoor`, `roomGoals`) + new `botgoals.js` | home routine, special-room use, vb re-plan, venting avoidance; `tests/bots5.test.js` |

**Conflict rules:**
- A and B never edit `botThink`.
- G never edits a VAULT5 or ROOMS5 block. It calls the exported helpers.
- D never edits rooms5art.js.
- Only E touches `craft`, `recycle` and `hasStation`.
- Shared message names are fixed here: `trees`, `vb`, `vbNext`, `ram`, `crown`, `treasury`, `vent`, `dbgFF`, `bribeCost`.

### Phase 3: **Q QA + balance** (after A-G merge)
- 20 simulated full bot matches (`tests/sim-fairness.js` extended): match length, spawn-slot fairness, vault-open round, crown share.
- A browser pass on Low and High: draw calls and the light pool.
- `docs/reports/5x5.md`.

---

## 9. Test plan
| file | checks |
|---|---|
| `world.test.js` (rewrite) | 25 + 20 rooms; no overlaps; `roomKeyOf` round-trips every room centre and 2000 random points; 60 doors; each door's `a`/`b` are adjacent; ids in canonical order; hatch count 8; pinwheel symmetry (rotating the layout by 90 degrees maps homes to homes); spawn points clear of props; `panelDX` clear of doors |
| `doorguard.test.js` | the random-vote sim on the 5x5 (no occupied non-vault, non-home room locked after the grace); hatch never counts as an exit; a home is never "trapped" |
| `rounds5.test.js` (new) | every round is `ROUND_MS`; `dbgFF` sets ≤ 10 s left under `GK_DEBUG` and is **ignored** without it (spawn a non-debug server); sudden death after round 5; decision after round 7 |
| `vault5.test.js` (new) | treasury paid only inside; relic restock; crown alarm opens the 4 vault doors and closes them after the claim breaks; venting damage outside the vault only in sudden death |
| `rooms5.test.js` (new, pure + live) | tree roll weights (chi-square over 100k rolls, no duplicates); each tree effect and its limit; derangement (no fixed point, all 4 types every round); `vbNext` revealed at 15 s; Keystone counts 2; Counting House cost 25 with the bribe rule off; Locksmith limits; Ram 20 s opens its door against 0 votes and resets each round |
| `stations.test.js` (new) | home recycler 50% (floor, min 1); Grand 100%; bench maxTier and costMul; master `bonusTier`; craft cancel on leave or hit refunds parts; layout always holds exactly 1 Forge and 1 Grand on opposite sides and ≥ 1 merchant |
| `elixir.test.js` (new) | the tank fills 1 per 5 s and caps at 48 (fake clock through the pure module); collect only in the home and within 2.5 m; a raider drains the tank and the owner gets the toast; the carry cap is 120; each sink's cost and effect; distill max 3; the pump stops when its owner dies; the elixir lands in the death pile; a malformed or out-of-room `{pump}` is ignored |
| `homebase.test.js` (new) | the upgrade order and costs; owner-only screen and stations; the lock pick channel (2 s / 5 s) blocks a non-owner's `pathOk` until it is done, never the owner, and is off in sudden death; the alarm toast goes to the owner only; the snare is one-shot; the sentry never fires while the owner is home and stops at 0 ammo; lockbox crack 8 s / 14 s; sends: 1 per round, none in round 1, never the vault or your own room, max 2 per room with a refund, the 3 s telegraph, Jammed Panel freezes the pick while the guard still opens an exit; Pump Leech vs Pump Guard; the owner's death clears the upgrades and spills the lockbox; rate limit |
| `bots5.test.js` (new) | 8 bots, 3 rounds at short `GK_ROUND_MS`: every bot leaves home, 0 refused moves over 60 s, at least one bot uses a home station, at least one vaultbreaker use, no bot stuck > 5 s |
| existing suites | migrated to WORLD lookups; `npm test` time stays below 40 s (new live tests use `GK_ROUND_MS` 3000-6000) |
| `qa-ui-static.test.js` | the dev button is absent from the DOM without `dbg` |

---

## 10. Risks
1. **F0 is big and touches everything.** Mitigation: it is mechanical and adds no features; one agent; the other tasks start only after it merges; the WORLD tables become the single source, which also removes today's three hand-synced door orders (server `addDoor`, game.js `wall()` order, `DINFO`).
2. **Light pool pops or wrong lighting** in unlit visible rooms. Mitigation: brighter emissive panels on unlit rooms (+15%), fades, and the vault always lit within 2 hops; check by eye on Low and High.
3. **Load time and memory** with 45 rooms and 60 doors. Mitigation: lazy ROOMART, cheap hatches, one shared wall-map texture, small panel canvases; measure on Low.
4. **An empty, slow map** (8 goblins, 25 rooms, 2-minute rounds). Mitigation: the round-1 guard opening, treasury pull, tree rooms on every home's 2-door path, the levers in 5.4, and QA metrics.
5. **Vaultbreaker shuffle confuses players.** Mitigation: never mid-round, a 15 s preview, one banner line, signs on the doors leading in.
6. **KNOWLEDGE.md is not merged.** Mitigation: all knowledge goes through 3 adapters (`canCraft`, `addKnowledge`, `perk*`) with today's behaviour as the default; E rewires them when it lands.
7. **Bot tick time** with more goal types. Mitigation: `pickDest` is still O(rooms) and runs only when idle; watch `BS.max` in tickbench.
8. **Offline demo drift.** Mitigation: it uses the WORLD tables; special rooms are visual only offline, and that is documented.

## 11. Open questions for the owner
1. **16 or 25 attached rooms?** The plan uses 16, one per perimeter cell.
2. **Home doorway open to everyone, unless the owner buys a Door Lock?** This plan says yes: homes can be raided, which creates "I know where you live" politics. The alternative is owner-only entry, which risks turtling.
3. **Crown win ON by default** (25 s, 15 s in sudden death, the alarm opens the vault), next to last-standing?
4. **Upgraded bench and recycler in the attached loot ring** (1 guaranteed each) plus the Grafting Bench tree. Is that OK?
5. **Tree rooms without duplicates per match?** This plan says yes.
6. **Match length:** sudden death after round 5 and the decision after round 7 (14 min max). OK?
7. **Treasury numbers** (+30 gold, +4 knowledge per round inside the vault) and **venting** (1 HP / 3 s) in sudden death.
8. **Elixir uses.** The recommendation is Brew (draught or tonic), Refine (the home recycler at 100%), Distill (+5 knowledge) and Oil the lock (a vault bribe). Also: is a raidable tank (anyone can drain it) OK?
9. **Base upgrades:**
   - Is the tree in 1.8 the right size (about 425 to buy everything against about 168 base income)?
   - Should a home die with its owner? This plan says yes, which fits "death loses everything".
   - Should the home stations be owner-only?
10. **Sendables:**
    - Are the 6 in 1.8 right?
    - Should the sender be named only to the victims? This plan says yes.
    - Should the vault stay off-limits as a target? This plan says yes.

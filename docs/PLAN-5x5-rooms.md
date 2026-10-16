# PLAN-5x5-rooms: tree rooms, vaultbreaker heists and the vault as activity rooms

Written 2026-10-16 (Opus, design only). Based on main at `227dc79` (PLAN-5x5 merged, KNOWLEDGE.md merged).
**This file supersedes PLAN-5x5.md section 2 (tree rooms), section 3 (vaultbreakers and the vault) and the task rows A, B and C in section 8.** Everything else in PLAN-5x5.md stays (geometry, homes, elixir, F0, D, E, G, H, I). Nothing here is implemented. Items marked **(owner?)** are listed in section 10.

## 0. Summary
- **Owner feedback:** the 4 tree rooms, the 4 vaultbreaker rooms and the vault were one-shot rooms (press E once). Each one now has an **activity loop**: something you do again and again, that pays a little each time, that keeps you there for a good part of a 2-minute round, and that other goblins can contest.
- **One framework, 15 rooms.** A pure module `activity.js` offers 9 primitives: channel, capture, timing, pool, station, heat, waves, carry, sequence (plus a limit ledger). Each room is a small data-and-handlers definition built from them. One server block dispatches one message (`act`) and runs one tick. One client file draws the state on the room's own props.
- **Tree rooms** (10 types, weights unchanged, rolled without duplicates): each is a short, readable loop. They pay mostly knowledge, healing, gear and intel, under one per-round and one per-match knowledge cap, so trees cannot run away with the economy.
- **Vaultbreakers** (4 types, shuffled every round by derangement, unchanged): each is a **multi-step heist** with interlocking stations, a risk meter that grows the longer you work, and sabotage. They have four different feels: **Ram** (siege, co-op crank, loud), **Locksmith** (stealth, precision pins, noise), **Counting House** (economy, a vote market and a strongbox robbery with heavy sacks), **Keystone** (ritual, an ordered circuit of guttering flames). Each produces vault-vote weight and one **token** that speeds up another heist, so the four feed each other in a ring.
- **The vault** is the climax. Its central objective is a **cumulative Crown Claim** on the dais that persists across rounds, sets off the vault alarm, is hunted by Vault Wardens and **decides the match at the time limit**. Around it: coffers (repeatable gold), door bars (the holders can re-seal a door against the 2-vote rule), the relic and the treasury. In sudden death each vaultbreaker turns into a weapon against the claimant.

---

## 1. The activity framework (`activity.js`, shared, pure)

### 1.1 Why
15 bespoke systems would be 15 sets of bugs, messages, bot code and tests. Every room below is expressed with the same few primitives. A room definition is roughly 40 to 80 lines of data and small handlers.

### 1.2 Module shape
`activity.js` is UMD like `items.js` (`module.exports` on the server and in tests, `window.ACT` on the client, which uses only the constants and the view helpers). It has **no** I/O, no timers and no `Date.now()`. Every function takes `now` and an `rng`, so tests run on a fake clock.

```js
ACT.def(type, spec)        // register a room type. spec below
ACT.get(type)              // the spec
ACT.init(type, rng, now)   // -> fresh room state st
ACT.verb(st, type, p, verb, arg, ctx) // a player action -> null | failure reason string
ACT.tick(st, type, ctx, dt)           // per server tick (10 Hz)
ACT.rekey(st, type, ctx)   // vaultbreakers only: the round boundary moved this type to another cell
ACT.view(st, type)         // the public snapshot sent as actS (small; no secrets beyond what props show)
```

**Room spec:**
```js
{ kind: 'tree'|'vb'|'vault',
  anchors: { well: 'NE', trunk: 'C', ... },     // which anchor each prop sits on (1.5)
  state0(rng, now) {...},                        // initial st
  verbs: { crank(st, p, arg, ctx) {...}, ... },  // each returns null or a reason
  tick(st, ctx, dt) {...},                       // optional
  onHurt(st, p, ctx) {...}, onLeave(st, p, ctx) {...}, onKill(st, killer, victim, ctx) {...}, // optional
  rekey(st, ctx) {...}, sudden(st, ctx) {...},   // optional
  npc: { husk: {hp, dmg, cd, speed, react, loot, look, name} },   // NPC kinds this room spawns
  bot: { score(m, p, st) {...}, next(m, p, st) {...}, maxStay: 45000 },  // see 6
  yield: { knowPerMin, goldPerMin, notes } }      // declared budget, asserted by econ5.test.js
```

### 1.3 The primitives
Each primitive is a plain object in `st` plus pure functions. They are the only state machines in the rooms.

| primitive | state | functions | used for |
|---|---|---|---|
| **channel** | `{by, anchor, t0, ms, x, z}` | `start(ch, p, now, ms)`, `update(ch, p, now) -> 'run'/'done'/'broken'`, `cancel` | hold E at a prop: bottle water, cut a scion, rob a box, light a stone. Breaks on a hit (glue calls `onHurt`), on moving more than 0.6 m from the start, on leaving the room, on death. `maxUsers` per anchor (default 1). |
| **capture** | `{holder, since, prog, contested}` | `step(cap, occupants, dt, opts) -> {holder, contested}` | a zone that pays its single occupant: spring pool, Hollow Oak nook, the crown dais. `contest: 'freeze'` (2+ goblins: nobody progresses). Pays only after `unhurtMs`. |
| **timing** | `{by, t0, per, a, b, step, n}` | `open(rng, now, {per:[lo,hi], win}) -> tm`, `judge(tm, tPress) -> 'hit'/'miss'` | a skill press on a moving prop: windlass, ratchet, lock pins. The **server** rolls the period and the window position for **every** attempt, so a fixed-delay macro fails. |
| **pool** | `{n, max, refillMs, t}` | `level(pl, now)` (lazy refill like the elixir tank), `take(pl, now, k)` | a shared, refilling resource: well water, basins, branches, coffers. This is the anti-camping valve: a room cannot pay more per minute than its pools refill. |
| **station** | `{by, item, doneAt, out, ownerUntil}` | `start`, `update`, `claim(st, p, now)` | processing with a delay: the grafting vise, the brain press, key blanks. The output sits **on the prop**; after a short owner window anyone can take it (theft is part of the play). |
| **heat** | `{v, t, decay, fired:[]}` | `add(h, n, now)`, `level(h, now)`, `crossed(h) -> [thresholds newly passed]` | a risk that grows with work and decays slowly: Locksmith noise, Keystone resonance, the vault alarm. Each threshold fires once until heat drops below it again. |
| **waves** | `{next, every, alive:[ids], max}` | `due(w, now, aliveCount) -> bool`, `spawned(w, id, now)` | NPCs that rise from a prop: husks, rootlings, wisps, Vault Wardens. The glue spawns through `ctx.spawn`. |
| **carry** | on the player: `p.carry = {tok, room, from}` | `pick`, `drop`, rules in 1.4 | a held object (bucket, coin sack): visible in the hand, cancels sprint and attacks if `heavy`, drops on a hit. |
| **sequence** | `{target:[...], pos, by, until}` | `press(s, id, now) -> 'ok'/'done'/'fail'` | ordered input on props: Memory lanterns, Keystone circuit, Seer rings (the "dials" variant: `target` is a state vector, `turn(i)` rotates one ring). |
| **limit** | `{round:{pid:{k:n}}, match:{...}}` | `ok(L, p, k, perRound, perMatch)`, `use(L, p, k)`, `newRound(L)` | every per-goblin cap. |

### 1.4 The glue contract (`ctx`, supplied by the server block)
`ctx = { now, rng, room, sudden, round, occupants(), anchor(id) -> {x, z, r}, award(p, what, src), spawn(kind, anchorId, opts) -> npcId, dmg(p, n, src), push(p, dx, dz), fx(kind, data, scope), toastAll(text), item(p, key) -> bool, take(p, key|slot) -> key|null, gold(p, n) -> bool, elixir(p, n) -> bool, votes: {...} }`
- **`award(p, {know, gold, item, tok, heal, pulse}, src)`** is the only way a room pays. It applies the knowledge caps (3.1), logs `m.actLog[src]` (used by econ tests and QA) and sends one `actFx` "+n" float at the prop.
- **`fx` scopes:** `'room'` (occupants), `'near'` (the room plus rooms 1 door-hop away through open doors), `'all'` (a toast for everyone; reserved for the few announcements named below).
- **Carry rules:** one carried object at a time. A heavy carry (`coin sack`) slows walking by 30% and blocks sprint, attacks and item use. Any hit drops it on the floor as a pickup at the carrier's feet (E to pick up, 0.5 s). Death drops it. A light carry (`bucket`) only blocks attacks; a hit spills it (it is gone).

### 1.5 Anchors (fixed geometry, so solids stay static)
Types are rolled (trees) or shuffled (vaultbreakers), but `world.js solidsOf` is static per room kind. So every type of a kind places its props on the **same anchor footprints**. Props that a type does not use are simply not built (trees) or hidden (vaultbreaker skins).

**Tree room (15x15):**
- `C`: the trunk, solid circle r 1.1 at the centre.
- `NE NW SE SW`: four posts at (±4.2, ±4.2) from the centre, solid circles r 0.7.
- `ring`: the floor zone r 3.0 around the trunk (never solid).

**Vaultbreaker room (22.5 x 15, the vault door in the middle of one long wall):**
- `B`: centre of the wall opposite the vault door, a solid box 2.4 x 1.0 against the wall.
- `L`, `R`: centre of each short wall, a solid box 1.2 x 1.2.
- `FL`, `FR`: 3 m to either side of the vault door, 2 m into the room, solid circles r 0.6.
- `F`: the floor lane in front of the vault door, 2 m wide x 5 m deep, never solid (the ram lane, the keystone socket).
- The crates in the 2 back corners (PLAN-5x5 6) stay.

**Vault (22.5 x 22.5):**
- `dais`: the existing dais, capture zone r 2.2 (`DAIS_R`).
- `K1..K4`: four coffers, one in each corner, 3 m from both walls, solid boxes 1.2 x 0.8.
- `D_N D_E D_S D_W`: a bar rack beside each vault door on the inside, wall-mounted (not solid).
- `grate`: a floor grate 4 m from the dais (Warden spawn, not solid).
- `relic`: the existing `WORLD.RELIC` pedestal.

`world.js` gets one `ANCHORS-BEGIN/END` block with `ANCHORS.tree`, `ANCHORS.vb(cell)` (rotated so `F` faces the vault door) and `ANCHORS.vault`, plus `solidsOf` entries for them. It is added by task R0 after F0 merges.

### 1.6 Server block (`server.js ACT-BEGIN/END`)
- **State:** `m.act = { [roomKey]: {type, st} }`, built in `newMatch` for the 4 tree cells (from `m.trees`), the 4 vb cells (from `m.vb`) and the vault.
- **Tick:** `actTick(m, now)` runs from the main tick at 10 Hz. For each room with occupants, or with live NPCs or running channels or stations, it calls `ACT.tick`, then updates every running channel. An empty room is skipped; its pools refill lazily.
- **Hooks (one line each in existing code):**
  - `hitTarget` calls `actHurt(m, target)` (break channels, drop carries)
  - `die` calls `actDeath(m, p)`
  - the room-change bookkeeping (`noteRoom`) calls `actLeave(m, p, prev)` (break channels, convert or drop carries)
  - the round boundary calls `actRound(m)` (limits roll over, vaultbreakers re-key, treasury, relic)
  - `vaultVotes` adds `heistVotes(m)` (section 4.6)
- **NPCs:** `spawnNpc` is generalised into `spawnNpcAt(m, kind, x, z, room, opts)`. NPC kinds come from the room specs (`spec.npc`), merged into the existing `NPC` table at load. `opts.goal = {anchor}` gives an NPC a prop target instead of a goblin (wisps). NPC kills from activities count as NPC kills (no goblin kill, no win effect), as today.
- **Timing judgement:** the client already syncs to server time (`srvT` via ping/pong). Every 5 s it reports a smoothed latency `{lat: ms}`. The server judges a press at `recv - clamp(p.lat, 0, 120)`, with a grace of 40 ms on each side of the window. A cheater can gain at most 120 ms of shift; the caps in 3.1 bound what that is worth.

### 1.7 Messages (fixed names)
| direction | message | content |
|---|---|---|
| client to server | `{act: {r, a, v, x?}}` | room key, anchor id, verb, an optional small argument (a choice index, a ring index). Verbs: `use` (E down), `tap` (timing press), `stop` (E up / release), `pick`, `drop`, `buy`, `choose`. |
| client to server | `{lat: ms}` | the smoothed latency, every 5 s |
| server to client | `{actS: {r, t, st}}` | the room's public view, to the room plus 1-hop neighbours through open doors, when dirty, at most 5 Hz per room |
| server to client | `{actMe: {...}}` | your own state: running channel `{a, t0, ms}`, open timing `{a, t0, per, wa, wb}`, carry, your caps used, blessings |
| server to client | `{actFx: {r, k, ...}}` | one-shot events: a "+n" float, a sound cue, a crack, a re-key flash |
| server to client | `{actFail: reason}` | `room`, `far`, `busy`, `cap`, `cost`, `item`, `state`, `cool`, `carry` |
| roundState fields | `vb`, `vbNext`, `breach`, `armed`, `writs`, `claims` | see 4 and 5 |

Validation for every `act`: the player is alive and entered, GO has passed, `r` is the player's current room, `a` is an anchor of that room's type, the player is within the anchor's reach (`r + 1.4 m`), the verb exists. Anything else is dropped silently (counted by the security fuzz). Rate limit: 8 `act` messages per second per player, the excess dropped.

### 1.8 Client (`act5.js`, new file, loaded after game.js)
- It keeps `actS` per room and `actMe`, and drives the E-prompt text through the existing prompt helper ("Crank the windlass", "Rob the strongbox (loud)").
- **Props are the interface.** Each art file registers `GK.actView[type] = (roomKey, st, me, dt) => {...}`, which animates its props: the bucket level, the ram's ratchet teeth, the brass pins, the coin pile, the flames. Nothing is drawn for rooms outside the cull set.
- **The only HUD:** while **you** run a channel or a timing check, one thin 140 px arc under the crosshair (the progress, or the moving needle and the window). It disappears when you stop. No permanent counters, no room panels, no quest log. Toasts reuse `toastMsg`.
- Offline demo: the activities are inert and visual only (as PLAN-5x5 4.6).

---

## 2. Economy anchors (what "a fair reward per minute" means)
| source | rate |
|---|---|
| round length | 120 s, 7 rounds max, sudden death after round 5 |
| gold | start 100, `PACE.income` 20 per round (10 per minute), kill bounty 15, items 30 to 200, panel bribe 50 |
| elixir | 1 per 5 s per home pump = 12 per minute |
| knowledge | 1 knowledge point per 20 knowledge, +1 point per brain eaten. Perks cost 1 to 3, the full tree 18 |

**Target band for one goblin who spends a full minute focused on one room:** about **10 to 15 knowledge** (half to three quarters of a point), **or 30 to 45 gold**, **or** an equivalent piece of utility (a heal item, a gear upgrade, a vault vote). Roughly 2 to 4 times the pump's elixir rate in value, because the room is contested and dangerous, while home is not.

---

## 3. Tree rooms (cells 6, 8, 16, 18)

### 3.1 Shared rules
- **Shell and roll:** unchanged from PLAN-5x5 2: a 15x15 room with a central trunk through a ceiling hole, emissive leaf cards in the type's colour, no new lights. The weights stay **Well 22, Brain Press 16, Spring 14, Seer 12, Grafting 10, Thorn 8, Gambler 7, Memory 5, Hollow Oak 4, Elder 2**, rolled per match without duplicates. `m.trees` is sent in the welcome and `matchStart`.
- **Knowledge caps:** all tree knowledge goes through `award`, with `TREE_KNOW_ROUND = 24` and `TREE_KNOW_MATCH = 80` (4 points) per goblin across all tree rooms. The Elder Seed and goblin brains do not count toward the cap. When a goblin is capped, the prompt says "The trees have taught you enough for now", and the knowledge part of a reward is dropped while the rest (items, heals, intel) still pays.
- **Readability:** one thing to look at per room (the trunk), plus at most 4 props on the anchors. Every state is shown on a prop.
- **Sudden death:** as before, only the vault regenerates, so the Healing Spring pool and the basins stop. Everything else keeps working.

### 3.2 The ten loops
Each entry: **loop**, cost, yield, contest, readability, bots, server, props, abuse, numbers.

#### 1. Sapling Well (22%): draw, drink or water, then steal the fruit
- **Loop:**
  1. At the well (`NE`), **crank the windlass**: 3 timing presses fill the bucket (the bucket on the rope rises one notch per hit; a miss sloshes one notch back).
  2. With a full bucket, choose: **drink** it at the well (+3 knowledge), or **carry** it (light carry) to the sapling trunk and **pour** it (1 s): the sapling grows one stage.
  3. At stage 4 a glowing **Knowledge Fruit** ripens on the trunk. **Anyone** can pick it (1.5 s channel): +12 knowledge. The sapling resets.
- **Cost:** time; a hit spills a carried bucket.
- **Yield:** the well is a pool of 4 buckets, refilling 1 per 12 s. Solo: about 4 to 5 buckets per minute, so 12 to 15 knowledge per minute by drinking. Drinking is capped at 4 per goblin per round, so after that watering is the only use.
- **Contest:** one goblin at the windlass at a time. The waterers build the fruit and anyone can steal it, which gives a shared-then-betrayed moment.
- **Readability:** the water level in the well shaft, the rope and bucket, the sapling's size (4 visible stages), the fruit's glow.
- **Bots:** drink while under the cap; then water if the fruit is at stage 2 or more; always pick a ripe fruit (high score).
- **Server:** `timing` (period 800 to 1100 ms, window 30%), `pool`, `carry: bucket`, `channel` for the fruit.
- **Props:** a stone well ring with a windlass and bucket (`bx` + a cylinder), a young trunk variant in 4 scales (one mesh, scaled), an emissive fruit sprite. About 8 draw calls.
- **Abuse:** the pool caps the room at 20 buckets per 4 minutes; the round cap of 4 drinks.

#### 2. Brain Press (16%): fight husks, press brains
- **Loop:** three **vats** (`NE`, `NW`, `SW`) bubble. Every 25 s a **Husk** climbs out of one (at most 3 alive; the first 10 s after a goblin first enters). Kill it for a **Husk Brain**. Put a brain in the **press** on the trunk (the screw press is built into the bark) and crank it (3 s channel).
- **Cost:** fighting husks; 3 s standing still at the press. **Optional:** pour 6 elixir into a vat to raise a husk now.
- **Yield:**
  - a pressed **goblin** brain gives 10% of the victim's knowledge instead of 5%, plus the normal +1 knowledge point and Brain Gourmet. Goblin brains are exempt from the tree cap.
  - a pressed Husk Brain gives +4 knowledge; eaten raw anywhere, +2.
  - About 2.5 husks per minute, so 10 knowledge per minute solo, plus whatever the kills bring.
- **Contest:** husks attack the nearest goblin, so a duel in this room has a third party. The presser is a sitting target for 3 s.
- **Readability:** the vats' bubbling rate rises as the next husk nears; the press's screw turns while it is cranked.
- **Bots:** go there carrying a goblin brain (score +4), kill husks when healthy, press.
- **Server:** `waves` (kind `husk`: hp 30, dmg 6, cd 900, speed 3.0, react 400 to 650 ms, loot: Husk Brain only), `channel`, `limit` (husk presses 6 per round).
- **Items:** `x:huskbrain` (consumable, `use: 'brain'`, +2 knowledge, gives no knowledge point, never sold).
- **Props:** 3 vats (cylinder + an emissive liquid disc), the screw press (2 boxes + a cylinder). Husks reuse the goblin model with a grey tint (look 1).
- **Abuse:** the wave timer is per room, not per goblin, so camping cannot multiply husks; the elixir rouse has a 10 s cooldown.

#### 3. Healing Spring (14%): hold the pool, bottle the water
- **Loop:**
  - **Hold the pool** (`ring`): a goblin who is **alone** in the pool and unhurt for 1.5 s heals 2 HP/s. With 2 or more goblins in it, nobody heals, so the pool forces a fight or a truce.
  - **Bottle** at one of the three basins (`NE`, `SE`, `SW`): a 2 s channel gives **Spring Water** (heal 20 through the existing heal path, Field Medic applies). Each basin refills in 25 s.
  - **Bless (optional):** add 6 elixir when bottling to make **Blessed Water** (heal 40).
- **Cost:** time, and turning your back on the room.
- **Yield:** about 7 bottles per minute for the whole room; at most 3 bottled per goblin per round and 2 carried. It is the healing supply for the vault push.
- **Readability:** the water in each basin (empty, refilling, full), and a soft glow on the pool when someone is healing.
- **Bots:** come when below 60% HP and hold the pool; bottle when they carry no heal item.
- **Server:** `capture` (`contest: 'freeze'`, `unhurtMs` 1500), `pool` x3, `channel`. Off in sudden death.
- **Items:** `x:springwater`, `x:blessedwater`.
- **Props:** 3 stone basins, a water disc around the roots. About 6 draw calls.
- **Abuse:** the pool only tops you up to max HP, so it gives nothing to a full-health camper; the basin refill bounds the bottles.

#### 4. Seer's Tree (12%): align the seeing stones
- **Loop:** three **seeing stones** (`NE`, `NW`, `SE`) each carry a stone ring with 6 glyphs. The trunk's eye shows 3 target glyphs, colour-coded to the stones. E on a stone turns its ring one step (0.5 s each). When all three match, a **Vision** fires for every goblin who turned at least one ring in that solve; then new targets roll.
- **Rewards by the solver's count this round:**
  1. an 8 s pulse: every goblin on your minimap, plus this round's picks of every room (as PLAN-5x5), and +3 knowledge
  2. the next vaultbreaker layout (`vbNext`) right away, instead of 15 s before the round end, and +3 knowledge
  3. a pulse that also shows each goblin's HP, no knowledge
- **Contest:** anyone can turn any ring, to help or to turn it away from the target. Everyone sees "<name> consulted the Seer" (as before), so a solve also gives you away.
- **Readability:** the ring positions and glyphs, and the eye's three glyphs.
- **Bots:** solve once per round (score +2), never sabotage.
- **Server:** `sequence` (dials variant), `limit` (3 per round per goblin). A solve needs the server's targets; the client only sends `turn`.
- **Props:** 3 posts with an inset ring (a torus, one instanced mesh), glyphs on one shared canvas texture. About 5 draw calls.
- **Abuse:** a solve rewards only goblins who turned a ring; the per-round limit.
- **Numbers:** the average distance is 3 steps per ring, so about 9 turns plus walking, about 8 s per solve.

#### 5. Grafting Bench (10%): cut scions, graft gear
- **Loop:**
  1. **Cut a scion** from one of 4 low branches on the trunk: a 2 s channel gives a **Scion** item. Each branch regrows in 30 s.
  2. At the bench (`NE`, a master bench with `bonusTier` as before), **graft**: put a weapon or armour and a scion in the vise. It processes for 6 s. You may walk away, but the result sits in the vise.
  3. The result is the item's **reforged `+` twin** (KNOWLEDGE.md Reforge: +20% attack or health), without needing the Reforge perk or its metal cost.
- **Cost:** a scion; the item is exposed in the vise. After the 6 s plus a 4 s owner window, **anyone** can take it.
- **Yield:** up to 2 grafts per goblin per round. It is the strongest gear-upgrade source outside the Master Forge.
- **Contest:** branches are shared; vise theft; the bench also crafts, so there is a queue.
- **Readability:** the branches (stubs when cut), the item visibly clamped in the vise, a green glow when done.
- **Bots:** graft their equipped weapon when they hold a scion (score +3).
- **Server:** `pool` (branches), `channel`, `station` (vise: `ms` 6000, `ownerMs` 4000), `limit`.
- **Items:** `x:scion` (max 2 carried, never sold).
- **Abuse:** an already reforged item cannot be grafted (no stacking).

#### 6. Thorn Shrine (8%): bleed for a blessing
- **Loop:** **grip the thorns** on the trunk (hold E). You take 4 HP/s, ignoring armour. Release to bank a blessing by how long you held: 3 s tier I, 6 s tier II, 9 s tier III. The first grip each round asks once (a 3-button choice on the prompt) which blessing:

| blessing | I | II | III |
|---|---|---|---|
| **Fury** (attack) | +5% | +10% | +15% |
| **Bark** (max HP) | +8% | +15% | +22% |
| **Thorns** (melee reflect) | 10% | 20% | 30% |

  - A blessing lasts until the end of the **next** round. One at a time; a new grip refreshes or upgrades it.
  - The grip never kills: at 1 HP it releases on its own.
  - **Blood bowl** (`SE`): every kill inside this room (goblin or husk-type NPC) adds a drop, up to 3. Drinking the bowl (1 s) gives +5 knowledge per drop.
- **Cost:** 12, 24 or 36 HP; a hit from someone else breaks the grip and banks nothing.
- **Contest:** the gripper is a bleeding, stationary target; the bowl pays whoever fights here.
- **Readability:** the thorns glow brighter with the grip time (3 steps); the bowl's level.
- **Bots:** grip to tier II when above 80% HP and nobody else is in the room.
- **Server:** `channel` (variable length, banked on `stop`), `limit` (2 grips per round), the blessing on `p.bless = {k, tier, until}` read by `recalc`.
- **Abuse:** self-damage is the cost; the Spring is never in the same room.

#### 7. Gambler's Root (7%): ride the ladder
- **Loop:** feed a weapon or armour into the hollow. The root chews (1.5 s), then either swallows it or spits out a **random item one tier higher** (same type) onto the stump. Leave it there and press E on the hollow again to **ride the ladder** another step, or pick it up to take it. The 5 knots up the trunk light the current step.
- **Odds per step:** 70%, 55%, 40%, 25% (tier is capped at 5).
- **Root's hoard:** every swallowed item swells one of 5 hanging gourds. When the fifth fills, the next goblin to feed the root gets a **guaranteed tier 3+ item** first, and the gourds empty.
- **Optional:** pour 10 elixir before a step for +10% on that step.
- **Cost:** the item (you can lose a good one).
- **Yield:** expected value is positive on the first step, negative after the second. The hoard turns the room's losses into one big win for whoever is next, so goblins watch the gourds and fight for that turn.
- **Readability:** the knots, the item on the stump, the 5 gourds.
- **Bots:** feed junk once (greed > 0.5), ride a second step only if greed > 0.8, always feed when the gourds are 5/5.
- **Server:** `station` (hollow), `limit` (4 feeds per goblin per round), the hoard counter in `st`. The hoard prize needs the goblin to have fed at least once this round, so dumping junk to pass the jackpot to a friend does not work.

#### 8. Memory Tree (5%): repeat the lanterns
- **Loop:** E on the trunk starts a sequence. The tree flashes the 4 lanterns (`NE`, `NW`, `SE`, `SW`, 4 colours) in a server-rolled order, 0.7 s each. The length is 3 + your successes this match (max 7). You then have 12 s to touch the lanterns in that order (E at each).
  - success: +5 knowledge (+1 per step above 3)
  - every third success in a match, once per match: **Remembrance**, one perk from the next rank of a branch learned early, at no point cost (the KNOWLEDGE perk API; if the order rule forbids it, +10 knowledge instead)
- **Cost:** time; a 6 s room cooldown between attempts.
- **Contest:** one sequence at a time per room. **Anyone touching a lantern during your sequence breaks it**, so another goblin can sabotage you just by walking up to a lantern.
- **Readability:** the lanterns themselves are the display.
- **Bots:** try once per round (55% success per step, so they rarely reach long sequences).
- **Server:** `sequence`, `limit` (3 successes per round). The sequence is in `actS` while it is shown. A hacked client could read it; the reward caps keep that cheap. Noted, not fixed.

#### 9. Hollow Oak (4%): be the Warden
- **Loop:** the trunk has a nook big enough for one goblin (`ring`, a capture zone r 0.9 on the open side). Stand in it for 3 s and you are the **Warden of the Oak**:
  - everyone in the room is hidden from every map and Seer pulse, and the room's pick is hidden on panels and wall maps (as before)
  - every 8 s you hear a **whisper**: a private toast with one secret, rotating between a random goblin's room and HP, a vault door's breach, the Counting House strongbox total, the Keystone circuit order, the next vaultbreaker layout. Each whisper is +2 knowledge (6 per round).
  - **Ambush:** your first hit on a goblin who entered after you became Warden does +50% (once per goblin per round).
- **Cost:** you are in a dead-end nook. A hit ejects you and you lose the Warden status.
- **Contest:** king of the hill in the dark.
- **Readability:** an eye-shaped knot above the nook glows faintly while it is held; the room is darker than the others (the leaf cards are dim).
- **Bots:** cautious bots hide there when hurt; aggressive bots check the nook on entry.
- **Server:** `capture` (`maxHolders` 1, `unhurtMs` 3000), `limit`. **AFK rule:** whispers pay only if the Warden's yaw changed by more than 30 degrees in the last 10 s.

#### 10. Elder Tree (2%): wake the giant, then race for the seed
- **Loop:** three **root-stones** (`NE`, `NW`, `SE`) each need **20 s** of channel to light. Stones keep their progress. Several goblins on different stones progress at once. When all three are lit, the Elder wakes (a 5 s rumble, a toast to everyone, "The Elder Tree is waking"), then drops the **Elder Seed** on the trunk. The first goblin to pick it (2 s channel) gets the prize. Then the stones reset.
  - **1st waking:** +25 knowledge and a tier 3+ item, announced to all
  - **2nd:** stones need 30 s each; +12 knowledge and a tier 2+ item
  - **3rd:** stones need 30 s each; +6 knowledge and a tier 1+ item. Then the tree withers into a Sapling Well at the next round boundary.
- **Guardians:** while any stone is being channelled, a **Rootling** (`waves`: hp 40, dmg 8, speed 3.4, max 2) climbs out of a channelled stone every 20 s.
- **Contest:** cooperation (3 goblins wake it in about 20 s) followed by betrayal at the seed.
- **Bots:** join a stone when another goblin is already channelling (they like co-op), always go for the seed.
- **Server:** `channel` per stone with persistent progress, `waves`, `channel` for the seed. The Elder rewards are exempt from the tree cap.
- **Solo:** 60 s of channelling plus the rootlings, so a goblin can wake it alone in one round.

### 3.3 Tree balance (one focused goblin, one minute)
| tree | knowledge / min | other yield / min | caps |
|---|---|---|---|
| Well | 12-15 | fruit +12 shared | 4 drinks / round |
| Brain Press | ~10 (husks) | +1 point per goblin brain (exempt) | 6 husk presses / round |
| Spring | 0 | 2 HP/s, ~3 heal bottles | 3 bottles / round |
| Seer | 6 (2 solves) | intel | 3 solves / round |
| Grafting | 0 | 1-2 gear upgrades | 2 / round |
| Thorn | 0-15 (bowl) | a blessing | 2 grips / round |
| Gambler | 0 | item tier +1 at 70% | 4 feeds / round |
| Memory | 10-15 | a perk once per match | 3 / round |
| Hollow Oak | 12 (6 whispers) | intel, ambush | 6 whispers / round |
| Elder | 25 / 12 / 6 per waking (exempt) | an item | 3 wakings / match |

All tree knowledge (except the Elder and goblin brains) is under `TREE_KNOW_ROUND` 24 and `TREE_KNOW_MATCH` 80 per goblin.

---

## 4. Vaultbreaker heists (cells 7, 11, 13, 17)

### 4.1 Shared rules
- **Position shuffle:** unchanged. `m.vb` is re-assigned at every round boundary by a derangement (every type moves). `vbNext` is pre-rolled and revealed 15 s before the round end (or early through the Seer). A room's type never changes mid-round. On re-key the room plays a "RE-KEYED" flash and a clank, the station skins swap, and a toast in that room names the new function.
- **What carries over a re-key** (the rule: **things on doors and in pockets stay; machines reset**):

| heist | carried to the next round | reset |
|---|---|---|
| Ram | `breach` on each vault door (it is damage on the door, not on the ram), decayed by 20; Iron Wedges and Rune Charges (items) | the winch tension, the lane |
| Locksmith | Vault Lockpicks, Skeleton Keys, Key Blanks (items) | the 5 pins, the noise |
| Counting House | the **strongbox balance** (it is the house's money, it moves with the type) | the writs and counter-writs (they are this round's votes) |
| Keystone | Gold Leaf, Rune Charges (items) | the stones go dark, a new circuit order |

  A goblin holding a coin sack in a room that re-keys away from the Counting House keeps it: the sack converts to gold at once ("you slipped out in the confusion").
- **Risk grows the longer you work.** Each heist has its own meter: the Ram is publicity, the Locksmith is noise, the Counting House is the alarm and slow sacks, the Keystone is resonance and wisps.
- **Readability:** one big type sign over `B` (as PLAN-5x5 3.2), the door plates and map icons for the type, and **every progress state is on a prop**: cracks on the vault door, pins on the lock face, coins in the box, flames on the stones. The vault door's cracks are also visible from the vault side.
- **Bots:** section 6.
- **Shared numbers:** `HEIST_ACT_R` reach 1.6 m; all channels break on a hit.

### 4.2 Battering Ram (siege: loud, co-op, physical)
**Stations:** `B` the winch (two crank handles), `F` the ram hanging on chains over the lane, `FL` the release lever, `FR` a wedge rack (decor; wedges land here).
1. **Wind the winch.** At either handle, timing presses on the ratchet: each hit adds one tension notch (max 6), a miss slips one. **Two goblins can crank at once, one per handle**, and both add notches, so a pair winds twice as fast.
2. **Release.** E at the lever (needs 2+ notches). The ram draws back (0.8 s, the chains creak: the telegraph), then swings down the lane and strikes the door: **breach += 3 x notches** (max 18), doubled by a **Rune Charge** used at the lever.
3. **The lane is the defence.** Any goblin standing in the lane at impact takes 25 damage and is pushed 2 m sideways, and the strike's breach is **halved** (the body takes it). Defenders can body-block; attackers can knock defenders out of the lane first.
4. **Breach** (per vault door, 0 to 100, shown as 3 crack stages on both faces of the door):
   - **50 "Cracked":** an **Iron Wedge** falls on the wedge rack (one per door per crossing). From now on, any room that picks this door counts **+1 vote** for it (a cracked door needs only one pick to open, PLAN-5x5's 2-vote rule satisfied by the damage).
   - **100 "Broken":** a second wedge drops; the door **opens at the round end regardless of votes** (as the old Ram) and stays open like any opened door.
   - Unbroken breach decays by 20 at every round boundary.
- **Sabotage:** **Slack the winch**: hold E for 1.5 s at the pawl (`B`), notches drop to 0.
- **Risk (publicity):** a toast to everyone on the first strike of a round ("The Ram is pounding the NORTH vault door"), at Cracked and at Broken. The door's breach is on every map.
- **Numbers:** a notch takes about 1 s at a 75% hit rate (period 700 to 900 ms, window 30%). A full wind solo is about 8 s, the walk and swing 3 s, so about 11 s per 18 breach: **about 60 s solo** from 0 to Broken, about 35 s for a pair. Over two rounds the decay means a solo goblin who follows the ram can break a door in one long round or crack one per round.
- **Sudden death:** all doors are open, so the Ram becomes **Quake**: a full strike (6 notches) shakes the vault and knocks everyone off the dais (claims frozen 3 s, no damage). Cooldown 15 s.

### 4.3 Locksmith (stealth: precision, quiet, punished when noisy)
**Stations:** `B` the lock face (a big brass replica of the vault lock with 5 visible pins), `L` the grindstone (key cutting), `R` the alarm bell hanging from a bracket (the noise meter), `FL`/`FR` small iron grilles at floor level (Warden doors).
1. **Blank.** At the grindstone, a 3 s processing with **2 metal** (or an **Iron Wedge**, which also sets one pin for free when you reach the lock) gives a **Key Blank** item.
2. **Pick the lock.** At the lock face, set the 5 pins **in order**. Each pin bobs; a timing press when it reaches the shear line sets it (period 900 to 1200 ms, window 18%, about 180 ms). A miss adds **+18 noise** and drops the last set pin. Pins are **room state**, not personal: a second goblin can keep setting pins after you (co-op), or press deliberately badly (**jiggle**: +25 noise, drops a pin) to sabotage.
3. **Cut.** With all 5 pins set and a Key Blank in your bag, E at the lock: a 3 s channel, then choose the cut (3 buttons on the prompt):
   - **Vault Lockpick** (the existing `x:lockpick`: +1 vault vote when used in a room whose pick is a vault door; 1 per goblin per round, 2 per match)
   - **Skeleton Key** (a token for the Counting House; 1 per goblin per round)
   - **Fence the cut** (+20 gold, +3 knowledge; 3 per round)
   The pins drop after a cut.
- **Risk (noise):** noise decays 3 per second. The bell's swing shows it (still, swaying, ringing).
  - **50:** the room shows on everyone's minimap (like the Alarm Bell sendable) until it drops below 40.
  - **100: the lock alarm.** 2 **Vault Wardens** come out of the grilles, all pins drop, noise resets to 20.
  - A quiet, skilled picker is invisible; a clumsy one gets the whole map and two guards.
- **Numbers:** at a 65% hit rate, 5 pins take about 8 s and add about 50 noise (minus decay), so a full lock is about 18 s with the blank and the cut, and two in a row usually ring the bell. **Vault Warden** NPC: hp 90, dmg 14, cd 1000, speed 3.4, loot [1, 1].
- **Sudden death:** the cut options become **Crown Seal** (a token: use it on the dais for +5 s of crown claim; 2 per goblin per match) and Fence.

### 4.4 Counting House (economy: a vote market and a robbery)
**Stations:** `B` the clerk's desk behind a grille (a passive clerk NPC prop, not a goblin), `L` the great scales, `R` the strongbox, `FL`/`FR` coin-sack hooks (decor).
1. **The vote market (writs).** At the desk, **buy a Writ**: +1 weight on **this room's** pick this round. The price rises with each writ bought in this room this round: **20, 30, 40** (max 3), and works even when the `bribe` rule is off.
2. **Counter-writs.** Anyone can buy a **Counter-writ** for 1.5x the current writ price: it cancels one writ (never the room's base vote). A goblin who does not want the vault open can pay to stop it. The scales show the market: gold weights in the left pan for writs, iron weights in the right pan for counter-writs, and the beam tips.
3. **The strongbox fills.** Every writ and counter-writ payment goes into the box, plus **50% of every panel bribe paid anywhere in the arena**, plus interest of 3 gold every 5 s. The coin pile inside the open-lidded box shows the amount (3 stages); a Hollow Oak whisper tells the exact number.
4. **Rob it.** E at the box: a **6 s channel**, loud (the clerk rings his bell: the room shows on every minimap for 15 s, and everyone gets "The Counting House is being robbed!"). With a **Skeleton Key**, 1.5 s and silent. The box opens and its gold comes out as **coin sacks** of up to 40 gold each (heavy carry, max 4 sacks at a time; any extra stays in the box). The robber also gets one **Gold Leaf** token if the box held 40 or more.
5. **Get out.** A sack becomes your gold the moment you carry it out of the room through any door. Carrying is slow (-30%), with no sprint and no attacks, and any hit drops it. A full box needs several trips or several goblins, and anyone can grab a dropped sack.
- **Risk:** the robbery alarm, then the slow walk out. The clerk does not fight; the other goblins are the guards.
- **Numbers:** interest alone is 72 gold per round; with a couple of writs and one map-wide bribe, a box usually holds 100 to 150 at the end of round 2. A clean solo robbery is 6 s plus 3 trips of about 4 s each. The writ route is cheaper than the old panel bribe (50): this is where gold buys the second vault vote.
- **Sudden death:** the desk sells **Bounties**: pay 30 (+15 each) to put a bounty on the current top crown claimant. Whoever kills him gets the pot. It is the economic answer to the climax.

### 4.5 Keystone (ritual: an ordered circuit of guttering flames)
**Stations:** `F` the keystone socket in the floor in front of the vault door, with a ring of 4 glyphs around it; `L`, `R`, `FL`, `FR` four **rune stones**, each with its own glyph and a fire bowl on top; `B` an offering altar (for Gold Leaf).
1. **Light the circuit in order.** The socket's glyph ring shows the order, and the **next** required glyph glows. Light a stone with a 2 s channel. Each stone must be lit within **8 s** of the previous one, or the whole circuit fizzles dark. Lighting the wrong stone is a **backlash**: 8 damage and the circuit goes dark. A new order rolls every time the circuit goes fully dark.
2. **Keep it burning.** A lit stone burns for **35 s**, flickers for its last 5 s, then goes dark (the circuit breaks). **Feed** any lit stone (1 s channel, by anyone) to reset it to 35 s. Order does not matter for feeding.
3. **Armed.** While all 4 stones burn, the keystone is **ARMED**: "KEYSTONE ARMED" on every panel and map, and this room's pick counts **2 votes**. It only counts if it is still armed **at the tally**, so the last 35 s of every round are the decisive fight: the ritualists feed, the others snuff.
4. **Snuff (sabotage).** Any goblin can snuff a lit stone (1.5 s channel). Snuffing one breaks the armed state; if that stone was mid-circuit, the circuit goes dark.
5. **Gold Leaf.** Offered at the altar (1 s), it **lights the next 2 stones** in order at once.
- **Risk (resonance):** +10 per lighting, +5 per feed, -1 per second. At 30, 60 and 90, **wisps** come out of the socket (1, 2, 3; max 3 alive). A wisp (hp 15, no damage, speed 4.5, `goal: anchor`) flies to the nearest lit stone and snuffs it after 2 s next to it. Wisps die in one or two hits, so the threat is distraction.
- **Rewards:** each full circuit lit from dark gives +3 knowledge to every goblin who lit one of its stones (2 circuits per goblin per round), and a **Rune Charge** token to the goblin who lit the fourth stone (1 per goblin per round).
- **Numbers:** a solo circuit is 4 x (2 s + about 1.5 s walking), about 14 s, then one feed every ~30 s per stone, so one goblin can hold it armed, but only barely against one saboteur plus wisps. Two ritualists hold it comfortably.
- **Sudden death:** while armed, **Ward**: the current top claimant on the dais gains claim at half speed.

### 4.6 The ring of tokens (how the four interlock)
```
 Ram --Iron Wedge--> Locksmith --Skeleton Key--> Counting House --Gold Leaf--> Keystone --Rune Charge--> Ram
```
| token | made at | used at | effect |
|---|---|---|---|
| **Iron Wedge** | Ram, when a door reaches 50 and 100 | Locksmith grindstone | a free Key Blank (no metal) and the first pin set for free |
| **Skeleton Key** | Locksmith cut | Counting House strongbox | a 1.5 s silent robbery instead of 6 s and the alarm |
| **Gold Leaf** | Counting House robbery (box 40+) | Keystone altar | lights the next 2 circuit stones at once |
| **Rune Charge** | Keystone, the 4th stone of a circuit | Ram lever | the next strike does double breach |

- Tokens are consumable items (`x:wedge`, `x:skeleton`, `x:goldleaf`, `x:runecharge`): one inventory slot each, max 1 of each carried, never sold, dropped on death like everything else. A token used in the wrong room gives `actFail: 'room'`.
- **Every heist works without tokens.** Tokens only speed one up, so a solo goblin is never blocked; a goblin who plans across rounds (and across the shuffle, because the target room moves) wins time.

### 4.7 The vault tally (replaces `vaultVotes`)
Per round, for every room whose pick is a vault door:
`weight = 1 + (Keystone armed at tally ? 1 : 0) + max(0, writs - counterWrits) + lockpicks used + (the picked door is Cracked ? 1 : 0) + panel bribes (the existing rule)`.
- If the sum over those rooms is **at least 2**, every picked vault door opens (the existing global rule).
- Then every **Broken** door (breach 100) opens regardless.
- Then the vault's own **bars** (5.3) close barred doors, unless they are Broken, the crown alarm is on, or it is sudden death.
- `heistVotes(m)` returns the extra weights per room. `roundState` gains `breach: {doorId: 0..100}`, `armed: [roomKey]`, `writs: {roomKey: net}` so panels and maps show them.

### 4.8 Heist balance
| heist | time to its vault output (solo / pair) | other yield | risk |
|---|---|---|---|
| Ram | ~60 s to Broken, ~30 s to Cracked / ~35 s and ~18 s | Iron Wedges | everyone told; the lane |
| Locksmith | ~18 s per lockpick (1 per round) | fenced cuts 20 gold + 3 knowledge (3 per round), Skeleton Keys | noise, Wardens |
| Counting House | 20-40 gold per writ, instant | the strongbox, 100-150 gold, Gold Leaf | alarm, slow sacks, counter-writs |
| Keystone | ~14 s to arm, then maintenance to the tally | +3 knowledge per circuit, Rune Charge | wisps, saboteurs, backlash |

---

## 5. THE VAULT: the climax

### 5.1 The Crown Claim (the central objective)
- **Capture** on the dais (`contest: 'freeze'`, `unhurtMs` 1000). A goblin alone on the dais, unhurt for 1 s, adds to **his own claim** at 1 s per second. With 2 or more goblins on the dais, nobody gains. A hit pauses the gain for 1 s; it does **not** reset the claim.
- **The claim is cumulative and persists across rounds.** It is lost on death (death loses everything).
- **`CLAIM_FULL` = 45 s:** the goblin who reaches it is crowned Goblin King and wins at once. Last goblin standing still wins too.
- **At the time limit** (the end of round 7) the match goes to the living goblin with the **highest claim** (at least 5 s), then the most kills, then the most HP. This replaces "most kills, then HP" as the first criterion. **(owner?)**
- **Vault alarm:** while anyone is gaining claim, all 4 vault doors are forced open, and for 10 s after he stops. `{crown: {claims: [{id, name, s}] (top 3), full: 45}}` goes to everyone at 4 Hz while the claim changes; the dais ring and the M map show the leader.
- **Vault Wardens:** while anyone is gaining claim, a Warden rises from the grate every 20 s (max 2 alive) and targets the claimant. A lone camper must fight PvE while the map arrives.
- **Sudden death** (after round 5): claim gains at 1.5x. The vaultbreakers turn into anti-claimant tools (Quake, Crown Seal, Bounty, Ward; 4.2 to 4.5).

### 5.2 Coffers (the repeatable)
- 4 coffers (`K1..K4`), each a pool of 3 handfuls, refilling 1 per 15 s. **Scoop** a handful: a 2 s channel, +12 gold. Max 6 scoops per goblin per round. In sudden death they refill twice as fast.
- **Numbers:** the room pays up to about 50 gold per minute per goblin. The vault is the hardest room to reach, so it pays the most gold.

### 5.3 Door bars (the holders' answer to the 2-vote rule)
- Inside the vault, beside each vault door, a **bar rack** (`D_N`, ...). Channel 5 s at an **open** vault door's rack to **bar** it: it closes at the round end, so outsiders need a new vote (or the Ram) to get back in.
- Each door can be barred once per round. A bar does nothing on a Broken door, during the crown alarm, or in sudden death.
- This gives the holders something to do between claims, and turns the vote rule into a back-and-forth. **(owner?)**

### 5.4 Kept from PLAN-5x5
- **Relic** restocks at the start of rounds 3 and 5 if taken.
- **Treasury:** every living goblin inside the vault at a round end gets +20 gold and +4 knowledge (lowered from +30 gold because the coffers now pay).
- **Venting** in sudden death, as PLAN-5x5 3.3.

### 5.5 How a match flows
| rounds | the vault |
|---|---|
| 1-2 | sealed. Goblins farm trees, homes and loot; the first heists start (Keystone and Counting House are the fastest votes). |
| 3-5 | the vault opens most rounds through heists. Holders scoop, bar doors and start claims; every claim pulls the map in through the alarm. Claims of 10-25 s build up. |
| sudden death (6-7) | every door open, claims at 1.5x, the vaultbreakers are anti-claimant weapons, outer rooms vent. The match ends with a crown or with the highest claim. |

---

## 6. Bots
- **Generic driver:** `botgoals.js` (task G) scores each activity room with `spec.bot.score(m, p, st)` alongside the existing `pickDest` terms, then calls `spec.bot.next(m, p, st)` each think while inside. `next` returns `{go: anchorId}`, `{verb, a, x}` or `null` (leave). Bots call the same `ACT.verb` path as humans, so every rule and cap applies.
- **Timing checks:** bots do not simulate the press; the glue rolls a hit with probability `0.45 + 0.3 * skill` (`skill` from the personality), so a good human beats a bot.
- **Time box:** a bot leaves after `spec.bot.maxStay` (default 45 s), when below its flee threshold, or when a heat threshold fires in a vb room (cautious bots).
- **Per room:** listed in each loop above. Vaultbreakers: Keystone +6 after round 2 (light and feed; snuff when a rival armed it and the bot does not want the vault open); Counting House +5 with gold ≥ 50 (writs when voting vault, counter-writs when a human is about to open it alone and the bot is not voting vault, robbery when the box ≥ 80 and greed > 0.6); Locksmith +3 with 2 metal (cut a lockpick, then fence); Ram, aggression > 0.6 after round 3 (crank, pull; pairs up with another bot cranking). They carry and use tokens when the target type is within 3 hops.
- **Vault:** contest any claimant (+9 as before), scoop when nobody threatens them, and bar a door only when they are the vault's only occupant.
- **Re-plan:** on a `vb` change, a bot whose goal was a type re-targets the room that now holds it.

---

## 7. Anti-abuse summary
- **Server authority:** every verb validated (1.7); every reward through `award`; every cap in `limit`; all randomness (timing windows, orders, targets, rolls) on the server.
- **AFK farming:** nothing pays without input except captures; captures pay only while unhurt, alone and (Hollow Oak) looking around; the crown pays only alone on the dais and pulls the whole map plus Wardens.
- **Camping:** pools bound every room's output per minute; the per-round limits stop one goblin from draining a room; vb heat punishes long stays; the knowledge caps bound the trees.
- **Macros:** random per-attempt timing windows; the rate limit; a miss has a cost (slosh, slip, noise).
- **Collusion:** co-op speeds things up but shares the pools and the per-goblin caps; the Gambler hoard needs the receiver to have fed; Vision rewards only ring-turners.
- **Griefing:** sabotage (slack, jiggle, counter-writ, snuff, lantern-touch) always costs the saboteur time in the room with his victim, so it is a fight, not a remote annoyance.

---

## 8. Art and performance (props per room)
All props are procedural (`bx`, `inst`, `GK.stations` materials), emissive only, no new lights (the 9 + 1 rule), and built through the lazy ROOMART queue. **Budget: at most 25 draw calls of props per tree room, 30 per vb room (all 4 skins built, 3 hidden), 20 extra for the vault.** Animated parts are a handful of `Object3D` transforms per room, updated only in the cull set.

| room | props |
|---|---|
| Well | well ring, windlass, bucket on a rope, 4-stage sapling (one scaled mesh), fruit sprite |
| Brain Press | 3 vats with liquid discs, screw press on the trunk |
| Spring | 3 basins, a water disc round the roots |
| Seer | 3 posts with a turning ring (instanced torus), glyph atlas, the trunk eye |
| Grafting | master bench (existing builder), vise, 4 branch stubs |
| Thorn | thorn coils on the trunk (3 emissive levels), blood bowl |
| Gambler | hollow, stump, 5 knots, 5 gourds (instanced) |
| Memory | 4 lantern posts (instanced, 4 colours) |
| Hollow Oak | trunk variant with the nook, the eye knot |
| Elder | 3 root-stones, giant trunk variant, the seed sprite |
| Ram | winch with 2 handles and a ratchet (6 teeth light up), ram log on chains, lever, wedge rack; the 3 crack decals on each vault door face |
| Locksmith | lock face with 5 pins, grindstone, bell on a bracket, 2 floor grilles |
| Counting House | desk and grille with a seated clerk (static goblin model), scales (2 pans, beam), strongbox with 3 coin piles, sack hooks |
| Keystone | socket with a 4-glyph ring, 4 rune stones with fire bowls (emissive flame cards), altar |
| Vault | 4 coffers with 3 coin stages, 4 bar racks with a bar mesh, a floor grate |

- **Solids:** only the anchors (1.5) are solid. The ram lane, socket, pool, nook zone and grate are floor.
- **Sound:** reuse the existing cues (clank, coins, creak, bell, squeak); no new music.

---

## 9. Work breakdown (replaces PLAN-5x5 section 8 rows A, B and C)
**Order:** F0 (unchanged) -> **R0** -> B1, B2, A, C1, C2 in parallel -> G (bots) -> Q. R0's pure part (`activity.js` + its tests) can start in parallel with F0, because it needs no world tables.

| task | owner files / blocks | content | tests |
|---|---|---|---|
| **R0 Activity framework** (Opus) | new `activity.js`; server.js `ACT-BEGIN/END` (state, tick, dispatch, validation, rate limit, `award`, caps, carry, `spawnNpcAt`, the one-line hooks in `hitTarget`, `die`, `noteRoom`, round boundary, `vaultVotes`); world.js `ANCHORS-BEGIN/END` + `solidsOf` entries; new client `act5.js` (+1 `<script>` line) with the prompt, the crosshair arc and the `GK.actView` registry; the `{lat}` report in game.js `NET` | 1, 1.4-1.8 | `activity.test.js` (pure, every primitive), `act-live.test.js` (validation, fuzz) |
| **B1 Tree rooms** (Sonnet) | new `trees5.js` (the 10 specs, `TREES` weights, `rollTrees()`); items.js `TREES-BEGIN/END` (huskbrain, springwater, blessedwater, scion; the Thorn blessing in `recalc` through a one-line hook) | 3 | `trees5.test.js` |
| **B2 Heists** (Opus for the tally, Sonnet ok for the rest) | new `heists5.js` (the 4 specs, `VB_TYPES`, `derange()`, `heistVotes`, breach); items.js `HEIST-BEGIN/END` (the 4 tokens); server.js `HEIST-BEGIN/END` (the re-key, `vb`/`vbNext`/`breach`/`armed`/`writs` in roundState, the bribe-tax hook into the strongbox) | 4 | `heists5.test.js` |
| **A Vault & rounds** (Sonnet) | new `vault5.js` (the vault spec: claim, coffers, bars, Wardens); server.js `VAULT5-BEGIN/END` (the time-limit decision by claim, the crown alarm doors, treasury, relic restock, venting, SUDDEN constants, `PACE.income` 20) | 5 | `vault5.test.js` |
| **C1 Tree art** (Sonnet) | new `trees5art.js` (+1 `<script>` line): the tree kit and 10 variants, `GK.actView` for each | 3, 8 | browser check, draw calls |
| **C2 Heist & vault art** (Sonnet) | new `heists5art.js` (+1 `<script>` line): the vb shell, 4 skins, the swap flash, the door cracks, the vault coffers/bars/grate, `GK.actView` for each | 4, 5, 8 | browser check, draw calls |
| **C Room art** (Sonnet) | `rooms5art.js` as PLAN-5x5 (homes, forge, grand recycler, hatch) **minus** trees and vaultbreakers | PLAN-5x5 4.1 | |
| **G Bots** | as PLAN-5x5, plus the generic activity driver in `botgoals.js` | 6 | `bots5.test.js` |
| **D HUD & maps** | as PLAN-5x5, plus the breach, armed, claim and vb icons on the maps; the Seer pulse view and the Hollow Oak hiding read `actFx`/`actMe` | | |

**Conflict rules (added to PLAN-5x5's):**
- Only R0 edits `activity.js`, `act5.js` and the ACT block. B1, B2 and A only add specs in their own files and call the framework; if they need a new primitive feature, they ask R0's owner (or add it in a clearly marked `ACT-EXT` section at the end of `activity.js`, one task at a time).
- The art files never touch server state; specs never touch three.js.
- `vaultVotes` is edited once, by R0, to call `heistVotes(m)`, which B2 owns.
- Message names are fixed by 1.7. From PLAN-5x5's list, `ram` and `treasury` are retired (folded into `breach` and `actFx`); `trees`, `vb`, `vbNext`, `crown`, `vent`, `dbgFF` and `bribeCost` stay.

### 9.1 Tests
| file | checks |
|---|---|
| `activity.test.js` (pure, fake clock) | channel completes, breaks on hurt, on moving 0.6 m and on leaving; capture freezes with 2, pays only after `unhurtMs`; timing judge hit/miss at the window edges with the 40 ms grace and the latency clamp; **a fixed-interval presser over 1000 attempts hits no more than the window share + 5%**; pool lazy refill and cap; station owner window then theft; heat thresholds fire once and re-arm below; waves respect `max`; sequence ok/done/fail; limits per round and per match roll over |
| `act-live.test.js` | a live server with `GK_ROUND_MS` 4000: `act` from the wrong room, too far, dead, before GO, unknown verb or anchor is ignored; the rate limit drops the 9th message in a second; a security fuzz of malformed `act` never throws; a carried sack drops on a hit and on death |
| `trees5.test.js` | the weight chi-square and no duplicates (moved from rooms5); for each of the 10 types, a scripted happy path through `ACT.verb`/`ACT.tick` and its cap; the knowledge caps 24/round and 80/match across rooms, with the Elder and goblin brains exempt; Spring and basins off in sudden death; the Gambler hoard needs a feeder this round; Memory sabotage by another goblin's touch |
| `heists5.test.js` | derangement (no fixed point, all 4 types every round), `vbNext` at 15 s; the re-key carry/reset table (breach kept and decayed by 20, pins and noise reset, strongbox moves with the type, stones dark, a sack converts); Ram: notches, the 2-handle co-op, the lane halves breach and damages, Cracked counts +1, Broken opens with 0 votes; Locksmith: pins in order, miss drops a pin and adds noise, 100 noise spawns 2 Wardens and resets, the cut limits; Counting: writ prices 20/30/40, a counter-writ cancels one writ but never the base vote, 50% of panel bribes reach the box, the robbery alarm, sacks convert on leaving; Keystone: order, the 8 s chain, backlash, guttering, feeding, armed counts 2 only if armed at the tally, wisps snuff; each token's effect and the wrong-room failure; the full `vaultVotes` formula against a table of cases |
| `vault5.test.js` | the claim is cumulative across rounds and lost on death; freeze with 2 on the dais; a hit pauses it but does not reset; 45 s wins; the time limit goes to the highest claim, then kills, then HP; the alarm opens the 4 doors and closes them 10 s after; Wardens spawn only while claiming; coffers and their cap; bars close a door at the round end, not when Broken, alarmed or in sudden death; claim 1.5x and the four sudden-death heist effects; treasury and relic as PLAN-5x5 |
| `econ5.test.js` (pure) | for every spec, a scripted perfect goblin for 60 s yields no more than the spec's declared `yield` and the band in section 2 (with a margin for the declared exceptions: Elder, Counting House robbery, coffers) |
| `bots5.test.js` (G) | as PLAN-5x5, plus: at least one bot completes one tree loop and one heist step in 3 short rounds; no bot stays in an activity room longer than `maxStay` + 5 s |

---

## 10. Open questions for the owner
1. **The crown claim decides the match at the time limit** (highest cumulative claim, then kills, then HP), and 45 s of claim wins at once. Is this the right end of the match, instead of "most kills"?
2. **Vault door bars**: may the vault's holders re-seal an open vault door against the 2-vote rule?
3. **Tree knowledge caps** of 24 per round and 80 per match per goblin: too tight or too loose?
4. **Risky rooms**: the Gambler's Root can eat a good item, and the Thorn Shrine costs HP. OK?
5. **Counting House**: counter-writs (paying to block a vault vote) and the strongbox fed by 50% of every panel bribe on the map. OK?
6. **Sudden-death roles** for the four vaultbreakers (Quake, Crown Seal, Bounty, Ward). Keep them, or let the vaultbreakers go quiet once every door is open?
7. **Timing mini-games** (windlass, ratchet, pins) on a 30-60 ms network: windows are 180-300 ms with latency compensation. Is a skill press acceptable in this game, or should those become plain channels?
8. **The Elder Tree** wakes 3 times, then withers. Or once per match only, as before?
9. **The ram lane**: a goblin standing in it takes 25 and halves the strike. Is body-blocking the defence you want?

---

## Owner decisions (2026-10-16)

Answers to the open questions in the room-activity plan. Where not listed, the plan's own recommendation stands.

- **Q1 crown claim:** the crown claim decides the match at the time limit only. There is NO instant win at 45 s.
- **Q2 door bars:** vault occupants can bar a door shut again, as planned.
- **Q9 ram defence:** defenders stop the Ram with a placeable BARRICADE in the ram lane (spent materials or elixir; the implementer sets the cost, cooldown and hit points and documents them), not by body-blocking. Body-blocking the lane no longer stops it.
- **Q3-Q8:** the plan's recommendations stand (tree knowledge caps 24 per round and 80 per match; Gambler's Root and Thorn Shrine risk as designed; counter-votes with a strongbox fed by half of every door bribe; vaultbreaker sudden-death roles kept; timing presses; Elder Tree wakes three times).
- **Earlier (5x5 plan):** 16 attached rooms; home rooms open to raiders unless locked; match decided after round 7 with sudden death after round 5.

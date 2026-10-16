# rooms5-trees.js: the 10 tree rooms (task B1, pure part)

`rooms5-trees.js` (UMD, `window.TREES5` / `require`) registers the ten tree rooms with `ACT.def` (activity.js) and exports `{TYPES, WEIGHTS, NAMES, BLESS, BLESS_KEYS, K, rollTrees, blessing, rollItem, rollUp}`. It is pure: `ctx.now`/`ctx.rng` only, no timers. Tests: `tests/rooms5-trees.test.js` (35 cases, fake clock and a fake glue, about 1 s). Not done here (other tasks): server.js `ACT` block, world.js anchors, items.js entries, art, `act5.js`.

Types: `well press spring seer graft thorn gambler memory oak elder`. Weights 22/16/14/12/10/8/7/5/4/2.

## Roll
`rollTrees(rng, n = 4)` -> 4 distinct types, weighted without replacement, in cell order 6, 8, 16, 18. Same rng gives the same result. Send as `m.trees`.

## ctx the glue must provide (on top of PLAN 1.4)
Required: `now, rng, round, sudden, occupants(), anchor(id) -> {x,z,r}, award(p, what, src), fx(kind, data, scope), toastAll(text)`.
`award` must be `ACT.award(L, m.actLog, p, what, src)` plus applying the result: `know`, `gold`, `item` (give the key), `heal`, and `pulse` (an object, see below). Rooms also send `exempt: true` (Elder, nothing else).
Used when present (rooms degrade quietly without them):
- `player(id)`, `npcAlive(id)` (prunes dead husks/rootlings from the wave), `spawn(kind, anchorId, opts) -> npcId`, `dmg(p, n, src, {pierce:true})` (thorn grip: must ignore armour; may call `ACT.hurt`, the room ignores its own damage), `push(p, dx, dz)`, `recalc(p)`.
- `knowLeft(p)` = remaining of the 24/round and 80/match cap (rooms refuse with `cap` instead of consuming). `award` itself still clamps.
- Items: `item(p,key)` has, `count(p,key)`, `peek(p, slotOrKey) -> key|null` (no removal), `take(p, slotOrKey) -> key|null`; slot `-1` = the equipped weapon, other slots = inventory index. `items` (ITEMS table, default `GKITEMS.ITEMS`).
- `elixir(p, n)` spend n, true if paid. `toast(p, text)` a private toast (Hollow Oak). `intel(kind, p) -> text|null` for kinds `goblin breach strongbox circuit vbNext`. `remember(p) -> bool` grants the Remembrance perk (false: +10 knowledge instead).
- Brains (Press): `brainOf(p) -> 'goblin'|'husk'|null` (goblin preferred), `takeBrain(p, kind) -> bool`, `eatBrain(p, {pct: 0.10, pressed: true})` (the normal eat path with 10% instead of 5%, +1 point, Brain Gourmet).
- Timing: `ctx.recv` (server receive time, default `ctx.now`) and `p.lat` (smoothed latency); `p.hurtAt` (last hit time), `p.yaw` (radians) for the capture rooms; `p.hp/maxHp`.

## Messages
Verb argument is `{a, x}` (anchor id, optional small int); strings are taken as `a`. All verbs return `null` or an `ACT.C.FAILS` reason. Bots use the same path; for `tap` they add `{bot:true, hit:bool}` (the glue rolls `0.45 + 0.3*skill`).

| room | verbs (anchor) |
|---|---|
| well | `use NE` start/continue cranking; `tap NE` timing press; `choose NE x0` drink / `x1` carry bucket; `use C` pour (carrying a bucket) or pick the fruit; `drop` |
| press | `use C` press a brain (3 s channel); `buy NE/NW/SW` rouse a husk (6 elixir, 10 s cooldown) |
| spring | `use <basin NE/SE/SW>` bottle (2 s); `buy <basin>` blessed (6 elixir at the end) |
| seer | `use NE/NW/SE` turn that ring (500 ms per goblin) |
| graft | `use C` cut a scion (2 s); `choose NE x=slot` graft; `use NE` take the vise output (owner, or anyone after the 4 s window) |
| thorn | `choose C x0..2` blessing (Fury/Bark/Thorns, asked once per round, see `me().needChoice`); `use C` grip (hold), `stop` release/bank; `use SE` drink the bowl |
| gambler | `choose C x=slot` feed; `buy C x=slot` feed with 10 elixir (+10%); `use C` ride the stump (owner); `buy C` ride with elixir; `pick C` take the stump |
| memory | `use C` start; `use NE/NW/SE/SW` touch a lantern |
| oak | none (capture only) |
| elder | `use NE/NW/SE` light a stone (channel, hold); `use C` take the seed (2 s) |

`stop` (E up) works everywhere: it finishes a channel that has just run its full time, otherwise cancels.

## Tick, hooks, state
- `ACT.tick(st, type, ctx, dt)` at 10 Hz, `dt` in ms. The glue should also tick rooms with live NPCs/channels/stations even when empty (Elder stones keep progress; Press pauses its wave timer while empty by itself).
- `ACT.hurt(st, type, p, ctx)` from `hitTarget` (breaks channels, spills a bucket, breaks the thorn grip, ejects the Oak Warden, pushes him out). `ACT.leave` from the room-change hook. `ACT.kill(st, type, killer, victim, ctx)` for kills inside the room; NPC victims are `{npc:true, id}` (frees the wave slot; Thorn bowl, Press, Elder).
- Per-round limits roll over by themselves from `ctx.round` (no `newRound` hook needed); per-match knowledge caps are the glue's `award` ledger.
- The Oak needs one combat hook: `ACT.get('oak').ambushMul(st, attacker, victim, ctx)` -> 1 or 1.5, multiply the damage of the Warden's hit.
- The Thorn blessing is `p.bless = {k:'fury'|'bark'|'thorns', tier:1..3, until: round}`; valid while `until >= round`. `TREES5.blessing(p, round) -> {k,tier,v}|null` gives the value (`BLESS` table). The glue reads it in `recalc` (attack, max HP) and in melee reflect.
- Elder: when `st.become === 'well'` (after the third waking and the next round boundary) re-init that cell as a `well` (`ACT.init('well', ...)`, update `m.trees`).
- `spec.npc` has `husk` and `rootling` for `NPC` table merge (loot `x:huskbrain` for husks). Items to add in items.js: `x:huskbrain` (use `brain`, +2 knowledge, no point), `x:springwater` (heal 20), `x:blessedwater` (heal 40), `x:scion`.
- `spec.bot` = `{maxStay, score(b, p, st), next(b, p, st)}`. `b` carries `now, round, sudden, anchor(id), knowLeft, hpFrac, aggr, greed, others, coop, brainOf, scions, junk, junkSlot, healItems, hasGear, cautious`. `next` returns `{go: anchor}`, `{verb, a, x, bot?}`, `{stay: anchor}`, `{fight:true}`, `{memory:true, seq, pos}` (the glue touches lanterns with its success roll) or null.

## State broadcast (`actS`)
`ACT.view(st, type)` is the public snapshot (keys starting with `_` never leave the server; the Seer needs no secret, the eye shows the targets). Fields: well `{stage, ripe, notch, water, max, crank, ready, ch}`; press `{husks, next, ch}`; spring `{basins:{NE,SE,SW}, healing, holder, contested, ch}`; seer `{target, v, k, solves}`; graft `{branches:[0|1 x4], vise:{state,item,by}, ch}`; thorn `{bowl, grip:{by,k,t0}|null, ch}`; gambler `{hoard, chew, stump:{key,step,by,until}|null}`; memory `{phase:'idle'|'show'|'input', by, len, show:[anchors] only during the show, t0, per, pos}`; oak `{held, contested}` (the Warden is secret: hide minimap and Seer pulses while `held`); elder `{phase:'stones'|'waking'|'seed'|'withered', wakes, need, stones:[{prog,lit}], t, become, ch}`. `ch` = running channels `[{n, a, by, t0, ms}]`.
`actMe` per goblin: `ACT.get(type).me(st, p, ctx)` (well: `{tm:{a,wa,wb,per,t0}, ready}`; thorn `{needChoice, pick, bless}`; memory `{input, deadline}`; oak `{warden}`).
`actFx` kinds emitted (scope room unless noted): `slosh full spill grow fruit press bless turn stolen spit swallow show lit memfail remembrance warden rumble(near) seedDrop(near) seed(near) capped`. `capped` means "The trees have taught you enough for now".
`pulse` in an award is an object: `{ms, picks, hp}` (Seer pulse) or `{vbNext:true}`.

## Decisions and deviations
- Press (anti-spam): the Well crank refuses presses closer than 400 ms (`cool`). Random mashing otherwise fills a bucket about as fast as skill, because misses only cost one notch; the pool (4, +1 per 12 s) is the real bound.
- The sapling takes 4 pours (stage 0 to 4), about 3 knowledge per bucket, the same as drinking.
- Thorn: 2 grips per round are counted at the start (a broken grip still costs one). Moving more than 0.6 m releases and banks. A weaker grip over a stronger active blessing only refreshes its duration.
- Gambler: ride odds `70/55/40/25/15` for steps 1 to 5. The hoard prize needs a prior feed this round, and the goblin who filled the last gourd cannot take it. The 4 feeds per round count rides too.
- Remembrance falls back to +10 knowledge (also under the round cap, so it can pay less).
- Hollow Oak needs an anchor `nook` (r 0.9); without it the `ring` centre with r 0.9 is used.
- Grafting Bench and crafting share the NE bench; the prompt must pick graft (`choose`/`use`) only when the goblin holds a scion or the vise has output.
- Memory sequences are readable by a hacked client while shown (as the plan notes). Seer targets are public by design.

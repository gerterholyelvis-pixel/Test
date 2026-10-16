# activity.js: the room-activity framework (task R0, pure part)

`activity.js` is a UMD module (`require('./activity.js')` on the server and in tests, `window.ACT` in the browser). It has no I/O, no timers and no `Date.now()`/`Math.random()`. Times are ms, `dt` is ms, a player `p` is any object `{id, x, z, room, alive}`. Everything that rolls dice takes an `rng` (`ACT.rng(seed)` gives a seeded one). Tests: `tests/activity.test.js` (32 cases, fake clock).

Not in this task (R0 server part): `server.js ACT-BEGIN/END`, `world.js ANCHORS`, `act5.js`. The module only offers the logic and message-shape helpers for them.

## Registry (room specs)
`ACT.def(type, spec)` (throws on a bad spec; `spec = {kind:'tree'|'vb'|'vault', state0(rng, now), verbs:{use,tap,stop,pick,drop,buy,choose}, tick?, onHurt?, onLeave?, onKill?, rekey?, sudden?, view?, ...}`), `ACT.get`, `ACT.types`, `ACT.init(type, rng, now)`, `ACT.verb(st, type, p, verb, arg, ctx)` -> `null` or a failure reason (a verb the spec lacks, an unknown type or a verb that throws all return `'state'`), `ACT.tick(st, type, ctx, dt)`, `ACT.hurt/leave/kill/rekey/sudden`, `ACT.view(st, type)` (spec `view`, else a copy without keys starting with `_`, so put secrets such as the Seer order in `_keys`).
Verbs return `null` or one of `ACT.C.FAILS`: `room far busy cap cost item state cool carry`.

## Primitives (all state is plain JSON-able objects)
| primitive | API |
|---|---|
| `channel` | `make()`, `start(ch,p,now,ms,{anchor})` -> null/'busy'/'state' (key repeat does not restart), `update(ch,p,now)` -> `'idle'/'run'/'done'/'broken'` (done and broken free it; breaks on `hurt`, moving more than 0.6 m, room change, death, vanished player), `hurt(ch,id)` (call from `onHurt`), `cancel`, `progress`, `busy(list, anchor)` (for maxUsers) |
| `capture` | `make()`, `step(cap, occupants, dt, {now, every, unhurtMs, afkMs, cumulative})` -> `{holder, contested, paid, prog, blocked}`. Occupants `{id, hurtAt?, activeAt?, alive?}`. 2+ occupants freeze everything (`blocked:'contested'`); a sole occupant progresses only if unhurt for `unhurtMs` (`'hurt'`; a hit pauses, never resets) and recently active (`afkMs`, `'afk'`). Leaving, or a different sole occupant, resets the partial `prog`. `cumulative` keeps `acc[id]` forever (the crown claim): `total`, `ranking`, `leaders` (several entries = a tie for the caller to break by kills then HP), `reset(cap,id)` on death |
| `timing` | `open(rng,now,{per:[lo,hi],win,ttl,n})`, `reroll(tm,rng,now)` (new period and window for every attempt), `judge(tm, tRecv, {lat, grace})` -> `'hit'/'miss'` (judges at `tRecv - clamp(lat,0,120)`, grace 40 ms each side, one judgement per attempt, wrap-around window), `width(tm)` (effective hit share), `phase` (for the client needle). The window start is uniform over the cycle so a fixed-delay macro hits only at the width share (tested over 1000 attempts, margin 5%) |
| `pool` | `make(max, refillMs, n?)`, `level(pl,now)` (lazy refill), `take(pl,now,k)` -> bool, `eta` |
| `station` | `make()`, `start(st,p,now,{item,ms,out,ownerMs=8000})`, `state` (`idle/run/ready`), `claim(st,p,now)` -> `{out,stolen,owner,item}` or `'state'/'busy'/'cool'` (thieves wait for the owner window), `abort` (owner only, before it finishes) |
| `heat` | `make(decayPerSec, thresholds)`, `add`, `level`, `crossed(h, now)` -> thresholds newly passed (ascending; each fires once and re-arms when heat drops below), `reset` |
| `waves` | `make(every, max, firstMs)`, `due(w,now,aliveCount?)`, `spawned(w,id,now)`, `gone(w,id)`, `arm`, `skip` |
| `carry` | `pick(p,tok,{heavy,from})` -> null/'carry'/'state', `drop`, `hurt(p)` -> `{spilled}` (light, gone) or `{dropped}` (heavy, make a floor pickup), `death(p)`, `speedMul` (0.7 heavy), `canSprint`, `canAttack` (false for any carry), `canUseItem` |
| `sequence` | `make(target, chainMs)`, `press(s,id,now,by)` -> `'ok'/'done'/'fail'` (wrong id resets; stale chain restarts; another goblin touching a running chain fails it); dials variant: `dials(target,k,start)`, `turn(d,i)`, `solved(d)` |
| `limit` | `make()`, `ok(L,p,k,perRound,perMatch,n=1)`, `use(L,p,k,n)`, `used`, `newRound(L)`. `p` may be an id or a player |

## The single reward function
`ACT.award(L, log, p, {know, gold, item, tok, heal, pulse, exempt}, src, {capRound, capMatch})` -> `{know, gold, item, tok, heal, pulse, capped}`. It applies the knowledge caps (`TREE_KNOW_ROUND` 24, `TREE_KNOW_MATCH` 80, whole points only; `exempt:true` skips them for the Elder seed and goblin brains), keeps the other parts, and adds to `log[src]` (`m.actLog`). The caller applies the returned amounts and sends the `actFx` float. Non-tree rooms should pass `exempt` or their own caps.

## Messages, validation, limits
- `ACT.msg.parse(raw)` normalises an incoming `act` body `{r,a,v,x?}` (strings of 1-24 safe chars, verb in `ACT.C.VERBS`, `x` an int -1..63) or returns `null` (drop silently). Builders: `msg.act/actS/actMe/actFx/actFail` (unknown fail reasons become `'state'`).
- `ACT.rate.make()` / `ACT.rate.allow(bucket, now)`: 8 per rolling second per player.
- `ACT.reach(p, anchor{x,z,r})`: within `r + 1.4 m`.
- The glue still has to check: alive, entered, GO passed, `r` is the player's room, `a` is an anchor of that room's type.

## Notes for implementers
- Keep everything in `st` JSON-serialisable; use `_`-prefixed keys for private state.
- For `maxUsers > 1` keep an array of channels and use `channel.busy`.
- Put new primitives or features in a marked `ACT-EXT` section at the end of `activity.js`, one task at a time.
- The doc, not the plan, is authoritative for names where they differ: `crossed(h, now)` takes `now`; `timing` windows wrap; `capture` takes `dt` in ms.
- Owner decisions: the crown claim decides the match only at the time limit (no instant win; `cumulative` capture has no win threshold built in). The Ram's defence is a placeable barricade, not body-blocking (spec work for B2: cost, cooldown and hit points are set there).

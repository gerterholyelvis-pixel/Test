# Elixir pump and home base logic (pure modules)

Files: `elixir.js`, `homebase.js` (UMD, no dependencies, no clock, no RNG; `now` and `rng` are passed in), `tests/elixir.test.js`, `tests/homebase.test.js`. server.js, game.js, world.js and items.js are untouched; wiring is for later (PLAN-5x5 1.7, 1.8).

## elixir.js (`GKELIXIR` in the browser)
- Pump = `{lv, t, tank, stopped}`: `createPump(now, lv)`, `tick(pump, now)` (lazy fill, remainder kept in `t`, a full tank does not bank time), `setLevel`, `stop` (owner died: tank stays), `take`/`collect(pump, carried, now, byOwner)` (carry cap 120; a raid returns `raid:true` and `glowUntil` = now+5 s so the server can toast the owner), `canUsePump(state)` (alive, entered, own home room, <= 2.5 m).
- Levels: 1 per 5 s cap 48, 1 per 4 s cap 64, 1 per 3 s cap 90.
- Sinks (mutate `{elixir, distills, oils}` only on success): `brew(p,'heal'|'tonic')` 8/12 (heal returns `item:'c:draught'`, 30 HP; tonic `x:tonic`), `refine(p, n)` 4 each (then recycle at eff 1.0 via `recycleYield(n, eff)`), `distill` 20 for +5 knowledge max 3, `oilLock(p, bribesSoFar)` 15, shared max 3.
- Death: `onDeath(p, pump, now)` returns `{drop:{id:'x:flask', n}, tank}`; `pickUpFlask` honours the carry cap. The item ids `c:draught` and `x:flask` are placeholders for the items.js implementer.
- Pump Leech: `leechPlan(victimPump, guard, now)` (half the tank, 10 s) and `leechDue(plan, delivered, now)` for linear delivery.

## homebase.js (`GKHOMEBASE`)
- `UPGRADES` tree (10 rows, level order is the only prerequisite), `createHome(owner)`, `buy(home, id, holder)`, `rearmSnare`, `buyAmmo`; derived: `pumpLevel`, `benchParams`, `recyclerEff`, `lockboxSlots`, `lockLevel`, `padHps`.
- Owner-only: `canUseStation`, `canUseScreen` (3 m, 4 msg/s). Hatch: `startPick/cancelPick/pickProgress/hatchOk(home, pid, now, {suddenDeath, showdown})` (owner and dead homes always pass; a finished pick sticks).
- Events: `onEnter` returns alarm/snare events; `sentryShot(home, ownerHome, los, now)`; lockbox `boxPut/boxTake`; raids `startCrack/finishCrack/cancelCrack` (8 s, 14 s with Lock L2, 1.5 m); `dieHome` returns the spilled box.
- Sendables: `SENDS` (6), `checkSend(id, ctx)` (no round 1, 1 per round, no vault, not own room, max 2 active per room, leech home-only; nothing charged on refusal), `makeSend` (3 s telegraph, then duration or round end; spike spot from rng), `sendPhase`, `gasTicks`, `panelFrozen`, `bellRevealed`.

## Notes for implementers
- Tree total is 440 by the plan's own table (plan says "about 425"); the test accepts 400-460 and requires it to exceed twice the 168 base income. Distill, snare re-arm (15) and ammo (10 for +20) are repeatable and excluded from the tree total.
- Door Lock L1 does not lengthen the crack (8 s); only L2 does (14 s), as in the plan.
- Per-round bookkeeping (`sentRound`, active sends list, bribe count) lives in the caller; checkSend takes it via ctx.
- The Pump upgrade should call `GKELIXIR.setLevel(pump, GKHOMEBASE.pumpLevel(home), now)` after a buy.

# Stations final (task E)

Branch `worktree-agent-a2c71df25d66b3c83` (merged main first, since F0 was not in the branch).

## What changed
- **items.js STATIONS block:** `benchSpec`, `partCost`, `benchCraft(p, recipe, benchType, perks)` -> `{why:'knowledge'|'bench'}` or `{cost, ms, bonus}`. Rules: knowledge adapter `canCraft`, then `recipe.tier <= maxTier`; cost `ceil(cost*costMul)` (min 1, after Thrifty Hands); `bonusTier` lets a Master bench craft tier `knowTier+1` at full price.
- **No infinite materials:** `recycleFor` now caps each part at the *Master Forge* price of the recipe (the cheapest way to make it), so craft at the Forge then recycle at 100% can never profit. Holds at 50% and 100%, with Thrifty/Scrapper/Reforge twins (tested).
- **server.js `STATIONS-CRAFT` block:** `craft()` pays the parts up front and starts `p.crafting`; `craftTick` finishes it after the bench `craftMs` (home 2500, Forge 800). Leaving the room, a hit, death, a full backpack or `{craftCancel:1}` cancels and refunds. One craft at a time (`busy`). Messages: `{crafting:{rid,ms,type,bonus}}`, `{crafted}`, `{craftCancel:reason}`. Bots price and gate with the bench type (Forge allows higher tiers). Test hooks: `{setParts:{..}}`, `GK_CRAFT_SCALE` (debug only).
- **game.js:** `STNUI` block; workbench panel shows station name (HOME WORKBENCH / MASTER FORGE / WORKBENCH), tiers, discount, speed, per recipe time, BONUS TIER badge, "needs the Master Forge" lock, progress bar and CANCEL; recycler panel shows HOME RECYCLER 50% / GRAND RECYCLER 100%. Offline demo uses the same rules with a timer.
- Forge/Grand placement (one each, opposite sides, world anchors) was already in F0; verified by tests.

## Tests
`tests/stations.test.js` extended (benchCraft rules, no-loop over every recipe and perk mix, timed craft, cancel, leave, hit, normal-bench refusal, Forge discount, bonus tier). Crafted-wait timeouts raised to 5 s in knowledge/utility tests. Full `npm test`: only `security` static tests fail, because `three/three.module.js` is absent in this worktree (environmental).

## Not done
No browser check of the panels (three missing in the worktree). Home bench level upgrades (homebase.js `benchParams`) are not wired: pass a spec to `benchCraft` later.

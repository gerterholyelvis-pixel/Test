# Report: activity rooms plan (design only)

- **New:** `docs/PLAN-5x5-rooms.md`. It supersedes PLAN-5x5 sections 2 and 3 and task rows A, B and C. PLAN-5x5.md got a one-line pointer.
- **Framework:** `activity.js` has 9 primitives (channel, capture, timing, pool, station, heat, waves, carry, sequence) plus a limit ledger. One server block handles them, with one message (`act`) and `actS`/`actMe`/`actFx`/`actFail` going back. One client file draws the state on the room's props. The only HUD is a crosshair arc that shows while you act.
- **Trees:** 10 loops, with the weights unchanged. Knowledge caps of 24 per round and 80 per match.
- **Vaultbreakers:** 4 multi-step heists (Ram, Locksmith, Counting House, Keystone). Their positions shuffle each round, and a carry/reset table says what survives the move. They are linked by a ring of tokens (Wedge, Skeleton Key, Gold Leaf, Rune Charge). The new vault tally formula is in section 4.7.
- **Vault:** the cumulative Crown Claim, which decides the match at the time limit. Also coffers, door bars, Wardens, and roles for the vaultbreakers in sudden death.
- **Tasks:** R0 (framework) first, then B1, B2, A, C1 and C2 in parallel, then G and Q. Each task has its own test file, plus econ5.test.js, which asserts the yield budgets.
- **No code was changed**, so there was nothing to test.

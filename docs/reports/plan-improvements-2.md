# Plan: improvements 2 (design only)

Wrote `docs/PLAN-improvements-2.md`, the roadmap after the current wave and PLAN-fun. No game code was changed. Branch fast-forwarded to main `c3e2475` first, so the plan reads current docs.

## Key findings from the code
- `render.yaml` is the free plan with no env vars. Without `GK_SECRET`, every deploy makes a new secret, so saved characters lose their verified wins. Without `GK_TRUST_PROXY`, the per-IP cap may count players behind Render's proxy as one address. The free disk loses PLAN-fun's `logs/`.
- No SIGTERM drain and no client/server version check: a deploy kills every match.
- Every client receives every goblin's position (far ones at 5 Hz), so a console wallhack is trivial.
- There is no music.
- Gear is mostly a vertical rarity ladder.

## What the plan contains
- 19 ranked ideas, each with value, size, risk, dependencies and tests. M1 is product (hosting, deploy drain, client resilience, product telemetry, seeded RNG, golden screenshots). M2 adds anti-wallhack interest management, a disconnect pilot, party queue, load test, adaptive music, pairings (2-piece bonuses), cursed relics, Mimics and the Golden Goblin, and Oathbreaker. M3 adds capstones, home trap anchors, spectator wagers and streamer mode, and replays.
- An honest cut list of 15 ideas, and a written scaling plan (build only when needed).
- 3 milestones (Playtest-ready, Friends beta, Public launch) with measurable exit criteria, and a task split with file ownership (I1-A to I3-E).
- 10 owner questions.

## Notes for the merger
- Docs only. The task IDs (I1-x, I2-x, I3-x) do not collide with PLAN-fun's W1-W3.
- Pairings, capstones and cursed relics depend on the in-flight "balance and abilities" wave's report.

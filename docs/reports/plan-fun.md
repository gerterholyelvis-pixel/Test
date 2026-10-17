# Plan: fun and quality (design only)

Wrote `docs/PLAN-fun.md`. No game code was changed.

## What it contains
- **15 ranked features.** Each one has:
  - the player problem it solves
  - concrete rules and UI
  - files and blocks, with a size (S, M or L)
  - risks
  - tests
  - bot support
  - dependencies
- **Top of the ranking (clarity first):**
  - an objective line that becomes a live room line inside special rooms
  - a guided first match in the home-only round 1
  - a death recap with a spectator director
  - an H room codex (19 cards) and How to Play rewritten for 5x5
- **Then social and pacing:** a proximity parley wheel (with bot truces), post-match awards with Play again, and private match codes.
- **Then fairness and accessibility:**
  - bot difficulty, Easy bots near newcomers, AFK takeover
  - a status strip, damage colours and sound captions
  - remap, Hold/Toggle channels, colour-blind palettes, UI scale
- **Then meta and variety:**
  - signed account XP with cosmetics only
  - achievements, history and dailies
  - the Leader's mark, a gold stipend and raid grace
  - telemetry (cheap, so build it early)
  - one optional arena event per match
- **Cut, with reasons:** kill-cam, a vault boss, controller support, localisation, cloud sync, free text chat, account-based parties, comeback revives, in-page rematch, free-cam.
- **Build order:** 3 waves of independent tasks (6, then 3, then 2) with file ownership and conflict rules.
- **Open questions:** 9, for the owner.

## Notes for the merger
- The plan assumes the home-only round 1 that is in progress elsewhere. The guide adapts to its length.
- The old TIPS texts are 3x3-era (one says "Vault doors need TWO rooms"). Task W1-A replaces them.

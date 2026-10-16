# Goblin King: handoff (updated 2026-10-16 by the Opus parent)

Repo: gerterholyelvis-pixel/test, branch main. Read in this order:
1. `docs/FEATURES.md` (rules)
2. `docs/ART.md` (art bible)
3. `docs/DESIGN-core-loop.md` (design direction)
4. `docs/PLAN-netcode-perf-fun.md`
5. `docs/reports/*.md` (one per feature: what changed, what was tested, what wasn't)

Screenshots are in `docs/screens/`.

## Run it
`npm install && npm start`, then open http://localhost:3000.
- Press **Start**. You queue on the goblin wheel. After 15 s, empty slots fill with server bots, so you get a full 8-goblin match even alone.
- Offline demo: `?offline=1`.
- Tests: `npm test` (17 files, about 12-28 s).
- Debug env vars, only with `GK_DEBUG=1`: `GK_MATCH_SIZE`, `GK_QUEUE_MS`, `GK_ROUND_MS`, `GK_COUNTDOWN_MS`, `GK_READY_MS`, `GK_REGEN_SCALE`.

## What exists now (all on main)
- **World:** THE VAULT (18x18) and the shared `world.js` geometry used by client and server. Room art has story corners, readable graffiti, wear and floor storytelling.
- **Graphics:**
  - IBL, GTAO and bloom.
  - Quality presets Low/Medium/High/Ultra, auto-picked on first run.
  - Room culling and mesh merging.
  - The light count is fixed at 9 PointLight + 1 Hemisphere (owner rule).
- **Art:** sculpted goblins (5 types) with armour overlays and animation; custom 3D models for all items, with baked inventory icons (`itemart.js`).
- **Play:**
  - Pointer-lock mouse look 1:1, cursor hidden.
  - First-person weapon viewmodel with a per-family attack animation.
  - Melee and bows, health with regen, damage numbers.
  - E-interact prompts, chest/mystery claim.
  - Procedural audio (`audio.js`).
  - Fullscreen (F).
- **Multiplayer:**
  - Matchmaking queue of 8, synchronized load-in, 3-2-1 countdown.
  - Netcode: snapshots, interpolation, ping, server-validated movement, lag-compensated melee.
  - Server bots that vote, loot, shop and fight; mystery-room enemies.
  - Kill feed, scoreboard (hold `` ` ``), spectate after death, match summary.
- **Unique features:**
  - Door panels show who picked (panel politics).
  - Wall maps show last round's picks.
  - Knowledge glow and brain aura on goblins.
  - King crown marker.

## Added since the first overnight update
- **Loot economy:**
  - a vault relic (a guaranteed tier 3+ item on a pedestal)
  - merchant prices rise each round after round 2, shown on a price board
  - a throwable plushie lure
  - bots use stations
- **Interface and onboarding:**
  - HUD minimap with fog of war (M opens the full map)
  - contextual first-match tips and a How to Play screen
  - menu redesign: grouped Settings, model portraits, tier-framed stash, a victory stage
  - the HUD scales at 1080p
- **Social:** 15 s reconnect grace, and emotes on keys 4-7.
- **Fairness and polish:**
  - one name per goblin
  - "Killed by" on the death card
  - bots spread their targets and go for the vault in sudden death
  - outer room interiors dressed per type
- **Try the undecided rules before deciding** (all OFF by default; see `docs/reports/rules-experimental.md`):
  `GK_RULES=crown,doorclose,staffbolt,bribe npm start`
  - `crown`: hold the vault dais for 20 s to win
  - `doorclose`: doors stay open 2 rounds
  - `staffbolt`: wizard magic bolt
  - `bribe`: press B at a panel, 50 gold for +1 vote

## Defaults I set that need the OWNER's decision (marked in FEATURES.md)
1. **Win condition.** Default: last goblin standing. Sudden death after round 8 (all doors open, no regen). After round 10, most kills wins, then most HP. Alternative proposal: a "Crown win", where you hold the vault dais for 20 s (DESIGN-core-loop §2).
2. **Wizard staff does 0 damage** (from your stats rule), so wizards can't fight back. Should staffs cast a weak magic bolt?
3. Closing doors after 2 rounds, a Jam Spike item, gold bribes on door panels (DESIGN-core-loop §1, §3).
4. Starting gold is a placeholder of 100. Also open: how stash items enter a run, and crafting recipes for tiers 1-5.
5. Rooms render slightly cream instead of pure white since the graphics upgrade. Keep it, or go back to white?

## Known issues / next up
- See `docs/reports/qa-2.md`. Being fixed now on the worker branch:
  - the wheel reveal is cut by the countdown
  - bow, crossbow, spear and axe viewmodels
  - mystery enemies attack instantly on entry
- Not tested: real audio output, real 60 fps feel on a gaming GPU, 1920x1080 HUD on all screens, a real 8-human match.
- Backlog:
  - reconnect grace (15 s)
  - emotes
  - stash-to-run
  - higher crafting tiers
  - the vault dais objective (if approved)

## How this was built (for the next agent)
- The Opus parent briefs, merges and reviews. Sonnet agents implement in git worktrees inside clearly delimited blocks (`// FX-`, `COMBAT-`, `NET-`, `MATCH-`, `VIEWMODEL-`, `ROOMART-`, `GOBLINART-`, `FUN-`, `UNIQUE-`, `FEEL-`, `FULLSCREEN-BEGIN/END`) to keep merges clean.
- Merge with `git merge --no-ff`, run `npm test`, smoke-test in a browser, then push.
- Never rebase merge commits. Never add lights.

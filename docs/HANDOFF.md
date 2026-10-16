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
- **Rules** (`docs/reports/rules-experimental.md`, `docs/reports/balance.md`): `staffbolt` and `bribe` are ON by default since the playtest pass; `crown` and `doorclose` stay off. `GK_RULES=crown` adds one, `GK_RULES=-bribe` removes one, `GK_RULES=none` is the old baseline:
  `GK_RULES=crown,doorclose,staffbolt,bribe npm start`
  - `crown`: hold the vault dais for 20 s to win
  - `doorclose`: doors stay open 2 rounds
  - `staffbolt`: wizard magic bolt
  - `bribe`: press B at a panel, 50 gold for +1 vote

## Defaults I set that need the OWNER's decision (marked in FEATURES.md)
1. **Win condition.** Default: last goblin standing. Sudden death after round 8 (all doors open, no regen). After round 10, most kills wins, then most HP. Alternative proposal: a "Crown win", where you hold the vault dais for 20 s (DESIGN-core-loop §2).
2. **Wizard staff bolt is now ON by default** (9 damage, 1.0 s, 12 m) so wizards can fight; the melee bonk still does 1. Turn it off with `GK_RULES=-staffbolt` if you want the 0-damage staff back.
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

## Playtest pass (2026-10-16, Fable session, on main)
Four phases, one commit each, `npm test` = 19 files green. Reports: `docs/reports/security.md`, `balance.md`, `feel-2.md`.
1. **Security** (merged from the Opus worker, plus additions): the server rolls goblins and counts victories (signed `ctoken`), origin check, per-IP / total / match caps, cached static files with a hash-based CSP, speed-hack kick, heartbeat, wrapped handlers, name filter. Set `GK_SECRET` and `GK_ORIGINS` in production.
2. **Feel + balance:** attack input buffer and hold-to-attack, directional damage arc, crosshair hit marker, door-hop culling cap (Low/Medium 2 hops). Class speed table `GKITEMS.SPEED` (Small fastest, Big slowest). Bots: at most 2 on one goblin, 0.7 s notice delay, 30 % deliberate misses.
3. **Strategy:** `staffbolt` (9 dmg / 1 s) and `bribe` ON by default; sudden death heals only inside THE VAULT. Doors already close every round, so `doorclose` and `crown` stay off (owner calls).
4. **QA:** `tests/security.test.js` (14), `tests/balance.test.js` (6); `tests/sim-fairness.js` for the sudden-death check.
Not verified by hand: real mouse feel of the buffer/hold, the damage arc at every bearing, a real 8-human match, audio.
Note for parallel sessions: this checkout is shared; check `git log` before editing and never `git add -A` (a merge from another session overwrote uncommitted work once during this pass).

## Performance and bot AI pass (2026-10-16, later the same day)
- **Perf 2** (`docs/reports/perf-2.md`, `PERF2` tags in game.js, `?perf2=0` turns it off): doors merged per material (a vault door was 130-145 draw calls), first-person hand 18 to 9 calls, goblin level of detail by preset (46k to 17.7k to 8.5k triangles), far goblins pose every 2nd/3rd frame, chest-room panels cull with their room, Low hides lamp halos, Medium uses 2x MSAA. Vault view on Low: about 530 to 220 draw calls; on High 890 to 450. Real fps on a GPU still unmeasured (the pane is software GL).
- **Bots 2** (`docs/reports/bots-2.md`, `AI` block in server.js): bots see through a 150 degree cone (plus 2.5 m, hits, 4 s memory) and scan when idle; sprint between rooms, orbit and strafe in melee, hop now and then; per-bot aggression / caution / greed / patience; prefer weak targets, retreat through a door when losing, hold at a doorway facing 2+ enemies, emote after kills; door votes with intent. Tests: `tests/bots-ai.test.js`; `GK_SIM=1` runs the fairness sim inside it. Not seen by eye yet: orbiting, scan turns, the doorway hold.

# PLAN-improvements-2: from prototype to product

Written 2026-10-16 (Opus, design only, no game code). Based on main at `c3e2475`.
Owner request: *"make a plan for more game improvements"*. The standing rule *"not too much going on"* still applies.

This is the roadmap **after** two bodies of work that are already decided:
- **The current wave (in flight):** doors stay open for good and round 2 opens only each home's connected room; deeper vaultbreaker rooms; smarter bots; workbench UI organisation; climbable props and vertical movement; combat accuracy and quality; perf round 3; balance and abilities; dev-efficiency tooling (module split, test speed); a QA pass.
- **`docs/PLAN-fun.md` (waves 1-3, not started):** objective line, home guide, death recap and spectator director, H codex, parley wheel, awards and Play again, private match codes, bot difficulty and AFK takeover, status strip and captions, Access settings, account XP and cosmetics, achievements, history and dailies, Leader's mark and raid grace, telemetry, arena events.

Nothing below repeats those. Where an idea builds on one of them, it says so (for example "after PLAN-fun 8"). `docs/QUALITY-PLAN.md` is still the backlog for art (section 2), effects (section 3) and code health (section 4). This plan does not copy its items. It only adds what is missing.

Sizes: **S** is under half a day, **M** is 1 to 2 days, **L** is 3 or more days. Items marked **(owner?)** are listed in section 7.

---

## 0. The diagnosis (a producer's view)

The game is deep. The first wave of PLAN-fun makes it understandable. What is still missing is mostly **not more game**. It is what lets a stranger play it on a bad laptop, over hotel Wi-Fi, on a server the owner can update without killing matches. Then it needs a small amount of extra depth that makes the 30th match different from the 10th.

Five facts from the code drive the ranking:

1. **The hosting config is not production-ready.** `render.yaml` is the free plan with no `envVars`. The free plan sleeps after 15 minutes idle (a cold start takes about a minute) and has an ephemeral disk. Without `GK_SECRET` set, the server makes a new random secret on every deploy, so **every saved character becomes "unverified" after each deploy**. Without `GK_TRUST_PROXY=1` behind Render's proxy, the per-IP cap (8 sockets) may count many players as one address. PLAN-fun's telemetry writes to `logs/`, which the free disk loses on each deploy.
2. **A deploy kills every running match.** There is no SIGTERM handling and no client/server version check. A client with old cached JS against a new server fails in strange ways.
3. **Every client receives every goblin's position.** Interest management (perf-4) sends far movers at 5 Hz instead of 20 Hz, but it still sends them. Sneak backstabs, the Hollow Oak, fog-of-war on the minimap and PLAN-fun's Eclipse event all assume you do *not* know where people are. One `console.log` of the socket is a full wallhack.
4. **There is no music at all.** `audio.js` has beds, ambience and SFX. The match has no musical arc from the quiet home phase to the crown fight.
5. **Build variety is mostly vertical.** 48 weapons and 44 armours are ordered by rarity: a rarer item is a better item. Charms and 9 perks exist, but there are few real sidegrades, and nothing rewards combining things.

---

## 1. Ranked list (value per effort; 19 kept)

| # | Idea | Pillar | Value | Size | Risk | Milestone |
|---|---|---|---|---|---|---|
| 1 | Production hosting config | product | very high | S | low | M1 |
| 2 | Version handshake and deploy drain | product | very high | S-M | medium | M1 |
| 3 | Client resilience: context loss, load progress, dynamic resolution | product, low-end | high | M | low | M1 |
| 4 | Product telemetry: funnel, retention, frame time, network | product | high | S | low | M1 |
| 5 | Seeded match RNG and match seed in logs | technical | medium | S | low | M1 |
| 6 | Golden screenshots (art consistency and regression gate) | polish, technical | medium | S | low | M1 |
| 7 | Visibility-based interest management (anti-wallhack) | anti-cheat | high | M | medium | M2 |
| 8 | Disconnect pilot and a 60 s grace | product | high | S | low | M2 |
| 9 | Title "playing now", queue estimate, party into public | lobby | high | M | low | M2 |
| 10 | Load test on the real host, capacity number, bandwidth budget | technical | high | S-M | low | M2 |
| 11 | Adaptive music (three procedural layers) | polish | high | M | medium | M2 |
| 12 | Pairings: 2-piece weapon, armour and charm bonuses | depth | high | M | medium | M2 |
| 13 | Cursed relics: six sidegrades with a drawback | depth, risk/reward | medium-high | M | medium | M2 |
| 14 | Rare moments: Mimic chests and the Golden Goblin | rare events, content | medium-high | S+M | low | M2 |
| 15 | Oathbreaker: breaking a truce has a visible price | politics | medium | S | low | M2 |
| 16 | Knowledge branch capstones | builds | medium | S-M | medium | M3 |
| 17 | Home defence choices: trap anchors and the Alarm Bell | home play | medium | M | medium | M3 |
| 18 | Spectator wagers and streamer mode | spectating | medium | S+S | low | M3 |
| 19 | Match replays (server-recorded spectator stream) | technical, streaming | medium | M-L | medium | M3 |

Also kept but small, folded into milestone tasks: trust basics (privacy note, credits, report button) in M1; home trophies, five secrets and a UI motion pass in M3. The cut list is in section 3.

---

## 2. The kept ideas

### 1. Production hosting config (S)
**Player value.** Without it nobody outside the owner's machine can rely on the game: the first player of the day waits a minute for a cold start, characters lose their verified wins on every deploy, and the per-IP cap may refuse players.

**Design.**
- `render.yaml`:
  - plan **Starter** (always on, about 7 USD a month) instead of free **(owner?)**
  - `envVars`: `GK_SECRET` (`generateValue: true`, so it is set once and kept across deploys), `GK_ORIGINS` (the public URL), `GK_TRUST_PROXY=1`
  - a persistent disk of 1 GB mounted at `logs/` for PLAN-fun telemetry **(owner?)**. The alternative is to send the daily telemetry file to the owner, which needs no disk.
  - `healthCheckPath: /healthz`
- `server.js` `HOST-BEGIN/END` block:
  - `/healthz` returns `{ok, matches, players, uptime, build}` as JSON
  - the server refuses to start in production (`NODE_ENV=production`) without `GK_SECRET`, instead of warning and making a random one
- A one-page `docs/DEPLOY.md`: how to deploy, roll back, read logs, rotate the secret, and what each env var does.

**Risk.** Low. Check that Render really sets `X-Forwarded-For` as the last hop before you trust it.
**Depends on.** Nothing. Do it first.
**How to test.**
- `tests/host.test.js`: `/healthz` shape; production mode without a secret exits non-zero.
- On a staging service: a saved character keeps its verified wins across two deploys; 12 sockets from 12 different networks all join (use phone hotspots).

### 2. Version handshake and deploy drain (S-M)
**Player value.** A deploy should never end a match early, and a stale browser tab should never see broken behaviour.

**Design.**
- **Build id.** The server computes `BUILD` (a short hash of the served client files, which it already reads for the CSP). It is sent in the first `queue` message and in `/healthz`. The client sends its own `b` in the join query. If they differ, the server answers `{stale:1}` and the client shows "A new version is ready" with one Reload button. This check happens **only at the title or the queue**, never mid-match. A resume token from an older build is still honoured.
- **Drain on SIGTERM.**
  - The queue closes at once: new joins get `{busy:1, drain:1}` and the existing "Servers are full, retrying" loop handles them.
  - Running matches get a banner, "Server update: this match is the last one", and play on.
  - Render's `maxShutdownDelaySeconds` is at most 300 s. A match lasts up to 14 minutes, so the drain can't always wait for every match. When the deadline nears, the server ends each match through the existing time-limit decision (`timeLimit()`), so it ends with a winner instead of a crash.
  - **Deploy rule** for the owner: deploy when `/healthz` shows few matches, and use the drain as the safety net.
- **Later (not now):** run two instances and switch traffic between them (blue-green). That needs routing by match and is part of the scaling plan in section 4.

**Risk.** Medium. A wrong build hash could block everyone from playing. Mitigation: an env `GK_BUILD_CHECK=0` turns it off, and a test checks that the hash is stable across restarts.
**Depends on.** 1.
**How to test.**
- `tests/drain.test.js`: SIGTERM to a GK_DEBUG server gives `drain` to a new join; a running match gets the banner and ends through `timeLimit` before the deadline (short timers under GK_DEBUG).
- A stale `b` gets `{stale:1}` at join; a resume with an old build still resumes.

### 3. Client resilience: context loss, load progress, dynamic resolution (M)
**Player value.** On low-end laptops the risk is not a low frame rate (perf round 3 handles that). It is a **black screen**: a WebGL context lost after alt-tab or a driver reset, a 10-second white page while three.js, a 9000-line game.js and the icon bake load, or a laptop that drops to 15 fps when it gets hot.

**Design.**
- **Context loss.** Listen for `webglcontextlost` and `webglcontextrestored`. Today nothing handles them. In a match, show "Graphics reset, recovering..." and, if restore fails within 3 s, use the existing reload-resume path. That path already puts you back in the match within 15 s.
- **Load progress.** A thin bar on the title for script download, world build and icon bake, with real stages rather than a spinner. Target for the first load: ≤ 15 s on 20 Mbps with a cold cache. Measure it in `tools/perfbench.js` (add a `--coldload` flag).
- **Dynamic resolution.** When the frame time p90 is above the preset's budget for 5 s, lower the render scale in steps of 0.1 (down to 0.6). Raise it again after 20 s under budget. It never changes the preset itself. It sits behind Settings, "Adaptive resolution: On (default) / Off".
- **Browser matrix.** One headless smoke run each on Chrome, Edge and Firefox (the no-multi-draw fallback). Safari gets one manual check by the owner **(owner?)**.

**Risk.** Low. Dynamic resolution can "pump" (go down and up again and again). The asymmetric timers prevent that.
**Depends on.** Perf round 3 (it sets the budgets).
**How to test.**
- Browser: `WEBGL_lose_context.loseContext()` from the console during a match. The game recovers or resumes, with no console errors.
- perfbench `--coldload` reports the stage timings.
- A unit test of the resolution controller (a pure function of a frame-time series).

### 4. Product telemetry: funnel, retention, frame time, network (S)
**Player value (indirect).** PLAN-fun 14 logs matches and client errors. A producer also needs to know **where players drop off** and **whether the game runs well on their machines**. Without that, M2 and M3 can't have measurable exit criteria.

**Design.** These are extra events in the same `telemetry.js` sink, with no new system:
- **Funnel**, one counter each per anonymous install: title shown, Start pressed, GO reached, first death, match end, Play again pressed, a second session within 24 h. The install id is a random string in localStorage. It is not linked to names, IPs or tokens.
- **Retention:** day-1 and day-7 return, counted from the install id's first-seen date.
- **Performance sample**, once per match: preset, render scale, frame time p50/p95, draw calls p95, the GPU renderer string reduced to a vendor bucket (for example "intel-igpu").
- **Network sample**, once per match: ping p50/p95, the count of `fix` corrections, reconnects.
- `tools/telemetry-report.js` gains a funnel table, a retention line, and fps by GPU bucket.

**Risk.** Privacy. The schema test from PLAN-fun 14 is extended: it lists the allowed keys and fails on anything else. The GPU string is bucketed, never stored raw.
**Depends on.** PLAN-fun 14 (W1-D). It is an S extension of that task.
**How to test.** Extend `tests/telemetry.test.js`: the funnel events dedupe per install, the key allow-list holds, and the perf sample has bounded numbers.

### 5. Seeded match RNG and the match seed in logs (S)
**Player value (indirect).** Bugs reported by players ("the vault never opened", "I fell through the stairs") are almost impossible to reproduce. The server has 40 unseeded `Math.random` calls (QUALITY-PLAN 4.5 noted this).

**Design.**
- One `rng.js` (UMD, pure, mulberry32): `m.rng = RNG(seed)`. Layout, rolls, loot, bot decisions and room rolls use `m.rng()`. Combat jitter can stay on `Math.random`: it isn't needed for repro.
- `m.seed` goes into the telemetry line, the client error report and the match summary. It is shown small on the summary card, so a player can paste it in a bug report.
- `GK_SEED=<n>` (GK_DEBUG only) replays the same layout and rolls.

**Risk.** Low, but it is a mechanical edit across blocks owned by others. Do it as one pass with a short freeze, like PLAN-fun's `GK.keys` pass.
**Depends on.** The dev-efficiency module split. Do the edit after the split, in the new files.
**How to test.** `tests/seed.test.js`: two GK_DEBUG servers with the same `GK_SEED` give identical layouts, tree rolls and loot for the first 3 rounds with bots passive.

### 6. Golden screenshots: art consistency and regression gate (S)
**Player value.** About 20 art agents have worked on this game. The thing that most often makes a game look "AI-made" is **inconsistency**: one room painted, the next flat, one UI panel in the old style. Today nobody sees all the views side by side after a merge.

**Design.**
- `tools/golden.js` builds on perfbench (its seeded RNG, passive bots and fixed views). It captures **16 fixed views** at Low and High: title, wheel, home, tree room x2, each of the 4 vaultbreakers, the vault, a loot room, the merchant, the Elixir Screen, the inventory, the death card, the summary.
- It writes `docs/screens/golden/<view>-<preset>.jpg` and one contact sheet, `golden.html`.
- **The gate is a review, not a pixel diff.** After each wave, the Opus reviewer looks at the contact sheet next to the previous one, against ART.md's pillars, and files fixes. A pixel diff on a game with moving goblins is flaky. The draw-call and triangle counts per view are logged and compared with a ±10 % tolerance, and that part is automatic.

**Risk.** Low.
**Depends on.** Nothing (perfbench exists).
**How to test.** The tool runs twice and gives the same counts within ±2 %.

### 7. Visibility-based interest management: anti-wallhack (M)
**Player value.** Stealth, ambush and reading the map are core to this game: the Sneak's backstab, the Hollow Oak, fog of war, Eclipse. A wallhack, which is one line in the browser console today, would ruin all of that for everyone in a public launch. It also cuts bandwidth.

**Design.**
- The server sends a goblin's position to a receiver only if the goblin is in a room in the receiver's **visible set**: the receiver's room, plus rooms within **2 open-door hops**, limited to rooms whose shared doorway faces into the receiver's room. That is a portal test with the receiver's room centre, not his camera, so it stays cheap.
- When a goblin leaves the set, the receiver gets one `gone` entry and the client fades him out. When he enters it, he gets the full slow state.
- **Exceptions:**
  - spectators see everything
  - effects that reveal people on purpose still reveal them: the Bell, noise ≥ 50, PLAN-fun's Leader's mark. These send a position-only ping through their own message, as today.
  - sounds: positional footsteps must not leak positions beyond the set, so footstep events are filtered by the same set
- **The doors-stay-open change** (in flight) means late matches have most doors open, so pure door-hop sets grow large. That is why the set is capped at 2 hops and uses the facing-doorway test, not the whole connected graph.

**Risk.** Medium. Pop-in at doorways. Mitigation: the set is computed with a 3 m margin into the neighbouring room, and an actor stays in the set for 0.5 s after he leaves it.
**Depends on.** The doors-stay-open wave (it changes the open-door graph), and the dev-efficiency server split (the NET code moves).
**How to test.**
- `tests/pvs.test.js` (live): a receiver in room A never gets the id of a goblin 3 hops away behind closed doors, over 10 s of snapshots. A goblin walking through a shared door appears before he crosses the doorway.
- `tools/netsim.js`: bandwidth per client before and after (expected lower).
- Browser: walk through 5 doors and look for pop-in.

### 8. Disconnect pilot and a 60 s grace (S)
**Player value.** On Wi-Fi a drop is common. Today a dropped goblin stands frozen for 15 s: a free kill. With PLAN-fun's AFK pilot in place, the same bot brain can play a dropped goblin.

**Design.**
- When the socket closes during play, the goblin is **piloted** at once (the Normal profile from PLAN-fun 8, but defensive: it retreats home or to the nearest empty room and fights only if hit).
- The grace grows from 15 s to **60 s**, because the goblin is no longer helpless.
- On resume, control returns at once (the AFK 1 s grace rule). The summary rule for "won on autopilot" from PLAN-fun's decision 4 applies.

**Risk.** Low. It reuses the AFK pilot path. One change: the pilot must not send to a closed socket.
**Depends on.** PLAN-fun 8 (W1-E).
**How to test.** `tests/dcpilot.test.js`: a drop leads to pilot movement within 1 s; a resume within 60 s gives back control; at 60 s the goblin dies as today.

### 9. Title "playing now", queue estimate, party into public (M)
**Player value.** At small population most matches are mostly bots. Players should know that ("12 playing now · about 1 human per match"), rather than suspect it. Two friends should be able to queue into **public** matches together, not only into private lobbies.

**Design.**
- **Title line**, small, under the Play button: "N goblins playing now". It comes from `/healthz` once on title load and is refreshed every 30 s. It is hidden when N is under 3 (an empty game should not advertise itself as empty) **(owner?)**.
- **Queue estimate** on the wheel: "Usually 15 s", from the median queue time of the last hour.
- **Party into public:** in a PLAN-fun 7 lobby, the host gets a second button, **Queue together** (up to 3). The party goes through the normal public queue as one unit and gets homes **not next to each other** (they are allies by choice, not by map). It ignores the victory-count bucket and uses the party's highest count.

**Risk.** Low. Friends teaming up in a free-for-all is a known problem, which is why the party is capped at 3 and the homes are spread. Other players can still team up against them with the parley wheel.
**Depends on.** 1 (`/healthz`), PLAN-fun 7 (lobbies).
**How to test.** `tests/party.test.js`: a party of 2 lands in the same public match with non-adjacent homes; the count line is hidden below 3.

### 10. Load test on the real host, capacity number, bandwidth budget (S-M)
**Player value (indirect).** "Can it handle a launch?" needs a number, not a guess.

**Design.**
- `tools/loadtest.js` builds on `tools/netsim.js`. It runs N headless clients (protocol only, no rendering) against a **staging copy on the same Render plan**, ramping up 10, 50, 100, 200 and 400 clients.
- It records: the tick p50/p99 (from `/healthz`, which gains `tickP99`), the egress KB/s, heap, and the kick and correction count.
- The **capacity number** is the client count at which the tick p99 passes 25 ms (half the budget). Write it into DEPLOY.md.
- **Bandwidth budget.** Today it is about 1.9 KB/s per client, so about 6.8 MB per player-hour. 100 GB of egress covers about 14 000 player-hours. Item 7 should lower this. Check it against the chosen plan's included egress.

**Risk.** Low. Run it against staging, never production.
**Depends on.** 1. Item 7 for the final numbers.
**How to test.** The tool itself is the test. Keep a small version (20 clients, 20 s) as a CI job.

### 11. Adaptive music: three procedural layers (M)
**Player value.** The match has a strong arc: quiet home phase, exploring, heists, the vault opening, the crown fight, sudden death. Today the only sound for it is ambience. Music is the cheapest way to make the climax *feel* like a climax.

**Design.**
- A new `music.js` (procedural, through audio.js's buses; no downloaded tracks, so no licence work) with **three layers**:

  | layer | when | character |
  |---|---|---|
  | **Home** | round 1, and whenever you are at home | sparse plucked pattern, low drone, calm |
  | **Prowl** | rounds 2+, in the arena | the same key, a light percussion pulse, a melody fragment every 16 bars |
  | **Crown** | someone is gaining crown claim, the vault alarm, sudden death | drums up, tempo +10 %, the drone moves up a fifth |

- Layers crossfade over 4 s. **Combat adds no layer.** Music that reacts to every swing is noise.
- **Stings**, about 2 s, on: vault door opened, a heist completed by you, a kill of the Marked leader, your death (the music stops), a win.
- Settings: a new "Music volume" slider, **default 35 %**.

**Risk.** Medium. Procedural music can sound cheap or grate after 20 matches. Mitigation: a strict palette (one key per match, chosen from 3), long phrases, a lot of silence in Home. The owner listens before it merges **(owner?)**. The alternative is 3 CC0 loops (see BRIEF.md's download rules).
**Depends on.** Nothing. PLAN-fun 9's caption table gets "♪ Crown music" as an optional caption.
**How to test.**
- `tests/music.test.js` (pure): the layer chosen for about 15 game states; the crossfade timing.
- Listen in a browser through a full match, at the default volume.

### 12. Pairings: 2-piece bonuses for weapon, armour and charm families (M)
**Player value.** Today you equip the rarest weapon and the rarest armour. Pairings make **a common item worth keeping** because it fits another one. They also give each match a small build puzzle ("I have the Thorn armour, now I want a whip"). This is the set-bonus idea, sized for a game with only 3 gear slots.

**Design.**
- **Six pairings**, each 2 pieces from 2 different slots, each with one small passive:

  | pairing | pieces | bonus |
  |---|---|---|
  | **Bramble** | thorn armour + whip | thorns damage +50 %; whip bleed lasts 1 s longer |
  | **Shadow** | shroud or cloak armour + dagger | backstab or ambush multiplier +0.25 |
  | **Bulwark** | bulwark or stone armour + hammer or mace | -20 % knockback taken; +10 % breach on doors and barricades |
  | **Ember** | ember armour + wand or staff | bolts set a 2 s burn (2 damage per second) |
  | **Ranger** | light or quill armour + bow, crossbow or sling | +15 % move speed while reloading |
  | **Gilded** | gilded armour + any gold or gem charm | +25 % gold from every source |

- They are named on the item card ("Pairs with: whip, Bramble"), and the H codex (PLAN-fun 4) lists them. The bonus shows **once** as a toast when it switches on, then as a small icon on the hotbar weapon slot. **No new HUD element.**
- The numbers are small on purpose: a pairing must never beat a 2-tier upgrade.

**Risk.** Medium for balance. Mitigation: telemetry records which pairings win (one key per match), with a `GK_RULES=-pairs` switch.
**Depends on.** The "balance and abilities" wave in flight. If it adds active abilities to weapon families, pairings must modify those abilities rather than add more numbers. Coordinate through its report.
**How to test.**
- `tests/pairs.test.js` (pure): `pairOf(inv)` for every combination of families (including none and two at once).
- Live: a Bramble wearer's thorns deal 1.5 times the damage; a Gilded wearer's coffer scoop is +25 %.
- `tools/gameinfo.js` gets a Pairings tab, generated from the same table.

### 13. Cursed relics: six sidegrades with a drawback (M)
**Player value.** Risk and reward in your gear. A cursed relic is **strong in one way and costly in another**. Taking it is a real decision, and it is a sidegrade instead of another rung on the rarity ladder.

**Design.**
- Six relics. They drop **only** from mystery rooms (enemy kills), the vault coffers (a 5 % chance in place of gold) and the Gambler's Root top step. They have their own purple-black frame, and their cards say the curse in red.

  | relic | slot | upside | curse |
  |---|---|---|---|
  | **Hungering Blade** | weapon | +40 % damage | no natural regeneration |
  | **Glass Plate** | armour | +60 % health | every hit you take does at least 8 damage |
  | **Gossip Charm** | charm | you see all goblins within 1 room on your minimap | you show on everyone's minimap within 1 room |
  | **Miser's Ring** | charm | +50 % gold | merchants charge you +50 % |
  | **Brainworm** | charm | eaten brains give 2x knowledge | -10 max health per brain eaten |
  | **Oath Hammer** | weapon | +60 % breach (Ram, barricades, doors) | -30 % damage against goblins |

- A cursed item can't be unequipped for 30 s after you equip it (a "bind" timer on the slot). It can be recycled, which gives back nothing but bone.
- Bots value them by profile: Hard bots take them, Easy bots never do.

**Risk.** Medium. Gossip Charm interacts with item 7 (visibility): its reveal must go through the reveal message, not snapshots. Glass Plate and the Hungering Blade need a sim check for oppressive combinations (two curses at once are allowed; the bind timers stop swapping mid-fight).
**Depends on.** Item 12 (it shares the hit hooks), item 7 for Gossip Charm (or leave Gossip out until 7 lands).
**How to test.** `tests/cursed.test.js`: each upside and curse is applied; the bind timer; recycle yield. 20 bot sims with relics enabled: match length and win-type share stay within ±10 % of baseline.

### 14. Rare moments: Mimic chests and the Golden Goblin (S + M)
**Player value.** Stories. "The chest bit me" and "everyone chased the golden goblin through the Counting House" are the moments people tell friends about. PLAN-fun 15 adds one match-wide event. These are **small, local surprises** inside a normal match.

**Design.**
- **Mimic (S).** 1 in 15 loot-room chests is a Mimic.
  - The tell is subtle and fair: it breathes, a 2 mm scale pulse every 4 s, and it sits a little crooked. An attentive player can spot it.
  - Pressing E on it starts a 3 s fight: it bites for 15, has 60 HP, and then drops **two** rolls of that chest's loot.
  - Hitting it before opening is a free first strike.
  - Bots treat it as a normal chest 70 % of the time.
- **Golden Goblin (M).** At most once per match, with a 25 % chance, from round 3: a small golden NPC spawns in a random arena room.
  - It **flees**: it runs between rooms through open doors using botnav, at sprint speed, and drops 5 gold every 3 s.
  - It rings a little bell that everyone hears within 2 rooms. It shows on no map.
  - It has 40 HP. The killer gets 120 gold and one tier 3 roll.
  - It leaves the match after 90 s.
  - Bots chase it only if it is in their room or the next one.
- Neither appears in a player's first 3 matches.

**Risk.** Low. The Golden Goblin moves everyone toward one place. That is the point, but it must never spawn during sudden death or within 2 rooms of the vault while someone is claiming.
**Depends on.** Nothing. It uses the NPC table and botnav. The art for both is small: a chest with a tongue and teeth, and the goblin model with a gold material and a bell.
**How to test.**
- `tests/rare.test.js`: the spawn rates over 10k rolls; the Mimic's double loot; the Golden Goblin's path uses only open doors, it despawns at 90 s, and it never spawns in sudden death.
- Browser: find a Mimic by its tell.

### 15. Oathbreaker: breaking a truce has a visible price (S)
**Player value.** PLAN-fun 5's "Truce?" is only words. Betrayal is part of the game, and it should be a **choice with a cost and a reward**, so a truce means something.

**Design.**
- A truce exists when one goblin sends "Truce?" and the other answers "Thanks" within 5 s. That is the same pair of phrases, so no new UI.
- If either one damages the other within 45 s, the attacker becomes the **Oathbreaker** for 60 s:
  - **Reward:** +1 knowledge point, at once. Betrayal pays.
  - **Price:** a cracked-skull mark next to his name tag, seen by everyone who can see him, and the PLAN-fun 9 status icon for him. Bots that see it treat him as a preferred target for 30 s.
- No extra kill bounty: the mark is the price.

**Risk.** Low. Griefing ("I truce and then break it to farm points") is limited: one point per match from this.
**Depends on.** PLAN-fun 5 (W2-A).
**How to test.** `tests/oath.test.js`: a truce is formed only by the two-phrase exchange; a hit within 45 s gives the point and the mark; one point per match at most.

### 16. Knowledge branch capstones (S-M)
**Player value.** The 9 perks in 3 branches (Craft, Lore, Guts) make a goblin stronger, but not *different*. A capstone, unlocked by learning all 3 ranks of one branch, gives a **build identity** you can feel. These are class-like goblin builds through knowledge.

**Design.**
- One capstone per branch. It is free when the third rank is learned (no extra points). One per goblin: the first branch you complete is your identity for the rest of that life.

  | capstone | branch | effect |
  |---|---|---|
  | **Artificer** | Craft | your bench crafts one tier higher than your knowledge allows, once per round |
  | **Sage** | Lore | tree rooms show you the next timing window early (a longer timing arc) |
  | **Brute** | Guts | below 30 % HP your swings knock back and stagger for 0.3 s |

- It shows as a crest on the knowledge screen, and as a small sigil on your name tag that everyone can see. Others can read your build and counter it.

**Risk.** Medium. It overlaps with the "balance and abilities" wave. If that wave gives goblin types active abilities, the capstones should modify an ability rather than add one. Decide when that report lands.
**Depends on.** The "balance and abilities" wave, and the workbench UI organisation wave (the knowledge screen layout).
**How to test.** `tests/capstone.test.js`: each one switches on at rank 3 only; one per life; the Artificer's once-per-round limit.

### 17. Home defence choices: trap anchors and the Alarm Bell (M)
**Player value.** Home defence today is a shopping list (buy a Snare, buy a Sentry). It has no *placement* decision, and the owner learns about a raid only from damage. Defence play is fun when you outthink the raider.

**Design.**
- Each home gets **3 trap anchors**: hatch, pump, bench. They are fixed points, so the solids stay static. The owner chooses what goes on each anchor at the Elixir Screen: Snare, Sentry, or the new **Alarm Bell**.
- **Alarm Bell** (10 elixir, reusable): when a non-owner passes its anchor, the owner hears a bell and gets a minimap ping of his home for 3 s, wherever he is. It costs no HP, it is information only, and it gives "I know you're in my house" moments.
- **Caught bounty:** a raider killed inside your home pays you 30 % of his carried elixir.
- A raider can see the traps **only from 3 m** (they are small and dark). The PLAN-fun 9 status strip shows "Snared" as today.
- Sentry ammo and snare rearm stay as they are (`homebase.js` ACTIONS).

**Risk.** Medium. Turtling: a fully trapped home can be too safe. Mitigation: still 3 anchors only, no stacking, and PLAN-fun 13's raid grace already protects new players.
**Depends on.** PLAN-fun 13 (raid grace), and the workbench UI organisation wave (the Elixir Screen layout). The art is small: one bell model and 3 anchor plates per home, from rooms5art-home.
**How to test.** `tests/traps.test.js`: anchor assignment; one trap per anchor; the bell ping goes to the owner only; the caught bounty. Bots: an owner bot fills anchors in the order hatch, pump, bench; a raider bot avoids a visible snare 50 % of the time.

### 18. Spectator wagers and streamer mode (S + S)
**Player value.** A dead player watches for up to 10 minutes. PLAN-fun 3's director gives him something good to watch. A wager gives him **a stake**. Streamer mode makes the game safe to stream, which is free marketing.

**Design.**
- **Wager.** While spectating, a dead human may pick **one** living goblin as the predicted winner. Changing the pick costs nothing until the last 3 goblins are left; after that it is locked.
  - A correct pick gives +30 account XP (PLAN-fun 11) and the "Oracle" award (PLAN-fun 6).
  - A small "Your pick: Snikt" line sits in the spectator strip.
  - **No gold or items.** Dead players never affect the match.
- **Streamer mode** (a Settings toggle):
  - other players' names are shown as their goblin type plus a number ("Big #3")
  - the private lobby code is hidden behind a click
  - the parley wheel shows only the phrase, not the sender's name

**Risk.** Low. Collusion: a dead player can tell a living friend things on voice chat. That is true today, and the wager doesn't change it.
**Depends on.** PLAN-fun 3 (director, spectator strip), 6 (awards), 11 (XP).
**How to test.** `tests/wager.test.js`: a pick is accepted only from the dead; it locks at 3 left; XP is given on a correct pick; picks are never sent to the living. Browser: streamer mode on the scoreboard, feed and lobby.

### 19. Match replays: server-recorded spectator stream (M-L)
**Player value.** For players: "watch my last match" and highlight clips for sharing. For the owner: trailers and store footage. For developers: bug repro, together with item 5. It also makes the deferred kill-cam cheap later.

**Design.**
- **Record what a spectator receives**, not the inputs. The game is not deterministic, and the spectator stream already contains everything that is visible. The server writes the spectator feed (snapshots, `players`, round, act5 views, hits, feed) as length-prefixed JSON, gzipped. That is about 2 KB/s, so about 1.7 MB raw and about 300 KB compressed for a 14-minute match.
- Replays are kept for 24 h (disk, item 1) **(owner?)**, limited to the last 50 matches.
- **Playback:** `/?replay=<id>` loads the client in spectator mode with a file-fed fake socket (like the offline mock in `makeNet`). It has play/pause, ×2/×4, a timeline with round markers, and free choice of which goblin to follow (the director works too).
- The summary card gets a "Watch replay" link. PLAN-fun 12's match history gets one for each stored match.

**Risk.** Medium. Disk and privacy: names are in the stream. Streamer mode (18) rules apply in playback, and replays expire. CPU: recording is one extra `JSON.stringify` per spectator tick, which is already built when spectators exist (server-tick report), so recording builds it always.
**Depends on.** Items 1 (disk), 5 (seed, for bug repro), PLAN-fun 3 (director).
**How to test.** `tests/replay.test.js`: a debug match produces a file that decodes, with monotonic timestamps; the size is under 1 MB for a short match; expiry. Browser: play back a bot match at ×4 with no console errors.

### Folded in (small, no own task)
- **Trust basics** (M1, S): a privacy note on the title for the telemetry (what is sent, with the toggle), a Credits screen (assets/CREDITS.md, three.js, fonts), and a **Report** button on the scoreboard. It logs `{match seed, reported slot, reason}` to the telemetry sink, and nothing happens automatically. With no accounts, a report can only feed name-filter updates and the owner's judgement.
- **Home trophies** (M3, M, after PLAN-fun 12): 3 shelf spots in your home that show models of achievements you have earned (the Elder Seed, a Ram head, a Crown). Raiders see them. It makes the home yours and is cosmetic only.
- **Five secrets** (M3, S): small, data-driven easter eggs with existing props. Each has a hidden achievement. Examples:
  - throw a Plushie onto the vault medallion: a squeak tune plays
  - ring your home bell 3 times in round 1: your goblin dances
  - 1 in 500 wheels lands on a "Golden King" slot: a cosmetic gold tint for that match
  - Write them down in a private doc, not in the codex.
- **UI motion pass** (M3, S-M): one shared easing set (180 ms in, 120 ms out) for sheets, cards, toasts and the summary. Number counters roll on the summary. Panels slide 8 px instead of popping. This uses QUALITY-PLAN A14's panel style and adds motion only.

---

## 3. Considered and cut, honestly

| idea | verdict | why |
|---|---|---|
| **New weapon families** | cut | 16 families and 48 weapons already. Pairings (12) and cursed relics (13) add depth with existing models. A new family costs a model, an icon, a viewmodel clip and a swing tune. |
| **Damage types against armour classes** (blunt beats plate, and so on) | cut | Hidden maths on every hit, and it needs readability work everywhere. Pairings give sidegrades that the player chooses on purpose. |
| **More goblin types** | cut | 12 is plenty; the abilities wave in flight deepens the existing ones. |
| **A second arena theme** (for example a flooded cistern) | defer, after launch | A palette and material swap of the shells is about an L, once QUALITY-PLAN A1/A3 (grade and material families) exist. Variety per match already comes from the rolled rooms. Revisit when telemetry shows players tiring of the look. |
| **Seasons** | defer, after launch | A season is data: a 6-8 week window with one banner and tint palette, one PLAN-fun 15 event skin and 6 achievements. That is S once PLAN-fun 11/12 exist. There is no point before there is an audience. **No battle pass.** |
| **Mobile and touch** | cut | 41 rooms on a phone GPU, plus touch for the inventory, panels, Elixir Screen and timing arcs: an L+ for an audience that would get a worse game. |
| **Controller** | still deferred | PLAN-fun 10 has the feasibility note. Nothing has changed. |
| **Real accounts** (email or OAuth login) | defer | Privacy duties, password reset, GDPR. PLAN-fun 11's signed profile and export string cover a single player. Revisit if retention data shows players losing their profile. The cheap step then is a **recovery code** backed by a small server store (Render Postgres), not logins. |
| **Ranked ladder / MMR** | cut | At beta population most seats are bots, so a rating means nothing. The victory-count bucket is enough. |
| **Binding alliances / pacts** | cut | Against the goblin spirit, and it adds UI. Oathbreaker (15) gives truces teeth without binding anyone. |
| **Nemesis / grudge across matches** | cut | Random matchmaking at low population almost never meets the same human twice. |
| **Proximity voice chat** | cut | Moderation, and an always-on audio channel in a death-loses-everything game. The parley wheel stays the voice. |
| **Map editor / user content** | cut | The layout is fixed by design: symmetrical homes and a central vault. |
| **Steam / desktop app (Electron)** | defer | The browser is the product. Decide after launch, from the funnel data. |
| **Web game portals** (CrazyGames, Poki, itch.io) | owner? | A real distribution option, but the portals have SDK and ad rules, and some want exclusivity. See section 7. |
| **Multiple regions** | defer | One region until telemetry shows a large share of players with ping p50 > 120 ms. Then a second instance in the other region, chosen by the client from two `/healthz` pings. That is also the start of horizontal scaling (section 4). |
| **Kill-cam** | still deferred | Replays (19) give it a cheap path later: play the last 3 s of the spectator stream from the killer's view. |

---

## 4. Scaling plan (written down, build only when needed)

- **Today:** one Node process. The server-tick report measured 10 matches (80 goblins) at 1-2 ms per tick out of a 50 ms budget. The real ceiling is likely socket writes, not game logic. Item 10 gives the real number on the real host.
- **Step 1 (if item 10's capacity is under 2 times the peak CCU):** a bigger instance. That is a config change.
- **Step 2:** run matches in `worker_threads`, one worker per core, with the main thread doing the HTTP, queue and socket routing. That is an L, and it needs the server module split first.
- **Step 3:** several instances. The queue must route a whole match to one instance, and resume tokens must carry the instance id. It needs a shared queue (a small Redis) or a lobby instance that hands out match addresses.
- Do not start steps 2 or 3 before telemetry shows a need. A browser FFA game with 8-goblin matches can serve thousands of CCU on step 1.

---

## 5. Milestones

### M1 "Playtest-ready": strangers can play a real session on the hosted server
**Contents.**
- The current wave, merged.
- PLAN-fun wave 1 (W1-A to W1-F).
- From this plan: items 1-6 and the trust basics.

**Exit criteria (all must hold).**
1. A hosted staging and production service, with a `GK_SECRET` that has survived 2 deploys, `/healthz`, and DEPLOY.md.
2. **8 humans from 8 different networks** play **3 full matches** in a row, with: 0 server errors, 0 speed-check kicks, at most 1 reconnect each, and every client error showing up in the report tool.
3. A deploy during a match ends it through the time limit, with a winner and no crash. A stale tab gets the "New version" prompt at the title.
4. On the reference iGPU (QUALITY-PLAN's AMD Radeon, Low): frame time p95 ≤ 20 ms in the vault view, and a cold first load ≤ 15 s at 20 Mbps.
5. A forced context loss recovers or resumes in the match.
6. `tools/telemetry-report.js` prints the funnel, the fps by GPU bucket, and the room-use table for those playtest matches.
7. The golden contact sheet is reviewed by Opus against ART.md, with no "looks unfinished" item left open.
8. `npm test` is green (the time target is set by the dev-efficiency plan).

### M2 "Friends beta": 50-200 invited players over 2-4 weeks, and they come back
**Contents.**
- PLAN-fun waves 2 and 3 (parley, awards and Play again, lobby, profile and cosmetics, achievements; events after the telemetry check).
- From this plan: items 7-15.

**Exit criteria.**
1. **Retention:** day-1 return ≥ 35 % and day-7 ≥ 15 % among beta players (from item 4). These are targets for a free browser game; the owner can adjust them **(owner?)**.
2. **Funnel:** ≥ 70 % of first matches reach GO and ≥ 50 % of players press Play again at least once.
3. **Capacity:** item 10 shows the chosen plan holds **2 times the beta's peak CCU** with tick p99 < 25 ms.
4. **Cheating:** a test client in a closed room receives no positions of goblins outside its visible set (item 7), checked on production with a protocol client.
5. **Depth:** each of the 6 pairings is active in at least 5 % of matches, and no pairing or relic is in more than 30 % of wins.
6. **Feel:** at least 5 beta players' written feedback mentions the music or a rare moment without being asked. That is a soft criterion: read the feedback channel.
7. No open crash bug or progress-loss bug older than 3 days.

### M3 "Public launch": open to anyone, and the owner can run it
**Contents.**
- From this plan: items 16-19, home trophies, the five secrets, the UI motion pass.
- PLAN-fun 15 events (if M2 telemetry shows they are wanted).
- A decision on portals (section 7).
- The scaling step chosen from item 10.

**Exit criteria.**
1. Capacity is proven at **500 CCU** (or 2 times the expected launch peak, whichever is higher) on the production plan.
2. Crash-free sessions ≥ 99 % (sessions with no client error report and no unexpected socket close).
3. **Hotfix in under 30 minutes:** a one-line balance change goes from commit to production with no match lost (drain plus deploy rule), rehearsed twice.
4. A replay of any of the last 50 matches plays back with no errors.
5. The privacy note, credits and report button are live. The owner has a written moderation routine: who reads reports, and how often.
6. The first match teaches enough that ≥ 60 % of new players survive past round 2 (from the funnel).
7. A launch-day runbook in DEPLOY.md: scale up, drain, roll back, and who watches `/healthz`.

---

## 6. Task split for parallel agents

The rules from BRIEF.md and PLAN-fun section 3 still apply:
- Each task owns its files and blocks. Hooks into blocks that other tasks own are **one line**, applied by that owner or listed in the merge notes.
- New server blocks go **after PLAN-fun's `EVENTS` block**, in this order: `HOST`, `DRAIN`, `PVS` (inside the NET code), `PAIRS`, `CURSED`, `RARE`, `OATH`, `TRAPS`, `WAGER`, `REPLAY`.
- If the dev-efficiency module split has landed, "server.js block X" means the matching file under `server/`.
- Model split (memory): Sonnet implements, Opus designs, reviews and merges.

### M1 tasks (after the current wave and alongside PLAN-fun wave 1)

| task | items | owns | one-line hooks | size |
|---|---|---|---|---|
| **I1-A Host and deploy** | 1, 2 | `render.yaml`, new `docs/DEPLOY.md`, new `tests/host.test.js`, `tests/drain.test.js`; server.js `HOST` and `DRAIN` blocks | the join handler (the `b` check); menu.js (the "New version" prompt, menu owner) | S+M |
| **I1-B Client resilience** | 3 | new `resil.js` (context loss, the resolution controller), the title load bar in index.html; `tools/perfbench.js --coldload` | game.js render loop (1 line for the render scale), the reload-resume call | M |
| **I1-C Telemetry, product events** | 4, trust basics | `telemetry.js` (extends W1-D; **the same agent as W1-D, or after it**); `tools/telemetry-report.js`; the Credits and privacy rows in index.html | statsui/menu (funnel events, 1 line each); the scoreboard Report button (FUN owner) | S+S |
| **I1-D Seed and golden views** | 5, 6 | new `rng.js`, `tools/golden.js`, `tests/seed.test.js`; the mechanical `m.rng()` pass across the server (announce a 1-hour freeze) | every server block that rolls (a mechanical edit, done in one pass) | S+S |

### M2 tasks

| task | items | owns | depends on | size |
|---|---|---|---|---|
| **I2-A Visibility** | 7 | server NET code (the `PVS` part), new `tests/pvs.test.js`; the client fade-out for `gone` | the doors-stay-open wave; the server split | M |
| **I2-B Connection and queue** | 8, 9 | the AFK pilot extension (BOTS owner, after W1-E); the server queue party branch (MATCH owner, after W2-C); menu.js "playing now" line | W1-E, W2-C, I1-A | S+M |
| **I2-C Load test** | 10 | new `tools/loadtest.js`, the CI job, the capacity section of DEPLOY.md; `/healthz` `tickP99` (1 line in HOST) | I1-A; rerun after I2-A | S-M |
| **I2-D Music** | 11 | new `music.js`; the Music slider in index.html | audio.js (bus access, 1 line); game.js (state feed, 1 line) | M |
| **I2-E Builds** | 12, 13 | new `builds5.js` (UMD, pure: pairings and curses); the items.js relic rows; server.js `PAIRS` and `CURSED` blocks; itemart.js relic models and the cursed frame (the item-art owner) | the abilities wave; the COMBAT `hitTarget` hooks (1 line each); gameinfo tabs | M+M |
| **I2-F Rare moments and Oathbreaker** | 14, 15 | server.js `RARE` and `OATH` blocks; the NPC table rows; new `tests/rare.test.js`, `tests/oath.test.js`; the Mimic and Golden Goblin art (new `rare5art.js`) | W2-A (parley) for 15; BOTS owner (2 one-line reads) | S+M+S |

### M3 tasks

| task | items | owns | depends on | size |
|---|---|---|---|---|
| **I3-A Capstones** | 16 | items.js `PERKS` (a capstone row per branch); the knowledge screen crest (the workbench UI owner) | the abilities wave; the workbench UI wave | S-M |
| **I3-B Home defence and trophies** | 17, trophies | homebase.js (anchors, the bell, the caught bounty); homeui.js (the anchor picker); rooms5art-home.js (anchors, bell, shelf) | W1-E (raid grace), W3-A (achievements, for trophies) | M+M |
| **I3-C Spectating** | 18 | server.js `WAGER` block; the spectator strip line (FUN owner); the streamer mode setting (`access.js`, W1-F owner) | W1-C, W2-B, W3-A | S+S |
| **I3-D Replays** | 19 | new `replay.js` (server recorder), new `replayui.js` (client player); server.js `REPLAY` block; the `makeNet` file-fed socket (NET owner, a small branch) | I1-A disk, I1-D seed, W1-C director | M-L |
| **I3-E Delight and motion** | secrets, UI motion | new `secrets5.js`; a private doc of the secrets for the owner; one shared easing set in index.html's UI-SYSTEM tokens | PLAN-fun 12 (hidden achievements) | S+S-M |

**QA per milestone (Opus):** the golden contact sheet; 10 bot sims (match length, vault-open round, win-type share against the previous milestone); one telemetry report; a browser pass at Low with a fresh profile; and that milestone's exit criteria checked one by one in a `docs/reports/milestone-N.md`.

---

## 7. Open questions for the owner

1. **Hosting cost:** may the game move from Render's free plan to an always-on paid plan (about 7 USD a month), plus a 1 GB disk for telemetry and replays (about 0.25 USD a month)? Without it, the first player each hour waits about a minute, and telemetry and replays are lost on every deploy.
2. **Deploy rule:** is it acceptable that a deploy ends running matches early through the time-limit decision (with a winner), after a 5-minute banner? The alternative, zero-loss deploys, needs two instances (section 4).
3. **Safari:** must the game run on Safari or a Mac at launch, or are Chrome, Edge and Firefox enough?
4. **"N playing now":** show the live player count on the title (hidden below 3)? It is honest, but it shows when the game is empty.
5. **Party into public matches:** may up to 3 friends queue together into a public match (with homes spread apart), or should groups stay in private lobbies only?
6. **Music:** procedural music made by an agent (the owner listens before merge), or 3 CC0 music loops downloaded under BRIEF.md's rules?
7. **Cursed relics:** are drawback items welcome, or do they feel unfair in a death-loses-everything game?
8. **Replays:** may matches be recorded and kept for 24 h (names included, so replays respect streamer mode)?
9. **Beta targets:** are day-1 ≥ 35 % and day-7 ≥ 15 % the right bar for moving from friends beta to public launch?
10. **Distribution:** only the game's own URL, or also a web game portal (CrazyGames, Poki or itch.io)? Portals bring players but have SDK and ad rules, and sometimes exclusivity.

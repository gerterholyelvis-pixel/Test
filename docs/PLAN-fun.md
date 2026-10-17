# PLAN-fun: what most raises fun and quality now

Written 2026-10-16 (Opus, design only, no game code). Based on main at `375ca70` (5x5 arena, homes with elixir pumps and base upgrades, 10 tree rooms, 4 heists, the vault crown claim, act5ui, bots5).
Owner mandate: *"feel free to add features that will improve quality and fun of the game as you see best fit"*, together with the standing rule *"not too much going on"*.
Items marked **(owner?)** are listed in section 5.

## 0. The diagnosis (a playtester's view)
The systems are deep now. A first-time player meets 41 rooms, 56 doors, an elixir economy, 15 activity rooms with 30-odd verbs, 4 tokens, sendables, a crown claim and 12 goblin types. Then he dies in round 2 and loses everything, with no idea why. The biggest fun gains are no longer new systems. They are:
1. **Knowing what to do next** (clarity). Today the tips are 3x3-era: one still says "Vault doors need TWO rooms". There is one banner line per room, and that is all.
2. **Understanding a death, and still having fun after it** (recap, spectating, awards). Death loses everything, so a match has to leave something behind: a story, an award, account XP.
3. **Other humans** (politics needs a voice, friends need a way to play together).
4. **Fair matches for every skill level** (bot difficulty, new-player protection, AFK).

So this plan is mostly **clarity, social and meta**. It adds only one optional variety system, and it gives the owner data (telemetry) to tune what already exists.

**Rules every item follows** (from BRIEF.md and ART.md):
- No new permanent HUD element unless it replaces one.
- Light count stays at 9 PointLight + 1 Hemisphere.
- Nothing measurable on Low.
- The server is the authority for anything that affects play. Cosmetics only, no pay-to-win.
- New code goes in new files or `X-BEGIN/END` blocks, with one-line hooks elsewhere.

Sizes: **S** is under half a day, **M** is 1 to 2 days, **L** is 3 or more days.

---

## 1. Ranked features (15 kept)

| # | Feature | Pillar | Size | Do now? |
|---|---|---|---|---|
| 1 | Objective line ("what now") and live room line | clarity | M | **yes, first** |
| 2 | Guided first match in the home phase, plus a 5x5 tips refresh | onboarding | M | **yes** |
| 3 | Death recap and a spectator director | death flow | M | **yes** |
| 4 | Room codex: the H card in the room, and How to Play rewritten for 5x5 | clarity | M | **yes** |
| 5 | Parley wheel: proximity quick chat and pings | social, politics | M | yes |
| 6 | Post-match awards, your match timeline, Play again | pacing, social | M | yes |
| 7 | Private match code (play with friends) with host options | social | M | yes |
| 8 | Bot difficulty, new-player bots, AFK takeover | anti-frustration | M | yes |
| 9 | Threat readability: status strip, damage colours, sound captions | game feel, a11y | M | yes |
| 10 | Accessibility and controls: remap, hold/toggle, colour-blind, UI scale, reduce flashes | a11y | M | yes |
| 11 | Account level and cosmetics (signed XP, home banners, skin tints, titles) | meta | M | yes, after 6 |
| 12 | Achievements, match history, daily challenges | meta | M | yes, after 11 |
| 13 | Leader's mark, scrounger stipend, raid grace | balance | S | yes, behind telemetry |
| 14 | Telemetry and client error reports | tech quality | S | **yes, early (cheap, unblocks tuning)** |
| 15 | Arena events (one per match at most) and private-match mutators | variety | M | later, after 7 and 14 |

The cut list (section 2) explains everything I chose not to do.

---

### 1. Objective line ("what now") and live room line (M)
**Player problem.** With 15 activity rooms, tokens, a pump, sends and a crown, a new player stands in a hall without knowing what is worth doing. Experienced players also miss state changes, such as "my pump is full" or "someone is claiming".

**Design.**
- **One line of text** under the round timer, inside the existing round pill area. It replaces nothing and is never more than one line. It is driven by a **pure priority function** that picks the single most relevant goal. The first matching rule wins:

| prio | condition | text (example) |
|---|---|---|
| 1 | home phase (round 1) and the guide is active | the current guide step (feature 2) |
| 2 | HP < 35 % and a heal in a quick slot | "Drink Spring Water (2)" |
| 3 | heavy carry | "Carry the sack out through any door" |
| 4 | somebody is gaining crown claim and you are 2 hops or fewer from the vault | "Stop Snikt claiming the crown: THE VAULT" |
| 5 | sudden death and you are in a vented room | "Outer rooms are venting: get to THE VAULT" |
| 6 | you hold a token and its target heist is 3 hops or fewer away | "Rune Charge: use it at the Ram (north)" |
| 7 | the last 20 s of the round and your room has no pick | "Pick a door on the panel: 14 s" |
| 8 | your pump tank is at its cap, or you have unspent knowledge points near a bench | "Your pump is full (48): go home" |
| 9 | you are inside a special room | the **room line** (below) |
| 10 | a vault door opened this round | "THE VAULT is open: coffers, relic, crown" |
| 11 | otherwise, rounds 2-3 | "Explore: tree rooms teach, vaultbreakers open the vault" |

- **Room line** (prio 9): the live state of the room you stand in, plus your next verb. Examples: "Sapling Well · crank E (timing) · fruit 3/4, anyone may steal it", "Keystone · next stone ◆ · 2/4 lit · armed counts 2 votes at the tally", "Counting House · writ 30 g · strongbox ~120 g". The room line **replaces** the hud5 room banner's 1-line description after its 3 s, so there is no new element.
- **Behaviour.** The line fades in when its text changes, and drops to 55 % opacity after 6 s. A rule that has just fired can't fire again for 20 s (no flicker). It is hidden while a channel or timing arc runs (the arc is the prompt, as act5ui does).
- **Setting:** "Objective hints: Always / First 10 matches (default) / Off". After 10 matches only prios 2-7 still show (the urgent ones).

**Implementation.**
- New `objective5.js` (UMD, pure, about 150 lines): `pick(state) -> {id, text, prio}`. The state is a plain object built by the client from what it already has: `me`, `roundState`, `actS`/`actMe`, `crown`, `GK.state.homes`, the inventory and `WORLD`.
- `hud5.js`: one `objective(text)` method plus the CSS (hud5 owner).
- game.js `OBJ-BEGIN/END` block: builds the state at 4 Hz and calls `pick` and then `hud5.objective`.
- index.html: 1 script line and 1 settings row.
- Room-line texts come from one table in `objective5.js` per type (15 entries), reading `actS.st` fields that act5ui already decodes.

**Risks.**
- Wrong advice is worse than none. Keep each rule's condition narrow, and keep text on prio 11 generic.
- Clutter: it is exactly one line, it dims, and it can be switched off.

**Tests.** `tests/objective5.test.js` (pure):
- a table of about 30 states and their expected `id`
- the cooldown
- every room type has a line
- no line is longer than 64 characters

Browser: walk through a home, a tree room, a heist and the vault, and check that the line changes.

**Bots.** None (client only).

**Depends on.** Nothing. Prio 1 hooks into feature 2.

---

### 2. Guided first match in the home phase, plus a 5x5 tips refresh (M)
**Player problem.** Round 1 is becoming a home-only phase (owner direction). For a newcomer, that is the perfect quiet classroom, but nothing teaches there today. The TIPS block still teaches the 3x3 game.

**Design.**
- **Home guide** for players with fewer than 3 matches played (counted locally), or after "Replay the guide" in Settings. It is a 5-step checklist card **on the left edge, replacing the tip card during round 1**. Each step ticks off when the server confirms the action:
  1. "Collect your pump (E at the glass tank)": `{elixir}` goes up.
  2. "Open the Elixir Screen and buy Pump II": the round 1 pump yield (24) covers its cost of 20.
  3. "Recycle the junk in your bag, or craft at the bench": a recycle or craft reply. The guide grants one junk weapon at GO for new players **(owner?)**, so step 3 always works.
  4. "Look at your wall map: find THE VAULT, a tree room and a vaultbreaker": 2 s of looking at the map plane, using a raycast that already exists for E hovers.
  5. "When round 2 starts, walk out through your hatch. Rooms vote ONE door each round.": done on the first step into the arena cell.
- **World arrows**, not HUD arrows: during a step, the target prop gets the existing E-hover glow outline pulsing softly. The guide adds no new geometry.
- **After round 1** the card is gone. The objective line (feature 1) carries on for the rest of the first match, and the new tips fire on events:

| tip | text |
|---|---|
| `panel5` | "Each room picks one door. Vault doors need 2 votes: heists add votes." |
| `tree` | "Tree rooms teach. Knowledge buys perks at any bench." |
| `heist` | "Vaultbreakers move every round. The sign above the door says which one is here." |
| `crown` | "Crown claim adds up across rounds. At the time limit the highest claim wins." |
| `raid` | "Anyone can drain your pump. Upgrades on your Elixir Screen protect it." |
| `death` | "Death loses everything. Home upgrades die with you." |

  Remove the stale `vaultAim` text. Keep the shown-N-times storage (`gk.tips.v1` becomes `v2`, so everyone sees the new tips once).
- **New-player protection in the first match:** the server marks the goblin `nb: 1` (from the join query `n=<matches>`, client-claimed and harmless). Bots are Easy for that match (feature 8). No sends may target his home in round 2, and his home cannot be raided in round 2 (feature 13's raid grace covers this for everyone).

**Implementation.**
- New `guide5.js` (client, about 200 lines, `window.GKGUIDE`): the steps, the tick predicates on messages (`elixir`, `homeRes`, `recycled`/`crafted`, the room change), and the card DOM using the `.sheet` style.
- game.js `TIPS` block: replace the trigger table and texts (TIPS owner).
- server.js: a `GUIDE` line in the join handler to read `n`, and the `nb` flag with the starter junk in `spawn`.
- index.html: 1 script line and the "Replay the guide" button in the TIPS settings block.

**Risks.**
- The length of the home phase: if round 1 is shorter than about 60 s, steps 2-4 get rushed. The guide then shows steps 1, 2 and 5 only (it reads `round.dur`).
- Players who skip it: an "×" on the card ends the guide for good.

**Tests.**
- `tests/guide5.test.js` (pure): each step's predicate against recorded messages; "Replay" resets the steps.
- A live test: a join with `n=0` gets `nb` and the starter junk; `n=5` does not.
- Browser: a fresh profile walks through steps 1-5.

**Bots.** None. Bots never get `nb`.

**Depends on.** The home-only round 1 change (in progress elsewhere). The guide works without it too: the steps simply sit in the first 2 minutes. It also needs feature 1 for the objective line hand-off.

---

### 3. Death recap and a spectator director (M)
**Player problem.** You die and the card says "Killed by Snikt (Spiked Mace)". You don't know whether he was hurt, who else hit you, or what you lost. Then the spectate camera follows the killer, often a bot walking down an empty hall, while the crown fight happens elsewhere.

**Design.**
- **Recap card** (it extends `rsCard`, so there is no new screen):
  - "Killed by **Snikt** (Big, Spiked Mace) · he had **23 / 80 HP** left"
  - a stacked bar of the damage you took in your last 10 s, by source: "Snikt 52 · Rats 6 · Sentry 8"
  - your top damage dealt: "You hit Snikt for 41"
  - "You lost: Claymore, Iron Cuirass, 46 elixir, 12 s crown claim" (at most 4 entries)
  - one **"next time" hint** from a small rule table, for example:
    - "Snikt had a Thorns blessing: melee hurt you too"
    - "You were carrying a sack: you could not fight back"
    - "You were ambushed from the Hollow Oak"
- **Kill-cam: not now** (section 2). The recap gives most of the "what happened" value at a tenth of the cost.
- **Spectator director** (the default, while you are spectating):
  - The camera follows the most interesting living goblin, scored 2 times a second:

    | situation | score |
    |---|---|
    | gaining crown claim | 100 |
    | in a fight in the last 3 s (took or dealt damage) | 60 + damage |
    | channelling a heist | 30 |
    | the killer (first 8 s only) | 50 |

  - It switches at most every 6 s, with a 0.6 s camera ease.
  - Left/Right still cycle manually and pause the director for 20 s. **M** toggles the overview (map) camera.
  - Spectator strip (it replaces the "Spectating X" bar, same place): name, type, HP bar, weapon icon, claim seconds, "Goblins left 4".

**Implementation.**
- server.js `RECAP-BEGIN/END`:
  - `hitTarget` hook: `p.dlog.push({by, name, w, dmg, t})`, a ring buffer of 16; NPC and environment sources are named.
  - `die` hook: builds `{recap:{killer, kHp, kMax, kType, kBless, by:[...], dealt:[...], lost:[...], claim, elixir, hint}}` and sends it before the death message.
  - Hint rules live in a pure `recap5.js` (S).
- game.js `FUN` block: the recap rows in `showDeathScreen` and the director in the spectator camera (FUN owner).
- Spectator HUD rows use data already in snapshots (HP via `pub()`, weapon key, claim via `crown`).

**Risks.**
- Recap honesty: it shows the killer's HP at the moment of the kill, which leaks a little information to the dead player only. Fine.
- The director can be dizzying: hence the 6 s minimum and the manual override.

**Tests.**
- `tests/recap.test.js` (live): 2 humans and a debug kill. The recap has the killer's HP, the damage list sums correctly, lost items equal the drop pile, and `hint` is a known id.
- Pure: `recap5.test.js` (the hint rules) and the director scoring (`director.pick(actors)` in `recap5.js`).

**Bots.** Not applicable (bots don't get recaps). The director treats bots like anyone else.

**Depends on.** Nothing.

---

### 4. Room codex: the H card in the room, and How to Play rewritten for 5x5 (M)
**Player problem.** The room line (feature 1) tells you the next verb. It does not explain a 4-step heist, its risk meter or its token. How to Play still shows the 3x3 door panel.

**Design.**
- **Hold H** (rebindable) inside any special room, home or loot room: a centred card for that room, shown while H is held, with no pointer unlock. It has:
  - the name and colour
  - **3 numbered steps** with key caps (E hold, E tap, R)
  - **Pays** (for example "+3 knowledge per drink, fruit +12")
  - **Risk** (for example "noise ≥ 50: you show on every map; 100: 2 Wardens")
  - **Counter** (what others can do to you)
  - **Token** in and out (heists only)
  - the room's live numbers (your caps used this round, from `actMe`)
- One card per type: 10 trees, 4 heists, the vault, home, Forge, Grand Recycler, merchant, mystery, chest. That is **19 cards**, written once as data.
- **How to Play** becomes 4 short pages:
  1. The goal: the crown claim and last standing, rounds and sudden death.
  2. Doors: one pick per room, the 2-vote vault, heists add votes.
  3. Home: the pump, the Elixir Screen, raids.
  4. Rooms: a grid of the 19 cards, clickable, reusing the same data.
  
  It keeps the existing canvas-drawing style. Skippable, as today.
- **The room line hint:** while you are inside a special room, the line ends with "· H: how" for your first 3 visits to each type.

**Implementation.**
- New `codex5.js` (client, about 350 lines including the 19 card texts as data; `window.GKCODEX`): `card(type, live)` and `howTo()`.
- game.js: the TIPS block calls `GKCODEX.howTo()` instead of the old overlay (TIPS owner, one line), plus one key line (H) in the input block.
- The card texts must be written from the real numbers in `rooms5-trees.js`, `vb5.js`, `vault5.js` and `homebase.js`, and **a test must read the numbers from those modules**, so the cards cannot drift.

**Risks.**
- Text-heavy cards can look AI-made. Keep 3 steps and short lines, use the menu2 type scale, and make the key caps real `.kc` elements.
- Number drift: the test above.

**Tests.** `tests/codex5.test.js`:
- every room type has a card
- every number in a card matches its source module constant
- no card is longer than 9 lines

Browser: hold H in 4 rooms; check the How to Play pages at 1280x720 and at 375 px wide.

**Bots.** None.

**Depends on.** Nothing. It shares the key layer with feature 10 (use `GK.keys` if it has landed, the raw code otherwise).

---

### 5. Parley wheel: proximity quick chat and pings (M)
**Player problem.** The game is built on politics (shared panels, the 2-vote vault, truces at the Spring, betrayal at the Elder seed), but goblins can't talk. The emotes (4-7) are moods, not messages. Free text chat is a moderation burden and clutter.

**Design.**
- **Hold V**, move the mouse toward one of **6 phrases**, and release:

  | phrase | where it shows | extra |
  |---|---|---|
  | **"Truce?"** | speech bubble | bots may accept (below) |
  | **"Vote this door!"** | speech bubble | when you aim at a panel slot, that slot shows your goblin head on the panel for 6 s (panel politics, made visible) |
  | **"Vault!"** | speech bubble | |
  | **"Danger here!"** | speech bubble | a small red ping marker at the aimed floor point, 4 s, and a ping on the minimap of everyone who heard it |
  | **"Thanks"** | speech bubble | |
  | **"Traitor!"** | speech bubble | |

- **Who hears it:** goblins in your room plus rooms 1 open-door hop away, and spectators of those goblins. It is **never global**, so politics stays local and the feed stays clean.
- The bubble reuses the emote bubble sprite (text instead of an emoji, the shared canvas atlas), shown for 2.5 s, with a short "grunt" sound per phrase in audio.js.
- **Limits:** 1 per 2 s, 6 per 30 s. Muted while dead, except toward spectators, who hear each other through the same rule.
- **Mute:** Settings "Parley from others: On / Off".

**Implementation.**
- New `parley.js` (UMD, pure: phrase table, who-hears(m, p), rate limit).
- server.js `PARLEY-BEGIN/END`: `{parley:{n, door?, x?, z?}}` is validated (alive, rate, a door in your room's `ROOM_DOORS`, a ping point inside your room) and relayed as `{parley:{id, n, door, x, z}}`.
- game.js `PARLEY` block: the wheel DOM (6 sectors, a CSS conic background, about 60 lines), the bubble, the panel-slot head (one more draw in the existing `cpBuild` panel canvas), and the minimap ping (hud5 `mapOps` gets a `ping` op).
- audio.js: 6 grunts (procedural, cheap).

**Risks.**
- Spam: the rate limits, and it only travels locally.
- Abuse of "Truce?" against humans is fine. Betrayal is the game.
- The wheel conflicts with mouse-look: while V is held, the look is frozen and the mouse picks the sector (as in most games).

**Tests.**
- `tests/parley.test.js` (live, 3 humans in rooms 0, 1 and far): the near goblin hears it, the far one does not; the rate limit; a door outside your room is refused; a ping outside your room is clamped or refused.
- Pure: who-hears through open and closed doors.

**Bots.**
- **"Truce?"** to a bot: it accepts with probability `0.7 - aggression` (it answers "Thanks", or "Traitor!" if it refuses). An accepted truce means the bot does not pick the speaker as a target for 25 s unless the speaker hits it. A betrayal makes it say "Traitor!" and prefer the speaker as a target for 30 s.
- **"Vote this door!"** from a human in the same room: a bot with no strong plan switches its pick to that door with probability 0.4 (co-op, like bots5 co-op votes).
- Bots send "Vault!" when they complete a co-op vault vote, and "Thanks" after a truce.
- A tiny `botParley(m, bot, msg)` lives in the PARLEY block. It sets `b.truce[id] = until`. The BOTS5 target filter reads it with a one-line hook (the BOTS owner applies it).

**Depends on.** Nothing. Feature 8 (bot difficulty) should land first, if possible, so the truce odds can scale with difficulty.

---

### 6. Post-match awards, your match timeline, Play again (M)
**Player problem.** The summary lists the winner, the top killer and the longest survivor. Seven of eight players lose, and for them the match leaves nothing behind. "Requeue" reloads the page and shows the title again.

**Design.**
- **Awards:** at match end the server gives each human **0 to 2 awards** from a table of 12. Each has a threshold, so a weak match gives none (scarcity keeps them meaningful).

  | award | threshold |
  |---|---|
  | Doorkeeper | 3+ of your picks opened doors |
  | Safecracker | 2+ lockpicks or skeleton keys cut |
  | Siege Engineer | 40+ breach dealt |
  | Bagman | 80+ gold carried out of the Counting House |
  | Ritualist | armed the Keystone at a tally |
  | Crown Chaser | 15+ s of claim |
  | Pump Baron | 120+ elixir collected |
  | Raider | 40+ elixir drained from others |
  | Brain Gourmand | 3+ brains eaten |
  | Gambler | won 2 Gambler's Root steps |
  | Spoiler | 3+ sabotages (snuff, slack, jiggle, counter-writ) |
  | Last Stand | survived 30 s below 10 % HP |

  The best one shows on the summary, under your place. Others see it on the standings rows ("#3 Snikt · Siege Engineer").
- **Your match strip:** one row of 7 round cells, each with up to 2 icons (heist, tree, kill, vault entered, death ☠). It is built from server stats, so it has no new tracking cost beyond the counters.
- **Play again:** the summary and death card buttons become **Play again** (primary) and Main menu. Play again reloads with `?autoq=1&c=<charId>`, which skips the title and queues at once. **An in-page rematch is not done** (every match exit reloads by design; QUALITY-PLAN 4.5). The icon cache (iconworker) already makes the reload cheaper.

**Implementation.**
- New `awards5.js` (UMD, pure): the counter names, the thresholds and `pick(stats) -> [ids]`.
- server.js `AWARDS-BEGIN/END`: `p.st = {}` counters, incremented by one-line hooks in the existing blocks (`vaultVotes` result, `act5` award log `m.actLog` already exists, elixir collect/leech, eatBrain, the sabotage verbs). `matchEnd.places[i]` gains `aw` and `tl`. The death message gains the same for a dead human.
- game.js FUN block: summary rows; menu.js: the `autoq` start path (menu owner, about 15 lines).

**Risks.**
- Counter hooks spread over blocks owned by others. Mitigation: a single `AW.inc(p, key, n)` helper and one-line calls only.
- Threshold tuning: telemetry (feature 14) records award rates. Target: about 40 % of humans get at least 1.

**Tests.**
- `awards5.test.js` (pure thresholds and the at-most-2 rule).
- `tests/awards-live.test.js`: a debug match where a human scoops a coffer and eats a brain, ends with `aw` present.
- `?autoq=1` lands in the queue (qa-ui-static grep plus a browser check).

**Bots.** Bots earn awards too, shown on the standings, which makes them look like players. No change to bot behaviour.

**Depends on.** Nothing. Feature 11 (XP) reads the awards.

---

### 7. Private match code (play with friends), with host options (M)
**Player problem.** The queue groups by victory count and fills with bots after 15 s. Two friends who press Start together almost never land in the same match. For a social FFA this is the biggest retention lever, and it needs no accounts.

**Design.**
- Start screen: **Play** (as today) and **With friends**. With friends opens a small sheet with two choices:
  - **Create:** a 4-letter code (no vowels, so no rude words), shown large, with "Copy link" (`/?join=KRTV`).
  - **Join:** type the code.
- **The lobby is the wheel screen**, showing the joined names (up to 8). The host gets **Start now** (bots fill the rest) and 3 options:
  - **Bots:** Easy / Normal / Hard
  - **Rounds:** 90 s / 120 s
  - **Event:** none / one of feature 15 (once that exists)
- The lobby expires after 10 minutes idle. If the host leaves, the next player becomes the host.
- **Rematch:** after a private match, Play again (feature 6) re-joins the same code. The code lives for 5 minutes after the match ends.
- Private matches **count for nothing ranked**: victories still save to the character (it is your goblin), but the victory-count matchmaking bucket ignores them. **(owner?)**

**Implementation.**
- server.js matchmaking (the MATCH/queue code, its owner): `lobbies: Map(code -> {host, members, opts, t})`. The messages are `{lobby:{create}}`, `{lobby:{join:code}}`, `{lobby:{start, opts}}`, `{lobby:{leave}}`, with replies `{lobbyS:{code, members, host, opts}}`. A started lobby becomes a normal match through the existing `newMatch` and `fillBots` (they get the `opts`). Rate limit: 3 creates per minute per IP, plus the existing caps.
- menu.js: the With friends sheet and `?join=` (menu owner).
- game.js MATCH block: the lobby state on the wheel screen.

**Risks.**
- Security: the codes are guessable (21^4 = 194k). That is fine for private play; joining a stranger's lobby is harmless. Members are capped at 8, and the existing per-IP caps apply.
- Queue code is delicate: keep the public path untouched, and add the lobby as a separate branch before the public queue.

**Tests.** `tests/lobby.test.js`:
- create, join, start: the match holds both humans plus 6 bots with `opts` applied
- a wrong code is refused
- host hand-over on leave
- expiry
- the public queue is unaffected (the existing matchmaking tests stay green)

**Bots.** They fill a lobby, with the host's difficulty (feature 8).

**Depends on.** Feature 8 for the difficulty option (until then the option is hidden).

---

### 8. Bot difficulty, new-player bots, AFK takeover (M)
**Player problem.**
- A newcomer is hunted by bots that orbit, strafe and use heists well. Experts find Normal bots soft late.
- An AFK human in a match is a free brain for the first passer-by, and a stall for the rest.

**Design.**
- **Three bot profiles**, as one table of parameters (no new code paths):

  | profile | notice delay | deliberate misses | timing-press skill | sends / raids | heist tokens | sabotage share |
  |---|---|---|---|---|---|---|
  | Easy | 1.2 s | 45 % | 0.25 | never | no | 0 |
  | Normal (today) | 0.7 s | 30 % | personality | today | today | 22 % |
  | Hard | 0.45 s | 15 % | 0.8 | yes | yes | 30 % |

- **Who gets which:**
  - Public matches use Normal.
  - A match that contains a human with `nb` (feature 2; fewer than 3 matches played) uses **Easy for the bots in his 2-hop neighbourhood at GO**. That is 3-4 bots, so the match still feels alive and the newcomer is not farmed in his first minutes.
  - Private lobbies use the host's choice.
- **AFK takeover:**
  - A human with no input for 45 s after round 1 gets a toast: "Still there? A bot takes over in 30 s".
  - At 75 s a **bot pilots his goblin** (Normal profile, same items, same home).
  - Any key gives control back at once (with a 1 s grace, so a key pressed while alt-tabbed does not snap).
  - A win by a piloted goblin still counts if the human is back in control at the end. Otherwise the summary says "won on autopilot" and no victory is credited **(owner?)**.
  - The disconnect grace (15 s) stays frozen, as today. Takeover is only for a connected but idle goblin.

**Implementation.**
- server.js BOTS / AI / BOTS5 (the BOTS owner only):
  - `BOTLVL-BEGIN/END`: the profile table, `b.lvl`, reads at the 6 parameter sites (one-line each)
  - `AFK-BEGIN/END`: `p.lastIn` set in the input handler; the tick check; `p.pilot = true` makes `botThink` run on a human record (bots already run on the same player shape; the only difference is the `ws` for messages, which stays attached)
- The Easy neighbourhood is assigned in `fillBots` using `WORLD` door hops from the `nb` human's home.

**Risks.**
- Running the bot brain on a human record: inventory and messages flow to the real socket, and the server-authoritative movement path is the same. Test it hard.
- Easy bots near a newcomer could be farmed by an expert who notices. Low stakes.

**Tests.**
- `tests/botlvl.test.js`: profile parameters applied (notice delay measured in the lab hook `{bot5:{goal}}`); a `nb` human gets Easy neighbours only.
- `tests/afk.test.js`: idle 45 s gives the toast; at 75 s the goblin moves (pilot); an input gives control back; a pilot win is flagged.

Use short debug timers (`GK_AFK_MS`) under `GK_DEBUG`.

**Bots.** This item is bot support.

**Depends on.** Nothing. Features 2 and 7 read it.

---

### 9. Threat readability: status strip, damage colours, sound captions (M)
**Player problem.** Many states hit you silently:
- Bell-revealed (you are on everyone's map)
- gassed
- rooted by a snare
- slowed by a spike
- carrying (no attacks)
- a blessing, and how long it lasts
- marked (feature 13)

The damage numbers look the same whether the hit came from a Sentry, Thorns, a Warden or venting. Deaf and hard-of-hearing players miss the Ram, the rats telegraph and footsteps behind them.

**Design.**
- **Status strip:** at most 4 small icons (20 px, glyph plus a thin timer ring) attached to the right edge of the existing HP card. It is **empty most of the time**. Order: danger first (revealed, gassed, rooted/slowed, marked), then carry, then blessings. A tooltip-free design: each icon has a 1-word label under it for its first 3 appearances, then only the glyph.
- **Damage number colours:**

  | colour | meaning |
  |---|---|
  | white | normal |
  | gold | backstab or ambush multiplier |
  | violet | staff bolt |
  | grey | environment (vent, gas, spike, sentry) |
  | green | heals |

  The server already knows the source. `hits` gains a 1-char `k`.
- **Sound captions** (Settings, default **off**, independent of the other Access settings):
  - bottom-right, at most 3 lines, 3 s each, with a direction arrow: "◀ Footsteps", "▲ Ram strike (N vault door)", "Rats incoming (sender: Snikt)", "Crown alarm"
  - they come from a caption table keyed by the `GKAUDIO.play` name (about 40 entries); unlisted sounds are not captioned
  - positional sounds give the arrow relative to the camera yaw

**Implementation.**
- New `status5.js` (client DOM, about 150 lines): `set(id, until, tier?)`, fed by the existing message handlers (`homeFx`, `actMe.bless`, `actMe.carry`, snare/spike `homeToast`, bell).
- audio.js: a `onPlay(cb)` hook (one line in `play`); the caption table lives in `status5.js`.
- server.js COMBAT `hitTarget`: the `k` code (one line, COMBAT owner); game.js: the damage-number colour (one line).

**Risks.**
- Clutter: hard cap of 4 icons, empty by default, captions off by default.
- Caption spam: a per-name rate gate (the same as audio's).

**Tests.**
- `tests/status5.test.js` (pure part: ordering, cap, expiry).
- A caption table test: every caption key exists in `GKAUDIO`'s name list (audio.test already enumerates them).
- Browser: a snare and gas in a debug match, with the strip visible.

**Bots.** None.

**Depends on.** Nothing. Feature 13 adds the Marked icon.

---

### 10. Accessibility and controls: remap, hold/toggle, colour-blind, UI scale, reduce flashes (M)
**Player problem.**
- Keys are hard-coded across game.js, act5ui and feel.js.
- Channels need E **held** for up to 20 s (Elder stones), which is painful and an accessibility barrier.
- Tier colours, vaultbreaker colours and the timing window rely on hue alone.
- Text can't be scaled.
- The crown alarm edge tint and the hit flashes can't be calmed.

**Design.** A new Settings section **"Access"** (in the existing grid, menu2 style):
- **Key bindings:** a list of about 20 actions with click-to-rebind (move, sprint, jump, attack, E, R, Q, H, V, the quick slots 1-3, emotes 4-7, inventory, map M, scoreboard, fullscreen). Reset per row and Reset all. Conflicts are shown in red and swap on confirm.
- **Channels: Hold / Toggle** (default Hold). Toggle: one E press starts a hold-verb (the client sends `use`); the next press, a hit or leaving sends `stop`. The server already has `stop`, so this is **client only**.
- **Colour vision:** Off / Deuteranopia / Protanopia / Tritanopia. This swaps one palette table, `GKPAL`, used by the tier frames, map icons, the timing window, HP and damage colours. Every coloured map icon already has a glyph; tier frames add a pip count (I to V) so tier never relies on hue alone.
- **UI scale:** 90-140 % (one CSS variable that hud5, the HUD and the panels read).
- **Reduce flashes and motion:** a static alarm edge (no pulse), no camera kick or shake, a softer hit flash. Head bob already has its own setting.
- **Controller: not now** (section 2). Write down the feasibility instead: the Gamepad API covers movement and look in about 150 lines, but the inventory drag, panels and Elixir Screen are mouse UIs. Real support needs a focus-navigation layer over every panel (L).

**Implementation.**
- New `access.js` (`window.GKACCESS`): settings storage (`gk.access.v1`), the `GK.keys` action map (`GK.keys.is(e, 'interact')`), the palette tables and the scale variable.
- The call sites change from `e.code === 'KeyE'` to `GK.keys.is(e, 'interact')`. That is a mechanical edit across about 30 sites. **One agent does it in one pass** and announces a short freeze of the input lines.
- index.html: the Access section rows (settings owner).
- act5ui.js: the toggle mode. hud5.js and the minimap: read `GKPAL`.

**Risks.**
- The mechanical key edit touches many blocks. Mitigation: the freeze, a grep test that bans new raw `e.code ===` comparisons outside access.js, and tests that press keys through `GK.keys`.
- The palettes must be checked with a simulator (the Chrome DevTools vision deficiency emulation).

**Tests.**
- `tests/access.test.js`: rebinding round-trips, conflict detection, defaults equal today's keys.
- The qa-ui-static grep: no raw key codes outside access.js and the allow-list.
- Browser: Toggle mode on an Elder stone; the 3 palettes captured with DevTools emulation.

**Bots.** None.

**Depends on.** Nothing. Features 4 and 5 use `GK.keys` when it exists.

---

### 11. Account level and cosmetics: signed XP, home banners, skin tints, titles (M)
**Player problem.** Death loses everything, and only wins persist. Most players win rarely, so 7 matches out of 8 give nothing to come back for.

**Design.**
- **Account XP is computed by the server** at death or match end:

  | source | XP |
  |---|---|
  | base | 20 |
  | per minute alive | 3 |
  | per kill | 10 |
  | activity loops completed (the `award` log) | 5 each, capped at 40 |
  | per award (feature 6) | 15 |
  | place | #1 100, #2-3 40 |

  The server returns it signed (the existing `GK_SECRET` HMAC, like `ctoken`), so the level shown to others is earned. Level n needs `100 + 25n` XP, for about 30 levels in the first year of play.
- **Unlocks, all cosmetic, one every level:**

  | unlock | what it is | count |
  |---|---|---|
  | Home banner patterns and colours | the hatch banner already exists and is painted per match; every goblin who passes your home sees it | 12 |
  | Goblin skin tints | from an ART.md-approved list: moss, ash, bog, ember, frost, dusk; a hue shift on the shared skin material (a uniform, no clone) | 6 |
  | Titles | shown on the scoreboard and the recap ("Snikt the Ratcatcher"), **not** in the kill feed or the world | 10 |
  | Emote 5 to 8 | new poses (dance 2, bow, scratch, sleep) | 4 |

  The cosmetics are equipped on the Characters screen (a new "Look" tab).
- **No pay-to-win, and no paid anything.** An unlock never touches stats, items or matchmaking.

**Implementation.**
- server.js `PROFILE-BEGIN/END`: `xpFor(p, m)` (pure in `profile5.js`), the signed `ptoken {xp, lvl}` in `matchEnd` and in the death message.
- Join: `cos=<banner,tint,title>` plus `ptoken`. The server checks each cosmetic against the level in the verified token, falls back to the default if invalid, and puts it in `pub()` (3 small fields).
- New `profile.js` (client): the `gk.profile.v1` storage (xp, ptoken, equipped), the Look tab, and the level-up toast on the summary.
- The skin tint uses GOBLINART's shared skin material with one uniform per goblin (the GOBLINART owner adds the uniform). The banner pattern uses the rooms5art-home banner canvas (its owner adds a pattern argument).

**Risks.**
- Grind and clutter: titles stay off the world and off the feed.
- Token loss: clearing localStorage loses the profile. That is the same as characters today. The signed token is portable through Settings "Export profile" (a copyable string).
- A per-goblin tint uniform touches the goblin shader. It must not clone materials (perf).

**Tests.**
- `profile5.test.js` (the XP formula, the level curve).
- `tests/profile-live.test.js`: a forged `cos` above the level is refused, a valid one appears in `pub()`, and the ptoken survives a second match.
- Browser: the banner and the tint in a match.

**Bots.** Bots get random cosmetics weighted to low levels, so humans and bots look alike (immersion rule: bots are never tagged in the world).

**Depends on.** Feature 6 (awards feed the XP).

---

### 12. Achievements, match history, daily challenges (M)
**Player problem.** The game has 15 activity rooms that most players never try, because the first ones they find are enough. Nothing records their history either.

**Design.**
- **24 achievements**, each a one-line goal that teaches a room or a play style. Examples:
  - Break a vault door with the Ram
  - Rob the Counting House and walk out with 3 sacks
  - Wake the Elder Tree
  - Win a match on crown claim
  - Win as a Small goblin
  - Survive a raid on your home
  - Leech a pump
  - Ride the Gambler's Root 3 steps
  - Finish a 7-lantern Memory sequence
  
  Each gives 50 XP once. A small toast ("Achievement: Siege Engineer") is the only in-match signal. The list sits in the Characters screen with the done ones in gold.
- **Daily challenges:** 3 per day, drawn by date seed from the same predicate table (so everyone has the same three that day). Each pays 40 XP, and each can be done in one match. One of the three always points at a room type the player has used least (from history).
- **Match history:** the last 25 matches. Each row has the date, goblin, place, kills, rounds, how it ended (crown / last standing / time limit), killer, best item and awards. It is a "History" tab next to Characters. A click shows that match's timeline strip (feature 6).

**Implementation.**
- New `achieve5.js` (UMD, pure): predicates over the server's per-player stats (`p.st`, feature 6) plus the `m.actLog` events. The server evaluates them (in the PROFILE block) and sends `{ach:[id]}` as earned, signing them into the ptoken bitset.
- The daily seed is the UTC date. The server picks the three and validates completion; the client shows them on the title screen (a small "Today" card, menu owner).
- History: `profile.js` stores each `matchEnd` and death message.

**Risks.**
- An achievement that needs griefing: none is allowed to target a specific player, or to need a specific number of deaths.
- Clutter: one toast per achievement at most. Dailies are visible on the title screen only.

**Tests.**
- `achieve5.test.js` (each predicate on a synthetic stat set; the date seed is stable and gives 3 distinct picks).
- A live test: a debug coffer scoop completes "Vault Scoop" and sends `ach`.

**Bots.** Not applicable.

**Depends on.** Features 6 (stats counters) and 11 (XP, ptoken).

---

### 13. Leader's mark, scrounger stipend, raid grace (S)
**Player problem.**
- Snowballing: the early leader with 3 kills and tier 3 gear hides in his home with a Sentry.
- Newcomers get their pump drained in round 2.
- The kill bounty (PACE) rewards killing the leader, but nobody can find him.

**Design.** Three small rules, each one constant:
- **Leader's mark** (from round 3, outside the home phase): the living goblin with the highest `score = kills*2 + claim/10 + gearTier` is Marked. All goblins see his position as a minimap ping for 2 s every 30 s, and his kill bounty gets +40 gold. He sees the status icon "Marked" (feature 9). Ties mean no mark. A minimum lead of 2 points is required, so the mark goes only to a real leader.
- **Scrounger stipend:** the 3 living goblins with the lowest gear tier get +10 gold extra at each round start (silent, with no HUD). This is income, not stats.
- **Raid grace:** no non-owner can enter a home before round 3 starts, and no sends may target a home before round 3. The hatch shows its "locked" banner art. That gives a new player a full round out in the world before his base is at risk.

**Implementation.**
- server.js PACE block (its owner): `markTick` and the stipend in the round start.
- HOME block: the round check in `hatchOk` and `checkSend` (2 one-line edits, HOME owner).
- hud5 `mapOps`: a `mark` ping op.

**Risks.**
- The mark gives info to everyone, which helps experts more than newcomers. Watch it in telemetry (feature 14). It is behind `GK_RULES=-mark` to switch off.
- Raid grace changes a rule in PLAN-5x5 1.8 **(owner?)**.

**Tests.** `tests/pace5.test.js`:
- the mark is chosen and pinged on the 30 s cadence; no mark on a tie
- the stipend goes to the bottom 3
- raid grace: the hatch is refused for a non-owner in round 2 and allowed in round 3
- a send to a home in round 2 is refused and refunded

**Bots.**
- Bots weigh the Marked goblin +3 as a target when their HP is above 60 %.
- A Marked bot plays cautious (it retreats earlier).
- Raid grace is already respected through `hatchOk` in `bfsPath`.

**Depends on.** Feature 9 for the icon (optional).

---

### 14. Telemetry and client error reports (S)
**Player problem (indirectly).** Every balance number in PLAN-5x5 and PLAN-5x5-rooms is a guess tested on bot sims. The owner has no data from real matches, and client errors in players' browsers are invisible.

**Design.**
- **Match telemetry:** at `endMatch` the server appends one JSON line to `logs/matches.jsonl`. It holds **no names, no IPs, no tokens**:
  - duration and rounds
  - how it ended, the winner's goblin type, and whether the winner was a bot
  - the human and bot counts
  - per room type: uses and the award totals (from `m.actLog`)
  - the vault-open round
  - sends by kind, elixir collected and spent, upgrades bought
  - deaths per round, the crown claim leader seconds
  - AFK takeovers, the award rate, the new-player count
  
  The file rotates at 5 MB.
- **Client errors:** `window.onerror` and `unhandledrejection` send `{clientErr:{m, src, ln, b}}` (the message cut to 200 characters, the file name only, and a build hash) over the existing socket. At most 3 per session; the server dedupes by message hash per hour and appends to `logs/client-errors.jsonl`.
- **A report tool:** `node tools/telemetry-report.js [days]` prints the tables the owner and balance agents need: room use share, average vault-open round, crown versus last-standing share, award rates, and the top 10 client errors.
- Settings: "Send anonymous error reports" (default **on**; no personal data) **(owner?)**.

**Implementation.**
- New `telemetry.js` (server, pure aggregation plus file append with a size cap).
- server.js `TELEM-BEGIN/END` (the `endMatch` hook and the `clientErr` handler with its rate limit).
- game.js: about 10 lines at the top for the error hooks.
- `tools/telemetry-report.js`; `.gitignore` gets `logs/`.

**Risks.**
- Privacy: no personal fields (a test enforces the key list).
- Disk: the size cap.
- A noisy error flood: per-session and per-hour limits.

**Tests.** `tests/telemetry.test.js`:
- a debug match writes exactly one line with the documented keys only (no `name` or `ip` anywhere)
- `clientErr` is rate-limited and deduped
- rotation at the cap (with a tiny cap under `GK_DEBUG`)

**Bots.** Bot matches log too (with a flag), which gives free sim data.

**Depends on.** Nothing. **Build this in the first wave:** features 6, 8, 13 and 15 are tuned with it.

---

### 15. Arena events (at most one per match) and private-match mutators (M, later)
**Player problem.** After 20 matches the 5x5 loop is familiar. Variety today comes from the rolled trees and loot rooms and the vaultbreaker shuffle. That is good, but quiet.

**Design.**
- **Public matches:** a 30 % chance of **one** event per match, named on the wheel reveal and at GO ("Tonight: ECLIPSE"). It never stacks, and it is never on a player's first 3 matches. The 4 events:

  | event | when | effect | why it is fun |
  |---|---|---|---|
  | **Eclipse** | rounds 3-4 | lamp pool intensities × 0.45 (the same 9 lights, dimmed), emissive ceilings × 0.5, name tags only within 6 m, minimap actors hidden | ambushes, the Hollow Oak shines; no new lights |
  | **Gold Rush** | the whole match | coffers, chest gold and the strongbox interest × 2; merchant prices -20 % | a shopping match, the Counting House booms |
  | **Brain Fever** | the whole match | eaten brains give 10 % knowledge everywhere and +1 extra point | brains become bounties, so fights get bigger |
  | **Flood** | from round 4 | the outer ring floods: -15 % move speed there (one water plane per visible room, culled with it) | pushes everyone inward one round earlier, like a soft vent |

- **Private matches (feature 7):** the host picks any one event, or one mutator:
  - **Quick rounds** (60 s)
  - **No sends**
  - **Crown only** (no last-standing win; the time limit is decided by claim)
  - **Big goblins** (rolls only Big, Hobgoblin and Bog)

**Implementation.**
- New `events5.js` (UMD, pure): the table, the roll, and the multipliers queried through `EV.mul(m, key)`.
- server.js `EVENTS-BEGIN/END`: the roll in `newMatch`, `m.event` in `matchStart`, and one-line `EV.mul` reads at the coffer, chest gold, interest, merchant price, eatBrain and `applyMove` speed sites.
- Client:
  - the light pool reads `GK.state.event` for Eclipse (the light pool owner)
  - the Flood water plane goes into roomart, culled per room
  - hud5 announces the event on the wheel reveal and at GO

**Risks.**
- **Clutter and confusion**, against the owner's "not too much going on". Mitigation: 30 %, one at a time, none for newcomers, and each is a single readable rule.
- Eclipse readability on Low: test at Low and High.
- Balance: telemetry compares event matches against normal ones.

**Tests.** `tests/events5.test.js`:
- the roll rate (100k rolls, 30 % ± 1)
- no event when an `nb` human is present
- each multiplier applied at its site (live debug: `{dbgEvent:'goldrush'}` under `GK_DEBUG` doubles a coffer scoop)
- Flood speed through `applyMove` (the speed-hack check accepts the lower speed)
- the light count stays at 9 + 1 under Eclipse (a browser check)

**Bots.**
- Eclipse: bots get +0.3 s notice delay (they see less too).
- Flood: outer cells score -3 in `pickDest`.
- Gold Rush: vault coffers +2.
- Brain Fever: brains +3.

These are 4 one-line reads of `EV` in botgoals (the BOTS owner).

**Depends on.** Features 7 (private options) and 14 (to measure). Build it last.

---

## 2. Considered and cut (or deferred), honestly

| idea | verdict | why |
|---|---|---|
| **Kill-cam** (the killer's last 3 s) | defer | The client would need a 3 s snapshot history of every actor, a second camera with the killer's view and pose, and replay of the activity props. That is about an L, for value the recap (3) mostly gives. Revisit after the recap if players ask "how did he hit me?". |
| **World boss in the vault** | cut | The vault already has the crown claim, Wardens, coffers, bars, the relic and the treasury. A boss is one more thing in the most crowded room, and it fights the "everyone converges on the claimant" climax. |
| **Seasonal themes** | defer | Later, as banner and skin-tint palettes (feature 11) and one event skin, once there is an audience. It is not a system. |
| **Random bounty target** | folded | The Leader's mark (13) is the bounty, chosen by merit rather than at random. A random target punishes nobody's play. |
| **Controller support** | defer | Feasibility is in 10. Mouse UIs everywhere make it an L for a small PC browser audience. |
| **Localisation scaffolding** | defer | Strings sit in about 12 files as literals. A `t()` pass is an L of mechanical churn across blocks other agents are editing. Do it when the owner targets a non-English audience. The codex (4) keeps its texts as data, which is a good first step. |
| **Settings cloud sync** | cut | There are no accounts. "Export profile" (11) covers moving machines. |
| **Free text chat** | cut | Moderation, clutter, and toxicity in a death-loses-everything game. The parley wheel (5) gives the politics without it. |
| **Friends list / parties with accounts** | cut | The lobby code (7) gives 90 % of it with no account system. |
| **Comeback items** (a revive or second life) | cut | It fights "death loses everything". Second Wind already exists as a perk. |
| **Anti-camping beyond today** | none needed | Venting, the crown alarm, Wardens, pools, heat and the Hollow Oak AFK rule already cover it. Watch telemetry instead. |
| **In-page rematch** (no reload) | defer | QUALITY-PLAN 4.5: every match exit reloads. Making the world rebuildable in-page is a large refactor. Play again with `?autoq=1` (6) is the cheap version. |
| **Spectator free-cam** | cut | The director, manual cycling and the overview (3) are enough. A free-cam in a 41-room map shows empty rooms. |

---

## 3. Recommended build order and task split
Every task owns its files and blocks. Hooks into blocks that other tasks own are **one line**, applied by that block's owner or listed in the merge notes. Model split (memory): Sonnet implements, Opus reviews and merges.

### Wave 1 (start together; no dependencies between them)

| task | features | owns | touches (one-line hooks) | size |
|---|---|---|---|---|
| **W1-A Clarity** | 1, 2 | new `objective5.js`, `guide5.js`; game.js `OBJ` block and the **TIPS block**; `hud5.js` (the objective element) | server.js join line (`n`, `nb`, starter junk) | M+M |
| **W1-B Codex** | 4 | new `codex5.js` | TIPS block: one call (coordinate with W1-A: W1-A leaves `GKCODEX.howTo` wired); the H key line | M |
| **W1-C Death and spectate** | 3 | new `recap5.js`; server.js `RECAP` block; game.js FUN block (death card, spectator) | `hitTarget`, `die` (1 line each) | M |
| **W1-D Telemetry** | 14 | new `telemetry.js`, `tools/telemetry-report.js`; server.js `TELEM` block; the top-of-game.js error hook | `endMatch` (1 line) | S |
| **W1-E Bots and fairness** | 8, 13 | server.js BOTS / AI / BOTS5 (`BOTLVL`, `AFK` sub-blocks), PACE block | HOME `hatchOk` and `checkSend` (2 lines); hud5 `mapOps` mark op (1 line, via W1-A) | M+S |
| **W1-F Access and readability** | 10, 9 | new `access.js`, `status5.js`; the index.html Settings "Access" rows; the mechanical `GK.keys` pass (announce a freeze of the input lines for about 1 hour) | audio.js `onPlay` (1 line); COMBAT `hits.k` (1 line); act5ui toggle mode | M+M |

### Wave 2 (after wave 1 merges)

| task | features | owns | depends on | size |
|---|---|---|---|---|
| **W2-A Parley** | 5 | new `parley.js`; server.js `PARLEY` block; game.js `PARLEY` block; audio grunts | W1-E (truce hook in the bot target filter), W1-F (`GK.keys`) | M |
| **W2-B Awards and Play again** | 6 | new `awards5.js`; server.js `AWARDS` block (`AW.inc` helper); the FUN summary rows; menu.js `autoq` | W1-C (FUN block settled) | M |
| **W2-C Lobby** | 7 | server.js queue/MATCH code (the lobby branch); menu.js With friends; game.js MATCH wheel lobby view | W1-E (bot profiles) | M |

### Wave 3

| task | features | owns | depends on | size |
|---|---|---|---|---|
| **W3-A Profile and cosmetics** | 11, 12 | new `profile5.js`, `achieve5.js`, `profile.js`; server.js `PROFILE` block; the menu.js Look / History / Today views | W2-B (stats and awards); GOBLINART owner adds the tint uniform; rooms5art-home owner adds the banner pattern argument | M+M |
| **W3-B Events** | 15 | new `events5.js`; server.js `EVENTS` block | W2-C (host options), W1-D (measure); light pool and roomart owners add the Eclipse and Flood reads; BOTS owner adds 4 `EV` reads | M |

### Then QA (Opus review)
- 10 bot sims per wave (`tests/sim-fairness.js bots5`) to check that nothing regressed: match length, vault-open round, crown share.
- A browser pass at Low with a fresh profile: the guide, the objective line, a death recap, the H card, parley, Play again.
- `npm test` green.
- One telemetry report from 20 sim matches, attached to the QA report.

**Conflict rules** (added to PLAN-5x5's):
- Only W1-A edits the TIPS block and `hud5.js` in wave 1. Other tasks call `hud5` methods but do not add elements.
- Only W1-E edits BOTS, AI, BOTS5 and PACE in wave 1. W2-A asks for the truce hook through W1-E's merge notes.
- Only W1-F edits raw key handling. After its merge, a test bans new raw key codes.
- The new server blocks (`RECAP`, `TELEM`, `PARLEY`, `AWARDS`, `PROFILE`, `EVENTS`, `BOTLVL`, `AFK`) go after the `ACT5` block, in this order, so merges append rather than interleave.
- Shared message names are fixed here: `recap`, `clientErr`, `parley`, `lobby`, `lobbyS`, `ach`, `ptoken`, `cos`, `event`, `objective` (client-only). Plus the fields `hits.k`, `matchEnd.places[i].aw` / `.tl`, and `pub().cos`.

---

## 4. What "done" looks like for the player
- **First match:** round 1 at home teaches the pump, the screen, the bench and the map in under 2 minutes. From then on one line always says what is worth doing, and H explains any room.
- **Dying** tells you who, how and what you lost. The camera then shows the crown fight, not an empty hall. The summary gives you an award and XP, and Play again puts you straight back in the queue.
- **With friends:** a 4-letter code, Start now, bots on Easy.
- **In a room with strangers:** "Truce?", "Vote this door!" and "Traitor!".
- **Over weeks:** a level, a banner over your home hatch that everyone passes, and today's three challenges, which point you at rooms you never tried.
- **For the owner:** a telemetry report that says which rooms nobody uses and how matches really end.

---

## 5. Open questions for the owner
1. **Home phase:** how long is the home-only round 1? The guide assumes 60 to 120 s. Should new players get one junk weapon at GO so the recycle step always works?
2. **Raid grace:** may homes be closed to raiders and sends until round 3 starts? This changes PLAN-5x5 1.8, where homes are open from GO.
3. **Truce with bots:** may bots accept a "Truce?" for 25 s? It makes the parley wheel useful in bot-heavy matches.
4. **AFK takeover:** may a bot pilot an idle human's goblin after 75 s? Should a win "on autopilot" give no victory?
5. **Private matches:** should their victories count on the character (they do in this plan) but not for victory-count matchmaking?
6. **Telemetry:** may anonymous match stats and client error reports be on by default (no names, IPs or tokens; a Settings toggle)?
7. **Public events:** a 30 % chance of one event per public match, or private matches only?
8. **Leader's mark:** should the leader be pinged on everyone's minimap every 30 s from round 3?
9. **Cosmetic titles:** scoreboard and recap only (this plan), or also over the head in the world?

---

## 6. Decisions (the owner said "add features as you see best fit"; these are the coordinator's defaults, 2026-10-17)

1. Home phase is round 1 at the standard 120 s; every player gets one junk weapon at GO so the recycle step always works.
2. Raid grace: homes (and sends against them) are closed until round 3 starts. Round 1 is already home-only (closed to everyone); this extends protection through round 2 for sends and raids. Update PLAN-5x5 section 1.8 accordingly.
3. Bots may accept a "Truce?" for 25 s.
4. AFK takeover after 75 s of no input; a win on autopilot gives no victory count.
5. Private match victories count on the character but not for victory-count matchmaking.
6. Telemetry (anonymous match stats and client errors; no names, IPs or tokens) is on by default with a Settings toggle.
7. Public events: 30% chance of at most one event per public match.
8. Leader's mark: pinged on everyone's minimap every 30 s from round 3.
9. Cosmetic titles show on the scoreboard and recap only.

Build order: wave 1 (W1-A to W1-F) starts after the in-flight work (home phase, 20 attached rooms, fullscreen, stats, codex, perf, art passes) has merged, to avoid conflict storms in server.js and game.js.

# Research: the whole game, aspect by aspect

Written 2026-10-17 (Opus). Based on main at `a55ba4a`. I read CLAUDE.md, MAP.md, PLAN-fun.md, PLAN-improvements-2.md, RESEARCH-perf.md,
RESEARCH-tooling.md and the area reports. The repo numbers come from greps and `npm run symbols`. The external sources are listed at the end.
Most web sources are secondary write-ups, because GDC Vault pages are members-only. Where a claim rests on one blog, I say so.

How to read the tables:
- **Impact** is the fun or quality gained per player-hour: H, M or L.
- **Cost** is S (under half a day), M (1-2 days) or L (3 days or more).
- **Busy** means another agent owns that area right now: bots use-everything, combat block/parry/stamina, base-room activities,
  arena visual polish, camera terminal, UI/inventory/pause menu, publish readiness round 2 (onboarding, moderation), rare items, menu wheel host.
- **Done here** means I built it on this branch (section 15). Everything else is a recommendation.

---

## 1. Game feel and juice
**What the best games do.**
- Jonasson and Purho's "Juice it or lose it" (GDC 2012) turns a dull Breakout into a fun one only by adding flash, shake, tweens, sound and particles.
- A 2022 IEEE study of impact feel (Lin et al.) ranks three features highest: **hit-stop, sound coherence and camera control**. I saw it via a summary only.
- Folmer Kelly's counter-talk warns that juice for its own sake costs readability.

**What Goblin King does now.** It is already strong here:
- COMBAT4 has per-weapon hit-stop, kick and shake, contact-frame prediction, pooled damage numbers and stagger.
- FEEL2 has a directional damage arc and a hit marker.
- T15 has pooled VFX. audio-feel adds family-matched swing and hit sounds layered with armour materials.

**What is missing:** the moment of a **kill** and of a **multi-kill** gets the same treatment as any hit, and the mix never makes room for the big moment.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 1.1 | Kill-streak and multi-kill callouts in the feed (Double kill, ended X's streak) | M | S | **done here** |
| 1.2 | Audio ducking on big moments (death, gong, crown, GO) so the key sound reads | M | S | **done here** |
| 1.3 | A "final blow" emphasis: slightly longer hit-stop and a low thump on a killing hit | M | S | recommend (COMBAT4 owner) |
| 1.4 | Per-weapon screen-shake budget audit (shake stacks during gang fights) | L | S | recommend (busy: combat) |

## 2. Onboarding and retention
**What the best games do.**
- **Fall Guys** reportedly put brand-new players into bot-heavy lobbies for their first matches (Prima Games; fan wiki on SBMM buckets).
- **Hades** makes death part of the progression: you return home and the world reacts (Kasavin, GDC podcast; AV Club).
- **Vampire Survivors** shows every unlock condition openly, which gives the player a goal before each run (Superjump; J. Boger).

**What Goblin King does now.** PLAN-fun wave 1 (objective line, guide, recap, codex) is mostly not built yet. The onboarding part is booked by publish readiness round 2.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 2.1 | Death leaves something behind: a recap that teaches (see section 12) | H | M | **done here** (recap, tips) |
| 2.2 | Visible goals before the next run: daily challenges on the death and summary cards | M | S-M | **done here** |
| 2.3 | First 3 matches: easier bots and a smaller gang cap (FAIR `MAX_GANG` 2 to 1) | H | S | recommend (busy: bots) |
| 2.4 | Guided home round, objective line | H | M | busy (publish readiness) |

## 3. Multiplayer netcode and fairness
**What the best games do.**
- **Valve Source** uses snapshot interpolation with roughly a 100 ms default lerp, and lag compensation that rewinds about 1 s of player history. The server knows each client's interpolation delay.
- **Overwatch** (Ford, GDC 2017) is server-authoritative with prediction. Ford's stated goal was to be "shot around corners less".
- **Riot** ran VALORANT at 128 tick so that defenders can react, which limits peeker's advantage. Their stated target is under 35 ms ping for most players.
- Good games show **network warning icons** (latency, loss, stall) when there is a problem, and hide them otherwise.

**What Goblin King does now.** The netcode follows the Valve model closely:
- 20 Hz snapshots, an adaptive delay of 70-150 ms, a 200 ms rewind cap, and server movement validation.

**Gaps:**
- The ping readout is now hidden unless debug or a setting is on (PERF4).
- A player on a bad connection gets no explanation when hits feel wrong.
- There is no stall warning.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 3.1 | Connection warning pip: shows only when ping > 150 ms, jitter > 40 ms or no message for 2.5 s | M | S | **done here** |
| 3.2 | Rewind cap by the measured RTT (cap = min(200, rtt/2 + delay)) so high-ping players do not out-trade | M | S | recommend (busy: combat) |
| 3.3 | Visibility-based interest management (anti-wallhack) | M | M | already planned (improvements-2 #7) |
| 3.4 | Binary snapshots (RESEARCH-perf measured the codec) | L | M | plan exists |

## 4. Bot AI
**What the best games do.**
- **Utility AI** (Dave Mark's Infinite Axis Utility System; "Building a Better Centaur", GDC 2015, Guild Wars 2) scores every action with response curves. This gives believable variety cheaply.
- Fall Guys used bots to protect new players.

**What Goblin King does now.** It already uses utility-style scoring (`botgoals.js`) and has:
- perception and notice time (`BOT_NOTICE` 700 ms) and a 30 % miss rate;
- a gang cap (`MAX_GANG` 2) and personalities.

Bots are **busy** (bots use-everything).

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 4.1 | New-player bot profile (longer notice, more misses) for a player's first 3 matches | H | S | recommend (busy) |
| 4.2 | Bots respect the kill-streak leader: more target weight on a streaker (a natural catch-up) | M | S | recommend (busy) |

## 5. Economy and progression
**What the best games do.**
- **Mario Kart** has two catch-up levers: AI pace and position-weighted items. Critics say catch-up must not erase the leader's skill (Law of Game Design; Dave Mark on rubber-banding).
- **Tarkov's** "gear fear" (loss aversion) is the core tension, and also the core churn risk.

**What Goblin King does now.**
- PACE pays a bounty of half the victim's gold plus 15 per kill, so beating the leader pays.
- Income is 10 a round. KEEP gives survivors a small consolation.
- Death loses everything.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 5.1 | **Shutdown** callout when a streak ends (the bounty already pays; tell the players it did) | M | S | **done here** (feed) |
| 5.2 | Assist credit: damage dealers within 10 s of a kill are named in the feed | M | S | **done here** |
| 5.3 | Assist gold (a third of the bounty to the top assister) | M | S | recommend (busy: PACE) |
| 5.4 | Gear-fear relief: a "favourite" item that returns to the stash at half durability | M | M | cut (fights the core rule) |

## 6. Level and arena design, and flow
**What the best games do.**
- Battle royales shrink the playable space. Fall Guys narrows the field round by round. The elimination curve is what keeps the end tense.

**What Goblin King does now.**
- Doors open by round and by vote, sudden death comes at round 5 and the crown fight is in the vault.
- GUARD keeps every room escapable.

The art pass is busy (arena visual polish). Telemetry (PLAN-fun #14) is the missing piece: nobody knows which rooms are dead.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 6.1 | Telemetry of room visits and deaths per room | H | S | recommend (publish readiness may own it) |
| 6.2 | Heat-map tool from telemetry (tools/) | M | S | after 6.1 |

## 7. Audio
**What the best games do.**
- **Overwatch** (GDC 2016, Lawlor and Neumann) aims for a game you can "play by sound": a clean mix, cues you can locate, and descriptive voice lines.
- Diablo IV's GDC deep dive and the classic ducking article both describe priority-based **ducking** and per-category voice limits.
- Adaptive music by **vertical layering** fades stems in and out by intensity (Uncharted 2, Dead Space 2, CRI ADX2 tutorial). It is cheap with synthesis.

**What Goblin King does now.**
- Every sound is synthesised in WebAudio. There is a compressor on the master bus and voice caps (60, or 28 for low priority). There are per-sound rate gates, 3D panning with distance lowpass, room beds and ambient zones.
- There is **no music** and no ducking.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 7.1 | Ducking bus: ambience and beds drop under death, gong, victory, GO, the crown and a heavy hit on me | M | S | **done here** |
| 7.2 | Adaptive music, three procedural layers (calm pad, a combat pulse, a tension lead in sudden death, the crown fight and at low HP) | H | M | **done here** (music5.js) |
| 7.3 | Sound captions for off-screen threats (a11y, PLAN-fun #9) | M | M | recommend |

## 8. Visual style and art direction
**What the best games do.** Spelunky, Hades and Brawlhalla keep strong silhouettes and a readable foreground against the background. Brawlhalla puts gameplay readability over detail.

**What Goblin King does now.** Procedural art with no assets, an owner light budget of 9 + 1 lights, and many art passes.

This area is busy (arena visual polish). I only recommend:
- 8.1 Colour-code damage numbers by source (me, ally, enemy) as well as by type. Impact M, cost S. It sits with COMBAT4.
- 8.2 Rim-light a goblin that is streaking (3+ kills). Impact M, cost S. It needs GOBLINART.

## 9. Accessibility
**What the best games do.**
- The Game Accessibility Guidelines name the four most common complaints: **remapping, text size, colour-blindness and subtitles**.
- Their basic tier includes no information by colour alone, readable text, avoiding flicker, and options to turn off shake and blur.

**What Goblin King does now.**
- It has a UI scale, FOV, sensitivity, invert-Y, head-bob, mute, a graphics preset and dynamic resolution.
- It has no remap, no reduce-flash or shake option, and no colour-blind palette.
- The ping colours (green, yellow, red) carry meaning by colour only.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 9.1 | Connection pip says "High ping 212 ms" in words, not only in colour | L | S | **done here** (with 3.1) |
| 9.2 | Reduce shake and flashes toggle | M | S | recommend (busy: pause menu owns Settings) |
| 9.3 | Remap and hold/toggle (PLAN-fun #10) | H | M | recommend |

## 10. Menu UX
This area is busy (UI, inventory, pause menu, menu wheel host). From the research, I would add only one thing: the **Play again** button should keep the same
goblin and requeue in one click (Fall Guys and Apex both requeue from the results screen). REQUEUE already does this.

## 11. Replayability and variety
**What the best games do.**
- **Spelunky's** Daily Challenge gives everyone the same seed with one attempt, and a leaderboard by score. The Ludite's critique points out that people can watch someone else's run first.
- **Deep Rock Galactic** has a weekly seeded Deep Dive and two weekly assignments that are the same for everyone, with one-time rewards. The developers credited Deep Dives and overclocks with higher retention (AV Club interview).

**What Goblin King does now.** Mutators, affixes, four new enemy types, mystery rooms and halls. That is a lot of content variety, but no **daily goal** pulls a player back.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 11.1 | Daily challenges: 3 per UTC day from a date seed, the same for everyone, checked against the stat blocks the server already sends | M | S-M | **done here** (daily5.js) |
| 11.2 | Weekly seeded "special match": a fixed mutator and layout seed for all public matches on a weekday | M | M | recommend (needs the seeded RNG, improvements-2 #5) |

## 12. Anti-frustration for newcomers
**What the best games do.**
- **League of Legends'** death recap (patch 9.14) shows damage taken from up to 5 sources, with the killer highlighted. Players use it to learn who is dangerous.
- Hades turns a death into information.

**What Goblin King does now.** The death card says "Killed by X (weapon)" and lists what you dropped. It does not say **how**: who else hurt you, from behind, bleed, a heavy blow, a gang.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 12.1 | Death recap: damage taken in your last 12 s by source (name, weapon, hits, total), the killer marked | H | S-M | **done here** |
| 12.2 | One teaching line from the recap ("2 goblins hit you: back off through a door", "most damage came from behind") | H | S | **done here** |
| 12.3 | Spectator director: auto-follow the goblin who is fighting, not a fixed one | M | S | **done here** |

## 13. Social features
**What the best games do.**
- **Among Us** works because of one forced social moment, the emergency meeting, with limited uses.
- Quick chat or pings, not free text, keep toxicity low.

**What Goblin King does now.** Emotes on keys 4-7. The parley wheel (PLAN-fun #5) is not built. Moderation is busy (publish readiness).

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 13.1 | Parley wheel (Truce?, Vote this door!, Traitor!) | H | M | recommend (needs W1-E truce hook in bots, busy) |
| 13.2 | Highlights on the summary card (most damage, assists, best streak) so players talk about the match | M | S | **done here** |

## 14. Live ops without monetisation
**What the best games do.**
- Deep Rock's weekly cadence, Spelunky's dailies, and cosmetics earned by play (Vampire Survivors' open unlock list).

**What Goblin King does now.** It has lifetime stats (statsui), victories on saved characters and the stash. It has no daily or weekly content and no cosmetic unlocks.

| # | Recommendation | Impact | Cost | Status |
|---|---|---|---|---|
| 14.1 | Daily challenges with a streak counter (consecutive days with all 3 done) | M | S | **done here** |
| 14.2 | Cosmetic titles from challenge streaks (PLAN-fun #11) | M | M | recommend, after 14.1 |
| 14.3 | Weekly special match (see 11.2) | M | M | recommend |

---

## 15. What I built (top findings that overlap with nobody)
Ranked by impact over risk. Each is a small change in its own file or tagged block, and each has tests.

| # | Change | Files | Why it was picked |
|---|---|---|---|
| 1 | Death recap with damage by source and a teaching line | `client/recap5.js` (pure, UMD), server.js `RECAP`, game.js `RECAP` hooks | The highest-impact newcomer fix (LoL death recap, Hades) |
| 2 | Assist credit in the kill feed | same | Credit for team play, and a catch-up signal |
| 3 | Kill streaks, multi-kills and shutdowns in the feed | same | Juice for the big moment, and readable bounties |
| 4 | Match highlights on the summary card | same (`awards`) | A story after every match (PLAN-fun #6, lite) |
| 5 | Spectator director | game.js FUN, a small edit | Dead players watch fights, not empty halls |
| 6 | Audio ducking | audio.js `DUCK` | The key cue always reads (Overwatch, Diablo IV) |
| 7 | Adaptive music, three layers | `client/music5.js` | The only big missing audio layer (improvements-2 #11) |
| 8 | Connection warning pip | game.js `NETQ` | Explains bad hits on bad connections, in words |
| 9 | Daily challenges and a streak | `client/daily5.js` | A reason to come back tomorrow (Spelunky, DRG) |

**Researched but not built, and why:**
- New-player bots, the gang cap and the bot streak focus: bots are busy.
- Final-blow hit-stop, the RTT-based rewind cap and the shake audit: combat is busy.
- Reduce flashes, remap and the colour-blind palette: Settings belongs to the pause-menu agent.
- Telemetry and the guided onboarding: publish readiness.
- Assist gold: PACE is a busy block.
- Parley: it needs the truce hook in bots.
- The weekly seeded match: it needs the seeded match RNG.
- Kill-cam: L, as PLAN-fun already says.

## Sources
- Juice it or lose it, summary: https://eastondev.com/blog/en/posts/dev/20260521-game-feedback-feel/ ; https://rpgplayground.com/research-making-a-juicy-game/
- Overwatch Gameplay Architecture and Netcode (Ford, GDC 2017): https://gdcvault.com/play/1024001/-Overwatch-Gameplay-Architecture-and ; https://www.pcgamesn.com/overwatch/overwatch-netcode
- Valve, Source networking: https://developer.valvesoftware.com/wiki/Lag_Compensation ; https://developer.valvesoftware.com/wiki/Interpolation
- Riot, VALORANT's 128-tick servers: https://technology.riotgames.com/node/112
- Fall Guys bots: https://primagames.com/tips/are-there-bots-in-fall-guys-answered ; https://fallguysultimateknockout.fandom.com/wiki/Matchmaking
- Hades and death as story: https://www.avclub.com/hades-makes-dying-fun-as-hell-1845162565 ; https://GamaSutra.com/design/roguelikes-and-narrative-design-with-i-hades-i-creative-director-greg-kasavin
- Vampire Survivors meta: https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors ; https://www.superjumpmagazine.com/looking-back-and-forward-at-the-success-of-vampire-survivors/
- Spelunky Daily Challenge: https://www.shacknews.com/article/80294/spelunky-pc-introduces-daily-challenges ; https://theludite.com/2014/06/23/spelunky-when-scoring-goes-bad/
- Deep Rock Galactic: https://deeprockgalactic.wiki.gg/wiki/Deep_Dive ; https://www.avclub.com/the-future-and-past-of-deep-rock-galactic
- Audio mixing and ducking: https://www.gamedeveloper.com/audio/game-audio-theory-ducking ; https://schedule.gdconf.com/session/diablo-iv-audio-systems-deep-dive-living-audio/899258 ; https://pcgamesn.com/overwatch/overwatch-devs-on-creating-a-game-you-can-play-by-sound-and-announcing-dolby-atmos-support
- Adaptive music: https://en.wikipedia.org/wiki/Adaptive_music ; https://blog.criware.com/?p=2855 ; https://www.gamedeveloper.com/audio/adaptive-music-in-competitive-games
- Accessibility: https://gameaccessibilityguidelines.com/basic/ ; https://gamesforchange.org/studentchallenge/wp-content/uploads/2022/01/Tips_Resources_for-Considering-the-Needs-of-Disabled-Gamers-in-Design.pdf
- Death recap (LoL): https://wiki.leagueoflegends.com/en-us/Death_recap
- Utility AI: https://gameai.com/iaus.php ; https://en.wikipedia.org/wiki/Utility_system
- Rubber-banding: https://lawofgamedesign.com/2014/08/25/theory-rubber-bands/ ; https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement
- Tarkov gear fear: https://insider-gaming.com/love-or-hate-extraction-shooters-wild/
- Among Us meetings: https://wikipedia.com/wiki/Amogus

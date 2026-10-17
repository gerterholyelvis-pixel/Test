# Research-game: whole-game research and the top findings built

1. **Research** is in `docs/RESEARCH-game.md`. It covers 14 aspects. For each it gives what the best games do, what Goblin King does now, and ranked recommendations with impact and cost. Sources: GDC talks (Overwatch netcode and audio, Juice it or lose it, utility AI), the Valve and Riot netcode docs, and the Fall Guys, Hades, Vampire Survivors, Spelunky, Deep Rock, Tarkov and Among Us write-ups. Most are secondary, because GDC Vault is gated.

2. **Death recap.** `client/recap5.js` is pure UMD. server.js `RECAP` block, with one-line hooks in hitTarget, sendFeed, die and endMatch. The death card now lists the damage taken in your last 12 s by source (killer marked) and adds one teaching tip: gang, backstab, bleed, heavy blow, high ground or room enemy.

3. **Kill feed.** It shows assist credit (`a`), with `{assist}` sent to the helper and an "Assist" toast. It also shows streaks of 3 or more, double and triple kills, and "ended a N-kill streak".

4. **Match summary.** It gets Highlights: most damage, best streak, most assists, biggest hit (`matchEnd.aw`).

5. **Spectator director.** In the FUN block (game.js), the spectator camera follows whoever is fighting. Pressing ← or → hands control back to the player.

6. **Daily challenges.** `client/daily5.js` picks 3 challenges per UTC day from a date seed, the same for everyone. Progress comes from the existing stat blocks and the placement, with a streak of days and a toast on completion. They show on the death and summary cards.

7. **Audio.**
   - audio.js `DUCK` lowers ambience and music under death, victory, the gong, GO and hits on me.
   - `client/music5.js` adds 3 synthesised music layers: a calm pad, a fight pulse and a tension layer. Tension plays in sudden death, during a crown claim and at low HP. Music follows the Ambient slider and Mute. Turn it off with `?music=0` or `GK.settings.music=false`.

8. **NETQ** (game.js) shows a pip with words only when the connection is bad: "High ping N ms", "Unstable connection" or "Connection stalled".

9. **Tests:**
   - `tests/research-game.test.js` (fast tier, 9 cases) covers the pure modules, audio ducking, music against a stub WebAudio, and the hooks.
   - `tests/recap-server.test.js` (server tier) covers an assist plus a kill, the recap, `{assist}` and the highlights, end to end.
   - test:affected passes. The failures I saw were load flakes (balance3, bots5, goblin-types, elixir-sends): each passed when rerun on its own. act5-trees and utility also fail with main's server.js, so they are not caused by this branch.

10. **Browser check** (my own tab): the feed suffix, the death card, the summary card and the music context all work, with no console errors. The real audio mix was not listened to, and the director was not seen live with bots.

11. **Not built, and why:**
    - New-player bots, the gang cap and bot focus on a streaker: the bots agent owns that area.
    - Final-blow hit-stop and an RTT-based rewind cap: the combat agent owns that area.
    - Assist gold: the PACE block is busy.
    - Telemetry, weekly seeded match and kill-cam: they need telemetry or the seeded RNG first, or cost L.
    - Accessibility, quick chat and onboarding: they landed on main meanwhile (access.js, live.js, onboard.js).

12. **Merger notes.** New files live under `client/`, so they are served without touching CLIENT_JS. index.html gets one script line after the live/access/onboard line. main was already merged in (one index.html conflict, resolved).

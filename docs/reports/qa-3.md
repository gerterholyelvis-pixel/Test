# QA pass 3 (Sonnet worker): real play against bots

Setup: `GK_DEBUG=1 GK_QUEUE_MS=2000` on my own port 3110, headless Chrome (software GL, Low preset, resolution scale 0.3), driven over the DevTools protocol. Two server configs: long rounds (`GK_ROUND_MS=60000 GK_NEXT_ROUND_MS=30000`, sudden death off) for the feature checks, and short rounds (`12000/12000`, `GK_SUDDEN_ROUND=3 GK_MAX_ROUND=6`) for sudden death and the time-limit decision. About eight matches. Debug hooks used only to get gear (`give`), to move (`tp`) and to win (`win`); everything else went through the real client paths (keys, buttons, server messages).

## Fixed (one commit each, on worker-qa)
- `ab04f5b` After a win the "MATCH OVER" standings card opened on top of the VICTORY card (both visible, text overlapping). The standings card is now skipped in win mode and removed if it arrived first.
- `90d4e08` The SPECTATE button, spectate bar, kill feed and match-over card still had the old rounded system-font look next to the new menu screens; restyled with the same square gold buttons and fonts.
- `1631c35` How to Play: the five cards sat in the top half of the screen with a mismatched font; now centred, display and UI fonts, square gold cards, shared button.

## Verified for real
| Feature | Result |
|---|---|
| Queue, wheel, countdown, GO, tips card | ok. Tips seen live: GO, low HP ("Death loses EVERYTHING..."), aiming at the vault entry on a panel, aiming at an outer door, brain drop within 7 m, sudden death. |
| How to Play | opens, five cards, closes (was misplaced, fixed above). |
| Minimap | HUD map and M overlay open/close; fog of war works (only the room I stood in showed its mystery icon); last-round arrows and door colours present in round 2+. |
| Vault relic | pedestal and relic model visible in the vault, prompt "E take the Vault relic: Banded Mail", E moved it into my backpack, feed "<name> seized the Vault relic!". Bots also seize it (feed line in a bot-only match, round 5). |
| Plushie | quick-slot plushie thrown with key 1 (slot emptied). The arc itself was not caught on a frame. |
| Merchant prices | base 130 shows 155 in round 4 and 170 in round 5 (+20% / +30%); the shop panel says "Round 5: prices +30%". |
| Emotes 4-7 | each key sends emote 0-3 (own pose only; other goblins' poses not seen). |
| Reconnect | `GK.social.drop()`: the socket came back inside one second, same round, same weapon, mode play. The "Reconnecting" overlay was too brief to see; the 15 s expiry path was not run. |
| Sudden death | tip, banner ("SUDDEN DEATH, all doors are open, no more healing") and every door open from the round after `GK_SUDDEN_ROUND`. |
| Round-10 decision and standings | with `GK_MAX_ROUND=6` the match ended by the time limit, "Match over, #4 of 8", winner, top killer, longest survivor, full standings. |
| Death after a real kill | card with big result, 3 hero numbers (time, round, kills), details, REQUEUE / MAIN MENU / SPECTATE; spectate works. |
| Win (debug `win`) | victory card plus the turning goblin stage; character saved (Thok, 1 victory, best item Titan's Aegis), Characters screen shows the 3D portrait, victories, "last win just now", best-item icon; stash shows the 5 won items including the plushie. |

## Open issues
| # | Sev | Issue | Repro |
|---|-----|-------|-------|
| 1 | medium | The saved character name and the in-match name differ: after a win the card says "THOK now has 1 victory" while the standings (and kill feed) called the same player "Narg". Players cannot tell they are the same goblin. | win a match, compare the victory card with the standings |
| 2 | medium | Even with Titan's Aegis (300 HP) and a Goblin Slayer I died in round 3-4 of every short-round match (sudden death with every door open, bots converge). Probably intended, but a normal player has no way to survive the endgame. | give yourself the gear, wait for sudden death |
| 3 | low | The death card does not say who killed you ("Killed by ..."); the kill is only in the feed for a few seconds. `info.by` is available. | die to a bot |
| 4 | low | The vault-open tip was never seen; the sudden-death and low-HP tips (higher priority) always won. By design but unverified. | |
| 5 | low | Minimap discovery was only checked for the room I stood in; neighbours seen through open doors were not tested. | |
| info | | Not verified: audio, third-person emote poses, plushie flight and lure on a real bot, reconnect overlay and expiry, vault-open tip, 1920x1080. The prompt element keeps stale text ("Search mystery room") while hidden; invisible, harmless. |

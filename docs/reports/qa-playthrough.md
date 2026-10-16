# QA playthrough (headless Chrome via CDP + node ws)

Played full fast matches (GK_ROUND_MS/GK_NEXT_ROUND_MS/GK_SUDDEN_ROUND), a normal-speed match, offline demo, menus, settings presets, 1080p and 640x360, queue cancel, saved-character play, reconnect (S.net.drop), chest claim, inventory swap, merchant buy, death/spectate/requeue, match-over card, victory card. Console: no errors or warnings in any run.

Fixed
- Victory stage skipped the FEEL tick: the "E Trade/Select" prompt stayed on over the victory card and the victory sound never played (mode change was detected in the skipped tick).
- SUDDEN DEATH tag stayed behind the victory card.
- Menu footer ("Goblin King / multiplayer") overlapped the last menu button (How to play) on windows shorter than ~650 px; hidden below 700 px height.
- How to Play overlay could stay open over the match if the match started while it was open (GK.enter now closes it).

Tests: tests/fuzz.test.js (1500 hostile messages, no crash and no handler exceptions), tests/qa-ui-static.test.js (guards the client fixes).

Not fixed / observations
- Tip card overlaps the "Lobby: n goblins" line at viewport heights near 480 px.
- At 640x360 the HUD panels overlap the round timer (extreme size).
- Death card shows faintly through the Match Over card.
- Bots kill a stationary 60-80 HP player within ~20 s in round 2 (balance, not a bug).
- Not tested: real pointer lock, audio output, real 8-human match.

# Onboarding: contextual tips, How to Play, tip settings

## What changed
- **Tips** (`// TIPS-BEGIN/END` at the end of game.js): one gold-trimmed card at bottom-left, placed just above the bottom-left HUD panels (measured at show time, so it never overlaps them). 7.5 s each, 1.5 s gap, one at a time, soft two-note `tip` chime (new sound in audio.js, played via `GKAUDIO.play('tip')`).
- Triggers (polled every 300 ms while in play): GO (<=20 s after GO), aiming at a vault entry on the panel, aiming at a chest/mystery/merchant entry (outer door), a brain drop within 7 m, HP <= 35%, vault door opens, sudden death banner. Priority: sudden, low HP, vault open, brain, aim, GO.
- Shown at most N times ever (go 3, vaultAim 3, others 2) and once per page load; stored in localStorage `gk.tips.v1` (try/catch, `{on, seen}`).
- **How to Play**: menu button, full-screen overlay with 5 canvas drawings (door panel, vault, outer rooms, brain, death), 1-2 lines each. Skippable: SKIP / CLOSE button, Esc, click on the backdrop.
- **Settings**: "Show tips" checkbox (default on) and "Reset tips" button.
- Small hooks added in game.js where the needed variables live: `GK.tipAim` (after `GK.ROOM_DOORS`), `GK.tipEnv` (after `GK.applyDrops`).
- index.html: three edits inside `<!-- TIPS -->` blocks (menu button, two settings rows). menu.js is untouched (all wiring is in the TIPS block, so the settings rework will not conflict; "Reset defaults" does not reset tips).

## Tested
- `node --check` on game.js and audio.js; `npm test`: all 15 files pass.
- Browser at GK_DEBUG=1 GK_QUEUE_MS=2000 PORT=3190: How to Play opens/closes, GO tip appears above the HUD, no new console errors from the TIPS code (earlier scope errors were fixed).
- Screenshots: `docs/screens/tips-ingame.jpg`, `docs/screens/tips-howto.jpg`.

## Not tested
- Real audio output of the chime, the low-HP, brain, vault-open and sudden triggers in a live match (logic is simple polling, text verified by code only), Reset tips button click, narrow phone layout.
- Mystery-room doors: tip uses the panel entry kind, so it fires on aiming, not on proximity to the door.

# Minimap: HUD minimap + M overlay

Code: `// MINIMAP-BEGIN` ... `// MINIMAP-END` in game.js (just before FUN-BEGIN). Tiny hooks: `a.npc = p.npc` on actor creation, and `#gkFeed` top is now `var(--gkFeedTop,12px)`. Settings: `<!-- MINIMAP -->` block in index.html (two rows), a `// MINIMAP-BEGIN` block + DEFAULTS + one `GK.mmSync` call in menu.js, plus a Controls row for M.

## Behaviour
- Top right at 84 px (under the round timer band, which is centred), 150-220 px wide, gold-trimmed dark parchment panel. The kill feed now sits under it: the minimap writes its bottom edge to `--gkFeedTop`; with the minimap off or outside play the feed returns to top 12 px.
- Content: 3x3 grid and the 12 outer rooms; the vault in gold; chest / mystery / merchant icons only for discovered rooms (stood in it, or in a neighbour with an open door to it; reset when a new layout arrives); doors green open, red closed, gold-brown vault doors, white-blue ring on my room's pick; last round's picks as faint blue arrows in every room (same `lastSel` data as the wall maps); claimed rooms get a green tick; me as an arrow facing my yaw; other goblins (not mystery enemies) only in my room or in a room behind an open door of my room.
- M toggles a large centred overlay (Esc closes). No other keydown handler used `KeyM` (checked game.js x4, menu.js x2, feel.js, audio.js). Ignored while typing in an input.
- Settings: Minimap (show/hide, default on) and Minimap north-up (default on; off = map rotates so facing is up, with an N marker). Persisted in `gk.settings` via menu.js DEFAULTS.
- Hi-DPI: canvas sized by devicePixelRatio (capped 3), parchment background pre-rendered per size. Redraw is a 100 ms timer that hashes player/others/state and skips unchanged frames (at most 10 Hz). Lookups use typed arrays, actors via `forEach` with shared callbacks, no per-draw allocation. No lights.

## Tested
- `node --check` game.js, menu.js, server.js; `npm test` 15 files green.
- Browser, GK_DEBUG=1 GK_QUEUE_MS=2000 PORT=3180: solo match with bots, minimap, M overlay, last-round arrows from real round 2 data, open doors, fog dot of a bot through an open door, rotating mode, feed stacking (injected feed rows). No code errors; only ERR_CONNECTION_REFUSED from page loads while the server was not yet up or after stopping it.
- Discovery icons/ticks in the overlay shot were injected via `GK.minimap.disc` / `GK.claimedRooms` to show them quickly; the discovery logic itself was not walked through in a real match.
- Screens: docs/screens/minimap-hud.jpg (rotating mode, feed stacked), minimap-full.jpg.

## Notes
- The minimap hides on death/spectate (mode `dead`). The worktree needed a node_modules junction to run the server (git-ignored).
- Offline mode (`?offline=1`) has no `lastSel`, so arrows are idle there.

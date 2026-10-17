# Fullscreen, second pass (panels must never cost fullscreen or movement)

## What was really happening
- No game code calls `exitFullscreen` except the explicit toggle, and opening a panel (`exitPointerLock`) does **not** leave fullscreen in Chrome 155: measured over CDP in a headful Chrome window with the game's own fullscreen (`document.fullscreenElement` = `<html>`, window state `fullscreen`), every panel opened with E and closed with E / Tab / close button / click outside stayed fullscreen.
- The panels told the player to close them with **Esc** (`CLOSE (ESC)` on every button, `ESC CLOSE` on the Elixir Screen, `Tab / I / Esc` in the bag; E did not close the bag at all). When keyboard lock is not in force (an `http://` LAN or hosted address has no `navigator.keyboard`, keyboard lock lost after Alt+Tab, other browsers), Chromium keeps that Esc for itself: it **leaves fullscreen and the page never receives the key, so the panel stays open**. Movement is gated on `!invOpen && !shopOpen`, so the player could not move. Reproduced over CDP in headful Chrome by unlocking the keyboard and pressing Esc with the bag open: `fs:false, panel:true` (Esc handling unchanged from HEAD at that point). Headless Edge does not reproduce this one (the page got the Esc there).
- Getting back was tied to fullscreen too: the key that re-took pointer lock required `document.fullscreenElement`, and the re-lock after re-entering fullscreen needed live user activation, which `requestFullscreen` had just consumed. So only a click fixed things ("until they re-enter fullscreen").

## Fix (new `fskeep.js`, wired in `menu.js`; small edits in `game.js`, `homeui.js`, `index.html`, `server.js`)
- Leaving fullscreen with a panel open closes the panel (the Esc the browser kept), so W works at once.
- Lost fullscreen comes back on the very next trusted key or click (W, E, Tab, Space..., never Esc, 250 ms guard); the wish is only given up by F, the button / settings box, or holding Esc.
- Pointer lock comes back on any key once no panel is open, with or without fullscreen; entering fullscreen re-locks without needing a fresh gesture. Movement never depended on pointer lock (kept, and asserted in the test).
- F never leaves fullscreen while a panel is open, and is ignored in text fields.
- E closes every panel including the bag; a click outside the bag closes it; close buttons now read `CLOSE (E)`.
- Keyboard lock (Esc) is re-requested on every fullscreen change and on window focus.
- Pseudo-fullscreen: considered; the canvas already fills the window and nothing in input depends on fullscreen any more, so no extra mode was added.

## Verified
- `tests/fskeep.test.js` (8 cases: retake rules, relock rules, F rules, panel closing on fullscreen loss, wiring).
- `tools/fullscreen-cdp.js` (headful Chrome 155, real GPU, trusted CDP input): bag, workbench, recycler, knowledge tree open/close by E / Tab / Esc / button / click outside, fullscreen and lock kept, player moves and turns after each; forced drop with the bag open, E closes it and restores fullscreen + lock; real Esc with no keyboard lock closes the bag, next W restores fullscreen + lock. PASS.
- Before/after on the HEAD code (headless Edge 155, `GK_ROOT=<export of HEAD>`): with the browser dropping fullscreen while the bag is open, E did not close the bag and the player could not move; with the fix, E closes it, fullscreen and lock return and he moves (headful Chrome).
- `npm test`: everything passes except `bots: bot tick cost < 2 ms`, which also fails on unchanged HEAD on this machine right now (mean 15 ms; the machine is loaded, ~47 browser processes). bots-combat failed once in the full run and passed alone.

## Not verified
- Physical keyboard / mouse in the owner's Chrome: CDP input is not OS input. I did not inject OS-level keys because someone was using this machine's keyboard during the runs (foreign keys showed up in the test window, and the window was minimized once).
- Merchant: the aim never landed on a merchant in the offline demo, so its panel was not opened in a browser (same closeShop / E / close-button path as the stations). The Elixir Screen opened and closed by its button, fullscreen kept, only in the headless Edge run on HEAD code, not in headful Chrome with the fix.
- Why keyboard lock was not active for the owner (origin? browser? Alt+Tab?) is unknown; the fix no longer depends on it.

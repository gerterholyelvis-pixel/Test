# Fullscreen

Blocks marked FULLSCREEN-BEGIN/END in game.js (3 lines: exposes GK.requestLock/GK.lockOk), menu.js (logic) and index.html (CSS, title button, two settings rows, Controls row).

- Switches: Settings "Fullscreen" checkbox, icon button top-right of the title screen (hover state, tooltip, aria-pressed), key **F** during play. F was free (checked all keydown handlers in game.js and menu.js; no KeyF use), so Alt+Enter was not needed.
- `documentElement.requestFullscreen({navigationUI:'hide'})`; `fullscreenchange` (and webkit prefix) syncs checkbox, button icon/tooltip and calls GK.applySettings() (which runs resize(): renderer, composer, camera).
- Pointer lock: the Play click requests fullscreen first, then GK.enter() requests the lock as before. After entering fullscreen in play, if the lock is missing and the page has transient user activation, requestLock is called again. Esc is left to the browser; the lock drops and the existing "Click to resume" shows.
- Setting `fsStart` ("Start in fullscreen on Play", default false) is in menu.js DEFAULTS, persisted in gk.settings, applied in the Enter click handler. The live fullscreen state is not persisted (browsers need a gesture).
- Two rows were added (toggle plus start option), since the spec needs both controls.

Verified: node --check; page loads with no new console errors; with mocked requestFullscreen/exitFullscreen/fullscreenElement: checkbox, button, F key (play only), Esc-style exit sync, option persistence. Screenshot: docs/screens/fullscreen-settings.jpg.

Not verified for real: actual browser fullscreen, pointer lock re-acquire in fullscreen, Esc behaviour, start-in-fullscreen from the Play click, resize on real fullscreen.

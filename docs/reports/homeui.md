# Home UI: Elixir Screen, elixir counter, toasts

Files: `homeui.js` (browser global `GKHOMEUI`, also CommonJS), `tools/preview-homeui.html` (mock state; serve the repo root with any static server, open `/tools/preview-homeui.html?open=1&tab=0|1|2&rich=1&pick=1&toasts=1`), screenshots `docs/screens/homeui-*.jpg`. game.js, server.js, world.js, index.html are untouched. CSS is injected by the file (`#huCss`), uses the existing `--gold*`, `--ui`, `--disp`, `--uis` vars with fallbacks.

## API
`const homeUI = GKHOMEUI.createHomeUI({root: document.body, send: m => net.send(m), onClose: () => {...}, counter: {top, right|left}})` returns `{open(state), close(), update(state), setElixir(n, cap), toast(kind, text), result({ok, reason, text}), isOpen()}`.
Toast kinds: `raid`, `alarm`, `send`, `good`, `info`. `setElixir(null)` hides the counter. Needs `GKHOMEBASE` (homebase.js) loaded first.

## State object
`{elixir, cap:120, tank, tankCap, round, sentRound, distills, distillMax:3, home:{lv:{pump..}, ammo, snareArmed, box:[{name,n}|null], dead}, bag:[{slot,name,n}], active:{roomKey:n}, map:{myRoom, vaultKey, cells:[{key, gx, gy, kind:'arena'|'home'|'vault', label, owner?, dead?}]}}`. `gx,gy` are grid coords (homes sit on the ring around the 5x5, any integer grid works).

## Messages sent (the plan's names, no `type` field, like `net.send({use:id})`)
`{base:{buy:id}}`, `{base:{act:'distill'|'snareRearm'|'sentryAmmo'}}`, `{base:{send:id, room:key}}`, `{lockbox:{take:slot}}`, `{lockbox:{put:slot}}`. The server owns validation; the UI only pre-checks to dim buttons. Crack (`{base:{crack:1}}`) and `{pump:1}` are not UI actions here.

## Wiring (game.js / index.html / server.js)
1. index.html: `<script src="homebase.js"></script><script src="homeui.js"></script>` before game.js; server.js: add `'homebase'`, `'homeui'` (and `elixir`) to `CLIENT_JS` and the CSP hash list if it needs one.
2. After net is created: `const homeUI = GKHOMEUI.createHomeUI({ root: document.body, send: m => net.send(m), onClose: () => { shopOpen = false; } });`
3. On station E at the screen: `if (!shopOpen) { shopOpen = true; keys.clear(); document.exitPointerLock && document.exitPointerLock(); homeUI.open(homeState()); }` where `homeState()` builds the object above from the `{home}` message plus the minimap room list.
4. In the net handler: `if (d.home) { homeState = d.home; homeUI.update(buildState()); }`, `if (d.elixir != null) homeUI.setElixir(d.elixir, 120);`, and for server notices `if (d.homeToast) homeUI.toast(d.homeToast.kind, d.homeToast.text);` (kinds above; "Snik is draining your pump!" is `raid`, "Intruder: Grub" `alarm`, "Rats incoming! Sent by Mog" `send`). Server refusals: `homeUI.result({ok:false, reason:'elixir'})`.
5. Add `#gkHome` to the `#hud,...` hide rules in index.html (line about `body:has(:is(#gkInv,...)[style*="display: flex"])`): the panel uses class `.on`, so use `body:has(#gkHome.on)` instead.

## Notes
- While open, a capture-phase keydown handler swallows game keys (so WASD/E do not reach game.js); Esc closes (calls `onClose`). 1/2/3 switch tabs, arrows move focus (map is a spatial grid), Enter/Space activates.
- The counter sits top right under the fullscreen button; override with the `counter` option if the HUD layout changes.
- No server logic, so no new tests; verified by rendering in headless Edge at 1920x1080, 1024x640 and 500 wide with no console errors.

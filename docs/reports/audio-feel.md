# Audio and feel report

Files: `audio.js` (new), `feel.js` (new), small `FEEL-BEGIN/FEEL-END` blocks in `game.js`, `menu.js`, `index.html`, plus one regex edit in `server.js` (serves `audio.js` and `feel.js`).

## Audio (`window.GKAUDIO`)
- `GKAUDIO.play(name, opts)`; procedural WebAudio only (oscillators, filtered noise, envelopes), no files. The context is created and resumed on the first pointer/key/touch gesture, so nothing plays before that.
- Names: `step, door, vaultDoor, panel, pickup, coins, buy, craft, recycle, invOpen, invClose, uiHover, uiClick, tick, tickLast, gong, eat, deny, hit, hurt, swing, death, victory`.
- `opts`: `x, z` (world position: panned with a StereoPanner and attenuated/lowpassed by distance, skipped beyond 46 m), `vol`, `pitch`, `muffle` (through a wall).
- `GKAUDIO.ambient('room'|'vault'|null)`: low hum; deeper (41 Hz base plus a sub) in the vault. `GKAUDIO.setListener(x, z, yaw)` is fed every frame.
- Combat agent: just call `GKAUDIO.play('swing'|'hit'|'hurt')`. `death` and `victory` already fire when `GK.mode` becomes `dead` / `win`.
- Settings `vol` (master), `sfx`, `amb` (all 0..1) and `bob` (bool) live in `GK.settings`; defaults come from `GK.feelDefaults` (feel.js, loaded before game.js), menu.js extends its `DEFAULTS` with them so they persist in `gk.settings`. Settings screen has Master / Effects / Ambient sliders and a Head bob switch. Reset defaults covers them.
- Wired: own footsteps (timed by distance walked, random pitch, deeper in the vault), other players' footsteps (3D, muffled when in a different room), door and vault door when a door starts opening (3D at the door), panel click on E at a control panel, pickup chime on `claimed` with an item, coins when gold goes up, buy when gold goes down with the shop open, craft, recycle, eat, deny on any `*Fail`, inventory/station panel open and close, tick for the last 5 s (`tickLast` at 1), gong plus banner on round change, UI hover/click in menus (not during play).

## Interaction prompts (feel.js)
One centred prompt under the crosshair (`#gkPrompt`): `E  Select door`, `E  Trade with merchant`, `E  Use recycler`, `E  Use crafting bench`, `E  Loot bag`, `E  Open chest`, `E  Search mystery room` (only for weapon/armour/gold mystery rooms, the ones the server can claim). Claimed rooms (`GK.claimedRooms`, filled from `claimed:{room}` and `claimFail:'taken'`, cleared on a new layout) hide the prompt. The old per-object tips in game.js (`hoverTip`, `lootPromptEl`) are forced hidden so there is no double prompt.

## Offline claim
`makeNet` mock now handles `{claim:1}` like `server.js claim()` (chest key, mystery weapon/armour key, mystery gold, `taken`, `space`, `room`). Reroll clears the claims (`claimedReset`). Tested in `?offline=1` over all 12 rooms: chest, mystery weapon and mystery gold give the item or gold, the prompt disappears, a second E says "Already taken", a full backpack refuses and keeps the prompt.

## Other polish
- Disconnect: `ws.onclose` calls `GK.feel.onClose()`: full-screen "Connection lost" with Reconnect (sets the requeue flag, reloads) and Main menu (reload). Verified by killing the server by PID (`docs/screens/feel-connection-lost.jpg`).
- Head bob: the existing bob is now gated by `GK.settings.bob`; feel.js adds a faint roll sway. Sprint FOV kick: +5 degrees eased in while Shift is held and moving fast.
- Fade: a black dip over the wheel to play switch (`GK.enter` wrapped). Menu to wheel already cross-fades (existing CSS).
- Round banner: slides in from the left (`ROUND 3 · Doors open`, or `Pick a door` on the first round, `The vault stays sealed`, `No doors opened`).
- Map: claimed chest/mystery rooms get a dark overlay and a green tick on every wall map (`GK.redrawMaps()` on each claim).

## Not verified
- I cannot hear: sounds were checked only for no errors, the AudioContext reaching `running`, and the correct `play()` names firing at the right moments; the actual mix and levels are untuned.
- Spatial footsteps/doors: logic only (pan/attenuation maths), not listened to. The banner screenshot caught it mid-slide (software GL is slow).
- Server mode was loaded and the claim path is the same message flow as offline, but a claim against the real server was not exercised in the browser.
- No lights, materials or renderer settings were touched.

Screenshots: `docs/screens/feel-settings.jpg`, `feel-prompt-banner.jpg`, `feel-connection-lost.jpg`.

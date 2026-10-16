# Reload resume: a page reload during a match puts you back in it

Fix-list item 7. The server already kept a dropped player for 15 s (social.md, "Reconnect grace"); only the in-page retry used it. Now a full page reload (F5, crash recovery, accidental navigation) resumes too.

## How it works
Code: `game.js` SOCIAL block (`pending`, `resume`, `booted`, `clear`, `bootFail`), `makeNet` (`opts.resume` opens the first socket with `?token=`), MATCH block (`GK.resume`, `mqResume`, one line in `GK.matchOnMsg`), `menu.js` (start-up check, `GK.menu.resumed`), `save.js` (one line) + one CSS rule in `index.html` (no title flash). No server change.

- **Stored next to the token** (sessionStorage): `gk.token`, `gk.tokenT` (last time the socket was alive during play) and `gk.tokenO` (`{c: charId, w: wins}` so a saved character is still credited). `gk.tokenT` is refreshed every 2 s while `GK.mode === 'play'` with an open socket, and on `beforeunload`. It is *not* the time of joining: that would make a long match never resumable.
- **Start-up** (`menu.js`, after `GK.menu` exists): `GK.social.pending()` returns the token only if `gk.tokenT` is less than 15 s old (else it clears the keys). Then the title is skipped (`menu` gets `gone`, `started = true`), a "Rejoining…" overlay shows and `GK.resume()` connects with `?token=`. `html.gkResume` (set by `save.js` from the first paint) keeps the title from flashing.
- **`{resumed:1}`** (the welcome `socWelcome` sends): `handleMsg0` builds the world, players, round, inventory, gold; then `matchOnMsg` -> `mqResume()` ends the boot, marks the queue as done, hides the wheel/title and enters play mode (`mqEnterWorld`). A `countdown` message that follows (resume during the 3-2-1) locks it again as usual.
- **`{resumeFail:1}`**, a socket that closes before the welcome, or no answer within 8 s: the token is cleared and the page reloads to the normal title.
- **Token cleared** (`GK.social.clear()`): death screen, victory screen, queue Cancel, the "Main menu" button of the reconnect overlay. Dead/won players cannot be resumed by the server anyway.

## Tests
`tests/social.test.js`, new case "page reload contract": after the first socket closes, a fresh raw socket with the same token gets `resumed:1` with `you, token, layout, chests, chestKeys, shops, drops, round, match, players, fix, inv`, no `queue`/`matchStart`, my goblin in the list without `dc`; the token keeps working for a second and third reload (the third while the second socket is still open, which terminates it). `npm test`: 19 files green (one balance.test.js run failed once while another test run was using the CPU, passed on rerun).

## Verified in the built-in browser (server on port 3171, `GK_DEBUG=1 GK_QUEUE_MS=2000`, vol/sfx/amb set to 0)
- Start, wait for play, reload: straight back into round 1 with the same player id, goblin (Goblin), position (14.76, 13.06) and 8 actors, no title shown, no console errors, screenshot shows the room view with HUD.
- Fresh token that the server does not know (`bogus`): the page tried to resume, got `resumeFail`, cleared the keys and reloaded to the normal title (screenshot).
- Token older than 16 s: `pending()` returns null and clears the keys.

## Not tested / limits
- The pointer lock is lost on reload and cannot be re-taken without a click: the player clicks the canvas once (existing behaviour) to look around again.
- Resume during the loading/countdown phase is only covered by the server test, not seen in a browser. Death/win clearing is code-read, not played through.
- Closing the tab or a second tab: sessionStorage is per tab, so only the same tab resumes. Audio not heard.
- The server's 15 s grace includes the page load time: a very slow load can miss it and shows the normal title.

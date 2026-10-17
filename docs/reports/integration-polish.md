# Integration polish (client loose ends after the room-art, elixir, HUD and special-room merges)

Branch `worktree-agent-a48998aa245ed3595`, fast-forwarded to main `034dcab` first. Client plus small server hooks; the BOTS block of server.js was not touched.

## 1. Home: art and elixir wiring
- **Anchors** (`world.js HOME_LAYOUT`, shared by server and client): pump, screen, lockbox and sentry now sit on the art props of `rooms5art-home.js` (`PX/PZ`, `SX/SZ`, `LBX/LBZ`, `SENX/SENZ`, all times `HOME_K`). They were placeholder spots on the wrong walls. `tests/rooms5art-wiring.test.js` checks them against the art footprints. The elixir tests (`elixir-home`, `elixir-sends`) and `props` stay green.
- **Duplicate visuals removed:** with the art home loaded, `buildElixirProps` builds only three invisible hit boxes (`pump`, `screen`, `box` stations) at the anchors: the E prompt and the pointer test of the Elixir Screen, the pump and the lockbox work as before (verified in a real browser: hover kinds `p`, `s`, E on the pump collects, E on the screen opens the panel). The placeholder glass tank, screen and box are only built when the art module is missing.
- **State to the art:** `GKHOMEW` publishes `GK.state.homes[key] = {pump, lv, dead, alert}` from `{home}` (tank / tankCap, upgrade levels), `pumpGlow` (red alert glow for the raid time), `homeDead`; `homePing` (my alarm) calls `ringAlarm`; the `sentry` home effect turns the art sentry (`setSentryTarget`). R5 already read `GK.state.homes`; before this nothing wrote it, so every home stood at the default look. Only my own home is known to me, other homes keep the base look (the server does not send them).

## 2. Special rooms: playing them
- **`act5ui.js` (new, pure, `window.GKACT5UI`):** what E / R / Q does at each anchor, from the public room view (`actS.st`) and `actMe`. All 10 tree rooms, the 4 vaultbreakers and the vault. Hold verbs (channels: press, bottle, cut, rob, light, scoop, ...) send `use` on key down and `stop` on key up; `tap` presses the timing needle; `choose x` picks (drink or carry, cuts, blessing); the Thorn blessing and the Gambler / Graft item are chosen automatically (R cycles the blessing; the lowest tier backpack gear is fed, the equipped weapon is grafted). Second and third actions show on a small line under the E prompt. While an arc is running (my own chan or timing) the prompt hides, the arc is the prompt.
- **`game.js` block `ACT5UI`:** `window.GKACT5`: stores `actS` per room, `actMe`, `crown`; finds the nearest anchor within `r + 1.3` (the server takes `r + 1.4`); E goes through the existing key handler (after the door panel, before stations); R / Q have their own handler; `{lat}` (one-way latency) goes to the server every 2.5 s for the timing judge; `actFail` and `toast` are shown (the server's `toast` messages were not handled by the client at all); `actFx` gain / treasury / capped / bless / spill toasts; Seer `pulse` reveals the listed goblins on the minimap for the pulse time; `vbNext` reaches the HUD.
- **Anchors shared:** `world.js ACT_LOCAL` / `actAnchors(key)` (act5.js now reads the same tables, a test compares the client's and the server's anchors). The vaultbreaker stations B / L / R were moved beside their doors by the art integration (+4.7 / +3.9 / -3.9 along the wall) but the server still had them in the middle of the walls (unreachable from the new props): `ACT_LOCAL.vb` now matches `rooms5art-vault.js LAYOUT`.
- **Art drivers (`GKACT5.apply`, called for the rooms drawn this frame):** well, press, spring, seer, graft, thorn, gambler, memory (the show sequence is played on the lanterns), oak, elder; ram, locksmith, counting, keystone (machine state, strike on `ramhit`, breach cracks); vault dressing (claim ring lap of 10 s in the claimant's colour, contested from the actors on the dais, coffers from `cof`, bars, alarm, breach). Everything is a cheap idempotent setter; nothing allocates per frame.
- **Server fixes found on the way:** `act5.viewOf` sends the pool levels at this moment (well water, spring basins, graft branches were the raw lazily-refilled values, so they never read as refilled); `actFx` events with their own `k` key (bless, press) lost the event kind: the data key now travels as `bk`.
- **Breach shape:** the server sends `breach` as `{doorId: 0..100}`; the HUD and the art wanted `{N,E,S,W}`. `GKACT5.pre` converts it before anyone reads it, so the minimap breach bars and the vault / vaultbreaker cracks work.
- **HUD needle:** activity.js `timing.phase` is `((t - t0) mod per) / per` and the server judges that phase, with a window that wraps past 1. The needle was drawn as a ping-pong (`tri`), which shows the wrong phase half of the time. It is a saw-tooth now (one-way sweep, `curve: 'saw'` from the server), and a wrapped window is drawn in two pieces. `tests/act5ui.test.js` plays a real Well crank and press against the server.

- **Legacy crown tag:** the old RULES crown handler printed "undefined IS CLAIMING THE CROWN NaNs" for the new crown view; it now ignores messages with `claims` (the HUD5 panel shows them). Found in the browser run.
- **Lockbox prompt:** E on my own lockbox says "Your lockbox" (it said "Crack the lockbox").

## 3. Minimap bell, recycler yield
- `bellAt` is used again in the minimap actor filter (a room with a Bell send running shows its goblins), and the bell effect redraws the map at start and end.
- The home recycler panel preview uses `GKHOMEW.recEff()` (the Recycler upgrade), not the flat 50 %.

## 4. Coin sack slowdown
Server `applyMove`: while `p.carry.heavy` (the coin sack) the movement allowance is 70 % of his walk (times 1.3 for jitter) with a 0.08 m slack instead of 0.3 m (the normal slack would still allow 9 m/s at 15 messages a second), and the budget cap is 0.8 m. Client: heavy carry (`actMe.carry.heavy`) walks at 70 % and cannot sprint. Test: a walk at 2.6 m/s is accepted, a 7.4 m/s sprint is corrected.

## Verified in a real browser
Own server on a random port (GK_DEBUG), headless Chrome over CDP (swiftshader, Low), a real match with the real page, no console errors or warnings in any run (`docs/screens/i-*.jpg`):
- Home (`i-01` to `i-08`): the art home, E prompts on the pump (collect, "+n elixir"), the Elixir Screen (opens, buys), the lockbox (second padlock after the upgrade), pump fill from the tank.
- Walk (`i-10`): W key moves out of the home; the match then teleports (debug `tp`) to the tree rooms, the walk itself is only a few metres in headless (frame rate).
- Tree room (`i-11` to `i-14`): Sapling Well forced into cell 6: prompt "Crank the well", E opens the needle arc, three presses timed from the saw-tooth phase hit (notch 1, 2, then ready), "Drink the water" / R "Fill a bucket", E drinks: +3 knowledge toast and the stat went 45 to 48.
- Vaultbreakers (`i-20` to `i-27b`): prompts at the real art props of the Ram (winch, lane), Locksmith (grindstone, lock face), Counting House (desk), Keystone (stone: lit by a hold, the circuit advanced to 1); the wrapped window shows in two pieces on the arc.
- Vault (`i-28`, `i-29`): coffer scoop by hold (gold 100 to 112), the crown claim panel and the claim ring.
Not seen in the browser: the other tree types (they are tested through the server in `act5ui.test.js` and the setters are called the same way), a second human, the bell effect (needs a send from another player), the ringing alarm.

## Tests
`tests/act5ui.test.js` (new): anchor tables, saw-tooth contract, pure option table, and 7 server plays (Well crank and needle press, Spring hold and stop, Memory show and input, Ram winch and needle, Keystone light, Vault scoop, coin sack speed). Changed: `rooms5art-wiring` (home anchors).

## Not done / notes
- No chooser UI for which item to graft / feed: the Graft Bench takes the equipped weapon (or the first backpack gear with a reforged twin) and the Gambler's Root the lowest tier backpack gear; the prompt names the item.
- Other players' homes show no upgrades (the server only tells the owner).
- Hollow Oak `hidden` (held rooms) and sudden-death `vent` roundState fields are still not drawn.
- The treasury mounds follow the average coffer level (the server has no treasury total).

# Loot: vault relic, price scaling, throwable plushie, bots at stations

Code: `server.js` block `LOOT-BEGIN/END` (after BOTS) plus small hooks (`newMatch`, `roundState`, round change, `claim`, message switch, `pickDest`, `botThink`, `roomGoals`); `game.js` block `LOOT-BEGIN/END` before `window.__gk` plus 5 one-line hooks (net message, feed row, Digit1-3, shop panel, kill feed `msg`); `items.js` (`x:plushie`), `audio.js` (`squeak`), `icons.js` and `itemart.js` (one line each). No lights added. Menu files untouched.

## Vault relic
- `lootInit` rolls one weapon/armour of tier 3-5 per match, weighted by the normal drop chances. `roundState` carries `relic` (key, or null once taken), so every welcome message has it.
- Pedestal at vault centre + 2.4 m in x (`RELIC_POS`). Taking it: E -> existing `{claim:1}` -> `claim()` -> `relicClaim`: must be in room 4 and within 2.2 m, first goblin only (`m.relicTaken`), needs backpack space. Wrong place or too far = `claimFail 'room'`, second goblin = `'taken'`.
- Broadcast `{relic:null, feed:{k:name, msg:' seized the Vault relic!'}}`; `feed()` in game.js renders `msg` rows ("Mozzle seized the Vault relic!").
- Client: pedestal (cylinders and a torus, standard materials) plus `GKART.model(key)` scaled to 1.5 m, slow spin and bob, one additive sparkle sprite, an "E take the Vault relic" prompt within 2.2 m.
- Bots: `pickDest` adds +14 to the vault once a vault door is open and the relic is free (and the pack has room). In the vault `relicGoal` walks to the pedestal and claims, then `equipBest`.

## Price scaling
- `priceAt(base, round) = round5(base * (1 + 0.1 * max(0, round - 2)))`. Every shop item keeps `base`; on each round change `lootRound` rewrites `price` and rebroadcasts `shops`. `buy()` and the bots read `price`, so the server is authoritative. The shop panel already shows `price`; `shopNote` adds "Round N: prices +X%".

## Plushie
- New item `x:plushie` (consumable, family plushie). A plushie mystery room now gives it through `claim()` (once per player). It can be moved to a quick slot like any item.
- Digit1-3 on a quick slot holding it sends `{throw:'q0'}`. `throwPlushie` (after GO, slot must hold it) removes it, lands it 7 m ahead of the thrower's yaw clamped into the room, stores a lure (flight 650 ms, active 3 s) and broadcasts `{throw:{id,by,from,to,ms,room}}`. Clients draw the arc (primitive plush, no lights) and play `squeak` at throw and landing.
- `lureFor`: any bot or mystery enemy in the same room within 8 m walks to the landing spot while it is active (top of `botThink` after the pause check, so it overrides fighting and fleeing).

## Bots at stations
- `roomGoals` ends with `botStations`: in a merchant room or a stations mystery room, recycle every weapon that is not better than the equipped one (`isJunkW`), then craft the best affordable tier 0 recipe (max one per visit). `pickDest` gives such rooms +3 when the bot holds junk. Honest note: all tier 0 items are weaker than start gear, so crafted items are mostly extra junk that the next visit recycles again.

## Tests
`tests/loot.test.js` (4 tests, about 7 s): relic once and only in the vault (feed and `relic:null` broadcast), prices at rounds 3 and 5 plus `buy` charging the scaled price, plushie throw lands 7 m ahead and lures a bot (debug `{botlab:{near}}`), a bot recycles two sticks and crafts (debug `{botlab:'station'}`). `npm test` is 15 files; ran 3 clean in a row after one unexplained netcode flake under load (it passes alone 5/5).

## Browser check
`GK_DEBUG=1 GK_QUEUE_MS=2000 PORT=3170`: relic model on the pedestal, no console errors from the page, thrown plushie driven through `GKLOOT.onMsg`. Screenshot `docs/screens/loot-vault-relic.jpg`.

## Not done
- Offline demo (`?offline=1`) has none of this (no relic, plushie, price scaling).
- Pedestal has no collision. The inventory tooltip for the plushie shows the generic consumable text. Not seen live: the E prompt, the plushie in a real mystery room, a human taking the relic with the client.
- The relic is only visible from inside the vault (walls block it).

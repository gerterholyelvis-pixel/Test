# Combat, health and win condition

Code: `items.js` (`COMBAT`, `combat(weaponKey)`, shared by client and server), `server.js` (blocks `COMBAT-BEGIN/END`: regen in the global timer, `checkWin`, `attack`), `game.js` (block `COMBAT-BEGIN/END` before `frame()`, the offline simulation block inside `makeNet`, plus one-line hooks in `handleMsg`, the actor loop of `handleMsg` and `frame`). Rendering, lights and materials are untouched (no lights added; effects are sprites and DOM overlays).

## Rules
- **Melee**: left click on the canvas (play mode, not in inventory/shop) swings the weapon. Unarmed = 1 damage. Damage = weapon attack stat, minimum 1 (the Wizard's Gnarled Staff has attack 0 and does 1).
- **Server validation** (`attack()` in server.js): attacker and target must both have entered the rooms (`{enter:1}`); cooldown by weapon family (see `SWING_CD` in items.js: 0.45 to 1.0 s, 10% jitter allowed); range 2.2 m (+0.3 m lag slack), bows and crossbows 12 m; target inside a 70 degree half-angle cone around the attacker's yaw (forward = (-sin yaw, -cos yaw), same as the client movement); same room key. Nearest valid target takes the hit, one per swing.
- **Health**: `stats.health` (already in `pub()` and the players list) drops; at 0 the existing `die()` runs, killer `kills` +1 (`pub.kills`, and `{kills:n}` to the killer). Regen 1 HP per 4 s once 6 s have passed since the last hit.
- **Win (DEFAULT, owner undecided, documented in FEATURES.md)**: last goblin standing. `checkWin(m)` runs after every `leave()`: needs `enteredEver >= 2`, `deaths >= 1` and exactly one living entered player, then calls the existing `win()`. Everyone leaving, or one player leaving with no death, gives no win. To change the rule, edit `checkWin`.

## Protocol
- Client to server: `{atk:1}`.
- Server to everyone in the match: `{swing:playerId}` for each accepted swing (hit or miss), `{hit:{from,to,dmg,hp,max,dead}}` for each hit.
- To the killer: `{kills:n}`. To the victim: `{died:{items,brain,by}}` (by = killer id). To the winner: `{won:{...}}` as before.
- `{match:{size,minWins,maxWins,alive}}`: `alive` = entered, not dead (HUD "Goblins left"; falls back to `size` before anyone entered). Players list entries gained `kills`.

## Client
- Own swing animation immediately (right arm sweep + torso twist), others on `{swing}`. Knockback and backward lean on the victim are visual only (offset applied after the position update each frame, true position untouched).
- Floating damage numbers (sprites, gold when I hit, white for others), red additive flash sprite on the victim, red screen vignette plus "-N" when I am hurt, health bars (sprite) over other goblins' heads (extra height for wizard/king hats), HUD box next to the stats panel: health bar, Goblins left, Kills.
- Offline (`?offline=1`): bots have health from their armour, hit back with the same cooldown/range/cone rules (cooldown x1.8, 0.9 s reaction delay), walk to the player within 6 m in the same room, drop their gear plus a brain on death. After the first kill the bot roster is frozen (no bots joining or leaving); when the player is the only one left the victory screen shows. The player dying shows the existing death screen. `window.GK_BOTS_PASSIVE = true` stops bots attacking (test hook). Test hooks: `GK.attack()`, `GK.combatState`, `GK.combatHurtFx(dmg,max)`.

## Tested
- `node --check` on game.js, menu.js, items.js, server.js, save.js, icons.js, world.js.
- ws script (scratchpad `combat-test.js`, server `PORT=3102 GK_DEBUG=1`, 21 checks, all pass): hit from behind misses, melee out of range misses, other room misses, hit applies the attacker's attack stat (20 mace vs 40 HP -> 20), cooldown blocks a rapid second swing, second hit kills, victim receives `died` with items, brain and killer, killer `kills` = 1, survivor receives `won`; bow hits at 9 m for 14 and misses at 13.5 m; regeneration (26 -> 28 in 11.5 s); no win when a player leaves without a death or a lone player dies; a player who has not entered cannot be hit.
- Browser (software GL): offline game loads with no console errors; swings damage and kill bots (kills counter, loot piles), damage numbers, HUD, bars, vignette and bots hitting back and killing the player (death screen) observed; online client against the server with a second ws dummy: swing hit it (40 -> 20), HUD showed Goblins left 2. Screenshots: `docs/screens/combat-1.jpg` (damage number and HUD), `docs/screens/combat-2.jpg` (vignette, bars, mace swing).

## Not tested
- Real mouse click with pointer lock (hits were triggered via `GK.attack()`; the `mousedown` listener is trivial but unexercised by a real click).
- The offline win by killing every bot (the kill path and victory call were exercised separately, not the full sequence); more than two real clients in one match; knockback on slow connections.
- Bow aiming has no pitch/projectile; it is an instant hit within the cone.
- A mobile/touch attack control does not exist.
- Wizard/king bar heights were eyeballed once; the overlap of the combat HUD with the stats panel on very narrow screens was not checked.

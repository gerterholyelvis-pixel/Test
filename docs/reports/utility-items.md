# Utility items (consumables)

Eight one-use items. Press the quick-slot key (1-3) to use one; the server decides (`{use: slot}` -> `{used}` or `{useFail}`).

| Item | Tier / price | Effect |
|---|---|---|
| Bandage | common / 20 | +12 HP at once, 4 s shared heal cooldown |
| Healing Mushroom | common / 25 | +2 HP per second for 8 s, ended by taking a hit |
| Speed Tonic | uncommon / 35 | +25% move speed for 8 s (server move allowance follows) |
| Smoke Bomb | uncommon / 30 | thrown 6 m ahead; 6 s cloud (r 3 m): bots cannot see into it and nobody can shoot (bow, crossbow, staff bolt) a goblin inside from beyond 2.5 m. Melee is unaffected |
| Powder Bomb | rare / 55 | thrown 6 m ahead, blows after 1 s: 22 damage at the centre, 11 at the 2.5 m edge, every goblin in that room except the thrower. Kill credit and feed go to the thrower |
| Door Wedge | uncommon / 30 | use within 4 m of an open, non-Vault door of your room: it stays open one more round |
| Sealing Wax | common / 20 | needs a pick on your room's panel: nobody (bots included) can change it until the round ends |
| Vault Lockpick | mythic / 90 | needs your room's pick to be a Vault door: counts as a second vote, so one room can open the Vault |

Heals, wedge and regen are refused in sudden death (only the Vault heals, all doors are open).

## Integration
- `items.js`: `UTIL` table (one place for numbers), `ITEMS['x:...']`, `GKITEMS.UTIL_KEYS`, `pickUtil()`.
- Merchants: 75% of shops swap one gear slot for a utility item (weighted by `shop`).
- Mystery-room enemies: 40% chance to also drop one.
- Crafting: all eight are recipes. Tier 0 (bandage, mushroom, wax) for everyone; tonic, smoke, wedge need 20 knowledge, bomb 40, lockpick 60 (`needs = tier * 20`).
- Recycler: every utility item breaks into 1-2 parts (`scrap`).
- Bots: use a bandage or mushroom when under 50% HP and unhurt for 3 s. They never buy utility items (their shop scoring only values gear) and do not craft them (the bot crafting loop skips recipes without an attack or health stat).
- Server: `USE-BEGIN` block in server.js; small hooks in `attack` (smoke), `boltTick` (smoke), `inView` (bot sight), `vaultVotes` (lockpick), round resolve (`useOpen`: wedge, seal and pick reset), door vote (seal), `hitTarget` (weapon name for the death card), `applyMove` (tonic allowance), `npcLoot`.
- Client: `UTILITY-BEGIN` block after LOOT-END in game.js (floating note, thrown arc, smoke sprites, bomb flash), key hook next to the plushie one, `statTxt` shows the description, tonic speed multiplier in the movement line. Icons are drawn in icons.js (no 3D model, `itemart.js` skips `x:` keys like the plushie). Audio: `useSoft`, `hiss`, `boom`. No lights.

## Tests
`tests/utility.test.js` (data, shop stock, recycle + craft, bandage, mushroom, tonic, wedge, wax, lockpick, bomb, smoke). New debug hook `{hp: n}` (GK_DEBUG only).

## Not done / notes
- Not checked in a browser (the shared Browser pane was full); client code is syntax-checked only. Offline demo has no utility items.
- Items can only be used from the quick slots by key (the server accepts backpack slots too).
- Chests still hold weapons only (their display model is a weapon).
- Pre-existing: the two `security.test.js` static tests fail in a worktree without `node_modules` (three.module.js 404); they pass once `node_modules` is linked.

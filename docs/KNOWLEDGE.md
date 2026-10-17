# Knowledge: the tree is the workbench

Knowledge used to be a number that lit up tiers on a tree you could only look at. Now it does two jobs, and both happen on one screen.

## The two rules
1. **Knowledge unlocks recipe tiers.** Tier N recipes need `KNOWLEDGE_TIERS[N-1]` knowledge: 20, 40, 60, 80 or 100. This is unchanged. Knowledge is innate, and eating a brain adds 5% of that goblin's knowledge, as before.
2. **Knowledge points buy perks.** You get 1 point for every 20 knowledge, plus 1 point for **every brain you eat**. Perks cost 1, 2 or 3 points. Within a branch you learn them top to bottom. Perks last until you die, and death loses them like everything else.

Starting points: Small 3, Medium 2, Big 1, Wizard 4, King 2. The full tree costs 18 points, so nobody spawns with more than one branch half done. Brains are what take you deeper, which makes a kill pay off in knowledge as well as loot.

## One screen
Press **E at a workbench or at a knowledge tree** (both are in merchant rooms and in stations mystery rooms) to open the same `WORKBENCH` screen:
(Redesigned, see docs/reports/workbench-ui.md; the screen is `wbui.js`.) It has a station banner (Workbench, Master Forge, Home Workbench, Recycler, Home Recycler 50%, Grand Recycler 100%) and four tabs, switched with Tab or 1-4:
- **Craft:** recipes by category (weapons, armour, consumables, charms) with search (`/`), filters, sort and a pinned Craftable now row. Each card shows the stat change against what you wear, the cost in have/need colours, the craft time and why you cannot craft it yet.
- **Perks:** the knowledge tree as three branches of three perks (learned / ready to learn / locked, with costs). Knowledge, recipe tier and points are always shown in the tab bar.
- **Reforge:** gear you can reforge, before and after.
- **Recycle:** pick several items, see the materials you get and the total, or recycle all junk (gear no better than what you wear) after an in-page confirmation.
- **Always visible:** the progress strip of a running craft and your materials (with a +/- preview of the selected recipe or recycle).

A knowledge tree is a full workbench, so a stations room with recycler + tree can craft too. When you have unspent points, the Knowledge line on the inventory stat card says so. There is no extra HUD.

## The perks
| Branch | Rank 1 (1 pt) | Rank 2 (2 pt) | Rank 3 (3 pt) |
|---|---|---|---|
| **Craft** (the bench) | **Thrifty Hands**: recipes cost 1 less of every material they need 2+ of | **Scrapper**: the recycler gives +1 of every material (found gear only) | **Reforge**: at the bench, turn a weapon or armour into its `+` twin (+20% attack/health, at least +2), once per item |
| **Lore** (the facility map) | **Appraiser**: the map shows what waits in every outer room (tier and kind of the chest item, mystery contents) | **Eavesdropper**: orange arrows show the doors every room has picked *this* round | **Head Count**: the map counts the goblins in every room and names the Vault relic |
| **Guts** (your body) | **Field Medic**: healing items (`use` heal or regen) heal 50% more | **Brain Gourmet**: eating a brain also heals 25 HP (not in sudden death) | **Second Wind**: once per match, a killing blow leaves you at 1 HP |

Every perk is keyed to generic fields (`type`, `use`, `tierN`, `chance`, `family`), never to item ids. New weapons, armour and consumables work with them automatically.

### Reforged items
For every weapon and armour in `ITEMS`, items.js generates a twin `'<key>+'` (`up: 1`, `base: '<key>'`, `chance: 0`, so it never drops and is never sold). It keeps family, tier and the base item's `WEAPON_TUNE` (reach, swing time). Its icon and 3D model are the base item's, with a small gold plus badge on the icon. Reforge cost: weapons `{metal: 2 + tierN}`, armour `{metal: 1 + tierN, leather: 1}`. If another agent adds items in items.js above the KNOWLEDGE block, they get twins automatically.

### No material loops
`recycleFor(key, perks)` is what the recycler really pays out. For anything a recipe makes (or its reforged twin), each part is capped at that recipe's current cost, and Scrapper only adds to found gear. Crafting and then recycling can never make materials. A test enforces this for every recipe, with and without perks.

## Higher-tier recipes
Tiers 4 and 5 used to gate nothing. There is now one weapon and one armour per tier 2 to 5: Iron Sword / Chainmail, Halberd / Iron Cuirass, Claymore / Dwarven Plate, Goblin Slayer / Titan's Aegis. Each costs more than one same-tier recycle returns, so crafting is an upgrade path, not a swap. Tier 5 needs 100 knowledge, which means a Wizard who has eaten a lot.

## Bots
At a station, bots spend their points on Field Medic, Thrifty Hands, Brain Gourmet, Scrapper and Second Wind, in that order. They never take Lore perks or Reforge. They do not go looking for stations to learn; they learn when they are already there to recycle junk. Bot routing is unchanged.

## Protocol
- Client to server: `{learn: perkId}`, `{reforge: slotId}`.
- Server to client: `{perks: [...], learned?}`, `{learnFail: 'room'|'perk'|'have'|'order'|'points'}`, `{reforged: {slot, key}}`, `{reforgeFail: 'room'|'perk'|'item'|'parts'}`, `{secondWind: 1}`, `{ate: {..., heal?}}`.
- Points are not sent. Both sides compute them with `knowPoints(knowledge, brains, perks)`, and the public player state already carries knowledge and brains.
- On resume the server re-sends `perks`. GK_DEBUG test hook: `{know: n}` sets knowledge.

## Known limits
- Lore perks are a client-side display gate. The server already sends every room's picks, the mystery contents, chest keys, the relic and all positions to every client (that predates this work). A hacked client could show all of this without the perk. Withholding that data per player is a netcode change for later.
- Head Count and Eavesdropper redraw only the map of the room you stand in (one canvas, at most every 2 s), so the cost stays flat on Low.

Code: items.js `KNOWLEDGE-BEGIN/END`, server.js `KNOWLEDGE-BEGIN/END` (plus one-line hooks in craft, recycle, eatBrain, hitTarget, useItem, botStations, socWelcome), game.js `KNOWUI` (replaces the old buildCraft/paintCraft). Tests: tests/knowledge.test.js.

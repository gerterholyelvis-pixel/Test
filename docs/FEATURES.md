# Goblin King: design notes and status

Browser game (three.js client, Node + ws server). Run: `npm install && npm start`, open http://localhost:3000.
Screenshots live in `docs/screens/`. Agent reports live in `docs/reports/`.

![title](screens/title.png) ![wheel](screens/wheel.png) ![in game](screens/in-game.png) ![overview](screens/overview.png)

## Rules decided so far
- **Goblins** (rolled when you queue, shown on the wheel): Small 30%, Medium 30%, Big 30%, Wizard 9%, King 1%.
- **Stats**: attack comes from the equipped weapon, health from the equipped armour, knowledge is innate.
  Start: Small 60 knowledge / Dagger 10 / Ragged Tunic 40 HP; Medium 40 / Nailed Club 15 / Studded Vest 50;
  Big 30 / Spiked Mace 20 / Warlord Harness 80; Wizard 80 / Gnarled Staff 0 / Starry Robe 60; King 40 / Royal Scepter 20 / Royal Mantle 100.
- **Map**: 3x3 grid of white rooms (12 m), the middle room is **the vault** (to be made bigger than the others). Players spawn in one of the 8 outer rooms, never the vault.
- **Rounds**: first round 30 s, later rounds 45 s. Every room has a control panel where you click a door; when the timer hits 0 that door opens (stays open for the next round).
  A vault door only opens if at least 2 different rooms picked a vault door that round; with 1 pick nothing opens and the turn is wasted.
- **Doors**: doors to the vault are super secure vault doors; doors between player rooms have a skull; doors to chest rooms have yellow bars and a money bag; mystery room doors have a question mark; merchant room doors have the merchant logo.
- **Rooms behind the outer doors (12)**: randomly generated per match as chest, mystery or merchant. Edge rooms (one outer room) can never be merchant; corner rooms (two outer rooms) can be anything.
  - Chest room: chest with a random weapon.
  - Mystery room: random weapon, random armour, random enemy goblin (troll 2, archer 8, speedy 20, dumb 30, regular 50; these add up to 110 so they are used as relative weights), two random stations, a chest of gold, or a goblin plushie.
  - Merchant room: merchant goblin behind glass (click to trade: 5 random items with gold prices), knowledge tree, crafting bench, recycler.
- **Stations**: the recycler and crafting bench can be used by everyone. Recycler turns weapons into parts (wood, metal, leather, cloth, gold, bone, gems, string, crystal).
  Bench crafts tier 0 base items for everyone; higher tiers unlock through the knowledge tree. Knowledge tree has 5 tiers needing 20, 40, 60, 80, 100 knowledge.
- **Items**: 20 base weapons and 20 base armours, each with its own drop chance (each list adds up to 100%); rarer means stronger. Tiers: 0 common, 1 uncommon, 2 rare, 3 mythic, 4 legendary, 5 transcendent.
- **Inventory**: 9 backpack slots + weapon slot + armour slot + 3 quick slots (hotbar).
- **Death**: everything is lost. The dead goblin drops its weapon, armour, inventory and its goblin brain (eat it for 5% of that goblin's knowledge). The player sees a death screen with run stats and can requeue or go to the main menu.
- **Win**: keep the items from your inventory (they go to the start-screen Inventory tab) and the character itself (saved in the Characters tab with its victory count). There is no win condition yet.
- **Matchmaking**: matches are queued with goblins of similar or equal victory counts.

## Open questions for the owner
- What is the win condition? (a test hook exists, nothing triggers it yet)
- Starting gold is a placeholder of 100.
- How should stash items be brought into a run?
- Recipes for crafting tiers 1 to 5.

## Files
`game.js` client, `menu.js` title screen, `index.html`, `server.js`, `items.js` shared item data (also used by the server), `save.js` saved characters and stash, `icons.js` item icons.

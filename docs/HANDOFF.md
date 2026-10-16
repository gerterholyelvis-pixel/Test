# Handoff for the next Claude (Goblin King)

Repo: gerterholyelvis-pixel/test, branch main. Read `docs/FEATURES.md` first (rules the owner has decided), then `docs/reports/*.md` (what each piece does, what was not tested). Screenshots: `docs/screens/`.

## What it is
Browser multiplayer game "Goblin King". Client: plain JS + three.js (`game.js`, `menu.js`, `index.html`, `icons.js`, `save.js`), shared data `items.js`, server `server.js` (Node + ws, per-match games). Run: `npm install && npm start`, open http://localhost:3000. Test hooks: `GK_DEBUG=1` on the server, `window.GK_OFFLINE = true` for a no-server demo (also `?offline=1`).
Published offline demo (older version): https://claude.ai/artifact/5D9suDN6Ny9o1zy8TRGQhy. `build-artifact.js` (in the old scratchpad) builds it; re-create if needed (importmap + three@0.158.0 modules from jsdelivr, inline items/save/icons/game/menu, set GK_OFFLINE).

## Unfinished right now
- **Vault resize** (owner: "middle room must be bigger", "we will call it THE VAULT"): a background agent was mid-way making the middle room 18x18 with a non-uniform grid and a shared `world.js` (client + server geometry). Work in progress is committed on main but NOT finished or tested: check `git log`, run `node --check` on all files, load the game, walk through every door, check maps/panels/chest rooms/spawn/server room keys. Spec: corner rooms 12x12, edge rooms 18x12 or 12x18, vault 18x18, 12 chest/mystery/merchant rooms (8x8) behind the outer walls, signs "THE VAULT", gold medallion and pillars inside, no new PointLights (light count must stay constant).
- Another Claude session (the owner's) also pushes to main (mouse look, "press E to interact", HUD). Always `git fetch` and rebase before pushing.

## Decisions made by the owner (all in docs/FEATURES.md)
Goblins 30/30/30/9/1%; stats from gear (attack = weapon, health = armour); rounds 30 s then 45 s with door control panels; vault doors need 2 rooms to pick them or the turn is wasted; 12 outer rooms randomly chest/mystery/merchant per match (edge rooms never merchant); mystery contents and enemy goblin odds (these add up to 110, used as weights); merchant sells 5 items; recycler and crafting bench usable by everyone; 20 weapons + 20 armours with drop chances; tiers 0 common, 1 uncommon, 2 rare, 3 mythic, 4 legendary, 5 transcendent; inventory 9 backpack + weapon + armour + 3 quick; death loses everything and drops a goblin brain (eat for 5% of its knowledge); win keeps items and saves the character with victories (start-screen Characters and Inventory tabs); matchmaking by similar victories.

## Open questions to ask the owner
1. What is the win condition? (a debug hook exists; nothing triggers a win)
2. Starting gold is a placeholder of 100.
3. How do stash items get brought into a run?
4. Crafting recipes for tiers 1-5 (only the six tier 0 recipes exist).
5. Mystery enemies do not move or fight yet; there is no combat at all yet.

## Working style the owner wants
Use agents/subagents for big work, put outputs (reports, screenshots) in the repo and just reference them in chat, keep chat replies short, commit and push to main (a stop hook asks for it).
Known gotchas: software-GL screenshots are slow (one job at a time); do not `pkill -f` a pattern that matches your own shell command.

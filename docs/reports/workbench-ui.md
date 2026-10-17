# Workbench UI redesign

Owner request: "make things organized in the workbench more". The screen had perks, ~55 recipes, reforge, station info, craft progress and a separate recycler panel on one scrolling page. It is now one fixed-size screen with sections.

## What it is now
- **One screen for every station** (`wbui.js`, opened by E at a workbench, a knowledge tree or a recycler). The recycler is now the **Recycle tab** of the same screen (the old separate panel is gone); E at a recycler opens it on that tab.
- **Station banner** (colour + name + effect chips), so you always know where you stand:
  Workbench (gold), Master Forge (ember: tiers 0-V, parts 25% cheaper, 0.8 s, +1 bonus tier), Home Workbench (blue, plus a "Home bench II" chip when the Elixir Screen upgrade is owned), Recycler (green, 100%), Home Recycler (light blue, 50%), Grand Recycler (teal, 100%). Tabs for stations the room does not have are greyed out and say why.
- **Tabs** (Tab / Shift+Tab or 1-4): Craft, Perks, Reforge, Recycle. Knowledge, recipe tier and points are always shown beside the tabs; a one-line progress strip (craft running + Cancel) and the materials strip are always visible. Panes have fixed sizes and scroll inside, so nothing jumps.
- **Craft:** recipes grouped by category (weapons, armour, consumables, charms), tier chip per card; search box (`/`), category filter, toggles Craftable now / Affordable / New tier, sort Tier / Name / Cost, a pinned "Craftable now" row (or the closest recipe when nothing is ready). Card: icon, name in rarity colour, recipe tier, NEW / BONUS TIER / FORGE -25% chips, stat line with comparison against what you wear (`+4 attack vs Dagger`, health, speed %), cost chips coloured by have/need, craft time, a reason line (`needs 2 more bone`, `knowledge 40 needed (you have 23)`, `bench too basic: Master Forge`, `backpack full`, `already crafting`) and a button (CRAFT / HOLD TO CRAFT / LOCKED / FORGE ONLY / NEED PARTS). Big recipes (16+ parts or 3+ gems/crystal) need a 0.65 s hold (mouse or Enter).
- **Perks:** the knowledge tree as three branches with connectors and arrows; each node is learned / ready to learn / locked with its cost and the exact reason (`learn Scrapper first`, `needs 2 points (you have 1)`).
- **Reforge:** carried and worn gear with before and after; without the perk it explains and links to Perks.
- **Recycle:** a 4x3 grid of your backpack and quick slots, click or Space to select several, A = all, J = junk. A live list shows each item's yield, a total, and the materials strip shows `+n` previews. **Recycle all junk** (gear no better than what you wear, never reforged twins) asks in the page ("Recycle 3 junk items (...) for +6 Metal?" Yes / Cancel, Esc backs out) before anything is sent. Several items go out as one `{recycle}` message each, 90 ms apart. Refine (home, 4 elixir) works on the selection.
- **Keyboard:** `/` search, arrows move, Enter/Space craft/learn/reforge/recycle, Tab sections, Esc leaves the search box / cancels a question, then closes; E and click outside close. Typing in the search box never closes the screen, switches tabs or moves the goblin.
- 1080p: the panel only zooms x1.2 (the other panels x1.5) and uses 94% of the height; 1100x640 uses a compact mode (no blurb, tighter cards, brew row beside Close).

## Rules and messages are untouched
No change to items.js, server.js game rules or message formats. The client still sends `{craft}`, `{learn}`, `{reforge}`, `{recycle}` (optionally `refine`), `{craftCancel}`. Server failure messages are shown as before. Offline demo uses the same screen.

## Files
- `wbui.js` (new): model (recipe rows and reasons, compare, filters, sort, perk branches, junk) + DOM builder (textContent only, no innerHTML). Registered in `server.js` CLIENT_JS and `index.html`.
- `game.js`: KNOWUI build/paint now create the screen; `buildRec/paintRec` are thin; STNUI gets `has(kind)` and `banner(kind)`; key hook in the shop keydown handler; search-box guard in the movement keydown handler; `GKHOMEW.benchLv`; `GK.know.dbg` (screenshot hook, client display only).
- `index.html`: WBUI CSS block (tokens from UI-SYSTEM).
- Tests: `tests/wbui.test.js` (32 tests: model, a stub-DOM harness `tests/stubdom.js` driving the screen: clicks, holds, keys, filters, recycle queue, junk confirm), two static checks added to `tests/qa-ui-static.test.js`.
- `docs/KNOWLEDGE.md` screen description updated. Screenshots: `docs/screens/workbench-*-1080.jpg` and `-640.jpg` (1920x1080 and 1100x640).

## Not done / for the merger
- Home bench level (`homebase.js benchParams`: maxTier 3, 1.5 s) is **shown** as a chip but not applied: the server does not use it yet (stations-final.md said the same), so card costs and tiers still follow the normal bench. When the server passes a spec to `benchCraft`, feed it through `STNUI.benchType` / `banner`.
- No real multiplayer playtest; checked in the offline demo only (headless Chrome, scripted keys and clicks).
- Old `recSel` global and `recPn.prev` kept as aliases for existing hooks (`recycledFx`, `craftedFx`, `learnedFx`).

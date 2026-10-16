# Knowledge report

**What changed.** The knowledge tree and the workbench are now one screen: E at either opens it. The tree is on the left, recipes grouped by tier (0 to V) on the right, and Reforge sits on top once learned. Knowledge still gates recipe tiers. Knowledge points (1 per 20 knowledge, +1 per brain eaten) now buy 9 perks across 3 branches: Craft (cheaper recipes, recycler +1, Reforge to +20% gear), Lore (map shows outer-room contents, live door picks, head count and the Vault relic) and Guts (healing +50%, brains heal, Second Wind once). New tier 2 to 5 weapon and armour recipes give tiers IV and V something to unlock. Design: docs/KNOWLEDGE.md.

**Files.** items.js (KNOWLEDGE block, `combat()` reads the base item's tune), server.js (KNOWLEDGE block plus one-line hooks), game.js (KNOWUI replaces buildCraft/paintCraft, plus hover, map, offline sim and how-to text), feel.js (prompt), icons.js (+ badge), itemart.js (twin uses base model), tests/knowledge.test.js, docs.

**Tested.** `npm test`: everything passes except bots.test.js, which is flaky under parallel load. The base commit fails it 2 of 5 runs and this branch 1 of 6 on rerun. The new knowledge tests pass, including a no-loop check for every recipe. In the browser (offline demo) I checked the screen, learning, the Reforge rows, the tier list and the Appraiser, Eavesdropper and Head Count maps. No console errors.

**Not tested.** A real multiplayer playtest, and sim-fairness over many matches.

**For the merger.**
- Every weapon and armour in ITEMS gets a `key+` twin (chance 0) at the end of items.js. Tests that iterate ITEMS see them.
- The goblin-types worker was asked to rename their `PERKS` to `GOB_PERKS`.
- Lore perks only gate what the client shows. The server already broadcasts this data to everyone.
- The worktree needs a node_modules junction for the security test.

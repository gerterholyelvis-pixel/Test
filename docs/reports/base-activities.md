# Base activities (home phase never idle)

**What.** Six things to do at home while the pump fills, each with a small per-round cap, checked by the server, ignored by bots: four timed jobs (E at the prop, 5 to 11 s, keys judged against marks), a round-goals board with a trophy shelf, and a lookout window.
- **Crank wheel** (E wall, beside the pump), rhythm: up to +4 elixir into the pump tank (cap 6/round, wasted if the tank is full).
- **Anvil stump** (in front of the bench), rhythm: 1-2 metal. **Scrap bin** (by the recycler), sort timber/metal left/right: 1-2 leather. Parts cap 4/round shared.
- **Training dummy** (west), arrow-key combo: up to +3 gold (cap 6/round) and +1 knowledge for 85%+ (1/round, 3/match).
- **Goals board** (west wall, over the bedroll; replaces the tally decal): 3 goals a round from a rotating list of 6 (all doable at home, round 1 = pump 8 / 2 jobs / 70% score). All done = E claims 6 gold and puts a cup on the **trophy shelf** (S wall, 7 cups). HUD card on the left shows the same checklist while at home.
- **Lookout window** (S wall): counts only (goblins in the room outside the hatch, neighbouring homes lit, hatch countdown), 8 s cooldown, counts for the scout goal.

**Server (server.js BASEACT block, one line in homeMsg, one in pumpUse).** `{ba:{start|done|cancel|look|claim|sync}}`. The server owns the seed, rebuilds the cues, re-scores the key times (`baseact.js`), refuses early/late finishes, far-away or foreign props, cooldowns and spent caps. Inputs are sent as `t*8+key` integers (the socket frame limit is 512 bytes). Leaving the room mid-job pays nothing.

**Files.** New: `baseact.js` (pure rules, shared), `baseactui.js` (prompts, overlay, checklist), `tests/baseact.test.js` (fast), `tests/base-activities.test.js` (live, ~60 s, `@timing`). Edited: `rooms5art-home.js` (BASEACT block: merged into existing bags, +2 small dynamic meshes and 1 instanced mesh, 51 draw objects vs 52 before, +1.3% triangles, no lights), `world.js` (HOME_LAYOUT anchors, 4 HOME_SOLIDS), `game.js` (BASEACT glue block + 3 one-line hooks), `feel.js` (prompt), `audio.js` (8 sounds), `index.html`, `server.js` CLIENT_JS, `tools/gameinfo.js` (Codex: Base jobs, Round goals, rules card), `docs/game-info.html`, `docs/MAP.md`.

**Tested.** `npm run check`, rooms5art-wiring, baseact (pure: scoring, caps over many rounds, wire format size, goals, prompt targeting, Codex), base-activities (live: refusals, cheat spam, perfect runs, caps, claim once, lookout, junk messages). Driven in the Browser pane: prompts, tune-up overlay end to end, board, crank wheel, bin, dummy, window, trophy cups, lookout toast.

**Not verified.** The crank wheel spin and the sort / combo overlays were never played by eye (only the tune-up overlay); sounds were not listened to; Low preset and mobile layout not checked; no bot-vs-home sim run after the 4 new HOME_SOLIDS (bots path round them in the unit tests only); the goals card top (92 px) may collide with the guide card planned in PLAN-fun feature 2.

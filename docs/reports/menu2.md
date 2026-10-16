# Menu polish pass (menu2)

Goal: the menu screens should look hand-made, not generated. Everything stays in `index.html` CSS, `menu.js`, plus small hooks in `game.js` (death / victory) and `save.js`. Before/after screenshots: `docs/screens/menu2-before-*` and `menu2-after-*` (1280x720), phone widths in `menu2-after-phone-375.jpg`.

## Design system (one block, `/* MENU2 */` in index.html)
- Type: Cinzel Decorative only for headings, Barlow Condensed for everything else, four sizes (`--t1` caption, `--t2` UI text, `--t3` card title / button, `--t4` panel heading) and three spacing steps (`--s1..s3`). Old per-screen clamps now use the tokens.
- One panel frame (`.sheet`, `.rs-card`): dark gilded sheet, brass corner brackets drawn as background layers (a pseudo-element made a horizontal scrollbar), subtle noise grime.
- Buttons: lift on hover with a gold edge glow inside the clip, press down on click (`.mbtn`, `.cplay`, `.rbtn`). Hover / click sounds were already wired in feel.js (`uiHover`, `uiClick` on `button, .mbtn, .cplay, .ccard, ...`), so the new buttons get them too.

## Per screen (one commit each)
- **Title / shared system** `75d0d39`.
- **Settings** `935d143`: four sections (Graphics, Audio, Controls, Display) in two columns, no scrolling at 1280x720, one column under 760 px. Every control id is unchanged (checked by driving all 12 controls and Reset defaults).
- **Controls** `a46d45f`: CSS only (markup untouched, so the emote / SOCIAL rows another agent is adding will flow into the grid): two columns of key caps and actions.
- **Characters** `ac5f4b9`, phone layout `Characters: phone layout`: portrait rendered from the real goblin model (`GK.build`, own offscreen target and lights, cached per type), victories, last win ("just now", "3 days ago"), best-item icon (saved per character in `save.js` as `best`, tooltip on hover).
- **Inventory** `82e0d85`: tier-framed slots, baked icons at 52 px, lift on hover, tooltip card with tier colour, stats, description and value.
- **Queue wheel** `f123f0d`: brass-rule plaque, seat pips (gold while the match fills, teal as goblins report `readyN`).
- **Death and victory**: one card layout (`rsCard` in game.js): the big result (display face, red for death, gold for victory), three hero numbers (Survived, Round, Kills or Victories), the details, then the buttons. On victory the goblin that won turns on a gold-lit stage behind the card (`WINSTAGE`: its own scene and lights; the game scene keeps 9 PointLight + 1 Hemisphere). The HUD and combat card are hidden on both screens (they showed through before).

## Checked
- 1280x720 and 375x700 for title, settings, controls, characters, inventory, death and victory (screenshots). No console errors in any of the runs.
- `node --check` on every .js file.

## Not checked / notes
- Real GPU look and frame rate of the victory stage (software GL only); the portrait render uses one extra offscreen pass per goblin type the first time the Characters screen opens.
- The queue screen after the wheel reveal (the reveal needs a real-time wheel; software GL is too slow to catch it).
- Death and victory were driven through `GK.showDeathScreen` / `GK.showVictory` in the offline demo, not by a real kill or win. The online SPECTATE button still inserts itself above the buttons (same DOM position as before).
- 1920x1080 was not captured; the layout uses clamp() sizes and fixed card widths, so it should only get more space.

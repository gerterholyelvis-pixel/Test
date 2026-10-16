# UI polish: HUD, inventory, panels, menu

Goal: less going on, one consistent gold/dark look, readable text, an inventory that copes with a bigger item roster.

## Changes
- **index.html**: new `UI-POLISH` style block (before the importmap). Overrides the inline styles game.js builds, so game.js stays small:
  - HUD cards (top-left, health, stats), hotbar, tooltip, "press E" prompts and the tip card share one look: square-cut, gold hairline, gold left edge (ember on the health card), the menu's condensed font, 16px text.
  - Inventory, merchant, recycler, workbench and loot panels: same font, Cinzel titles, square corners, gold top edge, small text sizes bumped (11/12/13px become 13/14/15px), thin gold scrollbars, lists scroll instead of growing off screen.
  - The HUD cards, hotbar and hint hide while any panel is open (`body:has(...)`), since the panel shows the same numbers.
  - Title menu: "GOBLIN" was clipped at the right edge (h1 stretched to the 520px column); footer line no longer overlaps the last button below 800px height; menu sheets are more opaque.
  - Key hint is hidden under 1000px width (it wrapped to four lines).
- **game.js** (small, local edits):
  - Stats card: removed the duplicate class name header, the "(Tab)" noise and the "(Tier 2, 20 dmg)" repetition (now a `T2` chip).
  - Top-left card: "Goblin King · N online" is now "N online · 0-1 victories" on one line.
  - New `cmpTxt(key)`: "+4 attack vs Dagger" (green) / "-10 health vs X" (red). Used in the inventory tooltip and the merchant rows. Tooltip also shows the type, description (`desc`) for any new item kinds, and is clamped to the screen by its real size.
  - Tip card: re-anchors every tick (it overlapped the stat cards when they appeared after it) and the left-edge test scales with window width.

## Tested
Offline demo at 1920x1080, 1280x720 and 900x540: HUD, inventory (with tooltip comparison checked via DOM), merchant, title menu, menu stash with 30 items. `npm test` passes (20 files).

## Not tested
Recycler, workbench and loot panels were only restyled by CSS (same shared markup as the shop), not eyeballed. Online mode untouched. The browser pane could only take low-resolution screenshots.

## Notes for the merger
- The CSS relies on attribute selectors against inline styles; `style.cssText` serialises as `font-size: 12px` (with a space) while `innerHTML` keeps `font-size:12px`, so both spellings are listed. New panels that use the same ids pick the look up automatically.
- `body:has()` needs Chrome 105+/Firefox 121+; older browsers simply keep the HUD visible behind panels.

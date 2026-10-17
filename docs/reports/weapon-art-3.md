# Weapon art 3

All in itemart.js (weapons only; armour and consumables untouched). Before/after contact sheets: docs/screens/weapons-art-before-N.png and weapons-art-after-N.png (N = 1 swords/daggers, 2 axes/spears/halberds, 3 clubs/maces/hammers, 4 ranged/staves/whips).

- Blades: new `bladeGeo` gives a real section (bevelled polished edges, darker or glowing fuller, ridge, tapering point). Swords, daggers, spear heads use it. Fuller glows from mythic up (purple pulse, ember orange, cyan).
- Tier ladder: weapon fittings are blackened iron (common), bronze (uncommon), satin brass (rare), gold (mythic+) via `tierTrim`; armour unchanged. Spiral cord-wrapped grips (`gripWrap`/`cordWrap`).
- New silhouettes: Twin Fangs (two crossed fangs), Scrap Cleaver (riveted slab with hole), Bone Shiv, Shadowfang (spine barbs), Claymore (ring quillons), Slayer (double serrated, spine hooks); Throwing Axe (tomahawk, feathers, lashing), Executioner (red-wrapped), Crownsplitter (gold, crown); spears with langets, leather grip, Pike pennant; Ogre Club (bone spikes, iron hoops), Siege Maul (hooped barrel head); Hand Crossbow / Crossbow / Arbalest now differ (bolt, grip, windlass, heavy prod); Frying Pan face no longer black; wand flames; Archmage cradle fixed; thicker whips.
- Icons: long weapons (spear, halberd, staff, scepter, h >= 1.6) are framed on the head (`userData.iconCrop`, bake only).
- Registrations overriding the placeholders live in the "WEAPONS 4" block (`registerWeapons4`). Model heights unchanged, so viewmodel scale tables still apply; first person was only spot-checked (sword, claymore, axe look right). Draw calls 2-8 per weapon.
- Tests: `npm test` green except security.test.js speed-hack timing (server only, load flake). Not done: bows, sling, trident and flail got only the trim/grip ladder; viewmodel montage automation was flaky.

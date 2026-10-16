# Audio and feel polish

Changed: audio.js, feel.js, small hooks in game.js (FEEL3 comments), tests/audio.test.js.

- Weapon swing/hit sounds by family class (blade, axe, pole, blunt, heavy, bow, xbow, magic, fist). Hits layer an armour material sound (cloth, leather, mail, plate). Unknown families fall back by name regex, then blade / leather. `GKAUDIO.weaponClass/armorClass/itemSound(item, action)` are the hooks for new items; `GK.feel.itemUsed(item, action)` plays the right sound for a consumable or gear.
- Footsteps by surface (stone, vault with faint echo, rug in chest rooms, metal), sprint steps louder and brighter.
- New sounds: chest, equip (auto on weapon/armour change), drink, heartbeat (HP < 30%, quiets under load), go (match start).
- Ambient zones: room, chest, vault, sudden death.
- Per-sound rate gates so event bursts never stack into a buzz. Hits on me now play hit + grunt, and a small decaying camera flinch (about 0.03 rad max).
- Not verified in a browser (the worktree has no three module, so the static server 404s it). bots.test.js and security.test.js fail in the worktree on server/static issues unrelated to this change.

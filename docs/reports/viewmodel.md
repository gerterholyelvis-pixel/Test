# First-person viewmodel and per-family attacks

Code: `game.js`, block `VIEWMODEL-BEGIN/END` just before `frame()`. Hooks elsewhere (one line each): `frame()` calls `vmUpdate` (and `vmHide` on the menu path), `combatSwing` / `combatMsg` call `vmSwing`, `{hit}` from me calls `vmHit`, the player-list loop calls `vmGear`, and `combatTick` uses `vmSw` / `vmPose3` / `vmEnd3` in place of the fixed arm sweep. No lights, no render pass, composer untouched. `cam` is added to the scene (near plane was already 0.05) and the viewmodel is a child of the camera.

## What it does
- Weapon from `GK.chestKit.weaponModel(myInv.weapon)` (cloned, scaled per family), held in a stylized goblin hand (green skin, three chunky fingers, thumb, claws, leather bracer). The forearm is anchored off-screen and stretched to the wrist, so only the hand moves. Unarmed: two fists. Environment map plus emissive only.
- Hidden when `inside` is false (overview), in menus, with inventory or shop open, dead or won.
- Clips (length capped to 0.85 x weapon cooldown): sword/dagger diagonal slash with a faint crescent trail (dagger faster and shorter); spear thrust and pull back; axe/mace/club/flail/hammer/halberd overhead wind-up and smash with a camera shake at impact; bow draws (draw hand and arrow move back), releases and spawns a world-space arrow streak; crossbow kicks and fires the same streak; staff/scepter cast flourish with a glow-sprite burst at the tip; fists alternate left/right.
- Idle sway, walk bob from `mine.phase` and speed, look lag, equip animation (lower, swap model, raise) whenever `myInv.weapon` changes, and on a server-confirmed hit from me: hit-stop (about 0.07 s freeze), a recoil kick and extra shake.
- Third person: every goblin (including mine in the `inside` toggle view) carries its weapon in the hand socket (`arms[1].userData.el.userData.hand`; mount stored as `group.userData.vmSocket`). Other goblins' weapon is looked up from `gear.weapon` (a name) in the player list, so no netcode change. `a.swing` now runs for a family-specific duration and `vmPose3` poses arm, elbow and torso per family (slash, thrust, overhead, bow draw, cast, alternating punches).

## Test hooks
`GK.vm.setWeapon(key)` equips locally without the server (offline); `GK.vm.state` is the internal state; `GK.attack()` swings.

## Tested
- `node --check game.js`; offline (`?offline=1`, `GK_BOTS_PASSIVE`) loads and runs. One bug found and fixed (bow clip missing from the clip table crashed the frame loop).
- Mid-attack screenshots (software GL, about 2 fps, frame forced by setting the clip time): `docs/screens/viewmodel-sword.jpg`, `-spear`, `-axe`, `-bow`, `-staff`, `-fist`. A bot's dagger in its hand was seen in third person.
- Club swings, equip swap and camera shake ran in the final run without new console errors.

## Not tested
- Real mouse clicks and pointer lock; real-time feel at 60 fps; the `{hit}` recoil and hit-stop path with a live hit; crossbow, halberd, hammer, flail and scepter visuals; per-family third-person swings (pose code written, only a static dagger socket was seen); online play.
- The viewmodel can clip into a wall when standing very close (no depth tricks, to avoid cloning shared materials). Tier aura sprites on weapons are shrunk in first person and hidden in third person.
- If the item-art agent changes model origin or orientation, tune `VM_GRIP`, `VM_SC`, `VM_TILT` (tables at the top of the block).

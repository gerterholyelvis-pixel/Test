# Goblin models and animation pass

The existing sculpted goblins (see goblin-art.md) already read well per type at gameplay distance, so this pass was kept small and local (game.js, GOBLINART block plus one line in the frame loop).

Changes
- Per-goblin variation: each non-showcase goblin gets a clone of its type's uber material with a small colour multiplier (brightness and a warm/cool swing, half strength for wizard and king), a +-4% size and a +-5% head scale. Same shader program, same shared geometry, no extra draw calls. The title showcase (`demo`) keeps the canonical look. The armour overlay mesh uses the goblin's own material.
- Footwork: stride rate follows leg length (`2.7 / SCALE^0.6`: small goblins scurry, big ones lumber). The hip drops as the legs spread and the stance leg stretches slightly so feet stay near the floor; the swing leg shortens to lift its foot. The old bounce was inverted (body highest when the legs were most spread).
- Run: above about 5.4 m/s (sprint) the stride lengthens, the body leans forward and the free arm swings wider.
- Swing weight (third person, driven by `a.swing`): wind-up crouch and lean back, then a lunge with a wider stance. The arm clips in vmPose3 are untouched.
- Idle: slow weight shift (body roll, torso twist).
- Death: leg scale reset so the slump starts clean.

Files: game.js, docs/screens/art-goblins-variation.jpg.
Tested: node --check; offline match in the browser, lineup of all 5 types plus duplicates, walk and sprint poses, swing and flinch (no new console errors). npm test: everything passes except bots.test.js (server-side bot move and tick-cost checks; this change is client only, likely load from parallel agents).
Not done: new geometry per type (silhouettes were already distinct), directional hit reactions, online check of armour overlays with the cloned material.
Merger note: `A.curMat` is set during buildGoblin so `bake` uses the per-goblin material; anything comparing meshes against `uber(type)` should use `u.mat`.

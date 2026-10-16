# T15: VFX pack

New file `vfx.js` (root, like feel.js and audio.js; the plan's `client/` folder does not exist). Classic script, loaded before game.js; game.js calls `GKVFX.init(THREE, scene, cam, renderer, () => GK.settings.gfx)` once and `GKVFX.update(dt)` from `dfxUpdate`. `server.js` CLIENT_JS gained `vfx`; the CSP needed no change (`script-src 'self'`). Test: `tests/vfx.test.js`.

## System
Two pooled `Points` (glow 360, soft 240 = the 600 hard cap) plus one swing-trail ribbon mesh (5 slots x 12 samples). Typed arrays, no allocation after init, everything inside try/catch hooks. Both pools use normal blending: the facility rooms are white, additive sparks vanished on them (checked in screenshots). Glow particles have a hot core and a saturated rim.

| preset | live cap (of 600) | what runs |
|---|---|---|
| Low | 60 | hit sparks, bolt impacts only |
| Medium | 210 | + puffs, glints, rings, dissolve, trails |
| High | 420 | same, higher cap and counts |
| Ultra | 600 | same |

## Wired effects (hooks tagged `VFX` in game.js)
- COMBAT hit: sparks by weapon family x armour material (plate/mail/metal sparks, cloth/leather dust, bone chips, flesh drops, magic for staffs), impact flash, kill ring.
- Swing trail (melee only): first person arc in front of the camera; other goblins from the swinging arm.
- Footsteps on the foot plant (skipped beyond 12 m, gold glitter in the vault), jump and landing puffs.
- Bolt comet tail and impact burst. Death: motes rise off the body. Chest claim glint.

API for later work (documented in the vfx.js header): `spark`, `hit`, `burst`, `trail`, `bolt`, `boltHit`, `foot`, `land`, `jump`, `dissolve`, `glint`, `ring`, `elixir`, `vault`, `crown`, `embers`, `stats`. Skipped as instructed: effects 4, 8, 10, 12 (post tuning, door light sweep, per-room ambient, damage screen). The existing `doorBurst` is untouched. Not hooked yet: vault/elixir/crown/embers helpers (no call sites exist yet).

## Cost (Chrome headless, D3D11 iGPU, 1280x720, offline match with bots)
- Draw calls added: 0 idle, at most 3 while everything is active (`GKVFX.stats().draws`). Typical hit: 1 to 2.
- CPU in `GKVFX.update`: 0.006 ms idle, 0.02 to 0.09 ms under a stress loop (3 hits, glints, bolt, trail every 6 frames), peak live 60 / 210 / 240 on Low / Medium / High.
- Frame time A/B on Low: 16.65 ms idle vs 16.64 ms stress (60 fps both). Medium 17.2 vs 23.1 ms in the stress run, but that run's frame spikes came from bots and shader compiles (draw calls were lower under stress, 211 vs 226), so treat it as noise. High and Ultra frame times in this headless environment were unusable (GTAO on a software-ish path), so no clean A/B there. Raw: `docs/screens/t15-perf.json`.

## Screenshots (frozen with `GKVFX.hold`)
`docs/screens/t15-hit-sparks.jpg`, `t15-bolt.jpg`, `t15-dissolve-ring-glint.jpg`, `t15-footsteps-gold.jpg`, `t15-swing-trail.jpg`.

## Notes for the merger
- Hooks: `GKVFX.init` + `update` (dfxUpdate), combatMsg hit, GA.die call site (3 lines each), bolt loop and boltEnd, `d.claimed`, jump start/land, the goblin loop (foot), combatTick (trail), and one `VFX-BEGIN/END` block after COMBAT-END (`vfxSurf`, `vfxSwing`).
- Not verified visually: third-person swing trail geometry (arm-local -Y guess), dissolve on a real death, bolt from a real server wand.
- bots.test.js failed once in a full parallel run and passes alone (unrelated, timing under load).
- `node server.js` caches client files in memory: restart it after editing vfx.js or game.js when checking in a browser.

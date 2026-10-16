# 5x5 audio

All procedural, in audio.js. game.js/server.js untouched; wiring is for the Foundation/merge step. This file is the name list (the audio.js header comment was not edited).

Two APIs:
- `GKAUDIO.play(name, {x, z, vol, pitch, muffle, ...})` one-shots. Rate-gated by name (and position bucket if x/z given); low-priority ones drop first at high voice counts.
- `GKAUDIO.bed(name, on, {x, z, vol, v})` managed loops/ambiences (max 8 at once, fade in/out, own timers cleared on stop). Call again with new `x,z` or `v` to update. `GKAUDIO.stopAllBeds()` on round end / disconnect. `GKAUDIO.beds` lists names. Machines/activities use the SFX bus, `tree_*` the ambient bus.

## One-shots (play)
| name | trigger |
|---|---|
| pumpTick | each elixir unit added to the pump tank; `{fill:0..1}` raises pitch |
| pumpCollect | player collects from the pump |
| elixirOpen / elixirClose | Elixir Screen opened / closed |
| elixirConfirm / elixirDenied | purchase accepted / rejected (too poor, locked) |
| upgrade | an upgrade bought |
| raidAlarm | own base raided; 1 s gate |
| sentryShot | sentry fires, positional `{x,z}` |
| doorBar / doorLock | door barred / locked |
| sendGas, sendRats, sendSpikes, sendFire, sendWasps, sendBoulder | the six sendables, played at the target room, positional |
| timingHit / timingMiss | timing-press result |
| captureTick | capture progress step; `{amt:0..1}` raises pitch |
| riskWarn | risk meter crosses a warning threshold |
| rewardChime | any activity reward granted |
| winchCreak | winch room: each crank step |
| lockpickClick | lockpick room: each pin click |
| coinCount | coin-counting room: per coin |
| runeChime | rune room: per rune set; `{freq}` per rune |
| coinPile | treasury pile opened/looted |
| crownClaim | crown claimed (then start `crownLoop` while carried) |
| vaultAlarm | vault alarm tripped |
| wardenRoar | warden spawns/attacks |
| roundHorn | the 2-minute warning horn |
| rekeyWarn | vaultbreaker re-key about to happen |

## Beds (bed)
| name | use |
|---|---|
| pumpHum | pump idle, positional near the pump |
| workbench / recycler / forge / grandRecycler | station loops while in use or nearby (forge = master forge) |
| holdRiser | hold-to-progress activity; pass `{v: progress}` as it changes, off on release |
| runeHum | rune vaultbreaker room while inside |
| crownLoop | while carrying/claiming the crown |
| suddenHeart | sudden death; `{v:0..1}` speeds it up |
| tree_grove (leaf wind), tree_crystal (chimes), tree_bog (drips), tree_ember (crackle), tree_frost (thin wind, ice creaks), tree_fungus (soft pulses), tree_hive (buzz), tree_bones (hollow wind, clacks), tree_spring (water), tree_echo (distant echoing notes) | one per tree-room type; map the game's 10 room type names onto these keys |

Test: tests/audio.test.js builds every sound and bed against a stub WebAudio.

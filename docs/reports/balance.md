# Balance, bot fairness and the vault (playtest pass, phases 2-3)

Code: `items.js` (`SPEED`), `server.js` (`RULES-BEGIN` defaults and `BOLT`, the regen line in the tick loop, `FAIR-BEGIN/END` plus the fight branch of `botThink`, `botLab` ring placement), `game.js` (movement speed line, sudden-death banner). Tests: `tests/balance.test.js` (6 cases), `tests/rules.test.js` updated for the defaults.

## Goblin classes
Before: the Big goblin had the highest damage (mace 20 / 0.65 s = 31 dps), the most health (80) AND the highest speed, because speed scaled with model size (`0.85 + 0.15 * SCALE`, SCALE 1.3 for Big, 0.75 for Small). Small (22 dps, 40 HP) was strictly worse. Wizard did 1 damage per bonk.

Now, shared `GKITEMS.SPEED = [1.12, 1.0, 0.9, 1.0, 0.95]` (Small, Medium, Big, Wizard, King) multiplies walk (4.6) and sprint (7.5):

| Class | dps | HP | sprint m/s | role |
|---|---|---|---|---|
| Small | 22 (dagger) | 40 | 8.4 | fastest: picks fights, escapes, chases wizards |
| Medium | 25 (club) | 50 | 7.5 | all-round |
| Big | 31 (mace) | 80 | 6.75 | slowest: wins stand-up fights, cannot catch anyone |
| Wizard | 9 at 12 m (bolt) + 1 melee | 60 | 7.5 | kites, 80 knowledge |
| King (1 %) | 33 (scepter) | 100 | 7.1 | still the prize |

Bots walk at their class speed too. The server's movement budget derives from `Math.max(...SPEED)`, so the client and the anti-cheat agree by construction.

## Rules now on by default
- **staffbolt** (owner question b): staff and scepter fire a bolt, now **9 damage, 1.0 s** (was 6 / 1.2 s = 5 dps, which could not finish anything). Melee classes still out-damage it threefold up close; the wizard's game is distance.
- **bribe** (owner question c, the additive part): 50 gold for +1 weight on your room's door pick, max 3 per round. It gives gold a second purpose, lets a lone goblin force a vault door, and lets someone trapped inside the vault vote themselves out.
- `GK_RULES` still works: `GK_RULES=crown` adds the crown win, `GK_RULES=-bribe` removes one, `GK_RULES=none` is the old baseline. **doorclose stays off**: doors already close after one round, so door votes are consequential every round. **crown stays off** because it replaces the win condition (owner question a).

## Bot fairness (`FAIR-BEGIN`)
- **Gang cap:** `focusOf()` now also records, per target, the attacking bot ids in order. Only the first `MAX_GANG = 2` swing; the others keep `HOLD_D = 3.6 m` and face the target. Deaths are two-on-one at worst, never a dogpile.
- **Notice delay:** every player records `roomAt` (set by `applyMove` and `place` on a room change). A bot ignores a goblin that arrived less than `BOT_NOTICE = 700 ms` ago, unless that goblin hit it (`hitBy`, set in `hitTarget`). You get a moment to see who is in the room before anyone reacts. Mystery enemies keep their own 1.5 s aggro delay on top.
- **Misses:** before a swing a bot aims 1.5-2.0 rad off target with probability `BOT_MISS = 0.3` (`NPC_MISS = 0.15`), so the server's cone test fails and the swing whiffs. Players see a swing they can punish.
- The old spread penalties (`GANG_PEN`, `HUMAN_PEN`) stay.

## THE VAULT and sudden death
- **Sudden death healing happens only inside THE VAULT.** All doors are open, everyone converges on the centre, and the vault is the one place to recover: the endgame is a fight over the sanctuary, not a slow bleed. The banner says so.
- The relic (tier 3+ on the pedestal), rising merchant prices and the bribe are the other reasons to go there and to spend.

## Verified
- `npm test`: 19 files. Balance cases: speed table and a legit Small sprint uncorrected; default rules advertised and switchable; gang cap (3 bots on a ring, at most 2 hit, one holds at > 2.8 m); notice delay (first hit >= 1.3 s after arrival, or no attack at all in the 6 s window); misses (over 10 s a bot's hits < its swings); sudden-death regen off outside the vault, on inside.
- Not verified by eye: how the hold-back looks in play, whether 0.7 s feels like enough warning at 60 fps, the bolt at 9 damage against a human.

## Open (owner)
- Knowledge still does nothing in a match (tiers 1-5 recipes do not exist), so brains are only worth their glow. That is the next real lever for Small and Wizard.
- Crown win, doorclose, starting gold, stash-to-run: unchanged, see HANDOFF.md.

## Fairness simulation (after this pass)
`node tests/sim-fairness.js 3 1` (tier 5 gear, 9 s rounds, sudden death from round 3, 7 bots): places **2, 1, 2 of 8**, 1-2 kills each, every run reached round 7. QA-3 reported dying in round 3-4 of every such match with the same gear before the gang cap, misses and vault healing.

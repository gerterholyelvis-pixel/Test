# Experimental rules

Four rule toggles. Since the playtest pass `staffbolt` and `bribe` are **on by default** and `crown` / `doorclose` are off (see balance.md); `GK_RULES=none` restores the old baseline, `-rule` removes one. The server turns them on with the `GK_RULES` environment
variable (comma list); clients have no override. The server advertises active rules in the welcome and
round messages (`rules: [...]`), and the client then shows an read-only **Experimental rules** section in
Settings. With `GK_RULES` unset nothing changes: no `rules` field, all new messages ignored.

```bash
GK_RULES=crown,staffbolt npm start
GK_RULES=crown,doorclose,staffbolt,bribe npm start     # everything
```

| Rule | What it does | Try it |
|---|---|---|
| `crown` | Stand on the vault dais (radius 2.2 m) for 20 s without taking damage and you win. Everyone gets an alert ("X is claiming the crown!") and a progress ring on the dais plus a banner. Leaving the dais or being hurt restarts the count. Bots head for the dais (the vault is much more attractive to them) and fight whoever is on it. Humans who lose are put out as spectators; the match summary has `crown: 1`. | Reach the vault, stand on the medallion. Debug servers accept `GK_CROWN_MS=3000` to shorten the count. |
| `doorclose` | A door picked and opened stays open for **2 rounds** (baseline: 1 round), then closes. The panel shows "OPEN . 2 ROUNDS LEFT" / "1 ROUND LEFT"; a klaxon sounds 5 s before a door closes. Sudden death still opens every door. Note the baseline already closes doors after one round, so this rule actually lengthens door life. | Pick a door, see it still open in the next round, with the klaxon before it shuts. |
| `staffbolt` | Staff and scepter weapons fire a slow bolt instead of a melee swing: 6 damage, 12 m range, 1.2 s cooldown, same room only, a glowing additive sprite (no lights). Bots with staves use it as a ranged attack. | Equip the Gnarled Staff (wizard start) and left click. |
| `bribe` | Aim at a door panel in a grid room (after picking a door) and press **B**: pay 50 gold for +1 weight on your room's pick this round (max 3 per room per round). Weight counts toward the vault's "2 players" rule, so one bribed room can open a vault door. The panel shows "BRIBED +n". Bribes reset every round. Failures: no pick yet, too poor, limit. | Pick a vault door alone, press B at the panel. |

Debug servers (`GK_DEBUG=1`) accept `GK_CROWN_MS`.

## Tests
`tests/rules.test.js` starts separate servers per rule: with the rule off (nothing happens) and on (it works).
Covered: no `rules` field when off, crown claim / reset on damage / reset on leaving / win and loser out,
doorclose open for 2 rounds and klaxon (off: 1 round), staffbolt bolt message, 6 damage, slow flight and
cooldown (off: none), bribe weight and gold, vault opened by one bribed room, failure reasons (off: fizzles).

## Not covered
The client visuals (ring, banner, bolt sprite, panel text) are checked by eye only, not by tests.

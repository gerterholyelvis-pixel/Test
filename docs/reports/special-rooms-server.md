# Special rooms: server wiring (act5.js)

`act5.js` (new, Node only) wires `activity.js`, `rooms5-trees.js`, `vb5.js` and `vault5.js` into a match. server.js only got one-line `ACT5` hooks plus the `ACT5-BEGIN/END` block that builds it from server functions. items.js got an `ACT5-ITEMS-BEGIN/END` block. No client file was touched.

## What runs
- **Per match:** 4 tree types are rolled weighted without duplicates (`m.trees`, cells 6 8 16 18). The vaultbreaker manager `VB5.create` sets `m.vb` (cells 7 11 13 17). The vault state is created too.
- **Tick:** 10 Hz from the main loop. It ticks every tree room, every vaultbreaker and the vault (claim, alarm, wardens, coffers, bars, ward, quake), then venting in sudden death. Each room is wrapped in try/catch, logged as `act5 ...`.
- **Round boundary:** the tally runs first. `vaultVotes` adds the Keystone armed, net writs and Cracked extras. `A5.doors` adds Broken doors, drops barred doors (unless Broken or the alarm is on) and adds all 4 doors while the alarm is on. Then `A5.round` pays the treasury, resets bars, despawns wisps, re-keys by derangement, rolls caps over, restocks the relic (rounds 3 and 5) and expires blessings.
- **Crown alarm:** opens the vault doors mid-round. When it ends, the doors it opened close again.
- **Time limit:** `timeLimit` sorts the living goblins with `VAULT5.decide`: claim (5 s at least), then kills, then HP. `matchEnd.decision = {winner, reason, claim, ranking}`. There is no instant win.
- **NPCs:** husk, rootling, warden and wisp records are kept in `m.players` (`npc: kind`, `actNpc`). They have their own brain (`A5.npcThink`) and reuse `npcFight`/`stepTo`. Wisps never attack: they snuff a lit stone after 2 s beside it. At most 16 per match.
- **Hooks:**

  | hook | effect |
  |---|---|
  | `hitTarget` | Fury and Hollow Oak ambush multiplier; breaks channels and drops carries; Thorns blessing reflect |
  | `recalc` | Bark max HP, Fury attack |
  | `die` | claim, carry, blessing and channels lost; Thorn bowl and bounty credit |
  | `noteRoom` | leave hooks; a sack becomes gold when carried out |
  | `bribe` | half of each bribe into the strongbox |
  | `attack` / `useItem` | blocked while carrying |
  | `use2` | the `crownseal` item |
  | `socClose` / `socWelcome` | stop channels on disconnect; resync on resume |

- **Items:** `x:ironwedge` (vb5's `x:wedge` is mapped onto it, because `x:wedge` is already the Door Wedge), `x:skeleton`, `x:goldleaf`, `x:runecharge`, `x:blank`, `x:crownseal`, `x:huskbrain` (use `know` +2), `x:springwater` and `x:blessedwater` (heal 20 / 40, bots drink them), `x:scion`. Icons fall back to existing families.

## Messages
**Client to server:**
- `{act:{r,a,v,x?}}`
- `{lat:ms}`
- `{actDbg:{tree,vb,claim,breach,npcs,elixir,metal}}` (GK_DEBUG only)

`act` validation:
- dropped silently when the player is dead or not entered, before GO, in the wrong room, or the anchor or verb is unknown;
- `actFail:'far'` beyond `r + 1.4 m`;
- at most 8 per second.

**Server to client:**

| message | content |
|---|---|
| `actS:{r,t,e,type,st}` | the room's public view. Sent on change, at most 5 Hz, to the room and its open-door neighbours. Absolute times in `st` are epoch ms; client server-clock = value - `e`. |
| `actMe:{r,chan?,timing?,carry?,bless?,claim,know, ...}` | the goblin's own state. Times are already in server-clock ms. `timing` has `curve:'saw'`: the needle is sawtooth, while hud5 draws a ping-pong. |
| `actFx:{r,k,...}` | one-shot events. My own: `gain`, `treasury`, `hit`/`miss` for your press, `pulse`, `vbNext`, `rekey`, `wispsnuff`. The rest come from the modules. |
| `actFail:reason` | why a verb was refused |
| `toast:text` | a text toast |
| `crown:{claims,gaining,alarm,cof,bars,ward,sudden,min}` or `null` | 4 Hz while the claim changes |
| `trees` | the tree map, again when the Elder withers into a Well |
| `relic` | the relic restock |
| roundState | adds `vb`, `vbNext` (15 s before the end), `breach {doorId}`, `armed`, `writs`, `trees`, `hidden` (held Hollow Oak rooms), `vent`, `crown` |
| `matchEnd.decision` | how the time limit decided the match |

## Tests
New test files:
- `act5-trees`: anchors, Seer, Spring, validation, rate limit and fuzz, reconnect.
- `act5-heist`: writ and counter-writ votes; Keystone arms, opens its door alone, re-key; wisp snuff.
- `act5-crown`: claim beats HP at the time limit; coffer; death loses the claim.

`rules.test.js` now counts only legacy crown progress. When the legacy `GK_RULES` crown rule is on, act5 sends no `crown` message.

Full suite (GK_TEST_JOBS=3): everything passes except the two static-file cases in `security.test.js`. They fail only because this worktree has no `node_modules/three`.

## Not done / not verified
- **Client not wired:** actS/actMe rendering, prompts, the HUD arc and the hiding for `hidden` are all missing.
- **Heavy-carry slowdown** is not enforced on the server. It would kick unpatched clients.
- **Prop footprints:** the activity props are not in `world.js solidsOf` yet (art and world owner). Server and NPCs walk through them.
- **Not tested end to end through the glue:**
  - Ram, Locksmith and Well timing presses
  - Press husk fights (seen spawning in a smoke run)
  - Graft, Gambler, Thorn, Memory, Oak, Elder
  - bars, venting damage, the sudden-death roles

  The pure module tests cover their logic.
- **Remembrance** grants no perk (always +10 knowledge).
- **Elixir:** costs use `p.elixir` and send `{elixir}`. They need the ELIXIR block.
- **Door bars:** doors only stay open one round, so a bar keeps that door shut at the round end.
- **Disconnect:** a disconnected goblin keeps his claim until the grace runs out, but does not count on the dais meanwhile.
- **Sack ids above 63** cannot be picked up (the `x` limit).
- **Bots** ignore the rooms. They still fight the NPCs and can stand on the dais.

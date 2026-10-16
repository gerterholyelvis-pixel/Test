# vault5.js: THE VAULT, pure logic (task A, pure part)

`vault5.js` is UMD (`require('./vault5.js')`, `window.VAULT5`) and registers the ACT room type `'vault'` (kind `vault`, via `activity.js`). No I/O, no timers, no `Date.now()`/`Math.random()`. Times and `dt` are ms. Tests: `tests/vault5.test.js` (28 cases, fake clock, includes 300 simulated 7-round matches checked against an independent oracle).

## Rules as built (owner decisions applied)
- **Crown claim:** cumulative `st.cap.acc[id]` (ms). A goblin ALONE on the dais (r 2.2) and unhurt for 1 s gains 1 s/s; 2+ on the dais freeze everybody; a hit pauses gain 1 s and never resets it. Persists across rounds, lost on death/disconnect (`death`). Sudden death: x1.5. **No instant win** (no 45 s threshold anywhere).
- **Time-limit decision** (`decide`, run by `roundEnd` after round 7 and callable directly): living goblins only; highest claim (a claim under 5 s counts as 0), then kills, then HP, then lowest id. Returns `{winner, name, reason: claim|claim-kills|claim-hp|kills|hp|tiebreak|none, claim, ranking}`. The server should use `winner` for the Goblin King crown and the end-of-match rewards; last-goblin-standing stays the server's existing instant rule.
- **Alarm:** forced-open vault doors while anyone gains, plus 10 s after. `alarmOn(st, now)`. Rising edge: `toastAll("<name> is claiming the crown!")`, `fx('alarm')`.
- **Vault Wardens:** while someone gains, first one 20 s after the claim starts, then every 20 s, max 2 alive, `ctx.spawn('warden', 'grate', {target: claimantId})`. NPC numbers in `VAULT5.NPC.warden` (hp 90, dmg 14, cd 1000, speed 3.4): merge into the server NPC table.
- **Coffers K1..K4:** 3 handfuls each, refill 1 per 15 s (7.5 s in sudden death), `use` = 2 s channel, +12 gold (`ctx.award`, `exempt`), max 6 scoops per goblin per round.
- **Door bars D_N/D_E/D_S/D_W:** `use` = 5 s channel at a rack, only on an OPEN door, only once per door per round, 10 s personal cooldown, refused while the crown alarm is on, on a Broken door, and in sudden death. It queues a close; `roundEnd` returns `close: [dirs]` (dropped if the door became Broken, the alarm is on, or it is sudden). Occupants can bar again every round.
- **Treasury:** `roundEnd` pays every living goblin in the vault 20 gold + 4 knowledge (`exempt` from the tree caps).
- **Relic:** `roundStart(st, ctx, round)` returns `{restock}` true at rounds 3 and 5 when `ctx.relicTaken()`.
- **Venting** (round > 5): `ventTick(st, players, ctx)` deals 1 HP per 3 s per goblin in outer-ring, home and loot rooms (timer restarts on re-entry); one warning toast.
- **Heist hooks for sudden death:** `setWard(st,bool)` (Keystone: top claimant gains at half speed), `quake(st, now)` (Ram: 3 s freeze), `sealClaim(st, p, ctx)` (+5 s, must be on the dais), `topClaimant(st)` (Counting House bounty target).

## Server wiring (ACT block / VAULT5 block)
Constants: `SUDDEN_ROUND 5`, `MAX_ROUND 7` (`VAULT5.K`), `isSudden(round)`, `matchOver(round)`.
- Create: `st = ACT.init('vault', rng, now)` into `m.act['12'] = {type:'vault', st}`. Per tick (10 Hz): `VAULT5.tick(st, ctx, 100)` (via `ACT.tick`), then `VAULT5.ventTick(st, players, ctx)` every tick.
- Verbs: `act {r:'12', a:'K1'|'D_N'|..., v:'use'|'stop'}` -> `ACT.verb(st,'vault',p,v,{a},ctx)` (a bare anchor string also works). The dais needs no verb.
- Hooks: `hitTarget` -> `ACT.hurt` (or `VAULT5.hurt`), room change -> `VAULT5.leave`, `die`/disconnect -> `VAULT5.death(st, p)`.
- Round start: `VAULT5.roundStart(st, ctx, round)`; round end: `r = VAULT5.roundEnd(st, {...ctx, round})`: apply `r.treasury` (the awards already went through `ctx.award`), re-seal `r.close` doors (also keep them out of the vote tally), and if `r.over` end the match with `r.decision`.
- `ctx` needs: `now, round, sudden, occupants()` (living players in room '12', with `x z id name hurtAt`), `players()` (all, with `alive hp kills`), `anchor(id) -> {x,z,r}` for `dais K1..K4 D_* grate`, `award(p, {gold, know, exempt}, src)`, `spawn(kind, anchorId, opts) -> npcId`, `dmg(p, n, src)`, `toastAll`, `fx`, `doorOpen(dir)`, `doorBroken(dir)`, optional `npcAlive(id)`, `relicTaken()`, `roomKind(key)` (default `VAULT5.kindOf` follows the PLAN-5x5 numbering).
- **Vote tally:** the vault doors are forced open while `VAULT5.alarmOn(st, now)`; barred doors are closed at round end by `close`.

## Messages / broadcast fields
- `crown` (to everyone, 4 Hz while claims change; use `VAULT5.view(st, ctx)`): `{claims:[{id,name,s}] (top 3, seconds), gaining: id|null, alarm: bool, cof:{K1..K4: handfuls}, bars:[dirs barred this round], ward, sudden, min: 5}`. There is no `full` field (no instant win); the client should show the leader and the 5 s minimum.
- `actMe` for the vault: add `claim: VAULT5.claimOf(st, p.id)` (seconds) so the dais ring shows the player's own total.
- `actFx` kinds emitted via `ctx.fx`: `alarm {on,id}`, `scoop {a}`, `bar {dir}`.
- End of match: put `decision` (`winner`, `reason`, top `ranking`) into the match-end broadcast so the result screen can say "won by crown claim" vs kills/HP.
- State is JSON-clean (no Infinity); the Ward and sudden flags are plain booleans.

## Not done / notes
- Server wiring (server.js VAULT5 block, `PACE.income` 20, doors forced open in the tally) belongs to the foundation owner. The vault uses placeholder anchor ids: `K1..K4`, `D_N D_E D_S D_W`, `dais`, `grate` (PLAN section 1.5).
- Bots (contest a claimant, scoop, bar when alone) are task G; `spec.bot` is a stub.

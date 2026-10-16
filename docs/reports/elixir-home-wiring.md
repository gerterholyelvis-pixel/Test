# Elixir and home base wiring (tasks H and I)

Wires `elixir.js`, `homebase.js` (pure) and `homeui.js` into the game, end to end. Branch built on main `6dc34af`. `npm test`: 50 files pass (`GK_TEST_JOBS=3`).

## Server (server.js, `ELIXIR-BEGIN/END` after LOOT)
- **State:** `m.homes[homeKey]` = homebase home + `{key, ref (owner record), pump, pickSeen}`, created at GO (`homesInit`). Carried elixir is `p.elixir` (cap 120). Live sends are `m.sends`, one per player and round in `m.sentRound`. The pump fills lazily (`EX.tick`); nothing ticks it.
- **Messages:** `{pump:1}` (anyone in a home, 2.5 m of the pump: owner collects, others raid and the owner gets a toast), `{base:{buy|act|send+room|crack}}`, `{lockbox:{put|take}}`, `{brew:'heal'|'tonic'}`, and `{recycle, refine:1}` inside a home. Replies: `{elixir}`, `{home}` (owner view, every 1.5 s while at home and after each action), `{homeRes}`, `{homeToast}`, `{homeFx}` (send start/stop, spike hit), `{homeDead}`, `{brewed}`.
- **Rules:** screen actions need the owner alive in his own home within 3 m (4/s from homebase, plus 8/s per player over all home messages). Home bench, recycler and screen are owner-only (a dead home is neutral). The home recycler follows the Recycler upgrade, Refine costs 4.
- **Lock:** `pathOk(..., who)` calls `homeGate` when a non-owner steps through a hatch. A refused step starts the pick bar and keeps running while he keeps pushing (600 ms grace). 2 s for L1, 5 s for L2. A lock refusal is not counted as a speed-hack fix. The door guard needed no change: the hatch is always passable for leaving.
- **Security:** Alarm toast to the owner and Snare (root 2 s plus 10 damage, once) happen on room entry (tick). The Sentry fires 8 damage per 1.5 s only while the owner is away. It is hit-scan with a pseudo attacker (`ENV`), not a spawned NPC. The Healing Pad heals 2 HP/s after 2 s unhurt (off in sudden death). Crack channel: 8 s (14 s L2), cancelled if he leaves, owner told at start and at the end.
- **Sends:** `HB.checkSend`/`makeSend`. The 3 s telegraph toast goes only to occupants of the target room and names the sender. `homeFx` goes to everyone without the sender. Gas: 1 damage / 2 s. Rats: 5 NPCs of kind `rat` (5 HP, 2 damage, no loot, see all of the room), removed at the end. Spike: hidden plate, 15 damage plus slow, once (the spot is only sent under `GK_DEBUG`). Jam: sets `m.sealed[room]`, so it is exactly the sealing wax mechanism. Leech: moves half the tank into the sender's carried elixir over 10 s; Pump Guard blocks it.
- **Death** (`die()` hook): carried elixir becomes the pile entry `x:flask:<n>`; taking it (`loot()` hook) adds to the carried elixir under the cap. The pump stops (the tank stays takeable by anyone), `HB.dieHome` (upgrades gone, lock open, box spilled as a pile), `{homeDead}` broadcast.
- **Bots:** when in their own home they collect a tank of 12 or more and buy in order pump, alarm, pump II, lock, recycler, snare, lock II, guard (reserve 8). `pickDest` gets a bonus for the bot's own home when the tank holds 15 or more (30+: strong). Checked in a bot-only run: bots return, collect and hold 13-16 elixir after about 2.5 min; the first purchase is near minute 4. No bot sends or brews.
- **Small edits outside the block** (merge hints): `CLIENT_JS` (+elixir, homebase, homeui), tick line `elixirTick`, `pathOk` signature and one gate line, the `applyMove` fix line (`p.lockDeny`), `die()` addDrop arg, `loot()` flask line, dispatch branches after `d.emote` (home messages, `dbgElixir`, home recycle/craft owner gate), `NPC.rat`, `npcLoot` empty guard, rat vision in `botThink`, `pickDest` home bonus.
- **Debug hook:** `{dbgElixir:{n, tank, lv, dump}}` (GK_DEBUG only).
- **For the Counting House task:** `elixirOil(p, bribesSoFar)` charges 15 elixir for one vault bribe.

## Shared files
- **world.js:** `HOME_LAYOUT.pump/screen/box/sentry` (local frame) plus solid footprints `hpump`, `hscreen`, `hbox`. Both sides read these. `home-art` anchors can replace them (server and client use `HOME_LAYOUT` only).
- **items.js:** `x:draught` (Healing Draught, heal 30, not sold or dropped, recyclable) and `x:flask:<n>` (`G.isFlask`, `G.flaskN`, `info()`). `icons.js`: icons for both.

## Client (game.js, feel.js, index.html)
- `HOME-BEGIN/END` block after ITEMS2-END (`window.GKHOMEW`): creates the home UI, builds its state from `{home}`, inventory and `WORLD.CHEST`, toasts, counter, gas haze (green vignette while in a gassed room), bell reveal on the minimap, Brew row on the workbench panel, Refine button on the recycler panel.
- `buildElixirProps` (placeholder pump with live fill level, screen, lockbox) at `HOME_LAYOUT`; stations `screen`/`pump`/`box` join the E hover (keys `s`, `p`, `b`); feel.js prompts. The rooms5art-home.js builder is not integrated by anyone yet, so the props sit at the world.js anchors; swap by registering its anchors as stations.
- Counter placed under the minimap (`#gkMM`) by a 1 s placer. index.html: scripts `homebase.js`, `homeui.js`; `#gkHome.on` hides the HUD, minimap and counter.
- Rat look in `npcLook` (small, brown).
- Worktree note: no `node_modules` here, so a junction to the main checkout was created (ignored by git).

## Tests
`tests/elixir-home.test.js` (pump collect, cap, raid and owner toast; buys, level order, rate flood, distill cap, foreign screen refused; brew, refine, owner-only; lock L1 pick time, owner never held, alarm, snare once; sends refused in round 1 / vault / own room, nothing charged; death flask, dead home, lock opened, box spilled; crack 8 s, cancel, owner told) and `tests/elixir-sends.test.js` (rats, gas, bell, spike, jam, leech with and without guard). `tests/props.test.js` updated for the new footprints.

## Verified in the browser
Joined a match, opened the Elixir Screen (BASE and SEND tabs rendered, bought Pump II and III through the UI), pump prompt and "+47 elixir" toast, counter under the minimap. No console errors on the fresh page. Not verified: the pointer-locked E key (synthetic key events do not lock), gas haze, bell reveal, Brew/Refine buttons visually, a locked hatch seen from the client.

## Not done / merger notes
- Bench tier and craft time from `HB.benchParams` (Workbench II) are not enforced: that belongs to the stations task (E). The Recycler upgrade and Refine are enforced.
- Sentry is not an NPC body; Alarm "minimap ping" is only the toast (`{homePing}` is sent, nothing draws it).
- Counting House oil, bot sends and bot brewing are left out.
- Offline demo has no elixir.

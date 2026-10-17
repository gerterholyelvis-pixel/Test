# What a winner keeps (KEEP)

Owner request: "work on the logic of what you can keep when you win". Core rule unchanged: **death loses everything**.

## The rule (all numbers in `keep.js` K)
- **Keepsakes**: a winner picks from what it carried at the win. 2 picks at 1-2 victories, 3 at 3-9, 4 at 10+. Crowned +1, decided by the time limit -1, no other human in the match -1 (min 1, max 5). The goblin's own starter weapon and armour are not offered.
- **Idle / farmed wins keep nothing but the victory**: no damage dealt, no kill and not crowned; also a win under 60 s after GO, or a second offer for the same goblin within 90 s.
- **Tiers**: legendary (IV) at most. Transcendent (V) becomes a trophy on the character. Match-bound room items (price 0: keys, seals, wedges, waters) stay behind.
- **Gold**: 20% of gold held (max 30) goes to a bank (max 60). Selling a stash item banks 25% of its price.
- **Stash**: per goblin, 12 items, 2 copies of one key. Overflow sells the third copy, then the lowest-value old item.
- **Bring-in**: before a match (Characters > Play) the player picks from the stash within a budget: 2 points at 1 victory, 3 at 2-3, 4 at 4-9, 5 at 10-24, 6 at 25+. Cost by tier I=1, II=2, III=3, IV=5. One weapon, armour, charm, two consumables. Default: Starter kit. The bank always comes along. Brought items are spent from the stash at match start and are at stake.
- **Consolation**: a saved goblin alive at the end that did not win (crowned or time limit) keeps one consumable of tier II or lower.
- **Bots**: all-bot wins still count as victories (matchmaking already pairs by victories) but give one keepsake fewer.
- **Retire**: a goblin can be retired to a hall (name, victories); its stash goes with it.

## Security (`keepsrv.js`, server.js KEEP hooks)
- Stash and offer tokens are HMAC-signed (GK_SECRET, own `keep|` domain). The server also keeps the newest stash per character in a store (`.gk-keep.json`, or `GK_KEEP_FILE`; memory only under GK_DEBUG). While the store knows a goblin, the store is the truth and a token only proves identity, so old tokens cannot replay spent items.
- Each change bumps a serial: an offer can be claimed once; a stale stash cannot sell or bring.
- Join (`?ktoken=&bring=`) requires a valid character token of the same goblin; victories come from that token. Loadout is checked at join and again at match start (nothing is spent if the queue is cancelled). One instance per goblin may bring a stash (lock).
- `POST /keep` (claim / sell / sync): origin check, 30 req/min per IP, 8 KB body.
- Limit: on a host whose disk is wiped (Render free plan), the store is lost on redeploy and the newest token the player holds becomes the truth; a player who kept an older token could replay it once. Mount a disk or set GK_KEEP_FILE in production.

## Client
- `keepui.js`: victory card step "Choose what to keep" (tier-framed icons with roman numerals, n/N meter, stash and bank line, overflow warning, preview of the strongest start next match within budget); leaving the card keeps the current choice. Start loadout picker (budget pips, preview, Starter kit / Best fit). Inventory: a stash per goblin with Sell and Retire; old global stash shown as "old relics". Toasts for brought-in / refused.
- `save.js` version 2 (all fields optional, version 1 saves load unchanged). Stats page: "Keepsakes kept", "Stash items brought in". How to Play: panel 6. "Queue again" after a win now queues as the saved goblin.

## Tests
- `tests/keep.test.js`: pure rules, save.js migration, and a 50-win worst-case sim: start power 108 at 1 victory, 354 from 25 on, flat after (cap = best budget-6 pair), stash <= 12, bank <= 60.
- `tests/keep-server.test.js`: win -> claim, double claim, forged/edited/foreign tokens, over budget / slot / dup picks, busy lock, replay after death, cancelled queue, sell/sync, resume resend, idle win, time-limit consolation, store survives a restart.
- Browser (GK_DEBUG local server): two wins, keep, bring a Halberd in, die, sell; no console errors.

Not done: Codex (tools/gameinfo.js) has no keep table yet.

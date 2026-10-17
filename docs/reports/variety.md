# Variety: affixes, mutators, new enemies

Three small systems, each in its own file with tagged hooks (`AFFIX`, `MUTATORS`, `NPCX`).

## 1. Item affixes (`affix.js`, hook block in `items.js`)
- 14 affixes (8 weapon, 6 armour): Keen, Heavy, Swift, Long, Balanced, Jagged (bleed chance), of Embers (burn chance), Vampiric (tiny lifesteal); Sturdy, Hardy, Fleet, Lithe, Thorny, of Spines. No knockback effects.
- Found gear only (chests, mystery weapon/armour rooms, enemy loot via `G.foundKey`). Shop stock, crafted, starter and class gear never roll. Chance of a first affix rises with tier (12% to 50%), a second follows 35% of the time.
- The key carries the result: `w:sword@keen,heavy`, reforged `w:sword@keen+`. `ITEMS` is a Proxy that mints `ITEMS[key]` on first lookup (so every existing `ITEMS[key]` / `info(key)` caller, server and client, works), and `Object.keys(ITEMS)` still lists only plain items. Roll is a pure function of (item, seed); the seed is spent at drop time and the key is the stored result.
- Cap: an affixed item is never worth more than 15% over the plain one (`power()`; rolls only pick eligible affixes), so it cannot beat a clearly better tier. Sim test covers every item with every one and two affix set.
- Recycle gives the plain yield; reforge keeps affixes (`+` suffix); crafting only makes plain gear; sale price +15% per affix.
- Server: `combat()` returns `bleedAff`, `leech`, scaled `cd` and `range`; `affixHit` applies them (leech stops in sudden death). `MAX_ARMOR_SPEED` includes Fleet/Lithe so the anti-cheat budget is unchanged in practice.
- Client: names and descriptions show automatically (tooltip italic line); models/icons use the plain item (`itemart.canon`, `game.js` `key.slice(2).split('@')[0]`). Codex section "Item affixes".

## 2. Match mutators (`mutators.js`)
Rolled when the match closes (30%): Double Elixir, Brain Rain, Glass Cannon, Fast Doors, Scavenger, Bounty Hunt, Fog, Heavy Gold. Server reads bounded multipliers through `mutMul(m, key)`; announced at GO as `{mut}` (banner toast plus a small line under the round timer), sent again on resume. Bots are affected through the same server paths (damage, health, vision range, income). `GK_MUTATOR=<id|none>` forces one (GK_DEBUG). Codex table "Match mutators".

## 3. New mystery-room enemies (`npcx.js`)
Bomber (dies, ring, explodes 0.9 s later, goblins only), Summoner (keeps distance, two imps at a time), Shieldbearer (70% less damage from the front), Thief (steals 25% of gold, 10-60, runs; killer gets it back, else it escapes). Built on the NPC table, `npcFight`, `dieNpc`; tinted/scaled goblin models, `GKVFX.ring` telegraphs, toasts. Weights added in `randomMystery` (150 total). `GK_ENEMY=<kind>` forces one (GK_DEBUG).

## Tests
`tests/affix.test.js`, `tests/mutators.test.js`, `tests/npcx.test.js`.

## For the merger
- Merged main once (keep-on-win included): keys stay plain strings, so keepsakes carry affixed keys unchanged. Note `fskeep`/keep rules should accept `@` in item keys (they validate through `G.info`).
- Not done: offline demo does not roll affixes in chests; the mimic enemy was skipped (needs room-art work); fog is a plain `FogExp2` on the main scene (not visually reviewed in a browser).

// RARE (docs/reports/rare-items.md): the rarity ladder, the published drop weights per loot source, 26 rare / mythic / legendary / transcendent items with unique mechanics,
// and the pure helpers (tier roll, item pick, exact drop chance, luck, the once-per-match cap on transcendent drops). UMD: window.GKRARE in the browser (load BEFORE items.js), require() in Node.
// Nothing here touches the clock or Math.random: every roll takes `rnd` (default Math.random), so tests can seed it. The server (raresrv.js) applies the mechanics; items.js calls install().
(function (root) {
  'use strict';
  // The six tiers the game already has (items.js TIER_NAMES). The ladder below is the published drop table: nominal percent per rung for each source.
  // Player-facing mapping of the design brief onto the existing tiers: common 60 -> common, uncommon 25 -> uncommon, rare 10 -> rare, "epic" 4 -> mythic (tier 3, purple),
  // legendary 0.9 -> legendary (tier 4, gold), one-of-a-kind 0.1 -> transcendent (tier 5, cyan; at most one per kind per match, a trophy that cannot be banked or recycled).
  const TIERS = ['common', 'uncommon', 'rare', 'mythic', 'legendary', 'transcendent'];
  const KINDS = ['weapon', 'armor', 'charm', 'consumable'];
  const SOURCES = {
    chest:    { label: 'Chest rooms', w: [60, 25, 10, 4, 0.9, 0.1], note: 'Weapons only; rolled once per match when the match forms.' },
    mystery:  { label: 'Mystery rooms (weapon or armour)', w: [56, 27, 11, 4.9, 1, 0.1], note: 'A gamble room: a little better than a chest.' },
    hall:     { label: 'Hall containers (searches)', w: [62, 25, 9.5, 3, 0.45, 0.05], note: 'Racks and lockers; the profile can demand a minimum tier, then the rungs below it are dropped and the rest renormalised.' },
    kill:     { label: 'Enemy drops (mystery enemies, wardens, wisps)', w: [66, 24, 7.5, 2.2, 0.28, 0.02], note: 'Each enemy kind sets a minimum tier for its gear; the rungs below it are dropped and the rest renormalised.' },
    heist:    { label: 'Heist and vault rewards', w: [35, 30, 20, 11, 3.5, 0.5], note: 'Vaultbreaker and activity-room rewards: the best odds outside the treasure.' },
    merchant: { label: 'Merchant stock', w: [62, 26, 8.5, 3, 0.45, 0.05], note: 'Five items per shop, rolled once per match; the price scales with the tier.' },
    treasure: { label: 'Treasure (the vault relic pedestal)', w: [0, 0, 0, 78, 20, 2], note: 'Always mythic or better.' },
  };
  // Tree rooms keep their own tier rules (Elder rewards, graft prizes: a minimum tier, weighted by each item's weight). They share the same item weights, so a rare item's share of a tree reward is shown by dropChance(.., 'tree', { min }).
  SOURCES.tree = { label: 'Tree rooms (Elder reward, graft prize)', w: null, note: 'Reward tier is set by the tree (mythic or better); within it every item is weighted by its drop weight.' };
  // Luck (the Four-Leaf Clover): multiplies the weight of rung t by LUCK_MUL[t] ** luck. It never touches the top rung, so a trophy stays pure chance. Only live rolls (kills, hall searches, trees, heists) can use it: chests and mystery rooms are rolled when the match forms.
  const LUCK_MUL = [1, 1, 1.25, 1.5, 1.8, 1];
  // One rarity colour / glow per tier: the in-game tables (game.js TIER_COL, itemart.js GLOW) already agree with these. `fx` = the pickup announcement: toast seconds, particle count, chime (audio.js).
  const STYLE = {
    uncommon: { css: '#4fc35b', hex: 0x4fc35b, glow: 0.3, fx: null },
    rare: { css: '#4a9bff', hex: 0x4a9bff, glow: 0.5, fx: { toast: 2.4, sparks: 10, chime: 1 } },
    mythic: { css: '#b06bff', hex: 0xb06bff, glow: 0.8, fx: { toast: 3.2, sparks: 18, chime: 2 } },
    legendary: { css: '#ffb02e', hex: 0xffb02e, glow: 1.1, fx: { toast: 4, sparks: 28, chime: 3 } },
    transcendent: { css: '#7ff4ff', hex: 0x7ff4ff, glow: 1.5, fx: { toast: 5.5, sparks: 44, chime: 4 } },
  };

  // ---- the items. [key, type, name, family, tier, stat/null, price, rw (drop weight inside its tier and kind), desc (mechanic), lore, extra]
  // Stats sit inside the band of their tier (docs/reports/balance-3.md): the mechanic is a small edge, not a bigger number. weapon stat = attack, armour stat = health.
  const DEFS = [
    // -- weapons
    ['w:echodirk', 'weapon', 'Echo Dirk', 'dagger', 'rare', 13, 130, 4.5, 'Every third blow you land strikes twice: the echo hits for 60%.', 'Stabbed once, it remembers twice.', { combo: { every: 3, mul: 0.6 } }],
    ['w:gravespade', 'weapon', "Gravedigger's Spade", 'axe', 'rare', 22, 140, 4, 'Hits for 35% more against a goblin under 30% health.', 'It has dug for every goblin that ever lay down.', { exec: { below: 0.3, mul: 1.35 } }],
    ['w:hungerblade', 'weapon', 'Hungering Blade', 'sword', 'mythic', 24, 260, 3, 'Grows +1.5 damage with every kill this life, up to +8. Resets when you die.', 'It was never sharpened. It was fed.', { grow: { per: 1.5, max: 8 } }],
    ['w:leechfang', 'weapon', 'Leechfang', 'dagger', 'mythic', 19, 250, 2.8, 'Heals you for 12% of the damage you deal (at most 3 a blow). Stops in sudden death.', 'A bat-toothed knife that never dries.', { leech: { frac: 0.12, cap: 3 } }],
    ['w:wardbreaker', 'weapon', 'Wardbreaker Maul', 'hammer', 'legendary', 60, 470, 1.4, 'A landed blow shatters a Ward Rune or Stoneskin on the target, and staggers it for 0.6 s.', 'Forged for goblins who think they are safe.', { shatter: { stagger: 600 } }],
    ['w:stormtongue', 'weapon', 'Stormtongue', 'whip', 'legendary', 38, 480, 1.5, 'Each blow also lashes a second goblin within 3 m of the target for 50%.', 'It speaks in lightning and never finishes a sentence.', { chain: { r: 3, mul: 0.5 }, tune: { range: 3.6, cd: 520 } }],
    ['w:kingsbane', 'weapon', 'Kingsbane', 'sword', 'transcendent', 76, 900, 0.5, 'Hits 40% harder against the goblin with the most kills in the match.', 'Every crown it met is still in two pieces.', { bane: { mul: 1.4 } }],
    // -- armour
    ['a:stonebark', 'armor', 'Stonebark Shell', 'timber', 'rare', 84, 150, 3.5, 'Heavy blows cannot stagger you, and bleeds hurt you half as much.', 'The heartwood remembers every axe.', { firm: { bleed: 0.5 }, speed: 0.96 }],
    ['a:mossback', 'armor', 'Mossback Hide', 'fur', 'rare', 80, 140, 4, 'Regrows 1 HP a second once you have gone 3 s without being hit. Stops in sudden death.', 'Moss grows on whoever stands still.', { moss: { after: 3000, hp: 1 }, speed: 0.98 }],
    ['a:mirrorscale', 'armor', 'Mirrorscale Mail', 'mail', 'mythic', 100, 280, 2.8, 'Arrows, bolts and thrown weapons deal 30% less to you, and a third of what they would have dealt flies back at the shooter.', 'Polished until the archers see themselves.', { mirror: { cut: 0.3, back: 0.33 } }],
    ['a:bloodplate', 'armor', 'Bloodpact Plate', 'plate', 'mythic', 112, 290, 2.6, 'Thorns 4. Every time the thorns bite, you heal 2 HP.', 'Signed in a hand that was not yours.', { thorns: 4, speed: 0.95, sip: 2 }],
    ['a:phasecloak', 'armor', 'Phasecloak', 'cloak', 'legendary', 125, 460, 1.2, 'The first blow that would hit you each round passes straight through.', 'Worn so thin that the first strike finds only the wall behind.', { phase: 1, speed: 1.1 }],
    ['a:lastbastion', 'armor', 'Aegis of the Last Stand', 'plate', 'transcendent', 245, 880, 0.45, 'No single blow can take more than 25% of your maximum health.', 'It has outlasted every hero who carried it.', { bastion: 0.25, speed: 0.94 }],
    // -- charms (the one passive slot)
    ['c:bloodstone', 'charm', 'Bloodstone', 'bloodstone', 'rare', null, 120, 4, 'Wear it: a kill heals you 4 HP. Stops in sudden death.', 'Warm to the touch after a fight.', { eff: { onKill: 4 }, shop: 0 }],
    ['c:ironknot', 'charm', 'Ironwill Knot', 'ironknot', 'rare', null, 120, 4, 'Wear it: your dash recovers 25% faster.', 'Pull it tight and the legs stop asking.', { eff: { dashCd: 0.75 }, shop: 0 }],
    ['c:grudge', 'charm', 'Grudge Stone', 'grudge', 'mythic', null, 250, 2.4, 'Wear it: you hit 25% harder, for 8 s, against whoever last hurt you.', 'It keeps the name of the last one who made you bleed.', { eff: { grudge: 1.25, grudgeMs: 8000 }, shop: 0 }],
    ['c:clover', 'charm', 'Four-Leaf Clover', 'clover', 'mythic', null, 260, 2, 'Wear it: the loot you find from kills, searches, trees and heists leans toward the rarer tiers. It never improves the one-of-a-kind rung.', 'Found where nothing grows. Keep it dry.', { eff: { luck: 1 }, shop: 0 }],
    ['c:lantern', 'charm', "Seeker's Lantern", 'lantern', 'mythic', null, 270, 2, 'Wear it: goblins standing in the eight rooms around the Vault show on your minimap.', 'Its light only shows the ring around the crown.', { eff: { ringSight: 1 }, shop: 0 }],
    ['c:thunderfang', 'charm', 'Thunder Tooth', 'thunderfang', 'legendary', null, 450, 1.4, 'Wear it: every fifth blow you land is a thunderclap, +50% damage and a stagger.', 'Whoever bit the sky for this tooth is still deaf.', { eff: { clap: 5, clapMul: 1.5 }, shop: 0 }],
    ['c:phoenix', 'charm', 'Phoenix Ember', 'phoenix', 'legendary', null, 480, 1.2, 'Wear it: once each round, a blow that would kill you leaves you on 1 HP instead.', 'Still glowing. It does not like being told it is out.', { eff: { revive: 1 }, shop: 0 }],
    // -- consumables
    ['x:stoneskin', 'consumable', 'Stoneskin Tonic', 'stoneskin', 'rare', null, 70, 4, 'Drink it: for 10 s you take 35% less damage.', 'Tastes of gravel. Works like gravel, too.', { use: 'stoneskin', n: 0.65, ms: 10000 }],
    ['x:bloodlust', 'consumable', 'Bloodlust Brew', 'bloodlust', 'mythic', null, 130, 2.6, 'Drink it: for 12 s you heal 25% of the damage you deal (at most 5 a blow). Weak in sudden death.', 'Brewed from something that was angry first.', { use: 'bloodlust', n: 0.25, cap: 5, ms: 12000 }],
    ['x:stormflask', 'consumable', 'Storm Flask', 'stormflask', 'mythic', null, 140, 2.4, 'Smash it at your feet: goblins within 3.5 m take 10 damage and cannot attack for 1.5 s. You are spared.', 'A lightning bolt, poured out and corked.', { use: 'stormflask', n: 10, r: 3.5, ms: 1500 }],
    ['x:hourglass', 'consumable', 'Hourglass Sand', 'hourglass', 'legendary', null, 220, 1.4, 'Pour it out: your dash is ready at once, and recovers twice as fast for 10 s.', 'Every grain is a second somebody else lost.', { use: 'hourglass', ms: 10000 }],
    ['x:phoenixtear', 'consumable', 'Phoenix Tear', 'phoenixtear', 'legendary', null, 230, 1.2, 'Drink it: heals 60% of your maximum health at once (half in sudden death).', 'One drop. Do not spill it.', { use: 'phoenixtear', n: 0.6 }],
    ['x:feast', "consumable", "King's Feast", 'feast', 'transcendent', null, 600, 0.5, 'Eat it: +25 maximum health until you die, and a full heal. One-of-a-kind: you cannot bank or recycle it.', 'Set for a king who never came back for dinner.', { use: 'feast', n: 25 }],
  ];
  const KEYS = DEFS.map(d => d[0]);
  const TIER_N = { common: 0, uncommon: 1, rare: 2, mythic: 3, legendary: 4, transcendent: 5 };
  // What a recycler returns: a handful of parts at most (these are finds, not scrap). Transcendent items are trophies: no recycling at all.
  const SCRAP = { rare: { bone: 1, string: 1 }, mythic: { metal: 1, bone: 1 }, legendary: { metal: 1, gold: 1 }, transcendent: null };

  // Add the items to the shared ITEMS table. Called once by items.js (its TIER_N / WEAPON_TUNE / RECIPES are not needed: nothing here is craftable).
  function install(ITEMS, WEAPON_TUNE, WEAPONS, ARMOR, CHARM_KEYS, UTIL_KEYS) {
    for (const [key, type, name, family, tier, stat, price, rw, desc, lore, x] of DEFS) {
      const base = { key, type, name, family, chance: 0, tier, tierN: TIER_N[tier], price, rare: 1, rw, desc, lore, scrap: SCRAP[tier], ...(tier === 'transcendent' ? { trophy: 1 } : null) };
      if (type === 'weapon') { ITEMS[key] = { ...base, attack: stat }; WEAPONS[key.slice(2)] = { name, attack: stat, family, chance: 0, tier }; if (x.tune) WEAPON_TUNE[key] = x.tune; if (x.combo) ITEMS[key].combo = x.combo; for (const f of ['exec', 'grow', 'leech', 'shatter', 'chain', 'bane']) if (x[f]) ITEMS[key][f] = x[f]; }
      else if (type === 'armor') { ITEMS[key] = { ...base, health: stat }; ARMOR[key.slice(2)] = { name, health: stat, family, chance: 0, tier }; for (const f of ['firm', 'moss', 'mirror', 'sip', 'phase', 'bastion']) if (x[f] != null) ITEMS[key][f] = x[f]; if (x.speed) ITEMS[key].speed = ARMOR[key.slice(2)].speed = x.speed; if (x.thorns) ITEMS[key].thorns = ARMOR[key.slice(2)].thorns = x.thorns; }
      else if (type === 'charm') { ITEMS[key] = { ...base, eff: x.eff, shop: 0 }; }
      else { ITEMS[key] = { ...base, use: x.use, n: x.n, ms: x.ms, r: x.r, cap: x.cap, shop: 0 }; }
    }
  }

  // ---- the roll
  const kindOf = it => it.type === 'consumable' ? 'consumable' : it.type;
  const poolCache = new WeakMap();
  function pools(ITEMS) {   // kind -> tier -> [[key, weight]]; legacy gear weighs its chance, legacy charms and utilities their shop weight, the new items their rw
    let P = poolCache.get(ITEMS); if (P) return P;
    P = { weapon: [[], [], [], [], [], []], armor: [[], [], [], [], [], []], charm: [[], [], [], [], [], []], consumable: [[], [], [], [], [], []] };
    for (const k of Object.keys(ITEMS)) {
      const it = ITEMS[k]; if (!it || it.up || it.root) continue;
      if (it.type !== 'weapon' && it.type !== 'armor' && it.type !== 'charm' && it.type !== 'consumable') continue;
      const w = it.rare ? it.rw : it.type === 'weapon' || it.type === 'armor' ? it.chance : it.shop;
      if (!(w > 0) || !(it.tierN >= 0 && it.tierN <= 5)) continue;
      P[kindOf(it)][it.tierN].push([k, w]);
    }
    poolCache.set(ITEMS, P); return P;
  }
  const sum = a => { let s = 0; for (const x of a) s += x; return s; };
  // The weights of the rungs for one roll: the source's ladder, zero below `min`, zero where the pool has nothing, luck applied, rung 5 removed when `cap5` (a trophy of this kind was already minted this match).
  function rungs(P, kind, src, o) {
    const S = SOURCES[src] || SOURCES.chest, base = S.w || SOURCES.chest.w, min = (o && o.min) | 0, luck = (o && o.luck) || 0, w = [];
    for (let t = 0; t < 6; t++) {
      let v = base[t]; if (t < min || !P[kind][t].length || (t === 5 && o && o.cap5)) v = 0;
      if (v && luck > 0) v *= Math.pow(LUCK_MUL[t], luck);
      w.push(v);
    }
    if (!sum(w)) { for (let t = 5; t >= 0; t--) if (P[kind][t].length && !(t === 5 && o && o.cap5) && t >= min) { w[t] = 1; return w; } for (let t = 5; t >= 0; t--) if (P[kind][t].length) { w[t] = 1; return w; } }
    return w;
  }
  function draw(ws, rnd) { let r = rnd() * sum(ws); for (let i = 0; i < ws.length; i++) { if ((r -= ws[i]) < 0) return i; } for (let i = ws.length - 1; i >= 0; i--) if (ws[i] > 0) return i; return 0; }
  // pick(ITEMS, kind, src, o): a key. o = { rnd, min (lowest tier), luck, ctx }. ctx is the per-match object { t5: { weapon: 1, ... } }: one transcendent per kind per match, then the rung is closed.
  function pick(ITEMS, kind, src, o) {
    o = o || {}; const rnd = o.rnd || Math.random, P = pools(ITEMS), ctx = o.ctx;
    const w = rungs(P, kind, src, { min: o.min, luck: o.luck, cap5: !!(ctx && ctx.t5 && ctx.t5[kind]) });
    const t = draw(w, rnd), pool = P[kind][t]; if (!pool.length) return null;
    const key = pool[draw(pool.map(e => e[1]), rnd)][0];
    if (t === 5 && ctx) (ctx.t5 || (ctx.t5 = {}))[kind] = 1;
    return key;
  }
  // The exact chance that one roll of `kind` at `src` returns `key` (no luck, cap not reached). o: { min }. For 'tree' the rung is not rolled: the share inside every tier >= min.
  function dropChance(ITEMS, key, src, o) {
    const it = ITEMS[key]; if (!it) return 0; const P = pools(ITEMS), kind = kindOf(it), t = it.tierN | 0, pool = P[kind][t], me = pool.find(e => e[0] === key);
    if (!me) return 0;
    const inTier = me[1] / sum(pool.map(e => e[1]));
    if (src === 'tree') { const min = (o && o.min) | 0; if (t < min) return 0; let tot = 0; for (let u = min; u < 6; u++) tot += sum(P[kind][u].map(e => e[1])); return me[1] / tot; }
    const w = rungs(P, kind, src, { min: o && o.min }); return sum(w) ? w[t] / sum(w) * inTier : 0;
  }
  // The effective rung odds for a kind at a source (what the ladder becomes once empty rungs are dropped): [pct x 6].
  function effective(ITEMS, kind, src, o) { const w = rungs(pools(ITEMS), kind, src, o), s = sum(w); return w.map(v => s ? v / s * 100 : 0); }
  const luckOf = (ITEMS, charmKey) => { const it = charmKey && ITEMS[charmKey]; return it && it.eff && it.eff.luck || 0; };
  // the luck of the goblin with this id in match m (m.players is a Map of key -> player; the killer of a mystery enemy, the searcher of a hall)
  function killerLuck(ITEMS, m, id) { if (!m || !m.players || id == null) return 0; for (const p of m.players.values()) if (p.id === id && p.inv && !p.npc) return luckOf(ITEMS, p.inv.charm); return 0; }

  const API = { TIERS, KINDS, SOURCES, LUCK_MUL, STYLE, DEFS, KEYS, SCRAP, install, pools, rungs, pick, dropChance, effective, luckOf, killerLuck, kindOf, isRare: it => !!(it && it.rare), isTrophy: it => !!(it && it.trophy) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.GKRARE = API;
})(typeof window !== 'undefined' ? window : globalThis);

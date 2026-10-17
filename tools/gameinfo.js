// Goblin King Codex generator: documents everything in the game, straight from the real modules (items.js, world.js, elixir.js, homebase.js, activity.js,
// rooms5-trees.js, vb5.js, vault5.js) and from constants read out of server.js, so no number in the page is copied by hand.
//   node tools/gameinfo.js            (npm run gameinfo)  -> docs/game-info.html   (a single file: open it in a browser, or visit /codex on a running server)
//   require('./tools/gameinfo.js').build() -> { html, data }   (server.js uses this to regenerate a missing or stale page at start)
// The page template is tools/gameinfo.template.html (CSS + the renderer); this file only builds the data.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SOURCES = ['items.js', 'world.js', 'elixir.js', 'homebase.js', 'camterm.js', 'activity.js', 'rooms5-trees.js', 'vb5.js', 'vault5.js', 'server.js', 'tools/gameinfo.js', 'tools/gameinfo.template.html'];
const OUT = path.join(ROOT, 'docs', 'game-info.html');
function srcHash() { const h = require('crypto').createHash('sha1'); for (const f of SOURCES) h.update(rd(f).replace(/\r\n?/g, '\n')); return h.digest('hex').slice(0, 8); }   // line-ending independent
const G = require('../items.js'), WORLD = require('../world.js'), EX = require('../elixir.js'), HB = require('../homebase.js'), CT = require('../camterm.js');
const ACT = require('../activity.js'), T5 = require('../rooms5-trees.js'), VB = require('../vb5.js'), V5 = require('../vault5.js');
const SRC = { server: rd('server.js'), items: rd('items.js') };

// ---------------------------------------------------------------- read constants out of server.js (it cannot be required: it starts listening)
// finds `const NAME = ...` or `, NAME = ...` and evaluates the expression with the debug switches off, so GK_DEBUG-only overrides fall back to the real default
function srvConst(name, src) {
  const s = src || SRC.server, m = new RegExp('(?:const\\s+|,\\s*)' + name + '\\s*=\\s*').exec(s);
  if (!m) throw new Error('gameinfo: server.js has no constant ' + name);
  let i = m.index + m[0].length, depth = 0, q = null;
  const st = i;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (depth === 0 && (c === ',' || c === ';' || c === '\n')) break;
  }
  const expr = s.slice(st, i).trim();
  try { return new Function('DBG', 'process', 'return (' + expr + ')')(false, { env: {} }); } catch (e) { throw new Error('gameinfo: cannot evaluate server.js ' + name + ': ' + e.message); }
}
// a number captured by a regex from a source file (for the few values that sit inside code, not in a named constant)
function srcNum(re, src, what) { const m = re.exec(src || SRC.server); if (!m) throw new Error('gameinfo: cannot find ' + what); return +m[1]; }

// ---------------------------------------------------------------- small helpers
const R = (v, d = 1) => +(+v).toFixed(d);
const S = ms => (ms >= 1000 ? R(ms / 1000, 2) + ' s' : ms + ' ms');          // 12000 -> '12 s'
const pct = (n, tot) => tot ? R(100 * n / tot, 2) : 0;
const bar = (v, max) => ({ v, bar: max || 100 });                              // a percentage cell: number and a bar scaled to max
const link = (v, href) => ({ v, href });
const name = k => (G.ITEMS[k] && G.ITEMS[k].name) || k;
const itemLink = k => G.ITEMS[k] ? link(G.ITEMS[k].name, '#' + tabOfItem(G.ITEMS[k]) + '/' + k) : String(k);
const tabOfItem = it => it.type === 'weapon' ? 'weapons' : it.type === 'armor' ? 'armour' : 'items';
const parts = o => Object.entries(o || {}).map(([k, v]) => v + ' ' + k).join(', ');
const tierCell = it => ({ v: it.tier, cls: 't' + it.tierN, sort: it.tierN });
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------------------------------------------------------------- server numbers
const SV = {
  ROUND_MS: srvConst('ROUND_MS'), SUDDEN_ROUND: srvConst('SUDDEN_ROUND'), MAX_ROUND: srvConst('MAX_ROUND'), PACE: srvConst('PACE'), BOLT: srvConst('BOLT'), BRIBE: srvConst('BRIBE'),
  CAP: srvConst('CAP'), QUEUE_MS: srvConst('QUEUE_MS'), RULE_DEFAULT: srvConst('RULE_DEFAULT'), RULE_NAMES: srvConst('RULE_NAMES'), NPC: srvConst('NPC'), STATION_TYPES: srvConst('STATION_TYPES'),
  DOOR_LIFE: srvConst('DOOR_LIFE'), CELL_ROUND: srvConst('CELL_ROUND'), KLAXON_MS: srvConst('KLAXON_MS'), WALK: srvConst('WALK'), SPRINT: srvConst('SPRINT'), SEE_FAR: srvConst('SEE_FAR'), SEE_NEAR: srvConst('SEE_NEAR'),
  SEE_HIT_MS: srvConst('SEE_HIT_MS'), SEE_MEM_MS: srvConst('SEE_MEM_MS'), BOT_GRACE: srvConst('BOT_GRACE'), BLEED_MS: srvConst('BLEED_MS'), USE_CD: srvConst('USE_CD'), BOMB_FUSE: srvConst('BOMB_FUSE'),
  MAX_PLACED: srvConst('MAX_PLACED'), BAIT_LIFE: srvConst('BAIT_LIFE'), LURE_MS: srvConst('LURE_MS'), LURE_RANGE: srvConst('LURE_RANGE'), GRACE_MS: srvConst('GRACE_MS'),
  FOV: srcNum(/Math\.cos\((\d+) \* Math\.PI \/ 180\)/, null, 'the vision cone'), BOUNTY_CAP: srcNum(/Math\.min\(t\.gold \|\| 0, (\d+)\)/, null, 'the bounty gold cap'),
  PRICE_STEP: srcNum(/1 \+ (0\.\d+) \* Math\.max\(0, round - \d+\)/, null, 'the shop price step'), PRICE_FROM: srcNum(/1 \+ 0\.\d+ \* Math\.max\(0, round - (\d+)\)/, null, 'the shop price round'),
  SHOP_UTIL: srcNum(/Math\.random\(\) < (0\.\d+)\) \{ const k = pickUtil/, SRC.items, 'the shop utility chance'), SHOP_CHARM: srcNum(/Math\.random\(\) < (0\.\d+)\) \{ const idx/, SRC.items, 'the shop charm chance'),
};
const homePhaseDoc = fs.existsSync(path.join(ROOT, 'docs/reports/home-phase.md'));
const homePhaseConst = (SRC.server.match(/(?:const|,)\s+(HOME_PHASE\w*)\s*=\s*([^,;\n]+)/) || null);

// ---------------------------------------------------------------- items
const items = Object.values(G.ITEMS).filter(i => !i.up);
const twin = k => G.ITEMS[k + '+'];
const recOf = {}; for (const r of G.RECIPES) recOf[r.out] = r;
const weapons0 = items.filter(i => i.type === 'weapon'), armours0 = items.filter(i => i.type === 'armor');
const wTot = weapons0.reduce((s, i) => s + i.chance, 0), aTot = armours0.reduce((s, i) => s + i.chance, 0);
const relicPool = items.filter(i => (i.type === 'weapon' || i.type === 'armor') && i.chance > 0 && i.tierN >= 3), relicTot = relicPool.reduce((s, i) => s + i.chance, 0);
const scrap = k => parts(G.recycleYield(k));
const mysteryKinds = 6;   // randomMystery picks one of six kinds with equal odds (weapon, armour, enemy, stations, gold, plushie)
const goldRange = (() => { const m = /amount: (\d+) \+ (\d+) \* Math\.floor\(Math\.random\(\) \* (\d+)\)/.exec(SRC.items.replace(/\s+/g, ' ')) || /50 \+ 10 \* Math\.floor\(Math\.random\(\) \* 46\)/.exec(SRC.items); return m && m.length > 3 ? [+m[1], +m[1] + +m[2] * (+m[3] - 1)] : [50, 500]; })();
const lootRoll = (() => { const m = /LOOT_ROLL = \[\[('\w+'), (\d+)\], \[('\w+'), (\d+)\], \[('\w+'), (\d+)\]\]/.exec(SRC.items); if (!m) throw new Error('gameinfo: LOOT_ROLL not found'); return [[m[1], +m[2]], [m[3], +m[4]], [m[5], +m[6]]].map(([a, b]) => [a.replace(/'/g, ''), b]); })();
const enemyW = (() => { const m = /for \(const \[e, w\] of (\[\[.*?\]\])\)/.exec(SRC.items); if (!m) throw new Error('gameinfo: mystery enemy weights not found'); return new Function('return ' + m[1])(); })();

function weaponStats(it) {
  const c = G.combat(it.key); let dmg = c.dmg, cd = c.cd, kind = c.ranged ? 'ranged' : 'melee', extra = '';
  if (it.key === 'w:staff' || it.key === 'w:scepter') { dmg = SV.BOLT.dmg; cd = SV.BOLT.cd; kind = 'bolt'; extra = 'bolt ' + dmg + ', range ' + SV.BOLT.range + ' m (staffbolt rule)'; }
  else if (c.bolt) { dmg = c.bolt; kind = 'bolt'; extra = 'bolt ' + c.bolt; }
  if (c.bleed) extra += (extra ? '; ' : '') + 'bleed ' + c.bleed[0] + ' x ' + c.bleed[1] + ' = ' + c.bleed[0] * c.bleed[1];
  return { dmg, cd, range: kind === 'bolt' ? SV.BOLT.range : c.range, kind, extra };
}
const weapons = weapons0.map(it => {
  const w = weaponStats(it), r = recOf[it.key], up = twin(it.key);
  return { id: it.key, name: link(it.name, '#weapons/' + it.key), tier: tierCell(it), family: it.family, dmg: w.dmg, reach: R(w.range), swing: w.cd, dps: R(w.dmg * 1000 / w.cd), kind: w.kind, extra: w.extra,
    up: up ? link(up.attack, '#knowledge/reforge') : '', chest: bar(pct(it.chance, wTot), 12), shop: bar(pct(it.chance, wTot + aTot), 12), mystery: bar(R(pct(it.chance, wTot) / mysteryKinds, 3), 2), relic: it.tierN >= 3 && it.chance > 0 ? bar(pct(it.chance, relicTot), 40) : '',
    price: it.price, craft: r ? link('tier ' + r.tier, '#recipes/' + r.id) : '', scrap: scrap(it.key), start: '' };
});
const armours = armours0.map(it => {
  const r = recOf[it.key], up = twin(it.key);
  return { id: it.key, name: link(it.name, '#armour/' + it.key), tier: tierCell(it), family: it.family, hp: it.health, speed: it.speed ? R((it.speed - 1) * 100, 0) : 0, thorns: it.thorns || 0, score: R(G.armorScore(it.key)), up: up ? link(up.health, '#knowledge/reforge') : '',
    shop: bar(pct(it.chance, wTot + aTot), 12), mystery: bar(R(pct(it.chance, aTot) / mysteryKinds, 3), 2), relic: it.tierN >= 3 && it.chance > 0 ? bar(pct(it.chance, relicTot), 40) : '',
    price: it.price, craft: r ? link('tier ' + r.tier, '#recipes/' + r.id) : '', scrap: scrap(it.key), start: '' };
});
// who starts in what (cross links goblin <-> gear)
G.GOBLINS.forEach((g, i) => { for (const [list, key] of [[weapons, G.START[i].weapon], [armours, G.START[i].armor]]) { const row = list.find(x => x.id === key); if (row) row.start += (row.start ? ', ' : '') + g.name; } });

// consumables, charms, tokens
const NUM_LABELS = { n: 'amount', ms: 'time', r: 'radius', arm: 'arms after', life: 'lasts', reveal: 'reveal', heal: 'heal' };
const numsOf = it => ['n', 'ms', 'r', 'arm', 'life', 'reveal'].filter(k => it[k] != null).map(k => NUM_LABELS[k] + ' ' + (/ms|arm|life|reveal/.test(k) ? S(it[k]) : it[k] + (k === 'r' ? ' m' : ''))).join(', ');
const utilShopTot = G.UTIL_KEYS.reduce((s, k) => s + G.ITEMS[k].shop, 0), charmShopTot = G.CHARM_KEYS.reduce((s, k) => s + G.ITEMS[k].shop, 0);
const sources = it => { const o = []; if (recOf[it.key]) o.push('craft'); if (it.shop) o.push('merchant'); if (it.act5) o.push('room reward'); if (it.key === 'x:draught') o.push('brew (elixir)'); if (it.key === 'x:plushie') o.push('mystery room'); return o.join(', '); };
const consumables = items.filter(i => i.type === 'consumable' || i.type === 'charm').map(it => {
  const r = recOf[it.key], cs = it.type === 'charm' ? Object.entries(it.eff).map(([k, v]) => k + ' ' + v).join(', ') : '';
  const shopP = it.shop ? (it.type === 'charm' ? SV.SHOP_CHARM * 100 * it.shop / charmShopTot : SV.SHOP_UTIL * 100 * it.shop / utilShopTot) : 0;
  return { id: it.key, name: link(it.name, '#items/' + it.key), type: it.type === 'charm' ? 'charm' : (it.act5 ? 'room item' : 'one-use'), tier: tierCell(it), use: it.use || '', numbers: it.type === 'charm' ? cs : numsOf(it), effect: it.desc || '',
    perk: it.use === 'heal' || it.use === 'regen' ? link('Field Medic', '#knowledge/medic') : '', shop: shopP ? bar(R(shopP, 2), 25) : '', price: it.price || '', craft: r ? link('tier ' + r.tier, '#recipes/' + r.id) : '', scrap: scrap(it.key), from: sources(it) };
});

// recipes
const bench = G.STATIONS.bench;
const HB_BASE = HB.benchParams({ lv: {} }), HB_II = HB.benchParams({ lv: { bench: 1 } });   // homebase.js keeps the tables private; its getters give the values by level
const HB_REC = [0, 1, 2].map(l => HB.recyclerEff({ lv: { recycler: l } })), HB_BOX = [0, 1, 2].map(l => HB.lockboxSlots({ lv: { lockbox: l } }));
const recipes = G.RECIPES.map(r => {
  const it = G.ITEMS[r.out], m = bench.master, master = G.partCost(r.cost, m.costMul);
  return { id: r.id, out: link(it.name, '#' + tabOfItem(it) + '/' + r.out), kind: it.type === 'armor' ? 'armour' : it.type, tier: r.tier, needs: r.tier ? link(r.needs, '#knowledge/tier' + r.tier) : r.needs, cost: parts(r.cost),
    normal: r.tier <= bench.normal.maxTier ? 'yes' : 'no (max tier ' + bench.normal.maxTier + ')', master: parts(master) };
});

// ---------------------------------------------------------------- goblins
const goblins = G.GOBLINS.map((g, i) => {
  const st = G.START[i], a = G.ITEMS[st.armor], w = G.ITEMS[st.weapon], pk = G.GOB_PERKS[g.perk] || null, k = G.KNOWLEDGE[i];
  const sp = G.SPEED[i] * G.armorSpeed(st.armor), start = G.goblinStart(i);
  return { id: 'g' + i, n: i, name: g.name, odds: bar(g.odds, 25), speed: R(G.SPEED[i], 2), eff: R(sp, 2), walk: R(SV.WALK * sp, 1), sprint: R(SV.SPRINT * sp, 1), size: g.size, radius: R(G.hitRadius(i), 3), hpBonus: g.hp,
    hp: G.goblinHp(i, a.health), reach: R(G.COMBAT.melee + G.goblinReach(i), 1), know: k, points: G.knowPoints(k, 0, []), rtier: G.knowTier(k),
    gold: G.START_GOLD + (start ? start.gold : 0), weapon: link(w.name, '#weapons/' + w.key), armour: link(a.name, '#armour/' + a.key), perk: g.perkName, perkText: g.perkText, pnote: start ? '+' + start.gold + ' gold, ' + parts(start.parts) : '', desc: g.desc };
});

// ---------------------------------------------------------------- knowledge
const perks = G.PERKS.map(p => {
  const br = G.BRANCHES.find(b => b.id === p.branch);
  const aff = { thrifty: ['recipes', 'Recipes'], scrapper: ['recipes', 'Recycler'], reforge: ['recipes', 'Reforge costs'], medic: ['items', 'Healing items'], gourmet: ['items', 'Brains'], appraiser: ['rooms', 'Facility map'], eavesdrop: ['rooms', 'Facility map'], headcount: ['rooms', 'Facility map'], secondwind: ['match', 'Combat'] }[p.id];
  return { id: p.id, name: p.name, branch: br.name, rank: p.rank, cost: p.cost, desc: p.desc, req: p.rank > 1 ? G.PERKS.find(q => q.branch === p.branch && q.rank === p.rank - 1).name : 'none', where: aff ? link(aff[1], '#' + aff[0]) : '' };
});
const treeCostTotal = G.PERKS.reduce((s, p) => s + p.cost, 0);
const knowTiers = G.KNOWLEDGE_TIERS.map((k, i) => ({ id: 'tier' + (i + 1), tier: i + 1, needs: k, recipes: link(G.RECIPES.filter(r => r.tier === i + 1).length, '#recipes'), nBench: i + 1 <= bench.normal.maxTier ? 'normal bench' : (i + 1 <= HB_II.maxTier ? 'Bench II (home), Master Forge' : 'Master Forge'), points: R((k) / G.KNOW.step, 1) }));
const reforge = [0, 1, 2, 3, 4, 5].map(t => ({ id: 'ref' + t, tier: G.TIER_NAMES[t], tierN: t, weapon: parts({ metal: 2 + t }), armour: parts({ metal: 1 + t, leather: 1 }) }));

// ---------------------------------------------------------------- rooms
const names16 = WORLD.CHEST.map(c => c.id);   // every attached room id (20)
function simLayout(n) {   // run the real randomLayout n times with a fixed seed: odds of each room type per attached room id
  const r = rng(12345), cnt = names16.map(() => ({}));
  for (let i = 0; i < n; i++) { const l = G.randomLayout(r); l.forEach((t, id) => { cnt[id][t] = (cnt[id][t] || 0) + 1; }); }
  return cnt.map(c => Object.fromEntries(Object.entries(c).map(([t, v]) => [t, R(100 * v / n, 1)])));
}
const SIM_N = 20000, layoutOdds = simLayout(SIM_N);
const attached = WORLD.CHEST.map(c => {
  const o = layoutOdds[c.id], types = Object.keys(o).sort((a, b) => o[b] - o[a]);
  return { id: 'c' + c.id, key: 'c' + c.id, parent: c.parent, side: c.side + ' ' + c.pos, kind: c.home ? 'Home' : 'Loot room', size: c.size + ' x ' + c.size, spawn: c.home ? 'spawn slot ' + WORLD.HOME_IDS.indexOf(c.id) : '', odds: c.home ? '' : types.map(t => t + ' ' + o[t] + '%').join(', '),
    forge: c.home ? '' : bar(o.forge || 0, 50), grand: c.home ? '' : bar(o.grand || 0, 50), chest: c.home ? '' : bar(o.chest || 0, 50), mystery: c.home ? '' : bar(o.mystery || 0, 50), merchant: c.home ? '' : bar(o.merchant || 0, 50) };
});
const arena = WORLD.ROOMS.filter(r => r.i != null).map(r => {
  const as = WORLD.CHEST.filter(c => c.parent === r.i);   // a corner cell has two
  return { id: 'r' + r.i, i: r.i, col: WORLD.colOf(r.i), row: WORLD.rowOf(r.i), kind: { vault: 'THE VAULT', tree: 'Tree room', vb: 'Vaultbreaker', arena: 'Plain hall' }[r.kind], size: R(r.hw * 2, 2) + ' x ' + R(r.hd * 2, 2) + ' m',
    doors: (WORLD.ROOM_DOORS[r.key] || []).length, attached: as.map(a => 'c' + a.id + ' (' + a.side + ', ' + (a.home ? 'home' : 'loot') + ')').join(', ') };
});
const mystery = [['weapon', 'A random weapon from the weapon drop pool', 1], ['armour', 'A random armour from the armour drop pool', 1], ['enemy', 'A guarded room: one enemy goblin attacks, drops loot', 1],
  ['stations', 'Two of recycler, knowledge tree, workbench', 1], ['gold', 'Gold pile ' + goldRange[0] + ' to ' + goldRange[1] + ' (steps of 10)', 1], ['plushie', 'A Goblin Plushie (throwable lure)', 1]].map(([k, d, w]) => ({ id: 'my-' + k, kind: k, what: d, odds: bar(R(100 * w / mysteryKinds, 2), 20) }));
const enemyTot = enemyW.reduce((s, e) => s + e[1], 0);
const enemies = enemyW.map(([k, w]) => ({ id: 'npc-' + k, ...npcRow(SV.NPC[k]), w: bar(R(100 * w / enemyTot, 1), 50), name: SV.NPC[k].name, ownOdds: bar(R(100 * w / enemyTot / mysteryKinds, 2), 10) }));
function npcRow(n) { return { hp: n.hp, dmg: n.dmg, cd: n.cd, dps: R(n.dmg * 1000 / n.cd), speed: n.speed, react: Array.isArray(n.react) ? n.react.join('-') + ' ms' : '', loot: !n.loot ? '' : n.loot.length && typeof n.loot[0] === 'string' ? n.loot.map(name).join(', ') : n.loot[0] ? n.loot[0] + ' item' + (n.loot[0] > 1 ? 's' : '') + ', tier ' + n.loot[1] + '+' : 'none' }; }
const stationTypes = Object.entries(SV.STATION_TYPES).map(([room, st]) => ({ id: 'st-' + room, room, stations: Object.entries(st).map(([k, v]) => k + ': ' + v).join(', ') }));

// ---------------------------------------------------------------- trees
const TREE_GROUPS = {
  well: ['wellPool', 'wellRefill', 'wellHits', 'wellDrinks', 'drinkKnow', 'fruitKnow', 'fruitMs', 'pourMs', 'stages', 'crankIdle', 'tapCd', 'readyHold'],
  press: ['huskEvery', 'huskMax', 'huskFirst', 'pressMs', 'pressCap', 'huskKnow', 'rouseElixir', 'rouseCd'],
  spring: ['springRefill', 'bottleMs', 'bottleCap', 'bottleCarry', 'blessElixir', 'healPerSec', 'springUnhurt'],
  seer: ['seerK', 'seerCd', 'seerCap', 'seerKnow'],
  graft: ['branchRefill', 'cutMs', 'viseMs', 'viseOwner', 'graftCap', 'scionCarry'],
  thorn: ['gripDps', 'tierMs', 'gripCap', 'bowlMax', 'bowlMs', 'bowlKnow'],
  gambler: ['feedCap', 'chewMs', 'odds', 'boostOdds', 'boostElixir', 'hoardMax', 'stumpOwner'],
  memory: ['memPer', 'memInput', 'memCd', 'memCap', 'memKnow', 'memMax', 'memRemember'],
  oak: ['oakHold', 'oakWhisper', 'oakKnow', 'oakCap', 'oakR', 'oakLook', 'oakAmbush'],
  elder: ['stoneMs', 'seedMs', 'rumbleMs', 'rootEvery', 'rootMax', 'elderKnow', 'elderTier', 'elderWakes'],
};
const K = T5.K, s = S, pc = v => R(v * 100, 1) + '%', I = G.ITEMS;
const TREE_TEXT = {
  well: `Crank the windlass (${K.wellHits} timing hits) to fill a bucket from a pool of ${K.wellPool} that refills 1 per ${s(K.wellRefill)}. Drink it for +${K.drinkKnow} knowledge (${K.wellDrinks} drinks a round) or carry it to the sapling: ${K.stages} pours ripen a fruit worth +${K.fruitKnow} knowledge to whoever picks it (${s(K.fruitMs)}). A hit spills a carried bucket.`,
  press: `Three vats release a Husk every ${s(K.huskEvery)} (at most ${K.huskMax} alive, the first ${s(K.huskFirst)} after someone enters). Kill one for a Husk Brain and crank it in the press (${s(K.pressMs)}) for +${K.huskKnow} knowledge, ${K.pressCap} presses a round. Pour ${K.rouseElixir} elixir into a vat to rouse a husk early (${s(K.rouseCd)} cooldown).`,
  spring: `Stand alone and unhurt in the pool for ${s(K.springUnhurt)} to heal ${K.healPerSec} HP/s (two goblins in it: nobody heals). Bottle Spring Water (heals ${I['x:springwater'].n}) at a basin in ${s(K.bottleMs)}, ${K.bottleCap} bottles a round and ${K.bottleCarry} carried; add ${K.blessElixir} elixir for Blessed Water (heals ${I['x:blessedwater'].n}). Basins refill in ${s(K.springRefill)}. Dry in sudden death.`,
  seer: `Three seeing stones each carry a ring of ${K.seerK} glyphs. Turn them (${s(K.seerCd)} a step) until all match the eye to fire a Vision for everyone who turned one: an 8 s pulse of every goblin and every room's pick, then the next vaultbreaker layout, then HP. ${K.seerCap} solves a round; the first two pay +${K.seerKnow} knowledge.`,
  graft: `Cut a Scion from a branch (${s(K.cutMs)}; branches regrow in ${s(K.branchRefill)}; ${K.scionCarry} carried). Clamp a weapon or armour and a scion in the vise: after ${s(K.viseMs)} it becomes its reforged + twin (+${R((G.KNOW.up - 1) * 100, 0)}%) for free. The owner has ${s(K.viseOwner)} to collect it before anyone can take it. ${K.graftCap} grafts a goblin a round.`,
  thorn: `Hold the thorns to bleed ${K.gripDps} HP/s (never lethal) and bank a blessing by hold time: ${K.tierMs.map(s).join(' / ')} for tier I / II / III (Fury +attack, Bark +max HP, Thorns reflect: see the blessing table). ${K.gripCap} grips a round. The blood bowl gathers a drop for each kill in the room (up to ${K.bowlMax}); drinking it pays +${K.bowlKnow} knowledge a drop.`,
  gambler: `Feed a weapon or armour to the root (${s(K.chewMs)}). It spits back a random item one tier higher at ${K.odds.map(pc).join(' / ')} per step, or swallows it. Ride the ladder up to ${K.odds.length} steps; ${K.feedCap} feeds a round. After ${K.hoardMax} swallowed items the next feeder gets a guaranteed tier 3+ item. ${K.boostElixir} elixir adds ${pc(K.boostOdds)} to a step.`,
  memory: `Touch the four lanterns in the order the tree flashes them (${s(K.memPer)} a flash, starting at 3 and growing to ${K.memMax}) within ${s(K.memInput)}. Success pays +${K.memKnow} knowledge (+1 per step above 3), ${K.memCap} a round, ${s(K.memCd)} cooldown. Someone touching a lantern breaks your sequence. Every third success, once a match, can grant a free perk (Remembrance).`,
  oak: `Stand in the nook for ${s(K.oakHold)} to become the Warden: you and the room are hidden from every map, and a secret whispers to you every ${s(K.oakWhisper)} for +${K.oakKnow} knowledge (${K.oakCap} a round, only while you look around). Your first hit on a newcomer does +${R((K.oakAmbush - 1) * 100, 0)}%. A hit ejects you.`,
  elder: `Three root-stones need ${K.stoneMs.map(s).join(' / ')} of channelling (waking 1 / 2 / 3). When all are lit the Elder wakes (${s(K.rumbleMs)} rumble) and drops a seed; the first to take it (${s(K.seedMs)}) wins ${K.elderKnow.join(' / ')} knowledge and a tier ${K.elderTier.join(' / ')}+ item, outside the tree cap. A Rootling climbs out every ${s(K.rootEvery)} (up to ${K.rootMax}). ${K.elderWakes} wakings a match.`,
};
const TREE_MAKES = { press: ['x:huskbrain'], spring: ['x:springwater', 'x:blessedwater'], graft: ['x:scion'] };
const wsum = Object.values(T5.WEIGHTS).reduce((a, b) => a + b, 0);
function simTrees(n) { const r = rng(777), c = {}; for (let i = 0; i < n; i++) for (const t of T5.rollTrees(r)) c[t] = (c[t] || 0) + 1; return c; }
const treeSim = simTrees(SIM_N);
const unit = (k, v) => typeof v === 'number' && v >= 1000 && /(Ms|Refill|Every|Idle|Cd|Hold|First|Whisper|Input|Per|Remember|Look|Chain|Burn|Min|After)$/i.test(k) ? ' (' + S(v) + ')' : '';
const fmtV = (k, v) => Array.isArray(v) ? v.map(x => x + unit(k, x)).join(' / ') : v + unit(k, v);
const trees = T5.TYPES.map(t => {
  const sp = ACT.get(t), keys = TREE_GROUPS[t];
  return { id: t, name: T5.NAMES[t], weight: bar(R(100 * T5.WEIGHTS[t] / wsum, 1), 25), present: bar(R(100 * treeSim[t] / SIM_N, 1), 70), what: TREE_TEXT[t], yield: sp.yield ? sp.yield.notes : '', knowMin: sp.yield ? sp.yield.knowPerMin : '',
    makes: (TREE_MAKES[t] || []).map(k => itemLink(k)), anchors: Object.entries(sp.anchors).map(([k, v]) => k + ' ' + v).join(', '), npc: sp.npc ? Object.values(sp.npc).map(n => n.name + ' (hp ' + n.hp + ', dmg ' + n.dmg + ')').join(', ') : '', nums: keys.map(k => k + ' ' + fmtV(k, K[k])).join('; ') };
});
const treeConsts = []; for (const t of T5.TYPES) for (const k of TREE_GROUPS[t]) treeConsts.push({ id: 'tc-' + k, tree: link(T5.NAMES[t], '#trees/' + t), key: k, value: fmtV(k, K[k]) });
const grouped = new Set(Object.values(TREE_GROUPS).flat()); for (const k of Object.keys(K)) if (!grouped.has(k)) treeConsts.push({ id: 'tc-' + k, tree: 'unsorted', key: k, value: fmtV(k, K[k]) });
const blessings = T5.BLESS_KEYS.map(k => ({ id: 'bl-' + k, name: { fury: 'Fury (attack)', bark: 'Bark (max HP)', thorns: 'Thorns (melee reflect)' }[k], t1: pc(T5.BLESS[k][0]), t2: pc(T5.BLESS[k][1]), t3: pc(T5.BLESS[k][2]) }));

// ---------------------------------------------------------------- vaultbreakers and the vault
const VK = VB.K, VKV = V5.K, realKey = k => k === 'x:wedge' ? 'x:ironwedge' : k, tok = k => itemLink(realKey(k));   // vb5.js calls the Iron Wedge 'x:wedge'; items.js keeps that key for the Door Wedge
const VB_TEXT = {
  ram: `Two crank handles wind the winch with timing presses (up to ${VK.NOTCH_MAX} notches, so a pair winds twice as fast). Release at the lever: the strike adds ${VK.PER_NOTCH} breach per notch to the vault door. ${VK.CRACKED} is Cracked, ${VK.BROKEN} is Broken; breach decays by ${VK.BREACH_DECAY} each round boundary. Anyone in the lane takes ${VK.LANE_DMG}. Defenders can slack the winch (${s(VK.SLACK_MS)}) or raise a barricade (${VK.BAR_HP} HP; ${VK.BAR_METAL} metal or ${VK.BAR_ELIXIR} elixir). In sudden death it becomes Quake: a full strike knocks everyone off the dais, freezing claims ${s(VK.QUAKE_FREEZE)} (${s(VK.QUAKE_CD)} cooldown).`,
  locksmith: `Grind a Key Blank (${s(VK.GRIND_MS)}), set ${VK.PINS} pins in order with timing presses, then cut (${s(VK.CUT_MS)}) a Vault Lockpick, a Skeleton Key or fence the cut for gold and knowledge. Misses add ${VK.NOISE_MISS} noise, jiggling ${VK.NOISE_JIGGLE}; noise decays ${VK.NOISE_DECAY}/s. At ${VK.LOUD_ON} the room shows on every minimap (until ${VK.LOUD_OFF}); at ${VK.ALARM} the lock alarm releases Vault Wardens (up to ${VK.WARDEN_MAX}). In sudden death the cut makes a Crown Seal.`,
  counting: `Buy Writs at the desk, each +1 weight on this room's pick: ${VK.WRIT.join(' / ')} gold, rising. A Counter-writ costs 1.5x and cancels one. The strongbox collects payments, ${pc(VK.BRIBE_SHARE)} of every panel bribe in the arena and ${VK.INTEREST} gold per ${s(VK.INTEREST_MS)} (cap ${VK.BOX_CAP}). Rob it in ${s(VK.ROB_MS)} (loud, ${s(VK.LOUD_MS)} on every minimap) or ${s(VK.ROB_KEY_MS)} silently with a Skeleton Key: coin sacks of ${VK.SACK} gold, up to ${VK.SACKS_MAX}, carried slowly. A box of ${VK.GOLDLEAF_MIN}+ also yields Gold Leaf. In sudden death the desk sells bounties on the top claimant (${VK.BOUNTY}, +${VK.BOUNTY_STEP} each).`,
  keystone: `Light the rune stones in the order the socket shows (${s(VK.LIGHT_MS)} each, within ${s(VK.STONE_CHAIN)} of the last; a wrong stone is a ${VK.BACKLASH} damage backlash and the circuit goes dark). Stones burn ${s(VK.STONE_BURN)}; anyone can feed one (${s(VK.FEED_MS)}) or snuff one (${s(VK.SNUFF_MS)}). Armed at the tally = extra vote. Resonance at ${VK.RES_THR.join(' / ')} raises wisps (max ${VK.WISP_MAX}) that snuff stones. Gold Leaf at the altar lights the next two. Sudden death: Ward slows the top claimant's gains to ${pc(VKV.WARD_MUL)}.`,
};
const VB_NAMES = { ram: 'Battering Ram', locksmith: 'Locksmith', counting: 'Counting House', keystone: 'Keystone' };
const VB_ROLE = { ram: 'Siege: loud, co-op, physical', locksmith: 'Stealth: precision, quiet', counting: 'Economy: vote market and a robbery', keystone: 'Ritual: an ordered circuit of flames' };
const VB_VOTE = { ram: `A door at breach ${VK.CRACKED}+ gives any room picking it +1 vote; at ${VK.BROKEN} the door opens at the round end whatever the votes`, locksmith: 'Vault Lockpick: +1 vote in a room whose pick is a vault door', counting: 'Each net writ (writs minus counter-writs) is +1 vote for its room', keystone: 'Armed at the tally: +1 vote (so one pick counts 2)' };
const VB_GROUPS = {
  ram: ['NOTCH_MAX', 'WINCH_PER', 'WINCH_WIN', 'SWING_MS', 'PER_NOTCH', 'STRIKE_POWER', 'LANE_DMG', 'SLACK_MS', 'HANDLE_IDLE', 'BAR_HP', 'BAR_MS', 'BAR_CD', 'BAR_METAL', 'BAR_ELIXIR', 'CHOP', 'CHOP_CD', 'QUAKE_CD', 'QUAKE_FREEZE', 'CRACKED', 'BROKEN', 'BREACH_DECAY'],
  locksmith: ['PINS', 'PIN_PER', 'PIN_WIN', 'NOISE_MISS', 'NOISE_JIGGLE', 'NOISE_DECAY', 'GRIND_MS', 'CUT_MS', 'JIGGLE_CD', 'LOUD_ON', 'LOUD_OFF', 'ALARM', 'WARDEN_MAX'],
  counting: ['WRIT', 'SACK', 'SACKS_MAX', 'ROB_MS', 'ROB_KEY_MS', 'LOUD_MS', 'INTEREST', 'INTEREST_MS', 'BOX_CAP', 'BRIBE_SHARE', 'BOUNTY', 'BOUNTY_STEP', 'GOLDLEAF_MIN'],
  keystone: ['STONE_BURN', 'STONE_CHAIN', 'LIGHT_MS', 'FEED_MS', 'SNUFF_MS', 'OFFER_MS', 'BACKLASH', 'WISP_SNUFF_MS', 'RES_THR', 'WISP_MAX'],
};
const vbs = VB.TYPES.map(t => ({ id: t, name: VB_NAMES[t], role: VB_ROLE[t], what: VB_TEXT[t], vote: VB_VOTE[t], token: tok(VB.RING[t]), tokenUse: ({ ram: 'Locksmith grindstone: a free Key Blank', locksmith: 'Counting House strongbox: a fast silent robbery', counting: 'Keystone altar: lights the next 2 stones', keystone: 'Ram lever: the next strike does double breach' })[t],
  nums: VB_GROUPS[t].map(k => k + ' ' + fmtV(k, VK[k])).join('; ') }));
const vbConsts = []; for (const t of VB.TYPES) for (const k of VB_GROUPS[t]) vbConsts.push({ id: 'vc-' + t + k, type: link(VB_NAMES[t], '#vault/' + t), key: k, value: fmtV(k, VK[k]) });
const vbGrouped = new Set(Object.values(VB_GROUPS).flat()); for (const k of Object.keys(VK)) if (!vbGrouped.has(k)) vbConsts.push({ id: 'vc-x' + k, type: 'shared', key: k, value: fmtV(k, VK[k]) });
const tokens = Object.keys(VB.TOKENS).map(k => ({ id: 'tk-' + k, name: tok(k), made: ({ 'x:wedge': 'Ram (door reaches Cracked and Broken)', 'x:skeleton': 'Locksmith cut', 'x:goldleaf': 'Counting House robbery', 'x:runecharge': 'Keystone, 4th stone of a circuit', 'x:blank': 'Locksmith grindstone', 'x:crownseal': 'Locksmith cut (sudden death only)' })[k], desc: I[realKey(k)] ? I[realKey(k)].desc : '' }));
const wardenNpc = (VB.NPC.warden), wispNpc = VB.NPC.wisp;
const vaultFacts = [
  ['Doors', WORLD.ROOM_DOORS[WORLD.VAULT_KEY].length + ' vault doors, one on each side; the vaultbreaker rooms stand in front of them'],
  ['Votes needed to open', 'at least 2 across all rooms picking a vault door (bribes, writs, Keystone, Cracked doors and lockpicks add weight); a Broken door opens regardless'],
  ['Panel bribe', SV.BRIBE.cost + ' gold per +1 weight, at most ' + SV.BRIBE.max + ' per room per round' + (SV.RULE_DEFAULT.includes('bribe') ? ' (rule on by default)' : '')],
  ['Treasury', 'every goblin inside at a round end: +' + VKV.TREASURY_GOLD + ' gold, +' + VKV.TREASURY_KNOW + ' knowledge'],
  ['Relic', 'one mythic-or-better weapon or armour on the pedestal; restocks at the start of rounds ' + VKV.RELIC_ROUNDS.join(' and ') + ' if taken'],
  ['Crown claim', 'stand alone on the dais (radius ' + VKV.DAIS_R + ' m) unhurt for ' + S(VKV.CLAIM_UNHURT_MS) + ' to gain claim; two or more goblins freeze it; claim is cumulative and lost on death'],
  ['Deciding the match', 'at the end of round ' + VKV.MAX_ROUND + ' the highest claim (at least ' + S(VKV.CLAIM_MIN) + ') wins, then kills, then health'],
  ['Alarm', 'while anyone gains claim every vault door is forced open, and for ' + S(VKV.ALARM_AFTER_MS) + ' after; a door it forced stays open for good'],
  ['Vault Wardens', 'one rises from the grate every ' + S(VKV.WARDEN_EVERY) + ' while someone gains claim, max ' + VKV.WARDEN_MAX + ' alive (hp ' + V5.NPC.warden.hp + ', damage ' + V5.NPC.warden.dmg + ' every ' + S(V5.NPC.warden.cd) + ')'],
  ['Coffers', VKV.COFFERS.length + ' coffers, ' + VKV.COFFER_HANDFULS + ' handfuls each, refilling 1 per ' + S(VKV.COFFER_REFILL) + ' (' + S(VKV.COFFER_REFILL_SUDDEN) + ' in sudden death); a scoop takes ' + S(VKV.SCOOP_MS) + ' for ' + VKV.SCOOP_GOLD + ' gold, max ' + VKV.SCOOP_PER_ROUND + ' scoops a goblin a round'],
  ['Door bars', 'a ' + S(VKV.BAR_MS) + ' channel at an open vault door\'s rack shuts it at once until the round ends, then it reopens (each door once a round; ' + S(VKV.BAR_PERSONAL_CD) + ' personal cooldown). Useless against a Broken door, during the alarm and in sudden death'],
  ['Sudden death', 'claim gains x' + VKV.SUDDEN_CLAIM_MUL + '; every door open; outer, home and loot rooms vent: ' + VKV.VENT_DMG + ' damage every ' + S(VKV.VENT_MS)],
  ['Yield', ACT.get('vault').yield.notes],
];

// ---------------------------------------------------------------- home base, elixir, sends
const elixir = [
  ...EX.PUMP_LEVELS.map((p, i) => p && { id: 'pump' + i, level: 'Pump level ' + i, rate: '1 per ' + S(p.ms), tank: p.cap, round: Math.min(p.cap, Math.floor(SV.ROUND_MS / p.ms)), match: Math.floor(SV.MAX_ROUND * SV.ROUND_MS / p.ms) }).filter(Boolean),
];
const elixirFacts = [['Carry cap', EX.CARRY_CAP], ['Brew a Healing Draught', EX.SINKS.brewHeal + ' elixir (heals ' + EX.HEAL_DRAUGHT + ')'], ['Brew a Speed Tonic', EX.SINKS.brewTonic + ' elixir'], ['Refine (a recycle at 100%)', EX.SINKS.refine + ' elixir per item'],
  ['Distill knowledge', EX.SINKS.distill + ' elixir for +' + EX.DISTILL_KNOWLEDGE + ' knowledge, up to ' + EX.DISTILL_MAX + ' times'], ['Oil the vault lock', EX.SINKS.oil + ' elixir for one bribe (shared max of ' + EX.OIL_MAX + ' with gold bribes)'],
  ['Pump Leech', 'drains ' + pc(EX.LEECH_FRAC) + ' of a tank over ' + S(EX.LEECH_MS)], ['Raid warning', 'the tank glows red for ' + S(EX.RAID_GLOW_MS)], ['Pump reach', EX.PUMP_RANGE + ' m'], ['Death', 'carried elixir drops as an Elixir Flask; the pump stops, the tank stays']];
const upgrades = HB.ORDER.flatMap(id => HB.UPGRADES[id].levels.map((l, i) => ({ id: 'up-' + id + (i + 1), tab: HB.UPGRADES[id].tab, name: HB.UPGRADES[id].name, level: i + 1, cost: l.cost, fx: l.fx })));
let run = 0; for (const u of upgrades) { run += u.cost; u.total = run; }
const sends = HB.SEND_IDS.map(k => { const d = HB.SENDS[k]; return { id: 'send-' + k, name: d.name, cost: d.cost, ms: d.ms === 'round' ? 'rest of the round' : S(d.ms), target: d.target, fx: d.fx, counter: d.counter }; });
const homeFacts = [['Whole upgrade tree', HB.treeCost() + ' elixir'], ['Sentry', HB.SENTRY.shots + ' shots, ' + HB.SENTRY.damage + ' damage every ' + S(HB.SENTRY.everyMs)], ['Snare', 'roots ' + S(HB.SNARE.rootMs) + ', ' + HB.SNARE.damage + ' damage, one shot'], ['Healing Pad', HB.PAD.hps + ' HP/s after ' + S(HB.PAD.calmMs) + ' unhurt'],
  ['Camera Terminal', 'a prop in your home once bought. ' + CT.OPEN_COST + ' elixir to start a feed, then ' + CT.METER_COST + ' per ' + S(CT.LEVELS[1].meterMs) + ' (tier II: ' + S(CT.LEVELS[2].meterMs) + '). Feed lasts ' + S(CT.LEVELS[1].feedMs) + ' (tier II: ' + S(CT.LEVELS[2].feedMs) + ', and the Vault). Shows one arena room at a time as a live map: goblins with names and health, doors, loot piles, the crown claim. Starts in round ' + CT.FIRST_ROUND + ', dead in sudden death and the showdown, blind to a room whose goblin holds the Hollow Oak. Occupants with an Alarm are warned that a camera is watching, without a name.'],
  ['Door lock pick time', HB.PICK_MS.map(S).join(' / ') + ' by level'], ['Lockbox crack time', HB.CRACK_MS.map(S).join(' / ') + ' by lock level (range ' + HB.CRACK_RANGE + ' m)'], ['Recycler efficiency', HB_REC.map(pc).join(' / ')], ['Lockbox slots', HB_BOX.join(' / ')],
  ['Home bench', 'tier ' + HB_BASE.maxTier + ' at ' + S(HB_BASE.craftMs) + '; Bench II tier ' + HB_II.maxTier + ' at ' + S(HB_II.craftMs)], ['Sends', 'telegraph ' + S(HB.TELEGRAPH_MS) + ', at most ' + HB.MAX_ACTIVE_PER_ROOM + ' live per room, from round ' + HB.FIRST_SEND_ROUND + ', one per goblin per round'],
  ['Elixir over a match', 'a level-1 pump makes ' + HB.baseIncomeMatch(SV.MAX_ROUND, SV.ROUND_MS) + ' over ' + SV.MAX_ROUND + ' rounds']];

// ---------------------------------------------------------------- match, combat, stations
const rounds = [{ id: 'rd1', phase: 'Round 1', ms: SV.ROUND_MS, rule: homePhaseDoc || homePhaseConst ? 'Home-only phase (see the note above)' : 'Full arena: this build has no home-only phase yet' }].concat(
  Array.from({ length: SV.MAX_ROUND - 1 }, (_, i) => i + 2).map(n => ({ id: 'rd' + n, phase: 'Round ' + n, ms: SV.ROUND_MS, rule: n <= SV.SUDDEN_ROUND ? (n === SV.CELL_ROUND ? 'Hall round: the hatches open and nothing else; each hall votes its way out (it opens at the round end)' : 'Normal round: votes add doors, open doors stay open') + (n >= HB.FIRST_SEND_ROUND ? '; sends allowed' : '') + (n >= 3 ? '; showdown when ' + SV.PACE.showdownAt + ' are left' : '') : 'SUDDEN DEATH: every door open, regeneration off, claims x' + VKV.SUDDEN_CLAIM_MUL })));
rounds.forEach(r => { r.length = S(r.ms); delete r.ms; });
const matchFacts = [['Players per match', SV.CAP + ' (bots fill empty seats after ' + S(SV.QUEUE_MS) + ' of queueing)'], ['Round length', S(SV.ROUND_MS)], ['Rounds', SV.MAX_ROUND + ' at most (' + S(SV.MAX_ROUND * SV.ROUND_MS) + ')'], ['Sudden death', 'after round ' + SV.SUDDEN_ROUND], ['Doors', 'a door that opens stays open for the rest of the match (votes, heists, the alarm, Crowbar, Door Wedge, the guard); only a vault bar shuts one, until the round ends'],
  ['Match decided', 'at the end of round ' + SV.MAX_ROUND + ': highest crown claim, then kills, then health'], ['Starting gold', G.START_GOLD], ['Round income', SV.PACE.income + ' gold to every living goblin at each new round'],
  ['Kill bounty', 'half the victim\'s gold (counted up to ' + SV.BOUNTY_CAP + ') plus ' + SV.PACE.bountyKill + ' per kill the victim had, rounded to 5; mystery enemies pay nothing'], ['Showdown', 'from round 3, when ' + SV.PACE.showdownAt + ' or fewer goblins are alive, door locks stop working'],
  ['Shop prices', '+' + pc(SV.PRICE_STEP) + ' per round after round ' + SV.PRICE_FROM + ', rounded to 5'], ['Bot grace', 'bots do not attack in round 1 or in the first ' + S(SV.BOT_GRACE) + ' after GO'], ['Reconnect grace', S(SV.GRACE_MS)], ['Rule defaults', 'on: ' + SV.RULE_DEFAULT.join(', ') + '; off: ' + SV.RULE_NAMES.filter(r => !SV.RULE_DEFAULT.includes(r)).join(', ') + ' (GK_RULES changes them)'],
  ['Doorclose rule (off)', 'a door stays open ' + SV.DOOR_LIFE + ' rounds; klaxon ' + S(SV.KLAXON_MS) + ' before close'], ['Home-only first round', homePhaseConst ? homePhaseConst[1] : (homePhaseDoc ? 'see docs/reports/home-phase.md' : 'not in this build yet (another agent is adding it; this page will pick it up)')]];
const cb = G.COMBAT;
const combatFacts = [['Melee reach', cb.melee + ' m'], ['Ranged reach (bows, crossbows)', cb.ranged + ' m'], ['Swing cone', R(cb.cone * 180 / Math.PI, 0) + ' degrees'], ['Unarmed damage', cb.unarmed], ['Regeneration', cb.regenAmt + ' HP every ' + S(cb.regenEvery) + ' after ' + S(cb.regenIdle) + ' unhurt (off in sudden death)'],
  ['Walk / sprint', SV.WALK + ' / ' + SV.SPRINT + ' m/s, times the goblin\'s speed and armour speed'], ['Staff bolt', SV.BOLT.dmg + ' damage, range ' + SV.BOLT.range + ' m, speed ' + SV.BOLT.speed + ' m/s, every ' + S(SV.BOLT.cd)], ['Bleed tick', S(SV.BLEED_MS)],
  ['Vision', 2 * SV.FOV + ' degree cone to ' + SV.SEE_FAR + ' m, ' + SV.SEE_NEAR + ' m all round, ' + S(SV.SEE_HIT_MS) + ' after a hit, ' + S(SV.SEE_MEM_MS) + ' of memory'], ['Hit radius', 'size x ' + G.HIT_R + ' m'], ['Item use cooldown', S(SV.USE_CD)], ['Bomb fuse', S(SV.BOMB_FUSE)],
  ['Placed traps and bells', 'at most ' + SV.MAX_PLACED + ' each; bait lasts ' + S(SV.BAIT_LIFE)], ['Plushie lure', 'bots within ' + SV.LURE_RANGE + ' m run to it for ' + S(SV.LURE_MS)], ['Backpack / quick slots', G.SLOTS.backpack + ' / ' + G.SLOTS.quick + ' (plus weapon, armour, charm)'], ['Brain', 'eating one gives ' + pc(G.brainGain('m:brain:100') / 100) + ' of the dead goblin\'s knowledge, plus 1 knowledge point'],
  ['Reforge', '+' + pc(G.KNOW.up - 1) + ' attack or health, at least +2'], ['Perk numbers', 'Field Medic x' + G.KNOW.medic + ', Brain Gourmet +' + G.KNOW.gourmet + ' HP, one knowledge point per ' + G.KNOW.step + ' knowledge']];
const thornArm = armours.filter(a => a.thorns).map(a => a.name.v + ' ' + a.thorns).join(', ');
combatFacts.push(['Thorns armour', thornArm + ' (flat damage back to a melee attacker, never lethal)']);
const npcAll = [...Object.entries(SV.NPC).map(([k, n]) => ({ id: 'e-' + k, name: n.name, from: k === 'rat' ? 'Rat Swarm send' : 'Mystery room', ...npcRow(n) })),
  ...T5.TYPES.map(t => ACT.get(t)).filter(sp => sp.npc).flatMap(sp => Object.values(sp.npc).map(n => ({ id: 'e-' + n.name, name: n.name, from: T5.NAMES[sp.type], ...npcRow(n) }))),
  { id: 'e-warden', name: wardenNpc.name, from: 'Locksmith alarm, vault claim', ...npcRow(wardenNpc) }, { id: 'e-wisp', name: wispNpc.name, from: 'Keystone resonance', ...npcRow(wispNpc) }];
const ratSend = HB.SENDS.rats;

// loot tab: pools per tier
const tierRows = G.TIER_NAMES.map((t, n) => {
  const w = weapons0.filter(i => i.tierN === n && i.chance > 0), a = armours0.filter(i => i.tierN === n && i.chance > 0);
  return { id: 'tier-' + t, tier: { v: t, cls: 't' + n, sort: n }, nW: w.length, pW: bar(pct(w.reduce((q, i) => q + i.chance, 0), wTot), 60), nA: a.length, pA: bar(pct(a.reduce((q, i) => q + i.chance, 0), aTot), 60) };
});
const tierMult = (() => { const m = /TIER_MULT = (\{[^}]*\})/.exec(SRC.items); if (!m) throw new Error('gameinfo: TIER_MULT not found'); return new Function('return ' + m[1])(); })();   // items.js keeps TIER_MULT private
const tierThresholds = [['uncommon', '7% or more'], ['rare', '4.5% to 7%'], ['mythic', '2.5% to 4.5%'], ['legendary', '1% to 2.5%'], ['transcendent', 'under 1%']].map(([t, r]) => ({ id: 'tt-' + t, tier: { v: t, cls: 't' + G.TIER_N[t], sort: G.TIER_N[t] }, band: r }));
const lootPools = [['Chest room', 'One weapon, weighted by drop chance (' + lootRoll.find(x => x[0] === 'chest')[1] + '% of loot rooms are chests, roughly)'], ['Merchant', '5 different items, weapons and armour weighted together; ' + pc(SV.SHOP_UTIL) + ' of shops swap one slot for a utility item and ' + pc(SV.SHOP_CHARM) + ' also a charm; price = base x 0.8 to 1.2, rounded to 5'],
  ['Mystery room', 'one of six kinds, equal odds (see Rooms)'], ['Vault relic', 'one mythic or better weapon or armour, weighted by drop chance'], ['Mystery enemy', 'drops 1 to 2 items by enemy type, 40% a utility item and 15% a charm'], ['Dead goblin', 'drops everything it carried'], ['Goblin brain', '5% of its knowledge when eaten']];
const priceFormulas = [['Weapon price', 'round((attack x 3 + 20) / 5) x 5'], ['Armour price', 'round((health x 1.4 + 10) / 5) x 5'], ['Reforged price', 'base x 1.3, rounded to 5'], ['Merchant stock price', 'base price x (0.8 to 1.2), rounded to 5, +' + pc(SV.PRICE_STEP) + ' per round after round ' + SV.PRICE_FROM]];
const recycleTiers = Object.entries(tierMult).map(([t, m]) => ({ id: 'rm-' + t, tier: { v: t, cls: 't' + G.TIER_N[t], sort: G.TIER_N[t] }, weapon: 'x' + m, armour: 'x' + m * 0.5, bonus: { mythic: '+1 gold', legendary: '+2 gold, +1 gem', transcendent: '+5 gold, +3 gem, +2 crystal' }[t] || '' }));
const stations = [
  { id: 'bench-normal', station: 'Normal workbench', where: 'merchant rooms, stations mystery rooms', tier: 'up to ' + bench.normal.maxTier, cost: 'x' + bench.normal.costMul, ms: S(bench.normal.craftMs), notes: 'full part cost' },
  { id: 'bench-home', station: 'Home bench', where: 'your home', tier: 'up to ' + HB_BASE.maxTier, cost: 'x1', ms: S(HB_BASE.craftMs), notes: 'owner only; Bench II upgrade: tier ' + HB_II.maxTier + ', ' + S(HB_II.craftMs) },
  { id: 'bench-master', station: 'Master Forge', where: 'one loot room per match', tier: 'up to ' + bench.master.maxTier, cost: 'x' + bench.master.costMul + ' (rounded up)', ms: S(bench.master.craftMs), notes: 'also lets you craft ' + bench.master.bonusTier + ' tier above your knowledge, at full cost' },
  { id: 'rec-home', station: 'Home recycler', where: 'your home', tier: '', cost: pc(G.STATIONS.recycler.home.eff) + ' yield', ms: '', notes: 'upgrades to ' + HB_REC.slice(1).map(pc).join(' then ') },
  { id: 'rec-full', station: 'Recycler / Grand Recycler', where: 'merchant rooms, Grand Recycler loot room', tier: '', cost: pc(G.STATIONS.recycler.full.eff) + ' yield', ms: '', notes: 'at least 1 of the main part when yield is reduced' }];

// ---------------------------------------------------------------- assemble the sections (renderer blocks: see tools/gameinfo.template.html)
const C = (cols) => cols.map(c => typeof c === 'string' ? { k: c, label: c } : { k: c[0], label: c[1], num: c[2] || 0, cls: c[3] || '' });
const kv = (title, rows, note) => ({ t: 'card', title, rows, note });
const tbl = (id, title, note, cols, rows, o = {}) => ({ t: 'table', id, title, note, cols: C(cols), rows, ...o });
const p = text => ({ t: 'p', text });
const homeNote = homePhaseDoc ? 'Round 1 is a home-only phase (docs/reports/home-phase.md).' : (homePhaseConst ? 'Round 1 home phase constant: ' + homePhaseConst[0].trim() + '.' : 'Round 1 as a home-only phase is being added by another agent. Until it lands every round plays the same; this page reads the server and will show it once it exists.');

const S_ = {};
S_.overview = [
  { t: 'cards', cards: [
    kv('The match', matchFacts.slice(0, 8)),
    kv('The roster', [['Goblin types', goblins.length], ['Weapons', weapons.length], ['Armour', armours.length], ['Consumables and charms', consumables.length], ['Recipes', recipes.length], ['Tree rooms', trees.length], ['Vaultbreakers', vbs.length], ['Upgrades', upgrades.length], ['Sendables', sends.length], ['Perks', perks.length], ['Arena rooms', arena.length], ['Attached rooms', attached.length]]),
    kv('Top DPS', [...weapons].sort((a, b) => b.dps - a.dps).slice(0, 5).map(w => [w.name, w.dps])),
    kv('Toughest armour', [...armours].sort((a, b) => b.hp - a.hp).slice(0, 5).map(a => [a.name, a.hp + ' hp'])),
    kv('Goblin odds', goblins.map(g => [link(g.name, '#goblins/' + g.id), bar(g.odds.v, 25)])),
    kv('Tree room odds', trees.map(t => [link(t.name, '#trees/' + t.id), t.weight])),
  ] },
  p(homeNote),
  p('Every number on these pages is read from the game files when this page is generated (items.js, world.js, elixir.js, homebase.js, activity.js, rooms5-trees.js, vb5.js, vault5.js and constants in server.js). Run npm run gameinfo after changing the game to refresh docs/game-info.html. The server regenerates it at start when it is missing or older than the game files.'),
];
S_.match = [
  { t: 'cards', cards: [kv('Match rules', matchFacts), kv('Combat and movement', combatFacts)] },
  p(homeNote),
  tbl('rounds', 'Round by round', 'Every round lasts the same time; sudden death starts after round ' + SV.SUDDEN_ROUND + '.', [['phase', 'Round'], ['length', 'Length'], ['rule', 'What changes']], rounds),
  tbl('npcs', 'Non-player enemies', 'Mystery-room enemies, tree guardians, wardens and wisps. Damage per second = damage x 1000 / cooldown.', [['name', 'Enemy'], ['from', 'Found in'], ['hp', 'HP', 1], ['dmg', 'Damage', 1], ['cd', 'Cooldown ms', 1], ['dps', 'DPS', 1], ['speed', 'Speed m/s', 1], ['react', 'Reaction'], ['loot', 'Drops']], npcAll),
];
S_.goblins = [
  p('Each player is assigned a goblin when joining: the odds below are the real roll table (they add up to ' + R(goblins.reduce((s, g) => s + g.odds.v, 0), 1) + '%). Speed multiplies the walk (' + SV.WALK + ' m/s) and sprint (' + SV.SPRINT + ' m/s). Health is the starting armour plus the type\'s bonus.'),
  tbl('goblins', 'The 12 goblins', 'Click a column to sort. Start gear links to the item.', [['n', '#', 1], ['name', 'Goblin', 0, 'name'], ['odds', 'Odds %', 1], ['speed', 'Speed x', 1], ['eff', 'With armour x', 1], ['walk', 'Walk m/s', 1], ['sprint', 'Sprint m/s', 1], ['size', 'Size x', 1], ['radius', 'Hit radius m', 1], ['hp', 'Start HP', 1], ['hpBonus', 'HP bonus', 1], ['reach', 'Reach m', 1],
    ['weapon', 'Weapon'], ['armour', 'Armour'], ['gold', 'Start gold', 1], ['know', 'Knowledge', 1], ['points', 'Start points', 1], ['rtier', 'Recipe tier', 1], ['perk', 'Perk'], ['perkText', 'What it does', 0, 'wrapc'], ['pnote', 'Start extras']], goblins),
];
const gearCols = (kind) => kind === 'w'
  ? [['name', 'Weapon', 0, 'name'], ['tier', 'Tier'], ['family', 'Family'], ['dmg', 'Damage', 1], ['reach', 'Reach m', 1], ['swing', 'Swing ms', 1], ['dps', 'DPS', 1], ['kind', 'Kind'], ['extra', 'Extras'], ['up', 'Reforged dmg', 1], ['chest', 'Chest %', 1], ['shop', 'Merchant %', 1], ['mystery', 'Mystery %', 1], ['relic', 'Relic %', 1], ['price', 'Price', 1], ['craft', 'Craft'], ['scrap', 'Recycles to'], ['start', 'Starts for']]
  : [['name', 'Armour', 0, 'name'], ['tier', 'Tier'], ['family', 'Family'], ['hp', 'Health', 1], ['speed', 'Speed %', 1], ['thorns', 'Thorns', 1], ['score', 'Bot score', 1], ['up', 'Reforged hp', 1], ['shop', 'Merchant %', 1], ['mystery', 'Mystery %', 1], ['relic', 'Relic %', 1], ['price', 'Price', 1], ['craft', 'Craft'], ['scrap', 'Recycles to'], ['start', 'Starts for']];
S_.weapons = [
  p('Drop columns are the chance that a given pick is this weapon: Chest % is one chest roll (weapons only); Merchant % one shop slot (weapons and armour together); Mystery % the chance a mystery room holds it (one of six kinds); Relic % the vault relic (mythic and above). Class items (staff, scepter) and craft-only items never drop.'),
  tbl('weapons', 'Weapons', 'DPS = damage x 1000 / swing time. Bolt weapons throw a slow magic bolt instead of swinging.', gearCols('w'), weapons),
];
S_.armour = [
  p('Speed is the movement change while worn. Thorns is flat damage a melee attacker takes back. Bot score is the single number the bots use to rank armour.'),
  tbl('armour', 'Armour', 'Chest rooms hold weapons only, so armour has no chest column.', gearCols('a'), armours),
];
S_.items = [
  p('One-use items go in the quick slots (press the key); charms sit in the single charm slot and work while worn. Shop % is the chance that a merchant stocks it in the slot it replaces. Items marked room item come only from tree rooms and vaultbreakers, never from shops.'),
  tbl('items', 'Consumables, charms and tokens', 'Numbers are read from each item\'s data.', [['name', 'Item', 0, 'name'], ['type', 'Type'], ['tier', 'Tier'], ['use', 'Effect id'], ['numbers', 'Numbers'], ['effect', 'What it does', 0, 'wrapc'], ['perk', 'Perk'], ['shop', 'Shop slot %', 1], ['price', 'Price', 1], ['craft', 'Craft'], ['scrap', 'Recycles to'], ['from', 'Comes from']], consumables),
  tbl('tokens', 'Heist tokens', 'The ring: each vaultbreaker makes the token that speeds up the next one.', [['name', 'Token', 0, 'name'], ['made', 'Made at'], ['desc', 'What it does', 0, 'wrapc']], tokens),
];
S_.recipes = [
  p('A recipe needs enough knowledge for its tier and a bench that can make that tier. Master Forge crafts cost ' + pc(bench.master.costMul) + ' of the parts (rounded up).'),
  tbl('recipes', 'All recipes', 'Needs = knowledge required. Master cost is the part cost at the Master Forge.', [['out', 'Makes', 0, 'name'], ['kind', 'Kind'], ['tier', 'Tier', 1], ['needs', 'Knowledge', 1], ['cost', 'Parts'], ['normal', 'Normal bench'], ['master', 'Master Forge parts']], recipes),
  tbl('stations', 'Stations', '', [['station', 'Station', 0, 'name'], ['where', 'Where'], ['tier', 'Recipe tier'], ['cost', 'Cost / yield'], ['ms', 'Craft time'], ['notes', 'Notes']], stations),
  tbl('stationRooms', 'Which rooms have which station', 'From the server.', [['room', 'Room', 0, 'name'], ['stations', 'Stations']], stationTypes),
  tbl('recycle', 'Recycler yield by tier', 'Weapons break into parts by family, scaled by tier; armour yields half. A recipe\'s own item never returns more than its cost.', [['tier', 'Tier'], ['weapon', 'Weapon multiplier'], ['armour', 'Armour multiplier'], ['bonus', 'Bonus parts']], recycleTiers),
  tbl('parts', 'Craft and recycle parts', '', [['part', 'Part', 0, 'name']], G.PARTS.map(x => ({ id: 'part-' + x.key, part: x.name + ' (' + x.key + ')' }))),
];
S_.knowledge = [
  p('Knowledge is a number that unlocks recipe tiers. Every ' + G.KNOW.step + ' knowledge is also one point to spend on perks, and every brain eaten gives one more. Perks last until death. The full tree costs ' + treeCostTotal + ' points.'),
  tbl('tiers', 'Knowledge tiers', '', [['tier', 'Tier', 1], ['needs', 'Knowledge needed', 1], ['points', 'Points that much knowledge gives', 1], ['nBench', 'Bench needed'], ['recipes', 'Recipes', 1]], knowTiers),
  tbl('perks', 'The 9 perks', 'Learn top to bottom within a branch.', [['name', 'Perk', 0, 'name'], ['branch', 'Branch'], ['rank', 'Rank', 1], ['cost', 'Points', 1], ['req', 'Needs first'], ['desc', 'Effect', 0, 'wrapc'], ['where', 'See']], perks),
  tbl('reforge', 'Reforge cost by item tier', 'Reforge turns a weapon or armour into its + twin: +' + pc(G.KNOW.up - 1) + ' and at least +2.', [['tier', 'Item tier'], ['weapon', 'Weapon'], ['armour', 'Armour']], reforge),
  tbl('points', 'Where each goblin starts', '', [['name', 'Goblin', 0, 'name'], ['know', 'Knowledge', 1], ['points', 'Points', 1], ['rtier', 'Recipe tier', 1]], goblins.map(g => ({ id: 'kp-' + g.id, name: link(g.name, '#goblins/' + g.id), know: g.know, points: g.points, rtier: g.rtier }))),
  kv('Where knowledge comes from', [['Brain eaten', '5% of the dead goblin\'s knowledge, plus 1 point'], ['Tree rooms', 'at most ' + ACT.C.TREE_KNOW_ROUND + ' a round and ' + ACT.C.TREE_KNOW_MATCH + ' a match per goblin (Elder Seed and goblin brains do not count)'], ['Brain Jar', 'item: +' + I['x:jar'].n + ' knowledge'], ['Scholar\'s Charm', '+' + pc(G.charmEff('c:scholar', 'know') - 1) + ' from brains and jars'], ['Vault treasury', '+' + VKV.TREASURY_KNOW + ' per round inside'], ['Distill (elixir)', '+' + EX.DISTILL_KNOWLEDGE + ' for ' + EX.SINKS.distill + ' elixir']]),
];
S_.rooms = [
  p('The arena is a ' + WORLD.N + ' x ' + WORLD.N + ' grid of ' + WORLD.NARENA + ' rooms with the vault in the middle, ringed by ' + WORLD.TREE_CELLS.length + ' tree rooms and ' + Object.keys(WORLD.VB_CELLS).length + ' vaultbreakers. ' + WORLD.NATT + ' more rooms are attached around the edge, ' + WORLD.NSIDE + ' along each side (numbered 1 to ' + WORLD.NSIDE + '; a corner cell has one on each outward side): ' + WORLD.HOME_IDS.length + ' homes and ' + WORLD.LOOT_IDS.length + ' loot rooms. Odds for loot rooms come from running the real layout roll ' + SIM_N + ' times.'),
  tbl('arena', 'Arena rooms', 'Index = column + 5 x row. Sizes are interior metres.', [['i', 'Room', 1], ['col', 'Column', 1], ['row', 'Row', 1], ['kind', 'Kind'], ['size', 'Size'], ['doors', 'Doors', 1], ['attached', 'Attached room']], arena),
  tbl('attached', 'Attached rooms', 'Homes are spawn rooms; each loot room is a Master Forge, Grand Recycler, chest, mystery or merchant room.', [['key', 'Room', 0, 'name'], ['parent', 'Arena cell', 1], ['side', 'Side, position'], ['kind', 'Kind'], ['size', 'Size m'], ['spawn', 'Spawn'], ['forge', 'Forge %', 1], ['grand', 'Grand Recycler %', 1], ['chest', 'Chest %', 1], ['mystery', 'Mystery %', 1], ['merchant', 'Merchant %', 1]], attached),
  kv('How the layout is rolled', [['Homes', 'positions ' + WORLD.HOME_POS.join(' and ') + ' of every side (' + WORLD.HOME_IDS.length + ')'], ['Master Forge and Grand Recycler', 'one each, on opposite sides of the arena, at a random loot position'], ['Other loot rooms', lootRoll.map(([t, w]) => t + ' ' + w + '%').join(', ')], ['Guarantee', 'at least one merchant']]),
  tbl('mystery', 'Inside a mystery room', 'One of six kinds, equal odds.', [['kind', 'Contents', 0, 'name'], ['what', 'What'], ['odds', 'Odds %', 1]], mystery),
  tbl('enemies', 'Mystery room enemies', 'Weights add to ' + enemyTot + ' and are relative. "Of all mystery rooms" multiplies by the 1-in-6 enemy roll.', [['name', 'Enemy', 0, 'name'], ['w', 'Share of enemy rooms %', 1], ['ownOdds', 'Of all mystery rooms %', 1], ['hp', 'HP', 1], ['dmg', 'Damage', 1], ['cd', 'Cooldown ms', 1], ['dps', 'DPS', 1], ['speed', 'Speed m/s', 1], ['loot', 'Drops']], enemies),
];
S_.trees = [
  p('Four of the ten tree types stand in the inner corner rooms each match, rolled by weight without repeats. The first bar is the weight; the second is the real chance a type shows up in a given match (' + SIM_N + ' simulated rolls). All tree knowledge shares a cap of ' + ACT.C.TREE_KNOW_ROUND + ' a round and ' + ACT.C.TREE_KNOW_MATCH + ' a match per goblin.'),
  tbl('trees', 'The 10 tree rooms', '', [['name', 'Tree', 0, 'name'], ['weight', 'Weight %', 1], ['present', 'In a match %', 1], ['what', 'What it does', 0, 'wrapc'], ['yield', 'Designer note', 0, 'wrapc'], ['npc', 'Guardians'], ['makes', 'Makes'], ['anchors', 'Props']], trees),
  tbl('blessings', 'Thorn Shrine blessings', 'Bonus by blessing tier. Lasts until the end of the next round.', [['name', 'Blessing'], ['t1', 'Tier I'], ['t2', 'Tier II'], ['t3', 'Tier III']], blessings),
  tbl('treeNums', 'Tuning numbers by tree', 'Every constant of the tree rooms.', [['tree', 'Tree', 0, 'name'], ['key', 'Constant'], ['value', 'Value']], treeConsts),
];
S_.vault = [
  p('Four vaultbreaker rooms stand in front of the vault doors, all four in every match; their positions shuffle every round. Each makes votes toward opening the vault and a token that helps the next heist. The ring: Ram, Locksmith, Counting House, Keystone, back to the Ram.'),
  tbl('vbs', 'The 4 vaultbreakers', '', [['name', 'Heist', 0, 'name'], ['role', 'Style'], ['what', 'What it does', 0, 'wrapc'], ['vote', 'Vote contribution', 0, 'wrapc'], ['token', 'Makes'], ['tokenUse', 'Token use', 0, 'wrapc']], vbs),
  tbl('vbnums', 'Vaultbreaker tuning numbers', '', [['type', 'Heist', 0, 'name'], ['key', 'Constant'], ['value', 'Value']], vbConsts),
  kv('THE VAULT', vaultFacts),
  tbl('vtok', 'Vaultbreaker tokens', '', [['name', 'Token', 0, 'name'], ['made', 'Made at'], ['desc', 'What it does', 0, 'wrapc']], tokens),
  tbl('vnum', 'Vault tuning numbers', '', [['key', 'Constant', 0, 'name'], ['value', 'Value']], Object.entries(VKV).map(([k, v]) => ({ id: 'v-' + k, key: k, value: fmtV(k, v) }))),
];
S_.home = [
  p('Every goblin owns a home with an elixir pump. Elixir buys base upgrades, brews, knowledge and sends. A level-1 pump is capped by its tank, so an idle pump wastes time.'),
  tbl('pump', 'Elixir pump', '', [['level', 'Level', 0, 'name'], ['rate', 'Rate'], ['tank', 'Tank', 1], ['round', 'Per round (full)', 1], ['match', 'Per match', 1]], elixir),
  { t: 'cards', cards: [kv('Elixir sinks and rules', elixirFacts), kv('Home base numbers', homeFacts)] },
  tbl('upgrades', 'The base upgrade tree', 'Cost is in elixir. Total is the running cost of buying each upgrade in order.', [['tab', 'Tab'], ['name', 'Upgrade', 0, 'name'], ['level', 'Level', 1], ['cost', 'Cost', 1], ['total', 'Running total', 1], ['fx', 'Effect', 0, 'wrapc']], upgrades),
  tbl('sends', 'The 6 sendables', 'Sent from your Elixir Screen at another room or home; the target gets a ' + S(HB.TELEGRAPH_MS) + ' warning first.', [['name', 'Send', 0, 'name'], ['cost', 'Cost', 1], ['ms', 'Lasts'], ['target', 'Target'], ['fx', 'Effect', 0, 'wrapc'], ['counter', 'Counter', 0, 'wrapc']], sends),
];
S_.loot = [
  p('Gear drops by weighted chance; the rarer it is, the stronger it is. Tiers come from drop chance. The tables below are computed from the live drop pools.'),
  tbl('tierbands', 'Tier bands', '', [['tier', 'Tier'], ['band', 'Drop chance band'], ['nW', 'Weapons', 1], ['pW', 'Of weapon drops %', 1], ['nA', 'Armour', 1], ['pA', 'Of armour drops %', 1]], tierRows.map((r, i) => ({ ...r, band: ['crafted only', ...tierThresholds.map(t => t.band)][i] }))),
  { t: 'cards', cards: [kv('Where gear comes from', lootPools), kv('Price formulas', priceFormulas), kv('Pool sizes', [['Weapons in the pool', weapons0.filter(i => i.chance > 0).length], ['Armour in the pool', armours0.filter(i => i.chance > 0).length], ['Relic candidates', relicPool.length], ['Utility items in shops', G.UTIL_KEYS.length], ['Charms in shops', G.CHARM_KEYS.length]])] },
];

const TABS = [['overview', 'Overview'], ['match', 'Match'], ['goblins', 'Goblins', goblins.length], ['weapons', 'Weapons', weapons.length], ['armour', 'Armour', armours.length], ['items', 'Items', consumables.length], ['recipes', 'Recipes', recipes.length], ['knowledge', 'Knowledge', perks.length],
  ['rooms', 'Rooms', arena.length + attached.length], ['trees', 'Trees', trees.length], ['vault', 'Vault', vbs.length], ['home', 'Home', upgrades.length], ['loot', 'Loot']];
const data = { stamp: 'source ' + srcHash(), tabs: TABS.map(([id, label, n]) => ({ id, label, n })), sections: S_,
  counts: { goblins: goblins.length, weapons: weapons.length, armour: armours.length, items: consumables.length, recipes: recipes.length, perks: perks.length, trees: trees.length, vbs: vbs.length, upgrades: upgrades.length, sends: sends.length, arena: arena.length, attached: attached.length } };

function build() {
  const tpl = fs.readFileSync(path.join(__dirname, 'gameinfo.template.html'), 'utf8');
  return { data, html: tpl.replace('/*DATA*/null', () => JSON.stringify(data).replace(/</g, '\\u003c')) };
}
// the page is stale when the source hash it was built from (printed in it) no longer matches the files
function stale() { try { return !fs.readFileSync(OUT, 'utf8').includes('"source ' + srcHash() + '"'); } catch (e) { return true; } }
module.exports = { build, stale, OUT, SOURCES, srvConst };
if (require.main === module) {
  const { html } = build(); fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, html);
  console.log('docs/game-info.html:', JSON.stringify(data.counts));
}

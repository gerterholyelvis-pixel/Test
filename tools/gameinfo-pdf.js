// Builds docs/game-info-print.html (a static, print-friendly reference of everything in the game) straight from the game's data modules.
// PDF: node tools/gameinfo-pdf.js && chrome --headless --print-to-pdf=docs/Goblin-King-Game-Info.pdf docs/game-info-print.html   (see npm run gameinfo:pdf)
const fs = require('fs'), path = require('path');
const G = require('../items.js'), W = require('../world.js'), E = require('../elixir.js'), H = require('../homebase.js'), V = require('../vault5.js'), VB = require('../vb5.js'), T = require('../rooms5-trees.js');

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nm = k => (G.ITEMS[k] && G.ITEMS[k].name) || k;
const table = (head, rows, cls = []) => `<table><thead><tr>${head.map((h, i) => `<th class="${cls[i] || ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${cls[i] || ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const sec = (title, body, note) => `<section><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}${body}</section>`;
const kv = o => table(['Setting', 'Value'], Object.entries(o).map(([k, v]) => [k, v]));
const items = Object.values(G.ITEMS).filter(i => !i.up);   // reforged "+" twins are summarised in the knowledge section
const tot = type => items.filter(i => i.type === type).reduce((s, i) => s + (i.chance || 0), 0) || 1;
const pct = (i, t) => i.chance ? (100 * i.chance / t).toFixed(1) : '';
const scrap = k => Object.entries(G.recycleYield(k) || {}).map(([a, b]) => b + ' ' + a).join(', ');

const parts = [];
// 1 overview
parts.push(sec('Overview', kv({
  'Players per match': 8, 'Round length (s)': E.ROUND_MS / 1000, 'Match rounds (decided after)': E.MATCH_ROUNDS, 'Sudden death starts after round': V.K.SUDDEN_ROUND,
  'Round 1': 'Home phase: you stay in your own home room (workbench, recycler, pump, Elixir Screen)', 'Starting gold': G.START_GOLD,
  'Backpack / quick slots': G.SLOTS.backpack + ' / ' + G.SLOTS.quick, 'Melee reach (m)': G.COMBAT.melee, 'Ranged reach (m)': G.COMBAT.ranged, 'Unarmed damage': G.COMBAT.unarmed,
  'Regeneration': `${G.COMBAT.regenAmt} HP every ${G.COMBAT.regenEvery / 1000} s after ${G.COMBAT.regenIdle / 1000} s unhurt`, 'Tiers': G.TIER_NAMES.join(', '), 'Knowledge tier thresholds': G.KNOWLEDGE_TIERS.join(' / '),
  'Arena': `${W.N}x${W.N} grid, ${W.NARENA} rooms, ${W.NATT} attached rooms, ${W.NSIDE} per side (${W.HOME_IDS.length} homes at positions ${W.HOME_POS.join(" and ")}, ${W.LOOT_IDS.length} loot rooms)`, 'Room size (m)': `arena ${W.W} x ${W.W}, vault row/column ${W.V}, home ${W.HS}`,
}), 'Everything below is generated from the game\'s own data files.'));
// 2 goblins
parts.push(sec('Starting goblins', table(['#', 'Goblin', 'Odds %', 'Size x', 'Speed x', 'HP bonus', 'Reach +m', 'Perk', 'What it does'],
  G.GOBLINS.map((g, i) => [i + 1, g.name, g.odds, g.size || g.scale || '', (G.SPEED && G.SPEED[i]) || '', g.hp || 0, g.reach || 0, g.perkName || '', g.perkText || g.desc || '']), ['n', '', 'n', 'n', 'n', 'n', 'n', '', '']),
  'Odds are the chance of being assigned each goblin when you join. The first three are 20% each.'));
// 3 weapons
const wt = tot('weapon');
parts.push(sec('Weapons', table(['Weapon', 'Tier', 'Family', 'Dmg', 'Reach', 'Swing ms', 'DPS', 'Special', 'Drop %', 'Price', 'Recycles to'],
  items.filter(i => i.type === 'weapon').map(i => { const c = G.combat(i.key); const sp = [c.ranged ? 'ranged' : '', c.bleed ? `bleed ${c.bleed[0]}x${c.bleed[1]}` : '', c.bolt ? `bolt ${c.bolt}` : ''].filter(Boolean).join(', ');
    return [i.name, i.tier, i.family, c.dmg, c.range.toFixed(1), c.cd, (c.dmg * 1000 / c.cd).toFixed(1), sp, pct(i, wt), i.price || '', scrap(i.key)]; }), ['', '', '', 'n', 'n', 'n', 'n', '', 'n', 'n', ''])));
// 4 armour
const at = tot('armor');
parts.push(sec('Armour', table(['Armour', 'Tier', 'Family', 'Health', 'Speed', 'Thorns', 'Drop %', 'Price', 'Recycles to'],
  items.filter(i => i.type === 'armor').map(i => [i.name, i.tier, i.family, i.health, i.speed ? Math.round((i.speed - 1) * 100) + '%' : '', G.armorThorns ? (G.armorThorns(i.key) || '') : '', pct(i, at), i.price || '', scrap(i.key)]), ['', '', '', 'n', 'n', 'n', 'n', 'n', ''])));
// 5 consumables and charms
parts.push(sec('Consumables, throwables and charms', table(['Item', 'Type', 'Tier', 'Price', 'Effect'],
  items.filter(i => i.type !== 'weapon' && i.type !== 'armor').map(i => [i.name, i.type, i.tier, i.price || '', i.desc || (i.use ? 'use: ' + i.use : '')]), ['', '', '', 'n', ''])));
// 6 recipes and stations
parts.push(sec('Crafting', kv(Object.fromEntries([
  ['Normal workbench (homes)', `up to tier ${G.STATIONS.bench.normal.maxTier}, cost x${G.STATIONS.bench.normal.costMul}, craft ${G.STATIONS.bench.normal.craftMs / 1000} s`],
  ['Master Forge (loot room)', `up to tier ${G.STATIONS.bench.master.maxTier}, cost x${G.STATIONS.bench.master.costMul}, craft ${G.STATIONS.bench.master.craftMs / 1000} s, +${G.STATIONS.bench.master.bonusTier} bonus tier`],
  ['Home recycler', Math.round(G.STATIONS.recycler.home.eff * 100) + '% yield'], ['Grand Recycler (loot room)', Math.round(G.STATIONS.recycler.full.eff * 100) + '% yield'],
])) + table(['Makes', 'Kind', 'Tier', 'Knowledge', 'Parts'], Object.values(G.RECIPES).map(r => [nm(r.out), (G.ITEMS[r.out] || {}).type || '', r.tier, r.needs, Object.entries(r.cost).map(([k, v]) => v + ' ' + k).join(', ')]), ['', '', 'n', 'n', ''])));
// 7 knowledge
parts.push(sec('Knowledge', table(['Branch', 'Rank', 'Perk', 'Points', 'Effect'], G.PERKS.map(p => [p.branch, p.rank, p.name, p.cost, p.desc]), ['', 'n', '', 'n', '']) +
  table(['Goblin', 'Starting knowledge', 'Starting points'], G.GOBLINS.map((g, i) => [g.name, G.KNOWLEDGE[i], G.knowPoints(G.KNOWLEDGE[i], 0, [])]), ['', 'n', 'n']),
  'You earn 1 knowledge point per ' + G.KNOW.step + ' knowledge, plus 1 per brain eaten. Perks are lost on death. Every weapon and armour can be reforged once into a "+" twin with about +' + Math.round((G.KNOW.up - 1) * 100) + '% stat.'));
// 8 tree rooms
const tspecs = T.specs();
parts.push(sec('Tree rooms (inner corners)', table(['Room', 'Spawn weight %', 'Knowledge/min', 'What you do there'], T.TYPES.map(t => { const s = tspecs.find(x => x.type === t) || {}; return [T.NAMES[t], T.WEIGHTS[t], (s.yield && s.yield.knowPerMin) || '', (s.yield && s.yield.notes) || '']; }), ['', 'n', 'n', '']),
  'Four of the ten are rolled per match with no duplicates. Knowledge from tree rooms is capped per round and per match.'));
// 9 vaultbreakers + vault
parts.push(sec('Vaultbreaker rooms and the vault', table(['Room', 'Token it makes', 'Idea'], [
  ['Ram (siege)', nm(VB.TOKENS && VB.RING ? VB.RING.ram : ''), 'A two-player winch swings a ram at the vault door. Defenders place barricades in its lane. Door damage persists between rounds.'],
  ['Locksmith (stealth)', nm(VB.RING.locksmith), 'Five pins set with timing presses. Noise summons Vault Wardens.'],
  ['Counting House (economy)', nm(VB.RING.counting), 'A vote market with counter-votes and a strongbox you can rob.'],
  ['Keystone (ritual)', nm(VB.RING.keystone), 'Keep an ordered circuit of flames lit until the round ends.'],
]) + kv({
  'Vaultbreaker positions': 'shuffle every round (announced ' + VB.K.ANNOUNCE_MS / 1000 + ' s before the round ends)', 'Vault claim': `hold the dais; gains frozen when shared; decides the match at the time limit only`,
  'Alarm': `runs while someone gains and ${V.K.ALARM_AFTER_MS / 1000} s after`, 'Wardens': `one every ${V.K.WARDEN_EVERY / 1000} s, max ${V.K.WARDEN_MAX}`, 'Coffers': `${V.K.COFFER_HANDFULS} handfuls, refill ${V.K.COFFER_REFILL / 1000} s, ${V.K.SCOOP_GOLD} gold per scoop, ${V.K.SCOOP_PER_ROUND} per round`,
  'Door bars': `${V.K.BAR_MS / 1000} s to bar a door`, 'Treasury per round': `${V.K.TREASURY_GOLD} gold, ${V.K.TREASURY_KNOW} knowledge`, 'Relic restock rounds': V.K.RELIC_ROUNDS.join(', '),
})));
// 10 elixir and base
parts.push(sec('Elixir and home base', table(['Pump level', 'Seconds per elixir', 'Tank'], E.PUMP_LEVELS.map((l, i) => l ? [i, l.ms / 1000, l.cap] : null).filter(Boolean), ['n', 'n', 'n']) + kv({
  'Carry cap': E.CARRY_CAP, 'Brew heal': E.SINKS.brewHeal + ' elixir', 'Brew tonic': E.SINKS.brewTonic + ' elixir', Refine: E.SINKS.refine + ' elixir', Distill: E.SINKS.distill + ' elixir', 'Lock oil': E.SINKS.oil + ' elixir',
}) + table(['Upgrade', 'Screen tab', 'Level', 'Cost (elixir)', 'Effect'], Object.entries(H.UPGRADES).flatMap(([id, u]) => (u.levels || []).map((l, i) => [u.name || id, u.tab, i + 1, l.cost, l.fx])), ['', '', 'n', 'n', '']) +
  table(['Sendable', 'Cost', 'Seconds', 'Target', 'Effect', 'Counter'], H.SEND_IDS.map(id => { const s = H.SENDS[id]; return [s.name, s.cost, s.ms / 1000, s.target, s.fx, s.counter]; }), ['', 'n', 'n', '', '', ''])));
// 11 rooms
parts.push(sec('Map', table(['Kind', 'Count', 'Rooms'], [
  ['Arena cells', W.NARENA, '0-24 (centre cell 12 is the vault)'], ['Tree rooms (inner corners)', W.TREE_CELLS.length, W.TREE_CELLS.join(', ')], ['Vaultbreaker rooms', Object.keys(W.VB_CELLS).length, Object.entries(W.VB_CELLS).map(([d, c]) => d + ': ' + c).join(', ')],
  ['Home rooms (spawn)', W.HOME_IDS.length, 'attached rooms ' + W.HOME_IDS.join(', ')], ['Loot rooms', W.LOOT_IDS.length, 'attached rooms ' + W.LOOT_IDS.join(', ') + ' (one Master Forge, one Grand Recycler)'],
]), ['', 'n', '']));

const css = `@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}body{font:9.2pt/1.35 "Segoe UI",Arial,sans-serif;color:#1c2216;margin:0}
h1{font:700 28pt/1 "Segoe UI",Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;margin:0 0 2mm;color:#6b4a0a}.sub{color:#59634d;margin:0 0 6mm}
h2{font:700 15pt/1.1 "Segoe UI",Arial,sans-serif;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #b8861f;padding-bottom:1mm;margin:7mm 0 2.5mm;break-after:avoid;color:#3d2c06}
section{break-inside:auto}table{border-collapse:collapse;width:100%;margin:0 0 4mm;font-size:8pt}th,td{border:1px solid #cfd3c2;padding:1.2mm 1.8mm;text-align:left;vertical-align:top}
th{background:#ece5cf;font-weight:700;text-transform:uppercase;font-size:7.2pt;letter-spacing:.04em}tr{break-inside:avoid}tr:nth-child(even) td{background:#f6f4ec}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.note{color:#59634d;margin:0 0 2mm;font-size:8.5pt}`;
const html = `<!doctype html><meta charset="utf-8"><title>Goblin King Game Info</title><style>${css}</style><h1>Goblin King</h1><p class="sub">Game reference: goblins, items, rooms, rules and odds. Generated ${new Date().toISOString().slice(0, 10)} from the game data.</p>${parts.join('')}`;
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'game-info-print.html'), html);
console.log('docs/game-info-print.html written,', html.length, 'bytes');

// Regenerates docs/game-info.html (a standalone, sortable reference of every item, goblin, recipe and number) straight from items.js.
// Run: node tools/gameinfo.js        (npm run gameinfo)   Open docs/game-info.html in a browser.
const fs = require('fs'), path = require('path'), G = require('../items.js');

const name = k => (G.ITEMS[k] && G.ITEMS[k].name) || k;
const items = Object.values(G.ITEMS);
const wsum = type => items.filter(i => i.type === type).reduce((s, i) => s + (i.chance || 0), 0) || 1;
const pct = (i, tot) => i.chance ? +(100 * i.chance / tot).toFixed(1) : 0;

// goblins: the 12-type system exposes G.GOBLINS ({name, odds, speed, scale, knowledge, weapon, armor, perk}); until then, the original five
const GOBLINS = G.GOBLINS || ['Small Goblin', 'Goblin', 'Big Goblin', 'Goblin Wizard', 'GOBLIN KING'].map((n, i) => ({
  name: n, odds: [30, 30, 30, 9, 1][i], speed: G.SPEED[i], scale: [0.75, 1, 1.3, 1.1, 1.2][i], knowledge: G.KNOWLEDGE[i], weapon: G.START[i].weapon, armor: G.START[i].armor }));
const goblins = GOBLINS.map((g, i) => ({ n: i + 1, name: g.name, odds: g.odds, speed: g.speed, size: g.scale, knowledge: g.knowledge,
  weapon: name(g.weapon), armor: name(g.armor), hp: (G.ITEMS[g.armor] || {}).health || 0, perk: g.perk || '' }));

const wTot = wsum('weapon'), aTot = wsum('armor');
const weapons = items.filter(i => i.type === 'weapon').map(i => { const c = G.combat(i.key);
  return { name: i.name, tier: i.tier, tierN: i.tierN, family: i.family, dmg: c.dmg, reach: +c.range.toFixed(1), swing: c.cd, dps: +(c.dmg * 1000 / c.cd).toFixed(1), ranged: c.ranged ? 'yes' : '', drop: pct(i, wTot), price: i.price || 0, scrap: Object.entries(G.recycleYield(i.key) || {}).map(([k, v]) => v + ' ' + k).join(', '), key: i.key }; });
const armour = items.filter(i => i.type === 'armor').map(i => ({ name: i.name, tier: i.tier, tierN: i.tierN, family: i.family, hp: i.health, speed: i.speed ? Math.round((i.speed - 1) * 100) : 0, drop: pct(i, aTot), price: i.price || 0, scrap: Object.entries(G.recycleYield(i.key) || {}).map(([k, v]) => v + ' ' + k).join(', '), key: i.key }));
const others = items.filter(i => i.type !== 'weapon' && i.type !== 'armor').map(i => ({ name: i.name, type: i.type, tier: i.tier, tierN: i.tierN, family: i.family, price: i.price || 0, effect: i.desc || '', key: i.key }));
const recipes = Object.values(G.RECIPES).map(r => ({ out: name(r.out), kind: (G.ITEMS[r.out] || {}).type || '', tier: r.tier, needs: r.needs, cost: Object.entries(r.cost).map(([k, v]) => v + ' ' + k).join(', ') }));
const data = {
  stamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
  counts: { weapons: weapons.length, armour: armour.length, items: others.length, goblins: goblins.length, recipes: recipes.length },
  tiers: G.TIER_NAMES.map((t, i) => ({ tier: t, n: i })), knowledgeTiers: G.KNOWLEDGE_TIERS, startGold: G.START_GOLD, slots: G.SLOTS,
  combat: { 'Melee reach (m)': G.COMBAT.melee, 'Ranged reach (m)': G.COMBAT.ranged, 'Unarmed damage': G.COMBAT.unarmed, 'Regen starts after (s)': G.COMBAT.regenIdle / 1000, 'Regen tick (s)': G.COMBAT.regenEvery / 1000, 'Regen per tick (HP)': G.COMBAT.regenAmt },
  goblins, weapons, armour, others, recipes };

const html = fs.readFileSync(path.join(__dirname, 'gameinfo.template.html'), 'utf8').replace('/*DATA*/null', () => JSON.stringify(data));
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'game-info.html'), html);
console.log('docs/game-info.html:', JSON.stringify(data.counts));

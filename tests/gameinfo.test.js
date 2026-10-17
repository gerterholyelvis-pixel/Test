// the Goblin King Codex (tools/gameinfo.js): every item, goblin, recipe, perk, tree and upgrade is in the generated data, the numbers match the modules,
// the server-side constants it reads out of server.js agree with the shared modules, and the server serves it at /codex under the CSP.
const L = require('./lib.js'), { assert, eq } = L;
const http = require('http'), crypto = require('crypto'), vm = require('vm'), fs = require('fs'), path = require('path');
const GI = require('../tools/gameinfo.js'), G = require('../items.js'), EX = require('../elixir.js'), HB = require('../homebase.js'), V5 = require('../vault5.js'), VB = require('../vb5.js'), T5 = require('../rooms5-trees.js'), WORLD = require('../world.js');
const { build } = GI, built = build(), D = built.data;
const tables = {}; for (const sec of Object.values(D.sections)) for (const b of sec) for (const x of (b.t === 'cards' ? b.cards : [b])) if (x.t === 'table') tables[x.id] = x;
const cv = c => c && typeof c === 'object' && !Array.isArray(c) ? c.v : c;
const get = (port, p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port, path: p }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: b })); }).on('error', rej); });
const keys = type => Object.values(G.ITEMS).filter(i => !i.up && i.type === type).map(i => i.key);

(async () => {
  const srv = await L.startServer();
  let fail = 1;
  try {
    fail = await L.run('gameinfo', [
      ['every weapon, armour, consumable and charm of items.js has a row, and nothing else does', () => {
        eq(tables.weapons.rows.map(r => r.id).sort(), keys('weapon').sort(), 'weapons');
        eq(tables.armour.rows.map(r => r.id).sort(), keys('armor').sort(), 'armour');
        eq(tables.items.rows.map(r => r.id).sort(), [...keys('consumable'), ...keys('charm')].sort(), 'items');
      }],
      ['every recipe, goblin, perk, tree, vaultbreaker, upgrade level and sendable is present', () => {
        eq(tables.recipes.rows.map(r => r.id).sort(), G.RECIPES.map(r => r.id).sort(), 'recipes');
        eq(tables.goblins.rows.map(r => cv(r.name)), G.GOBLINS.map(g => g.name), 'goblins');
        eq(tables.perks.rows.map(r => r.id).sort(), G.PERKS.map(p => p.id).sort(), 'perks');
        eq(tables.trees.rows.map(r => r.id), T5.TYPES, 'trees');
        eq(tables.vbs.rows.map(r => r.id), VB.TYPES, 'vaultbreakers');
        eq(tables.upgrades.rows.length, Object.values(HB.UPGRADES).reduce((s, u) => s + u.levels.length, 0), 'upgrade levels');
        eq(tables.sends.rows.length, HB.SEND_IDS.length, 'sends');
        eq(tables.arena.rows.length, 25); eq(tables.attached.rows.length, WORLD.NATT);
        eq(tables.pump.rows.length, 3, 'pump levels');
      }],
      ['weapon, armour, goblin and recipe numbers match the modules', () => {
        for (const r of tables.weapons.rows) { const it = G.ITEMS[r.id], c = G.combat(r.id); if (r.kind === 'bolt') continue; eq(r.dmg, c.dmg, r.id + ' damage'); eq(r.swing, c.cd, r.id + ' swing'); eq(r.reach, +c.range.toFixed(1), r.id + ' reach'); eq(r.price, it.price, r.id + ' price'); eq(+r.dps, +(c.dmg * 1000 / c.cd).toFixed(1), r.id + ' dps'); }
        for (const r of tables.armour.rows) { const it = G.ITEMS[r.id]; eq(r.hp, it.health, r.id + ' health'); eq(r.thorns, it.thorns || 0, r.id + ' thorns'); eq(r.speed, it.speed ? Math.round((it.speed - 1) * 100) : 0, r.id + ' speed'); eq(r.price, it.price, r.id + ' price'); }
        tables.goblins.rows.forEach((r, i) => { const g = G.GOBLINS[i]; eq(cv(r.odds), g.odds, g.name + ' odds'); eq(r.hp, G.goblinHp(i, G.ITEMS[G.START[i].armor].health), g.name + ' health'); eq(r.size, g.size); eq(r.know, G.KNOWLEDGE[i]); eq(r.speed, +G.SPEED[i].toFixed(2)); eq(cv(r.weapon), G.ITEMS[G.START[i].weapon].name); });
        for (const r of tables.recipes.rows) { const rc = G.RECIPES.find(q => q.id === r.id); eq(r.cost, Object.entries(rc.cost).map(([k, v]) => v + ' ' + k).join(', '), r.id + ' cost'); eq(r.tier, rc.tier); eq(cv(r.needs), rc.needs, r.id + ' knowledge'); }
        for (const r of tables.perks.rows) { const p = G.PERK[r.id]; eq(r.cost, p.cost); eq(r.rank, p.rank); eq(r.desc, p.desc); }
      }],
      ['percentages add up: goblin odds, tree weights, chest and merchant pools, mystery kinds', () => {
        const sum = (rows, k) => +rows.reduce((s, r) => s + cv(r[k]), 0).toFixed(1);
        eq(sum(tables.goblins.rows, 'odds'), 100, 'goblin odds'); eq(sum(tables.trees.rows, 'weight'), 100, 'tree weights');
        assert(Math.abs(sum(tables.weapons.rows, 'chest') - 100) < 0.5, 'chest pool'); assert(Math.abs(sum(tables.weapons.rows, 'shop') + sum(tables.armour.rows, 'shop') - 100) < 0.5, 'merchant pool');
        eq(sum(tables.mystery.rows, 'odds'), 100, 'mystery'); assert(Math.abs(sum(tables.enemies.rows, 'w') - 100) < 0.5, 'enemy weights');
        const present = tables.trees.rows.reduce((s, r) => s + cv(r.present), 0); assert(Math.abs(present - 400) < 2, 'four trees per match, got ' + present);
        for (const id of WORLD.LOOT_IDS) { const r = tables.attached.rows[id]; assert(Math.abs(['forge', 'grand', 'chest', 'mystery', 'merchant'].reduce((s, k) => s + cv(r[k]), 0) - 100) < 0.5, 'loot room ' + id); }
      }],
      ['constants read out of server.js agree with the shared modules', () => {
        eq(GI.srvConst('ROUND_MS'), EX.ROUND_MS, 'round length'); eq(GI.srvConst('SUDDEN_ROUND'), V5.K.SUDDEN_ROUND, 'sudden death round'); eq(GI.srvConst('MAX_ROUND'), V5.K.MAX_ROUND, 'last round'); eq(V5.K.MAX_ROUND, EX.MATCH_ROUNDS, 'rounds');
        const pace = GI.srvConst('PACE'); assert(pace.income > 0 && pace.bountyKill > 0 && pace.showdownAt > 0, 'PACE'); eq(GI.srvConst('BRIBE').cost, 50);
        const facts = JSON.stringify(D.sections.match); assert(facts.includes('"' + pace.income + ' gold to every living goblin'), 'income on the page'); assert(facts.includes(pace.bountyKill + ' per kill'), 'bounty on the page');
        for (const [k, n] of Object.entries(GI.srvConst('NPC'))) { const row = tables.npcs.rows.find(r => r.id === 'e-' + k); assert(row && row.hp === n.hp && row.dmg === n.dmg, 'enemy ' + k); }
      }],
      ['vault, trees, vaultbreakers and elixir numbers come from their modules', () => {
        const v = JSON.stringify(D.sections.vault); for (const k of ['COFFER_REFILL', 'TREASURY_GOLD', 'SCOOP_GOLD', 'WARDEN_EVERY']) assert(v.includes('"' + k + '"') || v.includes(String(V5.K[k])), k);
        eq(tables.vnum.rows.length, Object.keys(V5.K).length, 'every vault constant listed');
        const covered = new Set(tables.treeNums.rows.map(r => r.key)); for (const k of Object.keys(T5.K)) assert(covered.has(k), 'tree constant ' + k + ' is not on the page');
        const vbc = new Set(tables.vbnums.rows.map(r => r.key)); for (const k of Object.keys(VB.K)) assert(vbc.has(k), 'vaultbreaker constant ' + k);
        tables.pump.rows.forEach((r, i) => { eq(r.tank, EX.PUMP_LEVELS[i + 1].cap); });
        for (const r of tables.sends.rows) { const d = HB.SENDS[r.id.slice(5)]; eq(r.cost, d.cost, r.id); }
        eq(tables.trees.rows.map(r => cv(r.weight)).length, 10); T5.TYPES.forEach(t => eq(tables.trees.rows.find(r => r.id === t).what.includes(String(T5.K[TREE_FIRST[t]])), true, t + ' text shows its number'));
      }],
      ['links point at rows that exist', () => {
        const ids = {}; for (const [tabId, sec] of Object.entries(D.sections)) for (const b of sec) for (const x of (b.t === 'cards' ? b.cards : [b])) if (x.t === 'table') for (const r of x.rows) (ids[tabId] = ids[tabId] || new Set()).add(r.id);
        const bad = [], walk = (c, from) => { if (Array.isArray(c)) return c.forEach(x => walk(x, from)); if (!c || typeof c !== 'object' || !c.href) return; const [t, ref] = c.href.slice(1).split('/'); if (!D.tabs.some(x => x.id === t)) bad.push(from + ' -> ' + c.href); else if (ref && !(ids[t] && ids[t].has(ref))) bad.push(from + ' -> ' + c.href); };
        for (const [tabId, sec] of Object.entries(D.sections)) for (const b of sec) for (const x of (b.t === 'cards' ? b.cards : [b])) { if (x.t === 'table') for (const r of x.rows) for (const k of Object.keys(r)) walk(r[k], tabId + ':' + r.id); else if (x.t === 'card') for (const [a, c] of x.rows) { walk(a, tabId); walk(c, tabId); } }
        eq(bad.slice(0, 5), [], 'dead links');
      }],
      ['the generated page is one file whose inline script parses, and the data has no raw "<"', () => {
        const html = built.html, scripts = [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)]; eq(scripts.length, 1, 'one inline script');
        new vm.Script(scripts[0][1]); assert(!/<\/script/i.test(scripts[0][1]), 'script body');
        assert(html.includes('"source ' + require('crypto').createHash('sha1').update(GI.SOURCES.map(f => fs.readFileSync(path.join(L.ROOT, f), 'utf8').replace(/\r\n?/g, '\n')).join('')).digest('hex').slice(0, 8) + '"'), 'source hash is printed');
      }],
      ['the server serves /codex with a CSP that allows only its own inline script', async () => {
        const r = await get(srv.port, '/codex'); eq(r.status, 200); assert(/text\/html/.test(r.headers['content-type']), 'content type'); assert(r.body.includes('Goblin King Codex'));
        eq(r.headers['x-content-type-options'], 'nosniff'); eq(r.headers['cache-control'], 'no-cache');
        const csp = r.headers['content-security-policy'], script = csp.split(';').find(s => s.trim().startsWith('script-src')), inline = r.body.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/)[1];
        assert(script.includes("'sha256-" + crypto.createHash('sha256').update(inline.replace(/\r\n?/g, '\n')).digest('base64') + "'"), 'script hash'); assert(!script.includes('unsafe-inline') && !script.includes('unsafe-eval'), script);
        eq((await get(srv.port, '/codex/')).status, 200); eq((await get(srv.port, '/codex.html')).status, 404);
      }],
      ['the main menu has a Codex button that opens /codex in a new tab', () => {
        assert(/id="b-codex"/.test(fs.readFileSync(path.join(L.ROOT, 'index.html'), 'utf8')), 'button in index.html');
        const m = fs.readFileSync(path.join(L.ROOT, 'menu.js'), 'utf8'); assert(/b-codex/.test(m) && /window\.open\('\/codex', '_blank'/.test(m), 'handler in menu.js');
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();
const TREE_FIRST = { well: 'wellHits', press: 'huskMax', spring: 'bottleCap', seer: 'seerCap', graft: 'graftCap', thorn: 'gripDps', gambler: 'feedCap', memory: 'memMax', oak: 'oakCap', elder: 'rootMax' };

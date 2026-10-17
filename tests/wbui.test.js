// WBUI: the workbench / recycler screen. Pure model (recipe rows, reasons, comparison, filters, junk) and the DOM screen driven through a stub DOM (tests/stubdom.js), plus static checks of the wiring.
const fs = require('fs'), path = require('path'), L = require('./lib.js'), SD = require('./stubdom.js');
const G = require('../items.js'), W = require('../wbui.js');
const read = f => fs.readFileSync(path.join(L.ROOT, f), 'utf8');
const info = k => (G.info && G.info(k)) || G.ITEMS[k], pn = p => (G.PARTS.find(x => x.key === p) || { name: p }).name;
const FULL = { wood: 50, metal: 50, leather: 50, cloth: 50, gold: 50, bone: 50, gem: 50, string: 50, crystal: 50 };
const emptyInv = () => ({ backpack: Array(9).fill(null), quick: Array(3).fill(null), weapon: null, armor: null, charm: null });
const st = o => Object.assign({ parts: {}, know: 0, perks: [], benchType: 'normal', inv: emptyInv(), busy: false, full: false, partName: pn }, o);
const rowsOf = o => W.recipeRows(G, st(o), info), byOut = (rows, k) => rows.find(x => x.key === k);

// ---- DOM harness
function harness(over = {}) {
  const doc = SD.makeDoc(), T = SD.makeTimers(), sent = [], said = [], S = Object.assign({ inv: emptyInv(), parts: Object.assign({}, FULL), know: 120, brains: 0, perks: [], crafting: null, benchType: 'master', hasBench: true, hasRecycler: true }, over.snap || {});
  const win = { _l: {}, addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); } };
  const banner = k => k === 'bench' ? { key: S.benchType === 'master' ? 'master' : 'normal', name: S.benchType === 'master' ? 'MASTER FORGE' : 'WORKBENCH', blurb: 'b', chips: [{ text: 'Tiers 0-V' }] } : { key: over.recKey || 'recycler', name: over.recName || 'RECYCLER', eff: over.eff == null ? 1 : over.eff, blurb: 'r', chips: [{ text: 'Returns 100%' }] };
  const ctx = { doc, win, G: () => G, get: () => S, send: m => sent.push(m), say: (t, good) => said.push(t), close() {}, icon: k => doc.createElement('canvas'), partIcon: p => doc.createElement('canvas'), partName: pn, info,
    statTxt: k => (info(k) || {}).name, tierCol: () => '#fff', partsRow: () => { const r = doc.createElement('div'); for (const p of G.PARTS) { const c = doc.createElement('div'); c.dataset.part = p.key; r.appendChild(c); } return r; },
    station: banner, yieldOf: k => { const y = G.recycleFor(k, S.perks); return y && (over.eff != null ? G.recycleEff(y, over.eff) : y); }, canRefine: () => !!over.refine, benchLv: () => over.benchLv | 0, setTimeout: T.setTimeout, clearTimeout: T.clearTimeout };
  const scr = W.create(ctx); scr.open(over.tab || 'craft');
  return { scr, S, sent, said, T, doc, win, ctx, q: s => scr.el.querySelector(s), qa: s => scr.el.querySelectorAll(s) };
}
const key = (scr, code, extra = {}) => { const e = Object.assign({ code, key: code, target: null, preventDefault() { this.defaultPrevented = true; } }, extra); const r = scr.key(e); return { r, e }; };

(async () => {
  const fail = await L.run('wbui', [
    // ---------------- model
    ['a recipe row says why it cannot be crafted, with the exact words', () => {
      const r0 = G.RECIPES.find(r => r.tier === 0), rows = rowsOf({ parts: {}, know: 0 }), x = rows.find(y => y.id === r0.id);
      L.assert(x.status === 'parts' && /^needs \d+ more [a-z]+/.test(x.reason), x.reason);
      const t2 = G.RECIPES.find(r => r.tier === 2), lk = rowsOf({ know: 10 }).find(y => y.id === t2.id);
      L.eq(lk.reason, 'knowledge ' + t2.needs + ' needed (you have 10)'); L.eq(lk.status, 'locked');
      const t3 = G.RECIPES.find(r => r.tier === 3), bn = rowsOf({ know: 120, parts: FULL }).find(y => y.id === t3.id);
      L.eq(bn.status, 'bench'); L.eq(bn.reason, 'bench too basic: Master Forge');
      const ok = rowsOf({ know: 120, parts: FULL, benchType: 'master' }).find(y => y.id === t3.id); L.eq(ok.status, 'ready'); L.assert(ok.craftable && ok.reason === '');
      L.eq(rowsOf({ parts: FULL, full: true }).find(y => y.id === r0.id).reason, 'backpack full');
      L.eq(rowsOf({ parts: FULL, busy: true }).find(y => y.id === r0.id).reason, 'already crafting');
    }],
    ['reasons name the missing parts ("needs 2 more bone")', () => {
      const r = G.RECIPES.find(q => q.tier === 0 && q.cost.bone), have = Object.assign({}, FULL, { bone: r.cost.bone - 2 }), x = rowsOf({ parts: have }).find(y => y.id === r.id);
      L.eq(x.reason, 'needs 2 more bone'); L.eq(x.lacking, { bone: 2 }); L.assert(!x.affordable && x.missing === 2);
    }],
    ['the Forge discount and bonus tier show up on the row, and the row cost is what the server charges', () => {
      const rows = rowsOf({ know: 45, parts: FULL, benchType: 'master' }), t3 = rows.find(y => y.tier === 3);
      L.assert(t3 && t3.bonus && t3.disc === 0 && t3.status === 'ready', 'bonus tier one above knowledge, full price');
      L.assert(rows.some(y => y.disc > 0 && !y.bonus), 'discount shows on at least one row');
      for (const x of rows) { const bc = G.benchCraft({ stats: { knowledge: 45 } }, x.r, 'master', []); if (!bc.why) L.eq(x.cost, bc.cost, x.id); else L.assert(!x.craftable, x.id); }
    }],
    ['rows are never craftable when the server would refuse (every recipe, three benches, with and without parts)', () => {
      for (const bench of ['normal', 'master']) for (const know of [0, 25, 70, 130]) for (const parts of [{}, FULL]) for (const x of rowsOf({ know, parts, benchType: bench })) {
        const bc = G.benchCraft({ stats: { knowledge: know } }, x.r, bench, []), can = !bc.why && Object.keys(bc.cost).every(p => (parts[p] | 0) >= bc.cost[p]);
        L.eq(x.craftable, can, x.id + ' ' + bench + ' ' + know);
      }
    }],
    ['comparison against the equipped item: +attack, health and speed, equipped, charm replace', () => {
      const w = G.RECIPES.map(r => info(r.out)).filter(i => i.type === 'weapon').sort((a, b) => a.attack - b.attack), lo = w[0], hi = w[w.length - 1];
      const inv = Object.assign(emptyInv(), { weapon: lo.key }), c = W.compare(hi.key, inv, info);
      L.eq(c.parts[0], { label: 'attack', d: hi.attack - lo.attack }); L.assert(W.cmpText(c) === '+' + (hi.attack - lo.attack) + ' attack vs ' + lo.name, W.cmpText(c));
      L.assert(W.compare(lo.key, inv, info).equipped, 'equipped'); L.assert(W.cmpText(W.compare(lo.key, Object.assign(emptyInv(), { weapon: hi.key }), info)).startsWith('−'), 'worse shows a minus');
      L.eq(W.compare(hi.key, emptyInv(), info).vs, 'nothing');
      const a = G.RECIPES.map(r => info(r.out)).filter(i => i.type === 'armor'), slow = a.find(i => i.speed && i.speed < 1), inv2 = Object.assign(emptyInv(), { armor: a.find(i => !i.speed).key }), c2 = W.compare(slow.key, inv2, info);
      L.assert(c2.parts.some(p => p.label === 'speed' && p.d < 0 && p.pct), 'armour speed delta');
      const ch = G.RECIPES.map(r => info(r.out)).find(i => i.type === 'charm'); L.assert(W.compare(ch.key, emptyInv(), info).replaces, 'charm'); L.eq(W.compare('x:bandage', inv, info), null);
    }],
    ['filters, search and sort', () => {
      const rows = rowsOf({ know: 45, parts: FULL, benchType: 'master' });
      L.assert(W.filterRows(rows, { cat: 'armor' }).every(x => x.cat === 'armor') && W.filterRows(rows, { cat: 'charm' }).length >= 4, 'category');
      const q = W.filterRows(rows, { q: 'bandage' }); L.assert(q.length === 1 && q[0].key === 'x:bandage', 'search: ' + q.length);
      L.assert(W.filterRows(rows, { q: 'armour' }).length >= 10, 'armour spelled the UK way matches armor');
      const poor = rowsOf({ know: 45, parts: { wood: 3 } }); L.assert(W.filterRows(poor, { craftable: true }).every(x => x.craftable) && W.filterRows(poor, { affordable: true }).every(x => x.affordable), 'toggles');
      L.assert(W.filterRows(rows, { newTier: true }).every(x => x.isNew && x.tier > 0), 'new tier');
      const s = W.sortRows(rows, 'cost'); for (let i = 1; i < s.length; i++) L.assert(s[i - 1].total <= s[i].total, 'cost order');
      const n = W.sortRows(rows, 'name'); for (let i = 1; i < n.length; i++) L.assert(n[i - 1].it.name <= n[i].it.name, 'name order');
      const t = W.sortRows(rows, 'tier'); for (let i = 1; i < t.length; i++) L.assert(t[i - 1].tier <= t[i].tier, 'tier order');
      L.eq(W.groupRows(rows).map(g => g.cat.id), ['weapon', 'armor', 'consumable', 'charm']); L.eq(W.groupRows(rows).reduce((a, g) => a + g.rows.length, 0), G.RECIPES.length);
    }],
    ['big recipes need a held press, small ones do not', () => {
      L.assert(W.isExpensive({ metal: 10, leather: 4, cloth: 2 }) && W.isExpensive({ gem: 2, crystal: 1 }) && !W.isExpensive({ wood: 3, bone: 1 }), 'rule');
      const rows = rowsOf({ know: 120, parts: FULL, benchType: 'master' }); L.assert(rows.some(x => x.expensive) && rows.some(x => !x.expensive), 'both kinds exist');
    }],
    ['perk branches: learned, available and locked with reasons', () => {
      const br = W.perkBranches(G, { know: 80, brains: 0, perks: ['thrifty'] }, pn), craft = br.find(b => b.id === 'craft');
      L.eq(craft.nodes.map(n => n.state), ['learned', 'available', 'locked']); L.assert(craft.nodes[1].text === 'ready to learn' && craft.nodes[2].text === 'learn Scrapper first' && craft.nodes[1].linked, craft.nodes[2].text);
      const poor = W.perkBranches(G, { know: 40, brains: 0, perks: ['thrifty'] }, pn).find(b => b.id === 'craft'); L.assert(/needs 2 points \(you have 1\)/.test(poor.nodes[1].text), poor.nodes[1].text);
      const lore = br.find(b => b.id === 'lore'); L.eq(lore.nodes.map(n => n.state), ['available', 'locked', 'locked']); L.assert(/learn Appraiser first/.test(lore.nodes[1].text), lore.nodes[1].text);
    }],
    ['junk is gear no better than what you wear; reforged twins, better gear and unrecyclables are never junk', () => {
      const w = Object.values(G.ITEMS).filter(i => i.type === 'weapon' && !i.up && G.recycleFor(i.key, [])).sort((a, b) => a.attack - b.attack), lo = w[0], mid = w[Math.floor(w.length / 2)], hi = w[w.length - 1];
      const inv = Object.assign(emptyInv(), { weapon: mid.key, backpack: [lo.key, hi.key, lo.key + '+', 'x:bandage', null, null, null, null, null] });
      const list = W.recycleList(inv, k => G.recycleFor(k, []), info), junk = W.junkIds(list, inv, info);
      L.assert(junk.includes('b0') && !junk.includes('b1') && !junk.includes('b2') && !junk.includes('b3'), JSON.stringify(junk));
      L.eq(W.junkIds(list, Object.assign({}, inv, { weapon: null }), info), [], 'nothing equipped, nothing is junk');
      const tot = W.sumYield(list, ['b0', 'b1']); L.assert(Object.keys(tot).length > 0 && Object.values(tot).every(n => n > 0), 'totals');
    }],

    // ---------------- screen (stub DOM)
    ['the screen has four tabs, a banner, a progress strip and a materials strip, and paints every recipe', () => {
      const h = harness();
      L.eq(h.qa('.wb-tab').map(t => t.dataset.tab), ['craft', 'perks', 'reforge', 'recycle']); L.assert(h.q('.wb-banner') && h.q('.wb-prog') && h.q('.wb-mats'), 'strips');
      L.eq(h.qa('.wb-card').length, G.RECIPES.length, 'one card per recipe'); L.eq(h.scr.el.dataset.st, 'master');
      L.assert(h.qa('.wb-sec').length === 4 && h.qa('.wb-sec').map(s => s.textContent.replace(/\d+$/, '')).join() === 'Weapons,Armour,Consumables,Charms', 'category sections');
    }],
    ['each card: icon, name, tier chip, stat line, cost with have/need colours, a reason line and a button', () => {
      const h = harness({ snap: { parts: { wood: 1 }, benchType: 'normal', know: 25 } }), r = G.RECIPES.find(q => q.tier === 1), c = h.q('[data-recipe="' + r.id + '"]');
      L.assert(c.querySelector('.wb-ic canvas') && c.querySelector('.wb-iname').textContent === info(r.out).name && /Tier I/.test(c.querySelector('.wb-chip.tier').textContent), 'head');
      L.assert(c.querySelectorAll('.wb-pc').length === Object.keys(h.scr.rows().find(x => x.id === r.id).cost).length && c.querySelector('.wb-pc.bad'), 'costs'); L.assert(c.querySelector('.wb-why').textContent.startsWith('needs '), c.querySelector('.wb-why').textContent);
      L.assert(c.querySelector('.wb-go.off'), 'button disabled look');
      const lk = G.RECIPES.find(q => q.tier === 2), cl = h.q('[data-recipe="' + lk.id + '"]'); L.eq(cl.dataset.status, 'locked'); L.assert(/knowledge 40 needed/.test(cl.querySelector('.wb-why').textContent), 'locked reason');
    }],
    ['clicking Craft sends the recipe; a not-ready card says why and sends nothing', () => {
      const h = harness({ snap: { know: 25, benchType: 'normal' } }), cheap = h.scr.rows().filter(x => x.craftable && !x.expensive)[0];
      h.q('[data-recipe="' + cheap.id + '"] .wb-go').click(); L.eq(h.sent, [{ craft: cheap.id }]);
      const lk = h.scr.rows().find(x => x.status === 'locked'); h.q('[data-recipe="' + lk.id + '"] .wb-go').click(); L.eq(h.sent.length, 1); L.assert(h.said.pop() === lk.reason, 'reason said');
    }],
    ['expensive recipes craft on a hold only: early release sends nothing, a full hold sends once', () => {
      const h = harness(), big = h.scr.rows().find(x => x.expensive && x.craftable), btn = h.q('[data-recipe="' + big.id + '"] .wb-go');
      L.assert(/hold/i.test(btn.textContent), 'label says hold');
      btn.dispatch('pointerdown', { button: 0 }); L.eq(h.T.ms(), [W.HOLD_MS]); btn.dispatch('pointerup'); btn.click(); h.T.fire(); L.eq(h.sent, [], 'released early');
      btn.dispatch('pointerdown', { button: 0 }); h.T.fire(); L.eq(h.sent, [{ craft: big.id }]); L.assert(!h.scr.state.hold, 'hold cleared');
    }],
    ['repaints wait while a hold is running (the button must not vanish under the finger)', () => {
      const h = harness(), big = h.scr.rows().find(x => x.expensive && x.craftable), btn = h.q('[data-recipe="' + big.id + '"] .wb-go');
      btn.dispatch('pointerdown', { button: 0 }); h.S.parts = Object.assign({}, h.S.parts, { wood: 1 }); h.scr.paint(); L.assert(h.q('[data-recipe="' + big.id + '"] .wb-go') === btn, 'same button'); h.T.fire(); L.eq(h.sent.length, 1);
    }],
    ['search box filters live; / focuses it; typing E or digits in it does not close or switch tabs; Esc leaves it', () => {
      const h = harness(); const s = h.scr.search;
      L.assert(key(h.scr, 'Slash').r && h.doc.activeElement === s, '/ focuses');
      s.value = 'bandage'; s.dispatch('input'); L.eq(h.qa('.wb-card').length, 1);
      const typed = key(h.scr, 'KeyE', { target: s }); L.assert(typed.r && !typed.e.defaultPrevented, 'E belongs to the box'); const d4 = key(h.scr, 'Digit4', { target: s }); L.assert(d4.r && h.scr.tab() === 'craft', 'digits belong to the box');
      const esc = key(h.scr, 'Escape', { target: s }); L.assert(esc.r, 'Esc consumed in the box'); L.eq(key(h.scr, 'Escape').r, false);   // second Esc: the global handler closes the screen
      L.eq(key(h.scr, 'KeyE').r, false);   // E outside the box closes
    }],
    ['filter buttons: category, craftable now, sort', () => {
      const h = harness({ snap: { know: 25, benchType: 'normal', parts: { wood: 4, bone: 2, cloth: 3, string: 3, leather: 3, metal: 4 } } });
      h.q('.wb-sb[data-cat="charm"]').click(); L.assert(h.qa('.wb-card').length > 0 && h.qa('.wb-card').every(c => h.scr.rows().find(x => x.id === c.dataset.recipe).cat === 'charm'), 'category');
      h.q('.wb-sb[data-cat="all"]').click(); h.q('.wb-sb[data-tog="craftable"]').click(); const n = h.qa('.wb-card').length; L.assert(n > 0 && n < G.RECIPES.length && h.qa('.wb-card').every(c => c.dataset.status === 'ready'), 'craftable only');
      h.q('.wb-sb[data-tog="craftable"]').click(); h.q('.wb-sb[data-sort="cost"]').click(); const tot = h.qa('[data-pane="craft"] .wb-grid').map(g => g.children.map(c => h.scr.rows().find(x => x.id === c.dataset.recipe).total));
      for (const g of tot) for (let i = 1; i < g.length; i++) L.assert(g[i - 1] <= g[i], 'sorted by cost within a category');
      h.scr.search.value = 'zzzz'; h.scr.search.dispatch('input'); L.assert(/No recipe matches/.test(h.q('.wb-empty').textContent) && h.q('.wb-empty .wb-link'), 'empty state with a way out');
    }],
    ['the pinned row lists what you can craft now (jump on click) or the closest recipe', () => {
      const h = harness(); const ready = h.scr.rows().filter(x => x.craftable).length; L.eq(h.qa('.wb-pin').length, ready);
      const pin = h.qa('.wb-pin')[0]; pin.click(); L.assert(h.scr.state.sel === pin.dataset.pin, 'selected');
      const poor = harness({ snap: { parts: {}, know: 0, benchType: 'normal' } }); L.eq(poor.qa('.wb-pin').length, 0); L.assert(/Closest: .*needs/.test(poor.q('.wb-pinnone').textContent), poor.q('.wb-pinnone').textContent);
    }],
    ['arrow keys move the selection, Enter crafts it, Space too; the selected cost shows next to the materials', () => {
      const h = harness({ snap: { benchType: 'master' } }), first = h.scr.state.sel; key(h.scr, 'ArrowRight'); L.assert(h.scr.state.sel !== first, 'moved'); key(h.scr, 'ArrowLeft'); L.eq(h.scr.state.sel, first);
      const row = h.scr.rows().find(x => x.id === first); L.assert(!row.expensive); const r = key(h.scr, 'Enter'); L.assert(r.r && r.e.defaultPrevented); L.eq(h.sent, [{ craft: first }]);
      const d = h.qa('.wb-mats [data-part]').map(c => c._d && c._d.textContent).filter(Boolean); L.assert(d.length === Object.keys(row.cost).length && d.every(t => t[0] === '−'), 'cost deltas ' + d);
    }],
    ['Enter on a big recipe is a hold: keyup before the time sends nothing', () => {
      const h = harness(), big = h.scr.rows().find(x => x.expensive && x.craftable); h.scr.state.sel = big.id; h.scr.paint(); h.scr.state.sel = big.id;
      key(h.scr, 'Enter'); L.eq(h.sent, []); h.scr.keyup({ code: 'Enter' }); h.T.fire(); L.eq(h.sent, []);
      key(h.scr, 'Enter'); h.T.fire(); L.eq(h.sent, [{ craft: big.id }]);
    }],
    ['Tab cycles the sections, digits jump, tabs without a station are skipped and say why', () => {
      const h = harness({ snap: { hasRecycler: false } }); L.eq(h.scr.tab(), 'craft');
      key(h.scr, 'Tab'); L.eq(h.scr.tab(), 'perks'); key(h.scr, 'Tab'); L.eq(h.scr.tab(), 'reforge'); key(h.scr, 'Tab'); L.eq(h.scr.tab(), 'craft', 'recycle skipped'); key(h.scr, 'Tab', { shiftKey: true }); L.eq(h.scr.tab(), 'reforge');
      L.assert(h.qa('.wb-tab').find(t => t.dataset.tab === 'recycle').classList.contains('off'), 'tab looks off'); key(h.scr, 'Digit4'); L.eq(h.scr.tab(), 'reforge'); L.assert(/no recycler/i.test(h.said.pop()), 'says why');
      const g = harness({ snap: { hasBench: false }, tab: 'recycle' }); L.eq(g.scr.tab(), 'recycle'); key(g.scr, 'Tab'); L.eq(g.scr.tab(), 'recycle', 'only one section here');
    }],
    ['the banner says which station: forge, workbench, home recycler, grand recycler; the recycle tab shows the recycler banner', () => {
      const f = harness(); L.eq([f.scr.el.dataset.st, f.q('.wb-name').textContent], ['master', 'MASTER FORGE']);
      const n = harness({ snap: { benchType: 'normal' } }); L.eq([n.scr.el.dataset.st, n.q('.wb-name').textContent], ['normal', 'WORKBENCH']);
      const g = harness({ tab: 'recycle', recKey: 'grand', recName: 'GRAND RECYCLER' }); L.eq([g.scr.el.dataset.st, g.q('.wb-name').textContent], ['grand', 'GRAND RECYCLER']);
      const hr = harness({ tab: 'recycle', recKey: 'homerec', recName: 'HOME RECYCLER', eff: 0.5 }); L.eq([hr.scr.el.dataset.st, hr.q('.wb-name').textContent], ['homerec', 'HOME RECYCLER']); L.assert(/50%/.test(hr.q('.wb-rhn').textContent), 'efficiency shown');
      f.scr.setTab('recycle'); L.eq(f.q('.wb-name').textContent, 'RECYCLER'); const hb = harness({ benchLv: 1 }); L.assert(hb.qa('.wb-chip.home').length === 1, 'home bench upgrade chip');
    }],
    ['a running craft shows in the strip with a cancel button; idle shows none', () => {
      const idle = harness(); L.assert(idle.q('.wb-cancel').disabled && !idle.q('.wb-prog').classList.contains('on'), 'idle');
      const r = G.RECIPES[0], run = harness({ snap: { crafting: { rid: r.id, key: r.out, at: 0, ms: 1000 } } }); L.assert(run.q('.wb-prog').classList.contains('on') && !run.q('.wb-cancel').disabled && /Crafting/.test(run.q('.wb-ptxt').textContent), 'running');
      run.q('.wb-cancel').click(); L.eq(run.sent, [{ craftCancel: 1 }]); L.assert(run.qa('.wb-card').every(c => c.dataset.status === 'busy' || c.dataset.status === 'locked' || c.dataset.status === 'bench'), 'every card is busy while crafting');
    }],
    ['perks tab: click a ready perk learns it, a locked one explains, arrows and Enter work', () => {
      const h = harness({ tab: 'perks', snap: { know: 60, perks: [] } }), th = h.q('[data-perk="thrifty"]'); L.eq(th.dataset.state, 'available');
      th.click(); L.eq(h.sent, [{ learn: 'thrifty' }]);
      h.q('[data-perk="reforge"]').click(); L.eq(h.sent.length, 1); L.assert(/above it first/.test(h.said.pop()), 'locked explains');
      L.eq(h.qa('.wb-branch').length, 3); L.assert(h.qa('.wb-node').length === G.PERKS.length, 'every perk drawn');
      const start = h.scr.state.psel; key(h.scr, 'ArrowRight'); L.assert(h.scr.state.psel !== start, 'moved right'); key(h.scr, 'ArrowLeft'); L.eq(h.scr.state.psel, start); h.sent.length = 0; key(h.scr, 'Enter'); L.assert(h.sent.length <= 1);
      const l = harness({ tab: 'perks', snap: { know: 60, perks: ['thrifty'] } }); L.eq(l.q('[data-perk="thrifty"]').dataset.state, 'learned'); L.eq(l.q('[data-perk="scrapper"]').dataset.state, 'available');
    }],
    ['reforge tab: lists reforgeable gear with before and after, sends the slot; without the perk it points to Perks', () => {
      const w = Object.values(G.ITEMS).find(i => i.type === 'weapon' && !i.up && G.reforgeCost(i.key)), inv = Object.assign(emptyInv(), { weapon: w.key, backpack: [w.key + '+', null, null, null, null, null, null, null, null] });
      const h = harness({ tab: 'reforge', snap: { inv, perks: ['reforge'] } }), cards = h.qa('.wb-card'); L.eq(cards.length, 1); L.assert(/Attack \d+ → \d+/.test(cards[0].querySelector('.wb-st').textContent) && cards[0].querySelector('.wb-chip.eq'), 'before/after, equipped');
      cards[0].querySelector('.wb-go').click(); L.eq(h.sent, [{ reforge: 'weapon' }]);
      const n = harness({ tab: 'reforge', snap: { perks: [] } }); L.assert(/Reforge is a Craft perk/.test(n.q('[data-pane="reforge"] .wb-empty').textContent), 'locked state'); n.q('[data-pane="reforge"] .wb-empty .wb-link').click(); L.eq(n.scr.tab(), 'perks');
    }],
    ['recycle tab: select several, see the materials preview and total, recycle them one message each', () => {
      const w = Object.values(G.ITEMS).filter(i => i.type === 'weapon' && !i.up && G.recycleFor(i.key, [])).sort((a, b) => a.attack - b.attack);
      const inv = Object.assign(emptyInv(), { weapon: w[w.length - 1].key, backpack: [w[0].key, w[1].key, 'x:bandage', w[2].key, null, null, null, null, null] });
      const h = harness({ tab: 'recycle', snap: { inv } });
      L.eq(h.qa('.wb-tile').length, 12); L.assert(h.q('#recGo').classList.contains('off') && /Select items/.test(h.q('#recGo').textContent), 'nothing selected yet');
      h.q('.wb-tile[data-slot="b0"]').click(); h.q('.wb-tile[data-slot="b1"]').click();
      L.eq(h.qa('.wb-rrow').length, 2); L.assert(h.q('.wb-rtotal .wb-y'), 'total chips'); L.assert(/Recycle 2 items/.test(h.q('#recGo').textContent), h.q('#recGo').textContent);
      const exp = W.sumYield(W.recycleList(inv, k => G.recycleFor(k, []), info), ['b0', 'b1']); L.eq(Object.keys(h.scr.state.total).sort(), Object.keys(exp).sort()); for (const p in exp) L.eq(h.scr.state.total[p], exp[p], 'total ' + p);
      const dl = h.qa('.wb-mats [data-part]').filter(c => c._d && c._d.textContent[0] === '+'); L.assert(dl.length === Object.keys(exp).length, 'deltas on the materials strip');
      h.q('#recGo').click(); L.eq(h.sent, [{ recycle: 'b0' }]); L.assert(h.q('.wb-tile[data-slot="b0"]').dataset.state === 'sent' && h.q('.wb-tile[data-slot="b1"]').dataset.state === 'sent', 'sent items cannot be picked twice'); h.T.fire(); L.eq(h.sent, [{ recycle: 'b0' }, { recycle: 'b1' }], 'one message per item, spaced out');
      
    }],
    ['recycle tab: items that cannot be recycled say so and are not selectable; keyboard Space / A / Enter', () => {
      const w = Object.values(G.ITEMS).find(i => i.type === 'weapon' && !i.up && G.recycleFor(i.key, [])), inv = Object.assign(emptyInv(), { backpack: [w.key, 'x:bandage', null, null, null, null, null, null, null] });
      const bag = Object.values(G.ITEMS).find(i => G.recycleFor(i.key, []) == null && i.key && !i.up && i.type !== 'weapon' && i.type !== 'armor');
      const h = harness({ tab: 'recycle', snap: { inv: Object.assign(inv, { backpack: [w.key, bag.key, null, null, null, null, null, null, null] }) } });
      h.q('.wb-tile[data-slot="b1"]').click(); L.eq(h.scr.state.rsel, []); L.assert(/can be recycled/.test(h.said.pop()), 'explained');
      key(h.scr, 'KeyA'); L.eq(h.scr.state.rsel, ['b0']); key(h.scr, 'KeyX'); L.eq(h.scr.state.rsel, []); key(h.scr, 'ArrowLeft'); L.eq(h.scr.state.rcur, 'b0'); key(h.scr, 'Space'); L.eq(h.scr.state.rsel, ['b0']);
      key(h.scr, 'Enter'); L.eq(h.sent, [{ recycle: 'b0' }]);
    }],
    ['"recycle all junk" asks in the page first: nothing is sent until Yes, Cancel and Esc back out', () => {
      const w = Object.values(G.ITEMS).filter(i => i.type === 'weapon' && !i.up && G.recycleFor(i.key, [])).sort((a, b) => a.attack - b.attack);
      const inv = Object.assign(emptyInv(), { weapon: w[w.length - 2].key, backpack: [w[0].key, w[1].key, w[w.length - 1].key, null, null, null, null, null, null] });
      const h = harness({ tab: 'recycle', snap: { inv } }); L.assert(/\(2\)/.test(h.q('#junkBtn').textContent), h.q('#junkBtn').textContent);
      h.q('#junkBtn').click(); L.assert(h.q('.wb-junk.ask') && /junk items?/.test(h.q('.wb-jq').textContent) && /\+\d/.test(h.q('.wb-jq').textContent), 'asks with a total'); L.eq(h.sent, []);
      h.q('.wb-junk .wb-ghost').click(); L.assert(!h.q('.wb-junk.ask') && h.sent.length === 0, 'cancel');
      h.q('#junkBtn').click(); const esc = key(h.scr, 'Escape'); L.assert(esc.r && !h.q('.wb-junk.ask') && h.sent.length === 0, 'Esc cancels the question, not the screen');
      h.q('#junkBtn').click(); h.q('#junkYes').click(); h.T.fire(); L.eq(h.sent.map(m => m.recycle), ['b0', 'b1']);
      const none = harness({ tab: 'recycle', snap: { inv: Object.assign(emptyInv(), { weapon: w[0].key }) } }); none.q('#junkBtn').click(); L.assert(!none.q('.wb-junk.ask') && /No junk/.test(none.said.pop()), 'no junk, no question');
    }],
    ['Refine shows only where the home elixir rules allow it, and sends refine with every selected item', () => {
      const w = Object.values(G.ITEMS).find(i => i.type === 'weapon' && !i.up && G.recycleFor(i.key, [])), inv = Object.assign(emptyInv(), { backpack: [w.key, null, null, null, null, null, null, null, null] });
      const a = harness({ tab: 'recycle', snap: { inv }, refine: true }); a.q('.wb-tile[data-slot="b0"]').click(); L.assert(a.q('#recRefine'), 'refine button'); a.q('#recRefine').click(); L.eq(a.sent, [{ recycle: 'b0', refine: 1 }]);
      const b = harness({ tab: 'recycle', snap: { inv } }); b.q('.wb-tile[data-slot="b0"]').click(); L.assert(!b.q('#recRefine'), 'no refine without elixir rules');
    }],
    ['opening the screen resets selections and picks the wanted tab (recycler E opens the Recycle tab)', () => {
      const h = harness({ tab: 'recycle' }); L.eq(h.scr.tab(), 'recycle'); h.scr.open('craft'); L.eq(h.scr.tab(), 'craft'); h.scr.open('recycle'); L.eq(h.scr.state.rsel, []);
      const only = harness({ tab: 'craft', snap: { hasBench: false } }); L.eq(only.scr.tab(), 'recycle', 'falls back to the station that exists');
    }],
    ['no innerHTML anywhere in the screen (item names are text, never markup)', () => {
      L.assert(!/innerHTML/.test(read('wbui.js').replace(/\/\*[\s\S]*?\*\//g, '')), 'wbui.js builds with textContent only');
      const h = harness({ snap: { know: 25 } }); h.q('.wb-card'); L.assert(h.qa('.wb-iname').every(e => e.children.length === 0), 'names are plain text');
    }],

    // ---------------- wiring and style (static)
    ['game.js feeds the screen: build, open, keys, search guard, recycler tab, station banner', () => {
      const g = read('game.js');
      L.assert(/GKWBUI\.create\(wbCtx\(\)\)/.test(g) && /craftPn\.wb\.key\(e\)/.test(g) && /KNOWUI\.open\('recycle'\)/.test(g) && /KNOWUI\.open\('craft'\)/.test(g), 'wiring');
      L.assert(/function buildRec\(\) \{ if \(!craftPn\) buildCraft\(\); recPn = craftPn; \}/.test(g), 'recycler is a tab');
      L.assert(/banner\(kind\)/.test(g) && /has\(kind\)/.test(g), 'STNUI banner and has');
      L.assert(/shopOpen && e\.target && e\.target\.tagName === 'INPUT'\) return/.test(g), 'typing in the search must not move or toggle the view');
      L.assert(/\/wbui\.js/.test(read('index.html')) && /'wbui'/.test(read('server.js')), 'script is served');
    }],
    ['style: fixed-size screen (no layout jumps), lists scroll inside, 1080p zoom is divided out, compact mode for small windows', () => {
      const c = read('index.html');
      L.assert(/#gkCraft>div\{width:calc\(min\(1280px,96vw\) \/ var\(--wbz,1\)\)!important;height:calc\(min\(94vh,980px\) \/ var\(--wbz,1\)\)/.test(c), 'fixed panel size');
      L.assert(/\.wb-list\{flex:1;min-height:0;overflow-y:auto/.test(c) && /\.wb-prog\{flex:none;[^}]*height:34px/.test(c) && /\.wb-pinned\{flex:none;[^}]*height:42px/.test(c), 'scroll areas and fixed strips');
      L.assert(/@media \(max-height:760px\)\{#gkCraft>div\{padding/.test(c), 'small window mode');
      for (const k of ['normal', 'master', 'homebench', 'recycler', 'homerec', 'grand']) L.assert(new RegExp('data-st=' + k + '\\]|\\.wb\\{--acc').test(c), 'theme ' + k);
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

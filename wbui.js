/* wbui.js - the workbench / recycler screen (WBUI). One screen for every station: a banner that says which station you stand at, four tabs
   (Craft, Perks, Reforge, Recycle), a progress strip and a materials strip that are always there.
   Browser global GKWBUI (also require()-able for tests). Two halves:
     - pure model functions (recipeRows, filterRows, sortRows, perkBranches, recycleList, junkIds, ...): no DOM, no game imports
     - create(ctx): builds the DOM with ctx.doc only (createElement / textContent / classList / addEventListener), so a tiny stub DOM can drive it in tests
   game.js (KNOWUI / STNUI blocks) owns the game state and passes it in through ctx; styles are the WBUI block in index.html.
   ctx = { doc, win?, G(), get() -> snapshot, send(msg), say(text, good), close(), icon(key,px), partIcon(part,px), partName(part), info(key), statTxt(key), tierCol(it),
           partsRow() -> element, station(kind) -> banner info, yieldOf(key) -> parts|null, canRefine(), benchLv(), glyph?(kind,px), setTimeout?, clearTimeout? }
   snapshot = { inv, parts, know, brains, perks, crafting: {rid,key,at,ms}|null, benchType, hasBench, hasRecycler, room } */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKWBUI = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ROM = ['0', 'I', 'II', 'III', 'IV', 'V'];
  const CATS = [{ id: 'weapon', name: 'Weapons' }, { id: 'armor', name: 'Armour' }, { id: 'consumable', name: 'Consumables' }, { id: 'charm', name: 'Charms' }];
  const RSLOTS = ['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'q0', 'q1', 'q2'];
  const TABS = [{ id: 'craft', name: 'Craft', key: '1' }, { id: 'perks', name: 'Perks', key: '2' }, { id: 'reforge', name: 'Reforge', key: '3' }, { id: 'recycle', name: 'Recycle', key: '4' }];
  const BR_COL = { craft: '#ffb84a', lore: '#7fd0ff', guts: '#ff8a7a' };
  const HOLD_MS = 650, BENCH_NAME = { normal: 'Workbench', master: 'Master Forge' };
  const sum = o => { let s = 0; for (const k in o) s += o[k] | 0; return s; };
  const fmt = n => Number.isInteger(+n) ? String(n) : String(+(+n).toFixed(1));
  const catOf = it => !it ? 'consumable' : it.type === 'weapon' || it.type === 'armor' || it.type === 'charm' ? it.type : 'consumable';
  const slotKey = (inv, id) => !inv ? null : id === 'weapon' || id === 'armor' || id === 'charm' ? inv[id] : (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)];

  // ---------------- model ----------------
  function benchNeeded(G, tier) { const B = (G.STATIONS && G.STATIONS.bench) || {}; for (const t of ['normal', 'master']) if (B[t] && B[t].maxTier >= tier) return BENCH_NAME[t]; return BENCH_NAME.master; }
  function compare(key, inv, info) {   // what this item would change against what you wear: { parts: [{label, d, pct?}], vs, equipped } (null for consumables)
    const it = info(key); if (!it) return null;
    if (it.type === 'weapon' || it.type === 'armor') {
      const w = it.type === 'weapon', cur = w ? inv.weapon : inv.armor;
      if (cur === key) return { parts: [], vs: null, equipped: true };
      const ci = cur ? info(cur) : null, parts = [{ label: w ? 'attack' : 'health', d: (w ? it.attack : it.health) - (ci ? (w ? ci.attack : ci.health) : 0) }];
      if (!w) { const ds = Math.round(((it.speed || 1) - ((ci && ci.speed) || 1)) * 100); if (ds) parts.push({ label: 'speed', d: ds, pct: true }); }
      return { parts, vs: ci ? ci.name : 'nothing', equipped: false };
    }
    if (it.type === 'charm') { const cur = inv.charm; if (cur === key) return { parts: [], vs: null, equipped: true }; const ci = cur ? info(cur) : null; return { parts: [], vs: ci ? ci.name : null, replaces: true, equipped: false }; }
    return null;
  }
  const cmpText = c => !c ? '' : c.equipped ? 'equipped' : c.replaces ? (c.vs ? 'replaces ' + c.vs : 'free charm slot')
    : c.parts.map(p => p.d === 0 ? 'same ' + p.label : (p.d > 0 ? '+' : '−') + Math.abs(p.d) + (p.pct ? '%' : '') + ' ' + p.label).join(', ') + ' vs ' + c.vs;
  const isExpensive = cost => sum(cost) >= 16 || (cost.gem | 0) + (cost.crystal | 0) >= 3;   // big recipes need a held press

  function recipeRows(G, st, info) {   // st = { parts, know, perks, benchType, inv, busy, full, partName }
    const top = G.knowTier ? G.knowTier(st.know) : 0, out = [], pn = st.partName || (p => p);
    for (const r of G.RECIPES || []) {
      const it = info(r.out) || { name: r.out, type: 'consumable' }, base = G.recipeCost ? G.recipeCost(r, st.perks) : r.cost;
      const bc = G.benchCraft ? G.benchCraft({ stats: { knowledge: st.know } }, r, st.benchType, st.perks) : { cost: base, ms: 2500 }, cost = bc.cost || base;
      const lacking = {}; let missing = 0;
      for (const p in cost) { const n = cost[p] - ((st.parts && st.parts[p]) | 0); if (n > 0) { lacking[p] = n; missing += n; } }
      let status = 'ready', reason = '';
      if (bc.why === 'knowledge') { status = 'locked'; reason = 'knowledge ' + r.needs + ' needed (you have ' + fmt(st.know) + ')'; }
      else if (bc.why === 'bench') { status = 'bench'; reason = 'bench too basic: ' + benchNeeded(G, r.tier); }
      else if (st.busy) { status = 'busy'; reason = 'already crafting'; }
      else if (missing) { status = 'parts'; reason = 'needs ' + Object.keys(lacking).map(p => lacking[p] + ' more ' + String(pn(p)).toLowerCase()).join(', '); }
      else if (st.full) { status = 'full'; reason = 'backpack full'; }
      const disc = !bc.why && !bc.bonus && sum(base) > sum(cost) ? Math.round((1 - sum(cost) / sum(base)) * 100) : 0;
      out.push({ id: r.id, r, key: r.out, it, cat: catOf(it), tier: r.tier | 0, cost, base, ms: bc.ms || 0, bonus: !!bc.bonus, disc, isNew: (r.tier | 0) > 0 && ((r.tier | 0) === top || !!bc.bonus),
        total: sum(cost), expensive: isExpensive(cost), status, reason, lacking, missing, affordable: !missing, craftable: status === 'ready', cmp: compare(r.out, st.inv || {}, info) });
    }
    return out;
  }
  function filterRows(rows, f) {
    const q = String(f.q || '').trim().toLowerCase();
    return rows.filter(x => (f.cat === 'all' || !f.cat || x.cat === f.cat) && (!f.craftable || x.craftable) && (!f.affordable || x.affordable) && (!f.newTier || x.isNew)
      && (!q || (x.it.name + ' ' + (x.it.family || '') + ' ' + x.cat + ' ' + (x.cat === 'armor' ? 'armour' : '') + ' tier ' + ROM[x.tier]).toLowerCase().includes(q)));
  }
  function sortRows(rows, mode) {
    const nm = (a, b) => a.it.name < b.it.name ? -1 : a.it.name > b.it.name ? 1 : 0;
    const cmp = mode === 'name' ? nm : mode === 'cost' ? (a, b) => a.total - b.total || a.tier - b.tier || nm(a, b) : (a, b) => a.tier - b.tier || nm(a, b);
    return rows.slice().sort(cmp);
  }
  const groupRows = rows => CATS.map(c => ({ cat: c, rows: rows.filter(x => x.cat === c.id) })).filter(g => g.rows.length);
  function closest(rows) {   // the nearest recipe you could craft with a few more parts (for the pinned row when nothing is ready)
    let best = null; for (const x of rows) if (x.status === 'parts' && (!best || x.missing < best.missing)) best = x; return best;
  }

  function perkBranches(G, st, partName) {   // st = { know, brains, perks }
    const pts = G.knowPoints ? G.knowPoints(st.know, st.brains, st.perks) : 0;
    return (G.BRANCHES || []).map(b => ({ id: b.id, name: b.name, color: BR_COL[b.id] || '#ffd75e', nodes: (G.PERKS || []).filter(p => p.branch === b.id).sort((x, y) => x.rank - y.rank).map((pk, i, arr) => {
      const have = st.perks.includes(pk.id), why = have ? 'have' : G.learnFail(pk.id, st.know, st.brains, st.perks);
      const state = have ? 'learned' : !why ? 'available' : 'locked';
      const text = have ? 'learned' : !why ? 'ready to learn' : why === 'order' ? 'learn ' + arr[i - 1].name + ' first' : 'needs ' + pk.cost + ' point' + (pk.cost > 1 ? 's' : '') + ' (you have ' + pts + ')';
      return { pk, state, why: have ? null : why, text, linked: i > 0 && st.perks.includes(arr[i - 1].id) };
    }) }));
  }

  function recycleList(inv, yieldOf, info) {   // every backpack / quick-slot item with its yield; y is null when it cannot be recycled
    return RSLOTS.map(id => { const key = slotKey(inv, id); if (key == null) return { id, key: null, y: null }; const y = yieldOf(key); return { id, key, it: info(key), y: y && Object.keys(y).length ? y : null }; });
  }
  function junkIds(list, inv, info) {   // junk = weapons and armour you carry that are no better than what you wear (reforged twins and anything unrecyclable never count)
    const w = inv.weapon && info(inv.weapon), a = inv.armor && info(inv.armor), out = [];
    for (const e of list) {
      if (!e.key || !e.y || !e.it || e.it.up) continue;
      if (e.it.type === 'weapon' && w && e.it.attack <= w.attack) out.push(e.id);
      else if (e.it.type === 'armor' && a && e.it.health <= a.health) out.push(e.id);
    }
    return out;
  }
  const sumYield = (list, ids) => { const t = {}; for (const e of list) if (e.y && ids.includes(e.id)) for (const p in e.y) t[p] = (t[p] || 0) + e.y[p]; return t; };

  // ---------------- screen ----------------
  function create(ctx) {
    const doc = ctx.doc, win = ctx.win || null, setT = ctx.setTimeout || ((f, t) => setTimeout(f, t)), clrT = ctx.clearTimeout || (t => clearTimeout(t));
    const h = (tag, cls, txt) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const add = (p, ...kids) => { for (const k of kids) if (k) p.appendChild(k); return p; };
    const btn = (cls, txt, fn) => { const b = h('button', cls, txt); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
    const clear = e => { e.textContent = ''; return e; };
    const S = { tab: 'craft', f: { q: '', cat: 'all', craftable: false, affordable: false, newTier: false, sort: 'tier' }, sel: null, psel: null, fsel: null, rsel: [], rcur: null, sent: {}, q: [], qt: 0, confirm: null, hold: null, dirty: false, rows: [], vis: [] };
    let snap = null, G = null;
    const root = h('div', 'wb'); root.dataset.st = 'normal';
    // banner
    const banner = h('div', 'wb-banner'), bGlyph = h('div', 'wb-glyph'), bTxt = h('div', 'wb-btxt'), bName = h('div', 'wb-name'), bBlurb = h('div', 'wb-blurb'), bChips = h('div', 'wb-bchips');
    add(bTxt, bName, bBlurb); add(banner, bGlyph, bTxt, bChips);
    // tabs + know chips
    const tabsRow = h('div', 'wb-tabsrow'), tabs = h('div', 'wb-tabs'), knowBox = h('div', 'wb-know'), tabEls = {};
    tabs.setAttribute('role', 'tablist');
    for (const t of TABS) { const b = btn('wb-tab', null, () => setTab(t.id, true)); b.dataset.tab = t.id; b.setAttribute('role', 'tab'); const k = h('span', 'wb-tk', t.key), n = h('span', 'wb-tn', t.name), c = h('span', 'wb-tc', ''); add(b, k, n, c); b._c = c; tabEls[t.id] = b; tabs.appendChild(b); }
    add(tabsRow, tabs, knowBox);
    // progress strip (always there, never changes height)
    const prog = h('div', 'wb-prog'), pIc = h('div', 'wb-pic'), pTxt = h('div', 'wb-ptxt', 'No craft running'), pTrack = h('div', 'wb-ptrack'), pBar = h('div', 'wb-pbar'), pCancel = btn('wb-cancel', 'Cancel', () => ctx.send({ craftCancel: 1 }));
    pCancel.title = 'Cancel and get your parts back'; add(pTrack, pBar); add(prog, pIc, pTxt, pTrack, pCancel);
    // panes
    const panes = {}, mkPane = id => { const p = h('div', 'wb-pane'); p.dataset.pane = id; panes[id] = p; return p; };
    // -- craft
    const cPane = mkPane('craft'), tool = h('div', 'wb-tool'), r1 = h('div', 'wb-trow'), r2 = h('div', 'wb-trow');
    const search = h('input', 'wb-search'); search.type = 'text'; search.placeholder = 'Search recipes  ( / )'; search.maxLength = 24; search.setAttribute('aria-label', 'Search recipes');
    search.addEventListener('input', () => { S.f.q = search.value; paintCraftBody(); });
    const sortSeg = h('div', 'wb-seg'), catSeg = h('div', 'wb-seg'), togSeg = h('div', 'wb-seg'), count = h('div', 'wb-count');
    const segBtn = (seg, cls, txt, fn, attr) => { const b = btn('wb-sb' + (cls ? ' ' + cls : ''), txt, fn); if (attr) for (const k in attr) b.dataset[k] = attr[k]; seg.appendChild(b); return b; };
    add(sortSeg, h('span', 'wb-sl', 'Sort')); for (const [id, n] of [['tier', 'Tier'], ['name', 'Name'], ['cost', 'Cost']]) segBtn(sortSeg, '', n, () => { S.f.sort = id; paintCraftBody(); }, { sort: id });
    for (const [id, n] of [['all', 'All'], ...CATS.map(c => [c.id, c.name])]) segBtn(catSeg, '', n, () => { S.f.cat = id; paintCraftBody(); }, { cat: id });
    for (const [id, n, tt] of [['craftable', 'Craftable now', 'Only recipes you can start right now'], ['affordable', 'Affordable', 'Only recipes you have the parts for (even if locked)'], ['newTier', 'New tier', 'Only recipes of the newest tier you unlocked']]) { const b = segBtn(togSeg, '', n, () => { S.f[id] = !S.f[id]; paintCraftBody(); }, { tog: id }); b.title = tt; }
    add(r1, search, sortSeg, count); add(r2, catSeg, togSeg); add(tool, r1, r2);
    const pinned = h('div', 'wb-pinned'), pinLab = h('span', 'wb-pinlab', 'Craftable now'), pinRow = h('div', 'wb-pinrow'); add(pinned, pinLab, pinRow);
    const list = h('div', 'wb-list'); list.tabIndex = -1;
    add(cPane, tool, pinned, list);
    // -- perks
    const pPane = mkPane('perks'), pHead = h('div', 'wb-phead'), tree = h('div', 'wb-tree'); add(pPane, pHead, tree);
    // -- reforge
    const fPane = mkPane('reforge'), fList = h('div', 'wb-list'); add(fPane, fList);
    // -- recycle
    const rPane = mkPane('recycle'), rLeft = h('div', 'wb-rleft'), rRight = h('div', 'wb-rright'), rHead = h('div', 'wb-rhead'), rGrid = h('div', 'wb-rgrid'), rPrevList = h('div', 'wb-rlist'), rTotal = h('div', 'wb-rtotal'), rActs = h('div', 'wb-racts'), rJunk = h('div', 'wb-junk');
    add(rLeft, rHead, rGrid); add(rRight, h('div', 'wb-lab', 'You get'), rPrevList, rTotal, rActs, rJunk); add(rPane, rLeft, rRight);
    const body = h('div', 'wb-panes'); add(body, cPane, pPane, fPane, rPane);
    // materials strip
    const mats = h('div', 'wb-mats'), matLab = h('span', 'wb-matlab', 'Materials'), partsRow = ctx.partsRow ? ctx.partsRow() : h('div'), hint = h('div', 'wb-hint');
    const HINTS = { craft: '/ search · arrows move · Enter craft (hold for big ones) · Tab section · E close', perks: 'arrows move · Enter learn · Tab section · E close', reforge: 'arrows move · Enter reforge · Tab section · E close', recycle: 'arrows move · Space select · A all · J junk · Enter recycle · Tab section · E close' };
    add(mats, matLab, partsRow, hint);
    add(root, banner, tabsRow, prog, body, mats);

    // ---- helpers
    const info = k => ctx.info(k);
    const say = (t, good) => ctx.say(t, good);
    const chip = (cls, txt, title) => { const c = h('span', 'wb-chip ' + cls, txt); if (title) c.title = title; return c; };
    function costChips(cost, base) {
      const w = h('div', 'wb-cost');
      for (const p in cost) { const have = (snap.parts[p] | 0), ok = have >= cost[p], c = h('span', 'wb-pc ' + (ok ? 'ok' : 'bad')); c.dataset.part = p; c.title = ctx.partName(p) + ': you have ' + have + ', need ' + cost[p] + (base && base[p] > cost[p] ? ' (cheaper: ' + base[p] + ' -> ' + cost[p] + ')' : '');
        add(c, ctx.partIcon(p, 18), h('span', 'wb-pn', have + '/' + cost[p])); w.appendChild(c); }
      return w;
    }
    function setDeltas(d, sign) {   // the +n / -n next to the material chips
      for (const c of partsRow.children) { let s = c._d; if (!s) { s = c._d = h('span', 'd'); c.appendChild(s); } const v = d && d[c.dataset.part] | 0; s.textContent = v ? (sign > 0 ? '+' : '−') + v : ''; s.className = 'd' + (v ? (sign > 0 ? ' up' : ' down') : ''); }
    }
    function scrollTo(el) { if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }

    // ---- banner / tabs / know / progress
    function paintBanner() {
      const kind = S.tab === 'recycle' ? 'recycler' : 'bench', b = ctx.station(kind);
      root.dataset.st = b.key; bName.textContent = b.name; bBlurb.textContent = b.blurb; clear(bGlyph);
      const gl = ctx.glyph && ctx.glyph(kind === 'bench' ? (b.key === 'master' ? 'forge' : 'bench') : 'recycler', 34); if (gl) bGlyph.appendChild(gl); else bGlyph.textContent = b.name[0];
      clear(bChips); for (const c of b.chips) bChips.appendChild(chip(c.cls || '', c.text, c.title));
      const lv = kind === 'bench' && ctx.benchLv ? ctx.benchLv() : 0; if (lv) bChips.appendChild(chip('home', 'Home bench ' + ROM[Math.min(5, lv + 1)], 'Your Elixir Screen workbench upgrade'));
    }
    function tabOn(id) { return id === 'recycle' ? snap.hasRecycler : snap.hasBench; }
    function paintTabs() {
      const rows = S.rows; const list2 = recycleList(snap.inv, ctx.yieldOf, info);
      const badge = { craft: S.rowsAll ? S.rowsAll.filter(x => x.craftable).length : 0, perks: pts(), reforge: reforgeIds().length, recycle: list2.filter(e => e.y).length };
      for (const t of TABS) { const b = tabEls[t.id], on = tabOn(t.id); b.classList.toggle('on', S.tab === t.id); b.classList.toggle('off', !on); b.setAttribute('aria-selected', S.tab === t.id ? 'true' : 'false'); b.setAttribute('aria-disabled', on ? 'false' : 'true');
        b.title = on ? '' : t.id === 'recycle' ? 'There is no recycler in this room' : 'There is no workbench in this room'; b._c.textContent = on && badge[t.id] ? String(badge[t.id]) : ''; b._c.classList.toggle('pt', t.id === 'perks'); }
      void rows;
    }
    const pts = () => G.knowPoints ? G.knowPoints(snap.know, snap.brains, snap.perks) : 0;
    function paintKnow() {
      clear(knowBox); const tier = G.knowTier ? G.knowTier(snap.know) : 0, p = pts();
      for (const [l, v, c] of [['Knowledge', fmt(snap.know), 'k'], ['Recipe tier', ROM[tier], 't'], ['Points', String(p), p ? 'p on' : 'p']]) { const e = h('span', 'wb-ks ' + c); add(e, h('span', 'wb-kl', l), h('span', 'wb-kv', v)); knowBox.appendChild(e); }
      knowBox.title = '1 point per ' + ((G.KNOW && G.KNOW.step) || 20) + ' knowledge and 1 per brain you eat. Perks last until you die.';
    }
    function paintProg() {
      const c = snap.crafting; prog.classList.toggle('on', !!c); clear(pIc);
      if (c) { if (c.key) pIc.appendChild(ctx.icon(c.key, 26)); pTxt.textContent = 'Crafting ' + (info(c.key) ? info(c.key).name : '') + '...'; } else { pBar.style.width = '0%'; pTxt.textContent = 'No craft running'; }
      pCancel.disabled = !c; ctx.bar = pBar;
    }

    // ---- craft pane
    function rowsNow() { const sn = snap; return recipeRows(G, { parts: sn.parts, know: sn.know, perks: sn.perks, benchType: sn.benchType, inv: sn.inv, busy: !!sn.crafting, full: sn.inv.backpack.indexOf(null) < 0, partName: ctx.partName }, info); }
    function go(x) { if (!x.craftable) { say(x.reason || 'Cannot craft that'); return false; } ctx.send({ craft: x.id }); return true; }
    function holdStart(x, fill) {
      if (S.hold || !x.craftable) return;
      fill.style.transition = 'width ' + HOLD_MS + 'ms linear'; fill.style.width = '100%';
      S.hold = { id: x.id, fill, timer: setT(() => { const hd = S.hold; S.hold = null; if (hd) { hd.fill.style.width = '0%'; go(x); } if (S.dirty) { S.dirty = false; paint(); } }, HOLD_MS) };
    }
    function holdCancel(quiet) {
      const hd = S.hold; if (!hd) return; clrT(hd.timer); hd.fill.style.transition = 'none'; hd.fill.style.width = '0%'; S.hold = null;
      if (!quiet) say('Keep holding to craft it');
      if (S.dirty) { S.dirty = false; paint(); }
    }
    function card(x, mode) {   // mode 'craft' | 'reforge'
      const c = h('div', 'wb-card'), main = h('div', 'wb-main'), top = h('div', 'wb-top'), it = x.it;
      c.dataset.status = x.status; if (mode === 'craft') c.dataset.recipe = x.id; else c.dataset.reforge = x.slot;
      const ic = h('div', 'wb-ic'); ic.appendChild(ctx.icon(x.key, 38));
      const nm = h('span', 'wb-iname', it.name); nm.style.color = ctx.tierCol(it) || ''; top.appendChild(nm);
      if (mode === 'craft') { top.appendChild(chip('tier', 'Tier ' + ROM[x.tier])); if (x.isNew) top.appendChild(chip('new', 'New', 'The newest tier you unlocked')); if (x.bonus) top.appendChild(chip('bonus', 'Bonus tier', 'One tier above your knowledge, at full price')); if (x.disc) top.appendChild(chip('disc', 'Forge −' + x.disc + '%', 'Parts are ' + x.disc + '% cheaper at this bench')); }
      else if (x.equipped) top.appendChild(chip('eq', 'Equipped'));
      const stat = h('div', 'wb-stat'); stat.appendChild(h('span', 'wb-st', mode === 'craft' ? String(ctx.statTxt(x.key) || '').replace(/^Tier \d+( · )?/, '') : x.statLine));   // the chip shows the recipe tier; the item's own tier is its name colour
      if (mode === 'craft' && x.cmp) { if (x.cmp.equipped) stat.appendChild(h('span', 'wb-cmp eq', 'equipped')); else if (x.cmp.replaces) stat.appendChild(h('span', 'wb-cmp', cmpText(x.cmp))); else for (const p of x.cmp.parts) stat.appendChild(h('span', 'wb-cmp ' + (p.d > 0 ? 'up' : p.d < 0 ? 'down' : ''), (p.d === 0 ? 'same ' + p.label : (p.d > 0 ? '+' : '−') + Math.abs(p.d) + (p.pct ? '%' : '') + ' ' + p.label))); if (x.cmp.parts.length && x.cmp.vs) stat.appendChild(h('span', 'wb-vs', 'vs ' + x.cmp.vs)); }
      const why = h('div', 'wb-why' + (x.craftable ? ' ok' : ''), x.craftable ? (x.ms ? (x.ms / 1000).toFixed(1) + ' s to craft' : 'ready') : x.reason);
      add(main, top, stat, costChips(x.cost, x.base), why);
      const act = h('div', 'wb-act'), exp = mode === 'craft' && x.expensive && x.craftable;
      const label = mode === 'reforge' ? (x.craftable ? 'Reforge' : 'Need parts') : x.status === 'locked' ? 'Locked' : x.status === 'bench' ? 'Forge only' : x.status === 'ready' ? (exp ? 'Hold to craft' : 'Craft') : x.status === 'parts' ? 'Need parts' : x.status === 'busy' ? 'Busy' : 'Full';
      const b = btn('wb-go' + (x.craftable ? '' : ' off') + (exp ? ' hold' : ''), null, null); b.dataset.go = '1'; const fill = h('span', 'wb-fill'); add(b, fill, h('span', 'wb-gl', label));
      if (exp) {
        b.addEventListener('pointerdown', ev => { if (ev && ev.button) return; holdStart(x, fill); }); for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, () => holdCancel());
      }
      b.addEventListener('click', ev => { if (!x.craftable) say(x.reason); else if (!exp) { if (mode === 'craft') go(x); else ctx.send({ reforge: x.slot }); } else if (ev && ev.detail === 0) say('Hold Enter to craft this one'); });
      add(act, b); if (mode === 'craft') { x._fill = fill; }
      add(c, ic, main, act);
      c.addEventListener('click', ev => { if (mode === 'craft' && ev.target !== b) setSel(x.id); });
      x._el = c; return c;
    }
    function paintPinned() {
      clear(pinRow); const ready = S.rowsAll.filter(x => x.craftable).sort((a, b) => b.tier - a.tier || (a.it.name < b.it.name ? -1 : 1));
      pinned.classList.toggle('empty', !ready.length);
      if (!ready.length) { const near = closest(S.rowsAll); pinRow.appendChild(h('span', 'wb-pinnone', near ? 'Nothing yet. Closest: ' + near.it.name + ' (' + near.reason + ')' : 'Nothing you can craft right now.')); return; }
      for (const x of ready) { const b = btn('wb-pin', null, () => { S.f = Object.assign(S.f, { q: '', cat: 'all', craftable: false, affordable: false, newTier: false }); search.value = ''; setSel(x.id, true); }); b.title = x.it.name + ' - click to jump to it'; b.dataset.pin = x.id; add(b, ctx.icon(x.key, 24), h('span', 'wb-pinn', x.it.name)); pinRow.appendChild(b); }
    }
    function paintCraftBody() {
      if (S.tab !== 'craft') return;
      const f = S.f, top = list.scrollTop; S.rowsAll = S.rowsAll || rowsNow();
      for (const b of sortSeg.children) if (b.dataset && b.dataset.sort) b.classList.toggle('on', f.sort === b.dataset.sort);
      for (const b of catSeg.children) b.classList.toggle('on', f.cat === b.dataset.cat);
      for (const b of togSeg.children) b.classList.toggle('on', !!f[b.dataset.tog]);
      const vis = sortRows(filterRows(S.rowsAll, f), f.sort); S.vis = vis; clear(list);
      count.textContent = vis.length === S.rowsAll.length ? S.rowsAll.length + ' recipes' : vis.length + ' of ' + S.rowsAll.length;
      if (!vis.length) {
        const e = h('div', 'wb-empty'); add(e, h('div', null, S.rowsAll.length ? 'No recipe matches these filters.' : 'No recipes known.'), btn('wb-link', 'Clear filters', () => { S.f = { q: '', cat: 'all', craftable: false, affordable: false, newTier: false, sort: f.sort }; search.value = ''; paintCraftBody(); })); list.appendChild(e);
      }
      for (const g of groupRows(vis)) {
        const sec = h('div', 'wb-sec'); add(sec, h('span', null, g.cat.name), h('span', 'wb-secn', String(g.rows.length))); list.appendChild(sec);
        const grid = h('div', 'wb-grid'); for (const x of g.rows) grid.appendChild(card(x, 'craft')); list.appendChild(grid);
      }
      if (!vis.some(x => x.id === S.sel)) S.sel = vis.length ? vis[0].id : null;
      markSel(false); list.scrollTop = top;
    }
    function markSel(scroll) {
      for (const x of S.vis) if (x._el) x._el.classList.toggle('on', x.id === S.sel);
      const cur = S.vis.find(x => x.id === S.sel); if (scroll && cur) scrollTo(cur._el);
      if (S.tab === 'craft') setDeltas(cur && cur.craftable !== undefined ? cur.cost : null, -1);
    }
    function setSel(id, scroll) { S.sel = id; markSel(scroll !== false); }
    function paintCraft() { S.rowsAll = rowsNow(); paintPinned(); paintCraftBody(); }

    // ---- perks pane
    function learn(pk, why) { if (why) say(why === 'order' ? 'Learn the perk above it first' : why === 'points' ? 'Not enough knowledge points' : why === 'have' ? 'You know that already' : 'Cannot learn that'); else ctx.send({ learn: pk.id }); }
    function paintPerks() {
      const br = perkBranches(G, { know: snap.know, brains: snap.brains, perks: snap.perks }, ctx.partName), p = pts(), tier = G.knowTier ? G.knowTier(snap.know) : 0;
      clear(pHead); add(pHead, h('div', 'wb-ptitle', 'Knowledge tree'), h('div', 'wb-pnote', 'Knowledge ' + fmt(snap.know) + ' unlocks recipe tier ' + ROM[tier] + '. Spend points on perks: ' + p + ' to spend.'));
      const leg = h('div', 'wb-legend'); add(leg, chip('learned', 'Learned'), chip('available', 'Ready to learn'), chip('locked', 'Locked')); pHead.appendChild(leg);
      clear(tree); const all = [];
      for (const b of br) {
        const col = h('div', 'wb-branch'); col.style.setProperty('--bc', b.color); add(col, h('div', 'wb-bname', b.name));
        b.nodes.forEach((n, i) => {
          if (i) col.appendChild(h('div', 'wb-link' + (n.linked ? ' on' : ''))); else col.appendChild(h('div', 'wb-stem'));
          const el = h('div', 'wb-node'); el.dataset.perk = n.pk.id; el.dataset.state = n.state; el.title = n.pk.desc; el.tabIndex = -1;
          const head = h('div', 'wb-nh'); add(head, h('b', 'wb-nn', n.pk.name), h('span', 'wb-cost-pt' + (n.state === 'learned' ? ' done' : p >= n.pk.cost ? ' ok' : ' bad'), n.pk.cost + ' PT'));
          add(el, head, h('div', 'wb-nd', n.pk.desc), h('div', 'wb-ns', n.state === 'learned' ? 'Learned' : n.state === 'available' ? 'Click or Enter to learn' : n.text));
          el.addEventListener('click', () => { S.psel = n.pk.id; markPerk(); learn(n.pk, n.why); });
          col.appendChild(el); all.push({ id: n.pk.id, br: b.id, rank: n.pk.rank, el, n });
        });
        tree.appendChild(col);
      }
      S.pnodes = all; if (!all.some(x => x.id === S.psel)) S.psel = (all.find(x => x.n.state === 'available') || all[0] || {}).id || null; markPerk(); setDeltas(null, -1);
    }
    function markPerk() { for (const x of S.pnodes || []) x.el.classList.toggle('on', x.id === S.psel); }

    // ---- reforge pane
    const reforgeIds = () => (G && G.reforgeCost && snap && snap.perks.includes('reforge')) ? ['weapon', 'armor', 'b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'q0', 'q1', 'q2'].filter(id => { const k = slotKey(snap.inv, id); return k && G.reforgeCost(k); }) : [];
    function paintReforge() {
      clear(fList); const has = snap.perks.includes('reforge'), ids = reforgeIds();
      if (!has) {
        const e = h('div', 'wb-empty'); add(e, h('div', null, 'Reforge is a Craft perk (3 points): it gives a weapon or armour +20% attack or health, once per item.'), btn('wb-link', 'Open the Perks tab', () => setTab('perks', true))); fList.appendChild(e); S.frows = []; setDeltas(null, -1); return;
      }
      if (!ids.length) { fList.appendChild(h('div', 'wb-empty', 'No gear to reforge. Every weapon and armour you carry or wear is reforged already.')); S.frows = []; setDeltas(null, -1); return; }
      const grid = h('div', 'wb-grid'); S.frows = [];
      for (const id of ids) {
        const k = slotKey(snap.inv, id), cost = G.reforgeCost(k), a = info(k), b = info(k + '+'), s = a.type === 'weapon' ? 'attack' : 'health', lacking = Object.keys(cost).filter(p => (snap.parts[p] | 0) < cost[p]);
        const x = { id, slot: id, key: k, it: a, cost, base: null, status: lacking.length ? 'parts' : 'ready', craftable: !lacking.length, equipped: id === 'weapon' || id === 'armor', ms: 0, total: sum(cost),
          reason: lacking.length ? 'needs ' + lacking.map(p => (cost[p] - (snap.parts[p] | 0)) + ' more ' + ctx.partName(p).toLowerCase()).join(', ') : '', statLine: (s === 'attack' ? 'Attack ' : 'Health ') + a[s] + ' → ' + b[s] + ' (+' + (b[s] - a[s]) + ')' };
        x.expensive = false; grid.appendChild(card(x, 'reforge')); S.frows.push(x); x._el.dataset.reforge = id;
        x._el.addEventListener('click', ev => { if (!ev.target.dataset || !ev.target.dataset.go) { S.fsel = id; markRf(); } });
      }
      fList.appendChild(grid); if (!S.frows.some(x => x.id === S.fsel)) S.fsel = S.frows[0].id; markRf();
    }
    function markRf() { const cur = (S.frows || []).find(x => x.id === S.fsel); for (const x of S.frows || []) x._el.classList.toggle('on', x.id === S.fsel); setDeltas(cur ? cur.cost : null, -1); }

    // ---- recycle pane
    function paintRecycle() {
      const ls = recycleList(snap.inv, ctx.yieldOf, info), byId = {}; for (const e of ls) byId[e.id] = e;
      for (const id in S.sent) if (byId[id].key !== S.sent[id]) delete S.sent[id];
      S.rsel = S.rsel.filter(id => byId[id].y && !S.sent[id]); if (S.confirm) S.confirm = S.confirm.filter(id => byId[id].y && !S.sent[id]);
      if (!S.rcur || !byId[S.rcur]) S.rcur = (ls.find(e => e.y) || ls[0]).id;
      const eff = ctx.station('recycler').eff;
      clear(rHead); add(rHead, h('div', 'wb-lab', 'Backpack and quick slots'), h('div', 'wb-rhn', 'Returns ' + Math.round((eff == null ? 1 : eff) * 100) + '% of the parts'));
      const tools = h('div', 'wb-rtools'); add(tools, btn('wb-sb', 'Select all', () => { S.rsel = ls.filter(e => e.y && !S.sent[e.id]).map(e => e.id); paintRecycle(); }), btn('wb-sb', 'Clear', () => { S.rsel = []; S.confirm = null; paintRecycle(); })); rHead.appendChild(tools);
      clear(rGrid);
      for (const e of ls) {
        const t = h('div', 'wb-tile'); t.dataset.slot = e.id; t.dataset.state = !e.key ? 'empty' : S.sent[e.id] ? 'sent' : e.y ? 'ok' : 'no';
        if (e.key) { add(t, ctx.icon(e.key, 38), h('span', 'wb-tname', e.it ? e.it.name : e.key)); if (e.it && e.it.tierN != null) { const tc = h('span', 'wb-ttier', 'T' + e.it.tierN); tc.style.background = ctx.tierCol(e.it) || ''; t.appendChild(tc); } if (e.y) { const ck = h('span', 'wb-chk', S.rsel.includes(e.id) ? '✓' : ''); t.appendChild(ck); } t.title = e.y ? e.it.name + ': ' + partsText(e.y) : (e.it ? e.it.name : '') + ' cannot be recycled'; }
        else t.title = 'empty slot';
        t.classList.toggle('on', S.rsel.includes(e.id)); t.classList.toggle('cur', S.rcur === e.id);
        t.addEventListener('click', () => { S.rcur = e.id; if (!e.key) { paintRecycle(); return; } if (S.sent[e.id]) return; if (!e.y) { say('Weapons, armour and utility items can be recycled'); paintRecycle(); return; } toggle(e.id); });
        rGrid.appendChild(t);
      }
      const sel = S.rsel.slice().sort((a, b) => RSLOTS.indexOf(a) - RSLOTS.indexOf(b)); clear(rPrevList);
      if (!sel.length) rPrevList.appendChild(h('div', 'wb-rempty', 'Click items to select them. A selects everything, J picks the junk.'));
      for (const id of sel) { const e = byId[id], r = h('div', 'wb-rrow'); r.dataset.slot = id; add(r, ctx.icon(e.key, 26), h('span', 'wb-rn', e.it.name), yieldChips(e.y, true)); rPrevList.appendChild(r); }
      const total = sumYield(ls, sel); clear(rTotal); S.total = total; rTotal.dataset.n = String(sel.length);
      add(rTotal, h('span', 'wb-tl', sel.length ? 'Total' : 'Total'), yieldChips(total, false)); if (!sel.length) rTotal.appendChild(h('span', 'wb-tz', 'nothing selected'));
      clear(rActs);
      const go2 = btn('wb-primary' + (sel.length ? '' : ' off'), sel.length ? 'Recycle ' + sel.length + (sel.length > 1 ? ' items' : ' item') : 'Select items', () => { if (!sel.length) { say('Select the items to recycle first'); return; } sendRecycle(sel, null); }); go2.id = 'recGo'; rActs.appendChild(go2);
      if (ctx.canRefine && ctx.canRefine() && sel.length) { const rf = btn('wb-refine', 'Refine: 100% for 4 elixir each', () => sendRecycle(sel, { refine: 1 })); rf.id = 'recRefine'; rActs.appendChild(rf); }
      const junk = junkIds(ls, snap.inv, info).filter(id => !S.sent[id]); S.junk = junk; clear(rJunk);
      if (S.confirm && S.confirm.length) {
        const tot = sumYield(ls, S.confirm), names = S.confirm.map(id => byId[id].it.name);
        add(rJunk, h('div', 'wb-jq', 'Recycle ' + S.confirm.length + ' junk item' + (S.confirm.length > 1 ? 's' : '') + ' (' + names.slice(0, 4).join(', ') + (names.length > 4 ? ', ...' : '') + ') for ' + partsText(tot) + '?'));
        const yes = btn('wb-primary', 'Yes, recycle', () => { const ids = S.confirm.slice(); S.confirm = null; sendRecycle(ids, null); }); yes.id = 'junkYes'; add(rJunk, yes, btn('wb-ghost', 'Cancel', () => { S.confirm = null; paintRecycle(); }));
        rJunk.classList.add('ask');
      } else {
        rJunk.classList.remove('ask');
        const jb = btn('wb-ghost' + (junk.length ? '' : ' off'), 'Recycle all junk (' + junk.length + ')', () => { if (!junk.length) { say('No junk: gear no better than what you wear'); return; } S.confirm = junk.slice(); paintRecycle(); }); jb.id = 'junkBtn';
        add(rJunk, jb, h('div', 'wb-jn', junk.length ? 'Junk: ' + junk.map(id => byId[id].it.name).slice(0, 4).join(', ') + (junk.length > 4 ? ', ...' : '') : 'Junk is gear no better than what you wear.'));
      }
      setDeltas(total, 1);
    }
    const partsText = y => Object.keys(y).map(p => '+' + y[p] + ' ' + ctx.partName(p)).join(', ') || 'nothing';
    function yieldChips(y, small) { const w = h('span', 'wb-yc' + (small ? ' s' : '')); for (const p in y) { const c = h('span', 'wb-y'); c.dataset.part = p; add(c, ctx.partIcon(p, small ? 16 : 22), h('span', null, '+' + y[p] + (small ? '' : ' ' + ctx.partName(p)))); c.title = ctx.partName(p); w.appendChild(c); } return w; }
    function toggle(id) { const i = S.rsel.indexOf(id); if (i >= 0) S.rsel.splice(i, 1); else S.rsel.push(id); S.confirm = null; paintRecycle(); }
    function sendRecycle(ids, extra) {
      const key = {}; for (const id of ids) { key[id] = slotKey(snap.inv, id); S.sent[id] = key[id]; }
      S.rsel = S.rsel.filter(id => !ids.includes(id)); S.confirm = null;
      for (const id of ids) S.q.push(Object.assign({ recycle: id }, extra || null));
      pump(); setT(() => { for (const id of ids) delete S.sent[id]; if (S.tab === 'recycle' && snap) paint(); }, 3000); paint();
    }
    function pump() { if (S.qt || !S.q.length) return; ctx.send(S.q.shift()); S.qt = setT(() => { S.qt = 0; pump(); }, 90); }

    // ---- tab switching / paint
    function setTab(id, user) {
      if (!tabOn(id)) { if (user) say(id === 'recycle' ? 'There is no recycler in this room' : 'There is no workbench in this room'); return false; }
      holdCancel(true); S.tab = id; S.confirm = null; S.rowsAll = null; for (const k in panes) panes[k].classList.toggle('on', k === id);
      paint(); return true;
    }
    function paint() {
      if (S.hold) { S.dirty = true; return; }
      snap = ctx.get(); G = ctx.G(); if (!tabOn(S.tab)) { const alt = ['craft', 'perks', 'reforge', 'recycle'].find(tabOn); if (alt) { S.tab = alt; } }
      for (const k in panes) panes[k].classList.toggle('on', k === S.tab);
      S.rowsAll = rowsNow();
      hint.textContent = HINTS[S.tab];
      paintBanner(); paintTabs(); paintKnow(); paintProg();
      if (S.tab === 'craft') { paintPinned(); paintCraftBody(); } else if (S.tab === 'perks') paintPerks(); else if (S.tab === 'reforge') paintReforge(); else paintRecycle();
    }
    function open(tab) {   // when the screen opens: reset transient state, pick the tab
      S.sent = {}; S.q = []; S.confirm = null; S.rsel = []; S.rcur = null; holdCancel(true);
      snap = ctx.get(); G = ctx.G(); const want = tab || 'craft'; S.tab = tabOn(want) ? want : ['craft', 'recycle', 'perks'].find(tabOn) || 'craft'; S.rowsAll = null; paint();
      if (list) list.scrollTop = 0;
    }

    // ---- keyboard (returns true when the key belongs to this screen, so the global E / Esc / Tab handler leaves it alone)
    const inField = e => !!(e && e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || ''));
    const stop = e => { if (e && e.preventDefault) e.preventDefault(); return true; };
    function moveCard(dir) {
      const vis = S.vis.filter(x => x._el); if (!vis.length) return; let i = vis.findIndex(x => x.id === S.sel); if (i < 0) i = 0;
      const rect = x => (x._el.getBoundingClientRect ? x._el.getBoundingClientRect() : { top: 0, left: 0, height: 0, width: 0 }), cur = rect(vis[i]);
      let n = i;
      if (dir === 'ArrowRight') n = Math.min(vis.length - 1, i + 1); else if (dir === 'ArrowLeft') n = Math.max(0, i - 1);
      else if (!cur.height) n = dir === 'ArrowDown' ? Math.min(vis.length - 1, i + 1) : Math.max(0, i - 1);
      else { let best = -1, bd = 1e9; vis.forEach((x, j) => { const r = rect(x), dy = r.top - cur.top; if (dir === 'ArrowDown' ? dy > 8 : dy < -8) { const d = Math.abs(dy) * 3 + Math.abs(r.left - cur.left); if (d < bd) { bd = d; best = j; } } }); if (best >= 0) n = best; }
      setSel(vis[n].id, true);
    }
    function key(e) {
      if (!e) return false; const code = e.code, field = inField(e);
      if (code === 'Escape') { if (field) { if (e.target.blur) e.target.blur(); return stop(e); } if (S.confirm) { S.confirm = null; paint(); return stop(e); } return false; }
      if (code === 'Tab') { const order = TABS.map(t => t.id).filter(tabOn); if (field && e.target.blur) e.target.blur(); const i = order.indexOf(S.tab), n = order[(i + (e.shiftKey ? order.length - 1 : 1)) % order.length]; if (n) setTab(n, false); return stop(e); }
      if (field) { if (code === 'Enter') { if (e.target.blur) e.target.blur(); return stop(e); } return true; }   // typing: E, digits, etc. belong to the search box
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      if (code === 'KeyE') return false;
      if (code === 'Slash' || e.key === '/') { if (setTab('craft', true)) { search.focus && search.focus(); } return stop(e); }
      if (/^Digit[1-4]$/.test(code)) { const t = TABS[+code[5] - 1]; setTab(t.id, true); return stop(e); }
      const arrow = /^Arrow(Up|Down|Left|Right)$/.test(code);
      if (S.tab === 'craft') {
        if (arrow) { moveCard(code); return stop(e); }
        if (code === 'Enter' || code === 'Space') { if (e.repeat) return stop(e); const x = S.vis.find(y => y.id === S.sel); if (!x) return stop(e); if (x.expensive && x.craftable) holdStart(x, x._fill); else go(x); return stop(e); }
      } else if (S.tab === 'perks') {
        const nodes = S.pnodes || [], cur = nodes.find(x => x.id === S.psel) || nodes[0];
        if (arrow && cur) { const brs = [...new Set(nodes.map(x => x.br))], bi = brs.indexOf(cur.br); let n = cur;
          if (code === 'ArrowLeft' || code === 'ArrowRight') { const nb = brs[(bi + (code === 'ArrowRight' ? 1 : brs.length - 1)) % brs.length]; n = nodes.find(x => x.br === nb && x.rank === cur.rank) || nodes.find(x => x.br === nb); }
          else n = nodes.find(x => x.br === cur.br && x.rank === cur.rank + (code === 'ArrowDown' ? 1 : -1)) || cur;
          S.psel = n.id; markPerk(); scrollTo(n.el); return stop(e); }
        if ((code === 'Enter' || code === 'Space') && cur) { if (!e.repeat) learn(cur.n.pk, cur.n.why); return stop(e); }
      } else if (S.tab === 'reforge') {
        const rows = S.frows || [], i = rows.findIndex(x => x.id === S.fsel);
        if (arrow && rows.length) { S.fsel = rows[Math.max(0, Math.min(rows.length - 1, i + (code === 'ArrowDown' || code === 'ArrowRight' ? 1 : -1)))].id; markRf(); const c = rows.find(x => x.id === S.fsel); scrollTo(c._el); return stop(e); }
        if ((code === 'Enter' || code === 'Space') && rows[i]) { if (!e.repeat) { const x = rows[i]; if (x.craftable) ctx.send({ reforge: x.slot }); else say(x.reason); } return stop(e); }
      } else if (S.tab === 'recycle') {
        const ids = RSLOTS; let i = ids.indexOf(S.rcur); if (i < 0) i = 0;
        if (arrow) { const cols = 4, d = code === 'ArrowLeft' ? -1 : code === 'ArrowRight' ? 1 : code === 'ArrowUp' ? -cols : cols, n = i + d; if (n >= 0 && n < ids.length) { S.rcur = ids[n]; paintRecycle(); } return stop(e); }
        if (code === 'Space') { const k = slotKey(snap.inv, S.rcur); if (k != null && !S.sent[S.rcur]) { if (ctx.yieldOf(k)) toggle(S.rcur); else say('Weapons, armour and utility items can be recycled'); } return stop(e); }
        if (code === 'Enter') { if (e.repeat) return stop(e); if (S.confirm && S.confirm.length) { const q2 = S.confirm.slice(); S.confirm = null; sendRecycle(q2, null); } else if (S.rsel.length) sendRecycle(S.rsel.slice(), null); else say('Select the items to recycle first'); return stop(e); }
        if (code === 'KeyA') { const ls = recycleList(snap.inv, ctx.yieldOf, info); S.rsel = ls.filter(x => x.y && !S.sent[x.id]).map(x => x.id); paintRecycle(); return stop(e); }
        if (code === 'KeyJ') { if (S.junk && S.junk.length) { S.confirm = S.junk.slice(); paintRecycle(); } else say('No junk: gear no better than what you wear'); return stop(e); }
        if (code === 'KeyX' || code === 'Delete') { S.rsel = []; S.confirm = null; paintRecycle(); return stop(e); }
      }
      return false;
    }
    function keyup(e) { if (e && (e.code === 'Enter' || e.code === 'Space') && S.hold) holdCancel(); }
    if (win && win.addEventListener) win.addEventListener('keyup', keyup);
    for (const k in panes) panes[k].classList.toggle('on', k === 'craft');

    return { el: root, list, tree, bar: pBar, previewEl: rRight, paint, open, key, keyup, setTab, state: S, tab: () => S.tab, rows: () => S.rowsAll || [], flush: pump, search };
  }

  return { ROM, CATS, RSLOTS, TABS, HOLD_MS, compare, cmpText, isExpensive, benchNeeded, recipeRows, filterRows, sortRows, groupRows, closest, perkBranches, recycleList, junkIds, sumYield, slotKey, create };
});

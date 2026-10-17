// KEEP (client): the "Choose what to keep" step on the victory card, the start-loadout picker (Characters > Play), the per-character stash on the Inventory screen,
// and the glue for the server's {keep} / {keepOffer} messages. Rules: keep.js (GKKEEP). Storage: save.js KEEP block. The server decides and signs everything (keepsrv.js);
// this file only shows the same numbers and sends the choices to POST /keep. Report: docs/reports/keep-on-win.md.
(function () {
  'use strict';
  const K = window.GKKEEP; if (!K) return;
  const KK = K.K, SAVE = () => window.GKSAVE;
  const TCOL = { common: '#b9b4a4', uncommon: '#6fdc6a', rare: '#5aa8ff', mythic: '#c06bff', legendary: '#ffb02e', transcendent: '#8ff6ff' };
  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];
  const WHY = { tier: 'Transcendent: too wild to bank. Kept as a trophy.', bound: 'Belongs to this match', kind: 'Only a consumable of tier II or lower', unknown: 'Cannot be kept' };
  const WHY_OFFER = { idle: 'An idle win keeps only the victory.', short: 'Won in under a minute: only the victory counts.', rate: 'Another win just now: keepsakes once every 90 seconds.' };
  const HOW = { last: 'Last goblin standing', crown: 'Crowned Goblin King: one extra keepsake', time: 'Decided by the time limit: one keepsake fewer', second: 'You survived to the end: one small keepsake' };
  const TYPE = { weapon: 'Weapon', armor: 'Armour', charm: 'Charm', consumable: 'Consumable' };
  const info = k => K.infoOf(k), nameOf = k => { const i = info(k); return i ? i.name : String(k); };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const bump = (k, n) => { try { window.GKSTATSUI && GKSTATSUI.bump && GKSTATSUI.bump(k, n); } catch (e) {} };
  const charOf = id => { try { return id != null && SAVE() ? SAVE().getCharacter(+id) : null; } catch (e) { return null; } };

  // ---- styles (one block, the menu2 tokens; square corners like the rest of the UI)
  const css = `
.kp{margin-top:var(--s3,18px);text-align:left}
.kp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;border-top:1px solid var(--edge,rgba(245,196,81,.25));padding-top:var(--s2,12px)}
.kp-t{font-size:var(--t1,14px);letter-spacing:.3em;text-transform:uppercase;color:var(--gold)}
.kp-meter{font-variant-numeric:tabular-nums;font-size:var(--t2,16px);color:var(--gold2);letter-spacing:.08em}
.kp-sub{margin:4px 0 var(--s2,12px);font-size:var(--t1,14px);letter-spacing:.08em;color:var(--mut)}
.kp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(76px,1fr));gap:6px}
.kp-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 3px 5px;min-height:92px;cursor:pointer;font:inherit;color:#cfc9b6;
 background:linear-gradient(180deg,#1b1813,#0e0c09);border:1px solid color-mix(in srgb,var(--tc) 45%,#2a251c);border-radius:0;transition:border-color .15s,box-shadow .15s,transform .15s}
.kp-tile canvas{max-width:46px;max-height:46px}
.kp-tile:hover,.kp-tile:focus-visible{border-color:var(--tc);outline:0;box-shadow:0 0 10px color-mix(in srgb,var(--tc) 45%,transparent)}
.kp-tile.on{border-color:var(--tc);box-shadow:inset 0 0 0 2px var(--tc),0 0 12px color-mix(in srgb,var(--tc) 40%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--tc) 16%,#1b1813),#0e0c09)}
.kp-tile.on::after{content:"\\2713";position:absolute;top:2px;left:5px;font-weight:700;color:var(--tc)}
.kp-tile.off{cursor:default;opacity:.42;filter:saturate(.4)}
.kp-tile.off:hover{box-shadow:none;border-color:color-mix(in srgb,var(--tc) 45%,#2a251c)}
.kp-tile.dim{opacity:.55}
.kp-tier{position:absolute;top:2px;right:4px;font-style:normal;font-size:11px;font-weight:700;letter-spacing:.04em;color:var(--tc)}
.kp-n{font-size:12px;line-height:1.1;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.kp-c{position:absolute;bottom:3px;right:4px;font-size:11px;color:var(--gold2);font-variant-numeric:tabular-nums}
.kp-c::before{content:"\\25C6 ";font-size:8px;color:var(--gold3)}
.kp-foot{margin-top:var(--s2,12px);font-size:var(--t1,14px);letter-spacing:.06em;color:var(--mut);min-height:1.2em}
.kp-foot b{color:var(--gold2);font-weight:600}
.kp-warn{color:#ffb38a}
.kp-prev{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:var(--s2,12px);padding-top:var(--s1,8px);border-top:1px dashed rgba(245,196,81,.18)}
.kp-prev>span{flex:1 0 100%;font-size:var(--t1,14px);letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.kp-slot{position:relative;width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:#100e0b;border:1px solid color-mix(in srgb,var(--tc,#3a3326) 55%,#2a251c)}
.kp-slot canvas{max-width:38px;max-height:38px}.kp-slot.st{opacity:.5}
.kp-slot em{position:absolute;bottom:-1px;left:0;right:0;font-style:normal;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);text-align:center}
.kp-bud{display:flex;gap:3px;align-items:center}.kp-bud .kp-meter{margin-left:8px}
.kp-bud i{width:12px;height:12px;transform:rotate(45deg) scale(.8);border:1px solid var(--gold3);background:transparent}
.kp-bud i.on{background:var(--gold);border-color:var(--gold2);box-shadow:0 0 6px rgba(245,170,50,.6)}
.kp-act{display:flex;gap:var(--s1,8px);flex-wrap:wrap;margin-top:var(--s2,12px)}
.kp-act .rbtn{flex:1 1 auto;min-width:110px}
.kp-done{margin-top:var(--s2,12px);font-size:var(--t2,16px);color:var(--txt);line-height:1.35}
.kp-done b{color:var(--gold2)}
.kp-ov{position:fixed;inset:0;z-index:210;display:flex;align-items:center;justify-content:center;background:rgba(6,5,8,.86);padding:16px}
.kp-card{text-align:left}
.kp-card .rs-big{font-size:clamp(28px,6vh,48px);text-align:center}
.kp-card .rs-sub{text-align:center}
.kp-toast{position:fixed;top:14vh;left:50%;transform:translateX(-50%);z-index:220;max-width:min(560px,92vw);padding:10px 18px;font-size:var(--t2,16px);letter-spacing:.04em;color:var(--txt);
 background:linear-gradient(180deg,rgba(24,20,14,.95),rgba(12,10,8,.95));border:1px solid var(--gold3);border-left:3px solid var(--gold);pointer-events:none;transition:opacity .4s}
.kp-sec{margin-bottom:var(--s3,18px)}
.kp-sh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.kp-sh b{font-family:var(--disp);color:var(--gold);font-size:clamp(16px,2.8vh,22px);letter-spacing:.04em}
.kp-sh span{font-size:var(--t1,14px);letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.kp-sh .kp-cap{margin-left:auto;color:var(--gold2);letter-spacing:.06em}
.kp-conf{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;padding:8px 10px;border:1px solid rgba(255,120,90,.45);color:#ffd2c4;font-size:var(--t1,14px)}
.kp-cn{display:block;margin-top:2px;font-size:clamp(12px,2vh,15px);letter-spacing:.08em;color:var(--mut)}
.kp-cn b{color:var(--gold);font-weight:600}
.kp-relics{margin:var(--s2,12px) 0 6px;font-size:var(--t1,14px);letter-spacing:.2em;text-transform:uppercase;color:var(--mut)}
`;
  try { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); } catch (e) {}

  // ---- pieces
  function icon(k, s) { try { if (window.GKICONS) return GKICONS.canvas(k, s); } catch (e) {} return el('span', '', '?'); }
  function tipText(k) {
    const it = info(k); if (!it) return String(k);
    const st = it.attack != null ? 'Attack ' + it.attack : it.health != null ? 'Health ' + it.health : '';
    return [it.name, [TYPE[it.type], 'Tier ' + ROMAN[it.tierN | 0] + ' ' + (it.tier || ''), st].filter(Boolean).join(' · '), it.desc || ''].filter(Boolean).join('\n');
  }
  function tile(k, o) {
    o = o || {}; const it = info(k) || {}, t = el('button', 'kp-tile'); t.type = 'button';
    t.style.setProperty('--tc', TCOL[it.tier] || '#7d7768');
    t.appendChild(icon(k, 46)); t.appendChild(el('i', 'kp-tier', ROMAN[it.tierN | 0] || ''));   // tier as a numeral too, so it never relies on colour alone
    t.appendChild(el('span', 'kp-n', it.name || String(k)));
    if (o.cost != null) { const c = el('b', 'kp-c', String(o.cost)); c.title = 'Bring-in cost'; t.appendChild(c); }
    t.title = tipText(k) + (o.why ? '\n' + o.why : '');
    if (o.why) { t.classList.add('off'); t.setAttribute('aria-disabled', 'true'); }
    return t;
  }
  function slotEl(k, label, starter) {
    const it = info(k), s = el('div', 'kp-slot' + (starter ? ' st' : '')); s.style.setProperty('--tc', it ? TCOL[it.tier] || '#3a3326' : '#3a3326');
    if (k) { s.appendChild(icon(k, 38)); s.title = tipText(k) + (starter ? '\n(starter kit)' : ''); } else s.appendChild(el('em', '', label));
    return s;
  }
  function previewRow(box, goblin, keys, label) {   // the start inventory this loadout gives: weapon, armour, charm, the quick slots
    const G = window.GKITEMS, p = K.preview(goblin | 0, keys), st = (G && G.START && G.START[goblin | 0]) || {};
    const row = el('div', 'kp-prev'); row.appendChild(el('span', '', label));
    row.append(slotEl(p.weapon, 'weapon', p.weapon === st.weapon), slotEl(p.armor, 'armour', p.armor === st.armor), slotEl(p.charm, 'charm'));
    for (const q of p.quick.slice(0, KK.LOAD.consumable)) row.appendChild(slotEl(q, 'quick'));
    box.appendChild(row); return row;
  }
  function budgetEl(used, total) {
    const b = el('span', 'kp-bud'); b.title = used + ' of ' + total + ' loadout points';
    for (let i = 0; i < total; i++) b.appendChild(el('i', i < used ? 'on' : ''));
    b.appendChild(el('span', 'kp-meter', ' ' + used + ' / ' + total)); return b;
  }
  let toastT = 0;
  function toast(msg) {
    let t = document.getElementById('kpToast'); if (!t) { t = el('div', 'kp-toast'); t.id = 'kpToast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; }, 4200);
  }
  function overlay(build) {
    const ov = el('div', 'kp-ov'), card = el('div', 'rs-card kp-card'); ov.appendChild(card); document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener('keydown', key, true); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    document.addEventListener('keydown', key, true); build(card, close); const f = card.querySelector('.primary') || card.querySelector('button'); if (f) f.focus();
    return close;
  }
  const btn = (label, primary, fn) => { const b = el('button', 'rbtn' + (primary ? ' primary' : ''), label); b.type = 'button'; b.onclick = fn; return b; };

  // ---- server calls (POST /keep)
  async function api(body) {
    try { const r = await fetch('/keep', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); let j = {}; try { j = await r.json(); } catch (e) {} return { status: r.status, ...j }; }
    catch (e) { return { status: 0, err: 'net' }; }
  }
  async function claim(id, picks) {
    const c = charOf(id), o = c && c.offer; if (!o) return { status: 0, err: 'none' };
    const r = await api({ op: 'claim', otok: o.otok, tok: c.keep && c.keep.tok, picks });
    if (r.status === 200) { SAVE().setKeep(+id, r); SAVE().setOffer(+id, null); bump('kept', (r.kept || []).length); }
    else if (r.status === 409 && r.tok) { SAVE().setKeep(+id, r); SAVE().setOffer(+id, null); }   // claimed already (another tab) or the stash moved on: take the server's truth
    else if (r.status === 410 || r.err === 'token') SAVE().setOffer(+id, null);
    return r;
  }

  // ---- the choose step: on the victory card (box inside it) or in an overlay from the menu
  function chooser(box, id, offer, opts) {
    opts = opts || {};
    const c = charOf(id) || { wins: 1, goblin: 0, keep: null }, stash = (c.keep && c.keep.i) || [], bank = (c.keep && c.keep.b) || 0;
    const items = (offer.items || []).map(x => typeof x === 'string' ? { k: x, ok: true } : x), n = offer.n | 0, picks = [];
    let done = null, busy = false;
    const root = el('div', 'kp'); box.appendChild(root);
    const head = el('div', 'kp-head'), meter = el('span', 'kp-meter'); head.append(el('span', 'kp-t', n ? 'Choose what to keep' : 'Nothing to keep'), meter); root.appendChild(head);
    root.appendChild(el('div', 'kp-sub', offer.why && WHY_OFFER[offer.why] ? WHY_OFFER[offer.why] : (HOW[offer.how] || '') + (n ? ' · up to ' + n + ' of what you carried' : '')));
    const grid = el('div', 'kp-grid'); root.appendChild(grid);
    const foot = el('div', 'kp-foot'); root.appendChild(foot);
    const prevBox = el('div'); root.appendChild(prevBox);
    const act = el('div', 'kp-act'); root.appendChild(act);
    const tiles = items.map((x, i) => {
      const t = tile(x.k, { cost: x.ok ? K.cost(x.k) : null, why: x.ok ? '' : WHY[x.why] || WHY.unknown });
      if (x.ok && n) t.onclick = () => { if (done || busy) return; const j = picks.indexOf(i); if (j >= 0) picks.splice(j, 1); else if (picks.length < n) picks.push(i); else { picks.shift(); picks.push(i); } draw(); };
      else if (x.ok) t.classList.add('off');
      grid.appendChild(t); return t;
    });
    if (!items.length) grid.appendChild(el('div', 'kp-foot', 'You carried nothing out.'));
    const ok = btn(n ? 'Keep these' : 'Continue', true, () => finish());
    if (!opts.inline) act.appendChild(ok); else if (n) act.appendChild(ok);
    function draw() {
      tiles.forEach((t, i) => t.classList.toggle('on', picks.includes(i)));
      meter.textContent = n ? picks.length + ' / ' + n : '';
      const kept = picks.map(i => items[i].k), mg = K.merge(stash, kept), gold = Math.min(KK.BANK_CAP, bank + (offer.stipend | 0) + mg.gold);
      foot.textContent = '';
      foot.append('Stash ', el('b', '', mg.stash.length + ' / ' + KK.STASH_CAP), ' · bank ', el('b', '', gold + ' gold'), offer.stipend ? ' (+' + offer.stipend + ' from this win)' : '');
      if (mg.sold.length) foot.append(el('div', 'kp-warn', (mg.sold.some(s => s.why === 'dup') ? 'Third copies are sold' : 'Stash full') + ': ' + mg.sold.map(s => nameOf(s.k) + ' (' + s.g + ' gold)').join(', ')));
      if (offer.trophies && offer.trophies.length) foot.append(el('div', '', 'Trophy: ' + offer.trophies.map(nameOf).join(', ')));
      prevBox.textContent = '';
      const w = c.wins | 0, keys = K.best(mg.stash, w).map(i => mg.stash[i]);
      previewRow(prevBox, c.goblin, keys, 'Strongest start next match · budget ' + K.budget(w) + (keys.length ? '' : ' (starter kit)'));
    }
    async function finish() {
      if (done) return done; if (busy) return busy;
      busy = (async () => {
        ok.disabled = true; ok.textContent = 'Saving...';
        const r = await claim(id, picks.slice());
        if (r.status === 200) {
          root.textContent = ''; const d = el('div', 'kp-done');
          d.append(el('span', 'kp-t', 'Kept'), el('br'), r.kept.length ? r.kept.map(nameOf).join(', ') : 'Nothing this time', el('br'));
          d.append('Stash ', el('b', '', r.i.length + ' / ' + KK.STASH_CAP), ' · bank ', el('b', '', r.b + ' gold'));
          if (r.sold && r.sold.length) d.append(el('div', 'kp-warn', 'Sold: ' + r.sold.map(s => nameOf(s.k) + ' (' + s.g + ')').join(', ')));
          root.appendChild(d); done = Promise.resolve(r);
        } else if (r.status === 409 || r.status === 410 || r.err === 'token') { root.textContent = ''; root.appendChild(el('div', 'kp-done', r.status === 410 ? 'This choice expired.' : 'Already chosen.')); done = Promise.resolve(r); }
        else { ok.disabled = false; ok.textContent = 'Retry'; foot.appendChild(el('div', 'kp-warn', r.status === 0 ? 'No connection. Your choice waits on the Characters screen.' : 'Could not save (' + (r.err || r.status) + ').')); }
        busy = false; if (done && opts.onDone) opts.onDone(r); return r;
      })();
      return busy;
    }
    draw();
    return { finish, picks };
  }
  function pending(id, after) {   // an unclaimed offer, from the menu
    const c = charOf(id); if (!c || !c.offer) return after && after();
    if (c.offer.x && Date.now() > c.offer.x) { SAVE().setOffer(+id, null); return after && after(); }
    overlay((card, close) => {
      card.innerHTML = '<h1 class="rs-big">Keepsakes</h1><div class="rs-sub"><b></b></div>'; card.querySelector('.rs-sub b').textContent = c.name;
      chooser(card, id, c.offer, { onDone: () => setTimeout(() => { close(); if (after) after(); }, 900) });
      const a = el('div', 'kp-act'); a.appendChild(btn('Later', false, close)); card.appendChild(a);
    });
  }

  // ---- start loadout (Characters > Play)
  function play(id, go) {
    const c = charOf(id); if (!c) return go([]);
    if (c.offer) return pending(id, () => play(id, go));
    const st = (c.keep && c.keep.i) || [], bank = (c.keep && c.keep.b) || 0, wins = c.wins | 0, bud = K.budget(wins);
    if (!st.length) return go([]);
    let sel = K.indicesOf(st, c.load || []) || []; if (K.loadout(st, sel, wins).err) sel = [];   // the last loadout if it still fits, else the starter kit
    overlay((card, close) => {
      card.innerHTML = '<h1 class="rs-big">Start loadout</h1><div class="rs-sub"></div>';
      card.querySelector('.rs-sub').append(el('b', '', c.name), ' · ' + wins + (wins === 1 ? ' victory' : ' victories'));
      const head = el('div', 'kp-head'), mbox = el('span'); head.append(el('span', 'kp-t', 'Bring from the stash'), mbox); card.appendChild(head);
      card.appendChild(el('div', 'kp-sub', 'Budget ' + bud + ' points: ' + KK.COST.map((x, t) => ROMAN[t] + '=' + x).slice(1).join(' ') + ' · one weapon, armour, charm, two consumables'));
      const grid = el('div', 'kp-grid'); card.appendChild(grid);
      const prev = el('div'); card.appendChild(prev);
      card.appendChild(el('div', 'kp-foot', (bank ? 'Your bank of ' + bank + ' gold comes along. ' : '') + 'What you bring is at stake: die and it is gone.'));
      const act = el('div', 'kp-act'); card.appendChild(act);
      const tiles = st.map((k, i) => { const t = tile(k, { cost: K.cost(k), why: K.keepable(k).ok ? '' : 'Cannot be brought in' }); t.onclick = () => toggle(i); grid.appendChild(t); return t; });
      function toggle(i) {
        const j = sel.indexOf(i);
        if (j >= 0) sel.splice(j, 1);
        else { const next = sel.concat(i), r = K.loadout(st, next, wins); if (!r.err) sel = next; else { const t = info(st[i]).type, same = sel.findIndex(x => info(st[x]).type === t && t !== 'consumable'); if (same >= 0) { const sw = sel.slice(); sw[same] = i; if (!K.loadout(st, sw, wins).err) sel = sw; else return flash(r); } else return flash(r); } }
        draw();
      }
      function flash(r) { mbox.animate && mbox.animate([{ opacity: 1 }, { opacity: .2 }, { opacity: 1 }], 300); toast(r.err === 'budget' ? 'Over budget: ' + bud + ' points.' : r.err === 'slot' ? 'That slot is full.' : 'Cannot bring that.'); }
      function draw() {
        const r = K.loadout(st, sel, wins), used = r.err ? 0 : r.cost;
        tiles.forEach((t, i) => { t.classList.toggle('on', sel.includes(i)); const fits = sel.includes(i) || !K.loadout(st, sel.concat(i), wins).err; t.classList.toggle('dim', !fits && !t.classList.contains('off')); });
        mbox.textContent = ''; mbox.appendChild(budgetEl(used, bud));
        prev.textContent = ''; previewRow(prev, c.goblin, sel.map(i => st[i]), sel.length ? 'You start with' : 'You start with the starter kit');
      }
      act.append(btn('Play', true, () => { const keys = sel.map(i => st[i]); SAVE().setLoad(+id, keys); close(); go(sel.slice()); }),
        btn('Starter kit', false, () => { sel = []; draw(); }), btn('Best fit', false, () => { sel = K.best(st, wins); draw(); }), btn('Back', false, close));
      draw();
    });
  }
  // The join query for a saved character: its stash token and the chosen stash indices.
  function joinQuery(id, bring) {
    const c = charOf(id); if (!c || !c.keep || !c.keep.tok) return '';
    const b = Array.isArray(bring) ? bring.filter(i => Number.isInteger(i) && i >= 0 && i < 64).slice(0, 5) : [];
    return '&ktoken=' + encodeURIComponent(c.keep.tok) + (b.length ? '&bring=' + b.join(',') : '');
  }
  // Server messages: {keep: stash view | {inn, gold} | {bad|busy|refused}} and {keepOffer} (the consolation).
  function onMsg(d, id) {
    if (window.GK_OFFLINE) return;
    const k = d.keep;
    if (k && id != null) {
      if (typeof k.tok === 'string') try { SAVE().setKeep(+id, k); } catch (e) {}
      if (k.inn && k.inn.length) { bump('brought', k.inn.length); toast('Brought in: ' + k.inn.map(nameOf).join(', ') + (k.gold ? ' and ' + k.gold + ' gold' : '') + '. Keep them alive.'); }
      else if (k.gold) toast('Your bank of ' + k.gold + ' gold came along.');
    }
    if (k && k.bad) toast('Your stash could not be verified. Playing with the starter kit.');
    else if (k && k.busy) toast('This goblin is already in another match. Starter kit only.');
    else if (k && k.refused) toast(k.refused === 'budget' ? 'Loadout over budget. Starter kit only.' : 'Your loadout changed. Starter kit only.');
    if (d.keepOffer && id != null) { try { SAVE().setOffer(+id, d.keepOffer); } catch (e) {} toast('You survived to the end: choose a keepsake on the Characters screen.'); }
  }

  // ---- menu: a line on the character card, the Inventory screen
  function cardNote(card, c) {
    const info = card.querySelector('.cinfo'); if (!info || !c) return;
    const st = (c.keep && c.keep.i) || [], b = (c.keep && c.keep.b) || 0;
    if (!st.length && !b && !c.offer) return;
    const n = el('span', 'kp-cn'); n.append('Stash ' + st.length + '/' + KK.STASH_CAP + (b ? ' · ' + b + ' gold' : ''));
    if (c.offer) { n.append(' · '); n.appendChild(el('b', '', 'keepsakes to choose')); }
    info.appendChild(n);
  }
  function inventory(sheet, rerender) {
    if (!sheet || !SAVE()) return;
    let box = document.getElementById('inv-keep'); if (!box) { box = el('div'); box.id = 'inv-keep'; sheet.insertBefore(box, sheet.firstChild); }
    box.textContent = '';
    let chars = []; try { chars = SAVE().characters().slice(); } catch (e) {}
    chars = chars.filter(c => (c.keep && (c.keep.i.length || c.keep.b)) || c.offer || (c.wins | 0) > 0).sort((a, b) => (b.wins | 0) - (a.wins | 0));
    for (const c of chars) {
      const sec = el('section', 'kp-sec'), sh = el('div', 'kp-sh'), st = (c.keep && c.keep.i) || [], bank = (c.keep && c.keep.b) || 0;
      sh.append(el('b', '', c.name), el('span', '', ((window.GK && GK.NAMES && GK.NAMES[c.goblin]) || 'Goblin') + ' · ' + (c.wins | 0) + (c.wins === 1 ? ' victory' : ' victories') + ' · budget ' + K.budget(c.wins | 0)), el('span', 'kp-cap', st.length + ' / ' + KK.STASH_CAP + ' · bank ' + bank + ' gold'));
      sec.appendChild(sh);
      const grid = el('div', 'kp-grid'), sel = new Set(); sec.appendChild(grid);
      if (!st.length) grid.appendChild(el('div', 'kp-foot', 'Empty. Win to choose keepsakes.'));
      const act = el('div', 'kp-act'), sellB = btn('Sell', false, () => doSell());
      st.forEach((k, i) => { const t = tile(k, { cost: K.cost(k) }); t.onclick = () => { if (c.offer) return toast('Choose your keepsakes first.'); sel.has(i) ? sel.delete(i) : sel.add(i); t.classList.toggle('on', sel.has(i)); upd(); }; grid.appendChild(t); });
      const upd = () => { const g = [...sel].reduce((s, i) => s + K.sellValue(st[i]), 0); sellB.textContent = sel.size ? 'Sell ' + sel.size + ' for ' + g + ' gold' : 'Sell'; sellB.disabled = !sel.size; };
      async function doSell() {
        if (!sel.size || !c.keep) return; sellB.disabled = true;
        const r = await api({ op: 'sell', tok: c.keep.tok, idx: [...sel] });
        if (r.tok) SAVE().setKeep(c.id, r);
        if (r.status === 200) toast('Sold for ' + r.sold.reduce((s, x) => s + x.g, 0) + ' gold' + (r.lost ? ' (' + r.lost + ' over the bank cap of ' + KK.BANK_CAP + ' lost)' : '') + '.');
        else toast(r.err === 'busy' ? 'This goblin is in a match.' : r.err === 'stale' ? 'Your stash changed: refreshed.' : 'Could not sell (' + (r.err || r.status) + ').');
        if (rerender) rerender(); else inventory(sheet);
      }
      if (c.offer) act.appendChild(btn('Choose keepsakes', true, () => pending(c.id, () => rerender ? rerender() : inventory(sheet))));
      if (st.length) act.appendChild(sellB);
      act.appendChild(btn('Retire', false, () => {
        if (sec.querySelector('.kp-conf')) return;
        const cf = el('div', 'kp-conf'); cf.append('Retire ' + c.name + '? It joins the hall with its ' + (c.wins | 0) + ' victories; its stash goes with it.');
        cf.append(btn('Keep', true, () => cf.remove()), btn('Retire', false, () => { SAVE().retire(c.id); if (rerender) rerender(); else inventory(sheet); }));
        sec.appendChild(cf); cf.querySelector('button').focus();
      }));
      sec.appendChild(act); box.appendChild(sec); upd();
    }
    const hall = SAVE().hall ? SAVE().hall() : [];
    if (hall.length) { const h = el('div', 'kp-relics', 'Retired: ' + hall.slice(-8).reverse().map(x => x.name + ' (' + x.wins + ')').join(', ')); box.appendChild(h); }
    const legacy = (SAVE().stash() || []).filter(Boolean).length;
    if (legacy) box.appendChild(el('div', 'kp-relics', 'Old relics, from before stashes were per goblin (display only)'));
    const g = document.getElementById('inv-grid'), em = document.getElementById('inv-empty'), sm = document.getElementById('inv-sum');
    if (g) g.style.display = legacy ? '' : 'none'; if (sm) sm.style.display = 'none';   // the old "N items brought back" line; the relics heading above replaces it
    if (em) { em.style.display = chars.length || legacy ? 'none' : ''; em.textContent = 'Nothing here yet. Win a match and choose what your goblin keeps.'; }
  }

  window.GKKEEPUI = { chooser, pending, play, joinQuery, onMsg, cardNote, inventory, claim, toast, api };
})();

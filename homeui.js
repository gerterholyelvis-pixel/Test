/* homeui.js - client UI for the Elixir Screen, the elixir counter and home-base toasts (PLAN-5x5 1.7, 1.8).
   Browser global: GKHOMEUI.createHomeUI({root, send, counter?}). Pure DOM, no game imports; all game data comes in through `state`.
   Needs GKHOMEBASE (homebase.js) loaded first for the upgrade and sendable tables (falls back to require() under node/jsdom).

   state = {
     elixir, cap,                       // carried elixir and carry cap (120)
     tank, tankCap, pumpLv,             // pump tank (0-based pumpLv ignored; read from home.lv.pump)
     round, sentRound,                  // current round number; true when this goblin already sent this round
     distills, distillMax,              // knowledge distilled so far / max (3)
     home: { lv:{id:level}, ammo, snareArmed, box:[{name,n}|null,...], dead },
     bag:  [{slot, name, n}],           // optional: backpack items that can go into the lockbox
     active: { roomKey: count },        // optional: live sendables per room (max 2)
     map: { myRoom, vaultKey, cells:[{key, gx, gy, kind:'arena'|'home'|'vault', label, owner?, dead?}] }
   }
   Messages sent through send(): {base:{buy:id}} {base:{act:'distill'|'snareRearm'|'sentryAmmo'}} {base:{send:id, room:key}}
   {lockbox:{put:slot}} {lockbox:{take:slot}}. */
(function (g, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(g);
  else g.GKHOMEUI = factory(g);
})(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';
  const HB = G.GKHOMEBASE || (typeof require === 'function' ? require('./homebase.js') : null);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DROP = '<svg class="hu-drop" viewBox="0 0 16 20" aria-hidden="true"><path d="M8 1C8 1 2 8.2 2 12.4A6 6 0 0 0 14 12.4C14 8.2 8 1 8 1Z" fill="currentColor"/><path d="M5.2 12.6a3 3 0 0 0 2.2 2.8" stroke="rgba(255,255,255,.55)" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';
  const TABS = ['BASE', 'SECURITY', 'SEND'];
  const SEND_BLURB = {   // telegraph text shown to the sender
    bell: 'The room gets a 3 s warning that names you. Everyone then sees its goblins on the minimap.',
    gas: 'The room gets a 3 s warning that names you. Then fog, and 1 damage every 2 s.',
    rats: 'The room gets a 3 s warning that names you. Then five slow rats.',
    jam: 'The room gets a 3 s warning that names you. Its door pick is frozen for the round.',
    spike: 'The room gets a 3 s warning that names you. A hidden plate waits at a random spot.',
    leech: 'The home gets a 3 s warning that names you. Half its tank flows to you for 10 s.',
  };
  const REASON = { round1: 'Sends start in round 2', limit: 'One send per round', vault: 'Not the Vault', own: 'Not your own room', target: 'Needs an enemy home', full: 'That room already has two active', elixir: 'Not enough elixir', unknown: 'Unknown', pick: 'Pick a target on the map' };
  const dur = ms => ms === 'round' ? 'rest of the round' : Math.round(ms / 1000) + ' s';

  const CSS = `
.hu{--g:var(--gold,#f5c451);--g2:var(--gold2,#ffe39a);--g3:var(--gold3,#a8741a);--ui:var(--ui,'Barlow Condensed','Arial Narrow',system-ui,sans-serif);--ex:#7fd8ff;--ex2:#bdeaff;--bad:#ff7a66;--mut:#a9a493;--edge:rgba(245,196,81,.28)}
.hu,.hu *{box-sizing:border-box}
.hu-screen{position:fixed;inset:0;z-index:57;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,22,6,.5),rgba(0,0,0,.84));font-family:var(--ui);color:#efe9d8;user-select:none;zoom:var(--uis,1)}
.hu-screen.on{display:flex}
.hu-win{width:min(940px,95vw);max-height:94vh;display:flex;flex-direction:column;padding:clamp(10px,2vh,18px) clamp(12px,2vw,24px);border-radius:3px;background:linear-gradient(180deg,rgba(20,17,13,.96),rgba(10,8,8,.96));border:1px solid rgba(245,196,81,.35);border-top:3px solid var(--g3);box-shadow:0 10px 60px rgba(0,0,0,.7)}
.hu-head{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.hu-ttl{font-family:var(--disp,'Cinzel Decorative',Georgia,serif);font-weight:700;letter-spacing:.06em;font-size:clamp(20px,3.2vh,28px);color:var(--g);margin-right:auto;text-shadow:0 0 18px rgba(245,170,50,.3)}
.hu-purse{display:flex;gap:14px;align-items:center;font-size:clamp(15px,2.4vh,19px);letter-spacing:.06em}
.hu-purse b{color:var(--ex2);font-weight:700;font-size:1.25em}.hu-purse span{color:var(--mut)}
.hu-purse .hu-drop{width:.8em;height:1em;color:var(--ex);vertical-align:-.12em;margin-right:5px}
.hu-tabs{display:flex;gap:4px;margin:clamp(8px,1.4vh,12px) 0;border-bottom:1px solid var(--edge)}
.hu-tab{appearance:none;background:none;border:0;border-bottom:2px solid transparent;margin-bottom:-1px;padding:6px 16px;cursor:pointer;color:var(--mut);font:700 clamp(14px,2.2vh,17px) var(--ui);letter-spacing:.2em}
.hu-tab kbd{font:inherit;opacity:.55;margin-right:7px;font-size:.85em}
.hu-tab:hover{color:#efe9d8}.hu-tab[aria-selected=true]{color:var(--g);border-bottom-color:var(--g)}
.hu button:focus-visible{outline:2px solid var(--ember,#ff6a2a);outline-offset:2px}
.hu-body{overflow:auto;min-height:0;padding-right:4px;scrollbar-width:thin;scrollbar-color:var(--g3) transparent}
.hu-h{margin:clamp(10px,1.8vh,16px) 0 6px;font:700 clamp(12px,1.8vh,14px) var(--ui);letter-spacing:.3em;color:var(--g);display:flex;align-items:center;gap:8px}
.hu-h:first-child{margin-top:0}.hu-h::before{content:"";width:7px;height:7px;background:var(--g);transform:rotate(45deg)}
.hu-h small{letter-spacing:.1em;color:var(--mut);font-weight:500;margin-left:auto;text-transform:none;font-size:1.1em}
.hu-row{display:grid;grid-template-columns:minmax(120px,1.1fr) 52px minmax(130px,2fr) auto;gap:4px 14px;align-items:center;padding:7px 10px;margin-bottom:3px;background:linear-gradient(90deg,rgba(255,255,255,.05),rgba(255,255,255,.015));border:1px solid rgba(245,196,81,.14);border-left:3px solid var(--g3)}
.hu-row.max{border-left-color:var(--ex);opacity:.82}
.hu-nm{font-weight:700;font-size:clamp(15px,2.3vh,18px);letter-spacing:.08em;text-transform:uppercase}
.hu-fx{color:#cfc9b6;font-size:clamp(14px,2.1vh,16px);line-height:1.2}
.hu-pips{display:flex;gap:5px;justify-content:flex-start}.hu-pip{width:9px;height:9px;transform:rotate(45deg);border:1px solid var(--g3)}.hu-pip.on{background:var(--ex);border-color:var(--ex2);box-shadow:0 0 6px rgba(127,216,255,.55)}
.hu-buy{appearance:none;min-width:84px;cursor:pointer;padding:5px 12px;border:1px solid var(--g3);border-radius:2px;background:rgba(245,196,81,.1);color:var(--g2);font:700 clamp(13px,2vh,16px) var(--ui);letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
.hu-buy i{font-style:normal;color:var(--ex2);margin-left:6px}
.hu-buy:hover:not(:disabled){background:linear-gradient(90deg,var(--g2),var(--g));color:#1a1104;border-color:var(--g)}.hu-buy:hover:not(:disabled) i{color:#0b3a52}
.hu-buy:disabled{cursor:default;opacity:.42}.hu-buy.done{opacity:.7;color:var(--ex);border-color:rgba(127,216,255,.4);background:none}
.hu-buy.bad{animation:hubad .3s}@keyframes hubad{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
.hu-drop{width:.75em;height:1em;flex:none}
.hu-tank{display:flex;align-items:center;gap:12px;padding:8px 10px;border:1px solid rgba(127,216,255,.25);background:rgba(127,216,255,.05)}
.hu-bar{flex:1;height:10px;background:#15110b;border:1px solid var(--g3);position:relative;overflow:hidden}.hu-bar>div{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#3a97c4,var(--ex));transition:width .3s}
.hu-bar.full>div{background:linear-gradient(90deg,#c48b3a,var(--g))}
.hu-note{color:var(--mut);font-size:clamp(13px,2vh,15px);letter-spacing:.04em}
.hu-chips{display:flex;flex-wrap:wrap;gap:6px}.hu-chip{padding:3px 10px;border:1px solid rgba(245,196,81,.25);font-size:clamp(13px,2vh,15px);letter-spacing:.1em;text-transform:uppercase;color:var(--mut)}
.hu-chip.on{color:var(--ex2);border-color:rgba(127,216,255,.5);background:rgba(127,216,255,.08)}.hu-chip.warn{color:var(--bad);border-color:rgba(255,122,102,.5)}
.hu-box{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px}
.hu-slot{display:flex;align-items:center;gap:6px;min-height:32px;padding:3px 6px;border:1px dashed rgba(245,196,81,.3);font-size:clamp(13px,2vh,15px)}.hu-slot.full{border-style:solid;background:rgba(245,196,81,.06)}
.hu-slot span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hu-slot .hu-buy{min-width:0;padding:2px 8px}
.hu-send{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:clamp(10px,2vw,22px);align-items:start}
.hu-map{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;aspect-ratio:1;max-width:340px;width:100%}
.hu-cell{appearance:none;padding:0;border:1px solid rgba(245,196,81,.18);background:rgba(255,255,255,.04);color:#cfc9b6;font:600 clamp(9px,1.5vh,12px) var(--ui);letter-spacing:.04em;cursor:pointer;position:relative;display:flex;align-items:center;justify-content:center;overflow:hidden;min-width:0}
.hu-cell.home{background:rgba(245,196,81,.07);border-color:rgba(245,196,81,.32)}.hu-cell.vault{background:rgba(245,196,81,.2);color:var(--g2);border-color:var(--g)}
.hu-cell.mine{box-shadow:inset 0 0 0 2px var(--ex);color:var(--ex2)}.hu-cell.dead{opacity:.4;text-decoration:line-through}
.hu-cell.no{cursor:not-allowed;opacity:.38}.hu-cell.hot{background:rgba(255,106,42,.28);border-color:var(--ember,#ff6a2a);color:#fff}
.hu-cell:hover:not(.no){border-color:var(--g)}.hu-cell.none{visibility:hidden}
.hu-cell em{position:absolute;top:1px;right:3px;font-style:normal;font-size:.9em;color:var(--bad)}
.hu-legend{margin-top:8px;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:clamp(12px,1.8vh,14px);color:var(--mut);letter-spacing:.05em}
.hu-legend b{display:inline-block;width:9px;height:9px;margin-right:5px;vertical-align:-1px;border:1px solid var(--g3)}
.hu-sl{list-style:none;margin:0;padding:0}
.hu-si{display:grid;grid-template-columns:1fr auto;gap:0 12px;padding:6px 10px;margin-bottom:3px;cursor:pointer;border:1px solid rgba(245,196,81,.14);border-left:3px solid var(--g3);background:rgba(255,255,255,.03);text-align:left;width:100%;color:inherit;font-family:var(--ui)}
.hu-si[aria-checked=true]{border-color:var(--g);border-left-color:var(--ember,#ff6a2a);background:rgba(245,196,81,.1)}
.hu-si:disabled{opacity:.42;cursor:not-allowed}.hu-si .c{color:var(--ex2);font-weight:700;font-size:clamp(15px,2.3vh,18px)}
.hu-si .n{font-weight:700;letter-spacing:.08em;text-transform:uppercase;font-size:clamp(15px,2.2vh,17px)}.hu-si .m{grid-column:1/3;color:var(--mut);font-size:clamp(12px,1.9vh,14px)}
.hu-det{margin-top:8px;padding:8px 10px;border:1px solid var(--edge);background:rgba(0,0,0,.25);font-size:clamp(13px,2vh,15px);line-height:1.3;color:#cfc9b6;min-height:5.6em}
.hu-det b{color:var(--g2)}.hu-det .bad{color:var(--bad)}
.hu-go{margin-top:8px;width:100%;padding:8px;font-size:clamp(15px,2.3vh,18px)}
.hu-foot{display:flex;align-items:center;gap:12px;margin-top:10px}
.hu-msg{flex:1;font-size:clamp(14px,2.1vh,16px);min-height:1.3em;letter-spacing:.04em}
.hu-close{appearance:none;cursor:pointer;padding:7px 18px;border:0;border-radius:2px;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405;font:700 clamp(13px,2vh,15px) var(--ui);letter-spacing:.14em}
.hu-keys{color:var(--mut);font-size:clamp(12px,1.8vh,13px);letter-spacing:.08em}
.hu-ctr{position:fixed;z-index:20;display:none;align-items:center;gap:6px;padding:4px 11px 4px 9px;border-radius:2px;background:rgba(10,10,16,.62);border:1px solid rgba(127,216,255,.3);font:700 clamp(15px,2.5vh,20px) 'Barlow Condensed','Arial Narrow',system-ui,sans-serif;letter-spacing:.06em;color:#bdeaff;text-shadow:0 1px 4px #000;pointer-events:none;zoom:var(--uis,1)}
.hu-ctr.on{display:flex}.hu-ctr .hu-drop{width:.7em;height:.9em;color:#7fd8ff}.hu-ctr small{font-size:.65em;font-weight:500;color:#a9a493;letter-spacing:.04em}.hu-ctr.hi{border-color:#f5c451;color:#ffe39a}.hu-ctr.hi .hu-drop{color:#f5c451}
.hu-tw{position:fixed;left:50%;top:3vh;transform:translateX(-50%);z-index:58;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;width:min(520px,92vw);zoom:var(--uis,1)}
.hu-t{padding:7px 16px;border-radius:2px;background:rgba(10,8,8,.9);border:1px solid rgba(245,196,81,.35);border-left:4px solid var(--tc,#f5c451);font:600 clamp(15px,2.4vh,19px) 'Barlow Condensed','Arial Narrow',system-ui,sans-serif;letter-spacing:.06em;color:#efe9d8;box-shadow:0 4px 18px rgba(0,0,0,.6);animation:huin .22s ease-out;transition:opacity .45s,transform .45s}
.hu-t.out{opacity:0;transform:translateY(-6px)}@keyframes huin{from{opacity:0;transform:translateY(-8px)}}
@media (max-width:760px){.hu-keys{display:none}.hu-tank{flex-wrap:wrap}.hu-row{grid-template-columns:1fr auto auto}.hu-row .hu-fx{grid-column:1/4;order:5}.hu-send{grid-template-columns:1fr}.hu-map{margin:0 auto}}
@media (prefers-reduced-motion:reduce){.hu-t,.hu-buy.bad{animation:none}}`;

  const TOAST = { raid: '#ff6a4a', alarm: '#ff9a3a', send: '#c58cff', good: '#7fd8ff', info: '#f5c451' };

  function createHomeUI(opts) {
    const root = opts.root || (G.document && G.document.body), send = opts.send || (() => {});
    const doc = root.ownerDocument || G.document, ce = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    if (!doc.getElementById('huCss')) { const st = ce('style'); st.id = 'huCss'; st.textContent = CSS; doc.head.appendChild(st); }
    const scr = ce('div', 'hu hu-screen'); scr.id = 'gkHome'; scr.setAttribute('role', 'dialog'); scr.setAttribute('aria-label', 'Elixir Screen');
    scr.innerHTML = '<div class="hu-win"><div class="hu-head"><div class="hu-ttl">ELIXIR SCREEN</div><div class="hu-purse"></div></div><div class="hu-tabs" role="tablist"></div><div class="hu-body"></div>'
      + '<div class="hu-foot"><div class="hu-msg" aria-live="polite"></div><div class="hu-keys">1 2 3 TABS &nbsp; ARROWS MOVE &nbsp; ENTER BUY &nbsp; E CLOSE</div><button class="hu-close">CLOSE (E)</button></div></div>';
    root.appendChild(scr);
    const purse = scr.querySelector('.hu-purse'), tabsEl = scr.querySelector('.hu-tabs'), body = scr.querySelector('.hu-body'), msgEl = scr.querySelector('.hu-msg');
    const ctr = ce('div', 'hu hu-ctr', DROP + '<span class="v">0</span><small></small>'); ctr.setAttribute('aria-label', 'Elixir');
    const c = opts.counter || {}; ctr.style.top = c.top || 'calc(clamp(12px,2.4vh,24px) + 52px)'; if (c.left) ctr.style.left = c.left; else ctr.style.right = c.right || 'clamp(12px,2.4vw,28px)';
    root.appendChild(ctr);
    const tw = ce('div', 'hu hu-tw'); tw.setAttribute('role', 'status'); tw.setAttribute('aria-live', 'polite'); root.appendChild(tw);
    const cv = ctr.querySelector('.v'), cs = ctr.querySelector('small');
    let st = null, tab = 0, pickSend = null, pickRoom = null, isOpen = false, msgT = 0, lastEl = null, counterOn = false;

    const say = (t, good) => { msgEl.textContent = t || ''; msgEl.style.color = good ? '#8be28b' : '#ff8a7a'; clearTimeout(msgT); if (t) msgT = setTimeout(() => { msgEl.textContent = ''; }, 2600); };
    const lv = id => (st && st.home && st.home.lv && st.home.lv[id]) | 0;
    const cap = () => (st && st.cap) || 120;

    // ---- elixir counter
    function setElixir(n, capN) {
      if (n == null) { ctr.classList.remove('on'); counterOn = false; return; }
      ctr.classList.add('on');
      const prev = +cv.textContent || 0; n = Math.floor(n);
      if (n !== prev) {
        cv.textContent = n;
        if (counterOn && ctr.animate && !(G.matchMedia && G.matchMedia('(prefers-reduced-motion: reduce)').matches))
          ctr.animate(n > prev ? [{ transform: 'translateY(-2px) scale(1.07)', boxShadow: '0 0 12px rgba(127,216,255,.55)' }, { transform: 'none', boxShadow: '0 0 0 rgba(127,216,255,0)' }]
            : [{ opacity: .55 }, { opacity: 1 }], { duration: n > prev ? 320 : 220, easing: 'ease-out' });
      }
      counterOn = true;
      if (capN) { cs.textContent = '/ ' + capN; ctr.classList.toggle('hi', n >= capN * 0.9); }
    }

    // ---- toasts
    function toast(kind, text) {
      const t = ce('div', 'hu-t'); t.textContent = text; t.style.setProperty('--tc', TOAST[kind] || TOAST.info); tw.appendChild(t);
      while (tw.children.length > 3) tw.removeChild(tw.firstChild);
      setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, kind === 'raid' || kind === 'alarm' ? 4600 : 3400);
    }

    // ---- derived info
    function sendCheck(id, cell) {
      const d = HB.SENDS[id], s = st || {}, m = s.map || {};
      if (HB.FIRST_SEND_ROUND && (s.round | 0) < HB.FIRST_SEND_ROUND) return 'round1';
      if (s.sentRound) return 'limit';
      if ((s.elixir | 0) < d.cost) return 'elixir';
      if (cell) {
        if (cell.key === m.vaultKey || cell.kind === 'vault') return 'vault';
        if (cell.key === m.myRoom || cell.mine) return 'own';
        if (d.target === 'home' && cell.kind !== 'home') return 'target';
        if (cell.kind === 'home' && cell.dead) return 'target';
        if (s.active && (s.active[cell.key] | 0) >= HB.MAX_ACTIVE_PER_ROOM) return 'full';
      }
      return null;
    }
    const cellById = key => ((st && st.map && st.map.cells) || []).find(c => c.key === key);

    // ---- render
    function render() {
      if (!st) return;
      const f = doc.activeElement && scr.contains(doc.activeElement) ? doc.activeElement.dataset.f : null;
      purse.innerHTML = '<div>' + DROP + 'CARRIED <b>' + (st.elixir | 0) + '</b> <span>/ ' + cap() + '</span></div>';
      tabsEl.innerHTML = TABS.map((t, i) => '<button class="hu-tab" role="tab" aria-selected="' + (i === tab) + '" data-f="tab' + i + '" data-tab="' + i + '"><kbd>' + (i + 1) + '</kbd>' + t + '</button>').join('');
      body.innerHTML = '';
      if (st.home && st.home.dead) body.appendChild(ce('div', 'hu-note', 'This home is dead. The screen is dark.'));
      else if (tab === 0) renderBase(); else if (tab === 1) renderSecurity(); else renderSend();
      if (f) { const e = scr.querySelector('[data-f="' + f + '"]'); if (e && !e.disabled) e.focus(); }
    }
    function upgradeRow(id) {
      const u = HB.UPGRADES[id], l = Math.min(lv(id), HB.UPGRADES[id].levels.length), max = l >= u.levels.length, nx = max ? null : u.levels[l], can = !max && (st.elixir | 0) >= nx.cost;
      const pips = u.levels.map((_, i) => '<i class="hu-pip' + (i < l ? ' on' : '') + '"></i>').join('');
      const fx = max ? u.levels[l - 1].fx : (l ? 'Next: ' : '') + nx.fx;
      return '<div class="hu-row' + (max ? ' max' : '') + '"><div class="hu-nm">' + esc(u.name) + '</div><div class="hu-pips" aria-label="level ' + l + ' of ' + u.levels.length + '">' + pips + '</div><div class="hu-fx">' + esc(fx) + '</div>'
        + (max ? '<button class="hu-buy done" disabled>OWNED</button>' : '<button class="hu-buy' + (can ? '' : ' dim') + '" data-f="buy-' + id + '" data-buy="' + id + '"' + (can ? '' : ' aria-disabled="true" style="opacity:.5"') + '>BUY<i>' + nx.cost + '</i></button>') + '</div>';
    }
    function renderBase() {
      const tank = st.tank | 0, tc = st.tankCap || 48, pl = HB.pumpLevel ? HB.pumpLevel(st.home || { lv: {} }) : 1;
      let h = '<div class="hu-h">PUMP<small>level ' + pl + ' of 3</small></div>'
        + '<div class="hu-tank"><span>' + DROP + ' TANK <b style="color:#bdeaff">' + tank + '</b> / ' + tc + '</span><div class="hu-bar' + (tank >= tc ? ' full' : '') + '"><div style="width:' + Math.min(100, tank / tc * 100) + '%"></div></div><span class="hu-note">' + (tank >= tc ? 'Full: collecting wastes nothing, waiting does' : 'Press E at the pump to collect') + '</span></div>'
        + '<div class="hu-h">UPGRADES</div>';
      HB.ORDER.filter(id => HB.UPGRADES[id].tab === 'BASE').forEach(id => { h += upgradeRow(id); });
      const dm = st.distillMax || 3, dd = st.distills | 0, dc = HB.ACTIONS.distill.cost, dcan = dd < dm && (st.elixir | 0) >= dc;
      h += '<div class="hu-row"><div class="hu-nm">Distill</div><div class="hu-pips">' + Array.from({ length: dm }, (_, i) => '<i class="hu-pip' + (i < dd ? ' on' : '') + '"></i>').join('') + '</div><div class="hu-fx">+5 knowledge, up to ' + dm + ' per match</div>'
        + (dd >= dm ? '<button class="hu-buy done" disabled>DONE</button>' : '<button class="hu-buy" data-f="act-distill" data-act="distill"' + (dcan ? '' : ' style="opacity:.5"') + '>BUY<i>' + dc + '</i></button>') + '</div>';
      const slots = HB.lockboxSlots ? HB.lockboxSlots(st.home || { lv: {} }) : 0;
      if (slots) {
        const box = (st.home && st.home.box) || [];
        h += '<div class="hu-h">LOCKBOX<small>' + box.filter(Boolean).length + ' / ' + slots + ' slots</small></div><div class="hu-box">';
        for (let i = 0; i < slots; i++) { const b = box[i]; h += b ? '<div class="hu-slot full"><span title="' + esc(b.name) + '">' + esc(b.name) + (b.n > 1 ? ' x' + b.n : '') + '</span><button class="hu-buy" data-f="take' + i + '" data-take="' + i + '">TAKE</button></div>' : '<div class="hu-slot"><span class="hu-note">empty</span></div>'; }
        h += '</div>';
        const bag = st.bag || [];
        if (bag.length && box.filter(Boolean).length < slots) h += '<div class="hu-note" style="margin:8px 0 4px">Put in the box:</div><div class="hu-chips">' + bag.slice(0, 12).map(b => '<button class="hu-buy" data-f="put' + b.slot + '" data-put="' + esc(b.slot) + '">' + esc(b.name) + (b.n > 1 ? ' x' + b.n : '') + '</button>').join('') + '</div>';
        h += '<div class="hu-note" style="margin-top:6px">Raiders can crack the box in ' + ((HB.crackMs ? HB.crackMs(st.home) : 8000) / 1000) + ' s. It spills if you die.</div>';
      }
      body.innerHTML = h;
    }
    function renderSecurity() {
      const hm = st.home || { lv: {} }, ll = lv('lock');
      let h = '<div class="hu-h">STATUS</div><div class="hu-chips">'
        + '<span class="hu-chip' + (ll ? ' on' : '') + '">' + (ll ? 'Door lock L' + ll : 'Door open') + '</span>'
        + '<span class="hu-chip' + (lv('alarm') ? ' on' : '') + '">' + (lv('alarm') ? 'Alarm armed' : 'No alarm') + '</span>'
        + '<span class="hu-chip' + (hm.snareArmed ? ' on' : lv('snare') ? ' warn' : '') + '">' + (!lv('snare') ? 'No snare' : hm.snareArmed ? 'Snare armed' : 'Snare spent') + '</span>'
        + '<span class="hu-chip' + (lv('sentry') ? (hm.ammo > 0 ? ' on' : ' warn') : '') + '">' + (!lv('sentry') ? 'No sentry' : hm.ammo > 0 ? 'Sentry ' + hm.ammo + ' shots' : 'Sentry empty') + '</span>'
        + '<span class="hu-chip' + (lv('guard') ? ' on' : '') + '">' + (lv('guard') ? 'Pump guarded' : 'Pump can be leeched') + '</span></div>'
        + '<div class="hu-h">DEFENCES</div>';
      HB.ORDER.filter(id => HB.UPGRADES[id].tab === 'SECURITY').forEach(id => { h += upgradeRow(id); });
      const acts = [];
      if (lv('snare') && !hm.snareArmed) acts.push(['snareRearm', 'Re-arm snare', 'One more root and 10 damage', HB.ACTIONS.snareRearm.cost]);
      if (lv('sentry') && (hm.ammo | 0) < HB.SENTRY.shots) acts.push(['sentryAmmo', 'Sentry ammo', '+' + HB.ACTIONS.sentryAmmo.shots + ' shots', HB.ACTIONS.sentryAmmo.cost]);
      if (acts.length) {
        h += '<div class="hu-h">REFILL</div>';
        acts.forEach(a => { h += '<div class="hu-row"><div class="hu-nm">' + a[1] + '</div><div></div><div class="hu-fx">' + a[2] + '</div><button class="hu-buy" data-f="act-' + a[0] + '" data-act="' + a[0] + '"' + ((st.elixir | 0) >= a[3] ? '' : ' style="opacity:.5"') + '>BUY<i>' + a[3] + '</i></button></div>'; });
      }
      h += '<div class="hu-note" style="margin-top:8px">The lock never stops you, and it is off in sudden death and in the showdown. The sentry fires only while you are away.</div>';
      body.innerHTML = h;
    }
    function renderSend() {
      const cells = (st.map && st.map.cells) || [], sel = pickSend && HB.SENDS[pickSend];
      let gx0 = 99, gy0 = 99, gx1 = -99, gy1 = -99; cells.forEach(c => { gx0 = Math.min(gx0, c.gx); gy0 = Math.min(gy0, c.gy); gx1 = Math.max(gx1, c.gx); gy1 = Math.max(gy1, c.gy); });
      const cols = gx1 - gx0 + 1, rows = gy1 - gy0 + 1, byPos = {}; cells.forEach(c => { byPos[c.gx + ',' + c.gy] = c; });
      let map = '<div class="hu-map" role="grid" aria-label="Target map" style="grid-template-columns:repeat(' + cols + ',1fr);aspect-ratio:' + cols + '/' + rows + '">';
      for (let y = gy0; y <= gy1; y++) for (let x = gx0; x <= gx1; x++) {
        const c = byPos[x + ',' + y]; if (!c) { map += '<div class="hu-cell none"></div>'; continue; }
        const mine = c.key === (st.map && st.map.myRoom) || c.mine, why = sel ? sendCheck(pickSend, c) : null, blocked = why && why !== 'elixir' && why !== 'round1' && why !== 'limit';
        map += '<button class="hu-cell ' + (c.kind || 'arena') + (mine ? ' mine' : '') + (c.dead ? ' dead' : '') + (blocked ? ' no' : '') + (pickRoom === c.key ? ' hot' : '') + '" data-f="cell-' + esc(c.key) + '" data-cell="' + esc(c.key) + '" data-x="' + x + '" data-y="' + y + '"'
          + ' title="' + esc((c.kind === 'home' ? (c.owner ? c.owner + "'s home" : 'Home') : c.kind === 'vault' ? 'The Vault' : 'Room') + (c.label ? ' ' + c.label : '') + (mine ? ' (yours)' : '')) + '"' + (blocked ? ' aria-disabled="true"' : '') + '>' + esc(c.kind === 'vault' ? 'V' : c.label || '') + '</button>';
      }
      map += '</div><div class="hu-legend"><span><b style="background:rgba(245,196,81,.2)"></b>Vault</span><span><b style="border-color:#7fd8ff"></b>You</span><span><b></b>Arena room</span><span><b style="background:rgba(245,196,81,.12)"></b>Home</span></div>';
      let list = '<ul class="hu-sl" role="radiogroup" aria-label="Sendables">';
      HB.SEND_IDS.forEach(id => {
        const d = HB.SENDS[id], why = sendCheck(id, null), hard = why === 'round1' || why === 'limit';
        list += '<li><button class="hu-si" role="radio" aria-checked="' + (pickSend === id) + '" data-f="send-' + id + '" data-send="' + id + '"' + (hard ? ' disabled' : '') + '><span class="n">' + esc(d.name) + '</span><span class="c">' + d.cost + '</span><span class="m">' + esc(d.target === 'home' ? 'Enemy home' : 'Any room') + ', ' + dur(d.ms) + ' - ' + esc(d.fx) + '</span></button></li>';
      });
      list += '</ul>';
      let det;
      if (st.sentRound) det = '<span class="bad">You already sent something this round.</span>';
      else if (HB.FIRST_SEND_ROUND && (st.round | 0) < HB.FIRST_SEND_ROUND) det = '<span class="bad">Sends start in round ' + HB.FIRST_SEND_ROUND + '.</span>';
      else if (!sel) det = 'Pick something to send, then a room on the map. One send per round. Never the Vault, never your own room.';
      else {
        const cell = pickRoom && cellById(pickRoom), why = sendCheck(pickSend, cell || null);
        det = '<b>' + esc(sel.name) + '</b> - ' + sel.cost + ' elixir, ' + dur(sel.ms) + '<br>' + esc(SEND_BLURB[pickSend]) + '<br>Counter: ' + esc(sel.counter) + '.<br>'
          + (cell ? 'Target: <b>' + esc(cell.kind === 'home' ? (cell.owner || 'home') + "'s home" : 'room ' + (cell.label || cell.key)) + '</b>' : '<span class="bad">Pick a target on the map.</span>') + (why && cell ? ' <span class="bad">' + esc(REASON[why] || why) + '</span>' : '');
      }
      const cell = pickRoom && cellById(pickRoom), okGo = sel && cell && !sendCheck(pickSend, cell);
      body.innerHTML = '<div class="hu-send"><div>' + '<div class="hu-h">TARGET</div>' + map + '</div><div><div class="hu-h">SEND<small>elixir ' + (st.elixir | 0) + '</small></div>' + list + '<div class="hu-det">' + det + '</div>'
        + '<button class="hu-buy hu-go" data-f="go" data-go="1"' + (okGo ? '' : ' disabled') + '>' + (okGo ? 'SEND ' + esc(sel.name.toUpperCase()) + '<i>' + sel.cost + '</i>' : 'SEND') + '</button></div></div>';
    }

    // ---- actions
    function doBuy(id, btn) {
      const nx = HB.nextCost(st.home || { lv: {} }, id);
      if (nx == null) return;
      if ((st.elixir | 0) < nx) { shake(btn); say('Not enough elixir: ' + nx + ' needed'); return; }
      send({ base: { buy: id } }); say('Buying ' + HB.UPGRADES[id].name + '...', true);
    }
    function doAct(a, btn) {
      const cost = a === 'distill' ? HB.ACTIONS.distill.cost : a === 'snareRearm' ? HB.ACTIONS.snareRearm.cost : HB.ACTIONS.sentryAmmo.cost;
      if ((st.elixir | 0) < cost) { shake(btn); say('Not enough elixir: ' + cost + ' needed'); return; }
      send({ base: { act: a } });
    }
    function shake(b) { if (!b) return; b.classList.remove('bad'); void b.offsetWidth; b.classList.add('bad'); }
    function doSend() {
      const cell = pickRoom && cellById(pickRoom); if (!pickSend || !cell) return;
      const why = sendCheck(pickSend, cell); if (why) { say(REASON[why] || why); return; }
      send({ base: { send: pickSend, room: cell.key } }); say('Sent. The room has been warned.', true); pickSend = null; pickRoom = null; render();
    }
    function focusCell(cur, dx, dy) {
      const all = [...scr.querySelectorAll('.hu-cell[data-cell]')], x0 = +cur.dataset.x, y0 = +cur.dataset.y; let best = null, bd = 1e9;
      all.forEach(e => { const ex = +e.dataset.x - x0, ey = +e.dataset.y - y0; if (e === cur || (dx && Math.sign(ex) !== dx) || (dy && Math.sign(ey) !== dy)) return; const d = (dx ? Math.abs(ex) : Math.abs(ey)) * 3 + (dx ? Math.abs(ey) : Math.abs(ex)); if (d < bd) { bd = d; best = e; } });
      if (best) best.focus();
    }

    scr.addEventListener('click', e => {
      if (e.target === scr) return close(true);
      const b = e.target.closest('button'); if (!b || !st) return;
      if (b.classList.contains('hu-close')) return close(true);
      const d = b.dataset;
      if (d.tab != null) { tab = +d.tab; render(); }
      else if (d.buy) doBuy(d.buy, b); else if (d.act) doAct(d.act, b);
      else if (d.take != null) send({ lockbox: { take: +d.take } }); else if (d.put != null) send({ lockbox: { put: isNaN(+d.put) ? d.put : +d.put } });
      else if (d.send) { pickSend = pickSend === d.send ? null : d.send; render(); }
      else if (d.cell) { const c = cellById(d.cell), why = pickSend && sendCheck(pickSend, c); if (!pickSend) { pickRoom = d.cell; say('Pick what to send first'); render(); } else if (why && why !== 'elixir') { shake(b); say(REASON[why] || why); } else { pickRoom = d.cell; render(); } }
      else if (d.go) doSend();
    });
    function onKey(e) {
      if (!isOpen) return;
      const k = e.key, a = doc.activeElement, mine = a && scr.contains(a);
      let used = true;
      if (k === 'Escape') close(true);
      else if (k >= '1' && k <= '3') { tab = +k - 1; render(); const t = scr.querySelector('[data-f="tab' + tab + '"]'); if (t) t.focus(); }
      else if ((k === 'ArrowLeft' || k === 'ArrowRight') && a && a.classList.contains('hu-tab')) { tab = (tab + (k === 'ArrowRight' ? 1 : 2)) % 3; render(); scr.querySelector('[data-f="tab' + tab + '"]').focus(); }
      else if (k.indexOf('Arrow') === 0 && mine && a.dataset.cell) focusCell(a, k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0, k === 'ArrowDown' ? 1 : k === 'ArrowUp' ? -1 : 0);
      else if ((k === 'ArrowDown' || k === 'ArrowUp') && mine) {
        const all = [...scr.querySelectorAll('.hu-body button:not(:disabled), .hu-tab')].filter(x => x.offsetParent && (!a.dataset.cell)), i = all.indexOf(a);
        if (all.length) all[(i + (k === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus(); else used = false;
      } else if (k === 'Tab') used = false;
      else if ((k === 'Enter' || k === ' ') && mine && a.tagName === 'BUTTON') { a.click(); }
      else if (k === 'Enter' && tab === 2) doSend();
      else used = false;
      if (used) { e.preventDefault(); e.stopPropagation(); }
      else if (!/^F\d|^Control|^Shift|^Alt|^Meta/.test(k) && k !== 'Tab') e.stopPropagation();   // keep game keys (WASD, E...) from reaching the game while the screen is up
    }
    G.addEventListener('keydown', onKey, true);

    function open(state) {
      if (state) st = state; isOpen = true; scr.classList.add('on'); say('');
      render(); const first = scr.querySelector('.hu-tab[aria-selected=true]'); if (first) first.focus();
    }
    function close(notify) {
      if (!isOpen) return; isOpen = false; scr.classList.remove('on');
      if (notify && typeof opts.onClose === 'function') opts.onClose();
    }
    function update(state) {
      st = state; if (state && state.elixir != null) setElixir(state.elixir, state.cap);
      if (isOpen) render();
    }
    function result(r) {   // optional: server reply {ok, reason}. Shows a one-line message in the panel footer.
      if (!r) return; say(r.ok ? (r.text || '') : (REASON[r.reason] || r.reason || 'Refused'), !!r.ok);
    }
    return { open, close, update, setElixir, toast, result, isOpen: () => isOpen, el: scr, _setTab: i => { tab = i; if (isOpen) render(); } };
  }
  return { createHomeUI, CSS };
});

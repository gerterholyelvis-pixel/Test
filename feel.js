// Goblin King "feel" layer: sound hooks, interaction prompts, round banner, head bob / sprint FOV kick, fade, disconnect overlay.
// Plain script loaded BEFORE game.js (so it can add setting defaults); it talks to the game through GK.feelApi (see the FEEL block in game.js)
// and is called from game.js through GK.feel.onMsg / tick / camera / onClose.
(function () {
  'use strict';
  const GK = window.GK = window.GK || {};
  const AU = () => window.GKAUDIO;
  const play = (n, o) => { try { const a = AU(); a && a.play(n, o); } catch (e) {} };

  // ---- settings defaults (game.js merges these into GK.settings, menu.js persists them) ----
  GK.feelDefaults = { vol: 0.8, sfx: 0.9, amb: 0.5, bob: true };
  GK.settings = Object.assign({}, GK.feelDefaults, GK.settings || {});
  GK.claimedRooms = new Set();   // chest-room ids this player has already emptied (server: claimed:{room}); drives prompts and the map marks

  const api = () => GK.feelApi || null;
  const css = document.createElement('style');
  css.textContent =
    '#gkPrompt{position:fixed;left:50%;top:calc(50% + 44px);transform:translateX(-50%);z-index:25;pointer-events:none;display:flex;align-items:center;gap:9px;padding:6px 15px 6px 8px;border-radius:9px;background:rgba(10,10,16,.68);border:1px solid rgba(255,215,94,.4);font:600 15px/1 system-ui,sans-serif;color:#f2efe6;letter-spacing:.03em;text-shadow:0 1px 3px #000;opacity:0;transition:opacity .14s}' +
    '#gkPrompt.low{top:auto;bottom:calc(2.5vh + 150px)}#gkPrompt.on{opacity:1}#gkPrompt b{display:inline-block;min-width:24px;text-align:center;padding:4px 7px;border-radius:5px;background:#ffd75e;color:#1a1405;font-weight:800;box-shadow:0 2px 0 #a8741a}' +
    '#gkBanner{position:fixed;left:0;right:0;top:19%;z-index:31;pointer-events:none;display:none;justify-content:center}' +
    '#gkBanner div{padding:10px 40px 12px;font:900 clamp(22px,4vw,44px)/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#ffe9a8;text-shadow:0 0 18px #ff9a00,0 3px 10px #000;background:linear-gradient(90deg,transparent,rgba(12,8,2,.78) 18%,rgba(12,8,2,.78) 82%,transparent);border-top:2px solid rgba(255,200,70,.55);border-bottom:2px solid rgba(255,200,70,.55)}' +
    '#gkFade{position:fixed;inset:0;z-index:9;background:#000;opacity:0;pointer-events:none}' +
    '#gkLost{position:fixed;inset:0;z-index:200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.78);font-family:system-ui,sans-serif;color:#f2efe6}' +
    '#gkLost .c{width:min(460px,92vw);padding:28px 32px 26px;border-radius:16px;background:rgba(14,10,12,.9);border:1px solid rgba(255,90,74,.5);box-shadow:0 10px 60px rgba(0,0,0,.7);text-align:center}' +
    '#gkLost h2{margin:0 0 6px;color:#ff5a4a;font-size:clamp(28px,5vw,42px);letter-spacing:.08em;text-shadow:0 0 22px rgba(255,60,40,.45)}' +
    '#gkLost p{margin:0 0 20px;color:#b9b4ae;font-size:14px;letter-spacing:.04em}#gkLost .r{display:flex;gap:12px}' +
    '#gkLost button{flex:1;padding:13px 10px;border-radius:10px;font:800 15px system-ui,sans-serif;letter-spacing:.08em;cursor:pointer;text-transform:uppercase}' +
    '#gkLost .go{border:0;background:linear-gradient(180deg,#ffd75e,#e0a82a);color:#1a1405}#gkLost .no{border:1px solid rgba(255,255,255,.3);background:transparent;color:#f2efe6}';
  document.head.appendChild(css);
  const mk = (tag, id, parent) => { const e = document.createElement(tag); if (id) e.id = id; (parent || document.body).appendChild(e); return e; };

  // ---- menu UI sounds (hover / click) ----
  const UI_SEL = 'button,.mbtn,.cplay,.ccard,input[type=range],input[type=checkbox],label';
  let lastHover = null;
  document.addEventListener('mouseover', e => {
    const el = e.target.closest && e.target.closest(UI_SEL);
    if (el === lastHover) return; lastHover = el;
    if (el && (GK.mode !== 'play' || el.closest('#gkLost'))) play('uiHover');
  }, true);
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest(UI_SEL);
    if (el && (GK.mode !== 'play' || el.closest('#gkLost'))) play('uiClick');
  }, true);
  document.addEventListener('change', e => { if (e.target && e.target.type === 'range') play('uiClick'); }, true);

  addEventListener('keydown', e => {   // E on a control-panel button: click sound (the game sends the door vote)
    if (e.code !== 'KeyE' || e.repeat || GK.mode !== 'play') return;
    const A = api(); if (A && A.cpAim && !A.invOpen && !A.shopOpen) play('panel');
  });

  // ---- state ----
  let lastMode = 'menu', lastInv = false, lastShop = false, lastN = 0, lastOpenLen = 0, lastSec = 99, lastGold = null, lastPanel = false;
  let stepAcc = 0, kick = 0, lost = false, unloading = false, doorP = new Map();
  let flinch = 0, beatT = 0, lastW, lastA, sudT = 0, sudden = false;
  const surfOf = key => key === '4' ? 'vault' : key && key[0] === 'c' ? 'rug' : 'stone';   // vault: echoing hall, chest rooms: rugs, the rest: stone
  const famOf = k => { const I = window.GKITEMS && window.GKITEMS.ITEMS; return (k && I && I[k] && I[k].family) || null; };
  addEventListener('beforeunload', () => { unloading = true; });

  // ---- interaction prompt ----
  const promptEl = mk('div', 'gkPrompt'); promptEl.innerHTML = '<b>E</b><span></span>';
  const promptTxt = promptEl.lastChild; let promptNow = '';
  let promptLow = false;
  function setPrompt(t, low) { low = !!low; if (low !== promptLow) { promptLow = low; promptEl.classList.toggle('low', low); } if (t === promptNow) return; promptNow = t; if (t) promptTxt.textContent = t; promptEl.classList.toggle('on', !!t); }   // low: aiming at a door panel, the prompt sits above the hotbar so it never covers the panel's rows
  function promptFor(A) {
    if (A.cpAim) return 'Select door';
    const h = A.hover();
    if (h && h.room >= 0) return h.kind === 'r' ? 'Use recycler' : h.kind === 'w' ? 'Use crafting bench' : 'Trade with merchant';
    if (A.nearestPile()) return 'Loot bag';
    const key = A.roomKeyAt(A.P.x, A.P.z);
    if (key && key[0] === 'c') {
      const id = +key.slice(1), cr = A.CHEST_ROOMS[id];
      if (!cr || GK.claimedRooms.has(id)) return '';
      if (cr.type === 'chest') return 'Open chest';
      if (cr.type === 'mystery') { const k = cr.mystery && cr.mystery.kind; if (k === 'weapon' || k === 'armor' || k === 'gold') return 'Search mystery room'; }
    }
    return '';
  }

  // ---- round banner ----
  const bannerEl = mk('div', 'gkBanner'); bannerEl.appendChild(document.createElement('div'));
  function banner(text) {
    const inner = bannerEl.firstChild; inner.textContent = text; bannerEl.style.display = 'flex';
    if (bannerEl._a) try { bannerEl._a.cancel(); } catch (e) {}
    const a = inner.animate([
      { transform: 'translateX(-70vw)', opacity: 0 },
      { transform: 'translateX(0)', opacity: 1, offset: 0.16, easing: 'ease-out' },
      { transform: 'translateX(0)', opacity: 1, offset: 0.78 },
      { transform: 'translateX(70vw)', opacity: 0 }], { duration: 2800, easing: 'cubic-bezier(.2,.8,.2,1)' });
    bannerEl._a = a; a.onfinish = () => { if (bannerEl._a === a) bannerEl.style.display = 'none'; };
  }

  // ---- fade (wheel -> play) ----
  const fadeEl = mk('div', 'gkFade');
  function dip() {
    try { fadeEl.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 1100, easing: 'ease-in-out' }); } catch (e) {}
  }
  let hooked = false;
  function hookGK() {   // wrap GK.enter / GK.applySettings once game.js has defined them
    if (hooked || !GK.enter || !GK.applySettings) return; hooked = true;
    const enter = GK.enter; GK.enter = function () { dip(); play('gong', { vol: 0.5 }); return enter.apply(this, arguments); };
    const ap = GK.applySettings; GK.applySettings = function () { const r = ap.apply(this, arguments); try { AU() && AU().refresh(); } catch (e) {} return r; };
  }
  const iv = setInterval(() => { hookGK(); if (hooked) clearInterval(iv); }, 100);

  // ---- disconnect overlay ----
  function showLost() {
    if (lost || unloading) return; lost = true;
    try { document.exitPointerLock && document.exitPointerLock(); } catch (e) {}
    const el = mk('div', 'gkLost');
    el.innerHTML = '<div class="c"><h2>Connection lost</h2><p>The link to the server was closed.</p><div class="r"><button class="go" id="gkRecon">Reconnect</button><button class="no" id="gkMenu">Main menu</button></div></div>';
    document.getElementById('gkRecon').onclick = () => { try { sessionStorage.setItem('gk.requeue', '1'); } catch (e) {} location.reload(); };
    document.getElementById('gkMenu').onclick = () => location.reload();
    document.getElementById('gkRecon').focus(); play('deny');
  }

  // ---- the hooks called by game.js ----
  GK.feel = {
    onClose() { showLost(); },
    onMsg(d) {
      if (!d) return;
      const A = api();
      if (d.layout || d.claimedReset) { GK.claimedRooms.clear(); }
      if (d.claimed && Number.isInteger(d.claimed.room)) {
        GK.claimedRooms.add(d.claimed.room);
        play('chest'); if (d.claimed.key) setTimeout(() => play('pickup'), 380);
        try { GK.redrawMaps && GK.redrawMaps(); } catch (e) {}
      }
      if (d.claimFail) {
        if (d.claimFail === 'taken' && A) { const key = A.roomKeyAt(A.P.x, A.P.z); if (key && key[0] === 'c') { GK.claimedRooms.add(+key.slice(1)); try { GK.redrawMaps && GK.redrawMaps(); } catch (e) {} } }
        if (d.claimFail !== 'room') play('deny');
      }
      if (d.gold != null) {
        if (lastGold != null && d.gold > lastGold) play('coins');
        else if (lastGold != null && d.gold < lastGold && A && A.panelKind === 'shop') play('buy');
        lastGold = d.gold;
      }
      if (d.crafted) play('craft');
      if (d.recycled) play('recycle');
      if (d.ate) play('eat');
      if (d.buyFail || d.craftFail || d.recycleFail || d.lootFail) play('deny');
    },
    tick(dt, now) {
      const A = api(); if (!A) return;
      const mode = GK.mode, a = AU();
      if (mode !== lastMode) { if (mode === 'dead') play('death'); else if (mode === 'win') play('victory'); lastMode = mode; }
      if (lost) A.keys.clear();
      if (mode !== 'play') { setPrompt(''); a && a.ambient(null); return; }
      const P = A.P, mine = A.actors.get(A.me), myKey = A.roomKeyAt(P.x, P.z);
      a && a.setListener(P.x, P.z, P.yaw);
      sudT -= dt; if (sudT <= 0) { sudT = 1; sudden = !!document.getElementById('gkSudTag'); }
      a && A.spawned && a.ambient(sudden ? 'sudden' : myKey === '4' ? 'vault' : myKey && myKey[0] === 'c' ? 'chest' : 'room');
      // low health: a soft heartbeat that quickens as it gets worse (the sound is dropped first when busy)
      if (mine && mine.hp > 0 && mine.maxHp > 0 && A.spawned) {
        const fr = mine.hp / mine.maxHp;
        if (fr < 0.3) { beatT -= dt; if (beatT <= 0) { beatT = 0.75 + fr * 2.2; play('heartbeat', { amt: 1 - fr * 2 }); } } else beatT = 0;
      } else beatT = 0;
      // equipping: a rustle or a blade being drawn, picked by item family (also covers items other systems add)
      const inv0 = A.inv;
      if (inv0) {
        if (lastW !== undefined && inv0.weapon !== lastW && inv0.weapon) play('equip', { fam: famOf(inv0.weapon), vol: 0.7 });
        if (lastA !== undefined && inv0.armor !== lastA && inv0.armor) play('equip', { armor: famOf(inv0.armor), vol: 0.7 });
        lastW = inv0.weapon || null; lastA = inv0.armor || null;
      }
      // inventory and station panels
      const inv = A.invOpen, shop = A.shopOpen;
      if (inv !== lastInv) { play(inv ? 'invOpen' : 'invClose'); lastInv = inv; }
      if (shop !== lastShop) { play(shop ? 'invOpen' : 'invClose'); lastShop = shop; }
      // my footsteps, timed by distance walked (so sprinting steps faster)
      const sprint = A.keys.has('ShiftLeft') || A.keys.has('ShiftRight');
      if (A.spawned && !inv && !shop && P.speed > 0.7) {
        stepAcc += P.speed * dt;
        const stride = 1.75;
        if (stepAcc >= stride) { stepAcc -= stride; const sc = (GK.SCALE && mine && GK.SCALE[mine.goblin]) || 1; play('step', { vol: sprint && P.speed > 4.2 ? 0.95 : 0.8, pitch: 1.1 - 0.2 * (sc - 1), surf: surfOf(myKey), sprint: sprint && P.speed > 4.2 }); }
      } else stepAcc = Math.min(stepAcc, 0.9);
      // other players' footsteps: panned and attenuated by distance, muffled through walls
      for (const [id, o] of A.actors) {
        if (id === A.me || !(o.speed > 0.8)) continue;
        o._fs = (o._fs || 0) + o.speed * dt;
        if (o._fs >= 1.8) { o._fs -= 1.8; const sc = (GK.SCALE && GK.SCALE[o.goblin]) || 1; play('step', { x: o.x, z: o.z, pitch: 1.1 - 0.2 * (sc - 1), muffle: A.roomKeyAt(o.x, o.z) !== myKey, surf: surfOf(A.roomKeyAt(o.x, o.z)), sprint: o.speed > 4.2 }); }
      }
      // doors start moving
      for (const d of A.doors) {
        const prev = doorP.get(d);
        if (prev !== undefined && prev <= 0.0005 && d.p > 0.0005) play(d.slide ? 'door' : 'vaultDoor', { x: d.gx, z: d.gz });
        doorP.set(d, d.p);
      }
      // round: last-5-seconds tick, change gong and banner
      const R = GK.roundInfo ? GK.roundInfo() : null;
      if (R && R.n > 0) {
        const secs = Math.ceil(R.left / 1000);
        if (R.left > 0 && secs <= 5) { if (secs !== lastSec) { lastSec = secs; play(secs === 1 ? 'tickLast' : 'tick'); } } else lastSec = 99;
        if (R.n !== lastN) {
          const first = lastN === 0, opened = (R.open ? R.open.length : 0) - lastOpenLen;
          lastN = R.n; lastOpenLen = R.open ? R.open.length : 0;
          banner('Round ' + R.n + ' · ' + (first ? 'Pick a door' : opened > 0 ? 'Doors open' : R.fizzled && R.fizzled.length ? 'The vault stays sealed' : 'No doors opened'));
          play('gong');
        } else lastOpenLen = R.open ? R.open.length : 0;
      }
      // sprint FOV kick eases in and out
      kick += ((sprint && P.speed > 4.2 && A.spawned ? 5 : 0) - kick) * Math.min(1, dt * 5);
      setPrompt(A.spawned && A.inside && !inv && !shop ? promptFor(A) : '', A.cpAim);
    },
    hurt(dmg, max) { flinch = Math.max(flinch, Math.min(1, 0.35 + 1.4 * (dmg || 0) / (max || 100))); },   // called by game.js when I take a hit: a short head flinch
    itemUsed(item, action) { play(window.GKAUDIO.itemSound(item, action || 'use'), { fam: item && item.family, armor: item && item.type === 'armor' ? item.family : undefined }); },   // hook for consumables and other new items
    camera(cam, dt, mine) {   // called after game.js positioned the camera: FOV kick and a whisper of side sway
      cam.fov += kick;
      if (flinch > 0.002) { cam.rotation.x -= 0.03 * flinch; cam.rotation.z += 0.012 * flinch * Math.sin(flinch * 9); flinch *= Math.pow(0.0008, dt); }   // quick, small, settles in ~0.3 s
      if (GK.settings.bob !== false && mine && GK.feelApi) {
        const walk = Math.max(0, Math.min(1, GK.feelApi.P.speed / 3.5));
        cam.rotation.z = Math.sin(mine.phase * 0.5) * 0.004 * walk;
      }
    }
  };
  GK.feel.banner = banner;   // test hook
})();

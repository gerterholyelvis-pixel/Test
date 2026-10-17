/* baseactui.js - client side of the base activities (docs/reports/base-activities.md): the E prompts at the home props, the timed job overlay,
   the round-goals checklist card and the lookout read-out. Rules, caps and the cue generator are baseact.js (shared with the server).
   Browser global: GKBASEUI.create({ send, snd, toast, me, home, active, inHome, alive, lock:{open, close}, fx, world }) -> { prompt, key, onMsg, tick, reset, isOpen, state }.
     me()      -> { x, z, yaw }           my position (world metres) and view yaw (forward = -sin, -cos)
     home()    -> 'c12' | null            the key of my home room
     active()  -> bool                    true when E may start something (playing, spawned, no other panel, standing in my home)
     inHome()  -> bool                    standing inside my home (the checklist card shows only there)
     alive()   -> bool                    still in a running match (an open job is dropped when it turns false)
     lock      { open(), close() }        game.js frees / re-takes the mouse and stops movement while the overlay is up
     fx(name, v)                          'spin' kicks the crank wheel in the art; 'board' (state) repaints the goals board and the trophy cups
   Messages out: {ba:{start:job}} {ba:{done:job, hits:[ms*8+keyIndex..]}} (BA.encode) {ba:{cancel:1}} {ba:{look:1}} {ba:{claim:1}} {ba:{sync:1}}.
   Messages in : {ba: snapshot} {baStart:{job, seed, dur}} {baRes:{ok, text, job?, score?, max?, hit?, trophy?}} {baLook:{outside, near, home, shut, round}}. */
(function (g, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(g); else g.GKBASEUI = factory(g); })(typeof window !== 'undefined' ? window : globalThis, function (G) {
  'use strict';
  const BA = G.GKBASEACT || (typeof require === 'function' ? require('./baseact.js') : null);
  const JOB_OF = {}; if (BA) for (const id of BA.JOB_IDS) JOB_OF[BA.JOBS[id].anchor] = id;
  const KEYS = {   // event.code -> the key letter a job understands
    x: { Space: 'x', Enter: 'x', KeyE: 'x' },
    L: { ArrowLeft: 'L', KeyA: 'L' }, R: { ArrowRight: 'R', KeyD: 'R' }, U: { ArrowUp: 'U', KeyW: 'U' }, D: { ArrowDown: 'D', KeyS: 'D' },
  };
  function keyOf(code, job) {   // pure: which job key does this event.code press (or '')
    const j = BA && BA.JOBS[job]; if (!j) return '';
    for (const k of j.keys) { const m = KEYS[k]; if (m && m[code]) return m[code]; }
    return '';
  }
  const CSS = `
.ba-card{position:fixed;left:12px;top:92px;z-index:19;width:240px;padding:9px 12px 8px;border-radius:10px;background:rgba(14,10,6,.74);border:1px solid rgba(245,196,81,.38);color:#efe9d8;font:600 13px/1.3 var(--ui,'Barlow Condensed','Arial Narrow',system-ui,sans-serif);pointer-events:none;zoom:var(--uis,1);display:none}
.ba-card b.h{display:block;letter-spacing:.16em;font-size:12px;color:#f5c451;margin-bottom:4px}
.ba-card .r{display:flex;gap:7px;align-items:flex-start;margin:2px 0}.ba-card .r i{flex:none;width:13px;height:13px;margin-top:2px;border:2px solid #a9a493;border-radius:3px;position:relative}
.ba-card .r.d{color:#8fbf8f;text-decoration:line-through}.ba-card .r.d i{border-color:#6fd08a;background:#6fd08a}.ba-card .r em{margin-left:auto;font-style:normal;color:#a9a493}
.ba-card .f{margin-top:5px;font-size:12px;color:#a9a493}.ba-card .f.go{color:#ffe39a}
.ba-ov{position:fixed;inset:0;z-index:57;display:none;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,rgba(30,22,6,.55),rgba(0,0,0,.84));zoom:var(--uis,1);font-family:var(--ui,'Barlow Condensed','Arial Narrow',system-ui,sans-serif);color:#efe9d8;user-select:none}
.ba-box{--c:#f5c451;width:min(680px,94vw);padding:14px 16px 12px;border-radius:14px;background:linear-gradient(#26190c,#150f08);border:2px solid var(--c);box-shadow:0 0 40px rgba(0,0,0,.7)}
.ba-box h2{margin:0;font-size:26px;letter-spacing:.12em;text-transform:uppercase;color:var(--c)}.ba-box p{margin:2px 0 8px;font-size:16px;color:#cfc8b4}
.ba-box canvas{display:block;width:100%;height:auto;border-radius:10px;background:#0c0905;cursor:pointer}
.ba-box .ft{display:flex;justify-content:space-between;margin-top:8px;font-size:15px;color:#a9a493}.ba-box .ft b{color:var(--c)}`;

  function create(o) {
    const doc = o.doc || G.document, W = o.world || G.GKWORLD;
    let st = null, sess = null, ov = null, card = null, cv = null, ctx = null, titleEl, hintEl, footL, footR, raf = 0, pending = '', syncAt = 0, lastShow = false, closeT = 0;
    const snd = (n, a) => { try { o.snd && o.snd(n, a); } catch (e) {} };
    const toast = (k, t) => { try { o.toast && o.toast(k, t); } catch (e) {} };
    const send = m => { try { o.send(m); } catch (e) {} };
    const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const secs = ms => Math.ceil(ms / 1000);

    // ---- the props I can use: nearest one within reach that I roughly face
    function anchorOf(kind) {
      const key = o.home && o.home(); if (!key || !W) return null;
      const c = W.CHEST[+key.slice(1)], a = W.HOME_LAYOUT && W.HOME_LAYOUT[kind]; if (!c || !a) return null;
      return W.attLocal(c, a[0], a[1]);
    }
    function aim() {
      if (sess || !o.active()) return null;
      const me = o.me(), fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw); let best = null, bs = -1e9;
      for (const kind of BA.ANCHORS) {
        const a = anchorOf(kind); if (!a) continue;
        const dx = a[0] - me.x, dz = a[1] - me.z, d = Math.hypot(dx, dz); if (d > BA.CFG.PROMPT_REACH) continue;
        const dot = d < 0.05 ? 1 : (dx * fx + dz * fz) / d; if (dot < 0.78) continue;
        const s = dot - d * 0.15; if (s > bs) { bs = s; best = { kind, d }; }
      }
      return best;
    }
    function textOf(kind) {
      const id = JOB_OF[kind];
      if (id) {
        const j = BA.JOBS[id], cd = st ? st.cd[id] : 0;
        if (st && st.cap[id] <= 0) return j.short + ': nothing more to gain this round';
        if (cd > 0) return j.short + ' (again in ' + secs(cd) + ' s)';
        return j.name + ' for ' + j.pay;
      }
      if (kind === 'board') return !st ? 'Read the round goals' : st.claimed ? 'Goals done, your trophy is up' : st.ready ? 'Claim the goal reward' : 'Round goals: ' + st.goals.filter(x => x.done).length + ' of 3 done';
      if (kind === 'window') return st && st.look > 0 ? 'Look out of the window (' + secs(st.look) + ' s)' : 'Look out of the window';
      return '';
    }
    const prompt = () => { const a = aim(); return a ? textOf(a.kind) : ''; };
    function act(kind) {
      const id = JOB_OF[kind];
      if (id) {
        const j = BA.JOBS[id];
        if (st && st.cap[id] <= 0) { toast('info', 'Nothing more to gain from the ' + j.short.toLowerCase() + ' this round'); snd('deny', { vol: 0.5 }); return; }
        if (st && st.cd[id] > 0) { toast('info', j.short + ' again in ' + secs(st.cd[id]) + ' s'); snd('deny', { vol: 0.5 }); return; }
        pending = id; send({ ba: { start: id } }); return;
      }
      if (kind === 'window') { send({ ba: { look: 1 } }); return; }
      if (kind === 'board') {
        if (st && st.ready) { send({ ba: { claim: 1 } }); return; }
        if (st) toast('info', st.claimed ? 'Round reward claimed. Next round brings new goals' : st.goals.map(x => (x.done ? 'done: ' : x.have + '/' + x.need + ' ') + x.text).join('. '));
        else send({ ba: { sync: 1 } });
      }
    }
    function key() { const a = aim(); if (!a) return false; act(a.kind); return true; }

    // ---- the checklist card
    function mkDom() {
      if (card || !doc) return;
      const s = doc.createElement('style'); s.textContent = CSS; doc.head.appendChild(s);
      card = doc.createElement('div'); card.className = 'ba-card'; doc.body.appendChild(card);
      ov = doc.createElement('div'); ov.className = 'ba-ov'; ov.innerHTML = '<div class="ba-box"><h2></h2><p></p><canvas width="640" height="230"></canvas><div class="ft"><span></span><span></span></div></div>';
      doc.body.appendChild(ov); cv = ov.querySelector('canvas'); ctx = cv.getContext && cv.getContext('2d');
      titleEl = ov.querySelector('h2'); hintEl = ov.querySelector('p'); const sp = ov.querySelectorAll('.ft span'); footL = sp[0]; footR = sp[1];
      cv.addEventListener('mousedown', e => { if (!sess || sess.done) return; const r = cv.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, j = BA.JOBS[sess.job]; e.preventDefault(); if (j.keys === 'x') hit('x'); else if (j.keys === 'LR') hit(fx < 0.5 ? 'L' : 'R'); });
      G.addEventListener('keydown', onKey, true);
    }
    function paintCard() {
      if (!card) return;
      const show = !!st && !sess && o.inHome() && o.alive();
      if (!show) { if (lastShow) { card.style.display = 'none'; lastShow = false; } return; }
      let h = '<b class="h">ROUND ' + st.r + ' GOALS</b>';
      for (const gl of st.goals) h += '<div class="r' + (gl.done ? ' d' : '') + '"><i></i><span>' + gl.text + '</span><em>' + (gl.done ? '' : gl.have + '/' + gl.need + (gl.id === 'good' ? '%' : '')) + '</em></div>';
      h += st.claimed ? '<div class="f">Reward claimed. Trophies: ' + st.trophies + '</div>' : st.ready ? '<div class="f go">All done! Press E at the board (west wall)</div>' : '<div class="f">Reward: ' + st.gold + ' gold and a trophy. Jobs: crank wheel, anvil, scrap bin, dummy</div>';
      card.innerHTML = h; card.style.display = 'block'; lastShow = true;
    }
    const boardState = () => st && { goals: st.goals, claimed: !!st.claimed, ready: !!st.ready, gold: st.gold, trophies: st.trophies };

    // ---- the job overlay
    function begin(b) {
      if (!BA.JOBS[b.job]) return;
      mkDom(); const j = BA.JOBS[b.job]; pending = '';
      sess = { job: b.job, seed: b.seed, dur: b.dur, cues: BA.cues(b.job, b.seed), t0: nowMs(), inputs: [], res: new Array(BA.JOBS[b.job].n).fill(0), flash: [], sent: false, done: false, text: '', doneAt: 0, combo: 0 };
      ov.querySelector('.ba-box').style.setProperty('--c', j.col); titleEl.textContent = j.name; hintEl.textContent = j.hint;
      footL.innerHTML = 'Esc to give up'; footR.innerHTML = '';
      ov.style.display = 'flex'; if (o.lock) o.lock.open(); snd('panel', { vol: 0.5 });
      if (!raf) raf = (G.requestAnimationFrame || (f => setTimeout(f, 16)))(loop);
    }
    function close() {
      if (!sess) return; sess = null; if (ov) ov.style.display = 'none'; if (o.lock) o.lock.close(); paintCard();
    }
    function cancel() { if (sess && !sess.sent) send({ ba: { cancel: 1 } }); close(); }
    function hit(k) {
      const s = sess; if (!s || s.done || s.sent) return;
      const t = Math.round(nowMs() - s.t0); if (t > s.dur + 200 || s.inputs.length >= BA.JOBS[s.job].n * 3) return;
      s.inputs.push([t, k]);
      const r = BA.score(s.job, s.cues, s.inputs); let got = 0, gi = -1;
      for (let i = 0; i < r.hit.length; i++) if (r.hit[i] > s.res[i]) { got = r.hit[i]; gi = i; }
      s.res = r.hit; const j = BA.JOBS[s.job], p = 0.9 + Math.min(0.5, s.combo * 0.04);
      if (got) { s.combo++; s.flash.push({ at: nowMs(), txt: got === 2 ? 'PERFECT' : 'GOOD', col: got === 2 ? '#ffe27a' : '#9fe8b0', i: gi }); }
      else { s.combo = 0; s.flash.push({ at: nowMs(), txt: 'miss', col: '#ff7a66', i: -1 }); }
      snd(!got ? 'baMiss' : s.job === 'tune' ? 'baAnvil' : s.job === 'sort' ? 'baSort' : 'baStrike', { pitch: p, vol: 0.9 });
      if (got === 2) snd('baPerfect', { vol: 0.35 });
      if (s.job === 'crank' && o.fx) o.fx('spin', got ? 6 : 2);
    }
    function onKey(e) {
      if (!ov || !sess) return;
      const c = e.code;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      if (c === 'Escape') { cancel(); return; }
      if (sess.done) { if (nowMs() - sess.doneAt > 500 && (c === 'KeyE' || c === 'Space' || c === 'Enter')) close(); return; }
      const k = keyOf(c, sess.job); if (k) hit(k);
    }
    // text/shape drawing helpers
    const ARROW = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
    function arrow(c, k, x, y, r, col) {
      const [dx, dy] = ARROW[k]; c.save(); c.translate(x, y); c.fillStyle = col; c.beginPath();
      c.moveTo(dx * r, dy * r); c.lineTo(-dy * r * 0.9 - dx * r * 0.6, dx * r * 0.9 - dy * r * 0.6); c.lineTo(dy * r * 0.9 - dx * r * 0.6, -dx * r * 0.9 - dy * r * 0.6); c.closePath(); c.fill(); c.restore();
    }
    function draw(el) {
      const s = sess, c = ctx, W2 = cv.width, H2 = cv.height, j = BA.JOBS[s.job]; if (!c) return;
      c.clearRect(0, 0, W2, H2); c.fillStyle = '#0f0b06'; c.fillRect(0, 0, W2, H2);
      c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, 0, W2, 6); c.fillStyle = j.col; c.fillRect(0, 0, W2 * Math.max(0, Math.min(1, el / s.dur)), 6);
      const pts = s.res.reduce((a, b) => a + b, 0);
      if (j.type === 'rhythm') {
        const RX = 120, SP = 0.34, LY = 120;
        c.fillStyle = 'rgba(255,255,255,.06)'; c.fillRect(0, LY - 34, W2, 68);
        c.strokeStyle = j.col; c.lineWidth = 4; c.globalAlpha = 0.9; c.beginPath(); c.arc(RX, LY, 34, 0, 6.3); c.stroke(); c.globalAlpha = 1;
        s.cues.forEach((q, i) => {
          const x = RX + (q.t - el) * SP; if (x < -30 || x > W2 + 30) return;
          const res = s.res[i], past = el > q.t + j.good, col = res === 2 ? '#ffe27a' : res === 1 ? '#9fe8b0' : past ? '#5a4a40' : '#f2efe6';
          c.globalAlpha = res || past ? 0.55 : 1; c.fillStyle = col;
          if (j.keys === 'x') { c.beginPath(); c.arc(x, LY, 22, 0, 6.3); c.fill(); c.fillStyle = '#1a1208'; c.beginPath(); c.arc(x, LY, 12, 0, 6.3); c.fill(); }
          else { c.beginPath(); c.arc(x, LY, 25, 0, 6.3); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill(); arrow(c, q.k, x, LY, 20, col); }
          c.globalAlpha = 1;
        });
      } else {   // sort
        const idx = s.cues.findIndex(q => el < q.t + j.gap), q = idx >= 0 ? s.cues[idx] : null, wood = '#b88a4a', iron = '#9aa0a6';
        c.fillStyle = 'rgba(184,138,74,.2)'; c.fillRect(14, 40, 150, 150); c.fillStyle = 'rgba(154,160,166,.2)'; c.fillRect(W2 - 164, 40, 150, 150);
        c.fillStyle = wood; c.font = '800 24px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText('A  TIMBER', 89, 120); c.fillStyle = iron; c.fillText('METAL  D', W2 - 89, 120);
        if (q && el >= q.t - 10) {
          const left = 1 - (el - q.t) / j.gap, name = BA.itemName(q);
          c.fillStyle = q.k === 'L' ? wood : iron; if (q.k === 'L') c.fillRect(W2 / 2 - 70, 80, 140, 36); else { c.beginPath(); c.arc(W2 / 2, 98, 30, 0, 6.3); c.fill(); c.fillStyle = '#0f0b06'; c.beginPath(); c.arc(W2 / 2, 98, 11, 0, 6.3); c.fill(); }
          c.fillStyle = '#f2efe6'; c.font = '800 30px system-ui,sans-serif'; c.fillText(name, W2 / 2, 160);
          c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(W2 / 2 - 110, 176, 220, 8); c.fillStyle = left > 0.55 ? '#9fe8b0' : '#ffb060'; c.fillRect(W2 / 2 - 110, 176, 220 * Math.max(0, left), 8);
        } else { c.fillStyle = '#cfc8b4'; c.font = '700 26px system-ui,sans-serif'; c.fillText(el < 0 ? '' : 'Get ready', W2 / 2, 110); }
        s.cues.forEach((qq, i) => { const x = W2 / 2 - (s.cues.length - 1) * 14 + i * 28, r2 = s.res[i]; c.fillStyle = r2 === 2 ? '#ffe27a' : r2 === 1 ? '#9fe8b0' : el > qq.t + j.gap ? '#8a3a30' : 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(x, 210, 7, 0, 6.3); c.fill(); });
      }
      const nw = nowMs(); s.flash = s.flash.filter(f => nw - f.at < 650);
      for (const f of s.flash) { const a = 1 - (nw - f.at) / 650; c.globalAlpha = a; c.fillStyle = f.col; c.font = '800 28px system-ui,sans-serif'; c.textAlign = 'center'; c.fillText(f.txt, 120, 60 - (1 - a) * 16); c.globalAlpha = 1; }
      c.textAlign = 'left'; c.fillStyle = '#f2efe6'; c.font = '800 20px system-ui,sans-serif'; c.fillText(pts + ' / ' + BA.maxScore(s.job), W2 - 110, 28);
      if (s.done) { c.fillStyle = 'rgba(8,6,3,.78)'; c.fillRect(0, 0, W2, H2); c.textAlign = 'center'; c.fillStyle = s.ok ? '#ffe27a' : '#ff9a88'; c.font = '800 34px system-ui,sans-serif'; c.fillText(s.ok ? (s.score / s.max >= 0.85 ? 'Excellent!' : s.score / s.max >= 0.5 ? 'Well done' : 'Keep practising') : 'Not counted', W2 / 2, 90); c.fillStyle = '#f2efe6'; c.font = '700 24px system-ui,sans-serif'; c.fillText(s.ok ? s.score + ' of ' + s.max + ' points' : '', W2 / 2, 128); c.fillStyle = '#cfc8b4'; c.font = '700 21px system-ui,sans-serif'; c.fillText(s.text, W2 / 2, 168); c.textAlign = 'left'; }
    }
    function loop() {
      raf = 0; const s = sess; if (!s) return;
      if (!o.alive()) { close(); return; }
      const el = nowMs() - s.t0; draw(el);
      if (!s.done) {
        if (!s.sent && el >= s.dur + 40) { s.sent = true; send({ ba: { done: s.job, hits: BA.encode(s.inputs) } }); footL.innerHTML = 'Scoring...'; s.sentAt = nowMs(); }
        if (s.sent && nowMs() - s.sentAt > 5000) { toast('info', 'The job was not counted (no answer)'); close(); return; }
      } else {
        footL.innerHTML = '<b>E</b> close'; if (nowMs() - s.doneAt > 6000) { close(); return; }
      }
      raf = (G.requestAnimationFrame || (f => setTimeout(f, 16)))(loop);
    }
    function result(r) {
      const s = sess;
      if (!s) { toast(r.ok ? 'good' : 'info', r.text || ''); if (r.trophy) snd('baTrophy'); return; }
      s.done = true; s.doneAt = nowMs(); s.ok = !!r.ok && r.job === s.job; s.score = r.score | 0; s.max = r.max | 0; s.text = r.text || '';
      if (s.ok) { snd('baDone'); if (r.hit) s.res = r.hit; } else snd('deny', { vol: 0.5 });
    }
    function lookText(d) {
      const parts = [d.outside ? d.outside + (d.outside === 1 ? ' goblin' : ' goblins') + ' in the room outside your hatch' : 'Nobody in the room outside your hatch'];
      if (d.near) parts.push(d.home + ' of ' + d.near + ' neighbouring ' + (d.near === 1 ? 'home is' : 'homes are') + ' lit');
      if (d.shut > 0) parts.push('the hatch opens in ' + secs(d.shut) + ' s'); else if (d.round === 1) parts.push('the hatch is about to open');
      return 'Lookout: ' + parts.map(s => s[0].toUpperCase() + s.slice(1)).join('. ') + '.';
    }
    function onMsg(d) {
      if (d.matchStart || d.queue) { st = null; if (sess) close(); pending = ''; paintCard(); if (o.fx) o.fx('board', null); }
      if (d.ba) { st = d.ba; paintCard(); if (o.fx) o.fx('board', boardState()); }
      if (d.baStart) begin(d.baStart);
      if (d.baRes) result(d.baRes);
      if (d.baLook) { toast('info', lookText(d.baLook)); snd('baLook', { vol: 0.7 }); }
    }
    function tick() {   // ~2 per second from game.js: card visibility, and a snapshot every 6 s while I am home
      if (!doc) return; mkDom(); paintCard();
      const n = nowMs();
      if (o.inHome() && o.alive() && n - syncAt > 6000) { syncAt = n; send({ ba: { sync: 1 } }); }
    }
    return { prompt, key, onMsg, tick, reset: () => onMsg({ matchStart: 1 }), isOpen: () => !!sess, shut: () => { if (sess) cancel(); }, state: () => st, aim, textOf, _begin: begin, _hit: hit };
  }
  return { create, keyOf, KEYS };
});

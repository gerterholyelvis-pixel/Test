// RARE client (docs/reports/rare-items.md): the pickup announcement for a rare find (banner + chime + sparkle burst), the faint cue other goblins get when a one-of-a-kind trophy turns up,
// the small in-fight tags of the rare mechanics, and the Seeker's Lantern minimap rule. Server messages: { rareFind }, { rareCue }, { rare: { fx } }. game.js calls these from three RARE-HOOK lines.
// env = { pos: () => {x, z}, snd(name, opts), glint(pos, hex, n), me: () => id, charm: () => key of the worn charm, roomOf(x, z) }
(function (root) {
  'use strict';
  const R = () => root.GKRARE, STY = () => (R() && R().STYLE) || {};
  let el = null, cueEl = null, tagEl = null, hideT = 0, cueT = 0, tagT = 0;
  const mk = (css) => { const d = document.createElement('div'); d.style.cssText = css; document.body.appendChild(d); return d; };
  function banner(d) {
    const st = STY()[d.tier] || { css: '#ffd76a', glow: 0.5, fx: { toast: 2.4 } }, secs = (st.fx && st.fx.toast) || 2.4;
    if (!el) el = mk('position:fixed;left:50%;top:21%;transform:translateX(-50%) scale(.92);padding:10px 26px 12px;border-radius:10px;background:rgba(8,8,14,.82);text-align:center;pointer-events:none;z-index:60;opacity:0;transition:opacity .35s,transform .35s;font-family:system-ui,sans-serif;max-width:min(86vw,520px)');
    const g = Math.round(14 + 26 * st.glow);
    el.style.border = '1px solid ' + st.css; el.style.boxShadow = '0 0 ' + g + 'px ' + st.css + '88, inset 0 0 ' + Math.round(g / 2) + 'px ' + st.css + '33';
    el.innerHTML = '';
    const a = document.createElement('div'); a.textContent = String(d.tier || 'rare').toUpperCase() + ' FIND'; a.style.cssText = 'font:700 11px system-ui;letter-spacing:.28em;color:' + st.css;
    const b = document.createElement('div'); b.textContent = d.name || ''; b.style.cssText = 'font:700 22px system-ui;color:#fff;text-shadow:0 0 ' + g + 'px ' + st.css + ';margin:2px 0';
    el.append(a, b);
    if (d.lore) { const c = document.createElement('div'); c.textContent = d.lore; c.style.cssText = 'font:italic 12px system-ui;color:#c9c5b8'; el.appendChild(c); }
    el.style.opacity = '1'; el.style.transform = 'translateX(-50%) scale(1)';
    clearTimeout(hideT); hideT = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) scale(.96)'; }, secs * 1000);
  }
  function find(d, env) {   // the finder: banner, chime, a ring of sparkles around the goblin (more of each for rarer tiers)
    if (!d || typeof document === 'undefined') return;
    const st = STY()[d.tier]; if (!st || !st.fx) return;
    try { banner(d); } catch (e) {}
    try { env.snd('rareFind' + st.fx.chime, { vol: 0.9 }); } catch (e) {}
    try { const p = env.pos(); env.glint({ x: p.x, y: 1.1, z: p.z }, st.hex, st.fx.sparks); if (st.fx.sparks >= 28) env.glint({ x: p.x, y: 1.9, z: p.z }, 0xffffff, Math.round(st.fx.sparks / 2)); } catch (e) {}
  }
  function cue(d, env) {   // everybody else, trophies only: a faint corner line and a distant chime, no name and no place
    if (typeof document === 'undefined') return;
    if (!cueEl) cueEl = mk('position:fixed;right:14px;top:92px;padding:4px 10px;border-radius:6px;background:rgba(8,8,14,.55);font:600 11px system-ui;letter-spacing:.06em;color:#7ff4ff;pointer-events:none;z-index:40;opacity:0;transition:opacity .8s');
    cueEl.textContent = 'A one-of-a-kind trophy has been found'; cueEl.style.opacity = '.85'; clearTimeout(cueT); cueT = setTimeout(() => { cueEl.style.opacity = '0'; }, 4200);
    try { env.snd('rareCue', { vol: 0.5 }); } catch (e) {}
  }
  const TAGS = { phase: ['Phased through', '#9fe8ff'], phoenix: ['Phoenix Ember!', '#ffb02e'], echo: ['Echo', '#cfd8ff'], shatter: ['Shattered', '#ffd76a'], chain: ['Chain lash', '#ffe066'], clap: ['Thunderclap', '#fff2a0'] };
  function fx(d, env) {   // { rare: { fx, id, to } }: a short tag when it is yours, a sound when it is near
    if (!d || !TAGS[d.fx] || typeof document === 'undefined') return;
    const mine = d.id === env.me() || d.to === env.me();
    try { env.snd(d.fx === 'phoenix' ? 'rareFind3' : 'wardBreak', { vol: mine ? 0.7 : 0.35 }); } catch (e) {}
    if (!mine) return;
    if (!tagEl) tagEl = mk('position:fixed;left:50%;top:58%;transform:translateX(-50%);font:700 15px system-ui;pointer-events:none;z-index:45;opacity:0;transition:opacity .25s;text-shadow:0 0 8px #000');
    tagEl.textContent = TAGS[d.fx][0]; tagEl.style.color = TAGS[d.fx][1]; tagEl.style.opacity = '1'; clearTimeout(tagT); tagT = setTimeout(() => { tagEl.style.opacity = '0'; }, 900);
  }
  // Seeker's Lantern: with the charm worn, goblins in the eight rooms around the Vault (room keys 6 7 8 11 13 16 17 18) show on the minimap
  const RING = { 6: 1, 7: 1, 8: 1, 11: 1, 13: 1, 16: 1, 17: 1, 18: 1 };
  function lanternAt(x, z, env) { try { const c = env.charm(); const I = root.GKITEMS && root.GKITEMS.ITEMS; if (!c || !I || !I[c] || !I[c].eff || !I[c].eff.ringSight) return false; return !!RING[env.roomOf(x, z)]; } catch (e) { return false; } }
  root.GKRAREUI = { find, cue, fx, lanternAt, RING };
})(typeof window !== 'undefined' ? window : globalThis);

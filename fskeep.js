// fskeep.js: keep fullscreen on and the player able to move and look, whatever opens or closes (see docs/reports/fullscreen-2.md).
// Pure decisions (unit-tested in tests/fskeep.test.js) plus install(), which menu.js calls with its fullscreen helpers.
// Rules: game code never leaves fullscreen (only F / the button / the settings box, and never while a panel is open);
// if the browser drops it anyway (Esc without keyboard lock, reloads, focus loss) the wish is kept and fullscreen is
// taken back on the very next trusted click or key; pointer lock is taken back on any key or click once no panel is
// open, with or without fullscreen, so the game never waits on fullscreen to let the player look around.
// UMD: window.GKFS / module.exports.
(function (root) {
  'use strict';
  const ACT_TYPES = { pointerdown: 1, mousedown: 1, keydown: 1 };
  // Esc never grants user activation in Chromium, and modifier-only presses are not gestures the player meant for the game
  const NOT_GESTURE = { Escape: 1, ShiftLeft: 1, ShiftRight: 1, ControlLeft: 1, ControlRight: 1, AltLeft: 1, AltRight: 1, MetaLeft: 1, MetaRight: 1, F11: 1, F12: 1 };
  const RETRY_MS = 250;
  // s: { wish, fsOn, trusted, type, code, now, last }
  function shouldRetake(s) {
    if (!s.wish || s.fsOn || s.trusted === false || !ACT_TYPES[s.type]) return false;
    if (s.type === 'keydown' && NOT_GESTURE[s.code]) return false;
    return !(s.now - (s.last || -1e9) < RETRY_MS);
  }
  // s: { mode, panel, locked, repeat, code, inField }: a key in play with no panel open takes the pointer lock back (keys are a gesture)
  function shouldRelockOnKey(s) {
    return s.mode === 'play' && !s.panel && !s.locked && !s.repeat && !s.inField && !NOT_GESTURE[s.code];
  }
  // s: { code, repeat, mods, mode, panel, fsOn, inField } -> 'enter' | 'leave' | null
  function fKey(s) {
    if (s.code !== 'KeyF' || s.repeat || s.mods || s.mode !== 'play' || s.inField) return null;
    if (!s.fsOn) return 'enter';
    return s.panel ? null : 'leave';   // a panel open: F does nothing (no accidental exits next to E)
  }
  // s: { fsOn, mode, panel, locked, now, heldEsc } -> { relock, wishOff, closePanel }
  // Without keyboard lock (http:// LAN address, older browser, lock lost) Chromium eats Esc to leave fullscreen and the page never sees
  // the key: the panel the player meant to close stayed open, so he could not move. Leaving fullscreen with a panel open closes it.
  function afterChange(s) {
    if (s.fsOn) return { relock: s.mode === 'play' && !s.panel && !s.locked, wishOff: false, closePanel: false };   // tab fullscreen lets the page lock without a new gesture
    return { relock: false, wishOff: s.now - (s.heldEsc || -1e9) < 2500, closePanel: s.mode === 'play' && !!s.panel };   // only a deliberate hold of Esc gives up the wish
  }
  // the keys that close any panel (inventory, merchant, stations, Elixir Screen): E and Tab as well as Esc
  const closesPanel = (code, repeat) => code === 'Escape' || code === 'Tab' || (code === 'KeyE' && !repeat);
  const inFieldOf = t => !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')) && t.type !== 'checkbox' && t.type !== 'range');

  // env: { fsOn(), request(), wishGet(), wishSet(v), GK } in a browser
  function install(env) {
    const GK = env.GK, doc = document; let last = -1e9, heldEsc = 0;
    const panel = () => !!(GK.panelOpen && GK.panelOpen()), locked = () => !!(GK.lockOk && GK.lockOk());
    function onGesture(e) {
      if (!shouldRetake({ wish: env.wishGet(), fsOn: env.fsOn(), trusted: e.isTrusted, type: e.type, code: e.code, now: performance.now(), last })) return;
      last = performance.now(); env.request();
    }
    addEventListener('pointerdown', onGesture, true); addEventListener('keydown', onGesture, true);
    addEventListener('keydown', e => { if (e.code === 'Escape' && e.repeat) heldEsc = performance.now(); }, true);
    addEventListener('keydown', e => {   // bubble phase, after game.js: a panel that this key closed is already shut, so the same key re-locks
      if (shouldRelockOnKey({ mode: GK.mode, panel: panel(), locked: locked(), repeat: e.repeat, code: e.code, inField: inFieldOf(e.target) }) && GK.requestLock) GK.requestLock();
    });
    function changed() {
      const r = afterChange({ fsOn: env.fsOn(), mode: GK.mode, panel: panel(), locked: locked(), now: performance.now(), heldEsc });
      if (r.wishOff) env.wishSet(false);
      if (r.closePanel && GK.closePanels) GK.closePanels();   // the Esc the browser kept: close what the player was closing, so W works at once
      if (r.relock && GK.requestLock) GK.requestLock();
      try { const K = navigator.keyboard; if (K && K.lock && env.fsOn()) K.lock(['Escape']).catch(() => {}); else if (K && K.unlock && !env.fsOn()) K.unlock(); } catch (e) {}   // Esc stays with the game (closes panels) while fullscreen
    }
    addEventListener('focus', () => { try { if (env.fsOn() && navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(() => {}); } catch (e) {} });   // back from Alt+Tab: lock Esc again
    doc.addEventListener('fullscreenchange', changed); doc.addEventListener('webkitfullscreenchange', changed);
    return { changed };
  }
  const GKFS = { shouldRetake, shouldRelockOnKey, fKey, afterChange, closesPanel, inFieldOf, install, RETRY_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = GKFS; else root.GKFS = GKFS;
})(typeof window !== 'undefined' ? window : this);

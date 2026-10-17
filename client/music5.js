// MUSIC5: adaptive music in three procedural layers (docs/RESEARCH-game.md 7.2, docs/PLAN-improvements-2.md 11, docs/reports/research-game.md).
// Vertical layering (Uncharted 2, Dead Space 2): the layers share one clock and fade in and out by intensity, never cut.
//   calm    a low pad that walks D minor - Bb - F - C, always on during play (quiet)
//   pulse   a bass ostinato and a soft drum at 100 bpm, while I fight (a hit from or on me), fading about 8 s after the last one
//   tension a high tremolo in fifths, in sudden death, while someone claims the crown, and when my health is below 30 %
// No files, no new lights, no per-frame work: a 120 ms scheduler with a 0.3 s lookahead. Output: GKAUDIO.musicOut() (the ambient bus, so the
// Ambient slider, Mute and the DUCK block all apply). Off with GK.settings.music === false or ?music=0.
// The pure part (intensity rules) is exported for tests: GKMUSIC.mix(state, now) -> { calm, pulse, tension } gains 0..1.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api; else root.GKMUSIC = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const BPM = 100, BEAT = 60 / BPM, BAR = BEAT * 4, FIGHT_MS = 8000, LOW_MS = 15000, CROWN_MS = 3000;
  const ROOTS = [73.42, 58.27, 87.31, 65.41];   // D2, Bb1, F2, C2: one chord per two bars
  const LVL = { calm: 0.07, pulse: 0.09, tension: 0.045 };
  const S = { fight: -1e9, low: -1e9, crown: -1e9, sudden: false, play: false, me: null };
  function mix(s, now) {   // pure: what each layer should be at now
    if (!s.play) return { calm: 0, pulse: 0, tension: 0 };
    const f = now - s.fight, pulse = f < FIGHT_MS ? 1 : f < FIGHT_MS + 4000 ? 1 - (f - FIGHT_MS) / 4000 : 0;
    const tension = s.sudden || now - s.crown < CROWN_MS || now - s.low < LOW_MS ? 1 : 0;
    return { calm: 1 - 0.35 * Math.max(pulse, tension), pulse, tension };
  }
  function event(s, d, me, now) {   // pure: one server message -> state
    if (!d) return;
    if (d.matchStart) { s.sudden = false; s.fight = s.low = s.crown = -1e9; }
    if (d.hit && me != null && (d.hit.from === me || d.hit.to === me) && !d.hit.thorns) { s.fight = now; if (d.hit.to === me && d.hit.max > 0 && d.hit.hp / d.hit.max < 0.3 && d.hit.hp > 0) s.low = now; }
    if (d.sudden) s.sudden = true;
    if (d.crown) s.crown = now; else if (d.crown === null) s.crown = -1e9;
    if (d.matchEnd || d.died || d.won) s.fight = s.low = s.crown = -1e9;
  }

  // ---- browser side
  let A = null, L = null, step = 0, nextT = 0;
  const off = () => { const st = root.GK && root.GK.settings; return !!(st && st.music === false) || !!(root.location && /[?&]music=0/.test(root.location.search)); };
  function build() {
    const mo = root.GKAUDIO && root.GKAUDIO.musicOut && root.GKAUDIO.musicOut(); if (!mo) return false;
    A = mo; const c = A.ctx, out = c.createGain(); out.gain.value = 1; out.connect(A.out);
    const g = n => { const x = c.createGain(); x.gain.value = 0; x.connect(n || out); return x; };
    L = { out, calm: g(), pulse: g(), tension: g() };
    // calm pad: two detuned triangles and a fifth, lowpassed
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 0.3; lp.connect(L.calm);
    L.pad = [0, 1.006, 1.5].map((m, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'sine' : 'triangle'; o.frequency.value = ROOTS[0] * 2 * (m || 1); const og = c.createGain(); og.gain.value = i === 2 ? 0.35 : 0.5; o.connect(og); og.connect(lp); o.start(); return { o, m: m || 1 }; });
    // tension: two saws a fifth apart through a bandpass, amplitude tremolo at 6 Hz
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
    const trem = c.createGain(); trem.gain.value = 0.6; bp.connect(trem); trem.connect(L.tension);
    L.ten = [4, 6].map(m => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = ROOTS[0] * m; o.connect(bp); o.start(); return { o, m }; });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 6; lg.gain.value = 0.4; lfo.connect(lg); lg.connect(trem.gain); lfo.start();
    // a short noise buffer for the drum
    const n = Math.floor(c.sampleRate * 0.25), nb = c.createBuffer(1, n, c.sampleRate), ch = nb.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    L.noise = nb; nextT = c.currentTime + 0.1; step = 0;
    return true;
  }
  function note(t, f, dur, peak, type) {   // a pulse-layer voice (bass or drum body)
    const c = A.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'triangle'; o.frequency.setValueAtTime(f, t);
    if (!type) o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(L.pulse); o.start(t); o.stop(t + dur + 0.02);
  }
  function hat(t, peak) { const c = A.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = L.noise; f.type = 'highpass'; f.frequency.value = 5000; g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); s.connect(f); f.connect(g); g.connect(L.pulse); s.start(t); s.stop(t + 0.08); }
  function schedule(lv) {   // 8th notes up to 0.3 s ahead; the pulse voices are only made while the pulse layer is audible
    const c = A.ctx;
    while (nextT < c.currentTime + 0.3) {
      const i = step % 64, bar = Math.floor(i / 8), root = ROOTS[Math.floor(bar / 2) % 4];
      if (i % 16 === 0) { const t = nextT; for (const p of L.pad) p.o.frequency.setTargetAtTime(root * 2 * p.m, t, 0.6); for (const p of L.ten) p.o.frequency.setTargetAtTime(root * p.m, t, 0.3); }
      if (lv.pulse > 0.02) {
        if (i % 4 === 0) note(nextT, 110, 0.18, 0.9);   // drum body on the beat
        if (i % 2 === 1) hat(nextT, 0.12);
        if ([0, 3, 6].includes(i % 8)) note(nextT, root, BEAT * 0.45, 0.5, 'square');   // bass ostinato
      }
      nextT += BEAT / 2; step++;
    }
  }
  let cur = { calm: 0, pulse: 0, tension: 0 };
  function tick() {
    const c = root.GKAUDIO && root.GKAUDIO.ctx;
    S.play = !!(root.GK && root.GK.mode === 'play') && !off();
    if (!c || c.state !== 'running') return;
    if (!L) { if (!S.play || !build()) return; }
    const now = Date.now(), lv = mix(S, now), t = c.currentTime;
    if (nextT < t) nextT = t + 0.05;   // the tab slept: do not burst-schedule the missed notes
    for (const k of ['calm', 'pulse', 'tension']) if (Math.abs(lv[k] - cur[k]) > 0.01 || (lv[k] === 0 && cur[k] !== 0)) { L[k].gain.setTargetAtTime(lv[k] * LVL[k], t, k === 'pulse' && lv[k] > cur[k] ? 0.4 : 1.2); cur[k] = lv[k]; }
    if (S.play) schedule(lv);
  }
  if (root.setInterval && root.document) root.setInterval(tick, 120);
  function onMsg(d, me) { event(S, d, me, Date.now()); }
  return { mix, event, onMsg, state: S, LVL, BPM };
});

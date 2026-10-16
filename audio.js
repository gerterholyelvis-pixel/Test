// Goblin King audio: every sound is synthesised with WebAudio (oscillators, filtered noise, envelopes). No files, no licences.
// window.GKAUDIO.play(name, opts)
//   names: step, door, vaultDoor, panel, pickup, coins, buy, craft, recycle, invOpen, invClose, uiHover, uiClick, tick, tickLast,
//          gong, eat, deny, hit, hurt, swing, death, victory, emoteTaunt, emoteLaugh, emotePoint, emoteDance
//   family hooks: swing/hit take {fam: weapon family, armor: victim armour family}; step takes {surf: 'stone'|'vault'|'rug'|'metal', sprint}.
//          GKAUDIO.weaponClass(fam), armorClass(fam) and itemSound(item, action) map any item family (new families fall back sensibly).
//          more names: chest, equip, drink, heartbeat, go
//   opts:  x, z    world position (metres): the sound is panned and attenuated relative to the listener (see setListener)
//          vol     extra gain multiplier (default 1)
//          pitch   playback-rate style multiplier (default 1; footsteps randomise it themselves)
//          muffle  true = heard through a wall (lowpassed and quieter)
// Settings (GK.settings, persisted by menu.js): vol = master, sfx = effects, amb = ambient hum, all 0..1.
(function () {
  'use strict';
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, master = null, sfxBus = null, ambBus = null, noiseBuf = null, voices = 0;
  const L = { x: 0, z: 0, yaw: 0 };                 // listener
  const MAXD = 46, REF = 5;                          // sounds further than MAXD are skipped; REF = distance at which a sound is at half level
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  const set = () => (window.GK && window.GK.settings) || {};
  const level = k => clamp(num(set()[k], k === 'vol' ? 0.8 : k === 'sfx' ? 0.9 : 0.5), 0, 1);

  function ensure() {
    if (ctx) return ctx;
    if (!AC) return null;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = null; return null; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); sfxBus = ctx.createGain(); ambBus = ctx.createGain();
    sfxBus.connect(master); ambBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
    const n = ctx.sampleRate * 2; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    refresh();
    return ctx;
  }
  function refresh() {   // apply the volume settings (squared: a perceptual taper)
    if (!ctx) return;
    const t = ctx.currentTime, m = level('vol');
    master.gain.setTargetAtTime(m * m, t, 0.03);
    const s = level('sfx'), a = level('amb');
    sfxBus.gain.setTargetAtTime(s * s, t, 0.03); ambBus.gain.setTargetAtTime(a * a, t, 0.05);
  }
  function resume() {   // browsers start the context suspended: call from a user gesture
    if (!ensure()) return false;
    if (ctx.state !== 'running') { try { const p = ctx.resume(); p && p.catch && p.catch(() => {}); } catch (e) {} }
    return true;
  }
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) addEventListener(ev, resume, { capture: true, passive: true });

  // ---------- building blocks ----------
  // Each voice is wired: sources -> (filters) -> out gain -> [lowpass] -> [panner] -> sfxBus
  function route(o, t) {
    let dist = 0, pan = 0, g = num(o.vol, 1);
    if (o.x != null && o.z != null) {
      const dx = o.x - L.x, dz = o.z - L.z; dist = Math.hypot(dx, dz);
      if (dist > MAXD) return null;
      g *= 1 / (1 + (dist / REF) * (dist / REF)) * (1 - dist / MAXD);
      if (dist > 0.6) pan = clamp((dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / dist, -1, 1) * 0.9;
    }
    if (o.muffle) g *= 0.55;
    if (g < 0.004) return null;
    const out = ctx.createGain(); out.gain.value = g;
    let tail = out;
    const lp = (dist > 8 || o.muffle) ? ctx.createBiquadFilter() : null;
    if (lp) { lp.type = 'lowpass'; lp.frequency.value = o.muffle ? 700 : clamp(9000 / (1 + dist * 0.25), 900, 9000); lp.Q.value = 0.4; tail.connect(lp); tail = lp; }
    if (ctx.createStereoPanner && pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; tail.connect(p); tail = p; }
    tail.connect(sfxBus);
    return out;
  }
  function track(src, endT) {   // limit simultaneous voices
    voices++; src.onended = () => { voices--; };
    try { src.stop(endT); } catch (e) {}
  }
  // enveloped oscillator; f1 = optional glide target
  function tone(out, type, f0, t, dur, peak, o) {
    o = o || {};
    const osc = ctx.createOscillator(), g = ctx.createGain(), a = o.a == null ? 0.004 : o.a;
    osc.type = type; osc.frequency.setValueAtTime(f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + dur);
    if (o.det) osc.detune.value = o.det;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out); osc.start(t); track(osc, t + dur + 0.05);
    return osc;
  }
  // enveloped filtered noise; f1 = filter sweep target
  function noise(out, t, dur, peak, ftype, f0, f1, q, o) {
    o = o || {};
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain(), a = o.a == null ? 0.004 : o.a;
    src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = o.rate || 1;
    flt.type = ftype; flt.Q.value = q || 0.8; flt.frequency.setValueAtTime(f0, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (o.hold) g.gain.setValueAtTime(Math.max(0.0002, peak), t + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(out); src.start(t, Math.random() * 1.5); track(src, t + dur + 0.05);
  }
  const ping = (out, t, f, peak, dur) => { tone(out, 'sine', f, t, dur, peak, { a: 0.002 }); tone(out, 'sine', f * 2.756, t, dur * 0.5, peak * 0.35, { a: 0.002 }); tone(out, 'triangle', f * 5.4, t, dur * 0.2, peak * 0.15, { a: 0.001 }); };

  // ---------- item family -> sound class (new families fall back by name, then to a generic blade/flesh) ----------
  const WCLASS = { dagger: 'blade', sword: 'blade', axe: 'axe', spear: 'pole', halberd: 'pole', club: 'blunt', mace: 'blunt', flail: 'blunt', hammer: 'heavy', bow: 'bow', crossbow: 'xbow', staff: 'magic', scepter: 'magic', wand: 'magic', fist: 'fist' };
  const ACLASS = { cloth: 'cloth', robe: 'cloth', leather: 'leather', mail: 'mail', harness: 'mail', plate: 'plate', royal: 'plate', shield: 'plate' };
  function weaponClass(fam) {
    if (!fam) return 'fist'; if (WCLASS[fam]) return WCLASS[fam];
    const f = String(fam).toLowerCase();
    return /xbow|crossbow/.test(f) ? 'xbow' : /bow|sling/.test(f) ? 'bow' : /staff|wand|rod|tome|orb|magic/.test(f) ? 'magic' : /hammer|maul|flail|mace|club|bone/.test(f) ? 'heavy' : /spear|lance|pike|halberd|trident|glaive/.test(f) ? 'pole' : /axe|cleaver/.test(f) ? 'axe' : 'blade';
  }
  function armorClass(fam) {
    if (!fam) return 'flesh'; if (ACLASS[fam]) return ACLASS[fam];
    const f = String(fam).toLowerCase();
    return /plate|steel|iron|shield|helm/.test(f) ? 'plate' : /mail|chain|scale|ring/.test(f) ? 'mail' : /leather|hide|fur|studded/.test(f) ? 'leather' : /cloth|robe|silk|rag|sack/.test(f) ? 'cloth' : 'leather';
  }
  // item = an items.js entry ({type, family}); action = 'use' | 'equip' | 'pickup' -> a sound name for GKAUDIO.play
  const USE2_SND = { trap: 'snap', flare: 'flare', lens: 'glassUp', pry: 'crowbar', ward: 'ward', jar: 'jar', bait: 'useSoft', dazzle: 'zap', haggle: 'coins', rage: 'rage', feather: 'feather', bell: 'bell' };   // ITEMS2: item family -> sound
  function itemSound(item, action) {
    if (!item) return 'pickup';
    const f = String(item.family || '').toLowerCase();
    if (action === 'equip') return 'equip';
    if (action === 'use' && item.type === 'consumable' && USE2_SND[f]) return USE2_SND[f];   // ITEMS2
    if (action === 'use') return item.type === 'consumable' ? (/potion|elixir|tonic|draught|vial|flask|brew/.test(f) ? 'drink' : f === 'plushie' ? 'squeak' : 'eat') : 'equip';
    return 'pickup';
  }
  const lastPlay = {};   // per-name minimum gaps so a burst of events never stacks into a buzz
  const GAP = { step: 0.12, hit: 0.045, hurt: 0.12, swing: 0.06, uiHover: 0.05, uiClick: 0.04, tick: 0.2, coins: 0.15, hup: 0.15, thud: 0.15 };

  // ---------- the sounds ----------
  const SND = {
    step(out, t, o) {   // soft boot: a dull thud plus a short scuff, coloured by the surface (stone default)
      const p = num(o.pitch, 1) * rnd(0.88, 1.14) * (o.sprint ? 1.12 : 1), deep = o.deep ? 0.8 : 1, surf = o.surf || (o.deep ? 'vault' : 'stone'), lvl = o.sprint ? 1.2 : 1;
      if (surf === 'rug') {   // chest rooms: a thick floor covering, only a muffled pad
        tone(out, 'sine', 95 * p, t, 0.09, 0.42 * lvl, { f1: 50 * p, a: 0.003 });
        noise(out, t, 0.07, 0.22 * lvl, 'lowpass', 700 * p, 260, 0.6, { a: 0.004 });
        return;
      }
      if (surf === 'metal') {   // grates: a tiny ring over the thud
        tone(out, 'sine', 125 * p, t, 0.09, 0.45 * lvl, { f1: 60 * p, a: 0.002 });
        noise(out, t, 0.05, 0.3 * lvl, 'lowpass', 1800 * p, 500, 0.7, { a: 0.002 });
        tone(out, 'sine', 1180 * p, t, 0.1, 0.07, { a: 0.001 });
        return;
      }
      tone(out, 'sine', 120 * p * deep, t, 0.11, 0.55 * lvl, { f1: 52 * p * deep, a: 0.002 });
      noise(out, t, 0.075, 0.5 * lvl, 'lowpass', 1500 * p, 380, 0.7, { a: 0.002 });
      noise(out, t + 0.01, 0.04, 0.18 * lvl, 'highpass', 2600 * p, 3600, 0.6, { a: 0.002 });
      if (surf === 'vault') { tone(out, 'sine', 70 * p, t + 0.07, 0.22, 0.14, { f1: 45, a: 0.01 }); noise(out, t + 0.08, 0.2, 0.05, 'bandpass', 900, 500, 1.5, { a: 0.02 }); }   // a faint hall echo
    },
    // JUMP-BEGIN
    hup(out, t) {   // jump: a short breathy "hup", a rising grunt with a puff of air
      tone(out, 'triangle', 170, t, 0.1, 0.34, { f1: 300, a: 0.008 });
      tone(out, 'sine', 340, t + 0.004, 0.07, 0.1, { f1: 520, a: 0.008 });
      noise(out, t, 0.07, 0.15, 'bandpass', 1200, 1900, 1.2, { a: 0.006 });
    },
    thud(out, t) {   // landing: a soft low thud and a scuff
      tone(out, 'sine', 105, t, 0.14, 0.38, { f1: 48, a: 0.002 });
      noise(out, t, 0.06, 0.2, 'lowpass', 900, 300, 0.7, { a: 0.002 });
    },
    // JUMP-END
    door(out, t) {   // sliding door between rooms: servo whine, air hiss, clunk
      tone(out, 'sawtooth', 90, t, 0.85, 0.12, { f1: 170, a: 0.08 });
      tone(out, 'square', 240, t + 0.02, 0.7, 0.05, { f1: 330, a: 0.1 });
      noise(out, t, 0.8, 0.28, 'bandpass', 500, 1300, 1.2, { a: 0.1 });
      noise(out, t, 0.18, 0.4, 'highpass', 3000, 5000, 0.7, { a: 0.003 });
      tone(out, 'sine', 90, t + 0.72, 0.18, 0.5, { f1: 48 });
    },
    vaultDoor(out, t) {   // heavy vault door: bolts retract, then a long low rumble and a boom as it stops
      for (let i = 0; i < 4; i++) {   // bolt clanks
        const tt = t + 0.05 + i * 0.1;
        noise(out, tt, 0.14, 0.6, 'bandpass', 1900 + i * 140, 700, 5, { a: 0.001 });
        tone(out, 'square', 170 + i * 25, tt, 0.1, 0.22, { f1: 90, a: 0.001 });
        tone(out, 'sine', 70, tt, 0.18, 0.45, { f1: 40, a: 0.002 });
      }
      noise(out, t + 0.4, 2.1, 0.55, 'lowpass', 110, 220, 0.9, { a: 0.7 });          // the rumble
      tone(out, 'sine', 38, t + 0.4, 2.2, 0.7, { f1: 50, a: 0.8 });
      tone(out, 'sawtooth', 55, t + 0.5, 2.0, 0.12, { f1: 80, a: 0.7 });
      noise(out, t + 0.5, 1.9, 0.12, 'bandpass', 700, 1100, 6, { a: 0.5 });           // rolling gears
      for (let i = 0; i < 9; i++) { const tt = t + 0.7 + i * 0.19; noise(out, tt, 0.04, 0.22, 'bandpass', 2200, 1500, 4, { a: 0.001 }); }
      tone(out, 'sine', 62, t + 2.35, 0.9, 0.9, { f1: 28, a: 0.003 });                 // final boom
      noise(out, t + 2.35, 0.5, 0.5, 'lowpass', 260, 60, 0.7, { a: 0.003 });
    },
    panel(out, t) {   // control panel button
      tone(out, 'square', 1900, t, 0.035, 0.18, { a: 0.001 });
      tone(out, 'triangle', 1250, t + 0.035, 0.09, 0.28, { f1: 1500, a: 0.002 });
      noise(out, t, 0.02, 0.2, 'highpass', 5000, 6000, 0.5, { a: 0.001 });
    },
    pickup(out, t) {   // item chime
      ping(out, t, 880, 0.42, 0.55); ping(out, t + 0.09, 1318.5, 0.38, 0.7); ping(out, t + 0.18, 1760, 0.26, 0.9);
    },
    coins(out, t, o) {   // a handful of gold coins
      const n = 5 + Math.floor(rnd(0, 3));
      for (let i = 0; i < n; i++) { const tt = t + i * rnd(0.035, 0.07) + (i > 3 ? 0.05 : 0), f = rnd(2300, 3700); ping(out, tt, f, rnd(0.14, 0.26), rnd(0.12, 0.26)); noise(out, tt, 0.03, 0.12, 'bandpass', f, f * 0.8, 6, { a: 0.001 }); }
    },
    buy(out, t) {   // merchant: coin drop then a till ring
      for (let i = 0; i < 3; i++) ping(out, t + i * 0.05, rnd(2400, 3300), 0.18, 0.18);
      noise(out, t + 0.22, 0.04, 0.3, 'bandpass', 1800, 1400, 4, { a: 0.001 });
      ping(out, t + 0.28, 2093, 0.36, 0.9); ping(out, t + 0.34, 3136, 0.28, 1.0);
    },
    craft(out, t) {   // hammer on an anvil, three blows then a finish ring
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.2;
        noise(out, tt, 0.06, 0.55, 'bandpass', 3000, 1800, 3, { a: 0.001 });
        tone(out, 'square', 520 + i * 40, tt, 0.07, 0.15, { f1: 300, a: 0.001 });
        tone(out, 'sine', 90, tt, 0.15, 0.5, { f1: 55, a: 0.002 });
        ping(out, tt, 1500 + i * 120, 0.2, 0.35);
      }
      ping(out, t + 0.66, 1568, 0.28, 0.8); ping(out, t + 0.72, 2349, 0.2, 0.9);
    },
    recycle(out, t) {   // grinder whirr and crunch
      tone(out, 'sawtooth', 70, t, 0.6, 0.2, { f1: 190, a: 0.05 });
      tone(out, 'sawtooth', 190, t + 0.3, 0.35, 0.16, { f1: 55, a: 0.02 });
      noise(out, t, 0.7, 0.4, 'bandpass', 900, 280, 1.5, { a: 0.04 });
      for (let i = 0; i < 6; i++) noise(out, t + 0.05 + i * rnd(0.06, 0.1), 0.05, 0.5, 'highpass', 1800, 900, 0.7, { a: 0.001 });
      ping(out, t + 0.72, 1175, 0.22, 0.5);
    },
    invOpen(out, t) { noise(out, t, 0.2, 0.28, 'bandpass', 500, 1700, 0.9, { a: 0.05 }); tone(out, 'triangle', 330, t, 0.1, 0.1, { f1: 440 }); },
    invClose(out, t) { noise(out, t, 0.18, 0.26, 'bandpass', 1700, 450, 0.9, { a: 0.03 }); tone(out, 'triangle', 440, t, 0.1, 0.1, { f1: 300 }); },
    uiHover(out, t) { tone(out, 'sine', 1560, t, 0.05, 0.1, { a: 0.003 }); },
    tip(out, t) { tone(out, 'sine', 880, t, 0.5, 0.16, { a: 0.01 }); tone(out, 'sine', 1318, t + 0.09, 0.6, 0.12, { a: 0.01 }); },   // TIPS: soft two-note chime
    uiClick(out, t) { tone(out, 'triangle', 620, t, 0.09, 0.3, { f1: 420, a: 0.002 }); tone(out, 'sine', 1240, t, 0.07, 0.12, { a: 0.002 }); noise(out, t, 0.02, 0.1, 'highpass', 4000, 5000, 0.5, { a: 0.001 }); },
    tick(out, t) { tone(out, 'sine', 1040, t, 0.07, 0.4, { a: 0.002 }); noise(out, t, 0.015, 0.25, 'bandpass', 2600, 2200, 3, { a: 0.001 }); },
    tickLast(out, t) { tone(out, 'sine', 1560, t, 0.14, 0.5, { a: 0.002 }); tone(out, 'triangle', 780, t, 0.14, 0.2, { a: 0.002 }); noise(out, t, 0.02, 0.3, 'bandpass', 3000, 2400, 3, { a: 0.001 }); },
    gong(out, t) {   // inharmonic partials with a long decay and a swell of noise
      const base = 92, ratios = [1, 1.51, 2.04, 2.5, 3.1, 4.2], amps = [0.6, 0.4, 0.34, 0.22, 0.14, 0.08];
      ratios.forEach((r, i) => tone(out, 'sine', base * r, t, 2.8 - i * 0.25, amps[i], { a: 0.008, det: rnd(-6, 6) }));
      noise(out, t, 1.8, 0.28, 'bandpass', 700, 260, 0.7, { a: 0.35 });
      noise(out, t, 0.12, 0.5, 'bandpass', 2400, 1200, 1.2, { a: 0.001 });
    },
    eat(out, t) {   // wet chomps
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.17;
        noise(out, tt, 0.13, 0.5, 'bandpass', 380 + i * 60, 160, 2.5, { a: 0.012 });
        tone(out, 'sine', 210 - i * 20, tt, 0.12, 0.35, { f1: 80, a: 0.006 });
        noise(out, tt + 0.03, 0.05, 0.2, 'highpass', 2500, 1800, 0.6, { a: 0.002 });
      }
      tone(out, 'sine', 140, t + 0.55, 0.22, 0.25, { f1: 220, a: 0.02 });
    },
    squeak(out, t, o) {   // LOOT: the goblin plushie's squeaky-toy "pweep", two quick rubber chirps (called with GKAUDIO.play('squeak', {x, z}))
      const p = num(o.pitch, 1);
      tone(out, 'sine', 900 * p, t, 0.11, 0.4, { f1: 1900 * p, a: 0.004 }); tone(out, 'triangle', 1800 * p, t, 0.11, 0.12, { f1: 3400 * p, a: 0.004 });
      tone(out, 'sine', 1100 * p, t + 0.13, 0.09, 0.3, { f1: 2300 * p, a: 0.004 });
    },
    useSoft(out, t, o) {   // UTILITY: a quiet rustle and a short rising note for bandage, mushroom, tonic, wax and lockpick
      const p = num(o.pitch, 1);
      noise(out, t, 0.16, 0.2, 'bandpass', 900 * p, 2200 * p, 1.2, { a: 0.01 }); tone(out, 'sine', 520 * p, t + 0.05, 0.16, 0.16, { f1: 780 * p, a: 0.01 });
    },
    hiss(out, t) {   // UTILITY: a smoke bomb landing
      noise(out, t, 0.9, 0.3, 'highpass', 2600, 1200, 0.7, { a: 0.03 }); noise(out, t, 0.5, 0.2, 'bandpass', 700, 400, 0.8, { a: 0.01 });
    },
    boom(out, t) {   // UTILITY: the powder bomb, a short dull blast (not as long as the vault door)
      tone(out, 'sine', 120, t, 0.42, 0.7, { f1: 38, a: 0.003 }); noise(out, t, 0.35, 0.6, 'lowpass', 1800, 160, 0.8, { a: 0.002 }); noise(out, t, 0.08, 0.4, 'highpass', 2500, 1500, 0.7, { a: 0.001 });
    },
    // ITEMS2-BEGIN: sounds of the twelve more utility items (docs/reports/more-items.md); itemSound() below maps the item family to one of these
    snap(out, t) {   // bear trap / mimic: a metal clap and a crunch
      tone(out, 'square', 240, t, 0.07, 0.3, { f1: 90, a: 0.001 }); noise(out, t, 0.06, 0.5, 'highpass', 3000, 1800, 0.7, { a: 0.001 }); ping(out, t, 520, 0.22, 0.3); tone(out, 'sine', 80, t + 0.03, 0.18, 0.5, { f1: 40, a: 0.003 });
    },
    flare(out, t) { noise(out, t, 0.9, 0.26, 'bandpass', 900, 3200, 0.9, { a: 0.04 }); noise(out, t + 0.05, 0.5, 0.18, 'highpass', 4500, 3000, 0.6, { a: 0.02 }); },
    glassUp(out, t) { ping(out, t, 1320, 0.22, 0.5); ping(out, t + 0.09, 1760, 0.16, 0.5); },   // panel lens
    crowbar(out, t) { tone(out, 'sawtooth', 180, t, 0.4, 0.12, { f1: 120, a: 0.06 }); noise(out, t, 0.35, 0.16, 'bandpass', 800, 400, 3, { a: 0.1 }); noise(out, t + 0.4, 0.05, 0.4, 'lowpass', 1800, 300, 0.8, { a: 0.001 }); tone(out, 'sine', 90, t + 0.4, 0.2, 0.5, { f1: 45, a: 0.003 }); },
    ward(out, t) { ping(out, t, 660, 0.2, 0.7); ping(out, t + 0.1, 880, 0.18, 0.7); ping(out, t + 0.2, 1320, 0.14, 0.9); },
    wardBreak(out, t) { ping(out, t, 1568, 0.3, 0.35); ping(out, t + 0.04, 1180, 0.2, 0.3); noise(out, t, 0.12, 0.25, 'highpass', 5000, 3000, 0.6, { a: 0.001 }); },
    jar(out, t) { tone(out, 'sine', 300, t, 0.08, 0.35, { f1: 900, a: 0.002 }); noise(out, t + 0.06, 0.25, 0.18, 'lowpass', 900, 250, 0.9, { a: 0.02 }); },
    zap(out, t) { noise(out, t, 0.25, 0.4, 'highpass', 6000, 2500, 0.6, { a: 0.001 }); tone(out, 'sine', 2400, t, 0.3, 0.2, { f1: 500, a: 0.001 }); },
    rage(out, t) { tone(out, 'sawtooth', 110, t, 0.5, 0.28, { f1: 55, a: 0.05 }); tone(out, 'square', 114, t, 0.5, 0.08, { f1: 52, a: 0.05, det: 30 }); noise(out, t, 0.4, 0.2, 'bandpass', 600, 300, 1.2, { a: 0.05 }); },
    feather(out, t) { noise(out, t, 0.6, 0.12, 'bandpass', 1200, 4200, 1.4, { a: 0.2 }); tone(out, 'sine', 700, t, 0.5, 0.12, { f1: 1500, a: 0.2 }); },
    bell(out, t) { ping(out, t, 880, 0.35, 1.3); ping(out, t + 0.02, 1318, 0.18, 1.0); },
    // ITEMS2-END
    deny(out, t) { tone(out, 'square', 150, t, 0.1, 0.16, { f1: 120, a: 0.003 }); tone(out, 'square', 130, t + 0.12, 0.14, 0.16, { f1: 90, a: 0.003 }); },
    // SOCIAL-BEGIN goblin emotes (keys 4-7): short, silly, vocal
    emoteTaunt(out, t, o) {   // chest thumps and a gravelly "HAH!"
      const p = num(o.pitch, 1);
      for (let i = 0; i < 3; i++) { const tt = t + i * 0.17; tone(out, 'sine', 120 * p, tt, 0.12, 0.7, { f1: 55, a: 0.002 }); noise(out, tt, 0.07, 0.35, 'lowpass', 500, 200, 0.8, { a: 0.001 }); }
      tone(out, 'sawtooth', 210 * p, t + 0.58, 0.32, 0.32, { f1: 130, a: 0.02 }); tone(out, 'square', 214 * p, t + 0.58, 0.3, 0.1, { f1: 128, a: 0.02, det: 35 });
      noise(out, t + 0.58, 0.28, 0.3, 'bandpass', 1100, 600, 1.6, { a: 0.02 });
    },
    emoteLaugh(out, t, o) {   // "heh heh heh heh heh", running out of breath
      const p = num(o.pitch, 1);
      for (let i = 0; i < 5; i++) { const tt = t + i * 0.12, f = (380 - i * 28) * p; tone(out, 'sawtooth', f, tt, 0.09, 0.28, { f1: f * 0.8, a: 0.008 }); tone(out, 'square', f * 1.01, tt, 0.08, 0.07, { f1: f * 0.8, a: 0.008, det: 30 }); noise(out, tt, 0.08, 0.2, 'bandpass', 1500, 900, 1.5, { a: 0.006 }); }
      tone(out, 'sawtooth', 300 * p, t + 0.66, 0.35, 0.22, { f1: 520 * p, a: 0.05 }); noise(out, t + 0.66, 0.3, 0.12, 'highpass', 2500, 2000, 0.6, { a: 0.08 });
    },
    emotePoint(out, t, o) {   // a squeaky "Oi! YOU!"
      const p = num(o.pitch, 1);
      tone(out, 'sawtooth', 330 * p, t, 0.11, 0.3, { f1: 520 * p, a: 0.006 }); tone(out, 'square', 332 * p, t, 0.1, 0.08, { f1: 520 * p, a: 0.006, det: 25 });
      tone(out, 'sawtooth', 640 * p, t + 0.16, 0.2, 0.32, { f1: 380 * p, a: 0.01 }); tone(out, 'square', 644 * p, t + 0.16, 0.18, 0.08, { f1: 380 * p, a: 0.01, det: 25 });
      noise(out, t + 0.16, 0.14, 0.18, 'bandpass', 1800, 1200, 1.2, { a: 0.01 }); ping(out, t + 0.38, 1320, 0.1, 0.25);
    },
    emoteDance(out, t, o) {   // a wobbly kazoo jig that ends in a boing
      const p = num(o.pitch, 1), seq = [262, 330, 392, 330, 440, 392, 523];
      seq.forEach((f, i) => { const tt = t + i * 0.13; tone(out, 'sawtooth', f * p, tt, 0.11, 0.2, { f1: f * p * 1.04, a: 0.01 }); tone(out, 'square', f * 2 * p, tt, 0.09, 0.05, { f1: f * 2.1 * p, a: 0.01, det: 20 }); if (i % 2 === 0) tone(out, 'sine', 90, tt, 0.1, 0.35, { f1: 55, a: 0.002 }); });
      tone(out, 'sine', 180, t + 0.95, 0.4, 0.4, { f1: 520, a: 0.01 }); tone(out, 'triangle', 360, t + 0.95, 0.4, 0.12, { f1: 1040, a: 0.01 });
    },
    // SOCIAL-END
    // combat. swing: {fam}; hit: {fam, armor}. Both fall back to a generic blade / flesh if the family is unknown.
    swing(out, t, o) {
      const p = num(o.pitch, 1) * rnd(0.92, 1.1), c = weaponClass(o.fam);
      if (c === 'blade') noise(out, t, 0.17, 0.36, 'bandpass', 700 * p, 3400 * p, 1.4, { a: 0.05 });
      else if (c === 'axe') { noise(out, t, 0.24, 0.4, 'bandpass', 380 * p, 2000 * p, 1.0, { a: 0.1 }); tone(out, 'sine', 110 * p, t + 0.1, 0.12, 0.12, { f1: 70, a: 0.03 }); }
      else if (c === 'pole') noise(out, t, 0.14, 0.3, 'bandpass', 1400 * p, 4200 * p, 3, { a: 0.04 });
      else if (c === 'blunt') { noise(out, t, 0.2, 0.36, 'bandpass', 300 * p, 1500 * p, 0.9, { a: 0.09 }); tone(out, 'sine', 90 * p, t + 0.08, 0.14, 0.14, { f1: 60, a: 0.04 }); }
      else if (c === 'heavy') { noise(out, t, 0.32, 0.44, 'bandpass', 200 * p, 1100 * p, 0.8, { a: 0.16 }); tone(out, 'sine', 70 * p, t + 0.12, 0.2, 0.2, { f1: 45, a: 0.06 }); }
      else if (c === 'bow') { tone(out, 'triangle', 190 * p, t, 0.09, 0.3, { f1: 120, a: 0.001 }); noise(out, t, 0.05, 0.26, 'bandpass', 2400, 900, 2, { a: 0.001 }); noise(out, t + 0.03, 0.14, 0.12, 'bandpass', 3200 * p, 5400, 2, { a: 0.02 }); }
      else if (c === 'xbow') { noise(out, t, 0.025, 0.42, 'highpass', 2500, 3200, 0.6, { a: 0.001 }); tone(out, 'square', 140 * p, t + 0.012, 0.09, 0.2, { f1: 70, a: 0.001 }); noise(out, t + 0.02, 0.08, 0.2, 'bandpass', 1800, 700, 2, { a: 0.002 }); }
      else if (c === 'magic') { tone(out, 'sine', 520 * p, t, 0.32, 0.18, { f1: 1300 * p, a: 0.08 }); tone(out, 'triangle', 1040 * p, t + 0.04, 0.26, 0.08, { f1: 2400 * p, a: 0.08 }); noise(out, t, 0.28, 0.1, 'highpass', 3500, 6500, 0.6, { a: 0.1 }); }
      else noise(out, t, 0.15, 0.2, 'bandpass', 400 * p, 1600 * p, 0.9, { a: 0.06 });   // fist
    },
    hit(out, t, o) {
      const c = weaponClass(o.fam), ar = armorClass(o.armor), p = rnd(0.94, 1.08);
      const heavy = c === 'heavy' ? 1.35 : c === 'blunt' || c === 'axe' ? 1.1 : c === 'fist' ? 0.7 : 1;   // the body: how hard the weapon lands
      tone(out, 'sine', 140 * p / heavy, t, 0.16, 0.55 * heavy, { f1: 48, a: 0.002 });
      if (c === 'blade' || c === 'axe') noise(out, t, 0.1, 0.45, 'bandpass', 2600, 800, 1.2, { a: 0.001 });          // a slicing hiss
      else if (c === 'pole' || c === 'bow' || c === 'xbow') noise(out, t, 0.05, 0.42, 'bandpass', 1500, 600, 2.2, { a: 0.001 }); // a short stab / thwack
      else if (c === 'magic') { tone(out, 'sawtooth', 700, t, 0.12, 0.14, { f1: 180, a: 0.001 }); noise(out, t, 0.12, 0.25, 'highpass', 3000, 1500, 0.6, { a: 0.001 }); }
      else noise(out, t, 0.12, 0.5, 'lowpass', 1400, 300, 0.8, { a: 0.001 });                                        // blunt crunch
      if (c === 'heavy') tone(out, 'sine', 55, t + 0.02, 0.35, 0.4, { f1: 30, a: 0.004 });
      if (ar === 'cloth') noise(out, t, 0.1, 0.12, 'lowpass', 900, 300, 0.6, { a: 0.004 });                          // what it lands on
      else if (ar === 'leather') { noise(out, t, 0.06, 0.22, 'bandpass', 1100, 500, 1.6, { a: 0.001 }); tone(out, 'triangle', 260, t, 0.06, 0.1, { f1: 160, a: 0.001 }); }
      else if (ar === 'mail') for (let i = 0; i < 4; i++) { const f = rnd(3000, 5200); noise(out, t + i * 0.012, 0.05, 0.16, 'bandpass', f, f * 0.8, 7, { a: 0.001 }); ping(out, t + i * 0.012, f * 0.5, 0.05, 0.12); }
      else if (ar === 'plate') { const f = rnd(780, 1000); ping(out, t, f, 0.3, 0.45); tone(out, 'square', 420 * p, t, 0.04, 0.1, { f1: 240, a: 0.001 }); }
    },
    hurt(out, t) {   // an ugly goblin grunt
      tone(out, 'sawtooth', 260, t, 0.3, 0.3, { f1: 120, a: 0.012 });
      tone(out, 'square', 262, t, 0.3, 0.1, { f1: 110, a: 0.012, det: 40 });
      noise(out, t, 0.18, 0.28, 'bandpass', 900, 500, 1.4, { a: 0.01 });
      tone(out, 'sine', 90, t, 0.15, 0.5, { f1: 45 });
    },
    death(out, t) {
      tone(out, 'sawtooth', 340, t, 1.3, 0.3, { f1: 38, a: 0.02 });
      tone(out, 'square', 345, t, 1.2, 0.1, { f1: 40, a: 0.02, det: 30 });
      noise(out, t, 1.0, 0.3, 'lowpass', 1400, 90, 0.8, { a: 0.05 });
      tone(out, 'sine', 70, t + 0.5, 1.2, 0.7, { f1: 30, a: 0.01 });
      ping(out, t + 0.9, 196, 0.2, 1.4);
    },
    victory(out, t) {   // brass-ish arpeggio and a held chord
      const seq = [[261.6, 0], [329.6, 0.16], [392, 0.32], [523.3, 0.5]];
      for (const [f, d] of seq) { tone(out, 'sawtooth', f, t + d, 0.5, 0.2, { a: 0.02 }); tone(out, 'square', f * 2, t + d, 0.4, 0.05, { a: 0.02 }); }
      for (const f of [523.3, 659.3, 784, 1046.5]) { tone(out, 'sawtooth', f, t + 0.7, 1.5, 0.14, { a: 0.05 }); tone(out, 'triangle', f * 2, t + 0.7, 1.5, 0.06, { a: 0.05 }); }
      noise(out, t + 0.7, 1.2, 0.08, 'highpass', 6000, 8000, 0.5, { a: 0.3 });
      ping(out, t + 0.72, 2093, 0.2, 1.6);
    },
    chest(out, t) {   // a wooden lid creaking open and a latch
      tone(out, 'sawtooth', 150, t, 0.5, 0.06, { f1: 260, a: 0.12 }); noise(out, t, 0.5, 0.14, 'bandpass', 700, 1500, 3, { a: 0.15 });
      noise(out, t, 0.03, 0.4, 'bandpass', 2000, 1200, 4, { a: 0.001 }); tone(out, 'sine', 100, t + 0.52, 0.12, 0.4, { f1: 60, a: 0.002 });
    },
    equip(out, t, o) {   // putting on gear: rustle by material (armour family) or a blade being drawn (weapon family)
      if (o.armor) {
        const c = armorClass(o.armor);
        if (c === 'cloth' || c === 'leather') noise(out, t, 0.28, 0.3, 'bandpass', c === 'cloth' ? 1200 : 800, c === 'cloth' ? 2400 : 500, 1, { a: 0.08 });
        else { for (let i = 0; i < 5; i++) { const f = rnd(2600, 4800); noise(out, t + i * 0.035, 0.05, 0.18, 'bandpass', f, f * 0.8, 6, { a: 0.001 }); } if (c === 'plate') ping(out, t + 0.18, 920, 0.2, 0.4); }
        tone(out, 'sine', 100, t + 0.2, 0.12, 0.25, { f1: 60, a: 0.004 });
      } else {
        const c = weaponClass(o.fam);
        if (c === 'blade' || c === 'axe' || c === 'pole') { noise(out, t, 0.2, 0.26, 'highpass', 3000, 6500, 0.9, { a: 0.03 }); ping(out, t + 0.12, 2400, 0.1, 0.3); }
        else if (c === 'magic') { tone(out, 'sine', 600, t, 0.4, 0.12, { f1: 900, a: 0.12 }); ping(out, t + 0.2, 1500, 0.1, 0.5); }
        else { noise(out, t, 0.12, 0.22, 'bandpass', 600, 400, 1, { a: 0.02 }); tone(out, 'sine', 110, t + 0.08, 0.1, 0.3, { f1: 70, a: 0.003 }); }
      }
    },
    drink(out, t) {   // potion: a cork pop and three gulps
      tone(out, 'sine', 500, t, 0.05, 0.3, { f1: 900, a: 0.002 });
      for (let i = 0; i < 3; i++) { const tt = t + 0.12 + i * 0.14; tone(out, 'sine', 240 - i * 25, tt, 0.1, 0.3, { f1: 140, a: 0.01 }); noise(out, tt, 0.08, 0.1, 'bandpass', 600, 350, 2, { a: 0.01 }); }
      ping(out, t + 0.6, 1568, 0.1, 0.5);
    },
    heartbeat(out, t, o) {   // low health: a soft lub-dub, felt more than heard
      const v = clamp(num(o.amt, 1), 0.3, 1);
      tone(out, 'sine', 62, t, 0.16, 0.7 * v, { f1: 40, a: 0.01 }); tone(out, 'sine', 54, t + 0.17, 0.2, 0.5 * v, { f1: 36, a: 0.01 });
    },
    go(out, t) {   // match start: the gong with a bright bell on top
      SND.gong(out, t, {}); ping(out, t, 1568, 0.18, 0.9);
    }
  };
  const PRIORITY_LOW = { step: 1, uiHover: 1, tick: 1, heartbeat: 1, thud: 1 };   // dropped first when the voice count is high

  function play(name, opts) {
    const fn = SND[name]; if (!fn) return false;
    if (!ctx || ctx.state !== 'running') return false;      // nothing before the first user gesture
    if (level('vol') <= 0 || level('sfx') <= 0) return false;
    if (voices > (PRIORITY_LOW[name] ? 28 : 60)) return false;
    const o = opts || {}, t = ctx.currentTime + 0.005;
    const gap = GAP[name]; if (gap) { const key = o.x != null ? name + (Math.round(o.x / 3) * 7919 + Math.round((o.z || 0) / 3)) : name; if (t - (lastPlay[key] || -9) < gap) return false; lastPlay[key] = t; }
    const out = route(o, t);
    if (!out) return false;
    try { fn(out, t, o); } catch (e) { return false; }
    return true;
  }

  // ---------- ambient room hum (a bit deeper in the vault) ----------
  let amb = null;
  function ambient(zone) {   // zone: 'room' | 'chest' | 'vault' | 'sudden' | null (off)
    if (!ctx) return;
    if (!amb) {
      const mk = (type, f, g) => { const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); gn.connect(amb.mix); o.start(); return { o, gn }; };
      amb = { mix: ctx.createGain(), zone: null };
      amb.mix.gain.value = 0; amb.mix.connect(ambBus);
      amb.a = mk('sine', 55, 0.5); amb.b = mk('sine', 55.7, 0.4); amb.c = mk('triangle', 110.4, 0.12); amb.d = mk('sine', 27.5, 0.0);
      const ns = ctx.createBufferSource(); ns.buffer = noiseBuf; ns.loop = true;
      amb.nf = ctx.createBiquadFilter(); amb.nf.type = 'lowpass'; amb.nf.frequency.value = 260; amb.nf.Q.value = 0.5;
      amb.ng = ctx.createGain(); amb.ng.gain.value = 0.35; ns.connect(amb.nf); amb.nf.connect(amb.ng); amb.ng.connect(amb.mix); ns.start();
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 70; lfo.connect(lg); lg.connect(amb.nf.frequency); lfo.start();
    }
    if (zone === amb.zone) return;
    amb.zone = zone; const t = ctx.currentTime;
    // per-zone colour: [level, drone Hz, upper drone Hz, sub gain, noise cutoff]
    const Z = { room: [0.13, 55, 110.4, 0, 260], chest: [0.09, 62, 124, 0, 200], vault: [0.2, 41, 82.4, 0.5, 170], sudden: [0.23, 38, 76, 0.7, 140] }, z = Z[zone] || Z.room;
    amb.mix.gain.setTargetAtTime(zone ? z[0] : 0, t, 0.8);
    if (zone) {
      amb.a.o.frequency.setTargetAtTime(z[1], t, 0.9); amb.b.o.frequency.setTargetAtTime(z[1] * 1.013, t, 0.9);
      amb.c.o.frequency.setTargetAtTime(z[2], t, 0.9); amb.d.gn.gain.setTargetAtTime(z[3], t, 0.9);
      amb.nf.frequency.setTargetAtTime(z[4], t, 0.9);
    }
  }

  window.GKAUDIO = {
    play,
    ambient,
    weaponClass,
    armorClass,
    itemSound,
    refresh,
    resume,
    setListener(x, z, yaw) { L.x = x; L.z = z; L.yaw = yaw; },
    get state() { return ctx ? ctx.state : 'none'; },
    get ctx() { return ctx; },
    names: Object.keys(SND)
  };
})();

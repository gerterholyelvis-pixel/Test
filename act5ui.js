// act5ui.js: what E (and R / Q) does at each anchor of the tree rooms, the vaultbreakers and the vault. Pure and DOM-free (UMD: window.GKACT5UI in the browser, require() in tests).
// It maps the public room view (actS.st) and my own state (actMe) to a list of actions {k, label, v, a, x?, hold?}; game.js (ACT5UI block) finds the nearest anchor, shows the first action on the E prompt,
// sends {act:{r,a,v,x?}} on the key and {act:{r,a,v:'stop'}} when a hold key is released. The server (act5.js with rooms5-trees.js, vb5.js, vault5.js) judges everything; this only offers what can work.
// Verbs, anchors and x values are the ones of docs/reports/rooms5-trees.md and vb5.md. tests/act5ui.test.js plays these actions against the real server modules.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKACT5UI = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const BLESS = ['Fury', 'Bark', 'Thorns'], PINS = 5, STONE_ORDER = ['L', 'R', 'FL', 'FR'];   // PINS: vb5 K.PINS; STONE_ORDER: the index order of keystone view.lit
  const act = (k, label, v, a, x, hold) => { const o = { k, label, v, a }; if (x != null) o.x = x; if (hold) o.hold = true; return o; };
  const has = (env, key) => !!env.has && env.has(key);
  const list = (...xs) => xs.filter(Boolean);

  // ---- tree rooms: anchors C NE NW SE SW (ring and nook have no verbs)
  const TREE = {
    well(a, st, me, env) {
      if (a === 'NE') {
        if (me.ready) return list(act('E', 'Drink the water', 'choose', 'NE', 0), act('R', 'Fill a bucket to carry', 'choose', 'NE', 1));
        if (me.timing && me.timing.a === 'NE') return [act('E', 'Press with the needle in the window', 'tap', 'NE')];
        if (st.ready != null || me.carry) return [];
        return st.water > 0 ? [act('E', 'Crank the well', 'use', 'NE')] : [];
      }
      if (a === 'C') {
        if (st.ripe) return [act('E', 'Pick the ripe fruit', 'use', 'C', null, true)];
        if (me.carry && me.carry.tok === 'bucket') return [act('E', 'Pour the bucket on the sapling', 'use', 'C', null, true), act('R', 'Pour it out', 'drop', 'C')];
      }
      return [];
    },
    press(a, st, me, env) {
      if (a === 'C') return env.brain && env.brain() ? [act('E', 'Press the brain', 'use', 'C', null, true)] : [];
      if (a === 'NE' || a === 'NW' || a === 'SW') return st.husks < 3 && (env.elixir | 0) >= 6 ? [act('E', 'Rouse a husk (6 elixir)', 'buy', a)] : [];
      return [];
    },
    spring(a, st, me, env) {
      if (a !== 'NE' && a !== 'SE' && a !== 'SW') return [];
      if (env.sudden || !st.basins || !(st.basins[a] >= 1)) return [];   // the spring is dry in sudden death (the server refuses)
      return list(act('E', 'Bottle spring water', 'use', a, null, true), (env.elixir | 0) >= 6 && act('R', 'Bottle blessed water (6 elixir)', 'buy', a, null, true));
    },
    seer(a) { return a === 'NE' || a === 'NW' || a === 'SE' ? [act('E', 'Turn the ring', 'use', a)] : []; },
    graft(a, st, me, env) {
      if (a === 'C') return st.branches && st.branches.some(n => n >= 1) && env.count('x:scion') < 2 ? [act('E', 'Cut a scion', 'use', 'C', null, true)] : [];
      if (a !== 'NE') return [];
      const v = st.vise || {};
      if (v.state === 'ready') return [act('E', 'Take the grafted item', 'use', 'NE')];
      if (v.state === 'idle' && env.count('x:scion') > 0) { const g = env.graftSlot && env.graftSlot(); if (g) return [act('E', 'Graft the ' + g.name, 'choose', 'NE', g.slot)]; }
      return [];
    },
    thorn(a, st, me, env) {
      if (a === 'SE') return st.bowl > 0 ? [act('E', 'Drink from the bowl', 'use', 'SE', null, true)] : [];
      if (a !== 'C') return [];
      if (st.grip && st.grip.by === env.uid) return [act('E', 'Hold on, release to bank the blessing', 'use', 'C', null, true)];
      if (me.needChoice) return [act('E', 'Take the blessing of ' + BLESS[env.choice | 0], 'choose', 'C', env.choice | 0), act('R', 'Change blessing', '_cycle', 'C')];
      const nm = BLESS[['fury', 'bark', 'thorns'].indexOf(me.pick)] || 'the shrine';
      return list(act('E', 'Grip the thorns for ' + nm, 'use', 'C', null, true), act('R', 'Change blessing', '_cycle', 'C'));
    },
    gambler(a, st, me, env) {
      if (a !== 'C') return [];
      const s = st.stump;
      if (s) return s.by === env.uid ? list(act('E', 'Take the item', 'pick', 'C'), s.step < 5 && act('R', 'Feed it again', 'use', 'C')) : [act('E', 'Take the item', 'pick', 'C')];
      if (st.chew) return [];
      const j = env.junk && env.junk();
      return j ? list(act('E', 'Feed the Root: ' + j.name, 'choose', 'C', j.slot), (env.elixir | 0) >= 10 && act('R', 'Feed it, with 10 elixir', 'buy', 'C', j.slot)) : [];
    },
    memory(a, st, me, env) {
      if (a === 'C') return st.phase === 'idle' ? [act('E', 'Begin the memory test', 'use', 'C')] : [];
      return me.input ? [act('E', 'Touch the lantern', 'use', a)] : [];
    },
    oak() { return []; },
    elder(a, st) {
      const i = ['NE', 'NW', 'SE'].indexOf(a);
      if (i >= 0) return st.phase === 'stones' && st.stones && st.stones[i] && !st.stones[i].lit ? [act('E', 'Wake the root-stone', 'use', a, null, true)] : [];
      return a === 'C' && st.phase === 'seed' ? [act('E', 'Take the Elder Seed', 'use', 'C', null, true)] : [];
    },
  };

  // ---- VBX: the extra stations of the vaultbreakers (vbx5.js, docs/reports/vaultbreaker-depth.md) at S1..S4 and the Keystone's ritual plates G1..G4. x = st.x, my part = me.vx
  const XA = /^(S[1-4]|G[1-4])$/;
  const mineT = (me, a) => !!(me.timing && me.timing.a === a);
  const VX = {
    ram(a, x, me, env, st) {
      if (a === 'S1') return list(x.head < 2 && act('E', 'Forge a ram head (3 metal)', 'use', 'S1', 0, true), x.wear > 0 && act('R', 'Repair the winch (1 metal)', 'use', 'S1', 1, true));
      if (a === 'S2') return (me.vx && me.vx.climbed) ? [] : [act('E', 'Climb the siege tower', 'use', 'S2', null, true)];
      if (a === 'S3') {
        if (x.crate) return [act('E', 'Take the supply crate', 'pick', 'S3')];
        return list(x.planks < 3 && act('E', 'Saw planks (2 wood)', 'use', 'S3', 0, true), x.planks > 0 && st.bar && act('R', 'Reinforce the barricade with a plank', 'use', 'S3', 1, true), x.planks > 0 && act('Q', 'Smash a plank (spoils the stock)', 'choose', 'S3', 9, true));
      }
      if (a === 'S4') return [mineT(me, 'S4') ? act('E', 'Strike the drum with the needle in the window', 'tap', 'S4') : act('E', 'Beat the war drum', 'use', 'S4')];
      return [];
    },
    locksmith(a, x, me, env) {
      const vx = me.vx || {};
      if (a === 'S1') { if (mineT(me, 'S1')) return [act('E', 'Cut with the needle in the window', 'tap', 'S1')]; return has(env, 'x:blank') && !has(env, 'x:skeleton') ? [act('E', 'Cut a Skeleton Key at the bench', 'use', 'S1')] : []; }
      if (a === 'S2') { if (mineT(me, 'S2')) return [act('E', 'Set the practice pin in the window', 'tap', 'S2')]; return vx.steady ? [] : [act('E', 'Practise on the pin board', 'use', 'S2')]; }
      if (a === 'S3') return x.felt ? [act('E', 'Strip the felt (lets the noise out)', 'choose', 'S3', 9, true)] : [act('E', 'Wrap the tools in felt (1 cloth)', 'use', 'S3', null, true)];
      if (a === 'S4') return x.jam ? [] : [act('E', 'Turn the first dial', 'use', 'S4', 0), act('R', 'Turn the second dial', 'use', 'S4', 1), act('Q', 'Turn the third dial', 'use', 'S4', 2)];
      return [];
    },
    counting(a, x, me, env) {
      const vx = me.vx || {};
      if (a === 'S1') return [mineT(me, 'S1') ? act('E', 'Sort the coin in the window', 'tap', 'S1') : act('E', 'Sort coins on the belt', 'use', 'S1')];
      if (a === 'S2') {
        const L = x.lot;
        if (L) { if (L.sid === env.uid) return L.bid0 == null ? [act('E', 'Withdraw your ' + L.name, 'choose', 'S2', 9)] : []; return L.bid0 === env.uid ? [] : [act('E', 'Bid ' + L.next + ' gold on the ' + L.name, 'buy', 'S2', 0)]; }
        const j = env.junk && env.junk(); return j ? [act('E', 'Auction your ' + j.name, 'use', 'S2', j.slot)] : [];
      }
      if (a === 'S3') return [act('E', 'Read the ledger (5 gold)', 'use', 'S3', null, true)];
      if (a === 'S4') {
        if (vx.debt) return [act('E', 'Repay your IOU (' + vx.debt + ' gold)', 'choose', 'S4', 0)];
        return list(!env.sudden && act('E', 'Borrow 40 gold (repay 50 next round)', 'use', 'S4', 0), x.notes > 0 && act('R', 'Buy an IOU note (40 gold, collect 50)', 'buy', 'S4', 0));
      }
      return [];
    },
    keystone(a, x, me, env) {
      const vx = me.vx || {}, R = x.rite;
      if (a === 'S1') { if (mineT(me, 'S1')) return [act('E', 'Carve the stroke in the window', 'tap', 'S1')]; return has(env, 'x:runecharge') ? [] : [act('E', vx.carve != null ? 'Go on carving the Rune Charge' : 'Carve a Rune Charge (1 metal, 1 bone)', 'use', 'S1')]; }
      if (a === 'S2') return vx.attuned || (R && R.by !== env.uid) ? [] : [act('E', R ? 'Begin the rite again' : 'Begin the rite', 'use', 'S2')];
      if (a[0] === 'G') return R && R.by === env.uid && !R.show ? [act('E', 'Step on this glyph', 'use', a)] : [];
      if (a === 'S3') {
        const rc = env.slotOf && (env.slotOf('x:runecharge') ?? env.slotOf('x:goldleaf')), j = env.junk && env.junk();
        return list(j && act('E', 'Offer your ' + j.name, 'use', 'S3', j.slot, true), rc != null && act('R', 'Offer it for a vision of the next re-key', 'use', 'S3', rc, true));
      }
      if (a === 'S4') return x.node && x.node.holder === env.uid ? [act('E', 'Hold the ley node (touch it now and then)', 'use', 'S4')] : [act('E', 'Attune to the ley node, then stay on it', 'use', 'S4')];
      return [];
    },
  };
  // the HUD arc label of a station channel, the sound of an actFx event (audio.js names) and the art drivers (rooms5art-vault.js EXTRAS setters)
  const LABELX = { forge: 'Forging a ram head', repair: 'Repairing the winch', climb: 'Climbing', saw: 'Sawing planks', reinforce: 'Reinforcing', smash: 'Smashing a plank', felt: 'Wrapping in felt', strip: 'Stripping the felt', ledger: 'Reading the ledger', offer: 'Offering' };
  const SOUNDX = { hit: 'timingHit', miss: 'timingMiss', drum: 'drumBeat', forged: 'craft', repaired: 'craft', sawn: 'craft', tower: 'rewardChime', crate: 'chest', crateland: 'chest', smashed: 'hit', click: 'lockpickClick', scrape: 'timingMiss', keycut: 'pickup', steady: 'rewardChime',
    felt: 'useSoft', strip: 'useSoft', shift: 'riskWarn', safeopen: 'chest', sort: 'coinCount', lot: 'gavel', bid: 'coins', sold: 'gavel', loan: 'buy', note: 'buy', repaid: 'buy', rush: 'riskWarn', ledger: 'invOpen',
    stroke: 'runeChime', chip: 'timingMiss', carved: 'rewardChime', rite: 'runeChime', glyph: 'runeChime', attuned: 'ward', backlash: 'zap', offered: 'ward', vision: 'ward', ley: 'captureTick', surge: 'riskWarn' };
  const sound = f => (f && SOUNDX[f.k]) ? { name: SOUNDX[f.k], o: f.k === 'glyph' ? { freq: [523.3, 659.3, 784, 1046.5][f.i | 0] } : f.k === 'drum' ? { pitch: 1 + 0.05 * (f.chant | 0) } : {} } : null;
  const TOASTX = { crateland: 'A supply crate landed at the workshop', shift: 'Shift change: every sound carries twice as far', rush: 'The rush: the belt pays double', surge: 'The ley line surges', steady: 'Steady Hands: the pins feel easier this round', attuned: 'Attuned: the stones light faster this round', safeopen: 'The master safe swings open', keycut: 'A Skeleton Key, cut true' };
  const callX = (o, fn, ...a) => { try { if (o && typeof o[fn] === 'function') o[fn](...a); } catch (e) {} };
  function driveX(sk, type, x, now) {   // now: server-clock epoch ms of the actS (absolute times in x are epoch ms)
    if (!sk || !x) return; const run = x.run || [], on = a => run.includes(a), lit = t => (t | 0) > now;
    if (type === 'ram') { callX(sk, 'setHeads', x.head | 0); callX(sk, 'setWear', x.wear | 0); callX(sk, 'setPlanks', x.planks | 0); callX(sk, 'setCrate', !!x.crate); callX(sk, 'setChant', x.chant | 0); callX(sk, 'setForging', on('S1')); callX(sk, 'setClimbing', on('S2')); callX(sk, 'setSawing', on('S3')); }
    else if (type === 'locksmith') { callX(sk, 'setFelt', lit(x.felt)); callX(sk, 'setSafe', x.safe || [0, 0, 0], !!x.jam); callX(sk, 'setShift', lit(x.shift)); }
    else if (type === 'counting') { callX(sk, 'setLot', x.lot ? x.lot.key : null, x.lot ? x.lot.bid | 0 : 0); callX(sk, 'setRush', lit(x.rush)); callX(sk, 'setNotes', (x.debts | 0)); callX(sk, 'setLedger', on('S3')); }
    else if (type === 'keystone') { const R = x.rite; callX(sk, 'setRite', R && R.show ? R.show : null, R ? R.pos | 0 : 0, !!R); callX(sk, 'setNode', x.node && x.node.holder != null ? 1 : 0, !!(x.node && x.node.contested)); callX(sk, 'setSurge', lit(x.surge)); callX(sk, 'setOffering', on('S3')); }
  }

  // ---- vaultbreakers: anchors B L R FL FR F
  const VB = {
    ram(a, st, me, env) {
      if (a === 'B') {
        if (st.swing) return [];
        if (me.timing && me.timing.a === 'B') return [act('E', 'Heave with the needle in the window', 'tap', 'B')];
        const h = st.handles || [];
        return list(act('E', 'Work the winch', 'use', 'B', h[0] && !h[1] ? 1 : 0), st.notches > 0 && act('R', 'Slacken the pawl', 'use', 'B', 2, true));
      }
      if (a === 'FL') return st.notches >= 2 && !st.swing ? list(act('E', 'Release the ram', 'use', 'FL', 0), has(env, 'x:runecharge') && act('R', 'Release it with a Rune Charge', 'use', 'FL', 1)) : [];
      if (a === 'F') {
        if (st.bar) return [act('E', 'Chop the barricade', 'tap', 'F')];
        return !st.swing && !env.sudden ? list(act('E', 'Build a barricade (2 metal)', 'buy', 'F', 0, true), (env.elixir | 0) >= 10 && act('R', 'Build it with 10 elixir', 'buy', 'F', 1, true), st.x && st.x.planks > 0 && act('Q', 'Set a stocked plank barricade', 'buy', 'F', 2, true)) : [];   // VBX: the workshop stock
      }
      return a === 'FR' && st.rack > 0 ? [act('E', 'Take an Iron Wedge', 'pick', 'FR')] : [];
    },
    locksmith(a, st, me, env) {
      if (a === 'L') return has(env, 'x:blank') ? [] : list(act('E', 'Grind a blank (2 metal)', 'use', 'L', 0, true), has(env, 'x:ironwedge') && act('R', 'Grind a blank from an Iron Wedge', 'use', 'L', 1, true));
      if (a !== 'B') return [];
      if (st.pins >= PINS) {
        if (!has(env, 'x:blank')) return [];
        return env.sudden ? list(act('E', 'Cut a Crown Seal', 'choose', 'B', 0, true), act('R', 'Cut a fence ticket (20 gold)', 'choose', 'B', 2, true))
          : list(act('E', 'Cut a lockpick', 'choose', 'B', 0, true), act('R', 'Cut a skeleton key', 'choose', 'B', 1, true), act('Q', 'Cut a fence ticket (20 gold)', 'choose', 'B', 2, true));
      }
      if (me.timing && me.timing.a === 'B') return [act('E', 'Set the pin with the needle in the window', 'tap', 'B')];
      return list(act('E', 'Pick the lock', 'use', 'B'), st.pins > 0 && act('R', 'Jiggle the pins (spoils it for others)', 'choose', 'B', 9));
    },
    counting(a, st, me, env) {
      if (a === 'B') {
        if (env.sudden) return env.leader ? [act('E', 'Put a bounty on the crown leader', 'buy', 'B', 2)] : [];
        return list(st.writs < 3 && act('E', 'Buy a writ (' + st.price + ' gold)', 'buy', 'B', 0), st.counters < st.writs && act('R', 'Buy a counter-writ', 'buy', 'B', 1));
      }
      if (a === 'R') return me.carry ? [] : list(st.boxStage > 0 && act('E', 'Rob the strongbox (the alarm rings)', 'use', 'R', 0, true), st.boxStage > 0 && has(env, 'x:skeleton') && act('R', 'Pick the strongbox quietly', 'use', 'R', 1, true));
      return [];
    },
    keystone(a, st, me, env) {
      if (a === 'B') return has(env, 'x:goldleaf') && !st.armed ? [act('E', 'Offer the Gold Leaf', 'use', 'B', null, true)] : [];
      const i = STONE_ORDER.indexOf(a); if (i < 0) return [];
      const lit = st.lit && st.lit[i] > 0;
      return list(act('E', lit ? 'Feed the flame' : 'Light the rune stone', 'use', a, null, true), lit && act('R', 'Snuff the flame', 'choose', a, 1, true));
    },
  };

  // ---- the vault: coffers K1..K4 and the bar racks D_N D_E D_S D_W (the dais needs no key: stand on it)
  function vault(a, st, me, env) {
    if (/^K[1-4]$/.test(a)) return st.cof && st.cof[a] >= 1 && !(me.carry && me.carry.heavy) ? [act('E', 'Scoop the gold', 'use', a, null, true)] : [];
    if (/^D_[NESW]$/.test(a)) { const dir = a[2]; return env.sudden || st.alarm || (st.bars || []).includes(dir) || !(env.doorOpen && env.doorOpen(dir)) ? [] : [act('E', 'Bar this door at the end of the round', 'use', a, null, true)]; }
    return [];
  }

  // options(kind, type, anchor, st, me, env) -> [action]; st / me may be null
  function options(kind, type, a, st, me, env) {
    st = st || null; me = me || {}; env = env || {};
    if (!st) return [];
    if (kind === 'tree') return (TREE[type] || (() => []))(a, st, me, env) || [];
    if (kind === 'vb') {
      const sack = env.sack; if (type === 'counting' && sack) return [act('E', 'Pick up the coin sack', 'pick', a, sack.id)];
      if (XA.test(a)) return (VX[type] || (() => []))(a, st.x || {}, me, env, st) || [];   // VBX stations
      return (VB[type] || (() => []))(a, st, me, env) || [];
    }
    if (kind === 'vault') return vault(a, st, me, env) || [];
    return [];
  }
  // the anchor to use from (x, z): the closest to the player among those whose options are not empty and within reach (r + 1.3: the server accepts r + 1.4). anchors: { id: {x, z, r} } in world metres.
  function pick(kind, type, anchors, st, me, env, x, z, pad) {
    let best = null, bd = 1e9; pad = pad == null ? 1.3 : pad;
    if (kind === 'vb' && type === 'counting' && env && env.sack && st) return { a: 'B', acts: options(kind, type, 'B', st, me, env) };   // a dropped coin sack can be taken from anywhere in the room (the server checks 1.8 m)
    for (const id of Object.keys(anchors)) {
      const an = anchors[id], d = Math.hypot(x - an.x, z - an.z); if (d > an.r + pad) continue;
      const acts = options(kind, type, id, st, me, env); if (!acts.length) continue;
      const score = d - an.r; if (score < bd) { bd = score; best = { a: id, acts }; }
    }
    return best;
  }
  return { options, pick, BLESS, PINS, STONE_ORDER, LABELX, TOASTX, sound, driveX };
});

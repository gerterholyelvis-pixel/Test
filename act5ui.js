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
      if (!st.basins || !(st.basins[a] >= 1)) return [];
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
        return !st.swing && !env.sudden ? list(act('E', 'Build a barricade (2 metal)', 'buy', 'F', 0, true), (env.elixir | 0) >= 10 && act('R', 'Build it with 10 elixir', 'buy', 'F', 1, true)) : [];
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
  return { options, pick, BLESS, PINS, STONE_ORDER };
});

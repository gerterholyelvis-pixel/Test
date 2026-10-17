// ITEM AFFIXES (docs/reports/variety.md). Works in the browser (window.GKAFFIX) and in Node (require('./affix.js')).
// Found weapons and armour can roll 0-2 small affixes. The item key carries them: 'w:sword@keen,heavy', reforged 'w:sword@keen+' (items.js mints the real item on demand).
// Shop stock, crafted gear and starter gear never roll. Every effect is small and the total is capped (CAP) so an affixed item never beats a clearly better tier.
(function (root) {
  // fields: atk / hp = fraction of the stat, cd = fraction added to the swing time (negative = faster), rng = fraction of reach, spd = fraction of walk speed,
  // thorns = flat, bleed = [chance, ticks, share of attack per tick], leech = share of damage dealt healed (min 1). `pre` is a prefix, `suf` a suffix of the name.
  const AFFIXES = {
    keen:     { type: 'weapon', pre: 'Keen',     atk: 0.08, text: '+8% attack' },
    heavy:    { type: 'weapon', pre: 'Heavy',    atk: 0.14, cd: 0.12, text: '+14% attack, 12% slower swings' },
    swift:    { type: 'weapon', pre: 'Swift',    cd: -0.06, text: '6% faster swings' },
    long:     { type: 'weapon', pre: 'Long',     rng: 0.1, text: '+10% reach' },
    balanced: { type: 'weapon', pre: 'Balanced', atk: 0.04, cd: -0.03, text: '+4% attack, 3% faster swings' },
    jagged:   { type: 'weapon', pre: 'Jagged',   bleed: [0.25, 2, 0.06], text: '25% of hits make the target bleed' },
    embers:   { type: 'weapon', suf: 'of Embers', bleed: [0.2, 3, 0.05], text: '20% of hits set the target burning' },
    vamp:     { type: 'weapon', pre: 'Vampiric', leech: 0.06, text: 'heals you for 6% of damage dealt (at least 1)' },
    sturdy:   { type: 'armor',  pre: 'Sturdy',   hp: 0.1, text: '+10% health' },
    hardy:    { type: 'armor',  pre: 'Hardy',    hp: 0.14, spd: -0.03, text: '+14% health, 3% slower' },
    fleet:    { type: 'armor',  pre: 'Fleet',    spd: 0.04, text: '4% faster' },
    lithe:    { type: 'armor',  pre: 'Lithe',    hp: -0.06, spd: 0.06, text: '6% faster, 6% less health' },
    thorny:   { type: 'armor',  pre: 'Thorny',   thorns: 1, text: 'melee attackers take 1 damage back' },
    spines:   { type: 'armor',  suf: 'of Spines', thorns: 2, hp: -0.05, text: 'melee attackers take 2 damage back, 5% less health' },
  };
  const IDS = Object.keys(AFFIXES), CAP = 1.15, MAX_SPEED_MUL = 1.06;   // CAP: the most an affixed item may be worth compared with the plain one (see power())
  const CHANCE = [0, 0.12, 0.2, 0.3, 0.4, 0.5], SECOND = 0.35;   // chance of a first affix by tier number (0 never), then of a second given the first

  const parse = key => {   // 'w:sword@keen,heavy' -> { root: 'w:sword', ids: ['keen','heavy'] }; 'w:sword@keen+' -> root 'w:sword+'. null when it is not an affixed key.
    if (typeof key !== 'string' || key.length > 60) return null;
    const at = key.indexOf('@'); if (at < 3) return null;
    let tail = key.slice(at + 1), root = key.slice(0, at); if (tail.endsWith('+')) { tail = tail.slice(0, -1); root += '+'; }
    const ids = tail.split(','); if (!ids.length || ids.length > 2 || new Set(ids).size !== ids.length) return null;
    for (const id of ids) if (!Object.prototype.hasOwnProperty.call(AFFIXES, id)) return null;
    return { root, ids };
  };
  const keyOf = (root, ids) => { const up = root.endsWith('+'); return (up ? root.slice(0, -1) : root) + '@' + ids.join(',') + (up ? '+' : ''); };

  // Apply affixes to a plain item (items.js item object `it`, and `cb` = its combat() numbers for weapons). Returns the changed fields; deterministic.
  function effect(it, ids, cb) {
    const sum = f => ids.reduce((a, id) => a + (AFFIXES[id][f] || 0), 0), out = {};
    if (it.type === 'weapon') {
      const atk = sum('atk'); out.attack = atk > 0 ? it.attack + Math.max(1, Math.round(it.attack * atk)) : it.attack;
      out.cdMul = 1 + sum('cd'); out.rngMul = 1 + sum('rng');
      const bl = ids.map(id => AFFIXES[id].bleed).filter(Boolean)[0];   // one bleed source counts (the first)
      if (bl) out.bleedAff = { chance: bl[0], ticks: bl[1], dmg: Math.max(1, Math.round(out.attack * bl[2])) };
      const lc = sum('leech'); if (lc) out.leech = lc;
    } else {
      const hp = sum('hp'); out.health = Math.max(1, it.health + (hp ? (hp > 0 ? Math.max(1, Math.round(it.health * hp)) : Math.round(it.health * hp)) : 0));
      const sp = sum('spd'); if (sp) out.speed = Math.round((it.speed || 1) * (1 + sp) * 1000) / 1000;
      const th = sum('thorns'); if (th) out.thorns = (it.thorns || 0) + th;
    }
    return out;
  }
  // power(): one number for "how good is this item", used to cap affixes. Weapons: attack per second-equivalent, bleed counted at expected damage, leech at half value, reach at half value.
  // Armour: the bots' armorScore formula (health, adjusted for speed, 1 thorn = 6 health).
  function power(it, fx) {
    const v = fx ? { ...it, ...fx } : it;
    if (it.type === 'weapon') {
      const cd = (v.cdMul || 1), bl = v.bleedAff ? v.bleedAff.chance * v.bleedAff.dmg * v.bleedAff.ticks : 0;
      return (v.attack + bl) / cd * (1 + 0.5 * ((v.rngMul || 1) - 1)) * (1 + (v.leech ? 0.5 * v.leech : 0));
    }
    return v.health * (1 + 2 * ((v.speed || 1) - 1)) + (v.thorns || 0) * 6;
  }
  const withinCap = (it, ids, cb) => { const base = power(it), p = power(it, effect(it, ids, cb)); return p <= Math.max(base * CAP, base + 1) + 1e-9; };   // +1 allowance: tiny weapons round up
  const eligible = (it, have, cb) => IDS.filter(id => AFFIXES[id].type === it.type && !have.includes(id) && withinCap(it, have.concat(id), cb));

  // mulberry32: the roll is a pure function of (root key, seed)
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  function roll(it, seed, cb) {   // -> array of 0-2 affix ids for found gear of this item; same item + seed = same answer
    if (!it || (it.type !== 'weapon' && it.type !== 'armor') || !(it.chance > 0)) return [];   // chance 0 = starter / bench-made / class gear: never rolls
    const r = rng(seed), ids = [];
    if (r() >= (CHANCE[it.tierN | 0] || 0)) return ids;
    for (let n = 0; n < 2; n++) {
      if (n === 1 && r() >= SECOND) break;
      const pool = eligible(it, ids, cb); if (!pool.length) break;
      ids.push(pool[Math.floor(r() * pool.length)]);
    }
    return ids;
  }
  const nameOf = (name, ids) => ids.filter(id => AFFIXES[id].pre).map(id => AFFIXES[id].pre).concat(name, ids.filter(id => AFFIXES[id].suf).map(id => AFFIXES[id].suf)).join(' ');
  const textOf = ids => ids.map(id => AFFIXES[id].text);
  root.GKAFFIX = { AFFIXES, IDS, CAP, MAX_SPEED_MUL, CHANCE, parse, keyOf, effect, power, roll, eligible, withinCap, nameOf, textOf, rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GKAFFIX;
})(typeof window !== 'undefined' ? window : globalThis);

// Saved progress (browser only): items kept from won runs (the stash) and saved characters with their victory counts.
(function () {
  const KEY = 'gk.save.v1';
  let mem = null;   // used when localStorage is unavailable
  const blank = () => ({ stash: [], characters: [], nextId: 1, parts: {} });
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.stash) && Array.isArray(s.characters)) return s; } catch (e) {}
    return mem || blank();
  }
  function store(s) { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  const score = i => (i.tierN || 0) * 1000 + (i.price || 0);
  const NAMES = [['Nib', 'Snik', 'Grub', 'Wort', 'Pip'], ['Gruk', 'Brask', 'Mog', 'Skarn', 'Dreg'], ['Thok', 'Gorbash', 'Ugrak', 'Brug', 'Zog'], ['Mizzle', 'Zarn', 'Quill', 'Ombra', 'Vexil'], ['Krag the King', 'Morgul', 'Grimble', 'Ozzar', 'Velkor'],
    ['Flit', 'Skeet', 'Ranz', 'Tikka', 'Quik'], ['Shiv', 'Murk', 'Sliss', 'Nox', 'Wisp'], ['Durk', 'Grubnik', 'Pebble', 'Clank', 'Rusk'], ['Ooga', 'Hexa', 'Bonesy', 'Mumbo', 'Vetch'],   // GOBTYPES: scout, sneak, miner, shaman
    ['Rakka', 'Gorm', 'Skull', 'Brakk', 'Rend'], ['Glub', 'Murla', 'Sloog', 'Bogwin', 'Reedle'], ['Kazgar', 'Vorn', 'Ruskar', 'Toreth', 'Ashka']];   // berserker, bog goblin, hobgoblin
  // STATS-BEGIN: lifetime statistics live under their own key (versioned inside, see stats.js), so the stash and characters above are never touched by them
  const SKEY = 'gk.stats.v1'; let smem = null;
  const sNorm = r => (window.GKSTATS ? GKSTATS.normalize(r) : r);
  function statsLoad() {
    try { const raw = localStorage.getItem(SKEY); if (raw) return sNorm(JSON.parse(raw)); } catch (e) {}
    return smem || sNorm(null);
  }
  function statsStore(s) { smem = s; try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} }
  // STATS-END
  // KEEP-BEGIN (save version 2, docs/reports/keep-on-win.md). Per character, all optional so version 1 saves load unchanged:
  //   c.keep = { tok, i: [item keys], b: bank gold }   the server-signed stash (the server re-checks everything; this is a copy to show and to send back)
  //   c.offer = { otok, how, n, items, trophies, stipend, why, x }   a "choose what to keep" offer not claimed yet (x: expiry)
  //   c.load = [item keys]   the last start loadout; c.trophies = [keys] transcendent items it won with; s.hall = retired characters
  // The old global s.stash (version 1, unsigned, never brought into a match) stays as display-only "old relics".
  const VER = 2;
  function keepWin(c, k) {
    if (typeof k.otok === 'string') c.offer = { otok: k.otok, how: k.how, n: k.n | 0, items: Array.isArray(k.items) ? k.items : [], trophies: k.trophies || [], stipend: k.stipend | 0, why: k.why || '', x: Date.now() + 7 * 864e5 };
    if (typeof k.tok === 'string') c.keep = { tok: k.tok, i: Array.isArray(k.i) ? k.i : [], b: k.b | 0 };
    if (Array.isArray(k.trophies) && k.trophies.length) c.trophies = (c.trophies || []).concat(k.trophies).slice(-24);
  }
  function keepEdit(id, f) { const s = load(); s.ver = VER; const c = s.characters.find(x => x.id === id); if (!c) return null; f(c, s); store(s); return c; }
  const keepApi = {
    ver: VER,
    keepOf: id => { const c = load().characters.find(x => x.id === id); return c && c.keep ? c.keep : { tok: '', i: [], b: 0 }; },
    setKeep: (id, v) => keepEdit(id, c => { if (v && typeof v.tok === 'string') c.keep = { tok: v.tok, i: Array.isArray(v.i) ? v.i : [], b: v.b | 0 }; }),
    setOffer: (id, o) => keepEdit(id, c => { if (o) keepWin(c, o); else delete c.offer; }),
    setLoad: (id, keys) => keepEdit(id, c => { c.load = Array.isArray(keys) ? keys.slice(0, 5) : []; }),
    retire: id => keepEdit(id, (c, s) => { s.hall = (s.hall || []).concat({ name: c.name, goblin: c.goblin, wins: c.wins | 0, best: c.best || null, t: Date.now() }).slice(-50); s.characters = s.characters.filter(x => x !== c); }),
    hall: () => load().hall || [],
  };
  // KEEP-END
  window.GKSAVE = {
    ...keepApi,   // KEEP
    load,
    stash: () => load().stash,
    parts: () => load().parts || {},   // recycled parts brought back from won runs: { wood: n, metal: n, ... }
    characters: () => load().characters,
    getCharacter: id => load().characters.find(c => c.id === id) || null,
    // A won run: the character is saved (or gets another victory) and everything it carried goes to the stash.
    recordWin({ charId, goblin, items, parts, name, token, keep }) {   // KEEP: keep = the server's offer ({won}.keep); with it nothing goes to the old global stash, the goblin chooses its keepsakes instead   // token: the server's signed character token (proves goblin, victories and name on the next join)   // name: the name the server gave this goblin in the match; a NEW character keeps it, so the feed, standings and victory card agree
      const s = load();
      let c = charId != null ? s.characters.find(x => x.id === charId) : null;
      if (!c) {
        const used = new Set(s.characters.map(x => x.name)), pool = NAMES[goblin] || NAMES[0];
        const given = String(name || '').replace(/[^A-Za-z0-9 '-]/g, '').trim().slice(0, 14);
        const nm = given && !used.has(given) ? given : (pool.find(n => !used.has(n)) || pool[Math.floor(Math.random() * pool.length)] + ' ' + (s.nextId));
        c = { id: s.nextId++, goblin, name: nm, wins: 0 }; s.characters.push(c);
      }
      c.wins++; c.lastWin = Date.now();
      if (typeof token === 'string' && token) { c.token = token; c.goblin = goblin; }   // the server rolled this goblin; the local victory count is for display only
      for (const it of items || []) { const k = typeof it === 'string' ? it : it && it.key, i = k && window.GKITEMS && GKITEMS.info && GKITEMS.info(k); if (i && (!c.best || score(i) > score(GKITEMS.info(c.best) || {}))) c.best = k; }   // the best thing this goblin ever brought home (shown on its card)
      if (keep && typeof keep === 'object') keepWin(c, keep); else for (const it of items || []) if (it) s.stash.push(it);   // KEEP
      s.parts = s.parts || {}; for (const k in parts || {}) if (parts[k] > 0) s.parts[k] = (s.parts[k] || 0) + (parts[k] | 0);
      store(s); return c;
    },
    clearAll() { store(blank()); },
    stats: statsLoad, saveStats: statsStore, clearStats() { smem = null; try { localStorage.removeItem(SKEY); } catch (e) {} },   // STATS
  };
})();
// SOCIAL: a reload during a match (token stored < 15 s ago, see game.js SOCIAL block) resumes it: keep the title hidden from the first paint
try { if (sessionStorage.getItem('gk.token') && Date.now() - +sessionStorage.getItem('gk.tokenT') < 15000) document.documentElement.classList.add('gkResume'); } catch (e) {}

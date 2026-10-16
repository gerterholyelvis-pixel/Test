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
  const NAMES = [['Nib', 'Snik', 'Grub', 'Wort', 'Pip'], ['Gruk', 'Brask', 'Mog', 'Skarn', 'Dreg'], ['Thok', 'Gorbash', 'Ugrak', 'Brug', 'Zog'], ['Mizzle', 'Zarn', 'Quill', 'Ombra', 'Vexil'], ['Krag the King', 'Morgul', 'Grimble', 'Ozzar', 'Velkor']];
  window.GKSAVE = {
    load,
    stash: () => load().stash,
    parts: () => load().parts || {},   // recycled parts brought back from won runs: { wood: n, metal: n, ... }
    characters: () => load().characters,
    getCharacter: id => load().characters.find(c => c.id === id) || null,
    // A won run: the character is saved (or gets another victory) and everything it carried goes to the stash.
    recordWin({ charId, goblin, items, parts, name, token }) {   // token: the server's signed character token (proves goblin, victories and name on the next join)   // name: the name the server gave this goblin in the match; a NEW character keeps it, so the feed, standings and victory card agree
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
      for (const it of items || []) if (it) s.stash.push(it);
      s.parts = s.parts || {}; for (const k in parts || {}) if (parts[k] > 0) s.parts[k] = (s.parts[k] || 0) + (parts[k] | 0);
      store(s); return c;
    },
    clearAll() { store(blank()); },
  };
})();

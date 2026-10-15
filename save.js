// Saved progress (browser only): items kept from won runs (the stash) and saved characters with their victory counts.
(function () {
  const KEY = 'gk.save.v1';
  let mem = null;   // used when localStorage is unavailable
  const blank = () => ({ stash: [], characters: [], nextId: 1 });
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.stash) && Array.isArray(s.characters)) return s; } catch (e) {}
    return mem || blank();
  }
  function store(s) { mem = s; try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  const NAMES = [['Nib', 'Snik', 'Grub', 'Wort', 'Pip'], ['Gruk', 'Brask', 'Mog', 'Skarn', 'Dreg'], ['Thok', 'Gorbash', 'Ugrak', 'Brug', 'Zog'], ['Mizzle', 'Zarn', 'Quill', 'Ombra', 'Vexil'], ['Krag the King', 'Morgul', 'Grimble', 'Ozzar', 'Velkor']];
  window.GKSAVE = {
    load,
    stash: () => load().stash,
    characters: () => load().characters,
    getCharacter: id => load().characters.find(c => c.id === id) || null,
    // A won run: the character is saved (or gets another victory) and everything it carried goes to the stash.
    recordWin({ charId, goblin, items }) {
      const s = load();
      let c = charId != null ? s.characters.find(x => x.id === charId) : null;
      if (!c) {
        const used = new Set(s.characters.map(x => x.name)), pool = NAMES[goblin] || NAMES[0];
        let name = pool.find(n => !used.has(n)) || pool[Math.floor(Math.random() * pool.length)] + ' ' + (s.nextId);
        c = { id: s.nextId++, goblin, name, wins: 0 }; s.characters.push(c);
      }
      c.wins++; c.lastWin = Date.now();
      for (const it of items || []) if (it) s.stash.push(it);
      store(s); return c;
    },
    clearAll() { store(blank()); },
  };
})();

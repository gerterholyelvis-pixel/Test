// MATCH MUTATORS (docs/reports/variety.md). UMD: window.GKMUT in the browser, require('./mutators.js') in Node.
// A match rolls 0 or 1 mutator (30% in public matches). Every parameter is a bounded multiplier read by the server through mul(id, key); the client only shows name and text.
(function (root) {
  const MUT = {
    elixir2:  { name: 'Double Elixir', text: 'Every pump fills twice as fast.', p: { pump: 2 } },
    brains:   { name: 'Brain Rain', text: 'Brains are worth 50% more, and mystery-room enemies drop one.', p: { brain: 1.5, npcBrain: 1 } },
    glass:    { name: 'Glass Cannon', text: 'Everyone hits 30% harder and has 30% less health.', p: { dmg: 1.3, hp: 0.7 } },
    fastdoors:{ name: 'Fast Doors', text: 'The first three rounds are 30 s shorter.', p: { early: 0.75, earlyRounds: 3 } },
    scavenger:{ name: 'Scavenger', text: 'Chests and loot rooms refill every round.', p: { refill: 1 } },
    bounty:   { name: 'Bounty Hunt', text: 'One goblin has a bounty: 100 gold to whoever takes them down. It moves on after.', p: { bounty: 100 } },
    fog:      { name: 'Fog', text: 'Thick fog: you and the bots see less far.', p: { sight: 0.6 } },
    gold:     { name: 'Heavy Gold', text: 'Round income is 2.5 times bigger and gold prizes pay 50% more.', p: { income: 2.5, prize: 1.5 } },
  };
  const IDS = Object.keys(MUT), CHANCE = 0.3;
  const has = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MUT, id);
  const mul = (id, key, dflt) => has(id) && MUT[id].p[key] != null ? MUT[id].p[key] : (dflt == null ? 1 : dflt);   // 1 when the mutator does not touch this number
  const roll = rnd => { const r = rnd || Math.random; return r() < CHANCE ? IDS[Math.floor(r() * IDS.length)] : null; };
  const pub = id => has(id) ? { id, name: MUT[id].name, text: MUT[id].text } : null;
  root.GKMUT = { MUT, IDS, CHANCE, has, mul, roll, pub };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.GKMUT;
})(typeof window !== 'undefined' ? window : globalThis);

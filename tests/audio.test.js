// audio.js: every sound builds without throwing against a stub WebAudio, family mapping falls back sensibly, rate limits hold.
const L = require('./lib.js'), { assert, eq } = L;
(async () => {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => { const n = { connect() { return n; }, start() {}, stop() { if (n.onended) n.onended(); }, frequency: param(), gain: param(), Q: param(), detune: param(), pan: param(), playbackRate: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; return n; };
  let created = 0;
  class Ctx {
    constructor() { this.currentTime = 1; this.state = 'running'; this.sampleRate = 8000; this.destination = node(); }
    createGain() { created++; return node(); } createOscillator() { created++; return node(); } createBiquadFilter() { created++; return node(); }
    createBufferSource() { created++; return node(); } createStereoPanner() { created++; return node(); } createDynamicsCompressor() { return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(16000) }; } resume() { return Promise.resolve(); }
  }
  global.window = global; global.AudioContext = Ctx; global.addEventListener = () => {}; global.GK = { settings: { vol: 1, sfx: 1, amb: 1 } };
  require('../audio.js');
  const A = global.GKAUDIO; A.resume();
  const fail = await L.run('audio', [
    ['every sound plays without throwing', async () => {
      for (const n of A.names) { created = 0; assert(A.play(n, { fam: 'sword', armor: 'plate', surf: 'vault', sprint: true, x: 3, z: 2 }), n + ' should play'); assert(created > 0, n + ' builds nodes'); }
    }],
    ['weapon families map to sound classes, unknown ones fall back by name then to blade', async () => {
      eq(A.weaponClass('sword'), 'blade'); eq(A.weaponClass('hammer'), 'heavy'); eq(A.weaponClass('crossbow'), 'xbow'); eq(A.weaponClass(null), 'fist');
      eq(A.weaponClass('warbow'), 'bow'); eq(A.weaponClass('glaive'), 'pole'); eq(A.weaponClass('zzz'), 'blade'); eq(A.weaponClass('wand'), 'magic');
    }],
    ['armour families map to materials with a fallback', async () => {
      eq(A.armorClass('plate'), 'plate'); eq(A.armorClass('robe'), 'cloth'); eq(A.armorClass('chainshirt'), 'mail'); eq(A.armorClass(null), 'flesh'); eq(A.armorClass('weird'), 'leather');
    }],
    ['item sounds pick by type and family', async () => {
      eq(A.itemSound({ type: 'consumable', family: 'potion' }, 'use'), 'drink'); eq(A.itemSound({ type: 'consumable', family: 'plushie' }, 'use'), 'squeak');
      eq(A.itemSound({ type: 'consumable', family: 'brain' }, 'use'), 'eat'); eq(A.itemSound({ type: 'weapon', family: 'sword' }, 'equip'), 'equip'); eq(A.itemSound(null, 'use'), 'pickup');
    }],
    ['rapid repeats of a limited sound are gated', async () => {
      A.play('hit', {}); eq(A.play('hit', {}), false, 'second hit inside the gap is dropped');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

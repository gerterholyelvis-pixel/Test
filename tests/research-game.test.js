// research-game: pure parts of the RESEARCH-GAME changes: recap5 (death recap, assists, streaks, highlights), daily5 (date-seeded challenges),
// music5 (layer intensity), audio.js DUCK, game.js NETQ wording and hooks (static). docs/reports/research-game.md
const L = require('./lib.js'), { assert, eq } = L, fs = require('fs'), path = require('path');
const R = require('../client/recap5.js'), D = require('../client/daily5.js'), M = require('../client/music5.js');
const ROOT = path.join(__dirname, '..');
(async () => {
  const fail = await L.run('research-game', [
    ['recap: damage grouped by source in the last 12 s, killer marked, flags make the tip', async () => {
      const v = { id: 9, name: 'Vic' }, a = { id: 1, name: 'Ana' }, b = { id: 2, name: 'Bob' };
      R.note(v, a, 10, 1000, 'Old Sword');   // too old by the time of death
      R.note(v, a, 20, 9000, 'Spear', { bs: 1 }); R.note(v, b, 15, 10000, 'Club'); R.note(v, a, 30, 14000, 'Spear', { bs: 1 });
      v.killedBy = 1; v.killer = { name: 'Ana', npc: false };
      const rc = R.died(v, 14500);
      eq(rc.src.length, 2); eq(rc.src[0][0], 'Ana'); eq(rc.src[0][2], 50, 'old hit dropped'); eq(rc.src[0][3], 2); eq(rc.src[0][4], 1, 'killer marked'); eq(rc.src[1][4], 0);
      assert(/2 goblins/.test(rc.tip), 'gang tip first: ' + rc.tip);
      const solo = { id: 8 }; R.note(solo, a, 40, 0, 'Spear', { bs: 1 }); R.note(solo, a, 10, 100, 'Spear');
      assert(/behind/.test(R.died(solo, 200).tip), 'backstab tip');
      const bl = { id: 7 }; R.note(bl, a, 10, 0, 'Whip'); R.note(bl, a, 12, 50, '', { bleed: 1 }); assert(/Bleeding/.test(R.died(bl, 100).tip), 'bleed tip');
      eq(R.sources(bl, 100)[0].w, 'Whip', 'a bleed tick keeps the weapon name');
      eq(R.died({ id: 3 }, 0).src.length, 0, 'no log, empty recap'); eq(R.deathHtml({ src: [] }), '');
      assert(R.deathHtml(rc).includes('Ana') && R.deathHtml(rc).includes('&#9760;'), 'death html');
      assert(!R.deathHtml({ src: [['<b>x', '', 5, 1, 0, 0]], tip: '' }).includes('<b>x'), 'escaped');
      eq(a.rc5.big, 40, 'biggest single hit is tracked on the attacker (bleed ticks do not count)'); eq(b.rc5.big, 15);
    }],
    ['recap: assists, streaks, multi-kills, shutdowns; mystery enemies make none', async () => {
      const k = { id: 1, name: 'K' }, h = { id: 2, name: 'H' }, v1 = { id: 3, name: 'V1' }, v2 = { id: 4, name: 'V2' }, v3 = { id: 5, name: 'V3' };
      R.note(v1, h, 10, 0); R.note(v1, k, 20, 1000);
      let x = R.kill(k, v1, 1000); eq(x.a, ['H']); eq(x.ax, [2]); assert(!x.st && !x.mk, 'first kill: no streak line');
      x = R.kill(k, v2, 3000); eq(x.mk, 2, 'double kill'); assert(!x.a, 'no assist');
      x = R.kill(k, v3, 20000); eq(x.st, 3, '3 in a row'); assert(!x.mk, 'too late for a multi');
      eq(k.rc5.best, 3); x = R.kill(h, k, 21000); eq(x.sh, 3, 'shutdown of a 3-streak'); eq(k.rc5.streak, 0);
      R.note(v2, h, 5, 0); eq(R.kill(k, v2, 20000).a, undefined, 'assist window is 10 s');
      const npc = { id: 6, npc: true, name: 'Archer' }; R.note(npc, h, 5, 0); eq(Object.keys(R.kill(k, npc, 1)).length, 0, 'npc victim: nothing');
      eq(R.credit(h), 1); eq(R.credit(h), 2);
      const s = R.feedSuffix({ a: ['H'], mk: 2, sh: 4 }); assert(s.includes('+ H') && s.includes('DOUBLE KILL') && s.includes('4-kill'), s);
      eq(R.feedSuffix(null), ''); eq(R.feedSuffix({}), '');
    }],
    ['recap: highlights only for awards somebody earned', async () => {
      const aw = R.awards([{ name: 'A', dd: 120, best: 1, assists: 0, big: 40 }, { name: 'B', dd: 300, best: 3, assists: 2, big: 25 }]);
      eq(aw.map(a => a[0]), ['Most damage', 'Best streak', 'Most assists', 'Biggest hit']); eq(aw[0][1], 'B'); eq(aw[3][1], 'A');
      eq(R.awards([{ name: 'A', dd: 0, best: 1, assists: 0, big: 0 }]).length, 0);
      eq(R.rowOf({ name: 'Z', st5: { dd: 7 }, kills: 2, rc5: { assists: 1, best: 2, big: 9 } }), { name: 'Z', dd: 7, kills: 2, assists: 1, best: 2, big: 9 });
      assert(R.awardsHtml(aw).includes('Highlights')); eq(R.awardsHtml([]), '');
    }],
    ['daily: the same three distinct challenges for a date, different days differ, goals come from the pool', async () => {
      const day = D.dayOf(Date.UTC(2026, 9, 17, 12)); eq(day, 20261017);
      eq(D.pick(day), D.pick(day)); eq(new Set(D.pick(day).map(c => c.id)).size, 3);
      let diff = 0; for (let i = 0; i < 20; i++) if (JSON.stringify(D.pick(day + i)) !== JSON.stringify(D.pick(day + i + 1))) diff++; assert(diff >= 18, 'days differ');
      for (const c of D.pick(day)) { const p = D.POOL.find(q => q.id === c.id); assert(p.g.includes(c.n), c.id); }
      eq(D.prevDay(20261101), 20261031); eq(D.prevDay(20260101), 20251231);
    }],
    ['daily: counters from messages, a match settles once, placement counts, streak across days', async () => {
      const s = D.fresh(20261017, null); s.me = 5;
      D.event(s, { matchStart: { you: 5 } }); D.event(s, { kills: 1 }); D.event(s, { kills: 2 }); D.event(s, { assist: 1 });
      D.event(s, { died: { st: { dd: 150, ex: 12, ge: 40, rd: 3 } } });
      D.event(s, { matchEnd: { places: [{ id: 5, place: 2 }], stats: { 5: { dd: 999 } } } });
      eq(s.c.kills, 2); eq(s.c.assists, 1); eq(s.c.dd, 150, 'not counted twice'); eq(s.c.matches, 1); eq(s.c.top3, 1); eq(s.c.rd, 3);
      D.event(s, { matchStart: { you: 5 } }); D.event(s, { matchEnd: { places: [{ id: 5, place: 6 }], stats: { 5: { dd: 50, rd: 2 } } } });
      eq(s.c.dd, 200); eq(s.c.matches, 2); eq(s.c.top3, 1); eq(s.c.rd, 3, 'round is a best, not a sum');
      eq(D.event(s, { kills: 9 }) && s.c.kills, 2 + 9, 'the second match kills count from 0');
      for (const c of D.pick(s.day)) s.c[c.k] = 1e6; D.progress(s); eq(s.streak, 1); eq(s.full, 20261017);
      const t = D.fresh(20261018, s); for (const c of D.pick(t.day)) t.c[c.k] = 1e6; D.progress(t); eq(t.streak, 2, 'consecutive days');
      const u = D.fresh(20261021, { streak: 2, full: 20261018 }); for (const c of D.pick(u.day)) u.c[c.k] = 1e6; D.progress(u); eq(u.streak, 1, 'a gap resets');
      eq(D.event(D.fresh(1, null), { kills: 3 }), false, 'nothing before a match starts');
    }],
    ['music: layer intensity rules', async () => {
      const s = { fight: -1e9, low: -1e9, crown: -1e9, sudden: false, play: true };
      eq(M.mix(s, 0), { calm: 1, pulse: 0, tension: 0 });
      M.event(s, { hit: { from: 1, to: 2, hp: 50, max: 100 } }, 7, 1000); eq(M.mix(s, 1000).pulse, 0, 'other goblins fighting is not my fight');
      M.event(s, { hit: { from: 7, to: 2, hp: 50, max: 100 } }, 7, 1000); eq(M.mix(s, 2000).pulse, 1); assert(M.mix(s, 1000 + 10000).pulse < 1 && M.mix(s, 1000 + 10000).pulse > 0, 'fading'); eq(M.mix(s, 1000 + 13000).pulse, 0);
      M.event(s, { hit: { from: 2, to: 7, hp: 20, max: 100 } }, 7, 5000); eq(M.mix(s, 6000).tension, 1, 'low health'); eq(M.mix(s, 5000 + 16000).tension, 0);
      M.event(s, { crown: { id: 3 } }, 7, 30000); eq(M.mix(s, 31000).tension, 1); M.event(s, { crown: null }, 7, 31500); eq(M.mix(s, 31600).tension, 0);
      M.event(s, { sudden: 1 }, 7, 40000); eq(M.mix(s, 99999).tension, 1); M.event(s, { matchStart: {} }, 7, 50000); eq(s.sudden, false);
      s.play = false; eq(M.mix(s, 0), { calm: 0, pulse: 0, tension: 0 });
    }],
    ['audio DUCK: ducking dips and never makes a running duck shallower; big sounds duck', async () => {
      const calls = [];
      const param = (nm) => ({ value: 1, setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime() {}, setTargetAtTime(v) { if (nm === 'duck') calls.push(['target', v]); }, linearRampToValueAtTime(v) { if (nm === 'duck') { calls.push(['ramp', v]); this.value = v; } }, cancelScheduledValues() {} });
      let gains = 0;
      const node = (nm) => { const n = { connect() { return n; }, start() {}, stop() { if (n.onended) n.onended(); }, frequency: param(), gain: param(nm), Q: param(), detune: param(), pan: param(), playbackRate: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; return n; };
      class Ctx { constructor() { this.currentTime = 1; this.state = 'running'; this.sampleRate = 8000; this.destination = node(); }
        createGain() { gains++; return node(gains === 4 ? 'duck' : ''); } createOscillator() { return node(); } createBiquadFilter() { return node(); }
        createBufferSource() { return node(); } createStereoPanner() { return node(); } createDynamicsCompressor() { return node(); }
        createBuffer() { return { getChannelData: () => new Float32Array(16000) }; } resume() { return Promise.resolve(); } }
      global.window = global; global.AudioContext = Ctx; global.addEventListener = () => {}; global.GK = { settings: { vol: 1, sfx: 1, amb: 1 } };
      delete require.cache[require.resolve('../audio.js')]; require('../audio.js');
      const A = global.GKAUDIO; A.resume();
      assert(A.duck(0.4, 1), 'duck runs'); eq(calls[0], ['ramp', 0.4]); eq(calls[1], ['target', 1]);
      calls.length = 0; A.duck(0.8, 1); eq(calls[0], ['ramp', 0.4], 'a shallower duck keeps the deeper level');
      calls.length = 0; assert(A.play('gong'), 'gong plays'); assert(calls.some(c => c[0] === 'ramp'), 'gong ducks');
      const mo = A.musicOut(); assert(mo && mo.ctx && mo.out, 'music output');
      for (const k of Object.keys(A.DUCK)) assert(A.names.includes(k), 'duck sound exists: ' + k);
    }],
    ['music: the layers build and schedule against a stub WebAudio without throwing', async () => {
      let made = 0;
      const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {} });
      const node = () => { made++; const n = { connect() { return n; }, start() {}, stop() {}, frequency: param(), gain: param(), Q: param(), buffer: null, type: '' }; return n; };
      const ctx = { currentTime: 1, state: 'running', sampleRate: 8000, createGain: node, createOscillator: node, createBiquadFilter: node, createBufferSource: node, createBuffer: (c, n) => ({ getChannelData: () => new Float32Array(n) }) };
      const saved = { document: global.document, GK: global.GK, GKAUDIO: global.GKAUDIO };
      global.document = {}; global.GK = { mode: 'play', settings: {} }; global.GKAUDIO = { ctx, musicOut: () => ({ ctx, out: node() }) };
      delete require.cache[require.resolve('../client/music5.js')]; const MM = require('../client/music5.js');
      MM.onMsg({ hit: { from: 1, to: 2, hp: 10, max: 100 } }, 1);
      for (let i = 0; i < 5; i++) { ctx.currentTime += 0.2; await L.sleep(130); }
      assert(made > 20, 'pad, tension and pulse voices made: ' + made);
      global.GK.mode = 'menu'; await L.sleep(150);
      Object.assign(global, saved);
    }],
    ['hooks: scripts load, game.js wires recap / daily / music / netq, server.js wires RECAP', async () => {
      const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), g = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8'), sv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
      for (const f of ['recap5', 'daily5', 'music5']) assert(html.includes('/client/' + f + '.js'), f + ' loaded');
      for (const s of ['GKRECAP.deathHtml', 'GKRECAP.feedSuffix', 'GKRECAP.awardsHtml', 'GKDAILY.onMsg', 'GKDAILY.cardHtml', 'GKMUSIC.onMsg', 'NETQ-BEGIN', 'director(performance.now())']) assert(g.includes(s), 'game.js: ' + s);
      for (const s of ['recapHit(p, t', 'recapKill(m, p, t, now)', '...recapFeed(victim)', '...recapDied(p)', '...recapAwards(order)']) assert(sv.includes(s), 'server.js: ' + s);
      const m = /function netqText[^\n]*/.exec(g); assert(m, 'netqText'); const netqText = new Function('return ' + m[0].replace(/\s*\/\/.*$/, ''))();
      eq(netqText(40, 5, 100), ''); eq(netqText(212, 5, 100), 'High ping 212 ms'); eq(netqText(40, 60, 100), 'Unstable connection'); eq(netqText(40, 5, 3000), 'Connection stalled');
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

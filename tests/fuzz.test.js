// QA: malformed / hostile client messages must never crash or wedge the server; a normal client still plays afterwards.
const L = require('./lib.js'), { connect, sleep, assert } = L;
const KEYS = ['m', 'sel', 'ping', 'has', 'wpn', 'tp', 'p', 'near', 'drop', 'c', 'mv', 'buy', 'yaw', 'throw', 'ring', 'recycle', 'prog', 'loot', 'id', 'gold', 'give', 'emote', 'eat', 'craft', 'claim', 'bribe', 'axis', 'atk', 'add', 'win', 'ready', 'enter', 'cancel', 'swing', 'hit', 'resume', 'goblin', 'name', 'move', 'pick', 'trade', 'station', 'a', 'b', 'x', 'z', 'n', 'i', 'slot', 'from', 'to', 'item'];
const VALS = [null, undefined, NaN, Infinity, -Infinity, 0, -1, 1e308, -1e308, 1.5, 2 ** 53, 'x', '', '__proto__', 'constructor', [], [[]], [null, null], [1e9, -1e9], {}, { __proto__: null }, { a: { b: {} } }, true, false, 'a'.repeat(5000), [0, 0, 0, 0, 0, 0, 0, 0], { id: -1 }, { x: 'a', z: [] }, 'w:dagger', 'a:rags', 'q0', 'b3', 'c999'];
let seed = 12345; const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
(async () => {
  const srv = await L.startServer({ GK_ROUND_MS: '3000' }); let fail = 1;
  try {
    fail = await L.run('fuzz', [['random hostile messages leave the server alive and a fresh client playable', async () => {
      const a = await connect(srv.port, 'goblin=0'), b = await connect(srv.port, 'goblin=1');
      for (let i = 0; i < 1500; i++) {
        const o = {}; for (let k = 0, n = 1 + rnd(3); k < n; k++) o[KEYS[rnd(KEYS.length)]] = VALS[rnd(VALS.length)];
        let s; try { s = JSON.stringify(o); } catch (e) { s = '{}'; }
        a.send(rnd(40) === 0 ? ['[', 'null', '"x"', '12', '{"m":', '{"__proto__":{"x":1}}'][rnd(6)] : s);
        if (i % 100 === 0) await sleep(15);
      }
      await sleep(300);
      assert(srv.alive(), 'server died: ' + srv.out().slice(-600));
      const errs = srv.out().split(/\r?\n/).filter(l => /^(message|close) id=/.test(l)); assert(!errs.length, 'handler exceptions (' + errs.length + '): ' + errs.slice(0, 3).join(' / '));
      b.send({ ping: 1 }); await sleep(200);
      const c = await connect(srv.port, 'goblin=2'); assert(c.state.you != null, 'fresh client could not join after the fuzz');
      await a.close(); await b.close(); await c.close();
      assert(srv.alive(), 'server died on close');
    }]]);
  } catch (e) { console.log('  FAIL  fuzz setup: ' + e.message); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

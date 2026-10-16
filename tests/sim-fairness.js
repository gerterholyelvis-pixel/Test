// Not part of `npm test`: plays N short-round matches with one scripted human (Tier 5 gear) against 7 bots and prints the human's placement.
//   node tests/sim-fairness.js [matches=5] [fight=1]      fight=0: the human only stands in its room
const L = require('./lib.js'), W = require('../world.js'), { connect, sleep } = L;
const N = +process.argv[2] || 5, FIGHT = process.argv[3] !== '0';
(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_READY_MS: '300', GK_COUNTDOWN_MS: '300', GK_ROUND_MS: '9000', GK_NEXT_ROUND_MS: '9000', GK_BOT_GRACE_MS: '3000', GK_SUDDEN_ROUND: '3', GK_MAX_ROUND: '6', GK_NPC_AGGRO_MS: '1500' });
  const places = [];
  try {
    for (let g = 0; g < N; g++) {
      const c = await connect(srv.port, 'goblin=2&wins=0&name=Tester'), pos = {}, me = c.state.you;
      c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.s) for (let i = 1; i + 5 < d.s.length; i += 6) pos[d.s[i]] = [d.s[i + 1], d.s[i + 2]]; });
      const give = async (k, slot) => { c.send({ give: k }); await c.until(x => x.state.inv.backpack.includes(k), 2000, k); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(k), slot] }); await sleep(120); };
      await give('a:aegis', 'armor'); await give('w:slayer', 'weapon');   // Tier 5 gear
      const start = c.state.matchStart.players.find(p => p.id === me); let mx = start.x, mz = start.z;
      const t0 = Date.now(); let kills = 0;
      while (Date.now() - t0 < 120000 && !c.state.matchEnd && !c.state.won && !c.state.died) {
        if (FIGHT) {   // fight back: face and hit the nearest goblin that is in my room and within 2.2 m
          let best = null, bd = 2.3; for (const id in pos) { const q = pos[id]; if (+id === me || W.roomKeyOf(q[0], q[1]) !== W.roomKeyOf(mx, mz)) continue; const d = Math.hypot(q[0] - mx, q[1] - mz); if (d < bd) { bd = d; best = q; } }
          if (best) { c.send({ m: [mx, mz, Math.atan2(-(best[0] - mx), -(best[1] - mz))] }); c.send({ atk: 1 }); }
        }
        await sleep(160);
      }
      if (!c.state.matchEnd && !c.state.won && !c.state.died) { places.push('timeout'); } else {
        await c.until(x => x.state.matchEnd || x.state.won, 110000, 'end').catch(() => {});
        const me2 = c.state.matchEnd && c.state.matchEnd.places.find(p => p.id === me);
        places.push(c.state.won ? 1 : me2 ? me2.place : '?'); kills = me2 ? me2.kills : 0;
      }
      console.log('match ' + (g + 1) + ': place ' + places[g] + ' of 8, ' + kills + ' kills, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s' + (c.state.died ? ', killed by ' + (c.state.died.killer ? c.state.died.killer.name + ' (' + c.state.died.killer.w + ')' : '?') + ' at round ' + (c.state.round && c.state.round.n) : ''));
      await c.close(); await sleep(300);
    }
  } finally { srv.stop(); }
  const nums = places.filter(p => typeof p === 'number'); console.log('places: ' + places.join(' ') + '  mean ' + (nums.reduce((a, b) => a + b, 0) / Math.max(1, nums.length)).toFixed(1) + '  top3 ' + nums.filter(p => p <= 3).length + '/' + places.length);
  process.exit(0);
})();

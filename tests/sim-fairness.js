// Not part of `npm test`: plays N short-round matches with one scripted human (Tier 5 gear) against 7 bots and prints the human's placement.
//   node tests/sim-fairness.js [matches=5] [fight=1]      fight=0: the human only stands in its room
//   node tests/sim-fairness.js bots5 [matches=20] [roundMs=20000] [parallel=5]   BOTS5: full all-bot 5x5 matches (the human dies at GO and watches), see simBots5 below
const L = require('./lib.js'), W = require('../world.js'), { connect, sleep } = L;
// ---- BOTS5 (docs/reports/bots5.md): N full 7-round bot matches with short rounds. Per match: rounds and seconds played, how it ended (crown claim / kills / HP /
// last standing), the winner's home slot (spawn fairness), the first round a vault door opened, tree / heist / station use and stuck bots (server {bot5:1} stats).
// Returns the per-match rows and a summary; tests/bots5.test.js runs a small version of it and asserts sane bounds.
async function simBots5(o) {
  o = Object.assign({ n: 20, roundMs: 20000, parallel: 5, sudden: 5, max: 7, log: true }, o || {});
  const srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: String(o.roundMs), GK_NEXT_ROUND_MS: String(o.roundMs), GK_BOT_GRACE_MS: String(Math.min(20000, o.roundMs)), GK_SUDDEN_ROUND: String(o.sudden), GK_MAX_ROUND: String(o.max), GK_TRAP_MS: String(Math.min(5000, Math.round(o.roundMs / 3))), ...(o.env || {}) });
  const rows = []; let k = 0;
  const one = async idx => {
    const c = await connect(srv.port, 'wins=' + Math.round(10 * Math.pow(1.5, idx)) + '&name=Watcher' + idx), t0 = Date.now(), ps = c.state.matchStart.players;
    if (o.setup) { await o.setup(c, idx); await sleep(150); }   // e.g. {actDbg} while the watcher is still alive
    c.send({ kill: 1 });   // all-bot match: the human dies at GO and stays as a spectator (7 bots in 8 homes)
    let vaultOpen = null, last = null, rounds = 1; const VAULT = W.ROOM_DOORS[W.VAULT_KEY];
    c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.round) { rounds = Math.min(o.max, d.round.n); if (vaultOpen == null && !d.sudden && Array.isArray(d.open) && d.open.some(x => VAULT.includes(x))) vaultOpen = d.round.n; } if (d.bot5) last = d.bot5; });
    const limit = (o.max + 1) * o.roundMs + 30000;
    while (!c.state.matchEnd && Date.now() - t0 < limit) { await sleep(2000); c.send({ bot5: 1 }); }
    c.send({ bot5: 1 }); await sleep(300);
    const e = c.state.matchEnd, win = e && e.winner, wp = win && ps.find(p => p.id === win.id), slot = wp ? W.HOME_IDS.indexOf(+wp.home.slice(1)) : -1;
    const how = !e ? 'timeout' : e.decision ? (/claim/.test(e.decision.reason) ? 'crown' : e.decision.reason) : 'last';
    const row = { idx, secs: Math.round((Date.now() - t0) / 1000), rounds, how, slot, vaultOpen, s: last };
    rows.push(row); await c.close();
    if (o.log) console.log('match ' + (idx + 1) + ': ' + row.secs + ' s, ' + rounds + ' rounds, ' + how + (slot >= 0 ? ' (home slot ' + slot + ')' : '') + ', vault opened ' + (vaultOpen == null ? 'never before sudden death' : 'round ' + vaultOpen)
      + (last ? ', trees ' + JSON.stringify(last.tree) + ' by ' + last.treeUsers + ', heists ' + JSON.stringify(last.vb) + ' by ' + last.vbUsers + ', home/forge/grand ' + last.home + '/' + last.forge + '/' + last.grand + ', crafted ' + last.crafted + ', recycled ' + last.recycled + ', coop ' + last.coop + ', bribes ' + last.bribes + ', stuck ' + last.stuck + '/' + last.hardStuck + ', rewards ' + JSON.stringify(last.rewards) + ', left home ' + last.left + '/' + last.bots : ''));
  };
  try {
    const workers = Array.from({ length: Math.min(o.parallel, o.n) }, async () => { while (k < o.n) { const i = k++; await sleep(400 * (i % o.parallel)); await one(i); } });
    await Promise.all(workers);
  } finally { srv.stop(); }
  rows.sort((a, b) => a.idx - b.idx);
  const sum = summary5(rows);
  if (o.log) console.log('summary ' + JSON.stringify(sum));
  return { rows, sum, out: srv.out() };
}
function summary5(rows) {
  const ok = rows.filter(r => r.s), n = rows.length || 1, mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null;
  const slots = Array(8).fill(0); for (const r of rows) if (r.slot >= 0) slots[r.slot]++;
  const how = {}; for (const r of rows) how[r.how] = (how[r.how] || 0) + 1;
  const vo = rows.filter(r => r.vaultOpen != null).map(r => r.vaultOpen);
  return { matches: rows.length, meanSecs: mean(rows.map(r => r.secs)), meanRounds: mean(rows.map(r => r.rounds)), timeouts: rows.filter(r => r.how === 'timeout').length, ends: how, winnerSlots: slots,
    vaultOpenShare: +(vo.length / n).toFixed(2), vaultOpenRound: mean(vo), treeMatchShare: +(ok.filter(r => Object.keys(r.s.tree).length).length / n).toFixed(2), heistMatchShare: +(ok.filter(r => Object.keys(r.s.vb).length).length / n).toFixed(2),
    treeUsers: mean(ok.map(r => r.s.treeUsers)), heistUsers: mean(ok.map(r => r.s.vbUsers)), stationUses: mean(ok.map(r => r.s.home + r.s.forge + r.s.grand)), crafted: mean(ok.map(r => r.s.crafted)), coop: mean(ok.map(r => r.s.coop)), bribes: mean(ok.map(r => r.s.bribes)),
    leftHome: mean(ok.map(r => r.s.left / Math.max(1, r.s.bots))), stuck: mean(ok.map(r => r.s.stuck)), hardStuck: ok.reduce((x, r) => x + r.s.hardStuck, 0), sweepMs: mean(ok.map(r => r.s.sweepMean)) };
}
module.exports = { simBots5, summary5 };
const N = +process.argv[2] || 5, FIGHT = process.argv[3] !== '0';
if (require.main === module && process.argv[2] === 'bots5') simBots5({ n: +process.argv[3] || 20, roundMs: +process.argv[4] || 20000, parallel: +process.argv[5] || 5 }).then(() => process.exit(0), e => { console.error(e); process.exit(1); });
else if (require.main === module) (async () => {
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

// netperf (PERF4, docs/reports/perf-4-server.md): the server tick holds 20 Hz and stays cheap, interest-managed snapshots lose nothing, walkers behind 100 ms +-30 ms get no corrections,
// the client's interpolation (the real NET block of game.js, run in a vm by tools/netsim.js) stays smooth under jitter and loss, and the client's prop sliding is never refused by the server.
// Timing tests: thresholds are loose on purpose (a loaded box stalls a node process for 100 ms now and then); rerun alone before blaming the code.
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), sim = require('../tools/netsim.js');
const botstat = async c => { const n = c.msgs.length; c.send({ botstat: 1 }); await c.until(x => x.msgs.slice(n).some(m => m.botstat), 3000, 'botstat'); return c.msgs.slice(n).find(m => m.botstat).botstat; };
const entries = (c, id, from = 0) => c.msgs.slice(from).filter(m => m.s).flatMap(m => { const o = []; for (let i = 1; i + 5 < m.s.length; i += 6) if (m.s[i] === id) o.push({ t: m.s[0], x: m.s[i + 1], z: m.s[i + 2], at: m.at }); return o; });
const freeLine = (layout, key, len) => {   // a straight line of `len` metres inside room `key` that keeps 0.8 m away from every prop: [x0, z0, x1, z1]
  const [cx, cz] = W.rc(+key), hw = W.roomW(+key) / 2 - 3;
  for (let ang = 0; ang < 6.2; ang += 0.4) for (let r = 0; r < hw - len; r += 0.7) {
    const x0 = cx + Math.cos(ang) * r, z0 = cz + Math.sin(ang) * r, x1 = x0 + len, z1 = z0; let ok = x1 < cx + hw;
    for (let k = 0; ok && k <= 30; k++) if (W.inProp(x0 + (x1 - x0) * k / 30, z0, 0.9, layout, true)) ok = false;
    if (ok) return [x0, z0, x1, z1];
  }
  throw new Error('no free line in room ' + key);
};

(async () => {
  const srv = await L.startServer({ GK_MATCH_SIZE: '8', GK_QUEUE_MS: '300', GK_BOT_GRACE_MS: '0', GK_ROUND_MS: '600000', GK_READY_MS: '500' }); let fail = 1;
  try {
    fail = await L.run('netperf', [
      ['tick: 20 Hz without drift (was 15.5 Hz with setInterval on Windows), 3 matches of bots cost a few ms per tick', async () => {
        const cs = await Promise.all([0, 50, 200].map(w => connect(srv.port, 'goblin=2&wins=' + w + '&name=T' + w, { wait: 15000 })));
        await sleep(500); let a, b, dn, mean, hz, cost;
        for (let tries = 0; tries < 3; tries++) {   // best of three 4 s windows: a loaded box can starve the whole process for a while
          a = await botstat(cs[0]); await sleep(4000); b = await botstat(cs[0]);
          dn = b.tick.dn - a.tick.dn; mean = (b.tick.dsum - a.tick.dsum) / dn; hz = 1000 / mean; cost = (b.tick.sum - a.tick.sum) / (b.tick.n - a.tick.n);
          if (hz > 18.2) break;
        }
        console.log('         tick interval mean ' + mean.toFixed(1) + ' ms (' + hz.toFixed(2) + ' Hz), max ' + b.tick.dmax.toFixed(0) + ' ms, ' + (b.tick.late - a.tick.late) + ' intervals over 75 ms, cost ' + cost.toFixed(2) + ' ms per tick, matches ' + b.matches);
        assert(dn >= 40, 'ticks measured: ' + dn); assert(hz > 18.2 && hz < 21, 'tick rate ' + hz.toFixed(2) + ' Hz (want 20)');
        assert(cost < 12, 'mean tick cost ' + cost.toFixed(2) + ' ms (3 matches x 8, budget 50 ms)'); assert(b.tick.skip - a.tick.skip <= 4, 'resyncs after stalls: ' + (b.tick.skip - a.tick.skip));
        for (const c of cs) await c.close();
      }],
      ['snapshots: a goblin in a far room reaches me at 5 Hz, one beside me at 20 Hz, and the far one still ends at the right spot', async () => {
        const [a, b, c] = await Promise.all([0, 0, 0].map((w, i) => connect(srv.port, 'goblin=2&wins=900&name=S' + i, { wait: 15000 })));
        await a.until(x => x.state.match && x.state.match.alive >= 3, 5000, 'three entered');
        const layout = a.state.layout, [x0, z0, x1, z1] = freeLine(layout, '24', 3), [ax, az] = freeLine(layout, '0', 3);
        a.send({ tp: [ax, az] }); a.send({ m: [+ax.toFixed(2), +az.toFixed(2), 0] }); b.send({ tp: [x0, z0] }); c.send({ tp: [x0 + 1, z0 + 1] }); c.send({ m: [+(x0 + 1).toFixed(2), +(z0 + 1).toFixed(2), 0] }); await sleep(300);
        const na = a.msgs.length, nc = c.msgs.length; let x = x0;
        for (let i = 0; i < 30; i++) { x = Math.min(x1, x0 + (i + 1) * 0.1); b.send({ m: [+x.toFixed(2), +z0.toFixed(2), 0] }); await sleep(50); }   // 1.5 s at 20 Hz, 2 m/s
        b.send({ m: [+x1.toFixed(2), +z0.toFixed(2), 0] }); await sleep(500);
        const ea = entries(a, b.state.you, na), ec = entries(c, b.state.you, nc);
        console.log('         far receiver got ' + ea.length + ' entries, near receiver ' + ec.length + ' (sender moved 31 times in 1.5 s)');
        assert(ec.length >= 22, 'near receiver: ' + ec.length); assert(ea.length >= 4 && ea.length <= 12, 'far receiver: ' + ea.length + ' entries (5 Hz = about 8)');
        const last = ea[ea.length - 1]; assert(Math.abs(last.x - x1) < 0.05 && Math.abs(last.z - z0) < 0.05, 'far receiver ends at ' + last.x + ',' + last.z + ' want ' + x1.toFixed(2) + ',' + z0.toFixed(2));
        for (const k of [a, b, c]) await k.close();
      }],
      ['corrections: 4 walkers behind 100 ms +-30 ms jitter (real server, tools/netsim.js) get no {fix} and nobody is kicked', async () => {
        const r = await sim.simulate({ n: 4, secs: 9, scen: '100j30' });
        console.log('         ' + JSON.stringify({ fixes: r.fixes, upToObserverP50: r.upObsP50, upToObserverP95: r.upObsP95, visualP50: r.visualP50, kbpsDown: r.kbpsDown, kbpsUp: r.kbpsUp, tickHz: r.tickHz }));
        assert(r.fixes <= 2, 'corrections: ' + r.fixes); eq(r.closed, 0, 'clients kicked'); assert(r.upObsP95 < 900, 'input to observer p95 ' + r.upObsP95 + ' ms');
      }],
      ['client interpolation (model, seeded): LAN stays under 75 ms of picture lag, 100 ms +-30 ms does not freeze or pop, 2% loss pops far less than the fixed 66+2*jitter delay did', () => {
        const lan = sim.model({ scen: 'lan' }), j = sim.model({ scen: '100j30' }), lo = sim.model({ scen: '100j30l2' }), bad = sim.model({ scen: '200j60' });
        console.log('         ' + [lan, j, lo, bad].map(r => r.scen + ' visual p50/p95 ' + r.visualP50 + '/' + r.visualP95 + ' ms, freeze ' + r.freezePct + '%, pops ' + r.popsPerMin + '/min').join('\n         '));
        assert(lan.visualP50 <= 75, 'lan picture lag ' + lan.visualP50); assert(lan.freezePct === 0 && lan.popsPerMin === 0);
        assert(j.freezePct < 2 && j.popsPerMin < 12 && j.visualP95 < 260, '100j30: ' + JSON.stringify(j));
        assert(lo.popsPerMin < 40, '2% loss pops ' + lo.popsPerMin + '/min (was about 110)'); assert(bad.popsPerMin < 120, '200j60 pops ' + bad.popsPerMin);
      }],
      ['props: walking into a crate / barrel with the client\'s own slide (radius 0.45) is never refused by the server (radius 0.33)', async () => {
        const c = await connect(srv.port, 'goblin=2&wins=950&name=Slide', { wait: 15000 }); const layout = c.state.layout; let tried = 0, fixes = 0; const det = [];
        for (const key of ['0', '4', '24']) {
          const [cx, cz] = W.rc(+key); const props = W.propsAt ? W.propsAt(cx, cz, layout) : []; if (!props.length) continue;
          for (const p of props.slice(0, 1)) {
            // approach the prop from 1.6 m away and keep pushing straight at its centre, then along it; positions come from the client's slide
            let x = 0, z = 0, found = false;   // a start 1.6 m from the prop that is inside the room, off every other prop
            for (const [ox, oz] of [[-1, 0.1], [1, 0.1], [0.1, -1], [0.1, 1]]) { x = p.x + ox * (1.6 + p.r); z = p.z + oz * (1.6 + p.r); if (W.roomKeyOf(x, z) === key && W.roomKeyOf(x + ox, z + oz) === key && !W.inProp(x, z, 0.6, layout, true)) { found = true; break; } }
            if (!found) continue;
            const x0s = x.toFixed(2) + "," + z.toFixed(2); c.send({ tp: [+x.toFixed(2), +z.toFixed(2)] }); c.send({ m: [+x.toFixed(2), +z.toFixed(2), 0] }); await sleep(80); const n0 = c.msgs.length; tried++;
            for (let i = 0; i < 40; i++) {
              const tx = i < 20 ? p.x : cx, tz = i < 20 ? p.z : cz, d = Math.hypot(tx - x, tz - z) || 1, step = Math.min(0.2, d);
              let nx = x + (tx - x) / d * step, nz = z + (tz - z) / d * step; [nx, nz] = W.slide(x, z, nx, nz, 0.45, layout, true); x = nx; z = nz;
              c.send({ m: [+x.toFixed(2), +z.toFixed(2), 0] }); await sleep(50);
            }
            await sleep(100); { const f = c.msgs.slice(n0).filter(m => m.fix); fixes += f.length; if (f.length) det.push(key + " " + p.k + " prop " + p.x.toFixed(2) + "," + p.z.toFixed(2) + " r" + p.r.toFixed(2) + " start " + x0s + " fix " + JSON.stringify(f[0].fix) + " client " + x.toFixed(2) + "," + z.toFixed(2)); }
          }
        }
        console.log('         ' + tried + ' prop approaches, ' + fixes + ' corrections'); for (const d of det) console.log('           ' + d);
        assert(tried >= 2, 'props tried: ' + tried); eq(fixes, 0, 'the server refused the client\'s slide'); await c.close();
      }],
    ]);
  } finally { srv.stop(); }
  process.exit(fail ? 1 : 0);
})();

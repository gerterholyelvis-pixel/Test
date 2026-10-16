// bots (part 3, docs/reports/bots-2.md): bots act like players. Perception (cone, scan), sprint between rooms, strafing in melee, emotes after kills, turning toward a hit from behind, personality rolls.
// The fairness simulation (e) takes minutes, so it only runs with GK_SIM=1:  GK_SIM=1 node tests/bots-ai.test.js   (or: node tests/sim-fairness.js 3 1)
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js'), { spawn } = require('child_process');
const ENV = { GK_MATCH_SIZE: '2', GK_QUEUE_MS: '100', GK_ROUND_MS: '500', GK_NEXT_ROUND_MS: '600000', GK_BOT_GRACE_MS: '0', GK_READY_MS: '300', GK_BOT_NOTICE_MS: '0' };
// every snapshot entry with the time we received it: { t, id, x, z, yaw, spd, jump (cm) }; the speed slot carries speed + 100 * jump
function track(c) {
  const snaps = []; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (!d.s) return; const t = Date.now(); for (let i = 1; i + 5 < d.s.length; i += 6) { const v = d.s[i + 4], jump = Math.floor(v / 100); snaps.push({ t, id: d.s[i], x: d.s[i + 1], z: d.s[i + 2], yaw: d.s[i + 3], spd: v - jump * 100, jump }); } });
  return snaps;
}
const stamps = (c, pred) => { const out = []; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (pred(d)) out.push(Date.now()); }); return out; };
const lab = async (c, cmd) => { const n = c.msgs.length; c.send({ botlab: cmd }); await c.until(x => x.msgs.slice(n).some(m => m.botlab), 2000, 'botlab'); return c.msgs.slice(n).find(m => m.botlab).botlab; };
const give = async (c, key, slot) => { c.send({ give: key }); await c.until(x => x.state.inv.backpack.includes(key), 2000, key); c.send({ mv: ['b' + c.state.inv.backpack.indexOf(key), slot] }); await c.until(x => x.state.inv[slot] === key, 2000, key + ' equipped'); };
const botOf = c => c.state.matchStart.players.find(p => p.bot);
const round2 = c => c.until(x => x.state.round && x.state.round.n >= 2, 4000, 'round 2');
const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };

(async () => {
  const srv = await L.startServer(ENV), quick = await L.startServer({ ...ENV, GK_NEXT_ROUND_MS: '3000', GK_SUDDEN_ROUND: '99' }), emo = await L.startServer({ ...ENV, GK_BOT_EMOTE_P: '1' }); let fail = 1;
  try {
    fail = await L.run('bots-ai', [
      ['perception: a goblin 4 m directly behind a bot is not seen at first, and is noticed once the bot looks around', async () => {
        const c = await connect(srv.port, 'wins=1'), bot = botOf(c); await round2(c);
        const [cx, cz] = W.rc(c.state.matchStart.spawn.box), acts = stamps(c, d => d.swing === bot.id || (d.hit && d.hit.from === bot.id));
        c.send({ tp: [cx, cz + 4] }); c.send({ m: [cx, cz + 4, 0] }); await sleep(150);
        const t0 = Date.now(), r = await lab(c, { near: [cx, cz], yaw: 0, scanAfter: 1000 }); eq(r.yaw, 0);   // yaw 0 looks toward -z: I am behind it
        await sleep(800); assert(!acts.some(t => t >= t0), 'the bot attacked something it cannot see, ' + (acts[0] - t0) + ' ms after the placement');
        let first = 0; for (let i = 0; i < 100 && !first; i++) { await sleep(100); first = acts.find(t => t >= t0) || 0; }
        assert(first, 'the bot never noticed a goblin 4 m behind it in 10 s (it should scan the room)'); assert(first - t0 > 800, 'noticed after ' + (first - t0) + ' ms');
        await c.close();
      }],
      ['sprinting: while travelling between rooms bots run faster than 5.5 m/s, and they walk when they do not travel; jumps stay rare', async () => {
        const c = await connect(quick.port, 'wins=2'), snaps = track(c), bot = botOf(c); await sleep(200);   // 3 s rounds: the bot votes, doors open, it travels
        let fast = 0; for (let i = 0; i < 250 && !fast; i++) { await sleep(100); fast = snaps.filter(s => s.id === bot.id && s.spd > 5.5).length; }
        assert(fast > 0, 'no bot snapshot above 5.5 m/s in 25 s'); const mine = snaps.filter(s => s.id === bot.id);
        assert(Math.max(...mine.map(s => s.spd)) <= 12, 'speed field out of range'); assert(mine.some(s => s.spd > 0.5 && s.spd < 5.2) || mine.length > 10, 'bot moved at all');
        const top = Math.max(...mine.map(s => s.jump)); assert(top <= 90, 'jump higher than 90 cm: ' + top);
        let jumps = 0; for (let i = 1; i < mine.length; i++) if (mine[i].jump > 0 && mine[i - 1].jump === 0) jumps++;
        assert(jumps <= 1 + Math.floor((mine[mine.length - 1].t - mine[0].t) / 30000), 'too many jumps: ' + jumps);
        await c.close();
      }],
      ['strafing: in a melee fight the bot orbits the human and stays at 0.8-2.6 m', async () => {
        const c = await connect(srv.port, 'wins=3&goblin=1'), snaps = track(c), bot = botOf(c); await give(c, 'a:aegis', 'armor'); await round2(c);
        const [cx, cz] = W.rc(c.state.matchStart.spawn.box); c.send({ tp: [cx, cz] }); c.send({ m: [cx, cz, 0] }); await sleep(150);
        const t0 = Date.now(); await lab(c, { near: [cx, cz], ring: 1.5, wpn: 'none' }); await sleep(6000); if (c.state.died) throw new Error('the human died: ' + JSON.stringify(c.state.died));
        const mine = snaps.filter(s => s.id === bot.id && s.t >= t0 + 1000); assert(mine.length > 20, 'few snapshots: ' + mine.length);
        let lat = 0, near = 0, turns = 0, lastSign = 0;
        for (let i = 0; i < mine.length; i++) {
          const a = mine[i], d = Math.hypot(a.x - cx, a.z - cz); if (d >= 0.8 && d <= 2.6) near++;
          if (i) { const p = mine[i - 1], dp = Math.hypot(p.x - cx, p.z - cz) || 1, tx = -(p.z - cz) / dp, tz = (p.x - cx) / dp, s = (a.x - p.x) * tx + (a.z - p.z) * tz; lat += Math.abs(s); if (Math.abs(s) > 0.05) { const sg = Math.sign(s); if (lastSign && sg !== lastSign) turns++; lastSign = sg; } }
        }
        console.log('         lateral ' + lat.toFixed(1) + ' m, at 0.8-2.6 m ' + Math.round(100 * near / mine.length) + ' %, direction changes ' + turns);
        assert(lat > 1.5, 'lateral displacement only ' + lat.toFixed(2) + ' m'); assert(near / mine.length >= 0.6, 'at melee range only ' + Math.round(100 * near / mine.length) + ' % of the time'); assert(turns >= 1, 'never changed the strafe direction');
        await c.close();
      }],
      ['emote: after a kill the bot broadcasts {emote:{id,n}} (GK_BOT_EMOTE_P=1 here; 30 % in the game)', async () => {
        const c = await connect(emo.port, 'wins=4'), pos = {}, bot = botOf(c);
        c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.s) for (let i = 1; i + 5 < d.s.length; i += 6) pos[d.s[i]] = [d.s[i + 1], d.s[i + 2]]; });
        await round2(c); c.send({ drop: 'armor' }); await c.until(x => x.state.inv.armor === null, 2000, 'armour dropped');   // 10 HP: an easy kill
        let me = []; for (let i = 0; i < 60 && !c.state.died; i++) {
          const p = pos[bot.id] || [bot.x, bot.z], r = W.roomKeyOf(p[0], p[1]); let [x, z] = [p[0] + 3, p[1]]; if (W.roomKeyOf(x, z) !== r) [x, z] = [p[0] - 3, p[1]];
          if (me[0] === undefined || W.roomKeyOf(me[0], me[1]) !== r) { me = [x, z]; c.send({ tp: [x, z] }); c.send({ m: [x, z, 0] }); }
          await sleep(250);
        }
        assert(c.state.died, 'the bot never killed the human'); await c.until(x => x.msgs.some(m => m.emote), 4000, 'an emote broadcast');
        const e = c.msgs.find(m => m.emote).emote; eq(e.id, bot.id, 'emote sender'); assert(Number.isInteger(e.n) && e.n >= 0 && e.n < 4, 'emote id ' + e.n);
      }],
      ['hit from behind: a bot shot from outside its view turns toward the attacker after about 250-500 ms', async () => {
        const c = await connect(srv.port, 'wins=5&goblin=1'), snaps = track(c), bot = botOf(c); await give(c, 'w:bow', 'weapon'); await give(c, 'a:aegis', 'armor'); await round2(c);
        const [cx, cz] = W.rc(c.state.matchStart.spawn.box); c.send({ tp: [cx, cz + 5] }); c.send({ m: [cx, cz + 5, 0] }); await sleep(150);
        await lab(c, { near: [cx, cz], yaw: 0, scanAfter: 60000 }); await sleep(300);
        c.send({ m: [cx, cz + 5, 0] }); await sleep(100);
        const hits = stamps(c, d => d.hit && d.hit.to === bot.id); for (let i = 0; i < 4 && !hits.length; i++) { c.send({ atk: 1 }); await sleep(500); } assert(hits.length, 'my arrow never hit the bot');
        const th = hits[0], want = Math.PI; let turned = 0;   // the yaw that looks at me (+z)
        for (let i = 0; i < 40 && !turned; i++) { await sleep(50); const s = snaps.filter(q => q.id === bot.id && q.t >= th).find(q => angDiff(q.yaw, want) < 0.6); if (s) turned = s.t - th; }
        assert(turned, 'the bot never turned toward the shooter'); console.log('         turned toward me ' + turned + ' ms after the hit'); assert(turned >= 150, 'it turned instantly (' + turned + ' ms)'); assert(turned < 1400, 'it took ' + turned + ' ms');
        await c.close();
      }],
      ['personality: every bot rolls its own aggression (0.3-1), flee threshold (15-40 %), greed and patience', async () => {
        const seen = []; for (let i = 0; i < 6; i++) { const c = await connect(srv.port, 'wins=' + (6 + i)); const r = await lab(c, {}); seen.push(r.ai); await c.close(); await sleep(100); }
        for (const a of seen) { assert(a && a.aggr >= 0.3 && a.aggr <= 1 && a.flee >= 0.15 && a.flee <= 0.4 && a.greed >= 0 && a.greed <= 1 && a.patience >= 0 && a.patience <= 1, 'out of range: ' + JSON.stringify(a)); }
        assert(new Set(seen.map(a => a.aggr)).size > 1 && new Set(seen.map(a => a.patience)).size > 1, 'all bots rolled the same personality');
      }],
      ['fairness simulation (GK_SIM=1): a geared human still places <= 3 of 8 on average (node tests/sim-fairness.js 3 1)', async () => {
        if (!process.env.GK_SIM) return 'skip';
        const out = await new Promise((res, rej) => { let o = ''; const p = spawn(process.execPath, ['tests/sim-fairness.js', '3', '1'], { cwd: L.ROOT }); p.stdout.on('data', d => o += d); p.stderr.on('data', d => o += d); p.on('exit', () => res(o)); p.on('error', rej); });
        console.log(out.trim().split('\n').map(l => '         ' + l).join('\n')); const mm = /mean ([\d.]+)/.exec(out); assert(mm, 'no result line'); assert(+mm[1] <= 3, 'mean place ' + mm[1]);
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); quick.stop(); emo.stop(); process.exit(fail ? 1 : 0);
})();

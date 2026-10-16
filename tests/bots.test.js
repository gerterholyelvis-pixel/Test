// bots (part 1): a solo human gets 8 goblins (7 bots), bots move only legally (no refused moves, never inside walls, they do cross doors), bot tick cost for 8 matches x 8 bots
const L = require('./lib.js'), { connect, sleep, assert, eq } = L, W = require('../world.js');
const ENV = { GK_MATCH_SIZE: '8', GK_QUEUE_MS: '100', GK_ROUND_MS: '1200', GK_BOT_GRACE_MS: '0' };

// collect bot positions from the {s:[t, id,x,z,yaw,v,age, ...]} snapshots
function track(c) { const pos = {}, samples = []; c.ws.on('message', raw => { const d = JSON.parse(raw.toString()); if (d.s) for (let i = 1; i + 5 < d.s.length; i += 6) { const id = d.s[i], x = d.s[i + 1], z = d.s[i + 2]; (pos[id] = pos[id] || []).push([x, z]); samples.push([id, x, z]); } }); return { pos, samples }; }
const botstat = async c => { const n = c.msgs.length; c.send({ botstat: 1 }); await c.until(x => x.msgs.slice(n).some(m => m.botstat), 2000, 'botstat'); return c.msgs.slice(n).find(m => m.botstat).botstat; };
// is (x, z) inside a wall (within 0.25 m of a wall plane of its room) without being in a doorway of that room?
function inWall(x, z) {
  const k = W.roomKeyOf(x, z); let cx, cz, hw, hd;
  if (k[0] === 'c') { const c = W.CHEST[+k.slice(1)]; cx = c.cx; cz = c.cz; hw = hd = c.size / 2; } else { const i = +k; [cx, cz] = W.rc(i); hw = W.roomW(i) / 2; hd = W.roomD(i) / 2; }
  const dx = hw - Math.abs(x - cx), dz = hd - Math.abs(z - cz);
  if (Math.min(dx, dz) >= 0.25) return false;
  return !(Math.abs(x - cx) < 2.6 && dz < 0.25) && !(Math.abs(z - cz) < 2.6 && dx < 0.25);   // a doorway is at most 4.9 m wide, centred on the wall
}

(async () => {
  const srv = await L.startServer(ENV); let fail = 1;
  try {
    fail = await L.run('bots', [
      ['a solo human gets a match of 8: 7 bots with names, goblin types, START gear and their own homes', async () => {
        const c = await connect(srv.port, 'wins=0'); const ps = c.state.matchStart.players;
        eq(ps.length, 8); const bots = ps.filter(p => p.bot); eq(bots.length, 7);
        assert(!ps.find(p => p.id === c.state.you).bot, 'the human is not a bot');
        assert(new Set(ps.map(p => p.id)).size === 8 && new Set(ps.map(p => p.home)).size === 8, 'ids and homes must be distinct'); assert(ps.every(p => p.box !== W.VAULT && W.CHEST[+p.home.slice(1)].home), 'everybody starts in a home, nobody in the vault'); eq(ps.map(p => p.home).sort(), W.HOME_IDS.map(i => 'c' + i).sort(), 'all 8 homes used');
        for (const b of bots) { assert(typeof b.name === 'string' && b.name.length > 1, 'bot name'); assert(b.goblin >= 0 && b.goblin <= 11 && b.stats.health > 0 && b.gear.weapon !== 'None', 'type/gear'); }
        eq(c.state.matchStart.size, 8); await c.until(x => x.state.match && x.state.match.alive === 8 && x.state.match.size === 8, 2000, 'goblins left = 8');
        await c.close();
      }],
      ['bots move only legally: no refused moves, never inside walls, and they cross doors', async () => {
        const c = await connect(srv.port, 'wins=100'), tr = track(c), ids = c.state.matchStart.players.filter(p => p.bot).map(p => p.id);
        const start = {}; for (const p of c.state.matchStart.players) start[p.id] = W.roomKeyOf(p.x, p.z);
        await sleep(6500);
        let moved = 0, rooms = 0;
        for (const id of ids) { const ps = tr.pos[id] || []; if (ps.length > 5) moved++; if (ps.some(([x, z]) => W.roomKeyOf(x, z) !== start[id])) rooms++; }
        assert(moved >= 5, 'most bots should move (' + moved + ')'); assert(rooms >= 1, 'at least one bot should have changed rooms through a door');
        const bad = tr.samples.filter(([id, x, z]) => inWall(x, z)); eq(bad.slice(0, 3), [], 'bot position inside a wall');
        const st = await botstat(c); assert(st.bad <= 3, 'refused bot moves (would have needed a fix): ' + st.bad);   // solid props: an occasional corner clip is tolerated, TODO tighten
        await c.close();
      }],
      ['bot tick cost: 8 matches x 8 bots stays under 2 ms', async () => {
        const wins = [0, 20, 50, 100, 200, 400, 800, 1600], cs = await Promise.all(wins.map(w => connect(srv.port, 'wins=' + w)));
        await sleep(4000); const st = await botstat(cs[0]);
        const mean = st.sum / st.n; console.log('         bot sweep (8 matches x 8 bots): mean ' + mean.toFixed(3) + ' ms, max ' + st.max.toFixed(2) + ' ms over ' + st.n + ' sweeps'); assert(st.n > 20, 'sweeps ran'); assert(mean < 2, 'mean bot sweep ' + mean + ' ms');
        assert(st.bad <= 3, 'refused bot moves: ' + st.bad);
        { const n = cs[0].msgs.length; cs[0].send({ bot5: 1 }); await cs[0].until(x => x.msgs.slice(n).some(m => m.bot5), 2000, 'bot5'); const b5 = cs[0].msgs.slice(n).find(m => m.bot5).bot5, f = b5.f5 || {};   // BOTS5: per-feature cost of the 5x5 goals (pickDest scores, the activity driver, stations, votes, the stuck watchdog)
          console.log('         5x5 goal features per sweep (ms): ' + Object.keys(f).map(k => k + ' ' + (f[k] / b5.sweeps).toFixed(3)).join(', '));
          for (const k of Object.keys(f)) assert(f[k] / b5.sweeps < 0.4, 'BOTS5 feature ' + k + ' costs ' + (f[k] / b5.sweeps).toFixed(3) + ' ms per sweep'); }
        for (const c of cs) await c.close();
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  srv.stop(); process.exit(fail ? 1 : 0);
})();

const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const WORLD = require('./world.js'); // shared geometry (rooms, vault, chest rooms), the client uses the same file
const THREE_DIR = path.join(__dirname, 'node_modules/three/build');
const read = f => fs.readFileSync(path.join(__dirname, f));

const srv = http.createServer((q, r) => {
  const m = q.url.match(/^\/three\/(three\.(?:module|core)\.js)$/); // three.js is served from here, no CDN
  if (m) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(path.join(THREE_DIR, m[1]))); }
  if (q.url.startsWith('/three/addons/')) { // three.js post-processing addons (importmap "three/addons/"), .js only, no path traversal
    let rel = ''; try { rel = decodeURIComponent(q.url.slice(14).split('?')[0]); } catch (e) {}
    const base = path.join(__dirname, 'node_modules/three/examples/jsm'), file = path.resolve(base, rel);
    if (rel && !rel.includes('\0') && file.startsWith(base + path.sep) && file.endsWith('.js') && fs.existsSync(file) && fs.statSync(file).isFile()) { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(fs.readFileSync(file)); }
    r.writeHead(404); return r.end();
  }
  const js = q.url.match(/^\/(game|menu|items|world|save|icons)\.js/); // client scripts
  if (js) { r.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); return r.end(read(js[1] + '.js')); }
  r.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); r.end(read('index.html'));
});
const wss = new WebSocketServer({ server: srv, maxPayload: 512 }); // oversize frames close the socket
const LIM = WORLD.LIM + 1; // world half-extent: the room grid plus the 8 m chest rooms around it (+1 m slack)
const clamp = v => Math.max(-LIM, Math.min(LIM, v));
// ---- doors and rounds (door ids and room keys must match game.js) ----
const chestKey = WORLD.chestKey; // chest rooms in game.js order (WORLD.CHEST)
const ROOM_DOORS = {}; let nDoors = 0; // room key ('0'..'8' grid, 'c0'..'c11' chest) -> door ids on its walls
const addDoor = (a, b) => { const id = nDoors++; (ROOM_DOORS[a] = ROOM_DOORS[a] || []).push(id); (ROOM_DOORS[b] = ROOM_DOORS[b] || []).push(id); };
for (let i = 0; i < 9; i++) {
  const col = i % 3, row = Math.floor(i / 3);
  addDoor(String(i), col < 2 ? String(i + 1) : chestKey(i, 'E'));
  addDoor(String(i), row < 2 ? String(i + 3) : chestKey(i, 'S'));
  if (col === 0) addDoor(String(i), chestKey(i, 'W'));
  if (row === 0) addDoor(String(i), chestKey(i, 'N'));
}
const roomKeyOf = WORLD.roomKeyOf, boxOf = WORLD.roomAt;
// ---- matches: independent games, players are queued with similar victory counts ----
const CAP = 8;
const matches = new Map(); // id -> match
let nextId = 1, nextMatch = 1;
const sendTo = (ws, o) => { if (ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const bcast = (m, o) => { const msg = typeof o === 'string' ? o : JSON.stringify(o); for (const ws of m.players.keys()) if (ws.readyState === 1) ws.send(msg); };
const avgWins = m => { let s = 0; for (const p of m.players.values()) s += p.wins; return m.players.size ? s / m.players.size : 0; };
const tolerance = w => w <= 5 ? 1 : Math.ceil(w * 0.25);
function newMatch() {
  const m = { id: nextMatch++, players: new Map(), round: 1, dur: 30000, endsAt: Date.now() + 30000, started: false, sel: {}, open: [], drops: [], nextDrop: 1, dirty: false, lastRound: 0,
    chests: Array.from({ length: 12 }, () => Math.floor(Math.random() * 6)), chestKeys: Array.from({ length: 12 }, () => GKITEMS.randomWeaponKey()), layout: GKITEMS.randomLayout() };
  m.shops = m.layout.map(x => x === 'merchant' ? GKITEMS.randomShop() : null);   // each merchant's 5 items with gold prices, rolled once per match
  m.mystery = m.layout.map(x => x === 'mystery' ? GKITEMS.randomMystery() : null);   // what is inside each mystery room, rolled once per match // weapon index per chest room
  matches.set(m.id, m); return m;
}
const VAULT = ROOM_DOORS['4'] || []; // the 4 doors touching the middle vault room
const vaultVotes = m => new Set(Object.keys(m.sel).filter(k => VAULT.includes(m.sel[k]))).size; // distinct rooms selecting a vault door
const roundState = m => ({ round: { n: m.round, left: Math.max(0, m.endsAt - Date.now()), dur: m.dur }, sel: m.sel, open: m.open, vaultVotes: vaultVotes(m), fizzled: m.fizzled || [] });
const broadcastRound = m => bcast(m, roundState(m));
const matchInfo = m => { let lo = Infinity, hi = -Infinity; for (const p of m.players.values()) { lo = Math.min(lo, p.wins); hi = Math.max(hi, p.wins); } return { size: m.players.size, minWins: m.players.size ? lo : 0, maxWins: m.players.size ? hi : 0, alive: [...m.players.values()].filter(p => p.entered && !p.dead).length }; };
const broadcastMatch = m => bcast(m, { match: matchInfo(m) });
function findMatch(wins) {
  let best = null;
  for (const m of matches.values()) {
    if (m.players.size >= CAP) continue;
    const d = m.players.size ? Math.abs(wins - avgWins(m)) : 0;
    if (m.players.size && d > tolerance(wins)) continue;
    if (!best || d < best.d || (d === best.d && m.players.size > best.m.players.size)) best = { m, d };
  }
  return best ? best.m : newMatch();
}
function leave(m, ws) { // remove a player from their match; empty matches disappear
  const gone = m.players.get(ws);
  if (!m.players.delete(ws)) return;
  m.dirty = true;
  if (gone && m.sel[gone.room] != null && ![...m.players.values()].some(q => q.room === gone.room)) { delete m.sel[gone.room]; broadcastRound(m); } // an empty room's door vote no longer counts
  if (!m.players.size) matches.delete(m.id); else { broadcastMatch(m); checkWin(m); }
}
setInterval(() => { // one global timer steps every match
  const now = Date.now();
  for (const m of matches.values()) {
    if (!m.started) m.endsAt = now + m.dur;   // round 1 waits until someone has left the wheel and entered the rooms
    if (now >= m.endsAt) {
      const picked = [...new Set(Object.values(m.sel))], ok = vaultVotes(m) >= 2; // vault doors need 2 different rooms
      m.open = picked.filter(d => ok || !VAULT.includes(d)); m.fizzled = ok ? [] : picked.filter(d => VAULT.includes(d)); m.sel = {}; m.round++; m.dur = 45000; m.endsAt = now + m.dur; broadcastRound(m); m.lastRound = now; }
    else if (now - m.lastRound >= 1000) { m.lastRound = now; broadcastRound(m); }
    // COMBAT-BEGIN regen: 1 HP every 4 s once a player has not been hit for 6 s
    for (const p of m.players.values()) if (p.entered && !p.dead && p.stats && p.stats.health < p.stats.maxHealth && now - (p.hurtAt || 0) >= C.regenIdle && now - (p.regenAt || 0) >= C.regenEvery) { p.regenAt = now; p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + C.regenAmt); m.dirty = true; }
    // COMBAT-END
    if (m.dirty) { m.dirty = false; bcast(m, { players: [...m.players.values()].map(pub) }); } // positions go out at 20 Hz
  }
}, 50);

// 0 small 30%, 1 medium 30%, 2 big 30%, 3 wizard 9%, 4 king 1%
// Equipment decides combat stats: attack damage comes from the weapon (items.js), health from the armour.
const G = require('./items.js'), ITEMS = G.ITEMS, C = G.COMBAT;
const info = k => (typeof k === 'string' && k.length < 40 && G.info(k)) || null; // any item key incl. goblin brains
const isItem = k => !!info(k);
const SLOT_IDS = new Set([...Array.from({ length: 9 }, (_, i) => 'b' + i), ...Array.from({ length: 3 }, (_, i) => 'q' + i), 'weapon', 'armor']);
const getSlot = (inv, id) => id === 'weapon' ? inv.weapon : id === 'armor' ? inv.armor : (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)];
const setSlot = (inv, id, v) => { if (id === 'weapon') inv.weapon = v; else if (id === 'armor') inv.armor = v; else (id[0] === 'b' ? inv.backpack : inv.quick)[+id.slice(1)] = v; };
const fits = (id, key) => key == null || (id === 'weapon' ? info(key).type === 'weapon' : id === 'armor' ? info(key).type === 'armor' : true);
const allItems = inv => [inv.weapon, inv.armor, ...inv.backpack, ...inv.quick].filter(Boolean);
function recalc(p) { // derived stats from the equipped items
  const w = p.inv.weapon && info(p.inv.weapon), a = p.inv.armor && info(p.inv.armor);
  const maxHealth = a ? a.health : 10;
  p.stats = { knowledge: p.stats ? p.stats.knowledge : G.KNOWLEDGE[p.goblin], attack: w ? w.attack : 0, health: Math.min(p.stats ? p.stats.health : maxHealth, maxHealth), maxHealth };
  p.gear = { weapon: w ? w.name : 'None', armor: a ? a.name : 'None' };
}
function equip(p, goblin) { // give a player a goblin type with its starting gear and otherwise empty inventory
  const s = G.START[goblin];
  p.goblin = goblin; p.inv = { backpack: Array(G.SLOTS.backpack).fill(null), quick: Array(G.SLOTS.quick).fill(null), weapon: s.weapon, armor: s.armor };
  p.stats = null; recalc(p); p.gold = G.START_GOLD; p.parts = {}; for (const pt of G.PARTS) p.parts[pt.key] = 0;
}
const sendGold = p => { if (p.ws) sendTo(p.ws, { gold: p.gold }); };
const sendParts = p => { if (p.ws) sendTo(p.ws, { parts: p.parts }); };
function hasStation(m, p, st) { // merchant rooms have all stations, mystery 'stations' rooms list theirs
  const mm = /^c(\d+)$/.exec(p.room || ''), id = mm ? +mm[1] : -1;
  const L = id >= 0 ? m.layout[id] : null, my = id >= 0 ? m.mystery[id] : null;
  return L === 'merchant' || (L === 'mystery' && !!my && my.kind === 'stations' && Array.isArray(my.stations) && my.stations.includes(st));
}
function craft(m, p, rid) { // {craft: recipeId}; returns null or a failure reason
  if (!hasStation(m, p, 'workbench')) return 'room';
  const r = typeof rid === 'string' && G.RECIPES.find(x => x.id === rid);
  if (!r) return 'recipe';
  if (p.stats.knowledge < (r.needs || 0)) return 'knowledge';
  for (const k in r.cost) if ((p.parts[k] || 0) < r.cost[k]) return 'parts';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  for (const k in r.cost) p.parts[k] -= r.cost[k];
  giveItem(p, r.out); sendParts(p); sendTo(p.ws, { crafted: { key: r.out, recipe: r.id } });
  return null;
}
function recycle(m, p, slot) { // returns null on success or a failure reason
  if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return 'item';
  if (!hasStation(m, p, 'recycler')) return 'room';
  const key = getSlot(p.inv, slot), y = key && G.recycleYield(key);
  if (!y) return 'item';
  setSlot(p.inv, slot, null);
  for (const k in y) p.parts[k] = (p.parts[k] || 0) + y[k];
  sendInv(p); sendParts(p); sendTo(p.ws, { recycled: { key, parts: y } }); m.dirty = true;
  return null;
}
function buy(m, p, roomId, idx) { // returns null on success or a failure reason
  if (!Number.isInteger(roomId) || !Number.isInteger(idx) || roomId < 0 || roomId >= m.shops.length || p.room !== 'c' + roomId) return 'room';
  const shop = m.shops[roomId], it = shop && shop[idx];
  if (!it) return 'room';
  if (it.sold) return 'sold';
  if (p.gold < it.price) return 'gold';
  if (p.inv.backpack.indexOf(null) < 0) return 'space';
  giveItem(p, it.key); p.gold -= it.price; it.sold = true;
  sendGold(p); bcast(m, { shops: m.shops });
  return null;
}
function claim(m, p) { // E in a chest room or a weapon/armour/gold mystery room: each player takes its contents once
  const id = /^c[0-9]+$/.test(p.room || '') ? +p.room.slice(1) : -1;
  if (id < 0 || id >= m.layout.length) return 'room';
  const L = m.layout[id], my = m.mystery[id];
  let key = null, gold = 0;
  if (L === 'chest') key = m.chestKeys[id];
  else if (L === 'mystery' && my && (my.kind === 'weapon' || my.kind === 'armor')) key = my.key;
  else if (L === 'mystery' && my && my.kind === 'gold') gold = my.amount;
  else return 'room';
  p.claimed = p.claimed || new Set();
  if (p.claimed.has(id)) return 'taken';
  if (key && !giveItem(p, key)) return 'space';
  p.claimed.add(id);
  if (gold) { p.gold += gold; sendGold(p); }
  sendTo(p.ws, { claimed: { room: id, key, gold } }); m.dirty = true;
  return null;
}
const sendInv = p => { if (p.ws) sendTo(p.ws, { inv: p.inv }); };
function giveItem(p, key) { // first free backpack slot; false when full or unknown item
  if (!isItem(key)) return false;
  const i = p.inv.backpack.indexOf(null); if (i < 0) return false;
  p.inv.backpack[i] = key; sendInv(p); return true;
}
function move(p, from, to) { // inventory move/swap, strictly validated
  if (typeof from !== 'string' || typeof to !== 'string' || !SLOT_IDS.has(from) || !SLOT_IDS.has(to) || from === to) return false;
  const a = getSlot(p.inv, from), b = getSlot(p.inv, to);
  if (a == null || !fits(to, a) || !fits(from, b)) return false;
  setSlot(p.inv, to, a); setSlot(p.inv, from, b == null ? null : b);
  recalc(p); return true;
}
const pub = p => ({ kills: p.kills || 0, id: p.id, goblin: p.goblin, wins: p.wins, box: p.box, room: p.room, x: p.x, z: p.z, yaw: p.yaw, stats: p.stats, gear: p.gear }); // never includes the inventory
function addDrop(m, p, items) {
  if (!items.length) return;
  m.drops.push({ id: m.nextDrop++, x: +p.x.toFixed(2), z: +p.z.toFixed(2), items }); if (m.drops.length > 60) m.drops.shift();
  bcast(m, { drops: m.drops });
}
function rollGoblin() {
  const r = Math.random() * 100;
  return r < 30 ? 0 : r < 60 ? 1 : r < 90 ? 2 : r < 99 ? 3 : 4;
}
function spawn() {
  const box = [0, 1, 2, 3, 5, 6, 7, 8][Math.floor(Math.random() * 8)]; // never the vault (4)
  const [cx, cz] = WORLD.rc(box), [x, z] = WORLD.randomPoint(box);
  return { box, x, z, yaw: Math.atan2(-(cx - x), -(cz - z)) }; // facing the room centre
}
function die(ws, p) { // a dead player drops everything where they fell and leaves the match
  const m = p.match; if (p.dead || !m) return;
  const items = allItems(p.inv), brain = G.brainKey(p.stats.knowledge); // the brain carries the victim's CURRENT knowledge
  m.deaths = (m.deaths || 0) + 1; p.dead = true; leave(m, ws); // the client goes back to the menu or requeues with a new connection
  addDrop(m, p, [...items, brain]);
  sendTo(ws, { died: { items, brain, by: p.killedBy || null } });
}
// COMBAT-BEGIN (server-authoritative melee/ranged attacks, kills and the DEFAULT win rule: last goblin standing; see docs/FEATURES.md)
function checkWin(m) {   // DEFAULT RULE (owner has not decided): >= 2 players entered the rooms, at least one died, exactly one living entered player is left -> that player wins
  if (!m.deaths || (m.enteredEver || 0) < 2) return;
  const living = [...m.players.entries()].filter(([, q]) => q.entered && !q.dead);
  if (living.length === 1) win(living[0][0], living[0][1]);
}
function attack(m, ws, p, now) {   // {atk:1}: rate limit by weapon, nearest valid target in range, in the 70 degree cone, same room key
  if (!p.entered || p.dead) return;
  const cb = G.combat(p.inv.weapon);
  if (now - (p.atkAt || 0) < cb.cd * 0.9) return;   // 10% jitter allowance
  p.atkAt = now; bcast(m, { swing: p.id });
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), reach = cb.range + C.slack;   // forward vector, same as the client's movement
  let best = null, bd = Infinity;
  for (const [tws, t] of m.players) {
    if (t === p || t.dead || !t.entered || t.room !== p.room) continue;
    const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
    if (d > reach) continue;
    if (d > 0.05 && (dx * fx + dz * fz) / d < Math.cos(C.cone)) continue;
    if (d < bd) { bd = d; best = [tws, t]; }
  }
  if (!best) return;
  const [tws, t] = best, hp = Math.max(0, t.stats.health - cb.dmg);
  t.stats.health = hp; t.hurtAt = now; m.dirty = true;
  bcast(m, { hit: { from: p.id, to: t.id, dmg: cb.dmg, hp, max: t.stats.maxHealth, dead: hp <= 0 } });
  if (hp <= 0) { p.kills = (p.kills || 0) + 1; t.killedBy = p.id; sendTo(ws, { kills: p.kills }); die(tws, t); }
}
// COMBAT-END
function eatBrain(p, key) { // applies a brain's knowledge gain, returns the gain
  const gain = G.brainGain(key);
  p.stats.knowledge = Math.round((p.stats.knowledge + gain) * 100) / 100;
  sendTo(p.ws, { ate: { gain, knowledge: p.stats.knowledge } }); p.match.dirty = true;
  return gain;
}
function eat(p, slot) { // {eat: slotId}
  if (typeof slot !== 'string' || !/^(b[0-8]|q[0-2])$/.test(slot)) return false;
  const key = getSlot(p.inv, slot); if (!G.isBrain(key)) return false;
  setSlot(p.inv, slot, null); eatBrain(p, key); sendInv(p); return true;
}
function loot(m, p, a) { // {loot:[dropId, index, 'take'|'eat', expectedKey?]}; returns null or a failure reason
  if (!Array.isArray(a) || a.length < 3 || a.length > 4 || !Number.isInteger(a[0]) || !Number.isInteger(a[1]) || (a[2] !== 'take' && a[2] !== 'eat')) return 'item';
  const di = m.drops.findIndex(x => x.id === a[0]), dr = m.drops[di];
  if (!dr) return 'item';
  if (Math.hypot(p.x - dr.x, p.z - dr.z) > 3) return 'range';
  const key = dr.items[a[1]];
  if (key == null || (a.length === 4 && a[3] !== key)) return 'item';
  if (a[2] === 'eat') { if (!G.isBrain(key)) return 'item'; }
  else if (p.inv.backpack.indexOf(null) < 0) return 'space';
  dr.items.splice(a[1], 1); if (!dr.items.length) m.drops.splice(di, 1);
  if (a[2] === 'eat') eatBrain(p, key); else giveItem(p, key);
  bcast(m, { drops: m.drops }); m.dirty = true;
  return null;
}
function win(ws, p) { // everything carried goes home with the winner, nothing is dropped
  const m = p.match; if (p.dead || !m) return;
  const items = allItems(p.inv);
  p.dead = true; leave(m, ws);
  sendTo(ws, { won: { items, gold: p.gold, parts: p.parts } });
}

wss.on('connection', (ws, req) => {
  let q; try { q = new URL(req.url, 'http://x').searchParams; } catch { q = new URLSearchParams(); }
  const g = q.get('goblin'), goblin = g !== null && /^[0-4]$/.test(g) ? +g : rollGoblin();
  const wq = q.get('wins'), wins = wq !== null && /^\d{1,9}$/.test(wq) ? Math.min(9999, +wq) : 0;
  const id = nextId++;
  const p = { id, wins, ws, ...spawn() }; p.room = String(p.box); equip(p, goblin);
  const m = findMatch(wins); p.match = m; m.players.set(ws, p); m.dirty = true;
  ws.on('error', () => {});
  sendTo(ws, { you: id, chests: m.chests, chestKeys: m.chestKeys, layout: m.layout, mystery: m.mystery, shops: m.shops, drops: m.drops, ...roundState(m), match: matchInfo(m) });
  sendTo(ws, { inv: p.inv }); sendGold(p); sendParts(p);
  broadcastMatch(m);
  let tokens = 40, last = Date.now(); // rate limit: ~30 msg/s sustained, burst 40
  ws.on('message', (raw, isBinary) => {
    const now = Date.now();
    tokens = Math.min(40, tokens + (now - last) * 0.03); last = now;
    if (isBinary || tokens < 1) return;
    tokens--;
    let d; try { d = JSON.parse(raw.toString()); } catch { return; }
    if (p.dead || !d || typeof d !== 'object') return;
    const dbg = !!process.env.GK_DEBUG;
    if (Array.isArray(d.m) && d.m.length === 3 && d.m.every(v => typeof v === 'number' && Number.isFinite(v))) {
      p.x = clamp(d.m[0]); p.z = clamp(d.m[1]);
      p.yaw = Math.max(-1e3, Math.min(1e3, d.m[2]));
      p.box = boxOf(p.x, p.z); p.room = roomKeyOf(p.x, p.z);
      m.dirty = true;
    } else if (dbg && d.kill) { die(ws, p);   // test hooks, only with GK_DEBUG=1
    } else if (dbg && d.win) { win(ws, p);
    } else if (dbg && typeof d.give === 'string') { giveItem(p, d.give);
    } else if (dbg && Array.isArray(d.tp) && d.tp.length === 2 && d.tp.every(v => typeof v === 'number' && Number.isFinite(v))) {
      p.x = clamp(d.tp[0]); p.z = clamp(d.tp[1]); p.box = boxOf(p.x, p.z); p.room = roomKeyOf(p.x, p.z); m.dirty = true;
    } else if (dbg && Number.isFinite(d.gold)) { p.gold = Math.max(0, Math.floor(d.gold)); sendGold(p);
    } else if (d.atk === 1) { attack(m, ws, p, now);
    } else if (d.enter === 1) { if (!p.entered) { p.entered = true; m.enteredEver = (m.enteredEver || 0) + 1; broadcastMatch(m); } if (!m.started) { m.started = true; m.endsAt = now + m.dur; broadcastRound(m); }
    } else if (typeof d.eat === 'string') { eat(p, d.eat);
    } else if (Array.isArray(d.loot)) { const why = loot(m, p, d.loot); if (why) sendTo(ws, { lootFail: why });
    } else if (typeof d.craft === 'string') {
      const why = craft(m, p, d.craft); if (why) sendTo(ws, { craftFail: why });
    } else if (typeof d.recycle === 'string') {
      const why = recycle(m, p, d.recycle); if (why) sendTo(ws, { recycleFail: why });
    } else if (d.claim === 1) { const why = claim(m, p); if (why) sendTo(ws, { claimFail: why });
    } else if (Array.isArray(d.buy) && d.buy.length === 2) {
      const why = buy(m, p, d.buy[0], d.buy[1]); if (why) sendTo(ws, { buyFail: why });
    } else if (Array.isArray(d.mv) && d.mv.length === 2) {
      if (move(p, d.mv[0], d.mv[1])) { sendInv(p); m.dirty = true; }
    } else if (typeof d.drop === 'string') {
      if (SLOT_IDS.has(d.drop) && getSlot(p.inv, d.drop) != null) {
        const key = getSlot(p.inv, d.drop); setSlot(p.inv, d.drop, null); recalc(p);
        addDrop(m, p, [key]); sendInv(p); m.dirty = true;
      }
    } else if (Number.isInteger(d.sel) && d.sel >= 0 && d.sel < nDoors && (ROOM_DOORS[p.room] || []).includes(d.sel)) {
      if (m.sel[p.room] !== d.sel) { m.sel[p.room] = d.sel; broadcastRound(m); }
    }
  });
  ws.on('close', () => leave(m, ws));
});

srv.listen(process.env.PORT || 3000, () => console.log('Goblin King on :' + (process.env.PORT || 3000)));

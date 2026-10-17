// halls5.js: server side of the plain halls (docs/reports/halls-fill.md): searchable containers (hold E for a few seconds, a loot roll from the existing pools), small stations (heal font, stew pot,
// whetstone, notice board), guarded halls and containers that start empty (rolled per match). Server-authoritative: the client only sends {hall:{s:spotId, v:'use'|'stop'}}.
// Spots come from world.js (WORLD.hallSpots, the same plan the client draws); the rules and rolls are in halls.js (pure). Inert until server.js calls init/tick.
const WORLD = require('./world.js'), H = require('./halls.js');
const C = Object.assign({}, H.CFG); if (process.env.GK_DEBUG && +process.env.GK_HALL_RESTOCK_MS > 0) C.RESTOCK_MS = +process.env.GK_HALL_RESTOCK_MS;   // test hook (GK_DEBUG only): short restock
const SPOTS = WORLD.allHallSpots(), BYID = new Map(SPOTS.map(s => [s.id, s])), BYKEY = {};
for (const s of SPOTS) (BYKEY[s.key] = BYKEY[s.key] || []).push(s);
const FIGHT = WORLD.HALL_CELLS.filter(c => !WORLD.hallIsHome(c));
const FAILS = ['far', 'busy', 'cool', 'cap', 'taken', 'full', 'state', 'room'];

module.exports = function create(S) {
  const G = S.G, now0 = () => Date.now();
  const st = m => m.hall;
  const live = p => p && !p.dead && !p.dc && p.entered && !p.npc;
  const fail = (p, why) => { if (p.ws) S.sendTo(p.ws, { hallFail: FAILS.includes(why) ? why : 'state' }); return why; };
  const left = (m, id, now) => { const s = st(m) && st(m).spots[id]; return s ? Math.max(0, (s.readyAt || 0) - now) : 0; };
  function init(m, rnd = Math.random) {
    const ev = H.rollEvents(rnd, FIGHT, SPOTS), spots = {};
    if (S.DBG) { if (process.env.GK_HALL_DRY === '0') ev.dry = {}; if (process.env.GK_HALL_GUARDS === '0') ev.guard = {}; }   // test hooks (GK_DEBUG only)
    for (const s of SPOTS) spots[s.id] = { readyAt: 0, by: null, took: new Set() };
    m.hall = { spots, ev, guarded: new Set(), active: new Set(), started: false, sentAt: 0, last: 0 };
  }
  function stateOf(m, now) { const o = {}; for (const s of SPOTS) { const l = left(m, s.id, now); if (l > 0) o[s.id] = Math.round(l); } return o; }
  const sendState = (m, ids, now) => { const o = {}; for (const id of ids) o[id] = Math.round(left(m, id, now)); S.bcast(m, { hallS: o }); };
  function welcome(m, ws, p) { if (m.hall && m.hall.started) S.sendTo(ws, { hallS: stateOf(m, now0()), hallFull: 1 }); }

  // ---- can this goblin use this spot right now? (pure of side effects; the bots use it too)
  function check(m, p, sp, now) {
    if (!m.hall || m.phase !== 'play' || m.ended || !m.goAt || now < m.goAt || !live(p)) return 'state';
    if (m.sudden) return 'state';
    if (p.room !== sp.key) return 'room';
    if (Math.hypot(p.x - sp.x, p.z - sp.z) > sp.r + C.REACH_PAD) return 'far';
    if (p.carry) return 'state';
    const s = st(m).spots[sp.id];
    if (sp.kind === 'board') return null;
    if (s.by != null && s.by !== p.id) return 'busy';
    if (sp.role === 'cont') {
      if (sp.kind === 'cache' && s.took.has(p.id)) return 'taken';
      if (sp.kind !== 'cache' && now < s.readyAt) return 'cool';
      if (!H.canSearch(p.hall, m.round)) return 'cap';
    } else if (sp.kind === 'whet') {
      if (now < (p.whetCd || 0)) return 'cool';
    } else {
      if (now < s.readyAt) return 'cool';
      if (p.stats.health >= p.stats.maxHealth) return 'full';
    }
    return null;
  }
  const msFor = sp => sp.role === 'cont' ? (sp.kind === 'cache' ? C.CACHE_MS : C.SEARCH_MS) : C.STATION_MS;
  function board(m, p) {
    const rows = [...m.players.values()].filter(q => !q.npc && !q.dc).sort((a, b) => (b.kills | 0) - (a.kills | 0)).slice(0, 3).map(q => [String(q.name || '?').slice(0, 14), q.kills | 0]);
    if (p.ws) S.sendTo(p.ws, { hallFx: { k: 'board', rows, alive: [...m.players.values()].filter(q => !q.npc && !q.dead).length } });
  }
  function act(m, p, msg, now = now0()) {
    if (!msg || typeof msg !== 'object' || !m.hall) return;
    if (msg.dbg && S.DBG) { if (p.ws) S.sendTo(p.ws, { hallEv: m.hall.ev }); return; }   // test hook
    if (msg.v === 'stop') { cancel(m, p); return; }
    if (msg.v !== 'use' || typeof msg.s !== 'string' || msg.s.length > 8) return;
    const sp = BYID.get(msg.s); if (!sp) return;
    if (p.hs && p.hs.id === sp.id) return;   // key repeat: already running
    if (now - (p.hallAt || 0) < C.RATE_MS) return; p.hallAt = now;
    const why = check(m, p, sp, now); if (why) return fail(p, why);
    if (p.hs) cancel(m, p);
    if (sp.kind === 'board') return board(m, p);
    const ms = msFor(sp);
    p.hs = { id: sp.id, t0: now, ms, x: p.x, z: p.z, room: p.room, hp: p.stats.health }; st(m).spots[sp.id].by = p.id; st(m).active.add(p);
    if (p.ws) S.sendTo(p.ws, { hallMe: { id: sp.id, ms } });
  }
  function cancel(m, p, quiet) {
    const h = p.hs; if (!h) return; p.hs = null;
    if (m.hall) { const s = m.hall.spots[h.id]; if (s && s.by === p.id) s.by = null; m.hall.active.delete(p); }
    if (!quiet && p.ws) S.sendTo(p.ws, { hallMe: null });
  }
  function grant(m, p, loot) {
    if (loot.gold) { p.gold = (p.gold || 0) + loot.gold; S.sendGold(p); }
    let any = false; for (const k in loot.parts) { p.parts[k] = (p.parts[k] || 0) + loot.parts[k]; any = true; } if (any) S.sendParts(p);
    for (const k of loot.items) if (!S.giveItem(p, k)) S.addDrop(m, p, [k]);   // a full backpack drops it at his feet
    m.dirty = true;
  }
  function finish(m, p, now) {
    const h = p.hs, sp = BYID.get(h.id), s = st(m).spots[h.id]; cancel(m, p, true);
    if (p.ws) S.sendTo(p.ws, { hallMe: null });
    const why = check(m, p, sp, now); if (why) return fail(p, why);
    if (sp.role === 'cont') {
      p.hall = H.ledger(p.hall, m.round);
      const loot = H.applyCaps(p.hall, m.round, H.rollLoot(sp.kind, Math.random, G, { rare: m.rare, luck: G.RARE.luckOf(G.ITEMS, p.inv && p.inv.charm) }));
      if (sp.kind === 'cache') s.took.add(p.id); else s.readyAt = now + C.RESTOCK_MS;
      grant(m, p, loot);
      if (p.ws) S.sendTo(p.ws, { hallFx: { k: 'loot', id: sp.id, kind: sp.kind, gold: loot.gold, parts: loot.parts, items: loot.items } });
      if (sp.kind !== 'cache') sendState(m, [sp.id], now);
    } else if (sp.kind === 'whet') {
      p.whet = now + C.WHET_MS; p.whetCd = now + C.WHET_CD;
      if (p.ws) S.sendTo(p.ws, { hallFx: { k: 'whet', id: sp.id, ms: C.WHET_MS } });
    } else {   // font, stew
      const hp0 = p.stats.health; p.stats.health = Math.min(p.stats.maxHealth, hp0 + Math.round(C.FONT_HEAL * G.healMult(p.perks)));
      s.readyAt = now + C.STATION_CD[sp.kind]; m.dirty = true;
      if (p.ws) S.sendTo(p.ws, { hallFx: { k: 'heal', id: sp.id, hp: p.stats.health - hp0 } });
      sendState(m, [sp.id], now);
    }
  }
  function spawnGuardsFor(m, p) {   // a goblin walks into a guarded hall: its enemy appears beside the best container
    const h = m.hall; if (!h || !live(p) || !/^\d+$/.test(p.room || '')) return;
    const cell = +p.room, kind = h.ev.guard[cell]; if (!kind || h.guarded.has(cell)) return;
    h.guarded.add(cell);
    const sp = (BYKEY[p.room] || []).find(s => s.role === 'cont') || (BYKEY[p.room] || [])[0]; if (!sp) return;
    S.spawnGuard(m, cell, kind, sp.sx, sp.sz);
  }
  function room(m, p, prev) { if (p.room !== prev && m.hall) { if (p.hs) cancel(m, p); spawnGuardsFor(m, p); } }
  function hurt(m, t) { if (t && t.hs) cancel(m, t); }
  const death = (m, p) => { if (p.hs) cancel(m, p, true); };
  const hitMul = (p, dmg, now = now0()) => p && p.whet > now ? dmg * C.WHET_MUL : dmg;
  function tick(m, now) {
    const h = m.hall; if (!h || m.phase !== 'play' || !m.goAt || now < m.goAt) return;
    if (!h.started) {   // first tick of the play phase: the containers that start empty begin their timer now, everybody learns the state
      h.started = true; for (const id in h.ev.dry) h.spots[id].readyAt = now + h.ev.dry[id];
      S.bcast(m, { hallS: stateOf(m, now), hallFull: 1 }); h.sentAt = now;
    }
    if (now - h.last < 100) return; h.last = now;
    for (const p of [...h.active]) {
      const hs = p.hs; if (!hs) { h.active.delete(p); continue; }
      if (!live(p) || p.room !== hs.room || m.sudden || Math.hypot(p.x - hs.x, p.z - hs.z) > C.MOVE_BREAK || p.stats.health < hs.hp - 0.01) { cancel(m, p); continue; }   // moved, left, or took damage from any source
      hs.hp = Math.max(hs.hp, p.stats.health);
      if (now - hs.t0 >= hs.ms) finish(m, p, now);
    }
    // a container that became ready again tells everyone (rare: a handful of messages per minute)
    if (now - h.sentAt >= 1000) { h.sentAt = now; const ids = []; for (const s of SPOTS) { const e = h.spots[s.id]; if (e.readyAt && now >= e.readyAt) { e.readyAt = 0; ids.push(s.id); } } if (ids.length) sendState(m, ids, now); }
  }
  // ---- bots: the idle ones search what is in reach (the same act() a human uses, so every rule and cap applies)
  function botPick(m, p, now, rnd = Math.random) {
    if (!m.hall || m.sudden) return null; const list = BYKEY[p.room]; if (!list) return null;
    let best = null, bd = 1e9;
    for (const sp of list) {
      if (sp.kind === 'board') continue;
      const hurt = p.stats.health < p.stats.maxHealth * 0.75;
      if ((sp.kind === 'font' || sp.kind === 'stew') && !hurt) continue;
      if (sp.kind === 'whet' && rnd() > 0.5) continue;
      const s = st(m).spots[sp.id]; if (s.by != null && s.by !== p.id) continue;
      if (sp.role === 'cont') { if (sp.kind === 'cache' ? s.took.has(p.id) : now < s.readyAt) continue; if (!H.canSearch(p.hall, m.round)) continue; }
      else if (sp.kind === 'whet') { if (now < (p.whetCd || 0)) continue; }
      else if (now < s.readyAt) continue;
      const d = Math.hypot(p.x - sp.sx, p.z - sp.sz); if (d < bd) { bd = d; best = sp; }
    }
    return best;
  }
  return { init, tick, act, cancel, room, hurt, death, hitMul, welcome, check, botPick, stateOf, SPOTS, BYID, BYKEY, FIGHT };
};
module.exports.SPOTS = SPOTS;

// act5.js: SERVER glue for the 5x5 activity rooms (docs/PLAN-5x5-rooms.md 1.6, docs/reports/special-rooms-server.md).
// It wires the pure modules activity.js (ACT), rooms5-trees.js (TREES5), vb5.js (VB5) and vault5.js (VAULT5) into a match:
// the `act` message, the ctx object they expect, the 10 Hz tick, state broadcast (actS / actMe / actFx / actFail, trees, crown, toast),
// anchors in world coordinates, activity NPCs (husks, rootlings, wardens, wisps), the round boundary (vault tally, treasury, re-key,
// relic restock), death / disconnect, and the time-limit decision by crown claim. server.js calls it from one-line hooks (ACT5 tags).
// Node only: require('./act5.js')(deps) -> api. deps are server.js functions (see the ACT5-BEGIN block at the end of server.js).
'use strict';
const ACT = require('./activity.js'), TREES5 = require('./rooms5-trees.js'), VB5 = require('./vb5.js'), VAULT5 = require('./vault5.js'), WORLD = require('./world.js');

// ---------------------------------------------------------------- geometry: anchors in world metres {x, z, r}
const VK = WORLD.VAULT_KEY;
const TREE_CELLS = WORLD.TREE_CELLS.map(String);                     // '6' '8' '16' '18' (TREES5.rollTrees order)
const VB_CELLS = [7, 11, 13, 17].map(String);
const SIDE_OF = { [WORLD.VB_CELLS.N]: 'N', [WORLD.VB_CELLS.E]: 'E', [WORLD.VB_CELLS.S]: 'S', [WORLD.VB_CELLS.W]: 'W' };   // vb cell -> the vault side its vault door is on
const LABEL = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };
const doorBetween = (a, b) => { const d = WORLD.DOORS.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a)); return d ? d.id : -1; };
const VB_DOOR = {}, DOOR_OF_DIR = {}, DIR_OF_DOOR = {};
for (const c of VB_CELLS) { const d = doorBetween(c, VK), s = SIDE_OF[c]; VB_DOOR[c] = d; DOOR_OF_DIR[s] = d; DIR_OF_DOOR[d] = s; }
// room-local anchor tables (x east, z south, from the room centre). Trees: rooms5art-trees-a/b.js; vaultbreakers: rooms5art-vault.js
// (local frame: vault door at z = -7.5, B wall at z = +7.5); vault: rooms5art-vault.js buildVaultDressing (centre at the origin).
const TREE_LOCAL = WORLD.ACT_LOCAL.tree, VB_LOCAL = WORLD.ACT_LOCAL.vb, VAULT_LOCAL = WORLD.ACT_LOCAL.vault;   // world.js ACT_LOCAL: the same tables drive the client prompts (game.js)
// a vaultbreaker room is turned so its local -z (the vault door) faces the vault: rotY = atan2(-ux, -uz), u = unit vector to the vault
const VB_ROT = {};
for (const c of VB_CELLS) { const [cx, cz] = WORLD.rc(+c), [vx, vz] = WORLD.rc(WORLD.VAULT); VB_ROT[c] = Math.atan2(-Math.sign(vx - cx), -Math.sign(vz - cz)); }
const toWorld = (key, lx, lz) => {   // room-local -> world (the same transform as rooms5art-vault.js transformSolids)
  const r = WORLD.roomRect(key), ry = VB_ROT[key] || 0, c = Math.cos(ry), s = Math.sin(ry);
  return [r.cx + lx * c + lz * s, r.cz - lx * s + lz * c];
};
const toLocal = (key, x, z) => { const r = WORLD.roomRect(key), ry = VB_ROT[key] || 0, c = Math.cos(ry), s = Math.sin(ry), dx = x - r.cx, dz = z - r.cz; return [c * dx - s * dz, s * dx + c * dz]; };
const ANCHORS = {};
const fill = (key, tbl) => { const o = {}; for (const id of Object.keys(tbl)) { const [lx, lz, r] = tbl[id], [x, z] = toWorld(key, lx, lz); o[id] = { x: +x.toFixed(3), z: +z.toFixed(3), r }; } ANCHORS[key] = o; };
for (const c of TREE_CELLS) fill(c, TREE_LOCAL);
for (const c of VB_CELLS) fill(c, VB_LOCAL);
fill(VK, VAULT_LOCAL);
const kindOfKey = k => TREE_CELLS.includes(k) ? 'tree' : VB_CELLS.includes(k) ? 'vb' : k === VK ? 'vault' : null;
const ACT_ROOMS = [...TREE_CELLS, ...VB_CELLS, VK];
const inLane = (key, p) => { const [lx, lz] = toLocal(key, p.x, p.z); return Math.abs(lx) <= 1.0 && lz >= -7.5 && lz <= -2.5; };   // the ram lane F: 2 m wide, 5 m deep in front of the vault door

// ---------------------------------------------------------------- items: vb5 token keys -> items.js keys ('x:wedge' is the old Door Wedge, so the Iron Wedge is 'x:ironwedge')
const ALIAS = { 'x:wedge': 'x:ironwedge' };
const alias = k => ALIAS[k] || k;
const TOKENS = new Set(['x:ironwedge', 'x:skeleton', 'x:goldleaf', 'x:runecharge', 'x:blank', 'x:crownseal']);   // one of each at a time
// ---------------------------------------------------------------- activity NPCs (merged from the specs; looks are goblin model indexes)
const NPCS = Object.assign({}, ...TREES5.specs().map(s => (s && s.npc) || {}), VB5.NPC, VAULT5.NPC);
const NPC_LOOK = { husk: 1, rootling: 2, warden: 2, wisp: 0 };
const NPC_MAX = 16;   // live activity NPCs per match

module.exports = function create(S) {
  const G = S.G, now0 = () => Date.now();
  const r2 = v => Math.round(v * 100) / 100;
  const srv = t => (t ? t - S.T0 : 0);   // epoch ms -> the client's server clock (pong/snapshot `t`)
  let errs = 0; const oops = (where, e) => { if (errs++ < 5) console.error('act5 ' + where, e); };

  // ---- players as the modules see them: {id, x, z, room, alive, hp, maxHp, hurtAt, yaw, lat, carry, bless, name}
  function prep(p) {
    if (p && !p._a5) Object.defineProperties(p, {
      _a5: { value: true },
      alive: { get() { return !this.dead && !!this.entered && !this.dc; }, set() {}, configurable: true },
      hp: { get() { return this.stats ? this.stats.health : 0; }, set() {}, configurable: true },
      maxHp: { get() { return this.stats ? this.stats.maxHealth : 0; }, set() {}, configurable: true },
    });
    return p;
  }
  const goblins = m => { const out = []; for (const q of m.players.values()) if (!q.npc && q.entered && !q.dead) out.push(prep(q)); return out; };
  const occ = (m, key) => goblins(m).filter(q => q.room === key && !q.dc);
  const findP = (m, id) => { if (id == null) return null; for (const q of m.players.values()) if (q.id === id && !q.npc) return prep(q); return null; };
  const keyOf = (m, p) => { for (const [k, q] of m.players) if (q === p) return k; return p.ws || p.key || null; };
  const humansIn = (m, keys) => { const out = []; for (const q of m.players.values()) if (!q.bot && !q.npc && q.ws && keys.has(q.room)) out.push(q); return out; };
  const nbrs = (m, key) => { const s = new Set([key]); for (const d of WORLD.ROOM_DOORS[key] || []) if (S.isOpen(m, d)) { const dd = WORLD.DOORS[d]; s.add(dd.a === key ? dd.b : dd.a); } return s; };

  // ---- inventory helpers (slot numbers for the modules: -1 the equipped weapon, 0..8 backpack, 9..11 quick)
  const slotGet = (p, s) => s === -1 ? p.inv.weapon : s >= 0 && s < 9 ? p.inv.backpack[s] : s >= 9 && s < 12 ? p.inv.quick[s - 9] : null;
  function count(p, k) { let n = 0; for (const x of p.inv.backpack) if (x === k) n++; for (const x of p.inv.quick) if (x === k) n++; return n; }
  function peek(p, s) { if (typeof s === 'string') return count(p, s) ? s : null; return Number.isInteger(s) ? slotGet(p, s) || null : null; }
  function take(m, p, s) {
    let key = null;
    if (typeof s === 'string') {
      let i = p.inv.backpack.indexOf(s); if (i >= 0) { p.inv.backpack[i] = null; key = s; }
      else { i = p.inv.quick.indexOf(s); if (i >= 0) { p.inv.quick[i] = null; key = s; } }
    } else if (Number.isInteger(s)) {
      key = slotGet(p, s) || null; if (!key) return null;
      if (s === -1) p.inv.weapon = null; else if (s < 9) p.inv.backpack[s] = null; else p.inv.quick[s - 9] = null;
    }
    if (!key) return null;
    S.recalc(p); S.sendInv(p); m.dirty = true; return key;
  }
  function give(m, p, key) {   // into the backpack, else onto the floor at his feet (never lost)
    if (!G.info(key)) return false;
    if (TOKENS.has(key) && count(p, key)) return false;
    if (S.giveItem(p, key)) { m.dirty = true; return true; }
    S.addDrop(m, p, [key]); return true;
  }
  const giveTok = (m, p, key) => { if (!G.info(key) || (TOKENS.has(key) && count(p, key))) return false; if (!S.giveItem(p, key)) return false; m.dirty = true; return true; };
  function spend(m, p, c, dry) {
    const gold = c.gold | 0, metal = c.metal | 0, elx = c.elixir | 0;
    if ((p.gold || 0) < gold || ((p.parts && p.parts.metal) || 0) < metal || (elx && !(typeof p.elixir === 'number' && p.elixir >= elx))) return false;
    if (dry) return true;
    if (gold) { p.gold -= gold; S.sendGold(p); }
    if (metal) { p.parts.metal -= metal; S.sendParts(p); }
    if (elx) { p.elixir -= elx; S.sendTo(p.ws, { elixir: p.elixir }); }
    return true;
  }
  const pay = (m, p, n) => { if (!(n > 0)) return; p.gold = (p.gold || 0) + Math.round(n); S.sendGold(p); };
  const spendElixir = (p, n) => { if (!(typeof p.elixir === 'number' && p.elixir >= n)) return false; p.elixir -= n; S.sendTo(p.ws, { elixir: p.elixir }); return true; };
  const brainOf = p => [...p.inv.backpack, ...p.inv.quick].some(k => G.isBrain(k)) ? 'goblin' : count(p, 'x:huskbrain') ? 'husk' : null;
  function takeBrain(m, p, kind) {
    if (kind === 'husk') return take(m, p, 'x:huskbrain') != null;
    const k = [...p.inv.backpack, ...p.inv.quick].find(x => G.isBrain(x)); if (!k) return false;
    take(m, p, k); p._pressKey = k; return true;
  }
  function pressBrain(m, p, o) {   // a pressed goblin brain: the normal eat (5%, +1 knowledge point, Brain Gourmet) plus the rest up to pct (10%)
    const k = p._pressKey; p._pressKey = null; if (!k) return;
    const gain = S.eatBrain(p, k), extra = Math.round(gain * ((o && o.pct || 0.05) / 0.05 - 1) * 100) / 100;
    if (extra > 0) { p.stats.knowledge = Math.round((p.stats.knowledge + extra) * 100) / 100; S.sendTo(p.ws, { ate: { gain: extra, knowledge: p.stats.knowledge, pressed: 1 } }); }
    m.dirty = true;
  }

  // ---- messages
  const send = (p, o) => { if (p && p.ws) S.sendTo(p.ws, o); };
  function fx(m, key, k, d, scope) {
    const body = Object.assign({ r: key }, d || {}); if (body.k !== undefined) body.bk = body.k; body.k = k;   // a module's own data key k (bless: fury / bark / thorns, press: goblin / husk) must not replace the event kind: it travels as bk
    const msg = JSON.stringify({ actFx: body });
    if (k === 'capped') { const q = findP(m, d && d.id); if (q && q.ws) S.sendTo(q.ws, msg); return; }   // "The trees have taught you enough for now": the goblin it concerns
    if (scope === 'all') return S.bcast(m, msg);
    for (const q of humansIn(m, scope === 'near' ? nbrs(m, key) : new Set([key]))) S.sendTo(q.ws, msg);
  }
  const toastAll = (m, text) => S.bcast(m, { toast: String(text) });
  const knowLeft = (m, p) => { const u = ACT.limit.used(m.act.L, p, 'know'); return Math.max(0, Math.min(ACT.C.TREE_KNOW_ROUND - u.round, ACT.C.TREE_KNOW_MATCH - u.match)); };
  function award(m, p, what, src, key) {   // THE reward path: knowledge caps (activity.js award), then apply and float "+n" to the goblin
    if (!p || p.dead || !p.stats) return { know: 0, gold: 0, item: null, tok: null, heal: 0, pulse: 0, capped: false };
    const o = ACT.award(m.act.L, m.act.log, p, what || {}, src);
    if (o.know > 0) p.stats.knowledge = Math.round((p.stats.knowledge + o.know) * 100) / 100;
    if (o.gold > 0) { p.gold = (p.gold || 0) + o.gold; S.sendGold(p); }
    if (o.item) give(m, p, alias(o.item));
    if (o.tok) give(m, p, alias(o.tok));
    if (o.heal > 0 && p.stats.health < p.stats.maxHealth) p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + o.heal);
    if (o.pulse) pulse(m, p, o.pulse);
    if (o.know || o.gold || o.item || o.tok || o.heal) m.dirty = true;
    if (o.know || o.gold || o.item || o.tok) send(p, { actFx: { r: key, k: src === 'vault:treasury' ? 'treasury' : 'gain', know: o.know || 0, gold: o.gold || 0, ...(o.item ? { item: alias(o.item) } : null), ...(o.tok ? { tok: alias(o.tok) } : null) } });
    return o;
  }
  function hiddenRooms(m) { const out = []; for (const c of TREE_CELLS) { const t = m.act.trees[c]; if (t.type === 'oak' && t.st.warden != null) out.push(c); } return out; }
  function pulse(m, p, pu) {   // Seer rewards: an 8 s map pulse (positions + this round's picks), or the next vaultbreaker layout early
    if (pu.vbNext) return send(p, { actFx: { r: p.room, k: 'vbNext', vbNext: VB5.layoutView(m.act.H, 0).vbNext } });
    const hid = new Set(hiddenRooms(m)), gob = [];
    for (const q of goblins(m)) if (q !== p && !hid.has(q.room)) gob.push(pu.hp ? [q.id, r2(q.x), r2(q.z), q.stats.health, q.stats.maxHealth] : [q.id, r2(q.x), r2(q.z)]);
    send(p, { actFx: { r: p.room, k: 'pulse', ms: pu.ms || 8000, hp: pu.hp ? 1 : 0, picks: pu.picks ? Object.fromEntries(Object.entries(m.sel).filter(([k]) => !hid.has(k))) : null, gob } });
  }
  const roomLabel = (m, k) => {
    const kd = kindOfKey(k);
    if (kd === 'tree') return TREES5.NAMES[m.act.trees[k].type] || 'a tree room';
    if (kd === 'vb') return ({ ram: 'the Battering Ram', locksmith: 'the Locksmith', counting: 'the Counting House', keystone: 'the Keystone' })[VB5.typeAt(m.act.H, k)] || 'a vaultbreaker';
    if (kd === 'vault') return 'the Vault';
    if (k[0] === 'c') return WORLD.CHEST[+k.slice(1)] && WORLD.CHEST[+k.slice(1)].home ? 'a home' : 'a side room';
    return 'hall ' + k;
  };
  const TYPE_NAME = { ram: 'Ram', locksmith: 'Locksmith', counting: 'Counting', keystone: 'Keystone' };
  function intel(m, kind, w) {   // Hollow Oak whispers (a private toast); null = nothing to tell, the oak tries the next kind
    const A = m.act, H = A.H;
    if (kind === 'goblin') { const cand = goblins(m).filter(q => q !== w); if (!cand.length) return null; const q = cand[Math.floor(A.rng() * cand.length)]; return (q.name || 'A goblin') + ' is in ' + roomLabel(m, q.room) + ' with ' + Math.round(q.stats.health) + ' HP'; }
    if (kind === 'breach') { let best = null; for (const d of Object.keys(H.breach)) if (H.breach[d] > 0 && (!best || H.breach[d] > H.breach[best])) best = d; return best == null ? null : 'The ' + LABEL[DIR_OF_DOOR[best]] + ' vault door is at ' + H.breach[best] + '% breach'; }
    if (kind === 'strongbox') return 'The Counting House strongbox holds ' + Math.floor(H.st.counting._box) + ' gold';
    if (kind === 'circuit') { const ks = H.st.keystone; return 'The Keystone circuit: ' + ks.order.join(' > '); }
    if (kind === 'vbNext') { const n = VB5.layoutView(H, 0).vbNext; return 'Next re-key: ' + VB_CELLS.map(c => TYPE_NAME[n[c]] + ' ' + LABEL[SIDE_OF[c]]).join(', '); }
    return null;
  }

  // ---- environment damage (thorn grip, ram lane, keystone backlash, venting): no attacker, no kill credit, no armour
  function envDmg(m, p, n, src) {
    if (!p || p.dead || !p.stats || !(n > 0) || !p.entered) return;
    const hp = Math.max(0, p.stats.health - Math.round(n)); p.stats.health = hp; p.hurtAt = Date.now(); m.dirty = true;
    S.bcast(m, { hit: { from: p.id, to: p.id, dmg: Math.round(n), hp, max: p.stats.maxHealth, dead: hp <= 0, env: String(src || '') } });
    if (!p.npc) hurt(m, p, null);
    if (hp <= 0) { p.killedBy = null; p.killer = { name: src === 'vent' ? 'the vents' : src === 'ram' ? 'the Ram' : src === 'backlash' ? 'the Keystone' : 'the room', npc: true, w: '' }; S.die(keyOf(m, p), p); }
  }
  function push(m, p, key, dx, dz) {
    let ux = dx, uz = dz, d = 1.5;
    if (kindOfKey(key) === 'vb') {   // vb5 asks push(p, 0, 2): 2 m sideways out of the ram lane, away from its middle
      const [lx] = toLocal(key, p.x, p.z), ry = VB_ROT[key] || 0, sx = lx >= 0 ? 1 : -1; ux = Math.cos(ry) * sx; uz = -Math.sin(ry) * sx; d = 2;
    }
    const l = Math.hypot(ux, uz) || 1; let [x, z] = S.clampIn(key, p.x + ux / l * d, p.z + uz / l * d, 0.8);
    if (WORLD.inProp(x, z, 0.45, m.layout, true)) return;
    S.place(p, x, z); send(p, { fix: [r2(x), r2(z)] }); m.dirty = true;
  }

  // ---- the ctx every module call gets (one per room per tick / message)
  function ctx(m, key, now) {
    const A = m.act;
    return {
      now, recv: now, rng: A.rng, round: m.round, sudden: !!m.sudden, room: key,
      occupants: () => occ(m, key), player: id => findP(m, id), players: () => goblins(m),
      anchor: id => (ANCHORS[key] && ANCHORS[key][id]) || null,
      award: (p, what, src) => award(m, p, what, src, key), knowLeft: p => knowLeft(m, p),
      fx: (k, d, scope) => fx(m, key, k, d, scope), toastAll: text => toastAll(m, text), toast: (p, text) => send(p, { toast: String(text) }),
      spawn: (kind, an, o) => spawnNpc(m, key, kind, an, o || {}), npcAlive: id => { const q = A.npcs.get(id); return !!q && !q.dead; },
      dmg: (p, n, src) => envDmg(m, p, n, src), push: (p, dx, dz) => push(m, p, key, dx, dz), recalc: p => { S.recalc(p); m.dirty = true; },
      items: G.ITEMS, item: (p, k) => count(p, k) > 0, count: (p, k) => count(p, k), peek: (p, s) => peek(p, s), take: (p, s) => take(m, p, s),
      elixir: (p, n) => spendElixir(p, n), intel: (kind, p) => intel(m, kind, p), remember: () => false,
      brainOf: p => brainOf(p), takeBrain: (p, kind) => takeBrain(m, p, kind), eatBrain: (p, o) => pressBrain(m, p, o),
      hasItem: (p, k) => count(p, alias(k)) > 0, takeItem: (p, k) => take(m, p, alias(k)) != null, giveItem: (p, k) => giveTok(m, p, alias(k)),
      spend: (p, c, dry) => spend(m, p, c || {}, dry), pay: (p, n) => pay(m, p, n), at: (p, id) => id === 'F' && inLane(key, p),
      topClaimant: () => VAULT5.topClaimant(A.vault), doorLabel: d => LABEL[DIR_OF_DOOR[d]] || 'vault',
      doorOpen: dir => S.isOpen(m, DOOR_OF_DIR[dir]), doorBroken: dir => (A.H.breach[DOOR_OF_DIR[dir]] || 0) >= VB5.K.BROKEN,
      relicTaken: () => !!m.relicTaken, roomKind: k => VAULT5.kindOf(k), carryBlocks: p => !!(p.carry && p.carry.heavy),
    };
  }

  // ---- activity NPCs: records in m.players like the mystery enemies (npc: kind), with their own small brain (npcThink)
  function spawnNpc(m, key, kind, anchorId, o) {
    const A = m.act, N = NPCS[kind]; if (!N || A.npcs.size >= NPC_MAX || m.ended || A.noSpawn) return null;
    const an = (ANCHORS[key] && (ANCHORS[key][anchorId] || ANCHORS[key].C)) || null, rr = WORLD.roomRect(key);
    let x = an ? an.x : rr.cx, z = an ? an.z : rr.cz;
    { let ux = rr.cx - x, uz = rr.cz - z; const l = Math.hypot(ux, uz); if (l < 0.3) { ux = 0; uz = 1; } else { ux /= l; uz /= l; } const off = an ? an.r + 0.9 : 0; x += ux * off; z += uz * off; }
    [x, z] = S.clampIn(key, x, z, 1.0);
    if (WORLD.inProp(x, z, 0.5, m.layout, true)) { x = rr.cx + (A.rng() - 0.5) * 3; z = rr.cz + 2 + A.rng(); }
    const id = S.newId(), k = { readyState: 0, npc: true };
    const p = { id, wins: 0, ws: null, key: k, npc: kind, name: N.name, match: m, box: -1, yaw: 0, ready: true, entered: true, npcDmg: N.dmg | 0, npcCd: N.cd || 1000 };
    S.equip(p, NPC_LOOK[kind] || 0); p.inv.weapon = 'w:club'; p.inv.armor = null; S.recalc(p);
    p.stats.maxHealth = N.hp; p.stats.health = N.hp; p.stats.attack = N.dmg | 0; p.gear = { weapon: N.name, armor: 'None' };
    S.place(p, x, z); p.home = [x, z]; p.brain = S.newBrain(p, N.speed || 3);
    p.brain.react = Array.isArray(N.react) ? N.react : [(N.react || 400) * 0.8, (N.react || 400) * 1.2];
    p.actNpc = { kind, room: key, target: o.target != null ? o.target : null, goal: o.goal || null, near: 0 };
    m.players.set(k, p); A.npcs.set(id, p); m.dirty = true;
    return id;
  }
  function despawn(m, p) { p.dead = true; m.players.delete(p.key); m.act.npcs.delete(p.id); VB5.npcGone(m.act.H, p.id); m.dirty = true; }
  function npcLoot(kind) {
    const N = NPCS[kind]; if (!N || !N.loot) return [];
    if (typeof N.loot[0] === 'string') return N.loot.slice();   // husks: a Husk Brain
    const out = [], [n, tier] = N.loot;
    for (let i = 0; i < (n | 0); i++) { let k = null; for (let t = 0; t < 40; t++) { k = (i % 2 ? G.randomArmorKey : G.randomWeaponKey)(); if (G.ITEMS[k].tierN >= tier) break; } if (k) out.push(k); }
    return out;
  }
  function npcDied(m, p) {   // dieNpc hook for activity NPCs: loot, wave bookkeeping, the room's onKill (Thorn bowl, Press, Elder)
    const A = m.act; despawn(m, p);
    const items = npcLoot(p.npc); if (items.length) S.addDrop(m, p, items);
    if (S.sendBoard) S.sendBoard(m);
    const killer = findP(m, p.killedBy), key = p.room, now = Date.now();
    try { if (kindOfKey(key) === 'tree') { const t = A.trees[key]; ACT.kill(t.st, t.type, killer, { npc: true, id: p.id }, ctx(m, key, now)); } } catch (e) { oops('npcDied', e); }
  }
  const pick = (r, a) => a[0] + r() * (a[1] - a[0]);
  function npcThink(m, p, now, dt) {   // botThink hook: true = handled
    const a = p.actNpc, b = p.brain, A = m.act; if (!a || !A) return false;
    if (a.kind === 'wisp') { wispThink(m, p, now, dt); return true; }
    if (now >= (b.reactAt || 0)) {
      b.reactAt = now + pick(Math.random, b.react || [300, 500]);
      let tg = a.target != null ? findP(m, a.target) : null;
      if (!tg || tg.dead || tg.dc || tg.room !== p.room) { tg = null; let bd = 9; for (const q of goblins(m)) { if (q.room !== p.room || q.dc) continue; const d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd) { bd = d; tg = q; } } }
      b.tgt = tg;
    }
    const t = b.tgt && !b.tgt.dead && b.tgt.room === p.room ? b.tgt : null;
    if (t) { if (p.npcDmg > 0) S.npcFight(m, p, t, now, dt); return true; }
    if (Math.hypot(p.x - p.home[0], p.z - p.home[1]) > 0.6) S.stepTo(m, p, p.home[0], p.home[1], dt, now);
    return true;
  }
  function wispThink(m, p, now, dt) {   // a wisp flies to a lit Keystone stone and snuffs it after 2 s beside it
    const a = p.actNpc, A = m.act, H = A.H, cell = a.room;
    if (VB5.typeAt(H, cell) !== 'keystone') return;
    const c = ctx(m, cell, now);
    if (!a.goal) a.goal = VB5.ksWispGoal(H, c);
    const an = a.goal && ANCHORS[cell][a.goal]; if (!an) { a.near = 0; return; }
    const rr = WORLD.roomRect(cell), l = Math.hypot(rr.cx - an.x, rr.cz - an.z) || 1, tx = an.x + (rr.cx - an.x) / l * (an.r + 0.7), tz = an.z + (rr.cz - an.z) / l * (an.r + 0.7);
    if (Math.hypot(p.x - an.x, p.z - an.z) > an.r + 1.3) { a.near = 0; S.stepTo(m, p, tx, tz, dt, now); return; }
    if (!a.near) a.near = now;
    if (now - a.near >= VB5.K.WISP_SNUFF_MS) { try { if (VB5.wispSnuff(H, a.goal, c)) fx(m, cell, 'wispsnuff', { a: a.goal }, 'room'); } catch (e) { oops('wisp', e); } a.goal = null; a.near = 0; }
  }

  // ---------------------------------------------------------------- lifecycle
  function init(m) {
    const now = Date.now(), rng = ACT.rng((Math.random() * 4294967296) >>> 0), types = TREES5.rollTrees(rng);
    const A = m.act = { rng, L: ACT.limit.make(), log: {}, trees: {}, vault: ACT.init('vault', rng, now), H: VB5.create({ cells: VB_CELLS, doors: VB_DOOR, rng, now }),
      t: 0, sent: {}, crownSig: '', crownT: 0, alarm: false, alarmAdded: [], npcs: new Map(), rfSig: '', rfT: 0 };
    TREE_CELLS.forEach((c, i) => { A.trees[c] = { type: types[i], st: ACT.init(types[i], rng, now) }; });
    m.trees = treeMap(m); if (m.layout) m.layout.trees = m.trees; m.vb = VB5.layoutView(A.H, null).vb;
  }
  const treeMap = m => { const o = {}; for (const c of TREE_CELLS) o[c] = m.act.trees[c].type; return o; };
  function setTree(m, cell, type, now) { m.act.trees[cell] = { type, st: ACT.init(type, m.act.rng, now) }; m.trees = treeMap(m); if (m.layout) m.layout.trees = m.trees; S.bcast(m, { trees: m.trees }); }

  function viewOf(m, key, now) {
    const A = m.act, kd = kindOfKey(key);
    if (kd === 'tree') { const t = A.trees[key], v = ACT.view(t.st, t.type), lv = pl => Math.floor(ACT.pool.level(pl, now) + 1e-9); if (t.type === 'well') v.water = lv(t.st.pool); else if (t.type === 'spring') for (const b of Object.keys(v.basins)) v.basins[b] = lv(t.st.basins[b]); else if (t.type === 'graft') v.branches = t.st.br.map(lv); return { type: t.type, st: v }; }   // pools refill lazily: the public view carries the level at this moment
    if (kd === 'vb') return VB5.view(A.H, key, now);
    return { type: 'vault', st: VAULT5.view(A.vault, { now }) };
  }
  const actSMsg = (m, key, now, v) => JSON.stringify({ actS: { r: key, t: S.srvT(), e: S.T0, type: v.type, st: v.st } });
  function meOf(m, p, now) {   // the goblin's own state: running channel, open timing attempt (HUD arc), carry, blessing, caps, claim
    const A = m.act, key = p.room, kd = kindOfKey(key), o = {};
    if (kd === 'tree') {
      const t = A.trees[key], spec = ACT.get(t.type);
      if (spec.me) Object.assign(o, spec.me(t.st, p, ctx(m, key, now)));
      for (const n of Object.keys(t.st.chs)) { const c = t.st.chs[n]; if (c.by === p.id) { o.chan = { a: c.anchor, t0: srv(c.t0), ms: c.ms, n }; break; } }
      if (t.st.grip && t.st.grip.by === p.id) o.chan = { a: 'C', t0: srv(t.st.grip.t0), ms: TREES5.K.tierMs[2], ticks: [1 / 3, 2 / 3, 1], n: 'grip' };
      if (o.tm) { o.timing = { a: 'NE', t0: srv(o.tm.t0), per: o.tm.per, wa: o.tm.wa % 1, wb: o.tm.wb % 1, curve: 'saw' }; }
      delete o.tm; if (o.deadline) o.deadline = srv(o.deadline);
    } else if (kd === 'vb') {
      const tm = VB5.me(A.H, key, p.id), s = VB5.stOf(A.H, key);
      if (tm) o.timing = { a: tm.a, t0: srv(tm.t0), per: tm.per, wa: tm.wa, wb: tm.wb, curve: 'saw' };
      const c = s && s.ch.find(x => x.pid === p.id); if (c) o.chan = { a: c.anchor, t0: srv(c.t0), ms: c.ms, n: c.k };
    } else if (kd === 'vault') {
      for (const k of Object.keys(A.vault.ch)) { const c = A.vault.ch[k]; if (c.by === p.id) { o.chan = { a: k, t0: srv(c.t0), ms: c.ms }; break; } }
    }
    o.r = key; o.claim = VAULT5.claimOf(A.vault, p.id); o.know = knowLeft(m, p);
    if (p.carry) o.carry = { tok: p.carry.tok, heavy: !!p.carry.heavy, ...(p.carry.n ? { n: p.carry.n } : null) };
    if (p.bless && p.bless.until >= m.round) o.bless = p.bless;
    return o;
  }
  function roomTick(m, key, now, dt) {
    const A = m.act, kd = kindOfKey(key);
    try {
      if (kd === 'tree') { const t = A.trees[key]; ACT.tick(t.st, t.type, ctx(m, key, now), dt); if (t.st.become === 'well' && t.type === 'elder') setTree(m, key, 'well', now); }
      else if (kd === 'vb') VB5.tick(A.H, key, ctx(m, key, now), dt);
    } catch (e) { oops('tick ' + key, e); }
  }
  function alarmDoors(m, on) {   // the crown alarm forces the 4 vault doors open while someone claims (and 10 s after); the doors it opened close again
    const A = m.act; if (m.sudden || m.showdown) { A.alarm = on; A.alarmAdded = []; return; }
    if (on && !A.alarm) { for (const d of S.VAULT) if (!m.open.includes(d)) { m.open = m.open.concat(d); A.alarmAdded.push(d); } if (m.shut) m.shut = m.shut.filter(d => !S.VAULT.includes(d)); if (!S.rule('doorclose')) A.vault.barPend = {}; if (A.alarmAdded.length) S.broadcastRound(m); }
    else if (!on && A.alarm && A.alarmAdded.length && !S.rule('doorclose')) A.alarmAdded = [];   // DOORS-PERSIST (docs/reports/doors-persist.md): a door the alarm forced stays open for good
    else if (!on && A.alarm && A.alarmAdded.length) { const gone = A.alarmAdded; A.alarmAdded = []; m.open = m.open.filter(d => !gone.includes(d)); S.broadcastRound(m); }
    A.alarm = on;
  }
  function barDoors(m, alarm) {   // DOORS-PERSIST: a finished bar shuts its open vault door at once (m.shut); the round end reopens it (server ruleOpen). Not under the alarm or in sudden death, never a Broken door.
    const A = m.act, bp = A.vault.barPend; if (m.sudden || alarm || S.rule('doorclose')) return;
    for (const dir in bp) { const d = DOOR_OF_DIR[dir]; if (!bp[dir] || !m.open.includes(d) || (A.H.breach[d] || 0) >= VB5.K.BROKEN) continue; m.open = m.open.filter(x => x !== d); (m.shut = m.shut || []).push(d); S.broadcastRound(m); }
  }
  function tick(m, now) {
    const A = m.act; if (!A || m.phase !== 'play' || !m.started || m.ended || !m.goAt || now < m.goAt) return;
    if (now - A.t < 95) return;
    const dt = A.t ? Math.min(250, now - A.t) : 100; A.t = now;
    VB5.setSudden(A.H, !!m.sudden);
    for (const c of TREE_CELLS) roomTick(m, c, now, dt);
    for (const c of VB_CELLS) roomTick(m, c, now, dt);
    try {   // the vault: claim, alarm, wardens, coffers, bars; then the sudden-death venting everywhere outside it
      const vc = ctx(m, VK, now);
      VAULT5.setWard(A.vault, VB5.wardActive(A.H, now));
      if (VB5.quakeActive(A.H, now)) VAULT5.quake(A.vault, now, A.H.quakeUntil - now);
      const vr = VAULT5.tick(A.vault, vc, dt);
      alarmDoors(m, !!vr.alarm);
      barDoors(m, !!vr.alarm);
      if (m.sudden) VAULT5.ventTick(A.vault, goblins(m).filter(q => !q.dc), vc);
    } catch (e) { oops('vault', e); }
    if (m.ended) return;
    broadcast(m, now);
  }
  function broadcast(m, now) {
    const A = m.act;
    for (const key of ACT_ROOMS) {   // actS: when it changed, at most 5 Hz per room, to the room and its neighbours through open doors
      const e = A.sent[key] || (A.sent[key] = { s: '', t: 0 });
      if (now - e.t < 200) continue;   // PERF4: the 200 ms spacing is checked first (it was checked after building and stringifying the view, 41 rooms x 10 Hz)
      const to = humansIn(m, nbrs(m, key)); if (!to.length) continue;   // PERF4: and nobody to tell, nothing to build; the first view after a human arrives differs from the stale one and is sent
      let v; try { v = viewOf(m, key, now); } catch (e) { oops('view ' + key, e); continue; }
      const s = JSON.stringify(v);
      if (s === e.s) continue;
      e.s = s; e.t = now; const msg = actSMsg(m, key, now, v);
      for (const q of to) S.sendTo(q.ws, msg);
    }
    for (const q of m.players.values()) {   // actMe: your own state, when it changed
      if (q.bot || q.npc || !q.ws || q.dead) continue;
      let me = null; if (kindOfKey(q.room)) { try { me = meOf(m, prep(q), now); } catch (e) { oops('me', e); } }
      const s = me ? JSON.stringify(me) : '';
      if (s !== (q._actMe || '')) { q._actMe = s; S.sendTo(q.ws, { actMe: me || {} }); }
    }
    const cv = VAULT5.view(A.vault, { now }), cs = JSON.stringify([cv.claims, cv.gaining, cv.alarm, cv.ward]);   // crown: to everyone, 4 Hz while it changes
    if (cs !== A.crownSig && now - A.crownT >= 250 && !S.rule('crown')) { A.crownSig = cs; A.crownT = now; S.bcast(m, { crown: cv.claims.length || cv.alarm ? cv : null }); }
    const f = VB5.roundFields(A.H, now, m.endsAt - now), rs = JSON.stringify([f.breach, f.armed, f.writs, f.vbNext ? 1 : 0, hiddenRooms(m)]);   // roundState fields changed: tell everyone now, not at the next 1 s beat
    if (rs !== A.rfSig && now - A.rfT >= 250) { const first = !A.rfSig; A.rfSig = rs; A.rfT = now; if (!first) S.broadcastRound(m); }
  }

  // ---------------------------------------------------------------- the act message
  const FAILS = ACT.C.FAILS;
  const progress = v => v && v.st ? (v.st.notch != null ? v.st.notch + (v.st.ready != null ? 10 : 0) : v.st.notches != null ? v.st.notches : v.st.pins != null ? v.st.pins : 0) : 0;
  function act(m, p, raw, now) {
    const A = m.act; if (!A || !p || p.npc) return;
    const a = ACT.msg.parse(raw); if (!a) return;
    if (m.phase !== 'play' || !m.goAt || now < m.goAt || m.ended || p.dead || !p.entered || p.dc) return;
    const rb = p._ar || (p._ar = ACT.rate.make()); if (!ACT.rate.allow(rb, now)) return;
    if (a.r !== p.room) return;
    const kd = kindOfKey(a.r), an = kd && Object.prototype.hasOwnProperty.call(ANCHORS[a.r], a.a) ? ANCHORS[a.r][a.a] : null; if (!an) return;
    prep(p);
    const sack = kd === 'vb' && a.v === 'pick' && VB5.typeAt(A.H, a.r) === 'counting';   // a dropped coin sack: any anchor, the module checks 1.8 m
    if (a.v !== 'stop' && !sack && !ACT.reach(p, an)) return send(p, { actFail: 'far' });
    const c = ctx(m, a.r, now), before = a.v === 'tap' ? progress(viewOf(m, a.r, now)) : 0;
    let r;
    try {
      if (kd === 'tree') { const t = A.trees[a.r]; r = ACT.verb(t.st, t.type, p, a.v, { a: a.a, x: a.x }, c); }
      else if (kd === 'vb') { c.a = a.a; r = VB5.verb(A.H, a.r, p, a.v, a.x, c); }
      else r = ACT.verb(A.vault, 'vault', p, a.v, { a: a.a, x: a.x }, c);
    } catch (e) { oops('verb', e); r = 'state'; }
    if (r) return send(p, { actFail: FAILS.includes(r) ? r : 'state' });
    if (a.v === 'tap') send(p, { actFx: { r: a.r, k: progress(viewOf(m, a.r, now)) > before ? 'hit' : 'miss' } });
    const e = A.sent[a.r]; if (e) e.t = 0;   // let the next tick send the new state at once
  }

  // ---------------------------------------------------------------- hooks from server.js
  function hurt(m, t, attacker) {   // hitTarget (after the damage) and environment damage: break channels, spill / drop carries, eject the Oak Warden
    if (!m.act || !t || t.npc) return;
    const A = m.act, key = t.room, kd = kindOfKey(key), now = Date.now(); prep(t);
    try {
      if (kd === 'tree') { const tr = A.trees[key]; ACT.hurt(tr.st, tr.type, t, ctx(m, key, now)); }
      else if (kd === 'vb') VB5.hurt(A.H, key, t, ctx(m, key, now));
      else if (kd === 'vault') VAULT5.hurt(A.vault, t, ctx(m, key, now));
    } catch (e) { oops('hurt', e); }
  }
  function leaveRoom(m, p, key, now) {
    const A = m.act, kd = kindOfKey(key); if (!kd) return;
    try {
      if (kd === 'tree') { const t = A.trees[key]; ACT.leave(t.st, t.type, p, ctx(m, key, now)); }
      else if (kd === 'vb') VB5.leave(A.H, key, p, ctx(m, key, now));
      else VAULT5.leave(A.vault, p);
    } catch (e) { oops('leave', e); }
  }
  function room(m, p, prev) {   // noteRoom: the goblin changed rooms (walked, teleported, recalled)
    if (!m.act || p.npc || p.room === prev) return;
    const now = Date.now(); prep(p);
    if (prev != null) leaveRoom(m, p, prev, now);
    if (p.ws && kindOfKey(p.room)) { try { S.sendTo(p.ws, actSMsg(m, p.room, now, viewOf(m, p.room, now))); } catch (e) { oops('enter', e); } }
  }
  function death(m, p) {   // die(): death loses everything (claim, carry, blessing, channels); kill credit for the Thorn bowl and bounties
    if (!m.act || !p || p.npc) return;
    const A = m.act, now = Date.now(), key = p.room, kd = kindOfKey(key), killer = findP(m, p.killedBy); prep(p);
    try {
      if (kd === 'tree') { const t = A.trees[key], c = ctx(m, key, now); ACT.kill(t.st, t.type, killer, p, c); ACT.leave(t.st, t.type, p, c); }
      else if (kd === 'vb') { const c = ctx(m, key, now); VB5.died(A.H, key, p, killer, c); VB5.leave(A.H, key, p, c); }
      if (killer && killer !== p) VB5.killed(A.H, killer, p, ctx(m, killer.room, now));
      VAULT5.death(A.vault, p);
    } catch (e) { oops('death', e); }
    p.carry = null; p.bless = null; p._actMe = null;
  }
  function dc(m, p) { if (!m.act || p.npc) return; leaveRoom(m, p, p.room, Date.now()); }   // socket gone: stop his channels (the claim stays until the grace runs out and he dies)
  function welcome(m, ws, p) {   // resume: the activity state of his room, the crown, his own state
    if (!m.act) return; const now = Date.now(), A = m.act;
    S.sendTo(ws, { trees: m.trees });
    if (kindOfKey(p.room)) S.sendTo(ws, actSMsg(m, p.room, now, viewOf(m, p.room, now)));
    const cv = VAULT5.view(A.vault, { now }); if (!S.rule('crown')) S.sendTo(ws, { crown: cv.claims.length || cv.alarm ? cv : null });
    p._actMe = null;
  }

  // ---- votes and the round boundary
  function voteInfo(m) { return VB5.heistVotes(m.act.H, { sel: m.sel, picked: m.picked, bribes: m.bribes, bribeRule: S.rule('bribe'), vaultDoors: S.VAULT, now: Date.now() }); }
  function voteExtra(m) { if (!m.act) return 0; let n = 0; const ex = voteInfo(m).extra; for (const k in ex) n += ex[k]; return n; }   // Keystone armed, net writs, Cracked doors
  function doors(m, fresh, now) {   // the tally's door list, after the vote: Broken doors open anyway, barred doors stay shut, the crown alarm opens all four
    const A = m.act; if (!A || m.sudden) return fresh;
    const vst = A.vault, alarm = VAULT5.alarmOn(vst, now), broken = S.VAULT.filter(d => (A.H.breach[d] || 0) >= VB5.K.BROKEN);
    let out = fresh.slice(); for (const d of broken) if (!out.includes(d)) out.push(d);
    if (!alarm) for (const dir of Object.keys(vst.barPend)) { const d = DOOR_OF_DIR[dir]; if (vst.barPend[dir] && !broken.includes(d)) out = out.filter(x => x !== d); }
    A.alarmAdded = [];
    if (alarm) for (const d of S.VAULT) if (!out.includes(d)) { out.push(d); A.alarmAdded.push(d); }
    return out;
  }
  function round(m, now) {   // right after m.round++ (the tally already ran): treasury, bars reset, re-key, caps roll over, relic restock, blessings expire
    const A = m.act; if (!A || m.ended) return;
    try {
      const vc = ctx(m, VK, now); vc.round = m.round - 1; VAULT5.roundEnd(A.vault, vc);
      for (const q of [...A.npcs.values()]) if (q.npc === 'wisp') despawn(m, q);   // wisps belong to the stones that just went dark
      m.vb = VB5.roundBoundary(A.H, cell => ctx(m, cell, now)).vb;
      ACT.limit.newRound(A.L);
      const r = VAULT5.roundStart(A.vault, ctx(m, VK, now), m.round); if (r.restock) restockRelic(m);
      for (const q of m.players.values()) if (!q.npc && q.bless) { if (q.bless.until < m.round) q.bless = null; S.recalc(q); m.dirty = true; }
    } catch (e) { oops('round', e); }
  }
  function restockRelic(m) {
    const keys = Object.keys(G.ITEMS).filter(k => G.ITEMS[k].chance > 0 && G.ITEMS[k].tierN >= 3 && (G.ITEMS[k].type === 'weapon' || G.ITEMS[k].type === 'armor'));
    let r = Math.random() * keys.reduce((s, k) => s + G.ITEMS[k].chance, 0), key = keys[0]; for (const k of keys) { if ((r -= G.ITEMS[k].chance) < 0) { key = k; break; } }
    m.relicKey = key; m.relicTaken = null; S.bcast(m, { relic: key });
  }
  function roundFields(m) {   // merged into roundState: vb, vbNext (15 s before the end), breach {doorId}, armed [cell], writs {cell}, trees, hidden (held Hollow Oak), vent, crown
    const A = m.act; if (!A) return m.vb ? { vb: m.vb } : null;
    const now = Date.now(), f = VB5.roundFields(A.H, now, m.started ? m.endsAt - now : null), o = { vb: f.vb, vbNext: f.vbNext, breach: f.breach, armed: f.armed, writs: f.writs, trees: m.trees };
    const hid = hiddenRooms(m); if (hid.length) o.hidden = hid;
    if (m.sudden) o.vent = 1;
    const cv = VAULT5.view(A.vault, { now }); if ((cv.claims.length || cv.alarm) && !S.rule('crown')) o.crown = cv;   // the legacy GK_RULES crown rule owns the crown message when it is on
    return o;
  }
  // the time limit (after the last round): highest claim (at least 5 s), then kills, then HP, then the lowest id. live = [[ws, player]]
  function sortLive(m, live) {
    if (!m.act) return live;
    const d = VAULT5.decide(m.act.vault, live.map(([, q]) => ({ id: q.id, name: q.name, alive: true, hp: q.stats ? q.stats.health : 0, kills: q.kills || 0 })));
    const at = {}; d.ranking.forEach((x, i) => { at[x.id] = i; });
    live.sort((a, b) => at[a[1].id] - at[b[1].id]);
    m.decision = { winner: d.winner, name: d.name || null, reason: d.reason, claim: Math.floor((d.claim || 0) / 100) / 10, ranking: d.ranking.slice(0, 3).map(x => ({ id: x.id, name: x.name, claim: Math.floor(x.claim / 100) / 10, kills: x.kills, hp: x.hp })) };
    return live;
  }

  // ---- combat hooks
  function hitMul(m, p, t, dmg, wname, opts) {   // the attacker's Fury blessing and the Hollow Oak ambush (+50%); weapon hits only (not bombs, traps, bleeds)
    if (!m.act || !p || p.npc || !t || wname !== undefined || (opts && opts.bleed)) return dmg;
    let mul = 1; const b = TREES5.blessing(p, m.round); if (b && b.k === 'fury') mul *= 1 + b.v;
    const tr = m.act.trees[p.room];
    if (tr && tr.type === 'oak' && !t.npc) { try { mul *= ACT.get('oak').ambushMul(tr.st, p, t, ctx(m, p.room, Date.now())); } catch (e) { oops('ambush', e); } }
    return mul === 1 ? dmg : Math.round(dmg * mul);
  }
  function reflect(m, t, dmg) { if (!m || !m.act || !t || t.npc) return 0; const b = TREES5.blessing(t, m.round); return b && b.k === 'thorns' ? Math.round(dmg * b.v) : 0; }   // the Thorns blessing: melee reflect
  function blessStats(p) {   // recalc: Fury raises attack, Bark raises max HP, while the blessing lasts
    const b = TREES5.blessing(p, p.match ? p.match.round : 0); if (!b || !p.stats) return;
    if (b.k === 'bark') { p.stats.maxHealth = Math.round(p.stats.maxHealth * (1 + b.v)); }
    if (b.k === 'fury') p.stats.attack = Math.round(p.stats.attack * (1 + b.v));
    p.stats.health = Math.min(p.stats.health, p.stats.maxHealth);
  }
  function crownSeal(m, p) {   // the Crown Seal item (Locksmith, sudden death): +5 s of claim, on the dais only
    if (!m.act || p.room !== VK) return false; prep(p);
    return VAULT5.sealClaim(m.act.vault, p, ctx(m, VK, Date.now()));
  }
  const bribe = (m, amount) => { if (m.act && amount > 0) VB5.onBribe(m.act.H, amount, Date.now()); };   // half of every panel bribe goes into the strongbox

  // ---- GK_DEBUG test hooks: {actDbg: {tree:[cell, type], vb:[t7, t11, t13, t17], claim: ms, breach:[doorId, v], npcs: bool, elixir: n, metal: n}} (any subset)
  function debug(m, p, d) {
    const A = m.act; if (!A || !d || typeof d !== 'object') return;
    const now = Date.now();
    if (Array.isArray(d.tree) && TREE_CELLS.includes(String(d.tree[0])) && TREES5.TYPES.includes(d.tree[1])) setTree(m, String(d.tree[0]), d.tree[1], now);
    if (Array.isArray(d.vb) && d.vb.length === 4 && VB5.TYPES.every(t => d.vb.includes(t))) { A.H.order = d.vb.slice(); A.H.nextOrder = VB5.derange(A.H.order, A.rng); m.vb = VB5.layoutView(A.H, null).vb; S.broadcastRound(m); }
    if (Number.isFinite(d.claim)) A.vault.cap.acc[p.id] = Math.max(0, d.claim);
    if (Array.isArray(d.breach) && A.H.breach[d.breach[0]] != null && Number.isFinite(d.breach[1])) { A.H.breach[d.breach[0]] = Math.max(0, Math.min(100, d.breach[1])); S.broadcastRound(m); }
    if (typeof d.npcs === 'boolean') A.noSpawn = !d.npcs;   // {npcs:false}: no activity NPCs in this match (deterministic tests)
    if (Number.isFinite(d.elixir)) p.elixir = Math.max(0, d.elixir);
    if (Number.isFinite(d.metal)) { p.parts.metal = Math.max(0, d.metal | 0); S.sendParts(p); }
    S.sendTo(p.ws, { actDbg: { trees: m.trees, vb: m.vb } });
  }

  return { init, tick, act, hurt, room, death, dc, welcome, npcThink, npcDied, voteExtra, voteInfo, doors, round, roundFields, sortLive, hitMul, reflect, blessStats, crownSeal, bribe, debug, ANCHORS, kindOfKey };
};
module.exports.ANCHORS = ANCHORS;
module.exports.VB_DOOR = VB_DOOR;
module.exports.DOOR_OF_DIR = DOOR_OF_DIR;
module.exports.VB_ROT = VB_ROT;

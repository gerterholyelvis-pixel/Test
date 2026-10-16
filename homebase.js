// Home base upgrades, security, sendables and raid rules (PLAN-5x5 1.8). Pure and dependency-free: UMD, no clock, no RNG (both injected).
// A home is a plain object from createHome(); buy() spends from a plain {elixir} holder, like elixir.js.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKHOMEBASE = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  // ---- the upgrade tree. levels[i].cost is the price of level i+1; buying needs level i already owned (level order is the only prerequisite).
  const UPGRADES = {
    pump:     { tab: 'BASE',     name: 'Pump',            levels: [{ cost: 20, fx: '1 per 4 s, tank 64' }, { cost: 45, fx: '1 per 3 s, tank 90' }] },
    bench:    { tab: 'BASE',     name: 'Workbench',       levels: [{ cost: 40, fx: 'tier 3 recipes, 1.5 s crafts' }] },
    recycler: { tab: 'BASE',     name: 'Recycler',        levels: [{ cost: 25, fx: '75% yield' }, { cost: 50, fx: '100% yield' }] },
    lockbox:  { tab: 'BASE',     name: 'Lockbox',         levels: [{ cost: 20, fx: '3 slots' }, { cost: 35, fx: '6 slots' }] },
    pad:      { tab: 'BASE',     name: 'Healing Pad',     levels: [{ cost: 30, fx: '2 HP/s after 2 s unhurt' }] },
    lock:     { tab: 'SECURITY', name: 'Door Lock',       levels: [{ cost: 25, fx: 'pick 2 s' }, { cost: 50, fx: 'pick 5 s, crack 14 s' }] },
    alarm:    { tab: 'SECURITY', name: 'Alarm',           levels: [{ cost: 10, fx: 'toast and ping on intruders' }] },
    snare:    { tab: 'SECURITY', name: 'Snare',           levels: [{ cost: 15, fx: 'root 2 s, 10 damage, one-shot' }] },
    sentry:   { tab: 'SECURITY', name: 'Sentry Crossbow', levels: [{ cost: 60, fx: '8 damage / 1.5 s, 20 shots, owner away' }] },
    guard:    { tab: 'SECURITY', name: 'Pump Guard',      levels: [{ cost: 15, fx: 'immune to Pump Leech' }] },
  };
  const ORDER = Object.keys(UPGRADES);
  const ACTIONS = { distill: { tab: 'BASE', cost: 20 }, snareRearm: { cost: 15 }, sentryAmmo: { cost: 10, shots: 20 } };   // repeatable purchases outside the tree
  const SENTRY = { shots: 20, damage: 8, everyMs: 1500 };
  const SNARE = { rootMs: 2000, damage: 10 };
  const PAD = { hps: 2, calmMs: 2000 };
  const PICK_MS = [0, 2000, 5000];            // by lock level
  const CRACK_MS = [8000, 8000, 14000];       // by lock level (L1 does not slow the box)
  const CRACK_RANGE = 1.5, SCREEN_RANGE = 3, MSG_RATE = 4;
  const BENCH_BASE = { maxTier: 2, craftMs: 2500 }, BENCH_II = { maxTier: 3, craftMs: 1500 };
  const RECYCLER_EFF = [0.5, 0.75, 1.0];
  const LOCKBOX_SLOTS = [0, 3, 6];
  const PUMP_LV = [1, 2, 3];

  const treeCost = () => ORDER.reduce((s, id) => s + UPGRADES[id].levels.reduce((a, l) => a + l.cost, 0), 0);
  const createHome = (owner) => ({ owner, lv: {}, box: [], snareArmed: false, ammo: 0, lastShot: -1e9, dead: false, picks: {}, passed: {}, crack: null, lastMsg: [] });
  const level = (home, id) => (home.lv && home.lv[id]) || 0;
  const nextCost = (home, id) => { const u = UPGRADES[id]; if (!u) return null; const l = level(home, id); return l >= u.levels.length ? null : u.levels[l].cost; };

  // Buy the next level of `id`. h = {elixir}. Returns {ok, reason?, cost, lv}. Reasons: unknown, dead, max, elixir.
  function buy(home, id, h) {
    const u = UPGRADES[id]; if (!u) return { ok: false, reason: 'unknown' };
    if (home.dead) return { ok: false, reason: 'dead' };
    const cost = nextCost(home, id); if (cost == null) return { ok: false, reason: 'max' };
    if (h.elixir < cost) return { ok: false, reason: 'elixir' };
    h.elixir -= cost; home.lv[id] = level(home, id) + 1;
    if (id === 'snare') home.snareArmed = true;
    if (id === 'sentry') home.ammo = SENTRY.shots;
    return { ok: true, cost, lv: home.lv[id] };
  }
  function rearmSnare(home, h) {
    if (home.dead || !level(home, 'snare') || home.snareArmed) return { ok: false, reason: 'n/a' };
    if (h.elixir < ACTIONS.snareRearm.cost) return { ok: false, reason: 'elixir' };
    h.elixir -= ACTIONS.snareRearm.cost; home.snareArmed = true; return { ok: true, cost: ACTIONS.snareRearm.cost };
  }
  function buyAmmo(home, h) {
    if (home.dead || !level(home, 'sentry')) return { ok: false, reason: 'n/a' };
    if (h.elixir < ACTIONS.sentryAmmo.cost) return { ok: false, reason: 'elixir' };
    h.elixir -= ACTIONS.sentryAmmo.cost; home.ammo += ACTIONS.sentryAmmo.shots; return { ok: true, cost: ACTIONS.sentryAmmo.cost, ammo: home.ammo };
  }

  // ---- derived stats
  const pumpLevel = home => PUMP_LV[level(home, 'pump')];
  const benchParams = home => level(home, 'bench') ? BENCH_II : BENCH_BASE;
  const recyclerEff = home => RECYCLER_EFF[level(home, 'recycler')];
  const lockboxSlots = home => LOCKBOX_SLOTS[level(home, 'lockbox')];
  const lockLevel = home => home.dead ? 0 : level(home, 'lock');
  const hasPad = home => !home.dead && level(home, 'pad') > 0;
  const hasGuard = home => !home.dead && level(home, 'guard') > 0;
  const isOwner = (home, pid) => home.owner === pid;
  // Owner-only rule: bench, recycler and screen. A dead home is neutral, so everyone may use it (its upgrades are gone anyway).
  const canUseStation = (home, pid) => home.dead || isOwner(home, pid);
  // Server gate for screen messages: alive, entered, own home, within 3 m, rate limit 4/s (lastMsg is a ring of recent times).
  function canUseScreen(home, s, now) {
    if (!s || !s.alive || !s.entered) return { ok: false, reason: 'state' };
    if (home.dead || !isOwner(home, s.id)) return { ok: false, reason: 'Not your screen' };
    if (s.roomKey !== s.homeKey || s.dist > SCREEN_RANGE) return { ok: false, reason: 'range' };
    const recent = home.lastMsg.filter(t => now - t < 1000);
    if (recent.length >= MSG_RATE) { home.lastMsg = recent; return { ok: false, reason: 'rate' }; }
    recent.push(now); home.lastMsg = recent; return { ok: true };
  }
  // Healing Pad: 2 HP/s after standing 2 s unhurt; off in sudden death (homes vent).
  function padHps(home, calmMs, suddenDeath) { return hasPad(home) && !suddenDeath && calmMs >= PAD.calmMs ? PAD.hps : 0; }

  // ---- door lock: a non-owner stands at the hatch (pick bar). rules = {suddenDeath, showdown}. Never blocks the owner; off in sudden death and showdown.
  const lockActive = (home, rules) => lockLevel(home) > 0 && !(rules && (rules.suddenDeath || rules.showdown));
  function startPick(home, pid, now) { if (home.picks[pid] == null) home.picks[pid] = now; }
  function cancelPick(home, pid) { delete home.picks[pid]; }     // leaving the hatch resets the bar
  function pickProgress(home, pid, now) { const ms = PICK_MS[lockLevel(home)]; if (!ms) return 1; return home.picks[pid] == null ? 0 : Math.min(1, (now - home.picks[pid]) / ms); }
  // hatchOk(m, p, id) of the plan: true for the owner, with no lock, or after the pick finished (that grant sticks for this player).
  function hatchOk(home, pid, now, rules) {
    if (!home || isOwner(home, pid) || !lockActive(home, rules) || home.passed[pid]) return true;
    if (pickProgress(home, pid, now) >= 1) { home.passed[pid] = true; return true; }
    return false;
  }

  // ---- entering: alarm toast + ping, snare one-shot. Returns the events the server must act on.
  function onEnter(home, pid, name, now) {
    const ev = [];
    if (home.dead || isOwner(home, pid)) return ev;
    if (level(home, 'alarm')) ev.push({ type: 'alarm', to: home.owner, text: 'Intruder: ' + name, from: pid });
    if (home.snareArmed) { home.snareArmed = false; ev.push({ type: 'snare', target: pid, rootMs: SNARE.rootMs, damage: SNARE.damage }); }
    return ev;
  }
  // Sentry: fires at non-owners only while the owner is NOT home; needs ammo, line of sight, 1.5 s spacing.
  function sentryShot(home, ownerHome, los, now) {
    if (home.dead || !level(home, 'sentry') || ownerHome || !los || home.ammo <= 0 || now - home.lastShot < SENTRY.everyMs) return null;
    home.ammo--; home.lastShot = now; return { damage: SENTRY.damage, ammo: home.ammo };
  }

  // ---- lockbox and raids
  function boxPut(home, item) { if (home.dead || home.box.length >= lockboxSlots(home)) return false; home.box.push(item); return true; }
  function boxTake(home, slot) { if (home.dead || slot < 0 || slot >= home.box.length) return null; return home.box.splice(slot, 1)[0]; }
  const crackMs = home => CRACK_MS[lockLevel(home)];
  // A raider cracks a foreign box: within 1.5 m, 8 s channel (14 s with Lock L2); the owner is told at the start.
  function startCrack(home, s, now) {
    if (!s || !s.alive || !s.entered || isOwner(home, s.id) || home.dead || !home.box.length) return { ok: false, reason: 'n/a' };
    if (s.roomKey !== s.homeKey || s.dist > CRACK_RANGE) return { ok: false, reason: 'range' };
    if (home.crack && home.crack.by !== s.id && now < home.crack.doneAt) return { ok: false, reason: 'busy' };
    home.crack = { by: s.id, since: now, doneAt: now + crackMs(home) };
    return { ok: true, doneAt: home.crack.doneAt, notifyOwner: home.owner };
  }
  const cancelCrack = home => { home.crack = null; };
  // When the channel finishes the whole box is taken.
  function finishCrack(home, pid, now) { const c = home.crack; if (!c || c.by !== pid || now < c.doneAt) return null; home.crack = null; const items = home.box; home.box = []; return items; }
  // The owner dies: the home dies with him. Upgrades go, the lock opens, the sentry is silent, the box spills as a loot pile. The tank (elixir.js) stays.
  function dieHome(home) { const spill = home.box; home.box = []; home.lv = {}; home.snareArmed = false; home.ammo = 0; home.picks = {}; home.passed = {}; home.crack = null; home.dead = true; return spill; }

  // ---- sendables
  const TELEGRAPH_MS = 3000, MAX_ACTIVE_PER_ROOM = 2, FIRST_SEND_ROUND = 2;
  const SENDS = {
    bell:   { name: 'Alarm Bell',   cost: 6,  ms: 20000, target: 'room', counter: 'leave the room', fx: 'occupants show on everyone\'s minimap' },
    gas:    { name: 'Stink Gas',    cost: 14, ms: 20000, target: 'room', counter: 'leave', fx: 'fog, 1 damage every 2 s', dmg: 1, dmgEveryMs: 2000 },
    rats:   { name: 'Rat Swarm',    cost: 18, ms: 30000, target: 'room', counter: 'kill them or leave', fx: '5 rats: 5 HP, 2 damage, slow', rats: 5, ratHp: 5, ratDmg: 2 },
    jam:    { name: 'Jammed Panel', cost: 12, ms: 'round', target: 'room', counter: 'none (the door guard still gives an exit)', fx: 'the room\'s pick is frozen' },
    spike:  { name: 'Spike Trap',   cost: 15, ms: 'round', target: 'room', counter: 'luck, or the faint plate', fx: 'hidden plate, 15 damage, slow 2 s', dmg: 15, slowMs: 2000 },
    leech:  { name: 'Pump Leech',   cost: 20, ms: 10000, target: 'home', counter: 'Pump Guard, or go home', fx: '50% of a tank flows to you' },
  };
  const SEND_IDS = Object.keys(SENDS);
  // ctx: {sender, senderRoom (key of sender's own home), round, elixir, now, vaultKey, target {room, kind:'arena'|'home', owner?}, sentRound (map pid -> last round sent), active [{room, endsAt}], bell? }
  function checkSend(id, ctx) {
    const d = SENDS[id]; if (!d) return { ok: false, reason: 'unknown' };
    if (ctx.round < FIRST_SEND_ROUND) return { ok: false, reason: 'round1' };
    if (ctx.sentRound && ctx.sentRound[ctx.sender] === ctx.round) return { ok: false, reason: 'limit' };
    const t = ctx.target || {};
    if (!t.room) return { ok: false, reason: 'target' };
    if (t.room === ctx.vaultKey) return { ok: false, reason: 'vault' };
    if (t.room === ctx.senderRoom || t.owner === ctx.sender) return { ok: false, reason: 'own' };
    if (d.target === 'home' && t.kind !== 'home') return { ok: false, reason: 'target' };
    if (t.kind === 'home' && t.dead) return { ok: false, reason: 'target' };
    const live = (ctx.active || []).filter(a => a.room === t.room && a.endsAt > ctx.now).length;
    if (live >= MAX_ACTIVE_PER_ROOM) return { ok: false, reason: 'full' };           // refused: nothing is charged
    if (ctx.elixir < d.cost) return { ok: false, reason: 'elixir' };
    return { ok: true, cost: d.cost };
  }
  // Create the live send. Telegraph first (3 s warning in the target room), then it runs for ms (or until roundEndsAt).
  function makeSend(id, ctx, rng) {
    const d = SENDS[id], startsAt = ctx.now + TELEGRAPH_MS, endsAt = d.ms === 'round' ? ctx.roundEndsAt : startsAt + d.ms;
    const s = { kind: id, from: ctx.sender, room: ctx.target.room, warnAt: ctx.now, startsAt, endsAt, tellSender: true };   // sender is named only to the occupants of the target room, never global
    if (id === 'spike' && ctx.spots && ctx.spots.length) s.spot = pickSpot(ctx.spots, rng);
    return s;
  }
  const pickSpot = (spots, rng) => spots[Math.min(spots.length - 1, Math.floor(rng() * spots.length))];
  const sendPhase = (s, now) => now < s.warnAt ? 'pending' : now < s.startsAt ? 'warning' : now < s.endsAt ? 'active' : 'over';
  // Gas damage ticks that fall in (from, to] while active; the first tick lands one interval after start.
  function gasTicks(s, from, to) { const d = SENDS.gas; let n = 0; const a = Math.max(from, s.startsAt), b = Math.min(to, s.endsAt); if (b <= a) return 0; n = Math.floor((b - s.startsAt) / d.dmgEveryMs) - Math.floor((a - s.startsAt) / d.dmgEveryMs); return Math.max(0, n); }
  const bellRevealed = (s, now, roomKey) => s.kind === 'bell' && s.room === roomKey && sendPhase(s, now) === 'active';
  const panelFrozen = (sends, roomKey, now) => sends.some(s => s.kind === 'jam' && s.room === roomKey && sendPhase(s, now) === 'active');
  // Counters: leaving ends gas/bell exposure for that goblin; rats die to normal attacks; the guard blocks leech (elixir.leechPlan).
  const counteredByLeaving = id => id === 'bell' || id === 'gas' || id === 'rats';

  // ---- balance helpers
  const baseIncomeMatch = (rounds, roundMs) => Math.floor(rounds * roundMs / 5000);

  return { UPGRADES, ORDER, ACTIONS, SENTRY, SNARE, PAD, PICK_MS, CRACK_MS, CRACK_RANGE, SCREEN_RANGE, MSG_RATE, SENDS, SEND_IDS, TELEGRAPH_MS, MAX_ACTIVE_PER_ROOM, FIRST_SEND_ROUND,
    treeCost, createHome, level, nextCost, buy, rearmSnare, buyAmmo, pumpLevel, benchParams, recyclerEff, lockboxSlots, lockLevel, hasPad, hasGuard, isOwner, canUseStation, canUseScreen,
    padHps, lockActive, startPick, cancelPick, pickProgress, hatchOk, onEnter, sentryShot, boxPut, boxTake, crackMs, startCrack, cancelCrack, finishCrack, dieHome,
    checkSend, makeSend, sendPhase, gasTicks, bellRevealed, panelFrozen, counteredByLeaving, baseIncomeMatch };
});

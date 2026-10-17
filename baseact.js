// Base activities (docs/reports/base-activities.md): small jobs to do at home while the pump fills. Pure and dependency-free: UMD, no clock, no RNG
// (the caller passes `now` and a seed). Shared by server.js (BASEACT block) and baseactui.js (the client overlay), so both sides build the same cue
// list from the same seed and the server can re-score what the client played.
//   job   : a short timed game at one prop of the home (crank wheel, anvil, scrap bin, training dummy)
//   goals : three round goals on the board; all done = one claim (gold + a trophy on the shelf)
//   look  : the lookout window (info only)
// Every reward is capped per round (CAPS) and per match (knowledge), so doing more than the caps pays nothing.
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.GKBASEACT = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  const CFG = { REACH: 2.4, PROMPT_REACH: 2.0, SLACK_MS: 280, EARLY_MS: 250, LOOK_CD: 8000, CLAIM_GOLD: 6, TROPHY_MAX: 7, MSG_KEYS: 'xLRUD' };
  // per-round caps on what jobs pay out; knowledge also has a per-match cap
  const CAPS = { elx: 6, parts: 4, gold: 6, kn: 1, knMatch: 3 };
  // type 'rhythm': a mark must be hit within `good` ms of its time (perfect inside `perfect`), keys say which key. type 'sort': the item shows at t and is sorted left/right before t + gap.
  const JOBS = {
    crank: { name: 'Crank the pump', short: 'Crank', anchor: 'crank', type: 'rhythm', keys: 'x', n: 6, gap: 850, jit: 0.18, lead: 1300, good: 170, perfect: 80, cd: 15000, rew: 'elx', col: '#39f2c4',
      hint: 'Hit SPACE when a mark reaches the ring', pay: 'bonus elixir in your tank' },
    tune: { name: 'Bench tune-up', short: 'Tune-up', anchor: 'anvil', type: 'rhythm', keys: 'x', n: 5, gap: 760, jit: 0.22, lead: 1300, good: 170, perfect: 80, cd: 12000, rew: 'metal', col: '#ffb060',
      hint: 'Hit SPACE as each strike lands', pay: 'metal parts' },
    sort: { name: 'Sort the scrap', short: 'Sort scrap', anchor: 'bin', type: 'sort', keys: 'LR', n: 8, gap: 1150, jit: 0, lead: 1200, good: 0, perfect: 0, cd: 14000, rew: 'leather', col: '#c9a56a',
      hint: 'A or LEFT for timber, D or RIGHT for metal', pay: 'leather parts' },
    dummy: { name: 'Combo drill', short: 'Combo drill', anchor: 'dummy', type: 'rhythm', keys: 'UDLR', n: 10, gap: 700, jit: 0.1, lead: 1400, good: 210, perfect: 95, cd: 15000, rew: 'gold', col: '#ff8a78',
      hint: 'Press the arrow (or WASD) when it reaches the ring', pay: 'gold, and a knowledge point for a clean run' },
  };
  const JOB_IDS = Object.keys(JOBS);
  const ANCHORS = ['crank', 'anvil', 'bin', 'dummy', 'board', 'window'];   // HOME_LAYOUT keys (world.js); the shelf is decoration only
  const TIMBER = ['Plank', 'Splinter', 'Barrel stave', 'Handle', 'Peg', 'Slat'], METAL = ['Gear', 'Nail', 'Hinge', 'Spring', 'Rivet', 'Chain link'];

  // ---- seeded rng (mulberry32)
  const rng = seed => { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

  // The cue list of a job: [{t, k, it?}] with t in ms after the start. Same seed, same list, on both sides.
  function cues(id, seed) {
    const j = JOBS[id]; if (!j) return [];
    const r = rng(seed), out = []; let t = j.lead, last = null;
    for (let i = 0; i < j.n; i++) {
      let k = j.keys[Math.floor(r() * j.keys.length)];
      if (j.keys.length > 1 && j.type === 'rhythm' && k === last && r() < 0.5) k = j.keys[Math.floor(r() * j.keys.length)];
      last = k;
      const c = { t: Math.round(t), k };
      if (j.type === 'sort') c.it = k === 'L' ? Math.floor(r() * TIMBER.length) : Math.floor(r() * METAL.length);   // item name index (TIMBER for L, METAL for R)
      out.push(c);
      t += j.gap * (1 + (r() * 2 - 1) * j.jit);
    }
    return out;
  }
  const itemName = c => (c.k === 'L' ? TIMBER : METAL)[c.it | 0] || '?';
  // how long the session runs: the last cue plus its window
  function dur(id, seed) { const j = JOBS[id], c = cues(id, seed); if (!c.length) return 0; return Math.round(c[c.length - 1].t + (j.type === 'sort' ? j.gap : j.good + 450)); }
  const maxScore = id => (JOBS[id] ? JOBS[id].n * 2 : 0);

  // Score the inputs [[t, k], ...] (t in ms after the start) against the cues. Each input counts once; returns {score, max, hit: [0|1|2 per cue]}.
  function score(id, list, inputs) {
    const j = JOBS[id], hit = [], used = new Set(); let total = 0;
    if (!j) return { score: 0, max: 0, hit };
    for (const c of list) {
      let got = 0, at = -1;
      for (let i = 0; i < inputs.length; i++) {
        if (used.has(i)) continue;
        const [t, k] = inputs[i]; if (k !== c.k) continue;
        if (j.type === 'sort') { if (t < c.t - 20 || t > c.t + j.gap) continue; got = t - c.t <= j.gap * 0.45 ? 2 : 1; }
        else { const d = Math.abs(t - c.t); if (d > j.good) continue; got = d <= j.perfect ? 2 : 1; }
        at = i; break;
      }
      if (at >= 0) used.add(at);
      hit.push(got); total += got;
    }
    return { score: total, max: maxScore(id), hit };
  }
  // The wire format is a flat list of integers, t * 8 + index of the key in MSG_KEYS (the socket frame limit is 512 bytes, so [[t,k]..] pairs would not fit).
  const encode = inputs => inputs.map(([t, k]) => Math.round(t) * 8 + Math.max(0, CFG.MSG_KEYS.indexOf(k)));
  // keys the client can send: 'x' (strike), 'L' 'R' 'U' 'D'. Anything else is dropped. Returns [[t, k]..] sorted by time.
  function cleanInputs(raw, id, seed, elapsed) {
    const j = JOBS[id], out = []; if (!j || !Array.isArray(raw)) return out;
    const max = j.n * 3 + 4;
    for (const e of raw) {
      if (out.length >= max) break;
      if (!Number.isInteger(e) || e < 0) continue;
      const t = Math.floor(e / 8), k = CFG.MSG_KEYS[e % 8];
      if (k === undefined || t > elapsed + CFG.SLACK_MS) continue;
      out.push([t, k]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }

  // ---- per-round state of one home: h.ba (a plain object, made lazily and reset when the round changes)
  const newBa = () => ({ r: 0, cd: {}, got: { elx: 0, parts: 0, gold: 0, kn: 0 }, knMatch: 0, pump: 0, jobs: 0, best: 0, scout: 0, sort: 0, drill: 0, claimed: false, trophies: 0, lookAt: -1e9 });
  function roll(ba, round) {   // new round: zero the round counters, keep trophies, the match knowledge count and cooldowns
    if (ba.r === round) return ba;
    ba.r = round; ba.got = { elx: 0, parts: 0, gold: 0, kn: 0 }; ba.pump = ba.jobs = ba.best = ba.scout = ba.sort = ba.drill = 0; ba.claimed = false;
    return ba;
  }
  // Goals: three per round from a rotating list, all reachable inside the home (round 1 is home-only).
  const GOALS = [
    { id: 'pump', text: 'Collect 8 elixir from the pump', key: 'pump', need: 8 },
    { id: 'jobs', text: 'Finish 2 base jobs', key: 'jobs', need: 2 },
    { id: 'good', text: 'Score 70% or more on a job', key: 'best', need: 70 },
    { id: 'scout', text: 'Look out of the window', key: 'scout', need: 1 },
    { id: 'sort', text: 'Sort the scrap', key: 'sort', need: 1 },
    { id: 'drill', text: 'Run the combo drill', key: 'drill', need: 1 },
  ];
  const goalsOf = round => { const s = ((Math.max(1, round | 0) - 1) * 2) % GOALS.length; return [0, 1, 2].map(i => GOALS[(s + i) % GOALS.length]); };
  const goalView = (ba, round) => goalsOf(round).map(g => ({ id: g.id, text: g.text, need: g.need, have: Math.min(g.need, ba[g.key] | 0), done: (ba[g.key] | 0) >= g.need }));
  const goalsDone = (ba, round) => goalView(ba, round).every(g => g.done);
  function note(ba, what, n) {   // counters the server bumps: pump (elixir moved), jobs, best (percent), scout, sort, drill
    if (what === 'best') ba.best = Math.max(ba.best | 0, n | 0); else ba[what] = (ba[what] | 0) + (n == null ? 1 : n);
  }

  // ---- rewards
  const tier = (ratio, a, b, c, d) => ratio >= 0.85 ? a : ratio >= 0.65 ? b : ratio >= 0.45 ? c : ratio >= 0.25 ? d : 0;
  // What is left of the cap this job pays into (0 = the job would pay nothing more this round).
  function capLeft(id, ba) {
    const j = JOBS[id]; if (!j) return 0; const g = ba.got;
    if (j.rew === 'elx') return Math.max(0, CAPS.elx - g.elx);
    if (j.rew === 'gold') return Math.max(0, CAPS.gold - g.gold) + (g.kn < CAPS.kn && ba.knMatch < CAPS.knMatch ? 1 : 0);
    return Math.max(0, CAPS.parts - g.parts);
  }
  // reward(id, score, ba) -> {elx, parts: {kind: n}, gold, kn}, already clipped by the caps; does not change ba (see apply)
  function reward(id, sc, ba) {
    const j = JOBS[id], out = { elx: 0, parts: {}, gold: 0, kn: 0 }; if (!j) return out;
    const ratio = sc / maxScore(id), g = ba.got;
    if (j.rew === 'elx') out.elx = Math.min(tier(ratio, 4, 3, 2, 1), Math.max(0, CAPS.elx - g.elx));
    else if (j.rew === 'metal' || j.rew === 'leather') { const n = Math.min(ratio >= 0.85 ? 2 : ratio >= 0.5 ? 1 : 0, Math.max(0, CAPS.parts - g.parts)); if (n) out.parts[j.rew] = n; }
    else if (j.rew === 'gold') {
      out.gold = Math.min(ratio >= 0.85 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.3 ? 1 : 0, Math.max(0, CAPS.gold - g.gold));
      if (ratio >= 0.85 && g.kn < CAPS.kn && ba.knMatch < CAPS.knMatch) out.kn = 1;
    }
    return out;
  }
  function apply(ba, id, rw) {   // book a reward into the caps
    ba.got.elx += rw.elx; ba.got.gold += rw.gold; ba.got.kn += rw.kn; ba.knMatch += rw.kn;
    for (const k in rw.parts) ba.got.parts += rw.parts[k];
  }
  const rewardText = rw => { const o = []; if (rw.elx) o.push('+' + rw.elx + ' elixir in the tank'); for (const k in rw.parts) o.push('+' + rw.parts[k] + ' ' + k); if (rw.gold) o.push('+' + rw.gold + ' gold'); if (rw.kn) o.push('+' + rw.kn + ' knowledge'); return o.join(', ') || 'nothing this time'; };
  const cooldownLeft = (ba, id, now) => Math.max(0, ((ba.cd && ba.cd[id]) || 0) - now);

  // The pieces of home layout the client needs: prop anchors in the home's local frame come from world.js HOME_LAYOUT (crank, anvil, bin, dummy, board, window).
  const near = (d, extra) => d <= (extra == null ? CFG.REACH : extra);

  return { CFG, CAPS, JOBS, JOB_IDS, ANCHORS, GOALS, TIMBER, METAL, rng, cues, itemName, dur, maxScore, score, cleanInputs, encode, newBa, roll, goalsOf, goalView, goalsDone, note,
    capLeft, reward, apply, rewardText, cooldownLeft, near };
});

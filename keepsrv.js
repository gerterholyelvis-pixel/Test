// KEEP (server side): signed stashes, the winner's "choose what to keep" offer, bring-in loadouts and POST /keep. Rules: keep.js. Report: docs/reports/keep-on-win.md.
// Trust model
// - Every stash change is decided here and handed out as a signed token (HMAC with GK_SECRET, the same key as the character token, under its own 'keep|' domain).
// - The server also keeps the latest stash per character in a store (memory + .gk-keep.json, or GK_KEEP_FILE). While the store has a character, the store
//   is the truth and a token only proves who you are: an old token can never bring back items that were spent (anti-dup), and a lost message heals itself.
//   When the store is gone (a fresh disk), the newest token the player holds is the truth again.
// - A character can be in one queue or match at a time when it brings a stash (lock), and every change bumps a serial: an offer or stash token from before a change is stale.
module.exports = function keepServer(D) {
  const { G, sign, b64u, DBG, sendTo, recalc, isHum, statBlock, matches, originOk, ipOf, fs, path } = D;
  const KEEP = require('./keep.js'), K = KEEP.K;
  const envMs = (k, d) => DBG && /^\d+$/.test(process.env[k] || '') ? +process.env[k] : d;
  const MIN_PLAY_MS = envMs('GK_KEEP_PLAY_MS', DBG ? 0 : 60000);   // a win less than a minute after GO keeps nothing but the victory
  const MIN_GAP_MS = envMs('GK_KEEP_GAP_MS', DBG ? 0 : 90000);     // one offer per character per 90 s (win farming, scripted queues)
  const FILE = process.env.GK_KEEP_FILE || (DBG ? '' : path.join(__dirname, '.gk-keep.json'));
  const STORE_MAX = 50000;
  const NOIDLE = DBG && process.env.GK_KEEP_NOIDLE === '1';   // tests: a {win:1} debug win counts as a real one

  // ---- tokens
  const kSign = o => { const body = b64u(JSON.stringify(o)); return body + '.' + sign('keep|' + body); };
  function kRead(t, kind) {   // the payload of a valid token of this kind ('S' stash, 'O' offer), else null
    if (typeof t !== 'string' || t.length > 3000) return null;
    const i = t.indexOf('.'); if (i < 1) return null;
    const body = t.slice(0, i), sig = Buffer.from(t.slice(i + 1)), want = Buffer.from(sign('keep|' + body));
    if (sig.length !== want.length || !require('crypto').timingSafeEqual(sig, want)) return null;
    let o; try { o = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch (e) { return null; }
    if (!o || o.k !== kind || o.v !== K.V || typeof o.c !== 'string' || !o.c || o.c.length > 32 || !Number.isInteger(o.s) || o.s < 0) return null;
    return o;
  }

  // ---- the store: charId -> { s serial, i stash keys, b bank gold, t last change }
  const KS = new Map();
  if (FILE) try {
    const o = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (o && o.v === 1 && Array.isArray(o.r)) for (const r of o.r) if (Array.isArray(r) && typeof r[0] === 'string' && Number.isInteger(r[1])) KS.set(r[0], { s: r[1], i: KEEP.normStash(r[2], G), b: KEEP.normBank(r[3]), t: +r[4] || 0 });
  } catch (e) { /* no store yet */ }
  let dirty = false;
  function save() {
    if (!dirty || !FILE) return; dirty = false;
    try { fs.writeFileSync(FILE + '.tmp', JSON.stringify({ v: 1, r: [...KS].map(([c, x]) => [c, x.s, x.i, x.b, x.t]) })); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { /* read-only disk: memory only */ }
  }
  if (FILE) { setInterval(save, 5000).unref(); process.on('exit', save); }
  // The current stash of a character: the store when it knows him, else the token he showed (if it is his), else empty.
  function get(c, tok) {
    const r = KS.get(c); if (r) return r;
    if (tok && tok.c === c) return { s: tok.s, i: KEEP.normStash(tok.i, G), b: KEEP.normBank(tok.b), t: 0 };
    return { s: 0, i: [], b: 0, t: 0 };
  }
  function put(c, prev, i, b) {   // a new version of the stash -> its token
    const r = { s: prev.s + 1, i: KEEP.normStash(i, G), b: KEEP.normBank(b), t: Date.now() };
    KS.set(c, r); dirty = true;
    if (KS.size > STORE_MAX) { const old = [...KS].sort((a, z) => a[1].t - z[1].t).slice(0, KS.size - STORE_MAX); for (const [k] of old) KS.delete(k); }
    return tokFor(c, r);
  }
  const tokFor = (c, r) => kSign({ k: 'S', v: K.V, c, s: r.s, i: r.i, b: r.b });
  const view = (c, r) => ({ tok: tokFor(c, r), i: r.i, b: r.b });   // what the client stores

  // ---- one active instance per character that brings a stash
  const LOCK = new Map();   // charId -> player
  const active = q => !!q && !q.dead && !!q.match && matches.get(q.match.id) === q.match && !q.match.ended && q.match.players.has(q.ws);
  const unlock = p => { if (p && p.keepC && LOCK.get(p.keepC) === p) LOCK.delete(p.keepC); };
  const lastOffer = new Map();   // charId -> time of the last offer (rate limit)

  // Join: ?ktoken=<stash token>&bring=<stash indices, comma separated>. verified: the character token was valid (wins come from it).
  // Nothing is spent yet: the request is checked now and again at match start (startMatch), so a cancelled queue keeps everything.
  function join(ws, p, q, verified) {
    p.keepC = p.charId; p.keepVer = !!verified;
    const raw = q.get('ktoken'); if (raw == null) return;
    const tok = kRead(raw, 'S');
    if (!tok || tok.c !== p.charId || !verified) { sendTo(ws, { keep: { bad: 1 } }); return; }   // forged, someone else's, or the character token did not verify
    const other = LOCK.get(p.charId);
    if (other && other !== p && active(other)) { p.keepBusy = true; sendTo(ws, { keep: { busy: 1 } }); return; }   // the same goblin is already in a match with its stash
    LOCK.set(p.charId, p); p.keepTok = tok;
    const st = get(p.charId, tok), br = String(q.get('bring') || '');
    const idx = br ? br.split(',').slice(0, 8).map(x => /^\d{1,2}$/.test(x) ? +x : -1) : [];
    const r = KEEP.loadout(st.i, idx, p.wins, G);
    if (r.err) { sendTo(ws, { keep: { refused: r.err, budget: r.budget } }); p.keepReq = null; }
    else p.keepReq = { keys: r.items, cost: r.cost };
    if (st.s !== tok.s) sendTo(ws, { keep: view(p.charId, st) });   // the client's token was behind the store: here is the truth
  }
  // Match start: spend the loadout and the bank (they are now at stake), put the gear on, tell the client its new stash token.
  function start(m) {
    let h = 0; for (const p of m.players.values()) if (isHum(p)) h++; m.keepHum = h;
    for (const [ws, p] of m.players) {
      if (!isHum(p) || !p.keepTok || p.keepBusy) continue;
      const c = p.keepC, st = get(c, p.keepTok);
      let keys = [], rest = st.i;
      if (p.keepReq && p.keepReq.keys.length) {
        const idx = KEEP.indicesOf(st.i, p.keepReq.keys), r = idx && KEEP.loadout(st.i, idx, p.wins, G);   // the stash may have changed since the queue (another tab sold something)
        if (r && !r.err) { keys = r.items; rest = r.rest; } else sendTo(ws, { keep: { refused: 'changed' } });
      }
      if (!keys.length && !st.b) continue;   // nothing to spend: the stash stays as it is, no new version
      if (keys.length) { KEEP.apply(p.inv, keys, G); p.stats = null; recalc(p); }   // full health with the brought armour
      if (st.b) { p.gold += st.b; if (p.st5) p.st5.lg = p.gold; }   // the bank is not "gold earned" on the stats page
      const tok = put(c, st, rest, 0);
      p.keepIn = { items: keys, gold: st.b };
      sendTo(ws, { keep: { tok, i: KS.get(c).i, b: 0, inn: keys, gold: st.b } });
    }
  }
  function howOf(m) { return m.crownWin ? 'crown' : m.timeLimit ? 'time' : 'last'; }
  // An offer for a human at the end: the winner (how = last|crown|time) or a survivor who did not win (how = second). -> the {keep} payload, or null
  function makeOffer(m, p, held, how) {
    const c = p.keepC; if (!c) return null;
    if (how === 'second' && !p.keepVer) return null;   // an unsaved goblin that did not win has no character to keep anything for
    const now = Date.now(), wins = how === 'second' ? p.wins : Math.min(9999, p.wins + 1);
    let why = '';
    const st = statBlock(m, p), idle = !NOIDLE && KEEP.idleWin(st, p.kills | 0, how);
    if (idle) why = 'idle';
    else if (m.goAt && now - m.goAt < MIN_PLAY_MS) why = 'short';
    else if (now - (lastOffer.get(c) || 0) < MIN_GAP_MS) why = 'rate';
    const o = KEEP.offer(held, { wins, how, humans: m.keepHum || 1, idle: !!why, gold: p.gold }, G);
    const cur = get(c, p.keepTok);
    if (!KS.has(c) && p.keepTok) KS.set(c, { ...cur, t: now });   // the store learns this stash now, so the claim merges into the truth
    lastOffer.set(c, now); if (lastOffer.size > STORE_MAX) lastOffer.clear();
    const otok = kSign({ k: 'O', v: K.V, c, s: cur.s, h: o.how, n: o.n, o: o.items.map(x => x.k), sp: o.stipend, x: now + K.OFFER_MS });
    unlock(p);
    return { otok, how: o.how, n: o.n, items: o.items, trophies: o.trophies, stipend: o.stipend, ...(why ? { why } : null), ...view(c, cur) };
  }
  const won = (m, p, held) => makeOffer(m, p, held, howOf(m));
  function ended(m, winner) {   // survivors who did not win (crowned or decided by the time limit) get the small consolation
    for (const [ws, p] of m.players) if (isHum(p) && p !== winner && p.entered && !p.dead) { const k = makeOffer(m, p, allHeld(p), 'second'); if (k) sendTo(ws, { keepOffer: k }); }
  }
  const allHeld = p => [p.inv.weapon, p.inv.armor, p.inv.charm, ...p.inv.backpack, ...p.inv.quick].filter(Boolean);
  const left = p => unlock(p);   // died or left: the lock goes (whatever was brought is gone with the goblin)
  function resume(ws, p) { if (p.keepC && p.keepTok && KS.has(p.keepC)) sendTo(ws, { keep: view(p.keepC, KS.get(p.keepC)) }); }   // a reload mid-match gets the stash token again (the one sent at match start may have been missed)

  // ---- POST /keep: { op: 'claim', otok, tok?, picks } | { op: 'sell', tok, idx } | { op: 'sync', tok }
  const RATE = new Map(); let rateAt = Date.now();
  function http(q, r) {
    const out = (code, o) => { try { r.writeHead(code, { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'content-type': 'application/json', 'cache-control': 'no-store' }); r.end(JSON.stringify(o)); } catch (e) {} };
    if (!originOk(q)) return out(403, { err: 'origin' });
    const now = Date.now(); if (now - rateAt > 60000) { RATE.clear(); rateAt = now; }
    const ip = ipOf(q), n = (RATE.get(ip) || 0) + 1; RATE.set(ip, n); if (n > (DBG ? 600 : 30)) return out(429, { err: 'rate' });
    let body = '', got = 0;
    q.on('data', d => { got += d.length; if (got <= 8192) body += d; else if (got > 65536) { try { q.destroy(); } catch (e) {} } });   // too big: answered 413 at the end; a flood is cut off
    q.on('end', () => { if (got > 8192) return out(413, { err: 'size' }); let d; try { d = JSON.parse(body); } catch (e) { return out(400, { err: 'json' }); } try { const [code, o] = op(d || {}); out(code, o); } catch (e) { console.error('keep', e); out(500, { err: 'server' }); } });
    q.on('error', () => {});
  }
  function op(d) {
    if (d.op === 'claim') {
      const o = kRead(d.otok, 'O'); if (!o) return [400, { err: 'token' }];
      if (Date.now() > o.x) return [410, { err: 'expired' }];
      const t = d.tok != null ? kRead(d.tok, 'S') : null, st = get(o.c, t && t.c === o.c ? t : null);
      if (st.s !== o.s) return [409, { err: 'stale', ...view(o.c, st) }];   // claimed already, or the stash changed after the offer
      const res = KEEP.claim(st.i, st.b, { how: o.h, n: o.n, items: o.o, stipend: o.sp }, d.picks, G);
      if (res.err) return [400, { err: res.err }];
      const tok = put(o.c, st, res.stash, res.bank);
      return [200, { tok, i: res.stash, b: res.bank, kept: res.kept, sold: res.sold, lost: res.lost }];
    }
    const t = kRead(d.tok, 'S'); if (!t) return [400, { err: 'token' }];
    const st = get(t.c, t);
    if (d.op === 'sync') return [200, view(t.c, st)];
    if (d.op === 'sell') {
      if (st.s !== t.s) return [409, { err: 'stale', ...view(t.c, st) }];
      const lk = LOCK.get(t.c); if (lk && active(lk)) return [409, { err: 'busy' }];
      const res = KEEP.sell(st.i, st.b, d.idx, G); if (res.err) return [400, { err: res.err }];
      const tok = put(t.c, st, res.stash, res.bank);
      return [200, { tok, i: res.stash, b: res.bank, sold: res.sold, lost: res.lost }];
    }
    return [400, { err: 'op' }];
  }
  return { join, start, won, ended, left, resume, http, kRead, kSign, store: KS, save };
};

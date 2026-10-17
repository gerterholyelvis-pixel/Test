// keep-server: the server side of "what a winner keeps" (keepsrv.js): win -> offer -> POST /keep claim, bring-in at join and match start,
// anti-dup (store over token, one claim per offer), tamper attempts, a cancelled queue, reconnect, idle wins, the consolation and a restart with the store file.
const L = require('./lib.js'), { connect, connectRaw, sleep, assert, eq } = L;
const crypto = require('crypto'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const G = require('../items.js'), KP = require('../keep.js');
const SECRET = 'keep-secret-1';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const ctok = (o, s = SECRET) => { const b = b64(o); return b + '.' + crypto.createHmac('sha256', s).update(b).digest('base64url'); };   // character token
const ktok = (o, s = SECRET) => { const b = b64({ k: 'S', v: 1, s: 0, b: 0, ...o }); return b + '.' + crypto.createHmac('sha256', s).update('keep|' + b).digest('base64url'); };   // stash token
const post = (port, body, headers = {}) => new Promise((res, rej) => {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  const r = http.request({ host: '127.0.0.1', port, path: '/keep', method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, x => { let b = ''; x.on('data', d => b += d); x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) {} res({ status: x.statusCode, body: j }); }); });
  r.on('error', rej); r.end(data);
});
const keys = Object.keys(G.ITEMS), of = (t, tier) => keys.find(k => G.ITEMS[k].type === t && (G.ITEMS[k].tierN | 0) === tier && G.ITEMS[k].price > 0);
const W2 = of('weapon', 2), W3 = of('weapon', 3), W4 = of('weapon', 4), A3 = of('armor', 3), X1 = of('consumable', 1), BOUND = 'x:crownseal';
const q = (c, w, extra = '') => 'ctoken=' + encodeURIComponent(ctok({ c, g: 1, w, n: 'Hero' })) + extra;
const qk = (c, w, k, bring) => q(c, w, '&ktoken=' + encodeURIComponent(k) + (bring != null ? '&bring=' + bring : ''));
const keepMsgs = c => c.msgs.filter(m => m.keep).map(m => m.keep);
const winWith = async (port, query, give) => { const c = await connect(port, query); for (const k of give) c.send({ give: k }); await sleep(150); c.send({ win: 1 }); await c.until(x => x.state.won, 3000, 'won'); return c; };

(async () => {
  const S = await L.startServer({ GK_SECRET: SECRET, GK_KEEP_NOIDLE: '1' }), idle = await L.startServer({ GK_SECRET: SECRET });
  const qs = await L.startServer({ GK_SECRET: SECRET, GK_MATCH_SIZE: '8', GK_QUEUE_MS: '60000' });
  const tl = await L.startServer({ GK_SECRET: SECRET, GK_MATCH_SIZE: '2', GK_ROUND_MS: '1500', GK_MAX_ROUND: '1', GK_SUDDEN_ROUND: '1', GK_KEEP_NOIDLE: '1' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gkkeep-')), FILE = path.join(dir, 'keep.json');
  let P = await L.startServer({ GK_SECRET: SECRET, GK_KEEP_FILE: FILE, GK_KEEP_NOIDLE: '1' });
  let fail = 1;
  try {
    fail = await L.run('keep-server', [
      ['win -> offer -> claim: slots from the verified victories, picks validated, one claim only', async () => {
        const c = await winWith(S.port, q('hero1', 3), [W3, BOUND]), k = c.state.won.keep;
        assert(k && typeof k.otok === 'string', 'offer token'); eq(k.n, 2, '4 victories = 3 slots, -1 for a match without another human');
        eq(k.i, []); const iw = k.items.findIndex(x => x.k === W3), ib = k.items.findIndex(x => x.k === BOUND); assert(iw >= 0 && ib >= 0, 'held items offered');
        eq(k.items[ib].ok, false); eq(k.items[ib].why, 'bound');
        eq((await post(S.port, { op: 'claim', otok: k.otok, picks: [ib] })).body.err, 'item', 'a match-bound item');
        eq((await post(S.port, { op: 'claim', otok: k.otok, picks: [iw, 0, 1] })).body.err, 'picks', 'more picks than slots');
        const bad = k.otok.slice(0, -2) + (k.otok.slice(-2) === 'AA' ? 'BB' : 'AA'); eq((await post(S.port, { op: 'claim', otok: bad, picks: [] })).status, 400, 'forged offer');
        const forged = ktok({ k: 'O', c: 'hero1', s: 0, h: 'crown', n: 5, o: [W4, W4], sp: 30, x: Date.now() + 1e6 }, 'wrong-secret'); eq((await post(S.port, { op: 'claim', otok: forged, picks: [0] })).status, 400, 'self-made offer');
        const r = await post(S.port, { op: 'claim', otok: k.otok, picks: [iw] }); eq(r.status, 200); eq(r.body.i, [W3]); eq(r.body.b, k.stipend); assert(k.stipend > 0, 'stipend banked');
        const again = await post(S.port, { op: 'claim', otok: k.otok, picks: [iw] }); eq(again.status, 409, 'second claim'); eq(again.body.err, 'stale'); eq(again.body.i, [W3], 'the truth comes back');
        await c.close();
      }],
      ['bring-in: the stash item is put on at match start and spent from the stash; the old token cannot bring it again', async () => {
        const t0 = ktok({ c: 'hero2', i: [W3, X1], b: 12 });
        const c = await connect(S.port, qk('hero2', 4, t0, '0,1'));   // 4 victories: budget 4 = mythic (3) + uncommon (1)
        eq(c.state.inv.weapon, W3); assert(c.state.inv.quick.includes(X1), 'consumable in a quick slot'); eq(c.state.gold, G.START_GOLD + 12 + (G.goblinStart(c.state.goblin) ? G.goblinStart(c.state.goblin).gold : 0), 'bank on top of the start gold');
        const km = keepMsgs(c).find(x => x.inn); eq(km.inn, [W3, X1]); eq(km.i, []); eq(km.b, 0);
        assert(c.state.players.find(p => p.id === c.state.you).stats.attack === G.ITEMS[W3].attack, 'the snapshot shows the brought weapon');
        const two = await connectRaw(S.port, qk('hero2', 3, t0, '0')); await two.until(x => x.state.keep, 2000, 'busy'); eq(two.state.keep.busy, 1, 'the same goblin twice'); await two.close();
        c.send({ kill: 1 }); await c.until(x => x.state.died, 3000, 'died'); await c.close(); await sleep(100);
        const d = await connect(S.port, qk('hero2', 3, t0, '0'));   // replay the pre-match token
        assert(keepMsgs(d).some(x => x.refused), 'refused'); assert(d.state.inv.weapon !== W3, 'not brought twice'); eq(keepMsgs(d).find(x => x.tok && !x.inn).i, [], 'told the real stash'); await d.close();
      }],
      ['join: forged, foreign, unverified, over-budget and over-slot requests are refused', async () => {
        const join = async query => { const c = await connectRaw(S.port, query); await c.until(x => x.state.queue, 2000, 'queue'); await sleep(80); const k = keepMsgs(c); await c.close(); await sleep(100); return k; };
        eq((await join(qk('hero3', 3, ktok({ c: 'someone', i: [W2] }), '0')))[0], { bad: 1 }, 'another character\'s stash');
        eq((await join('ktoken=' + encodeURIComponent(ktok({ c: 'hero3', i: [W2] })) + '&bring=0'))[0], { bad: 1 }, 'no character token');
        eq((await join(qk('hero3', 3, ktok({ c: 'hero3', i: [W2] }, 'nope'), '0')))[0], { bad: 1 }, 'bad signature');
        eq((await join(qk('hero3', 3, ktok({ c: 'hero3', i: [W2] }).replace(/^./, 'x'), '0')))[0], { bad: 1 }, 'edited body');
        eq((await join(qk('hero3a', 3, ktok({ c: 'hero3a', i: [W4] }), '0')))[0].refused, 'budget', 'legendary at 3 victories');   // each refused join still starts a match (size 1), so each uses its own goblin
        eq((await join(qk('hero3b', 9, ktok({ c: 'hero3b', i: [W2, W3] }), '0,1')))[0].refused, 'slot', 'two weapons');
        eq((await join(qk('hero3c', 9, ktok({ c: 'hero3c', i: [W2] }), '0,0')))[0].refused, 'picks', 'the same item twice');
        eq((await join(qk('hero3d', 9, ktok({ c: 'hero3d', i: [W2] }), '7')))[0].refused, 'picks', 'out of range');
        eq((await join(qk('hero3b', 9, ktok({ c: 'hero3b', i: [W2] }), '0')))[0], { busy: 1 }, 'still in the match it just left (reconnect grace)');
        const c = await connect(S.port, qk('hero3e', 3, ktok({ c: 'hero3e', i: [W4] }), '0')); assert(c.state.inv.weapon !== W4, 'refused means the starter kit'); await c.close();
      }],
      ['a cancelled queue spends nothing; sell and sync work on the stash', async () => {
        const t0 = ktok({ c: 'hero4', i: [W3, A3], b: 5 }), c = await connectRaw(qs.port, qk('hero4', 9, t0, '0,1')); await c.until(x => x.state.queue, 2000, 'queue'); await c.close(); await sleep(120);
        const s = await post(qs.port, { op: 'sync', tok: t0 }); eq(s.status, 200); eq([s.body.i, s.body.b], [[W3, A3], 5]);
        const sold = await post(qs.port, { op: 'sell', tok: t0, idx: [1] }); eq(sold.status, 200); eq(sold.body.i, [W3]); eq(sold.body.b, 5 + KP.sellValue(A3, G));
        eq((await post(qs.port, { op: 'sell', tok: t0, idx: [0] })).status, 409, 'an old token cannot sell again');
        eq((await post(qs.port, { op: 'sell', tok: sold.body.tok, idx: [3] })).body.err, 'picks');
        eq((await post(qs.port, { op: 'nope', tok: sold.body.tok })).body.err, 'op'); eq((await post(qs.port, 'not json')).body.err, 'json');
        eq((await post(qs.port, { op: 'sync', tok: 'x' })).status, 400); eq((await post(qs.port, 'x'.repeat(9000))).status, 413);
        eq((await post(qs.port, { op: 'sync', tok: t0 }, { origin: 'http://evil.example' })).status, 403, 'foreign origin');
      }],
      ['reconnect: a resumed goblin gets its stash token again', async () => {
        const c = await connect(S.port, qk('hero5', 3, ktok({ c: 'hero5', i: [W2] }), '0')); const tk = c.state.token; await c.close(); await sleep(100);
        const r = await connectRaw(S.port, 'token=' + tk); await r.until(x => x.state.resumed && x.state.keep, 3000, 'resumed + keep'); eq(r.state.keep.i, []); assert(r.state.keep.tok, 'token');
        r.send({ win: 1 }); await r.until(x => x.state.won, 3000, 'won'); const k = r.state.won.keep; assert(k.items.some(x => x.k === W2), 'the brought weapon can be kept again');
        const cl = await post(S.port, { op: 'claim', otok: k.otok, tok: r.state.keep.tok, picks: [k.items.findIndex(x => x.k === W2)] }); eq(cl.body.i, [W2]); await r.close();
      }],
      ['an idle win (no damage, no kill) keeps nothing but the victory', async () => {
        const c = await winWith(idle.port, q('hero6', 1), [W2]), k = c.state.won.keep; eq([k.n, k.why, k.stipend], [0, 'idle', 0]); assert(c.state.won.ctoken, 'the victory still counts');
        eq((await post(idle.port, { op: 'claim', otok: k.otok, picks: [0] })).body.err, 'picks'); eq((await post(idle.port, { op: 'claim', otok: k.otok, picks: [] })).status, 200); await c.close();
      }],
      ['time limit: the winner gets the offer, the surviving runner-up a one-consumable consolation', async () => {
        const a = await connectRaw(tl.port, q('tla', 2)), b = await connectRaw(tl.port, q('tlb', 2));
        for (const c of [a, b]) c.ws.on('message', raw => { const d = JSON.parse(raw); if (d.matchStart) c.send({ ready: 1 }); });
        await a.until(x => x.state.countdown, 4000, 'countdown'); await sleep(300); for (const c of [a, b]) { c.send({ give: X1 }); c.send({ give: W2 }); }
        await a.until(() => a.state.matchEnd && b.state.matchEnd, 8000, 'match end');
        await sleep(200); const win = a.state.won ? a : b, lose = win === a ? b : a;
        assert(win.state.won && win.state.won.keep.how === 'time', 'decided by time'); const c = lose.state.keepOffer; assert(c, 'consolation sent');
        eq([c.how, c.n, c.stipend], ['second', 1, 0]); eq(c.items.filter(x => x.ok).map(x => x.k), [X1], 'consumables only');
        eq((await post(tl.port, { op: 'claim', otok: c.otok, picks: [c.items.findIndex(x => x.k === X1)] })).body.i, [X1]);
        await a.close(); await b.close();
      }],
      ['restart: the store file outlives the server, so a spent token stays spent', async () => {
        const t0 = ktok({ c: 'hero7', i: [W2] }), c = await connect(P.port, qk('hero7', 3, t0, '0')); eq(c.state.inv.weapon, W2); c.send({ kill: 1 }); await c.until(x => x.state.died, 3000, 'died'); await c.close();
        await sleep(5600); P.stop(); await sleep(200);   // the store is written every 5 s (and on a clean exit)
        assert(fs.existsSync(FILE), 'store written');
        P = await L.startServer({ GK_SECRET: SECRET, GK_KEEP_FILE: FILE });
        const s = await post(P.port, { op: 'sync', tok: t0 }); eq(s.body.i, [], 'the old token shows the real (empty) stash');
      }],
    ]);
  } catch (e) { console.log('  FAIL  setup:', e.stack || e); }
  for (const s of [S, idle, qs, tl, P]) s.stop(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();

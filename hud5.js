// hud5.js: client HUD pieces for the 5x5 arena (activity arc, re-key banners, room banners, crown indicator,
// vault alarm / sudden-death edge tint, minimap + M map drawing for 25 arena cells and 16 attached rooms,
// dev-only "skip to 0:10" button). Self-contained DOM + CSS, no three.js, no game.js access.
// Message-to-method mapping: docs/reports/hud5.md.  UMD: window.HUD5 / module.exports (for tests).
(function (root) {
  'use strict';
  // ---------------------------------------------------------------- constants (mirror PLAN-5x5 section 1)
  const COLX = [-33.75, -18.75, 0, 18.75, 33.75], COLW = [15, 15, 22.5, 15, 15], HALF = 41.25, HS = 10, CS = 8, LIM = HALF + HS;
  const VAULT = '12';
  const VB_CELLS = { N: '7', E: '13', S: '17', W: '11' };           // vaultbreaker cell by compass side
  const TREE_CELLS = ['6', '8', '16', '18'];
  // attached room c0..c15: [col, row, side]; even = home (10 m), odd = loot (8 m)
  const ATT = [[0, 0, 'N'], [1, 0, 'N'], [2, 0, 'N'], [3, 0, 'N'], [4, 0, 'E'], [4, 1, 'E'], [4, 2, 'E'], [4, 3, 'E'],
    [4, 4, 'S'], [3, 4, 'S'], [2, 4, 'S'], [1, 4, 'S'], [0, 4, 'W'], [0, 3, 'W'], [0, 2, 'W'], [0, 1, 'W']];

  // name / colour / one-line function, per room type
  const INFO = {
    well: ['Sapling Well', '#6fd0ff', 'Crank the windlass, drink or water the sapling. Anyone may steal the fruit.'],
    press: ['Brain Press', '#d98cff', 'Kill husks, press their brains for knowledge.'],
    spring: ['Healing Spring', '#5fe3a8', 'Hold the pool alone to heal. Bottle water at the basins.'],
    seer: ['Seer\'s Tree', '#f0d86a', 'Align the seeing stones for a vision of the map.'],
    graft: ['Grafting Bench', '#c8e060', 'Cut a scion, graft it onto your gear in the vise.'],
    thorn: ['Thorn Shrine', '#ff7a6a', 'Grip the thorns and bleed for a blessing.'],
    gambler: ['Gambler\'s Root', '#ffa84a', 'Feed it an item. It spits back one tier higher, or keeps it.'],
    memory: ['Memory Tree', '#7aa8ff', 'Repeat the lantern order for knowledge.'],
    oak: ['Hollow Oak', '#8a9a7a', 'Hold the nook: hidden from every map, and the trees whisper.'],
    elder: ['Elder Tree', '#ffd24a', 'Light all three root-stones, then race for the seed.'],
    ram: ['Battering Ram', '#e0743a', 'Wind the winch, release the ram. Breach the vault door.'],
    locksmith: ['Locksmith', '#8fb4ff', 'Set the five pins in order. Quiet hands, or the bell rings.'],
    counting: ['Counting House', '#e8c860', 'Buy writs for votes. Rob the strongbox if you dare.'],
    keystone: ['Keystone', '#b98cff', 'Light the stones in order and keep them burning.'],
    vault: ['The Vault', '#ffc933', 'Claim the crown alone on the dais. Scoop the coffers.']
  };
  const VB_ORDER = ['ram', 'keystone', 'locksmith', 'counting'];
  const SIDE_NAME = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };
  const SHORT = { ram: 'Ram', locksmith: 'Locksmith', counting: 'Counting House', keystone: 'Keystone' };

  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- map layout (pure; no DOM)
  function attachedRect(i) {
    const [c, r, side] = ATT[i], s = i % 2 === 0 ? HS : CS, cx = COLX[c], cz = COLX[r];
    if (side === 'N') return { id: 'c' + i, cx, cz: -HALF - s / 2, w: s, h: s, side };
    if (side === 'S') return { id: 'c' + i, cx, cz: HALF + s / 2, w: s, h: s, side };
    if (side === 'W') return { id: 'c' + i, cx: -HALF - s / 2, cz, w: s, h: s, side };
    return { id: 'c' + i, cx: HALF + s / 2, cz, w: s, h: s, side };
  }
  function arenaRect(k) {
    const n = +k, c = n % 5, r = (n / 5) | 0;
    return { id: String(n), cx: COLX[c], cz: COLX[r], w: COLW[c], h: COLW[r] };
  }
  const ARENA = []; for (let i = 0; i < 25; i++) ARENA.push(arenaRect(i));
  const ATTACHED = []; for (let i = 0; i < 16; i++) ATTACHED.push(attachedRect(i));
  const cellAt = (x, z) => {   // room key containing a point (arena or attached), or null
    if (Math.abs(x) <= HALF && Math.abs(z) <= HALF) { const f = v => v < -HALF + 15 ? 0 : v < -HALF + 30 ? 1 : v < HALF - 30 ? 2 : v < HALF - 15 ? 3 : 4; return String(f(x) + 5 * f(z)); }
    for (const a of ATTACHED) if (Math.abs(x - a.cx) <= a.w / 2 && Math.abs(z - a.cz) <= a.h / 2) return a.id;
    return null;
  };
  const sideOfVb = key => { for (const s in VB_CELLS) if (VB_CELLS[s] === key) return s; return null; };

  // mapOps(state, opts) -> array of drawing instructions in WORLD units (x,z metres). Icons carry a pixel size flag.
  // state: { me:{x,z,yaw}, vb:{cell:type}, vbNext:{cell:type}|null, trees:{cell:type}, layout:{cN:'home'|'forge'|'recycler'|'chest'|'merchant'|'mystery'},
  //   homes:{cN:name}, myHome:'cN', armed:[cell], breach:{N:0..100,...}, crown:{active,claims:[{id,name,s}]}, discovered:Set|Array of 'cN',
  //   open:Array of {x,z,h:0|1,open:bool,vault:bool}, actors:[{x,z}], sudden:bool }
  // opts: { big:bool, north:bool(default true) }
  function mapOps(state, opts) {
    state = state || {}; opts = opts || {};
    const ops = [], big = !!opts.big, vb = state.vb || {}, vbN = state.vbNext || null, trees = state.trees || {}, lay = state.layout || {};
    const disc = state.discovered ? new Set(state.discovered) : null, armed = new Set(state.armed || []);
    const my = state.me ? cellAt(state.me.x, state.me.z) : null;
    const labels = big;
    for (const a of ARENA) {
      const v = a.id === VAULT, here = a.id === my;
      ops.push({ t: 'rect', x: a.cx, z: a.cz, w: a.w - .5, h: a.h - .5, fill: v ? 'rgba(201,150,30,.55)' : here ? 'rgba(214,190,140,.3)' : 'rgba(200,180,140,.18)', stroke: v ? '#ffc933' : here ? '#e8d6a0' : 'rgba(170,150,110,.7)', lw: v ? 2.2 : 1.1 });
      let k = null, name = null;
      if (v) { k = 'crown'; name = 'Vault'; }
      else if (vb[a.id]) { k = vb[a.id]; name = k === 'counting' ? 'Counting' : SHORT[k]; }
      else if (trees[a.id]) { k = 'tree:' + trees[a.id]; name = INFO[trees[a.id]] && INFO[trees[a.id]][0]; }
      if (k) {
        ops.push({ t: 'icon', k, x: a.cx, z: a.cz, r: big ? (v ? 14 : 10) : (v ? 8 : 6), color: infoColor(k), armed: armed.has(a.id) });
        if (labels && name) ops.push({ t: 'text', x: a.cx, z: a.cz, dy: big ? 20 : 0, text: name, color: 'rgba(240,226,190,.8)', size: 11 });
      }
      if (vbN && vbN[a.id] && vbN[a.id] !== vb[a.id]) ops.push({ t: 'icon', k: vbN[a.id], x: a.cx + a.w * .27, z: a.cz - a.h * .27, r: big ? 6 : 4, color: infoColor(vbN[a.id]), ghost: true });
    }
    for (const a of ATTACHED) {
      const kind = lay[a.id] || (a.id.slice(1) % 2 === 0 ? 'home' : 'chest'), mine = state.myHome === a.id, known = !disc || kind === 'home' || disc.has(a.id) || a.id === my;
      const here = a.id === my;
      ops.push({ t: 'rect', x: a.cx, z: a.cz, w: a.w - .5, h: a.h - .5, fill: kind === 'home' ? (mine ? 'rgba(245,196,81,.32)' : 'rgba(150,120,80,.2)') : known ? tintOf(kind) : 'rgba(60,50,35,.5)', stroke: mine ? '#f5c451' : here ? '#e8d6a0' : known ? 'rgba(200,170,110,.85)' : 'rgba(130,110,80,.55)', lw: mine ? 1.8 : 1.1 });
      if (known) {
        ops.push({ t: 'icon', k: kind, x: a.cx, z: a.cz, r: big ? 7 : 4.5, color: mine ? '#f5c451' : null, mine });
        if (labels && kind === 'home' && state.homes && state.homes[a.id]) ops.push({ t: 'text', x: a.cx, z: a.cz, dy: 13, text: state.homes[a.id], color: mine ? '#f5c451' : 'rgba(240,226,190,.7)', size: 10 });
      }
    }
    for (const d of state.open || []) ops.push({ t: 'door', x: d.x, z: d.z, h: d.h ? 1 : 0, color: d.open ? '#6dff9a' : d.vault ? '#b9892a' : '#8a3b2c' });
    // vault door breach: a crack bar along the vault edge, side by side
    const b = state.breach;
    if (b) for (const s in b) {
      if (!(b[s] > 0)) continue;
      ops.push({ t: 'breach', side: s, v: Math.min(100, b[s]), x: s === 'W' ? -11.25 : s === 'E' ? 11.25 : 0, z: s === 'N' ? -11.25 : s === 'S' ? 11.25 : 0, h: s === 'N' || s === 'S' ? 1 : 0 });
    }
    const cr = state.crown;
    if (cr && cr.active) ops.push({ t: 'ring', x: 0, z: 0, r: 14, color: '#ff8a3a', pulse: true });
    for (const a of state.actors || []) ops.push({ t: 'dot', x: a.x, z: a.z, color: '#ff5a3a', r: big ? 4.5 : 3 });
    if (state.me) ops.push({ t: 'me', x: state.me.x, z: state.me.z, yaw: state.me.yaw || 0, r: big ? 9 : 6 });
    return ops;
  }
  function infoColor(k) { if (k === 'crown') return '#ffc933'; if (k.indexOf('tree:') === 0) { const i = INFO[k.slice(5)]; return i ? i[1] : '#9c9'; } const i = INFO[k]; return i ? i[1] : '#ccc'; }
  function tintOf(kind) { return kind === 'mystery' ? 'rgba(110,50,170,.4)' : kind === 'merchant' ? 'rgba(30,150,140,.38)' : kind === 'forge' ? 'rgba(220,100,40,.34)' : kind === 'recycler' ? 'rgba(90,170,110,.34)' : 'rgba(210,160,40,.32)'; }

  // icon painters: origin at the centre, upright, pixel units, radius r
  const ICONS = {
    crown(g, r, c) { g.beginPath(); g.moveTo(-r, r * .6); g.lineTo(-r, -r * .5); g.lineTo(-r * .5, r * .05); g.lineTo(0, -r * .8); g.lineTo(r * .5, r * .05); g.lineTo(r, -r * .5); g.lineTo(r, r * .6); g.closePath(); g.fillStyle = c; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#3a2506'; g.stroke(); },
    tree(g, r, c) { g.fillStyle = '#4a3418'; g.fillRect(-r * .16, 0, r * .32, r * .9); g.beginPath(); g.arc(0, -r * .2, r * .72, 0, 6.2832); g.fillStyle = c; g.fill(); g.lineWidth = 1.2; g.strokeStyle = 'rgba(10,12,8,.8)'; g.stroke(); },
    ram(g, r, c) { g.fillStyle = c; g.fillRect(-r, -r * .3, r * 1.45, r * .6); g.beginPath(); g.moveTo(r * .45, -r * .62); g.lineTo(r, 0); g.lineTo(r * .45, r * .62); g.closePath(); g.fill(); g.lineWidth = 1.1; g.strokeStyle = '#2a1206'; g.strokeRect(-r, -r * .3, r * 1.45, r * .6); },
    locksmith(g, r, c) { g.beginPath(); g.arc(-r * .45, 0, r * .5, 0, 6.2832); g.lineWidth = r * .32; g.strokeStyle = c; g.stroke(); g.fillStyle = c; g.fillRect(-r * .1, -r * .12, r * 1.1, r * .24); g.fillRect(r * .5, 0, r * .2, r * .5); g.fillRect(r * .85, 0, r * .18, r * .38); },
    counting(g, r, c) { for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, r * (.5 - i * .5), r * .85, r * .32, 0, 0, 6.2832); g.fillStyle = i === 1 ? c : '#b8962e'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#4a3508'; g.stroke(); } },
    keystone(g, r, c) { g.beginPath(); g.moveTo(0, -r); g.lineTo(r * .8, 0); g.lineTo(0, r); g.lineTo(-r * .8, 0); g.closePath(); g.fillStyle = c; g.fill(); g.lineWidth = 1.2; g.strokeStyle = '#2a1646'; g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-r * .08, -r * .45, r * .16, r * .9); },
    home(g, r, c) { g.beginPath(); g.moveTo(-r, 0); g.lineTo(0, -r); g.lineTo(r, 0); g.lineTo(r * .75, 0); g.lineTo(r * .75, r * .8); g.lineTo(-r * .75, r * .8); g.lineTo(-r * .75, 0); g.closePath(); g.fillStyle = c || 'rgba(214,190,140,.8)'; g.fill(); g.lineWidth = 1.1; g.strokeStyle = '#2a1e08'; g.stroke(); },
    forge(g, r) { g.fillStyle = '#ff9a4a'; g.fillRect(-r, -r * .5, r * 2, r * .5); g.fillStyle = '#c4612a'; g.fillRect(-r * .55, 0, r * 1.1, r * .45); g.fillRect(-r * .8, r * .45, r * 1.6, r * .35); g.lineWidth = 1; g.strokeStyle = '#2a1206'; g.strokeRect(-r, -r * .5, r * 2, r * .5); },
    recycler(g, r) { g.beginPath(); g.arc(0, 0, r * .75, .5, 5.2); g.lineWidth = r * .32; g.strokeStyle = '#7fe0a0'; g.stroke(); g.beginPath(); g.moveTo(r * .75, -r * .1); g.lineTo(r * 1.1, r * .5); g.lineTo(r * .3, r * .5); g.closePath(); g.fillStyle = '#7fe0a0'; g.fill(); },
    chest(g, r) { g.fillStyle = '#e8b830'; g.fillRect(-r, -r * .45, r * 2, r * 1.2); g.fillStyle = '#b07a14'; g.fillRect(-r, -r * .95, r * 2, r * .55); g.fillStyle = '#3a2506'; g.fillRect(-r * .2, -r * .3, r * .4, r * .5); },
    merchant(g, r) { g.beginPath(); g.arc(0, 0, r, 0, 6.2832); g.fillStyle = '#2fd0c0'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#0b4a45'; g.stroke(); g.fillStyle = '#0b4a45'; g.fillRect(-r * .1, -r * .55, r * .2, r * 1.1); g.fillRect(-r * .55, -r * .1, r * 1.1, r * .2); },
    mystery(g, r) { g.font = '700 ' + Math.round(r * 2.2) + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#1a0a2a'; g.strokeText('?', 0, 1); g.fillStyle = '#c58cff'; g.fillText('?', 0, 1); }
  };
  function paintIcon(g, k, r, color, armed, ghost) {
    if (ghost) g.globalAlpha = .55;
    if (armed) { g.beginPath(); g.arc(0, 0, r * 1.5, 0, 6.2832); g.lineWidth = 2; g.strokeStyle = '#ffe39a'; g.stroke(); }
    if (k.indexOf('tree:') === 0) ICONS.tree(g, r, color); else if (ICONS[k]) ICONS[k](g, r, color);
    g.globalAlpha = 1;
  }
  // executes mapOps on a 2D context. S = canvas CSS size. The bg (parchment) is the caller's business.
  function drawMap(g, S, ops, opts) {
    opts = opts || {}; const north = opts.north !== false, yaw = opts.yaw || 0, rot = north ? 0 : yaw, time = opts.time || 0;
    const sc = (S - S * .1) / (2 * LIM) * (rot ? .72 : 1), ip = 1 / sc, me = ops.find(o => o.t === 'me');
    g.save(); g.translate(S / 2, S / 2); g.rotate(rot); g.scale(sc, sc);
    if (opts.follow && me) g.translate(-me.x, -me.z);
    for (const o of ops) {
      switch (o.t) {
        case 'rect': g.fillStyle = o.fill; g.fillRect(o.x - o.w / 2, o.z - o.h / 2, o.w, o.h); g.lineWidth = o.lw * ip; g.strokeStyle = o.stroke; g.strokeRect(o.x - o.w / 2, o.z - o.h / 2, o.w, o.h); break;
        case 'door': { const hx = o.h ? 2.6 : 0, hz = o.h ? 0 : 2.6; g.lineWidth = 3 * ip; g.strokeStyle = o.color; g.beginPath(); g.moveTo(o.x - hx, o.z - hz); g.lineTo(o.x + hx, o.z + hz); g.stroke(); break; }
        case 'icon': g.save(); g.translate(o.x, o.z); g.rotate(-rot); g.scale(ip, ip); paintIcon(g, o.k, o.r, o.color, o.armed, o.ghost); g.restore(); break;
        case 'text': g.save(); g.translate(o.x, o.z); g.rotate(-rot); g.scale(ip, ip); g.font = '600 ' + o.size + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = o.color; g.fillText(o.text, 0, o.dy || 0); g.restore(); break;
        case 'breach': {   // crack bar along the vault edge: fills from the middle outward, tick at 50
          const L = 4.9 * (o.v / 100), hx = o.h ? 1 : 0, hz = o.h ? 0 : 1;
          g.lineWidth = 4 * ip; g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.moveTo(o.x - hx * 4.9, o.z - hz * 4.9); g.lineTo(o.x + hx * 4.9, o.z + hz * 4.9); g.stroke();
          g.strokeStyle = o.v >= 100 ? '#ff4a2a' : o.v >= 50 ? '#ff9a3a' : '#e8c860'; g.beginPath(); g.moveTo(o.x - hx * L, o.z - hz * L); g.lineTo(o.x + hx * L, o.z + hz * L); g.stroke(); break;
        }
        case 'ring': g.beginPath(); g.arc(o.x, o.z, o.r, 0, 6.2832); g.lineWidth = (2.4 + (o.pulse ? Math.sin(time / 180) * .9 : 0)) * ip; g.strokeStyle = o.color; g.stroke(); break;
        case 'dot': g.beginPath(); g.arc(o.x, o.z, o.r * ip, 0, 6.2832); g.fillStyle = o.color; g.fill(); g.lineWidth = 1.2 * ip; g.strokeStyle = '#1a0606'; g.stroke(); break;
        case 'me': g.save(); g.translate(o.x, o.z); g.rotate(-o.yaw); g.scale(ip, ip); { const r = o.r; g.beginPath(); g.moveTo(0, -r * 1.35); g.lineTo(r * .95, r * .95); g.lineTo(0, r * .5); g.lineTo(-r * .95, r * .95); g.closePath(); g.fillStyle = '#fff2b8'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#2a1e08'; g.stroke(); } g.restore(); break;
      }
    }
    g.restore();
  }

  // ---------------------------------------------------------------- DOM / CSS
  const CSS = `
.gk5{position:fixed;inset:0;pointer-events:none;z-index:28;font-family:var(--ui,'Barlow Condensed','Arial Narrow',system-ui,sans-serif);color:var(--txt,#efe9d8)}
.gk5 *{box-sizing:border-box}
.gk5-arc{position:absolute;left:50%;top:calc(50% + 26px);width:148px;height:44px;margin-left:-74px;opacity:0;transition:opacity .18s}
.gk5-arc.on{opacity:1}
.gk5-arc svg{display:block;overflow:visible;filter:drop-shadow(0 1px 3px rgba(0,0,0,.8))}
.gk5-arc .trk{fill:none;stroke:rgba(10,8,6,.62);stroke-width:7;stroke-linecap:round}
.gk5-arc .bar{fill:none;stroke:var(--gold,#f5c451);stroke-width:3.4;stroke-linecap:round}
.gk5-arc .win{fill:none;stroke:rgba(109,255,154,.8);stroke-width:7;stroke-linecap:butt}
.gk5-arc .tk{stroke:rgba(255,227,154,.7);stroke-width:1.4}
.gk5-arc .ndl{fill:var(--gold2,#ffe39a);stroke:#1a1104;stroke-width:1.6}
.gk5-arc.hit .bar,.gk5-arc.hit .ndl{stroke:#6dff9a;fill:#6dff9a}
.gk5-arc.miss .ndl{fill:#ff6a4a}.gk5-arc.miss .trk{stroke:rgba(150,30,20,.7)}
.gk5-arc .lb{position:absolute;left:0;right:0;top:34px;text-align:center;font:600 12px var(--ui,system-ui);letter-spacing:.16em;text-transform:uppercase;color:var(--gold2,#ffe39a);text-shadow:0 1px 3px #000;white-space:nowrap}
.gk5-bn{position:absolute;left:3vw;right:3vw;margin:0 auto;top:15%;transform:translateY(-6px);opacity:0;transition:opacity .45s,transform .45s;padding:5px 18px 6px;background:linear-gradient(180deg,rgba(18,15,12,.8),rgba(10,8,8,.8));border:1px solid rgba(245,196,81,.26);border-left:3px solid var(--gold3,#a8741a);text-align:center;width:max-content;max-width:94vw;line-height:1.5;font-size:clamp(13px,2.1vh,17px);letter-spacing:.1em;text-transform:uppercase}
.gk5-bn.on{opacity:1;transform:none}
.gk5-bn b{color:var(--gold,#f5c451);letter-spacing:.2em;margin-right:12px;font-weight:700}
.gk5-bn i{font-style:normal;margin:0 8px;color:#6a6252}
.gk5-bn span{font-weight:600;white-space:nowrap;margin:0 9px}
.gk5-rm{position:absolute;left:50%;bottom:22%;transform:translate(-50%,8px);opacity:0;text-align:center;transition:opacity .5s,transform .5s;max-width:min(92vw,560px);padding:10px 34px 12px;background:radial-gradient(ellipse at center,rgba(8,6,6,.6) 0,rgba(8,6,6,.38) 58%,rgba(8,6,6,0) 100%)}
.gk5-rm.on{opacity:1;transform:translate(-50%,0)}
.gk5-rm .n{font-family:var(--disp,Georgia,serif);font-weight:700;font-size:clamp(20px,3.6vh,32px);letter-spacing:.1em;text-shadow:0 2px 14px #000,0 0 18px rgba(0,0,0,.8)}
.gk5-rm .n::after{content:"";display:block;width:64px;height:2px;margin:6px auto 0;background:linear-gradient(90deg,transparent,currentColor,transparent);opacity:.8}
.gk5-rm .f{margin-top:6px;font-size:clamp(14px,2.3vh,18px);letter-spacing:.06em;color:var(--txt,#efe9d8);text-shadow:0 1px 8px #000,0 0 12px #000}
.gk5-cr{position:absolute;left:50%;top:var(--gk5CrownTop,46px);transform:translateX(-50%);min-width:210px;padding:5px 12px 6px;opacity:0;transition:opacity .3s;background:linear-gradient(180deg,rgba(18,15,12,.86),rgba(10,8,8,.86));border:1px solid rgba(255,201,51,.4);border-top:2px solid #ffc933}
.gk5-cr.on{opacity:1}
.gk5-cr h4{margin:0 0 3px;font:700 11px var(--ui,system-ui);letter-spacing:.24em;text-transform:uppercase;color:#ffc933}
.gk5-cr .r{display:grid;grid-template-columns:1fr 72px 34px;align-items:center;gap:8px;font-size:14px;letter-spacing:.04em;line-height:1.35}
.gk5-cr .r.me{color:var(--gold2,#ffe39a)}
.gk5-cr .bg{height:4px;background:rgba(255,255,255,.1)}.gk5-cr .bg>i{display:block;height:100%;background:#ffc933}
.gk5-cr .r.live .bg>i{background:#ff9a3a;box-shadow:0 0 6px #ff9a3a}
.gk5-cr .s{text-align:right;font-variant-numeric:tabular-nums;color:var(--mut,#a9a493)}
.gk5-ed{position:absolute;inset:0;opacity:0;transition:opacity .6s}
.gk5-ed.sud{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 58%,rgba(255,106,42,.16) 100%);box-shadow:inset 0 0 90px rgba(255,90,30,.18)}
.gk5-ed.sud.on{opacity:1}
.gk5-ed.alm{background:radial-gradient(ellipse at center,rgba(0,0,0,0) 50%,rgba(255,60,30,.30) 100%);box-shadow:inset 0 0 120px rgba(255,60,30,.35)}
.gk5-ed.alm.on{opacity:1;animation:gk5p 1.3s ease-in-out infinite}
@keyframes gk5p{0%,100%{opacity:.55}50%{opacity:1}}
.gk5-sk{position:absolute;left:50%;top:var(--gk5SkipTop,10px);left:var(--gk5SkipLeft,calc(50% + 120px));pointer-events:auto;display:none;cursor:pointer;white-space:nowrap;padding:3px 12px;font:600 12px var(--ui,system-ui);letter-spacing:.14em;text-transform:uppercase;color:var(--mut,#a9a493);background:rgba(10,8,8,.7);border:1px dashed rgba(245,196,81,.4)}
.gk5-sk.on{display:block}.gk5-sk:hover{color:#1a1104;background:var(--gold,#f5c451);border-style:solid}
@media (prefers-reduced-motion:reduce){.gk5-ed.alm.on{animation:none}.gk5-bn,.gk5-rm{transition:opacity .2s}}
`;

  // ---------------------------------------------------------------- the HUD object
  function createHud5(cfg) {
    cfg = cfg || {};
    const rootEl = cfg.root || document.body, clock = cfg.clock || (() => Date.now());
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = document.createElement('div'); el.className = 'gk5';
    el.innerHTML =
      '<div class="gk5-ed sud"></div><div class="gk5-ed alm"></div>' +
      '<div class="gk5-arc"><svg viewBox="0 0 148 44" width="148" height="44"><path class="trk" pathLength="100"/><path class="win" pathLength="100"/><path class="bar" pathLength="100"/><g class="ticks"></g><circle class="ndl" r="4.6" cx="-20" cy="-20"/></svg><div class="lb"></div></div>' +
      '<div class="gk5-bn"></div><div class="gk5-rm"><div class="n"></div><div class="f"></div></div>' +
      '<div class="gk5-cr"></div><div class="gk5-sk" role="button" tabindex="-1">Skip to 0:10</div>';
    rootEl.appendChild(el);
    const $ = s => el.querySelector(s);
    const arcEl = $('.gk5-arc'), trk = arcEl.querySelector('.trk'), bar = arcEl.querySelector('.bar'), win = arcEl.querySelector('.win'), ndl = arcEl.querySelector('.ndl'), tks = arcEl.querySelector('.ticks'), lb = arcEl.querySelector('.lb');
    const bn = $('.gk5-bn'), rm = $('.gk5-rm'), crEl = $('.gk5-cr'), skip = $('.gk5-sk'), edS = $('.gk5-ed.sud'), edA = $('.gk5-ed.alm');
    // arc geometry: a shallow smile 132 wide; centre of the circle sits above it
    const D = 'M 8 6 A 120 120 0 0 0 140 6';
    for (const p of [trk, bar, win]) p.setAttribute('d', D);
    const pathLen = trk.getTotalLength ? trk.getTotalLength() : 134;
    const at = f => { try { return trk.getPointAtLength(Math.max(0, Math.min(1, f)) * pathLen); } catch (e) { return { x: 8 + 132 * f, y: 6 }; } };

    // ---- activity arc
    let act = null, raf = 0, flashT = 0;
    const timers = {};
    const later = (k, fn, ms) => { clearTimeout(timers[k]); if (cfg.hold && (k === 'bn' || k === 'rm')) return; timers[k] = setTimeout(fn, ms); };   // cfg.hold: banners stay up (preview only)
    const tri = x => { x = x - Math.floor(x); return x < .5 ? x * 2 : 2 - x * 2; };   // 0..1..0 ping-pong
    function arcFrame() {
      raf = 0; if (!act) return;
      const now = clock();
      if (act.kind === 'channel') {
        const f = act.ms > 0 ? Math.min(1, Math.max(0, (now - act.t0) / act.ms)) : 0;
        bar.style.strokeDasharray = (f * 100) + ' 100';
        if (act.ticks) { /* ticks are static; highlight passed ones */ const n = tks.children; for (let i = 0; i < n.length; i++) n[i].style.stroke = f >= act.ticks[i] ? '#ffe39a' : ''; }
      } else {
        const pos = tri((now - act.t0) / act.per), p = at(pos);
        ndl.setAttribute('cx', p.x.toFixed(1)); ndl.setAttribute('cy', p.y.toFixed(1));
      }
      raf = requestAnimationFrame(arcFrame);
    }
    function arcShow(a) {
      clearTimeout(timers.arcOff); flashT = 0; arcEl.classList.remove('hit', 'miss');
      act = a; arcEl.classList.add('on');
      lb.textContent = a.label || '';
      tks.innerHTML = '';
      if (a.kind === 'channel') {
        ndl.style.display = 'none'; win.style.strokeDasharray = '0 100'; bar.style.strokeDasharray = '0 100'; bar.style.display = '';
        if (a.ticks) for (const f of a.ticks) { const p = at(f); tks.insertAdjacentHTML('beforeend', '<line class="tk" x1="' + p.x.toFixed(1) + '" y1="' + (p.y - 6) + '" x2="' + p.x.toFixed(1) + '" y2="' + (p.y + 6) + '"/>'); }
      } else {
        bar.style.display = 'none'; ndl.style.display = ''; const wa = Math.max(0, a.wa), wb = Math.min(1, a.wb);
        win.style.strokeDasharray = '0 ' + (wa * 100) + ' ' + ((wb - wa) * 100) + ' 100';
      }
      if (!raf) raf = requestAnimationFrame(arcFrame);
    }
    function arcHide(delay) {
      act = null; later('arcOff', () => { arcEl.classList.remove('on', 'hit', 'miss'); }, delay || 0);
      cancelAnimationFrame(raf); raf = 0;
    }

    // ---- banners
    function showBanner(html, ms) {
      bn.innerHTML = html; bn.classList.add('on'); later('bn', () => bn.classList.remove('on'), ms || 3600);
    }
    const sideOf = vb => {   // {cell: type} -> [{side, type}] in N E S W order
      const o = []; for (const s of ['N', 'E', 'S', 'W']) if (vb && vb[VB_CELLS[s]]) o.push({ side: s, type: vb[VB_CELLS[s]] });
      return o;
    };
    const rekeyHtml = (title, vb) => '<b>' + title + '</b>' + sideOf(vb).map(e => '<span style="color:' + INFO[e.type][1] + '">' + esc(SHORT[e.type]) + ' ' + SIDE_NAME[e.side] + '</span>').join(' ');

    // ---- round state: 15 s warning + round start banner
    let round = -1, endAt = 0, curVb = null, nextVb = null, warned = -1, sudden = false;
    function roundState(rs) {
      if (!rs) return;
      if (rs.vb) curVb = rs.vb; if ('vbNext' in rs) nextVb = rs.vbNext || null;
      const r = rs.round; if (r) {
        endAt = clock() + (r.left || 0);
        if (r.n !== round) {
          const first = round < 0; round = r.n;
          if (!first || (r.dur && r.left > r.dur - 8000)) { if (curVb && sideOf(curVb).length) showBanner(rekeyHtml('Vault re-keyed', curVb), 4200); }
        }
      }
      if (rs.sudden !== undefined) setSudden(!!rs.sudden);
      if (rs.crown !== undefined) crown(rs.crown);
      pollRound();
    }
    function pollRound() {
      if (!endAt || round < 0) return;
      const left = endAt - clock();
      if (left > 0 && left <= 15000 && warned !== round && nextVb && sideOf(nextVb).length) {
        warned = round; showBanner(rekeyHtml('Re-key in ' + Math.ceil(left / 1000) + 's', nextVb), 5200);
      }
    }
    const poll = setInterval(pollRound, 250);

    // ---- room banners
    let lastRm = '', lastRmT = 0;
    function enterRoom(key, type, opts) {
      const i = INFO[type]; if (!i) return false;
      const now = clock(); if (lastRm === key + type && now - lastRmT < 20000) return false;
      lastRm = key + type; lastRmT = now;
      rm.querySelector('.n').textContent = i[0]; rm.querySelector('.n').style.color = i[1];
      rm.querySelector('.f').textContent = (opts && opts.line) || i[2];
      rm.classList.add('on'); later('rm', () => rm.classList.remove('on'), 3800);
      return true;
    }
    function rekeyed(type) {   // you are standing in a room that re-keyed
      const i = INFO[type]; if (!i) return;
      lastRm = ''; enterRoom('rk', type, { line: 'This room has been re-keyed. ' + i[2] });
    }

    // ---- crown claim
    let sudCrown = false;
    function crown(c) {
      if (!c || !c.claims || !c.claims.length) { crEl.classList.remove('on'); setAlarm(false); return; }
      const top = c.claims.reduce((m, e) => Math.max(m, e.s), 1), me = cfg.getMe ? cfg.getMe() : null;
      crEl.innerHTML = '<h4>Crown claim</h4>' + c.claims.slice(0, 3).map(e =>
        '<div class="r' + (e.id === me ? ' me' : '') + (c.gaining === e.id ? ' live' : '') + '"><span>' + esc(e.name) + '</span><span class="bg"><i style="width:' + Math.round(e.s / top * 100) + '%"></i></span><span class="s">' + Math.floor(e.s) + 's</span></div>').join('');
      crEl.classList.add('on'); setAlarm(c.gaining != null || c.active === true);
    }
    function setAlarm(on) { edA.classList.toggle('on', !!on); }
    function setSudden(on) { sudden = !!on; edS.classList.toggle('on', sudden); }

    // ---- skip button
    skip.addEventListener('click', e => { e.preventDefault(); if (cfg.onSkip) cfg.onSkip(); });
    skip.addEventListener('mousedown', e => e.stopPropagation());

    // ---- public API
    const api = {
      el,
      // actMe: server `actMe` message (own state). Starts/stops the arc.
      me(m) {
        const ch = m && m.chan, tm = m && m.timing;
        if (tm) { const key = 't' + tm.a + ':' + tm.t0; if (!act || act.key !== key) arcShow({ kind: 'timing', key, t0: tm.t0, per: tm.per, wa: tm.wa, wb: tm.wb, label: tm.label || '' }); }
        else if (ch) { const key = 'c' + ch.a + ':' + ch.t0; if (!act || act.key !== key) arcShow({ kind: 'channel', key, t0: ch.t0, ms: ch.ms, label: ch.label || '', ticks: ch.ticks }); }
        else if (act) arcHide(0);
      },
      channel(o) { arcShow({ kind: 'channel', key: 'x' + o.t0, t0: o.t0, ms: o.ms, label: o.label || '', ticks: o.ticks }); },
      timing(o) { arcShow({ kind: 'timing', key: 'x' + o.t0, t0: o.t0, per: o.per, wa: o.wa, wb: o.wb, label: o.label || '' }); },
      stop() { arcHide(0); },
      // actFx{k:'hit'|'miss'} for your own press, or 'done'
      fx(m) {
        if (!m) return;
        if (m.k === 'hit' || m.k === 'miss') { arcEl.classList.remove('hit', 'miss'); void arcEl.offsetWidth; arcEl.classList.add(m.k); later('fl', () => arcEl.classList.remove('hit', 'miss'), 260); }
        else if (m.k === 'done') { arcEl.classList.add('hit'); bar.style.strokeDasharray = '100 100'; arcHide(260); }
        else if (m.k === 'rekey' && m.type) rekeyed(m.type);
      },
      roundState, enterRoom, rekeyed, crown, alarm: setAlarm, sudden: setSudden,
      banner(html, ms) { showBanner(html, ms); },
      debug(on) { skip.classList.toggle('on', !!on); },
      mapOps, drawMap,
      dispose() { clearInterval(poll); cancelAnimationFrame(raf); for (const k in timers) clearTimeout(timers[k]); el.remove(); st.remove(); }
    };
    if (cfg.debug) api.debug(true);
    return api;
  }

  const HUD5 = { createHud5, mapOps, drawMap, paintIcon, cellAt, ARENA, ATTACHED, INFO, VB_CELLS, TREE_CELLS, LIM, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = HUD5; else root.HUD5 = HUD5;
})(typeof window !== 'undefined' ? window : this);

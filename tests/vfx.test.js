// vfx.js: served and allowed by the CSP, pools respect the per-preset caps (hard cap 600), nothing is emitted before init, particles die, trails free their slot.
const L = require('./lib.js'), { assert, eq } = L;
const http = require('http');
const get = (port, p) => new Promise((res, rej) => http.get({ port, path: p, host: '127.0.0.1' }, r => { let b = ''; r.on('data', d => b += d); r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: b })); }).on('error', rej));
(async () => {
  // minimal THREE stub: only what vfx.js touches
  const T = {
    BufferAttribute: class { constructor(a, k) { this.array = a; this.itemSize = k; } setUsage() { return this; } },
    BufferGeometry: class { constructor() { this.attributes = {}; } setAttribute(n, a) { this.attributes[n] = a; } setIndex() {} },
    ShaderMaterial: class { constructor(o) { Object.assign(this, o); } },
    Points: class { constructor(g, m) { this.geometry = g; this.material = m; this.visible = true; } },
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.visible = true; } },
    DynamicDrawUsage: 1, NormalBlending: 1, DoubleSide: 2,
  };
  const scene = { added: [], add(o) { this.added.push(o); } }, cam = { fov: 75 }, rend = { domElement: { height: 720 } };
  global.window = global; let lvl = 'high';
  require('../vfx.js'); const V = global.GKVFX;
  const pos = { x: 0, y: 1, z: 0 };
  const fail = await L.run('vfx', [
    ['no-ops before init, never throws', async () => { V.spark(pos, 'metal'); V.hit(pos, { x: 1, z: 0 }, 'sword', 'plate', 30); V.trail(1, pos, pos, 1); V.update(0.016); eq(V.ready, false); }],
    ['init builds two pools and is idempotent', async () => { V.init(T, scene, cam, rend, () => lvl); V.init(T, scene, cam, rend, () => lvl); eq(V.ready, true); eq(scene.added.length, 2); }],
    ['a hit emits particles and they all die', async () => {
      V.hit(pos, { x: 1, z: 0 }, 'sword', 'plate', 30); assert(V.stats().live > 8, 'sparks emitted'); assert(V.stats().draws <= 2);
      for (let i = 0; i < 80; i++) V.update(0.02); eq(V.stats().live, 0, 'all particles expired');
    }],
    ['caps per preset: low <= 60, ultra <= 600, never more', async () => {
      const caps = {}; for (const l of ['low', 'medium', 'high', 'ultra']) { lvl = l; for (let i = 0; i < 60; i++) { V.hit(pos, { x: 1, z: 0 }, 'axe', 'cloth', 90); V.glint(pos, 0xffd75e, 20); V.land(0, 0, 'dust'); } caps[l] = V.stats().live; assert(caps[l] <= V.stats().cap, l + ' within cap'); for (let i = 0; i < 100; i++) V.update(0.05); }
      assert(caps.low <= 60, 'low ' + caps.low); assert(caps.ultra <= 600, 'ultra ' + caps.ultra); assert(caps.low < caps.medium && caps.medium <= caps.high && caps.high <= caps.ultra, JSON.stringify(caps));
    }],
    ['Low emits no puffs, glints, rings or trails', async () => {
      lvl = 'low'; for (let i = 0; i < 20; i++) { V.glint(pos, 1, 10); V.ring(0, 0, 1, 1); V.land(0, 0, 'dust'); V.dissolve(0, 0, 1, 1); V.trail('a', pos, pos, 1); V.update(0.016); }
      eq(V.stats().live, 0); eq(V.stats().draws, 0);
    }],
    ['a trail takes a slot and frees it after the fade', async () => {
      lvl = 'high'; for (let i = 0; i < 6; i++) { V.trail('t', { x: i, y: 1, z: 0 }, { x: i, y: 0.8, z: 0 }, 0xffffff); V.update(0.016); }
      assert(V.stats().draws >= 1, 'ribbon drawn'); for (let i = 0; i < 30; i++) V.update(0.016); eq(V.stats().draws, 0, 'ribbon hidden again');
    }],
    ['foot puffs need speed, a foot plant and be near the camera', async () => {
      lvl = 'high'; V.foot('p', 0.1, 4, 0, 0, 0, 'dust', 1, 0, 0); V.foot('p', 3.3, 4, 0, 0, 0, 'dust', 1, 0, 0); assert(V.stats().live > 0, 'stepped');
      for (let i = 0; i < 80; i++) V.update(0.05); V.foot('q', 0.1, 4, 50, 0, 0, 'dust', 1, 0, 0); V.foot('q', 3.3, 4, 50, 0, 0, 'dust', 1, 0, 0); eq(V.stats().live, 0, 'far steps skipped');
    }],
    ['the server serves vfx.js and the page loads it before game.js under the CSP', async () => {
      const s = await L.startServer({});
      try {
        const r = await get(s.port, '/vfx.js'); eq(r.status, 200); assert(/javascript/.test(r.headers['content-type']), 'js type'); assert(r.body.includes('GKVFX'));
        const p = await get(s.port, '/'); assert(p.body.indexOf('/vfx.js') > 0 && p.body.indexOf('/vfx.js') < p.body.indexOf('type="module"'), 'script tag before the module');
        assert(/script-src 'self'/.test(p.headers['content-security-policy']), 'CSP allows same-origin scripts');
      } finally { s.stop(); }
    }],
  ]);
  process.exit(fail ? 1 : 0);
})();

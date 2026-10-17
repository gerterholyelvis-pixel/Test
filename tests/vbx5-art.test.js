// VBX art (rooms5art-vault.js EXTRAS): every skin builds its four extra stations headless (a stub 2D canvas, no GL), the setters act5ui.js driveX calls exist and run,
// the station footprints are the shared XSPOTS (= world.js VB_SOLIDS / ACT_LOCAL.vb), the props stay inside the room, and each skin stays within 30 meshes beyond the shell.
const L = require('./lib.js'), { assert, eq } = L, path = require('path'), { pathToFileURL } = require('url'), W = require('../world.js');
const SET = { ram: ['setHeads', 'setWear', 'setPlanks', 'setCrate', 'setChant', 'setForging', 'setClimbing', 'setSawing'], locksmith: ['setFelt', 'setSafe', 'setShift'], counting: ['setLot', 'setRush', 'setNotes', 'setLedger'], keystone: ['setRite', 'setNode', 'setSurge', 'setOffering'] };
const noop = () => {};
const g2d = new Proxy({}, { get: (t, k) => k === 'createImageData' ? (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : typeof k === 'string' ? noop : undefined, set: () => true });
(async () => {
  let THREE, M;
  try {
    THREE = await import(pathToFileURL(path.join(path.dirname(require.resolve('three')), 'three.module.js')).href);
    global.document = global.document || { createElement: () => ({ width: 1, height: 1, getContext: () => g2d, style: {} }) };
    M = await import(pathToFileURL(path.join(L.ROOT, 'rooms5art-vault.js')).href);
  } catch (e) { console.log('  skip  vbx5-art: three is not installed here (' + e.message.split('\n')[0] + ')'); process.exit(0); }
  const room = M.buildVaultbreaker(THREE, {}, 'ram', {});
  const shell = () => { let n = 0; for (const o of room.group.children) if (!/^skin:/.test(o.name)) o.traverse(q => { if ((q.isMesh || q.isSprite) && q.visible && (!q.parent || q.parent.visible)) n++; }); return n; };
  const fail = await L.run('vbx5-art', [
    ['footprints: the art XSPOTS are the server stations (world.js ACT_LOCAL.vb S1..S4 and the extra VB_SOLIDS)', () => {
      for (const s of M.XSPOTS) { const a = W.ACT_LOCAL.vb[s.id]; eq([a[0], a[1]], [s.x, s.z], s.id); assert(W.VB_SOLIDS.some(q => q[0] === s.x && q[1] === s.z && q[2] === 0.65), 'solid ' + s.id); }
      eq(M.vaultbreakerSolids().filter(s => /^S/.test(s.id)).length, 4);
    }],
    ...M.TYPES.map(t => [t + ': the extra stations build, every driveX setter runs, the props stay in the room, <= 30 meshes beyond the shell', () => {
      const sk = room.setSkin(t, { flash: false }); for (const f of SET[t]) assert(typeof sk[f] === 'function', 'setter ' + f);
      for (const s of M.XSPOTS) assert(room.anchorsOf(t)[s.id], 'anchor ' + s.id);
      for (let i = 0; i < 20; i++) room.update(1 / 30, i / 30);
      const all = { ram: () => { sk.setHeads(2); sk.setWear(3); sk.setPlanks(3); sk.setCrate(true); sk.setChant(5); sk.setForging(true); sk.setClimbing(true); sk.setSawing(true); }, locksmith: () => { sk.setFelt(true); sk.setSafe([1, 5, 3], true); sk.setShift(true); },
        counting: () => { sk.setLot('w:sword', 90); sk.setRush(true); sk.setNotes(8); sk.setLedger(true); }, keystone: () => { sk.setRite([3, 1, 0, 2], 0, true); sk.setNode(1, true); sk.setSurge(true); sk.setOffering(true); } }[t];
      all(); for (let i = 0; i < 40; i++) room.update(1 / 30, 1 + i / 30);
      const total = room.stats().drawCalls, beyond = total - shell(); assert(beyond <= 30, t + ': ' + beyond + ' meshes beyond the shell (total ' + total + ')');
      const box = new THREE.Box3().setFromObject(room.skins[t].group); assert(box.min.x > -11.3 && box.max.x < 11.3 && box.min.z > -7.7 && box.max.z < 7.7 && box.max.y <= 6.6, 'inside the room: ' + JSON.stringify([box.min, box.max]));
      console.log('         ' + t + ': ' + total + ' visible meshes, ' + beyond + ' beyond the shell');
    }]),
  ]);
  process.exit(fail ? 1 : 0);
})();

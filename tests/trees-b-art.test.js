// Tree room art, types 6-10 (rooms5art-trees-b.js): builds headless (no GL), every plan anchor and state setter exists, solids match the tree anchors, draw calls stay in budget
const L = require('./lib.js'), { assert, eq } = L, path = require('path'), { pathToFileURL } = require('url');
const ANCH = ['C', 'trunk', 'ring', 'NE', 'NW', 'SE', 'SW'];
const NEED = {
  thorn: { anchors: ['grip', 'bowl'], setters: ['setGrip', 'setBowl'] },
  gambler: { anchors: ['hollow', 'stump', 'knot1', 'knot5', 'gourd1', 'gourd5'], setters: ['setStep', 'setGourds', 'setMouth'] },
  memory: { anchors: ['lantern1', 'lantern2', 'lantern3', 'lantern4'], setters: ['setLantern', 'setAllLanterns', 'setTrunkGlow'] },
  hollow: { anchors: ['nook', 'eye'], setters: ['setWarden'] },
  elder: { anchors: ['seed', 'stone1', 'stone2', 'stone3'], setters: ['setStone', 'setWake', 'setSeed', 'setWithered'] },
};
(async () => {
  let THREE, mod;
  try { THREE = await import(pathToFileURL(path.join(path.dirname(require.resolve('three')), 'three.module.js')).href); mod = await import(pathToFileURL(path.join(L.ROOT, 'rooms5art-trees-b.js')).href); } catch (e) { console.log('  skip  trees-b-art: three is not installed here (' + e.message.split('\n')[0] + ')'); process.exit(0); }
  const fail = await L.run('trees-b-art', Object.keys(NEED).map(type => [type + ': builds, anchors, solids, setters, budget', () => {
    const g = mod.buildTreeRoom(THREE, {}, type, { seed: 3 }), api = g.userData.api;
    for (const a of ANCH.concat(NEED[type].anchors)) assert(api.anchors[a] && api.anchors[a].position, 'anchor ' + a);
    eq(api.solids.map(s => s.id).sort(), ['C', 'NE', 'NW', 'SE', 'SW'], 'solid ids'); for (const s of api.solids) eq(s.r, s.id === 'C' ? 1.1 : 0.7, 'solid radius ' + s.id);
    for (const s of api.solids) assert(Math.abs(Math.abs(s.x) - (s.id === 'C' ? 0 : 4.2)) < 1e-9 && Math.abs(Math.abs(s.z) - (s.id === 'C' ? 0 : 4.2)) < 1e-9, 'solid position ' + s.id);
    for (const f of NEED[type].setters.concat(['update', 'dispose', 'setVeins', 'setLeaves'])) assert(typeof api[f] === 'function', 'setter ' + f);
    assert(api.drawCalls() <= 25, 'draw calls ' + api.drawCalls());
    let verts = 0; g.traverse(o => { if (o.isMesh) verts += o.geometry.attributes.position.count; }); assert(verts < 60000, 'vertex budget ' + verts);
    // every setter runs at its ends without throwing, and the group stays inside the 15 m cell
    api.update(1, 0.016); api.setVeins(1); api.setLeaves(1);
    if (type === 'thorn') { api.setGrip(3); api.setGrip(0); api.setBowl(3); api.setBowl(0); }
    if (type === 'gambler') { api.setStep(5); api.setGourds(5); api.setMouth(1); api.update(2, 0.016); api.setStep(0); api.setGourds(0); api.setMouth(0); }
    if (type === 'memory') { for (let i = 0; i < 4; i++) api.setLantern(i, 1); api.setAllLanterns(0); api.setTrunkGlow(1); }
    if (type === 'hollow') { api.setWarden(1); api.update(2, 0.016); api.setWarden(0); }
    if (type === 'elder') { for (let i = 0; i < 3; i++) api.setStone(i, 0.5); api.setWake(1); api.setSeed(true); api.update(2, 0.016); api.setWithered(true); }
    const box = new THREE.Box3().setFromObject(g); assert(box.min.x > -7.6 && box.max.x < 7.6 && box.min.z > -7.6 && box.max.z < 7.6, 'inside the 15 m cell: ' + JSON.stringify([box.min.x, box.max.x, box.min.z, box.max.z]));
    api.dispose();
  }]).concat([['aliases and unknown types', () => { assert(mod.buildTreeRoom(THREE, {}, 'Thorn Shrine') && mod.buildTreeRoom(THREE, {}, 'hollow_oak'), 'aliases'); eq(mod.buildTreeRoom(THREE, {}, 'well'), null, 'types 1-5 are not built here'); }]]));
  process.exit(fail ? 1 : 0);
})();

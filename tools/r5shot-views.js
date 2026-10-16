const S = 'docs/screens/';
module.exports = async c => {
  const PI = Math.PI, rc = k => c.ev(`JSON.stringify(GKWORLD.roomRect(${JSON.stringify(k)}))`).then(JSON.parse);
  const r = {}; for (const k of ['0', '6', '8', '16', '18', '7', '11', '13', '17', 'c0']) r[k] = await rc(k);
  const dir = yaw => [Math.round(-Math.sin(yaw)), Math.round(-Math.cos(yaw))];
  // homes
  const h = r['c0'];
  await c.tp(h.cx, h.cz + 3.4, 0, -0.05); await c.shot(S + 'c-home-back.jpg');
  await c.tp(h.cx - 1, h.cz + 1.5, -PI / 2 + 0.2, -0.05); await c.shot(S + 'c-home-pump.jpg');
  await c.tp(h.cx, h.cz - 2.8, PI, 0); await c.shot(S + 'c-home-door.jpg');
  await c.tp(r['0'].cx, r['0'].cz - 4, 0, 0.42); await c.shot(S + 'c-home-sign-outside.jpg');
  // trees
  for (const n of ['6', '8', '16', '18']) { const t = await c.ev(`GK.r5.treeMap()[${n}]`); await c.tp(r[n].cx, r[n].cz + 6.3, 0, 0.05); await c.shot(S + 'c-tree-' + n + '-' + t + '.jpg'); }
  // vaultbreakers: 4 m from the centre on the vault side, looking at the far wall with the banner and the station
  for (const [n, yaw] of [['7', 0], ['17', PI], ['11', PI / 2], ['13', -PI / 2]]) {
    const sk = await c.ev(`GK.r5.vbNow()[${n}]`), [dx, dz] = dir(yaw);
    await c.tp(r[n].cx - dx * 4, r[n].cz - dz * 4, yaw, 0.0); await c.shot(S + 'c-vb-' + n + '-' + sk + '.jpg');
  }
  await c.tp(r['7'].cx + 3, r['7'].cz, PI / 2 + PI, 0); await c.shot(S + 'c-vb-7-side.jpg');
  // server state: re-key with the flash, breach cracks on the vault door
  await c.ev(`GK.r5.onMsg({ vb: { 7: 'ram', 11: 'keystone', 13: 'locksmith', 17: 'counting' }, breach: { 7: 90, 11: 60, 13: 20, 17: 0 } })`);
  await c.tp(r['7'].cx, r['7'].cz + 5, 0, 0.0); await c.wait(250); await c.shot(S + 'c-vb-7-rekey.jpg');
  await c.wait(1500); await c.tp(r['7'].cx, r['7'].cz + 3.4, PI, 0.05); await c.shot(S + 'c-vb-7-cracks.jpg');
  // the vault: default treasury, then a claim with the alarm and a full treasury
  await c.tp(0, 8, 0, -0.1); await c.wait(400); await c.shot(S + 'c-vault-north.jpg');
  await c.ev(`GK.r5.onMsg({ treasury: 1, crown: { id: 1, p: 0.6, name: 'x', ms: 20000 }, alarm: true, bars: { N: true } })`);
  await c.tp(0, 6, 0, -0.1); await c.wait(600); await c.shot(S + 'c-vault-alarm-claim.jpg');
  await c.tp(-6, -3, PI * 0.6, -0.2); await c.wait(300); await c.shot(S + 'c-vault-heaps.jpg');
  console.log(JSON.stringify(await c.info()));
};

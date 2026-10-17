// Scenario for tools/r5shot.js: look at the first wall piece of hall 0 from 4 m, a little upward (is the banner there?). Saves $OUT/halls-banner.jpg.
const OUT = process.env.OUT || 'docs/screens/';
module.exports = async c => {
  const p = JSON.parse(await c.ev(`JSON.stringify(GKWORLD.hallPieces(+process_cell).filter(q => GKWORLD.HP[q.h][2] === 'wall')[0])`.replace('+process_cell', '0')));
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), ax = p.x + fx * 4.5, az = p.z + fz * 4.5;
  await c.tp(ax, az, Math.atan2(-(p.x - ax), -(p.z - az)), 0.22); await c.wait(600); await c.shot(OUT + 'halls-banner.jpg');
  console.log('piece', p.h, p.x.toFixed(1), p.z.toFixed(1), 'yaw', p.yaw.toFixed(2));
};

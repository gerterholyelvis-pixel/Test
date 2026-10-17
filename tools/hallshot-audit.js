// Scenario for tools/r5shot.js (offline demo): one screenshot per attached-room type into $OUT (default docs/screens/audit-*.jpg), to see which rooms are bare. Prints each room's type.
const OUT = process.env.OUT || 'docs/screens/';
module.exports = async c => {
  const lay = JSON.parse(await c.ev(`JSON.stringify(GK.layout || [])`));
  const seen = {};
  for (let id = 0; id < lay.length; id++) {
    const t = lay[id]; if (seen[t]) continue; seen[t] = id;
    const r = JSON.parse(await c.ev(`JSON.stringify(GKWORLD.roomRect('c${id}'))`)), ch = JSON.parse(await c.ev(`JSON.stringify(GKWORLD.CHEST[${id}])`));
    const bx = r.cx - ch.dx * 2.6, bz = r.cz - ch.dz * 2.6;   // stand just inside the door, look into the room
    await c.tp(bx, bz, Math.atan2(-ch.dx, -ch.dz), -0.05); await c.wait(700); await c.shot(OUT + 'audit-' + t + '.jpg'); console.log('room c' + id, t);
  }
};

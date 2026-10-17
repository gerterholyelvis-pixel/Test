// Scenario for tools/r5shot.js (offline demo): walk to a container, hold E, check the progress bar and the loot toast, then screenshot (docs/screens/halls-search.jpg).
const S = 'docs/screens/';
module.exports = async c => {
  const sp = JSON.parse(await c.ev(`JSON.stringify(GKWORLD.hallSpots(0).find(s => s.kind === 'rack'))`));
  const yaw = Math.atan2(-(sp.x - sp.sx), -(sp.z - sp.sz));
  await c.tp(sp.sx, sp.sz, yaw, -0.25); await c.wait(500);
  console.log('prompt before:', await c.ev(`GKHALL.prompt()`));
  await c.ev(`(window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' })), 1)`); await c.wait(900);
  console.log('searching:', await c.ev(`JSON.stringify(GKHALL.me())`)); await c.shot(S + 'halls-search.jpg');
  await c.wait(2400); await c.ev(`(window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' })), 1)`); await c.wait(300);
  console.log('toast:', await c.ev(`(document.querySelector('#gkToast, .gkToast, [id*=oast]') || {}).textContent`), 'me after:', await c.ev(`JSON.stringify(GKHALL.me())`));
  console.log('prompt after:', await c.ev(`GKHALL.prompt()`));
  await c.shot(S + 'halls-loot.jpg');
};

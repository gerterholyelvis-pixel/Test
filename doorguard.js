// DOORGUARD: nobody stays locked in. Pure helpers used by server.js (and tested in tests/doorguard.test.js).
// Guarantee: every occupied room except THE VAULT always has an open door towards a non-vault neighbour, or gets one after TRAP_MS (the lock "gives way").
// The vault keeps its rule (vault doors need 2 votes); its occupants chose to be there.
const TRAP_MS = 5000;      // how long a room may have no way out before one door unlocks
const STUCK_MS = 1500;     // how long a goblin may stand inside a prop before the server pushes him out

const isExit = (d, vault) => !vault.includes(d);
function trapped(room, open, roomDoors, vault) {   // true when 'room' has doors but none of them is open and leads to a non-vault neighbour
  if (room === '4') return false;
  const ds = roomDoors[room]; if (!ds || !ds.length) return false;
  return !ds.some(d => isExit(d, vault) && open.includes(d));
}
// which door to unlock: the one the room voted for (if usable), otherwise a random non-vault door of the room
function pickExit(room, sel, roomDoors, vault, rnd = Math.random) {
  const ds = (roomDoors[room] || []).filter(d => isExit(d, vault)); if (!ds.length) return -1;
  const v = sel && sel[room]; if (v != null && ds.includes(v)) return v;
  return ds[Math.floor(rnd() * ds.length)];
}
// Nearest free spot around (x, z); free(x, z) says whether a spot is free and inside the room.
function freeSpot(x, z, free) {
  for (let r = 0.25; r <= 4.5; r += 0.25) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r; if (free(qx, qz)) return [qx, qz]; }
  return null;
}
module.exports = { TRAP_MS, STUCK_MS, trapped, pickExit, freeSpot };

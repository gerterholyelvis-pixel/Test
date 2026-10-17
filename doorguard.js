// DOORGUARD: nobody stays locked in. Pure helpers used by server.js (and tested in tests/doorguard.test.js).
// Guarantee: every occupied room except THE VAULT and the homes always has an open door towards a non-vault neighbour, or gets one after TRAP_MS (the lock "gives way").
// The vault keeps its rule (vault doors need 2 votes); its occupants chose to be there. A home's doorway (hatch) is always open, so the trap check moves to the arena cell outside
// (server.js counts a goblin at home as an occupant of that cell). A hatch never counts as an exit: a hall whose only open way is the hatch back home is trapped.
const WORLD = require('./world.js');
const TRAP_MS = 5000;      // how long a room may have no way out before one door unlocks
const STUCK_MS = 1500;     // how long a goblin may stand inside a prop before the server pushes him out
const has = (s, v) => !!s && (typeof s === 'function' ? s(v) : s.has ? s.has(v) : s.includes(v));
// o (optional): { vaultKey (default WORLD.VAULT_KEY), skip (Set / array / fn of rooms never trapped; default: the vault and every home), hatch (Set / array / fn of hatch door ids; default WORLD.HATCHES) }
const opts = o => ({ vaultKey: (o && o.vaultKey) || WORLD.VAULT_KEY, skip: o && o.skip, hatch: (o && o.hatch) || WORLD.HATCHES });
// room (optional): the room the exit is for. A loot door is no way out of an arena room (the loot room behind it is a dead end); for the loot room itself it is its only door.
const isExit = (d, vault, o, room) => !has(vault, d) && !has(opts(o).hatch, d) && !(room != null && String(room)[0] !== 'c' && WORLD.DOORS[d] && WORLD.DOORS[d].kind === 'loot');
const homeKey = k => typeof k === 'string' && k[0] === 'c' && !!WORLD.CHEST[+k.slice(1)] && WORLD.CHEST[+k.slice(1)].home;
// open: an array of open door ids or a function id -> bool
function trapped(room, open, roomDoors, vault, o) {   // true when 'room' has doors but none of them is open and leads to a non-vault neighbour
  const q = opts(o);
  if (room === q.vaultKey || (q.skip ? has(q.skip, room) : homeKey(room))) return false;
  const ds = roomDoors[room]; if (!ds || !ds.length) return false;
  return !ds.some(d => isExit(d, vault, o, room) &&(typeof open === 'function' ? open(d) : open.includes(d)));
}
// which door to unlock: the one the room voted for (if usable), otherwise a random non-vault, non-hatch door of the room (of an arena room: never a loot door)
function pickExit(room, sel, roomDoors, vault, rnd = Math.random, o) {
  const ds = (roomDoors[room] || []).filter(d => isExit(d, vault, o, room)); if (!ds.length) return -1;
  const v = sel && sel[room]; if (v != null && ds.includes(v)) return v;
  return ds[Math.floor(rnd() * ds.length)];
}
// Nearest free spot around (x, z); free(x, z) says whether a spot is free and inside the room.
function freeSpot(x, z, free) {
  for (let r = 0.25; r <= 4.5; r += 0.25) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, qx = x + Math.cos(a) * r, qz = z + Math.sin(a) * r; if (free(qx, qz)) return [qx, qz]; }
  return null;
}
module.exports = { TRAP_MS, STUCK_MS, trapped, pickExit, freeSpot, isExit };

#!/usr/bin/env node
// RESEARCH (docs/RESEARCH-perf.md): what a binary snapshot would save against today's JSON text snapshot. Standalone, no game file is touched.
// Today (server.js snapshots()): '{"s":[t,id,x,z,yaw,jump,age,...]}' with x/z at 0.01 m, yaw at 0.001 rad, formatted once per mover per tick and joined per receiver.
// Binary candidate: u8 type, u32 t, then per mover u8 id, i16 x (cm), i16 z (cm), u16 yaw (2^16 per turn), u8 jump, u8 age = 9 bytes (plus 5 header).
//   node tools/research/snapcodec.js [--movers 8] [--receivers 8] [--iters 20000]
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : +process.argv[i + 1]; };
const M = arg('movers', 8), R = arg('receivers', 8), N = arg('iters', 20000);
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const movers = Array.from({ length: M }, (_, i) => ({ id: 100 + i * 7, x: (rnd() - 0.5) * 90, z: (rnd() - 0.5) * 90, yaw: (rnd() - 0.5) * 40, jy: rnd() < 0.1 ? 30 : 0, age: Math.floor(rnd() * 60) }));
const step = () => { for (const p of movers) { p.x += (rnd() - 0.5) * 0.4; p.z += (rnd() - 0.5) * 0.4; p.yaw += (rnd() - 0.5) * 0.2; p.age = Math.floor(rnd() * 60); } };
function jsonSnap(t) {   // same shape and rounding as server.js: one string per mover per tick, then one join per receiver (all movers but himself)
  const f = movers.map(p => p.id + ',' + r2(p.x) + ',' + r2(p.z) + ',' + r3(p.yaw) + ',' + p.jy + ',' + p.age); let bytes = 0;
  for (let r = 0; r < R; r++) { let s = '{"s":[' + t; for (let i = 0; i < M; i++) if (i !== r) s += ',' + f[i]; s += ']}'; bytes += Buffer.byteLength(s); }
  return bytes;
}
const TAU = Math.PI * 2, buf = Buffer.allocUnsafe(5 + 9 * M), body = Buffer.allocUnsafe(9 * M);
function binSnap(t) {   // movers encoded once into one buffer; each receiver's message = header + all movers except himself (a slice copy, no per-receiver encode)
  for (let i = 0; i < M; i++) { const p = movers[i], o = i * 9; body.writeUInt8(p.id & 255, o); body.writeInt16LE(Math.round(p.x * 100), o + 1); body.writeInt16LE(Math.round(p.z * 100), o + 3);
    body.writeUInt16LE(Math.round(((p.yaw % TAU) + TAU) % TAU / TAU * 65535), o + 5); body.writeUInt8(p.jy, o + 7); body.writeUInt8(Math.min(255, p.age), o + 8); }
  let bytes = 0;
  for (let r = 0; r < R; r++) { buf.writeUInt8(1, 0); buf.writeUInt32LE(t >>> 0, 1); let o = 5; for (let i = 0; i < M; i++) if (i !== r) { body.copy(buf, o, i * 9, i * 9 + 9); o += 9; } bytes += o; }
  return bytes;
}
function bench(fn) { let b = 0; const t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) { step(); b += fn(123456 + i * 50); } const ms = Number(process.hrtime.bigint() - t0) / 1e6; return { bytesPerTick: b / N, usPerTick: ms * 1000 / N }; }
// decode cost on the client side for comparison
function jsonDecode(s) { const a = JSON.parse(s).s; let x = 0; for (let i = 1; i < a.length; i += 6) x += a[i + 1]; return x; }
function binDecode(b) { const v = new DataView(b.buffer, b.byteOffset, b.byteLength); let x = 0; for (let o = 5; o < b.byteLength; o += 9) x += v.getInt16(o + 1, true) / 100; return x; }
bench(jsonSnap); bench(binSnap);   // warm-up
const J = bench(jsonSnap), B = bench(binSnap);
const sample = (() => { const f = movers.slice(1).map(p => p.id + ',' + r2(p.x) + ',' + r2(p.z) + ',' + r3(p.yaw) + ',' + p.jy + ',' + p.age); return '{"s":[123456,' + f.join(',') + ']}'; })();
const sb = Buffer.from(buf.subarray(0, 5 + 9 * (M - 1)));
let t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) jsonDecode(sample); const jd = Number(process.hrtime.bigint() - t0) / N;
t0 = process.hrtime.bigint(); for (let i = 0; i < N; i++) binDecode(sb); const bd = Number(process.hrtime.bigint() - t0) / N;
const WSH = 2, TCPIP = 52;   // ws frame header (server -> client, payload < 126 B) and a typical IPv4 + TCP header with timestamps
const per = (x, msgs) => ({ payloadKBs: +(x * 20 / R / 1024).toFixed(2), wireKBs: +((x + msgs * (WSH + TCPIP)) * 20 / R / 1024).toFixed(2) });
console.log(JSON.stringify({ movers: M, receivers: R, sampleJsonBytes: Buffer.byteLength(sample), sampleBinBytes: sb.length,
  json: { ...per(J.bytesPerTick, R), encodeUsPerTick: +J.usPerTick.toFixed(2), decodeUs: +(jd / 1000).toFixed(2) },
  binary: { ...per(B.bytesPerTick, R), encodeUsPerTick: +B.usPerTick.toFixed(2), decodeUs: +(bd / 1000).toFixed(2) } }, null, 1));
console.log('per client at 20 Hz, all 8 near (worst case). wireKBs adds one ws + TCP/IP header per message (no coalescing).');

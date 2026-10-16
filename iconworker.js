// Icon bake worker (T7). Takes the two raw render-target read-backs from itemart.js (float colour over black + 8-bit coverage mask) and does
// the per-pixel tone map + sRGB encode, the tier glow and the downscale to the final icon, off the main thread. Returns an ImageBitmap (for
// the game) and a PNG blob (for the IndexedDB cache) and hands the big buffers back so the main thread can reuse them (no per-icon garbage).
// The maths is a copy of the main-thread path in itemart.js (the fallback), so both give the same pixels.
let LUT = null, LUT_EXPO = 0;
const S = 512, N = 12 * 512;   // lookup table: 0..12 in 1/512 steps, linear interpolation
function enc(v, expo) { v = Math.max(0, v * expo); v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14); v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
function lut(expo) { if (LUT && LUT_EXPO === expo) return LUT; LUT = new Float32Array(N + 2); LUT_EXPO = expo; for (let k = 0; k < LUT.length; k++) LUT[k] = enc(k / S, expo) * 255; return LUT; }

self.onmessage = async e => {
  const m = e.data, RTS = m.rts, ICON = m.icon, bufC = new Float32Array(m.c), bufM = new Uint8Array(m.m);
  try {
    const L = lut(m.expo), encF = v => { const f = v * S; if (!(f < N)) return L[N]; const k = f | 0, r = f - k; return L[k] + (L[k + 1] - L[k]) * r; };
    const tmp = new OffscreenCanvas(RTS, RTS), tctx = tmp.getContext('2d'), id = tctx.createImageData(RTS, RTS), d = id.data;
    for (let y = 0; y < RTS; y++) for (let x = 0; x < RTS; x++) {
      const si = ((RTS - 1 - y) * RTS + x) * 4, di = (y * RTS + x) * 4, a = bufM[si] / 255;
      if (a < 0.004) { d[di + 3] = 0; continue; }
      const ia = 1 / a; d[di] = encF(bufC[si] * ia); d[di + 1] = encF(bufC[si + 1] * ia); d[di + 2] = encF(bufC[si + 2] * ia); d[di + 3] = a * 255;
    }
    tctx.putImageData(id, 0, 0);
    const out = new OffscreenCanvas(ICON, ICON), o2 = out.getContext('2d'); o2.imageSmoothingQuality = 'high';
    if (m.glow) {
      const hex = '#' + m.glow.toString(16).padStart(6, '0'), gr = o2.createRadialGradient(ICON / 2, ICON / 2, 0, ICON / 2, ICON / 2, ICON * 0.5);
      gr.addColorStop(0, hex + Math.round(m.glowA * 255).toString(16).padStart(2, '0')); gr.addColorStop(0.6, hex + '22'); gr.addColorStop(1, hex + '00'); o2.fillStyle = gr; o2.fillRect(0, 0, ICON, ICON);
    }
    o2.drawImage(tmp, 0, 0, ICON, ICON);
    const blob = await out.convertToBlob({ type: 'image/png' }), bmp = await createImageBitmap(out);
    self.postMessage({ id: m.id, key: m.key, bmp, blob, c: m.c, m: m.m }, [bmp, m.c, m.m]);
  } catch (err) {
    self.postMessage({ id: m.id, key: m.key, error: String(err), c: m.c, m: m.m }, [m.c, m.m]);
  }
};

// Procedural item icons (browser). GKICONS.canvas(key, size) -> <canvas>; GKICONS.draw(ctx, key, x, y, size) draws into a box.
(function () {
  const steel = '#b8c2cc', dark = '#4a5058', wood = '#7a5230', gold = '#f0c040', leather = '#6b4a2f';
  const DRAW = {
    'w:dagger': g => { blade(g, 0.18, 0.62, steel); hilt(g, 0.62, 0.3, leather); },
    'w:sword': g => { blade(g, 0.24, 0.66, '#9aa3ab'); hilt(g, 0.66, 0.48, leather); g.fillStyle = '#6a4a38'; g.fillRect(-0.03, 0.72, 0.06, 0.2); },
    'w:club': g => { g.fillStyle = wood; poly(g, [[-0.06, 0.9], [0.06, 0.9], [0.17, 0.1], [-0.17, 0.1]]); nails(g); },
    'w:mace': g => { g.fillStyle = wood; g.fillRect(-0.04, 0.35, 0.08, 0.58); g.fillStyle = steel; circ(g, 0, 0.24, 0.2); spikes(g, 0, 0.24, 0.2, 8); },
    'w:staff': g => { g.fillStyle = wood; g.fillRect(-0.03, 0.2, 0.06, 0.75); g.fillStyle = '#66ddff'; circ(g, 0, 0.16, 0.12); glow(g, 0, 0.16, 0.22, '#66ddff'); },
    'w:scepter': g => { g.fillStyle = gold; g.fillRect(-0.03, 0.3, 0.06, 0.62); g.fillStyle = '#ff3355'; circ(g, 0, 0.22, 0.11); g.strokeStyle = gold; g.lineWidth = 0.035; g.beginPath(); g.arc(0, 0.22, 0.17, 0.5, 5.8); g.stroke(); },
    'w:axe': g => { g.fillStyle = wood; g.fillRect(-0.035, 0.12, 0.07, 0.82); g.fillStyle = steel; poly(g, [[0.03, 0.14], [0.36, 0.06], [0.3, 0.36], [0.03, 0.34]]); g.fillStyle = '#e8eef4'; poly(g, [[0.3, 0.06], [0.36, 0.06], [0.3, 0.36]]); },
    'w:spear': g => { g.fillStyle = wood; g.fillRect(-0.025, 0.2, 0.05, 0.74); g.fillStyle = steel; poly(g, [[0, 0.02], [0.1, 0.24], [-0.1, 0.24]]); },
    'w:bow': g => { g.strokeStyle = wood; g.lineWidth = 0.055; g.beginPath(); g.arc(-0.2, 0.5, 0.45, -1.1, 1.1); g.stroke(); g.strokeStyle = '#ddd'; g.lineWidth = 0.015; g.beginPath(); g.moveTo(0.0, 0.1); g.lineTo(0.0, 0.9); g.stroke(); },
    'a:rags': g => shirt(g, '#8a7050', '#5a4630'), 'a:vest': g => { shirt(g, '#6b4a2f', '#3a281c'); g.fillStyle = gold; for (let i = 0; i < 4; i++) circ(g, -0.12 + (i % 2) * 0.24, 0.35 + Math.floor(i / 2) * 0.2, 0.03); },
    'a:harness': g => { shirt(g, '#5a5f66', '#2c3036'); g.strokeStyle = '#c0c8d0'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(-0.3, 0.2); g.lineTo(0.3, 0.8); g.moveTo(0.3, 0.2); g.lineTo(-0.3, 0.8); g.stroke(); },
    'a:robe': g => { poly2(g, [[-0.14, 0.1], [0.14, 0.1], [0.34, 0.92], [-0.34, 0.92]], '#4b27a0', '#2a1560'); g.fillStyle = gold; circ(g, 0, 0.5, 0.04); circ(g, -0.1, 0.7, 0.03); circ(g, 0.12, 0.8, 0.03); },
    'a:royal': g => { shirt(g, '#b3122b', '#6e0a1a'); g.fillStyle = '#f7f3ea'; g.fillRect(-0.34, 0.14, 0.68, 0.1); g.fillStyle = gold; g.fillRect(-0.34, 0.85, 0.68, 0.06); },
  };
  function poly(g, p) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); g.fill(); }
  function poly2(g, p, a, b) { g.fillStyle = a; poly(g, p); g.strokeStyle = b; g.lineWidth = 0.035; g.stroke(); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fill(); }
  function glow(g, x, y, r, c) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c + '99'); gr.addColorStop(1, c + '00'); g.fillStyle = gr; circ(g, x, y, r); }
  function blade(g, w, len, c) { g.fillStyle = c; poly(g, [[-w / 2, 0.64], [w / 2, 0.64], [w / 2, 0.64 - len * 0.7], [0, 0.64 - len], [-w / 2, 0.64 - len * 0.7]]); g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(-0.01, 0.64 - len * 0.8, 0.02, len * 0.78); }
  function hilt(g, y, w, c) { g.fillStyle = gold; g.fillRect(-w / 2, y - 0.02, w, 0.06); g.fillStyle = c; g.fillRect(-0.035, y + 0.03, 0.07, 0.2); g.fillStyle = gold; circ(g, 0, y + 0.27, 0.04); }
  function nails(g) { g.fillStyle = steel; for (const [x, y] of [[-0.1, 0.2], [0.1, 0.28], [-0.05, 0.4], [0.07, 0.15]]) circ(g, x, y, 0.025); }
  function spikes(g, x, y, r, n) { g.fillStyle = steel; for (let i = 0; i < n; i++) { const a = i * 6.2832 / n; poly(g, [[x + Math.cos(a - 0.2) * r, y + Math.sin(a - 0.2) * r], [x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5], [x + Math.cos(a + 0.2) * r, y + Math.sin(a + 0.2) * r]]); } }
  function shirt(g, a, b) { poly2(g, [[-0.18, 0.1], [0.18, 0.1], [0.38, 0.28], [0.3, 0.42], [0.22, 0.36], [0.22, 0.9], [-0.22, 0.9], [-0.22, 0.36], [-0.3, 0.42], [-0.38, 0.28]], a, b); }
  function draw(ctx, key, x, y, size) {
    ctx.save(); ctx.translate(x + size / 2, y + size * 0.04); ctx.scale(size * 0.92, size * 0.92); ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = size * 0.04;
    try { (DRAW[key] || (g => { g.fillStyle = '#888'; g.fillRect(-0.2, 0.3, 0.4, 0.4); }))(ctx); } catch (e) {}
    ctx.restore();
  }
  function canvas(key, size) { const c = document.createElement('canvas'); const d = Math.min(window.devicePixelRatio || 1, 2); c.width = c.height = Math.round(size * d); c.style.width = c.style.height = size + 'px'; const g = c.getContext('2d'); g.scale(d, d); draw(g, key, 0, 0, size); return c; }
  window.GKICONS = { draw, canvas };
})();

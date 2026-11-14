// CT62.A1 - placeholder portraits. 'gen:<seed>' photos are simple drawn faces (front + profile),
// clearly not photographs. Real photos uploaded by the operator are stored as data URLs.
(function (CT) {
  'use strict';
  const cache = new Map();
  const SKIN = ['#f1d3bc', '#e8b996', '#d49e7a', '#b97c55', '#8d5a3b', '#6b4229'];
  const HAIR = ['#1d1a18', '#3b2a20', '#6a4a2e', '#a8794b', '#c9b48a', '#9a9a9a', '#d8d8d8', '#7a2f1a'];
  const BG = ['#dfe7ef', '#e7e1ef', '#e3ecdf', '#efe6dc', '#e0e0e0'];

  function traits(seed) {
    // same person = same seed mod 1000; each extra 1000 = a later photo of them (greyer hair)
    const r = CT.rng((seed % 1000) * 7919 + 13), age = Math.floor(seed / 1000);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const t = { skin: pick(SKIN), hair: pick(HAIR), bg: pick(BG), style: Math.floor(r() * 4), beard: r() < 0.3, glasses: r() < 0.35, kippah: r() < 0.3, jaw: 0.85 + r() * 0.2 };
    if (age >= 2) t.hair = '#d8d8d8'; else if (age === 1 && t.hair !== '#d8d8d8') t.hair = '#9a9a9a';
    if (age) t.glasses = t.glasses || r() < 0.5;
    return t;
  }

  function draw(seed, view, W = 200, H = 240) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), t = traits(seed);
    g.fillStyle = t.bg; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.47, rx = W * 0.27 * t.jaw, ry = H * 0.3;
    // shoulders
    g.fillStyle = '#4b5563'; g.beginPath(); g.ellipse(cx, H * 1.02, W * 0.48, H * 0.25, 0, Math.PI, 0); g.fill();
    g.fillStyle = t.skin; g.fillRect(cx - W * 0.08, cy + ry * 0.7, W * 0.16, H * 0.12);
    if (view === 'front') {
      if (t.style === 1) { g.fillStyle = t.hair; g.beginPath(); g.ellipse(cx, cy + ry * 0.15, rx * 1.25, ry * 1.12, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = t.skin; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = t.skin; g.beginPath(); g.ellipse(cx - rx, cy + 4, 7, 13, 0, 0, Math.PI * 2); g.ellipse(cx + rx, cy + 4, 7, 13, 0, 0, Math.PI * 2); g.fill();
      if (t.style !== 3) { g.fillStyle = t.hair; g.beginPath(); g.ellipse(cx, cy - ry * 0.55, rx * 1.02, ry * 0.5, 0, Math.PI, 0); g.fill(); }
      if (t.style === 2) { g.fillStyle = t.hair; for (let i = -3; i <= 3; i++) { g.beginPath(); g.arc(cx + i * rx * 0.3, cy - ry * 0.85, rx * 0.22, 0, Math.PI * 2); g.fill(); } }
      if (t.kippah) { g.fillStyle = '#1e3a8a'; g.beginPath(); g.ellipse(cx, cy - ry * 0.93, rx * 0.45, ry * 0.12, 0, Math.PI, 0); g.fill(); }
      g.fillStyle = '#222'; [-1, 1].forEach((s) => { g.beginPath(); g.ellipse(cx + s * rx * 0.38, cy - ry * 0.05, 4.5, 3.5, 0, 0, Math.PI * 2); g.fill(); });
      g.strokeStyle = t.hair; g.lineWidth = 3; [-1, 1].forEach((s) => { g.beginPath(); g.moveTo(cx + s * rx * 0.2, cy - ry * 0.22); g.lineTo(cx + s * rx * 0.58, cy - ry * 0.24); g.stroke(); });
      if (t.glasses) { g.strokeStyle = '#333'; g.lineWidth = 2; [-1, 1].forEach((s) => { g.beginPath(); g.arc(cx + s * rx * 0.38, cy - ry * 0.05, 11, 0, Math.PI * 2); g.stroke(); }); g.beginPath(); g.moveTo(cx - rx * 0.13, cy - ry * 0.07); g.lineTo(cx + rx * 0.13, cy - ry * 0.07); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx - 5, cy + ry * 0.3); g.lineTo(cx + 3, cy + ry * 0.32); g.stroke();
      if (t.beard) { g.fillStyle = t.hair; g.beginPath(); g.ellipse(cx, cy + ry * 0.62, rx * 0.8, ry * 0.42, 0, 0, Math.PI); g.fill(); }
      g.strokeStyle = '#7a3b3b'; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy + ry * 0.38, rx * 0.3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    } else {
      // profile facing right
      const px = cx - 6;
      if (t.style === 1) { g.fillStyle = t.hair; g.beginPath(); g.ellipse(px - 12, cy + ry * 0.2, rx * 1.05, ry * 1.1, 0, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = t.skin; g.beginPath(); g.ellipse(px, cy, rx * 0.95, ry, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(px + rx * 0.85, cy - ry * 0.2); g.lineTo(px + rx * 1.18, cy + ry * 0.18); g.lineTo(px + rx * 0.88, cy + ry * 0.25); g.fill(); // nose
      g.beginPath(); g.ellipse(px - rx * 0.15, cy + 4, 9, 14, 0, 0, Math.PI * 2); g.fillStyle = t.skin; g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.5; g.stroke(); // ear
      if (t.style !== 3) { g.fillStyle = t.hair; g.beginPath(); g.ellipse(px - rx * 0.1, cy - ry * 0.5, rx * 1.0, ry * 0.55, -0.15, Math.PI * 0.9, Math.PI * 2.05); g.fill(); g.fillRect(px - rx * 0.95, cy - ry * 0.5, rx * 0.5, ry * 0.7); }
      if (t.kippah) { g.fillStyle = '#1e3a8a'; g.beginPath(); g.ellipse(px - rx * 0.2, cy - ry * 0.93, rx * 0.5, ry * 0.13, -0.1, Math.PI, 0); g.fill(); }
      g.fillStyle = '#222'; g.beginPath(); g.ellipse(px + rx * 0.62, cy - ry * 0.05, 3, 3.5, 0, 0, Math.PI * 2); g.fill();
      if (t.glasses) { g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.arc(px + rx * 0.62, cy - ry * 0.05, 10, 0, Math.PI * 2); g.moveTo(px + rx * 0.3, cy - ry * 0.08); g.lineTo(px - rx * 0.1, cy - ry * 0.02); g.stroke(); }
      if (t.beard) { g.fillStyle = t.hair; g.beginPath(); g.ellipse(px + rx * 0.3, cy + ry * 0.6, rx * 0.7, ry * 0.4, 0.2, 0, Math.PI); g.fill(); }
      g.strokeStyle = '#7a3b3b'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(px + rx * 0.72, cy + ry * 0.42); g.lineTo(px + rx * 0.92, cy + ry * 0.4); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.font = '10px sans-serif'; g.fillText('placeholder', 6, H - 6);
    return c.toDataURL('image/png');
  }

  // src: 'gen:<seed>' or a data URL / relative image path
  CT.faceSrc = (src, view) => {
    if (!src) return '';
    if (!src.startsWith('gen:')) return src;
    const k = src + '|' + view;
    if (!cache.has(k)) cache.set(k, draw(parseInt(src.slice(4), 10) || 1, view));
    return cache.get(k);
  };
  CT.latestPhoto = (p) => (p.photos && p.photos.length ? p.photos.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0] : null);
})(window.CT);

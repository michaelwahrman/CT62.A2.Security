// CT62.A1 - small shared helpers (no DOM state). Everything hangs off window.CT.
window.CT = window.CT || {};
(function (CT) {
  'use strict';
  CT.$ = (s, r = document) => r.querySelector(s);
  CT.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  CT.el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  };
  CT.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // seeded RNG (mulberry32) - the simulation is repeatable for a given scenario + seed
  CT.rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  CT.hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  CT.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  CT.D2R = Math.PI / 180;
  // compass yaw (0 = north = -z, 90 = east = +x) <-> ground direction
  CT.yawDir = (yawDeg) => [Math.sin(yawDeg * CT.D2R), -Math.cos(yawDeg * CT.D2R)];
  CT.dirYaw = (dx, dz) => ((Math.atan2(dx, -dz) / CT.D2R) + 360) % 360;

  CT.pointInPoly = (x, z, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  };
  // proper intersection of segments p1-p2 and p3-p4 (2-D, ground plane)
  CT.segHit = (p1, p2, p3, p4) => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1;
  };
  CT.zoneAt = (venue, x, z) => venue.zones.find((zn) => CT.pointInPoly(x, z, zn.poly)) || { id: 'street', name: 'Outside', level: 0 };

  // clock helpers: sim clock = scenario start + t seconds
  CT.DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  CT.parseHM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
  CT.clockAt = (clock, t) => {
    const mins = CT.parseHM(clock.time) + t / 60;
    const day = (clock.day + Math.floor(mins / 1440)) % 7, m = ((mins % 1440) + 1440) % 1440;
    const hh = Math.floor(m / 60), mm = Math.floor(m % 60), ss = Math.floor((m * 60) % 60);
    return { day, minutes: m, text: `${CT.DAYS[day]} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` };
  };
  CT.isOpen = (venue, clk) => venue.schedule.open.some((o) => o.day === clk.day && clk.minutes >= CT.parseHM(o.from) && clk.minutes < CT.parseHM(o.to));
  CT.fmtT = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

  CT.CAT = {
    member: { label: 'Member', color: '#3fb27f' }, staff: { label: 'Staff / clergy', color: '#4c8dff' }, security: { label: 'Security', color: '#22b8cf' },
    not_trusted: { label: 'No longer trusted', color: '#f08a24' }, threat: { label: 'Threat list', color: '#e5484d' },
  };
  CT.STATUS = { unseen: '#9aa3ad', unknown: '#c8c8c8', flagged: '#e8b931', cleared: '#a78bfa' };

  CT.toast = (msg, ms = 2600) => {
    const t = CT.$('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
  };
  CT.download = (name, text, type = 'application/json') => {
    const a = CT.el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  CT.params = new URLSearchParams(location.search);
})(window.CT);

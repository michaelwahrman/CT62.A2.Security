// CT62.A1 - Venue tab: camera list + editor, click-to-move / click-to-aim, FOV cones, face-coverage map, venue JSON.
(function (CT) {
  'use strict';
  const $ = CT.$;
  const V = (CT.venueUI = { sel: null, mode: null });
  let S;

  const venue = () => CT.store.db.venue;
  const cam = () => venue().cameras.find((c) => c.id === V.sel);

  V.init = (scene) => {
    S = scene;
    $('#optZones').onchange = (e) => S.setZonesVisible(e.target.checked);
    $('#optDoors').onchange = (e) => { S.showDoorLabels = e.target.checked; S.buildDoors(venue()); S.dirty = true; };
    $('#optFov').onchange = (e) => S.setFovMode(e.target.value, V.sel);
    $('#optCov').onchange = () => V.coverage();
    $('#camAdd').onclick = () => {
      const v = venue(), id = (() => { let n = v.cameras.length + 1; while (v.cameras.some((c) => c.id === 'C' + String(n).padStart(2, '0'))) n++; return 'C' + String(n).padStart(2, '0'); })();
      const t = S.orbit.target;
      v.cameras.push({ id, name: 'New camera', pos: [+t.x.toFixed(1), 3.5, +t.z.toFixed(1)], yaw: 0, pitch: 10, hfov: 90, res: [2560, 1440], range: 20, fps: 1, lens: 'normal', zone: CT.zoneAt(v, t.x, t.z).id });
      V.sel = id; changed('Added ' + id + ' at the view centre. Use Move / Aim to place it.');
    };
    $('#camDel').onclick = () => {
      const c = cam(); if (!c) return;
      if (!confirm(`Delete camera ${c.id} "${c.name}"? (You can undo only by Data > Reset or re-importing venue.json.)`)) return;
      venue().cameras = venue().cameras.filter((x) => x !== c); V.sel = null; changed('Deleted ' + c.id);
    };
    $('#camLook').onclick = () => { if (!V.sel) return; const on = !(S.viewCam && S.lookId === V.sel); S.lookThrough(on ? V.sel : null); $('#camLook').classList.toggle('on', on); };
    $('#camMove').onclick = () => setMode(V.mode === 'move' ? null : 'move');
    $('#camAim').onclick = () => setMode(V.mode === 'aim' ? null : 'aim');
    $('#camlist').onclick = (e) => { const r = e.target.closest('tr[data-c]'); if (r) V.select(r.dataset.c); };
    $('#venueApply').onclick = () => {
      try {
        const o = JSON.parse($('#venueJson').value), v = venue();
        for (const k of ['walls', 'zones', 'doors', 'streets', 'fences', 'waypoints', 'bounds']) if (o[k] !== undefined) v[k] = o[k];
        changed('Venue geometry applied.');
      } catch (e) { CT.toast('JSON error: ' + e.message, 5000); }
    };
    S.renderer.domElement.addEventListener('click', (e) => {
      if (!document.body.classList.contains('t-venue') || S.orbit.wasDrag() || S.viewCam) return;
      if (V.mode && cam()) {
        const p = S.pick(e); if (!p) return; const c = cam();
        if (V.mode === 'move') { c.pos[0] = +p.x.toFixed(2); c.pos[2] = +p.z.toFixed(2); c.zone = CT.zoneAt(venue(), p.x, p.z).id; }
        else { c.yaw = +CT.dirYaw(p.x - c.pos[0], p.z - c.pos[2]).toFixed(1); const d = Math.hypot(p.x - c.pos[0], p.z - c.pos[2]); c.pitch = +((Math.atan2(c.pos[1] - 1.6, d) / CT.D2R)).toFixed(1); }
        setMode(null); changed(null); return;
      }
      const h = S.pick(e, S.rigs.map((r) => r.body));
      if (h) { const r = S.rigs.find((x) => x.body === h.object); if (r) V.select(r.id); }
    });
  };
  function setMode(m) { V.mode = m; $('#camMove').classList.toggle('on', m === 'move'); $('#camAim').classList.toggle('on', m === 'aim'); if (m) CT.toast(m === 'move' ? 'Click the ground where the camera should go.' : 'Click the ground point the camera should look at (pitch aims at head height).'); }
  function changed(msg) { CT.store.save('venue'); if (msg) CT.toast(msg); }

  V.select = (id) => { V.sel = id; S.setFovMode($('#optFov').value, id); V.refresh(); if (S.viewCam) S.lookThrough(id); };

  V.refresh = () => {
    const v = venue(), E = CT.esc;
    $('#camlist').innerHTML = '<tr><th>ID</th><th>Name</th><th>Zone</th><th>FOV</th></tr>' + v.cameras.map((c) => `<tr class="click${c.id === V.sel ? ' sel' : ''}" data-c="${c.id}"><td>${c.id}</td><td>${E(c.name)}</td><td>${E(c.zone)}</td><td>${c.hfov}&deg;</td></tr>`).join('');
    const c = cam(), ed = $('#camEdit'); ed.innerHTML = '';
    if (c) {
      const num = (lab, get, set, step = 0.1) => { const i = CT.el('input', { type: 'number', step, value: get() }); i.onchange = () => { set(+i.value); changed(null); }; ed.append(CT.el('label', {}, lab), i); };
      const txt = CT.el('input', { value: c.name }); txt.onchange = () => { c.name = txt.value; changed(null); }; ed.append(CT.el('label', {}, 'Name'), txt);
      num('East x (m)', () => c.pos[0], (x) => (c.pos[0] = x)); num('Height (m)', () => c.pos[1], (x) => (c.pos[1] = x)); num('South z (m)', () => c.pos[2], (x) => (c.pos[2] = x));
      num('Yaw (deg)', () => c.yaw, (x) => (c.yaw = ((x % 360) + 360) % 360), 1); num('Pitch down', () => c.pitch, (x) => (c.pitch = CT.clamp(x, -30, 89)), 0.5);
      num('H. FOV (deg)', () => c.hfov, (x) => (c.hfov = CT.clamp(x, 10, 170)), 1); num('Range (m)', () => c.range, (x) => (c.range = CT.clamp(x, 2, 120)), 1); num('Frames/s', () => c.fps, (x) => (c.fps = CT.clamp(x, 0.2, 10)), 0.5);
      const rs = CT.el('select', {}, ...[[1920, 1080], [2560, 1440], [3840, 2160]].map((r) => CT.el('option', { value: r.join('x'), selected: r.join('x') === c.res.join('x') }, r.join(' x '))));
      rs.onchange = () => { c.res = rs.value.split('x').map(Number); changed(null); }; ed.append(CT.el('label', {}, 'Resolution'), rs);
      const zs = CT.el('select', {}, ...v.zones.map((z) => CT.el('option', { value: z.id, selected: z.id === c.zone }, z.name))); zs.onchange = () => { c.zone = zs.value; changed(null); }; ed.append(CT.el('label', {}, 'Covers zone'), zs);
      const r = v.recognition, d = (r.faceWidthM * c.res[0]) / (2 * Math.tan((c.hfov * CT.D2R) / 2));
      ed.append(CT.el('label', {}, 'Face range'), CT.el('span', { class: 'small' }, `usable to ${(d / r.minFacePx).toFixed(1)} m, good to ${(d / r.goodFacePx).toFixed(1)} m`));
    } else ed.append(CT.el('span', { class: 'small muted', style: 'grid-column:1/3' }, 'Select a camera in the list or click one in 3D.'));
    $('#venueJson').value = JSON.stringify({ bounds: v.bounds, streets: v.streets, zones: v.zones, walls: v.walls, fences: v.fences, doors: v.doors, waypoints: v.waypoints }, null, 1);
  };

  V.coverage = () => {
    const on = $('#optCov').checked, st = S.buildCoverage(venue(), on);
    $('#covStats').innerHTML = st ? `Face coverage at 1 m cells (inside fence or seen): <b style="color:#e5484d">0 cams ${st[0]}</b>, 1 cam ${st[1]}, 2 cams ${st[2]}, <b style="color:#3fb27f">3+ cams ${st[3]}</b>. Red = blind spot on the property.` : '';
  };
})(window.CT);

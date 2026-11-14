// CT62.A1 - three.js venue scene shared by the Venue editor and the Operations view.
// Layer 0 = "physical" things that the CCTV cameras can see; layer 1 = overlays (zones, FOV cones, labels, coverage)
// that only the operator's main view shows.
(function (CT) {
  'use strict';
  const T = window.THREE;
  const OVER = 1;
  const ZONE_COL = { 0: 0x4c8dff, 1: 0xe8b931, 2: 0x3fb27f };

  function onOverlay(o) { o.layers.set(OVER); o.traverse && o.traverse((c) => c.layers.set(OVER)); return o; }

  // ---- camera model (also used by the simulation): a THREE.PerspectiveCamera placed like the real camera
  CT.camModel = (c) => {
    const vfov = 2 * Math.atan(Math.tan((c.hfov * CT.D2R) / 2) * (c.res[1] / c.res[0])) / CT.D2R;
    const pc = new T.PerspectiveCamera(vfov, c.res[0] / c.res[1], 0.2, Math.max(5, c.range));
    pc.position.set(c.pos[0], c.pos[1], c.pos[2]);
    pc.rotation.order = 'YXZ'; pc.rotation.y = -c.yaw * CT.D2R; pc.rotation.x = -c.pitch * CT.D2R;
    pc.updateMatrixWorld(true); pc.updateProjectionMatrix();
    return { c, pc, vfov, tanH: Math.tan((c.hfov * CT.D2R) / 2), tanV: Math.tan((vfov * CT.D2R) / 2) };
  };
  const _v = new T.Vector3();
  // can camera model m see point (x,y,z)? returns null or {dist, facePx, bodyPx, ndc:[x,y]}
  CT.camSees = (m, venue, x, y, z) => {
    const c = m.c, dx = x - c.pos[0], dy = y - c.pos[1], dz = z - c.pos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > c.range || dist < 0.3) return null;
    _v.set(x, y, z).project(m.pc);
    if (_v.z > 1 || _v.z < -1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) return null;
    for (const w of venue.walls) if (CT.segHit([c.pos[0], c.pos[2]], [x, z], w.a, w.b)) return null; // walls block (assumed taller than any camera)
    const r = venue.recognition;
    // perpendicular depth gives pixel scale: px = size / (2 * depth * tan(fov/2)) * resolution
    const depth = dist; // close enough for a planning estimate; documented assumption
    return { dist, facePx: (r.faceWidthM / (2 * depth * m.tanH)) * c.res[0], bodyPx: (r.personHeightM / (2 * depth * m.tanV)) * c.res[1], ndc: [_v.x, _v.y] };
  };

  // ---- simple orbit / pan / zoom for mouse and touch
  function makeOrbit(cam, dom, onChange) {
    const o = { target: new T.Vector3(0, 0, -4), r: 70, th: 0.5, ph: 0.95, enabled: true };
    const apply = () => {
      o.ph = CT.clamp(o.ph, 0.05, 1.5); o.r = CT.clamp(o.r, 4, 220);
      cam.position.set(o.target.x + o.r * Math.sin(o.ph) * Math.sin(o.th), o.target.y + o.r * Math.cos(o.ph), o.target.z + o.r * Math.sin(o.ph) * Math.cos(o.th));
      cam.lookAt(o.target); onChange && onChange();
    };
    o.apply = apply;
    const pts = new Map(); let mode = null, last = null, pinch = 0, moved = 0;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      if (!o.enabled) return;
      dom.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
      mode = pts.size === 2 ? 'pinch' : e.button === 2 || e.shiftKey ? 'pan' : 'rot'; last = [e.clientX, e.clientY];
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); }
    });
    dom.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !o.enabled) return;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (mode === 'pinch' && pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch) o.r *= pinch / d; pinch = d; apply(); return;
      }
      const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; moved += Math.abs(dx) + Math.abs(dy);
      if (mode === 'rot') { o.th -= dx * 0.006; o.ph -= dy * 0.006; }
      else if (mode === 'pan') {
        const s = o.r * 0.0016, f = new T.Vector3(Math.sin(o.th), 0, Math.cos(o.th)), rt = new T.Vector3(f.z, 0, -f.x);
        o.target.addScaledVector(rt, dx * s).addScaledVector(f, -dy * s);
      }
      apply();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (!pts.size) mode = null; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => { if (!o.enabled) return; e.preventDefault(); o.r *= Math.exp(e.deltaY * 0.0012); apply(); }, { passive: false });
    o.wasDrag = () => moved > 6;
    apply();
    return o;
  }

  // ---- text label sprite
  function label(text, color = '#fff', bg = 'rgba(20,22,28,.78)') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 10; sp.scale.set(4, 1, 1);
    sp.setText = (t, col = color, b = bg) => {
      if (sp._t === t + col + b) return; sp._t = t + col + b;
      const g = c.getContext('2d'); g.clearRect(0, 0, 256, 64); g.font = 'bold 26px Segoe UI, Arial, sans-serif';
      const w = Math.min(250, g.measureText(t).width + 22); g.fillStyle = b; g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 46, 12); g.fill();
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 128, 32, 236); tex.needsUpdate = true;
    };
    sp.setText(text); return onOverlay(sp);
  }
  CT.label = label;

  // ---- the scene
  CT.makeScene = (canvas) => {
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = T.SRGBColorSpace;
    const scene = new T.Scene(); scene.background = new T.Color(0x9fb3c8);
    const cam = new T.PerspectiveCamera(50, 1, 0.1, 600); cam.layers.enable(OVER); cam.layers.enable(2);
    scene.add(new T.HemisphereLight(0xdfe9f5, 0x4a4a3a, 1.6));
    const sun = new T.DirectionalLight(0xffffff, 1.6); sun.position.set(30, 60, 20); scene.add(sun);
    const S = { renderer, scene, cam, groups: {}, rigs: [], dirty: true };
    S.orbit = makeOrbit(cam, canvas, () => (S.dirty = true));
    const grp = (k) => { if (S.groups[k]) scene.remove(S.groups[k]); const g = new T.Group(); S.groups[k] = g; scene.add(g); return g; };

    S.build = (venue) => {
      // ground, streets, sidewalks
      const g0 = grp('ground'); const b = venue.bounds;
      const ground = new T.Mesh(new T.PlaneGeometry(b.maxX - b.minX + 40, b.maxZ - b.minZ + 40), new T.MeshLambertMaterial({ color: 0x6f8f5f }));
      ground.rotation.x = -Math.PI / 2; ground.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2); g0.add(ground); S.ground = ground;
      for (const s of venue.streets) {
        const [x0, z0, x1, z1] = s.rect;
        const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), new T.MeshLambertMaterial({ color: s.kind === 'road' ? 0x3d4148 : 0xb5b2aa }));
        m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, s.kind === 'road' ? 0.01 : 0.015, (z0 + z1) / 2); g0.add(m);
      }
      // floor of the building + walls
      const gw = grp('walls');
      const fl = new T.Mesh(new T.PlaneGeometry(24, 22), new T.MeshLambertMaterial({ color: 0xc9b99a })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.02, 3); gw.add(fl);
      const wm = new T.MeshLambertMaterial({ color: 0xe6dccb }), wm2 = new T.MeshLambertMaterial({ color: 0xd2c6b2 });
      for (const w of venue.walls) {
        const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
        const m = new T.Mesh(new T.BoxGeometry(L, w.h, 0.3), w.h > 4 ? wm : wm2);
        m.position.set((w.a[0] + w.b[0]) / 2, w.h / 2, (w.a[1] + w.b[1]) / 2); m.rotation.y = -Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]); gw.add(m);
      }
      const fm = new T.MeshLambertMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.55 });
      for (const f of venue.fences) {
        const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
        const m = new T.Mesh(new T.BoxGeometry(L, 1.8, 0.08), fm); m.position.set((f.a[0] + f.b[0]) / 2, 0.9, (f.a[1] + f.b[1]) / 2); m.rotation.y = -Math.atan2(f.b[1] - f.a[1], f.b[0] - f.a[0]); gw.add(m);
      }
      // a few seats + bimah as visual furniture
      const pew = new T.MeshLambertMaterial({ color: 0x7a5a3a });
      for (const sx of [-1, 1]) for (let r = 0; r < 6; r++) { const m = new T.Mesh(new T.BoxGeometry(6, 0.9, 0.5), pew); m.position.set(sx * 6.5, 0.45, 1.2 + r * 1.6); gw.add(m); }
      const bim = new T.Mesh(new T.BoxGeometry(3, 1.1, 2), new T.MeshLambertMaterial({ color: 0x5b3d24 })); bim.position.set(0, 0.55, 10.8); gw.add(bim);
      const ark = new T.Mesh(new T.BoxGeometry(3.5, 3.2, 0.6), new T.MeshLambertMaterial({ color: 0x3b4f7a })); ark.position.set(0, 1.6, 13.5); gw.add(ark);
      S.buildZones(venue); S.buildDoors(venue); S.buildCams(venue); S.dirty = true;
    };

    S.buildZones = (venue) => {
      const g = grp('zones'); onOverlay(g);
      for (const z of venue.zones) {
        if (z.id === 'street') continue;
        const shape = new T.Shape(z.poly.map(([x, zz]) => new T.Vector2(x, -zz)));
        const col = z.restricted ? 0xe5484d : ZONE_COL[z.level];
        const m = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: z.id === 'grounds' ? 0.10 : 0.22, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.y = 0.04 + z.level * 0.005; g.add(onOverlay(m));
        const pts = z.poly.concat([z.poly[0]]).map(([x, zz]) => new T.Vector3(x, 0.06, zz));
        g.add(onOverlay(new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: col }))));
      }
      g.visible = S.showZones !== false;
    };
    S.buildDoors = (venue) => {
      const g = grp('doors'); onOverlay(g);
      const col = { gate: 0x9b59b6, entrance: 0x2ecc71, interior: 0x95a5a6, emergency: 0xe74c3c };
      for (const d of venue.doors) {
        const L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
        const m = new T.Mesh(new T.BoxGeometry(L, 0.12, 0.5), new T.MeshBasicMaterial({ color: col[d.type] || 0xffffff }));
        m.position.set((d.a[0] + d.b[0]) / 2, 0.08, (d.a[1] + d.b[1]) / 2); m.rotation.y = -Math.atan2(d.b[1] - d.a[1], d.b[0] - d.a[0]); g.add(onOverlay(m));
        if (S.showDoorLabels) { const l = label(d.name, '#fff'); l.scale.set(5, 1.25, 1); l.position.set(m.position.x, 2.2, m.position.z); g.add(l); }
      }
    };

    S.buildCams = (venue) => {
      const g = grp('cams'); S.rigs = [];
      for (const c of venue.cameras) {
        const m = CT.camModel(c);
        const rig = new T.Group(); rig.position.copy(m.pc.position); rig.quaternion.copy(m.pc.quaternion);
        const body = new T.Mesh(new T.BoxGeometry(0.3, 0.25, 0.5), new T.MeshLambertMaterial({ color: 0xf2f2f2 })); body.position.z = 0.1; body.layers.set(2); rig.add(body);
        const lens = new T.Mesh(new T.CylinderGeometry(0.08, 0.08, 0.06, 12), new T.MeshBasicMaterial({ color: 0x111111 })); lens.rotation.x = Math.PI / 2; lens.position.z = -0.17; lens.layers.set(2); rig.add(lens);
        // FOV pyramid out to the camera's useful range
        const L = c.range, hw = L * m.tanH, hh = L * m.tanV;
        const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => new T.Vector3(x, y, -L));
        const pos = []; for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; pos.push(0, 0, 0, a.x, a.y, a.z, b.x, b.y, b.z); }
        const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); pg.computeVertexNormals();
        const cone = new T.Mesh(pg, new T.MeshBasicMaterial({ color: 0x48c9ff, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false }));
        const edges = new T.LineSegments(new T.EdgesGeometry(pg), new T.LineBasicMaterial({ color: 0x48c9ff, transparent: true, opacity: 0.55 }));
        const fov = new T.Group(); fov.add(cone, edges); onOverlay(fov); rig.add(fov);
        const lb = label(c.id, '#bfeaff'); lb.position.set(0, 0.9, 0); lb.scale.set(2.4, 0.6, 1); rig.add(lb);
        g.add(rig);
        S.rigs.push({ id: c.id, model: m, rig, fov, cone, edges, body, label: lb });
      }
      S.setFovMode(S.fovMode || 'all'); S.dirty = true;
    };
    S.setFovMode = (mode, selId) => {
      S.fovMode = mode; S.fovSel = selId ?? S.fovSel;
      for (const r of S.rigs) {
        const sel = r.id === S.fovSel;
        r.fov.visible = mode === 'all' || (mode === 'sel' && sel);
        r.cone.material.opacity = sel ? 0.16 : 0.07; r.edges.material.color.set(sel ? 0xffd166 : 0x48c9ff);
        r.body.material.color.set(sel ? 0xffd166 : 0xf2f2f2);
      }
      S.dirty = true;
    };
    S.setZonesVisible = (v) => { S.showZones = v; if (S.groups.zones) S.groups.zones.visible = v; S.dirty = true; };

    // coverage map: how many cameras get a usable face (>= minFacePx) of a person standing at each 1 m cell
    S.buildCoverage = (venue, on) => {
      const g = grp('coverage'); onOverlay(g); if (!on) { S.dirty = true; return null; }
      const b = venue.bounds, step = 1, W = Math.round((b.maxX - b.minX) / step), H = Math.round((b.maxZ - b.minZ) / step);
      const data = new Uint8Array(W * H * 4), models = venue.cameras.map(CT.camModel), stats = [0, 0, 0, 0];
      const pal = [[0, 0, 0, 0], [232, 185, 49, 150], [120, 200, 90, 160], [30, 160, 90, 180]];
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = b.minX + (i + 0.5) * step, z = b.minZ + (j + 0.5) * step; let n = 0;
        for (const m of models) { const s = CT.camSees(m, venue, x, 1.6, z); if (s && s.facePx >= venue.recognition.minFacePx) n++; }
        const k = Math.min(3, n), zone = CT.zoneAt(venue, x, z); if (zone.id !== 'street' || n) stats[k]++;
        const c = n ? pal[k] : zone.id === 'street' ? pal[0] : [229, 60, 70, 135];
        data.set(c, ((H - 1 - j) * W + i) * 4);
      }
      const tex = new T.DataTexture(data, W, H, T.RGBAFormat); tex.magFilter = T.NearestFilter; tex.needsUpdate = true;
      const m = new T.Mesh(new T.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set((b.minX + b.maxX) / 2, 0.09, (b.minZ + b.maxZ) / 2); g.add(onOverlay(m)); S.dirty = true;
      return stats; // cells (inside property or seen) with 0,1,2,3+ cameras
    };

    // ---- people figures
    S.agentGroup = grp('agents');
    S.makeFigure = (coat, skin = '#d9a77f') => {
      const f = new T.Group();
      const body = new T.Mesh(new T.CylinderGeometry(0.22, 0.26, 1.35, 12), new T.MeshLambertMaterial({ color: coat })); body.position.y = 0.72; f.add(body);
      const head = new T.Mesh(new T.SphereGeometry(0.15, 14, 10), new T.MeshLambertMaterial({ color: skin })); head.position.y = 1.58; f.add(head);
      const nose = new T.Mesh(new T.ConeGeometry(0.04, 0.12, 6), new T.MeshLambertMaterial({ color: skin })); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 1.58, -0.17); f.add(nose);
      const ring = onOverlay(new T.Mesh(new T.RingGeometry(0.38, 0.5, 24), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; f.add(ring);
      const lb = label(''); lb.position.y = 2.35; f.add(lb);
      f.userData = { ring, label: lb, body };
      S.agentGroup.add(f); return f;
    };
    S.addCarry = (f, kind) => {
      if (!kind) return;
      const m = kind === 'long object'
        ? new T.Mesh(new T.BoxGeometry(0.08, 1.1, 0.12), new T.MeshLambertMaterial({ color: 0x1c1c1c }))
        : new T.Mesh(new T.BoxGeometry(0.5, 0.45, 0.3), new T.MeshLambertMaterial({ color: 0x3a2a1a }));
      if (kind === 'long object') { m.position.set(0.3, 1.0, 0); m.rotation.z = 0.35; } else m.position.set(0.38, 0.5, 0);
      f.add(m);
    };
    S.clearAgents = () => { S.agentGroup.clear(); S.dirty = true; };

    // ---- picking on the ground plane / figures
    const ray = new T.Raycaster(); ray.layers.enableAll();
    S.pick = (ev, objs) => {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), S.viewCam || cam);
      if (objs) { const h = ray.intersectObjects(objs, true)[0]; return h || null; }
      const p = new T.Vector3(); return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), p) ? p : null;
    };

    S.resize = () => {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); S.dirty = true; }
      cam.aspect = w / h; cam.updateProjectionMatrix();
    };
    // view through a CCTV camera in the main view (operator double-clicks a camera tile)
    S.viewCam = null;
    S.lookThrough = (rigId) => {
      S.lookId = rigId;
      const r = S.rigs.find((x) => x.id === rigId);
      if (!r) { S.viewCam = null; S.orbit.enabled = true; S.dirty = true; return; }
      const pc = r.model.pc.clone(); pc.layers.set(0); pc.layers.enable(OVER); S.viewCam = pc; S.orbit.enabled = false; S.dirty = true;
    };
    S.render = () => {
      S.resize();
      const v = S.viewCam; if (v) { v.aspect = cam.aspect; v.updateProjectionMatrix(); }
      for (const r of S.rigs) r.rig.visible = !v || r.id !== S.lookId;
      renderer.render(scene, v || cam); S.dirty = false;
    };
    return S;
  };
})(window.CT);

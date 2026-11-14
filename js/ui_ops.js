// CT62.A1 - Operations tab: runs a scenario, shows people in 3D, camera frames, tracks, alerts, notifications.
(function (CT) {
  'use strict';
  const T = window.THREE, $ = CT.$;
  const O = (CT.ops = { sim: null, playing: true, speed: 1, sel: null, follow: false });
  let S, thumbR, tiles = {}, lastPanel = 0, figs = [];

  O.init = (scene) => {
    S = scene;
    thumbR = new T.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    thumbR.setSize(384, 216, false); thumbR.outputColorSpace = T.SRGBColorSpace;
    $('#btnPlay').onclick = () => { O.playing = !O.playing; $('#btnPlay').textContent = O.playing ? 'Pause' : 'Play'; };
    $('#btnRestart').onclick = () => O.start($('#scenario').value);
    $('#speed').onchange = (e) => (O.speed = +e.target.value);
    $('#scenario').onchange = (e) => O.start(e.target.value);
    $('#declare').append(...[1, 2, 3, 4].map((l) => CT.el('button', { title: 'Operator declares this level', onclick: () => { O.sim.declare(l); O.panels(true); } }, `Declare ${l}`)),
      CT.el('button', { onclick: () => { O.sim.allClear(); O.panels(true); } }, 'All clear'));
    // panel clicks (event delegation)
    $('#tracks').onclick = (e) => { const r = e.target.closest('tr[data-t]'); if (r) O.select(O.sim.tracks.find((t) => t.id === r.dataset.t)); };
    $('#alerts').onclick = (e) => {
      const b = e.target.closest('button[data-a]'); if (!b) { const r = e.target.closest('tr[data-tr]'); if (r) O.select(O.sim.tracks.find((t) => t.id === r.dataset.tr)); return; }
      const al = O.sim.alerts.find((a) => a.id === b.dataset.a); b.dataset.op === 'ack' ? O.sim.ack(al) : O.sim.resolve(al); O.panels(true);
    };
    $('#trackDetail').onclick = (e) => {
      const b = e.target.closest('button[data-op]'); if (!b || !O.sel) return;
      if (b.dataset.op === 'clear') O.sim.clearTrack(O.sel);
      if (b.dataset.op === 'follow') O.follow = !O.follow;
      if (b.dataset.op === 'unsel') O.select(null);
      O.panels(true);
    };
    S.renderer.domElement.addEventListener('click', (e) => {
      if (!document.body.classList.contains('t-ops') || S.orbit.wasDrag()) return;
      const h = S.pick(e, S.agentGroup.children); if (!h) return;
      let o = h.object; while (o && !figs.includes(o)) o = o.parent;
      const a = o && O.sim.agents[figs.indexOf(o)]; if (a && a.track) O.select(a.track);
    });
  };

  O.fillScenarios = () => {
    const sel = $('#scenario'), cur = sel.value;
    sel.innerHTML = ''; CT.store.db.scenarios.scenarios.forEach((s) => sel.append(CT.el('option', { value: s.id }, s.name)));
    if (cur && CT.store.db.scenarios.scenarios.some((s) => s.id === cur)) sel.value = cur;
  };
  O.buildTiles = () => {
    const g = $('#camgrid'); g.innerHTML = ''; tiles = {};
    for (const c of CT.store.db.venue.cameras) {
      const cv = CT.el('canvas', { width: 384, height: 216 });
      const t = CT.el('div', { class: 'tile', title: `${c.id} ${c.name} - double-click to look through this camera` }, cv, CT.el('div', { class: 'cap' }, `${c.id} ${c.name}`));
      t.ondblclick = () => { const on = S.lookId !== c.id || !S.viewCam; S.lookThrough(on ? c.id : null); CT.$$('.tile').forEach((x) => x.classList.remove('sel')); if (on) t.classList.add('sel'); };
      g.append(t); tiles[c.id] = { cv, ctx: cv.getContext('2d'), shown: -1 };
    }
  };

  O.start = (id, t0 = 0) => {
    const db = CT.store.db, sc = db.scenarios.scenarios.find((s) => s.id === id) || db.scenarios.scenarios[0];
    $('#scenario').value = sc.id;
    O.sim = CT.makeSim(db, sc, +(CT.params.get('seed') || 1)); O.sel = null; O.follow = false;
    S.clearAgents(); figs = O.sim.agents.map((a) => { const f = S.makeFigure(a.coat); S.addCarry(f, a.carry); return f; });
    const h = CT.parseHM(sc.clock.time) / 60; O.night = h < 6.5 || h > 19.5; setNight(O.night);
    Object.values(tiles).forEach((t) => (t.shown = -1));
    if (t0 > 0) O.sim.runTo(t0);
    O.update(); O.panels(true);
  };
  function setNight(n) {
    S.scene.background.set(n ? 0x1b2333 : 0x9fb3c8);
    S.scene.children.forEach((c) => { if (c.isHemisphereLight) c.intensity = n ? 0.55 : 1.6; if (c.isDirectionalLight) c.intensity = n ? 0.35 : 1.6; });
  }

  O.select = (tr) => { O.sel = tr || null; O.follow = false; O.panels(true); O.update(); };

  // place figures + labels from sim state
  O.update = () => {
    const sim = O.sim; if (!sim) return;
    sim.agents.forEach((a, i) => {
      const f = figs[i]; f.visible = a.state !== 'pending' && a.state !== 'gone';
      f.position.set(a.x, 0, a.z); f.rotation.y = -a.yaw * CT.D2R;
      const st = a.track ? sim.trackStatus(a.track) : { text: 'not seen', color: '#6b7280' };
      const u = f.userData; u.label.setText(st.text, '#fff', hexA(st.color, 0.85)); u.ring.material.color.set(st.color);
      u.ring.scale.setScalar(a.track && a.track === O.sel ? 1.6 : 1);
    });
    if (O.follow && O.sel) { S.orbit.target.set(O.sel.x, 0, O.sel.z); S.orbit.apply(); }
    S.dirty = true;
  };
  function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

  // camera tiles: re-render a tile only when that camera produced a new frame (so the wall updates at 1-2 fps)
  O.renderTiles = (force) => {
    if (!document.body.classList.contains('panels') || !O.sim) return;
    const sim = O.sim;
    for (const r of S.rigs) {
      const tl = tiles[r.id], fr = sim.frames[r.id]; if (!tl) continue;
      const ft = fr ? fr.t : 0; if (!force && tl.shown === ft) continue; tl.shown = ft;
      thumbR.render(S.scene, r.model.pc);
      const g = tl.ctx; g.filter = O.night ? 'grayscale(1) brightness(1.5) contrast(1.1)' : 'none';
      g.drawImage(thumbR.domElement, 0, 0, 384, 216); g.filter = 'none';
      g.font = '11px ui-monospace,Consolas,monospace'; g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 200, 384, 16); g.fillStyle = '#fff';
      g.fillText(`${r.id} ${sim.clock().text}${O.night ? ' IR' : ''}  ${r.model.c.res.join('x')}`, 6, 212);
      if (!fr) continue;
      for (const d of fr.dets) {
        const a = d.agent, top = new T.Vector3(a.x, 1.85, a.z).project(r.model.pc), bot = new T.Vector3(a.x, 0, a.z).project(r.model.pc);
        const y0 = (1 - top.y) * 108, y1 = (1 - Math.max(-1, bot.y)) * 108, x = (top.x + 1) * 192, h = Math.max(8, y1 - y0), w = h * 0.38;
        const st = a.track ? sim.trackStatus(a.track) : { color: '#999' };
        g.strokeStyle = st.color; g.lineWidth = a.track === O.sel ? 3 : 1.5; g.strokeRect(x - w / 2, y0, w, h);
        const txt = `${a.track ? a.track.id : '?'} ${d.matched ? 'MATCH' : d.q > 0 ? 'q' + d.q.toFixed(2) : d.view === 'back' ? 'back' : 'small'}`;
        g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(x - w / 2, y0 - 13, g.measureText(txt).width + 6, 13); g.fillStyle = st.color; g.fillText(txt, x - w / 2 + 3, y0 - 3);
      }
    }
  };

  O.panels = (force) => {
    const sim = O.sim; if (!sim) return;
    const lv = CT.store.db.alerts.levels.find((l) => l.level === sim.level) || { name: '', color: '#888' };
    const b = $('#banner'); b.textContent = `Level ${sim.level}: ${lv.name}`; b.style.background = lv.color;
    b.classList.toggle('flash', sim.alerts.some((a) => !a.acked && a.level >= 2));
    $('#clock').textContent = `${sim.clock().text}  (t ${CT.fmtT(sim.t)})`;
    if (!document.body.classList.contains('panels')) return;
    const now = performance.now(); if (!force && now - lastPanel < 330) return; lastPanel = now;
    const E = CT.esc;
    $('#tracks').innerHTML = '<tr><th>Track</th><th>Identity</th><th>Zone</th><th>Cams</th></tr>' + sim.tracks.map((tr) => {
      const st = sim.trackStatus(tr), live = sim.t - tr.lastSeen < 3, ncam = Object.values(tr.cams).filter((t) => sim.t - t < 5).length;
      return `<tr class="click${tr === O.sel ? ' sel' : ''}" data-t="${tr.id}" style="opacity:${live || tr.agent.state !== 'gone' ? 1 : 0.45}"><td><span class="dot" style="background:${st.color}"></span>${tr.id}</td><td>${E(tr.person ? tr.person.name : tr.cleared ? 'visitor (cleared)' : 'unknown')}${tr.object ? ' &#9888;' : ''}</td><td>${E(tr.zone ? tr.zone.name : '')}</td><td>${ncam}</td></tr>`;
    }).join('');
    const tr = O.sel;
    if (tr) {
      const p = tr.person, ph = p && CT.latestPhoto(p), st = sim.trackStatus(tr);
      const camsRecent = Object.entries(tr.cams).filter(([, t]) => sim.t - t < 10).map(([c]) => c).join(', ') || 'none';
      $('#trackDetail').innerHTML = `<div style="display:flex;gap:8px;margin-top:8px;background:#22262e;border-radius:8px;padding:8px">
        ${ph ? `<img src="${CT.faceSrc(ph.front, 'front')}" style="width:70px;height:84px;object-fit:cover;border-radius:6px">` : '<div style="width:70px;height:84px;border-radius:6px;background:#333;display:grid;place-items:center;font-size:28px">?</div>'}
        <div class="small" style="flex:1"><b style="color:${st.color}">${tr.id} ${E(p ? p.name : 'not matched')}</b><br>${p ? E(CT.CAT[p.category].label + (p.role ? ' - ' + p.role : '')) + `<br>match confidence ${(tr.conf * 100).toFixed(0)}% (${tr.matches} frames)` : `${tr.goodLooks} good face views, no match`}
        <br>zone: ${E(tr.zone ? tr.zone.name : '?')}<br>cameras (10 s): ${camsRecent}${tr.object ? `<br><b style="color:#f08a24">possible ${E(tr.object)}</b>` : ''}
        <div class="row">${!p && !tr.cleared ? '<button data-op="clear">Clear as visitor</button>' : ''}<button data-op="follow" class="${O.follow ? 'on' : ''}">Follow</button><button data-op="unsel">Close</button></div></div></div>`;
    } else $('#trackDetail').innerHTML = '<div class="small muted">Click a track or a person in 3D for details.</div>';
    const lvColor = (l) => (CT.store.db.alerts.levels.find((x) => x.level === l) || {}).color || '#888';
    $('#alerts').innerHTML = sim.alerts.length ? sim.alerts.slice().reverse().map((a) => `<tr class="click" data-tr="${a.track.id}" style="opacity:${a.resolved ? 0.45 : 1}">
      <td><span class="chip" style="background:${lvColor(a.level)}">L${a.level}</span></td><td class="small">${a.clock.slice(4)}<br>${a.id}</td>
      <td><b>${E(a.ruleName)}</b><br><span class="small">${E(a.text)}</span></td>
      <td style="white-space:nowrap">${a.resolved ? 'resolved' : `${a.acked ? '' : `<button data-a="${a.id}" data-op="ack">Ack</button> `}<button data-a="${a.id}" data-op="res">Resolve</button>`}</td></tr>`).join('') : '<tr><td class="muted">No alerts.</td></tr>';
    $('#notes').innerHTML = sim.notes.length ? sim.notes.slice().reverse().map((n) => `<tr><td><span class="chip" style="background:${lvColor(n.level)}">L${n.level}</span></td><td class="small">${n.clock.slice(4)}</td><td><b>${E(n.to)}</b> <span class="muted small">${E(n.phone)} via ${E(n.via)}</span><br><span class="small">${E(n.text)} [SIMULATED]</span></td></tr>`).join('') : '<tr><td class="muted">Nobody notified yet.</td></tr>';
    $('#log').innerHTML = sim.log.slice(-80).reverse().map((l) => `<tr><td class="muted" style="white-space:nowrap">${l.clock.slice(4)}</td><td${l.level !== null ? ` style="color:${lvColor(l.level)}"` : ''}>${E(l.text)}</td></tr>`).join('');
  };

  O.tick = (dtReal) => {
    if (!O.sim) return;
    if (O.playing) { O.sim.runTo(O.sim.t + Math.min(0.25, dtReal) * O.speed); O.update(); }
    O.renderTiles(); O.panels();
  };
})(window.CT);

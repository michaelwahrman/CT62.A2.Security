// CT62.A1 - start-up, tabs, data menu, render loop.
// URL options (also used to make the README images): ?tab=ops|venue|people|duty &scenario=<id> &t=<sec> &panels=1
//   &play=0 &speed=10 &cov=1 &cam=<camId> &look=<camId> &sel=<trackId> &view=<r,theta,phi,tx,tz> &fov=all|sel|none &fresh=1 (ignore local edits) &selftest=1
(async function (CT) {
  'use strict';
  const $ = CT.$, P = CT.params;
  await CT.store.load();
  const S = CT.makeScene($('#c3d'));
  CT.scene = S;
  S.build(CT.store.db.venue);
  CT.ops.init(S); CT.venueUI.init(S);
  CT.ops.fillScenarios(); CT.ops.buildTiles();

  const setEdited = () => document.body.classList.toggle('edited', CT.store.edited);
  setEdited();

  let tab = 'ops';
  const show = (t) => {
    tab = t; document.body.className = document.body.className.replace(/\bt-\w+/g, '').trim() + ' t-' + t;
    CT.$$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    CT.$$('.page').forEach((p) => p.classList.toggle('on', p.id === 'pg-' + t));
    if (t === 'people') CT.peopleUI.render();
    if (t === 'duty') CT.dutyUI.render();
    if (t === 'venue') { CT.venueUI.refresh(); S.setFovMode($('#optFov').value, CT.venueUI.sel); }
    if (t === 'ops') { S.setFovMode('all', null); CT.ops.panels(true); CT.ops.renderTiles(true); }
    if (S.viewCam && t !== 'ops' && t !== 'venue') S.lookThrough(null);
    S.dirty = true;
  };
  CT.$$('#tabs button').forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  const togglePanels = (on) => { document.body.classList.toggle('panels', on ?? !document.body.classList.contains('panels')); $('#btnPanels').classList.toggle('on', document.body.classList.contains('panels')); CT.ops.panels(true); CT.ops.renderTiles(true); S.dirty = true; };
  $('#btnPanels').onclick = () => togglePanels();
  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select,dialog')) return;
    if (e.key === 'p' || e.key === 'P') togglePanels();
    if (e.key === ' ' && tab === 'ops') { e.preventDefault(); $('#btnPlay').click(); }
    if (e.key === 'Escape' && S.viewCam) { S.lookThrough(null); CT.$$('.tile').forEach((x) => x.classList.remove('sel')); }
  });

  // store changes: venue edits rebuild the 3D scene and restart the scenario; other edits restart the scenario
  CT.store.on((what) => {
    setEdited();
    if (what === 'venue' || what === 'all') {
      S.build(CT.store.db.venue); CT.ops.buildTiles(); if ($('#optCov').checked) CT.venueUI.coverage();
      if (tab === 'venue') CT.venueUI.refresh();
    }
    if (what === 'scenarios' || what === 'all') CT.ops.fillScenarios();
    if (what === 'all') { if (tab === 'people') CT.peopleUI.render(); if (tab === 'duty') CT.dutyUI.render(); }
    CT.ops.start($('#scenario').value);
  });

  // data menu: export / import / reset
  $('#btnData').onclick = () => {
    const dlg = $('#dlg'), st = CT.store; dlg.innerHTML = '';
    const imp = CT.el('input', { type: 'file', accept: '.json,application/json', multiple: true });
    imp.onchange = async () => { for (const f of imp.files) { try { CT.toast('Imported ' + (await st.importFile(f)) + '.json'); } catch (e) { CT.toast(e.message, 5000); } } dlg.close(); };
    dlg.append(CT.el('div', { class: 'hd' }, CT.el('h2', {}, 'Data'), CT.el('button', { onclick: () => dlg.close() }, 'Close')),
      CT.el('div', { class: 'bd' },
        CT.el('p', {}, 'The databases are five JSON files in ', CT.el('code', {}, 'data/'), '. Edits you make here are kept in this browser only (', st.edited ? CT.el('b', {}, 'you have local edits') : 'no local edits', '). Export a file and copy it into data/ to make it permanent, then run ', CT.el('code', {}, 'python3 scripts/bundle_data.py'), '.'),
        CT.el('div', { class: 'row' }, ...st.FILES.map((f) => CT.el('button', { onclick: () => st.exportFile(f) }, `Export ${f}.json`))),
        CT.el('div', { class: 'row' }, CT.el('label', {}, 'Import'), imp, CT.el('span', { class: 'small muted' }, 'file names must match, e.g. people.json')),
        CT.el('div', { class: 'row' }, CT.el('button', { class: 'danger', onclick: () => { if (confirm('Discard all edits made in this browser and go back to the data/*.json files?')) { st.reset(); dlg.close(); } } }, 'Reset to shipped data'))));
    dlg.showModal();
  };

  // URL options
  if (P.get('view')) { const [r, th, ph, tx, tz] = P.get('view').split(',').map(Number); Object.assign(S.orbit, { r, th, ph }); S.orbit.target.set(tx || 0, 0, tz || 0); S.orbit.apply(); }
  if (P.has('speed')) { CT.ops.speed = +P.get('speed'); $('#speed').value = P.get('speed'); }
  if (P.get('play') === '0') { CT.ops.playing = false; $('#btnPlay').textContent = 'Play'; }
  CT.ops.start(P.get('scenario') || 'arrivals', +(P.get('t') || 0));
  if (P.get('sel')) CT.ops.select(CT.ops.sim.tracks.find((t) => t.id === P.get('sel')));
  if (P.get('panels') === '1') togglePanels(true);
  if (P.get('cam')) CT.venueUI.sel = P.get('cam');
  if (P.get('cov') === '1') $('#optCov').checked = true;
  if (P.get('fov')) $('#optFov').value = P.get('fov');
  show(P.get('tab') || 'ops');
  if (P.get('cov') === '1') CT.venueUI.coverage();
  if (P.get('look')) { S.lookThrough(P.get('look')); const t = CT.$$('.tile').find((x) => x.title.startsWith(P.get('look') + ' ')); if (t) t.classList.add('sel'); }

  if (P.get('selftest') === '1') CT.selftest();

  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (tab === 'ops') CT.ops.tick(dt);
    if ((tab === 'ops' || tab === 'venue') && (S.dirty || tab === 'ops')) S.render();
    requestAnimationFrame(loop);
  };
  S.render(); CT.ops.renderTiles(true);
  requestAnimationFrame(loop);
})(window.CT);

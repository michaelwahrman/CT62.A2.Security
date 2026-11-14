// CT62.A1 - People tab: the recognition database (members, staff, security, not-trusted, threat list),
// two photos per person (front + side) with a dated history.
(function (CT) {
  'use strict';
  const $ = CT.$, E = CT.esc;
  const P = (CT.peopleUI = { filter: 'all', q: '' });

  P.render = () => {
    const pg = $('#pg-people'), list = CT.store.db.people.people;
    const shown = list.filter((p) => (P.filter === 'all' || p.category === P.filter) && (!P.q || (p.name + ' ' + p.role).toLowerCase().includes(P.q.toLowerCase())));
    const counts = Object.fromEntries(Object.keys(CT.CAT).map((k) => [k, list.filter((p) => p.category === k).length]));
    pg.innerHTML = '';
    const sel = CT.el('select', {}, CT.el('option', { value: 'all' }, `All (${list.length})`), ...Object.entries(CT.CAT).map(([k, c]) => CT.el('option', { value: k, selected: P.filter === k }, `${c.label} (${counts[k]})`)));
    sel.onchange = () => { P.filter = sel.value; P.render(); };
    const q = CT.el('input', { placeholder: 'Search name or role', value: P.q }); q.oninput = () => { P.q = q.value; clearTimeout(q._t); q._t = setTimeout(() => { P.render(); const n = $('#pg-people input'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    pg.append(CT.el('div', { class: 'toolbar' }, CT.el('b', {}, 'People database'), sel, q, CT.el('button', { onclick: () => P.edit(null) }, '+ Add person'),
      CT.el('span', { class: 'small muted' }, 'All people and photos here are fictional placeholders.')));
    pg.append(CT.el('div', { class: 'cards' }, ...shown.map((p) => {
      const ph = CT.latestPhoto(p), c = CT.CAT[p.category];
      return CT.el('div', { class: 'card', onclick: () => P.edit(p) },
        CT.el('div', { class: 'ph' }, CT.el('img', { src: ph ? CT.faceSrc(ph.front, 'front') : '', alt: 'front' }), CT.el('img', { src: ph ? CT.faceSrc(ph.side, 'side') : '', alt: 'side' })),
        CT.el('div', { class: 'nm' }, CT.el('span', { class: 'dot', style: `background:${c.color}` }), p.name),
        CT.el('div', { class: 'meta' }, `${c.label}${p.role ? ' - ' + p.role : ''}`),
        CT.el('div', { class: 'meta' }, `${p.id} - ${p.photos.length} photo set${p.photos.length === 1 ? '' : 's'}, latest ${ph ? ph.date : 'none'}`));
    })));
  };

  const readFile = (f) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  // shrink uploaded photos so the JSON stays a manageable size (max 480 px tall JPEG)
  const shrink = (url) => new Promise((res) => { const im = new Image(); im.onload = () => { const s = Math.min(1, 480 / im.height), c = CT.el('canvas', { width: Math.round(im.width * s), height: Math.round(im.height * s) }); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.85)); }; im.onerror = () => res(url); im.src = url; });

  P.edit = (orig) => {
    const db = CT.store.db, isNew = !orig;
    const p = isNew ? { id: CT.store.nextId('P', db.people.people), name: '', category: 'member', role: '', access: 'services', zones: db.venue.zones.filter((z) => !z.restricted).map((z) => z.id), phone: '', email: '', notes: '', photos: [] } : JSON.parse(JSON.stringify(orig));
    const dlg = $('#dlg'); dlg.innerHTML = '';
    const f = {}; const inp = (k, attrs = {}) => (f[k] = CT.el('input', { value: p[k] ?? '', ...attrs }));
    const cat = (f.category = CT.el('select', {}, ...Object.entries(CT.CAT).map(([k, c]) => CT.el('option', { value: k, selected: p.category === k }, c.label))));
    const acc = (f.access = CT.el('select', {}, CT.el('option', { value: 'services', selected: p.access === 'services' }, 'Open hours only'), CT.el('option', { value: 'any', selected: p.access === 'any' }, 'Any time')));
    const zoneBox = CT.el('div', { class: 'zonechk' }, ...[{ id: '*', name: 'All zones' }, ...db.venue.zones].map((z) => CT.el('label', {}, CT.el('input', { type: 'checkbox', value: z.id, checked: p.zones.includes(z.id) }), ' ' + z.name)));
    const hist = CT.el('div', { class: 'hist' });
    const drawHist = () => {
      hist.innerHTML = '';
      p.photos.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).forEach((ph) => hist.append(CT.el('div', { class: 'h' },
        CT.el('div', {}, CT.el('img', { src: CT.faceSrc(ph.front, 'front') }), ' ', CT.el('img', { src: CT.faceSrc(ph.side, 'side') })),
        CT.el('div', { class: 'row' }, CT.el('b', {}, ph.date), CT.el('button', { class: 'danger', onclick: () => { if (confirm(`Remove the ${ph.date} photo set from this person's history?`)) { p.photos = p.photos.filter((x) => x !== ph); drawHist(); } } }, 'Remove')))));
      if (!p.photos.length) hist.append(CT.el('span', { class: 'muted' }, 'No photos yet - add a front and a side view below.'));
    };
    drawHist();
    const fFront = CT.el('input', { type: 'file', accept: 'image/*' }), fSide = CT.el('input', { type: 'file', accept: 'image/*' }), fDate = CT.el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    const addSet = async () => {
      if (!fFront.files[0]) return CT.toast('Choose at least a front photo.');
      const front = await shrink(await readFile(fFront.files[0])), side = fSide.files[0] ? await shrink(await readFile(fSide.files[0])) : front;
      p.photos.push({ date: fDate.value, front, side }); fFront.value = fSide.value = ''; drawHist();
    };
    const gen = () => {
      const base = p.photos.map((ph) => ph.front).find((x) => x.startsWith('gen:'));
      const s = base ? (parseInt(base.slice(4), 10) % 1000) + 1000 * Math.min(2, p.photos.length) : 200 + Math.floor(Math.random() * 790); p.photos.push({ date: fDate.value, front: 'gen:' + s, side: 'gen:' + s }); drawHist(); };

    dlg.append(
      CT.el('div', { class: 'hd' }, CT.el('h2', {}, isNew ? 'Add person' : `Edit ${p.id}`), CT.el('button', { onclick: () => dlg.close() }, 'Close')),
      CT.el('div', { class: 'bd' },
        CT.el('div', { class: 'grid2' }, CT.el('label', {}, 'Name'), inp('name'), CT.el('label', {}, 'Category'), cat, CT.el('label', {}, 'Role'), inp('role', { placeholder: 'e.g. Rabbi, greeter' }),
          CT.el('label', {}, 'Access'), acc, CT.el('label', {}, 'Phone'), inp('phone'), CT.el('label', {}, 'Email'), inp('email'), CT.el('label', {}, 'Notes'), inp('notes')),
        CT.el('h2', { class: 'sect' }, 'Allowed zones'), zoneBox,
        CT.el('h2', { class: 'sect' }, 'Photo history (newest first)'), hist,
        CT.el('div', { class: 'row' }, CT.el('label', {}, 'Date'), fDate, CT.el('label', {}, 'Front'), fFront, CT.el('label', {}, 'Side'), fSide, CT.el('button', { onclick: addSet }, 'Add photo set'), CT.el('button', { onclick: gen, title: 'Adds a drawn placeholder face' }, 'Add placeholder')),
        CT.el('div', { class: 'small muted' }, 'Photos are reduced to 480 px and kept in this browser until you Export people.json. A real deployment would keep them encrypted on the server.')),
      CT.el('div', { class: 'ft' },
        !isNew ? CT.el('button', { class: 'danger', onclick: () => { if (confirm(`Delete ${orig.name} (${orig.id}) and all their photos?`)) { db.people.people = db.people.people.filter((x) => x !== orig); CT.store.save('people'); dlg.close(); P.render(); } } }, 'Delete person') : null,
        CT.el('span', { style: 'flex:1' }),
        CT.el('button', { onclick: () => dlg.close() }, 'Cancel'),
        CT.el('button', { class: 'on', onclick: () => {
          for (const k of ['name', 'role', 'phone', 'email', 'notes']) p[k] = f[k].value.trim();
          p.category = cat.value; p.access = acc.value; p.zones = CT.$$('input:checked', zoneBox).map((i) => i.value);
          if (!p.name) return CT.toast('A name is required.');
          if (isNew) db.people.people.push(p); else Object.assign(orig, p);
          CT.store.save('people'); dlg.close(); P.render();
        } }, 'Save')));
    dlg.showModal();
  };
})(window.CT);

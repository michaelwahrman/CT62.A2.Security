// CT62.A1 - Duty & alerts tab: duty officers (on duty / on call / off), outside contacts,
// alert levels with their notify lists and actions, and the rules that raise them.
(function (CT) {
  'use strict';
  const $ = CT.$, E = CT.esc;
  const D = (CT.dutyUI = {});
  const save = () => CT.store.save('duty');

  function table(cols, rows, onDel) {
    const t = CT.el('table', { class: 't' }, CT.el('tr', {}, ...cols.map((c) => CT.el('th', {}, c.h)), onDel ? CT.el('th') : null));
    rows.forEach((r) => t.append(CT.el('tr', {}, ...cols.map((c) => CT.el('td', {}, c.cell(r))), onDel ? CT.el('td', {}, CT.el('button', { class: 'danger', onclick: () => onDel(r) }, 'Delete')) : null)));
    return t;
  }
  const field = (obj, k, w = 150, after = save) => { const i = CT.el('input', { value: obj[k] ?? '', style: `width:${w}px` }); i.onchange = () => { obj[k] = i.value; after(); }; return i; };
  const select = (obj, k, opts, after = save) => { const s = CT.el('select', {}, ...opts.map(([v, l]) => CT.el('option', { value: v, selected: String(obj[k]) === String(v) }, l))); s.onchange = () => { obj[k] = typeof obj[k] === 'number' ? +s.value : s.value; after(); }; return s; };

  D.render = () => {
    const pg = $('#pg-duty'), db = CT.store.db, du = db.duty, al = db.alerts;
    pg.innerHTML = '';
    const statusCol = { on_duty: '#3fb27f', on_call: '#e8b931', off: '#7f8c9a' };
    pg.append(CT.el('div', { class: 'toolbar' }, CT.el('b', {}, 'Duty officers'),
      CT.el('span', { class: 'small muted' }, `${du.officers.filter((o) => o.status === 'on_duty').length} on duty, ${du.officers.filter((o) => o.status === 'on_call').length} on call. Names and numbers are fictional.`),
      CT.el('button', { onclick: () => { du.officers.push({ id: CT.store.nextId('O', du.officers), name: 'New officer', personId: '', role: 'Duty officer', phone: '', radio: 'Ch 1', status: 'off', shift: '' }); save(); D.render(); } }, '+ Add officer')));
    pg.append(table([
      { h: '', cell: (o) => CT.el('span', { class: 'dot', style: `background:${statusCol[o.status]}` }) },
      { h: 'Name', cell: (o) => field(o, 'name', 170) }, { h: 'Role', cell: (o) => field(o, 'role', 160) },
      { h: 'Status', cell: (o) => select(o, 'status', [['on_duty', 'On duty'], ['on_call', 'On call'], ['off', 'Off']], () => { save(); D.render(); }) },
      { h: 'Phone', cell: (o) => field(o, 'phone', 90) }, { h: 'Radio', cell: (o) => field(o, 'radio', 55) }, { h: 'Shift', cell: (o) => field(o, 'shift', 120) },
    ], du.officers, (o) => { if (confirm(`Delete officer ${o.name}?`)) { du.officers = du.officers.filter((x) => x !== o); save(); D.render(); } }));

    pg.append(CT.el('h2', { class: 'sect' }, 'Emergency and outside contacts'),
      CT.el('div', { class: 'toolbar' }, CT.el('button', { onclick: () => { du.contacts.push({ id: 'K_' + Date.now().toString(36).toUpperCase(), name: 'New contact', org: '', phone: '', kind: 'other' }); save(); D.render(); } }, '+ Add contact'),
        CT.el('span', { class: 'small muted' }, 'Contact ids are used in the alert levels below.')));
    pg.append(table([
      { h: 'Id', cell: (c) => CT.el('code', {}, c.id) }, { h: 'Name', cell: (c) => field(c, 'name', 230) }, { h: 'Organisation', cell: (c) => field(c, 'org', 140) },
      { h: 'Phone', cell: (c) => field(c, 'phone', 90) }, { h: 'Kind', cell: (c) => field(c, 'kind', 90) },
    ], du.contacts, (c) => { if (confirm(`Delete contact ${c.name}? Alert levels that name ${c.id} will skip it.`)) { du.contacts = du.contacts.filter((x) => x !== c); al.levels.forEach((l) => (l.notify = l.notify.filter((n) => n !== c.id))); CT.store.save('alerts'); save(); D.render(); } }));

    const saveA = () => CT.store.save('alerts');
    pg.append(CT.el('h2', { class: 'sect' }, 'Alert levels'), CT.el('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'Placeholder procedures for the prototype, not reviewed security advice. Notify: on-duty officers, on-call officers, and the contacts ticked.'));
    const who = [['onduty', 'On-duty officers'], ['oncall', 'On-call officers'], ...du.contacts.map((c) => [c.id, c.name])];
    al.levels.forEach((l) => {
      const acts = CT.el('textarea', { rows: Math.max(2, l.actions.length), style: 'width:100%' }); acts.value = l.actions.join('\n');
      acts.onchange = () => { l.actions = acts.value.split('\n').map((s) => s.trim()).filter(Boolean); saveA(); };
      const col = CT.el('input', { type: 'color', value: l.color, style: 'width:44px;padding:0 2px' }); col.onchange = () => { l.color = col.value; saveA(); D.render(); };
      pg.append(CT.el('div', { style: `border-left:6px solid ${l.color};background:var(--bar);border-radius:8px;padding:8px 10px;margin:8px 0` },
        CT.el('div', { class: 'row' }, CT.el('span', { class: 'chip', style: `background:${l.color}` }, `Level ${l.level}`), field(l, 'name', 220, saveA), col),
        CT.el('div', { class: 'row small' }, CT.el('span', { class: 'muted' }, 'Notify:'), ...who.map(([id, name]) => {
          const cb = CT.el('input', { type: 'checkbox', checked: l.notify.includes(id) }); cb.onchange = () => { l.notify = cb.checked ? [...new Set([...l.notify, id])] : l.notify.filter((x) => x !== id); saveA(); };
          return CT.el('label', { style: 'margin-right:8px' }, cb, ' ' + name);
        })),
        CT.el('div', { class: 'small muted' }, 'Actions (one per line):'), acts));
    });

    pg.append(CT.el('h2', { class: 'sect' }, 'Rules'), table([
      { h: 'On', cell: (r) => { const c = CT.el('input', { type: 'checkbox', checked: r.enabled }); c.onchange = () => { r.enabled = c.checked; saveA(); }; return c; } },
      { h: 'Rule', cell: (r) => CT.el('span', {}, r.name, ' ', CT.el('code', { class: 'small muted' }, r.id)) },
      { h: 'Raises level', cell: (r) => select(r, 'level', al.levels.map((l) => [l.level, `${l.level} - ${l.name}`]), saveA) },
      { h: 'Setting', cell: (r) => (r.seconds !== undefined ? CT.el('span', {}, (() => { const i = CT.el('input', { type: 'number', value: r.seconds, style: 'width:70px' }); i.onchange = () => { r.seconds = +i.value; saveA(); }; return i; })(), ' s') : '') },
    ], al.rules));
    pg.append(CT.el('h2', { class: 'sect' }, 'Open hours (used by the "outside open hours" rule)'),
      CT.el('div', {}, ...db.venue.schedule.open.map((o) => CT.el('div', { class: 'small' }, `${CT.DAYS[o.day]} ${o.from}-${o.to}  ${o.label}`))),
      CT.el('div', { class: 'small muted' }, 'Edit in venue.json (schedule.open) for now.'));
  };
})(window.CT);

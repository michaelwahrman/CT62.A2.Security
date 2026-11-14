// CT62.A1 - the "databases". A1 keeps them as five JSON files (data/*.json). Edits made in the
// browser are kept in this browser's localStorage and can be exported back to JSON files.
(function (CT) {
  'use strict';
  const KEY = 'ct62a1.db';
  const FILES = ['venue', 'people', 'duty', 'alerts', 'scenarios'];
  const listeners = [];
  const S = (CT.store = { db: null, edited: false, FILES });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  S.base = null;

  S.load = async () => {
    let base = null;
    if (location.protocol.startsWith('http')) {
      try {
        const parts = await Promise.all(FILES.map((f) => fetch(`data/${f}.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw 0; return r.json(); })));
        base = Object.fromEntries(FILES.map((f, i) => [f, parts[i]]));
      } catch (e) { base = null; }
    }
    if (!base) base = clone(window.CT62_BUNDLE); // file:// fallback (data/bundle.js)
    S.base = base;
    let local = null;
    if (!CT.params.has('fresh')) { try { local = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { local = null; } }
    S.db = local && FILES.every((f) => local[f]) ? local : clone(base);
    S.edited = !!local;
  };
  S.save = (what) => {
    S.edited = true;
    try { localStorage.setItem(KEY, JSON.stringify(S.db)); } catch (e) { CT.toast('Could not save in this browser (storage full or blocked). Use Export to keep your edits.', 5000); }
    listeners.forEach((fn) => fn(what));
  };
  S.on = (fn) => listeners.push(fn);
  S.reset = () => { try { localStorage.removeItem(KEY); } catch (e) {} S.db = clone(S.base); S.edited = false; listeners.forEach((fn) => fn('all')); };
  S.exportFile = (f) => CT.download(`${f}.json`, JSON.stringify(S.db[f], null, 2) + '\n');
  S.importFile = async (file) => {
    const name = file.name.replace(/\.json$/i, '');
    if (!FILES.includes(name)) throw new Error(`File must be named one of: ${FILES.map((f) => f + '.json').join(', ')}`);
    const obj = JSON.parse(await file.text());
    S.db[name] = obj; S.save(name); return name;
  };
  S.person = (id) => S.db.people.people.find((p) => p.id === id);
  S.nextId = (prefix, list) => { let n = 1; const ids = new Set(list.map((x) => x.id)); while (ids.has(prefix + String(n).padStart(prefix === 'P' ? 3 : 2, '0'))) n++; return prefix + String(n).padStart(prefix === 'P' ? 3 : 2, '0'); };
})(window.CT);

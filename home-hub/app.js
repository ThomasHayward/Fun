import { load, save, uid, normName, formatLoc, newStore, STORE_PRESETS, exportBackup, importBackup, wipe } from './data.js';
import { planRoute } from './route.js';

let db = load();
const $app = document.getElementById('app');

const commit = () => { save(db); render(); };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 3500);
}

// ---------- routing ----------
// #grocery | #grocery/<listId> | #store/<storeId> | #reminders | #notes | #notes/<noteId> | #settings
function route() {
  const [view = 'grocery', id = null] = location.hash.slice(1).split('/');
  return { view, id };
}
const go = (hash) => { location.hash = hash; };
window.addEventListener('hashchange', render);

const byId = (arr, id) => arr.find((x) => x.id === id);
const storeOf = (list) => byId(db.stores, list.storeId) || db.stores[0];
// The store an item is bought at: its own pick, else the list's main store.
const itemStore = (list, item) => byId(db.stores, item.at) || storeOf(list);
const locOf = (storeId, name) => (db.locations[storeId] || {})[normName(name)] || '';

function setLoc(storeId, name, loc) {
  db.locations[storeId] ??= {};
  const key = normName(name);
  if (loc.trim()) db.locations[storeId][key] = formatLoc(loc);
  else delete db.locations[storeId][key];
}

function lookupUrl(store, name) {
  if (store?.lookup) return store.lookup.replace('{q}', encodeURIComponent(name));
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} aisle ${store?.name || ''}`)}`;
}

// ---------- groceries ----------
function viewLists() {
  const cards = db.lists.map((l) => {
    const left = l.items.filter((i) => !i.checked).length;
    return `<button class="card list-card" data-action="open-list" data-id="${l.id}">
      <div><strong>${esc(l.name)}</strong><div class="muted">${esc(storeOf(l)?.name || 'No store')}</div></div>
      <span class="pill">${left} to get</span></button>`;
  }).join('');
  const stores = db.stores.map((s) => `<button class="chip" data-action="open-store" data-id="${s.id}">🏬 ${esc(s.name)}</button>`).join('');
  return `<header class="top"><h1>Groceries</h1><button class="btn" data-action="new-list">+ List</button></header>
    <div class="stack">${cards || '<p class="muted">No lists yet.</p>'}</div>
    <h2>Stores</h2>
    <p class="muted small">Tap a store to set the order you walk its aisles.</p>
    <div class="chips">${stores}<button class="chip" data-action="new-store">+ Store</button></div>`;
}

function itemRow(item, store) {
  const loc = locOf(store.id, item.name);
  const others = db.stores
    .filter((s) => s.id !== store.id && locOf(s.id, item.name))
    .map((s) => `${esc(s.name)} ${esc(locOf(s.id, item.name))}`);
  const picker = db.stores.length > 1
    ? `<select class="at" data-action="item-at" data-id="${item.id}" title="Store to buy at">${db.stores.map((s) =>
      `<option value="${s.id}" ${s.id === store.id ? 'selected' : ''}>@ ${esc(s.name)}</option>`).join('')}</select>`
    : '';
  return `<li class="item ${item.checked ? 'done' : ''}">
    <label class="check"><input type="checkbox" data-action="toggle-item" data-id="${item.id}" ${item.checked ? 'checked' : ''}><span></span></label>
    <span class="name"><span data-action="edit-item" data-id="${item.id}">${esc(item.name)}${item.qty ? ` <span class="muted">× ${esc(item.qty)}</span>` : ''}</span>
      <span class="sub">${picker}${others.length ? `<span class="muted small">${others.join(' · ')}</span>` : ''}</span></span>
    <button class="loc ${loc ? '' : 'empty'}" data-action="set-loc" data-id="${item.id}" title="Set aisle at ${esc(store.name)}">${loc ? esc(loc) : '+ aisle'}</button>
    <a class="icon-btn" href="${esc(lookupUrl(store, item.name))}" target="_blank" rel="noopener" title="Look up at ${esc(store.name)}">🔎</a>
    <button class="icon-btn" data-action="del-item" data-id="${item.id}" title="Remove">✕</button>
  </li>`;
}

function viewRoute(items, store) {
  const stops = planRoute(items, (i) => locOf(store.id, i.name), store.zones);
  return stops.map((s, n) => `<section class="stop">
      <h3>${s.location ? `<span class="stop-n">${n + 1}</span> ${esc(s.location)}` : '<span>❓ Aisle unknown <span class="muted small block">Tap 🔎 to look it up, then “+ aisle”</span></span>'}</h3>
      <ul class="items">${s.items.map((i) => itemRow(i, store)).join('')}</ul></section>`).join('');
}

function viewList(list) {
  const main = storeOf(list);
  const todo = list.items.filter((i) => !i.checked);
  const done = list.items.filter((i) => i.checked);
  const total = list.items.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;

  // One route per store this trip visits, main store first.
  const trips = [main, ...db.stores.filter((s) => s !== main)]
    .map((store) => ({ store, items: todo.filter((i) => itemStore(list, i) === store) }))
    .filter((t) => t.items.length);
  const routes = trips.length > 1
    ? trips.map((t) => `<div class="trip"><h2>🏬 ${esc(t.store.name)} <span class="muted small">${t.items.length} item${t.items.length === 1 ? '' : 's'}</span>
        <button class="btn ghost small" data-action="open-store" data-id="${t.store.id}">Aisle order</button></h2>
        ${viewRoute(t.items, t.store)}</div>`).join('')
    : trips.map((t) => viewRoute(t.items, t.store)).join('');

  const storeOpts = db.stores.map((s) => `<option value="${s.id}" ${s.id === main.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const suggestions = db.history.slice(0, 200).map((h) => `<option value="${esc(h)}">`).join('');

  return `<header class="top">
      <button class="icon-btn back" data-action="nav-hash" data-hash="grocery">‹</button>
      <h1 data-action="rename-list" data-id="${list.id}">${esc(list.name)}</h1>
      <button class="icon-btn" data-action="del-list" data-id="${list.id}" title="Delete list">🗑</button>
    </header>
    <div class="row">
      <label class="muted small">Main store</label>
      <select data-action="list-store" data-id="${list.id}">${storeOpts}</select>
      ${trips.length > 1 ? '' : `<button class="btn ghost small" data-action="open-store" data-id="${main.id}">Aisle order</button>`}
    </div>
    ${db.stores.length > 1 && total && trips.length < 2 ? '<p class="muted small">Getting something elsewhere? Change an item’s “@ store” and the list splits into one route per store.</p>' : ''}
    <form class="add" data-form="add-item">
      <input name="name" list="item-history" placeholder="Add an item…" autocomplete="off" required>
      <input name="qty" placeholder="Qty" class="qty" autocomplete="off">
      <button class="btn">Add</button>
      <datalist id="item-history">${suggestions}</datalist>
    </form>
    ${total ? `<div class="progress"><div style="width:${pct}%"></div></div><p class="muted small">${done.length} of ${total} in cart</p>` : ''}
    ${routes || (total ? '<p class="done-msg">🎉 Everything’s in the cart.</p>' : '<p class="muted">Add items above. Once you give an item an aisle, it’s remembered for that store forever.</p>')}
    ${done.length ? `<section class="stop cart"><h3>🛒 In cart <button class="btn ghost small" data-action="clear-checked">Clear</button></h3>
      <ul class="items">${done.map((i) => itemRow(i, itemStore(list, i))).join('')}</ul></section>` : ''}`;
}

function viewStore(store) {
  const known = Object.entries(db.locations[store.id] || {}).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));
  return `<header class="top">
      <button class="icon-btn back" data-action="back">‹</button>
      <h1>${esc(store.name)}</h1>
      <button class="icon-btn" data-action="del-store" data-id="${store.id}" title="Delete store">🗑</button>
    </header>
    <form class="stack" data-form="store" data-id="${store.id}">
      <label>Name <input name="name" value="${esc(store.name)}" required></label>
      <label>Walking order — one zone per line, in the order you walk the store
        <textarea name="zones" rows="10">${esc(store.zones.join('\n'))}</textarea></label>
      <p class="muted small">Target and Walmart aisles are a letter + number (e.g. <b>G12</b>): list the letters in the order you walk past them.
        Meijer uses numbered aisles: type just the number (e.g. <b>14</b>) and it files under the “Aisle” line.
        Add named spots like “Produce” or “Checkout” anywhere. Within a zone, items are ordered by number.</p>
      <label>Item lookup link (<code>{q}</code> = item name)
        <input name="lookup" value="${esc(store.lookup)}" placeholder="https://www.target.com/s?searchTerm={q}"></label>
      <div class="row">
        <span class="muted small">Reset to preset:</span>
        ${Object.entries(STORE_PRESETS).map(([k, p]) => `<button type="button" class="btn ghost small" data-action="preset" data-preset="${k}">${p.label}</button>`).join('')}
      </div>
      <button class="btn">Save store</button>
    </form>
    <h2>Remembered aisles (${known.length})</h2>
    ${known.length ? `<ul class="items">${known.map(([name, loc]) => `<li class="item">
        <span class="name">${esc(name)}</span><span class="loc">${esc(loc)}</span>
        <button class="icon-btn" data-action="forget-loc" data-store="${store.id}" data-name="${esc(name)}">✕</button></li>`).join('')}</ul>`
      : '<p class="muted">None yet — they fill in as you shop.</p>'}`;
}

// ---------- reminders ----------
const fmtDue = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function nextDue(r) {
  const d = new Date(r.due);
  const now = Date.now();
  do {
    if (r.repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (r.repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (r.repeat === 'monthly') d.setMonth(d.getMonth() + 1);
    else if (r.repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
  } while (d.getTime() <= now);
  return toLocalInput(d);
}

function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function viewReminders() {
  const now = Date.now();
  const open = db.reminders.filter((r) => !r.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const overdue = open.filter((r) => r.due && new Date(r.due) < now);
  const upcoming = open.filter((r) => !overdue.includes(r));
  const done = db.reminders.filter((r) => r.done);

  const row = (r) => `<li class="item ${r.done ? 'done' : ''}">
    <label class="check"><input type="checkbox" data-action="toggle-rem" data-id="${r.id}" ${r.done ? 'checked' : ''}><span></span></label>
    <span class="name">${esc(r.title)}
      <span class="muted small block">${r.due ? fmtDue(r.due) : 'No date'}${r.repeat !== 'none' ? ` · repeats ${r.repeat}` : ''}</span></span>
    ${r.due && !r.done ? `<button class="icon-btn" data-action="ics" data-id="${r.id}" title="Add to phone calendar">📅</button>` : ''}
    <button class="icon-btn" data-action="del-rem" data-id="${r.id}" title="Delete">✕</button></li>`;

  const section = (title, list, cls = '') => (list.length ? `<h2 class="${cls}">${title}</h2><ul class="items">${list.map(row).join('')}</ul>` : '');

  return `<header class="top"><h1>Reminders</h1></header>
    <form class="add wrap" data-form="add-rem">
      <input name="title" placeholder="Remind me to…" required autocomplete="off">
      <input name="due" type="datetime-local">
      <select name="repeat"><option value="none">Once</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
      <button class="btn">Add</button>
    </form>
    ${notifyHint()}
    ${section('Overdue', overdue, 'danger')}
    ${section('Upcoming', upcoming)}
    ${!open.length ? '<p class="muted">Nothing on your plate.</p>' : ''}
    ${done.length ? `<details><summary>Done (${done.length})</summary><ul class="items">${done.map(row).join('')}</ul>
      <button class="btn ghost small" data-action="clear-done-rem">Clear done</button></details>` : ''}`;
}

function notifyHint() {
  if (!('Notification' in window)) {
    return '<p class="hint">On iPhone, add Home Hub to your Home Screen to get pop-up alerts. Tap 📅 to put a reminder in your Calendar so it alerts even when the app is closed.</p>';
  }
  if (Notification.permission === 'default') {
    return '<p class="hint">Want pop-up alerts? <button class="btn small" data-action="ask-notify">Turn on notifications</button></p>';
  }
  return '<p class="hint small">Alerts pop up while Home Hub is open. Tap 📅 to add one to your calendar so it alerts even when the app is closed.</p>';
}

function downloadIcs(r) {
  const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const start = new Date(r.due);
  const end = new Date(start.getTime() + 15 * 60000);
  const rrule = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' }[r.repeat];
  const text = (s) => s.replace(/[\\;,]/g, (c) => `\\${c}`);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Home Hub//EN', 'BEGIN:VEVENT',
    `UID:${r.id}@homehub`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${text(r.title)}`, ...(rrule ? [`RRULE:FREQ=${rrule}`] : []),
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${text(r.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `${r.title.slice(0, 40).replace(/[^\w ]+/g, '') || 'reminder'}.ics`;
  a.click();
}

async function checkReminders() {
  const now = Date.now();
  let changed = false;
  for (const r of db.reminders) {
    if (r.done || !r.due || r.notified === r.due || new Date(r.due) > now) continue;
    r.notified = r.due;
    changed = true;
    toast(`⏰ ${r.title}`);
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) reg.showNotification('Home Hub', { body: r.title, tag: r.id, icon: 'icons/icon-192.png' });
      else new Notification('Home Hub', { body: r.title });
    }
  }
  if (changed) { save(db); if (route().view === 'reminders') render(); }
}

// ---------- notes ----------
function viewNotes() {
  const q = (viewNotes.query || '').toLowerCase();
  const notes = db.notes
    .filter((n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q))
    .sort((a, b) => (b.pinned - a.pinned) || b.updated - a.updated);
  return `<header class="top"><h1>Notes</h1><button class="btn" data-action="new-note">+ Note</button></header>
    <input class="search" data-input="note-search" placeholder="Search notes…" value="${esc(viewNotes.query || '')}">
    <div class="grid" id="note-grid">${notes.map((n) => `<button class="card note-card" data-action="open-note" data-id="${n.id}">
      <strong>${n.pinned ? '📌 ' : ''}${esc(n.title || 'Untitled')}</strong>
      <p class="muted">${esc(n.body.slice(0, 160))}</p>
      <span class="muted small">${new Date(n.updated).toLocaleDateString()}</span></button>`).join('') || '<p class="muted">No notes.</p>'}</div>`;
}

function viewNote(note) {
  return `<header class="top">
      <button class="icon-btn back" data-action="nav-hash" data-hash="notes">‹</button>
      <span class="muted small grow">Saved automatically</span>
      <button class="icon-btn" data-action="pin-note" data-id="${note.id}" title="Pin">${note.pinned ? '📌' : '📍'}</button>
      <button class="icon-btn" data-action="del-note" data-id="${note.id}" title="Delete">🗑</button>
    </header>
    <input class="note-title" data-input="note-title" data-id="${note.id}" placeholder="Title" value="${esc(note.title)}">
    <textarea class="note-body" data-input="note-body" data-id="${note.id}" placeholder="Start writing…">${esc(note.body)}</textarea>`;
}

// ---------- settings ----------
function viewSettings() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `<header class="top"><h1>Settings</h1></header>
    <section class="card stack">
      <h2>Install on your iPhone</h2>
      ${standalone ? '<p>✅ Installed — you’re running Home Hub as an app.</p>' : `<ol>
        <li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button.</li>
        <li>Choose <b>Add to Home Screen</b>.</li></ol>
        <p class="muted small">On a PC in Chrome or Edge, use the install icon in the address bar.</p>`}
    </section>
    <section class="card stack">
      <h2>Backup &amp; move data</h2>
      <p class="muted small">Everything is stored on this device only. Export a backup now and then, and use it to copy your lists between your PC and phone.</p>
      <div class="row">
        <button class="btn" data-action="export">Export backup</button>
        <label class="btn ghost">Import backup<input type="file" accept="application/json,.json" data-input="import" hidden></label>
      </div>
    </section>
    <section class="card stack">
      <h2>Danger zone</h2>
      <button class="btn danger" data-action="wipe">Erase everything on this device</button>
    </section>`;
}

// ---------- render ----------
function render() {
  const { view, id } = route();
  document.querySelectorAll('#tabs [data-view]').forEach((b) => {
    const active = b.dataset.view === view || (view === 'store' && b.dataset.view === 'grocery');
    b.classList.toggle('active', active);
  });
  let html;
  if (view === 'grocery') {
    const list = id && byId(db.lists, id);
    html = list ? viewList(list) : viewLists();
  } else if (view === 'store') {
    const store = byId(db.stores, id);
    html = store ? viewStore(store) : viewLists();
  } else if (view === 'reminders') html = viewReminders();
  else if (view === 'notes') {
    const note = id && byId(db.notes, id);
    html = note ? viewNote(note) : viewNotes();
  } else html = viewSettings();
  $app.innerHTML = html;
}

// ---------- actions ----------
const actions = {
  'nav': (el) => go(el.dataset.view),
  'nav-hash': (el) => go(el.dataset.hash),
  'back': () => history.back(),

  'new-list': () => {
    const name = prompt('List name', 'Groceries');
    if (!name) return;
    const list = { id: uid(), name: name.trim(), storeId: db.stores[0]?.id, items: [] };
    db.lists.push(list);
    save(db);
    go(`grocery/${list.id}`);
  },
  'open-list': (el) => go(`grocery/${el.dataset.id}`),
  'rename-list': (el) => {
    const list = byId(db.lists, el.dataset.id);
    const name = prompt('Rename list', list.name);
    if (name) { list.name = name.trim(); commit(); }
  },
  'del-list': (el) => {
    if (!confirm('Delete this list?')) return;
    db.lists = db.lists.filter((l) => l.id !== el.dataset.id);
    save(db);
    go('grocery');
  },
  'toggle-item': (el) => {
    const item = currentList().items.find((i) => i.id === el.dataset.id);
    item.checked = el.checked;
    commit();
  },
  'edit-item': (el) => {
    const item = currentList().items.find((i) => i.id === el.dataset.id);
    const name = prompt('Item', item.name);
    if (!name?.trim()) return;
    item.name = name.trim();
    commit();
  },
  'del-item': (el) => {
    const list = currentList();
    list.items = list.items.filter((i) => i.id !== el.dataset.id);
    commit();
  },
  'set-loc': (el) => {
    const list = currentList();
    const item = list.items.find((i) => i.id === el.dataset.id);
    const store = itemStore(list, item);
    const loc = prompt(`Where is “${item.name}” at ${store.name}?\n(e.g. G12, 14, Produce — leave blank to clear)`, locOf(store.id, item.name));
    if (loc === null) return;
    setLoc(store.id, item.name, loc);
    commit();
  },
  'clear-checked': () => {
    const list = currentList();
    list.items = list.items.filter((i) => !i.checked);
    commit();
  },

  'new-store': () => {
    const name = prompt('Store name (e.g. Walmart, or Meijer – Main St)');
    if (!name) return;
    const store = newStore(name);
    db.stores.push(store);
    save(db);
    go(`store/${store.id}`);
  },
  'open-store': (el) => go(`store/${el.dataset.id}`),
  'preset': (el) => {
    const form = el.closest('form');
    const preset = STORE_PRESETS[el.dataset.preset];
    form.zones.value = preset.zones.join('\n');
    form.lookup.value = preset.lookup;
  },
  'del-store': (el) => {
    if (db.stores.length === 1) return toast('You need at least one store.');
    if (!confirm('Delete this store and its remembered aisles?')) return;
    db.stores = db.stores.filter((s) => s.id !== el.dataset.id);
    delete db.locations[el.dataset.id];
    db.lists.forEach((l) => { if (l.storeId === el.dataset.id) l.storeId = db.stores[0].id; });
    save(db);
    go('grocery');
  },
  'forget-loc': (el) => {
    delete db.locations[el.dataset.store]?.[el.dataset.name];
    commit();
  },

  'toggle-rem': (el) => {
    const r = byId(db.reminders, el.dataset.id);
    if (el.checked && r.repeat !== 'none' && r.due) {
      r.due = nextDue(r);
      toast(`Next: ${fmtDue(r.due)}`);
    } else r.done = el.checked;
    commit();
  },
  'del-rem': (el) => { db.reminders = db.reminders.filter((r) => r.id !== el.dataset.id); commit(); },
  'clear-done-rem': () => { db.reminders = db.reminders.filter((r) => !r.done); commit(); },
  'ics': (el) => downloadIcs(byId(db.reminders, el.dataset.id)),
  'ask-notify': async () => { await Notification.requestPermission(); render(); },

  'new-note': () => {
    const note = { id: uid(), title: '', body: '', pinned: false, updated: Date.now() };
    db.notes.push(note);
    save(db);
    go(`notes/${note.id}`);
  },
  'open-note': (el) => go(`notes/${el.dataset.id}`),
  'pin-note': (el) => { const n = byId(db.notes, el.dataset.id); n.pinned = !n.pinned; commit(); },
  'del-note': (el) => {
    if (!confirm('Delete this note?')) return;
    db.notes = db.notes.filter((n) => n.id !== el.dataset.id);
    save(db);
    go('notes');
  },

  'export': () => exportBackup(db),
  'wipe': () => {
    if (!confirm('Erase all Home Hub notes, reminders, lists and stores on this device? Export a backup first if unsure.')) return;
    wipe();
    db = load();
    go('grocery');
    render();
  },
};

function currentList() {
  return byId(db.lists, route().id);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.tagName === 'SELECT') return;
  if (el.type === 'checkbox') return; // handled on change
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.type === 'checkbox' && el.dataset.action) return actions[el.dataset.action](el);
  if (el.dataset.action === 'item-at') {
    const list = currentList();
    const item = list.items.find((i) => i.id === el.dataset.id);
    if (el.value === list.storeId) delete item.at;
    else item.at = el.value;
    return commit();
  }
  if (el.dataset.action === 'list-store') {
    byId(db.lists, el.dataset.id).storeId = el.value;
    return commit();
  }
  if (el.dataset.input === 'import' && el.files[0]) {
    try {
      db = await importBackup(el.files[0]);
      save(db);
      toast('Backup imported.');
      render();
    } catch (err) {
      toast(err.message);
    }
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const kind = el.dataset.input;
  if (kind === 'note-title' || kind === 'note-body') {
    const note = byId(db.notes, el.dataset.id);
    note[kind === 'note-title' ? 'title' : 'body'] = el.value;
    note.updated = Date.now();
    save(db);
  } else if (kind === 'note-search') {
    viewNotes.query = el.value;
    const pos = el.selectionStart;
    render();
    const input = $app.querySelector('[data-input="note-search"]');
    input.focus();
    input.setSelectionRange(pos, pos);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  const f = Object.fromEntries(new FormData(form));
  if (form.dataset.form === 'add-item') {
    const list = currentList();
    const name = f.name.trim();
    if (!name) return;
    list.items.push({ id: uid(), name, qty: f.qty.trim(), checked: false });
    db.history = [name, ...db.history.filter((h) => normName(h) !== normName(name))].slice(0, 500);
    commit();
    $app.querySelector('[data-form="add-item"] input[name="name"]')?.focus();
  } else if (form.dataset.form === 'add-rem') {
    db.reminders.push({ id: uid(), title: f.title.trim(), due: f.due || '', repeat: f.repeat, done: false });
    commit();
  } else if (form.dataset.form === 'store') {
    const store = byId(db.stores, form.dataset.id);
    store.name = f.name.trim();
    store.zones = f.zones.split('\n').map((z) => z.trim()).filter(Boolean);
    store.lookup = f.lookup.trim();
    save(db);
    toast('Store saved.');
    history.back();
  }
});

// ---------- start ----------
if (!location.hash) history.replaceState(null, '', '#grocery');
render();
checkReminders();
setInterval(checkReminders, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { db = load(); render(); checkReminders(); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

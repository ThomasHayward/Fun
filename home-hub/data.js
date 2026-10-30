// Local storage of all app data, plus backup export/import.
const KEY = 'homehub.v1';

const LETTER_ZONES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// `match` picks the preset when a new store's name contains it.
export const STORE_PRESETS = {
  target: {
    label: 'Target',
    match: /target/i,
    zones: LETTER_ZONES,
    lookup: 'https://www.target.com/s?searchTerm={q}',
  },
  meijer: {
    label: 'Meijer',
    match: /meijer/i,
    zones: ['Produce', 'Bakery', 'Deli', 'Meat', 'Aisle', 'Dairy', 'Frozen', 'Pharmacy'],
    lookup: 'https://www.meijer.com/shopping/search.html?text={q}',
  },
  walmart: {
    label: 'Walmart',
    match: /walmart/i,
    zones: LETTER_ZONES,
    lookup: 'https://www.walmart.com/search?q={q}',
  },
  custom: {
    label: 'Grocery store',
    match: /$^/,
    zones: ['Produce', 'Bakery', 'Deli', 'Meat', 'Aisle', 'Dairy', 'Frozen'],
    lookup: '',
  },
};

export function newStore(name, presetKey) {
  const key = presetKey || Object.keys(STORE_PRESETS).find((k) => STORE_PRESETS[k].match.test(name)) || 'custom';
  const { zones, lookup } = STORE_PRESETS[key];
  return { id: uid(), name: name.trim(), zones: [...zones], lookup };
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const normName = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// "14" -> "Aisle 14", "g12" -> "G12", "produce" -> "Produce"
export function formatLoc(s) {
  const t = s.trim().replace(/\s+/g, ' ');
  if (/^\d+[a-z]?$/i.test(t)) return `Aisle ${t.toUpperCase()}`;
  if (/^[a-z]{1,2}\s?\d+$/i.test(t)) return t.replace(/\s/, '').toUpperCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function blank() {
  const target = newStore('Target');
  const meijer = newStore('Meijer');
  return {
    notes: [],
    reminders: [],
    stores: [target, meijer],
    lists: [{ id: uid(), name: 'Groceries', storeId: target.id, items: [] }],
    locations: {}, // storeId -> { normalized item name -> "G12" }
    history: [], // previously added item names, most recent first
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  return blank();
}

export function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function wipe() {
  localStorage.removeItem(KEY); // only this app's data — other apps share this site's storage
}

export function exportBackup(db) {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `home-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.lists) || !Array.isArray(data.notes)) {
    throw new Error('That file is not a Home Hub backup.');
  }
  return { ...blank(), ...data };
}

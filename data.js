// Local storage of all app data, plus backup export/import.
const KEY = 'homehub.v1';

const TARGET_ZONES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const STORE_PRESETS = {
  target: {
    kind: 'target',
    zones: TARGET_ZONES,
    lookup: 'https://www.target.com/s?searchTerm={q}',
  },
  custom: {
    kind: 'custom',
    zones: ['Produce', 'Bakery', 'Deli', 'Meat', 'Aisle 1', 'Aisle 2', 'Aisle 3', 'Aisle 4', 'Aisle 5', 'Dairy', 'Frozen'],
    lookup: '',
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const normName = (s) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function blank() {
  const target = { id: uid(), name: 'Target', ...structuredClone(STORE_PRESETS.target) };
  return {
    notes: [],
    reminders: [],
    stores: [target],
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

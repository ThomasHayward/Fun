// Local storage of all app data, plus backup export/import.
const KEY = 'homehub.v1';

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  updated: number;
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Reminder {
  id: string;
  title: string;
  due: string; // datetime-local value ("2026-10-30T18:00"), or '' for no date
  repeat: Repeat;
  done: boolean;
  notified?: string; // the `due` we last alerted for
}

export interface Store {
  id: string;
  name: string;
  zones: string[]; // walking order
  lookup: string; // item lookup URL with {q}, or '' for a web search
}

export interface Item {
  id: string;
  name: string;
  qty: string;
  checked: boolean;
  at?: string; // store id to buy at, when not the list's main store
}

export interface GroceryList {
  id: string;
  name: string;
  storeId: string;
  items: Item[];
}

export interface Db {
  notes: Note[];
  reminders: Reminder[];
  stores: Store[];
  lists: GroceryList[];
  locations: Record<string, Record<string, string>>; // storeId -> { normalized item name -> "G12" }
  history: string[]; // previously added item names, most recent first
}

const LETTER_ZONES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

interface Preset {
  label: string;
  match: RegExp; // picks the preset when a new store's name matches
  zones: string[];
  lookup: string;
}

const siteSearch = (domain: string) => `https://www.google.com/search?q=site%3A${domain}+{q}`;

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
    lookup: siteSearch('meijer.com'),
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
} satisfies Record<string, Preset>;

export type PresetKey = keyof typeof STORE_PRESETS;

export const isPresetKey = (k: string | undefined): k is PresetKey => !!k && k in STORE_PRESETS;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function newStore(name: string, presetKey?: PresetKey): Store {
  const keys = Object.keys(STORE_PRESETS) as PresetKey[];
  const key = presetKey ?? keys.find((k) => STORE_PRESETS[k].match.test(name)) ?? 'custom';
  const { zones, lookup } = STORE_PRESETS[key];
  return { id: uid(), name: name.trim(), zones: [...zones], lookup };
}

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// "14" -> "Aisle 14", "g12" -> "G12", "produce" -> "Produce"
export function formatLoc(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (/^\d+[a-z]?$/i.test(t)) return `Aisle ${t.toUpperCase()}`;
  if (/^[a-z]{1,2}\s?\d+$/i.test(t)) return t.replace(/\s/, '').toUpperCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function blank(): Db {
  const target = newStore('Target');
  const meijer = newStore('Meijer');
  return {
    notes: [],
    reminders: [],
    stores: [target, meijer],
    lists: [{ id: uid(), name: 'Groceries', storeId: target.id, items: [] }],
    locations: {},
    history: [],
  };
}

// Fixes up data saved by older versions of the app.
function migrate(db: Db): Db {
  for (const s of db.stores) {
    // meijer.com's own search link didn't work; use a site search instead.
    if (s.lookup === 'https://www.meijer.com/shopping/search.html?text={q}') s.lookup = STORE_PRESETS.meijer.lookup;
  }
  return db;
}

export function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...blank(), ...JSON.parse(raw) });
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  return blank();
}

export function save(db: Db): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function wipe(): void {
  localStorage.removeItem(KEY); // only this app's data — other apps share this site's storage
}

export function exportBackup(db: Db): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `home-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file: File): Promise<Db> {
  const data: Partial<Db> = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.lists) || !Array.isArray(data.notes)) {
    throw new Error('That file is not a Home Hub backup.');
  }
  return migrate({ ...blank(), ...data });
}

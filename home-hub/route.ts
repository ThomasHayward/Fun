// Orders shopping items into a walking route through a store.
//
// A store has `zones` listed in the order you walk them (e.g. Target aisle
// letters "A", "B", ... or named sections like "Produce"). An item's location
// ("G12", "Produce", "Aisle 4") is matched to the longest zone it starts with,
// then items are ordered by zone position and the aisle number inside it.

interface LocationKey {
  zone: number;
  num: number;
  label: string;
}

export interface Stop<T> {
  location: string; // '' when unknown
  key: LocationKey | null;
  items: T[];
}

function matchZone(loc: string, zones: string[]) {
  const up = loc.toUpperCase();
  let best = -1;
  let bestLen = 0;
  zones.forEach((z, i) => {
    const zu = z.trim().toUpperCase();
    if (!zu || !up.startsWith(zu) || zu.length <= bestLen) return;
    // "A" must not swallow "Aisle 4" — a single-letter zone needs a digit or end after it.
    const rest = up.slice(zu.length);
    if (zu.length === 1 && rest && !/^[\s-]*\d/.test(rest)) return;
    best = i;
    bestLen = zu.length;
  });
  return { index: best, rest: loc.slice(bestLen) };
}

export function locationKey(loc: string, zones: string[]): LocationKey | null {
  if (!loc || !loc.trim()) return null;
  const { index, rest } = matchZone(loc.trim(), zones);
  const num = parseInt(rest.match(/\d+/)?.[0] ?? '', 10);
  return {
    zone: index === -1 ? zones.length : index,
    num: Number.isNaN(num) ? -1 : num,
    label: loc.trim().toUpperCase(),
  };
}

function compareKeys(a: LocationKey, b: LocationKey): number {
  return a.zone - b.zone || a.num - b.num || a.label.localeCompare(b.label, undefined, { numeric: true });
}

/**
 * Groups items into route stops, in walking order; unknown locations come last (location '').
 * @param locate returns an item's location string, or '' when unknown
 * @param zones  walking order of zones
 */
export function planRoute<T>(items: T[], locate: (item: T) => string, zones: string[]): Stop<T>[] {
  const stops = new Map<string, Stop<T>>();
  for (const item of items) {
    const loc = (locate(item) || '').trim();
    const id = loc.toUpperCase();
    let stop = stops.get(id);
    if (!stop) {
      stop = { location: loc, key: locationKey(loc, zones), items: [] };
      stops.set(id, stop);
    }
    stop.items.push(item);
  }
  return [...stops.values()].sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return compareKeys(a.key, b.key);
  });
}

// Orders shopping items into a walking route through a store.
//
// A store has `zones` listed in the order you walk them (e.g. Target aisle
// letters "A", "B", ... or named sections like "Produce"). An item's location
// ("G12", "Produce", "Aisle 4") is matched to the longest zone it starts with,
// then items are ordered by zone position and the aisle number inside it.

function matchZone(loc, zones) {
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

export function locationKey(loc, zones) {
  if (!loc || !loc.trim()) return null;
  const { index, rest } = matchZone(loc.trim(), zones);
  const num = parseInt((rest.match(/\d+/) || [])[0], 10);
  return {
    zone: index === -1 ? zones.length : index,
    num: Number.isNaN(num) ? -1 : num,
    label: loc.trim().toUpperCase(),
  };
}

function compareKeys(a, b) {
  return a.zone - b.zone || a.num - b.num || a.label.localeCompare(b.label, undefined, { numeric: true });
}

/**
 * Groups items into route stops.
 * @param items  [{ name, ... }]
 * @param locate (item) => location string or ''
 * @param zones  walking order of zones
 * @returns [{ location, items }] in walking order; unknown locations last (location '').
 */
export function planRoute(items, locate, zones) {
  const stops = new Map();
  for (const item of items) {
    const loc = (locate(item) || '').trim();
    const id = loc.toUpperCase();
    if (!stops.has(id)) stops.set(id, { location: loc, key: locationKey(loc, zones), items: [] });
    stops.get(id).items.push(item);
  }
  return [...stops.values()].sort((a, b) => {
    if (!a.key) return 1;
    if (!b.key) return -1;
    return compareKeys(a.key, b.key);
  });
}

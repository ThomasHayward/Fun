// Spaced repetition scheduling, a simplified SM-2 (the algorithm Anki grew out of).

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface CardState {
  ease: number; // interval multiplier, starts at 2.5
  interval: number; // days until the next review (0 = still learning)
  due: number; // timestamp
  reps: number; // successful reviews in a row
  lapses: number; // times forgotten
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const RELEARN_MINUTES = 10;

export const RATINGS: Rating[] = ['again', 'hard', 'good', 'easy'];

export const isDue = (s: CardState | undefined, now = Date.now()) => !s || s.due <= now;
export const isNew = (s: CardState | undefined) => !s;

export function schedule(prev: CardState | undefined, rating: Rating, now = Date.now()): CardState {
  const s: CardState = prev ? { ...prev } : { ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0 };
  switch (rating) {
    case 'again':
      s.lapses += prev ? 1 : 0;
      s.reps = 0;
      s.interval = 0;
      s.ease = Math.max(1.3, s.ease - 0.2);
      s.due = now + RELEARN_MINUTES * MINUTE;
      return s;
    case 'hard':
      s.interval = s.reps === 0 ? 1 : Math.max(1, Math.round(s.interval * 1.2));
      s.ease = Math.max(1.3, s.ease - 0.15);
      break;
    case 'good':
      s.interval = s.reps === 0 ? 2 : s.reps === 1 ? 5 : Math.round(s.interval * s.ease);
      break;
    case 'easy':
      s.interval = s.reps === 0 ? 4 : Math.round(Math.max(s.interval, 1) * s.ease * 1.3);
      s.ease += 0.15;
      break;
  }
  s.reps++;
  s.due = now + s.interval * DAY;
  return s;
}

/** Short label for when a rating would bring the card back, e.g. "10m", "3d", "2mo". */
export function nextLabel(prev: CardState | undefined, rating: Rating): string {
  const now = Date.now();
  const ms = schedule(prev, rating, now).due - now;
  if (ms < DAY) return `${Math.round(ms / MINUTE)}m`;
  const days = Math.round(ms / DAY);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

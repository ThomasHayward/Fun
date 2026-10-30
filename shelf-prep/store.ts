// Saved progress and user content, plus the merged view of starter + user content.
import { CARDS, QUESTIONS, SYSTEMS, type Card, type Question, type SystemId } from './content.js';
import type { CardState } from './srs.js';

const KEY = 'shelfprep.v1';

export interface Attempt {
  qid: string;
  choice: number;
  correct: boolean;
  at: number;
}

export interface Flag {
  note: string;
  at: number;
}

export type QuizMode = 'tutor' | 'timed';

export interface QuizSession {
  ids: string[];
  mode: QuizMode;
  index: number;
  answers: (number | null)[];
  submitted: boolean[]; // tutor mode: answer locked in and explanation shown
  marked: boolean[];
  struck: number[][]; // crossed-out choices per question
  startedAt: number;
  endsAt: number | null; // timed mode deadline
  finished: boolean;
}

export interface Db {
  attempts: Attempt[];
  cardStates: Record<string, CardState>;
  customQuestions: Question[];
  customCards: Card[];
  questionEdits: Record<string, Question>; // edits to starter questions, by id
  cardEdits: Record<string, Card>; // edits to starter cards, by id
  hidden: string[]; // deleted starter question/card ids
  flags: Record<string, Flag>; // question/card id -> flag
  session: QuizSession | null;
}

function blank(): Db {
  return {
    attempts: [],
    cardStates: {},
    customQuestions: [],
    customCards: [],
    questionEdits: {},
    cardEdits: {},
    hidden: [],
    flags: {},
    session: null,
  };
}

export function load(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...blank(), ...JSON.parse(raw) };
  } catch (err) {
    console.warn('Could not read saved data', err);
  }
  return blank();
}

export function save(db: Db): void {
  localStorage.setItem(KEY, JSON.stringify(db));
}

export function wipe(): void {
  localStorage.removeItem(KEY); // only this app's data; other apps share this site's storage
}

export const isSystemId = (s: string | undefined): s is SystemId => SYSTEMS.some((x) => x.id === s);
export const systemName = (id: SystemId) => SYSTEMS.find((s) => s.id === id)?.name ?? id;
export const isStarter = (id: string) => id.startsWith('q-') || id.startsWith('c-');

// ---------- merged content ----------
export function allQuestions(db: Db): Question[] {
  const hidden = new Set(db.hidden);
  return [
    ...QUESTIONS.filter((q) => !hidden.has(q.id)).map((q) => db.questionEdits[q.id] ?? q),
    ...db.customQuestions,
  ];
}

export function allCards(db: Db): Card[] {
  const hidden = new Set(db.hidden);
  return [
    ...CARDS.filter((c) => !hidden.has(c.id)).map((c) => db.cardEdits[c.id] ?? c),
    ...db.customCards,
  ];
}

export const originalQuestion = (id: string) => QUESTIONS.find((q) => q.id === id);
export const originalCard = (id: string) => CARDS.find((c) => c.id === id);

// ---------- stats ----------
/** The most recent attempt at each question. */
export function latestAttempts(db: Db): Map<string, Attempt> {
  const latest = new Map<string, Attempt>();
  for (const a of db.attempts) {
    const prev = latest.get(a.qid);
    if (!prev || a.at >= prev.at) latest.set(a.qid, a);
  }
  return latest;
}

export interface Score {
  answered: number; // distinct questions answered
  correct: number; // of those, answered correctly most recently
  total: number; // questions available
}

export const pct = (s: Score) => (s.answered ? Math.round((s.correct / s.answered) * 100) : null);

export function scoreBy<K extends string>(db: Db, keyOf: (q: Question) => K): Map<K, Score> {
  const latest = latestAttempts(db);
  const scores = new Map<K, Score>();
  for (const q of allQuestions(db)) {
    const key = keyOf(q);
    const s = scores.get(key) ?? { answered: 0, correct: 0, total: 0 };
    s.total++;
    const a = latest.get(q.id);
    if (a) {
      s.answered++;
      if (a.correct) s.correct++;
    }
    scores.set(key, s);
  }
  return scores;
}

export function overallScore(db: Db): Score {
  const s: Score = { answered: 0, correct: 0, total: 0 };
  for (const v of scoreBy(db, () => 'all').values()) Object.assign(s, v);
  return s;
}

// ---------- backup ----------
export function exportBackup(db: Db): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `shelf-prep-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function importBackup(file: File): Promise<Db> {
  const data: Partial<Db> = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.attempts) || typeof data.cardStates !== 'object') {
    throw new Error('That file is not a Shelf Prep backup.');
  }
  return { ...blank(), ...data };
}

import { SYSTEMS, type Card, type Question, type SystemId } from './content.js';
import {
  load, save, wipe, allQuestions, allCards, latestAttempts, scoreBy, overallScore, pct, systemName, isSystemId, isStarter,
  originalQuestion, originalCard, exportBackup, importBackup, type Db, type QuizMode, type QuizSession, type Score,
} from './store.js';
import { RATINGS, isDue, isNew, nextLabel, schedule, type Rating } from './srs.js';
import { bodySvg, level, type Level } from './body.js';

let db = load();
const $app = document.getElementById('app') as HTMLElement;

const commit = () => { save(db); render(); };

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
const LETTERS = 'ABCDEFGH';
const SECONDS_PER_QUESTION = 90; // shelf exam pace
const NEW_CARDS_PER_SESSION = 20;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(msg: string) {
  const t = document.getElementById('toast') as HTMLElement;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const shuffle = <T>(arr: T[]) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- routing ----------
// #home | #system/<id> | #quiz | #quiz/new | #quiz/review/<i> | #cards | #cards/<all|system>
// #progress | #library | #library/q/<id|new> | #library/c/<id|new> | #library/import
function route() {
  const [view = 'home', ...rest] = location.hash.slice(1).split('/');
  return { view, rest };
}
const go = (hash: string) => { location.hash = hash; };
window.addEventListener('hashchange', render);

// ---------- shared bits ----------
const questionById = (id: string | undefined) => allQuestions(db).find((q) => q.id === id);
const cardById = (id: string | undefined) => allCards(db).find((c) => c.id === id);

function systemLevels(): Record<SystemId, Level> {
  const scores = scoreBy(db, (q) => q.system);
  return Object.fromEntries(SYSTEMS.map((s) => [s.id, level(pct(scores.get(s.id) ?? { answered: 0, correct: 0, total: 0 }))])) as Record<SystemId, Level>;
}

const SYSTEM_NAMES = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.name])) as Record<SystemId, string>;

function scoreChip(s: Score | undefined) {
  const p = s ? pct(s) : null;
  return `<span class="chip-score lvl-${level(p)}">${p === null ? 'New' : `${p}%`}</span>`;
}

function dueCards(scope: SystemId | 'all') {
  const now = Date.now();
  const cards = allCards(db).filter((c) => scope === 'all' || c.system === scope);
  const due = cards.filter((c) => !isNew(db.cardStates[c.id]) && isDue(db.cardStates[c.id], now));
  const fresh = cards.filter((c) => isNew(db.cardStates[c.id]));
  return { due, fresh };
}

function flagButton(id: string) {
  const flagged = !!db.flags[id];
  return `<button class="btn ghost small" data-action="flag" data-id="${id}" title="Report a problem with this item">${flagged ? '⚑ Flagged' : '⚐ Flag'}</button>`;
}

// ---------- home ----------
function viewHome() {
  const scores = scoreBy(db, (q) => q.system);
  const overall = overallScore(db);
  const { due, fresh } = dueCards('all');
  const active = db.session && !db.session.finished;
  const list = SYSTEMS.map((s) => {
    const sc = scores.get(s.id);
    return `<button class="system-row" data-action="open-system" data-id="${s.id}">
      <span>${esc(s.name)}<span class="muted small block">${sc ? `${sc.answered}/${sc.total} questions done` : 'No questions yet'}</span></span>
      ${scoreChip(sc)}</button>`;
  }).join('');
  return `<header class="top"><h1>Shelf Prep</h1><span class="muted">Internal Medicine</span></header>
    <div class="home">
      <section class="map-card card">
        ${bodySvg(systemLevels(), SYSTEM_NAMES)}
        <div class="legend small">
          <span><i class="dot lvl-none"></i>Not started</span><span><i class="dot lvl-low"></i>&lt;60%</span>
          <span><i class="dot lvl-mid"></i>60–74%</span><span><i class="dot lvl-high"></i>75%+</span>
        </div>
        <p class="muted small center">Tap an organ to study that system.</p>
      </section>
      <div class="stack">
        <section class="card stack">
          <h2>Today</h2>
          ${active ? `<button class="btn" data-action="nav" data-hash="quiz">Resume question block (${db.session!.index + 1}/${db.session!.ids.length})</button>` : ''}
          <button class="btn ${active ? 'ghost' : ''}" data-action="nav" data-hash="quiz/new">Start a question block</button>
          <button class="btn ghost" data-action="nav" data-hash="cards/all">Flashcards: ${due.length} due${fresh.length ? ` · ${fresh.length} new` : ''}</button>
          <p class="muted small">${overall.answered ? `${overall.answered} of ${overall.total} questions done · ${pct(overall)}% correct` : `${overall.total} questions and ${allCards(db).length} flashcards ready.`}</p>
        </section>
        <section class="card stack"><h2>Systems</h2>${list}</section>
      </div>
    </div>`;
}

// ---------- system ----------
function viewSystem(id: SystemId) {
  const qs = allQuestions(db).filter((q) => q.system === id);
  const score = scoreBy(db, (q) => q.system).get(id);
  const topics = scoreBy(db, (q) => (q.system === id ? q.topic : ''));
  topics.delete('');
  const { due, fresh } = dueCards(id);
  const topicRows = [...topics.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, s]) =>
    `<li class="item"><span class="name">${esc(t)}<span class="muted small block">${s.answered}/${s.total} done</span></span>${scoreChip(s)}</li>`).join('');
  return `<header class="top">
      <button class="icon-btn back" data-action="nav" data-hash="home" aria-label="Back">‹</button>
      <h1>${esc(systemName(id))}</h1>${scoreChip(score)}
    </header>
    <div class="stack">
      <div class="row">
        <button class="btn" data-action="practice-system" data-id="${id}" ${qs.length ? '' : 'disabled'}>Practice ${Math.min(10, qs.length)} questions</button>
        <button class="btn ghost" data-action="nav" data-hash="cards/${id}">Flashcards: ${due.length} due${fresh.length ? ` · ${fresh.length} new` : ''}</button>
      </div>
      <p class="muted small">Unanswered questions come first, then ones you missed.</p>
      <h2>Topics</h2>
      ${topicRows ? `<ul class="items">${topicRows}</ul>` : '<p class="muted">No questions in this system yet. Add some in the Library.</p>'}
    </div>`;
}

// ---------- quiz: setup ----------
function viewQuizSetup() {
  const scores = scoreBy(db, (q) => q.system);
  const latest = latestAttempts(db);
  const missed = [...latest.values()].filter((a) => !a.correct).length;
  const active = db.session && !db.session.finished;
  return `<header class="top"><h1>New question block</h1></header>
    ${active ? '<p class="hint">Starting a new block will discard your unfinished one.</p>' : ''}
    <form class="stack" data-form="quiz-setup">
      <fieldset><legend>Systems</legend>
        <div class="checks">${SYSTEMS.map((s) => `<label class="check-row"><input type="checkbox" name="sys" value="${s.id}" checked>
          ${esc(s.name)} <span class="muted small">(${scores.get(s.id)?.total ?? 0})</span></label>`).join('')}</div>
        <div class="row"><button type="button" class="btn ghost small" data-action="check-all" data-on="1">All</button>
          <button type="button" class="btn ghost small" data-action="check-all" data-on="">None</button></div>
      </fieldset>
      <fieldset><legend>Questions</legend>
        <label class="check-row"><input type="radio" name="pool" value="unused" checked> Unused first</label>
        <label class="check-row"><input type="radio" name="pool" value="missed"> Only ones I missed (${missed})</label>
        <label class="check-row"><input type="radio" name="pool" value="all"> Any</label>
        <label>How many <select name="count"><option>5</option><option selected>10</option><option>20</option><option>40</option><option value="999">All available</option></select></label>
      </fieldset>
      <fieldset><legend>Mode</legend>
        <label class="check-row"><input type="radio" name="mode" value="tutor" checked> <span><b>Tutor</b> <span class="muted small block">See the answer and explanation after each question.</span></span></label>
        <label class="check-row"><input type="radio" name="mode" value="timed"> <span><b>Timed test</b> <span class="muted small block">${SECONDS_PER_QUESTION} seconds per question like the shelf; review at the end.</span></span></label>
      </fieldset>
      <button class="btn">Start</button>
    </form>`;
}

function pickQuestions(systems: SystemId[], pool: string, count: number): string[] {
  const latest = latestAttempts(db);
  const qs = shuffle(allQuestions(db).filter((q) => systems.includes(q.system)));
  let chosen: Question[];
  if (pool === 'missed') chosen = qs.filter((q) => latest.get(q.id)?.correct === false);
  else if (pool === 'unused') {
    // Unused, then missed, then the rest.
    const rank = (q: Question) => { const a = latest.get(q.id); return !a ? 0 : !a.correct ? 1 : 2; };
    chosen = [...qs].sort((a, b) => rank(a) - rank(b));
  } else chosen = qs;
  return chosen.slice(0, count).map((q) => q.id);
}

function startQuiz(ids: string[], mode: QuizMode) {
  if (!ids.length) return toast('No questions match those settings.');
  const now = Date.now();
  db.session = {
    ids,
    mode,
    index: 0,
    answers: ids.map(() => null),
    submitted: ids.map(() => false),
    marked: ids.map(() => false),
    struck: ids.map(() => []),
    startedAt: now,
    endsAt: mode === 'timed' ? now + ids.length * SECONDS_PER_QUESTION * 1000 : null,
    finished: false,
  };
  save(db);
  if (route().view === 'quiz' && route().rest.length === 0) render();
  else go('quiz');
}

// ---------- quiz: running & review ----------
function fmtClock(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function choiceList(q: Question, s: QuizSession, i: number, reveal: boolean) {
  const chosen = s.answers[i];
  return `<ol class="choices">${q.choices.map((c, ci) => {
    const cls = [
      chosen === ci ? 'chosen' : '',
      s.struck[i]?.includes(ci) ? 'struck' : '',
      reveal && ci === q.answer ? 'correct' : '',
      reveal && chosen === ci && ci !== q.answer ? 'incorrect' : '',
    ].join(' ');
    return `<li class="choice ${cls}">
      <button class="choice-btn" data-action="choose" data-i="${ci}" ${reveal ? 'disabled' : ''}>
        <span class="letter">${LETTERS[ci]}</span><span class="choice-text">${esc(c)}</span></button>
      ${reveal ? '' : `<button class="icon-btn strike" data-action="strike" data-i="${ci}" title="Cross out" aria-label="Cross out choice ${LETTERS[ci]}">✕</button>`}
      ${reveal && q.why[ci] ? `<p class="why">${esc(q.why[ci])}</p>` : ''}
    </li>`;
  }).join('')}</ol>`;
}

function explanationBlock(q: Question, s: QuizSession, i: number) {
  const right = s.answers[i] === q.answer;
  const verdict = s.answers[i] === null ? '<b>Not answered.</b>' : right ? '<b class="ok">Correct.</b>' : '<b class="bad">Incorrect.</b>';
  return `<section class="explanation card">
      <p>${verdict} The answer is <b>${LETTERS[q.answer]}</b>.</p>
      <p>${esc(q.explanation)}</p>
      ${q.objective ? `<p class="objective"><b>Takeaway:</b> ${esc(q.objective)}</p>` : ''}
      <p class="muted small">${esc(systemName(q.system))} · ${esc(q.topic)}</p>
      <div class="row">${flagButton(q.id)}<button class="btn ghost small" data-action="nav" data-hash="library/q/${q.id}">Edit</button></div>
    </section>`;
}

function navStrip(s: QuizSession, current: number, reviewing: boolean) {
  return `<nav class="qnav" aria-label="Questions">${s.ids.map((id, i) => {
    const q = questionById(id);
    let cls = s.answers[i] !== null ? 'answered' : '';
    if (reviewing && q) cls = s.answers[i] === q.answer ? 'right' : 'wrong';
    return `<button class="qpill ${cls} ${i === current ? 'current' : ''} ${s.marked[i] ? 'marked' : ''}"
      data-action="${reviewing ? 'review-goto' : 'goto'}" data-i="${i}">${i + 1}</button>`;
  }).join('')}</nav>`;
}

function viewQuizRun(s: QuizSession) {
  const i = s.index;
  const q = questionById(s.ids[i]);
  if (!q) return `<p>This question was deleted. <button class="btn" data-action="next">Skip</button></p>`;
  const tutor = s.mode === 'tutor';
  const reveal = tutor && s.submitted[i];
  const last = i === s.ids.length - 1;
  const timer = s.endsAt ? `<span class="timer" id="timer">${fmtClock(s.endsAt - Date.now())}</span>` : '';
  let footer: string;
  if (tutor) {
    footer = reveal
      ? `${explanationBlock(q, s, i)}<div class="row end"><button class="btn" data-action="${last ? 'finish' : 'next'}">${last ? 'Finish block' : 'Next question'}</button></div>`
      : `<div class="row end"><button class="btn" data-action="submit" ${s.answers[i] === null ? 'disabled' : ''}>Submit</button></div>`;
  } else {
    footer = `<div class="row between">
        <button class="btn ghost" data-action="prev" ${i === 0 ? 'disabled' : ''}>‹ Previous</button>
        <button class="btn ghost" data-action="mark">${s.marked[i] ? '★ Marked' : '☆ Mark'}</button>
        ${last ? '<button class="btn" data-action="finish">End block</button>' : '<button class="btn" data-action="next">Next ›</button>'}
      </div>`;
  }
  return `<header class="top">
      <span class="grow"><b>Question ${i + 1}</b> <span class="muted">of ${s.ids.length}</span></span>
      ${timer}
      <button class="btn ghost small" data-action="finish">${tutor ? 'End' : 'End block'}</button>
    </header>
    ${navStrip(s, i, false)}
    <article class="question">
      <p class="stem">${esc(q.stem)}</p>
      ${choiceList(q, s, i, reveal)}
    </article>
    ${footer}
    <p class="muted small keys">Keys: A–E or 1–5 to choose · Enter to ${tutor ? 'submit / next' : 'go next'}</p>`;
}

function viewResults(s: QuizSession) {
  const qs = s.ids.map((id) => questionById(id));
  const right = qs.filter((q, i) => q && s.answers[i] === q.answer).length;
  const unanswered = s.answers.filter((a) => a === null).length;
  const percent = Math.round((right / s.ids.length) * 100);
  const bySystem = new Map<SystemId, { right: number; total: number }>();
  qs.forEach((q, i) => {
    if (!q) return;
    const t = bySystem.get(q.system) ?? { right: 0, total: 0 };
    t.total++;
    if (s.answers[i] === q.answer) t.right++;
    bySystem.set(q.system, t);
  });
  const missedIds = s.ids.filter((id, i) => { const q = qs[i]; return q && s.answers[i] !== q.answer; });
  return `<header class="top"><h1>Block complete</h1></header>
    <section class="card result-hero">
      <div class="big lvl-text-${level(percent)}">${percent}%</div>
      <p>${right} of ${s.ids.length} correct${unanswered ? ` · ${unanswered} unanswered` : ''} · ${fmtClock(Date.now() - s.startedAt)} elapsed</p>
    </section>
    <h2>By system</h2>
    <ul class="items">${[...bySystem.entries()].map(([sys, t]) => `<li class="item"><span class="name">${esc(systemName(sys))}</span>
      <span class="muted">${t.right}/${t.total}</span></li>`).join('')}</ul>
    <h2>Questions</h2>
    ${navStrip(s, -1, true)}
    <div class="row">
      <button class="btn" data-action="review-goto" data-i="0">Review answers</button>
      ${missedIds.length ? `<button class="btn ghost" data-action="retry-missed">Retry ${plural(missedIds.length, 'missed question')}</button>` : ''}
      <button class="btn ghost" data-action="nav" data-hash="quiz/new">New block</button>
    </div>`;
}

function viewReview(s: QuizSession, i: number) {
  const q = questionById(s.ids[i]);
  if (!q) return '<p>This question was deleted.</p>';
  return `<header class="top">
      <button class="icon-btn back" data-action="nav" data-hash="quiz" aria-label="Back to results">‹</button>
      <span class="grow"><b>Review ${i + 1}</b> <span class="muted">of ${s.ids.length}</span></span>
    </header>
    ${navStrip(s, i, true)}
    <article class="question"><p class="stem">${esc(q.stem)}</p>${choiceList(q, s, i, true)}</article>
    ${explanationBlock(q, s, i)}
    <div class="row between">
      <button class="btn ghost" data-action="review-goto" data-i="${i - 1}" ${i === 0 ? 'disabled' : ''}>‹ Previous</button>
      ${i === s.ids.length - 1 ? '<button class="btn" data-action="nav" data-hash="quiz">Back to results</button>'
        : `<button class="btn" data-action="review-goto" data-i="${i + 1}">Next ›</button>`}
    </div>`;
}

function recordAttempt(s: QuizSession, i: number) {
  const q = questionById(s.ids[i]);
  const choice = s.answers[i];
  if (!q || choice === null) return;
  db.attempts.push({ qid: q.id, choice, correct: choice === q.answer, at: Date.now() });
}

function finishQuiz() {
  const s = db.session;
  if (!s || s.finished) return;
  if (s.mode === 'timed') s.ids.forEach((_, i) => recordAttempt(s, i));
  s.finished = true;
  commit();
  if (route().view !== 'quiz' || route().rest.length) go('quiz');
}

// Timed mode clock: tick the display, end the block when time runs out.
setInterval(() => {
  const s = db.session;
  if (!s || s.finished || !s.endsAt) return;
  const left = s.endsAt - Date.now();
  if (left <= 0) { toast('Time is up.'); finishQuiz(); return; }
  const el = document.getElementById('timer');
  if (el) {
    el.textContent = fmtClock(left);
    el.classList.toggle('low', left < 5 * 60 * 1000);
  }
}, 1000);

// ---------- flashcards ----------
interface CardSession {
  scope: SystemId | 'all';
  queue: string[];
  revealed: boolean;
  reviewed: number;
}
let cardSession: CardSession | null = null;

function startCards(scope: SystemId | 'all') {
  const { due, fresh } = dueCards(scope);
  due.sort((a, b) => (db.cardStates[a.id]?.due ?? 0) - (db.cardStates[b.id]?.due ?? 0));
  cardSession = { scope, queue: [...due, ...fresh.slice(0, NEW_CARDS_PER_SESSION)].map((c) => c.id), revealed: false, reviewed: 0 };
}

function viewCardHome() {
  const rows = [{ id: 'all' as const, name: 'All systems' }, ...SYSTEMS].map((s) => {
    const { due, fresh } = dueCards(s.id);
    return `<button class="system-row" data-action="nav" data-hash="cards/${s.id}">
      <span>${esc(s.name)}</span><span class="muted small">${due.length} due · ${fresh.length} new</span></button>`;
  }).join('');
  return `<header class="top"><h1>Flashcards</h1></header>
    <p class="muted small">Cards you know come back less often; cards you miss come back sooner (spaced repetition).</p>
    <section class="card stack">${rows}</section>`;
}

function viewCardReview(scope: SystemId | 'all') {
  if (!cardSession || cardSession.scope !== scope) startCards(scope);
  const cs = cardSession!;
  const title = scope === 'all' ? 'All systems' : systemName(scope);
  const head = `<header class="top">
      <button class="icon-btn back" data-action="end-cards" aria-label="Back">‹</button>
      <span class="grow"><b>${esc(title)}</b> <span class="muted">${cs.queue.length} left</span></span>
    </header>`;
  const id = cs.queue[0];
  const c = cardById(id);
  if (!id || !c) {
    return `${head}<section class="card center stack">
      <p class="done-msg">${cs.reviewed ? `🎉 Done! You reviewed ${plural(cs.reviewed, 'card')}.` : 'Nothing due right now.'}</p>
      <button class="btn" data-action="end-cards">Back to decks</button></section>`;
  }
  const state = db.cardStates[c.id];
  return `${head}
    <section class="flashcard card" data-action="${cs.revealed ? '' : 'reveal'}">
      <p class="muted small">${esc(systemName(c.system))}${isNew(state) ? ' · new' : ''}</p>
      <p class="front">${esc(c.front)}</p>
      ${cs.revealed ? `<hr><p class="answer">${esc(c.back)}</p>` : '<p class="muted small center">Tap or press Space to show the answer</p>'}
    </section>
    ${cs.revealed ? `<div class="ratings">${RATINGS.map((r, n) => `<button class="btn rate rate-${r}" data-action="rate" data-rating="${r}">
        ${r[0].toUpperCase() + r.slice(1)}<span class="small block">${nextLabel(state, r)}</span><span class="key">${n + 1}</span></button>`).join('')}</div>
      <div class="row center">${flagButton(c.id)}<button class="btn ghost small" data-action="nav" data-hash="library/c/${c.id}">Edit</button></div>`
      : '<div class="row center"><button class="btn" data-action="reveal">Show answer</button></div>'}`;
}

function rateCard(rating: Rating) {
  const cs = cardSession;
  const id = cs?.queue.shift();
  if (!cs || !id) return;
  db.cardStates[id] = schedule(db.cardStates[id], rating);
  if (rating === 'again') cs.queue.push(id); // see it again this session
  cs.revealed = false;
  cs.reviewed++;
  commit();
}

// ---------- progress ----------
function viewProgress() {
  const overall = overallScore(db);
  const scores = scoreBy(db, (q) => q.system);
  const topics = [...scoreBy(db, (q) => `${q.system}|${q.topic}`).entries()]
    .filter(([, s]) => s.answered)
    .sort((a, b) => (pct(a[1]) ?? 0) - (pct(b[1]) ?? 0))
    .slice(0, 8);
  const missed = [...latestAttempts(db).values()].filter((a) => !a.correct && questionById(a.qid));
  const studied = Object.keys(db.cardStates).length;
  const { due } = dueCards('all');
  const bars = SYSTEMS.map((s) => {
    const sc = scores.get(s.id);
    const p = sc ? pct(sc) : null;
    return `<li class="bar-row" data-action="open-system" data-id="${s.id}">
      <span class="bar-label">${esc(s.name)}</span>
      <span class="bar"><span class="fill lvl-${level(p)}" style="width:${p ?? 0}%"></span></span>
      <span class="bar-val">${p === null ? '—' : `${p}%`}<span class="muted small"> ${sc?.answered ?? 0}/${sc?.total ?? 0}</span></span></li>`;
  }).join('');
  return `<header class="top"><h1>Progress</h1></header>
    <div class="stats">
      <div class="stat card"><b>${overall.answered}/${overall.total}</b><span class="muted small">questions done</span></div>
      <div class="stat card"><b>${pct(overall) ?? '—'}${overall.answered ? '%' : ''}</b><span class="muted small">correct (latest try)</span></div>
      <div class="stat card"><b>${studied}</b><span class="muted small">cards studied</span></div>
      <div class="stat card"><b>${due.length}</b><span class="muted small">cards due</span></div>
    </div>
    <h2>By system</h2>
    <ul class="bars">${bars}</ul>
    ${topics.length ? `<h2>Weakest topics</h2><ul class="items">${topics.map(([key, s]) => {
      const [sys, topic] = key.split('|');
      return `<li class="item"><span class="name">${esc(topic)}<span class="muted small block">${esc(systemName(sys as SystemId))} · ${s.correct}/${s.answered} right</span></span>${scoreChip(s)}</li>`;
    }).join('')}</ul>` : ''}
    <div class="row">
      ${missed.length ? `<button class="btn" data-action="practice-missed">Retry ${plural(missed.length, 'missed question')}</button>` : ''}
      <button class="btn ghost" data-action="nav" data-hash="quiz/new">New block</button>
    </div>`;
}

// ---------- library ----------
const lib = { type: 'q' as 'q' | 'c', system: '' as SystemId | '', query: '', flagged: false };

function viewLibrary() {
  const q = lib.query.toLowerCase();
  const sysMatch = (s: SystemId) => !lib.system || s === lib.system;
  const flagMatch = (id: string) => !lib.flagged || !!db.flags[id];
  const badges = (id: string, edited: boolean) => [
    isStarter(id) ? '' : '<span class="badge">Yours</span>',
    edited ? '<span class="badge">Edited</span>' : '',
    db.flags[id] ? '<span class="badge warn">⚑ Flagged</span>' : '',
  ].join('');
  let rows: string;
  if (lib.type === 'q') {
    rows = allQuestions(db)
      .filter((x) => sysMatch(x.system) && flagMatch(x.id) && (!q || `${x.topic} ${x.stem}`.toLowerCase().includes(q)))
      .map((x) => `<button class="lib-row" data-action="nav" data-hash="library/q/${x.id}">
        <span class="muted small">${esc(systemName(x.system))} · ${esc(x.topic)} ${badges(x.id, !!db.questionEdits[x.id])}</span>
        <span class="clip">${esc(x.stem)}</span></button>`).join('');
  } else {
    rows = allCards(db)
      .filter((x) => sysMatch(x.system) && flagMatch(x.id) && (!q || `${x.front} ${x.back}`.toLowerCase().includes(q)))
      .map((x) => `<button class="lib-row" data-action="nav" data-hash="library/c/${x.id}">
        <span class="muted small">${esc(systemName(x.system))} ${badges(x.id, !!db.cardEdits[x.id])}</span>
        <span class="clip">${esc(x.front)}</span></button>`).join('');
  }
  const flagCount = Object.keys(db.flags).length;
  return `<header class="top"><h1>Library</h1>
      <button class="btn small" data-action="nav" data-hash="library/${lib.type}/new">+ ${lib.type === 'q' ? 'Question' : 'Card'}</button></header>
    <div class="tabs-inline">
      <button class="${lib.type === 'q' ? 'on' : ''}" data-action="lib-type" data-type="q">Questions</button>
      <button class="${lib.type === 'c' ? 'on' : ''}" data-action="lib-type" data-type="c">Flashcards</button>
    </div>
    <div class="row filters">
      <input class="grow" data-input="lib-query" placeholder="Search…" value="${esc(lib.query)}">
      <select data-input="lib-system"><option value="">All systems</option>${SYSTEMS.map((s) => `<option value="${s.id}" ${lib.system === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
      <label class="check-row"><input type="checkbox" data-input="lib-flagged" ${lib.flagged ? 'checked' : ''}> Flagged (${flagCount})</label>
    </div>
    <div class="stack" id="lib-list">${rows || '<p class="muted">Nothing matches.</p>'}</div>
    <section class="card stack">
      <h2>Import &amp; backup</h2>
      <button class="btn ghost" data-action="nav" data-hash="library/import">Import flashcards (Anki, spreadsheet)</button>
      <p class="muted small">Progress is saved on this device only. Export a backup to keep it safe or move it to another device.</p>
      <div class="row">
        <button class="btn ghost" data-action="export">Export backup</button>
        <label class="btn ghost">Import backup<input type="file" accept="application/json,.json" data-input="import-backup" hidden></label>
        <button class="btn danger small" data-action="wipe">Erase all progress</button>
      </div>
      <p class="muted small">The starter questions and cards were written by an AI for practice. They can contain mistakes, so check anything surprising against a trusted resource, and use ⚐ Flag to mark it.</p>
    </section>`;
}

function systemSelect(selected: SystemId) {
  return `<select name="system">${SYSTEMS.map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>`;
}

function flagNote(id: string) {
  const f = db.flags[id];
  return f ? `<p class="hint">⚑ Flagged${f.note ? `: “${esc(f.note)}”` : ''} <button type="button" class="btn ghost small" data-action="unflag" data-id="${id}">Clear flag</button></p>` : '';
}

function viewEditQuestion(id: string) {
  const isNewQ = id === 'new';
  const q: Question = isNewQ
    ? { id: '', system: lib.system || 'cardio', topic: '', stem: '', choices: ['', '', '', '', ''], answer: 0, why: ['', '', '', '', ''], explanation: '', objective: '' }
    : questionById(id) ?? (() => { throw new Error('Question not found'); })();
  const slots = Math.max(5, q.choices.length);
  const edited = !!db.questionEdits[id];
  return `<header class="top">
      <button class="icon-btn back" data-action="back" aria-label="Back">‹</button>
      <h1>${isNewQ ? 'New question' : 'Edit question'}</h1>
    </header>
    ${isNewQ ? '' : flagNote(id)}
    <form class="stack" data-form="question" data-id="${esc(id)}">
      <div class="row"><label class="grow">System ${systemSelect(q.system)}</label>
        <label class="grow">Topic <input name="topic" value="${esc(q.topic)}" required placeholder="e.g. Heart failure"></label></div>
      <label>Question stem <textarea name="stem" rows="6" required>${esc(q.stem)}</textarea></label>
      <fieldset><legend>Answer choices (select the correct one)</legend>
        ${Array.from({ length: slots }, (_, i) => `<div class="choice-edit">
          <label class="check-row"><input type="radio" name="answer" value="${i}" ${q.answer === i ? 'checked' : ''}> <b>${LETTERS[i]}</b></label>
          <div class="stack grow"><input name="choice${i}" value="${esc(q.choices[i] ?? '')}" placeholder="Choice ${LETTERS[i]}${i >= 2 ? ' (optional)' : ''}">
          <input name="why${i}" value="${esc(q.why[i] ?? '')}" placeholder="Why it's right or wrong (optional)" class="small-input"></div></div>`).join('')}
      </fieldset>
      <label>Explanation <textarea name="explanation" rows="5">${esc(q.explanation)}</textarea></label>
      <label>Takeaway (one line) <input name="objective" value="${esc(q.objective)}"></label>
      <div class="row">
        <button class="btn">Save</button>
        ${isNewQ ? '' : `<button type="button" class="btn danger small" data-action="delete-item" data-id="${esc(id)}">Delete</button>`}
        ${edited ? `<button type="button" class="btn ghost small" data-action="restore-item" data-id="${esc(id)}">Restore original</button>` : ''}
      </div>
    </form>`;
}

function viewEditCard(id: string) {
  const isNewC = id === 'new';
  const c: Card = isNewC ? { id: '', system: lib.system || 'cardio', front: '', back: '' } : cardById(id) ?? (() => { throw new Error('Card not found'); })();
  const edited = !!db.cardEdits[id];
  return `<header class="top">
      <button class="icon-btn back" data-action="back" aria-label="Back">‹</button>
      <h1>${isNewC ? 'New flashcard' : 'Edit flashcard'}</h1>
    </header>
    ${isNewC ? '' : flagNote(id)}
    <form class="stack" data-form="card" data-id="${esc(id)}">
      <label>System ${systemSelect(c.system)}</label>
      <label>Front <textarea name="front" rows="3" required>${esc(c.front)}</textarea></label>
      <label>Back <textarea name="back" rows="4" required>${esc(c.back)}</textarea></label>
      <div class="row">
        <button class="btn">Save</button>
        ${isNewC ? '' : `<button type="button" class="btn danger small" data-action="delete-item" data-id="${esc(id)}">Delete</button>`}
        ${edited ? `<button type="button" class="btn ghost small" data-action="restore-item" data-id="${esc(id)}">Restore original</button>` : ''}
      </div>
    </form>`;
}

function viewImport() {
  return `<header class="top">
      <button class="icon-btn back" data-action="nav" data-hash="library" aria-label="Back">‹</button>
      <h1>Import flashcards</h1>
    </header>
    <form class="stack" data-form="import">
      <p class="muted small">Paste or choose a file with one card per line: <b>front</b>, <b>back</b>, and optionally <b>system</b>,
        separated by tabs or commas. From Anki, use <i>File → Export → Notes in Plain Text</i>. From Excel or Google Sheets, save as CSV.</p>
      <label class="btn ghost">Choose file<input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" data-input="import-file" hidden></label>
      <label>Cards <textarea name="text" rows="10" placeholder="Front of card&#9;Back of card&#9;Cardiology"></textarea></label>
      <label>System for cards that don't name one ${systemSelect(lib.system || 'cardio')}</label>
      <button class="btn">Import</button>
    </form>`;
}

// Parses tab- or comma-separated rows (decided per line), honoring quoted CSV fields.
// Lines starting with # are Anki export headers.
function parseRows(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  return lines.map((line) => {
    if (line.includes('\t')) return line.split('\t');
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  });
}

// Anki exports can contain HTML; keep line breaks and decode entities, drop everything else.
function toPlainText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p)>/gi, '\n').replace(/<[^>]*>/g, '');
  const el = document.createElement('textarea');
  el.innerHTML = withBreaks;
  return el.value.trim();
}

function matchSystem(raw: string | undefined): SystemId | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  return SYSTEMS.find((x) => x.id === s || x.name.toLowerCase().startsWith(s) || s.startsWith(x.name.toLowerCase().split(' ')[0]))?.id ?? null;
}

// ---------- render ----------
const TAB_FOR: Record<string, string> = { home: 'home', system: 'home', quiz: 'quiz', cards: 'cards', progress: 'progress', library: 'library' };

function render() {
  const { view, rest } = route();
  document.querySelectorAll<HTMLElement>('#tabs [data-hash]').forEach((b) => b.classList.toggle('active', b.dataset.hash === TAB_FOR[view]));
  let html: string;
  try {
    html = renderView(view, rest);
  } catch (err) {
    console.error(err);
    html = `<p>Something went wrong: ${esc(err instanceof Error ? err.message : err)}</p><button class="btn" data-action="nav" data-hash="home">Home</button>`;
  }
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}

function renderView(view: string, rest: string[]): string {
  const s = db.session;
  switch (view) {
    case 'system':
      return isSystemId(rest[0]) ? viewSystem(rest[0]) : viewHome();
    case 'quiz':
      if (rest[0] === 'new') return viewQuizSetup();
      if (rest[0] === 'review' && s?.finished) return viewReview(s, Math.min(Number(rest[1]) || 0, s.ids.length - 1));
      if (s && !s.finished) return viewQuizRun(s);
      if (s?.finished) return viewResults(s);
      return viewQuizSetup();
    case 'cards':
      if (rest[0] === 'all' || isSystemId(rest[0])) return viewCardReview(rest[0] as SystemId | 'all');
      return viewCardHome();
    case 'progress':
      return viewProgress();
    case 'library':
      if (rest[0] === 'q' && rest[1]) return viewEditQuestion(rest[1]);
      if (rest[0] === 'c' && rest[1]) return viewEditCard(rest[1]);
      if (rest[0] === 'import') return viewImport();
      return viewLibrary();
    default:
      return viewHome();
  }
}

// ---------- actions ----------
const session = () => db.session;

function chooseAnswer(i: number) {
  const s = session();
  if (!s || s.finished) return;
  if (s.mode === 'tutor' && s.submitted[s.index]) return;
  s.answers[s.index] = i;
  s.struck[s.index] = (s.struck[s.index] ?? []).filter((x) => x !== i);
  commit();
}

function submitAnswer() {
  const s = session();
  if (!s || s.answers[s.index] === null || s.submitted[s.index]) return;
  s.submitted[s.index] = true;
  recordAttempt(s, s.index);
  commit();
}

function move(delta: number) {
  const s = session();
  if (!s) return;
  s.index = Math.max(0, Math.min(s.ids.length - 1, s.index + delta));
  commit();
}

function toggleFlag(id: string) {
  if (db.flags[id]) {
    if (!confirm('Remove the flag from this item?')) return;
    delete db.flags[id];
  } else {
    const note = prompt('What looks wrong? (optional)');
    if (note === null) return;
    db.flags[id] = { note: note.trim(), at: Date.now() };
    toast('Flagged. Find it later under Library → Flagged.');
  }
  commit();
}

type Action = (el: HTMLElement) => void;

const actions: Record<string, Action> = {
  'nav': (el) => go(el.dataset.hash ?? 'home'),
  'back': () => history.back(),
  'open-system': (el) => go(`system/${el.dataset.id}`),

  'practice-system': (el) => {
    const sys = el.dataset.id;
    if (isSystemId(sys)) startQuiz(pickQuestions([sys], 'unused', 10), 'tutor');
  },
  'practice-missed': () => {
    const ids = [...latestAttempts(db).values()].filter((a) => !a.correct && questionById(a.qid)).map((a) => a.qid);
    startQuiz(shuffle(ids), 'tutor');
  },
  'retry-missed': () => {
    const s = session();
    if (!s) return;
    startQuiz(s.ids.filter((id, i) => questionById(id)?.answer !== s.answers[i]), 'tutor');
  },
  'check-all': (el) => {
    el.closest('form')?.querySelectorAll<HTMLInputElement>('input[name="sys"]').forEach((c) => { c.checked = !!el.dataset.on; });
  },
  'choose': (el) => chooseAnswer(Number(el.dataset.i)),
  'strike': (el) => {
    const s = session();
    if (!s) return;
    const i = Number(el.dataset.i);
    const list = s.struck[s.index] ?? [];
    s.struck[s.index] = list.includes(i) ? list.filter((x) => x !== i) : [...list, i];
    commit();
  },
  'submit': submitAnswer,
  'next': () => move(1),
  'prev': () => move(-1),
  'goto': (el) => { const s = session(); if (s) { s.index = Number(el.dataset.i); commit(); } },
  'mark': () => { const s = session(); if (s) { s.marked[s.index] = !s.marked[s.index]; commit(); } },
  'finish': () => {
    const s = session();
    if (!s) return;
    const open = s.answers.filter((a) => a === null).length;
    if (s.mode === 'timed' && open && !confirm(`${plural(open, 'question')} unanswered. End the block anyway?`)) return;
    finishQuiz();
  },
  'review-goto': (el) => go(`quiz/review/${el.dataset.i}`),

  'reveal': () => { if (cardSession) { cardSession.revealed = true; render(); } },
  'rate': (el) => rateCard(el.dataset.rating as Rating),
  'end-cards': () => { cardSession = null; go('cards'); },

  'flag': (el) => { if (el.dataset.id) toggleFlag(el.dataset.id); },
  'unflag': (el) => { if (el.dataset.id) { delete db.flags[el.dataset.id]; commit(); } },

  'lib-type': (el) => { lib.type = el.dataset.type === 'c' ? 'c' : 'q'; render(); },
  'delete-item': (el) => {
    const id = el.dataset.id ?? '';
    if (!confirm('Delete this item? Your answer history for it is kept.')) return;
    if (isStarter(id)) db.hidden.push(id);
    db.customQuestions = db.customQuestions.filter((q) => q.id !== id);
    db.customCards = db.customCards.filter((c) => c.id !== id);
    delete db.questionEdits[id];
    delete db.cardEdits[id];
    save(db);
    go('library');
  },
  'restore-item': (el) => {
    const id = el.dataset.id ?? '';
    if (!confirm('Discard your edits and restore the original?')) return;
    delete db.questionEdits[id];
    delete db.cardEdits[id];
    commit();
  },

  'export': () => exportBackup(db),
  'wipe': () => {
    if (!confirm('Erase all progress, your own questions and cards, and edits on this device? Export a backup first if unsure.')) return;
    wipe();
    db = load();
    cardSession = null;
    go('home');
    render();
  },
};

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-action]');
  if (!el || el instanceof HTMLSelectElement || el instanceof HTMLInputElement) return;
  const fn = actions[el.dataset.action ?? ''];
  if (fn) { e.preventDefault(); fn(el); }
});

// SVG organs are focusable "buttons": activate with Enter/Space.
document.addEventListener('keydown', (e) => {
  const target = e.target as Element;
  if ((e.key === 'Enter' || e.key === ' ') && target instanceof SVGElement) {
    const el = target.closest<SVGElement>('[data-action="open-system"]');
    if (el) { e.preventDefault(); go(`system/${el.dataset.id}`); }
    return;
  }
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const { view, rest } = route();
  const key = e.key.toLowerCase();
  if (view === 'quiz' && !rest.length && db.session && !db.session.finished) {
    const s = db.session;
    const n = '12345678'.indexOf(key) >= 0 ? '12345678'.indexOf(key) : LETTERS.toLowerCase().indexOf(key);
    if (n >= 0 && key.length === 1) {
      const q = questionById(s.ids[s.index]);
      if (q && n < q.choices.length) { e.preventDefault(); chooseAnswer(n); }
    } else if (key === 'enter') {
      e.preventDefault();
      if (s.mode === 'tutor' && !s.submitted[s.index]) submitAnswer();
      else if (s.index < s.ids.length - 1) move(1);
    } else if (key === 'arrowright') move(1);
    else if (key === 'arrowleft') move(-1);
  } else if (view === 'cards' && rest.length && cardSession?.queue.length) {
    if (!cardSession.revealed && (key === ' ' || key === 'enter')) { e.preventDefault(); actions.reveal(document.body); }
    else if (cardSession.revealed && '1234'.includes(key) && key.length === 1) { e.preventDefault(); rateCard(RATINGS[Number(key) - 1]); }
  }
});

document.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.input === 'lib-query') {
    lib.query = el.value;
    const pos = el.selectionStart;
    render();
    const input = $app.querySelector<HTMLInputElement>('[data-input="lib-query"]');
    input?.focus();
    input?.setSelectionRange(pos, pos);
  }
});

document.addEventListener('change', async (e) => {
  const el = e.target as HTMLInputElement | HTMLSelectElement;
  const kind = el.dataset.input;
  if (kind === 'lib-system') { lib.system = isSystemId(el.value) ? el.value : ''; render(); }
  else if (kind === 'lib-flagged') { lib.flagged = (el as HTMLInputElement).checked; render(); }
  else if (kind === 'import-file') {
    const file = (el as HTMLInputElement).files?.[0];
    const box = el.closest('form')?.querySelector<HTMLTextAreaElement>('textarea[name="text"]');
    if (file && box) box.value = await file.text();
  } else if (kind === 'import-backup') {
    const file = (el as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      db = await importBackup(file);
      save(db);
      cardSession = null;
      toast('Backup imported.');
      render();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err));
    }
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  e.preventDefault();
  const fd = new FormData(form);
  const field = (name: string) => String(fd.get(name) ?? '').trim();
  const kind = form.dataset.form;

  if (kind === 'quiz-setup') {
    const systems = fd.getAll('sys').map(String).filter(isSystemId);
    if (!systems.length) return toast('Pick at least one system.');
    if (db.session && !db.session.finished && !confirm('Discard your unfinished block?')) return;
    startQuiz(pickQuestions(systems, field('pool'), Number(field('count'))), field('mode') === 'timed' ? 'timed' : 'tutor');
  } else if (kind === 'question') {
    const id = form.dataset.id ?? 'new';
    const system = isSystemId(field('system')) ? field('system') as SystemId : 'cardio';
    // Keep only filled-in choices, carrying the answer and explanations along.
    const slots = [...Array(8).keys()].filter((i) => fd.has(`choice${i}`));
    const filled = slots.filter((i) => field(`choice${i}`));
    const answerSlot = Number(field('answer'));
    if (filled.length < 2) return toast('Add at least two answer choices.');
    if (!filled.includes(answerSlot)) return toast('Select which filled-in choice is correct.');
    const q: Question = {
      id: id === 'new' ? `u-${uid()}` : id,
      system,
      topic: field('topic'),
      stem: field('stem'),
      choices: filled.map((i) => field(`choice${i}`)),
      answer: filled.indexOf(answerSlot),
      why: filled.map((i) => field(`why${i}`)),
      explanation: field('explanation'),
      objective: field('objective'),
    };
    if (id === 'new') db.customQuestions.push(q);
    else if (isStarter(id)) {
      if (JSON.stringify(q) === JSON.stringify(originalQuestion(id))) delete db.questionEdits[id];
      else db.questionEdits[id] = q;
    } else db.customQuestions = db.customQuestions.map((x) => (x.id === id ? q : x));
    save(db);
    toast('Saved.');
    history.back();
  } else if (kind === 'card') {
    const id = form.dataset.id ?? 'new';
    const c: Card = {
      id: id === 'new' ? `u-${uid()}` : id,
      system: isSystemId(field('system')) ? field('system') as SystemId : 'cardio',
      front: field('front'),
      back: field('back'),
    };
    if (id === 'new') db.customCards.push(c);
    else if (isStarter(id)) {
      if (JSON.stringify(c) === JSON.stringify(originalCard(id))) delete db.cardEdits[id];
      else db.cardEdits[id] = c;
    } else db.customCards = db.customCards.map((x) => (x.id === id ? c : x));
    save(db);
    toast('Saved.');
    history.back();
  } else if (kind === 'import') {
    const fallback = isSystemId(field('system')) ? field('system') as SystemId : 'cardio';
    const rows = parseRows(String(fd.get('text') ?? ''));
    const cards: Card[] = rows
      .map(([front = '', back = '', sys]) => ({ front: toPlainText(front), back: toPlainText(back), sys }))
      .filter((r) => r.front && r.back && !(r.front.toLowerCase() === 'front' && r.back.toLowerCase() === 'back'))
      .map((r) => ({ id: `u-${uid()}`, system: matchSystem(r.sys) ?? fallback, front: r.front, back: r.back }));
    if (!cards.length) return toast('No cards found. Each line needs a front and a back.');
    db.customCards.push(...cards);
    lib.type = 'c';
    save(db);
    toast(`Imported ${plural(cards.length, 'card')}.`);
    go('library');
  }
});

// ---------- start ----------
if (!location.hash) history.replaceState(null, '', '#home');
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

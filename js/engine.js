// =====================================================================
//  מנוע המשחק: מצב, שמירה, חישוב שיפורים, דעיכה, משימות, רמות.
// =====================================================================
import {
  STATS, STAT_KEYS, ACTIVITIES, TESTS, TRAINING_STATUS,
  computeDose, clamp, fmt,
} from './research.js';

const STORE_KEY = 'ascend.v1';

// ---------------- תאריכים ----------------
export function dayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function parseDay(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(k, n) { const d = parseDay(k); d.setDate(d.getDate() + n); return dayKey(d); }
export function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
export function today() { return dayKey(); }

// ---------------- מצב ----------------
export let state = null;

export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { state = null; }
  return state;
}
export function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { console.warn('save failed', e); }
}
export function replaceState(s) { state = s; save(); }
export function resetAll() { localStorage.removeItem(STORE_KEY); state = null; }

export function createPlayer(profile) {
  const t = today();
  const status = TRAINING_STATUS[profile.trainingStatus] || TRAINING_STATUS.untrained;
  const stats = {};
  for (const k of STAT_KEYS) {
    const S = STATS[k];
    // מצב נפשי לא "מתאמן" — תמיד מתחיל מאפס על העקומה, ומכויל לפי WHO-5
    const n0 = k === 'MND' ? 0 : status.n0;
    const abs = S.gmax * (1 - Math.exp(-n0));
    stats[k] = { abs, base: abs, gmax: S.gmax, lastStim: t, stimDay: null, stimCount: 0 };
  }
  state = {
    version: 1,
    profile: { ...profile, startedAt: t },
    stats,
    xp: 0,
    log: [],
    quests: {},
    tests: [],
    baselines: {},
    checkins: {},
    health: {},
    importedWorkouts: {},
    history: {},
    streak: { count: 0, best: 0, lastDay: null },
    lastDecay: t,
    lastPenaltyCheck: t,
    messages: [],
  };
  snapshot(t);
  save();
  return state;
}

// ---------------- תצוגת תכונות ----------------
// אחוז שיפור ביחס לנקודת ההתחלה של המשתמש
export function statGain(k) {
  const st = state.stats[k];
  return ((1 + st.abs / 100) / (1 + st.base / 100) - 1) * 100;
}
export function statValue(k) { return 100 * (1 + statGain(k) / 100); }

// ---------------- רמות ודרגות ----------------
export function xpToNext(level) { return 100 + 25 * (level - 1); }
export function levelInfo(xp = state.xp) {
  let L = 1, rem = xp;
  while (rem >= xpToNext(L)) { rem -= xpToNext(L); L++; }
  return { level: L, into: rem, need: xpToNext(L) };
}
const RANKS = [
  { min: 50, r: 'S', title: 'בלתי ניתן לעצירה' },
  { min: 35, r: 'A', title: 'עלית מעל כולם' },
  { min: 22, r: 'B', title: 'לוחם מנוסה' },
  { min: 12, r: 'C', title: 'מתאמן מתמיד' },
  { min: 5, r: 'D', title: 'מתעורר' },
  { min: 1, r: 'E', title: 'מתחיל' },
];
export function rankFor(level) { return RANKS.find(x => level >= x.min); }

function addXP(n, reason) {
  const before = levelInfo().level;
  state.xp += Math.round(n);
  const after = levelInfo().level;
  if (after > before) pushMessage({ kind: 'levelup', level: after, rank: rankFor(after).r });
  return Math.round(n);
}

export function pushMessage(m) { state.messages.push({ ...m, at: Date.now() }); }
export function takeMessages() { const m = state.messages; state.messages = []; save(); return m; }

// ---------------- היסטוריה ----------------
export function snapshot(day = today()) {
  const snap = {};
  for (const k of STAT_KEYS) snap[k] = Math.round(statGain(k) * 100) / 100;
  state.history[day] = snap;
}

// ---------------- דעיכה (Detraining) ----------------
export function runDecay(upTo = today()) {
  let d = state.lastDecay;
  if (!d || d >= upTo) return;
  while (d < upTo) {
    d = addDays(d, 1);
    for (const k of STAT_KEYS) {
      const S = STATS[k], st = state.stats[k];
      const since = daysBetween(st.lastStim, d);
      if (since > S.graceDays && st.abs > 0) st.abs -= st.abs * S.decayPerDay;
    }
    snapshot(d);
  }
  state.lastDecay = upTo;
}

// ---------------- החלת פעילות ----------------
// מחזיר אובייקט תוצאה עם פירוט מלא של החישוב להצגה למשתמש.
export function applyActivity(type, params, opts = {}) {
  const a = ACTIVITIES[type];
  const date = opts.date || today();
  const { dose, parts } = computeDose(type, params);
  const details = [];
  const gains = {};
  for (const [k, w] of Object.entries(a.effects)) {
    const S = STATS[k], st = state.stats[k];
    let d = dose * w;
    let repeat = false;
    if (st.stimDay === date && st.stimCount >= 1) { d *= 0.5; repeat = true; }
    if (d <= 0) continue;
    const before = st.abs;
    const remaining = Math.max(0, st.gmax - st.abs);
    const perStd = remaining * (1 - Math.exp(-1 / S.tau));
    const inc = remaining * (1 - Math.exp(-d / S.tau));
    st.abs += inc;
    // דלתא ביחס לנקודת ההתחלה של המשתמש
    const delta = inc / (1 + st.base / 100);
    const perStdRel = perStd / (1 + st.base / 100);
    gains[k] = delta;
    if (st.stimDay !== date) { st.stimDay = date; st.stimCount = 0; }
    st.stimCount++;
    if (date > st.lastStim) st.lastStim = date;
    const progress = st.abs / st.gmax;
    details.push({ k, weight: w, dose: d, perStd: perStdRel, delta, progress, repeat, before });
  }
  const xp = addXP(a.xp * clamp(dose, 0.5, 1.5) + (opts.questMain ? 15 : 0));
  const entry = {
    id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date, type, params, dose, doseParts: parts, gains, details, xp,
    source: opts.source || 'manual', questId: opts.questId || null, at: Date.now(),
  };
  state.log.unshift(entry);
  snapshot(date >= today() ? today() : date);
  if (date < today()) snapshot(today());
  save();
  return entry;
}

// ---------------- מבחנים וכיול ----------------
export function recordTest(key, value, opts = {}) {
  const T = TESTS[key];
  const date = opts.date || today();
  const k = T.stat;
  const st = state.stats[k];
  const result = { key, value, date, stat: k, baseline: false };
  const bl = state.baselines[key];
  if (!bl) {
    state.baselines[key] = { value, date, abs: st.abs };
    result.baseline = true;
  } else {
    const ratio = T.toIndex(value) / T.toIndex(bl.value);
    const measuredAbs = ((1 + bl.abs / 100) * ratio - 1) * 100;
    const modelAbs = st.abs;
    // מצב נפשי: שילוב 50/50 בין המודל למדידה (שאלון רועש יותר). פיזי: המדידה קובעת.
    let newAbs = k === 'MND' ? 0.5 * modelAbs + 0.5 * measuredAbs : measuredAbs;
    newAbs = Math.max(-60, newAbs);
    // אם עברת את התקרה הממוצעת — את/ה "מגיב/ה גבוה/ה" (HERITAGE): מרחיבים תקרה אישית
    if (newAbs > 0.95 * st.gmax) st.gmax = newAbs / 0.95;
    st.abs = newAbs;
    result.modelGain = ((1 + modelAbs / 100) / (1 + st.base / 100) - 1) * 100;
    result.measuredGain = (ratio - 1) * 100;
    result.newGain = statGain(k);
  }
  state.tests.push({ key, value, date, at: Date.now() });
  result.xp = addXP(40);
  snapshot(today());
  save();
  return result;
}

export function lastTest(key) {
  for (let i = state.tests.length - 1; i >= 0; i--) if (state.tests[i].key === key) return state.tests[i];
  return null;
}

// ---------------- צ'ק-אין ----------------
export function saveCheckin(date, data) {
  const first = !state.checkins[date];
  state.checkins[date] = { ...data, at: Date.now() };
  const xp = first ? addXP(10) : 0;
  save();
  return xp;
}

// ---------------- נתוני בריאות ----------------
export function mergeHealth(date, data) {
  const cur = state.health[date] || {};
  for (const [k, v] of Object.entries(data)) if (v !== null && v !== undefined && !Number.isNaN(v)) cur[k] = v;
  state.health[date] = cur;
  save();
}

export function stepsTarget() {
  const age = Number(state.profile.age) || 30;
  return age >= 60 ? 7000 : 8000; // Paluch 2022
}

// ציון חיוניות 0–100 מ-7 הימים האחרונים
export function vitality() {
  const t = today();
  let stepsS = 0, stepsN = 0, sleepS = 0, sleepN = 0, enS = 0, enN = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, -i);
    const h = state.health[d];
    if (h?.steps != null) { stepsS += Math.min(1, h.steps / stepsTarget()); stepsN++; }
    const sl = h?.sleepH ?? sleepFromLog(d);
    if (sl != null) { const dist = sl < 7 ? 7 - sl : sl > 9 ? sl - 9 : 0; sleepS += Math.max(0, 1 - dist / 3); sleepN++; }
    const c = state.checkins[d];
    if (c?.energy != null) { enS += c.energy / 10; enN++; }
  }
  const parts = [];
  let total = 0, weight = 0;
  if (stepsN) { total += 40 * stepsS / stepsN; weight += 40; parts.push('צעדים'); }
  if (sleepN) { total += 40 * sleepS / sleepN; weight += 40; parts.push('שינה'); }
  if (enN) { total += 20 * enS / enN; weight += 20; parts.push('אנרגיה'); }
  if (!weight) return { score: null, parts };
  return { score: Math.round(100 * total / weight), parts };
}
function sleepFromLog(d) {
  const e = state.log.find(x => x.date === d && x.type === 'sleep');
  return e ? Number(e.params.hours) : null;
}

// ---------------- משימות יומיות ----------------
const TEMPLATES = {
  3: ['strength', null, 'cardioA', null, 'strength', 'mobilityLong', null],
  4: ['strength', 'run', null, 'strength', 'cardioB', 'mobilityLong', null],
  5: ['strength', 'run', 'cardioB', 'strength', 'runLong', 'mobilityLong', null],
  6: ['strength', 'run', 'cardioB', 'strength', 'runLong', 'mobilityLong', 'walkLong'],
};

function weekParity(date) { return Math.floor(daysBetween('2024-01-07', date) / 7) % 2; }

function q(kind, title, desc, extra = {}) {
  return { id: 'Q' + Math.random().toString(36).slice(2, 9), kind, title, desc, done: false, main: true, ...extra };
}

export function questsFor(date) {
  if (!state.quests[date]) {
    state.quests[date] = { items: generateQuests(date), cleared: false };
    save();
  }
  return state.quests[date];
}

function generateQuests(date) {
  const L = levelInfo().level;
  const P = state.profile;
  const list = [];
  list.push(q('checkin', 'דיווח מצב יומי', 'דרגו מצב רוח, אנרגיה ולחץ (30 שניות).'));

  // יום ראשון במערכת: מבחני הערכה
  if (!Object.keys(state.baselines).length) {
    list.push(q('test:pushups', 'מבחן הערכה: כוח', TESTS.pushups.how));
    list.push(q('test:cooper', 'מבחן הערכה: סיבולת', TESTS.cooper.how + ' (אם יש לך VO2max מהשעון — אפשר להזין אותו במקום.)'));
    list.push(q('test:sitreach', 'מבחן הערכה: גמישות', TESTS.sitreach.how));
    list.push(q('who5', 'מבחן הערכה: מצב נפשי', 'שאלון WHO-5 — 5 שאלות על השבועיים האחרונים.'));
    list.push(q('test:sprint', 'מבחן הערכה: מהירות (רשות)', TESTS.sprint.how, { main: false }));
    list.push(q('sleep', 'שינה: 7–9 שעות', 'הזינו כמה ישנתם הלילה (או סנכרנו מ-Apple Health).', { target: { hours: 7.5 } }));
    return list;
  }

  const days = clamp(Number(P.daysPerWeek) || 4, 3, 6);
  const dow = parseDay(date).getDay(); // 0 = ראשון
  const slot = TEMPLATES[days][dow];
  const parity = weekParity(date);
  const gym = P.equipment === 'gym';

  const lastPush = lastTest('pushups')?.value ?? 10;
  const sets = 3 + (L >= 10 ? 1 : 0) + (L >= 25 ? 1 : 0);
  const reps = Math.max(5, Math.round(lastPush * 0.6));
  const runMin = 20 + Math.min(25, Math.floor(L * 0.8));

  const main = {
    strength: () => gym
      ? q('strength', 'אימון כוח', `${sets + 1} תרגילים מורכבים (סקוואט/דדליפט, לחיצה, משיכה, לאנג׳ים) — ${sets}×6–10 חזרות, RPE 7–8, מנוחה 2 דק׳.`, { target: { duration: 50, rpe: 8 } })
      : q('strength', 'אימון כוח', `${sets} סבבים: ${reps} שכיבות סמיכה · ${Math.round(reps * 1.8 + 5)} סקוואטים · ${Math.min(120, 30 + L * 2)} שנ׳ פלאנק · ${Math.max(6, Math.round(reps * 0.8))} לאנג׳ים לכל רגל. מנוחה 90 שנ׳.`, { target: { duration: 30 + sets * 3, rpe: 7 } }),
    run: () => q('run', 'ריצה קלה', `${runMin} דק׳ בקצב שבו אפשר לדבר (אזור 2). מתחילים? הליכה-ריצה לסירוגין זה מצוין.`, { target: { duration: runMin, distance: +(runMin / 7).toFixed(1), rpe: 5 } }),
    runLong: () => q('run', 'ריצה ארוכה', `${Math.round(runMin * 1.4)} דק׳ בקצב נוח ויציב.`, { target: { duration: Math.round(runMin * 1.4), distance: +(runMin * 1.4 / 7).toFixed(1), rpe: 6 } }),
    cardioA: () => parity ? main.intervals() : main.run(),
    cardioB: () => parity ? main.sprints() : main.intervals(),
    intervals: () => {
      const n = 4 + Math.min(6, Math.floor(L / 4));
      return q('intervals', 'אינטרוולים', `חימום 8 דק׳, ואז ${n}× (דקה מהר מאוד / 2 דק׳ קל), שחרור 5 דק׳.`, { target: { duration: 13 + n * 3, rpe: 8 } });
    },
    sprints: () => {
      const n = 4 + Math.min(6, Math.floor(L / 5));
      return q('sprints', 'ספרינטים', `חימום 10 דק׳ + תרגילי ריצה. ${n}× ספרינט 30 מ׳ במאמץ מלא, מנוחה 2–3 דק׳ מלאה.`, { target: { reps: n, rpe: 9 } });
    },
    mobilityLong: () => q('mobility', 'מוביליטי ארוך / יוגה', `${20 + Math.min(15, Math.floor(L / 2))} דק׳: ירכיים, המסטרינג, כתפיים, גב עליון. החזקות של 30–60 שנ׳.`, { target: { duration: 20 + Math.min(15, Math.floor(L / 2)) } }),
    walkLong: () => q('walk', 'הליכה ארוכה בטבע', '60 דק׳ בפארק / חוף / שביל.', { target: { duration: 60 } }),
  };

  if (slot) list.push(main[slot]());
  else list.push(q('walk', 'יום התאוששות: הליכה', '30 דק׳ הליכה, עדיף בטבע. התאוששות היא חלק מהאימון.', { target: { duration: 30 } }));

  if (slot !== 'mobilityLong') list.push(q('mobility', 'מוביליטי יומי', '10 דק׳ מתיחות לכל הגוף.', { target: { duration: 10 } }));
  const medMin = Math.min(20, 5 + Math.floor(L / 3));
  list.push(q('meditation', 'מדיטציה', `${medMin} דק׳ נשימות / קשיבות (אפשר עם אפליקציה).`, { target: { duration: medMin } }));
  list.push(q('steps', `${stepsTarget().toLocaleString('he-IL')} צעדים`, 'מתעדכן מ-Apple Health או ידנית.', { target: { steps: stepsTarget() } }));
  list.push(q('sleep', 'שינה: 7–9 שעות', 'כמה ישנת הלילה?', { target: { hours: 7.5 } }));
  list.push(q('journal', 'יומן הכרת תודה (בונוס)', 'כתבו 3 דברים טובים מהיום.', { main: false }));

  // מבחני הערכה שעוד לא בוצעו — כבונוס עד שיושלמו
  const missing = [['pushups', 'squat1rm'], ['cooper', 'vo2'], ['sitreach'], ['sprint']]
    .filter(group => !group.some(k => state.baselines[k])).map(g => g[0]);
  for (const k of missing.slice(0, 2)) list.push(q('test:' + k, 'מבחן הערכה: ' + TESTS[k].he, TESTS[k].how, { main: false }));

  // מבחנים תקופתיים
  if (lastTestAge('who5') >= 7) list.push(q('who5', 'שאלון WHO-5 שבועי', 'מכייל את מדד המצב הנפשי שלך.'));
  const testable = ['pushups', 'cooper', 'sitreach', 'sprint', 'squat1rm'].filter(k => state.baselines[k]);
  const due = testable.filter(k => lastTestAge(k) >= 14);
  if (due.length && (slot === null || slot === 'mobilityLong')) {
    for (const k of due.slice(0, 2)) list.push(q('test:' + k, 'מבחן כושר: ' + TESTS[k].he, TESTS[k].how + ' (מכייל את המודל לפי מדידה אמיתית)'));
  }
  return list;
}

function lastTestAge(key) {
  const t = lastTest(key);
  return t ? daysBetween(t.date, today()) : 999;
}

export function completeQuest(date, questId, logEntryOrNull) {
  const day = questsFor(date);
  const list = day.items;
  const qq = list.find(x => x.id === questId);
  if (!qq || qq.done) return { cleared: false };
  qq.done = true;
  qq.logId = logEntryOrNull?.id || null;
  qq.doneAt = Date.now();
  const res = { cleared: false, bonusXP: 0 };
  const mains = list.filter(x => x.main);
  if (mains.every(x => x.done) && !day.cleared) {
    day.cleared = true;
    res.cleared = true;
    res.bonusXP = addXP(50);
    // רצף
    const s = state.streak;
    if (s.lastDay !== date) {
      s.count = s.lastDay === addDays(date, -1) ? s.count + 1 : 1;
      s.lastDay = date;
      s.best = Math.max(s.best, s.count);
    }
  }
  save();
  return res;
}

// בודק אם אתמול נכשלו משימות — "אזור עונש"
export function penaltyCheck() {
  const t = today();
  if (state.lastPenaltyCheck === t) return null;
  const y = addDays(t, -1);
  state.lastPenaltyCheck = t;
  const day = state.quests[y];
  let res = null;
  if (day && !day.cleared) {
    const missed = day.items.filter(x => x.main && !x.done).length;
    if (missed > 0) {
      const lost = state.streak.count;
      state.streak.count = 0;
      res = { missed, lostStreak: lost };
    }
  }
  save();
  return res;
}

// ---------------- ייבוא אימונים מ-Apple Health ----------------
export function importWorkout(w) {
  if (state.importedWorkouts[w.key]) return null;
  if (w.date < state.profile.startedAt) return null; // לא סופרים עבר — זה כבר מגולם ברמת האימון ההתחלתית
  state.importedWorkouts[w.key] = true;
  const entry = applyActivity(w.type, w.params, { date: w.date, source: w.source || 'Apple Health' });
  // משלים משימה תואמת אם יש
  const list = state.quests[w.date]?.items;
  if (list) {
    const match = list.find(x => !x.done && x.kind === w.type) ||
      list.find(x => !x.done && ['run', 'intervals', 'cardio'].includes(x.kind) && ['run', 'intervals', 'cardio'].includes(w.type));
    if (match) completeQuest(w.date, match.id, entry);
  }
  return entry;
}

// משלים אוטומטית צעדים/שינה לפי נתוני בריאות
export function autoCompleteFromHealth(date) {
  const h = state.health[date];
  const list = state.quests[date]?.items;
  const done = [];
  if (!h || !list) return done;
  for (const qq of list) {
    if (qq.done) continue;
    if (qq.kind === 'steps' && h.steps >= (qq.target?.steps || stepsTarget())) {
      completeQuest(date, qq.id, null); addXP(20); done.push(qq.title);
    }
    if (qq.kind === 'sleep' && h.sleepH != null && h.sleepH >= 6.95) {
      const e = applyActivity('sleep', { hours: h.sleepH }, { date, source: 'Apple Health', questId: qq.id });
      completeQuest(date, qq.id, e); done.push(qq.title);
    }
  }
  if (h.vo2 && (!lastTest('vo2') || Math.abs(lastTest('vo2').value - h.vo2) >= 0.1)) {
    recordTest('vo2', h.vo2, { date });
    done.push('כיול סיבולת לפי VO2max');
  }
  save();
  return done;
}

export function addBonusXP(n) { return addXP(n); }
export { fmt };

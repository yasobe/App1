// =====================================================================
//  מנוע המשחק: מצב, שמירה, חישוב שיפורים, דעיכה, משימות, רמות.
// =====================================================================
import {
  STATS, STAT_KEYS, ACTIVITIES, TESTS, TRAINING_STATUS,
  computeDose, clamp, fmt,
} from './research.js';
import { HABIT_LIBRARY, libraryItem, automaticity } from './habits.js';
import { SPECIAL_POOL, RARITY, poolItem, seeded } from './specials.js';
import { ACHIEVEMENTS } from './achievements.js';

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

// ---- חתימת שלמות: מזהה עריכה ידנית של הנתונים (לא מונעת — מסמנת) ----
// אפליקציה בלי שרת לא יכולה למנוע עריכה של מי שפותח את הקוד. החתימה הופכת עריכה כזו לגלויה.
const SIG_KEY = STORE_KEY + '.sig';
const SALT = 'ascend|7f3c9a|hunter-system';
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const sign = json => cyrb53(SALT + json + SALT, 7);

// ---- ניקוי נתונים מבחוץ (גיבוי / localStorage): נגד XSS וזיהום prototype ----
// מסיר תווים שמאפשרים הזרקת HTML/מאפיינים, וזורק מפתחות מסוכנים.
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function sanitize(v, depth = 0) {
  if (depth > 12) return null;
  if (typeof v === 'string') return v.replace(/[<>"'`\\]/g, '').slice(0, 2000);
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (Array.isArray(v)) return v.slice(0, 50000).map(x => sanitize(x, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (BAD_KEYS.has(k)) continue;
      o[k.replace(/[<>"'`\\]/g, '').slice(0, 100)] = sanitize(v[k], depth + 1);
    }
    return o;
  }
  return typeof v === 'boolean' || v === null ? v : null;
}

export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      state = sanitize(JSON.parse(raw));
      const sig = localStorage.getItem(SIG_KEY);
      // אין חתימה = גרסה ישנה, חותמים בפעם הראשונה. חתימה שגויה = נערך ידנית.
      if (sig && sig !== sign(raw)) {
        state.flags ||= {};
        state.flags.tampered ||= today();
        save();
      }
    }
  } catch (e) { state = null; }
  return state;
}
export function save() {
  try {
    const json = JSON.stringify(state);
    localStorage.setItem(STORE_KEY, json);
    localStorage.setItem(SIG_KEY, sign(json));
  } catch (e) { console.warn('save failed', e); }
}
export function replaceState(s) { state = s; save(); }

// גיבוי חתום
export function exportBackup() {
  const json = JSON.stringify(state);
  return JSON.stringify({ format: 'ascend-backup', v: 2, sig: sign(json), state: json });
}
export function importBackup(text) {
  const o = JSON.parse(text);
  let s, verified;
  if (o.format === 'ascend-backup') { s = JSON.parse(o.state); verified = o.sig === sign(o.state); }
  else { s = o; verified = false; } // גיבוי מגרסה ישנה, לא חתום
  s = sanitize(s);
  if (!s || !s.stats || !s.profile || !Array.isArray(s.log) || typeof s.quests !== 'object') throw new Error('קובץ לא תקין');
  s.flags ||= {};
  if (!verified) s.flags[o.format === 'ascend-backup' ? 'tampered' : 'unverified'] ||= today();
  return { state: s, verified };
}

// ---- שמירה על השעון: הזזת שעון אחורה נועלת עד שהזמן האמיתי משיג ----
export function clockCheck(now = Date.now()) {
  if (!state) return { ok: true };
  state.clock ||= { maxSeen: now };
  if (now < state.clock.maxSeen - 15 * 60e3) return { ok: false, until: state.clock.maxSeen };
  if (now > state.clock.maxSeen) state.clock.maxSeen = now;
  return { ok: true };
}
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
  const effects = opts.effects || a.effects;
  const details = [];
  const gains = {};
  for (const [k, w] of Object.entries(effects)) {
    const S = STATS[k], st = state.stats[k];
    let d = dose * w;
    let repeat = false;
    // גירוי חוזר באותו יום — רק בין אימונים משמעותיים (הרגלים קטנים לא נספרים).
    // כל אימון נוסף באותו יום שווה חצי מהקודם (×0.5, ×0.25…), ותקרה של 2.5 מנות לתכונה ביום:
    // מעבר לזה אין במחקר תועלת נוספת, ובעיקר עייפות.
    const big = d >= 0.5;
    if (big && st.stimDay === date && st.stimCount >= 1) { d *= Math.pow(0.5, st.stimCount); repeat = true; }
    if (st.doseDay !== date) { st.doseDay = date; st.doseSum = 0; }
    const capped = Math.min(d, Math.max(0, 2.5 - st.doseSum));
    if (capped < d) repeat = true;
    d = capped;
    st.doseSum += d;
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
    if (big) {
      if (st.stimDay !== date) { st.stimDay = date; st.stimCount = 0; }
      st.stimCount++;
    }
    if (date > st.lastStim) st.lastStim = date;
    const progress = st.abs / st.gmax;
    details.push({ k, weight: w, dose: d, perStd: perStdRel, delta, inc, progress, repeat, before });
  }
  // פעילות חופשית (לא משימה): ה-EXP יורד עם כל פעילות נוספת באותו יום (1, ½, ¼, 0…)
  let xpBase = opts.xp ?? (a.xp * clamp(dose, 0.5, 1.5) + (opts.questMain ? 15 : 0));
  const free = opts.xp === undefined && !opts.questId && !opts.special && type !== 'habit' && (opts.source || 'manual') === 'manual';
  if (free) {
    const n = state.log.filter(e => e.date === date && e.free).length;
    xpBase *= n >= 3 ? 0 : Math.pow(0.5, n);
  }
  const xp = addXP(xpBase);
  const entry = {
    id: 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date, type, params, dose, doseParts: parts, gains, details, xp,
    label: opts.label || null, note: opts.note || null, free: free || undefined,
    source: opts.source || 'manual', questId: opts.questId || null, at: Date.now(),
  };
  state.log.unshift(entry);
  snapshot(date >= today() ? today() : date);
  if (date < today()) snapshot(today());
  save();
  return entry;
}

export function validateActivity(type, p) {
  if (p.duration != null && (p.duration < 1 || p.duration > 300)) return 'משך לא סביר (1–300 דקות)';
  if (p.reps != null && (p.reps < 1 || p.reps > 30)) return 'מספר ספרינטים לא סביר (1–30)';
  if (p.hours != null && (p.hours < 0 || p.hours > 16)) return 'שעות שינה לא סבירות (0–16)';
  if (p.distance != null) {
    if (p.distance < 0 || p.distance > 100) return 'מרחק לא סביר (0–100 ק״מ)';
    // קצב מהיר משיא העולם (~2:35 דק׳/ק״מ במרתון, ~2:30 ב-10 ק״מ) = כנראה טעות
    if (type === 'run' && p.duration && p.distance > 0.5 && p.duration / p.distance < 2.5) return 'קצב מהיר משיא העולם — בדקו משך ומרחק';
  }
  return null;
}

// עריכה מותרת רק לפעילות מהיום או מאתמול
export function canEdit(e) { return e && daysBetween(e.date, today()) <= 1; }

// מחיקת פעילות: מבטל את השיפור, ה-EXP וסימון המשימה
export function deleteEntry(id) {
  const i = state.log.findIndex(e => e.id === id);
  if (i < 0) return null;
  const e = state.log[i];
  for (const d of e.details || []) {
    const st = state.stats[d.k];
    const inc = d.inc ?? d.delta * (1 + st.base / 100);
    st.abs = Math.max(-60, st.abs - inc);
  }
  state.xp = Math.max(0, state.xp - (e.xp || 0));
  state.log.splice(i, 1);
  if (e.special) reopenSpecial(e.special);
  const day = state.quests[e.date];
  const qq = day?.items.find(x => x.logId === id || (e.questId && x.id === e.questId));
  if (qq && qq.done) uncompleteQuest(e.date, qq.id);
  snapshot(today());
  save();
  return e;
}

function uncompleteQuest(date, questId) {
  const qq = state.quests[date]?.items.find(x => x.id === questId);
  if (!qq || !qq.done) return;
  qq.done = false; qq.logId = null; qq.doneAt = null;
  if (qq.minimal) { qq.minimal = false; qq.noProg = qq._np; return; }
  if (qq.cat && !qq.noProg) {
    const p = prog();
    if (qq.cat === 'steps') p.stepsGoal = Math.max(3000, (p.stepsGoal || 6000) - 250);
    else p[qq.cat] = Math.max(0, (p[qq.cat] || 0) - 1);
  }
  if (qq.habitId) {
    const arr = state.habitDone?.[qq.habitId];
    if (arr) state.habitDone[qq.habitId] = arr.filter(d => d !== date);
  }
}

// ---------------- מבחנים וכיול ----------------
// כמה אפשר להשתפר פיזיולוגית בשבוע לכל היותר (נקודות אחוז מוחלטות על העקומה) — נדיב בכוונה
const MAX_WEEKLY = { STR: 4, END: 2.5, SPD: 1.5, FLX: 4, MND: 10 };

export function validateTest(key, v) {
  const T = TESTS[key];
  if (!Number.isFinite(v)) return 'הזינו מספר';
  if (v < T.min || v > T.max) return `ערך לא סביר: ${T.min}–${T.max} ${T.unit}`;
  return null;
}

export function recordTest(key, value, opts = {}) {
  const T = TESTS[key];
  const err = validateTest(key, value);
  if (err) return { error: err };
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
    // תקרה פיזיולוגית: אי אפשר "לקפוץ" יותר מ-X בשבוע מאז הכיול הקודם (מונע נקודת התחלה מזויפת נמוכה)
    const prev = st.lastCalib || { abs: st.base, date: state.profile.startedAt };
    const weeks = Math.max(1, daysBetween(prev.date, date) / 7);
    const allowed = Math.max(modelAbs, prev.abs + weeks * MAX_WEEKLY[k]);
    if (newAbs > allowed) { result.capped = true; result.cappedTo = ((1 + allowed / 100) / (1 + st.base / 100) - 1) * 100; newAbs = allowed; }
    // אם עברת את התקרה הממוצעת — את/ה "מגיב/ה גבוה/ה" (HERITAGE): מרחיבים תקרה אישית
    if (newAbs > 0.95 * st.gmax) st.gmax = newAbs / 0.95;
    st.abs = newAbs;
    result.modelGain = ((1 + modelAbs / 100) / (1 + st.base / 100) - 1) * 100;
    result.measuredGain = (ratio - 1) * 100;
    result.newGain = statGain(k);
  }
  st.lastCalib = { abs: st.abs, date };
  // EXP על מבחן: פעם ב-6 ימים לכל מבחן (אחרת אפשר "לחוות" EXP מהזנות חוזרות)
  const lastXP = [...state.tests].reverse().find(t => t.key === key && t.xp);
  const xpNow = !lastXP || daysBetween(lastXP.date, date) >= 6 ? 40 : 0;
  state.tests.push({ key, value, date, at: Date.now(), xp: xpNow });
  // מבחן כוח חדש = עוגן חדש לחזרות, אז מאפסים את מדרגות ההתקדמות בכוח
  if (key === 'pushups' && !result.baseline) prog().str = 0;
  result.xp = xpNow ? addXP(xpNow) : 0;
  snapshot(today());
  save();
  return result;
}

export function lastTest(key) {
  for (let i = state.tests.length - 1; i >= 0; i--) if (state.tests[i].key === key) return state.tests[i];
  return null;
}

// מחיקת מדידה. מחיקת מבחן ההתחלה = איפוס נקודת ההתחלה של אותו מבחן.
export function deleteTest(at) {
  const t = state.tests.find(x => x.at === at);
  if (!t) return null;
  const first = state.tests.find(x => x.key === t.key);
  if (first === t) return resetBaseline(t.key);
  state.tests = state.tests.filter(x => x !== t);
  state.xp = Math.max(0, state.xp - (t.xp ?? 40));
  save();
  return { reset: false };
}
export function resetBaseline(key) {
  const mine = state.tests.filter(x => x.key === key);
  const n = mine.length;
  state.tests = state.tests.filter(x => x.key !== key);
  delete state.baselines[key];
  state.xp = Math.max(0, state.xp - mine.reduce((a, t) => a + (t.xp ?? 40), 0));
  if (key === 'pushups') prog().str = 0;
  save();
  return { reset: true, removed: n };
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
// טווחים סבירים לנתוני בריאות — ערך מחוץ לטווח נזרק
const HEALTH_RANGE = { steps: [0, 70000], sleepH: [0, 16], rhr: [25, 150], hrv: [5, 300], vo2: [15, 90], activeKcal: [0, 8000], exerciseMin: [0, 600], weightKg: [25, 300] };
export function mergeHealth(date, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) return; // תאריך לא תקין / עתידי
  const cur = state.health[date] || {};
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || Number.isNaN(v)) continue;
    const R = HEALTH_RANGE[k];
    if (R && (v < R[0] || v > R[1])) continue;
    cur[k] = v;
  }
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

// ---------------- משימות יומיות: תוכנית פרוגרסיבית ----------------
// המשימה היומית = מה שגורם לשינוי. כל השלמה מעלה את רמת ההתקדמות בקטגוריה,
// והיעד הבא קצת יותר קשה (עומס פרוגרסיבי). המבחנים נפרדים — הערכה שבועית.
const TEMPLATES = {
  3: ['strength', null, 'cardioA', null, 'strength', 'mobilityLong', null],
  4: ['strength', 'run', null, 'strength', 'cardioB', 'mobilityLong', null],
  5: ['strength', 'run', 'cardioB', 'strength', 'runLong', 'mobilityLong', null],
  6: ['strength', 'run', 'cardioB', 'strength', 'runLong', 'mobilityLong', 'walkLong'],
};
const QUEST_VERSION = 3;
const TRAINING_CATS = ['str', 'end', 'spd'];

function weekParity(date) { return Math.floor(daysBetween('2024-01-07', date) / 7) % 2; }

function q(kind, title, desc, extra = {}) {
  return { id: 'Q' + Math.random().toString(36).slice(2, 9), kind, title, desc, done: false, main: true, ...extra };
}

export function prog() {
  state.prog ||= { str: 0, end: 0, spd: 0, mob: 0, mind: 0, stepsGoal: null };
  return state.prog;
}

function initialStepsGoal() {
  const vals = [];
  for (let i = 1; i <= 7; i++) { const s = state.health[addDays(today(), -i)]?.steps; if (s != null) vals.push(s); }
  if (vals.length >= 3) {
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return clamp(Math.round(avg / 500) * 500 + 500, 3000, 10000);
  }
  return 6000;
}
export function stepsGoal() {
  const p = prog();
  if (p.stepsGoal == null) { p.stepsGoal = initialStepsGoal(); save(); }
  return p.stepsGoal;
}

// ---- שבוע קל: כל שבוע רביעי — נפח ~60% כדי לאפשר התאוששות והסתגלות ----
export function isDeloadWeek(date = today()) {
  const wk = Math.floor(daysBetween(state.profile.startedAt, date) / 7);
  return wk > 0 && wk % 4 === 3;
}
// ---- כאב שדווח: 3 ימים של עומס מופחת ----
export function painActive(date = today()) {
  return state.pain && daysBetween(state.pain.date, date) >= 0 && daysBetween(state.pain.date, date) < 3;
}
// ---- מוכנות: שינה קצרה / אנרגיה נמוכה / לחץ גבוה → יום קל ----
export function readiness(date = today()) {
  const sleep = state.health[date]?.sleepH ?? state.log.find(e => e.date === date && e.type === 'sleep')?.params.hours;
  const c = state.checkins[date];
  const reasons = [];
  if (sleep != null && sleep < 6) reasons.push(`שינה של ${fmt(sleep, 1)} שעות`);
  if (c && c.energy <= 3) reasons.push('אנרגיה נמוכה');
  if (c && c.stress >= 8) reasons.push('לחץ גבוה');
  return { low: reasons.length > 0, reasons };
}

// בונה משימת אימון לפי סוג. factor < 1 = גרסה קלה.
function builders(date, factor = 1) {
  const P = state.profile;
  const p = prog();
  const parity = weekParity(date);
  const gym = P.equipment === 'gym';
  const up = (n) => n > 0 ? `↑ רמה ${n + 1}` : 'רמה 1';
  const f = (n, min = 1) => Math.max(min, Math.round(n * factor));

  const maxPush = lastTest('pushups')?.value ?? 10;
  const baseReps = Math.max(4, Math.round(maxPush * 0.5));
  const reps = f(baseReps * (1 + 0.03 * p.str), 3);
  const sets = f(Math.min(5, 3 + Math.floor(p.str / 4)), 2);
  const runMin = f(Math.min(60, 20 + 1.5 * p.end), 10);
  const intN = f(Math.min(10, 4 + Math.floor(p.end / 3)), 3);
  const sprN = f(Math.min(10, 4 + Math.floor(p.spd / 2)), 3);
  const mobMin = Math.min(20, 8 + Math.floor(p.mob / 2));
  const mobLong = Math.min(40, 20 + p.mob);
  const plank = f(Math.min(120, 30 + 5 * p.str), 15);

  const B = {
    strength: () => gym
      ? q('strength', 'אימון כוח', `${sets + 1} תרגילים מורכבים (סקוואט/דדליפט, לחיצה, משיכה, לאנג׳ים) — ${sets}×6–10 חזרות, RPE ${factor < 1 ? '6' : '7–8'}. ${factor < 1 ? 'משקלים כמו בפעם הקודמת, בלי להעלות.' : 'עומס פרוגרסיבי: הוסיפו 2.5 ק״ג או חזרה אחת לעומת האימון הקודם.'}`, { cat: 'str', lvl: up(p.str), timer: { rest: 120 }, target: { duration: f(50, 20), rpe: factor < 1 ? 6 : 8 } })
      : q('strength', 'אימון כוח', `${sets} סבבים: ${reps} שכיבות סמיכה · ${Math.round(reps * 1.8 + 5)} סקוואטים · ${plank} שנ׳ פלאנק · ${Math.max(5, Math.round(reps * 0.8))} לאנג׳ים לכל רגל. מנוחה 90 שנ׳.`, { cat: 'str', lvl: up(p.str), timer: { rest: 90, hold: plank }, target: { duration: 25 + sets * 4, rpe: factor < 1 ? 6 : 7 } }),
    run: () => q('run', 'ריצה קלה', `${runMin} דק׳ בקצב שבו אפשר לדבר (אזור 2). מתחילים? הליכה-ריצה לסירוגין זה מצוין.`, { cat: 'end', lvl: up(p.end), timer: { countdown: runMin }, target: { duration: runMin, distance: +(runMin / 7).toFixed(1), rpe: 5 } }),
    runLong: () => { const m = f(Math.min(80, Math.round((20 + 1.5 * p.end) * 1.4)), 15); return q('run', 'ריצה ארוכה', `${m} דק׳ בקצב נוח ויציב.`, { cat: 'end', lvl: up(p.end), timer: { countdown: m }, target: { duration: m, distance: +(m / 7).toFixed(1), rpe: 6 } }); },
    cardio: () => q('cardio', 'אירובי חלופי', `${runMin} דק׳ אופניים / שחייה / אליפטיקל / חתירה בקצב בינוני.`, { cat: 'end', lvl: up(p.end), timer: { countdown: runMin }, target: { duration: runMin, rpe: 6 } }),
    cardioA: () => parity ? B.intervals() : B.run(),
    cardioB: () => parity ? B.sprints() : B.intervals(),
    intervals: () => q('intervals', 'אינטרוולים', `חימום 8 דק׳, ואז ${intN}× (דקה מהר מאוד / 2 דק׳ קל), שחרור 5 דק׳.`, { cat: 'end', lvl: up(p.end), timer: { intervals: { warm: 480, work: 60, rest: 120, n: intN, cool: 300 } }, target: { duration: 13 + intN * 3, rpe: factor < 1 ? 7 : 8 } }),
    sprints: () => q('sprints', 'ספרינטים', `חימום 10 דק׳ + תרגילי ריצה. ${sprN}× ספרינט 30 מ׳ במאמץ מלא, מנוחה 2–3 דק׳ מלאה.`, { cat: 'spd', lvl: up(p.spd), timer: { rest: 150 }, target: { reps: sprN, rpe: 9 } }),
    mobilityLong: () => q('mobility', 'מוביליטי ארוך / יוגה', `${mobLong} דק׳: ירכיים, המסטרינג, כתפיים, גב עליון. החזקות של 30–60 שנ׳.`, { cat: 'mob', lvl: up(p.mob), timer: { countdown: mobLong }, target: { duration: mobLong } }),
    mobility: () => q('mobility', 'מוביליטי יומי', `${mobMin} דק׳ מתיחות לכל הגוף.`, { cat: 'mob', lvl: up(p.mob), timer: { countdown: mobMin }, target: { duration: mobMin } }),
    walkLong: () => q('walk', 'הליכה ארוכה בטבע', '60 דק׳ בפארק / חוף / שביל.', { timer: { countdown: 60 }, target: { duration: 60 } }),
    walk: () => q('walk', 'הליכה', '30 דק׳ הליכה, עדיף בטבע.', { timer: { countdown: 30 }, target: { duration: 30 } }),
    recovery: () => q('mobility', 'התאוששות: מתיחות עדינות', '15 דק׳ מתיחות עדינות בטווח בלי כאב. כאב חד, נפיחות או כאב שלא עובר — לפנות לרופא או פיזיותרפיסט.', { cat: 'mob', timer: { countdown: 15 }, target: { duration: 15 } }),
  };
  return B;
}

// אילו חלופות אפשר להציע במקום משימה
export const SWAP_OPTIONS = {
  strength: ['strength', 'cardio', 'mobilityLong', 'walk'],
  run: ['cardio', 'intervals', 'walk', 'mobilityLong'],
  cardio: ['run', 'intervals', 'walk'],
  intervals: ['run', 'cardio', 'sprints', 'walk'],
  sprints: ['intervals', 'run', 'walk'],
  mobility: ['mobilityLong', 'walk'],
  walk: ['mobility', 'cardio'],
};
export const SWAP_LABELS = { strength: 'אימון כוח', run: 'ריצה', cardio: 'אופניים / שחייה / אליפטיקל', intervals: 'אינטרוולים', sprints: 'ספרינטים', mobilityLong: 'מוביליטי ארוך / יוגה', mobility: 'מוביליטי קצר', walk: 'הליכה' };

export function questsFor(date) {
  const day = state.quests[date];
  if (!day || day.v !== QUEST_VERSION) {
    const items = generateQuests(date);
    // מעבר מגרסה קודמת: שומרים מה שכבר הושלם
    if (day) for (const it of items) { const old = day.items.find(o => o.kind === it.kind && o.done && o.habitId === it.habitId); if (old) { it.done = true; it.logId = old.logId; } }
    state.quests[date] = { items, cleared: day?.cleared || false, v: QUEST_VERSION, rest: day?.rest || null, notes: [] };
    applyDayModifiers(date);
    save();
  }
  return state.quests[date];
}

function trainingFactor(date) {
  let f = 1; const notes = [];
  if (isDeloadWeek(date)) { f *= 0.6; notes.push('שבוע קל: כל שבוע רביעי הנפח יורד ל-60% כדי שהגוף יספוג את השיפור.'); }
  if (painActive(date)) { f *= 0.5; notes.push('דיווחת על כאב — עומס מופחת ל-3 ימים.'); }
  return { f, notes };
}

// מחזיר את משימות היום לפי הרמה וההתקדמות הנוכחית
function generateQuests(date) {
  const P = state.profile;
  const list = [];
  const initial = !Object.keys(state.baselines).length;
  const days = clamp(Number(P.daysPerWeek) || 4, 3, 6);
  const dow = parseDay(date).getDay(); // 0 = ראשון
  const slot = initial ? null : TEMPLATES[days][dow];
  const { f } = trainingFactor(date);
  const B = builders(date, f);
  const p = prog();

  if (initial) list.push(q('walk', 'יום ראשון: הליכה קלה', 'היום עושים את ההערכה הראשונית (למעלה). חוץ ממנה — רק 20 דק׳ הליכה. מחר מתחיל האימון.', { timer: { countdown: 20 }, target: { duration: 20 } }));
  else if (slot && painActive(date) && ['strength', 'run', 'runLong', 'cardioA', 'cardioB'].includes(slot)) list.push(B.recovery());
  else if (slot) { const t = B[slot](); if (f < 1) t.noProg = true; list.push(t); }
  else list.push(q('walk', 'יום התאוששות: הליכה', '30 דק׳ הליכה, עדיף בטבע. התאוששות היא חלק מהאימון — השרירים מתחזקים במנוחה.', { timer: { countdown: 30 }, target: { duration: 30 } }));

  if (slot !== 'mobilityLong') list.push(B.mobility());
  const medMin = Math.min(20, 5 + Math.floor(p.mind / 2));
  list.push(q('meditation', 'מדיטציה', `${medMin} דק׳ נשימות / קשיבות.`, { cat: 'mind', lvl: p.mind > 0 ? `↑ רמה ${p.mind + 1}` : 'רמה 1', timer: { countdown: medMin }, target: { duration: medMin } }));
  const sg = stepsGoal();
  list.push(q('steps', `${sg.toLocaleString('he-IL')} צעדים`, sg < 8000 ? `עולה ב-250 בכל פעם שמשלימים, עד ${stepsTarget().toLocaleString('he-IL')}+ (Paluch 2022).` : 'מתעדכן מ-Apple Health או ידנית.', { cat: 'steps', target: { steps: sg } }));
  list.push(q('sleep', 'שינה: 7–9 שעות', 'כמה ישנת הלילה? השינה היא המקום שבו הגוף בונה את השיפור.', { target: { hours: 7.5 } }));
  for (const h of activeHabits()) list.push(habitQuest(h));
  list.push(q('checkin', 'דיווח מצב (בונוס)', 'מצב רוח, אנרגיה ולחץ — 30 שניות. אנרגיה נמוכה = האימון של היום יוקל.', { main: false }));
  list.push(q('journal', 'יומן הכרת תודה (בונוס)', 'כתבו 3 דברים טובים מהיום.', { main: false }));
  return list;
}

// הערות ליום (שבוע קל, כאב, מוכנות)
function applyDayModifiers(date) {
  const day = state.quests[date];
  const { notes } = trainingFactor(date);
  day.notes = notes;
  const r = readiness(date);
  if (r.low) adjustForReadiness(date, r);
}

// מוכנות נמוכה → מחליף את האימון של היום בגרסה של 60%
export function adjustForReadiness(date = today(), r = readiness(date)) {
  const day = state.quests[date];
  if (!day || !r.low || day.readinessAdjusted) return false;
  const i = day.items.findIndex(x => !x.done && TRAINING_CATS.includes(x.cat));
  if (i < 0) return false;
  const { f } = trainingFactor(date);
  const kind = day.items[i].kind === 'run' && day.items[i].title.includes('ארוכה') ? 'runLong' : day.items[i].kind;
  const B = builders(date, f * 0.6);
  if (!B[kind]) return false;
  const nq = B[kind]();
  nq.title += ' (גרסה קלה)';
  nq.noProg = true;
  day.items[i] = nq;
  day.readinessAdjusted = true;
  day.notes = [...(day.notes || []), `יום קל בגלל ${r.reasons.join(' + ')}. אימון קל עדיין בונה — ושומר על הרצף.`];
  save();
  return true;
}

// החלפת משימה בחלופה
export function swapQuest(date, questId, kind) {
  const day = questsFor(date);
  const i = day.items.findIndex(x => x.id === questId);
  if (i < 0 || day.items[i].done) return null;
  const { f } = trainingFactor(date);
  const B = builders(date, f * (day.readinessAdjusted ? 0.6 : 1));
  if (!B[kind]) return null;
  const nq = B[kind]();
  nq.swappedFrom = day.items[i].title;
  if (f < 1 || day.readinessAdjusted) nq.noProg = true;
  day.items[i] = nq;
  save();
  return nq;
}

// דיווח כאב: מחליף את האימון של היום בהתאוששות ומקל ל-3 ימים
export function reportPain(date, questId, area) {
  state.pain = { date, area };
  const day = questsFor(date);
  const i = day.items.findIndex(x => x.id === questId);
  if (i >= 0 && !day.items[i].done) { day.items[i] = builders(date).recovery(); day.items[i].noProg = true; }
  day.notes = [...(day.notes || []), 'דיווחת על כאב — עומס מופחת ל-3 ימים.'];
  save();
}

// ---------------- יום מנוחה / מחלה ----------------
// מנוחה: פעם בשבוע (ראשון–שבת), שומר על הרצף. מחלה: ללא הגבלה, שומר על הרצף בלי EXP.
export function restUsedThisWeek(date = today()) {
  const d = parseDay(date); const start = addDays(date, -d.getDay());
  for (let i = 0; i < 7; i++) { const k = addDays(start, i); if (state.quests[k]?.rest === 'rest') return k; }
  return null;
}
export function markRest(date, type) {
  const day = questsFor(date);
  if (type === 'rest' && restUsedThisWeek(date) && restUsedThisWeek(date) !== date) return { ok: false, reason: 'כבר השתמשת ביום מנוחה השבוע.' };
  day.rest = type;
  const s = state.streak;
  if (s.lastDay === addDays(date, -1)) s.lastDay = date; // הרצף ממשיך בלי לגדול
  save();
  return { ok: true };
}
export function unmarkRest(date) { const day = questsFor(date); day.rest = null; save(); }

// ---------------- הרגלים ----------------
export function activeHabits() { return (state.habits || []).filter(h => h.active); }
export function habitDays(id) { return (state.habitDone?.[id] || []).length; }
export function habitInfo(h) {
  const days = habitDays(h.id);
  return { days, auto: automaticity(days) };
}
function habitQuest(h) {
  const { days, auto } = habitInfo(h);
  return q('habit', `${h.icon} ${h.name}`, auto >= 0.95 ? `הרגל מושרש ✓ (${days} ימים)` : `יום ${days + 1} · אוטומטיות ${Math.round(auto * 100)}%`, { habitId: h.id, small: true });
}
export function setHabit(key, on) {
  state.habits ||= [];
  const lib = libraryItem(key);
  let h = state.habits.find(x => x.key === key);
  if (on) {
    if (h) h.active = true;
    else state.habits.push(h = { id: 'H' + Math.random().toString(36).slice(2, 8), key, name: lib.name, icon: lib.icon, active: true, createdAt: today() });
  } else if (h) h.active = false;
  syncHabitsIntoToday();
  save();
  return h;
}
export function addCustomHabit(name, icon) {
  state.habits ||= [];
  const h = { id: 'H' + Math.random().toString(36).slice(2, 8), key: 'custom', name, icon, active: true, createdAt: today() };
  state.habits.push(h);
  syncHabitsIntoToday();
  save();
  return h;
}
export function removeHabit(id) {
  const h = (state.habits || []).find(x => x.id === id);
  if (h) h.active = false;
  syncHabitsIntoToday();
  save();
}
export function syncHabitsIntoToday(date = today()) {
  const day = state.quests[date];
  if (!day) return;
  const act = activeHabits();
  day.items = day.items.filter(x => x.kind !== 'habit' || x.done || act.some(h => h.id === x.habitId));
  const idx = day.items.findIndex(x => x.kind === 'checkin');
  for (const h of act) if (!day.items.some(x => x.habitId === h.id)) day.items.splice(idx < 0 ? day.items.length : idx, 0, habitQuest(h));
}
export function completeHabit(date, questId) {
  const day = questsFor(date);
  const qq = day.items.find(x => x.id === questId);
  const h = (state.habits || []).find(x => x.id === qq?.habitId);
  if (!qq || !h || qq.done) return null;
  const lib = h.key !== 'custom' ? libraryItem(h.key) : null;
  const effects = lib?.effects || {};
  // EXP על הרגלים: עד 6 הרגלים ביום (אחרת אפשר להוסיף 30 הרגלים ולחוות EXP)
  const habitsToday = state.log.filter(e => e.date === date && e.type === 'habit' && e.questId).length;
  const entry = applyActivity('habit', {}, { date, effects, label: `${h.icon} ${h.name}`, note: lib?.note, questId, xp: habitsToday >= 6 ? 0 : 12 });
  state.habitDone ||= {};
  const arr = (state.habitDone[h.id] ||= []);
  if (!arr.includes(date)) arr.push(date);
  const before = automaticity(arr.length - 1), after = automaticity(arr.length);
  let rooted = false;
  if (before < 0.95 && after >= 0.95 && !h.rootedAwarded) { addXP(150); h.rootedAwarded = today(); rooted = true; }
  const res = completeQuest(date, questId, entry);
  return { entry, ...res, days: arr.length, auto: after, rooted };
}

// ---------------- הערכה שבועית ----------------
const ASSESS_GROUPS = [
  { keys: ['pushups', 'squat1rm'], he: 'כוח' },
  { keys: ['cooper', 'vo2'], he: 'סיבולת' },
  { keys: ['sitreach'], he: 'גמישות' },
  { keys: ['who5'], he: 'מצב נפשי' },
  { keys: ['sprint'], he: 'מהירות', optional: true },
];
function lastOfGroup(keys) {
  let best = null;
  for (const k of keys) { const t = lastTest(k); if (t && (!best || t.at > best.at)) best = t; }
  return best;
}
// מחזיר את מצב ההערכה השבועית: אילו מבחנים מגיעים ומתי ההערכה הבאה
export function assessment() {
  const initial = !Object.keys(state.baselines).length;
  const items = ASSESS_GROUPS.map(g => {
    const last = lastOfGroup(g.keys);
    const key = last?.key || g.keys[0];
    const age = last ? daysBetween(last.date, today()) : 999;
    return { key, alt: g.keys.filter(k => k !== key), he: g.he, optional: !!g.optional, last, due: age >= 7, doneToday: age === 0 };
  });
  const core = items.filter(i => !i.optional);
  const due = core.some(i => i.due);
  // ההערכה הבאה: 7 ימים אחרי המבחן הישן ביותר מבין הליבה
  const ages = core.map(i => i.last ? daysBetween(i.last.date, today()) : 999);
  const nextIn = Math.max(0, 7 - Math.max(...ages));
  return { initial, items, due, nextIn };
}

// דוח: לכל מבחן — התחלה, קודם, אחרון
export function weeklyReport() {
  const out = [];
  for (const key of Object.keys(TESTS)) {
    const all = state.tests.filter(t => t.key === key);
    if (!all.length) continue;
    const T = TESTS[key];
    const first = state.baselines[key]?.value ?? all[0].value;
    const last = all[all.length - 1], prev = all.length > 1 ? all[all.length - 2] : null;
    out.push({
      key, last, prev, first,
      week: prev ? (T.toIndex(last.value) / T.toIndex(prev.value) - 1) * 100 : null,
      total: (T.toIndex(last.value) / T.toIndex(first) - 1) * 100,
    });
  }
  return out;
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
  // עומס פרוגרסיבי: ההשלמה מעלה את היעד הבא בקטגוריה
  if (qq.cat && !qq.noProg) {
    const p = prog();
    if (qq.cat === 'steps') p.stepsGoal = Math.min(10000, (p.stepsGoal || 6000) + 250);
    else p[qq.cat] = (p[qq.cat] || 0) + 1;
  }
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

// פעילות חופשית שמתאימה למשימה פתוחה של היום — משלימה אותה
const KIND_GROUP = { run: 'end', cardio: 'end', intervals: 'end' };
export function completeMatching(date, type, entry) {
  const day = state.quests[date];
  if (!day) return null;
  const qq = day.items.find(x => !x.done && x.kind === type) ||
    (KIND_GROUP[type] && day.items.find(x => !x.done && KIND_GROUP[x.kind] === KIND_GROUP[type]));
  if (!qq || qq.kind === 'habit') return null;
  entry.questId = qq.id;
  const res = completeQuest(date, qq.id, entry);
  return { quest: qq, ...res };
}

// בודק אם אתמול נכשלו משימות — "אזור עונש"
export function penaltyCheck() {
  const t = today();
  if (state.lastPenaltyCheck === t) return null;
  const y = addDays(t, -1);
  state.lastPenaltyCheck = t;
  const day = state.quests[y];
  let res = null;
  if (day && !day.cleared && !day.rest) {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date) || w.date > today()) return null; // לא מקבלים תאריך עתידי
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

// ---------------- משימות מיוחדות (אקראיות) ----------------
// מופיעות פעם בכמה ימים בשעה אקראית (09:00–20:00): לפחות יומיים בין שתיים,
// סיכוי 35% ביום אחרי זה, ובטוח אחרי 5 ימים. הגרלה דטרמיניסטית לפי התאריך —
// רענון של האפליקציה לא מגריל מחדש.
function sp() {
  // הראשונה מגיעה למחרת היום הראשון (לא מפריעה להערכה הראשונית)
  state.special ||= { lastDate: addDays(state.profile.startedAt, -4), offers: {}, history: [], done: 0 };
  return state.special;
}
export function specialStats() { const S = sp(); return { done: S.done, history: S.history }; }

export function specialOffer(date = today()) {
  const S = sp();
  if (S.offers[date] !== undefined) return S.offers[date];
  if (date <= state.profile.startedAt) return null;
  const rng = seeded(date + '|' + state.profile.startedAt);
  const since = daysBetween(S.lastDate, date);
  const prob = since >= 5 ? 1 : since >= 2 ? 0.35 : 0;
  let offer = null;
  if (rng() < prob) {
    const noPhysical = painActive(date) || !!state.quests[date]?.rest;
    const recent = S.history.slice(-10).map(h => h.key);
    const pool = SPECIAL_POOL.filter(x => !recent.includes(x.key) && !(noPhysical && x.physical));
    const r = rng() * 100;
    const rar = r < RARITY.epic.weight ? 'epic' : r < RARITY.epic.weight + RARITY.rare.weight ? 'rare' : 'common';
    let cand = pool.filter(x => x.rarity === rar);
    if (!cand.length) cand = pool;
    const item = cand[Math.floor(rng() * cand.length)];
    const hour = 9 + rng() * 11;
    const appear = parseDay(date); appear.setHours(Math.floor(hour), Math.floor((hour % 1) * 60), 0, 0);
    const urgent = !!item.urgent && rng() < 0.4;
    const L = levelInfo().level;
    offer = {
      id: 'S' + Math.random().toString(36).slice(2, 9), key: item.key, date, rarity: item.rarity, urgent,
      appearAt: appear.getTime(), deadline: null, status: 'pending',
      title: item.title(L), desc: item.desc, icon: item.icon, type: item.type, act: item.act || null,
      target: item.target ? item.target(L) : null, note: item.note || null,
      xp: Math.round(RARITY[item.rarity].xp * (urgent ? 1.5 : 1)),
    };
    S.lastDate = date;
  }
  S.offers[date] = offer;
  save();
  return offer;
}

// נקרא כשהאפליקציה פתוחה: מחזיר אירועים (הצעה חדשה / פג תוקף)
export function specialTick(now = Date.now()) {
  const S = sp(); const t = today(); const events = [];
  for (const [d, o] of Object.entries(S.offers)) {
    if (!o) continue;
    if ((o.status === 'active' || o.status === 'offered') && o.deadline && now > o.deadline) {
      o.status = o.status === 'active' ? 'failed' : 'missed';
      S.history.push({ key: o.key, date: o.date, status: o.status });
      events.push({ kind: 'expired', offer: o });
    } else if (o.status === 'pending' && d < t) o.status = 'missed';
  }
  const o = specialOffer(t);
  if (o && o.status === 'pending' && now >= o.appearAt) {
    o.status = 'offered'; o.shownAt = now;
    const eod = parseDay(t); eod.setHours(23, 59, 59, 0);
    // משימת חירום: שעתיים מהרגע שהופיעה (לא אם נשאר פחות מחצי שעה ביום)
    if (o.urgent && eod - now < 2 * 3600e3) o.urgent = false;
    o.deadline = o.urgent ? now + 2 * 3600e3 : eod.getTime();
    events.push({ kind: 'offer', offer: o });
  } else if (o && o.status === 'offered') events.push({ kind: 'offer', offer: o });
  save();
  return events;
}

export function answerSpecial(id, accept) {
  const o = Object.values(sp().offers).find(x => x && x.id === id);
  if (!o || o.status !== 'offered') return null;
  o.status = accept ? 'active' : 'declined';
  if (!accept) sp().history.push({ key: o.key, date: o.date, status: 'declined' });
  save();
  return o;
}
export function activeSpecial() {
  return Object.values(sp().offers).find(o => o && o.status === 'active') || null;
}
export function completeSpecial(offer, entry = null) {
  const S = sp();
  if (!offer || offer.status !== 'active') return null;
  if (!entry) {
    const item = poolItem(offer.key);
    entry = applyActivity('habit', {}, { effects: item?.effects || {}, label: `★ ${offer.title}`, note: item?.note, xp: 0 });
  } else entry.label = `★ ${offer.title}`;
  const bonus = addXP(offer.xp);
  entry.xp += bonus;
  entry.special = offer.id;
  offer.status = 'done'; offer.doneAt = Date.now();
  S.done++;
  S.history.push({ key: offer.key, date: offer.date, status: 'done' });
  save();
  return { entry, special: bonus };
}
// מחיקת פעילות של משימה מיוחדת מחזירה אותה לפתוחה (אם הזמן עוד לא עבר)
export function reopenSpecial(specialId) {
  const S = sp();
  const o = Object.values(S.offers).find(x => x && x.id === specialId);
  if (!o || o.status !== 'done') return;
  o.status = Date.now() < o.deadline ? 'active' : 'failed';
  S.done = Math.max(0, S.done - 1);
  save();
}

// ---------------- גרסה מינימלית ליום קשה ----------------
// סופרת כ"בוצע" לרצף, נותנת EXP חלקי, לא מקדמת רמה. השיפור מחושב לפי המנה הקטנה האמיתית.
export const MINIMAL = {
  strength: { he: 'סבב אחד: 5 שכיבות סמיכה, 10 סקוואטים, 20 שנ׳ פלאנק', type: 'strength', params: { duration: 3, rpe: 6 } },
  run: { he: '5 דקות ריצה קלה או הליכה מהירה', type: 'run', params: { duration: 5, rpe: 5 } },
  cardio: { he: '5 דקות אירובי קל', type: 'cardio', params: { duration: 5, rpe: 5 } },
  intervals: { he: '5 דקות: 2 ספרינטים קצרים בהליכה', type: 'intervals', params: { duration: 5, rpe: 6 } },
  sprints: { he: '2 ספרינטים קלים אחרי חימום', type: 'sprints', params: { reps: 2, rpe: 7 } },
  mobility: { he: 'מתיחה אחת של 2 דקות', type: 'mobility', params: { duration: 2 } },
  meditation: { he: '10 נשימות איטיות (כדקה)', type: 'meditation', params: { duration: 1 } },
  walk: { he: '5 דקות הליכה', type: 'walk', params: { duration: 5 } },
  steps: { he: 'לפחות 2,000 צעדים', type: null },
};
export function completeMinimal(date, questId) {
  const day = questsFor(date);
  const qq = day.items.find(x => x.id === questId);
  const M = MINIMAL[qq?.kind];
  if (!qq || qq.done || !M) return null;
  qq._np = !!qq.noProg;
  qq.minimal = true;
  qq.noProg = true;
  let entry = null;
  if (M.type) {
    const a = ACTIVITIES[M.type];
    entry = applyActivity(M.type, M.params, { date, questId, label: `🪶 ${a.icon} ${a.he} (מינימום)`, xp: Math.round(a.xp * 0.3) });
  } else addXP(5);
  const res = completeQuest(date, questId, entry);
  // בונוס יום מושלם מופחת כשהיה יום מינימום
  if (res.cleared && res.bonusXP) { state.xp -= 25; res.bonusXP -= 25; }
  save();
  return { entry, ...res };
}

// ---------------- מתי ואיפה (כוונות יישום) ----------------
// "אחרי X, ב-Y, אעשה Z" — מגדיל ביצוע בפועל (Gollwitzer & Sheeran 2006)
export function setHabitPlan(id, when, where) {
  const h = (state.habits || []).find(x => x.id === id);
  if (!h) return;
  h.plan = when || where ? { when: when || '', where: where || '' } : null;
  save();
}
export function setQuestPlan(date, questId, text) {
  const qq = questsFor(date).items.find(x => x.id === questId);
  if (!qq) return;
  qq.plan = text || null;
  save();
}

// ---------------- הישגים ----------------
export function checkAchievements() {
  state.achievements ||= {};
  const ctx = { state, statGain, levelInfo, habitInfo, today, addDays };
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    let ok = false;
    try { ok = a.check(ctx); } catch (e) { ok = false; }
    if (ok) {
      state.achievements[a.id] = today();
      if (a.xp) addXP(a.xp);
      fresh.push(a);
    }
  }
  if (fresh.length) {
    if (!state.title) state.title = fresh[fresh.length - 1].id;
    save();
  }
  return fresh;
}
export function setTitle(id) { state.title = id; save(); }

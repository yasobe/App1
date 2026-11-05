// =====================================================================
//  חיבור לנתונים חיצוניים:
//   1. קיצור דרך (Shortcuts) של iOS שקורא מ-Apple Health ומעתיק ללוח
//   2. ייבוא קובץ הייצוא המלא של Apple Health (export.zip / export.xml)
//      — כולל אימונים מכל אפליקציה שמסנכרנת ל-Health (Strava, Nike Run
//        Club, Garmin, Apple Watch, Fitbod וכו׳)
// =====================================================================
import { Unzip, UnzipInflate } from '../vendor/fflate.js';
import { rpeFromHR } from './research.js';

const KEYMAP = {
  steps: 'steps', צעדים: 'steps',
  sleep: 'sleepH', sleeph: 'sleepH', שינה: 'sleepH',
  rhr: 'rhr', resting: 'rhr', דופק: 'rhr',
  hrv: 'hrv',
  vo2: 'vo2', vo2max: 'vo2',
  kcal: 'activeKcal', energy: 'activeKcal', active: 'activeKcal',
  exmin: 'exerciseMin', exercise: 'exerciseMin',
  weight: 'weightKg', משקל: 'weightKg',
  date: 'date',
};

// פורמט: "ASCEND steps=8432; sleep=7.2; rhr=58; hrv=45; vo2=42.1"
// סלחני: מקבל פסיקים עשרוניים, רווחים, שורות, ושינה בדקות (sleepmin=430).
export function parseSyncText(text) {
  if (!text) return null;
  const out = {};
  const re = /([A-Za-z֐-׿0-9]+)\s*[=:]\s*([0-9.,\-]+)/g;
  let m, found = 0;
  while ((m = re.exec(text))) {
    let k = m[1].toLowerCase();
    let v = m[2].replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (k === 'date') continue;
    if (k === 'sleepmin') { out.sleepH = round(parseFloat(v) / 60, 2); found++; continue; }
    const key = KEYMAP[k];
    if (!key) continue;
    const n = parseFloat(v);
    if (Number.isFinite(n)) { out[key] = n; found++; }
  }
  const dm = /date\s*[=:]\s*(\d{4}-\d{2}-\d{2})/.exec(text);
  if (dm) out.date = dm[1];
  // שינה שהוזנה בדקות בטעות
  if (out.sleepH > 24) out.sleepH = round(out.sleepH / 60, 2);
  return found ? out : null;
}

export function parseHashSync(hash) {
  if (!hash || !hash.startsWith('#sync')) return null;
  const qs = hash.split('?')[1] || '';
  return parseSyncText(decodeURIComponent(qs).replace(/&/g, ';'));
}

function round(v, d) { const p = 10 ** d; return Math.round(v * p) / p; }

// ---------------------------------------------------------------------
//  ייבוא קובץ הייצוא של Apple Health — סטרימינג, כדי לעבוד גם עם קבצים
//  של מאות MB באייפון בלי לטעון הכל לזיכרון.
// ---------------------------------------------------------------------
const WORKOUT_MAP = {
  Running: 'run', TrackAndField: 'sprints',
  Walking: 'walk', Hiking: 'walk',
  Cycling: 'cardio', Swimming: 'cardio', Rowing: 'cardio', Elliptical: 'cardio', StairClimbing: 'cardio',
  Stairs: 'cardio', MixedCardio: 'cardio', JumpRope: 'cardio', Boxing: 'cardio', Kickboxing: 'cardio',
  SoccerPlay: 'cardio', Soccer: 'cardio', Basketball: 'cardio', Tennis: 'cardio', Dance: 'cardio', CardioDance: 'cardio',
  HighIntensityIntervalTraining: 'intervals',
  TraditionalStrengthTraining: 'strength', FunctionalStrengthTraining: 'strength', CrossTraining: 'strength', CoreTraining: 'strength',
  Climbing: 'strength', MartialArts: 'strength',
  Yoga: 'mobility', Flexibility: 'mobility', Pilates: 'mobility', Cooldown: 'mobility', MindAndBody: 'meditation', TaiChi: 'mobility',
};

function attr(line, name) {
  const i = line.indexOf(' ' + name + '="');
  if (i < 0) return null;
  const s = i + name.length + 3;
  return line.slice(s, line.indexOf('"', s));
}
function toDate(s) {
  // "2026-11-04 07:31:22 +0200" → Date
  return new Date(s.replace(' ', 'T').replace(' ', '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

export async function importHealthExport(file, { sinceDay, age, onProgress }) {
  const cutoff = sinceDay; // "YYYY-MM-DD" — מה שלפני זה מדלגים
  // per day per source sums → בסוף לוקחים את המקור הגבוה ביותר כדי לא לספור כפול (אייפון + שעון)
  const sumBySrc = { steps: {}, sleep: {}, kcal: {}, exmin: {} };
  const avg = { rhr: {}, hrv: {}, vo2: {}, weight: {} };
  const workouts = [];
  let cur = null; // workout בתהליך
  let lines = 0;

  const addSum = (bucket, day, src, v) => {
    const b = (bucket[day] ||= {});
    b[src] = (b[src] || 0) + v;
  };
  const addAvg = (bucket, day, v) => {
    const b = (bucket[day] ||= { s: 0, n: 0 });
    b.s += v; b.n++;
  };

  const handleLine = (line) => {
    lines++;
    if (cur) {
      if (line.includes('<WorkoutStatistics')) {
        const t = attr(line, 'type');
        if (t === 'HKQuantityTypeIdentifierDistanceWalkingRunning' || t === 'HKQuantityTypeIdentifierDistanceCycling' || t === 'HKQuantityTypeIdentifierDistanceSwimming') {
          const sum = parseFloat(attr(line, 'sum')); const unit = attr(line, 'unit');
          if (Number.isFinite(sum)) cur.distanceKm = unit === 'm' ? sum / 1000 : unit === 'mi' ? sum * 1.609 : sum;
        } else if (t === 'HKQuantityTypeIdentifierHeartRate') {
          const a = parseFloat(attr(line, 'average')); if (Number.isFinite(a)) cur.avgHR = a;
        }
      }
      if (line.includes('</Workout>')) { workouts.push(cur); cur = null; }
      return;
    }
    if (line.includes('<Workout ')) {
      const sd = attr(line, 'startDate');
      if (!sd || sd.slice(0, 10) < cutoff) { if (!line.includes('/>')) cur = { skip: true }; return; }
      const type = (attr(line, 'workoutActivityType') || '').replace('HKWorkoutActivityType', '');
      let dur = parseFloat(attr(line, 'duration')) || 0;
      const du = attr(line, 'durationUnit');
      if (du === 's') dur /= 60; if (du === 'hr') dur *= 60;
      const w = { type, start: sd, day: sd.slice(0, 10), duration: dur, source: attr(line, 'sourceName') || 'Apple Health' };
      const td = parseFloat(attr(line, 'totalDistance'));
      if (Number.isFinite(td)) { const u = attr(line, 'totalDistanceUnit'); w.distanceKm = u === 'm' ? td / 1000 : u === 'mi' ? td * 1.609 : td; }
      if (line.trimEnd().endsWith('/>')) workouts.push(w); else cur = w;
      return;
    }
    if (!line.includes('<Record ')) return;
    const type = attr(line, 'type');
    if (!type) return;
    const sd = attr(line, 'startDate');
    if (!sd || sd.slice(0, 10) < cutoff) return;
    const src = attr(line, 'sourceName') || '?';
    const day = sd.slice(0, 10);
    switch (type) {
      case 'HKQuantityTypeIdentifierStepCount': addSum(sumBySrc.steps, day, src, parseFloat(attr(line, 'value')) || 0); break;
      case 'HKQuantityTypeIdentifierActiveEnergyBurned': addSum(sumBySrc.kcal, day, src, parseFloat(attr(line, 'value')) || 0); break;
      case 'HKQuantityTypeIdentifierAppleExerciseTime': addSum(sumBySrc.exmin, day, src, parseFloat(attr(line, 'value')) || 0); break;
      case 'HKQuantityTypeIdentifierRestingHeartRate': addAvg(avg.rhr, day, parseFloat(attr(line, 'value'))); break;
      case 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN': addAvg(avg.hrv, day, parseFloat(attr(line, 'value'))); break;
      case 'HKQuantityTypeIdentifierVO2Max': addAvg(avg.vo2, day, parseFloat(attr(line, 'value'))); break;
      case 'HKQuantityTypeIdentifierBodyMass': {
        let v = parseFloat(attr(line, 'value')); if (attr(line, 'unit') === 'lb') v *= 0.4536; addAvg(avg.weight, day, v); break;
      }
      case 'HKCategoryTypeIdentifierSleepAnalysis': {
        const val = attr(line, 'value') || '';
        if (!val.includes('Asleep')) break;
        const ed = attr(line, 'endDate');
        const h = (toDate(ed) - toDate(sd)) / 3600000;
        if (h > 0 && h < 16) addSum(sumBySrc.sleep, ed.slice(0, 10), src, h);
        break;
      }
    }
  };

  // ---- קריאה בסטרימינג ----
  const decoder = new TextDecoder();
  let leftover = '';
  const feedText = (chunk, final) => {
    const text = leftover + decoder.decode(chunk, { stream: !final });
    const parts = text.split('\n');
    leftover = final ? '' : parts.pop();
    for (const l of parts) handleLine(l);
    if (final && leftover) handleLine(leftover);
  };

  const total = file.size;
  let read = 0;
  const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip');

  await new Promise(async (resolve, reject) => {
    try {
      let unzip = null, found = false, finished = false;
      if (isZip) {
        unzip = new Unzip();
        unzip.register(UnzipInflate);
        unzip.onfile = (f) => {
          const n = f.name.toLowerCase();
          // הקובץ הראשי (בעברית לפעמים "ייצוא.xml") — לא export_cda ולא מסלולים
          if (found || !n.endsWith('.xml') || n.includes('cda') || n.includes('workout-routes') || n.includes('electrocardiograms')) return;
          found = true;
          f.ondata = (err, chunk, final) => {
            if (err) { reject(err); return; }
            feedText(chunk, final);
            if (final) { finished = true; resolve(); }
          };
          f.start();
        };
      }
      const reader = file.stream().getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.length;
        onProgress?.(read / total, lines);
        if (unzip) unzip.push(value, false); else feedText(value, false);
        if (finished) { reader.cancel().catch(() => {}); break; }
        // לתת ל-UI לנשום
        if (read % (8 << 20) < value.length) await new Promise(r => setTimeout(r, 0));
      }
      if (unzip) { if (!finished) unzip.push(new Uint8Array(0), true); if (!found) reject(new Error('לא נמצא קובץ XML בתוך ה-ZIP')); else if (!finished) resolve(); }
      else { feedText(new Uint8Array(0), true); resolve(); }
    } catch (e) { reject(e); }
  });

  // ---- סיכום ----
  const days = {};
  const put = (day, k, v) => { (days[day] ||= {})[k] = v; };
  const maxSrc = o => Math.max(...Object.values(o));
  for (const [d, o] of Object.entries(sumBySrc.steps)) put(d, 'steps', Math.round(maxSrc(o)));
  for (const [d, o] of Object.entries(sumBySrc.sleep)) put(d, 'sleepH', round(maxSrc(o), 2));
  for (const [d, o] of Object.entries(sumBySrc.kcal)) put(d, 'activeKcal', Math.round(maxSrc(o)));
  for (const [d, o] of Object.entries(sumBySrc.exmin)) put(d, 'exerciseMin', Math.round(maxSrc(o)));
  for (const [k, key] of [['rhr', 'rhr'], ['hrv', 'hrv'], ['vo2', 'vo2'], ['weight', 'weightKg']])
    for (const [d, o] of Object.entries(avg[k])) if (o.n) put(d, key, round(o.s / o.n, 1));

  const mapped = workouts.filter(w => !w.skip && w.duration > 3).map(w => {
    const t = WORKOUT_MAP[w.type] || 'cardio';
    const rpe = rpeFromHR(w.avgHR, age) ?? (t === 'intervals' ? 8 : t === 'strength' ? 7 : 6);
    const params = t === 'sprints' ? { reps: 6, rpe } : { duration: Math.round(w.duration), rpe };
    if (w.distanceKm) params.distance = round(w.distanceKm, 2);
    return { key: w.start + '|' + w.type, date: w.day, type: t, params, source: w.source, rawType: w.type, avgHR: w.avgHR };
  }).sort((a, b) => a.key.localeCompare(b.key));

  return { days, workouts: mapped, lines };
}

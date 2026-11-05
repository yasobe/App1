// =====================================================================
//  נורמות אוכלוסייה — איפה אתה ביחס לממוצע של בני גילך ומינך.
//
//  ציון 10 = הממוצע (חציון) של בני גילך ומינך.
//  הציון = 10 × (המדד שלך / המדד הממוצע), באותו מדד פיזיקלי שבו נמדד השיפור
//  (כוח לפי Epley, VO2max, מהירות, טווח הושטה, WHO-5). כך 12 = 20% מעל הממוצע,
//  ו-20% שיפור מאוחר יותר מעלה את הציון ב-20%.
//  אחוזון = הערכה לפי התפלגות נורמלית שמותאמת לטבלאות.
//
//  ⚠ המספרים מטבלאות שפורסמו, בקירוב (מחקרים שונים, שיטות שונות).
// =====================================================================
import { TESTS } from './research.js';

export const NORM_SOURCES = {
  csep: 'Canadian Society for Exercise Physiology — CSEP Physical Activity Training for Health (CSEP-PATH) Resource Manual, 2013: נורמות שכיבות סמיכה ו-Sit & Reach (חמישונים לפי גיל ומין).',
  friend: 'Kaminsky LA et al. — Reference standards for cardiorespiratory fitness measured with cardiopulmonary exercise testing: data from the FRIEND registry. Mayo Clin Proc. 2015;90(11):1515–1523.',
  who5: 'Topp CW et al. — The WHO-5 Well-Being Index: a systematic review. Psychother Psychosom. 2015;84(3):167–176 (ממוצעי אוכלוסייה כלליים ~60–70).',
  sprint: 'אין טבלאות טובות לספרינט 30 מ׳ באוכלוסייה הכללית — הערכה גסה בלבד.',
};

const BANDS = [[0, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 69], [70, 120]];
function band(age) { const a = Number(age) || 30; return BANDS.findIndex(([lo, hi]) => a >= lo && a <= hi); }

// CSEP: גבולות החמישונים [p20, p40, p60, p80]. גברים — שכיבות סמיכה מלאות; נשים — על הברכיים.
const PUSHUPS = {
  m: [[17.5, 22.5, 28.5, 38.5], [16.5, 21.5, 28.5, 35.5], [11.5, 16.5, 21.5, 29.5], [9.5, 12.5, 16.5, 24.5], [6.5, 9.5, 12.5, 20.5], [4.5, 7.5, 10.5, 17.5], [4.5, 7.5, 10.5, 17.5]],
  f: [[11.5, 17.5, 24.5, 32.5], [9.5, 14.5, 20.5, 29.5], [7.5, 12.5, 19.5, 26.5], [4.5, 10.5, 14.5, 23.5], [1.5, 6.5, 10.5, 20.5], [1.5, 4.5, 11.5, 16.5], [1.5, 4.5, 11.5, 16.5]],
};
// CSEP Sit & Reach (ס״מ, אצבעות הרגליים ב-26 ס״מ) → מומר ל"ס״מ ביחס לאצבעות"
const SITREACH = {
  m: [[23.5, 28.5, 33.5, 38.5], [24.5, 29.5, 33.5, 39.5], [22.5, 27.5, 32.5, 37.5], [17.5, 23.5, 28.5, 34.5], [15.5, 23.5, 27.5, 34.5], [14.5, 19.5, 24.5, 32.5], [14.5, 19.5, 24.5, 32.5]],
  f: [[28.5, 33.5, 37.5, 42.5], [27.5, 32.5, 36.5, 40.5], [26.5, 31.5, 35.5, 40.5], [24.5, 29.5, 33.5, 37.5], [24.5, 29.5, 32.5, 38.5], [22.5, 26.5, 30.5, 34.5], [22.5, 26.5, 30.5, 34.5]],
};
// FRIEND: VO2max (מ״ל/ק״ג/דק׳) [p25, p50, p75]
const VO2 = {
  m: [[40.1, 48.0, 55.2], [40.1, 48.0, 55.2], [35.9, 42.4, 49.2], [31.9, 37.8, 45.0], [27.1, 32.6, 39.7], [23.7, 28.2, 34.5], [20.4, 24.4, 30.4]],
  f: [[30.5, 37.6, 44.7], [30.5, 37.6, 44.7], [25.3, 30.9, 36.1], [22.1, 27.7, 32.4], [19.9, 24.4, 28.2], [17.2, 22.5, 24.9], [15.5, 20.1, 21.9]],
};

const Z80 = 0.8416, IQR = 1.349;
function fromQuintiles(q) { return { median: (q[1] + q[2]) / 2, sd: (q[3] - q[0]) / (2 * Z80) }; }
function fromQuartiles(q) { return { median: q[1], sd: (q[2] - q[0]) / IQR }; }
// כשהמין לא ידוע — ממוצע של שניהם
function bySex(table, sex, b, fn) {
  if (sex === 'm' || sex === 'f') return fn(table[sex][b]);
  const a = fn(table.m[b]), c = fn(table.f[b]);
  return { median: (a.median + c.median) / 2, sd: (a.sd + c.sd) / 2 };
}

// מחזיר את הנורמה ביחידות של המבחן
export function normFor(key, age, sex) {
  const b = band(age);
  switch (key) {
    case 'pushups': return { ...bySex(PUSHUPS, sex, b, fromQuintiles), src: 'csep', higher: true };
    case 'sitreach': { const n = bySex(SITREACH, sex, b, fromQuintiles); return { median: n.median - 26, sd: n.sd, src: 'csep', higher: true }; }
    case 'cooper': case 'vo2': return { ...bySex(VO2, sex, b, fromQuartiles), src: 'friend', higher: true, vo2: true };
    case 'who5': return { median: 65, sd: 18, src: 'who5', higher: true };
    case 'sprint': {
      // הערכה גסה: ~5.0 שנ׳ (גברים) / ~5.8 שנ׳ (נשים) בגיל 20–29, האטה של ~0.8% לשנה מעל 30
      const base = sex === 'm' ? 5.0 : sex === 'f' ? 5.8 : 5.4;
      const a = Number(age) || 30;
      return { median: base * (1 + Math.max(0, a - 30) * 0.008), sd: 0.45, src: 'sprint', higher: false, rough: true };
    }
    default: return null; // squat1rm — אין נורמה אמינה לאוכלוסייה הכללית
  }
}

// Φ — התפלגות נורמלית מצטברת
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ממיר ערך מבחן לערך שמשווים לנורמה (קופר → VO2max)
function comparable(key, value) {
  if (key === 'cooper') return TESTS.cooper.toIndex(value);
  return value;
}

// ציון (10 = ממוצע) ואחוזון
export function normScore(key, value, age, sex) {
  const n = normFor(key, age, sex);
  if (!n) return null;
  const x = comparable(key, value);
  const z = (x - n.median) / n.sd * (n.higher ? 1 : -1);
  const pct = Math.round(Math.min(99, Math.max(1, phi(z) * 100)));
  // יחס במדד הפיזיקלי של התכונה (אותו מדד שבו נמדד השיפור)
  const T = TESTS[key === 'cooper' ? 'vo2' : key];
  const idxYou = T.toIndex(x), idxAvg = T.toIndex(n.median);
  const score = Math.max(1, Math.min(40, 10 * idxYou / idxAvg));
  return { score, pct, median: n.median, src: n.src, rough: !!n.rough, z };
}

// עטוף בבידוד LTR כדי ש"20–29" לא יתהפך בתוך טקסט עברי
export function bandLabel(age) { const [lo, hi] = BANDS[band(age)]; return lo === 0 ? 'עד 19' : '\u2066' + (hi > 100 ? '70+' : `${lo}–${hi}`) + '\u2069'; }
export const SEX_HE = { m: 'גברים', f: 'נשים' };

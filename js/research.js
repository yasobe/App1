// =====================================================================
//  מודל המחקר — כל המספרים כאן מבוססים על מחקרים (ראו SOURCES למטה).
//
//  הרעיון: לכל תכונה יש "עקומת הסתגלות" רוויה:
//      G(n) = Gmax · (1 − e^(−n/τ))
//  כאשר n = מספר "אימונים סטנדרטיים" מצטבר, Gmax = תקרת השיפור הריאלית
//  (באחוזים מנקודת אפס של אדם לא מאומן), ו-τ (טאו) נבחר כך שהעקומה
//  תעבור דרך התוצאות שנמדדו במחקרים (למשל +30% כוח אחרי 36 אימונים).
//
//  כל אימון אמיתי מתורגם ל"מנה" (dose) יחסית לאימון הסטנדרטי שבמחקר
//  (משך × עצימות), והשיפור מחושב כך:
//      ΔG = (Gmax − G) · (1 − e^(−dose/τ))
//  כלומר — ככל שהתקדמת יותר, כל אימון מוסיף פחות (תשואה פוחתת), בדיוק
//  כמו שקורה במציאות.
// =====================================================================

export const STATS = {
  STR: {
    key: 'STR', he: 'כוח', icon: '⚔️', color: '#ff5d73',
    gmax: 100, tau: 101,
    std: 'אימון כוח של ~45 דק׳ ב-RPE 8',
    basis: 'מתאמנים לא מאומנים משפרים כוח בכ-25%–40% ב-8–12 שבועות של 2–3 אימונים בשבוע (ACSM 2009). העקומה מכוילת ל-~30% אחרי 36 אימונים (12 שבועות × 3).',
    sources: ['acsm2009', 'rhea2003'],
    graceDays: 21, decayPerDay: 0.004,
    decayNote: 'כוח נשמר יחסית טוב עד ~3 שבועות ללא אימון, ואז יורד בהדרגה (Mujika & Padilla 2000).',
  },
  END: {
    key: 'END', he: 'סיבולת', icon: '🫀', color: '#3ad1ff',
    gmax: 25, tau: 46,
    std: 'אימון אירובי של ~30 דק׳ במאמץ בינוני-גבוה',
    basis: 'VO2max עולה בממוצע בכ-5–5.5 מ״ל/ק״ג/דק׳ (~10–15%) אחרי 8–12 שבועות של אימון רציף או אינטרוולים (Milanović 2015). התקרה הממוצעת ~20–25% (HERITAGE), עם שונות גדולה בין אנשים.',
    sources: ['milanovic2015', 'heritage1999'],
    graceDays: 10, decayPerDay: 0.012,
    decayNote: 'VO2max יורד ב-4%–14% אחרי 3–4 שבועות ללא אימון (Mujika & Padilla 2000) — יורד מהר יותר מכוח.',
  },
  SPD: {
    key: 'SPD', he: 'מהירות', icon: '⚡', color: '#ffd23a',
    gmax: 12, tau: 38,
    std: 'אימון ספרינטים של ~8 ריצות קצרות במאמץ מלא',
    basis: 'אימוני ספרינט/פליאומטריקה משפרים זמני ספרינט בכ-3%–6% ב-6–10 שבועות (Rumpf 2016). העקומה מכוילת ל-~4.5% אחרי 18 אימונים.',
    sources: ['rumpf2016'],
    graceDays: 21, decayPerDay: 0.006,
    decayNote: 'מהירות נשמרת בינונית; ירידה מתונה אחרי ~3 שבועות.',
  },
  FLX: {
    key: 'FLX', he: 'גמישות', icon: '🌀', color: '#7cff8a',
    gmax: 30, tau: 49,
    std: 'מתיחות/מוביליטי של ~15 דק׳',
    basis: 'מתיחות קבועות (≥5 דק׳ בשבוע לכל קבוצת שרירים) מגדילות טווח תנועה בכ-8%–15% ב-4–8 שבועות (Thomas 2018).',
    sources: ['thomas2018'],
    graceDays: 14, decayPerDay: 0.008,
    decayNote: 'טווח התנועה חוזר בהדרגה לנקודת ההתחלה כשמפסיקים למתוח.',
  },
  MND: {
    key: 'MND', he: 'מצב נפשי', icon: '🧠', color: '#c08bff',
    gmax: 30, tau: 59,
    std: '~30 דק׳ פעילות גופנית או ~15 דק׳ מדיטציה',
    basis: 'פעילות גופנית מפחיתה תסמיני דיכאון/חרדה בגודל אפקט ~0.4–0.6 (Singh 2023), אימוני כוח ~0.66 (Gordon 2018), מדיטציה ~0.3–0.38 אחרי 8 שבועות (Goyal 2014). תורגם ל-~10% שיפור במדד רווחה אחרי ~24 מפגשים. מכויל מול שאלון WHO-5 שלך.',
    sources: ['singh2023', 'gordon2018', 'goyal2014', 'scott2021', 'white2019', 'davis2016', 'who5'],
    graceDays: 7, decayPerDay: 0.015,
    decayNote: 'ההשפעה של פעילות על מצב הרוח דועכת מהר יחסית בלי המשכיות.',
  },
};

export const STAT_KEYS = Object.keys(STATS);

// ---------------------------------------------------------------------
//  סוגי פעילות: איך מחושבת ה"מנה" ואיזה תכונות כל פעילות משפרת.
//  effects = משקל ההשפעה על כל תכונה (1 = השפעה מלאה כמו במחקר).
// ---------------------------------------------------------------------
export const ACTIVITIES = {
  strength: {
    he: 'אימון כוח', icon: '🏋️', fields: ['duration', 'rpe'], defaults: { duration: 40, rpe: 7 },
    stdMinutes: 45,
    effects: { STR: 1, MND: 0.5, SPD: 0.15, END: 0.1 },
    note: 'השפעה על מצב נפשי: אימוני כוח הפחיתו תסמיני דיכאון (Gordon 2018).',
    xp: 60,
  },
  run: {
    he: 'ריצה / אירובי רציף', icon: '🏃', fields: ['duration', 'distance', 'rpe'], defaults: { duration: 30, distance: 4, rpe: 6 },
    stdMinutes: 30,
    effects: { END: 1, MND: 0.6, SPD: 0.1 },
    xp: 55,
  },
  cardio: {
    he: 'אירובי אחר (אופניים/שחייה/חתירה)', icon: '🚴', fields: ['duration', 'rpe'], defaults: { duration: 40, rpe: 6 },
    stdMinutes: 30,
    effects: { END: 0.9, MND: 0.5 },
    xp: 50,
  },
  intervals: {
    he: 'אינטרוולים (HIIT)', icon: '🔥', fields: ['duration', 'rpe'], defaults: { duration: 25, rpe: 8 },
    stdMinutes: 25,
    effects: { END: 1.1, SPD: 0.4, MND: 0.5 },
    xp: 65,
  },
  sprints: {
    he: 'ספרינטים', icon: '⚡', fields: ['reps', 'rpe'], defaults: { reps: 6, rpe: 9 },
    stdReps: 8,
    effects: { SPD: 1, END: 0.2, STR: 0.1, MND: 0.3 },
    xp: 60,
  },
  mobility: {
    he: 'מתיחות / מוביליטי / יוגה', icon: '🧘', fields: ['duration'], defaults: { duration: 15 },
    stdMinutes: 15,
    effects: { FLX: 1, MND: 0.3 },
    xp: 30,
  },
  meditation: {
    he: 'מדיטציה / נשימות', icon: '🕯️', fields: ['duration'], defaults: { duration: 10 },
    stdMinutes: 15,
    effects: { MND: 1 },
    note: 'מדיטציית קשיבות — שיפור מתון בחרדה ודיכאון (Goyal 2014).',
    xp: 30,
  },
  walk: {
    he: 'הליכה / זמן בטבע', icon: '🌳', fields: ['duration'], defaults: { duration: 30 },
    stdMinutes: 30,
    effects: { MND: 0.5, END: 0.15 },
    note: '120 דק׳ בשבוע בטבע קשורות לבריאות ורווחה טובות יותר (White 2019).',
    xp: 25,
  },
  journal: {
    he: 'יומן הכרת תודה', icon: '📜', fields: [], defaults: {},
    fixedDose: 0.4,
    effects: { MND: 1 },
    note: 'התערבויות הכרת תודה — השפעה קטנה אך עקבית על רווחה (Davis 2016).',
    xp: 15,
  },
  habit: {
    he: 'הרגל יומי', icon: '✅', fields: [], defaults: {}, fixedDose: 1,
    effects: {},
    xp: 12,
  },
  sleep: {
    he: 'שינה', icon: '🌙', fields: ['hours'], defaults: { hours: 7.5 },
    effects: { MND: 1 },
    note: 'שיפור איכות השינה משפר בריאות נפשית (Scott 2021). 7+ שעות מומלצות למבוגרים (Watson 2015).',
    xp: 20,
  },
};

// עצימות לפי RPE (דירוג מאמץ סובייקטיבי 1–10). RPE 8 = עצימות האימון הסטנדרטי.
export function intensityFromRPE(rpe) {
  const r = Number(rpe) || 6;
  return clamp((r - 3) / 5, 0.2, 1.2);
}

// מחשב את המנה לפעילות (ביחס לאימון הסטנדרטי במחקר).
export function computeDose(type, p) {
  const a = ACTIVITIES[type];
  if (!a) return { dose: 0, parts: 'סוג לא ידוע' };
  if (type === 'sleep') {
    const h = Number(p.hours) || 0;
    // מלא בטווח 7–9 שעות, יורד מחוץ לטווח
    const dist = h < 7 ? 7 - h : h > 9 ? h - 9 : 0;
    const d = clamp(0.5 * (1 - dist / 3), 0, 0.5);
    return { dose: d, parts: `${fmt(h, 1)} שעות שינה → ${dist === 0 ? 'בטווח המומלץ 7–9' : 'מחוץ לטווח המומלץ'}` };
  }
  if (a.fixedDose) return { dose: a.fixedDose, parts: 'מנה קבועה' };
  const inten = a.fields.includes('rpe') ? intensityFromRPE(p.rpe) : 1;
  if (type === 'sprints') {
    const reps = Number(p.reps) || 0;
    const vol = clamp(reps / a.stdReps, 0.1, 1.5);
    return { dose: vol * inten, parts: `${reps} ספרינטים / ${a.stdReps} סטנדרט × עצימות ${fmt(inten, 2)}` };
  }
  const dur = Number(p.duration) || 0;
  const vol = clamp(dur / a.stdMinutes, 0.1, 1.6);
  const rpePart = a.fields.includes('rpe') ? ` × עצימות ${fmt(inten, 2)} (RPE ${p.rpe})` : '';
  return { dose: vol * inten, parts: `${dur} דק׳ / ${a.stdMinutes} דק׳ סטנדרט${rpePart}` };
}

// RPE משוער מדופק ממוצע (HRmax = 208 − 0.7×גיל, Tanaka 2001)
export function rpeFromHR(avgHR, age) {
  if (!avgHR || !age) return null;
  const hrmax = 208 - 0.7 * age;
  const pct = avgHR / hrmax;
  // 60%→5, 70%→6, 80%→7.5, 90%→9
  return clamp(Math.round((5 + (pct - 0.6) * 13.3) * 2) / 2, 3, 10);
}

// נקודת ההתחלה על העקומה לפי רמת אימון קודמת
export const TRAINING_STATUS = {
  untrained: { he: 'לא מתאמן/ת בכלל', n0: 0 },
  some: { he: 'מתאמן/ת לפעמים / פחות מחצי שנה', n0: 0.5 },
  trained: { he: 'מתאמן/ת קבוע יותר משנה', n0: 1.5 },
};

// ---------------------------------------------------------------------
//  מבחני כושר — מדידה אמיתית שגוברת על המודל (כיול)
// ---------------------------------------------------------------------
export const TESTS = {
  pushups: {
    stat: 'STR', he: 'מקסימום שכיבות סמיכה ברצף', unit: 'חזרות', step: 1,
    // כוח יחסי לפי נוסחת Epley: 1RM ∝ (1 + reps/30)
    toIndex: v => 1 + v / 30,
    how: 'שכיבות סמיכה מלאות (חזה כמעט נוגע ברצפה) עד כשל טכני. גברים ונשים — אפשר על הברכיים, רק תמיד באותה צורה.',
  },
  squat1rm: {
    stat: 'STR', he: 'סקוואט / לחיצת חזה — משקל × חזרות (מוזן כ-1RM משוער)', unit: 'ק״ג (1RM)', step: 0.5,
    toIndex: v => v,
    how: 'בחדר כושר: הזינו 1RM משוער (משקל × (1 + חזרות/30)). חשוב להשתמש תמיד באותו תרגיל.',
  },
  cooper: {
    stat: 'END', he: 'מבחן קופר — מרחק ב-12 דקות', unit: 'מטר', step: 10,
    // VO2max ≈ (d − 504.9) / 44.73  (Cooper 1968)
    toIndex: v => Math.max(10, (v - 504.9) / 44.73),
    how: 'רצו/הלכו כמה שיותר רחוק ב-12 דקות (מסלול ישר או אפליקציית ריצה). VO2max משוער = (מרחק − 504.9) / 44.73.',
  },
  vo2: {
    stat: 'END', he: 'VO2max (כושר לב-ריאה מ-Apple Health)', unit: 'מ״ל/ק״ג/דק׳', step: 0.1,
    toIndex: v => v,
    how: 'מגיע אוטומטית מ-Apple Health (דורש Apple Watch) או מוזן ידנית.',
  },
  sprint: {
    stat: 'SPD', he: 'ספרינט 30 מטר', unit: 'שניות', step: 0.01,
    // זמן קצר יותר = טוב יותר → המדד הוא מהירות
    toIndex: v => 30 / v,
    how: 'מדדו 30 מ׳, התחילו מעמידה, שמישהו יתזמן (או צלמו וידאו). אחרי חימום טוב!',
  },
  sitreach: {
    stat: 'FLX', he: 'גמישות — ישיבה והושטה', unit: 'ס״מ', step: 0.5,
    // היסט של 50 ס״מ (≈ המרחק מהישבן לאצבעות) כדי שגם "לא מגיע" יעבוד
    toIndex: v => Math.max(5, v + 50),
    how: 'שבו על הרצפה עם רגליים ישרות וצמודות, כפות רגליים לכיוון התקרה. אחרי חימום קצר, הושיטו את שתי הידיים קדימה לאט, כמה שאפשר בלי לכופף ברכיים, והחזיקו 2 שניות. בחרו לאן הגעתם.',
  },
  who5: {
    stat: 'MND', he: 'שאלון רווחה WHO-5', unit: 'ציון 0–100', step: 4,
    toIndex: v => Math.max(4, v),
    how: 'שאלון מתוקף של ארגון הבריאות העולמי (Topp 2015). מילוי כל שבוע.',
  },
};

export const WHO5_QUESTIONS = [
  'הרגשתי עליז/ה ובמצב רוח טוב',
  'הרגשתי רגוע/ה ונינוח/ה',
  'הרגשתי פעיל/ה ומלא/ת מרץ',
  'התעוררתי רענן/ה ונח/ה',
  'חיי היומיום שלי היו מלאים בדברים שמעניינים אותי',
];
export const WHO5_ANSWERS = ['אף פעם', 'לעיתים רחוקות', 'פחות ממחצית הזמן', 'יותר ממחצית הזמן', 'רוב הזמן', 'כל הזמן'];

// ---------------------------------------------------------------------
export const SOURCES = {
  acsm2009: 'Ratamess NA et al. (ACSM Position Stand) — Progression models in resistance training for healthy adults. Med Sci Sports Exerc. 2009;41(3):687–708.',
  rhea2003: 'Rhea MR et al. — A meta-analysis to determine the dose response for strength development. Med Sci Sports Exerc. 2003;35(3):456–464.',
  milanovic2015: 'Milanović Z, Sporiš G, Weston M — Effectiveness of HIIT and continuous endurance training for VO2max improvements: a systematic review and meta-analysis. Sports Med. 2015;45(10):1469–1481.',
  heritage1999: 'Bouchard C et al. (HERITAGE Family Study) — Familial aggregation of VO2max response to exercise training. J Appl Physiol. 1999;87(3):1003–1008.',
  rumpf2016: 'Rumpf MC et al. — Effect of different sprint training methods on sprint performance over various distances: a brief review. J Strength Cond Res. 2016;30(6):1767–1785.',
  thomas2018: 'Thomas E et al. — The relation between stretching typology and stretching duration: the effects on range of motion. Int J Sports Med. 2018;39(4):243–254.',
  singh2023: 'Singh B et al. — Effectiveness of physical activity interventions for improving depression, anxiety and distress: an overview of systematic reviews. Br J Sports Med. 2023;57(18):1203–1209.',
  gordon2018: 'Gordon BR et al. — Association of efficacy of resistance exercise training with depressive symptoms. JAMA Psychiatry. 2018;75(6):566–576.',
  goyal2014: 'Goyal M et al. — Meditation programs for psychological stress and well-being: a systematic review and meta-analysis. JAMA Intern Med. 2014;174(3):357–368.',
  scott2021: 'Scott AJ et al. — Improving sleep quality leads to better mental health: a meta-analysis of randomised controlled trials. Sleep Med Rev. 2021;60:101556.',
  white2019: 'White MP et al. — Spending at least 120 minutes a week in nature is associated with good health and wellbeing. Sci Rep. 2019;9:7730.',
  davis2016: 'Davis DE et al. — Thankful for the little things: a meta-analysis of gratitude interventions. J Couns Psychol. 2016;63(1):20–31.',
  paluch2022: 'Paluch AE et al. — Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts. Lancet Public Health. 2022;7(3):e219–e228.',
  watson2015: 'Watson NF et al. — Recommended amount of sleep for a healthy adult (AASM/SRS consensus). Sleep. 2015;38(6):843–844.',
  mujika2000: 'Mujika I, Padilla S — Detraining: loss of training-induced physiological and performance adaptations. Part I. Sports Med. 2000;30(2):79–87.',
  cooper1968: 'Cooper KH — A means of assessing maximal oxygen intake. JAMA. 1968;203(3):201–204.',
  who5: 'Topp CW et al. — The WHO-5 Well-Being Index: a systematic review of the literature. Psychother Psychosom. 2015;84(3):167–176.',
  lally2010: 'Lally P, van Jaarsveld CHM, Potts HWW, Wardle J — How are habits formed: modelling habit formation in the real world. Eur J Soc Psychol. 2010;40(6):998–1009.',
  jenkins2019: 'Jenkins EM et al. — Do stair climbing exercise "snacks" improve cardiorespiratory fitness? Appl Physiol Nutr Metab. 2019;44(6):681–684.',
  curry2018: 'Curry OS et al. — Happy to help? A systematic review and meta-analysis of the effects of performing acts of kindness on the well-being of the actor. J Exp Soc Psychol. 2018;76:320–329.',
  holtlunstad2010: 'Holt-Lunstad J, Smith TB, Layton JB — Social relationships and mortality risk: a meta-analytic review. PLoS Med. 2010;7(7):e1000316.',
  golden2005: 'Golden RN et al. — The efficacy of light therapy in the treatment of mood disorders: a review and meta-analysis of the evidence. Am J Psychiatry. 2005;162(4):656–662.',
  seligman2005: 'Seligman MEP, Steen TA, Park N, Peterson C — Positive psychology progress: empirical validation of interventions. Am Psychol. 2005;60(5):410–421.',
  gollwitzer2006: 'Gollwitzer PM, Sheeran P — Implementation intentions and goal achievement: a meta-analysis of effects and processes. Adv Exp Soc Psychol. 2006;38:69–119.',
  tanaka2001: 'Tanaka H, Monahan KD, Seals DR — Age-predicted maximal heart rate revisited. J Am Coll Cardiol. 2001;37(1):153–156.',
};

export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function fmt(v, d = 1) { return Number(v).toFixed(d); }

// =====================================================================
//  משימות מיוחדות — קופצות בזמן אקראי, פעם בכמה ימים.
//  type 'act'  = פעילות שנמדדת במודל המחקרי (activity + target)
//  type 'task' = משימה לסמן ✓ (effects רק כשיש בסיס מחקרי; אחרת EXP בלבד)
//  urgent = מתאימה ל"משימת חירום" עם מגבלת זמן של שעתיים
//  physical = לא מוצעת ביום מנוחה/מחלה או כשדווח כאב
// =====================================================================

export const RARITY = {
  common: { he: 'רגילה', xp: 60, color: '#4fb3ff', weight: 67 },
  rare: { he: 'נדירה', xp: 120, color: '#c08bff', weight: 25 },
  epic: { he: 'אפית', xp: 250, color: '#ffcc4d', weight: 8 },
};

// L = רמת השחקן — לחישוב קושי
export const SPECIAL_POOL = [
  // ---- גוף ----
  { key: 'squats', rarity: 'common', type: 'act', physical: true, urgent: true, icon: '🦵',
    title: L => `${40 + L * 2} סקוואטים`, desc: 'אפשר לפצל לסטים לאורך הזמן.',
    act: 'strength', target: L => ({ duration: 10, rpe: 7 }) },
  { key: 'plank', rarity: 'common', type: 'act', physical: true, urgent: true, icon: '🧱',
    title: L => `${Math.min(6, 2 + Math.floor(L / 5))} דקות פלאנק מצטבר`, desc: 'בכמה החזקות, כמה שצריך.',
    act: 'strength', target: () => ({ duration: 10, rpe: 7 }) },
  { key: 'stairs', rarity: 'common', type: 'act', physical: true, urgent: true, icon: '🪜',
    title: () => '10 קומות במדרגות', desc: 'בבניין, בעבודה, בקניון — העיקר לעלות.',
    act: 'cardio', target: () => ({ duration: 10, rpe: 7 }) },
  { key: 'sunset_walk', rarity: 'common', type: 'act', physical: true, icon: '🌅',
    title: () => 'הליכת שקיעה של 30 דקות', desc: 'בלי אוזניות. רק להסתכל מסביב.',
    act: 'walk', target: () => ({ duration: 30 }) },
  { key: 'bonus_run', rarity: 'rare', type: 'act', physical: true, icon: '🏃',
    title: L => `ריצת בונוס: ${15 + Math.min(15, L)} דקות`, desc: 'בקצב נוח. זה בנוסף למשימה היומית.',
    act: 'run', target: L => ({ duration: 15 + Math.min(15, L), rpe: 6 }) },
  { key: 'jacks', rarity: 'common', type: 'act', physical: true, urgent: true, icon: '⚡',
    title: L => `${100 + L * 5} ג׳אמפינג ג׳אקס`, desc: 'בכמה סטים שצריך.',
    act: 'intervals', target: () => ({ duration: 8, rpe: 7 }) },
  { key: 'evening_stretch', rarity: 'common', type: 'act', icon: '🧘',
    title: () => '20 דקות מתיחות לפני שינה', desc: 'החזקות ארוכות ונשימות איטיות.',
    act: 'mobility', target: () => ({ duration: 20 }) },
  { key: 'hike', rarity: 'epic', type: 'act', physical: true, icon: '⛰️',
    title: () => 'מסע: הליכה של 90 דקות בטבע', desc: 'שביל, חוף, יער — מקום שלא היית בו לאחרונה.',
    act: 'walk', target: () => ({ duration: 90 }) },

  // ---- נפש ----
  { key: 'silence', rarity: 'common', type: 'act', urgent: true, icon: '🕯️',
    title: () => '10 דקות מדיטציה בשקט מוחלט', desc: 'בלי אפליקציה, בלי מוזיקה.',
    act: 'meditation', target: () => ({ duration: 10 }) },
  { key: 'gratitude_letter', rarity: 'epic', type: 'task', icon: '✉️',
    title: () => 'מכתב תודה', desc: 'כתבו מכתב תודה למישהו שהשפיע עליכם ושלחו אותו (או הקריאו לו).',
    effects: { MND: 0.5 }, note: '"ביקור תודה" שיפר אושר והפחית תסמיני דיכאון למשך חודש (Seligman 2005).', src: 'seligman2005' },
  { key: 'detox', rarity: 'rare', type: 'task', icon: '📵',
    title: () => 'דיטוקס: 3 שעות בלי רשתות חברתיות', desc: 'מעכשיו. אפשר לשים את הטלפון בחדר אחר.' },
  { key: 'no_phone_out', rarity: 'rare', type: 'task', icon: '🚪',
    title: () => 'שעה בחוץ בלי טלפון', desc: 'לצאת מהבית ולהשאיר אותו מאחור.',
    effects: { MND: 0.25 }, note: 'זמן בחוץ קשור לרווחה טובה יותר (White 2019).', src: 'white2019' },

  // ---- חברה ----
  { key: 'reconnect', rarity: 'rare', type: 'task', urgent: true, icon: '📞',
    title: () => 'להתקשר למישהו שלא דיברת איתו חצי שנה', desc: 'שיחה, לא הודעה.',
    effects: { MND: 0.25 }, note: 'קשרים חברתיים חזקים קשורים לבריאות (Holt-Lunstad 2010).', src: 'holtlunstad2010' },
  { key: 'compliment', rarity: 'common', type: 'task', urgent: true, icon: '💬',
    title: () => 'לפרגן למישהו בכנות', desc: 'מחמאה אמיתית וספציפית — לא "יפה לך".',
    effects: { MND: 0.15 }, note: 'מעשי טוב משפרים את הרווחה של מי שעושה אותם (Curry 2018).', src: 'curry2018' },
  { key: 'stranger', rarity: 'rare', type: 'task', icon: '🤝',
    title: () => 'מעשה טוב לאדם זר', desc: 'לעזור, לפנות מקום, לשלם קפה למי שאחריך…',
    effects: { MND: 0.2 }, note: 'מעשי טוב משפרים את הרווחה של מי שעושה אותם (Curry 2018).', src: 'curry2018' },

  // ---- חיים ----
  { key: 'drawer', rarity: 'common', type: 'task', urgent: true, icon: '🗄️',
    title: () => 'לסדר מגירה או מדף אחד', desc: 'עד הסוף — לזרוק מה שלא צריך.' },
  { key: 'cook', rarity: 'rare', type: 'task', icon: '🍲',
    title: () => 'לבשל ארוחה בריאה מאפס', desc: 'ירקות, חלבון, בלי משלוח.' },
  { key: 'water2l', rarity: 'common', type: 'task', icon: '💧',
    title: () => '2 ליטר מים עד הערב', desc: 'בקבוק ליד כל הזמן.' },
  { key: 'plan_week', rarity: 'common', type: 'task', urgent: true, icon: '🗓️',
    title: () => 'לתכנן את השבוע הבא ב-15 דקות', desc: '3 דברים חשובים + מתי כל אחד יקרה.' },
  { key: 'read30', rarity: 'common', type: 'task', icon: '📖',
    title: () => 'לקרוא 30 עמודים', desc: 'ספר, לא מסך.' },
  { key: 'words10', rarity: 'common', type: 'task', urgent: true, icon: '🗣️',
    title: () => 'ללמוד 10 מילים בשפה זרה', desc: 'ולהשתמש בשלוש מהן במשפט.' },
  { key: 'no_spend', rarity: 'rare', type: 'task', icon: '💰',
    title: () => 'יום בלי הוצאות לא הכרחיות', desc: 'רק מה שחייבים.' },
  { key: 'new_place', rarity: 'epic', type: 'task', icon: '🧭',
    title: () => 'הרפתקה: ללכת למקום חדש', desc: 'שכונה, פארק, מוזיאון או בית קפה שעוד לא היית בו.' },
  { key: 'cold', rarity: 'rare', type: 'task', urgent: true, icon: '🧊',
    title: () => '30 שניות מים קרים בסוף המקלחת', desc: 'נשימות איטיות. לא למי שיש לו בעיית לב.' },
  { key: 'screens_22', rarity: 'common', type: 'task', icon: '🌙',
    title: () => 'כל המסכים כבויים ב-22:00', desc: 'ספר, שיחה, מקלחת — ולישון.' },
  { key: 'skill', rarity: 'epic', type: 'task', icon: '🎯',
    title: () => 'שעה לכישרון חדש', desc: 'נגינה, ציור, קוד, בישול — משהו שתמיד רצית ללמוד.' },
];

export function poolItem(key) { return SPECIAL_POOL.find(x => x.key === key); }

// RNG דטרמיניסטי לפי מחרוזת — כדי שרענון לא "יגריל מחדש"
export function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

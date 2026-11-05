// =====================================================================
//  הרגלים יומיומיים — הדברים הקטנים.
//
//  כמה זמן לוקח להרגל להפוך לאוטומטי? Lally et al. (2010) עקבו אחרי
//  אנשים שבנו הרגל חדש: האוטומטיות עלתה בעקומה אסימפטוטית, עם חציון של
//  66 ימים להגיע לתקרה (טווח 18–254). פספוס יום בודד לא פגע בתהליך.
//  לכן: A(n) = 1 − e^(−n/22)  (n = ימים שבוצעו; 95% ≈ 66 ימים)
//
//  השפעה על תכונות: רק להרגלים שיש להם בסיס מחקרי סביר — במינון קטן.
//  לשאר אין השפעה מחושבת (רק EXP ואוטומטיות). לא ממציאים מספרים.
// =====================================================================

export const HABIT_TAU = 22;
export const HABIT_MEDIAN_DAYS = 66;

export const HABIT_CATEGORIES = {
  morning: 'בוקר',
  health: 'בריאות ותזונה',
  mind: 'נפש וחברה',
  learn: 'למידה',
  home: 'בית וסדר',
  digital: 'דיגיטל',
  money: 'כסף',
  move: 'תנועה קטנה',
};

// effects: { stat: dose } — dose ביחידות של "אימון סטנדרטי" של אותה תכונה
export const HABIT_LIBRARY = [
  { key: 'water_am', cat: 'morning', icon: '💧', name: 'כוס מים כשקמים' },
  { key: 'bed', cat: 'morning', icon: '🛏️', name: 'לסדר את המיטה' },
  { key: 'sun', cat: 'morning', icon: '☀️', name: '10 דק׳ אור יום בבוקר', effects: { MND: 0.15 },
    note: 'טיפול באור בהיר משפר מצב רוח (Golden 2005). אור בוקר טבעי הוא גרסה מתונה — לכן מינון קטן.', src: 'golden2005' },
  { key: 'no_phone_am', cat: 'morning', icon: '📵', name: '30 דק׳ ראשונות בלי טלפון' },

  { key: 'water', cat: 'health', icon: '🚰', name: '8 כוסות מים ביום' },
  { key: 'veggies', cat: 'health', icon: '🥗', name: 'ירק בכל ארוחה' },
  { key: 'protein', cat: 'health', icon: '🍳', name: 'חלבון בכל ארוחה' },
  { key: 'no_sugar', cat: 'health', icon: '🥤', name: 'בלי משקאות ממותקים' },
  { key: 'floss', cat: 'health', icon: '🦷', name: 'חוט דנטלי' },
  { key: 'screens_off', cat: 'health', icon: '🌙', name: 'מסכים כבויים שעה לפני שינה' },

  { key: 'breathe', cat: 'mind', icon: '🌬️', name: '2 דק׳ נשימות עמוקות', effects: { MND: 0.13 },
    note: 'כמו מדיטציה קצרה: 2 דק׳ מתוך מפגש סטנדרטי של 15 (Goyal 2014).', src: 'goyal2014' },
  { key: 'call', cat: 'mind', icon: '📞', name: 'שיחה עם חבר או משפחה', effects: { MND: 0.2 },
    note: 'קשרים חברתיים חזקים קשורים לבריאות ולתוחלת חיים (Holt-Lunstad 2010).', src: 'holtlunstad2010' },
  { key: 'kind', cat: 'mind', icon: '🤝', name: 'מעשה טוב אחד', effects: { MND: 0.15 },
    note: 'מעשי טוב משפרים את הרווחה של מי שעושה אותם — אפקט קטן (Curry 2018).', src: 'curry2018' },
  { key: 'outside', cat: 'mind', icon: '🌳', name: '15 דק׳ בחוץ', effects: { MND: 0.25 },
    note: 'זמן בטבע קשור לרווחה טובה יותר (White 2019).', src: 'white2019' },

  { key: 'read', cat: 'learn', icon: '📖', name: '10 דק׳ קריאה' },
  { key: 'learn', cat: 'learn', icon: '🧩', name: '15 דק׳ ללמוד משהו חדש' },
  { key: 'language', cat: 'learn', icon: '🗣️', name: 'שיעור בשפה חדשה' },

  { key: 'tidy', cat: 'home', icon: '🧹', name: '10 דק׳ סידור' },
  { key: 'sink', cat: 'home', icon: '🍽️', name: 'כיור ריק לפני שינה' },
  { key: 'clothes', cat: 'home', icon: '👕', name: 'להכין בגדים למחר' },

  { key: 'screen_limit', cat: 'digital', icon: '📱', name: 'זמן מסך מתחת ל-3 שעות' },
  { key: 'notif', cat: 'digital', icon: '🔕', name: 'שעה בלי התראות לעבודה מרוכזת' },

  { key: 'expenses', cat: 'money', icon: '💰', name: 'לרשום הוצאות של היום' },
  { key: 'no_impulse', cat: 'money', icon: '🛒', name: 'בלי קנייה אימפולסיבית' },

  { key: 'stairs', cat: 'move', icon: '🪜', name: 'מדרגות במקום מעלית', effects: { END: 0.1 },
    note: '"חטיפי" עליית מדרגות 3 פעמים ביום שיפרו VO2peak בכ-5% ב-6 שבועות (Jenkins 2019).', src: 'jenkins2019' },
  { key: 'move_hour', cat: 'move', icon: '🧍', name: 'לקום ולזוז כל שעה' },
  { key: 'walk10', cat: 'move', icon: '🚶', name: '10 דק׳ הליכה אחרי ארוחה', effects: { MND: 0.15, END: 0.05 },
    note: 'הליכה קצרה = שליש מהליכה סטנדרטית של 30 דק׳.', src: 'white2019' },
];

export const HABIT_ICONS = ['✅', '⭐', '💧', '📖', '🧹', '💪', '🧠', '🎯', '🎸', '✍️', '🙏', '🐶', '🌱', '💊', '🧴', '🎨'];

export function automaticity(days) { return 1 - Math.exp(-days / HABIT_TAU); }

export function libraryItem(key) { return HABIT_LIBRARY.find(h => h.key === key); }

// =====================================================================
//  הישגים ותארים. כל הישג פותח תואר שאפשר להציג בסטטוס.
//  check(ctx) — ctx: { state, statGain, levelInfo, habitInfo, today, addDays }
// =====================================================================

const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
const cleared = s => Object.values(s.quests).filter(d => d.cleared).length;
const specials = s => Object.values(s.special?.offers || {}).filter(o => o && o.status === 'done');
const TRAINING = ['strength', 'run', 'cardio', 'intervals', 'sprints'];

export const ACHIEVEMENTS = [
  // ---- התחלה ----
  { id: 'first', icon: '👣', name: 'הצעד הראשון', desc: 'השלמת משימה ראשונה', xp: 20,
    check: c => c.state.log.length > 0 },
  { id: 'clear1', icon: '✨', name: 'יום מושלם', desc: 'השלמת את כל המשימות היומיות', xp: 30,
    check: c => cleared(c.state) >= 1 },
  { id: 'assess2', icon: '📏', name: 'מודד את עצמו', desc: 'הערכה שנייה של אותו מבחן — עכשיו רואים שינוי אמיתי', xp: 40,
    check: c => Object.keys(c.state.baselines).some(k => c.state.tests.filter(t => t.key === k).length >= 2) },

  // ---- רצף ----
  { id: 'streak3', icon: '🔥', name: 'מתחמם', desc: '3 ימים ברצף', xp: 30, check: c => c.state.streak.best >= 3 },
  { id: 'streak7', icon: '⛓️', name: 'שבוע של ברזל', desc: '7 ימים ברצף', xp: 70, check: c => c.state.streak.best >= 7 },
  { id: 'streak30', icon: '🛡️', name: 'בלתי שביר', desc: '30 ימים ברצף', xp: 250, check: c => c.state.streak.best >= 30 },
  { id: 'streak100', icon: '👑', name: 'אגדה', desc: '100 ימים ברצף', xp: 800, check: c => c.state.streak.best >= 100 },
  { id: 'comeback', icon: '🔄', name: 'הקאמבק', desc: 'יום מושלם מיד אחרי יום שפספסת', xp: 50,
    check: c => Object.entries(c.state.quests).some(([d, day]) => { const y = c.state.quests[c.addDays(d, -1)]; return day.cleared && y && !y.cleared && !y.rest; }) },

  // ---- שיפור אמיתי ----
  { id: 'gain10', icon: '📈', name: 'מתחזק', desc: 'שיפור של 10% בתכונה כלשהי', xp: 80,
    check: c => ['STR', 'END', 'SPD', 'FLX', 'MND'].some(k => c.statGain(k) >= 10) },
  { id: 'gain25', icon: '🚀', name: 'גרסה חדשה', desc: 'שיפור של 25% בתכונה כלשהי', xp: 200,
    check: c => ['STR', 'END', 'SPD', 'FLX', 'MND'].some(k => c.statGain(k) >= 25) },
  { id: 'balanced', icon: '⚖️', name: 'מאוזן', desc: 'כל 5 התכונות השתפרו ב-5% לפחות', xp: 150,
    check: c => ['STR', 'END', 'SPD', 'FLX', 'MND'].every(k => c.statGain(k) >= 5) },

  // ---- רמות ----
  { id: 'rankD', icon: '🅳', name: 'מתעורר', desc: 'הגעת לדרגה D (רמה 5)', xp: 0, check: c => c.levelInfo().level >= 5 },
  { id: 'rankC', icon: '🅲', name: 'מתאמן מתמיד', desc: 'הגעת לדרגה C (רמה 12)', xp: 0, check: c => c.levelInfo().level >= 12 },
  { id: 'rankB', icon: '🅱️', name: 'לוחם מנוסה', desc: 'הגעת לדרגה B (רמה 22)', xp: 0, check: c => c.levelInfo().level >= 22 },
  { id: 'rankA', icon: '🅰️', name: 'עלית מעל כולם', desc: 'הגעת לדרגה A (רמה 35)', xp: 0, check: c => c.levelInfo().level >= 35 },
  { id: 'rankS', icon: '🌟', name: 'בלתי ניתן לעצירה', desc: 'הגעת לדרגה S (רמה 50)', xp: 0, check: c => c.levelInfo().level >= 50 },

  // ---- הרגלים ----
  { id: 'habit1', icon: '🌱', name: 'שורש ראשון', desc: 'הרגל אחד הגיע ל-95% אוטומטיות', xp: 100,
    check: c => (c.state.habits || []).some(h => c.habitInfo(h).auto >= 0.95) },
  { id: 'habit3', icon: '🌳', name: 'יער של הרגלים', desc: '3 הרגלים מושרשים', xp: 250,
    check: c => (c.state.habits || []).filter(h => c.habitInfo(h).auto >= 0.95).length >= 3 },
  { id: 'planner', icon: '📍', name: 'יש לי תוכנית', desc: 'קבעת "מתי ואיפה" ל-3 הרגלים', xp: 30,
    check: c => (c.state.habits || []).filter(h => h.active && h.plan?.when).length >= 3 },

  // ---- משימות מיוחדות ----
  { id: 'special1', icon: '★', name: 'נענה לקריאה', desc: 'השלמת משימה מיוחדת', xp: 30, check: c => specials(c.state).length >= 1 },
  { id: 'emergency', icon: '🚨', name: 'תחת לחץ', desc: 'השלמת משימת חירום בזמן', xp: 60, check: c => specials(c.state).some(o => o.urgent) },
  { id: 'epic', icon: '💎', name: 'אפי', desc: 'השלמת משימה אפית', xp: 80, check: c => specials(c.state).some(o => o.rarity === 'epic') },
  { id: 'special10', icon: '🎖️', name: 'צייד משימות', desc: '10 משימות מיוחדות', xp: 200, check: c => specials(c.state).length >= 10 },

  // ---- התנהגות חכמה ----
  { id: 'minimal', icon: '🪶', name: 'גם ביום קשה', desc: 'השתמשת בגרסה מינימלית במקום לוותר', xp: 25,
    check: c => Object.values(c.state.quests).some(d => d.items.some(q => q.minimal && q.done)) },
  { id: 'listen', icon: '👂', name: 'מקשיב לגוף', desc: 'דיווחת על כאב או לקחת יום מנוחה', xp: 25,
    check: c => !!c.state.pain || Object.values(c.state.quests).some(d => d.rest) },

  // ---- מצטבר ----
  { id: 'early', icon: '🌄', name: 'ציפור מוקדמת', desc: 'אימון לפני 07:00', xp: 40,
    check: c => c.state.log.some(e => TRAINING.includes(e.type) && e.source === 'manual' && new Date(e.at).getHours() < 7) },
  { id: 'marathon', icon: '🏅', name: 'מרתון מצטבר', desc: '42.2 ק״מ של ריצה בסך הכול', xp: 150,
    check: c => sum(c.state.log.filter(e => e.type === 'run'), e => Number(e.params.distance)) >= 42.2 },
  { id: 'zen', icon: '🧘', name: 'שקט פנימי', desc: '300 דקות מדיטציה בסך הכול', xp: 150,
    check: c => sum(c.state.log.filter(e => e.type === 'meditation'), e => Number(e.params.duration)) >= 300 },
  { id: 'iron', icon: '🏋️', name: 'ברזל', desc: '50 אימוני כוח', xp: 200,
    check: c => c.state.log.filter(e => e.type === 'strength').length >= 50 },
];

export function achievement(id) { return ACHIEVEMENTS.find(a => a.id === id); }

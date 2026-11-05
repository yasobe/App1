import {
  STATS, STAT_KEYS, ACTIVITIES, TESTS, TRAINING_STATUS, SOURCES, WHO5_QUESTIONS, WHO5_ANSWERS,
  computeDose, fmt, clamp,
} from './research.js';
import * as E from './engine.js';
import { parseSyncText, parseHashSync, importHealthExport } from './health.js';
import { HABIT_LIBRARY, HABIT_CATEGORIES, HABIT_ICONS, HABIT_MEDIAN_DAYS } from './habits.js';
import { RARITY } from './specials.js';
import { ACHIEVEMENTS, achievement } from './achievements.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// מספר מקלט משתמש: מקבל גם פסיק עשרוני (מקלדת iOS בעברית) וגם מינוס
const num = x => { if (x == null) return NaN; const t = String(x).trim().replace(/[−–]/g, '-').replace(',', '.'); return t === '' ? NaN : Number(t); };
// תצוגת תוצאת מבחן בשפה רגילה
const tv = (key, v) => {
  if (key === 'who5') return `${v}/100`;
  if (key !== 'sitreach') return `${v} ${TESTS[key].unit}`;
  if (v === 0) return 'נוגע באצבעות';
  return v < 0 ? `${Math.abs(v)} ס״מ לפני האצבעות` : `${v} ס״מ אחרי האצבעות`;
};
const sgn = (v, d = 2) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d);
const app = $('#app');
let tab = 'status';

// =====================================================================
//  אתחול
// =====================================================================
function boot() {
  E.load();
  if (!E.state) { renderOnboarding(); return; }
  setInterval(updateSpecialCountdown, 1000);
  setInterval(() => {
    if (!E.state) return;
    if (!E.clockCheck().ok) return render();
    if (E.state.lastDecay !== E.today()) { dailyTick(); render(); }
    checkSpecial();
  }, 30000);
  const ck = E.clockCheck();
  if (!ck.ok) return renderClockLock(ck.until);
  dailyTick();
  // סנכרון דרך כתובת (#sync?steps=...)
  const hs = parseHashSync(location.hash);
  if (hs) { history.replaceState(null, '', location.pathname); applySync(hs); }
  showTabs();
  render();
  checkSpecial();
}

function dailyTick() {
  E.runDecay();
  const pen = E.penaltyCheck();
  E.questsFor(E.today());
  if (pen) setTimeout(() => showPenalty(pen), 400);
}

// =====================================================================
//  ניווט
// =====================================================================
const TABS = [
  ['status', '📊', 'סטטוס'],
  ['quests', '⚔️', 'משימות'],
  ['measure', '📏', 'מדידה'],
  ['log', '📜', 'יומן'],
  ['system', '⚙️', 'מערכת'],
];
function showTabs() {
  let nav = $('nav.tabs');
  if (!nav) { nav = document.createElement('nav'); nav.className = 'tabs'; document.body.appendChild(nav); }
  const day = E.questsFor(E.today());
  const pending = day.items.some(q => q.main && !q.done);
  nav.innerHTML = `<div class="inner">${TABS.map(([k, i, l]) =>
    `<button data-tab="${k}" class="${tab === k ? 'on' : ''}"><span class="i">${i}</span>${l}${k === 'quests' && pending ? '<span class="dot"></span>' : ''}</button>`).join('')}</div>`;
  nav.onclick = e => { const b = e.target.closest('button[data-tab]'); if (b) { tab = b.dataset.tab; render(); window.scrollTo(0, 0); } };
}
function render() {
  const ck = E.clockCheck();
  if (!ck.ok) return renderClockLock(ck.until);
  showTabs();
  ({ status: renderStatus, quests: renderQuests, measure: renderMeasure, log: renderLog, system: renderSystem })[tab]();
  const fresh = E.checkAchievements();
  if (fresh.length) showAchievements(fresh);
}

function renderClockLock(until) {
  $('nav.tabs')?.remove();
  closeModal();
  const d = new Date(until);
  app.innerHTML = `<div style="height:12vh"></div>${win('WARNING', `
    <p class="center">השעון של המכשיר הוזז אחורה.</p>
    <p class="center small muted">כדי שאי אפשר יהיה לקבל ימים ומשימות נוספים מהזזת השעון, המערכת נעולה עד שהזמן האמיתי ישיג את הזמן האחרון שנרשם:</p>
    <p class="center"><b class="en">${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</b></p>
    <p class="center small muted">אם השעון שלך פשוט היה שגוי — כוונו אותו לזמן הנכון (הגדרות ← כללי ← תאריך ושעה ← "הגדר אוטומטית") ופתחו שוב.</p>
    <button class="btn block" id="retry">בדיקה שוב</button>`, { icon: '!' })}`;
  $('#retry').onclick = () => { if (E.clockCheck().ok) { dailyTick(); showTabs(); render(); } else render(); };
}

function showAchievements(list) {
  if (document.querySelector('.modal-back')) return setTimeout(() => showAchievements(list), 700);
  E.takeMessages();
  modal(`
    <div class="win-title"><span class="badge-i" style="border-color:var(--warn);color:var(--warn)">🏆</span><span class="en" style="color:var(--warn)">ACHIEVEMENT${list.length > 1 ? 'S' : ''} UNLOCKED</span></div>
    ${list.map(a => `<div class="ach got"><span class="ai">${a.icon}</span><span class="grow"><b>${a.name}</b><div class="small muted">${a.desc}</div></span>${a.xp ? `<span class="small" style="color:var(--warn)">+${a.xp}</span>` : ''}</div>`).join('')}
    <p class="small muted center">כל הישג פותח תואר. אפשר לבחור תואר במסך הסטטוס.</p>
    <button class="btn block" id="ok">המשך</button>
  `, m => m.querySelector('#ok').onclick = () => { closeModal(); render(); });
}

function achievementsModal() {
  const got = E.state.achievements || {};
  modal(`
    <div class="win-title"><span class="badge-i">🏆</span><span>הישגים ותארים · ${Object.keys(got).length}/${ACHIEVEMENTS.length}</span></div>
    <p class="small muted">לחצו על הישג שנפתח כדי להציג אותו כתואר.</p>
    ${ACHIEVEMENTS.map(a => `<button class="ach ${got[a.id] ? 'got' : 'locked'} ${E.state.title === a.id ? 'sel' : ''}" data-a="${a.id}" ${got[a.id] ? '' : 'disabled'}>
      <span class="ai">${got[a.id] ? a.icon : '🔒'}</span><span class="grow"><b>${a.name}</b><div class="small muted">${a.desc}</div></span>
      <span class="small muted">${got[a.id] ? (E.state.title === a.id ? '✓ תואר' : got[a.id]) : (a.xp ? `+${a.xp}` : '')}</span></button>`).join('')}
  `, m => m.querySelectorAll('.ach.got').forEach(b => b.onclick = () => { E.setTitle(b.dataset.a); closeModal(); render(); toast('התואר עודכן'); }));
}

function win(titleEn, body, { icon = '!', titleHe = '' } = {}) {
  return `<section class="win"><div class="win-title"><span class="badge-i">${icon}</span><span class="en">${titleEn}</span>${titleHe ? `<span class="small muted">${titleHe}</span>` : ''}</div>${body}</section>`;
}

function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

function modal(html, mount) {
  closeModal();
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<section class="win modal"><button class="x" aria-label="סגירה">✕</button>${html}</section>`;
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('.x')) closeModal(); });
  document.body.appendChild(back);
  document.body.style.overflow = 'hidden';
  mount?.(back.querySelector('.modal'));
  return back;
}
function closeModal() {
  stopTimer();
  document.querySelectorAll('.modal-back').forEach(m => m.remove());
  document.body.style.overflow = '';
}

// =====================================================================
//  היכרות
// =====================================================================
function renderOnboarding() {
  $('nav.tabs')?.remove();
  const lines = ['ניתנה לך הזדמנות להתחזק.', 'המערכת תמדוד אותך, תיתן לך משימות יומיות,', 'ותחשב כל שיפור לפי מחקרים אמיתיים.', 'האם את/ה מוכן/ה?'];
  app.innerHTML = `
  <div style="height:8vh"></div>
  ${win('NOTIFICATION', `
    ${lines.map((l, i) => `<p class="intro-line center" style="animation-delay:${i * 0.5}s">${l}</p>`).join('')}
    <div class="sep"></div>
    <form id="ob">
      <label class="f">שם השחקן</label>
      <input type="text" name="name" required maxlength="24" placeholder="השם שלך">
      <div class="row">
        <div class="grow"><label class="f">גיל</label><input type="number" name="age" inputmode="numeric" min="12" max="99" value="25"></div>
        <div class="grow"><label class="f">משקל (ק״ג)</label><input type="text" name="weight" inputmode="decimal" min="30" max="250" step="0.1" value="75"></div>
      </div>
      <label class="f">רמת כושר נוכחית</label>
      <select name="trainingStatus">${Object.entries(TRAINING_STATUS).map(([k, v]) => `<option value="${k}">${v.he}</option>`).join('')}</select>
      <label class="f">ציוד</label>
      <select name="equipment"><option value="none">בלי ציוד (משקל גוף)</option><option value="gym">יש חדר כושר</option></select>
      <label class="f">כמה ימי אימון בשבוע</label>
      <select name="daysPerWeek"><option>3</option><option selected>4</option><option>5</option><option>6</option></select>
      <p class="small muted">היום הראשון יהיה יום מבחני הערכה — כדי שכל השיפורים יימדדו מנקודת הפתיחה האמיתית שלך.</p>
      <button class="btn block" type="submit">קבלה ✔</button>
    </form>`, { icon: '!' })}`;
  $('#ob').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    E.createPlayer({
      name: f.get('name').trim() || 'שחקן', age: +f.get('age') || 25, weightKg: num(f.get('weight')) || 75,
      trainingStatus: f.get('trainingStatus'), equipment: f.get('equipment'), daysPerWeek: +f.get('daysPerWeek'),
    });
    E.questsFor(E.today());
    tab = 'quests';
    render();
    toast('השחקן נרשם. המשימה הראשונה: מבחני הערכה.');
  };
}

// =====================================================================
//  סטטוס
// =====================================================================
function sparkline(k, days = 30, w = 120, h = 22) {
  const t = E.today();
  const pts = [];
  for (let i = days - 1; i >= 0; i--) { const d = E.addDays(t, -i); const v = E.state.history[d]?.[k]; if (v != null) pts.push([days - 1 - i, v]); }
  if (pts.length < 2) return '';
  const vs = pts.map(p => p[1]); const mn = Math.min(...vs, 0), mx = Math.max(...vs, 0.5);
  const path = pts.map(([x, v], i) => `${i ? 'L' : 'M'}${(x / (days - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / (mx - mn || 1) * (h - 4)).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="${STATS[k].color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

function renderStatus() {
  const S = E.state, P = S.profile;
  const li = E.levelInfo(), rk = E.rankFor(li.level);
  const vit = E.vitality();
  const h = S.health[E.today()] || {};
  const moods = [];
  for (let i = 0; i < 7; i++) { const c = S.checkins[E.addDays(E.today(), -i)]; if (c) moods.push(c.mood); }
  const moodAvg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length).toFixed(1) : '—';
  const calibrated = k => Object.entries(TESTS).some(([tk, T]) => T.stat === k && E.lastTest(tk) && S.baselines[tk] && E.lastTest(tk).date !== S.baselines[tk].date);

  app.innerHTML = `
  ${win('STATUS', `
    <div class="hero">
      <div class="lvl"><div class="num">${li.level}</div><div class="lab en">LEVEL</div></div>
      <div class="kv">
        <b>שם</b><span>${esc(P.name)}${S.title && achievement(S.title) ? `<div class="title-chip">${achievement(S.title).icon} ${achievement(S.title).name}</div>` : ''}</span>
        <b>דרגה</b><span><span class="rank">${rk.r}</span> <span class="small">${rk.title}</span></span>
        <b>רצף</b><span>🔥 ${S.streak.count} ימים <span class="small muted">(שיא ${S.streak.best})</span></span>
        <b>מיוחדות</b><span>★ ${E.specialStats().done} הושלמו</span>
        <b>הישגים</b><span><button class="link" id="achBtn" style="padding:0">🏆 ${Object.keys(S.achievements || {}).length}/${ACHIEVEMENTS.length}</button></span>
      </div>
    </div>
    ${S.flags?.tampered ? `<p class="small bad center" style="margin:10px 0 0">⚠ הנתונים נערכו מחוץ לאפליקציה (${S.flags.tampered})</p>` : S.flags?.unverified ? `<p class="small muted center" style="margin:10px 0 0">שוחזר מגיבוי ישן לא מאומת (${S.flags.unverified})</p>` : ''}
    <div class="row between small muted" style="margin-top:10px"><span class="en">EXP</span><span class="en">${li.into} / ${li.need}</span></div>
    <div class="bar"><i style="width:${(li.into / li.need * 100).toFixed(1)}%"></i></div>
    <div class="sep"></div>
    <div class="stats">
      ${STAT_KEYS.map(k => {
        const g = E.statGain(k);
        return `<button class="stat" data-stat="${k}">
          <span class="ic">${STATS[k].icon}</span>
          <span class="grow"><span class="nm">${STATS[k].he}<span class="en">${k}</span>${calibrated(k) ? '<span class="tag">✓ מכויל</span>' : ''}</span>${sparkline(k)}</span>
          <span class="val"><div class="v" style="color:${STATS[k].color}">${E.statValue(k).toFixed(1)}</div><div class="g ${g >= 0 ? 'good' : 'bad'}">${sgn(g, 1)}%</div></span>
        </button>`;
      }).join('')}
    </div>
    <p class="small muted center" style="margin:10px 0 0">100 = נקודת הפתיחה שלך · לחצו על תכונה להסבר המחקרי</p>
  `, { icon: '◆' })}

  ${habitsPanel()}
  ${win('VITALS', `
    <div class="tiles">
      <div class="tile"><div class="t">חיוניות (7 ימים)</div><div class="n">${vit.score ?? '—'}</div></div>
      <div class="tile"><div class="t">מצב רוח ממוצע</div><div class="n">${moodAvg}</div></div>
      <div class="tile"><div class="t">צעדים היום</div><div class="n">${h.steps != null ? Number(h.steps).toLocaleString('he-IL') : '—'}</div></div>
      <div class="tile"><div class="t">שינה</div><div class="n">${h.sleepH != null ? fmt(h.sleepH, 1) : '—'}</div></div>
      <div class="tile"><div class="t">דופק מנוחה</div><div class="n">${h.rhr ?? lastHealth('rhr') ?? '—'}</div></div>
      <div class="tile"><div class="t">VO2max</div><div class="n">${h.vo2 ?? lastHealth('vo2') ?? '—'}</div></div>
    </div>
    <p class="small muted" style="margin:8px 0 0">חיוניות = צעדים (יעד ${E.stepsTarget().toLocaleString('he-IL')}, Paluch 2022) + שינה 7–9 ש׳ (Watson 2015) + אנרגיה מהדיווח היומי.</p>
    <button class="btn ghost block" style="margin-top:10px" id="syncBtn">⟳ סנכרון מ-Apple Health</button>
  `, { icon: '♥' })}
  `;
  app.querySelectorAll('[data-stat]').forEach(b => b.onclick = () => statDetail(b.dataset.stat));
  $('#achBtn').onclick = achievementsModal;
  $('#syncBtn').onclick = syncFromClipboard;
}

function habitsPanel() {
  const hs = E.activeHabits();
  if (!hs.length) return '';
  return win('HABITS', `
    ${hs.map(h => { const { days, auto } = E.habitInfo(h); return `
      <div style="margin:8px 0"><div class="row between small"><span>${h.icon} ${esc(h.name)}</span><span class="muted">${auto >= 0.95 ? '🌳 מושרש' : `${days} ימים · ${Math.round(auto * 100)}%`}</span></div>
      <div class="bar" style="height:6px"><i style="width:${(auto * 100).toFixed(1)}%;background:var(--good);box-shadow:0 0 8px var(--good)"></i></div></div>`; }).join('')}
    <p class="small muted" style="margin:8px 0 0">אוטומטיות = כמה ההרגל קרוב לקרות בלי מחשבה. בממוצע ~${HABIT_MEDIAN_DAYS} ימים של ביצוע (Lally 2010).</p>
  `, { icon: '✅' });
}

function lastHealth(k) {
  const days = Object.keys(E.state.health).sort().reverse();
  for (const d of days) if (E.state.health[d][k] != null) return E.state.health[d][k];
  return null;
}

function statDetail(k) {
  const S = STATS[k], st = E.state.stats[k];
  const g = E.statGain(k);
  const progress = clamp(st.abs / st.gmax * 100, 0, 100);
  const perStd = Math.max(0, st.gmax - st.abs) * (1 - Math.exp(-1 / S.tau)) / (1 + st.base / 100);
  const since = E.daysBetween(st.lastStim, E.today());
  const tests = Object.entries(TESTS).filter(([, T]) => T.stat === k);
  modal(`
    <div class="win-title"><span class="badge-i">${S.icon}</span><span class="en">${k}</span><span>${S.he}</span></div>
    <div class="tiles">
      <div class="tile"><div class="t">ערך</div><div class="n" style="color:${S.color}">${E.statValue(k).toFixed(1)}</div></div>
      <div class="tile"><div class="t">שיפור מההתחלה</div><div class="n ${g >= 0 ? 'good' : 'bad'}">${sgn(g, 1)}%</div></div>
      <div class="tile"><div class="t">אימון סטנדרטי עכשיו</div><div class="n good">+${perStd.toFixed(2)}%</div></div>
    </div>
    <label class="f">התקדמות לעבר התקרה הריאלית (${fmt(st.gmax, 0)}% מעל לא-מאומן)</label>
    <div class="bar"><i style="width:${progress}%;background:${S.color}"></i></div>
    <p class="small muted">ככל שמתקרבים לתקרה, כל אימון מוסיף פחות — כמו במציאות.</p>
    <div class="sep"></div>
    <p><b>בסיס מחקרי:</b> ${S.basis}</p>
    <p class="small"><b>אימון סטנדרטי:</b> ${S.std}.<br><b>דעיכה:</b> ${S.decayNote} ${since > S.graceDays ? `<span class="bad">— כרגע בדעיכה (${since} ימים ללא גירוי)</span>` : `<span class="muted">(${since} ימים מהגירוי האחרון)</span>`}</p>
    <details><summary>מקורות</summary>${S.sources.concat('mujika2000').map(s => `<div class="src">${esc(SOURCES[s])}</div>`).join('')}</details>
    <div class="sep"></div>
    <b>מדידות</b>
    ${tests.map(([tk, T]) => {
      const bl = E.state.baselines[tk], lt = E.lastTest(tk);
      return `<div class="row between small" style="margin:6px 0"><span>${T.he}</span><span class="muted">${bl ? `התחלה: ${tv(tk, bl.value)} → אחרון: ${tv(tk, lt.value)}` : 'טרם נמדד'}</span></div>`;
    }).join('')}
    <button class="btn block" id="goMeasure">למבחנים</button>
  `, m => { m.querySelector('#goMeasure').onclick = () => { closeModal(); tab = 'measure'; render(); }; });
}

// =====================================================================
//  משימות
// =====================================================================
function timeLeft() {
  const n = new Date(), e = new Date(n); e.setHours(24, 0, 0, 0);
  const m = Math.floor((e - n) / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function questRow(q) {
  let plan = q.plan || '';
  if (q.habitId) {
    const h = (E.state.habits || []).find(x => x.id === q.habitId);
    if (h) {
      const { days, auto } = E.habitInfo(h);
      q = { ...q, desc: auto >= 0.95 ? `🌳 הרגל מושרש (${days} ימים)` : `${days} ימים · אוטומטיות ${Math.round(auto * 100)}%` };
      if (h.plan) plan = [h.plan.when, h.plan.where].filter(Boolean).join(' · ');
    }
  }
  if (q.minimal) q = { ...q, desc: '🪶 גרסה מינימלית — הרצף נשמר' };
  return `
      <button class="quest ${q.done ? 'done' : ''} ${q.small ? 'small-q' : ''}" data-q="${q.id}">
        <span><div class="qt">${esc(q.title)}${q.lvl ? `<span class="tag">${q.lvl}</span>` : ''}${q.main ? '' : '<span class="opt">בונוס</span>'}</div><div class="qd">${esc(q.desc)}</div>${plan ? `<div class="qplan">📍 ${esc(plan)}</div>` : ''}</span>
        <span class="check">${q.done ? '✓' : ''}</span>
      </button>`;
}

function renderQuests() {
  const t = E.today();
  const day = E.questsFor(t);
  const mains = day.items.filter(q => q.main);
  const doneN = mains.filter(q => q.done).length;
  const training = day.items.filter(q => q.kind !== 'habit');
  const habits = day.items.filter(q => q.kind === 'habit');
  const restLabel = { rest: '🛌 יום מנוחה', sick: '🤒 יום מחלה' }[day.rest];
  app.innerHTML = `
  ${specialWin()}
  ${assessmentWin(false)}
  ${E.state.habits ? '' : win('NEW', `<p class="center" style="margin-top:0"><b>הדברים הקטנים</b> — מים, קריאה, סידור, שיחה עם חבר…</p><p class="small muted center">בחר/י 2–3 הרגלים יומיים. המערכת תעקוב כמה זמן לוקח להם להפוך לאוטומטיים (בממוצע 66 ימים, Lally 2010).</p><button class="btn block" id="habNew">בחירת הרגלים</button>`, { icon: '✦' })}
  ${win('DAILY QUEST', `
    <p class="small muted" style="margin-top:0">התוכנית שמשנה אותך: כל משימה שמושלמת מעלה את הרמה שלה, והיעד הבא קצת יותר קשה.</p>
    ${(day.notes || []).map(n => `<p class="small warn" style="margin:6px 0">ⓘ ${esc(n)}</p>`).join('')}
    ${restLabel ? `<p class="center cleared" style="margin:8px 0">${restLabel} — הרצף מוגן <button class="btn ghost" id="unrest" style="min-height:32px;padding:4px 10px;margin-inline-start:8px">ביטול</button></p>` : ''}
    <div class="row between small"><span class="muted">${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span class="timer">⏳ ${timeLeft()}</span></div>
    <div class="row between small" style="margin:8px 0 4px"><span>התקדמות</span><span class="en">${doneN}/${mains.length}</span></div>
    <div class="bar"><i style="width:${mains.length ? doneN / mains.length * 100 : 0}%"></i></div>
    <div style="margin-top:6px">${training.filter(q => q.main).map(questRow).join('')}</div>
    ${habits.length ? `<div class="sub-h">הרגלים יומיים <button class="link" id="habEdit">עריכה</button></div><div>${habits.map(questRow).join('')}</div>` : ''}
    <div>${training.filter(q => !q.main).map(questRow).join('')}</div>
    ${day.cleared ? `<div class="sep"></div><p class="center cleared">משימה יומית הושלמה ✦ +50 EXP</p>` : day.rest ? '' : `<p class="small warn center" style="margin:10px 0 0">אזהרה: אי-השלמת המשימות היומיות יאפס את הרצף.</p>`}
  `, { icon: '!' })}
  <div class="btn-row">
    <button class="btn" id="freeAct">＋ פעילות חופשית</button>
    <button class="btn ghost" id="habBtn">✅ הרגלים</button>
  </div>
  ${day.rest || day.cleared ? '' : `<button class="btn ghost block" id="restBtn" style="margin-top:8px">🛌 יום מנוחה / מחלה</button>`}
  `;
  app.querySelectorAll('[data-q]').forEach(b => b.onclick = () => openQuest(t, b.dataset.q));
  bindAssessment();
  $('#spDo') && ($('#spDo').onclick = doSpecial);
  $('#freeAct').onclick = freeActivity;
  $('#habBtn').onclick = habitManager;
  $('#habNew') && ($('#habNew').onclick = habitManager);
  $('#habEdit') && ($('#habEdit').onclick = habitManager);
  $('#restBtn') && ($('#restBtn').onclick = () => restDialog(t));
  $('#unrest') && ($('#unrest').onclick = () => { E.unmarkRest(t); render(); });
}

// ---------- משימות מיוחדות ----------
const spShown = new Set();
function checkSpecial() {
  if (!E.state) return;
  const evs = E.specialTick();
  for (const ev of evs) {
    if (ev.kind === 'expired') toast(ev.offer.status === 'failed' ? `⌛ המשימה המיוחדת "${ev.offer.title}" פגה` : `⌛ פספסת משימה מיוחדת: ${ev.offer.title}`);
    if (ev.kind === 'offer' && !spShown.has(ev.offer.id)) { spShown.add(ev.offer.id); showSpecialOffer(ev.offer); }
  }
  if (evs.length && tab === 'quests' && !document.querySelector('.modal-back')) render();
}
function deadlineText(o) {
  const d = new Date(o.deadline);
  return o.urgent ? `שעתיים — עד ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'עד סוף היום';
}
function showSpecialOffer(o) {
  if (document.querySelector('.modal-back')) return setTimeout(() => showSpecialOffer(o), 800);
  if (o.status !== 'offered') return;
  const R = RARITY[o.rarity];
  modal(`
    <div class="sp-alert" style="--rc:${R.color}">
      <div class="win-title"><span class="badge-i" style="border-color:${R.color};color:${R.color}">!</span><span class="en" style="color:${R.color}">${o.urgent ? 'EMERGENCY QUEST' : 'SPECIAL QUEST'}</span></div>
      <p class="center small"><span class="rar" style="border-color:${R.color};color:${R.color}">${R.he}</span>${o.urgent ? ' <span class="rar" style="border-color:var(--bad);color:var(--bad)">חירום ×1.5</span>' : ''}</p>
      <div class="sp-icon">${o.icon}</div>
      <h2 class="center" style="margin:4px 0">${esc(o.title)}</h2>
      <p class="center small muted">${esc(o.desc)}</p>
      <div class="tiles" style="grid-template-columns:1fr 1fr;margin:12px 0">
        <div class="tile"><div class="t">מגבלת זמן</div><div class="n" style="font-size:15px">${deadlineText(o)}</div></div>
        <div class="tile"><div class="t">פרס</div><div class="n" style="color:var(--warn)">+${o.xp} EXP</div></div>
      </div>
      ${o.note ? `<p class="small muted">${esc(o.note)}</p>` : ''}
      <button class="btn block" id="spYes" style="border-color:${R.color}">קבלה ✔</button>
      <div style="height:8px"></div>
      <button class="btn ghost block" id="spNo">דחייה</button>
      <p class="small muted center">דחייה בלי עונש. המשימה הבאה תופיע בעוד כמה ימים, בשעה אקראית.</p>
    </div>
  `, m => {
    m.querySelector('#spYes').onclick = () => { E.answerSpecial(o.id, true); closeModal(); tab = 'quests'; render(); toast('המשימה התקבלה ★'); };
    m.querySelector('#spNo').onclick = () => { E.answerSpecial(o.id, false); closeModal(); render(); };
  });
}
function specialWin() {
  const o = E.activeSpecial();
  if (!o) return '';
  const R = RARITY[o.rarity];
  return `<section class="win sp-win" style="--rc:${R.color}"><div class="win-title"><span class="badge-i" style="border-color:${R.color};color:${R.color}">★</span><span class="en" style="color:${R.color}">${o.urgent ? 'EMERGENCY QUEST' : 'SPECIAL QUEST'}</span></div>
    <div class="row"><span style="font-size:30px">${o.icon}</span><span class="grow"><b>${esc(o.title)}</b><div class="small muted">${esc(o.desc)}</div></span></div>
    <div class="row between small" style="margin-top:8px"><span class="timer">⏳ <span id="spLeft" data-dl="${o.deadline}">${mmssLong(o.deadline - Date.now())}</span></span><span style="color:var(--warn)">+${o.xp} EXP · ${R.he}</span></div>
    <button class="btn block" id="spDo" style="margin-top:10px;border-color:${R.color}">השלמה ✔</button></section>`;
}
function mmssLong(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
function updateSpecialCountdown() {
  const el = document.getElementById('spLeft');
  if (!el) return;
  const left = Number(el.dataset.dl) - Date.now();
  el.textContent = mmssLong(left);
  if (left <= 0) checkSpecial();
}
function doSpecial() {
  const o = E.activeSpecial();
  if (!o) return;
  if (o.type === 'act') {
    const t = o.target || {};
    const timer = t.duration && o.act !== 'strength' ? { countdown: t.duration } : o.act === 'strength' ? { rest: 60 } : null;
    return activityForm(o.act, { quest: { id: o.id, kind: o.act, title: `★ ${o.title}`, desc: o.desc, target: t, timer, special: o, main: false } });
  }
  modal(`
    <div class="win-title"><span class="badge-i">★</span><span>${esc(o.title)}</span></div>
    <p class="center" style="font-size:40px;margin:6px 0">${o.icon}</p>
    <p class="center">ביצעת?</p>
    <button class="btn block" id="yes">כן, בוצע ✔</button>
  `, m => m.querySelector('#yes').onclick = () => {
    const r = E.completeSpecial(o);
    closeModal(); render();
    if (r) showResult(r.entry, r);
  });
}

function restDialog(date) {
  const used = E.restUsedThisWeek(date);
  modal(`
    <div class="win-title"><span class="badge-i">🛌</span><span>יום מנוחה / מחלה</span></div>
    <p class="small">מנוחה היא חלק מהאימון. יום כזה <b>שומר על הרצף</b> — בלי בונוס EXP.</p>
    <button class="btn block" id="rest" ${used && used !== date ? 'disabled style="opacity:.5"' : ''}>🛌 יום מנוחה ${used && used !== date ? '(כבר נוצל השבוע)' : '(אחד בשבוע)'}</button>
    <div style="height:8px"></div>
    <button class="btn ghost block" id="sick">🤒 אני חולה</button>
    <p class="small muted">בזמן מחלה עם חום או תסמינים מתחת לצוואר — לא מתאמנים. הליכה קלה ושינה הן המשימה.</p>
  `, m => {
    m.querySelector('#rest').onclick = () => { const r = E.markRest(date, 'rest'); closeModal(); render(); toast(r.ok ? 'יום מנוחה ✓ הרצף מוגן' : r.reason); };
    m.querySelector('#sick').onclick = () => { E.markRest(date, 'sick'); closeModal(); render(); toast('החלמה מהירה. הרצף מוגן 🤒'); };
  });
}

function openQuest(date, id) {
  const q = E.questsFor(date).items.find(x => x.id === id);
  if (!q) return;
  if (q.kind === 'habit') return toggleHabit(date, q);
  if (q.done) {
    const entry = q.logId && E.state.log.find(l => l.id === q.logId);
    if (entry) showResult(entry); else toast('המשימה כבר הושלמה ✓');
    return;
  }
  if (q.kind === 'checkin') return checkinForm(date, q);
  if (q.kind === 'who5') return who5Form(date, q);
  if (q.kind.startsWith('test:')) return testForm(q.kind.slice(5), date, q);
  if (q.kind === 'steps') return stepsForm(date, q);
  activityForm(q.kind, { date, quest: q });
}

// ---------- הרגלים ----------
function toggleHabit(date, q) {
  if (q.done) {
    if (q.logId) E.deleteEntry(q.logId); else { q.done = false; E.save(); }
    render(); toast('בוטל');
    return;
  }
  const r = E.completeHabit(date, q.id);
  render();
  if (!r) return;
  const msg = r.rooted ? `🌳 ההרגל הושרש! +150 EXP` : `✓ יום ${r.days} · אוטומטיות ${Math.round(r.auto * 100)}% · +${r.entry.xp} EXP${Object.keys(r.entry.gains).length ? ' · ' + Object.entries(r.entry.gains).map(([k, v]) => `${STATS[k].he} +${v.toFixed(2)}%`).join(', ') : ''}`;
  toast(r.cleared ? msg + ' · משימה יומית הושלמה! +50' : msg);
  flushLevelUp();
}

function habitManager() {
  E.state.habits ||= [];
  const on = new Set(E.activeHabits().map(h => h.key));
  const custom = E.activeHabits().filter(h => h.key === 'custom');
  modal(`
    <div class="win-title"><span class="badge-i">✅</span><span>הרגלים יומיים</span></div>
    <p class="small">הדברים הקטנים שבונים את היום. <b>עדיף להתחיל ב-2–3</b> ולהוסיף כשהם נהיים אוטומטיים. פספוס של יום אחד לא מוחק את ההתקדמות (Lally 2010).</p>
    <p class="small muted">✦ = יש לו השפעה מחושבת על תכונה, לפי מחקר. לשאר — EXP ומעקב אוטומטיות.</p>
    <p class="small" id="habCount"></p>
    ${E.activeHabits().length ? `<div class="sub-h">📍 מתי ואיפה — לכל הרגל</div>
    <p class="small muted" style="margin:0 0 4px">"אחרי הקפה בבוקר, במטבח". תוכנית כזו מגדילה מאוד את הסיכוי שזה יקרה (Gollwitzer & Sheeran 2006).</p>
    ${E.activeHabits().map(h => `<div class="plan-row"><span class="small">${h.icon} ${esc(h.name)}</span>
      <div class="row" style="gap:6px"><input type="text" class="grow" data-pw="${h.id}" maxlength="40" placeholder="מתי / אחרי מה" value="${esc(h.plan?.when || '')}"><input type="text" class="grow" data-pl="${h.id}" maxlength="30" placeholder="איפה" value="${esc(h.plan?.where || '')}"></div></div>`).join('')}` : ''}
    ${Object.entries(HABIT_CATEGORIES).map(([c, he]) => `
      <div class="sub-h">${he}</div>
      <div class="seg">${HABIT_LIBRARY.filter(h => h.cat === c).map(h => `<button type="button" data-h="${h.key}" class="${on.has(h.key) ? 'on' : ''}">${h.icon} ${h.name}${h.effects ? ' ✦' : ''}</button>`).join('')}</div>`).join('')}
    <div class="sub-h">משלך</div>
    ${custom.map(h => `<div class="row between small" style="margin:6px 0"><span>${h.icon} ${esc(h.name)}</span><button class="btn ghost" data-del="${h.id}" style="min-height:32px;padding:4px 10px">הסרה</button></div>`).join('')}
    <div class="row" style="gap:6px">
      <select id="cIcon" style="width:72px">${HABIT_ICONS.map(i => `<option>${i}</option>`).join('')}</select>
      <input type="text" id="cName" maxlength="40" placeholder="למשל: להשקות עציצים" class="grow">
    </div>
    <button class="btn ghost block" id="cAdd" style="margin-top:8px">＋ הוספת הרגל משלי</button>
    <button class="btn block" id="done" style="margin-top:12px">סיום</button>
  `, m => {
    const count = () => { const n = E.activeHabits().length; m.querySelector('#habCount').innerHTML = `נבחרו: <b>${n}</b>${n > 5 ? ' <span class="warn">— הרבה בבת אחת. כל הרגל שלא בוצע פוגע ברצף.</span>' : ''}`; };
    count();
    m.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      const now = !b.classList.contains('on');
      b.classList.toggle('on', now);
      E.setHabit(b.dataset.h, now);
      habitManager();
    });
    m.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { E.removeHabit(b.dataset.del); habitManager(); });
    m.querySelectorAll('[data-pw],[data-pl]').forEach(inp => inp.onchange = () => {
      const id = inp.dataset.pw || inp.dataset.pl;
      E.setHabitPlan(id, m.querySelector(`[data-pw="${id}"]`).value.trim(), m.querySelector(`[data-pl="${id}"]`).value.trim());
    });
    m.querySelector('#cAdd').onclick = () => {
      const name = m.querySelector('#cName').value.trim();
      if (!name) return toast('כתבו שם להרגל');
      E.addCustomHabit(name, m.querySelector('#cIcon').value);
      habitManager();
    };
    m.querySelector('#done').onclick = () => { closeModal(); render(); };
  });
}

// ---------- טיימר ----------
let audioCtx = null;
let activeTimer = null;
function beep(freq = 880, dur = 0.18, times = 1) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      const t0 = audioCtx.currentTime + i * (dur + 0.12);
      o.frequency.value = freq; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    }
  } catch (e) { /* אין שמע */ }
  try { navigator.vibrate?.(200); } catch (e) { /* */ }
}
const mmss = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

function stopTimer() {
  if (activeTimer) { clearInterval(activeTimer.h); activeTimer.lock?.release?.().catch(() => {}); activeTimer = null; }
}

function timerHTML(t) {
  if (!t) return '';
  const btns = [];
  if (t.countdown) btns.push(`<button type="button" class="btn" data-tm="main">▶ טיימר ${t.countdown} דק׳</button>`);
  if (t.intervals) btns.push(`<button type="button" class="btn" data-tm="main">▶ טיימר אינטרוולים</button>`);
  if (t.hold) btns.push(`<button type="button" class="btn ghost" data-tm="hold">פלאנק ${t.hold} שנ׳</button>`);
  if (t.rest) btns.push(`<button type="button" class="btn ghost" data-tm="rest">מנוחה ${t.rest} שנ׳</button>`);
  return `<div class="timer-box"><div class="tm-phase small muted" id="tmPhase">טיימר</div><div class="tm-big en" id="tmBig">—</div><div class="btn-row">${btns.join('')}</div><button type="button" class="btn ghost block hidden" id="tmStop" style="margin-top:6px">⏹ עצירה</button></div>`;
}

// מבוסס חותמות זמן — ממשיך נכון גם אחרי נעילת מסך
function bindTimer(m, t, form) {
  if (!t) return;
  const big = m.querySelector('#tmBig'), phase = m.querySelector('#tmPhase'), stop = m.querySelector('#tmStop');
  const run = (phases, onEnd) => {
    stopTimer();
    beep(660, 0.12);
    const start = Date.now();
    const total = phases.reduce((a, p) => a + p.s, 0);
    let lastIdx = -1;
    activeTimer = { start, h: null };
    navigator.wakeLock?.request('screen').then(l => { if (activeTimer) activeTimer.lock = l; }).catch(() => {});
    stop.classList.remove('hidden');
    const tick = () => {
      const el = (Date.now() - start) / 1000;
      if (el >= total) {
        big.textContent = '✓'; phase.textContent = 'הסתיים';
        beep(990, 0.25, 3); stopTimer(); stop.classList.add('hidden'); onEnd?.(el);
        return;
      }
      let acc = 0, idx = 0;
      while (acc + phases[idx].s <= el) { acc += phases[idx].s; idx++; }
      if (idx !== lastIdx) { if (lastIdx >= 0) beep(phases[idx].hi ? 990 : 520, 0.2, 2); lastIdx = idx; }
      big.textContent = mmss(phases[idx].s - (el - acc));
      phase.textContent = phases[idx].label;
    };
    tick();
    activeTimer.h = setInterval(tick, 250);
    stop.onclick = () => { const el = (Date.now() - start) / 1000; stopTimer(); stop.classList.add('hidden'); phase.textContent = 'נעצר'; onEnd?.(el, true); };
  };
  const fillDuration = (sec) => { const f = form.querySelector('[name=duration]'); if (f && sec >= 60) { f.value = Math.round(sec / 60); form.dispatchEvent(new Event('input')); } };
  m.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => {
    const k = b.dataset.tm;
    if (k === 'rest') return run([{ s: t.rest, label: 'מנוחה' }]);
    if (k === 'hold') return run([{ s: 5, label: 'היכונו…' }, { s: t.hold, label: 'החזיקו!', hi: true }]);
    if (t.countdown) return run([{ s: t.countdown * 60, label: 'עובדים' }], fillDuration);
    const I = t.intervals, ph = [{ s: I.warm, label: 'חימום' }];
    for (let i = 1; i <= I.n; i++) { ph.push({ s: I.work, label: `מהר! ${i}/${I.n}`, hi: true }); ph.push({ s: I.rest, label: `קל ${i}/${I.n}` }); }
    ph.push({ s: I.cool, label: 'שחרור' });
    run(ph, fillDuration);
  });
}

// ---------- טופס פעילות ----------
function activityForm(type, { date = E.today(), quest = null, prefill = null } = {}) {
  const A = ACTIVITIES[type];
  const v = { ...A.defaults, ...(quest?.target || {}), ...(prefill || {}) };
  const fields = {
    duration: `<label class="f">משך (דקות)</label><input type="number" name="duration" inputmode="numeric" min="1" max="600" value="${v.duration ?? ''}">`,
    distance: `<label class="f">מרחק (ק״מ) — רשות</label><input type="text" name="distance" inputmode="decimal" value="${v.distance ?? ''}">`,
    reps: `<label class="f">מספר ספרינטים</label><input type="number" name="reps" inputmode="numeric" min="1" max="40" value="${v.reps ?? ''}">`,
    hours: `<label class="f">שעות שינה</label><input type="text" name="hours" inputmode="decimal" value="${E.state.health[date]?.sleepH ?? v.hours ?? ''}">`,
    rpe: `<label class="f">מאמץ (RPE): <span class="range-val" id="rpeV">${v.rpe}</span>/10 — <span id="rpeL" class="small"></span></label><input type="range" name="rpe" min="1" max="10" step="0.5" value="${v.rpe}">`,
  };
  const journal = type === 'journal' ? `<label class="f">3 דברים טובים מהיום</label><textarea name="notes" placeholder="1.&#10;2.&#10;3.">${esc(v.notes || '')}</textarea>` : '';
  const canSwap = quest && !quest.special && E.SWAP_OPTIONS[quest.kind];
  const isTraining = quest && ['str', 'end', 'spd'].includes(quest.cat);
  modal(`
    <div class="win-title"><span class="badge-i">${A.icon}</span><span>${esc(quest?.title || A.he)}</span></div>
    ${quest ? `<p class="small muted">${esc(quest.desc)}</p>` : ''}
    ${quest?.swappedFrom ? `<p class="small muted">הוחלף מ: ${esc(quest.swappedFrom)}</p>` : ''}
    ${quest && !quest.special && quest.main ? `<div class="row" style="gap:6px;margin:6px 0"><span class="small">📍</span><input type="text" id="qPlan" class="grow" maxlength="60" placeholder="מתי ואיפה היום? למשל: 18:00, בפארק" value="${esc(quest.plan || '')}" style="min-height:38px;padding:6px 10px;font-size:15px"></div>` : ''}
    ${timerHTML(quest?.timer)}
    <form id="af">
      ${A.fields.map(f => fields[f]).join('')}
      ${journal}
      <div id="preview" class="calc"></div>
      <button class="btn block" style="margin-top:14px" type="submit">השלמה ✔</button>
    </form>
    ${quest && quest.main && !quest.special && E.MINIMAL[quest.kind] ? `<button class="btn ghost block" id="minimal" style="margin-top:8px">🪶 יום קשה? גרסה מינימלית</button>` : ''}
    ${canSwap || isTraining ? `<div class="btn-row" style="margin-top:8px">
      ${canSwap ? '<button class="btn ghost" id="swap">⇄ החלפת משימה</button>' : ''}
      ${isTraining ? '<button class="btn ghost" id="pain">🩹 כואב לי</button>' : ''}
    </div>` : ''}
  `, m => {
    const form = m.querySelector('#af');
    const rpeLabels = { 1: 'מנוחה', 3: 'קל מאוד', 4: 'קל', 5: 'נוח, אפשר לדבר', 6: 'בינוני', 7: 'מאתגר', 8: 'קשה', 9: 'קשה מאוד', 10: 'מקסימלי' };
    const read = () => Object.fromEntries([...new FormData(form)].map(([k, x]) => [k, k === 'notes' ? x : x === '' ? undefined : num(x)]));
    const upd = () => {
      const p = read();
      if (p.rpe != null) { m.querySelector('#rpeV').textContent = p.rpe; m.querySelector('#rpeL').textContent = rpeLabels[Math.floor(p.rpe)] || ''; }
      const { dose, parts } = computeDose(type, p);
      m.querySelector('#preview').innerHTML = `מנה: <b>${dose.toFixed(2)}</b> × אימון סטנדרטי <span class="muted">(${esc(parts)})</span>`;
    };
    form.oninput = upd; upd();
    bindTimer(m, quest?.timer, form);
    form.onsubmit = e => {
      e.preventDefault();
      const p = read();
      if (A.fields.includes('duration') && !(p.duration > 0)) return toast('הזינו משך');
      if (type === 'sleep' && !(p.hours >= 0)) return toast('הזינו שעות שינה');
      const verr = E.validateActivity(type, p);
      if (verr) return toast(verr);
      stopTimer();
      if (quest?.special) {
        const entry = E.applyActivity(type, p, { date, special: true });
        const r = E.completeSpecial(quest.special, entry);
        closeModal(); render();
        return showResult(entry, r);
      }
      const entry = E.applyActivity(type, p, { date, questId: quest?.id, questMain: quest?.main });
      let clear = null, matched = null;
      if (quest) clear = E.completeQuest(date, quest.id, entry);
      else { matched = E.completeMatching(date, type, entry); clear = matched; }
      if (type === 'sleep') E.adjustForReadiness(date);
      closeModal();
      render();
      showResult(entry, clear, matched?.quest);
    };
    m.querySelector('#swap') && (m.querySelector('#swap').onclick = () => swapDialog(date, quest));
    const qp = m.querySelector('#qPlan');
    if (qp) qp.onchange = () => { E.setQuestPlan(date, quest.id, qp.value.trim()); quest.plan = qp.value.trim(); render(); };
    m.querySelector('#minimal') && (m.querySelector('#minimal').onclick = () => minimalDialog(date, quest));
    m.querySelector('#pain') && (m.querySelector('#pain').onclick = () => painDialog(date, quest));
  });
}

function minimalDialog(date, quest) {
  const M = E.MINIMAL[quest.kind];
  modal(`
    <div class="win-title"><span class="badge-i">🪶</span><span>גרסה מינימלית</span></div>
    <p>ביום קשה, משהו קטן עדיף על כלום. היום עושים רק:</p>
    <p class="center" style="font-size:18px"><b>${esc(M.he)}</b></p>
    <ul class="small">
      <li>המשימה נספרת כבוצעה, <b>והרצף נשמר</b>.</li>
      <li>EXP חלקי, והרמה של המשימה לא עולה.</li>
      <li>השיפור בתכונות מחושב לפי מה שבאמת עשית (מנה קטנה).</li>
    </ul>
    <p class="small muted">הרעיון: לשמור על ההרגל של "להופיע" גם כשאין כוח. מחר חוזרים לגרסה המלאה.</p>
    <button class="btn block" id="go">בוצע ✔</button>
  `, m => m.querySelector('#go').onclick = () => {
    const r = E.completeMinimal(date, quest.id);
    closeModal(); render();
    if (r?.entry) showResult(r.entry, r); else toast(`🪶 נשמר${r?.cleared ? ' · משימה יומית הושלמה!' : ''}`);
    flushLevelUp();
  });
}

function swapDialog(date, quest) {
  const opts = E.SWAP_OPTIONS[quest.kind] || [];
  modal(`
    <div class="win-title"><span class="badge-i">⇄</span><span>החלפת משימה</span></div>
    <p class="small muted">אין זמן, מזג אוויר, אין ציוד? בחרו חלופה. היא נספרת באותה צורה.</p>
    <div class="seg" style="flex-direction:column">${opts.map(k => `<button data-k="${k}" style="text-align:start">${E.SWAP_LABELS[k]}</button>`).join('')}</div>
  `, m => m.querySelectorAll('[data-k]').forEach(b => b.onclick = () => {
    const nq = E.swapQuest(date, quest.id, b.dataset.k);
    closeModal(); render();
    if (nq) activityForm(nq.kind, { date, quest: nq });
  }));
}

function painDialog(date, quest) {
  const areas = ['ברך', 'גב תחתון', 'כתף', 'קרסול / כף רגל', 'ירך', 'מרפק / שורש כף יד', 'אחר'];
  modal(`
    <div class="win-title"><span class="badge-i">🩹</span><span>כואב לי</span></div>
    <p class="small">איפה? האימון של היום יוחלף בהתאוששות, ו-3 הימים הבאים יהיו בעומס מופחת. ההתקדמות שלך נשמרת.</p>
    <div class="seg">${areas.map(a => `<button data-a="${a}">${a}</button>`).join('')}</div>
    <p class="small warn" style="margin-top:12px">כאב חד, נפיחות, כאב בלילה או כאב שלא עובר אחרי כמה ימים — לפנות לרופא או לפיזיותרפיסט.</p>
  `, m => m.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    E.reportPain(date, quest.id, b.dataset.a);
    closeModal(); render(); toast('עודכן: התאוששות היום, עומס מופחת ל-3 ימים');
  }));
}

function freeActivity() {
  modal(`
    <div class="win-title"><span class="badge-i">＋</span><span>תיעוד פעילות</span></div>
    <p class="small muted">אם יש משימה פתוחה מאותו סוג היום — היא תסומן כהושלמה.</p>
    <div class="seg" style="flex-direction:column">
      ${Object.entries(ACTIVITIES).filter(([k]) => k !== 'habit').map(([k, a]) => `<button data-t="${k}" style="text-align:start">${a.icon} ${a.he}</button>`).join('')}
    </div>
  `, m => m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => activityForm(b.dataset.t)));
}

// ---------- חלון תוצאה ----------
function entryTitle(e) { const A = ACTIVITIES[e.type]; return e.label || `${A.icon} ${A.he}`; }

function showResult(entry, clear = null, matchedQuest = null) {
  const A = ACTIVITIES[entry.type];
  const msgs = E.takeMessages();
  const lvl = msgs.find(m => m.kind === 'levelup');
  const pace = entry.params.distance > 0 && entry.params.duration > 0 ? entry.params.duration / entry.params.distance : null;
  const typeName = entry.label || A.he;
  modal(`
    <div class="win-title"><span class="badge-i">!</span><span class="en">${entry.special ? 'SPECIAL QUEST CLEAR' : entry.questId ? 'QUEST COMPLETE' : 'ACTIVITY LOGGED'}</span></div>
    ${lvl ? `<div class="lvlup en">LEVEL UP!</div><p class="center">רמה <b>${lvl.level}</b> · דרגה <span class="rank">${lvl.rank}</span></p>` : ''}
    <div class="xp-pop en">+${entry.xp + (clear?.bonusXP || 0)} EXP</div>
    ${clear?.special ? `<p class="center cleared">★ משימה מיוחדת הושלמה! (+${clear.special} מתוכם)</p>` : ''}
    ${clear?.cleared ? '<p class="center cleared">כל המשימות היומיות הושלמו! +50 בונוס</p>' : ''}
    ${matchedQuest ? `<p class="center small good">✓ נספר כמשימה "${esc(matchedQuest.title)}"</p>` : ''}
    <p class="center">${esc(entryTitle(entry))} · <span class="muted small">${entry.source !== 'manual' ? esc(entry.source) + ' · ' : ''}${entry.date}</span></p>
    ${pace ? `<p class="center small">קצב: <b class="en">${Math.floor(pace)}:${String(Math.round(pace % 1 * 60)).padStart(2, '0')}</b> דק׳/ק״מ</p>` : ''}
    ${entry.type !== 'habit' ? `<p class="small muted">המנה שלך: <b>${entry.dose.toFixed(2)}</b> × אימון סטנדרטי (${esc(entry.doseParts)})</p>` : ''}
    ${entry.details.map(d => {
      const S = STATS[d.k];
      return `<div class="gain-row">
        <div class="head"><span>${S.icon} <b>${S.he}</b> <span class="en small muted">${d.k}</span></span><span class="d good">+${d.delta.toFixed(3)}%</span></div>
        <div class="calc">
          <ol>
            <li>${S.basis}</li>
            <li>במיקום שלך על העקומה (${(clamp(d.progress, 0, 1) * 100).toFixed(0)}% מהתקרה), אימון סטנדרטי (${S.std}) שווה עכשיו <b>+${d.perStd.toFixed(3)}%</b>.</li>
            <li>משקל ההשפעה של ${esc(typeName)} על ${S.he}: <b>×${d.weight}</b>${d.repeat ? ' · גירוי חוזר באותו יום: <b>×0.5</b>' : ''} → מנה אפקטיבית ${d.dose.toFixed(2)}.</li>
            <li>תוצאה: <b class="good">+${d.delta.toFixed(3)}%</b> → סה״כ ${E.statValue(d.k).toFixed(1)} (${sgn(E.statGain(d.k), 2)}% מההתחלה).</li>
          </ol>
        </div>
      </div>`;
    }).join('')}
    ${entry.type === 'habit' && !entry.details.length ? '<p class="small muted">להרגל הזה אין השפעה מחושבת על תכונה — הוא בונה משמעת, EXP ואוטומטיות.</p>' : ''}
    ${entry.note || A.note ? `<p class="small muted">${esc(entry.note || A.note)}</p>` : ''}
    ${entry.type !== 'habit' ? '<p class="small muted">⚠️ אלו הערכות לפי ממוצעים במחקרים; התגובה האישית משתנה מאוד בין אנשים. ההערכה השבועית מכיילת את המספרים לפי המציאות שלך.</p>' : ''}
    <button class="btn block" id="ok">המשך</button>
    <div class="btn-row" style="margin-top:8px">
      ${entry.type !== 'habit' && !entry.special && E.canEdit(entry) ? '<button class="btn ghost" id="edit">✎ עריכה</button>' : ''}
      <button class="btn danger" id="del">🗑 מחיקה</button>
    </div>
  `, m => {
    m.querySelector('#ok').onclick = closeModal;
    m.querySelector('#del').onclick = () => {
      if (!confirm('למחוק את הפעילות? השיפור וה-EXP שלה יבוטלו, והמשימה תחזור להיות פתוחה.')) return;
      E.deleteEntry(entry.id); closeModal(); render(); toast('נמחק');
    };
    const ed = m.querySelector('#edit');
    if (ed) ed.onclick = () => {
      const quest = entry.questId ? E.state.quests[entry.date]?.items.find(x => x.id === entry.questId) : null;
      E.deleteEntry(entry.id);
      render();
      activityForm(entry.type, { date: entry.date, quest: quest && !quest.done ? quest : null, prefill: entry.params });
    };
  });
}

function showPenalty(p) {
  modal(`
    <div class="win-title"><span class="badge-i" style="border-color:var(--bad);color:var(--bad)">!</span><span class="en bad">PENALTY</span></div>
    <p class="center">אתמול לא הושלמו <b>${p.missed}</b> משימות עיקריות.</p>
    <p class="center bad">${p.lostStreak ? `הרצף של ${p.lostStreak} ימים אופס.` : 'הרצף נשאר על 0.'}</p>
    <p class="small muted center">היום זו הזדמנות חדשה. המשימות כבר מחכות.</p>
    <button class="btn block" id="ok">הבנתי</button>
  `, m => { m.querySelector('#ok').onclick = () => { closeModal(); tab = 'quests'; render(); }; });
}

// ---------- צ'ק-אין ----------
function checkinForm(date, q) {
  const c = E.state.checkins[date] || { mood: 6, energy: 6, stress: 4 };
  const sl = (n, l, v) => `<label class="f">${l}: <span class="range-val" data-v="${n}">${v}</span>/10</label><input type="range" name="${n}" min="1" max="10" value="${v}">`;
  modal(`
    <div class="win-title"><span class="badge-i">☺</span><span>דיווח מצב יומי</span></div>
    <form id="cf">
      ${sl('mood', 'מצב רוח', c.mood)}${sl('energy', 'אנרגיה', c.energy)}${sl('stress', 'לחץ', c.stress)}
      <label class="f">הערה (רשות)</label><input type="text" name="note" maxlength="140" value="${esc(c.note || '')}">
      <button class="btn block" style="margin-top:14px">שמירה ✔</button>
    </form>
  `, m => {
    const f = m.querySelector('#cf');
    f.oninput = e => { if (e.target.type === 'range') m.querySelector(`[data-v="${e.target.name}"]`).textContent = e.target.value; };
    f.onsubmit = e => {
      e.preventDefault();
      const d = new FormData(f);
      const xp = E.saveCheckin(date, { mood: +d.get('mood'), energy: +d.get('energy'), stress: +d.get('stress'), note: d.get('note') });
      const clear = q ? E.completeQuest(date, q.id, null) : null;
      const adj = E.adjustForReadiness(date);
      closeModal(); render();
      toast(adj ? 'נשמר ✓ האימון של היום הוקל לפי המצב שלך' : `נשמר ✓ ${xp ? `+${xp} EXP` : ''}${clear?.cleared ? ' · משימה יומית הושלמה! +50' : ''}`);
      flushLevelUp();
    };
  });
}

function flushLevelUp() {
  const msgs = E.takeMessages();
  const l = msgs.filter(m => m.kind === 'levelup').pop();
  if (!l) return;
  // לא לסגור חלון שהמשתמש באמצע למלא — מחכים שייסגר
  const show = () => {
    if (document.querySelector('.modal-back')) return setTimeout(show, 600);
    modal(`<div class="lvlup en" style="margin-top:20px">LEVEL UP!</div><p class="center">רמה <b>${l.level}</b> · דרגה <span class="rank">${l.rank}</span></p><button class="btn block" id="ok">המשך</button>`, m => m.querySelector('#ok').onclick = closeModal);
  };
  setTimeout(show, 300);
}

// ---------- WHO-5 ----------
function who5Form(date = E.today(), q = null) {
  modal(`
    <div class="win-title"><span class="badge-i">🧠</span><span>WHO-5 · בשבועיים האחרונים…</span></div>
    <form id="wf">
      ${WHO5_QUESTIONS.map((qq, i) => `
        <label class="f"><b style="color:var(--text)">${i + 1}. ${qq}</b></label>
        <div class="seg" data-i="${i}">${WHO5_ANSWERS.map((a, j) => `<button type="button" data-j="${j}">${a}</button>`).join('')}</div>`).join('')}
      <p id="wscore" class="center" style="margin-top:12px"></p>
      <button class="btn block">שמירה ✔</button>
    </form>
  `, m => {
    const ans = Array(5).fill(null);
    m.querySelectorAll('.seg').forEach(seg => seg.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
      ans[+seg.dataset.i] = 5 - +b.dataset.j; // "כל הזמן" = 5
      if (ans.every(a => a != null)) m.querySelector('#wscore').innerHTML = `ציון: <b>${ans.reduce((a, b) => a + b, 0) * 4}</b>/100`;
    });
    m.querySelector('#wf').onsubmit = e => {
      e.preventDefault();
      if (ans.some(a => a == null)) return toast('ענו על כל 5 השאלות');
      const score = ans.reduce((a, b) => a + b, 0) * 4;
      const r = E.recordTest('who5', score, { date });
      if (r.error) return toast(r.error);
      if (q) E.completeQuest(date, q.id, null);
      closeModal(); render();
      showTestResult(r);
    };
  });
}

// ---------- מבחן ----------
function testForm(key, date = E.today(), q = null) {
  const T = TESTS[key];
  const bl = E.state.baselines[key];
  const alt = key === 'cooper' ? `<button type="button" class="btn ghost block" id="altVo2" style="margin-top:8px">יש לי VO2max מהשעון — להזין אותו במקום</button>` : '';
  modal(`
    <div class="win-title"><span class="badge-i">${STATS[T.stat].icon}</span><span>${esc(T.he)}</span></div>
    <p class="small">${esc(T.how)}</p>
    ${bl ? `<p class="small muted">נקודת התחלה: ${tv(key, bl.value)} (${bl.date})</p>` : '<p class="small warn">זו תהיה נקודת ההתחלה (Baseline) שלך.</p>'}
    <form id="tf">
      ${key === 'sitreach' ? sitReachInputs() : `<label class="f">תוצאה (${T.unit})</label>
      <input type="text" name="v" inputmode="decimal" required>`}
      <button class="btn block" style="margin-top:14px">שמירה ✔</button>
    </form>
    ${alt}
    ${testHistoryHTML(key)}
  `, m => {
    bindTestHistory(m, key, date, q);
    m.querySelector('#tf').onsubmit = e => {
      e.preventDefault();
      const v = key === 'sitreach' ? readSitReach(m) : num(new FormData(e.target).get('v'));
      if (!Number.isFinite(v)) return toast(key === 'sitreach' ? 'בחרו לאן הגעתם' : 'הזינו מספר');
      if (key === 'sprint' && v <= 0) return toast('זמן לא תקין');
      const r = E.recordTest(key, v, { date });
      if (r.error) return toast(r.error);
      if (q) E.completeQuest(date, q.id, null);
      closeModal(); render();
      showTestResult(r);
    };
    if (key === 'sitreach') bindSitReach(m);
    const a = m.querySelector('#altVo2');
    if (a) a.onclick = () => testForm('vo2', date, q);
  });
}

// היסטוריית מדידות + מחיקה / איפוס נקודת התחלה
function testHistoryHTML(key) {
  const list = E.state.tests.filter(t => t.key === key);
  if (!list.length) return '';
  return `<details style="margin-top:12px"><summary>מדידות קודמות (${list.length}) — תיקון טעויות</summary>
    ${list.map((t, i) => `<div class="row between small" style="margin:6px 0"><span>${i === 0 ? '⚑ ' : ''}${t.date} · ${tv(key, t.value)}</span><button type="button" class="btn ghost" data-tdel="${t.at}" style="min-height:32px;padding:4px 10px">מחיקה</button></div>`).join('')}
    <button type="button" class="btn danger block" id="tReset" style="margin-top:6px">איפוס נקודת ההתחלה</button>
    <p class="small muted">⚑ = נקודת ההתחלה. מחיקה שלה מאפסת את המבחן, והמדידה הבאה תהיה ההתחלה החדשה.</p>
  </details>`;
}
function bindTestHistory(m, key, date, q) {
  m.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => {
    const at = Number(b.dataset.tdel);
    const isFirst = E.state.tests.find(t => t.key === key)?.at === at;
    if (!confirm(isFirst ? 'זו נקודת ההתחלה. מחיקה תמחק את כל המדידות של המבחן הזה ותאפס אותו. להמשיך?' : 'למחוק את המדידה?')) return;
    E.deleteTest(at); render(); testForm(key, date, q); toast('נמחק');
  });
  const r = m.querySelector('#tReset');
  if (r) r.onclick = () => {
    if (!confirm('לאפס את נקודת ההתחלה? כל המדידות של המבחן הזה יימחקו, והמדידה הבאה תהיה ההתחלה החדשה.')) return;
    E.resetBaseline(key); render(); testForm(key, date, q); toast('אופס — המדידה הבאה תהיה נקודת ההתחלה');
  };
}

// ---------- מבחן גמישות בלי מספרים שליליים ----------
// רמות משוערות (ס״מ ביחס לאצבעות הרגליים) לאדם בגובה ממוצע
const REACH_LEVELS = [
  { cm: -35, he: 'עד הברכיים', ic: '🦵' },
  { cm: -22, he: 'אמצע השוק', ic: '⬇️' },
  { cm: -10, he: 'עד הקרסוליים', ic: '🦶' },
  { cm: -4, he: 'כמעט נוגע באצבעות הרגליים', ic: '🤏' },
  { cm: 0, he: 'נוגע בדיוק באצבעות הרגליים', ic: '👆' },
  { cm: 6, he: 'האצבעות עוברות את כפות הרגליים', ic: '👉' },
  { cm: 12, he: 'כל כף היד עוברת את כפות הרגליים', ic: '🖐️' },
];
function sitReachInputs() {
  return `
    <label class="f"><b style="color:var(--text)">לאן הגעת עם קצות האצבעות?</b></label>
    <div class="seg" id="reachLv" style="flex-direction:column">
      ${REACH_LEVELS.map((l, i) => `<button type="button" data-i="${i}" style="text-align:start">${l.ic} ${l.he}</button>`).join('')}
    </div>
    <details style="margin-top:10px"><summary>מדידה מדויקת עם סרגל (רשות)</summary>
      <div class="seg" id="reachSide" style="margin-top:8px">
        <button type="button" data-s="-1">לא הגעתי לאצבעות</button>
        <button type="button" data-s="1">עברתי את האצבעות</button>
      </div>
      <label class="f">בכמה ס״מ?</label>
      <input type="text" id="reachCm" inputmode="decimal" placeholder="למשל 8">
      <p class="small muted">מודדים את המרחק בין קצות אצבעות הידיים לקצות אצבעות הרגליים.</p>
    </details>
    <p class="small muted">חשוב: בכל מבחן חוזר — אותה שיטה, אחרי אותו חימום.</p>`;
}
function bindSitReach(m) {
  const pick = (box, attr) => box.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    box.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
    box.dataset.val = b.dataset[attr];
  };
  pick(m.querySelector('#reachLv'), 'i');
  pick(m.querySelector('#reachSide'), 's');
}
function readSitReach(m) {
  const cm = num(m.querySelector('#reachCm').value);
  const side = m.querySelector('#reachSide').dataset.val;
  if (Number.isFinite(cm) && side) return Math.abs(cm) * Number(side);
  if (Number.isFinite(cm) && cm === 0) return 0;
  const i = m.querySelector('#reachLv').dataset.val;
  return i != null ? REACH_LEVELS[+i].cm : NaN;
}

function showTestResult(r) {
  const T = TESTS[r.key], S = STATS[r.stat];
  E.takeMessages();
  modal(`
    <div class="win-title"><span class="badge-i">${S.icon}</span><span class="en">${r.baseline ? 'BASELINE SET' : 'RECALIBRATED'}</span></div>
    <div class="xp-pop en">+${r.xp} EXP</div>
    ${r.xp === 0 ? '<p class="center small muted">EXP על מבחן — פעם ב-6 ימים לכל מבחן.</p>' : ''}
    <p class="center">${esc(T.he)}: <b>${tv(r.key, r.value)}</b></p>
    ${r.capped ? `<p class="small warn">השיפור שנמדד גבוה ממה שאפשרי פיזיולוגית בזמן שעבר, אז נלקח עד ${sgn(r.cappedTo, 1)}%. אם המדידה נכונה, המדידות הבאות ישלימו את השאר.</p>` : ''}
    ${r.baseline ? `<p class="center muted small">נקבעה נקודת התחלה. ההערכה של השבוע הבא תראה כמה באמת השתפרת.</p>` :
      `<div class="tiles">
        <div class="tile"><div class="t">המודל חזה</div><div class="n">${sgn(r.modelGain, 1)}%</div></div>
        <div class="tile"><div class="t">נמדד בפועל</div><div class="n ${r.measuredGain >= 0 ? 'good' : 'bad'}">${sgn(r.measuredGain, 1)}%</div></div>
        <div class="tile"><div class="t">${S.he} עכשיו</div><div class="n" style="color:${S.color}">${E.statValue(r.stat).toFixed(1)}</div></div>
      </div>
      <p class="small muted">${r.stat === 'MND' ? 'במצב נפשי — שילוב 50/50 בין המודל לשאלון (כי שאלונים רועשים יותר).' : 'במדדים פיזיים — המדידה האמיתית גוברת על המודל.'} ${r.measuredGain > r.modelGain + 2 ? 'הגבת לאימון מעל הממוצע 💪' : r.measuredGain < r.modelGain - 2 ? 'התקדמות מתחת לממוצע — בדקו שינה, תזונה ועקביות. זה נורמלי לגמרי; התגובה לאימון שונה מאוד בין אנשים.' : ''}</p>`}
    ${!E.assessment().due ? `<p class="center cleared">ההערכה הושלמה ✦</p><button class="btn block" id="rep">📈 לדוח ההתקדמות</button><div style="height:8px"></div>` : ''}
    <button class="btn ${!E.assessment().due ? 'ghost ' : ''}block" id="ok">המשך</button>
  `, m => {
    m.querySelector('#ok').onclick = closeModal;
    const rep = m.querySelector('#rep');
    if (rep) rep.onclick = () => { closeModal(); tab = 'measure'; render(); setTimeout(() => document.querySelectorAll('.win')[2]?.scrollIntoView({ behavior: 'smooth' }), 50); };
  });
}

function stepsForm(date, q) {
  const cur = E.state.health[date]?.steps ?? '';
  modal(`
    <div class="win-title"><span class="badge-i">👣</span><span>צעדים</span></div>
    <p class="small muted">הדרך הקלה: כפתור "סנכרון מ-Apple Health". או הזנה ידנית מאפליקציית Health.</p>
    <form id="sf"><label class="f">צעדים היום</label><input type="number" name="s" inputmode="numeric" value="${cur}" required>
    <button class="btn block" style="margin-top:14px">שמירה ✔</button></form>
    <button class="btn ghost block" id="sync" style="margin-top:8px">⟳ סנכרון מהלוח</button>
    ${q && !q.done ? '<button class="btn ghost block" id="minimal" style="margin-top:8px">🪶 יום קשה? לפחות 2,000 צעדים</button>' : ''}
  `, m => {
    m.querySelector('#minimal') && (m.querySelector('#minimal').onclick = () => minimalDialog(date, q));
    m.querySelector('#sf').onsubmit = e => {
      e.preventDefault();
      const s = num(new FormData(e.target).get('s'));
      if (!(s >= 0 && s <= 70000)) return toast('מספר צעדים לא סביר (0–70,000)');
      E.mergeHealth(date, { steps: s });
      const done = E.autoCompleteFromHealth(date);
      closeModal(); render();
      toast(done.length ? `הושלם: ${done.join(', ')}` : `נשמר. עוד ${(q.target.steps - s).toLocaleString('he-IL')} צעדים ליעד`);
      flushLevelUp();
    };
    m.querySelector('#sync').onclick = () => { closeModal(); syncFromClipboard(); };
  });
}

// =====================================================================
//  מדידה
// =====================================================================
function renderMeasure() {
  const S = E.state, t = E.today();
  const c = S.checkins[t];
  app.innerHTML = `
  ${win('CONDITION', `
    ${c ? `<div class="tiles"><div class="tile"><div class="t">מצב רוח</div><div class="n">${c.mood}</div></div><div class="tile"><div class="t">אנרגיה</div><div class="n">${c.energy}</div></div><div class="tile"><div class="t">לחץ</div><div class="n">${c.stress}</div></div></div>` : '<p class="muted center">עוד לא דיווחת היום.</p>'}
    <div class="btn-row" style="margin-top:10px"><button class="btn" id="ci">דיווח מצב</button><button class="btn ghost" id="w5">שאלון WHO-5</button></div>
    ${moodChart()}
  `, { icon: '☺' })}

  ${assessmentWin(true)}
  ${reportWin()}

  ${win('HEALTH SYNC', healthSyncHTML(), { icon: '♥' })}
  `;
  $('#ci').onclick = () => checkinForm(t, E.questsFor(t).items.find(q => q.kind === 'checkin' && !q.done));
  $('#w5').onclick = () => who5Form(t, E.questsFor(t).items.find(q => q.kind === 'who5' && !q.done));
  bindAssessment();
  bindHealthSync();
}

// ---------- הערכה שבועית ----------
function assessmentWin(full) {
  const A = E.assessment();
  if (!full && !A.due) return `<p class="small muted center" style="margin:0 0 12px">📏 ההערכה השבועית הבאה בעוד <b>${A.nextIn}</b> ימים — שם תראה כמה השתפרת באמת.</p>`;
  const title = A.initial ? 'INITIAL ASSESSMENT' : 'WEEKLY ASSESSMENT';
  const coreLeft = A.items.filter(i => !i.optional && i.due).length;
  return win(title, `
    <p class="small" style="margin-top:0">${A.initial
      ? 'לפני שמתחילים — מודדים את נקודת הפתיחה שלך. כל שבוע נמדוד שוב, ונראה מה המשימות היומיות עשו לך.'
      : A.due ? (A.items.some(i => !i.optional && !i.last) ? `נשארו ${coreLeft} מבחנים להשלמת ההערכה.` : `עבר שבוע. זמן למדוד מה השתנה — ${coreLeft} מבחנים נשארו.`) : `ההערכה הושלמה ✓ הבאה בעוד ${A.nextIn} ימים.`}</p>
    ${A.items.map(i => {
      const T = TESTS[i.key];
      const st = i.doneToday || !i.due ? `<span class="check" style="color:var(--good);border-color:var(--good)">✓</span>` : '<span class="check">＋</span>';
      return `<button class="quest ${!i.due ? 'done' : ''}" data-test="${i.key}"><span><div class="qt">${STATS[T.stat].icon} ${i.he}${i.optional ? '<span class="opt">רשות</span>' : ''}</div><div class="qd">${esc(T.he)}${i.last ? ` · אחרון: ${tv(i.last.key, i.last.value)} (${i.last.date})` : ''}</div></span>${st}</button>`;
    }).join('')}
    ${full ? `<details><summary>כל המבחנים</summary>${Object.entries(TESTS).map(([k, T]) => `<button class="quest" data-test="${k}"><span><div class="qt">${STATS[T.stat].icon} ${esc(T.he)}</div></span><span class="check">＋</span></button>`).join('')}</details>` : ''}
  `, { icon: '⚖' });
}
function bindAssessment() {
  app.querySelectorAll('[data-test]').forEach(b => b.onclick = () => {
    const k = b.dataset.test;
    if (k === 'who5') who5Form(E.today()); else testForm(k, E.today());
  });
}
function reportRows() {
  const R = E.weeklyReport();
  if (!R.length) return '<p class="muted center small">עוד אין מדידות.</p>';
  return R.map(r => {
    const T = TESTS[r.key], S = STATS[T.stat];
    const c = v => v == null ? '<span class="muted">—</span>' : `<b class="${v >= 0 ? 'good' : 'bad'}">${sgn(v, 1)}%</b>`;
    return `<div class="gain-row"><div class="head"><span>${S.icon} <b>${S.he}</b> <span class="small muted">${esc(T.he)}</span></span></div>
      <div class="small" style="margin-top:4px">התחלה: ${tv(r.key, r.first)}${r.prev ? ` · שבוע קודם: ${tv(r.key, r.prev.value)}` : ''} · עכשיו: <b>${tv(r.key, r.last.value)}</b></div>
      <div class="row small" style="margin-top:4px;gap:16px"><span>השבוע: ${c(r.week)}</span><span>מההתחלה: ${c(r.total)}</span></div></div>`;
  }).join('');
}
function reportWin() { return win('REPORT', `<p class="small muted" style="margin-top:0">שינוי אמיתי שנמדד — מההערכה הקודמת ומההתחלה.</p>${reportRows()}<p class="small muted">בכוח, האחוז הוא שינוי בכוח המשוער לפי נוסחת Epley (1RM ∝ 1 + חזרות/30), ולא במספר החזרות. בסיבולת, השינוי הוא ב-VO2max המשוער.</p>`, { icon: '↗' }); }

function moodChart() {
  const t = E.today(); const W = 300, H = 70;
  const pts = [];
  for (let i = 27; i >= 0; i--) { const c = E.state.checkins[E.addDays(t, -i)]; if (c) pts.push([27 - i, c.mood]); }
  if (pts.length < 2) return '';
  const p = pts.map(([x, v], i) => `${i ? 'L' : 'M'}${(x / 27 * W).toFixed(1)},${(H - 4 - (v - 1) / 9 * (H - 8)).toFixed(1)}`).join('');
  return `<p class="small muted" style="margin:12px 0 2px">מצב רוח — 4 שבועות</p><svg class="chart" style="height:70px" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${p}" fill="none" stroke="${STATS.MND.color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------- סנכרון בריאות ----------
function healthSyncHTML() {
  return `
    <p class="small">האפליקציה הזו רצה בדפדפן, ולכן Apple לא נותנת לה לקרוא את Health ישירות. יש שתי דרכים לחבר:</p>
    <button class="btn block" id="clipSync">⟳ 1. סנכרון יומי מקיצור דרך (מהלוח)</button>
    <p class="small muted">מריצים את קיצור הדרך "ASCEND Sync" (הוראות במסך "מערכת"), ואז לוחצים כאן.</p>
    <label class="btn ghost block" style="margin-top:8px">📦 2. ייבוא קובץ ייצוא מלא של Apple Health<input type="file" id="hfile" accept=".zip,.xml,application/zip,text/xml" hidden></label>
    <p class="small muted">Health ← תמונת הפרופיל ← "ייצוא כל נתוני הבריאות" ← שמירה ב-Files ← בחירה כאן. מייבא צעדים, שינה, דופק מנוחה, HRV, VO2max ו<b>אימונים מכל האפליקציות</b> שמסונכרנות ל-Health (Strava, Nike Run Club, Garmin, Apple Watch…).</p>
    <div id="hprog" class="small"></div>
    <details><summary>הזנה ידנית</summary>
      <form id="manH">
        <div class="row"><div class="grow"><label class="f">צעדים</label><input type="number" name="steps" inputmode="numeric"></div><div class="grow"><label class="f">שינה (שעות)</label><input type="text" name="sleepH" step="0.1" inputmode="decimal"></div></div>
        <div class="row"><div class="grow"><label class="f">דופק מנוחה</label><input type="number" name="rhr" inputmode="numeric"></div><div class="grow"><label class="f">VO2max</label><input type="text" name="vo2" step="0.1" inputmode="decimal"></div></div>
        <button class="btn block" style="margin-top:10px">שמירה להיום</button>
      </form>
    </details>`;
}
function bindHealthSync() {
  $('#clipSync').onclick = syncFromClipboard;
  $('#manH').onsubmit = e => {
    e.preventDefault();
    const d = {};
    for (const [k, v] of new FormData(e.target)) if (v !== '' && Number.isFinite(num(v))) d[k] = num(v);
    applySync(d);
  };
  $('#hfile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const prog = $('#hprog');
    prog.innerHTML = 'קורא את הקובץ…';
    try {
      const since = E.addDays(E.today(), -45);
      const res = await importHealthExport(file, {
        sinceDay: since, age: E.state.profile.age,
        onProgress: (p, lines) => { prog.textContent = `קורא… ${Math.round(p * 100)}% (${lines.toLocaleString('he-IL')} שורות)`; },
      });
      let nDays = 0;
      for (const [d, v] of Object.entries(res.days)) { E.mergeHealth(d, v); nDays++; }
      const imported = [];
      for (const w of res.workouts) { const e2 = E.importWorkout(w); if (e2) imported.push(e2); }
      for (const d of Object.keys(res.days).filter(d => d >= E.state.profile.startedAt)) E.autoCompleteFromHealth(d);
      prog.innerHTML = `<span class="good">✓ יובאו נתונים ל-${nDays} ימים ו-${imported.length} אימונים חדשים.</span>`;
      E.snapshot();
      E.save();
      toast('ייבוא הושלם');
      if (imported.length) showImportSummary(imported);
    } catch (err) {
      console.error(err);
      prog.innerHTML = `<span class="bad">שגיאה: ${esc(err.message || err)}</span>`;
    }
  };
}

function showImportSummary(entries) {
  const tot = {};
  for (const e of entries) for (const [k, v] of Object.entries(e.gains)) tot[k] = (tot[k] || 0) + v;
  E.takeMessages();
  modal(`
    <div class="win-title"><span class="badge-i">♥</span><span class="en">HEALTH IMPORT</span></div>
    <p>${entries.length} אימונים יובאו מ-Apple Health:</p>
    ${entries.slice(0, 30).map(e => `<div class="row between small" style="margin:4px 0"><span>${ACTIVITIES[e.type].icon} ${e.date} · ${esc(e.source)}</span><span class="muted">${e.params.duration ?? ''} דק׳</span></div>`).join('')}
    <div class="sep"></div>
    <b>סה״כ שיפור:</b>
    <div class="chips">${Object.entries(tot).map(([k, v]) => `<span class="chip" style="border-color:${STATS[k].color};color:${STATS[k].color}">${k} +${v.toFixed(2)}%</span>`).join('')}</div>
    <p class="small muted">נספרים רק אימונים מאז שהתחלת להשתמש באפליקציה. עצימות מחושבת מהדופק הממוצע (Tanaka 2001) כשקיים.</p>
    <button class="btn block" id="ok">המשך</button>
  `, m => m.querySelector('#ok').onclick = () => { closeModal(); render(); });
}

async function syncFromClipboard() {
  let text = '';
  try { text = await navigator.clipboard.readText(); } catch (e) { /* iOS עלול לחסום */ }
  const data = parseSyncText(text);
  if (!data) {
    modal(`
      <div class="win-title"><span class="badge-i">⟳</span><span>סנכרון</span></div>
      <p class="small">לא נמצאו נתונים בלוח. הריצו קודם את קיצור הדרך <b>ASCEND Sync</b> (הוראות ב"מערכת" ← Apple Health), או הדביקו כאן:</p>
      <textarea id="pt" placeholder="steps=8432; sleep=7.2; rhr=58"></textarea>
      <button class="btn block" id="go" style="margin-top:10px">סנכרון</button>
    `, m => m.querySelector('#go').onclick = () => {
      const d = parseSyncText(m.querySelector('#pt').value);
      if (!d) return toast('לא זוהו נתונים');
      closeModal(); applySync(d);
    });
    return;
  }
  applySync(data);
}

function applySync(data) {
  const date = data.date || E.today();
  delete data.date;
  E.mergeHealth(date, data);
  const done = E.autoCompleteFromHealth(date);
  if (E.adjustForReadiness(date)) done.push('האימון הוקל בגלל שינה קצרה');
  E.snapshot();
  E.save();
  render();
  const parts = [];
  if (data.steps != null) parts.push(`${Number(data.steps).toLocaleString('he-IL')} צעדים`);
  if (data.sleepH != null) parts.push(`${fmt(data.sleepH, 1)} ש׳ שינה`);
  if (data.rhr != null) parts.push(`דופק ${data.rhr}`);
  if (data.vo2 != null) parts.push(`VO2 ${data.vo2}`);
  toast(`סונכרן: ${parts.join(' · ') || 'נתונים'}${done.length ? ' ✓ ' + done.join(', ') : ''}`);
  flushLevelUp();
}

// =====================================================================
//  יומן
// =====================================================================
function bigChart(days = 60) {
  const t = E.today(); const W = 320, H = 200, pad = 26;
  const series = {};
  let mn = 0, mx = 1;
  for (const k of STAT_KEYS) {
    series[k] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = E.addDays(t, -i); const v = E.state.history[d]?.[k];
      if (v != null) { series[k].push([days - 1 - i, v]); mn = Math.min(mn, v); mx = Math.max(mx, v); }
    }
  }
  const y = v => H - pad - (v - mn) / (mx - mn || 1) * (H - pad - 8);
  const x = i => pad + i / (days - 1) * (W - pad - 4);
  const ticks = [mn, (mn + mx) / 2, mx];
  return `<svg class="chart" style="direction:ltr" viewBox="0 0 ${W} ${H}">
    ${ticks.map(v => `<line x1="${pad}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(84,176,255,.15)"/><text x="2" y="${y(v) + 4}" font-size="9" fill="#8aa3c7">${v.toFixed(1)}%</text>`).join('')}
    ${STAT_KEYS.map(k => series[k].length > 1 ? `<path d="${series[k].map(([i, v], j) => `${j ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${STATS[k].color}" stroke-width="2"/>` : '').join('')}
    <text x="${pad}" y="${H - 8}" font-size="9" fill="#8aa3c7">לפני ${days} ימים</text><text x="${W - 4}" y="${H - 8}" font-size="9" fill="#8aa3c7" text-anchor="end">היום</text>
  </svg>
  <div class="legend">${STAT_KEYS.map(k => `<span><i style="background:${STATS[k].color}"></i>${STATS[k].he}</span>`).join('')}</div>`;
}

function renderLog() {
  const L = E.state.log;
  app.innerHTML = `
  ${win('PROGRESS', `<p class="small muted" style="margin-top:0">שיפור מצטבר ב-% מנקודת ההתחלה</p>${bigChart()}`, { icon: '↗' })}
  ${win('LOG', L.length ? L.slice(0, 80).map(e => `
    <div class="log-item" data-l="${e.id}">
      <div class="row between"><span><b>${esc(entryTitle(e))}</b></span><span class="small muted en">${e.date}</span></div>
      <div class="small muted">${e.params.duration ? e.params.duration + ' דק׳' : ''}${e.params.distance ? ' · ' + e.params.distance + ' ק״מ' : ''}${e.params.reps ? e.params.reps + ' חזרות' : ''}${e.params.hours != null ? e.params.hours + ' שעות' : ''}${e.params.rpe ? ' · RPE ' + e.params.rpe : ''}${e.source !== 'manual' ? ' · ' + esc(e.source) : ''} · +${e.xp} EXP</div>
      <div class="chips">${Object.entries(e.gains).map(([k, v]) => `<span class="chip" style="border-color:${STATS[k].color};color:${STATS[k].color}">${k} +${v.toFixed(2)}%</span>`).join('')}</div>
    </div>`).join('') : '<p class="muted center">עוד אין פעילויות. השלימו משימה ראשונה!</p>', { icon: '≡' })}
  `;
  app.querySelectorAll('[data-l]').forEach(d => d.onclick = () => showResult(E.state.log.find(e => e.id === d.dataset.l)));
}

// =====================================================================
//  מערכת (הגדרות, Apple Health, מחקר, גיבוי)
// =====================================================================
function renderSystem() {
  const P = E.state.profile;
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  app.innerHTML = `
  ${!standalone ? win('INSTALL', `
    <p>כדי שזו תהיה אפליקציה אמיתית באייפון:</p>
    <ol class="steps small"><li>פתחו את הכתובת הזו ב-<b>Safari</b>.</li><li>לחצו על כפתור השיתוף <b>⬆︎</b>.</li><li>בחרו <b>"הוספה למסך הבית"</b>.</li><li>פתחו את ASCEND מהאייקון — מסך מלא, עובד גם בלי אינטרנט.</li></ol>
  `, { icon: '⬇' }) : ''}

  ${win('PLAYER', `
    <form id="pf">
      <label class="f">שם</label><input type="text" name="name" value="${esc(P.name)}" maxlength="24">
      <div class="row"><div class="grow"><label class="f">גיל</label><input type="number" name="age" value="${P.age}"></div><div class="grow"><label class="f">משקל</label><input type="text" inputmode="decimal" name="weightKg" value="${P.weightKg}"></div></div>
      <label class="f">ציוד</label><select name="equipment"><option value="none" ${P.equipment === 'none' ? 'selected' : ''}>בלי ציוד</option><option value="gym" ${P.equipment === 'gym' ? 'selected' : ''}>חדר כושר</option></select>
      <label class="f">ימי אימון בשבוע</label><select name="daysPerWeek">${[3, 4, 5, 6].map(n => `<option ${+P.daysPerWeek === n ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <button class="btn block" style="margin-top:12px">שמירה</button>
      <p class="small muted">שינויים ייכנסו לתוקף במשימות של מחר.</p>
    </form>
  `, { icon: '☻' })}

  ${win('APPLE HEALTH', `
    <p class="small">אפליקציות ווב לא יכולות לגשת ישירות ל-HealthKit, אבל <b>קיצורי דרך</b> של iOS כן. בונים פעם אחת קיצור שקורא את הנתונים של היום ומעתיק אותם, ואז לוחצים "סנכרון" באפליקציה.</p>
    <details><summary>בניית קיצור הדרך "ASCEND Sync" (5 דקות, פעם אחת)</summary>
      <ol class="steps small">
        <li>פתחו את אפליקציית <b>קיצורים</b> ← <b>＋</b> ← קראו לו <code>ASCEND Sync</code>.</li>
        <li>הוסיפו פעולה <b>"מציאת דגימות בריאות"</b> (Find Health Samples): סוג = <b>צעדים</b>, תאריך התחלה = <b>היום</b>, קיבוץ לפי = <b>יום</b>.</li>
        <li>הוסיפו <b>"חישוב סטטיסטיקה"</b> (Calculate Statistics) ← <b>סכום</b>. שנו את שם המשתנה ל-<code>Steps</code>.</li>
        <li>עוד "מציאת דגימות בריאות": סוג = <b>ניתוח שינה</b>, תאריך התחלה = <b>ב-1 הימים האחרונים</b>, ערך = <b>ישן</b> (Asleep). ← "חישוב סטטיסטיקה" ← <b>סכום</b> על <b>משך</b> (Duration). (התוצאה בדקות — מעולה.) שם: <code>SleepMin</code>.</li>
        <li>עוד אחת: <b>דופק במנוחה</b>, ב-1 הימים האחרונים, מיון = האחרון, הגבלה = 1. שם: <code>RHR</code>. (אפשר גם <b>VO2 מקסימלי</b> ו-<b>HRV</b> אם יש שעון.)</li>
        <li>הוסיפו פעולת <b>"טקסט"</b> עם התוכן:<br><code>ASCEND steps=[Steps]; sleepmin=[SleepMin]; rhr=[RHR]; vo2=[VO2]</code><br>(הכניסו את המשתנים במקום הסוגריים).</li>
        <li>הוסיפו <b>"העתקה ללוח"</b> (Copy to Clipboard).</li>
        <li>בפעם הראשונה iOS ישאל הרשאה לקרוא את נתוני הבריאות — אשרו.</li>
        <li>טיפ: ב"אוטומציה" אפשר להריץ את הקיצור כל ערב ב-21:30 עם התראה שתזכיר לפתוח את האפליקציה.</li>
      </ol>
      <p class="small muted">שמות הפעולות עשויים להשתנות מעט בין גרסאות iOS. אם משהו לא יוצא מדויק — הקיצור סלחן: מספיק טקסט כמו <code>steps=8000; sleep=7.5</code>.</p>
    </details>
    <details><summary>אפליקציות אחרות (Strava, Nike, Garmin, Fitbod…)</summary>
      <p class="small">כמעט כל אפליקציות הכושר מסנכרנות אימונים ל-Apple Health. אחרי שהפעלתם אצלן את הסנכרון ל-Health, ייבוא קובץ הייצוא (במסך "מדידה") מביא את כל האימונים שלהן לכאן — עם משך, מרחק ודופק — והמערכת מחשבת את השיפור לכל אחד.</p>
    </details>
  `, { icon: '♥' })}

  ${win('RESEARCH MODEL', `
    <p class="small">כל תכונה עוקבת אחרי עקומת הסתגלות רוויה שמכוילת למחקרים:</p>
    <p class="center en" style="font-size:13px">ΔG = (Gmax − G) · (1 − e<sup>−dose/τ</sup>)</p>
    <ul class="small">
      <li><b>dose</b> — כמה "אימונים סטנדרטיים" (כמו בניסויים) שווה האימון שלך: משך × עצימות (RPE).</li>
      <li><b>Gmax</b> — התקרה הריאלית הממוצעת; אם המבחנים שלך עוברים אותה, היא מורחבת (יש אנשים שמגיבים חזק יותר).</li>
      <li><b>τ</b> — נבחר כך שהעקומה תעבור דרך התוצאות שנמדדו במחקרים.</li>
      <li>ללא אימון — דעיכה הדרגתית אחרי תקופת חסד, לפי מחקרי Detraining.</li>
      <li>מבחני כושר תקופתיים מחליפים את ההערכה במדידה אמיתית.</li>
    </ul>
    ${STAT_KEYS.map(k => `<details><summary>${STATS[k].icon} ${STATS[k].he} · Gmax ${STATS[k].gmax}% · τ ${STATS[k].tau}</summary><p class="small">${STATS[k].basis}</p></details>`).join('')}
    <details><summary>כל המקורות (${Object.keys(SOURCES).length})</summary>${Object.values(SOURCES).map(s => `<div class="src">${esc(s)}</div>`).join('')}</details>
    <p class="small muted">האפליקציה אינה ייעוץ רפואי. אם יש לך מצב רפואי, כאבים או מצוקה נפשית — פנה/י לאיש מקצוע.</p>
  `, { icon: '∑' })}

  ${win('DATA', `
    <p class="small muted">הנתונים נשמרים רק במכשיר שלך. מומלץ לגבות מדי פעם.</p>
    <div class="btn-row"><button class="btn" id="exp">⬇ גיבוי</button><label class="btn ghost">⬆ שחזור<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
    <button class="btn danger block" id="rst" style="margin-top:10px">איפוס מלא</button>
  `, { icon: '⛁' })}
  <p class="small muted center en">ASCEND v1.5</p>
  `;
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    Object.assign(E.state.profile, { name: f.get('name') || P.name, age: +f.get('age') || P.age, weightKg: num(f.get('weightKg')) || P.weightKg, equipment: f.get('equipment'), daysPerWeek: +f.get('daysPerWeek') });
    E.save(); toast('נשמר ✓');
  };
  $('#exp').onclick = async () => {
    const blob = new Blob([E.exportBackup()], { type: 'application/json' });
    const file = new File([blob], `ascend-backup-${E.today()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'ASCEND backup' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const { state: s, verified } = E.importBackup(await f.text());
      if (!confirm(`לשחזר מהגיבוי? הנתונים הנוכחיים יוחלפו.${verified ? '' : '\n\n⚠ הגיבוי לא מאומת (ישן או נערך ידנית) — זה יסומן בסטטוס.'}`)) return;
      E.replaceState(s); dailyTick(); render(); toast('שוחזר ✓');
    } catch (err) { toast('שגיאה: ' + err.message); }
  };
  $('#rst').onclick = () => {
    if (!confirm('למחוק את כל הנתונים ולהתחיל מחדש? אי אפשר לבטל.')) return;
    E.resetAll(); renderOnboarding();
  };
}

// =====================================================================
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
window.addEventListener('hashchange', () => {
  const hs = parseHashSync(location.hash);
  if (hs && E.state) { history.replaceState(null, '', location.pathname); applySync(hs); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && E.state) {
    if (!E.clockCheck().ok) return render();
    if (E.state.lastDecay !== E.today()) dailyTick();
    render(); checkSpecial();
  }
});
boot();

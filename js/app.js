import {
  STATS, STAT_KEYS, ACTIVITIES, TESTS, TRAINING_STATUS, SOURCES, WHO5_QUESTIONS, WHO5_ANSWERS,
  computeDose, fmt, clamp,
} from './research.js';
import * as E from './engine.js';
import { parseSyncText, parseHashSync, importHealthExport } from './health.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// מספר מקלט משתמש: מקבל גם פסיק עשרוני (מקלדת iOS בעברית) וגם מינוס
const num = x => { if (x == null) return NaN; const t = String(x).trim().replace(/[−–]/g, '-').replace(',', '.'); return t === '' ? NaN : Number(t); };
// תצוגת תוצאת מבחן בשפה רגילה
const tv = (key, v) => {
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
  dailyTick();
  // סנכרון דרך כתובת (#sync?steps=...)
  const hs = parseHashSync(location.hash);
  if (hs) { history.replaceState(null, '', location.pathname); applySync(hs); }
  showTabs();
  render();
  setInterval(() => { if (E.state && E.state.lastDecay !== E.today()) { dailyTick(); render(); } }, 60000);
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
  showTabs();
  ({ status: renderStatus, quests: renderQuests, measure: renderMeasure, log: renderLog, system: renderSystem })[tab]();
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
        <b>שם</b><span>${esc(P.name)}</span>
        <b>דרגה</b><span><span class="rank">${rk.r}</span> <span class="small">${rk.title}</span></span>
        <b>רצף</b><span>🔥 ${S.streak.count} ימים <span class="small muted">(שיא ${S.streak.best})</span></span>
      </div>
    </div>
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
  $('#syncBtn').onclick = syncFromClipboard;
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

function renderQuests() {
  const t = E.today();
  const day = E.questsFor(t);
  const mains = day.items.filter(q => q.main);
  const doneN = mains.filter(q => q.done).length;
  app.innerHTML = `
  ${win('DAILY QUEST', `
    <div class="row between small"><span class="muted">${new Date().toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</span><span class="timer">⏳ ${timeLeft()}</span></div>
    <div class="row between small" style="margin:8px 0 4px"><span>התקדמות</span><span class="en">${doneN}/${mains.length}</span></div>
    <div class="bar"><i style="width:${doneN / mains.length * 100}%"></i></div>
    <div style="margin-top:6px">
    ${day.items.map(q => `
      <button class="quest ${q.done ? 'done' : ''}" data-q="${q.id}">
        <span><div class="qt">${esc(q.title)}${q.main ? '' : '<span class="opt">בונוס</span>'}</div><div class="qd">${esc(q.desc)}</div></span>
        <span class="check">${q.done ? '✓' : ''}</span>
      </button>`).join('')}
    </div>
    ${day.cleared ? `<div class="sep"></div><p class="center cleared">משימה יומית הושלמה ✦ +50 EXP</p>` : `<p class="small warn center" style="margin:10px 0 0">אזהרה: אי-השלמת המשימות היומיות יאפס את הרצף.</p>`}
  `, { icon: '!', titleHe: '' })}
  <button class="btn block" id="freeAct">＋ תיעוד פעילות חופשית</button>
  <p class="small muted center">פעילות שעשית מחוץ למשימות — גם היא נספרת לפי אותו מודל מחקרי.</p>
  `;
  app.querySelectorAll('[data-q]').forEach(b => b.onclick = () => openQuest(t, b.dataset.q));
  $('#freeAct').onclick = freeActivity;
}

function openQuest(date, id) {
  const q = E.questsFor(date).items.find(x => x.id === id);
  if (!q) return;
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

// ---------- טופס פעילות ----------
function activityForm(type, { date = E.today(), quest = null } = {}) {
  const A = ACTIVITIES[type];
  const v = { ...A.defaults, ...(quest?.target || {}) };
  const fields = {
    duration: `<label class="f">משך (דקות)</label><input type="number" name="duration" inputmode="numeric" min="1" max="600" value="${v.duration ?? ''}">`,
    distance: `<label class="f">מרחק (ק״מ) — רשות</label><input type="text" name="distance" inputmode="decimal" step="0.01" min="0" value="${v.distance ?? ''}">`,
    reps: `<label class="f">מספר ספרינטים</label><input type="number" name="reps" inputmode="numeric" min="1" max="40" value="${v.reps ?? ''}">`,
    hours: `<label class="f">שעות שינה</label><input type="text" name="hours" inputmode="decimal" step="0.25" min="0" max="16" value="${E.state.health[date]?.sleepH ?? v.hours ?? ''}">`,
    rpe: `<label class="f">מאמץ (RPE): <span class="range-val" id="rpeV">${v.rpe}</span>/10 — <span id="rpeL" class="small"></span></label><input type="range" name="rpe" min="1" max="10" step="0.5" value="${v.rpe}">`,
  };
  const journal = type === 'journal' ? `<label class="f">3 דברים טובים מהיום</label><textarea name="notes" placeholder="1.&#10;2.&#10;3."></textarea>` : '';
  modal(`
    <div class="win-title"><span class="badge-i">${A.icon}</span><span>${esc(quest?.title || A.he)}</span></div>
    ${quest ? `<p class="small muted">${esc(quest.desc)}</p>` : ''}
    <form id="af">
      ${A.fields.map(f => fields[f]).join('')}
      ${journal}
      <div id="preview" class="calc"></div>
      <button class="btn block" style="margin-top:14px" type="submit">השלמה ✔</button>
    </form>
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
    form.onsubmit = e => {
      e.preventDefault();
      const p = read();
      if (A.fields.includes('duration') && !(p.duration > 0)) return toast('הזינו משך');
      if (type === 'sleep' && !(p.hours >= 0)) return toast('הזינו שעות שינה');
      const entry = E.applyActivity(type, p, { date, questId: quest?.id, questMain: quest?.main });
      let clear = null;
      if (quest) clear = E.completeQuest(date, quest.id, entry);
      closeModal();
      render();
      showResult(entry, clear);
    };
  });
}

function freeActivity() {
  modal(`
    <div class="win-title"><span class="badge-i">＋</span><span>תיעוד פעילות</span></div>
    <div class="seg" style="flex-direction:column">
      ${Object.entries(ACTIVITIES).map(([k, a]) => `<button data-t="${k}" style="text-align:start">${a.icon} ${a.he}</button>`).join('')}
    </div>
  `, m => m.querySelectorAll('[data-t]').forEach(b => b.onclick = () => activityForm(b.dataset.t)));
}

// ---------- חלון תוצאה ----------
function showResult(entry, clear = null) {
  const A = ACTIVITIES[entry.type];
  const msgs = E.takeMessages();
  const lvl = msgs.find(m => m.kind === 'levelup');
  const pace = entry.params.distance > 0 && entry.params.duration > 0 ? entry.params.duration / entry.params.distance : null;
  modal(`
    <div class="win-title"><span class="badge-i">!</span><span class="en">${entry.questId ? 'QUEST COMPLETE' : 'ACTIVITY LOGGED'}</span></div>
    ${lvl ? `<div class="lvlup en">LEVEL UP!</div><p class="center">רמה <b>${lvl.level}</b> · דרגה <span class="rank">${lvl.rank}</span></p>` : ''}
    <div class="xp-pop en">+${entry.xp + (clear?.bonusXP || 0)} EXP</div>
    ${clear?.cleared ? '<p class="center cleared">כל המשימות היומיות הושלמו! +50 בונוס</p>' : ''}
    <p class="center">${A.icon} ${A.he} · <span class="muted small">${entry.source !== 'manual' ? esc(entry.source) + ' · ' : ''}${entry.date}</span></p>
    ${pace ? `<p class="center small">קצב: <b class="en">${Math.floor(pace)}:${String(Math.round(pace % 1 * 60)).padStart(2, '0')}</b> דק׳/ק״מ</p>` : ''}
    <p class="small muted">המנה שלך: <b>${entry.dose.toFixed(2)}</b> × אימון סטנדרטי (${esc(entry.doseParts)})</p>
    ${entry.details.map(d => {
      const S = STATS[d.k];
      return `<div class="gain-row">
        <div class="head"><span>${S.icon} <b>${S.he}</b> <span class="en small muted">${d.k}</span></span><span class="d good">+${d.delta.toFixed(3)}%</span></div>
        <div class="calc">
          <ol>
            <li>${S.basis}</li>
            <li>במיקום שלך על העקומה (${(clamp(d.progress, 0, 1) * 100).toFixed(0)}% מהתקרה), אימון סטנדרטי (${S.std}) שווה עכשיו <b>+${d.perStd.toFixed(3)}%</b>.</li>
            <li>משקל ההשפעה של ${A.he} על ${S.he}: <b>×${d.weight}</b>${d.repeat ? ' · גירוי חוזר באותו יום: <b>×0.5</b>' : ''} → מנה אפקטיבית ${d.dose.toFixed(2)}.</li>
            <li>תוצאה: <b class="good">+${d.delta.toFixed(3)}%</b> → סה״כ ${E.statValue(d.k).toFixed(1)} (${sgn(E.statGain(d.k), 2)}% מההתחלה).</li>
          </ol>
        </div>
      </div>`;
    }).join('')}
    ${A.note ? `<p class="small muted">${A.note}</p>` : ''}
    <p class="small muted">⚠️ אלו הערכות לפי ממוצעים במחקרים; התגובה האישית משתנה מאוד בין אנשים. מבחני הכושר התקופתיים מכיילים את המספרים לפי המציאות שלך.</p>
    <button class="btn block" id="ok">המשך</button>
  `, m => { m.querySelector('#ok').onclick = closeModal; });
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
      closeModal(); render();
      toast(`נשמר ✓ ${xp ? `+${xp} EXP` : ''}${clear?.cleared ? ' · משימה יומית הושלמה! +50' : ''}`);
      flushLevelUp();
    };
  });
}

function flushLevelUp() {
  const msgs = E.takeMessages();
  const l = msgs.filter(m => m.kind === 'levelup').pop();
  if (l) setTimeout(() => modal(`<div class="lvlup en" style="margin-top:20px">LEVEL UP!</div><p class="center">רמה <b>${l.level}</b> · דרגה <span class="rank">${l.rank}</span></p><button class="btn block" id="ok">המשך</button>`, m => m.querySelector('#ok').onclick = closeModal), 300);
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
  `, m => {
    m.querySelector('#tf').onsubmit = e => {
      e.preventDefault();
      const v = key === 'sitreach' ? readSitReach(m) : num(new FormData(e.target).get('v'));
      if (!Number.isFinite(v)) return toast(key === 'sitreach' ? 'בחרו לאן הגעתם' : 'הזינו מספר');
      if (key === 'sprint' && v <= 0) return toast('זמן לא תקין');
      const r = E.recordTest(key, v, { date });
      if (q) E.completeQuest(date, q.id, null);
      closeModal(); render();
      showTestResult(r);
    };
    if (key === 'sitreach') bindSitReach(m);
    const a = m.querySelector('#altVo2');
    if (a) a.onclick = () => testForm('vo2', date, q);
  });
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
    <p class="center">${esc(T.he)}: <b>${tv(r.key, r.value)}</b></p>
    ${r.baseline ? `<p class="center muted small">נקבעה נקודת התחלה. המבחן הבא בעוד שבועיים יראה כמה באמת השתפרת.</p>` :
      `<div class="tiles">
        <div class="tile"><div class="t">המודל חזה</div><div class="n">${sgn(r.modelGain, 1)}%</div></div>
        <div class="tile"><div class="t">נמדד בפועל</div><div class="n ${r.measuredGain >= 0 ? 'good' : 'bad'}">${sgn(r.measuredGain, 1)}%</div></div>
        <div class="tile"><div class="t">${S.he} עכשיו</div><div class="n" style="color:${S.color}">${E.statValue(r.stat).toFixed(1)}</div></div>
      </div>
      <p class="small muted">${r.stat === 'MND' ? 'במצב נפשי — שילוב 50/50 בין המודל לשאלון (כי שאלונים רועשים יותר).' : 'במדדים פיזיים — המדידה האמיתית גוברת על המודל.'} ${r.measuredGain > r.modelGain + 2 ? 'הגבת לאימון מעל הממוצע 💪' : r.measuredGain < r.modelGain - 2 ? 'התקדמות מתחת לממוצע — בדקו שינה, תזונה ועקביות. זה נורמלי לגמרי; התגובה לאימון שונה מאוד בין אנשים.' : ''}</p>`}
    <button class="btn block" id="ok">המשך</button>
  `, m => { m.querySelector('#ok').onclick = closeModal; });
}

function stepsForm(date, q) {
  const cur = E.state.health[date]?.steps ?? '';
  modal(`
    <div class="win-title"><span class="badge-i">👣</span><span>צעדים</span></div>
    <p class="small muted">הדרך הקלה: כפתור "סנכרון מ-Apple Health". או הזנה ידנית מאפליקציית Health.</p>
    <form id="sf"><label class="f">צעדים היום</label><input type="number" name="s" inputmode="numeric" value="${cur}" required>
    <button class="btn block" style="margin-top:14px">שמירה ✔</button></form>
    <button class="btn ghost block" id="sync" style="margin-top:8px">⟳ סנכרון מהלוח</button>
  `, m => {
    m.querySelector('#sf').onsubmit = e => {
      e.preventDefault();
      const s = Number(new FormData(e.target).get('s'));
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

  ${win('FITNESS TESTS', `
    <p class="small muted">מבחנים כל שבועיים מכיילים את המודל לפי מה שקורה אצלך באמת.</p>
    ${Object.entries(TESTS).map(([k, T]) => {
      const bl = S.baselines[k], lt = E.lastTest(k);
      let ch = '';
      if (bl && lt && lt.date !== bl.date) { const r = (T.toIndex(lt.value) / T.toIndex(bl.value) - 1) * 100; ch = `<span class="${r >= 0 ? 'good' : 'bad'}">${sgn(r, 1)}%</span>`; }
      return `<button class="quest" data-test="${k}"><span><div class="qt">${STATS[T.stat].icon} ${esc(T.he)}</div><div class="qd">${bl ? `התחלה: ${tv(k, bl.value)} · אחרון: ${tv(k, lt.value)} (${lt.date}) ${ch}` : 'טרם נמדד'}</div></span><span class="check">＋</span></button>`;
    }).join('')}
  `, { icon: '⚖' })}

  ${win('HEALTH SYNC', healthSyncHTML(), { icon: '♥' })}
  `;
  $('#ci').onclick = () => checkinForm(t, E.questsFor(t).items.find(q => q.kind === 'checkin' && !q.done));
  $('#w5').onclick = () => who5Form(t, E.questsFor(t).items.find(q => q.kind === 'who5' && !q.done));
  app.querySelectorAll('[data-test]').forEach(b => b.onclick = () => {
    const k = b.dataset.test;
    testForm(k, t, E.questsFor(t).items.find(q => q.kind === 'test:' + k && !q.done));
  });
  bindHealthSync();
}

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
      <div class="row between"><span>${ACTIVITIES[e.type].icon} <b>${ACTIVITIES[e.type].he}</b></span><span class="small muted en">${e.date}</span></div>
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
  <p class="small muted center en">ASCEND v1.0</p>
  `;
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    Object.assign(E.state.profile, { name: f.get('name') || P.name, age: +f.get('age') || P.age, weightKg: num(f.get('weightKg')) || P.weightKg, equipment: f.get('equipment'), daysPerWeek: +f.get('daysPerWeek') });
    E.save(); toast('נשמר ✓');
  };
  $('#exp').onclick = async () => {
    const blob = new Blob([JSON.stringify(E.state)], { type: 'application/json' });
    const file = new File([blob], `ascend-backup-${E.today()}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'ASCEND backup' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  };
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (!s.stats || !s.profile) throw new Error('קובץ לא תקין');
      if (!confirm('לשחזר מהגיבוי? הנתונים הנוכחיים יוחלפו.')) return;
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
  if (document.visibilityState === 'visible' && E.state) { if (E.state.lastDecay !== E.today()) dailyTick(); render(); }
});
boot();

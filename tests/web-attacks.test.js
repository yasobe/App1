// מתקפות ווב על האפליקציה. מחזיר מה הצליח.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const DIR = require('os').tmpdir() + '/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13 Pro'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => { dialogs.push(d.message().slice(0, 60)); d.accept(); });
  const dialogs = [];
  await p.addInitScript(() => { window.__pwned = []; });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
  await p.fill('input[name=name]', 'T'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  const out = {};

  // 1) XSS דרך קובץ גיבוי זדוני ("תראה את ההתקדמות שלי")
  const evil = await p.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ascend.v1'));
    const X = '<img src=x onerror="window.__pwned.push(1)">';
    s.profile.name = 'Bob' + X;
    s.profile.age = '25"><img src=x onerror="window.__pwned.push(2)">';
    s.habits = [{ id: 'H1', key: 'custom', name: 'ok' + X, icon: X, active: true, createdAt: '2026-11-01' }];
    s.log = [{ id: 'L1', date: '2026-11-05' + X, type: 'run', params: { duration: '30' + X }, dose: 1, doseParts: X, gains: {}, details: [], xp: 1, source: 'manual' + X, at: Date.now() }];
    s.tests = [{ key: 'pushups', value: '10' + X, date: '2026-11-01' + X, at: 1 }];
    s.baselines = { pushups: { value: '10' + X, date: X, abs: 0 } };
    s.flags = { tampered: X };
    return JSON.stringify(s);
  });
  fs.writeFileSync(DIR + 'evil-backup.json', evil);
  await p.click('[data-tab=system]');
  await p.setInputFiles('#imp', DIR + 'evil-backup.json'); await p.waitForTimeout(500);
  for (const t of ['status', 'quests', 'measure', 'log', 'system', 'status']) { await p.click(`[data-tab=${t}]`, { timeout: 2000 }).catch(() => {}); await p.waitForTimeout(300); }
  await p.click('[data-l]', { timeout: 2000 }).catch(() => {}); await p.waitForTimeout(300);
  out.xssBackup = await p.evaluate(() => window.__pwned.length ? 'PWNED ' + window.__pwned.join(',') : 'blocked');

  // 2) Prototype pollution דרך קובץ ייצוא Health זדוני
  const xml = `<?xml version="1.0"?>\n<HealthData>\n <Record type="HKQuantityTypeIdentifierStepCount" sourceName="x" startDate="__proto__" value="31337"/>\n <Workout workoutActivityType="HKWorkoutActivityType__proto__" duration="30" durationUnit="min" startDate="2099-01-01 06:00:00 +0200"/>\n</HealthData>\n`;
  fs.writeFileSync(DIR + 'evil.xml', xml);
  await p.evaluate(() => { localStorage.clear(); });
  await p.goto('http://localhost:8765/'); await p.waitForTimeout(400);
  await p.fill('input[name=name]', 'T'); await p.click('button[type=submit]'); await p.waitForTimeout(300);
  await p.click('[data-tab=measure]');
  await p.setInputFiles('#hfile', DIR + 'evil.xml'); await p.waitForTimeout(800);
  out.protoPollution = await p.evaluate(() => (({}).steps !== undefined || ({}).x !== undefined) ? 'POLLUTED' : 'clean');
  out.importMsg = (await p.textContent('#hprog')).slice(0, 80);

  // 3) קישור זדוני שמזריק נתונים (#sync)
  await p.goto('http://localhost:8765/#sync?steps=69999&sleep=0.5'); await p.waitForTimeout(800);
  out.hashSync = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('ascend.v1')); const h = Object.values(s.health)[0]; return h ? 'applied without asking: ' + JSON.stringify(h) : 'not applied'; });

  // 4) Clickjacking: האם אפשר להטמיע ב-iframe
  const page2 = await ctx.newPage();
  await page2.goto('http://localhost:8765/manifest.webmanifest');
  await page2.setContent('<iframe id=f src="http://localhost:8765/" style="width:390px;height:700px"></iframe>');
  await page2.waitForTimeout(1200);
  const fr = page2.frames().find(f => f.url().startsWith('http://localhost:8765/') && f !== page2.mainFrame());
  out.framed = fr ? ((await fr.evaluate(() => document.querySelector('#app')?.innerHTML.length || 0)) > 50 ? 'app renders inside iframe' : 'blocked: ' + (await fr.evaluate(() => document.body.innerText)).slice(0, 40)) : 'no frame';

  // 5) CSP
  out.csp = await p.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || 'none');

  // 6) קובץ ענק בלי שורות (ניצול זיכרון)
  // 6) CSP חוסם הרצת קוד מוזרק גם אם יש חור בהסלמה
  out.cspBlocksInjected = await p.evaluate(async () => { const d = document.createElement('div'); d.innerHTML = '<img src=x onerror="window.__pwned.push(99)">'; document.body.appendChild(d); await new Promise(r => setTimeout(r, 300)); return window.__pwned.includes(99) ? 'EXECUTED' : 'blocked by CSP'; });
  out.dialogs = dialogs;
  console.log(JSON.stringify(out, null, 1));
  console.log('page errors:', errs.slice(0, 3).join(' | ') || 'none');
  await b.close();
})();

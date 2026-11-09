import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:4200';
const NID = '000000015';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 300)));
const r1 = await (await ctx.request.post(`${BASE}/api/auth/login/request-otp`, { data: { nationalId: NID } })).json();
const r2 = await (await ctx.request.post(`${BASE}/api/auth/login/verify-otp`, { data: { nationalId: NID, otp: r1.data.demoOtp } })).json();
await page.goto(`${BASE}/login`);
await page.evaluate(([k, a]) => { localStorage.setItem(k.t, a.token); localStorage.setItem(k.u, JSON.stringify(a)); }, [{ t: process.env.TK, u: process.env.UK }, r2.data]);
const t0 = Date.now();
await page.goto(`${BASE}/admin/workflow`, { waitUntil: 'domcontentloaded' });
// responsiveness probe: does the main thread keep ticking?
const alive = await Promise.race([
  page.evaluate(() => new Promise(r => setTimeout(() => r(true), 50))),
  new Promise(r => setTimeout(() => r(false), 15000)),
]);
console.log('main thread responsive:', alive, 'after', Date.now() - t0, 'ms');
const SHOTS = process.env.SHOTDIR || '.';
const probe = async (what) => {
  const ok = await Promise.race([page.evaluate(() => new Promise(r => setTimeout(() => r(true), 50))), new Promise(r => setTimeout(() => r(false), 8000))]);
  console.log(ok ? 'ok     ' : 'HUNG   ', what);
  if (!ok) { await browser.close(); process.exit(2); }
};
if (alive) {
  await page.waitForSelector('.wf-svg', { timeout: 10000 }).catch(() => console.log('no .wf-svg'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/a-rest.png` });
  await page.locator('.wf-node').filter({ hasText: 'Under Review' }).first().click(); await probe('click status');
  await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/b-status.png` });
  await page.locator('.wf-label:not(.floating)').first().click(); await probe('click edge label');
  for (const t of ['Stages', 'Queues', 'Simulate', 'Problems', 'Selected']) { await page.locator('.wf-tabs button', { hasText: t }).click(); await probe('tab ' + t); }
  await page.locator('.wf-track', { hasText: 'Disbursement' }).click(); await probe('switch track');
  await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/c-disb.png` });
  await page.locator('.wf-track', { hasText: 'Application' }).click();
  await page.getByRole('button', { name: /Edit as new draft/ }).click(); await page.waitForTimeout(800); await probe('new draft');
  await page.getByRole('button', { name: /Add status/i }).click(); await probe('add status');
  const n = page.locator('.wf-node').filter({ hasText: 'New status' }).first();
  const box = await n.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + 300, box.y + 120, { steps: 8 }); await page.mouse.up(); await probe('drag status');
  await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/d-draft.png` });
}
await browser.close();

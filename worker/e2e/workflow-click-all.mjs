import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:4200';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', String(e).slice(0, 200)));
const r1 = await (await ctx.request.post(`${BASE}/api/auth/login/request-otp`, { data: { nationalId: '000000015' } })).json();
const r2 = await (await ctx.request.post(`${BASE}/api/auth/login/verify-otp`, { data: { nationalId: '000000015', otp: r1.data.demoOtp } })).json();
await page.goto(`${BASE}/login`);
await page.evaluate(a => { localStorage.setItem('db_token', a.token); localStorage.setItem('db_user', JSON.stringify(a)); }, r2.data);
await page.goto(`${BASE}/admin/workflow`);
await page.waitForSelector('.wf-svg');
const probe = async (what) => {
  const ok = await Promise.race([page.evaluate(() => new Promise(r => setTimeout(() => r(true), 50))), new Promise(r => setTimeout(() => r(false), 6000))]);
  if (!ok) { console.log('HUNG after', what); await browser.close(); process.exit(2); }
};
async function sweep(tag) {
  for (const track of ['Application', 'Disbursement']) {
    await page.locator('.wf-track', { hasText: track }).click(); await page.waitForTimeout(400);
    const n = await page.locator('.wf-edge-hit').count();
    for (let i = 0; i < n; i++) { console.log('clicking edge', i, 'last selected:', await page.locator('.wf-panel input.db-input').first().inputValue().catch(() => '-')); await page.locator('.wf-edge-hit').nth(i).dispatchEvent('click'); await probe(`${tag} ${track} edge ${i}`); }
    const chips = await page.locator('.wf-hint .wf-chip').count();
    for (let i = 0; i < chips; i++) { await page.locator('.wf-hint .wf-chip').nth(i).click(); await probe(`${tag} ${track} chip ${i}`); }
    const nodes = await page.locator('.wf-node').count();
    for (let i = 0; i < nodes; i++) { await page.locator('.wf-node').nth(i).click(); await probe(`${tag} ${track} node ${i}`); }
    console.log('ok', tag, track, { edges: n, chips, nodes });
  }
}
await sweep('readonly');
const btn = page.getByRole('button', { name: /Edit as new draft/ });
if (await btn.count()) { await btn.click(); await page.waitForTimeout(900); await sweep('draft'); }
await browser.close();

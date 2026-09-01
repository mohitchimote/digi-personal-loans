import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const pendingRequests = new Map();
let reqCounter = 0;
page.on('console', (m) => { if (m.type() === 'error') console.log('[console-error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
page.on('request', (req) => {
  if (req.url().includes('/api/')) {
    const id = ++reqCounter;
    pendingRequests.set(req, { id, url: req.url(), start: Date.now() });
  }
});
page.on('requestfinished', (req) => {
  const info = pendingRequests.get(req);
  if (info) { console.log(`[req#${info.id}] OK ${Date.now() - info.start}ms ${info.url}`); pendingRequests.delete(req); }
});
page.on('requestfailed', (req) => {
  const info = pendingRequests.get(req);
  console.log(`[req#${info?.id}] FAILED ${info ? Date.now() - info.start : '?'}ms: ${req.failure()?.errorText} ${info?.url}`);
  pendingRequests.delete(req);
});

function nid(prefix) { return prefix + String(Math.floor(10000000 + Math.random() * 89999999)); }
const myNid = nid('6');
const email = `realuser.${Date.now()}@example.com`;

console.log('=== ONE real page load: /register ===');
await page.goto(`${BASE}/register`, { waitUntil: 'load' });
await page.fill('input[formcontrolname="fullName"]', 'Real User Flow');
await page.fill('input[formcontrolname="email"]', email);
await page.fill('input[formcontrolname="nationalId"]', myNid);
await page.fill('input[formcontrolname="idIssueDate"]', '2018-01-01');
await page.check('input[formcontrolname="agreeTerms"]');
await page.click('button[type="submit"]');
await page.waitForURL('**/register/verify-otp', { timeout: 15000 });
const otp = (await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 })).trim();
await page.fill('input[placeholder="123456"]', otp);
await page.click('button:has-text("Verify")');
await page.waitForURL('**/intro', { timeout: 15000 });
console.log('registered+verified, url=', page.url());

console.log('=== click through UI to dashboard (no goto) ===');
const continueBtn = page.locator('button, a').filter({ hasText: /continue|dashboard|get started/i }).first();
if (await continueBtn.count() > 0) {
  await continueBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
}
if (!page.url().includes('/portal/dashboard')) {
  await page.click('a[routerLink*="dashboard"], a:has-text("Dashboard")', { timeout: 5000 }).catch(async () => {
    await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'load' });
  });
}
console.log('url=', page.url());

console.log('=== click Start/Resume Application button ===');
const startBtn = page.locator('button:has-text("Start"), button:has-text("Resume")').first();
await startBtn.click({ timeout: 10000 });
await page.waitForURL('**/portal/apply/**', { timeout: 15000 });
console.log('url=', page.url());

console.log('=== fill loan requirements via UI, submit ===');
await page.waitForTimeout(800);
try {
  await page.fill('input[formcontrolname="loanAmount"]', '20000', { timeout: 8000 });
} catch (e) {
  console.log('FORM DID NOT RENDER:', e.message);
  console.log('--- visible text on page ---');
  console.log((await page.locator('body').innerText()).slice(0, 1000));
  await browser.close();
  process.exit(1);
}
await page.selectOption('select[formcontrolname="loanPurpose"]', { index: 1 });
await page.fill('input[formcontrolname="loanTerm"]', '36');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal/apply/personal-details', { timeout: 15000 });
console.log('url=', page.url());

console.log('=== click sidebar link back to loan-requirements (SPA nav, no goto) ===');
const t0 = Date.now();
await page.click('a[routerLink*="loan-requirements"]', { timeout: 10000 }).catch(e => console.log('click failed:', e.message));

console.log('=== watch pending requests for 15s ===');
for (let i = 0; i < 15; i++) {
  await page.waitForTimeout(1000);
  const pending = [...pendingRequests.values()].map((info) => `req#${info.id} ${info.url} (${Date.now() - info.start}ms)`);
  console.log(`t+${i + 1}s url=${page.url()} pending=[${pending.join(', ')}]`);
}

console.log(`\nSidebar nav round-trip observed at t0+${Date.now() - t0}ms mark (see above for actual completion)`);
await browser.close();

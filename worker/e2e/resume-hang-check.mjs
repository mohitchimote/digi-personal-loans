import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const disableQuic = process.env.DISABLE_QUIC === '1';
const disableHttp2 = process.env.DISABLE_HTTP2 === '1';
console.log(`DISABLE_QUIC=${disableQuic ? '1' : '0'} DISABLE_HTTP2=${disableHttp2 ? '1' : '0'}`);
const chromeArgs = [];
if (disableQuic) chromeArgs.push('--disable-quic');
if (disableHttp2) chromeArgs.push('--disable-http2');
const browser = await chromium.launch({ args: chromeArgs });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const consoleErrors = [];
const pendingRequests = new Map(); // keyed by request object identity, not URL — a same-URL retry must show as a separate entry
let reqCounter = 0;
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e)));
page.on('request', (req) => {
  if (req.url().includes('/api/')) {
    const id = ++reqCounter;
    pendingRequests.set(req, { id, url: req.url(), start: Date.now() });
    console.log(`[req#${id}] STARTED ${req.url()}`);
  }
});
page.on('requestfinished', (req) => {
  const info = pendingRequests.get(req);
  if (info) { console.log(`[req#${info.id}] FINISHED after ${Date.now() - info.start}ms status=${req.response()?.then ? '?' : ''}`); pendingRequests.delete(req); }
});
page.on('requestfailed', (req) => {
  const info = pendingRequests.get(req);
  console.log(`[req#${info?.id}] FAILED after ${info ? Date.now() - info.start : '?'}ms: ${req.failure()?.errorText}`);
  pendingRequests.delete(req);
});

function nid(prefix) { return prefix + String(Math.floor(10000000 + Math.random() * 89999999)); }
const myNid = nid('6');
const email = `resumehang.${Date.now()}@example.com`;

console.log('=== 1) register + verify (fresh customer) ===');
await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
await page.fill('input[formcontrolname="fullName"]', 'Resume Hang Test');
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
console.log('URL after verify:', page.url());

console.log('=== 2) go straight to dashboard, save loanRequirements via UI to park at personalDetails ===');
await page.goto(`${BASE}/portal/apply/loan-requirements`, { waitUntil: 'networkidle', timeout: 15000 });
console.log('URL:', page.url());
await page.fill('input[formcontrolname="loanAmount"]', '20000');
await page.selectOption('select[formcontrolname="loanPurpose"]', { index: 1 });
await page.fill('input[formcontrolname="loanTerm"]', '36');
await page.click('button[type="submit"]');
await page.waitForURL('**/portal/apply/personal-details', { timeout: 15000 });
console.log('URL after step1 save:', page.url());

console.log('=== 3) log out ===');
await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForTimeout(1000);
const signOut = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out")').first();
if (await signOut.count() > 0) {
  await signOut.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1000);
}
console.log('URL after sign out:', page.url());

console.log('=== 4) log back in as the SAME customer ===');
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
await page.fill('input[formcontrolname="nationalId"]', myNid);
await page.click('button[type="submit"]');
await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
const otp2 = (await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 })).trim();
await page.fill('input[placeholder="123456"]', otp2);
await page.click('button:has-text("Verify")');
await page.waitForURL('**/portal/**', { timeout: 15000 });
console.log('URL after re-login:', page.url());

console.log('=== 5) on dashboard, find and click the actual Resume link ===');
await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1000);
const resumeLink = page.locator('a:has-text("Resume")').first();
const resumeCount = await resumeLink.count();
console.log('Resume link found:', resumeCount > 0, 'href target will be computed client-side');

const before = Date.now();
if (resumeCount > 0) {
  await resumeLink.click({ timeout: 10000 }).catch((e) => console.log('CLICK FAILED:', e.message));
} else {
  console.log('No Resume link visible — dumping visible button/link text:');
  const texts = await page.locator('a, button').allTextContents();
  console.log(texts.filter(t => t.trim()).join(' | '));
}

console.log('=== 6) watch URL + pending requests for 15s after click ===');
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const pending = [...pendingRequests.values()].map((info) => `req#${info.id} ${info.url} (${Date.now() - info.start}ms)`);
  console.log(`t+${i + 1}s url=${page.url()} pending=[${pending.join(', ')}]`);
}

console.log('\n--- console errors ---');
console.log(consoleErrors.length === 0 ? 'none' : consoleErrors.join('\n'));

await browser.close();

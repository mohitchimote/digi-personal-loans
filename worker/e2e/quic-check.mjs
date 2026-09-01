import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const disableQuic = process.env.DISABLE_QUIC === '1';

const browser = await chromium.launch({
  args: disableQuic ? ['--disable-quic'] : [],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

const pendingRequests = new Map();
let reqCounter = 0;
page.on('request', (req) => {
  if (req.url().includes('/api/')) {
    const id = ++reqCounter;
    pendingRequests.set(req, { id, url: req.url(), start: Date.now() });
    console.log(`[req#${id}] STARTED ${req.url()}`);
  }
});
page.on('requestfinished', (req) => {
  const info = pendingRequests.get(req);
  if (info) { console.log(`[req#${info.id}] FINISHED after ${Date.now() - info.start}ms`); pendingRequests.delete(req); }
});
page.on('requestfailed', (req) => {
  const info = pendingRequests.get(req);
  console.log(`[req#${info?.id}] FAILED after ${info ? Date.now() - info.start : '?'}ms: ${req.failure()?.errorText}`);
  pendingRequests.delete(req);
});

function nid(prefix) { return prefix + String(Math.floor(10000000 + Math.random() * 89999999)); }
const myNid = nid('6');
const email = `quiccheck.${Date.now()}@example.com`;

console.log(`=== DISABLE_QUIC=${disableQuic ? '1' : '0'} ===`);
console.log('=== register + verify ===');
await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
await page.fill('input[formcontrolname="fullName"]', 'Quic Check Test');
await page.fill('input[formcontrolname="email"]', email);
await page.fill('input[formcontrolname="nationalId"]', myNid);
await page.fill('input[formcontrolname="idIssueDate"]', '2018-01-01');
await page.check('input[formcontrolname="agreeTerms"]');
const t0 = Date.now();
await page.click('button[type="submit"]');
await page.waitForURL('**/register/verify-otp', { timeout: 30000 });
console.log(`Reached verify-otp after ${Date.now() - t0}ms`);

console.log('=== watch pending for 20s ===');
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const pending = [...pendingRequests.values()].map((info) => `req#${info.id} ${info.url} (${Date.now() - info.start}ms)`);
  console.log(`t+${i + 1}s pending=[${pending.join(', ')}]`);
}

await browser.close();

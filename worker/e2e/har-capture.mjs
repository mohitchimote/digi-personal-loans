import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const harPath = 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\capture.har';

const browser = await chromium.launch();
const context = await browser.newContext({ recordHar: { path: harPath, content: 'omit' } });
const page = await context.newPage();

function nid(prefix) { return prefix + String(Math.floor(10000000 + Math.random() * 89999999)); }
const myNid = nid('6');
const email = `harcap.${Date.now()}@example.com`;

try {
  await page.goto(`${BASE}/register`, { waitUntil: 'load' });
  await page.fill('input[formcontrolname="fullName"]', 'Har Cap');
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

  await page.goto(`${BASE}/portal/apply/loan-requirements`, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.fill('input[formcontrolname="loanAmount"]', '20000');
  await page.selectOption('select[formcontrolname="loanPurpose"]', { index: 1 });
  await page.fill('input[formcontrolname="loanTerm"]', '36');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/portal/apply/personal-details', { timeout: 15000 });

  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'load', timeout: 15000 });
  const signOut = page.locator('button:has-text("Sign Out"), a:has-text("Sign Out")').first();
  if (await signOut.count() > 0) { await signOut.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(1000); }

  await page.goto(`${BASE}/login`, { waitUntil: 'load', timeout: 15000 });
  await page.fill('input[formcontrolname="nationalId"]', myNid);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
  const otp2 = (await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 })).trim();
  await page.fill('input[placeholder="123456"]', otp2);
  await page.click('button:has-text("Verify")');
  await page.waitForURL('**/portal/**', { timeout: 15000 });

  await page.goto(`${BASE}/portal/dashboard`, { waitUntil: 'load', timeout: 15000 });
  await page.waitForTimeout(1000);
  const resumeLink = page.locator('a:has-text("Resume")').first();
  if (await resumeLink.count() > 0) {
    await resumeLink.click({ timeout: 10000 }).catch(() => {});
  }
  console.log('waiting 15s to let the hang manifest for the HAR capture...');
  await page.waitForTimeout(15000);
} catch (e) {
  console.log('flow error (expected if hang reproduces):', e.message);
} finally {
  await context.close();
  await browser.close();
}

console.log('HAR saved to', harPath);
const har = JSON.parse(fs.readFileSync(harPath, 'utf-8'));
const currentEntries = har.log.entries.filter(e => e.request.url.includes('/current'));
console.log(`Found ${currentEntries.length} "/current" entries`);
for (const e of currentEntries) {
  console.log('---');
  console.log('url:', e.request.url);
  console.log('startedDateTime:', e.startedDateTime);
  console.log('time (total ms):', e.time);
  console.log('timings:', JSON.stringify(e.timings));
  console.log('serverIPAddress:', e.serverIPAddress);
  console.log('connection:', e.connection);
  console.log('response.status:', e.response?.status);
  console.log('_error:', e._error);
}

// Automated evaluation of the live Cloudflare Workers deployment using a real headless
// Chromium browser (Playwright) — independent of the Claude-in-Chrome extension. Drives actual
// DOM interactions (form fills, clicks, navigation) rather than API calls, so this catches
// rendering bugs, console errors, and JS runtime failures that curl-based testing cannot.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'https://digibank-personal-loans.mohit-chimote.workers.dev';
const SHOT_DIR = './screenshots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const allConsoleErrors = [];
const allFailedRequests = [];

function record(scenario, status, detail) {
  results.push({ scenario, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
  console.log(`${icon} [${scenario}] ${detail}`);
}

async function withPage(browser, name, fn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // The browser logs this generic message for *any* non-2xx resource load, including the
      // expected "no current application yet" 400 filtered above — can't correlate it back to a
      // URL from the message text alone, so match on the message itself as a pragmatic tradeoff.
      const isExpectedNoise = /Failed to load resource.*status of 400/.test(text);
      if (!isExpectedNoise) {
        pageErrors.push(text);
        allConsoleErrors.push({ scenario: name, text });
      }
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
    allConsoleErrors.push({ scenario: name, text: String(err) });
  });
  page.on('requestfailed', (req) => {
    allFailedRequests.push({ scenario: name, url: req.url(), failure: req.failure()?.errorText });
  });
  page.on('response', (res) => {
    // GET .../customer/:id/current legitimately 400s for a customer with no application yet —
    // ApplicationService.resolveEditable() expects this and falls back to creating a fresh
    // draft (see application.service.ts). Same design as the original Java backend it replaced;
    // not a regression, so don't let it drown out real failures in the report.
    const isExpectedNoCurrentApplication = /\/api\/applications\/customer\/\d+\/current$/.test(res.url()) && res.status() === 400;
    if (res.url().includes('/api/') && res.status() >= 400 && !isExpectedNoCurrentApplication) {
      allFailedRequests.push({ scenario: name, url: res.url(), status: res.status() });
    }
  });
  try {
    await fn(page);
  } finally {
    await context.close();
  }
  return pageErrors;
}

function uniqueNationalId(prefix) {
  // Must be exactly 9 digits (\d{9} server + client validation) — prefix (1 digit) + 8 more.
  return prefix + String(Math.floor(10000000 + Math.random() * 89999999));
}

async function shot(page, name) {
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true }).catch(() => {});
}

const browser = await chromium.launch();

// ---------------------------------------------------------------------------------------------
// Scenario 1: Personal customer registration -> OTP (read from DOM) -> land on portal
// ---------------------------------------------------------------------------------------------
let personalNationalId = uniqueNationalId('7');
try {
  const errs = await withPage(browser, 'personal-register', async (page) => {
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
    await shot(page, '01-register-page');

    await page.fill('input[formcontrolname="fullName"]', 'Automated Test User');
    await page.fill('input[formcontrolname="email"]', `autotest.${Date.now()}@example.com`);
    await page.fill('input[formcontrolname="phoneNumber"]', '0501234567');
    await page.fill('input[formcontrolname="nationalId"]', personalNationalId);
    await page.fill('input[formcontrolname="idIssueDate"]', '2018-01-01');
    await page.check('input[formcontrolname="agreeTerms"]');
    await shot(page, '02-register-filled');

    await page.click('button[type="submit"]');
    await page.waitForURL('**/register/verify-otp', { timeout: 15000 });
    await shot(page, '03-otp-page');

    const otpText = await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 });
    const otp = (otpText || '').trim();
    if (!/^\d{6}$/.test(otp)) throw new Error(`Could not read a 6-digit demo OTP from the page (got "${otp}")`);

    await page.fill('input[placeholder="123456"]', otp);
    await page.click('button:has-text("Verify")');
    // First-time registration lands on /intro (journey explainer), not /portal directly —
    // that's intentional product behavior, distinct from the returning-customer login flow.
    await page.waitForURL('**/intro', { timeout: 15000 });
    await shot(page, '04-intro-landed');
  });
  record('personal-register', errs.length ? 'WARN' : 'PASS', errs.length ? `landed on /intro but ${errs.length} console error(s)` : 'registered, read OTP from DOM, verified, landed on /intro as expected');
} catch (e) {
  record('personal-register', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 2: Loan Requirements wizard step — real form fill and save
// ---------------------------------------------------------------------------------------------
try {
  const errs = await withPage(browser, 'wizard-loan-requirements', async (page) => {
    // Fresh login as the customer just registered (session storage doesn't carry across contexts)
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[formcontrolname="nationalId"]', personalNationalId);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
    const otpText = await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 });
    await page.fill('input[placeholder="123456"]', (otpText || '').trim());
    await page.click('button:has-text("Verify")');
    await page.waitForURL('**/portal/**', { timeout: 15000 });

    await page.goto(`${BASE}/portal/apply/loan-requirements`, { waitUntil: 'networkidle' });
    await shot(page, '05-loan-requirements');

    const heading = await page.locator('.section-title').first().textContent();
    if (!heading || heading.trim().length === 0) throw new Error('Loan Requirements heading did not render');

    await page.fill('input[formcontrolname="loanAmount"]', '20000');
    await page.selectOption('select[formcontrolname="loanPurpose"]', { index: 1 });
    await page.fill('input[formcontrolname="loanTerm"]', '36');
    await shot(page, '06-loan-requirements-filled');

    await page.click('button[type="submit"]');
    await page.waitForURL('**/portal/apply/personal-details', { timeout: 15000 });
    await shot(page, '07-advanced-to-personal-details');
  });
  record('wizard-loan-requirements', errs.length ? 'WARN' : 'PASS', errs.length ? `saved and advanced but ${errs.length} console error(s)` : 'real form fill saved via PUT /section, correctly advanced to next step');
} catch (e) {
  record('wizard-loan-requirements', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 3: Business registration
// ---------------------------------------------------------------------------------------------
try {
  const errs = await withPage(browser, 'business-register', async (page) => {
    await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Business")');
    await shot(page, '08-business-register-toggle');

    await page.fill('input[formcontrolname="companyName"]', 'Automated Test Co');
    await page.fill('input[formcontrolname="companyRegistrationNumber"]', '515' + Math.floor(100000 + Math.random() * 899999));
    await page.fill('input[formcontrolname="companyIndustry"]', 'Technology');
    await page.fill('input[formcontrolname="companyFoundedYear"]', '2015');
    await page.fill('input[formcontrolname="fullName"]', 'Automated Business Owner');
    await page.fill('input[formcontrolname="email"]', `autobiz.${Date.now()}@example.com`);
    await page.fill('input[formcontrolname="nationalId"]', uniqueNationalId('8'));
    await page.fill('input[formcontrolname="idIssueDate"]', '2018-01-01');
    await page.check('input[formcontrolname="agreeTerms"]');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/register/verify-otp', { timeout: 15000 });
    await shot(page, '09-business-otp-page');
  });
  record('business-register', errs.length ? 'WARN' : 'PASS', errs.length ? `reached OTP page but ${errs.length} console error(s)` : 'business registration form submitted, reached OTP page');
} catch (e) {
  record('business-register', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 4: Underwriter login + pipeline
// ---------------------------------------------------------------------------------------------
try {
  const errs = await withPage(browser, 'underwriter-pipeline', async (page) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[formcontrolname="nationalId"]', '000000014');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
    const otpText = await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 });
    await page.fill('input[placeholder="123456"]', (otpText || '').trim());
    await page.click('button:has-text("Verify")');
    await page.waitForURL('**/underwriter/**', { timeout: 15000 });
    // The table only renders once the async pipeline fetch resolves (*ngIf="!loading() &&
    // filteredApplications().length > 0"), with an explicit empty-state otherwise — wait for
    // either rather than counting immediately, which would race the fetch.
    await page.waitForSelector('table.db-table tbody tr, .empty-state', { timeout: 15000 });
    await shot(page, '10-underwriter-pipeline');

    const rowCount = await page.locator('table.db-table tbody tr').count().catch(() => 0);
    if (rowCount === 0) throw new Error('Pipeline table rendered but has zero rows (API independently confirms rows exist, so this would be a real rendering bug)');
  });
  record('underwriter-pipeline', errs.length ? 'WARN' : 'PASS', errs.length ? `pipeline rendered but ${errs.length} console error(s)` : 'underwriter logged in, pipeline table rendered with rows');
} catch (e) {
  record('underwriter-pipeline', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 5: Admin login + Users/Products/FAQs pages
// ---------------------------------------------------------------------------------------------
try {
  const errs = await withPage(browser, 'admin-pages', async (page) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[formcontrolname="nationalId"]', '000000015');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
    const otpText = await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 });
    await page.fill('input[placeholder="123456"]', (otpText || '').trim());
    await page.click('button:has-text("Verify")');
    await page.waitForURL('**/admin/**', { timeout: 15000 });
    await shot(page, '11-admin-landed');

    for (const path of ['/admin/users', '/admin/products', '/admin/faqs', '/admin/rules', '/admin/mandates', '/admin/branding']) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      const bodyText = await page.locator('body').textContent();
      if (!bodyText || bodyText.trim().length < 20) throw new Error(`${path} rendered essentially empty`);
    }
    await shot(page, '12-admin-products');
  });
  record('admin-pages', errs.length ? 'WARN' : 'PASS', errs.length ? `all 6 admin pages rendered but ${errs.length} console error(s)` : 'all 6 admin pages (users/products/faqs/rules/mandates/branding) rendered with content');
} catch (e) {
  record('admin-pages', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 6: Banker login + queue
// ---------------------------------------------------------------------------------------------
try {
  const errs = await withPage(browser, 'banker-queue', async (page) => {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.fill('input[formcontrolname="nationalId"]', '000000027');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
    const otpText = await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 });
    await page.fill('input[placeholder="123456"]', (otpText || '').trim());
    await page.click('button:has-text("Verify")');
    await page.waitForURL('**/banker/**', { timeout: 15000 });
    await shot(page, '13-banker-queue');
  });
  record('banker-queue', errs.length ? 'WARN' : 'PASS', errs.length ? `banker landed but ${errs.length} console error(s)` : 'banker logged in, queue page rendered');
} catch (e) {
  record('banker-queue', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 7: Mobile viewport rendering (landing + login)
// ---------------------------------------------------------------------------------------------
try {
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOT_DIR}/14-mobile-landing.png`, fullPage: true });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOT_DIR}/15-mobile-login.png`, fullPage: true });
  // A horizontally overflowing page (wider scroll than viewport) is the most common mobile-layout
  // regression, so check for it directly rather than just "did it render something."
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
  await context.close();
  if (hasHorizontalOverflow) {
    record('mobile-viewport', 'WARN', 'page renders but has horizontal overflow at 375px width (possible layout bug)');
  } else {
    record('mobile-viewport', errs.length ? 'WARN' : 'PASS', errs.length ? `no horizontal overflow but ${errs.length} console error(s)` : 'landing + login render cleanly at 375px width, no horizontal overflow');
  }
} catch (e) {
  record('mobile-viewport', 'FAIL', String(e.message || e));
}

// ---------------------------------------------------------------------------------------------
// Scenario 8: Hebrew / RTL language switch
// ---------------------------------------------------------------------------------------------
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("עברית")');
  await page.waitForTimeout(500);
  const dir = await page.evaluate(() => document.documentElement.getAttribute('dir') || document.body.getAttribute('dir'));
  const bodyText = await page.locator('h2').first().textContent();
  await page.screenshot({ path: `${SHOT_DIR}/16-hebrew-rtl.png`, fullPage: true });
  await context.close();
  if (dir !== 'rtl') {
    record('hebrew-rtl', 'WARN', `clicked עברית but dir attribute is "${dir}", expected "rtl"`);
  } else if (!bodyText || /[a-zA-Z]{4,}/.test(bodyText)) {
    record('hebrew-rtl', 'WARN', `dir=rtl set correctly but heading text ("${bodyText}") doesn't look translated`);
  } else {
    record('hebrew-rtl', 'PASS', `dir=rtl applied, heading translated to "${bodyText}"`);
  }
} catch (e) {
  record('hebrew-rtl', 'FAIL', String(e.message || e));
}

await browser.close();

// ---------------------------------------------------------------------------------------------
console.log('\n========== SUMMARY ==========');
const pass = results.filter(r => r.status === 'PASS').length;
const warn = results.filter(r => r.status === 'WARN').length;
const fail = results.filter(r => r.status === 'FAIL').length;
console.log(`${pass} PASS, ${warn} WARN, ${fail} FAIL (of ${results.length} scenarios)`);
console.log(`Console errors captured: ${allConsoleErrors.length}`);
console.log(`Failed/4xx+ API requests: ${allFailedRequests.length}`);

fs.writeFileSync('./evaluation-report.json', JSON.stringify({ results, allConsoleErrors, allFailedRequests }, null, 2));
console.log('\nFull report written to evaluation-report.json, screenshots in ./screenshots/');

if (allConsoleErrors.length > 0) {
  console.log('\n--- Console errors ---');
  for (const e of allConsoleErrors.slice(0, 20)) console.log(`[${e.scenario}] ${e.text}`);
}
if (allFailedRequests.length > 0) {
  console.log('\n--- Failed/4xx+ API requests ---');
  for (const f of allFailedRequests.slice(0, 20)) console.log(`[${f.scenario}] ${f.url} -> ${f.status ?? f.failure}`);
}

process.exit(fail > 0 ? 1 : 0);

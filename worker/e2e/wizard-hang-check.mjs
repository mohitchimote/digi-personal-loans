// Reproduces "page isn't responding" complaints by walking the real wizard in a real browser,
// timing every navigation/interaction, and flagging anything unusually slow. A true JS hang
// shows up as a Playwright timeout on a specific step, not a vague failure.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

function nationalId(prefix) {
  return prefix + String(Math.floor(10000000 + Math.random() * 89999999));
}

async function timed(label, fn) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`${ms > 3000 ? '⚠️ SLOW' : '✅'} ${label}: ${ms}ms`);
  } catch (e) {
    console.log(`❌ HUNG/FAILED ${label} (${Date.now() - start}ms): ${e.message?.split('\n')[0]}`);
  }
}

const nid = nationalId('9');

await timed('register', async () => {
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.fill('input[formcontrolname="fullName"]', 'Wizard Hang Test');
  await page.fill('input[formcontrolname="email"]', `wizardhang.${Date.now()}@example.com`);
  await page.fill('input[formcontrolname="nationalId"]', nid);
  await page.fill('input[formcontrolname="idIssueDate"]', '2018-01-01');
  await page.check('input[formcontrolname="agreeTerms"]');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/register/verify-otp', { timeout: 10000 });
  const otp = (await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 })).trim();
  await page.fill('input[placeholder="123456"]', otp);
  await page.click('button:has-text("Verify")');
  await page.waitForURL('**/intro', { timeout: 10000 });
});

await timed('intro -> start application', async () => {
  await page.click('text=Start My Application');
  await page.waitForURL('**/portal/apply/loan-requirements', { timeout: 10000 });
});

await timed('step 1: loan-requirements (load + fill + save)', async () => {
  await page.fill('input[formcontrolname="loanAmount"]', '20000');
  await page.selectOption('select[formcontrolname="loanPurpose"]', { index: 1 });
  await page.fill('input[formcontrolname="loanTerm"]', '36');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/portal/apply/personal-details', { timeout: 10000 });
});

await timed('step 2: personal-details page load', async () => {
  await page.waitForSelector('.section-title, .form-page', { timeout: 10000 });
});

await timed('step 2: toggle joint application (Applicant 2 reveal)', async () => {
  const jointRadio = page.locator('text=Joint Application').first();
  if (await jointRadio.count() > 0) {
    await jointRadio.click({ timeout: 5000 }).catch(() => {});
  }
});

await timed('step 2: fill applicant 1 + submit', async () => {
  await page.fill('input[formcontrolname="firstName"]', 'Wizard').catch(() => {});
  await page.fill('input[formcontrolname="lastName"]', 'Hangtest').catch(() => {});
  await page.fill('input[formcontrolname="dateOfBirth"]', '1990-01-01').catch(() => {});
  await page.fill('input[formcontrolname="nationalId"]', nid).catch(() => {});
  await page.fill('input[formcontrolname="idIssueDate"]', '2018-01-01').catch(() => {});
  await page.fill('input[formcontrolname="phoneNumber"]', '0501234567').catch(() => {});
  await page.fill('input[formcontrolname="email"]', `wizardhang.${Date.now()}@example.com`).catch(() => {});
  await page.fill('input[formcontrolname="street"]', '1 Test Street').catch(() => {});
  await page.fill('input[formcontrolname="city"]', 'Tel Aviv').catch(() => {});
  await page.fill('input[formcontrolname="postCode"]', '1234567').catch(() => {});
});

await timed('step 2: add a previous address (array growth)', async () => {
  const addBtn = page.locator('button:has-text("Add"), button:has-text("Previous Address")').first();
  if (await addBtn.count() > 0) await addBtn.click({ timeout: 5000 }).catch(() => {});
});

console.log('--- navigating directly to remaining steps to test page-load responsiveness ---');

const remainingSteps = [
  'connect-bank',
  'income-employment',
  'outgoings',
  'credit-declarations',
  'verify-id',
  'direct-debit',
  'review-submit',
];

for (const step of remainingSteps) {
  await timed(`direct nav: ${step}`, async () => {
    await page.goto(`${BASE}/portal/apply/${step}`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(500);
  });
}

await timed('income-employment: click "Add Another Employment" x3', async () => {
  await page.goto(`${BASE}/portal/apply/income-employment`, { waitUntil: 'networkidle', timeout: 10000 });
  const addBtn = page.locator('button:has-text("Add Another Employment")').first();
  for (let i = 0; i < 3; i++) {
    if (await addBtn.count() > 0) await addBtn.click({ timeout: 5000 }).catch(() => {});
  }
});

await timed('credit-declarations: drag credit score slider', async () => {
  await page.goto(`${BASE}/portal/apply/credit-declarations`, { waitUntil: 'networkidle', timeout: 10000 });
  const slider = page.locator('input[type="range"]').first();
  if (await slider.count() > 0) {
    for (const v of [300, 500, 700, 850]) {
      await slider.fill(String(v)).catch(() => {});
      await page.waitForTimeout(50);
    }
  }
});

console.log('\n--- console errors captured ---');
console.log(consoleErrors.length === 0 ? 'none' : consoleErrors.slice(0, 20).join('\n'));

await browser.close();

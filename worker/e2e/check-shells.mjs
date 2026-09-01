import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();

async function loginAndShot(nationalId, landingUrlPattern, shotName) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 500 } })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}/login`, { waitUntil: 'load' });
  await page.fill('input[formcontrolname="nationalId"]', nationalId);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
  const otp = (await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 })).trim();
  await page.fill('input[placeholder="123456"]', otp);
  await page.click('button:has-text("Verify")');
  await page.waitForURL(landingUrlPattern, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\${shotName}.png` });
  console.log(shotName, 'saved, errors:', errors.length ? errors.join(' | ') : 'none');
  await page.close();
}

await loginAndShot('000000027', '**/banker/**', 'banker-shell');
await loginAndShot('000000014', '**/underwriter/**', 'uw-shell');
await loginAndShot('000000015', '**/admin/**', 'admin-shell');

await browser.close();

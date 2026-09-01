import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.fill('input[formcontrolname="nationalId"]', '000000015');
await page.click('button[type="submit"]');
await page.waitForURL('**/login/verify-otp', { timeout: 15000 });
const otp = (await page.locator('.db-alert--info strong').first().textContent({ timeout: 10000 })).trim();
await page.fill('input[placeholder="123456"]', otp);
await page.click('button:has-text("Verify")');
await page.waitForURL('**/admin/**', { timeout: 15000 });

await page.goto(`${BASE}/admin/branding`, { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\admin-branding.png', fullPage: true });
console.log('screenshot saved');

await browser.close();

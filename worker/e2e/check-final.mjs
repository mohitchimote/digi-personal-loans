import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 550 } })).newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.waitForTimeout(500);
console.log('trust row present:', await page.locator('.auth-trust').count() > 0);
await page.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\final-login.png' });

await page.goto(`${BASE}/`, { waitUntil: 'load' });
await page.waitForTimeout(500);
console.log('hero badge present:', await page.locator('.hero-badge').count() > 0);
await page.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\final-landing.png' });

await browser.close();

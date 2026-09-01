import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 500 } })).newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.waitForTimeout(500);
console.log('page title:', await page.title());
await page.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\digilend-login.png' });

await browser.close();

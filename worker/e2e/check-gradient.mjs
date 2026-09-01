import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
const btn = page.locator('button[type="submit"]').first();
await btn.waitFor({ state: 'visible', timeout: 10000 });
const bg = await btn.evaluate(el => getComputedStyle(el).backgroundImage);
console.log('button background-image:', bg);
await btn.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\button.png' });
console.log('screenshot saved');

await browser.close();

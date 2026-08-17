import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 400 } })).newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.waitForTimeout(500);
const tagline = await page.locator('.brand-sub').first().textContent();
console.log('tagline text:', tagline);
await page.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\tagline-check.png' });

await browser.close();

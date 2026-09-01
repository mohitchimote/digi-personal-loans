import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 400 } })).newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[console-error]', m.text()); });
page.on('requestfailed', req => console.log('[request-failed]', req.url(), req.failure()?.errorText));
page.on('response', res => { if (res.url().includes('/branding/logo/')) console.log('[logo response]', res.status(), res.url()); });

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const naturalSize = await page.evaluate(() => {
  const img = document.querySelector('app-brand-logo img');
  return img ? { naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, complete: img.complete, src: img.src } : null;
});
console.log('img natural state:', JSON.stringify(naturalSize));
await page.screenshot({ path: 'C:\\Users\\597010\\AppData\\Local\\Temp\\claude\\C--Users-597010-personal-loans\\2e4cf26a-d906-42f1-86b5-e6e6a6d5a291\\scratchpad\\live-login-logo.png' });

const img = page.locator('app-brand-logo img').first();
if (await img.count() > 0) {
  const box = await img.boundingBox();
  console.log('rendered logo box:', JSON.stringify(box));
}

await browser.close();

import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
page.on('console', m => console.log('[console]', m.type(), m.text()));
page.on('pageerror', e => console.log('[pageerror]', String(e)));
try {
  await page.goto('http://localhost:8787/register', { waitUntil: 'load', timeout: 15000 });
  console.log('loaded, url=', page.url());
  await page.waitForTimeout(2000);
  const html = await page.content();
  console.log('has fullName input:', html.includes('formcontrolname="fullName"'));
} catch (e) {
  console.log('ERROR', e.message);
}
await browser.close();

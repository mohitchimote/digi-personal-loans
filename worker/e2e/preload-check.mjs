import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

const jsChunks = new Set();
page.on('request', (req) => {
  if (req.url().includes('/chunk-') && req.url().endsWith('.js')) jsChunks.add(req.url());
});

await page.goto(`${BASE}/login`, { waitUntil: 'load' });
console.log('chunks requested by load event:', jsChunks.size);
await page.waitForTimeout(5000);
console.log('chunks requested after 5s idle (should be much higher if preloading works):', jsChunks.size);

await browser.close();

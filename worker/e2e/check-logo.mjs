import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();

const pages = [
  { path: '/', name: 'landing' },
  { path: '/login', name: 'login' },
  { path: '/register', name: 'register' },
];

for (const p of pages) {
  await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
  const logo = page.locator('app-brand-logo').first();
  const box = await logo.boundingBox().catch(() => null);
  if (box) {
    await page.screenshot({ path: `./screenshots/logo-${p.name}.png`, clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: box.width + 200, height: box.height + 40 } });
  }
  const info = await logo.evaluate((el) => {
    const icon = el.querySelector('.material-icons');
    const img = el.querySelector('img');
    if (icon) {
      const cs = getComputedStyle(icon);
      return { type: 'icon', color: cs.color, fontSize: cs.fontSize, parentBg: getComputedStyle(el.closest('div,header,nav') || el.parentElement).backgroundColor };
    }
    if (img) return { type: 'img', src: img.src };
    return { type: 'none' };
  });
  console.log(p.name, JSON.stringify(info));
}

await browser.close();

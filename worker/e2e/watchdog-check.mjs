import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'https://is.personalloans.tcsdigilend.com';
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

// Simulate the real bug: /api/branding never responds (a wedged connection never resolves,
// never errors). Everything else behaves normally.
let brandingHits = 0;
await page.route('**/api/branding', async (route) => {
  brandingHits++;
  console.log(`[intercepted] /api/branding hit #${brandingHits} — never fulfilling (simulated stuck connection)`);
  // never call route.fulfill/continue/abort — request stays pending forever, like the real bug
});

let reloadCount = 0;
page.on('load', () => { reloadCount++; console.log(`[page load event] #${reloadCount} at t=${Date.now()}`); });

const t0 = Date.now();
console.log('=== navigating to /login (triggers branding fetch) ===');
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });

console.log('=== watching for watchdog banner + auto-reload for 20s ===');
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(1000);
  const bannerVisible = await page.locator('.connection-banner').count() > 0;
  const bannerText = bannerVisible ? (await page.locator('.connection-banner span').textContent()).trim() : null;
  console.log(`t+${i + 1}s elapsed=${Date.now() - t0}ms bannerVisible=${bannerVisible} bannerText=${JSON.stringify(bannerText)} url=${page.url()}`);
}

console.log(`\nTotal page loads observed: ${reloadCount} (1 = initial nav only, 2+ = watchdog reloaded)`);
console.log(`Total /api/branding hits intercepted: ${brandingHits} (2+ confirms reload re-triggered the request)`);

await browser.close();

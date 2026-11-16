// Renders every frame of tashkent-tv-tower.html to JPEGs via Playwright.
// usage: node render-frames.js <workerIndex> <workerCount> <fps> <outDir> [url]
const { chromium } = require('playwright');
const [k, N, FPS, out] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4]), process.argv[5]];
const url = process.argv[6] || 'http://127.0.0.1:8765/tashkent-tv-tower.html';
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.READY === true);
  const total = Math.round(await page.evaluate(() => window.DURATION) * FPS);
  for (let i = k; i < total; i += N) {
    await page.evaluate(t => window.renderAt(t), i / FPS);
    await page.screenshot({ path: `${out}/f${String(i).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 96 });
  }
  await browser.close();
})();

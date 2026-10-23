// Saves stills for checking the layout: node tools/shot.js 3.5 30 61.2 ...
// With no arguments it takes one still per line (in the middle of it).
import { mkdirSync } from 'node:fs';
import { serve, launch, openPage } from './serve.js';

const out = new URL(process.env.SHOTS || '../out/shots/', import.meta.url);
mkdirSync(out, { recursive: true });
const { server, url } = await serve();
const browser = await launch();
const page = await openPage(browser, url);
let times = process.argv.slice(2).map(Number);
if (!times.length) {
  const tl = await page.evaluate(() => window.__video.timeline.lines.map((l) => [l.id, l.start + l.dur * 0.75]));
  times = tl.map(([, t]) => t);
}
for (const t of times) {
  await page.evaluate((t) => window.__video.renderAt(t), t);
  const file = new URL(`t${t.toFixed(2).padStart(7, '0')}.png`, out);
  await page.screenshot({ path: file.pathname });
  console.log(file.pathname);
}
console.log('duration', await page.evaluate(() => window.__video.duration));
await browser.close();
server.close();

// Renders every portrait state (4 mouths × open/closed eyes) to out/portraits/ and
// pixelates them into sprite sheets in scene/sprites/. Usage: node tools/sprites.js [--preview]
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch } from './serve.js';
import { CAST, portraitSVG } from './portraits.js';

const root = new URL('..', import.meta.url).pathname;
const src = `${root}out/portraits/`;
mkdirSync(src, { recursive: true });

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 600, height: 720 }, deviceScaleFactor: 1 });
for (const who of Object.keys(CAST)) {
  for (let m = 0; m < 4; m++) {
    for (const blink of [false, true]) {
      await page.setContent(`<html><body style="margin:0;background:transparent">${portraitSVG(who, { mouth: m, blink })}</body></html>`);
      await page.screenshot({ path: `${src}${who}-m${m}-e${blink ? 1 : 0}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 600, height: 720 } });
    }
  }
}
await browser.close();
execFileSync('python3', [`${root}tools/pixelate.py`, src, `${root}scene/sprites/`, ...process.argv.slice(2)], { stdio: 'inherit' });

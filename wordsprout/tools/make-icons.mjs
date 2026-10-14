/*
 * WordSprout — значки приложения из одного рисунка img/app/icon.svg (своя работа, без шрифтов).
 *
 *   node wordsprout/tools/make-icons.mjs [--out <папка>]
 *     icon-192.png, icon-512.png — плитка со скруглёнными углами (углы прозрачные), как icon.svg;
 *     maskable-512.png — фон на весь квадрат, рисунок уменьшен до 72 % и стоит в безопасном круге
 *     (40 % от размера), чтобы Android мог обрезать значок в круг, «каплю» или квадрат.
 *   В icon.svg фон — <rect id="bg">, рисунок — <g id="art">…</g>; скрипт берёт их оттуда.
 *   Рисует Chromium через Playwright: пакет playwright, иначе /opt/node22/lib/node_modules/playwright;
 *   браузер — $CHROMIUM_PATH, иначе /opt/pw-browsers/chromium, если есть, иначе встроенный в Playwright.
 *   Повторный запуск даёт те же файлы.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');
const SVG_PATH = path.join(APP, 'img', 'app', 'icon.svg');
const MASKABLE_SCALE = 0.72;

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 && args[outIdx + 1] ? path.resolve(args[outIdx + 1]) : path.join(APP, 'img', 'app');
if (args.includes('--help')) {
  console.log('node wordsprout/tools/make-icons.mjs [--out <папка>]  — icon-192.png, icon-512.png, maskable-512.png');
  process.exit(0);
}

const loadPlaywright = async () => {
  try {
    return await import('playwright');
  } catch (e) {
    return import('/opt/node22/lib/node_modules/playwright/index.mjs');
  }
};

const svg = fs.readFileSync(SVG_PATH, 'utf8');
const art = /<g id="art">[\s\S]*?<\/g>/.exec(svg);
const bg = /<rect id="bg"[^>]*?fill="(#[0-9a-fA-F]{3,8})"/.exec(svg);
if (!art || !bg) {
  console.error('make-icons: в icon.svg нужны <rect id="bg" … fill="#…"> и <g id="art">…</g>');
  process.exit(1);
}

const c = 256 * (1 - MASKABLE_SCALE);
const maskable = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">'
  + `<rect width="512" height="512" fill="${bg[1]}"/>`
  + `<g transform="translate(${c} ${c}) scale(${MASKABLE_SCALE})">${art[0]}</g></svg>`;

const jobs = [
  { file: 'icon-192.png', size: 192, markup: svg },
  { file: 'icon-512.png', size: 512, markup: svg },
  { file: 'maskable-512.png', size: 512, markup: maskable },
];

const { chromium } = await loadPlaywright();
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.size, height: job.size }, deviceScaleFactor: 1 });
    const sized = job.markup.replace(/<svg([^>]*?)\swidth="\d+"\sheight="\d+"/, '<svg$1 width="100%" height="100%"');
    await page.setContent('<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;'
      + `background:transparent}svg{display:block}</style></head><body>${sized}</body></html>`);
    const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: job.size, height: job.size } });
    fs.writeFileSync(path.join(OUT, job.file), buf);
    console.log(`${job.file}: ${job.size}×${job.size}, ${buf.length} байт`);
    await page.close();
  }
} finally {
  await browser.close();
}

// Renders every frame with headless Chromium and encodes them with ffmpeg.
// Output: out/video.mp4 (no sound) and out/timeline.json (for tools/audio.py).
// WORKERS=4 node tools/render.js [--from=seconds --to=seconds]
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { serve, launch, openPage } from './serve.js';

const OUT = new URL('../out/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const WORKERS = +(process.env.WORKERS || 4);

const { server, url } = await serve();
const probe = await launch();
const first = await openPage(probe, url);
const info = await first.evaluate(() => {
  const { duration, fps, timeline } = window.__video;
  return { duration, fps, timeline };
});
await probe.close();
writeFileSync(`${OUT}timeline.json`, JSON.stringify(info.timeline, null, 1));

const fps = info.fps;
const fromF = Math.round((+arg('from') || 0) * fps);
const toF = Math.min(Math.ceil(info.duration * fps), arg('to') ? Math.round(+arg('to') * fps) : Infinity);
const total = toF - fromF;
const per = Math.ceil(total / WORKERS);
console.log(`${total} frames (${(total / fps).toFixed(1)} s) on ${WORKERS} workers`);

let done = 0;
const started = Date.now();
const tick = setInterval(() => {
  const el = (Date.now() - started) / 1000;
  process.stdout.write(`\r${done}/${total} frames, ${el.toFixed(0)} s, ~${((el / Math.max(done, 1)) * (total - done)).toFixed(0)} s left   `);
}, 2000);

async function worker(w) {
  const a = fromF + w * per, b = Math.min(toF, a + per);
  if (a >= b) return null;
  const browser = await launch();
  const page = await openPage(browser, url);
  const file = `${OUT}seg-${w}.mp4`;
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let f = a; f < b; f++) {
    await page.evaluate((t) => window.__video.renderAt(t), f / fps);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await once(ff.stdin, 'drain');
    done++;
  }
  ff.stdin.end();
  await once(ff, 'close');
  await browser.close();
  return file;
}

const files = (await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)))).filter(Boolean);
clearInterval(tick);
server.close();
writeFileSync(`${OUT}segments.txt`, files.map((f) => `file '${f}'`).join('\n'));
const cat = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${OUT}segments.txt`, '-c', 'copy', `${OUT}video.mp4`], { stdio: 'inherit' });
await once(cat, 'close');
console.log(`\nout/video.mp4 ready in ${((Date.now() - started) / 1000).toFixed(0)} s`);

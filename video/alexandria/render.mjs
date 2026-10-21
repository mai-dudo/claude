// Frame renderer: serves the project, drives headless Chromium frame by frame
// and pipes PNG frames into ffmpeg.
//
//   node render.mjs --preview 0.5,1.8,2.9 [--shots vault,library]
//   node render.mjs --range 0 120 --out build/seg_000.mp4
//   node render.mjs --all [--workers 2]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FPS = 30, DURATION = 30, FRAMES = FPS * DURATION;
const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const flag = (k) => args.includes('--' + k);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

// Frames posted by the page are handed to whoever is waiting for them.
let frameSink = null;

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url.startsWith('/frame')) {
        const parts = [];
        req.on('data', (c) => parts.push(c));
        req.on('end', async () => {
          const buf = Buffer.concat(parts);
          if (frameSink) await frameSink(buf);
          res.writeHead(200);
          res.end('ok');
        });
        return;
      }
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404);
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(p).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function openPage(port, shots) {
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('console', (m) => {
    const txt = m.text();
    if (m.type() === 'error' || m.type() === 'warning' || txt.startsWith('shot')) console.log(`[page ${m.type()}] ${txt}`);
  });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const q = shots ? `?shots=${shots}` : '';
  await page.goto(`http://127.0.0.1:${port}/src/index.html${q}`);
  await page.waitForFunction(() => window.ready !== undefined, null, { timeout: 600000, polling: 200 });
  const ok = await page.evaluate(() => window.ready);
  if (!ok) throw new Error('page init failed');
  return { browser, page };
}

// Render one frame; resolves with its raw bottom-up RGBA buffer.
async function frame(page, t, index = 0) {
  let got;
  const p = new Promise((r) => (got = r));
  frameSink = async (buf) => got(buf);
  await page.evaluate(([tt, i]) => window.renderAndSend(tt, i), [t, index]);
  const buf = await p;
  frameSink = null;
  return buf;
}

function toPng(buf, file) {
  return new Promise((res) => {
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x1920', '-i', '-', '-vf', 'vflip', file]);
    ff.on('close', res);
    ff.stdin.end(buf);
  });
}

function ffmpegSink(out) {
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', '1080x1920', '-framerate', String(FPS), '-i', '-',
    '-vf', 'vflip',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-x264-params', 'keyint=30:min-keyint=30:scenecut=0', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  return ff;
}

async function renderRange(port, a, b, out) {
  const { browser, page } = await openPage(port, opt('shots'));
  const ff = ffmpegSink(out);
  const t0 = Date.now();
  for (let f = a; f < b; f++) {
    const raw = await frame(page, f / FPS, f);
    if (!ff.stdin.write(raw)) await new Promise((r) => ff.stdin.once('drain', r));
    if ((f - a) % 10 === 0) {
      const el = (Date.now() - t0) / 1000;
      console.log(`frames ${a}-${b}: ${f - a + 1}/${b - a}  ${(el / (f - a + 1)).toFixed(2)} s/frame`);
    }
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
}

const srv = await serve();
const port = srv.address().port;

if (opt('preview')) {
  const dir = path.join(ROOT, 'build', 'preview');
  fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await openPage(port, opt('shots'));
  for (const s of opt('preview').split(',')) {
    const t = parseFloat(s);
    const st = Date.now();
    const raw = await frame(page, t);
    const f = path.join(dir, `t${t.toFixed(2).padStart(5, '0')}.png`);
    await toPng(raw, f);
    console.log(`${f}  ${Date.now() - st} ms`);
  }
  await browser.close();
} else if (opt('range')) {
  const a = parseInt(opt('range')), b = parseInt(args[args.indexOf('--range') + 2]);
  await renderRange(port, a, b, opt('out', path.join(ROOT, 'build', `seg_${String(a).padStart(4, '0')}.mp4`)));
} else if (flag('all')) {
  // Split into chunks rendered by separate processes, then concatenate.
  const workers = parseInt(opt('workers', '2'));
  const chunk = parseInt(opt('chunk', '60'));
  const segDir = path.join(ROOT, 'build', 'segments');
  fs.mkdirSync(segDir, { recursive: true });
  const jobs = [];
  for (let a = 0; a < FRAMES; a += chunk) jobs.push([a, Math.min(FRAMES, a + chunk)]);
  const todo = jobs.filter(([a]) => !fs.existsSync(path.join(segDir, `seg_${String(a).padStart(4, '0')}.mp4`)));
  console.log(`${todo.length}/${jobs.length} chunks to render with ${workers} workers`);
  let next = 0;
  const run = async () => {
    while (next < todo.length) {
      const [a, b] = todo[next++];
      const out = path.join(segDir, `seg_${String(a).padStart(4, '0')}.mp4`);
      const tmp = out.replace('.mp4', '.part.mp4');
      await new Promise((res, rej) => {
        const p = spawn(process.execPath, [path.join(ROOT, 'render.mjs'), '--range', String(a), String(b), '--out', tmp], { stdio: 'inherit' });
        p.on('close', (code) => (code === 0 ? res() : rej(new Error(`chunk ${a} failed`))));
      });
      fs.renameSync(tmp, out);
    }
  };
  await Promise.all(Array.from({ length: workers }, run));
  const list = jobs.map(([a]) => `file '${path.join(segDir, `seg_${String(a).padStart(4, '0')}.mp4`)}'`).join('\n');
  fs.writeFileSync(path.join(segDir, 'list.txt'), list + '\n');
  await new Promise((r) => {
    const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(segDir, 'list.txt'), '-c', 'copy', path.join(ROOT, 'build', 'video_only.mp4')], { stdio: 'inherit' });
    p.on('close', r);
  });
  console.log('video_only.mp4 written');
}
srv.close();

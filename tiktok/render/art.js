'use strict';
// Рисованные кадры: сцена art показывает готовую иллюстрацию (из ChatGPT, API или от художника)
// и оживляет её — наезд или панорама камеры, пылинки, дождь, туман, мерцание, зерно плёнки.

const IMAGES = {};

// Пути ко всем картинкам ролика (make_video.py кладёт их в поле src).
function artSources(tl) {
  const out = [];
  for (const s of tl.scenes) {
    if (s.type !== 'art') continue;
    for (const f of s.frames || []) if (f.src) out.push(f.src);
  }
  return out;
}

async function loadImages(tl) {
  await Promise.all(artSources(tl).map(async (src) => {
    if (IMAGES[src]) return;
    const img = new Image();
    img.src = `/${src}`;
    try { await img.decode(); IMAGES[src] = img; } catch (e) { console.warn('нет картинки', src); }
  }));
}

// Где и в каком масштабе рисовать картинку, чтобы точка focus (доли картинки) была в центре рамки box.
function artPlace(img, box, z, fx, fy) {
  const s = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight) * z;
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
  const dx = clamp(box.x + box.w / 2 - fx * dw, box.x + box.w - dw, box.x);
  const dy = clamp(box.y + box.h / 2 - fy * dh, box.y + box.h - dh, box.y);
  return [dx, dy, dw, dh];
}

// Движение камеры по картинке: возвращает [зум, x фокуса, y фокуса] в момент p (0..1).
const MOVES = {
  in: (p) => [lerp(1.0, 1.16, p), 0, 0],
  out: (p) => [lerp(1.16, 1.0, p), 0, 0],
  left: (p) => [1.14, lerp(0.07, -0.07, p), 0],
  right: (p) => [1.14, lerp(-0.07, 0.07, p), 0],
  up: (p) => [1.14, 0, lerp(0.07, -0.07, p)],
  down: (p) => [1.14, 0, lerp(-0.07, 0.07, p)],
  drift: (p) => [lerp(1.04, 1.1, p), lerp(-0.015, 0.015, p), 0],
  none: () => [1, 0, 0],
};

function placeholder(c, box, f) {
  const g = c.createLinearGradient(0, box.y, 0, box.y + box.h);
  g.addColorStop(0, '#20232b'); g.addColorStop(1, '#0d0e12');
  c.fillStyle = g; c.fillRect(box.x, box.y, box.w, box.h);
  c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 4; c.setLineDash([18, 14]);
  c.strokeRect(box.x + 40, box.y + 40, box.w - 80, box.h - 80); c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.textAlign = 'center'; c.font = '800 52px Montserrat';
  c.fillText(`Картинка ${f.name || ''}`, box.x + box.w / 2, box.y + box.h * 0.4);
  c.font = '500 30px "JetBrains Mono"'; c.fillStyle = 'rgba(255,255,255,0.5)';
  c.fillText('ещё не готова', box.x + box.w / 2, box.y + box.h * 0.4 + 60);
  const words = (f.draw || '').split(' ');
  let line = '', y = box.y + box.h * 0.4 + 140;
  c.font = '500 26px Montserrat';
  for (const w of words) {
    if (c.measureText(`${line} ${w}`).width > box.w - 160) { c.fillText(line, box.x + box.w / 2, y); line = w; y += 36; if (y > box.y + box.h - 80) break; }
    else line = line ? `${line} ${w}` : w;
  }
  if (y <= box.y + box.h - 80) c.fillText(line, box.x + box.w / 2, y);
}

let GRAIN = null;
function filmGrain(c, T, a) {
  if (!GRAIN) {
    GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 256;
    const g = GRAIN.getContext('2d'), d = g.createImageData(256, 256), r = rng(99);
    for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    g.putImageData(d, 0, 0);
  }
  const f = Math.floor(T * 24);
  c.save(); c.globalAlpha = a; c.globalCompositeOperation = 'overlay';
  c.translate(-Math.floor(hash(f) * 256), -Math.floor(hash(f + 7) * 256));
  c.fillStyle = c.createPattern(GRAIN, 'repeat'); c.fillRect(0, 0, W + 512, H + 512);
  c.restore();
}

// Эффекты поверх картинки внутри рамки box.
const FX = {
  grain: (c, S, box) => filmGrain(c, S.T, 0.09),
  vignette: (c, S, box) => {
    const g = c.createRadialGradient(box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) * 0.35, box.x + box.w / 2, box.y + box.h / 2, Math.max(box.w, box.h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    c.fillStyle = g; c.fillRect(box.x, box.y, box.w, box.h);
  },
  dust: (c, S, box) => {
    for (let i = 0; i < 46; i++) {
      const x = box.x + (((hash(i) * box.w + S.T * (8 + hash(i + 1) * 24)) % box.w) + box.w) % box.w;
      const y = box.y + (((hash(i + 2) * box.h - S.T * (5 + hash(i + 3) * 16)) % box.h) + box.h) % box.h;
      circle(c, x, y, 1.5 + hash(i + 4) * 3, `rgba(255,245,225,${(0.15 + 0.3 * hash(i + 5)) * (0.6 + 0.4 * Math.sin(S.T * 2 + i))})`);
    }
  },
  rain: (c, S, box) => {
    c.strokeStyle = 'rgba(200,215,240,0.35)'; c.lineWidth = 2;
    for (let i = 0; i < 170; i++) {
      const x = box.x + (hash(i) * (box.w + 200) + S.T * 240) % (box.w + 200) - 100;
      const y = box.y + (hash(i + 9) * box.h + S.T * 1700 * (0.8 + hash(i + 3) * 0.4)) % box.h;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 10, y + 42); c.stroke();
    }
  },
  fog: (c, S, box) => {
    for (let i = 0; i < 7; i++) {
      const x = box.x + ((hash(i) * box.w + S.T * (14 + i * 3)) % (box.w + 600)) - 300;
      glow(c, x, box.y + box.h * (0.35 + 0.5 * hash(i + 1)), 360 + hash(i + 2) * 200, '190,195,205', 0.07);
    }
  },
  flicker: (c, S, box) => {
    const f = Math.floor(S.T * 14), a = hash(f) > 0.88 ? 0.35 : 0.04 * noise1(S.T * 6);
    c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(box.x, box.y, box.w, box.h);
  },
  phantoms: (c, S, box) => {
    const k = after(S.t, S.P.phantoms ?? 0, 2.5);
    for (let i = 0; i < 14; i++) {
      const n = Math.floor(S.T * 0.35 + hash(i) * 7), life = (S.T * 0.35 + hash(i) * 7) % 1;
      const cols = ['120,200,255', '255,120,200', '160,255,170', '255,220,120'];
      glow(c, box.x + hash(i * 3 + n) * box.w, box.y + hash(i * 5 + n) * box.h, 40 + hash(i + 2) * 60, cols[i % 4], Math.sin(life * Math.PI) * 0.4 * k);
    }
  },
  sparks: (c, S, box) => { if (S.t >= (S.P.sparksFrom ?? 0)) sparks(c, S.T, box.y + box.h * (S.P.sparksY ?? 0.85)); },
  embers: (c, S, box) => {
    for (let i = 0; i < 40; i++) {
      const life = (S.T * (0.15 + hash(i) * 0.2) + hash(i + 1)) % 1;
      const x = box.x + hash(i + 2) * box.w + Math.sin(S.T + i) * 20, y = box.y + box.h * (1 - life);
      glow(c, x, y, 10, '255,140,60', 0.7 * Math.sin(life * Math.PI));
    }
  },
  snow: (c, S, box) => {
    for (let i = 0; i < 90; i++) {
      const x = box.x + ((hash(i) * box.w + Math.sin(S.T * 0.8 + i) * 30 + S.T * 20) % box.w + box.w) % box.w;
      const y = box.y + (hash(i + 4) * box.h + S.T * (60 + hash(i + 5) * 70)) % box.h;
      circle(c, x, y, 2 + hash(i + 6) * 3, 'rgba(255,255,255,0.7)');
    }
  },
};

// ───────────────────────── Иллюстрация ─────────────────────────
// P.frames: [{ src, name, draw, at }] — картинки сцены (make_video.py собирает их из image / images);
// следующая сменяет предыдущую в момент at быстрым наплывом.
// fit: 'cover' (на весь кадр, по умолчанию), 'letterbox' (по ширине, чёрные поля, как в кино),
// 'blur' (по ширине на размытом фоне из той же картинки); y — центр картинки для letterbox и blur.
// move: 'in' | 'out' | 'left' | 'right' | 'up' | 'down' | 'drift' | 'none'; focus: [x, y] — доли картинки.
// fx: ['grain', 'vignette', 'dust', 'rain', 'fog', 'flicker', 'phantoms', 'sparks', 'embers', 'snow'];
// glows: [{ x, y, r, color, pulse }] — свет в долях рамки (экран телефона, фонарь); grade — заливка цветом.
SCENES.art = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#000'; c.fillRect(-80, -80, W + 160, H + 160);
  const fit = P.fit || 'cover';
  let box = { x: 0, y: 0, w: W, h: H };
  const first = (P.frames || []).map((f) => IMAGES[f.src]).find(Boolean);
  if (fit !== 'cover') {
    const bh = first ? W * first.naturalHeight / first.naturalWidth : W * 9 / 16;
    box = { x: 0, y: (P.y ?? 760) - bh / 2, w: W, h: bh };
    if (fit === 'blur' && first) {
      c.save(); c.filter = 'blur(40px) brightness(0.45)';
      const [dx, dy, dw, dh] = artPlace(first, { x: -80, y: -80, w: W + 160, h: H + 160 }, 1.1, 0.5, 0.5);
      c.drawImage(first, dx, dy, dw, dh); c.restore();
    }
  }
  const [mz, mx, my] = (MOVES[P.move || 'drift'] || MOVES.drift)(ease.inOut(S.p));
  const [fx0, fy0] = P.focus || [0.5, 0.5];
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.w, box.h); c.clip();
  (P.frames || []).forEach((f, i) => {
    const k = i === 0 ? 1 : after(t, f.at ?? 0, 0.25);
    if (k <= 0) return;
    c.globalAlpha = k;
    const img = IMAGES[f.src];
    if (!img) { placeholder(c, box, f); return; }
    const [dx, dy, dw, dh] = artPlace(img, box, mz * (P.zoom || 1), fx0 + mx, fy0 + my);
    c.drawImage(img, dx, dy, dw, dh);
  });
  c.globalAlpha = 1;
  if (P.grade) { c.fillStyle = P.grade; c.fillRect(box.x, box.y, box.w, box.h); }
  for (const g of P.glows || []) {
    const pulse = g.pulse ? 0.75 + 0.25 * Math.sin(T * (g.pulse === true ? 3 : g.pulse)) : 1;
    glow(c, box.x + g.x * box.w, box.y + g.y * box.h, g.r ?? 200, g.color || '255,240,210', (g.a ?? 0.35) * pulse);
  }
  for (const name of P.fx || ['grain', 'vignette']) if (FX[name]) FX[name](c, S, box);
  c.restore();
};

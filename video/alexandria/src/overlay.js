// 2D text layer: title cards, era labels and subtitles (all Russian).
import { ss, clamp, lerp, eOut } from './util.js';

const TITLE_FONT = '"Playfair Display", "DejaVu Serif", serif';
const SUB_FONT = 'Inter, "DejaVu Sans", sans-serif';

export const CARDS = [
  { text: 'А ЕСЛИ ЗНАНИЯ НИКОГДА НЕ ИСЧЕЗАЛИ?', t0: 0.45, t1: 2.95, y: 380, size: 88, reveal: 1.4 },
  { text: 'КАКОЕ ЧУДО ДРЕВНЕГО МИРА ПОКАЗАТЬ СЛЕДУЮЩИМ?', t0: 27.35, t1: 29.92, y: 360, size: 84, reveal: 1.1 },
];

export const LABELS = [
  { text: 'III век до н. э.', t0: 7.05, t1: 8.1 },
  { text: 'IX век', t0: 8.12, t1: 9.18 },
  { text: 'XVII век', t0: 9.2, t1: 10.26 },
  { text: 'XIX век', t0: 10.28, t1: 11.35 },
];

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Balanced wrapping: avoid a long first line and a short widow.
function balancedWrap(ctx, text, maxW) {
  let lines = wrap(ctx, text, maxW);
  if (lines.length < 2) return lines;
  let lo = maxW * 0.45, hi = maxW;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(ctx, text, mid).length > lines.length) lo = mid;
    else hi = mid;
  }
  return wrap(ctx, text, hi);
}

const scratchCanvas = document.createElement('canvas');
function scratch(w, h) {
  if (scratchCanvas.width < w) scratchCanvas.width = w;
  if (scratchCanvas.height < h) scratchCanvas.height = h;
  const c = scratchCanvas.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.filter = 'none';
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  return [scratchCanvas, c];
}

function drawCard(ctx, card, t) {
  const fadeOut = 1 - ss(card.t1 - 0.25, card.t1, t);
  if (t < card.t0 || fadeOut <= 0) return;
  ctx.save();
  ctx.font = `800 ${card.size}px ${TITLE_FONT}`;
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = balancedWrap(ctx, card.text, 930);
  const lh = card.size * 1.12;
  const words = [];
  lines.forEach((ln, li) => {
    const lw = ctx.measureText(ln).width;
    let x = 540 - lw / 2;
    for (const w of ln.split(' ')) {
      words.push({ w, x, y: card.y + li * lh });
      x += ctx.measureText(w + ' ').width;
    }
  });
  const n = words.length;
  words.forEach((wd, i) => {
    const start = card.t0 + (i / n) * card.reveal;
    const a = ss(start, start + 0.45, t) * fadeOut;
    if (a <= 0) return;
    const rise = (1 - eOut(ss(start, start + 0.55, t))) * 26;
    const blur = (1 - ss(start, start + 0.4, t)) * 10;
    // Each word is drawn on a small canvas so the blur-in stays cheap.
    const pad = 70;
    const ww = Math.ceil(ctx.measureText(wd.w).width) + pad * 2, hh = Math.ceil(card.size * 1.5) + pad * 2;
    const [c, w] = scratch(ww, hh);
    w.font = ctx.font;
    w.letterSpacing = ctx.letterSpacing;
    w.textBaseline = 'alphabetic';
    w.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
    const bx = pad, by = pad + card.size * 1.1;
    // Dark halo for legibility, then gold glow, then white face
    w.shadowColor = 'rgba(0,0,0,0.75)';
    w.shadowBlur = 26;
    w.fillStyle = 'rgba(0,0,0,0.35)';
    w.fillText(wd.w, bx, by);
    w.shadowColor = 'rgba(255,180,90,0.95)';
    w.shadowBlur = 30;
    w.fillStyle = '#fff7e8';
    w.fillText(wd.w, bx, by);
    w.shadowBlur = 8;
    w.shadowColor = 'rgba(255,214,150,0.9)';
    w.fillText(wd.w, bx, by);
    ctx.globalAlpha = a;
    ctx.drawImage(c, 0, 0, ww, hh, wd.x - bx, wd.y + rise - by, ww, hh);
  });
  ctx.restore();
}

function drawLabel(ctx, lab, t) {
  const a = ss(lab.t0, lab.t0 + 0.2, t) * (1 - ss(lab.t1 - 0.2, lab.t1, t));
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `700 54px ${TITLE_FONT}`;
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'center';
  const y = 330 + (1 - eOut(ss(lab.t0, lab.t0 + 0.35, t))) * 14;
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffe2a8';
  ctx.fillText(lab.text, 540, y);
  const w = ctx.measureText(lab.text).width / 2 + 34;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,220,160,0.75)';
  ctx.lineWidth = 2;
  const l = 90 * ss(lab.t0, lab.t0 + 0.4, t);
  ctx.beginPath();
  ctx.moveTo(540 - w, y - 18);
  ctx.lineTo(540 - w - l, y - 18);
  ctx.moveTo(540 + w, y - 18);
  ctx.lineTo(540 + w + l, y - 18);
  ctx.stroke();
  ctx.restore();
}

function drawSub(ctx, text, a) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = `700 54px ${SUB_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const lines = balancedWrap(ctx, text, 820);
  const lh = 68;
  const baseY = 1455 - (lines.length - 1) * lh;
  lines.forEach((ln, i) => {
    const y = baseY + i * lh;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(0,0,0,0.78)';
    ctx.strokeText(ln, 520, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(ln, 520, y);
  });
  ctx.restore();
}

export function drawOverlay(ctx, t, timeline) {
  ctx.clearRect(0, 0, 1080, 1920);
  for (const c of CARDS) drawCard(ctx, c, t);
  for (const l of LABELS) drawLabel(ctx, l, t);
  for (const line of timeline.vo) {
    for (const ch of line.chunks) {
      if (t >= ch.start && t <= ch.end) {
        const a = ss(ch.start, ch.start + 0.07, t) * (1 - ss(ch.end - 0.07, ch.end, t));
        drawSub(ctx, ch.text, a);
      }
    }
  }
}

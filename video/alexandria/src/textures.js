// Procedural textures, all drawn on 2D canvases at startup.
import * as THREE from 'three';
import { Noise, mulberry32, makeCanvas, tex, clamp, ss, lerp } from './util.js';

const N = new Noise(1337);
const N2 = new Noise(4242);

const GREEK_UP = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
const SERIF = '"DejaVu Serif", serif';

function pixels(w, h, fn) {
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const px = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      px[3] = 255;
      fn(x, y, px);
      const o = (y * w + x) * 4;
      d[o] = px[0];
      d[o + 1] = px[1];
      d[o + 2] = px[2];
      d[o + 3] = px[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return [c, ctx];
}

function circle(ctx, x, y, r, fill = false) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  fill ? ctx.fill() : ctx.stroke();
}
function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function poly(ctx, pts, close = true) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (close) ctx.closePath();
  ctx.stroke();
}
function regular(cx, cy, r, n, rot = -Math.PI / 2) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}

// ---------------------------------------------------------------- the sigil
// The symbol that opens and closes the film. Drawn with whatever stroke
// style the caller set up (ink on parchment, gold leaf, or white glow mask).
export function drawSigil(ctx, cx, cy, R, lw) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw * 1.4;
  circle(ctx, cx, cy, R);
  ctx.lineWidth = lw;
  circle(ctx, cx, cy, R * 0.9);
  circle(ctx, cx, cy, R * 0.76);
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const l = i % 6 === 0 ? 0.1 : 0.045;
    ctx.lineWidth = i % 6 === 0 ? lw : lw * 0.6;
    line(ctx, cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9,
      cx + Math.cos(a) * R * (0.9 + l), cy + Math.sin(a) * R * (0.9 + l));
  }
  ctx.lineWidth = lw;
  // Twelve letters in the band
  ctx.font = `${Math.round(R * 0.095)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const letters = 'ΑΒΓΔΕΖΗΘΙΚΛΜ';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2 + Math.PI / 12;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R * 0.83, cy + Math.sin(a) * R * 0.83);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(letters[i], 0, 0);
    ctx.restore();
  }
  // Octagram
  poly(ctx, regular(cx, cy, R * 0.76, 4, -Math.PI / 2));
  poly(ctx, regular(cx, cy, R * 0.76, 4, -Math.PI / 4));
  circle(ctx, cx, cy, R * 0.54);
  // Hexagram
  poly(ctx, regular(cx, cy, R * 0.54, 3, -Math.PI / 2));
  poly(ctx, regular(cx, cy, R * 0.54, 3, Math.PI / 2));
  circle(ctx, cx, cy, R * 0.27);
  // Vesica eye
  ctx.beginPath();
  ctx.moveTo(cx - R * 0.2, cy);
  ctx.quadraticCurveTo(cx, cy - R * 0.17, cx + R * 0.2, cy);
  ctx.quadraticCurveTo(cx, cy + R * 0.17, cx - R * 0.2, cy);
  ctx.stroke();
  circle(ctx, cx, cy, R * 0.065, true);
  // Eight beads on the star points
  for (const [x, y] of [...regular(cx, cy, R * 0.76, 4, -Math.PI / 2), ...regular(cx, cy, R * 0.76, 4, -Math.PI / 4)])
    circle(ctx, x, y, R * 0.022, true);
  // Four cardinal rays out of the rim
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
    line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12);
    circle(ctx, cx + Math.cos(a) * R * 1.15, cy + Math.sin(a) * R * 1.15, R * 0.025, true);
  }
  ctx.restore();
}

// White glowing sigil on transparent, for the floating/zoom symbol.
export function sigilTexture(size = 2048) {
  const [c, ctx] = makeCanvas(size, size);
  const R = size * 0.42;
  ctx.strokeStyle = ctx.fillStyle = 'rgba(255,214,150,0.35)';
  ctx.shadowColor = 'rgba(255,190,110,1)';
  ctx.shadowBlur = size * 0.02;
  drawSigil(ctx, size / 2, size / 2, R, size * 0.009);
  ctx.shadowBlur = size * 0.006;
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  drawSigil(ctx, size / 2, size / 2, R, size * 0.0045);
  const t = tex(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- parchment
function parchmentPixels(w, h, seed, tone = [228, 205, 160]) {
  const off = seed * 13.7;
  return pixels(w, h, (x, y, p) => {
    const u = x / w, v = y / h;
    const n1 = N.fbm(u * 3 + off, v * 4, 5);
    const n2 = N2.fbm(u * 40 + off, v * 22, 3);
    const fib = N.n2(u * 4 + off, v * 260) * 0.5;
    let k = 1 + n1 * 0.22 + n2 * 0.05 + fib * 0.03;
    const e = Math.min(u, 1 - u, v, 1 - v) * 2;
    const edge = ss(0.0, 0.16, e + n1 * 0.05);
    k *= lerp(0.45, 1, edge);
    const warm = (1 - edge) * 0.25 + Math.max(0, -n1) * 0.25;
    p[0] = clamp(tone[0] * k * (1 + warm * 0.05), 0, 255);
    p[1] = clamp(tone[1] * k * (1 - warm * 0.12), 0, 255);
    p[2] = clamp(tone[2] * k * (1 - warm * 0.35), 0, 255);
  });
}

function stains(ctx, w, h, seed, n = 6) {
  const r = mulberry32(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, R = (0.04 + r() * 0.12) * w;
    const g = ctx.createRadialGradient(x, y, R * 0.7, x, y, R);
    g.addColorStop(0, 'rgba(190,150,100,0.06)');
    g.addColorStop(0.92, 'rgba(150,105,60,0.22)');
    g.addColorStop(1, 'rgba(150,105,60,0)');
    ctx.fillStyle = g;
    circle(ctx, x, y, R, true);
  }
  ctx.restore();
}

function greekWord(r, n) {
  let s = '';
  for (let i = 0; i < n; i++) s += GREEK_UP[Math.floor(r() * GREEK_UP.length)];
  return s;
}

function textBlock(ctx, r, x0, x1, y0, y1, size, mode) {
  ctx.font = `${size}px ${SERIF}`;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const lh = size * 1.45;
  let first = true;
  for (let y = y0 + size; y < y1; y += lh) {
    let x = x0;
    if (first && mode === 'ink') {
      // Rubricated initial
      ctx.save();
      ctx.fillStyle = 'rgba(140,40,25,0.9)';
      ctx.font = `${size * 2.2}px ${SERIF}`;
      ctx.fillText(GREEK_UP[Math.floor(r() * 24)], x, y + size * 0.9);
      ctx.restore();
      x += size * 1.9;
    }
    first = r() < 0.12;
    while (x < x1 - size) {
      const word = greekWord(r, 2 + Math.floor(r() * 7));
      const wd = ctx.measureText(word).width;
      if (x + wd > x1) break;
      ctx.fillText(word, x, y + (r() - 0.5) * 1.5);
      x += wd + size * 0.55;
    }
  }
}

// Manuscript pages. mode 'ink' gives the colour map, 'mask' the glowing ink
// (sigil excluded, it glows separately).
function drawPage(ctx, w, h, side, mode) {
  const r = mulberry32(side === 'R' ? 11 : 22);
  const m = w * 0.1;
  const ink = mode === 'ink' ? 'rgba(58,34,18,0.9)' : '#ffffff';
  ctx.strokeStyle = ctx.fillStyle = ink;
  if (mode === 'mask') {
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 4;
  }
  ctx.lineCap = 'round';
  if (side === 'R') {
    if (mode === 'ink') {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = 'rgba(70,40,18,0.92)';
      drawSigil(ctx, w * 0.5, h * 0.3, w * 0.3, 3.2);
      ctx.restore();
    }
    textBlock(ctx, r, m, w - m, h * 0.6, h - m * 1.1, 24, mode);
    ctx.lineWidth = 2;
    line(ctx, m, h * 0.57, w - m, h * 0.57);
  } else {
    // Eratosthenes: parallel sun rays over a circle with two gnomons
    const cx = w * 0.5, cy = h * 0.29, R = w * 0.25;
    ctx.lineWidth = 3;
    circle(ctx, cx, cy, R);
    ctx.lineWidth = 2;
    for (let i = -3; i <= 3; i++) line(ctx, cx - R * 1.45, cy - R * 0.9 + i * 14, cx + R * 0.15, cy - R * 0.9 + i * 14);
    const a1 = -Math.PI / 2, a2 = -Math.PI / 2 - 0.42;
    line(ctx, cx, cy, cx + Math.cos(a1) * R * 1.25, cy + Math.sin(a1) * R * 1.25);
    line(ctx, cx, cy, cx + Math.cos(a2) * R * 1.25, cy + Math.sin(a2) * R * 1.25);
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.35, a2, a1);
    ctx.stroke();
    ctx.font = `26px ${SERIF}`;
    ctx.fillText('Θ', cx - 26, cy - R * 0.45);
    // Star chart
    const sx = w * 0.3, sy = h * 0.74, sr = w * 0.15;
    circle(ctx, sx, sy, sr);
    circle(ctx, sx, sy, sr * 0.6);
    const stars = [];
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * sr * 0.95;
      stars.push([sx + Math.cos(a) * d, sy + Math.sin(a) * d]);
      circle(ctx, stars[i][0], stars[i][1], 2 + r() * 3, true);
    }
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) line(ctx, ...stars[i], ...stars[i + 1]);
    textBlock(ctx, r, m, w - m, h * 0.53, h * 0.6, 22, mode);
    textBlock(ctx, r, w * 0.5, w - m, h * 0.62, h - m * 1.1, 22, mode);
  }
}

export function pageTextures(side) {
  const w = 1024, h = 1434;
  const [c, ctx] = parchmentPixels(w, h, side === 'R' ? 1 : 2);
  stains(ctx, w, h, side === 'R' ? 5 : 6, 5);
  drawPage(ctx, w, h, side, 'ink');
  const [mc, mctx] = makeCanvas(w, h);
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, w, h);
  drawPage(mctx, w, h, side, 'mask');
  return { map: tex(c), emissiveMap: tex(mc) };
}

// Plain parchment for scrolls, the page on the table etc.
export function parchmentTexture(seed = 3, w = 512, h = 512) {
  const [c, ctx] = parchmentPixels(w, h, seed);
  stains(ctx, w, h, seed, 3);
  return tex(c);
}

export function scrollSheetTexture(seed = 9) {
  const w = 512, h = 1024;
  const [c, ctx] = parchmentPixels(w, h, seed);
  const r = mulberry32(seed);
  ctx.fillStyle = 'rgba(60,35,18,0.85)';
  textBlock(ctx, r, 40, w - 40, 40, h - 40, 20, 'ink');
  return tex(c);
}

// ---------------------------------------------------------------- leather cover
export function coverTextures() {
  const w = 1024, h = 1434;
  const [c, ctx] = pixels(w, h, (x, y, p) => {
    const u = x / w, v = y / h;
    const n = N.fbm(u * 6, v * 8, 5), g = N2.fbm(u * 90, v * 90, 2);
    const e = Math.min(u, 1 - u, v, 1 - v);
    const wear = (1 - ss(0, 0.07, e + n * 0.03)) * 0.5;
    const k = 1 + n * 0.3 + g * 0.12 + wear;
    p[0] = clamp(78 * k, 0, 255);
    p[1] = clamp(38 * k, 0, 255);
    p[2] = clamp(24 * k, 0, 255);
  });
  const r = mulberry32(77);
  // Scratches
  ctx.strokeStyle = 'rgba(150,100,70,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 160; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 10 + r() * 60;
    line(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l);
  }
  const [mr, mctx] = makeCanvas(w, h);
  mctx.fillStyle = 'rgb(0,190,0)';
  mctx.fillRect(0, 0, w, h);
  const [bc, bctx] = makeCanvas(w, h);
  bctx.fillStyle = 'rgb(140,140,140)';
  bctx.fillRect(0, 0, w, h);
  const tool = (cx, style, lwMul) => {
    cx.save();
    cx.strokeStyle = cx.fillStyle = style;
    cx.lineWidth = 7 * lwMul;
    cx.strokeRect(w * 0.06, h * 0.045, w * 0.88, h * 0.91);
    cx.lineWidth = 3 * lwMul;
    cx.strokeRect(w * 0.085, h * 0.062, w * 0.83, h * 0.876);
    for (const [x, y] of [[0.085, 0.062], [0.915, 0.062], [0.085, 0.938], [0.915, 0.938]]) {
      cx.save();
      cx.translate(x * w, y * h);
      cx.rotate(Math.PI / 4);
      cx.strokeRect(-18, -18, 36, 36);
      cx.restore();
      circle(cx, x * w, y * h, 7, true);
    }
    // Rows of small lozenges
    for (let i = 0; i < 14; i++) {
      const xx = w * (0.15 + (i / 13) * 0.7);
      for (const yy of [h * 0.12, h * 0.88]) {
        cx.save();
        cx.translate(xx, yy);
        cx.rotate(Math.PI / 4);
        cx.fillRect(-5, -5, 10, 10);
        cx.restore();
      }
    }
    drawSigil(cx, w / 2, h / 2, w * 0.26, 6 * lwMul);
    cx.restore();
  };
  tool(ctx, 'rgb(214,168,86)', 1);
  tool(mctx, 'rgb(0,90,255)', 1.15);
  tool(bctx, 'rgb(40,40,40)', 1.3);
  return { map: tex(c), metalRough: tex(mr, { srgb: false }), bump: tex(bc, { srgb: false }) };
}

export function dustTexture() {
  const w = 512, h = 512;
  const [c] = pixels(w, h, (x, y, p) => {
    const n = N.fbm(x / 60, y / 60, 5) * 0.5 + 0.5;
    const s = N2.n2(x / 3, y / 3) * 0.5 + 0.5;
    p[0] = 185; p[1] = 170; p[2] = 150;
    p[3] = clamp((n * 0.85 + s * 0.3 - 0.15) * 255, 0, 255);
  });
  return tex(c);
}

export function pageEdgeTexture() {
  const w = 512, h = 64;
  const r = mulberry32(5);
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(0.75 + r() * 0.3);
  const [c] = pixels(w, h, (x, y, p) => {
    const k = rows[y] * (0.9 + 0.1 * N.n2(x / 20, y));
    p[0] = 226 * k; p[1] = 205 * k; p[2] = 162 * k;
  });
  return tex(c);
}

// ---------------------------------------------------------------- stone & marble
export function stoneTextures(seed = 1, tone = [120, 100, 78], size = 1024) {
  const r = mulberry32(seed);
  const rowH = size / 8;
  const rows = [];
  for (let ry = 0; ry < 8; ry++) {
    const joints = [0];
    let x = r() * 120;
    while (x < size) {
      joints.push(x);
      x += 150 + r() * 170;
    }
    rows.push({ joints, shade: joints.map(() => 0.82 + r() * 0.3) });
  }
  const height = new Float32Array(size * size);
  const [c] = pixels(size, size, (x, y, p) => {
    const ry = Math.floor(y / rowH);
    const row = rows[ry];
    let j = 0;
    while (j < row.joints.length - 1 && x >= row.joints[j + 1]) j++;
    const jx0 = row.joints[j], jx1 = j + 1 < row.joints.length ? row.joints[j + 1] : size + row.joints[1];
    const dx = Math.min(x - jx0, jx1 - x), dy = Math.min(y - ry * rowH, (ry + 1) * rowH - y);
    const n = N.fbm(x / 128 + seed, y / 128, 5, size / 128, size / 128);
    const fine = N2.fbm(x / 12, y / 12, 3);
    const d = Math.min(dx, dy) + n * 6;
    const mortar = 1 - ss(2, 7, d);
    let k = row.shade[j] * (1 + n * 0.35 + fine * 0.12) * (1 - mortar * 0.55) * (1 - (1 - ss(0, 22, d)) * 0.18);
    p[0] = tone[0] * k; p[1] = tone[1] * k; p[2] = tone[2] * k;
    height[y * size + x] = (1 - mortar) * 0.7 + n * 0.2 + fine * 0.1;
  });
  const [b, bctx] = makeCanvas(size, size);
  const img = bctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = clamp(height[i] * 255, 0, 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  bctx.putImageData(img, 0, 0);
  return { map: tex(c, { repeat: true }), bump: tex(b, { srgb: false, repeat: true }) };
}

function marbleValue(x, y, scale, seed) {
  const n = N.fbm(x * scale + seed, y * scale, 6, 256, 256);
  const v = Math.abs(Math.sin((x * scale * 1.3 + y * scale * 0.7 + n * 3.2) * 3.0));
  return { n, vein: Math.pow(1 - v, 9) };
}

export function marbleTexture(tone = [236, 228, 212], veinTone = [120, 112, 105], size = 512, seed = 0) {
  const [c] = pixels(size, size, (x, y, p) => {
    // Use periodic noise via fbm periods to keep it tileable
    const u = x / size, v = y / size;
    const n = N.fbm(u * 4 + seed, v * 4, 6, 4, 4);
    const n2 = N2.fbm(u * 8, v * 8, 4, 8, 8);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 2 + v * 4 + n * 2.6) * Math.PI)), 12);
    const k = 1 + n2 * 0.06;
    const t = clamp(vein * 0.8 + Math.max(0, n) * 0.15);
    p[0] = lerp(tone[0] * k, veinTone[0], t);
    p[1] = lerp(tone[1] * k, veinTone[1], t);
    p[2] = lerp(tone[2] * k, veinTone[2], t);
  });
  return tex(c, { repeat: true });
}

// Opus sectile floor: marble squares, porphyry roundels, dark borders.
export function floorTexture(size = 1024) {
  const cell = size / 2;
  const [c] = pixels(size, size, (x, y, p) => {
    const u = x / size, v = y / size;
    const cx = (x % cell) - cell / 2, cy = (y % cell) - cell / 2;
    const r = Math.hypot(cx, cy) / cell;
    const border = Math.min(x % cell, cell - (x % cell), y % cell, cell - (y % cell));
    const n = N.fbm(u * 6, v * 6, 5, 6, 6);
    const vein = Math.pow(1 - Math.abs(Math.sin((u * 3 + v * 5 + n * 2.4) * Math.PI)), 14);
    let col;
    if (border < 10) col = [28, 24, 22];
    else if (border < 34) col = [120, 34, 28].map((q) => q * (1 + n * 0.25));
    else if (r < 0.3) {
      if (r > 0.28) col = [210, 170, 90];
      else if (r < 0.18) col = [36, 74, 58].map((q) => q * (1 + n * 0.3));
      else col = [232, 224, 206].map((q) => q * (1 + n * 0.05) - vein * 70);
    } else {
      const diag = Math.abs(Math.abs(cx) - Math.abs(cy)) < 6;
      col = diag ? [40, 32, 28] : [230, 220, 200].map((q) => q * (1 + n * 0.06) - vein * 90);
    }
    p[0] = col[0]; p[1] = col[1]; p[2] = col[2];
  });
  return tex(c, { repeat: true });
}

export function fluteBump(size = 256) {
  const [c] = pixels(size, 32, (x, y, p) => {
    const v = 0.5 + 0.5 * Math.cos((x / size) * Math.PI * 2 * 24);
    p[0] = p[1] = p[2] = Math.pow(v, 0.6) * 255;
  });
  return tex(c, { srgb: false, repeat: true });
}

export function woodTexture(tone = [92, 58, 34], size = 512, seed = 3) {
  const [c] = pixels(size, size, (x, y, p) => {
    const u = x / size, v = y / size;
    const n = N.fbm(u * 2 + seed, v * 8, 4, 2, 8);
    const ring = 0.5 + 0.5 * Math.sin((v * 40 + n * 6) * Math.PI);
    const k = 0.75 + ring * 0.2 + N2.n2(u * 300, v * 6) * 0.06;
    p[0] = tone[0] * k; p[1] = tone[1] * k; p[2] = tone[2] * k;
  });
  return tex(c, { repeat: true });
}

export function scrollCapTexture() {
  const s = 128;
  const [c] = pixels(s, s, (x, y, p) => {
    const dx = x - s / 2, dy = y - s / 2;
    const r = Math.hypot(dx, dy) / (s / 2);
    const a = Math.atan2(dy, dx);
    const spiral = 0.5 + 0.5 * Math.sin(r * 38 - a);
    let k = 0.75 + spiral * 0.25;
    if (r < 0.14) k = 0.35;
    p[0] = 224 * k; p[1] = 200 * k; p[2] = 150 * k;
  });
  return tex(c);
}

// ---------------------------------------------------------------- sprites
export function softDot(size = 64) {
  const [c] = pixels(size, size, (x, y, p) => {
    const r = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = Math.exp(-r * r * 5) * (1 - ss(0.85, 1, r));
    p[0] = p[1] = p[2] = 255;
    p[3] = a * 255;
  });
  return tex(c);
}

export function beamTexture() {
  const w = 128, h = 512;
  const [c] = pixels(w, h, (x, y, p) => {
    const u = (x / w) * 2 - 1, v = y / h;
    const across = Math.exp(-u * u * 3.2) * (1 - ss(0.82, 1, Math.abs(u)));
    const along = Math.pow(1 - v, 0.7) * ss(0, 0.06, v);
    const stri = 0.85 + 0.15 * N.n2(x / 9, 3.7);
    p[0] = p[1] = p[2] = 255;
    p[3] = clamp(across * along * stri, 0, 1) * 255;
  });
  return tex(c, { flipY: false });
}

// 8x8 atlas of glyphs, white with halo. Cell 63 is a soft dot.
export function glyphAtlas() {
  const S = 1024, cell = 128;
  const [c, ctx] = makeCanvas(S, S);
  const chars = (GREEK_UP + 'αβγδθλξπσφψω' + '☉☽☿♀♁♂♃♄⊕△▽◇○✶').split('');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 63; i++) {
    const cx = (i % 8) * cell + cell / 2, cy = Math.floor(i / 8) * cell + cell / 2;
    const ch = chars[i % chars.length];
    const font = i >= 36 ? '"DejaVu Sans", sans-serif' : SERIF;
    ctx.font = `${cell * 0.56}px ${font}`;
    ctx.fillStyle = 'rgba(255,200,120,0.5)';
    ctx.shadowColor = 'rgba(255,190,110,1)';
    ctx.shadowBlur = 14;
    ctx.fillText(ch, cx, cy);
    ctx.shadowBlur = 3;
    ctx.fillStyle = '#fff';
    ctx.fillText(ch, cx, cy);
  }
  ctx.shadowBlur = 0;
  const g = ctx.createRadialGradient(7.5 * cell, 7.5 * cell, 0, 7.5 * cell, 7.5 * cell, cell / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(7 * cell, 7 * cell, cell, cell);
  return tex(c);
}

// ---------------------------------------------------------------- water
export function waterNormals(size = 512) {
  const r = mulberry32(31);
  const waves = [];
  for (let i = 0; i < 26; i++) {
    const kx = Math.round((r() - 0.5) * 24), ky = Math.round((r() - 0.5) * 24);
    if (!kx && !ky) continue;
    waves.push([kx, ky, 1 / (1 + Math.hypot(kx, ky) * 0.5), r() * 6.28]);
  }
  const hgt = (x, y) => {
    let h = 0;
    for (const [kx, ky, a, ph] of waves) h += a * Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph);
    return h + N.fbm(x / size * 8, y / size * 8, 4, 8, 8) * 1.5;
  };
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hgt(x, y);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  const [c] = pixels(size, size, (x, y, p) => {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2.5, dy = (at(x, y + 1) - at(x, y - 1)) * 2.5;
    const l = Math.hypot(dx, dy, 1);
    p[0] = (-dx / l * 0.5 + 0.5) * 255;
    p[1] = (-dy / l * 0.5 + 0.5) * 255;
    p[2] = (1 / l * 0.5 + 0.5) * 255;
  });
  const t = tex(c, { srgb: false, repeat: true });
  return t;
}

// ---------------------------------------------------------------- city facades
// Each returns { map, emissiveMap, rough } covering a tile of 4x4 bays.
export function facadeTextures(kind, seed = 1) {
  const S = 512, bays = 4, b = S / bays;
  const r = mulberry32(seed * 101 + kind.length);
  const [c, ctx] = makeCanvas(S, S);
  const [e, ectx] = makeCanvas(S, S);
  const [m, mctx] = makeCanvas(S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  const lit = () => {
    const on = r() < 0.62;
    if (!on) return null;
    const warm = r() < 0.78;
    const k = 0.55 + r() * 0.45;
    return warm ? `rgba(255,${170 + r() * 40 | 0},${90 + r() * 40 | 0},${k})` : `rgba(170,230,255,${k})`;
  };
  if (kind === 'stone') {
    const [base] = pixels(S, S, (x, y, p) => {
      const n = N.fbm(x / 128 + seed, y / 128, 4, S / 128, S / 128), f = N2.n2(x / 4, y / 4);
      const joint = (y % 32 < 2 || (x + (Math.floor(y / 32) % 2) * 32) % 64 < 2) ? 0.86 : 1;
      const k = (1 + n * 0.18 + f * 0.04) * joint;
      p[0] = 214 * k; p[1] = 180 * k; p[2] = 136 * k;
    });
    ctx.drawImage(base, 0, 0);
    mctx.fillStyle = 'rgb(0,220,0)';
    mctx.fillRect(0, 0, S, S);
    for (let i = 0; i < bays; i++) for (let j = 0; j < bays; j++) {
      const x = i * b + b * 0.3, y = j * b + b * 0.22, ww = b * 0.4, hh = b * 0.6;
      const path = (cx) => {
        cx.beginPath();
        cx.moveTo(x, y + hh);
        cx.lineTo(x, y + ww / 2);
        cx.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0);
        cx.lineTo(x + ww, y + hh);
        cx.closePath();
      };
      ctx.fillStyle = 'rgb(150,120,88)';
      ctx.fillRect(x - 5, y - 5, ww + 10, hh + 10);
      path(ctx);
      ctx.fillStyle = 'rgb(38,52,62)';
      ctx.fill();
      ctx.fillStyle = 'rgb(196,160,115)';
      ctx.fillRect(x - 8, y + hh, ww + 16, 7);
      path(mctx);
      mctx.fillStyle = 'rgb(0,40,180)';
      mctx.fill();
      const l = lit();
      if (l) {
        path(ectx);
        ectx.fillStyle = l;
        ectx.fill();
      }
    }
  } else if (kind === 'glass') {
    for (let i = 0; i < bays; i++) for (let j = 0; j < bays * 2; j++) {
      const x = i * b, y = j * b / 2;
      const k = 0.85 + r() * 0.3;
      ctx.fillStyle = `rgb(${46 * k | 0},${92 * k | 0},${108 * k | 0})`;
      ctx.fillRect(x, y, b, b / 2);
      const l = lit();
      if (l) {
        ectx.fillStyle = l;
        ectx.fillRect(x + 3, y + 3, b - 6, b / 2 - 6);
      }
    }
    mctx.fillStyle = 'rgb(0,18,200)';
    mctx.fillRect(0, 0, S, S);
    ctx.fillStyle = 'rgb(200,196,186)';
    mctx.fillStyle = 'rgb(0,160,40)';
    for (let i = 0; i <= bays * 2; i++) {
      ctx.fillRect(0, i * b / 2 - 3, S, 6);
      mctx.fillRect(0, i * b / 2 - 3, S, 6);
    }
    for (let i = 0; i <= bays; i++) {
      ctx.fillRect(i * b - 2, 0, 4, S);
      mctx.fillRect(i * b - 2, 0, 4, S);
    }
  } else if (kind === 'tower') {
    const [base] = pixels(S, S, (x, y, p) => {
      const n = N.fbm(x / 128 + seed, y / 128, 4, S / 128, S / 128);
      const k = 1 + n * 0.12;
      p[0] = 226 * k; p[1] = 204 * k; p[2] = 170 * k;
    });
    ctx.drawImage(base, 0, 0);
    mctx.fillStyle = 'rgb(0,200,0)';
    mctx.fillRect(0, 0, S, S);
    for (let i = 0; i < bays * 2; i++) {
      const x = i * b / 2 + b * 0.12, ww = b * 0.26;
      ctx.fillStyle = 'rgb(40,86,100)';
      ctx.fillRect(x, 0, ww, S);
      mctx.fillStyle = 'rgb(0,20,210)';
      mctx.fillRect(x, 0, ww, S);
      for (let j = 0; j < bays * 3; j++) {
        ctx.fillStyle = 'rgba(210,190,150,1)';
        ctx.fillRect(x, j * b / 3, ww, 3);
        const l = lit();
        if (l) {
          ectx.fillStyle = l;
          ectx.fillRect(x + 2, j * b / 3 + 4, ww - 4, b / 3 - 8);
        }
      }
    }
    // Gold banding
    ctx.fillStyle = 'rgb(200,160,80)';
    ctx.fillRect(0, 0, S, 5);
  }
  return { map: tex(c, { repeat: true }), emissiveMap: tex(e, { repeat: true }), mr: tex(m, { srgb: false, repeat: true }) };
}

export function sandstoneTexture(seed = 2) {
  const S = 512;
  const [c] = pixels(S, S, (x, y, p) => {
    const n = N.fbm(x / 64 + seed, y / 64, 5, S / 64, S / 64);
    const f = N2.n2(x / 3, y / 3);
    const joint = (y % 64 < 2 || (x + (Math.floor(y / 64) % 2) * 64) % 128 < 2) ? 0.85 : 1;
    const k = (1 + n * 0.16 + f * 0.05) * joint;
    p[0] = 216 * k; p[1] = 184 * k; p[2] = 140 * k;
  });
  return tex(c, { repeat: true });
}

export function pavingTexture() {
  const S = 512;
  const [c] = pixels(S, S, (x, y, p) => {
    const n = N.fbm(x / 64, y / 64, 4, S / 64, S / 64);
    const g = (x % 64 < 2 || y % 64 < 2) ? 0.8 : 1;
    const k = (1 + n * 0.12) * g;
    p[0] = 190 * k; p[1] = 168 * k; p[2] = 136 * k;
  });
  return tex(c, { repeat: true });
}

// ---------------------------------------------------------------- era props
export function astrolabeFace() {
  const S = 1024, cx = S / 2, cy = S / 2, R = S * 0.47;
  const [c, ctx] = pixels(S, S, (x, y, p) => {
    const d = Math.hypot(x - cx, y - cy) / R;
    const n = N.fbm(x / 70, y / 70, 4);
    const k = 0.85 + n * 0.15 - d * 0.12;
    p[0] = 206 * k; p[1] = 156 * k; p[2] = 78 * k;
  });
  ctx.strokeStyle = ctx.fillStyle = 'rgba(70,40,10,0.85)';
  ctx.lineWidth = 3;
  circle(ctx, cx, cy, R);
  circle(ctx, cx, cy, R * 0.86);
  circle(ctx, cx, cy, R * 0.78);
  for (let i = 0; i < 360; i += 2) {
    const a = (i / 360) * Math.PI * 2;
    const l = i % 30 === 0 ? 0.14 : i % 10 === 0 ? 0.1 : 0.05;
    ctx.lineWidth = i % 10 === 0 ? 2.4 : 1.3;
    line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * R * (1 - l), cy + Math.sin(a) * R * (1 - l));
  }
  ctx.font = `30px "DejaVu Sans", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const abjad = 'ابجدهوزحطيكل';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(abjad[i], 0, 0);
    ctx.restore();
  }
  // Plate: almucantars and azimuths
  ctx.lineWidth = 1.6;
  for (let k = 0; k < 14; k++) {
    const rr = R * (0.12 + k * 0.05);
    circle(ctx, cx, cy - R * 0.18 + k * R * 0.012, rr);
  }
  for (let k = -6; k <= 6; k++) {
    ctx.beginPath();
    ctx.ellipse(cx + k * R * 0.07, cy - R * 0.1, Math.abs(k) * R * 0.09 + 4, R * 0.62, 0, -Math.PI * 0.95, -Math.PI * 0.05);
    ctx.stroke();
  }
  circle(ctx, cx, cy, R * 0.62);
  circle(ctx, cx, cy, R * 0.4);
  circle(ctx, cx, cy, R * 0.25);
  line(ctx, cx - R * 0.78, cy, cx + R * 0.78, cy);
  line(ctx, cx, cy - R * 0.78, cx, cy + R * 0.78);
  return tex(c);
}

export function reteTexture() {
  const S = 1024, cx = S / 2, cy = S / 2, R = S * 0.39;
  const [c, ctx] = makeCanvas(S, S);
  ctx.strokeStyle = ctx.fillStyle = '#fff';
  ctx.lineWidth = 14;
  circle(ctx, cx, cy + R * 0.12, R * 0.62);
  ctx.lineWidth = 10;
  circle(ctx, cx, cy, R);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    ctx.lineWidth = 10;
    line(ctx, cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
  }
  const r = mulberry32(3);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2, d = R * (0.35 + r() * 0.6);
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - Math.cos(a) * 40 + Math.sin(a) * 18, y - Math.sin(a) * 40 - Math.cos(a) * 18, cx + Math.cos(a) * d * 0.7, cy + Math.sin(a) * d * 0.7);
    ctx.lineWidth = 8;
    ctx.stroke();
    circle(ctx, x, y, 7, true);
  }
  circle(ctx, cx, cy, 22, true);
  return tex(c);
}

export function celestialTexture() {
  const W = 2048, H = 1024;
  const [c, ctx] = pixels(W, H, (x, y, p) => {
    const n = N.fbm(x / 200, y / 200, 4, W / 200 | 0, H / 200 | 0);
    p[0] = 22 + n * 10; p[1] = 34 + n * 12; p[2] = 78 + n * 20;
  });
  const r = mulberry32(12);
  ctx.strokeStyle = 'rgba(220,180,100,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 12; i++) line(ctx, 0, (i / 12) * H, W, (i / 12) * H);
  for (let i = 0; i < 24; i++) line(ctx, (i / 24) * W, 0, (i / 24) * W, H);
  ctx.strokeStyle = 'rgba(235,190,100,0.9)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, H / 2 + Math.sin((x / W) * Math.PI * 2) * H * 0.13);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,215,140,1)';
  ctx.strokeStyle = 'rgba(240,200,120,0.75)';
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 22; k++) {
    let x = r() * W, y = H * (0.15 + r() * 0.7);
    const n = 3 + Math.floor(r() * 5);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const pts = [[x, y]];
    for (let i = 0; i < n; i++) {
      x += (r() - 0.5) * 160;
      y += (r() - 0.5) * 120;
      ctx.lineTo(x, y);
      pts.push([x, y]);
    }
    ctx.stroke();
    for (const [px, py] of pts) circle(ctx, px, py, 3 + r() * 4, true);
  }
  for (let i = 0; i < 900; i++) circle(ctx, r() * W, r() * H, r() * 1.8 + 0.3, true);
  return tex(c);
}

export function bookSpinesTexture() {
  const S = 1024;
  const r = mulberry32(8);
  const [c, ctx] = makeCanvas(S, S);
  const [e, ectx] = makeCanvas(S, S);
  ctx.fillStyle = '#1a120c';
  ctx.fillRect(0, 0, S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  const shelfH = S / 8;
  const pal = [[96, 30, 24], [40, 56, 70], [70, 50, 30], [30, 60, 46], [120, 90, 50], [60, 30, 50], [150, 120, 80]];
  for (let s = 0; s < 8; s++) {
    let x = 0;
    while (x < S) {
      const w = 10 + r() * 22, h = shelfH * (0.7 + r() * 0.25);
      const col = pal[Math.floor(r() * pal.length)].map((q) => q * (0.7 + r() * 0.5));
      ctx.fillStyle = `rgb(${col.join(',')})`;
      ctx.fillRect(x, (s + 1) * shelfH - h - 6, w - 1.5, h);
      ctx.fillStyle = 'rgba(220,180,90,0.8)';
      ctx.fillRect(x + 1, (s + 1) * shelfH - h + 8, w - 3.5, 2);
      ctx.fillRect(x + 1, (s + 1) * shelfH - 18, w - 3.5, 2);
      x += w;
    }
    ctx.fillStyle = '#3a2a1c';
    ctx.fillRect(0, (s + 1) * shelfH - 6, S, 6);
    ectx.fillStyle = 'rgba(255,200,130,0.5)';
    ectx.fillRect(0, (s + 1) * shelfH - 4, S, 3);
  }
  return { map: tex(c, { repeat: true }), emissiveMap: tex(e, { repeat: true }) };
}

// Wall light patch with a window (and lattice), and a scholar's shadow.
export function windowLightTexture(era) {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.save();
  ctx.filter = 'blur(10px)';
  const wx = S * 0.18, wy = S * 0.06, ww = S * 0.5, wh = S * 0.78;
  ctx.beginPath();
  if (era === 1) {
    ctx.moveTo(wx, wy + wh);
    ctx.lineTo(wx, wy + ww * 0.6);
    ctx.quadraticCurveTo(wx, wy, wx + ww / 2, wy - 10);
    ctx.quadraticCurveTo(wx + ww, wy, wx + ww, wy + ww * 0.6);
    ctx.lineTo(wx + ww, wy + wh);
  } else {
    ctx.moveTo(wx, wy + wh);
    ctx.lineTo(wx, wy + ww / 2);
    ctx.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
    ctx.lineTo(wx + ww, wy + wh);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, '#fff');
  g.addColorStop(1, '#ddd');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = '#000';
  if (era === 1) {
    // Mashrabiya lattice
    ctx.lineWidth = 7;
    const st = 46;
    for (let y = wy; y < wy + wh; y += st) for (let x = wx; x < wx + ww; x += st) {
      poly(ctx, regular(x + st / 2, y + st / 2, st * 0.42, 4, 0));
      poly(ctx, regular(x + st / 2, y + st / 2, st * 0.42, 4, Math.PI / 4));
    }
  } else if (era === 3) {
    ctx.lineWidth = 9;
    for (let i = 1; i < 6; i++) line(ctx, wx + (ww * i) / 6, wy, wx + (ww * i) / 6, wy + wh);
    for (let i = 1; i < 9; i++) line(ctx, wx, wy + (wh * i) / 9, wx + ww, wy + (wh * i) / 9);
  } else {
    ctx.lineWidth = 14;
    line(ctx, wx + ww / 2, wy, wx + ww / 2, wy + wh);
    if (era === 2) for (let i = 1; i < 6; i++) line(ctx, wx, wy + (wh * i) / 6, wx + ww, wy + (wh * i) / 6);
  }
  ctx.restore();
  // Scholar shadow
  ctx.save();
  ctx.filter = 'blur(9px)';
  ctx.fillStyle = 'rgba(0,0,0,0.88)';
  drawScholar(ctx, S * 0.5, S * 1.02, S * 0.62, era);
  ctx.restore();
  return tex(c);
}

function drawScholar(ctx, x, y, s, era) {
  // Profile facing right, feet at (x, y), height s.
  const P = (u, v) => [x + u * s, y - v * s];
  ctx.save();
  ctx.beginPath();
  const head = P(0.02, 0.86);
  ctx.ellipse(head[0], head[1], s * 0.058, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  // Nose
  ctx.beginPath();
  ctx.moveTo(...P(0.07, 0.875));
  ctx.lineTo(...P(0.095, 0.85));
  ctx.lineTo(...P(0.07, 0.835));
  ctx.fill();
  // Body
  ctx.beginPath();
  const body = era === 3
    ? [P(-0.03, 0.8), P(0.06, 0.78), P(0.12, 0.7), P(0.1, 0.5), P(0.08, 0.3), P(0.11, 0), P(-0.04, 0), P(-0.08, 0.28), P(-0.16, 0.45), P(-0.11, 0.7)]
    : [P(-0.03, 0.8), P(0.06, 0.78), P(0.13, 0.7), P(0.14, 0.45), P(0.2, 0), P(-0.2, 0), P(-0.15, 0.45), P(-0.12, 0.72)];
  body.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
  ctx.closePath();
  ctx.fill();
  // Arm forward holding something
  ctx.beginPath();
  [P(0.08, 0.68), P(0.26, 0.56), P(0.27, 0.52), P(0.08, 0.58)].forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
  ctx.fill();
  if (era === 0) {
    // Scroll held open
    ctx.fillRect(...P(0.25, 0.62), s * 0.03, s * 0.12);
    ctx.fillRect(...P(0.27, 0.6), s * 0.12, s * 0.008);
    ctx.fillRect(...P(0.38, 0.62), s * 0.03, s * 0.12);
    // Short curly hair
    ctx.beginPath();
    ctx.ellipse(...P(0.0, 0.905), s * 0.06, s * 0.04, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (era === 1) {
    // Turban and beard
    ctx.beginPath();
    ctx.ellipse(...P(0.005, 0.93), s * 0.085, s * 0.06, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    [P(0.03, 0.84), P(0.08, 0.83), P(0.06, 0.76), P(0.0, 0.8)].forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.fill();
    // Astrolabe ring in hand
    ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = ctx.fillStyle;
    circle(ctx, ...P(0.32, 0.56), s * 0.05);
  } else if (era === 2) {
    // Long hair, broad hat, collar
    ctx.beginPath();
    ctx.ellipse(...P(0.0, 0.93), s * 0.13, s * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(...P(-0.05, 0.99), s * 0.1, s * 0.07);
    ctx.beginPath();
    [P(-0.04, 0.88), P(-0.07, 0.74), P(-0.02, 0.74)].forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q)));
    ctx.fill();
    // Quill
    ctx.lineWidth = s * 0.006;
    ctx.strokeStyle = ctx.fillStyle;
    line(ctx, ...P(0.26, 0.54), ...P(0.33, 0.66));
  } else {
    // Top hat, tails
    ctx.fillRect(...P(-0.045, 1.04), s * 0.09, s * 0.12);
    ctx.beginPath();
    ctx.ellipse(...P(0.0, 0.92), s * 0.085, s * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = s * 0.01;
    ctx.strokeStyle = ctx.fillStyle;
    circle(ctx, ...P(0.3, 0.54), s * 0.035);
  }
  ctx.restore();
}

export function blueprintTexture() {
  const W = 1024, H = 768;
  const [c, ctx] = pixels(W, H, (x, y, p) => {
    const n = N.fbm(x / 120, y / 120, 3);
    p[0] = 30 + n * 8; p[1] = 62 + n * 10; p[2] = 120 + n * 14;
  });
  ctx.strokeStyle = 'rgba(220,235,255,0.25)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 32) line(ctx, x, 0, x, H);
  for (let y = 0; y < H; y += 32) line(ctx, 0, y, W, y);
  ctx.strokeStyle = 'rgba(235,245,255,0.9)';
  ctx.lineWidth = 2.5;
  const gear = (cx, cy, R, n) => {
    ctx.beginPath();
    for (let i = 0; i <= n * 4; i++) {
      const a = (i / (n * 4)) * Math.PI * 2;
      const rr = (i % 4 < 2) ? R : R * 0.88;
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.stroke();
    circle(ctx, cx, cy, R * 0.25);
    circle(ctx, cx, cy, R * 0.6);
  };
  gear(300, 360, 170, 24);
  gear(560, 260, 100, 14);
  gear(720, 470, 130, 18);
  line(ctx, 80, 640, 940, 640);
  for (let x = 80; x <= 940; x += 43) line(ctx, x, 630, x, 650);
  return tex(c);
}

export function anatomyTexture() {
  const W = 768, H = 1024;
  const [c, ctx] = parchmentPixels(W, H, 7);
  ctx.strokeStyle = 'rgba(70,40,20,0.85)';
  ctx.lineWidth = 3;
  const cx = W / 2, cy = H * 0.48;
  circle(ctx, cx, cy, W * 0.38);
  ctx.strokeRect(cx - W * 0.33, cy - W * 0.3, W * 0.66, W * 0.72);
  circle(ctx, cx, cy - W * 0.24, W * 0.055);
  line(ctx, cx, cy - W * 0.18, cx, cy + W * 0.12);
  line(ctx, cx - W * 0.34, cy - W * 0.1, cx + W * 0.34, cy - W * 0.1);
  line(ctx, cx - W * 0.3, cy - W * 0.26, cx, cy - W * 0.12);
  line(ctx, cx + W * 0.3, cy - W * 0.26, cx, cy - W * 0.12);
  line(ctx, cx, cy + W * 0.12, cx - W * 0.12, cy + W * 0.42);
  line(ctx, cx, cy + W * 0.12, cx + W * 0.12, cy + W * 0.42);
  line(ctx, cx, cy + W * 0.12, cx - W * 0.26, cy + W * 0.36);
  line(ctx, cx, cy + W * 0.12, cx + W * 0.26, cy + W * 0.36);
  ctx.fillStyle = 'rgba(60,35,18,0.85)';
  textBlock(ctx, mulberry32(3), 60, W - 60, H * 0.82, H - 50, 18, 'ink');
  return tex(c);
}

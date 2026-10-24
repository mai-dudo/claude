'use strict';
// Сборка кадра: камера → сцена → плашки → субтитры. setup(timeline) и draw(t) вызывает make_video.py;
// с ?preview=/out/имя/ страница сама проигрывает ролик со звуком для проверки.

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
let TL = null, SCALE = 1;

async function setup(timeline, opts = {}) {
  TL = timeline; SCALE = opts.scale || 1;
  cv.width = Math.round(W * SCALE); cv.height = Math.round(H * SCALE);
  await Promise.all(['900 80px Montserrat', '500 80px Montserrat', '600 60px Caveat', '700 30px "JetBrains Mono"']
    .map((f) => document.fonts.load(f, 'Ёё АБВ abc 0123')));
  await loadImages(TL);
  TL.scenes.forEach((s, i) => {
    const prev = TL.scenes[i - 1];
    s._chipKeep = !!(prev && prev.chip && s.chip && prev.chip.text === s.chip.text);
  });
  return true;
}

function sceneIndex(T) {
  let i = TL.scenes.length - 1;
  while (i > 0 && TL.scenes[i].start > T) i--;
  return i;
}

function camera(c, S) {
  const cam = S.P.cam || {};
  const [z0, z1] = cam.zoom || (S.P.type === 'art' ? [1, 1] : [1, 1.05]);
  const [fx, fy] = cam.focus || [W / 2, H * 0.45];
  let z = lerp(z0, z1, ease.inOut(S.p));
  if (cam.punch !== false) z *= 1 + 0.05 * (1 - ease.out(S.t / 0.5));
  let sx = 0, sy = 0;
  if (cam.shake) { sx = (noise1(S.T * 7, 1) - 0.5) * cam.shake * 2; sy = (noise1(S.T * 7, 2) - 0.5) * cam.shake * 2; }
  c.translate(fx + sx, fy + sy); c.scale(z, z); c.translate(-fx, -fy);
}

function draw(T) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  const i = sceneIndex(T), sc = TL.scenes[i];
  const t = T - sc.start;
  const S = { t, d: sc.dur, p: clamp(t / sc.dur), T, P: sc, outfit: { ...HERO_DEFAULT, ...(TL.hero || {}) }, cast: TL.cast || {}, i };
  ctx.save();
  camera(ctx, S);
  (SCENES[sc.type] || SCENES.blank)(ctx, S);
  (sc.tags || []).forEach((g) => tag(ctx, g, t));
  ctx.restore();
  ui(ctx, S);
  captions(ctx, T);
  let fade = 0;
  if (sc.fade) fade = Math.max(fade, 1 - clamp(t / 0.5));
  if (i === TL.scenes.length - 1 && sc.fadeOut !== false) fade = Math.max(fade, clamp((t - sc.dur + 0.6) / 0.6));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
}

// ───────────── Плашки поверх сцены ─────────────
function ui(c, S) {
  const { t, T, P } = S;
  if (P.chip) chip(c, P.chip, P._chipKeep ? 1 : after(t, 0.05, 0.3));
  if (P.cards) P.cards.forEach((cd, i, a) => card(c, cd, i, a.length, after(t, cd.at ?? 0.3, 0.35)));
  if (P.meters) P.meters.forEach((m, i) => meter(c, m, i, t, S.d));
  if (P.big) big(c, P.big, t, T);
  if (P.timer) timer(c, P.timer, t, S.d);
  if (P.stamp) stamp(c, P.stamp, t, T);
}

function chip(c, ch, k) {
  if (k <= 0) return;
  const [bg, fg] = CHIP[ch.color] || CHIP.white;
  const text = ch.text.toUpperCase();
  c.save(); c.globalAlpha = k; c.translate(W / 2, 250 - (1 - ease.out(k)) * 30);
  c.font = '800 34px Montserrat'; const w = c.measureText(text).width + 56;
  c.fillStyle = bg; rr(c, -w / 2, -32, w, 64, 32); c.fill();
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, 2);
  c.restore();
}

// Подпись с рамкой у предмета: { text, x, y, at, color, to: [x, y] — провести линию к точке }
function tag(c, g, t) {
  const k = after(t, g.at ?? 0.2, 0.3);
  if (k <= 0) return;
  const col = color(g.color, '#F2C230'), text = g.text.toUpperCase();
  c.save(); c.globalAlpha = k;
  c.font = '700 30px "JetBrains Mono"'; const w = c.measureText(text).width + 36;
  if (g.to) {
    c.strokeStyle = col; c.lineWidth = 3; c.setLineDash([8, 8]);
    c.beginPath(); c.moveTo(g.x, g.y + 26); c.lineTo(g.to[0], g.to[1]); c.stroke(); c.setLineDash([]);
    circle(c, g.to[0], g.to[1], 8, col);
  }
  c.translate(g.x, g.y); c.scale(lerp(0.8, 1, ease.back(k)), lerp(0.8, 1, ease.back(k)));
  c.fillStyle = 'rgba(12,13,16,0.88)'; rr(c, -w / 2, -26, w, 52, 8); c.fill();
  c.strokeStyle = col; c.lineWidth = 3; c.stroke();
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, 2);
  c.restore();
}

// Наклонная наклейка: { text, at, color, y }
function stamp(c, s, t, T) {
  const k = after(t, s.at ?? 0.3, 0.28);
  if (k <= 0) return;
  const text = s.text.toUpperCase(), z = ease.back(k);
  c.save(); c.translate(W / 2, s.y ?? 430); c.rotate(-0.07 + (1 - k) * 0.2); c.scale(lerp(1.6, 1, z), lerp(1.6, 1, z));
  c.globalAlpha = clamp(k * 1.5);
  const size = fitFont(c, text, 900, 64, 'Montserrat', 860), w = c.measureText(text).width + 64;
  c.fillStyle = color(s.color, '#E5383B'); rr(c, -w / 2, -size * 0.75, w, size * 1.5, 14); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, 4);
  c.restore();
}

// Карточка с цифрой вверху кадра: { label, value, color, at }
function card(c, cd, i, n, k) {
  if (k <= 0) return;
  const cw = n > 2 ? 310 : n > 1 ? 420 : 560, gap = n > 2 ? 24 : 40, x = W / 2 - (n * cw + (n - 1) * gap) / 2 + i * (cw + gap), y = 330;
  c.save(); c.globalAlpha = k; c.translate(0, (1 - ease.out(k)) * 30);
  c.fillStyle = 'rgba(14,16,22,0.9)'; rr(c, x, y, cw, 170, 20); c.fill();
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = '700 26px "JetBrains Mono"';
  c.fillText((cd.label || '').toUpperCase(), x + cw / 2, y + 52);
  fitFont(c, cd.value, 900, 70, 'Montserrat', cw - 40);
  c.fillStyle = color(cd.color, '#fff'); c.fillText(cd.value, x + cw / 2, y + 135);
  c.restore();
}

// Шкала: { label, value: [от, до] (0..1), color, at, until, text }
function meter(c, m, i, t, d) {
  const k = after(t, m.at ?? 0.2, 0.3);
  if (k <= 0) return;
  const [v0, v1] = Array.isArray(m.value) ? m.value : [m.value, m.value];
  const v = lerp(v0, v1, ease.inOut((t - (m.at ?? 0.2)) / Math.max(0.1, (m.until ?? d) - (m.at ?? 0.2))));
  const x = 140, y = 340 + i * 96, w = 800;
  c.save(); c.globalAlpha = k;
  c.fillStyle = 'rgba(255,255,255,0.75)'; c.font = '700 26px "JetBrains Mono"'; c.textAlign = 'left';
  c.fillText((m.label || '').toUpperCase(), x, y);
  if (m.text) { c.textAlign = 'right'; c.fillStyle = color(m.color, PAL.yellow); c.fillText(m.text, x + w, y); }
  c.fillStyle = 'rgba(255,255,255,0.12)'; rr(c, x, y + 16, w, 22, 11); c.fill();
  c.fillStyle = color(m.color, PAL.yellow); rr(c, x, y + 16, Math.max(22, w * clamp(v)), 22, 11); c.fill();
  c.restore();
}

// Огромная цифра посередине: { text, sub, color, at, y, count: [от, до], until } — с count число
// отсчитывается от at до until, а text дописывается после него.
function big(c, b, t, T) {
  const k = after(t, b.at ?? 0.2, 0.3);
  if (k <= 0) return;
  if (b.count) {
    const at = b.at ?? 0.2, v = lerp(b.count[0], b.count[1], ease.out((t - at) / Math.max(0.1, (b.until ?? at + 1.5) - at)));
    b = { ...b, text: `${Math.round(v)}${b.text || ''}` };
  }
  const y = b.y ?? 700, col = color(b.color, PAL.yellow);
  const flick = b.flicker === false ? 1 : (hash(Math.floor(T * 20)) > 0.12 ? 1 : 0.55);
  c.save(); c.globalAlpha = clamp(k) * flick; c.translate(W / 2, y); const z = ease.back(k); c.scale(z, z);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  fitFont(c, b.text, 900, 230, 'Montserrat', 960);
  c.shadowColor = col; c.shadowBlur = 50; c.fillStyle = col; c.fillText(b.text, 0, 0);
  c.shadowBlur = 0; c.lineWidth = 6; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.strokeText(b.text, 0, 0); c.fillText(b.text, 0, 0);
  if (b.sub) { c.font = '700 40px "JetBrains Mono"'; c.fillStyle = '#fff'; c.fillText(b.sub.toUpperCase(), 0, 125); }
  c.restore();
}

// Табло с обратным отсчётом: { from, to (секунды), at, y, color }
function timer(c, tm, t, d) {
  const k = after(t, tm.at ?? 0, 0.3);
  if (k <= 0) return;
  const v = Math.max(0, lerp(tm.from, tm.to ?? 0, clamp((t - (tm.at ?? 0)) / Math.max(0.1, d - (tm.at ?? 0)))));
  const s = Math.round(v), text = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  c.save(); c.globalAlpha = k; c.translate(W / 2, tm.y ?? 1640);
  c.fillStyle = 'rgba(10,10,12,0.9)'; rr(c, -190, -70, 380, 140, 22); c.fill();
  c.font = '800 100px "JetBrains Mono"'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = color(tm.color, PAL.red); c.shadowColor = c.fillStyle; c.shadowBlur = 20; c.fillText(text, 0, 6);
  c.restore();
}

// ───────────── Субтитры: по 1–3 слова, ключевые подсвечены ─────────────
const HL = { y: PAL.yellow, r: PAL.red, g: PAL.green };
function captions(c, T) {
  const caps = TL.captions;
  let i = -1;
  for (let k = 0; k < caps.length; k++) { if (caps[k].s <= T) i = k; else break; }
  if (i < 0) return;
  const cp = caps[i], next = caps[i + 1];
  const end = next && next.s - cp.e < 0.7 ? next.s : cp.e + 0.3;
  if (T >= end) return;
  const words = cp.words.map((w) => ({ ...w, w: w.w.toUpperCase() }));
  let size = TL.captionSize || 86;
  c.save();
  c.font = `900 ${size}px Montserrat`;
  const space = size * 0.28;
  let total = words.reduce((a, w) => a + c.measureText(w.w).width, 0) + space * (words.length - 1);
  if (total > 960) { size = Math.floor(size * 960 / total); c.font = `900 ${size}px Montserrat`; total = words.reduce((a, w) => a + c.measureText(w.w).width, 0) + size * 0.28 * (words.length - 1); }
  const z = lerp(0.82, 1, ease.back((T - cp.s) / 0.16));
  c.translate(W / 2, TL.captionY || 1400); c.scale(z, z);
  c.textBaseline = 'middle'; c.textAlign = 'left'; c.lineJoin = 'round';
  let x = -total / 2;
  for (const w of words) {
    const ww = c.measureText(w.w).width;
    c.lineWidth = size * 0.2; c.strokeStyle = 'rgba(0,0,0,0.9)';
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 18; c.shadowOffsetY = 6;
    c.strokeText(w.w, x, 0);
    c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.fillStyle = HL[w.hl] || '#fff'; c.fillText(w.w, x, 0);
    x += ww + size * 0.28;
  }
  c.restore();
}

// ───────────── Просмотр в браузере ─────────────
(async () => {
  const dir = new URLSearchParams(location.search).get('preview');
  if (!dir) return;
  const tl = await (await fetch(`${dir}timeline.json`)).json();
  await setup(tl, { scale: 0.5 });
  document.body.classList.add('preview');
  const audio = new Audio(`${dir}audio.wav`);
  const bar = document.getElementById('bar');
  bar.max = tl.duration; bar.step = 0.01;
  bar.oninput = () => { audio.currentTime = +bar.value; draw(audio.currentTime); };
  cv.onclick = () => (audio.paused ? audio.play() : audio.pause());
  const loop = () => { draw(audio.currentTime); bar.value = audio.currentTime; requestAnimationFrame(loop); };
  loop();
})();

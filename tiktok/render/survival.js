'use strict';
// Сцены для роликов о выживании: кухня (холодильник, кран, розетка, плита, свеча, радио), многоэтажка в разрезе
// с насосом и лифтом, вышка сотовой связи на аккумуляторе, магазин «только наличные», набор на 72 часа.

// Как after, но at около 0 значит «уже случилось до сцены» — без анимации появления.
const since = (t, at, dur) => (at == null ? 0 : at <= 0.05 ? 1 : after(t, at, dur));

// Язычок пламени: (x, y) — основание, s — размер.
function flame(c, x, y, s, T, seed = 0) {
  const fl = 0.85 + 0.15 * noise1(T * 9 + seed, 3), sway = (noise1(T * 4 + seed, 5) - 0.5) * 8 * s;
  glow(c, x, y - 12 * s, 80 * s, '255,170,70', 0.5 * fl);
  c.save(); c.translate(x, y);
  c.fillStyle = '#ffb347';
  c.beginPath(); c.moveTo(-8 * s, 0); c.quadraticCurveTo(-10 * s, -18 * s * fl, sway, -36 * s * fl);
  c.quadraticCurveTo(10 * s, -18 * s * fl, 8 * s, 0); c.closePath(); c.fill();
  c.fillStyle = '#fff3c4';
  c.beginPath(); c.moveTo(-4 * s, 0); c.quadraticCurveTo(-5 * s, -10 * s * fl, sway * 0.5, -20 * s * fl);
  c.quadraticCurveTo(5 * s, -10 * s * fl, 4 * s, 0); c.closePath(); c.fill();
  c.restore();
}

// Бутылка воды: (x, y) — дно, k — появление 0..1.
function bottle(c, x, y, s, k = 1) {
  if (k <= 0) return;
  const z = ease.back(k) * s;
  c.save(); c.translate(x, y); c.scale(z, z);
  c.fillStyle = 'rgba(170,215,255,0.45)'; rr(c, -22, -108, 44, 108, 10); c.fill();
  c.beginPath(); c.moveTo(-22, -98); c.lineTo(-9, -126); c.lineTo(9, -126); c.lineTo(22, -98); c.fill();
  c.fillStyle = 'rgba(60,140,225,0.85)'; rr(c, -19, -82, 38, 79, 8); c.fill();
  c.fillStyle = '#2f7cf6'; rr(c, -10, -140, 20, 16, 3); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(-14, -94, 5, 82);
  c.fillStyle = '#e8eef5'; c.fillRect(-22, -64, 44, 22);
  c.restore();
}

// Радиоприёмник: (x, y) — середина низа. on — играет (подсветка шкалы и, если waves, волны от антенны).
function radio(c, x, y, s, on, T, waves = true) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = '#9aa1ab'; c.lineWidth = 4; c.beginPath(); c.moveTo(30, -64); c.lineTo(66, -150); c.stroke();
  c.fillStyle = '#7a2e2a'; rr(c, -60, -66, 120, 66, 12); c.fill();
  c.fillStyle = '#5c211e'; rr(c, -60, -66, 120, 12, 6); c.fill();
  c.fillStyle = '#2a1413';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) circle(c, -40 + i * 11, -42 + j * 12, 3.5, '#2a1413');
  c.fillStyle = on ? '#ffe9a8' : '#3d3328'; rr(c, 4, -50, 46, 16, 4); c.fill();
  circle(c, 14, -18, 8, '#d8c8a8'); circle(c, 38, -18, 8, '#d8c8a8');
  c.restore();
  if (on) glow(c, x + 27 * s, y - 42 * s, 60 * s, '255,220,140', 0.5);
  if (on && waves) {
    c.save(); c.strokeStyle = 'rgba(255,230,170,0.6)'; c.lineWidth = 4;
    for (let i = 0; i < 3; i++) {
      const r = 50 + ((T * 70 + i * 40) % 120), a = 1 - (r - 50) / 120;
      c.globalAlpha = a; c.beginPath(); c.arc(x + 66 * s, y - 150 * s, r * s, -1.2, -0.2); c.stroke();
      c.beginPath(); c.arc(x + 66 * s, y - 150 * s, r * s, Math.PI + 0.2, Math.PI + 1.2); c.stroke();
    }
    c.restore();
  }
}

// Огонь по краю шторы: x — где штора, y0..y1 — сколько уже горит.
function curtainFire(c, x, y0, y1, k, T) {
  for (let i = 0; i < 9; i++) {
    const y = lerp(y0, y1, i / 8), s = (1.4 + hash(i) * 1.3) * k;
    flame(c, x + (hash(i + 4) - 0.5) * 40, y, s, T, i * 3.1);
  }
  glow(c, x, (y0 + y1) / 2, 380 * k, '255,120,40', 0.45 * k);
}

// ───────────────────────── Кухня ─────────────────────────
// P: time ('night' | 'day'), blackout (at — город за окном гаснет; по умолчанию света уже нет), dark (0..1),
// tap { at, until } (из крана в кастрюлю течёт вода), bottles: [{ at }] (бутылки с водой на столе),
// unplug (at — вилку чайника выдёргивают), spark (at — искра из розетки), candle (at — горит свеча на подоконнике),
// fire { at, until } (горит штора), gas (at — горит конфорка), co (at — по кухне ползёт угарный газ),
// radio (at — играет радио), fridge { open: at } (холодильник открыт, а внутри темно), hero и people
SCENES.kitchen = (c, S) => {
  const { t, T, P } = S;
  const day = P.time === 'day', floor = 1290, top = 1045;
  const off = offK(t, P.blackout ?? 0);
  let g = c.createLinearGradient(0, 0, 0, floor);
  g.addColorStop(0, day ? '#5b676e' : '#1d262c'); g.addColorStop(1, day ? '#6d7a80' : '#27323a');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, floor + 80);
  // фартук из плитки
  c.fillStyle = day ? '#7f9096' : '#2c3a41'; c.fillRect(290, 790, W - 210, top - 790);
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 3;
  for (let y = 790, row = 0; y < top; y += 42, row++) {
    c.beginPath(); c.moveTo(290, y); c.lineTo(W + 80, y); c.stroke();
    for (let x = 290 + (row % 2) * 42; x < W + 80; x += 84) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 42); c.stroke(); }
  }
  // окно
  const wx = 340, wy = 560, ww = 300, wh = 430;
  c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
  g = c.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, day ? '#9fb4c8' : '#070b18'); g.addColorStop(1, day ? '#d7dde2' : '#1a2440');
  c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
  skyline(c, 17, wy + wh, 140, 330, 50, 90, day ? '#7d8796' : '#111827', day ? 0 : 0.35, T, off);
  c.restore();
  c.fillStyle = '#d6d0c2';
  c.fillRect(wx - 12, wy - 12, ww + 24, 14); c.fillRect(wx - 12, wy, 12, wh); c.fillRect(wx + ww, wy, 12, wh); c.fillRect(wx + ww / 2 - 5, wy, 10, wh);
  c.fillStyle = '#e2ddd2'; c.fillRect(wx - 34, wy + wh, ww + 68, 18);
  // шторы
  c.fillStyle = '#7b5a3a';
  for (const [x0, dir] of [[wx - 62, 1], [wx + ww + 8, -1]]) {
    c.beginPath(); c.moveTo(x0, wy - 34); c.lineTo(x0 + 54, wy - 34);
    c.quadraticCurveTo(x0 + 27 + dir * 16, wy + wh / 2, x0 + 58, wy + wh + 10); c.lineTo(x0 - 4, wy + wh + 10); c.fill();
  }
  c.fillStyle = '#3a3f48'; c.fillRect(wx - 80, wy - 44, ww + 160, 10);
  // шкафчики и вытяжка
  c.fillStyle = day ? '#8d9a8f' : '#3c4740'; rr(c, 690, 520, 380, 240, 6); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(878, 520, 4, 240);
  c.fillStyle = '#c9c2b4'; rr(c, 860, 700, 8, 40, 4); c.fill(); rr(c, 892, 700, 8, 40, 4); c.fill();
  // холодильник
  const fx = 30, fw = 250, fy = 790;
  const open = P.fridge ? ease.out(since(t, P.fridge.open, 0.5)) : 0;
  c.fillStyle = '#1a1d22'; rr(c, fx, fy, fw, floor - fy, 16); c.fill();
  if (open > 0) {
    // внутри темно: лампочка не горит
    c.fillStyle = '#2b3036'; c.fillRect(fx + 14, 952, fw - 28, floor - 966);
    c.fillStyle = '#41474f'; for (const y of [1060, 1160]) c.fillRect(fx + 14, y, fw - 28, 6);
    c.fillStyle = '#e8e2d0'; rr(c, fx + 40, 980, 44, 80, 4); c.fill();
    c.fillStyle = '#c0392b'; c.beginPath(); c.arc(fx + 150, 1040, 26, Math.PI, TAU); c.fill(); c.fillRect(fx + 124, 1040, 52, 16);
    c.fillStyle = '#d9a74a'; rr(c, fx + 60, 1110, 70, 48, 8); c.fill();
    c.fillStyle = '#6aa04b'; rr(c, fx + 150, 1090, 50, 68, 8); c.fill();
  }
  c.fillStyle = '#dfe3e6'; rr(c, fx, fy, fw, 152, 14); c.fill();
  const dw = fw * (1 - 0.82 * open);
  c.fillStyle = '#e6eaed'; rr(c, fx - (fw - dw) * 0.15, 950, dw, floor - 960, 14); c.fill();
  c.fillStyle = '#b9bfc5'; rr(c, fx + fw - 26, 836, 8, 70, 4); c.fill();
  if (open < 0.5) { rr(c, fx + dw - 26, 990, 8, 120, 4); c.fill(); }
  circle(c, fx + 60, 1010, 9, '#e5383b'); circle(c, fx + 92, 1030, 9, '#2f7cf6'); circle(c, fx + 70, 1062, 9, '#f2c230');
  // столешница и шкафы
  c.fillStyle = '#5e4a3c'; c.fillRect(290, top + 24, 590, floor - top - 24);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (const x of [436, 584, 732]) c.fillRect(x, top + 30, 4, floor - top - 30);
  c.fillStyle = '#c9b89c';
  for (const x of [410, 460, 556, 606, 706, 756]) { rr(c, x, top + 70, 8, 44, 4); c.fill(); }
  c.fillStyle = '#a99782'; c.fillRect(286, top, 600, 26);
  // плита
  const sx = 886;
  c.fillStyle = '#d9dcdf'; c.fillRect(sx, top, 184, floor - top);
  c.fillStyle = '#b8bcc1'; c.fillRect(sx, top, 184, 12);
  c.fillStyle = '#1f2328'; rr(c, sx + 22, top + 84, 140, 100, 10); c.fill();
  for (let i = 0; i < 4; i++) circle(c, sx + 30 + i * 42, top + 46, 11, '#2b2f36');
  c.strokeStyle = '#2b2f36'; c.lineWidth = 5;
  for (const bx of [sx + 46, sx + 138]) { c.beginPath(); c.moveTo(bx - 34, top - 4); c.lineTo(bx + 34, top - 4); c.stroke(); }
  // кран и кастрюля
  c.strokeStyle = '#aeb6bf'; c.lineWidth = 14; c.lineCap = 'round';
  c.beginPath(); c.moveTo(500, top); c.lineTo(500, 900); c.quadraticCurveTo(500, 872, 534, 876); c.quadraticCurveTo(562, 880, 562, 908); c.stroke();
  c.lineCap = 'butt';
  const tap = P.tap, flowing = tap && t >= (tap.at ?? 0) && t < (tap.until ?? S.d);
  const fill = tap ? clamp((t - (tap.at ?? 0)) / Math.max(0.1, (tap.until ?? S.d) - (tap.at ?? 0))) : (P.pot === 'full' ? 1 : 0);
  c.fillStyle = '#8f99a3'; rr(c, 488, top - 96, 150, 96, 10); c.fill();
  c.fillStyle = '#6f7983'; c.fillRect(470, top - 80, 22, 10); c.fillRect(634, top - 80, 22, 10);
  c.fillStyle = '#5e6670'; c.beginPath(); c.ellipse(563, top - 96, 75, 13, 0, 0, TAU); c.fill();
  if (fill > 0) { c.fillStyle = `rgba(80,160,235,${0.4 + 0.5 * fill})`; c.beginPath(); c.ellipse(563, top - 96, 66 * fill, 10 * fill, 0, 0, TAU); c.fill(); }
  if (flowing) {
    c.strokeStyle = 'rgba(140,195,255,0.85)'; c.lineWidth = 9 + Math.sin(T * 30) * 1.5;
    c.beginPath(); c.moveTo(562, 914); c.lineTo(563 + Math.sin(T * 17) * 1.5, top - 98); c.stroke();
    for (let i = 0; i < 4; i++) circle(c, 563 + Math.sin(T * 13 + i * 2) * 24, top - 100 - Math.abs(Math.sin(T * 9 + i)) * 14, 3, 'rgba(190,225,255,0.8)');
  }
  // бутылки
  const bxs = [318, 362, 406, 450, 668];
  (P.bottles || []).forEach((b, i) => bottle(c, bxs[i % bxs.length], top, 0.95, since(t, b.at ?? 0, 0.35)));
  // чайник, розетка, вилка
  c.fillStyle = '#e8e2d6'; rr(c, 704, top - 112, 104, 112, 18); c.fill();
  c.fillStyle = '#cfc7b8'; rr(c, 714, top - 132, 84, 26, 10); c.fill();
  c.strokeStyle = '#cfc7b8'; c.lineWidth = 10; c.beginPath(); c.moveTo(808, top - 92); c.quadraticCurveTo(842, top - 70, 808, top - 30); c.stroke();
  c.beginPath(); c.moveTo(704, top - 70); c.lineTo(676, top - 96); c.stroke();
  c.fillStyle = '#f0f0f0'; rr(c, 822, 940, 46, 60, 8); c.fill();
  circle(c, 837, 970, 4, '#555'); circle(c, 853, 970, 4, '#555');
  const pulled = ease.out(since(t, P.unplug, 0.4));
  const plx = lerp(845, 862, pulled), ply = lerp(970, 1020, pulled);
  c.strokeStyle = '#2b2f36'; c.lineWidth = 6;
  c.beginPath(); c.moveTo(800, top - 10); c.quadraticCurveTo(lerp(840, 860, pulled), lerp(1040, 1044, pulled), plx, ply + 18); c.stroke();
  c.fillStyle = '#2b2f36'; rr(c, plx - 14, ply - 10, 28, 30, 6); c.fill();
  // свеча на подоконнике
  const candle = since(t, P.candle, 0.3) * (P.candleOff != null ? 1 - after(t, P.candleOff, 0.2) : 1);
  if (P.candle != null) { c.fillStyle = '#f2ead8'; rr(c, 372, wy + wh - 58, 18, 58, 3); c.fill(); }
  // радио
  if (P.radio != null) radio(c, 585, wy + wh, 1, t >= P.radio, T);
  // люди
  const people = [heroIn(S, { x: 700, light: null }), ...(P.people || []).map((sp) => personIn(S, sp, { light: null }))];
  const hands = drawPeople(c, people, floor + 4, 1.8);
  // свет и темнота
  const gasK = since(t, P.gas, 0.3);
  const fireK = P.fire && t >= (P.fire.at ?? 0) ? clamp((t - P.fire.at) / 1.2) * (P.fire.until != null ? 1 - after(t, P.fire.until, 0.3) : 1) : 0;
  const lights = [{ x: wx + ww / 2, y: wy + wh / 2, r: 440, k: day ? 0.9 : 0.35 * (1 - 0.7 * off) }];
  if (candle > 0) lights.push({ x: 381, y: wy + wh - 90, r: 520, k: 0.9 * candle });
  if (fireK > 0) lights.push({ x: wx - 30, y: 820, r: 760, k: fireK });
  if (gasK > 0) lights.push({ x: sx + 46, y: top - 10, r: 360, k: 0.75 * gasK });
  if (P.radio != null && t >= P.radio) lights.push({ x: 612, y: wy + wh - 42, r: 170, k: 0.5 });
  for (const h of hands) lights.push({ x: h.x, y: h.y, r: 260, k: 0.7 }, { x: h.x, y: h.y, a: h.a, spread: 0.35, len: 700, k: 0.8 });
  darkness(c, P.dark ?? (day ? 0.12 : 0.62), lights, '4,6,12');
  // огонь и искры поверх темноты
  if (candle > 0) flame(c, 381, wy + wh - 58, 1.1 * candle, T, 1);
  if (fireK > 0) curtainFire(c, wx - 34, wy + wh, lerp(wy + wh, wy + 120, fireK), fireK, T);
  if (gasK > 0) {
    for (let i = 0; i < 9; i++) {
      const x = sx + 16 + i * 7.5, hgt = (14 + 6 * noise1(T * 12 + i, 2)) * gasK;
      c.fillStyle = 'rgba(80,140,255,0.9)'; c.beginPath(); c.moveTo(x - 4, top - 6); c.quadraticCurveTo(x, top - 6 - hgt * 1.6, x + 4, top - 6); c.fill();
    }
    glow(c, sx + 46, top - 14, 90, '90,150,255', 0.55 * gasK);
  }
  if (P.spark != null && t >= P.spark && t < P.spark + 0.5) {
    const k = 1 - (t - P.spark) / 0.5;
    glow(c, 845, 970, 140, '170,210,255', 0.9 * k);
    c.strokeStyle = `rgba(230,240,255,${k})`; c.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = hash(i + Math.floor(T * 30)) * TAU, r0 = 10, r1 = 30 + 50 * hash(i + 3);
      c.beginPath(); c.moveTo(845 + Math.cos(a) * r0, 970 + Math.sin(a) * r0); c.lineTo(845 + Math.cos(a) * r1, 970 + Math.sin(a) * r1); c.stroke();
    }
  }
  // угарный газ: серые клубы растекаются от плиты по кухне
  if (P.co != null && t >= P.co) {
    const k = clamp((t - P.co) / 3);
    c.save();
    for (let i = 0; i < 18; i++) {
      const life = (T * 0.12 + hash(i)) % 1, spread = k * (0.4 + 0.6 * life);
      const x = sx + 40 - spread * (200 + 760 * hash(i + 1)), y = top - 60 - life * 420 - hash(i + 2) * 120;
      const rad = 90 + 120 * life, a = 0.34 * k * Math.sin(Math.PI * life);
      const cg = c.createRadialGradient(x, y, 0, x, y, rad);
      cg.addColorStop(0, `rgba(178,190,170,${a})`); cg.addColorStop(1, 'rgba(178,190,170,0)');
      c.fillStyle = cg; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
    }
    c.font = '900 58px Montserrat'; c.textAlign = 'center'; c.lineJoin = 'round';
    for (let i = 0; i < 4; i++) {
      const life = (T * 0.15 + i * 0.25) % 1, x = sx + 20 - k * (120 + i * 190) + Math.sin(T + i) * 20, y = top - 120 - life * 260;
      c.globalAlpha = Math.sin(Math.PI * life) * k;
      c.lineWidth = 8; c.strokeStyle = 'rgba(20,24,30,0.6)'; c.strokeText('CO', x, y);
      c.fillStyle = '#dfe6d8'; c.fillText('CO', x, y);
    }
    c.restore();
  }
};

// ───────────────────────── Многоэтажка в разрезе ─────────────────────────
// P: floors (этажей, по умолчанию 12), blackout (at; по умолчанию света уже нет), pumpOff (at — насос в подвале
// встаёт, вода уходит с верхних этажей; dryTo — до какого этажа), lift (true — лифт застрял между этажами)
SCENES.block = (c, S) => {
  const { t, T, P } = S;
  const n = P.floors ?? 12, gy = 1450, fh = 66, bx = 200, bw = 680, top = gy - n * fh;
  const off = offK(t, P.blackout ?? 0);
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, '#05070f'); g.addColorStop(1, '#141b2e');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  const r = rng(5);
  for (let i = 0; i < 110; i++) circle(c, r() * W, r() * gy * 0.6, 1.4, `rgba(255,255,255,${0.25 + 0.45 * noise1(T * 0.6 + i, 3)})`);
  skyline(c, 23, gy, 260, 640, 90, 170, '#10151f', 0.3, T, off);
  // земля и подвал
  earth(c, gy + 10, H + 80, 6);
  c.fillStyle = '#2a2f38'; c.fillRect(-80, gy, W + 160, 12);
  c.fillStyle = '#20252d'; c.fillRect(bx, gy + 12, bw, 150);
  c.fillStyle = '#2c323c'; c.fillRect(bx + 12, gy + 24, bw - 24, 126);
  // дом
  c.fillStyle = '#5a6170'; c.fillRect(bx - 14, top - 26, bw + 28, gy - top + 26);
  c.fillStyle = '#474e5c'; c.fillRect(bx + 120, top - 70, 120, 44); c.fillRect(bx + bw - 180, top - 56, 70, 30);
  c.fillStyle = '#474e5c'; c.fillRect(bx + 170, top - 110, 6, 40);
  const px = bx + 40, lx0 = bx + bw - 96;          // стояк с водой и шахта лифта
  for (let i = 0; i < n; i++) {
    const y = gy - (i + 1) * fh;
    for (let a = 0; a < 3; a++) {
      const ax = bx + 78 + a * 166, aw = 158, id = i * 3 + a;
      const lit = hash(id + 99) < 0.82 && !(off > 0 && hash(id * 13 + 5) < off);
      c.fillStyle = lit ? `rgb(${236 + Math.floor(hash(id) * 19)},${196 + Math.floor(hash(id + 1) * 30)},${120 + Math.floor(hash(id + 2) * 40)})` : '#232b3b';
      c.fillRect(ax, y + 8, aw, fh - 14);
      if (!lit) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(ax, y + 8, aw, 10); }
      if (!lit && off > 0.5 && hash(id + 7) < 0.3) {
        // фонарик телефона или свеча
        const warm = hash(id + 11) < 0.4, fx = ax + 30 + hash(id + 8) * (aw - 60) + (warm ? 0 : Math.sin(T * 1.3 + id) * 12);
        glow(c, fx, y + fh / 2, 50, warm ? '255,180,90' : '205,220,255', warm ? 0.5 + 0.15 * noise1(T * 6 + id, 2) : 0.45 + 0.15 * Math.sin(T * 3 + id));
        circle(c, fx, y + fh / 2 + 6, 3, warm ? '#ffd9a0' : '#eef3ff');
      }
    }
    c.fillStyle = '#3c424e'; c.fillRect(bx, y + fh - 6, bw, 8);
  }
  // шахта лифта
  c.fillStyle = '#1b1f27'; c.fillRect(lx0, top, 70, gy - top);
  const stuck = gy - 7.5 * fh;
  const cy = off >= 1 || P.lift ? stuck : lerp(gy - fh, top + fh, 0.5 + 0.5 * Math.sin(T * 0.5));
  c.strokeStyle = '#4a515c'; c.lineWidth = 2; c.beginPath(); c.moveTo(lx0 + 35, top); c.lineTo(lx0 + 35, cy - fh + 8); c.stroke();
  c.fillStyle = off >= 1 ? '#2a3039' : '#c9b48a'; c.fillRect(lx0 + 6, cy - fh + 8, 58, fh - 10);
  if (off >= 1) glow(c, lx0 + 35, cy - fh / 2, 40, '205,220,255', 0.4 + 0.2 * Math.sin(T * 4));
  // стояк и насос
  const pOff = P.pumpOff == null ? null : P.pumpOff;
  const k = pOff == null ? 0 : ease.inOut((t - pOff) / 2.6);
  const dry = P.dryTo ?? 4, level = lerp(top + 10, gy - dry * fh, k);
  c.fillStyle = '#5b636e'; c.fillRect(px - 13, top + 10, 26, gy + 95 - top - 10);
  c.fillStyle = '#3e88d8'; c.fillRect(px - 8, level, 16, gy + 95 - level);
  if (k <= 0) {
    c.fillStyle = 'rgba(210,235,255,0.75)';
    for (let y = (gy + 95) - ((T * 160) % 40); y > level; y -= 40) c.fillRect(px - 3, y - 14, 6, 14);
  }
  for (let i = 0; i < n; i++) {
    const y = gy - i * fh - 26, wet = y > level;
    c.fillStyle = wet ? '#3e88d8' : '#5b636e'; c.fillRect(px + 13, y - 4, 22, 8);
    if (!wet && k > 0) { c.strokeStyle = '#ff453a'; c.lineWidth = 3; c.beginPath(); c.moveTo(px + 38, y - 8); c.lineTo(px + 50, y + 4); c.moveTo(px + 50, y - 8); c.lineTo(px + 38, y + 4); c.stroke(); }
  }
  const on = pOff == null || t < pOff;
  c.fillStyle = '#6b7380'; rr(c, px - 30, gy + 60, 120, 70, 10); c.fill();
  c.fillStyle = '#4a515c'; rr(c, px + 90, gy + 74, 60, 42, 8); c.fill();
  c.save(); c.translate(px + 30, gy + 95); c.rotate(on ? T * 14 : 0.4);
  c.strokeStyle = '#d0d6de'; c.lineWidth = 6;
  for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(0, 0); c.lineTo(22, 0); c.stroke(); }
  c.restore();
  circle(c, px + 120, gy + 84, 7, on ? '#34c46a' : '#ff453a');
  if (on) glow(c, px + 120, gy + 84, 30, '52,196,106', 0.6);
  else glow(c, px + 120, gy + 84, 30, '255,69,58', 0.5 + 0.3 * Math.sin(T * 8));
};

// ───────────────────────── Вышка сотовой связи ─────────────────────────
// P: drain { at, until } — аккумулятор вышки садится со 100% до 0; после этого волны и огонёк гаснут.
SCENES.tower = (c, S) => {
  const { t, T, P } = S;
  const gy = 1290, cx = 470;
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, '#04060d'); g.addColorStop(1, '#131a2c');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  const r = rng(9);
  for (let i = 0; i < 140; i++) circle(c, r() * W, r() * gy * 0.7, 1.3, `rgba(255,255,255,${0.25 + 0.5 * noise1(T * 0.5 + i, 7)})`);
  skyline(c, 41, gy, 140, 420, 80, 160, '#0e131c', 0.3, T, 1);
  c.fillStyle = '#1c2029'; c.fillRect(-80, gy, W + 160, H - gy + 80);
  const d = P.drain || {}, lv = d.at == null ? 1 : 1 - clamp((t - d.at) / Math.max(0.1, (d.until ?? S.d) - d.at));
  const alive = lv > 0;
  // волны
  if (alive) {
    c.save(); c.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      const rad = 70 + ((T * 140 + i * 95) % 380), a = (1 - (rad - 70) / 380) * (0.35 + 0.65 * Math.min(1, lv * 3));
      c.strokeStyle = `rgba(110,200,255,${0.75 * a})`;
      c.beginPath(); c.arc(cx, 600, rad, -0.7, 0.7); c.stroke();
      c.beginPath(); c.arc(cx, 600, rad, Math.PI - 0.7, Math.PI + 0.7); c.stroke();
    }
    c.restore();
  }
  // мачта
  const ty = 470;
  c.strokeStyle = '#9aa3ae'; c.lineWidth = 9;
  c.beginPath(); c.moveTo(cx - 120, gy); c.lineTo(cx - 24, ty + 60); c.moveTo(cx + 120, gy); c.lineTo(cx + 24, ty + 60); c.stroke();
  c.lineWidth = 4;
  for (let y = gy; y > ty + 90; y -= 82) {
    const w0 = lerp(24, 120, (y - ty - 60) / (gy - ty - 60)), y2 = y - 82, w1 = lerp(24, 120, (y2 - ty - 60) / (gy - ty - 60));
    c.beginPath(); c.moveTo(cx - w0, y); c.lineTo(cx + w1, y2); c.moveTo(cx + w0, y); c.lineTo(cx - w1, y2);
    c.moveTo(cx - w1, y2); c.lineTo(cx + w1, y2); c.stroke();
  }
  c.fillStyle = '#9aa3ae'; c.fillRect(cx - 4, ty - 10, 8, 80);
  c.fillStyle = '#e6e9ee';
  for (const [x, w] of [[cx - 62, 26], [cx - 13, 26], [cx + 36, 26]]) { rr(c, x, ty + 70, w, 110, 6); c.fill(); }
  circle(c, cx - 40, ty + 250, 22, '#d5d9df'); circle(c, cx + 44, ty + 290, 18, '#d5d9df');
  const blink = alive && Math.sin(T * 5) > 0;
  circle(c, cx, ty - 14, 9, blink ? '#ff453a' : '#4a2a2a');
  if (blink) glow(c, cx, ty - 14, 70, '255,69,58', 0.7);
  // шкаф с аккумуляторами у основания
  c.fillStyle = '#4a515c'; rr(c, 620, gy - 170, 170, 170, 8); c.fill();
  c.fillStyle = '#3a3f48'; for (let y = gy - 150; y < gy - 20; y += 18) c.fillRect(640, y, 130, 6);
  c.strokeStyle = '#2b2f36'; c.lineWidth = 6; c.beginPath(); c.moveTo(620, gy - 120); c.quadraticCurveTo(560, gy - 140, cx + 60, gy - 200); c.stroke();
  // большой индикатор заряда
  const ix = 640, iy = 770, iw = 300, ih = 140;
  const col = lv > 0.5 ? '#34c46a' : lv > 0.2 ? '#f2c230' : '#ff453a';
  c.strokeStyle = '#e9edf2'; c.lineWidth = 8; rr(c, ix, iy, iw, ih, 22); c.stroke();
  c.fillStyle = '#e9edf2'; rr(c, ix + iw + 6, iy + 42, 18, 56, 6); c.fill();
  const flick = lv <= 0.2 && lv > 0 ? (Math.sin(T * 9) > -0.2 ? 1 : 0.35) : 1;
  c.globalAlpha = flick; c.fillStyle = col; rr(c, ix + 14, iy + 14, Math.max(0, (iw - 28) * lv), ih - 28, 12); c.fill(); c.globalAlpha = 1;
  c.fillStyle = '#fff'; c.font = '900 64px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.strokeText(`${Math.round(lv * 100)}%`, ix + iw / 2, iy + ih / 2 + 4); c.fillText(`${Math.round(lv * 100)}%`, ix + iw / 2, iy + ih / 2 + 4);
  c.textBaseline = 'alphabetic';
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '700 28px "JetBrains Mono"'; c.fillText('РЕЗЕРВ ВЫШКИ', ix + iw / 2, iy - 26);
};

// ───────────────────────── Магазин без света ─────────────────────────
// P: time ('day' | 'night'), sign (at — на двери появляется «Только наличные»), atm (true — банкомат не работает),
// queue (сколько человек в очереди), hero и people
SCENES.shop = (c, S) => {
  const { t, T, P } = S;
  const day = P.time === 'day', gy = 1290;
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, day ? '#7f8e9e' : '#05070f'); g.addColorStop(1, day ? '#b9c2ca' : '#151c2e');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  // фасад
  c.fillStyle = day ? '#9c8f80' : '#3a352f'; c.fillRect(-80, 470, W + 160, gy - 470);
  c.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 500; y < gy; y += 46) c.fillRect(-80, y, W + 160, 3);
  // вывеска без подсветки
  c.fillStyle = '#23272e'; rr(c, 110, 520, 860, 120, 14); c.fill();
  c.fillStyle = '#4a4f58'; c.font = '900 84px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('ПРОДУКТЫ', 540, 584); c.textBaseline = 'alphabetic';
  // витрина: внутри темно, у кассы фонарь
  const vx = 110, vy = 700, vw = 450, vh = 440;
  c.fillStyle = '#0d1016'; c.fillRect(vx, vy, vw, vh);
  c.fillStyle = '#1a1e26';
  for (let i = 0; i < 3; i++) { c.fillRect(vx + 30, vy + 90 + i * 110, vw - 60, 12); for (let j = 0; j < 9; j++) c.fillRect(vx + 40 + j * 44, vy + 46 + i * 110, 30, 44); }
  glow(c, vx + vw - 90, vy + vh - 110, 160, '255,190,110', 0.45 + 0.05 * Math.sin(T * 7));
  c.fillStyle = 'rgba(255,255,255,0.06)'; c.beginPath(); c.moveTo(vx + 60, vy); c.lineTo(vx + 160, vy); c.lineTo(vx + 40, vy + vh); c.lineTo(vx - 60, vy + vh); c.fill();
  c.strokeStyle = '#5a5248'; c.lineWidth = 12; c.strokeRect(vx, vy, vw, vh);
  // дверь
  const dx = 620, dy = 760, dw = 180;
  c.fillStyle = '#0d1016'; c.fillRect(dx, dy, dw, gy - dy);
  c.strokeStyle = '#5a5248'; c.lineWidth = 12; c.strokeRect(dx, dy, dw, gy - dy);
  c.fillStyle = '#b8a98f'; rr(c, dx + dw - 34, dy + 230, 10, 70, 4); c.fill();
  if (P.sign != null) {
    const k = ease.back(since(t, P.sign, 0.4));
    if (k > 0) {
      c.save(); c.translate(dx + dw / 2, dy + 150); c.rotate(-0.06); c.scale(k, k);
      c.fillStyle = '#f4f1e8'; c.fillRect(-100, -104, 200, 214);
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-44, -116, 88, 22);
      c.fillStyle = '#1d2a44'; c.textAlign = 'center'; c.font = '700 42px Caveat';
      c.fillText('ТОЛЬКО', 0, -34); c.fillText('НАЛИЧНЫЕ', 0, 12);
      c.strokeStyle = '#c0392b'; c.lineWidth = 4; c.beginPath(); c.moveTo(-70, 32); c.lineTo(70, 28); c.stroke();
      c.font = '600 27px Caveat'; c.fillText('карты не работают', 0, 74);
      c.restore();
    }
  }
  // банкомат
  if (P.atm) {
    const ax = 860, ay = 860;
    c.fillStyle = '#6f7782'; rr(c, ax, ay, 150, 300, 10); c.fill();
    c.fillStyle = '#4f5660'; rr(c, ax + 12, ay + 12, 126, 276, 8); c.fill();
    c.fillStyle = '#050608'; rr(c, ax + 24, ay + 34, 102, 80, 6); c.fill();
    c.fillStyle = Math.sin(T * 4) > -0.3 ? '#ff453a' : 'rgba(255,69,58,0.3)'; c.font = '700 15px "JetBrains Mono"'; c.textAlign = 'center';
    c.fillText('НЕ', ax + 75, ay + 68); c.fillText('РАБОТАЕТ', ax + 75, ay + 88);
    c.fillStyle = '#2b2f36'; c.fillRect(ax + 40, ay + 140, 70, 10);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { c.fillStyle = '#8a929c'; rr(c, ax + 40 + i * 24, ay + 170 + j * 24, 18, 18, 3); c.fill(); }
  }
  // тротуар
  c.fillStyle = '#4a4e56'; c.fillRect(-80, gy, W + 160, 18);
  c.fillStyle = '#2b2f36'; c.fillRect(-80, gy + 18, W + 160, H - gy);
  // очередь
  const cols = ['#3d5a80', '#6a4c93', '#2f4a34', '#8a5a44', '#44546a', '#7a3b3b'];
  const queue = [];
  for (let i = 0; i < (P.queue ?? 0); i++) {
    queue.push({ ...HERO_DEFAULT, hat: i % 3 === 1 ? 'cap' : 'hair', hatColor: '#2b2f36', hair: i % 2 ? '#3b2a20' : '#1f1a17',
      jacket: cols[i % cols.length], stripes: false, pants: '#23262c', skin: '#e9bf98', light: i % 2 ? 'phone' : null,
      x: 545 - i * 150, facing: 1, pose: 'stand', phase: T * 2 + i });
  }
  const people = [...queue, P.hero ? heroIn(S, { x: 720, light: null }) : null, ...(P.people || []).map((sp) => personIn(S, sp, { light: null }))];
  const hands = drawPeople(c, people, gy + 4, 1.4);
  const lights = [{ x: vx + vw - 90, y: vy + vh - 110, r: 260, k: 0.8 }];
  for (const h of hands) lights.push({ x: h.x, y: h.y, r: 200, k: 0.6 });
  darkness(c, P.dark ?? (day ? 0.08 : 0.55), lights, '4,6,12');
};

// ───────────────────────── Набор на 72 часа ─────────────────────────
// P: title (крупно сверху, titleAt), items: [{ icon: 'water' | 'food' | 'torch' | 'power' | 'radio' | 'cash' | 'meds', text, at }]
const KIT_ICONS = {
  water: (c) => bottle(c, 0, 62, 1.0),
  food: (c) => {
    c.fillStyle = '#aab2bb'; rr(c, -46, -50, 92, 104, 10); c.fill();
    c.fillStyle = '#d9822b'; c.fillRect(-46, -26, 92, 54);
    c.fillStyle = '#fff3e0'; c.font = '800 22px Montserrat'; c.textAlign = 'center'; c.fillText('ТУШЁНКА', 0, 9);
    c.fillStyle = '#c9d0d8'; c.beginPath(); c.ellipse(0, -50, 46, 12, 0, 0, TAU); c.fill();
  },
  torch: (c, T) => {
    c.save(); c.rotate(-0.5);
    glow(c, 0, -90, 110, '255,236,170', 0.55);
    c.fillStyle = '#2b2f36'; rr(c, -18, -40, 36, 110, 8); c.fill();
    c.fillStyle = '#3a3f48'; c.beginPath(); c.moveTo(-26, -66); c.lineTo(26, -66); c.lineTo(18, -40); c.lineTo(-18, -40); c.fill();
    c.fillStyle = '#fff3c4'; c.beginPath(); c.ellipse(0, -66, 26, 6, 0, 0, TAU); c.fill();
    c.fillStyle = '#f2c230'; c.fillRect(-6, 0, 12, 18);
    c.restore();
  },
  power: (c) => {
    c.fillStyle = '#26324a'; rr(c, -40, -64, 80, 128, 16); c.fill();
    c.fillStyle = '#f2c230'; c.beginPath(); c.moveTo(6, -40); c.lineTo(-16, 6); c.lineTo(0, 6); c.lineTo(-6, 40); c.lineTo(16, -8); c.lineTo(0, -8); c.closePath(); c.fill();
    for (let i = 0; i < 4; i++) circle(c, -18 + i * 12, 52, 3.5, i < 3 ? '#34c46a' : '#40506e');
  },
  radio: (c, T) => radio(c, -5, 34, 0.85, true, T, false),
  cash: (c) => {
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(i * 6 - 6, -i * 14 + 14); c.rotate(-0.08 + i * 0.05);
      c.fillStyle = i === 2 ? '#7fae8a' : '#6a9a76'; rr(c, -62, -32, 124, 64, 6); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3; rr(c, -54, -24, 108, 48, 4); c.stroke();
      circle(c, 0, 0, 14, 'rgba(255,255,255,0.3)');
      c.restore();
    }
    c.fillStyle = '#c9a66b'; c.fillRect(-8, -36, 16, 70);
  },
  meds: (c) => {
    c.fillStyle = 'rgba(230,140,40,0.85)'; rr(c, -36, -40, 72, 100, 10); c.fill();
    c.fillStyle = '#f4f4f4'; rr(c, -42, -66, 84, 30, 8); c.fill();
    c.fillStyle = '#f4f1e8'; c.fillRect(-36, -12, 72, 40);
    c.fillStyle = '#2fa84f'; c.fillRect(-5, -6, 10, 28); c.fillRect(-14, 3, 28, 10);
  },
};
SCENES.kit = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#0b0d12'; c.fillRect(-80, -80, W + 160, H + 160);
  glow(c, W / 2, 820, 760, '255,220,150', 0.08);
  if (P.title) {
    const k = ease.back(after(t, P.titleAt ?? 0.1, 0.4));
    if (k > 0) {
      c.save(); c.translate(W / 2, 420); c.scale(k, k); c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, P.title, 900, 150, 'Montserrat', 940);
      c.shadowColor = PAL.yellow; c.shadowBlur = 40; c.fillStyle = PAL.yellow; c.fillText(P.title, 0, 0);
      c.restore();
    }
  }
  const items = P.items || [], cols = 3, cw = 290, ch = 250, gap = 24;
  items.forEach((it, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, items.length - row * cols), col = i % cols;
    const x = W / 2 + (col - (inRow - 1) / 2) * (cw + gap), y = 650 + row * (ch + gap);
    const k = after(t, it.at ?? 0.3 + i * 0.4, 0.35);
    if (k <= 0) return;
    const z = ease.back(k);
    c.save(); c.translate(x, y); c.scale(z, z); c.globalAlpha = clamp(k * 1.5);
    c.fillStyle = 'rgba(30,34,44,0.95)'; rr(c, -cw / 2, -ch / 2, cw, ch, 22); c.fill();
    c.strokeStyle = 'rgba(255,212,59,0.5)'; c.lineWidth = 3; c.stroke();
    c.save(); c.translate(0, -26); (KIT_ICONS[it.icon] || (() => {}))(c, T); c.restore();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    fitFont(c, (it.text || '').toUpperCase(), 800, 34, 'Montserrat', cw - 30); c.fillText((it.text || '').toUpperCase(), 0, ch / 2 - 26);
    const ck = after(t, (it.at ?? 0) + 0.3, 0.25);
    if (ck > 0) {
      circle(c, cw / 2 - 30, -ch / 2 + 30, 20 * ease.back(ck), PAL.green);
      c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(cw / 2 - 40, -ch / 2 + 30); c.lineTo(cw / 2 - 32, -ch / 2 + 38); c.lineTo(cw / 2 - 19, -ch / 2 + 22); c.stroke();
    }
    c.restore();
  });
};

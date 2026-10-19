'use strict';
// Библиотека сцен. Каждая сцена рисует кадр целиком: SCENES.имя(ctx, S), где
// S.t — секунды от начала сцены, S.d — длина сцены, S.p = t / d, S.T — время ролика,
// S.P — параметры сцены из сценария (время в полях at уже переведено в секунды),
// S.outfit — одежда героя из сценария, S.cast — другие персонажи ({ имя: одежда }).
const SCENES = {};

// Персонаж в сцене: { who (имя из cast; без него — герой), x, pose, facing, light, dead (фонарь в руке
// не светит), walk: [x0, x1], from, until, lightOff: at, then: { at, …поля, которые сменятся в этот момент } }.
function personIn(S, spec, def = {}) {
  if (spec === false) return null;
  const base = spec && spec.who ? { ...HERO_DEFAULT, ...(S.cast[spec.who] || {}) } : S.outfit;
  const h = { ...base, ...def, ...(spec || {}) };
  if (h.walk) {
    const t0 = h.from ?? 0, t1 = h.until ?? S.d;
    const k = clamp((S.t - t0) / Math.max(0.1, t1 - t0));
    h.x = lerp(h.walk[0], h.walk[1], k);
    h.facing = h.facing || Math.sign(h.walk[1] - h.walk[0]) || 1;
    h.pose = k > 0 && k < 1 ? 'walk' : (h.pose === 'walk' ? 'stand' : h.pose);
    h.phase = S.T * 5.2;
  }
  if (h.then && S.t >= (h.then.at ?? 0)) Object.assign(h, h.then);
  if (h.lightOff != null && S.t >= h.lightOff) h.light = null;
  return h;
}
const heroIn = (S, def) => personIn(S, S.P.hero, def);

// Рисует людей и возвращает точки фонарей, которые светят.
function drawPeople(c, list, y, scale) {
  const hands = [];
  for (const p of list) {
    if (!p) continue;
    const hand = drawPerson(c, p.x, y, p.scale ?? scale, p);
    if (hand && !p.dead) hands.push(hand);
  }
  return hands;
}

function earth(c, y0 = -60, y1 = H + 60, seed = 5) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#221a15'); g.addColorStop(1, '#120e0b');
  c.fillStyle = g; c.fillRect(-80, y0, W + 160, y1 - y0);
  const r = rng(seed);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 9; i++) { const y = lerp(y0, y1, r()); c.fillRect(-80, y, W + 160, 3 + r() * 5); }
  c.fillStyle = 'rgba(255,220,180,0.05)';
  for (let i = 0; i < 70; i++) { c.beginPath(); c.ellipse(r() * W, lerp(y0, y1, r()), 4 + r() * 9, 3 + r() * 5, r() * 3, 0, TAU); c.fill(); }
}

// ───────────────────────── Вагон метро изнутри ─────────────────────────
// P: lights ('on' | 'off' | 'flicker'), lightsOff (at), handle (at — подсветить ручку экстренного открытия),
// hero { x, pose: 'sleep' | 'sit' | 'stand', light: 'phone' }
SCENES.wagon = (c, S) => {
  const { t, T, P } = S;
  let on = P.lights === 'off' ? 0 : 1;
  if (P.lightsOff != null) {
    if (t >= P.lightsOff) on = 0;
    else if (t > P.lightsOff - 0.4) on = hash(Math.floor(T * 24)) > 0.45 ? 1 : 0.25;
  }
  if (P.lights === 'flicker') on = noise1(T * 9) > 0.32 ? 1 : 0.2;
  const floor = 1250;

  // потолок и световая полоса
  let g = c.createLinearGradient(0, 0, 0, 470);
  g.addColorStop(0, '#9fa8ad'); g.addColorStop(1, '#d4dadd');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, 550);
  c.fillStyle = on > 0.5 ? '#fffbea' : '#5c6367'; rr(c, -40, 330, W + 80, 32, 16); c.fill();
  c.fillStyle = '#939ca1'; c.fillRect(-80, 462, W + 160, 16);
  // рекламные плашки
  for (const [col, x] of [['#e9c46a', 40], ['#5aa9a0', 340]]) {
    c.fillStyle = col; rr(c, x, 488, 260, 60, 8); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.fillRect(x + 18, 505, 140, 9); c.fillRect(x + 18, 522, 90, 7);
  }
  // стена с окнами
  c.fillStyle = '#c3ccd0'; c.fillRect(-80, 476, 790, 480);
  for (const x of [40, 360]) {
    c.fillStyle = '#7d878c'; rr(c, x - 8, 572, 296, 296, 40); c.fill();
    c.fillStyle = '#05070b'; rr(c, x, 580, 280, 280, 34); c.fill();
    c.save(); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.05)';
    c.beginPath(); c.moveTo(x + 40, 580); c.lineTo(x + 120, 580); c.lineTo(x + 20, 860); c.lineTo(x - 60, 860); c.fill();
    if (P.moving) {
      for (let i = 0; i < 3; i++) glow(c, x + 300 - ((T * 900 + i * 410) % 700), 640 + i * 70, 50, '255,214,150', 0.5);
    }
    c.restore();
  }
  // двери
  const dx = 720;
  c.fillStyle = '#8a959a'; c.fillRect(dx - 14, 478, 14, floor - 478);
  for (const x of [dx, dx + 170]) {
    c.fillStyle = '#b7c1c5'; c.fillRect(x, 478, 168, floor - 478);
    c.fillStyle = '#7d878c'; rr(c, x + 26, 580, 116, 300, 26); c.fill();
    c.fillStyle = '#05070b'; rr(c, x + 32, 586, 104, 288, 22); c.fill();
  }
  c.fillStyle = '#1d2024'; c.fillRect(dx + 166, 478, 6, floor - 478);
  c.fillStyle = '#5d676c'; c.font = '700 22px "JetBrains Mono"'; c.textAlign = 'center';
  c.fillText('НЕ ПРИСЛОНЯТЬСЯ', dx + 170, 925);
  // ручка экстренного открытия
  const hx = 640, hy = 860;
  c.fillStyle = '#c92a2a'; rr(c, hx, hy, 52, 92, 10); c.fill();
  c.fillStyle = '#fff'; c.font = '900 50px Montserrat'; c.fillText('!', hx + 26, hy + 64);
  // сиденья
  c.fillStyle = '#a8b2b6'; c.fillRect(-80, 956, 700, floor - 956);
  c.fillStyle = '#3b4d8c'; rr(c, -60, 942, 680, 150, 26); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 4;
  for (let x = 110; x < 620; x += 170) { c.beginPath(); c.moveTo(x, 958); c.lineTo(x, 1070); c.stroke(); }
  c.fillStyle = '#33447e'; rr(c, -60, 1074, 690, 60, 24); c.fill();
  c.fillStyle = '#26335f'; c.fillRect(-60, 1122, 690, 14);
  c.fillStyle = '#7a858b'; c.fillRect(-60, 1136, 690, floor - 1136);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 20; x < 600; x += 26) c.fillRect(x, 1160, 12, 70);
  // пол
  g = c.createLinearGradient(0, floor, 0, H);
  g.addColorStop(0, '#454a52'); g.addColorStop(1, '#202328');
  c.fillStyle = g; c.fillRect(-80, floor, W + 160, H - floor + 80);
  c.fillStyle = '#2a2d32'; c.fillRect(-80, floor, W + 160, 8);
  c.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = floor + 60; y < H; y += 90) c.fillRect(-80, y, W + 160, 4);
  // поручни
  c.fillStyle = '#9aa3a8'; c.fillRect(-80, 520, 780, 14);
  const pole = (x, y1) => {
    const pg = c.createLinearGradient(x - 12, 0, x + 12, 0);
    pg.addColorStop(0, '#7b8389'); pg.addColorStop(0.4, '#e6eaec'); pg.addColorStop(1, '#6e767c');
    c.fillStyle = pg; c.fillRect(x - 12, 478, 24, y1 - 478);
    c.fillStyle = '#5f676d'; rr(c, x - 30, y1 - 10, 60, 16, 6); c.fill();
  };
  pole(702, floor + 6);

  // герой
  const h = heroIn(S, { x: 300, pose: 'sleep', light: null });
  let hand = null;
  if (h) {
    const s = 2.35, feet = floor + 12, seatTop = 1076;
    hand = drawPerson(c, h.x, feet, s, { ...h, seat: (feet - seatTop) / s });
    if (h.pose === 'sleep' && on > 0.5) {
      for (let i = 0; i < 3; i++) {
        const k = (T * 0.5 + i / 3) % 1;
        c.globalAlpha = Math.sin(k * Math.PI) * 0.85;
        c.fillStyle = '#fff'; c.font = `800 ${34 + i * 10}px Montserrat`;
        c.fillText('z', h.x + 120 + k * 70 + i * 6, 700 - k * 170);
      }
      c.globalAlpha = 1;
    }
  }
  pole(60, 1560);

  // свет
  const lights = [{ x: hx + 26, y: hy + 20, r: 120, k: 0.55 }];
  const handGlow = P.handle != null && t >= P.handle;
  if (handGlow) lights.push({ x: hx + 26, y: hy + 46, r: 230, k: 0.9 });
  if (hand) lights.push({ x: hand.x, y: hand.y, a: hand.a, spread: 0.5, len: 760, r: 260 });
  darkness(c, (1 - on) * (P.dark ?? 0.93), lights, P.tint || '3,5,10');
  if (on < 0.5) glow(c, hx + 26, hy + 20, 70, '255,60,50', 0.35 + 0.15 * Math.sin(T * 4));
  if (handGlow) glow(c, hx + 26, hy + 46, 120, '255,80,60', 0.25 + 0.2 * Math.sin(T * 7));
  if (hand) beam(c, hand.x, hand.y, hand.a, 0.42, 700, 0.18);
  if (on > 0.5) glow(c, W / 2, 345, 700, '255,250,225', 0.08);
};

// ───────────────────────── Экран телефона ─────────────────────────
// P: time, date, battery (0..100), net, notes: [{ title, text, at }], call { name, at, ring }
SCENES.phone = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#05060a'; c.fillRect(-80, -80, W + 160, H + 160);
  const r = rng(3);
  for (let i = 0; i < 12; i++) {
    glow(c, r() * W, r() * H, 60 + r() * 120, i % 3 ? '90,110,180' : '255,180,110', 0.05 + 0.04 * Math.sin(T + i));
  }
  const pw = 600, ph = 1220, px = (W - pw) / 2;
  const py = 300 + (1 - ease.out(t / 0.55)) * 900 + Math.sin(T * 1.3) * 6;
  glow(c, W / 2, py + ph / 2, 760, '110,130,255', 0.16);
  c.fillStyle = '#0a0c10'; rr(c, px - 18, py - 18, pw + 36, ph + 36, 96); c.fill();
  c.strokeStyle = '#3b404b'; c.lineWidth = 5; c.stroke();
  const g = c.createLinearGradient(0, py, 0, py + ph);
  const wall = P.wall || ['#253456', '#4a2340'];
  g.addColorStop(0, wall[0]); g.addColorStop(1, wall[1]);
  c.save(); rr(c, px, py, pw, ph, 80); c.clip();
  c.fillStyle = g; c.fillRect(px, py, pw, ph);
  glow(c, px + pw * 0.2, py + ph * 0.75, 380, '255,120,170', 0.15);
  glow(c, px + pw * 0.85, py + ph * 0.3, 330, '90,160,255', 0.15);
  c.fillStyle = '#000'; rr(c, W / 2 - 72, py + 30, 144, 42, 21); c.fill();
  // строка состояния
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.font = '700 28px Montserrat';
  c.fillText(P.net ?? 'Нет сети', px + 56, py + 64);
  const bat = P.battery ?? 100, low = bat <= 20;
  const bx = px + pw - 110, by = py + 44;
  c.textAlign = 'right'; c.fillText(`${bat}%`, bx - 12, py + 64);
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; rr(c, bx, by, 58, 26, 7); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(bx + 60, by + 8, 4, 10);
  c.fillStyle = low ? (Math.sin(T * 6) > -0.3 ? PAL.red : 'rgba(255,69,58,0.3)') : '#fff';
  c.fillRect(bx + 4, by + 4, 50 * bat / 100, 18);
  // часы
  c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '600 34px Montserrat';
  c.fillText(P.date || '', W / 2, py + 210);
  c.fillStyle = '#fff'; c.font = '500 210px Montserrat';
  c.fillText(P.time || '01:12', W / 2, py + 420);
  // уведомления
  (P.notes || []).forEach((n, i) => {
    const k = ease.back(after(t, n.at ?? 0.6, 0.4));
    if (k <= 0) return;
    const ny = py + 520 + i * 176;
    c.save(); c.globalAlpha = clamp(k); c.translate(W / 2, ny + 70); c.scale(lerp(0.85, 1, k), lerp(0.85, 1, k)); c.translate(-W / 2, -ny - 70);
    c.fillStyle = 'rgba(30,32,40,0.82)'; rr(c, px + 28, ny, pw - 56, 148, 34); c.fill();
    c.fillStyle = n.color ? color(n.color) : PAL.red; rr(c, px + 54, ny + 30, 52, 52, 14); c.fill();
    c.textAlign = 'left'; c.fillStyle = '#fff'; c.font = '800 30px Montserrat';
    c.fillText(n.title, px + 126, ny + 62);
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '500 28px Montserrat';
    c.fillText(n.text, px + 126, ny + 106);
    c.restore();
  });
  // звонок: { name, at, ring (сколько секунд идут гудки) }
  if (P.call) {
    const cl = P.call, at = cl.at ?? 0.3, k = after(t, at, 0.35);
    if (k > 0) {
      c.globalAlpha = k;
      c.fillStyle = '#0e1018'; c.fillRect(px, py, pw, ph);
      circle(c, W / 2, py + 330, 96, '#3a4256');
      c.fillStyle = '#c9cfdb'; c.textAlign = 'center'; c.font = '700 80px Montserrat';
      c.fillText(cl.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(), W / 2, py + 358);
      c.fillStyle = '#fff'; c.font = '700 50px Montserrat'; c.fillText(cl.name, W / 2, py + 520);
      const talk = t - at - (cl.ring ?? 1.5);
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '500 34px Montserrat';
      c.fillText(talk < 0 ? 'вызов…' : `00:${String(Math.floor(talk)).padStart(2, '0')}`, W / 2, py + 580);
      for (const dx of [-170, 0, 170]) circle(c, W / 2 + dx, py + 760, 58, '#3a4256');
      circle(c, W / 2, py + 930, 66, '#e5383b');
      c.save(); c.translate(W / 2, py + 930); c.rotate(2.36);
      c.fillStyle = '#fff'; rr(c, -34, -10, 68, 20, 10); c.fill(); c.restore();
      c.globalAlpha = 1;
    }
  }
  c.restore();
};

// ───────────────────────── Ночной город ─────────────────────────
// P: ground (y улицы), dawn (рассвет), danger (зарево), rain, metro (павильон с буквой М), figures { n, kind: 'people' | 'zombie' },
// hero и people (люди на улице, как в тоннеле),
// cutaway (разрез под землёй: эскалатор, станция, тоннель с тупиком), train (поезд в тупике)
function skyline(c, seed, base, hmin, hmax, wmin, wmax, fill, lit, T) {
  const r = rng(seed);
  let x = -90;
  while (x < W + 90) {
    const w = lerp(wmin, wmax, r()), h = lerp(hmin, hmax, r());
    c.fillStyle = fill; c.fillRect(x, base - h, w, h + 2);
    if (r() < 0.3) c.fillRect(x + w * 0.6, base - h - 50, 5, 50);
    const cols = Math.floor((w - 24) / 32), rows = Math.floor((h - 36) / 46);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const id = seed * 7919 + Math.round(x) * 13 + i * 131 + j * 17;
      const flip = Math.floor(T / 6 + hash(id) * 6);
      if (hash(id + flip * 0.37) < lit) {
        c.fillStyle = `rgba(242,${170 + Math.floor(hash(id + 3) * 50)},${90 + Math.floor(hash(id + 5) * 40)},${0.45 + hash(id + 9) * 0.45})`;
        c.fillRect(x + 16 + i * 32, base - h + 26 + j * 46, 15, 22);
      }
    }
    x += w + lerp(6, 34, r());
  }
}

SCENES.city = (c, S) => {
  const { t, T, P } = S;
  const gy = P.ground ?? (P.cutaway ? 700 : 1150), dawn = !!P.dawn;
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, dawn ? '#27365c' : '#0a0e1a'); g.addColorStop(1, dawn ? '#f0a378' : '#1e2539');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  if (!dawn) {
    const r = rng(7);
    for (let i = 0; i < 70; i++) {
      c.globalAlpha = 0.25 + 0.5 * noise1(T * 0.7 + i, 2);
      c.fillStyle = '#fff'; c.fillRect(r() * W, r() * gy * 0.55, 2.5, 2.5);
    }
    c.globalAlpha = 1;
    if (P.moon !== false) { circle(c, 190, 150, 50, '#e9e4d0'); glow(c, 190, 150, 200, '233,228,208', 0.12); }
  } else {
    glow(c, 620, gy - 40, 620, '255,170,110', 0.45);
    circle(c, 620, gy - 120, 60, 'rgba(255,214,160,0.9)');
  }
  skyline(c, 3, gy, gy * 0.42, gy * 0.8, 110, 200, dawn ? '#2c3554' : '#151b2b', dawn ? 0.08 : 0.22, T);
  if (P.danger) {
    for (let i = 0; i < 4; i++) glow(c, 120 + i * 270, gy - 80 - (i % 2) * 120, 260, '255,90,50', 0.18 + 0.08 * Math.sin(T * 2.3 + i * 2));
  }
  skyline(c, 11, gy, gy * 0.2, gy * 0.5, 140, 240, dawn ? '#343e5e' : '#1a2134', dawn ? 0.1 : 0.3, T);
  // улица
  c.fillStyle = '#3a404c'; c.fillRect(-80, gy - 14, W + 160, 16);
  c.fillStyle = '#272c36'; c.fillRect(-80, gy, W + 160, 66);
  c.fillStyle = '#5b616c';
  for (let x = -40; x < W + 40; x += 110) c.fillRect(x, gy + 30, 56, 6);
  // фонари
  for (const lx of [90, 470]) {
    c.fillStyle = '#2d323d'; c.fillRect(lx, gy - 230, 8, 230); c.fillRect(lx, gy - 230, 46, 8);
    circle(c, lx + 44, gy - 220, 8, '#ffe6b0');
    glow(c, lx + 44, gy - 220, 90, '255,214,150', dawn ? 0.12 : 0.35);
    if (dawn) continue;
    c.save(); c.globalCompositeOperation = 'lighter';
    const lg = c.createLinearGradient(0, gy - 220, 0, gy);
    lg.addColorStop(0, 'rgba(255,214,150,0.16)'); lg.addColorStop(1, 'rgba(255,214,150,0.02)');
    c.fillStyle = lg; c.beginPath(); c.moveTo(lx + 36, gy - 214); c.lineTo(lx + 52, gy - 214); c.lineTo(lx + 130, gy); c.lineTo(lx - 40, gy); c.fill();
    c.restore();
  }
  // павильон метро
  if (P.metro) {
    const mx = 700, mw = 270;
    c.fillStyle = '#2a303d'; c.fillRect(mx, gy - 170, mw, 170);
    c.fillStyle = '#ffd99a'; c.globalAlpha = 0.55; c.fillRect(mx + 20, gy - 140, mw - 40, 110); c.globalAlpha = 1;
    glow(c, mx + mw / 2, gy - 85, 200, '255,210,140', 0.18);
    c.fillStyle = '#1e232d'; c.fillRect(mx - 14, gy - 186, mw + 28, 22);
    c.fillStyle = '#1e232d'; c.fillRect(mx + mw / 2 - 4, gy - 300, 8, 116);
    circle(c, mx + mw / 2, gy - 330, 50, '#1b1f27');
    c.fillStyle = '#E4252D'; c.font = '900 72px Montserrat'; c.textAlign = 'center'; c.fillText('М', mx + mw / 2, gy - 304);
    glow(c, mx + mw / 2, gy - 330, 140, '228,37,45', 0.35 + 0.1 * Math.sin(T * 3));
  }
  // прохожие
  if (P.figures) {
    const n = P.figures.n ?? 4, zombie = P.figures.kind === 'zombie';
    for (let i = 0; i < n; i++) {
      const sp = (zombie ? 22 : 60) * (0.7 + hash(i) * 0.6), dir = hash(i + 9) < 0.5 ? 1 : -1;
      const x = ((hash(i + 4) * (W + 300) + dir * T * sp) % (W + 300) + W + 300) % (W + 300) - 150;
      drawPerson(c, x, gy - 4, 0.42, zombie
        ? { pose: 'walk', phase: T * 3 + i, facing: dir, skin: '#86b35a', jacket: '#3d4a3a', pants: '#2b2f3a', shoes: '#1b1f27', hat: 'none', zombie: true }
        : { pose: 'walk', phase: T * 5 + i, facing: dir, skin: '#1c2230', jacket: '#1c2230', pants: '#1c2230', shoes: '#1c2230', hair: '#1c2230', hat: 'hair' });
    }
  }
  if (P.hero || P.people) {
    drawPeople(c, [P.hero ? heroIn(S, { x: 840, light: null }) : null, ...(P.people || []).map((sp) => personIn(S, sp, { light: null }))], gy + 4, 0.8);
  }
  // под землёй
  if (P.cutaway || gy < H - 100) {
    earth(c, gy + 66, H + 80, 9);
  }
  if (P.cutaway) {
    const sy = 1180; // уровень станции
    // эскалатор
    c.save();
    c.strokeStyle = '#1a1d23'; c.lineWidth = 86; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(835, gy + 66); c.lineTo(620, sy - 60); c.stroke();
    c.strokeStyle = '#2f343d'; c.lineWidth = 60; c.stroke();
    c.setLineDash([10, 18]); c.lineDashOffset = -T * 40; c.strokeStyle = '#4a515c'; c.lineWidth = 40; c.stroke();
    c.restore();
    // станция
    c.fillStyle = '#383e49'; c.fillRect(420, sy - 110, 380, 150);
    glow(c, 610, sy - 40, 260, '255,220,160', 0.2);
    c.fillStyle = '#4d5562'; for (let x = 450; x < 790; x += 70) c.fillRect(x, sy - 110, 16, 150);
    c.fillStyle = '#20242b'; c.fillRect(420, sy + 40, 380, 14);
    // тоннели
    c.fillStyle = '#0d0f13'; c.fillRect(70, sy - 70, 352, 120); c.fillRect(798, sy - 70, 400, 120);
    c.fillStyle = '#3d4249'; c.fillRect(70, sy + 34, 352, 6); c.fillRect(798, sy + 34, 400, 6);
    c.fillStyle = '#c0392b'; c.fillRect(62, sy - 70, 12, 120); // тупик
    c.fillStyle = '#e9c46a'; c.fillRect(80, sy + 6, 14, 28);
    if (P.train !== false) {
      drawTrain(c, 100, sy + 34, { cars: 1, scale: 0.3, lit: false });
      const k = 0.5 + 0.5 * Math.sin(T * 4);
      glow(c, 215, sy - 6, 70 + k * 30, '255,212,59', 0.35);
    }
  }
  if (P.rain) {
    c.strokeStyle = 'rgba(170,190,230,0.35)'; c.lineWidth = 2;
    const rr2 = rng(4);
    for (let i = 0; i < 160; i++) {
      const x = (rr2() * (W + 200) + T * 220) % (W + 200) - 100, y = (rr2() * H + T * 1600 * (0.8 + rr2() * 0.4)) % gy;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - 8, y + 34); c.stroke();
    }
  }
};

// Вагон метро сбоку. (x, yRail) — левый край и уровень рельса. opts: cars, scale, lit (свет в окнах),
// head ('left' | 'right' — где кабина и фары), headlights.
function drawTrain(c, x, yRail, o = {}) {
  const s = o.scale ?? 1, cars = o.cars ?? 1, len = 780;
  c.save(); c.translate(x, yRail); c.scale(s, s);
  for (let k = 0; k < cars; k++) {
    const x0 = k * (len + 26);
    c.fillStyle = '#16191e'; c.fillRect(x0 + 30, -64, len - 60, 30);
    for (const bx of [x0 + 120, x0 + len - 200]) {
      c.fillStyle = '#23262c'; rr(c, bx - 20, -70, 120, 40, 8); c.fill();
      circle(c, bx + 8, -24, 24, '#121418'); circle(c, bx + 72, -24, 24, '#121418');
      circle(c, bx + 8, -24, 8, '#4b5058'); circle(c, bx + 72, -24, 8, '#4b5058');
    }
    c.fillStyle = '#2c5da8'; rr(c, x0, -340, len, 286, 28); c.fill();
    c.fillStyle = '#8f9aa6'; rr(c, x0 + 26, -352, len - 52, 20, 10); c.fill();
    c.fillStyle = '#e8edf2'; c.fillRect(x0, -150, len, 14);
    c.fillStyle = '#20467f'; c.fillRect(x0, -96, len, 26);
    for (let d = 0; d < 3; d++) {
      const dx = x0 + 90 + d * 250;
      c.fillStyle = '#3b6fbf'; c.fillRect(dx, -318, 104, 252);
      c.fillStyle = '#1b3a6a'; c.fillRect(dx + 50, -318, 4, 252);
      c.fillStyle = o.lit ? '#f3e2b0' : '#080b10';
      rr(c, dx + 12, -296, 32, 110, 8); c.fill(); rr(c, dx + 60, -296, 32, 110, 8); c.fill();
      if (d < 2) { rr(c, dx + 128, -292, 100, 92, 12); c.fill(); }
    }
  }
  if (o.head) {
    const hx = o.head === 'left' ? -8 : cars * (len + 26) - 18;
    c.fillStyle = '#1f3f73'; rr(c, hx - 14, -334, 40, 280, 18); c.fill();
    c.fillStyle = '#0a0d12'; rr(c, hx - 8, -300, 28, 120, 8); c.fill();
    for (const hy of [-120, -96]) {
      circle(c, hx + 6, hy, 9, o.headlights ? '#fff8de' : '#8d99a8');
      if (o.headlights) glow(c, hx + 6, hy, 120, '255,240,200', 0.5);
    }
  }
  c.restore();
}

// ───────────────────────── Тоннель в разрезе ─────────────────────────
// P: style ('metro' | 'brick'), lamps (горят ли лампы), dark (0..1), rail (at — подсветить контактный рельс),
// sparks, train { x, cars, head, lit, glowAt (x окна со светом внутри) }, loco { from, until, x0, x1 },
// niche (x ниши), signal { x, color }, figure { walk: [x0, x1], from, until, eyes }, phantoms (at), tint (цвет темноты),
// fog { color, from }, water (уровень, 0..1), surface (город над разрезом), hero { walk, x, light, lightOff, pose },
// people [{ who, …как hero }], lights [{ x, y, r } или конус { x, y, a, spread, len }], pickets [{ x, text, at }],
// wind (at — пошёл ветер от поезда)
SCENES.tunnel = (c, S) => {
  const { t, T, P } = S;
  const top = 500, floor = 1210, base = 1290;
  earth(c, -80, H + 80, 2);
  // стены
  if (P.style === 'brick') {
    c.fillStyle = '#4b3127'; c.fillRect(-80, top, W + 160, floor - top);
    const r = rng(8);
    for (let y = top, row = 0; y < floor; y += 30, row++) {
      for (let x = -80 + (row % 2) * 34; x < W + 80; x += 68) {
        c.fillStyle = `hsl(14, ${30 + r() * 12}%, ${22 + r() * 8}%)`; c.fillRect(x, y, 64, 26);
      }
    }
    for (let x = 120; x < W; x += 420) {
      c.fillStyle = '#0d0b0a'; c.beginPath(); c.moveTo(x, floor); c.lineTo(x, floor - 230); c.arc(x + 80, floor - 230, 80, Math.PI, TAU); c.lineTo(x + 160, floor); c.fill();
    }
    c.fillStyle = '#6f777f'; c.fillRect(-80, top + 70, W + 160, 12);
  } else {
    const g = c.createLinearGradient(0, top, 0, floor);
    g.addColorStop(0, '#1d2025'); g.addColorStop(0.25, '#2b2f35'); g.addColorStop(1, '#3a3e44');
    c.fillStyle = g; c.fillRect(-80, top, W + 160, floor - top);
    for (let x = -60; x < W + 80; x += 150) {
      c.fillStyle = '#24272c'; c.fillRect(x, top, 16, floor - top);
      c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x + 16, top, 3, floor - top);
      c.fillStyle = '#4b5057'; for (let y = top + 60; y < floor; y += 110) circle(c, x + 8, y, 4, '#4b5057');
    }
    // кабели
    c.lineWidth = 7;
    for (let k = 0; k < 3; k++) {
      c.strokeStyle = k === 1 ? '#3a2b1d' : '#121417';
      c.beginPath();
      for (let x = -80; x < W + 80; x += 300) { c.moveTo(x, top + 130 + k * 20); c.quadraticCurveTo(x + 150, top + 160 + k * 20, x + 300, top + 130 + k * 20); }
      c.stroke();
    }
  }
  const sh = c.createLinearGradient(0, top, 0, top + 120);
  sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sh; c.fillRect(-80, top, W + 160, 120);
  c.fillStyle = '#0b0a09'; c.fillRect(-80, top - 24, W + 160, 26);

  // ниша
  if (P.niche != null) {
    const nx = P.niche;
    c.fillStyle = '#121418'; c.beginPath(); c.moveTo(nx, floor); c.lineTo(nx, floor - 330); c.arc(nx + 85, floor - 330, 85, Math.PI, TAU); c.lineTo(nx + 170, floor); c.fill();
    c.strokeStyle = '#4a4f56'; c.lineWidth = 6; c.stroke();
  }
  // светофор
  if (P.signal) {
    const sx = P.signal.x ?? 80;
    c.fillStyle = '#16181c'; rr(c, sx, floor - 360, 44, 100, 12); c.fill(); c.fillRect(sx + 18, floor - 260, 8, 250);
    const sc = P.signal.color === 'green' ? '60,220,120' : '255,50,40';
    circle(c, sx + 22, floor - 336, 11, `rgb(${sc})`);
  }
  // лампы
  const lamps = [];
  if (P.lamps !== undefined) {
    for (let x = 180; x < W; x += 380) {
      c.fillStyle = '#1a1c20'; rr(c, x - 26, top + 40, 52, 28, 8); c.fill();
      circle(c, x, top + 60, 11, P.lamps ? '#fff1c9' : '#3b3d40');
      if (P.lamps) lamps.push({ x, y: top + 60, r: 420, k: 0.8 });
    }
  }
  // пути
  c.fillStyle = '#2b2e33'; c.fillRect(-80, floor, W + 160, base - floor);
  c.fillStyle = '#45484d';
  for (let x = -60; x < W + 80; x += 66) c.fillRect(x, floor - 10, 42, 16);
  c.fillStyle = '#7f868e'; c.fillRect(-80, floor - 22, W + 160, 12);
  c.fillStyle = '#b8bfc6'; c.fillRect(-80, floor - 22, W + 160, 3);
  c.fillStyle = '#111215'; c.fillRect(-80, base, W + 160, H);
  earth(c, base + 30, H + 80, 4);

  // поезд в тупике
  if (P.train) {
    drawTrain(c, P.train.x ?? 520, floor - 22, { cars: P.train.cars ?? 2, scale: P.train.scale ?? 0.95, lit: P.train.lit, head: P.train.head, headlights: P.train.headlights });
  }
  // герой
  if (P.pickets) pickets(c, P.pickets, t, T, top);
  const people = [heroIn(S, { x: 360, light: 'phone' }), ...(P.people || []).map((sp) => personIn(S, sp, { light: null }))];
  const hands = drawPeople(c, people, floor - 8, 1.25);
  // мотовоз
  let loco = null;
  if (P.loco) {
    const L = P.loco, t0 = L.from ?? 0, t1 = L.until ?? S.d;
    const k = clamp((t - t0) / Math.max(0.1, t1 - t0));
    const lx = lerp(L.x0 ?? -900, L.x1 ?? 400, k);
    if (t >= t0) {
      drawLoco(c, lx, floor - 22);
      loco = { x: lx + 560, y: floor - 160, k: clamp((t - t0) / 1.2) };
    } else if (L.glowFrom != null && t >= L.glowFrom) {
      loco = { x: -40, y: floor - 160, k: clamp((t - L.glowFrom) / Math.max(0.1, t0 - L.glowFrom)) * 0.7, edge: true };
    }
  }
  // контактный рельс (ближе к зрителю, чем ходовой)
  const hot = P.rail != null && t >= P.rail;
  const pulse = hot ? 0.5 + 0.5 * Math.sin(T * 8) : 0;
  for (let x = -40; x < W + 80; x += 240) { c.fillStyle = '#3d4046'; c.fillRect(x, floor + 8, 12, 46); }
  c.fillStyle = hot ? `rgb(${lerp(200, 255, pulse)},${lerp(160, 90, pulse)},40)` : '#b89a3c';
  c.fillRect(-80, floor + 2, W + 160, 20);
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-80, floor + 18, W + 160, 6);
  c.fillStyle = '#6c7178'; c.fillRect(-80, floor + 24, W + 160, 10);

  if (P.water) {
    const wy = lerp(floor + 20, top, P.water);
    c.fillStyle = 'rgba(40,90,95,0.82)'; c.fillRect(-80, wy, W + 160, base - wy + 40);
    c.strokeStyle = 'rgba(160,220,220,0.4)'; c.lineWidth = 3; c.beginPath();
    for (let x = -80; x < W + 80; x += 20) c.lineTo(x, wy + Math.sin(x / 40 + T * 2) * 4);
    c.stroke();
  }
  if (P.fog) {
    const k = after(t, P.fog.from ?? 0, 1.5), col = P.fog.color || '200,190,80';
    for (let i = 0; i < 9; i++) glow(c, (i * 160 + T * 20) % (W + 300) - 150, floor - 200 - (i % 3) * 120, 260, col, 0.12 * k);
  }

  // свет и темнота
  const lights = [...lamps];
  for (const hand of hands) lights.push({ x: hand.x, y: hand.y, a: hand.a, spread: 0.36, len: 820, r: 200 });
  for (const L of P.lights || []) lights.push(L);
  if (loco) lights.push({ x: loco.x, y: loco.y, a: 0, spread: 0.4, len: 1300, r: 360, k: loco.k });
  if (P.signal) lights.push({ x: (P.signal.x ?? 80) + 22, y: floor - 336, r: 380, k: 0.75 });
  if (P.train && P.train.glowAt != null) lights.push({ x: (P.train.x ?? 520) + P.train.glowAt * (P.train.scale ?? 0.95), y: floor - 260, r: 180, k: 0.7 });
  if (hot) lights.push({ x: W / 2, y: floor + 12, r: 900, k: 0.35 + 0.25 * pulse });
  darkness(c, P.dark ?? 0, lights, P.tint || '2,3,6');
  // силуэт поверх темноты, чтобы читался на фоне стены
  if (P.figure) {
    const fg = P.figure, t0 = fg.from ?? 0, t1 = fg.until ?? S.d;
    const k = clamp((t - t0) / Math.max(0.1, t1 - t0));
    if (t >= t0) {
      drawPerson(c, lerp(fg.walk[0], fg.walk[1], k), floor - 8, fg.scale ?? 1.32, {
        pose: k < 1 ? 'walk' : 'stand', phase: T * 3.2, facing: Math.sign(fg.walk[1] - fg.walk[0]) || 1, silhouette: '#020203', hat: 'none', light: null, eyes: fg.eyes,
      });
    }
  }

  if (P.signal) glow(c, (P.signal.x ?? 80) + 22, floor - 336, 160, P.signal.color === 'green' ? '60,220,120' : '255,50,40', 0.55);
  if (P.train && P.train.glowAt != null) {
    const gx = (P.train.x ?? 520) + P.train.glowAt * (P.train.scale ?? 0.95);
    glow(c, gx, floor - 245, 70, '170,200,255', 0.3 + 0.06 * Math.sin(T * 2));
  }
  if (P.surface) surface(c, T, top - 170);
  for (const hand of hands) { beam(c, hand.x, hand.y, hand.a, 0.36, 760, 0.2); glow(c, hand.x, hand.y, 40, '255,255,240', 0.7); }
  for (const L of P.lights || []) {
    if (L.len) beam(c, L.x, L.y, L.a, L.spread ?? 0.4, L.len * 0.85, 0.16, L.rgb);
    glow(c, L.x, L.y, L.len ? 60 : (L.r ?? 200) * 0.35, L.rgb || '200,220,255', 0.35);
  }
  if (P.wind != null && t >= P.wind) wind(c, t - P.wind, T, top, floor);
  if (loco) {
    beam(c, loco.x, loco.y, 0, 0.4, 1200, 0.32 * loco.k, '255,236,190');
    glow(c, loco.x, loco.y, loco.edge ? 520 : 160, '255,236,190', 0.8 * loco.k);
  }
  if (hot) {
    glow(c, W / 2, floor + 12, 600, '255,120,40', 0.12 + 0.1 * pulse);
    if (P.sparks !== false) sparks(c, T, floor + 10);
  }
  if (P.phantoms != null && t >= P.phantoms) {
    const k = after(t, P.phantoms, 2.5);
    for (let i = 0; i < 14; i++) {
      const life = (T * 0.35 + hash(i) * 7) % 1;
      const x = hash(i * 3 + Math.floor(T * 0.35 + hash(i) * 7)) * W, y = 420 + hash(i * 5 + Math.floor(T * 0.35 + hash(i) * 7)) * 1000;
      const cols = ['120,200,255', '255,120,200', '160,255,170', '255,220,120'];
      glow(c, x, y, 40 + hash(i + 2) * 60, cols[i % 4], Math.sin(life * Math.PI) * 0.4 * k);
    }
  }
};

// Таблички-пикеты на стене тоннеля (каждые 100 м). at — когда подсветить.
function pickets(c, list, t, T, top) {
  for (const pk of list) {
    const x = pk.x, y = top + 300, lit = pk.at != null && t >= pk.at;
    c.fillStyle = '#e9e6dc'; rr(c, x - 70, y - 38, 140, 76, 6); c.fill();
    c.strokeStyle = '#1b1d22'; c.lineWidth = 4; c.stroke();
    c.fillStyle = '#16181c'; c.font = '800 34px "JetBrains Mono"'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(pk.text, x, y + 2); c.textBaseline = 'alphabetic';
    if (lit) glow(c, x, y, 160, '255,220,120', 0.25 + 0.1 * Math.sin(T * 5));
  }
}

// Поток воздуха вдоль тоннеля: штрихи и пыль летят слева направо, сила нарастает за 1,5 с.
function wind(c, dt, T, top, floor) {
  const k = clamp(dt / 1.5);
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const sp = 700 + hash(i) * 900, len = 60 + hash(i + 1) * 160;
    const x = ((hash(i + 2) * (W + 400) + T * sp) % (W + 400)) - 200, y = top + 60 + hash(i + 3) * (floor - top - 90);
    c.strokeStyle = `rgba(220,230,255,${(0.16 + hash(i + 4) * 0.22) * k})`; c.lineWidth = 2 + hash(i + 5) * 3;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + Math.sin(T * 3 + i) * 4); c.stroke();
  }
  for (let i = 0; i < 60; i++) {
    const x = ((hash(i + 70) * (W + 200) + T * (400 + hash(i + 71) * 500)) % (W + 200)) - 100;
    const y = top + 80 + hash(i + 72) * (floor - top - 100) + Math.sin(T * 4 + i) * 10;
    circle(c, x, y, 2.5 + hash(i + 73) * 3, `rgba(230,220,200,${0.6 * k})`);
  }
  c.restore();
}

// Полоска ночного города над разрезом: небо, дома, улица на уровне gy.
function surface(c, T, gy) {
  const g = c.createLinearGradient(0, -80, 0, gy);
  g.addColorStop(0, '#0a0e1a'); g.addColorStop(1, '#1e2539');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  skyline(c, 21, gy, gy * 0.35, gy * 0.75, 90, 170, '#151b2b', 0.22, T);
  skyline(c, 23, gy, gy * 0.15, gy * 0.45, 120, 200, '#1a2134', 0.3, T);
  c.fillStyle = '#3a404c'; c.fillRect(-80, gy - 10, W + 160, 12);
  c.fillStyle = '#272c36'; c.fillRect(-80, gy, W + 160, 34);
}

function drawLoco(c, x, yRail) {
  c.save(); c.translate(x, yRail);
  c.fillStyle = '#16191e'; c.fillRect(40, -70, 520, 34);
  for (const wx of [110, 470]) { circle(c, wx, -26, 26, '#121418'); circle(c, wx, -26, 9, '#555b63'); }
  c.fillStyle = '#E2A81F'; rr(c, 0, -250, 600, 190, 16); c.fill();
  c.fillStyle = '#c48d12'; c.fillRect(0, -110, 600, 14);
  c.fillStyle = '#E2A81F'; rr(c, 380, -360, 210, 130, 14); c.fill();
  c.fillStyle = '#0c0f14'; rr(c, 410, -336, 150, 72, 10); c.fill();
  for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#111' : '#E2A81F'; c.fillRect(560 + 0, -250 + i * 32, 40, 32); }
  circle(c, 586, -160, 13, '#fff7da');
  c.restore();
}

function sparks(c, T, y) {
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const seed = Math.floor(T * 14) * 7 + i;
    if (hash(seed) < 0.45) continue;
    const x = hash(seed + 1) * W;
    c.strokeStyle = `rgba(170,210,255,${0.6 + hash(seed + 2) * 0.4})`;
    c.beginPath(); c.moveTo(x, y);
    let px = x, py = y;
    for (let k = 0; k < 6; k++) { px += (hash(seed + k * 3) - 0.5) * 60; py -= 14 + hash(seed + k * 5) * 22; c.lineTo(px, py); }
    c.stroke();
    glow(c, x, y, 90, '150,200,255', 0.5);
  }
  c.restore();
}

// ───────────────────────── Схема линии метро ─────────────────────────
// P: path ([[x, y], …]), color, stations [{ name, pos (0..1 вдоль линии) }], deadEnd (с какой доли линия
// пунктиром — тупик), marker { pos, label, at }, measure { a, b, text, at } — отрезок от доли a до доли b
function pathTools(pts) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
  const at = (u) => {
    let d = clamp(u) * total;
    for (let i = 0; i < seg.length; i++) {
      if (d <= seg[i] || i === seg.length - 1) {
        const k = seg[i] ? d / seg[i] : 0, a = pts[i], b = pts[i + 1];
        return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.atan2(b[1] - a[1], b[0] - a[0])];
      }
      d -= seg[i];
    }
  };
  const stroke = (c, u0, u1) => {
    c.beginPath(); const [x0, y0] = at(u0); c.moveTo(x0, y0);
    let acc = 0;
    for (let i = 0; i < seg.length; i++) {
      const s0 = acc / total, s1 = (acc + seg[i]) / total; acc += seg[i];
      if (s1 > u0 && s0 < u1) { const [x, y] = at(Math.min(s1, u1)); c.lineTo(x, y); }
    }
    c.stroke();
  };
  return { at, stroke };
}

SCENES.map = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#0d1015'; c.fillRect(-80, -80, W + 160, H + 160);
  const r = rng(12);
  c.fillStyle = '#131820';
  for (let i = 0; i < 40; i++) rr(c, r() * W - 60, 300 + r() * 1200, 80 + r() * 180, 60 + r() * 140, 10), c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.035)'; c.lineWidth = 2;
  for (let x = 0; x < W; x += 60) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 60) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }

  const pts = P.path || [[60, 1120], [330, 1120], [560, 890], [1010, 890]];
  const L = pathTools(pts), col = color(P.color, '#E4252D');
  const reveal = ease.out(t / 0.9), dead = P.deadEnd ?? 1;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = col; c.lineWidth = 26; L.stroke(c, 0, Math.min(reveal, dead));
  if (reveal > dead) {
    c.setLineDash([22, 18]); c.lineWidth = 14; c.strokeStyle = shade(col, -0.25); L.stroke(c, dead, reveal); c.setLineDash([]);
    const [ex, ey, ea] = L.at(reveal);
    c.save(); c.translate(ex, ey); c.rotate(ea); c.fillStyle = '#fff'; c.fillRect(6, -26, 10, 52); c.restore();
  }
  (P.stations || []).forEach((st, i) => {
    if (st.pos > reveal) return;
    const [x, y] = L.at(st.pos), k = ease.back(after(t, st.pos * 0.9, 0.3));
    circle(c, x, y, 26 * k, '#fff'); circle(c, x, y, 14 * k, col);
    c.globalAlpha = clamp(k); c.fillStyle = '#fff'; c.font = '700 38px Montserrat'; c.textAlign = 'center';
    c.fillText(st.name, x, y + (i % 2 ? 90 : -56));
    c.globalAlpha = 1;
  });
  if (P.measure) {
    const m = P.measure, k = after(t, m.at ?? 1, 0.5);
    if (k > 0) {
      const [x0, y0, a] = L.at(m.a), [x1, y1] = L.at(lerp(m.a, m.b, ease.out(k)));
      const nx = -Math.sin(a) * 70, ny = Math.cos(a) * 70;
      c.strokeStyle = PAL.yellow; c.lineWidth = 5;
      c.beginPath(); c.moveTo(x0 + nx * 0.6, y0 + ny * 0.6); c.lineTo(x0 + nx, y0 + ny); c.lineTo(x1 + nx, y1 + ny); c.lineTo(x1 + nx * 0.6, y1 + ny * 0.6); c.stroke();
      c.globalAlpha = k; c.fillStyle = PAL.yellow; c.font = '800 46px Montserrat'; c.textAlign = 'center';
      c.fillText(m.text, (x0 + x1) / 2 + nx * 1.9, (y0 + y1) / 2 + ny * 1.9 + 14);
      c.globalAlpha = 1;
    }
  }
  if (P.marker) {
    const mk = P.marker, k = after(t, mk.at ?? 0.8, 0.4);
    if (k > 0) {
      const [x, y] = L.at(mk.pos), pulse = (T * 1.2) % 1;
      c.strokeStyle = `rgba(255,212,59,${1 - pulse})`; c.lineWidth = 4;
      c.beginPath(); c.arc(x, y, 30 + pulse * 70, 0, TAU); c.stroke();
      circle(c, x, y, 24 * ease.back(k), PAL.yellow); circle(c, x, y, 9 * k, '#1a1a1a');
      if (mk.label) {
        c.globalAlpha = k; c.font = '800 34px Montserrat'; const tw = c.measureText(mk.label).width;
        c.fillStyle = PAL.yellow; rr(c, x - tw / 2 - 20, y - 122, tw + 40, 56, 14); c.fill();
        c.fillStyle = '#16140a'; c.textAlign = 'center'; c.fillText(mk.label, x, y - 82);
        c.globalAlpha = 1;
      }
    }
  }
};

// ───────────────────────── Записи в блокноте ─────────────────────────
// P: title, lines [{ text, at }], light (луч фонаря гуляет по листу)
SCENES.note = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#060607'; c.fillRect(-80, -80, W + 160, H + 160);
  c.save(); c.translate(W / 2, 900); c.rotate(-0.035); c.translate(-W / 2, -900);
  const px = 130, py = 330, pw = 820, ph = 1060;
  c.fillStyle = 'rgba(0,0,0,0.6)'; c.filter = 'blur(24px)'; c.fillRect(px + 20, py + 30, pw, ph); c.filter = 'none';
  c.fillStyle = '#ece5d3'; c.fillRect(px, py, pw, ph);
  c.strokeStyle = 'rgba(70,110,170,0.35)'; c.lineWidth = 2;
  for (let y = py + 150; y < py + ph; y += 62) { c.beginPath(); c.moveTo(px, y); c.lineTo(px + pw, y); c.stroke(); }
  c.strokeStyle = 'rgba(200,60,60,0.45)'; c.beginPath(); c.moveTo(px + 90, py); c.lineTo(px + 90, py + ph); c.stroke();
  c.fillStyle = '#0d0d0f';
  for (let y = py + 40; y < py + ph; y += 70) circle(c, px + 34, y, 11, '#0d0d0f');
  const ink = '#243447';
  c.fillStyle = ink; c.textAlign = 'left'; c.font = '700 64px Caveat';
  if (P.title) c.fillText(P.title, px + 120, py + 110);
  (P.lines || []).forEach((ln, i) => {
    const k = after(t, ln.at ?? 0.5 + i, 0.7);
    if (k <= 0) return;
    const y = py + 150 + 62 * (i * 2 + 1) - 14;
    c.save(); c.font = '600 56px Caveat';
    const w = c.measureText(ln.text).width;
    c.beginPath(); c.rect(px + 110, y - 60, (w + 20) * k, 90); c.clip();
    c.fillStyle = ln.color ? color(ln.color) : ink; c.fillText(ln.text, px + 120, y);
    c.restore();
    if (ln.strike && t > (ln.at ?? 0) + 0.8) {
      c.strokeStyle = '#c0392b'; c.lineWidth = 5; c.beginPath(); c.moveTo(px + 112, y - 16); c.lineTo(px + 130 + w, y - 22); c.stroke();
    }
  });
  c.restore();
  const lx = W / 2 + Math.sin(T * 0.7) * 120 + (noise1(T * 2) - 0.5) * 40, ly = 860 + Math.cos(T * 0.5) * 140;
  darkness(c, P.light === false ? 0 : 0.86, [{ x: lx, y: ly, r: 900 }], '2,2,4');
};

// ───────────────────────── Доска почёта ─────────────────────────
// P: who (кого из cast показать в выделенной рамке), focus (номер рамки 0..5), caption (подпись под ней), at
function drawBust(c, x, y, s, o) { // портрет анфас: (x, y) — низ плеч
  c.save(); c.translate(x, y); c.scale(s, s);
  c.fillStyle = o.jacket; rr(c, -95, -120, 190, 140, 50); c.fill();
  if (o.stripes) { c.fillStyle = 'rgba(236,240,240,0.9)'; c.fillRect(-95, -70, 190, 14); }
  c.fillStyle = o.skin; c.fillRect(-18, -150, 36, 40);
  circle(c, 0, -195, 62, o.skin);
  if (o.hat === 'helmet' || o.hat === 'cap') {
    c.fillStyle = o.hatColor; c.beginPath(); c.arc(0, -212, 66, Math.PI, TAU); c.fill(); rr(c, -76, -218, 152, 14, 6); c.fill();
  } else if (o.hat !== 'none') {
    c.fillStyle = o.hair; c.beginPath(); c.arc(0, -208, 64, Math.PI * 1.02, Math.PI * 1.98); c.fill();
  }
  circle(c, -22, -192, 6, '#1b1d22'); circle(c, 22, -192, 6, '#1b1d22');
  c.strokeStyle = '#1b1d22'; c.lineWidth = 4; c.beginPath(); c.moveTo(-16, -160); c.lineTo(16, -160); c.stroke();
  if (o.mustache) { c.fillStyle = o.hair; rr(c, -28, -176, 56, 12, 6); c.fill(); }
  c.restore();
}

SCENES.board = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#d9d2bd'; c.fillRect(-80, -80, W + 160, 1280);
  c.fillStyle = '#3f5f52'; c.fillRect(-80, 1200, W + 160, H);
  c.fillStyle = '#2f483e'; c.fillRect(-80, 1192, W + 160, 12);
  // лампа дневного света
  const flick = hash(Math.floor(T * 12)) > 0.08 ? 1 : 0.7;
  c.fillStyle = '#f4f2ea'; rr(c, 300, 40, 480, 26, 10); c.fill();
  // доска
  const bx = 120, by = 300, bw = 840, bh = 1020;
  c.fillStyle = '#5b3420'; rr(c, bx - 24, by - 24, bw + 48, bh + 48, 18); c.fill();
  c.fillStyle = '#9b1c22'; c.fillRect(bx, by, bw, bh);
  c.fillStyle = '#e9c46a'; c.font = '900 56px Montserrat'; c.textAlign = 'center';
  c.fillText('ДОСКА ПОЧЁТА', W / 2, by + 90);
  const people = [
    { hat: 'hair', hair: '#3b2a20', jacket: '#4a5568', skin: '#e9c3a0' },
    { hat: 'hair', hair: '#151515', jacket: '#2f3e57', skin: '#efcba8' },
    { hat: 'hair', hair: '#7a6a5a', jacket: '#3d4a3a', skin: '#e3b894', mustache: true },
    { hat: 'hair', hair: '#2a1f18', jacket: '#55406a', skin: '#f0cfb0' },
    null,
    { hat: 'none', hair: '#888', jacket: '#3a3f47', skin: '#e6bd99' },
  ];
  const focus = P.focus ?? 4, star = { ...HERO_DEFAULT, ...(S.cast[P.who] || {}) };
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const fx = bx + 50 + col * 260, fy = by + 150 + row * 420, fw = 220, fh = 280;
    c.fillStyle = '#e8dcc0'; c.fillRect(fx - 10, fy - 10, fw + 20, fh + 20);
    c.save(); c.beginPath(); c.rect(fx, fy, fw, fh); c.clip();
    c.fillStyle = '#c9b48f'; c.fillRect(fx, fy, fw, fh);
    c.filter = i === focus ? 'sepia(0.45) contrast(0.95)' : 'sepia(0.85) grayscale(0.35) contrast(0.95)';
    drawBust(c, fx + fw / 2, fy + fh + 10, 1.05, { ...HERO_DEFAULT, ...(i === focus ? star : people[i]) });
    c.filter = 'none'; c.restore();
    c.fillStyle = '#f2ead6'; c.fillRect(fx, fy + fh + 26, fw, 64);
    c.fillStyle = 'rgba(40,30,20,0.55)';
    if (i === focus && P.caption && t >= (P.at ?? 0)) {
      const k = after(t, P.at ?? 0, 0.6);
      c.save(); c.beginPath(); c.rect(fx, fy + fh + 26, fw * k, 64); c.clip();
      c.fillStyle = '#2a2018'; c.font = '700 21px "JetBrains Mono"'; c.textAlign = 'center';
      P.caption.split('\n').forEach((ln, j) => c.fillText(ln, fx + fw / 2, fy + fh + 52 + j * 26));
      c.restore();
    } else {
      c.fillRect(fx + 30, fy + fh + 44, fw - 60, 8); c.fillRect(fx + 50, fy + fh + 62, fw - 100, 8);
    }
  }
  c.fillStyle = `rgba(0,0,0,${0.12 + (1 - flick) * 0.25})`; c.fillRect(-80, -80, W + 160, H + 160);
  vignette(c, 0.55);
};

// ───────────────────────── Титр (обложка, конец серии) ─────────────────────────
// P: kicker (мелко сверху), title [строка или { text, color }], sub (мелко снизу)
SCENES.card = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#060608'; c.fillRect(-80, -80, W + 160, H + 160);
  glow(c, W / 2, 820, 700, '255,40,40', 0.06 + 0.03 * Math.sin(T * 2));
  c.textAlign = 'center';
  if (P.kicker) {
    c.globalAlpha = after(t, 0.1, 0.4); c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '500 40px "JetBrains Mono"';
    c.fillText(P.kicker, W / 2, 640); c.globalAlpha = 1;
  }
  const lines = (P.title || []).map((l) => (typeof l === 'string' ? { text: l } : l));
  lines.forEach((l, i) => {
    const k = ease.back(after(t, 0.15 + i * 0.25, 0.35));
    if (k <= 0) return;
    c.save(); c.translate(W / 2, 770 + i * 130); c.scale(k, k);
    fitFont(c, l.text.toUpperCase(), 900, 130, 'Montserrat', 960);
    c.fillStyle = color(l.color, '#fff'); c.fillText(l.text.toUpperCase(), 0, 0);
    c.restore();
  });
  if (P.sub) {
    c.globalAlpha = after(t, 0.9, 0.4) * (0.6 + 0.4 * Math.sin(T * 3)); c.fillStyle = 'rgba(255,255,255,0.75)';
    c.font = '500 36px "JetBrains Mono"'; c.fillText(P.sub, W / 2, 770 + lines.length * 130 + 30);
    c.globalAlpha = 1;
  }
};

// Пустой фон под плашки и большие цифры. P: bg (цвет)
SCENES.blank = (c, S) => {
  c.fillStyle = S.P.bg || '#0b0d12'; c.fillRect(-80, -80, W + 160, H + 160);
  vignette(c, 0.6);
};

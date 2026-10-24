'use strict';
// Сцены для фэнтези-историй: комната с зеркалом и порталом, временная линия с ветками, Пустота на краю времени
// с тучей Алиот, мифический восьминогий конь. Люди здесь умеют быть иллюзией (ghost), выходить из портала (enter)
// и исчезать со вспышкой (vanish).

function burst(c, x, y, k, rgb) {
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + hash(i) * 0.4, r = 40 + k * (120 + hash(i + 3) * 80);
    circle(c, x + Math.cos(a) * r, y + Math.sin(a) * r, 4 + 4 * (1 - k), `rgba(${rgb},${1 - k})`);
  }
  glow(c, x, y, 200, rgb, 0.6 * (1 - k));
}

// Иней на стекле: k 0..1 — насколько окно затянуло. Рисуется внутри уже обрезанного окна.
function frost(c, x, y, w, h, k) {
  if (k <= 0) return;
  for (const [cx, cy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, 340 * k);
    g.addColorStop(0, `rgba(225,238,255,${0.75 * k})`); g.addColorStop(1, 'rgba(225,238,255,0)');
    c.fillStyle = g; c.fillRect(x, y, w, h);
  }
  const r = rng(12);
  c.strokeStyle = `rgba(240,248,255,${0.55 * k})`; c.lineWidth = 2;
  for (let i = 0; i < 46; i++) {
    const side = i % 4, u = r();
    let px = side === 0 ? x + u * w : side === 1 ? x + w : side === 2 ? x + u * w : x;
    let py = side === 0 ? y : side === 1 ? y + u * h : side === 2 ? y + h : y + u * h;
    let a = side === 0 ? Math.PI / 2 : side === 1 ? Math.PI : side === 2 ? -Math.PI / 2 : 0;
    a += (r() - 0.5) * 1.2;
    const len = (40 + r() * 110) * k;
    c.beginPath(); c.moveTo(px, py);
    for (let s2 = 0; s2 < 4; s2++) {
      const nx = px + Math.cos(a) * len / 4, ny = py + Math.sin(a) * len / 4;
      c.lineTo(nx, ny);
      c.moveTo(nx, ny); c.lineTo(nx + Math.cos(a + 0.8) * len / 7, ny + Math.sin(a + 0.8) * len / 7);
      c.moveTo(nx, ny); c.lineTo(nx + Math.cos(a - 0.8) * len / 7, ny + Math.sin(a - 0.8) * len / 7);
      c.moveTo(nx, ny); px = nx; py = ny;
    }
    c.stroke();
  }
}

// people: [{ …персонаж, ghost, enter: at, vanish: at }] → точки фонарей
function drawFolk(c, S, list, y, scale) {
  const hands = [];
  for (const p of list) {
    if (!p) continue;
    const s = p.scale ?? scale, py = p.y ?? y;
    let a = p.enter != null ? after(S.t, p.enter, 0.5) : 1;
    if (p.vanish != null && S.t >= p.vanish) {
      const k = clamp((S.t - p.vanish) / 0.4);
      a = Math.min(a, 1 - k);
      if (k < 1) burst(c, p.x, py - 140 * s, k, p.ghost ? '120,255,140' : '255,160,60');
    }
    if (a <= 0) continue;
    c.save(); c.globalAlpha = a * (p.ghost ? 0.82 : 1);
    if (p.ghost) glow(c, p.x, py - 140 * s, 210 * s, '90,255,120', 0.3 + 0.1 * Math.sin(S.T * 5 + p.x));
    const hand = drawPerson(c, p.x, py, s, p);
    c.restore();
    if (hand && !p.dead) hands.push(hand);
  }
  return hands;
}

// Человек в зеркале: светящиеся глаза для того, кто смотрит из отражения.
function eyeGlow(c, p, y, s, k) {
  const f = p.facing || 1;
  glow(c, p.x + 23 * s * f, y - 249 * s, 30 * s, '110,255,140', 0.9 * k);
}

// ───────────────────────── Комната ─────────────────────────
// P: time ('night' | 'morning'), mirror ('loki' | 'empty' | false — вместо зеркала шкаф), mirrorAt, portal { at, x },
// hero и people (ghost, enter, vanish), dark (0..1, ночью по умолчанию 0.5), blackout (at — город за окном гаснет),
// frost { at, until } (окно затягивает инеем), blanket (at — окно завешивают одеялом)
SCENES.room = (c, S) => {
  const { t, T, P } = S;
  const night = (P.time || 'night') === 'night', floor = 1270;
  let g = c.createLinearGradient(0, 0, 0, floor);
  g.addColorStop(0, night ? '#1c2230' : '#56606f'); g.addColorStop(1, night ? '#2a3143' : '#6c7686');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, floor + 80);
  c.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x = -40; x < W + 40; x += 70) c.fillRect(x, 0, 30, floor);
  // окно с городом
  const wx = 70, wy = 420, ww = 360, wh = 480;
  c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
  g = c.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, night ? '#070b18' : '#9fbde3'); g.addColorStop(1, night ? '#1a2440' : '#f2b98e');
  c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
  const off = offK(t, P.blackout);
  if (night && off > 0) {
    // без засветки за окном видно луну, а дома стоят тёмными силуэтами
    g = c.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#0f1830'); g.addColorStop(1, '#2c3a5e');
    c.globalAlpha = off; c.fillStyle = g; c.fillRect(wx, wy, ww, wh); c.globalAlpha = 1;
    circle(c, wx + ww * 0.74, wy + 92, 30, `rgba(236,232,214,${off})`);
    glow(c, wx + ww * 0.74, wy + 92, 160, '236,232,214', 0.18 * off);
  }
  skyline(c, 31, wy + wh, 120, 300, 50, 90, night ? (off > 0 ? '#080b13' : '#111827') : '#7d879b', night ? 0.35 : 0.05, T, off);
  if (P.frost) frost(c, wx, wy, ww, wh, ease.inOut((t - (P.frost.at ?? 0)) / Math.max(0.1, (P.frost.until ?? S.d) - (P.frost.at ?? 0))));
  c.restore();
  c.fillStyle = '#d6d0c2'; c.fillRect(wx - 12, wy - 12, ww + 24, 14); c.fillRect(wx - 12, wy + wh - 2, ww + 24, 16);
  c.fillRect(wx - 12, wy, 12, wh); c.fillRect(wx + ww, wy, 12, wh); c.fillRect(wx + ww / 2 - 5, wy, 10, wh);
  c.fillStyle = '#2f4a3e';
  for (const [x0, dir] of [[wx - 60, 1], [wx + ww + 10, -1]]) {
    c.beginPath(); c.moveTo(x0, wy - 40); c.lineTo(x0 + 50, wy - 40);
    c.quadraticCurveTo(x0 + 25 + dir * 18, wy + wh / 2, x0 + 60, wy + wh + 120); c.lineTo(x0 - 10, wy + wh + 120); c.fill();
  }
  const quilt = P.blanket == null ? 0 : ease.out(after(t, P.blanket, 0.9));
  if (quilt > 0) {
    // одеяло на карнизе: опускается сверху и закрывает окно
    const qh = (wh + 60) * quilt;
    c.save(); c.beginPath(); c.rect(wx - 40, wy - 30, ww + 80, qh); c.clip();
    for (let y = wy - 30, row = 0; y < wy - 30 + wh + 60; y += 70, row++) for (let x = wx - 40, col2 = 0; x < wx + ww + 40; x += 70, col2++) {
      c.fillStyle = (row + col2) % 2 ? '#7a4b5c' : '#8f6475'; c.fillRect(x, y, 70, 70);
    }
    c.strokeStyle = 'rgba(255,240,220,0.25)'; c.lineWidth = 2; c.setLineDash([6, 6]);
    for (let y = wy - 30; y < wy + wh + 30; y += 70) { c.beginPath(); c.moveTo(wx - 40, y); c.lineTo(wx + ww + 40, y); c.stroke(); }
    c.setLineDash([]); c.restore();
    c.fillStyle = '#3a3f48'; c.fillRect(wx - 60, wy - 40, ww + 120, 10);
  }
  // пол
  g = c.createLinearGradient(0, floor, 0, H);
  g.addColorStop(0, '#3a2b22'); g.addColorStop(1, '#1d1612');
  c.fillStyle = g; c.fillRect(-80, floor, W + 160, H - floor + 80);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = floor + 40; y < H; y += 70) c.fillRect(-80, y, W + 160, 3);
  // кровать
  c.fillStyle = '#4a3426'; rr(c, 20, 1110, 560, 160, 14); c.fill();
  c.fillStyle = '#c9c2b4'; rr(c, 30, 1070, 540, 70, 20); c.fill();
  c.fillStyle = night ? '#25405e' : '#2f5578'; rr(c, 150, 1060, 430, 110, 30); c.fill();
  c.fillStyle = '#e6e1d6'; rr(c, 40, 1030, 120, 60, 22); c.fill();
  // зеркало (или шкаф)
  const mx = 660, my = 360, mw = 300, mh = 720;
  if (P.mirror === false) {
    c.fillStyle = '#4a3a2c'; rr(c, mx - 20, my - 30, mw + 40, floor - my + 30, 8); c.fill();
    c.fillStyle = '#56443a'; rr(c, mx - 4, my - 14, mw / 2 - 2, floor - my - 10, 6); c.fill(); rr(c, mx + mw / 2 + 6, my - 14, mw / 2 - 2, floor - my - 10, 6); c.fill();
    c.fillStyle = '#c9a66b'; rr(c, mx + mw / 2 - 16, my + 380, 8, 64, 4); c.fill(); rr(c, mx + mw / 2 + 12, my + 380, 8, 64, 4); c.fill();
  } else {
  c.fillStyle = '#8a6a3a'; rr(c, mx - 18, my - 18, mw + 36, mh + 36, 26); c.fill();
  c.save(); rr(c, mx, my, mw, mh, 16); c.clip();
  g = c.createLinearGradient(mx, my, mx + mw, my + mh);
  g.addColorStop(0, '#26303f'); g.addColorStop(1, '#0b0f17');
  c.fillStyle = g; c.fillRect(mx, my, mw, mh);
  if (P.mirror === 'loki' && t >= (P.mirrorAt ?? 0)) {
    const k = after(t, P.mirrorAt ?? 0, 0.6);
    glow(c, mx + mw / 2, my + mh * 0.45, 320, '60,220,110', 0.35 * k);
    c.globalAlpha = k;
    const loki = { ...HERO_DEFAULT, ...(S.cast.loki || {}), x: mx + mw / 2 + 20, facing: -1, light: null, pose: 'stand' };
    drawPerson(c, loki.x, my + mh + 40, 1.45, loki);
    eyeGlow(c, loki, my + mh + 40, 1.45, k * (0.7 + 0.3 * Math.sin(T * 3)));
    c.globalAlpha = 1;
  }
  c.fillStyle = 'rgba(255,255,255,0.06)';
  c.beginPath(); c.moveTo(mx + 40, my); c.lineTo(mx + 120, my); c.lineTo(mx + 10, my + mh); c.lineTo(mx - 70, my + mh); c.fill();
  c.restore();
  }
  // портал
  let portal = null;
  if (P.portal && t >= (P.portal.at ?? 0)) {
    const k = ease.back(after(t, P.portal.at ?? 0, 0.5)), px = P.portal.x ?? 540, pw = 230, ph = 620;
    portal = { x: px, y: floor - ph / 2, k };
    c.save(); c.translate(px, floor); c.scale(1, clamp(k, 0, 1.2)); c.translate(-px, -floor);
    g = c.createLinearGradient(0, floor - ph, 0, floor);
    g.addColorStop(0, '#ffd27a'); g.addColorStop(1, '#ff7a1a');
    c.fillStyle = g; rr(c, px - pw / 2, floor - ph, pw, ph, 18); c.fill();
    c.strokeStyle = '#fff1c9'; c.lineWidth = 8; c.stroke();
    c.restore();
    for (let i = 0; i < 10; i++) {
      const life = (T * 1.3 + hash(i)) % 1;
      circle(c, px + (hash(i + 1) - 0.5) * pw * 1.4, floor - ph * (0.1 + 0.9 * hash(i + 2)) - life * 60, 4, `rgba(255,200,120,${1 - life})`);
    }
  }
  // люди
  const people = [heroIn(S, { x: 520, light: null }), ...(P.people || []).map((sp) => personIn(S, sp, { light: null }))];
  const hands = drawFolk(c, S, people, floor + 6, 1.45);
  // свет
  const lights = [];
  if (night) lights.push({ x: wx + ww / 2, y: wy + wh / 2, r: 520, k: 0.45 * (1 - 0.3 * off) * (1 - quilt) });
  if (portal) lights.push({ x: portal.x, y: portal.y, r: 900, k: 0.9 * clamp(portal.k) });
  if (P.mirror === 'loki' && t >= (P.mirrorAt ?? 0)) lights.push({ x: mx + mw / 2, y: my + mh * 0.4, r: 420, k: 0.6 });
  for (const h of hands) lights.push({ x: h.x, y: h.y, r: 220, k: 0.6 });
  darkness(c, P.dark ?? (night ? 0.5 : 0), lights, '4,6,14');
  if (portal) glow(c, portal.x, portal.y, 520, '255,150,50', 0.35 * clamp(portal.k));
};

// ───────────────────────── Временная линия ─────────────────────────
// P: reveal (сек — за сколько рисуется главная линия), branches [{ at, from (0..1 вдоль линии), dir (1 вверх, -1 вниз),
// color ('orange' | 'green'), grown (ветка уже выросла в прошлой сцене), prune (at — ветку стирают),
// glowAt (at — ветка начинает пульсировать) }]
const TL_Y = 1010;
const tlY = (x, T) => TL_Y + Math.sin(x / 260 + T * 0.4) * 36;
function tlBranch(b, u, T) {
  const x0 = b.from * W, y0 = tlY(x0, T), d = b.dir ?? 1;
  return [x0 + 460 * u, y0 - d * (300 * Math.pow(u, 1.25)) + Math.sin(u * 7 + T * 1.5) * 14 * u];
}
function glowLine(c, pts, rgb, a) {
  for (const [w, al] of [[34, 0.12], [12, 0.55], [4, 1]]) {
    c.strokeStyle = w === 4 ? `rgba(255,240,215,${a})` : `rgba(${rgb},${al * a})`;
    c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  }
}
SCENES.timeline = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#0b0806'; c.fillRect(-80, -80, W + 160, H + 160);
  c.strokeStyle = 'rgba(255,140,40,0.05)'; c.lineWidth = 2;
  for (let x = 0; x < W; x += 90) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
  for (let y = 0; y < H; y += 90) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  const r = rng(77);
  for (let i = 0; i < 90; i++) circle(c, r() * W, r() * H, 1.5, `rgba(255,190,120,${0.15 + 0.3 * noise1(T + i, 4)})`);
  const reveal = ease.out(after(t, 0, P.reveal ?? 1.4));
  const main = [];
  for (let x = -60; x <= -60 + (W + 120) * reveal; x += 20) main.push([x, tlY(x, T)]);
  if (main.length > 1) glowLine(c, main, '255,140,40', 1);
  for (const b of P.branches || []) {
    if (!b.grown && (b.at == null || t < b.at)) continue;
    const grow = b.grown ? 1 : ease.out(after(t, b.at, 0.9));
    const rgb = b.color === 'green' ? '80,255,120' : '255,140,40';
    const pruned = b.prune != null && t >= b.prune ? clamp((t - b.prune) / 0.8) : 0;
    const pulse = b.glowAt != null && t >= b.glowAt ? 0.75 + 0.25 * Math.sin(T * 8) : 1;
    const pts = [];
    for (let u = 0; u <= grow; u += 0.03) pts.push(tlBranch(b, u, T));
    if (pruned < 1 && pts.length > 1) glowLine(c, pts, rgb, (1 - pruned) * pulse);
    if (pruned > 0) {
      pts.forEach(([x, y], i) => {
        if (i % 2) return;
        const dy = pruned * (60 + hash(i) * 120), dx = (hash(i + 5) - 0.5) * 80 * pruned;
        circle(c, x + dx, y - dy, 3 + hash(i + 2) * 3, `rgba(${rgb},${1 - pruned})`);
      });
      if (pruned < 0.4) glow(c, pts[0][0], pts[0][1], 160, '255,220,170', 0.8 * (1 - pruned / 0.4));
    }
    if (b.glowAt != null && t >= b.glowAt && pts.length) {
      const [ex, ey] = pts[pts.length - 1];
      glow(c, ex, ey, 140, rgb, 0.5 * pulse);
    }
  }
  vignette(c, 0.7);
};

// ───────────────────────── Пустота на краю времени ─────────────────────────
// P: alioth { at, rise (сек; 0 — туча уже стоит) }, hero и people, alligators [{ x, scale, facing, at }],
// magic (at — у героя светятся руки)
function drawAlligator(c, x, y, s, f = 1) {
  c.save(); c.translate(x, y); c.scale(s * f, s);
  const green = '#4d7a38', dark = '#36592a';
  c.fillStyle = dark;
  c.beginPath(); c.moveTo(-90, -60); c.quadraticCurveTo(-230, -50, -300, -14); c.quadraticCurveTo(-220, -14, -90, -18); c.fill();
  for (const lx of [-70, -30, 40, 80]) { c.fillStyle = dark; rr(c, lx - 10, -30, 22, 32, 6); c.fill(); }
  c.fillStyle = green; c.beginPath(); c.ellipse(0, -44, 115, 34, 0, 0, TAU); c.fill();
  c.fillStyle = dark;
  for (let i = -90; i < 90; i += 22) { c.beginPath(); c.moveTo(i, -74); c.lineTo(i + 10, -90); c.lineTo(i + 20, -74); c.fill(); }
  c.fillStyle = green; c.beginPath(); c.ellipse(150, -48, 78, 20, 0.05, 0, TAU); c.fill();
  c.fillStyle = '#f4f1e6';
  for (let i = 100; i < 220; i += 16) { c.beginPath(); c.moveTo(i, -40); c.lineTo(i + 6, -30); c.lineTo(i + 12, -40); c.fill(); }
  c.strokeStyle = dark; c.lineWidth = 4; c.beginPath(); c.moveTo(90, -42); c.lineTo(226, -42); c.stroke();
  circle(c, 108, -70, 13, green); circle(c, 110, -72, 6, '#f2d33b'); c.fillStyle = '#111'; c.fillRect(109, -78, 3, 12);
  // маленький золотой рогатый шлем
  c.fillStyle = '#d6a531'; c.beginPath(); c.arc(92, -78, 22, Math.PI, TAU); c.fill();
  for (const bx of [80, 100]) {
    c.beginPath(); c.moveTo(bx - 4, -94); c.quadraticCurveTo(bx - 2, -120, bx - 26, -142); c.quadraticCurveTo(bx + 6, -118, bx + 6, -94); c.closePath(); c.fill();
  }
  c.restore();
}
function alioth(c, T, k) {
  if (k <= 0) return;
  const cx = W / 2, cy = lerp(1250, 720, ease.out(k)), R = lerp(160, 520, ease.out(k));
  const r = rng(5);
  for (let i = 0; i < 42; i++) {
    const a = r() * TAU, d = r() * R * 0.8, rad = R * (0.25 + r() * 0.35);
    const x = cx + Math.cos(a + T * 0.05) * d, y = cy + Math.sin(a) * d * 0.6;
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(70,30,90,${0.55 * k})`); g.addColorStop(1, 'rgba(20,8,30,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, rad, 0, TAU); c.fill();
  }
  glow(c, cx, cy, R * 0.8, '170,80,255', 0.2 * k * (0.7 + 0.3 * Math.sin(T * 2)));
  const f = Math.floor(T * 9);
  if (hash(f) > 0.6) {
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(220,190,255,${0.9 * k})`; c.lineWidth = 4;
    let x = cx + (hash(f + 1) - 0.5) * R, y = cy - R * 0.3;
    c.beginPath(); c.moveTo(x, y);
    for (let i = 0; i < 7; i++) { x += (hash(f + i * 3) - 0.5) * 90; y += 40 + hash(f + i) * 50; c.lineTo(x, y); }
    c.stroke(); c.restore();
    c.fillStyle = `rgba(200,170,255,${0.12 * k})`; c.fillRect(-80, -80, W + 160, H + 160);
  }
}
SCENES.void = (c, S) => {
  const { t, T, P } = S;
  const hy = 1060, ground = 1262;
  let g = c.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, '#130f1d'); g.addColorStop(1, '#4b3d5c');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, hy + 80);
  if (P.alioth) {
    const A = P.alioth, rise = A.rise ?? 3;
    alioth(c, T, rise > 0 ? after(t, A.at ?? 0, rise) : 1);
  }
  // обломки времени на горизонте
  c.fillStyle = '#2a2236';
  const r = rng(13);
  for (let i = 0; i < 9; i++) {
    const x = r() * W, w = 50 + r() * 120, h = 80 + r() * 260;
    c.save(); c.translate(x, hy); c.rotate((r() - 0.5) * 0.5); c.fillRect(-w / 2, -h, w, h + 20); c.restore();
  }
  g = c.createLinearGradient(0, hy, 0, H);
  g.addColorStop(0, '#3a3046'); g.addColorStop(1, '#16121e');
  c.fillStyle = g; c.fillRect(-80, hy, W + 160, H - hy + 80);
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    const x = r() * W, y = hy + 40 + r() * 600;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 60 + r() * 80, y + (r() - 0.5) * 30); c.stroke();
  }
  // полузасыпанная машина
  c.save(); c.translate(900, ground - 30); c.rotate(-0.18);
  c.fillStyle = '#5a3f45'; rr(c, -150, -90, 300, 90, 26); c.fill(); rr(c, -90, -150, 170, 70, 22); c.fill();
  c.fillStyle = '#1d1824'; rr(c, -75, -138, 64, 46, 8); c.fill(); rr(c, 4, -138, 64, 46, 8); c.fill();
  c.restore();
  c.fillStyle = '#16121e'; c.beginPath(); c.ellipse(900, ground + 10, 230, 40, 0, 0, TAU); c.fill();
  // люди и аллигаторы
  for (const al of P.alligators || []) {
    const k = after(t, al.at ?? 0, 0.5);
    if (k <= 0) continue;
    c.save(); c.globalAlpha = k; drawAlligator(c, al.x ?? 520, ground + 4, al.scale ?? 0.9, al.facing ?? 1); c.restore();
  }
  const people = [heroIn(S, { x: 260, light: null }), ...(P.people || []).map((sp) => personIn(S, sp, { light: null }))];
  drawFolk(c, S, people, ground, 1.4);
  if (P.magic != null && t >= P.magic && people[0]) {
    const h = people[0], k = after(t, P.magic, 0.6), f = h.facing || 1, s = h.scale ?? 1.4;
    glow(c, h.x + 70 * s * f, ground - 130 * s, 150, '120,255,140', 0.55 * k * (0.8 + 0.2 * Math.sin(T * 6)));
    glow(c, h.x + 70 * s * f, ground - 130 * s, 60, '255,230,140', 0.6 * k);
  }
  for (let i = 0; i < 40; i++) {
    const x = ((hash(i) * (W + 200) + T * (12 + hash(i + 1) * 20)) % (W + 200)) - 100, y = hy - 200 + hash(i + 2) * 900;
    circle(c, x, y, 2 + hash(i + 3) * 2, `rgba(220,200,255,${0.2 + 0.2 * Math.sin(T + i)})`);
  }
  vignette(c, 0.55);
};

// ───────────────────────── Миф: восьминогий конь ─────────────────────────
// P: walk [x0, x1] — куда скачет конь, legs (сколько ног, по умолчанию 8)
function drawHorse(c, x, y, s, ph, legs = 8) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const body = '#d9dde6', dark = '#9aa3b4';
  // хвост
  c.strokeStyle = '#e9edf5'; c.lineWidth = 16; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-120, -190); c.quadraticCurveTo(-200, -170 + Math.sin(ph) * 20, -230, -100 + Math.sin(ph * 1.3) * 20); c.stroke();
  // ноги: по половине с каждой стороны, дальние темнее и чуть сдвинуты — все восемь видны отдельно
  const half = legs / 2, q = Math.ceil(half / 2);
  for (let side = 0; side < 2; side++) {
    for (let i = 0; i < half; i++) {
      const front = i >= q, bx = (front ? 30 + (i - q) * 50 : -125 + i * 50) + (side ? 0 : 22);
      const a = Math.sin(ph + i * Math.PI / 2 + side * Math.PI) * 0.45, kx = bx + Math.sin(a) * 60, ky = -150 + Math.cos(a) * 60;
      const fx = kx + Math.sin(a * (front ? -0.6 : 1.2)) * 60, fy = ky + 60;
      c.strokeStyle = side ? body : dark; c.lineWidth = 13;
      c.beginPath(); c.moveTo(bx, -160); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke();
      c.fillStyle = '#4a4f5a'; rr(c, fx - 9, fy - 4, 20, 10, 3); c.fill();
    }
  }
  c.fillStyle = body; c.beginPath(); c.ellipse(-10, -185, 130, 55, 0, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(70, -220); c.lineTo(150, -330); c.lineTo(185, -310); c.lineTo(120, -180); c.fill();
  c.beginPath(); c.ellipse(195, -318, 54, 24, 0.55, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(150, -345); c.lineTo(160, -380); c.lineTo(172, -342); c.fill();
  c.strokeStyle = '#c3cad8'; c.lineWidth = 10;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(150 - i * 14, -330 + i * 22); c.quadraticCurveTo(110 - i * 16, -310 + i * 22 + Math.sin(ph + i) * 8, 95 - i * 16, -290 + i * 22); c.stroke(); }
  circle(c, 205, -330, 5, '#1b1d22');
  c.restore();
}
SCENES.myth = (c, S) => {
  const { t, T, P } = S;
  const gy = 1250;
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, '#05070f'); g.addColorStop(1, '#16203a');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  const r = rng(3);
  for (let i = 0; i < 120; i++) circle(c, r() * W, r() * gy * 0.7, 1.4, `rgba(255,255,255,${0.3 + 0.5 * noise1(T * 0.6 + i, 5)})`);
  // северное сияние
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 3; b++) {
    const rgb = b === 1 ? '170,90,255' : '80,255,160';
    for (let x = -60; x < W + 60; x += 14) {
      const y = 360 + b * 90 + Math.sin(x / 170 + T * 0.6 + b) * 70;
      const gg = c.createLinearGradient(0, y - 160, 0, y + 40);
      gg.addColorStop(0, `rgba(${rgb},0)`); gg.addColorStop(0.7, `rgba(${rgb},0.09)`); gg.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = gg; c.fillRect(x, y - 160, 16, 200);
    }
  }
  c.restore();
  for (const [col, base, amp, seed] of [['#121a2b', 980, 320, 8], ['#0d1422', 1100, 220, 9]]) {
    c.fillStyle = col; c.beginPath(); c.moveTo(-80, gy);
    for (let x = -80; x <= W + 80; x += 30) c.lineTo(x, base - amp * noise1(x / 160, seed));
    c.lineTo(W + 80, gy); c.fill();
  }
  g = c.createLinearGradient(0, gy, 0, H);
  g.addColorStop(0, '#2b3448'); g.addColorStop(1, '#10141f');
  c.fillStyle = g; c.fillRect(-80, gy, W + 160, H - gy + 80);
  const [x0, x1] = P.walk || [180, 640];
  const x = lerp(x0, x1, ease.inOut(S.p));
  glow(c, x, gy - 200, 360, '200,220,255', 0.18);
  drawHorse(c, x, gy + 10, P.scale ?? 1.5, T * 9, P.legs ?? 8);
  vignette(c, 0.55);
};

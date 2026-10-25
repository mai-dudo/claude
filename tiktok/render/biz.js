'use strict';
// Бизнес-истории в горизонтальном кадре (size: [1920, 1080]): человечки с круглыми головами и эмоциями, реплики
// в пузырях, карточки глав с бюджетом, расчёты, чат, кабинет продавца, карточки товаров, полароиды, квартира с коробками.
// Общие поля любой такой сцены: label (подпись серии слева сверху), bubbles: [{ text, x, y, at, until, to: [x, y],
// kind: 'say' | 'think' | 'name', sub, icon, w, size }], stamps: [{ text, at, x, y, rot, color, size }].

const BZ = {
  ink: '#22252b', paper: '#efe8dc', paper2: '#e3d9c9', dark: '#141821', face: '#fbfaf6', muted: '#8a8f99',
  orange: '#f08a24', green: '#2f9e5b', red: '#d64032', hl: '#ffe28a', blue: '#3b82c4', box: '#c8935b', tape: '#e8c88f',
};
const bzc = (name, fallback) => BZ[name] || PAL[name] || name || fallback;
const money = (n) => `${Math.round(n).toLocaleString('ru-RU')} ₸`;

// Переносит текст по словам под ширину maxW (с учётом \n). Шрифт должен быть уже выставлен.
function wrapText(c, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const w of para.split(' ')) {
      const tr = cur ? `${cur} ${w}` : w;
      if (cur && c.measureText(tr).width > maxW) { out.push(cur); cur = w; } else cur = tr;
    }
    out.push(cur);
  }
  return out;
}

// ───────────────────────── Человечек ─────────────────────────
// Анфас, (x, y) — между ступнями, s — масштаб (рост ≈ 340·s).
// o: body ('hoodie' | 'suit' | 'jacket' | 'dress'), color, pants, hair ('none' | 'short' | 'long' | 'bun' | 'bald'),
// hairColor, glasses, mood ('calm' | 'smile' | 'happy' | 'worried' | 'shock' | 'angry' | 'smirk' | 'sad' | 'sleep' | 'focus'),
// arms ('down' | 'phone' | 'box' | 'laptop' | 'point' | 'think' | 'up' | 'hips' | 'eat' | 'wave' | 'shrug'),
// pose ('stand' | 'walk' | 'sit' | 'lie' — лёжа головой влево), facing (куда смотрит и показывает), bag ('courier'),
// seat (высота сиденья), phase, T (время для дыхания и моргания)
function guy(c, x, y, s, o = {}) {
  const f = o.facing || 1, T = o.T || 0, pose = o.pose || 'stand';
  if (pose === 'lie') {
    c.save(); c.translate(x, y); c.rotate(-Math.PI / 2);
    guy(c, 0, 0, s, { ...o, pose: 'stand', arms: 'down', facing: 1, T });
    c.restore(); return;
  }
  const ink = BZ.ink, body = o.color || '#3a9d5d', dk = shade(body, -0.22);
  const seed = Math.abs(x * 0.37 + (o.color || '').length * 3.1);
  const bob = Math.sin(T * 2.2 + seed) * 1.6;
  const walk = pose === 'walk', ph = o.phase ?? T * 6;
  const hipY = pose === 'sit' ? -(o.seat ?? 120) : -118 + (walk ? -Math.abs(Math.sin(ph)) * 6 : 0);
  const sy = hipY - 112 + bob, hy = hipY - 182 + bob; // плечи и центр головы
  // facing = -1 — фигура целиком отражается: телефон в другой руке, взгляд в другую сторону
  c.save(); c.translate(x, y); c.scale(s * f, s);
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (o.bag === 'courier') {
    c.fillStyle = o.bagColor || '#f2b63c'; rr(c, -78, sy - 70, 156, 150, 16); c.fill();
    c.strokeStyle = ink; c.lineWidth = 4; c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(-78, sy - 20, 156, 16);
  }
  // ноги
  // сидя анфас бёдра смотрят на зрителя: короткие, колени шире, ступни чуть ниже — ближе к нам
  const drop = pose === 'sit' ? (o.feetDrop ?? 22) : 0;
  const legs = pose === 'sit'
    ? [[-22, -32, -32], [22, 32, 32]].map(([hx, kx, fx]) => [[hx, hipY], [kx, hipY + 30], [fx, drop - 6]])
    : [-1, 1].map((sd) => {
      const sw = walk ? Math.sin(ph) * 26 * sd : 0, lift = walk ? Math.max(0, Math.sin(ph) * sd) * 10 : 0;
      return [[20 * sd, hipY], [22 * sd + sw * 0.5, hipY / 2 - lift], [24 * sd + sw, -6 - lift]];
    });
  for (const L of legs) {
    c.strokeStyle = o.pants || '#2c3140'; c.lineWidth = 24;
    c.beginPath(); c.moveTo(...L[0]); c.lineTo(...L[1]); c.lineTo(...L[2]); c.stroke();
    c.fillStyle = o.shoes || ink; c.beginPath(); c.ellipse(L[2][0] + 4 * Math.sign(L[2][0]), L[2][1] + 2, 24, 10, 0, 0, TAU); c.fill();
  }
  if (pose === 'sit') {
    c.fillStyle = o.pants || '#2c3140'; rr(c, -48, hipY - 16, 96, 50, 22); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.08)'; for (const kx of [-30, 30]) { c.beginPath(); c.ellipse(kx, hipY + 22, 16, 10, 0, 0, TAU); c.fill(); }
  }
  // волосы сзади и капюшон
  const hoodie = (o.body || 'hoodie') === 'hoodie';
  if (o.hair === 'long') { c.fillStyle = o.hairColor || '#4a2f22'; rr(c, -58, hy - 20, 116, 124, 30); c.fill(); }
  if (hoodie) { c.fillStyle = dk; c.beginPath(); c.ellipse(0, hy + 26, 62, 46, 0, 0, TAU); c.fill(); }
  // туловище
  const bt = hipY - 128 + bob;
  if (o.body === 'dress') {
    c.fillStyle = body; c.beginPath(); c.moveTo(-40, bt + 70); c.lineTo(40, bt + 70); c.lineTo(62, hipY + 60); c.lineTo(-62, hipY + 60); c.closePath(); c.fill();
    c.strokeStyle = ink; c.lineWidth = 4; c.stroke();
  }
  c.fillStyle = body; rr(c, -50, bt, 100, hipY - bt + 10, 34); c.fill();
  c.strokeStyle = ink; c.lineWidth = 4; c.stroke();
  if (hoodie) {
    c.fillStyle = dk; rr(c, -32, hipY - 46, 64, 32, 12); c.fill();
    c.strokeStyle = shade(body, 0.5); c.lineWidth = 3;
    c.beginPath(); c.moveTo(-12, bt + 10); c.lineTo(-14, bt + 44); c.moveTo(12, bt + 10); c.lineTo(14, bt + 44); c.stroke();
  } else if (o.body === 'suit') {
    c.fillStyle = '#f4f4f2'; c.beginPath(); c.moveTo(-18, bt + 2); c.lineTo(18, bt + 2); c.lineTo(0, bt + 52); c.closePath(); c.fill();
    c.fillStyle = o.tie || '#b33a3a'; c.beginPath(); c.moveTo(-5, bt + 10); c.lineTo(5, bt + 10); c.lineTo(8, bt + 50); c.lineTo(0, bt + 60); c.lineTo(-8, bt + 50); c.closePath(); c.fill();
  } else if (o.body === 'jacket') {
    c.strokeStyle = dk; c.lineWidth = 3; c.beginPath(); c.moveTo(0, bt + 8); c.lineTo(0, hipY + 6); c.stroke();
    c.fillStyle = dk; c.beginPath(); c.moveTo(-26, bt + 2); c.lineTo(0, bt + 22); c.lineTo(26, bt + 2); c.lineTo(0, bt + 8); c.fill();
  }
  // голова и волосы
  c.fillStyle = o.skin || BZ.face; c.beginPath(); c.arc(0, hy, 50, 0, TAU); c.fill();
  c.strokeStyle = ink; c.lineWidth = 4; c.stroke();
  const hc = o.hairColor || '#3b2a20';
  if (o.hair && o.hair !== 'none') {
    c.save(); c.beginPath(); c.arc(0, hy, 50, 0, TAU); c.clip(); c.fillStyle = hc;
    if (o.hair === 'bald') { c.fillRect(-60, hy - 12, 20, 28); c.fillRect(40, hy - 12, 20, 28); }
    else { c.beginPath(); c.moveTo(-60, hy - 4); c.quadraticCurveTo(-18, hy - 36, 60, hy - 16); c.lineTo(60, hy - 70); c.lineTo(-60, hy - 70); c.fill(); }
    c.restore();
    if (o.hair !== 'bald') { c.strokeStyle = ink; c.lineWidth = 4; c.beginPath(); c.arc(0, hy, 50, Math.PI * 1.04, Math.PI * 1.96); c.stroke(); }
    if (o.hair === 'bun') { circle(c, 0, hy - 60, 18, hc); }
  }
  // лицо
  const mood = o.mood || 'calm', lx = o.look ? o.look[0] : 3, ly = o.look ? o.look[1] : 0;
  const blink = mood !== 'shock' && ((T + hash(Math.floor(seed)) * 7) % 4.2) < 0.13;
  c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 3.5;
  const ex = [-17 + lx, 17 + lx], eyY = hy - 4 + ly;
  if (mood === 'sleep' || blink) {
    for (const e of ex) { c.beginPath(); c.arc(e, eyY - 2, 7, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
  } else if (mood === 'shock') {
    for (const e of ex) { circle(c, e, eyY, 12, '#fff'); c.beginPath(); c.arc(e, eyY, 12, 0, TAU); c.stroke(); circle(c, e, eyY, 5, ink); }
  } else if (mood === 'happy') {
    for (const e of ex) { c.beginPath(); c.arc(e, eyY + 3, 7, 1.15 * Math.PI, 1.85 * Math.PI); c.stroke(); }
  } else for (const e of ex) circle(c, e, eyY, 5.5, ink);
  if (o.glasses) {
    c.lineWidth = 3;
    for (const e of ex) { rr(c, e - 15, eyY - 12, 30, 24, 7); c.stroke(); }
    c.beginPath(); c.moveTo(ex[0] + 15, eyY - 2); c.lineTo(ex[1] - 15, eyY - 2); c.stroke();
  }
  const brow = (a) => { c.beginPath(); c.moveTo(ex[0] + a[0], eyY + a[1]); c.lineTo(ex[0] + a[2], eyY + a[3]); c.moveTo(ex[1] - a[0], eyY + a[1]); c.lineTo(ex[1] - a[2], eyY + a[3]); c.stroke(); };
  c.lineWidth = 4;
  if (mood === 'worried' || mood === 'sad') brow([-10, -14, 9, -22]);
  else if (mood === 'angry') brow([-10, -22, 9, -14]);
  else if (mood === 'shock') brow([-10, -26, 10, -28]);
  else if (mood === 'focus') brow([-10, -16, 9, -16]);
  const my = hy + 22;
  if (mood === 'smile') { c.beginPath(); c.arc(lx, my - 12, 15, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  else if (mood === 'happy') { c.beginPath(); c.arc(lx, my - 6, 16, 0, Math.PI); c.closePath(); c.fill(); }
  else if (mood === 'shock') { c.beginPath(); c.ellipse(lx, my + 2, 7, 10, 0, 0, TAU); c.fill(); }
  else if (mood === 'sad' || mood === 'angry') { c.beginPath(); c.arc(lx, my + 12, 13, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke(); }
  else if (mood === 'smirk') { c.beginPath(); c.moveTo(lx - 12, my); c.quadraticCurveTo(lx + 4, my + 4, lx + 15, my - 7); c.stroke(); }
  else if (mood === 'worried') { c.beginPath(); c.moveTo(lx - 10, my + 2); c.quadraticCurveTo(lx - 4, my - 3, lx, my + 1); c.quadraticCurveTo(lx + 5, my + 5, lx + 10, my); c.stroke(); }
  else { c.beginPath(); c.moveTo(lx - 10, my); c.lineTo(lx + 10, my); c.stroke(); }
  // руки: считаются для взгляда вправо (R — правая рука), отражение уже в масштабе
  const A = (side, el, hd) => ({ sh: [44 * side, sy + 8], el, hd });
  let L = A(-1, [-54, sy + 54], [-58, sy + 102]), R = A(1, [54, sy + 54], [58, sy + 102]), prop = null;
  switch (o.arms || 'down') {
    case 'hips': L = A(-1, [-88, sy + 52], [-48, sy + 96]); R = A(1, [88, sy + 52], [48, sy + 96]); break;
    case 'up': L = A(-1, [-74, sy - 46], [-90, sy - 118]); R = A(1, [74, sy - 46], [90, sy - 118]); break;
    case 'shrug': L = A(-1, [-84, sy + 40], [-104, sy - 6]); R = A(1, [84, sy + 40], [104, sy - 6]); break;
    case 'box': L = A(-1, [-62, sy + 62], [-50, sy + 84]); R = A(1, [62, sy + 62], [50, sy + 84]); prop = 'box'; break;
    case 'laptop': L = A(-1, [-56, sy + 70], [-30, sy + 96]); R = A(1, [56, sy + 70], [30, sy + 96]); break;
    case 'phone': R = A(1, [44, sy + 74], [16, sy + 36]); prop = 'phone'; break;
    case 'point': R = A(1, [92, sy + 2], [152, sy - 6]); break;
    case 'think': R = A(1, [52, sy + 72], [18, sy - 30]); L = A(-1, [-40, sy + 74], [30, sy + 74]); break;
    case 'wave': R = A(1, [82, sy - 20], [96 + Math.sin(T * 10) * 14, sy - 98]); break;
    case 'eat': L = A(-1, [-52, sy + 72], [-20, sy + 74]); R = A(1, [50, sy + 62], [16, sy + 8]); prop = 'bowl'; break;
  }
  for (const a of [L, R]) {
    c.strokeStyle = dk; c.lineWidth = 22;
    c.beginPath(); c.moveTo(...a.sh); c.lineTo(...a.el); c.lineTo(...a.hd); c.stroke();
  }
  if (prop === 'box') bzBox(c, -66, sy + 36, 132, 96);
  if (prop === 'bowl') {
    c.fillStyle = '#e9e2d4'; c.beginPath(); c.arc(-14, sy + 66, 30, 0, Math.PI); c.closePath(); c.fill(); c.strokeStyle = ink; c.lineWidth = 3; c.stroke();
    c.beginPath(); c.moveTo(14, sy + 14); c.lineTo(-6, sy + 64); c.moveTo(22, sy + 16); c.lineTo(2, sy + 64); c.stroke();
  }
  for (const a of [L, R]) { circle(c, a.hd[0], a.hd[1], 12, o.skin || BZ.face); c.strokeStyle = ink; c.lineWidth = 3; c.beginPath(); c.arc(a.hd[0], a.hd[1], 12, 0, TAU); c.stroke(); }
  if (prop === 'phone') {
    const p = R.hd;
    c.fillStyle = '#1f232b'; rr(c, p[0] - 13, p[1] - 30, 26, 46, 6); c.fill();
    if (o.screen !== false) { c.fillStyle = 'rgba(150,200,255,0.9)'; rr(c, p[0] - 9, p[1] - 26, 18, 36, 3); c.fill(); }
  }
  c.restore();
}

// Картонная коробка с лентой и наклейкой.
function bzBox(c, x, y, w, h, o = {}) {
  c.fillStyle = o.color || BZ.box; rr(c, x, y, w, h, 4); c.fill();
  c.strokeStyle = BZ.ink; c.lineWidth = 3; c.stroke();
  c.fillStyle = BZ.tape; c.fillRect(x + w / 2 - w * 0.08, y, w * 0.16, h);
  if (w > 70) {
    c.fillStyle = '#f6f3ec'; c.fillRect(x + w * 0.62, y + h * 0.55, w * 0.28, h * 0.3);
    c.fillStyle = BZ.ink; for (let i = 0; i < 6; i++) c.fillRect(x + w * 0.65 + i * w * 0.04, y + h * 0.6, 2, h * 0.16);
  }
}

// Увлажнитель: (x, y) — середина низа, state: 'ok' (светится, пар) | 'off' | 'leak' (течёт).
function humid(c, x, y, s, state = 'ok', T = 0) {
  c.save(); c.translate(x, y); c.scale(s, s);
  if (state === 'ok') glow(c, 0, -60, 150, '150,170,255', 0.35 + 0.05 * Math.sin(T * 2));
  if (state === 'leak') { c.fillStyle = 'rgba(90,160,230,0.55)'; c.beginPath(); c.ellipse(10, 2, 70, 10, 0, 0, TAU); c.fill(); }
  c.fillStyle = state === 'off' ? '#d9d9d6' : '#f5f5f2'; rr(c, -40, -120, 80, 120, 34); c.fill();
  c.strokeStyle = BZ.ink; c.lineWidth = 4; c.stroke();
  c.fillStyle = state === 'ok' ? '#b9c6ff' : '#9aa0aa'; rr(c, -30, -26, 60, 12, 6); c.fill();
  c.fillStyle = '#d0d3d8'; rr(c, -12, -136, 24, 18, 6); c.fill(); c.stroke();
  if (state === 'ok') {
    for (let i = 0; i < 5; i++) {
      const life = (T * 0.35 + i / 5) % 1;
      c.fillStyle = `rgba(255,255,255,${0.55 * (1 - life)})`;
      c.beginPath(); c.arc(Math.sin(life * 6 + i) * 10, -140 - life * 110, 12 + life * 20, 0, TAU); c.fill();
    }
  }
  if (state === 'leak') {
    for (let i = 0; i < 3; i++) {
      const life = (T * 0.8 + i / 3) % 1;
      c.fillStyle = 'rgba(90,160,230,0.9)'; c.beginPath(); c.arc(30, -20 + life * 22, 5, 0, TAU); c.fill();
    }
  }
  if (state === 'off') { c.strokeStyle = BZ.red; c.lineWidth = 6; c.beginPath(); c.moveTo(-26, -96); c.lineTo(26, -44); c.moveTo(26, -96); c.lineTo(-26, -44); c.stroke(); }
  c.restore();
}

// Значки для карточек глав.
function bzIcon(c, kind, x, y, s, text) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.strokeStyle = BZ.ink; c.lineWidth = 5; c.lineJoin = 'round'; c.fillStyle = '#fff';
  if (kind === 'box') { bzBox(c, -50, -36, 100, 72); }
  else if (kind === 'scale') {
    rr(c, -56, 10, 112, 26, 6); c.fill(); c.stroke();
    rr(c, -40, -34, 80, 40, 6); c.fill(); c.stroke();
    c.fillStyle = BZ.ink; c.font = '700 22px "JetBrains Mono"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text || 'кг', 0, -14);
  } else if (kind === 'chart') {
    c.fillStyle = '#fff'; rr(c, -56, -50, 112, 100, 10); c.fill(); c.stroke();
    c.fillStyle = BZ.ink; for (let i = 0; i < 4; i++) c.fillRect(-38 + i * 22, 30 - [10, 4, 2, 1][i], 14, [10, 4, 2, 1][i]);
    c.strokeStyle = BZ.red; c.beginPath(); c.moveTo(-40, -20); c.lineTo(36, 22); c.stroke();
  } else if (kind === 'doc') {
    rr(c, -40, -52, 80, 104, 8); c.fill(); c.stroke();
    c.lineWidth = 4; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-24, -28 + i * 18); c.lineTo(24, -28 + i * 18); c.stroke(); }
  } else if (kind === 'calendar') {
    rr(c, -46, -44, 92, 92, 10); c.fill(); c.stroke();
    c.fillStyle = BZ.red; c.fillRect(-46, -44, 92, 22);
    c.fillStyle = BZ.ink; c.font = '900 40px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text || '1', 0, 14);
  } else if (kind === 'truck') {
    rr(c, -60, -34, 74, 50, 6); c.fill(); c.stroke(); rr(c, 14, -18, 40, 34, 6); c.fill(); c.stroke();
    for (const wx of [-36, 30]) { circle(c, wx, 24, 12, BZ.ink); circle(c, wx, 24, 5, '#fff'); }
  }
  c.restore();
}

// ───────────────────────── Реплики, штампы, подпись серии ─────────────────────────
function bubble(c, b, t, T) {
  const k = since(t, b.at, 0.3) * (b.until != null ? 1 - after(t, b.until, 0.25) : 1);
  if (k <= 0) return;
  const kind = b.kind || 'say', size = b.size || 34;
  c.save(); c.translate(b.x, b.y);
  const z = ease.back(k); c.scale(z, z); c.globalAlpha = clamp(k * 2);
  if (kind === 'name') {
    c.font = `800 ${size}px Montserrat`; const w1 = c.measureText(b.text).width;
    c.font = `600 ${Math.round(size * 0.62)}px Montserrat`; const w2 = b.sub ? c.measureText(b.sub).width : 0;
    const w = Math.max(w1, w2) + 60, h = b.sub ? size * 2.1 : size * 1.5;
    c.fillStyle = BZ.ink; rr(c, -w / 2, -h / 2, w, h, h / 2); c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${size}px Montserrat`; c.fillText(b.text, 0, b.sub ? -size * 0.36 : 2);
    if (b.sub) { c.font = `600 ${Math.round(size * 0.62)}px Montserrat`; c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillText(b.sub, 0, size * 0.52); }
    c.restore(); return;
  }
  c.font = `600 ${size}px Montserrat`;
  const ls = b.icon ? [] : wrapText(c, b.text || '', b.w || 520), lh = size * 1.28;
  const w = b.icon ? 220 : Math.max(...ls.map((l) => c.measureText(l).width)) + 60, h = b.icon ? 190 : ls.length * lh + 44;
  const hw = w / 2, hh = h / 2;
  c.fillStyle = '#fff'; c.strokeStyle = BZ.ink; c.lineWidth = 4;
  let tail = null;
  if (b.to) {
    const dx = b.to[0] - b.x, dy = b.to[1] - b.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const tt = Math.min(hw / Math.max(Math.abs(ux), 1e-3), hh / Math.max(Math.abs(uy), 1e-3));
    if (d > tt + 10) {
      const ex = ux * (tt - 8), ey = uy * (tt - 8), px = -uy * 16, py = ux * 16;
      tail = [[ex + px, ey + py], [ex - px, ey - py], [dx / z, dy / z]];
    }
  }
  if (kind === 'think') {
    c.beginPath(); c.ellipse(0, 0, hw + 14, hh + 10, 0, 0, TAU); c.fill(); c.stroke();
    if (b.to) {
      const dx = b.to[0] - b.x, dy = b.to[1] - b.y;
      for (const [k2, r] of [[0.72, 16], [0.86, 10]]) { c.beginPath(); c.arc(dx * k2, dy * k2, r, 0, TAU); c.fill(); c.stroke(); }
    }
  } else {
    rr(c, -hw, -hh, w, h, 24); c.fill(); c.stroke();
    if (tail) {
      c.beginPath(); c.moveTo(...tail[0]); c.lineTo(...tail[2]); c.lineTo(...tail[1]); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(...tail[0]); c.lineTo(...tail[2]); c.lineTo(...tail[1]); c.stroke();
    }
  }
  if (b.icon === 'humid') humid(c, 0, 72, 0.9, 'ok', T);
  c.fillStyle = b.color ? bzc(b.color) : BZ.ink; c.textAlign = 'center'; c.textBaseline = 'middle';
  ls.forEach((l, i) => c.fillText(l, 0, (i - (ls.length - 1) / 2) * lh + 2));
  c.restore();
}

function bzStamp(c, st, t) {
  const k = since(t, st.at, 0.25);
  if (k <= 0) return;
  const size = st.size || 54, col = bzc(st.color, BZ.red), text = st.text.toUpperCase();
  c.save(); c.translate(st.x ?? W / 2, st.y ?? H / 2); c.rotate(st.rot ?? -0.12);
  const z = lerp(1.7, 1, ease.out(k)); c.scale(z, z); c.globalAlpha = clamp(k * 1.6) * 0.92;
  c.font = `900 ${size}px Montserrat`; const w = c.measureText(text).width + 50, h = size * 1.5;
  c.strokeStyle = col; c.lineWidth = 6; rr(c, -w / 2, -h / 2, w, h, 10); c.stroke();
  c.lineWidth = 2.5; rr(c, -w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 6); c.stroke();
  c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 0, 3);
  c.restore();
}

// Общий слой поверх любой бизнес-сцены.
function bizUI(c, S) {
  const { t, T, P } = S;
  if (P.label && TL.series) {
    c.save(); c.globalAlpha = after(t, 0.1, 0.4) * 0.7;
    c.font = '700 26px "JetBrains Mono"'; c.fillStyle = P.bg === 'dark' || P.dark ? '#fff' : BZ.ink;
    c.textAlign = 'left'; c.fillText(typeof P.label === 'string' ? P.label : TL.series, 56, 66);
    c.restore();
  }
  (P.bubbles || []).forEach((b) => bubble(c, b, t, T));
  (P.stamps || []).forEach((st) => bzStamp(c, st, t));
}

// Люди сцены: hero и people, как в остальных сценах (cast, then, walk), рисуются guy.
function bizPeople(c, S, def) {
  const list = [S.P.hero === false ? null : (S.P.hero ? heroIn(S, def) : null), ...(S.P.people || []).map((sp) => personIn(S, sp, {}))];
  for (const p of list) {
    if (!p) continue;
    if (p.enter != null && S.t < p.enter) continue;
    const sc = p.scale ?? def.scale ?? 1.3, py = p.y ?? def.y;
    if (p.onBox) {
      // сидит на коробках: ставим их под ним и подгоняем высоту сиденья
      for (let i = 0; i < p.onBox; i++) bzBox(c, p.x - 70, py - (i + 1) * 86, 140, 86);
      p.pose = 'sit'; p.seat = (p.onBox * 86) / sc + 8;
    }
    guy(c, p.x ?? W / 2, py, sc, { ...p, T: S.T });
  }
}

// Подложки
function paperBg(c, col = BZ.paper) {
  c.fillStyle = col; c.fillRect(-80, -80, W + 160, H + 160);
  const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 1.1);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,40,20,0.18)');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, H + 160);
}
function darkBg(c) {
  c.fillStyle = BZ.dark; c.fillRect(-80, -80, W + 160, H + 160);
  const g = c.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H);
  g.addColorStop(0, 'rgba(60,70,90,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, H + 160);
}

// ───────────────────────── Текстовая карточка ─────────────────────────
// P: bg ('dark' | 'paper'), lines: [{ text, size, color, weight, at, font }], count (у строки: [от, до] — число
// растёт от at до until, text дописывается после него), y0 (откуда начинать столбик строк)
SCENES.bizcard = (c, S) => {
  const { t, P } = S;
  if (P.bg === 'dark') darkBg(c); else paperBg(c);
  const ls = P.lines || [];
  let total = 0;
  const sized = ls.map((l) => { const sz = l.size || 56; total += sz * 1.35 + (l.gap || 0); return sz; });
  let y = P.y0 ?? H / 2 - total / 2;
  ls.forEach((l, i) => {
    const sz = sized[i]; y += sz * 1.35 + (l.gap || 0);
    const k = since(t, l.at ?? 0, 0.35);
    if (k <= 0) return;
    let text = l.text || '';
    if (l.count) {
      const at = l.at ?? 0, v = lerp(l.count[0], l.count[1], ease.out((t - at) / Math.max(0.1, (l.until ?? at + 1.2) - at)));
      text = `${Math.round(v).toLocaleString('ru-RU')}${l.text || ''}`;
    }
    c.save(); c.globalAlpha = clamp(k * 1.5); c.translate(W / 2, y - sz * 0.35 + (1 - ease.out(k)) * 20);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    fitFont(c, text, l.weight || 800, sz, l.font || 'Montserrat', W - 200);
    const col = bzc(l.color, P.bg === 'dark' ? '#fff' : BZ.ink);
    if (l.pill) {
      const w = c.measureText(text).width + 50, h = sz * 1.5;
      c.fillStyle = col; rr(c, -w / 2, -h / 2, w, h, h / 2); c.fill(); c.fillStyle = '#fff';
    } else c.fillStyle = col;
    c.fillText(text, 0, 2);
    c.restore();
  });
  bizUI(c, S);
};

// ───────────────────────── Карточка главы ─────────────────────────
// P: kicker («СЕРИЯ 1 · ДЕНЬ 14»), icon ('box' | 'scale' | 'chart' | 'doc' | 'calendar' | 'truck'), iconText, title, sub,
// budget { value, of, from, color, note }
SCENES.chapter = (c, S) => {
  const { t, T, P } = S;
  paperBg(c);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.globalAlpha = after(t, 0.05, 0.4); c.fillStyle = BZ.muted; c.font = '700 30px "JetBrains Mono"';
  c.fillText((P.kicker || '').toUpperCase().split('').join(' '), W / 2, 210); c.globalAlpha = 1;
  if (P.icon) { const k = ease.back(after(t, 0.15, 0.4)); if (k > 0) bzIcon(c, P.icon, W / 2, 330, 1.5 * k, P.iconText); }
  const kt = ease.back(after(t, 0.3, 0.4));
  if (kt > 0) {
    c.save(); c.translate(W / 2, 500); c.scale(kt, kt); c.fillStyle = BZ.ink; c.font = '900 150px Montserrat';
    c.fillText((P.title || '').toUpperCase(), 0, 0); c.restore();
  }
  if (P.sub) { c.globalAlpha = after(t, 0.6, 0.4); c.fillStyle = '#5b606b'; c.font = '500 56px Montserrat'; c.fillText(P.sub, W / 2, 610); c.globalAlpha = 1; }
  if (P.budget) {
    const b = P.budget, k = after(t, 0.7, 0.4), x = 560, y = 760, w = 800;
    const cur = Math.round(lerp(b.from ?? b.value, b.value, ease.inOut((t - 0.9) / 1.2)) / 1000) * 1000, fr = clamp(cur / b.of);
    c.globalAlpha = k; c.textAlign = 'left';
    c.fillStyle = BZ.muted; c.font = '700 24px "JetBrains Mono"'; c.fillText('БЮДЖЕТ', x, y - 70);
    c.fillStyle = BZ.ink; c.font = '800 46px Montserrat'; c.fillText(money(cur), x, y - 28);
    if (b.note) { c.textAlign = 'right'; c.fillStyle = bzc(b.noteColor, BZ.green); c.font = '800 30px Montserrat'; c.fillText(b.note, x + w, y - 28); c.textAlign = 'left'; }
    c.fillStyle = 'rgba(34,37,43,0.12)'; rr(c, x, y, w, 26, 13); c.fill();
    c.fillStyle = bzc(b.color, fr < 0.15 ? BZ.red : BZ.green); rr(c, x, y, Math.max(26, w * fr), 26, 13); c.fill();
    c.fillStyle = BZ.muted; c.font = '600 24px Montserrat'; c.fillText(`из ${money(b.of)}`, x, y + 62);
    c.globalAlpha = 1;
  }
  bizUI(c, S);
};

// ───────────────────────── Квартира ─────────────────────────
// P: time ('day' | 'night'), boxes (сколько штабелей коробок, 0…14), desk ({ x } — стол с ноутбуком перед героем), humid ({ on: at } —
// увлажнитель на тумбочке), hero и people (guy: pose 'sit' на кровати/ящике, 'lie' — в кровати, arms…), tuck (укрыть
// одеялом того, кто лежит), dark, lights (дополнительные источники света ночью)
SCENES.flat = (c, S) => {
  const { t, T, P } = S;
  const night = P.time === 'night', floor = 880;
  c.fillStyle = night ? '#3a3f4f' : '#d9d2c4'; c.fillRect(-80, -80, W + 160, floor + 80);
  c.fillStyle = night ? 'rgba(255,255,255,0.025)' : 'rgba(120,100,80,0.06)';
  for (let x = -40; x < W + 40; x += 80) c.fillRect(x, -80, 36, floor + 80);
  // окно
  const wx = 1240, wy = 170, ww = 460, wh = 420;
  c.save(); c.beginPath(); c.rect(wx, wy, ww, wh); c.clip();
  let g = c.createLinearGradient(0, wy, 0, wy + wh);
  g.addColorStop(0, night ? '#0b1022' : '#bcd3e6'); g.addColorStop(1, night ? '#28304c' : '#e9eef2');
  c.fillStyle = g; c.fillRect(wx, wy, ww, wh);
  skyline(c, 29, wy + wh, 120, 300, 50, 100, night ? '#151a2c' : '#a6b2c2', night ? 0.4 : 0, T);
  c.restore();
  c.strokeStyle = '#f4f1ea'; c.lineWidth = 16; c.strokeRect(wx, wy, ww, wh);
  c.lineWidth = 10; c.beginPath(); c.moveTo(wx + ww / 2, wy); c.lineTo(wx + ww / 2, wy + wh); c.stroke();
  c.fillStyle = '#f4f1ea'; c.fillRect(wx - 30, wy + wh, ww + 60, 22);
  // батарея
  c.fillStyle = '#e8e6e0';
  for (let i = 0; i < 9; i++) { rr(c, wx + 40 + i * 42, wy + wh + 60, 34, 120, 8); c.fill(); }
  // пол
  c.fillStyle = night ? '#2a2420' : '#b48a62'; c.fillRect(-80, floor, W + 160, H - floor + 80);
  c.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = -80; x < W + 80; x += 160) c.fillRect(x, floor, 4, H - floor);
  // кровать (матрас на высоте ~120 px — по колено человечку) и тумбочка
  c.fillStyle = '#6b4d3a'; rr(c, 120, 790, 620, 90, 12); c.fill();
  c.fillStyle = '#eee8dc'; rr(c, 130, 756, 600, 54, 20); c.fill();
  c.fillStyle = night ? '#3d5a7a' : '#5b86b0'; rr(c, 300, 746, 440, 74, 24); c.fill();
  c.fillStyle = '#ffffff'; rr(c, 140, 722, 150, 52, 24); c.fill();
  c.fillStyle = '#6b4d3a'; rr(c, 110, 660, 26, 220, 8); c.fill();
  c.fillStyle = '#7a5a44'; rr(c, 770, 780, 150, 100, 8); c.fill();
  // коробки
  const n = P.boxes ?? 0;
  const spots = [[1460, 3], [1580, 4], [1700, 3], [1820, 4], [1000, 2], [1100, 3], [1210, 2], [1330, 3], [-20, 4], [470, 1], [590, 1], [880, 1], [180, 1], [1940, 3]];
  for (let i = 0; i < Math.min(n, spots.length); i++) {
    const [bx, rows] = spots[i], bw = 120, bh = 86;
    const by0 = bx === 470 || bx === 590 || bx === 180 ? 756 : bx === 880 ? 780 : floor;
    for (let r = 0; r < rows; r++) bzBox(c, bx + (r % 2) * 6 - 3, by0 - (r + 1) * bh, bw, bh);
  }
  if (P.humid) humid(c, 845, 780, 0.9, t >= (P.humid.on ?? 0) ? 'ok' : 'off', T);
  bizPeople(c, S, { x: 520, y: floor, scale: 1.25 });
  if (P.desk) {
    // стол стоит перед героем, ноутбук повёрнут к нему — зритель видит крышку
    const dx = P.desk.x ?? 1190;
    c.fillStyle = '#7a5a44'; c.fillRect(dx - 230, 712, 460, 26); c.fillRect(dx - 210, 738, 22, 142); c.fillRect(dx + 188, 738, 22, 142);
    c.fillStyle = '#c9ccd2'; c.beginPath(); c.moveTo(dx - 110, 712); c.lineTo(dx + 110, 712); c.lineTo(dx + 96, 600); c.lineTo(dx - 96, 600); c.closePath(); c.fill();
    c.strokeStyle = BZ.ink; c.lineWidth = 3; c.stroke();
    circle(c, dx, 652, 12, '#e9ebef');
  }
  if (P.tuck) { c.fillStyle = night ? '#3d5a7a' : '#5b86b0'; rr(c, 300, 712, 440, 108, 26); c.fill(); }
  // ночью — темнота со светом от окна, экрана телефона и увлажнителя
  if (night) {
    const lights = [{ x: wx + ww / 2, y: wy + wh / 2, r: 600, k: 0.45 }];
    if (P.humid && t >= (P.humid.on ?? 0)) lights.push({ x: 845, y: 700, r: 520, k: 0.8 });
    if (P.desk) lights.push({ x: P.desk.x ?? 1190, y: 560, r: 460, k: 0.75 });
    for (const lt of P.lights || []) lights.push(lt);
    darkness(c, P.dark ?? 0.55, lights, '8,10,20');
    if (P.humid && t >= (P.humid.on ?? 0)) glow(c, 845, 680, 260, '150,170,255', 0.25);
  }
  bizUI(c, S);
};

// ───────────────────────── Улица ─────────────────────────
// P: time ('day' | 'evening'), shop (вывеска пункта выдачи), hero и people
SCENES.street = (c, S) => {
  const { t, T, P } = S;
  const eve = P.time === 'evening', gy = 860;
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, eve ? '#3b3f66' : '#a9c9e2'); g.addColorStop(1, eve ? '#e59a72' : '#e6eef2');
  c.fillStyle = g; c.fillRect(-80, -80, W + 160, gy + 80);
  skyline(c, 5, gy - 120, 260, 520, 120, 220, eve ? '#585a7a' : '#b7c3cf', eve ? 0.3 : 0, T);
  // дома первого плана
  const houses = [[-40, 380, '#e7d8c2'], [400, 470, '#d9c6ae'], [930, 360, '#e3d2bd'], [1350, 520, '#d6c2a8'], [1790, 420, '#e2d3be']];
  for (const [hx, hh, col] of houses) {
    c.fillStyle = col; c.fillRect(hx, gy - hh, 420, hh);
    c.fillStyle = eve ? '#ffd58a' : '#9bb2c8';
    for (let wy2 = gy - hh + 40; wy2 < gy - 170; wy2 += 90) for (let wx2 = hx + 40; wx2 < hx + 380; wx2 += 90) c.fillRect(wx2, wy2, 46, 56);
  }
  if (P.shop) {
    const sx = 930, sw = 420;
    c.fillStyle = '#5a3e8c'; c.fillRect(sx, gy - 230, sw, 64);
    c.fillStyle = '#fff'; c.font = '900 34px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(P.shop, sx + sw / 2, gy - 197);
    c.fillStyle = '#2b2f38'; c.fillRect(sx + 40, gy - 160, 150, 160); c.fillStyle = '#9fc1de'; c.fillRect(sx + 220, gy - 150, 170, 110);
  }
  // тротуар и дорога
  c.fillStyle = '#c9c4ba'; c.fillRect(-80, gy, W + 160, 90);
  c.fillStyle = '#4a4e57'; c.fillRect(-80, gy + 90, W + 160, H - gy);
  c.fillStyle = '#f2f2f2'; for (let x = ((-T * 60) % 200) - 200; x < W + 200; x += 200) c.fillRect(x, gy + 150, 110, 10);
  bizPeople(c, S, { x: 700, y: gy + 40, scale: 1.2 });
  bizUI(c, S);
};

// ───────────────────────── Сравнение карточек товаров ─────────────────────────
// P: products: [{ head (подпись над карточкой), title, price, old (зачёркнутая цена), rating, reviews, seller, img ('ok' | 'off'),
// at, color (цвет цены), highlight (цвет рамки), stamp }], arrow { text, at } — стрелка между двумя карточками
SCENES.compare = (c, S) => {
  const { t, T, P } = S;
  paperBg(c);
  const cards = P.products || [], n = cards.length, cw = n > 2 ? 470 : 560, gap = n > 2 ? 60 : (P.arrow ? 260 : 140);
  const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2;
  cards.forEach((cd, i) => {
    const k = since(t, cd.at ?? 0.2 + i * 0.3, 0.35);
    if (k <= 0) return;
    const x = x0 + i * (cw + gap), y = 170, ch = 760;
    c.save(); c.globalAlpha = clamp(k * 1.6); c.translate(0, (1 - ease.out(k)) * 40);
    if (cd.head) { c.fillStyle = BZ.ink; c.font = '800 34px Montserrat'; c.textAlign = 'center'; c.fillText(cd.head, x + cw / 2, y - 30); }
    c.fillStyle = 'rgba(0,0,0,0.12)'; rr(c, x + 10, y + 14, cw, ch, 26); c.fill();
    c.fillStyle = '#fff'; rr(c, x, y, cw, ch, 26); c.fill();
    c.strokeStyle = cd.highlight ? bzc(cd.highlight) : 'rgba(34,37,43,0.15)'; c.lineWidth = cd.highlight ? 6 : 2; c.stroke();
    c.fillStyle = '#eef1f6'; rr(c, x + 24, y + 24, cw - 48, 360, 18); c.fill();
    humid(c, x + cw / 2, y + 340, 1.25, cd.img || 'ok', T);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = BZ.ink; c.font = '600 32px Montserrat';
    wrapText(c, cd.title || 'Увлажнитель воздуха «Луна»', cw - 60).slice(0, 2).forEach((l, j) => c.fillText(l, x + 30, y + 440 + j * 40));
    c.font = '900 66px Montserrat'; c.fillStyle = bzc(cd.color, BZ.ink); c.fillText(cd.price || '', x + 30, y + 570);
    if (cd.old) { const pw = c.measureText(cd.price || '').width; c.font = '600 32px Montserrat'; c.fillStyle = BZ.muted; c.fillText(cd.old, x + 50 + pw, y + 568); c.fillRect(x + 50 + pw, y + 556, c.measureText(cd.old).width, 3); }
    c.font = '700 30px Montserrat'; c.fillStyle = '#f2a40c';
    c.fillText(cd.rating ? `★ ${cd.rating}` : '★ —', x + 30, y + 630);
    c.fillStyle = BZ.muted; c.font = '600 28px Montserrat'; c.fillText(cd.reviews != null ? `${cd.reviews} отзывов` : '', x + 160, y + 630);
    if (cd.seller) { c.fillStyle = BZ.muted; c.font = '600 26px "JetBrains Mono"'; c.fillText(`Продавец: ${cd.seller}`, x + 30, y + 700); }
    c.restore();
    if (cd.stamp) bzStamp(c, { ...cd.stamp, x: x + cw / 2, y: y + 260 }, t);
  });
  if (P.arrow && n === 2) {
    const k = since(t, P.arrow.at, 0.35);
    if (k > 0) {
      const ax = x0 + cw + gap / 2, ay = 560;
      c.save(); c.globalAlpha = k; c.strokeStyle = BZ.orange; c.fillStyle = BZ.orange; c.lineWidth = 10;
      c.beginPath(); c.moveTo(ax - 90, ay); c.lineTo(ax + 70, ay); c.stroke();
      c.beginPath(); c.moveTo(ax + 96, ay); c.lineTo(ax + 60, ay - 26); c.lineTo(ax + 60, ay + 26); c.fill();
      c.font = '900 64px Montserrat'; c.textAlign = 'center'; c.fillText(P.arrow.text, ax, ay - 50);
      c.restore();
    }
  }
  bizUI(c, S);
};

// ───────────────────────── Расчёт на листе ─────────────────────────
// P: title, rows: [{ label, value, color, at, sub (отступ, мельче), strike }], total { label, value, color, at },
// pill { text, at, color }, side (герой слева: true)
SCENES.ledger = (c, S) => {
  const { t, T, P } = S;
  paperBg(c);
  const side = !!P.hero, pw = 1000, px = side ? 760 : W / 2 - pw / 2;
  const rows = P.rows || [], rh = 78, ph = 150 + rows.length * rh + (P.total ? 120 : 0);
  const py = Math.max(80, H / 2 - ph / 2 - (P.pill ? 40 : 0));
  if (side) bizPeople(c, S, { x: 400, y: 940, scale: 1.45 });
  c.fillStyle = 'rgba(0,0,0,0.1)'; rr(c, px + 12, py + 16, pw, ph, 24); c.fill();
  c.fillStyle = '#fbf9f4'; rr(c, px, py, pw, ph, 24); c.fill();
  if (P.title) { c.fillStyle = BZ.muted; c.font = '700 28px "JetBrains Mono"'; c.textAlign = 'left'; c.fillText(P.title.toUpperCase(), px + 50, py + 70); }
  rows.forEach((r, i) => {
    const k = since(t, r.at ?? 0.2 + i * 0.4, 0.3);
    if (k <= 0) return;
    const y = py + 140 + i * rh;
    c.save(); c.globalAlpha = clamp(k * 1.5); c.translate((1 - ease.out(k)) * -20, 0);
    c.textAlign = 'left'; c.fillStyle = r.sub ? '#5b606b' : BZ.ink; c.font = `${r.sub ? 600 : 700} ${r.sub ? 34 : 42}px Montserrat`;
    c.fillText(r.label, px + (r.sub ? 90 : 50), y);
    c.textAlign = 'right'; c.fillStyle = bzc(r.color, BZ.ink); c.font = `${r.sub ? 700 : 800} ${r.sub ? 36 : 46}px Montserrat`;
    c.fillText(r.value, px + pw - 50, y);
    if (r.strike && t > (r.at ?? 0) + 0.5) { c.fillStyle = BZ.red; c.fillRect(px + 40, y - 14, pw - 80, 4); }
    c.restore();
  });
  if (P.total) {
    const k = since(t, P.total.at ?? 0.2 + rows.length * 0.4, 0.35);
    if (k > 0) {
      const y = py + 140 + rows.length * rh + 40;
      c.globalAlpha = k; c.fillStyle = 'rgba(34,37,43,0.2)'; c.fillRect(px + 40, y - 70, pw - 80, 3);
      c.textAlign = 'left'; c.fillStyle = BZ.ink; c.font = '800 46px Montserrat'; c.fillText(P.total.label, px + 50, y);
      c.textAlign = 'right'; c.fillStyle = bzc(P.total.color, BZ.green); c.font = '900 60px Montserrat'; c.fillText(P.total.value, px + pw - 50, y + 4);
      c.globalAlpha = 1;
    }
  }
  if (P.pill) {
    const k = since(t, P.pill.at, 0.3);
    if (k > 0) {
      c.save(); c.globalAlpha = k; c.translate(px + pw / 2, py + ph + 70); c.scale(ease.back(k), ease.back(k));
      c.font = '800 34px Montserrat'; const w = c.measureText(P.pill.text).width + 70;
      c.fillStyle = bzc(P.pill.color, BZ.red); rr(c, -w / 2, -34, w, 68, 34); c.fill();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(P.pill.text, 0, 2);
      c.restore();
    }
  }
  bizUI(c, S);
};

// ───────────────────────── Список поставщиков ─────────────────────────
// P: title, rows: [{ name, price, note, at, color, mark ('x' | 'check'), pick (at — подсветить) }]
SCENES.sellers = (c, S) => {
  const { t, P } = S;
  paperBg(c);
  const pw = 1180, px = W / 2 - pw / 2, rows = P.rows || [], rh = 112, py = H / 2 - (rows.length * rh + 110) / 2;
  c.fillStyle = '#fbf9f4'; rr(c, px, py, pw, rows.length * rh + 110, 24); c.fill();
  c.fillStyle = BZ.muted; c.font = '700 28px "JetBrains Mono"'; c.textAlign = 'left'; c.fillText((P.title || '').toUpperCase(), px + 44, py + 64);
  rows.forEach((r, i) => {
    const k = since(t, r.at ?? 0.1 + i * 0.15, 0.3);
    if (k <= 0) return;
    const y = py + 100 + i * rh;
    c.save(); c.globalAlpha = clamp(k * 1.5);
    if (r.pick != null && t >= r.pick) { c.fillStyle = 'rgba(255,226,138,0.7)'; rr(c, px + 20, y, pw - 40, rh - 12, 16); c.fill(); }
    circle(c, px + 80, y + rh / 2 - 6, 34, ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#5e7ce2', '#c06c84'][i % 6]);
    c.fillStyle = '#fff'; c.font = '800 30px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(r.name[0], px + 80, y + rh / 2 - 4);
    c.textAlign = 'left'; c.fillStyle = BZ.ink; c.font = '700 36px Montserrat'; c.fillText(r.name, px + 140, y + rh / 2 - 18);
    if (r.note) { c.fillStyle = BZ.muted; c.font = '600 26px Montserrat'; c.fillText(r.note, px + 140, y + rh / 2 + 22); }
    c.textAlign = 'right'; c.fillStyle = bzc(r.color, BZ.ink); c.font = '900 46px Montserrat'; c.fillText(r.price, px + pw - 150, y + rh / 2 - 4);
    if (r.mark) {
      const mk = since(t, r.markAt ?? r.at ?? 0, 0.25), mx = px + pw - 80, my = y + rh / 2 - 6;
      if (mk > 0) {
        circle(c, mx, my, 28 * ease.back(mk), r.mark === 'x' ? BZ.red : BZ.green);
        c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath();
        if (r.mark === 'x') { c.moveTo(mx - 11, my - 11); c.lineTo(mx + 11, my + 11); c.moveTo(mx + 11, my - 11); c.lineTo(mx - 11, my + 11); }
        else { c.moveTo(mx - 13, my); c.lineTo(mx - 3, my + 10); c.lineTo(mx + 14, my - 10); }
        c.stroke();
      }
    }
    c.restore();
  });
  bizUI(c, S);
};

// ───────────────────────── Полароиды ─────────────────────────
// P: photos: [{ img ('ok' | 'off' | 'leak'), caption, sub, mark ('x' | 'check'), at, rot }]
SCENES.polaroids = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#3b2d24'; c.fillRect(-80, -80, W + 160, H + 160);
  c.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = -40; y < H + 40; y += 54) c.fillRect(-80, y, W + 160, 3);
  glow(c, W / 2, H / 2 - 60, 900, '255,220,170', 0.12);
  const ph = P.photos || [], n = ph.length, pw = 440, gap = 80, x0 = W / 2 - (n * pw + (n - 1) * gap) / 2;
  ph.forEach((p, i) => {
    const k = since(t, p.at ?? 0.2 + i * 0.5, 0.4);
    if (k <= 0) return;
    const x = x0 + i * (pw + gap) + pw / 2, y = 520;
    c.save(); c.translate(x, y + (1 - ease.out(k)) * 60); c.rotate(p.rot ?? (i - (n - 1) / 2) * 0.05); c.globalAlpha = clamp(k * 1.5);
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(-pw / 2 + 12, -270 + 16, pw, 560);
    c.fillStyle = '#f7f4ec'; c.fillRect(-pw / 2, -270, pw, 560);
    c.fillStyle = p.img === 'ok' ? '#1d2236' : '#d8dde4'; c.fillRect(-pw / 2 + 26, -244, pw - 52, 380);
    humid(c, 0, 90, 1.35, p.img || 'ok', T);
    c.fillStyle = BZ.ink; c.textAlign = 'center'; c.font = '700 44px Caveat'; c.fillText(p.caption || '', 0, 200);
    if (p.sub) { c.font = '600 36px Caveat'; c.fillStyle = p.mark === 'x' ? BZ.red : BZ.green; c.fillText(p.sub, 0, 248); }
    c.restore();
    if (p.mark) {
      const mk = since(t, p.markAt ?? (p.at ?? 0) + 0.4, 0.25);
      if (mk > 0) {
        const mx = x + pw / 2 - 30, my = y - 250;
        circle(c, mx, my, 40 * ease.back(mk), p.mark === 'x' ? BZ.red : BZ.green);
        c.strokeStyle = '#fff'; c.lineWidth = 9; c.beginPath();
        if (p.mark === 'x') { c.moveTo(mx - 15, my - 15); c.lineTo(mx + 15, my + 15); c.moveTo(mx + 15, my - 15); c.lineTo(mx - 15, my + 15); }
        else { c.moveTo(mx - 18, my); c.lineTo(mx - 4, my + 14); c.lineTo(mx + 20, my - 14); }
        c.stroke();
      }
    }
  });
  bizUI(c, S);
};

// ───────────────────────── Чат в телефоне ─────────────────────────
// P: name (с кем чат), status, msgs: [{ side: 'me' | 'them', text, at, time, media: 'scale' | 'video' | 'humid', mediaText }],
// read (at — у последнего моего сообщения «прочитано»), typing (at), hero (слева от телефона)
function chatMedia(c, kind, x, y, w, h, T, text) {
  c.save(); c.beginPath(); rr(c, x, y, w, h, 14); c.clip();
  c.fillStyle = kind === 'humid' ? '#141a2c' : '#c9c2b2'; c.fillRect(x, y, w, h);
  if (kind === 'scale') {
    c.fillStyle = '#8d949e'; c.fillRect(x + 30, y + h - 60, w - 60, 26);
    for (let r = 0; r < 3; r++) for (let q = 0; q < 4 - r; q++) bzBox(c, x + 60 + q * 70 + r * 35, y + h - 60 - (r + 1) * 52, 66, 52);
    c.fillStyle = '#1b1f27'; rr(c, x + w - 170, y + 26, 140, 60, 8); c.fill();
    c.fillStyle = '#7dff9a'; c.font = '700 34px "JetBrains Mono"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text || '240.0kg', x + w - 100, y + 58);
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.font = '600 20px "JetBrains Mono"'; c.textAlign = 'left'; c.fillText('12.10 14:32 · №3317', x + 20, y + 30);
  } else if (kind === 'humid') {
    humid(c, x + w / 2, y + h - 30, 1, 'ok', T);
  } else {
    for (let r = 0; r < 3; r++) for (let q = 0; q < 5; q++) bzBox(c, x + 20 + q * 76, y + h - 20 - (r + 1) * 56, 70, 52);
  }
  circle(c, x + w / 2, y + h / 2, 34, 'rgba(0,0,0,0.45)');
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(x + w / 2 - 10, y + h / 2 - 16); c.lineTo(x + w / 2 + 16, y + h / 2); c.lineTo(x + w / 2 - 10, y + h / 2 + 16); c.fill();
  c.restore();
}
SCENES.chat = (c, S) => {
  const { t, T, P } = S;
  paperBg(c);
  const side = !!P.hero, pw = 640, ph = 980, px = side ? 1060 : W / 2 - pw / 2, py = 50;
  if (side) bizPeople(c, S, { x: 520, y: 960, scale: 1.5 });
  c.fillStyle = '#1b1e25'; rr(c, px - 16, py - 16, pw + 32, ph + 32, 70); c.fill();
  c.save(); rr(c, px, py, pw, ph, 56); c.clip();
  c.fillStyle = '#e9edf2'; c.fillRect(px, py, pw, ph);
  c.fillStyle = '#fff'; c.fillRect(px, py, pw, 150);
  circle(c, px + 80, py + 95, 34, P.avatar || '#5e7ce2');
  c.fillStyle = '#fff'; c.font = '800 30px Montserrat'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText((P.name || '?')[0], px + 80, py + 97);
  c.textAlign = 'left'; c.fillStyle = BZ.ink; c.font = '800 32px Montserrat'; c.fillText(P.name || '', px + 134, py + 82);
  c.fillStyle = BZ.muted; c.font = '600 22px Montserrat'; c.fillText(P.typing != null && t >= P.typing ? 'печатает…' : (P.status || 'в сети'), px + 134, py + 116);
  let y = py + 190;
  const msgs = P.msgs || [];
  let lastMine = -1;
  msgs.forEach((m, i) => { if (m.side === 'me' && t >= (m.at ?? 0)) lastMine = i; });
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i], k = since(t, m.at ?? 0, 0.3);
    if (k <= 0) continue;
    const mine = m.side === 'me', maxW = pw - 170;
    c.font = '600 30px Montserrat';
    const ls = m.text ? wrapText(c, m.text, maxW - 40) : [];
    const mw = m.media ? maxW : Math.max(...ls.map((l) => c.measureText(l).width)) + 44;
    const mh = (m.media ? 250 : 0) + ls.length * 40 + (ls.length ? 30 : 10) + 22;
    const x = mine ? px + pw - 30 - mw : px + 30;
    c.save(); c.globalAlpha = clamp(k * 1.6); c.translate(0, (1 - ease.out(k)) * 20);
    c.fillStyle = mine ? '#d6f5c4' : '#fff'; rr(c, x, y, mw, mh, 22); c.fill();
    if (m.media) chatMedia(c, m.media, x + 10, y + 10, mw - 20, 240, T, m.mediaText);
    c.fillStyle = BZ.ink; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = '600 30px Montserrat';
    ls.forEach((l, j) => c.fillText(l, x + 22, y + (m.media ? 260 : 0) + 44 + j * 40));
    c.fillStyle = BZ.muted; c.font = '600 18px Montserrat'; c.textAlign = 'right';
    const tick = mine ? (i === lastMine && P.read != null && t >= P.read ? ' ✓✓' : ' ✓') : '';
    c.fillText(`${m.time || ''}${tick}`, x + mw - 16, y + mh - 12);
    c.restore();
    y += mh + 18;
  }
  if (P.typing != null && t >= P.typing) {
    c.fillStyle = '#fff'; rr(c, px + 30, y, 120, 64, 22); c.fill();
    for (let i = 0; i < 3; i++) circle(c, px + 62 + i * 28, y + 32, 7, `rgba(34,37,43,${0.3 + 0.5 * (Math.sin(T * 8 - i) * 0.5 + 0.5)})`);
  }
  c.restore();
  bizUI(c, S);
};

// ───────────────────────── Звонок: двое на разных концах ─────────────────────────
// P: left / right — фон половины ('room' | 'office' | 'warehouse'), hero (слева) и people[0] (справа)
function halfBg(c, kind, x0, w) {
  c.save(); c.beginPath(); c.rect(x0, -80, w, H + 160); c.clip();
  c.fillStyle = kind === 'warehouse' ? '#c7cbd1' : kind === 'office' ? '#d5dde3' : '#d9d2c4'; c.fillRect(x0, -80, w, H + 160);
  if (kind === 'warehouse') {
    for (let sx = x0 + 60; sx < x0 + w - 100; sx += 330) {
      c.fillStyle = '#5b6b8c'; c.fillRect(sx, 200, 12, 640); c.fillRect(sx + 288, 200, 12, 640);
      for (let sy2 = 300; sy2 <= 800; sy2 += 170) { c.fillStyle = '#e38b2c'; c.fillRect(sx, sy2, 300, 12); for (let q = 0; q < 3; q++) bzBox(c, sx + 14 + q * 92, sy2 - 80, 84, 78); }
    }
  } else if (kind === 'office') {
    c.fillStyle = '#a9c4da'; c.fillRect(x0 + 120, 160, w - 240, 380);
    c.strokeStyle = '#eef3f6'; c.lineWidth = 12; c.strokeRect(x0 + 120, 160, w - 240, 380);
  } else {
    c.fillStyle = '#bcd3e6'; c.fillRect(x0 + 140, 180, 320, 300); c.strokeStyle = '#f4f1ea'; c.lineWidth = 12; c.strokeRect(x0 + 140, 180, 320, 300);
  }
  c.fillStyle = kind === 'warehouse' ? '#8f949b' : '#b48a62'; c.fillRect(x0, 880, w, H);
  c.restore();
}
SCENES.call = (c, S) => {
  const { t, T, P } = S;
  halfBg(c, P.left || 'room', 0, W / 2); halfBg(c, P.right || 'office', W / 2, W / 2);
  const hero = P.hero === false ? null : heroIn(S, { x: 480, arms: 'phone' });
  if (hero) guy(c, hero.x ?? 480, 960, hero.scale ?? 1.45, { ...hero, T });
  const other = (P.people || [])[0] ? personIn(S, P.people[0], { x: 1440, arms: 'phone', facing: -1 }) : null;
  if (other) guy(c, other.x ?? 1440, 960, other.scale ?? 1.45, { ...other, T });
  c.fillStyle = BZ.ink; c.fillRect(W / 2 - 4, -80, 8, H + 160);
  bizUI(c, S);
};

// ───────────────────────── Кабинет продавца ─────────────────────────
// P: product, day ([{ text, at }] — подпись дня), orders { from, to, at, until }, bars: [{ v, at }], max, views,
// note { text, at, color }
SCENES.dash = (c, S) => {
  const { t, T, P } = S;
  paperBg(c);
  const lx = 210, ly = 90, lw = 1500, lh = 820;
  c.fillStyle = '#2b2f38'; rr(c, lx - 20, ly - 20, lw + 40, lh + 40, 26); c.fill();
  c.fillStyle = '#3a3f4a'; c.beginPath(); c.moveTo(lx - 120, ly + lh + 20); c.lineTo(lx + lw + 120, ly + lh + 20); c.lineTo(lx + lw + 60, ly + lh + 60); c.lineTo(lx - 60, ly + lh + 60); c.fill();
  c.save(); rr(c, lx, ly, lw, lh, 10); c.clip();
  c.fillStyle = '#f5f6f8'; c.fillRect(lx, ly, lw, lh);
  c.fillStyle = '#5a3e8c'; c.fillRect(lx, ly, lw, 80);
  c.fillStyle = '#fff'; c.font = '800 32px Montserrat'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('Кабинет продавца', lx + 40, ly + 42);
  // товар
  c.fillStyle = '#fff'; rr(c, lx + 40, ly + 120, 460, 300, 18); c.fill();
  c.fillStyle = '#1d2236'; rr(c, lx + 60, ly + 140, 200, 260, 14); c.fill();
  humid(c, lx + 160, ly + 380, 0.95, 'ok', T);
  c.fillStyle = BZ.ink; c.font = '700 30px Montserrat'; c.textBaseline = 'alphabetic';
  wrapText(c, P.product || 'Увлажнитель «Луна»', 210).forEach((l, i) => c.fillText(l, lx + 280, ly + 190 + i * 38));
  c.font = '900 44px Montserrat'; c.fillText(P.price || '9 990 ₸', lx + 280, ly + 330);
  // заказы
  const od = P.orders || { from: 0, to: 0 };
  const ov = Math.round(lerp(od.from ?? 0, od.to ?? 0, ease.out((t - (od.at ?? 0)) / Math.max(0.1, (od.until ?? (od.at ?? 0) + 1) - (od.at ?? 0)))));
  c.fillStyle = '#fff'; rr(c, lx + 540, ly + 120, 420, 300, 18); c.fill();
  c.fillStyle = BZ.muted; c.font = '700 26px "JetBrains Mono"'; c.fillText('ЗАКАЗЫ СЕГОДНЯ', lx + 580, ly + 180);
  c.fillStyle = ov > 0 ? BZ.green : BZ.red; c.font = '900 150px Montserrat'; c.fillText(String(ov), lx + 575, ly + 350);
  c.fillStyle = '#fff'; rr(c, lx + 1000, ly + 120, 460, 300, 18); c.fill();
  c.fillStyle = BZ.muted; c.font = '700 26px "JetBrains Mono"'; c.fillText('ДЕНЬ', lx + 1040, ly + 180);
  const days = P.day || [];
  let dtext = '';
  for (const d of days) if (t >= (d.at ?? 0)) dtext = d.text;
  c.fillStyle = BZ.ink; c.font = '900 110px Montserrat'; c.fillText(dtext, lx + 1035, ly + 340);
  // график
  c.fillStyle = '#fff'; rr(c, lx + 40, ly + 450, lw - 80, 330, 18); c.fill();
  const bars = P.bars || [], mx = P.max || Math.max(1, ...bars.map((b) => b.v)), bw = (lw - 200) / Math.max(bars.length, 1);
  c.fillStyle = 'rgba(34,37,43,0.12)'; c.fillRect(lx + 90, ly + 740, lw - 180, 3);
  bars.forEach((b, i) => {
    const k = since(t, b.at ?? 0, 0.4);
    const h = Math.max(4, 240 * (b.v / mx) * ease.out(k));
    if (k <= 0) return;
    c.fillStyle = b.v > 0 ? BZ.green : BZ.red; rr(c, lx + 100 + i * bw + bw * 0.15, ly + 740 - h, bw * 0.7, h, 8); c.fill();
    c.fillStyle = BZ.ink; c.font = '700 24px Montserrat'; c.textAlign = 'center'; c.fillText(String(b.v), lx + 100 + i * bw + bw / 2, ly + 726 - h);
    c.fillStyle = BZ.muted; c.font = '600 20px Montserrat'; c.fillText(b.label || `д${i + 1}`, lx + 100 + i * bw + bw / 2, ly + 770);
    c.textAlign = 'left';
  });
  c.restore();
  bizUI(c, S);
};

// ───────────────────────── Видео в карточке и ответы рядом ─────────────────────────
// P: points: [{ q, a, at }] — вопрос покупателя и ответ, title
SCENES.pitch = (c, S) => {
  const { t, T, P } = S;
  paperBg(c);
  const px = 230, py = 70, pw = 520, ph = 940;
  c.fillStyle = '#1b1e25'; rr(c, px - 14, py - 14, pw + 28, ph + 28, 60); c.fill();
  c.save(); rr(c, px, py, pw, ph, 48); c.clip();
  c.fillStyle = '#0f1424'; c.fillRect(px, py, pw, ph);
  c.fillStyle = '#1d2540'; c.fillRect(px, py + ph - 260, pw, 260);
  humid(c, px + pw / 2, py + ph - 200, 1.8, 'ok', T);
  c.fillStyle = 'rgba(255,255,255,0.85)'; c.font = '700 26px Montserrat'; c.textAlign = 'left'; c.fillText('● REC', px + 30, py + 60);
  c.fillStyle = '#fff'; c.font = '800 34px Montserrat'; c.fillText(P.caption || 'Ночь. 25 дБ. 8 часов.', px + 30, py + ph - 40);
  c.restore();
  if (P.title) { c.fillStyle = BZ.ink; c.font = '900 50px Montserrat'; c.textAlign = 'left'; c.fillText(P.title, 900, 170); }
  (P.points || []).forEach((p, i) => {
    const k = since(t, p.at ?? 0.3 + i * 0.6, 0.35);
    if (k <= 0) return;
    const y = 260 + i * 200;
    c.save(); c.globalAlpha = clamp(k * 1.5); c.translate((1 - ease.out(k)) * 40, 0);
    c.fillStyle = BZ.muted; c.font = '600 32px Montserrat'; c.textAlign = 'left'; c.fillText(p.q, 900, y + 40);
    c.fillStyle = BZ.ink; c.font = '900 56px Montserrat'; c.fillText(p.a, 900, y + 110);
    c.fillStyle = BZ.green; c.fillRect(870, y + 10, 8, 110);
    c.restore();
  });
  bizUI(c, S);
};

// ───────────────────────── Записи на листке ─────────────────────────
// P: title, lines: [{ text, at, color, strike }], lamp (лампа-подсветка)
SCENES.notes = (c, S) => {
  const { t, T, P } = S;
  c.fillStyle = '#2b2420'; c.fillRect(-80, -80, W + 160, H + 160);
  glow(c, W / 2, H / 2, 900, '255,214,160', 0.16);
  c.save(); c.translate(W / 2, H / 2); c.rotate(-0.025);
  const pw = 1000, ph = 860;
  c.fillStyle = 'rgba(0,0,0,0.4)'; c.fillRect(-pw / 2 + 18, -ph / 2 + 22, pw, ph);
  c.fillStyle = '#f6f2e7'; c.fillRect(-pw / 2, -ph / 2, pw, ph);
  c.strokeStyle = 'rgba(70,110,170,0.3)'; c.lineWidth = 2;
  for (let y = -ph / 2 + 160; y < ph / 2; y += 70) { c.beginPath(); c.moveTo(-pw / 2 + 30, y); c.lineTo(pw / 2 - 30, y); c.stroke(); }
  c.fillStyle = BZ.ink; c.font = '800 54px Montserrat'; c.textAlign = 'left'; c.fillText((P.title || '').toUpperCase(), -pw / 2 + 70, -ph / 2 + 110);
  (P.lines || []).forEach((ln, i) => {
    const k = after(t, ln.at ?? 0.4 + i, 0.7);
    if (k <= 0) return;
    const y = -ph / 2 + 220 + i * 140;
    c.save(); c.font = '700 64px Caveat';
    const w = c.measureText(ln.text).width;
    c.beginPath(); c.rect(-pw / 2 + 60, y - 70, (w + 30) * k, 100); c.clip();
    c.fillStyle = ln.color ? bzc(ln.color) : '#1d2a44'; c.fillText(ln.text, -pw / 2 + 70, y);
    c.restore();
    if (ln.strike && t > (ln.at ?? 0) + 0.8) { c.strokeStyle = BZ.red; c.lineWidth = 5; c.beginPath(); c.moveTo(-pw / 2 + 60, y - 20); c.lineTo(-pw / 2 + 90 + w, y - 26); c.stroke(); }
  });
  c.restore();
  bizUI(c, S);
};

// ───────────────────────── Концовка с названием канала ─────────────────────────
// P: title, sub, foot
SCENES.outro = (c, S) => {
  const { t, P } = S;
  paperBg(c);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const k = ease.back(after(t, 0.1, 0.45));
  c.save(); c.translate(W / 2, 470); c.scale(k, k); c.fillStyle = BZ.ink; c.font = '900 140px Montserrat'; c.fillText((P.title || '').toUpperCase(), 0, 0); c.restore();
  c.globalAlpha = after(t, 0.6, 0.5); c.fillStyle = '#5b606b'; c.font = '500 50px Montserrat'; c.fillText(P.sub || '', W / 2, 590);
  c.globalAlpha = after(t, 1, 0.5) * 0.6; c.font = '600 24px "JetBrains Mono"'; c.fillText(P.foot || '', W / 2, 960);
  c.globalAlpha = 1;
  bizUI(c, S);
};

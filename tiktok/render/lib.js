'use strict';
// Общие помощники для сцен: математика, случайные числа, человечки, свет.

// Размер кадра: по умолчанию вертикальный 1080×1920, сценарий может задать свой (size: [1920, 1080]).
let W = 1080, H = 1920;
const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, x) => a + (b - a) * x;
const ease = {
  out: (x) => 1 - Math.pow(1 - clamp(x), 3),
  inOut: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  back: (x) => { x = clamp(x); const k = 1.9; return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); },
};
// 0 до момента at, затем плавно до 1 за dur секунд. at == null — сразу 1.
const after = (t, at, dur = 0.35) => (at == null ? 1 : clamp((t - at) / dur));

const PAL = {
  yellow: '#FFD43B', red: '#FF453A', green: '#34C46A', blue: '#4EA8FF', white: '#F4F4F4', ink: '#15181e',
};
const CHIP = {
  red: ['#E5383B', '#fff'], green: ['#2FA84F', '#fff'], yellow: ['#F2C230', '#17140a'],
  white: ['#ECECEC', '#15181e'], dark: ['#232a38', '#e9e9e9'], blue: ['#2F7CF6', '#fff'],
};
const color = (c, fallback) => PAL[c] || c || fallback;

function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (n) => rng(Math.floor(n) * 9973 + 17)();
function noise1(x, seed = 0) { // гладкий шум 0..1
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 1013), hash(i + 1 + seed * 1013), u);
}

function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function circle(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = fill; c.fill(); }
function glow(c, x, y, r, rgb, a) { // мягкое свечение, складывается со сценой
  if (a <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
}
// Видимый луч фонаря (дымка в воздухе).
function beam(c, x, y, a, spread, len, alpha = 0.22, rgb = '255,244,214') {
  const g = c.createRadialGradient(x, y, 0, x, y, len);
  g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(0.5, `rgba(${rgb},${alpha * 0.35})`); g.addColorStop(1, `rgba(${rgb},0)`);
  c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.filter = 'blur(6px)';
  c.beginPath(); c.moveTo(x, y); c.arc(x, y, len, a - spread, a + spread); c.closePath(); c.fill(); c.restore();
}

// Темнота с «дырками» от источников света. lights: {x,y,r} — круг, {x,y,a,spread,len} — конус.
let LIGHT = null, lc = null;
function darkness(c, alpha, lights = [], rgb = '0,0,0') {
  if (alpha <= 0.001) return;
  if (!LIGHT || LIGHT.width !== c.canvas.width || LIGHT.height !== c.canvas.height) {
    LIGHT = document.createElement('canvas'); LIGHT.width = c.canvas.width; LIGHT.height = c.canvas.height;
    lc = LIGHT.getContext('2d');
  }
  lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.filter = 'none';
  lc.clearRect(0, 0, LIGHT.width, LIGHT.height);
  lc.setTransform(c.getTransform());
  lc.fillStyle = `rgba(${rgb},${alpha})`; lc.fillRect(-W, -H, W * 3, H * 3);
  lc.globalCompositeOperation = 'destination-out';
  for (const L of lights) {
    const k = L.k ?? 1;
    if (k <= 0) continue;
    if (L.len) {
      const g = lc.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.len);
      g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(0.55, `rgba(0,0,0,${0.7 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g; lc.filter = 'blur(14px)';
      lc.beginPath(); lc.moveTo(L.x, L.y); lc.arc(L.x, L.y, L.len, L.a - L.spread, L.a + L.spread); lc.closePath(); lc.fill();
      lc.filter = 'none';
    }
    const r = L.r ?? (L.len ? 90 : 0);
    if (r > 0) {
      const g = lc.createRadialGradient(L.x, L.y, 0, L.x, L.y, r);
      g.addColorStop(0, `rgba(0,0,0,${k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g; lc.beginPath(); lc.arc(L.x, L.y, r, 0, TAU); lc.fill();
    }
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(LIGHT, 0, 0); c.restore();
}

function vignette(c, a = 0.55, inner = 0.45) {
  const g = c.createRadialGradient(W / 2, H * 0.45, H * inner * 0.5, W / 2, H * 0.45, H * 0.8);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
  c.fillStyle = g; c.fillRect(-W, -H, W * 3, H * 3);
}

// Плоский человечек в профиль. (x, y) — точка между ступнями, s — масштаб (рост ≈ 270·s).
// o: pose ('stand' | 'walk' | 'sit' | 'sleep' | 'swim' | 'lie' — swim и lie лёжа, голова в сторону facing; 'crouch' —
// идёт пригнувшись),
// phase (фаза шага), facing (1 вправо, -1 влево), light ('phone' | 'torch' в руке, 'head' — фонарь на каске),
// silhouette (цвет — нарисовать силуэтом), seat (высота сиденья для sit/sleep), zombie или carry (руки вперёд),
// dig (машет руками у стены), diver (баллон и маска), mask (только маска), eyesClosed, hat: 'horns' (шлем Локи,
// длина рогов — horns) и одежда из HERO_DEFAULT.
// Возвращает точку и направление фонаря в координатах сцены.
const HERO_DEFAULT = {
  hat: 'helmet', hatColor: '#F4B400', hair: '#2b1d14', skin: '#F1C7A1', jacket: '#F07D1A', stripes: true,
  pants: '#2d3a55', shoes: '#1b1f27', backpack: null, light: 'torch',
};
function drawPerson(c, x, y, s, o) {
  if (o.pose === 'crouch') {
    // пригнувшись: наклон вперёд и ниже ростом, ноги идут шагом
    const f0 = o.facing || 1, th = 0.3 * f0, sq = 0.82;
    c.save(); c.translate(x, y); c.rotate(th); c.scale(1, sq);
    const hd = drawPerson(c, 0, 0, s, { ...o, pose: 'walk' });
    c.restore();
    if (!hd) return null;
    const hx = hd.x, hy = hd.y * sq;
    return { x: x + hx * Math.cos(th) - hy * Math.sin(th), y: y + hx * Math.sin(th) + hy * Math.cos(th), a: hd.a + th };
  }
  const f = o.facing || 1, ph = o.phase || 0, pose = o.pose || 'stand';
  const sil = o.silhouette;
  const col = (k) => sil || o[k];
  const flat = pose === 'swim' || pose === 'lie';
  const sitting = pose === 'sit' || pose === 'sleep';
  const seat = o.seat ?? 120;
  const bob = pose === 'walk' ? -Math.abs(Math.sin(ph)) * 5 : 0;
  const hipY = sitting ? -seat : -108 + bob;
  const rot = flat ? f * Math.PI / 2 : 0;
  const world = (ux, uy) => {
    const px = ux * s * f, py = uy * s;
    return { x: x + px * Math.cos(rot) - py * Math.sin(rot), y: y + px * Math.sin(rot) + py * Math.cos(rot) };
  };
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(s * f, s);
  c.lineCap = 'round'; c.lineJoin = 'round';

  const leg = (ang, near) => {
    c.strokeStyle = near ? col('pants') : shade(col('pants'), -0.18); c.lineWidth = 27;
    let kx, ky, fx, fy;
    if (sitting) { kx = 62; ky = hipY; fx = 66; fy = -6; } else {
      kx = Math.sin(ang) * 55; ky = hipY + Math.cos(ang) * 55;
      const shin = ang + (ang < 0 ? -0.25 : 0.05);
      fx = kx + Math.sin(shin) * 55; fy = ky + Math.cos(shin) * 55;
    }
    c.beginPath(); c.moveTo(0, hipY); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = col('shoes'); rr(c, fx - 14, fy - 8, 40, 16, 7); c.fill();
  };
  const a = pose === 'walk' ? Math.sin(ph) * 0.5 : pose === 'swim' ? Math.sin(ph * 1.6) * 0.28 : 0;
  leg(-a, false);

  const sh = { x: 2, y: hipY - 88 }; // плечо
  const reach = o.zombie || o.carry;
  const armAng = (front) => {
    if (reach) return 1.5 + (front ? Math.sin(ph) * 0.06 : -0.05);
    if (o.dig) return 2.1 + Math.sin(ph * 2 + (front ? 0 : 1.2)) * 0.6;
    if (pose === 'swim') return Math.PI - 0.25;
    if (pose === 'lie') return 0.15;
    if (pose === 'walk') return (front ? -1 : 1) * Math.sin(ph) * 0.55;
    return sitting ? (front ? 0.95 : 0.9) : (front ? 0.1 : 0.12);
  };
  // задняя рука
  c.strokeStyle = shade(col('jacket'), -0.2); c.lineWidth = 21;
  const ba = armAng(false);
  c.beginPath(); c.moveTo(sh.x - 4, sh.y + 8); c.lineTo(sh.x - 4 + Math.sin(ba) * 78, sh.y + 8 + Math.cos(ba) * 78); c.stroke();

  if (o.backpack) { c.fillStyle = sil || o.backpack; rr(c, -58, hipY - 86, 34, 78, 12); c.fill(); }
  if (o.diver) {
    c.fillStyle = sil || '#E9C46A'; rr(c, -64, hipY - 96, 32, 90, 13); c.fill();
    c.fillStyle = sil || '#2b2f36'; rr(c, -56, hipY - 108, 16, 16, 4); c.fill();
    c.strokeStyle = sil || '#2b2f36'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-48, hipY - 104); c.quadraticCurveTo(-20, hipY - 150, 24, hipY - 128); c.stroke();
  }
  // туловище
  c.fillStyle = col('jacket'); rr(c, -31, hipY - 98, 64, 106, 20); c.fill();
  if (o.stripes && !sil) {
    c.fillStyle = 'rgba(236,240,240,0.92)'; c.fillRect(-31, hipY - 52, 64, 9); c.fillRect(-31, hipY - 28, 64, 9);
  }
  leg(a, true);

  // голова
  const tilt = pose === 'sleep' ? 0.5 : 0;
  c.save(); c.translate(4, hipY - 104); c.rotate(tilt);
  c.fillStyle = col('skin'); c.fillRect(-7, -12, 14, 16);
  circle(c, 2, -36, 31, col('skin'));
  if (o.hat === 'helmet') {
    c.fillStyle = col('hatColor');
    c.beginPath(); c.arc(2, -40, 34, Math.PI, TAU); c.fill(); rr(c, -32, -44, 78, 9, 4); c.fill();
  } else if (o.hat === 'horns') {
    // золотой шлем с длинными изогнутыми рогами (horns — длина рогов, 1 обычные, 1.7 огромные)
    const k = o.horns ?? 1, gold = sil || '#d6a531';
    c.fillStyle = col('hair'); c.beginPath(); c.ellipse(-14, -22, 16, 30, 0.15, 0, TAU); c.fill();
    c.fillStyle = gold;
    c.beginPath(); c.arc(2, -40, 34, Math.PI, TAU); c.fill(); rr(c, -32, -46, 70, 12, 5); c.fill();
    c.fillRect(20, -46, 12, 30);
    for (const [bx, w, shade2] of [[-8, 1, 0.82], [8, 1, 1]]) {
      c.fillStyle = sil || (shade2 < 1 ? '#a87f1f' : gold);
      c.beginPath(); c.moveTo(bx - 7, -66); c.quadraticCurveTo(bx - 4, -100 * k, bx - 46 * k, -148 * k);
      c.quadraticCurveTo(bx + 10, -104 * k, bx + 9, -66); c.closePath(); c.fill();
    }
  } else if (o.hat === 'cap') {
    c.fillStyle = col('hatColor');
    c.beginPath(); c.arc(2, -42, 32, Math.PI, TAU); c.fill(); rr(c, 10, -46, 42, 9, 4); c.fill();
  } else if (o.hat !== 'none') {
    c.fillStyle = col('hair');
    c.beginPath(); c.arc(0, -40, 33, Math.PI * 0.92, Math.PI * 1.98); c.fill();
    c.beginPath(); c.ellipse(-16, -30, 17, 22, 0.2, 0, TAU); c.fill();
  }
  if (!sil) {
    if (pose === 'sleep' || pose === 'lie' || o.eyesClosed) { c.fillStyle = '#1b1d22'; c.fillRect(14, -36, 12, 3); }
    else circle(c, 19, -37, 4, '#1b1d22');
    if (o.diver || o.mask) {
      c.fillStyle = '#1d2228'; rr(c, 4, -52, 34, o.mask ? 44 : 24, 8); c.fill();
      c.fillStyle = 'rgba(150,215,235,0.75)'; rr(c, 9, -48, 24, o.mask ? 34 : 15, 5); c.fill();
    }
  } else if (o.eyes) {
    glow(c, 19, -37, 10, '255,240,220', 0.5 * o.eyes); circle(c, 19, -37, 2.5, `rgba(255,245,230,${o.eyes})`);
  }
  if (o.light === 'head') {
    c.fillStyle = sil || '#2b2f36'; rr(c, 26, -56, 14, 16, 4); c.fill();
    circle(c, 40, -48, 6, sil || '#fff7da');
  }
  c.restore();

  // передняя рука (с фонарём или без)
  let hand = null;
  c.strokeStyle = col('jacket'); c.lineWidth = 21;
  if (o.light && o.light !== 'head' && pose !== 'sleep' && !flat) {
    const ex = sh.x + 30, ey = sh.y + 30, hx = sh.x + 62, hy = sh.y + 18;
    c.beginPath(); c.moveTo(sh.x + 4, sh.y + 6); c.lineTo(ex, ey); c.lineTo(hx, hy); c.stroke();
    circle(c, hx + 4, hy, 9, col('skin'));
    if (o.light === 'phone') { c.fillStyle = sil || '#1f2329'; rr(c, hx, hy - 16, 10, 30, 3); c.fill(); }
    else { c.fillStyle = sil || '#3a3f47'; rr(c, hx, hy - 6, 30, 12, 4); c.fill(); }
    hand = { ...world(hx + (o.light === 'phone' ? 8 : 30), hy), a: f > 0 ? -0.06 : Math.PI + 0.06 };
  } else {
    const fa = armAng(true);
    c.beginPath(); c.moveTo(sh.x + 4, sh.y + 8); c.lineTo(sh.x + 4 + Math.sin(fa) * 78, sh.y + 8 + Math.cos(fa) * 78); c.stroke();
    circle(c, sh.x + 4 + Math.sin(fa) * 84, sh.y + 8 + Math.cos(fa) * 84, 9, col('skin'));
  }
  if (o.light === 'head') hand = { ...world(44, hipY - 152), a: f > 0 ? (flat ? 0 : 0.05) : Math.PI - (flat ? 0 : 0.05) };
  c.restore();
  return hand;
}

function shade(hex, k) { // k < 0 темнее, k > 0 светлее
  if (!hex || hex[0] !== '#') return hex;
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(clamp(k < 0 ? v * (1 + k) : v + (255 - v) * k, 0, 255));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

// Подписи на мониторе, «стикер», плашки. Общие для всех сцен.
function fitFont(c, text, weight, size, family, maxW) {
  c.font = `${weight} ${size}px ${family}`;
  const w = c.measureText(text).width;
  if (w > maxW) { size = Math.floor(size * maxW / w); c.font = `${weight} ${size}px ${family}`; }
  return size;
}

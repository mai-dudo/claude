/* Фон: аквариум, нарисованный на canvas. Если в assets/video/bg.mp4 лежит свой ролик,
   показываем его вместо рисунка. Пауза — когда открыт просмотрщик, игра или вкладка скрыта. */
(() => {
  'use strict';

  const canvas = document.getElementById('aquarium');
  const video = document.getElementById('bgVideo');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- свой ролик, если он есть ----------
  let usingVideo = false;
  if (video) {
    video.src = 'assets/video/bg.mp4';
    video.addEventListener('loadeddata', () => {
      usingVideo = true;
      video.hidden = false;
      canvas.hidden = true;
      video.play().catch(() => {});
    }, { once: true });
    video.addEventListener('error', () => video.removeAttribute('src'), { once: true });
    video.preload = 'auto';
    video.load();
  }

  // ---------- сцена ----------
  let W = 0, H = 0, scale = 1;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pickOf = (arr) => arr[(Math.random() * arr.length) | 0];

  const palettes = [
    ['#3f7bff', '#9cc4ff'],  // синяя
    ['#ffcf3a', '#fff2a8'],  // жёлтая
    ['#2fd1c5', '#b8fff6'],  // бирюзовая
    ['#ff8a3d', '#ffd2a8'],  // оранжевая
    ['#c7d3e6', '#ffffff'],  // серебристая
  ];

  let fish = [], weeds = [], bubbles = [], rocks = [], corals = [];

  function makeFish(anywhere) {
    const depth = Math.random();                  // 0 — далеко, 1 — близко
    const size = (14 + depth * 46) * scale;
    const dir = Math.random() < .5 ? 1 : -1;
    const [body, belly] = pickOf(palettes);
    return {
      depth, size, dir, body, belly,
      x: anywhere ? rnd(0, W) : (dir > 0 ? -size * 3 : W + size * 3),
      y: rnd(H * .12, H * .78),
      speed: (18 + depth * 34) * scale * rnd(.7, 1.3),
      phase: rnd(0, Math.PI * 2),
      bob: rnd(6, 18) * scale,
      tall: rnd(.45, .75),                        // высота тела относительно длины
      stripes: Math.random() < .35,
    };
  }

  function build() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = canvas.width = Math.round(innerWidth * dpr);
    H = canvas.height = Math.round(innerHeight * dpr);
    scale = Math.max(.6, Math.min(W, H * 1.6) / 1400);

    const n = Math.round(clampN(W / (140 * scale), 6, 16));
    fish = Array.from({ length: n }, () => makeFish(true)).sort((a, b) => a.depth - b.depth);

    weeds = Array.from({ length: Math.round(W / (55 * scale)) }, () => ({
      x: rnd(0, W), h: rnd(H * .12, H * .42), w: rnd(8, 18) * scale,
      phase: rnd(0, 6.28), hue: rnd(95, 160), back: Math.random() < .5,
    }));

    rocks = Array.from({ length: Math.round(W / (180 * scale)) + 3 }, () => ({
      x: rnd(-60, W + 60), r: rnd(50, 140) * scale, squash: rnd(.45, .75), shade: rnd(10, 26),
    }));

    corals = Array.from({ length: Math.round(W / (260 * scale)) + 2 }, () => {
      const x = rnd(0, W), base = H * rnd(.88, .96), color = pickOf(['#3a6f8f', '#4f5f9f', '#3f8a7a', '#6a5a9a', '#2f6f6a']);
      return { x, base, color, branches: makeBranches(x, base, rnd(90, 190) * scale, -Math.PI / 2, 4) };
    });

    bubbles = [];
  }
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));

  function makeBranches(x, y, len, ang, level) {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    const seg = { x, y, x2, y2, w: level * 3.2 * scale, kids: [] };
    if (level > 1) {
      const k = level > 2 ? 3 : 2;
      for (let i = 0; i < k; i++) seg.kids.push(makeBranches(x2, y2, len * rnd(.5, .72), ang + rnd(-.75, .75), level - 1));
    }
    return seg;
  }

  // ---------- рисование ----------
  function water(t) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b3a6e');
    g.addColorStop(.45, '#06264c');
    g.addColorStop(1, '#020c1c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // лучи света сверху
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const cx = W * (.12 + i * .17) + Math.sin(t * .00015 + i * 1.7) * W * .05;
      const spread = W * (.05 + .03 * Math.sin(t * .0003 + i));
      const lg = ctx.createLinearGradient(0, 0, 0, H * .9);
      lg.addColorStop(0, 'rgba(140,200,255,.10)');
      lg.addColorStop(1, 'rgba(140,200,255,0)');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(cx - spread * .3, 0);
      ctx.lineTo(cx + spread * .3, 0);
      ctx.lineTo(cx + spread * 1.6 + W * .08, H * .9);
      ctx.lineTo(cx - spread * 1.2 + W * .08, H * .9);
      ctx.closePath();
      ctx.fill();
    }
    // блики на поверхности
    ctx.fillStyle = 'rgba(180,225,255,.05)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97.3 + t * .02 * (i % 3 + 1)) % (W + 200) - 100;
      const y = H * .02 + (i % 7) * H * .012 + Math.sin(t * .002 + i) * 4;
      ctx.beginPath();
      ctx.ellipse(x, y, 40 * scale, 4 * scale, 0, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }

  function seabed() {
    const g = ctx.createLinearGradient(0, H * .82, 0, H);
    g.addColorStop(0, 'rgba(30,48,66,0)');
    g.addColorStop(.35, '#16263a');
    g.addColorStop(1, '#0a121e');
    ctx.fillStyle = g;
    ctx.fillRect(0, H * .82, W, H * .18);
    for (const r of rocks) {
      const y = H * .97;
      const rg = ctx.createRadialGradient(r.x - r.r * .3, y - r.r * r.squash * .6, r.r * .1, r.x, y, r.r);
      rg.addColorStop(0, `hsl(210 20% ${r.shade + 14}%)`);
      rg.addColorStop(1, `hsl(215 30% ${r.shade * .5}%)`);
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.ellipse(r.x, y, r.r, r.r * r.squash, 0, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawBranch(s) {
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
    s.kids.forEach(drawBranch);
    if (!s.kids.length) {
      ctx.beginPath();
      ctx.arc(s.x2, s.y2, s.w * .9, 0, 6.28);
      ctx.fill();
    }
  }
  function coralsDraw() {
    ctx.save();
    ctx.lineCap = 'round';
    for (const c of corals) {
      ctx.strokeStyle = c.color;
      ctx.fillStyle = c.color;
      ctx.globalAlpha = .75;
      drawBranch(c.branches);
    }
    ctx.restore();
  }

  function weedsDraw(t, back) {
    for (const w of weeds) {
      if (w.back !== back) continue;
      const sway = Math.sin(t * .0011 + w.phase) * w.h * .12;
      ctx.fillStyle = `hsla(${w.hue} 55% ${back ? 18 : 26}% / ${back ? .7 : .9})`;
      ctx.beginPath();
      ctx.moveTo(w.x - w.w / 2, H);
      ctx.quadraticCurveTo(w.x - w.w / 2 + sway * .5, H - w.h * .5, w.x + sway, H - w.h);
      ctx.quadraticCurveTo(w.x + w.w / 2 + sway * .5, H - w.h * .5, w.x + w.w / 2, H);
      ctx.fill();
    }
  }

  function fishDraw(f, t) {
    const L = f.size, Ht = L * f.tall;
    const wag = Math.sin(t * .008 * (1 + f.depth) + f.phase);
    const y = f.y + Math.sin(t * .0007 + f.phase) * f.bob;
    ctx.save();
    ctx.translate(f.x, y);
    ctx.scale(f.dir, 1);
    ctx.globalAlpha = .45 + f.depth * .55;

    // хвост
    ctx.fillStyle = f.body;
    ctx.beginPath();
    ctx.moveTo(-L * .42, 0);
    ctx.lineTo(-L * .78, -Ht * .55 + wag * Ht * .15);
    ctx.lineTo(-L * .7, wag * Ht * .1);
    ctx.lineTo(-L * .78, Ht * .55 + wag * Ht * .15);
    ctx.closePath();
    ctx.fill();

    // спинной плавник
    ctx.beginPath();
    ctx.moveTo(-L * .15, -Ht * .42);
    ctx.quadraticCurveTo(L * .02, -Ht * .85, L * .18, -Ht * .4);
    ctx.fill();

    // тело
    const g = ctx.createLinearGradient(0, -Ht / 2, 0, Ht / 2);
    g.addColorStop(0, f.body);
    g.addColorStop(1, f.belly);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, L * .5, Ht / 2, 0, 0, 6.28);
    ctx.fill();

    if (f.stripes) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = 'rgba(10,20,40,.45)';
      for (let i = -1; i <= 1; i++) ctx.fillRect(i * L * .2 - L * .04, -Ht, L * .08, Ht * 2);
      ctx.restore();
    }

    // блик и глаз
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath();
    ctx.ellipse(L * .05, -Ht * .2, L * .28, Ht * .1, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(L * .3, -Ht * .08, Math.max(1.5, L * .07), 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#071226';
    ctx.beginPath();
    ctx.arc(L * .32, -Ht * .08, Math.max(1, L * .04), 0, 6.28);
    ctx.fill();
    ctx.restore();
  }

  function bubblesDraw(dt) {
    if (bubbles.length < 40 && Math.random() < dt * .004) {
      const x = rnd(W * .05, W * .95);
      for (let i = 0; i < 1 + (Math.random() * 4 | 0); i++) {
        bubbles.push({ x: x + rnd(-8, 8) * scale, y: H + rnd(0, 60), r: rnd(2, 7) * scale, v: rnd(40, 90) * scale, ph: rnd(0, 6.28) });
      }
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(200,235,255,.55)';
    ctx.fillStyle = 'rgba(200,235,255,.12)';
    ctx.lineWidth = 1;
    for (const b of bubbles) {
      b.y -= b.v * dt / 1000;
      b.ph += dt * .004;
      const x = b.x + Math.sin(b.ph) * 3 * scale;
      ctx.beginPath();
      ctx.arc(x, b.y, b.r, 0, 6.28);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    bubbles = bubbles.filter((b) => b.y > -20);
  }

  // ---------- цикл ----------
  let last = 0, running = true, raf = 0;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(60, t - (last || t));
    if (t - last < 33) return;                     // ~30 кадров в секунду хватает
    last = t;

    water(t);
    weedsDraw(t, true);
    coralsDraw();
    for (const f of fish) {
      f.x += f.dir * f.speed * dt / 1000;
      if ((f.dir > 0 && f.x > W + f.size * 3) || (f.dir < 0 && f.x < -f.size * 3)) Object.assign(f, makeFish(false), { depth: f.depth, size: f.size });
      fishDraw(f, t);
    }
    seabed();
    weedsDraw(t, false);
    bubblesDraw(dt);
  }

  function start() { if (!running && !usingVideo) { running = true; last = 0; raf = requestAnimationFrame(frame); } }
  function stop() { running = false; cancelAnimationFrame(raf); }

  build();
  if (still) { water(0); weedsDraw(0, true); coralsDraw(); fish.forEach((f) => fishDraw(f, 0)); seabed(); weedsDraw(0, false); running = false; }
  else raf = requestAnimationFrame(frame);

  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(build, 150); });

  const pause = () => { stop(); if (usingVideo) video.pause(); };
  const resume = () => { if (usingVideo) video.play().catch(() => {}); else if (!still) start(); };
  document.addEventListener('scene:pause', pause);
  document.addEventListener('scene:resume', resume);
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
})();

/* Подбрось Пепе — прыгалка по мотивам игры «Подбрось пользователя». Плюшевый Пепе отскакивает
   от капибар, камера едет только вверх, счёт — набранная высота в «км». Прыжок, скорость камеры,
   цена «км» и сетка рядов сняты с записи оригинала. Капибары, рыбьи скелеты, огонь и пропеллер
   рисуются кодом, из картинок только сам Пепе (pepe.png). */
(() => {
  'use strict';

  /* ---------- Настройки: поле 400 единиц в ширину, как экран оригинала в 390 px ---------- */
  const W = 400;            // ширина поля в условных единицах, высота зависит от экрана
  const ASPECT = 0.56;      // на широком экране поле — столбец 9:16 по центру
  const G = 1720;           // ускорение падения, ед/с²
  const JUMP = 808;         // скорость отскока: подъём на 190 ед за 0,47 с
  const PEPE = 74;          // сторона картинки Пепе
  const FEET = 24;          // полуширина опоры Пепе при приземлении
  const CAPY_HALF = 44;     // полуширина спины капибары
  const CAPY_TOP = 26;      // от низа капибары до спины, куда встаёт Пепе
  const ROW = 84;           // платформы стоят рядами с этим шагом
  const SPARSE_FROM = 250;  // с этого счёта нечётные ряды начинают пустеть,
  const SPARSE_FULL = 330;  // а отсюда твёрдые капибары только через ряд
  const FOLLOW = 12;        // как быстро Пепе догоняет палец, 1/с
  const KEY_SPEED = 520;    // скорость с клавиатуры, ед/с
  const CAM_LINE = 0.57;    // камера держит середину Пепе не выше этой доли экрана снизу
  const CAM_FOLLOW = 11;    // и догоняет его с такой скоростью, 1/с
  const FLY_TIME = 2.8;     // полёт на пропеллере, с: в оригинале 2,3–2,8 с
  const FLY_SPEED = 1050;   // около 35 км в секунду
  const KM = 30;            // единиц высоты в одном «км»: экран — около 29 км
  const STEP = 1 / 120;     // шаг физики, чтобы на медленном кадре не проскочить огонь
  const INK = '#2a1b10';
  const PATCH = ['rgba(150, 200, 100, .26)', 'rgba(185, 226, 135, .4)', 'rgba(135, 190, 90, .2)', 'rgba(236, 252, 208, .45)'];
  const FUR = [[-36, -14, -32, -18], [-22, -24, -18, -26], [-2, -23, 2, -25], [-28, -7, -24, -10], [-14, -15, -10, -18]];
  const FLAME = new Path2D('M16 1C19 9 29 13 29 25C29 34 23 39 16 39C9 39 3 34 3 26C3 19 7 15 10 9C12 14 13 16 15 18C15 11 13 7 16 1Z');
  const FLAME_IN = new Path2D('M16 18C19 23 23 26 23 31C23 35 20 38 16 38C12 38 9 35 9 31C9 27 13 24 16 18Z');

  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const store = {
    get(key, def) { try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); } catch (_) { return def; } },
    set(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* приватный режим */ } },
  };

  const stage = $('stage');
  const cv = $('cv');
  const ctx = cv.getContext('2d');
  const scoreEl = $('score');
  const pepe = new Image();
  pepe.src = 'pepe.png';

  /* ---------- Рисунки ---------- */
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // капибара лежит мордой вправо, начало координат — середина низа, спина на высоте CAPY_TOP
  function capyBody(c) {
    c.beginPath();
    c.moveTo(-38, 0);
    c.bezierCurveTo(-48, -2, -48, -26, -30, -28);
    c.bezierCurveTo(-14, -29.5, 2, -27, 10, -25);
    c.bezierCurveTo(16, -30, 30, -31, 41, -28);
    c.bezierCurveTo(47, -26.5, 49, -20, 48, -15);
    c.bezierCurveTo(47.5, -10, 44, -8.5, 39, -9);
    c.bezierCurveTo(34, -9.5, 30, -6, 27, 0);
    c.closePath();
  }
  function drawCapy(c, dark, yuzu) {
    const top = dark ? '#a06a3a' : '#dba46a';
    const low = dark ? '#7b4c26' : '#b97f48';
    const ear = dark ? '#6a3f1e' : '#9a643a';
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = INK; c.lineWidth = 2.4;
    // лапы и ухо позади туловища
    c.fillStyle = ear;
    for (const fx of [-26, 20]) { c.beginPath(); c.ellipse(fx, 0.5, 6.5, 3.4, 0, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.beginPath(); c.ellipse(18, -31, 4.4, 4.2, -0.3, 0, Math.PI * 2); c.fill(); c.stroke();
    const g = c.createLinearGradient(0, -31, 0, 0);
    g.addColorStop(0, top); g.addColorStop(1, low);
    capyBody(c); c.fillStyle = g; c.fill(); c.stroke();
    // шерсть и складка щеки, по которой видно большую голову
    c.strokeStyle = dark ? 'rgba(40, 20, 6, .45)' : 'rgba(90, 50, 20, .38)'; c.lineWidth = 1.3;
    c.beginPath();
    for (const [x1, y1, x2, y2] of FUR) { c.moveTo(x1, y1); c.lineTo(x2, y2); }
    c.stroke();
    c.strokeStyle = 'rgba(42, 27, 16, .7)'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(15, -25); c.bezierCurveTo(11, -17, 16, -9.5, 27, -8.5); c.stroke();
    if (dark) { // трещина: тёмная капибара выдержит только один прыжок
      c.strokeStyle = INK; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(-10, -28.5); c.lineTo(-5.5, -21); c.lineTo(-11, -14); c.lineTo(-7, -7); c.stroke();
    }
    // морда: румянец, сонный глаз, ноздря, рот
    c.fillStyle = 'rgba(255, 130, 110, .35)';
    c.beginPath(); c.ellipse(33, -14.5, 4.5, 2.6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = INK; c.strokeStyle = INK;
    c.beginPath(); c.ellipse(27, -22, 1.9, 2.2, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(23.5, -24.5); c.quadraticCurveTo(27, -26.5, 30.5, -24.5); c.stroke();
    c.beginPath(); c.ellipse(45, -20, 1.7, 1.2, 0.5, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(46.5, -12); c.quadraticCurveTo(44.5, -10.5, 41.5, -11.2); c.stroke();
    if (yuzu) { // мандаринка на голове, просто для красоты
      c.lineWidth = 1.8;
      c.fillStyle = '#ffa31a'; c.beginPath(); c.arc(31, -36, 6, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#5bb043'; c.beginPath(); c.ellipse(34.5, -42.5, 3.4, 1.7, -0.5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }

  // шапка с пропеллером: начало координат — середина низа шапки
  function drawHat(c, x, y, spin, rot = 0) {
    c.save();
    c.translate(x, y); c.rotate(rot);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(0, -14); c.stroke();
    const w = 12 * Math.cos(spin);
    c.fillStyle = '#e8463a'; c.beginPath(); c.ellipse(-w / 2, -15, Math.abs(w / 2) + 0.6, 2.4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#3a8ee8'; c.beginPath(); c.ellipse(w / 2, -15, Math.abs(w / 2) + 0.6, 2.4, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.save();
    c.beginPath(); c.moveTo(-11, 0); c.bezierCurveTo(-11, -11.5, 11, -11.5, 11, 0); c.closePath(); c.clip();
    ['#e8463a', '#ffcc33', '#3a8ee8', '#4cc36a'].forEach((col, i) => { c.fillStyle = col; c.fillRect(-11 + i * 5.5, -10, 5.5, 10); });
    c.restore();
    c.beginPath(); c.moveTo(-11, 0); c.bezierCurveTo(-11, -11.5, 11, -11.5, 11, 0); c.closePath(); c.stroke();
    c.lineWidth = 2.6; c.beginPath(); c.moveTo(-12, 0.5); c.lineTo(14, 0.5); c.stroke();
    c.lineWidth = 1.6; c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(0, -15, 2, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
  }

  // рыбий скелет: задел — проиграл
  function drawFish(c) {
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.fillStyle = '#fbfbf4'; c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(-15, -1);
    for (let x = -15; x < 17; x += 4.5) { c.lineTo(x + 2.25, -7); c.lineTo(x + 4.5, -1); }
    c.moveTo(-15, 1);
    for (let x = -15; x < 17; x += 4.5) { c.lineTo(x + 2.25, 7); c.lineTo(x + 4.5, 1); }
    c.stroke();
    c.lineWidth = 2.2; c.beginPath(); c.moveTo(-17, 0); c.lineTo(21, 0); c.stroke();
    c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(20, 0); c.lineTo(30, -7); c.quadraticCurveTo(27, 0, 30, 7); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(-17, -8); c.quadraticCurveTo(-27, -9, -31, 0); c.quadraticCurveTo(-27, 9, -17, 8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.arc(-24, -2.5, 1.6, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.4; c.beginPath(); c.moveTo(-31, 0); c.lineTo(-26, 2); c.stroke();
  }

  function drawFlame(c, x, y, s) {
    c.save();
    c.translate(x, y); c.scale(s, s); c.translate(-16, -21);
    const g = c.createLinearGradient(0, 0, 0, 40);
    g.addColorStop(0, '#ffb020'); g.addColorStop(1, '#ff4d1a');
    c.fillStyle = g; c.fill(FLAME);
    c.fillStyle = '#ffe14d'; c.fill(FLAME_IN);
    c.restore();
  }
  function drawFire(c) {
    const glow = c.createRadialGradient(0, 0, 16, 0, 0, 27);
    glow.addColorStop(0, 'rgba(255, 150, 60, .35)'); glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 27, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255, 255, 255, .6)'; c.strokeStyle = 'rgba(255, 255, 255, .95)'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, 19, 0, Math.PI * 2); c.fill(); c.stroke();
    drawFlame(c, 0, 1, 0.72);
  }

  // фон — светло-зелёная «плитка», один кусок повторяется по высоте
  const bgLayout = (() => {
    const rows = [];
    let y = 0;
    while (y < 620) {
      const h = rand(34, 78), row = [];
      for (let x = rand(-30, -5); x < W;) { const w = rand(34, 110); row.push([x, w, Math.floor(Math.random() * PATCH.length)]); x += w + 10; }
      rows.push([y, h, row]);
      y += h + 10;
    }
    return { rows, h: y };
  })();
  function drawBgTile(c) {
    c.fillStyle = '#d4eeab'; c.fillRect(0, 0, W, bgLayout.h);
    for (const [y, h, row] of bgLayout.rows) {
      for (const [x, w, i] of row) { c.fillStyle = PATCH[i]; roundRect(c, x, y, w, h, 13); c.fill(); }
    }
  }

  /* ---------- Размер поля и готовые картинки под него ---------- */
  let k = 1, H = 700, dpr = 1, shine = null;
  const spr = {};
  function sprite(w, h, ox, oy, draw, scale = k) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(h * scale));
    const x = c.getContext('2d');
    x.scale(c.width / w, c.height / h); x.translate(ox, oy);
    draw(x);
    return { c, w, h, ox, oy };
  }
  const blit = (s, x, y) => ctx.drawImage(s.c, x - s.ox, y - s.oy, s.w, s.h);


  function resize() {
    const vh = innerHeight;
    const cssW = Math.min(innerWidth, Math.round(vh * ASPECT));
    dpr = Math.min(devicePixelRatio || 1, 3);
    stage.style.width = `${cssW}px`;
    stage.style.height = `${vh}px`;
    stage.style.setProperty('--u', `${cssW / W}px`);
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(vh * dpr);
    k = cv.width / W; H = cv.height / k;
    spr.capy = sprite(108, 54, 54, 46, (c) => drawCapy(c, false, false));
    spr.yuzu = sprite(108, 54, 54, 46, (c) => drawCapy(c, false, true));
    spr.dark = sprite(108, 54, 54, 46, (c) => drawCapy(c, true, false));
    spr.fish = sprite(66, 20, 33, 10, drawFish);
    spr.fire = sprite(56, 56, 28, 28, drawFire);
    spr.bg = sprite(W, bgLayout.h, 0, 0, drawBgTile, Math.min(k, 1.5));
    shine = ctx.createLinearGradient(0, 0, 0, H);
    shine.addColorStop(0, 'rgba(255, 255, 235, .45)'); shine.addColorStop(0.55, 'rgba(255, 255, 235, 0)');
    if (plats) fill();
  }

  /* ---------- Мир ---------- */
  let state = 'play'; // play — игра, dying — задел кости и падает, over — итоги, pause — пауза
  let plats = null, debris, puffs, fires, p, camY, row, lastHat, lastSolidX, startY, fireTimer, time; // camY — набранная высота, из неё счёт

  const plat = (kind, x, y, dir) => ({ kind, x, y, dir, yuzu: false, hat: false, bump: 0, dead: false });
  function reset() {
    plats = []; debris = []; puffs = []; fires = [];
    camY = 0; time = 0; row = 0; lastHat = -1; lastSolidX = W / 2; startY = 110;
    fireTimer = rand(6, 10);
    plats.push(plat('capy', W / 2, startY, 1));
    p = { x: W / 2, tx: W / 2, y: startY, vx: 0, vy: JUMP, face: 1, squash: 0, fly: 0, spin: 0 };
    fill();
  }
  function fill() { while (startY + row * ROW < camY + H + 160) addRow(); }

  // ряды идут по сетке: внизу капибара в каждом ряду, выше твёрдые только в чётных,
  // а в нечётных кости, тёмная капибара или пусто; до чётного ряда прыжок всегда достаёт
  function addRow() {
    row += 1;
    const y = startY + row * ROW;
    const s = (row * ROW) / KM;
    const sparse = clamp((s - SPARSE_FROM) / (SPARSE_FULL - SPARSE_FROM), 0, 1);
    const d = clamp((s - SPARSE_FROM) / 1250, 0, 1);
    let x = rand(CAPY_HALF + 6, W - CAPY_HALF - 6);
    // первые два ряда в стороне: пока игрок не двинул Пепе, он прыгает на месте, как в оригинале
    if (row <= 2) x = W / 2 + (Math.random() < 0.5 ? -1 : 1) * rand(CAPY_HALF + FEET + 12, W / 2 - CAPY_HALF - 6);
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (row % 2 === 1 && Math.random() < sparse) {
      const r = Math.random();
      if (r < 0.5) {
        // кости не вешаем прямо над капибарой снизу, чтобы прыжок на месте не убивал
        let fx = x;
        while (Math.abs(fx - lastSolidX) < 80) fx = rand(36, W - 36);
        plats.push(plat('fish', fx, y, dir));
      } else if (r < 0.7) {
        plats.push(plat('dark', x, y, dir));
        lastSolidX = x;
      }
      return;
    }
    const pl = plat(Math.random() < (s < SPARSE_FROM ? 0.1 : 0.18 + 0.14 * d) ? 'dark' : 'capy', x, y, dir);
    if (pl.kind === 'capy') {
      // как в оригинале: первый пропеллер почти сразу, дальше примерно раз в 60 рядов
      const early = lastHat < 0 && row >= 2 && row <= 8;
      if (Math.random() < (early ? 0.3 : row - lastHat >= 30 ? 0.06 : 0)) { pl.hat = true; lastHat = row; }
      else if (Math.random() < 0.1) pl.yuzu = true;
    }
    plats.push(pl);
    lastSolidX = x;
  }

  /* ---------- Управление: Пепе плавно догоняет точку, которую ведут пальцем или стрелками ---------- */
  const keys = { l: false, r: false };
  const pointer = { id: null, fx: 0, bx: 0 };

  function steer(dt) {
    const dir = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    if (dir && pointer.id === null) p.tx = clamp(p.tx + dir * KEY_SPEED * dt, 0, W);
    const nx = p.x + (p.tx - p.x) * (1 - Math.exp(-FOLLOW * dt));
    p.vx = (nx - p.x) / dt;
    p.x = nx;
  }

  /* ---------- Шаг игры ---------- */
  function update(dt) {
    time += dt;
    const prevY = p.y;
    if (state === 'play') steer(dt);
    else p.x = clamp(p.x + p.vx * dt, 0, W);
    if (p.fly > 0) {
      p.fly -= dt;
      p.vy = p.fly > 0.5 ? FLY_SPEED : JUMP + (FLY_SPEED - JUMP) * Math.max(0, p.fly) / 0.5;
      if (p.fly <= 0) dropHat();
    } else {
      p.vy -= G * dt;
    }
    p.y += p.vy * dt;

    if (state === 'play') {
      if (p.vy < 0 && p.fly <= 0) land(prevY);
      grabHat();
      boneHit();
      const target = p.y + PEPE / 2 - H * CAM_LINE;
      if (target > camY) camY += (target - camY) * (1 - Math.exp(-CAM_FOLLOW * dt));
      fill();
      spawnFire(dt);
      if (p.y + PEPE < camY) { sfx.fall(); finish(); return; }
    } else if (state === 'dying') {
      p.spin += dt * 9;
      if (p.y + PEPE < camY) { finish(); return; }
    }

    p.squash = Math.max(0, p.squash - dt * 6);
    if (Math.abs(p.vx) > 30 && state !== 'dying') p.face = p.vx > 0 ? 1 : -1;
    for (const pl of plats) if (pl.bump > 0) pl.bump = Math.max(0, pl.bump - dt * 5);
    for (const f of fires) { f.x += f.vx * dt; f.t += dt; }
    for (const d of debris) {
      d.vy -= G * 0.8 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
      d.rot = d.kind === 'half' ? clamp(d.rot + d.vr * dt, -1.45, 1.45) : d.rot + d.vr * dt;
    }
    for (const q of puffs) { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; }
  }

  function land(prevY) {
    let hit = null;
    for (const pl of plats) {
      if (pl.dead || pl.kind === 'fish') continue;
      if (prevY >= pl.y && p.y <= pl.y && Math.abs(p.x - pl.x) < CAPY_HALF + FEET && (!hit || pl.y > hit.y)) hit = pl;
    }
    if (hit) bounce(hit);
  }

  function bounce(pl) {
    p.y = pl.y; p.vy = JUMP; p.squash = 1; pl.bump = 1;
    puff(p.x, pl.y);
    sfx.jump();
    if (pl.hat) takeHat(pl);
    if (pl.kind === 'dark') crack(pl);
  }

  function crack(pl) {
    pl.dead = true;
    for (const side of [-1, 1]) debris.push({ kind: 'half', pl, side, x: pl.x, y: pl.y - CAPY_TOP, vx: side * 25, vy: 60, rot: 0, vr: side * 4.5 });
    sfx.crack();
  }

  // шапку можно взять, приземлившись на капибару или задев её на лету
  function grabHat() {
    const cy = p.y + PEPE * 0.45;
    for (const pl of plats) {
      if (!pl.hat || pl.dead) continue;
      if (Math.abs(p.x - pl.x - 30 * pl.dir) < 26 && Math.abs(pl.y + 10 - cy) < 36) takeHat(pl);
    }
  }
  function takeHat(pl) {
    pl.hat = false;
    p.fly = FLY_TIME; p.vy = FLY_SPEED;
    sfx.prop();
  }
  function dropHat() {
    debris.push({ kind: 'hat', x: p.x - 9 * p.face, y: p.y + PEPE - 7, vx: -p.face * 70, vy: 260, rot: 0, vr: -p.face * 5 });
  }

  function puff(x, y) {
    for (let i = 0; i < 5; i++) {
      puffs.push({ x: x + rand(-18, 18), y: y + rand(0, 6), vx: rand(-30, 30), vy: rand(10, 50), s: rand(2.5, 4.5), t: 0, life: rand(0.35, 0.55) });
    }
  }

  // огонь вылетает из-за края и медленно плывёт поперёк поля; как в оригинале, Пепе он не вредит
  function spawnFire(dt) {
    if (camY < 2000) return; // первый огонь — после 65 км
    fireTimer -= dt;
    if (fireTimer > 0) return;
    const d = clamp(camY / KM / 1500, 0, 1);
    fireTimer = rand(5, 9) - 2 * d;
    const side = Math.random() < 0.5 ? -1 : 1;
    fires.push({ x: side < 0 ? -26 : W + 26, y: camY + H * rand(0.55, 0.85), vx: -side * rand(45, 70 + 30 * d), t: rand(0, 6) });
  }
  const fireY = (f) => f.y + Math.sin(f.t * 2.4) * 8;
  // кости убивают, как и падение: Пепе больше ни на что не встаёт и улетает вниз
  const FISH_DY = 12; // середина скелета ниже линии ряда, вровень с туловищем капибар
  function boneHit() {
    if (p.fly > 0) return; // на пропеллере Пепе пролетает мимо
    const cy = p.y + PEPE * 0.45;
    for (const pl of plats) {
      if (pl.kind !== 'fish') continue;
      const dx = Math.max(Math.abs(p.x - pl.x) - 26, 0), dy = Math.max(Math.abs(cy - (pl.y - FISH_DY)) - 6, 0);
      if (dx * dx + dy * dy < 24 * 24) {
        state = 'dying';
        p.vy = Math.min(p.vy, 150); p.vx = 0;
        sfx.hit();
        return;
      }
    }
  }

  function prune() {
    const floor = camY - 120;
    if (plats.length && plats[0].y < floor) plats = plats.filter((pl) => pl.y > floor);
    debris = debris.filter((d) => d.y > floor);
    puffs = puffs.filter((q) => q.t < q.life);
    fires = fires.filter((f) => f.y > floor && (f.vx > 0 ? f.x < W + 40 : f.x > -40));
  }

  /* ---------- Отрисовка ---------- */
  const sy = (wy) => H - (wy - camY);

  function drawPepe() {
    const s = p.squash;
    ctx.save();
    ctx.translate(p.x, sy(p.y));
    ctx.scale(p.face * (1 + 0.08 * s), 1 - 0.1 * s);
    ctx.translate(0, -PEPE / 2);
    ctx.rotate(p.face * p.spin);
    if (pepe.complete && pepe.naturalWidth) ctx.drawImage(pepe, -PEPE / 2, -PEPE / 2, PEPE, PEPE);
    else { ctx.fillStyle = '#7fb33b'; ctx.beginPath(); ctx.arc(0, 0, PEPE / 2.4, 0, Math.PI * 2); ctx.fill(); }
    if (p.fly > 0) drawHat(ctx, -9, -PEPE / 2 + 7, time * 38);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const bh = spr.bg.h;
    for (let y = (camY * 0.45) % bh - bh; y < H; y += bh) ctx.drawImage(spr.bg.c, 0, y, W, bh);
    ctx.fillStyle = shine; ctx.fillRect(0, 0, W, H);

    for (const pl of plats) {
      if (pl.dead) continue;
      const y = sy(pl.y);
      if (y < -70 || y > H + 70) continue;
      ctx.save();
      if (pl.kind === 'fish') {
        ctx.translate(pl.x, sy(pl.y - FISH_DY)); ctx.scale(pl.dir, 1); blit(spr.fish, 0, 0);
      } else {
        ctx.translate(pl.x, sy(pl.y - CAPY_TOP) + Math.sin(pl.bump * Math.PI) * 4);
        ctx.scale(pl.dir, 1);
        blit(pl.kind === 'dark' ? spr.dark : pl.yuzu ? spr.yuzu : spr.capy, 0, 0);
        if (pl.hat) drawHat(ctx, 30, -30.5, time * 5);
      }
      ctx.restore();
    }

    for (const d of debris) {
      ctx.save();
      ctx.translate(d.x, sy(d.y));
      if (d.kind === 'hat') {
        drawHat(ctx, 0, 0, time * 12, d.rot);
      } else { // половинка сломанной капибары падает, разворачиваясь концом вниз
        ctx.rotate(d.rot);
        ctx.beginPath(); ctx.rect(d.side < 0 ? -60 : 0, -50, 60, 60); ctx.clip();
        ctx.scale(d.pl.dir, 1);
        blit(spr.dark, 0, 0);
      }
      ctx.restore();
    }

    for (const q of puffs) {
      ctx.globalAlpha = (1 - q.t / q.life) * 0.9;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(q.x, sy(q.y), q.s * (1 + q.t * 3), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const f of fires) {
      ctx.save();
      ctx.translate(f.x, sy(fireY(f)));
      const s = 1 + Math.sin(f.t * 11) * 0.04;
      ctx.scale(s, s);
      blit(spr.fire, 0, 0);
      ctx.restore();
    }

    drawPepe();

    const sc = Math.floor(camY / KM);
    if (scoreEl.textContent !== String(sc)) scoreEl.textContent = sc;
  }

  /* ---------- Звук: короткие синтезированные сигналы ---------- */
  const sfx = (() => {
    let ac = null, prop = null, on = store.get('capyjump.sound', true) !== false;
    const audio = () => {
      if (!ac) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        try { ac = new A(); } catch (_) { return null; }
      }
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return ac;
    };
    function tone(type, f0, f1, dur, vol, delay = 0) {
      const a = on && ac && audio(); // до первого касания или клавиши звук не заводим
      if (!a) return;
      const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol, freq) {
      const a = on && ac && audio();
      if (!a) return;
      const n = Math.ceil(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8; g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(a.destination);
      s.start();
    }
    function stopProp() {
      if (!prop) return;
      for (const n of prop) { try { n.stop(); } catch (_) { /* уже остановлен */ } }
      prop = null;
    }
    return {
      get on() { return on; },
      unlock() { if (on) audio(); },
      toggle() { on = !on; store.set('capyjump.sound', on); if (!on) stopProp(); return on; },
      jump: () => tone('sine', 330, 660, 0.12, 0.13),
      crack() { noise(0.16, 0.5, 1100); tone('square', 200, 70, 0.14, 0.04); },
      hit() { noise(0.12, 0.4, 700); tone('square', 300, 90, 0.22, 0.05); tone('triangle', 520, 80, 0.7, 0.12, 0.1); },
      fall: () => tone('triangle', 560, 80, 0.75, 0.15),
      record: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f * 1.01, 0.18, 0.1, 0.25 + i * 0.1)),
      prop() { // жужжание пропеллера на всё время полёта
        stopProp();
        const a = on && ac && audio();
        if (!a) return;
        const t = a.currentTime, d = FLY_TIME;
        const o = a.createOscillator(), lp = a.createBiquadFilter(), trem = a.createGain(), env = a.createGain();
        const lfo = a.createOscillator(), depth = a.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(85, t); o.frequency.linearRampToValueAtTime(140, t + d);
        lp.type = 'lowpass'; lp.frequency.value = 700;
        lfo.frequency.value = 24; depth.gain.value = 0.5; trem.gain.value = 0.5;
        lfo.connect(depth); depth.connect(trem.gain);
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.07, t + 0.08);
        env.gain.setValueAtTime(0.07, t + d - 0.4); env.gain.linearRampToValueAtTime(0.0001, t + d);
        o.connect(lp); lp.connect(trem); trem.connect(env); env.connect(a.destination);
        o.start(t); lfo.start(t); o.stop(t + d); lfo.stop(t + d);
        prop = [o, lfo];
      },
      stopProp,
    };
  })();


  /* ---------- Экраны и рекорды ---------- */
  const screens = ['scrOver', 'scrPause', 'scrRecords'].map($);
  const coarse = matchMedia('(pointer: coarse)').matches;
  let shown = null, backTo = 'scrOver';
  function show(id) {
    shown = id;
    for (const s of screens) s.hidden = s.id !== id;
    // с клавиатуры главная кнопка экрана сразу в фокусе; на телефоне рамка фокуса только мешает
    const btn = id && !coarse && $(id).querySelector('.btn');
    if (btn) btn.focus({ preventScroll: true });
  }

  const REC_KEY = 'capyjump.records';
  let records = store.get(REC_KEY, []);
  if (!Array.isArray(records)) records = [];
  records = records.filter((r) => r && Number.isFinite(r.s) && Number.isFinite(r.t)).slice(0, 10);
  let lastRec = null;
  function addRecord(s) {
    const r = { s, t: Date.now() };
    records.push(r);
    records.sort((a, b) => b.s - a.s || a.t - b.t);
    records = records.slice(0, 10);
    store.set(REC_KEY, records);
    const i = records.indexOf(r);
    lastRec = i >= 0 ? r : null;
    return i + 1; // 0 — в таблицу не попал
  }
  function renderRecords() {
    const list = $('records');
    list.textContent = '';
    for (const r of records) {
      const li = document.createElement('li');
      const b = document.createElement('b');
      const date = document.createElement('span');
      b.textContent = `${r.s} км`;
      date.textContent = new Date(r.t).toLocaleDateString('ru-RU');
      li.append(b, date);
      if (r === lastRec) li.className = 'is-last';
      list.append(li);
    }
    $('recordsEmpty').hidden = records.length > 0;
  }
  const ordinal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;

  function finish() {
    state = 'over';
    sfx.stopProp();
    pointer.id = null;
    const score = Math.floor(camY / KM);
    const prevBest = records.length ? records[0].s : 0;
    const place = addRecord(score);
    $('result').textContent = `Вы подбросили Пепе на ${score} км`;
    $('place').textContent = place ? ordinal(place) : '';
    $('place').hidden = !place;
    const bestLine = $('bestLine');
    const isNew = prevBest > 0 && score > prevBest;
    bestLine.textContent = isNew ? 'Новый рекорд!' : `Рекорд: ${Math.max(prevBest, score)} км`;
    bestLine.classList.toggle('is-new', isNew);
    if (isNew) sfx.record();
    setTimeout(() => { if (state === 'over') show('scrOver'); }, 450);
  }

  function again() {
    if (state !== 'over') return;
    sfx.unlock();
    reset();
    state = 'play';
    show(null);
  }
  function pause() {
    if (state !== 'play') return;
    state = 'pause';
    sfx.stopProp();
    keys.l = keys.r = false;
    pointer.id = null;
    show('scrPause');
  }
  function resume() {
    if (state !== 'pause') return;
    state = 'play';
    show(null);
  }

  $('again').addEventListener('click', again);
  $('resume').addEventListener('click', resume);
  $('recordsBack').addEventListener('click', () => show(backTo));
  for (const b of document.querySelectorAll('[data-records]')) {
    b.addEventListener('click', () => { backTo = shown; renderRecords(); show('scrRecords'); });
  }

  const soundBtn = $('sound');
  soundBtn.setAttribute('aria-pressed', String(sfx.on));
  soundBtn.addEventListener('click', () => { soundBtn.setAttribute('aria-pressed', String(sfx.toggle())); soundBtn.blur(); });

  // огоньки, разлетающиеся из бомбы на экране проигрыша
  (() => {
    const box = $('burst'), NS = 'http://www.w3.org/2000/svg';
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.95 + (i / 13) * Math.PI * 1.25 + rand(-0.15, 0.15), dist = rand(70, 150);
      const s = document.createElementNS(NS, 'svg');
      const u = document.createElementNS(NS, 'use');
      s.setAttribute('viewBox', '0 0 32 40');
      u.setAttribute('href', '#flame');
      u.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#flame');
      s.append(u);
      s.style.setProperty('--x', `${(Math.cos(a) * dist).toFixed(1)}px`);
      s.style.setProperty('--y', `${(Math.sin(a) * dist).toFixed(1)}px`);
      s.style.setProperty('--s', rand(0.8, 1.6).toFixed(2));
      s.style.setProperty('--r', `${rand(-40, 40).toFixed(0)}deg`);
      s.style.setProperty('--t', `${(-rand(0, 2.6)).toFixed(2)}s`);
      box.append(s);
    }
  })();


  /* ---------- События ввода ---------- */
  // подсказка внизу пропадает при первом движении
  const hint = $('hint');
  hint.textContent = coarse ? 'Веди пальцем влево и вправо' : 'Двигай стрелками ← → или мышью с зажатой кнопкой';
  const hideHint = () => hint.classList.add('is-gone');
  setTimeout(hideHint, 6000);

  addEventListener('keydown', (e) => {
    const c = e.code;
    if (c === 'ArrowLeft' || c === 'KeyA') { keys.l = true; e.preventDefault(); }
    else if (c === 'ArrowRight' || c === 'KeyD') { keys.r = true; e.preventDefault(); }
    else if (c === 'KeyP') { if (state === 'play') pause(); else resume(); return; }
    else if ((c === 'Space' || c === 'Enter') && !e.repeat) {
      if (document.activeElement instanceof HTMLButtonElement) return; // кнопка в фокусе нажмётся сама
      if (state === 'pause') resume();
      else if (state === 'over' && shown === 'scrOver') again();
      e.preventDefault();
      return;
    } else return;
    sfx.unlock();
    hideHint();
  });
  addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.l = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.r = false;
  });
  addEventListener('blur', () => { keys.l = keys.r = false; pointer.id = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // палец двигает точку, за которой летит Пепе, на столько же, на сколько сдвинулся сам:
  // ставить его можно в любом месте экрана, у края точка упирается и сразу едет обратно
  const fingerX = (e) => {
    const r = cv.getBoundingClientRect();
    return (e.clientX - r.left) / r.width * W;
  };
  cv.addEventListener('pointerdown', (e) => {
    if (state !== 'play') return;
    sfx.unlock();
    hideHint();
    pointer.id = e.pointerId;
    pointer.fx = fingerX(e);
    pointer.bx = p.tx;
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* не все браузеры дают захват */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer.id) return;
    const fx = fingerX(e);
    let tx = pointer.bx + fx - pointer.fx;
    if (tx < 0 || tx > W) { tx = clamp(tx, 0, W); pointer.bx = tx; pointer.fx = fx; }
    p.tx = tx;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    cv.addEventListener(type, (e) => {
      if (type === 'pointerup') sfx.unlock(); // на iPhone звук разрешают только по отпусканию пальца
      if (e.pointerId === pointer.id) pointer.id = null;
    });
  }
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Запуск ---------- */
  addEventListener('resize', resize);
  resize();
  reset();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (state === 'play' || state === 'dying') {
      const n = Math.ceil(dt / STEP);
      for (let i = 0; i < n && (state === 'play' || state === 'dying'); i++) update(dt / n);
      prune();
    }
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

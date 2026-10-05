/* Анимированные стикеры Telegram (TGS, распакованные в JSON) вместо иконок у пунктов с data-tgs.
   Рисует lottie-web на холсте. Как на PS3, анимация идёт только у выбранного пункта открытого
   раздела, остальные стоят на первом кадре. Плеер подгружается при первой надобности. */
(() => {
  'use strict';

  const LIB = 'js/lib/lottie_light_canvas.min.js';
  const SIZE = 88;                          // самый крупный размер на экране, меньшие делает CSS
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const FPS = 60;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const viewer = document.getElementById('viewer');
  const game = document.getElementById('game');
  const covered = () => (viewer && !viewer.hidden) || (game && !game.hidden);

  const holders = Array.from(document.querySelectorAll('[data-tgs]'));
  if (!holders.length) return;

  let lib = null;
  const loadLib = () => {
    if (!lib) {
      lib = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = LIB;
        s.onload = () => (window.lottie ? resolve(window.lottie) : reject(new Error('lottie')));
        s.onerror = () => { lib = null; reject(new Error('lottie')); };
        document.head.append(s);
      });
    }
    return lib;
  };

  // rlottie в Telegram прощает битые данные, lottie-web на них падает: чиним перед загрузкой
  const sanitize = (data) => {
    const ids = new Set((data.assets || []).map((a) => a.id));
    const fix = (layers) => (layers || []).forEach((l) => {
      if (l.ty === 4 && !Array.isArray(l.shapes)) l.shapes = [];
      if (l.ty === 0 && !ids.has(l.refId)) { l.ty = 3; delete l.refId; delete l.w; delete l.h; delete l.tm; }
    });
    fix(data.layers);
    (data.assets || []).forEach((a) => fix(a.layers));
    return data;
  };

  /* ---------- Один таймер на всех: играет только выбранный ---------- */
  const players = new Map(); // holder -> player
  let active = null;
  let raf = 0;
  let last = 0;

  const tick = (now) => {
    raf = 0;
    const p = active;
    if (!p || covered()) return;
    if (now - last >= 1000 / FPS - 2) {
      last = now;
      if (p.startedAt < 0) p.startedAt = now - (p.frame / p.fps) * 1000;
      else if (now - p.seen > 100) p.startedAt += now - p.seen; // после паузы продолжаем с того же кадра
      p.seen = now;
      const frame = Math.floor(((now - p.startedAt) / 1000) * p.fps) % p.total;
      if (frame !== p.frame) { p.frame = frame; p.anim.goToAndStop(frame, true); }
    }
    raf = requestAnimationFrame(tick);
  };
  const wake = () => { if (!raf && active && !still) raf = requestAnimationFrame(tick); };

  const setActive = (p) => {
    if (active === p) return;
    if (active) active.startedAt = -1;
    active = p;
    wake();
  };

  /* ---------- Загрузка ---------- */
  const make = async (holder) => {
    const lottie = await loadLib();
    const res = await fetch(holder.dataset.tgs, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = sanitize(await res.json());
    const canvas = document.createElement('canvas');
    canvas.className = 'item__tgs';
    canvas.width = canvas.height = SIZE * DPR;
    const anim = lottie.loadAnimation({
      renderer: 'canvas',
      loop: false,
      autoplay: false,
      animationData: data,
      rendererSettings: { context: canvas.getContext('2d'), clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
    });
    const p = { holder, anim, fps: data.fr || 60, total: anim.totalFrames || 1, frame: 0, startedAt: -1, seen: 0 };
    anim.addEventListener('DOMLoaded', () => {
      anim.goToAndStop(0, true);
      canvas.classList.add('is-ready');
    });
    holder.append(canvas);
    return p;
  };

  const prepare = (holder) => {
    if (players.has(holder)) return players.get(holder);
    const p = make(holder).catch((err) => {
      console.warn('Стикер:', holder.dataset.tgs, err.message);
      holder.classList.add('tgs-failed'); // показываем обычную иконку
      return null;
    });
    players.set(holder, p);
    return p;
  };

  /* ---------- Какой пункт выбран ---------- */
  const update = async () => {
    const holder = document.querySelector('.cat.is-on .it.is-sel [data-tgs]');
    if (!holder) { setActive(null); return; }
    const p = await prepare(holder);
    if (p && document.querySelector('.cat.is-on .it.is-sel [data-tgs]') === holder) setActive(p);
  };
  document.addEventListener('xmb:render', update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  [viewer, game].forEach((el) => el && new MutationObserver(wake).observe(el, { attributes: true, attributeFilter: ['hidden'] }));

  // стикеры открытого раздела готовим сразу, остальные — когда браузер свободен
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const queue = holders.slice();
  const next = () => {
    const h = queue.shift();
    if (!h) return;
    prepare(h).then(() => idle(next));
  };
  document.querySelectorAll('.cat.is-on [data-tgs]').forEach(prepare);
  idle(next);
  update();
})();

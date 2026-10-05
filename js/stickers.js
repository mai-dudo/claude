/* Анимированные стикеры Telegram (TGS, распакованные в JSON) вместо иконок у пунктов с data-tgs.
   Рисует lottie-web на холсте. Как на PS3, анимация идёт только у выбранного пункта открытого
   раздела, остальные стоят на первом кадре. Плеер подгружается при первой надобности. */
(() => {
  'use strict';

  const LIB = 'js/lib/lottie_light_canvas.min.js';
  const VERSION = 1;                        // /assets/ кэшируется на неделю: поменял стикер — подними версию
  const SIZE = 88;                          // самый крупный размер на экране, меньшие делает CSS
  const DPR = Math.min(devicePixelRatio || 1, 2);
  const FPS = 60;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = Boolean(navigator.connection && navigator.connection.saveData);
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
  const players = new Map(); // holder -> Promise<player|null>
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
    if (active) { // невыбранный стикер возвращается на первый кадр, как иконка на PS3
      active.startedAt = -1;
      active.frame = 0;
      active.anim.goToAndStop(0, true);
    }
    active = p;
    wake();
  };

  /* ---------- Загрузка ---------- */
  const make = async (holder) => {
    const lottie = await loadLib();
    const res = await fetch(`${holder.dataset.tgs}?v=${VERSION}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = sanitize(await res.json());
    const canvas = document.createElement('canvas');
    canvas.className = 'it__tgs';
    canvas.width = canvas.height = SIZE * DPR;
    const anim = lottie.loadAnimation({
      renderer: 'canvas',
      loop: false,
      autoplay: false,
      animationData: data,
      rendererSettings: { context: canvas.getContext('2d'), clearCanvas: true, preserveAspectRatio: 'xMidYMid meet' },
    });
    const p = { holder, anim, fps: data.fr || 60, total: anim.totalFrames || 1, frame: 0, startedAt: -1, seen: 0 };
    await new Promise((resolve, reject) => {
      anim.addEventListener('DOMLoaded', resolve);
      anim.addEventListener('data_failed', () => reject(new Error('data')));
      anim.addEventListener('error', () => reject(new Error('render')));
    });
    anim.goToAndStop(0, true);
    // стикер становится единственным содержимым ячейки, обычная иконка откладывается на случай сбоя
    holder.replaceChildren(canvas);
    requestAnimationFrame(() => canvas.classList.add('is-ready'));
    return p;
  };

  const prepare = (holder) => {
    if (players.has(holder)) return players.get(holder);
    const fallback = Array.from(holder.childNodes);
    const p = make(holder).catch((err) => {
      console.warn('Стикер:', holder.dataset.tgs, err.message);
      holder.replaceChildren(...fallback);
      holder.classList.add('tgs-failed'); // показываем обычную иконку
      return null;
    });
    players.set(holder, p);
    return p;
  };

  /* ---------- Какой пункт выбран ---------- */
  const update = async () => {
    // стикеры открытого раздела грузим сразу, выбранный — первым
    const open = document.querySelector('.cat.is-on');
    const holder = open && open.querySelector('.it.is-sel [data-tgs]');
    if (holder) prepare(holder);
    if (open) open.querySelectorAll('[data-tgs]').forEach(prepare);
    if (!holder) { setActive(null); return; }
    const p = await prepare(holder);
    if (p && document.querySelector('.cat.is-on .it.is-sel [data-tgs]') === holder) setActive(p);
  };
  document.addEventListener('xmb:render', update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  [viewer, game].forEach((el) => el && new MutationObserver(wake).observe(el, { attributes: true, attributeFilter: ['hidden'] }));

  // остальные стикеры готовим по одному, когда страница загрузилась и браузер свободен;
  // при экономии трафика заранее ничего не качаем
  if (!saveData) {
    const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 200));
    const queue = holders.slice();
    const next = () => {
      const h = queue.shift();
      if (!h) return;
      prepare(h).then(() => idle(next));
    };
    const start = () => setTimeout(() => idle(next), 1000);
    if (document.readyState === 'complete') start();
    else addEventListener('load', start, { once: true });
  }
  update();
})();

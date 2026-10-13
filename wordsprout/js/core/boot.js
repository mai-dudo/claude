/* Запуск WordSprout (последний скрипт страницы). Каждый шаг — в try/catch: если какого-то модуля нет,
   в консоли будет предупреждение, а не ошибка, и остальное всё равно запустится.
   1) тестовый режим (?test=1): <html data-test="1" data-motion="reduce">;
   2) вид страницы на <html>: data-theme, data-look, data-motion — из настроек и prefers-*, data-pointer —
      coarse | fine; цвет theme-color берётся из фона страницы. Всё обновляется при смене настроек,
      системной темы, «уменьшения движения» и типа указателя;
   3) WS.speech.init(); 4) WS.shell.init(); 5) «Загружаю…» на месте экрана;
   6) данные (WS.data.init), каталог игр и эмодзи интерфейса; не вышло за 15 с или с ошибкой —
      карточка «Не получилось загрузить слова» с «Повторить»;
   7) WS.router.start() — первый экран. После запуска <html data-ready="1">. */
(() => {
  'use strict';

  const { el, q } = WS.util;
  const root = document.documentElement;
  const test = WS.test;
  const DATA_MS = 15000;

  const step = (name, fn) => {
    try {
      return fn();
    } catch (e) {
      console.warn(`WordSprout: не выполнен шаг запуска «${name}»`, e);
      return undefined;
    }
  };
  const has = (obj, name) => !!obj && typeof obj[name] === 'function';
  const media = (query) => (window.matchMedia ? window.matchMedia(query) : null);
  const matches = (query) => {
    const m = media(query);
    return !!(m && m.matches);
  };
  const settings = () => {
    try {
      return (WS.settings && WS.settings.get()) || {};
    } catch (e) {
      return {};
    }
  };

  /* ---------- Вид страницы ---------- */
  const opaque = (c) => !!c && c !== 'transparent' && !/^rgba\(.*,\s*0\)$/.test(c);

  // Цвет полосы браузера = фон страницы (фон задан у <html> или у <body>).
  const syncThemeColor = () => {
    const bg = [document.body, root].filter(Boolean).map((n) => getComputedStyle(n).backgroundColor).find(opaque);
    if (!bg) return;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  };

  const applyLook = () => {
    const s = settings();
    const dark = s.theme === 'dark' || (s.theme !== 'light' && matches('(prefers-color-scheme: dark)'));
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.look = s.look === 'simple' ? 'simple' : 'illustrated';
    const reduce = test.enabled || s.motion === 'reduce' || matches('(prefers-reduced-motion: reduce)');
    root.dataset.motion = reduce ? 'reduce' : 'full';
    root.dataset.pointer = matches('(pointer: coarse)') ? 'coarse' : 'fine';
    requestAnimationFrame(syncThemeColor);
  };

  /* ---------- Данные и первый экран ---------- */
  const showLoading = () => {
    const view = q('[data-ws=view]');
    if (view) view.replaceChildren(el('p', { class: 'ws-game__loading ws-boot', role: 'status', text: WS.t('app.loading') }));
  };

  let started = false;
  let attempt = 0;

  const showFailure = (err) => {
    console.warn('WordSprout: данные не загрузились', err);
    const view = q('[data-ws=view]');
    if (!view) return;
    const retry = WS.shell && has(WS.shell, 'button')
      ? WS.shell.button({ text: WS.t('btn.retry'), icon: 'restart', kind: 'primary', ws: 'retry' })
      : el('button', { type: 'button', class: 'ws-btn ws-btn--primary', dataset: { ws: 'retry' }, text: WS.t('btn.retry') });
    retry.addEventListener('click', () => load());
    view.replaceChildren(el('section', { class: 'ws-error', role: 'alert', dataset: { ws: 'boot-error' } },
      el('p', { text: WS.t('boot.dataError') }), retry));
  };

  const start = () => {
    if (started) return;
    started = true;
    if (WS.router && has(WS.router, 'start')) step('router', () => WS.router.start());
    else console.warn('WordSprout: нет WS.router');
    root.dataset.ready = '1';
    if (test.enabled) test.events.push({ type: 'ready' });
  };

  const load = () => {
    if (started) return;
    attempt += 1;
    const mine = attempt;
    showLoading();
    const hasData = !!WS.data && has(WS.data, 'init');
    if (!hasData) console.warn('WordSprout: нет WS.data');
    const data = hasData ? new Promise((resolve) => resolve(WS.data.init())) : Promise.resolve();
    const games = data.then(() => (WS.games && has(WS.games, 'ready') ? WS.games.ready().catch(() => null) : null));
    const emoji = WS.shell && has(WS.shell, 'loadEmoji') ? WS.shell.loadEmoji().catch(() => null) : null;
    let timer = 0;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('WordSprout: данные грузятся дольше 15 с')), DATA_MS);
    });
    Promise.race([Promise.all([data, games, emoji]), timeout]).then(() => {
      clearTimeout(timer);
      if (mine === attempt) start();
    }, (e) => {
      clearTimeout(timer);
      if (mine === attempt && !started) showFailure(e);
    });
  };

  /* ---------- Запуск ---------- */
  step('test', () => {
    if (!test.enabled) return;
    root.dataset.test = '1';
    root.dataset.motion = 'reduce';
  });
  step('look', () => {
    applyLook();
    if (WS.settings && has(WS.settings, 'on')) WS.settings.on(applyLook);
    ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)', '(pointer: coarse)'].forEach((query) => {
      const m = media(query);
      if (m && has(m, 'addEventListener')) m.addEventListener('change', applyLook);
    });
  });
  step('speech', () => WS.speech.init());
  step('shell', () => WS.shell.init());
  step('data', load);
})();

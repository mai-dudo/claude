/* Заглушка: настройки (ключ 'wordsprout.v1.settings'). get() — копия настроек, set(patch) сохраняет
   и сообщает подписчикам, on(fn) возвращает функцию отписки. Тему, стиль и анимации применяет к <html>. */
(() => {
  'use strict';

  const KEY = 'wordsprout.v1.settings';
  const DEFAULTS = {
    level: 'easy', sound: true, autoplay: true, rate: 0.9, voice: '', theme: 'auto', look: 'illustrated',
    motion: 'auto', hints: false, translate: true, keyboard: 'system',
  };

  const saved = WS.store.get(KEY, {});
  let current = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  const listeners = new Set();

  const media = (query) => window.matchMedia && window.matchMedia(query).matches;

  const apply = () => {
    const root = document.documentElement;
    const dark = current.theme === 'dark' || (current.theme === 'auto' && media('(prefers-color-scheme: dark)'));
    root.dataset.theme = dark ? 'dark' : 'light';
    root.dataset.look = current.look === 'simple' ? 'simple' : 'illustrated';
    const reduce = WS.test.enabled || current.motion === 'reduce' || media('(prefers-reduced-motion: reduce)');
    root.dataset.motion = reduce ? 'reduce' : 'full';
  };

  const get = () => ({ ...current });

  const set = (patch) => {
    current = { ...current, ...patch };
    WS.store.set(KEY, current);
    apply();
    listeners.forEach((fn) => fn(get()));
  };

  const on = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  WS.settings = { get, set, on };
})();

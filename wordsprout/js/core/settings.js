/* Настройки WordSprout (ключ 'wordsprout.v1.settings'), хранятся отдельно от прогресса: сброс прогресса
   их не трогает. get() — копия настроек; set(patch) проверяет значения (чужие ключи и неверные значения
   отбрасываются), сохраняет и сообщает подписчикам; on(fn) → функция отписки, fn(настройки, [изменённые
   ключи]). Изменения из другой вкладки тоже доходят до подписчиков. Тему, стиль и анимации на <html>
   выставляет boot.js — он подписан на эти изменения. defaults() — копия настроек по умолчанию. */
(() => {
  'use strict';

  const KEY = 'wordsprout.v1.settings';
  const DEFAULTS = Object.freeze({
    level: 'easy', sound: true, autoplay: true, rate: 0.9, voice: '', theme: 'auto', look: 'illustrated',
    motion: 'auto', hints: false, translate: true, keyboard: 'system',
  });
  const RATE_MIN = 0.6;
  const RATE_MAX = 1.2;

  const oneOf = (...values) => (v) => (values.includes(v) ? v : undefined);
  const bool = (v) => (typeof v === 'boolean' ? v : undefined);
  const CHECK = {
    level: oneOf('easy', 'hard'),
    sound: bool,
    autoplay: bool,
    rate: (v) => {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
      return Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, n)) * 100) / 100;
    },
    voice: (v) => (typeof v === 'string' ? v.slice(0, 200) : undefined),
    theme: oneOf('auto', 'light', 'dark'),
    look: oneOf('illustrated', 'simple'),
    motion: oneOf('auto', 'reduce'),
    hints: bool,
    translate: bool,
    keyboard: oneOf('system', 'builtin'),
  };

  // Только известные ключи с допустимыми значениями.
  const clean = (obj) => {
    const out = {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
    Object.keys(CHECK).forEach((k) => {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) return;
      const v = CHECK[k](obj[k]);
      if (v !== undefined) out[k] = v;
    });
    return out;
  };

  const load = () => ({ ...DEFAULTS, ...clean(WS.store.get(KEY, null)) });

  let current = load();
  const listeners = new Set();

  const get = () => ({ ...current });
  const defaults = () => ({ ...DEFAULTS });

  const notify = (changed) => {
    const snapshot = get();
    listeners.forEach((fn) => {
      try {
        fn(snapshot, changed.slice());
      } catch (e) {
        console.error('WordSprout: ошибка в подписчике настроек', e);
      }
    });
  };

  const diff = (a, b) => Object.keys(DEFAULTS).filter((k) => a[k] !== b[k]);

  const set = (patch) => {
    const next = { ...current, ...clean(patch) };
    const changed = diff(current, next);
    if (!changed.length) return get();
    current = next;
    WS.store.set(KEY, current);
    notify(changed);
    return get();
  };

  const on = (fn) => {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  };

  // Другая вкладка поменяла настройки (или очистила хранилище) — перечитываем.
  WS.store.onExternalChange((key) => {
    if (key !== null && key !== KEY) return;
    const next = load();
    const changed = diff(current, next);
    current = next;
    if (changed.length) notify(changed);
  });

  WS.settings = { get, set, on, defaults };
})();

/* Заглушка: хранилище. JSON в localStorage по полному ключу (например, 'wordsprout.v1.settings'),
   а если localStorage недоступен — в памяти (тогда persistent = false). Отложенную запись, резервные
   копии и баннер напишет владелец файла. */
(() => {
  'use strict';

  const memory = new Map();
  let ls = null;
  try {
    ls = window.localStorage;
    const probe = 'wordsprout.probe';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
  } catch (e) {
    ls = null;
  }

  const get = (key, fallback = null) => {
    try {
      const raw = ls ? ls.getItem(key) : memory.get(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  };

  const set = (key, value) => {
    const raw = JSON.stringify(value);
    memory.set(key, raw);
    try {
      if (ls) ls.setItem(key, raw);
    } catch (e) {
      ls = null;
      WS.store.persistent = false;
    }
  };

  const remove = (key) => {
    memory.delete(key);
    try {
      if (ls) ls.removeItem(key);
    } catch (e) { /* в памяти уже удалено */ }
  };

  const onExternalChange = (fn) => {
    const handler = (e) => {
      if (e.key && e.key.startsWith('wordsprout.')) fn(e.key);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  };

  WS.store = { get, set, remove, persistent: !!ls, onExternalChange };
})();

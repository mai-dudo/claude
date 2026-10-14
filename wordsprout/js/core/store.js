/* Хранилище WordSprout — единственное место, где трогаем localStorage. Значения хранятся как JSON
   под полными ключами ('wordsprout.v1.progress', 'wordsprout.v1.settings', …).
   - get(key, fallback): битый JSON не роняет приложение — сырой текст копируется в
     'wordsprout.corrupt.<время>' (храним не больше трёх копий), ключ удаляется, возвращается fallback;
   - set(key, value) → true, если записано на диск. Если браузер не даёт писать (квота, запрет), сначала
     удаляем старые копии битых данных и пробуем ещё раз, а не вышло — переходим в режим «в памяти»:
     persistent = false, всё работает до закрытия вкладки, подписчики onStatus(fn) узнают об этом
     (оболочка показывает баннер «прогресс не сохранится»);
   - remove(key), quarantine(key) — отложить испорченное значение в копию и удалить ключ;
   - onExternalChange(fn) — изменения из другой вкладки (fn(key), key = null после очистки хранилища);
   - persist() — просьба к браузеру не стирать данные (navigator.storage.persist), один раз за запуск;
   - corrupt — список копий битых данных, сделанных за этот запуск: [{ key, backup }]. */
(() => {
  'use strict';

  const PREFIX = 'wordsprout.';
  const CORRUPT = 'wordsprout.corrupt.';
  const KEEP_CORRUPT = 3;

  const memory = new Map(); // ключ → сырой JSON (режим «в памяти»)
  const statusFns = new Set();
  let ls = null;

  const api = {
    persistent: true,
    reason: '',
    corrupt: [],
  };

  const notify = () => {
    statusFns.forEach((fn) => {
      try {
        fn({ persistent: api.persistent, reason: api.reason });
      } catch (e) {
        console.error('WordSprout: ошибка в подписчике хранилища', e);
      }
    });
  };

  const readRaw = (key) => {
    if (!ls) return memory.has(key) ? memory.get(key) : null;
    try {
      return ls.getItem(key);
    } catch (e) {
      return memory.has(key) ? memory.get(key) : null;
    }
  };

  const corruptKeys = () => {
    if (!ls) return [];
    const out = [];
    try {
      for (let i = 0; i < ls.length; i += 1) {
        const k = ls.key(i);
        if (k && k.startsWith(CORRUPT)) out.push(k);
      }
    } catch (e) { /* список ключей недоступен — не страшно */ }
    return out.sort((a, b) => Number(a.slice(CORRUPT.length)) - Number(b.slice(CORRUPT.length)));
  };

  const dropCorrupt = (keep) => {
    const list = corruptKeys();
    list.slice(0, Math.max(0, list.length - keep)).forEach((k) => {
      try {
        ls.removeItem(k);
      } catch (e) { /* пусть остаётся */ }
    });
    return list.length > keep;
  };

  // Переход в режим «в памяти»: переносим всё наше из localStorage, дальше читаем и пишем только память.
  const toMemory = (why) => {
    if (ls) {
      try {
        for (let i = 0; i < ls.length; i += 1) {
          const k = ls.key(i);
          if (k && k.startsWith(PREFIX) && !memory.has(k)) memory.set(k, ls.getItem(k));
        }
      } catch (e) { /* что успели — то перенесли */ }
    }
    ls = null;
    api.persistent = false;
    api.reason = why;
    console.warn('WordSprout: localStorage недоступен, данные хранятся только до закрытия вкладки');
    notify();
  };

  const writeRaw = (key, raw) => {
    if (!ls) {
      memory.set(key, raw);
      return false;
    }
    try {
      ls.setItem(key, raw);
      return true;
    } catch (e) {
      // Освобождаем место за счёт копий битых данных и пробуем ещё раз.
      if (dropCorrupt(0)) {
        try {
          ls.setItem(key, raw);
          return true;
        } catch (e2) { /* не помогло */ }
      }
      toMemory(e && e.name === 'QuotaExceededError' ? 'quota' : 'blocked');
      memory.set(key, raw);
      return false;
    }
  };

  const removeRaw = (key) => {
    memory.delete(key);
    if (!ls) return;
    try {
      ls.removeItem(key);
    } catch (e) { /* в памяти уже удалено */ }
  };

  // Испорченное значение → копия 'wordsprout.corrupt.<время>', сам ключ удаляем (даже если копию
  // сделать не удалось: иначе каждое чтение натыкалось бы на него снова).
  const quarantine = (key) => {
    const raw = readRaw(key);
    if (raw == null) return null;
    let stamp = Date.now();
    while (readRaw(`${CORRUPT}${stamp}`) != null) stamp += 1;
    const backup = `${CORRUPT}${stamp}`;
    let saved = false;
    if (ls) {
      try {
        ls.setItem(backup, raw);
        saved = true;
      } catch (e) { /* места нет — копию не сделать */ }
      if (saved) dropCorrupt(KEEP_CORRUPT);
    } else {
      memory.set(backup, raw);
      saved = true;
    }
    removeRaw(key);
    api.corrupt.push({ key, backup: saved ? backup : null });
    console.warn(`WordSprout: данные «${key}» повреждены${saved ? `, копия — «${backup}»` : ''}; начинаем заново`);
    return saved ? backup : null;
  };

  const get = (key, fallback = null) => {
    const raw = readRaw(key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw);
    } catch (e) {
      quarantine(key);
      return fallback;
    }
  };

  const set = (key, value) => {
    let raw;
    try {
      raw = JSON.stringify(value);
    } catch (e) {
      console.warn(`WordSprout: не удалось сохранить «${key}»`, e);
      return false;
    }
    if (raw === undefined) {
      removeRaw(key);
      return api.persistent;
    }
    return writeRaw(key, raw);
  };

  const remove = (key) => removeRaw(key);

  const onExternalChange = (fn) => {
    const handler = (e) => {
      if (!ls || (e.storageArea && e.storageArea !== ls)) return;
      if (e.key === null || e.key.startsWith(PREFIX)) fn(e.key);
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  };

  const onStatus = (fn) => {
    if (typeof fn !== 'function') return () => {};
    statusFns.add(fn);
    return () => statusFns.delete(fn);
  };

  let persistAsked = false;
  const persist = () => {
    if (persistAsked || !ls) return Promise.resolve(false);
    persistAsked = true;
    try {
      const sm = navigator.storage;
      if (!sm || typeof sm.persist !== 'function') return Promise.resolve(false);
      const asked = typeof sm.persisted === 'function' ? sm.persisted() : Promise.resolve(false);
      return asked.then((already) => already || sm.persist()).then((ok) => !!ok, () => false);
    } catch (e) {
      return Promise.resolve(false);
    }
  };

  // Запуск: пробная запись. Нельзя писать, но можно читать (полная квота) — читаем сохранённое в память.
  const probe = () => {
    const k = `${PREFIX}probe`;
    ls.setItem(k, '1');
    ls.removeItem(k);
  };
  try {
    ls = window.localStorage || null;
  } catch (e) {
    ls = null;
  }
  if (!ls) {
    api.persistent = false;
    api.reason = 'blocked';
  } else {
    try {
      probe();
    } catch (e) {
      let fixed = false;
      if (dropCorrupt(0)) {
        try {
          probe();
          fixed = true;
        } catch (e2) { /* не помогло */ }
      }
      if (!fixed) toMemory(e && e.name === 'QuotaExceededError' ? 'quota' : 'blocked');
    }
  }

  Object.assign(api, { get, set, remove, quarantine, onExternalChange, onStatus, persist });
  WS.store = api;
})();

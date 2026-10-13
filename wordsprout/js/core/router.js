/* Маршруты по адресу после «#»: #/learn/easy, #/play/easy/food/spell, #/review?tab=1.

   WS.router:
   - add(pattern, mount) — '/learn/:level' (можно с «#»). mount(el, params, query, extra) рисует экран
     в <main data-ws="view"> и может вернуть функцию уборки (или Promise с ней).
     extra = { signal, hash, path }: signal отменяется при уходе с экрана — передавайте его слушателям;
   - go(hash, { replace }) — перейти (новая запись истории или замена текущей);
   - back() — назад по истории, если до этого был экран приложения, иначе на главную;
   - current() → { hash, path, params, query, pattern }; previous() → адрес предыдущей записи или null;
   - start() — первый показ (вызывает boot.js); on('before' | 'after', fn) → отписка: fn(current) до
     и после смены экрана; guard(fn) → снять: fn(nextHash) → true | false | Promise<boolean> может
     задержать уход с экрана (игра спрашивает «Выйти из игры?»).
   Неизвестный адрес ведёт на главную (с заменой записи). Кнопка «назад» Android идёт по записям истории;
   если guard отказал, адрес возвращается обратно, а после согласия — history.back() на нужную запись. */
(() => {
  'use strict';

  const routes = [];
  const hooks = { before: new Set(), after: new Set() };
  const scrolls = new Map(); // id записи истории → прокрутка
  let started = false;
  let current = null;
  let active = null; // { ac, cleanup }
  let guardFn = null;
  let rendering = false;
  let queued = null;
  let bypass = false;
  let seq = 0;
  let scrollQueued = false;
  let shownDepth = 1; // глубина записи истории, которая сейчас показана

  /* ---------- Адреса ---------- */
  const normPath = (p) => `/${String(p || '').split('/').filter(Boolean).join('/')}`;

  const parse = (hash) => {
    let raw = String(hash == null ? '' : hash);
    if (raw.startsWith('#')) raw = raw.slice(1);
    const qi = raw.indexOf('?');
    const path = normPath(qi >= 0 ? raw.slice(0, qi) : raw);
    const queryPart = qi >= 0 ? raw.slice(qi + 1) : '';
    const query = {};
    new URLSearchParams(queryPart).forEach((value, key) => {
      query[key] = value;
    });
    return { path, query, hash: `#${path}${queryPart ? `?${queryPart}` : ''}` };
  };

  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  };

  const compile = (pattern) => {
    const path = normPath(String(pattern).replace(/^#/, ''));
    const names = [];
    const src = path.split('/').map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
    return { pattern: path, re: new RegExp(`^${src || '/'}$`), names };
  };

  const add = (pattern, mount) => {
    if (typeof mount !== 'function') return;
    routes.push({ ...compile(pattern), mount });
  };

  const match = (path) => {
    for (const r of routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      const params = {};
      r.names.forEach((name, i) => {
        params[name] = decode(m[i + 1]);
      });
      return { route: r, params };
    }
    return null;
  };

  /* ---------- Записи истории: { ws: 1, depth, prev, id } ---------- */
  const entry = () => {
    const st = history.state;
    return st && st.ws === 1 ? st : null;
  };
  const makeState = (depth, prev) => ({ ws: 1, depth, prev: prev || null, id: `${Date.now().toString(36)}-${++seq}` });
  const depthNow = () => (entry() ? entry().depth : 1);
  const hashNow = () => parse(location.hash).hash;

  const saveScroll = () => {
    const st = entry();
    if (st) scrolls.set(st.id, window.scrollY);
  };

  const onScroll = () => {
    if (rendering || scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(() => {
      scrollQueued = false;
      if (!rendering) saveScroll();
    });
  };

  const restoreScroll = (y) => {
    window.scrollTo(0, y);
    if (y <= 0) return;
    // экран мог дорисоваться позже: пробуем ещё пару раз
    let tries = 0;
    const again = () => {
      if (tries++ >= 3 || Math.abs(window.scrollY - y) < 2) return;
      window.scrollTo(0, y);
      setTimeout(again, 120);
    };
    setTimeout(again, 60);
  };

  /* ---------- Показ экрана ---------- */
  const emit = (phase, info) => {
    hooks[phase].forEach((fn) => {
      try {
        fn({ ...info });
      } catch (e) {
        console.warn('WordSprout: подписчик маршрутов', e);
      }
    });
  };

  const teardown = () => {
    if (!active) return;
    const { ac, cleanup } = active;
    active = null;
    ac.abort();
    if (typeof cleanup === 'function') {
      try {
        cleanup();
      } catch (e) {
        console.warn('WordSprout: уборка экрана', e);
      }
    }
  };

  const view = () => document.querySelector('[data-ws=view]');

  const fallback = (el) => {
    if (!el) return;
    const p = document.createElement('p');
    p.className = 'ws-error';
    p.setAttribute('role', 'alert');
    p.textContent = WS.t('router.broken');
    el.replaceChildren(p);
  };

  const render = () => {
    const { path, query, hash } = parse(location.hash);
    const found = match(path);
    if (!found) {
      if (path !== '/' && match('/')) {
        navigate('#/', true);
        return;
      }
      teardown();
      current = { hash, path, params: {}, query, pattern: null };
      fallback(view());
      return;
    }
    bypass = false;
    rendering = true;
    const st = entry();
    shownDepth = st ? st.depth : 1;
    teardown();
    const info = { hash, path, params: { ...found.params }, query: { ...query }, pattern: found.route.pattern };
    current = info;
    emit('before', info);
    const el = view();
    if (el) el.replaceChildren();
    const ac = new AbortController();
    const token = { ac, cleanup: null };
    active = token;
    try {
      const out = found.route.mount(el, { ...found.params }, { ...query }, { signal: ac.signal, hash, path });
      if (out && typeof out.then === 'function') {
        out.then((fn) => {
          if (typeof fn !== 'function') return;
          if (active === token) token.cleanup = fn;
          else fn();
        }, (e) => console.error('WordSprout: экран не открылся', e));
      } else if (typeof out === 'function') {
        token.cleanup = out;
      }
    } catch (e) {
      console.error('WordSprout: экран не открылся', e);
      fallback(el);
    }
    rendering = false;
    const y = st && scrolls.has(st.id) ? scrolls.get(st.id) : 0;
    restoreScroll(y);
    emit('after', info);
    const focused = document.activeElement;
    if (el && (!focused || focused === document.body || !focused.isConnected)) el.focus({ preventScroll: true });
    if (queued) {
      const next = queued;
      queued = null;
      go(next.hash, { replace: next.replace });
    }
  };

  /* ---------- Переходы ---------- */
  const navigate = (hash, replace) => {
    const target = parse(hash).hash;
    if (!started) {
      if (replace) history.replaceState(entry() || makeState(1, null), '', target);
      else history.pushState(makeState(depthNow() + 1, hashNow()), '', target);
      return;
    }
    if (target === hashNow() && current && current.hash === target) {
      render();
      return;
    }
    if (replace) {
      const st = entry();
      history.replaceState(makeState(st ? st.depth : 1, st ? st.prev : null), '', target);
    } else {
      saveScroll();
      history.pushState(makeState(depthNow() + 1, current ? current.hash : hashNow()), '', target);
    }
    render();
  };

  const askGuard = (target) => {
    if (!guardFn || bypass) return true;
    try {
      const verdict = guardFn(target, current ? { ...current } : null);
      return verdict === undefined ? true : verdict;
    } catch (e) {
      console.warn('WordSprout: guard', e);
      return true;
    }
  };

  const go = (hash, { replace = false } = {}) => {
    const target = parse(hash).hash;
    if (rendering) {
      queued = { hash: target, replace };
      return;
    }
    const verdict = askGuard(target);
    if (verdict === true) {
      navigate(target, replace);
    } else if (verdict && typeof verdict.then === 'function') {
      verdict.then((ok) => {
        if (!ok) return;
        bypass = true;
        navigate(target, replace);
      }, () => {});
    }
  };

  // Смена адреса извне: ссылка, кнопка «назад»/«вперёд», ручной ввод.
  const onHashChange = () => {
    if (!started) return;
    const target = hashNow();
    if (current && current.hash === target && !bypass) return;
    if (!entry()) history.replaceState(makeState(shownDepth + 1, current ? current.hash : null), '');
    const verdict = askGuard(target);
    if (verdict === true) {
      render();
      return;
    }
    // Уйти нельзя (или надо спросить): возвращаем прежний адрес новой записью поверх целевой.
    const stay = current ? current.hash : '#/';
    history.pushState(makeState(depthNow() + 1, target), '', stay);
    if (verdict && typeof verdict.then === 'function') {
      verdict.then((ok) => {
        if (!ok) return;
        bypass = true;
        history.back();
      }, () => {});
    }
  };

  const back = () => {
    const st = entry();
    if (st && st.prev) history.back();
    else go('#/', { replace: true });
  };

  const previous = () => {
    const st = entry();
    return st && st.prev ? st.prev : null;
  };

  const currentInfo = () => (current
    ? { ...current, params: { ...current.params }, query: { ...current.query } }
    : { hash: '#/', path: '/', params: {}, query: {}, pattern: null });

  const on = (phase, fn) => {
    const set = hooks[typeof phase === 'function' ? 'after' : phase];
    const cb = typeof phase === 'function' ? phase : fn;
    if (!set || typeof cb !== 'function') return () => {};
    set.add(cb);
    return () => set.delete(cb);
  };

  const guard = (fn) => {
    guardFn = typeof fn === 'function' ? fn : null;
    return () => {
      if (guardFn === fn) guardFn = null;
    };
  };

  const start = () => {
    if (started) return;
    started = true;
    try {
      history.scrollRestoration = 'manual';
    } catch (e) { /* не везде можно */ }
    if (!entry()) history.replaceState(makeState(1, null), '');
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('scroll', onScroll, { passive: true });
    render();
  };

  WS.router = { add, go, back, current: currentInfo, previous, start, on, guard, parse };
})();

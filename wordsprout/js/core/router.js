/* Заглушка: маршруты по адресу после «#». add('/learn/:level', mount) регистрирует экран;
   mount(el, params, query) рисует его в <main data-ws="view"> и может вернуть функцию уборки.
   Неизвестный адрес ведёт на главную. start() вызывает boot.js. */
(() => {
  'use strict';

  const routes = [];
  let cleanup = null;
  let cur = { path: '/', params: {}, query: {}, hash: '#/' };

  const compile = (pattern) => {
    const names = [];
    const src = pattern.split('/').map((part) => {
      if (part.startsWith(':')) {
        names.push(part.slice(1));
        return '([^/]+)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
    return { re: new RegExp(`^${src}/?$`), names };
  };

  const add = (pattern, mount) => {
    routes.push({ pattern, mount, ...compile(pattern) });
  };

  const parse = (hash) => {
    const raw = String(hash || '').replace(/^#/, '') || '/';
    const [pathPart, queryPart = ''] = raw.split('?');
    const path = pathPart.startsWith('/') ? pathPart : `/${pathPart}`;
    const query = Object.fromEntries(new URLSearchParams(queryPart));
    return { path, query, hash: `#${raw}` };
  };

  const go = (hash, { replace = false } = {}) => {
    const target = hash.startsWith('#') ? hash : `#${hash}`;
    if (location.hash === target) {
      render(); // тот же адрес: hashchange не придёт, рисуем заново сами
      return;
    }
    if (replace) location.replace(`${location.pathname}${location.search}${target}`);
    else location.hash = target;
  };

  const back = () => {
    if (history.length > 1) history.back();
    else go('#/', { replace: true });
  };

  const current = () => ({ ...cur, params: { ...cur.params }, query: { ...cur.query } });

  function render() {
    const { path, query, hash } = parse(location.hash);
    let found = null;
    const params = {};
    for (const r of routes) {
      const m = r.re.exec(path);
      if (m) {
        found = r;
        r.names.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
        break;
      }
    }
    if (!found) {
      if (path !== '/') go('#/', { replace: true });
      return;
    }
    if (typeof cleanup === 'function') {
      try { cleanup(); } catch (e) { console.warn(e); }
    }
    cleanup = null;
    cur = { path, params, query, hash };
    const view = WS.util.q('[data-ws=view]');
    view.replaceChildren();
    window.scrollTo(0, 0);
    cleanup = found.mount(view, params, query) || null;
  }

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    window.addEventListener('hashchange', render);
    render();
  };

  WS.router = { add, go, back, current, start };
})();

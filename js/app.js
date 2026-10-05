/* Меню в духе XMB.
   Разделы стоят в ряд, выбранный — у левой опорной линии. Пункты выбранного
   раздела идут столбцом: выбранный сразу под рядом разделов, предыдущие уходят
   над рядом, следующие — вниз. Каждый раздел помнит свой выбранный пункт. */
(() => {
  'use strict';

  const root = document.documentElement;
  const q = (sel, el = document) => el.querySelector(sel);
  const qa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isNarrow = () => innerWidth < 640;

  const menu = q('#menu');
  if (!menu) return;

  // ---------- Видео с YouTube из data/videos.json ----------
  const videoList = q('#videoList');
  const videoItem = (v) => {
    const li = document.createElement('li');
    li.className = 'it';
    li.innerHTML =
      '<a class="it__row" target="_blank" rel="noopener">' +
      '<span class="it__ico it__ico--wide"><img alt=""></span>' +
      '<span class="it__txt"><span class="it__title"></span></span></a>';
    q('a', li).href = `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`;
    q('img', li).src = `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/mqdefault.jpg`;
    q('.it__title', li).textContent = v.title || 'Без названия';
    return li;
  };
  const messageItem = (text) => {
    const li = document.createElement('li');
    li.className = 'it';
    li.innerHTML = '<div class="it__row"><span class="it__ico"><img src="assets/icons/xmb/movie.png" alt=""></span>' +
      '<span class="it__txt"><span class="it__title"></span></span></div>';
    q('.it__title', li).textContent = text;
    return li;
  };
  const loadVideos = fetch('data/videos.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((list) => {
      const real = (Array.isArray(list) ? list : []).filter((v) => v && v.id && !/^VIDEO_ID/.test(v.id));
      videoList.replaceChildren(...(real.length ? real.map(videoItem) : [messageItem('Добавь свои ролики в data/videos.json')]));
    })
    .catch(() => videoList.replaceChildren(messageItem('Не удалось загрузить список видео')));

  // ---------- Счётчик визитов (если есть свой бэкенд с /api/visit) ----------
  fetch('/api/visit', { method: 'POST', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => {
      if (typeof d.count !== 'number') return;
      q('#visits').textContent = d.count.toLocaleString('ru-RU');
      q('#visitsItem').hidden = false;
      layout();
    })
    .catch(() => {});

  // ---------- Сборка меню ----------
  if (isNarrow()) qa('[data-desktop-only]').forEach((el) => el.remove());

  const cats = qa('.cat', menu);
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.setAttribute('role', 'tablist');

  const tabButtons = cats.map((cat, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab';
    b.id = `tab-${cat.id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', cat.id);
    const img = new Image();
    img.src = cat.dataset.icon;
    img.alt = '';
    const label = document.createElement('span');
    label.className = 'tab__label';
    label.textContent = q('.cat__name', cat).textContent;
    b.append(img, label);
    b.addEventListener('click', () => { go(k); b.blur(); });
    cat.setAttribute('role', 'tabpanel');
    cat.setAttribute('aria-labelledby', b.id);
    tabs.append(b);
    return b;
  });
  menu.prepend(tabs);

  let cur = 0;
  const pick = cats.map(() => 0);
  const itemsOf = (k) => qa(':scope > .cat__list > .it:not([hidden])', cats[k]);

  let g; // геометрия под текущий размер окна
  const cssPx = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
  function measure() {
    const w = innerWidth, h = innerHeight, narrow = isNarrow();
    const cat = cssPx('--cat-size'), col = cssPx('--ico-col');
    const x0 = narrow ? Math.max(16, w * 0.08) : w * 0.2;
    const rowY = h * (narrow ? 0.2 : 0.25);
    g = {
      narrow, x0, rowY, cat,
      tabStep: narrow ? Math.max(72, (w - 32) / cats.length) : clamp(w * 0.1, 112, 160),
      selY: rowY + cat / 2 + 52,
      upY: rowY - cat / 2 - 18,
      step: narrow ? 58 : Math.max(64, h * 0.085),
    };
    root.style.setProperty('--items-x', `${Math.max(8, x0 + cat / 2 - col / 2)}px`);
  }

  function layout() {
    tabButtons.forEach((b, k) => {
      // на телефоне выбранный раздел стоит во втором слоте, чтобы предыдущий был виден
      const x = g.narrow
        ? 16 + (Math.min(cur, 1) + k - cur) * g.tabStep + (g.tabStep - g.cat) / 2
        : g.x0 + (k - cur) * g.tabStep;
      b.style.transform = `translate(${x}px, ${g.rowY - g.cat / 2}px)`;
      const on = k === cur;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });

    cats.forEach((cat, k) => {
      cat.classList.toggle('is-on', k === cur);
      const items = itemsOf(k);
      const s = (pick[k] = clamp(pick[k], 0, Math.max(0, items.length - 1)));
      items.forEach((it, j) => it.classList.toggle('is-sel', j === s));
      const selH = items[s] ? items[s].offsetHeight : 0;
      items.forEach((it, j) => {
        const y = j === s ? g.selY
          : j > s ? g.selY + selH + 20 + (j - s - 1) * g.step
          : g.upY - (s - j) * g.step;
        it.style.transform = `translate3d(0, ${y}px, 0)`;
        it.classList.toggle('is-off', y < -g.step * 2 || y > innerHeight + g.step);
      });
    });
    root.classList.toggle('scrolled', pick[cur] > 0);
  }

  function go(k) {
    k = clamp(k, 0, cats.length - 1);
    if (k === cur) return;
    cur = k;
    layout();
  }
  function move(j) {
    const n = itemsOf(cur).length;
    j = clamp(j, 0, n - 1);
    if (j === pick[cur]) return;
    pick[cur] = j;
    layout();
  }

  // ---------- Действие с пунктом ----------
  const kindOf = (it) => it.dataset.kind || '';
  function open(it) {
    const row = q('.it__row', it);
    const kind = kindOf(it);
    if (kind === 'photo' || kind === 'clip') return showViewer(it);
    if (kind === 'game' && row) return openGame(row.getAttribute('href'));
    if (row && row.href && row.getAttribute('href') !== '#') window.open(row.href, row.target || '_self', 'noopener');
  }
  const openCurrent = () => { const it = itemsOf(cur)[pick[cur]]; if (it) open(it); };

  // ---------- Клавиатура ----------
  const overlayOpen = () => !viewer.hidden || !game.hidden;
  addEventListener('keydown', (e) => {
    if (overlayOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    const keys = {
      ArrowLeft: () => go(cur - 1), ArrowRight: () => go(cur + 1),
      ArrowUp: () => move(pick[cur] - 1), ArrowDown: () => move(pick[cur] + 1),
      Home: () => move(0), End: () => move(itemsOf(cur).length - 1),
      Enter: openCurrent, ' ': openCurrent,
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key](); }
  });

  // ---------- Мышь и касания ----------
  menu.addEventListener('click', (e) => {
    const it = e.target.closest('.it');
    if (!it || e.target.closest('.it__card a')) return;   // ссылки в карточке работают сами
    e.preventDefault();
    const items = itemsOf(cur);
    const j = items.indexOf(it);
    if (j < 0) return;
    if (j === pick[cur]) open(it); else move(j);           // первый клик выбирает, второй открывает
  });

  let wheelLock = 0;
  addEventListener('wheel', (e) => {
    if (overlayOpen()) return;
    e.preventDefault();
    const now = performance.now();
    if (now < wheelLock) return;
    const dx = e.shiftKey ? e.deltaY : e.deltaX;
    const dy = e.shiftKey ? 0 : e.deltaY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) { go(cur + Math.sign(dx)); wheelLock = now + 260; }
    else if (Math.abs(dy) > 8) { move(pick[cur] + Math.sign(dy)); wheelLock = now + 120; }
  }, { passive: false });

  let touch = null;
  menu.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  menu.addEventListener('pointerup', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;  // это тап, его обработает click
    // после свайпа браузер может прислать click — глотаем его, но не дольше мгновения
    const eat = (c) => { c.stopPropagation(); c.preventDefault(); };
    menu.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => menu.removeEventListener('click', eat, { capture: true }), 60);
    if (Math.abs(dx) > Math.abs(dy)) go(cur - Math.sign(dx));
    else move(pick[cur] - Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / g.step)));
  });
  menu.addEventListener('pointercancel', () => { touch = null; });

  // ---------- Просмотр фото и роликов ----------
  const viewer = q('#viewer'), vImg = q('#viewerImg'), vVid = q('#viewerVideo'), vMsg = q('#viewerMsg'), vCount = q('#viewerCount');
  let group = [], at = 0;

  function paintViewer() {
    const it = group[at];
    const href = q('.it__row', it).getAttribute('href');
    const clip = kindOf(it) === 'clip';
    vMsg.hidden = true;
    vImg.hidden = clip;
    vVid.hidden = !clip;
    vVid.pause();
    if (clip) {
      vVid.src = href;
      vVid.onerror = () => { vVid.hidden = true; vMsg.hidden = false; vMsg.textContent = `Файл не найден: ${href}. Положи ролик по этому пути.`; };
      vVid.play().catch(() => {});
    } else {
      vVid.removeAttribute('src');
      vImg.src = href;
      vImg.alt = (q('.it__title', it) || {}).textContent || '';
    }
    vCount.textContent = `${at + 1} / ${group.length}`;
    viewer.classList.toggle('is-single', group.length < 2);
  }
  function showViewer(it) {
    group = it.closest('#profile') ? [it] : itemsOf(cur).filter((x) => ['photo', 'clip'].includes(kindOf(x)));
    at = Math.max(0, group.indexOf(it));
    viewer.hidden = false;
    root.classList.add('crt-off');
    document.dispatchEvent(new Event('scene:pause'));
    paintViewer();
  }
  function closeViewer() {
    vVid.pause();
    vVid.removeAttribute('src');
    vVid.load();
    viewer.hidden = true;
    root.classList.remove('crt-off');
    document.dispatchEvent(new Event('scene:resume'));
  }
  const stepViewer = (d) => { if (group.length > 1) { at = (at + d + group.length) % group.length; paintViewer(); } };

  viewer.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) return stepViewer(+step.dataset.step);
    if (e.target.closest('[data-close]') || e.target === viewer) closeViewer();
  });
  addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeViewer(); }
    else if (e.key === 'ArrowLeft') stepViewer(-1);
    else if (e.key === 'ArrowRight') stepViewer(1);
  });
  let vTouch = null;
  viewer.addEventListener('pointerdown', (e) => { vTouch = e.target === vVid ? null : e.clientX; });
  viewer.addEventListener('pointerup', (e) => {
    if (vTouch == null) return;
    const dx = e.clientX - vTouch;
    vTouch = null;
    if (Math.abs(dx) > 40) stepViewer(dx < 0 ? 1 : -1);
  });

  // ---------- Игры поверх сайта ----------
  const game = q('#game'), frame = q('#gameFrame');
  function openGame(url) {
    game.hidden = false;
    root.classList.add('crt-off');
    document.dispatchEvent(new Event('scene:pause'));
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow.focus();
        // фокус внутри игры, поэтому Esc ловим и в её окне
        frame.contentWindow.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGame(); });
      } catch (_) {}
    }, { once: true });
    frame.src = url;
  }
  function closeGame() {
    frame.src = 'about:blank';
    game.hidden = true;
    root.classList.remove('crt-off');
    document.dispatchEvent(new Event('scene:resume'));
    focus();
  }
  q('#gameClose').addEventListener('click', closeGame);
  addEventListener('keydown', (e) => { if (!game.hidden && e.key === 'Escape') closeGame(); });

  // ---------- Запуск ----------
  root.classList.add('menu-ready', 'menu-still');
  measure();
  layout();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('menu-still')));

  // пересчитываем, когда догрузились картинки, шрифт и список видео
  const relayout = () => { measure(); layout(); };
  loadVideos.then(relayout);
  if (document.fonts) document.fonts.ready.then(relayout);
  addEventListener('load', relayout);
  let rz;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      root.classList.add('menu-still');
      relayout();
      requestAnimationFrame(() => root.classList.remove('menu-still'));
    }, 80);
  });
})();

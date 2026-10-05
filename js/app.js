/* Меню в духе XMB. Разделы стоят в ряд, выбранный — у левой опорной линии. Пункты выбранного
   раздела идут столбцом: выбранный сразу под рядом разделов, предыдущие уходят над рядом,
   следующие — вниз. Каждый раздел помнит свой выбранный пункт, как на PS3. */
(() => {
  'use strict';

  /* ---------- Настройки ленты YouTube ----------
     Без ключа ролики берутся из data/videos.json (обновить: node scripts/sync-youtube.mjs UC…).
     С ключом YouTube Data API v3 все ролики канала подтягиваются при каждом открытии;
     ключ ограничьте по HTTP-referrer в Google Cloud Console. */
  const YOUTUBE = {
    apiKey: '',
    channelId: '',
    channelUrl: 'https://www.youtube.com/',
  };
  const GAME_BUILD = '2026-10-05'; // метка в адресе игры, чтобы браузер не отдал старую копию

  const root = document.documentElement;
  const q = (sel, el = document) => el.querySelector(sel);
  const qa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const isNarrow = () => innerWidth < 640;

  const menu = q('#menu');
  const viewer = q('#viewer');
  const game = q('#game');
  if (!menu) return;

  /* ---------- Счётчик визитов: считает сервер (api/visit.js), без него «—» ---------- */
  const visitsEl = q('#visits');
  if (visitsEl) {
    fetch('/api/visit', { method: 'POST', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(({ visits }) => { visitsEl.textContent = Number(visits).toLocaleString('ru-RU'); })
      .catch(() => { visitsEl.textContent = '—'; });
  }

  /* ---------- Сборка меню ---------- */
  if (isNarrow()) qa('[data-desktop-only]', menu).forEach((el) => el.remove());

  const cats = qa('.cat', menu);
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Разделы');

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
  const itemsOf = (k) => qa(':scope > .cat__list > .it', cats[k]);

  let g;
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

  // обложки роликов грузим только когда пункт попал на экран
  const loadThumb = (it) => {
    const img = q('img[data-src]', it);
    if (!img) return;
    img.src = img.dataset.src;
    img.removeAttribute('data-src');
  };

  function layout() {
    tabButtons.forEach((b, k) => {
      // на телефоне выбранный раздел стоит во втором слоте, чтобы предыдущий оставался на экране
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
      const on = k === cur;
      cat.classList.toggle('is-on', on);
      const items = itemsOf(k);
      const s = (pick[k] = clamp(pick[k], 0, Math.max(0, items.length - 1)));
      items.forEach((it, j) => it.classList.toggle('is-sel', j === s));
      // скрытые разделы тоже раскладываем, чтобы при переключении пункты не прилетали сверху
      const selH = items[s] ? items[s].offsetHeight : 0;
      items.forEach((it, j) => {
        const y = j === s ? g.selY
          : j > s ? g.selY + selH + 20 + (j - s - 1) * g.step
          : g.upY - (s - j) * g.step;
        it.style.transform = `translate3d(0, ${y}px, 0)`;
        const far = y < -g.step * 2 || y > innerHeight + g.step;
        it.classList.toggle('is-off', far);
        if (on && !far) loadThumb(it);
      });
    });
    root.classList.toggle('scrolled', pick[cur] > 0);
    document.dispatchEvent(new Event('xmb:render')); // стикерам: какой пункт выбран
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

  /* ---------- Действие с пунктом ---------- */
  const kindOf = (it) => it.dataset.kind || '';
  const linkOf = (it) => q('.it__zoom', it) || q('.it__row', it);
  function open(it) {
    const kind = kindOf(it);
    if (kind === 'photo' || kind === 'clip') return showViewer(it);
    const row = q('.it__row', it);
    if (kind === 'game' && row) return openGame(row.getAttribute('href'));
    if (row && row.href) window.open(row.href, row.target || '_self', 'noopener');
  }
  const openCurrent = () => { const it = itemsOf(cur)[pick[cur]]; if (it) open(it); };
  const overlayOpen = () => !viewer.hidden || !game.hidden;

  /* ---------- Клавиатура ---------- */
  addEventListener('keydown', (e) => {
    if (overlayOpen() || e.altKey || e.ctrlKey || e.metaKey) return;
    const inCard = e.target instanceof Element && e.target.closest('.it__card');
    switch (e.key) {
      case 'ArrowLeft': go(cur - 1); break;
      case 'ArrowRight': go(cur + 1); break;
      case 'ArrowUp': move(pick[cur] - 1); break;
      case 'ArrowDown': move(pick[cur] + 1); break;
      case 'Home': move(0); break;
      case 'End': move(itemsOf(cur).length - 1); break;
      case 'Enter': case ' ': if (inCard) return; openCurrent(); break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- Мышь: клик выбирает пункт, повторный клик открывает ---------- */
  let swiped = false;
  menu.addEventListener('click', (e) => {
    if (swiped) { e.preventDefault(); swiped = false; return; }
    if (e.target.closest('.it__card a')) return; // ссылки в карточке работают сами
    const it = e.target.closest('.cat.is-on .it');
    if (!it) return;
    e.preventDefault();
    const j = itemsOf(cur).indexOf(it);
    if (j !== pick[cur]) { move(j); return; }
    open(it);
  });

  /* ---------- Колесо и тачпад: копим сдвиг, чтобы один жест не пролистывал десяток пунктов ---------- */
  let wheelAcc = 0, wheelLast = 0, wheelLock = 0;
  addEventListener('wheel', (e) => {
    if (overlayOpen()) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelLast > 220) wheelAcc = 0;
    wheelLast = now;
    if (now < wheelLock) return;
    const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
    wheelAcc += horizontal ? (e.deltaX || e.deltaY) : e.deltaY;
    if (Math.abs(wheelAcc) < 40) return;
    const dir = Math.sign(wheelAcc);
    wheelAcc = 0;
    if (horizontal) { go(cur + dir); wheelLock = now + 260; }
    else { move(pick[cur] + dir); wheelLock = now + 70; }
  }, { passive: false });

  /* ---------- Свайпы ---------- */
  let touch = null;
  menu.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    touch = { x: e.clientX, y: e.clientY };
    swiped = false;
  });
  menu.addEventListener('pointerup', (e) => {
    if (!touch) return;
    const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
    touch = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    swiped = true;
    setTimeout(() => { swiped = false; }, 400);
    if (Math.abs(dx) > Math.abs(dy)) go(cur - Math.sign(dx));
    else move(pick[cur] - Math.sign(dy) * Math.max(1, Math.round(Math.abs(dy) / g.step)));
  });
  menu.addEventListener('pointercancel', () => { touch = null; });

  /* ---------- Просмотр фото и роликов ---------- */
  const vImg = q('#viewerImg'), vVid = q('#viewerVideo'), vMsg = q('#viewerMsg'), vCount = q('#viewerCount');
  let group = [], at = 0, lastFocus = null;

  const stopClip = () => { vVid.pause(); vVid.removeAttribute('src'); vVid.load(); };
  function paintViewer() {
    const it = group[at];
    const link = linkOf(it);
    const href = link.getAttribute('href');
    const clip = kindOf(it) === 'clip';
    vMsg.hidden = true;
    vImg.hidden = clip;
    vVid.hidden = !clip;
    if (clip) {
      vImg.removeAttribute('src');
      vVid.poster = q('img', link).src;
      vVid.onerror = () => { vVid.hidden = true; vMsg.hidden = false; vMsg.textContent = `Файл не найден: ${href}. Положи ролик по этому пути.`; };
      vVid.src = href;
      vVid.play().catch(() => {});
    } else {
      stopClip();
      vImg.src = href;
      vImg.alt = (q('img', link) || {}).alt || '';
    }
    vCount.textContent = `${at + 1} / ${group.length}`;
  }
  function showViewer(it) {
    lastFocus = document.activeElement;
    // аватарка открывается одна, фото и ролики — вместе с остальными из раздела
    group = it.closest('#profile') ? [it] : itemsOf(cur).filter((x) => ['photo', 'clip'].includes(kindOf(x)));
    at = Math.max(0, group.indexOf(it));
    viewer.classList.toggle('is-single', group.length < 2);
    viewer.hidden = false;
    document.dispatchEvent(new Event('scene:pause'));
    paintViewer();
    q('[data-close]', viewer).focus();
  }
  function closeViewer() {
    viewer.hidden = true;
    stopClip();
    document.dispatchEvent(new Event('scene:resume'));
    const j = itemsOf(cur).indexOf(group[at]);
    if (j >= 0 && j !== pick[cur]) { pick[cur] = j; layout(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  const stepViewer = (d) => { if (group.length > 1) { at = (at + d + group.length) % group.length; paintViewer(); } };

  viewer.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]');
    if (step) stepViewer(+step.dataset.step);
    else if (e.target !== vImg && e.target !== vVid) closeViewer();
  });
  addEventListener('keydown', (e) => {
    if (viewer.hidden) return;
    if (e.key === 'Escape' || e.key === 'Backspace') closeViewer();
    else if (e.key === 'ArrowLeft') stepViewer(-1);
    else if (e.key === 'ArrowRight') stepViewer(1);
    else return;
    e.preventDefault();
  });
  let vTouch = null;
  viewer.addEventListener('pointerdown', (e) => { vTouch = e.target === vVid ? null : e.clientX; });
  viewer.addEventListener('pointerup', (e) => {
    if (vTouch == null) return;
    const dx = e.clientX - vTouch;
    vTouch = null;
    if (Math.abs(dx) > 40) stepViewer(dx < 0 ? 1 : -1);
  });

  /* ---------- Игры: поверх сайта, без новой вкладки ---------- */
  const frame = q('#gameFrame');
  function openGame(url) {
    if (!url) return;
    frame.src = `${url}${url.includes('?') ? '&' : '?'}v=${GAME_BUILD}`;
    game.hidden = false;
    document.dispatchEvent(new Event('scene:pause'));
    // фокус отдаём игре, иначе стрелки уходят в меню под наложением; Esc ловим и внутри кадра
    frame.addEventListener('load', () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeGame(); });
      } catch (_) { /* кадр мог быть уже закрыт */ }
    }, { once: true });
  }
  function closeGame() {
    game.hidden = true;
    frame.removeAttribute('src'); // выгружаем игру, иначе она крутится в фоне
    document.dispatchEvent(new Event('scene:resume'));
    focus();
  }
  q('#gameClose').addEventListener('click', closeGame);
  addEventListener('keydown', (e) => { if (!game.hidden && e.key === 'Escape') { closeGame(); e.preventDefault(); } });

  /* ---------- Ютуб видосы ---------- */
  const videoList = q('#videoList');
  const fetchVideos = async () => {
    if (YOUTUBE.apiKey && YOUTUBE.channelId) {
      const videos = [];
      let pageToken = '';
      do {
        const params = new URLSearchParams({
          part: 'snippet,contentDetails', maxResults: '50',
          playlistId: YOUTUBE.channelId.replace(/^UC/, 'UU'), key: YOUTUBE.apiKey,
        });
        if (pageToken) params.set('pageToken', pageToken);
        const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`);
        if (!res.ok) throw new Error(`YouTube API: HTTP ${res.status}`);
        const data = await res.json();
        data.items.forEach(({ snippet, contentDetails }) => {
          if (snippet.title === 'Private video' || snippet.title === 'Deleted video') return;
          videos.push({ id: snippet.resourceId.videoId, title: snippet.title, published: contentDetails.videoPublishedAt || snippet.publishedAt });
        });
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return videos;
    }
    const res = await fetch('data/videos.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`videos.json: HTTP ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.videos || []).filter((v) => v && v.id && !/^VIDEO_ID/.test(v.id));
  };

  const makeItem = ({ href, iconClass, iconSrc, lazy, title, sub }) => {
    const li = document.createElement('li');
    li.className = 'it';
    const row = document.createElement('a');
    row.className = 'it__row';
    row.href = href;
    row.target = '_blank';
    row.rel = 'noopener';
    const icon = document.createElement('span');
    icon.className = `it__ico ${iconClass || ''}`.trim();
    const img = document.createElement('img');
    img.alt = '';
    if (lazy) img.dataset.src = iconSrc; else img.src = iconSrc;
    icon.append(img);
    const text = document.createElement('span');
    text.className = 'it__txt';
    const t = document.createElement('span');
    t.className = 'it__title';
    t.textContent = title;
    text.append(t);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'it__sub';
      s.textContent = sub;
      text.append(s);
    }
    row.append(icon, text);
    li.append(row);
    return li;
  };

  const loadVideos = fetchVideos()
    .then((videos) => {
      if (!videos.length) throw new Error('Роликов пока нет');
      videoList.replaceChildren(...videos.map((v) => makeItem({
        href: `https://www.youtube.com/watch?v=${encodeURIComponent(v.id)}`,
        iconClass: 'it__ico--video',
        iconSrc: `https://i.ytimg.com/vi/${encodeURIComponent(v.id)}/hqdefault.jpg`,
        lazy: true,
        title: v.title,
        sub: v.published ? new Date(v.published).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
      })));
    })
    .catch((err) => {
      console.warn(err);
      videoList.replaceChildren(makeItem({
        href: YOUTUBE.channelUrl,
        iconSrc: q('#videos').dataset.icon,
        title: 'Добавь свои ролики в data/videos.json',
        sub: 'Смотреть на YouTube',
      }));
    });

  /* ---------- Запуск ---------- */
  root.classList.add('menu-ready', 'menu-still');
  measure();
  layout();
  const endInit = () => root.classList.remove('menu-still');
  requestAnimationFrame(() => requestAnimationFrame(endInit));
  setTimeout(endInit, 500);

  const relayout = () => { measure(); layout(); };
  loadVideos.then(relayout);
  if (document.fonts) document.fonts.ready.then(relayout);
  addEventListener('load', relayout);
  addEventListener('resize', relayout);
})();

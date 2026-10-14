/* Каркас приложения: шапка (стрелка «назад», логотип, заголовок), <main data-ws="view"> для экранов,
   панель из пяти вкладок со значком на «Повторе», плашки (нет голоса, звук заблокирован, прогресс
   не сохранится), всплывающая подсказка (toast) и окно подтверждения.
   Панель вкладок: на узком экране (< 720 px) прибита к низу с отступом под вырез, на широком — сверху;
   в игре скрыта вместе с шапкой (у игры своя полоса с ✕).

   WS.shell:
   - init() — строит каркас в [data-ws=app] (вызывает boot.js);
   - toast(msg) — подсказка на 2,6 с (на экране не больше двух);
   - confirm({ title, text, ok, cancel, danger, safe }) → Promise<boolean>. safe: true делает главной
     кнопку «отмена» (на ней и фокус), danger: true красит кнопку «да» как опасную;
   - setTitle(s) — заголовок в шапке и во вкладке браузера; setBack(hash) — куда ведёт стрелка «назад»
     (по умолчанию — родитель экрана: игра → глава → «Учить» → главная); up(hash?) — перейти к родителю;
   - tabbar(show), mode('game' | 'app') — скрыть панель вкладок / шапку и панель в игре;
   - banner(kind, { text, help, link: { href, text }, onClose } | null) — плашка над шапкой;
   - emoji(name) → код эмодзи интерфейса из data/ui-emoji.json; loadEmoji() → Promise (вызывает boot.js);
   - button(opts), iconButton(opts), icon(name) — кнопки из WS.ui с запасным вариантом. */
(() => {
  'use strict';

  const { el, q } = WS.util;
  const t = (key, vars) => WS.t(key, vars);

  const TABS = [
    { id: 'home', hash: '#/', icon: 'home' },
    { id: 'learn', hash: '#/learn', icon: 'book' },
    { id: 'review', hash: '#/review', icon: 'repeat' },
    { id: 'progress', hash: '#/progress', icon: 'chart' },
    { id: 'settings', hash: '#/settings', icon: 'gear' },
  ];
  // первый сегмент адреса → вкладка
  const SECTION = {
    learn: 'learn', chapter: 'learn', play: 'learn', review: 'review', progress: 'progress', settings: 'settings',
    about: 'settings', lab: 'settings',
  };
  const GLOBAL_SETS = ['mistakes', 'due'];
  const LEVELS = ['easy', 'hard'];

  let app = null;
  let header = null;
  let backBtn = null;
  let titleEl = null;
  let nav = null;
  let view = null;
  let banners = null;
  let badge = null;
  let reviewTab = null;
  let learnTab = null;
  let backHash = null;
  let tabbarOn = true;
  let gameMode = false;
  let toastBox = null;
  let openConfirm = null;
  let confirmSeq = 0;
  let badgeFrame = 0;
  let emojiMap = {};
  const dismissed = new Set();

  const ui = () => WS.ui || {};
  const level = () => {
    try {
      const l = WS.settings.get().level;
      return LEVELS.includes(l) ? l : 'easy';
    } catch (e) {
      return 'easy';
    }
  };
  const canon = (hash) => (WS.router && WS.router.parse ? WS.router.parse(hash).hash : String(hash));

  /* ---------- Кнопки и иконки: из набора WS.ui, а если его нет — свои ---------- */
  const icon = (name, fallback = '') => {
    const icons = ui().icons || {};
    const span = el('span', { class: 'ws-icon', 'aria-hidden': 'true' });
    if (icons[name]) span.innerHTML = icons[name];
    else span.textContent = fallback;
    return span;
  };

  const addClasses = (node, className) => {
    String(className || '').split(/\s+/).filter(Boolean).forEach((c) => node.classList.add(c));
  };

  const button = (opts = {}) => {
    const {
      text = '', kind = 'primary', ws = null, icon: iconName = '', iconEnd = '', size = '', onClick = null,
      className = '', label = '', title = '', href = '', key = '', signal = null,
    } = opts;
    let b = null;
    if (typeof ui().button === 'function') {
      try {
        b = ui().button({
          text, kind, ws, icon: iconName, iconEnd, size, onClick, className, label, title, href, key, signal,
        });
      } catch (e) {
        b = null;
      }
    }
    if (!(b instanceof HTMLElement)) {
      b = el(href ? 'a' : 'button', {
        type: href ? null : 'button', href: href || null,
        class: ['ws-btn', `ws-btn--${kind}`, size && `ws-btn--${size}`],
        'aria-label': label || null, title: title || null,
      }, iconName ? icon(iconName) : null, text ? el('span', { class: 'ws-btn__text', text }) : null,
      iconEnd ? icon(iconEnd) : null);
      if (onClick) b.addEventListener('click', onClick, signal ? { signal } : undefined);
    }
    if (ws) b.dataset.ws = ws;
    if (title && !b.title) b.title = title;
    addClasses(b, className);
    return b;
  };

  const iconButton = ({
    icon: iconName, label = '', ws = null, onClick = null, className = '', fallback = '', kind = '', pressed = null,
    signal = null,
  } = {}) => {
    let b = null;
    if (typeof ui().iconButton === 'function' && (ui().icons || {})[iconName]) {
      try {
        b = ui().iconButton({ icon: iconName, label, ws, onClick, className, kind: kind || undefined, pressed, signal });
      } catch (e) {
        b = null;
      }
    }
    if (!(b instanceof HTMLElement)) {
      b = el('button', { type: 'button', class: 'ws-iconbtn', 'aria-label': label || null, title: label || null },
        icon(iconName, fallback));
      if (pressed != null) b.setAttribute('aria-pressed', String(!!pressed));
      if (onClick) b.addEventListener('click', onClick, signal ? { signal } : undefined);
    }
    if (ws) b.dataset.ws = ws;
    addClasses(b, className);
    return b;
  };

  /* ---------- Заголовок, «назад», режимы ---------- */
  const setTitle = (s) => {
    const text = s == null ? '' : String(s);
    if (titleEl) titleEl.textContent = text;
    document.title = text ? `${text} — WordSprout` : t('app.title');
  };

  const setBack = (hash) => {
    backHash = hash ? canon(hash) : null;
    if (backBtn) backBtn.hidden = !backHash;
  };

  const up = (hash = backHash) => {
    const target = canon(hash || '#/');
    const prev = WS.router.previous ? WS.router.previous() : null;
    if (prev && canon(prev) === target) WS.router.back();
    else WS.router.go(target);
  };

  const paintChrome = () => {
    if (!app) return;
    app.dataset.mode = gameMode ? 'game' : 'app';
    header.hidden = gameMode;
    nav.hidden = gameMode || !tabbarOn;
  };

  const tabbar = (show) => {
    tabbarOn = show !== false;
    paintChrome();
  };

  const mode = (m) => {
    gameMode = m === 'game';
    paintChrome();
  };

  const sectionOf = (info) => {
    const parts = info.path.split('/').filter(Boolean);
    if (!parts.length) return 'home';
    if (parts[0] === 'play' && GLOBAL_SETS.includes(parts[2])) return 'review';
    return SECTION[parts[0]] || '';
  };

  const parentOf = (info) => {
    const [seg, a, b] = info.path.split('/').filter(Boolean);
    const lvl = LEVELS.includes(a) ? a : level();
    if (!seg) return null;
    if (seg === 'chapter') return `#/learn/${lvl}`;
    if (seg === 'play') return GLOBAL_SETS.includes(b) ? '#/review' : `#/chapter/${lvl}/${b}`;
    if (seg === 'about' || seg === 'lab') return '#/settings';
    return '#/';
  };

  const markTab = (section) => {
    nav.querySelectorAll('[data-ws=tab]').forEach((a) => {
      const on = a.dataset.tab === section;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  };

  const rememberLast = (info) => {
    if (!/^\/(learn|chapter|play|review)(\/|$)/.test(info.path) || /\/_/.test(info.path)) return;
    try {
      if (WS.progress && typeof WS.progress.setLast === 'function') WS.progress.setLast(info.hash);
    } catch (e) { /* не страшно */ }
  };

  /* ---------- Значок на вкладке «Повтор»: к повторению сегодня + слова с ошибками ---------- */
  const paintBadge = () => {
    if (!badge) return;
    let n = 0;
    try {
      n = (WS.progress.due() || []).length + (WS.progress.mistakes() || []).length;
    } catch (e) {
      n = 0;
    }
    badge.hidden = n <= 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    reviewTab.setAttribute('aria-label', n > 0 ? `${t('tab.review')}: ${t('tab.badge', { n })}` : t('tab.review'));
  };

  const queueBadge = () => {
    if (badgeFrame) return;
    badgeFrame = requestAnimationFrame(() => {
      badgeFrame = 0;
      paintBadge();
    });
  };

  /* ---------- Плашки ---------- */
  const banner = (kind, opts) => {
    if (!banners) return null;
    const old = banners.querySelector(`[data-kind="${kind}"]`);
    if (!opts) {
      if (old) old.remove();
      return null;
    }
    const { text = '', help = '', link = null, onClose = null } = opts;
    const node = el('div', { class: ['ws-banner', `ws-banner--${kind}`], dataset: { ws: 'banner', kind }, role: 'status' });
    const close = iconButton({
      icon: 'close', label: t('btn.hide'), className: 'ws-banner__close', fallback: '✕', kind: 'plain',
      onClick: () => {
        node.remove();
        if (onClose) onClose();
      },
    });
    // Текст и ссылка — слева, ✕ — справа в первой строке.
    node.append(
      el('div', { class: 'ws-banner__body' },
        el('p', { class: 'ws-banner__text', text }),
        help ? el('p', { class: 'ws-banner__help', text: help }) : null,
        link ? button({ text: link.text, href: link.href, kind: 'ghost', size: 'sm', className: 'ws-banner__link' }) : null),
      close);
    if (old) old.replaceWith(node);
    else banners.append(node);
    return node;
  };

  const onSpeech = (status) => {
    if ((status === 'blocked' || status === 'novoice') && !dismissed.has(`speech:${status}`)) {
      banner('speech', {
        text: t(`speech.${status}`),
        help: status === 'novoice' ? t('speech.help') : '',
        link: { href: '#/settings', text: t('speech.how') },
        onClose: () => dismissed.add(`speech:${status}`),
      });
    } else {
      banner('speech', null);
    }
  };

  const checkStorage = () => {
    const off = !!(WS.store && WS.store.persistent === false);
    if (off && !dismissed.has('storage')) {
      banner('storage', { text: t('store.memory'), onClose: () => dismissed.add('storage') });
    } else if (!off) {
      banner('storage', null);
    }
  };

  /* ---------- Подсказка и подтверждение ---------- */
  // Не больше двух подсказок сразу; одинаковая подсказка не дублируется, а показывается заново.
  const toast = (msg, { ms = 2600 } = {}) => {
    if (!app || msg == null || msg === '') return;
    const text = String(msg);
    if (WS.test.enabled) WS.test.events.push({ type: 'toast', text });
    if (!toastBox || !toastBox.isConnected) {
      toastBox = el('div', { class: 'ws-toasts', role: 'status', 'aria-live': 'polite' });
      app.append(toastBox);
    }
    Array.from(toastBox.children).forEach((n) => {
      if (n.textContent === text) n.remove();
    });
    while (toastBox.children.length >= 2) toastBox.firstElementChild.remove();
    const node = el('div', { class: 'ws-toast', dataset: { ws: 'toast' }, text });
    toastBox.append(node);
    setTimeout(() => node.remove(), Math.max(1200, Number(ms) || 2600));
  };

  const closeConfirm = (value) => {
    if (openConfirm) openConfirm.close(value);
  };

  const confirm = ({
    title = '', text = '', ok = t('confirm.ok'), cancel = t('confirm.cancel'), danger = false, safe = false,
  } = {}) => new Promise((resolve) => {
    closeConfirm(false);
    const id = `ws-confirm-${++confirmSeq}`;
    const before = document.activeElement;
    const ac = new AbortController();
    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      ac.abort();
      overlay.remove();
      if (openConfirm && openConfirm.close === close) openConfirm = null;
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
      if (WS.test.enabled) WS.test.events.push({ type: 'confirm', answer: value === true });
      resolve(value === true);
    };
    const okBtn = button({ text: ok, kind: safe ? 'secondary' : danger ? 'danger' : 'primary', ws: 'confirm-ok',
      onClick: () => close(true) });
    const cancelBtn = button({ text: cancel, kind: safe ? 'primary' : 'secondary', ws: 'confirm-cancel',
      onClick: () => close(false) });
    const heading = title || text;
    const box = el('div', {
      class: 'ws-modal__box ws-confirm__box', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`,
      'aria-describedby': title && text ? `${id}-d` : null, tabindex: '-1',
    },
    el('h2', { class: 'ws-modal__title ws-confirm__title', id: `${id}-t`, text: heading }),
    title && text ? el('p', { class: 'ws-modal__text ws-confirm__text', id: `${id}-d`, text }) : null,
    el('div', { class: 'ws-modal__actions ws-confirm__actions' }, cancelBtn, okBtn));
    const overlay = el('div', { class: 'ws-modal ws-confirm', dataset: { ws: 'confirm' } }, box);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    }, { signal: ac.signal });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        close(false);
      } else if (e.key === 'Tab') {
        const list = [cancelBtn, okBtn];
        const i = list.indexOf(document.activeElement);
        e.preventDefault();
        list[(i + (e.shiftKey ? list.length - 1 : 1) + list.length) % list.length].focus();
      }
    }, { capture: true, signal: ac.signal });
    openConfirm = { close };
    (app || document.body).append(overlay);
    (safe ? cancelBtn : okBtn).focus({ preventScroll: true });
    if (WS.test.enabled) WS.test.events.push({ type: 'confirm-open', title: heading });
  });

  /* ---------- Эмодзи интерфейса ---------- */
  const loadEmoji = () => fetch('data/ui-emoji.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      emojiMap = json && json.emoji && typeof json.emoji === 'object' ? json.emoji : {};
      return emojiMap;
    })
    .catch(() => emojiMap);

  const emoji = (name) => (Object.prototype.hasOwnProperty.call(emojiMap, name) ? emojiMap[name] : '');

  /* ---------- Смена экрана ---------- */
  const onRoute = (info) => {
    closeConfirm(false);
    tabbarOn = true;
    gameMode = false;
    paintChrome();
    setTitle('');
    setBack(parentOf(info));
    markTab(sectionOf(info));
    if (learnTab) learnTab.href = `#/learn/${level()}`;
    rememberLast(info);
    paintBadge();
    checkStorage();
  };

  /* ---------- Сборка каркаса ---------- */
  const makeTab = (tab) => {
    const ic = icon(tab.icon);
    ic.classList.add('ws-tab__icon');
    const a = el('a', { class: 'ws-tab', href: tab.hash, dataset: { ws: 'tab', tab: tab.id } },
      ic, el('span', { class: 'ws-tab__label', text: t(`tab.${tab.id}`) }));
    if (tab.id === 'review') {
      badge = el('span', { class: 'ws-badge ws-tab__badge', dataset: { ws: 'badge' }, 'aria-hidden': 'true', hidden: true });
      a.append(badge);
      reviewTab = a;
    }
    if (tab.id === 'learn') learnTab = a;
    return a;
  };

  const init = () => {
    if (app) return;
    app = q('[data-ws=app]');
    if (!app) {
      app = el('div', { dataset: { ws: 'app' } });
      document.body.prepend(app);
    }
    app.classList.add('ws-app');
    banners = el('div', { class: 'ws-banners', dataset: { ws: 'banners' } });
    backBtn = iconButton({
      icon: 'back', label: t('back'), ws: 'back', className: 'ws-header__back', fallback: '←', kind: 'plain',
      onClick: () => up(),
    });
    backBtn.hidden = true;
    titleEl = el('span', { class: 'ws-header__title', dataset: { ws: 'title' } });
    const logo = el('a', { class: 'ws-header__logo', href: '#/', 'aria-label': t('app.home') },
      el('img', { class: 'ws-header__icon', src: 'img/app/icon.svg', alt: '', width: 32, height: 32 }),
      el('span', { class: 'ws-header__name', text: t('app.name') }));
    header = el('header', { class: 'ws-header', dataset: { ws: 'header' } }, backBtn, logo, titleEl);
    nav = el('nav', { class: 'ws-tabbar', dataset: { ws: 'tabbar' }, 'aria-label': t('tabs.label') }, TABS.map(makeTab));
    view = el('main', { class: 'ws-view', dataset: { ws: 'view' }, tabindex: '-1' });
    app.replaceChildren(banners, header, view, nav);
    paintChrome();

    WS.router.on('before', onRoute);
    if (WS.speech && typeof WS.speech.on === 'function') {
      WS.speech.on(onSpeech);
      onSpeech(WS.speech.status);
    }
    if (WS.progress && typeof WS.progress.on === 'function') WS.progress.on('change', queueBadge);
    if (WS.store && typeof WS.store.onStatus === 'function') WS.store.onStatus(checkStorage);
    if (WS.settings && typeof WS.settings.on === 'function') {
      WS.settings.on(() => {
        if (learnTab) learnTab.href = `#/learn/${level()}`;
      });
    }
    paintBadge();
    checkStorage();
  };

  WS.shell = {
    init, toast, confirm, setTitle, setBack, up, tabbar, mode, banner, emoji, loadEmoji, button, iconButton, icon,
  };
})();

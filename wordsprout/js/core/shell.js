/* Заглушка: каркас страницы. Шапка со стрелкой «назад» и заголовком, <main data-ws="view"> для экранов,
   нижняя панель из пяти вкладок, всплывающие подсказки (toast) и окно подтверждения (confirm).
   При каждой смене адреса сбрасывает заголовок, стрелку и подсвечивает текущую вкладку. */
(() => {
  'use strict';

  const { el, q } = WS.util;
  const TABS = [
    { id: 'home', hash: '#/', icon: 'home' },
    { id: 'learn', hash: '#/learn', icon: 'book' },
    { id: 'review', hash: '#/review', icon: 'repeat' },
    { id: 'progress', hash: '#/progress', icon: 'chart' },
    { id: 'settings', hash: '#/settings', icon: 'gear' },
  ];
  const TAB_OF = {
    '': 'home', learn: 'learn', chapter: 'learn', review: 'review', progress: 'progress', settings: 'settings',
    about: 'settings', lab: 'settings',
  };

  let backBtn = null;
  let titleEl = null;
  let nav = null;
  let app = null;
  let backHash = null;

  const icon = (name) => el('span', { class: 'ws-icon', 'aria-hidden': 'true', html: (WS.ui.icons || {})[name] || '' });

  const setTitle = (s) => {
    titleEl.textContent = s || '';
    document.title = s ? `${s} — WordSprout` : 'WordSprout';
  };

  const setBack = (hash) => {
    backHash = hash || null;
    backBtn.hidden = !backHash;
  };

  const tabbar = (show) => {
    nav.hidden = !show;
  };

  const markTab = () => {
    const seg = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
    const active = TAB_OF[seg] || '';
    nav.querySelectorAll('[data-ws=tab]').forEach((a) => {
      const on = a.dataset.tab === active;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  };

  const onRoute = () => {
    setTitle('');
    setBack(null);
    tabbar(true);
    markTab();
  };

  const toast = (msg) => {
    const node = el('div', { class: 'ws-toast', role: 'status', text: msg });
    app.append(node);
    setTimeout(() => node.remove(), 2500);
  };

  const confirm = ({ title = '', text = '', ok = WS.t('confirm.ok'), cancel = WS.t('confirm.cancel') } = {}) =>
    new Promise((resolve) => {
      const close = (answer) => {
        box.remove();
        resolve(answer);
      };
      const box = el('div', { class: 'ws-confirm', role: 'dialog', 'aria-modal': 'true' },
        el('div', { class: 'ws-confirm__box' },
          title ? el('h2', { class: 'ws-confirm__title', text: title }) : null,
          text ? el('p', { class: 'ws-confirm__text', text }) : null,
          el('div', { class: 'ws-confirm__actions' },
            el('button', { type: 'button', class: 'ws-btn ws-btn--secondary', dataset: { ws: 'confirm-cancel' },
              text: cancel, onclick: () => close(false) }),
            el('button', { type: 'button', class: 'ws-btn ws-btn--primary', dataset: { ws: 'confirm-ok' },
              text: ok, onclick: () => close(true) }))));
      app.append(box);
      q('[data-ws=confirm-ok]', box).focus();
    });

  const init = () => {
    backBtn = el('button', {
      type: 'button', class: 'ws-header__back', dataset: { ws: 'back' }, 'aria-label': WS.t('back'), hidden: true,
      onclick: () => { if (backHash) WS.router.go(backHash); },
    }, icon('back'));
    titleEl = el('span', { class: 'ws-header__title' });
    nav = el('nav', { class: 'ws-tabbar', dataset: { ws: 'tabbar' }, 'aria-label': 'Разделы' },
      TABS.map((t) => el('a', { class: 'ws-tab', href: t.hash, dataset: { ws: 'tab', tab: t.id } },
        icon(t.icon), el('span', { class: 'ws-tab__label', text: WS.t(`tab.${t.id}`) }))));
    app = el('div', { class: 'ws-app' },
      el('header', { class: 'ws-header' },
        backBtn,
        el('a', { class: 'ws-header__logo', href: '#/', text: 'WordSprout' }),
        titleEl),
      el('main', { class: 'ws-view', dataset: { ws: 'view' } }),
      nav);
    document.body.replaceChildren(app);
    window.addEventListener('hashchange', onRoute);
    onRoute();
  };

  WS.shell = { init, toast, confirm, setTitle, setBack, tabbar };
})();

/* Заглушка: экран «Настройки» (#/settings). Пока заголовок, «Скоро» и ссылки на проверку клавиатуры
   и «О приложении». */
(() => {
  'use strict';

  const { el } = WS.util;

  WS.router.add('/settings', (view) => {
    WS.shell.setTitle('Настройки');
    view.append(el('section', { class: 's-settings', dataset: { ws: 'screen', screen: 'settings' } },
      el('h1', { class: 's-settings__title', text: 'Настройки' }),
      el('p', { class: 's-settings__soon', text: WS.t('soon') }),
      el('a', { class: 'ws-btn ws-btn--secondary', href: '#/lab', text: 'Проверка клавиатуры' }),
      el('a', { class: 'ws-btn ws-btn--secondary', href: '#/about', text: 'О приложении' })));
  });
})();

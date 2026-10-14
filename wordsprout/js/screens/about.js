/* Заглушка: экран «О приложении» (#/about). Пока заголовок и «Скоро». */
(() => {
  'use strict';

  const { el } = WS.util;

  WS.router.add('/about', (view) => {
    WS.shell.setTitle('О приложении');
    WS.shell.setBack('#/settings');
    view.append(el('section', { class: 's-about', dataset: { ws: 'screen', screen: 'about' } },
      el('h1', { class: 's-about__title', text: 'О приложении' }),
      el('p', { class: 's-about__soon', text: WS.t('soon') })));
  });
})();

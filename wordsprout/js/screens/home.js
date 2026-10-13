/* Заглушка: главный экран (#/). Пока заголовок, «Скоро» и ссылка к главам. */
(() => {
  'use strict';

  const { el } = WS.util;

  WS.router.add('/', (view) => {
    view.append(el('section', { class: 's-home', dataset: { ws: 'screen', screen: 'home' } },
      el('h1', { class: 's-home__title', text: 'WordSprout' }),
      el('p', { class: 's-home__soon', text: WS.t('soon') }),
      el('a', { class: 'ws-btn ws-btn--primary', href: '#/learn', text: 'Учить слова' })));
  });
})();

/* Заглушка: экран «Повтор» (#/review). Пока заголовок, «Скоро» и ссылки на две общие игры. */
(() => {
  'use strict';

  const { el } = WS.util;

  WS.router.add('/review', (view) => {
    const level = WS.settings.get().level === 'hard' ? 'hard' : 'easy';
    WS.shell.setTitle('Повтор');
    view.append(el('section', { class: 's-review', dataset: { ws: 'screen', screen: 'review' } },
      el('h1', { class: 's-review__title', text: 'Повтор' }),
      el('p', { class: 's-review__soon', text: WS.t('soon') }),
      el('a', { class: 'ws-btn ws-btn--secondary', href: `#/play/${level}/mistakes/mistakes`, text: 'Работа над ошибками' }),
      el('a', { class: 'ws-btn ws-btn--secondary', href: `#/play/${level}/due/srs`, text: 'Повторение' })));
  });
})();

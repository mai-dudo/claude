/* Заглушка: экран «Проверка клавиатуры» (#/lab). Пока заголовок и «Скоро». */
(() => {
  'use strict';

  const { el } = WS.util;

  WS.router.add('/lab', (view) => {
    WS.shell.setTitle('Проверка клавиатуры');
    WS.shell.setBack('#/settings');
    view.append(el('section', { class: 's-lab', dataset: { ws: 'screen', screen: 'lab' } },
      el('h1', { class: 's-lab__title', text: 'Проверка клавиатуры' }),
      el('p', { class: 's-lab__soon', text: WS.t('soon') })));
  });
})();

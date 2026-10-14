/* Заглушка: экран «Прогресс» (#/progress). Пока заголовок, «Скоро» и дерево-заглушка. */
(() => {
  'use strict';

  const { el } = WS.util;

  WS.router.add('/progress', (view) => {
    WS.shell.setTitle('Прогресс');
    const treeBox = el('div', { class: 's-progress__tree' });
    view.append(el('section', { class: 's-progress', dataset: { ws: 'screen', screen: 'progress' } },
      el('h1', { class: 's-progress__title', text: 'Прогресс' }),
      el('p', { class: 's-progress__soon', text: WS.t('soon') }),
      treeBox));
    const t = WS.progress.tree();
    return WS.tree.render(treeBox, { stage: t.stage, frac: t.frac, size: 160, animate: false });
  });
})();

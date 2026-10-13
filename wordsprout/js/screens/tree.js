/* Заглушка: дерево прогресса (WS.tree.render). Пока вместо рисунка — подпись со стадией.
   Настоящее дерево из 8 стадий на SVG нарисует владелец файла. */
(() => {
  'use strict';

  const { el } = WS.util;
  const NAMES = ['семечко', 'росток', 'побег', 'саженец', 'молодое дерево', 'дерево', 'цветущее дерево',
    'дерево с плодами'];

  const render = (host, { stage = 1, size = 160 } = {}) => {
    const k = Math.max(1, Math.min(8, Math.round(stage)));
    const node = el('div', { class: 's-tree', style: { minHeight: `${Math.round(size / 2)}px` } },
      el('p', { class: 's-tree__label', text: `Стадия ${k} из 8 — ${NAMES[k - 1]}` }));
    host.append(node);
    return () => node.remove();
  };

  WS.tree = { render };
})();

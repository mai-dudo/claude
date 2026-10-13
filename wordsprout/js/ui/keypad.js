/* Заглушка: встроенная клавиатура WordSprout (WS.ui.keypad). Три ряда латинских букв и пробел,
   у каждой клавиши data-ws="key" и data-key. Крупные клавиши и оформление сделает владелец файла. */
(() => {
  'use strict';

  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

  WS.ui.keypad = ({ onKey, signal } = {}) => {
    const { el } = WS.util;
    const key = (ch, label) => el('button', {
      type: 'button', class: 'ws-key', dataset: { ws: 'key', key: ch }, text: label || ch,
    });
    const pad = el('div', { class: 'ws-keypad' },
      ROWS.map((row) => el('div', { class: 'ws-keypad__row' }, [...row].map((ch) => key(ch)))),
      el('div', { class: 'ws-keypad__row' }, key(' ', 'пробел')));
    pad.addEventListener('pointerdown', (e) => e.preventDefault(), { signal });
    pad.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ws=key]');
      if (b && onKey) onKey(b.dataset.key);
    }, { signal });
    return { el: pad, destroy: () => pad.remove() };
  };
})();

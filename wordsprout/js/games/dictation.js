/* Заглушка: игра «Диктант» (dictation). Показывает первое слово сессии и кнопку «Готово»,
   которая засчитывает все слова сессии верными и завершает игру. Настоящую игру напишет владелец файла. */
(() => {
  'use strict';

  WS.games.register({
    id: 'dictation',
    howto: 'Пока это заглушка: нажми «Готово», и игра закончится.',
    start(host, ctx) {
      const { el } = ctx.util;
      const first = ctx.words[0];
      const total = ctx.words.length;
      const done = () => {
        ctx.words.forEach((w) => ctx.record(w.id, true, { hint: false }));
        ctx.progress(total, total);
        ctx.finish();
      };
      ctx.progress(0, total);
      host.append(el('div', { class: 'g-dictation__stub' },
        first ? ctx.ui.picture(first, { size: 120 }) : null,
        el('p', { class: 'g-dictation__word', text: first ? first.en : 'Слов для этой игры пока нет.' }),
        first ? el('p', { class: 'g-dictation__ru', text: first.ru }) : null,
        el('button', {
          type: 'button', class: 'ws-btn ws-btn--primary', dataset: { ws: 'next' }, text: 'Готово', onclick: done,
        })));
      return null;
    },
  });
})();

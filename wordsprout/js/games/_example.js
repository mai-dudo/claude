/* Игра-образец «Пример игры» (_example). В каталоге её нет, но маршрут #/play/<уровень>/<набор>/_example
   открывает её всегда (в тестовом режиме — #/play/easy/_fixture/_example).
   Ход игры: картинка слова и перевод под ней → английское слово печатается по буквам в клеточках
   (WS.ui.letterInput, строгий режим) → слово набрано — звук, слово звучит, следующее слово; в конце итоги.
   Шаблон для авторов игр:
   - файл вызывает только WS.games.register({ id, howto, start(host, ctx) }); всё остальное — через ctx;
   - start() строит игру в host сразу (синхронно): он вызывается внутри нажатия «Начать», поэтому
     focus() поля здесь открывает клавиатуру телефона;
   - раскладка — ctx.ui.stage (STYLE.md §6): картинка → задание → ответ → кнопки;
   - каждый слушатель, таймер и элемент ctx.ui получает ctx.signal: при уходе из игры всё снимается само,
     а ctx.util.sleep(ms, ctx.signal) после ухода просто не продолжается;
   - на каждое слово — один ctx.record(id, ok, { hint }), ctx.progress(сделано, всего) двигает полосу,
     ctx.expect(ответ) подсказывает автотестам, ctx.finish() показывает итоги;
   - звуки — ctx.sfx, речь — ctx.speak (ввод никогда не ждёт речь), паузы — ctx.ui.timing. */
(() => {
  'use strict';

  WS.games.register({
    id: '_example',
    howto: 'Посмотри на картинку и напечатай английское слово по буквам.',
    start(host, ctx) {
      const { el, sleep } = ctx.util;
      const { ui, signal, words } = ctx;
      const total = words.length;

      // Пустой набор: игра сама показывает пустое состояние и дорогу назад.
      if (!total) {
        host.append(el('div', { class: 'g-_example__empty' },
          el('p', { text: 'Слов для этой игры пока нет.' }),
          ui.button({ text: 'К играм', kind: 'primary', onClick: () => ctx.exit(), signal })));
        return null;
      }

      let index = -1;
      let solved = 0;
      const word = () => words[index];

      const next = () => {
        if (index + 1 < total) show();
        else ctx.finish();
      };

      // Слово набрано до конца (строгий режим не пропускает неверные буквы).
      const solve = ({ mistakes, hinted }) => {
        const w = word();
        ctx.record(w.id, mistakes === 0, { hint: hinted });
        solved += 1;
        ctx.progress(solved, total);
        ctx.sfx.ok();
        ctx.speak(w.en, { auto: true });
        sleep(mistakes === 0 && !hinted ? ui.timing.ok : ui.timing.bad, signal).then(next);
      };

      const stage = ui.stage({ className: 'g-_example__item' });
      const input = ui.letterInput({
        target: '', signal, keyboard: ctx.settings.keyboard, size: 'word', onComplete: solve,
      });
      stage.answer.append(input.el);
      const speaker = ui.speakerButton({ text: () => word().en, signal });
      const turtle = ui.speakerButton({ text: () => word().en, slow: true, signal });
      host.append(stage.el);

      const show = () => {
        index += 1;
        const w = word();
        stage.el.dataset.wordId = w.id;
        stage.media.replaceChildren(ui.picture(w, { size: 'game' }), ui.hint(w.ru));
        // «Подсказка» каждый раз новая: у прежней кнопки осталось состояние «нажата».
        stage.actions.replaceChildren(speaker, turtle, ui.eyeButton({ signal, onToggle: (on) => input.reveal(on) }));
        input.setTarget(w.en, { prefix: w.pos === 'verb' ? 'to' : null });
        ctx.progress(solved, total);
        ctx.expect(w.en);
      };

      show();
      input.focus();
      // Всё привязано к ctx.signal — отдельная уборка не нужна.
      return null;
    },
  });
})();

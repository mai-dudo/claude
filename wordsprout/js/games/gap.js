/* Игра «Вставь слово» (gap, SPEC §4.4). Картинка с переводом под ней, предложение уровня, где вместо ответа
   стоят клеточки для букв (прямо в строке), под предложением — его русский перевод. Через ~350 мс после
   открытия предложение звучит целиком, вместе с ответом. Ответ печатается по буквам в строгом режиме;
   «глаз» показывает бледные буквы ответа (это помощь). Решено — звук, ответ звучит, следующее предложение.
   Слова, у которых ответа в предложении нет, пропускаются. На слово — одна запись: ok — без неверных букв
   и без подсказки.
   Поле ввода одно на всю игру и никогда не уходит со страницы: строка предложения тоже одна, у следующего
   слова меняется только текст вокруг клеточек — так фокус остаётся в поле и клавиатура телефона не
   закрывается. Слушатели, паузы и речь привязаны к ctx.signal. */
(() => {
  'use strict';

  const TEXT = {
    howto: 'Прочитай предложение и впиши пропущенное английское слово.',
    empty: 'Для этой игры нет подходящих предложений.',
    back: 'К играм',
  };

  const hasGap = (s) => !!s && Array.isArray(s.tokens) && s.tokens.some((tok) => tok && tok.gap);

  // Токены предложения → { before, answer, after }; ответ — как он написан в предложении (с заглавной
  // буквой в начале предложения), из двух слов — вместе с пробелом между ними.
  const split = (tokens) => {
    const first = tokens.findIndex((tok) => tok.gap);
    let last = first;
    tokens.forEach((tok, i) => {
      if (tok.gap) last = i;
    });
    const text = (list) => list.map((tok) => String(tok.t == null ? '' : tok.t)).join('');
    return {
      before: text(tokens.slice(0, first)),
      answer: text(tokens.slice(first, last + 1)),
      after: text(tokens.slice(last + 1)),
    };
  };

  WS.games.register({
    id: 'gap',
    howto: TEXT.howto,
    start(host, ctx) {
      const { el, sleep } = ctx.util;
      const { ui, signal } = ctx;
      const items = ctx.words
        .map((word) => ({ word, s: ctx.sentence(word) }))
        .filter((it) => hasGap(it.s))
        .map((it) => ({ ...it, ...split(it.s.tokens) }))
        .filter((it) => /[a-z]/i.test(it.answer));
      const total = items.length;

      if (!total) {
        host.append(el('div', { class: 'g-gap__empty' },
          el('p', { text: TEXT.empty }),
          ui.button({ text: TEXT.back, kind: 'primary', onClick: () => ctx.exit(), signal })));
        return null;
      }

      // Перевод под картинкой виден → плитке без эмодзи хватит первой буквы.
      const letterTile = ctx.settings.translate !== false;

      let index = -1;
      let solved = 0;
      let seq = 0; // номер слова: отложенная речь и переходы прежнего слова новое не трогают
      let cur = null;
      let line = null; // строка предложения (WS.ui.sentence) с клеточками внутри
      let keep = null; // ребёнок строки, в котором живёт поле ввода: его не трогаем

      const stage = ui.stage({ className: 'g-gap__item' });
      const tr = el('p', { class: 'g-gap__tr' });
      const input = ui.letterInput({
        signal, keyboard: ctx.settings.keyboard, size: 'word', onComplete: (r) => solve(r),
      });
      const speaker = ui.speakerButton({ text: () => cur.s.en, signal });
      const turtle = ui.speakerButton({ text: () => cur.s.en, slow: true, signal });
      host.append(stage.el);

      // Первую строку строит кит; дальше меняется только текст вокруг пропуска (поле не переносится).
      const paint = (it) => {
        if (!line) {
          line = ui.sentence(it.s.tokens, { gapNode: input.el, className: 'g-gap__sentence' });
          line.setAttribute('lang', 'en');
          keep = input.el;
          while (keep.parentNode && keep.parentNode !== line) keep = keep.parentNode;
          stage.prompt.replaceChildren(line, tr);
          return;
        }
        Array.from(line.childNodes).forEach((node) => {
          if (node !== keep) node.remove();
        });
        if (it.before) keep.before(it.before);
        if (it.after) keep.after(it.after);
      };

      const open = () => {
        index += 1;
        cur = items[index];
        seq += 1;
        const my = seq;
        const { word: w, s } = cur;
        stage.el.dataset.wordId = w.id;
        stage.media.replaceChildren(ui.picture(w, { size: 'game', letter: letterTile }), ui.hint(w.ru));
        paint(cur);
        tr.textContent = s.ru || '';
        tr.hidden = !s.ru;
        // «Подсказка» каждый раз новая: у прежней кнопки осталось состояние «нажата».
        stage.actions.replaceChildren(speaker, turtle, ui.eyeButton({ signal, onToggle: (on) => input.reveal(on) }));
        input.setTarget(cur.answer, { prefix: null });
        ctx.progress(solved, total);
        ctx.expect(cur.answer);
        // Ответ прежнего предложения может ещё звучать: фраза встаёт за ним в очередь (первая — нет).
        const queue = index > 0;
        sleep(ui.timing.step, signal).then(() => {
          if (my === seq) ctx.speak(s.en, { auto: true, interrupt: !queue });
        });
      };

      // Ответ набран до конца (строгий режим неверных букв не пропускает).
      const solve = ({ mistakes, hinted }) => {
        const my = seq;
        const clean = !mistakes && !hinted;
        ctx.record(cur.word.id, clean, { hint: !!hinted });
        solved += 1;
        ctx.progress(solved, total);
        ctx.sfx.ok();
        ctx.speak(cur.answer, { auto: true });
        sleep(clean ? ui.timing.ok : ui.timing.bad, signal).then(() => {
          if (my !== seq) return;
          if (index + 1 < total) open();
          else ctx.finish();
        });
      };

      open();
      input.focus();
      // Всё привязано к ctx.signal — отдельная уборка не нужна.
      return null;
    },
  });
})();

/* Игра «Напиши слово» (spell, SPEC §4.1).
   Шаг 1: картинка и перевод под ней → английское слово по буквам в клеточках (строгий режим; у глаголов
   впереди маленькое «to», его не печатают). Слово звучит, когда шаг открывается.
   Шаг 2: то же слово в предложении уровня (Лёгкий — лёгкое предложение, Сложный — сложное). Предложение
   стоит бледными буквами в маленьких клеточках, под картинкой вместо перевода слова — русский перевод
   предложения (при открытой клавиатуре — справа от картинки, STYLE §7); через ~400 мс после начала шага
   оно звучит, и его нужно перепечатать. Решённое предложение звучит ещё раз, затем — следующее слово
   (сразу — по «Дальше» или Enter).
   На слово — одна запись: ok только без неверных букв в обоих шагах и без «подсказки» (глаз в шаге 1).
   Если в шаге 1 была ошибка или подсказка, запись делается сразу (ответы сохраняются по одному).
   Поле ввода одно на всю игру: между шагами и словами только setTarget(), поэтому клавиатура телефона
   не закрывается. Слушатели, паузы и речь привязаны к ctx.signal. */
(() => {
  'use strict';

  const SENTENCE_DELAY = 400; // мс от начала шага с предложением до его озвучки
  const LISTEN_MAX = 9000; // дольше не ждём, пока договорится решённое предложение
  const TEXT = {
    howto: 'Напиши слово по картинке, а потом перепечатай предложение с ним.',
    step2: 'Теперь перепечатай предложение',
    empty: 'Слов для этой игры пока нет.',
    back: 'К играм',
  };

  const plain = (s) => String(s == null ? '' : s).trim().toLowerCase();

  // Предложение стоит печатать, если оно есть и это не само слово (запасной вариант WS.data.sentence).
  const usable = (word, s) => !!s && typeof s.en === 'string' && /[a-z]/i.test(s.en) && plain(s.en) !== plain(word.en);

  WS.games.register({
    id: 'spell',
    howto: TEXT.howto,
    start(host, ctx) {
      const { el, sleep } = ctx.util;
      const { ui, signal } = ctx;
      const words = ctx.words.slice();
      const total = words.length;

      if (!total) {
        host.append(el('div', { class: 'g-spell__empty' },
          el('p', { text: TEXT.empty }),
          ui.button({ text: TEXT.back, kind: 'primary', onClick: () => ctx.exit(), signal })));
        return null;
      }

      // Перевод под картинкой виден → плитке без эмодзи хватит первой буквы.
      const letterTile = ctx.settings.translate !== false;
      // Задержка речи — как у пауз ui.timing: при «меньше движения» и в тестах её нет.
      const later = (ms) => (ui.timing.ok ? ms : 0);

      let index = -1;
      let solved = 0;
      let step = 'word';
      let seq = 0; // номер шага: отложенная речь и переходы прежнего шага новый не трогают
      let cur = null; // { word, sentence, mistakes, helped }
      let eye = null;

      const stage = ui.stage({ className: 'g-spell__item' });
      const tr = el('p', { class: 'g-spell__tr' });
      const cap = el('div', { class: 'g-spell__cap' }, el('p', { class: 'g-spell__note', text: TEXT.step2 }), tr);
      const input = ui.letterInput({
        signal, keyboard: ctx.settings.keyboard, size: 'word', onComplete: (r) => solve(r),
      });
      const audio = () => (step === 'sentence' ? cur.sentence.en : cur.word.en);
      const speaker = ui.speakerButton({ text: audio, signal });
      const turtle = ui.speakerButton({ text: audio, slow: true, signal });
      const next = ui.nextButton({ signal, onClick: () => advance(seq) });
      stage.answer.append(input.el);
      host.append(stage.el);
      // В шаге с предложением «глаза» нет: Ctrl+H ничего не делает (а не открывает историю браузера).
      // Кнопки «Подсказка» регистрируются позже и, пока видны, перехватывают Ctrl+H раньше этой.
      ui.shortcut('ctrl+h', stage.el, () => {}, { signal });

      // Предложение печатается в маленьких клеточках того же поля: новое поле закрыло бы клавиатуру
      // телефона. Если letterInput сам понял size в setTarget(), здесь делать уже нечего.
      const setSize = (size) => {
        const box = input.el;
        if (box.dataset.size === size) return;
        box.classList.remove('ws-letters--word', 'ws-letters--sentence');
        box.classList.add(`ws-letters--${size}`);
        box.dataset.size = size;
      };

      const advance = (my) => {
        if (my !== seq) return;
        seq += 1;
        if (index + 1 < total) openWord();
        else ctx.finish();
      };

      const openWord = () => {
        index += 1;
        const w = words[index];
        const s = ctx.sentence(w);
        cur = { word: w, sentence: usable(w, s) ? s : null, mistakes: 0, helped: false };
        step = 'word';
        seq += 1;
        stage.el.dataset.wordId = w.id;
        stage.el.dataset.step = 'word';
        stage.media.replaceChildren(ui.picture(w, { size: 'game', letter: letterTile }), ui.hint(w.ru));
        // «Подсказка» каждый раз новая: у прежней кнопки осталось состояние «нажата».
        eye = ui.eyeButton({ signal, onToggle: (on) => input.reveal(on) });
        next.hidden = true;
        stage.actions.replaceChildren(speaker, turtle, eye, ui.spacer(), next);
        input.setTarget(w.en, { prefix: w.pos === 'verb' ? 'to' : null, size: 'word' });
        setSize('word');
        ctx.progress(solved, total);
        ctx.expect(w.en);
        ctx.speak(w.en, { auto: true });
      };

      const openSentence = () => {
        const s = cur.sentence;
        step = 'sentence';
        seq += 1;
        const my = seq;
        stage.el.dataset.step = 'sentence';
        tr.textContent = s.ru || '';
        tr.hidden = !s.ru;
        // Перевод слова уступает место переводу предложения; картинка остаётся на месте.
        const hint = stage.media.querySelector('.ws-hint');
        if (hint) hint.replaceWith(cap);
        else stage.media.append(cap);
        eye.hidden = true;
        input.setTarget(s.en, { prefix: null, size: 'sentence' });
        setSize('sentence');
        // Бледные буквы — образец, который перепечатывают; подсказкой они не считаются.
        input.reveal(true, { count: false });
        ctx.expect(s.en);
        // Слово после шага 1 может ещё звучать: предложение встаёт за ним в очередь, а не обрывает его.
        sleep(later(SENTENCE_DELAY), signal).then(() => {
          if (my === seq) ctx.speak(s.en, { auto: true, interrupt: false });
        });
      };

      // Шаг набран до конца (строгий режим неверных букв не пропускает).
      const solve = ({ mistakes, hinted }) => {
        const my = seq;
        const w = cur.word;
        cur.mistakes += Number(mistakes) || 0;
        if (step === 'word' && hinted) cur.helped = true; // в шаге 2 бледные буквы — не помощь
        const clean = cur.mistakes === 0 && !cur.helped;
        ctx.sfx.ok();
        if (step === 'word' && cur.sentence) {
          if (!clean) ctx.record(w.id, false, { hint: cur.helped });
          ctx.speak(w.en, { auto: true });
          sleep(clean ? ui.timing.ok : ui.timing.bad, signal).then(() => {
            if (my === seq) openSentence();
          });
          return;
        }
        ctx.record(w.id, clean, { hint: cur.helped });
        solved += 1;
        ctx.progress(solved, total);
        const said = ctx.speak(step === 'sentence' ? cur.sentence.en : w.en, { auto: true });
        next.hidden = false;
        // Дальше — когда предложение договорено (без звука — сразу); «Дальше» и Enter — не дожидаясь.
        Promise.race([said, sleep(LISTEN_MAX, signal)])
          .then(() => sleep(clean ? ui.timing.ok : ui.timing.bad, signal))
          .then(() => advance(my));
      };

      openWord();
      input.focus();
      // Всё привязано к ctx.signal — отдельная уборка не нужна.
      return null;
    },
  });
})();

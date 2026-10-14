/* Игра «Диктант» (dictation, SPEC §4.6).
   Картинка слова и под ней русский перевод предложения; ниже всё предложение уровня клеточками
   (Лёгкий — лёгкое предложение, Сложный — сложное). Пробелы и знаки препинания стоят заранее, печатаются
   только буквы (строгий режим, регистр не важен). Предложение звучит само, когда открывается, и по
   кнопкам «Послушать» / «Послушать медленно»; «Подсказка» (глаз) показывает бледные буквы — это помощь.
   Без голоса (звук выключен, нет английского голоса, браузер не дал звук) английское предложение 4 с видно
   бледными буквами прямо в клеточках («Запомни и напиши»), потом прячется; «Показать ещё раз» снова
   показывает его на 4 с и считается помощью. Если фраза не прозвучала, а голос стал недоступен
   (заблокирован, звук выключили), игра сама переходит в этот режим.
   Решено — звук, предложение звучит ещё раз, затем следующее (сразу — по «Дальше» или Enter).
   На слово — одна запись: ok только без неверных букв и без помощи. Первая ошибка или помощь
   записываются сразу (ответы сохраняются по одному), повторов рамка не принимает.
   Поле ввода одно на всю игру: следующее предложение — только setTarget(), поэтому клавиатура телефона
   не закрывается между предложениями. Слушатели, паузы и речь привязаны к ctx.signal. */
(() => {
  'use strict';

  const SHOW_MS = 4000; // столько видно предложение, когда голоса нет
  const LISTEN_MAX = 12000; // дольше не ждём, пока договорится решённое предложение
  const TEXT = {
    howto: 'Послушай предложение и напиши его по-английски. Пробелы и знаки препинания уже стоят.',
    look: 'Запомни и напиши',
    write: 'Теперь напиши по памяти',
    again: 'Показать ещё раз',
    ok: 'Верно!',
    done: 'Готово',
    empty: 'Для этой игры нет подходящих предложений.',
    back: 'К играм',
  };

  const plain = (s) => String(s == null ? '' : s).trim().toLowerCase();

  // Предложение годится, если в нём есть буквы и это не само слово (запасной вариант WS.data.sentence).
  const usable = (word, s) => !!s && typeof s.en === 'string' && /[a-z]/i.test(s.en) && plain(s.en) !== plain(word.en);

  WS.games.register({
    id: 'dictation',
    howto: TEXT.howto,
    start(host, ctx) {
      const { el, sleep } = ctx.util;
      const { ui, signal } = ctx;
      const items = ctx.words.map((word) => ({ word, s: ctx.sentence(word) })).filter((it) => usable(it.word, it.s));
      const total = items.length;

      if (!total) {
        host.append(el('div', { class: 'g-dictation__empty' },
          el('p', { text: TEXT.empty }),
          ui.button({ text: TEXT.back, kind: 'primary', onClick: () => ctx.exit(), signal })));
        return null;
      }

      // Настройка «бледные подсказки-буквы»: буквы видны всё время, прятать их после показа нельзя.
      const hintsOn = ctx.settings.hints === true;

      let index = -1;
      let solved = 0;
      let seq = 0; // номер предложения: отложенные показы, речь и переходы прежнего новое не трогают
      let cur = null; // { word, s, mode: 'audio' | 'text', recorded, helped, shown, eyeOn, again }

      const stage = ui.stage({ className: 'g-dictation__item' });
      const note = el('p', { class: 'g-dictation__note', role: 'status' });
      const input = ui.letterInput({
        signal, keyboard: ctx.settings.keyboard, size: 'sentence',
        onLetter: (i, ok) => {
          if (!ok) slip();
        },
        onComplete: (r) => solve(r),
      });
      const text = () => (cur ? cur.s.en : '');
      const speaker = ui.speakerButton({ text, signal });
      const turtle = ui.speakerButton({ text, slow: true, signal });
      const next = ui.nextButton({ signal, onClick: () => advance(seq) });
      stage.answer.append(input.el);
      host.append(stage.el);

      // Первая ошибка или помощь записывается сразу; дальше рамка повторы всё равно не принимает.
      const fail = (helped) => {
        if (!cur || cur.recorded) return;
        cur.recorded = true;
        ctx.record(cur.word.id, false, { hint: helped });
      };
      const slip = () => {
        if (cur && !input.done) fail(cur.helped);
      };
      const help = () => {
        if (!cur || input.done) return;
        cur.helped = true;
        fail(true);
      };

      // Предложение бледными буквами в клеточках: видно SHOW_MS, потом прячется.
      const showText = () => {
        const item = cur;
        item.shown += 1;
        const mine = item.shown;
        input.reveal(true, { count: false });
        note.textContent = TEXT.look;
        sleep(SHOW_MS, signal).then(() => {
          if (cur !== item || item.shown !== mine || input.done) return;
          if (!hintsOn) input.reveal(false);
          note.textContent = TEXT.write;
        });
      };

      // Режим без голоса: вместо «Подсказки» — «Показать ещё раз» (это помощь), первый показ — бесплатно.
      const toText = () => {
        const item = cur;
        if (!item || item.mode === 'text' || input.done) return;
        item.mode = 'text';
        item.eyeOn = false;
        item.again = ui.button({
          text: TEXT.again, icon: 'eye', kind: 'secondary', ws: 'reveal', keepFocus: true, key: 'ctrl+h', signal,
          onClick: () => {
            if (cur !== item || input.done) return;
            help();
            showText();
          },
        });
        stage.prompt.replaceChildren(note);
        stage.actions.replaceChildren(speaker, turtle, item.again, ui.spacer(), next);
        showText();
      };

      // Нажали «послушать», а голоса нет: кит покажет почему, а игра покажет текст.
      [speaker, turtle].forEach((b) => b.addEventListener('click', () => {
        if (!ctx.canSpeak) toText();
      }, { signal }));

      // «Подсказка» каждый раз новая: у прежней кнопки осталось состояние «нажата».
      const eyeFor = (item) => ui.eyeButton({
        signal,
        onToggle: (on) => {
          if (cur !== item || input.done) return;
          item.eyeOn = on;
          input.reveal(on);
          if (on) help();
        },
      });

      const advance = (my) => {
        if (my !== seq) return;
        seq += 1;
        if (index + 1 < total) open();
        else ctx.finish();
      };

      const open = () => {
        index += 1;
        cur = { ...items[index], mode: 'audio', recorded: false, helped: false, shown: 0, eyeOn: false, again: null };
        seq += 1;
        const my = seq;
        const { word: w, s } = cur;
        stage.el.dataset.wordId = w.id;
        stage.el.dataset.item = String(index);
        stage.media.replaceChildren(ui.picture(w, { size: 'game' }), ui.hint(s.ru, { className: 'g-dictation__tr' }));
        note.textContent = '';
        next.hidden = true;
        input.setTarget(s.en, { prefix: null });
        ctx.progress(solved, total);
        ctx.expect(s.en);
        if (!ctx.canSpeak) {
          toText();
          return;
        }
        stage.prompt.replaceChildren();
        stage.actions.replaceChildren(speaker, turtle, eyeFor(cur), ui.spacer(), next);
        ctx.speak(s.en, { auto: true }).then((said) => {
          // Фраза не прозвучала, и голос недоступен (браузер не дал звук, звук выключили) — показываем текст.
          if (!said && my === seq && !signal.aborted && !ctx.canSpeak) toText();
        });
      };

      // Предложение набрано до конца (строгий режим неверных букв не пропускает).
      const solve = ({ mistakes, hinted }) => {
        const item = cur;
        const my = seq;
        const helped = item.helped || !!hinted;
        const clean = !mistakes && !helped;
        if (!item.recorded) {
          item.recorded = true;
          ctx.record(item.word.id, clean, { hint: helped });
        }
        solved += 1;
        ctx.progress(solved, total);
        ctx.sfx.ok();
        if (item.mode === 'text') note.textContent = clean ? TEXT.ok : TEXT.done;
        // Ряд кнопок — в одну строку: на месте «Показать ещё раз» теперь «Дальше».
        if (item.again) item.again.hidden = true;
        next.hidden = false;
        const said = ctx.speak(item.s.en, { auto: true });
        // Дальше — когда предложение договорено (без звука — сразу); «Дальше» и Enter — не дожидаясь.
        Promise.race([said, sleep(LISTEN_MAX, signal)])
          .then(() => sleep(clean ? ui.timing.ok : ui.timing.bad, signal))
          .then(() => advance(my));
      };

      open();
      input.focus();
      // Всё привязано к ctx.signal — отдельная уборка не нужна.
      return null;
    },
  });
})();

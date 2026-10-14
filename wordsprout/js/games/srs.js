/* Игра «Повторение» (srs, SPEC §4.11; коробки Лейтнера — SPEC §5.3).
   Набор собирает рамка игры (setId = due): слова, которым сегодня пора на повторение, и до 10 новых
   выученных в день, не больше 30 за раз. На экране одна карточка: картинка, английское слово (у глаголов —
   маленькое «to»), предложение уровня с этим словом, а русский перевод спрятан за «Показать перевод»
   (подглядывать можно: это проверка себя, а не подсказка). Когда карточка появляется, звучит слово,
   потом предложение. Ученик сам оценивает себя: «Помню» (клавиша 1) или «Не помню» (клавиша 2);
   через ~400 мс — следующая карточка. «Не помню» возвращает карточку через 4 карточки, один раз.
   Запись — одна на слово, по первой оценке: ctx.record(id, «Помню»). Рамка передаёт её в
   WS.progress.record с game = 'srs', а это и есть WS.progress.review(id, remembered): шаг коробки,
   «выучено» по «Помню», «Не помню» → коробка 1, повтор завтра и список ошибок. Поэтому review()
   отдельно не вызываем — иначе шаг коробки засчитался бы дважды. Повторный показ после «Не помню»
   ничего не записывает. Итоги рисует рамка (плюс табличка «повторено / помню / не помню»), «Другая игра»
   ведёт на экран «Повтор». Повторять нечего → «Всё повторено» и дата следующего повторения
   (WS.progress.nextDue — рамка эту дату в ctx не передаёт). Всё привязано к ctx.signal. */
(() => {
  'use strict';

  const RETURN_AFTER = 4; // «Не помню»: карточка вернётся через столько карточек (один раз)
  const ADVANCE_MS = 400; // пауза после оценки (0 при «меньше движения» и в тестах)
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября',
    'ноября', 'декабря'];
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const TEXT = {
    howto: 'Вспомни, что значит слово, проверь себя и честно ответь: «Помню» или «Не помню».',
    again: 'Ещё раз',
    yes: 'Помню — отлично!',
    no: 'Ничего страшного: карточка вернётся чуть позже.',
    empty: 'Всё повторено',
    nextOn: 'Следующее повторение — {date}.',
    nothing: 'Слова для повторения появятся здесь, когда ты выучишь их в играх.',
    toReview: 'К повторению',
    toLearn: 'Учить слова',
    sum: 'Повторение',
    sumAll: 'Повторено',
    sumYes: 'Помню',
    sumNo: 'Не помню',
  };

  const plain = (s) => String(s == null ? '' : s).trim().toLowerCase();

  // Предложение показываем, если оно есть и это не само слово (запасной вариант WS.data.sentence).
  const usable = (word, s) => !!s && typeof s.en === 'string' && /[a-z]/i.test(s.en) && plain(s.en) !== plain(word.en);

  // Ближайшая дата повторения после сегодняшней ('' — пока нечего): её знает только WS.progress.
  const nextDue = () => {
    try {
      const p = WS.progress;
      return p && typeof p.nextDue === 'function' ? String(p.nextDue() || '') : '';
    } catch (e) {
      return '';
    }
  };

  // '2026-10-15' → «завтра, 15 октября»; другой год — с годом.
  const dateText = (key, util) => {
    const m = DATE_RE.exec(key);
    if (!m) return '';
    const today = util.todayKey();
    const day = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
    const days = util.daysBetween(today, key);
    if (days === 1) return `завтра, ${day}`;
    if (days === 2) return `послезавтра, ${day}`;
    return m[1] === today.slice(0, 4) ? day : `${day} ${m[1]} года`;
  };

  WS.games.register({
    id: 'srs',
    howto: TEXT.howto,
    start(host, ctx) {
      const { el, sleep } = ctx.util;
      const { ui, signal } = ctx;
      const words = ctx.words.slice();
      const total = words.length;

      // Пустой набор: рамка сразу запускает игру, и она сама говорит, что всё повторено и когда дальше.
      if (!total) {
        const date = dateText(nextDue(), ctx.util);
        host.append(el('div', { class: 'g-srs__empty', dataset: { ws: 'srs-empty' } }, ui.empty({
          emoji: date ? '2705' : '1f331',
          title: TEXT.empty,
          text: date ? TEXT.nextOn.replace('{date}', date) : TEXT.nothing,
          action: el('div', { class: 'g-srs__empty-actions' },
            ui.button({ text: TEXT.toReview, kind: 'primary', ws: 'exit', signal, onClick: () => ctx.exit() }),
            ui.button({ text: TEXT.toLearn, kind: 'secondary', href: '#/learn', signal })),
        })));
        return null;
      }

      const queue = words.map((word) => ({ word, back: false }));
      let pos = -1;
      let graded = 0;
      let remembered = 0;
      let busy = false; // оценка уже дана, ждём следующую карточку
      let card = null; // { word, back, s }
      let voice = 0; // номер озвучки: новая (или «Послушать») отменяет недосказанное предложение

      /* Карточка: картинка → слово, предложение, перевод → «послушать» и «Показать перевод» → оценка */
      const stage = ui.stage({ className: 'g-srs__card' });
      const wordEl = el('p', { class: 'ws-word g-srs__word', lang: 'en' });
      const line = el('div', { class: 'g-srs__line' });
      const ruWord = el('p', { class: 'g-srs__ru' });
      const ruLine = el('p', { class: 'g-srs__ru-line' });
      const tr = el('div', { class: 'g-srs__tr', dataset: { ws: 'translation-text' }, hidden: true }, ruWord, ruLine);
      const status = el('p', { class: 'ws-sr-only', 'aria-live': 'polite' });
      // Кнопки «послушать» — одной фразой: «слово. Предложение.»
      const say = () => (card ? [card.word.en, card.s ? card.s.en : ''].filter(Boolean).join('. ') : '');
      const speaker = ui.speakerButton({ text: say, signal });
      const turtle = ui.speakerButton({ text: say, slow: true, signal });
      const show = ui.button({
        text: WS.t('btn.translation'), icon: 'eye', kind: 'ghost', size: 'sm', ws: 'translation', key: 'ctrl+h',
        keepFocus: true, signal, onClick: () => reveal(),
      });
      // Оценки не забирают фокус мышью: случайный Enter не оценит следующую карточку.
      const grade = (ok) => () => rate(ok);
      const yes = ui.button({
        text: WS.t('btn.remember'), icon: 'check', kind: 'primary', ws: 'remember', key: '1', keepFocus: true, signal,
        className: 'g-srs__grade', onClick: grade(true),
      });
      const no = ui.button({
        text: WS.t('btn.forget'), icon: 'repeat', kind: 'secondary', ws: 'forget', key: '2', keepFocus: true, signal,
        className: 'g-srs__grade', onClick: grade(false),
      });
      yes.append(el('span', { class: 'g-srs__key', 'aria-hidden': 'true', text: '1' }));
      no.append(el('span', { class: 'g-srs__key', 'aria-hidden': 'true', text: '2' }));
      stage.prompt.append(wordEl, line, tr);
      stage.answer.append(el('div', { class: 'g-srs__tools' }, speaker, turtle, show));
      stage.actions.append(yes, no);
      host.append(stage.el, status);

      // «Послушать» сам говорит слово и предложение — автоматическое предложение больше не нужно.
      [speaker, turtle].forEach((b) => b.addEventListener('click', () => {
        voice += 1;
      }, { signal }));

      const reveal = () => {
        if (!card || !tr.hidden) return;
        tr.hidden = false;
        const had = document.activeElement === show;
        show.hidden = true;
        if (had) yes.focus({ preventScroll: true });
      };

      // Слово, пауза ui.timing.step, предложение (если автопроизношение включено).
      const speakCard = () => {
        voice += 1;
        const mine = voice;
        const { word: w, s } = card;
        ctx.speak(w.en, { auto: true }).then((said) => {
          if (!said || !s || mine !== voice) return null;
          return sleep(ui.timing.step, signal).then(() => {
            if (mine === voice) ctx.speak(s.en, { auto: true, interrupt: false });
          });
        });
      };

      const open = () => {
        pos += 1;
        const item = queue[pos];
        const s = ctx.sentence(item.word);
        card = { ...item, s: usable(item.word, s) ? s : null };
        busy = false;
        const w = card.word;
        stage.el.dataset.wordId = w.id;
        stage.el.dataset.card = String(pos);
        stage.el.classList.toggle('is-back', card.back);
        // Плитка без эмодзи показывала бы русское слово, то есть перевод: на ней — английская первая буква.
        const pic = w.emoji ? ui.picture(w, { size: 'game', letter: true })
          : ui.picture({ ...w, ru: w.en }, { size: 'game', letter: true });
        stage.media.replaceChildren(...[pic, card.back ? ui.badge(TEXT.again, { kind: 'soft' }) : null].filter(Boolean));
        wordEl.replaceChildren(w.pos === 'verb' ? el('span', { class: 'ws-word__to', text: 'to' }) : '', w.en);
        if (card.s) {
          const sentence = ui.sentence(card.s.tokens, { bold: true, className: 'g-srs__sentence' });
          sentence.setAttribute('lang', 'en');
          line.replaceChildren(sentence);
        } else {
          line.replaceChildren();
        }
        line.hidden = !card.s;
        ruWord.textContent = w.ru || '';
        ruLine.textContent = card.s ? card.s.ru || '' : '';
        ruLine.hidden = !ruLine.textContent;
        tr.hidden = true;
        show.hidden = false;
        ui.feedback(yes, null);
        status.textContent = '';
        // Новая карточка въезжает заново (при «меньше движения» анимации нет).
        stage.el.classList.remove('is-in');
        void stage.el.offsetWidth;
        stage.el.classList.add('is-in');
        ctx.progress(graded, queue.length);
        ctx.expect({ action: 'remember', id: w.id, card: pos });
        speakCard();
      };

      const summary = () => ({
        title: TEXT.sum,
        rows: [
          [TEXT.sumAll, WS.t('n.words', { n: total })],
          [TEXT.sumYes, String(remembered)],
          [TEXT.sumNo, String(total - remembered)],
        ],
      });

      // Оценка карточки. Записывается только первая оценка слова; «Не помню» возвращает карточку один раз.
      const rate = (ok) => {
        if (busy || !card) return;
        busy = true;
        voice += 1;
        const { word: w, back } = card;
        if (!back) {
          ctx.record(w.id, ok, { hint: false });
          if (ok) remembered += 1;
          else queue.splice(Math.min(pos + RETURN_AFTER, queue.length), 0, { word: w, back: true });
        }
        graded += 1;
        ctx.progress(graded, queue.length);
        ctx.expect(null);
        if (ok) {
          ui.feedback(yes, 'ok');
          ctx.sfx.ok();
        }
        status.textContent = ok ? TEXT.yes : back ? '' : TEXT.no;
        sleep(ui.timing.ok ? ADVANCE_MS : 0, signal).then(() => {
          if (pos + 1 < queue.length) open();
          else ctx.finish({ extra: summary() });
        });
      };

      open();
      // Всё привязано к ctx.signal — отдельная уборка не нужна.
      return null;
    },
  });
})();

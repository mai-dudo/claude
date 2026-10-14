/* Игра «Найди пары» (match, SPEC §4.3). Слова сессии делятся на раунды не больше пяти пар, по возможности
   поровну (10 слов → 5 + 5, 7 → 4 + 3, 12 → 4 + 4 + 4). В раунде две колонки, перемешанные независимо:
   слева картинки с русским переводом, справа английские слова (у глаголов — с маленьким «to»).
   Нажми карточку, потом карточку в другой колонке:
   - пара верная — обе карточки зеленеют и закрываются, слово звучит;
   - пара неверная — обе на миг (WS.ui.timing.pair) краснеют, ввод на это время закрыт, и оба слова
     получают результат «с ошибкой» (засчитывается только первый результат слова);
   - другая карточка той же колонки переносит выбор, та же карточка — снимает его.
   После последней пары раунда — «Дальше» (после последнего раунда она ведёт к итогам).
   Для автотестов ctx.expect — id слов текущего раунда; доска раунда — .g-match__board[data-round][data-busy].
   Всё привязано к ctx.signal: при уходе из игры слушатели и паузы снимаются сами. */
(() => {
  'use strict';

  const MAX_PAIRS = 5;
  const PRAISE = ['Верно!', 'Отлично!', 'Так держать!', 'Есть пара!', 'Здорово!'];

  // Раунды не больше MAX_PAIRS пар, размеры отличаются не больше чем на одну пару, большие — первыми.
  const roundSizes = (n) => {
    const count = Math.ceil(n / MAX_PAIRS);
    const base = Math.floor(n / count);
    const extra = n % count;
    return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
  };

  WS.games.register({
    id: 'match',
    howto: 'Нажми на картинку, а потом на её английское слово. Найди все пары.',
    start(host, ctx) {
      const { el, shuffle, sleep } = ctx.util;
      const { ui, signal, words } = ctx;
      const total = words.length;
      const showRu = ctx.settings.translate !== false;

      if (!total) {
        host.append(ui.empty({
          icon: 'book', title: 'Слов для этой игры пока нет',
          text: 'Выбери другую главу или другую игру.',
          action: ui.button({ text: 'К играм', kind: 'primary', onClick: () => ctx.exit(), signal }),
        }));
        return null;
      }

      const rounds = [];
      roundSizes(total).reduce((from, k) => {
        rounds.push(words.slice(from, from + k));
        return from + k;
      }, 0);

      /* ---------- Экран ---------- */
      const note = el('p', { class: 'g-match__note', role: 'status' });
      const next = ui.nextButton({ signal, onClick: () => advance(round) });
      next.hidden = true;
      const stage = ui.stage({ className: 'g-match__item', actions: [note, next] });
      host.append(stage.el);

      const setNote = (text, kind = '') => {
        note.textContent = text;
        note.classList.toggle('g-match__note--ok', kind === 'ok');
        note.classList.toggle('g-match__note--bad', kind === 'bad');
      };

      // Цвет — не единственный знак: на карточке ещё и галочка или крестик.
      const addMark = (btn, kind) => btn.append(el('span', { class: ['g-match__mark', `g-match__mark--${kind}`] },
        ui.icon(kind === 'ok' ? 'check' : 'cross', { label: kind === 'ok' ? 'Пара найдена' : 'Не пара' })));
      const dropMarks = (btn) => btn.querySelectorAll('.g-match__mark').forEach((m) => m.remove());

      let round = null;
      let found = 0; // найдено пар за всю сессию

      const select = (r, side, id, btn) => {
        r.sel = { side, id, btn };
        btn.classList.add('is-picked');
        btn.setAttribute('aria-pressed', 'true');
      };

      const unselect = (r) => {
        if (!r.sel) return;
        r.sel.btn.classList.remove('is-picked');
        r.sel.btn.setAttribute('aria-pressed', 'false');
        r.sel = null;
      };

      const roundDone = (r) => {
        r.done = true;
        ctx.expect(null);
        const last = r.index === rounds.length - 1;
        // Итоги сами сыграют мелодию конца — после последнего раунда хватит обычного «верно».
        if (last) ctx.sfx.ok();
        else ctx.sfx.done();
        setNote('Все пары найдены!', 'ok');
        next.hidden = false;
        // Фокус — на «Дальше»: иначе Enter нажал бы ещё раз на уже закрытую карточку.
        if (!ui.isTouch()) next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest' });
      };

      const right = (r, pic, word) => {
        r.matched.add(pic.id);
        [pic.btn, word.btn].forEach((b) => {
          ui.feedback(b, 'ok');
          b.setAttribute('aria-disabled', 'true');
          b.removeAttribute('aria-pressed');
          b.tabIndex = -1;
          addMark(b, 'ok');
          // у карточки-картинки имя задано aria-label — дописываем, что пара найдена
          if (b.hasAttribute('aria-label')) b.setAttribute('aria-label', `${b.getAttribute('aria-label')}, пара найдена`);
        });
        ctx.record(pic.id, true, { hint: false });
        found += 1;
        ctx.progress(found, total);
        ctx.speak(r.byId.get(pic.id).en, { auto: true });
        if (r.matched.size === r.list.length) {
          roundDone(r);
          return;
        }
        ctx.sfx.ok();
        setNote(PRAISE[Math.floor(ctx.rng() * PRAISE.length)], 'ok');
      };

      const wrong = (r, pic, word) => {
        r.busy = true;
        r.board.dataset.busy = '1';
        const pair = [pic.btn, word.btn];
        pair.forEach((b) => {
          ui.feedback(b, 'bad');
          addMark(b, 'bad');
        });
        ctx.record(pic.id, false, { hint: false });
        ctx.record(word.id, false, { hint: false });
        ctx.sfx.bad();
        setNote('Это не пара — попробуй ещё', 'bad');
        sleep(ui.timing.pair, signal).then(() => {
          pair.forEach((b) => {
            ui.feedback(b, null);
            dropMarks(b);
          });
          r.busy = false;
          r.board.dataset.busy = '0';
        });
      };

      const tap = (r, side, id, btn) => {
        if (r !== round || r.done || r.busy || r.matched.has(id)) return;
        const sel = r.sel;
        if (!sel) {
          select(r, side, id, btn);
          return;
        }
        unselect(r);
        if (sel.side === side) {
          // Та же карточка — выбор снят; другая в той же колонке — выбор переехал.
          if (sel.id !== id) select(r, side, id, btn);
          return;
        }
        const pic = side === 'pic' ? { id, btn } : sel;
        const word = side === 'word' ? { id, btn } : sel;
        if (pic.id === word.id) right(r, pic, word);
        else wrong(r, pic, word);
      };

      // Самое длинное слово карточки — по нему CSS уменьшает шрифт, чтобы слово не рвалось.
      const longest = (text) => Math.max(4, ...String(text).split(/[\s-]+/).map((part) => part.length));

      const card = (r, side, w) => {
        const btn = el('button', {
          type: 'button',
          class: ['ws-choice', 'g-match__card', `g-match__card--${side}`],
          dataset: { ws: 'pair', side, wordId: w.id },
          'aria-pressed': 'false',
          'aria-label': side === 'pic' ? `${w.ru} — картинка` : null,
        }, side === 'pic'
          ? el('span', { class: 'g-match__inner' },
            el('span', { class: 'g-match__media' }, ui.picture(w, { size: 'm', letter: showRu })),
            showRu ? el('span', { class: 'g-match__ru', text: w.ru }) : null)
          : el('span', { class: 'g-match__en', lang: 'en', style: { '--chars': String(longest(w.en)) } },
            w.pos === 'verb' ? el('span', { class: 'ws-word__to', text: 'to' }) : null, w.en));
        btn.addEventListener('click', () => tap(r, side, w.id, btn), { signal });
        return btn;
      };

      const showRound = (index) => {
        if (signal.aborted) return;
        const list = rounds[index];
        const pics = shuffle(list, ctx.rng);
        let names = shuffle(list, ctx.rng);
        // Колонки перемешаны независимо, но не так, чтобы каждая пара стояла ровно напротив.
        if (list.length > 1 && names.every((w, i) => w.id === pics[i].id)) names = [...names.slice(1), names[0]];
        const r = {
          index, list, byId: new Map(list.map((w) => [w.id, w])), matched: new Set(), sel: null, busy: false,
          done: false, left: false, board: null,
        };
        // Одна сетка на две колонки: сначала картинки, потом слова (grid-auto-flow: column), поэтому
        // карточки одной строки стоят вровень, а высокой бывает только строка с длинным переводом.
        r.board = el('div', {
          class: ['ws-choices', 'g-match__board'], role: 'group', 'aria-label': 'Картинки и английские слова',
          style: { '--cols': '2', '--rows': String(list.length) }, dataset: { round: String(index + 1), busy: '0' },
        }, pics.map((w) => card(r, 'pic', w)), names.map((w) => card(r, 'word', w)));
        round = r;
        stage.answer.replaceChildren(r.board);
        // Новый раунд — с начала экрана (к «Дальше» на низком экране приходилось прокручивать вниз).
        if (window.scrollY > 0) window.scrollTo({ top: 0 });
        setNote(rounds.length > 1 ? `Раунд ${index + 1} из ${rounds.length}` : 'Найди все пары');
        next.hidden = true;
        ctx.progress(found, total);
        ctx.expect(list.map((w) => w.id));
      };

      const advance = (r) => {
        if (!r || r !== round || !r.done || r.left) return;
        r.left = true;
        if (r.index + 1 < rounds.length) showRound(r.index + 1);
        else ctx.finish();
      };

      ctx.progress(0, total);
      showRound(0);
      return null;
    },
  });
})();

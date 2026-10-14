/* Игра «Выбери картинку» (pick, SPEC §4.2). Сверху крупное английское слово (у глаголов — с маленьким
   «to»), под ним предложение уровня, где это слово выделено. Ниже четыре карточки-картинки с русскими
   подписями: верная и три отвлекающие. Когда слово открывается, оно звучит, а за ним — предложение.
   Нажатие на карточку (или клавиши 1–4 на компьютере) сразу проверяет ответ:
   - верно — карточка зелёная, слово звучит ещё раз, через миг следующее слово;
   - ошибка — выбранная карточка красная, верная зелёная, кнопка «Дальше»; слово один раз встаёт
     в конец очереди, но его результат так и остаётся «с ошибкой» (засчитывается только первый ответ).
   Отвлекающие варианты берутся из слов главы (ctx.pool), при нехватке — из всего курса (ctx.allWords()).
   У каждого своя картинка, другое английское слово (омографы вроде orange — фрукт и цвет — вместе не
   попадут) и другой перевод. Всё привязано к ctx.signal: при уходе из игры слушатели и паузы снимаются сами. */
(() => {
  'use strict';

  const OPTIONS = 4;
  const PRAISE = ['Верно!', 'Отлично!', 'Так держать!', 'Точно!', 'Здорово!'];

  WS.games.register({
    id: 'pick',
    howto: 'Прочитай английское слово и нажми на его картинку. На компьютере можно нажимать 1–4.',
    start(host, ctx) {
      const { el, norm, shuffle, sleep } = ctx.util;
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

      /* ---------- Отвлекающие варианты ---------- */
      const labels = (w) => [w.ru, ...(Array.isArray(w.ruAlt) ? w.ruAlt : [])].map((s) => norm(s).trim()).filter(Boolean);
      // Две карточки нельзя показать вместе: одна картинка, одно английское слово или один перевод.
      const clash = (a, b) => a.id === b.id || !a.emoji || !b.emoji || a.emoji === b.emoji
        || norm(a.en) === norm(b.en) || labels(a).some((x) => labels(b).includes(x));

      let everyone = null; // все слова курса — загружаются, только если слов главы не хватило
      let everyoneLoad = null;
      const loadEveryone = () => {
        if (!everyoneLoad) {
          everyoneLoad = Promise.resolve().then(() => ctx.allWords())
            .then((list) => (Array.isArray(list) ? list : []), () => [])
            .then((list) => {
              everyone = list;
              return list;
            });
        }
        return everyoneLoad;
      };

      const distractors = (target) => {
        const chosen = [];
        const take = (list) => {
          for (const cand of shuffle(list, ctx.rng)) {
            if (chosen.length >= OPTIONS - 1) return;
            if (cand && !clash(cand, target) && chosen.every((c) => !clash(cand, c))) chosen.push(cand);
          }
        };
        take(ctx.pool);
        if (chosen.length < OPTIONS - 1 && everyone) take(everyone);
        return chosen;
      };

      /* ---------- Экран ---------- */
      const wordEl = el('p', { class: 'ws-word g-pick__word', lang: 'en' });
      const sentenceBox = el('div', { class: 'g-pick__sentence' });
      const note = el('p', { class: 'g-pick__note', role: 'status' });
      const speakText = () => (current ? `${current.w.en}. ${current.s.en}` : '');
      const next = ui.nextButton({ signal, onClick: () => advance(current) });
      next.hidden = true;
      const stage = ui.stage({
        className: 'g-pick__item',
        prompt: [wordEl, sentenceBox],
        answer: note,
        actions: [ui.speakerButton({ text: speakText, signal }), ui.speakerButton({ text: speakText, slow: true, signal }),
          ui.spacer(), next],
      });
      host.append(stage.el);

      const setNote = (text, kind = '') => {
        note.textContent = text;
        note.classList.toggle('g-pick__note--ok', kind === 'ok');
        note.classList.toggle('g-pick__note--bad', kind === 'bad');
      };

      // Цвет — не единственный знак: на карточке ещё и галочка или крестик.
      const markCard = (btn, kind) => {
        if (!btn) return;
        btn.append(el('span', { class: ['g-pick__mark', `g-pick__mark--${kind}`] },
          ui.icon(kind === 'ok' ? 'check' : 'cross', { label: kind === 'ok' ? 'Верный ответ' : 'Неверный ответ' })));
      };

      /* ---------- Очередь слов ---------- */
      const queue = words.map((w) => ({ w, retry: false }));
      const answered = new Set(); // слова, у которых уже записан результат (первый ответ)
      let finished = 0; // слова, с которыми покончено: верный ответ или ошибка на повторе
      let shown = 0;
      let current = null;

      // Слово открылось: звучит слово, пауза, предложение (если ответа ещё нет).
      const sayItem = (cur) => {
        ctx.speak(cur.w.en, { auto: true }).then((ok) => {
          if (!ok || cur !== current || cur.done) return;
          sleep(ui.timing.step, signal).then(() => {
            if (cur === current && !cur.done) ctx.speak(cur.s.en, { auto: true });
          });
        });
      };

      const show = (it, others) => {
        if (signal.aborted) return;
        shown += 1;
        const w = it.w;
        const cur = { w, retry: it.retry, s: ctx.sentence(w), grid: null, done: false, left: false, n: shown };
        const options = shuffle([w, ...others], ctx.rng);
        cur.grid = ui.choiceGrid({
          items: options.map((o) => ({
            id: o.id,
            node: el('span', { class: 'g-pick__pic' }, ui.picture(o, { size: 'fill', letter: showRu })),
            text: showRu ? o.ru : null,
          })),
          columns: 2, signal, className: 'g-pick__grid', onPick: (id) => choose(cur, id),
        });
        // Число колонок задаёт pick.css: 2 на телефоне, 4 на широком экране.
        cur.grid.el.style.removeProperty('--cols');
        cur.grid.el.setAttribute('aria-label', 'Картинки');
        current = cur;

        stage.el.dataset.target = w.id;
        stage.el.dataset.item = String(shown);
        // Новое слово — с начала экрана (на низком экране к «Дальше» приходилось прокручивать вниз).
        if (window.scrollY > 0) window.scrollTo({ top: 0 });
        // replaceChildren(null) написал бы «null» — «to» добавляем только глаголам.
        wordEl.replaceChildren(...(w.pos === 'verb' ? [el('span', { class: 'ws-word__to', text: 'to' })] : []), w.en);
        const line = ui.sentence(cur.s.tokens, { bold: true });
        line.lang = 'en';
        sentenceBox.replaceChildren(line);
        stage.answer.replaceChildren(cur.grid.el, note);
        setNote(it.retry ? 'Повторим это слово' : '');
        next.hidden = true;
        ctx.progress(finished, total);
        ctx.expect(w.id);
        sayItem(cur);
      };

      const nextItem = () => {
        if (signal.aborted) return;
        const it = queue.shift();
        if (!it) {
          ctx.finish();
          return;
        }
        const others = distractors(it.w);
        if (others.length >= OPTIONS - 1 || everyone) {
          show(it, others);
          return;
        }
        // В главе мало подходящих картинок — добираем варианты из других глав.
        setNote('Подбираю картинки…');
        loadEveryone().then(() => show(it, distractors(it.w)));
      };

      const advance = (cur) => {
        if (!cur || cur !== current || !cur.done || cur.left) return;
        cur.left = true;
        nextItem();
      };

      const choose = (cur, id) => {
        if (cur !== current || cur.done) return;
        cur.done = true;
        const w = cur.w;
        const right = id === w.id;
        cur.grid.lock();
        ctx.expect(null);
        if (!answered.has(w.id)) {
          answered.add(w.id);
          ctx.record(w.id, right, { hint: false });
        }
        if (right) {
          finished += 1;
          ctx.progress(finished, total);
          markCard(cur.grid.mark(w.id, 'ok'), 'ok');
          setNote(PRAISE[Math.floor(ctx.rng() * PRAISE.length)], 'ok');
          ctx.sfx.ok();
          ctx.speak(w.en, { auto: true });
          sleep(ui.timing.ok, signal).then(() => advance(cur));
          return;
        }
        markCard(cur.grid.mark(id, 'bad'), 'bad');
        markCard(cur.grid.mark(w.id, 'ok'), 'ok');
        ctx.sfx.bad();
        ctx.speak(w.en, { auto: true });
        if (cur.retry) {
          finished += 1;
          ctx.progress(finished, total);
          setNote('Ничего страшного: верная картинка — зелёная', 'bad');
        } else {
          queue.push({ w, retry: true });
          setNote('Почти! Это слово ещё вернётся', 'bad');
        }
        next.hidden = false;
        // Фокус — на «Дальше»: иначе Enter нажал бы ещё раз на уже закрытую карточку.
        if (!ui.isTouch()) next.focus({ preventScroll: true });
        next.scrollIntoView({ block: 'nearest' });
      };

      ctx.progress(0, total);
      nextItem();
      return null;
    },
  });
})();

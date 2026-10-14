/* Экраны «Учить» и «Глава».
   #/learn — сразу ведёт на #/learn/<уровень из настроек>.
   #/learn/:level — переключатель «Лёгкий / Сложный» (выбор запоминается в настройках) и плитки глав
   в порядке этого уровня: картинка, название по-русски и по-английски, «N из 20 выучено» с полоской
   и лучшие звёзды главы. Первая незавершённая глава получает значок «Начни здесь» (ещё не начата)
   или «Продолжить». Глава, у которой пока нет файла слов, показана как «Скоро» и не открывается:
   это видно по WS.data.status() или по короткому HEAD-запросу к файлу (ответ помнится до перезагрузки
   страницы), сами слова для списка глав не грузятся.
   #/chapter/:level/:chapterId — шапка главы (картинка, названия, уровень, сколько выучено), карточки
   игр в порядке каталога (игры, для которых в главе мало подходящих слов, скрыты; у каждой — лучшие
   звёзды для этой главы и уровня) и список всех слов: картинка, слово (глаголы — «to …»), перевод,
   кнопка «послушать» и галочка «выучено».
   Если прогресс меняется, пока экран открыт (другая вкладка, импорт), экран обновляется на месте. */
(() => {
  'use strict';

  const { el, plural } = WS.util;
  const ui = WS.ui;
  const LEVELS = ['easy', 'hard'];
  const FIXTURE = '_fixture';
  const EAGER_PICS = 8; // картинки первых плиток грузим сразу, остальные — по мере прокрутки
  const NOTES = {
    easy: 'Короткие примеры из 3–8 слов, главы — от самых простых тем.',
    hard: 'Длинные примеры из 9–16 слов и свой порядок глав.',
  };

  /* ---------- Мелочи ---------- */
  const safe = (fn, fallback) => {
    try {
      const v = fn();
      return v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  };
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const levelOf = (s) => (LEVELS.includes(s) ? s : null);
  const savedLevel = () => (safe(() => WS.settings.get().level, 'easy') === 'hard' ? 'hard' : 'easy');
  const levelName = (level) => WS.t(`level.${level}`);
  const learnedText = (n, total) => `${n} из ${total} выучено`;
  const chapterHash = (level, id) => `#/chapter/${level}/${encodeURIComponent(id)}`;
  const onProgress = (fn) => safe(() => WS.progress.on('change', fn), null);

  // Перерисовка не чаще раза за кадр и никогда — после ухода с экрана.
  const scheduler = (fn, signal) => {
    let frame = 0;
    const run = () => {
      frame = 0;
      if (!(signal && signal.aborted)) fn();
    };
    return {
      queue: () => {
        if (!frame && !(signal && signal.aborted)) frame = requestAnimationFrame(run);
      },
      stop: () => {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      },
    };
  };

  // Игры глав в порядке каталога (data/games.json), без глобальных и выключенных.
  const chapterGames = () => {
    const fromData = safe(() => WS.data.games(), null);
    const list = Array.isArray(fromData) && fromData.length ? fromData : safe(() => WS.games.list(), []);
    return (Array.isArray(list) ? list : [])
      .filter((g) => g && typeof g.id === 'string' && !g.id.startsWith('_') && g.enabled !== false
        && (g.scope || 'chapter') === 'chapter')
      .sort((a, b) => num(a.order) - num(b.order));
  };

  // Игра подходит главе, если подходящих слов не меньше minWords (так же решает рамка игры).
  const fits = (words, g) => {
    const ok = safe(() => WS.data.eligible(words, g), null);
    return (Array.isArray(ok) ? ok.length : 0) >= Math.max(1, num(g.minWords) || 1);
  };

  const bestOf = (level, chapterId, games) => games.reduce((acc, g) => {
    const b = safe(() => WS.progress.best(level, chapterId, g.id), null);
    if (!b) return acc;
    return { stars: Math.max(acc.stars, num(b.stars)), played: acc.played || num(b.n) > 0 };
  }, { stars: 0, played: false });

  const learnedIn = (chapterId, total) => {
    const n = Math.max(0, Math.floor(num(safe(() => WS.progress.learnedIn(chapterId), 0))));
    return total ? Math.min(total, n) : n;
  };

  const chapterPic = (c, size, lazy) => ui.picture({ id: c.id, ru: c.ru, en: c.en, emoji: c.emoji },
    { size, label: '', lazy });

  /* ---------- Есть ли у главы файл слов ---------- */
  const avail = new Map(); // id главы → true | false | Promise (идёт проверка)

  // true — файл есть, false — файла нет («Скоро»), null — пока неизвестно (плитка открывается).
  const availability = (id) => {
    if (id === FIXTURE) return true;
    const st = safe(() => WS.data.status(id), 'idle');
    if (st === 'ready') return true;
    if (st === 'missing') return false;
    const v = avail.get(id);
    return typeof v === 'boolean' ? v : null;
  };

  // HEAD-запрос без загрузки самих слов. Неясный ответ (сеть, сервер без HEAD) не запоминается.
  const probe = (id) => {
    if (!avail.has(id)) {
      const job = fetch(`data/words/${encodeURIComponent(id)}.json`, { method: 'HEAD', cache: 'no-cache' })
        .then((r) => (r.ok ? true : r.status === 404 || r.status === 410 ? false : null), () => null)
        .then((v) => {
          if (v === null) avail.delete(id);
          else avail.set(id, v);
          return v;
        });
      avail.set(id, job);
    }
    const v = avail.get(id);
    return v && typeof v.then === 'function' ? v : Promise.resolve(v);
  };

  /* ---------- Экран «Учить» ---------- */
  let focusLevel = null; // после переключения уровня фокус остаётся на переключателе

  const tileState = (c, level, games) => {
    const total = num(c.count) || (Array.isArray(c.words) ? c.words.length : 0);
    const learned = learnedIn(c.id, total);
    const best = bestOf(level, c.id, games);
    const seen = (Array.isArray(c.words) ? c.words : [])
      .some((id) => num(safe(() => WS.progress.word(id).s, 0)) > 0);
    return {
      ok: availability(c.id), total, learned, stars: best.stars, played: best.played,
      started: learned > 0 || best.played || seen, done: total > 0 && learned >= total,
    };
  };

  const tileNode = (c, level, s, mark, lazy) => {
    const soon = s.ok === false;
    let meta;
    if (soon) {
      meta = el('span', { class: 's-learn__meta' }, ui.badge(WS.t('soon'), { kind: 'soft' }));
    } else {
      const bar = ui.progressBar({ value: s.learned, max: s.total || 1, size: 's', label: 'Выучено слов главы' });
      meta = el('span', { class: 's-learn__meta' },
        el('span', { class: 's-learn__bar' }, bar.el),
        el('span', { class: 's-learn__count', text: learnedText(s.learned, s.total) }),
        s.played ? ui.stars(s.stars, { size: 's' }) : null);
    }
    let badge = null;
    if (mark) {
      badge = ui.badge(mark);
      badge.classList.add('s-learn__badge');
    }
    const kids = [
      el('span', { class: 's-learn__pic' }, chapterPic(c, 's', lazy)),
      el('span', { class: 's-learn__body' },
        badge,
        el('span', { class: 's-learn__ru', text: c.ru }),
        el('span', { class: 's-learn__en', lang: 'en', text: c.en }),
        meta),
    ];
    if (soon) {
      return el('div', {
        class: 's-learn__tile is-soon', dataset: { ws: 'chapter-tile', chapter: c.id, soon: '1' }, 'aria-disabled': 'true',
      }, kids);
    }
    return el('a', {
      class: ['s-learn__tile', mark && 'is-next', s.done && 'is-done'], href: chapterHash(level, c.id),
      dataset: { ws: 'chapter-tile', chapter: c.id },
    }, kids);
  };

  const mountLearn = (view, params, query, extra) => {
    const level = levelOf(params.level);
    if (!level) {
      WS.router.go(`#/learn/${savedLevel()}`, { replace: true });
      return null;
    }
    const signal = extra && extra.signal;
    if (savedLevel() !== level) safe(() => WS.settings.set({ level }));
    WS.shell.setTitle(WS.t('tab.learn'));
    WS.shell.setBack('#/');

    const games = chapterGames();
    const seg = ui.segmented({
      options: LEVELS.map((l) => ({ value: l, text: levelName(l) })),
      value: level, ws: 'level', attr: 'level', label: 'Уровень', className: 'ws-seg--block s-learn__levels', signal,
      onChange: (v) => {
        safe(() => WS.settings.set({ level: v }));
        focusLevel = v;
        WS.router.go(`#/learn/${v}`, { replace: true });
      },
    });
    const list = el('ul', { class: 's-learn__list', 'aria-label': 'Главы' });
    view.append(el('section', { class: 's-learn', dataset: { ws: 'screen', screen: 'learn', level } },
      el('header', { class: 's-learn__head' },
        el('h1', { class: 's-learn__title', text: 'Главы' }),
        seg.el,
        el('p', { class: 's-learn__note', text: NOTES[level] })),
      list));
    if (focusLevel === level) {
      const opt = seg.el.querySelector(`[data-level="${level}"]`);
      if (opt) opt.focus({ preventScroll: true });
    }
    focusLevel = null;

    const cache = new Map(); // id главы → { sig, li }: неизменные плитки не перерисовываются
    const paint = () => {
      const chapters = safe(() => WS.data.chapters(level), []) || [];
      const rows = chapters.map((c) => ({ c, s: tileState(c, level, games) }));
      const next = rows.find((r) => r.s.ok !== false && !r.s.done) || null;
      const nodes = rows.map((r, i) => {
        const mark = r === next ? (r.s.started ? WS.t('btn.continue') : 'Начни здесь') : '';
        const s = r.s;
        const sig = [s.ok, s.total, s.learned, s.stars, s.played, s.done, mark].join('|');
        const old = cache.get(r.c.id);
        if (old && old.sig === sig) return old.li;
        const li = el('li', { class: 's-learn__item' }, tileNode(r.c, level, s, mark, i >= EAGER_PICS));
        cache.set(r.c.id, { sig, li });
        return li;
      });
      if (!nodes.length) {
        list.replaceChildren(el('li', { class: 's-learn__item' },
          ui.empty({ icon: 'book', title: 'Глав пока нет', text: 'Загляни сюда чуть позже.' })));
        return;
      }
      const same = nodes.length === list.children.length && nodes.every((n, i) => list.children[i] === n);
      if (same) return;
      const active = document.activeElement;
      const keep = active && list.contains(active) && active.dataset ? active.dataset.chapter : '';
      list.replaceChildren(...nodes);
      if (keep) {
        const tile = list.querySelector(`a[data-chapter="${CSS.escape(keep)}"]`);
        if (tile) tile.focus({ preventScroll: true });
      }
    };
    const later = scheduler(paint, signal);
    paint();

    (safe(() => WS.data.chapters(level), []) || []).forEach((c) => {
      if (availability(c.id) === null) probe(c.id).then(later.queue);
    });
    const off = onProgress(later.queue);
    return () => {
      later.stop();
      if (typeof off === 'function') off();
    };
  };

  /* ---------- Экран главы ---------- */
  const gameCard = (g, level, chapterId) => {
    const stars = el('span', { class: 's-chapter__stars' });
    const card = ui.card({
      href: `#/play/${level}/${encodeURIComponent(chapterId)}/${encodeURIComponent(g.id)}`, ws: 'game-card',
      className: 's-chapter__game',
    },
    el('span', { class: 's-chapter__icon' }, ui.emoji(g.icon, { size: 40 })),
    el('span', { class: 's-chapter__game-title', text: g.title || g.id }),
    stars,
    g.blurb ? el('span', { class: 's-chapter__game-blurb', text: g.blurb }) : null);
    card.dataset.game = g.id;
    return { g, card, stars };
  };

  const wordRow = (w, signal) => {
    const verb = w.pos === 'verb';
    const tick = el('span', { class: 's-chapter__tick', role: 'img' });
    const row = el('li', { class: 'ws-row s-chapter__word', dataset: { ws: 'word-row', wordId: w.id } },
      ui.picture(w, { size: 's', lazy: true }),
      el('span', { class: 'ws-row__main' },
        el('span', { class: 'ws-row__title s-chapter__en', lang: 'en' },
          verb ? el('span', { class: 'ws-word__to', text: 'to' }) : null, verb ? ' ' : null, w.en),
        el('span', { class: 'ws-row__sub s-chapter__ru', text: w.ru })),
      el('span', { class: 'ws-row__end' },
        ui.speakerButton({ text: w.en, key: '', label: `Послушать: ${verb ? 'to ' : ''}${w.en}`, signal }),
        tick));
    return { id: w.id, row, tick };
  };

  const paintTick = (tick, on) => {
    const label = on ? 'Выучено' : 'Ещё не выучено';
    tick.classList.toggle('is-on', on);
    tick.setAttribute('aria-label', label);
    tick.title = label;
    tick.replaceChildren(on ? ui.icon('check') : '');
  };

  const mountChapter = (view, params, query, extra) => {
    const id = String(params.chapterId || '');
    const level = levelOf(params.level);
    if (!level) {
      WS.router.go(chapterHash(savedLevel(), id), { replace: true });
      return null;
    }
    const chapter = safe(() => WS.data.chapter(id), null);
    if (!chapter) {
      WS.router.go(`#/learn/${level}`, { replace: true });
      return null;
    }
    const signal = extra && extra.signal;
    WS.shell.setTitle(chapter.ru);
    WS.shell.setBack(`#/learn/${level}`);

    const games = chapterGames();
    const total = num(chapter.count) || chapter.words.length;
    const countEl = el('span', { class: 's-chapter__count', dataset: { ws: 'learned' } });
    const bar = ui.progressBar({ value: 0, max: total || 1, size: 's', label: 'Выучено слов главы' });
    const body = el('div', { class: 's-chapter__body' });
    let cards = [];
    let rows = [];

    view.append(el('section', { class: 's-chapter', dataset: { ws: 'screen', screen: 'chapter', chapter: id, level } },
      el('header', { class: 's-chapter__head' },
        el('span', { class: 's-chapter__pic' }, chapterPic(chapter, 'm', false)),
        el('div', { class: 's-chapter__titles' },
          el('h1', { class: 's-chapter__title', text: chapter.ru }),
          el('p', { class: 's-chapter__sub', lang: 'en', text: chapter.en }),
          el('div', { class: 's-chapter__meta' },
            el('span', { class: ['s-chapter__level', `s-chapter__level--${level}`], text: `${levelName(level)} уровень` }),
            countEl),
          el('span', { class: 's-chapter__bar' }, bar.el))),
      body));

    const paint = () => {
      const learned = learnedIn(id, total);
      countEl.textContent = learnedText(learned, total);
      bar.set(learned, total || 1);
      cards.forEach(({ g, stars }) => {
        const b = safe(() => WS.progress.best(level, id, g.id), null);
        stars.replaceChildren(ui.stars(b ? num(b.stars) : 0, { size: 's' }));
      });
      rows.forEach(({ id: wordId, tick }) => paintTick(tick, !!safe(() => WS.progress.isLearned(wordId), false)));
    };

    const section = (title, ...kids) => el('section', { class: 's-chapter__section' },
      el('h2', { class: 's-chapter__h2', text: title }), kids);

    const showWords = (words) => {
      const shown = games.filter((g) => fits(words, g));
      cards = shown.map((g) => gameCard(g, level, id));
      rows = words.map((w) => wordRow(w, signal));
      body.replaceChildren(
        section('Игры', cards.length
          ? el('ul', { class: 's-chapter__games' }, cards.map((c) => el('li', { class: 's-chapter__item' }, c.card)))
          : el('p', { class: 's-chapter__note', text: 'Для этой главы пока нет подходящих игр.' })),
        section(`Слова главы · ${words.length} ${plural(words.length, ['слово', 'слова', 'слов'])}`,
          el('ul', { class: 'ws-list s-chapter__words' }, rows.map((r) => r.row))));
      paint();
    };

    const showSoon = () => {
      body.replaceChildren(ui.empty({
        icon: 'sprout', title: 'Эта глава скоро появится',
        text: 'Слова для неё ещё готовятся. А пока загляни в другие главы.',
        action: ui.button({ text: WS.t('btn.chapters'), kind: 'primary', href: `#/learn/${level}`, ws: 'chapters' }),
      }));
    };

    const load = () => {
      body.replaceChildren(el('p', { class: 's-chapter__note', role: 'status', text: 'Загружаю слова…' }));
      Promise.resolve().then(() => WS.data.words(id)).then((words) => {
        if (signal && signal.aborted) return;
        avail.set(id, true);
        showWords(Array.isArray(words) ? words : []);
      }, (e) => {
        if (signal && signal.aborted) return;
        if (e && e.missing) {
          avail.set(id, false);
          showSoon();
          return;
        }
        body.replaceChildren(ui.empty({
          icon: 'info', title: 'Не получилось загрузить слова', text: 'Проверь интернет и попробуй ещё раз.',
          action: ui.button({ text: WS.t('btn.retry'), icon: 'restart', kind: 'primary', ws: 'retry', onClick: load, signal }),
        }));
      });
    };

    paint();
    load();
    const later = scheduler(paint, signal);
    const off = onProgress(later.queue);
    return () => {
      later.stop();
      if (typeof off === 'function') off();
    };
  };

  WS.router.add('/learn', () => {
    WS.router.go(`#/learn/${savedLevel()}`, { replace: true });
    return null;
  });
  WS.router.add('/learn/:level', mountLearn);
  WS.router.add('/chapter/:level/:chapterId', mountChapter);
})();

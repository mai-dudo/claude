/* Главный экран (#/).
   Первый визит: приветствие (название, обещание в одну строку, большая кнопка «Начать» → #/learn),
   живая мини-игра (картинка кошки, кнопка «послушать» и три клеточки для слова cat из WS.ui.letterInput —
   после ответа клеточки зеленеют, слово звучит), три коротких блока о том, как всё устроено,
   и ссылка «← на сайт» (../).
   Вернувшийся ученик: «Продолжить» (последний экран из WS.progress.last()), серия дней, минуты
   занятий сегодня, маленькое дерево со стадией (WS.tree.render; если дерева нет — значок ростка)
   и сколько слов ждёт повторения. Вариант выбирается по прогрессу (был хотя бы один ответ) и сам
   меняется, если прогресс изменился, пока экран открыт (импорт, сброс, другая вкладка). */
(() => {
  'use strict';

  const { el, plural, todayKey } = WS.util;
  const ui = WS.ui;
  const LEVELS = ['easy', 'hard'];
  const SITE = '../';
  // Коды эмодзи интерфейса на случай, если data/ui-emoji.json не загрузился.
  const UI_EMOJI = {
    cat: '1f431', eyes: '1f440', ear: '1f442', keyboard: '2328', books: '1f4da', sprout: '1f331', tree: '1f333',
    flame: '1f525', clock: '23f0', repeat: '1f501',
  };
  const PROMISE = 'Учи английские слова по картинкам и на слух — бесплатно, оба уровня открыты сразу.';
  const FEATURES = [
    {
      emoji: ['eyes', 'ear', 'keyboard'], title: 'Смотри, слушай, печатай',
      text: 'Картинка подсказывает смысл, голос — звучание, а слово ты набираешь сам, буква за буквой.',
    },
    {
      emoji: ['books'], title: 'Лёгкий и Сложный — бесплатно',
      text: 'Оба уровня открыты сразу: на лёгком — короткие фразы, на сложном — длинные предложения.',
    },
    {
      emoji: ['sprout', 'tree'], title: 'Дерево растёт вместе с тобой',
      text: 'Каждое выученное слово помогает ему подрасти: от семечка до дерева с плодами.',
    },
  ];

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
  const code = (name) => safe(() => WS.shell.emoji(name), '') || UI_EMOJI[name] || '';
  const settings = () => safe(() => WS.settings.get(), null) || {};
  const words = (n) => `${n} ${plural(n, ['слово', 'слова', 'слов'])}`;
  const decode = (s) => {
    try {
      return decodeURIComponent(s);
    } catch (e) {
      return s;
    }
  };

  const isReturning = () => {
    const st = safe(() => WS.progress.stats(), null);
    return !!st && (num(st.answers) > 0 || num(st.sessions) > 0 || num(st.learned) > 0);
  };

  /* ---------- Куда ведёт «Продолжить» ---------- */
  const setTitle = (setId) => {
    if (setId === 'mistakes' || setId === 'due') return WS.t(`game.set.${setId}`);
    const c = safe(() => WS.data.chapter(setId), null);
    return c ? c.ru : '';
  };

  const resumeTarget = () => {
    const raw = String(safe(() => WS.progress.last(), '') || '');
    if (!/^#\/[a-z]/.test(raw)) return { hash: '#/learn', label: '' };
    const [seg, a, b, c] = raw.slice(2).split('?')[0].split('/').filter(Boolean).map(decode);
    const lvl = LEVELS.includes(a) ? WS.t(`level.${a}`) : '';
    let parts = [];
    if (seg === 'play') {
      const game = safe(() => WS.data.game(c), null);
      parts = [setTitle(b), game ? game.title : '', lvl];
    } else if (seg === 'chapter') {
      parts = [setTitle(b), lvl];
    } else if (seg === 'learn') {
      parts = ['Список глав', lvl];
    } else if (seg === 'review') {
      parts = ['Повторение'];
    }
    return { hash: raw, label: parts.filter(Boolean).join(' · ') };
  };

  /* ---------- Мини-игра «кошка» ---------- */
  const demo = (signal) => {
    const word = { id: 'cat', en: 'cat', ru: 'кошка', pos: 'noun', emoji: code('cat') };
    const ask = 'Что на картинке? Напечатай по-английски.';
    const status = el('p', { class: 's-home__status', 'aria-live': 'polite', dataset: { ws: 'demo-status' }, text: ask });
    const card = el('section', { class: 's-home__demo', dataset: { ws: 'demo' }, 'aria-labelledby': 's-home-demo-title' });
    let misses = 0;
    let unlocked = false;

    const solved = () => {
      card.classList.add('is-solved');
      status.replaceChildren(ui.icon('check'), el('span', null, 'Верно! ', el('b', { lang: 'en', text: word.en }),
        ` — это ${word.ru}. Так и проходят игры.`));
      safe(() => WS.sfx.ok());
      // Говорим только после жеста пользователя и если автопроизношение не выключено.
      const act = navigator.userActivation;
      if (settings().autoplay !== false && (!act || act.hasBeenActive)) safe(() => WS.speech.speak(word.en));
      again.hidden = false;
    };

    // «Ещё раз» после ответа: то же слово заново (нажатие — значит, клавиатуру телефона можно открыть).
    const again = ui.button({
      text: WS.t('btn.again'), icon: 'restart', kind: 'ghost', size: 'sm', keepFocus: true, ws: 'demo-again', signal,
      onClick: () => {
        card.classList.remove('is-solved');
        misses = 0;
        li.setTarget(word.en);
        status.textContent = ask;
        again.hidden = true;
        li.focus();
      },
    });
    again.hidden = true;

    const li = ui.letterInput({
      size: 'word', autofocus: false, signal,
      onLetter: (i, ok) => {
        if (ok || li.done) return;
        misses += 1;
        if (misses >= 3 && !li.revealed) {
          li.reveal(true);
          status.textContent = 'Подсказка: буквы уже в клеточках — напечатай их.';
        } else if (!li.revealed) {
          status.textContent = 'Почти! Нажми на динамик и послушай слово.';
        }
      },
      onComplete: solved,
    });

    // Первое касание мини-игры открывает звук (как «Начать» в игре): потом слово можно сказать вслух.
    card.addEventListener('pointerdown', () => {
      if (unlocked) return;
      unlocked = true;
      safe(() => WS.speech.unlock());
      safe(() => WS.sfx.unlock());
    }, { signal });

    li.setTarget(word.en);
    card.append(
      el('h2', { class: 's-home__demo-title', id: 's-home-demo-title', text: 'Попробуй прямо сейчас' }),
      el('div', { class: 's-home__demo-media' }, ui.picture(word, { size: 'm' }), ui.hint(word.ru)),
      el('div', { class: 's-home__demo-cells' }, li.el),
      el('div', { class: 's-home__demo-actions' },
        ui.speakerButton({ text: word.en, label: 'Послушать слово', signal }), again),
      status);
    return card;
  };

  /* ---------- Первый визит ---------- */
  const firstVisit = (signal) => {
    const hero = el('div', { class: 's-home__hero' },
      el('img', { class: 's-home__logo', src: 'img/app/icon.svg', alt: '', width: 96, height: 96, decoding: 'async' }),
      el('h1', { class: 's-home__name', text: WS.t('app.name') }),
      el('p', { class: 's-home__promise', text: PROMISE }),
      ui.button({
        text: WS.t('btn.start'), iconEnd: 'arrow-right', kind: 'primary', size: 'lg', href: '#/learn', ws: 'begin',
        className: 's-home__cta',
      }),
      el('p', { class: 's-home__note', text: 'Без регистрации — прогресс хранится на этом устройстве.' }));
    const features = el('section', { class: 's-home__about', 'aria-labelledby': 's-home-about-title' },
      el('h2', { class: 's-home__h2', id: 's-home-about-title', text: 'Как это устроено' }),
      el('ul', { class: 's-home__features' }, FEATURES.map((f) => el('li', { class: 's-home__feature' },
        el('span', { class: 's-home__feature-icons', 'aria-hidden': 'true' },
          f.emoji.map((name) => ui.emoji(code(name), { size: 36 }))),
        el('h3', { class: 's-home__feature-title', text: f.title }),
        el('p', { class: 's-home__feature-text', text: f.text })))));
    return { nodes: [el('div', { class: 's-home__top' }, hero, demo(signal)), features] };
  };

  /* ---------- Вернувшийся ученик ---------- */
  const duration = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h ? `${h} ч ${m} мин` : `${m} мин`;
  };

  const statTile = ({ emoji, value, unit, note, ws, accent = false }) => el('li', {
    class: ['s-home__stat', accent && 's-home__stat--accent'], dataset: { ws },
  },
    ui.emoji(code(emoji), { size: 32 }),
    el('span', { class: 's-home__stat-text' },
      el('span', { class: 's-home__stat-value' }, el('b', { text: String(value) }), ` ${unit}`),
      note ? el('span', { class: 's-home__stat-note', text: note }) : null));

  const treeArt = (box, tree) => {
    const fallback = () => box.replaceChildren(ui.emoji(code(tree.stage >= 4 ? 'tree' : 'sprout'), { size: 72 }));
    if (!WS.tree || typeof WS.tree.render !== 'function') {
      fallback();
      return null;
    }
    try {
      const off = WS.tree.render(box, { stage: tree.stage, frac: tree.frac, size: 120, animate: false });
      if (!box.childElementCount) fallback();
      return typeof off === 'function' ? off : null;
    } catch (e) {
      console.warn('WordSprout: дерево на главной не нарисовалось', e);
      fallback();
      return null;
    }
  };

  const returning = () => {
    const st = safe(() => WS.progress.stats(), null) || {};
    const streak = safe(() => WS.progress.streak(), null) || { current: 0, best: 0, today: false };
    const day = (safe(() => WS.progress.days(), null) || {})[todayKey()];
    const minutes = Math.floor(num(day && day.t) / 60);
    const due = (safe(() => WS.progress.due(), []) || []).length;
    const mistakes = (safe(() => WS.progress.mistakes(), []) || []).length;
    const tree = safe(() => WS.progress.tree(), null) || { stage: 1, of: 8, name: 'семечко', frac: 0, left: 5, next: 5 };
    const learned = num(st.learned);
    const target = resumeTarget();

    const welcome = el('div', { class: 's-home__welcome' },
      el('h1', { class: 's-home__title', text: 'С возвращением!' }),
      el('p', { class: 's-home__lead', text: learned ? `Выучено ${words(learned)} — продолжим?` : 'Слова ждут — продолжим?' }),
      ui.button({
        text: WS.t('btn.continue'), iconEnd: 'arrow-right', kind: 'primary', size: 'lg', href: target.hash, ws: 'continue',
        className: 's-home__cta',
      }),
      target.label ? el('p', { class: 's-home__resume', text: target.label }) : null);

    const streakNote = streak.today ? 'Сегодня занятие уже есть'
      : streak.current ? 'Позанимайся сегодня — серия продолжится' : 'Начни новую серию сегодня';
    const stats = el('ul', { class: 's-home__stats' },
      statTile({
        emoji: 'flame', value: num(streak.current), ws: 'streak', note: streakNote, accent: true,
        unit: plural(num(streak.current), ['день подряд', 'дня подряд', 'дней подряд']),
      }),
      statTile({
        emoji: 'clock', value: minutes, ws: 'today', note: `Всего: ${duration(num(st.minutes))}`,
        unit: plural(minutes, ['минута сегодня', 'минуты сегодня', 'минут сегодня']),
      }));

    const review = ui.card({ className: 's-home__review', ws: 'review-card' },
      el('div', { class: 's-home__card-head' },
        ui.emoji(code('repeat'), { size: 40 }),
        el('div', { class: 's-home__card-text' },
          el('h2', { class: 's-home__card-title', text: 'Повторение' }),
          el('p', { class: 's-home__card-line', dataset: { ws: 'due' } },
            due ? `Ждут сегодня: ${words(due)}` : 'Сегодня повторять нечего'),
          mistakes ? el('p', { class: 's-home__card-line', text: `С ошибками: ${words(mistakes)}` }) : null)),
      ui.button({ text: 'К повторению', kind: 'secondary', href: '#/review', iconEnd: 'arrow-right', className: 's-home__more' }));

    const art = el('div', { class: 's-home__tree-art', 'aria-hidden': 'true' });
    const left = num(tree.left);
    const treeNote = tree.next != null ? `До следующей стадии — ещё ${words(left)}`
      : left > 0 ? `До полного урожая — ещё ${words(left)}` : 'Дерево в полной силе!';
    const bar = ui.progressBar({ value: num(tree.frac), max: 1, size: 's', label: 'Путь до следующей стадии' });
    const treeCard = ui.card({ className: 's-home__tree', ws: 'tree-card' },
      art,
      el('div', { class: 's-home__card-text' },
        el('h2', { class: 's-home__card-title', text: 'Твоё дерево' }),
        el('p', { class: 's-home__stage', dataset: { ws: 'stage' }, text: `Стадия ${tree.stage} из ${tree.of || 8} — ${tree.name}` }),
        bar.el,
        el('p', { class: 's-home__card-line', text: treeNote }),
        ui.button({ text: 'Весь прогресс', kind: 'ghost', size: 'sm', href: '#/progress', iconEnd: 'arrow-right',
          className: 's-home__more' })));

    return {
      nodes: [el('div', { class: 's-home__grid' },
        el('div', { class: 's-home__main' }, welcome, stats, review),
        treeCard)],
      after: () => treeArt(art, tree),
    };
  };

  /* ---------- Экран ---------- */
  WS.router.add('/', (view, params, query, extra) => {
    const signal = extra && extra.signal;
    const root = el('section', { class: 's-home', dataset: { ws: 'screen', screen: 'home' } });
    const foot = el('footer', { class: 's-home__foot' },
      el('a', { class: 's-home__site', href: SITE, dataset: { ws: 'site' }, text: '← на сайт' }),
      el('a', { class: 's-home__link', href: '#/about', text: 'О приложении' }));
    view.append(root);
    WS.shell.setTitle('');

    let ac = null;
    let offTree = null;
    let frame = 0;
    const clear = () => {
      if (ac) ac.abort();
      ac = null;
      if (typeof offTree === 'function') safe(offTree);
      offTree = null;
    };
    const paint = () => {
      clear();
      ac = new AbortController();
      const back = isReturning();
      root.dataset.variant = back ? 'returning' : 'first';
      const part = back ? returning() : firstVisit(ac.signal);
      root.replaceChildren(...part.nodes, foot);
      if (part.after) offTree = part.after();
    };
    paint();

    // Новый ответ, импорт, сброс или другая вкладка: первый визит превращается в «вернувшегося» и обратно,
    // а цифры вернувшегося ученика обновляются.
    const off = safe(() => WS.progress.on('change', () => {
      if (frame || (signal && signal.aborted)) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (signal && signal.aborted) return;
        if (isReturning() || root.dataset.variant === 'returning') paint();
      });
    }), null);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (typeof off === 'function') off();
      clear();
    };
  });
})();

/* Рамка игры и каталог игр.
   Маршрут #/play/:level/:setId/:gameId (setId — id главы, mistakes, due, а в тестовом режиме _fixture):
   загрузка js/games/<id>.js и css/games/<id>.css (10 с, иначе карточка с «Повторить») → слова сессии
   (SPEC §3.1) → вступление (data-state=intro) → «Начать»: звук открывается, и игра стартует в том же
   нажатии (data-state=play), поэтому на телефоне сразу открывается клавиатура → ctx.finish() → итоги
   (data-state=done): звёзды, «Без ошибок: X из N», слова с ошибками, выученные слова, рост дерева,
   серия и кнопки «Ещё раз» / «Другая игра» / «Следующая игра». Ошибка — data-state=error.
   Состояние рамки повторяется в WS.test.state. Уйти из игры после первого ответа можно только
   через вопрос «Выйти из игры?» (✕, Esc, кнопка «назад» телефона). Пустой набор mistakes / due
   сразу запускает глобальную игру: она сама показывает пустое состояние.

   WS.games:
   - register(def) — вызывает файл игры: { id, howto, start(host, ctx) → уборка? };
   - load(id) → Promise<def>; meta(id) → запись data/games.json (или скрытая запись _example) | null;
   - list() → включённые игры каталога по порядку; ready() → Promise: каталог загружен.
   ctx — ровно CONTRACTS §3.1 плюс ctx.util = WS.util. ctx.speak(text, { auto: true }) молчит, если
   в настройках выключено автопроизношение. ctx.finish({ extra }): extra — узел, строка или
   { title, head: [...], rows: [[...] | { cells: [...], weak }] } (таблица на экране итогов). */
(() => {
  'use strict';

  const { el, rng: makeRng, shuffle } = WS.util;
  const t = (key, vars) => WS.t(key, vars);
  const test = WS.test;

  const LOAD_MS = 10000;
  const TICK_MS = 5000;
  const IDLE_MS = 60000;
  const ID_RE = /^[a-z_][a-z0-9_-]*$/;
  const LEVELS = ['easy', 'hard'];
  const GLOBAL_SETS = ['mistakes', 'due'];
  const RETRY_CODES = ['timeout', 'network', 'noregister', 'http', 'data', 'start'];
  const EXAMPLE = Object.freeze({
    id: '_example', order: 0, title: 'Пример игры', blurb: 'Образец игры для авторов: картинка и слово по буквам.',
    icon: '1f331', scope: 'chapter', needs: [], minWords: 1, size: 6, enabled: true, hidden: true,
  });
  const STAR_EMOJI = ['muscle', 'thumbs', 'glow', 'trophy'];
  const STAR_FALLBACK = ['1f4aa', '1f44d', '1f31f', '1f3c6'];

  /* ---------- Мелочи ---------- */
  const safe = (fn, fallback) => {
    try {
      const v = fn();
      return v === undefined ? fallback : v;
    } catch (e) {
      return fallback;
    }
  };
  const has = (obj, name) => !!obj && typeof obj[name] === 'function';
  const unique = (arr) => Array.from(new Set(arr));
  const dedupe = (words) => {
    const seen = new Set();
    return words.filter((w) => w && !seen.has(w.id) && seen.add(w.id));
  };
  const isWord = (w) => !!w && typeof w === 'object' && typeof w.id === 'string' && w.id !== '';
  const idList = (fn) => {
    const v = safe(fn, []);
    return Array.isArray(v) ? v.filter((id) => typeof id === 'string' && id) : [];
  };
  const settings = () => safe(() => WS.settings.get(), null) || {};
  const asPromise = (fn) => {
    try {
      return Promise.resolve(fn());
    } catch (e) {
      return Promise.reject(e);
    }
  };
  const fail = (code) => Object.assign(new Error(`WordSprout: ${code}`), { code });
  const getJSON = (url) => fetch(url, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw fail('http');
    return r.json();
  });
  const isTouch = () => (has(WS.ui, 'isTouch') ? !!safe(() => WS.ui.isTouch(), false)
    : !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches));
  const starsFor = (score) => (score >= 0.9 ? 3 : score >= 0.7 ? 2 : score >= 0.4 ? 1 : 0);

  /* ---------- Каталог (data/games.json) ---------- */
  let ownList = null;
  let ownLoad = null;

  const normList = (json) => (Array.isArray(json) ? json : (json && Array.isArray(json.games) ? json.games : []))
    .filter((g) => g && typeof g.id === 'string' && ID_RE.test(g.id));

  const dataList = () => {
    const v = safe(() => WS.data.games(), null);
    return Array.isArray(v) && v.length ? v : null;
  };

  const catalogue = () => (dataList() || ownList || []).slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  const ready = () => {
    if (dataList() || ownList) return Promise.resolve(catalogue());
    if (!ownLoad) {
      ownLoad = getJSON('data/games.json').then((json) => {
        ownList = normList(json);
        return catalogue();
      }, (e) => {
        ownLoad = null;
        throw e;
      });
    }
    return ownLoad;
  };

  const copyMeta = (m) => ({ ...m, needs: Array.isArray(m.needs) ? m.needs.slice() : [] });

  const meta = (id) => {
    if (id === EXAMPLE.id) return copyMeta(EXAMPLE);
    const m = safe(() => WS.data.game(id), null) || catalogue().find((g) => g.id === id);
    return m ? copyMeta(m) : null;
  };

  const list = () => catalogue().filter((g) => g.enabled !== false).map(copyMeta);

  // Запасная проверка «подходит ли слово игре», если WS.data.eligible нет.
  const NEEDS = {
    picture: (w) => !!w.emoji,
    sentence: (w) => !!(w.easy && w.hard),
    verb: (w) => w.pos === 'verb' && Array.isArray(w.drills) && w.drills.length > 0,
    short: (w) => /^[a-z]{1,9}$/.test(String(w.en || '')),
  };

  const eligible = (words, m) => {
    const all = (words || []).filter(isWord);
    if (has(WS.data, 'eligible')) {
      const out = safe(() => WS.data.eligible(all, m), null);
      if (Array.isArray(out)) return out.filter(isWord);
    }
    const needs = (m && m.needs) || [];
    return all.filter((w) => needs.every((n) => !NEEDS[n] || NEEDS[n](w)));
  };

  /* ---------- Загрузка файлов игры ---------- */
  const defs = new Map();
  const waits = new Map(); // id → { promise, done(def) }
  const cssReady = new Set();

  const register = (def) => {
    if (!def || typeof def.id !== 'string' || !ID_RE.test(def.id) || typeof def.start !== 'function') {
      console.warn('WordSprout: игре нужны id и start()', def);
      return;
    }
    defs.set(def.id, def);
    const w = waits.get(def.id);
    if (w) w.done(def);
  };

  const loadScript = (id) => {
    if (defs.has(id)) return Promise.resolve(defs.get(id));
    if (waits.has(id)) return waits.get(id).promise;
    const w = {};
    w.promise = new Promise((resolve, reject) => {
      const script = el('script', { src: `js/games/${id}.js`, dataset: { game: id } });
      let timer = 0;
      const settle = () => {
        clearTimeout(timer);
        if (waits.get(id) === w) waits.delete(id);
      };
      const stop = (code) => {
        settle();
        script.remove();
        reject(fail(code));
      };
      w.done = (def) => {
        settle();
        resolve(def);
      };
      timer = setTimeout(() => stop('timeout'), LOAD_MS);
      // Файл выполнился, но игра не зарегистрировалась (ошибка в коде игры).
      script.addEventListener('load', () => {
        if (!defs.has(id)) stop('noregister');
      }, { once: true });
      script.addEventListener('error', () => stop('network'), { once: true });
      document.head.append(script);
    });
    waits.set(id, w);
    return w.promise;
  };

  // Стили игры: ждём загрузки, но без них игра всё равно запускается.
  const loadCss = (id) => new Promise((resolve) => {
    if (cssReady.has(id)) {
      resolve(true);
      return;
    }
    let link = document.querySelector(`link[data-game-css="${id}"]`);
    if (link && link.sheet) {
      cssReady.add(id);
      resolve(true);
      return;
    }
    if (!link) {
      link = el('link', { rel: 'stylesheet', href: `css/games/${id}.css`, dataset: { gameCss: id } });
      document.head.append(link);
    }
    let timer = 0;
    const finish = (ok) => {
      clearTimeout(timer);
      if (ok) cssReady.add(id);
      else if (!cssReady.has(id)) link.remove();
      resolve(ok);
    };
    link.addEventListener('load', () => finish(true), { once: true });
    link.addEventListener('error', () => finish(false), { once: true });
    timer = setTimeout(() => finish(false), LOAD_MS);
  });

  const load = (id) => {
    if (typeof id !== 'string' || !ID_RE.test(id)) return Promise.reject(fail('badid'));
    return Promise.all([loadScript(id), loadCss(id)]).then(([def]) => def);
  };

  /* ---------- Слова наборов ---------- */
  const wordsOf = (chapterId) => asPromise(() => WS.data.words(chapterId))
    .then((ws) => (Array.isArray(ws) ? ws.filter(isWord) : []));

  const byIds = (ids) => (ids.length ? asPromise(() => WS.data.wordsByIds(ids)) : Promise.resolve([]))
    .then((ws) => (Array.isArray(ws) ? ws.filter(isWord) : []));

  let fixtureLoad = null;
  const fixtureWords = () => {
    if (safe(() => WS.data.chapter('_fixture'), null)) return wordsOf('_fixture');
    if (!test.enabled) return Promise.reject(fail('nochapter'));
    if (!fixtureLoad) {
      fixtureLoad = getJSON('tests/fixtures/fixture.json')
        .then((json) => (Array.isArray(json) ? json : (json && json.words) || []).filter(isWord))
        .catch((e) => {
          fixtureLoad = null;
          throw e;
        });
    }
    return fixtureLoad;
  };

  const globalIds = (setId) => (setId === 'mistakes' ? idList(() => WS.progress.mistakes())
    : unique([...idList(() => WS.progress.due()), ...idList(() => WS.progress.newForReview(10))]));

  // → Promise<{ set, list, all }>: list — слова набора, all — все слова причастных глав (для pool).
  const resolveSet = (setId) => {
    if (setId === '_fixture') {
      return fixtureWords().then((words) => ({
        set: { kind: 'fixture', id: setId, title: t('game.set.fixture') }, list: words, all: words,
      }));
    }
    if (GLOBAL_SETS.includes(setId)) {
      return byIds(globalIds(setId)).then((words) => {
        const chapters = unique(words.map((w) => safe(() => WS.data.chapterOf(w.id), null)).filter(Boolean));
        return Promise.all(chapters.map((c) => wordsOf(c).catch(() => []))).then((lists) => ({
          set: { kind: setId, id: setId, title: t(`game.set.${setId}`) }, list: words, all: dedupe([...words, ...lists.flat()]),
        }));
      });
    }
    const chapter = safe(() => WS.data.chapter(setId), null);
    if (!chapter) return Promise.reject(fail('nochapter'));
    return wordsOf(setId).then((words) => ({
      set: { kind: 'chapter', id: setId, title: String(chapter.ru || chapter.en || setId) }, list: words, all: words,
    }));
  };

  // Все слова курса (отвлекающие варианты для глобальных наборов).
  const everyWord = (extra) => {
    const chapters = safe(() => WS.data.chapters(), []);
    const ids = Array.isArray(chapters) ? chapters.map((c) => c && c.id).filter(Boolean) : [];
    return Promise.all(ids.map((id) => wordsOf(id).catch(() => [])))
      .then((lists) => dedupe([...extra, ...lists.flat()]));
  };

  /* ---------- Выбор слов сессии (SPEC §3.1) ---------- */
  const learned = (id) => !!safe(() => WS.progress.isLearned(id), false);
  const seenOn = (id) => {
    const s = safe(() => WS.progress.word(id), null);
    return s && typeof s.seen === 'string' ? s.seen : '';
  };
  const bySeen = (a, b) => (a === b ? 0 : !a ? -1 : !b ? 1 : a < b ? -1 : 1);

  // Сначала невыученные, затем давно не встречавшиеся (ни разу — первыми); при равенстве — порядок главы.
  const choose = (cands, kind, size, rand) => {
    if (GLOBAL_SETS.includes(kind)) return shuffle(cands.slice(0, size), rand);
    const ranked = cands.map((w, i) => ({ w, i, l: learned(w.id) ? 1 : 0, s: seenOn(w.id) }))
      .sort((a, b) => (a.l - b.l) || bySeen(a.s, b.s) || (a.i - b.i));
    return shuffle(ranked.slice(0, size).map((x) => x.w), rand);
  };

  /* ---------- Предложение слова (запасной вариант, если WS.data.sentence нет) ---------- */
  const tokenize = (str) => {
    const out = [];
    const re = /(\p{L}+(?:['’-]\p{L}+)*)|(\s+)|([^\s\p{L}])/gu;
    let m = re.exec(String(str));
    while (m) {
      out.push({ t: m[0], kind: m[1] ? 'word' : m[2] ? 'space' : 'punct' });
      m = re.exec(String(str));
    }
    return out;
  };

  const sentenceOf = (word, level) => {
    const s = safe(() => WS.data.sentence(word, level), null);
    if (s && Array.isArray(s.tokens)) return s;
    const src = (word && (word[level] || word.easy)) || { en: word ? word.en : '', ru: word ? word.ru : '', answer: '' };
    const tokens = tokenize(src.en);
    const answer = String(src.answer || '').toLowerCase();
    const hit = tokens.find((tok) => tok.kind === 'word' && tok.t.toLowerCase() === answer);
    if (hit) hit.gap = true;
    return { en: src.en, ru: src.ru, answer: src.answer, tokens };
  };

  /* ---------- Мелкие узлы рамки ---------- */
  const ui = () => WS.ui || {};
  const icon = (name, fallback) => WS.shell.icon(name, fallback);
  const button = (opts) => WS.shell.button(opts);

  const emojiNode = (code, size) => {
    if (has(ui(), 'emoji')) {
      const node = safe(() => ui().emoji(code, { size }), null);
      if (node instanceof Node) return node;
    }
    const cps = String(code || '').split('-').map((x) => parseInt(x, 16)).filter((n) => n > 0);
    return el('span', { class: 'ws-emoji', 'aria-hidden': 'true', text: cps.length ? String.fromCodePoint(...cps) : '' });
  };

  const pictureNode = (word, size) => {
    if (has(ui(), 'picture')) {
      const node = safe(() => ui().picture(word, { size }), null);
      if (node instanceof Node) return node;
    }
    return emojiNode(word.emoji, 40);
  };

  const starsNode = (n) => {
    if (has(ui(), 'stars')) {
      const node = safe(() => ui().stars(n, { size: 'l' }), null);
      if (node instanceof Node) return node;
    }
    return el('span', { role: 'img', 'aria-label': t('res.stars', { n }), text: '★'.repeat(n) + '☆'.repeat(3 - n) });
  };

  const badgeNode = (text, kind) => {
    if (has(ui(), 'badge')) {
      const node = safe(() => ui().badge(text, { kind }), null);
      if (node instanceof Node) return node;
    }
    return el('span', { class: ['ws-badge', `ws-badge--${kind}`], text });
  };

  // Своя полоса прогресса: .ws-game__progress в верхней полосе игры занимает всё свободное место.
  const makeProgress = () => {
    const fill = el('span', { class: 'ws-game__progress-fill', style: { width: '0%' } });
    const box = el('span', {
      class: 'ws-game__progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '0', 'aria-valuenow': '0',
      'aria-label': t('game.progressLabel'),
    }, fill);
    return {
      el: box,
      set: (value, total) => {
        const max = Math.max(0, Number(total) || 0);
        const v = Math.max(0, Math.min(max, Number(value) || 0));
        fill.style.width = `${max ? Math.round((100 * v) / max) : 0}%`;
        box.setAttribute('aria-valuemax', String(max));
        box.setAttribute('aria-valuenow', String(v));
      },
    };
  };

  const wordLabel = (w) => (w.pos === 'verb' ? `to ${w.en}` : String(w.en || ''));

  // Строка списка на экране итогов: картинка, слово («to …» у глаголов), перевод, «послушать».
  const wordRow = (w, signal) => {
    let speaker = null;
    if (has(ui(), 'speakerButton')) {
      speaker = safe(() => ui().speakerButton({ text: w.en, key: '', signal, className: 'ws-results__speak' }), null);
    }
    return el('li', { class: 'ws-results__item', dataset: { wordId: w.id } },
      pictureNode(w, 'xs'),
      el('div', { class: 'ws-results__word', style: { flex: '1 1 auto', minWidth: '0' } },
        el('div', { class: 'ws-results__en', lang: 'en' }, el('b', { text: wordLabel(w) })),
        el('div', { class: 'ws-results__ru', text: String(w.ru || '') })),
      speaker instanceof Node ? speaker : null);
  };

  const wordSection = (title, words, signal, ws) => (words.length
    ? el('section', { class: 'ws-results__section', dataset: { ws } },
      el('h3', { class: 'ws-results__subtitle', text: title }),
      el('ul', { class: 'ws-results__list' }, words.map((w) => wordRow(w, signal))))
    : null);

  const cellNode = (value, i) => el(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : null,
    value instanceof Node ? value : String(value == null ? '' : value));

  const rowNode = (row) => {
    const o = Array.isArray(row) ? { cells: row } : row && typeof row === 'object' ? row : { cells: [row] };
    const cells = Array.isArray(o.cells) ? o.cells : [o.label, o.value];
    return el('tr', { class: o.weak ? 'is-weak' : null }, cells.map(cellNode));
  };

  // extra от игры: узел, строка или { title, head, rows } → таблица.
  const extraNode = (extra) => {
    if (extra == null || extra === false || extra === '') return null;
    if (extra instanceof Node) return el('div', { class: 'ws-results__section ws-results__extra' }, extra);
    if (typeof extra === 'string' || typeof extra === 'number') {
      return el('p', { class: 'ws-results__msg ws-results__extra', text: String(extra) });
    }
    if (typeof extra !== 'object' || !Array.isArray(extra.rows)) return null;
    return el('section', { class: 'ws-results__section ws-results__extra' },
      extra.title ? el('h3', { class: 'ws-results__subtitle', text: String(extra.title) }) : null,
      el('table', { class: 'ws-results__table' },
        Array.isArray(extra.head)
          ? el('thead', null, el('tr', null, extra.head.map((c) => el('th', { scope: 'col', text: String(c) }))))
          : null,
        el('tbody', null, extra.rows.map(rowNode))));
  };

  // В progress уходят только данные (узлы DOM и функции отбрасываются).
  const plainData = (extra) => {
    if (extra == null || extra instanceof Node || typeof extra === 'function') return null;
    try {
      return JSON.parse(JSON.stringify(extra));
    } catch (e) {
      return null;
    }
  };

  /* ---------- Рамка игры: маршрут #/play/:level/:setId/:gameId ---------- */
  const mount = (view, params, query, extra) => {
    const gameId = String(params.gameId || '');
    const setId = String(params.setId || '');
    const rawLevel = String(params.level || '');
    const level = LEVELS.includes(rawLevel) ? rawLevel : (safe(() => WS.settings.get().level, 'easy') === 'hard' ? 'hard' : 'easy');
    const globalSet = GLOBAL_SETS.includes(setId);
    const routeAc = new AbortController();
    const signal = routeAc.signal;
    if (extra && extra.signal) {
      if (extra.signal.aborted) routeAc.abort();
      else extra.signal.addEventListener('abort', () => routeAc.abort(), { once: true, signal });
    }
    const on = (target, type, fn, opts = {}) => target.addEventListener(type, fn, { ...opts, signal });
    const offs = [];
    const st = {
      meta: null, def: null, set: null, list: [], cands: [], pool: [], words: [], rand: null, runs: 0,
      session: null, results: null, note: null, all: null, known: new Map(),
    };

    const exitHash = () => (globalSet ? '#/review' : `#/chapter/${level}/${setId}`);
    const leave = () => WS.shell.up(exitHash());

    /* Верхняя полоса: ✕, название, прогресс, счётчик, звук */
    const leaveBtn = el('button', {
      type: 'button', class: 'ws-game__leave', dataset: { ws: 'leave' }, 'aria-label': t('game.leave'), title: t('game.leave'),
    }, icon('close', '✕'));
    const titleEl = el('span', { class: 'ws-game__title' });
    const progress = makeProgress();
    const countEl = el('span', { class: 'ws-game__count', 'aria-hidden': 'true' });
    const soundBtn = el('button', {
      type: 'button', class: 'ws-game__sound', dataset: { ws: 'sound' }, 'aria-label': t('game.sound'),
    });
    const body = el('div', { class: 'ws-game__host' });
    const frame = el('div', { class: 'ws-game', dataset: { ws: 'game', game: gameId, state: 'loading' } },
      el('div', { class: 'ws-game__bar' }, leaveBtn, titleEl, progress.el, countEl, soundBtn), body);
    view.append(el('section', { class: 's-play', dataset: { ws: 'screen', screen: 'play' } }, frame));

    WS.shell.mode('game');
    WS.shell.setBack(exitHash());

    const setState = (s) => {
      frame.dataset.state = s;
      if (test.enabled) {
        test.state = s;
        test.events.push({ type: 'state', state: s, game: gameId });
      }
    };

    const setProgress = (done, total) => {
      progress.set(done, total);
      const n = Math.max(0, Number(total) || 0);
      countEl.textContent = n ? `${Math.min(n, Math.max(0, Number(done) || 0))}/${n}` : '';
    };

    const paintTitle = () => {
      const title = st.meta ? st.meta.title : '';
      titleEl.textContent = title;
      WS.shell.setTitle(title);
    };

    const paintSound = () => {
      const onNow = settings().sound !== false;
      soundBtn.setAttribute('aria-pressed', String(onNow));
      soundBtn.title = t(onNow ? 'game.soundOn' : 'game.soundOff');
      soundBtn.replaceChildren(icon(onNow ? 'speaker' : 'mute', onNow ? '🔊' : '🔇'));
    };

    const paintNote = () => {
      const note = st.note;
      if (!note || !note.isConnected) return;
      const key = { off: 'game.speech.off', novoice: 'game.speech.novoice', blocked: 'game.speech.blocked' }[
        safe(() => WS.speech.status, 'ok')];
      note.hidden = !key;
      note.textContent = key ? t(key) : '';
    };

    on(leaveBtn, 'click', leave);
    on(soundBtn, 'click', () => {
      const onNow = settings().sound !== false;
      safe(() => WS.settings.set({ sound: !onNow }));
      if (onNow === false) safe(() => WS.sfx.unlock());
      paintSound();
    });
    if (has(WS.settings, 'on')) {
      offs.push(safe(() => WS.settings.on(() => {
        paintSound();
        paintNote();
      }), null));
    }
    if (has(WS.speech, 'on')) offs.push(safe(() => WS.speech.on(paintNote), null));
    paintSound();
    setProgress(0, 0);

    /* Уход из игры: вопрос, только если игра не закончена и есть хотя бы один ответ */
    const unfinished = () => !!(st.session && !st.session.finished && st.session.records.size > 0);
    const offGuard = has(WS.router, 'guard') ? WS.router.guard(() => {
      if (!unfinished()) return true;
      return WS.shell.confirm({
        title: t('game.leaveAsk'), text: t('game.leaveText'), ok: t('game.leaveOk'), cancel: t('game.leaveCancel'),
      });
    }) : () => {};

    on(window, 'keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      leave();
    });

    /* Время занятий: каждые 5 с, если вкладка видна, был ввод за последнюю минуту и игра открыта */
    let lastInput = Date.now();
    const touched = () => {
      lastInput = Date.now();
    };
    ['pointerdown', 'keydown', 'input'].forEach((type) => on(window, type, touched, { capture: true, passive: true }));
    const ticker = setInterval(() => {
      if (document.visibilityState !== 'visible' || !frame.isConnected) return;
      if (!['intro', 'play', 'done'].includes(frame.dataset.state) || Date.now() - lastInput > IDLE_MS) return;
      safe(() => WS.progress.tick(TICK_MS / 1000));
    }, TICK_MS);
    signal.addEventListener('abort', () => clearInterval(ticker), { once: true });

    /* Сессия */
    const stopSession = ({ silence = true } = {}) => {
      const s = st.session;
      if (s && !s.stopped) {
        s.stopped = true;
        s.ac.abort();
        if (typeof s.cleanup === 'function') {
          try {
            s.cleanup();
          } catch (e) {
            console.warn('WordSprout: уборка игры', e);
          }
        }
        s.cleanup = null;
        if (s.host) s.host.remove();
        if (silence) safe(() => WS.speech.stop());
      }
      if (st.results) {
        st.results.abort();
        st.results = null;
      }
    };

    const select = () => {
      st.runs += 1;
      st.rand = makeRng(test.enabled ? `${test.seed}:${gameId}:${setId}:${level}:${st.runs}` : undefined);
      const size = Math.max(1, Math.floor(Number(st.meta.size) || 10));
      st.words = choose(st.cands, st.set.kind, size, st.rand);
    };

    // «Ещё раз» в глобальном наборе: список ошибок / повторений уже другой, слова берём из уже загруженных.
    const refreshCands = () => {
      if (!globalSet) return;
      st.cands = eligible(globalIds(setId).map((id) => st.known.get(id)).filter(Boolean), st.meta);
    };

    const allWords = () => {
      if (!st.all) st.all = everyWord([...st.words, ...st.pool]);
      return st.all;
    };

    const record = (own, wordId, ok, opts) => {
      const id = wordId && typeof wordId === 'object' ? wordId.id : wordId;
      if (typeof id !== 'string' || !id || st.session !== own || own.finished || own.records.has(id)) return false;
      const helped = !!(opts && opts.hint);
      const good = !!ok && !helped;
      own.records.set(id, { id, ok: good, hint: helped });
      safe(() => WS.progress.record(id, good, { game: gameId, level, hint: helped }));
      if (test.enabled) test.records.push({ id, ok: good, hint: helped, game: gameId });
      return true;
    };

    const makeCtx = (own) => {
      const live = () => st.session === own && !own.finished && !own.ac.signal.aborted;
      return {
        level,
        set: { ...st.set },
        words: st.words.slice(),
        pool: st.pool.slice(),
        allWords,
        sentence: (word) => sentenceOf(word, level),
        rng: st.rand,
        signal: own.ac.signal,
        speak: (text, opts = {}) => {
          if (!live()) return Promise.resolve(false);
          if (opts && opts.auto && settings().autoplay === false) return Promise.resolve(false);
          return asPromise(() => WS.speech.speak(text, opts)).then((v) => v === true, () => false);
        },
        get canSpeak() {
          return !!safe(() => WS.speech.canSpeak(), false);
        },
        record: (wordId, ok, opts = {}) => record(own, wordId, ok, opts),
        progress: (done, total) => {
          if (st.session === own && !own.finished) setProgress(done, total);
        },
        expect: (value) => {
          if (test.enabled && live()) test.expect = value;
        },
        sfx: WS.sfx,
        finish: (opts = {}) => finish(own, opts ? opts.extra : null),
        exit: () => leave(),
        settings: Object.freeze({ ...settings() }),
        ui: WS.ui,
        util: WS.util,
      };
    };

    // Запуск игры. Вызывается синхронно внутри нажатия «Начать» / «Ещё раз».
    const start = () => {
      stopSession();
      const ac = new AbortController();
      signal.addEventListener('abort', () => ac.abort(), { once: true, signal: ac.signal });
      const own = {
        ac, cleanup: null, records: new Map(), finished: false, stopped: false, t0: Date.now(), host: null,
      };
      st.session = own;
      if (test.enabled) {
        test.records.length = 0;
        test.expect = null;
      }
      own.host = el('div', { class: `g g-${gameId}` });
      body.replaceChildren(own.host);
      setProgress(0, st.words.length);
      const ctx = makeCtx(own);
      setState('play');
      try {
        const cleanup = st.def.start(own.host, ctx);
        if (typeof cleanup === 'function') {
          if (own.stopped) safe(cleanup);
          else own.cleanup = cleanup;
        }
      } catch (e) {
        console.error('WordSprout: игра не запустилась', e);
        if (st.session === own && !own.finished) showError('start');
      }
    };

    const begin = () => {
      safe(() => WS.sfx.unlock());
      safe(() => WS.speech.unlock());
      start();
    };

    /* Следующая игра: для главы — следующая подходящая игра каталога (по кругу),
       для глобальных наборов — переход между «Работой над ошибками» и «Повторением» */
    const nextGame = () => {
      if (globalSet) {
        const [set, id] = setId === 'mistakes' ? ['due', 'srs'] : ['mistakes', 'mistakes'];
        const m = meta(id);
        if (!m || m.enabled === false || !globalIds(set).length) return null;
        return { hash: `#/play/${level}/${set}/${id}`, title: m.title };
      }
      const games = list().filter((g) => g.scope !== 'global');
      const i = games.findIndex((g) => g.id === gameId);
      for (let k = 1; k <= games.length; k++) {
        const g = games[(i + k + games.length) % games.length];
        if (g.id === gameId) continue;
        if (eligible(st.list, g).length >= Math.max(1, Number(g.minWords) || 1)) {
          return { hash: `#/play/${level}/${setId}/${g.id}`, title: g.title };
        }
      }
      return null;
    };

    /* Итоги */
    const showResults = ({ results, total, correct, stars, res, before, extra: more }) => {
      const rs = new AbortController();
      signal.addEventListener('abort', () => rs.abort(), { once: true, signal: rs.signal });
      st.results = rs;
      const rsig = rs.signal;
      const shown = Number.isFinite(res.stars) ? Math.max(0, Math.min(3, res.stars)) : stars;
      const wordsOfIds = (ids) => ids.map((id) => st.known.get(id)).filter(Boolean);
      const wrong = wordsOfIds(results.filter((r) => !r.ok).map((r) => r.id));
      const fresh = wordsOfIds(Array.isArray(res.learnedNow) ? res.learnedNow : []);
      const prevStars = before && Number.isFinite(before.stars) ? before.stars : 0;
      const newBest = total > 0 && prevStars > 0 && shown > prevStars;

      let tree = null;
      if (res.stageUp) {
        const info = safe(() => WS.progress.tree(), null) || {};
        const art = el('div', { class: 'ws-results__art' });
        if (has(WS.tree, 'render')) {
          const off = safe(() => WS.tree.render(art, { stage: info.stage, frac: info.frac, size: 140, animate: true }), null);
          if (typeof off === 'function') rsig.addEventListener('abort', () => safe(off), { once: true });
        }
        tree = el('div', { class: 'ws-results__tree', dataset: { ws: 'stage-up' } }, art,
          el('p', { class: 'ws-results__msg', text: t('res.stageUp', { name: info.name || '' }) }));
      }

      const streak = safe(() => WS.progress.streak(), null);
      const days = streak && Number(streak.current) > 0 ? Number(streak.current) : 0;

      const again = button({
        text: t('game.again'), icon: 'restart', kind: 'primary', ws: 'again', signal: rsig,
        onClick: () => {
          safe(() => WS.sfx.unlock());
          safe(() => WS.speech.unlock());
          refreshCands();
          select();
          start();
        },
      });
      const next = nextGame();
      const nextBtn = button({
        text: t('game.next'), iconEnd: 'arrow-right', kind: 'secondary', ws: 'next-game', signal: rsig,
        title: next ? t('game.nextTitle', { title: next.title }) : '',
        onClick: () => {
          if (next) WS.router.go(next.hash, { replace: true });
        },
      });
      nextBtn.hidden = !next;

      const empty = total === 0;
      const card = el('div', { class: 'ws-results', dataset: { ws: 'results', stars: String(shown) } },
        el('div', { class: 'ws-intro__icon ws-results__icon' },
          emojiNode(WS.shell.emoji(STAR_EMOJI[shown]) || STAR_FALLBACK[shown], 64)),
        el('h2', { class: 'ws-results__title', text: t(empty ? 'game.done' : `res.title${shown}`) }),
        empty ? null : el('div', { class: 'ws-results__stars' }, starsNode(shown)),
        empty ? null : el('p', { class: 'ws-results__score', dataset: { ws: 'score' }, text: t('res.score', { x: correct, n: total }) }),
        el('p', { class: 'ws-results__msg', text: empty ? t('res.empty') : t(correct === total ? 'res.perfect' : `res.sub${shown}`) }),
        newBest ? el('p', { class: 'ws-results__msg ws-results__best', text: t('res.best') }) : null,
        wordSection(t('res.mistakes'), wrong, rsig, 'mistakes-list'),
        wordSection(t('res.learned'), fresh, rsig, 'learned-list'),
        tree,
        extraNode(more),
        days ? el('p', { class: 'ws-results__streak', dataset: { ws: 'streak' } },
          icon('flame', '🔥'), el('span', { text: t('res.streak', { n: days }) })) : null,
        el('div', { class: 'ws-results__actions' }, again,
          button({ text: t('game.exit'), kind: 'secondary', ws: 'exit', signal: rsig, onClick: leave }), nextBtn));
      body.replaceChildren(card);
      window.scrollTo(0, 0);
      setState('done');
      safe(() => WS.sfx.done());
      if (!isTouch()) again.focus({ preventScroll: true });
    };

    const finish = (own, more) => {
      if (st.session !== own || own.finished) return;
      own.finished = true;
      const results = Array.from(own.records.values());
      const total = results.length;
      const correct = results.filter((r) => r.ok).length;
      const score = total ? correct / total : 0;
      const stars = starsFor(score);
      const before = safe(() => WS.progress.best(level, setId, gameId), null);
      let res = null;
      if (total > 0) {
        res = safe(() => WS.progress.finishSession({
          game: gameId, level, setId, setKind: st.set.kind, total, correct, score, stars,
          results: results.map((r) => ({ ...r })), extra: plainData(more), ms: Date.now() - own.t0,
        }), null);
      }
      if (test.enabled) test.expect = null;
      // Последнее слово договаривается: речь не обрываем, только останавливаем саму игру.
      stopSession({ silence: false });
      showResults({ results, total, correct, stars, res: res && typeof res === 'object' ? res : {}, before, extra: more });
    };

    /* Карточка ошибки */
    const showError = (code) => {
      stopSession();
      st.session = null;
      const texts = {
        timeout: ['game.timeout', 'game.errorHint'], network: ['game.error', 'game.errorHint'],
        noregister: ['game.error', null], http: ['game.error', 'game.errorHint'], data: ['game.error', 'game.errorHint'],
        start: ['game.error', null], unknown: ['game.unknown', null], badid: ['game.unknown', null],
        disabled: ['game.disabled', null], nochapter: ['game.noChapter', null], badlevel: ['game.badLevel', null],
        few: ['game.fewWords', null],
      };
      const [main, hint] = texts[code] || texts.data;
      const toLearn = code === 'nochapter' || code === 'badlevel';
      const retry = RETRY_CODES.includes(code);
      body.replaceChildren(el('div', { class: 'ws-error', role: 'alert', dataset: { code } },
        el('p', { text: t(main) }),
        hint ? el('p', { class: 'ws-intro__meta', text: t(hint) }) : null,
        el('div', { class: 'ws-results__actions' },
          retry ? button({ text: t('game.retry'), icon: 'restart', kind: 'primary', ws: 'retry', signal, onClick: () => prepare() }) : null,
          button({
            text: t(toLearn ? 'btn.chapters' : code === 'few' ? 'btn.chapter' : 'btn.back'), kind: retry ? 'secondary' : 'primary',
            signal, onClick: () => (toLearn ? WS.router.go(`#/learn/${level}`) : leave()),
          }))));
      setState('error');
    };

    /* Вступление */
    const showIntro = () => {
      const m = st.meta;
      st.note = el('p', { class: 'ws-intro__note', role: 'status', hidden: true });
      const startBtn = button({
        text: t('game.start'), kind: 'primary', ws: 'start', size: 'lg', className: 'ws-intro__start', key: 'enter', signal,
        onClick: begin,
      });
      body.replaceChildren(el('div', { class: 'ws-intro' },
        el('div', { class: 'ws-intro__icon' }, emojiNode(m.icon, 64)),
        el('h2', { class: 'ws-intro__title', text: m.title }),
        el('p', { class: 'ws-intro__set' }, el('span', { text: st.set.title }), badgeNode(t(`level.${level}`), level)),
        st.def.howto ? el('p', { class: 'ws-intro__howto', text: String(st.def.howto) }) : null,
        el('p', { class: 'ws-intro__meta', text: t('n.words', { n: st.words.length }) }),
        st.note,
        startBtn));
      paintNote();
      setState('intro');
      if (!isTouch()) startBtn.focus({ preventScroll: true });
    };

    /* Загрузка: игра + слова набора (10 с на всё) */
    const prepare = () => {
      stopSession();
      st.session = null;
      setState('loading');
      body.replaceChildren(el('p', { class: 'ws-game__loading', role: 'status', text: t('game.loading') }));
      if (!LEVELS.includes(rawLevel)) {
        showError('badlevel');
        return;
      }
      let timer = 0;
      const timeout = new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(fail('timeout')), LOAD_MS);
      });
      const work = ready().catch(() => null).then(() => {
        const m = meta(gameId);
        if (!m) throw fail('unknown');
        if (m.enabled === false && !test.enabled) throw fail('disabled');
        st.meta = m;
        paintTitle();
        return Promise.all([load(gameId), resolveSet(setId).catch((e) => {
          throw e && e.code ? e : fail('data');
        })]);
      });
      Promise.race([work, timeout]).then(([def, info]) => {
        clearTimeout(timer);
        if (signal.aborted) return;
        st.def = def;
        st.set = info.set;
        st.list = info.list;
        info.all.forEach((w) => st.known.set(w.id, w));
        info.list.forEach((w) => st.known.set(w.id, w));
        st.pool = eligible(info.all, st.meta);
        st.cands = eligible(info.list, st.meta);
        st.all = null;
        if (!st.cands.length && globalSet && st.meta.scope === 'global') {
          select();
          start();
          return;
        }
        if (st.cands.length < Math.max(1, Number(st.meta.minWords) || 1)) {
          showError('few');
          return;
        }
        select();
        showIntro();
      }).catch((e) => {
        clearTimeout(timer);
        if (signal.aborted) return;
        if (!e || !e.code) console.warn('WordSprout: игра не открылась', e);
        showError(e && e.code ? e.code : 'data');
      });
    };

    prepare();
    return () => {
      routeAc.abort();
      stopSession();
      offGuard();
      offs.forEach((off) => {
        if (typeof off === 'function') safe(off);
      });
      if (test.enabled) {
        test.state = '';
        test.expect = null;
      }
    };
  };

  WS.router.add('/play/:level/:setId/:gameId', mount);
  WS.games = { register, load, meta, list, ready };
})();

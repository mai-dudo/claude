/* Данные курса. init() читает data/games.json (массив или { games }) и data/chapters.json. Слова главы
   подгружаются при первом обращении из data/words/<id>.json и кэшируются; одновременные запросы делят
   одну загрузку, неудачная загрузка не кэшируется. Нет файла слов (404) — глава получает статус
   'missing': chapters()/chapter() отдают её с available: false, words(id) отклоняется с code 'http'
   (рамка игры покажет «Не получилось загрузить» с «Повторить»), wordsByIds() её слова пропускает.
   Тестовый набор '_fixture' (tests/fixtures/fixture.json) включается в тестовом режиме (?test=1) и
   когда настоящих глав нет; в списке глав он виден, только если настоящих глав нет. В тестовом режиме
   слова из тестового набора ищутся в нём в первую очередь (глобальные игры играют на нём).
   Для тестов: init({ base: 'путь/к/папке/data/', fixture: true|false }) перечитывает всё заново.
   sentence(word, level) и drill(word, i) делят предложение на токены { t, kind: 'word'|'space'|'punct' }
   и помечают ответ флагом gap: true (у ответа из двух слов — оба слова и пробел между ними).
   eligible(words, meta) оставляет слова, подходящие игре по meta.needs: picture (есть эмодзи),
   sentence (оба предложения, ответ в них есть), short (≤ 9 букв, только буквы), verb (глагол с
   упражнениями); игре pick (и need 'emoji4') нужно ещё не меньше 4 разных картинок. */
(() => {
  'use strict';

  const { norm } = WS.util;
  const EMOJI_RE = /^[0-9a-f]{4,6}(-[0-9a-f]{4,6})*$/;
  const CHAPTER_RE = /^[a-z0-9][a-z0-9-]*$/;
  const WORD_RE = /^[a-z0-9][a-z0-9_-]*$/i;
  const GAME_RE = /^_?[a-z][a-z0-9-]*$/;
  const SHORT_RE = /^[a-z]{1,9}$/i;
  const TOKEN_RE = /([\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*)|(\s+)|([^\s\p{L}\p{N}])/gu;
  const LEVELS = ['easy', 'hard'];
  const TENSES = ['present-simple', 'past-simple', 'present-continuous', 'present-perfect'];
  const FIXTURE_ID = '_fixture';
  const FIXTURE_URL = 'tests/fixtures/fixture.json';
  const GAMES_URL = 'data/games.json';

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (typeof v === 'string' ? v : '');
  const levelOf = (level) => (level === 'hard' ? 'hard' : 'easy');
  const fail = (code, msg, extra) => Object.assign(new Error(`WordSprout: ${msg}`), { code }, extra);

  let base = 'data/';
  let gamesList = [];
  let chapterList = [];
  const chapterMap = new Map(); // id → глава (внутренняя запись)
  const fixture = {
    id: FIXTURE_ID, en: 'Fixture', ru: 'Тестовый набор', emoji: '1f331', order: { easy: 0, hard: 0 }, words: [],
  };
  let fixtureOn = false;
  const cache = new Map(); // chapterId → Promise<Word[]>
  const status = new Map(); // chapterId → 'loading' | 'ready' | 'missing' | 'error'
  const index = new Map(); // wordId → chapterId (настоящие главы)
  const fixIndex = new Set(); // id слов тестового набора
  let initPromise = null;
  let gen = 0; // поколение init(): ответы от прежних вызовов init({ base }) не смешиваются с новыми

  /* ---------- Загрузка ---------- */
  const getJSON = (url) => fetch(url, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) {
      const missing = r.status === 404 || r.status === 410;
      throw fail('http', `${url}: HTTP ${r.status}`, { status: r.status, missing });
    }
    return r.json().catch(() => {
      throw fail('data', `${url}: не JSON`);
    });
  }, () => {
    throw fail('network', `${url}: нет связи`);
  });

  const cleanGames = (json) => (Array.isArray(json) ? json : (isObj(json) && Array.isArray(json.games) ? json.games : []))
    .filter((g) => isObj(g) && typeof g.id === 'string' && GAME_RE.test(g.id))
    .map((g, i) => ({ ...g, order: Number.isFinite(Number(g.order)) ? Number(g.order) : 1000 + i,
      needs: Array.isArray(g.needs) ? g.needs.filter((n) => typeof n === 'string') : [] }));

  const cleanChapters = (json) => {
    const seen = new Set();
    const list = isObj(json) && Array.isArray(json.chapters) ? json.chapters : [];
    return list.filter((c) => isObj(c) && typeof c.id === 'string' && CHAPTER_RE.test(c.id) && !seen.has(c.id)
      && seen.add(c.id))
      .map((c) => {
        const ids = Array.isArray(c.words) ? c.words.filter((id) => typeof id === 'string' && WORD_RE.test(id)) : [];
        const order = {};
        LEVELS.forEach((lv) => {
          const n = isObj(c.order) ? Number(c.order[lv]) : NaN;
          if (Number.isFinite(n)) order[lv] = n;
        });
        return {
          id: c.id, en: str(c.en) || c.id, ru: str(c.ru) || str(c.en) || c.id,
          emoji: typeof c.emoji === 'string' && EMOJI_RE.test(c.emoji) ? c.emoji : null,
          order, words: Array.from(new Set(ids)),
        };
      });
  };

  // Слова из файла: только записи с id/en/ru, в порядке главы (chapters.json), чужие — в конце.
  const cleanWords = (json, chapter) => {
    const raw = Array.isArray(json) ? json : (isObj(json) && Array.isArray(json.words) ? json.words : []);
    const seen = new Set();
    const list = raw.filter((w) => isObj(w) && typeof w.id === 'string' && WORD_RE.test(w.id)
      && typeof w.en === 'string' && typeof w.ru === 'string' && !seen.has(w.id) && seen.add(w.id));
    if (chapter.words.length) {
      const pos = new Map(chapter.words.map((id, i) => [id, i]));
      const at = (w) => (pos.has(w.id) ? pos.get(w.id) : chapter.words.length);
      list.sort((a, b) => at(a) - at(b));
    }
    return list;
  };

  const resetAll = () => {
    gamesList = [];
    chapterList = [];
    chapterMap.clear();
    fixture.words = [];
    fixtureOn = false;
    cache.clear();
    status.clear();
    index.clear();
    fixIndex.clear();
    api.fixture = false;
  };

  const loadGames = (mine) => getJSON(GAMES_URL).then((json) => {
    if (mine === gen) gamesList = cleanGames(json);
  }, (e) => {
    if (mine === gen) gamesList = [];
    console.warn('WordSprout: список игр не загрузился', e);
  });

  const loadChapters = (mine) => getJSON(`${base}chapters.json`).then((json) => cleanChapters(json), (e) => {
    // Нет файла глав (или тестовый режим) — работаем на тестовом наборе; иначе пусть boot покажет «Повторить».
    if (!(e && e.missing) && !WS.test.enabled) throw e;
    if (!(e && e.missing)) console.warn('WordSprout: список глав не загрузился', e);
    return [];
  }).then((list) => {
    if (mine !== gen) return;
    chapterList = list;
    chapterMap.clear();
    index.clear();
    chapterList.forEach((c) => {
      chapterMap.set(c.id, c);
      c.words.forEach((id) => {
        if (!index.has(id)) index.set(id, c.id);
      });
    });
  });

  const init = (opts) => {
    const o = isObj(opts) ? opts : {};
    const again = 'base' in o || 'fixture' in o;
    if (initPromise && !again) return initPromise;
    if (again) {
      resetAll();
      const b = typeof o.base === 'string' && o.base && !/^([a-z][a-z0-9+.-]*:|\/)/i.test(o.base) ? o.base : 'data/';
      base = b.endsWith('/') ? b : `${b}/`;
    }
    gen += 1;
    const mine = gen;
    const want = typeof o.fixture === 'boolean' ? o.fixture : null;
    const run = Promise.all([loadGames(mine), loadChapters(mine)]).then(() => {
      if (mine !== gen) return undefined;
      fixtureOn = want === null ? (WS.test.enabled || !chapterList.length) : want;
      api.fixture = fixtureOn;
      if (!fixtureOn) return undefined;
      return words(FIXTURE_ID).then(() => undefined, () => undefined);
    });
    const done = run.catch((e) => {
      if (initPromise === done) initPromise = null;
      throw e;
    });
    initPromise = done;
    return done;
  };

  /* ---------- Главы и слова ---------- */
  const rec = (id) => (id === FIXTURE_ID ? (fixtureOn ? fixture : null) : chapterMap.get(id) || null);

  const copyChapter = (c) => {
    const st = status.get(c.id) || 'idle';
    return {
      id: c.id, en: c.en, ru: c.ru, emoji: c.emoji, order: { ...c.order }, words: c.words.slice(),
      count: c.words.length, status: st, available: st !== 'missing',
    };
  };

  const orderOf = (c, level, i) => (Number.isFinite(c.order[level]) ? c.order[level] : 100000 + i);

  const chapters = (level) => {
    const lv = levelOf(level);
    const list = chapterList.length ? chapterList : (fixtureOn ? [fixture] : []);
    return list.map((c, i) => ({ c, i }))
      .sort((a, b) => (orderOf(a.c, lv, a.i) - orderOf(b.c, lv, b.i)) || (a.i - b.i))
      .map(({ c }) => copyChapter(c));
  };

  const chapter = (id) => {
    const c = rec(String(id == null ? '' : id));
    return c ? copyChapter(c) : null;
  };

  const chapterStatus = (chapterId) => {
    const id = String(chapterId == null ? '' : chapterId);
    return rec(id) ? status.get(id) || 'idle' : 'none';
  };

  const words = (chapterId) => {
    const id = String(chapterId == null ? '' : chapterId);
    const c = rec(id);
    if (!c) return Promise.reject(fail('nochapter', `нет главы «${id}»`));
    if (!cache.has(id)) {
      status.set(id, 'loading');
      const mine = gen;
      const url = id === FIXTURE_ID ? FIXTURE_URL : `${base}words/${id}.json`;
      const p = getJSON(url).then((json) => {
        const list = cleanWords(json, c);
        if (mine !== gen) return list;
        if (id === FIXTURE_ID) {
          c.words = list.map((w) => w.id);
          list.forEach((w) => fixIndex.add(w.id));
        } else {
          list.forEach((w) => {
            if (!index.has(w.id)) index.set(w.id, id);
          });
        }
        status.set(id, 'ready');
        return list;
      });
      cache.set(id, p);
      p.catch((e) => {
        if (cache.get(id) !== p) return;
        cache.delete(id);
        status.set(id, e && e.missing ? 'missing' : 'error');
        console.warn(`WordSprout: слова главы «${id}» не загрузились`, e);
      });
    }
    return cache.get(id).then((list) => list.slice());
  };

  const chapterOf = (wordId) => {
    const id = String(wordId == null ? '' : wordId);
    if (fixtureOn && fixIndex.has(id)) return FIXTURE_ID;
    return index.get(id) || null;
  };

  const wordsByIds = (ids) => {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id)));
    const groups = new Map();
    list.forEach((id) => {
      const c = chapterOf(id);
      if (!c) return;
      if (!groups.has(c)) groups.set(c, new Set());
      groups.get(c).add(id);
    });
    return Promise.all(Array.from(groups.keys()).map((c) => words(c).then((ws) => [c, ws], () => [c, []])))
      .then((pairs) => {
        const found = new Map();
        pairs.forEach(([c, ws]) => ws.forEach((w) => {
          if (groups.get(c).has(w.id) && !found.has(w.id)) found.set(w.id, w);
        }));
        return list.map((id) => found.get(id)).filter(Boolean);
      });
  };

  /* ---------- Предложения ---------- */
  const tokenize = (text) => {
    const out = [];
    const s = String(text == null ? '' : text);
    TOKEN_RE.lastIndex = 0;
    let m = TOKEN_RE.exec(s);
    while (m) {
      out.push({ t: m[0], kind: m[1] ? 'word' : m[2] ? 'space' : 'punct' });
      m = TOKEN_RE.exec(s);
    }
    return out;
  };

  const wordsOf = (text) => tokenize(text).filter((tok) => tok.kind === 'word').map((tok) => norm(tok.t));

  // Ищет ответ (одно или несколько слов подряд, между ними только пробелы) и ставит gap: true.
  const markGap = (tokens, answer) => {
    const need = wordsOf(answer);
    if (!need.length) return false;
    for (let i = 0; i < tokens.length; i += 1) {
      let k = 0;
      let j = i;
      while (j < tokens.length && k < need.length) {
        const tok = tokens[j];
        if (tok.kind === 'word' && norm(tok.t) === need[k]) {
          k += 1;
          j += 1;
          if (k < need.length && j < tokens.length && tokens[j].kind === 'space') j += 1;
        } else {
          break;
        }
      }
      if (k === need.length) {
        for (let x = i; x < j; x += 1) tokens[x].gap = true;
        return true;
      }
    }
    return false;
  };

  const levelSentence = (word, lv) => (isObj(word) && isObj(word[lv]) && typeof word[lv].en === 'string' && word[lv].en.trim()
    ? word[lv] : null);

  const sentence = (word, level) => {
    const lv = levelOf(level);
    const w = isObj(word) ? word : {};
    const src = levelSentence(w, lv) || levelSentence(w, lv === 'hard' ? 'easy' : 'hard');
    const en = src ? src.en : str(w.en);
    const ru = src ? str(src.ru) : str(w.ru);
    const answer = src ? str(src.answer) || str(w.en) : str(w.en);
    const tokens = tokenize(en);
    markGap(tokens, answer);
    return { en, ru, answer, tokens, level: lv };
  };

  const validDrill = (d) => isObj(d) && typeof d.en === 'string' && d.en.split('___').length === 2
    && typeof d.answer === 'string' && d.answer.trim() !== '';
  const drillList = (word) => (isObj(word) && Array.isArray(word.drills) ? word.drills : []).filter(validDrill);

  // drill(word, i | 'past-simple') → { tense, en (с ответом), ru, answer, tokens, template (с ___), index }.
  const drill = (word, which) => {
    const all = isObj(word) && Array.isArray(word.drills) ? word.drills : [];
    const byTense = typeof which === 'string' && !/^\d+$/.test(which);
    const i = byTense ? all.findIndex((d) => isObj(d) && d.tense === which) : Math.floor(Number(which));
    const d = Number.isInteger(i) && i >= 0 ? all[i] : null;
    if (!validDrill(d)) return null;
    const [before, after] = d.en.split('___');
    const answer = d.answer.trim();
    const gap = tokenize(answer).map((tok) => ({ ...tok, gap: true }));
    const tokens = [...tokenize(before), ...gap, ...tokenize(after)];
    return {
      tense: str(d.tense), en: `${before}${answer}${after}`, ru: str(d.ru), answer, tokens, template: d.en, index: i,
    };
  };

  // Упражнения уровня: Easy — три первых времени, Hard — все четыре (в порядке TENSES).
  const tenses = (level) => (levelOf(level) === 'hard' ? TENSES.slice() : TENSES.slice(0, 3));
  const drills = (word, level) => {
    const all = isObj(word) && Array.isArray(word.drills) ? word.drills : [];
    return tenses(level).map((tense) => all.findIndex((d) => isObj(d) && d.tense === tense))
      .filter((i) => i >= 0).map((i) => drill(word, i)).filter(Boolean);
  };

  /* ---------- Игры ---------- */
  const copyGame = (g) => ({ ...g, needs: g.needs.slice() });
  const games = () => gamesList.slice().sort((a, b) => a.order - b.order).map(copyGame);
  const game = (id) => {
    const g = gamesList.find((x) => x.id === id);
    return g ? copyGame(g) : null;
  };

  const hasSentence = (w, lv) => {
    const s = levelSentence(w, lv);
    if (!s || typeof s.answer !== 'string' || !s.answer.trim()) return false;
    return markGap(tokenize(s.en), s.answer);
  };

  const NEEDS = {
    picture: (w) => typeof w.emoji === 'string' && EMOJI_RE.test(w.emoji),
    sentence: (w) => LEVELS.every((lv) => hasSentence(w, lv)),
    short: (w) => SHORT_RE.test(str(w.en)),
    verb: (w) => w.pos === 'verb' && drillList(w).length > 0,
  };

  const eligible = (list, meta) => {
    const needs = isObj(meta) && Array.isArray(meta.needs) ? meta.needs : [];
    const out = (Array.isArray(list) ? list : []).filter((w) => isObj(w) && typeof w.id === 'string' && w.id
      && needs.every((n) => !NEEDS[n] || NEEDS[n](w)));
    const distinct = needs.includes('emoji4') || (isObj(meta) && meta.id === 'pick');
    if (distinct && new Set(out.map((w) => w.emoji).filter(Boolean)).size < 4) return [];
    return out;
  };

  const api = {
    init, chapters, chapter, words, wordsByIds, chapterOf, status: chapterStatus, sentence, drill, drills, tenses,
    tokenize, games, game, eligible, fixture: false,
  };
  WS.data = api;
})();

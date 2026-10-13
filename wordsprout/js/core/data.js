/* Заглушка: данные курса. init() читает data/games.json и data/chapters.json; если главы ещё не готовы
   (или включён тестовый режим), подключает tests/fixtures/fixture.json как набор '_fixture'.
   Слова глав подгружаются по требованию из data/words/<id>.json и кэшируются. */
(() => {
  'use strict';

  const FIXTURE = {
    id: '_fixture', en: 'Fixture', ru: 'Тестовый набор', emoji: '1f331',
    order: { easy: 0, hard: 0 }, words: [],
  };

  let gamesList = [];
  let chapterList = [];
  let fixtureOn = false;
  const wordCache = new Map(); // chapterId → Promise<Word[]>
  const wordIndex = new Map(); // wordId → chapterId

  const getJSON = (url) => fetch(url, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  });

  const loadFixture = () => {
    const p = getJSON('tests/fixtures/fixture.json').then((json) => {
      FIXTURE.words = json.words.map((w) => w.id);
      json.words.forEach((w) => wordIndex.set(w.id, '_fixture'));
      return json.words;
    });
    wordCache.set('_fixture', p);
    return p;
  };

  const init = () => Promise.all([
    getJSON('data/games.json').then((json) => { gamesList = Array.isArray(json) ? json : json.games || []; }),
    getJSON('data/chapters.json').then((json) => {
      chapterList = json.chapters || [];
      chapterList.forEach((c) => c.words.forEach((id) => wordIndex.set(id, c.id)));
    }).catch(() => { chapterList = []; }),
  ]).then(() => {
    if (!WS.test.enabled && chapterList.length) return null;
    fixtureOn = true;
    return loadFixture();
  });

  // Тестовый набор виден в списке глав, только когда настоящих глав ещё нет.
  const chapters = (level = 'easy') => (chapterList.length ? chapterList : fixtureOn ? [FIXTURE] : [])
    .slice()
    .sort((a, b) => ((a.order && a.order[level]) || 0) - ((b.order && b.order[level]) || 0));

  const chapter = (id) => (fixtureOn && id === '_fixture' ? FIXTURE : chapterList.find((c) => c.id === id) || null);

  const words = (chapterId) => {
    if (!wordCache.has(chapterId)) {
      if (!chapter(chapterId)) return Promise.reject(new Error(`Нет главы ${chapterId}`));
      const p = getJSON(`data/words/${chapterId}.json`).then((json) => json.words || []);
      wordCache.set(chapterId, p);
      p.catch(() => wordCache.delete(chapterId));
    }
    return wordCache.get(chapterId);
  };

  const chapterOf = (wordId) => wordIndex.get(wordId) || null;

  const wordsByIds = (ids) => {
    const need = [...new Set(ids.map(chapterOf).filter(Boolean))];
    return Promise.all(need.map((id) => words(id).catch(() => []))).then((lists) => {
      const all = new Map();
      lists.flat().forEach((w) => all.set(w.id, w));
      return ids.map((id) => all.get(id)).filter(Boolean);
    });
  };

  const tokenize = (str) => {
    const out = [];
    const re = /(\p{L}+(?:['’-]\p{L}+)*)|(\s+)|([^\s\p{L}])/gu;
    let m;
    while ((m = re.exec(String(str))) !== null) {
      out.push({ t: m[0], kind: m[1] ? 'word' : m[2] ? 'space' : 'punct' });
    }
    return out;
  };

  const sentence = (word, level = 'easy') => {
    const s = word[level] || word.easy || { en: word.en, ru: word.ru, answer: word.en };
    const tokens = tokenize(s.en);
    const answer = String(s.answer || '').toLowerCase();
    const hit = tokens.find((tok) => tok.kind === 'word' && tok.t.toLowerCase() === answer);
    if (hit) hit.gap = true;
    return { en: s.en, ru: s.ru, answer: s.answer, tokens };
  };

  const games = () => gamesList.slice().sort((a, b) => a.order - b.order);
  const game = (id) => gamesList.find((g) => g.id === id) || null;

  const NEEDS = {
    picture: (w) => !!w.emoji,
    sentence: (w) => !!(w.easy && w.hard),
    verb: (w) => w.pos === 'verb' && Array.isArray(w.drills) && w.drills.length > 0,
    short: (w) => /^[a-z]{1,9}$/.test(w.en),
  };

  const eligible = (list, meta) => {
    const needs = (meta && meta.needs) || [];
    return list.filter((w) => needs.every((n) => !NEEDS[n] || NEEDS[n](w)));
  };

  WS.data = {
    init, chapters, chapter, words, wordsByIds, chapterOf, sentence, tokenize, games, game, eligible,
  };
})();

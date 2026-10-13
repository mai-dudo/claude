/* Заглушка: рамка игры. Маршрут #/play/:level/:setId/:gameId: подгружает js/games/<id>.js и
   css/games/<id>.css (10 с на загрузку, иначе карточка с «Повторить»), собирает слова сессии,
   показывает вступление, по «Начать» запускает игру в том же нажатии, а после ctx.finish() — итоги.
   Состояние рамки: [data-ws=game][data-state=loading|intro|play|done|error], копия в WS.test.state. */
(() => {
  'use strict';

  const { el, q, rng: makeRng, shuffle } = WS.util;
  const defs = new Map();
  const waiting = new Map(); // id → { resolve, reject, timer }
  const loading = new Map(); // id → Promise<def>

  const register = (def) => {
    defs.set(def.id, def);
    const w = waiting.get(def.id);
    if (w) {
      clearTimeout(w.timer);
      waiting.delete(def.id);
      w.resolve(def);
    }
  };

  const meta = (id) => WS.data.game(id) || (id === '_example'
    ? { id, order: 0, title: 'Пример игры', blurb: '', icon: '1f331', scope: 'chapter', needs: [], minWords: 1,
      size: 10, enabled: true }
    : null);

  const load = (id) => {
    if (defs.has(id)) return Promise.resolve(defs.get(id));
    if (loading.has(id)) return loading.get(id);
    const p = new Promise((resolve, reject) => {
      const script = el('script', { src: `js/games/${id}.js` });
      let timer = 0;
      const fail = (msg) => {
        clearTimeout(timer);
        waiting.delete(id);
        loading.delete(id);
        script.remove();
        reject(new Error(msg));
      };
      timer = setTimeout(() => fail(`Игра ${id} не загрузилась за 10 с.`), 10000);
      waiting.set(id, { resolve, timer });
      if (!q(`link[data-game-css="${id}"]`)) {
        document.head.append(el('link', { rel: 'stylesheet', href: `css/games/${id}.css`, dataset: { gameCss: id } }));
      }
      script.addEventListener('error', () => fail(`Не получилось загрузить игру ${id}.`));
      document.head.append(script);
    });
    loading.set(id, p);
    return p;
  };

  const starsFor = (score) => (score >= 0.9 ? 3 : score >= 0.7 ? 2 : score >= 0.4 ? 1 : 0);

  const resolveSet = (setId) => {
    if (setId === 'mistakes' || setId === 'due') {
      const ids = setId === 'mistakes' ? WS.progress.mistakes() : [...WS.progress.due(), ...WS.progress.newForReview(10)];
      return WS.data.wordsByIds(ids).then((list) => ({
        set: { kind: setId, id: setId, title: setId === 'mistakes' ? 'Работа над ошибками' : 'Повторение' }, list,
      }));
    }
    const chapter = WS.data.chapter(setId);
    if (!chapter) return Promise.reject(new Error(`Нет набора ${setId}`));
    return WS.data.words(setId).then((list) => ({
      set: { kind: setId === '_fixture' ? 'fixture' : 'chapter', id: setId, title: chapter.ru }, list,
    }));
  };

  const mount = (view, { level: lvl, setId, gameId }) => {
    const level = lvl === 'hard' ? 'hard' : 'easy';
    const route = new AbortController();
    let session = null; // { ac, cleanup, records: Map, finished, t0 }
    let def = null;
    let words = [];
    let pool = [];
    let setInfo = null;
    const m = meta(gameId);
    const allowed = m && (m.enabled !== false || WS.test.enabled) && (gameId !== '_example' || WS.test.enabled);

    const frame = el('div', { class: 'ws-game', dataset: { ws: 'game', game: gameId, state: 'loading' } });
    const barFill = el('span', { class: 'ws-game__progress-fill', style: { width: '0%' } });
    const titleEl = el('span', { class: 'ws-game__title', text: m ? m.title : gameId });
    const bar = el('div', { class: 'ws-game__bar' },
      el('button', {
        type: 'button', class: 'ws-game__leave', dataset: { ws: 'leave' }, 'aria-label': WS.t('game.leave'),
        html: (WS.ui.icons || {}).close || '✕', onclick: () => leave(),
      }),
      titleEl,
      el('span', { class: 'ws-game__progress' }, barFill));
    const body = el('div', { class: 'ws-game__host' });
    frame.append(bar, body);
    view.append(el('section', { class: 's-play', dataset: { ws: 'screen', screen: 'play' } }, frame));

    WS.shell.tabbar(false); // в игре вместо стрелки шапки — ✕ в верхней полосе игры
    const exitHash = () => (setId === 'mistakes' || setId === 'due' ? '#/review' : `#/chapter/${level}/${setId}`);

    const setState = (s) => {
      frame.dataset.state = s;
      if (WS.test.enabled) {
        WS.test.state = s;
        WS.test.events.push({ type: 'state', state: s, game: gameId });
      }
    };

    const setProgress = (done, total) => {
      const frac = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
      barFill.style.width = `${Math.round(frac * 100)}%`;
    };

    const stopSession = () => {
      if (!session) return;
      session.ac.abort();
      if (typeof session.cleanup === 'function') {
        try { session.cleanup(); } catch (e) { console.warn(e); }
      }
      session.cleanup = null;
    };

    function leave() {
      const go = () => WS.router.go(exitHash());
      if (session && !session.finished && session.records.size > 0) {
        WS.shell.confirm({ title: WS.t('game.leaveAsk'), text: WS.t('game.leaveText') }).then((yes) => { if (yes) go(); });
      } else {
        go();
      }
    }

    const showError = (msg) => {
      stopSession();
      setState('error');
      body.replaceChildren(el('div', { class: 'ws-error', role: 'alert' },
        el('p', { text: msg || WS.t('game.error') }),
        el('button', {
          type: 'button', class: 'ws-btn ws-btn--primary', dataset: { ws: 'retry' }, text: WS.t('game.retry'),
          onclick: () => prepare(),
        })));
    };

    const nextGameId = () => {
      const list = WS.data.games().filter((g) => g.enabled !== false && g.scope === 'chapter');
      const i = list.findIndex((g) => g.id === gameId);
      const next = list[(i + 1) % list.length];
      return next ? next.id : gameId;
    };

    const showResults = (extra) => {
      const results = words.map((w) => {
        const r = session.records.get(w.id);
        return { id: w.id, ok: !!(r && r.ok && !r.hint), hint: !!(r && r.hint) };
      });
      const total = words.length;
      const correct = results.filter((r) => r.ok).length;
      const score = total ? correct / total : 0;
      const stars = starsFor(score);
      const summary = {
        game: gameId, level, setId, setKind: setInfo.kind, total, correct, score, stars, results,
        extra: extra || null, ms: Date.now() - session.t0,
      };
      const res = WS.progress.finishSession(summary) || { stars };
      stopSession();
      setState('done');
      const btn = (ws, kind, text, onclick) => el('button', {
        type: 'button', class: `ws-btn ws-btn--${kind}`, dataset: { ws }, text, onclick,
      });
      const starText = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
      body.replaceChildren(el('div', { class: 'ws-results', dataset: { ws: 'results' } },
        el('h2', { class: 'ws-results__title', text: WS.t('game.done') }),
        el('p', { class: 'ws-results__stars', 'aria-label': `Звёзды: ${res.stars} из 3`, text: starText }),
        el('p', { class: 'ws-results__score', text: WS.t('game.score', { x: correct, n: total }) }),
        el('div', { class: 'ws-results__actions' },
          btn('again', 'primary', WS.t('game.again'), () => startPlay()),
          btn('exit', 'secondary', WS.t('game.exit'), () => WS.router.go(exitHash())),
          btn('next-game', 'secondary', WS.t('game.next'),
            () => WS.router.go(`#/play/${level}/${setId}/${nextGameId()}`)))));
    };

    function startPlay() {
      stopSession();
      const ac = new AbortController();
      route.signal.addEventListener('abort', () => ac.abort(), { once: true });
      session = { ac, cleanup: null, records: new Map(), finished: false, t0: Date.now() };
      const own = session;
      if (WS.test.enabled) {
        WS.test.records.length = 0;
        WS.test.expect = null;
      }
      const seed = WS.test.enabled ? WS.test.seed : undefined;
      const host = el('div', { class: `g g-${gameId}` });
      body.replaceChildren(host);
      setProgress(0, words.length);
      setState('play');
      const ctx = {
        level,
        set: setInfo,
        words,
        pool,
        allWords: () => Promise.all(WS.data.chapters(level).map((c) => WS.data.words(c.id).catch(() => [])))
          .then((lists) => lists.flat()),
        sentence: (w) => WS.data.sentence(w, level),
        rng: makeRng(seed),
        signal: ac.signal,
        speak: (text, opts) => WS.speech.speak(text, opts).catch(() => false),
        get canSpeak() { return WS.speech.canSpeak(); },
        record(wordId, ok, { hint = false } = {}) {
          if (own !== session || own.finished || own.records.has(wordId)) return;
          own.records.set(wordId, { id: wordId, ok: !!ok, hint: !!hint });
          WS.progress.record(wordId, !!ok && !hint, { game: gameId, level, hint: !!hint });
          if (WS.test.enabled) WS.test.records.push({ id: wordId, ok: !!ok, hint: !!hint, game: gameId });
        },
        progress: (done, total) => { if (own === session) setProgress(done, total); },
        expect: (value) => { if (WS.test.enabled && own === session) WS.test.expect = value; },
        sfx: WS.sfx,
        finish: ({ extra } = {}) => {
          if (own !== session || own.finished) return;
          own.finished = true;
          showResults(extra);
        },
        exit: () => WS.router.go(exitHash()),
        settings: Object.freeze(WS.settings.get()),
        ui: WS.ui,
        util: WS.util,
      };
      try {
        session.cleanup = def.start(host, ctx) || null;
      } catch (e) {
        console.warn(e);
        showError(WS.t('game.error'));
      }
    }

    const showIntro = () => {
      setState('intro');
      const speechNote = WS.speech.canSpeak() ? null : el('p', { class: 'ws-intro__note', text: WS.t('game.noSpeech') });
      body.replaceChildren(el('div', { class: 'ws-intro' },
        el('h2', { class: 'ws-intro__title', text: m.title }),
        el('p', { class: 'ws-intro__howto', text: def.howto || '' }),
        speechNote,
        el('button', {
          type: 'button', class: 'ws-btn ws-btn--primary ws-intro__start', dataset: { ws: 'start' },
          text: WS.t('game.start'),
          onclick: () => {
            WS.speech.unlock();
            startPlay();
          },
        })));
    };

    function prepare() {
      setState('loading');
      body.replaceChildren(el('p', { class: 'ws-game__loading', text: WS.t('game.loading') }));
      if (!allowed) {
        showError('Такой игры нет.');
        return;
      }
      Promise.all([load(gameId), resolveSet(setId)]).then(([d, info]) => {
        if (route.signal.aborted) return;
        def = d;
        setInfo = info.set;
        pool = WS.data.eligible(info.list, m);
        const seed = WS.test.enabled ? `${WS.test.seed}:${gameId}` : undefined;
        words = shuffle(pool, makeRng(seed)).slice(0, m.size || 10);
        if (!words.length && (setInfo.kind === 'mistakes' || setInfo.kind === 'due')) startPlay();
        else showIntro();
      }).catch((e) => {
        if (!route.signal.aborted) showError(e && e.message);
      });
    }

    prepare();
    return () => {
      route.abort();
      stopSession();
    };
  };

  WS.router.add('/play/:level/:setId/:gameId', mount);
  WS.games = { register, load, meta };
})();

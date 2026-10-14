/* Прогресс ученика (ключ 'wordsprout.v1.progress', формат — CONTRACTS §3.2, правила — SPEC §5).
   - record(id, ok, { game, level, hint }) — один ответ: счётчики слова и дня, список ошибок, «выучено»
     (ok в двух разных играх или «Помню» в srs), Лейтнер для srs. Никогда не бросает исключений.
   - Ошибки: любой ok:false открывает (m += 1); закрывает только верный с первой попытки ответ в игре
     mistakes. mistakes() — по приоритету: больше ошибок, затем давнее открытые.
   - Повторение: коробки 1–5, интервалы [1, 3, 7, 14, 30] дней. Выученное слово попадает в коробку 1
     (на завтра); «Помню» → следующая коробка, «Не помню» → коробка 1 и в ошибки. due() — к повторению
     на дату; newForReview(n) — выученные, но ни разу не повторённые, не больше 10 новых в день.
   - finishSession(сводка CONTRACTS §4) → { learnedNow, stageUp, stage, stars, best }: занятие дня,
     серия, лучший результат «уровень:набор:игра», слова, выученные за эту сессию, рост дерева.
   - Дни — только местные даты; серия — подряд идущие дни занятий до сегодня (или до вчера).
     tick(сек) — время занятий за сегодня.
   - tree(): 8 стадий по выученным словам (0, 5, 20, 50, 100, 175, 275, 400), frac — путь до следующей
     (на последней — до 600).
   - Запись в хранилище откладывается на 300 мс и сразу делается при уходе со страницы; изменения из
     другой вкладки перечитываются. События on('learned' | 'stage' | 'change', fn) → отписка.
   - reset() не трогает настройки; exportJSON()/importJSON(str) → { ok, error } — перенос прогресса. */
(() => {
  'use strict';

  const { todayKey, addDays } = WS.util;
  const KEY = 'wordsprout.v1.progress';
  const SAVE_MS = 300;
  const INTERVALS = [1, 3, 7, 14, 30];
  const NEW_PER_DAY = 10;
  const STAGES = [0, 5, 20, 50, 100, 175, 275, 400];
  const FULL = 600;
  const NAMES = ['семечко', 'росток', 'побег', 'саженец', 'молодое дерево', 'дерево', 'цветущее дерево',
    'дерево с плодами'];
  const SLACK_MS = 2000;
  const MAX_TICK = 60;
  const MAX_IMPORT = 10 * 1024 * 1024;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
  const GAME_RE = /^_?[a-z][a-z0-9-]{0,31}$/;
  const SET_RE = /^_?[a-z0-9][a-z0-9-]{0,63}$/;
  const BEST_RE = /^(easy|hard):_?[a-z0-9][a-z0-9-]{0,63}:_?[a-z][a-z0-9-]{0,31}$/;

  /* ---------- Проверка и очистка данных ---------- */
  const dict = () => Object.create(null);
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const int = (v, max = Number.MAX_SAFE_INTEGER) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };
  const num = (v, max = Number.MAX_SAFE_INTEGER) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  };
  const day10 = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : '');
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  const fresh = () => ({ v: 1, words: dict(), best: dict(), days: dict(), streakBest: 0, last: '', newToday: dict() });
  const blank = () => ({ s: 0, c: 0, w: 0, g: [], m: 0, box: 0, due: '', seen: '', L: '', r: '' });

  const cleanWord = (w) => {
    if (!isObj(w)) return null;
    const out = {
      s: int(w.s), c: int(w.c), w: int(w.w),
      g: Array.from(new Set((Array.isArray(w.g) ? w.g : []).filter((g) => typeof g === 'string' && GAME_RE.test(g)))),
      m: int(w.m), box: int(w.box, 5), due: day10(w.due), seen: day10(w.seen), L: day10(w.L), r: day10(w.r),
    };
    // Выученное слово всегда в системе повторения: нет коробки — коробка 1, срок — день после изучения.
    if (out.L && !out.box) {
      out.box = 1;
      out.due = addDays(out.L, INTERVALS[0]);
    }
    if (!out.box) out.due = '';
    else if (!out.due) out.due = todayKey();
    if (out.m > 0) out.mt = Number.isFinite(Number(w.mt)) ? Number(w.mt) : 0;
    return out;
  };

  const cleanState = (data) => {
    if (!isObj(data) || data.v !== 1 || !isObj(data.words)) return null;
    const st = fresh();
    Object.keys(data.words).forEach((id) => {
      const w = ID_RE.test(id) ? cleanWord(data.words[id]) : null;
      if (w) st.words[id] = w;
    });
    if (isObj(data.best)) {
      Object.keys(data.best).forEach((k) => {
        const b = data.best[k];
        if (!BEST_RE.test(k) || !isObj(b)) return;
        st.best[k] = { stars: int(b.stars, 3), score: num(b.score, 1), n: int(b.n), last: day10(b.last) };
      });
    }
    if (isObj(data.days)) {
      Object.keys(data.days).forEach((k) => {
        const d = data.days[k];
        if (!DATE_RE.test(k) || !isObj(d)) return;
        st.days[k] = { a: int(d.a), c: int(d.c), n: int(d.n), t: num(d.t) };
      });
    }
    st.streakBest = int(data.streakBest);
    st.last = typeof data.last === 'string' && data.last.startsWith('#/') ? data.last.slice(0, 200) : '';
    if (isObj(data.newToday)) {
      Object.keys(data.newToday).forEach((k) => {
        if (DATE_RE.test(k)) st.newToday[k] = int(data.newToday[k]);
      });
    }
    st.streakBest = Math.max(st.streakBest, longestRun(st.days));
    return st;
  };

  /* ---------- Серия ---------- */
  const practicedIn = (days, key) => !!days[key] && days[key].n > 0;

  // Самая длинная цепочка дней занятий подряд (для лучшей серии после импорта/загрузки).
  const longestRun = (days) => {
    const keys = Object.keys(days).filter((k) => practicedIn(days, k)).sort();
    let top = 0;
    let run = 0;
    let prev = '';
    keys.forEach((k) => {
      run = prev && addDays(prev, 1) === k ? run + 1 : 1;
      top = Math.max(top, run);
      prev = k;
    });
    return top;
  };

  /* ---------- Состояние и запись ---------- */
  const load = () => {
    const data = WS.store.get(KEY, null);
    if (data == null) return fresh();
    const st = cleanState(data);
    if (st) return st;
    WS.store.quarantine(KEY); // JSON читается, но это не прогресс — откладываем копию и начинаем заново
    return fresh();
  };

  let state = load();
  let dirty = false;
  let timer = 0;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (!dirty) return true;
    dirty = false;
    return WS.store.set(KEY, state);
  };

  const scheduleSave = () => {
    dirty = true;
    if (!timer) {
      timer = setTimeout(() => {
        timer = 0;
        flush();
      }, SAVE_MS);
    }
  };

  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  /* ---------- События ---------- */
  const listeners = new Map();
  const emit = (event, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    Array.from(set).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('WordSprout: ошибка в подписчике прогресса', e);
      }
    });
  };
  const on = (event, fn) => {
    if (typeof fn !== 'function') return () => {};
    const name = String(event);
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name).add(fn);
    return () => {
      const set = listeners.get(name);
      if (set) set.delete(fn);
    };
  };

  /* ---------- Слова ---------- */
  const learnedAt = new Map(); // id → время, когда слово стало выученным (только в этой вкладке)
  let lastFinish = Date.now();

  const entry = (id) => {
    if (!state.words[id]) state.words[id] = blank();
    return state.words[id];
  };
  const word = (id) => {
    const w = state.words[String(id)];
    return w ? { ...w, g: w.g.slice() } : blank();
  };
  const isLearned = (id) => {
    const w = state.words[String(id)];
    return !!(w && w.L);
  };
  const learnedCount = () => Object.keys(state.words).filter((id) => state.words[id].L).length;

  const learnedIn = (chapterId) => {
    const c = WS.data && typeof WS.data.chapter === 'function' ? WS.data.chapter(chapterId) : null;
    if (c && Array.isArray(c.words)) return c.words.filter(isLearned).length;
    if (!WS.data || typeof WS.data.chapterOf !== 'function') return 0;
    return Object.keys(state.words).filter((id) => state.words[id].L && WS.data.chapterOf(id) === chapterId).length;
  };

  const day = (key) => {
    if (!state.days[key]) state.days[key] = { a: 0, c: 0, n: 0, t: 0 };
    return state.days[key];
  };

  const stageOf = (n) => {
    let stage = 1;
    STAGES.forEach((min, i) => {
      if (n >= min) stage = i + 1;
    });
    return stage;
  };

  // Новое для повторения: выучено, ни разу не повторялось и ещё не подошло по сроку.
  const isNew = (w, today) => !!w.L && !w.r && !(w.box > 0 && w.due && w.due <= today);

  const countNew = (today) => {
    Object.keys(state.newToday).forEach((k) => {
      if (k !== today) delete state.newToday[k];
    });
    state.newToday[today] = (state.newToday[today] || 0) + 1;
  };

  // Шаг Лейтнера: «Помню» → следующая коробка, «Не помню» → коробка 1; срок — сегодня + интервал коробки.
  const leitner = (w, remembered, today) => {
    if (isNew(w, today)) countNew(today);
    w.box = remembered ? Math.min(INTERVALS.length, w.box + 1) : 1;
    w.due = addDays(today, INTERVALS[w.box - 1]);
    w.r = today;
  };

  const afterLearned = (id) => {
    const n = learnedCount();
    learnedAt.set(id, Date.now());
    emit('learned', { id, learned: n });
    const stage = stageOf(n);
    if (stage > stageOf(n - 1)) emit('stage', { stage, name: NAMES[stage - 1], learned: n });
  };

  const record = (wordId, ok, opts) => {
    try {
      const id = typeof wordId === 'string' ? wordId : (isObj(wordId) && typeof wordId.id === 'string' ? wordId.id : '');
      if (!ID_RE.test(id)) return false;
      const o = isObj(opts) ? opts : {};
      const game = typeof o.game === 'string' && GAME_RE.test(o.game) ? o.game : '';
      const good = !!ok && !o.hint;
      const today = todayKey();
      const w = entry(id);
      w.s += 1;
      w.seen = today;
      if (good) {
        w.c += 1;
        if (game && !w.g.includes(game)) w.g.push(game);
      } else {
        w.w += 1;
        if (!w.m) w.mt = Date.now();
        w.m += 1;
      }
      if (good && game === 'mistakes') {
        w.m = 0;
        delete w.mt;
      }
      let learnedNow = false;
      if (game === 'srs') {
        if (good && !w.L) {
          w.L = today;
          learnedNow = true;
        }
        leitner(w, good, today);
      } else if (!w.L && w.g.length >= 2) {
        w.L = today;
        learnedNow = true;
        if (!w.box) {
          w.box = 1;
          w.due = addDays(today, INTERVALS[0]);
        }
      }
      const d = day(today);
      d.a += 1;
      if (good) d.c += 1;
      scheduleSave();
      if (learnedNow) afterLearned(id);
      emit('change', { type: 'record', id, ok: good });
      return true;
    } catch (e) {
      console.error('WordSprout: ответ не записан', e);
      return false;
    }
  };

  const review = (wordId, remembered) => record(wordId, !!remembered, { game: 'srs' });

  /* ---------- Списки ---------- */
  const mistakes = () => Object.keys(state.words).filter((id) => state.words[id].m > 0)
    .sort((a, b) => {
      const wa = state.words[a];
      const wb = state.words[b];
      return (wb.m - wa.m) || ((wa.mt || 0) - (wb.mt || 0)) || cmp(a, b);
    });

  const clearMistakes = () => {
    let n = 0;
    Object.keys(state.words).forEach((id) => {
      const w = state.words[id];
      if (w.m > 0) n += 1;
      w.m = 0;
      delete w.mt;
    });
    if (n) {
      scheduleSave();
      emit('change', { type: 'mistakes' });
    }
    return n;
  };

  const due = (dateKey) => {
    const key = typeof dateKey === 'string' && DATE_RE.test(dateKey) ? dateKey : todayKey();
    return Object.keys(state.words).filter((id) => {
      const w = state.words[id];
      return w.box > 0 && !!w.due && w.due <= key;
    }).sort((a, b) => {
      const wa = state.words[a];
      const wb = state.words[b];
      return cmp(wa.due, wb.due) || (wa.box - wb.box) || cmp(a, b);
    });
  };

  const newForReview = (limit) => {
    const today = todayKey();
    const left = Math.max(0, NEW_PER_DAY - (state.newToday[today] || 0));
    const want = limit == null || !Number.isFinite(Number(limit)) ? NEW_PER_DAY : Math.max(0, Math.floor(Number(limit)));
    const n = Math.min(left, want);
    if (!n) return [];
    return Object.keys(state.words).filter((id) => isNew(state.words[id], today))
      .sort((a, b) => cmp(state.words[a].L, state.words[b].L) || cmp(a, b))
      .slice(0, n);
  };

  // Ближайшая дата повторения после сегодняшнего дня ('' — повторять нечего).
  const nextDue = () => {
    const today = todayKey();
    return Object.keys(state.words).map((id) => state.words[id])
      .filter((w) => w.box > 0 && w.due > today)
      .reduce((min, w) => (!min || w.due < min ? w.due : min), '');
  };

  /* ---------- Дни, серия, время ---------- */
  const days = () => {
    const out = {};
    Object.keys(state.days).sort().forEach((k) => {
      out[k] = { ...state.days[k] };
    });
    return out;
  };

  const currentStreak = (today) => {
    let key = practicedIn(state.days, today) ? today : addDays(today, -1);
    let n = 0;
    while (practicedIn(state.days, key)) {
      n += 1;
      key = addDays(key, -1);
    }
    return n;
  };

  const streak = () => {
    const today = todayKey();
    const current = currentStreak(today);
    return { current, best: Math.max(state.streakBest, current), today: practicedIn(state.days, today) };
  };

  const tick = (seconds) => {
    try {
      const n = Number(seconds);
      if (!Number.isFinite(n) || n <= 0) return;
      const d = day(todayKey());
      d.t = Math.round((d.t + Math.min(MAX_TICK, n)) * 10) / 10;
      scheduleSave();
      emit('change', { type: 'tick' });
    } catch (e) {
      console.error('WordSprout: время занятий не записано', e);
    }
  };

  /* ---------- Дерево ---------- */
  const tree = () => {
    const learned = learnedCount();
    const stage = stageOf(learned);
    const from = STAGES[stage - 1];
    const next = stage < STAGES.length ? STAGES[stage] : null;
    const to = next == null ? FULL : next;
    const frac = Math.max(0, Math.min(1, (learned - from) / (to - from)));
    return {
      stage, of: STAGES.length, name: NAMES[stage - 1], next, frac, learned, from,
      left: Math.max(0, to - learned),
    };
  };

  /* ---------- Итоги сессии ---------- */
  const starsFor = (score) => (score >= 0.9 ? 3 : score >= 0.7 ? 2 : score >= 0.4 ? 1 : 0);
  const bestKey = (level, setId, gameId) => {
    const key = `${level}:${setId}:${gameId}`;
    return (level === 'easy' || level === 'hard') && typeof setId === 'string' && SET_RE.test(setId)
      && typeof gameId === 'string' && GAME_RE.test(gameId) ? key : '';
  };

  const best = (level, setId, gameId) => {
    const b = state.best[bestKey(level, setId, gameId)];
    return b ? { ...b } : { stars: 0, score: 0, n: 0, last: '' };
  };

  const finishSession = (summary) => {
    const s = isObj(summary) ? summary : {};
    const now = Date.now();
    const today = todayKey();
    let out = null;
    try {
      const results = (Array.isArray(s.results) ? s.results : []).filter((r) => isObj(r) && typeof r.id === 'string');
      const total = Number(s.total) > 0 ? Math.floor(Number(s.total)) : results.length;
      const correct = Number.isFinite(Number(s.correct)) && s.correct !== null
        ? Math.min(total, int(s.correct)) : results.filter((r) => r.ok && !r.hint).length;
      const score = total ? correct / total : 0;
      const stars = Number.isInteger(s.stars) && s.stars >= 0 && s.stars <= 3 ? s.stars : starsFor(score);
      const ms = Number(s.ms);
      const since = s.ms != null && Number.isFinite(ms) && ms >= 0 ? now - ms - SLACK_MS : lastFinish;

      const ids = Array.from(new Set(results.map((r) => r.id)));
      const learnedNow = ids.filter((id) => learnedAt.has(id) && learnedAt.get(id) >= since && isLearned(id));
      const during = Array.from(learnedAt.values()).filter((t) => t >= since).length;
      const n = learnedCount();
      const stage = stageOf(n);
      const stageUp = stage > stageOf(Math.max(0, n - during));
      learnedAt.clear();
      lastFinish = now;

      let saved = null;
      if (total > 0) {
        day(today).n += 1;
        const key = bestKey(s.level, s.setId, s.game);
        if (key) {
          const prev = state.best[key] || { stars: 0, score: 0, n: 0, last: '' };
          state.best[key] = {
            stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score), n: prev.n + 1, last: today,
          };
          saved = { ...state.best[key] };
        }
        state.streakBest = Math.max(state.streakBest, currentStreak(today));
        dirty = true;
        flush();
        WS.store.persist();
      }
      out = { learnedNow, stageUp, stage, stars, best: saved || best(s.level, s.setId, s.game) };
    } catch (e) {
      console.error('WordSprout: итоги сессии не записаны', e);
      out = { learnedNow: [], stageUp: false, stage: tree().stage, stars: 0, best: { stars: 0, score: 0, n: 0, last: '' } };
    }
    emit('change', { type: 'finish' });
    return out;
  };

  /* ---------- Статистика ---------- */
  const totalWords = () => {
    const list = WS.data && typeof WS.data.chapters === 'function' ? WS.data.chapters() : [];
    const n = (Array.isArray(list) ? list : []).reduce((sum, c) => sum + (c && Array.isArray(c.words) ? c.words.length : 0), 0);
    return n || FULL;
  };

  const stats = () => {
    let answers = 0;
    let correct = 0;
    let sessions = 0;
    let seconds = 0;
    let practiced = 0;
    Object.keys(state.days).forEach((k) => {
      const d = state.days[k];
      answers += d.a;
      correct += d.c;
      sessions += d.n;
      seconds += d.t;
      if (d.n > 0) practiced += 1;
    });
    correct = Math.min(correct, answers);
    return {
      learned: learnedCount(), total: totalWords(), seen: Object.keys(state.words).length,
      days: practiced, seconds: Math.round(seconds), minutes: Math.floor(seconds / 60), sessions,
      answers, correct, wrong: answers - correct, accuracy: answers ? correct / answers : 0,
      streak: streak(), mistakes: mistakes().length, due: due().length, tree: tree(),
    };
  };

  /* ---------- Последний экран, сброс, перенос ---------- */
  const last = () => state.last;
  const setLast = (hash) => {
    const h = typeof hash === 'string' ? hash.trim() : '';
    if (!h.startsWith('#/') || h.length > 200 || /\/_/.test(h) || state.last === h) return;
    state.last = h;
    scheduleSave();
  };

  const reset = () => {
    state = fresh();
    learnedAt.clear();
    dirty = true;
    flush();
    emit('change', { type: 'reset' });
  };

  const exportJSON = () => JSON.stringify({
    app: 'wordsprout', kind: 'progress', exported: new Date().toISOString(),
    v: state.v, words: state.words, best: state.best, days: state.days, streakBest: state.streakBest,
    last: state.last, newToday: state.newToday,
  });

  const importJSON = (text) => {
    const bad = { ok: false, error: 'Это не файл прогресса WordSprout.' };
    if (typeof text !== 'string' || !text.trim()) return bad;
    if (text.length > MAX_IMPORT) return { ok: false, error: 'Файл слишком большой для файла прогресса.' };
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'Файл не читается: он повреждён или это не JSON.' };
    }
    if (!isObj(data) || (data.app !== undefined && data.app !== 'wordsprout')) return bad;
    if (typeof data.v === 'number' && data.v > 1) {
      return { ok: false, error: 'Файл сохранён более новой версией WordSprout. Обнови страницу и попробуй снова.' };
    }
    const st = cleanState(data);
    if (!st) return bad;
    state = st;
    learnedAt.clear();
    dirty = true;
    flush();
    emit('change', { type: 'import' });
    return { ok: true, error: null, words: Object.keys(st.words).length, learned: learnedCount() };
  };

  // Другая вкладка записала прогресс — перечитываем (её данные новее).
  WS.store.onExternalChange((key) => {
    if (key !== null && key !== KEY) return;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    dirty = false;
    state = load();
    learnedAt.clear();
    emit('change', { type: 'external' });
  });

  WS.progress = {
    record, finishSession, word, isLearned, learnedCount, learnedIn, mistakes, clearMistakes, due, newForReview,
    nextDue, review, days, tick, streak, stats, tree, best, last, setLast, reset, exportJSON, importJSON, on, flush,
  };
})();

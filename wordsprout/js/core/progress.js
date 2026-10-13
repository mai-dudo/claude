/* Заглушка: прогресс ученика, пока только в памяти. Все функции из CONTRACTS на месте и возвращают
   простые значения. Правила SPEC §5 и сохранение в 'wordsprout.v1.progress' напишет владелец файла. */
(() => {
  'use strict';

  const { todayKey } = WS.util;
  const STAGES = [0, 5, 20, 50, 100, 175, 275, 400];
  const NAMES = ['семечко', 'росток', 'побег', 'саженец', 'молодое дерево', 'дерево', 'цветущее дерево',
    'дерево с плодами'];

  const fresh = () => ({ v: 1, words: {}, best: {}, days: {}, streakBest: 0, last: '', newToday: {} });
  let state = fresh();
  const listeners = { learned: new Set(), stage: new Set(), change: new Set() };
  const emit = (event, payload) => (listeners[event] || []).forEach((fn) => fn(payload));

  const word = (id) => state.words[id] || { s: 0, c: 0, w: 0, g: [], m: 0, box: 0, due: '', seen: '', L: '', r: '' };
  const isLearned = (id) => !!(state.words[id] && state.words[id].L);
  const learnedCount = () => Object.values(state.words).filter((w) => w.L).length;
  const learnedIn = (chapterId) => Object.keys(state.words)
    .filter((id) => isLearned(id) && WS.data.chapterOf(id) === chapterId).length;

  const day = (key = todayKey()) => {
    if (!state.days[key]) state.days[key] = { a: 0, c: 0, n: 0, t: 0 };
    return state.days[key];
  };

  const record = (wordId, ok, { game } = {}) => {
    const w = { ...word(wordId) };
    w.s += 1;
    w.seen = todayKey();
    if (ok) {
      w.c += 1;
      if (game && !w.g.includes(game)) w.g = [...w.g, game];
    } else {
      w.w += 1;
      w.m = 1;
    }
    state.words[wordId] = w;
    const d = day();
    d.a += 1;
    if (ok) d.c += 1;
    emit('change');
  };

  const starsFor = (score) => (score >= 0.9 ? 3 : score >= 0.7 ? 2 : score >= 0.4 ? 1 : 0);

  const tree = () => {
    const learned = learnedCount();
    let stage = 1;
    STAGES.forEach((min, i) => { if (learned >= min) stage = i + 1; });
    const next = stage < 8 ? STAGES[stage] : null;
    const from = STAGES[stage - 1];
    const frac = next == null ? 1 : (learned - from) / (next - from);
    return { stage, of: 8, name: NAMES[stage - 1], next, frac, learned };
  };

  const finishSession = (summary) => {
    const stars = summary.stars != null ? summary.stars : starsFor(summary.score || 0);
    const key = `${summary.level}:${summary.setId}:${summary.game}`;
    const prev = state.best[key] || { stars: 0, score: 0, n: 0, last: '' };
    state.best[key] = {
      stars: Math.max(prev.stars, stars), score: Math.max(prev.score, summary.score || 0), n: prev.n + 1,
      last: todayKey(),
    };
    day().n += 1;
    emit('change');
    return { learnedNow: [], stageUp: false, stage: tree().stage, stars, best: state.best[key] };
  };

  const mistakes = () => Object.keys(state.words).filter((id) => state.words[id].m > 0);
  const clearMistakes = () => {
    Object.values(state.words).forEach((w) => { w.m = 0; });
    emit('change');
  };
  const due = (key = todayKey()) => Object.keys(state.words)
    .filter((id) => state.words[id].due && state.words[id].due <= key);
  const newForReview = () => [];
  const review = (wordId, remembered) => record(wordId, remembered, { game: 'srs' });

  const days = () => state.days;
  const tick = (seconds) => { day().t += seconds; };
  const streak = () => {
    const today = !!(state.days[todayKey()] && state.days[todayKey()].n > 0);
    return { current: today ? 1 : 0, best: Math.max(state.streakBest, today ? 1 : 0), today };
  };
  const stats = () => {
    const all = Object.values(state.days);
    const correct = all.reduce((sum, d) => sum + d.c, 0);
    const answers = all.reduce((sum, d) => sum + d.a, 0);
    return {
      learned: learnedCount(), days: all.filter((d) => d.n > 0).length, seconds: all.reduce((s, d) => s + d.t, 0),
      correct, answers, accuracy: answers ? correct / answers : 0, streak: streak(),
    };
  };
  const best = (level, setId, gameId) => {
    const b = state.best[`${level}:${setId}:${gameId}`];
    return b ? { stars: b.stars, score: b.score } : { stars: 0, score: 0 };
  };
  const last = () => state.last;
  const setLast = (hash) => { state.last = hash; };
  const reset = () => {
    state = fresh();
    emit('change');
  };
  const exportJSON = () => JSON.stringify(state);
  const importJSON = (str) => {
    try {
      const data = JSON.parse(str);
      if (!data || data.v !== 1 || typeof data.words !== 'object') return { ok: false, error: 'Неверный файл' };
      state = { ...fresh(), ...data };
      emit('change');
      return { ok: true, error: null };
    } catch (e) {
      return { ok: false, error: 'Файл не читается' };
    }
  };
  const on = (event, fn) => {
    if (!listeners[event]) listeners[event] = new Set();
    listeners[event].add(fn);
    return () => listeners[event].delete(fn);
  };

  WS.progress = {
    record, finishSession, word, isLearned, learnedCount, learnedIn, mistakes, clearMistakes, due, newForReview,
    review, days, tick, streak, stats, tree, best, last, setLast, reset, exportJSON, importJSON, on,
  };
})();

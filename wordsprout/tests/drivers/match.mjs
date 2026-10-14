/* Драйвер игры «Найди пары» (match) для tests/smoke.mjs (CONTRACTS §3.7).
   playRound: WS.test.expect — id слов текущего раунда; для каждого ещё не найденного слова нажимает
   картинку [data-ws=pair][data-side=pic][data-word-id], затем слово [data-side=word] с тем же id,
   после раунда — «Дальше», и так до итогов. Перед каждым нажатием ждёт, пока доска не занята
   (после неверной пары ввод на миг закрыт: .g-match__board[data-busy="1"]).
   makeMistake: сначала составляет неверную пару (картинка первого слова + слово второго), потом
   доигрывает верно. */
export const id = 'match';

const BOARD = '.g-match__board';
const NEXT = '.g-match [data-ws=next]';
const pair = (side, wordId) => `.g-match [data-ws=pair][data-side=${side}][data-word-id="${wordId}"]`;

const snapshot = (page) => page.evaluate(({ boardSel, nextSel }) => {
  const board = document.querySelector(boardSel);
  const next = document.querySelector(nextSel);
  const picked = board ? board.querySelector('[data-ws=pair].is-picked') : null;
  return {
    state: WS.test.state,
    round: board ? board.dataset.round || '' : '',
    next: !!next && !next.hidden,
    picked: picked ? { side: picked.dataset.side, id: picked.dataset.wordId } : null,
  };
}, { boardSel: BOARD, nextSel: NEXT });

// Доска свободна (или игра уже не идёт).
const idle = (page) => page.waitForFunction((boardSel) => {
  if (WS.test.state !== 'play') return true;
  const board = document.querySelector(boardSel);
  return !!board && board.dataset.busy !== '1';
}, BOARD);

const isMatched = (page, wordId) => page.evaluate((sel) => {
  const b = document.querySelector(sel);
  return !b || b.getAttribute('aria-disabled') === 'true';
}, pair('pic', wordId));

const roundDone = (page) => page.waitForFunction((nextSel) => {
  const btn = document.querySelector(nextSel);
  return WS.test.state !== 'play' || (!!btn && !btn.hidden);
}, NEXT);

const newRound = (page, prev) => page.waitForFunction(({ p, boardSel }) => {
  if (WS.test.state !== 'play') return true;
  const board = document.querySelector(boardSel);
  return !!board && board.dataset.round !== p && WS.test.expect != null;
}, { p: prev, boardSel: BOARD });

export async function playRound(page, h) {
  for (let i = 0; i < 50; i++) {
    const s = await snapshot(page);
    if (s.state !== 'play') break;
    if (s.next) {
      await h.tap(NEXT);
      await newRound(page, s.round);
      continue;
    }
    // Чужой выбор снимаем повторным нажатием, чтобы первая пара не вышла неверной.
    if (s.picked) {
      await idle(page);
      await h.tap(pair(s.picked.side, s.picked.id));
    }
    const ids = await h.expect(null);
    for (const wordId of ids) {
      await idle(page);
      if (await isMatched(page, wordId)) continue;
      await h.tap(pair('pic', wordId));
      await h.tap(pair('word', wordId));
    }
    await roundDone(page);
  }
  await h.waitState('done');
}

export async function makeMistake(page, h) {
  const ids = await h.expect(null);
  if (Array.isArray(ids) && ids.length >= 2) {
    await idle(page);
    await h.tap(pair('pic', ids[0]));
    await h.tap(pair('word', ids[1]));
    await idle(page);
  }
  await playRound(page, h);
}

/* Драйвер игры-образца «Пример игры» (_example) для tests/smoke.mjs: печатает каждое слово сессии
   (правильный ответ — из WS.test.expect), а makeMistake сначала вводит одну неверную букву. */
export const id = '_example';

const state = (page) => page.evaluate(() => WS.test.state);

const currentWord = (page) => page.evaluate(() => {
  const item = document.querySelector('.g-_example__item');
  return item ? item.dataset.wordId || '' : '';
});

// Ждёт следующего слова (другой data-word-id) или конца игры.
const nextWord = (page, prev) => page.waitForFunction((p) => {
  if (WS.test.state !== 'play') return true;
  const item = document.querySelector('.g-_example__item');
  return !!item && item.dataset.wordId !== p;
}, prev);

export const playRound = async (page, h) => {
  for (let i = 0; i < 100 && (await state(page)) === 'play'; i++) {
    const answer = await h.expect(null);
    const word = await currentWord(page);
    await h.type(answer);
    await nextWord(page, word);
  }
  await h.waitState('done');
};

export const makeMistake = async (page, h) => {
  const answer = await h.expect(null);
  await h.type(answer[0] === 'z' ? 'q' : 'z');
  await playRound(page, h);
};

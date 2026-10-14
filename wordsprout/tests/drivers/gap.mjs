/* Драйвер игры «Вставь слово» (gap) для tests/smoke.mjs (CONTRACTS §3.7): в каждом предложении печатает
   пропущенное слово (правильный ответ — из WS.test.expect) и ждёт следующего предложения (другой
   data-word-id у .g-gap__item) или конца игры. makeMistake сначала вводит одну неверную букву в первом
   предложении (его слово получит ok:false), потом доигрывает правильно. */
export const id = 'gap';

const ITEM = '.g-gap__item';

const state = (page) => page.evaluate(() => WS.test.state);

const currentWord = (page) => page.evaluate((sel) => {
  const item = document.querySelector(sel);
  return item ? item.dataset.wordId || '' : '';
}, ITEM);

// Ждёт следующего предложения или конца игры.
const nextWord = (page, prev) => page.waitForFunction(({ sel, p }) => {
  if (WS.test.state !== 'play') return true;
  const item = document.querySelector(sel);
  return !!item && item.dataset.wordId !== p;
}, { sel: ITEM, p: prev });

// Буква, которой точно нет в начале ответа.
const wrongLetter = (answer) => {
  const first = (String(answer).toLowerCase().match(/[a-z]/) || ['a'])[0];
  return first === 'z' ? 'q' : 'z';
};

export async function playRound(page, h) {
  for (let i = 0; i < 100 && (await state(page)) === 'play'; i++) {
    const word = await currentWord(page);
    const answer = await h.expect(null);
    if (answer == null || (await state(page)) !== 'play') break;
    await h.type(String(answer));
    await nextWord(page, word);
  }
  await h.waitState('done');
}

export async function makeMistake(page, h) {
  const answer = await h.expect(null);
  await h.type(wrongLetter(answer));
  await playRound(page, h);
}

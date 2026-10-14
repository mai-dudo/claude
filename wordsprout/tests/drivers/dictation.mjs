/* Драйвер игры «Диктант» (dictation) для tests/smoke.mjs (CONTRACTS §3.7). На каждое предложение сессии
   печатает правильный ответ из WS.test.expect (всё предложение; пробелы и знаки в клеточках стоят заранее,
   печатать их можно — они пропускаются) и ждёт следующего предложения (другой data-item у
   .g-dictation__item) или конца игры. makeMistake сначала вводит одну неверную букву в первом предложении
   (это слово получит ok:false), потом доигрывает правильно. */
export const id = 'dictation';

const ITEM = '.g-dictation__item';

const state = (page) => page.evaluate(() => WS.test.state);

const itemKey = (page) => page.evaluate((sel) => {
  const item = document.querySelector(sel);
  return item ? item.dataset.item || '' : '';
}, ITEM);

// Ждёт следующего предложения или конца игры.
const nextItem = (page, prev) => page.waitForFunction(({ sel, p }) => {
  if (WS.test.state !== 'play') return true;
  const item = document.querySelector(sel);
  return !!item && item.dataset.item !== p;
}, { sel: ITEM, p: prev });

// Буква, которой точно нет в начале ответа.
const wrongLetter = (answer) => {
  const first = (String(answer).toLowerCase().match(/[a-z]/) || ['a'])[0];
  return first === 'z' ? 'q' : 'z';
};

export async function playRound(page, h) {
  for (let i = 0; i < 100 && (await state(page)) === 'play'; i++) {
    const key = await itemKey(page);
    const answer = await h.expect(null);
    if (answer == null || (await state(page)) !== 'play') break;
    await h.type(String(answer));
    await nextItem(page, key);
  }
  await h.waitState('done');
}

export async function makeMistake(page, h) {
  const answer = await h.expect(null);
  await h.type(wrongLetter(answer));
  await playRound(page, h);
}

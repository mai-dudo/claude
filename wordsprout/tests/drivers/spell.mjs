/* Драйвер игры «Напиши слово» (spell) для tests/smoke.mjs (CONTRACTS §3.7). У каждого слова два шага —
   слово и предложение; на каждом шаге печатает правильный ответ из WS.test.expect и ждёт следующего шага
   (другие data-word-id / data-step у .g-spell__item) или конца игры. makeMistake сначала вводит одну
   неверную букву в первом слове (оно получит ok:false), потом доигрывает правильно. */
export const id = 'spell';

const ITEM = '.g-spell__item';

const state = (page) => page.evaluate(() => WS.test.state);

const stepKey = (page) => page.evaluate((sel) => {
  const item = document.querySelector(sel);
  return item ? `${item.dataset.wordId || ''}:${item.dataset.step || ''}` : '';
}, ITEM);

// Ждёт следующего шага или конца игры.
const nextStep = (page, prev) => page.waitForFunction(({ sel, p }) => {
  if (WS.test.state !== 'play') return true;
  const item = document.querySelector(sel);
  return !!item && `${item.dataset.wordId || ''}:${item.dataset.step || ''}` !== p;
}, { sel: ITEM, p: prev });

// Буква, которой точно нет в начале ответа.
const wrongLetter = (answer) => {
  const first = (String(answer).toLowerCase().match(/[a-z]/) || ['a'])[0];
  return first === 'z' ? 'q' : 'z';
};

export async function playRound(page, h) {
  for (let i = 0; i < 200 && (await state(page)) === 'play'; i++) {
    const key = await stepKey(page);
    const answer = await h.expect(null);
    if (answer == null || (await state(page)) !== 'play') break;
    await h.type(String(answer));
    await nextStep(page, key);
  }
  await h.waitState('done');
}

export async function makeMistake(page, h) {
  const answer = await h.expect(null);
  await h.type(wrongLetter(answer));
  await playRound(page, h);
}

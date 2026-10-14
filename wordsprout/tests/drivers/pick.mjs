/* Драйвер игры «Выбери картинку» (pick) для tests/smoke.mjs (CONTRACTS §3.7).
   playRound: на каждое слово нажимает карточку [data-ws=choice][data-word-id] с id из WS.test.expect
   (если харнесс сообщает h.input === 'keys' и это не сенсорный экран — нажимает её цифру 1–4),
   после ошибки — «Дальше» (в режиме клавиш — Enter). Слово после ошибки возвращается в конец очереди,
   поэтому драйвер ждёт не смены ответа, а смены карточки (.g-pick__item[data-item]) или конца игры.
   makeMistake: сначала нажимает неверную карточку, затем доигрывает сессию верно. */
export const id = 'pick';

const ITEM = '.g-pick__item';
const NEXT = '.g-pick [data-ws=next]';
const choice = (wordId) => `.g-pick [data-ws=choice][data-word-id="${wordId}"]`;

const snapshot = (page) => page.evaluate(({ itemSel, nextSel }) => {
  const item = document.querySelector(itemSel);
  const next = document.querySelector(nextSel);
  return { state: WS.test.state, item: item ? item.dataset.item || '' : '', next: !!next && !next.hidden };
}, { itemSel: ITEM, nextSel: NEXT });

// После ответа: следующая карточка (другой data-item и новый ответ), кнопка «Дальше» или конец игры.
const settle = (page, prev, { next = true } = {}) => page.waitForFunction(({ p, itemSel, nextSel, allowNext }) => {
  if (WS.test.state !== 'play') return true;
  const btn = document.querySelector(nextSel);
  if (allowNext && btn && !btn.hidden) return true;
  const item = document.querySelector(itemSel);
  return !!item && item.dataset.item !== p && WS.test.expect != null;
}, { p: prev, itemSel: ITEM, nextSel: NEXT, allowNext: next });

const byKeys = (h) => h.input === 'keys' && !h.touch;

const answer = async (page, h, wordId) => {
  if (byKeys(h)) {
    const n = await page.evaluate((sel) => {
      const all = Array.from(document.querySelectorAll('.g-pick [data-ws=choice]'));
      return all.indexOf(document.querySelector(sel)) + 1;
    }, choice(wordId));
    if (n >= 1 && n <= 9) {
      await h.type(String(n), { via: 'keys' });
      return;
    }
  }
  await h.tap(choice(wordId));
};

const goOn = async (page, h, prev) => {
  if (byKeys(h)) await h.type('\n', { via: 'keys' });
  else await h.tap(NEXT);
  await settle(page, prev, { next: false });
};

export async function playRound(page, h) {
  for (let i = 0; i < 200; i++) {
    const s = await snapshot(page);
    if (s.state !== 'play') break;
    if (s.next) {
      await goOn(page, h, s.item);
      continue;
    }
    const wordId = await h.expect(null);
    await answer(page, h, wordId);
    await settle(page, s.item);
  }
  await h.waitState('done');
}

export async function makeMistake(page, h) {
  const wordId = await h.expect(null);
  const s = await snapshot(page);
  const wrong = await page.evaluate((right) => {
    const btn = Array.from(document.querySelectorAll('.g-pick [data-ws=choice]')).find((b) => b.dataset.wordId !== right);
    return btn ? btn.dataset.wordId : null;
  }, wordId);
  if (wrong) {
    await answer(page, h, wrong);
    await settle(page, s.item);
  }
  await playRound(page, h);
}

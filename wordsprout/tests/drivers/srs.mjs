/* Драйвер игры «Повторение» (srs) для tests/smoke.mjs (CONTRACTS §3.7). playRound: на каждой карточке
   отвечает так, как просит WS.test.expect ({ action: 'remember' } → «Помню»): нажимает [data-ws=remember]
   (в режиме клавиш на компьютере — клавишу 1) и ждёт следующей карточки (другой data-card у .g-srs__card)
   или конца игры. makeMistake: на первой карточке «Не помню» ([data-ws=forget] / клавиша 2) — слово получит
   ok:false, а карточка вернётся через 4 карточки (её второй показ ничего не записывает), — потом
   доигрывает. Пустой набор (повторять нечего): игра остаётся на «Всё повторено» ([data-ws=srs-empty]),
   драйвер просто возвращается. */
export const id = 'srs';

const CARD = '.g-srs__card';
const EMPTY = '[data-ws=srs-empty]';

const snapshot = (page) => page.evaluate(({ card, empty }) => {
  const c = document.querySelector(card);
  return { state: WS.test.state, card: c ? c.dataset.card || '' : '', empty: !!document.querySelector(empty) };
}, { card: CARD, empty: EMPTY });

// После оценки: следующая карточка (другой data-card и новый ответ) или конец игры.
const settle = (page, prev) => page.waitForFunction(({ sel, p }) => {
  if (WS.test.state !== 'play') return true;
  const c = document.querySelector(sel);
  return !!c && c.dataset.card !== p && WS.test.expect != null;
}, { sel: CARD, p: prev });

const byKeys = (h) => h.input === 'keys' && !h.touch;

const grade = async (page, h, remember) => {
  if (byKeys(h)) await h.type(remember ? '1' : '2', { via: 'keys' });
  else await h.tap(`${CARD} [data-ws=${remember ? 'remember' : 'forget'}]`);
};

export async function playRound(page, h) {
  for (let i = 0; i < 200; i++) {
    const s = await snapshot(page);
    if (s.empty) return;
    if (s.state !== 'play') break;
    const want = await h.expect(null);
    await grade(page, h, !want || want.action !== 'forget');
    await settle(page, s.card);
  }
  await h.waitState('done');
}

export async function makeMistake(page, h) {
  const s = await snapshot(page);
  if (s.state === 'play' && !s.empty) {
    await h.expect(null);
    await grade(page, h, false);
    await settle(page, s.card);
  }
  await playRound(page, h);
}

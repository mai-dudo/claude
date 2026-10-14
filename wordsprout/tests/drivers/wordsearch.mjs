/* Заглушка: тестовый драйвер игры «Найди слова» (wordsearch). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'wordsearch';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

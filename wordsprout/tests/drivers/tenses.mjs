/* Заглушка: тестовый драйвер игры «Времена глаголов» (tenses). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'tenses';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

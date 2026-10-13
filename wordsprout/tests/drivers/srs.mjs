/* Заглушка: тестовый драйвер игры «Повторение» (srs). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'srs';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

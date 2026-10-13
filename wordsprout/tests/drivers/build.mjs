/* Заглушка: тестовый драйвер игры «Собери предложение» (build). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'build';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

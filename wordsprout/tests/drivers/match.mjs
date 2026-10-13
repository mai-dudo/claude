/* Заглушка: тестовый драйвер игры «Найди пары» (match). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'match';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

/* Заглушка: тестовый драйвер игры «Работа над ошибками» (mistakes). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'mistakes';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

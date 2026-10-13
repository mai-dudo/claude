/* Заглушка: тестовый драйвер игры «Вспомни и напиши» (recall). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'recall';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

/* Заглушка: тестовый драйвер игры «Выбери картинку» (pick). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'pick';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

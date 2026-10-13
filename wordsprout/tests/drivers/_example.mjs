/* Заглушка: тестовый драйвер игры «Пример игры» (_example). Нажимает «Готово» и ждёт экрана итогов. */
export const id = '_example';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

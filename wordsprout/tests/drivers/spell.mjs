/* Заглушка: тестовый драйвер игры «Напиши слово» (spell). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'spell';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

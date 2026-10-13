/* Заглушка: тестовый драйвер игры «Вставь слово» (gap). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'gap';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

/* Заглушка: тестовый драйвер игры «Диктант» (dictation). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'dictation';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

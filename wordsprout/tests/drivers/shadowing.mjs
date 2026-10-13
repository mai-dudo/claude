/* Заглушка: тестовый драйвер игры «Повтори вслух» (shadowing). Нажимает «Готово» и ждёт экрана итогов. */
export const id = 'shadowing';

export async function playRound(page, h) {
  await h.tap('[data-ws=next]');
  await h.waitState('done');
}

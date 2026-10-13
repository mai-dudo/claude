/* Заглушка: звуковые эффекты. Пока все функции молчат; тоны на WebAudio напишет владелец файла. */
(() => {
  'use strict';

  const silent = () => {};
  WS.sfx = { ok: silent, bad: silent, done: silent, key: silent, miss: silent };
})();

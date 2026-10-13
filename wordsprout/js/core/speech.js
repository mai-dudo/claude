/* Заглушка: речь. Пока без настоящего синтеза: speak() в тестовом режиме записывает текст
   в WS.test.spoken и сразу отвечает true, иначе отвечает false. Никогда не отклоняется.
   Распознавание речи выключено. Настоящую работу с голосом напишет владелец файла. */
(() => {
  'use strict';

  const listeners = new Set();
  const testOn = WS.test.enabled && WS.test.tts !== 'off';

  WS.speech = {
    status: testOn ? 'ok' : 'off',
    init() {},
    canSpeak() {
      return WS.speech.status === 'ok';
    },
    unlock() {},
    speak(text) {
      if (!testOn) return Promise.resolve(false);
      WS.test.spoken.push(String(text));
      return Promise.resolve(true);
    },
    stop() {},
    voices() {
      return [];
    },
    canListen() {
      return false;
    },
    listen() {
      return Promise.resolve(null);
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();

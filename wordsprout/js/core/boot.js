/* Заглушка: запуск приложения. Строит каркас, загружает данные и включает маршруты.
   Если данные не загрузились, показывает сообщение вместо экрана и не роняет страницу. */
(() => {
  'use strict';

  const { el, q } = WS.util;

  const fail = (err) => {
    console.warn('WordSprout: запуск не удался', err);
    const view = q('[data-ws=view]');
    if (view) view.replaceChildren(el('p', { class: 'ws-error', role: 'alert', text: WS.t('boot.error') }));
  };

  const boot = () => {
    WS.shell.init();
    WS.speech.init();
    WS.data.init().then(() => {
      WS.router.start();
      if (WS.test.enabled) WS.test.events.push({ type: 'ready' });
    }).catch(fail);
  };

  try {
    boot();
  } catch (e) {
    fail(e);
  }
})();

/* Заглушка: общие русские строки интерфейса. WS.t(ключ, { имя: значение }) подставляет {имя}.
   Неизвестный ключ возвращается как есть. Полный словарь напишет владелец файла. */
(() => {
  'use strict';

  const STRINGS = {
    'app.name': 'WordSprout',
    'soon': 'Скоро',
    'tab.home': 'Главная',
    'tab.learn': 'Учить',
    'tab.review': 'Повтор',
    'tab.progress': 'Прогресс',
    'tab.settings': 'Настройки',
    'level.easy': 'Лёгкий',
    'level.hard': 'Сложный',
    'game.start': 'Начать',
    'game.loading': 'Загружаем игру…',
    'game.error': 'Не получилось загрузить игру.',
    'game.retry': 'Повторить',
    'game.done': 'Готово!',
    'game.score': 'Без ошибок: {x} из {n}',
    'game.again': 'Ещё раз',
    'game.exit': 'Другая игра',
    'game.next': 'Следующая игра',
    'game.leave': 'Выйти из игры',
    'game.leaveAsk': 'Выйти из игры?',
    'game.leaveText': 'Ответы, которые ты уже дал, сохранены.',
    'game.noSpeech': 'Голос недоступен — игра покажет текст вместо звука.',
    'confirm.ok': 'Да',
    'confirm.cancel': 'Отмена',
    'back': 'Назад',
    'boot.error': 'Не удалось запустить приложение. Обнови страницу.',
  };

  WS.t = (key, vars) => {
    const str = Object.prototype.hasOwnProperty.call(STRINGS, key) ? STRINGS[key] : key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
  };
})();

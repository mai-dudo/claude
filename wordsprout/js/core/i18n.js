/* Общие русские строки интерфейса: WS.t(ключ, { имя: значение }).
   Подстановки: {имя} — значение, {имя|слово|слова|слов} — форма слова для числа имя
   (WS.t('n.words', { n: 5 }) → «5 слов»). Неизвестный ключ возвращается как есть (в тестовом режиме —
   с предупреждением в консоли). WS.t.has(ключ) проверяет, есть ли строка.
   Правила текста: «ты», буква ё, кавычки «ёлочки», длинное тире — с пробелами. */
(() => {
  'use strict';

  const STRINGS = {
    // Приложение
    'app.name': 'WordSprout',
    'app.title': 'WordSprout — английские слова',
    'app.loading': 'Загружаю…',
    'app.home': 'WordSprout — на главную',
    'soon': 'Скоро',
    'back': 'Назад',
    'boot.error': 'Не удалось запустить приложение. Обнови страницу.',
    'boot.dataError': 'Не получилось загрузить слова. Проверь интернет и попробуй ещё раз.',
    'router.broken': 'Этот экран не открылся. Вернись на главную или обнови страницу.',

    // Вкладки и уровни
    'tabs.label': 'Разделы',
    'tab.home': 'Главная',
    'tab.learn': 'Учить',
    'tab.review': 'Повтор',
    'tab.progress': 'Прогресс',
    'tab.settings': 'Настройки',
    'tab.badge': '{n} {n|слово ждёт|слова ждут|слов ждут} повторения',
    'level.easy': 'Лёгкий',
    'level.hard': 'Сложный',
    'level.label': 'Уровень: {level}',

    // Кнопки
    'btn.start': 'Начать',
    'btn.next': 'Дальше',
    'btn.check': 'Проверить',
    'btn.again': 'Ещё раз',
    'btn.retry': 'Повторить',
    'btn.ok': 'Хорошо',
    'btn.yes': 'Да',
    'btn.cancel': 'Отмена',
    'btn.close': 'Закрыть',
    'btn.hide': 'Скрыть',
    'btn.back': 'Назад',
    'btn.continue': 'Продолжить',
    'btn.listen': 'Послушать',
    'btn.slow': 'Послушать медленно',
    'btn.hint': 'Подсказка',
    'btn.show': 'Показать',
    'btn.dontKnow': 'Не знаю',
    'btn.skip': 'Пропустить',
    'btn.remember': 'Помню',
    'btn.forget': 'Не помню',
    'btn.translation': 'Показать перевод',
    'btn.home': 'На главную',
    'btn.chapters': 'К списку глав',
    'btn.chapter': 'К главе',
    'btn.review': 'К повторению',

    // Ответы
    'answer.ok': 'Верно!',
    'answer.bad': 'Не совсем.',
    'answer.right': 'Правильно: {answer}',
    'answer.typeHere': 'Напечатай слово по-английски',

    // Рамка игры
    'game.start': 'Начать',
    'game.loading': 'Загружаю игру…',
    'game.error': 'Не получилось загрузить игру.',
    'game.errorHint': 'Проверь интернет и нажми «Повторить».',
    'game.timeout': 'Игра загружается слишком долго.',
    'game.retry': 'Повторить',
    'game.unknown': 'Такой игры нет.',
    'game.disabled': 'Эта игра пока выключена.',
    'game.noChapter': 'Такой главы нет.',
    'game.badLevel': 'Такого уровня нет: выбери «Лёгкий» или «Сложный».',
    'game.fewWords': 'В этой главе мало подходящих слов для этой игры. Выбери другую.',
    'game.done': 'Готово!',
    'game.score': 'Без ошибок: {x} из {n}',
    'game.again': 'Ещё раз',
    'game.exit': 'Другая игра',
    'game.next': 'Следующая игра',
    'game.nextTitle': 'Дальше: {title}',
    'game.leave': 'Выйти из игры',
    'game.leaveAsk': 'Выйти из игры?',
    'game.leaveText': 'Твои ответы уже сохранены.',
    'game.leaveOk': 'Выйти',
    'game.leaveCancel': 'Остаться',
    'game.sound': 'Звук',
    'game.progress': 'Пройдено {done} из {total}',
    'game.words': '{n} {n|слово|слова|слов}',
    'game.set.chapter': '{title} · {level} уровень',
    'game.set.mistakes': 'Слова с ошибками',
    'game.set.due': 'Слова на сегодня',
    'game.set.fixture': 'Тестовый набор · {level} уровень',
    'game.noSpeech': 'Голос недоступен — игра покажет текст вместо звука.',
    'game.speech.off': 'Звук выключен — слова будут показаны текстом.',
    'game.speech.novoice': 'Нет английского голоса — слова будут показаны текстом.',
    'game.speech.blocked': 'Звук не включился — слова будут показаны текстом.',

    // Итоги
    'res.title3': 'Превосходно!',
    'res.title2': 'Отлично!',
    'res.title1': 'Хорошо!',
    'res.title0': 'Неплохое начало!',
    'res.sub3': 'Так держать!',
    'res.sub2': 'Ещё чуть-чуть — и будет три звезды.',
    'res.sub1': 'С каждым разом будет легче.',
    'res.sub0': 'Ошибки — это нормально: так слова и запоминаются. Попробуй ещё раз!',
    'res.perfect': 'Все слова с первого раза!',
    'res.empty': 'В этой игре не было слов.',
    'res.stars': 'Звёзды: {n} из 3',
    'res.score': 'Без ошибок: {x} из {n}',
    'res.best': 'Новый рекорд!',
    'res.mistakes': 'Слова с ошибками',
    'res.noMistakes': 'Ни одной ошибки — так держать!',
    'res.learned': 'Выучено в этой игре',
    'res.stageUp': 'Дерево подросло! Теперь это {name}.',
    'res.stage': 'Стадия {stage} из 8',
    'res.streak': 'Серия: {n} {n|день|дня|дней} подряд',

    // Речь
    'speech.off': 'Звук выключен в настройках.',
    'speech.novoice': 'В браузере нет английского голоса — слова будут без звука.',
    'speech.blocked': 'Браузер не включил звук. Нажми на кнопку динамика или проверь громкость.',
    'speech.help': 'На Android: Настройки → Специальные возможности → Синтез речи → Google, '
      + 'затем установи английский голос.',
    'speech.how': 'Как включить',
    'speech.state.ok': 'работает',
    'speech.state.novoice': 'нет английского голоса',
    'speech.state.blocked': 'заблокирован',
    'speech.state.off': 'выключен',

    // Хранилище и клавиатура
    'store.memory': 'Браузер не даёт сохранять данные — прогресс не сохранится после закрытия страницы.',
    'kbd.cyrillic': 'Включи английскую раскладку',

    // Подтверждение
    'confirm.ok': 'Да',
    'confirm.cancel': 'Отмена',

    // Числа
    'n.words': '{n} {n|слово|слова|слов}',
    'n.days': '{n} {n|день|дня|дней}',
    'n.minutes': '{n} {n|минута|минуты|минут}',
    'n.mistakes': '{n} {n|ошибка|ошибки|ошибок}',
    'n.stars': '{n} {n|звезда|звезды|звёзд}',
    'n.answers': '{n} {n|ответ|ответа|ответов}',
    'n.times': '{n} {n|раз|раза|раз}',
  };

  const has = (key) => Object.prototype.hasOwnProperty.call(STRINGS, key);
  const PLACE = /\{(\w+)(?:\|([^|{}]*)\|([^|{}]*)\|([^|{}]*))?\}/g;

  const format = (str, vars) => str.replace(PLACE, (whole, name, one, few, many) => {
    if (!vars || !Object.prototype.hasOwnProperty.call(vars, name)) return whole;
    if (one !== undefined) return WS.util.plural(vars[name], [one, few, many]);
    return String(vars[name]);
  });

  const t = (key, vars) => {
    if (!has(key)) {
      if (WS.test.enabled) console.warn(`WordSprout: нет строки «${key}»`);
      return String(key);
    }
    return format(STRINGS[key], vars);
  };
  t.has = has;

  WS.t = t;
})();

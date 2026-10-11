# Личная страница в стиле XMB

Статический сайт: меню как на PlayStation 3, видео аквариума на фоне под картинкой «с кассеты»,
просмотр фото и роликов, игры HexGL и Astray поверх страницы, анимированные стикеры Telegram
вместо иконок. Сборка не нужна.

## Запуск

```
python3 -m http.server 8080 --bind 127.0.0.1
```

Затем откройте http://localhost:8080. Открывать `index.html` двойным кликом не стоит:
браузер не даст загрузить список видео, стикеры и игры с диска.

## Управление

- Стрелки влево и вправо переключают разделы, вверх и вниз — пункты.
- Enter или повторный клик открывают выбранный пункт.
- Колесо мыши листает пункты, Shift и колесо — разделы.
- На телефоне свайпы: по горизонтали разделы, по вертикали пункты.
- Esc закрывает просмотр и игру.

## Что заменить на своё

| Что | Где |
| --- | --- |
| Ник, текст «О себе», факты | `index.html`, раздел `#profile`, и тег `<title>` |
| Аватарка | `assets/photos/avatar.svg`, или свой файл и путь в `index.html` |
| Ролики YouTube | `data/videos.json`; обновить автоматически: `node scripts/sync-youtube.mjs UC…` (ID канала) |
| Фото | файлы в `assets/photos/` и пути в разделе `#photos` |
| Скейт-ролики | `assets/video/skate/clip-1.mp4` и далее, обложки — в `<img>` пункта |
| Проекты и ссылки | разделы `#projects` и `#links` |
| Стикер вместо иконки | `gunzip -c стикер.tgs > assets/stickers/имя.json`, затем `data-tgs="assets/stickers/имя.json"` на `it__ico` |
| Фон | свой ролик вместо `assets/video/bg-720p.mp4`, `bg-540p.mp4`, `bg-720p.webm` и `bg-poster.jpg` |

## Счётчик визитов

На Vercel работает функция `api/visit.js`: один IP — один визит. Нужна база Upstash Redis
(бесплатный план): в настройках проекта Vercel задайте переменные `UPSTASH_REDIS_REST_URL`
и `UPSTASH_REDIS_REST_TOKEN`. Без них на сайте показывается «—».

## Бот «КД подарка»

Функция `api/gift-bot.js` — Telegram-бот: ему присылают ссылку `t.me/nft/…`, он отвечает, сколько осталось
до передачи подарка, или что КД нет. Telegram показывает КД только владельцу подарка, поэтому владелец
подключает бота к своему аккаунту: Настройки → Telegram для бизнеса → Чат-боты (нужен Telegram Premium)
и разрешает просмотр подарков и звёзд. По чужой ссылке бот показывает название и владельца без КД.

1. Создайте бота у @BotFather и включите ему Business Mode (Bot Settings → Business Mode).
2. В настройках проекта Vercel задайте `GIFT_BOT_TOKEN` (токен бота), `GIFT_BOT_SECRET` (любая строка из
   латиницы, цифр, `_` и `-`, например `openssl rand -hex 32`) и те же `UPSTASH_REDIS_REST_URL` и
   `UPSTASH_REDIS_REST_TOKEN`, что для счётчика. Часовой пояс дат — `GIFT_BOT_TZ`, по умолчанию `Europe/Moscow`.
3. После деплоя направьте бота на функцию:
   `GIFT_BOT_TOKEN=… GIFT_BOT_SECRET=… node scripts/set-gift-bot-webhook.mjs https://ваш-сайт.vercel.app`

Тесты: `node --test tests/gift-bot.test.mjs`.

## Публикация

Сайт выкладывается на Vercel как есть, без сборки. Из-за проверки автора коммитов
деплой делается из копии без папки `.git`:

```
git archive HEAD | tar -x -C /tmp/site && cp -r .vercel /tmp/site/ && cd /tmp/site && vercel deploy --prod
```

Авторы и лицензии видео, иконок, игр и шрифта — в `CREDITS.md`.

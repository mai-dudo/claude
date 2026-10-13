# Fluent Emoji (Microsoft) в WordSprout

Картинки слов и значки в `wordsprout/img/emoji/*.webp` взяты из набора **Fluent Emoji** компании Microsoft
(стиль «3D»). Набор распространяется по лицензии MIT, её текст — в файле `LICENSE` рядом.

- Источник: https://github.com/microsoft/fluentui-emoji, коммит `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`.
- Что изменено: исходные PNG (256 px; неквадратные сначала дополнены прозрачными полями до квадрата) уменьшены
  до 160×160 (Lanczos) и пересохранены в WebP (качество 82), прозрачность сохранена. Файлы названы
  по кодовым точкам Unicode: `1f34e.webp` и т. п.
- Кладутся в репозиторий только картинки, которые реально используются в данных приложения.
- Как обновить: `node wordsprout/tools/fetch-emoji.mjs` (индекс набора — `wordsprout/tools/emoji-index.json`,
  поиск кода — `node wordsprout/tools/fetch-emoji.mjs --find apple`).

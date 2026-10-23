# «Если бы я...» — видеоролик для проекта

Ролик на 3½–4 минуты к проекту 10 класса по предметам «Воспитание» и «Основы государства и права».
Тема из задания: «Если бы я...» — какие меры я бы принял, став лидером молодёжи махалли, председателем махалли,
хокимом или министром.

Четыре участника команды, у каждого своя должность из задания и своя реальная проблема Узбекистана:

| № | Участник | Роль | Проблема |
| --- | --- | --- | --- |
| 01 | Гутко | Лидер молодёжи махалли | Кибермошенничество |
| 02 | Бурханов | Председатель махалли | Мусор в махалле |
| 03 | Усманов | Хоким Ташкента | Грязный воздух |
| 04 | Тропачев | Министр водного хозяйства | Нехватка воды |

Каждая часть идёт по схеме **Проблема → Основная часть → Решение**. В основной части на экране четыре понятия
из критериев оценивания: право, обязанность, ответственность, полномочие. В решении — три варианта и выбор лучшего
с объяснением. В конце — слайд с источниками.

Оформление — Google Material Design 3: шрифт Google Sans, иконки Material Symbols, тональные цвета, формы
Material 3 Expressive, «плавные» кривые анимации M3.

Участники нарисованы пиксель-артом: `tools/portraits.js` рисует реалистичный портрет (белая рубашка,
пиджак, жилет или свитер, как у старшеклассников), `tools/sprites.js` и `tools/pixelate.py` уменьшают его
в 5 раз, сводят к 44 цветам и собирают раскадровку: 4 положения рта × открытые/закрытые глаза.

## Файлы

- `СЦЕНАРИЙ.md` — тексты для озвучки (по персонажам и по порядку). Создаётся из `story.json`.
- `story.json` — весь сценарий: реплики, факты и что показывать на экране.
- `scene/` — сам ролик в виде веб-страницы (каждый кадр рисуется по времени).
- `тексты/` — по файлу реплик на каждого участника, для озвучки.
- `tools/` — сборка: кадры через Playwright + Chromium, звук через numpy, видео через ffmpeg.
- `voice/` — сюда кладутся озвучки (см. `voice/README.md`).

## Сборка

Нужны Node 18+, Python 3 с numpy, ffmpeg и Playwright с Chromium.

```
bash tools/build.sh        # шрифты → портреты → озвучка → кадры → звук → out/esli-by-ya.mp4
node tools/shot.js 30 95   # отдельные кадры для проверки в out/shots/
```

Посмотреть вживую: `python3 -m http.server` в этой папке и открыть `http://localhost:8000/scene/` (пробел — пауза,
стрелки — перемотка на 5 секунд).

### Голоса нейросетью

`tools/ai_voices.py` озвучивает все реплики локальной нейросетью XTTS-v2 (Coqui, лицензия CPML — только
некоммерческое использование) по одной записи голоса, а потом делает из него четыре разных подростковых
голоса сдвигом высоты и тембра (Praat). Каждую реплику проверяет распознавание речи (faster-whisper):
если фраза вышла смазанной, она генерируется заново, а лишние звуки в конце обрезаются.

```
python3 -m venv .venv-tts
.venv-tts/bin/pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv-tts/bin/pip install "coqui-tts[codec]" praat-parselmouth faster-whisper
COQUI_TOS_AGREED=1 .venv-tts/bin/python tools/ai_voices.py путь/к/записи.ogg
bash tools/build.sh
```

Пока озвучки нет, длина реплик оценивается по количеству слогов, а рот двигается условно. После того как файлы
появятся в `voice/`, `tools/build.sh` подстроит тайминг под реальные фразы, губы — под громкость голоса, а музыку
приглушит под речь.

## Источники фактов

- МВД РУз: киберпреступления 2019–2024 — [kun.uz](https://monitor.kun.uz/en/news/2025/05/29/uzbekistan-sees-68-fold-surge-in-cybercrime-nearly-2-trillion-uzs-stolen-in-five-years), [yuz.uz](https://yuz.uz/ru/news/v-uzbekistane-chislo-kiberprestupleniy-za-poslednie-pyat-let-vroslo-v-68-raz); за 2025 год — [spot.uz](https://www.spot.uz/ru/2026/06/15/cybersecurity/)
- Минэкологии: отходы за 2024 год — [gov.uz](https://gov.uz/ru/eco/news/view/38417)
- IQAir о Ташкенте, январь 2025 — [anhor.uz](https://anhor.uz/news/air-pollution-2/)
- Указ УП-229 от 24.11.2025 об экологии Ташкента — [gov.uz](https://gov.uz/ru/miit/news/view/105885)
- Совещание по водосбережению, ноябрь 2023 — [podrobno.uz](https://podrobno.uz/cat/obchestvo/k-2030-godu-v-uzbekistane-nekhvatka-vody-mozhet-dostich-15-milliardov-kubometrov/), [kun.uz](https://kun.uz/ru/news/2023/11/30/uzbekistan-perexodit-na-chrezvychaynyy-rejim-raboty-po-ekonomii-vody)
- Субсидии на капельное орошение — [president.uz](https://president.uz/ru/lists/view/4236)
- Статья 49 Конституции — [gov.uz](https://gov.uz/ru/eco/news/view/39666); статья 127 — [uza.uz](https://uza.uz/ar/posts/maxallya-novogo-urovnya-ot-polnomochiy-k-rezultatu_886750)
- ПП-92 и УП-163 о работе с молодёжью в махаллях — [advice.uz](https://advice.uz/ru/document/2876)

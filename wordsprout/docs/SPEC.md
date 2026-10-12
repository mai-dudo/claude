# WordSprout — functional specification

WordSprout is a free, picture-based English vocabulary trainer for Russian speakers. It is a static web app
(no backend, no accounts) served from the `wordsprout/` folder of the site. It must feel great on an Android
phone in portrait (Brave / Chrome) and also work on desktop.

This document says **what** the app does. `CONTRACTS.md` says **how the code is organised** (APIs, files,
DOM hooks). When they disagree, SPEC wins on behaviour and CONTRACTS wins on APIs, files and DOM hooks.

All texts, words, sentences, translations, icons and visuals are our own. The UI language is Russian
(informal «ты», ё, «ёлочки» quotes, em dash —). English content uses American spelling.

---

## 1. Product overview

- **Content:** 30 topic chapters × 20 words = 600 words. Every word has a picture (emoji) when one fits,
  a Russian translation, a short **Easy** example sentence and a longer **Hard** example sentence, both
  translated to Russian. Verbs also have their forms and four tense drills.
- **Levels:** «Лёгкий» (Easy) and «Сложный» (Hard). Both are free and fully open. The level changes which
  sentence is used everywhere and the order of chapters. Nothing is ever locked, there are no padlocks,
  no prices, no upsell.
- **Games:** 12 modes (§4). Any game can be played on any chapter (if the chapter has enough eligible words),
  plus two global modes: mistakes review and spaced repetition.
- **Motivation:** words learned, a daily streak, a practice calendar, a tree that grows through 8 stages,
  a statistics page.
- **Audio:** the browser's speech synthesis (Web Speech API, `en-US`). No audio files. Short sound effects
  are generated with WebAudio.
- **Storage:** everything is kept on the device (localStorage) with export/import of progress as a file.

## 2. Screens and navigation

One page with hash routes (see CONTRACTS for the route table).

1. **Home `#/`.**
   - First visit: a friendly hero (name, one-line promise, big «Начать» button), a small live demo card
     (a picture, a speaker button, three letter cells to type a short word — e.g. a cat — that turns green
     when solved), three short feature blocks (see–hear–type; Easy and Hard both free; progress tree),
     and a link «← на сайт» back to the parent site (`../`).
   - Returning learner: «Продолжить» (resumes the last route), the current streak, today's practice
     minutes, the mini tree with its stage, the due count for review.
2. **Learn `#/learn/:level`.** A two-option switch Лёгкий / Сложный at the top (remembered in settings).
   Below: the chapter list for that level, in that level's order. Each chapter tile shows its picture,
   Russian and English title, «N из 20 выучено» with a small progress bar, and stars of the best session.
   The first chapter that is not complete gets a «Начни здесь» / «Продолжить» badge.
3. **Chapter `#/chapter/:level/:chapterId`.**
   - Header: chapter picture and titles, level badge, learned count.
   - **Game cards** in catalogue order: icon, Russian title, one-line description, best stars for this
     chapter+level. Games that are not eligible for this chapter (too few words with the needed data)
     are hidden.
   - **Word list:** all 20 words with picture, English word (verbs shown as «to cook»), Russian translation,
     a speaker button, and a learned tick.
4. **Game `#/play/:level/:setId/:gameId`.** Game frame owned by the shell:
   - Top bar: ✕ (leave), game title, a progress bar `done/total`, sound toggle.
   - **Intro card:** title, a 1–2 line «как играть», a warning if speech is unavailable, and a big «Начать»
     button. The tap on «Начать» unlocks audio and starts the game in the same tap (so the phone keyboard can open).
   - **Results:** big heading, stars, score line «Без ошибок: X из N», the list of words that had mistakes
     (picture, word, translation, speaker), words newly learned in this session, a tree-growth message if
     the stage went up, the streak; buttons «Ещё раз», «Другая игра», «Следующая игра».
   - Leaving mid-game asks for confirmation only if at least one answer was given. Answers are saved one by one.
5. **Review `#/review`.** Two big cards: «Работа над ошибками» (count of mistake words, start button,
   «очистить список» with confirmation) and «Повторение» (due today, new today, start button,
   «когда следующее повторение» if nothing is due).
6. **Progress `#/progress`.** Statistics, calendar, tree (§6).
7. **Settings `#/settings`** (§7) and **About `#/about`** (how the app works, credits and licences, privacy:
   «всё хранится только на этом устройстве»).
8. **Lab `#/lab`** (linked from settings, «Проверка клавиатуры»): a letter-cell input with a live event log,
   for diagnosing phone keyboards.

**Navigation bar:** on screens narrower than 720 px a bottom tab bar with 5 items — Главная, Учить, Повтор
(badge with due + mistakes), Прогресс, Настройки — fixed to the bottom with the safe-area inset; the current
item is highlighted. On wider screens the same items are in a top bar. The bar is hidden inside a running game.
The Android back button walks back through routes. Every screen has a back arrow to its parent
(game → chapter → learn → home).

## 3. Shared game mechanics

### 3.1 Session
- A session belongs to a **set**: a chapter (`setId` = chapter id), the mistakes list (`mistakes`) or the
  spaced-repetition due list (`due`).
- For a chapter, the session takes up to **10** eligible words: words not yet learned first, then the least
  recently seen; shuffled with the seeded RNG. Other eligible words of the chapter form the **pool**
  (used for distractors).
- Each word gets **exactly one recorded result** per session: `ok` = solved on the first try **without help**.
  A wrong letter, a wrong pick, a revealed hint or a «не знаю» makes it `ok:false`. The shell ignores repeats.
- Progress bar = items solved / items total.

### 3.2 Letter-cell typing (used by every typing game)
- The target (word or sentence) is drawn as **letter cells**. Words are kept together on one line; lines break
  only between words. A space is a gap. Punctuation, digits, apostrophes and hyphens are **fixed** cells,
  pre-filled. Verbs are shown with a fixed small «to» label in front that is never typed.
- **Strict mode:** only the next correct letter is accepted (case-insensitive). A wrong key is rejected,
  the current cell flashes red (~300 ms) and a soft error tick plays; the word is marked «with mistake».
- The current cell is highlighted. Cells shrink to fit the longest word on narrow screens.
- A hidden real text input lies over the cells: tapping the cells focuses it and opens the phone keyboard.
  On touch devices never auto-focus without a tap; on desktop focus automatically. Typing anywhere on the page
  (desktop) goes into the cells.
- Phone keyboards must work: letter-by-letter composition, whole-word commits, autocorrect replacements and
  paste (see CONTRACTS «letter input»). If the learner's keyboard misbehaves, they can switch on the built-in
  on-screen keyboard (settings «Клавиатура WordSprout»).
- If the learner types a Cyrillic letter, show a toast «Включи английскую раскладку» at most once per 30 s.
- **Eye button («подсказка»):** toggles faded letters of the rest of the answer inside the cells; the learner
  still types them. Using it marks the item as helped.
- **Speaker button:** plays the current audio. A small «turtle» button plays it slower (rate 0.7).
- Keyboard shortcuts on desktop: Enter = continue, Ctrl+Space = listen, Ctrl+H = hint, 1–4 = choose option.

### 3.3 Feedback and timing
- Correct: cells/cards turn green, a short rising two-note chime, then auto-advance after ~700 ms
  (or a «Дальше» button when there is something to read, e.g. the sentence translation).
- Wrong: the chosen element turns red, the right answer is shown green, a short low buzz; advance by «Дальше».
- After every solved item the word (or sentence) is spoken once.
- With reduced motion all animations are off and delays are 0; with sound off nothing is spoken and the games
  still work (show text instead of relying on audio).

### 3.4 Results
Stars by share of first-try-without-help answers: ≥ 90% → 3, ≥ 70% → 2, ≥ 40% → 1, else 0 (still shows a kind
message). The best stars per chapter × level × game are stored.

## 4. The games (ids are fixed — see CONTRACTS)

### 4.1 `spell` — «Напиши слово»
Picture (+ Russian translation under it) → type the English word in letter cells. Then, on Easy, type the
**Easy sentence** in smaller cells (with its Russian translation shown); on Hard, type the **Hard sentence**.
The word is spoken when the item opens; the sentence is spoken ~400 ms after the sentence phase starts.
One result per word (mistakes in either phase count).

### 4.2 `pick` — «Выбери картинку»
The English word large (verbs with «to»), the level's example sentence under it with the word in bold.
Four picture cards (right one + 3 distractors from the pool or other chapters), each labelled with its Russian
translation. Word then sentence are spoken when the item opens. Tap a card (or press 1–4) → immediate check.
Wrong: chosen card red, right card green; the word goes to the end of the queue once more (but its result stays
`ok:false`). Needs words with pictures; distractors must have different pictures.

### 4.3 `match` — «Найди пары»
Rounds of at most 5 pairs (10 words → 5+5; 7 → 4+3). Two columns shuffled independently: pictures (with Russian
translation) and English words. Tap one card, then a card in the other column; tapping another card in the same
column moves the selection; tapping the same card deselects. Right: both turn green and lock, the word is
spoken. Wrong: both flash red ~450 ms, input blocked meanwhile, both words get `ok:false`. After the last pair
of a round, «Дальше».

### 4.4 `gap` — «Вставь слово»
The picture with its translation, the level's sentence with the answer replaced by letter cells, the Russian
sentence translation. The sentence is spoken ~350 ms after the item opens (with the answer). Skip words whose
answer does not occur in the sentence.

### 4.5 `recall` — «Вспомни и напиши»
Each word is asked in up to three ways, spread through the session so that two questions on the same word are at
least `min(4, n−1)` items apart and the same way never appears three times in a row:
1. picture → type the word;
2. audio only (big replay button; if speech is unavailable, skip this way);
3. Russian word → write it in English.
Reveal is available and counts as help. The word's result is `ok` only if all its questions were clean.
End screen also shows a breakdown per way.

### 4.6 `dictation` — «Диктант»
The picture and the Russian sentence translation; the level's whole sentence as cells; the sentence is spoken
automatically when the item opens and on the speaker button; the learner types what they hear (spaces and
punctuation are fixed). If speech is unavailable, show the English sentence for 4 seconds and then hide it
(«запомни и напиши»), with a button to show it again (counts as help).

### 4.7 `wordsearch` — «Найди слова»
Rounds of at most 5 words (balanced like match). Words longer than 9 letters are not eligible.
- Grid size N = max(7, longest word, ceil(sqrt(total letters / 0.45))); words placed right, down or
  diagonally down-right; overlaps allowed when letters agree; up to 250 tries per word and 40 grid attempts,
  N grows by 1 every 8 failed attempts. Empty cells: 25% a letter from this round's words, else a–z. Lowercase.
- Below the grid: the list of the round's words as picture + Russian translation (the English word is hidden
  until found). Tapping a list entry speaks the word.
- Select by dragging in a straight line (row, column, exact 45°) or by tapping the first and then the last cell.
  A reversed selection also counts. Wrong selection: the grid shakes, no penalty.
- Found: cells stay marked, list entry shows the English word, chime, word spoken.
- Hint button: highlights the first letter of the first unfound word; counts as help for that word.
- The grid fits the screen width (max ~560 px), cells at least 34 px.

### 4.8 `build` — «Собери предложение»
The level's sentence split into word chips (punctuation attached to its word), shuffled (never in the right
order). The learner taps chips in order; each tap moves the chip into the answer line if it is the next correct
word; a wrong chip shakes and the item gets `ok:false`. Tapping a placed chip does nothing. The picture and
the Russian translation are shown; the sentence is spoken when complete. Easy uses Easy sentences, Hard uses
Hard sentences.

### 4.9 `tenses` — «Времена глаголов»
Only verbs. Each verb has 4 drills: present simple, past simple, present continuous, present perfect.
Easy uses the first three tenses, Hard all four. Item: tense label in Russian (e.g. «Прошедшее простое»), the base
verb «to cook», the picture, the sentence with the answer as letter cells (answers may be two words, e.g.
`is cooking`), the Russian translation revealed after solving. Queue: no two consecutive items of the same tense
when possible. End screen: right first time X / N plus a per-tense table (weak tenses highlighted).
Session size: up to 10 drills from the chapter's verbs.

### 4.10 `mistakes` — «Работа над ошибками»
Global set: all words with open mistakes (from any game, any chapter). Plays like `pick` (§4.2); if fewer than
4 distinct pictures are available, use `spell` style typing instead. A first-try correct answer **in this mode**
removes the word from the list. Empty list → a friendly empty state with a link to the games.

### 4.11 `srs` — «Повторение»
Global set: words that are due today (see §5.3) plus up to **10 new** learned-but-never-reviewed words per day,
max 30 per session. One card per screen: English word, the level's sentence, picture, Russian translation hidden
behind «Показать перевод»; the word then the sentence are spoken when the card appears. Two buttons:
«Помню» / «Не помню» (keys 1 / 2). «Не помню» returns the card 4 cards later once. Advance automatically
~400 ms after grading. End: reviewed N, remembered K, back to the review screen. Nothing due → «Всё повторено»
with the date of the next due word.

### 4.12 `shadowing` — «Повтори вслух»
A vertical feed, one card per word of the session: picture, word, the level's sentence, its translation.
Auto-loop: speak the word, pause 350 ms, speak the sentence, then a speaking pause of
`clamp(1.5 s + 1.3 × audio length, 2.5 s, 14 s)` (with no speech: `0.9 s + 75 ms × characters`, same clamp)
for the learner to repeat aloud, then scroll to the next card. A pause button stops/resumes the loop (and it pauses
when the tab is hidden). Under each card two self-check buttons «Получилось» / «Ещё раз» (Ещё раз replays the
card). If speech recognition is available and works (not in Brave), an optional microphone button checks the
transcript loosely (≥ 70% of the sentence's words heard) and shows ✓; otherwise it is hidden. Results count
«Получилось» as ok.

## 5. Progress rules (our own)

### 5.1 Per word
Counters: times seen, correct, wrong, games in which it was answered first-try-without-help, open mistakes,
SRS box and due date, last seen date, learned date.

- **Learned:** answered `ok` in **at least 2 different games**, or answered «Помню» in `srs`. Emits a «learned» event.
- **Mistakes:** any `ok:false` adds the word to the mistakes list (open mistakes > 0). A first-try correct answer
  in `mistakes` clears it.

### 5.2 Practice day, streak, calendar
- Local dates only (`YYYY-MM-DD` in local time).
- A **practice day** is a day with at least one finished session.
- **Current streak:** consecutive practice days ending today, or ending yesterday if today has no practice yet.
  **Best streak** is stored.
- **Active time:** every 5 s add 5 s while the page is visible, there was input in the last 60 s and a game is open.
- Per day store: answers, correct, sessions, active seconds.

### 5.3 Spaced repetition (Leitner)
Boxes 1–5 with intervals [1, 3, 7, 14, 30] days. A word enters box 1 (due tomorrow) when it becomes learned.
«Помню» → next box, due = today + that box's interval (box 5 stays at 30). «Не помню» → box 1, due tomorrow,
and the word is added to mistakes.

### 5.4 Tree
8 stages, driven by learned words: thresholds **0, 5, 20, 50, 100, 175, 275, 400**.
Stages: семечко, росток, побег, саженец, молодое дерево, дерево, цветущее дерево, дерево с плодами.
At 600 the tree is full of fruit. Inside a stage the tree grows a little (scale 88% → 100% by progress to the next
stage). Ambient motion (gentle sway, a cloud, sun by day / moon by night) pauses when off-screen and is off with
reduced motion. When the stage goes up, a celebration on the results screen. The tree is our own inline SVG drawing.

## 6. Statistics page
- Tiles: текущая серия, лучшая серия, слов выучено (of 600), дней занятий, время занятий, правильных ответов,
  точность (correct / (correct + wrong)).
- **Calendar:** last 20 weeks as a heat map (columns = weeks, rows = days, Monday first, month labels, today
  outlined). Intensity by active minutes: 0 none, 1 < 5, 2 ≥ 5, 3 ≥ 15, 4 ≥ 30. Tap/hover a day → date, minutes,
  correct answers.
- **Last 7 days:** bar chart of minutes per day with the total.
- **Tree card:** the tree, stage name «Стадия k из 8», progress bar to the next stage «ещё N слов».
- Per chapter: learned / 20 for both levels (compact list).
- Empty state when there is no data yet.

## 7. Settings (stored separately from progress)
- **Звук:** голос и звуки вкл/выкл; скорость речи (0.6–1.2, default 0.9); голос (list of available English voices,
  default automatic) with a «Проверить» button; autoplay of words/sentences on/off.
- **Вид:** тема (авто / светлая / тёмная); стиль (с картинками и фоном / простой); анимации (авто / меньше).
- **Обучение:** уровень по умолчанию (Лёгкий / Сложный); бледные подсказки-буквы в начале (off by default);
  русский перевод под картинками on/off; клавиатура (системная / WordSprout).
- **Прогресс:** экспорт в файл, импорт из файла (validates), сброс прогресса (confirmation; keeps settings).
- Link to «Проверка клавиатуры» (`#/lab`) and to About.
- Speech status line: «Голос: работает / нет английского голоса / заблокирован» with help text for Android
  (Настройки → Специальные возможности → Синтез речи → Google, установить английский голос).

## 8. Mobile behaviour
- Portrait first, works in landscape too (no lock).
- Viewport meta with `interactive-widget=resizes-content`; when the keyboard is open the game layout must still
  show the top bar, the picture (shrunk, ≥ 96 px), the cells and one row of actions within ~390×430 px.
- Tap targets ≥ 44 px. No horizontal scrolling at 360 px.
- Typing inputs: `autocomplete=off autocorrect=off autocapitalize=none spellcheck=false`.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Installable (manifest with own icons); no service worker in v1.

## 9. Audio details
- Voice choice: saved voice → a local `en-US` voice → `en-GB` → any `en*`; normalise `_` to `-` in `lang`.
  If the voice list is empty, still speak with `lang='en-US'`.
- First speech must come from a tap (the «Начать» tap unlocks it).
- If nothing starts within 2 s, mark speech as blocked for the session and show a help banner; never block the game.
- Cancel speech when the tab is hidden; cancel before each new utterance.
- Sound effects (our own WebAudio tones): correct chime, wrong buzz, round-complete arpeggio, key tick, soft
  error tick. All respect the sound setting.

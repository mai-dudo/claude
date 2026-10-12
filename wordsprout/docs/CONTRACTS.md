# WordSprout — contracts (APIs, files, data, DOM hooks)

Read together with `SPEC.md` (behaviour), `STYLE.md` (visual rules, written by the UI-kit agent) and
`CONTENT.md` (writing rules for words and sentences). SPEC wins on behaviour; this file wins on APIs, files
and DOM hooks. This file is **frozen** once the foundation passes its gate; changes go through the orchestrator.

## 0. Ground rules for every agent
- Clean room: build only from these docs. Never look for or open any existing vocabulary-trainer site or app,
  never use web access (except the emoji agent: only the Microsoft fluentui-emoji repo / its jsDelivr mirror).
  Never read git history. Never run git commands except `git status` and `git diff -- <your files>`. Never commit.
- Edit **only** the files you own (your prompt lists them). If you need a change elsewhere, write the request to
  `$SCR/requests/<your-agent-id>.md` and work around it locally.
- Everything you write (text, sentences, art, code) must be your own invention.
- Scratch/work files go to `$SCR/work/<your-agent-id>/`, never into the repo. (`$SCR` is given in your prompt.)

## 1. Architecture

One page `wordsprout/index.html` with hash routing (`#/learn/easy`). Plain JS, no framework, no build, no modules:
every file is a classic script loaded with `defer` (games are loaded lazily by the shell) and attaches to one
namespace `window.WS`.

### 1.1 Code conventions (enforced by `tools/check-code.mjs`)
- Each JS file starts with a Russian `/* … */` comment saying what it does, then `(() => { 'use strict'; … })();`.
  `const`/`let`, arrow functions, 2-space indent, single quotes, semicolons.
- Only `js/core/ns.js` assigns to `window` (only `window.WS`). Other files add to `WS.*` sub-objects they own.
  Game files touch `WS` only through `WS.games.register(` (and read `WS.ui`, `WS.util` via `ctx`).
- `localStorage` only in `js/core/store.js`; `speechSynthesis`/`SpeechRecognition` only in `js/core/speech.js`;
  `AudioContext` only in `js/core/sfx.js`. No `Math.random` in `js/games/` or `js/screens/` (use `ctx.rng` /
  `WS.util.rng`).
- No absolute URLs or external requests at runtime (everything relative to `wordsprout/`), except plain links
  in `about.js`.
- Data-driven text via `textContent`. `innerHTML` only for static icon strings from `WS.ui.icons`.
- CSS class prefixes: kit `.ws-*`, screens `.s-<name>__*` (root `.s-<name>`), games `.g-<id>__*` (root `.g-<id>`);
  every selector in `css/games/<id>.css` starts with `.g-<id>`; every selector in `css/screens/<name>.css` starts
  with `.s-<name>`.
- UI text Russian, «ты». English content American spelling, voice `en-US`.

### 1.2 File layout and owners

```
wordsprout/
├─ index.html                 A1   slash guard, pre-paint theme script, all <link>/<script defer> (fixed list below)
├─ manifest.webmanifest       A2   start_url "./", scope "./", own icons
├─ README.md                  H1   (Russian)
├─ css/tokens.css base.css kit.css            A2
├─ css/screens/lab.css                         A2
├─ css/screens/home.css learn.css              E1   (learn.css also styles the chapter screen)
├─ css/screens/progress.css tree.css           E2
├─ css/screens/settings.css review.css about.css   E3
├─ css/games/<id>.css                          D-<id>   (lazy-loaded)
├─ js/core/ns.js                               A0 → A1
├─ js/core/i18n.js speech.js sfx.js router.js games.js shell.js boot.js   A1
├─ js/core/store.js settings.js data.js progress.js                        A5
├─ js/ui/kit.js icons.js letter-input.js keypad.js                         A2
├─ js/screens/lab.js                           A2
├─ js/screens/home.js learn.js                 E1   (learn.js registers #/learn and #/chapter)
├─ js/screens/progress.js tree.js              E2   (tree.js defines WS.tree)
├─ js/screens/settings.js review.js about.js   E3
├─ js/games/_example.js  css/games/_example.css  tests/drivers/_example.mjs   A1 (reference game, hidden)
├─ js/games/<id>.js                            D-<id>
├─ data/chapters.json                          C1
├─ data/games.json ui-emoji.json               A1
├─ data/words/<chapterId>.json                 B-agents
├─ img/emoji/<code>.webp                       A4 (script output only)
├─ img/app/icon.svg icon-192.png icon-512.png maskable-512.png   A2 (own artwork)
├─ docs/SPEC.md CONTRACTS.md                   orchestrator (read-only for agents)
├─ docs/STYLE.md                               A2
├─ docs/CONTENT.md                             C1
├─ tools/validate-data.mjs check-code.mjs contact-sheet.py   A3
├─ tools/fetch-emoji.mjs emoji-index.json      A4
├─ tools/wordplan.json                         C1
├─ tools/make-icons.mjs                        A2
└─ tests/README.md smoke.mjs ime.mjs unit.mjs screens.mjs perf.mjs lib/*   A6
   tests/fixtures/fixture.json                 A0
   tests/fixtures/progress.json                A6
   tests/drivers/<id>.mjs                      D-<id>
```

Script order in `index.html` (all `defer`):
`core/ns, core/i18n, core/store, core/settings, core/data, core/progress, core/speech, core/sfx, ui/icons, ui/kit,
ui/letter-input, ui/keypad, core/router, core/shell, core/games, screens/home, screens/learn, screens/review,
screens/progress, screens/tree, screens/settings, screens/about, screens/lab, core/boot`.
CSS order: `tokens, base, kit, screens/*` (all screens), games CSS is injected by the shell on demand.

`index.html` head must start with an inline guard so relative URLs work when served as `/wordsprout`:
```js
if (!location.pathname.endsWith('/') && !/\.html$/.test(location.pathname)) location.replace(location.pathname + '/' + location.search + location.hash);
```
then an inline pre-paint script that applies `data-theme`, `data-look`, `data-motion` from saved settings
(key `wordsprout.v1.settings`) and `prefers-*` media queries. Viewport meta:
`width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`.

### 1.3 Routes

| Hash | Screen | Owner |
|---|---|---|
| `#/` | home | E1 |
| `#/learn` → redirect to `#/learn/<settings.level>` | learn | E1 |
| `#/learn/:level` | level switch + chapter list | E1 |
| `#/chapter/:level/:chapterId` | chapter: games + word list | E1 |
| `#/play/:level/:setId/:gameId` | game frame (`setId` = chapter id, `mistakes`, `due`, `_fixture` in test mode) | A1 + D |
| `#/review` | review hub | E3 |
| `#/progress` | statistics + calendar + tree | E2 |
| `#/settings`, `#/about` | settings, about | E3 |
| `#/lab` | keyboard diagnostics | A2 |

Unknown routes → home. Each screen's root element: `<section data-ws="screen" data-screen="<name>" class="s-<name>">`
inside `<main data-ws="view">`.

### 1.4 Design tokens
`css/tokens.css` (A2) defines all colours, spacing, radii, font sizes, shadows, durations as custom properties
for light and `[data-theme=dark]`; `[data-look=simple]` (flat, no decorative backgrounds) and `[data-motion=reduce]`
(durations 0). Palette: our own warm cream + leaf green + sunflower accent (see STYLE.md). Everybody uses tokens,
never raw colours (except inside the tree/illustration SVGs).

## 2. Data

### 2.1 `data/chapters.json` (C1)
```json
{ "version": 1,
  "meta": { "chapters": 30, "wordsPerChapter": 20 },
  "chapters": [
    { "id": "food", "en": "Food", "ru": "Еда", "emoji": "1f35e",
      "order": { "easy": 2, "hard": 9 },
      "words": ["bread", "apple", "cook", "…20 ids in teaching order"] } ] }
```
`order.easy` and `order.hard` are each a permutation of 1..30. Hard order differs noticeably from Easy.

### 2.2 `data/words/<chapterId>.json` (B agents)
```json
{ "chapter": "food",
  "words": [
    { "id": "apple", "en": "apple", "ru": "яблоко", "pos": "noun", "emoji": "1f34e",
      "forms": ["apples"],
      "easy": { "en": "<3–8 word sentence>", "ru": "<перевод>", "answer": "apple" },
      "hard": { "en": "<9–16 word sentence>", "ru": "<перевод>", "answer": "apple" } },
    { "id": "cook", "en": "cook", "ru": "готовить", "pos": "verb", "emoji": "1f373",
      "forms": ["cooks", "cooked", "cooking"],
      "verb": { "base": "cook", "s": "cooks", "past": "cooked", "pp": "cooked", "ing": "cooking" },
      "drills": [
        { "tense": "present-simple",     "en": "<sentence with ___>", "ru": "…", "answer": "cooks" },
        { "tense": "past-simple",        "en": "…___…", "ru": "…", "answer": "cooked" },
        { "tense": "present-continuous", "en": "…___…", "ru": "…", "answer": "is cooking" },
        { "tense": "present-perfect",    "en": "…___…", "ru": "…", "answer": "has cooked" } ],
      "easy": { "...": "..." }, "hard": { "...": "..." } } ] }
```
- `id`: `[a-z][a-z0-9-]*`, unique across all chapters (homographs get a suffix: `bat-animal`).
- `emoji`: lowercase hex codepoints joined with `-`, `fe0f` removed, or `null`. Must exist in `tools/emoji-index.json`.
- `pos`: noun, verb, adj, adv, prep, pron, num, phrase, other. Optional: `ruAlt` (string[]), `note` (Russian clarification).
- The `answer` of easy/hard is `en` or one of `forms` and occurs exactly once as a whole token in `en`.

### 2.3 `data/games.json` (A1) — fixed ids and order
| order | id | title (ru) | scope | needs |
|---|---|---|---|---|
| 1 | `spell` | Напиши слово | chapter | picture |
| 2 | `pick` | Выбери картинку | chapter | picture, ≥ 4 distinct emoji |
| 3 | `match` | Найди пары | chapter | picture |
| 4 | `gap` | Вставь слово | chapter | sentence |
| 5 | `recall` | Вспомни и напиши | chapter | — |
| 6 | `dictation` | Диктант | chapter | sentence |
| 7 | `wordsearch` | Найди слова | chapter | short (≤ 9 letters, letters only) |
| 8 | `build` | Собери предложение | chapter | sentence |
| 9 | `tenses` | Времена глаголов | chapter | verb |
| 10 | `shadowing` | Повтори вслух | chapter | sentence |
| 11 | `mistakes` | Работа над ошибками | global | — |
| 12 | `srs` | Повторение | global | — |

Entry: `{ "id", "order", "title", "blurb", "icon": "<emoji code>", "scope", "needs": [], "minWords", "size": 10, "enabled": true }`.
`enabled:false` hides a game without code changes. `_example` is not listed (test mode can still open it).

### 2.4 Validation (`tools/validate-data.mjs`, A3)
Errors (block): JSON parses; counts (30 chapters × 20 words); ids valid and unique; every planned word present in
order in its file; `en` matches `^[a-z]+([ '-][a-z]+)*$` (2–20 chars); `ru` has Cyrillic and no Latin letters;
`pos` valid; `forms` lowercase, unique, not containing `en`; emoji null or in index, unique within a chapter, at least
14 of 20 words with emoji; sentences: chars `[A-Za-z ,'\-.!?]` only, capital first letter, end `.`/`!`/`?`, no double
spaces, Easy 3–8 tokens, Hard 9–16 tokens, `answer` occurs exactly once as a whole token and is `en`/form/verb form,
`ru` has Cyrillic, no Latin, ends with `.`/`!`/`?`; Easy ≠ Hard; every English sentence unique across the dataset
(normalised letters only, drills included); verbs: `verb.base == en`, all forms `^[a-z]+$` and in `forms`, exactly 4
drills one per tense, each drill has exactly one `___`, filled sentence passes the sentence rules (3–16 tokens),
answer shape per tense (present-simple: s|base; past-simple: past; present-continuous: (am|is|are) ing;
present-perfect: (have|has) pp); at least 4 verbs per chapter. After emoji fetch: `img/emoji/<code>.webp` exists for
every code.
Warnings: British spellings (colour, favourite, centre, theatre, grey, travelling, neighbour, organise, realise,
metre, …); same emoji in several chapters; ru/en length ratio outside 0.5–2.5; words > 9 letters (not in wordsearch).
CLI: `node wordsprout/tools/validate-data.mjs [--skeleton] [--chapter <id>]… [--allow-missing] [--json] [--file <path>]`.
Exit code 1 on errors.

### 2.5 Emoji pipeline (A4)
- Source: Microsoft Fluent Emoji (MIT), **3D style**, pinned commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`.
  Index: sparse git checkout of `assets/*/metadata.json` (into `$SCR`), build `tools/emoji-index.json`:
  `[{ "code": "1f34e", "name": "red apple", "group": "Food & Drink", "keywords": [...], "dir": "Red apple", "tone": false }]`
  (codes from `metadata.json` `unicode`, joined with `-`, `fe0f` dropped; skin-tone emoji use the `Default` folder).
- `node wordsprout/tools/fetch-emoji.mjs` collects every code used in `data/*.json`, `data/words/*.json` and
  `tests/fixtures/*.json`, downloads each 3D PNG from
  `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@<commit>/assets/<dir>/3D/<file>.png` (or `Default/3D/`),
  converts to WebP 160×160 quality 82 with Pillow (`python3 -I`), writes `img/emoji/<code>.webp`, deletes unused
  files, fails if a code is missing or a file > 25 KB, and writes `LICENSES/fluent-emoji/LICENSE` (repo root).
  Caches downloads in `$SCR/emoji-cache/`.

## 3. Runtime APIs (`window.WS`)

```
WS.util     q, qa, el(tag, props, ...kids), shuffle(arr, rng), sample(arr, n, rng), rng(seed) → () => float,
            plural(n, ['слово','слова','слов']), todayKey(date?) → 'YYYY-MM-DD' (local), addDays(key, n),
            daysBetween(a, b), norm(s) (NFC, lowercase, ’‘ → '), isLetter(ch), sleep(ms, signal)
WS.t(key, vars)                 shared Russian strings (i18n.js)
WS.store    get(key, fallback), set(key, value), remove(key), persistent: boolean, onExternalChange(fn)
WS.settings get() → Settings, set(patch), on(fn) → unsubscribe
WS.data     init() → Promise, chapters(level?) → Chapter[] (sorted by order[level]), chapter(id),
            words(chapterId) → Promise<Word[]>, wordsByIds(ids) → Promise<Word[]>, chapterOf(wordId),
            sentence(word, level) → { en, ru, answer, tokens: [{ t, kind: 'word'|'space'|'punct', gap?: true }] },
            tokenize(str), games() → GameMeta[], game(id), eligible(words, meta) → Word[]
WS.progress record(wordId, ok, { game, level, hint }), finishSession(summary) → { learnedNow: [], stageUp: bool, stars },
            word(id) → WordState, isLearned(id), learnedCount(), learnedIn(chapterId), mistakes() → ids,
            clearMistakes(), due(dateKey?) → ids, newForReview(limit) → ids, review(wordId, remembered),
            days() → { key: { a, c, n, t } }, tick(seconds), streak() → { current, best, today: boolean },
            stats(), tree() → { stage, of: 8, name, next, frac, learned }, best(level, setId, gameId) → { stars, score },
            last() / setLast(hash), reset(), exportJSON() → string, importJSON(str) → { ok, error }, on(event, fn)
            // events: 'learned', 'stage', 'change'
WS.speech   init(), status: 'ok'|'novoice'|'blocked'|'off', canSpeak(), unlock(), speak(text, { rate, interrupt = true })
            → Promise<boolean> (never rejects), stop(), voices() → [{ name, lang }], canListen(),
            listen({ timeout }) → Promise<{ transcript, alts } | null>, on(fn)
WS.sfx      ok(), bad(), done(), key(), miss()        // respect settings.sound
WS.router   add(pattern, mount(el, params, query) → cleanup?), go(hash, { replace }), back(), current()
WS.shell    toast(msg), confirm({ title, text, ok, cancel }) → Promise<bool>, setTitle(s), setBack(hash), tabbar(show)
WS.ui       see §3.4
WS.tree     render(el, { stage, frac, size, animate }) → cleanup     (E2; A0 stubs it)
WS.games    register(def), load(id) → Promise<def>, meta(id)
WS.test     enabled, seed, expect, state, records[], spoken[], events[]   // only with ?test=1
```

**Settings** (key `wordsprout.v1.settings`):
`{ level: 'easy', sound: true, autoplay: true, rate: 0.9, voice: '', theme: 'auto', look: 'illustrated',
motion: 'auto', hints: false, translate: true, keyboard: 'system' }`.

### 3.1 Game module interface
```js
/* Игра «…»: … */
(() => {
  'use strict';
  WS.games.register({
    id: 'spell',                         // = file name = games.json id
    howto: 'Посмотри на картинку и напиши слово по-английски.',
    start(host, ctx) {                    // host: empty <div class="g g-spell"> in the game frame
      // build UI, run the session; finally call ctx.finish()
      return () => { /* cleanup what is not bound to ctx.signal */ };
    },
  });
})();
```

`ctx` given by the shell:
| member | contract |
|---|---|
| `level`, `set` | `'easy'|'hard'`; `{ kind: 'chapter'|'mistakes'|'due'|'fixture', id, title }` |
| `words` | session words (already filtered by `needs`, at most `meta.size`, chosen per SPEC §3.1) |
| `pool` | all eligible words of the involved chapter(s), for distractors |
| `allWords()` | Promise of every word (for global distractors) |
| `sentence(word)` | `WS.data.sentence(word, ctx.level)` |
| `rng()` | seeded random float |
| `signal` | AbortSignal fired when leaving; pass it to every listener and timer |
| `speak(text, opts)` | Promise<boolean>, never throws; never await it before enabling input |
| `canSpeak` | live getter |
| `record(wordId, ok, { hint })` | once per word per session (first call wins) |
| `progress(done, total)` | top-bar progress |
| `expect(value)` | test mode: current correct answer (format below) |
| `sfx` | `WS.sfx` |
| `finish({ extra })` | shell shows results built from records; game must stop handling input |
| `exit()` | leave to the chapter page |
| `settings` | read-only snapshot |
| `ui` | `WS.ui` |

`ctx.expect` formats: typing games → the exact string to type (letters, spaces and punctuation as displayed;
fixed cells are skipped by the typer); `pick`/`mistakes` → correct word id; `match` → array of word ids of the
current round; `wordsearch` → `[{ id, r1, c1, r2, c2 }]` for the current round; `build` → array of chip tokens in
order; `srs` → `{ action: 'remember' }`; `shadowing` → `{ action: 'self' }`; `recall` → the string to type.

**Session lifecycle (shell, A1):** route → load `js/games/<id>.js` + `css/games/<id>.css` (10 s timeout → error card
with «Повторить») → resolve words → intro card (`data-state=intro`) → tap «Начать» → `WS.speech.unlock()` and
`start()` **synchronously in the same tap** (`data-state=play`) → game calls `ctx.finish()` → results
(`data-state=done`). Leaving mid-game asks for confirmation only after ≥ 1 record.

### 3.2 Progress storage (A5)
Key `wordsprout.v1.progress`:
```json
{ "v": 1,
  "words": { "apple": { "s": 4, "c": 3, "w": 1, "g": ["spell", "pick"], "m": 0, "box": 2, "due": "2026-10-15",
                         "seen": "2026-10-12", "L": "2026-10-12", "r": "2026-10-13" } },
  "best": { "easy:food:spell": { "stars": 3, "score": 0.9, "n": 2, "last": "2026-10-12" } },
  "days": { "2026-10-12": { "a": 34, "c": 30, "n": 2, "t": 610 } },
  "streakBest": 5, "last": "#/play/easy/food/spell", "newToday": { "2026-10-12": 4 } }
```
Rules: SPEC §5. Writes debounced 300 ms, flushed on `pagehide` / hidden. `storage` event → reload. Corrupt JSON → copy
to `wordsprout.corrupt.<ts>` and start fresh. Quota/security error → in-memory mode + banner «прогресс не
сохранится». `navigator.storage.persist()` on first finished session. Export/import JSON.

### 3.3 Letter input (`WS.ui.letterInput`, A2)
```
opts: { target, mode: 'strict', fixed: ch => !/[a-z]/i.test(ch), signal, keyboard: settings.keyboard,
        prefix: 'to' | null, size: 'word'|'sentence', onLetter(i, ok, ch), onComplete({ mistakes, hinted }) }
returns { el, focus(), setTarget(str, { prefix }), reveal(on), revealed, fillAll(), destroy(), mistakes, hinted }
```
- Cells grouped per word in `nowrap` groups; fixed cells pre-filled; `--n` = longest word (sizes `--cell`).
- One real `<input type="text" inputmode="text" autocomplete="off" autocorrect="off" autocapitalize="none"
  spellcheck="false" enterkeyhint="done" data-ws="letters-input">`, invisible (`opacity:0`, font-size 16px,
  transparent caret, never `display:none`) and covering the cells; `setTarget()` reuses it (keyboard stays open).
- Algorithm (must pass `tests/ime.mjs`):
  1. `beforeinput` `insertText` while not composing → `preventDefault`, feed `e.data` char by char.
     `deleteContentBackward` → `preventDefault` (strict mode ignores it).
  2. Other input types (`insertCompositionText`, `insertReplacementText`, `insertFromPaste`) are not prevented.
     On `input`: if composing, feed only chars added since composition start (ignore shrinking); else feed the whole
     value and clear it.
  3. `compositionend` → feed any remainder, then reset the value on the next tick. Never write the value during composition.
  4. Feed a char: `norm()`, skip spaces/fixed; match current cell → accept (`.is-ok`, `WS.sfx.key()`); else flash
     `.is-bad`, `mistakes++`, `WS.sfx.miss()`, Cyrillic → `WS.shell.toast` hint (rate-limited); never accept wrong.
  5. First composition seen → one-off tip offering the built-in keyboard. `keyboard: 'builtin'` → `inputmode="none"`
     and `WS.ui.keypad` (QWERTY, big keys, `data-ws="key" data-key="a"`) shown under the cells.
- `reveal(true)` shows the remaining letters faded (`.is-hint`) and sets `hinted = true`.

### 3.4 UI kit (`WS.ui`, A2)
`button({ text, icon, kind: 'primary'|'secondary'|'ghost', onClick })`, `iconButton`, `speakerButton({ text, slow })`
(`data-ws="speak"`), `eyeButton` (`data-ws="reveal"`), `picture(word, { size, letter: false })`, `hint(ru)` (respects
`settings.translate`), `sentence(tokens, { gapNode, bold })`, `choiceGrid({ items, columns, onPick })` (items with
`data-ws="choice" data-word-id`; returns `{ el, mark(id, 'ok'|'bad'), lock() }`), `progressBar`, `stars(n)`, `card`,
`modal`, `feedback(el, 'ok'|'bad')`, `nextButton` (`data-ws="next"`), `timing` (`{ ok: 700, bad: 1400 }`, 0 with
reduced motion), `icons` (own inline SVG strings: back, close, speaker, turtle, eye, eye-off, check, cross, star,
flame, home, book, repeat, chart, gear, mic, keyboard, shuffle, pause, play, lightbulb, trash, download, upload).
Picture fallback: `<img src="img/emoji/<code>.webp" width height alt="<ru>" decoding="async">` → on error the system
emoji via `String.fromCodePoint` → no emoji: a coloured tile (hue from word id) with the Russian word (the initial
letter only when `letter: true`).

### 3.5 Speech (A1)
SPEC §9. `unlock()` speaks an empty utterance at volume 0 inside the «Начать» tap. 2 s start watchdog →
`status = 'blocked'` + banner. Split text > 200 chars at sentence ends. Recognition only for shadowing; disable for
the session after the first `network` / `not-allowed` / `service-not-allowed` error or when `navigator.brave` exists.

### 3.6 DOM hooks (for tests)
- Screens: `[data-ws=view]`, `[data-ws=screen][data-screen=<name>]`; tab bar `[data-ws=tabbar]` with
  `[data-ws=tab][data-tab=home|learn|review|progress|settings]`.
- Game frame: `[data-ws=game][data-game=<id>][data-state=loading|intro|play|done|error]`, `[data-ws=start]`,
  `[data-ws=results]`, `[data-ws=again]`, `[data-ws=exit]`, `[data-ws=next-game]`.
- Letter input: `.ws-letters`, `[data-ws=letters-input]`, `.ws-cell[data-i]` with `.is-ok .is-bad .is-hint .is-fixed .is-cur`.
- Controls: `[data-ws=choice][data-word-id]`, `[data-ws=speak]`, `[data-ws=reveal]`, `[data-ws=next]`,
  `[data-ws=key][data-key]`.
- Word search: `[data-ws=cell][data-r][data-c]`. Build: `[data-ws=chip][data-token][data-i]`.
  Match: `[data-ws=pair][data-side=pic|word][data-word-id]`. SRS: `[data-ws=remember]`, `[data-ws=forget]`.
  Shadowing: `[data-ws=self-ok]`, `[data-ws=self-again]`, `[data-ws=pause]`.
- Chapter screen: `[data-ws=game-card][data-game=<id>]`, `[data-ws=word-row][data-word-id]`.
  Learn screen: `[data-ws=chapter-tile][data-chapter=<id>]`, `[data-ws=level][data-level=easy|hard]`.

### 3.7 Test mode
`?test=1&seed=N` (before `#`): `WS.test.*` filled; `data-motion=reduce`; `WS.ui.timing` = 0;
`#/play/<lvl>/_fixture/<game>` uses `tests/fixtures/fixture.json` (12 words incl. 4 verbs with drills; global games
use the fixture words); `speech.speak` logs every text to `WS.test.spoken` and resolves `true` immediately (no real
audio) unless `&tts=off` (then `canSpeak` is false). `WS.test.state` mirrors the game frame `data-state`.

Driver interface `tests/drivers/<id>.mjs`:
```js
export const id = 'spell';
export async function playRound(page, h) {}   // finish the whole session correctly using h.type()/h.tap() only
export async function makeMistake(page, h) {} // optional: one wrong answer, then continue
// h = { expect(prev) /* waits until WS.test.expect changes */, type(text, { via: 'keys'|'insertText'|'ime' }),
//       tap(sel), waitState(s), shot(name), page }
```

### 3.8 Test runners (A6)
- `node wordsprout/tests/smoke.mjs [--game <id>|--all] [--set _fixture|<chapterId>] [--levels easy,hard]
  [--viewports phone,desktop] [--input keys,ime,insertText] [--tts on,off] [--base URL] [--out DIR]` —
  starts a static server on a free port (repo root) unless `--base`; phone = 390×844 mobile touch DPR 3, desktop =
  1280×800; fails on console errors, page errors, failed or cross-origin requests, results not reached, wrong record
  count, horizontal overflow on phone, visible tap targets < 44×44 px; writes screenshots.
- `tests/ime.mjs [--target lab|<gameId>]`, `tests/unit.mjs`, `tests/screens.mjs [--screen …]`, `tests/perf.mjs`
  (4× CPU slowdown: game ready ≤ 1500 ms after «Начать»; initial load without emoji ≤ 400 KB; each game JS ≤ 40 KB).
- Playwright: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'`, launch with
  `executablePath: '/opt/pw-browsers/chromium'`.

# WordSprout — visual style and UI kit

Owner: A2. Read together with `SPEC.md` (behaviour) and `CONTRACTS.md` (APIs, files, DOM hooks). This file says
how WordSprout **looks, moves, sounds and speaks**, and how to build screens and games with the kit (`WS.ui`,
`css/kit.css`). If something here disagrees with SPEC or CONTRACTS, they win.

Files: `css/tokens.css` (all design tokens), `css/base.css` (reset, page, focus, reduced motion), `css/kit.css`
(every `.ws-*` class, including the shell), `js/ui/icons.js`, `js/ui/kit.js`, `js/ui/letter-input.js`,
`js/ui/keypad.js`. Live examples: `#/lab` (letter input, keyboards, event log).

---

## 1. Principles

1. **Warm paper, living green, a little sunshine.** Cream background, leaf green for actions and progress, sunflower
   yellow for rewards (stars, streak, badges). Everything else is quiet.
2. **Picture first, one task at a time.** A game screen shows one picture, one question, one answer area and one
   row of actions. No sidebars, no clutter.
3. **Big and kind.** Every tap target is at least 44×44 px; feedback is instant, short and never punishing.
4. **Works with the phone keyboard open.** A typing screen must still show the top bar, the picture, the cells and
   one row of actions in ~390×430 px (§7).
5. **Same rules everywhere.** Screens and games use tokens and kit components, never their own colours, fonts or
   look-alike buttons.

## 2. Colour tokens

Use only `var(--token)`. Raw colours are allowed only inside illustration SVGs (tree, app icon). Light values are
on `:root`, dark values on `[data-theme=dark]`; the tokens flip by themselves, so screen and game CSS never needs a
theme selector.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#fbf6ea` cream | `#1a1c16` olive charcoal | page background |
| `--surface` | `#fffdf7` | `#24271f` | cards, cells, dialogs, choice cards |
| `--surface-2` | `#f4eddc` | `#2e3228` | secondary buttons, tracks, fields, log boxes |
| `--surface-3` | `#ebe2cc` | `#393e32` | pressed secondary elements |
| `--text` | `#2d2a22` | `#f0ecdf` | main text, English words |
| `--text-muted` | `#6b6553` | `#b3ad99` | Russian translations, captions, secondary text |
| `--text-faint` | `#9a927c` | `#7e7a69` | decoration only (never the only carrier of meaning) |
| `--border`, `--border-strong` | `#e6dcc3`, `#cfc2a3` | `#3a3f32`, `#545b48` | dividers; empty cell outline |
| `--card-line` | 12 % brown | 7 % cream | hairline around cards |
| `--primary` | `#3a8034` leaf | `#6cbf5f` | primary button fill, progress fill, current cell |
| `--primary-ink` | `#ffffff` | `#10200d` | text on `--primary` |
| `--primary-strong` | `#2f6b2a` | `#8fd483` | green text and icons on the page, links |
| `--primary-soft`, `--primary-line` | `#e4f0da`, `#b9d7a8` | `#263a22`, `#3f6236` | selected states, active tab, given answer |
| `--accent` | `#f3b724` sunflower | `#f6c445` | stars, badges, streak flame, reward highlights |
| `--accent-ink` | `#3a2c00` | `#2c2100` | text on `--accent` |
| `--accent-strong` | `#956200` | `#f8d06a` | star outline, accent text on the page |
| `--accent-soft` | `#fcefc8` | `#3b3219` | tips, notes, banners |
| `--ok`, `--ok-ink`, `--ok-soft`, `--ok-line` | greens | greens | correct answer: border, text, fill, outline |
| `--bad`, `--bad-ink`, `--bad-soft`, `--bad-line` | terracotta | terracotta | wrong answer — warm, not alarm red |
| `--hint` | `#918970` | `#858069` | faded hint letters in cells (≈ 3.4:1 — readable but clearly paler than typed letters) |
| `--focus` | `#2f6b2a` | `#f6c445` | keyboard focus ring |
| `--scrim`, `--inverse`, `--text-inverse` | | | dialog backdrop; toast plate and its text |
| `--pic-bg`, `--pic-shadow` | soft cream radial | dark radial | behind every picture; drop shadow under emoji |
| `--tile-bg-s/l`, `--tile-ink-s/l` | | | saturation/lightness of the word tile (hue comes from the word id) |
| `--bg-deco-1/2` | green / sunflower glow | dimmer | the two soft background blobs (`body::before`) |
| `--shadow-s`, `--shadow`, `--shadow-l`, `--shadow-key` | warm brown, low | black, deeper | buttons; cards; dialogs and toasts; keypad keys |

Contrast: `--text` and `--text-muted` pass 4.5:1 on `--bg`, `--surface` and `--surface-2` in both themes; white on
`--primary` is 4.9:1; `--primary-strong` and `--accent-strong` pass 4.5:1 on the page background. `--ok-ink` on
`--ok-soft` and `--bad-ink` on `--bad-soft` pass 4.5:1. Green and terracotta are
never the only signal: cells also change fill and animate, cards get an icon or a text line.

## 3. Type

- **Font:** the system UI font, rounded where the platform has one: `var(--font)` (`ui-rounded, …, system-ui,
  Roboto, …`). No web fonts. Monospace only for logs and codes: `var(--font-mono)`.
- **Sizes:** `--fs-xs` 12, `--fs-s` 14, `--fs-m` 16 (body, buttons), `--fs-ml` 18 (game sentences), `--fs-l` 20
  (card titles, words in lists), `--fs-xl` 28 (the English word to learn, screen titles), `--fs-2xl` 28–40 and
  `--fs-3xl` 34–52 (fluid hero titles).
- **Weights:** 400 text, 600 Russian translation and captions, 700 buttons and titles, 800 (`--fw-black`) the
  English word and the logo.
- **Line height:** `--lh` 1.5 for paragraphs, `--lh-snug` 1.35 for UI text, `--lh-tight` 1.15 for big titles.
- English words are the heroes: bold or black, `--text`. Russian translation sits under them in `--text-muted`,
  semibold, one size smaller. Verbs read «to cook»: «to» is smaller and muted (`.ws-word__to`,
  `.ws-letters__prefix`).
- Numbers that change (counters, timers) use `font-variant-numeric: tabular-nums`.
- Sentence case everywhere. No ALL CAPS, no letter-spacing tricks, no italics for Russian.

## 4. Space, shape and size

- **Spacing scale (4 px step):** `--space-1` 4, `--space-2` 8, `--space-3` 12, `--space-4` 16, `--space-5` 24,
  `--space-6` 32, `--space-7` 48, `--space-8` 64. Side gutter on phones `--gutter` 16. Use `gap` on flex/grid
  parents instead of margins on children.
- **Radii:** `--radius-xs` 6, `--radius-s` 10 (fields, keys), `--radius-m` 16, `--radius-l` 24 (cards, choice
  cards), `--radius-xl` 32 (dialogs, intro/results cards), `--radius-pill` (buttons, chips, switches, bars).
  Pictures use 22 % of their size, cells 24 % of the cell.
- **Sizes:** `--tap` 44 (minimum for anything tappable; kit buttons are 48), `--header-h` 56, `--tabbar-h` 64,
  `--gamebar-h` 56, `--maxw` 560 (game column), `--maxw-text` 640 (reading column), `--maxw-page` 960 (app
  screens on desktop). Icons 24 (`--icon`), 20 inside buttons.
- **Pictures:** `--pic-xs` 40 (inline), `--pic-s` 64 (lists), `--pic-m` 112 (cards), `--pic-l` 160 (big),
  `--pic-game` = `clamp(96px, 24dvh, 184px)` — the game picture shrinks when the keyboard opens and never goes
  below 96 px.
- **Elevation:** three steps only — `--shadow-s` (buttons), `--shadow` (cards), `--shadow-l` (dialogs, toast,
  hover on link cards). Cards also have a 1 px `--card-line` border so they stay visible without shadows.

## 5. Themes, the simple look and motion

The pre-paint script in `index.html` always sets `<html data-theme="light|dark" data-look="illustrated|simple"
data-motion="full|reduce">` before the first paint (from settings and `prefers-*`); `WS.settings` keeps them
current. `tokens.css` also follows `prefers-color-scheme` / `prefers-reduced-motion` when the attributes are missing.

**Dark mode rules**
- Never pure black or pure white: the background is olive charcoal, text is warm cream.
- Surfaces get *lighter* as they come forward (`--bg` < `--surface` < `--surface-2` < `--surface-3`); shadows are
  darker but still soft. Hairlines (`--card-line`) keep cards readable.
- Green and sunflower are lighter and a bit less saturated; text on them flips to dark ink (`--primary-ink`,
  `--accent-ink`). The focus ring is sunflower.
- Emoji pictures are not inverted or dimmed; they sit on `--pic-bg`. Word tiles use the dark tile tokens.
- Illustrations (tree, app icon) bring their own colours; check them on both backgrounds.

**Simple look** (`[data-look=simple]`, «Вид: простой»): the decorative blobs and shadows disappear and picture
backgrounds become flat (`--bg-deco-*`, `--shadow*`, `--pic-shadow` → none/transparent). Do not add decoration that
bypasses these tokens. Cards keep their hairline border.

**Reduced motion** (`[data-motion=reduce]`, also forced in test mode): every duration token is `0ms` and
`base.css` turns all CSS animations and transitions off. In JS read delays from `WS.ui.timing` (all zeros then),
never wait for `animationend`/`transitionend`, and never hide content behind an animation. Colour changes (red
flash, green cells) stay — they are information, not motion.

## 6. Game screen anatomy

```
┌──────────────────────────────────────┐
│ ✕  Напиши слово   ▓▓▓▓▓░░░░  3/10  🔊 │  .ws-game__bar (shell, A1): leave, title, progress, sound
├──────────────────────────────────────┤
│              ┌────────┐              │  .ws-stage__media
│              │   🍎   │              │    WS.ui.picture(word, { size: 'game' })
│              └────────┘              │
│               яблоко                 │    WS.ui.hint(word.ru)
│                                      │  .ws-stage__prompt   word / sentence / audio button
│     ┌──┐┌──┐┌──┐┌──┐┌──┐             │  .ws-stage__answer   letterInput / choiceGrid / chips
│     │a ││p ││  ││  ││  │             │
│     └──┘└──┘└──┘└──┘└──┘             │
│  (🔊) (🐢) (👁)            [Дальше →] │  .ws-stage__actions  speaker, slow, eye … spacer … next
└──────────────────────────────────────┘
```

- Build it with `WS.ui.stage({ media, prompt, answer, actions })`; empty parts collapse. The column is centred
  and at most `--maxw` (560 px) wide; on desktop the extra space stays empty — do not stretch.
- Order is always picture → prompt → answer → actions. Translations live under the picture (or under a sentence),
  never inside the answer area.
- Actions: listening buttons on the left (`speakerButton`, `speakerButton({ slow: true })`), help in the middle
  (`eyeButton`), `spacer()`, then the forward action on the right (`nextButton`). One row, no wrapping on a
  390 px phone: at most four round buttons plus one text button.
- Intro and results cards are drawn by the shell (`.ws-intro`, `.ws-results`); a game only fills `host`.
- Choice games: `choiceGrid` with 2 columns on phones (`columns: 2`); 4 columns only when `min-width: 720px` and
  the cards are pictures. Match and word search use their own grids but the same card look (`.ws-choice` states).

## 7. Layout budget with the keyboard open

With `interactive-widget=resizes-content` the layout viewport shrinks to roughly **390×430** on a phone with the
keyboard open. A typing screen must keep visible: the game bar, the picture (≥ 96 px), the cells and one row of
actions.

Below 560 px of height (keyboard open, or a phone in landscape) `kit.css` switches the game to a **compact
layout**: the game bar is 48 px, stage gaps are 8 px, and the translation moves to the right of the picture.
Measured with the kit at 390×430 (input focused, so the «Нажми, чтобы печатать» label is hidden):

| Part (y in px) | Word (`spell`) | Sentence + its translation, 3 rows of cells |
|---|---|---|
| game bar | 0–48 | 0–48 |
| picture (`--pic-game` = 24dvh → 103 px, never < 96), translation beside it | 52–155 | 52–155 |
| cells end at (word: `--cell-max` 56 × 1.2; sentence: ≤ 32 px underline cells) | 233 | 333 |
| actions row (48 px buttons) ends at | 293 | 393 |

Long «Сложный» sentences (dictation, 12–16 words) do not fit completely: the page scrolls, and the letter input
keeps the current cell on screen by itself. Rules that keep the budget: size pictures with `size: 'game'`; never
give text blocks fixed heights; use `dvh`, not `vh`, for anything tied to the screen height; put long extras
(sentence translation after solving, tables) *below* the actions; do not add margins around the stage; keep the
actions to one row (three round buttons + «Дальше» fit at 360 px). Test every typing game at 390×430 and 360×640.

## 8. Feedback, sound and timing

| Event | Look | Sound | Then |
|---|---|---|---|
| right letter | cell turns green with a small pop (`.is-ok`) | `WS.sfx.key()` (letter input does it) | next cell becomes current |
| wrong letter | current cell flashes terracotta and shakes for 300 ms (`.is-bad`), the typed letter shows faintly | `WS.sfx.miss()` (letter input does it) | nothing else; strict mode waits for the right letter |
| Cyrillic letter | same as wrong letter + toast «Включи английскую раскладку» (max once per 30 s) | `miss` | — |
| word/sentence solved | all cells green, a small wave left to right (`.is-done`) | game: `ctx.sfx.ok()`, then speak the word | auto-advance after `WS.ui.timing.ok` (700 ms) or show «Дальше» if there is something to read |
| right choice | card green (`mark(id, 'ok')`) | `ctx.sfx.ok()` | as above |
| wrong choice | chosen card terracotta + shake, right card green | `ctx.sfx.bad()` | «Дальше» (`nextButton`); no auto-advance after a mistake unless the game spec says so (`timing.bad` 1400 ms) |
| wrong pair (match) | both flash terracotta | `ctx.sfx.bad()` | input blocked for `timing.pair` (450 ms) |
| round finished | — | `ctx.sfx.done()` | «Дальше» |
| help used (eye, «не знаю») | faded letters (`.is-hint`) / answer shown in soft green (`.is-given`) | none | item counts as helped |

`WS.ui.timing` (live getter, zeros under reduced motion and in test mode): `ok` 700, `bad` 1400, `flash` 300,
`pair` 450, `step` 350 (pause between speaking the word and the sentence). CSS duration tokens: `--dur-fast` 120 ms
(hover, press), `--dur` 200 ms (state changes), `--dur-slow` 400 ms (dialogs, progress), `--dur-pop` 220 ms (green
pop), `--dur-flash` 300 ms (red flash). Easing: `--ease` for most, `--ease-spring` for pops and dialogs.

Never: full-screen red, shaking the whole page, sad faces, negative points, sounds louder than the chime, blocking
the next tap while a sound plays. Visual feedback must never depend on sound (sound can be off).

## 9. Russian wording

- Address the learner as «ты»: «Напиши слово», «Нажми на картинку», «Послушай ещё раз».
- Always write **ё**: «ещё», «всё», «Лёгкий», «твоё», «Повторённые».
- Quotes «ёлочки» (nested „лапки“), the em dash — with spaces, an en dash in ranges «1–4», «≥ 44».
- Buttons are verbs or short verb phrases, sentence case, no full stop, no «!»: «Начать», «Дальше»,
  «Проверить», «Ещё раз», «Показать перевод», «Другая игра», «Следующая игра», «Скопировать лог». Never «ОК»,
  «Submit», «Next».
- Praise is short and varied: «Верно!», «Отлично!», «Так держать!», «Без единой ошибки!». After a mistake be
  kind and concrete: «Почти! Правильно — garden», «Ничего страшного, повторим». Never blame («Ты ошибся»).
- Counters use `WS.util.plural`: «1 слово», «3 слова», «5 слов»; scores read «Без ошибок: 8 из 10».
- English words inside Russian text: as a styled element (bold or `.ws-word`) or in «ёлочки» in plain text.
- Titles and labels: no full stop. Full sentences: full stop. Keep hints to one line on a phone (≈ 40 chars).
- Shared strings live in `WS.t()` (i18n.js); screen-specific ones may stay in the screen file.

## 10. Using the kit (`WS.ui`)

All builders return real elements and take an optional `signal` (pass `ctx.signal`), so listeners and shortcuts
go away when the player leaves. Text is always set with `textContent`.

```js
const { ui } = ctx;
const li = ui.letterInput({ size: 'word', signal: ctx.signal, onComplete: solved });
const eye = ui.eyeButton({ signal: ctx.signal, onToggle: (on) => li.reveal(on) });
const next = ui.nextButton({ signal: ctx.signal, onClick: nextItem });
next.hidden = true;
const st = ui.stage({
  media: [ui.picture(word, { size: 'game' }), ui.hint(word.ru)],
  answer: li.el,
  actions: [ui.speakerButton({ text: word.en, signal: ctx.signal }),
    ui.speakerButton({ text: word.en, slow: true, signal: ctx.signal }), eye, ui.spacer(), next],
});
host.append(st.el);
li.setTarget(word.en, { prefix: word.pos === 'verb' ? 'to' : null });
```

| Builder | Notes |
|---|---|
| `button({ text, icon, iconEnd, kind, size, block, onClick, ws, key, keepFocus, href, disabled })` | kinds `primary` (one per screen), `secondary`, `ghost`, `accent`, `danger`; sizes `lg`, `sm`; 48 px tall pill |
| `iconButton({ icon, label, kind, size, pressed, onClick, ws, key })` | round 48 px (`s` 44, `l` 56, `xl` 96); kinds `soft` (default), `plain`, `primary`, `accent`; `label` is required (Russian, used for `aria-label`); keeps the focus in the letter input |
| `speakerButton({ text, slow })` | `data-ws="speak"`; `text` may be a function; `slow` → turtle icon, rate 0.7; pulses while speaking; Ctrl+Space plays the normal one; when speech is off it is dimmed and a tap shows a toast |
| `eyeButton({ onToggle, pressed })` | `data-ws="reveal"`, `aria-pressed`, eye / eye-off icon, Ctrl+H |
| `nextButton({ text: 'Дальше', onClick })` | `data-ws="next"`, arrow icon, Enter while visible (also from the letter input) |
| `picture(word, { size, letter })` | sizes `xs s m l game fill` or px; webp → system emoji → hue tile with the Russian word (`letter: true`, and always for `xs`/`s` or < 72 px → first letter); `alt` is the Russian word. In choice cards whose label already shows the translation pass `letter: true` |
| `emoji(code, { size })` | UI emoji (game icons, chapters), same fallback |
| `hint(ru)` | muted translation line, hidden when settings.translate is off |
| `sentence(tokens, { gapNode, bold })` | from `WS.data.sentence(...).tokens`; `bold` highlights the answer; `gapNode` (e.g. `li.el`) replaces it inline |
| `choiceGrid({ items, columns, onPick })` | items `{ id, word?, node?, text? }` → `[data-ws=choice][data-word-id]`; `mark(id, 'ok'|'bad'|'picked'|null)`, `lock()`, `unlock()`; keys 1–9 on desktop |
| `progressBar({ value, max })` | `{ el, set(value, max) }` |
| `stars(n, { size })` | 0–3 sunflower stars, `size: 'l'` animates in on results |
| `card({ title, text, kind, onClick, href }, ...kids)` | kinds `flat`, `tint` (green), `accent` (sunflower); clickable cards lift on hover |
| `segmented({ options, value, onChange, ws, attr })` | pill switch (Лёгкий / Сложный, theme, keyboard) with radio semantics and arrow keys |
| `chip`, `badge`, `actions`, `spacer`, `stage`, `empty`, `icon(name)` | small pieces; `empty` = friendly empty state |
| `modal({ title, text, body, actions, dismissible })` | `{ el, close(value), result }`; Esc and backdrop close; focus is trapped and restored |
| `feedback(el, 'ok'|'bad')` | restartable green pop / terracotta shake on any element (visual only — play the sound yourself) |
| `timing` | see §8 |
| `shortcut(combo, node, fn)`, `keepFocus(node)`, `isTouch()` | desktop shortcuts (`enter`, `ctrl+space`, `ctrl+h`, `1`–`9`); keep focus in the letter input when tapping a custom button |

The shell classes are styled in `kit.css` too: `.ws-app`, `.ws-header` (+ `__back`, `__logo`, `__icon`, `__name`,
`__title`), `.ws-tabbar`/`.ws-tab` (bottom bar on phones, top bar ≥ 720 px; `.is-active`), `.ws-badge`, `.ws-view`,
`.ws-toast` (a contrasting plate under the header — not at the bottom, where the phone keyboard would cover it),
`.ws-banner`, `.ws-confirm`/`.ws-modal`, `.ws-game` (+ `__bar`, `__leave`, `__title`, `__progress`,
`__sound`, `__host`), `.ws-intro`, `.ws-results`, `.ws-error`. Screens and games must not restyle `.ws-*` classes;
they may set the documented custom properties: `--pic` on `.ws-pic`, `--cols` on `.ws-choices`, `--cell-max`
on `.ws-letters`, `--star` on `.ws-stars`, `--icon-size` on `.ws-icon`.

## 11. Letter input (`WS.ui.letterInput`)

- **One instance per game.** Create it once in `start()` and call `setTarget(next, { prefix })` for every item:
  the same hidden input stays focused, so the phone keyboard stays open between words.
- Created synchronously inside the «Начать» tap (or right after another tap), it focuses itself on phones when it
  lives inside the game frame; on desktop it always focuses itself. Never call `focus()` from a timer on a phone
  unless the user just tapped — the keyboard would jump.
- Options: `size: 'sentence'` for sentences (smaller underline cells), `prefix: 'to'` for verbs (never typed),
  `fixed` (default: everything that is not a–z is pre-filled), `hints` (default: settings «бледные подсказки»),
  `autofocus` (`'auto'`, `true`, `false`), `onLetter(i, ok, ch)`, `onComplete({ mistakes, hinted })`.
- State: `mistakes`, `hinted`, `revealed`, `done`; `reveal(on)` (eye), `fillAll({ complete })` («не знаю» / show
  the answer), `destroy()` (automatic with `signal`).
- Buttons next to it must not steal focus: kit icon buttons, `nextButton` and `button({ keepFocus: true })` already
  cancel `mousedown`; for your own buttons call `WS.ui.keepFocus(btn)`.
- Gap sentences: `WS.ui.sentence(tokens, { gapNode: li.el })` turns it into the inline variant.
- Do not: create a new input per item, write `input.value`, add your own key listeners for letters, hide the input
  with `display: none`, put anything focusable on top of the cells.
- Cells: `--n` (longest word) sizes them so the longest word fits one line down to 360 px (12 px minimum); words
  never break, lines break between words; punctuation, digits, apostrophes and hyphens are fixed cells.
- Cell states: `.is-cur` (green outline; ring and blinking caret while focused), `.is-ok` (green, pop),
  `.is-bad` (terracotta flash 300 ms with the typed letter shown faintly), `.is-hint` (pale letter, dashed outline),
  `.is-fixed` (no box), `.is-given` (green, dashed — the answer was shown), container `.is-done` (wave).
- Long sentences: when the current cell would go below the keyboard, the letter input scrolls it into view.
- Built-in keyboard: with settings.keyboard = `'builtin'` the input gets `inputmode="none"` and the WordSprout
  keypad (`WS.ui.keypad`, QWERTY, 50 px high keys, `[data-ws=key][data-key]`) appears under the cells. The first
  phone composition shows a one-time tip offering it. Keypad keys are the only tap targets narrower than 44 px
  (10 per row on a 360 px screen).

## 12. Icons

Own set, `WS.ui.icons.<name>` (SVG strings, 24×24, stroke 2, round caps and joins, `currentColor`). Insert with
`WS.ui.icon(name)` or the `icon` option of buttons; size with `--icon-size`. Required set: back, close, speaker,
turtle, eye, eye-off, check, cross, star, flame, home, book, repeat, chart, gear, mic, keyboard, shuffle, pause,
play, lightbulb, trash, download, upload. Extras: sprout, mute, restart, copy, chevron-left/right/down,
arrow-right, info, plus, minus, sun, moon, clock, calendar, target, trophy, list, external. Icons are never the only
label of an action: icon-only buttons have a Russian `aria-label` (and a tooltip on desktop).

App icon: `img/app/icon.svg` (a letter cell with «a» and a sprout growing from it, a sunflower sun) →
`node wordsprout/tools/make-icons.mjs` renders `icon-192.png`, `icon-512.png` and `maskable-512.png`.

## 13. Accessibility

- Tap targets ≥ 44×44 px (kit buttons 48); spacing between neighbours ≥ 8 px.
- Visible focus ring (`:focus-visible`, 3 px `--focus`) on everything focusable; never remove it without a
  replacement. The letter input is the one exception: its focus is shown by the current cell (soft ring and a
  blinking caret), because a text field matches `:focus-visible` all the time.
- Icon buttons have `aria-label`; pictures have the Russian word as `alt`; toggles use `aria-pressed` or radio
  semantics; dialogs are `aria-modal` with focus trap.
- Never rely on colour alone, never on sound alone, never on animation alone.
- Respect reduced motion, dark mode and the simple look automatically by using tokens and `WS.ui.timing`.

## 14. CSS rules for screens and games

- Prefixes: kit `.ws-*` (A2 only), screens `.s-<name>…`, games `.g-<id>…` — every selector in a screen or game
  file starts with its prefix; keyframes are named `s-<name>-…` / `g-<id>-…`.
- Only tokens for colour, space, radius, shadow, font size and duration. No `!important`, no fixed pixel heights
  for text, no `vh` for things that must survive the keyboard (use `dvh`), no horizontal overflow at 360 px.
- Mobile first: design at 390 px, then add `@media (min-width: 720px)` for desktop.
- Animations: short (≤ 400 ms, ambient loops excepted), on `transform`/`opacity`, durations from tokens.

## 15. Do and don't

| Do | Don't |
|---|---|
| one primary button per screen | two green buttons side by side |
| `ui.picture(word, { size: 'game' })` | hard-coded image sizes |
| translation in `--text-muted` under the picture | translation in the answer area |
| «Дальше» after a mistake | auto-skipping before the learner sees the right answer |
| `setTarget()` for the next word | a new letter input per word |
| tokens and kit components | raw colours, custom look-alike buttons |
| short, kind Russian with ё | English UI words, capitals, «!!!» |

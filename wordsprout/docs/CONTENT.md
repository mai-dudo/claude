# WordSprout — content rules (words, sentences, tense drills)

Rule book for everyone who writes `data/words/<chapterId>.json` (the B agents). Read it together with
`CONTRACTS.md` §2.1–§2.4 and §4 (file format and what the validator checks) and `SPEC.md` §4 (how the games use
the data). CONTRACTS wins on the file format; this file wins on wording, style and choices.

The learner is a Russian-speaking adult or teenager, from beginner to intermediate. Every word appears in many
games: as a picture to recognize, a word to type, a sentence to rebuild or to write from dictation, a verb to put
into four tenses. Write so that a learner can understand every sentence with the help of the Russian translation
and enjoy reading it.

## 0. Checklist

1. Take the chapter's 20 ids **in the order of `data/chapters.json`** and their `en`, `pos`, `ruGloss`, `note`
   from `tools/wordplan.json` (§1).
2. Write one entry per word (§4): `ru`, `emoji`, `forms`, an Easy and a Hard sentence with translations, and for
   verbs the `verb` object and four drills (§9).
3. At least **14 of 20** words have an emoji, all different within the chapter (§5).
4. Run `node wordsprout/tools/validate-data.mjs --chapter <id>` (add `--stats` for a table) until there are no
   errors, then read every warning and fix what is real (British spelling, ru/en length, grammar hints).
5. Read the whole file once more as a learner would: every sentence natural, kind, clear, and new.

Word file layout: `{ "chapter": "<id>", "words": [ … ] }`, UTF-8, 2-space indent, keys in this order:
`id, en, ru, pos, emoji, forms, ruAlt, note, verb, drills, easy, hard` (omit the optional ones you do not use).

## 1. The plan is binding

- `data/chapters.json` (C1) fixes the 30 chapters, their order on both levels, the cover emoji and the 20 word
  ids of each chapter in teaching order (easier first). `tools/wordplan.json` (C1) gives for each id its `en`,
  `pos`, `ruGloss` and sometimes a `note`.
- Keep `id`, `en`, `pos` and the order exactly. Do not add, drop, swap or rename words. If a planned word truly
  cannot work, write to your requests file and keep going with the rest; C1 changes the plan.
- `ruGloss` is the starting point for `ru`. Each gloss is **unique within its chapter** on purpose: in
  «Вспомни и напиши» the learner sees only the Russian word and must find the English one. You may polish a
  gloss, but keep the meaning and keep it unique in the chapter.
- `note` is a short Russian hint for the learner (≤ 40 characters, one line on a phone). Copy it into the word's
  `note`; you may shorten or rephrase it, or add a note where the plan has none (irregular plural, a second
  meaning, an American word).
- **Homographs** — same `en`, two ids, two chapters. Use only the planned sense in that word's sentences:
  `orange-fruit` (fruit) / `orange-color` (colors), `mouse-animal` (pets) / `mouse-computer` (tech),
  `watch-noun` (time, the wristwatch) / `watch-verb` (hobbies, to watch).
- Some verb forms are also words of other chapters: `left` (leave / city), `building` (build / city), `fries`
  (fry / cafe). That is fine; just do not mix both senses in one sentence.
- Every verb in the plan is a dynamic verb with forms we are sure of (table in Appendix B), so that the
  present continuous works. Never turn a word into a stative verb (know, like, want, see, hear, cost, …).

## 2. Tone and topics

- Friendly, warm, everyday, adult-appropriate. Real life: home, family, friends, work, school, shops, trips,
  hobbies, weather, food. Light humor is welcome; sarcasm and irony are not (learners read them literally).
- **Never:** politics, religion (no religious holidays, buildings or symbols), violence (weapons, fights, crime,
  war, hunting, injuries beyond a scraped knee), death, alcohol, smoking, drugs, gambling, romance beyond family
  life, diets and body shaming, dangerous behavior shown as normal, medical advice beyond «rest and drink water».
- **No brands or products** (no phone, car, food, shop or game brands), **no real people** (celebrities,
  politicians, athletes, characters from books or films), no country or city names, no nationalities.
  The language `English` may be mentioned.
- Mix men and women in every role (female pilots and builders, male nurses and dancers) and vary ages.
- Feelings and health stay gentle: sad, tired or sick people get better, get a hug or a cup of tea.

## 3. Names

Use only these 20 first names (short, spelled as they sound, so they work in dictation). Gender is fixed so that
Russian agreement stays consistent. At most two names in one sentence.

| m | ru | f | ru |
|---|---|---|---|
| Tom | Том | Anna | Анна |
| Sam | Сэм | Mia | Мия |
| Ben | Бен | Lucy | Люси |
| Max | Макс | Kate | Кейт |
| Jake | Джейк | Emma | Эмма |
| Leo | Лео | Lisa | Лиза |
| Dan | Дэн | Ella | Элла |
| Omar | Омар | Rosa | Роза |
| Alex | Алекс | Nina | Нина |
| Adam | Адам | Eva | Ева |

`Mom`, `Dad`, `Grandma`, `Grandpa` may be used as names (capitalized in English, «мама», «папа», «бабушка»,
«дедушка» in Russian). Pets need no names («the dog», «our cat»).

## 4. The word entry

- `ru` — the translation shown under the picture: lowercase, no final punctuation, always **ё**, no Latin
  letters. Nouns in the nominative singular (plural when the English word is plural-only: «очки», «ножницы»,
  «брюки»; «виноград» stays singular). Adjectives masculine singular («сладкий»). Verbs: §9.4.
- `ruAlt` — optional other common translations (`["картошка"]` for potato). Never repeat `ru`.
- `note` — §1. Russian, short, may contain the English form it explains («мн. ч. teeth»).
- `forms` — every form that differs from `en` and is used in a sentence, plus the standard ones:
  nouns — the plural (`apples`, `teeth`, `knives`; none for `sheep`, `deer`, `fish`, nor for plural-only
  words like `glasses`); a plural planned word may list its singular if a sentence uses it (`grapes` → `grape`);
  verbs — all forms of the `verb` object that differ from `en`; adjectives — `sweeter`, `sweetest` only if a
  sentence uses them. Lowercase, unique, never `en` itself.
- `emoji` — §5.

## 5. Emoji (pictures)

- Find codes with `node wordsprout/tools/fetch-emoji.mjs --find <english word>` (several words must all match;
  `--group food`, `--limit 40`, `--all`, `--json`; a pasted emoji or a code works too). Only codes from
  `tools/emoji-index.json` exist (Fluent 3D, no country flags). For skin-tone emoji use the base code
  (`1f44b`, not `1f44b-1f3fb`). The code is lowercase hex joined with `-`, without `fe0f`.
- **At least 14 of 20** words of a chapter get a picture, and the pictures are **all different** within the
  chapter (validator errors otherwise). Try not to reuse a code that another chapter already uses (warning),
  but a clear picture matters more than avoiding a repeat.
- **Clear meaning:** a learner who sees the picture and the Russian word should think of this word. Generic
  people are fine for family and job words (woman → mom, old man → grandpa, health worker → doctor); an action
  emoji is fine for a verb (person swimming → swim). In one chapter two pictures must not be confusable
  («pick» and «match» show them side by side).
- `null` when nothing fits. Never a misleading or merely decorative picture. Avoid emoji that contain text or
  letters (🆗, 🆓, 🔤), religious symbols, weapons, alcohol, and near-black silhouettes (🗣️, 👤 — invisible on
  the dark theme).
- The images are downloaded by the emoji sync (A4); `node wordsprout/tools/fetch-emoji.mjs --check` is a
  read-only dry run you may use.

## 6. Sentences: rules for Easy and Hard

Each word has `easy` and `hard`: `{ "en", "ru", "answer" }`.

- **Characters:** English letters, space and `. , ! ? ' -` only. **No digits** (write «two», «twenty»), no
  quotes, colons, semicolons, brackets or dashes.
- Starts with a capital letter, ends with `.`, `!` or `?`. One space between words, a space after a comma,
  never a space before punctuation.
- **Tokens:** a token is a word of letters; an apostrophe or hyphen inside a word keeps it one token
  (`don't`, `T-shirt`). Easy has **3–8** tokens, Hard **9–16**.
- **The answer appears exactly once** as a whole token (or a whole token sequence for `ice cream`), compared
  without case. `answer` is `en` or one of `forms` (for verbs also any `verb` form). Watch for repeats:
  «one», «orange», «watch», «fall», «left», «right» are easy to use twice. A longer word that only contains the
  answer does not count (`snowman` is not `snow`, `ice-cold` is not `ice`).
- Prefer `en` itself as the answer in Easy; plural, past or `-ing` forms are welcome in Hard.
- Use the word in its planned sense and part of speech (a verb as a verb, `orange-color` as a color, `rain`
  as raining weather).
- **American spelling and words** (Appendix A): color, favorite, gray, center, theater, traveled, mom, cookie,
  apartment, vacation, pants, sneakers, fall, store, subway, truck, soccer. The validator warns about British
  forms.
- **Every English sentence in the dataset is unique** (compared by letters only, tense drills included), and
  Easy ≠ Hard. Do not reuse a pattern: at most two sentences per chapter may begin with the same two words,
  and avoid the lazy templates «This is a …», «I like …», «I see a …».
- The sentence shows the meaning: from the context a learner can guess the word. ✗ «I have a tractor.»
  ✓ «The farmer drives his tractor to the field.»
- Contractions (`don't`, `it's`, `I'm`) are allowed but at most one per sentence, never inside the answer and
  never in tense drills. Questions and exclamations are welcome in moderation.
- Days and months (capitalized) may appear in sentences; other proper names only from §3.

### 6.1 Easy

- **3–8 tokens**, one idea, one clause. Concrete and visual: something you could photograph.
- Mostly **present simple**; present continuous, `can` and imperatives are fine.
- Apart from the target word use only very common words (A1–A2).
- Examples of the right size: «My cat sleeps on the couch.», «Kate wears a red scarf.», «Close the window,
  please.»

### 6.2 Hard

- **9–16 tokens**, a natural situation from real life (work, a trip, a visit, a problem and its solution).
- Vary tenses and structures across the chapter: past simple stories, present perfect experience, future with
  `will` or `going to`, modals (`can`, `should`, `have to`), first conditional, `when`/`because`/`so` clauses,
  relative clauses, questions.
- Richer than Easy, not just Easy plus extra words. At most one other less common word besides the target.
- Examples of the right size: «We forgot the umbrella, so we waited for the bus under a tree.»,
  «Have you ever tried to cook dinner for twelve people?»

## 7. Russian translations (sentences and drills)

- **Natural Russian**, the way a Russian speaker would say it — not word for word. Same meaning, same tense and
  aspect sense, same sentence type (question stays a question, `!` stays `!`).
- Always **ё** («ещё», «всё», «её», «зелёный»). **No Latin letters at all**: names in Cyrillic (§3), no English
  words, numbers as words.
- Ends with `.`, `!` or `?`. Quotes «ёлочки», a dash is « — » with spaces, never a hyphen between words.
- «ты» between friends, family and children; «вы» to strangers in polite situations (a waiter, a doctor).
- Present continuous → Russian present, often with «сейчас»; present perfect → usually the past perfective
  («уже приготовил»), with «since» → present or past as Russian requires («с утра готовит», «с утра уже
  дважды подмела»).
- Length: the Russian text is 0.5–2.5 times as long as the English (validator warning outside that range).
- A drill's `ru` is the full sentence with the verb filled in (it is shown after the learner solves the drill).

## 8. Emoji, sentences and games — what each game needs

- «Выбери картинку», «Найди пары», «Напиши слово» need pictures (≥ 14 per chapter, distinct).
- «Вставь слово», «Диктант», «Собери предложение», «Повтори вслух» use the level's sentence: it must read
  well aloud (speech synthesis) and be typeable (no rare spellings, names from §3).
- «Найди слова» uses words up to 9 letters (longer planned words are simply skipped).
- «Времена глаголов» uses the drills: Easy shows the first three tenses, Hard all four.

## 9. Verbs

### 9.1 The `verb` object and `forms`

`"verb": { "base", "s", "past", "pp", "ing" }` — `base` equals `en`; every form is one lowercase word and
appears in `forms` unless it equals `en` (put/put/put; in our plan `read` and `run`). Copy the forms from
**Appendix B**; it is generated from the plan and checked.

### 9.2 Verb forms check

- `-s`: `-es` after s, sh, ch, x, o (`washes`, `catches`, `fixes`); consonant + y → `-ies` (`cries`, `studies`,
  `hurries`); vowel + y stays (`plays`, `pays`).
- `-ed` / `-ing`: drop a silent `e` (`smile` → `smiled`, `smiling`); double a single final consonant after a
  single stressed vowel (`stop` → `stopped`, `stopping`; `nod`, `hug`, `clap`, `chop`, `stir`, `wrap`); never
  double w, x, y (`snowed`, `fixed`, `played`); American English does not double an unstressed `l`
  (`traveled`, `traveling`) and uses `learned`, not `learnt`.
- Irregular verbs: Appendix B, bold. Learners copy what they see, so one wrong form teaches a mistake.

### 9.3 Tense drills

Exactly four drills per verb, in this order: `present-simple`, `past-simple`, `present-continuous`,
`present-perfect`. Each is `{ "tense", "en", "ru", "answer" }`.

- `en` contains exactly one blank `___` (three underscores) standing alone as a word. Filled in, the sentence
  obeys §6 (3–16 tokens; aim for 5–12) and is unique in the dataset.
- **The blank holds the whole verb phrase**, auxiliaries included, so the answer is one or two words:

| tense | answer | example (filled) |
|---|---|---|
| present-simple | `s` form or base | Rosa *jogs* every morning. / They *jog* every morning. |
| past-simple | past | We *jogged* along the river last weekend. |
| present-continuous | am / is / are + ing | Dad *is jogging* with the dog right now. |
| present-perfect | have / has + pp | Adam *has jogged* every day since May. |

- **Nothing between the auxiliary and the verb:** ✗ «She has already ___ …». Put the adverb elsewhere or use
  another time marker.
- **Statements only** — no negatives and no questions (they split the verb phrase).
- **Subject agreement:** he, she, it, a name, a singular noun → `is`, `has`, `-s`; I → `am`, `have`, base;
  you, we, they, plural nouns → `are`, `have`, base. Make the subject obvious (best right before the blank, or
  with one adverb between: «Omar usually ___ …»). Avoid collective or tricky subjects (`my family`, `the team`,
  `everyone`, `nobody`).
- **Time markers make the tense unambiguous** (the learner also sees the tense label, but the sentence itself
  must fit only that tense):
  - present simple: every day, every morning, usually, often, always, on weekends, twice a week;
  - past simple: yesterday, last night, last week, last summer, two days ago, when I was a child;
  - present continuous: now, right now, at the moment, «Look, …!», «Listen, …!»;
  - present perfect: since …, so far, lately, «This is the first time …», «… twice since lunch». In American
    English `already`, `just` and `yet` also go with the past simple, so never rely on them alone.
- Do not use the present continuous for future plans in drills («We are flying tomorrow»).
- The four drills of one verb use different subjects and different situations, and differ from its Easy and
  Hard sentences. The first three are seen on the Easy level: keep them short and simple.
- Weather verbs take the subject `it`: «It ___ a lot here in spring.» → `rains`; «Take an umbrella, it ___
  again.» → `is raining`.

### 9.4 Russian for verbs

- `ru` is an **infinitive, imperfective by default**: «готовить», not «приготовить»; «покупать», not «купить».
  The word card names the action in general; sentences and drills use whatever aspect Russian needs.
- Reflexive where Russian needs it: «улыбаться», «бриться», «прятаться».
- Planned exceptions: `rain` → «идёт дождь», `snow` → «идёт снег».
- A second common translation goes into `ruAlt` or `note`, not into `ru`.

## 10. Six worked examples

These words are deliberately **not** in the plan; they only show the shape and the rules.

**1. Noun with a picture**

```json
{ "id": "tractor", "en": "tractor", "ru": "трактор", "pos": "noun", "emoji": "1f69c",
  "forms": ["tractors"],
  "easy": { "en": "The red tractor is very loud.", "ru": "Красный трактор очень громкий.", "answer": "tractor" },
  "hard": { "en": "Every spring my uncle drives his old tractor across the wet fields.",
            "ru": "Каждую весну мой дядя ездит на своём старом тракторе по мокрым полям.", "answer": "tractor" } }
```

**2. Regular verb with a doubled consonant**

```json
{ "id": "jog", "en": "jog", "ru": "бегать трусцой", "pos": "verb", "emoji": "1f3c3",
  "forms": ["jogs", "jogged", "jogging"],
  "verb": { "base": "jog", "s": "jogs", "past": "jogged", "pp": "jogged", "ing": "jogging" },
  "drills": [
    { "tense": "present-simple", "en": "Rosa ___ in the park every morning.",
      "ru": "Роза каждое утро бегает трусцой в парке.", "answer": "jogs" },
    { "tense": "past-simple", "en": "We ___ along the river last weekend.",
      "ru": "В прошлые выходные мы бегали трусцой вдоль реки.", "answer": "jogged" },
    { "tense": "present-continuous", "en": "Look, Dad ___ with the dog right now!",
      "ru": "Смотри, папа прямо сейчас бегает трусцой с собакой!", "answer": "is jogging" },
    { "tense": "present-perfect", "en": "Adam ___ every day since May.",
      "ru": "С мая Адам бегает трусцой каждый день.", "answer": "has jogged" } ],
  "easy": { "en": "Ben jogs before work.", "ru": "Бен бегает трусцой перед работой.", "answer": "jogs" },
  "hard": { "en": "If the weather is nice tomorrow, we are going to jog around the lake.",
            "ru": "Если завтра будет хорошая погода, мы пробежимся трусцой вокруг озера.", "answer": "jog" } }
```

**3. Irregular verb**

```json
{ "id": "sweep", "en": "sweep", "ru": "подметать", "pos": "verb", "emoji": "1f9f9",
  "forms": ["sweeps", "swept", "sweeping"],
  "verb": { "base": "sweep", "s": "sweeps", "past": "swept", "pp": "swept", "ing": "sweeping" },
  "drills": [
    { "tense": "present-simple", "en": "Omar usually ___ the kitchen after dinner.",
      "ru": "Омар обычно подметает кухню после ужина.", "answer": "sweeps" },
    { "tense": "past-simple", "en": "Yesterday I ___ the whole garage.",
      "ru": "Вчера я подмёл весь гараж.", "answer": "swept" },
    { "tense": "present-continuous", "en": "Be careful, Grandpa ___ the stairs right now.",
      "ru": "Осторожно, дедушка сейчас подметает лестницу.", "answer": "is sweeping" },
    { "tense": "present-perfect", "en": "Mom ___ the porch twice since lunch.",
      "ru": "После обеда мама уже дважды подмела крыльцо.", "answer": "has swept" } ],
  "easy": { "en": "We sweep the yard on Sundays.", "ru": "По воскресеньям мы подметаем двор.", "answer": "sweep" },
  "hard": { "en": "After the party we swept the floor and washed every single glass.",
            "ru": "После вечеринки мы подмели пол и перемыли все стаканы до единого.", "answer": "swept" } }
```

**4. Adjective**

```json
{ "id": "rainy", "en": "rainy", "ru": "дождливый", "pos": "adj", "emoji": "1f327", "forms": [],
  "easy": { "en": "Rainy days make me sleepy.", "ru": "В дождливые дни меня клонит в сон.", "answer": "rainy" },
  "hard": { "en": "On rainy weekends we stay at home, bake cookies and watch old movies.",
            "ru": "В дождливые выходные мы сидим дома, печём печенье и смотрим старые фильмы.", "answer": "rainy" } }
```

**5. Homograph with a suffix and a note**

```json
{ "id": "bat-animal", "en": "bat", "ru": "летучая мышь", "pos": "noun", "emoji": "1f987",
  "forms": ["bats"], "note": "животное, а не бита",
  "easy": { "en": "A bat sleeps all day.", "ru": "Летучая мышь спит весь день.", "answer": "bat" },
  "hard": { "en": "At dusk we sat by the lake and watched bats flying over the water.",
            "ru": "В сумерках мы сидели у озера и смотрели, как над водой летают летучие мыши.", "answer": "bats" } }
```

**6. Multi-word phrase without a picture** (a phrase is never `pos: "verb"`, so it has no drills)

```json
{ "id": "wake-up", "en": "wake up", "ru": "просыпаться", "pos": "phrase", "emoji": null,
  "forms": ["wakes up", "woke up", "woken up", "waking up"],
  "easy": { "en": "I wake up before my alarm.", "ru": "Я просыпаюсь раньше будильника.", "answer": "wake up" },
  "hard": { "en": "This morning Leo woke up late, missed the bus and ran all the way to work.",
            "ru": "Сегодня утром Лео проснулся поздно, опоздал на автобус и всю дорогу до работы бежал.",
            "answer": "woke up" } }
```

## 11. Common mistakes

| ✗ | ✓ | why |
|---|---|---|
| She is ___ the floor now. → `sweeping` | She ___ the floor now. → `is sweeping` | the blank holds the whole verb phrase |
| Lisa has already ___ the house. | Lisa ___ the whole house since breakfast. → `has swept` | nothing between `has` and the verb |
| Max ___ to the gym. | Max ___ to the gym every Monday. → `goes` | a time marker fixes the tense |
| My parents ___ … → `has jogged` | → `have jogged` | subject agreement |
| The orange cat sat next to an orange. | The cat sniffed the orange and walked away. | the answer must occur once |
| My favourite colour is grey. I have 2 cats. | My favorite color is gray. I have two cats. | American spelling, no digits |
| «Мы едим pizza. Мы еще не готовы.» | «Мы едим пиццу. Мы ещё не готовы.» | no Latin letters, always ё |
| When I was a child, my grandma grew plums. (Easy) | These plums are very sweet. | Easy is one short clause |
| Grandpa has a gold watch. (for `watch-verb`) | We watch old movies on Friday nights. | the planned sense only |
| I see a tractor. | The farmer drives his tractor to the field. | the context shows the meaning |

## Appendix A. American English

| use | not | | use | not |
|---|---|---|---|---|
| color, favorite, neighbor | colour, favourite, neighbour | | mom | mum |
| center, theater, meter | centre, theatre, metre | | cookie, candy, fries | biscuit, sweets, chips |
| gray | grey | | apartment, elevator | flat, lift |
| traveled, canceled | travelled, cancelled | | vacation | holiday (time off) |
| learned, dreamed, spelled | learnt, dreamt, spelt | | pants, sweater, sneakers | trousers, jumper, trainers |
| organize, realize | organise, realise | | fall | autumn |
| pajamas, cozy | pyjamas, cosy | | store, mall | shop, shopping centre |
| practice (verb) | practise | | subway, truck, gas | underground, lorry, petrol |
| program | programme | | soccer | football (the game with a round ball) |
| check (in a cafe) | bill | | eraser, sidewalk, line | rubber, pavement, queue |

## Appendix B. Verbs in the plan

<!-- verb-table:start -->
135 verbs, 37 of them irregular (**bold**). Generated from the plan — do not edit by hand.

| chapter | base | s | past | pp | ing | ru |
|---|---|---|---|---|---|---|
| fruit | pick | picks | picked | picked | picking | срывать |
| fruit | peel | peels | peeled | peeled | peeling | чистить |
| fruit | squeeze | squeezes | squeezed | squeezed | squeezing | выжимать |
| fruit | slice | slices | sliced | sliced | slicing | резать ломтиками |
| pets | **feed** | feeds | fed | fed | feeding | кормить |
| pets | walk | walks | walked | walked | walking | гулять |
| pets | bark | barks | barked | barked | barking | лаять |
| pets | chase | chases | chased | chased | chasing | гоняться |
| colors | paint | paints | painted | painted | painting | рисовать красками |
| colors | **draw** | draws | drew | drawn | drawing | рисовать |
| colors | color | colors | colored | colored | coloring | раскрашивать |
| colors | mix | mixes | mixed | mixed | mixing | смешивать |
| meals | **eat** | eats | ate | eaten | eating | есть |
| meals | **drink** | drinks | drank | drunk | drinking | пить |
| meals | **make** | makes | made | made | making | делать |
| meals | pour | pours | poured | poured | pouring | наливать |
| home | open | opens | opened | opened | opening | открывать |
| home | close | closes | closed | closed | closing | закрывать |
| home | **sleep** | sleeps | slept | slept | sleeping | спать |
| home | **sit** | sits | sat | sat | sitting | сидеть |
| home | clean | cleans | cleaned | cleaned | cleaning | убирать |
| people | **meet** | meets | met | met | meeting | встречать |
| people | help | helps | helped | helped | helping | помогать |
| people | talk | talks | talked | talked | talking | разговаривать |
| people | visit | visits | visited | visited | visiting | навещать |
| clothes | **wear** | wears | wore | worn | wearing | носить |
| clothes | fold | folds | folded | folded | folding | складывать |
| clothes | **hang** | hangs | hung | hung | hanging | вешать |
| clothes | iron | irons | ironed | ironed | ironing | гладить |
| body | clap | claps | clapped | clapped | clapping | хлопать |
| body | touch | touches | touched | touched | touching | трогать |
| body | nod | nods | nodded | nodded | nodding | кивать |
| body | point | points | pointed | pointed | pointing | указывать |
| numbers | count | counts | counted | counted | counting | считать |
| numbers | add | adds | added | added | adding | прибавлять |
| numbers | measure | measures | measured | measured | measuring | измерять |
| numbers | divide | divides | divided | divided | dividing | делить |
| vegetables | **grow** | grows | grew | grown | growing | выращивать |
| vegetables | plant | plants | planted | planted | planting | сажать |
| vegetables | **dig** | digs | dug | dug | digging | копать |
| vegetables | chop | chops | chopped | chopped | chopping | резать |
| kitchen | cook | cooks | cooked | cooked | cooking | готовить |
| kitchen | bake | bakes | baked | baked | baking | печь |
| kitchen | fry | fries | fried | fried | frying | жарить |
| kitchen | boil | boils | boiled | boiled | boiling | варить |
| kitchen | stir | stirs | stirred | stirred | stirring | помешивать |
| cafe | order | orders | ordered | ordered | ordering | заказывать |
| cafe | **bring** | brings | brought | brought | bringing | приносить |
| cafe | serve | serves | served | served | serving | подавать |
| cafe | share | shares | shared | shared | sharing | делиться |
| bathroom | wash | washes | washed | washed | washing | мыть |
| bathroom | brush | brushes | brushed | brushed | brushing | чистить щёткой |
| bathroom | comb | combs | combed | combed | combing | расчёсывать |
| bathroom | dry | dries | dried | dried | drying | сушить |
| bathroom | shave | shaves | shaved | shaved | shaving | бриться |
| weather | rain | rains | rained | rained | raining | идёт дождь |
| weather | snow | snows | snowed | snowed | snowing | идёт снег |
| weather | **blow** | blows | blew | blown | blowing | дуть |
| weather | **freeze** | freezes | froze | frozen | freezing | замерзать |
| weather | melt | melts | melted | melted | melting | таять |
| time | wait | waits | waited | waited | waiting | ждать |
| time | start | starts | started | started | starting | начинать |
| time | hurry | hurries | hurried | hurried | hurrying | спешить |
| time | finish | finishes | finished | finished | finishing | заканчивать |
| classroom | **read** | reads | read | read | reading | читать |
| classroom | **write** | writes | wrote | written | writing | писать |
| classroom | learn | learns | learned | learned | learning | учить |
| classroom | study | studies | studied | studied | studying | учиться |
| wild | jump | jumps | jumped | jumped | jumping | прыгать |
| wild | climb | climbs | climbed | climbed | climbing | лазить |
| wild | **hide** | hides | hid | hidden | hiding | прятаться |
| wild | roar | roars | roared | roared | roaring | рычать |
| feelings | smile | smiles | smiled | smiled | smiling | улыбаться |
| feelings | laugh | laughs | laughed | laughed | laughing | смеяться |
| feelings | cry | cries | cried | cried | crying | плакать |
| feelings | hug | hugs | hugged | hugged | hugging | обнимать |
| feelings | yawn | yawns | yawned | yawned | yawning | зевать |
| city | turn | turns | turned | turned | turning | поворачивать |
| city | cross | crosses | crossed | crossed | crossing | переходить |
| city | ask | asks | asked | asked | asking | спрашивать |
| city | **show** | shows | showed | shown | showing | показывать |
| transport | **drive** | drives | drove | driven | driving | водить |
| transport | **ride** | rides | rode | ridden | riding | ездить |
| transport | stop | stops | stopped | stopped | stopping | останавливаться |
| transport | **fly** | flies | flew | flown | flying | летать |
| transport | land | lands | landed | landed | landing | приземляться |
| shopping | **buy** | buys | bought | bought | buying | покупать |
| shopping | **pay** | pays | paid | paid | paying | платить |
| shopping | **sell** | sells | sold | sold | selling | продавать |
| shopping | **spend** | spends | spent | spent | spending | тратить |
| shopping | **choose** | chooses | chose | chosen | choosing | выбирать |
| seaside | **swim** | swims | swam | swum | swimming | плавать |
| seaside | sail | sails | sailed | sailed | sailing | ходить под парусом |
| seaside | splash | splashes | splashed | splashed | splashing | брызгаться |
| seaside | float | floats | floated | floated | floating | держаться на воде |
| seaside | surf | surfs | surfed | surfed | surfing | кататься на волнах |
| nature | hike | hikes | hiked | hiked | hiking | ходить в поход |
| nature | camp | camps | camped | camped | camping | жить в палатке |
| nature | bloom | blooms | bloomed | bloomed | blooming | цвести |
| nature | flow | flows | flowed | flowed | flowing | течь |
| sports | **run** | runs | ran | run | running | бегать |
| sports | kick | kicks | kicked | kicked | kicking | бить ногой |
| sports | **throw** | throws | threw | thrown | throwing | бросать |
| sports | **catch** | catches | caught | caught | catching | ловить |
| sports | **win** | wins | won | won | winning | выигрывать |
| hobbies | play | plays | played | played | playing | играть |
| hobbies | **sing** | sings | sang | sung | singing | петь |
| hobbies | listen | listens | listened | listened | listening | слушать |
| hobbies | watch | watches | watched | watched | watching | смотреть |
| hobbies | collect | collects | collected | collected | collecting | коллекционировать |
| parties | dance | dances | danced | danced | dancing | танцевать |
| parties | invite | invites | invited | invited | inviting | приглашать |
| parties | celebrate | celebrates | celebrated | celebrated | celebrating | праздновать |
| parties | wrap | wraps | wrapped | wrapped | wrapping | заворачивать |
| parties | decorate | decorates | decorated | decorated | decorating | украшать |
| trips | travel | travels | traveled | traveled | traveling | путешествовать |
| trips | pack | packs | packed | packed | packing | упаковывать |
| trips | arrive | arrives | arrived | arrived | arriving | приезжать |
| trips | **leave** | leaves | left | left | leaving | уезжать |
| trips | explore | explores | explored | explored | exploring | исследовать |
| health | rest | rests | rested | rested | resting | отдыхать |
| health | sneeze | sneezes | sneezed | sneezed | sneezing | чихать |
| health | cough | coughs | coughed | coughed | coughing | кашлять |
| health | breathe | breathes | breathed | breathed | breathing | дышать |
| health | exercise | exercises | exercised | exercised | exercising | заниматься спортом |
| jobs | work | works | worked | worked | working | работать |
| jobs | **teach** | teaches | taught | taught | teaching | преподавать |
| jobs | **build** | builds | built | built | building | строить |
| jobs | fix | fixes | fixed | fixed | fixing | чинить |
| jobs | earn | earns | earned | earned | earning | зарабатывать |
| tech | call | calls | called | called | calling | звонить |
| tech | **send** | sends | sent | sent | sending | отправлять |
| tech | type | types | typed | typed | typing | печатать |
| tech | click | clicks | clicked | clicked | clicking | нажимать |
| tech | charge | charges | charged | charged | charging | заряжать |
<!-- verb-table:end -->

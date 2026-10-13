#!/usr/bin/env node
/*
 * Проверка данных курса WordSprout (правила CONTRACTS §2.4 и решения §4).
 *
 * Читает data/chapters.json, data/words/<глава>.json, tools/wordplan.json (сверка части речи — только
 * предупреждения), tools/emoji-index.json (есть ли эмодзи; если индекса нет — предупреждение вместо ошибки),
 * data/games.json (какие игры останутся у главы) и, с флагом --images, img/emoji/<код>.webp.
 * Ошибки блокируют (код выхода 1), предупреждения — нет. Строка отчёта: «error  food/apple: easy.en has
 * 9 tokens (max 8): "…"», в конце — сводка: главы, слова, глаголы, картинки, предложения, счётчики по правилам.
 *
 * Запуск (из корня репозитория):
 *   node wordsprout/tools/validate-data.mjs [--skeleton] [--chapter <id>]… [--allow-missing] [--json]
 *        [--file <путь>] [--images] [--quiet] [--stats] [--root <папка wordsprout>]
 *
 *   --skeleton       проверить chapters.json, план и индекс эмодзи; файлы слов необязательны, а в имеющихся
 *                    проверяются только поля слов (без предложений и упражнений на времена); минимумы главы
 *                    (≥ 14 картинок, ≥ 4 глагола) для недописанного файла — предупреждения
 *   --chapter <id>   проверить слова только этих глав (можно повторять или писать через запятую);
 *                    уникальность id и предложений всё равно считается по всем файлам
 *   --allow-missing  отсутствующий файл главы — предупреждение, а не ошибка
 *   --file <путь>    проверить один файл слов отдельно (например tests/fixtures/fixture.json):
 *                    без плана глав и правил «20 слов / 600 слов»; файл в формате chapters.json
 *                    проверяется как chapters.json
 *   --images         проверить, что для каждого кода есть img/emoji/<код>.webp (WebP, ≤ 25 КБ)
 *   --json           вывести результат в JSON: { ok, errors, warnings, summary }
 *   --quiet          не печатать строки предупреждений (только счётчики)
 *   --stats          таблица по главам: слова, глаголы, картинки, короткие слова
 *
 * Предупреждения: британское написание, одна картинка в нескольких главах, отношение длины ru/en вне
 * 0,5–2,5, слова длиннее 9 букв (не попадут в «Найди слова»), игры, которые скроются у главы, кавычки
 * и дефис вместо тире в русском тексте, неизвестные ключи, подсказки согласования в упражнениях.
 *
 * Токен предложения — слово из латинских букв; апостроф или дефис между буквами не разрывают токен,
 * поэтому «don't» и «T-shirt» — один токен. Ответ (answer) ищется как целая последовательность токенов
 * без учёта регистра. Форма глагола, совпадающая с en (put / put / put), допустима (CONTRACTS §4).
 *
 * Только встроенные модули Node 22, без зависимостей.
 */

import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------------------
// Константы контракта
// ---------------------------------------------------------------------------------------------------------

const N_CHAPTERS = 30;
const N_WORDS = 20;
const MIN_EMOJI = 14;
const MIN_VERBS = 4;
const POS = ['noun', 'verb', 'adj', 'adv', 'prep', 'pron', 'num', 'phrase', 'other'];
const TENSES = ['present-simple', 'past-simple', 'present-continuous', 'present-perfect'];
const RANGE = { easy: [3, 8], hard: [9, 16], drill: [3, 16] };
const RATIO = [0.5, 2.5];
const WORDSEARCH_MAX = 9;
const MAX_WEBP_BYTES = 25 * 1024;
const RESERVED_SET_IDS = ['mistakes', 'due', 'fixture'];

const ID_RE = /^[a-z][a-z0-9-]*$/;
const FILE_CHAPTER_RE = /^_?[a-z][a-z0-9-]*$/;
const EN_RE = /^[a-z]+([ '-][a-z]+)*$/;
const VERB_FORM_RE = /^[a-z]+$/;
const EMOJI_RE = /^[0-9a-f]{4,6}(-[0-9a-f]{4,6})*$/;
const TOKEN_RE = /[A-Za-z]+(?:['-][A-Za-z]+)*/g;
const BAD_SENTENCE_CHAR_RE = /[^A-Za-z ,'\-.!?]/g;
const CYRILLIC_RE = /\p{Script=Cyrillic}/u;
const LATIN_RE = /\p{Script=Latin}/gu;

const WORD_KEYS = ['id', 'en', 'ru', 'pos', 'emoji', 'forms', 'easy', 'hard', 'verb', 'drills', 'ruAlt', 'note'];
const SENTENCE_KEYS = ['en', 'ru', 'answer'];
const VERB_KEYS = ['base', 's', 'past', 'pp', 'ing'];
const DRILL_KEYS = ['tense', 'en', 'ru', 'answer'];
const CHAPTER_KEYS = ['id', 'en', 'ru', 'emoji', 'order', 'words'];
const WORDS_FILE_KEYS = ['chapter', 'words', 'version', 'title', 'note'];

// Британское написание → американское. Отдельные слова и основы с типичными суффиксами.
const BRITISH_WORDS = {
  grey: 'gray', greys: 'grays', greyish: 'grayish', programme: 'program', programmes: 'programs',
  cheque: 'check', cheques: 'checks', tyre: 'tire', tyres: 'tires', kerb: 'curb', pyjamas: 'pajamas',
  aeroplane: 'airplane', aeroplanes: 'airplanes', aluminium: 'aluminum', mum: 'mom', mums: 'moms',
  mummy: 'mommy', maths: 'math', moustache: 'mustache', sceptic: 'skeptic', sceptical: 'skeptical',
  storey: 'story', storeys: 'stories', plough: 'plow', ploughs: 'plows', mould: 'mold', mouldy: 'moldy',
  cosy: 'cozy', tonne: 'ton', tonnes: 'tons', draught: 'draft', jewellery: 'jewelry', whilst: 'while',
  amongst: 'among', learnt: 'learned', spelt: 'spelled', dreamt: 'dreamed', spoilt: 'spoiled',
  spilt: 'spilled', fulfil: 'fulfill', skilful: 'skillful', wilful: 'willful', enrol: 'enroll',
  instalment: 'installment', catalogue: 'catalog', catalogues: 'catalogs', analogue: 'analog',
  practise: 'practice', practised: 'practiced', practises: 'practices', practising: 'practicing',
  licence: 'license', licences: 'licenses', defence: 'defense', offence: 'offense', pretence: 'pretense',
  lorry: 'truck', lorries: 'trucks', petrol: 'gas', nappy: 'diaper', nappies: 'diapers',
  dustbin: 'trash can', postcode: 'zip code', motorway: 'highway', aubergine: 'eggplant',
  courgette: 'zucchini', rubbish: 'trash', trainers: 'sneakers', cooker: 'stove', jumper: 'sweater',
};
const BRITISH_STEMS = [
  // -our → -or
  { stems: ['colour', 'favour', 'flavour', 'honour', 'humour', 'labour', 'neighbour', 'harbour', 'behaviour',
    'rumour', 'odour', 'vapour', 'savour', 'armour', 'endeavour', 'parlour', 'splendour', 'rigour', 'vigour',
    'clamour', 'tumour', 'valour'], suffix: /^(|s|ed|ing|ite|ites|able|ful|less|y|ed|er|ers|hood|hoods|ly|ism)$/,
    fix: (s) => s.replace(/our$/, 'or') },
  // -re → -er
  { stems: ['centre', 'theatre', 'metre', 'litre', 'fibre', 'sombre', 'spectre', 'lustre', 'calibre', 'meagre',
    'sabre', 'kilometre', 'centimetre', 'millimetre'], suffix: /^(|s|d|piece|pieces)$/,
    fix: (s) => s.replace(/re$/, 'er') },
  // -ise → -ize
  { stems: ['organis', 'realis', 'recognis', 'apologis', 'memoris', 'criticis', 'emphasis', 'summaris', 'prioritis',
    'specialis', 'sympathis', 'finalis', 'utilis', 'minimis', 'maximis', 'categoris', 'visualis', 'customis',
    'personalis', 'authoris', 'civilis', 'socialis', 'modernis', 'familiaris', 'generalis', 'mobilis', 'normalis',
    'popularis', 'characteris', 'fertilis', 'harmonis', 'idealis', 'localis', 'moisturis', 'neutralis', 'optimis',
    'stabilis', 'sterilis', 'symbolis', 'synchronis', 'vandalis', 'vocalis', 'energis', 'hypnotis', 'colonis',
    'agonis', 'fantasis', 'terroris', 'capitalis', 'computeris', 'digitis', 'globalis', 'hospitalis', 'legalis',
    'magnetis', 'patronis', 'penalis', 'randomis', 'scandalis', 'standardis', 'urbanis', 'baptis', 'dramatis',
    'immunis', 'itemis', 'jeopardis', 'mechanis', 'mesmeris', 'motoris', 'oxidis', 'pasteuris', 'plagiaris',
    'pressuris', 'privatis', 'rationalis', 'sanitis', 'sensitis', 'subsidis', 'theoris', 'vaporis', 'victimis',
    'tidis', 'paralys', 'analys', 'catalys', 'dialys'],
    suffix: /^(e|es|ed|ing|ation|ations|er|ers|able)$/,
    fix: (s) => s.replace(/is$/, 'iz').replace(/ys$/, 'yz') },
  // -ll- → -l-
  { stems: ['travell', 'cancell', 'labell', 'modell', 'fuell', 'levell', 'signall', 'marvell', 'jewell', 'counsell',
    'diall', 'totall', 'quarrell', 'channell', 'tunnell', 'panell', 'pedall', 'shovell', 'snorkell', 'swivell',
    'refuell', 'woll'], suffix: /^(ed|ing|er|ers|ous|ery|en|or|ors)$/,
    fix: (s) => s.replace(/ll$/, 'l') },
  // ae/oe → e
  { stems: ['paediatr', 'anaesth', 'haemo', 'haema', 'oesoph', 'oestro', 'foet', 'encyclopaed', 'anaem'],
    suffix: /^[a-z]*$/, fix: (s) => s.replace('ae', 'e').replace('oe', 'e') },
];

const britishSuggestion = (token) => {
  const t = token.toLowerCase();
  if (Object.hasOwn(BRITISH_WORDS, t)) return BRITISH_WORDS[t];
  for (const group of BRITISH_STEMS) {
    for (const stem of group.stems) {
      if (t.startsWith(stem) && group.suffix.test(t.slice(stem.length))) {
        if (stem === 'foet' && !/^foet(us|uses|al)$/.test(t)) continue;
        return group.fix(stem) + t.slice(stem.length);
      }
    }
  }
  return null;
};

// ---------------------------------------------------------------------------------------------------------
// Аргументы
// ---------------------------------------------------------------------------------------------------------

const USAGE = `Usage: node wordsprout/tools/validate-data.mjs [options]

  --skeleton         chapters.json + plan + emoji index; word files optional, sentences/drills skipped
  --chapter <id>     check the words of these chapters only (repeatable, or comma-separated)
  --allow-missing    a missing data/words/<id>.json is a warning instead of an error
  --file <path>      validate one words file standalone (e.g. tests/fixtures/fixture.json)
  --images           also require img/emoji/<code>.webp for every emoji code used
  --json             print { ok, errors, warnings, summary } as JSON
  --quiet            do not print warning lines (counts only)
  --stats            per-chapter table (words, verbs, pictures, short words)
  --root <dir>       the wordsprout/ folder (default: the parent of tools/)
  -h, --help         this help

Exit code: 0 = no errors, 1 = errors, 2 = bad usage.`;

class UsageError extends Error {}

const parseArgs = (argv) => {
  const opts = {
    skeleton: false, chapters: [], allowMissing: false, json: false, file: null, images: false,
    quiet: false, stats: false, root: path.resolve(TOOLS_DIR, '..'), help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inline = null;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq > 2) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const value = () => {
      if (inline !== null) return inline;
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new UsageError(`${arg} needs a value`);
      return argv[++i];
    };
    switch (arg) {
      case '--skeleton': opts.skeleton = true; break;
      case '--allow-missing': opts.allowMissing = true; break;
      case '--json': opts.json = true; break;
      case '--images': opts.images = true; break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--stats': opts.stats = true; break;
      case '--help': case '-h': opts.help = true; break;
      case '--chapter': case '--chapters':
        opts.chapters.push(...value().split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case '--file': opts.file = value(); break;
      case '--root': opts.root = path.resolve(value()); break;
      default: throw new UsageError(`unknown option ${argv[i]}`);
    }
  }
  if (opts.file && opts.chapters.length) throw new UsageError('--file and --chapter cannot be combined');
  return opts;
};

// ---------------------------------------------------------------------------------------------------------
// Отчёт
// ---------------------------------------------------------------------------------------------------------

const issues = [];
const add = (level, rule, at, msg) => {
  issues.push({ level, rule, file: at.file ?? null, chapter: at.chapter ?? null, word: at.word ?? null, msg });
};
const error = (rule, at, msg) => add('error', rule, at, msg);
const warn = (rule, at, msg) => add('warning', rule, at, msg);

const location = (it) => {
  if (it.chapter && it.word) return `${it.chapter}/${it.word}`;
  if (it.chapter) return it.chapter;
  return it.file ?? 'data';
};

// ---------------------------------------------------------------------------------------------------------
// Помощники
// ---------------------------------------------------------------------------------------------------------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const q = (s) => JSON.stringify(s);
const uniq = (arr) => [...new Set(arr)];
const tokensOf = (s) => s.match(TOKEN_RE) ?? [];
const normSentence = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const lettersOnly = (s) => s.replace(/[^A-Za-z]/g, '');
const showChar = (ch) => {
  const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(ch) ? `${q(ch)} (U+${cp})` : `U+${cp}`;
};
const describe = (v) => (v === undefined ? 'missing' : q(v));
const slugOf = (en) => en.replace(/'/g, '').replace(/ /g, '-');

const countSequence = (hay, needle) => {
  if (!needle.length) return 0;
  let n = 0;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((t, k) => hay[i + k] === t)) n++;
  }
  return n;
};

const relPath = (root, abs) => {
  const r = path.relative(root, abs);
  return r.startsWith('..') ? abs : r.split(path.sep).join('/');
};

// Сообщение JSON.parse + строка/столбец. В Node 22 часть сообщений («Unexpected token») идёт без позиции,
// тогда ищем приведённый в сообщении фрагмент исходного текста.
const jsonError = (e, text) => {
  const msg = String(e.message || e);
  if (/line \d+ column \d+/.test(msg)) return msg;
  let pos = -1;
  const m = /position (\d+)/.exec(msg);
  if (m) pos = Number(m[1]);
  else if (/Unexpected end of JSON input/.test(msg)) pos = text.length;
  else {
    const t = /^Unexpected token '([\s\S]+?)', (?:\.\.\.)?"([\s\S]*?)"(?:\.\.\.)? is not valid JSON$/.exec(msg);
    if (t) {
      const at = text.indexOf(t[2]);
      if (at >= 0 && text.indexOf(t[2], at + 1) < 0) pos = at + Math.max(0, t[2].indexOf(t[1]));
    }
  }
  if (pos < 0) return msg;
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  const col = pos - before.lastIndexOf('\n');
  return `${msg} (line ${line}, column ${col})`;
};

// Читает JSON; при ошибке пишет её в отчёт и возвращает undefined.
const readJson = (abs, at) => {
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    error('json', at, `cannot read ${at.file}: ${e.code || e.message}`);
    return undefined;
  }
  if (text.charCodeAt(0) === 0xfeff) {
    warn('json', at, `${at.file} starts with a byte-order mark`);
    text = text.slice(1);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    error('json', at, `${at.file} is not valid JSON: ${jsonError(e, text)}`);
    return undefined;
  }
};

const unknownKeys = (obj, allowed, at, label) => {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length) warn('keys', at, `${label} has unknown key${extra.length > 1 ? 's' : ''} ${extra.map(q).join(', ')}`);
};

const britishCheck = (text, at, label) => {
  for (const tok of uniq(tokensOf(text))) {
    const us = britishSuggestion(tok);
    if (us) warn('spelling', at, `${label} ${q(tok)} is British spelling or usage (American: ${q(us)})`);
  }
};

const ratioCheck = (ru, en, at, label) => {
  if (typeof ru !== 'string' || typeof en !== 'string' || !en.length) return;
  const r = ru.length / en.length;
  if (r < RATIO[0] || r > RATIO[1]) {
    warn('ratio', at, `${label} ru/en length ratio ${r.toFixed(2)} (expected ${RATIO[0]}–${RATIO[1]})`);
  }
};

// ---------------------------------------------------------------------------------------------------------
// Индекс эмодзи, план слов
// ---------------------------------------------------------------------------------------------------------

const loadEmojiIndex = (root) => {
  const rel = 'tools/emoji-index.json';
  const abs = path.join(root, rel);
  if (!existsSync(abs)) {
    warn('emoji-index', { file: rel }, `${rel} not found: emoji codes are checked for format only`);
    return null;
  }
  const data = readJson(abs, { file: rel });
  if (data === undefined) return null;
  const codes = new Set();
  const addCode = (c) => { if (typeof c === 'string') codes.add(c.toLowerCase()); };
  const fromList = (list) => list.forEach((e) => (typeof e === 'string' ? addCode(e) : addCode(e?.code)));
  if (Array.isArray(data)) fromList(data);
  else if (isObj(data)) {
    const list = data.emoji ?? data.items ?? data.codes;
    if (Array.isArray(list)) fromList(list);
    else Object.keys(data).filter((k) => EMOJI_RE.test(k)).forEach(addCode);
  }
  if (!codes.size) {
    warn('emoji-index', { file: rel }, `${rel} has no codes: emoji codes are checked for format only`);
    return null;
  }
  return codes;
};

// Формат tools/wordplan.json не закреплён контрактом: собираем все объекты с полем id и pos/en,
// глава — ближайший объект с id и массивом words или ключ-идентификатор главы.
const loadWordplan = (root, chapterIds) => {
  const rel = 'tools/wordplan.json';
  const abs = path.join(root, rel);
  if (!existsSync(abs)) return null;
  const data = readJson(abs, { file: rel });
  if (data === undefined) return null;
  const plan = new Map();
  const record = (id, node, chapter) => {
    const ch = typeof node.chapter === 'string' ? node.chapter : chapter;
    const prev = plan.get(id);
    if (prev && prev.pos && prev.chapter && ch && prev.chapter !== ch) {
      warn('wordplan', { file: rel }, `id ${q(id)} is listed twice (${prev.chapter} and ${ch})`);
    }
    plan.set(id, { id, pos: node.pos ?? prev?.pos, en: node.en ?? prev?.en, emoji: node.emoji, chapter: ch ?? prev?.chapter });
  };
  // Понимает: { chapters: [{ id, words: [{ id, pos }] }] }, { <глава>: [{ id, pos }] }, { <глава>: { <id>: { pos } } },
  // [{ id, chapter, pos }] и { id|chapter, words: ['id', …] } (только состав главы, без pos).
  const walk = (node, chapter) => {
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, chapter));
      return;
    }
    if (!isObj(node)) return;
    const chapterKey = typeof node.id === 'string' ? node.id : (typeof node.chapter === 'string' ? node.chapter : null);
    if (chapterKey && Array.isArray(node.words)) {
      node.words.forEach((w) => {
        if (typeof w === 'string') plan.set(w, { ...(plan.get(w) ?? {}), id: w, chapter: chapterKey });
        else walk(w, chapterKey);
      });
      return;
    }
    if (typeof node.id === 'string' && (typeof node.pos === 'string' || typeof node.en === 'string')) {
      record(node.id, node, chapter);
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (isObj(v) && v.id === undefined && typeof v.pos === 'string' && ID_RE.test(k) && !chapterIds.has(k)) record(k, v, chapter);
      else walk(v, chapterIds.has(k) ? k : chapter);
    }
  };
  walk(data, null);
  if (!plan.size) warn('wordplan', { file: rel }, `${rel}: no word entries with "id" and "pos" found`);
  return plan;
};

// ---------------------------------------------------------------------------------------------------------
// Поля слова
// ---------------------------------------------------------------------------------------------------------

const checkEmoji = (code, at, label, index, { allowNull = true } = {}) => {
  if (code === null) {
    if (!allowNull) warn('emoji', at, `${label} is null (a chapter tile needs a picture)`);
    return null;
  }
  if (code === undefined) {
    error('emoji', at, `${label} missing (use null when no picture fits)`);
    return null;
  }
  if (typeof code !== 'string') {
    error('emoji', at, `${label} must be a string or null, got ${q(code)}`);
    return null;
  }
  if (!EMOJI_RE.test(code)) {
    error('emoji', at, `${label} ${q(code)} must be lowercase hex codepoints joined with "-"`);
    return null;
  }
  if (code.split('-').includes('fe0f')) {
    error('emoji', at, `${label} ${q(code)} must not contain fe0f (drop it)`);
    return null;
  }
  if (index && !index.has(code)) error('emoji', at, `${label} ${q(code)} is not in tools/emoji-index.json`);
  return code;
};

const checkRuWord = (text, at, label, rule = 'ru') => {
  if (typeof text !== 'string' || !text.trim()) {
    error(rule, at, `${label} missing`);
    return;
  }
  if (!CYRILLIC_RE.test(text)) error(rule, at, `${label} ${q(text)} has no Cyrillic letters`);
  const latin = text.match(LATIN_RE);
  if (latin) error(rule, at, `${label} ${q(text)} contains Latin letters (${uniq(latin).join('')})`);
  if (text !== text.trim() || / {2}/.test(text)) warn('style', at, `${label} ${q(text)} has extra spaces`);
  if (text !== text.normalize('NFC')) warn('style', at, `${label} ${q(text)} is not NFC-normalized`);
};

const checkRuSentence = (text, at, label) => {
  if (typeof text !== 'string' || !text.trim()) {
    error('ru', at, `${label} missing`);
    return;
  }
  if (!CYRILLIC_RE.test(text)) error('ru', at, `${label} has no Cyrillic letters: ${q(text)}`);
  const latin = text.match(LATIN_RE);
  if (latin) error('ru', at, `${label} contains Latin letters (${uniq(latin).join('')}): ${q(text)}`);
  if (!/[.!?]$/.test(text)) error('ru', at, `${label} must end with . ! or ?: ${q(text)}`);
  if (text !== text.trim() || / {2}/.test(text)) warn('style', at, `${label} has extra spaces: ${q(text)}`);
  if (text !== text.normalize('NFC')) warn('style', at, `${label} is not NFC-normalized`);
  if (/["„“”]/.test(text)) warn('style', at, `${label}: use «ёлочки» instead of other quotes: ${q(text)}`);
  if (/ [-–] /.test(text)) warn('style', at, `${label}: use an em dash « — » between words: ${q(text)}`);
};

// Английское предложение: возвращает токены (или null, если проверять нечего).
const checkEnSentence = (text, at, label, [min, max], rule = 'sentence') => {
  if (typeof text !== 'string' || !text.trim()) {
    error(rule, at, `${label} missing`);
    return null;
  }
  const bad = uniq(text.match(BAD_SENTENCE_CHAR_RE) ?? []);
  if (bad.length) error(rule, at, `${label} has characters outside [A-Za-z ,'-.!?]: ${bad.map(showChar).join(', ')} in ${q(text)}`);
  if (!/^[A-Z]/.test(text)) error(rule, at, `${label} must start with a capital letter: ${q(text)}`);
  if (!/[.!?]$/.test(text)) error(rule, at, `${label} must end with . ! or ?: ${q(text)}`);
  if (/ {2}/.test(text)) error(rule, at, `${label} has double spaces: ${q(text)}`);
  const toks = tokensOf(text);
  if (toks.length < min) error(rule, at, `${label} has ${toks.length} tokens (min ${min}): ${q(text)}`);
  else if (toks.length > max) error(rule, at, `${label} has ${toks.length} tokens (max ${max}): ${q(text)}`);
  if (/ [,.!?]/.test(text)) warn('style', at, `${label} has a space before punctuation: ${q(text)}`);
  if (/[,!?][A-Za-z]|\.[A-Za-z]/.test(text)) warn('style', at, `${label} needs a space after punctuation: ${q(text)}`);
  britishCheck(text, at, label);
  return toks;
};

const SUBJ_3SG = new Set(['he', 'she', 'it']);
const SUBJ_OTHER = new Set(['i', 'you', 'we', 'they']);

// Простая эвристика согласования «местоимение + ___» (только предупреждение).
const grammarHint = (verb, tense, prev, answer, at, label) => {
  if (!prev) return;
  const p = prev.toLowerCase();
  const say = (msg) => warn('grammar', at, `${label}: after ${q(prev)} ${msg}`);
  if (SUBJ_3SG.has(p)) {
    if (tense === 'present-simple' && answer === verb.base && verb.s !== verb.base) say(`present simple usually takes ${q(verb.s)}`);
    if (tense === 'present-continuous' && !answer.startsWith('is ')) say(`expected ${q(`is ${verb.ing}`)}`);
    if (tense === 'present-perfect' && !answer.startsWith('has ')) say(`expected ${q(`has ${verb.pp}`)}`);
  } else if (SUBJ_OTHER.has(p)) {
    if (tense === 'present-simple' && answer === verb.s && verb.s !== verb.base) say(`present simple usually takes ${q(verb.base)}`);
    if (tense === 'present-continuous') {
      const be = p === 'i' ? 'am' : 'are';
      if (!answer.startsWith(`${be} `)) say(`expected ${q(`${be} ${verb.ing}`)}`);
    }
    if (tense === 'present-perfect' && !answer.startsWith('have ')) say(`expected ${q(`have ${verb.pp}`)}`);
  }
};

const newStats = () => ({ chapters: 0, wordFiles: 0, words: 0, verbs: 0, emoji: 0, sentences: 0, drills: 0, short: 0 });

/**
 * Проверяет одно слово. `ctx`: { chapter, index (emoji), skeleton, sentences (сборщик для уникальности) }.
 * Возвращает сведения о слове для перекрёстных проверок.
 */
const checkWord = (w, i, ctx) => {
  const label0 = isObj(w) && typeof w.id === 'string' && w.id ? w.id : `#${i + 1}`;
  const at = { chapter: ctx.chapter, word: label0, file: ctx.file };
  const info = { id: null, en: null, ru: null, pos: null, emoji: null, isVerb: false };
  if (!isObj(w)) {
    error('schema', at, `word #${i + 1} must be an object`);
    return info;
  }
  unknownKeys(w, WORD_KEYS, at, 'word');

  // id
  if (typeof w.id !== 'string' || !ID_RE.test(w.id)) {
    error('ids', at, `id ${describe(w.id)} must match [a-z][a-z0-9-]*`);
  } else {
    info.id = w.id;
  }

  // en
  const enOk = typeof w.en === 'string' && EN_RE.test(w.en) && w.en.length >= 2 && w.en.length <= 20;
  if (typeof w.en !== 'string') error('en', at, `en ${describe(w.en)} must be a string`);
  else if (!EN_RE.test(w.en)) error('en', at, `en ${q(w.en)} must match ^[a-z]+([ '-][a-z]+)*$`);
  else if (w.en.length < 2 || w.en.length > 20) error('en', at, `en ${q(w.en)} has ${w.en.length} characters (2–20)`);
  if (enOk) {
    info.en = w.en;
    britishCheck(w.en, at, 'en');
    if (lettersOnly(w.en).length > WORDSEARCH_MAX) {
      warn('long-word', at, `en ${q(w.en)} has ${lettersOnly(w.en).length} letters (> ${WORDSEARCH_MAX}: not in wordsearch)`);
    }
    if (info.id && info.id !== slugOf(w.en) && !info.id.startsWith(`${slugOf(w.en)}-`)) {
      warn('id-slug', at, `id ${q(info.id)} does not follow en ${q(w.en)} (expected ${q(slugOf(w.en))} or ${q(`${slugOf(w.en)}-<suffix>`)})`);
    }
  }

  // ru, ruAlt, note
  checkRuWord(w.ru, at, 'ru');
  if (typeof w.ru === 'string') info.ru = w.ru;
  if (w.ruAlt !== undefined) {
    if (!Array.isArray(w.ruAlt) || w.ruAlt.some((s) => typeof s !== 'string' || !s.trim())) {
      error('ru', at, 'ruAlt must be an array of non-empty strings');
    } else {
      w.ruAlt.forEach((s, k) => {
        if (!CYRILLIC_RE.test(s) || s.match(LATIN_RE)) warn('ru', at, `ruAlt[${k}] ${q(s)} should be Cyrillic without Latin letters`);
        if (s === w.ru) warn('ru', at, `ruAlt[${k}] ${q(s)} repeats ru`);
      });
      if (uniq(w.ruAlt).length !== w.ruAlt.length) warn('ru', at, 'ruAlt has duplicates');
    }
  }
  if (w.note !== undefined) {
    if (typeof w.note !== 'string' || !w.note.trim()) error('ru', at, 'note must be a non-empty string');
    else if (!CYRILLIC_RE.test(w.note)) warn('ru', at, `note ${q(w.note)} should be in Russian`);
  }

  // pos
  if (!POS.includes(w.pos)) error('pos', at, `pos ${describe(w.pos)} must be one of ${POS.join(', ')}`);
  else info.pos = w.pos;
  info.isVerb = w.pos === 'verb';

  // emoji
  info.emoji = checkEmoji(w.emoji, at, 'emoji', ctx.index);

  // forms
  let forms = [];
  if (!Array.isArray(w.forms)) {
    error('forms', at, `forms must be an array (use [] when there are none), got ${describe(w.forms)}`);
  } else {
    forms = w.forms.filter((f) => typeof f === 'string');
    w.forms.forEach((f, k) => {
      if (typeof f !== 'string') error('forms', at, `forms[${k}] must be a string, got ${q(f)}`);
      else if (f !== f.toLowerCase()) error('forms', at, `forms[${k}] ${q(f)} must be lowercase`);
      else if (!EN_RE.test(f)) error('forms', at, `forms[${k}] ${q(f)} must match ^[a-z]+([ '-][a-z]+)*$`);
      if (typeof f === 'string' && f === w.en) error('forms', at, `forms[${k}] ${q(f)} repeats en (forms list only other forms)`);
    });
    const dups = uniq(forms.filter((f, k) => forms.indexOf(f) !== k));
    if (dups.length) error('forms', at, `forms has duplicates: ${dups.map(q).join(', ')}`);
    forms.forEach((f) => britishCheck(f, at, 'forms'));
  }

  const verb = isObj(w.verb) ? w.verb : null;

  // предложения
  const allowed = new Set([w.en, ...forms]);
  if (info.isVerb && verb) VERB_KEYS.forEach((k) => typeof verb[k] === 'string' && allowed.add(verb[k]));
  allowed.delete(undefined);
  if (!ctx.skeleton) {
    const norms = {};
    for (const level of ['easy', 'hard']) {
      const s = w[level];
      if (!isObj(s)) {
        error('sentence', at, `${level} must be an object { en, ru, answer }, got ${describe(s)}`);
        continue;
      }
      unknownKeys(s, SENTENCE_KEYS, at, level);
      const toks = checkEnSentence(s.en, at, `${level}.en`, RANGE[level]);
      checkRuSentence(s.ru, at, `${level}.ru`);
      ratioCheck(s.ru, s.en, at, level);
      if (typeof s.answer !== 'string' || !s.answer) {
        error('answer', at, `${level}.answer missing`);
      } else if (!allowed.has(s.answer)) {
        error('answer', at, `${level}.answer ${q(s.answer)} is not en or one of its forms (${[...allowed].map(q).join(', ')})`);
      } else if (toks) {
        const n = countSequence(toks.map((t) => t.toLowerCase()), tokensOf(s.answer).map((t) => t.toLowerCase()));
        if (n === 0) error('answer', at, `${level}.answer ${q(s.answer)} does not occur as a whole token in ${q(s.en)}`);
        else if (n > 1) error('answer', at, `${level}.answer ${q(s.answer)} occurs ${n} times in ${q(s.en)} (must be exactly once)`);
      }
      if (typeof s.en === 'string') {
        norms[level] = normSentence(s.en);
        ctx.sentences.push({ norm: norms[level], chapter: ctx.chapter, word: label0, label: `${level}.en`, text: s.en });
        ctx.stats.sentences++;
      }
    }
    if (norms.easy && norms.easy === norms.hard) error('sentence', at, 'easy.en and hard.en are the same sentence');
    if (isObj(w.easy) && isObj(w.hard) && typeof w.easy.ru === 'string' && w.easy.ru === w.hard.ru) {
      warn('sentence', at, 'easy.ru and hard.ru are identical');
    }
  }

  // глагол и упражнения на времена (после easy/hard, чтобы повтор предложения указывал на упражнение)
  if (info.isVerb) {
    checkVerb(w, at, forms, ctx);
  } else if (w.verb !== undefined || w.drills !== undefined) {
    error('verb', at, `verb/drills given but pos is ${describe(w.pos)} (only pos "verb" has them)`);
  }
  return info;
};

const checkVerb = (w, at, forms, ctx) => {
  const v = w.verb;
  let verbOk = false;
  if (!isObj(v)) {
    error('verb', at, `pos "verb" needs verb { base, s, past, pp, ing }, got ${describe(v)}`);
  } else {
    unknownKeys(v, VERB_KEYS, at, 'verb');
    verbOk = true;
    for (const k of VERB_KEYS) {
      const f = v[k];
      if (typeof f !== 'string' || !VERB_FORM_RE.test(f)) {
        verbOk = false;
        const hint = k === 'base' && typeof f === 'string' && f.includes(' ') ? ' (multi-word verbs use pos "phrase")' : '';
        error('verb', at, `verb.${k} ${describe(f)} must match ^[a-z]+$${hint}`);
        continue;
      }
      if (k === 'base') {
        if (f !== w.en) {
          verbOk = false;
          error('verb', at, `verb.base ${q(f)} must equal en ${describe(w.en)}`);
        }
      } else if (f !== w.en && !forms.includes(f)) {
        error('verb', at, `verb.${k} ${q(f)} is missing from forms`);
      }
    }
    if (typeof v.ing === 'string' && !v.ing.endsWith('ing')) warn('verb', at, `verb.ing ${q(v.ing)} does not end in -ing`);
    if (typeof v.s === 'string' && !v.s.endsWith('s')) warn('verb', at, `verb.s ${q(v.s)} does not end in -s`);
  }

  const d = w.drills;
  if (!Array.isArray(d)) {
    if (!ctx.skeleton || d !== undefined) error('drills', at, `pos "verb" needs drills: 4 items, one per tense (${TENSES.join(', ')})`);
    return;
  }
  if (d.length !== 4) error('drills', at, `has ${d.length} drills (need exactly 4, one per tense)`);
  const tenses = d.map((dr) => (isObj(dr) ? dr.tense : undefined));
  tenses.forEach((t, k) => {
    if (!TENSES.includes(t)) error('drills', at, `drills[${k}].tense ${describe(t)} must be one of ${TENSES.join(', ')}`);
    else if (tenses.indexOf(t) !== k) error('drills', at, `drills[${k}]: second ${q(t)} drill (one per tense)`);
  });
  const missing = TENSES.filter((t) => !tenses.includes(t));
  if (missing.length && d.length >= 1) error('drills', at, `no drill for ${missing.join(', ')}`);
  if (!missing.length && d.length === 4 && tenses.some((t, k) => t !== TENSES[k])) {
    warn('drills', at, `drills are not in the usual order (${TENSES.join(', ')})`);
  }
  if (ctx.skeleton) return;
  d.forEach((dr, k) => checkDrill(dr, k, w, at, verbOk ? v : null, ctx));
};

const expectedAnswers = (tense, v) => {
  switch (tense) {
    case 'present-simple': return uniq([v.s, v.base]);
    case 'past-simple': return [v.past];
    case 'present-continuous': return ['am', 'is', 'are'].map((b) => `${b} ${v.ing}`);
    case 'present-perfect': return ['have', 'has'].map((b) => `${b} ${v.pp}`);
    default: return [];
  }
};

const checkDrill = (dr, k, w, at, v, ctx) => {
  const label = `drills[${k}]`;
  if (!isObj(dr)) {
    error('drills', at, `${label} must be an object { tense, en, ru, answer }`);
    return;
  }
  unknownKeys(dr, DRILL_KEYS, at, label);
  const tl = TENSES.includes(dr.tense) ? `${label} (${dr.tense})` : label;
  let blankAt = -1;
  if (typeof dr.en !== 'string' || !dr.en.trim()) {
    error('drills', at, `${tl}.en missing`);
  } else {
    const runs = dr.en.match(/_+/g) ?? [];
    if (runs.length !== 1 || runs[0] !== '___') {
      const found = runs.length ? runs.map(q).join(', ') : 'none';
      error('drills', at, `${tl}.en must contain exactly one "___" (found ${found}): ${q(dr.en)}`);
    } else {
      blankAt = dr.en.indexOf('___');
      const before = dr.en[blankAt - 1];
      const after = dr.en[blankAt + 3];
      if ((before !== undefined && before !== ' ') || (after !== undefined && !/[ ,.!?]/.test(after))) {
        error('drills', at, `${tl}.en: "___" must stand alone as a word: ${q(dr.en)}`);
        blankAt = -1;
      }
    }
  }
  const answer = dr.answer;
  let answerOk = false;
  if (typeof answer !== 'string' || !/^[a-z]+( [a-z]+)?$/.test(answer)) {
    error('drills', at, `${tl}.answer ${describe(answer)} must be one or two lowercase words`);
  } else if (v && TENSES.includes(dr.tense)) {
    const exp = expectedAnswers(dr.tense, v);
    if (!exp.includes(answer)) error('drills', at, `${tl}: answer ${q(answer)} must be ${exp.map(q).join(' or ')}`);
    else answerOk = true;
  } else {
    answerOk = true;
  }
  if (blankAt >= 0 && typeof answer === 'string') {
    const filled = dr.en.slice(0, blankAt) + answer + dr.en.slice(blankAt + 3);
    checkEnSentence(filled, at, `${tl}.en (filled)`, RANGE.drill, 'drills');
    ratioCheck(dr.ru, filled, at, tl);
    ctx.sentences.push({ norm: normSentence(filled), chapter: ctx.chapter, word: at.word, label: `${label}.en`, text: filled });
    if (v && answerOk) grammarHint(v, dr.tense, tokensOf(dr.en.slice(0, blankAt)).pop(), answer, at, tl);
  }
  checkRuSentence(dr.ru, at, `${tl}.ru`);
  ctx.stats.drills++;
};

// ---------------------------------------------------------------------------------------------------------
// chapters.json
// ---------------------------------------------------------------------------------------------------------

const spearman = (a, b) => {
  const n = a.length;
  if (n < 2) return 0;
  const d2 = a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
};

/** Проверяет chapters.json; возвращает массив корректных объектов глав (могут быть неполными). */
const checkChaptersJson = (data, rel, index) => {
  const at = { file: rel };
  if (!isObj(data)) {
    error('chapters', at, `${rel} must be an object { version, meta, chapters }`);
    return [];
  }
  unknownKeys(data, ['version', 'meta', 'chapters'], at, rel);
  if (data.version !== 1) error('chapters', at, `${rel}: version must be 1, got ${describe(data.version)}`);
  if (!isObj(data.meta) || data.meta.chapters !== N_CHAPTERS || data.meta.wordsPerChapter !== N_WORDS) {
    error('counts', at, `${rel}: meta must be { "chapters": ${N_CHAPTERS}, "wordsPerChapter": ${N_WORDS} }, got ${describe(data.meta)}`);
  }
  if (!Array.isArray(data.chapters)) {
    error('chapters', at, `${rel}: chapters must be an array`);
    return [];
  }
  const list = data.chapters;
  if (list.length !== N_CHAPTERS) error('counts', at, `${rel} has ${list.length} chapters (need ${N_CHAPTERS})`);

  const seenIds = new Map();
  const plannedBy = new Map();
  const chapterEmoji = new Map();
  const out = [];
  list.forEach((c, i) => {
    const name = isObj(c) && typeof c.id === 'string' && c.id ? c.id : `#${i + 1}`;
    const cat = { file: rel, chapter: name };
    if (!isObj(c)) {
      error('chapters', cat, `chapter #${i + 1} must be an object`);
      return;
    }
    unknownKeys(c, CHAPTER_KEYS, cat, 'chapter');
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) error('chapters', cat, `id ${describe(c.id)} must match [a-z][a-z0-9-]*`);
    else if (RESERVED_SET_IDS.includes(c.id)) error('chapters', cat, `id ${q(c.id)} is reserved for a global set`);
    else if (seenIds.has(c.id)) error('chapters', cat, `id ${q(c.id)} is used by chapters #${seenIds.get(c.id) + 1} and #${i + 1}`);
    else seenIds.set(c.id, i);

    if (typeof c.en !== 'string' || !c.en.trim()) error('chapters', cat, 'en (English title) missing');
    else {
      if (!/^[A-Z][A-Za-z ,&'-]*$/.test(c.en)) warn('chapters', cat, `en ${q(c.en)} should be an English title starting with a capital`);
      britishCheck(c.en, cat, 'en');
    }
    checkRuWord(c.ru, cat, 'ru', 'chapters');
    const code = checkEmoji(c.emoji, cat, 'emoji', index, { allowNull: false });
    if (code) {
      if (chapterEmoji.has(code)) warn('emoji-shared', cat, `chapter emoji ${q(code)} also used by chapter ${chapterEmoji.get(code)}`);
      else chapterEmoji.set(code, name);
    }

    if (!isObj(c.order)) error('chapters', cat, 'order must be { easy, hard }');
    else {
      unknownKeys(c.order, ['easy', 'hard'], cat, 'order');
      for (const lvl of ['easy', 'hard']) {
        const o = c.order[lvl];
        if (!Number.isInteger(o) || o < 1 || o > N_CHAPTERS) error('chapters', cat, `order.${lvl} ${describe(o)} must be an integer 1–${N_CHAPTERS}`);
      }
    }

    if (!Array.isArray(c.words)) {
      error('plan', cat, 'words (planned word ids in teaching order) must be an array');
    } else {
      if (c.words.length !== N_WORDS) error('counts', cat, `chapters.json plans ${c.words.length} words (need ${N_WORDS})`);
      c.words.forEach((id, k) => {
        if (typeof id !== 'string' || !ID_RE.test(id)) {
          error('ids', cat, `words[${k}] ${describe(id)} must match [a-z][a-z0-9-]*`);
          return;
        }
        if (plannedBy.has(id)) {
          const other = plannedBy.get(id);
          error('ids', cat, other === name ? `planned id ${q(id)} listed twice` : `planned id ${q(id)} is also planned in chapter ${other}`);
        } else plannedBy.set(id, name);
      });
    }
    out.push(c);
  });

  // порядок глав
  for (const lvl of ['easy', 'hard']) {
    const vals = out.map((c) => (isObj(c.order) ? c.order[lvl] : undefined)).filter(Number.isInteger);
    if (vals.length !== out.length) continue;
    const n = out.length;
    const dup = uniq(vals.filter((x, k) => vals.indexOf(x) !== k));
    const miss = [];
    for (let k = 1; k <= n; k++) if (!vals.includes(k)) miss.push(k);
    if (dup.length || miss.length) {
      error('chapters', at, `order.${lvl} is not a permutation of 1..${n}` +
        `${dup.length ? `: duplicates ${dup.join(', ')}` : ''}${miss.length ? `${dup.length ? ';' : ':'} missing ${miss.join(', ')}` : ''}`);
    }
  }
  const both = out.filter((c) => isObj(c.order) && Number.isInteger(c.order.easy) && Number.isInteger(c.order.hard));
  if (both.length === out.length && out.length > 3) {
    const easy = both.map((c) => c.order.easy);
    const hard = both.map((c) => c.order.hard);
    const same = both.filter((c) => c.order.easy === c.order.hard).length;
    const rho = spearman(easy, hard);
    if (rho > 0.8 || same > out.length / 3) {
      warn('order', at, `order.hard is close to order.easy (Spearman ${rho.toFixed(2)}, ${same} chapters at the same position)`);
    }
  }
  return out;
};

// ---------------------------------------------------------------------------------------------------------
// Перекрёстные проверки по набору глав
// ---------------------------------------------------------------------------------------------------------

/**
 * groups: [{ chapter, file, words: [{ raw, info }], selected }]
 * mode: 'dataset' | 'file'; skeleton: boolean
 */
const crossChecks = (groups, { mode, skeleton, sentences }) => {
  const involved = (chapters) => chapters.some((c) => groups.find((g) => g.chapter === c)?.selected);

  // id уникальны во всём наборе
  const byId = new Map();
  for (const g of groups) {
    for (const { info } of g.words) {
      if (!info.id) continue;
      if (!byId.has(info.id)) byId.set(info.id, []);
      byId.get(info.id).push(g.chapter);
    }
  }
  for (const [id, chapters] of byId) {
    if (chapters.length < 2 || !involved(chapters)) continue;
    const first = chapters.find((c) => groups.find((g) => g.chapter === c)?.selected) ?? chapters[0];
    const where = uniq(chapters);
    const msg = where.length === 1 ? `id ${q(id)} is used ${chapters.length} times in ${where[0]}`
      : `id ${q(id)} is used in several chapters: ${where.join(', ')}`;
    error('ids', { chapter: first, word: id }, msg);
  }

  // одинаковый en у разных id (омографы допустимы, но стоит проверить)
  const byEn = new Map();
  for (const g of groups) {
    for (const { info } of g.words) {
      if (!info.en || !info.id) continue;
      if (!byEn.has(info.en)) byEn.set(info.en, []);
      byEn.get(info.en).push(`${g.chapter}/${info.id}`);
    }
  }
  for (const [en, refs] of byEn) {
    const ids = uniq(refs);
    if (ids.length < 2 || !involved(ids.map((r) => r.split('/')[0]))) continue;
    const [chapter, word] = ids[0].split('/');
    warn('dup-en', { chapter, word }, `en ${q(en)} is used by ${ids.join(', ')}`);
  }

  // уникальность предложений
  if (!skeleton) {
    const seen = new Map();
    for (const s of sentences) {
      if (!s.norm) continue;
      const prev = seen.get(s.norm);
      if (!prev) {
        seen.set(s.norm, s);
        continue;
      }
      if (!involved([s.chapter, prev.chapter])) continue;
      const other = prev.chapter === s.chapter && prev.word === s.word ? prev.label : `${prev.chapter}/${prev.word} ${prev.label}`;
      error('unique', { chapter: s.chapter, word: s.word }, `${s.label} ${q(s.text)} duplicates ${other}`);
    }
  }

  // эмодзи: уникальны в главе, ≥ 14 из 20, общие между главами — предупреждение
  const emojiChapters = new Map();
  for (const g of groups) {
    const used = new Map();
    let withEmoji = 0;
    for (const { info } of g.words) {
      if (!info.emoji) continue;
      withEmoji++;
      if (used.has(info.emoji)) {
        if (g.selected) error('emoji', { chapter: g.chapter, word: info.id ?? '?' }, `emoji ${q(info.emoji)} is also used by ${used.get(info.emoji)} in this chapter`);
      } else used.set(info.emoji, info.id ?? '?');
      if (!emojiChapters.has(info.emoji)) emojiChapters.set(info.emoji, []);
      emojiChapters.get(info.emoji).push(`${g.chapter}/${info.id ?? '?'}`);
    }
    g.withEmoji = withEmoji;
    if (!g.selected || !g.words.length) continue;
    if (mode === 'file') {
      const need = Math.ceil(0.7 * g.words.length);
      if (withEmoji < need) warn('emoji', { chapter: g.chapter, file: g.file }, `only ${withEmoji} of ${g.words.length} words have emoji (want ≥ ${need})`);
    } else if (withEmoji < MIN_EMOJI) {
      // в --skeleton недописанный файл главы (< 20 слов) — только предупреждение
      const level = skeleton && g.words.length < N_WORDS ? 'warning' : 'error';
      add(level, 'emoji', { chapter: g.chapter, file: g.file }, `only ${withEmoji} of ${g.words.length} words have emoji (need ≥ ${MIN_EMOJI} of ${N_WORDS})`);
    }
  }
  for (const [code, refs] of emojiChapters) {
    const chapters = uniq(refs.map((r) => r.split('/')[0]));
    if (chapters.length < 2 || !involved(chapters)) continue;
    const [chapter, word] = refs[0].split('/');
    warn('emoji-shared', { chapter, word }, `emoji ${q(code)} is used in several chapters: ${refs.join(', ')}`);
  }

  // глаголы
  for (const g of groups) {
    if (!g.selected || !g.words.length) continue;
    const verbs = g.words.filter(({ info }) => info.isVerb).length;
    g.verbs = verbs;
    const level = skeleton && mode !== 'file' && g.words.length < N_WORDS ? 'warning' : 'error';
    if (verbs < MIN_VERBS) add(level, 'verbs-count', { chapter: g.chapter, file: g.file }, `has ${verbs} verbs (need ≥ ${MIN_VERBS})`);
  }
};

// Игры главы по data/games.json: needs + minWords (как WS.data.eligible). Не хватает слов — игра скрыта.
const NEEDS = {
  picture: (w) => typeof w.emoji === 'string' && w.emoji !== '',
  sentence: (w) => isObj(w.easy) && isObj(w.hard),
  verb: (w) => w.pos === 'verb' && Array.isArray(w.drills) && w.drills.length > 0,
  short: (w) => typeof w.en === 'string' && /^[a-z]{1,9}$/.test(w.en),
};
const NEED_LABEL = {
  picture: 'with a picture', sentence: 'with sentences', verb: 'verbs with drills',
  short: 'short (≤ 9 letters, letters only)',
};

const loadGames = (root) => {
  const abs = path.join(root, 'data/games.json');
  if (!existsSync(abs)) return null;
  let data;
  try {
    data = JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    return null; // о битом games.json сообщает collectUiEmoji (полная проверка набора), здесь просто пропускаем
  }
  const list = Array.isArray(data) ? data : (isObj(data) && Array.isArray(data.games) ? data.games : null);
  return list ? list.filter((g) => isObj(g) && typeof g.id === 'string' && g.scope === 'chapter' && g.enabled !== false) : null;
};

const checkGames = (groups, games) => {
  if (!games || !games.length) return;
  for (const g of groups) {
    if (!g.selected || !g.words.length) continue;
    const words = g.words.map(({ raw }) => raw).filter(isObj);
    const off = [];
    for (const game of games) {
      const needs = Array.isArray(game.needs) ? game.needs.filter((n) => typeof n === 'string') : [];
      const ok = words.filter((w) => needs.every((n) => !NEEDS[n] || NEEDS[n](w)));
      const min = Number.isInteger(game.minWords) && game.minWords > 0 ? game.minWords : 1;
      const what = needs.map((n) => NEED_LABEL[n] ?? n).join(', ') || 'any';
      if (ok.length < min) off.push(`${game.id} (${ok.length} word${ok.length === 1 ? '' : 's'} ${what}, needs ${min})`);
      else if (needs.includes('picture') && game.id === 'pick') {
        const distinct = uniq(ok.map((w) => w.emoji)).length;
        if (distinct < 4) off.push(`pick (${distinct} distinct pictures, needs 4)`);
      }
    }
    if (off.length) warn('games', { chapter: g.chapter, file: g.file }, `game${off.length > 1 ? 's' : ''} hidden for this chapter: ${off.join('; ')}`);
  }
};

// План главы: все слова из chapters.json есть в файле и идут в том же порядке.
const checkPlan = (chapter, group, skeleton) => {
  if (!Array.isArray(chapter.words)) return;
  const at = { chapter: group.chapter, file: group.file };
  const planned = chapter.words.filter((id) => typeof id === 'string');
  const fileIds = group.words.map(({ info }) => info.id).filter(Boolean);
  const missing = skeleton ? [] : planned.filter((id) => !fileIds.includes(id));
  const extra = fileIds.filter((id) => !planned.includes(id));
  missing.forEach((id) => error('plan', { ...at, word: id }, `planned word ${q(id)} is missing from ${group.file}`));
  extra.forEach((id) => error('plan', { ...at, word: id }, `word ${q(id)} is not in the chapters.json plan of ${group.chapter}`));
  const a = planned.filter((id) => fileIds.includes(id));
  const b = fileIds.filter((id) => planned.includes(id));
  const k = a.findIndex((id, n) => id !== b[n]);
  if (k >= 0) {
    error('plan', at, `words are not in plan order: position ${fileIds.indexOf(b[k]) + 1} is ${q(b[k])}, the plan expects ${q(a[k])}`);
  }
  if (!skeleton && group.words.length !== N_WORDS) {
    error('counts', at, `${group.file} has ${group.words.length} words (need ${N_WORDS})`);
  }
};

// ---------------------------------------------------------------------------------------------------------
// Файл слов
// ---------------------------------------------------------------------------------------------------------

const checkWordsFile = (data, rel, expectedChapter) => {
  const at = { file: rel, chapter: expectedChapter ?? undefined };
  if (!isObj(data)) {
    error('schema', at, `${rel} must be an object { chapter, words }`);
    return null;
  }
  unknownKeys(data, WORDS_FILE_KEYS, at, rel);
  let chapter = expectedChapter;
  if (expectedChapter) {
    if (data.chapter !== expectedChapter) error('schema', at, `${rel}: "chapter" is ${describe(data.chapter)}, expected ${q(expectedChapter)}`);
  } else if (typeof data.chapter !== 'string' || !FILE_CHAPTER_RE.test(data.chapter)) {
    error('schema', { file: rel }, `${rel}: "chapter" ${describe(data.chapter)} must match _?[a-z][a-z0-9-]*`);
    chapter = path.basename(rel, '.json');
  } else {
    chapter = data.chapter;
  }
  if (!Array.isArray(data.words)) {
    error('schema', { file: rel, chapter }, `${rel}: "words" must be an array`);
    return { chapter, file: rel, words: [] };
  }
  return { chapter, file: rel, raw: data.words, words: [] };
};

const validateGroup = (group, ctxBase) => {
  const ctx = { ...ctxBase, chapter: group.chapter, file: group.file };
  group.words = (group.raw ?? []).map((w, i) => ({ raw: w, info: checkWord(w, i, ctx) }));
  for (const { info } of group.words) {
    if (info.isVerb) ctx.stats.verbs++;
    if (info.emoji) ctx.stats.emoji++;
    if (info.en && /^[a-z]+$/.test(info.en) && info.en.length <= WORDSEARCH_MAX) ctx.stats.short++;
  }
  ctx.stats.words += group.words.length;
};

// Только для сборки id/эмодзи/предложений невыбранных глав (без отчёта по их словам).
const collectGroupQuietly = (group, ctxBase) => {
  const mark = issues.length;
  validateGroup(group, { ...ctxBase, stats: newStats() });
  issues.length = mark;
};

// ---------------------------------------------------------------------------------------------------------
// Картинки
// ---------------------------------------------------------------------------------------------------------

const isWebp = (abs) => {
  const buf = Buffer.alloc(12);
  let fd;
  try {
    fd = openSync(abs, 'r');
    const n = readSync(fd, buf, 0, 12, 0);
    return n === 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

const checkImages = (root, used, { reportUnused }) => {
  const dirRel = 'img/emoji';
  const dir = path.join(root, dirRel);
  if (!existsSync(dir)) {
    error('images', { file: dirRel }, `${dirRel}/ not found (run node wordsprout/tools/fetch-emoji.mjs)`);
    return;
  }
  for (const [code, refs] of used) {
    const rel = `${dirRel}/${code}.webp`;
    const abs = path.join(root, rel);
    const at = refs[0];
    const who = uniq(refs.map(location)).slice(0, 3).join(', ') + (refs.length > 3 ? ', …' : '');
    if (!existsSync(abs)) {
      error('images', at, `${rel} missing (used by ${who})`);
      continue;
    }
    const size = statSync(abs).size;
    if (size > MAX_WEBP_BYTES) error('images', at, `${rel} is ${(size / 1024).toFixed(1)} KB (max 25 KB)`);
    if (!isWebp(abs)) error('images', at, `${rel} is not a WebP file`);
  }
  if (reportUnused) {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.webp')) continue;
      const code = f.slice(0, -5);
      if (!used.has(code)) warn('images', { file: `${dirRel}/${f}` }, `${dirRel}/${f} is not used by any data file`);
    }
  }
};

// Коды эмодзи из data/games.json (icon) и data/ui-emoji.json (все строки-коды).
const collectUiEmoji = (root, index, used) => {
  const games = path.join(root, 'data/games.json');
  if (existsSync(games)) {
    const data = readJson(games, { file: 'data/games.json' });
    const list = Array.isArray(data) ? data : (isObj(data) && Array.isArray(data.games) ? data.games : []);
    list.forEach((g, i) => {
      if (!isObj(g) || g.icon === undefined || g.icon === null) return;
      const at = { file: 'data/games.json', chapter: `games.json:${g.id ?? `#${i + 1}`}` };
      const code = checkEmoji(g.icon, at, 'icon', index);
      if (code) addUse(used, code, at);
    });
  }
  const ui = path.join(root, 'data/ui-emoji.json');
  if (existsSync(ui)) {
    const data = readJson(ui, { file: 'data/ui-emoji.json' });
    const walk = (node, keyPath) => {
      if (typeof node === 'string') {
        if (!EMOJI_RE.test(node) && !/^[0-9a-f-]+fe0f/.test(node)) return;
        const at = { file: 'data/ui-emoji.json', chapter: `ui-emoji.json:${keyPath || '?'}` };
        const code = checkEmoji(node, at, 'emoji', index);
        if (code) addUse(used, code, at);
      } else if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${keyPath}[${i}]`));
      else if (isObj(node)) Object.entries(node).forEach(([k, v]) => walk(v, keyPath ? `${keyPath}.${k}` : k));
    };
    if (data !== undefined) walk(data, '');
  }
};

const addUse = (used, code, at) => {
  if (!used.has(code)) used.set(code, []);
  used.get(code).push(at);
};

// ---------------------------------------------------------------------------------------------------------
// Режимы
// ---------------------------------------------------------------------------------------------------------

const runDataset = (opts, index) => {
  const root = opts.root;
  const stats = newStats();
  const sentences = [];
  const chaptersRel = 'data/chapters.json';
  const chaptersAbs = path.join(root, chaptersRel);
  const used = new Map();
  let chapters = [];
  if (!existsSync(chaptersAbs)) {
    error('json', { file: chaptersRel }, `${chaptersRel} not found`);
  } else {
    const data = readJson(chaptersAbs, { file: chaptersRel });
    if (data !== undefined) chapters = checkChaptersJson(data, chaptersRel, index);
  }
  stats.chapters = chapters.length;
  const ids = chapters.map((c) => c.id).filter((id) => typeof id === 'string');
  const idSet = new Set(ids);

  for (const id of opts.chapters) {
    if (!idSet.has(id)) error('chapters', { file: chaptersRel }, `--chapter ${q(id)}: no such chapter in ${chaptersRel}`);
  }
  const selectedIds = opts.chapters.length ? new Set(opts.chapters) : idSet;
  const partial = opts.chapters.length > 0;

  // чьи эмодзи глав проверять на картинки
  chapters.forEach((c) => {
    if (typeof c.emoji === 'string' && EMOJI_RE.test(c.emoji) && selectedIds.has(c.id)) addUse(used, c.emoji, { file: chaptersRel, chapter: c.id });
  });

  // план слов (tools/wordplan.json)
  const plan = loadWordplan(root, idSet);
  if (plan && (opts.skeleton || !partial)) checkWordplanAgainstChapters(plan, chapters, selectedIds);

  // файлы слов
  const wordsDir = path.join(root, 'data/words');
  const groups = [];
  const ctxBase = { index, skeleton: opts.skeleton, sentences, stats };
  const missingLevel = opts.allowMissing || opts.skeleton ? 'warning' : 'error';
  let missingCount = 0;
  for (const c of chapters) {
    if (typeof c.id !== 'string' || !ID_RE.test(c.id)) continue;
    const rel = `data/words/${c.id}.json`;
    const abs = path.join(root, rel);
    const selected = selectedIds.has(c.id);
    if (!existsSync(abs)) {
      if (selected) {
        missingCount++;
        add(missingLevel, 'missing', { file: rel, chapter: c.id }, `${rel} not found`);
      }
      continue;
    }
    stats.wordFiles++;
    const mark = issues.length;
    const data = readJson(abs, { file: rel, chapter: c.id });
    if (data === undefined) {
      if (!selected) issues.length = mark;
      continue;
    }
    const group = checkWordsFile(data, rel, c.id);
    if (!group) {
      if (!selected) issues.length = mark;
      continue;
    }
    group.selected = selected;
    if (selected) {
      validateGroup(group, ctxBase);
      checkPlan(c, group, opts.skeleton);
    } else {
      issues.length = mark;
      collectGroupQuietly(group, ctxBase);
    }
    groups.push(group);
  }
  if (existsSync(wordsDir) && chapters.length) {
    for (const f of readdirSync(wordsDir).sort()) {
      if (!f.endsWith('.json')) continue;
      const id = f.slice(0, -5);
      if (!idSet.has(id)) warn('missing', { file: `data/words/${f}` }, `data/words/${f} does not belong to any chapter in ${chaptersRel}`);
    }
  }

  crossChecks(groups, { mode: 'dataset', skeleton: opts.skeleton, sentences });
  if (!opts.skeleton) checkGames(groups, loadGames(root));

  // pos против плана
  if (plan) {
    for (const g of groups) {
      if (!g.selected) continue;
      for (const { info } of g.words) {
        const p = info.id && plan.get(info.id);
        if (p && p.pos && info.pos && p.pos !== info.pos) {
          warn('plan-pos', { chapter: g.chapter, word: info.id }, `pos ${q(info.pos)} differs from tools/wordplan.json (${q(p.pos)})`);
        }
      }
    }
  }

  // общее количество
  if (!partial && !opts.skeleton && !opts.allowMissing && chapters.length === N_CHAPTERS && !missingCount) {
    const total = groups.reduce((s, g) => s + g.words.length, 0);
    if (total !== N_CHAPTERS * N_WORDS) error('counts', { file: 'data/words' }, `dataset has ${total} words (need ${N_CHAPTERS * N_WORDS})`);
  }

  // картинки
  for (const g of groups) {
    if (!g.selected) continue;
    for (const { info } of g.words) if (info.emoji) addUse(used, info.emoji, { chapter: g.chapter, word: info.id ?? '?' });
  }
  if (!partial) {
    collectUiEmoji(root, index, used);
    const fixtures = path.join(root, 'tests/fixtures');
    if (existsSync(fixtures)) {
      for (const f of readdirSync(fixtures)) {
        if (!f.endsWith('.json')) continue;
        let data;
        try { data = JSON.parse(readFileSync(path.join(fixtures, f), 'utf8')); } catch { continue; }
        if (isObj(data) && Array.isArray(data.words)) {
          data.words.forEach((w) => {
            if (isObj(w) && typeof w.emoji === 'string' && EMOJI_RE.test(w.emoji)) {
              addUse(used, w.emoji, { file: `tests/fixtures/${f}`, chapter: data.chapter ?? f, word: w.id ?? '?' });
            }
          });
        }
      }
    }
  }
  if (opts.images) checkImages(root, used, { reportUnused: !partial });

  return { stats, groups, mode: opts.skeleton ? 'skeleton' : 'dataset' };
};

const checkWordplanAgainstChapters = (plan, chapters, selectedIds) => {
  const rel = 'tools/wordplan.json';
  const planned = new Map();
  chapters.forEach((c) => Array.isArray(c.words) && c.words.forEach((id) => planned.set(id, c.id)));
  const verbsBy = new Map();
  for (const [id, p] of plan) {
    const chapter = planned.get(id) ?? p.chapter;
    if (chapter && !selectedIds.has(chapter)) continue;
    const at = { file: rel, chapter: chapter ?? undefined, word: id };
    if (!ID_RE.test(id)) warn('wordplan', at, `${rel}: id ${q(id)} must match [a-z][a-z0-9-]*`);
    if (p.pos !== undefined && !POS.includes(p.pos)) warn('wordplan', at, `${rel}: pos ${q(p.pos)} is not one of ${POS.join(', ')}`);
    if (p.en !== undefined && (typeof p.en !== 'string' || !EN_RE.test(p.en))) warn('wordplan', at, `${rel}: en ${describe(p.en)} does not match the en pattern`);
    if (!planned.has(id) && planned.size) warn('wordplan', at, `${rel}: ${q(id)} is not planned in data/chapters.json`);
    if (p.pos === 'verb' && chapter) verbsBy.set(chapter, (verbsBy.get(chapter) ?? 0) + 1);
  }
  for (const [id, chapter] of planned) {
    if (selectedIds.has(chapter) && !plan.has(id)) warn('wordplan', { file: rel, chapter, word: id }, `${q(id)} is planned in data/chapters.json but missing from ${rel}`);
  }
  if ([...plan.values()].some((p) => p.pos)) {
    for (const c of chapters) {
      if (!selectedIds.has(c.id)) continue;
      const n = verbsBy.get(c.id) ?? 0;
      if (n < MIN_VERBS) warn('wordplan', { file: rel, chapter: c.id }, `${rel} plans ${n} verbs for ${c.id} (need ≥ ${MIN_VERBS})`);
    }
  }
};

const runFile = (opts, index) => {
  const abs = path.resolve(opts.file);
  const rel = relPath(process.cwd(), abs);
  const stats = newStats();
  const sentences = [];
  const used = new Map();
  if (!existsSync(abs)) {
    error('json', { file: rel }, `${rel} not found`);
    return { stats, groups: [], mode: 'file' };
  }
  const data = readJson(abs, { file: rel });
  if (data === undefined) return { stats, groups: [], mode: 'file' };

  if (isObj(data) && Array.isArray(data.chapters)) {
    const chapters = checkChaptersJson(data, rel, index);
    stats.chapters = chapters.length;
    chapters.forEach((c) => typeof c.emoji === 'string' && addUse(used, c.emoji, { file: rel, chapter: c.id }));
    if (opts.images) checkImages(opts.root, used, { reportUnused: false });
    return { stats, groups: [], mode: 'file:chapters' };
  }

  const group = checkWordsFile(data, rel, null);
  if (!group) return { stats, groups: [], mode: 'file' };
  stats.wordFiles = 1;
  group.selected = true;
  validateGroup(group, { index, skeleton: opts.skeleton, sentences, stats });
  crossChecks([group], { mode: 'file', skeleton: opts.skeleton, sentences });
  if (!opts.skeleton) checkGames([group], loadGames(opts.root));
  for (const { info } of group.words) if (info.emoji) addUse(used, info.emoji, { chapter: group.chapter, word: info.id ?? '?' });
  if (opts.images) checkImages(opts.root, used, { reportUnused: false });
  return { stats, groups: [group], mode: 'file' };
};

// ---------------------------------------------------------------------------------------------------------
// Вывод
// ---------------------------------------------------------------------------------------------------------

const countByRule = (list) => {
  const out = {};
  list.forEach((it) => { out[it.rule] = (out[it.rule] ?? 0) + 1; });
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
};

const perChapterRows = (groups) => groups.filter((g) => g.selected).map((g) => {
  const mine = issues.filter((it) => it.chapter === g.chapter);
  return {
    id: g.chapter,
    words: g.words.length,
    verbs: g.words.filter(({ info }) => info.isVerb).length,
    emoji: g.words.filter(({ info }) => info.emoji).length,
    short: g.words.filter(({ info }) => info.en && /^[a-z]+$/.test(info.en) && info.en.length <= WORDSEARCH_MAX).length,
    errors: mine.filter((it) => it.level === 'error').length,
    warnings: mine.filter((it) => it.level === 'warning').length,
  };
});

const main = () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`validate-data: ${e.message}\n\n${USAGE}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!existsSync(opts.root)) {
    process.stderr.write(`validate-data: root ${opts.root} does not exist\n`);
    process.exit(2);
  }

  const index = loadEmojiIndex(opts.root);
  const result = opts.file ? runFile(opts, index) : runDataset(opts, index);
  const errors = issues.filter((it) => it.level === 'error');
  const warnings = issues.filter((it) => it.level === 'warning');
  const s = result.stats;
  const summary = {
    mode: result.mode,
    root: opts.root,
    file: opts.file ?? undefined,
    chapters: s.chapters,
    wordFiles: s.wordFiles,
    words: s.words,
    verbs: s.verbs,
    withEmoji: s.emoji,
    shortWords: s.short,
    sentences: s.sentences,
    drills: s.drills,
    errors: errors.length,
    warnings: warnings.length,
    errorsByRule: countByRule(errors),
    warningsByRule: countByRule(warnings),
    perChapter: perChapterRows(result.groups),
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, errors, warnings, summary }, null, 2)}\n`);
  } else {
    const tty = process.stdout.isTTY && !process.env.NO_COLOR;
    const paint = (code, s2) => (tty ? `\x1b[${code}m${s2}\x1b[0m` : s2);
    const line = (it) => {
      const lvl = it.level === 'error' ? paint('31', 'error  ') : paint('33', 'warning');
      const loc = location(it);
      return `${lvl}  ${it.msg.startsWith(loc) ? it.msg : `${loc}: ${it.msg}`}`;
    };
    const out = [];
    if (!opts.quiet) warnings.forEach((it) => out.push(line(it)));
    errors.forEach((it) => out.push(line(it)));
    if (opts.stats && summary.perChapter.length) {
      out.push('', 'chapter                words verbs emoji short errors warnings');
      summary.perChapter.forEach((r) => {
        out.push(`${r.id.padEnd(22)} ${String(r.words).padStart(5)} ${String(r.verbs).padStart(5)} ${String(r.emoji).padStart(5)} ` +
          `${String(r.short).padStart(5)} ${String(r.errors).padStart(6)} ${String(r.warnings).padStart(8)}`);
      });
    }
    const fmtRules = (obj) => Object.entries(obj).map(([k, v]) => `${k} ${v}`).join(', ');
    const what = opts.file ? `${opts.file}: ` : '';
    out.push('');
    out.push(`validate-data [${summary.mode}] ${what}${s.chapters ? `${s.chapters} chapters, ` : ''}${s.wordFiles} word file(s), ` +
      `${s.words} words (${s.verbs} verbs, ${s.emoji} with emoji, ${s.short} wordsearch-ready), ` +
      `${s.sentences} sentences, ${s.drills} drills`);
    out.push(`errors: ${errors.length}${errors.length ? ` (${fmtRules(summary.errorsByRule)})` : ''}`);
    out.push(`warnings: ${warnings.length}${warnings.length ? ` (${fmtRules(summary.warningsByRule)})` : ''}`);
    out.push(errors.length ? paint('31', 'FAIL') : paint('32', 'OK'));
    process.stdout.write(`${out.join('\n')}\n`);
  }
  process.exitCode = errors.length ? 1 : 0;
};

main();

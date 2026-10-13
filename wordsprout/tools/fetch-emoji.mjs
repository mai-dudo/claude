/*
 * WordSprout — конвейер картинок-эмодзи.
 * Источник: Microsoft Fluent Emoji (лицензия MIT), стиль 3D, закреплённый коммит COMMIT.
 *
 *   node wordsprout/tools/fetch-emoji.mjs
 *     Собирает коды эмодзи из data/*.json, data/words/*.json и tests/fixtures/*.json, скачивает нужные
 *     3D-PNG с jsDelivr (с кэшем и проверкой контрольной суммы git), сжимает их в WebP 160×160
 *     (Pillow через python3 -I), кладёт в img/emoji/<код>.webp, удаляет лишние файлы и пишет
 *     LICENSES/fluent-emoji/LICENSE в корне репозитория. Повторный запуск ничего не меняет.
 *   --check            только проверить, ничего не писать и не скачивать (код 1, если есть что делать).
 *   --find <слова…>    поиск по индексу: коды и названия (например, --find apple).
 *   --build-index      пересобрать tools/emoji-index.json из sparse-checkout репозитория fluentui-emoji.
 *   --help             все ключи.
 * Только встроенные модули Node 22, без npm-зависимостей.
 */

import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const COMMIT = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc';
const REPO_URL = 'https://github.com/microsoft/fluentui-emoji.git';
const CDN_BASE = `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@${COMMIT}/`;
const LICENSE_SHA = '9e841e7a26e4eb057b24511e7b92d42b257a80e5';
const SPARSE = ['/assets/*/metadata.json', '/LICENSE'];

const SIZE = 160;
const QUALITY = 82;
const METHOD = 6;
const MAX_BYTES = 25 * 1024;
const VARIANT = `webp-${SIZE}-q${QUALITY}-m${METHOD}`;
const PARALLEL = 8;
const RETRIES = 3;
const TIMEOUT_MS = 30000;
const LOCK_WAIT_MS = 180000;

const GROUP_ORDER = ['Smileys & Emotion', 'People & Body', 'Component', 'Animals & Nature', 'Food & Drink',
  'Travel & Places', 'Activities', 'Objects', 'Symbols', 'Flags'];
const CODE_RE = /^[0-9][0-9a-f]{1,5}(-[0-9a-f]{2,6})*$/;
const LOOSE_RE = /^(u\+)?[0-9][0-9a-f]{1,5}([-_ ,]+(u\+)?[0-9a-f]{2,6})*$/i;
const EMOJI_KEY_RE = /^(emoji|icon)$|emoji$/i;
const TONE_RE = /^1f3f[b-f]$/;
const PICTO_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

/* ---------- мелкие помощники ---------- */

const say = (o, ...msg) => { if (!o.quiet) console.log(...msg); };
const warn = (...msg) => console.error(...msg);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const shortHash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const kb = (n) => `${(n / 1024).toFixed(1)} КБ`;
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const rel = (o, file) => path.relative(o.root, file) || '.';
const pretty = (file) => {
  const r = path.relative(process.cwd(), file);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : file;
};

const readOrNull = (file) => {
  try {
    return fs.readFileSync(file);
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'EISDIR') return null;
    throw e;
  }
};

const writeAtomic = (file, buf) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
};

/* Размер картинки из заголовка WebP (VP8X / VP8 / VP8L); null — не WebP или файл обрезан. */
const webpInfo = (buf) => {
  if (!buf || buf.length < 30) return null;
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  if (buf.readUInt32LE(4) + 8 !== buf.length) return null;
  const chunk = buf.toString('latin1', 12, 16);
  if (chunk === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === 'VP8L' && buf[20] === 0x2f) {
    const bits = buf.readUInt32LE(21);
    return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >>> 14) & 0x3fff) };
  }
  return null;
};

const goodWebp = (buf) => {
  const info = webpInfo(buf);
  return Boolean(info && info.w === SIZE && info.h === SIZE && buf.length <= MAX_BYTES);
};

/* Символ эмодзи для печати в терминале (только для --find). */
const glyphOf = (code) => code.split('-').map((h) => {
  const cp = parseInt(h, 16);
  const ch = String.fromCodePoint(cp);
  return cp >= 0x203c && cp <= 0x3299 && cp !== 0x200d && cp !== 0x20e3 ? `${ch}️` : ch;
}).join('');

/* Код из самого символа: «🍎» → 1f34e. */
const codeOfGlyph = (s) => [...s].map((ch) => ch.codePointAt(0).toString(16).padStart(4, '0'))
  .filter((h) => h !== 'fe0f').join('-');

const normalizeLoose = (s) => s.toLowerCase().replace(/u\+/g, '').split(/[-_ ,]+/)
  .filter((h) => h && h !== 'fe0f').join('-');

/* ---------- аргументы ---------- */

const HELP = `Использование: node wordsprout/tools/fetch-emoji.mjs [режим] [ключи]

Режимы:
  (без режима)           синхронизировать img/emoji с данными и записать лицензию
  --check                только проверить: что скачать, обновить, удалить (ничего не пишет)
  --find <слова…>        найти эмодзи в индексе (все слова должны совпасть)
  --build-index          пересобрать tools/emoji-index.json из репозитория fluentui-emoji
  --help                 эта справка

Ключи:
  --root DIR             папка wordsprout (по умолчанию — рядом с tools/)
  --cache DIR            кэш PNG/WebP (по умолчанию $WS_EMOJI_CACHE, $SCR/emoji-cache или <tmp>/wordsprout-emoji-cache)
  --index FILE           файл индекса (по умолчанию tools/emoji-index.json)
  --repo DIR             sparse-checkout fluentui-emoji для --build-index ($WS_EMOJI_REPO, $SCR/fluentui-emoji, <tmp>/…)
  --offline              ничего не скачивать
  --force                не доверять уже лежащим в img/emoji файлам, сверить всё с кэшем
  --verbose, --quiet     больше / меньше сообщений
  --limit N, --all       сколько результатов показать в --find (по умолчанию 20)
  --group TEXT           в --find: только группа, содержащая TEXT (например, food)
  --json                 в --find: вывести найденные записи индекса как JSON

Коды: шестнадцатеричные кодовые точки строчными буквами через «-», без fe0f (1f34e, 1f9d1-200d-1f3a8).
Ссылкой считается значение ключа emoji / icon / …Emoji в любом JSON-файле и любая строка-код в data/ui-emoji.json.`;

const parseArgs = (argv) => {
  const env = process.env;
  const o = {
    mode: 'sync', terms: [], root: path.resolve(TOOLS_DIR, '..'), index: null,
    cache: env.WS_EMOJI_CACHE || (env.SCR ? path.join(env.SCR, 'emoji-cache') : path.join(os.tmpdir(), 'wordsprout-emoji-cache')),
    repo: env.WS_EMOJI_REPO || (env.SCR ? path.join(env.SCR, 'fluentui-emoji') : path.join(os.tmpdir(), 'wordsprout-fluentui-emoji')),
    offline: false, force: false, verbose: false, quiet: false, limit: 20, group: '', json: false,
  };
  const modes = { '--check': 'check', '--find': 'find', '--build-index': 'build-index', '--help': 'help', '-h': 'help' };
  for (let i = 0; i < argv.length; i++) {
    const eq = argv[i].startsWith('--') ? argv[i].indexOf('=') : -1;
    const flag = eq > 0 ? argv[i].slice(0, eq) : argv[i];
    const value = () => {
      if (eq > 0) return argv[i].slice(eq + 1);
      if (i + 1 >= argv.length) throw new Error(`ключу ${flag} нужно значение`);
      i += 1;
      return argv[i];
    };
    if (modes[flag]) {
      if (o.mode !== 'sync' && o.mode !== modes[flag]) throw new Error(`режимы ${o.mode} и ${flag} несовместимы`);
      o.mode = modes[flag];
    } else if (flag === '--root') o.root = path.resolve(value());
    else if (flag === '--cache') o.cache = path.resolve(value());
    else if (flag === '--index') o.index = path.resolve(value());
    else if (flag === '--repo') o.repo = path.resolve(value());
    else if (flag === '--offline') o.offline = true;
    else if (flag === '--force') o.force = true;
    else if (flag === '--verbose' || flag === '-v') o.verbose = true;
    else if (flag === '--quiet' || flag === '-q') o.quiet = true;
    else if (flag === '--json') o.json = true;
    else if (flag === '--all') o.limit = Infinity;
    else if (flag === '--group') o.group = value();
    else if (flag === '--limit') {
      o.limit = Number(value());
      if (!Number.isInteger(o.limit) || o.limit < 1) throw new Error('--limit: нужно целое число ≥ 1');
    } else if (o.mode === 'find' && !flag.startsWith('-')) o.terms.push(argv[i]);
    else throw new Error(`неизвестный аргумент ${argv[i]} (см. --help)`);
  }
  o.index = o.index || path.join(TOOLS_DIR, 'emoji-index.json');
  o.licenseFile = path.resolve(o.root, '..', 'LICENSES', 'fluent-emoji', 'LICENSE');
  return o;
};

/* ---------- индекс ---------- */

const readIndex = (o) => {
  const buf = readOrNull(o.index);
  if (!buf) throw new Error(`нет индекса ${o.index}; соберите его: node wordsprout/tools/fetch-emoji.mjs --build-index`);
  const list = JSON.parse(buf.toString('utf8'));
  if (!Array.isArray(list)) throw new Error(`${o.index}: ожидается массив`);
  const map = new Map();
  for (const e of list) {
    if (!e || !CODE_RE.test(e.code) || typeof e.file !== 'string' || !/^[0-9a-f]{40}$/.test(e.sha)) {
      throw new Error(`${o.index}: плохая запись ${JSON.stringify(e)}`);
    }
    if (map.has(e.code)) throw new Error(`${o.index}: код ${e.code} повторяется`);
    map.set(e.code, e);
  }
  return { list, map };
};

const git = (cwd, args, { allowFail = false, buffer = false } = {}) => {
  const r = spawnSync('git', ['-C', cwd, ...args], {
    encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.error) throw new Error(`git не запускается: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) throw new Error(`git ${args.join(' ')}: ${String(r.stderr).trim()}`);
  return r;
};

const gitLoud = (cwd, args) => {
  const r = spawnSync('git', cwd ? ['-C', cwd, ...args] : args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.error || r.status !== 0) throw new Error(`git ${args.join(' ')} завершился с ошибкой`);
};

/* Проверяет или создаёт sparse-checkout fluentui-emoji на коммите COMMIT (без скачивания картинок). */
const ensureCheckout = (o) => {
  const dir = o.repo;
  if (!fs.existsSync(path.join(dir, '.git'))) {
    say(o, `Клонирую ${REPO_URL} → ${dir} (без содержимого файлов)…`);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    gitLoud(null, ['clone', '--filter=blob:none', '--no-checkout', '--sparse', REPO_URL, dir]);
  }
  const sparse = git(dir, ['sparse-checkout', 'list'], { allowFail: true }).stdout.split('\n').filter(Boolean);
  if (SPARSE.some((p) => !sparse.includes(p))) {
    gitLoud(dir, ['sparse-checkout', 'set', '--no-cone', ...SPARSE]);
  }
  const head = git(dir, ['rev-parse', 'HEAD'], { allowFail: true }).stdout.trim();
  /* После clone --no-checkout HEAD уже может совпадать с COMMIT, но рабочая копия пуста — тоже нужен checkout. */
  if (head !== COMMIT || !fs.existsSync(path.join(dir, 'LICENSE'))) {
    if (git(dir, ['cat-file', '-e', `${COMMIT}^{commit}`], { allowFail: true }).status !== 0) {
      gitLoud(dir, ['fetch', '--filter=blob:none', 'origin', COMMIT]);
    }
    gitLoud(dir, ['checkout', '--detach', COMMIT]);
  }
  const now = git(dir, ['rev-parse', 'HEAD']).stdout.trim();
  if (now !== COMMIT) throw new Error(`${dir}: HEAD ${now}, а нужен ${COMMIT}`);
  return dir;
};

const buildIndex = (o) => {
  const repo = ensureCheckout(o);
  const raw = git(repo, ['-c', 'core.quotepath=off', 'ls-tree', '-r', '-z', 'HEAD', '--', 'assets', 'LICENSE'],
    { buffer: true }).stdout.toString('utf8');
  const dirs = new Map();
  let licenseSha = '';
  for (const rec of raw.split('\0')) {
    if (!rec) continue;
    const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/s.exec(rec);
    if (!m) continue;
    const [, sha, file] = m;
    if (file === 'LICENSE') { licenseSha = sha; continue; }
    const parts = /^assets\/([^/]+)\/(.+)$/.exec(file);
    if (!parts) continue;
    if (!dirs.has(parts[1])) dirs.set(parts[1], []);
    dirs.get(parts[1]).push({ sub: parts[2], sha, file });
  }
  if (licenseSha !== LICENSE_SHA) throw new Error(`LICENSE в репозитории: ${licenseSha}, ожидался ${LICENSE_SHA}`);

  const entries = [];
  const skipped = [];
  for (const [dir, files] of dirs) {
    if (!files.some((f) => f.sub === 'metadata.json')) { skipped.push(`${dir}: нет metadata.json`); continue; }
    const metaFile = path.join(repo, 'assets', dir, 'metadata.json');
    const metaBuf = readOrNull(metaFile);
    if (!metaBuf) throw new Error(`${metaFile} не извлечён — проверьте sparse-checkout (${SPARSE.join(' ')})`);
    const meta = JSON.parse(metaBuf.toString('utf8'));
    const tone = files.some((f) => f.sub.startsWith('Default/'));
    if (tone !== Array.isArray(meta.unicodeSkintones)) skipped.push(`${dir}: папка Default и unicodeSkintones не согласованы`);
    const pngRe = tone ? /^Default\/3D\/[^/]+\.png$/ : /^3D\/[^/]+\.png$/;
    const pngs = files.filter((f) => pngRe.test(f.sub));
    if (pngs.length === 0) { skipped.push(`${dir}: нет 3D-картинки`); continue; }
    if (pngs.length > 1) throw new Error(`${dir}: несколько 3D-картинок: ${pngs.map((p) => p.sub).join(', ')}`);
    const code = String(meta.unicode).trim().toLowerCase().split(/\s+/).filter((h) => h !== 'fe0f').join('-');
    if (!CODE_RE.test(code)) throw new Error(`${dir}: странный unicode ${JSON.stringify(meta.unicode)}`);
    entries.push({
      code, name: String(meta.cldr || meta.tts || dir), group: String(meta.group || ''),
      keywords: Array.isArray(meta.keywords) ? meta.keywords.map(String) : [],
      dir, tone, file: pngs[0].file, sha: pngs[0].sha,
    });
  }
  const seen = new Map();
  for (const e of entries) {
    if (seen.has(e.code)) throw new Error(`код ${e.code} у двух папок: ${seen.get(e.code)} и ${e.dir}`);
    seen.set(e.code, e.dir);
  }
  const rank = (g) => { const i = GROUP_ORDER.indexOf(g); return i < 0 ? GROUP_ORDER.length : i; };
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  entries.sort((a, b) => rank(a.group) - rank(b.group) || cmp(a.group, b.group) || cmp(a.name, b.name) || cmp(a.code, b.code));
  const text = `[\n${entries.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]\n`;
  const old = readOrNull(o.index);
  if (old && old.toString('utf8') === text) say(o, `Индекс не изменился: ${entries.length} эмодзи.`);
  else {
    writeAtomic(o.index, Buffer.from(text, 'utf8'));
    say(o, `Записан ${pretty(o.index)}: ${entries.length} эмодзи.`);
  }
  const counts = {};
  for (const e of entries) counts[e.group] = (counts[e.group] || 0) + 1;
  say(o, `  тонов кожи (папка Default): ${entries.filter((e) => e.tone).length}; по группам: ${Object.entries(counts).map(([g, n]) => `${g} ${n}`).join(', ')}`);
  for (const s of skipped) say(o, `  пропущено: ${s}`);
  return 0;
};

/* ---------- поиск ---------- */

const scoreTerm = (e, t) => {
  if (e.code === t) return 300;
  const name = fold(e.name);
  const words = name.split(/[^\p{L}\p{N}]+/u);
  const kws = e.keywords.map(fold);
  if (name === t) return 120;
  if (words.includes(t)) return 70;
  if (kws.includes(t)) return 50;
  if (kws.some((k) => k.split(/[^\p{L}\p{N}]+/u).includes(t))) return 40;
  if (name.includes(t)) return 25;
  if (kws.some((k) => k.includes(t))) return 15;
  if (fold(e.dir).includes(t) || e.code.startsWith(t)) return 8;
  return 0;
};

const scoreWithPlural = (e, t) => {
  const s = scoreTerm(e, t);
  if (s || t.length < 4) return s;
  if (t.endsWith('ies')) return Math.floor(scoreTerm(e, `${t.slice(0, -3)}y`) * 0.9);
  if (t.endsWith('es')) return Math.floor(Math.max(scoreTerm(e, t.slice(0, -2)), scoreTerm(e, t.slice(0, -1))) * 0.9);
  if (t.endsWith('s')) return Math.floor(scoreTerm(e, t.slice(0, -1)) * 0.9);
  return 0;
};

const find = (o) => {
  const terms = fold(o.terms.join(' ')).split(/\s+/).filter(Boolean);
  if (terms.length === 0) throw new Error('--find: укажите слово, например --find apple');
  const { list } = readIndex(o);
  const group = fold(o.group);
  const hits = [];
  for (const e of list) {
    if (group && !fold(e.group).includes(group)) continue;
    let total = 0;
    for (const t of terms) {
      const s = scoreWithPlural(e, t);
      if (!s) { total = 0; break; }
      total += s;
    }
    if (total) hits.push({ e, total });
  }
  hits.sort((a, b) => b.total - a.total || a.e.name.length - b.e.name.length
    || (a.e.name < b.e.name ? -1 : a.e.name > b.e.name ? 1 : 0));
  const shown = hits.slice(0, o.limit);
  if (o.json) {
    console.log(JSON.stringify(shown.map((h) => h.e), null, 2));
    return hits.length ? 0 : 1;
  }
  if (!hits.length) {
    console.log(`Ничего не нашлось по «${terms.join(' ')}». Попробуйте другое слово или синоним.`);
    return 1;
  }
  const width = Math.max(...shown.map((h) => h.e.code.length));
  for (const { e } of shown) {
    console.log(`${e.code.padEnd(width)}  ${glyphOf(e.code)}  ${e.name}  [${e.group}]${e.tone ? ' (тон: Default)' : ''}  ${e.keywords.join(', ')}`);
  }
  if (hits.length > shown.length) console.log(`… и ещё ${hits.length - shown.length} (--all или --limit N)`);
  return 0;
};

/* ---------- сбор кодов из данных ---------- */

const SOURCE_DIRS = ['data', path.join('data', 'words'), path.join('tests', 'fixtures')];

const scanSources = (o, index) => {
  const files = [];
  for (const dir of SOURCE_DIRS) {
    let names = [];
    try {
      names = fs.readdirSync(path.join(o.root, dir), { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.endsWith('.json')).map((d) => d.name).sort();
    } catch (e) {
      if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') throw e;
    }
    for (const name of names) files.push(path.join(dir, name));
  }
  const refs = new Map();
  const errors = [];
  const notes = [];
  let parseFailed = false;

  const addRef = (code, where) => {
    if (!refs.has(code)) refs.set(code, []);
    refs.get(code).push(where);
  };

  for (const file of files) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(o.root, file), 'utf8'));
    } catch (e) {
      parseFailed = true;
      errors.push(`${file}: не читается как JSON (${e.message}) — удаление лишних картинок пропущено`);
      continue;
    }
    const allStrings = path.basename(file) === 'ui-emoji.json' && path.dirname(file) === 'data';
    const visit = (str, jp, emojiKey) => {
      if (!emojiKey && !allStrings) return;
      const where = `${file} → ${jp || '(весь файл)'}`;
      const s = str.trim();
      if (CODE_RE.test(s) && !s.split('-').includes('fe0f') && s === str) { addRef(s, where); return; }
      if (LOOSE_RE.test(s) && CODE_RE.test(normalizeLoose(s))) {
        errors.push(`${where}: «${str}» — код не нормализован, нужно «${normalizeLoose(s)}»`);
        return;
      }
      if (s && !/[\x00-\x7f]/.test(s.replace(/\s/g, '')) && PICTO_RE.test(s)) {
        errors.push(`${where}: «${str}» — нужен код, а не символ: «${codeOfGlyph(s.replace(/\s/g, ''))}»`);
        return;
      }
      if (emojiKey && o.verbose) notes.push(`${where}: «${str}» — не код эмодзи, пропущено`);
    };
    const walk = (node, jp, emojiKey) => {
      if (typeof node === 'string') visit(node, jp, emojiKey);
      else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${jp}[${i}]`, emojiKey));
      else if (node && typeof node === 'object') {
        for (const [k, v] of Object.entries(node)) {
          if (allStrings && CODE_RE.test(k)) addRef(k, `${file} → ключ ${k}`);
          walk(v, jp ? `${jp}.${k}` : k, EMOJI_KEY_RE.test(k));
        }
      }
    };
    walk(data, '', false);
  }

  for (const [code, where] of refs) {
    if (index.map.has(code)) continue;
    const base = code.split('-').filter((h) => !TONE_RE.test(h)).join('-');
    const hint = base !== code && index.map.has(base)
      ? `тон кожи не нужен, используйте «${base}» (${index.map.get(base).name})`
      : 'подберите код: node wordsprout/tools/fetch-emoji.mjs --find <слово>';
    errors.push(`код «${code}» не найден в индексе Fluent 3D (${where.slice(0, 5).join('; ')}${where.length > 5 ? '; …' : ''}) — ${hint}`);
  }
  return { files, refs, errors, notes, parseFailed };
};

/* ---------- скачивание и конвертация ---------- */

const urlOf = (file) => CDN_BASE + file.split('/').map(encodeURIComponent).join('/');

const download = async (url, sha) => {
  let last = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const got = blobSha(buf);
      if (got !== sha) throw new Error(`контрольная сумма ${got}, ожидалась ${sha}`);
      return buf;
    } catch (e) {
      last = e;
      if (attempt < RETRIES) await sleep(800 * attempt);
    }
  }
  throw new Error(`${url}: ${last && (last.cause?.message || last.message)}`);
};

const runPool = async (items, n, fn) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
};

const PY_CONVERT = String.raw`
import json, os, sys
try:
    from PIL import Image, features
except Exception as exc:
    sys.stderr.write('Pillow import failed: %s\n' % exc)
    sys.exit(3)
if not features.check('webp'):
    sys.stderr.write('Pillow has no WebP support\n')
    sys.exit(3)
task = json.load(sys.stdin)
size = task['size']
results = []
for job in task['jobs']:
    try:
        with Image.open(job['src']) as src:
            src.load()
            img = src.convert('RGBA')
        if img.width != img.height:
            side = max(img.width, img.height)
            canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
            img = canvas
        if img.size != (size, size):
            img = img.resize((size, size), Image.Resampling.LANCZOS)
        tmp = '%s.%d.tmp' % (job['dst'], os.getpid())
        img.save(tmp, 'WEBP', quality=task['quality'], method=task['method'])
        os.replace(tmp, job['dst'])
        results.append({'dst': job['dst'], 'bytes': os.path.getsize(job['dst'])})
    except Exception as exc:
        results.append({'dst': job['dst'], 'error': '%s: %s' % (type(exc).__name__, exc)})
json.dump(results, sys.stdout)
`;

const convert = (jobs, cwd) => new Promise((resolve, reject) => {
  const child = spawn('python3', ['-I', '-c', PY_CONVERT], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => reject(new Error(e.code === 'ENOENT'
    ? 'не найден python3 — нужен Python 3 с Pillow (pip install pillow)' : `python3: ${e.message}`)));
  child.on('close', (code) => {
    if (code === 3) reject(new Error(`нужен Pillow с поддержкой WebP: ${err.trim()}`));
    else if (code !== 0) reject(new Error(`python3 завершился с кодом ${code}: ${err.trim()}`));
    else {
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(new Error(`python3 вернул непонятный ответ: ${out.slice(0, 200)}`));
      }
    }
  });
  child.stdin.end(JSON.stringify({ size: SIZE, quality: QUALITY, method: METHOD, jobs }));
});

/* Текст лицензии: из кэша, из sparse-checkout или с jsDelivr; всегда сверяется с LICENSE_SHA. */
const licenseText = async (o, allowNet) => {
  const cached = path.join(o.cache, `LICENSE-${LICENSE_SHA}`);
  for (const file of [o.licenseFile, cached, path.join(o.repo, 'LICENSE')]) {
    const buf = readOrNull(file);
    if (buf && blobSha(buf) === LICENSE_SHA) return buf;
  }
  if (!allowNet) return null;
  const buf = await download(`${CDN_BASE}LICENSE`, LICENSE_SHA);
  writeAtomic(cached, buf);
  return buf;
};

/* ---------- блокировка (два запуска одновременно не мешают друг другу) ---------- */

const withLock = async (o, fn) => {
  const lock = path.join(os.tmpdir(), `wordsprout-emoji-${shortHash(o.root)}.lock`);
  const started = Date.now();
  for (;;) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(String(readOrNull(lock) || '').trim());
      let alive = false;
      try {
        alive = pid > 0 && process.kill(pid, 0);
      } catch (err) {
        alive = err.code === 'EPERM';
      }
      if (!alive) {
        try { fs.unlinkSync(lock); } catch (err) { /* уже удалён */ }
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`идёт другой запуск (pid ${pid}, ${lock})`);
      await sleep(300);
    }
  }
  try {
    return await fn();
  } finally {
    try { fs.unlinkSync(lock); } catch (e) { /* уже удалён */ }
  }
};

/* ---------- синхронизация ---------- */

const sync = async (o) => {
  const check = o.mode === 'check';
  const index = readIndex(o);
  const scan = scanSources(o, index);
  const errors = [...scan.errors];
  for (const n of scan.notes) say(o, `  ${n}`);

  const outDir = path.join(o.root, 'img', 'emoji');
  const pngDir = path.join(o.cache, 'png');
  const webpDir = path.join(o.cache, VARIANT);
  const codes = [...scan.refs.keys()].filter((c) => index.map.has(c)).sort();
  const items = codes.map((code) => {
    const e = index.map.get(code);
    const item = {
      code, e, target: path.join(outDir, `${code}.webp`),
      cachedWebp: path.join(webpDir, `${e.sha}.webp`), png: path.join(pngDir, `${e.sha}.png`),
    };
    item.targetBuf = readOrNull(item.target);
    const cached = readOrNull(item.cachedWebp);
    item.cachedBuf = goodWebp(cached) ? cached : null;
    if (item.cachedBuf) item.action = item.targetBuf && item.targetBuf.equals(item.cachedBuf) ? 'same' : 'copy';
    else if (goodWebp(item.targetBuf) && !o.force) item.action = 'keep';
    else item.action = 'convert';
    return item;
  });

  const wanted = new Set(codes.map((c) => `${c}.webp`));
  let existing = [];
  try {
    existing = fs.readdirSync(outDir, { withFileTypes: true });
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  const canPrune = !scan.parseFailed && scan.files.length > 0;
  const unused = existing.filter((d) => !wanted.has(d.name));
  for (const d of unused) if (d.isDirectory()) errors.push(`${rel(o, path.join(outDir, d.name))}: лишняя папка, удалите вручную`);
  const unusedFiles = unused.filter((d) => !d.isDirectory());

  const toConvert = new Map();
  for (const it of items) if (it.action === 'convert' && !toConvert.has(it.e.sha)) toConvert.set(it.e.sha, it);
  const pngOk = (it) => {
    const buf = readOrNull(it.png);
    return Boolean(buf && blobSha(buf) === it.e.sha);
  };
  const toDownload = [...toConvert.values()].filter((it) => !pngOk(it));

  if (check) {
    const show = (label, list) => {
      if (!list.length) return;
      say(o, `${label} (${list.length}): ${list.slice(0, 30).join(', ')}${list.length > 30 ? ', …' : ''}`);
    };
    show('Нет картинки или нужна новая', items.filter((it) => it.action === 'convert' || it.action === 'copy').map((it) => it.code));
    show('Без проверки по кэшу (лежат в img/emoji)', o.verbose ? items.filter((it) => it.action === 'keep').map((it) => it.code) : []);
    show(canPrune ? 'Лишние в img/emoji' : 'Лишние в img/emoji (удаление сейчас невозможно)', unusedFiles.map((d) => d.name));
    show('Нужно скачать PNG', toDownload.map((it) => it.code));
    const lic = await licenseText(o, false);
    const licNow = readOrNull(o.licenseFile);
    const licBad = lic ? !(licNow && licNow.equals(lic)) : !licNow;
    if (licBad) say(o, `Лицензия ${rel(o, o.licenseFile)} отсутствует или отличается.`);
    for (const e of errors) warn(`ошибка: ${e}`);
    const pending = items.filter((it) => it.action === 'convert' || it.action === 'copy').length + unusedFiles.length + (licBad ? 1 : 0);
    say(o, `Проверка: файлов данных ${scan.files.length}, кодов ${scan.refs.size}, в порядке ${items.filter((it) => it.action === 'same' || it.action === 'keep').length}, `
      + `нужно сделать ${pending}, ошибок ${errors.length}.`);
    return errors.length || pending ? 1 : 0;
  }

  const stats = { downloaded: 0, converted: 0, written: 0, same: 0, kept: 0, removed: 0 };
  const failed = new Set();

  if (toDownload.length) {
    if (o.offline) {
      for (const it of toDownload) { errors.push(`${it.code}: нет PNG в кэше, а включён --offline`); failed.add(it.e.sha); }
    } else {
      say(o, `Скачиваю ${toDownload.length} PNG с jsDelivr…`);
      await runPool(toDownload, PARALLEL, async (it) => {
        try {
          writeAtomic(it.png, await download(urlOf(it.e.file), it.e.sha));
          stats.downloaded += 1;
        } catch (e) {
          errors.push(`${it.code} (${it.e.name}): ${e.message}`);
          failed.add(it.e.sha);
        }
      });
    }
  }

  const jobs = [...toConvert.values()].filter((it) => !failed.has(it.e.sha));
  if (jobs.length) {
    say(o, `Конвертирую ${jobs.length} PNG → WebP ${SIZE}×${SIZE}…`);
    fs.mkdirSync(webpDir, { recursive: true });
    try {
      const results = await convert(jobs.map((it) => ({ src: it.png, dst: it.cachedWebp })), o.cache);
      const bySrc = new Map(results.map((r) => [r.dst, r]));
      for (const it of jobs) {
        const r = bySrc.get(it.cachedWebp);
        if (!r || r.error) { errors.push(`${it.code}: конвертация не удалась (${r ? r.error : 'нет ответа'})`); failed.add(it.e.sha); }
        else stats.converted += 1;
      }
    } catch (e) {
      errors.push(e.message);
      for (const it of jobs) failed.add(it.e.sha);
    }
  }

  for (const it of items) {
    if (it.action === 'keep') { stats.kept += 1; continue; }
    if (it.action === 'same') { stats.same += 1; continue; }
    if (failed.has(it.e.sha)) continue;
    const buf = readOrNull(it.cachedWebp);
    if (!webpInfo(buf)) { errors.push(`${it.code}: в кэше испорченный WebP ${it.cachedWebp}`); continue; }
    if (buf.length > MAX_BYTES) { errors.push(`${it.code}: ${kb(buf.length)} — больше лимита ${kb(MAX_BYTES)}`); continue; }
    if (it.targetBuf && it.targetBuf.equals(buf)) { stats.same += 1; continue; }
    writeAtomic(it.target, buf);
    stats.written += 1;
    if (o.verbose) say(o, `  записан ${rel(o, it.target)} (${it.e.name}, ${kb(buf.length)})`);
  }

  if (canPrune) {
    for (const d of unusedFiles) {
      fs.unlinkSync(path.join(outDir, d.name));
      stats.removed += 1;
      if (o.verbose) say(o, `  удалён ${rel(o, path.join(outDir, d.name))}`);
    }
  } else if (unusedFiles.length) {
    warn(`Внимание: лишние файлы в img/emoji не удалены (${unusedFiles.length} шт.): `
      + `${scan.files.length ? 'есть нечитаемый JSON' : 'не найдено ни одного файла данных'}.`);
  }

  try {
    const lic = await licenseText(o, !o.offline);
    if (!lic) errors.push('нет текста лицензии в кэше, а включён --offline');
    else if (!(readOrNull(o.licenseFile) || Buffer.alloc(0)).equals(lic)) {
      writeAtomic(o.licenseFile, lic);
      say(o, `Записана лицензия ${pretty(o.licenseFile)}.`);
    }
  } catch (e) {
    errors.push(`лицензия: ${e.message}`);
  }

  let total = 0;
  let count = 0;
  try {
    for (const name of fs.readdirSync(outDir)) {
      total += fs.statSync(path.join(outDir, name)).size;
      count += 1;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  for (const e of errors) warn(`ошибка: ${e}`);
  say(o, `fetch-emoji: файлов данных ${scan.files.length}, кодов ${scan.refs.size}; скачано ${stats.downloaded}, `
    + `сконвертировано ${stats.converted}, записано ${stats.written}, без изменений ${stats.same + stats.kept}`
    + `${stats.kept ? ` (из них без сверки с кэшем ${stats.kept})` : ''}, удалено ${stats.removed}; `
    + `img/emoji: ${count} файлов, ${kb(total)}${errors.length ? `; ошибок: ${errors.length}` : ''}.`);
  return errors.length ? 1 : 0;
};

/* Встроенный fetch в Node 22 видит HTTPS_PROXY только с NODE_USE_ENV_PROXY=1 — перезапускаемся с ним. */
const reexecForProxy = (o) => {
  const env = process.env;
  if (o.offline || env.NODE_USE_ENV_PROXY || !(env.HTTPS_PROXY || env.https_proxy)) return null;
  const flags = ['--disable-warning=UNDICI-EHPA', ...process.execArgv];
  const r = spawnSync(process.execPath, [...flags, SELF, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...env, NODE_USE_ENV_PROXY: '1' },
  });
  if (r.error) throw r.error;
  return r.status === null ? 1 : r.status;
};

const main = async () => {
  const o = parseArgs(process.argv.slice(2));
  if (o.mode === 'help') { console.log(HELP); return 0; }
  if (o.mode === 'find') return find(o);
  if (o.mode === 'build-index') return buildIndex(o);
  if (o.mode === 'check') return sync(o);
  const code = reexecForProxy(o);
  if (code !== null) return code;
  return withLock(o, () => sync(o));
};

main().then((code) => { process.exitCode = code; }, (e) => {
  warn(`fetch-emoji: ${e.message}`);
  process.exitCode = 1;
});

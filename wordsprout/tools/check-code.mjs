#!/usr/bin/env node
/*
 * Проверка соглашений кода WordSprout (CONTRACTS §1.1).
 *
 * Браузерный JS (wordsprout/**.js, кроме tools/ и tests/):
 *   - синтаксис через `node --check`;
 *   - русский заголовочный комментарий в начале файла, затем (() => { 'use strict'; … })();
 *   - запреты: запись в window (кроме js/core/ns.js — и там только window.WS), localStorage вне
 *     js/core/store.js, speechSynthesis/SpeechRecognition вне js/core/speech.js, AudioContext вне
 *     js/core/sfx.js, Math.random в js/games и js/screens, абсолютные http(s)-адреса вне
 *     js/screens/about.js, eval / new Function / document.write, import/export;
 *   - файлы игр (js/games/<id>.js) обязаны вызвать WS.games.register( и больше ничего в WS не пишут;
 *   - предупреждения: var, function, двойные кавычки, отступы, innerHTML не из иконок, console.log,
 *     запись в чужие объекты WS.
 * CSS: каждый селектор css/games/<id>.css начинается с .g-<id>, css/screens/<name>.css — с .s-<name>
 * (learn.css ещё и .s-chapter); «сырые» цвета (#hex, rgb(), hsl()) там — предупреждение (нужны токены);
 * внешние url() и @import — ошибка. index.html: внешние src/href — ошибка.
 *
 * Запуск (из корня репозитория):
 *   node wordsprout/tools/check-code.mjs [--files <glob|путь>…] [--owner <A1|A2|A5|E1|E2|E3|D-<id>|D|A0>]…
 *        [--json] [--quiet] [--root <папка wordsprout>]
 * Шаблоны --files считаются от wordsprout/ (префикс «wordsprout/» можно писать): ** * ? {a,b} [abc].
 * Код выхода: 0 — нет ошибок, 1 — есть ошибки, 2 — неверные аргументы.
 *
 * Только встроенные модули Node 22, без зависимостей.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `Usage: node wordsprout/tools/check-code.mjs [options]

  --files <glob|path>…  check only these files (globs relative to wordsprout/, e.g. 'js/games/*.js')
  --owner <id>…         check only the files of an owner from CONTRACTS §1.2
                        (A0, A1, A2, A3, A4, A5, A6, E1, E2, E3, D (all games), D-<gameId>)
  --json                print { ok, files, errors, warnings, summary } as JSON
  --quiet               do not print warning lines (counts only)
  --root <dir>          the wordsprout/ folder (default: the parent of tools/)
  -h, --help            this help

Default set: every .js outside tools/ and tests/, css/**/*.css and index.html.
Exit code: 0 = no errors, 1 = errors, 2 = bad usage.`;

// ---------------------------------------------------------------------------------------------------------
// Владельцы файлов (CONTRACTS §1.2) — для --owner
// ---------------------------------------------------------------------------------------------------------

const OWNERS = {
  A0: ['js/core/ns.js', 'tests/fixtures/fixture.json'],
  A1: ['index.html', 'js/core/{ns,i18n,speech,sfx,router,games,shell,boot}.js', 'js/games/_example.js',
    'css/games/_example.css', 'tests/drivers/_example.mjs', 'data/games.json', 'data/ui-emoji.json'],
  A2: ['css/{tokens,base,kit}.css', 'css/screens/lab.css', 'js/ui/{kit,icons,letter-input,keypad}.js',
    'js/screens/lab.js', 'tools/make-icons.mjs', 'manifest.webmanifest'],
  A3: ['tools/{validate-data,check-code}.mjs', 'tools/contact-sheet.py'],
  A4: ['tools/fetch-emoji.mjs'],
  A5: ['js/core/{store,settings,data,progress}.js'],
  A6: ['tests/*.mjs', 'tests/lib/**', 'tests/README.md', 'tests/fixtures/progress.json'],
  E1: ['css/screens/{home,learn}.css', 'js/screens/{home,learn}.js'],
  E2: ['css/screens/{progress,tree}.css', 'js/screens/{progress,tree}.js'],
  E3: ['css/screens/{settings,review,about}.css', 'js/screens/{settings,review,about}.js'],
  D: ['js/games/[!_]*.js', 'css/games/[!_]*.css', 'tests/drivers/[!_]*.mjs'],
};
const ownerGlobs = (owner) => {
  const key = owner.toUpperCase();
  if (OWNERS[key]) return OWNERS[key];
  const m = /^D-([a-z0-9_-]+)$/i.exec(owner);
  if (m) {
    const id = m[1].toLowerCase();
    return [`js/games/${id}.js`, `css/games/${id}.css`, `tests/drivers/${id}.mjs`];
  }
  return null;
};

// Кто может писать в какой объект WS (только предупреждение; игры — отдельное правило).
const WS_WRITERS = [
  [/^js\/core\/ns\.js$/, '*'],
  [/^js\/core\/i18n\.js$/, ['t', 'i18n']],
  [/^js\/core\/store\.js$/, ['store']],
  [/^js\/core\/settings\.js$/, ['settings']],
  [/^js\/core\/data\.js$/, ['data']],
  [/^js\/core\/progress\.js$/, ['progress']],
  [/^js\/core\/speech\.js$/, ['speech']],
  [/^js\/core\/sfx\.js$/, ['sfx']],
  [/^js\/core\/router\.js$/, ['router']],
  [/^js\/core\/shell\.js$/, ['shell']],
  [/^js\/core\/games\.js$/, ['games']],
  [/^js\/core\/boot\.js$/, ['boot']],
  [/^js\/ui\/[^/]+\.js$/, ['ui']],
  [/^js\/screens\/tree\.js$/, ['tree']],
];
const wsWritable = (rel) => {
  const hit = WS_WRITERS.find(([re]) => re.test(rel));
  const own = hit ? hit[1] : [];
  if (own === '*') return '*';
  // тестовый режим (WS.test.*) заполняют файлы ядра
  return rel.startsWith('js/core/') ? [...own, 'test'] : own;
};
const WS_OWNER_HINT = {
  util: 'js/core/ns.js', test: 'js/core/ns.js', t: 'js/core/i18n.js', store: 'js/core/store.js',
  settings: 'js/core/settings.js', data: 'js/core/data.js', progress: 'js/core/progress.js',
  speech: 'js/core/speech.js', sfx: 'js/core/sfx.js', router: 'js/core/router.js', shell: 'js/core/shell.js',
  games: 'js/core/games.js', ui: 'js/ui/*.js', tree: 'js/screens/tree.js',
};

// ---------------------------------------------------------------------------------------------------------
// Аргументы
// ---------------------------------------------------------------------------------------------------------

class UsageError extends Error {}

const parseArgs = (argv) => {
  const opts = { files: [], owners: [], json: false, quiet: false, root: path.resolve(TOOLS_DIR, '..'), help: false };
  let list = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('-')) {
      if (!list) throw new UsageError(`unexpected argument ${arg}`);
      list.push(arg);
      continue;
    }
    list = null;
    const [name, inline] = arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, null];
    const value = () => {
      if (inline !== null) return inline;
      if (i + 1 >= argv.length || argv[i + 1].startsWith('-')) throw new UsageError(`${name} needs a value`);
      return argv[++i];
    };
    switch (name) {
      case '--files': case '--file':
        if (inline !== null) opts.files.push(...inline.split(',').filter(Boolean));
        else list = opts.files;
        break;
      case '--owner': case '--owners':
        opts.owners.push(...value().split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case '--json': opts.json = true; break;
      case '--quiet': case '-q': opts.quiet = true; break;
      case '--root': opts.root = path.resolve(value()); break;
      case '--help': case '-h': opts.help = true; break;
      default: throw new UsageError(`unknown option ${arg}`);
    }
  }
  if (argv.some((a) => a === '--files' || a === '--file') && !opts.files.length) throw new UsageError('--files needs at least one glob or path');
  for (const o of opts.owners) {
    if (!ownerGlobs(o)) throw new UsageError(`unknown owner ${o} (known: ${Object.keys(OWNERS).join(', ')}, D-<gameId>)`);
  }
  return opts;
};

// ---------------------------------------------------------------------------------------------------------
// Файлы и шаблоны
// ---------------------------------------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const globToRegex = (glob) => {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const j = glob.indexOf('}', i);
      if (j < 0) { re += '\\{'; continue; }
      re += `(?:${glob.slice(i + 1, j).split(',').map((alt) => globToRegex(alt).source.slice(1, -1)).join('|')})`;
      i = j;
    } else if (c === '[') {
      const j = glob.indexOf(']', i);
      if (j < 0) { re += '\\['; continue; }
      let cls = glob.slice(i + 1, j);
      if (cls.startsWith('!')) cls = `^${cls.slice(1)}`;
      re += `[${cls.replace(/\\/g, '\\\\')}]`;
      i = j;
    } else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'img', 'docs']);
const CHECKABLE = /\.(js|mjs|cjs|css|html)$/;

const listFiles = (root) => {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), r);
      } else if (e.isFile() && CHECKABLE.test(e.name)) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
};

const isDefault = (rel) => {
  if (rel.endsWith('.js')) return !/^(tools|tests|data)\//.test(rel);
  if (rel.endsWith('.css')) return rel.startsWith('css/');
  return rel === 'index.html';
};

const selectFiles = (opts) => {
  const root = opts.root;
  const all = listFiles(root);
  const repoPrefix = `${path.basename(root)}/`;
  let chosen;
  const notes = [];
  if (opts.files.length) {
    const set = new Set();
    for (const raw of opts.files) {
      const asPath = path.resolve(raw);
      if (existsSync(asPath) && asPath.startsWith(root + path.sep)) {
        const rel = path.relative(root, asPath).split(path.sep).join('/');
        if (statSync(asPath).isDirectory()) all.filter((f) => f.startsWith(`${rel}/`)).forEach((f) => set.add(f));
        else set.add(rel);
        continue;
      }
      let g = raw.replace(/\\/g, '/').replace(/^\.\//, '');
      if (g.startsWith(repoPrefix)) g = g.slice(repoPrefix.length);
      const re = globToRegex(g);
      const hits = all.filter((f) => re.test(f));
      if (!hits.length) notes.push(`no files match ${raw}`);
      hits.forEach((f) => set.add(f));
    }
    chosen = [...set].sort();
  } else {
    chosen = all.filter(isDefault);
  }
  if (opts.owners.length) {
    const res = opts.owners.flatMap(ownerGlobs).map(globToRegex);
    chosen = chosen.filter((f) => res.some((re) => re.test(f)));
  }
  return { files: chosen, notes };
};

// ---------------------------------------------------------------------------------------------------------
// Лексер JS: убирает комментарии, строки, шаблоны и регулярные выражения, сохраняя позиции
// ---------------------------------------------------------------------------------------------------------

const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await']);

const regexAllowed = (last) => {
  if (last === '') return true;
  if (last === '#str' || last === '#regex' || last === '#num') return false;
  if (/^[A-Za-z_$][\w$]*$/.test(last)) return REGEX_AFTER_WORDS.has(last);
  return last !== ')' && last !== ']' && last !== '}';
};

/**
 * code — без комментариев и без содержимого строк/шаблонов/regex (кавычки остаются);
 * text — только без комментариев. Переводы строк везде сохранены.
 */
const lexJs = (src) => {
  const n = src.length;
  const code = src.split('');
  const text = src.split('');
  const strings = [];
  const comments = [];
  const blank = (arr, a, b) => {
    for (let k = a; k < b && k < n; k++) if (arr[k] !== '\n' && arr[k] !== '\r') arr[k] = ' ';
  };
  const tpl = [];
  let depth = 0;
  let mode = 'code';
  let last = '';
  let i = 0;
  while (i < n) {
    if (mode === 'tpl') {
      const start = i;
      while (i < n && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) i += src[i] === '\\' ? 2 : 1;
      blank(code, start, i);
      if (i >= n) break;
      if (src[i] === '`') {
        i++;
        mode = 'code';
        last = '#str';
        continue;
      }
      tpl.push(depth);
      depth++;
      i += 2;
      mode = 'code';
      last = '{';
      continue;
    }
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      blank(code, i, j);
      blank(text, i, j);
      comments.push({ start: i, end: j, block: false });
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = src.indexOf('*/', i + 2);
      j = j < 0 ? n : j + 2;
      blank(code, i, j);
      blank(text, i, j);
      comments.push({ start: i, end: j, block: true });
      i = j;
      continue;
    }
    if (c === '\'' || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      blank(code, i + 1, j);
      strings.push({ start: i, end: Math.min(j + 1, n), quote: c, value: src.slice(i + 1, j) });
      i = Math.min(j + 1, n);
      last = '#str';
      continue;
    }
    if (c === '`') {
      mode = 'tpl';
      i++;
      continue;
    }
    if (c === '/') {
      if (regexAllowed(last)) {
        let j = i + 1;
        let cls = false;
        while (j < n && src[j] !== '\n') {
          const ch = src[j];
          if (ch === '\\') {
            j += 2;
            continue;
          }
          if (cls) {
            if (ch === ']') cls = false;
          } else if (ch === '[') cls = true;
          else if (ch === '/') break;
          j++;
        }
        blank(code, i + 1, j);
        j++;
        while (j < n && /[A-Za-z]/.test(src[j])) j++;
        i = j;
        last = '#regex';
        continue;
      }
      i++;
      last = '/';
      continue;
    }
    if (c === '{') {
      depth++;
      last = '{';
      i++;
      continue;
    }
    if (c === '}') {
      if (tpl.length && tpl[tpl.length - 1] === depth - 1) {
        tpl.pop();
        depth--;
        mode = 'tpl';
        i++;
        continue;
      }
      depth--;
      last = '}';
      i++;
      continue;
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(src[j])) j++;
      last = src.slice(i, j);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j])) j++;
      last = '#num';
      i = j;
      continue;
    }
    last = c;
    i++;
  }
  return { code: code.join(''), text: text.join(''), strings, comments };
};

const lineIndex = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - starts[lo] + 1 };
  };
};

const matchBrace = (code, at) => {
  let depth = 0;
  for (let i = at; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
};

// ---------------------------------------------------------------------------------------------------------
// Проверки JS
// ---------------------------------------------------------------------------------------------------------

const ASSIGN = String.raw`(?:=(?![=>])|\+=|-=|\*\*=|\*=|\/=|%=|<<=|>>>?=|&&=|\|\|=|\?\?=|&=|\|=|\^=)`;
const MEMBERS = String.raw`(?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]\n]*\])`;
const CYRILLIC = /[А-Яа-яЁё]/;

const syntaxCheck = async (abs) => {
  try {
    await execFileP(process.execPath, ['--check', abs], { timeout: 20000 });
    return null;
  } catch (e) {
    const err = String(e.stderr || e.message || '');
    const lines = err.split('\n');
    const at = lines.find((l) => l.startsWith(abs)) ?? '';
    const m = /:(\d+)$/.exec(at.trim());
    const msg = lines.find((l) => /^\w*Error\b/.test(l)) ?? lines.find((l) => l.trim()) ?? 'syntax error';
    return { line: m ? Number(m[1]) : 1, msg: msg.trim() };
  }
};

const checkJs = (rel, src, add) => {
  const { code, text, strings, comments } = lexJs(src);
  const pos = lineIndex(src);
  const at = (offset) => pos(offset);
  const each = (re, view, fn) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(view))) {
      fn(m);
      if (m[0] === '') re.lastIndex++;
    }
  };
  const isGame = /^js\/games\/[^/]+\.js$/.test(rel);
  const gameId = isGame ? path.basename(rel, '.js') : null;
  const isGameOrScreen = /^js\/(games|screens)\//.test(rel);

  // заголовок
  const firstCode = src.search(/\S/);
  const head = comments[0];
  if (firstCode < 0) {
    add('error', 'header', 1, 1, 'empty file');
    return;
  }
  if (!head || !head.block || head.start !== firstCode) {
    add('error', 'header', at(firstCode).line, 1, 'file must start with a /* … */ comment in Russian saying what it does');
  } else if (!CYRILLIC.test(src.slice(head.start, head.end))) {
    add('error', 'header', at(head.start).line, 1, 'header comment must be in Russian');
  }

  // IIFE + 'use strict'
  const open = /^\s*\(\s*\(\s*\)\s*=>\s*\{/.exec(text);
  if (!open) {
    const start = text.search(/\S/);
    const where = start < 0 ? { line: 1 } : at(start);
    if (/^\s*[(!]\s*(?:async\s+)?function\b/.test(text)) {
      add('error', 'iife', where.line, 1, "use an arrow IIFE: (() => { 'use strict'; … })();");
    } else {
      add('error', 'iife', where.line, 1, "all code must be wrapped in (() => { 'use strict'; … })();");
    }
  } else {
    const brace = open.index + open[0].length - 1;
    const body = text.slice(brace + 1);
    if (!/^\s*(['"])use strict\1\s*;/.test(body)) {
      const k = brace + 1 + Math.max(0, body.search(/\S/));
      add('error', 'strict', at(k).line, at(k).col, "first statement inside the IIFE must be 'use strict';");
    }
    const close = matchBrace(code, brace);
    if (close < 0) {
      add('error', 'iife', at(brace).line, at(brace).col, 'IIFE body is not closed (unbalanced braces)');
    } else {
      const rest = code.slice(close + 1);
      const tail = /^\s*\)\s*\(\s*\)\s*;/.exec(rest);
      if (!tail) add('error', 'iife', at(close).line, at(close).col, 'the IIFE must end with })();');
      else {
        const after = rest.slice(tail[0].length);
        const k = after.search(/\S/);
        if (k >= 0) {
          const off = close + 1 + tail[0].length + k;
          add('error', 'iife', at(off).line, at(off).col, 'code after the IIFE (everything goes inside it)');
        }
      }
    }
  }

  // ES-модули в классических скриптах
  each(/(^|[;}\n])\s*(import|export)\b(?!\s*\()/g, code, (m) => {
    const off = m.index + m[0].length - m[2].length;
    add('error', 'module', at(off).line, at(off).col, `${m[2]} statement: files are classic scripts (no modules)`);
  });
  each(/(?<![.\w$])import\s*\(/g, code, (m) => add('error', 'module', at(m.index).line, at(m.index).col, 'dynamic import() is not allowed (classic scripts)'));

  // window / globalThis
  const isNs = rel === 'js/core/ns.js';
  each(new RegExp(String.raw`(?<![.\w$])(window|globalThis)(${MEMBERS})\s*(?:${ASSIGN}|\+\+|--)`, 'g'), code, (m) => {
    const prop = m[2].replace(/[\s.[\]'"]/g, '');
    if (isNs && prop === 'WS') return;
    const where = at(m.index);
    add('error', 'window', where.line, where.col, isNs
      ? `ns.js may assign only window.WS (found ${m[1]}.${prop})`
      : `assignment to ${m[1]}.${prop}: only js/core/ns.js writes to window (and only window.WS)`);
  });
  each(/\bObject\s*\.\s*(assign|defineProperty|defineProperties)\s*\(\s*(window|globalThis)\b/g, code, (m) => {
    if (isNs) return;
    add('error', 'window', at(m.index).line, at(m.index).col, `Object.${m[1]}(${m[2]}, …): only js/core/ns.js writes to window`);
  });

  // ограниченные API
  const restricted = [
    [/(?<![.\w$'"])(?:window\s*\.\s*)?localStorage\b/g, 'js/core/store.js', 'localStorage', 'use WS.store'],
    [/\b(?:speechSynthesis|SpeechSynthesisUtterance|webkitSpeechRecognition|SpeechRecognition|webkitSpeechGrammarList|SpeechGrammarList)\b/g, 'js/core/speech.js', null, 'use WS.speech / ctx.speak'],
    [/\b(?:webkitAudioContext|OfflineAudioContext|AudioContext)\b/g, 'js/core/sfx.js', null, 'use WS.sfx / ctx.sfx'],
  ];
  for (const [re, owner, label, hint] of restricted) {
    if (rel === owner) continue;
    each(re, code, (m) => {
      const name = label ?? m[0];
      add('error', 'api', at(m.index).line, at(m.index).col, `${name} is only allowed in ${owner} (${hint})`);
    });
  }
  if (isGameOrScreen) {
    each(/\bMath\s*\.\s*random\b/g, code, (m) => add('error', 'random', at(m.index).line, at(m.index).col, 'Math.random in js/games or js/screens (use ctx.rng / WS.util.rng)'));
    each(/\bcrypto\s*\.\s*getRandomValues\b/g, code, (m) => add('warning', 'random', at(m.index).line, at(m.index).col, 'crypto.getRandomValues is not seeded (use ctx.rng / WS.util.rng)'));
  }
  if (rel !== 'js/screens/about.js') {
    each(/https?:\/\/[^\s'"`)]*/gi, text, (m) => {
      if (/^http:\/\/www\.w3\.org\//i.test(m[0])) return;
      add('error', 'url', at(m.index).line, at(m.index).col, `absolute URL ${m[0].slice(0, 60)} (no external requests; only about.js may link out)`);
    });
    for (const s of strings) {
      if (/^\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(s.value)) {
        add('error', 'url', at(s.start).line, at(s.start).col, `protocol-relative URL ${s.value.slice(0, 60)} (no external requests)`);
      }
    }
  }
  each(/(?<![.\w$])eval\s*\(/g, code, (m) => add('error', 'eval', at(m.index).line, at(m.index).col, 'eval() is forbidden'));
  each(/(?<![.\w$])(?:new\s+)?Function\s*\(/g, code, (m) => add('error', 'eval', at(m.index).line, at(m.index).col, 'new Function() is forbidden'));
  each(/\b(?:setTimeout|setInterval)\s*\(\s*['"`]/g, code, (m) => add('error', 'eval', at(m.index).line, at(m.index).col, 'string code in setTimeout/setInterval is forbidden'));
  each(/\bdocument\s*\.\s*write(?:ln)?\s*\(/g, code, (m) => add('error', 'document-write', at(m.index).line, at(m.index).col, 'document.write is forbidden'));
  each(/(?<![.\w$])debugger\b/g, code, (m) => add('error', 'debugger', at(m.index).line, at(m.index).col, 'debugger statement'));

  // WS: записи и (в играх) чтения
  const wsWrites = [];
  each(new RegExp(String.raw`(?<![.\w$])WS(${MEMBERS}*)\s*(?:${ASSIGN}|\+\+|--)`, 'g'), code, (m) => {
    const first = /^\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*['"]?([^\]'"]*))/.exec(m[1]);
    wsWrites.push({ index: m.index, key: first ? (first[1] ?? first[2]) : null, chain: m[1].replace(/\s+/g, '') });
  });
  each(/\bObject\s*\.\s*(?:assign|defineProperty|defineProperties)\s*\(\s*WS\b((?:\s*\.\s*[A-Za-z_$][\w$]*)?)/g, code, (m) => {
    const key = m[1] ? m[1].replace(/[\s.]/g, '') : null;
    wsWrites.push({ index: m.index, key, chain: m[1] ? `.${key}` : '' });
  });
  if (isGame) {
    const reg = [...code.matchAll(/(?<![.\w$])WS\s*\.\s*games\s*\.\s*register\s*\(/g)];
    if (!reg.length) add('error', 'game', 1, 1, 'a game file must call WS.games.register({ id, howto, start })');
    if (reg.length > 1) add('warning', 'game', at(reg[1].index).line, at(reg[1].index).col, 'WS.games.register is called more than once');
    if (reg.length) {
      const idm = /\bid\s*:\s*(['"])([^'"\n]*)\1/.exec(text.slice(reg[0].index));
      if (idm && idm[2] !== gameId) {
        const off = reg[0].index + idm.index;
        add('error', 'game', at(off).line, at(off).col, `registered id ${JSON.stringify(idm[2])} must equal the file name ${JSON.stringify(gameId)}`);
      }
    }
    for (const w of wsWrites) {
      add('error', 'game', at(w.index).line, at(w.index).col, `game files must not write to WS (found WS${w.chain} = …); only WS.games.register(…)`);
    }
    each(/(?<![.\w$])WS\s*\.\s*([A-Za-z_$][\w$]*)(\s*\.\s*[A-Za-z_$][\w$]*)?/g, code, (m) => {
      const key = m[1];
      const sub = m[2] ? m[2].replace(/[\s.]/g, '') : '';
      if (key === 'games' && sub === 'register') return;
      if (['ui', 'util', 't'].includes(key)) return;
      if (wsWrites.some((w) => w.index === m.index)) return;
      add('warning', 'game', at(m.index).line, at(m.index).col, `games use ctx instead of WS.${key}${sub ? `.${sub}` : ''} (allowed: WS.games.register, WS.ui, WS.util, WS.t)`);
    });
    each(/(?<![.\w$])WS\s*(?:\[|(?=[^.\w$\s]))/g, code, (m) => {
      if (wsWrites.some((w) => w.index === m.index)) return;
      add('warning', 'game', at(m.index).line, at(m.index).col, 'games should not pass WS around (use ctx)');
    });
  } else {
    const allowed = wsWritable(rel);
    if (allowed !== '*') {
      for (const w of wsWrites) {
        if (w.key && allowed.includes(w.key)) continue;
        const owner = w.key ? WS_OWNER_HINT[w.key] : 'js/core/ns.js';
        const what = w.key ? `WS.${w.key}` : 'WS itself';
        add('warning', 'ws-owner', at(w.index).line, at(w.index).col,
          `writes to ${what} (WS${w.chain})${owner ? `, owned by ${owner}` : ''}; add only to WS objects this file owns`);
      }
    }
  }

  // стиль (предупреждения)
  each(/(?<![.\w$])var\s+[A-Za-z_$[{]/g, code, (m) => add('warning', 'style', at(m.index).line, at(m.index).col, 'use const/let instead of var'));
  each(/(?<![.\w$])function\b(?!\s*\*)/g, code, (m) => add('warning', 'style', at(m.index).line, at(m.index).col, 'use arrow functions instead of function'));
  for (const s of strings) {
    if (s.quote === '"' && !s.value.includes('\'')) {
      add('warning', 'quotes', at(s.start).line, at(s.start).col, 'use single quotes');
    }
  }
  each(/\.(innerHTML|outerHTML)\s*(\+?=)(?!=)\s*([^;\n]*)/g, text, (m) => {
    const rhs = m[3].trim();
    if (m[2] === '=' && (/^(['"`])\1$/.test(rhs) || /\bicons\b/.test(rhs))) return;
    add('warning', 'innerHTML', at(m.index).line, at(m.index).col, `${m[1]} ${m[2]} … (use textContent / WS.util.el; innerHTML only for WS.ui.icons strings)`);
  });
  each(/\binsertAdjacentHTML\s*\(/g, code, (m) => add('warning', 'innerHTML', at(m.index).line, at(m.index).col, 'insertAdjacentHTML (use WS.util.el / textContent)'));
  each(/\bconsole\s*\.\s*(log|debug|info|dir|table|trace)\s*\(/g, code, (m) => add('warning', 'console', at(m.index).line, at(m.index).col, `console.${m[1]} left in code`));
  each(/(?<![.\w$'"])(sessionStorage|indexedDB|document\s*\.\s*cookie)\b/g, code, (m) => add('warning', 'api', at(m.index).line, at(m.index).col, `${m[1].replace(/\s+/g, '')}: keep state in WS.store`));
  each(/(?<![.\w$])(?:window\s*\.\s*)?(alert|prompt)\s*\(/g, code, (m) => add('warning', 'api', at(m.index).line, at(m.index).col, `${m[1]}() blocks the page (use WS.shell.toast / WS.shell.confirm)`));

  // отступы: только строки, которые начинаются в коде (не внутри шаблона или комментария)
  const lines = src.split('\n');
  let off = 0;
  for (let k = 0; k < lines.length; k++) {
    const ln = lines[k];
    const ws = /^[ \t]*/.exec(ln)[0];
    const q0 = off + ws.length;
    off += ln.length + 1;
    if (ws.length === ln.length) continue;
    if (code[q0] === ' ' && src[q0] !== ' ') continue;
    if (ws.includes('\t')) add('warning', 'indent', k + 1, 1, 'tab in indentation (use 2 spaces)');
    else if (ws.length % 2) add('warning', 'indent', k + 1, 1, `indentation of ${ws.length} spaces (use multiples of 2)`);
  }
};

// ---------------------------------------------------------------------------------------------------------
// Проверки CSS
// ---------------------------------------------------------------------------------------------------------

const cssScope = (rel) => {
  let m = /^css\/games\/([^/]+)\.css$/.exec(rel);
  if (m) return { kind: 'game', name: m[1], prefixes: [`.g-${m[1]}`], keyframes: `g-${m[1]}` };
  m = /^css\/screens\/([^/]+)\.css$/.exec(rel);
  if (m) {
    const prefixes = [`.s-${m[1]}`];
    if (m[1] === 'learn') prefixes.push('.s-chapter');
    return { kind: 'screen', name: m[1], prefixes, keyframes: `s-${m[1]}` };
  }
  return { kind: null, prefixes: null };
};

const splitTopLevel = (s, sep) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === '\'') quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      parts.push({ text: s.slice(start, i), offset: start });
      start = i + 1;
    }
  }
  parts.push({ text: s.slice(start), offset: start });
  return parts;
};

const skipCssString = (s, i) => {
  const q = s[i];
  let j = i + 1;
  while (j < s.length && s[j] !== q && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
  return j + 1;
};

const checkCss = (rel, src, add) => {
  const pos = lineIndex(src);
  const at = (o) => pos(o);
  const unclosed = src.indexOf('/*', src.lastIndexOf('*/') + 2);
  const s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  if (unclosed >= 0 && /\/\*(?![\s\S]*\*\/)/.test(s)) add('error', 'css-syntax', at(unclosed).line, at(unclosed).col, 'unclosed comment');
  const scope = cssScope(rel);

  const startsWithPrefix = (sel) => scope.prefixes.some((pre) => sel.startsWith(pre) && /^(?:$|__|--|[^A-Za-z0-9_-])/.test(sel.slice(pre.length)));

  const checkSelectors = (prelude, off) => {
    if (!scope.prefixes) return;
    for (const part of splitTopLevel(prelude, ',')) {
      const sel = part.text.trim();
      const selOff = off + part.offset + Math.max(0, part.text.search(/\S/));
      const where = at(selOff);
      if (!sel) {
        add('error', 'css-syntax', where.line, where.col, 'empty selector in a selector list');
        continue;
      }
      if (startsWithPrefix(sel)) continue;
      const ctx = /^(?:(?::root|html)(?=[\s[]))?(?:\[data-(?:theme|look|motion)(?:[~|^$*]?=[^\]]*)?\])*\s*/.exec(sel);
      const rest = sel.slice(ctx[0].length).replace(/^[>+~\s]+/, '');
      if (ctx[0].trim() && startsWithPrefix(rest)) {
        add('warning', 'css-context', where.line, where.col, `selector ${JSON.stringify(sel)} starts with a theme/look/motion context (prefer tokens)`);
        continue;
      }
      add('error', 'css-prefix', where.line, where.col, `selector ${JSON.stringify(sel)} must start with ${scope.prefixes.join(' or ')}`);
    }
  };

  const checkValue = (prop, value, off) => {
    const v = value.replace(/(["'])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m[0] + ' '.repeat(Math.max(0, m.length - 2)) + m[0]);
    const urlRe = /url\(\s*(['"]?)\s*((?:https?:)?\/\/[^'")\s]*)/gi;
    let m;
    const raw = value;
    while ((m = urlRe.exec(raw))) {
      const where = at(off + m.index);
      add('error', 'url', where.line, where.col, `external url(${m[2].slice(0, 60)}) (everything must be local)`);
    }
    if (!scope.kind) return;
    if (prop.startsWith('--') && /^\s*$/.test(v)) return;
    const hexRe = /(^|[^\w&#-])#([0-9a-fA-F]{3,8})(?![\w-])/g;
    while ((m = hexRe.exec(v))) {
      if (![3, 4, 6, 8].includes(m[2].length)) continue;
      const where = at(off + m.index + m[1].length);
      add('warning', 'color', where.line, where.col, `raw colour #${m[2]} in ${prop} (use a token from css/tokens.css)`);
    }
    const fnRe = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(([^()]*)\)/gi;
    while ((m = fnRe.exec(v))) {
      if (/var\(/.test(m[2]) || /\bfrom\b/.test(m[2])) continue;
      const where = at(off + m.index);
      add('warning', 'color', where.line, where.col, `raw colour ${m[1]}(…) in ${prop} (use a token from css/tokens.css)`);
    }
  };

  const handleStatement = (stmt, off, ctx) => {
    const t = stmt.trim();
    if (!t) return;
    const tOff = off + stmt.search(/\S/);
    const where = at(tOff);
    if (t.startsWith('@')) {
      if (/^@import\b/i.test(t)) {
        if (/(?:https?:)?\/\//i.test(t)) add('error', 'url', where.line, where.col, '@import of an external stylesheet');
        else if (scope.kind) add('warning', 'css-import', where.line, where.col, '@import in a lazy-loaded stylesheet (adds a request)');
      }
      return;
    }
    if (ctx === 'top' || ctx === 'keyframes') {
      add('error', 'css-syntax', where.line, where.col, `stray text ${JSON.stringify(t.slice(0, 40))}`);
      return;
    }
    const colon = t.indexOf(':');
    if (colon < 0) {
      add('error', 'css-syntax', where.line, where.col, `invalid declaration ${JSON.stringify(t.slice(0, 40))}`);
      return;
    }
    checkValue(t.slice(0, colon).trim().toLowerCase(), t.slice(colon + 1), tOff + colon + 1);
  };

  const walk = (start, end, ctx) => {
    let i = start;
    let stmtStart = start;
    while (i < end) {
      const ch = s[i];
      if (ch === '"' || ch === '\'') {
        i = skipCssString(s, i);
        continue;
      }
      if (ch === '{') {
        let depth = 0;
        let j = i;
        for (; j < end; j++) {
          if (s[j] === '"' || s[j] === '\'') {
            j = skipCssString(s, j) - 1;
            continue;
          }
          if (s[j] === '{') depth++;
          else if (s[j] === '}' && --depth === 0) break;
        }
        if (j >= end) {
          add('error', 'css-syntax', at(i).line, at(i).col, 'unclosed {');
          return;
        }
        handleBlock(s.slice(stmtStart, i), stmtStart, i + 1, j, ctx);
        i = j + 1;
        stmtStart = i;
        continue;
      }
      if (ch === ';') {
        handleStatement(s.slice(stmtStart, i), stmtStart, ctx);
        i++;
        stmtStart = i;
        continue;
      }
      if (ch === '}') {
        add('error', 'css-syntax', at(i).line, at(i).col, 'unexpected }');
        i++;
        stmtStart = i;
        continue;
      }
      i++;
    }
    handleStatement(s.slice(stmtStart, end), stmtStart, ctx);
  };

  const handleBlock = (prelude, preludeStart, innerStart, innerEnd, ctx) => {
    const p = prelude.trim();
    const pOff = preludeStart + Math.max(0, prelude.search(/\S/));
    const where = at(pOff);
    if (!p) {
      add('error', 'css-syntax', where.line, where.col, 'block without a selector');
      walk(innerStart, innerEnd, 'rule');
      return;
    }
    if (p.startsWith('@')) {
      const name = (/^@([\w-]+)/.exec(p)?.[1] ?? '').toLowerCase();
      if (['media', 'supports', 'container', 'layer', 'scope', 'document', 'starting-style'].includes(name)) {
        walk(innerStart, innerEnd, ctx === 'top' ? 'top' : 'rule');
      } else if (/keyframes$/.test(name)) {
        const kf = p.replace(/^@[\w-]+\s*/, '').trim();
        if (scope.keyframes && !kf.startsWith(scope.keyframes)) {
          add('warning', 'css-keyframes', where.line, where.col, `@keyframes ${kf} should be prefixed ${scope.keyframes}- (names are global)`);
        }
        walk(innerStart, innerEnd, 'keyframes');
      } else {
        walk(innerStart, innerEnd, 'decls');
      }
      return;
    }
    if (ctx === 'top') checkSelectors(p, pOff);
    walk(innerStart, innerEnd, ctx === 'keyframes' ? 'decls' : 'rule');
  };

  walk(0, s.length, 'top');
};

// ---------------------------------------------------------------------------------------------------------
// index.html
// ---------------------------------------------------------------------------------------------------------

const checkHtml = (rel, src, add) => {
  const pos = lineIndex(src);
  const s = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const re = /\b(src|href|action|poster|data)\s*=\s*(["']?)\s*((?:https?:)?\/\/[^"'\s>]*)/gi;
  let m;
  while ((m = re.exec(s))) {
    const where = pos(m.index);
    add('error', 'url', where.line, where.col, `external ${m[1]}=${m[3].slice(0, 60)} (everything must be local)`);
  }
  const css = /url\(\s*['"]?((?:https?:)?\/\/[^'")\s]*)/gi;
  while ((m = css.exec(s))) {
    const where = pos(m.index);
    add('error', 'url', where.line, where.col, `external url(${m[1].slice(0, 60)})`);
  }
};

// ---------------------------------------------------------------------------------------------------------
// Запуск
// ---------------------------------------------------------------------------------------------------------

const WARN_CAP = 5;

const checkFile = async (root, rel) => {
  const abs = path.join(root, rel);
  const found = [];
  const add = (level, rule, line, col, msg) => found.push({ level, rule, line, col, msg });
  let src;
  try {
    src = readFileSync(abs, 'utf8');
  } catch (e) {
    add('error', 'read', 1, 1, `cannot read: ${e.code || e.message}`);
    return found;
  }
  if (src.charCodeAt(0) === 0xfeff) {
    add('warning', 'style', 1, 1, 'byte-order mark at the start of the file');
    src = src.slice(1);
  }
  if (/\.(js|mjs|cjs)$/.test(rel)) {
    const syn = await syntaxCheck(abs);
    if (syn) add('error', 'syntax', syn.line, 1, syn.msg);
    if (rel.endsWith('.js')) checkJs(rel, src, add);
    else {
      const body = src.replace(/^#!.*\n/, '');
      const head = /^\s*(\/\*[\s\S]*?\*\/|(?:\/\/.*\n)+)/.exec(body);
      if (!head || !CYRILLIC.test(head[1])) add('warning', 'header', 1, 1, 'Node tool should start with a Russian header comment');
    }
  } else if (rel.endsWith('.css')) {
    checkCss(rel, src, add);
  } else if (rel.endsWith('.html')) {
    checkHtml(rel, src, add);
  }
  // ограничить шум: не больше WARN_CAP предупреждений одного правила на файл
  const out = [];
  const perRule = new Map();
  for (const f of found.sort((a, b) => a.line - b.line || a.col - b.col)) {
    if (f.level === 'warning') {
      const n = (perRule.get(f.rule) ?? 0) + 1;
      perRule.set(f.rule, n);
      if (n > WARN_CAP) continue;
    }
    out.push(f);
  }
  for (const [rule, n] of perRule) {
    if (n > WARN_CAP) out.push({ level: 'warning', rule, line: 0, col: 0, msg: `… and ${n - WARN_CAP} more ${rule} warnings in this file` });
  }
  return out;
};

const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

const main = async () => {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    process.stderr.write(`check-code: ${e.message}\n\n${USAGE}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (!existsSync(opts.root)) {
    process.stderr.write(`check-code: root ${opts.root} does not exist\n`);
    process.exit(2);
  }
  const { files, notes } = selectFiles(opts);
  const results = await mapLimit(files, 8, (rel) => checkFile(opts.root, rel));
  const shown = (rel) => {
    const r = path.relative(process.cwd(), path.join(opts.root, rel)).split(path.sep).join('/');
    return r.startsWith('../../') ? path.join(opts.root, rel) : r;
  };
  const issues = [];
  files.forEach((rel, k) => results[k].forEach((f) => issues.push({ file: shown(rel), ...f })));
  const errors = issues.filter((it) => it.level === 'error');
  const warnings = issues.filter((it) => it.level === 'warning');
  const byRule = (list) => {
    const o = {};
    list.forEach((it) => { o[it.rule] = (o[it.rule] ?? 0) + 1; });
    return o;
  };
  const kinds = {};
  files.forEach((f) => { const ext = path.extname(f).slice(1); kinds[ext] = (kinds[ext] ?? 0) + 1; });
  const summary = { files: files.length, kinds, errors: errors.length, warnings: warnings.length, errorsByRule: byRule(errors), warningsByRule: byRule(warnings), notes };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, files: files.map(shown), errors, warnings, summary }, null, 2)}\n`);
  } else {
    const tty = process.stdout.isTTY && !process.env.NO_COLOR;
    const paint = (c, s) => (tty ? `\x1b[${c}m${s}\x1b[0m` : s);
    const out = [];
    notes.forEach((n) => out.push(paint('33', `note     ${n}`)));
    for (const it of issues) {
      if (it.level === 'warning' && opts.quiet) continue;
      const lvl = it.level === 'error' ? paint('31', 'error  ') : paint('33', 'warning');
      const where = it.line ? `${it.file}:${it.line}:${it.col}` : it.file;
      out.push(`${lvl}  ${where}  ${it.msg}`);
    }
    const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
    out.push('');
    out.push(`check-code: ${files.length} file(s) (${fmt(kinds) || 'none'})`);
    out.push(`errors: ${errors.length}${errors.length ? ` (${fmt(summary.errorsByRule)})` : ''}`);
    out.push(`warnings: ${warnings.length}${warnings.length ? ` (${fmt(summary.warningsByRule)})` : ''}`);
    out.push(errors.length ? paint('31', 'FAIL') : paint('32', 'OK'));
    process.stdout.write(`${out.join('\n')}\n`);
  }
  process.exitCode = errors.length ? 1 : 0;
};

await main();

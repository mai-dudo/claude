/* Пространство имён WordSprout: создаёт window.WS, общий набор помощников WS.util и разбирает
   тестовый режим (?test=1&seed=N&tts=off в адресе до «#») в WS.test.
   Это единственный файл, который пишет в window. Остальные файлы добавляют свои объекты в WS.

   WS.util:
   - q(sel, root), qa(sel, root) — querySelector и querySelectorAll (qa возвращает массив);
   - el(tag, props, ...kids) — создаёт элемент. Ключи props: class/className (строка или массив),
     text (textContent), html (только SVG-строки из WS.ui.icons, любой другой текст попадёт в
     textContent), dataset, style (объект или строка),
     attrs (атрибуты как есть), on<событие> (функция → addEventListener). Остальные ключи: свойство
     элемента, если оно есть, иначе атрибут. null/undefined пропускаются; false снимает логическое
     свойство (spellcheck: false → spellcheck="false"). Дети: строки, числа, узлы, вложенные массивы;
     null/false/true пропускаются;
   - rng(seed) → функция-генератор чисел [0, 1) (mulberry32). Seed: число или строка; без seed — случайный;
   - shuffle(arr, rng) — новый перемешанный массив; sample(arr, n, rng) — n случайных элементов;
   - plural(n, ['слово', 'слова', 'слов']) — русская форма для числа n;
   - todayKey(date) → 'YYYY-MM-DD' по местному времени; addDays(key, n); daysBetween(a, b) = b − a в днях;
   - norm(s) — NFC, нижний регистр, типографские апострофы → «'»; isLetter(ch) — одна буква любого языка;
   - sleep(ms, signal) → Promise<true>. Если signal отменён (уход с экрана), обещание не выполняется
     никогда: код игры после await просто не продолжается, без ошибок в консоли. */
(() => {
  'use strict';

  const WS = window.WS || {};
  window.WS = WS;
  WS.ui = WS.ui || {};

  /* ---------- Поиск и создание элементов ---------- */
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const appendKids = (node, kids) => {
    for (const kid of kids) {
      if (kid == null || kid === false || kid === true) continue;
      if (Array.isArray(kid)) appendKids(node, kid);
      else if (kid instanceof Node) node.append(kid);
      else if (typeof kid === 'object' && typeof kid.length === 'number') appendKids(node, Array.from(kid));
      else node.append(document.createTextNode(String(kid)));
    }
  };

  const setStyle = (node, style) => {
    if (typeof style === 'string') {
      node.style.cssText = style;
      return;
    }
    for (const [name, value] of Object.entries(style)) {
      if (value == null || value === false) continue;
      if (name.startsWith('--') || name.includes('-')) node.style.setProperty(name, String(value));
      else node.style[name] = value;
    }
  };

  // Разметку через innerHTML пропускаем только для SVG-строк из WS.ui.icons.
  const setIcons = (node, icons) => {
    const markup = String(icons);
    if (/^\s*<svg[\s>]/i.test(markup)) node.innerHTML = icons;
    else node.textContent = markup;
  };

  const setProp = (node, key, value) => {
    if (value == null) return;
    if (key === 'class' || key === 'className') {
      const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
      if (cls) node.setAttribute('class', cls);
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'html') {
      setIcons(node, value);
    } else if (key === 'dataset') {
      for (const [name, v] of Object.entries(value)) {
        if (v != null && v !== false) node.dataset[name] = v === true ? '' : String(v);
      }
    } else if (key === 'style') {
      setStyle(node, value);
    } else if (key === 'attrs') {
      for (const [name, v] of Object.entries(value)) {
        if (v != null && v !== false) node.setAttribute(name, v === true ? '' : String(v));
      }
    } else if (key.length > 2 && key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key.startsWith('aria-')) {
      node.setAttribute(key, String(value));
    } else if (typeof value === 'boolean') {
      if (key in node && typeof node[key] === 'boolean') node[key] = value;
      else if (value) node.setAttribute(key, '');
    } else if (!key.includes('-') && key in node && typeof node[key] !== 'boolean') {
      node[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  };

  const el = (tag, props, ...kids) => {
    const node = document.createElement(tag);
    if (props) for (const [key, value] of Object.entries(props)) setProp(node, key, value);
    appendKids(node, kids);
    return node;
  };

  /* ---------- Случайные числа с зерном ---------- */
  const hashString = (str) => {
    // FNV-1a, 32 бита
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  const randomSeed = () => {
    try {
      return crypto.getRandomValues(new Uint32Array(1))[0];
    } catch (e) {
      return (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
    }
  };

  const rng = (seed) => {
    let a;
    if (typeof seed === 'number' && Number.isFinite(seed)) a = Math.floor(seed) >>> 0;
    else if (typeof seed === 'string' && seed !== '') a = hashString(seed);
    else a = randomSeed();
    // mulberry32
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const pickRng = (r) => (typeof r === 'function' ? r : Math.random);

  const shuffle = (arr, r) => {
    const rand = pickRng(r);
    const out = Array.from(arr || []);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const sample = (arr, n, r) => {
    const rand = pickRng(r);
    const out = Array.from(arr || []);
    const k = Math.max(0, Math.min(out.length, Math.floor(Number(n) || 0)));
    for (let i = 0; i < k; i++) {
      const j = i + Math.floor(rand() * (out.length - i));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, k);
  };

  /* ---------- Русские формы числа ---------- */
  const plural = (n, forms) => {
    const [one, few, many] = forms;
    const num = Math.abs(Number(n));
    if (!Number.isInteger(num)) return few;
    const d10 = num % 10;
    const d100 = num % 100;
    if (d10 === 1 && d100 !== 11) return one;
    if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return few;
    return many;
  };

  /* ---------- Даты (только местное время) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  const todayKey = (date) => {
    if (typeof date === 'string' && KEY_RE.test(date)) return date;
    const d = date == null ? new Date() : date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const parseKey = (key) => {
    const m = KEY_RE.exec(todayKey(key));
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  };

  const addDays = (key, n) => {
    const [y, m, d] = parseKey(key);
    // полдень, чтобы переход на летнее время не сдвигал дату
    return todayKey(new Date(y, m - 1, d + Math.round(Number(n) || 0), 12));
  };

  const daysBetween = (a, b) => {
    const [y1, m1, d1] = parseKey(a);
    const [y2, m2, d2] = parseKey(b);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  };

  /* ---------- Текст ---------- */
  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, '\'');

  const isLetter = (ch) => typeof ch === 'string' && /^\p{L}$/u.test(ch);

  /* ---------- Пауза, которую можно отменить ---------- */
  const sleep = (ms, signal) => new Promise((resolve) => {
    if (signal && signal.aborted) return;
    const timer = setTimeout(() => resolve(true), Math.max(0, Number(ms) || 0));
    if (signal) signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  });

  WS.util = {
    q, qa, el, shuffle, sample, rng, plural, todayKey, addDays, daysBetween, norm, isLetter, sleep,
  };

  /* ---------- Тестовый режим ---------- */
  const params = new URLSearchParams(location.search);
  const enabled = params.get('test') === '1';
  const seedRaw = parseInt(params.get('seed'), 10);
  WS.test = {
    enabled,
    seed: Number.isFinite(seedRaw) ? seedRaw : 1,
    tts: enabled && params.get('tts') === 'off' ? 'off' : 'on',
    expect: null,
    state: '',
    records: [],
    spoken: [],
    events: [],
  };
})();

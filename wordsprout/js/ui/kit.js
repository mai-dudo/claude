/* Набор элементов интерфейса WS.ui (CONTRACTS §3.4, правила вида — docs/STYLE.md): кнопки, круглые
   кнопки-иконки, «послушать», «подсказка», картинка слова с запасными вариантами (файл эмодзи →
   системный эмодзи → цветная плитка с русским словом), перевод, предложение с пропуском, сетка
   вариантов, полоса прогресса, звёзды, карточка, окно, вспышка «верно/ошибка», кнопка «Дальше»,
   тайминги и общие горячие клавиши (Enter — дальше, Ctrl+Пробел — послушать, Ctrl+H — подсказка,
   1–9 — вариант). Всё строится через свой маленький h(), текст — только через textContent. */
(() => {
  'use strict';

  const ui = WS.ui;
  const root = document.documentElement;

  /* ---------- Создание элементов ---------- */
  const append = (node, kids) => {
    for (const kid of kids) {
      if (kid == null || kid === false || kid === true) continue;
      if (Array.isArray(kid)) append(node, kid);
      else if (kid instanceof Node) node.append(kid);
      else node.append(document.createTextNode(String(kid)));
    }
  };

  // props: class (строка или массив), text, data {}, style (строка), on { событие: fn }, остальное — атрибуты
  const h = (tag, props, ...kids) => {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') node.className = Array.isArray(value) ? value.filter(Boolean).join(' ') : String(value);
        else if (key === 'text') node.textContent = String(value);
        else if (key === 'data') {
          for (const [k, v] of Object.entries(value)) if (v != null && v !== false) node.dataset[k] = String(v);
        } else if (key === 'style') node.style.cssText = String(value);
        else if (key === 'on') {
          for (const [type, fn] of Object.entries(value)) node.addEventListener(type, fn);
        } else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    append(node, kids);
    return node;
  };

  const isPlain = (v) => v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Node);
  const listen = (signal) => (signal ? { signal } : undefined);

  const icon = (name, { className = null, label = '' } = {}) => {
    const span = h('span', {
      class: ['ws-icon', ...(Array.isArray(className) ? className : [className])],
      'aria-hidden': label ? null : 'true', role: label ? 'img' : null, 'aria-label': label || null,
    });
    span.innerHTML = ui.icons[name] || ui.icons.info;
    return span;
  };

  /* ---------- Окружение ---------- */
  const settings = () => {
    try {
      return (WS.settings && typeof WS.settings.get === 'function' && WS.settings.get()) || {};
    } catch (e) {
      return {};
    }
  };

  const media = (q) => !!(window.matchMedia && window.matchMedia(q).matches);

  const reducedMotion = () => {
    if (WS.test && WS.test.enabled) return true;
    const m = root.dataset.motion;
    return m ? m === 'reduce' : media('(prefers-reduced-motion: reduce)');
  };

  const isTouch = () => media('(pointer: coarse)') || (!media('(pointer: fine)') && (navigator.maxTouchPoints || 0) > 0);

  const toast = (msg) => {
    if (WS.shell && typeof WS.shell.toast === 'function') WS.shell.toast(msg);
  };

  // Кнопка не забирает фокус у поля для букв (иначе на телефоне закроется клавиатура).
  const keepFocus = (node) => {
    node.addEventListener('mousedown', (e) => e.preventDefault());
    return node;
  };

  /* ---------- Горячие клавиши (компьютер) ----------
     Срабатывает последний зарегистрированный видимый и доступный элемент. Игры свои обработчики
     тех же клавиш не вешают; если всё же обработали клавишу сами — пусть вызовут e.preventDefault(). */
  const binds = [];

  const comboOf = (e) => {
    if (e.altKey || e.metaKey) return '';
    if (e.ctrlKey) {
      if (e.code === 'Space' || e.key === ' ') return 'ctrl+space';
      if (e.code === 'KeyH' || e.key === 'h' || e.key === 'H') return 'ctrl+h';
      return '';
    }
    if (e.key === 'Enter') return 'enter';
    if (/^[1-9]$/.test(e.key)) return e.key;
    return '';
  };

  const isField = (t) => !!t && t.nodeType === 1
    && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  const isLetters = (t) => !!t && !!t.dataset && t.dataset.ws === 'letters-input';
  const shown = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const usable = (node) => !node.disabled && node.getAttribute('aria-disabled') !== 'true' && !node.closest('[inert]');

  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.isComposing || e.repeat) return;
    const combo = comboOf(e);
    if (!combo) return;
    const t = e.target;
    if (isField(t) && !isLetters(t)) return;
    if (/^[1-9]$/.test(combo) && isField(t)) return;
    if (combo === 'enter' && t && t.closest && t.closest('button, a[href], summary, [role=button], [role=radio]')) return;
    const dialog = document.querySelector('[aria-modal="true"]');
    for (let i = binds.length - 1; i >= 0; i--) {
      const b = binds[i];
      if (!b.node.isConnected) {
        if (b.seen) binds.splice(i, 1);
        continue;
      }
      b.seen = true;
      if (b.combo !== combo || !shown(b.node) || !usable(b.node)) continue;
      if (dialog && !dialog.contains(b.node)) continue;
      e.preventDefault();
      b.fn(e);
      return;
    }
  });

  const shortcut = (combo, node, fn = null, { signal = null } = {}) => {
    const entry = { combo: String(combo).toLowerCase(), node, fn: fn || (() => node.click()), seen: false };
    binds.push(entry);
    const off = () => {
      const i = binds.indexOf(entry);
      if (i >= 0) binds.splice(i, 1);
    };
    if (signal) {
      if (signal.aborted) off();
      else signal.addEventListener('abort', off, { once: true });
    }
    return off;
  };

  /* ---------- Кнопки ---------- */
  const BTN_KINDS = ['primary', 'secondary', 'ghost', 'accent', 'danger'];

  const button = ({
    text = '', icon: iconName = '', iconEnd = '', kind = 'primary', size = '', block = false, onClick = null,
    ws = null, label = '', title = '', disabled = false, keepFocus: keep = false, type = 'button', href = '',
    className = '', key = '', signal = null,
  } = {}) => {
    const b = h(href ? 'a' : 'button', {
      type: href ? null : type,
      href: href || null,
      class: ['ws-btn', `ws-btn--${BTN_KINDS.includes(kind) ? kind : 'primary'}`, size && `ws-btn--${size}`,
        block && 'ws-btn--block', className],
      data: ws ? { ws } : null,
      'aria-label': label || null,
      title: title || null,
      disabled: !href && disabled,
    },
    iconName ? icon(iconName) : null,
    text !== '' && text != null ? h('span', { class: 'ws-btn__text', text }) : null,
    iconEnd ? icon(iconEnd, { className: 'ws-btn__end' }) : null);
    if (onClick) b.addEventListener('click', onClick, listen(signal));
    if (keep) keepFocus(b);
    if (key) shortcut(key, b, null, { signal });
    return b;
  };

  const iconButton = ({
    icon: iconName = 'info', label = '', title = null, onClick = null, ws = null, kind = 'soft', size = '',
    pressed = null, keepFocus: keep = true, key = '', signal = null, className = '',
  } = {}) => {
    const b = h('button', {
      type: 'button',
      class: ['ws-iconbtn', kind && kind !== 'soft' && `ws-iconbtn--${kind}`, size && `ws-iconbtn--${size}`, className],
      data: ws ? { ws } : null,
      'aria-label': label || null,
      title: (title == null ? label : title) || null,
      'aria-pressed': pressed == null ? null : String(!!pressed),
    }, icon(iconName));
    if (onClick) b.addEventListener('click', onClick, listen(signal));
    if (keep) keepFocus(b);
    if (key) shortcut(key, b, null, { signal });
    return b;
  };

  const canSpeak = () => {
    try {
      return !!(WS.speech && typeof WS.speech.canSpeak === 'function' && WS.speech.canSpeak());
    } catch (e) {
      return false;
    }
  };

  const speechHint = () => {
    const status = WS.speech && WS.speech.status;
    if (status === 'off') return 'Звук выключен. Включить его можно в настройках.';
    if (status === 'novoice') return 'На этом устройстве нет английского голоса. Подсказка — в настройках.';
    if (status === 'blocked') return 'Браузер не включил голос. Подсказка — в настройках.';
    return 'Голос сейчас недоступен.';
  };

  const playing = (b, result) => {
    if (!result || typeof result.then !== 'function') return;
    b.classList.add('is-playing');
    result.catch(() => false).then(() => b.classList.remove('is-playing'));
  };

  // text — строка или функция, которая её возвращает; onClick(e, { slow, rate }) заменяет озвучку.
  const speakerButton = ({
    text = '', slow = false, rate = null, onClick = null, label = '', size = '', kind = '', key = null, signal = null,
    className = '',
  } = {}) => {
    const b = iconButton({
      icon: slow ? 'turtle' : 'speaker',
      label: label || (slow ? 'Послушать медленно' : 'Послушать'),
      ws: 'speak',
      size: size || (slow ? 's' : ''),
      kind: kind || 'soft',
      signal,
      className: ['ws-speak', slow && 'ws-speak--slow', className].filter(Boolean).join(' '),
    });
    if (slow) b.dataset.slow = '1';
    b.classList.toggle('is-off', !canSpeak());
    b.addEventListener('click', (e) => {
      const speed = slow ? 0.7 : rate;
      if (onClick) {
        playing(b, onClick(e, { slow, rate: speed }));
        return;
      }
      const value = typeof text === 'function' ? text() : text;
      if (!value) return;
      if (!canSpeak()) {
        b.classList.add('is-off');
        toast(speechHint());
        return;
      }
      b.classList.remove('is-off');
      playing(b, WS.speech.speak(String(value), speed ? { rate: speed } : {}));
    }, listen(signal));
    const combo = key === null ? (slow ? '' : 'ctrl+space') : key;
    if (combo) shortcut(combo, b, null, { signal });
    return b;
  };

  const eyeButton = ({ onToggle = null, pressed = false, label = 'Подсказка', key = 'ctrl+h', signal = null } = {}) => {
    const b = iconButton({ icon: pressed ? 'eye-off' : 'eye', label, ws: 'reveal', pressed: !!pressed, signal,
      className: 'ws-eye' });
    const set = (on) => {
      b.setAttribute('aria-pressed', String(on));
      b.classList.toggle('is-on', on);
      b.querySelector('.ws-icon').innerHTML = ui.icons[on ? 'eye-off' : 'eye'];
    };
    set(!!pressed);
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      set(on);
      if (onToggle) onToggle(on, b);
    }, listen(signal));
    if (key) shortcut(key, b, null, { signal });
    return b;
  };

  const nextButton = ({ text = 'Дальше', onClick = null, signal = null, key = 'enter', kind = 'primary', size = '' } = {}) =>
    button({ text, iconEnd: 'arrow-right', kind, size, ws: 'next', onClick, keepFocus: true, key, signal,
      className: 'ws-next' });

  /* ---------- Картинка слова ---------- */
  const emojiChar = (code) => {
    if (!code) return '';
    const cps = String(code).split('-').map((x) => parseInt(x, 16)).filter((n) => Number.isFinite(n) && n > 0);
    if (!cps.length) return '';
    if (cps.length === 1 && cps[0] < 0x1f000) cps.push(0xfe0f);
    try {
      return String.fromCodePoint(...cps);
    } catch (e) {
      return '';
    }
  };

  const hueOf = (id) => {
    let x = 7;
    for (const ch of String(id || '')) x = (x * 31 + ch.codePointAt(0)) % 3600;
    return Math.round(x / 10);
  };

  const PIC_SIZES = { xs: 'xs', s: 's', sm: 's', small: 's', m: 'm', md: 'm', l: 'l', lg: 'l', large: 'l', game: 'game',
    fill: 'fill', auto: 'fill' };

  // size: 'xs' | 's' | 'm' | 'l' | 'game' (сжимается при открытой клавиатуре) | 'fill' (по контейнеру) | число px
  const picture = (word, { size = 'm', letter = false, lazy = false, label = null } = {}) => {
    const w = word || {};
    const ru = String(w.ru || w.en || '');
    const alt = label == null ? ru : label;
    const named = typeof size === 'number' ? null : PIC_SIZES[size] || 'm';
    const box = h('span', {
      class: ['ws-pic', named && `ws-pic--${named}`],
      style: typeof size === 'number' ? `--pic: ${Math.max(16, size)}px` : null,
    });
    const tile = () => {
      const text = letter ? ru.charAt(0).toUpperCase() : ru;
      return h('span', {
        class: ['ws-pic__tile', letter && 'is-letter', !letter && text.length > 9 && 'is-long'],
        style: `--hue: ${hueOf(w.id || ru)}`, role: 'img', 'aria-label': alt || null,
      }, h('span', { class: 'ws-pic__word', text }));
    };
    const system = () => {
      const ch = emojiChar(w.emoji);
      return ch ? h('span', { class: 'ws-pic__emoji', role: 'img', 'aria-label': alt || null, text: ch }) : tile();
    };
    if (w.emoji) {
      const img = h('img', {
        class: 'ws-pic__img', src: `img/emoji/${w.emoji}.webp`, width: 160, height: 160, alt,
        decoding: 'async', loading: lazy ? 'lazy' : null, draggable: 'false',
      });
      img.addEventListener('error', () => img.replaceWith(system()), { once: true });
      box.append(img);
    } else {
      box.append(tile());
    }
    return box;
  };

  // Эмодзи интерфейса (значок игры, главы): файл → системный символ.
  const emoji = (code, { size = 32, label = '' } = {}) => {
    const box = h('span', { class: 'ws-emoji', style: `--size: ${size}px`, role: label ? 'img' : null,
      'aria-label': label || null, 'aria-hidden': label ? null : 'true' });
    if (!code) return box;
    const img = h('img', { src: `img/emoji/${code}.webp`, width: 160, height: 160, alt: '', decoding: 'async',
      draggable: 'false' });
    img.addEventListener('error', () => img.replaceWith(h('span', { class: 'ws-emoji__char', text: emojiChar(code) })),
      { once: true });
    box.append(img);
    return box;
  };

  /* ---------- Текст задания ---------- */
  const hint = (ru, { className = '' } = {}) => {
    const p = h('p', { class: ['ws-hint', className], text: ru == null ? '' : ru });
    if (settings().translate === false) p.hidden = true;
    return p;
  };

  // tokens — из WS.data.sentence(...).tokens; подряд идущие gap-токены (ответ из двух слов) — один пропуск.
  const sentence = (tokens, { gapNode = null, bold = false, className = '' } = {}) => {
    const p = h('p', { class: ['ws-sentence', className] });
    const list = typeof tokens === 'string' ? [{ t: tokens, kind: 'word' }] : Array.from(tokens || []);
    let run = null;
    list.forEach((tok, i) => {
      const t = String(tok && tok.t != null ? tok.t : '');
      const nextGap = list.slice(i + 1).find((x) => x && x.kind !== 'space');
      const inRun = !!(tok && tok.gap) || (run && tok && tok.kind === 'space' && nextGap && nextGap.gap);
      if (inRun && (gapNode || bold)) {
        if (!run) {
          if (gapNode) {
            if (gapNode.classList && gapNode.classList.contains('ws-letters')) gapNode.classList.add('ws-letters--inline');
            run = h('span', { class: 'ws-sentence__gap' }, gapNode);
          } else {
            run = h('b', { class: 'ws-sentence__em' });
          }
          p.append(run);
        }
        if (!gapNode) run.append(t);
        return;
      }
      run = null;
      p.append(t);
    });
    return p;
  };

  /* ---------- Сетка вариантов ---------- */
  // items: [{ id, node?, text?, word? }] → кнопки [data-ws=choice][data-word-id]; клавиши 1–9 на компьютере.
  const choiceGrid = ({ items = [], columns = 2, onPick = null, keys = true, signal = null, className = '' } = {}) => {
    let locked = false;
    const grid = h('div', { class: ['ws-choices', className], style: `--cols: ${columns}`, role: 'group' });
    const buttons = items.map((it, i) => {
      const media = it.node || (it.word ? picture(it.word, { size: 'fill' }) : null);
      const b = h('button', { type: 'button', class: 'ws-choice', data: { ws: 'choice', wordId: it.id } },
        keys && i < 9 ? h('span', { class: 'ws-choice__key', 'aria-hidden': 'true', text: i + 1 }) : null,
        media ? h('span', { class: 'ws-choice__media' }, media) : null,
        it.text != null && it.text !== '' ? h('span', { class: 'ws-choice__text', text: it.text }) : null);
      b.addEventListener('click', () => {
        if (locked || b.getAttribute('aria-disabled') === 'true') return;
        if (onPick) onPick(it.id, b);
      }, listen(signal));
      if (keys && i < 9) shortcut(String(i + 1), b, null, { signal });
      grid.append(b);
      return b;
    });
    const find = (id) => buttons.find((b) => b.dataset.wordId === String(id)) || null;
    return {
      el: grid,
      buttons,
      get: find,
      mark(id, kind) {
        const b = find(id);
        if (!b) return null;
        if (kind === 'ok' || kind === 'bad') feedback(b, kind);
        else if (kind === 'picked') b.classList.add('is-picked');
        else b.classList.remove('is-ok', 'is-bad', 'is-picked', 'ws-fb--ok', 'ws-fb--bad');
        return b;
      },
      lock() {
        locked = true;
        grid.classList.add('is-locked');
        buttons.forEach((b) => b.setAttribute('aria-disabled', 'true'));
      },
      unlock() {
        locked = false;
        grid.classList.remove('is-locked');
        buttons.forEach((b) => b.removeAttribute('aria-disabled'));
      },
      get locked() {
        return locked;
      },
    };
  };

  /* ---------- Прогресс, звёзды, значки ---------- */
  const progressBar = (a = {}, b = null) => {
    const o = typeof a === 'number' ? { value: a, max: b == null ? 1 : b } : a || {};
    const fill = h('span', { class: 'ws-progress__fill' });
    const bar = h('div', {
      class: ['ws-progress', o.size && `ws-progress--${o.size}`, o.kind && `ws-progress--${o.kind}`, o.className],
      role: 'progressbar', 'aria-valuemin': 0, 'aria-label': o.label || null,
    }, fill);
    let max = 1;
    const set = (value, total = max) => {
      max = Math.max(0, Number(total) || 0);
      const v = Math.max(0, Math.min(max, Number(value) || 0));
      fill.style.width = `${max ? (100 * v) / max : 0}%`;
      bar.setAttribute('aria-valuemax', String(max));
      bar.setAttribute('aria-valuenow', String(v));
    };
    set(o.value || 0, o.max == null ? 1 : o.max);
    return { el: bar, set };
  };

  const stars = (n = 0, { size = '', max = 3 } = {}) => {
    const k = Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
    const wrap = h('span', { class: ['ws-stars', size && `ws-stars--${size}`], role: 'img',
      'aria-label': `Звёзды: ${k} из ${max}` });
    for (let i = 0; i < max; i++) wrap.append(icon('star', { className: ['ws-star', i < k && 'is-on'] }));
    return wrap;
  };

  const badge = (text, { kind = '' } = {}) => h('span', { class: ['ws-badge', kind && `ws-badge--${kind}`], text });

  const chip = ({ text = '', icon: iconName = '', kind = '', onClick = null, pressed = null, ws = null, signal = null } = {}) => {
    const tag = onClick || pressed != null ? 'button' : 'span';
    const c = h(tag, {
      type: tag === 'button' ? 'button' : null,
      class: ['ws-chip', kind && `ws-chip--${kind}`],
      data: ws ? { ws } : null,
      'aria-pressed': pressed == null ? null : String(!!pressed),
    }, iconName ? icon(iconName) : null, text !== '' ? h('span', { text }) : null);
    if (onClick) c.addEventListener('click', onClick, listen(signal));
    return c;
  };

  /* ---------- Карточка, ряд кнопок, раскладка игры ---------- */
  // card(...детей) или card({ title, text, kind, tag, ws, onClick, className }, ...детей)
  const card = (...args) => {
    const o = args.length && isPlain(args[0]) ? args.shift() : {};
    const { tag = 'div', title = '', text = '', kind = '', ws = null, onClick = null, className = '', href = '' } = o;
    const c = h(href ? 'a' : tag, {
      class: ['ws-card', kind && `ws-card--${kind}`, (onClick || href) && 'ws-card--link', className],
      href: href || null, data: ws ? { ws } : null,
      type: !href && tag === 'button' ? 'button' : null,
    },
    title ? h('h3', { class: 'ws-card__title', text: title }) : null,
    text ? h('p', { class: 'ws-card__text', text }) : null,
    args);
    if (onClick) c.addEventListener('click', onClick);
    return c;
  };

  const actions = (...nodes) => h('div', { class: 'ws-actions' }, nodes);
  const spacer = () => h('span', { class: 'ws-actions__spacer', 'aria-hidden': 'true' });

  // Колонка игры: картинка → задание → ответ → ряд кнопок. Возвращает { el, media, prompt, answer, actions }.
  const stage = ({ media = null, prompt = null, answer = null, actions: acts = null, className = '' } = {}) => {
    const part = (name, kids) => h('div', { class: `ws-stage__${name}` }, kids);
    const s = {
      media: part('media', media),
      prompt: part('prompt', prompt),
      answer: part('answer', answer),
      actions: h('div', { class: 'ws-stage__actions ws-actions' }, acts),
    };
    s.el = h('div', { class: ['ws-stage', className] }, s.media, s.prompt, s.answer, s.actions);
    return s;
  };

  const empty = ({ emoji: code = '', icon: iconName = '', title = '', text = '', action = null } = {}) => h('div',
    { class: 'ws-empty' },
    code ? emoji(code, { size: 72 }) : iconName ? icon(iconName, { className: 'ws-empty__icon' }) : null,
    title ? h('h2', { class: 'ws-empty__title', text: title }) : null,
    text ? h('p', { class: 'ws-empty__text', text }) : null,
    action);

  /* ---------- Переключатель из двух-трёх вариантов ---------- */
  // segmented({ options: [{ value, text, icon? }], value, onChange, ws, attr }) → { el, set(value), value }
  // ws/attr дают кнопкам data-ws и data-<attr>=<value> (например, ws: 'level', attr: 'level').
  const segmented = ({ options = [], value = null, onChange = null, ws = null, attr = null, label = '', className = '',
    signal = null } = {}) => {
    const opts = options.map((o) => (isPlain(o) ? o : { value: o, text: String(o) }));
    let cur = value == null && opts.length ? opts[0].value : value;
    const wrap = h('div', { class: ['ws-seg', className], role: 'radiogroup', 'aria-label': label || null });
    const set = (v) => {
      cur = v;
      btns.forEach((b, i) => {
        const on = opts[i].value === v;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        b.classList.toggle('is-on', on);
      });
    };
    const choose = (v) => {
      if (v === cur) return;
      set(v);
      if (onChange) onChange(v);
    };
    const btns = opts.map((o, i) => {
      const data = {};
      if (ws) data.ws = ws;
      if (attr) data[attr] = o.value;
      const b = h('button', { type: 'button', class: 'ws-seg__opt', role: 'radio', data },
        o.icon ? icon(o.icon) : null, h('span', { text: o.text == null ? o.value : o.text }));
      b.addEventListener('click', () => choose(o.value), listen(signal));
      b.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const j = (i + step + opts.length) % opts.length;
        choose(opts[j].value);
        btns[j].focus();
      }, listen(signal));
      return b;
    });
    wrap.append(...btns);
    set(cur);
    return {
      el: wrap,
      set,
      get value() {
        return cur;
      },
    };
  };

  /* ---------- Окно ---------- */
  // modal({ title, text, body, actions: [узел | { text, kind, value, ws }], dismissible }) → { el, close(value), result }
  let modalSeq = 0;
  const modal = ({ title = '', text = '', body = null, actions: acts = [], dismissible = true, onClose = null,
    className = '' } = {}) => {
    const id = `ws-modal-${++modalSeq}`;
    const before = document.activeElement;
    let done = false;
    let resolve = null;
    const result = new Promise((r) => {
      resolve = r;
    });
    const close = (value = null) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (before && before.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true });
      if (onClose) onClose(value);
      resolve(value);
    };
    const btns = (acts || []).map((a) => (a instanceof Node ? a : button({
      text: a.text, kind: a.kind || 'secondary', ws: a.ws || null, icon: a.icon || '',
      onClick: () => close(a.value !== undefined ? a.value : a.text),
    })));
    const box = h('div', {
      class: 'ws-modal__box', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title ? `${id}-title` : null,
      tabindex: '-1',
    },
    dismissible ? iconButton({ icon: 'close', label: 'Закрыть', kind: 'plain', className: 'ws-modal__close',
      keepFocus: false, onClick: () => close(null) }) : null,
    title ? h('h2', { class: 'ws-modal__title', id: `${id}-title`, text: title }) : null,
    text ? h('p', { class: 'ws-modal__text', text }) : null,
    body,
    btns.length ? h('div', { class: 'ws-modal__actions' }, btns) : null);
    const overlay = h('div', { class: ['ws-modal', className] }, box);
    overlay.addEventListener('click', (e) => {
      if (dismissible && e.target === overlay) close(null);
    });
    const onKey = (e) => {
      if (e.key === 'Escape' && dismissible) {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Tab') {
        const list = Array.from(box.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
          .filter((n) => !n.disabled && n.getClientRects().length);
        if (!list.length) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    (document.querySelector('.ws-app') || document.body).append(overlay);
    const target = btns.find((b) => b.classList && b.classList.contains('ws-btn--primary')) || btns[0] || box;
    target.focus({ preventScroll: true });
    return { el: overlay, box, close, result };
  };

  /* ---------- Вспышка «верно / ошибка» ---------- */
  // Только вид (класс + короткая анимация); звук игра играет сама через ctx.sfx.
  const feedback = (node, kind) => {
    if (!node || !node.classList) return node;
    node.classList.remove('is-ok', 'is-bad', 'ws-fb--ok', 'ws-fb--bad');
    if (kind !== 'ok' && kind !== 'bad') return node;
    void node.offsetWidth; // перезапуск анимации
    node.classList.add(kind === 'ok' ? 'is-ok' : 'is-bad', kind === 'ok' ? 'ws-fb--ok' : 'ws-fb--bad');
    return node;
  };

  /* ---------- Тайминги ---------- */
  const TIMING = Object.freeze({ ok: 700, bad: 1400, flash: 300, pair: 450, step: 350 });
  const ZERO = Object.freeze({ ok: 0, bad: 0, flash: 0, pair: 0, step: 0 });

  Object.assign(ui, {
    button, iconButton, speakerButton, eyeButton, nextButton, picture, emoji, hint, sentence, choiceGrid,
    progressBar, stars, badge, chip, card, actions, spacer, stage, empty, segmented, modal, feedback, icon,
    shortcut, keepFocus, isTouch,
  });
  Object.defineProperty(ui, 'timing', {
    enumerable: true,
    configurable: true,
    get: () => ({ ...(reducedMotion() ? ZERO : TIMING) }),
  });
})();

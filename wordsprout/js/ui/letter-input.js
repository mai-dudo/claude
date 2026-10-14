/* Ввод по буквам в клеточках WS.ui.letterInput (CONTRACTS §3.3). Слово или предложение рисуется
   клеточками: слова не рвутся между строками, пробел — промежуток, знаки, цифры, апостроф и дефис
   стоят заранее. Строгий режим: принимается только следующая верная буква, неверная — красная
   вспышка, счётчик ошибок и тихий звук; кириллица — ещё и подсказка «Включи английскую раскладку».
   Поверх клеток лежит одно настоящее невидимое поле: нажатие на клетки открывает клавиатуру телефона,
   setTarget() переиспользует поле, поэтому клавиатура не закрывается между словами.
   Алгоритм для клавиатур телефонов:
   1) beforeinput insertText вне композиции — отменяем и скармливаем e.data по буквам; удаление — отменяем;
   2) остальные типы ввода не трогаем: в input во время композиции берём только новые символы
      с её начала (укорачивание пропускаем), вне композиции — всё значение поля и очищаем его;
   3) compositionend — дописываем остаток и очищаем поле на следующем такте (во время композиции
      значение поля не пишем никогда). Если клавиатура заменила слово (автоисправление),
      сверяемся с уже принятыми буквами и берём только новый хвост.
   На компьютере печатать можно где угодно на странице. Встроенная клавиатура WordSprout
   (keyboard: 'builtin') — inputmode="none" и WS.ui.keypad под клетками.

   WS.ui.letterInput({ target, fixed, signal, keyboard, prefix: 'to' | null, size: 'word' | 'sentence',
     onLetter(i, ok, ch), onComplete({ mistakes, hinted }), hints, autofocus: 'auto' | true | false })
   → { el, input, focus(), setTarget(str, { prefix }), reveal(on), revealed, fillAll({ complete }),
       destroy(), mistakes, hinted, done, type(text) }
   hints по умолчанию — настройка «бледные подсказки-буквы» (буквы видны сразу, помощью не считаются). */
(() => {
  'use strict';

  const ui = WS.ui;

  const append = (node, kids) => {
    for (const kid of kids) {
      if (kid == null || kid === false || kid === true) continue;
      if (Array.isArray(kid)) append(node, kid);
      else if (kid instanceof Node) node.append(kid);
      else node.append(document.createTextNode(String(kid)));
    }
  };

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
        else node.setAttribute(key, value === true ? '' : String(value));
      }
    }
    append(node, kids);
    return node;
  };

  const icon = (name) => {
    const span = h('span', { class: 'ws-icon', 'aria-hidden': 'true' });
    span.innerHTML = (ui.icons || {})[name] || '';
    return span;
  };

  const norm = (s) => (WS.util && WS.util.norm ? WS.util.norm(s)
    : String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/[‘’ʼ]/g, '\''));

  const CYRILLIC = /[Ѐ-ӿ]/;
  const PUNCT = /^[^\p{L}\p{N}]$/u;
  const SPACE = /\s/;
  const FLASH_MS = 300;
  const CYR_TOAST_GAP = 30000;
  const TIP_KEY = 'wordsprout.v1.tips';
  const TIP_MS = 12000;
  const ECHO_MS = 2000; // повтор только что набранного слова клавиатурой ждём не дольше 2 с

  const media = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const isTouch = () => (typeof ui.isTouch === 'function' ? ui.isTouch()
    : media('(pointer: coarse)') || (navigator.maxTouchPoints || 0) > 0);
  const settings = () => {
    try {
      return (WS.settings && typeof WS.settings.get === 'function' && WS.settings.get()) || {};
    } catch (e) {
      return {};
    }
  };
  const sfx = (name) => {
    if (WS.sfx && typeof WS.sfx[name] === 'function') WS.sfx[name]();
  };
  const toast = (msg) => {
    if (WS.shell && typeof WS.shell.toast === 'function') WS.shell.toast(msg);
  };
  const isField = (t) => !!t && t.nodeType === 1
    && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
  const commonPrefix = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  };

  /* ---------- Общее для всех полей на странице ---------- */
  let lastCyrToast = -Infinity; // «Включи английскую раскладку» — не чаще раза в 30 с
  let tipDone = false; // совет про встроенную клавиатуру — один раз
  const live = []; // живые поля; печать «где угодно» получает последнее использованное
  let lastUsed = null;

  const pickActive = () => {
    if (lastUsed && live.includes(lastUsed) && lastUsed.ready()) return lastUsed;
    for (let i = live.length - 1; i >= 0; i--) if (live[i].ready()) return live[i];
    return null;
  };

  // Компьютер: буква, нажатая вне полей ввода, идёт в клеточки, а фокус переходит в поле.
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (typeof e.key !== 'string' || [...e.key].length !== 1 || !/\p{L}/u.test(e.key)) return;
    if (isField(e.target)) return;
    if (document.querySelector('[aria-modal="true"]')) return;
    const inst = pickActive();
    if (!inst) return;
    e.preventDefault();
    inst.typeKey(e.key);
  });

  const letterInput = (opts = {}) => {
    const o = opts || {};
    const isFixed = typeof o.fixed === 'function' ? o.fixed : (ch) => !/[a-z]/i.test(ch);
    const size = o.size === 'sentence' ? 'sentence' : 'word';
    const hintsOn = () => (o.hints != null ? !!o.hints : settings().hints === true);
    const ac = new AbortController();
    const sig = ac.signal;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
      return id;
    };
    const cancel = (id) => {
      clearTimeout(id);
      timers.delete(id);
    };

    /* ---------- Разметка ---------- */
    const cellsEl = h('div', { class: 'ws-letters__cells', 'aria-hidden': 'true' });
    const tapEl = h('span', { class: 'ws-letters__tap', 'aria-hidden': 'true' }, icon('keyboard'),
      h('span', { text: 'Нажми, чтобы печатать' }));
    const input = h('input', {
      type: 'text', inputmode: 'text', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'none',
      spellcheck: 'false', enterkeyhint: 'done', class: 'ws-letters__input', 'aria-label': 'Печатай по-английски',
      data: { ws: 'letters-input' },
    });
    const status = h('span', { class: 'ws-sr-only', 'aria-live': 'polite' });
    const field = h('div', { class: 'ws-letters__field' }, cellsEl, tapEl, input, status);
    const el = h('div', { class: ['ws-letters', `ws-letters--${size}`], data: { size } }, field);

    /* ---------- Состояние ---------- */
    let target = '';
    let chars = []; // { ch, n, space, fixed, cell }
    let pos = 0;
    let done = false;
    let mistakes = 0;
    let hinted = false;
    let revealed = false;
    let prefix = o.prefix || null;
    let builtin = false;
    let keypad = null;
    let tip = null;
    let destroyed = false;
    // композиция
    let composing = false;
    let comp = null; // { base, seen, acc }: начало в поле, обработанный текст, принятые из него буквы
    let stale = ''; // текст, уже разобранный в compositionend, пока поле не очищено
    let lastOkAt = -Infinity; // время последней принятой буквы
    let echoPos = -1; // позиция, где повтор предыдущего слова уже пропускали (второй раз — печатаем)
    let clearTimer = 0;
    const flashTimers = new Map();

    const skipFixed = () => {
      while (pos < chars.length && (chars[pos].space || chars[pos].fixed)) pos++;
    };

    // Длинное предложение на телефоне: текущая клетка не должна уйти под клавиатуру или за край.
    const keepVisible = (cell) => {
      if (!cell || document.activeElement !== input) return;
      const vv = window.visualViewport;
      const top = vv ? vv.offsetTop : 0;
      const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const r = cell.getBoundingClientRect();
      if (r.bottom > bottom - 8 || r.top < top) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    const markCur = () => {
      chars.forEach((c, i) => {
        if (c.cell) c.cell.classList.toggle('is-cur', !done && i === pos);
      });
      if (!done && chars[pos]) keepVisible(chars[pos].cell);
    };

    const clearFlash = (cell) => {
      cancel(flashTimers.get(cell));
      flashTimers.delete(cell);
      cell.classList.remove('is-bad');
      delete cell.dataset.bad;
    };

    const complete = () => {
      if (done) return;
      done = true;
      markCur();
      el.classList.add('is-done');
      status.textContent = 'Готово';
      if (typeof o.onComplete === 'function') o.onComplete({ mistakes, hinted });
    };

    const accept = (raw) => {
      const c = chars[pos];
      const i = pos;
      clearFlash(c.cell);
      c.cell.textContent = c.ch;
      c.cell.classList.remove('is-hint', 'is-cur');
      c.cell.classList.add('is-ok');
      pos++;
      skipFixed();
      lastOkAt = Date.now();
      sfx('key');
      if (typeof o.onLetter === 'function') o.onLetter(i, true, raw);
      if (pos >= chars.length) complete();
      else markCur();
    };

    const reject = (raw, cyrillic) => {
      const c = chars[pos];
      mistakes++;
      if (c && c.cell) {
        const cell = c.cell;
        clearFlash(cell);
        cell.dataset.bad = raw;
        void cell.offsetWidth; // перезапуск анимации
        cell.classList.add('is-bad');
        flashTimers.set(cell, later(() => {
          flashTimers.delete(cell);
          cell.classList.remove('is-bad');
          delete cell.dataset.bad;
        }, FLASH_MS));
      }
      sfx('miss');
      if (cyrillic) {
        const now = Date.now();
        if (now - lastCyrToast >= CYR_TOAST_GAP) {
          lastCyrToast = now;
          toast('Включи английскую раскладку');
        }
      }
      if (typeof o.onLetter === 'function') o.onLetter(pos, false, raw);
    };

    // Одна буква → 'ok' | 'bad' | 'skip'
    const feedOne = (raw) => {
      if (done || destroyed || pos >= chars.length) return 'skip';
      const ch = norm(raw);
      if (!ch || SPACE.test(ch)) return 'skip';
      if (CYRILLIC.test(ch)) {
        reject(raw, true);
        return 'bad';
      }
      if (isFixed(ch)) return 'skip';
      if (ch === chars[pos].n) {
        accept(raw);
        return 'ok';
      }
      reject(raw, false);
      return 'bad';
    };

    const lettersOf = (s) => [...s].filter((ch) => !SPACE.test(ch) && !isFixed(ch)).join('');

    // Набранная часть текущего слова и предыдущее слово (нормализованные)
    const wordBounds = () => {
      let s = pos;
      while (s > 0 && !chars[s - 1].space) s--;
      let p = s - 1;
      while (p >= 0 && chars[p].space) p--;
      let ps = p;
      while (ps > 0 && !chars[ps - 1].space) ps--;
      return {
        typed: chars.slice(s, pos).map((c) => c.n).join(''),
        prev: p >= 0 ? chars.slice(ps, p + 1).map((c) => c.n).join('') : '',
      };
    };

    // Кусок текста (вставка, слово целиком, замена): если он повторяет уже набранное начало слова
    // (клавиатура заменила слово целиком), берём только хвост. Если сразу после слова (до 2 с)
    // клавиатура присылает это же слово ещё раз (замена уже отправленного слова), пропускаем его —
    // но только один раз на позицию, чтобы настоящий повтор («had had») можно было напечатать.
    const feedChunk = (text) => {
      if (!text || done || destroyed) return;
      const chunk = [...norm(text)];
      let start = 0;
      if (chunk.length > 1) {
        const { typed, prev } = wordBounds();
        const typedL = lettersOf(typed);
        const chunkL = lettersOf(chunk.join(''));
        if (typedL && chunkL.length > typedL.length && chunkL.startsWith(typedL)) {
          let count = 0;
          while (start < chunk.length && count < typedL.length) {
            if (!SPACE.test(chunk[start]) && !isFixed(chunk[start])) count++;
            start++;
          }
        } else if (!typedL && chunkL && chunkL === lettersOf(prev) && echoPos !== pos
          && Date.now() - lastOkAt < ECHO_MS) {
          echoPos = pos;
          return;
        }
      }
      for (const ch of chunk.slice(start)) feedOne(ch);
    };

    /* ---------- События поля ---------- */
    const compText = () => input.value.slice(comp ? comp.base : 0);

    const processComp = (text) => {
      const t = norm(text);
      const seen = comp.seen;
      let from;
      if (t.startsWith(seen)) from = seen.length;
      else if (seen.startsWith(t)) return; // стёрли букву в композиции — строгий режим это пропускает
      else if (comp.acc && t.startsWith(comp.acc)) from = comp.acc.length; // слово заменено (автоисправление)
      else from = commonPrefix(t, seen);
      comp.seen = t;
      for (const ch of [...t.slice(from)]) {
        if (feedOne(ch) === 'ok') comp.acc += ch;
      }
    };

    const beginComp = () => {
      composing = true;
      cancel(clearTimer);
      comp = { base: input.value.length, seen: '', acc: '' };
    };

    input.addEventListener('compositionstart', () => {
      beginComp();
      showTip();
    }, { signal: sig });

    input.addEventListener('compositionend', (e) => {
      if (!comp) beginComp();
      const text = typeof e.data === 'string' && e.data !== '' ? e.data : compText();
      processComp(text);
      composing = false;
      comp = null;
      stale = input.value;
      cancel(clearTimer);
      clearTimer = later(() => {
        if (composing) return;
        input.value = '';
        stale = '';
      }, 0);
    }, { signal: sig });

    input.addEventListener('beforeinput', (e) => {
      if (composing || e.isComposing) return;
      const type = e.inputType || '';
      if (type === 'insertText') {
        if (!e.cancelable) return; // тогда текст придёт в input и будет разобран там
        e.preventDefault();
        feedChunk(e.data || '');
      } else if (type.startsWith('delete') && e.cancelable) {
        e.preventDefault();
      }
    }, { signal: sig });

    input.addEventListener('input', (e) => {
      if (composing || e.isComposing) {
        if (!composing) {
          // compositionstart пропущен (поле получило фокус посреди композиции): начало — по e.data
          beginComp();
          if (typeof e.data === 'string') comp.base = Math.max(0, input.value.length - e.data.length);
        }
        processComp(compText());
        return;
      }
      const type = e.inputType || '';
      let v = input.value;
      if (stale && v.startsWith(stale)) v = v.slice(stale.length);
      stale = '';
      input.value = '';
      if (type === 'insertCompositionText' || type === 'insertFromComposition') return; // уже разобрано
      feedChunk(v);
    }, { signal: sig });

    input.addEventListener('focus', () => {
      el.classList.add('is-focused');
      lastUsed = api;
    }, { signal: sig });

    input.addEventListener('blur', () => el.classList.remove('is-focused'), { signal: sig });
    field.addEventListener('pointerdown', () => {
      lastUsed = api;
    }, { signal: sig });

    /* ---------- Совет про встроенную клавиатуру (один раз) ---------- */
    const tipSeen = () => {
      try {
        const v = WS.store && WS.store.get(TIP_KEY, null);
        return !!(v && v.keypad);
      } catch (e) {
        return false;
      }
    };

    const rememberTip = () => {
      try {
        if (!WS.store) return;
        const v = WS.store.get(TIP_KEY, null);
        WS.store.set(TIP_KEY, { ...(v && typeof v === 'object' ? v : {}), keypad: true });
      } catch (e) { /* без хранилища совет просто покажется ещё раз */ }
    };

    const hideTip = () => {
      if (tip) tip.remove();
      tip = null;
    };

    const showTip = () => {
      if (tipDone || builtin || destroyed || !isTouch()) return;
      tipDone = true;
      if (tipSeen()) return;
      rememberTip();
      const on = ui.button ? ui.button({
        text: 'Включить', kind: 'secondary', size: 'sm', keepFocus: true, ws: 'keypad-on',
        onClick: () => {
          hideTip();
          if (WS.settings && typeof WS.settings.set === 'function') WS.settings.set({ keyboard: 'builtin' });
          applyKeyboard('builtin');
        },
      }) : null;
      const close = ui.iconButton ? ui.iconButton({ icon: 'close', label: 'Закрыть совет', kind: 'plain', size: 's',
        onClick: hideTip }) : null;
      tip = h('div', { class: 'ws-letters__tip', role: 'note' },
        h('span', { class: 'ws-letters__tip-text', text: 'Если буквы печатаются странно, включи клавиатуру WordSprout.' }),
        on, close);
      el.append(tip);
      later(hideTip, TIP_MS);
    };

    /* ---------- Встроенная клавиатура ---------- */
    const applyKeyboard = (kind) => {
      const want = kind === 'builtin';
      if (want === builtin && (keypad || !want)) return;
      builtin = want;
      const wasFocused = document.activeElement === input;
      input.setAttribute('inputmode', builtin ? 'none' : 'text');
      el.classList.toggle('is-builtin', builtin);
      if (builtin && !keypad && typeof ui.keypad === 'function') {
        keypad = ui.keypad({
          signal: sig,
          onKey: (key) => {
            lastUsed = api;
            const r = feedOne(key);
            if (keypad && keypad.flash && r !== 'skip') keypad.flash(key, r === 'ok');
          },
        });
        el.append(keypad.el);
      }
      if (keypad) keypad.el.hidden = !builtin;
      tapEl.hidden = builtin || !isTouch();
      if (builtin) hideTip();
      if (wasFocused) {
        // смена inputmode у поля в фокусе: переоткрываем фокус, чтобы клавиатура телефона спряталась / появилась
        input.blur();
        input.focus({ preventScroll: true });
      }
    };

    /* ---------- Слово или предложение ---------- */
    const setTarget = (str, opt = {}) => {
      target = String(str == null ? '' : str);
      prefix = opt && opt.prefix !== undefined ? opt.prefix : o.prefix || null;
      flashTimers.forEach((id) => cancel(id));
      flashTimers.clear();
      pos = 0;
      done = false;
      mistakes = 0;
      hinted = false;
      revealed = false;
      echoPos = -1;
      status.textContent = '';
      el.classList.remove('is-done', 'is-given');
      chars = [];
      const groups = [];
      let group = null;
      let len = 0;
      let longest = 1;
      let k = 0;
      [...target].forEach((ch, i) => {
        if (SPACE.test(ch)) {
          chars.push({ ch, n: ' ', space: true, fixed: true, cell: null });
          group = null;
          return;
        }
        if (!group) {
          group = h('span', { class: 'ws-group' });
          groups.push(group);
          len = groups.length === 1 && prefix ? 2 : 0;
        }
        const fixed = !!isFixed(ch);
        const cell = h('span', {
          class: ['ws-cell', fixed && 'is-fixed', fixed && PUNCT.test(ch) && 'is-punct'],
          data: { i }, style: fixed ? null : `--k: ${k++}`,
        }, fixed ? ch : null);
        chars.push({ ch, n: norm(ch), space: false, fixed, cell });
        group.append(cell);
        len++;
        longest = Math.max(longest, len);
      });
      if (prefix) {
        const label = h('span', { class: 'ws-letters__prefix', text: prefix });
        if (groups.length) groups[0].prepend(label);
        else groups.push(label);
      }
      el.style.setProperty('--n', String(longest));
      el.classList.toggle('is-long', [...target].length > 40);
      cellsEl.replaceChildren(...groups);
      skipFixed();
      markCur();
      // Настройка «бледные подсказки-буквы в начале»: буквы видны сразу и помощью не считаются.
      if (hintsOn()) reveal(true, { count: false });
      if (pos >= chars.length) queueMicrotask(() => {
        if (!destroyed && !done && pos >= chars.length) complete();
      });
    };

    const reveal = (on = true, { count = true } = {}) => {
      revealed = !!on;
      if (revealed && count) hinted = true;
      chars.forEach((c, i) => {
        if (!c.cell || c.fixed || i < pos) return;
        if (c.cell.classList.contains('is-ok') || c.cell.classList.contains('is-given')) return;
        c.cell.classList.toggle('is-hint', revealed);
        c.cell.textContent = revealed ? c.ch : '';
      });
    };

    // Показать весь ответ (например, после «не знаю»). Дальше поле ввод не принимает.
    const fillAll = ({ complete: fire = false } = {}) => {
      if (done) return;
      hinted = true;
      chars.forEach((c, i) => {
        if (!c.cell || c.fixed || i < pos) return;
        clearFlash(c.cell);
        c.cell.textContent = c.ch;
        c.cell.classList.remove('is-hint', 'is-cur');
        c.cell.classList.add('is-given');
      });
      pos = chars.length;
      done = true;
      markCur();
      el.classList.add('is-given');
      if (fire && typeof o.onComplete === 'function') o.onComplete({ mistakes, hinted, given: true });
    };

    const focus = () => {
      if (destroyed) return;
      lastUsed = api;
      try {
        input.focus({ preventScroll: true });
      } catch (e) {
        input.focus();
      }
    };

    let offSettings = null;

    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      ac.abort();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      if (typeof offSettings === 'function') offSettings();
      const i = live.indexOf(api);
      if (i >= 0) live.splice(i, 1);
      if (lastUsed === api) lastUsed = null;
      el.remove();
    };

    const api = {
      el,
      input,
      focus,
      blur: () => input.blur(),
      setTarget,
      reveal,
      fillAll,
      destroy,
      type: (text) => feedChunk(String(text == null ? '' : text)),
      get revealed() {
        return revealed;
      },
      get mistakes() {
        return mistakes;
      },
      get hinted() {
        return hinted;
      },
      get done() {
        return done;
      },
      get target() {
        return target;
      },
      get position() {
        return pos;
      },
      get keyboard() {
        return builtin ? 'builtin' : 'system';
      },
      // для печати «где угодно» на компьютере
      ready: () => !destroyed && !done && el.isConnected && el.getClientRects().length > 0,
      typeKey: (key) => {
        feedChunk(key);
        if (!isTouch()) focus();
      },
    };

    live.push(api);
    applyKeyboard(o.keyboard || settings().keyboard || 'system');
    tapEl.hidden = builtin || !isTouch();
    if (WS.settings && typeof WS.settings.on === 'function') {
      offSettings = WS.settings.on((s) => {
        const kb = s && s.keyboard;
        if (kb === 'builtin' || kb === 'system') applyKeyboard(kb);
      });
    }
    if (o.signal) {
      if (o.signal.aborted) destroy();
      else o.signal.addEventListener('abort', destroy, { once: true });
    }
    if (o.target != null) setTarget(o.target);

    // Фокус сам. На компьютере — всегда (если не занято другое поле ввода). На телефоне — только сразу
    // после нажатия («Начать», «Дальше»): тогда клавиатура открывается в том же касании; при autofocus
    // 'auto' (по умолчанию) ещё и только внутри игры. Без нажатия на телефоне фокус не ставим никогда.
    const autofocus = o.autofocus === undefined ? 'auto' : o.autofocus;
    if (autofocus) {
      requestAnimationFrame(() => {
        if (destroyed || !el.isConnected || !el.getClientRects().length) return;
        if (isTouch()) {
          const act = navigator.userActivation;
          if (!act || !act.isActive) return;
          if (autofocus !== true && !el.closest('[data-ws=game]')) return;
        }
        const a = document.activeElement;
        if (a && isField(a) && !el.contains(a)) return;
        focus();
      });
    }
    return api;
  };

  ui.letterInput = letterInput;
})();

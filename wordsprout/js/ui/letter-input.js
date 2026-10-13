/* Заглушка: ввод по буквам в клеточках (WS.ui.letterInput). Упрощённо: строгий режим, невидимое поле
   поверх клеток, каждая введённая буква сверяется со следующей клеткой. Полный алгоритм для телефонных
   клавиатур (beforeinput, composition) напишет владелец файла. */
(() => {
  'use strict';

  WS.ui.letterInput = (opts = {}) => {
    const { el, norm } = WS.util;
    const fixed = opts.fixed || ((ch) => !/[a-z]/i.test(ch));
    const wrap = el('div', { class: 'ws-letters', style: { position: 'relative' } });
    const builtin = opts.keyboard === 'builtin';
    const input = el('input', {
      type: 'text', inputmode: builtin ? 'none' : 'text', autocomplete: 'off', autocorrect: 'off',
      autocapitalize: 'none', spellcheck: false, enterkeyhint: 'done', 'aria-label': 'Введи слово по буквам',
      class: 'ws-letters__input', dataset: { ws: 'letters-input' },
      style: { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0', fontSize: '16px' },
    });
    let target = '';
    let cells = [];
    let pos = 0;
    let done = false;

    const api = { el: wrap, mistakes: 0, hinted: false, revealed: false };

    const skipFixed = () => {
      while (pos < target.length && (!cells[pos] || cells[pos].classList.contains('is-fixed'))) pos++;
      cells.forEach((c) => c && c.classList.toggle('is-cur', c === cells[pos]));
    };

    const complete = () => {
      if (done) return;
      done = true;
      if (opts.onComplete) opts.onComplete({ mistakes: api.mistakes, hinted: api.hinted });
    };

    const feed = (ch) => {
      const c = norm(ch);
      if (done || c.trim() === '' || pos >= target.length) return;
      const cell = cells[pos];
      if (c === norm(target[pos])) {
        cell.textContent = target[pos];
        cell.classList.remove('is-hint', 'is-bad');
        cell.classList.add('is-ok');
        if (opts.onLetter) opts.onLetter(pos, true, ch);
        pos++;
        skipFixed();
        if (pos >= target.length) complete();
      } else {
        api.mistakes++;
        cell.classList.add('is-bad');
        setTimeout(() => cell.classList.remove('is-bad'), 300);
        if (opts.onLetter) opts.onLetter(pos, false, ch);
      }
    };

    const setTarget = (str, { prefix = opts.prefix } = {}) => {
      target = String(str);
      pos = 0;
      done = false;
      api.mistakes = 0;
      api.hinted = false;
      api.revealed = false;
      cells = [];
      const words = [];
      let group = null;
      [...target].forEach((ch, i) => {
        if (ch === ' ') {
          cells.push(null);
          group = null;
          return;
        }
        if (!group) {
          group = el('span', { class: 'ws-letters__word', style: { whiteSpace: 'nowrap' } });
          words.push(group);
        }
        const isFixed = fixed(ch);
        const cell = el('span', { class: ['ws-cell', isFixed && 'is-fixed'], dataset: { i }, text: isFixed ? ch : '' });
        cells.push(cell);
        group.append(cell);
      });
      wrap.replaceChildren(prefix ? el('span', { class: 'ws-letters__prefix', text: prefix }) : null, ...words, input);
      skipFixed();
      if (pos >= target.length) complete();
    };

    input.addEventListener('input', () => {
      const value = input.value;
      input.value = '';
      [...value].forEach(feed);
    }, { signal: opts.signal });

    api.focus = () => input.focus({ preventScroll: true });
    api.setTarget = setTarget;
    api.reveal = (on) => {
      api.revealed = !!on;
      if (on) api.hinted = true;
      cells.forEach((c, i) => {
        if (!c || c.classList.contains('is-ok') || c.classList.contains('is-fixed')) return;
        c.classList.toggle('is-hint', !!on);
        c.textContent = on ? target[i] : '';
      });
    };
    api.fillAll = () => {
      for (let guard = target.length; guard > 0 && pos < target.length && !done; guard--) feed(target[pos]);
    };

    if (builtin && WS.ui.keypad) {
      api.el = el('div', { class: 'ws-letters-box' }, wrap, WS.ui.keypad({ onKey: feed, signal: opts.signal }).el);
    }
    api.destroy = () => api.el.remove();
    if (opts.target != null) setTarget(opts.target);
    return api;
  };
})();

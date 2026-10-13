/* Встроенная клавиатура WordSprout (WS.ui.keypad) для тех, у кого клавиатура телефона печатает
   в клеточки странно. Три ряда QWERTY, крупные клавиши; у каждой data-ws="key" и data-key="a".
   Клавиши не забирают фокус (pointerdown/mousedown отменяются), поэтому поле для букв остаётся
   в фокусе, а системная клавиатура не выезжает (у поля inputmode="none", это делает letterInput).
   WS.ui.keypad({ onKey(key), signal }) → { el, flash(key, ok), destroy() }. */
(() => {
  'use strict';

  const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  const FLASH_MS = 220;

  WS.ui.keypad = ({ onKey = null, signal = null } = {}) => {
    const ac = new AbortController();
    const sig = ac.signal;
    const timers = new Map();

    const makeKey = (ch) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ws-key';
      b.tabIndex = -1;
      b.dataset.ws = 'key';
      b.dataset.key = ch;
      b.setAttribute('aria-label', ch);
      b.textContent = ch;
      return b;
    };

    const pad = document.createElement('div');
    pad.className = 'ws-keypad';
    pad.dataset.ws = 'keypad';
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', 'Клавиатура WordSprout');
    const keys = new Map();
    ROWS.forEach((row) => {
      const line = document.createElement('div');
      line.className = 'ws-keypad__row';
      for (const ch of row) {
        const b = makeKey(ch);
        keys.set(ch, b);
        line.append(b);
      }
      pad.append(line);
    });

    const keyOf = (e) => (e.target && e.target.closest ? e.target.closest('[data-ws=key]') : null);
    const up = () => pad.querySelectorAll('.ws-key.is-down').forEach((b) => b.classList.remove('is-down'));

    // Фокус остаётся в поле для букв: ни касание, ни мышь его не забирают.
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const b = keyOf(e);
      if (b) b.classList.add('is-down');
    }, { signal: sig });
    pad.addEventListener('mousedown', (e) => e.preventDefault(), { signal: sig });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => pad.addEventListener(type, up, { signal: sig }));
    pad.addEventListener('click', (e) => {
      const b = keyOf(e);
      if (!b || !pad.contains(b)) return;
      up();
      if (typeof onKey === 'function') onKey(b.dataset.key);
    }, { signal: sig });

    // Короткая подсветка клавиши: зелёная — буква подошла, красная — нет (это цвет, не движение,
    // поэтому и в режиме «меньше движения» она остаётся).
    const flash = (key, ok) => {
      const b = keys.get(String(key || '').toLowerCase());
      if (!b) return;
      clearTimeout(timers.get(b));
      b.classList.remove('is-ok', 'is-bad');
      void b.offsetWidth;
      b.classList.add(ok ? 'is-ok' : 'is-bad');
      timers.set(b, setTimeout(() => {
        timers.delete(b);
        b.classList.remove('is-ok', 'is-bad');
      }, FLASH_MS));
    };

    const destroy = () => {
      ac.abort();
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      pad.remove();
    };

    if (signal) {
      if (signal.aborted) destroy();
      else signal.addEventListener('abort', destroy, { once: true });
    }

    return { el: pad, flash, destroy };
  };
})();

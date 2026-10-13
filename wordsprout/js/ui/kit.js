/* Заглушка: набор элементов интерфейса WS.ui — кнопки, картинка слова, подсказка, предложение,
   сетка вариантов, полоса прогресса, звёзды, карточка, окно, вспышка ответа и кнопка «Дальше».
   Картинка пока показывает системный эмодзи без загрузки файлов. Настоящий вид сделает владелец файла. */
(() => {
  'use strict';

  const { el } = WS.util;
  const icon = (name) => el('span', { class: 'ws-icon', 'aria-hidden': 'true', html: WS.ui.icons[name] || '' });

  const button = ({ text = '', icon: iconName = '', kind = 'primary', onClick } = {}) => el('button', {
    type: 'button', class: `ws-btn ws-btn--${kind}`, onclick: onClick || null,
  }, iconName ? icon(iconName) : null, text ? el('span', { text }) : null);

  const iconButton = ({ icon: iconName, label = '', onClick, ws } = {}) => el('button', {
    type: 'button', class: 'ws-iconbtn', 'aria-label': label, title: label, dataset: { ws: ws || null },
    onclick: onClick || null,
  }, icon(iconName));

  const speakerButton = ({ text = '', slow = false } = {}) => iconButton({
    icon: slow ? 'turtle' : 'speaker', label: slow ? 'Медленно' : 'Послушать', ws: 'speak',
    onClick: () => WS.speech.speak(typeof text === 'function' ? text() : text, slow ? { rate: 0.7 } : {}),
  });

  const eyeButton = ({ onToggle } = {}) => {
    const b = iconButton({ icon: 'eye', label: 'Подсказка', ws: 'reveal' });
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      if (onToggle) onToggle(on);
    });
    return b;
  };

  const emojiChar = (code) => {
    if (!code) return '';
    const cps = String(code).split('-').map((h) => parseInt(h, 16)).filter((n) => Number.isFinite(n));
    if (!cps.length) return '';
    if (cps.length === 1 && cps[0] < 0x1f000) cps.push(0xfe0f);
    return String.fromCodePoint(...cps);
  };

  const hue = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  };

  const picture = (word, { size = 120, letter = false } = {}) => {
    const box = el('div', { class: 'ws-pic', style: { '--size': `${size}px` } });
    const ch = emojiChar(word.emoji);
    if (ch) {
      box.append(el('span', { class: 'ws-pic__emoji', role: 'img', 'aria-label': word.ru, text: ch }));
    } else {
      box.append(el('span', {
        class: 'ws-pic__tile', style: { '--hue': hue(word.id) }, text: letter ? word.ru.charAt(0) : word.ru,
      }));
    }
    return box;
  };

  const hint = (ru) => el('p', { class: 'ws-hint', text: ru, hidden: !WS.settings.get().translate });

  const sentence = (tokens, { gapNode = null, bold = false } = {}) => el('p', { class: 'ws-sentence' },
    tokens.map((tok) => {
      if (tok.gap && gapNode) return gapNode;
      if (tok.gap && bold) return el('b', { text: tok.t });
      return tok.t;
    }));

  const choiceGrid = ({ items = [], columns = 2, onPick } = {}) => {
    let locked = false;
    const grid = el('div', { class: 'ws-choices', style: { '--cols': columns } },
      items.map((it, i) => el('button', {
        type: 'button', class: 'ws-choice', dataset: { ws: 'choice', wordId: it.id, n: i + 1 },
        onclick: () => { if (!locked && onPick) onPick(it.id); },
      }, it.node || null, it.text ? el('span', { class: 'ws-choice__text', text: it.text }) : null)));
    const find = (id) => Array.from(grid.children).find((b) => b.dataset.wordId === id);
    return {
      el: grid,
      mark: (id, kind) => {
        const b = find(id);
        if (b) b.classList.add(kind === 'ok' ? 'is-ok' : 'is-bad');
      },
      lock: () => { locked = true; },
    };
  };

  const progressBar = () => {
    const fill = el('span', { class: 'ws-progress__fill', style: { width: '0%' } });
    return {
      el: el('div', { class: 'ws-progress', role: 'progressbar' }, fill),
      set: (done, total) => { fill.style.width = `${total ? Math.round((100 * done) / total) : 0}%`; },
    };
  };

  const stars = (n) => el('span', { class: 'ws-stars', 'aria-label': `Звёзды: ${n} из 3` },
    '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n)));

  const card = (...kids) => el('div', { class: 'ws-card' }, kids);

  const modal = ({ title = '', body = null, actions = [] } = {}) => {
    const box = el('div', { class: 'ws-modal', role: 'dialog', 'aria-modal': 'true' },
      el('div', { class: 'ws-modal__box' }, title ? el('h2', { text: title }) : null, body, actions));
    document.body.append(box);
    return { el: box, close: () => box.remove() };
  };

  const feedback = (node, kind) => {
    node.classList.remove('is-ok', 'is-bad');
    node.classList.add(kind === 'ok' ? 'is-ok' : 'is-bad');
  };

  const nextButton = ({ text = 'Дальше', onClick } = {}) => el('button', {
    type: 'button', class: 'ws-btn ws-btn--primary', dataset: { ws: 'next' }, text, onclick: onClick || null,
  });

  Object.assign(WS.ui, {
    button, iconButton, speakerButton, eyeButton, picture, hint, sentence, choiceGrid, progressBar, stars, card,
    modal, feedback, nextButton,
  });
  Object.defineProperty(WS.ui, 'timing', {
    enumerable: true,
    configurable: true,
    get: () => (document.documentElement.dataset.motion === 'reduce' ? { ok: 0, bad: 0 } : { ok: 700, bad: 1400 }),
  });
})();

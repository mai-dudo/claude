/* Экран «Проверка клавиатуры» (#/lab). Клеточки для букв и живой журнал событий клавиатуры:
   что присылает клавиатура телефона (keydown, beforeinput, input, composition…, вставка, фокус)
   и какие буквы клеточки приняли или отклонили. Журнал можно скопировать и отправить, если буквы
   печатаются странно. Здесь же образцы (слово, глагол с «to», предложение со знаками) и переключатель
   «Системная / WordSprout» — это настройка keyboard, она действует во всех играх. */
(() => {
  'use strict';

  const { el } = WS.util;

  const SAMPLES = [
    { id: 'word', title: 'Слово', target: 'garden', ru: 'сад', size: 'word' },
    { id: 'verb', title: 'Глагол', target: 'water', prefix: 'to', ru: 'поливать', size: 'word' },
    { id: 'sentence', title: 'Предложение', target: 'Let\'s water the garden, Tom!', ru: 'Давай польём сад, Том!',
      size: 'sentence' },
  ];
  const KEYBOARDS = [
    { value: 'system', text: 'Системная' },
    { value: 'builtin', text: 'WordSprout' },
  ];
  const WATCH = ['keydown', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend',
    'paste', 'focus', 'blur'];
  const MAX_ROWS = 400;
  const MAX_TEXT = 48;

  const media = (q) => !!(window.matchMedia && window.matchMedia(q).matches);
  const quote = (s) => {
    const str = String(s == null ? '' : s);
    return JSON.stringify(str.length > MAX_TEXT ? `${str.slice(0, MAX_TEXT)}…` : str);
  };

  WS.router.add('/lab', (view, params, query, extra) => {
    const signal = extra && extra.signal;
    const ui = WS.ui;
    const t0 = performance.now();
    const rows = []; // { time, type, text, kind }
    let sample = SAMPLES[0];
    let li = null;
    let liAc = null;

    WS.shell.setTitle('Проверка клавиатуры');
    WS.shell.setBack('#/settings');

    /* ---------- Журнал ---------- */
    const logList = el('ol', { class: 's-lab__log', dataset: { ws: 'lab-log' } });
    const emptyNote = el('p', { class: 's-lab__empty', text: 'Пока пусто. Нажми на клеточки и напечатай что-нибудь.' });

    const stamp = () => `+${((performance.now() - t0) / 1000).toFixed(3)}`;

    const log = (type, text = '', kind = 'event') => {
      const row = { time: stamp(), type, text, kind };
      rows.push(row);
      if (rows.length > MAX_ROWS) rows.shift();
      logList.prepend(el('li', { class: ['s-lab__row', `s-lab__row--${kind}`] },
        el('span', { class: 's-lab__time', text: row.time }),
        el('span', { class: 's-lab__type', text: type }),
        text ? el('span', { class: 's-lab__text', text }) : null));
      while (logList.childElementCount > MAX_ROWS) logList.lastElementChild.remove();
      emptyNote.hidden = true;
    };

    const describe = (e, input) => {
      const parts = [];
      if (e.type === 'keydown') {
        parts.push(`key=${quote(e.key)}`, `code=${e.code || '—'}`, `keyCode=${e.keyCode}`);
      } else if (e.type === 'beforeinput' || e.type === 'input') {
        parts.push(e.inputType || '(нет inputType)', `data=${e.data == null ? 'null' : quote(e.data)}`);
        if (e.type === 'beforeinput' && !e.cancelable) parts.push('нельзя отменить');
      } else if (e.type.startsWith('composition')) {
        parts.push(`data=${quote(e.data)}`);
      } else if (e.type === 'paste') {
        const text = e.clipboardData ? e.clipboardData.getData('text') : '';
        parts.push(`text=${quote(text)}`);
      }
      if (e.isComposing) parts.push('isComposing');
      if (input && e.type !== 'keydown') parts.push(`value=${quote(input.value)}`);
      return parts.join('  ');
    };

    /* ---------- Состояние и подсказки ---------- */
    const statusEl = el('p', { class: 's-lab__status', attrs: { 'aria-live': 'polite' } });
    const hintEl = ui.hint(sample.ru, { className: 's-lab__ru' });
    hintEl.hidden = false; // в проверке перевод виден всегда
    const fieldBox = el('div', { class: 's-lab__field', dataset: { ws: 'lab-field' } });

    const letters = (str) => [...str].filter((ch) => /[a-z]/i.test(ch)).length;

    const updateStatus = (extraText = '') => {
      if (!li) return;
      const total = letters(sample.target);
      const typed = letters(sample.target.slice(0, li.done ? sample.target.length : li.position || 0));
      const bits = [
        `Набрано: ${Math.min(typed, total)} из ${total}`,
        `ошибок: ${li.mistakes}`,
        `подсказка: ${li.hinted ? 'да' : 'нет'}`,
      ];
      statusEl.textContent = extraText ? `${extraText} ${bits.join(' · ')}` : bits.join(' · ');
      statusEl.classList.toggle('is-done', li.done);
    };

    const eye = ui.eyeButton({
      signal,
      onToggle: (on) => {
        if (!li) return;
        li.reveal(on);
        log('reveal', on ? 'подсказка показана' : 'подсказка скрыта', 'note');
        updateStatus();
      },
    });

    // Новое поле для образца: размер клеток (слово / предложение) задаётся при создании.
    const build = () => {
      const wasFocused = !!(li && li.el.contains(document.activeElement));
      if (liAc) liAc.abort();
      liAc = new AbortController();
      const sig = liAc.signal;
      li = ui.letterInput({
        target: sample.target,
        prefix: sample.prefix || null,
        size: sample.size,
        signal: sig,
        onLetter: (i, ok, ch) => {
          if (ok) log('принято', `«${ch}» → клетка ${i + 1}`, 'ok');
          else if (/[Ѐ-ӿ]/.test(ch)) log('отклонено', `«${ch}» — русская буква, нужна «${sample.target[i] || ''}»`, 'bad');
          else log('отклонено', `«${ch}» — нужна «${sample.target[i] || ''}»`, 'bad');
          updateStatus();
        },
        onComplete: ({ mistakes, hinted }) => {
          log('готово', `ошибок: ${mistakes}, подсказка: ${hinted ? 'да' : 'нет'}`, 'done');
          if (WS.sfx && typeof WS.sfx.ok === 'function') WS.sfx.ok();
          updateStatus('Готово!');
        },
      });
      const input = li.input;
      WATCH.forEach((type) => {
        li.el.addEventListener(type, (e) => {
          if (e.target !== input) return;
          log(e.type, describe(e, input), e.type.startsWith('composition') ? 'comp' : 'event');
        }, { capture: true, signal: sig });
      });
      fieldBox.replaceChildren(li.el);
      eye.setAttribute('aria-pressed', 'false');
      eye.classList.remove('is-on');
      eye.querySelector('.ws-icon').innerHTML = ui.icons.eye;
      hintEl.textContent = sample.ru;
      fieldBox.dataset.target = sample.target; // для тестов: что сейчас нужно напечатать
      updateStatus();
      if (wasFocused) li.focus();
    };

    /* ---------- Элементы управления ---------- */
    const samples = ui.segmented({
      label: 'Что печатать',
      options: SAMPLES.map((s) => ({ value: s.id, text: s.title })),
      value: sample.id,
      signal,
      className: 's-lab__samples',
      onChange: (id) => {
        sample = SAMPLES.find((s) => s.id === id) || SAMPLES[0];
        log('образец', sample.prefix ? `${sample.prefix} ${sample.target}` : sample.target, 'note');
        build();
      },
    });
    ui.keepFocus(samples.el);
    samples.el.querySelectorAll('button').forEach((b, i) => {
      b.dataset.ws = 'lab-sample';
      b.dataset.sample = SAMPLES[i].id;
    });

    const speaker = ui.speakerButton({ text: () => sample.target, signal });

    const restart = ui.button({
      text: 'Заново', icon: 'restart', kind: 'secondary', keepFocus: true, ws: 'lab-restart', signal,
      onClick: () => {
        log('заново', '', 'note');
        build();
        if (!ui.isTouch()) li.focus();
      },
    });

    const show = ui.button({
      text: 'Показать ответ', icon: 'lightbulb', kind: 'ghost', keepFocus: true, ws: 'lab-show', signal,
      onClick: () => {
        if (!li || li.done) return;
        li.fillAll();
        log('ответ', 'показан весь ответ', 'note');
        updateStatus();
      },
    });

    const current = () => (WS.settings && WS.settings.get ? WS.settings.get().keyboard : 'system') || 'system';
    const keyboards = ui.segmented({
      label: 'Клавиатура',
      options: KEYBOARDS,
      value: current() === 'builtin' ? 'builtin' : 'system',
      signal,
      className: 's-lab__keyboards',
      onChange: (kb) => {
        log('клавиатура', kb === 'builtin' ? 'WordSprout (встроенная)' : 'системная', 'note');
        WS.settings.set({ keyboard: kb });
      },
    });
    keyboards.el.querySelectorAll('button').forEach((b, i) => {
      b.dataset.ws = 'lab-keyboard';
      b.dataset.keyboard = KEYBOARDS[i].value;
    });
    if (WS.settings && typeof WS.settings.on === 'function') {
      const off = WS.settings.on((s) => {
        if (s && (s.keyboard === 'builtin' || s.keyboard === 'system') && keyboards.value !== s.keyboard) {
          keyboards.set(s.keyboard);
        }
      });
      if (signal) signal.addEventListener('abort', off, { once: true });
    }

    /* ---------- Устройство ---------- */
    const deviceEl = el('p', { class: 's-lab__device' });
    const deviceText = () => {
      const vv = window.visualViewport;
      const pointer = media('(pointer: coarse)') ? 'coarse' : media('(pointer: fine)') ? 'fine' : 'none';
      return [
        `Экран ${window.innerWidth}×${window.innerHeight}`,
        vv ? `видно ${Math.round(vv.width)}×${Math.round(vv.height)}` : null,
        `DPR ${window.devicePixelRatio || 1}`,
        `касание: ${navigator.maxTouchPoints || 0}`,
        `указатель: ${pointer}`,
      ].filter(Boolean).join(' · ');
    };
    const updateDevice = () => {
      deviceEl.textContent = deviceText();
    };
    let vvTimer = 0;
    const onViewport = () => {
      clearTimeout(vvTimer);
      vvTimer = setTimeout(() => {
        updateDevice();
        log('экран', deviceText(), 'note');
      }, 250);
    };
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewport, signal ? { signal } : undefined);
    else window.addEventListener('resize', onViewport, signal ? { signal } : undefined);

    /* ---------- Копирование журнала ---------- */
    const reportText = () => [
      'WordSprout — проверка клавиатуры',
      `Время: ${new Date().toISOString()}`,
      `Браузер: ${navigator.userAgent}`,
      deviceText(),
      `Клавиатура: ${current()}`,
      `Образец: ${sample.prefix ? `${sample.prefix} ` : ''}${sample.target}`,
      li ? `Ошибок: ${li.mistakes}, подсказка: ${li.hinted ? 'да' : 'нет'}, готово: ${li.done ? 'да' : 'нет'}` : '',
      '',
      ...rows.map((r) => `${r.time}  ${r.type}${r.text ? `  ${r.text}` : ''}`),
    ].join('\n');

    const copyFallback = (text) => {
      const ta = el('textarea', { class: 's-lab__clip', readOnly: true, attrs: { 'aria-hidden': 'true', tabindex: '-1' } });
      ta.value = text;
      section.append(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.remove();
      return ok;
    };

    const copy = async () => {
      const text = reportText();
      let ok = false;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(text);
          ok = true;
        }
      } catch (e) {
        ok = false;
      }
      if (!ok) ok = copyFallback(text);
      WS.shell.toast(ok ? 'Журнал скопирован' : 'Не получилось скопировать. Выдели журнал пальцем и скопируй.');
    };

    const copyBtn = ui.button({ text: 'Скопировать лог', icon: 'copy', kind: 'primary', ws: 'lab-copy', signal,
      onClick: copy });
    const clearBtn = ui.button({
      text: 'Очистить', icon: 'trash', kind: 'ghost', ws: 'lab-clear', signal,
      onClick: () => {
        rows.length = 0;
        logList.replaceChildren();
        emptyNote.hidden = false;
      },
    });

    /* ---------- Экран ---------- */
    const section = el('section', { class: 's-lab', dataset: { ws: 'screen', screen: 'lab' } },
      el('header', { class: 's-lab__head' },
        el('h1', { class: 's-lab__title', text: 'Проверка клавиатуры' }),
        el('p', { class: 's-lab__intro', text: 'Нажми на клеточки и напечатай слово. Внизу видно, что присылает '
          + 'клавиатура и какие буквы приняты. Если буквы пропадают, удваиваются или слово заменяется, '
          + 'включи клавиатуру WordSprout или скопируй журнал.' })),
      el('div', { class: 's-lab__card s-lab__try ws-card' },
        samples.el,
        hintEl,
        fieldBox,
        el('div', { class: 's-lab__actions ws-actions' }, eye, speaker, ui.spacer(), restart, show),
        statusEl),
      el('div', { class: 's-lab__card s-lab__kb ws-card' },
        el('h2', { class: 's-lab__h2', text: 'Клавиатура' }),
        keyboards.el,
        el('p', { class: 's-lab__note', text: 'WordSprout — своя клавиатура под клеточками: одна клавиша — одна буква, '
          + 'без автозамены. Выбор сохранится для всех игр.' })),
      el('div', { class: 's-lab__card s-lab__journal ws-card' },
        el('div', { class: 's-lab__journal-head' },
          el('h2', { class: 's-lab__h2', text: 'Журнал событий' }),
          el('div', { class: 's-lab__journal-actions' }, clearBtn, copyBtn)),
        el('p', { class: 's-lab__legend', text: 'Новые строки сверху. Время — в секундах с открытия экрана.' }),
        emptyNote,
        logList,
        deviceEl));

    view.append(section);
    updateDevice();
    build();

    return () => {
      if (liAc) liAc.abort();
      clearTimeout(vvTimer);
    };
  });
})();

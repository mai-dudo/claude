/* Заглушка: иконки интерфейса — простые линейные SVG-строки 24×24 (WS.ui.icons.<имя>), цвет берут
   из currentColor. Вставляются только через innerHTML. Окончательный набор нарисует владелец файла. */
(() => {
  'use strict';

  const svg = (body) => '<svg class="ws-svg" viewBox="0 0 24 24" width="24" height="24" fill="none" '
    + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" '
    + `focusable="false">${body}</svg>`;

  WS.ui.icons = {
    back: svg('<path d="M15 5l-7 7 7 7"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    speaker: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6"/>'),
    turtle: svg('<path d="M4 16a8 6 0 0 1 16 0z"/><circle cx="21" cy="14" r="1.5"/><path d="M7 16v3M17 16v3"/>'),
    eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    'eye-off': svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><path d="M4 4l16 16"/>'),
    check: svg('<path d="M5 12l5 5 9-10"/>'),
    cross: svg('<path d="M7 7l10 10M17 7L7 17"/>'),
    star: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>'),
    flame: svg('<path d="M12 21c-4 0-6-3-6-6 0-4 4-6 4-10 3 2 5 4 5 7 1-1 1-2 1-3 2 2 2 4 2 6 0 3-2 6-6 6z"/>'),
    home: svg('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
    book: svg('<path d="M4 19V5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 2h13"/>'),
    repeat: svg('<path d="M4 12a7 7 0 0 1 12-5l2 2M18 4v5h-5M20 12a7 7 0 0 1-12 5l-2-2M6 20v-5h5"/>'),
    chart: svg('<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1'
      + 'M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
    mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
    keyboard: svg('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h1M7 14h10"/>'),
    shuffle: svg('<path d="M3 7h4l10 10h4M3 17h4l3-3M14 10l3-3h4M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
    pause: svg('<path d="M9 5v14M15 5v14"/>'),
    play: svg('<path d="M7 4l13 8-13 8z"/>'),
    lightbulb: svg('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>'),
    upload: svg('<path d="M12 16V5M7 10l5-5 5 5M4 20h16"/>'),
  };
})();

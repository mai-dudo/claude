/* Заглушка: экран «Учить» (#/learn, #/learn/:level) и экран главы (#/chapter/:level/:chapterId).
   Пока переключатель уровня, список глав, карточки игр и «Скоро». */
(() => {
  'use strict';

  const { el } = WS.util;
  const LEVELS = ['easy', 'hard'];
  const levelOf = (s) => (LEVELS.includes(s) ? s : 'easy');

  WS.router.add('/learn', () => {
    WS.router.go(`#/learn/${levelOf(WS.settings.get().level)}`, { replace: true });
  });

  WS.router.add('/learn/:level', (view, { level: raw }) => {
    const level = levelOf(raw);
    WS.shell.setTitle('Учить');
    WS.shell.setBack('#/');
    view.append(el('section', { class: 's-learn', dataset: { ws: 'screen', screen: 'learn' } },
      el('h1', { class: 's-learn__title', text: 'Учить' }),
      el('div', { class: 's-learn__levels' }, LEVELS.map((l) => el('a', {
        class: ['ws-btn', l === level ? 'ws-btn--primary' : 'ws-btn--secondary'], href: `#/learn/${l}`,
        dataset: { ws: 'level', level: l }, 'aria-current': l === level ? 'true' : 'false', text: WS.t(`level.${l}`),
      }))),
      el('p', { class: 's-learn__soon', text: WS.t('soon') }),
      el('ul', { class: 's-learn__list' }, WS.data.chapters(level).map((c) => el('li', null,
        el('a', {
          class: 's-learn__tile', href: `#/chapter/${level}/${c.id}`, dataset: { ws: 'chapter-tile', chapter: c.id },
          text: `${c.ru} · ${c.en}`,
        }))))));
  });

  WS.router.add('/chapter/:level/:chapterId', (view, { level: raw, chapterId }) => {
    const level = levelOf(raw);
    const chapter = WS.data.chapter(chapterId);
    if (!chapter) {
      WS.router.go(`#/learn/${level}`, { replace: true });
      return null;
    }
    WS.shell.setTitle(chapter.ru);
    WS.shell.setBack(`#/learn/${level}`);
    view.append(el('section', { class: 's-learn s-chapter', dataset: { ws: 'screen', screen: 'chapter' } },
      el('h1', { class: 's-learn__title', text: chapter.ru }),
      el('p', { class: 's-learn__soon', text: WS.t('soon') }),
      el('ul', { class: 's-learn__games' }, WS.data.games().filter((g) => g.enabled !== false && g.scope === 'chapter')
        .map((g) => el('li', null, el('a', {
          class: 's-learn__game', href: `#/play/${level}/${chapter.id}/${g.id}`, dataset: { ws: 'game-card', game: g.id },
          text: g.title,
        }))))));
    return null;
  });
})();

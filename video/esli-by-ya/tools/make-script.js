// Writes СЦЕНАРИЙ.md and тексты/<фамилия>.txt (texts for the voice-overs) from story.json.
// Usage: node tools/make-script.js
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { buildTimeline, spoken } from '../scene/timeline.js';

const root = new URL('..', import.meta.url);
const story = JSON.parse(readFileSync(new URL('story.json', root), 'utf8'));
const tl = buildTimeline(story, null);

const PART = { problem: 'Проблема', main: 'Основная часть', solution: 'Решение' };
const tc = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const sceneTitle = (sc) =>
  sc.type === 'intro' ? 'Вступление' : sc.type === 'outro' ? 'Финал' : `${sc.num}. ${sc.topic} — ${story.cast[sc.who].name} (${story.cast[sc.who].role})`;

const out = [];
out.push(`# «${story.title}» — тексты для озвучки`, '');
out.push(`Ролик примерно на ${tc(tl.duration)} (точная длина будет после озвучки). Каждый участник озвучивает свою роль.`, '');
out.push('## Как записать', '');
out.push('1. Каждую реплику — отдельным файлом, имя файла = номер реплики: `A1.mp3`, `A2.mp3`, `M1.mp3`… Подойдут mp3, wav, m4a, ogg и голосовые из Telegram.');
out.push('2. Если удобнее одним файлом на каждого — тоже можно: читайте реплики по порядку с паузой 2 секунды между ними, я разрежу сам. Назовите файл фамилией: `Гутко.mp3`.');
out.push('3. Цифры уже расписаны словами — читайте как написано. Тише фон, ближе микрофон, без музыки.');
out.push('4. Темп — спокойный, как будто рассказываете другу. Паузы на тире и многоточиях.', '');

out.push('## Кто кого озвучивает', '');
out.push('| Код | Участник | Роль | Как читать |', '| --- | --- | --- | --- |');
for (const [k, c] of Object.entries(story.cast)) out.push(`| ${k} | ${c.name} | ${c.role} | ${c.voice} |`);
out.push('');

out.push('## Тексты по персонажам', '', 'Это то, что нужно прочитать. Номер реплики = имя файла.', '');
for (const [k, c] of Object.entries(story.cast)) {
  out.push(`### ${c.name} — ${c.role}`, '', `_Как читать: ${c.voice.toLowerCase()}._`, '');
  for (const l of tl.lines.filter((l) => l.who === k)) out.push(`- **${l.id}** — ${spoken(l)}`);
  out.push('');
}

out.push('## Весь сценарий по порядку', '', 'Чтобы понимать, кто за кем говорит и что в это время на экране.', '');
for (const sc of tl.scenes) {
  if (sc.type === 'sources') {
    out.push(`### Источники (${tc(sc.start)}) — без голоса, на экране список источников`, '');
    continue;
  }
  out.push(`### ${sceneTitle(sc)} (${tc(sc.start)})`, '');
  let part = null;
  for (const l of sc.lines) {
    if (l.part && l.part !== part) {
      part = l.part;
      if (out[out.length - 1] !== '') out.push('');
      out.push(`**${PART[part]}**`, '');
    }
    out.push(`- \`${l.id}\` **${story.cast[l.who].name}:** ${l.text}`);
  }
  out.push('');
}

writeFileSync(new URL('СЦЕНАРИЙ.md', root), out.join('\n'));

// One plain-text file per person to read from while recording.
mkdirSync(new URL('тексты/', root), { recursive: true });
for (const [k, c] of Object.entries(story.cast)) {
  const own = tl.lines.filter((l) => l.who === k);
  const txt = [
    `${c.name} — ${c.role}`,
    `Как читать: ${c.voice.toLowerCase()}.`,
    '',
    'Как записать: читай реплики по порядку, между репликами пауза 2 секунды.',
    `Можно одним файлом (назови его «${c.name}») или каждую реплику отдельным файлом (имя = номер, например ${own[0].id}).`,
    'Цифры уже написаны словами — читай как написано. Номера реплик вслух не читай.',
    '',
    ...own.flatMap((l) => [`${l.id}. ${spoken(l)}`, '']),
  ];
  writeFileSync(new URL(`тексты/${c.name}.txt`, root), '﻿' + txt.join('\r\n'));
}

console.log(`СЦЕНАРИЙ.md: ${tl.lines.length} реплик, ~${tc(tl.duration)}`);

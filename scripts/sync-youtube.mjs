#!/usr/bin/env node
// Обновляет data/videos.json роликами канала YouTube. Ключ API не нужен: читается RSS-лента канала
// (последние 15 роликов). Запуск: node scripts/sync-youtube.mjs UCxxxxxxxxxxxxxxxxxxxxxx
// ID канала виден в адресе канала или в его исходном коде (channelId). Пример: node scripts/sync-youtube.mjs UCx4UpJ6nzW50T_Dg9MvhwLQ
import { writeFile } from 'node:fs/promises';

const channelId = process.argv[2];
if (!channelId || !/^UC[\w-]{22}$/.test(channelId)) {
  console.error('Укажите ID канала вида UC…, например: node scripts/sync-youtube.mjs UCx4UpJ6nzW50T_Dg9MvhwLQ');
  process.exit(1);
}

const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
if (!res.ok) {
  console.error(`YouTube ответил HTTP ${res.status}`);
  process.exit(1);
}
const xml = await res.text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, e]) => {
  const pick = (tag) => (e.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1] || '';
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return { id: pick('yt:videoId'), title: decode(pick('title')), published: pick('published') };
}).filter((v) => v.id);

await writeFile(new URL('../data/videos.json', import.meta.url), `${JSON.stringify({ videos: entries }, null, 2)}\n`);
console.log(`Записано роликов: ${entries.length}`);

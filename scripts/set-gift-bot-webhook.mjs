#!/usr/bin/env node
// Направляет обновления бота «КД подарка» в функцию api/gift-bot.js на Vercel.
// Запуск: GIFT_BOT_TOKEN=… GIFT_BOT_SECRET=… node scripts/set-gift-bot-webhook.mjs https://ваш-сайт.vercel.app
// Токен и секрет те же, что в переменных проекта Vercel. Секрет: латиница, цифры, _ и -, например openssl rand -hex 32.
const base = process.argv[2];
const { GIFT_BOT_TOKEN: token, GIFT_BOT_SECRET: secret } = process.env;
if (!base || !/^https:\/\//.test(base) || !token || !secret) {
  console.error('Нужны адрес сайта и переменные: GIFT_BOT_TOKEN=… GIFT_BOT_SECRET=… node scripts/set-gift-bot-webhook.mjs https://ваш-сайт.vercel.app');
  process.exit(1);
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `${base.replace(/\/+$/, '')}/api/gift-bot`,
    secret_token: secret,
    allowed_updates: ['message', 'business_connection'],
    drop_pending_updates: true,
  }),
});
const data = await res.json();
if (!data.ok) {
  console.error(`Telegram ответил: ${data.description}`);
  process.exit(1);
}
console.log('Вебхук установлен.');

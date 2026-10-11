// Тесты бота «КД подарка»: node --test tests/gift-bot.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { createBot, extractSlugs, formatLeft } from '../api/gift-bot.js';

const NOW = 1_790_000_000_000;
const USER = { id: 111, first_name: 'Owner' };
const BC = { id: 'bc-1', user: USER, user_chat_id: 111, date: 1, is_enabled: true, rights: { can_view_gifts_and_stars: true } };
const PEPE_PAGE = '<meta property="og:title" content="Plush Pepe #1"><table class="table tgme_gift_table"><tbody>'
  + '<tr><th>Owner</th><td><i class="x"><img src="a.jpg"></i><span dir="auto">Pavel &amp; Co</span></td></tr>'
  + '<tr><th>Model</th><td>Pumpkin <mark>3%</mark></td></tr></tbody></table>';

const uniqueGift = (name, { gift, ...extra } = {}) => ({
  type: 'unique',
  owned_gift_id: `owned-${name}`,
  send_date: 1,
  gift: { gift_id: '1', base_name: name.split('-')[0], name, number: Number(name.split('-')[1]), ...gift },
  ...extra,
});

// Подменяет fetch: отвечает за Telegram, Upstash и t.me, записывает вызовы.
function setup({ stored = 'bc-1', connection = BC, gifts = [], pages = { 'PlushPepe-1': PEPE_PAGE } } = {}) {
  const calls = { sent: [], redis: [], tg: [], pages: [] };
  const fetch = async (url, init = {}) => {
    const json = (data, status = 200) => ({ status, ok: status < 400, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.startsWith('https://redis.test')) {
      const command = JSON.parse(init.body);
      calls.redis.push(command);
      return json({ result: command[0] === 'GET' ? stored : 'OK' });
    }
    if (url.startsWith('https://api.telegram.org/')) {
      const method = url.split('/').pop();
      const params = JSON.parse(init.body);
      calls.tg.push(method);
      if (method === 'sendMessage') { calls.sent.push(params); return json({ ok: true, result: {} }); }
      if (method === 'getBusinessConnection') {
        return connection ? json({ ok: true, result: connection }) : json({ ok: false, description: 'Bad Request: connection not found' }, 400);
      }
      if (method === 'getBusinessAccountGifts') return json({ ok: true, result: { total_count: gifts.length, gifts } });
    }
    if (url.startsWith('https://t.me/nft/')) {
      const slug = decodeURIComponent(url.split('/').pop());
      calls.pages.push(slug);
      const page = pages[slug];
      return page ? { status: 200, text: async () => page } : { status: 302, text: async () => '' };
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  const bot = createBot({ token: 'T', redisUrl: 'https://redis.test', redisToken: 'R', fetch, now: () => NOW });
  const send = (text, extra = {}) => bot.handleUpdate({ message: { chat: { id: 111, type: 'private' }, from: USER, text, ...extra } });
  return { bot, calls, send };
}

test('extractSlugs finds links, tg:// links, hidden links and bare slugs', () => {
  assert.deepEqual(extractSlugs({ text: 'глянь https://t.me/nft/PlushPepe-1, и t.me/nft/plushpepe-1' }), ['PlushPepe-1']);
  assert.deepEqual(extractSlugs({ text: 'tg://nft?slug=Durovs-Cap-12 telegram.me/nft/JellyBunny-7' }), ['Durovs-Cap-12', 'JellyBunny-7']);
  assert.deepEqual(extractSlugs({ text: 'вот', entities: [{ type: 'text_link', offset: 0, length: 3, url: 'https://t.me/nft/SantaHat-5' }] }), ['SantaHat-5']);
  assert.deepEqual(extractSlugs({ text: ' PlushPepe-1 ' }), ['PlushPepe-1']);
  assert.deepEqual(extractSlugs({ text: 'привет' }), []);
  const many = Array.from({ length: 8 }, (_, i) => `t.me/nft/Gift-${i}`).join(' ');
  assert.equal(extractSlugs({ text: many }).length, 5);
});

test('formatLeft prints days, hours and minutes', () => {
  assert.equal(formatLeft(30), 'меньше минуты');
  assert.equal(formatLeft(2 * 86400 + 3 * 3600 + 5 * 60 + 9), '2 д 3 ч 5 мин');
  assert.equal(formatLeft(3600), '1 ч');
});

test('owned gift in cooldown shows time left and unlock date', async () => {
  const until = NOW / 1000 + 2 * 86400 + 3 * 3600 + 60;
  const { send, calls } = setup({ gifts: [uniqueGift('PlushPepe-1', { next_transfer_date: until, transfer_star_count: 25 })] });
  await send('https://t.me/nft/PlushPepe-1');
  const { text } = calls.sent[0];
  assert.match(text, /PlushPepe #1<\/b> — ваш подарок/);
  assert.match(text, /КД на передачу: ещё 2 д 3 ч 1 мин/);
  assert.match(text, /Передать можно будет \d\d\.\d\d\.\d{4}, \d\d:\d\d GMT\+3/);
  assert.match(text, /Передача стоит 25 ⭐/);
  assert.deepEqual(calls.pages, [], 'public page is not needed for owned gifts');
});

test('owned gift with past or missing date has no cooldown', async () => {
  const { send, calls } = setup({ gifts: [uniqueGift('PlushPepe-1', { next_transfer_date: NOW / 1000 - 10 })] });
  await send('t.me/nft/PlushPepe-1');
  assert.match(calls.sent[0].text, /КД на передачу нет/);
});

test('gift assigned from blockchain is reported as locked', async () => {
  const { send, calls } = setup({ gifts: [uniqueGift('PlushPepe-1', { gift: { is_from_blockchain: true } })] });
  await send('t.me/nft/PlushPepe-1');
  assert.match(calls.sent[0].text, /блокчейна TON/);
  assert.doesNotMatch(calls.sent[0].text, /КД на передачу/);
});

test('without connection the bot shows public info and how to connect', async () => {
  const { send, calls } = setup({ stored: null });
  await send('t.me/nft/PlushPepe-1');
  const { text } = calls.sent[0];
  assert.match(text, /Plush Pepe #1/);
  assert.match(text, /Владелец: Pavel &amp; Co/);
  assert.match(text, /видит только его владелец/);
  assert.match(text, /Telegram для бизнеса/);
  assert.ok(!calls.tg.includes('getBusinessAccountGifts'));
});

test('connected owner asking about someone else\'s gift gets public info', async () => {
  const { send, calls } = setup({ gifts: [uniqueGift('JellyBunny-7')] });
  await send('t.me/nft/PlushPepe-1');
  assert.match(calls.sent[0].text, /видит только его владелец/);
  assert.doesNotMatch(calls.sent[0].text, /Telegram для бизнеса/);
});

test('connection without the gifts right asks to enable it', async () => {
  const { send, calls } = setup({ connection: { ...BC, rights: {} } });
  await send('t.me/nft/PlushPepe-1');
  assert.match(calls.sent[0].text, /нет права на просмотр подарков/);
  assert.ok(!calls.tg.includes('getBusinessAccountGifts'));
});

test('stored connection of another user is ignored', async () => {
  const { send, calls } = setup({ connection: { ...BC, user: { id: 999 } }, gifts: [uniqueGift('PlushPepe-1')] });
  await send('t.me/nft/PlushPepe-1');
  assert.match(calls.sent[0].text, /Telegram для бизнеса/);
  assert.ok(!calls.tg.includes('getBusinessAccountGifts'));
});

test('unknown gift is reported as not found', async () => {
  const { send, calls } = setup({ stored: null });
  await send('t.me/nft/PlushPepe-999999');
  assert.match(calls.sent[0].text, /не найден/);
});

test('message without links gets help; groups are ignored', async () => {
  const { send, bot, calls } = setup();
  await send('/start');
  assert.match(calls.sent[0].text, /Пришлите ссылку/);
  await bot.handleUpdate({ message: { chat: { id: -5, type: 'group' }, from: USER, text: 't.me/nft/PlushPepe-1' } });
  assert.equal(calls.sent.length, 1);
});

test('business_connection updates are stored and confirmed', async () => {
  const { bot, calls } = setup();
  await bot.handleUpdate({ business_connection: BC });
  assert.deepEqual(calls.redis.at(-1), ['SET', 'giftbot:bc:111', 'bc-1']);
  assert.match(calls.sent.at(-1).text, /Бот подключён/);

  await bot.handleUpdate({ business_connection: { ...BC, is_enabled: false } });
  assert.deepEqual(calls.redis.at(-1), ['DEL', 'giftbot:bc:111']);
  assert.match(calls.sent.at(-1).text, /отключён/);
});

test('webhook rejects requests without the secret', async () => {
  Object.assign(process.env, {
    GIFT_BOT_TOKEN: 'T', GIFT_BOT_SECRET: 's3cret', UPSTASH_REDIS_REST_URL: 'https://redis.test', UPSTASH_REDIS_REST_TOKEN: 'R',
  });
  const res = { code: 0, status(c) { this.code = c; return this; }, end() { return this; }, json() { return this; } };
  await handler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, body: {} }, res);
  assert.equal(res.code, 401);
  await handler({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 's3cret' }, body: {} }, res);
  assert.equal(res.code, 200);
});
